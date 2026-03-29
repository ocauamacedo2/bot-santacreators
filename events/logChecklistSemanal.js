import fs from "node:fs";
import path from "node:path";
import cron from "node-cron";
import { fileURLToPath } from "node:url";
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  MessageFlags,
  PermissionsBitField,
  Guild
} from "discord.js";
import { dashEmit } from "../utils/dashHub.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===============================
// CONFIGURAÇÃO
// ===============================
const DATA_DIR = path.resolve(process.cwd(), "data");
const CHECKLIST_FILE = path.join(DATA_DIR, "sc_logs_checklist.json");
const GI_DATA_FILE = path.join(DATA_DIR, "sc_gi_registros.json");
const GI_DATA_FILE_ROOT = path.resolve(process.cwd(), "sc_gi_registros.json");

const TZ = "America/Sao_Paulo";
const ROLE_PRIORITY = "1371733765243670538"; // Membros Prioritários
const LOG_CHANNEL_ID = "1460339582842310731"; // Auditoria

const PANEL_CONFIG = {
  CHANNEL_ID: "1477800974574682242",
  STATE_FILE: path.join(DATA_DIR, "sc_checklist_panel_state.json")
};

const AUTH_CONFIG = {
  // Acesso Total (Admins)
  SUPER_IDS: ["660311795327828008", "1262262852949905408", "1352408327983861844"],
  // Cargos autorizados do GI
  ROLE_IDS: [
    "1352408327983861844", // resp creator
    "1414651836861907006", // responsáveis
    "1262262852949905409", // resp influ
    "1352407252216184833"  // resp líder
  ]
};

// ===============================
// HELPERS DE TEMPO (SP)
// ===============================
export function getNowSP() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: TZ }));
}

/**
 * Gera a chave da semana (Domingo) baseada em uma data.
 * @param {Date|number|string} inputDate 
 * @returns {string} YYYY-MM-DD
 */
function weekKeyFromDateSP(inputDate = null) {
  const date = inputDate ? new Date(inputDate) : getNowSP();
  const d = new Date(date.toLocaleString("en-US", { timeZone: TZ }));
  const day = d.getDay(); // 0 = Dom
  const diff = d.getDate() - day;
  const sunday = new Date(d.setDate(diff));
  return sunday.toISOString().slice(0, 10);
}

function getWeekRangeLabel(weekKey) {
  const start = new Date(weekKey + "T00:00:00");
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  const fmt = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  return `${fmt(start)} → ${fmt(end)}`;
}

/**
 * Resolve a guilda principal de forma consistente.
 * @param {import("discord.js").Client} client
 * @param {import("discord.js").Guild | null} sourceGuild
 * @returns {import("discord.js").Guild | null}
 */
function resolveMainGuild(client, sourceGuild = null) {
  if (sourceGuild) return sourceGuild;
  // Tenta pegar a guilda do cache do cliente, se houver apenas uma, ou a primeira.
  // Isso é um fallback para contextos onde a guild não está diretamente disponível (ex: cron jobs).
  if (client.guilds.cache.size === 1) return client.guilds.cache.first();
  return null;
}

/**
 * Resolve a identificação visual de um usuário (Menção + Nome).
 * @param {import("discord.js").Guild} guild 
 * @param {string} userId 
 * @returns {Promise<string>} "<@id> (**Nome**)"
 */
async function resolveMemberDisplay(guild, userId) {
  if (!guild) return `<@${userId}>`;

  let member = guild.members.cache.get(userId);
  if (!member) {
    try {
      member = await guild.members.fetch(userId);
    } catch {}
  }

  if (!member) return `<@${userId}>`;

  const name = member.displayName || member.user.username;
  return `<@${userId}> (**${name}**)`;
}

async function resolveMemberPlainName(guild, userId) {
  if (!guild) return String(userId);

  let member = guild.members.cache.get(userId);
  if (!member) {
    try {
      member = await guild.members.fetch(userId);
    } catch {}
  }

  return member?.displayName || member?.user?.username || String(userId);
}

// ===============================
// PERSISTÊNCIA ATÔMICA
// ===============================
function loadJSON(file, fallback = {}) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch { return fallback; }
}

function saveJSON(file, data) {
  try {
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
    fs.renameSync(tmp, file);
  } catch (e) {
    console.error(`[ChecklistLogs] Erro ao salvar:`, e);
  }
}

