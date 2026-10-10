import fs from "node:fs";
import path from "node:path";

import {
  createHash,
  randomUUID,
} from "node:crypto";

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
import { dashEmit, dashOn } from "../utils/dashHub.js";

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

// ✅ Exceções totais do checklist
// Macedo (usuário) e cargo Owner podem gerenciar em qualquer dia/horário.
const CHECKLIST_FULL_OVERRIDE = {
  USER_IDS: ["660311795327828008"],
  ROLE_IDS: ["1262262852949905408"] // owner
};

// ✅ HIERARQUIA DE GESTÃO (Maior para Menor)
// O sistema ignora cargos externos (como Destaque) e foca apenas nestes IDs para a filtragem.
const HIERARCHY_ORDER = [
  ["1262262852949905408"], // owner
  ["1352408327983861844"], // resp creators
  ["1262262852949905409"], // resp influ
  [
    "1352407252216184833", // resp lider
    "1414651836861907006"  // responsáveis (tratado como Resp. Líder no Controle GI)
  ],
  ["1388976314253312100"], // coord
  ["1388975939161161728"], // gestor
  [
    "1388976155830255697", // manager
    "1388976094920704141"  // social
  ],
  [
    "1392678638176043029", // equipe manager
    "1387253972661964840", // equipe social
    "1352429001188180039"  // equipe creators
  ]
];

/**
 * Retorna o nível REAL do membro na hierarquia de gestão definida.
 * Quanto menor o número, maior o cargo (0 = Owner).
 * Cargos equivalentes compartilham o mesmo nível.
 */
function getManagementRank(member) {
  if (!member) return Infinity;

  for (let i = 0; i < HIERARCHY_ORDER.length; i++) {
    if (
      HIERARCHY_ORDER[i].some(roleId =>
        member.roles.cache.has(roleId)
      )
    ) {
      return i;
    }
  }

  return Infinity;
}

function hasChecklistFullOverride(member) {
  if (!member) return false;

  if (CHECKLIST_FULL_OVERRIDE.USER_IDS.includes(member.id)) return true;

  return member.roles.cache.some(role =>
    CHECKLIST_FULL_OVERRIDE.ROLE_IDS.includes(role.id)
  );
}

