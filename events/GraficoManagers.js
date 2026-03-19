


// /application/events/GraficoManagers.js
// GRAFICO_MANAGERS v2 — Dashboard ORGs (Registro Manager)
// ✅ Mensagem única (edita, não spamma)
// ✅ 3 embeds: (1) texto/stats (2) GIF grande (3) gráfico grande
// ✅ Gráfico ÚLTIMAS 4 SEMANAS + números em cima + barras finas
// ✅ Cores por faixa: <20 vermelho | 20–29 amarelo | 30–39 laranja | 40+ verde
// ✅ Top 3 semana atual + Top 1 semana passada
// ✅ Status por faixa + meta 40
// ✅ Logs detalhados em canal fixo
// ✅ Botão manual "Atualizar"
// ✅ Hook-based (SEM client.on aqui dentro) -> pluga no teu index

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlagsBitField,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";


// ===============================
// CONFIG (AJUSTA SÓ ISSO AQUI)
// ===============================

// Canal ONDE o dashboard vai ficar (1 mensagem fixa)
const ORG_DASH_CHANNEL_ID = "1457840340659736658";

// Canal de LOGS do dashboard
const ORG_DASH_LOG_CHANNEL_ID = "1460339582842310731";

// ✅ ÍCONE / FOTO (vai lá em cima no author)
const DASH_ICON_FALLBACK =
  "https://media.discordapp.net/attachments/1362477839944777889/1368084293905285170/sc2.png?format=webp&quality=lossless&width=953&height=953";

// ✅ GIF GRANDE (vai embaixo, antes do gráfico)
const DASH_GIF_BIG =
  "https://media.discordapp.net/attachments/1362477839944777889/1384245215249825832/standard_2rss.gif?width=900&height=120";

// Arquivo do Registro Manager (persistente)
const WEEKLY_STATS_PATH = "./reg_manager_weekly_stats.json";

// State do dashboard (guarda messageId/hash pra não spammar)
const ORG_DASH_STATE_PATH = "./grafico_managers_state.json";

// ✅ Quantas semanas mostrar no gráfico (últimas 4)
const CHART_WEEKS = 4;

// Meta semanal
const WEEKLY_GOAL = 40;



// Botão ID
const BTN_REFRESH_ID = "GM_REFRESH";

const BTN_ADJUST_ID = "GM_ADJUST_POINTS";
const BTN_ADD_POINTS_ID = "GM_ADD_POINTS";

// ✅ QUEM PODE AJUSTAR (bota seus IDs aqui)
const GM_ADJUST_ALLOWED_USERS = [
  "660311795327828008",
  // "outro_id",
];

function canAdjust(userId) {
  return GM_ADJUST_ALLOWED_USERS.includes(String(userId || ""));
}



// ===============================
// TIME (SP) — timezone-safe
// ===============================
const TIME_LOCAL = (() => {
  const TZ = "America/Sao_Paulo";

  function nowInSP() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(new Date());

    const get = (t) => Number(parts.find((p) => p.type === t)?.value || 0);
    const y = get("year");
    const m = get("month");
    const d = get("day");
    const hh = get("hour");
    const mm = get("minute");
    const ss = get("second");

    return new Date(Date.UTC(y, m - 1, d, hh, mm, ss));
  }

  function startOfDaySP(dateUTC) {
    return new Date(Date.UTC(dateUTC.getUTCFullYear(), dateUTC.getUTCMonth(), dateUTC.getUTCDate()));
  }

  function addDays(dateUTC, n) {
    const x = new Date(dateUTC.getTime());
    x.setUTCDate(x.getUTCDate() + n);
    return x;
  }

  function fmtDateBR(dateUTC) {
    return dateUTC.toLocaleDateString("pt-BR", { timeZone: TZ });
  }

  function getCurrentWeekSP() {
    const now = nowInSP();
    const dow = now.getUTCDay(); // 0=Dom (SP)
    const sunday = startOfDaySP(addDays(now, -dow));
    const saturday = startOfDaySP(addDays(sunday, 6));
    const weekKey = sunday.toISOString().slice(0, 10);
    return { sunday, saturday, weekKey };
  }

  function getPrevWeekKey() {
    const { sunday } = getCurrentWeekSP();
    const prevSunday = startOfDaySP(addDays(sunday, -7));
    return prevSunday.toISOString().slice(0, 10);
  }

  function weekRangeLabelBR({ sunday, saturday }) {
    const [ds, ms, ys] = fmtDateBR(sunday).split("/");
    const [de, me, ye] = fmtDateBR(saturday).split("/");
    return ms === me && ys === ye
      ? `${ds}–${de}/${ms}/${ys}`
      : `${ds}/${ms}/${ys} – ${de}/${me}/${ye}`;
  }

  return { nowInSP, getCurrentWeekSP, getPrevWeekKey, weekRangeLabelBR };
})();

