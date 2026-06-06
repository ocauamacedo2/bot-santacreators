// /application/events/GraficoPresencaEventos.js
// DASHBOARD PRESENÇA EVENTOS — SantaCreators
// ✅ Lê os logs do canal 1486006866046615682
// ✅ Mostra dashboard fixo no canal 1512696818914430976
// ✅ Top 3 do mês atual: quem mais confirma / quem mais diz que não vai
// ✅ Top 1 do mês passado
// ✅ Gráfico mensal com verde/vermelho por dia
// ✅ Botão manual "Forçar atualização"
// ✅ Permissão igual ao dashboard de managers

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";

// ===============================
// CONFIG
// ===============================

const PRESENCA_LOG_CHANNEL_ID = "1486006866046615682";
const PRESENCA_DASH_CHANNEL_ID = "1512696818914430976";

const PRESENCA_DASH_STATE_PATH = "./grafico_presenca_eventos_state.json";

const DASH_ICON =
  "https://media.discordapp.net/attachments/1362477839944777889/1368084293905285170/sc2.png?format=webp&quality=lossless&width=953&height=953";

const DASH_GIF =
  "https://media.discordapp.net/attachments/1362477839944777889/1384245215249825832/standard_2rss.gif?width=900&height=120";

const BTN_REFRESH_ID = "PRESENCA_EVENTOS_REFRESH";

// Mesmas permissões do dashboard de managers
const PRESENCA_ALLOWED_USERS = [
  "660311795327828008",
];

const PRESENCA_ALLOWED_ROLE_IDS = [
  "1262262852949905409", // RESP INFLU
  "1352408327983861844", // RESP CREATORS
  "1262262852949905408", // OWNER
];

// ===============================
// GUARD
// ===============================

if (globalThis.__PRESENCA_EVENTOS_DASH_RUNNING__ == null) {
  globalThis.__PRESENCA_EVENTOS_DASH_RUNNING__ = false;
}

// ===============================
// HELPERS
// ===============================

function canManageDashboard(interaction) {
  const userId = String(interaction?.user?.id || "");
  if (PRESENCA_ALLOWED_USERS.includes(userId)) return true;

  const memberRoleIds = interaction?.member?.roles?.cache
    ? [...interaction.member.roles.cache.keys()].map(String)
    : [];

  return PRESENCA_ALLOWED_ROLE_IDS.some((roleId) =>
    memberRoleIds.includes(String(roleId))
  );
}

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

function nowInSP() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const get = (t) => Number(parts.find((p) => p.type === t)?.value || 0);

  return new Date(Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second")
  ));
}

function getMonthKeySP(date = nowInSP()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function getPreviousMonthKeySP() {
  const d = nowInSP();
  d.setUTCMonth(d.getUTCMonth() - 1);
  return getMonthKeySP(d);
}

function getMonthLabelBR(monthKey) {
  const [year, month] = String(monthKey).split("-");
  return `${month}/${year}`;
}

function getMessageMonthKeySP(message) {
  const d = new Date(message.createdTimestamp || Date.now());

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(d);

  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;

  if (!year || !month) return null;
  return `${year}-${month}`;
}

function getMessageDayKeySP(message) {
  const d = new Date(message.createdTimestamp || Date.now());

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);

  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;

  if (!year || !month || !day) return null;
  return `${year}-${month}-${day}`;
}

function getWeekKeyFromDayKey(dayKey) {
  const [year, month, day] = String(dayKey).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));

  const firstDay = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const weekNumber = Math.ceil((date.getUTCDate() + firstDay.getUTCDay()) / 7);

  return `${year}-${String(month).padStart(2, "0")}-S${weekNumber}`;
}

function formatWeekBR(weekKey) {
  const [year, month, week] = String(weekKey).split("-");
  return `${week.replace("S", "Semana ")} • ${month}/${year}`;
}

function percentText(part, total) {
  const p = safeNum(part);
  const t = safeNum(total);

  if (t <= 0) return "0.0%";

  return `${((p / t) * 100).toFixed(1)}%`;
}

function loadState() {
  return readJSON(PRESENCA_DASH_STATE_PATH, {
    messageId: null,
    lastHash: null,
    lastUpdatedAt: null,
  });
}

function saveState(state) {
  writeJSON(PRESENCA_DASH_STATE_PATH, state);
}

