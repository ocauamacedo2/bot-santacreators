// /application/events/scGeralWeeklyRanking.js
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  EmbedBuilder,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";

import { dashOn } from "../utils/dashHub.js";

import {
  registerOperationalMetricProvider,
} from "../utils/operationalMetricsHub.js";

import {
  GERAL_PARSERS,
  GERAL_CHANNELS,
  GeralAudit,
} from "../shared/scGeralSources.js";


// ✅ __dirname no ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ pasta /data do projeto
function pickPersistRoot() {
  const candidates = [
    process.env.SQUARECLOUD_STORAGE_PATH?.trim(),
    "/storage",
    "/home/container/storage",
    "/home/squarecloud/storage",
  ].filter(Boolean);

  for (const dir of candidates) {
    try { if (fs.existsSync(dir)) return dir; } catch {}
  }
  return null;
}

const DATA_DIR = path.resolve(pickPersistRoot() || path.join(__dirname, ".."), "data");

// ================== AJUSTE MANUAL (CONFIG GLOBAL) ==================
const ADJUSTMENTS_FILE = path.join(DATA_DIR, "sc_points_adjustments.json");

// ✅ usuários com bypass total
const ALLOWED_REMOVE_USERS = new Set([
  "660311795327828008", // você
  "1262262852949905408", // owner
]);

// ✅ cargos permitidos para remover pontos
const ALLOWED_REMOVE_ROLES = new Set([
  "1352408327983861844", // resp creators
  "1262262852949905409", // resp influ
  "1352407252216184833", // resp lider
]);

// ✅ HIERARQUIA INTERNA DOS CARGOS PERMITIDOS
// quanto MAIOR o número, MAIOR a hierarquia
// ajuste aqui conforme a hierarquia real desejada
const REMOVE_ROLE_HIERARCHY = new Map([
  ["1352407252216184833", 1], // resp lider
  ["1352408327983861844", 2], // resp creators
  ["1262262852949905409", 3], // resp influ
]);

function getAllowedRemovalRoleIdsFromMember(member) {
  try {
    if (!member?.roles?.cache) return [];
    return member.roles.cache
      .map((r) => r.id)
      .filter((id) => ALLOWED_REMOVE_ROLES.has(id));
  } catch {
    return [];
  }
}

function getHighestRemovalHierarchyLevel(member) {
  const ids = getAllowedRemovalRoleIdsFromMember(member);
  if (!ids.length) return null;

  let highest = null;
  for (const id of ids) {
    const lvl = REMOVE_ROLE_HIERARCHY.get(id);
    if (lvl == null) continue;
    if (highest == null || lvl > highest) highest = lvl;
  }
  return highest;
}

function getHighestRemovalRoleId(member) {
  const ids = getAllowedRemovalRoleIdsFromMember(member);
  if (!ids.length) return null;

  let bestRoleId = null;
  let bestLevel = null;

  for (const id of ids) {
    const lvl = REMOVE_ROLE_HIERARCHY.get(id);
    if (lvl == null) continue;
    if (bestLevel == null || lvl > bestLevel) {
      bestLevel = lvl;
      bestRoleId = id;
    }
  }

  return bestRoleId;
}

function getRemovalRoleLabel(roleId) {
  switch (String(roleId || "")) {
    case "1352407252216184833":
      return "Resp Líder";
    case "1352408327983861844":
      return "Resp Creators";
    case "1262262852949905409":
      return "Resp Influ";
    default:
      return "Sem cargo permitido";
  }
}

async function fetchGuildMemberSafe(guild, userId) {
  try {
    if (!guild || !userId) return null;
    return await guild.members.fetch(userId);
  } catch {
    return null;
  }
}

function getTargetHighestRemovalHierarchyLevel(member) {
  return getHighestRemovalHierarchyLevel(member);
}

/**
 * Regras:
 * - owner/você: bypass total
 * - executor sem cargo permitido: bloqueia
 * - alvo com cargo permitido:
 *    - só permite se executor for ESTRITAMENTE acima
 *    - igual bloqueia
 *    - abaixo bloqueia
 * - alvo sem cargo permitido:
 *    - permite (não está protegido pela hierarquia dos cargos autorizados)
 */
async function canRemovePointsFromTarget({ guild, executorId, targetUserId }) {
  const isBypass = ALLOWED_REMOVE_USERS.has(String(executorId || ""));
  if (isBypass) {
    return {
      ok: true,
      bypass: true,
      executorMember: await fetchGuildMemberSafe(guild, executorId),
      targetMember: await fetchGuildMemberSafe(guild, targetUserId),
      executorRoleId: null,
      executorLevel: Infinity,
      targetLevel: null,
      reason: null,
    };
  }

  const executorMember = await fetchGuildMemberSafe(guild, executorId);
  if (!executorMember) {
    return {
      ok: false,
      bypass: false,
      reason: "Executor não encontrado no servidor.",
      executorMember: null,
      targetMember: null,
      executorRoleId: null,
      executorLevel: null,
      targetLevel: null,
    };
  }

  const executorLevel = getHighestRemovalHierarchyLevel(executorMember);
  const executorRoleId = getHighestRemovalRoleId(executorMember);

  if (executorLevel == null || !executorRoleId) {
    return {
      ok: false,
      bypass: false,
      reason: "Você não possui cargo permitido para remover pontos.",
      executorMember,
      targetMember: null,
      executorRoleId: null,
      executorLevel: null,
      targetLevel: null,
    };
  }

  const targetMember = await fetchGuildMemberSafe(guild, targetUserId);
  const targetLevel = getTargetHighestRemovalHierarchyLevel(targetMember);

  if (targetLevel == null) {
    return {
      ok: true,
      bypass: false,
      reason: null,
      executorMember,
      targetMember,
      executorRoleId,
      executorLevel,
      targetLevel: null,
    };
  }

  if (executorLevel <= targetLevel) {
    return {
      ok: false,
      bypass: false,
      reason: "Você só pode remover pontos de cargos ABAIXO do seu na hierarquia permitida.",
      executorMember,
      targetMember,
      executorRoleId,
      executorLevel,
      targetLevel,
    };
  }

  return {
    ok: true,
    bypass: false,
    reason: null,
    executorMember,
    targetMember,
    executorRoleId,
    executorLevel,
    targetLevel,
  };
}

function loadAdjustments() {
  return readJSON(ADJUSTMENTS_FILE, {
    byWeek: {},
  });
}

function saveAdjustments(data) {
  writeJSON(ADJUSTMENTS_FILE, data);
}

function applyManualAdjustment({ weekKey, userId, delta }) {
  const data = loadAdjustments();
  data.byWeek = data.byWeek || {};
  data.byWeek[weekKey] = data.byWeek[weekKey] || {};

  const before = Number(data.byWeek[weekKey][userId] || 0);
  const after = before + Number(delta || 0);

  data.byWeek[weekKey][userId] = after;
  saveAdjustments(data);

  return { before, after, data };
}

async function emitManualRemoveLog(client, payload = {}) {
  try {
    const logChannelId =
      process.env.SC_GERAL_REMOVE_LOGS_ID?.trim() ||
      process.env.SC_GERAL_ADJUST_LOGS_ID?.trim() ||
      "1486006930492362893";

    const ch = await client.channels.fetch(logChannelId).catch(() => null);
    if (!ch?.isTextBased?.()) return false;

    const embed = new EmbedBuilder()
      .setTitle("🧾 Remoção manual de pontos")
      .setColor(0xef4444)
      .addFields(
        { name: "Executor", value: payload.executorMention || "—", inline: true },
        { name: "Alvo", value: payload.targetMention || "—", inline: true },
        { name: "Quantidade removida", value: `-${Number(payload.qty || 0)}`, inline: true },
        { name: "Semana", value: `\`${payload.weekKey || "—"}\``, inline: true },
        { name: "Antes", value: String(payload.before ?? "0"), inline: true },
        { name: "Depois", value: String(payload.after ?? "0"), inline: true },
        { name: "Modo", value: payload.bypass ? "BYPASS (owner/você)" : "Hierarquia", inline: true },
        { name: "Cargo efetivo", value: payload.executorRoleLabel || "BYPASS", inline: true },
        { name: "Data/Hora", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
      )
      .setFooter({ text: `MANUAL_REMOVE::WK=${payload.weekKey || "unknown"}::TARGET=${payload.targetUserId || "unknown"}` });

    await ch.send({ embeds: [embed] });
    return true;
  } catch (e) {
    console.error("[SC_GERAL_WEEKLY_RANK] emitManualRemoveLog error:", e);
    return false;
  }
}

// ✅ GUARD GLOBAL REAL (não deixa boot 2x se importou duplicado)
const __SC_GERAL_RANK_SKIP__ = Boolean(globalThis.__SC_GERAL_WEEKLY_RANK_ALREADY_BOOTSTRAPPED__);
if (__SC_GERAL_RANK_SKIP__) {
  // console.log("[SC_GERAL_WEEKLY_RANK] já bootstrapped — pulando init.");
} else {
  globalThis.__SC_GERAL_WEEKLY_RANK_ALREADY_BOOTSTRAPPED__ = true;
  // console.log("[SC_GERAL_WEEKLY_RANK] bootstrapped OK.");
}

// ============================================================================
// SC_GERAL_WEEKLY_RANK v1.0 — Ranking semanal (SEM IMAGENS)
// - Pega as MESMAS fontes do scGeralDash.js (scan + extras + evt3 + bp)
// - Envia/edita ranking no canal: 1415387000416243722
// - Mínimo por pessoa/semana: 7 pontos
// - Atualiza:
//    • durante a semana quando DIRTY (via HUB)
//    • no domingo, quando vira a semana (cria/edita msg da semana nova)
// - Não interfere no GeralDash (state/guards separados)
// ============================================================================

// ================== CONFIG ==================
const RANK_CHANNEL_ID = "1415387000416243722";

// marker p/ achar msg no canal
const RANK_MARKER_PREFIX = "SC_GERAL_WEEKLY_RANK::WK=";

// mínimo de pontos por semana
const MIN_POINTS_WEEK = 25;

// timezone
const TZ = "America/Sao_Paulo";

// ===== VISUAL =====
const RANK_BANNER =
  "https://media.discordapp.net/attachments/1362477839944777889/1384245215249825832/standard_2rss.gif";

// ✅ Mude esse número quando alterar o visual do ranking.
// Isso força o bot a editar a mensagem mesmo se os pontos forem iguais.
const RANK_RENDER_VERSION = 3;

// medalhas bonitinhas
function medal(i) {
  if (i === 0) return "🥇";
  if (i === 1) return "🥈";
  if (i === 2) return "🥉";
  return "🏅";
}

function fmtPts(n) {
  return `**${Number(n || 0)}** pts`;
}

// cor por “status” (mais gente batendo o mínimo = mais verde)
function pickColorByHitRate(participants, metMin) {
  const r = participants > 0 ? metMin / participants : 0;
  if (r >= 0.7) return 0x16a34a; // verde
  if (r >= 0.4) return 0xf59e0b; // laranja
  return 0xef4444; // vermelho
}


// cooldowns/scan
const SCAN_TTL_MS = 20 * 60 * 1000;
const COOLDOWN_LIGHT_MS = 60 * 1000; // 1min throttle de update leve
const COOLDOWN_FULL_MS = 4 * 60 * 60 * 1000; // 4h (igual teu dash, se quiser full manual)

// quantas páginas procurar no canal de ranking (pra achar msg antiga)
const RANK_FIND_PAGES = 10; // 1000 msgs

const VIP_MENU_CHANNEL_ID = "1414718336826081330"; // ✅ registros VIP por evento

const DOACAO_LOGS_CHANNEL_IDS = [
  "1486009647923200120",
];

const CONVITES_LOGS_CHANNEL_IDS = [
  "1486009598237212793",
  "1415102820826349648",
];

const PERGUNTAS_LOGS_CHANNEL_IDS = [
  process.env.SCPERGUNTAS_LOGS_ID?.trim(),
  "1486084249755979950",
].filter(Boolean);

const VENDAS_LOGS_CHANNEL_IDS = [
  "1486084262867370105",
];

const CRONOGRAMA_LOGS_CHANNEL_IDS = [
  "1486009619846529075",
  "1387864036259004436",
];

const PRESENCA_LOGS_CHANNEL_IDS = [
  "1486006866046615682",
];

const CORRECAO_LOGS_CHANNEL_IDS = [
  "1486006908056899748",
  "1486084249755979950",
];

const ALINHAMENTOS_LOGS_CHANNEL_IDS = [
  "1425256185707233301",
  "1515132246728638574",
];

const EVENTOS_NORMAL_CHANNEL_IDS = [
  "1515128485331468318",
];

const EVENTOS_PODER_CHANNEL_IDS = [
  "1392618646630568076",
];

const CH_PODERES_ID = "1374066813171929218";
const CH_PAGAMENTOS_ID = "1387922662134775818";
const CH_MANAGER_ID = "1486084441762693291";
const CH_MANAGER_MAIN_ID = "1392680204517769277";

// aliases de compatibilidade para blocos antigos
const DOACAO_LOGS_CHANNEL_ID = DOACAO_LOGS_CHANNEL_IDS[0];
const CONVITES_LOGS_CHANNEL_ID = CONVITES_LOGS_CHANNEL_IDS[0];
const PERGUNTAS_LOGS_CHANNEL_ID = PERGUNTAS_LOGS_CHANNEL_IDS[0] || "";
const VENDAS_LOGS_CHANNEL_ID = VENDAS_LOGS_CHANNEL_IDS[0];
const CRONOGRAMA_LOGS_CHANNEL_ID = CRONOGRAMA_LOGS_CHANNEL_IDS[0];
const PRESENCA_LOGS_CHANNEL_ID = PRESENCA_LOGS_CHANNEL_IDS[0];
const CORRECAO_LOGS_CHANNEL_ID = CORRECAO_LOGS_CHANNEL_IDS[0];
const CH_ALINHAMENTOS_ID = ALINHAMENTOS_LOGS_CHANNEL_IDS[0];

// EVT3
const EVT3_STATE_FILE = path.join(DATA_DIR, "evt3_events_state.json");
const EVT3_EVENT_PARENT_ID = "1457573495952248883";

// Bate Ponto calendário
const BP_CALENDAR_CHANNEL_ID = "1417602545953804328";

// ================== STATE ==================
const STATE_PATH = path.join(DATA_DIR, "sc_geral_weekly_rank_state_v1.json");

let LOCK = false;
let LOCK_TS = 0; // ✅ Timestamp da trava local
let DIRTY = false;
let CACHE = { at: 0, payload: null };
let LAST_LIGHT_AT = 0;

const DEBUG = {
  lastRunAt: null,
  lastReason: "",
  weekKeysFound: {},
};

const MANAGER_AUDIT_ENABLED = process.env.SC_MANAGER_AUDIT === "1";

function clearWeeklyRankCache() {
  CACHE = { at: 0, payload: null };
  DEBUG.weekKeysFound = {};
}

// ================== FILE HELPERS ==================
function ensureDirForFile(filePath) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  } catch {}
}

function readJSON(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const raw = fs.readFileSync(file, "utf8");
    if (!raw || !raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.error("[SC_GERAL_WEEKLY_RANK] ⚠️ JSON inválido, usando fallback:", file, e?.message || e);
    return fallback;
  }
}

function writeJSON(file, data) {
  try {
    ensureDirForFile(file);
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, file);
  } catch (e) {
    console.error("[SC_GERAL_WEEKLY_RANK] ❌ Falha ao salvar state:", file, e?.message || e);
  }
}