/**
 * Helper central para atualizar o painel principal em qualquer canal que ele esteja.
 */
async function refreshMainPanel(client, sourceGuild = null) {
  const panelState = loadJSON(PANEL_CONFIG.STATE_FILE, {});
  if (!panelState?.channelId || !panelState?.messageId) return false;

  console.log("[ChecklistLogs] Atualizando painel principal...", panelState);
  try {
    const guild = resolveMainGuild(client, sourceGuild);
    const channel = await client.channels.fetch(panelState.channelId).catch(() => null);
    if (!channel) return false;

    const msg = await channel.messages.fetch(panelState.messageId).catch(() => null);
    if (!msg) {
      console.warn("[ChecklistLogs] Painel principal não encontrado para atualização (mensagem deletada ou inacessível).");
      return false;
    }

    const payload = await buildMainPanel(client, guild);
    await msg.edit(payload);
    return true;
  } catch (e) {
    console.error("[ChecklistLogs] Falha ao atualizar painel principal:", e);
    return false;
  }
}

// ===============================
// LÓGICA DE DADOS & SINCRONIZAÇÃO
// ===============================
function normalizeId(value) {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return /^\d{5,25}$/.test(str) ? str : null;
}

function extractResponsibleIds(reg) {
  const direct =
    normalizeId(reg?.responsibleUserId) ||
    normalizeId(reg?.responsavelUserId) ||
    normalizeId(reg?.responsavelId) ||
    null;

  if (direct) {
    return [direct];
  }

  if (Array.isArray(reg?.responsibleHistory) && reg.responsibleHistory.length > 0) {
    const sortedHistory = [...reg.responsibleHistory]
      .filter(item => item && typeof item === "object")
      .sort((a, b) => Number(b?.atMs || 0) - Number(a?.atMs || 0));

    for (const item of sortedHistory) {
      const histId =
        normalizeId(item?.userId) ||
        normalizeId(item?.responsavelId) ||
        normalizeId(item?.id) ||
        null;

      if (histId) {
        return [histId];
      }
    }
  }

  if (Array.isArray(reg?.responsaveis)) {
    for (const item of reg.responsaveis) {
      const fallbackId =
        normalizeId(typeof item === "object" ? item?.userId : item) ||
        normalizeId(typeof item === "object" ? item?.responsavelId : null) ||
        normalizeId(typeof item === "object" ? item?.id : null);

      if (fallbackId) {
        return [fallbackId];
      }
    }
  }

  if (Array.isArray(reg?.responsavelIds)) {
    for (const item of reg.responsavelIds) {
      const fallbackId = normalizeId(item);
      if (fallbackId) {
        return [fallbackId];
      }
    }
  }

  return [];
}

function extractTargetId(reg) {
  return (
    normalizeId(reg?.targetId) ||
    normalizeId(reg?.userId) ||
    normalizeId(reg?.memberId) ||
    normalizeId(reg?.creatorId) ||
    normalizeId(reg?.colaboradorId) ||
    null
  );
}

function isChecklistEligibleGiRecord(reg) {
  if (!reg || typeof reg !== "object") return false;

  const targetId = extractTargetId(reg);
  const responsibleIds = extractResponsibleIds(reg);

  if (!targetId || responsibleIds.length === 0) return false;

  if (reg.deleted === true) return false;
  if (reg.removed === true) return false;
  if (reg.desligado === true) return false;
  if (reg.archived === true) return false;
  if (reg.isArchived === true) return false;
  if (reg.status === "desligado") return false;
  if (reg.status === "arquivado") return false;
  if (reg.status === "removido") return false;

  // Se existir a flag active e ela estiver false, exclui.
  if (typeof reg.active === "boolean" && reg.active === false) return false;

  return true;
}

function pickLatestEligibleGiRecords(registros = []) {
  const byTarget = new Map();

  for (const reg of registros) {
    if (!isChecklistEligibleGiRecord(reg)) continue;

    const targetId = extractTargetId(reg);
    if (!targetId) continue;

    const prev = byTarget.get(targetId);

    const regScore = Math.max(
      Number(reg?.updatedAtMs || 0),
      Number(reg?.createdAtMs || 0),
      Number(reg?.roleSetAtMs || 0),
      Number(reg?.joinDateMs || 0)
    );

    const prevScore = prev
      ? Math.max(
          Number(prev?.updatedAtMs || 0),
          Number(prev?.createdAtMs || 0),
          Number(prev?.roleSetAtMs || 0),
          Number(prev?.joinDateMs || 0)
        )
      : -1;

    if (!prev || regScore >= prevScore) {
      byTarget.set(targetId, reg);
    }
  }

  return [...byTarget.values()];
}