function extractFieldValue(embed, fieldNameIncludes) {
  const fields = Array.isArray(embed?.fields) ? embed.fields : [];
  const found = fields.find((f) =>
    String(f?.name || "").toLowerCase().includes(String(fieldNameIncludes).toLowerCase())
  );

  return found?.value || "";
}

function extractUserId(raw) {
  const text = String(raw || "");

  const mention = text.match(/<@!?(\d{15,25})>/);
  if (mention) return mention[1];

  const between = text.match(/\((\d{15,25})\)/);
  if (between) return between[1];

  const any = text.match(/\b\d{15,25}\b/);
  if (any) return any[0];

  return null;
}

function cleanOrgName(raw) {
  return String(raw || "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .trim();
}

function emptyMonthStats(monthKey) {
  return {
    monthKey,
    yesTotal: 0,
    noTotal: 0,
    total: 0,

    byUser: {},
    byDay: {},
    byWeek: {},
    orgs: {},

    firstLogAt: null,
    lastLogAt: null,
  };
}
function addPoint(stats, { userId, status, orgName, dayKey, createdTimestamp = null }) {
  if (!userId || !status || !dayKey) return;

  const weekKey = getWeekKeyFromDayKey(dayKey);
  const orgKey = orgName || "ORG não identificada";

  if (!stats.byUser[userId]) {
    stats.byUser[userId] = {
      yes: 0,
      no: 0,
      total: 0,
      orgs: {},
      days: {},
      weeks: {},
    };
  }

  if (!stats.byDay[dayKey]) {
    stats.byDay[dayKey] = {
      yes: 0,
      no: 0,
      total: 0,
    };
  }

  if (!stats.byWeek[weekKey]) {
    stats.byWeek[weekKey] = {
      yes: 0,
      no: 0,
      total: 0,
    };
  }

  if (!stats.orgs[orgKey]) {
    stats.orgs[orgKey] = {
      yes: 0,
      no: 0,
      total: 0,
    };
  }

  if (!stats.byUser[userId].orgs[orgKey]) {
    stats.byUser[userId].orgs[orgKey] = {
      yes: 0,
      no: 0,
      total: 0,
    };
  }

  if (!stats.byUser[userId].days[dayKey]) {
    stats.byUser[userId].days[dayKey] = {
      yes: 0,
      no: 0,
      total: 0,
    };
  }

  if (!stats.byUser[userId].weeks[weekKey]) {
    stats.byUser[userId].weeks[weekKey] = {
      yes: 0,
      no: 0,
      total: 0,
    };
  }

  if (status === "YES") {
    stats.yesTotal++;
    stats.byUser[userId].yes++;
    stats.byDay[dayKey].yes++;
    stats.byWeek[weekKey].yes++;
    stats.orgs[orgKey].yes++;
    stats.byUser[userId].orgs[orgKey].yes++;
    stats.byUser[userId].days[dayKey].yes++;
    stats.byUser[userId].weeks[weekKey].yes++;
  }

  if (status === "NO") {
    stats.noTotal++;
    stats.byUser[userId].no++;
    stats.byDay[dayKey].no++;
    stats.byWeek[weekKey].no++;
    stats.orgs[orgKey].no++;
    stats.byUser[userId].orgs[orgKey].no++;
    stats.byUser[userId].days[dayKey].no++;
    stats.byUser[userId].weeks[weekKey].no++;
  }

  stats.total++;
  stats.byUser[userId].total++;
  stats.byDay[dayKey].total++;
  stats.byWeek[weekKey].total++;
  stats.orgs[orgKey].total++;
  stats.byUser[userId].orgs[orgKey].total++;
  stats.byUser[userId].days[dayKey].total++;
  stats.byUser[userId].weeks[weekKey].total++;

  if (createdTimestamp) {
    if (!stats.firstLogAt || createdTimestamp < stats.firstLogAt) {
      stats.firstLogAt = createdTimestamp;
    }

    if (!stats.lastLogAt || createdTimestamp > stats.lastLogAt) {
      stats.lastLogAt = createdTimestamp;
    }
  }
}

function parsePresenceLogMessage(message) {
  const embeds = Array.isArray(message.embeds) ? message.embeds : [];
  if (!embeds.length) return null;

  const embed = embeds[0];
  const title = String(embed?.title || "");

  const isConfirm = title.includes("Log de Presença: CONFIRMOU");
  const isDeny = title.includes("Log de Presença: NEGOU");

  if (!isConfirm && !isDeny) return null;

  const autorRaw = extractFieldValue(embed, "Autor");
  const orgRaw = extractFieldValue(embed, "Organização");

  const userId = extractUserId(autorRaw);
  const orgName = cleanOrgName(orgRaw);

  if (!userId) return null;

  return {
    userId,
    orgName,
    status: isConfirm ? "YES" : "NO",
  };
}

async function collectMonthStatsFromLogs(client, monthKeys) {
  const wanted = new Set(monthKeys.map(String));
  const result = {};

  for (const key of wanted) {
    result[key] = emptyMonthStats(key);
  }

  const logChannel = await client.channels.fetch(PRESENCA_LOG_CHANNEL_ID).catch(() => null);
  if (!logChannel?.isTextBased?.()) {
    return result;
  }

  let before = undefined;
  let safetyPages = 0;
  let oldMonthHits = 0;

  while (safetyPages < 80) {
    safetyPages++;

    const messages = await logChannel.messages.fetch({
      limit: 100,
      before,
    }).catch(() => null);

    if (!messages || messages.size <= 0) break;

    const ordered = [...messages.values()];

    for (const msg of ordered) {
      const monthKey = getMessageMonthKeySP(msg);
      if (!monthKey) continue;

      if (!wanted.has(monthKey)) {
        if (monthKey < Math.min(...wanted)) oldMonthHits++;
        continue;
      }

      const parsed = parsePresenceLogMessage(msg);
      if (!parsed) continue;

      const dayKey = getMessageDayKeySP(msg);
      if (!dayKey) continue;

addPoint(result[monthKey], {
  userId: parsed.userId,
  status: parsed.status,
  orgName: parsed.orgName,
  dayKey,
  createdTimestamp: msg.createdTimestamp || null,
});
    }

    before = messages.last()?.id;
    if (!before) break;

    if (oldMonthHits >= 200) break;
  }

  return result;
}

function getTopUsers(stats, type = "YES", limit = 3) {
  return Object.entries(stats?.byUser || {})
    .map(([userId, data]) => ({
      userId,
      yes: safeNum(data.yes),
      no: safeNum(data.no),
      total: safeNum(data.total),
    }))
    .filter((x) => type === "YES" ? x.yes > 0 : x.no > 0)
    .sort((a, b) => {
      const av = type === "YES" ? a.yes : a.no;
      const bv = type === "YES" ? b.yes : b.no;

      if (bv !== av) return bv - av;
      return b.total - a.total;
    })
    .slice(0, limit);
}

function getTopOverall(stats, limit = 1) {
  return Object.entries(stats?.byUser || {})
    .map(([userId, data]) => ({
      userId,
      yes: safeNum(data.yes),
      no: safeNum(data.no),
      total: safeNum(data.total),
    }))
    .filter((x) => x.total > 0)
    .sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      if (b.yes !== a.yes) return b.yes - a.yes;
      return b.no - a.no;
    })
    .slice(0, limit);
}

