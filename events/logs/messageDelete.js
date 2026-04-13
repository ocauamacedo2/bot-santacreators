// /application/events/logs/messageDelete.js
// Discord.js v14 (ESM)
//
// LOG PROFISSIONAL DE MENSAGENS APAGADAS + TRAVA ANTI-MASS-DELETE
//
// RECURSOS:
// - Armazena conteúdo apagado
// - Tenta recuperar anexos (imagem, gif, vídeo, arquivos)
// - Tenta recuperar imagem de embed
// - Mostra autor, executor, canal, categoria, links, horários
// - Detecta exclusão suspeita via audit logs
// - Se alguém apagar muitas mensagens de terceiros em pouco tempo:
//   -> remove cargos temporariamente
//   -> aplica timeout de 1 dia
//   -> opcionalmente aplica cargo de castigo
// - Envia alerta no canal configurado
// - Botão para restaurar cargos manualmente
// - Restauração automática após 1 dia
// - Persistência em JSON para sobreviver a reinícios
//
// OBS:
// - Se quiser usar cargo de castigo, preencha PUNISH_ROLE_ID
// - Se deixar null, o timeout já funciona como punição
//
// DEPENDE DE:
// - ./_deleteCache.js  (mantido do seu projeto)

import {
  AuditLogEvent,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionsBitField,
} from "discord.js";

import fs from "fs";
import path from "path";
import fetch from "node-fetch";

import { getCachedMessage } from "./_deleteCache.js";

// ========================= CONFIG =========================
const MAIN_GUILD_ID = "1262262852782129183";

// CANAIS DE LOG DE MENSAGENS APAGADAS
const CENTRAL_LOG_HUMAN_DELETE_ID = "1486084272862400706";
const CENTRAL_LOG_BOT_DELETE_ID = "1486084291765993605";

// CANAL SOMENTE PARA ALERTAS DE PUNIÇÃO / RESTAURAÇÃO
const SECURITY_ALERT_CHANNEL_ID = "1486084291765993605";

const LOCAL_LOG_CHANNELS = {
  '1362899773992079533': '1363295055384809483', // Cidade Santa -> #sc-logs
  '1452416085751234733': '1455312395269443813', // Administração -> #sc-logs
};

// Cargo opcional de castigo.
// Se não tiver um cargo específico, deixe null.
const PUNISH_ROLE_ID = null;

// IDs que nunca devem sofrer essa punição automática
const IMMUNE_USER_IDS = new Set([
  "1262262852949905408", // Owner
  "660311795327828008",  // Você
]);

// Cargos que tornam o membro imune à punição automática
const IMMUNE_ROLE_IDS = new Set([
  "1262262852949905409", // Resp. Influ
  "1352408327983861844", // Resp. Creators
  "1352407252216184833", // Resp. Líder
  "1388976314253312100", // Coord. Creators
  "1388975939161161728", // Gestor
]);

// Regra anti-mass-delete
const SUSPICIOUS_DELETE_WINDOW_MS = 60 * 1000; // 1 minuto
const SUSPICIOUS_DELETE_THRESHOLD = 8;         // mais de 8
const SUSPICIOUS_MIN_DISTINCT_CHANNELS = 2;    // vários canais

// Audit Log
const AUDIT_TIME_WINDOW_MS = 12_000;

// Storage
const STORAGE_DIR = path.join(process.cwd(), "storage", "deleted-attachments");
const STATE_DIR = path.join(process.cwd(), "data");
const SANCTIONS_FILE = path.join(STATE_DIR, "message_delete_sanctions.json");

// limpeza de arquivos
const MAX_FILE_AGE_MS = 24 * 60 * 60 * 1000; // 24h

// ======================= ESTADO ===========================
const recentDeleteActions = new Map(); // executorId -> [ações]
const activeSanctions = loadSanctionsFile(); // userId -> sanction
let restoreLoopStarted = false;
let buttonHandlerAttached = false;

// ======================= UTIL =============================
function ensureDirSync(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {}
}

function safe(str, fallback = "—") {
  if (str === null || str === undefined) return fallback;
  const s = String(str).trim();
  return s.length ? s : fallback;
}

function truncate(str, max = 1800) {
  const s = String(str ?? "");
  if (s.length <= max) return s;
  return `${s.slice(0, max - 3)}...`;
}

