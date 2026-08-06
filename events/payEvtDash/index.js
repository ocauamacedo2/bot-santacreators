// events/payEvtDash/index.js — Dashboard definitivo SantaCreators
import fs from "node:fs";
import path from "node:path";
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";

import { dashOn } from "../../utils/dashHub.js";

// =========================
// CONFIG
// =========================
const TZ = "America/Sao_Paulo";

const DASH_CHANNEL_ID = "1457985700312911912";
const PAY_CHANNEL_ID = "1387922662134775818";
const PAY_LOG_CHANNEL_ID = "1486084352403312843";

const CH_PODERES_ID = "1374066813171929218";
const EVT3_EVENT_CHANNEL_ID = "1457573495952248883";
const REGISTRO_EVENTO_CHANNEL_ID = "1392618646630568076";
const CRONOGRAMA_LOGS_CHANNEL_ID = "1387864036259004436";
const CRONOGRAMA_AUDIT_LOG_CHANNEL_ID = "1486009619846529075";

// ✅ NOVO: logs/canais auxiliares para auditoria real
const LIDERES_LOG_CHANNEL_ID = "1486009598237212793";

// ✅ Bate ponto: canais individuais + canal calendário/log oficial
const BATEPONTO_CHANNEL_IDS = [
  "1417601634644525147",
  "1417602111495077920",
  "1417601906305536101",
  "1417602334036463656",
  "1425943893400227892",
];

const BATEPONTO_CALENDAR_LOG_CHANNEL_ID = "1486006809679364197";

// ✅ Registro de poderes em evento vem do registroevento.js / registroPoderesEventos.js
const PODERES_EVENTOS_CHANNEL_IDS = [
  "1392618646630568076",
  "1513320054568259835",
  "1513319923471089714",
];

const PAY_PERIOD_OK = 40;
const PAY_PERIOD_GOAL = 50;
const PAY_PERIOD_LIMIT = 70;

const DATA_DIR = path.resolve(process.cwd(), "data");

// ✅ Fonte oficial em disco do bate ponto
const BP_MONTHLY_DIR = path.join(DATA_DIR, "sc_bp_monthly");

const STATE_PATH = path.join(DATA_DIR, "sc_pay_evt_dashboard_v2_state.json");
const ADJUST_PATH = path.join(DATA_DIR, "sc_pay_evt_manual_adjusts.json");

// ✅ NOVO: pontos recebidos via dashEmit para não sumirem no recálculo
const PAYMENT_DECISIONS_PATH = path.join(DATA_DIR, "sc_pay_evt_payment_decisions.json");
const CRONO_APPROVALS_PATH = path.join(DATA_DIR, "sc_pay_evt_crono_approvals.json");

const DASH_MARKER = "SC_PAY_EVT_DASH_V2";

// Coloque aqui a URL da imagem/banner antiga do dashboard.
// Pode ser link do Discord/CDN, imgur, media.discordapp etc.
const DASHBOARD_IMAGE_URL = process.env.SC_PAY_EVT_DASH_IMAGE_URL || "";

const ALLOWED_MANAGE_IDS = [
  "660311795327828008",
  "1262262852949905408",
];

const ALLOWED_MANAGE_ROLES = [
  "1352408327983861844",
  "1262262852949905409",
  "1352407252216184833",
  "1388976314253312100",
  "1282119104576098314",
  "1387253972661964840",
  "1388976094920704141",
];

const SCAN_CONFIG = {
  /*
   * Até 25 páginas por canal.
   *
   * Como cada página possui até 100 mensagens,
   * o scanner poderá examinar até 2.500 mensagens
   * em cada fonte oficial.
   *
   * Isso é importante porque o canal de aprovação
   * reúne Hall da Fama, Eventos Diários, Cronograma
   * e outros sistemas no mesmo histórico.
   */
  pagesPerChannel:
    25,

  fetchLimit:
    100,

  /*
   * Mantém capacidade de reconstruir aproximadamente
   * três meses de histórico.
   */
  maxAgeDays:
    100,

  /*
   * Os logs de Pagamentos podem possuir muitas mensagens.
   *
   * O limite anterior de 120 links podia encerrar a
   * recuperação antes de chegar aos registros antigos
   * da semana analisada.
   */
  maxLinkedLogsToRecover:
    400,

  linkedFetchTimeoutMs:
    3500,
};

let LOCK = false;
let LOCK_TS = 0;
let CACHE = {
  at: 0,
  payload: null,
};

const LOCK_STUCK_MS = 2 * 60 * 1000;
const CACHE_TTL_MS = 20 * 1000;

