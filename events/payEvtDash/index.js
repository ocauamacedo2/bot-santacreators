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
const PAY_PERIOD_OK = 50;
const PAY_PERIOD_GOAL = 60;
const PAY_PERIOD_LIMIT = 80;

// Scan
const SCAN_PAGES = 160;
const SCAN_TTL_MS = 25 * 1000;

// ✅ Otimização: parar de escanear se a mensagem for mais velha que 15 dias
const MAX_AGE_MS = 15 * 24 * 60 * 60 * 1000;

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
let CACHE = { at: 0, payload: null };

const DEBUG = {
  lastRunAt: null,
  lastReason: "",
  stage: "",
  error: "",
  dashMsgId: null,

  scannedPayMsgs: 0,
  scannedPayRegs: 0,
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
  return loadJSON(STATE_PATH, { dashboardMsgId: null, lastFingerprint: "" });
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
const nowSP = () => new Date(new Date().toLocaleString("en-US", { timeZone: TZ }));

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

function pad2(n) {
  return String(n).padStart(2, "0");
}

function addDaysUTC(dateUTC, days) {
  const d = new Date(dateUTC.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function periodKeyFromDateSP(date) {
  const sp = new Date(new Date(date).toLocaleString("en-US", { timeZone: TZ }));
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(sp);
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dow = map[wd] ?? 0;

  const { y, m, d } = ymdSP(sp);
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
    const fake = new Date(new Date(Date.UTC(Y, M - 1, D)).toLocaleString("en-US", { timeZone: TZ }));
    return periodKeyFromDateSP(fake).label;
  } catch {
    return key;
  }
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
    return n.includes("status") || n.includes("situacao") || n.includes("aprov") || n.includes("resultado");
  });
  const raw = norm(statusField?.value || "");
  if (!raw) return "UNKNOWN";
  if (raw.includes("pago") || raw.includes("aprov") || raw.includes("confirmado")) return "APPROVED";
  if (raw.includes("reprov") || raw.includes("recus") || raw.includes("negad")) return "REJECTED";
  return "UNKNOWN";
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
const DASH_EMBED_TITLE_MATCH = "Dashboard — Registros (Pagamentos + Eventos)";

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

// =========================
// COLLECT DATA
// =========================
async function collectAll(client) {
  const now = Date.now();
  if (CACHE.payload && now - CACHE.at < SCAN_TTL_MS) return CACHE.payload;

  DEBUG.scannedPayMsgs = 0;
  DEBUG.scannedPayRegs = 0;
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
  const payCh = await client.channels.fetch(PAY_CHANNEL_ID).catch(() => null);
  if (payCh?.isTextBased?.()) {
    let lastId;
    for (let page = 0; page < SCAN_PAGES; page++) {
      const batch = await payCh.messages.fetch({ limit: 100, before: lastId }).catch(() => null);
      if (!batch?.size) break;

      let stopScan = false;
      for (const m of batch.values()) {
        if (isTooOld(m.createdTimestamp)) { stopScan = true; break; }

        DEBUG.scannedPayMsgs++;
        const emb = m.embeds?.[0];
        if (!emb || !isPaymentRecordEmbed(emb)) continue;

        DEBUG.scannedPayRegs++;
        const uid = getPaymentRegistrarId(emb);
        if (!uid) continue;

        const tsCreated = new Date(m.createdTimestamp);
        const pAll = periodKeyFromDateSP(tsCreated);
        DEBUG.payPeriodFoundAll[pAll.key] = (DEBUG.payPeriodFoundAll[pAll.key] || 0) + 1;

        paymentsAll.push({ userId: String(uid), periodKey: pAll.key, kind: "pay_all" });

        const st = getPaymentStatus(emb);
        const statusBaseTs = (st === "APPROVED" || st === "REJECTED") ? (m.editedTimestamp || m.createdTimestamp) : m.createdTimestamp;
        const tsStatus = new Date(statusBaseTs);
        const pStatus = periodKeyFromDateSP(tsStatus);

        if (st === "APPROVED") {
          DEBUG.payPeriodFound[pStatus.key] = (DEBUG.payPeriodFound[pStatus.key] || 0) + 1;
          DEBUG.payPeriodFoundApproved[pStatus.key] = (DEBUG.payPeriodFoundApproved[pStatus.key] || 0) + 1;
          payments.push({ userId: String(uid), periodKey: pStatus.key, kind: "pay" });
        } else if (st === "REJECTED") {
          DEBUG.payPeriodFoundRejected[pStatus.key] = (DEBUG.payPeriodFoundRejected[pStatus.key] || 0) + 1;
          paymentsRejected.push({ userId: String(uid), periodKey: pStatus.key, kind: "pay_rejected" });
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
      events.push({ userId: cand.userId, periodKey: p.key, kind: "evt_manual" });
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
        events.push({ userId: String(uid), periodKey: p.key, kind: "evt_poderes" });
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
    events.push({ userId: creatorId, periodKey: p.key, kind: "evt" });
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
        events.push({ userId: String(uid), periodKey: p.key, kind: "evt_crono" });
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
        { label: "Pagamentos", data: payData, backgroundColor: "#5865f2", barPercentage: 0.7, categoryPercentage: 0.8 },
        { label: "Eventos/Poderes", data: evtData, backgroundColor: "#faa61a", barPercentage: 0.7, categoryPercentage: 0.8 },
      ],
    },
    options: {
      plugins: {
        title: { display: true, text: title, font: { size: 24 } },
        datalabels: { anchor: "end", align: "end", offset: 4, clamp: true, font: { size: 16, weight: 'bold' }, color: '#000' },
        legend: { display: true, labels: { font: { size: 16 } } },
      },
      scales: { y: { beginAtZero: true, ticks: { precision: 0, font: { size: 16 } } }, x: { ticks: { font: { size: 16 } } } },
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
  const { payments, paymentsAll, paymentsRejected, events } = await collectAll(client);

  const currentWk = periodKeyFromDateSP(new Date()).key;
  
  // União de chaves
  const union = new Set([currentWk]);
  payments.forEach(p => union.add(p.periodKey));
  events.forEach(e => union.add(e.periodKey));
  const keys = [...union].sort((a, b) => (a > b ? -1 : 1));
  
  const thisKey = keys[0];
  const lastKey = keys[1];

  // Agregações (Pagamentos com Ajustes)
  const curPay = thisKey ? aggregate(payments, thisKey, true) : { total: 0, top: [] };
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
  
  const ps = payStatus(curPay.total);
  const pctLimit = Math.min(999, (curPay.total / PAY_PERIOD_LIMIT) * 100);
  const bar = progressBarEmoji(curPay.total, PAY_PERIOD_LIMIT, 14, ps.fill);

  const goalLine = [
    `${ps.icon} **Pagamentos Aprovados (SEMANA):** **${curPay.total}**`,
    `🟡 **OK:** ${PAY_PERIOD_OK}  •  🟢 **META:** ${PAY_PERIOD_GOAL}  •  ⚠️ **LIMITE:** ${PAY_PERIOD_LIMIT}`,
    `📌 **Progresso até o LIMITE:** **${curPay.total}/${PAY_PERIOD_LIMIT}** (**${pctLimit.toFixed(0)}%**)  ${bar} — **${ps.label}**`,
  ].join("\n");

  const top3Text = top3.length
    ? top3.map((u, i) => `${i===0?'🥇':i===1?'🥈':'🥉'} <@${u.userId}> — **${u.count}**`).join("\n")
    : "_(vazio)_";

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

  if (st.lastFingerprint === fingerprint && reason !== "manual") return;

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
    .setTitle("📈 Dashboard — Registros (Pagamentos + Eventos) • Semanal")
    .setDescription([
      `🗓️ **Período Atual:** \`${labelFromPeriodKey(thisKey)}\``,
      `🗓️ **Período Passado:** \`${labelFromPeriodKey(lastKey)}\``,
      "",
      ` **Pagamentos (APROVADOS):** **${curPay.total}**`,
      `└─ Anterior: ${prevPay.total} • Dif: ${ddPay.mood} **${ddPay.sign}${Math.abs(ddPay.d)}** (${ddPay.pct.toFixed(1)}%)`,
      "",
      `🎉 **Eventos (TODOS):** **${curEvt.total}**`,
      `└─ Anterior: ${prevEvt.total} • Dif: ${ddEvt.mood} **${ddEvt.sign}${Math.abs(ddEvt.d)}** (${ddEvt.pct.toFixed(1)}%)`,
      "",
      goalLine,
      "",
      `🏆 **Top 1 Pagamentos (Passado):** ${prevPay.top[0] ? `<@${prevPay.top[0].userId}> (${prevPay.top[0].count})` : "—"}`
    ].join("\n"))
    .addFields({ name: "🏅 Top 3 — Ranking Geral (Soma)", value: top3Text, inline: false })
    .setImage("attachment://chart.png")
    .setTimestamp();

  // Botão Remover Pontos
  const row = new ActionRowBuilder().addComponents(
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
    saveState(st);
  }
}

async function safeUpdate(client, reason) {
  if (LOCK) return;
  LOCK = true;
  try {
    if (reason.includes("manual")) CACHE.payload = null; // Force refresh
    await upsertDashboard(client, reason);
  } catch (e) {
    console.error("[SC_PAY_EVT_DASH] Update error:", e);
  } finally {
    LOCK = false;
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
  dashOn("pagamento:pago", () => safeUpdate(client, "pagamento"));

  await safeUpdate(client, "ready");
  setInterval(() => safeUpdate(client, "interval"), 5 * 60 * 1000);
}

export async function payEvtDashHandleMessage(message, client) {
  if (!message.guild || message.author.bot) return false;
  
  // Detecta novo registro manual de evento
  if (message.channelId === REGISTRO_EVENTO_CHANNEL_ID && message.author.id === client.user.id) {
    setTimeout(() => safeUpdate(client, "new manual event"), 2000);
    return false;
  }

  if (message.content === "!pevdashrefresh") {
    await message.reply("🔄 Atualizando...");
    await safeUpdate(client, "manual");
    return true;
  }

  return false;
}

// ✅ NEW EXPORT: Interaction Handler (Must be plugged into index.js interactionCreate)
export async function payEvtDashHandleInteraction(interaction, client) {
  if (!interaction.isButton() && !interaction.isModalSubmit()) return false;

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