function tsFull(ms) {
  if (!ms) return "—";
  const t = Math.floor(ms / 1000);
  return `<t:${t}:F> • <t:${t}:R>`;
}

function formatDurationFromNow(targetMs) {
  if (!targetMs) return "—";
  const diff = Math.max(0, targetMs - Date.now());
  const hours = Math.floor(diff / (60 * 60 * 1000));
  const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
  return `${hours}h ${minutes}m`;
}

function getCategoryName(channel) {
  try {
    if (!channel) return "Sem categoria";
    if (channel.type === ChannelType.GuildCategory) return channel.name;
    return channel.parent?.name || "Sem categoria";
  } catch {
    return "Sem categoria";
  }
}

function getChannelLink(guildId, channelId) {
  if (!guildId || !channelId) return null;
  return `https://discord.com/channels/${guildId}/${channelId}`;
}

function getMessageLink(guildId, channelId, messageId) {
  if (!guildId || !channelId || !messageId) return null;
  return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}

function sanitizeFileName(name) {
  return safe(name, "arquivo")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .slice(0, 180);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanupStorage() {
  try {
    if (!fs.existsSync(STORAGE_DIR)) return;
    const files = fs.readdirSync(STORAGE_DIR);
    const now = Date.now();
    let deleted = 0;

    for (const file of files) {
      const filePath = path.join(STORAGE_DIR, file);
      try {
        const stat = fs.statSync(filePath);
        if (now - stat.mtimeMs > MAX_FILE_AGE_MS) {
          fs.unlinkSync(filePath);
          deleted++;
        }
      } catch {}
    }

    if (deleted > 0) {
      console.log(`[MessageDelete] Limpeza automática: ${deleted} arquivo(s) removido(s).`);
    }
  } catch (e) {
    console.error("[MessageDelete] Erro na limpeza automática:", e);
  }
}

function loadSanctionsFile() {
  try {
    ensureDirSync(STATE_DIR);
    if (!fs.existsSync(SANCTIONS_FILE)) return {};
    const raw = fs.readFileSync(SANCTIONS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveSanctionsFile() {
  try {
    ensureDirSync(STATE_DIR);
    const tmp = `${SANCTIONS_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(activeSanctions, null, 2), "utf8");
    fs.renameSync(tmp, SANCTIONS_FILE);
  } catch (e) {
    console.error("[MessageDelete] Falha ao salvar sanções:", e);
  }
}

async function downloadToFile(url, fullPath) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Falha ao baixar arquivo: ${res.status} ${res.statusText}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  await fs.promises.writeFile(fullPath, buffer);
  return fullPath;
}

function summarizeComponents(components) {
  try {
    if (!Array.isArray(components) || components.length === 0) return null;

    const lines = [];
    for (const row of components) {
      const comps = row?.components ?? [];
      for (const c of comps) {
        const label = safe(c.label, "sem-label");
        if (c.url) {
          lines.push(`🔗 **${label}** → ${c.url}`);
        } else if (c.customId) {
          lines.push(`🧩 **${label}** (customId: \`${c.customId}\`)`);
        } else {
          lines.push(`🧩 **${label}**`);
        }
      }
    }

    return lines.length ? lines.slice(0, 25).join("\n") : null;
  } catch {
    return null;
  }
}

function buildReconstructedEmbeds(embeds) {
  try {
    if (!Array.isArray(embeds) || embeds.length === 0) return [];

    const out = [];

    for (const e of embeds.slice(0, 3)) {
      const b = new EmbedBuilder();

      if (e.color) b.setColor(e.color);

      if (e.author?.name) {
        b.setAuthor({
          name: e.author.name,
          iconURL: e.author.iconURL ?? undefined,
          url: e.author.url ?? undefined,
        });
      }

      if (e.title) b.setTitle(String(e.title).slice(0, 256));
      if (e.url) b.setURL(e.url);
      if (e.description) b.setDescription(String(e.description).slice(0, 3800));

      if (e.thumbnail?.url) b.setThumbnail(e.thumbnail.url);
      if (e.image?.url) b.setImage(e.image.url);

      if (Array.isArray(e.fields) && e.fields.length) {
        b.addFields(
          e.fields.slice(0, 10).map(f => ({
            name: safe(f.name, "—").slice(0, 256),
            value: safe(f.value, "—").slice(0, 1024),
            inline: !!f.inline,
          }))
        );
      }

      if (e.footer?.text) {
        b.setFooter({
          text: String(e.footer.text).slice(0, 2048),
          iconURL: e.footer.iconURL ?? undefined,
        });
      }

      if (e.timestamp) {
        try {
          b.setTimestamp(new Date(e.timestamp));
        } catch {}
      }

      const hasSomething =
        e.title ||
        e.description ||
        e.fields?.length ||
        e.image?.url ||
        e.thumbnail?.url ||
        e.author?.name;

      if (hasSomething) out.push(b);
    }

    return out;
  } catch {
    return [];
  }
}

function isImmuneMember(member) {
  try {
    if (!member) return true;
    if (IMMUNE_USER_IDS.has(member.id)) return true;
    if (member.permissions?.has(PermissionsBitField.Flags.Administrator)) return true;
    for (const roleId of IMMUNE_ROLE_IDS) {
      if (member.roles.cache.has(roleId)) return true;
    }
    return false;
  } catch {
    return true;
  }
}

function registerDeleteAction({ executorId, targetAuthorId, channelId, messageId, timestamp }) {
  if (!executorId) return;

  const list = recentDeleteActions.get(executorId) ?? [];
  list.push({
    executorId,
    targetAuthorId,
    channelId,
    messageId,
    timestamp,
  });

  const cutoff = Date.now() - SUSPICIOUS_DELETE_WINDOW_MS;
  const filtered = list.filter(item => item.timestamp >= cutoff);
  recentDeleteActions.set(executorId, filtered);
}

function analyzeDeletePattern(executorId) {
  const list = recentDeleteActions.get(executorId) ?? [];
  const cutoff = Date.now() - SUSPICIOUS_DELETE_WINDOW_MS;
  const fresh = list.filter(item => item.timestamp >= cutoff);

  const count = fresh.length;
  const distinctChannels = new Set(fresh.map(x => x.channelId).filter(Boolean)).size;
  const distinctTargets = new Set(fresh.map(x => x.targetAuthorId).filter(Boolean)).size;

  return {
    count,
    distinctChannels,
    distinctTargets,
    actions: fresh,
    suspicious:
      count > SUSPICIOUS_DELETE_THRESHOLD &&
      distinctChannels >= SUSPICIOUS_MIN_DISTINCT_CHANNELS,
  };
}

async function findDeleterViaAuditLogs(guild, deletedMessage) {
  try {
    if (!guild || !deletedMessage) return null;

    const me = guild.members.me;
    if (!me) return null;
    if (!me.permissions.has(PermissionsBitField.Flags.ViewAuditLog)) return null;

    const logs = await guild.fetchAuditLogs({
      type: AuditLogEvent.MessageDelete,
      limit: 6,
    });

    const now = Date.now();
    const channelId = deletedMessage.channel?.id;

    for (const entry of logs.entries.values()) {
      const created = entry.createdTimestamp ?? 0;
      if (now - created > AUDIT_TIME_WINDOW_MS) continue;

      const extra = entry.extra;
      const sameChannel = extra?.channel?.id ? extra.channel.id === channelId : true;

      const target = entry.target;
      const sameTarget =
        target?.id && deletedMessage.author?.id
          ? target.id === deletedMessage.author.id
          : true;

      if (sameChannel && sameTarget) {
        return {
          executor: entry.executor ?? null,
          reason: entry.reason ?? null,
          matched: true,
        };
      }
    }

    return null;
  } catch {
    return null;
  }
}

function buildRestoreCustomId(userId) {
  return `restore_roles:${userId}`;
}

async function sendSecurityAlertMessage(client, payload) {
  try {
    const ch = await client.channels.fetch(SECURITY_ALERT_CHANNEL_ID).catch(() => null);
    if (!ch?.isTextBased()) return null;
    return await ch.send(payload).catch(() => null);
  } catch {
    return null;
  }
}

function resolveDeleteLogChannelId({ guild, deletionByBot }) {
  if (!guild) return null;

  // prioridade 1: roteamento local por servidor
  const localLogChannelId = LOCAL_LOG_CHANNELS[guild.id];
  if (localLogChannelId) return localLogChannelId;

  // prioridade 2: roteamento central por tipo
  return deletionByBot ? CENTRAL_LOG_BOT_DELETE_ID : CENTRAL_LOG_HUMAN_DELETE_ID;
}

async function restoreMemberRoles(guild, userId, restoredBy = null) {
  const sanction = activeSanctions[userId];
  if (!sanction) return { ok: false, reason: "Sanção não encontrada." };

  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) {
    delete activeSanctions[userId];
    saveSanctionsFile();
    return { ok: false, reason: "Membro não encontrado no servidor." };
  }

  try {
    const rolesToRestore = Array.isArray(sanction.removedRoleIds)
      ? sanction.removedRoleIds.filter(roleId => guild.roles.cache.has(roleId))
      : [];

    const managedRoles = rolesToRestore.filter(roleId => {
      const role = guild.roles.cache.get(roleId);
      if (!role) return false;
      return !role.managed && role.id !== guild.id;
    });

    if (managedRoles.length) {
      await member.roles.add(managedRoles, "Restauração automática/manual de cargos após trava anti-mass-delete");
    }

    if (PUNISH_ROLE_ID && member.roles.cache.has(PUNISH_ROLE_ID)) {
      await member.roles.remove(PUNISH_ROLE_ID, "Removendo cargo de castigo após restauração");
    }

    try {
      await member.timeout(null, "Fim da punição temporária por exclusões suspeitas");
    } catch {}

    delete activeSanctions[userId];
    saveSanctionsFile();

    return {
      ok: true,
      restoredRolesCount: managedRoles.length,
      restoredBy,
      member,
      sanction,
    };
  } catch (e) {
    return { ok: false, reason: e?.message || String(e) };
  }
}

