import { ChannelType, PermissionFlagsBits, Events } from "discord.js";
import {
  joinVoiceChannel,
  getVoiceConnection,
  VoiceConnectionStatus,
  entersState,
} from "@discordjs/voice";

const VOICE_CHANNEL_ID_PADRAO = "1415386915137388664";

// tempos
const READY_TIMEOUT = 45_000;
const GRACE_IF_SIGNALLING = 20_000; // espera antes de destruir se estiver negociando
const MONITOR_INTERVAL = 60_000;    // 60s
const ENSURE_INTERVAL = 3 * 60_000; // 3 min

const RECONNECT_MIN_DELAY = 30_000;
const RECONNECT_MAX_DELAY = 120_000;

const log = (...a) => console.log("🎧 [AutoJoin]", ...a);
const warn = (...a) => console.warn("⚠️ [AutoJoin]", ...a);
const err = (...a) => console.error("❌ [AutoJoin]", ...a);

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

async function fetchVoiceChannel(client) {
  const canal = await client.channels.fetch(VOICE_CHANNEL_ID_PADRAO).catch(() => null);
  if (!canal) return { ok: false, reason: "not_found" };
  if (canal.type !== ChannelType.GuildVoice) return { ok: false, reason: "not_voice" };
  return { ok: true, canal };
}

function isReadyInChannel(conn, channelId) {
  return !!conn &&
    conn.joinConfig?.channelId === channelId &&
    conn.state.status === VoiceConnectionStatus.Ready;
}

function getBackoff(client) {
  if (!client.__autojoinBackoff) client.__autojoinBackoff = RECONNECT_MIN_DELAY;
  return client.__autojoinBackoff;
}
function setBackoff(client, v) {
  client.__autojoinBackoff = v;
}

function clearReconnectTimer(client) {
  if (client.__autojoinReconnectTimer) {
    clearTimeout(client.__autojoinReconnectTimer);
    client.__autojoinReconnectTimer = null;
  }
  client.__autojoinReconnectWhy = null;
}

function scheduleReconnectOnce(client, why) {
  // ✅ só 1 reconnect pendente
  if (client.__autojoinReconnectTimer) return;

  const backoff = getBackoff(client);
  const delay = clamp(backoff, RECONNECT_MIN_DELAY, RECONNECT_MAX_DELAY);
  setBackoff(client, clamp(backoff * 1.6, RECONNECT_MIN_DELAY, RECONNECT_MAX_DELAY));

  client.__autojoinReconnectWhy = why;
  log(`Reconnect em ${delay}ms (${why})`);

  client.__autojoinReconnectTimer = setTimeout(() => {
    client.__autojoinReconnectTimer = null;
    ensureConnection(client, `reconnect:${why}`).catch(() => {});
  }, delay);
}

