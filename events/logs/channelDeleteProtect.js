// ./events/logs/channelDelete.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import {
  AuditLogEvent,
  ChannelType,
  EmbedBuilder,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";

// =========================
// CONFIG + “BANCO” (JSON)
// =========================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// guarda histórico de infrações por user
const STORE_DIR = path.join(__dirname, "..", "..", "data", "moderacao");
const STORE_FILE = path.join(STORE_DIR, "channelDeleteInfractions.json");

function ensureStore() {
  if (!fs.existsSync(STORE_DIR)) fs.mkdirSync(STORE_DIR, { recursive: true });
  if (!fs.existsSync(STORE_FILE)) fs.writeFileSync(STORE_FILE, JSON.stringify({}, null, 2));
}
function loadStore() {
  ensureStore();
  try {
    return JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
  } catch {
    return {};
  }
}
function saveStore(data) {
  ensureStore();
  fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2));
}

function roleList(member) {
  return (
    member.roles.cache
      .filter((r) => r.id !== member.guild.id) // remove @everyone
      .sort((a, b) => b.position - a.position)
      .map((r) => `<@&${r.id}>`)
      .join(" ") || "*Sem cargos além do @everyone*"
  );
}

function safeChannelTypeName(ch) {
  if (ch.type === ChannelType.GuildText) return "Texto";
  if (ch.type === ChannelType.GuildVoice) return "Voz";
  if (ch.type === ChannelType.GuildCategory) return "Categoria";
  if (ch.type === ChannelType.GuildAnnouncement) return "Anúncios";
  if (ch.type === ChannelType.GuildStageVoice) return "Palco";
  if (ch.type === ChannelType.GuildForum) return "Fórum";
  return `Tipo(${ch.type})`;
}

function idsToMentions(ids = []) {
  if (!Array.isArray(ids) || ids.length === 0) return "*Nenhum*";
  return ids.map((id) => `<@&${id}>`).join(" ");
}