function canManageChecklistTarget(actorMember, targetMember) {
  if (!actorMember || !targetMember) return false;

  // Ninguém bate a própria log por este sistema.
  if (actorMember.id === targetMember.id) return false;

  // Macedo e Owner podem gerenciar qualquer outro membro.
  if (hasChecklistFullOverride(actorMember)) return true;

  const actorRank = getManagementRank(actorMember);
  const targetRank = getManagementRank(targetMember);

  // Quem não está na hierarquia de gestão não gerencia terceiros pela Visão Geral.
  if (actorRank === Infinity) return false;

  // Só pode gerenciar cargos ABAIXO. Mesmo nível ou acima ficam bloqueados.
  return targetRank > actorRank;
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

  // ✅ Início da semana: Domingo (0). Fechamento: Sábado (6).
  const diff = day;

  const sunday = new Date(now);
  sunday.setDate(now.getDate() - diff);

  const y = sunday.getFullYear();
  const m = String(sunday.getMonth() + 1).padStart(2, "0");
  const d = String(sunday.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getWeekSnapshotCutoffMs(weekKey = weekKeyFromDateSP()) {
  // São Paulo permanece em UTC-03:00.
  // O corte é exatamente domingo 00:00 da semana atual.
  const cutoff = new Date(`${weekKey}T00:00:00-03:00`).getTime();
  return Number.isFinite(cutoff) ? cutoff : 0;
}

function getGiRecordChecklistEligibilityAtMs(reg) {
  // A regra semanal é baseada na data REAL de entrada do membro.
  // A criação/recriação posterior do Controle GI não pode transformar
  // um membro antigo em "membro novo" para o checklist.
  const joinDateMs = Number(reg?.joinDateMs || 0);
  if (joinDateMs > 0) return joinDateMs;

  const roleSetAtMs = Number(reg?.roleSetAtMs || 0);
  if (roleSetAtMs > 0) return roleSetAtMs;

  const createdAtMs = Number(reg?.createdAtMs || 0);
  if (createdAtMs > 0) return createdAtMs;

  return 0;
}

function getWeekRangeLabel(weekKey) {
  const start = new Date(weekKey + "T00:00:00");
  const end = new Date(start);

  // A semana começa no domingo e termina no sábado.
  end.setDate(start.getDate() + 6);

  const fmt = (d) =>
    `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;

  return `${fmt(start)} → ${fmt(end)}`;
}

/**
 * A conferência das logs fica aberta de domingo até quarta-feira.
 */
function isLogWindowOpenSP() {
  const day = getNowSP().getDay();
  return day >= 0 && day <= 3;
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
    checklist.weeks[weekKey] = {
      lastSyncedAt: null,
      snapshotCutoffAtMs: null,
      snapshotLocked: false,
      responsaveis: {}
    };

    saveJSON(CHECKLIST_FILE, checklist);
  }

  return checklist;
}

function weekHasResponsaveis(checklist, weekKey) {
  return Object.keys(checklist?.weeks?.[weekKey]?.responsaveis || {}).length > 0;
}

function weekHasCheckedMembers(weekData) {
  return Object.values(weekData?.responsaveis || {}).some(resp =>
    Object.values(resp?.members || {}).some(member => member?.checked === true)
  );
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

async function applyGiResponsibleTransferToCurrentWeek(client, data = {}) {
  const memberId = normalizeId(data?.memberId);
  const previousResponsibleId = normalizeId(data?.previousResponsibleId);
  const newResponsibleId = normalizeId(data?.newResponsibleId);

  if (
    !memberId ||
    !previousResponsibleId ||
    !newResponsibleId ||
    previousResponsibleId === newResponsibleId
  ) {
    return false;
  }

  const checklist = loadJSON(CHECKLIST_FILE, { weeks: {} });
  const weekKey = weekKeyFromDateSP();
  const currentWeek = checklist?.weeks?.[weekKey];

  // Se a semana ainda não possui snapshot/lista, não criamos uma lista paralela.
  if (
    !currentWeek ||
    !currentWeek.responsaveis ||
    typeof currentWeek.responsaveis !== "object"
  ) {
    return false;
  }

  let preservedMemberData = null;

  const existingCheckedMember =
    findExistingCheck(currentWeek.responsaveis, memberId);

  // Remove o membro de qualquer responsável antigo dentro do snapshot atual.
  // Isso também limpa duplicações antigas sem reconstruir a semana inteira.
  for (const [respId, respData] of Object.entries(currentWeek.responsaveis)) {
    const existingMember = respData?.members?.[memberId];
    if (!existingMember) continue;

    if (
      !preservedMemberData ||
      respId === previousResponsibleId
    ) {
      preservedMemberData = cloneJSONSafe(existingMember, {});
    }

    delete respData.members[memberId];

    if (Object.keys(respData.members || {}).length === 0) {
      delete currentWeek.responsaveis[respId];
    }
  }

  // O membro não fazia parte da lista congelada desta semana.
  // Não adicionamos um membro novo à força, apenas transferimos quem já estava nela.
  if (!preservedMemberData) {
    return false;
  }

  if (!currentWeek.responsaveis[newResponsibleId]) {
    currentWeek.responsaveis[newResponsibleId] = {
      members: {}
    };
  }

  if (!currentWeek.responsaveis[newResponsibleId].members) {
    currentWeek.responsaveis[newResponsibleId].members = {};
  }

  const existingAtNewResponsible =
    currentWeek.responsaveis[newResponsibleId].members[memberId] ||
    null;

  currentWeek.responsaveis[newResponsibleId].members[memberId] = {
    ...preservedMemberData,

    // Se por algum motivo já existia uma cópia conferida no novo responsável,
    // nunca perde o progresso.
    checked:
      existingCheckedMember?.checked === true ||
      existingAtNewResponsible?.checked === true ||
      preservedMemberData?.checked === true,

    checkedAt:
      existingCheckedMember?.checkedAt ||
      existingAtNewResponsible?.checkedAt ||
      preservedMemberData?.checkedAt ||
      null,

    checkedBy:
      existingCheckedMember?.checkedBy ||
      existingAtNewResponsible?.checkedBy ||
      preservedMemberData?.checkedBy ||
      null,

    responsibilityTransferredAt:
      Number(data?.transferredAtMs || Date.now()),

    responsibilityTransferredFrom:
      previousResponsibleId,

    responsibilityTransferredTo:
      newResponsibleId
  };

  // IMPORTANTE:
  // snapshotLocked permanece exatamente como estava.
  // Esta operação é uma transferência pontual, não uma reconstrução da semana.
  saveJSON(CHECKLIST_FILE, checklist);

  if (client) {
    await refreshMainPanel(client).catch(() => {});
  }

  return true;
}

async function reconcileCurrentWeekResponsibleAssignments(client) {
  const checklist = loadJSON(CHECKLIST_FILE, { weeks: {} });
  const weekKey = weekKeyFromDateSP();
  const currentWeek = checklist?.weeks?.[weekKey];

  // Só reconcilia uma lista que já existe e está congelada.
  // Esta rotina NUNCA cria membro novo no snapshot semanal.
  if (
    !currentWeek ||
    currentWeek.snapshotLocked !== true ||
    !currentWeek.responsaveis ||
    typeof currentWeek.responsaveis !== "object"
  ) {
    return false;
  }

  const giData = loadGiSource();
  const rawRegistros = Array.isArray(giData?.registros)
    ? giData.registros
    : [];

  if (rawRegistros.length === 0) {
    return false;
  }

  const latestRecords =
    pickLatestEligibleGiRecords(rawRegistros);

  const currentGiResponsibleByMember =
    new Map();

  for (const reg of latestRecords) {
    const memberId =
      extractTargetId(reg);

    const responsibleId =
      extractResponsibleIds(reg)[0] ||
      null;

    if (
      memberId &&
      responsibleId
    ) {
      currentGiResponsibleByMember.set(
        memberId,
        {
          responsibleId,
          transferredAtMs:
            Number(reg?.responsibleUpdatedAtMs || 0) ||
            Number(reg?.updatedAtMs || 0) ||
            Date.now()
        }
      );
    }
  }

  const snapshotResponsibleIdsByMember =
    new Map();

  for (
    const [respId, respData]
    of Object.entries(currentWeek.responsaveis)
  ) {
    for (
      const memberId
      of Object.keys(respData?.members || {})
    ) {
      if (!snapshotResponsibleIdsByMember.has(memberId)) {
        snapshotResponsibleIdsByMember.set(
          memberId,
          []
        );
      }

      snapshotResponsibleIdsByMember
        .get(memberId)
        .push(respId);
    }
  }

  let changed = false;

  for (
    const [memberId, snapshotResponsibleIds]
    of snapshotResponsibleIdsByMember.entries()
  ) {
    const currentGiData =
      currentGiResponsibleByMember.get(memberId);

    // Se não existe vínculo GI ativo atual, não inventa nem remove vínculo semanal.
    if (!currentGiData?.responsibleId) {
      continue;
    }

    const uniqueSnapshotResponsibleIds =
      [...new Set(snapshotResponsibleIds.map(String))];

    // Já está exatamente no responsável atual e sem duplicação.
    if (
      uniqueSnapshotResponsibleIds.length === 1 &&
      uniqueSnapshotResponsibleIds[0] ===
        String(currentGiData.responsibleId)
    ) {
      continue;
    }

    const previousResponsibleId =
      uniqueSnapshotResponsibleIds.find(
        respId =>
          respId !==
          String(currentGiData.responsibleId)
      ) ||
      uniqueSnapshotResponsibleIds[0] ||
      null;

    if (
      !previousResponsibleId ||
      previousResponsibleId ===
        String(currentGiData.responsibleId)
    ) {
      continue;
    }

    const moved =
      await applyGiResponsibleTransferToCurrentWeek(
        null,
        {
          memberId,
          previousResponsibleId,
          newResponsibleId:
            String(currentGiData.responsibleId),
          transferredAtMs:
            currentGiData.transferredAtMs,
          source:
            "startup_gi_reconciliation"
        }
      );

    if (moved) {
      changed = true;
    }
  }

  if (
    changed &&
    client
  ) {
    await refreshMainPanel(client)
      .catch(() => {});
  }

  return changed;
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

function extractFirstMentionId(value) {
  const text = String(value || "");
  const mentionMatch = text.match(/<@!?(\d{5,25})>/);
  if (mentionMatch) return mentionMatch[1];

  const rawMatch = text.match(/\b\d{5,25}\b/);
  return rawMatch ? rawMatch[0] : null;
}

function getEmbedFieldValue(embed, fieldNameIncludes) {
  const fields = embed?.fields || [];
  const wanted = String(fieldNameIncludes || "").toLowerCase();

  const found = fields.find(field => {
    const name = String(field?.name || "").toLowerCase();
    return name.includes(wanted);
  });

  return found?.value || null;
}

function parseChecklistAuditEmbed(message, weekKey) {
  const embed = message.embeds?.[0];
  if (!embed) return null;

  const title = String(embed.title || "");
  if (!title.includes("Checklist")) return null;

  const weekValue = getEmbedFieldValue(embed, "semana");
  if (String(weekValue || "").trim() !== String(weekKey)) return null;

  const respValue = getEmbedFieldValue(embed, "responsável");
  const memberValue = getEmbedFieldValue(embed, "membro");
  const actionValue = getEmbedFieldValue(embed, "ação");
  const actorValue = getEmbedFieldValue(embed, "alterado por");

  const respId = extractFirstMentionId(respValue);
  const actorId = extractFirstMentionId(actorValue);
  const status = String(actionValue || "").includes("Marcou como Conferido");

  if (!respId) return null;

  const isBulk = String(memberValue || "").toLowerCase().includes("todos");
  const memberId = isBulk ? "TODOS" : extractFirstMentionId(memberValue);

  if (!isBulk && !memberId) return null;

  return {
    messageId: message.id,

    createdTimestamp: Number(
      Date.parse(embed.timestamp || "") ||
      message.createdTimestamp ||
      Date.now()
    ),

    respId,
    memberId,
    actorId,
    status,
    isBulk
  };
}

async function recoverChecklistChecksFromAuditChannel(client, weekKey, responsaveis = {}) {
  const channel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
  if (!channel?.messages?.fetch) {
    console.warn("[ChecklistLogs] Canal de auditoria não encontrado para recuperação.");
    return responsaveis;
  }

  const recovered = cloneJSONSafe(responsaveis || {}, {});
  const auditActions = [];

  let before = null;

  for (let page = 0; page < 10; page++) {
    const fetched = await channel.messages.fetch({
      limit: 100,
      ...(before ? { before } : {})
    }).catch(() => null);

    if (!fetched || fetched.size === 0) break;

    const messages = [...fetched.values()];
    before = messages[messages.length - 1]?.id || null;

    for (const msg of messages) {
      const parsed = parseChecklistAuditEmbed(msg, weekKey);
      if (parsed) auditActions.push(parsed);
    }

    if (fetched.size < 100) break;
  }

  auditActions.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  for (const action of auditActions) {
    const respData = recovered[action.respId];
    if (!respData?.members) continue;

    if (action.isBulk) {
      for (const memberData of Object.values(respData.members || {})) {
        memberData.checked = action.status;
        memberData.checkedAt = action.status ? action.createdTimestamp : null;
        memberData.checkedBy = action.status ? action.actorId : null;
      }

      continue;
    }

    const memberData = respData.members?.[action.memberId];
    if (!memberData) continue;

    memberData.checked = action.status;
    memberData.checkedAt = action.status ? action.createdTimestamp : null;
    memberData.checkedBy = action.status ? action.actorId : null;
  }

  console.log(`[ChecklistLogs] Recuperação por auditoria aplicada: ${auditActions.length} ações da semana ${weekKey}.`);
  return recovered;
}

async function syncWeekData(client, force = false) {
  const checklist = loadJSON(CHECKLIST_FILE, { weeks: {} });
  const weekKey = weekKeyFromDateSP();

  if (!checklist.weeks[weekKey]) {
    checklist.weeks[weekKey] = {
      lastSyncedAt: null,
      snapshotCutoffAtMs: null,
      snapshotLocked: false,
      responsaveis: {}
    };
  }

  const currentWeek = checklist.weeks[weekKey];

  // 🔒 Depois que o snapshot semanal foi criado, ele NÃO é reconstruído.
  // Trocas de responsável durante a semana são aplicadas pontualmente pelo evento
  // gi:responsavel_transferido, sem puxar membros novos para a semana em andamento.
  if (currentWeek.snapshotLocked === true) {
    return checklist;
  }

  // ✅ THROTTLE: Se sincronizou há menos de 5 minutos e não for um "Sincronizar" forçado,
  // retorna os dados atuais imediatamente sem fazer o scan pesado.
  if (!force && currentWeek.lastSyncedAt && (Date.now() - currentWeek.lastSyncedAt < 5 * 60 * 1000)) {
    return checklist;
  }
  const giData = loadGiSource();
  const rawRegistros = Array.isArray(giData?.registros) ? giData.registros : [];

  // 🛡️ Se a fonte GI estiver vazia, a lista não será congelada.
  // Assim, o sistema poderá tentar novamente sem apagar nenhum dado.
  if (rawRegistros.length === 0) {
    return checklist;
  }

  if (!currentWeek.responsaveis || typeof currentWeek.responsaveis !== "object") {
    currentWeek.responsaveis = {};
  }

  const snapshotCutoffAtMs =
    Number(currentWeek.snapshotCutoffAtMs || 0) ||
    getWeekSnapshotCutoffMs(weekKey);

  currentWeek.snapshotCutoffAtMs = snapshotCutoffAtMs;

  const registros = pickLatestEligibleGiRecords(rawRegistros).filter(reg => {
    const eligibleAtMs = getGiRecordChecklistEligibilityAtMs(reg);

    // Registros sem timestamp legado continuam aceitos.
    if (!eligibleAtMs) return true;

    // Quem entrou DEPOIS do domingo 00:00 só entra no próximo domingo.
    return eligibleAtMs <= snapshotCutoffAtMs;
  });

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

  const recoveredResponsaveis = await recoverChecklistChecksFromAuditChannel(client, weekKey, newResponsaveis);

  const oldCheckedCount = Object.values(currentResponsaveis || {})
    .flatMap(resp => Object.values(resp?.members || {}))
    .filter(m => m?.checked === true).length;

  const newCheckedCount = Object.values(recoveredResponsaveis || {})
    .flatMap(resp => Object.values(resp?.members || {}))
    .filter(m => m?.checked === true).length;

  if (oldCheckedCount > 0 && newCheckedCount === 0) {
    console.warn("[ChecklistLogs] Sync bloqueado: havia checks salvos e o novo sync tentou zerar tudo.");
    currentWeek.lastSyncedAt = Date.now();
    saveJSON(CHECKLIST_FILE, checklist);
    return checklist;
  }

  currentWeek.responsaveis = recoveredResponsaveis;
  currentWeek.lastSyncedAt = Date.now();

  // 🔒 Depois que a lista foi criada com sucesso, ela fica congelada
  // até o início da próxima semana, no domingo.
  currentWeek.snapshotLocked = true;

  saveJSON(CHECKLIST_FILE, checklist);
  return checklist;
}

function hasPermission(member, type = "use") {
  if (!member) return false;
  if (hasChecklistFullOverride(member)) return true;
  if (AUTH_CONFIG.SUPER_IDS.includes(member.id)) return true;

  const hasAuthorizedRole = member.roles.cache.some(r => AUTH_CONFIG.ROLE_IDS.includes(r.id));

  // A Visão Geral também pode ser aberta pelos responsáveis autorizados.
  // A hierarquia é filtrada depois, membro por membro.
  if (type === "admin") return hasAuthorizedRole;

  return hasAuthorizedRole;
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
  const hasCheckedMembers = weekHasCheckedMembers(data);
  const canSynchronize = data.snapshotLocked !== true;

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
      value: "_Nenhum responsável foi carregado para a semana atual._",
      inline: false
    });
  }

  const embed = new EmbedBuilder()
    .setTitle("📋 Checklist Semanal de Logs")
    .setDescription(
      `📅 **Semana:** ${getWeekRangeLabel(weekKey)}\n` +
      `🕒 **Período para bater log:** Domingo às 00:00 até quarta-feira às 23:59\n` +
      `🔒 **Lista semanal:** ${data.snapshotLocked === true ? "Congelada" : "Sincronização liberada"}\n\n` +
      `👥 **Responsáveis com pendência:** \`${respsWithPending}\`\n` +
      `✅ **Membros conferidos:** \`${checkedMembers}\`\n` +
      `❌ **Membros pendentes:** \`${totalMembers - checkedMembers}\`\n` +
      `🕓 **Lista criada em:** ${data.lastSyncedAt ? `<t:${Math.floor(data.lastSyncedAt / 1000)}:F>` : "`Ainda não criada`"}\n\n` +
      `📊 **Progresso Geral:**\n${buildProgressBar(checkedMembers, totalMembers)}\n`
    )
    .addFields(fields)
    .setColor(respsWithPending === 0 ? "#2ecc71" : (isSunday ? "#f1c40f" : "#9b59b6"))
    .setThumbnail(client.user.displayAvatarURL())
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("logcheck_my_members").setLabel("Gerenciar Meus Membros").setStyle(ButtonStyle.Success).setEmoji("✅"),
    new ButtonBuilder().setCustomId("logcheck_admin_view").setLabel("Visão Geral").setStyle(ButtonStyle.Primary).setEmoji("👑"),
    new ButtonBuilder()
      .setCustomId("logcheck_sync_gi")
      .setLabel(canSynchronize ? "Sincronizar" : "Lista Semanal Congelada")
      .setStyle(canSynchronize ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setEmoji(canSynchronize ? "🔄" : "🔒")
  );

  return { embeds: [embed], components: [row] };
}

const CHECKLIST_CHANGE_LOCKS = new Set();
const CHECKLIST_AUDIT_CLIENTS = new WeakSet();

let checklistAuditRunning = false;
let checklistPanelTimer = null;
let checklistPanelRunning = false;
let checklistPanelDirty = false;

function checklistError(message, status = 400) {
  return Object.assign(
    new Error(message),
    { status }
  );
}

function checklistReadStrict() {
  if (!fs.existsSync(CHECKLIST_FILE)) {
    return { weeks: {} };
  }

  const data = JSON.parse(
    fs.readFileSync(CHECKLIST_FILE, 'utf8')
  );

  if (
    !data.weeks ||
    typeof data.weeks !== 'object' ||
    Array.isArray(data.weeks)
  ) {
    throw checklistError(
      'O arquivo do checklist está inválido. Nenhum dado foi alterado.',
      503
    );
  }

  return data;
}

function checklistWriteStrict(data) {
  fs.mkdirSync(
    path.dirname(CHECKLIST_FILE),
    { recursive: true }
  );

  const temporary =
    `${CHECKLIST_FILE}.${randomUUID()}.tmp`;

  fs.writeFileSync(
    temporary,
    JSON.stringify(data, null, 2),
    'utf8'
  );

  fs.renameSync(
    temporary,
    CHECKLIST_FILE
  );
}

function checklistRevision(
  weekKey,
  responsibleId,
  memberId,
  record
) {
  return createHash('sha256')
    .update(
      JSON.stringify([
        weekKey,
        responsibleId,
        memberId,
        record,
      ])
    )
    .digest('hex');
}

async function checklistAccess(guild, actorId) {
  if (guild.id !== '1262262852782129183') {
    throw checklistError(
      'Checklist indisponível neste servidor.',
      403
    );
  }

  const member = await guild.members.fetch({
    user: actorId,
    force: true,
  }).catch(() => null);

  if (!member || !hasPermission(member)) {
    throw checklistError(
      'Sem permissão para o checklist.',
      403
    );
  }

  await guild.channels.fetch();

  const panelState = loadJSON(
    PANEL_CONFIG.STATE_FILE,
    {}
  );

  const channelId =
    panelState.guildId === guild.id &&
    panelState.channelId
      ? panelState.channelId
      : PANEL_CONFIG.CHANNEL_ID;

  const channel =
    guild.channels.cache.get(channelId);

  if (
    channel?.guildId !== guild.id ||
    !channel.permissionsFor(member)?.has([
      'ViewChannel',
      'ReadMessageHistory',
    ])
  ) {
    throw checklistError(
      'Você não possui acesso ao canal do checklist.',
      403
    );
  }

  const windowOpen =
    hasChecklistFullOverride(member) ||
    isLogWindowOpenSP();

  return {
    member,
    channel,
    windowOpen,
  };
}

function checklistPerson(guild, id) {
  const member =
    guild.members.cache.get(id);

  return {
    id,

    name:
      member?.displayName ||
      member?.user?.username ||
      `Usuário ${id}`,

    avatar:
      member?.user?.displayAvatarURL({
        size: 128,
      }) || null,
  };
}

export async function getChecklistSiteCatalog({
  guild,
  member,
}) {
  try {
    await checklistAccess(
      guild,
      member.id
    );

    return { allowed: true };
  } catch (error) {
    if (error.status === 403) {
      return { allowed: false };
    }

    throw error;
  }
}

export async function getChecklistSiteSnapshot({
  guild,
  member,
}) {
  const access = await checklistAccess(
    guild,
    member.id
  );

  const weekKey = weekKeyFromDateSP();
  const initial = checklistReadStrict();
  const ids = new Set();

  for (
    const [responsibleId, group]
    of Object.entries(
      initial.weeks[weekKey]?.responsaveis || {}
    )
  ) {
    ids.add(responsibleId);

    for (
      const [id, item]
      of Object.entries(group.members || {})
    ) {
      ids.add(id);

      if (item.checkedBy) {
        ids.add(item.checkedBy);
      }
    }
  }

  const memberIds = [...ids];
  const resolved = new Set();
  let next = 0;

  await Promise.all(
    Array.from(
      { length: Math.min(4, memberIds.length) },
      async () => {
        while (next < memberIds.length) {
          const id = memberIds[next++];

          const found = await guild.members.fetch({
            user: id,
            force: true,
          }).catch(() => null);

          if (found) {
            resolved.add(id);
          }
        }
      }
    )
  );

  const currentAccess = await checklistAccess(
    guild,
    member.id
  );

  if (weekKey !== weekKeyFromDateSP()) {
    throw checklistError(
      'A semana mudou. Atualize a tela.',
      409
    );
  }

  const current = checklistReadStrict();
  const groups = [];

  for (
    const [responsibleId, group]
    of Object.entries(
      current.weeks[weekKey]?.responsaveis || {}
    )
  ) {
    const records = [];

    for (
      const [memberId, item]
      of Object.entries(group.members || {})
    ) {
      if (
        !resolved.has(memberId) ||
        !canManageChecklistTarget(
          currentAccess.member,
          guild.members.cache.get(memberId)
        )
      ) {
        continue;
      }

      records.push({
        memberId,
        responsibleId,

        person:
          checklistPerson(guild, memberId),

        area:
          String(item.area || 'Geral'),

        checked:
          item.checked === true,

        checkedAt:
          item.checkedAt || null,

        checkedBy:
          item.checkedBy
            ? checklistPerson(guild, item.checkedBy)
            : null,

        revision:
          checklistRevision(
            weekKey,
            responsibleId,
            memberId,
            item
          ),

        rights: {
          check:
            currentAccess.windowOpen &&
            item.checked !== true,

          uncheck:
            currentAccess.windowOpen &&
            item.checked === true,
        },
      });
    }

    if (records.length) {
      groups.push({
        responsible:
          checklistPerson(guild, responsibleId),

        records,
      });
    }
  }

  const records = groups.flatMap(
    group => group.records
  );

  return {
    weekKey,
    weekLabel: getWeekRangeLabel(weekKey),
    groups,

    windowOpen:
      currentAccess.windowOpen,

    snapshotLocked:
      current.weeks[weekKey]?.snapshotLocked === true,

    rights: {
      view: true,
    },

    stats: {
      total:
        records.length,

      checked:
        records.filter(item => item.checked).length,

      pending:
        records.filter(item => !item.checked).length,
    },

    url:
      `https://discord.com/channels/${guild.id}/${access.channel.id}`,

    generatedAt:
      Date.now(),
  };
}

function scheduleChecklistPanel(client, guild) {
  checklistPanelDirty = true;
  clearTimeout(checklistPanelTimer);

  checklistPanelTimer = setTimeout(async () => {
    checklistPanelTimer = null;

    if (checklistPanelRunning) {
      return;
    }

    checklistPanelRunning = true;

    try {
      while (checklistPanelDirty) {
        checklistPanelDirty = false;

        await refreshMainPanel(
          client,
          guild
        );
      }
    } catch (error) {
      console.error(
        '[ChecklistLogs] Painel:',
        error
      );
    } finally {
      checklistPanelRunning = false;
    }
  }, 300);

  checklistPanelTimer.unref?.();
}

async function flushChecklistAudit(client) {
  if (
    checklistAuditRunning ||
    !client.isReady()
  ) {
    return;
  }

  checklistAuditRunning = true;

  try {
    const jobs = (
      checklistReadStrict().siteAuditOutbox || []
    )
      .filter(
        job =>
          Number(job.nextAt || 0) <= Date.now()
      )
      .slice(0, 20);

    for (const job of jobs) {
      try {
        await logAudit(
          client,
          job.actor,
          job.responsibleId,
          job.memberId,
          job.after.checked,
          job.weekKey,
          false,
          job
        );

        const current = checklistReadStrict();

        current.siteAuditOutbox = (
          current.siteAuditOutbox || []
        ).filter(
          item => item.id !== job.id
        );

        checklistWriteStrict(current);
      } catch (error) {
        console.error(
          '[ChecklistLogs] Auditoria pendente:',
          job.id,
          error
        );

        const current = checklistReadStrict();

        const pending = (
          current.siteAuditOutbox || []
        ).find(
          item => item.id === job.id
        );

        if (pending) {
          pending.attempts =
            Number(pending.attempts || 0) + 1;

          pending.nextAt =
            Date.now() +
            Math.min(
              300000,
              5000 * 2 ** Math.min(
                pending.attempts,
                6
              )
            );

          checklistWriteStrict(current);
        }
      }
    }
  } finally {
    checklistAuditRunning = false;
  }
}

function installChecklistAudit(client) {
  if (CHECKLIST_AUDIT_CLIENTS.has(client)) {
    return;
  }

  CHECKLIST_AUDIT_CLIENTS.add(client);

  const timer = setInterval(() => {
    void flushChecklistAudit(client).catch(error => {
      console.error(
        '[ChecklistLogs] Fila de auditoria:',
        error
      );
    });
  }, 10000);

  timer.unref?.();

  void flushChecklistAudit(client).catch(error => {
    console.error(
      '[ChecklistLogs] Fila inicial:',
      error
    );
  });
}

async function applyChecklistChange({
  client,
  guild,
  actorId,
  weekKey,
  responsibleId,

  memberId = null,
  checked = null,
  revision = null,
  bulk = false,
  reason = '',
  origin = 'Discord',
}) {
  if (CHECKLIST_CHANGE_LOCKS.has(guild.id)) {
    throw checklistError(
      'Há uma conferência em processamento. Atualize e tente novamente.',
      409
    );
  }

  CHECKLIST_CHANGE_LOCKS.add(guild.id);

  try {
    if (weekKey !== weekKeyFromDateSP()) {
      throw checklistError(
        'Esta semana não está mais aberta para alterações.',
        409
      );
    }

    if (
      !/^\d{17,20}$/.test(responsibleId) ||
      (
        !bulk &&
        !/^\d{17,20}$/.test(memberId)
      )
    ) {
      throw checklistError(
        'Vínculo de checklist inválido.'
      );
    }

    if (
      bulk &&
      typeof checked !== 'boolean'
    ) {
      throw checklistError(
        'Ação em massa inválida.'
      );
    }

    if (
      checked !== null &&
      typeof checked !== 'boolean'
    ) {
      throw checklistError(
        'Status inválido.'
      );
    }

    reason = String(reason || '').trim();

    if (reason.length > 1000) {
      throw checklistError(
        'O motivo deve ter até 1000 caracteres.'
      );
    }

    const access = await checklistAccess(
      guild,
      actorId
    );

    if (!access.windowOpen) {
      throw checklistError(
        'Conferências disponíveis de domingo até quarta-feira, às 23:59 de São Paulo.',
        403
      );
    }

    const initial = checklistReadStrict();

    const initialGroup =
      initial.weeks[weekKey]
        ?.responsaveis?.[responsibleId];

    if (!initialGroup?.members) {
      throw checklistError(
        'Vínculo semanal não encontrado.',
        404
      );
    }

    const targets =
      bulk
        ? Object.keys(initialGroup.members)
        : [memberId];

    const freshTargets = new Map();

    for (const id of targets) {
      const target = await guild.members.fetch({
        user: id,
        force: true,
      }).catch(() => null);

      if (target) {
        freshTargets.set(id, target);
      }
    }

    const finalAccess = await checklistAccess(
      guild,
      actorId
    );

    if (
      !finalAccess.windowOpen ||
      weekKey !== weekKeyFromDateSP()
    ) {
      throw checklistError(
        'O período de conferência mudou. Atualize a tela.',
        409
      );
    }

    const current = checklistReadStrict();

    const group =
      current.weeks[weekKey]
        ?.responsaveis?.[responsibleId];

    if (!group?.members) {
      throw checklistError(
        'O grupo foi alterado. Atualize a tela.',
        409
      );
    }

    const allowed = targets.filter(id =>
      group.members[id] &&
      canManageChecklistTarget(
        finalAccess.member,
        freshTargets.get(id)
      )
    );

    if (!allowed.length) {
      throw checklistError(
        'Você não pode conferir a própria log nem membros sem autorização hierárquica.',
        403
      );
    }

    if (
      !bulk &&
      origin === 'Site'
    ) {
      if (
        typeof revision !== 'string' ||
        !/^[a-f0-9]{64}$/.test(revision)
      ) {
        throw checklistError(
          'Atualize o registro antes de confirmar.',
          409
        );
      }

      if (
        group.members[memberId].checked === checked
      ) {
        return {
          ok: true,
          unchanged: true,
          changed: 0,
        };
      }

      if (
        revision !== checklistRevision(
          weekKey,
          responsibleId,
          memberId,
          group.members[memberId]
        )
      ) {
        throw checklistError(
          'Este registro foi alterado no Discord ou no site. Confira novamente.',
          409
        );
      }
    }

    const previousAt =
      Number(current.siteDecisionAt || 0);

    const at = Math.max(
      Date.now(),
      Number.isFinite(previousAt)
        ? previousAt + 1
        : 0
    );

    current.siteDecisionAt = at;

    let changed = 0;
    current.siteAuditOutbox ??= [];

    for (const id of allowed) {
      const record = group.members[id];

      const desired =
        checked === null
          ? record.checked !== true
          : checked;

      if (
        (record.checked === true) === desired
      ) {
        continue;
      }

      const before =
        structuredClone(record);

      record.checked = desired;
      record.checkedAt = desired ? at : null;
      record.checkedBy = desired ? actorId : null;

      current.siteAuditOutbox.push({
        id: randomUUID(),
        guildId: guild.id,
        weekKey,
        responsibleId,
        memberId: id,
        at,
        origin,
        reason,

        actor: {
          id: actorId,

          name:
            finalAccess.member.displayName,

          tag:
            finalAccess.member.user.tag,

          avatar:
            finalAccess.member.user.displayAvatarURL({
              size: 128,
            }),
        },

        before,
        after: structuredClone(record),
        attempts: 0,
        nextAt: 0,
      });

      changed++;
    }

    if (changed) {
      checklistWriteStrict(current);
    }

    installChecklistAudit(client);

    scheduleChecklistPanel(
      client,
      guild
    );

    return {
      ok: true,
      changed,
      skipped:
        targets.length - allowed.length,
    };
  } finally {
    CHECKLIST_CHANGE_LOCKS.delete(guild.id);
  }
}

export async function checklistSiteAction({
  client,
  guild,
  member,
  payload = {},
}) {
  if (typeof payload.checked !== 'boolean') {
    throw checklistError(
      'Informe conferir ou reabrir o registro.'
    );
  }

  return applyChecklistChange({
    client,
    guild,
    actorId: member.id,

    weekKey:
      String(payload.weekKey || ''),

    responsibleId:
      String(payload.responsibleId || ''),

    memberId:
      String(payload.memberId || ''),

    checked:
      payload.checked,

    revision:
      payload.revision,

    reason:
      payload.reason,

    origin:
      'Site',
  });
}

export async function getChecklistSitePendingNotifications({
  guild,
  member,
}) {
  const data = await getChecklistSiteSnapshot({
    guild,
    member,
  });

  return {
    allowed:
      data.windowOpen,

    records: data.groups.flatMap(group =>
      group.records
        .filter(item => item.rights.check)
        .map(item => ({
          id:
            `${data.weekKey}:${item.responsibleId}:${item.memberId}`,

          title:
            `Conferir logs • ${item.person.name}`,

          createdAt:
            getWeekSnapshotCutoffMs(data.weekKey),

          text:
            `Responsável: ${group.responsible.name}\n` +
            `Área: ${item.area}\n` +
            `Semana: ${data.weekLabel}`,

          url:
            data.url,

          destination:
            'checklist',
        }))
    ),
  };
}

// ===============================
// HANDLERS (Interações)
// ===============================
export async function checklistHandleInteraction(interaction, client) {
  if (!interaction.guild) return false;
  const customId = interaction.customId;

  // 1. Consultar o estado da lista semanal
  if (customId === "logcheck_sync_gi") {
    if (!hasPermission(interaction.member)) {
      return interaction.reply({
        content: "❌ Sem permissão.",
        flags: MessageFlags.Ephemeral
      });
    }

    const weekKey = weekKeyFromDateSP();
    const checklist = readChecklistWeek(weekKey);
    const data = checklist.weeks?.[weekKey] || {
      responsaveis: {},
      snapshotLocked: false
    };

    if (data.snapshotLocked !== true) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const syncedChecklist = await syncWeekData(client, true);
      const syncedData = syncedChecklist.weeks?.[weekKey] || { responsaveis: {} };
      const totalResponsaveis = Object.keys(syncedData.responsaveis || {}).length;
      const totalMembros = Object.values(syncedData.responsaveis || {}).reduce((acc, resp) => {
        return acc + Object.keys(resp?.members || {}).length;
      }, 0);

      await refreshMainPanel(client, interaction.guild).catch(() => {});

      return interaction.editReply({
        content:
          `✅ **Lista semanal criada e congelada com sucesso.**\n\n` +
          `A lista considera somente os membros elegíveis até domingo às **00:00**.\n` +
          `Durante a semana, novos membros não serão puxados para este snapshot.\n` +
          `Trocas de responsável do Controle GI continuam sendo aplicadas pontualmente, sem recriar a lista.\n\n` +
          `👤 Responsáveis carregados: **${totalResponsaveis}**\n` +
          `🧑 Membros carregados: **${totalMembros}**`,
        components: []
      });
    }

    const totalResponsaveis = Object.keys(data.responsaveis || {}).length;
    const totalMembros = Object.values(data.responsaveis || {}).reduce((acc, resp) => {
      return acc + Object.keys(resp?.members || {}).length;
    }, 0);

    return interaction.reply({
      content:
        `🔒 **A lista desta semana está congelada.**\n\n` +
        `Ela não pode ser reconstruída durante a semana.\n` +
        `Membros novos serão adicionados somente na próxima atualização de domingo às **00:00**.\n\n` +
        `👤 Responsáveis carregados: **${totalResponsaveis}**\n` +
        `🧍 Membros carregados: **${totalMembros}**`,
      flags: MessageFlags.Ephemeral
    });
  }

  // 2. Gerenciar Meus Membros
if (customId === "logcheck_my_members") {
  if (!hasPermission(interaction.member)) {
    return interaction.reply({ content: "❌ Você não é um responsável registrado.", flags: MessageFlags.Ephemeral });
  }
  
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

// ✅ Lê a semana atual sem mexer em progresso já conferido.
const weekKey = weekKeyFromDateSP();
let checklist = readChecklistWeek(weekKey);
let data = checklist.weeks?.[weekKey] || { responsaveis: {} };
let myData = data.responsaveis?.[interaction.user.id];

// Só tenta criar a lista se o snapshot semanal AINDA não existir.
// Depois de congelado, nunca reconstrói a semana para buscar membro novo.
if (
  (!myData || Object.keys(myData.members || {}).length === 0) &&
  data.snapshotLocked !== true
) {
  checklist = await syncWeekData(client, true);
  data = checklist.weeks?.[weekKey] || { responsaveis: {} };
  myData = data.responsaveis?.[interaction.user.id];
}

if (!myData || Object.keys(myData.members || {}).length === 0) {
  return interaction.editReply({
    content: "❌ Você não possui membros vinculados a você nesta lista semanal.",
    components: []
  });
}

return sendPersonalManager(interaction, interaction.user.id, weekKey, myData);
}

  // 3. Visão Geral (Responsáveis autorizados)
  if (customId === "logcheck_admin_view") {
  const guild = interaction.guild;
  if (!hasPermission(interaction.member, "admin")) {
    return interaction.reply({ content: "❌ Você não possui permissão para acessar a visão geral.", flags: MessageFlags.Ephemeral });
  }
  
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

// ✅ Apenas lê a semana atual.
// Não sincroniza aqui para não reconstruir/zerar progresso já marcado.
const weekKey = weekKeyFromDateSP();
const checklist = readChecklistWeek(weekKey);
const data = checklist.weeks?.[weekKey] || { responsaveis: {} };

    // ✅ PRE-FETCH dos responsáveis + membros para aplicar a hierarquia corretamente.
    const idsToFetch = new Set();
    for (const [respId, content] of Object.entries(data.responsaveis || {})) {
      idsToFetch.add(respId);
      Object.keys(content?.members || {}).forEach(memberId => idsToFetch.add(memberId));
    }

    if (idsToFetch.size > 0) {
      await guild.members.fetch({ user: Array.from(idsToFetch) }).catch(() => {});
    }

  const options = [];
  const respEntries = Object.entries(data.responsaveis || {});
    
  for (const [respId, content] of respEntries) {
    // Pela Visão Geral, o responsável não abre o próprio grupo.
    // Para o próprio grupo existe o botão "Gerenciar Meus Membros".
    if (respId === interaction.user.id) continue;

    const manageableMembers = Object.entries(content?.members || {}).filter(([memberId]) => {
      const targetMember = guild.members.cache.get(memberId);
      return canManageChecklistTarget(interaction.member, targetMember);
    });

    // Não mostra um responsável se o usuário não puder gerenciar ninguém daquele grupo.
    if (manageableMembers.length === 0) continue;

    const pending = manageableMembers.filter(([_, memberData]) => !memberData.checked).length;

    const member = guild.members.cache.get(respId);
    const rawName = member?.displayName || member?.user?.username || respId;

    options.push({
      label: String(rawName).slice(0, 100),
      value: `logcheck_inspect:${respId}:${weekKey}`,
      description: String(pending === 0 ? "Logs permitidas conferidas" : `${pending} pendências permitidas`).slice(0, 100),
      emoji: pending === 0 ? "🟢" : "🔴"
    });
  }

  if (options.length === 0) {
    return interaction.editReply({
      content: "❌ Nenhum grupo com membros abaixo da sua hierarquia está disponível para você.",
      components: []
    });
  }

  const select = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("logcheck_admin_select")
      .setPlaceholder("Selecione outro responsável para inspecionar")
      .addOptions(options.slice(0, 25))
  );

  return interaction.editReply({
    content: "👑 **Visão Geral**\nEscolha outro responsável. Você só poderá alterar membros abaixo da sua hierarquia.",
    components: [select],
  });
  }

  // 4. Seleção Admin