async function processDueRestorations(client) {
  const now = Date.now();
  const entries = Object.entries(activeSanctions);

  for (const [userId, sanction] of entries) {
    if (!sanction?.restoreAt || sanction.restoreAt > now) continue;
    if (!sanction.guildId) continue;

    try {
      const guild = client.guilds.cache.get(sanction.guildId) ?? await client.guilds.fetch(sanction.guildId).catch(() => null);
      if (!guild) continue;

      const result = await restoreMemberRoles(guild, userId, "auto");

      const embed = new EmbedBuilder()
        .setColor(result.ok ? 0x57f287 : 0xed4245)
        .setAuthor({
          name: result.ok ? "✅ Cargos restaurados automaticamente" : "⚠️ Falha na restauração automática",
          iconURL: guild.iconURL({ size: 128 }) ?? undefined,
        })
        .addFields(
          {
            name: "👤 Membro",
            value: `<@${userId}> \n\`${userId}\``,
            inline: true,
          },
          {
            name: "🕒 Final da punição",
            value: tsFull(Date.now()),
            inline: true,
          },
          {
            name: "📦 Resultado",
            value: result.ok
              ? `Cargos restaurados: **${result.restoredRolesCount}**`
              : safe(result.reason),
            inline: false,
          },
        )
        .setTimestamp(new Date());

    await sendSecurityAlertMessage(client, { embeds: [embed] });
      await sleep(1200);
    } catch {}
  }
}

