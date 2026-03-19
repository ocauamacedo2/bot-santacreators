import { ChannelType, PermissionFlagsBits, Events, AuditLogEvent } from "discord.js";
import {
  joinVoiceChannel,
  getVoiceConnection,
  VoiceConnectionStatus,
  entersState,
} from "@discordjs/voice";

const VOICE_CHANNEL_ID_PADRAO = "1415386915137388664";
const PUNISH_DAYS = 7;

const HEALTHCHECK_MS = 90_000;
const RECONNECT_DELAY_MS = 8_000;
const CONNECT_COOLDOWN_MS = 10_000;
const STABILIZE_TIMEOUT_MS = 60_000;

let isConnecting = false;
let lastConnectAttempt = 0;
let reconnectTimer = null;
let boundConnection = null;
let intentionalDestroy = false;
let lastStableAt = 0;
let lastSoftHealthyAt = 0;
const logCooldowns = new Map();

// Logs
const log = (...a) => console.log("🎧 [AutoJoin]", ...a);
const warn = (...a) => console.warn("⚠️ [AutoJoin]", ...a);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function warnOnce(key, message, cooldownMs = 60_000) {
  const now = Date.now();
  const last = logCooldowns.get(key) || 0;
  if (now - last >= cooldownMs) {
    logCooldowns.set(key, now);
    warn(message);
  }
}

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect(client, delay = RECONNECT_DELAY_MS, reason = "sem motivo") {
  if (reconnectTimer) return;

  warn(`Reconexão agendada em ${delay}ms | motivo: ${reason}`);

  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    await connectToVoice(client, reason);
  }, delay);
}

function cleanupBoundConnection() {
  if (!boundConnection) return;

  try {
    if (boundConnection.__scOnStateChange) {
      boundConnection.off("stateChange", boundConnection.__scOnStateChange);
    }
    if (boundConnection.__scOnError) {
      boundConnection.off("error", boundConnection.__scOnError);
    }
  } catch {}

  boundConnection.__scOnStateChange = null;
  boundConnection.__scOnError = null;
  boundConnection = null;
}

async function destroyConnectionSafely(connection, waitMs = 1500) {
  if (!connection) return;

  intentionalDestroy = true;
  try { connection.destroy(); } catch {}
  await wait(waitMs);
  intentionalDestroy = false;
}

function bindConnectionEvents(connection, client) {
  if (!connection) return;
  if (boundConnection === connection) return;

  cleanupBoundConnection();
  boundConnection = connection;

const onStateChange = async (oldState, newState) => {
  if (newState.status !== VoiceConnectionStatus.Signalling && newState.status !== VoiceConnectionStatus.Connecting) {
    log(`stateChange: ${oldState.status} -> ${newState.status}`);
  }

    if (newState.status === VoiceConnectionStatus.Ready) {
      lastStableAt = Date.now();
      clearReconnectTimer();
      return;
    }

    if (newState.status === VoiceConnectionStatus.Disconnected) {
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 8_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 8_000),
        ]);
        log("Conexão entrou em recuperação natural após Disconnected.");
        return;
      } catch {
        if (intentionalDestroy) return;

        warn("Disconnected sem recuperação natural. Reagendando reconexão.");
        scheduleReconnect(client, 8_000, "Disconnected sem recovery");
        return;
      }
    }

    if (newState.status === VoiceConnectionStatus.Destroyed) {
      if (intentionalDestroy) return;
      scheduleReconnect(client, 8_000, "Connection Destroyed");
    }
  };

  const onError = (error) => {
    console.error("[AutoJoin] Voice connection error:", error);
    if (intentionalDestroy) return;
    scheduleReconnect(client, 8_000, "Erro na voice connection");
  };

  connection.__scOnStateChange = onStateChange;
  connection.__scOnError = onError;

  connection.on("stateChange", onStateChange);
  connection.on("error", onError);
}

