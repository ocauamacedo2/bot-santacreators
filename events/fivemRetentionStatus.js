// /application/events/fivemRetentionStatus.js
// FIVEM RETENTION STATUS — sticky (auto + manual refresh) [ESM, robusto]
// ✅ Feito para teu roteador central (ready + interactionCreate), SEM client.on aqui

import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
  MessageFlags,
} from "discord.js";
import mongoose from "mongoose";

// ⚙️ CONFIG
const FIVEM_PANEL_CHANNEL_ID = "1501321157259956244";
const FIVEM_REFRESH_INTERVAL_MS = 2 * 60 * 1000; // coleta a cada 2 minutos
const FIVEM_PANEL_REFRESH_INTERVAL_MS = 10 * 60 * 1000; // edita o painel a cada 10 minutos
const FIVEM_HISTORY_MAX_DAYS = 30; // Limitar histórico a 30 dias
const FIVEM_FETCH_TIMEOUT_MS = 10 * 1000; // 10 segundos
const FIVEM_COMPARISON_TOLERANCE_MS = 10 * 60 * 1000; // 10 minutos
const FIVEM_TIMEZONE = "America/Sao_Paulo";
const FIVEM_RANK_MARKER_TAG = "[FIVEM_RETENTION_STATUS]";
const FIVEM_CONT_MARKER_TAG = "[FIVEM_RETENTION_STATUS_CONT]";
const FIVEM_MAX_EMBED_CHARS_PER_MESSAGE = 5600;
const FIVEM_MAX_EMBEDS_PER_MESSAGE = 10;

// Semana A = Quinta 00:00-01:00 / Sábado 21:00-22:00
// Semana B = Quinta 21:00-22:00 / Sábado 00:00-01:00
const FIVEM_EVENT_WEEK_A_START = "2026-05-17";

// 🗄️ MONGODB MODELS
const HistorySchema = new mongoose.Schema({
  timestamp: { type: Number, index: true },
  iso: String,
  spDate: { type: String, index: true },
  spTime: String,
  spWeekday: String,
  hour: Number,
  minute: Number,
  cities: mongoose.Schema.Types.Mixed,
  totalClients: Number,
  totalMaxClients: Number,
});
const HistoryModel = mongoose.models.FivemRetentionHistory || mongoose.model("FivemRetentionHistory", HistorySchema);

const PeakSchema = new mongoose.Schema({
  date: { type: String, unique: true },
  total: mongoose.Schema.Types.Mixed,
  cities: mongoose.Schema.Types.Mixed,
  exact21h: mongoose.Schema.Types.Mixed, // Novo campo para players às 21:00
  eventWindows: mongoose.Schema.Types.Mixed, // Picos separados por janela exata de evento
});
const PeakModel = mongoose.models.FivemRetentionPeak || mongoose.model("FivemRetentionPeak", PeakSchema);

const FIVEM_STATE = new Map(); // channelId -> { intervalId, messageId }
const FIVEM_DEBUG = false; // 🛑 Desativa os logs de depuração para evitar flood

const DEFAULT_COLOR = 0x2b2d31;

// 🎨 UI LAYOUT HELPERS
const UI = {
  SEP: "━━━━━━━━━━━━━━━━━━━━━━━━",
  DIVIDER: "────────────────────────",
  GROWTH: "🟢",
  DROP: "🔴",
  STABLE: "🟠",
  NONE: "⚪"
};

const FIVEM_CITIES = [
 {
   key: "santa",
   name: "Santa",
   emoji: "🏙️",
   code: "ymkax5",
   url: "https://servers-frontend.fivem.net/api/servers/single/ymkax5",
 },
 {
   key: "grande",
   name: "Grande",
   emoji: "🌆",
   code: "vre5mr",
   url: "https://servers-frontend.fivem.net/api/servers/single/vre5mr",
 },
 {
   key: "maresia",
   name: "Maresia",
   emoji: "🌊",
   code: "ym86dj",
   url: "https://servers-frontend.fivem.net/api/servers/single/ym86dj",
 },
 {
   key: "nobre",
   name: "Nobre",
   emoji: "👑",
   code: "vxz4gq",
   url: "https://servers-frontend.fivem.net/api/servers/single/vxz4gq",
 },
];

// ---------- UTILS ----------
function cn2ParseColor(input, fallback = 0x2b2d31) {
 if (!input) return fallback;
 let s = String(input).trim();
 if (/^#?[0-9a-f]{6}$/i.test(s)) {
   if (s.startsWith("#")) s = s.slice(1);
   return parseInt(s, 16);
 }
 if (/^0x[0-9a-f]{6}$/i.test(s)) return parseInt(s, 16);
 const n = Number(s);
 return Number.isFinite(n) && n >= 0 ? n : fallback;
}
function cn2LogApiError(prefix, e) {
 try {
   console.error(prefix, {
     name: e?.name,
     code: e?.code,
     status: e?.status,
     message: e?.message,
     raw: e?.rawError ?? undefined,
     data: e?.requestData ?? undefined,
   });
 } catch {
   console.error(prefix, e);
 }
}
async function getFetch() {
 if (typeof globalThis.fetch === "function") return globalThis.fetch.bind(globalThis);
 try {
   const mod = await import("node-fetch");
   return (mod.default || mod.fetch).bind(globalThis);
 } catch {
   throw new Error("[FIVEM_RETENTION] fetch não disponível. Use Node 18+ ou instale node-fetch.");
 }
}

function getSaoPauloParts(date = new Date()) {
 const parts = new Intl.DateTimeFormat("en-CA", {
   timeZone: FIVEM_TIMEZONE,
   year: "numeric",
   month: "2-digit",
   day: "2-digit",
   hour: "2-digit",
   minute: "2-digit",
   second: "2-digit",
   hour12: false,
 }).formatToParts(date);
 const get = (t) => Number(parts.find((p) => p.type === t)?.value || 0);
 return {
   year: get("year"),
   month: get("month"),
   day: get("day"),
   hour: get("hour"),
   minute: get("minute"),
   second: get("second"),
   weekday: new Intl.DateTimeFormat("pt-BR", { weekday: "long", timeZone: FIVEM_TIMEZONE }).format(date),
 };
}
function getWeekKeySP(date = new Date()) {
 const { year, month, day } = getSaoPauloParts(date);
 const d = new Date(year, month - 1, day);
 const dayOfWeek = d.getDay(); // 0 = Sunday
 const diff = d.getDate() - dayOfWeek;
 const sunday = new Date(d.setDate(diff));
 return `${sunday.getFullYear()}-${String(sunday.getMonth() + 1).padStart(2, '0')}-${String(sunday.getDate()).padStart(2, '0')}`;
}

/**
 * Resolve o dia da semana em São Paulo (0=Dom, 1=Seg...)
 */
