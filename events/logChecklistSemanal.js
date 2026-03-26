import fs from "node:fs";
import path from "node:path";
import cron from "node-cron";
import { fileURLToPath } from "node:url";
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} from "discord.js";
import { dashEmit } from "../utils/dashHub.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===============================
// CONFIGURAÇÃO
// ===============================
const DATA_DIR = path.resolve(process.cwd(), "data");
const CHECKLIST_FILE = path.join(DATA_DIR, "sc_logs_checklist.json");
const GI_DATA_FILE = path.join(DATA_DIR, "sc_gi_registros.json");

const TZ = "America/Sao_Paulo";
const ROLE_PRIORITY = "1371733765243670538";
const LOG_CHANNEL_ID = "1460339582842310731"; 

const PANEL_CONFIG = {
  CHANNEL_ID: "1477800974574682242", 
  STATE_FILE: path.join(DATA_DIR, "sc_checklist_panel_state.json")
};

// Permissões (Baseado no gestaoinfluencer.js)
const AUTH_CONFIG = {
  USER_IDS: ["660311795327828008", "1262262852949905408"],
  ROLE_IDS: [
    "1352408327983861844", // resp creator
    "1414651836861907006", // responsáveis
    "1262262852949905409", // resp influ
    "1352407252216184833"  // resp líder
  ]
};

// ===============================
// HELPERS DE TEMPO (SP)
// ===============================
function getNowSP() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: TZ }));
}

function weekKeyFromDateSP(date = getNowSP()) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Dom
  const diff = d.getDate() - day;
  const sunday = new Date(d.setDate(diff));
  return sunday.toISOString().slice(0, 10);
}

function getWeekRangeLabel(weekKey) {
  const start = new Date(weekKey + "T00:00:00");
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  
  const fmt = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  return `${fmt(start)} → ${fmt(end)}`;
}

// ===============================
// PERSISTÊNCIA ATÔMICA
// ===============================
function loadJSON(file, fallback = {}) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch { return fallback; }
}

function saveJSON(file, data) {
  try {
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
    fs.renameSync(tmp, file);
  } catch (e) {
    console.error(`[ChecklistLogs] Erro ao salvar ${path.basename(file)}:`, e);
  }
}

// ===============================
// LÓGICA DE DADOS
// ===============================
function getGIData() {
  const data = loadJSON(GI_DATA_FILE, { registros: [] });
  return data.registros || [];
}

function syncWeekData() {
  const checklist = loadJSON(CHECKLIST_FILE, { weeks: {} });
  const giRegistros = getGIData();
  const weekKey = weekKeyFromDateSP();

  if (!checklist.weeks[weekKey]) {
    checklist.weeks[weekKey] = { responsaveis: {} };
  }

  const currentWeek = checklist.weeks[weekKey];

  giRegistros.forEach(reg => {
    if (!reg.active || !reg.responsibleUserId) return;

    const respId = reg.responsibleUserId;
    const memberId = reg.targetId;

    if (!currentWeek.responsaveis[respId]) {
      currentWeek.responsaveis[respId] = { members: {} };
    }

    if (!currentWeek.responsaveis[respId].members[memberId]) {
      currentWeek.responsaveis[respId].members[memberId] = {
        checked: false,
        checkedAt: null,
        checkedBy: null,
        area: reg.area || "Geral"
      };
    }
  });

  saveJSON(CHECKLIST_FILE, checklist);
  return checklist;
}

function hasPermission(member) {
  if (!member) return false;
  if (AUTH_CONFIG.USER_IDS.includes(member.id)) return true;
  return member.roles.cache.some(r => AUTH_CONFIG.ROLE_IDS.includes(r.id));
}