async function connectToVoice(client, reason = "manual") {
  if (isConnecting) return;

  const now = Date.now();
  if (now - lastConnectAttempt < CONNECT_COOLDOWN_MS) {
    return;
  }

  lastConnectAttempt = now;
  isConnecting = true;

  try {
    const channel = await client.channels.fetch(VOICE_CHANNEL_ID_PADRAO).catch(() => null);

    if (
      !channel ||
      (channel.type !== ChannelType.GuildVoice && channel.type !== ChannelType.GuildStageVoice)
    ) {
      console.error(`[AutoJoin] ❌ Canal ${VOICE_CHANNEL_ID_PADRAO} não encontrado ou inválido.`);
      return;
    }

    const guild = channel.guild;
    const me = guild.members.me ?? await guild.members.fetch(client.user.id).catch(() => null);
    const connection = getVoiceConnection(guild.id);

    const botChannelId = me?.voice?.channelId ?? null;
    const connStatus = connection?.state?.status ?? null;
    const connChannelId = connection?.joinConfig?.channelId ?? null;

 if (
  connection &&
  connChannelId === channel.id &&
  botChannelId === channel.id
) {
  bindConnectionEvents(connection, client);

  if (connStatus === VoiceConnectionStatus.Ready) {
    lastStableAt = Date.now();
    lastSoftHealthyAt = Date.now();
    return;
  }

  if (
    connStatus === VoiceConnectionStatus.Signalling ||
    connStatus === VoiceConnectionStatus.Connecting
  ) {
    lastSoftHealthyAt = Date.now();
    return;
  }
}

 if (connection) {
  const sameTarget = connChannelId === channel.id;
  const ready = connStatus === VoiceConnectionStatus.Ready;
  const botAlreadyThere = botChannelId === channel.id;

  if (sameTarget && ready && !botAlreadyThere) {
    warnOnce(
      "ready-mismatch",
      "Conexão interna Ready, mas gateway não confirma bot no canal. Limpando.",
      30_000
    );
    await destroyConnectionSafely(connection, 1500);
  } else if (!sameTarget || connStatus === VoiceConnectionStatus.Destroyed) {
    warnOnce(
      "invalid-connection",
      `Conexão antiga inválida (${connStatus ?? "sem status"}). Limpando.`,
      30_000
    );
    await destroyConnectionSafely(connection, 1500);
  } else if (
  sameTarget &&
  botAlreadyThere &&
  (
    connStatus === VoiceConnectionStatus.Signalling ||
    connStatus === VoiceConnectionStatus.Connecting
  )
) {
  lastSoftHealthyAt = Date.now();
  bindConnectionEvents(connection, client);
  return;
}
}

    log(`Conectando ao canal de voz (${reason}): ${channel.name}`);

    const newConnection = joinVoiceChannel({
  channelId: channel.id,
  guildId: guild.id,
  adapterCreator: guild.voiceAdapterCreator,
  selfDeaf: false,
  selfMute: false,
  group: "default",
});

bindConnectionEvents(newConnection, client);

try {
  await entersState(newConnection, VoiceConnectionStatus.Ready, STABILIZE_TIMEOUT_MS);
  lastStableAt = Date.now();
  lastSoftHealthyAt = Date.now();
  log(`✅ Conectado e estável em: ${channel.name}`);
  clearReconnectTimer();
} catch (err) {
  const currentBotChannelId = guild.members.me?.voice?.channelId ?? null;
  const currentConnChannelId = newConnection?.joinConfig?.channelId ?? null;

if (err?.name === "AbortError" || err?.code === "ABORT_ERR") {
  if (currentBotChannelId === channel.id && currentConnChannelId === channel.id) {
    lastSoftHealthyAt = Date.now();
    return;
  }

  warnOnce(
    "join-not-ready",
    "Novo join não ficou Ready a tempo e o bot não estabilizou no canal. Vou tentar de novo depois.",
    30_000
  );
  scheduleReconnect(client, 20_000, "Novo join não estabilizou a tempo");
  return;
}

  throw err;
}
} catch (e) {
  if (e?.name === "AbortError" || e?.code === "ABORT_ERR") {
    // silencioso: se o bot já estiver no canal, o healthcheck segura
  } else {
    console.error("[AutoJoin] Erro em connectToVoice:", e);
    scheduleReconnect(client, 20_000, "Falha no connectToVoice");
  }
} finally {
  isConnecting = false;
}
}

