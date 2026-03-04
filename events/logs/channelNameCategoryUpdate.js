// ./events/logs/channelNameCategoryUpdate.js
import {
  AuditLogEvent,
  ChannelType,
  EmbedBuilder,
  Events,
  TimestampStyles,
  time,
  PermissionsBitField,
} from "discord.js";

const LOG_CHANNEL_ID = "1377747538433806417";

// janela pra considerar o audit log "do momento"
const AUDIT_MAX_AGE_MS = 20_000; // 20s

function channelTypeLabel(ch) {
  switch (ch?.type) {
    case ChannelType.GuildText: return "Texto";
    case ChannelType.GuildVoice: return "Voz";
    case ChannelType.GuildCategory: return "Categoria";
    case ChannelType.GuildAnnouncement: return "Anúncios";
    case ChannelType.GuildStageVoice: return "Palco";
    case ChannelType.GuildForum: return "Fórum";
    case ChannelType.GuildMedia: return "Mídia";
    case ChannelType.GuildDirectory: return "Diretório";
    case ChannelType.GuildPublicThread: return "Thread pública";
    case ChannelType.GuildPrivateThread: return "Thread privada";
    case ChannelType.GuildNewsThread: return "Thread de anúncios";
    default: return `Tipo ${ch?.type ?? "?"}`;
  }
}

function fmtCategoryName(catChannel) {
  if (!catChannel) return "Sem categoria";
  return `${catChannel.name} (${catChannel.id})`;
}

async function resolveCategory(guild, parentId) {
  if (!parentId) return null;
  // tenta cache
  const cached = guild.channels.cache.get(parentId);
  if (cached) return cached;

  // tenta fetch
  try {
    return await guild.channels.fetch(parentId);
  } catch {
    return null;
  }
}

async function getExecutorFromAudit(guild, targetChannelId) {
  // precisa de ViewAuditLog
  const me = guild.members.me;
  if (!me?.permissions.has(PermissionsBitField.Flags.ViewAuditLog)) return null;

  try {
    const audits = await guild.fetchAuditLogs({
      type: AuditLogEvent.ChannelUpdate,
      limit: 6,
    });

    const now = Date.now();

    const entry = audits.entries.find((e) => {
      const isTarget = e?.target?.id === targetChannelId;
      const isFresh = e?.createdTimestamp && (now - e.createdTimestamp) <= AUDIT_MAX_AGE_MS;
      return isTarget && isFresh;
    });

    return entry ?? null;
  } catch {
    return null;
  }
}

export function setupChannelNameCategoryUpdateLog(client) {
  // idempotente (não duplica em hot reload)
  if (client.__sc_channelNameCategoryUpdateLog) return;
  client.__sc_channelNameCategoryUpdateLog = true;

  client.on(Events.ChannelUpdate, async (oldChannel, newChannel) => {
    try {
      // só guild
      if (!newChannel?.guild) return;

      // ignora DMs / coisas sem base
      if (!oldChannel || !newChannel) return;

      // só loga se mudou nome e/ou categoria
      const nameChanged = oldChannel.name !== newChannel.name;

      // parentId = categoria
      const categoryChanged = (oldChannel.parentId || null) !== (newChannel.parentId || null);

      if (!nameChanged && !categoryChanged) return;

      const guild = newChannel.guild;

      // canal de logs
      const logChannel =
        guild.channels.cache.get(LOG_CHANNEL_ID) ||
        (await guild.channels.fetch(LOG_CHANNEL_ID).catch(() => null));

      if (!logChannel || !logChannel.isTextBased()) return;

      // tenta pegar quem foi via audit logs
      const auditEntry = await getExecutorFromAudit(guild, newChannel.id);
      const executor = auditEntry?.executor ?? null;

      // categorias antes/depois
      const oldCat = await resolveCategory(guild, oldChannel.parentId || null);
      const newCat = await resolveCategory(guild, newChannel.parentId || null);

      const when = new Date();

      const embed = new EmbedBuilder()
        .setColor("#ff009a")
        .setTitle("📝 Nome/Categoria de canal alterado")
        .setDescription(`Canal: <#${newChannel.id}>`)
        .addFields(
          {
            name: "📌 Tipo",
            value: channelTypeLabel(newChannel),
            inline: true,
          },
          {
            name: "🆔 Canal ID",
            value: `\`${newChannel.id}\``,
            inline: true,
          },
          {
            name: "👤 Alterado por",
            value: executor
              ? `${executor} (\`${executor.id}\`)`
              : "Não consegui identificar (sem permissão de audit log ou fora do tempo)",
            inline: false,
          }
        )
        .addFields(
          {
            name: "🗂️ Categoria (Antes)",
            value: fmtCategoryName(oldCat),
            inline: true,
          },
          {
            name: "🗂️ Categoria (Depois)",
            value: fmtCategoryName(newCat),
            inline: true,
          }
        )
        .addFields(
          {
            name: "🔤 Nome (Antes)",
            value: `\`${oldChannel.name}\``,
            inline: true,
          },
          {
            name: "🔤 Nome (Depois)",
            value: `\`${newChannel.name}\``,
            inline: true,
          }
        )
        .addFields({
          name: "⏰ Horário",
          value: `${time(when, TimestampStyles.LongDateTime)} • ${time(when, TimestampStyles.RelativeTime)}`,
          inline: false,
        })
        .setFooter({
          text: auditEntry?.id
            ? `AuditLog ID: ${auditEntry.id}`
            : "AuditLog: indisponível",
        });

      if (executor?.displayAvatarURL) {
        embed.setAuthor({
          name: `${executor.username}`,
          iconURL: executor.displayAvatarURL({ size: 128 }),
        });
      }

      // extra: mostra o que mudou (pra ficar bonito)
      const changes = [];
      if (nameChanged) changes.push("Nome");
      if (categoryChanged) changes.push("Categoria");
      embed.addFields({
        name: "✅ Alterações detectadas",
        value: changes.map((c) => `• ${c}`).join("\n"),
        inline: false,
      });

      await logChannel.send({ embeds: [embed] }).catch(() => {});
    } catch (err) {
      console.error("Erro no log channelNameCategoryUpdate:", err);
    }
  });
}
