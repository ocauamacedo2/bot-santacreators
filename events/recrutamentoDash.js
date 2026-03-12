// d:\bots\events\recrutamentoDash.js
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { dashOn } from "../utils/dashHub.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ================= CONFIG =================
const DASH_CHANNEL_ID = "1470565043077775524";
const LOG_CHANNEL_ID = "1470590889335328941";
const ALLOWED_RESET_USERS = ["660311795327828008", "1262262852949905408"];
const DATA_DIR = path.resolve(__dirname, "../data");
const STATS_FILE = path.join(DATA_DIR, "recrutamento_stats.json");
const GI_DATA_FILE = path.join(DATA_DIR, "sc_gi_registros.json"); // Lê o arquivo do GI para contagem real

const META_GI_TOTAL = 30; // Meta de controles ativos
const TZ = "America/Sao_Paulo";

// ================= STATE =================
function loadStats() {
  try {
    if (!fs.existsSync(STATS_FILE)) return { weeks: {}, messageId: null };
    return JSON.parse(fs.readFileSync(STATS_FILE, "utf8"));
  } catch {
    return { weeks: {}, messageId: null };
  }
}

function saveStats(data) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STATS_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("[RecrutamentoDash] Erro ao salvar stats:", e);
  }
}

// Lê o arquivo do módulo GI para pegar status atual (Ativos/Pausados)
function getGIStatus() {
  try {
    if (!fs.existsSync(GI_DATA_FILE)) return { active: 0, paused: 0, total: 0 };
    const data = JSON.parse(fs.readFileSync(GI_DATA_FILE, "utf8"));
    const regs = data.registros || [];
    
    const active = regs.filter(r => r.active).length;
    const paused = regs.filter(r => !r.active).length;
    
    return { active, paused, total: active + paused };
  } catch {
    return { active: 0, paused: 0, total: 0 };
  }
}

// ================= TIME UTILS =================
function getWeekKey(date = new Date()) {
  // Semana de Domingo a Sábado (padrão ISO YYYY-MM-DD do domingo)
  const d = new Date(date.toLocaleString("en-US", { timeZone: TZ }));
  const day = d.getDay(); // 0=Dom
  const diff = d.getDate() - day; 
  const sunday = new Date(d.setDate(diff));
  return sunday.toISOString().slice(0, 10); 
}