const { nowInSP, getCurrentWeekSP, getPrevWeekKey, weekRangeLabelBR } = TIME_LOCAL;

// ===============================
// FS HELPERS
// ===============================
function ensureDir(filePath) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  } catch {}
}

function readJSON(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const raw = fs.readFileSync(file, "utf-8");
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(file, data) {
  try {
    ensureDir(file);
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch {}
}

function sha1(x) {
  return crypto.createHash("sha1").update(String(x)).digest("hex");
}

function safeNum(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

function sumBucket(obj) {
  if (!obj || typeof obj !== "object") return 0;
  let s = 0;
  for (const k of Object.keys(obj)) s += safeNum(obj[k]);
  return s;
}

function topN(bucketObj, n = 3) {
  const entries = Object.entries(bucketObj || {})
    .map(([id, val]) => [String(id), safeNum(val)])
    function topN(bucketObj, n = 3) {
  const entries = Object.entries(bucketObj || {})
    .map(([id, val]) => [String(id), safeNum(val)]);

  entries.sort((a, b) => b[1] - a[1]);

  return entries
    .slice(0, n)
    .map(([id, v]) => ({ id, v }));
}


  entries.sort((a, b) => b[1] - a[1]);
  return entries.slice(0, n).map(([id, v]) => ({ id, v }));
}

function pctDiff(cur, prev) {
  cur = safeNum(cur);
  prev = safeNum(prev);

  if (prev <= 0 && cur > 0) return { pct: 100, sign: "+" };
  if (prev <= 0 && cur <= 0) return { pct: 0, sign: "" };

  const raw = ((cur - prev) / prev) * 100;
  const sign = raw >= 0 ? "+" : "-";
  return { pct: Math.abs(raw), sign };
}

// ===============================
// STATUS / COR (tua lógica “positiva/negativa”)
// ===============================
function getPerformanceStatus(total) {
  const t = safeNum(total);

  if (t <= 0) return { label: "Nenhuma ORG", emoji: "⚫", color: 0x2b2d31 };
  if (t >= 1 && t <= 19) return { label: "NEGATIVO", emoji: "🔴", color: 0xed4245 };
  if (t >= 20 && t <= 29) return { label: "QUASE LÁ", emoji: "🟡", color: 0xfee75c };
  if (t >= 30 && t <= 39) return { label: "OK (positivo)", emoji: "🟠", color: 0xfaa61a };
  if (t >= 40) return { label: "META BATIDA!", emoji: "🟢", color: 0x57f287 };

  return { label: "OK", emoji: "🟠", color: 0xfaa61a };
}

function progressText(total) {
  const t = safeNum(total);
  if (t <= 0) return "0%";
  const p = Math.min(100, Math.round((t / WEEKLY_GOAL) * 100));
  return `${p}%`;
}

// ===============================
// CHART (QuickChart) — últimas 4 semanas, números em cima, cores por faixa
// ===============================
function barColorFor(v) {
  const n = safeNum(v);
  if (n <= 0) return "#6b7280";     // cinza
  if (n < 20) return "#ed4245";     // vermelho
  if (n < 30) return "#fee75c";     // amarelo
  if (n < 40) return "#faa61a";     // laranja
  return "#57f287";                 // verde
}

function buildChartConfig(labels, totals) {
  const sumLast4 = totals.reduce((a, b) => a + safeNum(b), 0);
  const colors = totals.map(barColorFor);

  const safeTotals = totals.length ? totals : [0];

  const maxValue = Math.max(...safeTotals, WEEKLY_GOAL);
  const yMax = Math.ceil((maxValue + 5) / 5) * 5;

  return {
  type: "bar",

  data: {
    labels,
    datasets: [
      {
        type: "bar",
        label: "ORGs aprovadas",
        data: safeTotals,
        backgroundColor: colors,
        borderWidth: 0,
        borderRadius: 10,
        barThickness: 42,
        maxBarThickness: 52,
        order: 1,
      },

      {
  type: "line",
  label: `Meta (${WEEKLY_GOAL})`,
  data: new Array(labels.length).fill(WEEKLY_GOAL),

  borderColor: "#ffffff",
  borderWidth: 2,
  borderDash: [6, 6],

  pointRadius: 0,
  pointHoverRadius: 0,
  tension: 0,
  fill: false,
  yAxisID: "y",
  order: 99,

  // 🔥 FIX DEFINITIVO
  // desativa labels APENAS na linha da meta
  datalabels: {
    display: false,
  },
},

    ],
  },

  options: {
    responsive: true,
    maintainAspectRatio: false,

    plugins: {
  legend: {
    display: true,
    labels: { boxWidth: 18 },
  },

  title: {
    display: true,
    text: `ORGs aprovadas — últimas 4 semanas (Total: ${sumLast4})`,
  },

  // 🔥 NUMERAÇÃO APENAS NAS BARRAS (remove os "40" da meta)
  datalabels: {
    display: (ctx) => {
      // só mostra label no dataset de BARRA
      return ctx.dataset.type === "bar";
    },

    anchor: "end",
    align: "end",
    offset: 4,
    clamp: true,

    color: "#ffffff",
    font: {
      weight: "bold",
      size: 14,
    },

    formatter: (value) => {
      return value > 0 ? value : "";
    },
  },
},


    scales: {
      x: {
        grid: { display: false },
      },

      y: {
        beginAtZero: true,
        min: 0,
        suggestedMax: yMax,
        ticks: {
          stepSize: 5,
          precision: 0,
        },
        grid: {
          color: "rgba(255,255,255,0.08)",
        },
      },
    },
  },
};
};




  






// Cria URL curta no QuickChart (COMPATÍVEL COM EMBED DO DISCORD)
async function getQuickChartLinks(chartConfig) {
  try {
    const res = await fetch("https://quickchart.io/chart/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // 🔥 FIX CRÍTICO
        // Força Chart.js v3 (estável, sem bug de options)
        version: "3",

        backgroundColor: "transparent",
        width: 1200,
        height: 420,
        format: "png",

        // gráfico completo
        chart: chartConfig,
      }),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${txt}`.slice(0, 300));
    }

    const data = await res.json().catch(() => null);

    const shortUrl =
      data?.url || data?.shortUrl || data?.short_url || null;

    if (!shortUrl) {
      throw new Error("QuickChart não retornou URL válida");
    }

    // ✅ mesma URL serve pra:
    // - embed (imagem)
    // - botão
    const imageUrl = shortUrl;

    return {
      shortUrl,
      imageUrl,
      id: data?.id || null,
    };

  } catch (e) {
    return { error: String(e?.message || e) };
  }
}




// ===============================
// DASHBOARD STATE
// ===============================
function loadState() {
  return readJSON(ORG_DASH_STATE_PATH, {
    messageId: null,
    lastHash: null,
  });
}

function saveState(state) {
  writeJSON(ORG_DASH_STATE_PATH, state);
}

// ===============================
// DATA FROM WEEKLY STATS
// ===============================
function loadWeeklyStats() {
  return readJSON(WEEKLY_STATS_PATH, { weeks: {} });
}

function getWeekData(stats, weekKey) {
  const w = stats?.weeks?.[weekKey] || {};
  const approvedForManager = w.approvedForManager || {};
  const total = sumBucket(approvedForManager);
  return { approvedForManager, total, raw: w };
}

function getLastNWeekKeys(stats, n) {
  const keys = Object.keys(stats?.weeks || {});
  keys.sort(); // ISO date keys
  return keys.slice(-n);
}

// ===============================
// LOGS
// ===============================
async function sendLog(client, title, lines) {
  try {
    const ch = await client.channels.fetch(ORG_DASH_LOG_CHANNEL_ID).catch(() => null);
    if (!ch || !ch.isTextBased()) return;

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(lines.join("\n"))
      .setColor(0x5865f2)
      .setTimestamp(new Date());

    await ch.send({ embeds: [embed] }).catch(() => null);
  } catch {}
}

// ===============================
// RENDER / ENSURE MESSAGE
// ===============================
async function ensureDashMessage(channel, state) {
  if (state.messageId) {
    const msg = await channel.messages.fetch(state.messageId).catch(() => null);
    if (msg) return msg;
  }

  const recent = await channel.messages.fetch({ limit: 20 }).catch(() => null);
  if (recent) {
    const found = recent.find(
      (m) =>
        m.author?.id === channel.client.user.id &&
        m.embeds?.[0]?.footer?.text?.includes("GRAFICO_MANAGERS")
    );
    if (found) {
      state.messageId = found.id;
      saveState(state);
      return found;
    }
  }

  const created = await channel.send({ content: "" }).catch(() => null);
if (!created) return null;

state.messageId = created.id;
saveState(state);
return created;
}

// ✅ agora retorna 3 embeds (texto + gif + gráfico)
function buildEmbedsAndComponents({
  weekLabel,
  weekKey,
  currentTotal,
  prevTotal,
  chartShortUrl,
  chartImageUrl,
  top3Current,
  top1Prev,
  gifUrl,
  guildIconUrl,
  sumLast4,
}) {

  const status = getPerformanceStatus(currentTotal);
  const { pct, sign } = pctDiff(currentTotal, prevTotal);

  const top3Text =
    top3Current.length > 0
      ? top3Current
        .map((x, i) =>
  `**${i + 1}.** <@${x.id}> — **${x.v}**${x.v === 0 ? " _(sem registros)_" : ""}`
)

          .join("\n")
      : "—";

  const top1PrevText = top1Prev ? `<@${top1Prev.id}> — **${top1Prev.v}**` : "—";

  const progress = `${currentTotal}/${WEEKLY_GOAL} (${progressText(currentTotal)})`;

  // ========== EMBED 1 (texto) ==========
  const embedMain = new EmbedBuilder()
    .setAuthor({ name: "Dashboard ORGs — Managers", iconURL: guildIconUrl })
    .setTitle(`Semana: ${weekLabel}`)
    .setDescription(
      [
        `**ID da semana:** \`${weekKey}\``,
        `**Status:** ${status.emoji} **${status.label}**`,
        `**Meta:** **${WEEKLY_GOAL}** | **Progresso:** **${progress}**`,
        "",
        `**Total atual:** **${currentTotal}**`,
        `**Semana passada:** **${prevTotal}**`,
        `**Diferença:** **${sign}${pct.toFixed(1)}%**`,
        `**Total (últimas 4 semanas):** **${sumLast4}**`,
      ].join("\n")
    )
    .addFields(
  { name: "🏆 Top 3 — Semana atual", value: top3Text, inline: false },
  { name: "👑 Top 1 — Semana passada", value: top1PrevText, inline: false },
  { name: "📊 Gráfico", value: "Clique no botão **Abrir gráfico** abaixo.", inline: false }
)
    .setColor(status.color)
    .setFooter({ text: "GRAFICO_MANAGERS • mensagem única • botão Atualizar" })
    .setTimestamp(new Date());

  // ========== EMBED 2 (GIF grande) ==========
  const embedGif = new EmbedBuilder()
    .setImage(gifUrl)
    .setColor(status.color);

  // ========== EMBED 3 (gráfico grande) ==========
  const embedChart = new EmbedBuilder()
  .setColor(status.color);

if (chartImageUrl) {
  embedChart.setImage(chartImageUrl);
} else {
  embedChart.setDescription("⚠️ Gráfico indisponível no momento.");
}



  const row1 = new ActionRowBuilder().addComponents(
  new ButtonBuilder()
    .setCustomId(BTN_REFRESH_ID)
    .setLabel("Atualizar")
    .setStyle(ButtonStyle.Primary),

  new ButtonBuilder()
    .setCustomId(BTN_ADD_POINTS_ID)
    .setLabel("➕ Adicionar pontos")
    .setStyle(ButtonStyle.Success),

  new ButtonBuilder()
    .setCustomId(BTN_ADJUST_ID)
    .setLabel("🗑️ Remover pontos")
    .setStyle(ButtonStyle.Danger)
);


let row2 = null;

if (chartShortUrl && String(chartShortUrl).length <= 512) {
  row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel("Abrir gráfico")
      .setStyle(ButtonStyle.Link)
      .setURL(chartShortUrl)
  );
}


const finalEmbeds = [embedMain, embedGif];

// ✅ SEMPRE adiciona o embed do gráfico
finalEmbeds.push(
  chartImageUrl
    ? embedChart
    : new EmbedBuilder()
        .setColor(status.color)
        .setTitle("📊 Gráfico")
        .setDescription(
          "⚠️ O gráfico não pôde ser carregado agora.\n" +
          "Clique em **Atualizar** ou use o botão **Abrir gráfico**."
        )
);

// ✅ DEFINE OS COMPONENTES AQUI (ERA ISSO QUE FALTAVA)
const finalComponents = row2 ? [row1, row2] : [row1];

// ✅ RETORNO CORRETO
return { embeds: finalEmbeds, components: finalComponents };





}