function readChecklistWeek(weekKey = weekKeyFromDateSP()) {
  const checklist = loadJSON(CHECKLIST_FILE, { weeks: {} });

  if (!checklist.weeks[weekKey]) {
    checklist.weeks[weekKey] = { lastSyncedAt: null, responsaveis: {} };
    saveJSON(CHECKLIST_FILE, checklist);
  }

  return checklist;
}

function loadGiSource() {
  const dataFile = loadJSON(GI_DATA_FILE, null);
  if (dataFile && Array.isArray(dataFile.registros) && dataFile.registros.length > 0) {
    return dataFile;
  }

  const rootFile = loadJSON(GI_DATA_FILE_ROOT, null);
  if (rootFile && Array.isArray(rootFile.registros) && rootFile.registros.length > 0) {
    return rootFile;
  }

  return { registros: [] };
}

function syncWeekData() {
  const checklist = loadJSON(CHECKLIST_FILE, { weeks: {} });
  const giData = loadGiSource();
  const weekKey = weekKeyFromDateSP();

  if (!checklist.weeks[weekKey]) {
    checklist.weeks[weekKey] = { lastSyncedAt: null, responsaveis: {} };
  }

  const currentWeek = checklist.weeks[weekKey];
  const rawRegistros = Array.isArray(giData?.registros) ? giData.registros : [];
  const registros = pickLatestEligibleGiRecords(rawRegistros);

  const giMap = new Map(); // respId -> Map(memberId -> memberData)

  for (const reg of registros) {
    const targetId = extractTargetId(reg);
    const responsibleIds = extractResponsibleIds(reg);

    if (!targetId || responsibleIds.length === 0) continue;

    const area =
      reg?.area ||
      reg?.setor ||
      reg?.departamento ||
      reg?.responsibleType ||
      "Geral";

    for (const respId of responsibleIds) {
      if (!giMap.has(respId)) giMap.set(respId, new Map());

      giMap.get(respId).set(targetId, {
        id: targetId,
        area,
        sourceMessageId: reg?.messageId || null,
        sourceCreatedAtMs: Number(reg?.createdAtMs || 0)
      });
    }
  }

  const newResponsaveis = {};

  for (const [respId, memberMap] of giMap.entries()) {
    const previousRespMembers = currentWeek.responsaveis?.[respId]?.members || {};
    newResponsaveis[respId] = { members: {} };

    for (const [memberId, memberData] of memberMap.entries()) {
      const existing = previousRespMembers[memberId];

      newResponsaveis[respId].members[memberId] = {
        checked: existing?.checked === true,
        checkedAt: existing?.checkedAt || null,
        checkedBy: existing?.checkedBy || null,
        area: memberData.area || existing?.area || "Geral",
        sourceMessageId: memberData.sourceMessageId || existing?.sourceMessageId || null,
        sourceCreatedAtMs: memberData.sourceCreatedAtMs || existing?.sourceCreatedAtMs || null
      };
    }
  }

  currentWeek.responsaveis = newResponsaveis;
  currentWeek.lastSyncedAt = Date.now();

  saveJSON(CHECKLIST_FILE, checklist);
  return checklist;
}

function hasPermission(member, type = "use") {
  if (!member) return false;
  if (AUTH_CONFIG.SUPER_IDS.includes(member.id)) return true;
  if (type === "admin") return false; // Somente Super IDs para admin total
  return member.roles.cache.some(r => AUTH_CONFIG.ROLE_IDS.includes(r.id));
}

// ===============================
// UI BUILDERS
// ===============================
function buildProgressBar(value, total) {
  const size = 10;
  const progress = Math.round((value / total) * size) || 0;
  const empty = size - progress;
  return `${"🟩".repeat(progress)}${"⬛".repeat(empty)} **${Math.round((value / total) * 100) || 0}%**`;
}