function getPreviousWeekKey(weekKey) {
  const d = new Date(weekKey);
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}`;
}

// ================= CHART =================
function generateChartUrl(weeksData, currentWeekKey) {
  // Pega as últimas 4 semanas
  const keys = Object.keys(weeksData).sort();
  const last4 = keys.slice(-4);
  
  // Se não tiver a atual, adiciona visualmente
  if (!last4.includes(currentWeekKey)) last4.push(currentWeekKey);
  if (last4.length > 4) last4.shift();

  const labels = last4.map(k => formatDate(k));
  const dataEntrou = last4.map(k => weeksData[k]?.entrou || 0);
  const dataSaiu = last4.map(k => weeksData[k]?.saiu || 0);

  const config = {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Contratados',
          data: dataEntrou,
          backgroundColor: 'rgba(75, 192, 192, 0.8)',
          borderColor: 'rgba(75, 192, 192, 1)',
          borderWidth: 1
        },
        {
          label: 'Desligados',
          data: dataSaiu,
          backgroundColor: 'rgba(255, 99, 132, 0.8)',
          borderColor: 'rgba(255, 99, 132, 1)',
          borderWidth: 1
        }
      ]
    },
    options: {
      title: { display: true, text: 'Fluxo de Recrutamento (4 Semanas)' },
      scales: { yAxes: [{ ticks: { beginAtZero: true, precision: 0 } }] },
      plugins: {
        datalabels: {
          anchor: 'end',
          align: 'top',
          color: '#000',
          font: { weight: 'bold' }
        }
      }
    }
  };

  // ✅ Aumentei para 800x450 para tirar o aspecto de "zoom" e caber melhor os textos
  return `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(config))}&width=800&height=450&backgroundColor=white`;
}

// ================= UPDATE DASHBOARD =================
async function updateDashboard(client) {
  const channel = await client.channels.fetch(DASH_CHANNEL_ID).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  const stats = loadStats();
  const giStatus = getGIStatus();
  const weekKey = getWeekKey();
  const prevWeekKey = getPreviousWeekKey(weekKey);

  // Garante inicialização da semana
  if (!stats.weeks[weekKey]) stats.weeks[weekKey] = { entrou: 0, saiu: 0 };
  if (!stats.weeks[prevWeekKey]) stats.weeks[prevWeekKey] = { entrou: 0, saiu: 0 };

  const cur = stats.weeks[weekKey];
  const prev = stats.weeks[prevWeekKey];

  // Comparativo
  const diffEntrou = cur.entrou - prev.entrou;
  const diffSaiu = cur.saiu - prev.saiu;
  const saldoSemana = cur.entrou - cur.saiu;
  
  const emojiSaldo = saldoSemana > 0 ? "🟢" : saldoSemana < 0 ? "🔴" : "⚪";
  const metaStatus = giStatus.total >= META_GI_TOTAL ? "✅ Meta Batida" : `⚠️ Faltam ${META_GI_TOTAL - giStatus.total}`;

  const embed = new EmbedBuilder()
    .setTitle("📊 Dashboard de Recrutamento & Gestão")
    .setColor(saldoSemana >= 0 ? 0x00FF00 : 0xFF0000)
    .setDescription(`**Meta de Controles GI:** ${META_GI_TOTAL}\n**Status:** ${metaStatus}`)
    .addFields(
      { name: "👥 Gestão Influencer (Total)", value: `**${giStatus.total}** Controles`, inline: true },
      { name: "🟢 Ativos", value: `**${giStatus.active}**`, inline: true },
      { name: "⏸️ Pausados", value: `**${giStatus.paused}**`, inline: true },
      
      { name: "\u200B", value: "━━━━━━━━━━━━━━━━━━━━━━", inline: false },
      
      { name: "📅 Esta Semana", value: `Contratados: **${cur.entrou}**\nDesligados: **${cur.saiu}**\nCrescimento: ${emojiSaldo} **${saldoSemana}**`, inline: true },
      { name: "⏮️ Semana Anterior", value: `Contratados: **${prev.entrou}**\nDesligados: **${prev.saiu}**`, inline: true },
      
      { name: "📈 Comparativo (vs Anterior)", value: `Contratações: **${diffEntrou > 0 ? '+' : ''}${diffEntrou}**\nDesligamentos: **${diffSaiu > 0 ? '+' : ''}${diffSaiu}**`, inline: true }
    )
    .setImage(generateChartUrl(stats.weeks, weekKey))
    .setFooter({ text: "Atualizado automaticamente • Domingo a Domingo" })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("recrut_refresh").setLabel("🔄 Atualizar").setStyle(ButtonStyle.Secondary)
  );

  if (stats.messageId) {
    const msg = await channel.messages.fetch(stats.messageId).catch(() => null);
    if (msg) {
      await msg.edit({ embeds: [embed], components: [row] });
      return;
    }
  }

  const newMsg = await channel.send({ embeds: [embed], components: [row] });
  stats.messageId = newMsg.id;
  saveStats(stats);
}

// ================= LISTENERS =================
export async function recrutamentoDashOnReady(client) {
  // Listener de Entrada (Pedir Set Aprovado)
  dashOn('pedirset:aprovado', async () => {
    const stats = loadStats();
    const wk = getWeekKey();
    if (!stats.weeks[wk]) stats.weeks[wk] = { entrou: 0, saiu: 0 };
    
    stats.weeks[wk].entrou++;
    saveStats(stats);
    await updateDashboard(client);
  });

  // Listener de Saída (GI Desligado)
  dashOn('gi:desligado', async () => {
    const stats = loadStats();
    const wk = getWeekKey();
    if (!stats.weeks[wk]) stats.weeks[wk] = { entrou: 0, saiu: 0 };
    
    stats.weeks[wk].saiu++;
    saveStats(stats);
    await updateDashboard(client);
  });

  // Atualiza no boot
  await updateDashboard(client);
}

export async function recrutamentoDashHandleInteraction(interaction, client) {
  if (interaction.isButton() && interaction.customId === "recrut_refresh") {
    await interaction.deferReply({ ephemeral: true });
    await updateDashboard(client);
    await interaction.editReply("✅ Dashboard atualizado!");
    return true;
  }
  return false;
}

export async function recrutamentoDashHandleMessage(message, client) {
  if (!message.guild || message.author.bot) return false;
  if (message.content !== "!zerarecrutamento") return false;

  if (!ALLOWED_RESET_USERS.includes(message.author.id)) {
    await message.reply("❌ Você não tem permissão para zerar o recrutamento.");
    return true;
  }

  const statsBefore = loadStats();
  const weeksCountBefore = Object.keys(statsBefore.weeks || {}).length;

  // Zera as estatísticas (mantém o ID da mensagem pra editar a mesma)
  const statsAfter = { weeks: {}, messageId: statsBefore.messageId };
  saveStats(statsAfter);

  // Atualiza o painel visualmente
  await updateDashboard(client);

  await message.reply("✅ Estatísticas de recrutamento zeradas com sucesso.");

  // Log
  try {
    const logChannel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    if (logChannel && logChannel.isTextBased()) {
      const embed = new EmbedBuilder()
        .setTitle("🗑️ Dashboard Recrutamento ZERADO")
        .setColor("Red")
        .setThumbnail(message.author.displayAvatarURL())
        .addFields(
          { name: "👤 Quem zerou", value: `${message.author} (\`${message.author.id}\`)`, inline: true },
          { name: "📍 Canal", value: `${message.channel}`, inline: true },
          { name: "🕒 Data", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
          { name: "📉 Antes", value: `Semanas registradas: ${weeksCountBefore}`, inline: true },
          { name: "📉 Depois", value: `Semanas registradas: 0`, inline: true }
        )
        .setFooter({ text: "Sistema de Logs • Recrutamento" })
        .setTimestamp();

      await logChannel.send({ embeds: [embed] });
    }
  } catch (e) {
    console.error("Erro ao enviar log de zerar recrutamento:", e);
  }

  return true;
}
