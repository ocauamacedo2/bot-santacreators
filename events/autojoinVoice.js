import { ChannelType, PermissionFlagsBits, Events, AuditLogEvent } from "discord.js";
import {
  joinVoiceChannel,
  getVoiceConnection,
  VoiceConnectionStatus,
  entersState,
} from "@discordjs/voice";

const VOICE_CHANNEL_ID_PADRAO = "1415386915137388664";
const PUNISH_DAYS = 7;

// Variável para evitar múltiplas tentativas simultâneas
let isConnecting = false;

// Logs simples
const log = (...a) => console.log("🎧 [AutoJoin]", ...a);
const warn = (...a) => console.warn("⚠️ [AutoJoin]", ...a);

// Função de espera
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Função principal de conexão
async function connectToVoice(client) {
  if (isConnecting) return;
  isConnecting = true;

  try {
    // 1. Busca o canal
    const channel = await client.channels.fetch(VOICE_CHANNEL_ID_PADRAO).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildVoice) {
      // Se não achou o canal, não tem o que fazer.
      isConnecting = false;
      return;
    }

    const guild = channel.guild;
    const connection = getVoiceConnection(guild.id);

    // 2. Verifica se já está tudo certo
    if (connection && connection.state.status === VoiceConnectionStatus.Ready && connection.joinConfig.channelId === channel.id) {
      // Tudo ok, nada a fazer
      isConnecting = false;
      return;
    }

    // 3. Se existe conexão mas está errada (outro canal ou travada), destrói
    if (connection) {
      // Se estiver no canal certo mas conectando/sinalizando, espera um pouco (não mata o processo)
      if (connection.joinConfig.channelId === channel.id && 
          (connection.state.status === VoiceConnectionStatus.Signalling || connection.state.status === VoiceConnectionStatus.Connecting)) {
          try {
             await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
             isConnecting = false;
             return;
          } catch {}
      }

      try { connection.destroy(); } catch {}
      await wait(500); // Espera limpar rápido
    }

    // 4. Cria nova conexão
    const newConnection = joinVoiceChannel({
      channelId: channel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: false,
    });

    // Listener extra para falhas de rede (tenta recuperar antes de morrer)
    newConnection.on(VoiceConnectionStatus.Disconnected, async () => {
        try {
            await Promise.race([
                entersState(newConnection, VoiceConnectionStatus.Signalling, 5_000),
                entersState(newConnection, VoiceConnectionStatus.Connecting, 5_000),
            ]);
            // Reconectando...
        } catch (error) {
            try { newConnection.destroy(); } catch {}
        }
    });

    // 5. Aguarda ficar READY
    try {
      await entersState(newConnection, VoiceConnectionStatus.Ready, 20_000);
      log(`Conectado e estável em: ${channel.name}`);
    } catch (error) {
      // Se falhar, destrói silenciosamente para tentar de novo no próximo ciclo
      try { newConnection.destroy(); } catch {}
    }

  } catch (e) {
    console.error("[AutoJoin] Erro:", e);
  } finally {
    isConnecting = false;
  }
}

// Função para punir quem desconecta o bot
async function checkPunishment(guild, botId) {
  try {
    const me = guild.members.me;
    if (!me?.permissions.has(PermissionFlagsBits.ViewAuditLog)) return;

    const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberDisconnect, limit: 1 }).catch(() => null);
    if (!logs) return;

    const entry = logs.entries.first();
    if (!entry) return;

    // Se o alvo foi o bot e aconteceu agora (últimos 10s)
    if (entry.target?.id === botId && Date.now() - entry.createdTimestamp < 5000) {
      const executor = entry.executor;
      if (executor && !executor.bot) {
        const member = await guild.members.fetch(executor.id).catch(() => null);
        if (member) {
          await member.timeout(PUNISH_DAYS * 24 * 60 * 60 * 1000, "Desconectou o bot de voz").catch(() => null);
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

  log("Sistema V4 (Ultra Stable) iniciado.");

  // Tenta conectar ao ligar
  if (client.isReady()) connectToVoice(client);
  else client.once(Events.ClientReady, () => connectToVoice(client));

  // Monitor de eventos (Anti-Move / Anti-Kick)
  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    // Só nos importamos com o bot
    if (oldState.member?.id !== client.user.id) return;

    // Caso 1: Bot desconectado
    if (oldState.channelId && !newState.channelId) {
      // warn("Bot caiu da call."); // Silenciado para evitar flood no console
      await checkPunishment(oldState.guild, client.user.id);
      // Reconecta IMEDIATAMENTE (sem wait)
      connectToVoice(client);
    }
    // Caso 2: Bot movido para canal errado
    else if (newState.channelId && newState.channelId !== VOICE_CHANNEL_ID_PADRAO) {
      warn("Bot movido. Voltando...");
      connectToVoice(client);
    }
  });

  // Loop de verificação (Health Check) a cada 15s (mais rápido)
  // Garante que o bot volte se algo falhar silenciosamente
  setInterval(() => {
    if (client.isReady()) connectToVoice(client);
  }, 15_000);
}