if (interaction.isStringSelectMenu() && customId === "logcheck_admin_select") {
  if (!hasPermission(interaction.member, "admin")) {
    return interaction.reply({ content: "❌ Você não possui permissão para usar a visão geral.", flags: MessageFlags.Ephemeral });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const [, respId, weekKey] = interaction.values[0].split(":");

  if (respId === interaction.user.id) {
    return interaction.editReply({
      content: "❌ Na Visão Geral você não pode abrir o próprio grupo. Use **Gerenciar Meus Membros**.",
      components: []
    });
  }

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
  if (
    interaction.isStringSelectMenu() &&
    customId.startsWith("logcheck_toggle:")
  ) {
    const [, respId, weekKey] =
      customId.split(":");

    let applied = false;

    await interaction.deferUpdate();

    try {
      await applyChecklistChange({
        client,
        guild: interaction.guild,
        actorId: interaction.user.id,
        weekKey,
        responsibleId: respId,
        memberId: interaction.values[0],
        origin: "Discord",
      });

      applied = true;

      const current =
        checklistReadStrict();

      const group =
        current.weeks[weekKey]
          ?.responsaveis?.[respId];

      if (group) {
        await sendPersonalManager(
          interaction,
          respId,
          weekKey,
          group,
          interaction.user.id !== respId,
          true
        );
      }
    } catch (error) {
      await interaction.followUp({
        content: applied
          ? "Conferência salva. Não foi possível atualizar esta mensagem; reabra o painel."
          : error.message,

        flags:
          MessageFlags.Ephemeral,
      }).catch(() => {});
    }

    return true;
  }

  // 6. Ações em Massa
  if (
    interaction.isButton() &&
    customId.startsWith("logcheck_bulk:")
  ) {
    const [, action, respId, weekKey] =
      customId.split(":");

    let applied = false;

    await interaction.deferUpdate();

    try {
      if (
        !["check", "uncheck"].includes(action)
      ) {
        throw checklistError(
          "Ação em massa inválida."
        );
      }

      await applyChecklistChange({
        client,
        guild: interaction.guild,
        actorId: interaction.user.id,
        weekKey,
        responsibleId: respId,
        bulk: true,
        checked: action === "check",
        origin: "Discord",
      });

      applied = true;

      const current =
        checklistReadStrict();

      const group =
        current.weeks[weekKey]
          ?.responsaveis?.[respId];

      if (group) {
        await sendPersonalManager(
          interaction,
          respId,
          weekKey,
          group,
          interaction.user.id !== respId,
          true
        );
      }
    } catch (error) {
      await interaction.followUp({
        content: applied
          ? "Conferências salvas. Não foi possível atualizar esta mensagem; reabra o painel."
          : error.message,

        flags:
          MessageFlags.Ephemeral,
      }).catch(() => {});
    }

    return true;
  }

  return false;
}

// Helper para enviar o menu de gerenciamento (pessoal ou admin)
async function sendPersonalManager(interaction, respId, weekKey, data, isAdmin = false, isUpdate = false) {
  const guild = interaction.guild;
  const isSunday = getNowSP().getDay() === 0;

  let access;
  let members;
  let canChange;

  try {
    access = await checklistAccess(
      guild,
      interaction.user.id
    );

    const initialStore = checklistReadStrict();

    const initialGroup =
      initialStore.weeks?.[weekKey]?.responsaveis?.[respId];

    if (!initialGroup) {
      throw checklistError(
        "Este grupo não está disponível na semana selecionada.",
        404
      );
    }

    const targetIds = Object.keys(initialGroup.members || {});
    const fetchedTargets = new Map();

    for (let offset = 0; offset < targetIds.length; offset += 4) {
      const batch = targetIds.slice(offset, offset + 4);

      await Promise.all(
        batch.map(async targetId => {
          const targetMember = await guild.members.fetch({
            user: targetId,
            force: true
          }).catch(() => null);

          if (targetMember) {
            fetchedTargets.set(targetId, targetMember);
          }
        })
      );
    }

    access = await checklistAccess(
      guild,
      interaction.user.id
    );

    const latestStore = checklistReadStrict();

    data =
      latestStore.weeks?.[weekKey]?.responsaveis?.[respId];

    if (!data) {
      throw checklistError(
        "Este grupo foi alterado ou removido. Abra o checklist novamente.",
        409
      );
    }

    members = Object.entries(data.members || {}).filter(
      ([targetId]) =>
        canManageChecklistTarget(
          access.member,
          fetchedTargets.get(targetId)
        )
    );

    if (members.length === 0) {
      throw checklistError(
        "Este grupo não possui membros que você possa gerenciar pela sua hierarquia.",
        403
      );
    }

    canChange =
      weekKey === weekKeyFromDateSP() &&
      access.windowOpen;

    const checkerIds = [
      ...new Set(
        members
          .map(([, record]) => record.checkedBy)
          .filter(Boolean)
      )
    ];

    const displayIds = [
      ...new Set([respId, ...checkerIds])
    ];

    if (displayIds.length > 0) {
      await guild.members.fetch({
        user: displayIds
      }).catch(() => {});
    }
  } catch (error) {
    console.error(
      "[Checklist] Não foi possível abrir a gestão:",
      error
    );

    const payload = {
      content: `❌ ${
        error.status
          ? error.message
          : "Não foi possível carregar o checklist. Tente atualizar a janela."
      }`,
      embeds: [],
      components: []
    };

    if (interaction.deferred || interaction.replied) {
      return interaction.editReply(payload).catch(console.error);
    }

    if (isUpdate) {
      return interaction.update(payload).catch(console.error);
    }

    return interaction.reply({
      ...payload,
      flags: MessageFlags.Ephemeral
    }).catch(console.error);
  }

  const checked = members.filter(([, record]) => record.checked).length;
  const total = members.length;

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

  const windowDescription =
    weekKey !== weekKeyFromDateSP()
      ? "📚 **Consulta de semana anterior:** alterações indisponíveis."
      : canChange
        ? "🟣 **Conferência disponível:** selecione um membro para alterar o status."
        : "🔒 **Conferência fechada:** os registros continuam disponíveis para consulta.";

  const embed = new EmbedBuilder()
    .setTitle(`📖 Gerenciar Logs: ${respDisplay}`)
    .setDescription(
      `📅 **Semana:** ${getWeekRangeLabel(weekKey)}\n` +
      `📊 **Progresso:** ${checked}/${total} conferidos\n` +
      `${windowDescription}\n\n` +
      (memberLines.length ? memberLines.join("\n") : "_Nenhum membro vinculado._")
    )
    .setColor(checked === total ? "#2ecc71" : "#8b5cf6");

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

  if (canChange && selectOptions.length > 0) {
    const select = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`logcheck_toggle:${respId}:${weekKey}`)
        .setPlaceholder("Selecione um membro para alterar o status")
        .addOptions(selectOptions.slice(0, 25))
    );

    components.push(select);

    const bulkButtons = [];

    if (members.some(([, record]) => !record.checked)) {
      bulkButtons.push(
        new ButtonBuilder()
          .setCustomId(`logcheck_bulk:check:${respId}:${weekKey}`)
          .setLabel("Conferir pendentes")
          .setStyle(ButtonStyle.Success)
      );
    }

    if (members.some(([, record]) => record.checked)) {
      bulkButtons.push(
        new ButtonBuilder()
          .setCustomId(`logcheck_bulk:uncheck:${respId}:${weekKey}`)
          .setLabel("Reabrir conferidos")
          .setStyle(ButtonStyle.Danger)
      );
    }

    if (bulkButtons.length > 0) {
      components.push(
        new ActionRowBuilder().addComponents(bulkButtons)
      );
    }
  }

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