async function checkPunishment(guild, botId) {
  try {
    const me = guild.members.me;
    if (!me?.permissions.has(PermissionFlagsBits.ViewAuditLog)) return;

    await wait(3000);

    const logs = await guild
      .fetchAuditLogs({ type: AuditLogEvent.MemberDisconnect, limit: 1 })
      .catch(() => null);

    if (!logs) return;

    const entry = logs.entries.first();
    if (!entry) return;

    if (entry.target?.id === botId && Date.now() - entry.createdTimestamp < 15000) {
      const executor = entry.executor;
      if (executor && !executor.bot) {
        const member = await guild.members.fetch(executor.id).catch(() => null);
        if (member) {
          await member
            .timeout(
              PUNISH_DAYS * 24 * 60 * 60 * 1000,
              "Desconectou o bot de voz"
            )
            .catch(() => null);

          warn(`PUNIÇÃO APLICADA: ${executor.tag} desconectou o bot.`);
        }
      }
    }
  } catch (e) {
    console.error("[AutoJoin] Erro ao punir:", e);
  }
}

export function iniciarAutoJoin(client) {
  if (client.__autoJoinStarted) return;
  client.__autoJoinStarted = true;

  log("Sistema V10 (Stable Fixed) iniciado.");

  const boot = () => connectToVoice(client, "boot");

  if (client.isReady()) boot();
  else client.once(Events.ClientReady, boot);

  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    if (oldState.member?.id !== client.user.id) return;

    const saiuDoCanal = oldState.channelId && !newState.channelId;
    const foiMovidoPraErrado =
      newState.channelId && newState.channelId !== VOICE_CHANNEL_ID_PADRAO;

    if (saiuDoCanal) {
  if (intentionalDestroy) return;

  warn(`Bot saiu da call. old=${oldState.channelId} new=${newState.channelId}`);
  await checkPunishment(oldState.guild, client.user.id);
  scheduleReconnect(client, 8_000, "VoiceStateUpdate detectou saída");
  return;
}

if (foiMovidoPraErrado) {
  if (intentionalDestroy) return;

  warn(`Bot foi movido para canal errado (${newState.channelId}). Voltando.`);
  scheduleReconnect(client, 5_000, "VoiceStateUpdate detectou move");
}
  });

  setInterval(async () => {
    try {
      if (!client.isReady()) return;

      const channel = await client.channels.fetch(VOICE_CHANNEL_ID_PADRAO).catch(() => null);
      if (
        !channel ||
        (channel.type !== ChannelType.GuildVoice && channel.type !== ChannelType.GuildStageVoice)
      ) {
        return;
      }

      const guild = channel.guild;
      const me = guild.members.me ?? await guild.members.fetch(client.user.id).catch(() => null);
      const connection = getVoiceConnection(guild.id);

      const botChannelId = me?.voice?.channelId ?? null;
      const connStatus = connection?.state?.status ?? null;
      const connChannelId = connection?.joinConfig?.channelId ?? null;

      const hardHealthy =
  connection &&
  connStatus === VoiceConnectionStatus.Ready &&
  connChannelId === channel.id &&
  botChannelId === channel.id;

const softHealthy =
  connection &&
  connChannelId === channel.id &&
  botChannelId === channel.id &&
  (
    connStatus === VoiceConnectionStatus.Signalling ||
    connStatus === VoiceConnectionStatus.Connecting
  );

const recentlyStable = lastStableAt && (Date.now() - lastStableAt < 300_000);
const recentlySoftHealthy = lastSoftHealthyAt && (Date.now() - lastSoftHealthyAt < 300_000);

if (hardHealthy) {
  lastStableAt = Date.now();
  lastSoftHealthyAt = Date.now();
  return;
}

if (softHealthy) {
  lastSoftHealthyAt = Date.now();
  return;
}

if (recentlyStable || recentlySoftHealthy) {
  return;
}

warnOnce(
  "health-failed",
  `Healthcheck falhou | connStatus=${connStatus ?? "null"} connChannel=${connChannelId ?? "null"} botChannel=${botChannelId ?? "null"}`,
  60_000
);
scheduleReconnect(client, 20_000, "Healthcheck");
    } catch (e) {
      console.error("[AutoJoin] Erro no healthcheck:", e);
    }
  }, HEALTHCHECK_MS);
}