import { AuditLogEvent, ChannelType, EmbedBuilder } from "discord.js";

// ================== CONFIGURAÇÃO DE LOGS ==================
const MAIN_GUILD_ID = '1262262852782129183'; // Servidor Principal (Santa Creators)
const CENTRAL_LOG_CHANNEL_ID = '1377813851860504647'; // Canal central para logs de criação

// Mapeamento de Guild ID para Canal de Log Local
const LOCAL_LOG_CHANNELS = {
  '1262262852782129183': '1377813851860504647', // Principal (logs no próprio canal central)
  '1362899773992079533': '1363295055384809483', // Cidade Santa -> #sc-logs
  '1452416085751234733': '1455312395269443813', // Administração -> #sc-logs
  // Adicione outros servidores e seus canais de log aqui
};
// ==========================================================

const TIMEZONE = "America/Sao_Paulo";
const AUDIT_WINDOW_MS = 15000;

function formatLocal(date) {
  return date.toLocaleString("pt-BR", {
    timeZone: TIMEZONE,
    dateStyle: "short",
    timeStyle: "medium",
  });
}

function toDiscordTimestamp(date) {
  const ts = Math.floor(date.getTime() / 1000);
  return `<t:${ts}:F> • <t:${ts}:R>`;
}

function channelTypeLabel(type) {
  switch (type) {
    case ChannelType.GuildText: return "Texto";
    case ChannelType.GuildVoice: return "Voz";
    case ChannelType.GuildCategory: return "Categoria";
    case ChannelType.GuildAnnouncement: return "Anúncios";
    case ChannelType.GuildStageVoice: return "Palco";
    case ChannelType.GuildForum: return "Fórum";
    default: return `Tipo(${type})`;
  }
}

function channelJumpLink(guildId, channelId) {
  return `https://discord.com/channels/${guildId}/${channelId}`;
}

async function fetchAuditExecutor(guild, channelId) {
  try {
    const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.ChannelCreate, limit: 10 });
    const now = Date.now();

    const entry = logs.entries.find(
      (e) => e?.target?.id === channelId && (now - e.createdTimestamp) <= AUDIT_WINDOW_MS
    );

    if (!entry) return { executor: null, reason: null };
    return { executor: entry.executor ?? null, reason: entry.reason ?? null };
  } catch {
    return { executor: null, reason: null };
  }
}

function extraChannelDetails(channel) {
  const lines = [];

  if (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement) {
    lines.push(`**NSFW:** ${channel.nsfw ? "Sim" : "Não"}`);
    lines.push(`**Slowmode:** ${channel.rateLimitPerUser ? `${channel.rateLimitPerUser}s` : "0s"}`);
    if (channel.topic) lines.push(`**Tópico:** ${channel.topic.slice(0, 250)}`);
  }

  if (channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice) {
    if (typeof channel.bitrate === "number") lines.push(`**Bitrate:** ${Math.round(channel.bitrate / 1000)}kbps`);
    if (typeof channel.userLimit === "number") lines.push(`**Limite de usuários:** ${channel.userLimit || "Sem limite"}`);
  }

  return lines.length ? lines.join("\n") : null;
}

export default {
  name: "channelCreate",

  async execute(channel) {
    try {
      if (!channel?.guild) return;
      const client = channel.client;

      const guild = channel.guild;

      const { executor, reason } = await fetchAuditExecutor(guild, channel.id);

      const createdAt = new Date();
      const parent = channel.parent;

      const embed = new EmbedBuilder()
        .setTitle("📁 Canal Criado")
        .setDescription(
          `🔗 **Link do canal:** ${channelJumpLink(guild.id, channel.id)}\n` +
          `🕒 **Criado em:** \`${formatLocal(createdAt)}\` • ${toDiscordTimestamp(createdAt)}`
        )
        .setTimestamp(new Date());

      if (executor) embed.setThumbnail(executor.displayAvatarURL({ size: 256 }));

      embed.addFields(
        {
          name: "👤 Criado por",
          value: executor
            ? `${executor} • **ID:** \`${executor.id}\``
            : "`Desconhecido (sem View Audit Log)`",
          inline: false,
        },
        {
          name: "🧾 Informações do Canal",
          value:
            `**Nome:** ${channel.name}\n` +
            `**Menção:** ${channel.toString?.() ?? `#${channel.name}`}\n` +
            `**ID:** \`${channel.id}\`\n` +
            `**Tipo:** \`${channelTypeLabel(channel.type)}\``,
          inline: true,
        },
        {
          name: "📂 Categoria",
          value: parent ? `**Nome:** ${parent.name}\n**ID:** \`${parent.id}\`` : "`Sem categoria`",
          inline: true,
        }
      );

      const extras = extraChannelDetails(channel);
      if (extras) embed.addFields({ name: "⚙️ Detalhes Extras", value: extras, inline: false });
      if (reason) embed.addFields({ name: "📝 Motivo (Audit Log)", value: reason, inline: false });

      // --- DUAL LOG ---
      const isMainGuild = guild.id === MAIN_GUILD_ID;

      // 1. Envia para o canal de log local
      const localLogChannelId = LOCAL_LOG_CHANNELS[guild.id];
      if (localLogChannelId) {
        try {
          const localLogChannel = await client.channels.fetch(localLogChannelId);
          if (localLogChannel?.isTextBased()) {
            const localEmbed = new EmbedBuilder(embed.toJSON()).setFooter({ text: `Servidor: ${guild.name} • ${guild.id}` });
            await localLogChannel.send({ embeds: [localEmbed] });
          }
        } catch (error) {
          console.error(`[channelCreate] ERRO (Local): Falha ao enviar para o canal ${localLogChannelId} na guilda ${guild.name}.`, error.message);
        }
      }

      // 2. Envia para o canal de log central (se não for a guilda principal)
      if (!isMainGuild) {
        try {
          const centralLogChannel = await client.channels.fetch(CENTRAL_LOG_CHANNEL_ID);
          if (!centralLogChannel?.isTextBased()) {
            console.error(`[channelCreate] ERRO CRÍTICO: Canal de log CENTRAL (${CENTRAL_LOG_CHANNEL_ID}) não encontrado ou não é de texto.`);
          } else {
            const centralEmbed = new EmbedBuilder(embed.toJSON()).setFooter({ text: `Origem: ${guild.name} • ${guild.id}` });
            await centralLogChannel.send({ embeds: [centralEmbed] });
          }
        } catch (error) {
          console.error(`[channelCreate] ERRO CRÍTICO: Falha ao enviar para o canal central ${CENTRAL_LOG_CHANNEL_ID}. Verifique as permissões do bot.`, error.message);
        }
      }
    } catch (err) {
      console.error("[logs/channelCreate] erro:", err);
    }
  },
};