// =========================
// HELPERS
// =========================
function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadJSON(file, fallback) {
  try {
    ensureDir();
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8")) || fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(file, data) {
  try {
    ensureDir();
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("[SC_PAY_EVT_DASH_V2] saveJSON erro:", err);
  }
}

function loadState() {
  return loadJSON(STATE_PATH, {
    dashboardMsgId: null,
    lastFingerprint: "",
    lastUpdatedAt: null,
  });
}

function saveState(state) {
  saveJSON(STATE_PATH, state);
}

function loadAdjustments() {
  return loadJSON(ADJUST_PATH, { byWeek: {} });
}

function saveAdjustment(weekKey, userId, amount) {
  const data = loadAdjustments();
  data.byWeek[weekKey] ??= {};
  const current = Number(data.byWeek[weekKey][userId] || 0);
  data.byWeek[weekKey][userId] = current + Number(amount);
  saveJSON(ADJUST_PATH, data);
}


function loadHubPoints() {
  return { items: {} };
}

function saveHubPoints() {
  return;
}
function savePaymentDecision(action, payload = {}) {
  const data = loadJSON(PAYMENT_DECISIONS_PATH, { items: {} });

  const messageId = payload.newMessageId || payload.messageId || payload.oldMessageId;
  const oldMessageId = payload.oldMessageId || null;
  const creatorId = payload.creatorId || payload.registranteId || payload.userId || null;

  if (!messageId || !creatorId) return;

  // ✅ Remove decisão antiga do mesmo pagamento quando ele troca de status
  for (const [key, item] of Object.entries(data.items || {})) {
    if (
      item?.messageId === oldMessageId ||
      item?.messageId === messageId ||
      key === `paymsg:${oldMessageId}` ||
      key === `paymsg:${messageId}`
    ) {
      delete data.items[key];
    }
  }

  data.items[`paymsg:${messageId}`] = {
    key: `paymsg:${messageId}`,
    status: action === "pago" ? "approved" : action === "reprovado" ? "rejected" : "requested",
    creatorId,
    decisionUserId: payload.by || payload.approverId || null,
    ts: Number(payload.dataEventoTimestamp || payload.__at || Date.now()),
    channelId: payload.canal || PAY_CHANNEL_ID,
    messageId,
    oldMessageId,
  };

  saveJSON(PAYMENT_DECISIONS_PATH, data);
}

function applyPaymentDecisions(stats, seen) {
  const data = loadJSON(PAYMENT_DECISIONS_PATH, { items: {} });

  for (const item of Object.values(data.items || {})) {
    if (!item?.key || seen.has(item.key)) {
      stats.debug.duplicatesIgnored++;
      continue;
    }

    seen.add(item.key);

    addPayment(stats, {
      key: item.key,
      source: "payment_button_decision",
      messageId: item.messageId,
      channelId: item.channelId,
      ts: Number(item.ts || Date.now()),
      status: item.status,
      creatorId: item.creatorId,
      decisionUserId: item.decisionUserId,
    });
  }
}

function saveCronogramaApproval(payload = {}) {
  const data = loadJSON(CRONO_APPROVALS_PATH, { items: {} });
  const userId = payload.userId || payload.targetId || null;
  if (!userId) return;

  const key = `cronograma:${userId}:${periodKeyFromDateSP(new Date(payload.at || Date.now())).key}`;

  data.items[key] = {
    key,
    userId,
    ts: Number(payload.at || Date.now()),
  };

  saveJSON(CRONO_APPROVALS_PATH, data);
}

function applyCronogramaApprovals(stats, seen) {
  const data = loadJSON(CRONO_APPROVALS_PATH, { items: {} });

  for (const item of Object.values(data.items || {})) {
    if (!item?.key || seen.has(item.key)) {
      stats.debug.duplicatesIgnored++;
      continue;
    }

    seen.add(item.key);

    addEvent(stats, {
      key: item.key,
      source: "cronograma_approval_state",
      kind: "cronograma",
      ts: Number(item.ts || Date.now()),
      userId: item.userId,
    });
  }
}
function saveHubPoint(kind, payload = {}) {
  const data = loadHubPoints();

  const userId =
    payload.userId ||
    payload.by ||
    payload.authorId ||
    payload.creatorId ||
    null;

  if (!userId) return;

  const ts = Number(payload.at || payload.__at || Date.now());

  const key =
    payload.messageId
      ? `hub:${kind}:msg:${payload.messageId}`
      : `hub:${kind}:${userId}:${ts}`;

  data.items[key] = {
    key,
    kind,
    userId,
    ts,
    payload,
  };

  saveHubPoints(data);
}

function applyHubPoints(stats, seen) {
  const data = loadHubPoints();

  for (const item of Object.values(data.items || {})) {
    if (!item?.key || seen.has(item.key)) {
      stats.debug.duplicatesIgnored++;
      continue;
    }

    seen.add(item.key);

    addEvent(stats, {
      key: item.key,
      source: "dashHub",
      kind: item.kind,
      messageId: item.payload?.messageId || null,
      channelId: item.payload?.channelId || null,
      ts: Number(item.ts || Date.now()),
      userId: item.userId,
    });
  }
}

function norm(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
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

function clean(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

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
    y: Number(parts.find((p) => p.type === "year")?.value || 0),
    m: Number(parts.find((p) => p.type === "month")?.value || 0),
    d: Number(parts.find((p) => p.type === "day")?.value || 0),
  };
}

function addDaysUTC(dateUTC, days) {
  const d = new Date(dateUTC.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function periodKeyFromDateSP(date) {
  const baseDate = new Date(date);

  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "short",
  }).format(baseDate);

  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dow = map[wd] ?? 0;

  const { y, m, d } = ymdSP(baseDate);
  const todayUTC = new Date(Date.UTC(y, m - 1, d));
  const sundayUTC = addDaysUTC(todayUTC, -dow);
  const saturdayUTC = addDaysUTC(sundayUTC, 6);

  const key = `${sundayUTC.getUTCFullYear()}-${pad2(sundayUTC.getUTCMonth() + 1)}-${pad2(sundayUTC.getUTCDate())}`;
  const label =
    sundayUTC.getUTCMonth() === saturdayUTC.getUTCMonth()
      ? `${pad2(sundayUTC.getUTCDate())}-${pad2(saturdayUTC.getUTCDate())}/${pad2(saturdayUTC.getUTCMonth() + 1)}`
      : `${pad2(sundayUTC.getUTCDate())}/${pad2(sundayUTC.getUTCMonth() + 1)}-${pad2(saturdayUTC.getUTCDate())}/${pad2(saturdayUTC.getUTCMonth() + 1)}`;

  return { key, label };
}

function monthKeyFromDateSP(date) {
  const { y, m } = ymdSP(date);
  return `${y}-${pad2(m)}`;
}

function labelFromMonthKey(key) {
  const [y, m] = String(key || "").split("-");
  return `${m}/${y}`;
}

function previousMonthKeySP(date = nowSP()) {
  const { y, m } = ymdSP(date);

  const prev = m === 1
    ? { y: y - 1, m: 12 }
    : { y, m: m - 1 };

  return `${prev.y}-${pad2(prev.m)}`;
}

function dashboardAllowedMonthKeys() {
  const current = monthKeyFromDateSP(nowSP());
  const previous = previousMonthKeySP(nowSP());

  return new Set([current, previous]);
}

function isDashboardMonthAllowed(monthKey) {
  return dashboardAllowedMonthKeys().has(monthKey);
}

function dateFromBR(text, fallbackTs) {
  const raw = String(text || "");
  const m = raw.match(/\b(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?\b/);
  const msgDate = new Date(fallbackTs || Date.now());
  
  if (!m) return msgDate;

  const dia = Number(m[1]);
  const mes = Number(m[2]);
  let ano = m[3] ? Number(m[3]) : ymdSP(msgDate).y;

  if (ano < 100) ano = 2000 + ano;
  if (!Number.isFinite(dia) || !Number.isFinite(mes) || !Number.isFinite(ano)) {
    return new Date(fallbackTs || Date.now());
  }

  const d = new Date(`${ano}-${pad2(mes)}-${pad2(dia)}T12:00:00-03:00`);
  if (Number.isNaN(d.getTime())) return msgDate;

  // ✅ LÓGICA DE DATA INTELIGENTE:
  // Se a data informada for no FUTURO em relação à mensagem, usa a data da mensagem.
  // Se for no PASSADO, usa a data informada (permite retroativo).
  if (d.getTime() > msgDate.getTime() + 86400000) return msgDate;

  return d; 
}

function getEmbedText(embed) {
  const parts = [];

  if (embed?.title) parts.push(embed.title);
  if (embed?.description) parts.push(embed.description);
  if (embed?.footer?.text) parts.push(embed.footer.text);

  for (const f of embed?.fields || []) {
    parts.push(f.name || "");
    parts.push(f.value || "");
  }

  return parts.join("\n");
}

function getFields(embed) {
  return embed?.fields || embed?.data?.fields || [];
}

function findFieldValue(embed, names = []) {
  const wanted = names.map(norm);

  for (const field of getFields(embed)) {
    const n = norm(field?.name);
    if (wanted.some((w) => n.includes(w))) return String(field?.value || "");
  }

  return "";
}

function extractUserId(text) {
  const m = String(text || "").match(/<@!?(\d+)>/);
  return m ? m[1] : null;
}

function extractFirstDiscordLink(text) {
  const m = String(text || "").match(/discord(?:app)?\.com\/channels\/(\d+)\/(\d+)\/(\d+)/i);
  if (!m) return null;

  return {
    guildId: m[1],
    channelId: m[2],
    messageId: m[3],
  };
}

function statusFromText(text) {
  const raw = String(text || "");
  const t = norm(raw);

  if (
    t.includes("reprovado") ||
    t.includes("recusado") ||
    t.includes("negado") ||
    t.includes("pagamento reprovado")
  ) {
    return "rejected";
  }

  if (
    t.includes("solicitado") ||
    t.includes("marcado como solicitado") ||
    t.includes("aguardando pagamento")
  ) {
    return "requested";
  }

  // APROVADO REAL DE PAGAMENTO:
  // somente botão/status PAGO conta como aprovado.
  if (
    /\bpago\b/i.test(t) ||
    /✅\s*\*{0,2}pago\*{0,2}/i.test(raw)
  ) {
    return "approved";
  }

  return "created";
}

function isPaymentEmbed(embed) {
  const text = norm(getEmbedText(embed));

  return (
    text.includes("registro de pagamento") ||
    text.includes("pagamento de evento") ||
    text.includes("santacreators") && text.includes("ganhador") && text.includes("status")
  );
}

function isPaymentLogEmbed(embed) {
  const text = norm(getEmbedText(embed));

  return (
    text.includes("pagamento confirmado") ||
    text.includes("pagamento reprovado") ||
    text.includes("marcado como solicitado") ||
    text.includes("novo pagamento") ||
    text.includes("registro de pagamento") ||
    text.includes("ganhador") && text.includes("data do evento")
  );
}

function getPaymentDate(embed, fallbackTs) {
  const field =
    findFieldValue(embed, ["data do evento", "data", "evento"]) ||
    embed?.description ||
    getEmbedText(embed);

  return dateFromBR(field, fallbackTs);
}

function getPaymentCreatorId(embed) {
  return (
    extractUserId(findFieldValue(embed, ["registrado por", "registro", "criador", "responsavel", "responsável"])) ||
    extractUserId(getEmbedText(embed))
  );
}

function getPaymentDecisionUserId(embed) {
  return (
    extractUserId(findFieldValue(embed, ["ultima decisao", "última decisão", "aprovado por", "reprovado por", "solicitado por"])) ||
    null
  );
}

function getPaymentStatus(embed) {
  const status = findFieldValue(embed, ["status", "situação", "situacao", "resultado"]);
  return statusFromText(status || getEmbedText(embed));
}

function isEventManualEmbed(embed) {
  const text = norm(getEmbedText(embed));
  return (
    text.includes("registro de evento") ||
    text.includes("evento aprovado") ||
    text.includes("registro manual")
  );
}

function isPoderesEmbed(embed) {
  const text = norm(getEmbedText(embed));
  return (
    text.includes("registro de poder") ||
    text.includes("poder utilizado") ||
    text.includes("poderes utilizados") ||
    text.includes("poderes")
  );
}

function isCronoHallDailyEmbed(embed) {
  const text = norm(getEmbedText(embed));
  return (
    text.includes("cronograma") ||
    text.includes("hall da fama") ||
    text.includes("eventos diarios") ||
    text.includes("eventos diários") ||
    text.includes("aprovado")
  );
}

// ✅ NOVO: pega texto completo da mensagem, embed, campos e conteúdo
function getMessageFullText(msg) {
  return [
    msg?.content || "",
    ...(msg?.embeds || []).map(getEmbedText),
  ].join("\n");
}

// ✅ NOVO: identifica se foi aprovado de verdade
function isApprovedText(text) {
  const t = norm(text);

  if (
    t.includes("reprovado") ||
    t.includes("recusado") ||
    t.includes("negado") ||
    t.includes("rejeitado")
  ) {
    return false;
  }

  return (
    t.includes("aprovado") ||
    t.includes("aprovada") ||
    t.includes("aprovacao") ||
    t.includes("aprovação") ||
    t.includes("✅ aprovado") ||
    t.includes("status aprovado")
  );
}

// ✅ NOVO: identifica a fonte correta dentro do canal de aprovação/log
function inferEventKindFromText(text, fallbackKind = null) {
  const t = norm(text);

  if (t.includes("hall da fama") || t.includes("halldafama")) return "hall";

  if (
    t.includes("eventos diarios") ||
    t.includes("eventos diários") ||
    t.includes("evento diario") ||
    t.includes("evento diário")
  ) {
    return "diarios";
  }

  if (t.includes("cronograma")) return "cronograma";

  if (
    t.includes("dm lideres") ||
    t.includes("dm líderes") ||
    t.includes("convite para lideres") ||
    t.includes("convite para líderes")
  ) {
    return "lideres";
  }

  if (
    t.includes("bate ponto") ||
    t.includes("bate-ponto") ||
    t.includes("bp:punch") ||
    t.includes("linha do tempo")
  ) {
    return "bateponto";
  }

  if (
    t.includes("registro de poderes em evento") ||
    t.includes("registro de uso de poder em evento") ||
    t.includes("poderes em evento") ||
    t.includes("poder de evento") ||
    t.includes("poder evento") ||
    t.includes("evento poder") ||
    t.includes("sc pwr evento poder") ||
    t.includes("sc_evento_poder") ||
    t.includes("poder de evento setado")
  ) {
    return "poderes";
  }

  if (
    t.includes("registro de poder") ||
    t.includes("poder utilizado") ||
    t.includes("poderes utilizados")
  ) {
    return "registros_poderes";
  }

  if (
    t.includes("criar evento") ||
    t.includes("evento criado") ||
    t.includes("novo evento")
  ) {
    return "evt3";
  }

  if (
    t.includes("registro manual") ||
    t.includes("registro de evento") ||
    t.includes("evento aprovado")
  ) {
    return "manual";
  }

  return fallbackKind;
}

// ✅ NOVO: extrai usuário também de texto/log, não só embed
function getActorIdFromText(text) {
  const raw = String(text || "");

  const labeled =
    raw.match(/(?:solicitante|aberto por|criado por|registrado por|feito por|respons[aá]vel|autor|usu[aá]rio|user id|id do usu[aá]rio)\D{0,40}(\d{17,20})/i);

  if (labeled?.[1]) return labeled[1];

  return extractUserId(raw);
}


function makeTextFingerprint(text) {
  return norm(text)
    .replace(/<@!?\d+>/g, "")
    .replace(/\d{17,20}/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/discord(?:app)?\.com\/channels\/\S+/g, "")
    .replace(/\b\d{1,2}:\d{2}\b/g, "")
    .replace(/\b\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?\b/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function readJSONSafe(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8")) || fallback;
  } catch {
    return fallback;
  }
}

function scanBatePontoDisk(stats, seen) {
  if (!fs.existsSync(BP_MONTHLY_DIR)) return;

  const files = fs
    .readdirSync(BP_MONTHLY_DIR)
    .filter((f) => /^\d{4}-\d{2}\.json$/.test(f));

  for (const file of files) {
    const state = readJSONSafe(path.join(BP_MONTHLY_DIR, file), null);
    if (!state?.days || typeof state.days !== "object") continue;

    for (const [dayKey, arr] of Object.entries(state.days)) {
      for (const entry of Array.isArray(arr) ? arr : []) {
        const userId = entry.uid || entry.userId || entry.id;
        if (!userId) continue;

        const time = entry.time || entry.timeStr || entry.at || "sem-hora";
        const key = `bp:disk:${dayKey}:${userId}:${time}`;

        if (seen.has(key)) {
          stats.debug.duplicatesIgnored++;
          continue;
        }

        seen.add(key);

        addEvent(stats, {
          key,
          source: "bp_disk",
          kind: "bateponto",
          messageId: null,
          channelId: null,
          ts: new Date(`${dayKey}T12:00:00-03:00`).getTime(),
          userId,
        });
      }
    }
  }
}

function getFooterUserId(embed) {
  const footer = String(embed?.footer?.text || embed?.data?.footer?.text || "");
  const match = footer.match(/User ID:\s*(\d{17,20})/i);
  return match ? match[1] : null;
}

function getActorIdFromEventEmbed(embed) {
  // Prioridade: quem criou/solicitou/registrou.
  // Aprovador NÃO deve ganhar ponto.
  return (
    extractUserId(findFieldValue(embed, [
      "solicitante",
      "aberto por",
      "criado por",
      "registrado por",
      "feito por",
      "responsavel",
      "responsável",
      "autor",
      "usuario",
      "usuário",
    ])) ||
    getFooterUserId(embed) ||
    extractUserId(getEmbedText(embed))
  );
}

function emptyStats() {
  return {
    generatedAt: Date.now(),
    payments: [],
    events: [],
    byWeek: {},
    byMonth: {},
    users: {},
    debug: {
      scannedChannels: {},
      recoveredFromLogs: 0,
      duplicatesIgnored: 0,
    },
  };
}

function applyManualAdjustments(stats) {
  const adjData = loadAdjustments();
  const thisWeek = periodKeyFromDateSP(nowSP()).key;
  const weekAdj = adjData.byWeek[thisWeek] || {};

  for (const [uid, amount] of Object.entries(weekAdj)) {
    const penalty = Number(amount);
    if (penalty <= 0) continue;

    // 1. Afeta o Cubo Azul (Contador Global da Semana)
    const weekBucket = stats.byWeek[thisWeek];
    if (weekBucket) {
      weekBucket.paymentsApproved = Math.max(0, weekBucket.paymentsApproved - penalty);
    }

    // 2. Afeta o Ranking da Pessoa
    const user = stats.users[uid];
    if (user) {
      user.paymentsApproved = Math.max(0, user.paymentsApproved - penalty);
      user.pointsPayment = Math.max(0, user.pointsPayment - penalty);
      user.pointsTotal = Math.max(0, user.pointsTotal - penalty);
    }
  }
}

function ensureUser(stats, userId) {
  if (!userId) return null;

  stats.users[userId] ??= {
    userId,
    paymentsCreated: 0,
    paymentsApproved: 0,
    paymentsRejected: 0,
    paymentsRequested: 0,
eventsManual: 0,
eventsPoderes: 0,
eventsEvt3: 0,

eventsHall: 0,
eventsDiarios: 0,
eventsCronograma: 0,
eventsDmLideres: 0,
eventsBatePonto: 0,
eventsRegistrosPoderes: 0,
    pointsPayment: 0,
    pointsEvent: 0,
    pointsTotal: 0,
  };

  return stats.users[userId];
}

function ensureBucket(stats, periodKey, monthKey) {
  stats.byWeek[periodKey] ??= {
    paymentsCreated: 0,
    paymentsApproved: 0,
    paymentsRejected: 0,
    paymentsRequested: 0,
eventsManual: 0,
eventsPoderes: 0,
eventsEvt3: 0,

eventsHall: 0,
eventsDiarios: 0,
eventsCronograma: 0,
eventsDmLideres: 0,
eventsBatePonto: 0,
eventsRegistrosPoderes: 0,
  };

  stats.byMonth[monthKey] ??= {
    paymentsCreated: 0,
    paymentsApproved: 0,
    paymentsRejected: 0,
    paymentsRequested: 0, 
eventsManual: 0,
eventsPoderes: 0,
eventsEvt3: 0,

eventsHall: 0,
eventsDiarios: 0,
eventsCronograma: 0,
eventsDmLideres: 0,
eventsBatePonto: 0,
eventsRegistrosPoderes: 0,
  };

  return {
    week: stats.byWeek[periodKey],
    month: stats.byMonth[monthKey],
  };
}

function addPayment(stats, item) {
  const date =
    new Date(
      item.ts ||
      Date.now()
    );

  const period =
    periodKeyFromDateSP(
      date
    );

  const monthKey =
    monthKeyFromDateSP(
      date
    );

  // Só entra mês atual ou mês passado.
  if (
    !isDashboardMonthAllowed(
      monthKey
    )
  ) {
    return;
  }

  /*
   * O dashboard e o NPS precisam conhecer:
   *
   * • pagamentos aprovados;
   * • pagamentos reprovados;
   * • pagamentos solicitados e ainda aguardando decisão.
   *
   * O status solicitado será contabilizado como pendência,
   * mas não entregará ponto ao criador.
   */
  if (
    ![
      "approved",
      "rejected",
      "requested",
    ].includes(
      item.status
    )
  ) {
    return;
  }

  // Sem criador do registro, não é possível atribuir a atividade.
  if (!item.creatorId) {
    return;
  }

  const buckets =
    ensureBucket(
      stats,
      period.key,
      monthKey
    );

  /*
   * paymentsCreated representa registros que receberam
   * uma decisão final:
   *
   * • aprovado;
   * • reprovado.
   *
   * Solicitado permanece separado como pendência.
   */
  if (
    item.status ===
      "approved" ||
    item.status ===
      "rejected"
  ) {
    buckets.week.paymentsCreated++;
    buckets.month.paymentsCreated++;
  }

  if (
    item.status ===
    "approved"
  ) {
    buckets.week.paymentsApproved++;
    buckets.month.paymentsApproved++;
  }

  if (
    item.status ===
    "rejected"
  ) {
    buckets.week.paymentsRejected++;
    buckets.month.paymentsRejected++;
  }

  if (
    item.status ===
    "requested"
  ) {
    buckets.week.paymentsRequested++;
    buckets.month.paymentsRequested++;
  }

  const creator =
    ensureUser(
      stats,
      item.creatorId
    );

  if (creator) {
    if (
      item.status ===
        "approved" ||
      item.status ===
        "rejected"
    ) {
      creator.paymentsCreated++;
    }

    if (
      item.status ===
      "approved"
    ) {
      creator.paymentsApproved++;

      /*
       * O ponto continua sendo entregue somente
       * ao criador de um registro aprovado.
       */
      creator.pointsPayment +=
        1;
    }

    if (
      item.status ===
      "rejected"
    ) {
      creator.paymentsRejected++;

      /*
       * Reprovado aparece no diagnóstico,
       * mas não entrega ponto.
       */
    }

    if (
      item.status ===
      "requested"
    ) {
      creator.paymentsRequested++;

      /*
       * Solicitado representa uma pendência.
       * Ele não entrega ponto enquanto não houver aprovação.
       */
    }
  }

  stats.payments.push({
    ...item,

    periodKey:
      period.key,

    monthKey,
  });
}

function addEvent(stats, item) {
  const date = new Date(item.ts || Date.now());
  const period = periodKeyFromDateSP(date);
  const monthKey = monthKeyFromDateSP(date);

  // Eventos também só entram mês atual ou mês passado.
  if (!isDashboardMonthAllowed(monthKey)) return;

  // Sem usuário dono/solicitante/criador, não dá ponto.
  if (!item.userId) return;

  const buckets = ensureBucket(stats, period.key, monthKey);

const fieldByKind = {
  manual: "eventsManual",
  poderes: "eventsPoderes",
  evt3: "eventsEvt3",

  hall: "eventsHall",
  diarios: "eventsDiarios",
  cronograma: "eventsCronograma",
  lideres: "eventsDmLideres",
  bateponto: "eventsBatePonto",
  registros_poderes: "eventsRegistrosPoderes",
};

const field = fieldByKind[item.kind];

if (field) {
  buckets.week[field]++;
  buckets.month[field]++;
}

  const user = ensureUser(stats, item.userId);

  if (user) {
if (field) user[field]++;

    // Todo evento válido dá 1 ponto para quem criou/solicitou/registrou.
    user.pointsEvent += 1;
  }

  stats.events.push({
    ...item,
    periodKey: period.key,
    monthKey,
  });
}

async function fetchChannelMessages(client, channelId, pages = SCAN_CONFIG.pagesPerChannel) {
  const channel = await client.channels.fetch(channelId).catch((err) => {
    console.warn("[SC_PAY_EVT_DASH_V2] falha ao buscar canal:", channelId, err?.message || err);
    return null;
  });

  if (!channel || !channel.isTextBased()) {
    console.warn("[SC_PAY_EVT_DASH_V2] canal inválido ou sem acesso:", channelId);
    return [];
  }

  const out = [];
  let before = null;

  for (let page = 0; page < pages; page++) {
    const options = { limit: SCAN_CONFIG.fetchLimit };
    if (before) options.before = before;

    const batch = await channel.messages.fetch(options).catch((err) => {
      console.warn("[SC_PAY_EVT_DASH_V2] falha ao buscar mensagens:", channelId, err?.message || err);
      return null;
    });

    if (!batch || batch.size === 0) break;

    const arr = [...batch.values()];
    out.push(...arr);

    before = arr[arr.length - 1]?.id;
    const oldest = arr[arr.length - 1];

    if (oldest?.createdTimestamp) {
      const age = Date.now() - oldest.createdTimestamp;
      if (age > SCAN_CONFIG.maxAgeDays * 24 * 60 * 60 * 1000) break;
    }
  }

  return out;
}
async function fetchLinkedMessage(client, link) {
  if (!link?.channelId || !link?.messageId) return null;

  const timeout = new Promise((resolve) => {
    setTimeout(() => resolve(null), SCAN_CONFIG.linkedFetchTimeoutMs);
  });

  const task = (async () => {
    const channel = await client.channels.fetch(link.channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return null;

    return await channel.messages.fetch(link.messageId).catch(() => null);
  })();

  return await Promise.race([task, timeout]);
}

async function scanPayments(client, stats, seen) {
  const payMessages = await fetchChannelMessages(client, PAY_CHANNEL_ID);
  stats.debug.scannedChannels[PAY_CHANNEL_ID] = payMessages.length;

  for (const msg of payMessages) {
    for (const embed of msg.embeds || []) {
      if (!isPaymentEmbed(embed)) continue;

      const key = `paymsg:${msg.id}`;
      if (seen.has(key)) {
        stats.debug.duplicatesIgnored++;
        continue;
      }

      seen.add(key);

      const status = getPaymentStatus(embed);
      const date = getPaymentDate(embed, msg.createdTimestamp);
      const creatorId = getPaymentCreatorId(embed);
      const decisionUserId = getPaymentDecisionUserId(embed);

      addPayment(stats, {
        key,
        source: "payment_channel",
        messageId: msg.id,
        channelId: msg.channelId,
        ts: date.getTime(),
        status,
        creatorId,
        decisionUserId,
      });
    }
  }
}

async function scanPaymentLogs(client, stats, seen) {
  const logMessages = await fetchChannelMessages(client, PAY_LOG_CHANNEL_ID);
  stats.debug.scannedChannels[PAY_LOG_CHANNEL_ID] = logMessages.length;

  let linkedRecoveredAttempts = 0;
  let processedLogs = 0;

  for (const msg of logMessages) {
    processedLogs++;

    const allText = [
      msg.content || "",
      ...(msg.embeds || []).map(getEmbedText),
    ].join("\n");

    const link = extractFirstDiscordLink(allText);

    // Logs servem APENAS para recuperar a mensagem original do registro.
    // O embed do log sozinho NÃO conta como pagamento.
    if (!link) continue;

    if (linkedRecoveredAttempts >= SCAN_CONFIG.maxLinkedLogsToRecover) continue;

    linkedRecoveredAttempts++;

    const linked = await fetchLinkedMessage(client, link);
    const embed = linked?.embeds?.[0];

    if (!embed || !isPaymentEmbed(embed)) continue;

    const key = `paymsg:${linked.id}`;

    if (seen.has(key)) {
      stats.debug.duplicatesIgnored++;
      continue;
    }

    seen.add(key);
    stats.debug.recoveredFromLogs++;

    const status = getPaymentStatus(embed);

    // Só aprovado/reprovado entra.
    if (!["approved", "rejected"].includes(status)) continue;

    const date = getPaymentDate(embed, linked.createdTimestamp);
    const creatorId = getPaymentCreatorId(embed);
    const decisionUserId = getPaymentDecisionUserId(embed);

    addPayment(stats, {
      key,
      source: "payment_log_link",
      messageId: linked.id,
      channelId: linked.channelId,
      logMessageId: msg.id,
      ts: date.getTime(),
      status,
      creatorId,
      decisionUserId,
    });
  }
}

async function scanEventChannel(client, stats, seen, channelId, kind, matcher) {
  const messages = await fetchChannelMessages(client, channelId);
  stats.debug.scannedChannels[channelId] = messages.length;

  for (const msg of messages) {
    for (const embed of msg.embeds || []) {
      if (!matcher(embed)) continue;

      const key = `event:${kind}:${msg.id}`;
      if (seen.has(key)) {
        stats.debug.duplicatesIgnored++;
        continue;
      }

      seen.add(key);

      const userId = getActorIdFromEventEmbed(embed);
      const date = dateFromBR(getEmbedText(embed), msg.createdTimestamp);

      addEvent(stats, {
        key,
        source: channelId,
        kind,
        messageId: msg.id,
        channelId: msg.channelId,
        ts: date.getTime(),
        userId,
      });
    }
  }
}

// ✅ NOVO: scan completo de logs/canais com classificação automática
async function scanAuditChannel(client, stats, seen, channelId, fallbackKind = null, options = {}) {
  const {
    onlyApproved = false,
    allowBotAuthorFallback = false,
    dedupeByContent = false,
  } = options;

  const messages = await fetchChannelMessages(client, channelId);
  stats.debug.scannedChannels[channelId] = messages.length;

  for (const msg of messages) {
    const fullText = getMessageFullText(msg);
    const kind = inferEventKindFromText(fullText, fallbackKind);

    if (!kind) continue;

    if (
      kind === "poderes" &&
      PODERES_EVENTOS_CHANNEL_IDS.includes(String(channelId)) &&
      isNoPowerEventRegisterText(fullText)
    ) {
      continue;
    }

    if (onlyApproved && !isApprovedText(fullText)) continue;

    const userId =
      getActorIdFromText(fullText) ||
      getActorIdFromEventEmbed(msg.embeds?.[0]) ||
      (!msg.author?.bot || allowBotAuthorFallback ? msg.author?.id : null);

    if (!userId) continue;

    const date = dateFromBR(fullText, msg.createdTimestamp);
    const period = periodKeyFromDateSP(date).key;

    const key = dedupeByContent
      ? `audit:${channelId}:${kind}:${userId}:${period}:${makeTextFingerprint(fullText)}`
      : `audit:${channelId}:${kind}:${msg.id}`;

    if (seen.has(key)) {
      stats.debug.duplicatesIgnored++;
      continue;
    }

    seen.add(key);

    addEvent(stats, {
      key,
      source: channelId,
      kind,
      messageId: msg.id,
      channelId: msg.channelId,
      ts: date.getTime(),
      userId,
    });
  }
}
async function scanLideresUnique(client, stats, seen) {
  const messages = await fetchChannelMessages(client, LIDERES_LOG_CHANNEL_ID);
  stats.debug.scannedChannels[LIDERES_LOG_CHANNEL_ID] = messages.length;

  for (const msg of messages) {
    for (const embed of msg.embeds || []) {
      const text = getEmbedText(embed);
      const t = norm(text);

      // ✅ só conta o resumo principal, não partes de entrega/DM
      if (!t.includes("auditoria completa") || !t.includes("convite enviado")) continue;

      const userId =
        extractUserId(findFieldValue(embed, ["enviado por"])) ||
        getActorIdFromText(text);

      if (!userId) continue;

      const titulo = findFieldValue(embed, ["titulo enviado", "título enviado"]);
      const data = findFieldValue(embed, ["data enviada"]);
      const conteudo = findFieldValue(embed, ["conteudo enviado", "conteúdo enviado"]);

      const date = dateFromBR(`${data}\n${text}`, msg.createdTimestamp);
      const period = periodKeyFromDateSP(date).key;

      // ✅ mesmo conteúdo na mesma semana = 1 ponto só
      const key = `lideres:unique:${userId}:${period}:${makeTextFingerprint(`${titulo}\n${data}\n${conteudo}`)}`;

      if (seen.has(key)) {
        stats.debug.duplicatesIgnored++;
        continue;
      }

      seen.add(key);

      addEvent(stats, {
        key,
        source: LIDERES_LOG_CHANNEL_ID,
        kind: "lideres",
        messageId: msg.id,
        channelId: msg.channelId,
        ts: date.getTime(),
        userId,
      });
    }
  }
}
async function collectDashboardData(client, force = false) {
  if (!force && CACHE.payload && Date.now() - CACHE.at < CACHE_TTL_MS) {
    return CACHE.payload;
  }

  const stats = emptyStats();
  const seen = new Set();

  await scanPayments(client, stats, seen);
  await scanPaymentLogs(client, stats, seen);

  // ✅ Canais oficiais
  await scanEventChannel(client, stats, seen, REGISTRO_EVENTO_CHANNEL_ID, "manual", isEventManualEmbed);
  await scanEventChannel(client, stats, seen, CH_PODERES_ID, "registros_poderes", isPoderesEmbed);
  await scanEventChannel(client, stats, seen, EVT3_EVENT_CHANNEL_ID, "evt3", isEventManualEmbed);

  // ✅ Canal de aprovação: só pontua aprovado e classifica Hall/Diários/Cronograma corretamente
  await scanAuditChannel(client, stats, seen, CRONOGRAMA_LOGS_CHANNEL_ID, "cronograma", {
    onlyApproved: true,
  });

  await scanAuditChannel(client, stats, seen, CRONOGRAMA_AUDIT_LOG_CHANNEL_ID, "cronograma", {
    onlyApproved: true,
  });

  // ✅ DM líderes: conta apenas o resumo único do envio, nunca cada DM individual
  await scanLideresUnique(client, stats, seen);

  // ✅ Bate ponto: fonte oficial em disco
  scanBatePontoDisk(stats, seen);

  // ✅ Bate ponto: fallback pelo canal calendário/log
  await scanAuditChannel(client, stats, seen, BATEPONTO_CALENDAR_LOG_CHANNEL_ID, "bateponto", {
    onlyApproved: false,
    dedupeByContent: true,
  });

  // ✅ Poderes em evento: lê todos os canais/logs oficiais e futuros
  for (const channelId of PODERES_EVENTOS_CHANNEL_IDS) {
    await scanAuditChannel(client, stats, seen, channelId, "poderes", {
      onlyApproved: false,
    });
  }
  applyPaymentDecisions(stats, seen);
  applyCronogramaApprovals(stats, seen);
  // ✅ Pontuação agora vem dos canais/logs oficiais.
  // O dashEmit apenas força atualização do dashboard, sem salvar ponto duplicado.

  for (const user of Object.values(stats.users)) {
    user.pointsTotal = Number(user.pointsPayment || 0) + Number(user.pointsEvent || 0);
  }

  CACHE = {
    at: Date.now(),
    payload: stats,
  };

  return stats;
}

function percent(current, previous) {
  if (!previous) return current ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

function diffText(current, previous) {
  const diff = current - previous;
  const p = percent(current, previous);

  if (diff > 0) return `🟢 +${diff} (${p.toFixed(1)}%)`;
  if (diff < 0) return `🔴 ${diff} (${p.toFixed(1)}%)`;
  return `⚪ 0 (0.0%)`;
}

function progressBar(value, limit = PAY_PERIOD_LIMIT, size = 14) {
  const safeValue = Math.max(0, Number(value || 0));
  const ratio = Math.min(1, safeValue / limit);
  const filled = Math.round(ratio * size);
  const empty = Math.max(0, size - filled);

  return "▰".repeat(filled) + "▱".repeat(empty);
}

function medalha(i) {
  return i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "▫️";
}

function rankingSemana(stats, periodKey, limit = 3) {
  const mapa = new Map();

  for (const p of stats.payments || []) {
    if (p.periodKey !== periodKey) continue;
    if (p.status !== "approved") continue;
    if (!p.creatorId) continue;

    mapa.set(p.creatorId, (mapa.get(p.creatorId) || 0) + 1);
  }

  for (const e of stats.events || []) {
    if (e.periodKey !== periodKey) continue;
    if (!e.userId) continue;

    mapa.set(e.userId, (mapa.get(e.userId) || 0) + 1);
  }

  const lista = [...mapa.entries()]
    .map(([userId, pontos]) => ({ userId, pontos }))
    .sort((a, b) => b.pontos - a.pontos)
    .slice(0, limit);

  if (!lista.length) return "_Sem pontuação nesta semana._";

  return lista
    .map((u, i) => `${medalha(i)} <@${u.userId}> — **${u.pontos} pontos**`)
    .join("\n");
}

function getRegistrosTotal(bucket = {}) {
  return (
    Number(bucket.eventsManual || 0) +
    Number(bucket.eventsPoderes || 0) +
    Number(bucket.eventsEvt3 || 0) +
    Number(bucket.eventsHall || 0) +
    Number(bucket.eventsDiarios || 0) +
    Number(bucket.eventsCronograma || 0) +
    Number(bucket.eventsDmLideres || 0) +
    Number(bucket.eventsBatePonto || 0) +
    Number(bucket.eventsRegistrosPoderes || 0)
  );
}

function getPontosPorFonte(bucket = {}) {
  const pagamentos = Number(bucket.paymentsApproved || 0);
  const hall = Number(bucket.eventsHall || 0);
  const diarios = Number(bucket.eventsDiarios || 0);
  const cronograma = Number(bucket.eventsCronograma || 0);
  const dmLideres = Number(bucket.eventsDmLideres || 0);
  const batePonto = Number(bucket.eventsBatePonto || 0);
  const criarEvento = Number(bucket.eventsEvt3 || 0);
  const poderesEventos = Number(bucket.eventsPoderes || 0);
  const registrosPoderes = Number(bucket.eventsRegistrosPoderes || 0);
  const eventosManuais = Number(bucket.eventsManual || 0);

  const registrosTotal =
    hall +
    diarios +
    cronograma +
    dmLideres +
    batePonto +
    criarEvento +
    poderesEventos +
    registrosPoderes +
    eventosManuais;

  const totalGeral = pagamentos + registrosTotal;

  return {
    pagamentos,
    hall,
    diarios,
    cronograma,
    dmLideres,
    batePonto,
    criarEvento,
    poderesEventos,
    registrosPoderes,
    eventosManuais,
    registrosTotal,
    totalGeral,
  };
}
function getLastWeekKeysFromCurrent(currentWeekKey, amount = 4) {
  const keys = [];

  for (let i = amount - 1; i >= 0; i--) {
    const d = addDaysUTC(new Date(`${currentWeekKey}T12:00:00-03:00`), -7 * i);
    keys.push(periodKeyFromDateSP(d).key);
  }

  return keys;
}

function sumBucketsByWeekKeys(stats, keys = []) {
  const total = {
    paymentsApproved: 0,
    paymentsRejected: 0,
    registros: 0,
    geral: 0,
  };

  for (const key of keys) {
    const b = stats.byWeek[key] || {};
    const registros = getRegistrosTotal(b);

    total.paymentsApproved += Number(b.paymentsApproved || 0);
    total.paymentsRejected += Number(b.paymentsRejected || 0);
    total.registros += registros;
    total.geral += Number(b.paymentsApproved || 0) + registros;
  }

  return total;
}
function makeChartUrl(stats) {
  const keys = Object.keys(stats.byWeek || {}).sort().slice(-4);

  const labels = [];
  const pagamentos = [];
  const eventos = [];

  for (const key of keys) {
    const b = stats.byWeek[key] || {};
    const label = periodKeyFromDateSP(new Date(`${key}T12:00:00-03:00`)).label;

    labels.push(label);
    pagamentos.push(Number(b.paymentsApproved || 0));
    eventos.push(getRegistrosTotal(b));
  }

  const config = {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Pagamentos PAGO",
          data: pagamentos,
          backgroundColor: "#5865F2",
        },
        {
          label: "Registros gerais",
          data: eventos,
          backgroundColor: "#F59E0B",
        },
      ],
    },
    options: {
      title: {
        display: true,
        text: "Histórico — Últimos 4 períodos (Dom → Sáb)",
        fontSize: 22,
      },
      legend: {
        display: true,
        position: "top",
      },
      plugins: {
        datalabels: {
          anchor: "end",
          align: "top",
          color: "#111111",
          font: {
            weight: "bold",
            size: 14,
          },
        },
      },
      scales: {
        yAxes: [
          {
            ticks: {
              beginAtZero: true,
              precision: 0,
            },
          },
        ],
      },
    },
  };

  return `https://quickchart.io/chart?width=1000&height=420&backgroundColor=white&c=${encodeURIComponent(JSON.stringify(config))}`;
}

function makeDashboardEmbed(stats) {
  const now = nowSP();
  const thisWeek = periodKeyFromDateSP(now);
  const lastWeekKey = periodKeyFromDateSP(addDaysUTC(new Date(`${thisWeek.key}T12:00:00-03:00`), -7)).key;
  const monthKey = monthKeyFromDateSP(now);
  const lastMonthKey = previousMonthKeySP(now);

  const chartWeekKeys = getLastWeekKeysFromCurrent(thisWeek.key, 4);
  const chartTotals = sumBucketsByWeekKeys(stats, chartWeekKeys);
  const w = stats.byWeek[thisWeek.key] || {};
  const last = stats.byWeek[lastWeekKey] || {};
  const m = stats.byMonth[monthKey] || {};
  const lastMonth = stats.byMonth[lastMonthKey] || {};
  const payApproved = Number(w.paymentsApproved || 0);
  const payRejected = Number(w.paymentsRejected || 0);

  const eventsTotal = getRegistrosTotal(w);

  const lastPayApproved = Number(last.paymentsApproved || 0);
  const lastEventsTotal = getRegistrosTotal(last);

  const monthEvents = getRegistrosTotal(m);

  const monthPoints = Number(m.paymentsApproved || 0) + monthEvents;

  const weekPointsBySource = getPontosPorFonte(w);
  const monthPointsBySource = getPontosPorFonte(m);

  const status =
    payApproved >= PAY_PERIOD_LIMIT
      ? "🚨 Limite"
      : payApproved >= PAY_PERIOD_GOAL
        ? "🟢 Meta"
        : payApproved >= PAY_PERIOD_OK
          ? "🟡 OK"
          : "🔴 Abaixo";

  const color =
    payApproved >= PAY_PERIOD_GOAL
      ? 0x22c55e
      : payApproved >= PAY_PERIOD_OK
        ? 0xf59e0b
        : 0xef4444;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle("📊 Dashboard — Registros SantaCreators")
    .setDescription(
      [
        `**Período semanal:** \`${thisWeek.label}\``,
        `**Mês atual:** \`${labelFromMonthKey(monthKey)}\``,
        `**Atualizado:** <t:${Math.floor(Date.now() / 1000)}:R>`,
        "",
        `**Status:** ${status}`,
      ].join("\n")
    )
    .addFields(
      {
        name: "📌 Semana atual",
        value: [
          `✅ Pagamentos PAGO: **${payApproved}**`,
          `❌ Reprovados: **${payRejected}**`,
          `🟠 Registros gerais: **${eventsTotal}**`,
          `📦 Pontos válidos: **${payApproved + eventsTotal}**`,
        ].join("\n"),
        inline: true,
      },
      {
        name: "🧮 Pontos por fonte — Semana",
        value: [
          `✅ Pagamentos PAGO: **${weekPointsBySource.pagamentos}**`,
          `🏆 Hall da Fama: **${weekPointsBySource.hall}**`,
          `📆 Eventos diários: **${weekPointsBySource.diarios}**`,
          `🗓️ Cronograma: **${weekPointsBySource.cronograma}**`,
          `📩 DM líderes: **${weekPointsBySource.dmLideres}**`,
          `🕒 Bate ponto: **${weekPointsBySource.batePonto}**`,
          `🧩 Criar evento: **${weekPointsBySource.criarEvento}**`,
          `⚡ Poderes eventos: **${weekPointsBySource.poderesEventos}**`,
          `📋 Registros de poderes: **${weekPointsBySource.registrosPoderes}**`,
          `📝 Eventos manuais: **${weekPointsBySource.eventosManuais}**`,
          "",
          `🟠 Total registros: **${weekPointsBySource.registrosTotal}**`,
          `📦 Total geral: **${weekPointsBySource.totalGeral}**`,
        ].join("\n"),
        inline: false,
      },
      {
        name: "📈 Comparativo",
        value: [
          `💵 Pagamentos: **${lastPayApproved} → ${payApproved}** ${diffText(payApproved, lastPayApproved)}`,
          `🟠 Registros gerais: **${lastEventsTotal} → ${eventsTotal}** ${diffText(eventsTotal, lastEventsTotal)}`,
        ].join("\n"),
        inline: true,
      },
      {
        name: "🎯 Meta de pagamentos",
        value: [
          `🟡 OK: **${PAY_PERIOD_OK}** • 🟢 Meta: **${PAY_PERIOD_GOAL}** • 🚨 Limite: **${PAY_PERIOD_LIMIT}**`,
          `\`${progressBar(payApproved, PAY_PERIOD_LIMIT, 18)}\``,
          `Progresso: **${payApproved}/${PAY_PERIOD_LIMIT}**`,
        ].join("\n"),
        inline: false,
      },
      {
        name: "📦 Totais do mês",
        value: [
          `✅ Pagamentos PAGO: **${Number(m.paymentsApproved || 0)}**`,
          `❌ Reprovados: **${Number(m.paymentsRejected || 0)}**`,
          "",
`🏆 Hall da Fama: **${Number(m.eventsHall || 0)}**`,
`📆 Eventos diários: **${Number(m.eventsDiarios || 0)}**`,
`🗓️ Cronograma: **${Number(m.eventsCronograma || 0)}**`,
`📩 DM líderes: **${Number(m.eventsDmLideres || 0)}**`,
`🕒 Bate ponto: **${Number(m.eventsBatePonto || 0)}**`,
`🧩 Criar evento: **${Number(m.eventsEvt3 || 0)}**`,
`⚡ Poderes eventos: **${Number(m.eventsPoderes || 0)}**`,
`📋 Registros de poderes: **${Number(m.eventsRegistrosPoderes || 0)}**`,
          "",
          `🟠 Total registros do mês: **${monthPointsBySource.registrosTotal}**`,
          `📦 Total geral do mês: **${monthPointsBySource.totalGeral}**`,
        ].join("\n"),
        inline: false,
      },
      {
        name: "📊 Resumo do gráfico — últimas 4 semanas",
        value: [
          `✅ Pagamentos no gráfico: **${chartTotals.paymentsApproved}**`,
          `❌ Reprovados no gráfico: **${chartTotals.paymentsRejected}**`,
          `🟠 Registros no gráfico: **${chartTotals.registros}**`,
          `📦 Total geral no gráfico: **${chartTotals.geral}**`,
          "",
          `📅 Semana passada: **${lastPayApproved} pagamentos**`,
          `📅 Semana atual: **${payApproved} pagamentos** ${diffText(payApproved, lastPayApproved)}`,
        ].join("\n"),
        inline: false,
      },
      {
        name: "🏆 Top 3 — Semana atual",
        value: rankingSemana(stats, thisWeek.key, 3),
        inline: false,
      },
      {
        name: "🏅 Destaque anterior",
        value: rankingSemana(stats, lastWeekKey, 1),
        inline: false,
      },
      {
        name: "🧪 Auditoria",
        value: [
          `Pagamentos lidos: **${stats.debug.scannedChannels[PAY_CHANNEL_ID] || 0} msgs**`,
          `Logs lidos: **${stats.debug.scannedChannels[PAY_LOG_CHANNEL_ID] || 0} msgs**`,
          `Recuperados por logs: **${stats.debug.recoveredFromLogs || 0}**`,
        ].join("\n"),
        inline: false,
      }
    )
    .setImage(makeChartUrl(stats))
.setFooter({
  text: `${DASH_MARKER} • Azul = pagamentos PAGO • Laranja = registros gerais • Semana Dom→Sáb`,
})
    .setTimestamp(new Date());

  return embed;
}

function makeDashboardRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("PEV_FORCE_REFRESH")
      .setLabel("🔄 Atualizar agora")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("PEV_RECREATE")
      .setLabel("🧹 Recriar painel")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("PEV_DEBUG")
      .setLabel("🧪 Debug")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("PEV_ADJUST_OPEN")
      .setLabel("✏️ Ajuste manual")
      .setStyle(ButtonStyle.Success)
  );
}