function ensureRestoreLoop(client) {
  if (restoreLoopStarted) return;
  restoreLoopStarted = true;

  cleanupStorage();
  setInterval(cleanupStorage, 60 * 60 * 1000);

  processDueRestorations(client).catch(() => null);
  setInterval(() => {
    processDueRestorations(client).catch(() => null);
  }, 60 * 1000);
}

function ensureInteractionHandler(client) {
  if (buttonHandlerAttached) return;
  buttonHandlerAttached = true;

  client.on("interactionCreate", async (interaction) => {
    try {
      if (!interaction.isButton()) return;
      if (!interaction.customId?.startsWith("restore_roles:")) return;

      const [, userId] = interaction.customId.split(":");
      if (!userId) {
        return interaction.reply({
          content: "Não consegui identificar o usuário para restauração.",
          ephemeral: true,
        }).catch(() => null);
      }

      const guild = interaction.guild;
      if (!guild) {
        return interaction.reply({
          content: "Esse botão só funciona dentro do servidor.",
          ephemeral: true,
        }).catch(() => null);
      }

      const memberWhoClicked = interaction.member;
      const canManage =
        memberWhoClicked?.permissions?.has?.(PermissionsBitField.Flags.ManageRoles) ||
        memberWhoClicked?.permissions?.has?.(PermissionsBitField.Flags.Administrator);

      if (!canManage) {
        return interaction.reply({
          content: "Você não tem permissão para restaurar cargos manualmente.",
          ephemeral: true,
        }).catch(() => null);
      }

      const result = await restoreMemberRoles(guild, userId, interaction.user.id);

      if (!result.ok) {
        return interaction.reply({
          content: `Não foi possível restaurar os cargos: ${safe(result.reason)}`,
          ephemeral: true,
        }).catch(() => null);
      }

      const restoredEmbed = new EmbedBuilder()
        .setColor(0x57f287)
        .setAuthor({
          name: "🔓 Restauração manual executada",
          iconURL: guild.iconURL({ size: 128 }) ?? undefined,
        })
        .addFields(
          {
            name: "👤 Membro restaurado",
            value: `${result.member ? `<@${result.member.id}>` : `<@${userId}>`}\n\`${userId}\``,
            inline: true,
          },
          {
            name: "🛠️ Restaurado por",
            value: `<@${interaction.user.id}>\n\`${interaction.user.tag ?? interaction.user.username}\``,
            inline: true,
          },
          {
            name: "📦 Cargos devolvidos",
            value: `**${result.restoredRolesCount}** cargo(s)`,
            inline: false,
          },
        )
        .setTimestamp(new Date());

      await interaction.reply({
        content: "Cargos restaurados com sucesso.",
        ephemeral: true,
      }).catch(() => null);

      await sendSecurityAlertMessage(interaction.client, {
  embeds: [restoredEmbed],
});
    } catch (e) {
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: `Erro ao restaurar cargos: ${safe(e?.message || e)}`,
            ephemeral: true,
          });
        }
      } catch {}
    }
  });
}

