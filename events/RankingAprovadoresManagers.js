// /application/events/RankingAprovadoresManagers.js
// SC_RANKING_APROVADORES_MANAGERS — Ranking mensal de aprovação/reprovação
// ✅ Separado do GraficoManagers.js para não conflitar
// ✅ Lê chat principal + logs
// ✅ Mensagem única no canal de dashboard
// ✅ Botão manual de atualizar
// ✅ Atualiza automaticamente quando aprova/reprova pelo Registro Manager

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from "discord.js";

const RANKING_APROVADORES_DASH_CHANNEL_ID = "1511255193386487859";

const RANKING_APROVADORES_SCAN_CHANNEL_IDS = [
  "1392680204517769277",
  "1486009491702153349",
  "1486084441762693291",
];

const RANKING_APROVADORES_STATE_PATH = "./data/ranking_aprovadores_managers_state.json";

const RANKING_APROVADORES_REFRESH_BUTTON_ID = "sc_rm_ranking_aprovadores_refresh_v1";

const RANKING_APROVADORES_ALLOWED_USER_IDS = [
  "660311795327828008",
  "1262262852949905408",
];

const RANKING_APROVADORES_ALLOWED_ROLE_IDS = [
  "1388976155830255697",
  "1392678638176043029",
  "1388976314253312100",
  "1352407252216184833",
  "1262262852949905409",
  "1352408327983861844",
  "1282119104576098314",
  "1262262852949905408",
];

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

function sha1(value) {
  return crypto.createHash("sha1").update(String(value)).digest("hex");
}

function loadState() {
  return readJSON(RANKING_APROVADORES_STATE_PATH, {});
}

function saveState(state) {
  writeJSON(RANKING_APROVADORES_STATE_PATH, state);
}

function canUseRankingAprovadores(member, userId) {
  try {
    if (RANKING_APROVADORES_ALLOWED_USER_IDS.includes(String(userId))) return true;

    return RANKING_APROVADORES_ALLOWED_ROLE_IDS.some((roleId) =>
      member?.roles?.cache?.has(roleId)
    );
  } catch {
    return false;
  }
}

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
}

function getEmbedFields(embed) {
  return embed?.fields || embed?.data?.fields || [];
}

function findField(embed, nameIncludes) {
  const target = normalizeText(nameIncludes);
  return getEmbedFields(embed).find((field) =>
    normalizeText(field?.name).includes(target)
  );
}

function getMentionId(text) {
  const raw = String(text || "");

  const mention = raw.match(/<@!?(\d{17,20})>/);
  if (mention) return mention[1];

  const id = raw.match(/`?(\d{17,20})`?/);
  if (id) return id[1];

  return null;
}

function isRegistroManagerEmbed(embed) {
  const title = normalizeText(embed?.title || embed?.data?.title || "");
  const author = normalizeText(embed?.author?.name || embed?.data?.author?.name || "");
  const footer = normalizeText(embed?.footer?.text || embed?.data?.footer?.text || "");

  return (
    title.includes("registro de evento - manager") ||
    title.includes("log — registro manager") ||
    title.includes("log - registro manager") ||
    author.includes("registro de evento manager") ||
    footer.includes("rm msgid")
  );
}

function parseBRDateFromText(text) {
  try {
    const raw = String(text || "");
    const match = raw.match(/(\d{2})\/(\d{2})\/(\d{4})(?:,?\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (!match) return null;

    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    const hour = Number(match[4] || 0);
    const minute = Number(match[5] || 0);
    const second = Number(match[6] || 0);

    if (!day || !month || !year) return null;

    return new Date(Date.UTC(year, month - 1, day, hour, minute, second)).getTime();
  } catch {
    return null;
  }
}

function getCurrentMonthSP() {
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

  const get = (type) => Number(parts.find((part) => part.type === type)?.value || 0);

  const year = get("year");
  const month = get("month");

  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0));

  const label = start.toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    month: "long",
    year: "numeric",
  });

  return {
    key: `${year}-${String(month).padStart(2, "0")}`,
    label: label.charAt(0).toUpperCase() + label.slice(1),
    startMs: start.getTime(),
    endMs: end.getTime(),
  };
}

function getRMDecisionKey(message, embed) {
  const footer = String(embed?.footer?.text || embed?.data?.footer?.text || "");
  const rmMsgId = footer.match(/RM MsgID:\s*(\d{17,25})/i);

  if (rmMsgId) return rmMsgId[1];

  return String(message.id);
}