// ===============================
// UI BUILDERS
// ===============================
async function buildPanel(client) {
  const checklist = syncWeekData();
  const weekKey = weekKeyFromDateSP();
  const data = checklist.weeks[weekKey];
  const isSunday = getNowSP().getDay() === 0;

  const embed = new EmbedBuilder()
    .setTitle("📋 Checklist Semanal de Logs")
    .setDescription(`📆 **Semana:** ${getWeekRangeLabel(weekKey)}\n*Status das verificações de logs por responsável.*`)
    .setColor(isSunday ? "#f1c40f" : "#9b59b6")
    .setThumbnail(client.user.displayAvatarURL())
    .setTimestamp();

  const rows = [];
  const respEntries = Object.entries(data.responsaveis);

  if (respEntries.length === 0) {
    embed.addFields({ name: "ℹ️ Info", value: "Nenhum membro ativo vinculado a responsáveis no momento." });
  } else {
    for (const [respId, content] of respEntries) {
      const members = Object.entries(content.members);
      const allChecked = members.every(([_, m]) => m.checked);
      
      let fieldTitle = `👤 Resp: <@${respId}>`;
      fieldTitle += allChecked ? " ✔️ **Em dia**" : " ⚠️ **Pendências**";

      const memberLines = members.map(([mId, m]) => {
        let status = m.checked ? "✅" : (isSunday ? "🟡" : "❌");
        return `${status} <@${mId}>`;
      });

      embed.addFields({ name: fieldTitle, value: memberLines.join("\n") || "Sem membros", inline: false });
    }
  }

  const controlRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("logcheck_open_toggle")
      .setLabel("Atualizar Status")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("✅"),
    new ButtonBuilder()
      .setCustomId("logcheck_refresh")
      .setLabel("Sincronizar GI")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("🔄")
  );

  return { embeds: [embed], components: [controlRow] };
}

// ===============================
// LEMBRETES (DM)
// ===============================
async function sendSundayReminders(client) {
  const checklist = syncWeekData();
  const weekKey = weekKeyFromDateSP();
  const data = checklist.weeks[weekKey];
  const range = getWeekRangeLabel(weekKey);

  for (const [respId, content] of Object.entries(data.responsaveis)) {
    const pending = Object.entries(content.members).filter(([_, m]) => !m.checked);
    
    if (pending.length > 0) {
      try {
        const user = await client.users.fetch(respId).catch(() => null);
        if (!user) continue;

        const hasPriority = pending.some(([mId, _]) => {
          const guild = client.guilds.cache.first(); 
          const member = guild?.members.cache.get(mId);
          return member?.roles.cache.has(ROLE_PRIORITY);
        });

        const memberList = pending.map(([mId, _]) => `• <@${mId}>`).join("\n");

        const embed = new EmbedBuilder()
          .setTitle(`${hasPriority ? "🚨" : "📩"} **CHECKLIST DE LOGS PENDENTE**`)
          .setColor(hasPriority ? "#ff0000" : "#f1c40f")
          .setDescription(
            `Você ainda precisa verificar as logs de:\n\n${memberList}\n\n` +
            `📅 **Semana:** ${range}\n\n` +
            `⚠️ Verifique as logs e marque no painel no canal <#${PANEL_CONFIG.CHANNEL_ID}>.`
          )
          .setFooter({ text: "Lembrete Automático • SantaCreators" });

        await user.send({ embeds: [embed] });
      } catch (e) {
        console.warn(`[ChecklistLogs] Não foi possível enviar DM para ${respId}:`, e.message);
      }
    }
  }
}

// ===============================
// HANDLERS
// ===============================
export async function checklistOnReady(client) {
  syncWeekData();

  // Cronograma de Lembretes: Domingos 00:00, 12:00, 16:00
  cron.schedule("0 0,12,16 * * 0", () => {
    console.log("[ChecklistLogs] Executando lembretes de domingo...");
    sendSundayReminders(client);
  }, { timezone: TZ });

  // Auto-refresh do painel a cada 1 hora
  setInterval(async () => {
    const panelState = loadJSON(PANEL_CONFIG.STATE_FILE, { messageId: null });
    if (panelState.messageId) {
      const channel = await client.channels.fetch(PANEL_CONFIG.CHANNEL_ID).catch(() => null);
      const msg = await channel?.messages.fetch(panelState.messageId).catch(() => null);
      if (msg) {
        const payload = await buildPanel(client);
        await msg.edit(payload).catch(() => {});
      }
    }
  }, 60 * 60 * 1000);
}

export async function checklistHandleMessage(message, client) {
  if (!message.guild || message.author.bot) return false;
  if (message.content !== "!checklogs") return false;

  if (!hasPermission(message.member)) {
    return message.reply("❌ Permissão insuficiente.").then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
  }

  await message.delete().catch(() => {});
  
  const payload = await buildPanel(client);
  const sent = await message.channel.send(payload);
  
  saveJSON(PANEL_CONFIG.STATE_FILE, { messageId: sent.id });
  return true;
}