function formatTopUsers(stats, type = "YES", limit = 3) {
  const top = getTopUsers(stats, type, limit);

  if (!top.length) {
    return "_Sem dados ainda._";
  }

  return top.map((item, index) => {
    const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : "🥉";
    const amount = type === "YES" ? item.yes : item.no;
    const label = type === "YES" ? "confirmação(ões)" : "ausência(s)";

    return `${medal} <@${item.userId}> — **${amount}** ${label}`;
  }).join("\n");
}

function formatTopLastMonth(stats) {
  const top = getTopOverall(stats, 1);

  if (!top.length) {
    return "_Sem dados do mês passado._";
  }

  const item = top[0];

  return [
    `👑 <@${item.userId}> — **${item.total}** ação(ões) no total`,
    `🟢 Confirmações: **${item.yes}**`,
    `🔴 Não vai: **${item.no}**`,
  ].join("\n");
}

function formatLastDays(stats) {
  const entries = Object.entries(stats?.byDay || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12);

  if (!entries.length) {
    return "_Sem dias registrados ainda._";
  }

  return entries.map(([dayKey, data]) => {
    return `\`${formatDayBR(dayKey)}\` → 🟢 **${safeNum(data.yes)}** | 🔴 **${safeNum(data.no)}** | 📌 **${safeNum(data.total)}**`;
  }).join("\n");
}