async function applySuspiciousDeletePunishment({
  client,
  guild,
  executorUser,
  member,
  analysis,
  reasonText,
}) {
  if (!guild || !executorUser || !member) {
    return { ok: false, reason: "Dados insuficientes para punir." };
  }

  if (activeSanctions[member.id]) {
    return { ok: false, reason: "Usuário já está com punição ativa." };
  }

  const restoreAt = Date.now() + 24 * 60 * 60 * 1000;

  const removableRoles = member.roles.cache
    .filter(role =>
      role.id !== guild.id &&
      !role.managed &&
      role.editable
    )
    .map(role => role.id);

  activeSanctions[member.id] = {
    guildId: guild.id,
    userId: member.id,
    removedRoleIds: removableRoles,
    appliedAt: Date.now(),
    restoreAt,
    reason: reasonText,
    stats: {
      count: analysis.count,
      distinctChannels: analysis.distinctChannels,
      distinctTargets: analysis.distinctTargets,
    },
  };
  saveSanctionsFile();

  try {
    if (removableRoles.length) {
      await member.roles.remove(removableRoles, "Trava de segurança: exclusões suspeitas de mensagens de terceiros");
    }
  } catch (e) {
    delete activeSanctions[member.id];
    saveSanctionsFile();
    return { ok: false, reason: `Falha ao remover cargos: ${safe(e?.message || e)}` };
  }

  try {
    await member.timeout(24 * 60 * 60 * 1000, "Trava de segurança: exclusões suspeitas de mensagens de terceiros");
  } catch {}

  if (PUNISH_ROLE_ID && guild.roles.cache.has(PUNISH_ROLE_ID)) {
    try {
      await member.roles.add(PUNISH_ROLE_ID, "Aplicando cargo de castigo temporário");
    } catch {}
  }

  const restoreButton = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(buildRestoreCustomId(member.id))
      .setLabel("Restaurar cargos agora")
      .setStyle(ButtonStyle.Success)
      .setEmoji("🔓")
  );

  const alertEmbed = new EmbedBuilder()
    .setColor(0xed4245)
    .setAuthor({
      name: "🚨 Trava de segurança ativada",
      iconURL: guild.iconURL({ size: 128 }) ?? undefined,
    })
    .addFields(
      {
        name: "👤 Executor identificado",
        value: `<@${executorUser.id}>\n\`${executorUser.tag ?? executorUser.username} (${executorUser.id})\``,
        inline: true,
      },
      {
        name: "📊 Atividade suspeita",
        value:
          `Mensagens de terceiros apagadas: **${analysis.count}**\n` +
          `Canais diferentes: **${analysis.distinctChannels}**\n` +
          `Autores afetados: **${analysis.distinctTargets}**`,
        inline: true,
      },
      {
        name: "🛡️ Ações aplicadas",
        value:
          `• Remoção temporária de cargos\n` +
          `• Timeout de 1 dia\n` +
          `${PUNISH_ROLE_ID ? "• Cargo de castigo aplicado\n" : ""}` +
          `• Restauração automática em: ${tsFull(restoreAt)}`,
        inline: false,
      },
      {
        name: "📝 Motivo",
        value: safe(reasonText),
        inline: false,
      },
      {
        name: "⏳ Tempo restante",
        value: formatDurationFromNow(restoreAt),
        inline: true,
      },
      {
        name: "⚠️ Aviso",
        value:
          "Um comportamento de exclusão em massa de mensagens de terceiros foi detectado. " +
          "Os cargos foram removidos temporariamente por segurança. " +
          "Tomem cuidado e revisem a ação.",
        inline: false,
      }
    )
    .setTimestamp(new Date());

  await sendSecurityAlertMessage(client, {
  embeds: [alertEmbed],
  components: [restoreButton],
});

  return { ok: true, restoreAt };
}