export default {
  name: "channelDelete",

  /**
   * @param {import('discord.js').GuildChannel} channel
   * @param {import('discord.js').Client} client
   */
  async execute(channel, client) {
    try {
      // ======= AJUSTE AQUI (SEUS IDS) =======
      // Esses são cargos (role ids)
      const BYPASS_USER_ID = "660311795327828008";
      const OWNER_ROLE_ID = "1262262852949905408";
      const ADMIN_ROLE_ID = "1352741003639132160";
      const CIDADAO_ROLE_ID = "1262978759922028575";

      const categoriaBackupId = "1389857472906530866";
      const logChannelId = "1389857160871280650";
      // =====================================

      const guild = channel.guild;
      const logChannel = await guild.channels.fetch(logChannelId).catch(() => null);

      // Pega audit log do delete
      const fetchedLogs = await guild.fetchAuditLogs({
        limit: 3,
        type: AuditLogEvent.ChannelDelete,
      });

      // tenta achar o log certo (às vezes vem mais de 1)
      const now = Date.now();
      const deletionLog =
        fetchedLogs.entries.find((entry) => {
          const isSameTarget = entry.target?.id === channel.id;
          const isRecent = entry.createdTimestamp && now - entry.createdTimestamp < 20_000;
          return isSameTarget || isRecent;
        }) ?? fetchedLogs.entries.first();

      if (!deletionLog) {
        // Se não tem auditlog, aqui você tinha logado antes.
        // Mantive do jeito original (só avisa), mas isso só acontece quando NÃO dá pra identificar executor.
        if (logChannel) {
          await logChannel.send({ content: `⚠️ Canal apagado: \`${channel.name}\` mas não encontrei AuditLog.` });
        }
        return;
      }

      const executor = deletionLog.executor;
      if (!executor || executor.bot) return;

      const member = await guild.members.fetch(executor.id).catch(() => null);
      if (!member) return;

      // ============================================================
      // ✅ BYPASS TOTAL (NÃO FAZ NADA: sem logs, sem store, sem restore)
      // ============================================================
      const isBypass =
        executor.id === BYPASS_USER_ID ||
        member.roles.cache.has(OWNER_ROLE_ID) ||
        member.roles.cache.has(ADMIN_ROLE_ID);

      if (isBypass) {
        // IGNORA 100%: não registra histórico, não gera logs, não recria canal.
        return;
      }

      // ======= HISTÓRICO (SÓ PRA QUEM NÃO É BYPASS) =======
      const store = loadStore();
      store[guild.id] ??= {};
      store[guild.id][executor.id] ??= {
        total: 0,
        lastAt: null,
        channels: [],
        lastPunishment: null, // salvar cargos antes/depois pra botão restaurar
      };

      store[guild.id][executor.id].total += 1;
      store[guild.id][executor.id].lastAt = new Date().toISOString();
      store[guild.id][executor.id].channels.unshift({
        id: channel.id,
        name: channel.name,
        at: new Date().toISOString(),
        type: safeChannelTypeName(channel),
      });
      store[guild.id][executor.id].channels = store[guild.id][executor.id].channels.slice(0, 10);

      const infraCount = store[guild.id][executor.id].total;

      // ======= CHECAGEM DE PUNIÇÃO (roles) =======
      const botMember = await guild.members.fetchMe();
      const canManageRoles = botMember.permissions.has(PermissionsBitField.Flags.ManageRoles);
      const botAboveTarget = botMember.roles.highest.comparePositionTo(member.roles.highest) > 0;

      const rolesBefore = roleList(member);

      const beforeRoleIds = member.roles.cache.filter((r) => r.id !== guild.id).map((r) => r.id);

      if (!canManageRoles || !botAboveTarget) {
        if (logChannel) {
          await logChannel.send({
            content: `⚠️ <@&${OWNER_ROLE_ID}> <@&${ADMIN_ROLE_ID}> — tentei punir **${member.user.tag}**, mas não tenho permissão/cargo acima.`,
          });
        }

        // tenta restaurar mesmo sem punir
        const restored = await restoreChannel({ channel, guild, categoriaBackupId, executor, CIDADAO_ROLE_ID });

        // salva lastPunishment como “não aplicado”
        store[guild.id][executor.id].lastPunishment = {
          at: new Date().toISOString(),
          applied: false,
          rolesBeforeIds: beforeRoleIds,
          removedRoleIds: [],
          rolesAfterIds: beforeRoleIds,
        };
        saveStore(store);

        await sendLogEmbed({
          logChannel,
          channel,
          executor,
          member,
          infraCount,
          rolesBefore,
          rolesAfter: "*Não aplicado (sem permissão)*",
          removedRoles: "*Não aplicado (sem permissão)*",
          restoredChannel: restored,
          actionText: "🚫 Falha ao punir: bot sem permissão/cargo acima.",
          guildId: guild.id,
          ownerRoleId: OWNER_ROLE_ID,
          adminRoleId: ADMIN_ROLE_ID,
        });
        return;
      }

      // ======= REMOVE CARGOS (mantém Cidadão + Booster) =======
      const rolesToRemove = member.roles.cache.filter(
        (role) =>
          role.id !== CIDADAO_ROLE_ID &&
          role.name !== "Server Booster" &&
          role.id !== guild.id &&
          role.editable
      );

      const removedRoleIds = rolesToRemove.map((r) => r.id);
      const removedRolesPretty = rolesToRemove.map((r) => `<@&${r.id}>`).join(" ") || "*Nenhum cargo removível*";

      try {
        if (rolesToRemove.size > 0) await member.roles.remove(rolesToRemove);

        // garante cidadão
        if (!member.roles.cache.has(CIDADAO_ROLE_ID)) {
          await member.roles.add(CIDADAO_ROLE_ID).catch(() => {});
        }
      } catch (err) {
        if (logChannel) {
          await logChannel.send({
            content: `⚠️ Erro punindo **${member.user.tag}**.\nErro: \`${err?.message ?? err}\``,
          });
        }
      }

      // snapshot depois
      const refreshed = await guild.members.fetch(executor.id).catch(() => member);
      const rolesAfter = roleList(refreshed);
      const afterRoleIds = refreshed.roles.cache.filter((r) => r.id !== guild.id).map((r) => r.id);

      // salva “lastPunishment” pra botão restaurar
      store[guild.id][executor.id].lastPunishment = {
        at: new Date().toISOString(),
        applied: true,
        rolesBeforeIds: beforeRoleIds,
        removedRoleIds,
        rolesAfterIds: afterRoleIds,
      };
      saveStore(store);

      // ======= DM =======
      await refreshed
        .send({
          content:
            `🚫 | Você deletou um canal sem permissão.\n` +
            `Por isso, seus cargos foram removidos e você ficou apenas com <@&${CIDADAO_ROLE_ID}>.\n` +
            `Histórico: essa foi a **${infraCount}ª** vez registrada.\n` +
            `Se foi engano, fale com a staff.`,
        })
        .catch(() => {});

      // ======= RESTAURA CANAL =======
      const restoredChannel = await restoreChannel({
        channel,
        guild,
        categoriaBackupId,
        executor,
        CIDADAO_ROLE_ID,
      });

      // ======= LOG FINAL COMPLETO (COM BOTÕES) =======
      await sendLogEmbed({
        logChannel,
        channel,
        executor,
        member: refreshed,
        infraCount,
        rolesBefore,
        rolesAfter,
        removedRoles: removedRolesPretty,
        restoredChannel,
        actionText: `🔒 Punição aplicada: cargos removidos, mantendo <@&${CIDADAO_ROLE_ID}>.`,
        guildId: guild.id,
        ownerRoleId: OWNER_ROLE_ID,
        adminRoleId: ADMIN_ROLE_ID,
      });

      console.log(`✅ [channelDelete] ${channel.name} apagado por ${executor.tag} — puniu e restaurou.`);
    } catch (err) {
      console.error("❌ Erro no channelDelete:", err);
    }
  },
};