function buildAdjustModal() {
  return new ModalBuilder()
    .setCustomId("GM_ADJUST_MODAL")
    .setTitle("Ajustar pontos (Managers)")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("GM_MANAGER_ID")
          .setLabel("ID do Manager (Discord ID)")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("Ex: 123456789012345678")
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("GM_REMOVE_POINTS")
          .setLabel("Quantos pontos REMOVER?")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("Ex: 1")
          .setRequired(true)
      )
    );
}

function buildAddPointsModal() {
  return new ModalBuilder()
    .setCustomId("GM_ADD_POINTS_MODAL")
    .setTitle("Adicionar pontos (Managers)")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("GM_MANAGER_ID")
          .setLabel("ID do Manager (Discord ID)")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("Ex: 123456789012345678")
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("GM_ADD_POINTS_QTY")
          .setLabel("Quantos pontos ADICIONAR?")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("Ex: 1")
          .setRequired(true)
      )
    );
}

// ===============================
// ADMIN: AJUSTE DE PONTOS (EDICA reg_manager_weekly_stats.json)
// - Isso afeta:
//   ✅ pontuação do manager
//   ✅ total geral da semana (pq é soma do bucket)
// ===============================
function removePointsFromWeeklyStats({ weekKey, managerId, removePoints }) {
  const stats = loadWeeklyStats();

  // garante estrutura
  if (!stats.weeks || typeof stats.weeks !== "object") stats.weeks = {};
  if (!stats.weeks[weekKey] || typeof stats.weeks[weekKey] !== "object") stats.weeks[weekKey] = {};
  if (!stats.weeks[weekKey].approvedForManager || typeof stats.weeks[weekKey].approvedForManager !== "object") {
    stats.weeks[weekKey].approvedForManager = {};
  }

  const bucket = stats.weeks[weekKey].approvedForManager;

  const cur = safeNum(bucket[managerId] || 0);
  const rm = safeNum(removePoints);

  const next = Math.max(0, cur - rm);

  bucket[managerId] = next;

  // salva no arquivo oficial do RM
  writeJSON(WEEKLY_STATS_PATH, stats);

  return { before: cur, after: next, removed: Math.min(cur, rm) };
}