async function ensureConnection(client, reason = "ensure") {
  if (client.__autojoinLock) return;
  client.__autojoinLock = true;

  try {
    const result = await fetchVoiceChannel(client);
    if (!result.ok) {
      if (result.reason === "not_found") err("Canal não encontrado. ID:", VOICE_CHANNEL_ID_PADRAO);
      else err("O canal informado não é GuildVoice.");
      return;
    }

    const canal = result.canal;
    const guild = canal.guild;
    if (!guild) return err("Não consegui pegar a guild pelo canal.");

    const me = guild.members.me ?? (await guild.members.fetch(client.user.id).catch(() => null));
    if (!me) return err("Não consegui buscar o member do bot na guild.");

    const perms = canal.permissionsFor(me);
    if (!perms?.has(PermissionFlagsBits.ViewChannel)) return err("Sem VIEW_CHANNEL no canal.");
    if (!perms?.has(PermissionFlagsBits.Connect)) return err("Sem CONNECT no canal.");
    if (!perms?.has(PermissionFlagsBits.Speak)) warn("Sem SPEAK (entra, mas não fala).");

    let conn = getVoiceConnection(guild.id);

    // ✅ já está READY no canal certo? então acabou.
    if (isReadyInChannel(conn, canal.id)) {
      clearReconnectTimer(client);
      setBackoff(client, RECONNECT_MIN_DELAY);
      return;
    }

    // ✅ se existe conexão mas tá negociando, dá uma chance ANTES de destruir
    if (conn && (conn.state.status === VoiceConnectionStatus.Signalling || conn.state.status === VoiceConnectionStatus.Connecting)) {
      log(`Conexão em ${conn.state.status}. Aguardando até ${GRACE_IF_SIGNALLING}ms antes de recriar...`);
      try {
        await entersState(conn, VoiceConnectionStatus.Ready, GRACE_IF_SIGNALLING);
        log("Virou READY ✅ (sem recriar)");
        clearReconnectTimer(client);
        setBackoff(client, RECONNECT_MIN_DELAY);
        return;
      } catch {
        log("Não virou READY no grace. Vou recriar.");
      }
    }

    // se existe conexão ruim, destrói
    if (conn) {
      log(`Conexão existe mas não está READY (status=${conn.state.status}). Destroy...`);
      try { conn.destroy(); } catch {}
      await wait(1500);
    }

    log(`Conectando no canal: ${canal.name} (${canal.id}) [${reason}]`);

    conn = joinVoiceChannel({
      channelId: canal.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: false,
    });

    // ✅ listeners 1x por conexão (evita spam)
    if (!conn.__autojoinBound) {
      conn.__autojoinBound = true;

      conn.on("stateChange", (oldState, newState) => {
        const o = oldState.status, n = newState.status;
        if (o === n) return;
        log(`stateChange: ${o} -> ${n}`);

        // Se desconectar, agenda reconexão (sem loop)
        if (n === VoiceConnectionStatus.Disconnected) {
          scheduleReconnectOnce(client, "disconnected");
        }
      });
    }

    try {
      await entersState(conn, VoiceConnectionStatus.Ready, READY_TIMEOUT);
      log("Conectado e READY ✅");
      clearReconnectTimer(client);
      setBackoff(client, RECONNECT_MIN_DELAY);
    } catch {
      warn(`Não ficou READY em ${READY_TIMEOUT}ms (ficou em ${conn.state.status}).`);
      // ✅ não fica insistindo em loop imediato: agenda reconexão com backoff
      scheduleReconnectOnce(client, `not_ready:${conn.state.status}`);
    }

    attachGuards(client, guild.id);
  } catch (e) {
    err("Erro no ensureConnection:", e);
    scheduleReconnectOnce(client, "exception");
  } finally {
    client.__autojoinLock = false;
  }
}

function attachGuards(client, guildId) {
  if (client.__autojoinGuardsAttached) return;
  client.__autojoinGuardsAttached = true;

  log("Guards ativados (monitor + anti-move).");

  // monitor
  client.__autojoinMonitor && clearInterval(client.__autojoinMonitor);
  client.__autojoinMonitor = setInterval(() => {
    const conn = getVoiceConnection(guildId);
    if (!conn) {
      scheduleReconnectOnce(client, "no_connection");
      return;
    }
    const st = conn.state.status;
    if (st !== VoiceConnectionStatus.Ready) {
      scheduleReconnectOnce(client, `status:${st}`);
    }
  }, MONITOR_INTERVAL);

  // anti-move
  if (!client.__autojoinVoiceStateHook) {
    client.__autojoinVoiceStateHook = true;

    client.on(Events.VoiceStateUpdate, (oldState, newState) => {
      if (!client.user || newState.id !== client.user.id) return;

      const oldCh = oldState.channelId;
      const newCh = newState.channelId;
      if (oldCh === newCh) return;

      warn(`Estado de voz do bot alterado: ${oldCh ?? "Nenhum"} -> ${newCh ?? "Nenhum"}`);

      // movido pra canal errado -> tenta voltar (mas sem spam)
      if (newCh && newCh !== VOICE_CHANNEL_ID_PADRAO) {
        warn("[Anti-Move] Bot movido. Vou garantir retorno…");
        setTimeout(() => ensureConnection(client, "moved_to_wrong_channel").catch(() => {}), 1500);
        return;
      }

      // desconectado -> monitor já resolve (sem loop)
      if (!newCh) {
        warn("[Anti-Move] Bot desconectado. Monitor vai reconectar.");
      }
    });
  }
}

export function iniciarAutoJoin(client) {
  if (client.__autoJoinStarted) return;
  client.__autoJoinStarted = true;

  log("Módulo carregado (v3 - debounce reconnect + grace signalling).");

  const run = async () => {
    log("Client READY — iniciando autojoin...");
    await ensureConnection(client, "startup");

    client.__autojoinEnsureInterval && clearInterval(client.__autojoinEnsureInterval);
    client.__autojoinEnsureInterval = setInterval(() => {
      ensureConnection(client, "interval").catch(() => {});
    }, ENSURE_INTERVAL);
  };

  if (client.isReady()) run();
  else client.once(Events.ClientReady, run);
}