async function logAudit(
  client,
  actor,
  respId,
  memberId,
  status,
  weekKey,
  isBulk = false,
  details = {}
) {
  const channel = await client.channels.fetch(
    LOG_CHANNEL_ID
  );

  if (
    !channel?.isTextBased() ||
    (
      details.guildId &&
      channel.guildId !== details.guildId
    )
  ) {
    throw new Error(
      'Canal de auditoria do checklist indisponível ou de outro servidor.'
    );
  }

  const at =
    Number(details.at || Date.now());

  const actorName =
    actor.name ||
    actor.tag ||
    actor.username ||
    actor.id;

  const avatar =
    actor.avatar ||
    actor.displayAvatarURL?.({
      size: 128,
    });

  const embed = new EmbedBuilder()
    .setTitle(
      isBulk
        ? '📑 Checklist: Ação em Massa'
        : '📑 Checklist Individual Atualizado'
    )
    .setColor(
      status
        ? '#2ecc71'
        : '#e74c3c'
    )
    .setAuthor({
      name: actorName,
      iconURL: avatar,
      url:
        `https://discord.com/users/${actor.id}`,
    })
    .addFields(
      {
        name: '👤 Responsável',
        value: `<@${respId}>`,
        inline: true,
      },
      {
        name: '🧍 Membro(s)',
        value:
          memberId === 'TODOS'
            ? 'Todos os vinculados'
            : `<@${memberId}>`,
        inline: true,
      },
      {
        name: '📌 Ação',
        value:
          status
            ? '✅ Marcou como Conferido'
            : '❌ Marcou como Pendente',
        inline: true,
      },
      {
        name: '🔧 Alterado por',
        value:
          `<@${actor.id}>\nID: ${actor.id}`,
        inline: true,
      },
      {
        name: '📅 Semana',
        value: weekKey,
        inline: true,
      },
      {
        name: 'Origem',
        value:
          details.origin || 'Discord',
        inline: true,
      },
      {
        name: 'Data e hora',
        value:
          `<t:${Math.floor(at / 1000)}:F>`,
        inline: true,
      },
      {
        name: 'Motivo',
        value:
          String(
            details.reason ||
            'Não informado.'
          ).slice(0, 1000),
      }
    )
    .setTimestamp(at);

  if (details.id) {
    embed.addFields({
      name: 'Operação',
      value: details.id,
    });
  }

  const files =
    details.before && details.after
      ? [
          {
            attachment: Buffer.from(
              JSON.stringify(
                {
                  operationId:
                    details.id,

                  guildId:
                    details.guildId,

                  actor,

                  origin:
                    details.origin,

                  at,
                  weekKey,

                  responsibleId:
                    respId,

                  memberId,

                  reason:
                    details.reason || '',

                  before:
                    details.before,

                  after:
                    details.after,
                },
                null,
                2
              )
            ),

            name:
              `checklist-${details.id}.json`,
          },
        ]
      : [];

  await channel.send({
    embeds: [embed],
    files,
  });
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

let CHECKLIST_RUNTIME_CLIENT = null;

dashOn(
  "gi:responsavel_transferido",
  async (data) => {
    try {
      await applyGiResponsibleTransferToCurrentWeek(
        CHECKLIST_RUNTIME_CLIENT,
        data
      );
    } catch (error) {
      console.error(
        "[ChecklistLogs] Falha ao aplicar transferência de responsável do Controle GI:",
        error
      );
    }
  }
);

export async function checklistOnReady(client) {
  CHECKLIST_RUNTIME_CLIENT = client;

  installChecklistAudit(client);

  const weekKey = weekKeyFromDateSP();
  const checklist = readChecklistWeek(weekKey);
  const currentWeekData = checklist.weeks[weekKey];

  // ✅ Recuperação segura:
  // Se o bot estava desligado no domingo às 00:00, cria a lista uma única vez
  // quando voltar. Se a lista já estiver congelada, o restart não altera nada.
  if (currentWeekData?.snapshotLocked !== true) {
    await syncWeekData(client, true).catch((error) => {
      console.error("[ChecklistLogs] Falha ao criar a lista semanal:", error);
    });
  }

  // ✅ Reconciliação segura:
  // Corrige vínculos antigos/duplicados usando o responsável atual do Controle GI,
  // mas somente para membros que JÁ pertencem ao snapshot desta semana.
  // Membros novos continuam aguardando o próximo domingo.
  await reconcileCurrentWeekResponsibleAssignments(client).catch((error) => {
    console.error(
      "[ChecklistLogs] Falha ao reconciliar responsáveis da semana atual:",
      error
    );
  });

  await refreshMainPanel(client).catch(() => {});

  // ✅ Lembretes de domingo até quarta-feira, às 12:00, 16:00 e 20:00.
  cron.schedule(
    "0 12,16,20 * * 0-3",
    () => sendSundayReminders(client),
    { timezone: TZ }
  );

  // ✅ Todo domingo às 00:00 começa uma nova semana.
  // A nova chave semanal ainda não terá snapshot, então a lista será criada
  // uma única vez e ficará congelada até o próximo domingo.
  cron.schedule(
    "0 0 * * 0",
    async () => {
      await syncWeekData(client, true).catch((error) => {
        console.error("[ChecklistLogs] Falha na atualização semanal:", error);
      });

      await refreshMainPanel(client).catch(() => {});
    },
    { timezone: TZ }
  );
}

export async function checklistHandleMessage(message, client) {
  if (!message.guild || message.author.bot) return false;

  const content = message.content.toLowerCase().trim();
  if (content !== "!checklogs" && content !== "!recriarchecklogs") return false;

  if (!hasPermission(message.member)) {
    return message.reply("❌ Sem permissão.").then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
  }

  await message.delete().catch(() => {});

const weekKey = weekKeyFromDateSP();
readChecklistWeek(weekKey);

// ✅ O comando apenas publica o painel.
// Ele nunca reconstrói ou altera a lista semanal congelada.
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