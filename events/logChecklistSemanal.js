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
const LOG_CHANNEL_ID = "1506785173537292348"; // Auditoria

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

// ✅ HIERARQUIA DE GESTÃO (Maior para Menor)
// O sistema ignora cargos externos (como Destaque) e foca apenas nestes IDs para a filtragem.
const HIERARCHY_ORDER = [
  "1262262852949905408", // owner
  "1352408327983861844", // resp creators
  "1262262852949905409", // resp influ
  "1352407252216184833", // resp lider
  "1388976314253312100", // coord
  "1388975939161161728", // gestor
  "1388976155830255697", // manager
  "1388976094920704141", // social
  "1392678638176043029", // equipe manager
  "1387253972661964840", // equipe social
  "1352429001188180039"  // equipe creators
];

/**
 * Retorna a posição do membro na hierarquia de gestão definida.
 * Quanto menor o número, maior o cargo (0 = Owner).
 */
function getManagementRank(member) {
  if (!member) return Infinity;
  for (let i = 0; i < HIERARCHY_ORDER.length; i++) {
    if (member.roles.cache.has(HIERARCHY_ORDER[i])) return i;
  }
  return Infinity;
}

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
  const now = inputDate ? new Date(inputDate) : getNowSP();
  const day = now.getDay();
  // ✅ Início da semana: Sábado (6). Fechamento: Sexta (5)
  const diff = (day + 1) % 7; // Dias a subtrair para chegar ao Sábado anterior/atual
  
  const saturday = new Date(now);
  saturday.setDate(now.getDate() - diff);
  
  const y = saturday.getFullYear();
  const m = String(saturday.getMonth() + 1).padStart(2, '0');
  const d = String(saturday.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getWeekRangeLabel(weekKey) {
  const start = new Date(weekKey + "T00:00:00");
  const end = new Date(start);
  end.setDate(start.getDate() + 6); // Este 'end' é a Sexta-feira
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

  const panelChannel = client.channels.cache.get(PANEL_CONFIG.CHANNEL_ID);
  if (panelChannel?.guild) return panelChannel.guild;

  const knownGuild = client.guilds.cache.get("1262262852782129183");
  if (knownGuild) return knownGuild;

  if (client.guilds.cache.size === 1) return client.guilds.cache.first();
  return client.guilds.cache.first() || null;
}

/**
 * Resolve a identificação visual de um usuário (Menção + Nome).
 * @param {import("discord.js").Guild} guild 
 * @param {string} userId 
 * @returns {Promise<string>} "<@id> (**Nome**)"
 */
async function resolveMemberDisplay(guild, userId) {
  if (!guild) return `<@${userId}>`;

  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return `<@${userId}>`;

  const name = member.displayName || member.user.username;
  return `<@${userId}> (**${name}**)`;
}

async function resolveMemberPlainName(guild, userId) {
  if (!guild) return String(userId);

  const member = await guild.members.fetch(userId).catch(() => null);
  return member?.displayName || member?.user?.globalName || member?.user?.username || String(userId);
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

function cloneJSONSafe(value, fallback = {}) {
  try {
    return JSON.parse(JSON.stringify(value ?? fallback));
  } catch {
    return fallback;
  }
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

function weekHasResponsaveis(checklist, weekKey) {
  return Object.keys(checklist?.weeks?.[weekKey]?.responsaveis || {}).length > 0;
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

/**
 * Busca o status de check de um membro em qualquer lugar da semana atual
 */
function findExistingCheck(responsaveis, memberId) {
  for (const resp of Object.values(responsaveis || {})) {
    const m = resp.members?.[memberId];
    if (m && m.checked) return m;
  }
  return null;
}

function buildCheckedBackupByMemberId(responsaveis = {}) {
  const backup = {};

  for (const respData of Object.values(responsaveis || {})) {
    for (const [memberId, memberData] of Object.entries(respData?.members || {})) {
      if (memberData?.checked === true) {
        backup[String(memberId)] = {
          checked: true,
          checkedAt: memberData.checkedAt || null,
          checkedBy: memberData.checkedBy || null,
          area: memberData.area || "Geral",
          sourceMessageId: memberData.sourceMessageId || null,
          sourceCreatedAtMs: memberData.sourceCreatedAtMs || null
        };
      }
    }
  }

  return backup;
}

async function syncWeekData(client, force = false) {
  const checklist = loadJSON(CHECKLIST_FILE, { weeks: {} });
  const weekKey = weekKeyFromDateSP();

  if (!checklist.weeks[weekKey]) {
    checklist.weeks[weekKey] = { lastSyncedAt: null, responsaveis: {} };
  }

  const currentWeek = checklist.weeks[weekKey];

  // ✅ THROTTLE: Se sincronizou há menos de 5 minutos e não for um "Sincronizar" forçado,
  // retorna os dados atuais imediatamente sem fazer o scan pesado.
  if (!force && currentWeek.lastSyncedAt && (Date.now() - currentWeek.lastSyncedAt < 5 * 60 * 1000)) {
    return checklist;
  }

  const giData = loadGiSource();
  const rawRegistros = Array.isArray(giData?.registros) ? giData.registros : [];

  // 🛡️ PROTEÇÃO: Se a fonte estiver vazia (erro de leitura ou arquivo quebrado), 
  // não prossegue para não apagar o progresso da semana atual.
  if (rawRegistros.length === 0) return checklist;
  // Se rawRegistros.length === 0, significa que não há registros GI elegíveis.
  // Isso deve resultar em uma lista de responsáveis vazia, não manter a antiga.
  // if (rawRegistros.length === 0) return checklist; // <-- REMOVER ESTA LINHA

  if (!currentWeek.responsaveis || typeof currentWeek.responsaveis !== "object") {
    currentWeek.responsaveis = {};
  }

  const registros = pickLatestEligibleGiRecords(rawRegistros);

  const giMap = new Map(); // respId -> Map(memberId -> memberData)

  // ✅ Resolve guilda e faz fetch focado apenas nos IDs necessários (MUITO mais rápido)
  const guild = resolveMainGuild(client, null) || (await client.guilds.fetch("1262262852782129183"));
  
  const idsToFetch = new Set();
  for (const reg of registros) {
    const tid = extractTargetId(reg);
    const rids = extractResponsibleIds(reg);
    if (tid) idsToFetch.add(tid);
    rids.forEach(id => idsToFetch.add(id));
  }

  if (idsToFetch.size > 0) {
    // Busca apenas os membros envolvidos no GI, ignorando o resto do servidor
    await guild.members.fetch({ user: Array.from(idsToFetch) }).catch(() => {});
  }

  for (const reg of registros) {
    const targetId = extractTargetId(reg);
    const responsibleIds = extractResponsibleIds(reg);

    if (!targetId || responsibleIds.length === 0) continue;

    // 🔒 Filtro de Hierarquia: verifica se o responsável é superior ao alvo
    const targetMem = guild.members.cache.get(targetId);
    const targetRank = getManagementRank(targetMem);

    const area =
      reg?.area ||
      reg?.setor ||
      reg?.departamento ||
      reg?.responsibleType ||
      "Geral";

    for (const respId of responsibleIds) {
      const respMem = guild.members.cache.get(respId);
      if (respMem && targetMem) {
        const respRank = getManagementRank(respMem);
        // Se o alvo tem rank superior ou igual, esse responsável não pode bater log dele
        if (targetRank <= respRank) continue;
      }
      if (targetId === respId) continue;

      if (!giMap.has(respId)) giMap.set(respId, new Map());

      giMap.get(respId).set(targetId, {
        id: targetId,
        area,
        sourceMessageId: reg?.messageId || null,
        sourceCreatedAtMs: Number(reg?.createdAtMs || 0)
      });
    }
  }

  // ✅ MERGE INTELIGENTE: Reconstrói o mapa de responsáveis respeitando os checks existentes
  const currentResponsaveis = cloneJSONSafe(currentWeek.responsaveis || {}, {});
  const checkedBackupByMemberId = buildCheckedBackupByMemberId(currentResponsaveis);
  const newResponsaveis = {};

  for (const [respId, memberMap] of giMap.entries()) {
    newResponsaveis[respId] = { members: {} };
    for (const [memberId, memberData] of memberMap.entries()) {
      // Tenta achar se esse membro já foi conferido na estrutura atual ou em outro responsável
      const existing =
        currentResponsaveis[respId]?.members?.[memberId] ||
        findExistingCheck(currentResponsaveis, memberId) ||
        checkedBackupByMemberId[String(memberId)] ||
        null;

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

  const oldCheckedCount = Object.values(currentResponsaveis || {})
    .flatMap(resp => Object.values(resp?.members || {}))
    .filter(m => m?.checked === true).length;

  const newCheckedCount = Object.values(newResponsaveis || {})
    .flatMap(resp => Object.values(resp?.members || {}))
    .filter(m => m?.checked === true).length;

  if (oldCheckedCount > 0 && newCheckedCount === 0) {
    console.warn("[ChecklistLogs] Sync bloqueado: havia checks salvos e o novo sync tentou zerar tudo.");
    currentWeek.lastSyncedAt = Date.now();
    saveJSON(CHECKLIST_FILE, checklist);
    return checklist;
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

  // ✅ NÃO sincroniza automaticamente aqui.
  // O painel deve apenas LER a semana atual para não zerar/reconstruir progresso.
  const checklist = readChecklistWeek(weekKey);
  const data = checklist.weeks[weekKey] || { responsaveis: {}, lastSyncedAt: null };
  const isSunday = getNowSP().getDay() === 0;

  let totalMembers = 0;
  let checkedMembers = 0;
  let respsWithPending = 0;

  // 🛡️ Garante que a guilda está com membros carregados para evitar IDs em vez de nomes
  if (guild) {
    await guild.members.fetch().catch(() => {});
  }

  // ✅ Pre-fetch dos nomes que vão aparecer nesta página do painel
  const idsInPanel = new Set();
  for (const [respId, content] of Object.entries(data.responsaveis || {})) {
    idsInPanel.add(respId);
    Object.keys(content.members || {}).slice(0, 5).forEach(mId => idsInPanel.add(mId));
  }
  if (idsInPanel.size > 0 && guild) {
    await guild.members.fetch({ user: Array.from(idsInPanel) }).catch(() => {});
  }

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
    const allDone = count === 0 || checked === count; // ✅ Correção: se não tem membros, está "done"

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
  value: ` **Menção:** <@${respId}>\n📊 ${checked}/${count} conferidos\n\n${memberListText}\n━━━━━━━━━━━━━━━━━━━`,
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
      `🕒 **Fechamento:** Sexta-feira às 23:59\n\n` +
      `� **Responsáveis com pendência:** \`${respsWithPending}\`\n` +
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

    const checklist = await syncWeekData(client, true); // Único lugar que força o scan pesado
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
  
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

// ✅ Apenas lê a semana atual.
// Não sincroniza aqui para não reconstruir/zerar ao abrir gerenciamento.
const weekKey = weekKeyFromDateSP();
const checklist = readChecklistWeek(weekKey);
const data = checklist.weeks?.[weekKey] || { responsaveis: {} };
const myData = data.responsaveis?.[interaction.user.id];

  if (!myData || Object.keys(myData.members || {}).length === 0) {
  return interaction.editReply({
    content: "❌ Você não possui membros vinculados a você nesta semana.",
    components: []
  });
}

  return sendPersonalManager(interaction, interaction.user.id, weekKey, myData);
}

  // 3. Visão Geral (Admin)
  if (customId === "logcheck_admin_view") {
  const guild = interaction.guild;
  if (!hasPermission(interaction.member, "admin")) {
    return interaction.reply({ content: "❌ Apenas Administradores podem acessar a visão geral.", flags: MessageFlags.Ephemeral });
  }
  
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

// ✅ Apenas lê a semana atual.
// Não sincroniza aqui para não reconstruir/zerar progresso já marcado.
const weekKey = weekKeyFromDateSP();
const checklist = readChecklistWeek(weekKey);
const data = checklist.weeks?.[weekKey] || { responsaveis: {} };

    // ✅ PRE-FETCH EM MASSA (Otimização de Performance)
    const respIds = Object.keys(data.responsaveis || {});
    if (respIds.length > 0) {
      await guild.members.fetch({ user: respIds }).catch(() => {});
    }

  const options = [];
    const respEntries = Object.entries(data.responsaveis || {});
    
    for (const [respId, content] of respEntries) {
  const pending = Object.values(content?.members || {}).filter(m => !m.checked).length;

      const member = guild.members.cache.get(respId);
  const rawName = member?.displayName || member?.user?.username || respId;

  options.push({
    label: String(rawName).slice(0, 100),
    value: `logcheck_inspect:${respId}:${weekKey}`,
        description: String(pending === 0 ? "Logs conferidos" : `${pending} pendências encontradas`).slice(0, 100),
    emoji: pending === 0 ? "🟢" : "🔴"
  });
}

if (options.length === 0) {
      return interaction.editReply({
    content: "❌ Nenhum responsável encontrado na semana atual.",
  });
}

const select = new ActionRowBuilder().addComponents(
  new StringSelectMenuBuilder()
    .setCustomId("logcheck_admin_select")
    .setPlaceholder("Selecione um responsável para inspecionar")
    .addOptions(options.slice(0, 25))
);

    return interaction.editReply({
  content: "👑 **Painel Administrativo**\nEscolha um responsável para ver detalhes ou alterar status.",
  components: [select],
});
  }

  // 4. Seleção Admin
if (interaction.isStringSelectMenu() && customId === "logcheck_admin_select") {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const [, respId, weekKey] = interaction.values[0].split(":");
  const checklist = loadJSON(CHECKLIST_FILE, { weeks: {} });
  const data = checklist.weeks?.[weekKey]?.responsaveis?.[respId];

 if (!data) {
  return interaction.editReply({
    content: "❌ Não encontrei dados desse responsável na semana atual.",
    components: []
  });
}

  return sendPersonalManager(interaction, respId, weekKey, data, true);
}

  // 5. Toggle Status Individual
  if (interaction.isStringSelectMenu() && customId.startsWith("logcheck_toggle:")) {
    const [, respId, weekKey] = customId.split(":");
    const memberId = interaction.values[0];

if (!interaction.deferred && !interaction.replied) {
  await interaction.deferUpdate().catch(() => {});
}

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

if (!interaction.deferred && !interaction.replied) {
  await interaction.deferUpdate().catch(() => {});
}

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

  // ✅ Pre-fetch focado apenas nos membros deste responsável específico
  const idsToFetch = new Set([respId]);
  members.forEach(([mId]) => idsToFetch.add(mId));
  members.forEach(([_, m]) => { if (m.checkedBy) idsToFetch.add(m.checkedBy); });

  if (idsToFetch.size > 0 && guild) {
    await guild.members.fetch({ user: Array.from(idsToFetch) }).catch(() => {});
  }

  const respMember = guild.members.cache.get(respId);
  const respDisplay = respMember?.displayName || respMember?.user?.username || respId;

  const memberLines = [];
  for (const [id, m] of members) {
    const timeStr = m.checkedAt ? `<t:${Math.floor(m.checkedAt / 1000)}:R>` : "";
    const mMember = guild.members.cache.get(id);
    const mName = mMember?.displayName || mMember?.user?.username || id;
    const mDisplay = `<@${id}> (**${mName}**)`;
    
    if (m.checked) {
      const checkerMem = m.checkedBy ? guild.members.cache.get(m.checkedBy) : null;
      const checkerClean = checkerMem?.displayName || checkerMem?.user?.username || "Staff";

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
    const member = guild.members.cache.get(id);

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
  // ✅ Lembrete apenas lê o checklist salvo.
  // Não sincroniza GI para não reconstruir/zerar checks.
  const weekKey = weekKeyFromDateSP();
  const checklist = readChecklistWeek(weekKey);
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
  const weekKey = weekKeyFromDateSP();
  const checklist = readChecklistWeek(weekKey);

  // ✅ No restart do bot:
  // Verifica se a semana atual no estado está vazia ou nunca foi sincronizada.
  const currentWeekData = checklist.weeks[weekKey];
  if (!currentWeekData || !currentWeekData.lastSyncedAt || !weekHasResponsaveis(checklist, weekKey)) {
    await syncWeekData(client, true).catch(() => {});
  }

  await refreshMainPanel(client).catch(() => {});

  // ✅ Cobrança no Domingo (0) para os pendentes da semana que iniciou no Sábado.
  cron.schedule("0 12,16,20 * * 0", () => sendSundayReminders(client), { timezone: TZ });

  // ✅ O "reset" (início da nova semana) acontece rigorosamente no Sábado 00:00.
  cron.schedule("0 0 * * 6", () => syncWeekData(client, true), { timezone: TZ });
}

export async function checklistHandleMessage(message, client) {
  if (!message.guild || message.author.bot) return false;
  if (message.content.toLowerCase() !== "!checklogs") return false;

  if (!hasPermission(message.member)) {
    return message.reply("❌ Sem permissão.").then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
  }

  await message.delete().catch(() => {});

const weekKey = weekKeyFromDateSP();
const checklist = readChecklistWeek(weekKey);

if (!weekHasResponsaveis(checklist, weekKey)) {
  await syncWeekData(client, true).catch(() => {});
}

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