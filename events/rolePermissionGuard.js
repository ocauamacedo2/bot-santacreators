import {
  PermissionFlagsBits,
  EmbedBuilder,
  AuditLogEvent,
} from "discord.js";

// =====================================================
// CONFIGURAÇÃO
// =====================================================
const LOG_CHANNEL_ID = "1491267991315157042";

// Lista de permissões proibidas para cargos abaixo do bot
const FORBIDDEN_PERMISSIONS = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.ModerateMembers,
];

// Nomes amigáveis para o Log
const PERMISSION_NAMES = {
  [PermissionFlagsBits.Administrator]: "Administrador",
  [PermissionFlagsBits.ManageRoles]: "Gerenciar Cargos",
  [PermissionFlagsBits.ManageChannels]: "Gerenciar Canais",
  [PermissionFlagsBits.ManageGuild]: "Gerenciar Servidor",
  [PermissionFlagsBits.KickMembers]: "Expulsar Membros",
  [PermissionFlagsBits.BanMembers]: "Banir Membros",
  [PermissionFlagsBits.ManageMessages]: "Gerenciar Mensagens",
  [PermissionFlagsBits.ModerateMembers]: "Moderar Membros (Castigo/Aprovação)",
};

// Guarda apenas a auto-correção do próprio bot
const selfFixCache = new Map();

function getForbiddenAdded(oldRole, newRole) {
  return FORBIDDEN_PERMISSIONS.filter(
    (perm) =>
      !oldRole.permissions.has(perm) &&
      newRole.permissions.has(perm)
  );
}

function formatForbiddenNames(forbiddenList) {
  return forbiddenList
    .map((p) => `• ${PERMISSION_NAMES[p] || "Desconhecida"}`)
    .join("\n");
}

async function fetchRealExecutorBeforeFix(guild, roleId, client) {
  try {
    // pequeno atraso para o audit log do usuário chegar antes da correção
    await new Promise((resolve) => setTimeout(resolve, 350));

    const auditLogs = await guild.fetchAuditLogs({
      type: AuditLogEvent.RoleUpdate,
      limit: 6,
    });

    const now = Date.now();

    const entry = auditLogs.entries.find((log) => {
      if (!log) return false;
      if (!log.target) return false;
      if (log.target.id !== roleId) return false;
      if (!log.executor) return false;
      if (client?.user && log.executor.id === client.user.id) return false;

      const age = now - (log.createdTimestamp || 0);
      if (age > 15000) return false;

      return true;
    });

    return entry?.executor ?? null;
  } catch (error) {
    console.warn("[PERM-GUARD] Falha ao identificar executor real no audit log:", error);
    return null;
  }
}

async function sendGuardLog(client, role, forbiddenList, executor) {
  try {
    const guild = role.guild;
    const forbiddenNames = formatForbiddenNames(forbiddenList);

    const executorText = executor
      ? `${executor} (\`${executor.id}\`)`
      : "Não identificado";

    const embed = new EmbedBuilder()
      .setTitle("🛡️ Trava de Segurança: Permissões Bloqueadas")
      .setColor("#ff0000")
      .setDescription(
        "Uma tentativa de ativar permissões perigosas em um cargo abaixo da hierarquia do bot foi interceptada e revertida automaticamente."
      )
      .addFields(
        { name: "🏷️ Cargo Afetado", value: `${role.name} (\`${role.id}\`)`, inline: true },
        { name: "👤 Executor da Ação", value: executorText, inline: true },
        { name: "🚫 Permissões Revertidas", value: `\`\`\`\n${forbiddenNames}\n\`\`\``, inline: false },
        { name: "🕒 Data/Hora", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
      )
      .setThumbnail(guild.iconURL())
      .setFooter({
        text: "SantaCreators Security System",
        iconURL: client.user.displayAvatarURL(),
      })
      .setTimestamp();

    const logChannel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);

    if (logChannel?.isTextBased()) {
      await logChannel.send({ embeds: [embed] });
    } else {
      console.log(
        `[PERM-GUARD][ALERTA] Executor: ${executor?.tag || executor?.id || "Não identificado"} tentou dar perms para ${role.name}`
      );
    }
  } catch (error) {
    console.error("[PERM-GUARD] Erro ao enviar log:", error);
  }
}

async function enforceForbiddenRemoval(role, forbiddenList) {
  const correctedPermissions = role.permissions.remove(forbiddenList);

  await role.setPermissions(
    correctedPermissions,
    "[SEGURANÇA] Remoção automática de permissões perigosas em cargo abaixo do bot."
  );

  // revalidação curta para garantir firmeza
  await new Promise((resolve) => setTimeout(resolve, 500));

  const refreshedRole = await role.guild.roles.fetch(role.id).catch(() => null);
  if (!refreshedRole) return;

  const stillForbidden = forbiddenList.filter((perm) => refreshedRole.permissions.has(perm));

  if (stillForbidden.length > 0) {
    const secondPass = refreshedRole.permissions.remove(stillForbidden);
    await refreshedRole.setPermissions(
      secondPass,
      "[SEGURANÇA] Segunda correção automática de permissões perigosas."
    );
  }
}

/**
 * Handler principal para o evento roleUpdate
 * Protege contra a ativação de permissões administrativas em cargos gerenciáveis.
 */
export async function rolePermissionGuardHandleRoleUpdate(oldRole, newRole, client) {
  try {
    if (!oldRole || !newRole || !client) return;

    // se o bot acabou de corrigir exatamente este cargo, ignora apenas o eco da própria correção
    const selfFixUntil = selfFixCache.get(newRole.id);
    if (selfFixUntil && Date.now() < selfFixUntil) {
      selfFixCache.delete(newRole.id);
      return;
    }

    // só processa cargos que o bot realmente consegue editar
    if (!newRole.editable) {
      return;
    }

    const addedForbidden = getForbiddenAdded(oldRole, newRole);
    if (addedForbidden.length === 0) {
      return;
    }

    // captura o executor real ANTES da correção do bot
    const executor = await fetchRealExecutorBeforeFix(newRole.guild, newRole.id, client);

    // ✅ Se o executor for o dono do servidor (Owner), ignora a proteção.
    if (executor && executor.id === newRole.guild.ownerId) {
      return;
    }

    // marca apenas o próximo eco da própria correção do bot
    selfFixCache.set(newRole.id, Date.now() + 2000);

    await enforceForbiddenRemoval(newRole, addedForbidden);

    console.log(
      `[PERM-GUARD] Permissões proibidas removidas do cargo ${newRole.name} (${newRole.id})`
    );

    await sendGuardLog(client, newRole, addedForbidden, executor);

    setTimeout(() => {
      const stillMarked = selfFixCache.get(newRole.id);
      if (stillMarked && stillMarked <= Date.now()) {
        selfFixCache.delete(newRole.id);
      }
    }, 2500);
  } catch (error) {
    selfFixCache.delete(newRole?.id);
    console.error("[PERM-GUARD] Erro ao processar guarda de cargos:", error);
  }
}