function formatWeeklySummary(stats) {
  const entries = Object.entries(stats?.byWeek || {})
    .sort(([a], [b]) => a.localeCompare(b));

  if (!entries.length) {
    return "_Sem semanas registradas ainda._";
  }

  return entries.map(([weekKey, data]) => {
    const total = safeNum(data.total);
    const yes = safeNum(data.yes);
    const no = safeNum(data.no);

    return [
      `**${formatWeekBR(weekKey)}**`,
      `🟢 Confirmou: **${yes}**`,
      `🔴 Não vai: **${no}**`,
      `📌 Total: **${total}**`,
      `📊 Taxa verde: **${percentText(yes, total)}**`,
    ].join(" • ");
  }).join("\n");
}

function formatTopOrgs(stats, type = "NO", limit = 5) {
  const entries = Object.entries(stats?.orgs || {})
    .map(([orgName, data]) => ({
      orgName,
      yes: safeNum(data.yes),
      no: safeNum(data.no),
      total: safeNum(data.total),
    }))
    .filter((item) => type === "YES" ? item.yes > 0 : item.no > 0)
    .sort((a, b) => {
      const av = type === "YES" ? a.yes : a.no;
      const bv = type === "YES" ? b.yes : b.no;

      if (bv !== av) return bv - av;
      return b.total - a.total;
    })
    .slice(0, limit);

  if (!entries.length) {
    return "_Sem ORGs registradas ainda._";
  }

  return entries.map((item, index) => {
    const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : "▫️";
    const value = type === "YES" ? item.yes : item.no;
    const label = type === "YES" ? "confirmou" : "não vai";

    return `${medal} **${item.orgName}** — **${value}** ${label} | 📌 Total: **${item.total}**`;
  }).join("\n");
}

function formatGeneralStatus(stats, previousStats) {
  const currentTotal = safeNum(stats.total);
  const currentYes = safeNum(stats.yesTotal);
  const currentNo = safeNum(stats.noTotal);

  const previousTotal = safeNum(previousStats?.total);
  const previousYes = safeNum(previousStats?.yesTotal);
  const previousNo = safeNum(previousStats?.noTotal);

  const diffTotal = currentTotal - previousTotal;
  const diffYes = currentYes - previousYes;
  const diffNo = currentNo - previousNo;

  const diffEmoji = diffTotal >= 0 ? "🟢" : "🔴";
  const diffSignal = diffTotal >= 0 ? "+" : "";

  return [
    `📌 **Total do mês:** **${currentTotal}** resposta(s)`,
    `🟢 **Confirmadas no mês:** **${currentYes}**`,
    `🔴 **Reprovadas/Não vai no mês:** **${currentNo}**`,
    `📊 **Taxa verde:** **${percentText(currentYes, currentTotal)}**`,
    `📉 **Taxa vermelha:** **${percentText(currentNo, currentTotal)}**`,
    "",
    `📆 **Comparativo com mês passado:** ${diffEmoji} **${diffSignal}${diffTotal}** resposta(s)`,
    `🟢 Diferença verde: **${diffYes >= 0 ? "+" : ""}${diffYes}**`,
    `🔴 Diferença vermelha: **${diffNo >= 0 ? "+" : ""}${diffNo}**`,
  ].join("\n");
}

function buildChartLabelsAndData(stats) {
  const entries = Object.entries(stats?.byDay || {})
    .sort(([a], [b]) => a.localeCompare(b));

  const labels = [];
  const yesData = [];
  const noData = [];

  for (const [dayKey, data] of entries) {
    const [, month, day] = dayKey.split("-");
    labels.push(`${day}/${month}`);
    yesData.push(safeNum(data.yes));
    noData.push(safeNum(data.no));
  }

  if (!labels.length) {
    labels.push("Sem dados");
    yesData.push(0);
    noData.push(0);
  }

  return { labels, yesData, noData };
}