function extractDecisionFromEmbed(message, embed) {
  if (!isRegistroManagerEmbed(embed)) return null;

  const approvedField = findField(embed, "aprovado por");
  const rejectedField = findField(embed, "reprovado por");

  if (rejectedField?.value) {
    return {
      type: "rejected",
      by: getMentionId(rejectedField.value),
      decidedAt: parseBRDateFromText(rejectedField.value) || message.editedTimestamp || message.createdTimestamp,
    };
  }

  if (approvedField?.value) {
    return {
      type: "approved",
      by: getMentionId(approvedField.value),
      decidedAt: parseBRDateFromText(approvedField.value) || message.editedTimestamp || message.createdTimestamp,
    };
  }

  return null;
}

async function scanRankingAprovadores(client) {
  const month = getCurrentMonthSP();

  const decisions = new Map();

  for (const channelId of RANKING_APROVADORES_SCAN_CHANNEL_IDS) {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased?.()) continue;

    let lastId = undefined;

    for (let page = 0; page < 80; page++) {
      const batch = await channel.messages.fetch({ limit: 100, before: lastId }).catch(() => null);
      if (!batch?.size) break;

      for (const message of batch.values()) {
        if (!message?.embeds?.length) continue;

        for (const embed of message.embeds) {
          const decision = extractDecisionFromEmbed(message, embed);
          if (!decision?.by) continue;

          if (decision.decidedAt < month.startMs || decision.decidedAt >= month.endMs) continue;

          const key = getRMDecisionKey(message, embed);

          const current = decisions.get(key);
          if (!current || decision.decidedAt >= current.decidedAt) {
            decisions.set(key, decision);
          }
        }
      }

      lastId = batch.last()?.id;
      if (!lastId) break;

      const oldestTimestamp = batch.last()?.createdTimestamp || 0;
      if (oldestTimestamp && oldestTimestamp < month.startMs - 10 * 24 * 60 * 60 * 1000) break;
    }
  }

  const users = {};

  for (const decision of decisions.values()) {
    const userId = String(decision.by);

    users[userId] ||= {
      approved: 0,
      rejected: 0,
    };

    if (decision.type === "approved") users[userId].approved += 1;
    if (decision.type === "rejected") users[userId].rejected += 1;
  }

  return {
    month,
    users,
    totalDecisions: decisions.size,
  };
}

function makeUserList(users) {
  return Object.entries(users).map(([id, data]) => {
    const approved = Number(data.approved || 0);
    const rejected = Number(data.rejected || 0);
    const total = approved + rejected;

    return {
      id,
      approved,
      rejected,
      total,
      approvalRate: total > 0 ? approved / total : 0,
      rejectRate: total > 0 ? rejected / total : 0,
    };
  });
}

function percent(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function progressBar(value) {
  const safe = Math.max(0, Math.min(1, Number(value || 0)));
  const filled = Math.round(safe * 10);
  const empty = 10 - filled;

  return "█".repeat(filled) + "░".repeat(empty);
}

function rankingLines(list, type) {
  if (!list.length) return "Sem dados suficientes ainda.";

  return list.slice(0, 10).map((user, index) => {
    const pos =
      index === 0 ? "🥇" :
      index === 1 ? "🥈" :
      index === 2 ? "🥉" :
      `**${index + 1}.**`;

    if (type === "approved") {
      return `${pos} <@${user.id}> — **${user.approved}** aprovações • taxa **${percent(user.approvalRate)}**`;
    }

    if (type === "rejected") {
      return `${pos} <@${user.id}> — **${user.rejected}** reprovações • taxa **${percent(user.rejectRate)}**`;
    }

    if (type === "lessApproved") {
      return `${pos} <@${user.id}> — **${user.approved}** aprovações • **${user.total}** decisões`;
    }

    return `${pos} <@${user.id}> — ✅ **${user.approved}** • ❌ **${user.rejected}** • aprovação **${percent(user.approvalRate)}**`;
  }).join("\n");
}

function buildChartUrl({ topApproved, topRejected }) {
  const labels = [];
  const approvedData = [];
  const rejectedData = [];

  const ids = new Set();

  for (const user of topApproved.slice(0, 7)) ids.add(user.id);
  for (const user of topRejected.slice(0, 7)) ids.add(user.id);

  for (const id of ids) {
    const fromApproved = topApproved.find((u) => u.id === id);
    const fromRejected = topRejected.find((u) => u.id === id);
    const user = fromApproved || fromRejected;

    labels.push(String(id).slice(-4));
    approvedData.push(user?.approved || 0);
    rejectedData.push(user?.rejected || 0);
  }

  const config = {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Aprovados",
          data: approvedData,
          backgroundColor: "rgba(87, 242, 135, 0.85)",
        },
        {
          label: "Reprovados",
          data: rejectedData,
          backgroundColor: "rgba(237, 66, 69, 0.85)",
        },
      ],
    },
    options: {
      plugins: {
        legend: {
          labels: {
            color: "#ffffff",
          },
        },
        datalabels: {
          anchor: "end",
          align: "top",
          color: "#ffffff",
          font: {
            weight: "bold",
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: "#ffffff",
          },
          grid: {
            color: "rgba(255,255,255,0.08)",
          },
        },
        y: {
          beginAtZero: true,
          ticks: {
            precision: 0,
            color: "#ffffff",
          },
          grid: {
            color: "rgba(255,255,255,0.08)",
          },
        },
      },
    },
  };

  return `https://quickchart.io/chart?width=1000&height=500&backgroundColor=transparent&c=${encodeURIComponent(JSON.stringify(config))}`;
}