function addPointsToWeeklyStats({ weekKey, managerId, addPoints }) {
  const stats = loadWeeklyStats();

  // garante estrutura
  if (!stats.weeks || typeof stats.weeks !== "object") stats.weeks = {};
  if (!stats.weeks[weekKey] || typeof stats.weeks[weekKey] !== "object") stats.weeks[weekKey] = {};
  if (!stats.weeks[weekKey].approvedForManager || typeof stats.weeks[weekKey].approvedForManager !== "object") {
    stats.weeks[weekKey].approvedForManager = {};
  }

  const bucket = stats.weeks[weekKey].approvedForManager;

  const cur = safeNum(bucket[managerId] || 0);
  const add = safeNum(addPoints);

  const next = cur + add;

  bucket[managerId] = next;

  // salva no arquivo oficial do RM
  writeJSON(WEEKLY_STATS_PATH, stats);

  return { before: cur, after: next, added: add };
}

// ===============================
// CORE UPDATE
// ===============================
async function updateDashboard(client, causeUserId = null, reason = "update") {
  const state = loadState();

  const dashChannel = await client.channels.fetch(ORG_DASH_CHANNEL_ID).catch(() => null);
  if (!dashChannel || !dashChannel.isTextBased()) return;

  const stats = loadWeeklyStats();

  const { sunday, saturday, weekKey } = getCurrentWeekSP();
  const prevWeekKey = getPrevWeekKey();

  const cur = getWeekData(stats, weekKey);
  const prev = getWeekData(stats, prevWeekKey);

  const top3Current = topN(cur.approvedForManager, 3);
  const top1Prev = topN(prev.approvedForManager, 1)[0] || null;

  // Chart: últimas 4 semanas (por total)
// ✅ normaliza weekKey pra SEMPRE cair no DOMINGO da semana (SP) e agrega totals
function normalizeWeekKeyToSundayISO(isoKey) {
  // isoKey: "YYYY-MM-DD"
  const y = Number(isoKey.slice(0, 4));
  const m = Number(isoKey.slice(5, 7));
  const d = Number(isoKey.slice(8, 10));
  const dt = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));

  // 0=Dom, 6=Sáb
  const dow = dt.getUTCDay();
  const sunday = new Date(dt.getTime());
  sunday.setUTCDate(sunday.getUTCDate() - dow);

  return sunday.toISOString().slice(0, 10);
}

