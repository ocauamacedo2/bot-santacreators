// d:\santacreators-main\events\rolePermissionGuard.js
import {
  PermissionFlagsBits,
  EmbedBuilder,
  AuditLogEvent,
  Events
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

// Conjunto para evitar loops infinitos durante a correção
const rolesProcessing = new Set();

/**
 * Handler principal para o evento roleUpdate
 * Protege contra a ativação de permissões administrativas em cargos gerenciáveis.
 */
export async function rolePermissionGuardHandleRoleUpdate(oldRole, newRole, client) {
  try {
    if (!oldRole || !newRole || !client) return;

    // Evita loop quando a própria correção do bot disparar novo roleUpdate
    if (rolesProcessing.has(newRole.id)) return;

    // Só processa cargos que o bot realmente consegue editar
    if (!newRole.editable) {
      return;
    }

    // Descobre se adicionaram alguma permissão proibida agora
    const addedForbidden = FORBIDDEN_PERMISSIONS.filter(
      (perm) =>
        !oldRole.permissions.has(perm) &&
        newRole.permissions.has(perm)
    );

    if (addedForbidden.length === 0) {
      return;
    }

    rolesProcessing.add(newRole.id);

    try {
      const correctedPermissions = newRole.permissions.remove(addedForbidden);

      await newRole.setPermissions(
        correctedPermissions,
        "[SEGURANÇA] Remoção automática de permissões perigosas em cargo abaixo do bot."
      );

      console.log(
        `[PERM-GUARD] Permissões proibidas removidas do cargo ${newRole.name} (${newRole.id})`
      );

      await processLogs(client, newRole, addedForbidden);
    } finally {
      setTimeout(() => rolesProcessing.delete(newRole.id), 2500);
    }
  } catch (error) {
    rolesProcessing.delete(newRole.id);
    console.error("[PERM-GUARD] Erro ao processar guarda de cargos:", error);
  }
}

/**
 * Busca o executor no Audit Log e envia o Embed de alerta
 */
async function processLogs(client, role, forbiddenList) {
  try {
    const guild = role.guild;
    let executor = "Não identificado";

    // Aguarda 1 segundo para garantir que o Discord processou o Audit Log
    await new Promise(r => setTimeout(r, 1000));

    // Busca no Audit Log quem editou o cargo nos últimos 10 segundos
    try {
      const auditLogs = await guild.fetchAuditLogs({
        type: AuditLogEvent.RoleUpdate,
        limit: 1,
      });
      const entry = auditLogs.entries.first();

      if (entry && entry.target.id === role.id && (Date.now() - entry.createdTimestamp) < 10000) {
        executor = entry.executor;
      }
    } catch (e) {
      console.warn("[PERM-GUARD] Falha ao ler Audit Log.");
    }

    const forbiddenNames = forbiddenList.map(p => `• ${PERMISSION_NAMES[p] || "Desconhecida"}`).join("\n");

    const embed = new EmbedBuilder()
      .setTitle("🛡️ Trava de Segurança: Permissões Bloqueadas")
      .setColor("#ff0000")
      .setDescription(`Uma tentativa de ativar permissões perigosas em um cargo abaixo da hierarquia do bot foi interceptada e revertida automaticamente.`)
      .addFields(
        { name: "🏷️ Cargo Afetado", value: `${role.name} (\`${role.id}\`)`, inline: true },
        { name: "👤 Executor da Ação", value: executor.tag ? `${executor} (\`${executor.id}\`)` : executor, inline: true },
        { name: "🚫 Permissões Revertidas", value: `\`\`\`\n${forbiddenNames}\n\`\`\``, inline: false },
        { name: "🕒 Data/Hora", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
      )
      .setThumbnail(guild.iconURL())
      .setFooter({ text: "SantaCreators Security System", iconURL: client.user.displayAvatarURL() })
      .setTimestamp();

    const logChannel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    if (logChannel?.isTextBased()) {
      await logChannel.send({ embeds: [embed] });
    } else {
      console.log(`[PERM-GUARD][ALERTA] Executor: ${executor.tag || executor} tentou dar perms para ${role.name}`);
    }

  } catch (err) {
    console.error("[PERM-GUARD] Erro ao gerar logs:", err);
  }
}