export function getSaoPauloWeekday(date = new Date()) {
  const spDate = new Date(date.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  return spDate.getDay();
}

/**
 * Retorna a janela de pico baseada no dia da semana
 */
function getWeekModeSP(date = new Date()) {
  const currentWeekStart = getWeekKeySP(date);
  const current = new Date(`${currentWeekStart}T00:00:00-03:00`).getTime();
  const anchor = new Date(`${FIVEM_EVENT_WEEK_A_START}T00:00:00-03:00`).getTime();

  const diffWeeks = Math.floor((current - anchor) / (7 * 24 * 60 * 60 * 1000));
  return diffWeeks % 2 === 0 ? "A" : "B";
}

export function getPrimeTimeWindow(snapshot, customWeekday = null) {
  const baseDate = snapshot?.timestamp ? new Date(snapshot.timestamp) : new Date();
  const weekday = customWeekday !== null ? customWeekday : getSaoPauloWeekday(baseDate);
  const weekMode = getWeekModeSP(baseDate);

  if (weekday === 0) {
    return { startHour: 20, startMinute: 0, endHour: 23, endMinute: 0, label: "20:00 às 23:00", eventKey: "rede_domingo_20_23", cityKey: "total", cityName: "Geral (Rede)", emoji: "🌐", weekMode };
  }

  if (weekday === 1) {
    return { startHour: 21, startMinute: 0, endHour: 22, endMinute: 0, label: "21:00 às 22:00", eventKey: "maresia_segunda_21_22", cityKey: "maresia", cityName: "Maresia", emoji: "🌊", weekMode };
  }

  if (weekday === 2) {
    return { startHour: 23, startMinute: 0, endHour: 24, endMinute: 0, label: "23:00 às 00:00", eventKey: "grande_terca_23_00", cityKey: "grande", cityName: "Grande", emoji: "🌆", weekMode };
  }

  if (weekday === 3) {
    return { startHour: 21, startMinute: 0, endHour: 22, endMinute: 0, label: "21:00 às 22:00", eventKey: "santa_quarta_21_22", cityKey: "santa", cityName: "Santa", emoji: "🏙️", weekMode };
  }

  if (weekday === 4) {
    if (weekMode === "A") {
      return { startHour: 0, startMinute: 0, endHour: 1, endMinute: 0, label: "00:00 às 01:00", eventKey: "nobre_quinta_00_01", cityKey: "nobre", cityName: "Nobre (Qui)", emoji: "👑", weekMode };
    }

    return { startHour: 21, startMinute: 0, endHour: 22, endMinute: 0, label: "21:00 às 22:00", eventKey: "nobre_quinta_21_22", cityKey: "nobre", cityName: "Nobre (Qui)", emoji: "👑", weekMode };
  }

  if (weekday === 5) {
    return { startHour: 21, startMinute: 0, endHour: 22, endMinute: 0, label: "21:00 às 22:00", eventKey: "nobre_sexta_21_22", cityKey: "nobre", cityName: "Nobre (Sex)", emoji: "👑", weekMode };
  }

  if (weekday === 6) {
    if (weekMode === "A") {
      return { startHour: 21, startMinute: 0, endHour: 22, endMinute: 0, label: "21:00 às 22:00", eventKey: "nobre_sabado_21_22", cityKey: "nobre", cityName: "Nobre (Sab)", emoji: "👑", weekMode };
    }

    return { startHour: 0, startMinute: 0, endHour: 1, endMinute: 0, label: "00:00 às 01:00", eventKey: "nobre_sabado_00_01", cityKey: "nobre", cityName: "Nobre (Sab)", emoji: "👑", weekMode };
  }

  return null;
}

/**
 * Configuração de foco dinâmico por dia de evento
 */
export function getEventDayFocusConfig(snapshot, customWeekday = null) {
  const weekday = customWeekday !== null ? customWeekday : getSaoPauloWeekday(new Date(snapshot.timestamp));
  const window = getPrimeTimeWindow(snapshot, weekday);
  if (!window) return []; // Retorna array vazio se não houver janela de evento

  const configs = [];

  // Domingo: Geral (Rede)
  if (weekday === 0) {
    configs.push({ cityKey: "total", cityName: "Geral (Rede)", emoji: "🌐" });
  }
  // Segunda: Maresia
  else if (weekday === 1) {
    configs.push({ cityKey: "maresia", cityName: "Maresia", emoji: "🌊" });
  }
  // Terça: Grande
  else if (weekday === 2) {
    configs.push({ cityKey: "grande", cityName: "Grande", emoji: "🌆" });
  }
  // Quarta: Santa
  else if (weekday === 3) {
    configs.push({ cityKey: "santa", cityName: "Santa", emoji: "🏙️" });
  }
  // Quinta, Sexta, Sábado: Nobre
  else if ([4, 5, 6].includes(weekday)) {
    configs.push({ cityKey: "nobre", cityName: "Nobre", emoji: "👑" });
  }

  // Anexa os detalhes da janela de tempo a cada configuração
  return configs.map(config => ({
    ...config,
    title: `🎯 RETENÇÃO DO EVENTO — BR ${config.cityName.toUpperCase()}`,
    label: window.label,
    startHour: window.startHour,
    startMinute: window.startMinute
  }));
}

/**
 * Verifica se é o momento de capturar o total "em ponto" das 21:00
 * (Captura o primeiro registro entre 21:00 e 21:01:59)
 */
export function isExact21hSnapshot(snapshot) {
  const weekday = getSaoPauloWeekday(new Date(snapshot.timestamp));
  // Dias de Segunda a Sábado (1-6)
  const isRelevantDay = (weekday >= 1 && weekday <= 6);

  // Captura o primeiro snapshot da hora 21 (intervalo de 2min)
  return isRelevantDay && snapshot.hour === 21 && snapshot.minute < 2;
}

function formatNumber(n) {
 if (typeof n !== 'number' || isNaN(n)) return 'N/A';
 return n.toLocaleString('pt-BR');
}

function safeNumber(value, fallback = 0) {
 const n = Number(value);
 return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function calculateDiff(current, previous) {
 if (typeof current !== 'number' || isNaN(current)) return { diff: 'N/A', pct: 'N/A', arrow: UI.NONE };
 if (typeof previous !== 'number' || isNaN(previous) || previous === 0) {
   return { diff: current, pct: 'sem base', arrow: current > 0 ? UI.GROWTH + ' ▲' : (current < 0 ? UI.DROP + ' ▼' : UI.STABLE + ' ➖') };
 }
 const diff = current - previous;
 const pct = (diff / previous) * 100;
 // Correção: 🟢 = crescimento, 🔴 = queda, 🟠 = estabilidade
 return { diff, pct, arrow: diff > 0 ? UI.GROWTH + ' ▲' : (diff < 0 ? UI.DROP + ' ▼' : UI.STABLE + ' ➖') };
}
function formatDiff(diffObj) {
 if (diffObj.diff === 'N/A') return 'N/A';
 const diffStr = diffObj.diff > 0 ? `+${formatNumber(diffObj.diff)}` : formatNumber(diffObj.diff);
 const pctStr = diffObj.pct === 'sem base' ? 'sem base' : `${diffObj.pct.toFixed(1)}%`;
 return `${diffObj.arrow} ${diffStr} (${pctStr})`;
}
function getEmbedCharSize(embed) {
 const data = typeof embed?.toJSON === "function" ? embed.toJSON() : embed;
 if (!data) return 0;

 let total = 0;

 total += String(data.title || "").length;
 total += String(data.description || "").length;
 total += String(data.footer?.text || "").length;
 total += String(data.author?.name || "").length;

 if (Array.isArray(data.fields)) {
   for (const field of data.fields) {
     total += String(field.name || "").length;
     total += String(field.value || "").length;
   }
 }

 return total;
}

function packEmbedsForDiscord(embeds) {
 const groups = [];
 let currentGroup = [];
 let currentSize = 0;

 for (const embed of embeds) {
   const embedSize = getEmbedCharSize(embed);

   const wouldExceedSize = currentSize + embedSize > FIVEM_MAX_EMBED_CHARS_PER_MESSAGE;
   const wouldExceedCount = currentGroup.length >= FIVEM_MAX_EMBEDS_PER_MESSAGE;

   if (currentGroup.length > 0 && (wouldExceedSize || wouldExceedCount)) {
     groups.push(currentGroup);
     currentGroup = [];
     currentSize = 0;
   }

   currentGroup.push(embed);
   currentSize += embedSize;
 }

 if (currentGroup.length > 0) {
   groups.push(currentGroup);
 }

 return groups;
}

function cloneEmbedWithFooterTag(embed, tag) {
 const data = typeof embed?.toJSON === "function" ? embed.toJSON() : embed;
 const cloned = new EmbedBuilder(data);

 const oldFooter = data?.footer?.text || "";
 const newFooter = oldFooter.includes(tag)
   ? oldFooter
   : oldFooter
     ? `${oldFooter} • ${tag}`
     : tag;

 cloned.setFooter({
   text: newFooter,
   iconURL: data?.footer?.icon_url,
 });

 return cloned;
}

function markEmbedGroupWithFooterTag(group, tag) {
 if (!group?.length) return group;

 return group.map((embed, index) => {
   if (index !== 0) return embed;
   return cloneEmbedWithFooterTag(embed, tag);
 });
}

async function cleanupContinuationMessages(channel, botId) {
 const msgs = await channel.messages.fetch({ limit: 50 }).catch(() => null);
 if (!msgs) return;

 const continuations = msgs.filter(
   (m) =>
     m.author?.id === botId &&
     m.embeds?.some(e => (e.footer?.text || "").includes(FIVEM_CONT_MARKER_TAG))
 );

 for (const msg of continuations.values()) {
   await msg.delete().catch(() => {});
 }
}

async function syncContinuationMessages(channel, botId, embedGroups, row = null) {
 const msgs = await channel.messages.fetch({ limit: 50 }).catch(() => null);

 const existing = msgs
   ? [...msgs.values()]
       .filter(
         (m) =>
           m.author?.id === botId &&
           m.embeds?.some(e => (e.footer?.text || "").includes(FIVEM_CONT_MARKER_TAG))
       )
       .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
   : [];

 for (let i = 0; i < embedGroups.length; i++) {
   const group = embedGroups[i];
   const isLastGroup = i === embedGroups.length - 1;
   const markedGroup = markEmbedGroupWithFooterTag(group, FIVEM_CONT_MARKER_TAG);
   const payload = {
     embeds: markedGroup,
     components: row && isLastGroup ? [row] : [],
   };

   if (existing[i]) {
     await existing[i].edit(payload).catch((e) => {
       cn2LogApiError("[FIVEM_RETENTION] Falha ao editar continuação do painel:", e);
     });
   } else {
     await channel.send(payload).catch((e) => {
       cn2LogApiError("[FIVEM_RETENTION] Falha ao criar continuação do painel:", e);
     });
   }
 }

 for (let i = embedGroups.length; i < existing.length; i++) {
   await existing[i].delete().catch(() => {});
 }
}
// ---------- DATA PERSISTENCE (MONGODB) ----------
async function addSnapshot(newSnapshot) {
  try {
    const last = await HistoryModel.findOne().sort({ timestamp: -1 });
    if (last && (newSnapshot.timestamp - last.timestamp < 60 * 1000)) return false;

    await HistoryModel.create(newSnapshot);

    FIVEM_DEBUG && console.log(
      "[FIVEM_RETENTION] Snapshot salvo no MongoDB:",
      newSnapshot.spDate,
      newSnapshot.spTime,
      "Total:",
      newSnapshot.totalClients
    );
    
    // Limpeza automática de dados antigos (>30 dias)
    const thirtyDaysAgo = Date.now() - FIVEM_HISTORY_MAX_DAYS * 24 * 60 * 60 * 1000;
    await HistoryModel.deleteMany({ timestamp: { $lt: thirtyDaysAgo } });
    
    return true;
  } catch (e) {
    console.error("[FIVEM_RETENTION] Erro ao salvar snapshot no MongoDB:", e);
    return false;
  }
}

async function getSnapshotDaysAgo(days, currentSnapshot = null) {
 const baseTimestamp = currentSnapshot?.timestamp || Date.now();
 const targetDate = new Date(baseTimestamp - days * 24 * 60 * 60 * 1000);
 const targetParts = getSaoPauloParts(targetDate);

 const targetDateKey = `${targetParts.year}-${String(targetParts.month).padStart(2, "0")}-${String(targetParts.day).padStart(2, "0")}`;
 const targetMinutes = Number(currentSnapshot?.hour ?? getSaoPauloParts(new Date()).hour) * 60 + Number(currentSnapshot?.minute ?? getSaoPauloParts(new Date()).minute);

 try {
   const candidates = await HistoryModel.find({ spDate: targetDateKey }).lean();

   if (!candidates?.length) {
     FIVEM_DEBUG && console.log(
       `[FIVEM_RETENTION] Sem base histórica para ${days} dia(s) atrás:`,
       targetDateKey
     );
     return null;
   }

   let best = null;
   let bestDistance = Infinity;

   for (const snap of candidates) {
     const snapMinutes = Number(snap.hour || 0) * 60 + Number(snap.minute || 0);
     const distance = Math.abs(snapMinutes - targetMinutes);

     if (distance < bestDistance) {
       best = snap;
       bestDistance = distance;
     }
   }

   const toleranceMinutes = Math.ceil(FIVEM_COMPARISON_TOLERANCE_MS / 60000);

   if (bestDistance > toleranceMinutes) {
     FIVEM_DEBUG && console.log(
       `[FIVEM_RETENTION] Snapshot encontrado fora da tolerância para ${days} dia(s) atrás:`,
       targetDateKey,
       `distância ${bestDistance}min`
     );
   }

   return best;
 } catch (e) {
   console.error(`[FIVEM_RETENTION] Erro ao buscar snapshot histórico (${days} dias atrás):`, e.message);
   return null;
 }
}

async function getExact21hHistory(dateKey) {
  try {
    const candidates = await HistoryModel.find({
      spDate: dateKey,
      hour: 21,
    }).lean();

    if (!candidates?.length) {
      FIVEM_DEBUG && console.log(
        "[FIVEM_RETENTION] Sem histórico exato das 21h para:",
        dateKey
      );
      return null;
    }

    let best = null;
    let bestDistance = Infinity;

    for (const snap of candidates) {
      const minute = Number(snap.minute || 0);
      const distance = Math.abs(minute - 0);

      if (distance < bestDistance) {
        best = snap;
        bestDistance = distance;
      }
    }

    return best;
  } catch (e) {
    console.error(
      "[FIVEM_RETENTION] Erro ao buscar histórico exato das 21h:",
      e?.message || e
    );
    return null;
  }
}

async function loadPeaksMap() {
  try {
    const docs = await PeakModel.find();
    const map = {};
    for (const d of docs) {
      map[d.date] = d.toObject();
    }
    return map;
  } catch (e) {
    console.error("[FIVEM_RETENTION] Erro ao carregar picos do MongoDB:", e);
    return {};
  }
}

function getDateKeyDaysAgoFromSnapshot(currentSnapshot, days) {
 const base = new Date(currentSnapshot.timestamp - days * 24 * 60 * 60 * 1000);
 const parts = getSaoPauloParts(base);

 return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function isPrimeTimeSnapshot(snapshot) {
  const window = getPrimeTimeWindow(snapshot);
  if (!window) return false;

  const currentTotalMinutes = snapshot.hour * 60 + snapshot.minute;
  const startTotalMinutes = window.startHour * 60 + (window.startMinute || 0);
  const endTotalMinutes = window.endHour * 60 + (window.endMinute || 0);

  return currentTotalMinutes >= startTotalMinutes && currentTotalMinutes < endTotalMinutes;
}

function isInsideCurrentEventWindow(snapshot) {
  const window = getPrimeTimeWindow(snapshot);
  if (!window) return false;

  const currentMinutes = snapshot.hour * 60 + snapshot.minute;
  const startMinutes = window.startHour * 60 + (window.startMinute || 0);
  const endMinutes = window.endHour * 60 + (window.endMinute || 0);

  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

async function updateDailyPeaks(currentSnapshot) {
  try {
    const dateKey = currentSnapshot.spDate;
    let dayPeak = await PeakModel.findOne({ date: dateKey });
    let hasChange = false;
    const nowTs = currentSnapshot.timestamp;

    if (!dayPeak) {
      hasChange = true;
      dayPeak = new PeakModel({ // Garante que o objeto total e cities existam
  date: dateKey,
  total: { peak: 0, peakTime: null, peakAt: 0, primePeak: 0, primePeakTime: null, primePeakAt: 0 },
  cities: {},
  exact21h: { total: 0, cities: {} }, // Inicializa o novo campo
  eventWindows: {}
});
    } else if (!dayPeak.exact21h) { // Adiciona o campo se não existir em documentos antigos
  dayPeak.exact21h = { total: 0, cities: {} };
  hasChange = true;
}

if (!dayPeak.eventWindows) {
  dayPeak.eventWindows = {};
  hasChange = true;
}

    // Garante que todas as cidades configuradas existem no objeto Mixed (evita erro em novas cidades)
    for (const city of FIVEM_CITIES) {
      if (!dayPeak.cities[city.key]) {
        dayPeak.cities[city.key] = { 
          name: city.name, emoji: city.emoji, 
          peak: 0, peakTime: null, peakAt: 0, 
          primePeak: 0, primePeakTime: null, primePeakAt: 0 
        };
      }
    }

    // Atualiza o pico exato das 21:00
    if (isExact21hSnapshot(currentSnapshot)) {
      if (dayPeak.exact21h.total !== currentSnapshot.totalClients) {
        dayPeak.exact21h.total = currentSnapshot.totalClients || 0;
        dayPeak.exact21h.cities = currentSnapshot.cities;
        hasChange = true;
      }
    }

    // 1. Atualização de Pico Geral (sempre no dia atual)
    if ((currentSnapshot.totalClients || 0) > (dayPeak.total.peak || 0)) {
      dayPeak.total.peak = currentSnapshot.totalClients || 0;
      dayPeak.total.peakTime = currentSnapshot.spTime;
      dayPeak.total.peakAt = nowTs;
      hasChange = true;
    }

    // 2. Atualização de Pico Prime (Evento) com suporte a rollover
    const weekday = getSaoPauloWeekday(new Date(nowTs));
   const winToday = getPrimeTimeWindow(currentSnapshot, weekday);
    const currentMins = currentSnapshot.hour * 60 + currentSnapshot.minute;

    // Caso A: Janela de hoje
    if (winToday && currentMins >= (winToday.startHour * 60 + winToday.startMinute) && currentMins < (winToday.endHour * 60 + winToday.endMinute)) {
  if (updatePrimePeaksInDoc(dayPeak, currentSnapshot)) hasChange = true;
  if (updateEventWindowPeakInDoc(dayPeak, currentSnapshot, winToday)) hasChange = true;
}
    // Caso B: Janela de ontem (rollover)
    else if (currentSnapshot.hour < 4) {
  const yesterday = new Date(nowTs - 24 * 60 * 60 * 1000);
  const winY = getPrimeTimeWindow({ timestamp: yesterday.getTime() }, getSaoPauloWeekday(yesterday));

  const isMidnightWindow = winY && winY.startHour === 0 && winY.endHour === 1;
  const isRolloverWindow = winY && winY.endHour > 24;

  if (winY && (isMidnightWindow || isRolloverWindow)) {
    const minsRollover = isMidnightWindow
      ? currentSnapshot.hour * 60 + currentSnapshot.minute
      : (currentSnapshot.hour + 24) * 60 + currentSnapshot.minute;

    const startMinutes = winY.startHour * 60 + winY.startMinute;
    const endMinutes = winY.endHour * 60 + winY.endMinute;

    if (minsRollover >= startMinutes && minsRollover < endMinutes) {
           const yParts = getSaoPauloParts(yesterday);
           const yKey = `${yParts.year}-${String(yParts.month).padStart(2, '0')}-${String(yParts.day).padStart(2, '0')}`;
           const yDoc = await PeakModel.findOne({ date: yKey });
           if (yDoc) {
             let changedYesterdayDoc = false;

if (updatePrimePeaksInDoc(yDoc, currentSnapshot)) {
  changedYesterdayDoc = true;
}

if (updateEventWindowPeakInDoc(yDoc, currentSnapshot, winY)) {
  changedYesterdayDoc = true;
}

if (changedYesterdayDoc) {
  yDoc.markModified('total');
  yDoc.markModified('cities');
  yDoc.markModified('eventWindows');
  await yDoc.save();
}
           }
        }
      }
    }

    for (const cityConfig of FIVEM_CITIES) {
      const cityData = currentSnapshot.cities?.[cityConfig.key];
      if (!cityData) continue;

      const cityPeak = dayPeak.cities[cityConfig.key];
      if ((cityData.clients || 0) > (cityPeak.peak || 0)) {
        cityPeak.peak = cityData.clients || 0;
        cityPeak.peakTime = currentSnapshot.spTime;
        cityPeak.peakAt = nowTs;
        hasChange = true;
      }
    }

    dayPeak.markModified('total');
dayPeak.markModified('cities');
dayPeak.markModified('exact21h'); // Marca o novo campo como modificado
dayPeak.markModified('eventWindows');
await dayPeak.save();

    // Limpeza de picos antigos (opcional, para manter paridade com History)
    const thirtyDaysAgoDate = new Date(Date.now() - FIVEM_HISTORY_MAX_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await PeakModel.deleteMany({ date: { $lt: thirtyDaysAgoDate } });

return hasChange;
  } catch (e) {
    console.error("[FIVEM_RETENTION] Erro ao atualizar picos diários:", e);
    return false;
  }
}

/**
 * Helper interno para atualizar picos de horário nobre em um documento
 */
function updatePrimePeaksInDoc(peakDoc, snapshot) {
  let changed = false;
  if ((snapshot.totalClients || 0) > (peakDoc.total.primePeak || 0)) {
    peakDoc.total.primePeak = snapshot.totalClients || 0;
    peakDoc.total.primePeakTime = snapshot.spTime;
    peakDoc.total.primePeakAt = snapshot.timestamp;
    changed = true;
  }
  for (const cityKey in snapshot.cities) {
    const cityData = snapshot.cities[cityKey];
    const cityPeak = peakDoc.cities[cityKey];
    if (cityPeak && (cityData.clients || 0) > (cityPeak.primePeak || 0)) {
      cityPeak.primePeak = cityData.clients || 0;
      cityPeak.primePeakTime = snapshot.spTime;
      cityPeak.primePeakAt = snapshot.timestamp;
      changed = true;
    }
  }
  return changed;
}

function updateEventWindowPeakInDoc(peakDoc, snapshot, window) {
  if (!window?.eventKey) return false;

  let changed = false;
  const isTotal = window.cityKey === "total";

  const currentValue = isTotal
    ? snapshot.totalClients || 0
    : snapshot.cities?.[window.cityKey]?.clients || 0;

  if (!peakDoc.eventWindows) peakDoc.eventWindows = {};

  const currentStored = peakDoc.eventWindows[window.eventKey] || {
    peak: 0,
    peakTime: null,
    peakAt: 0,
    label: window.label,
    cityKey: window.cityKey,
    cityName: window.cityName,
    emoji: window.emoji,
    dateKey: peakDoc.date,
    weekKey: getWeekKeySP(new Date(snapshot.timestamp)),
    weekMode: window.weekMode,
  };

  if (currentValue > (currentStored.peak || 0)) {
    peakDoc.eventWindows[window.eventKey] = {
      ...currentStored,
      peak: currentValue,
      peakTime: snapshot.spTime,
      peakAt: snapshot.timestamp,
      label: window.label,
      cityKey: window.cityKey,
      cityName: window.cityName,
      emoji: window.emoji,
      dateKey: peakDoc.date,
      weekKey: getWeekKeySP(new Date(snapshot.timestamp)),
      weekMode: window.weekMode,
    };

    changed = true;
  }

  return changed;
}

function getAlternatingPairEventKey(eventKey) {
 const pairs = {
   nobre_quinta_00_01: "nobre_quinta_21_22",
   nobre_quinta_21_22: "nobre_quinta_00_01",
   nobre_sabado_00_01: "nobre_sabado_21_22",
   nobre_sabado_21_22: "nobre_sabado_00_01",
 };

 return pairs[eventKey] || null;
}

function isAlternatingEventKey(eventKey) {
 return Boolean(getAlternatingPairEventKey(eventKey));
}

function getWindowPeakFromDoc(peakDoc, eventKey) {
 return peakDoc?.eventWindows?.[eventKey] || null;
}

function buildAlternatingComparison({ currentPeakDoc, previousWeekDoc, twoWeeksAgoDoc, eventKey }) {
 const currentWindow = getWindowPeakFromDoc(currentPeakDoc, eventKey);
 const oppositeEventKey = getAlternatingPairEventKey(eventKey);

 const previousOppositeWindow = oppositeEventKey
   ? getWindowPeakFromDoc(previousWeekDoc, oppositeEventKey)
   : null;

 const sameWindowTwoWeeksAgo = isAlternatingEventKey(eventKey)
   ? getWindowPeakFromDoc(twoWeeksAgoDoc, eventKey)
   : null;

 const normalPreviousWindow = getWindowPeakFromDoc(previousWeekDoc, eventKey);

 return {
   currentWindow,
   oppositeEventKey,
   previousOppositeWindow,
   sameWindowTwoWeeksAgo,
   normalPreviousWindow,
 };
}
function formatPeakCompare(current, previous) {
 if (!previous || previous <= 0) return "coletando histórico";
 return formatDiff(calculateDiff(current || 0, previous));
}

function formatPeakValue(value, time) {
 if (!value || value <= 0) return "`aguardando histórico`";
 return `\`${formatNumber(value)}\` às \`${time || "--:--"}\``;
}

function formatPrimePeakToday(value, time, currentSnapshot) {
 if (value && value > 0) return `\`${formatNumber(value)}\` players às \`${time || "--:--"}\``;

 const window = getPrimeTimeWindow(currentSnapshot);
 if (!window) return "`sem horário de pico hoje`";

 const minutes = getMinutesOfDayFromSnapshot(currentSnapshot);

 if (minutes < window.startHour * 60) return `\`aguardando ${window.startHour}:00\``;
 if (minutes > window.endHour * 60) return `\`sem pico registrado entre ${window.label}\``;

 return "`coletando agora`";
}

// ---------- FIVEM API ----------
async function fetchCityStatus(city) {
 const fetchFn = await getFetch();
 const controller = new AbortController();
 const timeout = setTimeout(() => controller.abort(), FIVEM_FETCH_TIMEOUT_MS);
 
 try {
   const res = await fetchFn(city.url, { 
     method: "GET", 
     signal: controller.signal,
     headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
   });

   clearTimeout(timeout);
   if (res.ok) {
     const data = await res.json().catch(() => null);
     if (data?.Data) {
const apiClients = safeNumber(data.Data.clients, 0);
const selfReportedClients = safeNumber(data.Data.selfReportedClients, 0);
const clients = apiClients + selfReportedClients;
const maxClients = safeNumber(data.Data.sv_maxclients ?? data.Data.svMaxclients, 0);

return {
  key: city.key,
  name: city.name,
  emoji: city.emoji,
  clients,
  maxClients,
        selfReportedClients,
         online: true,
         hostname: data.Data.hostname,
         discord: data.Data.vars?.["discord.gg"],
         projectName: data.Data.vars?.sv_projectName,
         banner: data.Data.vars?.banner_detail,
       };
     }
   }
 } catch (err) {
   if (err.name === 'AbortError') {
     console.error(`[FIVEM_RETENTION] Timeout ao buscar ${city.name}:`, err.message);
   } else {
     console.error(`[FIVEM_RETENTION] Erro ao buscar ${city.name}:`, err?.message || err);
   }
 } finally {
   clearTimeout(timeout);
 }
 return { key: city.key, name: city.name, emoji: city.emoji, clients: 0, maxClients: 0, selfReportedClients: 0, online: false };
}
async function fetchAllCities() {
 const results = await Promise.all(FIVEM_CITIES.map(fetchCityStatus));
 const citiesData = {};
 let totalClients = 0;
 let totalMaxClients = 0;
 for (const res of results) {
   citiesData[res.key] = res;
   totalClients += res.clients;
   totalMaxClients += res.maxClients;
 }
 return { cities: citiesData, totalClients, totalMaxClients };
}
async function createCurrentSnapshot() {
  const { cities, totalClients, totalMaxClients } = await fetchAllCities();
  const now = new Date();
  const spParts = getSaoPauloParts(now);
  return {
    timestamp: now.getTime(), iso: now.toISOString(),
    spDate: `${spParts.year}-${String(spParts.month).padStart(2, '0')}-${String(spParts.day).padStart(2, '0')}`,
    spTime: `${String(spParts.hour).padStart(2, '0')}:${String(spParts.minute).padStart(2, '0')}`,
    spWeekday: spParts.weekday, hour: spParts.hour, minute: spParts.minute,
    cities, totalClients, totalMaxClients,
  };
}

function isValidSnapshot(snapshot) {
 if (!snapshot) return false;

 const cities = Object.values(snapshot.cities || {});
 const onlineCities = cities.filter(c => c?.online === true).length;
 const maxCapacity = safeNumber(snapshot.totalMaxClients, 0);

 return onlineCities > 0 && maxCapacity > 0;
}

async function getLastValidSnapshot() {
 return await HistoryModel.findOne({
   totalMaxClients: { $gt: 0 },
 }).sort({ timestamp: -1 }).lean();
}

function getMinutesOfDayFromSnapshot(snapshot) {
 const hour = Number(snapshot?.hour ?? 0);
 const minute = Number(snapshot?.minute ?? 0);
 return hour * 60 + minute;
}

function formatPeakLine(label, peak, peakTime, average) {
 return `**${label}:** pico de \`${formatNumber(peak)}\` às \`${peakTime || "--:--"}\` • média \`${formatNumber(Number(average.toFixed(0)))}\``;
}

function formatCompareCompact(current, previous) {
 if (!previous || previous <= 0) return `${UI.NONE} \`(sem base)\``;

 const diff = current - previous;
 const pct = (diff / previous) * 100;

 if (diff > 0) return `${UI.GROWTH} \`+${formatNumber(diff)}\` **+${pct.toFixed(1)}%**`;
 if (diff < 0) return `${UI.DROP} \`${formatNumber(diff)}\` **${pct.toFixed(1)}%**`;

 return `${UI.STABLE} \`0\` **0.0%**`;
}

function formatPanelLine(label, current, previous) {
 return `**BR ${label.padEnd(8, " ")}** : \`${formatNumber(current)} / ${formatNumber(previous || 0)}\` ${formatCompareCompact(current, previous)}`;
}

function getStatusEmojiByYesterday(current, previous) {
 if (!previous || previous <= 0) return UI.NONE;

 const diff = current - previous;

 if (diff > 0) return UI.GROWTH;
 if (diff < 0) return UI.DROP;

 return UI.STABLE;
}

function formatOnlyCurrentLine(label, current, max, pct, index, yesterday = 0) {
 const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${index + 1}.`;
 const statusEmoji = getStatusEmojiByYesterday(current, yesterday);

 return `${medal} **BR ${label.padEnd(8, " ")}** \n> \`${formatNumber(current)} / ${formatNumber(max)}\` players • **${pct}% da capacidade da cidade ocupada** ${statusEmoji}`;
}

// ---------- EMBED BUILDER ----------
async function buildEmbeds(client, currentSnapshot) {
 const embeds = [];
 const baseColor = cn2ParseColor(process.env.BASE_COLORS, DEFAULT_COLOR);
 
 const sevenDaysAgoSnapshot = await getSnapshotDaysAgo(7, currentSnapshot);
 const yesterdaySnapshot = await getSnapshotDaysAgo(1, currentSnapshot);

 // 1. COLETA E CÁLCULO DE MÉTRICAS ANALÍTICAS
 const cityData = FIVEM_CITIES
   .map((cityConfig) => {
     const city = currentSnapshot.cities[cityConfig.key];
     if (!city) return null;

     const yesterdayClients = yesterdaySnapshot?.cities?.[cityConfig.key]?.clients || 0;
     const lastWeekClients = sevenDaysAgoSnapshot?.cities?.[cityConfig.key]?.clients || 0;

     return {
       config: cityConfig,
       current: city,
       yesterday: yesterdayClients,
       week: lastWeekClients,
       usage: city.maxClients > 0 ? ((city.clients / city.maxClients) * 100).toFixed(2) : "0.00",
       diffYesterday: calculateDiff(city.clients, yesterdayClients),
       diffLastWeek: calculateDiff(city.clients, lastWeekClients)
     };
   })
   .filter(Boolean);

 const totalCurrentClients = cityData.reduce((acc, c) => acc + c.current.clients, 0);
 const totalMaxClients = cityData.reduce((acc, c) => acc + c.current.maxClients, 0);
 const totalYesterdayClients = yesterdaySnapshot?.totalClients || 0;
 const totalLastWeekClients = sevenDaysAgoSnapshot?.totalClients || 0;
 
 const capacityPercent = totalMaxClients > 0
   ? ((totalCurrentClients / totalMaxClients) * 100).toFixed(2)
   : "0.00";

 const peaks = await loadPeaksMap();
 const todayKey = currentSnapshot.spDate;
 const yesterdayKey = getDateKeyDaysAgoFromSnapshot(currentSnapshot, 1);
 const lastWeekKey = getDateKeyDaysAgoFromSnapshot(currentSnapshot, 7);
 const dayBeforeYesterdayKey = getDateKeyDaysAgoFromSnapshot(currentSnapshot, 2);

 const todayPeaks = peaks[todayKey] || { total: { peak: 0 }, cities: {} };
 const yesterdayPeaks = peaks[yesterdayKey] || { total: { peak: 0 }, cities: {} };
 const lastWeekPeaks = peaks[lastWeekKey] || { total: { peak: 0 }, cities: {} };
 const dayBeforeYesterdayPeaks = peaks[dayBeforeYesterdayKey] || { total: { peak: 0 }, cities: {} };

 // 2. PAINEL — DASHBOARD EXECUTIVO (DASHBOARD PREMIUM)
 const leader = [...cityData].sort((a, b) => b.current.clients - a.current.clients)[0];
 const topGrowth = [...cityData].sort((a, b) => b.diffYesterday.pct - a.diffYesterday.pct)[0];
 const topDrop = [...cityData].sort((a, b) => a.diffYesterday.pct - b.diffYesterday.pct)[0];
 
 const dashboardEmbed = new EmbedBuilder()
   .setColor(baseColor)
   .setTitle("💎 CENTRAL ANALÍTICA — RESUMO EXECUTIVO")
   .setThumbnail(client.user.displayAvatarURL())
   .setDescription(
     `### 🚀 DESTAQUES DO MOMENTO\n` +
     `**🏆 Líder da Rede:** ${leader?.current.emoji} **${leader?.current.name}**\n` +
     `└ \`${formatNumber(leader?.current.clients)}\` ativos agora (Top Ocupação)\n\n` +
     `**📈 Top Crescimento:** ${topGrowth?.current.emoji} **${topGrowth?.current.name}**\n` +
     `└ ${formatDiff(topGrowth?.diffYesterday)} **Vs. Ontem**\n\n` +
     `**📉 Maior Declínio:** ${topDrop?.current.emoji} **${topDrop?.current.name}**\n` +
     `└ ${formatDiff(topDrop?.diffYesterday)} **Vs. Ontem**\n\n` +
     `${UI.DIVIDER}\n\n` +
     `### 📊 PERFORMANCE GLOBAL\n` +
     `• **Jogadores Online:** \`${formatNumber(totalCurrentClients)}\` \n` +
     `• **Pico Máximo Hoje:** \`${formatNumber(todayPeaks.total?.peak)}\` \n` +
    `• **Ocupação da Rede:** \`${capacityPercent}%\`\n` +
`└ Explicação: jogadores online agora ÷ capacidade máxima total da rede.\n` +
`└ Cálculo: \`${formatNumber(totalCurrentClients)} / ${formatNumber(totalMaxClients)}\`\n\n` +
     `**Comparações de Rede:**\n` +
     `> 🕒 **Vs. Ontem:** ${formatDiff(calculateDiff(totalCurrentClients, totalYesterdayClients))}\n` +
     `> 📅 **Vs. 7 Dias:** ${formatDiff(calculateDiff(totalCurrentClients, totalLastWeekClients))}`
   )
   .setFooter({ text: `Relatório de Inteligência • Sincronizado às ${currentSnapshot.spTime}` })
   .setTimestamp();
 embeds.push(dashboardEmbed);

 // 3. PAINEL — STATUS GERAL FIVEM
 const sortedCurrent = [...cityData].sort((a, b) => b.current.clients - a.current.clients);
 const summaryEmbed = new EmbedBuilder()
   .setColor(baseColor)
   .setTitle("🏢 STATUS EM TEMPO REAL — CIDADES")
   .setDescription(
     sortedCurrent
       .map((item, index) => {
         return formatOnlyCurrentLine(
           item.current.name,
           item.current.clients,
           item.current.maxClients,
           item.usage,
           index,
           item.yesterday
         );
       })
       .join("\n\n") +
     `\n\n${UI.SEP}\n` +
     `**Total da Rede:** \`${formatNumber(totalCurrentClients)} / ${formatNumber(totalMaxClients)}\` players\n` +
     `**Ocupação Geral:** \`${capacityPercent}%\` ${getStatusEmojiByYesterday(totalCurrentClients, totalYesterdayClients)}`
   )
   .setFooter({
     text: `Dados atualizados a cada 2min • ${FIVEM_RANK_MARKER_TAG}`,
   });
 embeds.push(summaryEmbed);

 // 4. PAINEL — COMPARAÇÃO TEMPORAL (ONTEM & SEMANA PASSADA)
 const comparisonEmbed = new EmbedBuilder()
   .setColor(baseColor)
   .setTitle("📉 TRENDS — ANÁLISE COMPARATIVA")
   .setDescription(
     `###  COMPARAÇÃO DIÁRIA (24H)\n` +
     `*Dados atuais vs. mesmo horário ontem*\n\n` +
     cityData.map(c => `**${c.current.emoji} BR ${c.current.name.padEnd(8, " ")}**\n> \`${formatNumber(c.current.clients)}\` vs \`${formatNumber(c.yesterday)}\` | ${formatDiff(c.diffYesterday)}`).join("\n\n") +
     `\n\n**🌐 PERFORMANCE REDE:** ${formatDiff(calculateDiff(totalCurrentClients, totalYesterdayClients))}\n\n` +
     `${UI.DIVIDER}\n\n` +
     `### 📅 COMPARAÇÃO SEMANAL (7D)\n` +
     `*Dados atuais vs. mesmo dia/hora semana passada*\n\n` +
     cityData.map(c => `**${c.current.emoji} BR ${c.current.name.padEnd(8, " ")}**\n> \`${formatNumber(c.current.clients)}\` vs \`${formatNumber(c.week)}\` | ${formatDiff(c.diffLastWeek)}`).join("\n\n") +
     `\n\n**🌐 PERFORMANCE REDE:** ${formatDiff(calculateDiff(totalCurrentClients, totalLastWeekClients))}\n`
   )
   .setFooter({ text: `Análise de Retenção Dinâmica • Ref: ${currentSnapshot.spTime}` });
 embeds.push(comparisonEmbed);

 // 5. PAINEL — RETENÇÃO DAS 21:00 (EM PONTO)
 const weekday = getSaoPauloWeekday(new Date(currentSnapshot.timestamp));
 const isRelevant21hDay = (weekday >= 1 && weekday <= 6);

 // 🧠 Inteligência Madrugada: se não teve pico hoje ainda, olha o dia anterior para os painéis de foco
 const isEarlyMorning = currentSnapshot.hour < 4;
 const useYesterdayFocus = isEarlyMorning && (todayPeaks.total?.primePeak || 0) === 0;
 const effectiveWeekday = useYesterdayFocus ? (weekday + 6) % 7 : weekday;
 const primeWindow = getPrimeTimeWindow(currentSnapshot, effectiveWeekday);

 if (isRelevant21hDay) {
   const today21h = todayPeaks.exact21h || { total: 0, cities: {} };
   const yesterday21h = yesterdayPeaks.exact21h || { total: 0, cities: {} };
   
   let lastWeek21h = lastWeekPeaks.exact21h;
   if (!lastWeek21h || lastWeek21h.total === 0) {
     const snap = await getExact21hHistory(lastWeekKey);
     if (snap) lastWeek21h = { total: snap.totalClients, cities: snap.cities };
   }
   lastWeek21h ||= { total: 0, cities: {} };

   const retentionData = FIVEM_CITIES.map(city => {
     const t = today21h.cities?.[city.key]?.clients || 0;
     const y = yesterday21h.cities?.[city.key]?.clients || 0;
     const w = lastWeek21h.cities?.[city.key]?.clients || 0;
     return { city, t, y, w, diffY: calculateDiff(t, y), diffW: calculateDiff(t, w) };
   }).sort((a,b) => b.t - a.t);

   const retentionEmbed = new EmbedBuilder()
     .setColor(baseColor)
     .setTitle("🕒 AUDITORIA DE RETENÇÃO — 21:00h")
     .setDescription(
       `*Leitura fixa do começo do evento. Não é o pico da janela; é só o ponto das 21h para auditoria.*\n\n` +
       retentionData.map((item, idx) => {
         const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}.`;
         return (
           `${medal} **BR ${item.city.name}**\n` +
           `> **Ponto fixo das 21h:** \`${formatNumber(item.t)}\` players\n` +
           `> **Vs Ontem:** ${formatDiff(item.diffY)}\n` +
           `> **Vs Semana Passada:** ${formatDiff(item.diffW)}`
         );
       }).join("\n\n") +
       `\n\n**TOTAL GERAL ÀS 21:00:** \`${formatNumber(today21h.total)}\` players\n` +
       `**Crescimento Diário:** ${formatDiff(calculateDiff(today21h.total, yesterday21h.total))}\n` +
       `**Crescimento Semanal:** ${formatDiff(calculateDiff(today21h.total, lastWeek21h.total))}`
     )
     .setFooter({ text: `Relatório de Retenção Nobre • 21:00h` });
   embeds.push(retentionEmbed);
 }

 // 5.1 PAINÉIS DE RETENÇÃO POR CIDADE (DIVIDIDO EM VÁRIOS EMBEDS PARA NÃO ESTOURAR 6000 CARACTERES)
const weekMode = getWeekModeSP(new Date(currentSnapshot.timestamp));

const focusItems = [
  getPrimeTimeWindow(currentSnapshot, 1),
  getPrimeTimeWindow(currentSnapshot, 2),
  getPrimeTimeWindow(currentSnapshot, 3),
  getPrimeTimeWindow(currentSnapshot, 4),
  getPrimeTimeWindow(currentSnapshot, 5),
  getPrimeTimeWindow(currentSnapshot, 6),
  getPrimeTimeWindow(currentSnapshot, 0),
].filter(Boolean);

const focusHeader =
  `**Semana atual:** Semana ${weekMode}\n` +
  `**Regra da semana:** ${weekMode === "A"
    ? "Quinta 00:00–01:00 / Sábado 21:00–22:00"
    : "Quinta 21:00–22:00 / Sábado 00:00–01:00"}\n\n` +
  `Cada linha compara a mesma cidade e a mesma janela exata contra a semana anterior.\n\n`;

const focusFields = [];

for (const item of focusItems) {
  const targetWeekday =
    item.eventKey.includes("domingo") ? 0 :
    item.eventKey.includes("segunda") ? 1 :
    item.eventKey.includes("terca") ? 2 :
    item.eventKey.includes("quarta") ? 3 :
    item.eventKey.includes("quinta") ? 4 :
    item.eventKey.includes("sexta") ? 5 :
    item.eventKey.includes("sabado") ? 6 :
    null;

  if (targetWeekday === null) continue;

  let daysToEvent = 0;

  while (((effectiveWeekday - daysToEvent + 35) % 7) !== targetWeekday) {
    daysToEvent++;
    if (daysToEvent > 7) break;
  }

  const eventDateKey = getDateKeyDaysAgoFromSnapshot(
    currentSnapshot,
    daysToEvent + (useYesterdayFocus ? 1 : 0)
  );

  const weekAgoDateKey = getDateKeyDaysAgoFromSnapshot(
    currentSnapshot,
    daysToEvent + 7 + (useYesterdayFocus ? 1 : 0)
  );

  const twoWeeksAgoDateKey = getDateKeyDaysAgoFromSnapshot(
    currentSnapshot,
    daysToEvent + 14 + (useYesterdayFocus ? 1 : 0)
  );

  const eventPeaks = peaks[eventDateKey] || { eventWindows: {} };
  const weekAgoPeaks = peaks[weekAgoDateKey] || { eventWindows: {} };
  const twoWeeksAgoPeaks = peaks[twoWeeksAgoDateKey] || { eventWindows: {} };

  const comparison = buildAlternatingComparison({
    currentPeakDoc: eventPeaks,
    previousWeekDoc: weekAgoPeaks,
    twoWeeksAgoDoc: twoWeeksAgoPeaks,
    eventKey: item.eventKey,
  });

  const currentWindow = comparison.currentWindow;
  const currentPeak = currentWindow?.peak || 0;
  const currentTime = currentWindow?.peakTime || "--:--";

  const baseSemanaAnterior = comparison.previousOppositeWindow || comparison.normalPreviousWindow;
  const baseMesmaJanela = comparison.sameWindowTwoWeeksAgo;

  const previousPeak = baseSemanaAnterior?.peak || 0;
  const previousSameWindowPeak = baseMesmaJanela?.peak || 0;

  const diffWeek = calculateDiff(currentPeak, previousPeak);
  const diffSameWindow = calculateDiff(currentPeak, previousSameWindowPeak);

  focusFields.push({
    name: `${item.emoji} BR ${item.cityName}`,
    value:
      `**Janela exata:** \`${item.label}\`\n` +
      `**Pico salvo:** \`${formatNumber(currentPeak)}\` às \`${currentTime}\`\n` +
      `**Base semana passada:** \`${formatNumber(previousPeak)}\`${comparison.oppositeEventKey ? " *(horário alternado)*" : ""}\n` +
      `**Resultado vs semana passada:** ${currentPeak > 0 ? formatDiff(diffWeek) : "🟠 ➖ 0 (aguardando coleta dessa janela)"}\n` +
      `${comparison.oppositeEventKey ? `**Base mesma janela 14d:** \`${formatNumber(previousSameWindowPeak)}\`\n**Resultado vs mesma janela:** ${currentPeak > 0 ? formatDiff(diffSameWindow) : "🟠 ➖ 0 (aguardando coleta dessa janela)"}` : ""}`,
    inline: false
  });
}

const focusFieldsPerEmbed = 3;

for (let i = 0; i < focusFields.length; i += focusFieldsPerEmbed) {
  const partNumber = Math.floor(i / focusFieldsPerEmbed) + 1;
  const totalParts = Math.ceil(focusFields.length / focusFieldsPerEmbed);

  const focusEmbed = new EmbedBuilder()
    .setColor(baseColor)
    .setTitle(`🎯 RETENÇÃO DO EVENTO — CIDADES FOCADAS${useYesterdayFocus ? " (Resumo de Ontem)" : ""} • Parte ${partNumber}/${totalParts}`)
    .setDescription(partNumber === 1 ? focusHeader : `Continuação da análise por janela exata.\n\n`)
    .addFields(focusFields.slice(i, i + focusFieldsPerEmbed))
    .setFooter({
      text: `Análise por janela exata • Sincronizado às ${currentSnapshot.spTime}`,
      iconURL: client.user.displayAvatarURL()
    });

  embeds.push(focusEmbed);
}
// 6. PAINEL — DIFERENÇA DE PICOS (MÁXIMAS DO DIA)
 const peakAnalysisData = FIVEM_CITIES
   .map((cityConfig) => {
     const todayCityPeak = todayPeaks.cities?.[cityConfig.key];
     const yesterdayCityPeak = yesterdayPeaks.cities?.[cityConfig.key];
     const lastWeekCityPeak = lastWeekPeaks.cities?.[cityConfig.key];

     return {
       name: cityConfig.name,
       emoji: cityConfig.emoji,
       todayPeak: todayCityPeak?.peak || 0,
       todayPeakTime: todayCityPeak?.peakTime || "--:--",
       yesterdayPeak: yesterdayCityPeak?.peak || 0,
       weekPeak: lastWeekCityPeak?.peak || 0,
       primePeak: todayCityPeak?.primePeak || 0,
       primePeakTime: todayCityPeak?.primePeakTime || "--:--",
       yesterdayPrimePeak: yesterdayCityPeak?.primePeak || 0,
       weekPrimePeak: lastWeekCityPeak?.primePeak || 0,
     };
   })
   .sort((a, b) => b.todayPeak - a.todayPeak);

 const peaksEmbed = new EmbedBuilder()
   .setColor(baseColor)
   .setTitle("🏆 RECORDES — PICOS DE AUDIÊNCIA (DIA)")
   .setDescription(
     `*Maior volume de jogadores simultâneos registrados hoje*\n\n` +
     peakAnalysisData.map((item, index) => {
       const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${index + 1}.`;
       const diffY = calculateDiff(item.todayPeak, item.yesterdayPeak);
       const diffW = calculateDiff(item.todayPeak, item.weekPeak);

       return (
         `${medal} **BR ${item.name}** • \`${formatNumber(item.todayPeak)}\` às \`${item.todayPeakTime}\`\n` +
         `> **Histórico:** ${formatDiff(diffY)} (24h) | ${formatDiff(diffW)} (7d)`
       );
     }).join("\n\n") +
     `\n\n${UI.DIVIDER}\n` +
     `**Recorde Geral Hoje:** ${formatPeakValue(todayPeaks.total?.peak, todayPeaks.total?.peakTime)}`
   )
   .setFooter({ text: `Relatório de Picos Diários • Hoje até ${currentSnapshot.spTime}` });
 embeds.push(peaksEmbed);

 const primeTimeLabel = primeWindow ? primeWindow.label : "sem horário específico";
 const activePrimePeaks = useYesterdayFocus ? yesterdayPeaks : todayPeaks;
 const compYPrimePeaks = useYesterdayFocus ? dayBeforeYesterdayPeaks : yesterdayPeaks;
 const primeIsAlternatingWindow =
  primeWindow?.eventKey?.includes("quinta") ||
  primeWindow?.eventKey?.includes("sabado");

const primeCompareBackDays = primeIsAlternatingWindow ? 14 : 7;

const compWPrimePeaks = peaks[
  getDateKeyDaysAgoFromSnapshot(
    currentSnapshot,
    primeCompareBackDays + (useYesterdayFocus ? 1 : 0)
  )
] || { total: {}, cities: {}, eventWindows: {} };

 // Cálculos de comparação para o Total Geral do horário de eventos
 const totalPrimeDiffY = calculateDiff(activePrimePeaks.total?.primePeak || 0, compYPrimePeaks.total?.primePeak || 0);
 const totalPrimeDiffW = calculateDiff(activePrimePeaks.total?.primePeak || 0, compWPrimePeaks.total?.primePeak || 0);

 // 7. PAINEL — COPA DE DESEMPENHO (RANKING DE EVOLUÇÃO VS SEMANA PASSADA)
 const performanceRanking = FIVEM_CITIES.map(city => {
   const currentWindow = primeWindow?.eventKey
     ? activePrimePeaks.eventWindows?.[primeWindow.eventKey]
     : null;

   const previousWindow = primeWindow?.eventKey
     ? compWPrimePeaks.eventWindows?.[primeWindow.eventKey]
     : null;

   const isCurrentCityWindow = currentWindow?.cityKey === city.key;
   const isPreviousCityWindow = previousWindow?.cityKey === city.key;

   const p = isCurrentCityWindow ? currentWindow?.peak || 0 : 0;
   const pw = isPreviousCityWindow ? previousWindow?.peak || 0 : 0;

   const stats = calculateDiff(p, pw);
   return { city, p, pw, stats };
 }).sort((a, b) => {
   if (a.p === 0 && b.p > 0) return 1;
   if (b.p === 0 && a.p > 0) return -1;
   if (a.stats.pct === 'sem base') return 1;
   if (b.stats.pct === 'sem base') return -1;
   return b.stats.pct - a.stats.pct;
 });

 const perfEmbed = new EmbedBuilder()
   .setColor(0x0099ff)
   .setTitle("🏆 COPA DE DESEMPENHO — EVOLUÇÃO SEMANAL")
   .setDescription(
     `*Ranking baseado no crescimento % em relação ao pico do evento na semana passada*\n\n` +
     performanceRanking.map((item, idx) => {
       const medal = idx === 0 ? "🔥" : idx === performanceRanking.length - 1 ? "⚠️" : "🔹";
       const trend = item.stats.pct > 0 ? "Melhorou" : (item.stats.pct < 0 ? "Caiu" : "Estável");
       
       return (
         `${medal} **BR ${item.city.name}**\n` +
         `> **Status:** ${trend} ${item.stats.arrow}\n` +
         `> **Pico Atual:** \`${formatNumber(item.p)}\` vs \`${formatNumber(item.pw)}\` (7d)\n` +
         `> **Diferença:** \`${item.stats.diff > 0 ? '+' : ''}${formatNumber(item.stats.diff)}\` (**${typeof item.stats.pct === 'number' ? item.stats.pct.toFixed(1) + '%' : 'sem base'}**)`
       );
     }).join("\n\n")
   )
   .setFooter({ text: "O ranking considera apenas dados coletados dentro das janelas de pico alternadas." });
 
 embeds.push(perfEmbed);

 // Mapeia os dados baseados nos picos ativos (hoje ou resumo de ontem)
const currentEventWindow = primeWindow?.eventKey
  ? activePrimePeaks.eventWindows?.[primeWindow.eventKey]
  : null;

const previousEventWindow = primeWindow?.eventKey
  ? compWPrimePeaks.eventWindows?.[primeWindow.eventKey]
  : null;

const effectivePeakData = currentEventWindow ? [
  {
    name: currentEventWindow.cityName,
    emoji: currentEventWindow.emoji,
    val: currentEventWindow.peak || 0,
    time: currentEventWindow.peakTime || "--:--",
    diffY: calculateDiff(currentEventWindow.peak || 0, 0),
    diffW: calculateDiff(currentEventWindow.peak || 0, previousEventWindow?.peak || 0)
  }
] : [];

 const primeEmbed = new EmbedBuilder()
   .setColor(baseColor)
   .setTitle(`🔥 PRIME TIME — RETENÇÃO EM EVENTO${useYesterdayFocus ? " (Ontem)" : ""}`)
   .setDescription(
     `*Janela de análise exata do evento atual: **${primeTimeLabel}***\n` +
`*Comparação: pico salvo nesta mesma janela vs. base anterior salva.*\n\n` +
     effectivePeakData.map((item, index) => {
       const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${index + 1}.`;

       return (
         `${medal} **BR ${item.name}** • \`${formatNumber(item.val)}\` às \`${item.time}\`\n` +
         `> **Trends:** ${formatDiff(item.diffY)} (24h) | ${formatDiff(item.diffW)} (7d)`
       );
     }).join("\n\n") +
     `\n\n${UI.DIVIDER}\n` +
     `**Maior pico salvo nessa janela:** \`${formatNumber(currentEventWindow?.peak || 0)}\` players\n` +
`> **Vs Semana Passada:** ${formatDiff(calculateDiff(currentEventWindow?.peak || 0, previousEventWindow?.peak || 0))}\n` +
`> **Status:** ${(currentEventWindow?.peak || 0) > 0 ? "coletando o maior pico da janela" : "aguardando coleta dessa janela"}`
   )
   .setFooter({ text: `${useYesterdayFocus ? "Resumo Consolidado" : "Monitoramento em Tempo Real"} • Ref: ${currentSnapshot.spTime}` });
 embeds.push(primeEmbed);

 // Botão de atualização manual
const row = new ActionRowBuilder().addComponents(
   new ButtonBuilder()
     .setCustomId("fivem_retention_force_refresh")
     .setLabel("🔄 Forçar atualização")
     .setStyle(ButtonStyle.Primary),
   new ButtonBuilder()
     .setCustomId("fivem_retention_recreate_panel")
     .setLabel("♻️ Recriar painel limpo")
     .setStyle(ButtonStyle.Danger)
 );
// TESTE MACEDO 123
 return { embeds, row };
}



async function deleteAllRetentionPanelMessages(channel, botId) {
 const msgs = await channel.messages.fetch({ limit: 100 }).catch(() => null);
 if (!msgs) return 0;

 const panelMessages = msgs.filter(
   (m) =>
     m.author?.id === botId &&
     m.embeds?.some((e) => {
       const footer = e.footer?.text || "";
       const title = e.title || "";

       return (
         footer.includes(FIVEM_RANK_MARKER_TAG) ||
         footer.includes(FIVEM_CONT_MARKER_TAG) ||
         title.includes("CENTRAL ANALÍTICA") ||
         title.includes("STATUS EM TEMPO REAL") ||
         title.includes("TRENDS") ||
         title.includes("AUDITORIA DE RETENÇÃO") ||
         title.includes("RETENÇÃO DO EVENTO") ||
         title.includes("RECORDES") ||
         title.includes("COPA DE DESEMPENHO") ||
         title.includes("PRIME TIME")
       );
     })
 );

 for (const msg of panelMessages.values()) {
   await msg.delete().catch(() => {});
 }

 const currentState = FIVEM_STATE.get(channel.id) || {};
 FIVEM_STATE.set(channel.id, {
   ...currentState,
   messageId: null,
   lastEditAt: 0,
 });

 return panelMessages.size;
}
// ---------- STICKY MESSAGE ----------
async function cn2FindStickyMessage(channel, botId) {
 try {
   // ✅ Tenta recuperar pelo estado em memória primeiro para evitar fetch desnecessário
   const state = FIVEM_STATE.get(channel.id);
   if (state?.messageId) {
     const cachedMsg = await channel.messages.fetch(state.messageId).catch(() => null);
     if (cachedMsg && cachedMsg.author.id === botId) return cachedMsg;
   }

   const perms = channel.permissionsFor(botId);
   if (!perms?.has(PermissionsBitField.Flags.ViewChannel) || !perms?.has(PermissionsBitField.Flags.ReadMessageHistory)) {
     FIVEM_DEBUG && console.log("[FIVEM_RETENTION] Sem permissão de Ler Histórico no canal", channel.id);
     return null;
   }

   const msgs = await channel.messages.fetch({ limit: 50 }).catch(() => null);
   if (!msgs) return null;

   // ✅ Busca mensagens do bot que contenham o marcador em QUALQUER um dos embeds
   const matches = msgs.filter(
     (m) =>
       m.author?.id === botId &&
       m.embeds?.length > 0 &&
       m.embeds.some(e => (e.footer?.text || "").includes(FIVEM_RANK_MARKER_TAG))
   );

   if (matches.size === 0) return null;

   // ✅ Ordena por data (mais recente primeiro)
   const sorted = [...matches.values()].sort((a, b) => b.createdTimestamp - a.createdTimestamp);
   const keep = sorted[0];

   // ✅ AUTO-CURA: Se houver mais de um painel, apaga os duplicados
   if (sorted.length > 1) {
     FIVEM_DEBUG && console.log(`[FIVEM_RETENTION] Detectadas ${sorted.length} duplicatas. Limpando...`);
     for (let i = 1; i < sorted.length; i++) {
       await sorted[i].delete().catch(() => {});
     }
   }

   // ✅ Sincroniza o ID no mapa de estado
   const currentState = FIVEM_STATE.get(channel.id) || {};
   FIVEM_STATE.set(channel.id, { ...currentState, messageId: keep.id });

   return keep;
 } catch (e) {
   cn2LogApiError("[FIVEM_RETENTION] Erro buscando sticky:", e);
   return null;
 }
}
async function ensureStickyMessage(channel) {
 const botId = channel.client.user.id;
 let msg = await cn2FindStickyMessage(channel, botId);
 if (!msg) {
   const perms = channel.permissionsFor(botId);
   if (!perms?.has(PermissionsBitField.Flags.SendMessages)) {
     throw new Error("[FIVEM_RETENTION] Bot sem permissão de Enviar Mensagens no canal.");
   }
   if (!perms?.has(PermissionsBitField.Flags.EmbedLinks)) {
     throw new Error("[FIVEM_RETENTION] Bot sem permissão de Inserir Links Incorporados (Embed Links) no canal.");
   }
   const currentSnapshot = await createCurrentSnapshot();
   await addSnapshot(currentSnapshot);
   await updateDailyPeaks(currentSnapshot);
   const { embeds, row } = await buildEmbeds(channel.client, currentSnapshot);
   try {
  const embedGroups = packEmbedsForDiscord(embeds);
const mainEmbeds = markEmbedGroupWithFooterTag(embedGroups[0] || [], FIVEM_RANK_MARKER_TAG);
const continuationGroups = embedGroups.slice(1);

const hasContinuation = continuationGroups.length > 0;

msg = await channel.send({
  embeds: mainEmbeds,
  components: hasContinuation ? [] : [row],
});

await syncContinuationMessages(channel, botId, continuationGroups, hasContinuation ? row : null);

     // ✅ Registra o ID da mensagem no estado assim que for criada
     const state = FIVEM_STATE.get(channel.id) || {};
     FIVEM_STATE.set(channel.id, { ...state, messageId: msg.id });

     FIVEM_DEBUG && console.log("[FIVEM_RETENTION] Sticky criada:", msg.id);
   } catch (e) {
     cn2LogApiError("[FIVEM_RETENTION] Falha ao criar sticky:", e);
     throw e;
   }
 }
 return msg;
}
async function editPanel(channel, options = {}) {
 const botId = channel.client.user.id;
 const perms = channel.permissionsFor(botId);
 if (!perms?.has(PermissionsBitField.Flags.ViewChannel) || !perms?.has(PermissionsBitField.Flags.SendMessages)) {
   FIVEM_DEBUG && console.log("[FIVEM_RETENTION] Sem permissão de ver/enviar no canal", channel.id);
   return null;
 }
 if (!perms?.has(PermissionsBitField.Flags.EmbedLinks)) {
   FIVEM_DEBUG && console.log("[FIVEM_RETENTION] Sem Embed Links no canal", channel.id);
   return null;
 }
 const sticky = await ensureStickyMessage(channel).catch((e) => {
   console.error("[FIVEM_RETENTION] ensureSticky falhou:", e?.message || e);
   return null;
 });
 if (!sticky) return null;

let currentSnapshot = await createCurrentSnapshot();

if (!isValidSnapshot(currentSnapshot)) {
 const fallbackSnapshot = await getLastValidSnapshot();

 if (!fallbackSnapshot) {
   console.warn("[FIVEM_RETENTION] Snapshot inválido e sem histórico válido para fallback.");
   return null;
 }

 console.warn("[FIVEM_RETENTION] Snapshot inválido recebido da API. Usando último snapshot válido para evitar painel zerado.");
 currentSnapshot = fallbackSnapshot;
}

await addSnapshot(currentSnapshot);
const hasNewPeak = await updateDailyPeaks(currentSnapshot);

 // 🚀 Coleta sempre a cada 2min, mas edita o painel sem flood:
 // - normal: a cada 10min
 // - durante evento: a cada 2min
 // - se tiver pico novo: edita na hora
 // - se for forçado pelo botão: edita na hora
 const state = FIVEM_STATE.get(channel.id) || {};
 const lastEditAt = state.lastEditAt || 0;
 const timeSinceLastEdit = Date.now() - lastEditAt;

 const isPanelTimedUpdate = timeSinceLastEdit >= FIVEM_PANEL_REFRESH_INTERVAL_MS;
 const isEventWindowNow = isInsideCurrentEventWindow(currentSnapshot);
 const is21h = isExact21hSnapshot(currentSnapshot);

 if (!options.force && !hasNewPeak && !is21h && !isEventWindowNow && !isPanelTimedUpdate) {
   return null;
 }

 const { embeds, row } = await buildEmbeds(channel.client, currentSnapshot);
 try {
   const embedGroups = packEmbedsForDiscord(embeds);
const mainEmbeds = markEmbedGroupWithFooterTag(embedGroups[0] || [], FIVEM_RANK_MARKER_TAG);
const continuationGroups = embedGroups.slice(1);

const hasContinuation = continuationGroups.length > 0;

const edited = await sticky.edit({
  embeds: mainEmbeds,
  components: hasContinuation ? [] : [row],
});

await syncContinuationMessages(channel, botId, continuationGroups, hasContinuation ? row : null);
   if (edited) FIVEM_DEBUG && console.log("[FIVEM_RETENTION] Sticky editada:", edited.id);

   if (edited) {
     const updatedState = FIVEM_STATE.get(channel.id) || {};
     FIVEM_STATE.set(channel.id, { ...updatedState, lastEditAt: Date.now() });
   }
   return edited;
 } catch (e) {
   cn2LogApiError("[FIVEM_RETENTION] Falha ao editar sticky:", e);
   throw e;
 }
}
// ---------- PUBLIC API ----------
export async function fivemRetentionStatusOnReady(client) {
 try {
   // ✅ Proteção global para impedir bootstrap duplicado (previne múltiplos loops e mensagens)
   if (globalThis.__FIVEM_RETENTION_STATUS_BOOTSTRAPPED__) return;
   globalThis.__FIVEM_RETENTION_STATUS_BOOTSTRAPPED__ = true;

   const channel = await client.channels.fetch(FIVEM_PANEL_CHANNEL_ID).catch(() => null);
   if (!channel || !channel.isTextBased()) {
     console.error("[FIVEM_RETENTION] Canal fixo não encontrado ou inválido:", FIVEM_PANEL_CHANNEL_ID);
     return;
   }

   // Limpa intervalos antigos para evitar duplicidade no mesmo canal
   const existing = FIVEM_STATE.get(channel.id);
   if (existing?.intervalId) clearInterval(existing.intervalId);

   // Tenta o primeiro update agora (sem travar o resto do bot)
   editPanel(channel, { force: true }).catch(e => console.error("[FIVEM_RETENTION] Erro no update inicial:", e));

   // Inicia o loop que roda a cada 2 minutos, faça chuva ou faça sol
   const intervalId = setInterval(async () => {
     try {
       await editPanel(channel);
     } catch (e) {
       console.error("[FIVEM_RETENTION] Erro no loop de atualização automática:", e);
     }
   }, FIVEM_REFRESH_INTERVAL_MS);

   // ✅ Inicializa o estado mantendo o messageId se ele já existia
   FIVEM_STATE.set(channel.id, { intervalId, messageId: existing?.messageId || null });
   FIVEM_DEBUG && console.log("[FIVEM_RETENTION] Sistema pronto. Loop de 2min ativo no canal", channel.id);
 } catch (err) {
   console.error("[FIVEM_RETENTION] fivemRetentionStatusOnReady erro:", err?.message || err);
 }
}

export async function fivemRetentionStatusHandleInteraction(interaction, client) {
 try {
if (
 !interaction.isButton?.() ||
 !["fivem_retention_force_refresh", "fivem_retention_recreate_panel"].includes(interaction.customId)
) return false;

   try {
     // Avisa o Discord que estamos processando (isso gera o "Thinking...")
     await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

     const channel = interaction.channel;
     if (!channel?.isTextBased?.()) {
       if (interaction.deferred) await interaction.editReply("❌ Não consegui acessar o canal.");
       return true;
     }

     const edited = await editPanel(channel, { force: true });
     
     if (!edited) {
       throw new Error("Não foi possível atualizar o painel. API lenta ou sem permissão.");
     }

     await interaction.editReply("✅ Painel atualizado com sucesso!").catch(() => {});
   } catch (e) {
     console.error("[FIVEM_RETENTION] Erro ao forçar atualização:", e);
     if (interaction.deferred || interaction.replied) {
       await interaction.editReply(`❌ Erro ao atualizar: ${e.message || "Tente novamente mais tarde."}`).catch(() => {});
     }
   }
   return true;
 } catch (e) {
   cn2LogApiError("[FIVEM_RETENTION] fivemRetentionStatusHandleInteraction erro:", e);
   if (interaction.deferred || interaction.replied) {
     await interaction.editReply("❌ Ocorreu um erro interno ao processar a ação.").catch(() => {});
   }
   return false;
 }
}
export function fivemRetentionStatusOnChannelDelete(channel) {
 const state = FIVEM_STATE.get(channel?.id);
 if (state?.intervalId) clearInterval(state.intervalId);
 if (channel?.id) FIVEM_STATE.delete(channel.id);
}