function hasPermission(memberOrInteraction, userId = null) {
  const member = memberOrInteraction?.member || memberOrInteraction;
  const id = userId || memberOrInteraction?.user?.id || member?.id;

  if (ALLOWED_MANAGE_IDS.includes(id)) return true;

  return member?.roles?.cache?.some((r) => ALLOWED_MANAGE_ROLES.includes(r.id)) || false;
}

async function findExistingDashboard(channel, client) {
  const state = loadState();

  if (state.dashboardMsgId) {
    const msg = await channel.messages
      .fetch(state.dashboardMsgId)
      .catch(() => null);

    /*
     * Só retorna a mensagem salva se ela realmente pertencer
     * ao bot atual. Uma mensagem do bot anterior não pode ser editada.
     */
    if (msg && msg.author?.id === client.user.id) {
      return msg;
    }
  }

  const messages = await channel.messages
    .fetch({ limit: 100 })
    .catch(() => null);

  if (!messages) return null;

  return (
    [...messages.values()]
      .filter((m) => m.author?.id === client.user.id)
      .filter((m) => m.embeds?.length)
      .find((m) =>
        String(m.embeds[0]?.footer?.text || "").includes(DASH_MARKER)
      ) || null
  );
}

async function limparDashboardsDoBotAnterior(channel, client) {
  try {
    const mensagens = await channel.messages
      .fetch({ limit: 100 })
      .catch(() => null);

    if (!mensagens) return;

    const paineisLegados = mensagens.filter((mensagem) => {
      /*
       * Mantém mensagens criadas pelo bot atual.
       * Remove somente painéis pertencentes ao bot anterior.
       */
      if (mensagem.author?.id === client.user.id) return false;
      if (!mensagem.embeds?.length) return false;

      const footer = String(
        mensagem.embeds?.[0]?.footer?.text || ""
      );

      return footer.includes(DASH_MARKER);
    });

    for (const [, painel] of paineisLegados) {
      await painel.delete().catch((erro) => {
        console.error(
          `[SC_PAY_EVT_DASH_V2] Não foi possível remover painel legado ${painel.id}:`,
          erro?.message || erro
        );
      });
    }
  } catch (erro) {
    console.error(
      "[SC_PAY_EVT_DASH_V2] Erro ao limpar painéis do bot anterior:",
      erro?.message || erro
    );
  }
}