// 1) agrega todas as semanas do arquivo por "domingo normalizado"
const agg = {}; // { sundayKey: total }
const rawKeys = Object.keys(stats?.weeks || {});
rawKeys.sort(); // ordem ISO

for (const rawKey of rawKeys) {
  const sundayKey = normalizeWeekKeyToSundayISO(rawKey);
  const d = getWeekData(stats, rawKey);
  agg[sundayKey] = (agg[sundayKey] || 0) + safeNum(d.total);
}

// 2) pega as últimas N semanas agregadas
const aggKeys = Object.keys(agg);
aggKeys.sort();

const lastKeys = aggKeys.slice(-CHART_WEEKS);

// 3) monta labels e totals
const labels = [];
const totals = [];

for (const wk of lastKeys) {
  // label vai ser o DOMINGO (dd/mm) da semana
  const mm = wk.slice(5, 7);
  const dd = wk.slice(8, 10);
  labels.push(`${dd}/${mm}`);

  totals.push(safeNum(agg[wk]));
}


  const sumLast4 = totals.reduce((a, b) => a + safeNum(b), 0);

  const chartConfig = buildChartConfig(labels, totals);

let chartShortUrl = null; // botão
let chartImageUrl = null; // embed (imagem visível)

const links = await getQuickChartLinks(chartConfig);

