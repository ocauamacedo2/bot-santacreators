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

const PAY_PERIOD_OK = 40;
const PAY_PERIOD_GOAL = 50;
const PAY_PERIOD_LIMIT = 60;

const DATA_DIR = path.resolve(process.cwd(), "data");
const STATE_PATH = path.join(DATA_DIR, "sc_pay_evt_dashboard_v2_state.json");

const DASH_MARKER = "SC_PAY_EVT_DASH_V2";

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
  pagesPerChannel: 8,
  fetchLimit: 100,
  maxAgeDays: 14,

  // Evita travar tentando abrir centenas de links antigos dos logs
  maxLinkedLogsToRecover: 80,
  linkedFetchTimeoutMs: 2500,
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

function norm(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
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

function dateFromBR(text, fallbackTs) {
  const raw = String(text || "");
  const m = raw.match(/\b(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?\b/);
  if (!m) return new Date(fallbackTs || Date.now());

  const dia = Number(m[1]);
  const mes = Number(m[2]);
  let ano = m[3] ? Number(m[3]) : ymdSP(new Date()).y;

  if (ano < 100) ano = 2000 + ano;
  if (!Number.isFinite(dia) || !Number.isFinite(mes) || !Number.isFinite(ano)) {
    return new Date(fallbackTs || Date.now());
  }

  const d = new Date(`${ano}-${pad2(mes)}-${pad2(dia)}T12:00:00-03:00`);
  if (Number.isNaN(d.getTime())) return new Date(fallbackTs || Date.now());
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
  const t = norm(text);

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

  if (
    t.includes("pago") ||
    t.includes("aprovado") ||
    t.includes("pagamento confirmado") ||
    t.includes("confirmado")
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

function getActorIdFromEventEmbed(embed) {
  return (
    extractUserId(findFieldValue(embed, ["aprovado por", "registrado por", "responsavel", "responsável", "autor"])) ||
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
    eventsCrono: 0,
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
    eventsCrono: 0,
  };

  stats.byMonth[monthKey] ??= {
    paymentsCreated: 0,
    paymentsApproved: 0,
    paymentsRejected: 0,
    paymentsRequested: 0,
    eventsManual: 0,
    eventsPoderes: 0,
    eventsEvt3: 0,
    eventsCrono: 0,
  };

  return {
    week: stats.byWeek[periodKey],
    month: stats.byMonth[monthKey],
  };
}

function addPayment(stats, item) {
  const date = new Date(item.ts || Date.now());
  const period = periodKeyFromDateSP(date);
  const monthKey = monthKeyFromDateSP(date);

  const buckets = ensureBucket(stats, period.key, monthKey);

  buckets.week.paymentsCreated++;
  buckets.month.paymentsCreated++;

  if (item.status === "approved") {
    buckets.week.paymentsApproved++;
    buckets.month.paymentsApproved++;
  }

  if (item.status === "rejected") {
    buckets.week.paymentsRejected++;
    buckets.month.paymentsRejected++;
  }

  if (item.status === "requested") {
    buckets.week.paymentsRequested++;
    buckets.month.paymentsRequested++;
  }

  const creator = ensureUser(stats, item.creatorId);
  if (creator) {
    creator.paymentsCreated++;
    creator.pointsPayment += 1;
  }

  const decisionUser = ensureUser(stats, item.decisionUserId);
  if (decisionUser && item.status === "approved") {
    decisionUser.paymentsApproved++;
    decisionUser.pointsPayment += 2;
  }

  if (decisionUser && item.status === "rejected") {
    decisionUser.paymentsRejected++;
    decisionUser.pointsPayment += 1;
  }

  if (decisionUser && item.status === "requested") {
    decisionUser.paymentsRequested++;
    decisionUser.pointsPayment += 1;
  }

  stats.payments.push({
    ...item,
    periodKey: period.key,
    monthKey,
  });
}

function addEvent(stats, item) {
  const date = new Date(item.ts || Date.now());
  const period = periodKeyFromDateSP(date);
  const monthKey = monthKeyFromDateSP(date);

  const buckets = ensureBucket(stats, period.key, monthKey);

  if (item.kind === "manual") {
    buckets.week.eventsManual++;
    buckets.month.eventsManual++;
  }

  if (item.kind === "poderes") {
    buckets.week.eventsPoderes++;
    buckets.month.eventsPoderes++;
  }

  if (item.kind === "evt3") {
    buckets.week.eventsEvt3++;
    buckets.month.eventsEvt3++;
  }

  if (item.kind === "crono") {
    buckets.week.eventsCrono++;
    buckets.month.eventsCrono++;
  }

  const user = ensureUser(stats, item.userId);
  if (user) {
    if (item.kind === "manual") user.eventsManual++;
    if (item.kind === "poderes") user.eventsPoderes++;
    if (item.kind === "evt3") user.eventsEvt3++;
    if (item.kind === "crono") user.eventsCrono++;

    user.pointsEvent += 1;
  }

  stats.events.push({
    ...item,
    periodKey: period.key,
    monthKey,
  });
}

async function fetchChannelMessages(client, channelId, pages = SCAN_CONFIG.pagesPerChannel) {
  console.log("[SC_PAY_EVT_DASH_V2] lendo canal:", channelId);

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

    console.log("[SC_PAY_EVT_DASH_V2] página:", page + 1, "/", pages, "canal:", channelId);

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

  console.log("[SC_PAY_EVT_DASH_V2] canal finalizado:", channelId, "mensagens:", out.length);
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
  console.log("[SC_PAY_EVT_DASH_V2] iniciando leitura dos logs de pagamento");

  const logMessages = await fetchChannelMessages(client, PAY_LOG_CHANNEL_ID);
  stats.debug.scannedChannels[PAY_LOG_CHANNEL_ID] = logMessages.length;

  let linkedRecoveredAttempts = 0;
  let processedLogs = 0;

  for (const msg of logMessages) {
    processedLogs++;

    if (processedLogs % 100 === 0) {
      console.log("[SC_PAY_EVT_DASH_V2] logs processados:", processedLogs, "/", logMessages.length);
    }

    const allText = [
      msg.content || "",
      ...(msg.embeds || []).map(getEmbedText),
    ].join("\n");

    const link = extractFirstDiscordLink(allText);

    if (link && linkedRecoveredAttempts < SCAN_CONFIG.maxLinkedLogsToRecover) {
      linkedRecoveredAttempts++;

      const linked = await fetchLinkedMessage(client, link);
      const embed = linked?.embeds?.[0];

      if (embed && isPaymentEmbed(embed)) {
        const key = `paymsg:${linked.id}`;

        if (!seen.has(key)) {
          seen.add(key);
          stats.debug.recoveredFromLogs++;

          const status = getPaymentStatus(embed);
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

        continue;
      }
    }

    for (const embed of msg.embeds || []) {
      if (!isPaymentLogEmbed(embed)) continue;

      const key = `paylog:${msg.id}`;
      if (seen.has(key)) {
        stats.debug.duplicatesIgnored++;
        continue;
      }

      seen.add(key);

      const status = statusFromText(getEmbedText(embed));
      const date = getPaymentDate(embed, msg.createdTimestamp);
      const creatorId = getPaymentCreatorId(embed);
      const decisionUserId = getPaymentDecisionUserId(embed) || extractUserId(getEmbedText(embed));

      addPayment(stats, {
        key,
        source: "payment_log",
        messageId: msg.id,
        channelId: msg.channelId,
        ts: date.getTime(),
        status,
        creatorId,
        decisionUserId,
      });
    }
  }

  console.log("[SC_PAY_EVT_DASH_V2] logs de pagamento finalizados", {
    totalLogs: logMessages.length,
    linkedRecoveredAttempts,
    recoveredFromLogs: stats.debug.recoveredFromLogs,
  });
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

async function collectDashboardData(client, force = false) {
  if (!force && CACHE.payload && Date.now() - CACHE.at < CACHE_TTL_MS) {
    return CACHE.payload;
  }

  const stats = emptyStats();
  const seen = new Set();

  console.log("[SC_PAY_EVT_DASH_V2] etapa 1/6: pagamentos");
  await scanPayments(client, stats, seen);

  console.log("[SC_PAY_EVT_DASH_V2] etapa 2/6: logs pagamentos");
  await scanPaymentLogs(client, stats, seen);

  console.log("[SC_PAY_EVT_DASH_V2] etapa 3/6: eventos manuais");
  await scanEventChannel(client, stats, seen, REGISTRO_EVENTO_CHANNEL_ID, "manual", isEventManualEmbed);

  console.log("[SC_PAY_EVT_DASH_V2] etapa 4/6: poderes");
  await scanEventChannel(client, stats, seen, CH_PODERES_ID, "poderes", isPoderesEmbed);

  console.log("[SC_PAY_EVT_DASH_V2] etapa 5/6: evt3");
  await scanEventChannel(client, stats, seen, EVT3_EVENT_CHANNEL_ID, "evt3", isEventManualEmbed);

  console.log("[SC_PAY_EVT_DASH_V2] etapa 6/6: cronograma/hall/eventos diários");
  await scanEventChannel(client, stats, seen, CRONOGRAMA_LOGS_CHANNEL_ID, "crono", isCronoHallDailyEmbed);

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

function progressBar(value, limit = PAY_PERIOD_LIMIT, size = 12) {
  const safeValue = Math.max(0, Number(value || 0));
  const ratio = Math.min(1, safeValue / limit);
  const filled = Math.round(ratio * size);

  return "█".repeat(filled) + "░".repeat(Math.max(0, size - filled));
}

function topList(stats, field, limit = 5) {
  const list = Object.values(stats.users || {})
    .filter((u) => Number(u[field] || 0) > 0)
    .sort((a, b) => Number(b[field] || 0) - Number(a[field] || 0))
    .slice(0, limit);

  if (!list.length) return "_Sem dados ainda_";

  return list
    .map((u, i) => `**${i + 1}.** <@${u.userId}> — **${Number(u[field] || 0)}**`)
    .join("\n");
}

function weeklyHistory(stats, max = 4) {
  const keys = Object.keys(stats.byWeek || {}).sort().slice(-max);

  if (!keys.length) return "_Sem histórico ainda_";

  return keys
    .map((key) => {
      const b = stats.byWeek[key] || {};
      const label = periodKeyFromDateSP(new Date(`${key}T12:00:00-03:00`)).label;

      const pay = Number(b.paymentsApproved || 0);
      const evt =
        Number(b.eventsManual || 0) +
        Number(b.eventsPoderes || 0) +
        Number(b.eventsEvt3 || 0) +
        Number(b.eventsCrono || 0);

      return `\`${label}\` 💵 ${pay.toString().padStart(3, " ")} ${progressBar(pay, PAY_PERIOD_LIMIT, 8)} | 🎉 ${evt}`;
    })
    .join("\n");
}

function makeDashboardEmbed(stats) {
  const now = nowSP();
  const thisWeek = periodKeyFromDateSP(now);
  const lastWeekKey = periodKeyFromDateSP(addDaysUTC(new Date(`${thisWeek.key}T12:00:00-03:00`), -7)).key;
  const monthKey = monthKeyFromDateSP(now);

  const w = stats.byWeek[thisWeek.key] || {};
  const last = stats.byWeek[lastWeekKey] || {};
  const m = stats.byMonth[monthKey] || {};

  const payApproved = Number(w.paymentsApproved || 0);
  const payCreated = Number(w.paymentsCreated || 0);
  const payRejected = Number(w.paymentsRejected || 0);
  const payRequested = Number(w.paymentsRequested || 0);

  const eventsTotal =
    Number(w.eventsManual || 0) +
    Number(w.eventsPoderes || 0) +
    Number(w.eventsEvt3 || 0) +
    Number(w.eventsCrono || 0);

  const lastPayApproved = Number(last.paymentsApproved || 0);
  const lastEventsTotal =
    Number(last.eventsManual || 0) +
    Number(last.eventsPoderes || 0) +
    Number(last.eventsEvt3 || 0) +
    Number(last.eventsCrono || 0);

  const monthPayments =
    Number(m.paymentsCreated || 0) +
    Number(m.paymentsApproved || 0) +
    Number(m.paymentsRejected || 0) +
    Number(m.paymentsRequested || 0);

  const monthEvents =
    Number(m.eventsManual || 0) +
    Number(m.eventsPoderes || 0) +
    Number(m.eventsEvt3 || 0) +
    Number(m.eventsCrono || 0);

  const status =
    payApproved >= PAY_PERIOD_LIMIT
      ? "🚨 Limite batido"
      : payApproved >= PAY_PERIOD_GOAL
        ? "🟢 Meta batida"
        : payApproved >= PAY_PERIOD_OK
          ? "🟡 OK"
          : "🔴 Abaixo do OK";

  return new EmbedBuilder()
    .setColor(payApproved >= PAY_PERIOD_GOAL ? 0x22c55e : payApproved >= PAY_PERIOD_OK ? 0xf59e0b : 0xef4444)
    .setTitle("📊 Dashboard — Registros SantaCreators")
    .setDescription(
      [
        `**Período semanal:** \`${thisWeek.label}\``,
        `**Mês atual:** \`${labelFromMonthKey(monthKey)}\``,
        `**Atualizado:** <t:${Math.floor(Date.now() / 1000)}:f>`,
        "",
        `**Status:** ${status}`,
      ].join("\n")
    )
    .addFields(
      {
        name: "📌 Resumo da semana",
        value: [
          `💵 Pagamentos criados: **${payCreated}**`,
          `✅ Pagamentos aprovados: **${payApproved}**`,
          `📌 Solicitados: **${payRequested}**`,
          `❌ Reprovados: **${payRejected}**`,
          `🎉 Eventos / fontes: **${eventsTotal}**`,
          `📦 Total semanal: **${payCreated + eventsTotal}**`,
        ].join("\n"),
        inline: true,
      },
      {
        name: "📈 Comparativo semanal",
        value: [
          `💵 Pagamentos: **${lastPayApproved} → ${payApproved}** ${diffText(payApproved, lastPayApproved)}`,
          `🎉 Eventos: **${lastEventsTotal} → ${eventsTotal}** ${diffText(eventsTotal, lastEventsTotal)}`,
        ].join("\n"),
        inline: true,
      },
      {
        name: "🎯 Meta de pagamentos",
        value: [
          `**${status}**`,
          `🟡 OK: **${PAY_PERIOD_OK}** • 🟢 Meta: **${PAY_PERIOD_GOAL}** • 🚨 Limite: **${PAY_PERIOD_LIMIT}**`,
          `\`${progressBar(payApproved, PAY_PERIOD_LIMIT, 18)}\``,
          `📈 Progresso: **${payApproved}/${PAY_PERIOD_LIMIT}**`,
        ].join("\n"),
        inline: false,
      },
      {
        name: "📦 Totais do mês por fonte",
        value: [
          `💵 Pagamentos criados: **${Number(m.paymentsCreated || 0)}**`,
          `✅ Pagamentos aprovados: **${Number(m.paymentsApproved || 0)}**`,
          `📌 Solicitados: **${Number(m.paymentsRequested || 0)}**`,
          `❌ Reprovados: **${Number(m.paymentsRejected || 0)}**`,
          "",
          `🎉 Registros manuais: **${Number(m.eventsManual || 0)}**`,
          `⚡ Registros de poderes: **${Number(m.eventsPoderes || 0)}**`,
          `🧩 Eventos EVT3: **${Number(m.eventsEvt3 || 0)}**`,
          `📅 Cronograma / Hall / Eventos diários: **${Number(m.eventsCrono || 0)}**`,
          "",
          `📦 Total geral do mês: **${Number(m.paymentsCreated || 0) + monthEvents}**`,
        ].join("\n"),
        inline: false,
      },
      {
        name: "🏆 Ranking geral",
        value: topList(stats, "pointsTotal", 5),
        inline: true,
      },
      {
        name: "💵 Top pagamentos",
        value: topList(stats, "pointsPayment", 5),
        inline: true,
      },
      {
        name: "🎉 Top eventos",
        value: topList(stats, "pointsEvent", 5),
        inline: true,
      },
      {
        name: "📊 Histórico — últimas semanas",
        value: weeklyHistory(stats, 4),
        inline: false,
      },
      {
        name: "🧪 Auditoria técnica",
        value: [
          `Canal pagamentos: **${stats.debug.scannedChannels[PAY_CHANNEL_ID] || 0} msgs**`,
          `Logs pagamentos: **${stats.debug.scannedChannels[PAY_LOG_CHANNEL_ID] || 0} msgs**`,
          `Recuperados por logs: **${stats.debug.recoveredFromLogs || 0}**`,
          `Duplicados ignorados: **${stats.debug.duplicatesIgnored || 0}**`,
        ].join("\n"),
        inline: false,
      }
    )
    .setFooter({
      text: `${DASH_MARKER} • Atualização automática + logs + registros antigos`,
    })
    .setTimestamp(new Date());
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
    const msg = await channel.messages.fetch(state.dashboardMsgId).catch(() => null);
    if (msg) return msg;
  }

  const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  if (!messages) return null;

  return [...messages.values()]
    .filter((m) => m.author?.id === client.user.id)
    .filter((m) => m.embeds?.length)
    .find((m) => String(m.embeds[0]?.footer?.text || "").includes(DASH_MARKER)) || null;
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
    console.log("[SC_PAY_EVT_DASH_V2] atualização iniciada:", reason);

    const channel = await client.channels.fetch(DASH_CHANNEL_ID).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      throw new Error(`Canal do dashboard não encontrado: ${DASH_CHANNEL_ID}`);
    }

    if (recreate) {
      saveState({
        dashboardMsgId: null,
        lastFingerprint: "",
        lastUpdatedAt: null,
      });
    }

    const stats = await collectDashboardData(client, force);
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

    console.log("[SC_PAY_EVT_DASH_V2] dashboard atualizado:", {
      reason,
      messageId: msg.id,
      payments: stats.payments.length,
      events: stats.events.length,
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
      `🎉 Eventos semana: **${Number(w.eventsManual || 0) + Number(w.eventsPoderes || 0) + Number(w.eventsEvt3 || 0) + Number(w.eventsCrono || 0)}**`,
      "",
      `📦 Criados mês: **${Number(m.paymentsCreated || 0)}**`,
      `✅ Aprovados mês: **${Number(m.paymentsApproved || 0)}**`,
      "",
      `Canal pagamentos: **${stats.debug.scannedChannels[PAY_CHANNEL_ID] || 0} msgs**`,
      `Canal logs: **${stats.debug.scannedChannels[PAY_LOG_CHANNEL_ID] || 0} msgs**`,
      `Recuperados por logs: **${stats.debug.recoveredFromLogs || 0}**`,
      `Duplicados ignorados: **${stats.debug.duplicatesIgnored || 0}**`,
    ].join("\n"),
  }).catch(() => {});
}

// =========================
// EXPORTS
// =========================
export async function payEvtDashOnReady(client) {
  if (client.__SC_PAY_EVT_DASH_V2_READY__) return;
  client.__SC_PAY_EVT_DASH_V2_READY__ = true;

  dashOn("cronograma:aprovado", () => scheduleUpdate(client, "dashOn:cronograma"));
  dashOn("halldafama:aprovado", () => scheduleUpdate(client, "dashOn:halldafama"));
  dashOn("eventosdiarios:aprovado", () => scheduleUpdate(client, "dashOn:eventosdiarios"));

  dashOn("pagamento:criado", () => scheduleUpdate(client, "dashOn:pagamento:criado"));
  dashOn("pagamento:pago", () => scheduleUpdate(client, "dashOn:pagamento:pago"));
  dashOn("pagamento:solicitado", () => scheduleUpdate(client, "dashOn:pagamento:solicitado"));
  dashOn("pagamento:reprovado", () => scheduleUpdate(client, "dashOn:pagamento:reprovado"));
  dashOn("pagamento:status", () => scheduleUpdate(client, "dashOn:pagamento:status"));

  await renderDashboard(client, "ready", { force: true });

  if (!client.__SC_PAY_EVT_DASH_V2_INTERVAL__) {
    client.__SC_PAY_EVT_DASH_V2_INTERVAL__ = setInterval(() => {
      renderDashboard(client, "interval:5min", { force: true }).catch(() => null);
    }, 5 * 60 * 1000);
  }
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
  ]);

  if (!commands.has(content)) return false;

  if (!hasPermission(message.member, message.author.id)) {
    await message.reply("🚫 Você não tem permissão para atualizar esse dashboard.").catch(() => {});
    return true;
  }

  const recreate = content === "!criarsocial" || content === "!criardashsocial";
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

    const input = new TextInputBuilder()
      .setCustomId("adjust_text")
      .setLabel("Anotação do ajuste")
      .setPlaceholder("Ex: ajuste feito manualmente após conferência dos logs")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(input));

    await interaction.showModal(modal).catch(() => {});
    return true;
  }

  if (interaction.isModalSubmit() && interaction.customId === "PEV_ADJUST_MODAL") {
    await interaction.deferReply({ ephemeral: true }).catch(() => {});

    const text = interaction.fields.getTextInputValue("adjust_text");

    console.log("[SC_PAY_EVT_DASH_V2] ajuste manual registrado:", {
      by: interaction.user.id,
      text,
    });

    const result = await renderDashboard(client, "modal:adjust", {
      force: true,
    });

    await interaction.editReply({
      content: result.ok
        ? "✅ Ajuste registrado em log e dashboard recalculado."
        : `❌ Ajuste registrado, mas falhei ao recalcular.\nMotivo: \`${result.error || result.message || "erro desconhecido"}\``,
    }).catch(() => {});

    return true;
  }

  return false;
}