async function renderDashboard(client, reason = "manual", options = {}) {
  const { force = false, recreate = false } = options;

  if (LOCK && Date.now() - LOCK_TS > LOCK_STUCK_MS) {
    console.warn("[SC_PAY_EVT_DASH_V2] lock travado resetado");
    LOCK = false;
    LOCK_TS = 0;
  }

  if (LOCK) {
    return {
      ok: false,
      message: "Já existe atualização em andamento.",
    };
  }

  LOCK = true;
  LOCK_TS = Date.now();

  try {
const channel = await client.channels.fetch(DASH_CHANNEL_ID).catch(() => null);
if (!channel || !channel.isTextBased()) {
  throw new Error(`Canal do dashboard não encontrado: ${DASH_CHANNEL_ID}`);
}

/*
 * Remove Dashboard deixado pela aplicação anterior.
 *
 * O bot atual não consegue editar mensagens do bot antigo.
 * Portanto, durante o boot ou atualização, removemos o painel legado
 * pelo marcador e deixamos o bot atual publicar uma nova mensagem.
 */
await limparDashboardsDoBotAnterior(channel, client);

if (recreate) {
  // ✅ APAGA FÍSICAMENTE A MENSAGEM ANTERIOR PARA NÃO DUPLICAR
  const oldMsg = await findExistingDashboard(channel, client);
      if (oldMsg) await oldMsg.delete().catch(() => null);

      saveState({
        dashboardMsgId: null,
        lastFingerprint: "",
        lastUpdatedAt: null,
      });
    }

    const stats = await collectDashboardData(client, force);
    // ✅ APLICA OS AJUSTES ANTES DE GERAR O EMBED
    applyManualAdjustments(stats);

    const embed = makeDashboardEmbed(stats);
    const row = makeDashboardRow();

    const fingerprint = JSON.stringify({
      week: stats.byWeek,
      month: stats.byMonth,
      users: stats.users,
    });

    const state = loadState();
    let msg = recreate ? null : await findExistingDashboard(channel, client);

    if (msg) {
      await msg.edit({
        embeds: [embed],
        components: [row],
      });
    } else {
      msg = await channel.send({
        embeds: [embed],
        components: [row],
      });
    }

    saveState({
      dashboardMsgId: msg.id,
      lastFingerprint: fingerprint,
      lastUpdatedAt: Date.now(),
      lastReason: reason,
    });

    return {
      ok: true,
      stats,
      messageId: msg.id,
    };
  } catch (err) {
    console.error("[SC_PAY_EVT_DASH_V2] erro:", err);
    return {
      ok: false,
      error: err?.message || String(err),
    };
  } finally {
    LOCK = false;
    LOCK_TS = 0;
  }
}