async function buildMainPanel(client, sourceGuild = null) {
  const guild = resolveMainGuild(client, sourceGuild);
  const weekKey = weekKeyFromDateSP();
  const checklist = syncWeekData();
  const data = checklist.weeks[weekKey] || { responsaveis: {}, lastSyncedAt: null };
  const isSunday = getNowSP().getDay() === 0;

  let totalMembers = 0;
  let checkedMembers = 0;
  let respsWithPending = 0;

  const fields = [];
  const respEntries = Object.entries(data.responsaveis || {});

  for (const [respId, content] of respEntries) {
    const membersObj = content?.members || {};
    const members = Object.values(membersObj);
    const membersEntries = Object.entries(membersObj);
    const count = members.length;
    const checked = members.filter(m => m.checked).length;

    totalMembers += count;
    checkedMembers += checked;
    if (checked < count) respsWithPending++;

    const nameDisplay = await resolveMemberPlainName(guild, respId);
const allDone = count > 0 && checked === count;

const memberLines = [];
for (const [mId, m] of membersEntries.slice(0, 5)) {
  const mStatus = m.checked ? "🟢" : (isSunday ? "🟡" : "🔴");
  const mDisplay = await resolveMemberDisplay(guild, mId);
  memberLines.push(`${mStatus} ${mDisplay}`);
}

let memberListText = memberLines.join("\n");
if (count > 5) memberListText += `\n*+${count - 5} restantes...*`;
if (count === 0) memberListText = "_Nenhum membro vinculado._";

fields.push({
  name: `👤 Responsável: ${nameDisplay} ${allDone ? "🟢" : "🔴"}`,
  value: `📊 ${checked}/${count} conferidos\n\n${memberListText}\n━━━━━━━━━━━━━━━━━━━`,
  inline: false
});
  }

  if (fields.length === 0) {
    fields.push({
      name: "👤 Responsáveis",
      value: "_Nenhum responsável encontrado na semana atual. Use o botão **Sincronizar GI**._",
      inline: false
    });
  }

  const embed = new EmbedBuilder()
    .setTitle("📋 Checklist Semanal de Logs")
    .setDescription(
      `📅 **Semana:** ${getWeekRangeLabel(weekKey)}\n` +
      `🕒 **Fechamento:** Domingo às 23:59\n\n` +
      `📌 **Responsáveis com pendência:** \`${respsWithPending}\`\n` +
      `✅ **Membros conferidos:** \`${checkedMembers}\`\n` +
      `❌ **Membros pendentes:** \`${totalMembers - checkedMembers}\`\n` +
      `🕓 **Última sincronização GI:** ${data.lastSyncedAt ? `<t:${Math.floor(data.lastSyncedAt / 1000)}:R>` : "`Nunca`"}\n\n` +
      `📊 **Progresso Geral:**\n${buildProgressBar(checkedMembers, totalMembers)}\n`
    )
    .addFields(fields)
    .setColor(respsWithPending === 0 ? "#2ecc71" : (isSunday ? "#f1c40f" : "#9b59b6"))
    .setThumbnail(client.user.displayAvatarURL())
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("logcheck_my_members").setLabel("Gerenciar Meus Membros").setStyle(ButtonStyle.Success).setEmoji("✅"),
    new ButtonBuilder().setCustomId("logcheck_admin_view").setLabel("Visão Geral").setStyle(ButtonStyle.Primary).setEmoji("👑"),
    new ButtonBuilder().setCustomId("logcheck_sync_gi").setLabel("Sincronizar GI").setStyle(ButtonStyle.Secondary).setEmoji("🔄")
  );

  return { embeds: [embed], components: [row] };
}

