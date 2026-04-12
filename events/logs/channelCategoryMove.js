// ./events/logs/channelCategoryMove.js
import { EmbedBuilder, AuditLogEvent, ChannelType, time } from "discord.js";

const LOG_CHANNEL_ID = "1486009661512482997";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const channelUrl = (guildId, channelId) =>
  `https://discord.com/channels/${guildId}/${channelId}`;

const fmtCategory = (guild, categoryId) => {
  if (!categoryId) {
    return { mention: "`(sem categoria)`", link: "`(sem link)`", id: "`(n/a)`" };
  }
  const cat = guild.channels.cache.get(categoryId);
  const catName = cat?.name ?? "Categoria desconhecida";
  return {
    mention: `<#${categoryId}>`,
    link: `[${catName}](${channelUrl(guild.id, categoryId)})`,
    id: categoryId,
  };
};

const fmtExecutor = (executor) => {
  if (!executor) return null;
  const tag = executor.tag ?? executor.username ?? "Usuário";
  return `${`<@${executor.id}>`}\n\`${tag}\`\nID: \`${executor.id}\``;
};

async function findExecutorForMove(guild, channelId, maxAgeMs = 30000) {
  // se o bot não tem perm pra ver auditlog, isso vai falhar e cair no catch
  const audits = await guild.fetchAuditLogs({
    type: AuditLogEvent.ChannelUpdate,
    limit: 15,
  });

  // pega a entry mais recente que bate no canal e é recente
  const entry = audits.entries.find((e) => {
    const targetId = e.target?.id ?? e.targetId;
    if (targetId !== channelId) return false;

    const created = e.createdTimestamp ?? 0;
    const ageMs = Date.now() - created;
    if (ageMs > maxAgeMs) return false;

    // não força só parent_id — deixa flexível
    // (ainda assim tenta garantir que foi update de canal)
    return true;
  });

  return entry ? { executor: entry.executor ?? null, reason: entry.reason ?? null, entry } : null;
}

export function setupChannelCategoryMoveLog(client) {
  if (client.__sc_channelCategoryMoveLog__) return;
  client.__sc_channelCategoryMoveLog__ = true;

  client.on("channelUpdate", async (oldChannel, newChannel) => {
    try {
      if (!newChannel?.guild) return;
      if (!("parentId" in newChannel)) return;

      const oldParent = oldChannel.parentId ?? null;
      const newParent = newChannel.parentId ?? null;
      if (oldParent === newParent) return;

      const allowedTypes = new Set([
        ChannelType.GuildText,
        ChannelType.GuildAnnouncement,
        ChannelType.GuildVoice,
        ChannelType.GuildStageVoice,
        ChannelType.GuildForum,
        ChannelType.GuildMedia,
      ]);
      if (newChannel.type && !allowedTypes.has(newChannel.type)) return;

      const guild = newChannel.guild;

      const logChannel = await guild.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
      if (!logChannel || !logChannel.isTextBased()) return;

      // tenta 2x pegar executor (audit log às vezes atrasa)
      let auditData = null;
      try {
        auditData = await findExecutorForMove(guild, newChannel.id, 30000);
        if (!auditData) {
          await sleep(1200);
          auditData = await findExecutorForMove(guild, newChannel.id, 30000);
        }
      } catch {
        // sem permissão ou erro do discord
        auditData = null;
      }

      const fromCat = fmtCategory(guild, oldParent);
      const toCat = fmtCategory(guild, newParent);

      const now = new Date();

      const embed = new EmbedBuilder()
        .setAuthor({
          name: "SantaCreators | Log de alteração de canal",
          iconURL: guild.iconURL({ size: 128 }) ?? undefined,
        })
        .setColor(0xff009a)
        .setDescription(
          [
            `📌 **Mudança de categoria detectada**`,
            ``,
            `**Canal:** <#${newChannel.id}>`,
            `**Link do canal:** [${newChannel.name}](${channelUrl(guild.id, newChannel.id)})`,
            `**ID do canal:** \`${newChannel.id}\``,
          ].join("\n")
        )
        .addFields(
          {
            name: "Executor",
            value:
              auditData?.executor
                ? fmtExecutor(auditData.executor)
                : "`Desconhecido` (sem auditoria / sem permissão de Ver Log de Auditoria / atraso no audit log)",
            inline: true,
          },
          {
            name: "Data/Hora",
            value: `${time(now, "F")}\n(${time(now, "R")})`,
            inline: true,
          },
          {
            name: "Categoria (de)",
            value: oldParent ? `${fromCat.mention}\n${fromCat.link}\nID: \`${fromCat.id}\`` : "`(sem categoria)`",
            inline: false,
          },
          {
            name: "Categoria (para)",
            value: newParent ? `${toCat.mention}\n${toCat.link}\nID: \`${toCat.id}\`` : "`(sem categoria)`",
            inline: false,
          }
        )
        .setFooter({
          text: `Sistema de Logs • ${guild.name}`,
          iconURL: client.user?.displayAvatarURL({ size: 128 }) ?? undefined,
        })
        .setTimestamp(now);

      if (auditData?.reason) {
        embed.addFields({ name: "Motivo (audit log)", value: auditData.reason, inline: false });
      }

      await logChannel.send({ embeds: [embed] }).catch(() => null);
    } catch (err) {
      console.error("❌ Erro no log de troca de categoria:", err);
    }
  });
}