// =========================
// Helpers de RESTAURA + EMBED
// =========================
async function restoreChannel({ channel, guild, categoriaBackupId, executor, CIDADAO_ROLE_ID }) {
  let newChannel = null;

  // garante categoria backup
  const categoriaBackup = await guild.channels.fetch(categoriaBackupId).catch(async () => {
    return await guild.channels.create({
      name: "📂 Apagados Salvos",
      type: ChannelType.GuildCategory,
    });
  });

  // Se deletou categoria
  if (channel.type === ChannelType.GuildCategory) {
    newChannel = await guild.channels.create({
      name: `🔒-${channel.name}-restaurada`,
      type: ChannelType.GuildCategory,
      permissionOverwrites: channel.permissionOverwrites.cache.map((overwrite) => ({
        id: overwrite.id,
        allow: overwrite.allow.bitfield,
        deny: overwrite.deny.bitfield,
        type: overwrite.type,
      })),
    });
    return newChannel;
  }

  // canal normal
  newChannel = await guild.channels.create({
    name: `🔒-${channel.name}-restaurado`,
    type: channel.type,
    topic: channel.topic || null,
    nsfw: !!channel.nsfw,
    rateLimitPerUser: channel.rateLimitPerUser || 0,
    parent: categoriaBackup?.id ?? null,
    permissionOverwrites: channel.permissionOverwrites.cache.map((overwrite) => ({
      id: overwrite.id,
      allow: overwrite.allow.bitfield,
      deny: overwrite.deny.bitfield,
      type: overwrite.type,
    })),
  });

  // mensagem fixa no canal restaurado
  if (newChannel?.isTextBased?.()) {
    const aviso = await newChannel
      .send({
        content:
          `🔧 **Canal restaurado automaticamente.**\n` +
          `Este canal foi deletado indevidamente por **${executor.tag}**.\n` +
          `A punição automática removeu os cargos do responsável, mantendo apenas <@&${CIDADAO_ROLE_ID}>.`,
      })
      .catch(() => null);

    if (aviso) await aviso.pin().catch(() => {});
  }

  return newChannel;
}