// ===============================
// HANDLERS (Interações)
// ===============================
export async function checklistHandleInteraction(interaction, client) {
  if (!interaction.guild) return false;
  const customId = interaction.customId;

  // 1. Sincronizar GI
  if (customId === "logcheck_sync_gi") {
    if (!hasPermission(interaction.member)) {
      return interaction.reply({ content: "❌ Sem permissão.", flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const checklist = syncWeekData();
    const weekKey = weekKeyFromDateSP();
    const data = checklist.weeks?.[weekKey] || { responsaveis: {} };

    const totalResponsaveis = Object.keys(data.responsaveis || {}).length;
    const totalMembros = Object.values(data.responsaveis || {}).reduce((acc, resp) => {
      return acc + Object.keys(resp?.members || {}).length;
    }, 0);

    await refreshMainPanel(client, interaction.guild);

    return interaction.editReply(
      `✅ Dados sincronizados com sucesso!\n` +
      `👤 Responsáveis carregados: **${totalResponsaveis}**\n` +
      `🧍 Membros carregados: **${totalMembros}**`
    );
  }

  // 2. Gerenciar Meus Membros
if (customId === "logcheck_my_members") {
  if (!hasPermission(interaction.member)) {
    return interaction.reply({ content: "❌ Você não é um responsável registrado.", flags: MessageFlags.Ephemeral });
  }
  
  const checklist = syncWeekData();
  const weekKey = weekKeyFromDateSP();
  const data = checklist.weeks?.[weekKey] || { responsaveis: {} };
  const myData = data.responsaveis?.[interaction.user.id];

  if (!myData || Object.keys(myData.members || {}).length === 0) {
    return interaction.reply({ content: "❌ Você não possui membros vinculados a você nesta semana.", flags: MessageFlags.Ephemeral });
  }

  return sendPersonalManager(interaction, interaction.user.id, weekKey, myData);
}

  // 3. Visão Geral (Admin)
  if (customId === "logcheck_admin_view") {
  const guild = interaction.guild;
  if (!hasPermission(interaction.member, "admin")) {
    return interaction.reply({ content: "❌ Apenas Administradores podem acessar a visão geral.", flags: MessageFlags.Ephemeral });
  }
  
  const checklist = syncWeekData();
  const weekKey = weekKeyFromDateSP();
  const data = checklist.weeks?.[weekKey] || { responsaveis: {} };

  const options = [];
for (const [respId, content] of Object.entries(data.responsaveis || {})) {
  const pending = Object.values(content?.members || {}).filter(m => !m.checked).length;

  let member = guild.members.cache.get(respId);
  if (!member) { try { member = await guild.members.fetch(respId); } catch {} }
  const rawName = member?.displayName || member?.user?.username || respId;

  options.push({
    label: String(rawName).slice(0, 100),
    value: `logcheck_inspect:${respId}:${weekKey}`,
    description: String(pending === 0 ? "Em dia" : `${pending} pendências encontradas`).slice(0, 100),
    emoji: pending === 0 ? "🟢" : "🔴"
  });
}

if (options.length === 0) {
  return interaction.reply({
    content: "❌ Nenhum responsável encontrado na semana atual.",
    flags: MessageFlags.Ephemeral
  });
}

const select = new ActionRowBuilder().addComponents(
  new StringSelectMenuBuilder()
    .setCustomId("logcheck_admin_select")
    .setPlaceholder("Selecione um responsável para inspecionar")
    .addOptions(options.slice(0, 25))
);

return interaction.reply({
  content: "👑 **Painel Administrativo**\nEscolha um responsável para ver detalhes ou alterar status.",
  components: [select],
  flags: MessageFlags.Ephemeral
});
  }

  // 4. Seleção Admin
if (interaction.isStringSelectMenu() && customId === "logcheck_admin_select") {
  const [, respId, weekKey] = interaction.values[0].split(":");
  const checklist = loadJSON(CHECKLIST_FILE, { weeks: {} });
  const data = checklist.weeks?.[weekKey]?.responsaveis?.[respId];

  if (!data) {
    return interaction.reply({
      content: "❌ Não encontrei dados desse responsável na semana atual.",
      flags: MessageFlags.Ephemeral
    });
  }

  return sendPersonalManager(interaction, respId, weekKey, data, true);
}

  // 5. Toggle Status Individual
  if (interaction.isStringSelectMenu() && customId.startsWith("logcheck_toggle:")) {
    const [, respId, weekKey] = customId.split(":");
    const memberId = interaction.values[0];

    await interaction.deferUpdate().catch(() => {});

    const checklist = loadJSON(CHECKLIST_FILE, { weeks: {} });
    const weekData = checklist.weeks?.[weekKey];
    const respData = weekData?.responsaveis?.[respId];
    const member = respData?.members?.[memberId];

    if (!weekData || !respData || !member) {
      return true;
    }

    const oldStatus = member.checked;
    member.checked = !oldStatus;
    member.checkedAt = member.checked ? Date.now() : null;
    member.checkedBy = member.checked ? interaction.user.id : null;

    saveJSON(CHECKLIST_FILE, checklist);

// Log Auditoria
await logAudit(client, interaction.user, respId, memberId, member.checked, weekKey);

// Recarrega do arquivo já salvo
const refreshedChecklist = loadJSON(CHECKLIST_FILE, { weeks: {} });
const updatedData = refreshedChecklist.weeks?.[weekKey]?.responsaveis?.[respId];

if (updatedData) {
  await sendPersonalManager(interaction, respId, weekKey, updatedData, interaction.user.id !== respId, true);
}

await refreshMainPanel(client, interaction.guild);
return true;
  }

  // 6. Ações em Massa
  if (interaction.isButton() && customId.startsWith("logcheck_bulk:")) {
    const [, action, respId, weekKey] = customId.split(":");

    await interaction.deferUpdate().catch(() => {});

    const checklist = loadJSON(CHECKLIST_FILE, { weeks: {} });
    const weekData = checklist.weeks?.[weekKey];
    const respData = weekData?.responsaveis?.[respId];
    const members = respData?.members;

    if (!weekData || !respData || !members) {
      return true;
    }

    Object.keys(members).forEach(mId => {
      members[mId].checked = action === "check";
      members[mId].checkedAt = action === "check" ? Date.now() : null;
      members[mId].checkedBy = action === "check" ? interaction.user.id : null;
    });

   saveJSON(CHECKLIST_FILE, checklist);
await logAudit(client, interaction.user, respId, "TODOS", action === "check", weekKey, true);

// Recarrega do arquivo já salvo
const refreshedChecklist = loadJSON(CHECKLIST_FILE, { weeks: {} });
const updatedData = refreshedChecklist.weeks?.[weekKey]?.responsaveis?.[respId];

if (updatedData) {
  await sendPersonalManager(interaction, respId, weekKey, updatedData, interaction.user.id !== respId, true);
}

await refreshMainPanel(client, interaction.guild);
return true;
  }

  return false;
}

// Helper para enviar o menu de gerenciamento (pessoal ou admin)
async function sendPersonalManager(interaction, respId, weekKey, data, isAdmin = false, isUpdate = false) {
  const guild = interaction.guild;
  const isSunday = getNowSP().getDay() === 0;
  const members = Object.entries(data?.members || {});
  const checked = members.filter(([_, m]) => m.checked).length;
  const total = members.length;
const respDisplay = await resolveMemberPlainName(guild, respId);

  const memberLines = [];
  for (const [id, m] of members) {
    const timeStr = m.checkedAt ? `<t:${Math.floor(m.checkedAt / 1000)}:R>` : "";
    const mDisplay = await resolveMemberDisplay(guild, id);
    
    if (m.checked) {
      const checkerName = m.checkedBy ? await resolveMemberDisplay(guild, m.checkedBy) : "Staff";
      const checkerClean =
        checkerName
          .replace(/^<@!?\d+>\s*/, "")
          .replace(/^\(\*\*/, "")
          .replace(/\*\*\)$/, "")
          .trim() || "Staff";

      memberLines.push(`🟢 ${mDisplay} — conferido por **${checkerClean}** ${timeStr}`);
    } else {
      memberLines.push(`${isSunday ? "🟡" : "🔴"} ${mDisplay} — pendente`);
    }
  }

  const embed = new EmbedBuilder()
.setTitle(`📖 Gerenciar Logs: ${respDisplay}`)
    .setDescription(
      `📅 **Semana:** ${getWeekRangeLabel(weekKey)}\n` +
      `📊 **Progresso:** ${checked}/${total} conferidos\n\n` +
      (memberLines.length ? memberLines.join("\n") : "_Nenhum membro vinculado._")
    )
    .setColor(checked === total ? "#2ecc71" : "#3498db");

  const selectOptions = [];
  for (const [id, m] of members) {
    let member = guild.members.cache.get(id);
    if (!member) {
      try {
        member = await guild.members.fetch(id);
      } catch {}
    }

    const rawName = member?.displayName || member?.user?.username || id;

    selectOptions.push({
      label: String(rawName).slice(0, 100),
      value: id,
      emoji: m.checked ? "🔴" : "🟢",
      description: String(`@${member?.user?.username || id} | Área: ${m.area} | Status: ${m.checked ? "Conferido" : "Pendente"}`).slice(0, 100)
    });
  }

  const components = [];

  if (selectOptions.length > 0) {
    const select = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`logcheck_toggle:${respId}:${weekKey}`)
        .setPlaceholder("Clique para inverter o status de um membro")
        .addOptions(selectOptions.slice(0, 25))
    );
    components.push(select);
  }

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`logcheck_bulk:check:${respId}:${weekKey}`).setLabel("Marcar Todos").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`logcheck_bulk:uncheck:${respId}:${weekKey}`).setLabel("Desmarcar Todos").setStyle(ButtonStyle.Danger)
  );

  components.push(buttons);

  const payload = { embeds: [embed], components };

  if (isUpdate) {
    if (interaction.deferred || interaction.replied) {
      return interaction.editReply(payload).catch(console.error);
    }
    return interaction.update(payload).catch(console.error);
  }

  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(payload).catch(console.error);
  }

  return interaction.reply({ ...payload, flags: MessageFlags.Ephemeral }).catch(console.error);
}