function scheduleUpdate(client, reason) {
  setTimeout(() => {
    renderDashboard(client, reason, { force: true }).catch(() => null);
  }, 2500);
}

async function sendDebug(interaction, client) {
  const stats = await collectDashboardData(client, true);

  const currentWeek = periodKeyFromDateSP(nowSP()).key;
  const currentMonth = monthKeyFromDateSP(nowSP());

  const w = stats.byWeek[currentWeek] || {};
  const m = stats.byMonth[currentMonth] || {};

  await interaction.editReply({
    content: [
      "🧪 **Debug do Dashboard SantaCreators**",
      "",
      `📌 Semana: \`${currentWeek}\``,
      `📅 Mês: \`${currentMonth}\``,
      "",
      `💵 Pagamentos lidos: **${stats.payments.length}**`,
      `🎉 Eventos lidos: **${stats.events.length}**`,
      "",
      `✅ Aprovados semana: **${Number(w.paymentsApproved || 0)}**`,
      `📦 Criados semana: **${Number(w.paymentsCreated || 0)}**`,
      `🟠 Registros gerais semana: **${getRegistrosTotal(w)}**`,
      `📦 Total geral semana: **${getPontosPorFonte(w).totalGeral}**`,
      "",
      `🏆 Hall semana: **${Number(w.eventsHall || 0)}**`,
      `📆 Diários semana: **${Number(w.eventsDiarios || 0)}**`,
      `🗓️ Cronograma semana: **${Number(w.eventsCronograma || 0)}**`,
      `📩 DM líderes semana: **${Number(w.eventsDmLideres || 0)}**`,
      `🕒 Bate ponto semana: **${Number(w.eventsBatePonto || 0)}**`,
      `🧩 Criar evento semana: **${Number(w.eventsEvt3 || 0)}**`,
      `⚡ Poderes semana: **${Number(w.eventsPoderes || 0)}**`,
      `📋 Registros poderes semana: **${Number(w.eventsRegistrosPoderes || 0)}**`,
      `📝 Eventos manuais semana: **${Number(w.eventsManual || 0)}**`,
      "",
      `📦 Criados mês: **${Number(m.paymentsCreated || 0)}**`,
      `✅ Aprovados mês: **${Number(m.paymentsApproved || 0)}**`,
      "",
      `Canal pagamentos: **${stats.debug.scannedChannels[PAY_CHANNEL_ID] || 0} msgs**`,
      `Canal logs pagamentos: **${stats.debug.scannedChannels[PAY_LOG_CHANNEL_ID] || 0} msgs**`,
      `Canal aprovação geral: **${stats.debug.scannedChannels[CRONOGRAMA_LOGS_CHANNEL_ID] || 0} msgs**`,
      `Logs líderes: **não escaneado para pontuação**`,
      `Bate ponto calendário: **${stats.debug.scannedChannels[BATEPONTO_CALENDAR_LOG_CHANNEL_ID] || 0} msgs**`,
      `Poderes eventos: **${PODERES_EVENTOS_CHANNEL_IDS.map((id) => `${stats.debug.scannedChannels[id] || 0}`).join(" + ")} msgs**`,
      `Recuperados por logs: **${stats.debug.recoveredFromLogs || 0}**`,
      `Duplicados ignorados: **${stats.debug.duplicatesIgnored || 0}**`,
    ].join("\n"),
  }).catch(() => {});
}