async function sendLogEmbed({
  logChannel,
  channel,
  executor,
  member,
  infraCount,
  rolesBefore,
  rolesAfter,
  removedRoles,
  restoredChannel,
  actionText,
  guildId,
  ownerRoleId,
  adminRoleId,
}) {
  if (!logChannel) return;

  const overwritesCount = channel.permissionOverwrites?.cache?.size ?? 0;
  const parentName = channel.parent?.name ? `\`${channel.parent.name}\`` : "*Sem categoria*";

  // infos extras do usuário
  const createdAt = executor.createdAt ? `<t:${Math.floor(executor.createdAt.getTime() / 1000)}:F>` : "*?*";
  const joinedAt = member?.joinedAt ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:F>` : "*?*";

  // últimos canais do histórico (do json)
  let last10 = "*Sem histórico salvo*";
  let lastPunishmentText = "*Sem dados*";

  try {
    const store = loadStore();
    const hist = store?.[guildId]?.[executor.id];

    const channels = hist?.channels ?? [];
    if (channels.length) {
      last10 = channels
        .slice(0, 5)
        .map((x, i) => `**${i + 1}.** \`${x.name}\` (${x.type})`)
        .join("\n");
    }

    const lp = hist?.lastPunishment;
    if (lp) {
      lastPunishmentText =
        `Aplicada: **${lp.applied ? "sim" : "não"}**\n` +
        `Antes: ${idsToMentions(lp.rolesBeforeIds).slice(0, 800)}\n` +
        `Removidos: ${idsToMentions(lp.removedRoleIds).slice(0, 800)}\n` +
        `Depois: ${idsToMentions(lp.rolesAfterIds).slice(0, 800)}`;
    }
  } catch {}

  const embed = new EmbedBuilder()
    .setTitle(channel.type === ChannelType.GuildCategory ? "🚨 Categoria deletada" : "🚨 Canal deletado")
    .setColor("Red")
    .setDescription(actionText)
    .addFields(
      { name: "Executor", value: `${executor.tag} (<@${executor.id}>)`, inline: true },
      { name: "ID", value: `\`${executor.id}\``, inline: true },
      { name: "Histórico", value: `Essa foi a **${infraCount}ª** vez registrada.`, inline: true },

      { name: "Conta criada em", value: createdAt, inline: true },
      { name: "Entrou no servidor em", value: joinedAt, inline: true },
      { name: "Avatar", value: executor.displayAvatarURL?.() ? `[link](${executor.displayAvatarURL()})` : "*?*", inline: true },

      { name: "Deletado", value: `\`${channel.name}\``, inline: true },
      { name: "Tipo", value: `\`${safeChannelTypeName(channel)}\``, inline: true },
      { name: "Categoria", value: parentName, inline: true },

      { name: "Overwrites", value: `\`${overwritesCount}\``, inline: true },
      { name: "Restaurado como", value: restoredChannel?.id ? `<#${restoredChannel.id}>` : "*Não restaurado*", inline: true },
      { name: "Canal ID", value: `\`${channel.id}\``, inline: true },

      { name: "Cargos ANTES", value: (rolesBefore ?? "*?*").slice(0, 1024) },
      { name: "Cargos removidos", value: (removedRoles ?? "*?*").slice(0, 1024) },
      { name: "Cargos DEPOIS", value: (rolesAfter ?? "*?*").slice(0, 1024) },

      { name: "Últimos deletados (histórico)", value: last10.slice(0, 1024) },
      { name: "Última punição (debug)", value: lastPunishmentText.slice(0, 1024) }
    )
    .setFooter({ text: "Sistema de Proteção SantaCreators" })
    .setTimestamp();

  // ✅ BOTÕES
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`cd_history:${guildId}:${executor.id}`)
      .setLabel("🔍 Ver histórico")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId(`cd_restore:${guildId}:${executor.id}`)
      .setLabel("♻️ Restaurar cargos")
      .setStyle(ButtonStyle.Danger)
  );

  await logChannel.send({
    content: `<@&${ownerRoleId}> <@&${adminRoleId}> — ação automática executada.`,
    embeds: [embed],
    components: [row],
  });
}