// ======================= EXPORT ===========================
export default {
  name: "messageDelete",
  once: false,

  async execute(message, client) {
    try {
      if (!message?.guild) return;
      if (message.guild.id !== MAIN_GUILD_ID) return;

      ensureDirSync(STORAGE_DIR);
      ensureDirSync(STATE_DIR);
      ensureRestoreLoop(client);
      ensureInteractionHandler(client);

      if (message.partial) {
        try {
          message = await message.fetch();
        } catch {}
      }

      const guild = message.guild;
      const channel = message.channel;

      const cached = getCachedMessage(message.channelId, message.id);

      const authorObj = cached?.author ?? (message.author ? {
        id: message.author.id,
        tag: message.author.tag ?? message.author.username ?? null,
        bot: !!message.author.bot,
        avatar: message.author.displayAvatarURL?.({ size: 256 }) ?? null,
      } : null);

      const createdTs = cached?.createdTimestamp ?? message.createdTimestamp ?? null;
      const deletedAt = Date.now();

      const contentText = (cached?.content ?? message.content ?? "").toString();
      const embedsArr = cached?.embeds?.length
        ? cached.embeds
        : (Array.isArray(message.embeds) ? message.embeds : []);
      const componentsArr = cached?.components?.length
        ? cached.components
        : (Array.isArray(message.components) ? message.components : []);
      const attachmentsArr = cached?.attachments ?? [];

      const audit = await findDeleterViaAuditLogs(guild, message);
      const deleterUser = audit?.executor ?? null;

      const selfDelete = !deleterUser;

      const deletionByBot =
        (deleterUser?.bot === true) ||
        (selfDelete && authorObj?.bot === true) ||
        (selfDelete && !authorObj);

      const categoryName = getCategoryName(channel);

      const authorTag = authorObj
        ? `${safe(authorObj.tag, "Desconhecido")} (${authorObj.id})`
        : "Desconhecido";

      const deleterTag = deleterUser
        ? `${deleterUser.tag ?? deleterUser.username} (${deleterUser.id})`
        : selfDelete
          ? (deletionByBot ? "Próprio bot (self-delete)" : "Próprio autor (self-delete)")
          : "Desconhecido";

      const contentFallback = "Mensagem sem conteúdo visível (pode ser embed, anexo, imagem, gif, vídeo ou componente)";
      const contentForLog = safe(contentText, contentFallback);

      const channelLink = getChannelLink(guild.id, channel?.id);
      const messageLink = getMessageLink(guild.id, channel?.id, message?.id);

      const attachments = [];
      const savedFiles = [];
      const rawAttachmentInfos = [];
      let totalSize = 0;
      const MAX_UPLOAD_BYTES = 7.5 * 1024 * 1024; // Limite de segurança de 7.5MB

      // anexos diretos do evento
      if (message.attachments?.size) {
        for (const att of message.attachments.values()) {
          try {
            const name = sanitizeFileName(att.name || `arquivo_${Date.now()}`);
            const filePath = path.join(
              STORAGE_DIR,
              `${guild.id}_${channel.id}_${Date.now()}_${name}`
            );

            await downloadToFile(att.url, filePath);
            const stats = fs.statSync(filePath);

            if (totalSize + stats.size < MAX_UPLOAD_BYTES) {
              totalSize += stats.size;
              savedFiles.push({ filePath, originalName: name, url: att.url, contentType: att.contentType ?? null });
              attachments.push(new AttachmentBuilder(filePath, { name }));
              rawAttachmentInfos.push(
                `• \`${name}\`${att.contentType ? ` • ${att.contentType}` : ""}\n${att.url}`
              );
            } else {
              rawAttachmentInfos.push(`• \`${name}\` (⚠️ Muito grande para upload)\n${att.url}`);
            }
          } catch {}
        }
      }

      // anexos vindos do cache
      for (const a of attachmentsArr) {
        try {
          if (!a?.url) continue;

          const name = sanitizeFileName(a.name || `arquivo_cache_${Date.now()}`);
          const filePath = path.join(
            STORAGE_DIR,
            `${guild.id}_${channel.id}_${Date.now()}_${name}`
          );

          await downloadToFile(a.url, filePath);
          const stats = fs.statSync(filePath);

          if (totalSize + stats.size < MAX_UPLOAD_BYTES) {
            totalSize += stats.size;
            savedFiles.push({
              filePath,
              originalName: name,
              url: a.url,
              contentType: a.contentType ?? null,
            });
            attachments.push(new AttachmentBuilder(filePath, { name }));
            rawAttachmentInfos.push(`• \`${name}\`${a.contentType ? ` • ${a.contentType}` : ""}\n${a.url}`);
          } else {
            rawAttachmentInfos.push(`• \`${name}\` (⚠️ Muito grande para upload)\n${a.url}`);
          }
        } catch {}
      }

      // imagem do embed
      try {
        const embedImgUrl = embedsArr?.[0]?.image?.url || null;
        if (embedImgUrl) {
          const extMatch = embedImgUrl.split("?")[0].match(/\.(png|jpe?g|gif|webp)$/i);
          const ext = extMatch ? extMatch[1].toLowerCase() : "png";
          const name = `embed_image_${Date.now()}.${ext}`;
          const filePath = path.join(STORAGE_DIR, `${guild.id}_${channel.id}_${name}`);

          await downloadToFile(embedImgUrl, filePath).catch(() => null);

          if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            if (totalSize + stats.size < MAX_UPLOAD_BYTES) {
              totalSize += stats.size;
              savedFiles.push({
                filePath,
                originalName: name,
                url: embedImgUrl,
                contentType: `image/${ext}`,
              });
              attachments.push(new AttachmentBuilder(filePath, { name }));
              rawAttachmentInfos.push(`• \`${name}\` • imagem de embed\n${embedImgUrl}`);
            } else {
              rawAttachmentInfos.push(`• \`imagem_embed\` (⚠️ Muito grande para upload)\n${embedImgUrl}`);
            }
          }
        }
      } catch {}

      const reconstructedEmbeds = buildReconstructedEmbeds(embedsArr);
      const componentsSummary = summarizeComponents(componentsArr);

      const mainEmbed = new EmbedBuilder()
        .setColor(deletionByBot ? 0x5865f2 : 0xff2d55)
        .setAuthor({
          name: deletionByBot ? "🤖 Conteúdo apagado por BOT" : "🗑️ Conteúdo apagado",
          iconURL: guild.iconURL({ size: 128 }) ?? undefined,
        })
        .addFields(
          {
            name: "👤 Autor da mensagem",
            value: authorObj
              ? `${authorObj.bot ? "🤖" : "🧑"} <@${authorObj.id}>\n\`${authorTag}\``
              : "Desconhecido",
            inline: true,
          },
          {
            name: "🧹 Quem apagou",
            value: deleterUser
              ? `${deleterUser.bot ? "🤖" : "🧑"} <@${deleterUser.id}>\n\`${deleterTag}\``
              : `🧑 \`${deleterTag}\``,
            inline: true,
          },
          {
            name: "📍 Local",
            value:
              `**Servidor:** ${safe(guild.name)}\n` +
              `**Canal:** <#${channel?.id ?? "0"}>\n` +
              `**Categoria:** ${safe(categoryName)}`,
            inline: false,
          },
          {
            name: "🕒 Horários",
            value:
              `**Criada:** ${tsFull(createdTs)}\n` +
              `**Apagada:** ${tsFull(deletedAt)}`,
            inline: false,
          },
          {
            name: "🆔 Identificadores",
            value:
              `**ID da mensagem:** \`${safe(message.id)}\`\n` +
              `**ID do autor:** \`${safe(authorObj?.id)}\`\n` +
              `**ID do canal:** \`${safe(channel?.id)}\``,
            inline: false,
          },
        )
        .setFooter({
          text: deletionByBot
            ? "Logger de mensagens apagadas • origem BOT"
            : "Logger de mensagens apagadas • origem HUMANO",
        })
        .setTimestamp(new Date());

      const thumb = authorObj?.avatar ?? (message.author?.displayAvatarURL?.({ size: 256 }) ?? null);
      if (thumb) mainEmbed.setThumbnail(thumb);

      mainEmbed.addFields({
        name: "💬 Conteúdo apagado",
        value: `\`\`\`\n${truncate(contentForLog, 1800)}\n\`\`\``,
        inline: false,
      });

      if (componentsSummary) {
        mainEmbed.addFields({
          name: "🧷 Botões / componentes encontrados",
          value: truncate(componentsSummary, 3800),
          inline: false,
        });
      }

      const linkLines = [];
      if (channelLink) linkLines.push(`🔗 **Canal:** ${channelLink}`);
      if (messageLink) linkLines.push(`🧾 **Mensagem:** ${messageLink}`);

      if (linkLines.length) {
        mainEmbed.addFields({
          name: "🔎 Links",
          value: linkLines.join("\n"),
          inline: false,
        });
      }

      if (audit?.reason) {
        mainEmbed.addFields({
          name: "📝 Motivo no audit log",
          value: safe(audit.reason),
          inline: false,
        });
      }

      if (rawAttachmentInfos.length) {
        mainEmbed.addFields({
          name: `📎 Arquivos recuperados (${rawAttachmentInfos.length})`,
          value: truncate(rawAttachmentInfos.slice(0, 10).join("\n\n"), 3800),
          inline: false,
        });
      }

      if (attachments.length) {
        const first = attachments[0];
        if (first?.name && /\.(png|jpe?g|gif|webp)$/i.test(first.name)) {
          mainEmbed.setImage(`attachment://${first.name}`);
        }
      }

      const embedsToSend = [mainEmbed, ...reconstructedEmbeds].slice(0, 10);

     const deleteLogChannelId = resolveDeleteLogChannelId({ guild, deletionByBot });

if (deleteLogChannelId) {
  const deleteLogChannel = await client.channels.fetch(deleteLogChannelId).catch(() => null);

  if (deleteLogChannel?.isTextBased()) {
    const embedsForDeleteLog = embedsToSend.map(e => new EmbedBuilder(e.toJSON()));
    await deleteLogChannel.send({
      embeds: embedsForDeleteLog,
      files: attachments.length ? attachments.slice(0, 10) : undefined,
    }).catch(console.error);
  }
}

      // ================= TRAVA DE SEGURANÇA =================
      // Só considera suspeito quando alguém apaga mensagem de OUTRA pessoa.
      // Não pune auto-delete e nem exclusão do próprio conteúdo.
      if (
        deleterUser &&
        authorObj?.id &&
        deleterUser.id !== authorObj.id &&
        !deleterUser.bot
      ) {
        registerDeleteAction({
          executorId: deleterUser.id,
          targetAuthorId: authorObj.id,
          channelId: channel?.id,
          messageId: message?.id,
          timestamp: deletedAt,
        });

        const member = await guild.members.fetch(deleterUser.id).catch(() => null);

        if (member && !isImmuneMember(member)) {
          const analysis = analyzeDeletePattern(deleterUser.id);

          if (analysis.suspicious) {
            const reasonText =
              `Exclusão suspeita em massa detectada em menos de 1 minuto. ` +
              `Foram apagadas **${analysis.count}** mensagens de terceiros em **${analysis.distinctChannels}** canais.`;

            await applySuspiciousDeletePunishment({
              client,
              guild,
              executorUser: deleterUser,
              member,
              analysis,
              reasonText,
            });
          }
        }
      }
    } catch (err) {
      try {
       try {
  const errorLogChannel = await client.channels.fetch(CENTRAL_LOG_HUMAN_DELETE_ID).catch(() => null);
  if (errorLogChannel?.isTextBased()) {
    await errorLogChannel.send({
      content: `⚠️ Erro no logger de messageDelete: \`${truncate(String(err?.stack || err?.message || err), 1800)}\``,
    }).catch(() => null);
  }
} catch {}
      } catch {}
    }
  },
};