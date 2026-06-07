// d:\santacreators-main\events\payEvtDash\index.js
import fs from "node:fs";
import path from "node:path";
import {
  EmbedBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { dashOn } from "../../utils/dashHub.js"; // ✅ Caminho corrigido

// =========================
// CONFIG
// =========================
const TZ = "America/Sao_Paulo";

// Dashboard
const DASH_CHANNEL_ID = "1457985700312911912";
// Pagamentos
const PAY_CHANNEL_ID = "1387922662134775818";

// Logs de auditoria dos pagamentos
const PAY_LOG_CHANNEL_ID = "1486084352403312843";

// ✅ NOVO: Poderes Utilizados (para somar no Amarelo)
const CH_PODERES_ID = "1374066813171929218";

// EVT3
const EVT3_EVENT_CHANNEL_ID = "1457573495952248883";
const EVT3_STATE_FILE =
  process.env.EVT3_STATE_FILE || path.resolve(process.cwd(), "data", "evt3_events_state.json");

// Registro Manual de Eventos (Botão/Modal)
const REGISTRO_EVENTO_CHANNEL_ID = "1392618646630568076";

// Cronograma / Hall da Fama / Eventos Diários (Aprovados)
const CRONOGRAMA_LOGS_CHANNEL_ID = "1387864036259004436";

// Pagamentos — Regras da Semana
const PAY_PERIOD_OK = 40; // 🟡
const PAY_PERIOD_GOAL = 50; // 🟢
const PAY_PERIOD_LIMIT = 60; // 🚨

// Scan
const SCAN_PAGES = 45; // Otimizado para não travar o bot
const SCAN_PAGES_FAST = 15; // Rápido o suficiente para atualizações em tempo real
const SCAN_TTL_MS = 5 * 1000;
const FETCH_TIMEOUT_MS = 12000;
const COLLECT_MAX_MS = 45000;

// ✅ Otimização: parar de escanear se a mensagem for mais velha que 15 dias
const MAX_AGE_MS = 45 * 24 * 60 * 60 * 1000;

// Permissões para remover pontos
const ALLOWED_MANAGE_IDS = [
  "660311795327828008", // você
  "1262262852949905408", // owner
];
const ALLOWED_MANAGE_ROLES = [
  "1352408327983861844", // Resp Creators
  "1262262852949905409", // Resp Influ
];

// =========================
// STATE & DATA PATHS
// =========================
const DATA_DIR = path.resolve(process.cwd(), "data");
const STATE_PATH = path.join(DATA_DIR, "sc_pay_evt_dashboard_state.json");
const ADJUSTMENTS_PATH = path.join(DATA_DIR, "sc_pay_evt_adjustments.json");

// =========================
// Guards / cache
// =========================
let LOCK = false;
let LOCK_TS = 0;
let PENDING_UPDATE = false;
let PENDING_REASON = "";
let RUNNING_UPDATE_PROMISE = null;
let CACHE = { at: 0, payload: null };

const UPDATE_STUCK_MS = 30000;
const FORCE_WAIT_MS = 15000;
const DEBUG = {
  lastRunAt: null,
  lastReason: "",
  stage: "",
  error: "",
  dashMsgId: null,
  scannedPayMsgs: 0,
  scannedPayRegs: 0,
  scannedPayLogMsgs: 0,
  scannedPayLogRecovered: 0,
  scannedEvtManualMsgs: 0,
  scannedPoderesMsgs: 0, // ✅ Debug
  scannedCronoMsgs: 0,

  payPeriodFound: {},
  payPeriodFoundAll: {},
  payPeriodFoundApproved: {},
  payPeriodFoundRejected: {},

  evtPeriodFound: {},

  chosenThis: null,
  chosenLast: null,
  chartPeriods: [],
};

function log(...a) {
  console.log("[SC_PAY_EVT_DASH]", ...a);
}

// =========================
// FS helpers
// =========================
function ensureDirForFile(file) {
  try {
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch {}
}

function loadJSON(file, fallback) {
  try {
    ensureDirForFile(file);
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf-8")) || fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(file, data) {
  try {
    ensureDirForFile(file);
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch {}
}

function loadState() {
  return loadJSON(STATE_PATH, {
    dashboardMsgId: null,
    lastFingerprint: "",
    lastPeriodKey: "",
  });
}

function saveState(s) {
  saveJSON(STATE_PATH, s);
}

function loadAdjustments() {
  return loadJSON(ADJUSTMENTS_PATH, { weeks: {} });
}

function saveAdjustments(data) {
  saveJSON(ADJUSTMENTS_PATH, data);
}

function readEvt3State() {
  return loadJSON(EVT3_STATE_FILE, null);
}

// =========================
// TIME SAFE (SP)
// =========================
function nowSP() {
  return new Date();
}

function ymdSP(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour12: false
  }).formatToParts(date);
  return {
    y: +parts.find((p) => p.type === "year").value,
    m: +parts.find((p) => p.type === "month").value,
    d: +parts.find((p) => p.type === "day").value,
  };
}

function pad2(n) {
  return String(n).padStart(2, "0");
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
  const sDay = pad2(sundayUTC.getUTCDate());
  const sMon = pad2(sundayUTC.getUTCMonth() + 1);
  const eDay = pad2(saturdayUTC.getUTCDate());
  const eMon = pad2(saturdayUTC.getUTCMonth() + 1);
  const label = sMon === eMon ? `${sDay}-${eDay}/${eMon}` : `${sDay}/${sMon}-${eDay}/${eMon}`;

  return { key, label };
}
function labelFromPeriodKey(key) {
  try {
    const [Y, M, D] = key.split("-").map(Number);

    if (!Number.isFinite(Y) || !Number.isFinite(M) || !Number.isFinite(D)) {
      return key;
    }

    const sundayUTC = new Date(Date.UTC(Y, M - 1, D));
    const saturdayUTC = addDaysUTC(sundayUTC, 6);

    const sDay = pad2(sundayUTC.getUTCDate());
    const sMon = pad2(sundayUTC.getUTCMonth() + 1);
    const eDay = pad2(saturdayUTC.getUTCDate());
    const eMon = pad2(saturdayUTC.getUTCMonth() + 1);

    return sMon === eMon ? `${sDay}-${eDay}/${eMon}` : `${sDay}/${sMon}-${eDay}/${eMon}`;
  } catch {
    return key;
  }
}

function monthKeyFromDateSP(date) {
  const { y, m } = ymdSP(date);
  return `${y}-${pad2(m)}`;
}

function labelFromMonthKey(key) {
  try {
    const [Y, M] = key.split("-").map(Number);
    if (!Number.isFinite(Y) || !Number.isFinite(M)) return key;
    return `${pad2(M)}/${Y}`;
  } catch {
    return key;
  }
}

function periodInfoFromDateSP(date) {
  return {
    periodKey: periodKeyFromDateSP(date).key,
    monthKey: monthKeyFromDateSP(date),
  };
}

const SOURCE_LABELS = {
  pay: "Pagamentos aprovados",
  pay_all: "Pagamentos registrados",
  pay_rejected: "Pagamentos reprovados",
  evt_manual: "Registros manuais de eventos",
  evt_poderes: "Registros de poderes",
  evt: "Eventos EVT3",
  evt_crono: "Cronograma / Hall / Eventos diários",
};

function aggregateMonth(items, monthKey) {
  const only = items.filter((e) => e.monthKey === monthKey);
  const byKind = {};

  for (const item of only) {
    byKind[item.kind] = (byKind[item.kind] || 0) + 1;
  }

  const total = only.length;

  return { total, byKind };
}

function sourceLines(byKind, orderedKinds) {
  return orderedKinds
    .map((kind) => {
      const label = SOURCE_LABELS[kind] || kind;
      const value = byKind[kind] || 0;
      return `• ${label}: **${value}**`;
    })
    .join("\n");
}

// =========================
// PARSERS
// =========================
function norm(s) {
  return String(s || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function getFields(emb) {
  return emb?.fields || emb?.data?.fields || [];
}

function isPaymentRecordEmbed(emb) {
  const t = String(emb?.title || emb?.data?.title || "");
  return t.includes("Registro de Pagamento") && (t.includes("Evento") || t.includes("SANTACREATORS"));
}

function getPaymentRegistrarId(emb) {
  const f = getFields(emb).find((x) => norm(x?.name).includes("registro"));
  const m = /<@!?(\d+)>/.exec(f?.value || "");
  return m ? m[1] : null;
}

function getPaymentStatus(emb) {
  const fields = getFields(emb);
  const statusField = fields.find((x) => {
    const n = norm(x?.name);
    return n.includes("status") || n.includes("situacao") || n.includes("resultado");
  });

  const rawOriginal = String(statusField?.value || "");
  const raw = norm(rawOriginal);

  if (!raw) return "UNKNOWN";

  const isPago =
    /✅\s*\*{0,2}PAGO\*{0,2}/i.test(rawOriginal) ||
    /^pago\b/i.test(raw);

  const isReprovado =
    /❌\s*\*{0,2}REPROVADO\*{0,2}/i.test(rawOriginal) ||
    /^reprovado\b/i.test(raw) ||
    raw.includes("recus") ||
    raw.includes("negad");

  if (isPago) return "APPROVED";
  if (isReprovado) return "REJECTED";

  return "UNKNOWN";
}

function getPaymentEventTimestamp(emb, fallbackTs) {
  const fields = getFields(emb);

  const campoData = fields.find((x) => {
    const n = norm(x?.name);
    return n.includes("data do evento") || n.includes("data") || n.includes("evento");
  });

  const texto = String(campoData?.value || emb?.description || emb?.data?.description || "");

  const match = texto.match(/\b(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?\b/);
  if (!match) return fallbackTs;

  const dia = Number(match[1]);
  const mes = Number(match[2]);

  const agoraSP = nowSP();
  let ano = match[3] ? Number(match[3]) : agoraSP.getFullYear();

  if (ano < 100) ano = 2000 + ano;

  if (!Number.isFinite(dia) || !Number.isFinite(mes) || !Number.isFinite(ano)) return fallbackTs;
  if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return fallbackTs;

  const ts = new Date(`${ano}-${pad2(mes)}-${pad2(dia)}T12:00:00-03:00`).getTime();

  return Number.isFinite(ts) ? ts : fallbackTs;
}

function extractDiscordMessageLinksFromText(text) {
  const raw = String(text || "");
  const matches = [...raw.matchAll(/https?:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/channels\/(\d+)\/(\d+)\/(\d+)/gi)];

  return matches.map((m) => ({
    guildId: m[1],
    channelId: m[2],
    messageId: m[3],
    url: m[0],
  }));
}

function extractPaymentLogLinks(emb) {
  const links = [];

  const desc = String(emb?.description || emb?.data?.description || "");
  links.push(...extractDiscordMessageLinksFromText(desc));

  for (const field of getFields(emb)) {
    links.push(...extractDiscordMessageLinksFromText(field?.value || ""));
  }

  const unique = new Map();
  for (const link of links) {
    unique.set(`${link.channelId}:${link.messageId}`, link);
  }

  return [...unique.values()];
}

function isPaymentAuditLogEmbed(emb) {
  const title = norm(emb?.title || emb?.data?.title || "");
  const desc = norm(emb?.description || emb?.data?.description || "");

  return (
    title.includes("pagamento") ||
    title.includes("novo pagamento") ||
    title.includes("pagamento confirmado") ||
    title.includes("pagamento reprovado") ||
    title.includes("marcado como solicitado") ||
    desc.includes("data do evento") ||
    desc.includes("ganhador") ||
    desc.includes("registro:")
  );
}

async function fetchLinkedPaymentMessage(client, link) {
  try {
    if (!link?.channelId || !link?.messageId) return null;

    const ch = await client.channels.fetch(link.channelId).catch(() => null);
    if (!ch?.isTextBased?.()) return null;

    return await ch.messages.fetch(link.messageId).catch(() => null);
  } catch {
    return null;
  }
}

function pushPaymentFromEmbed({
  emb,
  fallbackTs,
  sourceMessageId,
  payments,
  paymentsAll,
  paymentsRejected,
  seenPaymentMessages,
}) {
  if (!emb || !isPaymentRecordEmbed(emb)) return false;

  const dedupeKey = String(sourceMessageId || "");
  if (dedupeKey && seenPaymentMessages.has(dedupeKey)) return false;
  if (dedupeKey) seenPaymentMessages.add(dedupeKey);

  const uid = getPaymentRegistrarId(emb);
  if (!uid) return false;

  const paymentRealTs = getPaymentEventTimestamp(emb, fallbackTs);

  const tsCreated = new Date(paymentRealTs);
  const pAll = periodKeyFromDateSP(tsCreated);
  DEBUG.payPeriodFoundAll[pAll.key] = (DEBUG.payPeriodFoundAll[pAll.key] || 0) + 1;

  paymentsAll.push({
    userId: String(uid),
    ...periodInfoFromDateSP(tsCreated),
    kind: "pay_all",
  });

  const st = getPaymentStatus(emb);
  const tsStatus = new Date(paymentRealTs);
  const pStatus = periodKeyFromDateSP(tsStatus);

  if (st === "APPROVED") {
    DEBUG.payPeriodFound[pStatus.key] = (DEBUG.payPeriodFound[pStatus.key] || 0) + 1;
    DEBUG.payPeriodFoundApproved[pStatus.key] = (DEBUG.payPeriodFoundApproved[pStatus.key] || 0) + 1;

    payments.push({
      userId: String(uid),
      ...periodInfoFromDateSP(tsStatus),
      kind: "pay",
    });
  } else if (st === "REJECTED") {
    DEBUG.payPeriodFoundRejected[pStatus.key] = (DEBUG.payPeriodFoundRejected[pStatus.key] || 0) + 1;

    paymentsRejected.push({
      userId: String(uid),
      ...periodInfoFromDateSP(tsStatus),
      kind: "pay_rejected",
    });
  }

  return true;
}

function isManualEventEmbed(emb) {
  const t = norm(emb?.title || emb?.data?.title || "");
  // ✅ FIX: Garante que NÃO pega pagamentos (evita duplicar no amarelo)
  if (t.includes("pagamento")) return false;
  return t.includes("registro") && (t.includes("poderes") || t.includes("evento") || t.includes("uso de"));
}

function getManualEventUserId(emb) {
  const footer = emb?.footer?.text || emb?.data?.footer?.text || "";
  const mFooter = /User ID:\s*(\d+)/.exec(footer);
  if (mFooter) return mFooter[1];
  const fields = getFields(emb);
  const f = fields.find((x) => {
    const n = norm(x?.name);
    return n.includes("registrado por") || n.includes("criado por");
  });
  if (f) {
    const m = /<@!?(\d+)>/.exec(f.value || "");
    if (m) return m[1];
  }
  return null;
}

// ✅ Parser para Cronograma/Hall/EventosDiarios (Aprovados)
function isApprovedEventEmbed(emb) {
  const t = String(emb?.title || emb?.data?.title || "");
  const f = String(emb?.footer?.text || emb?.data?.footer?.text || "");
  const isApproved = t.includes("APROVADO") || f.includes("Aprovado por");
  
  // Filtra tipos específicos
  const isCrono = t.includes("Cronograma") || t.includes("Solicitação de Aprovação");
  const isHall = t.includes("Hall da Fama");
  const isDaily = t.includes("Evento Diário");

  return isApproved && (isCrono || isHall || isDaily);
}

function getApprovedEventUserId(emb) {
  // Tenta pegar do campo "Solicitante" ou descrição
  const desc = emb?.description || emb?.data?.description || "";
  const mDesc = /Solicitante:.*?<@!?(\d+)>/i.exec(desc);
  if (mDesc) return mDesc[1];

  // Tenta pegar do campo "Aberto por" (se houver)
  const fields = getFields(emb);
  const f = fields.find(x => norm(x.name).includes("solicitante") || norm(x.name).includes("aberto por"));
  if (f) {
    const m = /<@!?(\d+)>/.exec(f.value || "");
    if (m) return m[1];
  }
  return null;
}

// ✅ Parser para Poderes Utilizados (igual ao scGeralDash)
function isPoderesRecordEmbed(emb) {
  const t = norm(emb?.title || emb?.data?.title || "");
  return (
    t.includes("registro") && t.includes("poderes") && t.includes("utilizados")
  );
}
function poderes_getUserId(emb) {
  const f = getFields(emb).find((x) => norm(x?.name).includes("id"));
  const v = String(f?.value || "").trim();
  return /^\d{17,20}$/.test(v) ? v : null;
}

// =========================
// DASHBOARD MSG RECOVERY
// =========================
const DASH_EMBED_TITLE_MATCH = "Dashboard — Registros SantaCreators";

function looksLikeOurDashMessage(msg, client) {
  try {
    if (!msg || msg.author?.id !== client.user.id) return false;
    const emb = msg.embeds?.[0];
    if (!emb) return false;
    return String(emb.title || "").includes(DASH_EMBED_TITLE_MATCH);
  } catch {
    return false;
  }
}

async function findExistingDashboardMessage(dash, client) {
  try {
    const pins = await dash.messages.fetchPinned().catch(() => null);
    if (pins?.size) {
      const found = [...pins.values()].find((m) => looksLikeOurDashMessage(m, client));
      if (found) return found;
    }
    const recent = await dash.messages.fetch({ limit: 50 }).catch(() => null);
    if (recent?.size) {
      const found = [...recent.values()].find((m) => looksLikeOurDashMessage(m, client));
      if (found) return found;
    }
    return null;
  } catch {
    return null;
  }
}

function isTooOld(ts) {
  return (Date.now() - ts) > MAX_AGE_MS;
}

function isCollectTimedOut(startedAt) {
  return Date.now() - startedAt > COLLECT_MAX_MS;
}

async function withTimeout(promise, ms, fallback = null) {
  let timer = null;

  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function fetchMessagesSafe(channel, options) {
  return await withTimeout(
    channel.messages.fetch(options).catch(() => null),
    FETCH_TIMEOUT_MS,
    null
  );
}

async function fetchChannelSafe(client, channelId) {
  return await withTimeout(
    client.channels.fetch(channelId).catch(() => null),
    FETCH_TIMEOUT_MS,
    null
  );
}

// =========================
// COLLECT DATA
// =========================
async function collectAll(client, options = {}) {
  const now = Date.now();
  const startedAt = Date.now();

  const fast = Boolean(options.fast);
  const pagesLimit = fast ? SCAN_PAGES_FAST : SCAN_PAGES;

  const currentPeriodKey = periodKeyFromDateSP(new Date()).key;
  const cachedPeriodKey = CACHE.payload?.__periodKey || null;

  if (
    CACHE.payload &&
    now - CACHE.at < SCAN_TTL_MS &&
    !fast &&
    cachedPeriodKey === currentPeriodKey
  ) {
    return CACHE.payload;
  }

  DEBUG.scannedPayMsgs = 0;
  DEBUG.scannedPayRegs = 0;
  DEBUG.scannedPayLogMsgs = 0;
  DEBUG.scannedPayLogRecovered = 0;
  DEBUG.scannedEvtManualMsgs = 0;
  DEBUG.scannedPoderesMsgs = 0;
  DEBUG.scannedCronoMsgs = 0;

  DEBUG.payPeriodFound = {};
  DEBUG.payPeriodFoundAll = {};
  DEBUG.payPeriodFoundApproved = {};
  DEBUG.payPeriodFoundRejected = {};
  DEBUG.evtPeriodFound = {};

  const payments = [];
  const paymentsAll = [];
  const paymentsRejected = [];
  const events = [];

  // 1. PAGAMENTOS (Blue)
  const seenPaymentMessages = new Set();

  const payCh = await fetchChannelSafe(client, PAY_CHANNEL_ID);
  if (payCh?.isTextBased?.()) {
    let lastId;
 for (let page = 0; page < pagesLimit; page++) {
  if (isCollectTimedOut(startedAt)) break;

  const batch = await fetchMessagesSafe(payCh, { limit: 100, before: lastId });
      if (!batch?.size) break;

      let stopScan = false;
      for (const m of batch.values()) {
        if (isTooOld(m.createdTimestamp)) { stopScan = true; break; }

        DEBUG.scannedPayMsgs++;

        const emb = m.embeds?.[0];
        if (!emb || !isPaymentRecordEmbed(emb)) continue;

        const added = pushPaymentFromEmbed({
          emb,
          fallbackTs: m.createdTimestamp,
          sourceMessageId: m.id,
          payments,
          paymentsAll,
          paymentsRejected,
          seenPaymentMessages,
        });

        if (added) DEBUG.scannedPayRegs++;
      }

      if (stopScan) break;
      lastId = batch.last()?.id;
      if (!lastId) break;
    }
  }

  // 1.1 BACKFILL DE PAGAMENTOS PELOS LOGS
  // Usa o canal 1486084352403312843 para recuperar registros que não entraram pela varredura principal.
  const payLogCh = await client.channels.fetch(PAY_LOG_CHANNEL_ID).catch(() => null);
  if (payLogCh?.isTextBased?.()) {
    let lastId;

    for (let page = 0; page < SCAN_PAGES; page++) {
      const batch = await payLogCh.messages.fetch({ limit: 100, before: lastId }).catch(() => null);
      if (!batch?.size) break;

      let stopScan = false;

      for (const m of batch.values()) {
        if (isTooOld(m.createdTimestamp)) { stopScan = true; break; }

        DEBUG.scannedPayLogMsgs++;

        const embLog = m.embeds?.[0];
        if (!embLog || !isPaymentAuditLogEmbed(embLog)) continue;

        const links = extractPaymentLogLinks(embLog);
        if (!links.length) continue;

        for (const link of links) {
          const linkedMsg = await fetchLinkedPaymentMessage(client, link);
          const embPayment = linkedMsg?.embeds?.[0];

          const added = pushPaymentFromEmbed({
            emb: embPayment,
            fallbackTs: linkedMsg?.createdTimestamp || m.createdTimestamp,
            sourceMessageId: linkedMsg?.id || link.messageId,
            payments,
            paymentsAll,
            paymentsRejected,
            seenPaymentMessages,
          });

          if (added) DEBUG.scannedPayLogRecovered++;
        }
      }

      if (stopScan) break;
      lastId = batch.last()?.id;
      if (!lastId) break;
    }
  }

  // 2. EVENTOS MANUAIS (Yellow)
  const regEvtCh = await client.channels.fetch(REGISTRO_EVENTO_CHANNEL_ID).catch(() => null);
  const manualCandidates = [];
  if (regEvtCh?.isTextBased?.()) {
    let lastId;
    for (let page = 0; page < 50; page++) {
      const batch = await regEvtCh.messages.fetch({ limit: 100, before: lastId }).catch(() => null);
      if (!batch?.size) break;

      let stopScan = false;
      for (const m of batch.values()) {
        if (isTooOld(m.createdTimestamp)) { stopScan = true; break; }

        const emb = m.embeds?.[0];
        if (!emb || !isManualEventEmbed(emb)) continue;

        let uid = /<@!?(\d+)>/.exec(m.content || "")?.[1] || getManualEventUserId(emb);
        if (!uid) continue;

        DEBUG.scannedEvtManualMsgs++;
        manualCandidates.push({ userId: String(uid), ts: m.createdTimestamp });
      }
      if (stopScan) break;
      lastId = batch.last()?.id;
      if (!lastId) break;
    }
  }

  // Cooldown 1h para manuais
  manualCandidates.sort((a, b) => a.ts - b.ts);
  const lastUserTime = new Map();
  const MANUAL_COOLDOWN = 60 * 60 * 1000;

  for (const cand of manualCandidates) {
    const last = lastUserTime.get(cand.userId);
    if (!last || cand.ts - last >= MANUAL_COOLDOWN) {
      lastUserTime.set(cand.userId, cand.ts);
      const p = periodKeyFromDateSP(new Date(cand.ts));
      DEBUG.evtPeriodFound[p.key] = (DEBUG.evtPeriodFound[p.key] || 0) + 1;
      events.push({
  userId: cand.userId,
  ...periodInfoFromDateSP(new Date(cand.ts)),
  kind: "evt_manual",
});
    }
  }

  // ✅ 2.1 PODERES UTILIZADOS (Yellow) - Adicionado para somar no amarelo
  // (Renomeado para podChScan para evitar erro de variável duplicada)
  const podChScan = await client.channels.fetch(CH_PODERES_ID).catch(() => null);
  if (podChScan?.isTextBased?.()) {
    let lastId;
    for (let page = 0; page < 50; page++) {
      const batch = await podChScan.messages.fetch({ limit: 100, before: lastId }).catch(() => null);
      if (!batch?.size) break;

      let stopScan = false;
      for (const m of batch.values()) {
        if (isTooOld(m.createdTimestamp)) { stopScan = true; break; }

        const emb = m.embeds?.[0];
        if (!emb || !isPoderesRecordEmbed(emb)) continue;

        const uid = poderes_getUserId(emb);
        if (!uid) continue;

        DEBUG.scannedPoderesMsgs++;
        const p = periodKeyFromDateSP(new Date(m.createdTimestamp));
        DEBUG.evtPeriodFound[p.key] = (DEBUG.evtPeriodFound[p.key] || 0) + 1;
        events.push({
  userId: String(uid),
  ...periodInfoFromDateSP(new Date(m.createdTimestamp)),
  kind: "evt_poderes",
});
      }
      if (stopScan) break;
      lastId = batch.last()?.id;
      if (!lastId) break;
    }
  }

  // 3. EVT3 (Yellow)
  const st = readEvt3State();
  const map = st?.evt3Events || {};
  const parent = await client.channels.fetch(EVT3_EVENT_CHANNEL_ID).catch(() => null);

  for (const [mainThreadId, info] of Object.entries(map)) {
    const creatorId = String(info?.creatorId || "").trim();
    if (!creatorId) continue;

    let thread = await client.channels.fetch(mainThreadId).catch(() => null);
    if (!thread && parent?.isTextBased?.()) {
      try {
        const active = await parent.threads.fetchActive().catch(() => null);
        thread = active?.threads?.get(mainThreadId);
      } catch {}
      if (!thread) {
        try {
          const archived = await parent.threads.fetchArchived({ type: "public", limit: 100 }).catch(() => null);
          thread = archived?.threads?.get(mainThreadId);
        } catch {}
      }
    }

    const createdAt = thread?.createdTimestamp ? new Date(thread.createdTimestamp) : null;
    if (!createdAt) continue;

    const p = periodKeyFromDateSP(createdAt);
    DEBUG.evtPeriodFound[p.key] = (DEBUG.evtPeriodFound[p.key] || 0) + 1;
    events.push({
  userId: creatorId,
  ...periodInfoFromDateSP(createdAt),
  kind: "evt",
});
  }

  // 4. CRONOGRAMA / HALL / DIÁRIOS (Yellow) - ✅ NOVO
  const cronoCh = await client.channels.fetch(CRONOGRAMA_LOGS_CHANNEL_ID).catch(() => null);
  if (cronoCh?.isTextBased?.()) {
    let lastId;
    for (let page = 0; page < 50; page++) {
      const batch = await cronoCh.messages.fetch({ limit: 100, before: lastId }).catch(() => null);
      if (!batch?.size) break;

      let stopScan = false;
      for (const m of batch.values()) {
        if (isTooOld(m.createdTimestamp)) { stopScan = true; break; }

        const emb = m.embeds?.[0];
        if (!emb || !isApprovedEventEmbed(emb)) continue;

        const uid = getApprovedEventUserId(emb);
        if (!uid) continue;

        DEBUG.scannedCronoMsgs++;
        const ts = m.editedTimestamp || m.createdTimestamp;
        const p = periodKeyFromDateSP(new Date(ts));
        
        DEBUG.evtPeriodFound[p.key] = (DEBUG.evtPeriodFound[p.key] || 0) + 1;
        events.push({
  userId: String(uid),
  ...periodInfoFromDateSP(new Date(ts)),
  kind: "evt_crono",
});
      }
      if (stopScan) break;
      lastId = batch.last()?.id;
      if (!lastId) break;
    }
  }

  const payload = { payments, paymentsAll, paymentsRejected, events };
  CACHE = { at: now, payload };
  return payload;
}

// =========================
// AGGREGATION & ADJUSTMENTS
// =========================
function getAdjustmentsForWeek(weekKey) {
  const data = loadAdjustments();
  return data.weeks?.[weekKey] || {};
}

function aggregate(items, periodKey, applyAdjustments = false) {
  const only = items.filter((e) => e.periodKey === periodKey);
  const byUser = {};
  for (const e of only) byUser[e.userId] = (byUser[e.userId] || 0) + 1;

  // ✅ Aplica ajustes manuais (apenas se solicitado, ex: para pagamentos)
  if (applyAdjustments) {
    const adjustments = getAdjustmentsForWeek(periodKey);
    for (const [userId, delta] of Object.entries(adjustments)) {
      byUser[userId] = (byUser[userId] || 0) + delta;
      if (byUser[userId] < 0) byUser[userId] = 0; // Não permite negativo
    }
  }

  const total = Object.values(byUser).reduce((a, b) => a + b, 0);
  const top = Object.entries(byUser)
    .map(([userId, count]) => ({ userId, count }))
    .sort((a, b) => b.count - a.count);

  return { total, top };
}

function diff(a, b) {
  const d = a - b;
  const pct = b > 0 ? (d / b) * 100 : a > 0 ? 100 : 0;
  const mood = d > 0 ? "🟢" : d < 0 ? "🔴" : "🟡";
  const sign = d > 0 ? "+" : d < 0 ? "−" : "";
  return { d, pct, mood, sign };
}

function payStatus(approved) {
  if (approved > PAY_PERIOD_LIMIT) return { icon: "🚨", label: "ESTOUROU O LIMITE", color: 0xed4245, fill: "🟥" };
  if (approved === PAY_PERIOD_LIMIT) return { icon: "⚠️", label: "NO LIMITE", color: 0xfaa61a, fill: "🟧" };
  if (approved >= PAY_PERIOD_GOAL) return { icon: "🟢", label: "META BATIDA", color: 0x57f287, fill: "🟩" };
  if (approved >= PAY_PERIOD_OK) return { icon: "🟡", label: "OK", color: 0xfee75c, fill: "🟨" };
  return { icon: "🔴", label: "ABAIXO DO OK", color: 0xed4245, fill: "🟥" };
}

function progressBarEmoji(value, max, width = 14, fill = "🟩") {
  const v = Math.max(0, value);
  const m = Math.max(1, max);
  const filled = Math.min(width, Math.round((v / m) * width));
  return fill.repeat(filled) + "⬜".repeat(Math.max(0, width - filled));
}

// =========================
// CHART
// =========================
function chartUrlTwoDatasets({ labels, payData, evtData, title }) {
  const cfg = {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Pagamentos",
          data: payData,
          backgroundColor: "#5865f2",
          barPercentage: 0.8,
          categoryPercentage: 0.9,
          minBarLength: 8,
        },
        {
          label: "Eventos/Poderes",
          data: evtData,
          backgroundColor: "#faa61a",
          barPercentage: 0.8,
          categoryPercentage: 0.9,
          minBarLength: 8,
        },
      ],
    },
    options: {
      title: {
        display: true,
        text: title,
        fontSize: 24,
      },
      legend: {
        display: true,
        labels: {
          fontSize: 16,
        },
      },
      plugins: {
        datalabels: {
          anchor: "end",
          align: "end",
          offset: 4,
          clamp: true,
          font: {
            size: 16,
            weight: "bold",
          },
          color: "#000",
        },
      },
      scales: {
        yAxes: [
          {
            ticks: {
              beginAtZero: true,
              min: 0,
              precision: 0,
              fontSize: 16,
            },
          },
        ],
        xAxes: [
          {
            ticks: {
              fontSize: 16,
            },
          },
        ],
      },
    },
  };

  return `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(cfg))}&width=1200&height=600&backgroundColor=white&plugins=chartjs-plugin-datalabels`;
}

async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// =========================
// UPSERT DASHBOARD
// =========================
async function upsertDashboard(client, reason) {
  DEBUG.lastRunAt = Date.now();
  DEBUG.lastReason = reason;
  
  const dash = await client.channels.fetch(DASH_CHANNEL_ID).catch(() => null);
  if (!dash?.isTextBased?.()) return;

  const st = loadState();
  const reasonText = String(reason || "");

const isFastUpdate =
  reasonText.includes("manual") ||
  reasonText.includes("force") ||
  reasonText.includes("message:") ||
  reasonText.includes("pagamento:") ||
  reasonText.includes("cronograma") ||
  reasonText.includes("halldafama") ||
  reasonText.includes("eventosdiarios") ||
  reasonText.includes("pending:");

const { payments, paymentsAll, paymentsRejected, events } = await collectAll(client, {
  fast: isFastUpdate,
});

  const currentWk = periodKeyFromDateSP(nowSP()).key;
  
  // União de chaves
  const union = new Set([currentWk]);
  payments.forEach(p => union.add(p.periodKey));
  paymentsAll.forEach(p => union.add(p.periodKey));
  events.forEach(e => union.add(e.periodKey));
  const keys = [...union].sort((a, b) => (a > b ? -1 : 1));

const thisKey = currentWk;
const lastKey = periodKeyFromDateSP(addDaysUTC(new Date(`${thisKey}T12:00:00Z`), -7)).key;

DEBUG.chosenThis = thisKey;
DEBUG.chosenLast = lastKey;
DEBUG.chartPeriods = keys.slice(0, 4);

  // Agregações (Pagamentos com Ajustes)
  const curPay = thisKey ? aggregate(payments, thisKey, true) : { total: 0, top: [] };
  const curPayAll = thisKey ? aggregate(paymentsAll, thisKey) : { total: 0, top: [] };
  const prevPay = lastKey ? aggregate(payments, lastKey, true) : { total: 0, top: [] };
  
  // Eventos (Sem ajustes por enquanto, ou adicione se quiser)
  const curEvt = thisKey ? aggregate(events, thisKey) : { total: 0, top: [] };
  const prevEvt = lastKey ? aggregate(events, lastKey) : { total: 0, top: [] };

  // Total Geral (Pagamentos Ajustados + Eventos)
  const curAllTotal = curPay.total + curEvt.total;
  const prevAllTotal = prevPay.total + prevEvt.total;
  
  // Top 3 Geral (precisa mesclar os tops ajustados)
  const mergeTops = (payTop, evtTop) => {
    const map = {};
    payTop.forEach(u => map[u.userId] = (map[u.userId] || 0) + u.count);
    evtTop.forEach(u => map[u.userId] = (map[u.userId] || 0) + u.count);
    return Object.entries(map)
      .map(([userId, count]) => ({ userId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
  };
  const top3 = mergeTops(curPay.top, curEvt.top);

  // Textos
  const ddPay = diff(curPay.total, prevPay.total);
  const ddEvt = diff(curEvt.total, prevEvt.total);

  const currentMonthKey = monthKeyFromDateSP(new Date());

  const monthPayAll = aggregateMonth(paymentsAll, currentMonthKey);
  const monthPayApproved = aggregateMonth(payments, currentMonthKey);
  const monthPayRejected = aggregateMonth(paymentsRejected, currentMonthKey);
  const monthEvents = aggregateMonth(events, currentMonthKey);

  const ps = payStatus(curPay.total);
  const pctLimit = Math.min(999, (curPay.total / PAY_PERIOD_LIMIT) * 100);
  const bar = progressBarEmoji(curPay.total, PAY_PERIOD_LIMIT, 12, ps.fill);

  const weeklySummary = [
    `📌 **Pagamentos registrados:** **${curPayAll.total}**`,
    `📌 **Pagamentos aprovados:** **${curPay.total}**`,
    `🎉 **Eventos / poderes:** **${curEvt.total}**`,
    `📊 **Total semanal:** **${curAllTotal}**`,
  ].join("\n");

  const weeklyComparison = [
    `💸 **Pagamentos:** ${prevPay.total} → **${curPay.total}** ${ddPay.mood} **${ddPay.sign}${Math.abs(ddPay.d)}** (${ddPay.pct.toFixed(1)}%)`,
    `🎉 **Eventos:** ${prevEvt.total} → **${curEvt.total}** ${ddEvt.mood} **${ddEvt.sign}${Math.abs(ddEvt.d)}** (${ddEvt.pct.toFixed(1)}%)`,
  ].join("\n");

  const weeklyGoal = [
    `${ps.icon} **Status atual:** **${ps.label}**`,
    `🟡 **OK:** ${PAY_PERIOD_OK}  •  🟢 **Meta:** ${PAY_PERIOD_GOAL}  •  ⚠️ **Limite:** ${PAY_PERIOD_LIMIT}`,
    `📈 **Progresso:** **${curPay.total}/${PAY_PERIOD_LIMIT}** (${pctLimit.toFixed(0)}%)`,
    `${bar}`,
  ].join("\n");

  const monthlySummary = [
    `🗓️ **Mês atual:** \`${labelFromMonthKey(currentMonthKey)}\``,
    "",
    `💸 **Pagamentos do mês**`,
    `• Registrados: **${monthPayAll.total}**`,
    `• Aprovados: **${monthPayApproved.total}**`,
    `• Reprovados: **${monthPayRejected.total}**`,
    "",
    `🎉 **Eventos / fontes do mês**`,
    sourceLines(monthEvents.byKind, ["evt_manual", "evt_poderes", "evt", "evt_crono"]),
    "",
    `📦 **Total geral do mês:** **${monthPayApproved.total + monthEvents.total}**`,
  ].join("\n");

  const top3Text = top3.length
    ? top3.map((u, i) => `${i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"} <@${u.userId}> — **${u.count} registros**`).join("\n")
    : "_Sem registros nesta semana._";

  // Chart Data (Últimas 4 semanas)
  const chartKeys = keys.slice(0, 4).reverse(); // Ascendente
  const labels = chartKeys.map(k => labelFromPeriodKey(k));
  
  // Aplica ajustes aos dados do gráfico também
  const payData = chartKeys.map(k => aggregate(payments, k, true).total);
  const evtData = chartKeys.map(k => aggregate(events, k).total);

  // Fingerprint
  const fingerprint = JSON.stringify({
    thisKey, lastKey,
    totals: { cur: curAllTotal, prev: prevAllTotal },
    pay: { cur: curPay.total, prev: prevPay.total },
    evt: { cur: curEvt.total, prev: prevEvt.total },
    chart: { payData, evtData }
  });

  const periodChanged = st.lastPeriodKey && st.lastPeriodKey !== thisKey;

  if (periodChanged) {
    CACHE.payload = null;
    st.lastFingerprint = "";
  }

  const isForcedUpdate = isFastUpdate;

  if (st.lastFingerprint === fingerprint && !isForcedUpdate && !periodChanged) return;

  // Build Chart
  let files = [];
  try {
    const url = chartUrlTwoDatasets({ labels, payData, evtData, title: "Histórico — Últimos 4 períodos (Dom→Sáb)" });
    const buf = await fetchBuffer(url);
    files = [new AttachmentBuilder(buf, { name: "chart.png" })];
  } catch (e) {
    console.error("[SC_PAY_EVT_DASH] Chart error:", e);
  }

  // Embed
  const embed = new EmbedBuilder()
    .setColor(ps.color)
    .setTitle("📊 Dashboard — Registros SantaCreators")
    .setDescription([
      `**Período semanal:** \`${labelFromPeriodKey(thisKey)}\``,
      `**Comparação:** \`${labelFromPeriodKey(lastKey)}\` → \`${labelFromPeriodKey(thisKey)}\``,
    ].join("\n"))
    .addFields(
      {
        name: "📌 Resumo da semana",
        value: weeklySummary,
        inline: true,
      },
      {
        name: "📈 Comparativo semanal",
        value: weeklyComparison,
        inline: true,
      },
      {
        name: "🎯 Meta de pagamentos",
        value: weeklyGoal,
        inline: false,
      },
      {
        name: "📦 Totais do mês por fonte",
        value: monthlySummary,
        inline: false,
      },
      {
        name: "🏅 Top 3 — Ranking geral da semana",
        value: top3Text,
        inline: false,
      },
      {
        name: "🏆 Destaque anterior",
        value: `**Top 1 pagamentos da semana passada:** ${prevPay.top[0] ? `<@${prevPay.top[0].userId}> — **${prevPay.top[0].count}**` : "—"}`,
        inline: false,
      },
    )
    .setImage("attachment://chart.png")
    .setFooter({ text: "Atualização automática • Pagamentos + Eventos + Poderes" })
    .setTimestamp();

  // Botão Remover Pontos
const row = new ActionRowBuilder().addComponents(
  new ButtonBuilder()
    .setCustomId("PEV_FORCE_REFRESH")
    .setLabel("🔄 Atualizar Semanal")
    .setStyle(ButtonStyle.Primary),

  new ButtonBuilder()
    .setCustomId("PEV_REMOVE_POINTS")
    .setLabel("➖ Remover Pontos (Pagamentos)")
    .setStyle(ButtonStyle.Danger)
);

  // Send/Edit
  let msg = st.dashboardMsgId ? await dash.messages.fetch(st.dashboardMsgId).catch(() => null) : null;
  if (!msg) msg = await findExistingDashboardMessage(dash, client);

  const payload = { content: "‎", embeds: [embed], files, components: [row] };

  if (msg) {
    await msg.edit(payload);
  } else {
    msg = await dash.send(payload);
  }

  if (msg) {
    st.dashboardMsgId = msg.id;
    st.lastFingerprint = fingerprint;
    st.lastPeriodKey = thisKey;
    saveState(st);
  }
}

async function safeUpdate(client, reason) {
  const now = Date.now();
  const reasonText = String(reason || "");

  const isForceUpdate =
    reasonText.includes("manual") ||
    reasonText.includes("force") ||
    reasonText.includes("message:") ||
    reasonText.includes("pagamento:") ||
    reasonText.includes("cronograma") ||
    reasonText.includes("halldafama") ||
    reasonText.includes("eventosdiarios") ||
    reasonText.includes("pending:");

  if (isForceUpdate) {
    CACHE = { at: 0, payload: null };

    const st = loadState();
    st.lastFingerprint = "";
    saveState(st);
  }

  if (LOCK) {
    const lockAge = now - LOCK_TS;

    if (lockAge <= UPDATE_STUCK_MS) {
      PENDING_UPDATE = true;
      PENDING_REASON = reasonText || "pending";

      log("⏳ Update já está rodando. Nova atualização ficou na fila:", {
        reason,
        lockAgeMs: lockAge,
      });

      return false;
    }

    log("⚠️ Update antigo travado. Forçando nova atualização:", {
      reason,
      lockAgeMs: lockAge,
    });

    LOCK = false;
    LOCK_TS = 0;
    RUNNING_UPDATE_PROMISE = null;
  }

  LOCK = true;
  LOCK_TS = Date.now();

  try {
    RUNNING_UPDATE_PROMISE = upsertDashboard(client, reason);
    await RUNNING_UPDATE_PROMISE;

    log("✅ Dashboard atualizado:", {
      reason,
      scannedPayMsgs: DEBUG.scannedPayMsgs,
      scannedPayRegs: DEBUG.scannedPayRegs,
      scannedPayLogMsgs: DEBUG.scannedPayLogMsgs,
      scannedPayLogRecovered: DEBUG.scannedPayLogRecovered,
      scannedEvtManualMsgs: DEBUG.scannedEvtManualMsgs,
      scannedPoderesMsgs: DEBUG.scannedPoderesMsgs,
      scannedCronoMsgs: DEBUG.scannedCronoMsgs,
    });

    return true;
  } catch (e) {
    DEBUG.error = e?.stack || e?.message || String(e);
    console.error("[SC_PAY_EVT_DASH] Update error:", e);
    return false;
  } finally {
    LOCK = false;
    LOCK_TS = 0;
    RUNNING_UPDATE_PROMISE = null;

    if (PENDING_UPDATE) {
      const nextReason = PENDING_REASON || "pending";
      PENDING_UPDATE = false;
      PENDING_REASON = "";

      setTimeout(() => {
        safeUpdate(client, `pending:${nextReason}`).catch((err) => {
          console.error("[SC_PAY_EVT_DASH] Erro na atualização pendente:", err);
        });
      }, 1200);
    }
  }
}

// =========================
// EXPORTS
// =========================
export async function payEvtDashOnReady(client) {
  if (client.__SC_PAY_EVT_DASH_READY__) return;
  client.__SC_PAY_EVT_DASH_READY__ = true;

  dashOn("cronograma:aprovado", () => safeUpdate(client, "cronograma"));
  dashOn("halldafama:aprovado", () => safeUpdate(client, "halldafama"));
  dashOn("eventosdiarios:aprovado", () => safeUpdate(client, "eventosdiarios"));

  dashOn("pagamento:criado", () => safeUpdate(client, "pagamento:criado"));
  dashOn("pagamento:pago", () => safeUpdate(client, "pagamento:pago"));
  dashOn("pagamento:solicitado", () => safeUpdate(client, "pagamento:solicitado"));
  dashOn("pagamento:reprovado", () => safeUpdate(client, "pagamento:reprovado"));
  dashOn("pagamento:status", () => safeUpdate(client, "pagamento:status"));

  await safeUpdate(client, "ready");
  setInterval(() => safeUpdate(client, "interval"), 5 * 60 * 1000);
}

export async function payEvtDashHandleMessage(message, client) {
  if (!message.guild) return false;

  const autoUpdateChannels = new Set([
    PAY_CHANNEL_ID,
    REGISTRO_EVENTO_CHANNEL_ID,
    CH_PODERES_ID,
    CRONOGRAMA_LOGS_CHANNEL_ID,
  ]);

  if (autoUpdateChannels.has(message.channelId)) {
    setTimeout(() => safeUpdate(client, `message:${message.channelId}`), 2500);
  }

  if (message.author.bot) return false;

  const content = String(message.content || "").trim().toLowerCase();

  if (
    content === "!pevdashrefresh" ||
    content === "!pevdashrefresh" ||
    content === "!pevdashrefresh" ||
    content === "!pevdash" ||
    content === "!pevrefresh"
  ) {
    await message.reply("🔄 Atualizando...");
    CACHE.payload = null;

    const st = loadState();
    st.lastFingerprint = "";
    saveState(st);

    await safeUpdate(client, "manual");
    return true;
  }

  return false;
}

// ✅ NEW EXPORT: Interaction Handler (Must be plugged into index.js interactionCreate)
export async function payEvtDashHandleInteraction(interaction, client) {
  if (!interaction.isButton() && !interaction.isModalSubmit()) return false;

  if (interaction.isButton() && interaction.customId === "PEV_FORCE_REFRESH") {
    await interaction.deferReply({ ephemeral: true }).catch(() => {});

    CACHE.payload = null;

    const st = loadState();
    st.lastFingerprint = "";
    saveState(st);

await interaction.editReply({
  content: "🔄 Atualização manual iniciada. Estou limpando o cache e recalculando o dashboard...",
}).catch(() => {});

const ok = await safeUpdate(client, "manual force refresh");

await interaction.editReply({
  content: ok
    ? "✅ Dashboard atualizado com sucesso. Cache limpo, painel recalculado e mensagem editada."
    : "⏳ Já tinha uma atualização rodando. Deixei essa atualização na fila e ela vai rodar em seguida.",
}).catch(() => {});
    return true;
  }

  // Button: Open Modal
if (interaction.isButton() && interaction.customId === "PEV_REMOVE_POINTS") {
  const hasPerm =
    ALLOWED_MANAGE_IDS.includes(interaction.user.id) ||
    interaction.member?.roles?.cache?.some(r => ALLOWED_MANAGE_ROLES.includes(r.id));

  if (!hasPerm) {
    await interaction.reply({ content: "🚫 Sem permissão.", ephemeral: true });
    return true;
  }

  const modal = new ModalBuilder()
    .setCustomId("PEV_REMOVE_MODAL")
    .setTitle("Remover Pontos (Pagamentos)");

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("userId")
        .setLabel("ID do Usuário")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("amount")
        .setLabel("Quantidade a Remover")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    )
  );

  await interaction.showModal(modal);
  return true;
}

// Modal: Save Adjustment
if (interaction.isModalSubmit() && interaction.customId === "PEV_REMOVE_MODAL") {
  await interaction.deferReply({ ephemeral: true });

  const userId = interaction.fields.getTextInputValue("userId").trim();
  const amount = parseInt(interaction.fields.getTextInputValue("amount").trim(), 10);

  if (!userId || isNaN(amount) || amount <= 0) {
    await interaction.editReply({ content: "❌ Dados inválidos." });
    return true;
  }

  const { key: weekKey } = periodKeyFromDateSP(new Date());
  const data = loadAdjustments();

  if (!data.weeks[weekKey]) data.weeks[weekKey] = {};
  data.weeks[weekKey][userId] = (data.weeks[weekKey][userId] || 0) - amount;

  saveAdjustments(data);

  // Force update
  CACHE.payload = null;
  await safeUpdate(client, "manual adjustment");

  await interaction.editReply({
    content: `✅ Removidos **${amount}** pontos de <@${userId}> na semana atual (Pagamentos).`
  });
  return true;
}

  return false;
}
