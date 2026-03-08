// /application/events/reuniaoSemanal.js
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionsBitField,
} from "discord.js";

// ================= CONFIGURAÇÃO =================
const ADMIN_CHANNEL_ID = "1387864036259004436"; // Canal Robusto (Resp)
const PUBLIC_CHANNEL_ID = "1469726935247487078"; // Canal Resumo (Público)

// Cargos de Gestão (Permissão para mexer no painel)
const ALLOWED_ROLES = [
  "1262262852949905408", // Owner
  "1352408327983861844", // Resp Creators
  "1262262852949905409", // Resp Influ
  "1352407252216184833", // Resp Lider
];
const ALLOWED_USERS = ["660311795327828008", "1262262852949905408"];

// Cargos de Premiação (IDs para setar automaticamente)
const ROLES_REWARD = {
  CREATOR_DESTAQUE: "1368422518326562967", // Santa Creators
  DESTAQUE_NOBRE: "1368422518326562967",   // Nobre (Placeholder, ajuste se for outro ID)
  MASTER_MANAGER: "1423106042908250122",
  MASTER_EVENTOS: "1410385283542810766",
};

// Caminhos dos dados (Lê dos outros módulos)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, "../data");

const FILES = {
  STATE: path.join(DATA_DIR, "reuniao_semanal_state.json"),
  GERAL_RANK: path.join(DATA_DIR, "sc_geral_weekly_rank_state_v1.json"),
  MANAGER_STATS: path.join(DATA_DIR, "reg_manager_weekly_stats.json"), // GraficoManagers
  SOCIAL_STATS: path.join(DATA_DIR, "pay_evt_dash_stats.json"),        // PayEvtDash
  ALINH_STATS: path.join(DATA_DIR, "alinhamento_dash_state.json"),     // AlinhamentoDash
};

// ================= HELPERS DE ARQUIVO =================
function readJSON(file) {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function saveState(data) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILES.STATE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("[ReuniaoSemanal] Erro ao salvar state:", e);
  }
}

function loadState() {
  const def = {
    pautas: [], // [{ title, desc }]
    lastWinners: { geral: null, manager: null, social: null }, // { userId, date }
    panelMessageId: null,
    weekKey: null,
  };
  const data = readJSON(FILES.STATE);
  return { ...def, ...data };
}

// ================= LÓGICA DE DADOS =================

// Pega a semana atual (Domingo)
function getCurrentWeekKey() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const day = now.getDay();
  const diff = now.getDate() - day;
  const sunday = new Date(now.setDate(diff));
  return sunday.toISOString().slice(0, 10);
}

// Agrega dados de todos os módulos
function aggregateData() {
  const wk = getCurrentWeekKey();
  
  // 1. GERAL (scGeralWeeklyRanking)
  const geralData = readJSON(FILES.GERAL_RANK);
  let topGeral = [];
  if (geralData?.sigByWeek?.[wk]) {
    try {
      const parsed = JSON.parse(geralData.sigByWeek[wk]);
      // list é [[id, points], ...]
      topGeral = parsed.list.map(([id, pts]) => ({ id, pts }));
    } catch {}
  }

  // 2. MANAGER (GraficoManagers)
  const mgrData = readJSON(FILES.MANAGER_STATS);
  const mgrWeek = mgrData?.weeks?.[wk]?.approvedForManager || {};
  const topManager = Object.entries(mgrWeek)
    .map(([id, pts]) => ({ id, pts }))
    .sort((a, b) => b.pts - a.pts);

  // 3. SOCIAL (PayEvtDash)
  const socData = readJSON(FILES.SOCIAL_STATS);
  const socWeek = socData?.weeks?.[wk]?.points || {};
  const topSocial = Object.entries(socWeek)
    .map(([id, pts]) => ({ id, pts }))
    .sort((a, b) => b.pts - a.pts);

  // 4. ALINHAMENTOS (AlinhamentoDash)
  const alinhData = readJSON(FILES.ALINH_STATS);
  const alinhWeek = alinhData?.weeks?.[wk]?.counts || {};
  const topAlinh = Object.entries(alinhWeek)
    .map(([id, pts]) => ({ id, pts }))
    .sort((a, b) => b.pts - a.pts);

  return { topGeral, topManager, topSocial, topAlinh, wk };
}

