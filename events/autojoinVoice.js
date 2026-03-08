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
let lastConnectAttempt = 0; // 🔒 Cooldown para evitar loop

// Logs simples
const log = (...a) => console.log("🎧 [AutoJoin]", ...a);
const warn = (...a) => console.warn("⚠️ [AutoJoin]", ...a);

// Função de espera
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Função principal de conexão
async function connectToVoice(client) {
  // 🔒 TRAVA DE SEGURANÇA: Se tentou conectar há menos de 10 segundos, ignora.
  if (Date.now() - lastConnectAttempt < 10000) return;
  lastConnectAttempt = Date.now();

  if (isConnecting) return;
  isConnecting = true;

  try {
    // 1. Busca o canal
    const channel = await client.channels.fetch(VOICE_CHANNEL_ID_PADRAO).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildVoice) {
      console.error(`[AutoJoin] ❌ Canal de voz ${VOICE_CHANNEL_ID_PADRAO} não encontrado ou inválido.`);
      // Se não achou o canal, não tem o que fazer.
      isConnecting = false;
      return;
    }

    const guild = channel.guild;
    const connection = getVoiceConnection(guild.id);
    
    // 2. Verifica se já está tudo certo (Conexão interna OK + Bot no canal certo)
    const isInternalReady = connection && connection.state.status === VoiceConnectionStatus.Ready;
    const isInternalSameChannel = connection && connection.joinConfig.channelId === channel.id;

    if (isInternalReady && isInternalSameChannel) {
        // ✅ OTIMIZAÇÃO: Se internamente está OK, verifica API com cautela.
        // Se a API falhar (erro de rede), confiamos no interno e NÃO reconectamos.
        try {
             const me = await guild.members.fetch({ user: client.user.id, force: true });
             if (me.voice.channelId === channel.id) {
                 isConnecting = false;
                 return; // Tudo 100% certo
             }
             // Se a API diz que tá em outro canal (ou null), deixa seguir pra corrigir.
        } catch (e) {
             // Erro na API? Assume que tá tudo bem pra não derrubar a call.
             isConnecting = false;
             return;
        }
    }

    // 3. Se existe conexão mas está errada (outro canal ou travada), destrói
    if (connection) {
      const isSameChannel = connection.joinConfig.channelId === channel.id;

      if (isSameChannel) {
          // Se não está Ready e nem Destroyed (está tentando conectar/sinalizar)
          if (connection.state.status !== VoiceConnectionStatus.Ready && 
              connection.state.status !== VoiceConnectionStatus.Destroyed) {
              try {
                 // Espera até 15s para estabilizar
                 await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
                 isConnecting = false;
                 return;
              } catch {
                 // Timeout: travou. Destrói para tentar limpo.
                 try { connection.destroy(); } catch {}
                 await wait(1000);
              }
          }
          // ✅ SE ESTIVER READY: NÃO DESTRÓI. Deixa o joinVoiceChannel abaixo apenas reforçar a conexão.
      } else {
          // Canal errado, destrói
          // try { connection.destroy(); } catch {} // ⚠️ Removido destroy agressivo
          await wait(1000);
      }
    }

    // 4. Cria nova conexão
    const newConnection = joinVoiceChannel({
      channelId: channel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: false, // ✅ CORRIGIDO: false para não entrar ensurdecido
      selfMute: false, // ✅ CORRIGIDO: false para não entrar mutado
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
            // Se falhar, deixa o loop principal (setInterval) resolver depois.
            // Não destrói aqui para evitar o evento "VoiceStateUpdate" de saída.
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

    // Espera um pouco para o audit log aparecer
    await wait(3000); // Aumentado para 3s para garantir log

    const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberDisconnect, limit: 1 }).catch(() => null);
    if (!logs) return;

    const entry = logs.entries.first();
    if (!entry) return;

    // Se o alvo foi o bot e aconteceu agora (últimos 15s)
    if (entry.target?.id === botId && Date.now() - entry.createdTimestamp < 15000) {
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

  log("Sistema V9 (Ultra Stable - Long Check) iniciado.");

  // Tenta conectar ao ligar
  if (client.isReady()) connectToVoice(client);
  else client.once(Events.ClientReady, () => connectToVoice(client));

  // Monitor de eventos (Anti-Move / Anti-Kick)
  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    // Só nos importamos com o bot
    if (oldState.member?.id !== client.user.id) return;

    // Caso 1: Bot desconectado (saiu de um canal para null)
    if (oldState.channelId && !newState.channelId) {
      // Verifica punição
      await checkPunishment(oldState.guild, client.user.id);
      // Reconecta
      await wait(10000); // ⏳ Espera 10s antes de voltar (mais seguro)
      connectToVoice(client);
    }
    // Caso 2: Bot movido para canal errado
    else if (newState.channelId && newState.channelId !== VOICE_CHANNEL_ID_PADRAO) {
      // warn("Bot movido. Voltando...");
      await wait(2000);
      connectToVoice(client);
    }
  });

  // Loop de verificação (Health Check) a cada 5 minutos
  // Aumentado drasticamente para evitar conflitos se a conexão estiver estável
  setInterval(() => {
    if (client.isReady()) connectToVoice(client);
  }, 300_000);
}