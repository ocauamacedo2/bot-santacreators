import { ChannelType, PermissionFlagsBits, Events, AuditLogEvent } from "discord.js";
import {
  joinVoiceChannel,
  getVoiceConnection,
  VoiceConnectionStatus,
  entersState,
} from "@discordjs/voice";

const VOICE_CHANNEL_ID_PADRAO = "1415386915137388664";

// Configurações de tempo e comportamento
const CONFIG = {
  CONNECT_TIMEOUT: 30_000,       // Tempo máx para conectar (30s)
  RECONNECT_DELAY: 15_000,       // Tempo de espera antes de tentar reconectar (15s)
  HEALTH_CHECK_INTERVAL: 60_000, // Verifica status a cada 1 min
  PUNISH_DAYS: 7,                // Dias de castigo para quem desconectar o bot
};

// Logs controlados
const log = (...a) => console.log("🎧 [AutoJoin]", ...a);
const warn = (...a) => console.warn("⚠️ [AutoJoin]", ...a);
const err = (...a) => console.error("❌ [AutoJoin]", ...a);

// Estado local
const STATE = {
  isConnecting: false,
  reconnectTimer: null,
};

// ============================================================================
// HELPERS
// ============================================================================

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchVoiceChannel(client) {
  try {
    const channel = await client.channels.fetch(VOICE_CHANNEL_ID_PADRAO).catch(() => null);
    if (!channel) return null;
    if (channel.type !== ChannelType.GuildVoice) return null;
    return channel;
  } catch {
    return null;
  }
}

// ============================================================================
// PUNIÇÃO (Audit Log)
// ============================================================================

async function checkAndPunishDisconnect(guild, botId) {
  try {
    const me = guild.members.me;
    if (!me?.permissions.has(PermissionFlagsBits.ViewAuditLog)) return;

    // Busca logs recentes de desconexão
    const logs = await guild.fetchAuditLogs({
      type: AuditLogEvent.MemberDisconnect,
      limit: 3,
    }).catch(() => null);

    if (!logs) return;

    const now = Date.now();
    // Procura um log onde o alvo foi o bot, criado nos últimos 15 segundos
    const entry = logs.entries.find(
      (e) => e.target?.id === botId && now - e.createdTimestamp < 15_000
    );

    if (entry && entry.executor) {
      const executor = await guild.members.fetch(entry.executor.id).catch(() => null);
      if (executor && !executor.user.bot) {
        // Aplica castigo
        await executor.timeout(
          CONFIG.PUNISH_DAYS * 24 * 60 * 60 * 1000,
          "Desconectou o bot de música/autojoin."
        ).catch(() => null);
        
        warn(`Usuário ${executor.user.tag} punido por desconectar o bot.`);
      }
    }
  } catch (e) {
    // Silencioso se falhar permissão ou api
  }
}

// ============================================================================
// CORE CONNECTION LOGIC
// ============================================================================

async function connectToVoice(client) {
  // Evita múltiplas tentativas simultâneas
  if (STATE.isConnecting) return;
  STATE.isConnecting = true;

  try {
    const channel = await fetchVoiceChannel(client);
    if (!channel) {
      // Se não achou o canal, tenta de novo em breve
      scheduleReconnect(client);
      return;
    }

    const guild = channel.guild;
    const adapterCreator = guild.voiceAdapterCreator;

    // Verifica conexão existente
    let connection = getVoiceConnection(guild.id);

    // Se já existe e está READY no canal certo, tudo ok
    if (connection && connection.state.status === VoiceConnectionStatus.Ready && connection.joinConfig.channelId === channel.id) {
      // log("Conexão estável e ativa.");
      return;
    }

    // Se existe mas está em estado ruim ou canal errado, destrói para recriar limpo
    if (connection) {
      try { connection.destroy(); } catch {}
      await wait(1000); // Espera limpeza
    }

    // Cria nova conexão
    connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: guild.id,
      adapterCreator: adapterCreator,
      selfDeaf: true, // Importante para economizar recursos e indicar status
      selfMute: false,
    });

    // Monitora eventos da conexão
    setupConnectionListeners(client, connection, guild.id);

    // Aguarda ficar READY
    try {
      await entersState(connection, VoiceConnectionStatus.Ready, CONFIG.CONNECT_TIMEOUT);
      log(`Conectado com sucesso em: ${channel.name}`);
    } catch (error) {
      warn("Falha ao conectar (timeout). Reiniciando...");
      try { connection.destroy(); } catch {}
      scheduleReconnect(client);
    }

  } catch (e) {
    err("Erro fatal no connectToVoice:", e);
    scheduleReconnect(client);
  } finally {
    STATE.isConnecting = false;
  }
}

