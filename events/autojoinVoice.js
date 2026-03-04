import { ChannelType, PermissionFlagsBits, Events, AuditLogEvent } from "discord.js";
import {
  joinVoiceChannel,
  getVoiceConnection,
  VoiceConnectionStatus,
  entersState,
} from "@discordjs/voice";

const VOICE_CHANNEL_ID_PADRAO = "1415386915137388664";

// ===== Castigo =====
const PUNISH_DAYS = 7;
const PUNISH_MS = PUNISH_DAYS * 24 * 60 * 60 * 1000;

// ===== Reconnect =====
const READY_TIMEOUT = 45_000;
const GRACE_IF_SIGNALLING = 20_000;
const MONITOR_INTERVAL = 60_000;
const ENSURE_INTERVAL = 3 * 60_000;

const RECONNECT_MIN_DELAY = 30_000;
const RECONNECT_MAX_DELAY = 120_000;

const log = (...a) => console.log("🎧 [AutoJoin]", ...a);
const warn = (...a) => console.warn("⚠️ [AutoJoin]", ...a);
const err = (...a) => console.error("❌ [AutoJoin]", ...a);
const debug = log; // ✅ resolve teu erro: debug agora existe

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
  return (
    !!conn &&
    conn.joinConfig?.channelId === channelId &&
    conn.state.status === VoiceConnectionStatus.Ready
  );
}

// ===== Debounce de reconnect (pra não virar metralhadora) =====
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
  if (client.__autojoinReconnectTimer) return;

  const backoff = getBackoff(client);
  const delay = clamp(backoff, RECONNECT_MIN_DELAY, RECONNECT_MAX_DELAY);
  setBackoff(client, clamp(backoff * 1.6, RECONNECT_MIN_DELAY, RECONNECT_MAX_DELAY));

  client.__autojoinReconnectWhy = why;
  debug(`Reconnect em ${delay}ms (${why})`);

  client.__autojoinReconnectTimer = setTimeout(() => {
    client.__autojoinReconnectTimer = null;
    ensureConnection(client, `reconnect:${why}`).catch(() => {});
  }, delay);
}