export async function checklistHandleInteraction(interaction, client) {
  if (!interaction.guild) return false;

  // 1. Refresh / Sync Manual
  if (interaction.isButton() && interaction.customId === "logcheck_refresh") {
    if (!hasPermission(interaction.member)) {
      return interaction.reply({ content: "❌ Sem permissão.", flags: MessageFlags.Ephemeral });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    syncWeekData();
    const payload = await buildPanel(client);
    await interaction.message.edit(payload);
    return interaction.editReply("✅ Dados sincronizados com o GI e painel atualizado.");
  }

  // 2. Abrir Menu de Seleção para Toggle
  if (interaction.isButton() && interaction.customId === "logcheck_open_toggle") {
    const checklist = loadJSON(CHECKLIST_FILE);
    const weekKey = weekKeyFromDateSP();
    const data = checklist.weeks[weekKey];
    
    const isSuper = AUTH_CONFIG.USER_IDS.includes(interaction.user.id) || 
                    interaction.member.roles.cache.has("1352408327983861844");

    let targetEntries = [];
    if (isSuper) {
      targetEntries = Object.entries(data.responsaveis);
    } else {
      if (data.responsaveis[interaction.user.id]) {
        targetEntries = [[interaction.user.id, data.responsaveis[interaction.user.id]]];
      }
    }

    if (targetEntries.length === 0) {
      return interaction.reply({ content: "❌ Você não possui membros vinculados para verificar nesta semana.", flags: MessageFlags.Ephemeral });
    }

    const options = [];
    targetEntries.forEach(([respId, content]) => {
      Object.entries(content.members).forEach(([mId, m]) => {
        options.push({
          label: `Membro: ${mId}`, 
          value: `${respId}:${mId}:${weekKey}`,
          description: `${m.checked ? "✅ Conferido" : "❌ Pendente"} | Área: ${m.area}`,
          emoji: m.checked ? "✅" : "❌"
        });
      });
    });

    if (options.length === 0) return interaction.reply({ content: "Nenhum membro encontrado.", flags: MessageFlags.Ephemeral });

    const selectMenu = {
      type: 3,
      custom_id: "logcheck_select_toggle",
      options: options.slice(0, 25),
      placeholder: "Selecione um membro para alterar o status"
    };

    return interaction.reply({
      content: "🎯 **Gerenciar Checklist**\nSelecione abaixo para marcar/desmarcar a conferência de logs.",
      components: [{ type: 1, components: [selectMenu] }],
      flags: MessageFlags.Ephemeral
    });
  }

  // 3. Processar Seleção (Toggle)
  if (interaction.isStringSelectMenu() && interaction.customId === "logcheck_select_toggle") {
    const [respId, memberId, weekKey] = interaction.values[0].split(":");
    
    const checklist = loadJSON(CHECKLIST_FILE);
    const weekData = checklist.weeks[weekKey];
    if (!weekData || !weekData.responsaveis[respId]?.members[memberId]) {
      return interaction.reply({ content: "❌ Dados expirados ou inválidos.", flags: MessageFlags.Ephemeral });
    }

    const memberState = weekData.responsaveis[respId].members[memberId];
    const oldStatus = memberState.checked;
    memberState.checked = !oldStatus;
    memberState.checkedAt = memberState.checked ? Date.now() : null;
    memberState.checkedBy = memberState.checked ? interaction.user.id : null;

    saveJSON(CHECKLIST_FILE, checklist);

    const payload = await buildPanel(client);
    await interaction.message.edit(payload).catch(() => {});

    try {
      dashEmit("checklist:toggled", {
        respId,
        memberId,
        checked: memberState.checked,
        by: interaction.user.id,
        week: weekKey
      });

      const logCh = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
      if (logCh) {
        const logEmb = new EmbedBuilder()
          .setTitle("📑 Log de Checklist")
          .setColor(memberState.checked ? "Green" : "Red")
          .setDescription([
            `**Ação:** ${memberState.checked ? "✅ Conferido" : "❌ Desmarcado"}`,
            `**Membro:** <@${memberId}>`,
            `**Responsável:** <@${respId}>`,
            `**Alterado por:** ${interaction.user}`,
            `**Semana:** ${weekKey}`
          ].join("\n"))
          .setTimestamp();
        await logCh.send({ embeds: [logEmb] });
      }
    } catch {}

    return interaction.update({
      content: `✅ Status de <@${memberId}> alterado para **${memberState.checked ? "CONFERIDO" : "PENDENTE"}**!`,
      components: [],
      flags: MessageFlags.Ephemeral
    });
  }

  return false;
}