async function logAudit(client, actor, respId, memberId, status, weekKey, isBulk = false) {
  const channel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle(isBulk ? "📑 Checklist: Ação em Massa" : "📑 Checklist Individual Atualizado")
    .setColor(status ? "#2ecc71" : "#e74c3c")
    .addFields(
      { name: "👤 Responsável", value: `<@${respId}>`, inline: true },
      { name: "🧍 Membro(s)", value: memberId === "TODOS" ? "Todos os vinculados" : `<@${memberId}>`, inline: true },
      { name: "📌 Ação", value: status ? "✅ Marcou como Conferido" : "❌ Marcou como Pendente", inline: true },
      { name: "🔧 Alterado por", value: `${actor}`, inline: true },
      { name: "📅 Semana", value: weekKey, inline: true }
    )
    .setTimestamp();

  await channel.send({ embeds: [embed] }).catch(() => {});
}

// ===============================
// LEMBRETES & CRON
// ===============================
async function sendSundayReminders(client) {
  const checklist = syncWeekData();
  const weekKey = weekKeyFromDateSP();
  const data = checklist.weeks[weekKey];
  const range = getWeekRangeLabel(weekKey);

  for (const [respId, content] of Object.entries(data.responsaveis)) {
    const pending = Object.entries(content.members).filter(([_, m]) => !m.checked);
    if (pending.length === 0) continue;

    try {
      const user = await client.users.fetch(respId).catch(() => null);
      if (!user) continue;

      let hasPriority = false;
      const guild = client.guilds.cache.first();
      const memberLines = pending.map(([mId, _]) => {
        const guildMember = guild?.members.cache.get(mId);
        if (guildMember?.roles.cache.has(ROLE_PRIORITY)) {
          hasPriority = true;
          return `• <@${mId}> 🚨 **(Prioritário)**`;
        }
        return `• <@${mId}>`;
      });

      const embed = new EmbedBuilder()
        .setTitle("📩 **CHECKLIST DE LOGS PENDENTE**")
        .setColor(hasPriority ? "#ff0000" : "#f1c40f")
        .setDescription(
          `Você ainda precisa verificar as logs dos seguintes membros:\n\n` +
          memberLines.join("\n") +
          `\n\n📅 **Semana:** ${range}\n\n` +
          `⚠️ Verifique se há logs indevidas ou inconsistentes e marque no painel após a conferência.` +
          (hasPriority ? `\n\n🚨 **Atenção:** Há membros prioritários pendentes!` : "")
        )
        .setFooter({ text: "Lembrete Automático • SantaCreators" })
        .setTimestamp();

      await user.send({ embeds: [embed] }).catch(() => {});
    } catch (e) {
      console.warn(`[ChecklistLogs] Falha ao enviar DM para ${respId}`);
    }
  }
}

export async function checklistOnReady(client) {
  syncWeekData();
  await refreshMainPanel(client).catch(() => {});
  cron.schedule("0 0,12,16 * * 0", () => sendSundayReminders(client), { timezone: TZ });
}
export async function checklistHandleMessage(message, client) {
  if (!message.guild || message.author.bot) return false;
  if (message.content.toLowerCase() !== "!checklogs") return false;

  if (!hasPermission(message.member)) {
    return message.reply("❌ Sem permissão.").then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
  }

  await message.delete().catch(() => {});
  const payload = await buildMainPanel(client, message.guild);
  const sent = await message.channel.send(payload);

  saveJSON(PANEL_CONFIG.STATE_FILE, {
    guildId: message.guild.id,
    channelId: message.channel.id,
    messageId: sent.id,
    updatedAt: Date.now()
  });

  return true;
}