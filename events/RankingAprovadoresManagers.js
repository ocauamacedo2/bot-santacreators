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

function getMonthSP(offsetMonths = 0) {
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

  const start = new Date(Date.UTC(year, month - 1 + offsetMonths, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, month + offsetMonths, 1, 0, 0, 0));

  const label = start.toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    month: "long",
    year: "numeric",
  });

  return {
    key: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`,
    label: label.charAt(0).toUpperCase() + label.slice(1),
    startMs: start.getTime(),
    endMs: end.getTime(),
  };
}

function getCurrentMonthSP() {
  return getMonthSP(0);
}

function getPreviousMonthSP() {
  return getMonthSP(-1);
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

async function scanRankingAprovadores(client, month = getCurrentMonthSP()) {

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
  if (!list.length) return "> Sem dados suficientes ainda.";

  return list.slice(0, 5).map((user, index) => {
    const pos =
      index === 0 ? "🥇" :
      index === 1 ? "🥈" :
      index === 2 ? "🥉" :
      `**${index + 1}.**`;

    if (type === "approved") {
      return `${pos} <@${user.id}>\n> ✅ Aprovações: **${user.approved}**\n> 📊 Aproveitamento: **${percent(user.approvalRate)}**`;
    }

    if (type === "rejected") {
      return `${pos} <@${user.id}>\n> ❌ Reprovações: **${user.rejected}**\n> 📊 Taxa de reprovação: **${percent(user.rejectRate)}**`;
    }

    if (type === "lessApproved") {
      return `${pos} <@${user.id}>\n> 📉 Aprovações: **${user.approved}**\n> 📦 Decisões analisadas: **${user.total}**`;
    }

    return `${pos} <@${user.id}>\n> ✅ **${user.approved}** aprovados\n> ❌ **${user.rejected}** reprovados\n> 🟢 Aprovação: **${percent(user.approvalRate)}**`;
  }).join("\n\n");
}

async function getChartName(client, userId) {
  try {
    const user = await client.users.fetch(String(userId)).catch(() => null);

    const rawName =
      user?.globalName ||
      user?.displayName ||
      user?.username ||
      String(userId);

    return String(rawName)
      .replace(/[^\p{L}\p{N}\s._-]/gu, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 16) || String(userId).slice(-4);
  } catch {
    return String(userId).slice(-4);
  }
}

async function getFooterUserName(client, userId) {
  try {
    if (!userId) return "sistema";

    const user = await client.users.fetch(String(userId)).catch(() => null);

    return (
      user?.globalName ||
      user?.displayName ||
      user?.username ||
      String(userId)
    );
  } catch {
    return String(userId || "sistema");
  }
}

function buildChartUrl({ chartUsers }) {
  const labels = chartUsers.map((user) => user.chartName);
  const approvedData = chartUsers.map((user) => user.approved || 0);
  const rejectedData = chartUsers.map((user) => user.rejected || 0);

  const config = {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Aprovados",
          data: approvedData,
          backgroundColor: "rgba(87, 242, 135, 0.88)",
          borderColor: "rgba(87, 242, 135, 1)",
          borderWidth: 2,
          borderRadius: 8,
          barPercentage: 0.65,
          categoryPercentage: 0.72,
        },
        {
          label: "Reprovados",
          data: rejectedData,
          backgroundColor: "rgba(237, 66, 69, 0.88)",
          borderColor: "rgba(237, 66, 69, 1)",
          borderWidth: 2,
          borderRadius: 8,
          barPercentage: 0.65,
          categoryPercentage: 0.72,
        },
      ],
    },
    options: {
      layout: {
        padding: {
          top: 35,
          right: 30,
          bottom: 25,
          left: 20,
        },
      },
      plugins: {
        legend: {
          position: "top",
          labels: {
            color: "#ffffff",
            font: {
              size: 18,
              weight: "bold",
            },
            padding: 22,
          },
        },
        datalabels: {
          anchor: "end",
          align: "top",
          color: "#ffffff",
          font: {
            size: 18,
            weight: "bold",
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: "#ffffff",
            font: {
              size: 15,
              weight: "bold",
            },
            maxRotation: 35,
            minRotation: 20,
          },
          grid: {
            display: false,
          },
        },
        y: {
          beginAtZero: true,
          ticks: {
            precision: 0,
            color: "#b9bbbe",
            font: {
              size: 14,
              weight: "bold",
            },
          },
          grid: {
            color: "rgba(255,255,255,0.08)",
          },
        },
      },
    },
  };

  return `https://quickchart.io/chart?width=1200&height=620&backgroundColor=%23000000&c=${encodeURIComponent(JSON.stringify(config))}`;
}
async function buildDashboardPayload(client, stats, causeUserId, reason) {
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
  const chartBaseUsers = [...users]
    .filter((user) => user.total > 0)
    .sort((a, b) => b.total - a.total || b.approved - a.approved)
    .slice(0, 7);

  const chartUsers = [];

  for (const user of chartBaseUsers) {
    chartUsers.push({
      ...user,
      chartName: await getChartName(client, user.id),
    });
  }

  const chartUrl = buildChartUrl({ chartUsers });

  const guildIcon = client.user.displayAvatarURL();
  const updaterName = await getFooterUserName(client, causeUserId);

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
      text: `Atualizado por: ${updaterName} • Motivo: ${reason || "auto"}`,
    })
    .setTimestamp();

  const rankingEmbed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("🏆 Ranking mensal dos aprovadores")
    .setDescription(
      [
        "📌 **Leitura organizada do mês atual.**",
        "✅ Mostra quem mais aprovou.",
        "❌ Mostra quem mais reprovou.",
        "📊 Mostra aproveitamento e desempenho geral.",
      ].join("\n")
    )
    .addFields(
      {
        name: "✅ TOP APROVADORES",
        value: rankingLines(topApproved.filter((user) => user.approved > 0), "approved"),
        inline: false,
      },
      {
        name: "📈 MELHOR APROVEITAMENTO",
        value: rankingLines(bestApprovalRate, "mixed"),
        inline: false,
      },
      {
        name: "❌ TOP REPROVAÇÕES",
        value: rankingLines(topRejected.filter((user) => user.rejected > 0), "rejected"),
        inline: false,
      },
      {
        name: "📉 MENOR VOLUME DE APROVAÇÕES",
        value: rankingLines(lessApproved, "lessApproved"),
        inline: false,
      }
    )
    .setTimestamp();

  const chartEmbed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle("📊 Gráfico visual — Aprovações x Reprovações")
    .setDescription(
      [
        "🟩 **Verde:** aprovações no mês.",
        "🟥 **Vermelho:** reprovações no mês.",
        "👤 Abaixo de cada barra aparece o nome do aprovador.",
      ].join("\n")
    )
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

