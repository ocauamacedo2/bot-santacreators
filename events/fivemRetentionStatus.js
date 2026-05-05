// /application/events/fivemRetentionStatus.js
// FIVEM RETENTION STATUS — sticky (auto + manual refresh) [ESM, robusto]
// ✅ Feito para teu roteador central (ready + interactionCreate), SEM client.on aqui

import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
} from "discord.js";
import fs from "node:fs";
import path from "node:path";

// ⚙️ CONFIG
const FIVEM_PANEL_CHANNEL_ID = "1501321157259956244";
const FIVEM_REFRESH_INTERVAL_MS = 2 * 60 * 1000; // 2 minutos
const FIVEM_HISTORY_MAX_DAYS = 30; // Limitar histórico a 30 dias
const FIVEM_FETCH_TIMEOUT_MS = 10 * 1000; // 10 segundos
const FIVEM_COMPARISON_TOLERANCE_MS = 10 * 60 * 1000; // 10 minutos
const FIVEM_TIMEZONE = "America/Sao_Paulo";
const FIVEM_RANK_MARKER_TAG = "[FIVEM_RETENTION_STATUS]";

// Caminhos dos arquivos
const DATA_DIR = path.resolve(__dirname, "../../data"); // Assumindo que 'events' está em 'application/events'
const HISTORY_FILE_PATH = path.join(DATA_DIR, "fivem_retention_status_history.json");


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


const FIVEM_STATE = new Map(); // channelId -> { intervalId, messageId }
const FIVEM_DEBUG = false;

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

// ---------- HISTORY PERSISTENCE ----------
function ensureDataDir() {
 try {
   if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
 } catch (e) {
   console.error("[FIVEM_RETENTION] Erro ao criar pasta de dados:", e);
 }
}
function loadHistory() {
 ensureDataDir();
 try {
   if (!fs.existsSync(HISTORY_FILE_PATH)) return [];
   const raw = fs.readFileSync(HISTORY_FILE_PATH, "utf8");
   const history = JSON.parse(raw);
   // Limitar histórico a 30 dias
   const thirtyDaysAgo = Date.now() - FIVEM_HISTORY_MAX_DAYS * 24 * 60 * 60 * 1000;
   return history.filter(s => s.timestamp >= thirtyDaysAgo);
 } catch (e) {
   console.error("[FIVEM_RETENTION] Histórico corrompido. Fazendo backup e iniciando novo.", e);
   const backupPath = `${HISTORY_FILE_PATH}.corrupted.${Date.now()}.json`;
   if (fs.existsSync(HISTORY_FILE_PATH)) {
     fs.renameSync(HISTORY_FILE_PATH, backupPath);
   }
   return [];
 }
}
function saveHistory(history) {
 ensureDataDir();
 try {
   const tempPath = `${HISTORY_FILE_PATH}.tmp`;
   fs.writeFileSync(tempPath, JSON.stringify(history, null, 2), "utf8");
   fs.renameSync(tempPath, HISTORY_FILE_PATH);
 } catch (e) {
   console.error("[FIVEM_RETENTION] Erro ao salvar histórico:", e);
 }
}
function addSnapshot(history, newSnapshot) {
 const lastSnapshot = history[history.length - 1];
 if (lastSnapshot && (newSnapshot.timestamp - lastSnapshot.timestamp < 60 * 1000)) {
   // Não salvar duplicado se já tiver snapshot no mesmo minuto
   return false;
 }
 history.push(newSnapshot);
 // Manter histórico limitado
 const thirtyDaysAgo = Date.now() - FIVEM_HISTORY_MAX_DAYS * 24 * 60 * 60 * 1000;
 const filteredHistory = history.filter(s => s.timestamp >= thirtyDaysAgo);
 saveHistory(filteredHistory);
 return true;
}
function findNearestSnapshot(history, targetTimestamp, toleranceMs) {
 let nearest = null;
 let minDiff = Infinity;
 for (const snapshot of history) {
   const diff = Math.abs(snapshot.timestamp - targetTimestamp);
   if (diff <= toleranceMs && diff < minDiff) {
     minDiff = diff;
     nearest = snapshot;
   }
 }
 return nearest;
}
function getSnapshotDaysAgo(history, days) {
 const now = Date.now();
 const targetTimestamp = now - days * 24 * 60 * 60 * 1000;
 return findNearestSnapshot(history, targetTimestamp, FIVEM_COMPARISON_TOLERANCE_MS);
}