// Calcula vencedores com resolução de conflito
function calculateWinners(data) {
  // Regra: Se Top 1 Geral for o mesmo do Top 1 Específico, o Específico vai pro 2º lugar
  
  const winnerGeral = data.topGeral[0] || null;
  
  let winnerManager = data.topManager[0] || null;
  if (winnerGeral && winnerManager && winnerGeral.id === winnerManager.id) {
    winnerManager = data.topManager[1] || null; // Passa pro 2º
  }

  let winnerSocial = data.topSocial[0] || null;
  if (winnerGeral && winnerSocial && winnerGeral.id === winnerSocial.id) {
    winnerSocial = data.topSocial[1] || null; // Passa pro 2º
  }

  // Se por acaso o 2º de Manager for o mesmo do 2º de Social (raro, mas possível), mantém.
  // A regra principal é: Creator Destaque (Geral) é o cargo maior.

  return { winnerGeral, winnerManager, winnerSocial };
}

// ================= UI BUILDERS =================

function buildAdminEmbed(state, data, winners) {
  const pautasTexto = state.pautas.length > 0
    ? state.pautas.map((p, i) => `**${i + 1} - ${p.title}**\n${p.desc}`).join("\n\n")
    : "_Nenhuma pauta registrada ainda._";

  const fmtUser = (w) => w ? `<@${w.id}> (**${w.pts}** pts)` : "—";

  const top3Alinh = data.topAlinh.slice(0, 3).map((x, i) => `\`${i+1}.\` <@${x.id}> (${x.pts})`).join("\n") || "—";

  return new EmbedBuilder()
    .setTitle("📢 Painel de Reunião Semanal (Admin)")
    .setColor("#2b2d31")
    .setDescription(
      `**Semana:** ${data.wk}\n\n` +
      `# 📌 Pautas da Reunião\n\n\n` +
      `# 📊 Destaques Calculados (Prévia)\n` +
      `🏆 **Creator Destaque (Geral):** ${fmtUser(winners.winnerGeral)}\n` +
      `📞 **Master Manager:** ${fmtUser(winners.winnerManager)}\n` +
      `📢 **Master Eventos:** ${fmtUser(winners.winnerSocial)}\n\n` +
      `🧩 **Top Alinhadores:**\n\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `**⚠️ Instruções Pós-Reunião:**\n` +
      `1. Identificar quem subiu/desceu e ajustar permissões.\n` +
      `2. Fazer alinhamento individual.\n` +
      `3. Resolver pendências.\n` +
      `4. **Clicar em "✅ Publicar & Aplicar Cargos"** para oficializar.`
    )
    .setFooter({ text: "Somente Responsáveis podem ver e editar isso." })
    .setTimestamp();
}

function buildPublicEmbed(state, data, winners) {
  const pautasTexto = state.pautas.length > 0
    ? state.pautas.map((p, i) => `📌 **${p.title}**\n${p.desc}`).join("\n\n")
    : "—";

  const fmtUser = (w) => w ? `<@${w.id}>` : "—";
  const top3Alinh = data.topAlinh.slice(0, 3).map((x, i) => `\`${i+1}.\` <@${x.id}> (${x.pts})`).join("\n") || "—";

  return new EmbedBuilder()
    .setTitle("📝 Resumo da Reunião Semanal")
    .setColor("#9b59b6")
    .setImage("https://media.discordapp.net/attachments/1362477839944777889/1384245215249825832/standard_2rss.gif")
    .setDescription(
      `Confira os pontos abordados e os destaques da semana!\n\n` +
      `# 📌 Pautas Abordadas\n\n\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `# ⭐ Destaques da Semana\n\n` +
      `## 🥇 Top 1 Geral (Creator Destaque)\n` +
      `> ${fmtUser(winners.winnerGeral)}\n` +
      `*Recebe: VIP Evento (7 dias) + Cargo Creator Destaque*\n\n` +
      `## 📞 Master de Manager (Mais ORGs)\n` +
      `> ${fmtUser(winners.winnerManager)}\n` +
      `*Recebe: VIP Evento (7 dias) + Cargo Master de Manager*\n\n` +
      `## 📢 Master de Eventos (Social Media)\n` +
      `> ${fmtUser(winners.winnerSocial)}\n` +
      `*Recebe: VIP Evento (7 dias) + Cargo Master de Eventos*\n\n` +
      `## 🧩 Top Alinhadores\n\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `*Parabéns a todos pelo empenho! Vamos com tudo para a próxima semana.* 🚀`
    )
    .setFooter({ text: "SantaCreators • Reunião Semanal" })
    .setTimestamp();
}

function buildAdminRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("reuniao_add_pauta").setLabel("➕ Adicionar Pauta").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("reuniao_clear_pautas").setLabel("🧹 Limpar Pautas").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("reuniao_refresh").setLabel("🔄 Atualizar Dados").setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("reuniao_publish").setLabel("✅ Publicar & Aplicar Cargos").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("reuniao_force_roles").setLabel("⚡ Forçar Set de Cargos").setStyle(ButtonStyle.Danger)
    )
  ];
}

// ================= LOGIC =================

async function updateAdminPanel(client) {
  const channel = await client.channels.fetch(ADMIN_CHANNEL_ID).catch(() => null);
  if (!channel) return;

  const state = loadState();
  const data = aggregateData();
  const winners = calculateWinners(data);

  const embed = buildAdminEmbed(state, data, winners);
  const rows = buildAdminRows();

  if (state.panelMessageId) {
    const msg = await channel.messages.fetch(state.panelMessageId).catch(() => null);
    if (msg) {
      await msg.edit({ embeds: [embed], components: rows });
      return;
    }
  }

  const newMsg = await channel.send({ embeds: [embed], components: rows });
  state.panelMessageId = newMsg.id;
  saveState(state);
}

async function applyRoles(guild, winners, state) {
  const log = [];
  
  // 1. Remove cargos dos vencedores ANTERIORES
  if (state.lastWinners) {
    const oldGeral = state.lastWinners.geral;
    const oldMgr = state.lastWinners.manager;
    const oldSoc = state.lastWinners.social;

    const remove = async (uid, roleId, name) => {
      if (!uid) return;
      const m = await guild.members.fetch(uid).catch(() => null);
      if (m) {
        await m.roles.remove(roleId).catch(() => {});
        log.push(`🔻 Removido **** de <@>`);
      }
    };

    await remove(oldGeral, ROLES_REWARD.CREATOR_DESTAQUE, "Creator Destaque");
    await remove(oldMgr, ROLES_REWARD.MASTER_MANAGER, "Master Manager");
    await remove(oldSoc, ROLES_REWARD.MASTER_EVENTOS, "Master Eventos");
  }

  // 2. Adiciona cargos aos NOVOS vencedores
  const add = async (w, roleId, name) => {
    if (!w?.id) return;
    const m = await guild.members.fetch(w.id).catch(() => null);
    if (m) {
      await m.roles.add(roleId).catch(() => {});
      log.push(`✅ Adicionado **** para <@${w.id}>`);
      
      // DM de Parabéns
      m.send(`🎉 **Parabéns!** Você foi destaque da semana como ****!\nO cargo foi adicionado ao seu perfil. Continue brilhando! 🚀`).catch(() => {});
    }
  };

  await add(winners.winnerGeral, ROLES_REWARD.CREATOR_DESTAQUE, "Creator Destaque");
  await add(winners.winnerManager, ROLES_REWARD.MASTER_MANAGER, "Master Manager");
  await add(winners.winnerSocial, ROLES_REWARD.MASTER_EVENTOS, "Master Eventos");

  // 3. Atualiza state com os novos vencedores
  state.lastWinners = {
    geral: winners.winnerGeral?.id || null,
    manager: winners.winnerManager?.id || null,
    social: winners.winnerSocial?.id || null
  };
  saveState(state);

  return log;
}

// ================= EXPORTS =================

export async function reuniaoSemanalOnReady(client) {
  await updateAdminPanel(client);

  // Scheduler: Sábado 19:00 (Auto-Publish opcional, ou apenas lembrete)
  // Aqui vamos apenas garantir que o painel esteja lá.
  setInterval(() => updateAdminPanel(client), 10 * 60 * 1000); // Atualiza a cada 10 min
}

export async function reuniaoSemanalHandleMessage(message, client) {
  if (!message.guild || message.author.bot) return false;
  
  // Comando de emergência para recriar painel
  if (message.content === "!reuniao_painel") {
    if (!ALLOWED_USERS.includes(message.author.id)) return false;
    
    const state = loadState();
    state.panelMessageId = null; // Força recriar
    saveState(state);
    await updateAdminPanel(client);
    message.reply("✅ Painel recriado.").then(m => setTimeout(() => m.delete(), 5000));
    return true;
  }
  return false;
}

export async function reuniaoSemanalHandleInteraction(interaction, client) {
  if (!interaction.guild) return false;
  if (!interaction.customId?.startsWith("reuniao_")) return false;

  // Verifica permissão
  const hasPerm = 
    ALLOWED_USERS.includes(interaction.user.id) || 
    interaction.member.roles.cache.some(r => ALLOWED_ROLES.includes(r.id));

  if (!hasPerm) {
    return interaction.reply({ content: "🚫 Você não tem permissão para gerenciar a reunião.", ephemeral: true });
  }

  // 1. Adicionar Pauta (Modal)
  if (interaction.customId === "reuniao_add_pauta") {
    const modal = new ModalBuilder()
      .setCustomId("reuniao_modal_pauta")
      .setTitle("Adicionar Pauta");

    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("pauta_title").setLabel("Título da Pauta").setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("pauta_desc").setLabel("Descrição / Detalhes").setStyle(TextInputStyle.Paragraph).setRequired(true))
    );

    await interaction.showModal(modal);
    return true;
  }

  // 2. Submit Pauta
  if (interaction.isModalSubmit() && interaction.customId === "reuniao_modal_pauta") {
    const title = interaction.fields.getTextInputValue("pauta_title");
    const desc = interaction.fields.getTextInputValue("pauta_desc");

    const state = loadState();
    state.pautas.push({ title, desc });
    saveState(state);

    await updateAdminPanel(client);
    await interaction.reply({ content: "✅ Pauta adicionada!", ephemeral: true });
    return true;
  }

  // 3. Limpar Pautas
  if (interaction.customId === "reuniao_clear_pautas") {
    const state = loadState();
    state.pautas = [];
    saveState(state);
    await updateAdminPanel(client);
    await interaction.reply({ content: "🧹 Pautas limpas.", ephemeral: true });
    return true;
  }

  // 4. Refresh
  if (interaction.customId === "reuniao_refresh") {
    await interaction.deferReply({ ephemeral: true });
    await updateAdminPanel(client);
    await interaction.editReply("✅ Dados atualizados.");
    return true;
  }

  // 5. Publicar & Aplicar Cargos
  if (interaction.customId === "reuniao_publish") {
    await interaction.deferReply({ ephemeral: true });

    const state = loadState();
    const data = aggregateData();
    const winners = calculateWinners(data);

    // Aplica cargos
    const logs = await applyRoles(interaction.guild, winners, state);

    // Envia resumo público
    const publicChannel = await client.channels.fetch(PUBLIC_CHANNEL_ID).catch(() => null);
    if (publicChannel) {
      const publicEmbed = buildPublicEmbed(state, data, winners);
      await publicChannel.send({ content: "@everyone Resumo da Reunião Semanal:", embeds: [publicEmbed] });
    }

    // Limpa pautas após publicar (opcional, mas recomendado)
    // state.pautas = []; 
    // saveState(state);
    // await updateAdminPanel(client);

    await interaction.editReply({ 
      content: `✅ **Reunião Publicada!**\n\n📜 **Logs de Cargos:**\n${logs.join("\n") || "Nenhuma alteração."}` 
    });
    return true;
  }

  // 6. Forçar Cargos (Sem publicar)
  if (interaction.customId === "reuniao_force_roles") {
    await interaction.deferReply({ ephemeral: true });
    const state = loadState();
    const data = aggregateData();
    const winners = calculateWinners(data);
    
    const logs = await applyRoles(interaction.guild, winners, state);
    
    await interaction.editReply({ 
      content: `⚡ **Cargos Forçados!**\n\n${logs.join("\n") || "Nenhuma alteração."}` 
    });
    return true;
  }

  return false;
}