async function ensureDashboardMessage(channel, state, monthKey) {
  const savedMonthKey = state.currentMonthKey || null;
  const isSameMonth = !savedMonthKey || String(savedMonthKey) === String(monthKey);

  if (state.messageId && isSameMonth) {
    const existing = await channel.messages.fetch(state.messageId).catch(() => null);

    if (existing) {
      state.currentMonthKey = String(monthKey);
      saveState(state);
      return existing;
    }
  }

  // ✅ Virou o mês:
  // não apaga o painel antigo, apenas cria um painel novo para o mês atual.
  if (state.messageId && savedMonthKey && String(savedMonthKey) !== String(monthKey)) {
    delete state.messageId;
    delete state.lastHash;
    state.currentMonthKey = String(monthKey);
    saveState(state);
  }

  const created = await channel.send({
    content: "📊 Carregando ranking mensal de aprovações...",
  }).catch(() => null);

  if (created) {
    state.messageId = created.id;
    state.currentMonthKey = String(monthKey);
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
    const payload = await buildDashboardPayload(client, stats, causeUserId, reason);

    const message = await ensureDashboardMessage(channel, state, stats.month.key);
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
    state.currentMonthKey = stats.month.key;
    saveState(state);

    return true;
  } catch (error) {
    console.error("[RANKING_APROVADORES_MANAGERS] erro ao atualizar:", error);
    return false;
  } finally {
    globalThis.__SC_RANKING_APROVADORES_UPDATING__ = false;
  }
}