// ---------- FIVEM API ----------
async function fetchCityStatus(city) {
 const fetchFn = await getFetch();
 const controller = new AbortController();
 const timeout = setTimeout(() => controller.abort(), FIVEM_FETCH_TIMEOUT_MS);
 try {
   const res = await fetchFn(city.url, { method: "GET", signal: controller.signal });
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
   timestamp: now.getTime(),
   iso: now.toISOString(),
   spDate: `${spParts.year}-${String(spParts.month).padStart(2, '0')}-${String(spParts.day).padStart(2, '0')}`,
   spTime: `${String(spParts.hour).padStart(2, '0')}:${String(spParts.minute).padStart(2, '0')}`,
   spWeekday: spParts.weekday,
   hour: spParts.hour,
   minute: spParts.minute,
   cities,
   totalClients,
   totalMaxClients,
 };
}
function getWeekAverage(history, weekKey) {
 const weekSnapshots = history.filter(s => getWeekKeySP(new Date(s.timestamp)) === weekKey);
 if (weekSnapshots.length === 0) return { average: 0, count: 0 };
 const total = weekSnapshots.reduce((sum, s) => sum + s.totalClients, 0);
 return { average: total / weekSnapshots.length, count: weekSnapshots.length };
}
// ---------- EMBED BUILDER ----------
async function buildEmbeds(client, currentSnapshot, history) {
 const embeds = [];
 const mainEmbed = new EmbedBuilder()
   .setColor(cn2ParseColor(process.env.BASE_COLORS, MENU_COLOR))
   .setTitle("📊 STATUS GERAL FIVEM • RETENÇÃO")
   .setDescription("Comparativo automático entre cidades usando dados públicos do FiveM/CFX.");
 const fields = [];
 let totalCurrentClients = 0;
 let totalCurrentMaxClients = 0;
 const cityComparisonData = {};
 for (const cityConfig of FIVEM_CITIES) {
   const city = currentSnapshot.cities[cityConfig.key];
   if (!city) continue;
   totalCurrentClients += city.clients;
   totalCurrentMaxClients += city.maxClients;
   // Comparação com 7 dias atrás
   const sevenDaysAgoSnapshot = getSnapshotDaysAgo(history, 7);
   const sevenDaysAgoCity = sevenDaysAgoSnapshot?.cities?.[cityConfig.key];
   const sevenDaysAgoClients = sevenDaysAgoCity?.clients || 0;
   const diffSevenDays = calculateDiff(city.clients, sevenDaysAgoClients);
   // Comparação com ontem
   const yesterdaySnapshot = getSnapshotDaysAgo(history, 1);
   const yesterdayCity = yesterdaySnapshot?.cities?.[cityConfig.key];
   const yesterdayClients = yesterdayCity?.clients || 0;
   const diffYesterday = calculateDiff(city.clients, yesterdayClients);
   cityComparisonData[cityConfig.key] = { diffSevenDays, diffYesterday };
   fields.push({
     name: `${cityConfig.emoji} ${city.name} ${city.online ? '🟢 Online' : '🔴 Offline'}`,
     value: `👥 Agora: ${formatNumber(city.clients)} / ${formatNumber(city.maxClients)}\n` +
            `📅 Semana passada: ${formatNumber(sevenDaysAgoClients)}\n` +
            `📈 Dif. semanal: ${formatDiff(diffSevenDays)}\n` +
            `🕘 Ontem: ${formatNumber(yesterdayClients)}\n` +
            `📊 Dif. diária: ${formatDiff(diffYesterday)}`,
     inline: true,
   });
 }
 mainEmbed.addFields(fields);
 // Total Geral
 const sevenDaysAgoTotalSnapshot = getSnapshotDaysAgo(history, 7);
 const sevenDaysAgoTotalClients = sevenDaysAgoTotalSnapshot?.totalClients || 0;
 const diffTotalSevenDays = calculateDiff(totalCurrentClients, sevenDaysAgoTotalClients);
 const yesterdayTotalSnapshot = getSnapshotDaysAgo(history, 1);
 const yesterdayTotalClients = yesterdayTotalSnapshot?.totalClients || 0;
 const diffTotalYesterday = calculateDiff(totalCurrentClients, yesterdayTotalClients);
 mainEmbed.addFields({
   name: "🌎 TOTAL GERAL",
   value: `👥 Agora: ${formatNumber(totalCurrentClients)} / ${formatNumber(totalCurrentMaxClients)}\n` +
          `📅 Semana passada: ${formatNumber(sevenDaysAgoTotalClients)}\n` +
          `📈 Dif. semanal: ${formatDiff(diffTotalSevenDays)}\n` +
          `🕘 Ontem: ${formatNumber(yesterdayTotalClients)}\n` +
          `📊 Dif. diária: ${formatDiff(diffTotalYesterday)}`,
   inline: false,
 });
 embeds.push(mainEmbed);
 // Ranking e Médias (segundo embed)
 const secondaryEmbed = new EmbedBuilder()
   .setColor(cn2ParseColor(process.env.BASE_COLORS, MENU_COLOR));
 // Ranking Atual
 const rankingAtual = Object.values(currentSnapshot.cities)
   .filter(c => c.online)
   .sort((a, b) => b.clients - a.clients)
   .map((c, i) => `${i + 1}º ${c.name} — ${formatNumber(c.clients)} players`);
 secondaryEmbed.addFields({
   name: "🏆 RANKING ATUAL",
   value: rankingAtual.length > 0 ? rankingAtual.join("\n") : "N/A",
   inline: false,
 });
 // Ranking de Crescimento Semanal
 const growthRanking = [];
 for (const cityConfig of FIVEM_CITIES) {
   const cityData = cityComparisonData[cityConfig.key];
   if (cityData?.diffSevenDays?.pct !== 'sem base' && typeof cityData?.diffSevenDays?.pct === 'number') {
     growthRanking.push({ name: cityConfig.name, pct: cityData.diffSevenDays.pct });
   }
 }
 growthRanking.sort((a, b) => b.pct - a.pct);
 const growthRankingText = growthRanking.length > 0
   ? growthRanking.map((c, i) => `${i + 1}º ${c.name} — ${c.pct.toFixed(1)}%`).join("\n")
   : "sem base ainda";
 secondaryEmbed.addFields({
   name: "🚀 MAIOR CRESCIMENTO SEMANAL",
   value: growthRankingText,
   inline: false,
 });
 // Médias Semanais
 const currentWeekKey = getWeekKeySP(new Date(currentSnapshot.timestamp));
 const currentWeekAvg = getWeekAverage(history, currentWeekKey);
 const lastWeekKey = getWeekKeySP(new Date(currentSnapshot.timestamp - 7 * 24 * 60 * 60 * 1000));
 const lastWeekAvg = getWeekAverage(history, lastWeekKey);
 const diffAvg = calculateDiff(currentWeekAvg.average, lastWeekAvg.average);
 const avgText = `Semana atual: ${currentWeekAvg.count > 0 ? formatNumber(currentWeekAvg.average.toFixed(0)) : 'coletando histórico'} players de média\n` +
                 `Semana passada: ${lastWeekAvg.count > 0 ? formatNumber(lastWeekAvg.average.toFixed(0)) : 'coletando histórico'} players de média\n` +
                 `Diferença: ${formatDiff(diffAvg)}`;
 secondaryEmbed.addFields({
   name: "📦 MÉDIA DA SEMANA",
   value: avgText,
   inline: false,
 });
 // Rodapé
 secondaryEmbed.setFooter({ text: `Fonte: FiveM/CFX público • Atualiza a cada 2 min • Hoje às ${currentSnapshot.spTime}` });
 embeds.push(secondaryEmbed);
 const row = new ActionRowBuilder().addComponents(
   new ButtonBuilder()
     .setCustomId("fivem_retention_force_refresh")
     .setLabel("🔄 Forçar atualização")
     .setStyle(ButtonStyle.Primary)
 );
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
   const history = loadHistory();
   const currentSnapshot = await createCurrentSnapshot();
   addSnapshot(history, currentSnapshot);
   const { embeds, row } = await buildEmbeds(channel.client, currentSnapshot, history);
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
 const history = loadHistory();
 const currentSnapshot = await createCurrentSnapshot();
 addSnapshot(history, currentSnapshot);
 const { embeds, row } = await buildEmbeds(channel.client, currentSnapshot, history);
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
   if (!channel) return console.error("[FIVEM_RETENTION] Canal fixo não encontrado:", FIVEM_PANEL_CHANNEL_ID);
   if (typeof channel.isTextBased !== "function" || !channel.isTextBased()) {
     return console.error("[FIVEM_RETENTION] Canal fixo não é textual");
   }
   const edited = await editPanel(channel);
   if (!edited) return;
   const existing = FIVEM_STATE.get(channel.id);
   if (existing?.intervalId) clearInterval(existing.intervalId);
   let intervalId = null;
   intervalId = setInterval(async () => {
     await editPanel(channel);
   }, FIVEM_REFRESH_INTERVAL_MS);
   FIVEM_STATE.set(channel.id, { intervalId, messageId: edited.id });
   FIVEM_DEBUG && console.log("[FIVEM_RETENTION] READY ok — sticky ok no canal", channel.id);
 } catch (err) {
   console.error("[FIVEM_RETENTION] fivemRetentionStatusOnReady erro:", err?.message || err);
 }
}
export async function fivemRetentionStatusHandleInteraction(interaction, client) {
 try {
   if (!interaction.isButton?.() || interaction.customId !== "fivem_retention_force_refresh") return false;
   await interaction.deferReply({ ephemeral: true });
   const channel = interaction.channel;
   if (!channel?.isTextBased?.()) {
     await interaction.editReply("❌ Não consegui acessar o canal para atualizar o painel.");
     return true;
   }
   try {
     await editPanel(channel);
     await interaction.editReply("✅ Painel atualizado com sucesso!");
   } catch (e) {
     console.error("[FIVEM_RETENTION] Erro ao forçar atualização:", e);
     await interaction.editReply("❌ Não consegui atualizar agora. Tente novamente mais tarde.");
   }
   return true;
 } catch (e) {
   cn2LogApiError("[FIVEM_RETENTION] fivemRetentionStatusHandleInteraction erro:", e);
   return false;
 }
}
export function fivemRetentionStatusOnChannelDelete(channel) {
 const state = FIVEM_STATE.get(channel?.id);
 if (state?.intervalId) clearInterval(state.intervalId);
 if (channel?.id) FIVEM_STATE.delete(channel.id);
}