function buildChartConfig(stats) {
  const { labels, yesData, noData } = buildChartLabelsAndData(stats);

  return {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Confirmou que vai",
          data: yesData,
          backgroundColor: "#57f287",
          borderRadius: 8,
          barThickness: 26,
          maxBarThickness: 36,
        },
        {
          label: "Disse que não vai",
          data: noData,
          backgroundColor: "#ed4245",
          borderRadius: 8,
          barThickness: 26,
          maxBarThickness: 36,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          labels: {
            color: "#ffffff",
            font: {
              size: 13,
              weight: "bold",
            },
          },
        },
        title: {
          display: true,
          text: `Presença nos eventos — ${getMonthLabelBR(stats.monthKey)}`,
          color: "#ffffff",
          font: {
            size: 20,
            weight: "bold",
          },
        },
        subtitle: {
          display: true,
          text: "Verde = confirmou • Vermelho = não vai",
          color: "#b9bbbe",
          font: {
            size: 13,
            weight: "bold",
          },
        },
        datalabels: {
          anchor: "end",
          align: "end",
          color: "#ffffff",
          font: {
            weight: "bold",
            size: 13,
          },
          formatter: (value) => {
            return value > 0 ? value : "";
          },
        },
      },
      scales: {
        x: {
          grid: {
            display: false,
          },
          ticks: {
            color: "#ffffff",
            font: {
              size: 12,
              weight: "bold",
            },
          },
        },
        y: {
          beginAtZero: true,
          ticks: {
            precision: 0,
            stepSize: 1,
            color: "#b9bbbe",
            font: {
              size: 12,
              weight: "bold",
            },
          },
          grid: {
            color: "rgba(255,255,255,0.12)",
          },
        },
      },
    },
  };
}

async function getQuickChartLinks(chartConfig) {
  try {
    const res = await fetch("https://quickchart.io/chart/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        version: "3",
        backgroundColor: "transparent",
        width: 1200,
        height: 520,
        format: "png",
        chart: chartConfig,
      }),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${txt}`.slice(0, 300));
    }

    const data = await res.json().catch(() => null);

    const shortUrl = data?.url || data?.shortUrl || data?.short_url || null;

    if (!shortUrl) {
      throw new Error("QuickChart não retornou URL válida");
    }

    return {
      shortUrl,
      imageUrl: shortUrl,
      id: data?.id || null,
    };
  } catch (e) {
    return {
      error: String(e?.message || e),
    };
  }
}

function buildDashboardRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(BTN_REFRESH_ID)
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🔃")
        .setLabel("Forçar atualização")
    ),
  ];
}

function buildMainEmbed({ currentStats, previousStats, chartUrl }) {
  const updatedTs = Math.floor(Date.now() / 1000);

  return new EmbedBuilder()
    .setColor(0x9b59b6)
    .setAuthor({
      name: "SantaCreators • Dashboard Profissional de Presença",
      iconURL: DASH_ICON,
    })
    .setTitle("📊 Dashboard Mensal — Confirmação de ORGs nos Eventos")
    .setDescription([
      `**Mês atual:** \`${getMonthLabelBR(currentStats.monthKey)}\``,
      `**Canal analisado:** <#${PRESENCA_LOG_CHANNEL_ID}>`,
      `**Última atualização:** <t:${updatedTs}:R>`,
      "",
      "Este painel mostra o desempenho mensal das confirmações de presença das ORGs nos eventos.",
      "🟢 Verde = confirmou que vai",
      "🔴 Vermelho = informou que não vai / reprovada no evento",
    ].join("\n"))
    .addFields(
      {
        name: "📌 Resumo geral do mês",
        value: formatGeneralStatus(currentStats, previousStats),
        inline: false,
      },
      {
        name: "📆 Totais por semana do mês",
        value: formatWeeklySummary(currentStats),
        inline: false,
      },
      {
        name: "🏆 Top 3 — Quem mais confirma no mês",
        value: formatTopUsers(currentStats, "YES", 3),
        inline: false,
      },
      {
        name: "🚫 Top 3 — Quem mais diz que não vai no mês",
        value: formatTopUsers(currentStats, "NO", 3),
        inline: false,
      },
      {
        name: "👑 Top 1 do mês passado",
        value: formatTopLastMonth(previousStats),
        inline: false,
      },
      {
        name: "🏢 ORGs com mais confirmações",
        value: formatTopOrgs(currentStats, "YES", 5),
        inline: false,
      },
      {
        name: "🚨 ORGs com mais reprovadas / não vai",
        value: formatTopOrgs(currentStats, "NO", 5),
        inline: false,
      },
      {
        name: "📅 Controle diário do mês",
        value: formatLastDays(currentStats),
        inline: false,
      }
    )
    .setImage(chartUrl || DASH_GIF)
    .setFooter({
      text: "SantaCreators • Dashboard mensal automático • Verde confirma | Vermelho não vai",
    })
    .setTimestamp();
}

