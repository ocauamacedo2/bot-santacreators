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
const FIVEM_DEBUG = true; 
const DEFAULT_COLOR = 0x2b2d31;


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
export function getPrimeTimeWindow(snapshot) {
  const weekday = getSaoPauloWeekday(new Date(snapshot.timestamp));
  if (weekday >= 1 && weekday <= 3) return { startHour: 18, endHour: 20, label: "18:00 às 20:00" };
  if (weekday >= 4 && weekday <= 6) return { startHour: 21, endHour: 23, label: "21:00 às 23:00" };
  return null;
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
 if (typeof current !== 'number' || isNaN(current)) return { diff: 'N/A', pct: 'N/A', arrow: '⚪' };
 if (typeof previous !== 'number' || isNaN(previous) || previous === 0) {
   return { diff: current, pct: 'sem base', arrow: current > 0 ? '🟢 ▲' : (current < 0 ? '🔴 ▼' : '⚪ ➖') };
 }
 const diff = current - previous;
 const pct = (diff / previous) * 100;
 return { diff, pct, arrow: diff > 0 ? '🟢 ▲' : (diff < 0 ? '🔴 ▼' : '⚪ ➖') };
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
  return snapshot.hour >= window.startHour && snapshot.hour < window.endHour;
}

async function updateDailyPeaks(currentSnapshot) {
  try {
    const dateKey = currentSnapshot.spDate;
    let dayPeak = await PeakModel.findOne({ date: dateKey });

    if (!dayPeak) {
      dayPeak = new PeakModel({ // Garante que o objeto total e cities existam
        date: dateKey,
        total: { peak: 0, peakTime: null, peakAt: 0, primePeak: 0, primePeakTime: null, primePeakAt: 0 },
        cities: {},
        exact21h: { total: 0, cities: {} } // Inicializa o novo campo
      });
    } else if (!dayPeak.exact21h) { // Adiciona o campo se não existir em documentos antigos
      dayPeak.exact21h = { total: 0, cities: {} };
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
      dayPeak.exact21h.total = currentSnapshot.totalClients || 0;
      dayPeak.exact21h.cities = currentSnapshot.cities;
    }

    const isPrime = isPrimeTimeSnapshot(currentSnapshot);

    if ((currentSnapshot.totalClients || 0) > (dayPeak.total.peak || 0)) {
      dayPeak.total.peak = currentSnapshot.totalClients || 0;
      dayPeak.total.peakTime = currentSnapshot.spTime;
      dayPeak.total.peakAt = currentSnapshot.timestamp;
    }

    if (isPrime && (currentSnapshot.totalClients || 0) > (dayPeak.total.primePeak || 0)) {
      dayPeak.total.primePeak = currentSnapshot.totalClients || 0;
      dayPeak.total.primePeakTime = currentSnapshot.spTime;
      dayPeak.total.primePeakAt = currentSnapshot.timestamp;
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
 if (!previous || previous <= 0) return "⚪ `(sem base)`";

 const diff = current - previous;
 const pct = (diff / previous) * 100;

 if (diff > 0) return `🔴 \`+${formatNumber(diff)}\` **+${pct.toFixed(1)}%**`;
 if (diff < 0) return `🟢 \`${formatNumber(diff)}\` **${pct.toFixed(1)}%**`;

 return `🟠 \`0\` **0.0%**`;
}

function formatPanelLine(label, current, previous) {
 return `**BR ${label.padEnd(8, " ")}** : \`${formatNumber(current)} / ${formatNumber(previous || 0)}\` ${formatCompareCompact(current, previous)}`;
}

function getStatusEmojiByYesterday(current, previous) {
 if (!previous || previous <= 0) return "⚪";

 const diff = current - previous;
 const pct = (diff / previous) * 100;

 if (diff > 0) return "🔴";
 if (diff < 0) return "🟢";

 return "🟠";
}

function formatOnlyCurrentLine(label, current, max, pct, index, yesterday = 0) {
 const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${index + 1}.`;
 const statusEmoji = getStatusEmojiByYesterday(current, yesterday);

 return `${medal} **BR ${label.padEnd(8, " ")}** : \`${formatNumber(current)}/${formatNumber(max)}\` **${pct}%** ${statusEmoji}`;
}

// ---------- EMBED BUILDER ----------
async function buildEmbeds(client, currentSnapshot) {
 const embeds = [];

 const sevenDaysAgoSnapshot = await getSnapshotDaysAgo(7, currentSnapshot);
 const yesterdaySnapshot = await getSnapshotDaysAgo(1, currentSnapshot);

 let totalCurrentClients = 0;
 let totalCurrentMaxClients = 0;

 const cityData = FIVEM_CITIES
   .map((cityConfig) => {
     const city = currentSnapshot.cities[cityConfig.key];
     if (!city) return null;

     totalCurrentClients += city.clients;
     totalCurrentMaxClients += city.maxClients;

     return {
       config: cityConfig,
       current: city,
       yesterday: yesterdaySnapshot?.cities?.[cityConfig.key]?.clients || 0,
       week: sevenDaysAgoSnapshot?.cities?.[cityConfig.key]?.clients || 0,
       usage: city.maxClients > 0 ? ((city.clients / city.maxClients) * 100).toFixed(2) : "0.00",
     };
   })
   .filter(Boolean);

 const sortedCurrent = [...cityData].sort((a, b) => b.current.clients - a.current.clients);

 const capacityPercent = totalCurrentMaxClients > 0
   ? ((totalCurrentClients / totalCurrentMaxClients) * 100).toFixed(2)
   : "0.00";

 const summaryEmbed = new EmbedBuilder()
   .setColor(cn2ParseColor(process.env.BASE_COLORS, DEFAULT_COLOR))
   .setTitle("📊 STATUS GERAL FIVEM")
   .setDescription(
     `LISTA FIVEM - Players agora\n\n` +
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
     `\n\n**Total de Players** : \`${formatNumber(totalCurrentClients)} / ${formatNumber(totalCurrentMaxClients)}\`\n` +
     `**Média geral** : **${capacityPercent}%** 🔴`
   )
   .setFooter({
     text: `Fonte: FiveM/CFX público • Atualizando a cada 2 minutos • Hoje às ${currentSnapshot.spTime} • ${FIVEM_RANK_MARKER_TAG}`,
   });

 embeds.push(summaryEmbed);

 const yesterdayTotalClients = yesterdaySnapshot?.totalClients || 0;

 const yesterdayEmbed = new EmbedBuilder()
   .setColor(cn2ParseColor(process.env.BASE_COLORS, DEFAULT_COLOR))
   .setTitle("📉 COMPARAÇÃO COM ONTEM")
   .setDescription(
     `Players agora / Players ontem no mesmo horário\n\n` +
     cityData
       .map((item) => formatPanelLine(item.current.name, item.current.clients, item.yesterday))
       .join("\n\n") +
     `\n\n**Total de Players** : \`${formatNumber(totalCurrentClients)} / ${formatNumber(yesterdayTotalClients)}\` ${formatCompareCompact(totalCurrentClients, yesterdayTotalClients)}`
   )
   .setFooter({
     text: `Comparação diária • Hoje às ${currentSnapshot.spTime}`,
   });

 embeds.push(yesterdayEmbed);

 const sevenDaysAgoTotalClients = sevenDaysAgoSnapshot?.totalClients || 0;

 const weekEmbed = new EmbedBuilder()
   .setColor(cn2ParseColor(process.env.BASE_COLORS, DEFAULT_COLOR))
   .setTitle("📅 COMPARAÇÃO COM 7 DIAS ATRÁS")
   .setDescription(
     `Players agora / Players no mesmo horário há 7 dias\n\n` +
     cityData
       .map((item) => formatPanelLine(item.current.name, item.current.clients, item.week))
       .join("\n\n") +
     `\n\n**Total de Players** : \`${formatNumber(totalCurrentClients)} / ${formatNumber(sevenDaysAgoTotalClients)}\` ${formatCompareCompact(totalCurrentClients, sevenDaysAgoTotalClients)}`
   )
   .setFooter({
     text: `Comparação semanal • Hoje às ${currentSnapshot.spTime}`,
   });

 embeds.push(weekEmbed);

 const peaks = await loadPeaksMap();

 const todayKey = currentSnapshot.spDate;
 const yesterdayKey = getDateKeyDaysAgoFromSnapshot(currentSnapshot, 1);
 const lastWeekKeyForPeaks = getDateKeyDaysAgoFromSnapshot(currentSnapshot, 7);

 const todayPeaks = peaks[todayKey];
 const yesterdayPeaks = peaks[yesterdayKey];
 const lastWeekPeaks = peaks[lastWeekKeyForPeaks];
 
 // Configuração de Labels dinâmicos baseados no dia
 const primeWindow = getPrimeTimeWindow(currentSnapshot);
 const primeTimeLabel = primeWindow ? primeWindow.label : "sem horário específico";

 const weekday = getSaoPauloWeekday(new Date(currentSnapshot.timestamp));
 const isRelevant21hDay = (weekday >= 1 && weekday <= 6);

 // Pega os totais das 21h para o resumo final
 const exact21hTodayTotal = todayPeaks?.exact21h?.total || 0;
 const exact21hYesterdayTotal = yesterdayPeaks?.exact21h?.total || 0;

 const peakCityData = FIVEM_CITIES
   .map((cityConfig) => {
     const todayCityPeak = todayPeaks?.cities?.[cityConfig.key];
     const yesterdayCityPeak = yesterdayPeaks?.cities?.[cityConfig.key];
     const lastWeekCityPeak = lastWeekPeaks?.cities?.[cityConfig.key];

     const exact21hCityToday = todayPeaks?.exact21h?.cities?.[cityConfig.key]?.clients || 0;
     const exact21hCityYesterday = yesterdayPeaks?.exact21h?.cities?.[cityConfig.key]?.clients || 0;
     const exact21hCityLastWeek = lastWeekPeaks?.exact21h?.cities?.[cityConfig.key]?.clients || 0;

     return {
  name: cityConfig.name,
  todayPeak: todayCityPeak?.peak || 0,
  todayPeakTime: todayCityPeak?.peakTime || "--:--",

  yesterdayPeak: yesterdayCityPeak?.peak || 0,
  weekPeak: lastWeekCityPeak?.peak || 0,

  primePeak: todayCityPeak?.primePeak || 0,
  primePeakTime: todayCityPeak?.primePeakTime || "--:--",

  yesterdayPrimePeak: yesterdayCityPeak?.primePeak || 0,
  weekPrimePeak: lastWeekCityPeak?.primePeak || 0, // Corrigido para weekPrimePeak

  exact21hToday: exact21hCityToday,
  exact21hYesterday: exact21hCityYesterday,
  exact21hLastWeek: exact21hCityLastWeek,
};
   })
   .sort((a, b) => b.primePeak - a.primePeak);

 const primeEmbed = new EmbedBuilder()
  .setColor(cn2ParseColor(process.env.BASE_COLORS, DEFAULT_COLOR))
  .setTitle(`🔥 PICOS DO HORÁRIO DE EVENTOS (${primeTimeLabel}) 💜`)
  .setDescription(
    `Maior pico registrado entre **${primeTimeLabel}**\n` +
    `Comparando cada cidade com o pico dela mesma de ontem e de 7 dias atrás.\n\n` +
    peakCityData
      .map((item, index) => {
        // Linha extra com o valor das 21h em ponto
        let exact21hLine = "";
        if (isRelevant21hDay) {
          exact21hLine = `🕒 às 21:00: \`${formatNumber(item.exact21hToday)}\` players ` +
                         ` (Ontem: \`${formatNumber(item.exact21hYesterday)}\` ${formatCompareCompact(item.exact21hToday, item.exact21hYesterday)})\n` +
                         ` 7 dias atrás: \`${formatNumber(item.exact21hLastWeek)}\` ${formatCompareCompact(item.exact21hToday, item.exact21hLastWeek)}\n`;
        }




        const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${index + 1}.`;

        return (
          `${medal} **BR ${item.name.padEnd(8, " ")}**\n` +
          `Hoje: ${formatPrimePeakToday(item.primePeak, item.primePeakTime, currentSnapshot)}\n` +
          `Ontem: \`${formatNumber(item.yesterdayPrimePeak)}\` players ${formatCompareCompact(item.primePeak, item.yesterdayPrimePeak)}\n` +
          `7 dias: \`${formatNumber(item.weekPrimePeak)}\` players ${formatCompareCompact(item.primePeak, item.weekPrimePeak)}`
          + (exact21hLine ? `\n${exact21hLine}` : "")
        );
      })
      .join("\n\n")
  )
  .setFooter({
    text: `Picos salvos automaticamente • Eventos ${primeTimeLabel} • Hoje às ${currentSnapshot.spTime}`,
  });

embeds.push(primeEmbed);

 const allPeaksRanking = FIVEM_CITIES
   .map((cityConfig) => {
     const todayCityPeak = todayPeaks?.cities?.[cityConfig.key];

     return {
       name: cityConfig.name,
       peak: todayCityPeak?.peak || 0,
       time: todayCityPeak?.peakTime || "--:--",
     };
   })
   .sort((a, b) => b.peak - a.peak);

 const peaksRankingEmbed = new EmbedBuilder()
   .setColor(cn2ParseColor(process.env.BASE_COLORS, DEFAULT_COLOR))
   .setTitle("🏆 MAIORES PICOS DO DIA")
   .setDescription(
     `Ranking geral dos maiores picos de hoje\n\n` +
     allPeaksRanking
       .map((item, index) => {
         const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${index + 1}.`;
         return `${medal} **BR ${item.name.padEnd(8, " ")}** : \`${formatNumber(item.peak)}\` às \`${item.time}\``;
       })
       .join("\n\n") +
     (isRelevant21hDay 
       ? `\n\n**Total Geral às 21:00:** \`${formatNumber(exact21hTodayTotal)}\` ${formatCompareCompact(exact21hTodayTotal, exact21hYesterdayTotal)}` 
       : ""
     ) +
     `\n\n**Total geral** : ${formatPeakValue(todayPeaks?.total?.peak, todayPeaks?.total?.peakTime)}`
   )
   .setFooter({
     text: `Pico diário • Hoje às ${currentSnapshot.spTime}`,
   });

 embeds.push(peaksRankingEmbed);

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
   const perms = channel.permissionsFor(botId);
   if (!perms?.has(PermissionsBitField.Flags.ViewChannel) || !perms?.has(PermissionsBitField.Flags.ReadMessageHistory)) {
     FIVEM_DEBUG && console.log("[FIVEM_RETENTION] Sem permissão de Ler Histórico no canal", channel.id);
     return null;
   }
   const msgs = await channel.messages.fetch({ limit: 50 }).catch(() => null);
   if (!msgs) return null;
   const found = msgs.find(
     (m) =>
       m.author?.id === botId &&
       m.embeds?.length > 0 &&
       ((m.embeds[0].footer?.text || "").includes(FIVEM_RANK_MARKER_TAG))
   );
   return found || null;
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
 await updateDailyPeaks(currentSnapshot); // Make sure this is awaited
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
   const channel = await client.channels.fetch(FIVEM_PANEL_CHANNEL_ID).catch(() => null);
   if (!channel || !channel.isTextBased()) {
     console.error("[FIVEM_RETENTION] Canal fixo não encontrado ou inválido:", FIVEM_PANEL_CHANNEL_ID);
     return;
   }

   // Limpa intervalos antigos para evitar duplicidade no mesmo canal
   const existing = FIVEM_STATE.get(channel.id);
   if (existing?.intervalId) clearInterval(existing.intervalId);

   // Tenta o primeiro update agora (sem travar o resto do bot)
   editPanel(channel).catch(e => console.error("[FIVEM_RETENTION] Erro no update inicial:", e));

   // Inicia o loop que roda a cada 2 minutos, faça chuva ou faça sol
   const intervalId = setInterval(async () => {
     try {
       await editPanel(channel);
     } catch (e) {
       console.error("[FIVEM_RETENTION] Erro no loop de atualização automática:", e);
     }
   }, FIVEM_REFRESH_INTERVAL_MS);

   FIVEM_STATE.set(channel.id, { intervalId, messageId: null });
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

     const edited = await editPanel(channel);
     
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