export async function rankingAprovadoresManagersSendPreviousThenCurrent(client, causeUserId = null) {
  try {
    const channel = await client.channels.fetch(RANKING_APROVADORES_DASH_CHANNEL_ID).catch(() => null);
    if (!channel?.isTextBased?.()) return false;

    const state = loadState();

    // ✅ Não apaga o painel atual.
    // O ranking passado será enviado acima/como histórico,
    // e o painel atual continuará sendo preservado.

    const previousStats = await scanRankingAprovadores(client, getPreviousMonthSP());
    const previousPayload = await buildDashboardPayload(client, previousStats, causeUserId, "rankingpassado");

    await channel.send({
      content: "📦 **Ranking do mês passado — enviado manualmente**",
      embeds: previousPayload.embeds,
      components: [],
    }).catch(() => null);

    const currentStats = await scanRankingAprovadores(client, getCurrentMonthSP());
    const currentPayload = await buildDashboardPayload(client, currentStats, causeUserId, "atual após rankingpassado");

    const currentMessage = await channel.send({
      content: "📊 **Ranking atual do mês — mensagem principal**",
      embeds: currentPayload.embeds,
      components: currentPayload.components,
    }).catch(() => null);

    if (currentMessage) {
      state.messageId = currentMessage.id;
      state.lastHash = currentPayload.hash;
      state.lastUpdateAt = Date.now();
      state.currentMonthKey = currentStats.month.key;
      saveState(state);
    }

    return true;
  } catch (error) {
    console.error("[RANKING_APROVADORES_MANAGERS] erro no ranking passado:", error);
    return false;
  }
}

export async function rankingAprovadoresManagersHandleMessage(message, client) {
  try {
    if (!message?.guild) return false;
    if (message.author?.bot) return false;
    if (message.channelId !== RANKING_APROVADORES_DASH_CHANNEL_ID) return false;

    const content = String(message.content || "").trim().toLowerCase();
    if (content !== "!rankingpassado") return false;

    const allowed = canUseRankingAprovadores(message.member, message.author.id);

    if (!allowed) {
      await message
        .reply({ content: "❌ Você não tem permissão pra usar `!rankingpassado`." })
        .then((m) => setTimeout(() => m.delete().catch(() => {}), 5000))
        .catch(() => {});

      setTimeout(() => message.delete().catch(() => {}), 1000);
      return true;
    }

    if (globalThis.__SC_RANKING_PASSADO_RUNNING__) {
      await message
        .reply({ content: "⏳ O ranking passado já está sendo gerado. Aguarde terminar." })
        .then((m) => setTimeout(() => m.delete().catch(() => {}), 6000))
        .catch(() => {});

      return true;
    }

    globalThis.__SC_RANKING_PASSADO_RUNNING__ = true;

    await message.delete().catch(() => {});

    const aviso = await message.channel
      .send("⏳ Gerando **ranking do mês passado** e repostando o **ranking atual** embaixo...")
      .catch(() => null);

    const ok = await rankingAprovadoresManagersSendPreviousThenCurrent(client, message.author.id);

    if (aviso) {
      await aviso
        .edit(
          ok
            ? "✅ Ranking do mês passado enviado e ranking atual repostado embaixo."
            : "⚠️ Não consegui gerar o ranking passado agora. Veja o console do bot."
        )
        .catch(() => {});

      setTimeout(() => aviso.delete().catch(() => {}), 8000);
    }

    return true;
  } catch (error) {
    console.error("[RANKING_APROVADORES_MANAGERS] erro no comando !rankingpassado:", error);
    return false;
  } finally {
    globalThis.__SC_RANKING_PASSADO_RUNNING__ = false;
  }
}

export async function rankingAprovadoresManagersOnReady(client) {
  try {
    setTimeout(() => {
      rankingAprovadoresManagersEmitUpdate(client, null, "ready").catch(() => {});
    }, 5000);
  } catch {}

  if (!globalThis.__SC_RANKING_APROVADORES_MESSAGE_LISTENER__) {
    globalThis.__SC_RANKING_APROVADORES_MESSAGE_LISTENER__ = true;

    client.on("messageCreate", async (message) => {
      try {
        await rankingAprovadoresManagersHandleMessage(message, client);
      } catch (error) {
        console.error("[RANKING_APROVADORES_MANAGERS] erro no listener messageCreate:", error);
      }
    });
  }
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