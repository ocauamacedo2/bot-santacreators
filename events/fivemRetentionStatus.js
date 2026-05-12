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
const FIVEM_REFRESH_INTERVAL_MS = 2 * 60 * 1000; // 2 minutos
const FIVEM_HISTORY_MAX_DAYS = 30; // Limitar histórico a 30 dias
const FIVEM_FETCH_TIMEOUT_MS = 10 * 1000; // 10 segundos
const FIVEM_COMPARISON_TOLERANCE_MS = 10 * 60 * 1000; // 10 minutos
const FIVEM_TIMEZONE = "America/Sao_Paulo";
const FIVEM_RANK_MARKER_TAG = "[FIVEM_RETENTION_STATUS]";

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
export function getPrimeTimeWindow(snapshot, customWeekday = null) {
  const weekday = customWeekday !== null ? customWeekday : getSaoPauloWeekday(new Date(snapshot.timestamp));
  // Terça: 21:00 às 00:00 (Evento Cidade Grande às 23:00)
  if (weekday === 2) return { startHour: 21, startMinute: 0, endHour: 24, endMinute: 0, label: "21:00 às 00:00" };
  // Segunda, Quarta, Quinta, Sexta, Sábado e Domingo: 20:00 às 23:00
  if ([0, 1, 3, 4, 5, 6].includes(weekday)) return { startHour: 20, startMinute: 0, endHour: 23, endMinute: 0, label: "20:00 às 23:00" };
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

async function updateDailyPeaks(currentSnapshot) {
  try {
    const dateKey = currentSnapshot.spDate;
    let dayPeak = await PeakModel.findOne({ date: dateKey });
    let hasChange = false;

    if (!dayPeak) {
      hasChange = true;
      dayPeak = new PeakModel({ // Garante que o objeto total e cities existam
        date: dateKey,
        total: { peak: 0, peakTime: null, peakAt: 0, primePeak: 0, primePeakTime: null, primePeakAt: 0 },
        cities: {},
        exact21h: { total: 0, cities: {} } // Inicializa o novo campo
      });
    } else if (!dayPeak.exact21h) { // Adiciona o campo se não existir em documentos antigos
      dayPeak.exact21h = { total: 0, cities: {} };
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

    const isPrime = isPrimeTimeSnapshot(currentSnapshot);

    if ((currentSnapshot.totalClients || 0) > (dayPeak.total.peak || 0)) {
      dayPeak.total.peak = currentSnapshot.totalClients || 0;
      dayPeak.total.peakTime = currentSnapshot.spTime;
      dayPeak.total.peakAt = currentSnapshot.timestamp;
      hasChange = true;
    }

    if (isPrime && (currentSnapshot.totalClients || 0) > (dayPeak.total.primePeak || 0)) {
      dayPeak.total.primePeak = currentSnapshot.totalClients || 0;
      dayPeak.total.primePeakTime = currentSnapshot.spTime;
      dayPeak.total.primePeakAt = currentSnapshot.timestamp;
      hasChange = true;
    }

    for (const cityConfig of FIVEM_CITIES) {
      const cityData = currentSnapshot.cities?.[cityConfig.key];
      if (!cityData) continue;

      const cityPeak = dayPeak.cities[cityConfig.key];
      if ((cityData.clients || 0) > (cityPeak.peak || 0)) {
        cityPeak.peak = cityData.clients || 0;
        cityPeak.peakTime = currentSnapshot.spTime;
        cityPeak.peakAt = currentSnapshot.timestamp;
      }
      if (isPrime && (cityData.clients || 0) > (cityPeak.primePeak || 0)) {
        cityPeak.primePeak = cityData.clients || 0;
        cityPeak.primePeakTime = currentSnapshot.spTime;
        cityPeak.primePeakAt = currentSnapshot.timestamp;
      }
    }

    dayPeak.markModified('total');
    dayPeak.markModified('cities');
    dayPeak.markModified('exact21h'); // Marca o novo campo como modificado
    await dayPeak.save();

    // Limpeza de picos antigos (opcional, para manter paridade com History)
    const thirtyDaysAgoDate = new Date(Date.now() - FIVEM_HISTORY_MAX_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await PeakModel.deleteMany({ date: { $lt: thirtyDaysAgoDate } });
  } catch (e) {
    console.error("[FIVEM_RETENTION] Erro ao atualizar picos diários:", e);
    return false;
  }
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
       const clients = data.Data.clients || data.Data.selfReportedClients;
       const maxClients = data.Data.sv_maxclients || data.Data.svMaxclients;
       return {
         key: city.key,
         name: city.name,
         emoji: city.emoji,
         clients: typeof clients === 'number' ? clients : 0,
         maxClients: typeof maxClients === 'number' ? maxClients : 0,
         selfReportedClients: typeof data.Data.selfReportedClients === 'number' ? data.Data.selfReportedClients : 0,
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

 return `${medal} **BR ${label.padEnd(8, " ")}** \n> \`${formatNumber(current)} / ${formatNumber(max)}\` • **${pct}%** ${statusEmoji}`;
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
     `└ \`${formatNumber(leader?.current.clients)}\` ativos agora\n\n` +
     `**📈 Top Crescimento:** ${topGrowth?.current.emoji} **${topGrowth?.current.name}**\n` +
     `└ ${formatDiff(topGrowth?.diffYesterday)}\n\n` +
     `**📉 Maior Declínio:** ${topDrop?.current.emoji} **${topDrop?.current.name}**\n` +
     `└ ${formatDiff(topDrop?.diffYesterday)}\n\n` +
     `${UI.DIVIDER}\n\n` +
     `### 📊 PERFORMANCE GLOBAL\n` +
     `• **Jogadores Online:** \`${formatNumber(totalCurrentClients)}\` \n` +
     `• **Pico Máximo Hoje:** \`${formatNumber(todayPeaks.total?.peak)}\` \n` +
     `• **Capacidade Média:** \`${capacityPercent}%\` \n\n` +
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
     `**Saturação Média:** \`${capacityPercent}%\` ${getStatusEmojiByYesterday(totalCurrentClients, totalYesterdayClients)}`
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
       `*Snapshot fixo capturado rigorosamente às 21:00:00*\n\n` +
       retentionData.map((item, idx) => {
         const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}.`;
         return (
           `${medal} **BR ${item.city.name}**\n` +
           `> **Ponto fixo:** \`${formatNumber(item.t)}\` players\n` +
           `> **Vs Ontem:** ${formatDiff(item.diffY)}` +
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

  // 5.1 PAINÉIS DE RETENÇÃO POR CIDADE (CONSOLIDADO EM UM ÚNICO EMBED)
  const consolidatedFocusEmbed = new EmbedBuilder()
    .setColor(baseColor)
    .setTitle(`🎯 RETENÇÃO DO EVENTO — CIDADES FOCADAS${useYesterdayFocus ? " (Resumo de Ontem)" : ""}`)
    .setDescription(`Janela de análise: **${primeWindow.label}** (pode variar por cidade)\n\n`);

  const focusItems = [
    { key: "maresia", name: "Maresia", emoji: "🌊", days: [1], label: "20:00 às 23:00" }, // Segunda
    { key: "grande",  name: "Grande",  emoji: "🌆", days: [2], label: "21:00 às 00:00" }, // Terça
    { key: "santa",   name: "Santa",   emoji: "🏙️", days: [3], label: "20:00 às 23:00" }, // Quarta
    { key: "nobre",   name: "Nobre",   emoji: "👑", days: [4, 5, 6], label: "20:00 às 23:00" }, // Qui, Sex, Sáb
    { key: "total",   name: "Geral (Rede)", emoji: "🌐", days: [0], label: "20:00 às 23:00" }  // Domingo
  ];

  for (const item of focusItems) {
    // Encontrar o dia em que este evento ocorreu pela última vez
    let daysToLastEvent = 0;
    while (!item.days.includes((effectiveWeekday - daysToLastEvent + 35) % 7)) {
      daysToLastEvent++;
    }
    
    const lastEventDateKey = getDateKeyDaysAgoFromSnapshot(currentSnapshot, daysToLastEvent + (useYesterdayFocus ? 1 : 0));
    const eventPeaks = peaks[lastEventDateKey] || { total: {}, cities: {} };
    const isTotal = item.key === "total";
    
    const peakValue = isTotal ? eventPeaks.total?.primePeak || 0 : eventPeaks.cities?.[item.key]?.primePeak || 0;
    const peakTime = isTotal ? eventPeaks.total?.primePeakTime || "--:--" : eventPeaks.cities?.[item.key]?.primePeakTime || "--:--";
    
    // Comparação Dinâmica (Vs Evento Anterior)
    let compareDays = 7;
    if (item.key === "nobre") {
      const eventDayOfWeek = (effectiveWeekday - daysToLastEvent + 35) % 7;
      if (eventDayOfWeek === 5 || eventDayOfWeek === 6) compareDays = 1; // Sexta vs Quinta, Sábado vs Sexta
      else if (eventDayOfWeek === 4) compareDays = 5; // Quinta vs Sábado anterior
    }
    
    const prevEventDateKey = getDateKeyDaysAgoFromSnapshot(currentSnapshot, daysToLastEvent + compareDays + (useYesterdayFocus ? 1 : 0));
    const prevEventPeaks = peaks[prevEventDateKey] || { total: {}, cities: {} };
    const prevPeakValue = isTotal ? prevEventPeaks.total?.primePeak || 0 : prevEventPeaks.cities?.[item.key]?.primePeak || 0;

    const weekAgoDateKey = getDateKeyDaysAgoFromSnapshot(currentSnapshot, daysToLastEvent + 7 + (useYesterdayFocus ? 1 : 0));
    const weekAgoPeaks = peaks[weekAgoDateKey] || { total: {}, cities: {} };
    const weekAgoPeakValue = isTotal ? weekAgoPeaks.total?.primePeak || 0 : weekAgoPeaks.cities?.[item.key]?.primePeak || 0;

    const diffPrev = calculateDiff(peakValue, prevPeakValue);
    const diffWeek = calculateDiff(peakValue, weekAgoPeakValue);

    const displayDate = new Date(currentSnapshot.timestamp - (daysToLastEvent + (useYesterdayFocus ? 1 : 0)) * 24 * 60 * 60 * 1000);
    const weekdayName = new Intl.DateTimeFormat("pt-BR", { weekday: "long", timeZone: FIVEM_TIMEZONE }).format(displayDate);

    const isActuallyLiveToday = item.days.includes(effectiveWeekday); // Se o evento está "ao vivo" hoje

    let fieldValue = `**Pico:** \`${formatNumber(peakValue)}\` @ \`${peakTime}\`\n` +
                     `**Vs Prev:** ${formatDiff(diffPrev)}\n` +
                     `**Vs 7D:** ${formatDiff(diffWeek)}\n` +
                     `*Janela: ${item.label} na ${weekdayName}*`;

    // Especial para Nobre: Detalhes dos 3 dias de evento no mesmo painel
    if (item.key === "nobre" && isActuallyLiveToday) {
       const qVal = peaks[getDateKeyDaysAgoFromSnapshot(currentSnapshot, (effectiveWeekday === 4 ? 0 : (effectiveWeekday === 5 ? 1 : 2)) + (useYesterdayFocus ? 1 : 0))]?.cities?.nobre?.primePeak || 0;
       const sVal = effectiveWeekday >= 5 ? peaks[getDateKeyDaysAgoFromSnapshot(currentSnapshot, (effectiveWeekday === 5 ? 0 : 1) + (useYesterdayFocus ? 1 : 0))]?.cities?.nobre?.primePeak || 0 : 0;
       const bVal = effectiveWeekday === 6 ? peaks[getDateKeyDaysAgoFromSnapshot(currentSnapshot, 0 + (useYesterdayFocus ? 1 : 0))]?.cities?.nobre?.primePeak || 0 : 0;
       
       if (qVal > 0 || sVal > 0 || bVal > 0) {
         fieldValue += `\n📊 Ciclo (Qui/Sex/Sáb): Qui: \`${formatNumber(qVal)}\` | Sex: \`${formatNumber(sVal)}\` | Sáb: \`${formatNumber(bVal)}\``;
       }
    }

    consolidatedFocusEmbed.addFields({
      name: `${item.emoji} BR ${item.name}${isActuallyLiveToday ? "" : " (Fixo)"}`,
      value: fieldValue,
      inline: false // Cada cidade em uma linha separada
    });
  }

  consolidatedFocusEmbed.setFooter({
    text: `Análise de Foco Diário • Sincronizado às ${currentSnapshot.spTime}`,
    iconURL: client.user.displayAvatarURL()
  });

  embeds.push(consolidatedFocusEmbed);

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
 const compWPrimePeaks = useYesterdayFocus ? peaks[getDateKeyDaysAgoFromSnapshot(currentSnapshot, 8)] || { total: {} } : lastWeekPeaks;

 // Cálculos de comparação para o Total Geral do horário de eventos
 const totalPrimeDiffY = calculateDiff(activePrimePeaks.total?.primePeak || 0, compYPrimePeaks.total?.primePeak || 0);
 const totalPrimeDiffW = calculateDiff(activePrimePeaks.total?.primePeak || 0, compWPrimePeaks.total?.primePeak || 0);

 // Mapeia os dados baseados nos picos ativos (hoje ou resumo de ontem)
 const effectivePeakData = FIVEM_CITIES.map(city => {
    const p = activePrimePeaks.cities?.[city.key];
    const py = compYPrimePeaks.cities?.[city.key];
    const pw = compWPrimePeaks.cities?.[city.key];
    return {
        name: city.name,
        emoji: city.emoji,
        val: p?.primePeak || 0,
        time: p?.primePeakTime || "--:--",
        diffY: calculateDiff(p?.primePeak || 0, py?.primePeak || 0),
        diffW: calculateDiff(p?.primePeak || 0, pw?.primePeak || 0)
    };
 }).sort((a, b) => b.val - a.val);

 const primeEmbed = new EmbedBuilder()
   .setColor(baseColor)
   .setTitle(`🔥 PRIME TIME — RETENÇÃO EM EVENTO${useYesterdayFocus ? " (Ontem)" : ""}`)
   .setDescription(
     `*Janela de análise: **${primeTimeLabel}***\n\n` +
     effectivePeakData.map((item, index) => {
       const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${index + 1}.`;

       return (
         `${medal} **BR ${item.name}** • \`${formatNumber(item.val)}\` às \`${item.time}\`\n` +
         `> **Trends:** ${formatDiff(item.diffY)} (24h) | ${formatDiff(item.diffW)} (7d)`
       );
     }).join("\n\n") +
     `\n\n${UI.DIVIDER}\n` +
     `**Máxima no Horário:** \`${formatNumber(activePrimePeaks.total?.primePeak)}\` players\n` +
     `> **Vs Ontem:** ${formatDiff(totalPrimeDiffY)}\n` +
     `> **Vs Semana Passada:** ${formatDiff(totalPrimeDiffW)}`
   )
   .setFooter({ text: `${useYesterdayFocus ? "Resumo Consolidado" : "Monitoramento em Tempo Real"} • Ref: ${currentSnapshot.spTime}` });
 embeds.push(primeEmbed);

 // Botão de atualização manual
 const row = new ActionRowBuilder().addComponents(
   new ButtonBuilder()
     .setCustomId("fivem_retention_force_refresh")
     .setLabel("🔄 Forçar atualização")
     .setStyle(ButtonStyle.Primary)
 );
// TESTE MACEDO 123
 return { embeds, row };
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
     msg = await channel.send({ embeds, components: [row] });

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

 const currentSnapshot = await createCurrentSnapshot();
 await addSnapshot(currentSnapshot);
 const hasNewPeak = await updateDailyPeaks(currentSnapshot);

 // 🚀 Inteligência: Só edita a mensagem se for forçado, novo pico ou horário das 21h
 const is21h = isExact21hSnapshot(currentSnapshot);
 if (!options.force && !hasNewPeak && !is21h) {
   return null;
 }

 const { embeds, row } = await buildEmbeds(channel.client, currentSnapshot);
 try {
   const edited = await sticky.edit({ embeds, components: [row] });
   if (edited) FIVEM_DEBUG && console.log("[FIVEM_RETENTION] Sticky editada:", edited.id);
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
   if (!interaction.isButton?.() || interaction.customId !== "fivem_retention_force_refresh") return false;

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