function loadState() {
  return readJSON(STATE_PATH, {
    // msgId por weekKey (pra editar sem spammar)
    weeklyMsgIds: {},
    // última weekKey que foi “detectada” no scheduler
    lastSeenWeekKey: null,
    // cache de assinatura por weekKey (não editar se nada mudou)
    sigByWeek: {},
    // para full manual cooldown
    nextFullAllowedAt: 0,
  });
}

function saveState(s) {
  writeJSON(STATE_PATH, s);
}

// ================== TIME HELPERS ==================
function nowSP() {
  return new Date();
}

function ymdSP(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return {
    y: +parts.find((p) => p.type === "year").value,
    m: +parts.find((p) => p.type === "month").value,
    d: +parts.find((p) => p.type === "day").value,
  };
}

// ✅ FIX REAL: início do dia em SP (00:00 SP) convertido pra UTC
// SP = UTC-3 → 00:00 SP = 03:00 UTC
function startOfDaySP(date) {
  const { y, m, d } = ymdSP(date);
  return new Date(Date.UTC(y, m - 1, d, 3, 0, 0));
}

function dowSP(date) {
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "short",
  }).format(date);
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[wd] ?? 0;
}

function addDaysUTC(d, n) {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

function weekKeyFromDateSP(date) {
  const sod = startOfDaySP(date);
  const dow = dowSP(date);
  const sunday = addDaysUTC(sod, -dow);
  return sunday.toISOString().slice(0, 10);
}

function weekKeyToDateUTC(weekKey) {
  const [Y, M, D] = String(weekKey || "").split("-").map(Number);
  if (!Y || !M || !D) return null;
  return new Date(Date.UTC(Y, M - 1, D));
}

function addDaysToWeekKey(weekKey, days) {
  const base = weekKeyToDateUTC(weekKey);
  if (!base) return null;
  const next = addDaysUTC(base, days);
  return next.toISOString().slice(0, 10);
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

// label curto (qui/sex/sab igual teu dash)
function triLabelShortFromWeekKey(weekKey) {
  try {
    const [Y, M, D] = weekKey.split("-").map(Number);
    const sundayUTC = new Date(Date.UTC(Y, M - 1, D));
    const thu = addDaysUTC(sundayUTC, 4);
    const fri = addDaysUTC(sundayUTC, 5);
    const sat = addDaysUTC(sundayUTC, 6);

    const f = (dt) => {
      const { d, m } = ymdSP(new Date(dt.toLocaleString("en-US", { timeZone: TZ })));
      return { dd: pad2(d), mm: pad2(m) };
    };

    const a = f(thu), b = f(fri), c = f(sat);
    const sameMonth = a.mm === b.mm && b.mm === c.mm;

    return sameMonth
      ? `${a.dd}/${b.dd}/${c.dd}-${a.mm}`
      : `${a.dd}-${a.mm}/${b.dd}-${b.mm}/${c.dd}-${c.mm}`;
  } catch {
    return weekKey;
  }
}

// ================== TEXT HELPERS ==================
function getEmbedText(embed) {
  const data = embed?.data || embed || {};
  const parts = [];

  if (data.title) parts.push(data.title);
  if (data.description) parts.push(data.description);
  if (data.footer?.text) parts.push(data.footer.text);

  for (const field of data.fields || []) {
    parts.push(field?.name || "");
    parts.push(field?.value || "");
  }

  return parts.join("\n");
}

function norm(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
function getFields(emb) {
  return emb?.fields || emb?.data?.fields || [];
}

function getStatusValueFromEmbed(emb) {
  const fields = getFields(emb);
  const f = fields.find((x) => x?.name === "📌 Status");
  return String(f?.value || "");
}

function approval_getTextBag(emb) {
  const title = String(emb?.title || emb?.data?.title || "");
  const desc = String(emb?.description || emb?.data?.description || "");
  const footer = String(emb?.footer?.text || emb?.data?.footer?.text || "");
  const fields = getFields(emb)
    .map((f) => `${f?.name || ""}\n${f?.value || ""}`)
    .join("\n");

  return `${title}\n${desc}\n${fields}\n${footer}`;
}

function approval_isApproved(emb) {
  const text = approval_getTextBag(emb);
  const raw = String(text || "");
  const n = norm(raw);

  const isRejected =
    n.includes("recusado") ||
    n.includes("reprovado") ||
    n.includes("negado");

  if (isRejected) return false;

  return (
    emb?.color === 3066993 ||
    n.includes("aprovado por") ||
    n.includes("aprovado") ||
    n.includes("cronograma aprovado") ||
    n.includes("ponto computado") ||
    n.includes("hall da fama aprovado") ||
    n.includes("evento diario aprovado") ||
    n.includes("evento diário aprovado")
  );
}

function approval_getSolicitanteId(emb) {
  const fields = getFields(emb);

  const f = fields.find((x) => {
    const n = norm(x?.name);
    return (
      n.includes("solicitante") ||
      n.includes("quem solicitou") ||
      n.includes("pedido por") ||
      n.includes("autor da solicitacao") ||
      n.includes("autor da solicitação")
    );
  });

  if (f) {
    const v = String(f.value || "");
    return pickFirstMentionId(v) || pickFirstIdLoose(v);
  }

  const text = approval_getTextBag(emb);

  const solicitanteMatch = /solicitante[\s\S]{0,180}<@!?(\d{17,22})>/i.exec(text);
  if (solicitanteMatch) return solicitanteMatch[1];

  return null;
}

function approval_getSource(emb) {
  const text = norm(approval_getTextBag(emb));

  if (text.includes("hall da fama")) return "halldafama";
  if (text.includes("evento diario") || text.includes("evento diário")) return "eventosdiarios";

  return "cronograma";
}

// ================== SCAN HELPERS ==================
async function scanChannelEmbeds(client, { channelId, weekFloorKey, maxPages = 60, onMessage }) {
  const ch = await client.channels.fetch(channelId).catch(() => null);
  if (!ch?.isTextBased?.()) return;

  const floor = String(weekFloorKey || "").trim() || null;
  let lastId;
  let stop = false;

  for (let p = 0; p < maxPages; p++) {
    const batch = await ch.messages.fetch({ limit: 100, before: lastId }).catch(() => null);
    if (!batch?.size) break;

    for (const msg of batch.values()) {
      if (floor) {
        const wkMsg = weekKeyFromDateSP(new Date(msg.createdTimestamp));
        if (wkMsg < floor) { stop = true; break; }
      }
      await onMessage(msg);
    }

    lastId = batch.last()?.id;
    if (!lastId) break;
    if (stop) break;
  }
}

// ================== PARSERS (MESMOS DO TEU DASH) ==================
function isPoderesRecordEmbed(emb) {
  const t = norm(emb?.title || emb?.data?.title || "");
  return t.includes("registro") && t.includes("poderes") && t.includes("utilizados");
}
function poderes_getUserId(emb) {
  const f = getFields(emb).find((x) => norm(x?.name).includes("id"));
  const v = String(f?.value || "").trim();
  return /^\d{17,20}$/.test(v) ? v : null;
}

function normalizeNoPowerText(text = "") {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isNoPowerEventRegisterText(text = "") {
  const raw = normalizeNoPowerText(text);

  return [
    /\bnao pontuar\b/,
    /\bnao conta ponto\b/,
    /\bnao contar ponto\b/,
    /\bsem pontuacao\b/,
    /\bsem ponto\b/,
    /\bsem uso ausente\b/,
    /\bnao usei\b/,
    /\bn usei\b/,
    /\bnn usei\b/,
    /\bnao utilizei\b/,
    /\bn utilizei\b/,
    /\bnn utilizei\b/,
    /\bnao fui\b/,
    /\bn fui\b/,
    /\bnn fui\b/,
    /\bnao participei\b/,
    /\bn participei\b/,
    /\bnn participei\b/,
    /\bnao estava\b/,
    /\bn estava\b/,
    /\bnn estava\b/,
    /\bnao loguei\b/,
    /\bn loguei\b/,
    /\bnn loguei\b/,
    /\bnao entrei\b/,
    /\bn entrei\b/,
    /\bnn entrei\b/,
    /\boff\b/,
    /\bsem uso\b/,
    /\bzero uso\b/,
    /\b0 uso\b/,
    /\bnao teve uso\b/,
    /\bnada usado\b/,
    /\bdesconsidera\b/,
    /\bdesconsiderar\b/,
  ].some((r) => r.test(raw));
}

function eventos_getRecordType(emb) {
  const t = norm(emb?.title || emb?.data?.title || "");

  const isEvento = t.includes("registro") && t.includes("evento") && !t.includes("uso de poderes");
  const isPoderEmEvento =
    t.includes("registro") &&
    (t.includes("uso de poderes") || (t.includes("poderes") && t.includes("evento")));

  if (isPoderEmEvento) return "eventopoder";
  if (isEvento) return "eventos";
  return null;
}
function eventos_getRegistrarId(emb) {
  const f = getFields(emb).find((x) => norm(x?.name).includes("registrado por"));
  const m = /<@!?(\d+)>/.exec(String(f?.value || ""));
  return m ? m[1] : null;
}

function isPaymentRecordEmbed(emb) {
  const t = String(emb?.title || emb?.data?.title || "");
  return t.includes("Registro de Pagamento de Evento") && t.includes("SANTACREATORS");
}
function pagamentos_getRegistrarId(emb) {
  const fields = getFields(emb);
  // ✅ Tenta pelo campo novo de ID fixo ou pelo antigo de menção
  const f = fields.find((x) => norm(x?.name).includes("criador do registro")) || 
            fields.find((x) => norm(x?.name).includes("registro"));
  const m = /<@!?(\d+)>|`(\d+)`/.exec(String(f?.value || ""));
  return m ? (m[1] || m[2]) : null;
}

// Helper para Pagamento Social (Backfill)
function pagamento_getStatus(emb) {
  const fields = getFields(emb);

  // ✅ Checa SOMENTE o VALOR do campo Status.
  // ✅ Pago só conta quando o status final for exatamente "✅ PAGO".
  // ✅ Criado, aguardando, solicitado e reprovado NÃO contam como pago.
  const statusField = fields.find((f) => norm(f?.name).includes("status"));
  const rawStatusValue = String(statusField?.value || "");
  const statusValue = norm(rawStatusValue);

  const isPago =
    /✅\s*\*{0,2}PAGO\*{0,2}/i.test(rawStatusValue) ||
    /^pago\b/i.test(statusValue);

  const isReprovado =
    /❌\s*\*{0,2}REPROVADO\*{0,2}/i.test(rawStatusValue) ||
    /^reprovado\b/i.test(statusValue);

  const isSolicitado =
    /JÁ FOI SOLICITADO|JA FOI SOLICITADO/i.test(rawStatusValue) ||
    statusValue.includes("ja foi solicitado") ||
    statusValue.includes("solicitado");

  return { isPago, isReprovado, isSolicitado };
}

function isRegistroManagerEmbed(emb) {
  const t = norm(emb?.title || emb?.data?.title || "");

  return (
    (t.includes("registro") && t.includes("evento") && t.includes("manager")) ||
    (t.includes("log") && t.includes("registro") && t.includes("manager"))
  );
}
function manager_isApproved(emb) {
  return getFields(emb).some((f) => norm(f?.name).includes("aprovado por"));
}
function manager_isRejected(emb) {
  return getFields(emb).some((f) => norm(f?.name).includes("reprovado por"));
}
function manager_getRegistrarId(emb) {
  const f = getFields(emb).find((x) => norm(x?.name).includes("registrado por"));
  const m = /<@!?(\d+)>/.exec(String(f?.value || ""));
  return m ? m[1] : null;
}
function manager_getManagerId(emb) {
  const fields = getFields(emb);
  const f = fields.find((x) => norm(x?.name).includes("manager responsavel"));
  const v = String(f?.value || "").trim();
  if (!v) return null;

  if (/^\d{17,20}$/.test(v)) return v;
  let m = /<@!?(\d{17,20})>/.exec(v);
  if (m) return m[1];
  m = /`(\d{17,20})`/.exec(v);
  if (m) return m[1];
  return null;
}

// VIP EVENTO
function isVipRecordEmbed(emb) {
  const t = norm(emb?.title || emb?.data?.title || "");
  return t.includes("registro de vip por evento");
}

function vip_getStatus(emb) {
  const fields = getFields(emb);
  
  const solValue = fields.find(f => norm(f.name).startsWith("solicitacoes"))?.value || "";
  const pagValue = fields.find(f => norm(f.name).startsWith("pagamento"))?.value || "";
  const repValue = fields.find(f => norm(f.name).startsWith("reprovacao"))?.value || "";

  const solNorm = norm(solValue);
  const pagNorm = norm(pagValue);
  const repNorm = norm(repValue);

  return {
    isSolicitado: solNorm.includes("solicitado"),
    isPago: pagNorm.includes("pago"),
    isReprovado: repNorm.includes("reprovado")
  };
}

function vip_getPagoByUserId(emb) {
  const fields = getFields(emb);
  const f = fields.find((x) => norm(x?.name).startsWith("pagamento"));
  const v = String(f?.value || "");
  const m = /por\s+<@!?(\d+)>/i.exec(v);
  return m ? m[1] : null;
}

function vip_getPagoAtSP(emb) {
  try {
    const fields = getFields(emb);
    const f = fields.find((x) => norm(x?.name).startsWith("pagamento"));
    const v = String(f?.value || "").trim();
    if (!v) return null;

    // 1) tenta pegar timestamp do Discord: <t:1234567890:F>
    let m = /<t:(\d{10,})/i.exec(v);
    if (m) {
      return new Date(Number(m[1]) * 1000);
    }

    // 2) fallback pra dd/mm/yyyy hh:mm:ss caso um dia o formato mude
    m = /(\d{1,2})\/(\d{1,2})\/(\d{4}).*?(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/i.exec(v);
    if (!m) return null;

    const dd = +m[1];
    const mm = +m[2];
    const yy = +m[3];
    const hh = +m[4];
    const mi = +m[5];
    const ss = +(m[6] || 0);

    return new Date(Date.UTC(yy, mm - 1, dd, hh + 3, mi, ss));
  } catch {
    return null;
  }
}


// ✅ data/hora do aprovado (pra semana certa)
function manager_getApprovedAtSP(emb) {
  try {
    const f = getFields(emb).find((x) => norm(x?.name).includes("aprovado por"));
    const v = String(f?.value || "").trim();
    if (!v) return null;

    // ✅ Regex mais flexível: procura DD/MM/YYYY e HH:MM:SS em qualquer lugar
    const m = v.match(/(\d{1,2})\/(\d{1,2})\/(\d{4}).*?(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
    if (!m) return null;

    const dd = +m[1], mm = +m[2], yy = +m[3], hh = +m[4], mi = +m[5], ss = +(m[6] || 0);
    // ✅ FIX TIMEZONE: Soma 3h ao horário SP para obter o UTC correto
    return new Date(Date.UTC(yy, mm - 1, dd, hh + 3, mi, ss));
  } catch {
    return null;
  }
}

function manager_getCanonicalRecordId(emb, msg) {
  const text = getEmbedText(emb);

  let m = /rm\s*msgid\s*:\s*(\d{17,20})/i.exec(text);
  if (m) return m[1];

  m = /discord\.com\/channels\/\d+\/1392680204517769277\/(\d{17,20})/i.exec(text);
  if (m) return m[1];

  m = /https?:\/\/discord\.com\/channels\/\d+\/\d+\/(\d{17,20})/i.exec(text);
  if (m) return m[1];

  return String(msg?.id || "").trim();
}

function makeManagerStableDedupeKey(emb, msg, uid, approvedAt) {
  const recordId = manager_getCanonicalRecordId(emb, msg);

  if (recordId) {
    return `manager::record::${recordId}`;
  }

  const approvedKey =
    approvedAt instanceof Date && !Number.isNaN(approvedAt.getTime())
      ? approvedAt.toISOString()
      : "sem-data-aprovacao";

  const safeUserId = String(uid || "").trim();
  const safeEmbedText = norm(getEmbedText(emb)).slice(0, 500);

  return `manager::fallback::${safeUserId}::${approvedKey}::${safeEmbedText}`;
}

// ALINHAMENTOS
function isAlinhamentoRecordEmbed(emb) {
  const t = norm(emb?.title || emb?.data?.title || "");
  const footer = norm(emb?.footer?.text || emb?.data?.footer?.text || "");
  return (
    t.includes("registro de alinhamento") ||
    (t.includes("registro") && t.includes("alinhamento")) ||
    footer.includes("alinv1")
  );
}
function alinhamento_getQuemAlinhouId(emb) {
  const fields = getFields(emb);
  const f = fields.find((x) => norm(x?.name).includes("quem alinhou"));
  const v = String(f?.value || "").trim();
  if (!v) return null;

  let m = /<@!?(\d{17,20})>/.exec(v);
  if (m) return m[1];
  m = /`(\d{17,20})`/.exec(v);
  if (m) return m[1];
  if (/^\d{17,20}$/.test(v)) return v;
  return null;
}

// EVT3 read
function readEvt3State() {
  try {
    if (!fs.existsSync(EVT3_STATE_FILE)) return null;
    return JSON.parse(fs.readFileSync(EVT3_STATE_FILE, "utf-8")) || null;
  } catch {
    return null;
  }
}

// Bate ponto JSON pinned
function safeParseJSONBlock(content) {
  try {
    const s = String(content || "").trim();
    if (!s.startsWith("```json")) return null;
    const body = s.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
    const obj = JSON.parse(body);
    return obj && typeof obj === "object" ? obj : null;
  } catch {
    return null;
  }
}
function parseBPTimeToDateSP(timeStr) {
  const m = /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/.exec(String(timeStr || ""));
  if (!m) return null;

  const dd = +m[1], mm = +m[2], yy = +m[3], hh = +m[4], mi = +m[5];
  return new Date(Date.UTC(yy, mm - 1, dd, hh + 3, mi, 0));
}

const BP_STATE_DIR = path.join(DATA_DIR, "sc_bp_monthly");

function monthKeyFromDateSP(date) {
  const { y, m } = ymdSP(date);
  return `${y}-${String(m).padStart(2, "0")}`;
}

function addMonthsUTC(date, diff) {
  const d = new Date(date.getTime());
  d.setUTCMonth(d.getUTCMonth() + diff);
  return d;
}

function getRelevantBPMonthKeys() {
  const now = nowSP();
  const prev = addMonthsUTC(now, -1);
  const next = addMonthsUTC(now, 1);

  return Array.from(
    new Set([
      monthKeyFromDateSP(prev),
      monthKeyFromDateSP(now),
      monthKeyFromDateSP(next),
    ])
  );
}

function bpPinsToArray(pins) {
  if (!pins) return [];
  if (pins?.values) return [...pins.values()];
  if (Array.isArray(pins?.items)) return pins.items;
  if (Array.isArray(pins)) return pins;
  return [];
}

function readBPStatesFromDisk(monthKeys = []) {
  const out = [];

  try {
    for (const mk of monthKeys) {
      const file = path.join(BP_STATE_DIR, `${mk}.json`);
      if (!fs.existsSync(file)) continue;

      const raw = JSON.parse(fs.readFileSync(file, "utf8"));
      if (raw?.monthKey === mk && raw?.days && typeof raw.days === "object") {
        out.push(raw);
      }
    }
  } catch (e) {
    console.error("[SC_GERAL_WEEKLY_RANK] readBPStatesFromDisk error:", e);
  }

  return out;
}

// ================== EXTRAS LOG PARSERS (DOAÇÃO/CONVITE/PERGUNTAS) ==================
function isDoacaoLogEmbed(emb) {
  const t = norm(emb?.title || emb?.data?.title || "");
  return t.includes("nova doacao registrada");
}
function doacaoWasScoredFromEmbed(emb) {
  try {
    const fields = getFields(emb);

    const geral = fields.find((f) => {
      const n = norm(f?.name);
      return n.includes("geraldash/semanal") || n.includes("geraldash") || n.includes("semanal");
    });

    const vg = String(geral?.value || "");
    if (vg) {
      if (/nao contou|não contou|faltam/i.test(vg)) return false;
      if (/isento/i.test(vg)) return true;
      if (/\+1/.test(vg)) return true;
      if (/✅/.test(vg)) return true;
      return false;
    }

    const anti = fields.find((f) => norm(f?.name).includes("anti-farm"));
    const v = String(anti?.value || "");

    if (v) {
      if (/nao contou|não contou|faltam/i.test(v)) return false;
      if (/isento/i.test(v)) return true;
      if (/\+1/.test(v)) return true;
      if (/✅/.test(v)) return true;
    }

    // Logs antigos sem campo GeralDash/Semanal:
    // deixa o cooldown de 12h decidir se conta ou não.
    return true;
  } catch {
    return false;
  }
}


const DOACAO_GERAL_SCAN_COOLDOWN_MS = 12 * 60 * 60 * 1000;

function doacaoIsExemptFromEmbed(emb) {
  try {
    const fields = getFields(emb);

    const geral = fields.find((f) => {
      const n = norm(f?.name);
      return n.includes("geraldash/semanal") || n.includes("geraldash") || n.includes("semanal");
    });

    const anti = fields.find((f) => norm(f?.name).includes("anti-farm"));

    return /isento/i.test(String(geral?.value || "")) || /isento/i.test(String(anti?.value || ""));
  } catch {
    return false;
  }
}

function getDoacaoScanTimestamp(m) {
  return Number(m?.createdTimestamp || m?.editedTimestamp || Date.now());
}

function canCountDoacaoInGeralScan({ emb, message, lastDoacaoAtByUser, uid }) {
  if (!uid) return false;
  if (!isDoacaoLogEmbed(emb)) return false;

  const ts = getDoacaoScanTimestamp(message);

  // se o embed novo já diz claramente que não contou no Geral/Semanal, respeita
  if (!doacaoWasScoredFromEmbed(emb)) return false;

  // isento conta sempre
  if (doacaoIsExemptFromEmbed(emb)) return true;

  // regra forte: para GeralDash/Semanal, só 1 ponto a cada 12h por usuário
  // ✅ usa Math.abs porque o Discord escaneia do mais novo para o mais antigo
  const lastAt = Number(lastDoacaoAtByUser.get(uid) || 0);
  if (lastAt && Math.abs(ts - lastAt) < DOACAO_GERAL_SCAN_COOLDOWN_MS) return false;

  lastDoacaoAtByUser.set(uid, ts);
  return true;
}
function isConviteLogEmbed(emb) {
  const t = norm(emb?.title || emb?.data?.title || "");
  return t.includes("convite enviado");
}
function isPerguntasLogEmbed(emb) {
  const t = norm(emb?.title || emb?.data?.title || "");
  return (t.includes("!perguntas") && t.includes("usado")) || t.includes("entrevista iniciada");
}
function isVendaLogEmbed(emb) {
  const t = norm(emb?.title || emb?.data?.title || "");
  // Detecção mais flexível para capturar logs de venda
  return t.includes("venda") && (t.includes("registro") || t.includes("log"));
}

// ✅ NOVO: PARSERS PARA PONTO DE ENTREVISTA
function isEntrevistaConcluidaLogEmbed(emb) {
  const t = norm(emb?.title || emb?.data?.title || "");
  const footer = norm(emb?.footer?.text || emb?.data?.footer?.text || "");

  return (
    footer.includes("sc_entrevista_point_v1") ||
    t.includes("ponto de entrevista concluida") ||
    t.includes("ponto entrevista concluida") ||
    t.includes("pontuacao de entrevista") ||
    t.includes("pontuação de entrevista")
  );
}

function entrevistaConcluida_getUserId(emb) {
  const fields = getFields(emb);

  const f =
    fields.find(x => norm(x?.name).includes("aplicador (ganhou ponto)")) ||
    fields.find(x => norm(x?.name).includes("ganhou ponto")) ||
    fields.find(x => norm(x?.name).includes("quem aplicou")) ||
    null;

  if (!f) return null;

  const v = String(f?.value || "");
  return pickFirstMentionId(v) || pickFirstIdLoose(v);
}

// Presença parsers
function isPresencaLogEmbed(emb) {
  const t = norm(emb?.title || emb?.data?.title || "");
  return t.includes("log de presenca");
}
function presenca_isConfirmed(emb) {
  const t = norm(emb?.title || emb?.data?.title || "");
  return t.includes("confirmou");
}
function presenca_getUserId(emb) {
  const f = getFields(emb).find(x => norm(x?.name).includes("autor"));
  if (!f) return null;
  const v = String(f.value || "");
  return pickFirstMentionId(v) || pickFirstIdLoose(v);
}

function isCorrecaoLogEmbed(emb) {
  const t = norm(emb?.title || emb?.data?.title || "");
  return t.includes("log de correcao de entrevista");
}
function correcaoWasScored(emb) {
  const f = getFields(emb).find(x => norm(x?.name).includes("anti-farm"));
  return f && (f.value.includes("✅") || f.value.includes("+1"));
}
function correcao_getUserId(emb) {
  const fields = getFields(emb);

  const f = fields.find(x => {
    const n = norm(x?.name);
    return (
      n.includes("creator que corrigiu") ||
      n.includes("staff que corrigiu") ||
      n.includes("quem corrigiu") ||
      n.includes("corrigiu") ||
      n.includes("corretor")
    );
  });

  if (f) return pickFirstMentionId(f.value) || pickFirstIdLoose(f.value);

  return pickFirstMentionId(getEmbedTextBag(emb)) || pickFirstIdLoose(getEmbedTextBag(emb));
}

function pickFirstMentionId(text) {
  const m = /<@!?(\d{17,20})>/.exec(String(text || ""));
  return m ? m[1] : null;
}
function pickFirstIdLoose(text) {
  const s = String(text || "");
  const m = /(\d{17,20})/.exec(s);
  return m ? m[1] : null;
}
function getEmbedTextBag(emb) {
  const fields = getFields(emb);
  const desc = String(emb?.description || emb?.data?.description || "");
  const footer = String(emb?.footer?.text || emb?.data?.footer?.text || "");
  const title = String(emb?.title || emb?.data?.title || "");
  const fieldText = fields.map(f => `${f?.name || ""}\n${f?.value || ""}`).join("\n");
  return `${title}\n${desc}\n${fieldText}\n${footer}`;
}
function doacao_getRegistrarId(emb) {
  try {
    const fields = getFields(emb);
    const f =
      fields.find(x => norm(x?.name).includes("registrado por")) ||
      fields.find(x => norm(x?.name).includes("registrador")) ||
      fields.find(x => norm(x?.name).includes("registrante")) ||
      fields.find(x => norm(x?.name).includes("quem registrou")) ||
      fields.find(x => norm(x?.name).includes("autor")) ||
      fields.find(x => norm(x?.name).includes("usuario")) ||
      fields.find(x => norm(x?.name).includes("usuário")) ||
      fields.find(x => norm(x?.name).includes("doador")) ||
      fields.find(x => norm(x?.name).includes("doado por")) ||
      fields.find(x => norm(x?.name).includes("quem doou")) ||
      null;

    if (f) {
      const v = String(f?.value || "");
      return pickFirstMentionId(v) || pickFirstIdLoose(v);
    }

    const bag = getEmbedTextBag(emb);
    return pickFirstMentionId(bag) || pickFirstIdLoose(bag);
  } catch {
    return null;
  }
}
function convite_getSenderId(emb) {
  try {
    const fields = getFields(emb);
    const f =
      fields.find(x => norm(x?.name).includes("enviado por")) ||
      fields.find(x => norm(x?.name).includes("lider")) ||
      fields.find(x => norm(x?.name).includes("líder")) ||
      fields.find(x => norm(x?.name).includes("registrado por")) ||
      null;
    if (f) {
      const v = String(f?.value || "");
      return pickFirstMentionId(v) || pickFirstIdLoose(v);
    }
    const bag = getEmbedTextBag(emb);
    return pickFirstMentionId(bag) || pickFirstIdLoose(bag);
  } catch {
    return null;
  }
}
function perguntas_getUserId(emb) {
  try {
    const fields = getFields(emb);
    const f =
      fields.find(x => norm(x?.name).includes("usuario")) ||
      fields.find(x => norm(x?.name).includes("usuário")) ||
      fields.find(x => norm(x?.name).includes("autor")) ||
      fields.find(x => norm(x?.name).includes("id")) ||
      fields.find(x => norm(x?.name).includes("quem")) ||
      fields.find(x => norm(x?.name).includes("aplicador")) ||
      null;
    if (f) {
      const v = String(f?.value || "");
      return pickFirstMentionId(v) || pickFirstIdLoose(v);
    }
    const bag = getEmbedTextBag(emb);
    return pickFirstMentionId(bag) || pickFirstIdLoose(bag);
  } catch {
    return null;
  }
}
function venda_getSellerId(emb) {
  try {
    const fields = getFields(emb);
    const f = fields.find(x => norm(x?.name).includes("vendedor"));
    if (f) {
      const v = String(f?.value || "");
      return pickFirstMentionId(v) || pickFirstIdLoose(v);
    }
    const bag = getEmbedTextBag(emb);
    return pickFirstMentionId(bag) || pickFirstIdLoose(bag);
  } catch {
    return null;
  }
}

// ================== COLLECT (MESMA IDEIA DO TEU items[]) ==================
async function collectAllPoints(client, mode = "light") {
  const now = Date.now();

  const seenMessageIds = new Set();
  const seenManagerStableKeys = new Set();
  const lastDoacaoAtByUser = new Map();

  if (mode === "light" && CACHE.payload && now - CACHE.at < SCAN_TTL_MS) {
    // reconstrói debug weekkeys
    DEBUG.weekKeysFound = {};
    for (const it of CACHE.payload.items || []) {
      const wk = weekKeyFromDateSP(it.ts);
      DEBUG.weekKeysFound[wk] = (DEBUG.weekKeysFound[wk] || 0) + 1;
    }
    return CACHE.payload;
  }
///teste
  DEBUG.weekKeysFound = {};
  const items = [];
const audit = { totalFound: 0, rejected: {}, extractedIds: 0, sources: {} };
const auditor = new GeralAudit();

const pushItem = (item) => {
  const userId = String(item?.userId || "").trim();
  const source = String(item?.source || "").trim();

  if (!userId || !source || !item?.ts) return;

  if (client?.user?.id && userId === String(client.user.id)) {
    auditor.reject(source, "bot_self_point");
    audit.rejected.bot_self_point = (audit.rejected.bot_self_point || 0) + 1;
    return;
  }

  auditor.addStats(source, "counted");

  audit.extractedIds++;
  audit.sources[source] = (audit.sources[source] || 0) + 1;

  items.push({
    ...item,
    userId,
    source,
  });
};
  // floor = volta 5 semanas (pra manter leve)
  const wkNow = weekKeyFromDateSP(new Date());
  const weekFloorKey = addDaysToWeekKey(wkNow, -35);

  // PODERES
  await scanChannelEmbeds(client, {
    channelId: CH_PODERES_ID,
    weekFloorKey,
    maxPages: 80,
    onMessage: async (m) => {
    auditor.addStats('poderes', 'scanned');
    if (seenMessageIds.has(m.id)) { auditor.reject('poderes', 'duplicate_message'); return; }
    seenMessageIds.add(m.id);
      const emb = m.embeds?.[0];
      if (!emb) { auditor.reject('poderes', 'no_embed'); return; }
      if (!GERAL_PARSERS.isPoderes(emb)) { auditor.reject('poderes', 'invalid_embed'); return; }
      const uid = GERAL_PARSERS.getPoderesUserId(emb);
      if (!uid) { auditor.reject('poderes', 'uid_null'); return; }
      auditor.addStats('poderes', 'uidOk');
      pushItem({ userId: uid, ts: new Date(m.createdTimestamp), source: "poderes" });
    },
  });

  for (const chEvt of EVENTOS_NORMAL_CHANNEL_IDS) {
    await scanChannelEmbeds(client, {
      channelId: chEvt,
      weekFloorKey,
      maxPages: 80,
      onMessage: async (m) => {
        auditor.addStats('eventos', 'scanned');
        if (seenMessageIds.has(m.id)) { auditor.reject('eventos', 'duplicate_message'); return; }
        seenMessageIds.add(m.id);
        const emb = m.embeds?.[0];
        if (!emb) { auditor.reject('eventos', 'no_embed'); return; }
        if (!GERAL_PARSERS.isEvento(emb)) { auditor.reject('eventos', 'invalid_embed'); return; }
        const uid = GERAL_PARSERS.getEventoRegistrarId(emb);
        if (!uid) { auditor.reject('eventos', 'uid_null'); return; }
        auditor.addStats('eventos', 'uidOk');
        pushItem({ userId: uid, ts: new Date(m.createdTimestamp), source: "eventos" });
      },
    });
  }
for (const chEvt of EVENTOS_PODER_CHANNEL_IDS) {
  await scanChannelEmbeds(client, {
    channelId: chEvt,
    weekFloorKey,
    maxPages: 80,
    onMessage: async (m) => {
      auditor.addStats('eventopoder', 'scanned');

      if (seenMessageIds.has(m.id)) {
        auditor.reject('eventopoder', 'duplicate_message');
        return;
      }

      const emb = m.embeds?.[0];

      if (!emb) {
        auditor.reject('eventopoder', 'no_embed');
        return;
      }

      if (!GERAL_PARSERS.isEventoPoder(emb)) {
        auditor.reject('eventopoder', 'invalid_embed');
        return;
      }

      const embedText = getEmbedText(emb);

      if (isNoPowerEventRegisterText(embedText)) {
        auditor.reject('eventopoder', 'no_use_or_absent');
        seenMessageIds.add(m.id);
        return;
      }

      const uid = GERAL_PARSERS.getEventoPoderRegistrarId(emb);

      if (!uid) {
        auditor.reject('eventopoder', 'uid_null');
        return;
      }

      seenMessageIds.add(m.id);
      auditor.addStats('eventopoder', 'uidOk');

      pushItem({
        userId: uid,
        ts: new Date(m.createdTimestamp),
        source: "eventopoder",
      });
    },
  });
}

  // PAGAMENTOS
  // ✅ Só pontua pagamento social quando estiver PAGO/APROVADO.
  // ✅ Criado, solicitado ou reprovado NÃO gera ponto.
  await scanChannelEmbeds(client, {
    channelId: CH_PAGAMENTOS_ID,
    weekFloorKey,
    maxPages: 80,
    onMessage: async (m) => {
      auditor.addStats('pagamentos', 'scanned');
      if (seenMessageIds.has(m.id)) { auditor.reject('pagamentos', 'duplicate_message'); return; }
      seenMessageIds.add(m.id);
      const emb = m.embeds?.[0];
      if (!emb) { auditor.reject('pagamentos', 'no_embed'); return; }
      if (!GERAL_PARSERS.isPagamento(emb)) { auditor.reject('pagamentos', 'invalid_embed'); return; }
      const status = GERAL_PARSERS.getPagamentoStatus(emb);
      if (!status.isPago) { auditor.reject('pagamentos', 'not_pago'); return; }
      const uid = GERAL_PARSERS.getPagamentoRegistrarId(emb);
      if (!uid) { auditor.reject('pagamentos', 'uid_null'); return; }
      auditor.addStats('pagamentos', 'uidOk');
      pushItem({ userId: uid, ts: new Date(m.createdTimestamp), source: "pagamentos" });
    },
  });

// VIP EVENTO (conta ponto só para quem clicou em PAGO)
await scanChannelEmbeds(client, {
  channelId: VIP_MENU_CHANNEL_ID,
  weekFloorKey,
  maxPages: 80,
  onMessage: async (m) => {
      auditor.addStats('vipPagos', 'scanned');
      if (seenMessageIds.has(m.id)) { auditor.reject('vipPagos', 'duplicate_message'); return; }
      seenMessageIds.add(m.id);
      const emb = m.embeds?.[0];
      if (!emb) { auditor.reject('vipPagos', 'no_embed'); return; }
      if (!GERAL_PARSERS.isVip(emb)) { auditor.reject('vipPagos', 'invalid_embed'); return; }
      const status = GERAL_PARSERS.getVipStatus(emb);
      if (!status.isPago) { auditor.reject('vipPagos', 'not_pago'); return; }
      const uid = GERAL_PARSERS.getVipPagoByUserId(emb);
      if (!uid) { auditor.reject('vipPagos', 'uid_null'); return; }
    const paidAt = vip_getPagoAtSP(emb);
      auditor.addStats('vipPagos', 'uidOk');
    pushItem({ userId: uid, ts: paidAt || new Date(m.createdTimestamp), source: "vipPagos" });
  },
});
  // MANAGER: Escaneia os dois canais com deduplicação real por RM MSGID
  for (const mgrCh of [CH_MANAGER_ID, CH_MANAGER_MAIN_ID]) {
    await scanChannelEmbeds(client, {
      channelId: mgrCh,
      weekFloorKey,
      maxPages: 80,
      onMessage: async (m) => {
        auditor.addStats('manager', 'scanned');
          if (seenMessageIds.has(m.id)) { auditor.reject('manager', 'duplicate_message'); return; }
        seenMessageIds.add(m.id);
        const emb = m.embeds?.[0];
        if (!emb) { auditor.reject('manager', 'no_embed'); return; }
        if (!GERAL_PARSERS.isManager(emb)) { auditor.reject('manager', 'invalid_embed'); return; }
        if (GERAL_PARSERS.isManagerRejected(emb)) { auditor.reject('manager', 'rejected'); return; }
        if (!GERAL_PARSERS.isManagerApproved(emb)) { auditor.reject('manager', 'not_approved'); return; }
        const uid = manager_getManagerId(emb) || manager_getRegistrarId(emb);
        if (!uid) { auditor.reject('manager', 'uid_null'); return; }
        const approvedAt = manager_getApprovedAtSP(emb);
        const managerStableKey = makeManagerStableDedupeKey(emb, m, uid, approvedAt);
        if (seenManagerStableKeys.has(managerStableKey)) { auditor.reject('manager', 'duplicate'); return; }
        seenManagerStableKeys.add(managerStableKey);
        auditor.addStats('manager', 'uidOk');
        pushItem({ userId: uid, ts: approvedAt || new Date(m.createdTimestamp), source: "manager" });
      },
    });
  }

if (MANAGER_AUDIT_ENABLED) {
  console.log([
    `\n[MANAGER_AUDIT_SUMMARY - RANKING]`,
    `totalEncontrado: ${mgrTotalFound}`,
    `totalContado: ${mgrTotalCounted}`,
    `totalDuplicadoIgnorado: ${mgrTotalDupIgnored}`,
    `porCanal:`,
    `1486084441762693291 (Arquivo): ${mgrStatsByCh[CH_MANAGER_ID] || 0}`,
    `1392680204517769277 (Weekly): ${mgrStatsByCh[CH_MANAGER_MAIN_ID] || 0}`,
    `----------------------------\n`
  ].join("\n"));
}

for (const channelId of ALINHAMENTOS_LOGS_CHANNEL_IDS) {
  await scanChannelEmbeds(client, {
    channelId,
    weekFloorKey,
    maxPages: 120,
    onMessage: async (m) => {
      auditor.addStats("alinhamentos", "scanned");

      const seenKey = `alinhamentos:${m.id}`;
      if (seenMessageIds.has(seenKey)) {
        auditor.reject("alinhamentos", "duplicate_message");
        return;
      }

      const emb = m.embeds?.[0];
      if (!emb) {
        auditor.reject("alinhamentos", "no_embed");
        return;
      }

      if (!GERAL_PARSERS.isAlinhamento(emb)) {
        auditor.reject("alinhamentos", "not_alinhamento");
        return;
      }

      auditor.addStats("alinhamentos", "found");

      if (!GERAL_PARSERS.isAlinhamentoValido(emb)) {
        auditor.reject("alinhamentos", "invalid_status");
        return;
      }

      const uid = GERAL_PARSERS.getAlinhadorId(emb);
      if (!uid) {
        auditor.reject("alinhamentos", "uid_null");
        return;
      }

      seenMessageIds.add(seenKey);
      auditor.addStats("alinhamentos", "uidOk");

      pushItem({
        userId: uid,
        ts: new Date(m.editedTimestamp || m.createdTimestamp),
        source: "alinhamentos",
      });
    },
  });
}

// DOAÇÕES (logs)
  // ✅ Recontagem forte:
  // - lê todos os logs encontrados
  // - respeita "Geral/Semanal: não contou"
  // - para logs antigos, recalcula 12h por usuário
  // - não interfere no ranking mensal próprio da doação, que continua 1h
for (const channelId of DOACAO_LOGS_CHANNEL_IDS) {
    await scanChannelEmbeds(client, {
      channelId,
      weekFloorKey,
      maxPages: 150,
      onMessage: async (m) => {
        audit.totalFound++;
        const seenKey = `doacoes:${m.id}`;
        if (seenMessageIds.has(seenKey)) return;
        const emb = m.embeds?.[0];
        if (!emb) return;
        if (!isDoacaoLogEmbed(emb)) return;
        const uid = doacao_getRegistrarId(emb);
        if (!uid) return;
        if (!canCountDoacaoInGeralScan({ emb, message: m, lastDoacaoAtByUser, uid })) {
          return;
        }
        seenMessageIds.add(seenKey);
        audit.extractedIds++;
        pushItem({
          userId: uid,
          ts: new Date(m.createdTimestamp),
          source: "doacoes",
        });
      },
    });
  }

  // CONVITES (logs)
  for (const channelId of CONVITES_LOGS_CHANNEL_IDS) {
    await scanChannelEmbeds(client, {
      channelId,
      weekFloorKey,
      maxPages: 80,
      onMessage: async (m) => {
          auditor.addStats('convites', 'scanned');
          if (seenMessageIds.has(m.id)) { auditor.reject('convites', 'duplicate_message'); return; }
          seenMessageIds.add(m.id);
        const emb = m.embeds?.[0];
          if (!emb) { auditor.reject('convites', 'no_embed'); return; }
          if (!GERAL_PARSERS.isConvite(emb)) { auditor.reject('convites', 'invalid_embed'); return; }
        const uid = GERAL_PARSERS.getConviteSenderId(emb);
          if (!uid) { auditor.reject('convites', 'uid_null'); return; }
          auditor.addStats('convites', 'uidOk');
        pushItem({ userId: uid, ts: new Date(m.createdTimestamp), source: "convites" });
      },
    });
  }

  // PONTO DE ENTREVISTA (logs)
  for (const channelId of PERGUNTAS_LOGS_CHANNEL_IDS) {
    await scanChannelEmbeds(client, {
      channelId,
      weekFloorKey,
      maxPages: 80,
      onMessage: async (m) => {
        audit.totalFound++;
        const seenKey = `perguntas:${m.id}`;
        if (seenMessageIds.has(seenKey)) return;
        const emb = m.embeds?.[0];
        if (!emb) { audit.rejected["no_embed"] = (audit.rejected["no_embed"] || 0) + 1; return; }
        if (!isEntrevistaConcluidaLogEmbed(emb)) { audit.rejected["invalid_entrevista_embed"] = (audit.rejected["invalid_entrevista_embed"] || 0) + 1; return; }
        seenMessageIds.add(seenKey);
        const uid = entrevistaConcluida_getUserId(emb);
        if (!uid) { audit.rejected["uid_null"] = (audit.rejected["uid_null"] || 0) + 1; return; }
        audit.extractedIds++;
        pushItem({ userId: uid, ts: new Date(m.createdTimestamp), source: "perguntas" });
      },
    });
  }

  // VENDAS (logs)
  const vendasLastPointByUser = new Map();
  for (const channelId of VENDAS_LOGS_CHANNEL_IDS) {
    await scanChannelEmbeds(client, {
      channelId,
      weekFloorKey,
      maxPages: 80,
      onMessage: async (m) => {
        audit.totalFound++;
        if (seenMessageIds.has(m.id)) return;
        seenMessageIds.add(m.id);
        const emb = m.embeds?.[0];
        if (!emb) { audit.rejected["no_embed"] = (audit.rejected["no_embed"] || 0) + 1; return; }
        if (!isVendaLogEmbed(emb)) { audit.rejected["invalid_venda_embed"] = (audit.rejected["invalid_venda_embed"] || 0) + 1; return; }
        const uid = venda_getSellerId(emb);
        if (!uid) { audit.rejected["uid_null"] = (audit.rejected["uid_null"] || 0) + 1; return; }
        const ts = m.createdTimestamp;
        const last = vendasLastPointByUser.get(uid) || 0;
        if (!last || Math.abs(last - ts) >= 7 * 60 * 60 * 1000) {
          vendasLastPointByUser.set(uid, ts);
          audit.extractedIds++;
          pushItem({ userId: uid, ts: new Date(ts), source: "vendas" });
        }
      },
    });
  }

// HALL DA FAMA (Scan do canal oficial)
// ⚠️ DESATIVADO PARA PONTUAÇÃO
// Motivo:
// A mensagem oficial do Hall da Fama é enviada pelo BOT.
// Se pontuar por m.author.id aqui, o ponto vai para o bot.
//
// O ponto correto do Hall da Fama já vem do canal de aprovação,
// pelo campo "Solicitante", quando o registro é aprovado.
//
// Regra correta:
// ✅ Aprovou Hall da Fama = ponto para quem FEZ o registro
// ❌ Recusou Hall da Fama = não ganha ponto
/*
if (HALL_CHANNEL_ID) {
  await scanChannelEmbeds(client, {
    channelId: HALL_CHANNEL_ID,
    weekFloorKey,
    maxPages: 80,
    onMessage: async (m) => {
      if (seenMessageIds.has(m.id)) return;
      seenMessageIds.add(m.id);

      if (m.author.id !== client.user.id) return;

      if (m.content && m.content.includes("HALL DA FAMA")) {
        pushItem({ userId: m.author.id, ts: new Date(m.createdTimestamp), source: "halldafama" });
      }
    },
  });
}
*/

  // HALL DA FAMA (Scan do canal oficial)
  // ⚠️ DESATIVADO PARA PONTUAÇÃO
  // Motivo:
  // A mensagem oficial do Hall da Fama é enviada pelo BOT.
  // Se pontuar por m.author.id aqui, o ponto vai para o bot.
  //
  // O ponto correto do Hall da Fama já vem do canal de aprovação,
  // pelo campo "Solicitante", quando o registro é aprovado.
  //
  // Regra correta:
  // ✅ Aprovou Hall da Fama = ponto para quem FEZ o registro
  // ❌ Recusou Hall da Fama = não ganha ponto
  /*
  if (HALL_CHANNEL_ID) {
    await scanChannelEmbeds(client, {
      channelId: HALL_CHANNEL_ID,
      weekFloorKey,
      maxPages: 80,
      onMessage: async (m) => {
        if (seenMessageIds.has(m.id)) return;
        seenMessageIds.add(m.id);

        if (m.author.id !== client.user.id) return;

        if (m.content && m.content.includes("HALL DA FAMA")) {
          pushItem({ userId: m.author.id, ts: new Date(m.createdTimestamp), source: "halldafama" });
        }
      },
    });
  }
  */

  // ✅ CRONOGRAMA / HALL DA FAMA / EVENTOS DIÁRIOS (Aprovados)
  // Regra:
  // - Só conta quando estiver aprovado.
  // - O ponto vai para o "Solicitante", ou seja, quem fez/enviou o registro.
  // - Quem aprovou NÃO ganha ponto.
  // - Registro recusado NÃO ganha ponto.
  for (const channelId of CRONOGRAMA_LOGS_CHANNEL_IDS) {
    await scanChannelEmbeds(client, {
      channelId,
      weekFloorKey,
      maxPages: 120,
      onMessage: async (m) => {
      auditor.addStats('cronograma', 'scanned');
        const seenKey = `approval:${m.id}`;
        if (seenMessageIds.has(seenKey)) return;
        const emb = m.embeds?.[0];
      if (!emb) { auditor.reject('cronograma', 'no_embed'); return; }
      if (!approval_isApproved(emb)) { auditor.reject('cronograma', 'not_approved'); return; }
        const userId = approval_getSolicitanteId(emb);
      if (!userId) { auditor.reject('cronograma', 'uid_null'); return; }
        const source = approval_getSource(emb) || "cronograma";
        seenMessageIds.add(seenKey);
      auditor.addStats('cronograma', 'uidOk');
        pushItem({
          userId,
          ts: new Date(m.editedTimestamp || m.createdTimestamp),
          source,
        });
      },
    });
  }

  for (const channelId of PRESENCA_LOGS_CHANNEL_IDS) {
    await scanChannelEmbeds(client, {
      channelId,
      weekFloorKey,
      maxPages: 80,
      onMessage: async (m) => {
        audit.totalFound++;
        const seenKey = `presencas_v2:${m.id}`;
        if (seenMessageIds.has(seenKey)) return;
        const emb = m.embeds?.[0];
        if (!emb) { audit.rejected["no_embed"] = (audit.rejected["no_embed"] || 0) + 1; return; }
        if (!isPresencaLogEmbed(emb) || !presenca_isConfirmed(emb)) { audit.rejected["invalid_presenca"] = (audit.rejected["invalid_presenca"] || 0) + 1; return; }
        const uid = presenca_getUserId(emb);
        if (!uid) { audit.rejected["uid_null"] = (audit.rejected["uid_null"] || 0) + 1; return; }
        seenMessageIds.add(seenKey);
        audit.extractedIds++;
        pushItem({ userId: uid, ts: new Date(m.createdTimestamp), source: "presencas" });
      },
    });
  }

  for (const channelId of CORRECAO_LOGS_CHANNEL_IDS) {
    await scanChannelEmbeds(client, {
      channelId,
      weekFloorKey,
      maxPages: 120,
      onMessage: async (m) => {
        audit.totalFound++;
        const seenKey = `correcao:${m.id}`;
        if (seenMessageIds.has(seenKey)) return;
        const emb = m.embeds?.[0];
        if (!emb) return;
        if (!isCorrecaoLogEmbed(emb) || !correcaoWasScored(emb)) return;
        const uid = correcao_getUserId(emb);
        if (!uid) return;
        seenMessageIds.add(seenKey);
        audit.extractedIds++;
        pushItem({
          userId: uid,
          ts: new Date(m.createdTimestamp),
          source: "correcao",
        });
      },
    });
  }

  // EVT3 (json + thread createdTimestamp)
  try {
    audit.totalFound++; // Conta como "encontrado" no EVT3
    const st = readEvt3State();
    const map = st?.evt3Events || {};
    const entries = Object.entries(map);

    const parent = await client.channels.fetch(EVT3_EVENT_PARENT_ID).catch(() => null);

    for (const [mainThreadId, info] of entries) {
      const creatorId = String(info?.creatorId || "").trim();
      if (!creatorId) continue;

      let thread = await client.channels.fetch(mainThreadId).catch(() => null);

      if (!thread && parent?.isTextBased?.()) {
        try {
          const active = await parent.threads.fetchActive().catch(() => null);
          thread = active?.threads?.get(mainThreadId) || null;
        } catch {}
        if (!thread) {
          try {
            const archived = await parent.threads.fetchArchived({ type: "public", limit: 100 }).catch(() => null);
            thread = archived?.threads?.get(mainThreadId) || null;
          } catch {}
        }
      }

      const createdAt = thread?.createdTimestamp ? new Date(thread.createdTimestamp) : null;
      if (!createdAt) continue;

      // ✅ 1 ponto por EVT3
      pushItem({ userId: creatorId, ts: createdAt, source: "evt3" });
    }
  } catch {}

    // BATE PONTO (PRIORIDADE: disco local / fallback: calendário Discord)
  try {
    const monthKeys = getRelevantBPMonthKeys();
    let bpStates = readBPStatesFromDisk(monthKeys);

    if (!bpStates.length) {
      const cal = await client.channels.fetch(BP_CALENDAR_CHANNEL_ID).catch(() => null);

      if (cal?.isTextBased?.()) {
        let pins = null;

        if (typeof cal.messages?.fetchPinned === "function") {
          pins = await cal.messages.fetchPinned().catch(() => null);
        } else if (typeof cal.messages?.fetchPins === "function") {
          pins = await cal.messages.fetchPins().catch(() => null);
        }

        const pinList = bpPinsToArray(pins);
        const recent = await cal.messages.fetch({ limit: 300 }).catch(() => null);
        const recList = recent?.values ? [...recent.values()] : [];

        const pool = new Map();
        for (const m of [...pinList, ...recList]) {
          if (m?.id) pool.set(m.id, m);
        }

        bpStates = [];
        for (const msg of pool.values()) {
          const obj = safeParseJSONBlock(msg.content);
          if (!obj?.monthKey || !obj?.days) continue;
          bpStates.push(obj);
        }
      }
    }

    for (const obj of bpStates) {
      for (const arr of Object.values(obj.days || {})) {
        if (!Array.isArray(arr)) continue;

        for (const e of arr) {
          const uid = String(e?.uid || "").trim();
          const timeStr = String(e?.time || "").trim();
          if (!uid || !timeStr) continue;
          if (!/^\d{17,20}$/.test(uid)) continue;

          const dt = parseBPTimeToDateSP(timeStr);
          if (!dt) continue;

          audit.extractedIds++;
          pushItem({
            userId: uid,
            ts: dt,
            source: "bateponto",
          });
        }
      }
    }
  } catch (e) {
    console.error("[SC_GERAL_WEEKLY_RANK] Bate-ponto collect error:", e);
  }

  // debug keys
  for (const it of items) {
    const wk = weekKeyFromDateSP(it.ts);
    DEBUG.weekKeysFound[wk] = (DEBUG.weekKeysFound[wk] || 0) + 1;
  }

    // Auditoria final da coleta
const wkNowForAudit = weekKeyFromDateSP(nowSP());
const weekItemsForAudit = items.filter((x) => weekKeyFromDateSP(x.ts) === wkNowForAudit);

const sourcesWeekAudit = {};
for (const it of weekItemsForAudit) {
  sourcesWeekAudit[it.source] = (sourcesWeekAudit[it.source] || 0) + 1;
}

globalThis.__SC_GERAL_RANK_LAST_AUDIT_LOG_AT__ =
  globalThis.__SC_GERAL_RANK_LAST_AUDIT_LOG_AT__ || 0;

const RANK_AUDIT_LOG_EVERY_MS = 30 * 60 * 1000;
const nowAuditLog = Date.now();

if (nowAuditLog - globalThis.__SC_GERAL_RANK_LAST_AUDIT_LOG_AT__ >= RANK_AUDIT_LOG_EVERY_MS) {
  globalThis.__SC_GERAL_RANK_LAST_AUDIT_LOG_AT__ = nowAuditLog;

  console.log("━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🛡️ AUDITORIA FINAL DE SCAN (RANKING)");
  console.log(`TOTAL MSGS ANALISADAS: ${audit.totalFound}`);
  console.log(`TOTAL IDs EXTRAÍDOS BRUTO: ${audit.extractedIds}`);
  console.log(`TOTAL REAL DA SEMANA: ${weekItemsForAudit.length}`);
  console.log("RANKING POR FONTE DA SEMANA:", sourcesWeekAudit);
  console.log("REJEITADOS POR MOTIVO:", audit.rejected);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━");
}

  const payload = { items };
  CACHE = { at: now, payload };
  return payload;
}


// ================== AJUSTES MANUAIS (POINT OVERRIDE) ==================
// wrappers compatíveis com o novo bloco global do topo
function addWeeklyAdjustment(weekKey, userId, delta) {
  return applyManualAdjustment({ weekKey, userId, delta });
}

function getWeeklyAdjustment(weekKey, userId) {
  const data = loadAdjustments();
  return Number(data.byWeek?.[weekKey]?.[userId] || 0);
}


// ================== AGGREGATION (RANK) ==================
const SOURCE_LABEL = {
  poderes: "Poderes",
  eventos: "Eventos",
  eventopoder: "Poderes Do Dia",
  pagamentos: "Pagamentos",
  vipPagos: "VIP Líderes",
  manager: "Manager",
  alinhamentos: "Alinhamentos",
  doacoes: "Doações",
  convites: "Convites",
  perguntas: "Perguntas",
  evt3: "EVT3",
  bateponto: "Bate-ponto",
  vendas: "Vendas",
  cronograma: "Cronograma",
  presencas: "Presença",
  halldafama: "Hall da Fama",
  eventosdiarios: "Eventos Diários",
  correcao: "Correção de Entrevista",
};

function aggregateWeekDetailed(items, weekKey) {
  const only = (items || []).filter((x) => weekKeyFromDateSP(x.ts) === weekKey);

  const totalByUser = {};
  const bySourceByUser = {};

  for (const e of only) {
    totalByUser[e.userId] = (totalByUser[e.userId] || 0) + 1;

    bySourceByUser[e.userId] = bySourceByUser[e.userId] || {};
    bySourceByUser[e.userId][e.source] = (bySourceByUser[e.userId][e.source] || 0) + 1;
  }

  const adjustmentsData = loadAdjustments();
  const weekAdjustments = adjustmentsData.byWeek?.[weekKey] || {};

  const allUserIds = new Set([
    ...Object.keys(totalByUser),
    ...Object.keys(weekAdjustments),
  ]);
  const list = [];
  let totalPoints = 0;

for (const userId of allUserIds) {
  const basePoints = Number(totalByUser[userId] || 0);
  const adj = Number(weekAdjustments[userId] || 0);
  const rawFinalPoints = basePoints + adj;
  const finalPoints = Math.max(0, rawFinalPoints);

  if (finalPoints > 0) {
    list.push({
      userId,
      points: finalPoints,
      basePoints,
      adjustment: adj,
    });
    totalPoints += finalPoints;
  }
}

  list.sort((a, b) => b.points - a.points);

  return { totalEvents: totalPoints, list, bySourceByUser };
}


function summarizeSources(bySource, adjustment = 0) {
  const entries = Object.entries(bySource || {})
    .sort((a, b) => (b[1] || 0) - (a[1] || 0))
    .filter(([, v]) => (v || 0) > 0);

  const lines = entries.map(([k, v], index) => {
    const isLast = index === entries.length - 1 && !adjustment;
    const prefix = isLast ? "┗" : "┃";
    return `${prefix} **${SOURCE_LABEL[k] || k}:** ${v}`;
  });

  if (adjustment > 0) {
    lines.push(`┗ **Ajuste manual:** +${adjustment}`);
  } else if (adjustment < 0) {
    lines.push(`┗ **Ajuste manual:** ${adjustment}`);
  }

  return lines.join("\n");
}

function chunkLines(lines, maxChars = 950) {
  const chunks = [];
  let cur = [];
  let len = 0;

  for (const line of lines) {
    const add = line.length + 1;
    if (len + add > maxChars && cur.length) {
      chunks.push(cur.join("\n"));
      cur = [];
      len = 0;
    }
    cur.push(line);
    len += add;
  }
  if (cur.length) chunks.push(cur.join("\n"));
  return chunks;
}

// ================== CHART HELPERS ==================
function getQuickChartUrl(config) {
  return `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(config))}&width=800&height=450&backgroundColor=white`;
}

function getSourceStats(bySourceByUser) {
  const totals = {};
  for (const userSrc of Object.values(bySourceByUser)) {
    for (const [src, count] of Object.entries(userSrc)) {
      totals[src] = (totals[src] || 0) + count;
    }
  }
  return Object.entries(totals)
    .map(([key, val]) => ({ key, val, label: SOURCE_LABEL[key] || key }))
    .sort((a, b) => b.val - a.val);
}

function extractNameFromNick(nick) {
  let parts = String(nick || "").split('|').map(s => s.trim()).filter(s => s.length > 0);
  if (parts.length === 0) return "Desconhecido";

  // Se a última parte for ID (só números), removemos
  if (/^\d+$/.test(parts[parts.length - 1])) {
    const id = parts.pop();
    if (parts.length === 0) return id; // Se só tinha ID, retorna ele
  }

  // Se sobrou mais de 1 parte, assumimos que a primeira é Cargo e pegamos a segunda (Nome)
  if (parts.length > 1) return parts[1];
  return parts[0];
}

function getRandomColors(count) {
  const colors = [
    "#FF6384", "#36A2EB", "#FFCE56", "#4BC0C0", "#9966FF", "#FF9F40",
    "#C9CBCF", "#FF6384", "#36A2EB", "#FFCE56", "#4BC0C0", "#9966FF"
  ];
  return Array.from({ length: count }, (_, i) => colors[i % colors.length]);
}


// ================== MESSAGE RESOLVE (EDITAR SEM SPAM) ==================
async function resolveRankMessageForWeek(rankChannel, st, wk) {
  try {
    st.weeklyMsgIds = st.weeklyMsgIds || {};
    const savedId = st.weeklyMsgIds[wk] || null;

    if (savedId) {
      const byId = await rankChannel.messages.fetch(savedId).catch(() => null);
      if (byId) return byId;
      
      // ✅ Se tinha ID salvo mas a msg sumiu (foi apagada), limpa do state
      // Isso força o bot a procurar de novo ou criar uma nova
      delete st.weeklyMsgIds[wk];
    }

    const marker = `${RANK_MARKER_PREFIX}${wk}`;

    // busca no histórico pelo marker NO FOOTER do embed (sem sujar o chat)
    let lastId;
    for (let p = 0; p < RANK_FIND_PAGES; p++) {
      const batch = await rankChannel.messages.fetch({ limit: 100, before: lastId }).catch(() => null);
      if (!batch?.size) break;

      for (const m of batch.values()) {
        if (String(m.author?.id || "") !== String(rankChannel.client?.user?.id || "")) continue;

        const embeds = Array.isArray(m.embeds) ? m.embeds : [];
        const hasMarker = embeds.some((emb) => {
          const footer = String(emb?.footer?.text || emb?.data?.footer?.text || "");
          return footer.includes(marker);
        });

        if (hasMarker) {
          st.weeklyMsgIds[wk] = m.id;
          saveState(st);
          return m;
        }
      }

      lastId = batch.last()?.id;
      if (!lastId) break;
    }

    return null;
  } catch {
    return null;
  }
}

function getEmbedSafeLength(embed) {
  const data = embed?.data || embed || {};
  let total = 0;

  total += String(data.title || "").length;
  total += String(data.description || "").length;
  total += String(data.footer?.text || "").length;

  for (const field of data.fields || []) {
    total += String(field?.name || "").length;
    total += String(field?.value || "").length;
  }

  return total;
}

function splitEmbedsForDiscord(embeds, maxChars = 5200, maxEmbeds = 9) {
  const batches = [];
  let current = [];
  let currentChars = 0;

  for (const embed of embeds || []) {
    const len = getEmbedSafeLength(embed);

    if (
      current.length &&
      (current.length >= maxEmbeds || currentChars + len > maxChars)
    ) {
      batches.push(current);
      current = [];
      currentChars = 0;
    }

    current.push(embed);
    currentChars += len;
  }

  if (current.length) batches.push(current);
  return batches;
}

async function resolveExtraRankMessagesForWeek(rankChannel, st, wk) {
  st.weeklyExtraMsgIds = st.weeklyExtraMsgIds || {};
  const savedIds = Array.isArray(st.weeklyExtraMsgIds[wk]) ? st.weeklyExtraMsgIds[wk] : [];

  const messages = [];

  for (const id of savedIds) {
    const msg = await rankChannel.messages.fetch(id).catch(() => null);
    if (msg) messages.push(msg);
  }

  st.weeklyExtraMsgIds[wk] = messages.map((m) => m.id);
  saveState(st);

  return messages;
}

async function cleanupDuplicateRankMessagesForWeek(rankChannel, keepMsg, wk) {
  try {
    const marker = `${RANK_MARKER_PREFIX}${wk}`;
    const keepId = String(keepMsg?.id || "");

    let lastId;

    for (let p = 0; p < RANK_FIND_PAGES; p++) {
      const batch = await rankChannel.messages.fetch({ limit: 100, before: lastId }).catch(() => null);
      if (!batch?.size) break;

      for (const msg of batch.values()) {
        if (String(msg.author?.id || "") !== String(rankChannel.client?.user?.id || "")) continue;
        if (String(msg.id) === keepId) continue;

        const embeds = Array.isArray(msg.embeds) ? msg.embeds : [];
        const hasMarker = embeds.some((emb) => {
          const footer = String(emb?.footer?.text || emb?.data?.footer?.text || "");
          return footer.includes(marker);
        });

        if (hasMarker) {
          await msg.delete().catch(() => {});
        }
      }

      lastId = batch.last()?.id;
      if (!lastId) break;
    }
  } catch (e) {
    console.warn("[SC_GERAL_WEEKLY_RANK] Falha ao limpar duplicados:", e?.message || e);
  }
}


// ================== BUILD EMBEDS (SEM IMAGENS) ==================
function buildRankEmbeds({ wk, wkLabel, agg, minPoints, nameMap = {} }) {
  const list = agg.list || [];
  const bySourceByUser = agg.bySourceByUser || {};

  const participants = list.length;
  const metMin = list.filter((x) => x.points >= minPoints).length;
  const belowMin = participants - metMin;

  const colorCover = pickColorByHitRate(participants, metMin);

  // ✅ SEM LIMITE: mostra TODO MUNDO
  const top = list;

  // (mantém esse bloco se você curte “menos pontuaram”, não interfere em nada)
const bottom = [...list].sort((a, b) => a.points - b.points).slice(0, 8);

  const marker = `${RANK_MARKER_PREFIX}${wk}`;

const topLines = top.map((u, i) => {
  const detail = summarizeSources(bySourceByUser[u.userId], u.adjustment);
  const extra = detail ? `\n${detail}` : "";

  return `${medal(i)} **${i + 1}.** <@${u.userId}> — ${fmtPts(u.points)}${extra}`;
});

const bottomLines = bottom.map((u, i) => {
  const detail = summarizeSources(bySourceByUser[u.userId], u.adjustment);
  const extra = detail ? `\n${detail}` : "";

  return `🔻 **${i + 1}.** <@${u.userId}> — ${fmtPts(u.points)}${extra}`;
});

  const embeds = [];

  // ===== CAPA / RESUMO =====
  embeds.push(
    new EmbedBuilder()
      .setColor(colorCover)
      .setTitle("🏁 Ranking Semanal — Geral (todas as fontes)")
      .setDescription(
        [
          `📆 **Semana:** **${wkLabel}**`,
          `🎯 **Mínimo:** **${minPoints} pts**`,
          "",
          `👥 **Participantes:** **${participants}**`,
          `✅ **Bateram o mínimo:** **${metMin}**`,
          `⚠️ **Abaixo do mínimo:** **${belowMin}**`,
          "",
          `🧾 **Registros somados na semana:** **${agg.totalEvents || 0}**`,
          "",
          "✨ _Bora amassar essa meta essa semana_",
        ].join("\n")
      )
      .setImage(RANK_BANNER)
      .setFooter({ text: marker })
      .setTimestamp(nowSP())
  );

  // ===== GRÁFICOS (NOVOS) =====
  const sourceStats = getSourceStats(bySourceByUser);
  
  // 1. Pizza: O que mais dá pontos (Top 5 fontes)
  if (sourceStats.length > 0) {
    const topSources = sourceStats.slice(0, 6);
    const chartConfig = {
      type: 'doughnut',
      data: {
        labels: topSources.map(s => s.label),
        datasets: [{
          data: topSources.map(s => s.val),
          backgroundColor: getRandomColors(topSources.length),
        }]
      },
      options: {
        title: { display: true, text: 'Distribuição de Pontos (Fontes)' },
        legend: { display: true, position: 'bottom' },
        plugins: { datalabels: { display: true, color: '#000', font: { weight: 'bold', size: 14 } } }
      }
    };
    embeds.push(new EmbedBuilder()
      .setColor(0x36A2EB)
      .setTitle("🍕 Fontes de Pontos (Top)")
      .setImage(getQuickChartUrl(chartConfig))
      .setFooter({ text: marker }));
  }

  // 2. Pizza: Quem mais tem pontos (Top 7)
  if (list.length > 0) {
    const topUsers = list.slice(0, 7);
    const chartConfig = {
      type: 'doughnut',
      data: {
        labels: topUsers.map(u => extractNameFromNick(nameMap[u.userId] || u.userId)),
        datasets: [{
          data: topUsers.map(u => u.points),
          backgroundColor: getRandomColors(topUsers.length),
        }]
      },
      options: {
        title: { display: true, text: 'Top Usuários com Mais Pontos' },
        legend: { display: true, position: 'bottom' },
        plugins: { datalabels: { display: true, color: '#000', font: { weight: 'bold', size: 14 } } }
      }
    };
    embeds.push(new EmbedBuilder()
      .setColor(0x4BC0C0)
      .setTitle("📊 Top Usuários (Mais Pontos)")
      .setImage(getQuickChartUrl(chartConfig))
      .setFooter({ text: marker }));
  }

  // 3. Pizza: Quem menos tem pontos (Bottom 7, > 0)
  if (list.length > 0) {
    const bottomUsers = [...list].reverse().slice(0, 7); // Já filtramos > 0 no aggregate
    const chartConfig = {
      type: 'doughnut',
      data: {
        labels: bottomUsers.map(u => extractNameFromNick(nameMap[u.userId] || u.userId)),
        datasets: [{
          data: bottomUsers.map(u => u.points),
          backgroundColor: getRandomColors(bottomUsers.length),
        }]
      },
      options: {
        title: { display: true, text: 'Usuários com Menos Pontos (mas pontuaram)' },
        legend: { display: true, position: 'bottom' },
        plugins: { datalabels: { display: true, color: '#000', font: { weight: 'bold', size: 14 } } }
      }
    };
    embeds.push(new EmbedBuilder()
      .setColor(0xFF6384)
      .setTitle("📉 Usuários com Menos Pontos")
      .setImage(getQuickChartUrl(chartConfig))
      .setFooter({ text: marker }));
  }

  // 4. Pizza: O que menos dá pontos (Bottom fontes)
  if (sourceStats.length > 0) {
    const bottomSources = [...sourceStats].reverse().slice(0, 6);
    const chartConfig = {
      type: 'doughnut',
      data: {
        labels: bottomSources.map(s => s.label),
        datasets: [{
          data: bottomSources.map(s => s.val),
          backgroundColor: getRandomColors(bottomSources.length),
        }]
      },
      options: {
        title: { display: true, text: 'Fontes com Menos Pontos Gerados' },
        legend: { display: true, position: 'bottom' },
        plugins: { datalabels: { display: true, color: '#000', font: { weight: 'bold', size: 14 } } }
      }
    };
    embeds.push(new EmbedBuilder()
      .setColor(0xFFCE56)
      .setTitle("📉 Fontes Menos Utilizadas")
      .setImage(getQuickChartUrl(chartConfig))
      .setFooter({ text: marker }));
  }

  // ===== RANKING DA SEMANA (TODOS) — com paginação se precisar =====
  const pagesTop = chunkLines(topLines, 3200); // mais seguro com ranking detalhado em várias linhas
  if (!pagesTop.length) {
    embeds.push(
      new EmbedBuilder()
        .setColor(0x8b5cf6)
        .setTitle("🏆 Ranking da semana (todos)")
        .setDescription("_(ninguém pontuou ainda)_")
        .setFooter({ text: marker })
    );
  } else {
    for (let i = 0; i < pagesTop.length; i++) {
      embeds.push(
        new EmbedBuilder()
          .setColor(0x8b5cf6) // roxinho
          .setTitle(`🏆 Ranking da semana (todos) — pág ${i + 1}/${pagesTop.length}`)
          .setDescription(pagesTop[i])
          .setFooter({ text: marker })
      );
    }
  }

  // ===== MENOS PONTUARAM =====
  const pagesBottom = chunkLines(bottomLines, 3000);

  if (!pagesBottom.length) {
    embeds.push(
      new EmbedBuilder()
        .setColor(0xf59e0b)
        .setTitle("⚠️ Menos pontuaram (mas pontuaram)")
        .setDescription("_(vazio)_")
        .addFields(
          { name: "📌 Regra da semana", value: `Fez **${minPoints}+** = ✅ bateu o mínimo`, inline: true },
          { name: "🔥 Dica rápida", value: "Mistura fontes (pagamentos + poderes + etc) pra subir rápido", inline: true }
        )
        .setFooter({ text: marker })
    );
  } else {
    for (let i = 0; i < pagesBottom.length; i++) {
      embeds.push(
        new EmbedBuilder()
          .setColor(0xf59e0b)
          .setTitle(`⚠️ Menos pontuaram (mas pontuaram) — pág ${i + 1}/${pagesBottom.length}`)
          .setDescription(pagesBottom[i])
          .addFields(
            { name: "📌 Regra da semana", value: `Fez **${minPoints}+** = ✅ bateu o mínimo`, inline: true },
            { name: "🔥 Dica rápida", value: "Mistura fontes (pagamentos + poderes + etc) pra subir rápido", inline: true }
          )
          .setFooter({ text: marker })
      );
    }
  }

  // ⚠️ Discord deixa no máximo 10 embeds por mensagem — a gente respeita
return embeds.slice(0, 9);
}



// ================== CORE UPSERT ==================
async function upsertWeeklyRank(client, reason, { scanMode = "light", targetWeekKey = null } = {}) {
  // ✅ FIX: Auto-unlock global se travado > 2min
  if (globalThis.__SC_GERAL_WEEKLY_RANK_UPSERTING__) {
    const now = Date.now();
    const last = globalThis.__SC_GERAL_WEEKLY_RANK_LOCK_TS__ || 0;
    if (now - last > 120000) {
       console.warn("[SC_GERAL_WEEKLY_RANK] ⚠️ Global lock travado. Forçando reset.");
       globalThis.__SC_GERAL_WEEKLY_RANK_UPSERTING__ = false;
    } else {
       return false; // ✅ Retorna false indicando que NÃO rodou
    }
  }

  globalThis.__SC_GERAL_WEEKLY_RANK_UPSERTING__ = true;
  globalThis.__SC_GERAL_WEEKLY_RANK_LOCK_TS__ = Date.now();

  try {
    DEBUG.lastRunAt = Date.now();
    DEBUG.lastReason = reason;

    const ch = await client.channels.fetch(RANK_CHANNEL_ID).catch(() => null);
    if (!ch?.isTextBased?.()) return false;

    // anti-spam permission check
    try {
      const me = ch.guild?.members?.me || (await ch.guild.members.fetch(client.user.id).catch(() => null));
      const perms = ch.permissionsFor(me);

      const need = [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
      ];
      const missing = need.filter((p) => !perms?.has?.(p));
      if (missing.length) {
        console.error("[SC_GERAL_WEEKLY_RANK] ❌ Sem permissão no canal do ranking. Abortando pra não spammar.", {
          channelId: RANK_CHANNEL_ID,
          missing,
          reason,
        });
        return false; // ✅ Retorna false (falha permissão)
      }
    } catch {
      return false;
    }

    const st = loadState();

    const { items } = await collectAllPoints(client, scanMode);

    // week alvo
    const wkNow = weekKeyFromDateSP(nowSP());
    const wk = String(targetWeekKey || wkNow);
    const wkLabel = triLabelShortFromWeekKey(wk);

    const agg = aggregateWeekDetailed(items, wk);

    // ✅ NOVO: Salva os dados por fonte para o reuniaoSemanal.js
    try {
      const sourcesStatePath = path.join(DATA_DIR, "sc_geral_weekly_rank_sources.json");
      const sourcesState = readJSON(sourcesStatePath, {});
      sourcesState[wk] = agg.bySourceByUser;
      writeJSON(sourcesStatePath, sourcesState);
    } catch (e) {
      console.error("[SC_GERAL_WEEKLY_RANK] Erro ao salvar dados por fonte:", e);
    }

    // assinatura (não editar se idêntico)
    // ✅ Inclui nameMap na assinatura se quiser que atualize quando nomes mudam, mas talvez seja overkill.
    // Vamos buscar nomes agora.
    const nameMap = {};
    if (agg.list.length > 0) {
      const topU = agg.list.slice(0, 10);
      const botU = agg.list.slice(-10);
      const usersToFetch = new Set([...topU.map(u => u.userId), ...botU.map(u => u.userId)]);
      
      await Promise.all([...usersToFetch].map(async (uid) => {
        try {
          const member = await ch.guild.members.fetch(uid).catch(() => null);
          nameMap[uid] = member ? (member.displayName || member.user.username) : (await client.users.fetch(uid).catch(() => null))?.username || uid;
        } catch (e) { 
          console.warn(`[SC_GERAL_WEEKLY_RANK] Erro ao buscar usuário ${uid}:`, e?.message || e);
          nameMap[uid] = uid; 
        }
      }));
    }

const sig = JSON.stringify({
  wk,
  renderVersion: RANK_RENDER_VERSION,
  min: MIN_POINTS_WEEK,
  totalEvents: agg.totalEvents,
  list: (agg.list || []).map((x) => [x.userId, x.points]),
  bySourceByUser: agg.bySourceByUser,
  nameMap // ✅ ADICIONA nameMap (para atualizar ao mudar nomes)
});

    st.sigByWeek = st.sigByWeek || {};
    const oldSig = st.sigByWeek[wk];

// resolve msg
// ✅ Se a mensagem foi apagada manualmente, isso aqui vai retornar null
// (porque limpamos o ID inválido no resolveRankMessageForWeek)
let msg = await resolveRankMessageForWeek(ch, st, wk);

const embeds = buildRankEmbeds({ wk, wkLabel, agg, minPoints: MIN_POINTS_WEEK, nameMap });
const embedBatches = splitEmbedsForDiscord(embeds, 5200, 9);
const mainEmbeds = embedBatches[0] || [];
const extraEmbedBatches = embedBatches.slice(1);

// 🔘 BOTÃO (UMA ÚNICA VEZ)
const row = new ActionRowBuilder().addComponents(
  new ButtonBuilder()
    .setCustomId("SC_REMOVE_POINTS")
    .setLabel("➖ Remover Pontos")
    .setStyle(ButtonStyle.Danger)
);

async function upsertExtraRankMessages() {
  const oldExtras = await resolveExtraRankMessagesForWeek(ch, st, wk);
  const nextExtraIds = [];

  for (let i = 0; i < extraEmbedBatches.length; i++) {
    const batch = extraEmbedBatches[i];
    const oldMsg = oldExtras[i] || null;

    if (oldMsg?.editable) {
      const edited = await oldMsg.edit({
        embeds: batch,
        components: [],
      }).catch(async (e) => {
        console.warn(`[SC_GERAL_WEEKLY_RANK] ⚠️ Falha ao editar continuação ${i + 1}. Recriando:`, e?.message || e);

        return await ch.send({
          embeds: batch,
          components: [],
        }).catch((err) => {
          console.error(`[SC_GERAL_WEEKLY_RANK] ❌ Erro ao recriar continuação ${i + 1}:`, err);
          return null;
        });
      });

      if (edited?.id) nextExtraIds.push(edited.id);
      continue;
    }

    const created = await ch.send({
      embeds: batch,
      components: [],
    }).catch((e) => {
      console.error(`[SC_GERAL_WEEKLY_RANK] ❌ Erro ao criar continuação ${i + 1}:`, e);
      return null;
    });

    if (created?.id) nextExtraIds.push(created.id);
  }

  for (let i = extraEmbedBatches.length; i < oldExtras.length; i++) {
    await oldExtras[i].delete().catch(() => {});
  }

  st.weeklyExtraMsgIds = st.weeklyExtraMsgIds || {};
  st.weeklyExtraMsgIds[wk] = nextExtraIds;
  saveState(st);

  return true;
}

async function sendNewRankMessage() {
  const created = await ch.send({
    embeds: mainEmbeds,
    components: [row],
  }).catch((e) => {
    console.error("[SC_GERAL_WEEKLY_RANK] ❌ Erro ao criar nova msg:", e);
    return null;
  });

  if (!created) return null;

  st.weeklyMsgIds = st.weeklyMsgIds || {};
  st.weeklyMsgIds[wk] = created.id;
  st.sigByWeek[wk] = sig;
  saveState(st);

  await upsertExtraRankMessages();

  return created;
}

async function editRankMessageWithFallback(targetMsg, label = "edit") {
  if (!targetMsg?.editable) {
    console.warn(`[SC_GERAL_WEEKLY_RANK] ⚠️ Msg sem permissão de edição (${label}). Recriando.`);
    return await sendNewRankMessage();
  }

  if (label === "sem mudança") {
    await upsertExtraRankMessages();
    return targetMsg;
  }

  try {
    const edited = await targetMsg.edit({
      embeds: mainEmbeds,
      components: [row],
    });

    await upsertExtraRankMessages();
    return edited;
  } catch (e) {
    console.warn(`[SC_GERAL_WEEKLY_RANK] ⚠️ Falha temporária ao editar msg (${label}). Tentando retry em 2.5s:`, e?.message || e);
  }

  await new Promise((resolve) => setTimeout(resolve, 2500));

  try {
    const edited = await targetMsg.edit({
      embeds: mainEmbeds,
      components: [row],
    });

    await upsertExtraRankMessages();
    return edited;
  } catch (e2) {
    console.warn(`[SC_GERAL_WEEKLY_RANK] ⚠️ Retry falhou (${label}). Vou recriar msg:`, e2?.message || e2);
  }

  return await sendNewRankMessage();
}

if (!msg) {
  const created = await sendNewRankMessage();
  return Boolean(created);
}

const editedOrRecreated = await editRankMessageWithFallback(
  msg,
  oldSig === sig ? "sem mudança" : "com mudança"
);

if (!editedOrRecreated) return false;

await cleanupDuplicateRankMessagesForWeek(ch, editedOrRecreated, wk);

st.sigByWeek = st.sigByWeek || {};
st.sigByWeek[wk] = sig;

if (editedOrRecreated.id && editedOrRecreated.id !== msg.id) {
  st.weeklyMsgIds = st.weeklyMsgIds || {};
  st.weeklyMsgIds[wk] = editedOrRecreated.id;
}

saveState(st);
return true; // ✅ Sucesso



  } catch (e) {
    console.error("[SC_GERAL_WEEKLY_RANK] upsert error:", e);
    return false;
  } finally {
    globalThis.__SC_GERAL_WEEKLY_RANK_UPSERTING__ = false;
    globalThis.__SC_GERAL_WEEKLY_RANK_LOCK_TS__ = 0;
  }
}

async function safeUpdate(client, reason, opts = {}) {
  // ✅ FIX: Auto-unlock local se travado > 2min
  if (LOCK) {
     if (Date.now() - LOCK_TS > 120000) {
        console.warn("[SC_GERAL_WEEKLY_RANK] ⚠️ Local LOCK travado. Resetando.");
        LOCK = false;
     } else {
        return false;
     }
  }

  LOCK = true;
  LOCK_TS = Date.now();
  try {
    // ✅ Se for update de painel, sempre limpa o cache para não reaproveitar contagem antiga
    clearWeeklyRankCache();

    const fixedOpts = {
      ...opts,
      scanMode: opts.scanMode === "light" ? "full" : (opts.scanMode || "full"),
    };

    return await upsertWeeklyRank(client, reason, fixedOpts);
  } finally {
    LOCK = false;
    LOCK_TS = 0;
  }
}

// ================== HUB WIRING (igual ideia do teu dash) ==================
function wireHub(client) {
  if (client.__scGeralWeeklyRankHubWired) return;
  client.__scGeralWeeklyRankHubWired = true;

const markDirty = (opts = {}) => {
  DIRTY = true;
  if (opts.invalidateScanCache) {
    CACHE = { at: 0, payload: null };
    DEBUG.weekKeysFound = {};
  }
};

const scheduleFastSync = () => {
  if (client.__SC_GERAL_RANK_FAST_SYNC_TIMER__) {
    clearTimeout(client.__SC_GERAL_RANK_FAST_SYNC_TIMER__);
  }

  client.__SC_GERAL_RANK_FAST_SYNC_TIMER__ = setTimeout(async () => {
    client.__SC_GERAL_RANK_FAST_SYNC_TIMER__ = null;

    try {
      clearWeeklyRankCache();
      await safeUpdate(client, "hub fast sync", { scanMode: "full" });
      DIRTY = false;
    } catch (e) {
      console.error("[SC_GERAL_WEEKLY_RANK] erro no fast sync:", e);
    }
  }, 5000);
};

  // eventos que mexem no ranking (tudo que vira log / msg / registro)
dashOn("bp:punch", () => markDirty({ invalidateScanCache: true }));
dashOn("doacao:registrada", () => {
  markDirty({ invalidateScanCache: true });
  scheduleFastSync();
});
dashOn("lideres:convite_enviado", () => markDirty({ invalidateScanCache: true }));
dashOn("entrevista:ponto_concluido", () => markDirty({ invalidateScanCache: true }));
dashOn("presenca:confirmada", () => markDirty({ invalidateScanCache: true }));
dashOn("rm:approved", () => markDirty({ invalidateScanCache: true }));
dashOn("rm:rejected", () => markDirty({ invalidateScanCache: true }));
dashOn("alinhamento:registrado", () => markDirty({ invalidateScanCache: true }));

// ✅ Alinhamento só pontua no ranking semanal quando for APROVADO/VÁLIDO.
// O alinhamentos.js emite exatamente este evento ao clicar em "ALINHAMENTO VÁLIDO".
dashOn("alinhamento:validado", () => markDirty({ invalidateScanCache: true }));
dashOn("eventopoder:registrado", () => markDirty({ invalidateScanCache: true }));
dashOn("poderes:registrado", () => markDirty({ invalidateScanCache: true }));
dashOn("pagamento:criado", () => markDirty({ invalidateScanCache: true }));
dashOn("pagamento:solicitado", () => markDirty({ invalidateScanCache: true }));
dashOn("pagamento:pago", () => markDirty({ invalidateScanCache: true }));
dashOn("pagamento:reprovado", () => markDirty({ invalidateScanCache: true }));
dashOn("venda:registrada", () => markDirty({ invalidateScanCache: true }));
dashOn("cronograma:aprovado", () => {
  markDirty({ invalidateScanCache: true });
  scheduleFastSync();
});
dashOn("halldafama:aprovado", () => markDirty({ invalidateScanCache: true }));
dashOn("eventosdiarios:aprovado", () => markDirty({ invalidateScanCache: true }));
dashOn("correcao:usado", () => {
  markDirty({ invalidateScanCache: true });
  scheduleFastSync();
});
dashOn("gi:desligado", () => markDirty({ invalidateScanCache: true }));
dashOn("gi:retornou", () => markDirty({ invalidateScanCache: true }));

  // scheduler leve: se DIRTY, atualiza
  setInterval(async () => {

    try {
      if (!client.isReady()) return;
      if (!DIRTY) return;

      const now = Date.now();
      if (now - LAST_LIGHT_AT < COOLDOWN_LIGHT_MS) return;

      // ✅ SÓ limpa o DIRTY se a atualização rodar com sucesso
      const didRun = await safeUpdate(client, "hub dirty (light)", { scanMode: "light" });
      if (didRun) {
        LAST_LIGHT_AT = now;
        DIRTY = false;
      }
    } catch {}
  }, 30 * 1000);
}

// ================== SCHEDULER DOMINGO (vira semana) ==================
function wireWeekFlipScheduler(client) {
  if (client.__scGeralWeeklyRankWeekFlipWired) return;
  client.__scGeralWeeklyRankWeekFlipWired = true;

  setInterval(async () => {
    try {
      if (!client.isReady()) return;

      const st = loadState();
      const wkNow = weekKeyFromDateSP(nowSP());
      const lastSeen = st.lastSeenWeekKey;

      if (!lastSeen) {
        st.lastSeenWeekKey = wkNow;
        saveState(st);
        return;
      }

      // virou a semana (domingo 00:00 SP)
      if (wkNow !== lastSeen) {
        // ✅ FIX: Se já estiver rodando update (LOCK), espera o próximo tick (20s)
        // MAS verifica se é trava velha (stale) pra não travar pra sempre
        const isLocked = LOCK || globalThis.__SC_GERAL_WEEKLY_RANK_UPSERTING__;
        if (isLocked) {
           const now = Date.now();
           const lockTs = LOCK_TS || globalThis.__SC_GERAL_WEEKLY_RANK_LOCK_TS__ || 0;
           
           // Se travado há menos de 2 min, espera. Se mais, ignora a trava (stale).
           if (now - lockTs < 120000) {
               console.log("[SC_GERAL_WEEKLY_RANK] ⏳ Virada pendente, sistema ocupado. Tentando em 20s...");
               return;
           }
           console.warn("[SC_GERAL_WEEKLY_RANK] ⚠️ Virada pendente com LOCK travado (stale). Forçando execução.");
        }

        console.log(`[SC_GERAL_WEEKLY_RANK] 🔄 Virada de semana detectada: ${lastSeen} -> ${wkNow}`);

        // posta ranking da SEMANA QUE ACABOU (a anterior)
        const wkPrev = addDaysToWeekKey(wkNow, -7);

        // full pra garantir fechado certinho
        const okPrev = await safeUpdate(client, "week flip (post prev week)", { scanMode: "full", targetWeekKey: wkPrev });

        // e já cria/edita a semana nova zerada (opcional, mas eu acho bom)
        const okNow = await safeUpdate(client, "week flip (start new week)", { scanMode: "light", targetWeekKey: wkNow });

        // ✅ Só salva o estado DEPOIS de rodar os updates com sucesso
        // Se falhar (ex: bot caiu, erro de rede), ele tenta de novo no próximo ciclo (20s)
        if (okPrev && okNow) {
            st.lastSeenWeekKey = wkNow;
            saveState(st);
            DIRTY = false;
            console.log(`[SC_GERAL_WEEKLY_RANK] ✅ Virada de semana concluída com sucesso!`);
        } else {
            console.warn(`[SC_GERAL_WEEKLY_RANK] ⚠️ Falha ao enviar/atualizar ranking na virada. Tentando novamente em 20s.`);
        }
      } else {
        // ✅ AUTO-REPAIR: Se já estamos na semana (wkNow), mas o bot não tem o ID da mensagem salva,
        // significa que ele não criou o painel novo ainda (ou perdeu a referência).
        // Força a criação agora.
        if (!st.weeklyMsgIds[wkNow]) {
           const isLocked = LOCK || globalThis.__SC_GERAL_WEEKLY_RANK_UPSERTING__;
           if (!isLocked) {
               console.log(`[SC_GERAL_WEEKLY_RANK] 🛠️ Auto-Repair: Mensagem da semana atual (${wkNow}) ausente. Criando...`);
               await safeUpdate(client, "auto-repair missing current week", { scanMode: "light", targetWeekKey: wkNow });
           }
        }
      }
    } catch (e) {
      console.error("[SC_GERAL_WEEKLY_RANK] Erro no scheduler de virada de semana:", e);
    }
  }, 20 * 1000);
}

// ================== DEBUG TEXT ==================
function debugText() {
  const keys =
    Object.entries(DEBUG.weekKeysFound || {})
      .sort((a, b) => (a[0] > b[0] ? -1 : 1))
      .slice(0, 10)
      .map(([k, v]) => `${k}=${v}`)
      .join(" • ") || "(nenhuma)";
  const st = loadState();
  return [
    `🧾 Debug WEEKLY_RANK v1.0`,
    `• keys(scan): ${keys}`,
    `• lastReason: ${DEBUG.lastReason || "—"}`,
    `• dirty: ${DIRTY ? "sim" : "não"}`,
    `• nextFullAllowedAt: ${st.nextFullAllowedAt ? new Date(st.nextFullAllowedAt).toLocaleString("pt-BR") : "—"}`,
  ].join("\n");
}

// ============================================================================
// MÉTRICA OPERACIONAL — PARTICIPAÇÃO E DISTRIBUIÇÃO DA EQUIPE
// ============================================================================

export async function buildWeeklyRankingOperationalMetric(
  context = {}
) {
  const client =
    context.client;

  if (!client) {
    return {
      id:
        "participacao_equipe",

      label:
        "Participação da Equipe",

      available:
        false,

      score:
        null,

      confidence:
        0,

      volume:
        0,

      positivePoints: [],

      attentionPoints: [
        "O cliente do Discord não estava disponível para consultar o ranking semanal.",
      ],

      recommendations: [],

      details: {},
    };
  }

  const {
    items,
  } =
    await collectAllPoints(
      client,
      "light"
    );

  const currentWeekKey =
    weekKeyFromDateSP(
      nowSP()
    );

  const previousWeekKey =
    addDaysToWeekKey(
      currentWeekKey,
      -7
    );

  const current =
    aggregateWeekDetailed(
      items,
      currentWeekKey
    );

  const previous =
    previousWeekKey
      ? aggregateWeekDetailed(
          items,
          previousWeekKey
        )
      : {
          totalEvents: 0,
          list: [],
          bySourceByUser: {},
        };

  const participants =
    current.list.length;

  const participantsPrevious =
    previous.list.length;

  const reachedMinimum =
    current.list.filter(
      participant =>
        Number(
          participant.points || 0
        ) >=
        MIN_POINTS_WEEK
    ).length;

  const belowMinimum =
    Math.max(
      0,
      participants -
      reachedMinimum
    );

  const hitRate =
    participants > 0
      ? (
          reachedMinimum /
          participants
        ) *
        100
      : 0;

  const averagePoints =
    participants > 0
      ? current.totalEvents /
        participants
      : 0;

  const averageGoalRate =
    Math.min(
      100,
      (
        averagePoints /
        Math.max(
          1,
          MIN_POINTS_WEEK
        )
      ) *
      100
    );

  /*
   * 70% da nota depende da quantidade de pessoas
   * que alcançaram o mínimo individual.
   *
   * 30% depende da média de pontos da equipe.
   *
   * Assim, poucos usuários com muitos pontos não conseguem
   * esconder uma equipe inteira abaixo da meta.
   */
  const score =
    hitRate * 0.7 +
    averageGoalRate * 0.3;

  const previousReachedMinimum =
    previous.list.filter(
      participant =>
        Number(
          participant.points || 0
        ) >=
        MIN_POINTS_WEEK
    ).length;

  const previousHitRate =
    participantsPrevious > 0
      ? (
          previousReachedMinimum /
          participantsPrevious
        ) *
        100
      : 0;

  const difference =
    hitRate -
    previousHitRate;

  const sourceTotals = {};

  for (
    const sources of
    Object.values(
      current.bySourceByUser || {}
    )
  ) {
    for (
      const [
        source,
        amount,
      ] of Object.entries(
        sources || {}
      )
    ) {
      sourceTotals[source] =
        (
          sourceTotals[source] || 0
        ) +
        Number(
          amount || 0
        );
    }
  }

  const strongestSources =
    Object.entries(
      sourceTotals
    )
      .sort(
        (a, b) =>
          b[1] - a[1]
      )
      .slice(
        0,
        5
      );

  const positivePoints = [];
  const attentionPoints = [];
  const recommendations = [];

  if (hitRate >= 70) {
    positivePoints.push(
      `${reachedMinimum} de ${participants} participantes alcançaram o mínimo semanal de ${MIN_POINTS_WEEK} pontos.`
    );
  }

  if (
    current.totalEvents >
    previous.totalEvents
  ) {
    positivePoints.push(
      `A equipe somou ${current.totalEvents} pontos, superando os ${previous.totalEvents} pontos da semana anterior.`
    );
  }

  if (
    strongestSources.length
  ) {
    positivePoints.push(
      `As fontes com maior contribuição foram: ${strongestSources
        .map(
          (
            [
              source,
              amount,
            ]
          ) =>
            `${SOURCE_LABEL[source] || source} (${amount})`
        )
        .join(", ")}.`
    );
  }

  if (
    belowMinimum > 0
  ) {
    attentionPoints.push(
      `${belowMinimum} de ${participants} participantes ainda estão abaixo do mínimo de ${MIN_POINTS_WEEK} pontos.`
    );
  }

  if (
    hitRate < 50 &&
    participants > 0
  ) {
    attentionPoints.push(
      `Apenas ${hitRate.toFixed(1)}% dos participantes alcançaram o mínimo individual da semana.`
    );
  }

  if (
    participants > 0 &&
    averagePoints <
      MIN_POINTS_WEEK
  ) {
    attentionPoints.push(
      `A média atual é de ${averagePoints.toFixed(1)} pontos por participante, abaixo dos ${MIN_POINTS_WEEK} pontos esperados.`
    );
  }

  if (
    belowMinimum > 0
  ) {
    recommendations.push(
      `Acompanhar individualmente os ${belowMinimum} participantes abaixo do mínimo e verificar quais fontes de atividade ainda não foram realizadas.`
    );
  }

  if (
    hitRate < 50
  ) {
    recommendations.push(
      "Distribuir melhor as atividades entre a equipe para reduzir a concentração dos pontos em poucos membros."
    );
  }

  if (!positivePoints.length) {
    positivePoints.push(
      "O Ranking Geral está registrando as atividades realizadas pela equipe durante a semana."
    );
  }

  if (!attentionPoints.length) {
    attentionPoints.push(
      "Nenhum problema relevante de participação foi identificado no ranking semanal."
    );
  }

  if (!recommendations.length) {
    recommendations.push(
      "Manter o acompanhamento do mínimo individual até o fechamento da semana."
    );
  }

  return {
    id:
      "participacao_equipe",

    label:
      "Participação da Equipe",

    available:
      participants > 0,

    score:
      Math.max(
        0,
        Math.min(
          100,
          score
        )
      ),

    confidence:
      Math.min(
        100,
        45 +
        participants * 5
      ),

    volume:
      current.totalEvents,

    goal:
      MIN_POINTS_WEEK,

    current:
      hitRate,

    previous:
      previousHitRate,

    difference,

    positivePoints,

    attentionPoints,

    recommendations,

    details: {
      weekKey:
        currentWeekKey,

      previousWeekKey,

      participants,

      participantsPrevious,

      reachedMinimum,

      belowMinimum,

      hitRate,

      previousHitRate,

      averagePoints,

      minimumPerParticipant:
        MIN_POINTS_WEEK,

      totalPoints:
        current.totalEvents,

      previousTotalPoints:
        previous.totalEvents,

      strongestSources,
    },
  };
}

registerOperationalMetricProvider(
  "participacao_equipe",
  buildWeeklyRankingOperationalMetric
);

// ✅ NOVO: Exporta o ranking semanal para outros módulos
export async function getWeeklyRanking(client) {
  try {
    const { items } = await collectAllPoints(client, "full");
    const wkNow = weekKeyFromDateSP(nowSP());
    const agg = aggregateWeekDetailed(items, wkNow);

return [...(agg.list || [])].sort((a, b) => {
  const pa = Number(a?.points || 0);
  const pb = Number(b?.points || 0);
  return pb - pa;
});
  } catch (e) {
    console.error("[SC_GERAL_WEEKLY_RANK] getWeeklyRanking error:", e);
    return [];
  }
}

export async function getWeeklyRankingDebug(client) {
  try {
    const { items } = await collectAllPoints(client, "full");
    const wkNow = weekKeyFromDateSP(nowSP());
    const agg = aggregateWeekDetailed(items, wkNow);

    return {
      weekKey: wkNow,
      totalItems: items.length,
      totalRankedUsers: agg.list?.length || 0,
      top15: [...(agg.list || [])]
  .sort((a, b) => Number(b?.points || 0) - Number(a?.points || 0))
  .slice(0, 15),
    };
  } catch (e) {
    console.error("[scGeralWeeklyRanking] getWeeklyRankingDebug error:", e);
    return {
      weekKey: null,
      totalItems: 0,
      totalRankedUsers: 0,
      top15: [],
    };
  }
}

// ✅ NOVO: Export para uso externo (ex: gestaoinfluencer desligamento)
export async function getStatsForUser(client, userId) {

  try {
    // Usa scanMode light pra aproveitar cache se tiver, ou scan rápido
    const { items } = await collectAllPoints(client, "light");
    
    const userItems = items.filter(i => i.userId === String(userId));
    const total = userItems.length;
    
    const bySource = {};
    const byWeek = {};
    
    // Carrega ajustes manuais pra somar também
    const adjustmentsData = loadAdjustments();
    
    for (const item of userItems) {
      // Por fonte
      const label = SOURCE_LABEL[item.source] || item.source;
      bySource[label] = (bySource[label] || 0) + 1;
      
      // Por semana
      const wk = weekKeyFromDateSP(item.ts);
      byWeek[wk] = (byWeek[wk] || 0) + 1;
    }

    // Soma ajustes manuais no total e nas semanas
    let totalAdjustments = 0;
    if (adjustmentsData.byWeek) {
      for (const [wk, users] of Object.entries(adjustmentsData.byWeek)) {
        const adj = users[String(userId)] || 0;
        if (adj !== 0) {
          byWeek[wk] = (byWeek[wk] || 0) + adj;
          totalAdjustments += adj;
        }
      }
    }
    
    // Formata semanas para label legível
    const weeksFormatted = [];
    const sortedWeeks = Object.keys(byWeek).sort().reverse(); // Mais recente primeiro
    
    for (const wk of sortedWeeks) {
      const pts = byWeek[wk];
      if (pts === 0) continue;
      const label = triLabelShortFromWeekKey(wk);
      weeksFormatted.push(`• **${label}**: ${pts} pts`);
    }

    // Formata fontes
    const sourcesFormatted = Object.entries(bySource)
      .sort((a, b) => b[1] - a[1])
      .map(([src, count]) => `• ${src}: **${count}**`);

    // ✅ NOVO: Pega pontos da semana atual
const currentWeekKey = weekKeyFromDateSP(nowSP());

// byWeek já recebeu os ajustes no loop acima
const thisWeekTotalPoints = byWeek[currentWeekKey] || 0;
const thisWeekAdjustment = adjustmentsData.byWeek?.[currentWeekKey]?.[String(userId)] || 0;

 return {
  total: total + totalAdjustments,
  thisWeekPoints: thisWeekTotalPoints,
  totalBase: total,
  totalAdjustments,
  sourcesFormatted,
  weeksFormatted
};
  } catch (e) {
    console.error("[scGeralWeeklyRanking] getStatsForUser error:", e);
    return null;
  }
}

export async function handleWeeklyRankInteractions(interaction, client) {
  if (interaction.isButton() && interaction.customId === "SC_REMOVE_POINTS") {
    const member = interaction.member;
    if (!member || !member.roles) {
      return interaction.reply({
        content: "❌ Não foi possível validar suas permissões.",
        ephemeral: true,
      });
    }

const hasRole = member.roles.cache.some((r) => ALLOWED_REMOVE_ROLES.has(r.id));
const isAllowedUser = ALLOWED_REMOVE_USERS.has(member.id);

if (!hasRole && !isAllowedUser) {
  return interaction.reply({
    content: "❌ Você não tem permissão para remover pontos.",
    ephemeral: true,
  });
}

// 🔥 validação leve antes de abrir modal (melhora UX)
const executorLevel = getHighestRemovalHierarchyLevel(member);

if (!isAllowedUser && executorLevel == null) {
  return interaction.reply({
    content: "❌ Você não possui cargo válido para remover pontos.",
    ephemeral: true,
  });
}

    const modal = new ModalBuilder()
      .setCustomId("SC_REMOVE_POINTS_MODAL")
      .setTitle("Remover Pontos (Ranking Semanal)");

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("userId")
          .setLabel("ID do Discord")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("points")
          .setLabel("Quantidade de pontos a REMOVER")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );

    return interaction.showModal(modal);
  }

if (interaction.isModalSubmit() && interaction.customId === "SC_REMOVE_POINTS_MODAL") {
  const userId = interaction.fields.getTextInputValue("userId").trim();
  const points = Number(interaction.fields.getTextInputValue("points"));

  if (!/^\d{17,20}$/.test(userId) || !Number.isFinite(points) || points <= 0) {
    return interaction.reply({ content: "❌ Dados inválidos.", ephemeral: true });
  }

  const perm = await canRemovePointsFromTarget({
    guild: interaction.guild,
    executorId: interaction.user.id,
    targetUserId: userId,
  });

  if (!perm.ok) {
    return interaction.reply({
      content: `❌ ${perm.reason}`,
      ephemeral: true,
    });
  }

  const wk = weekKeyFromDateSP(nowSP());
  const { before, after } = applyManualAdjustment({
    weekKey: wk,
    userId,
    delta: -Math.abs(points),
  });

  clearWeeklyRankCache();
  CACHE = { at: 0, payload: null };
  DEBUG.weekKeysFound = {};
  DIRTY = true;
  LAST_LIGHT_AT = 0;

  await safeUpdate(client, "manual remove points", {
    scanMode: "full",
  });

  await emitManualRemoveLog(client, {
    executorUserId: interaction.user.id,
    executorMention: `<@${interaction.user.id}>`,
    executorRoleId: perm.executorRoleId,
    executorRoleLabel: getRemovalRoleLabel(perm.executorRoleId),
    targetUserId: userId,
    targetMention: `<@${userId}>`,
    qty: points,
    weekKey: wk,
    before,
    after,
    bypass: perm.bypass,
  });

  return interaction.reply({
    content:
      `✅ Removidos **${points} pts** de <@${userId}> na semana atual.\n` +
      `🗓️ Semana: \`${wk}\`\n` +
      `📉 Ajuste do alvo: ${before} → ${after}`,
    ephemeral: true,
  });
}
}

// ================== EXPORTS ==================
export async function geralWeeklyRankOnReady(client) {
  if (__SC_GERAL_RANK_SKIP__) return;

  // ✅ evita rodar 2x no mesmo process
  if (client.__SC_GERAL_WEEKLY_RANK_READY_RAN_V1__) return;
  client.__SC_GERAL_WEEKLY_RANK_READY_RAN_V1__ = true;

  wireHub(client);
  wireWeekFlipScheduler(client);

  // primeira render assim que subir
  await safeUpdate(client, "boot full scan", { scanMode: "full" });
  DIRTY = false;
}

// comandos:
//  !geralrankdebug
//  !geralrankrefresh  (full)
//  !geralrankweek 2026-01-18 (gera/atualiza semana específica)
export async function geralWeeklyRankHandleMessage(message, client) {
  if (__SC_GERAL_RANK_SKIP__) return false;

  try {
    if (!message?.guild || message.author?.bot) return false;

    const content = String(message.content || "").trim();
    const low = content.toLowerCase();

    if (!low.startsWith("!geralrank")) return false;

    try { await message.delete().catch(() => {}); } catch {}

    if (low === "!geralrankdebug") {
      const txt = debugText();
      const reply = await message.channel.send("```" + txt + "```").catch(() => null);
      if (reply) setTimeout(() => reply.delete().catch(() => {}), 15000);
      return true;
    }

    if (low === "!geralrankrefresh") {
      // ✅ FORCE UNLOCK: Destrava qualquer processo preso
      LOCK = false;
      globalThis.__SC_GERAL_WEEKLY_RANK_UPSERTING__ = false;
      globalThis.__SC_GERAL_WEEKLY_RANK_LOCK_TS__ = 0;
      console.log("[SC_GERAL_WEEKLY_RANK] 🔓 Desbloqueio forçado via comando.");

      const st = loadState();
      const now = Date.now();
      
      // ✅ Bypass cooldown para você e Owner
      const isBypass = ALLOWED_REMOVE_USERS.has(message.author.id) || message.author.id === "1262262852949905408";

      if (!isBypass && now < Number(st.nextFullAllowedAt || 0)) {
        const warn = await message.channel
          .send("⏳ Full scan ainda em cooldown (4h). Usa de novo mais tarde.")
          .catch(() => null);
        if (warn) setTimeout(() => warn.delete().catch(() => {}), 8000);
        return true;
      }

      st.nextFullAllowedAt = now + COOLDOWN_FULL_MS;
      saveState(st);

      DIRTY = false;
      await safeUpdate(client, "manual refresh (!geralrankrefresh)", { scanMode: "full" });

      const ok = await message.channel.send("✅ Ranking semanal atualizado (full scan).").catch(() => null);
      if (ok) setTimeout(() => ok.delete().catch(() => {}), 8000);
      return true;
    }

    // !geralrankweek YYYY-MM-DD
    if (low.startsWith("!geralrankweek")) {
      const parts = content.split(/\s+/g);
      const wk = String(parts[1] || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(wk)) {
        const warn = await message.channel
          .send("❓ Use: `!geralrankweek 2026-01-18` (weekKey do domingo)")
          .catch(() => null);
        if (warn) setTimeout(() => warn.delete().catch(() => {}), 9000);
        return true;
      }

      await safeUpdate(client, `manual week (${wk})`, { scanMode: "full", targetWeekKey: wk });

      const ok = await message.channel.send(`✅ Ranking da semana **${wk}** atualizado.`).catch(() => null);
      if (ok) setTimeout(() => ok.delete().catch(() => {}), 8000);
      return true;
    }

    const warn = await message.channel
      .send("❓ Use: `!geralrankrefresh` ou `!geralrankdebug` ou `!geralrankweek YYYY-MM-DD`")
      .catch(() => null);
    if (warn) setTimeout(() => warn.delete().catch(() => {}), 9000);

    return true;
  } catch (e) {
    console.error("[SC_GERAL_WEEKLY_RANK] handleMessage erro:", e);
    return true;
  }
}