if (links && !links.error) {
  chartShortUrl = links.shortUrl || null;
  chartImageUrl = links.imageUrl || null;

  // fallback: se por algum motivo não veio imageUrl, usa o short (mas pode não renderizar)
  if (!chartImageUrl) chartImageUrl = chartShortUrl;
} else {
  await sendLog(client, "❌ QuickChart links falhou", [
    `**Motivo:** \`${links?.error || "desconhecido"}\``,
    `**Dica:** sem isso, o botão até pode existir, mas o embed do gráfico não vai renderizar.`,
  ]);
}


  const weekLabel = weekRangeLabelBR({ sunday, saturday });

  // ✅ ícone do servidor (ou fallback)
  const guildIconUrl =
    dashChannel.guild?.iconURL?.({ dynamic: true, size: 256 }) || DASH_ICON_FALLBACK;

  const { embeds, components } = buildEmbedsAndComponents({
  weekLabel,
  weekKey,
  currentTotal: cur.total,
  prevTotal: prev.total,
  top3Current,
  top1Prev,
  chartShortUrl,
  chartImageUrl,
  gifUrl: DASH_GIF_BIG,
  guildIconUrl,
  sumLast4,
});


  // hash do conteúdo principal pra não editar atoa
  const payloadHash = sha1(
    JSON.stringify({
      weekKey,
      curTotal: cur.total,
      prevTotal: prev.total,
      top3Current,
      top1Prev,
      labels,
      totals,
      sumLast4,
      guildIconUrl,
    })
  );

  const dashMsg = await ensureDashMessage(dashChannel, state);

// ✅ FIX: se alguém clicou no "X" e suprimiu os embeds, dessuprime
if (dashMsg && dashMsg.flags?.has?.(MessageFlagsBitField.Flags.SuppressEmbeds)) {
  await sendLog(client, "🧯 Unsuppress embeds", [
    `**Motivo:** mensagem estava com embeds suprimidos (clicaram no X).`,
    `**Ação:** dashMsg.suppressEmbeds(false)`,
  ]);

  try {
    await dashMsg.suppressEmbeds(false);
  } catch (e) {
    await sendLog(client, "❌ Falha ao dessuprimir embeds", [
      `**Erro:** \`${String(e?.message || e)}\``,
      `**Ação:** vou recriar o painel (FORCE).`,
    ]);

    // se não conseguir dessuprimir, força recriar a msg
    await updateDashboard(client, causeUserId, "force").catch(() => null);
    return;
  }

  // depois de dessuprimir, força editar mesmo se hash bater
  state.lastHash = null;
  saveState(state);
}

// ✅ RECOVERY: se a mensagem existe mas tá “vazia” (sem embeds), força re-render
if (dashMsg && (!dashMsg.embeds || dashMsg.embeds.length === 0) && reason !== "force") {
  await sendLog(client, "🛠️ Recovery", [
    `**Motivo:** mensagem estava sem embeds (vazia)`,
    `**Ação:** vou recriar o painel (FORCE).`,
  ]);

  await updateDashboard(client, causeUserId, "force").catch(() => null);
  return;
}