async function punishIfSomeoneDisconnectedBot(guild, botId) {
  // precisa de VIEW_AUDIT_LOG no bot
  // tenta achar quem desconectou/moveu o bot nos últimos segundos
  try {
    const now = Date.now();
    const typesToCheck = [AuditLogEvent.MemberDisconnect, AuditLogEvent.MemberMove];

    let entry = null;

    for (const type of typesToCheck) {
      const logs = await guild.fetchAuditLogs({ type, limit: 6 }).catch(() => null);
      if (!logs) continue;

      const found = logs.entries.find((e) => {
        const created = e.createdTimestamp ?? 0;
        const targetId = e.target?.id;
        return targetId === botId && now - created <= 15_000; // 15s de janela
      });

      if (found) {
        entry = found;
        break;
      }
    }

    if (!entry) return; // não achou culpado (provável queda normal)

    const executor = entry.executor;
    if (!executor) return;

    const member = await guild.members.fetch(executor.id).catch(() => null);
    if (!member) return;

    // 1) desconecta da call (se estiver em voz)
    if (member.voice?.channelId) {
      await member.voice.disconnect().catch(() => {});
    }

    // 2) timeout 7 dias (precisa MODERATE_MEMBERS)
    // discord permite até 28 dias
    await member.timeout(PUNISH_MS, `Desconectou o bot da call (${PUNISH_DAYS}d castigo).`).catch(() => {});

    warn(`Castigo aplicado em ${executor.tag} (${executor.id}) — ${PUNISH_DAYS} dias.`);
  } catch (e) {
    // se não tiver perm ou audit log falhar
    warn("Não consegui aplicar castigo (auditlog/permissões).", e?.message ?? e);
  }
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
    // pra castigo funcionar:
    if (!guild.members.me?.permissions?.has(PermissionFlagsBits.ViewAuditLog)) {
      warn("Sem VIEW_AUDIT_LOG — não dá pra saber quem desconectou o bot.");
    }
    if (!guild.members.me?.permissions?.has(PermissionFlagsBits.ModerateMembers)) {
      warn("Sem MODERATE_MEMBERS — não dá pra dar timeout (castigo).");
    }
    if (!guild.members.me?.permissions?.has(PermissionFlagsBits.MoveMembers)) {
      warn("Sem MOVE_MEMBERS — não dá pra desconectar a pessoa da call.");
    }

    let conn = getVoiceConnection(guild.id);

    if (isReadyInChannel(conn, canal.id)) {
      clearReconnectTimer(client);
      setBackoff(client, RECONNECT_MIN_DELAY);
      return;
    }

    // dá chance se estiver conectando
    if (
      conn &&
      (conn.state.status === VoiceConnectionStatus.Signalling ||
        conn.state.status === VoiceConnectionStatus.Connecting)
    ) {
      debug(`Conexão em ${conn.state.status}. Aguardando ${GRACE_IF_SIGNALLING}ms...`);
      try {
        await entersState(conn, VoiceConnectionStatus.Ready, GRACE_IF_SIGNALLING);
        debug("Virou READY ✅ (sem recriar)");
        clearReconnectTimer(client);
        setBackoff(client, RECONNECT_MIN_DELAY);
        return;
      } catch {
        debug("Não virou READY no grace. Vou recriar.");
      }
    }

    if (conn) {
      debug(`Conexão existe mas não está READY (status=${conn.state.status}). Destroy...`);
      try { conn.destroy(); } catch {}
      await wait(1500);
    }

    debug(`Conectando no canal: ${canal.name} (${canal.id}) [${reason}]`);

    conn = joinVoiceChannel({
      channelId: canal.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: true, // ✅ costuma ajudar em estabilidade
      selfMute: false,
    });

    // listener 1x por conexão
    if (!conn.__autojoinBound) {
      conn.__autojoinBound = true;

      conn.on("stateChange", (oldState, newState) => {
        if (oldState.status === newState.status) return;
        debug(`stateChange: ${oldState.status} -> ${newState.status}`);

        if (newState.status === VoiceConnectionStatus.Disconnected) {
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
      warn(`Não ficou READY em ${READY_TIMEOUT}ms (status=${conn.state.status}).`);
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

  debug("Guards ativados (monitor + anti-move + castigo).");

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

  // anti-move + detectar disconnect do bot
  if (!client.__autojoinVoiceStateHook) {
    client.__autojoinVoiceStateHook = true;

    client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
      if (!client.user || newState.id !== client.user.id) return;

      const oldCh = oldState.channelId;
      const newCh = newState.channelId;
      if (oldCh === newCh) return;

      debug(`Estado de voz do bot alterado: ${oldCh ?? "Nenhum"} -> ${newCh ?? "Nenhum"}`);

      // se moveram o bot pra canal errado, volta
      if (newCh && newCh !== VOICE_CHANNEL_ID_PADRAO) {
        warn("[Anti-Move] Bot movido pra canal errado. Forçando retorno...");
        setTimeout(() => ensureConnection(client, "moved_to_wrong_channel").catch(() => {}), 1500);
        return;
      }

      // se desconectaram o bot (newCh = null)
      if (!newCh && oldCh) {
        warn("[Anti-Move] Bot desconectado. Vou tentar punir quem fez e voltar pra call.");

        // tenta achar e punir culpado (se tiver audit log)
        const guild = oldState.guild;
        await punishIfSomeoneDisconnectedBot(guild, client.user.id);

        // volta pra call
        scheduleReconnectOnce(client, "bot_disconnected");
        return;
      }
    });
  }
}

export function iniciarAutoJoin(client) {
  if (client.__autoJoinStarted) return;
  client.__autoJoinStarted = true;

  log("Módulo carregado (vFinal - debug ok + castigo 7d).");

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