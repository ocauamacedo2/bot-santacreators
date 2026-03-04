import { AuditLogEvent, ChannelType, EmbedBuilder } from "discord.js";

const LOG_CHANNEL_ID_DELETE = "1377813917866397726";
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

async function fetchAuditExecutor(guild, channelId) {
  try {
    const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.ChannelDelete, limit: 10 });
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
  name: "channelDelete",

  async execute(channel) {
    try {
      if (!channel?.guild) return;

      const guild = channel.guild;
      const logChannel = await guild.channels.fetch(LOG_CHANNEL_ID_DELETE).catch(() => null);
      if (!logChannel) return;

      const { executor, reason } = await fetchAuditExecutor(guild, channel.id);

      const deletedAt = new Date();
      const parent = channel.parent;
      const path = parent ? `${parent.name} / ${channel.name}` : channel.name;

      const embed = new EmbedBuilder()
        .setTitle("🗑️ Canal Excluído")
        .setDescription(
          `📌 **Canal:** \`${path}\`\n` +
          `🕒 **Excluído em:** \`${formatLocal(deletedAt)}\` • ${toDiscordTimestamp(deletedAt)}`
        )
        .setTimestamp(new Date())
        .setFooter({ text: `Servidor: ${guild.name} • ${guild.id}` });

      if (executor) embed.setThumbnail(executor.displayAvatarURL({ size: 256 }));

      embed.addFields(
        {
          name: "👤 Excluído por",
          value: executor
            ? `${executor} • **ID:** \`${executor.id}\``
            : "`Desconhecido (sem View Audit Log)`",
          inline: false,
        },
        {
          name: "🧾 Informações do Canal",
          value:
            `**Nome:** ${channel.name}\n` +
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

      await logChannel.send({ embeds: [embed] });
    } catch (err) {
      console.error("[logs/channelDelete] erro:", err);
    }
  },
};