// se não conseguiu criar/achar mensagem, loga e sai
if (!dashMsg && reason !== "force") {
  await sendLog(client, "❌ Dashboard", [
    "**Motivo:** não consegui obter/criar a mensagem do dashboard.",
    `**Canal:** \`${ORG_DASH_CHANNEL_ID}\``,
  ]);
  return;
}


  // Se não mudou, não edita
  if (state.lastHash === payloadHash && reason !== "force") {
    if (reason === "button") {
      await sendLog(client, "🔁 Atualizar (sem mudanças)", [
        `**Causador:** ${causeUserId ? `<@${causeUserId}>` : "—"}`,
        `**Semana:** \`${weekKey}\``,
        `**Resultado:** Nada mudou (evitei editar).`,
        `**Hora (SP):** ${nowInSP().toISOString().replace("T", " ").slice(0, 19)} UTC`,
      ]);
    }
    return;
  }

  // antes (pra log)
  let before = null;
  try {
    const beforeState = readJSON(ORG_DASH_STATE_PATH, {});
    before = beforeState?.__lastSnapshot || null;
  } catch {}


  if (reason === "force") {
  // 1) tenta apagar a msg antiga (se existir)
  if (dashMsg) {
    try { await dashMsg.delete().catch(() => {}); } catch {}
  }

  // 2) zera state
  state.messageId = null;
  state.lastHash = null;
  state.__lastSnapshot = null;
  saveState(state);

  // 3) cria a nova mensagem JÁ FINAL (sem edit depois)
  const newMsg = await dashChannel
    .send({ content: "", embeds, components })
    .catch((e) => {
      // tenta logar o erro
      sendLog(client, "❌ FORCE falhou ao enviar", [
        `**Erro:** \`${String(e?.message || e)}\``,
        `**Canal:** \`${ORG_DASH_CHANNEL_ID}\``,
      ]).catch(() => null);
      return null;
    });

  if (!newMsg) return;

  // 4) salva id e snapshot
  state.messageId = newMsg.id;
  state.lastHash = payloadHash;
  state.__lastSnapshot = {
    weekKey,
    curTotal: cur.total,
    prevTotal: prev.total,
    top3Current,
    top1Prev,
    sumLast4,
  };
  saveState(state);

  // 5) log sucesso
  await sendLog(client, "✅ FORCE OK", [
    `**Semana:** \`${weekKey}\``,
    `**Mensagem nova:** \`${state.messageId}\``,
    `**Embeds:** \`${embeds.length}\``,
  ]);

  return;
}




  // edita msg
  await dashMsg
    .edit({
      content: "",
      embeds,
      components,
    })
    .catch(() => null);

  // salva state
  state.lastHash = payloadHash;
  state.__lastSnapshot = {
    weekKey,
    curTotal: cur.total,
    prevTotal: prev.total,
    top3Current,
    top1Prev,
    sumLast4,
  };
  saveState(state);

  // log detalhado
  const after = state.__lastSnapshot;

  const beforeTotal = before?.curTotal ?? null;
  const afterTotal = after?.curTotal ?? null;

  const beforeTop3 =
    (before?.top3Current || []).map((x, i) => `${i + 1}. ${x.id}:${x.v}`).join(", ") || "—";
  const afterTop3 =
    (after?.top3Current || []).map((x, i) => `${i + 1}. ${x.id}:${x.v}`).join(", ") || "—";

  await sendLog(client, "📈 Dashboard atualizado", [
    `**Causador:** ${causeUserId ? `<@${causeUserId}>` : "—"}`,
    `**Motivo:** \`${reason}\``,
    `**Semana:** \`${weekKey}\``,
    `**Total:** ${beforeTotal === null ? "—" : beforeTotal} → **${afterTotal}**`,
    `**Top 3:** ${beforeTop3} → **${afterTop3}**`,
    `**Total últimas 4:** **${after?.sumLast4 ?? "—"}**`,
    `**Hora (SP):** ${nowInSP().toISOString().replace("T", " ").slice(0, 19)} UTC`,
  ]);
}

// ===============================
// PUBLIC HOOKS (PLUGA NO INDEX)
// ===============================
export async function graficoManagersOnReady(client) {
  // console.log("[GRAFICO_MANAGERS] onReady chamado ✅", {
  //   ch: ORG_DASH_CHANNEL_ID,
  //   log: ORG_DASH_LOG_CHANNEL_ID,
  // });

  // ✅ no restart: NÃO apaga, só tenta achar a msg e editar
  await updateDashboard(client, null, "ready");

  // console.log("[GRAFICO_MANAGERS] updateDashboard(ready) disparado ✅");

  if (!globalThis.__GM_TICK__) {
    globalThis.__GM_TICK__ = setInterval(() => {
      updateDashboard(client, null, "tick").catch(() => null);
    }, 10 * 60 * 1000);
  }
}