// =========================
// EXPORTS
// =========================

/**
 * Entrega ao NPS Operacional uma cópia dos dados consolidados
 * pelas fontes oficiais do dashboard.
 *
 * Esta função não cria listeners, não envia mensagens e não
 * altera o painel. Ela apenas executa a coleta já existente.
 */
export async function collectPayEvtOperationalData(
  client,
  force = false
) {
  if (!client) {
    return {
      generatedAt:
        Date.now(),

      payments:
        [],

      events:
        [],

      byWeek:
        {},

      byMonth:
        {},

      users:
        {},

      debug: {
        scannedChannels:
          {},

        recoveredFromLogs:
          0,

        duplicatesIgnored:
          0,
      },
    };
  }

  return collectDashboardData(
    client,
    force
  );
}

export async function payEvtDashOnReady(client) {
  if (client.__SC_PAY_EVT_DASH_V2_READY__) return;
  client.__SC_PAY_EVT_DASH_V2_READY__ = true;

dashOn("cronograma:aprovado", (payload = {}) => {
  saveCronogramaApproval(payload);
  scheduleUpdate(client, "dashOn:cronograma");
});

  dashOn("halldafama:aprovado", () => {
    scheduleUpdate(client, "dashOn:halldafama");
  });

  dashOn("eventosdiarios:aprovado", () => {
    scheduleUpdate(client, "dashOn:eventosdiarios");
  });

  dashOn("lideres:convite_enviado", () => {
    scheduleUpdate(client, "dashOn:lideres");
  });

  dashOn("bp:punch", () => {
    scheduleUpdate(client, "dashOn:bateponto");
  });

  dashOn("poderes:registrado", () => {
    scheduleUpdate(client, "dashOn:poderes");
  });

  dashOn("eventopoder:registrado", () => {
    scheduleUpdate(client, "dashOn:eventopoder");
  });

  dashOn("pagamento:criado", () => scheduleUpdate(client, "dashOn:pagamento:criado"));
dashOn("pagamento:pago", (payload = {}) => {
  savePaymentDecision("pago", payload);
  scheduleUpdate(client, "dashOn:pagamento:pago");
});

dashOn("pagamento:solicitado", (payload = {}) => {
  savePaymentDecision("solicitado", payload);
  scheduleUpdate(client, "dashOn:pagamento:solicitado");
});

dashOn("pagamento:reprovado", (payload = {}) => {
  savePaymentDecision("reprovado", payload);
  scheduleUpdate(client, "dashOn:pagamento:reprovado");
});
  dashOn("pagamento:status", () => scheduleUpdate(client, "dashOn:pagamento:status"));

  await renderDashboard(client, "ready", { force: true });

  // ✅ Sem atualização automática por tempo.
  // O dashboard só atualiza quando algum sistema emitir dashEmit(...)
  // ou quando alguém clicar no botão "Atualizar agora".
}