async function updatePresenceDashboard(client, causeUserId = null, reason = "auto") {
  if (globalThis.__PRESENCA_EVENTOS_DASH_RUNNING__) return false;
  globalThis.__PRESENCA_EVENTOS_DASH_RUNNING__ = true;

  try {
    const dashChannel = await client.channels.fetch(PRESENCA_DASH_CHANNEL_ID).catch(() => null);
    if (!dashChannel?.isTextBased?.()) return false;

    const currentMonthKey = getMonthKeySP();
    const previousMonthKey = getPreviousMonthKeySP();

    const months = await collectMonthStatsFromLogs(client, [
      currentMonthKey,
      previousMonthKey,
    ]);

    const currentStats = months[currentMonthKey] || emptyMonthStats(currentMonthKey);
    const previousStats = months[previousMonthKey] || emptyMonthStats(previousMonthKey);

    const chartConfig = buildChartConfig(currentStats);
    const chartLinks = await getQuickChartLinks(chartConfig);

    const chartUrl = chartLinks && !chartLinks.error
      ? chartLinks.imageUrl
      : null;

    const embed = buildMainEmbed({
      currentStats,
      previousStats,
      chartUrl,
    });

    const components = buildDashboardRows();

    const state = loadState();

    const newHash = sha1(JSON.stringify({
      currentStats,
      previousStats,
      chartUrl,
    }));

    if (state.messageId) {
      const oldMsg = await dashChannel.messages.fetch(state.messageId).catch(() => null);

      if (oldMsg) {
        await oldMsg.edit({
          embeds: [embed],
          components,
        }).catch(() => null);

        state.lastHash = newHash;
        state.lastUpdatedAt = Date.now();
        saveState(state);
        return true;
      }
    }

    const sent = await dashChannel.send({
      embeds: [embed],
      components,
    }).catch(() => null);

    if (sent) {
      state.messageId = sent.id;
      state.lastHash = newHash;
      state.lastUpdatedAt = Date.now();
      saveState(state);
      return true;
    }

    return false;
  } finally {
    globalThis.__PRESENCA_EVENTOS_DASH_RUNNING__ = false;
  }
}

// ===============================
// PUBLIC HOOKS
// ===============================

export async function graficoPresencaEventosOnReady(client) {
  if (client.__PRESENCA_EVENTOS_READY_RAN__) return;
  client.__PRESENCA_EVENTOS_READY_RAN__ = true;

  await updatePresenceDashboard(client, null, "ready");

  if (!globalThis.__PRESENCA_EVENTOS_TICK__) {
    globalThis.__PRESENCA_EVENTOS_TICK__ = setInterval(() => {
      updatePresenceDashboard(client, null, "tick").catch(() => null);
    }, 10 * 60 * 1000);
  }
}

export async function graficoPresencaEventosHandleInteraction(interaction, client) {
  try {
    if (!interaction?.isButton?.()) return false;

    if (interaction.customId !== BTN_REFRESH_ID) return false;

    if (!canManageDashboard(interaction)) {
      await interaction.reply({
        content: "⛔ Você não tem permissão para atualizar esse dashboard.",
        ephemeral: true,
      }).catch(() => null);

      return true;
    }

    await interaction.deferReply({ ephemeral: true });

    await updatePresenceDashboard(
      client,
      interaction.user?.id || null,
      "force"
    );

    await interaction.editReply("✅ Dashboard de presença atualizado com sucesso.");

    return true;
  } catch (e) {
    try {
      if (interaction?.deferred || interaction?.replied) {
        await interaction.editReply("❌ Deu erro ao atualizar o dashboard de presença.");
      } else {
        await interaction.reply({
          content: "❌ Deu erro ao atualizar o dashboard de presença.",
          ephemeral: true,
        });
      }
    } catch {}

    console.error("[GraficoPresencaEventos] Erro no handler:", e);
    return true;
  }
}

export async function graficoPresencaEventosEmitUpdate(client, causeUserId = null, reason = "emit") {
  return updatePresenceDashboard(client, causeUserId, reason);
}