function buildDashboardPayload(client, stats, causeUserId, reason) {
  const users = makeUserList(stats.users);

  const totalApproved = users.reduce((acc, user) => acc + user.approved, 0);
  const totalRejected = users.reduce((acc, user) => acc + user.rejected, 0);
  const total = totalApproved + totalRejected;

  const globalApprovalRate = total > 0 ? totalApproved / total : 0;
  const globalRejectRate = total > 0 ? totalRejected / total : 0;

  const topApproved = [...users].sort((a, b) => b.approved - a.approved || b.approvalRate - a.approvalRate);
  const topRejected = [...users].sort((a, b) => b.rejected - a.rejected || b.rejectRate - a.rejectRate);
  const lessApproved = [...users]
    .filter((user) => user.total > 0)
    .sort((a, b) => a.approved - b.approved || b.total - a.total);

  const bestApprovalRate = [...users]
    .filter((user) => user.total >= 3)
    .sort((a, b) => b.approvalRate - a.approvalRate || b.total - a.total);

  const worstRejectRate = [...users]
    .filter((user) => user.total >= 3)
    .sort((a, b) => b.rejectRate - a.rejectRate || b.total - a.total);

  const chartUrl = buildChartUrl({ topApproved, topRejected });

  const guildIcon = client.user.displayAvatarURL();

  const resumoEmbed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setAuthor({
      name: "SantaCreators • Ranking Mensal de Aprovações",
      iconURL: guildIcon,
    })
    .setTitle("📊 Dashboard mensal — Registro Manager")
    .setDescription(
      [
        `📅 **Mês analisado:** ${stats.month.label}`,
        `📌 **Fonte:** chat principal + canais de logs`,
        `🔁 **Atualização:** automática ao aprovar/reprovar + botão manual`,
        "",
        `✅ **Aprovações:** ${totalApproved}`,
        `❌ **Reprovações:** ${totalRejected}`,
        `📦 **Decisões únicas analisadas:** ${total}`,
        "",
        `🟢 **Taxa geral de aprovação:** ${progressBar(globalApprovalRate)} **${percent(globalApprovalRate)}**`,
        `🔴 **Taxa geral de reprovação:** ${progressBar(globalRejectRate)} **${percent(globalRejectRate)}**`,
      ].join("\n")
    )
    .setFooter({
      text: `Atualizado por: ${causeUserId ? causeUserId : "sistema"} • Motivo: ${reason || "auto"}`,
    })
    .setTimestamp();

  const rankingEmbed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("🏆 Rankings do mês")
    .addFields(
      {
        name: "✅ Quem mais aprovou",
        value: rankingLines(topApproved, "approved"),
        inline: false,
      },
      {
        name: "📈 Melhor taxa de aprovação",
        value: rankingLines(bestApprovalRate, "mixed"),
        inline: false,
      },
      {
        name: "❌ Quem mais reprovou",
        value: rankingLines(topRejected, "rejected"),
        inline: false,
      },
      {
        name: "⚠️ Maior taxa de reprovação",
        value: rankingLines(worstRejectRate, "mixed"),
        inline: false,
      },
      {
        name: "📉 Quem menos aprovou",
        value: rankingLines(lessApproved, "lessApproved"),
        inline: false,
      }
    )
    .setTimestamp();

  const chartEmbed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle("📊 Gráfico comparativo — Top aprovadores/reprovadores")
    .setDescription("Os nomes aparecem pelo final do ID para o gráfico não ficar poluído. O ranking acima mostra as menções completas.")
    .setImage(chartUrl)
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(RANKING_APROVADORES_REFRESH_BUTTON_ID)
      .setLabel("🔄 Atualizar ranking")
      .setStyle(ButtonStyle.Primary)
  );

  const hash = sha1(JSON.stringify({
    users: stats.users,
    monthKey: stats.month.key,
    total,
  }));

  return {
    embeds: [resumoEmbed, rankingEmbed, chartEmbed],
    components: [row],
    hash,
  };
}

