// d:\santacreators-main\events\protecaoBotsDeletarCanais.js
import {
  AuditLogEvent,
  ChannelType,
  EmbedBuilder,
  PermissionsBitField,
} from "discord.js";

const LOG_CHANNEL_ID = "1507676677927338107";

const ALLOWED_BOT_ROLE_IDS = new Set([
  "1380989431011610634", // amigos do creators
  "1373805502215225505", // santa creators
]);

const DANGEROUS_PERMISSIONS = [
  PermissionsBitField.Flags.Administrator,
  PermissionsBitField.Flags.ManageGuild,
  PermissionsBitField.Flags.ManageChannels,
  PermissionsBitField.Flags.ManageRoles,
  PermissionsBitField.Flags.ManageWebhooks,
  PermissionsBitField.Flags.BanMembers,
  PermissionsBitField.Flags.KickMembers,
];

function formatDateSP() {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date());
}

function getChannelTypeName(type) {
  const map = {
    [ChannelType.GuildText]: "Texto",
    [ChannelType.GuildVoice]: "Voz",
    [ChannelType.GuildCategory]: "Categoria",
    [ChannelType.GuildAnnouncement]: "Anúncios",
    [ChannelType.AnnouncementThread]: "Thread de anúncio",
    [ChannelType.PublicThread]: "Thread pública",
    [ChannelType.PrivateThread]: "Thread privada",
    [ChannelType.GuildStageVoice]: "Stage",
    [ChannelType.GuildForum]: "Fórum",
    [ChannelType.GuildMedia]: "Mídia",
  };

  return map[type] ?? `Tipo desconhecido (${type})`;
}

function hasAllowedRole(member) {
  return member.roles.cache.some((role) => ALLOWED_BOT_ROLE_IDS.has(role.id));
}

function roleHasDangerousPermission(role) {
  return DANGEROUS_PERMISSIONS.some((perm) => role.permissions.has(perm));
}

async function sendProtectionLog({
  guild,
  channel,
  executor,
  removedRoles,
  skippedRoles,
  reason,
}) {
  const logChannel = await guild.client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
  if (!logChannel || !logChannel.isTextBased()) return;

  const embed = new EmbedBuilder()
    .setColor(removedRoles.length > 0 ? 0xff2b2b : 0xffa500)
    .setTitle("🛡️ Proteção Anti-Bot | Canal deletado")
    .setDescription(
      [
        "Ação de deleção de canal detectada nos registros de auditoria.",
        "",
        `**Canal deletado:** ${channel?.name ?? "desconhecido"}`,
        `**ID do canal:** \`${channel?.id ?? "desconhecido"}\``,
        `**Tipo do canal:** ${getChannelTypeName(channel?.type)}`,
        "",
        `**Bot executor:** ${executor?.tag ?? "desconhecido"}`,
        `**ID do bot:** \`${executor?.id ?? "desconhecido"}\``,
        "",
        `**Cargos removidos:** ${
          removedRoles.length
            ? removedRoles.map((r) => `<@&${r.id}>`).join(", ")
            : "nenhum"
        }`,
        "",
        `**Cargos ignorados/não removidos:** ${
          skippedRoles.length
            ? skippedRoles.map((r) => `<@&${r.id}>`).join(", ")
            : "nenhum"
        }`,
        "",
        `**Motivo:** ${reason}`,
        `**Data:** ${formatDateSP()}`,
      ].join("\n")
    )
    .setTimestamp();

  await logChannel.send({ embeds: [embed] }).catch(() => null);
}

async function punishUnauthorizedBot({ guild, executor, channel }) {
  const botMember = await guild.members.fetch(executor.id).catch(() => null);
  const me = await guild.members.fetchMe().catch(() => null);

  if (!botMember || !me) return;

  const removedRoles = [];
  const skippedRoles = [];

  const editableDangerRoles = botMember.roles.cache.filter((role) => {
    if (role.id === guild.id) return false;
    if (role.managed) return false;
    if (ALLOWED_BOT_ROLE_IDS.has(role.id)) return false;
    if (!roleHasDangerousPermission(role)) return false;

    if (role.position >= me.roles.highest.position) {
      skippedRoles.push(role);
      return false;
    }

    return true;
  });

  for (const role of editableDangerRoles.values()) {
    try {
      await botMember.roles.remove(
        role,
        "Proteção Anti-Bot: bot não autorizado deletou canal."
      );
      removedRoles.push(role);
    } catch {
      skippedRoles.push(role);
    }
  }

  await sendProtectionLog({
    guild,
    channel,
    executor,
    removedRoles,
    skippedRoles,
    reason: "Bot não autorizado deletou canal do servidor.",
  });
}

export default function setupProtecaoBotsDeletarCanais(client) {
  if (globalThis.__SC_PROTECAO_BOTS_DELETAR_CANAIS__) return;
  globalThis.__SC_PROTECAO_BOTS_DELETAR_CANAIS__ = true;

  client.on("channelDelete", async (channel) => {
    try {
      const guild = channel.guild;
      if (!guild) return;

      await new Promise((resolve) => setTimeout(resolve, 2000));

      const auditLogs = await guild.fetchAuditLogs({
        type: AuditLogEvent.ChannelDelete,
        limit: 5,
      });

      const entry = auditLogs.entries.find((log) => {
        const targetId = log.target?.id;
        const createdRecently = Date.now() - log.createdTimestamp < 15_000;
        return targetId === channel.id && createdRecently;
      });

      if (!entry || !entry.executor || !entry.executor.bot || entry.executor.id === client.user.id) return;

      const executorMember = await guild.members.fetch(entry.executor.id).catch(() => null);
      if (!executorMember) return;

      if (hasAllowedRole(executorMember)) {
        await sendProtectionLog({
          guild,
          channel,
          executor: entry.executor,
          removedRoles: [],
          skippedRoles: [],
          reason: "Bot autorizado pela whitelist de cargos.",
        });
        return;
      }

      await punishUnauthorizedBot({
        guild,
        executor: entry.executor,
        channel,
      });
    } catch (error) {
      console.error("[PROTECAO BOTS DELETAR CANAIS] Erro:", error);
    }
  });

  console.log("[PROTECAO BOTS DELETAR CANAIS] Sistema carregado.");
}