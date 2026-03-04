import { ChannelType, PermissionFlagsBits, Events, AuditLogEvent } from "discord.js";
import {
  joinVoiceChannel,
  getVoiceConnection,
  VoiceConnectionStatus,
  entersState,
} from "@discordjs/voice";

const VOICE_CHANNEL_ID_PADRAO = "1415386915137388664";

// ===== Castigo (só quando for audit log REAL) =====
const PUNISH_DAYS = 7;
const PUNISH_MS = PUNISH_DAYS * 24 * 60 * 60 * 1000;

// ===== Conexão =====
const READY_TIMEOUT = 45_000;
const GRACE_IF_SIGNALLING = 25_000;   // dá mais chance no handshake
const MONITOR_INTERVAL = 90_000;      // monitor mais lento (1m30)
const ENSURE_INTERVAL = 10 * 60_000;  // interval bem mais lento (10 min)

// ===== Backoff =====
const RECONNECT_MIN_DELAY = 60_000;   // 1 min
const RECONNECT_MAX_DELAY = 15 * 60_000; // 15 min
const MAX_FAILS_BEFORE_COOLDOWN = 5;  // após 5 falhas seguidas...
const COOLDOWN_MS = 30 * 60_000;      // ...para por 30 min pra não floodar host

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
  return (
    !!conn &&
    conn.joinConfig?.channelId === channelId &&
    conn.state.status === VoiceConnectionStatus.Ready
  );
}

// ===== Estado interno anti-flood =====
function getState(client) {
  client.__autojoinState ??= {
    backoff: RECONNECT_MIN_DELAY,
    reconnectTimer: null,
    fails: 0,
    cooldownUntil: 0,
    internalDisconnect: false, // ✅ marca quando nós mesmos derrubamos
  };
  return client.__autojoinState;
}

function clearReconnectTimer(client) {
  const st = getState(client);
  if (st.reconnectTimer) clearTimeout(st.reconnectTimer);
  st.reconnectTimer = null;
}

function scheduleReconnectOnce(client, why) {
  const st = getState(client);

  // cooldown ativo → não tenta
  if (Date.now() < st.cooldownUntil) return;

  // já tem reconnect pendente
  if (st.reconnectTimer) return;

  const delay = clamp(st.backoff, RECONNECT_MIN_DELAY, RECONNECT_MAX_DELAY);
  st.backoff = clamp(Math.floor(st.backoff * 1.6), RECONNECT_MIN_DELAY, RECONNECT_MAX_DELAY);

  log(`Reconnect em ${delay}ms (${why})`);
  st.reconnectTimer = setTimeout(() => {
    st.reconnectTimer = null;
    ensureConnection(client, `reconnect:${why}`).catch(() => {});
  }, delay);
}

async function punishIfSomeoneDisconnectedBot(guild, botId) {
  // ✅ Só pune se tiver audit log REAL apontando executor
  try {
    const me = await guild.members.fetchMe().catch(() => null);
    if (!me) return;

    if (!me.permissions.has(PermissionFlagsBits.ViewAuditLog)) return;
    if (!me.permissions.has(PermissionFlagsBits.ModerateMembers)) return;
    if (!me.permissions.has(PermissionFlagsBits.MoveMembers)) return;

    const now = Date.now();
    const typesToCheck = [AuditLogEvent.MemberDisconnect, AuditLogEvent.MemberMove];

    let entry = null;

    for (const type of typesToCheck) {
      const logs = await guild.fetchAuditLogs({ type, limit: 6 }).catch(() => null);
      if (!logs) continue;

      const found = logs.entries.find((e) => {
        const created = e.createdTimestamp ?? 0;
        const targetId = e.target?.id;
        return targetId === botId && now - created <= 15_000;
      });

      if (found) {
        entry = found;
        break;
      }
    }

    if (!entry?.executor) return;

    const member = await guild.members.fetch(entry.executor.id).catch(() => null);
    if (!member) return;

    // desconecta da voz (se tiver)
    if (member.voice?.channelId) await member.voice.disconnect().catch(() => {});

    // timeout 7 dias
    await member.timeout(PUNISH_MS, `Desconectou o bot da call (${PUNISH_DAYS}d castigo).`).catch(() => {});

    warn(`Castigo aplicado em ${entry.executor.tag} — ${PUNISH_DAYS} dias.`);
  } catch (e) {
    warn("Falha ao aplicar castigo (auditlog/perms).", e?.message ?? e);
  }
}