function setupConnectionListeners(client, connection, guildId) {
  // Remove listeners antigos se houver (embora destroy() deva limpar)
  connection.removeAllListeners("stateChange");
  connection.removeAllListeners("error");

  connection.on("stateChange", async (oldState, newState) => {
    // log(`Status: ${oldState.status} -> ${newState.status}`);

    if (newState.status === VoiceConnectionStatus.Disconnected) {
      // Tenta reconectar se cair
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
        // Se voltou para signalling/connecting, deixa o fluxo seguir
      } catch (e) {
        // Se ficou disconnected por 5s, assume queda real
        try { connection.destroy(); } catch {}
        scheduleReconnect(client);
      }
    } else if (newState.status === VoiceConnectionStatus.Destroyed) {
      // Se foi destruído, agenda reconexão
      scheduleReconnect(client);
    }
  });

  connection.on("error", (error) => {
    warn("Erro na conexão de voz:", error.message);
    try { connection.destroy(); } catch {}
    scheduleReconnect(client);
  });
}

function scheduleReconnect(client) {
  if (STATE.reconnectTimer) return; // Já agendado

  STATE.reconnectTimer = setTimeout(() => {
    STATE.reconnectTimer = null;
    connectToVoice(client);
  }, CONFIG.RECONNECT_DELAY);
}

// ============================================================================
// EXPORTS
// ============================================================================

export function iniciarAutoJoin(client) {
  if (client.__autoJoinStarted) return;
  client.__autoJoinStarted = true;

  log("Sistema iniciado (Modo Profissional v2).");

  // 1. Tenta conectar ao iniciar
  if (client.isReady()) {
    connectToVoice(client);
  } else {
    client.once(Events.ClientReady, () => connectToVoice(client));
  }

  // 2. Monitor de integridade (Health Check)
  // Garante que o bot volte se algo muito estranho acontecer
  setInterval(() => {
    if (!client.isReady()) return;
    const connection = getVoiceConnection(client.guilds.cache.first()?.id); // Assume 1 guild principal ou ajusta lógica
    
    // Se não tem conexão ou não está ready, força reconexão
    if (!connection || connection.state.status !== VoiceConnectionStatus.Ready) {
      // log("Health Check: Conexão ausente ou instável. Reconectando...");
      connectToVoice(client);
    }
  }, CONFIG.HEALTH_CHECK_INTERVAL);

  // 3. Monitor de VoiceState (Anti-Move / Anti-Kick)
  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    // Filtra apenas eventos do bot
    if (oldState.member?.id !== client.user.id) return;

    // Se foi desconectado (channelId null)
    if (oldState.channelId && !newState.channelId) {
      warn("Bot desconectado da voz.");
      
      // Verifica se foi kickado por alguém
      if (oldState.guild) {
        await checkAndPunishDisconnect(oldState.guild, client.user.id);
      }
      
      // Reconecta imediatamente (sem esperar o health check)
      scheduleReconnect(client);
    }
    
    // Se foi movido para outro canal
    else if (newState.channelId && newState.channelId !== VOICE_CHANNEL_ID_PADRAO) {
      warn("Bot movido de canal. Retornando...");
      // Desconecta do canal errado para forçar reconexão no certo
      const connection = getVoiceConnection(newState.guild.id);
      if (connection) try { connection.destroy(); } catch {}
      scheduleReconnect(client);
    }
  });
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