export async function graficoManagersHandleInteraction(interaction, client) {
  try {
    // =========================
    // BOTÕES
    // =========================
    if (interaction?.isButton?.()) {
      // Atualizar normal
      if (interaction.customId === BTN_REFRESH_ID) {
  await interaction.deferReply({ ephemeral: true });

  // 🔥 força recriar gráfico e embeds
  await updateDashboard(client, interaction.user?.id || null, "force");

  await interaction.editReply("🔄 Dashboard e gráfico atualizados!");
  return true;
}


      // ✅ NOVO: Ajustar pontos
      if (interaction.customId === BTN_ADJUST_ID) {
  if (!canAdjust(interaction.user?.id)) {
    await interaction.reply({
      content: "⛔ Você não tem permissão pra ajustar pontos.",
      ephemeral: true,
    }).catch(() => null);
    return true;
  }

  await interaction.showModal(buildAdjustModal()).catch(() => null);
  return true;
}


      // ✅ NOVO: Adicionar pontos
      if (interaction.customId === BTN_ADD_POINTS_ID) {
        if (!canAdjust(interaction.user?.id)) {
          await interaction.reply({
            content: "⛔ Você não tem permissão pra adicionar pontos.",
            ephemeral: true,
          }).catch(() => null);
          return true;
        }

        await interaction.showModal(buildAddPointsModal()).catch(() => null);
        return true;
      }

      return false;
    }

    // =========================
    // MODAL SUBMIT
    // =========================
    if (interaction?.isModalSubmit?.() && interaction.customId === "GM_ADJUST_MODAL") {
  if (!canAdjust(interaction.user?.id)) {
    await interaction.reply({
      content: "⛔ Você não tem permissão pra ajustar pontos.",
      ephemeral: true,
    }).catch(() => null);
    return true;
  }

  await interaction.deferReply({ ephemeral: true }).catch(() => null);


      const managerId = String(interaction.fields.getTextInputValue("GM_MANAGER_ID") || "").trim();
      const removePointsRaw = String(interaction.fields.getTextInputValue("GM_REMOVE_POINTS") || "").trim();
      const removePoints = Number(removePointsRaw);

      if (!managerId || !/^\d{10,20}$/.test(managerId)) {
        await interaction.editReply("⚠️ ID do manager inválido.").catch(() => null);
        return true;
      }
      if (!Number.isFinite(removePoints) || removePoints <= 0) {
        await interaction.editReply("⚠️ Informe um número válido de pontos pra remover.").catch(() => null);
        return true;
      }

      const { weekKey } = getCurrentWeekSP();

      const res = removePointsFromWeeklyStats({
        weekKey,
        managerId,
        removePoints,
      });

      // Atualiza dashboard na hora
      await updateDashboard(client, interaction.user?.id || null, "adjust_points");

      await interaction
        .editReply(
          `🗑️ Ajustei pontos na semana \`${weekKey}\`.\n` +
            `Manager: <@${managerId}>\n` +
            `Antes: **${res.before}** → Depois: **${res.after}** (removido: **${res.removed}**)`

        )
        .catch(() => null);

      await sendLog(client, "🗑️ Ajuste manual de pontos", [
        `**Semana:** \`${weekKey}\``,
        `**Manager:** <@${managerId}> (\`${managerId}\`)`,
        `**Removido:** ${res.removed}`,
        `**Antes:** ${res.before}`,
        `**Depois:** ${res.after}`,
        `**Por:** <@${interaction.user.id}> (\`${interaction.user.id}\`)`,
      ]);

      return true;
    }

    // =========================
    // MODAL SUBMIT (ADICIONAR)
    // =========================
    if (interaction?.isModalSubmit?.() && interaction.customId === "GM_ADD_POINTS_MODAL") {
      if (!canAdjust(interaction.user?.id)) {
        await interaction.reply({
          content: "⛔ Você não tem permissão pra adicionar pontos.",
          ephemeral: true,
        }).catch(() => null);
        return true;
      }

      await interaction.deferReply({ ephemeral: true }).catch(() => null);

      const managerId = String(interaction.fields.getTextInputValue("GM_MANAGER_ID") || "").trim();
      const addPointsRaw = String(interaction.fields.getTextInputValue("GM_ADD_POINTS_QTY") || "").trim();
      const addPoints = Number(addPointsRaw);

      if (!managerId || !/^\d{10,20}$/.test(managerId)) {
        await interaction.editReply("⚠️ ID do manager inválido.").catch(() => null);
        return true;
      }
      if (!Number.isFinite(addPoints) || addPoints <= 0) {
        await interaction.editReply("⚠️ Informe um número válido de pontos pra adicionar.").catch(() => null);
        return true;
      }

      const { weekKey } = getCurrentWeekSP();

      const res = addPointsToWeeklyStats({
        weekKey,
        managerId,
        addPoints,
      });

      // Atualiza dashboard na hora
      await updateDashboard(client, interaction.user?.id || null, "adjust_points_add");

      await interaction.editReply(
        `➕ Adicionei pontos na semana \`${weekKey}\`.\n` +
        `Manager: <@${managerId}>\n` +
        `Antes: **${res.before}** → Depois: **${res.after}** (adicionado: **${res.added}**)`
      ).catch(() => null);

      await sendLog(client, "➕ Ajuste manual de pontos (Adição)", [
        `**Semana:** \`${weekKey}\``,
        `**Manager:** <@${managerId}> (\`${managerId}\`)`,
        `**Adicionado:** ${res.added}`,
        `**Antes:** ${res.before}`,
        `**Depois:** ${res.after}`,
        `**Por:** <@${interaction.user.id}> (\`${interaction.user.id}\`)`,
      ]);

      return true;
    }

    return false;
  } catch (e) {
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: "⚠️ Deu ruim ao ajustar. Tenta de novo.", ephemeral: true }).catch(() => {});
      }
    } catch {}
    return true;
  }
}


// Se você quiser chamar quando RM aprovar/reprovar (opcional):
export async function graficoManagersEmitUpdate(client, causeUserId = null, reason = "emit") {
  await updateDashboard(client, causeUserId, reason);
}