async function ensureConnection(client, reason = "ensure") {
  const st = getState(client);

  // cooldown
  if (Date.now() < st.cooldownUntil) {
    // sem flood
    return;
  }

  // lock
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

    // já está OK
    if (isReadyInChannel(conn, canal.id)) {
      st.fails = 0;
      st.backoff = RECONNECT_MIN_DELAY;
      clearReconnectTimer(client);
      return;
    }

    // se já existe conexão negociando, dá chance e NÃO destrói
    if (
      conn &&
      (conn.state.status === VoiceConnectionStatus.Signalling ||
        conn.state.status === VoiceConnectionStatus.Connecting)
    ) {
      log(`Conexão em ${conn.state.status}. Aguardando ${GRACE_IF_SIGNALLING}ms...`);
      try {
        await entersState(conn, VoiceConnectionStatus.Ready, GRACE_IF_SIGNALLING);
        log("Virou READY ✅");
        st.fails = 0;
        st.backoff = RECONNECT_MIN_DELAY;
        clearReconnectTimer(client);
        return;
      } catch {
        // falhou, mas NÃO destrói aqui → só agenda reconnect
        warn(`Ainda não virou READY (status=${conn.state.status}). Vou agendar nova tentativa.`);
        st.fails += 1;
        if (st.fails >= MAX_FAILS_BEFORE_COOLDOWN) {
          st.cooldownUntil = Date.now() + COOLDOWN_MS;
          warn(`Entrando em COOLDOWN ${Math.round(COOLDOWN_MS / 60000)}min (evitar flood).`);
          return;
        }
        scheduleReconnectOnce(client, `still_${conn.state.status}`);
        return;
      }
    }

    // se existe conexão bugada (disconnected/destroyed/etc) aí sim destrói
    if (conn) {
      st.internalDisconnect = true;
      try { conn.destroy(); } catch {}
      await wait(1200);
      st.internalDisconnect = false;
    }

    log(`Conectando no canal: ${canal.name} (${canal.id}) [${reason}]`);

    conn = joinVoiceChannel({
      channelId: canal.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: false,
    });

    // listener 1x por conexão
    if (!conn.__autojoinBound) {
      conn.__autojoinBound = true;

      conn.on("stateChange", (oldState, newState) => {
        if (oldState.status === newState.status) return;

        // LOG bem mais curto (sem flood)
        log(`stateChange: ${oldState.status} -> ${newState.status}`);

        if (newState.status === VoiceConnectionStatus.Disconnected) {
          scheduleReconnectOnce(client, "disconnected");
        }
      });
    }

    try {
      await entersState(conn, VoiceConnectionStatus.Ready, READY_TIMEOUT);
      log("Conectado e READY ✅");
      st.fails = 0;
      st.backoff = RECONNECT_MIN_DELAY;
      clearReconnectTimer(client);
    } catch {
      warn(`Não ficou READY em ${READY_TIMEOUT}ms (status=${conn.state.status}).`);
      st.fails += 1;

      if (st.fails >= MAX_FAILS_BEFORE_COOLDOWN) {
        st.cooldownUntil = Date.now() + COOLDOWN_MS;
        warn(`Entrando em COOLDOWN ${Math.round(COOLDOWN_MS / 60000)}min (evitar flood).`);
        return;
      }

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

  log("Guards ativados (monitor + anti-move + castigo).");

  // monitor
  client.__autojoinMonitor && clearInterval(client.__autojoinMonitor);
  client.__autojoinMonitor = setInterval(() => {
    const st = getState(client);
    if (Date.now() < st.cooldownUntil) return;

    const conn = getVoiceConnection(guildId);
    if (!conn) {
      scheduleReconnectOnce(client, "no_connection");
      return;
    }

    if (conn.state.status !== VoiceConnectionStatus.Ready) {
      scheduleReconnectOnce(client, `status:${conn.state.status}`);
    }
  }, MONITOR_INTERVAL);

  // voiceStateUpdate
  if (!client.__autojoinVoiceStateHook) {
    client.__autojoinVoiceStateHook = true;

    client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
      if (!client.user || newState.id !== client.user.id) return;

      const oldCh = oldState.channelId;
      const newCh = newState.channelId;
      if (oldCh === newCh) return;

      const st = getState(client);

      // mudou
      log(`Estado de voz do bot: ${oldCh ?? "Nenhum"} -> ${newCh ?? "Nenhum"}`);

      // movido pra outro canal → volta
      if (newCh && newCh !== VOICE_CHANNEL_ID_PADRAO) {
        warn("[Anti-Move] Bot movido. Vou garantir retorno...");
        setTimeout(() => ensureConnection(client, "moved_to_wrong_channel").catch(() => {}), 1500);
        return;
      }

      // desconectado (newCh null)
      if (!newCh && oldCh) {
        // ✅ se foi interno (reconnect/destroy), NÃO pune ninguém
        if (st.internalDisconnect) {
          scheduleReconnectOnce(client, "internal_disconnect");
          return;
        }

        warn("[Anti-Move] Bot desconectado. Vou tentar punir (se audit log confirmar) e voltar.");
        await punishIfSomeoneDisconnectedBot(oldState.guild, client.user.id);

        scheduleReconnectOnce(client, "bot_disconnected");
        return;
      }
    });
  }
}

export function iniciarAutoJoin(client) {
  if (client.__autoJoinStarted) return;
  client.__autoJoinStarted = true;

  log("Módulo carregado (anti-flood + cooldown).");

  const run = async () => {
    log("Client READY — iniciando autojoin...");
    await ensureConnection(client, "startup");

    // interval bem mais lento (não precisa bater 3/3 min)
    client.__autojoinEnsureInterval && clearInterval(client.__autojoinEnsureInterval);
    client.__autojoinEnsureInterval = setInterval(() => {
      ensureConnection(client, "interval").catch(() => {});
    }, ENSURE_INTERVAL);
  };

  if (client.isReady()) run();
  else client.once(Events.ClientReady, run);
}