export async function payEvtDashHandleMessage(message, client) {
  if (!message?.guild) return false;

  const autoUpdateChannels = new Set([
    PAY_CHANNEL_ID,
    PAY_LOG_CHANNEL_ID,
    CH_PODERES_ID,
    EVT3_EVENT_CHANNEL_ID,
    REGISTRO_EVENTO_CHANNEL_ID,
    CRONOGRAMA_LOGS_CHANNEL_ID,

    // ✅ NOVO: qualquer movimentação nesses logs atualiza o dashboard
    LIDERES_LOG_CHANNEL_ID,
    CRONOGRAMA_AUDIT_LOG_CHANNEL_ID,
    BATEPONTO_CALENDAR_LOG_CHANNEL_ID,
    ...BATEPONTO_CHANNEL_IDS,
    ...PODERES_EVENTOS_CHANNEL_IDS,
  ]);

  if (autoUpdateChannels.has(message.channelId)) {
    scheduleUpdate(client, `message:${message.channelId}`);
  }

  if (message.author?.bot) return false;

  const content = String(message.content || "").trim().toLowerCase();

const commands = new Set([
  "!pevdash",
  "!pevdashrefresh",
  "!pevdashforce",
  "!criarsocial",
  "!socialrefresh",
  "!criardashsocial",
  "!dashboard",
  "!recriardashboard",
]);

if (!commands.has(content)) return false;

  if (!hasPermission(message.member, message.author.id)) {
    await message.reply("🚫 Você não tem permissão para atualizar esse dashboard.").catch(() => {});
    return true;
  }

  const recreate =
  content === "!criarsocial" ||
  content === "!criardashsocial" ||
  content === "!recriardashboard";
  const aviso = await message.reply(
    recreate
      ? "🧹 Recriando o Dashboard SantaCreators do zero e lendo pagamentos + logs + eventos..."
      : "🔄 Atualizando o Dashboard SantaCreators e lendo pagamentos + logs + eventos..."
  ).catch(() => null);

  const result = await renderDashboard(client, `command:${content}`, {
    force: true,
    recreate,
  });

  if (!result.ok) {
    await (aviso || message).reply?.(
      `❌ Falhei ao atualizar o dashboard.\nMotivo: \`${result.error || result.message || "erro desconhecido"}\``
    ).catch(() => {});
    return true;
  }

  await (aviso || message).edit?.({
    content: [
      recreate
        ? "✅ Dashboard recriado com sucesso."
        : "✅ Dashboard atualizado com sucesso.",
      "",
      `💵 Pagamentos lidos: **${result.stats.payments.length}**`,
      `🎉 Eventos lidos: **${result.stats.events.length}**`,
      `🧾 Mensagem: <#${DASH_CHANNEL_ID}>`,
    ].join("\n"),
  }).catch(() => {});

  return true;
}