async function ensureDashboardMessage(channel, state) {
  if (state.messageId) {
    const existing = await channel.messages.fetch(state.messageId).catch(() => null);
    if (existing) return existing;
  }

  const recent = await channel.messages.fetch({ limit: 30 }).catch(() => null);
  if (recent) {
    const found = [...recent.values()].find((message) => {
      if (message.author?.id !== channel.client.user.id) return false;
      return message.embeds?.some((embed) =>
        normalizeText(embed?.title || embed?.data?.title || "").includes("dashboard mensal")
      );
    });

    if (found) {
      state.messageId = found.id;
      saveState(state);
      return found;
    }
  }

  const created = await channel.send({
    content: "📊 Carregando ranking mensal de aprovações...",
  }).catch(() => null);

  if (created) {
    state.messageId = created.id;
    saveState(state);
  }

  return created;
}

export async function rankingAprovadoresManagersEmitUpdate(client, causeUserId = null, reason = "auto") {
  try {
    if (globalThis.__SC_RANKING_APROVADORES_UPDATING__) return false;
    globalThis.__SC_RANKING_APROVADORES_UPDATING__ = true;

    const channel = await client.channels.fetch(RANKING_APROVADORES_DASH_CHANNEL_ID).catch(() => null);
    if (!channel?.isTextBased?.()) return false;

    const state = loadState();
    const stats = await scanRankingAprovadores(client);
    const payload = buildDashboardPayload(client, stats, causeUserId, reason);

    const message = await ensureDashboardMessage(channel, state);
    if (!message) return false;

    if (state.lastHash === payload.hash && reason !== "manual" && reason !== "force") {
      return true;
    }

    await message.edit({
      content: "‎",
      embeds: payload.embeds,
      components: payload.components,
    }).catch(async () => {
      const recreated = await channel.send({
        content: "‎",
        embeds: payload.embeds,
        components: payload.components,
      }).catch(() => null);

      if (recreated) {
        state.messageId = recreated.id;
      }
    });

    state.lastHash = payload.hash;
    state.lastUpdateAt = Date.now();
    saveState(state);

    return true;
  } catch (error) {
    console.error("[RANKING_APROVADORES_MANAGERS] erro ao atualizar:", error);
    return false;
  } finally {
    globalThis.__SC_RANKING_APROVADORES_UPDATING__ = false;
  }
}

export async function rankingAprovadoresManagersOnReady(client) {
  try {
    setTimeout(() => {
      rankingAprovadoresManagersEmitUpdate(client, null, "ready").catch(() => {});
    }, 5000);
  } catch {}
}

export async function rankingAprovadoresManagersHandleInteraction(interaction, client) {
  try {
    if (!interaction?.isButton?.()) return false;
    if (interaction.customId !== RANKING_APROVADORES_REFRESH_BUTTON_ID) return false;

    const allowed = canUseRankingAprovadores(interaction.member, interaction.user.id);

    if (!allowed) {
      await interaction.reply({
        content: "❌ Você não tem permissão para atualizar esse ranking.",
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
      return true;
    }

    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    }).catch(() => {});

    const ok = await rankingAprovadoresManagersEmitUpdate(client, interaction.user.id, "manual");

    await interaction.editReply(
      ok
        ? "✅ Ranking mensal atualizado com sucesso."
        : "⚠️ Não consegui atualizar o ranking agora."
    ).catch(() => {});

    return true;
  } catch (error) {
    console.error("[RANKING_APROVADORES_MANAGERS] erro no botão:", error);
    return false;
  }
}