export async function payEvtDashHandleInteraction(interaction, client) {
  if (!interaction.isButton() && !interaction.isModalSubmit()) return false;

  if (
    interaction.isButton() &&
    ["PEV_FORCE_REFRESH", "PEV_RECREATE", "PEV_DEBUG", "PEV_ADJUST_OPEN"].includes(interaction.customId)
  ) {
    if (!hasPermission(interaction, interaction.user.id)) {
      await interaction.reply({
        content: "🚫 Você não tem permissão para mexer nesse dashboard.",
        ephemeral: true,
      }).catch(() => {});
      return true;
    }
  }

  if (interaction.isButton() && interaction.customId === "PEV_FORCE_REFRESH") {
    await interaction.deferReply({ ephemeral: true }).catch(() => {});

    const result = await renderDashboard(client, "button:force_refresh", {
      force: true,
    });

    await interaction.editReply({
      content: result.ok
        ? `✅ Dashboard atualizado.\n💵 Pagamentos: **${result.stats.payments.length}**\n🎉 Eventos: **${result.stats.events.length}**`
        : `❌ Falhei ao atualizar.\nMotivo: \`${result.error || result.message || "erro desconhecido"}\``,
    }).catch(() => {});

    return true;
  }

  if (interaction.isButton() && interaction.customId === "PEV_RECREATE") {
    await interaction.deferReply({ ephemeral: true }).catch(() => {});

    const result = await renderDashboard(client, "button:recreate", {
      force: true,
      recreate: true,
    });

    await interaction.editReply({
      content: result.ok
        ? `✅ Dashboard recriado do zero.\n💵 Pagamentos: **${result.stats.payments.length}**\n🎉 Eventos: **${result.stats.events.length}**`
        : `❌ Falhei ao recriar.\nMotivo: \`${result.error || result.message || "erro desconhecido"}\``,
    }).catch(() => {});

    return true;
  }

  if (interaction.isButton() && interaction.customId === "PEV_DEBUG") {
    await interaction.deferReply({ ephemeral: true }).catch(() => {});
    await sendDebug(interaction, client);
    return true;
  }

  if (interaction.isButton() && interaction.customId === "PEV_ADJUST_OPEN") {
    const modal = new ModalBuilder()
      .setCustomId("PEV_ADJUST_MODAL")
      .setTitle("Ajuste manual do Dashboard");

    const inputUser = new TextInputBuilder()
      .setCustomId("adjust_user_id")
      .setLabel("ID do Usuário")
      .setPlaceholder("ID para retirar os pontos")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const inputAmount = new TextInputBuilder()
      .setCustomId("adjust_amount")
      .setLabel("Quantidade de pontos a RETIRAR")
      .setPlaceholder("Ex: 5 (serão removidos 5 aprovados)")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const inputReason = new TextInputBuilder()
      .setCustomId("adjust_reason")
      .setLabel("Motivo do ajuste")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(inputUser),
      new ActionRowBuilder().addComponents(inputAmount),
      new ActionRowBuilder().addComponents(inputReason)
    );

    await interaction.showModal(modal).catch(() => {});
    return true;
  }

  if (interaction.isModalSubmit() && interaction.customId === "PEV_ADJUST_MODAL") {
    await interaction.deferReply({ ephemeral: true }).catch(() => {});

    const targetId = interaction.fields.getTextInputValue("adjust_user_id").trim();
    const amount = parseInt(interaction.fields.getTextInputValue("adjust_amount").trim());
    const reason = interaction.fields.getTextInputValue("adjust_reason");

    if (isNaN(amount) || amount <= 0) {
      return interaction.editReply("❌ Informe uma quantidade válida (número positivo).");
    }

    const thisWeek = periodKeyFromDateSP(nowSP()).key;
    saveAdjustment(thisWeek, targetId, amount);

    console.log("[SC_PAY_EVT_DASH_V2] ajuste manual registrado:", {
      by: interaction.user.id,
      targetId,
      amount,
      reason
    });

    const result = await renderDashboard(client, "modal:adjust", {
      force: true,
    });

    await interaction.editReply({
      content: result.ok
        ? `✅ Removido **${amount}** ponto(s) de <@${targetId}>. Cubo de aprovados atualizado.`
        : `❌ Ajuste registrado, mas falhei ao recalcular.\nMotivo: \`${result.error || result.message || "erro desconhecido"}\``,
    }).catch(() => {});

    return true;
  }

  return false;
}