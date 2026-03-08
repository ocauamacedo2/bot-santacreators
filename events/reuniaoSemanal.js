// d:\santacreators-main\events\reuniaoSemanal.js
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
  DESTAQUE_NOBRE: "1368422518326562967",   // Nobre (Placeholder)
  MASTER_MANAGER: "1423106042908250122",
  MASTER_EVENTOS: "1410385283542810766",
};

// Caminhos dos dados
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, ".."); // Raiz do projeto
const DATA_DIR = path.join(ROOT_DIR, "data");   // Pasta data

// ✅ Helper inteligente: Procura o arquivo na pasta data, se não achar, tenta na raiz
function resolvePath(filename) {
  const inData = path.join(DATA_DIR, filename);
  const inRoot = path.join(ROOT_DIR, filename);
  
  // Se existir na raiz (comportamento antigo de alguns módulos), usa da raiz
  if (fs.existsSync(inRoot)) return inRoot;
  // Senão, assume data (padrão novo ou arquivo ainda não criado)
  return inData;
}

const FILES = {
  STATE: path.join(DATA_DIR, "reuniao_semanal_state.json"),
  GERAL_RANK: path.join(DATA_DIR, "sc_geral_weekly_rank_state_v1.json"),
  // ✅ Usa resolvePath para achar onde os outros módulos salvaram
  MANAGER_STATS: resolvePath("reg_manager_weekly_stats.json"),
  SOCIAL_STATS: resolvePath("pay_evt_dash_stats.json"),
  ALINH_STATS: resolvePath("alinhamento_dash_state.json"),
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
    pautas: [],
    lastWinners: { geral: null, manager: null, social: null },
    panelMessageId: null,
    weekKey: null,
  };
  const data = readJSON(FILES.STATE);
  return { ...def, ...data };
}

// ================= LÓGICA DE DADOS =================
function getCurrentWeekKey() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const day = now.getDay();
  const diff = now.getDate() - day;
  const sunday = new Date(now.setDate(diff));
  return sunday.toISOString().slice(0, 10);
}

function aggregateData() {
  const wk = getCurrentWeekKey();
  
  // 1. GERAL
  const geralData = readJSON(FILES.GERAL_RANK);
  let topGeral = [];
  if (geralData?.sigByWeek?.[wk]) {
    try {
      const parsed = JSON.parse(geralData.sigByWeek[wk]);
      topGeral = parsed.list.map(([id, pts]) => ({ id, pts }));
    } catch {}
  }

  // 2. MANAGER
  const mgrData = readJSON(FILES.MANAGER_STATS);
  const mgrWeek = mgrData?.weeks?.[wk]?.approvedForManager || {};
  const topManager = Object.entries(mgrWeek)
    .map(([id, pts]) => ({ id, pts }))
    .sort((a, b) => b.pts - a.pts);

  // 3. SOCIAL
  const socData = readJSON(FILES.SOCIAL_STATS);
  const socWeek = socData?.weeks?.[wk]?.points || {};
  const topSocial = Object.entries(socWeek)
    .map(([id, pts]) => ({ id, pts }))
    .sort((a, b) => b.pts - a.pts);

  // 4. ALINHAMENTOS
  const alinhData = readJSON(FILES.ALINH_STATS);
  const alinhWeek = alinhData?.weeks?.[wk]?.counts || {};
  const topAlinh = Object.entries(alinhWeek)
    .map(([id, pts]) => ({ id, pts }))
    .sort((a, b) => b.pts - a.pts);

  return { topGeral, topManager, topSocial, topAlinh, wk };
}

function calculateWinners(data) {
  const winnerGeral = data.topGeral[0] || null;
  
  let winnerManager = data.topManager[0] || null;
  if (winnerGeral && winnerManager && winnerGeral.id === winnerManager.id) {
    winnerManager = data.topManager[1] || null;
  }

  let winnerSocial = data.topSocial[0] || null;
  if (winnerGeral && winnerSocial && winnerGeral.id === winnerSocial.id) {
    winnerSocial = data.topSocial[1] || null;
  }

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
      `# 📌 Pautas da Reunião\n${pautasTexto}\n\n` +
      `# 📊 Destaques Calculados (Prévia)\n` +
      `🏆 **Creator Destaque (Geral):** ${fmtUser(winners.winnerGeral)}\n` +
      `📞 **Master Manager:** ${fmtUser(winners.winnerManager)}\n` +
      `📢 **Master Eventos:** ${fmtUser(winners.winnerSocial)}\n\n` +
      `🧩 **Top Alinhadores:**\n${top3Alinh}\n\n` +
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
      `# 📌 Pautas Abordadas\n\n${pautasTexto}\n\n` +
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
      `## 🧩 Top Alinhadores\n${top3Alinh}\n\n` +
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
  try {
    const channel = await client.channels.fetch(ADMIN_CHANNEL_ID).catch(() => null);
    if (!channel) {
      console.error(`[ReuniaoSemanal] ❌ Canal ADMIN ${ADMIN_CHANNEL_ID} não encontrado.`);
      return false;
    }

    const state = loadState();
    const data = aggregateData();
    const winners = calculateWinners(data);

    const embed = buildAdminEmbed(state, data, winners);
    const rows = buildAdminRows();

    if (state.panelMessageId) {
      const msg = await channel.messages.fetch(state.panelMessageId).catch(() => null);
      if (msg) {
        await msg.edit({ embeds: [embed], components: rows });
        return true;
      }
    }

    const newMsg = await channel.send({ embeds: [embed], components: rows });
    state.panelMessageId = newMsg.id;
    saveState(state);
    return true;
  } catch (e) {
    console.error("[ReuniaoSemanal] Erro no updateAdminPanel:", e);
    return false;
  }
}

async function applyRoles(guild, winners, state) {
  const log = [];
  
  if (state.lastWinners) {
    const oldGeral = state.lastWinners.geral;
    const oldMgr = state.lastWinners.manager;
    const oldSoc = state.lastWinners.social;

    const remove = async (uid, roleId, name) => {
      if (!uid) return;
      const m = await guild.members.fetch(uid).catch(() => null);
      if (m) {
        await m.roles.remove(roleId).catch(() => {});
        log.push(`🔻 Removido **${name}** de <@${uid}>`);
      }
    };

    await remove(oldGeral, ROLES_REWARD.CREATOR_DESTAQUE, "Creator Destaque");
    await remove(oldMgr, ROLES_REWARD.MASTER_MANAGER, "Master Manager");
    await remove(oldSoc, ROLES_REWARD.MASTER_EVENTOS, "Master Eventos");
  }

  const add = async (w, roleId, name) => {
    if (!w?.id) return;
    const m = await guild.members.fetch(w.id).catch(() => null);
    if (m) {
      await m.roles.add(roleId).catch(() => {});
      log.push(`✅ Adicionado **${name}** para <@${w.id}>`);
      m.send(`🎉 **Parabéns!** Você foi destaque da semana como **${name}**!\nO cargo foi adicionado ao seu perfil. Continue brilhando! 🚀`).catch(() => {});
    }
  };

  await add(winners.winnerGeral, ROLES_REWARD.CREATOR_DESTAQUE, "Creator Destaque");
  await add(winners.winnerManager, ROLES_REWARD.MASTER_MANAGER, "Master Manager");
  await add(winners.winnerSocial, ROLES_REWARD.MASTER_EVENTOS, "Master Eventos");

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
  console.log("[ReuniaoSemanal] Iniciando...");
  
  // ✅ DEBUG: Mostra no console quais arquivos foram encontrados
  console.log("[ReuniaoSemanal] 🔍 Verificando fontes de dados:");
  for (const [key, filePath] of Object.entries(FILES)) {
    console.log(`  📄 ${key}: ${fs.existsSync(filePath) ? "✅ ENCONTRADO" : "❌ NÃO ENCONTRADO"} -> ${filePath}`);
  }

  await updateAdminPanel(client);
  setInterval(() => updateAdminPanel(client), 10 * 60 * 1000);
}

export async function reuniaoSemanalHandleMessage(message, client) {
  if (!message.guild || message.author.bot) return false;
  
  // ✅ COMANDO MANUAL PARA FORÇAR O PAINEL
  if (message.content === "!painelreuniao") {
    if (!ALLOWED_USERS.includes(message.author.id)) {
      await message.reply("❌ Sem permissão.");
      return true;
    }
    
    await message.reply("🔄 Tentando enviar/atualizar o painel...");
    const success = await updateAdminPanel(client);
    
    if (success) {
      await message.channel.send(`✅ Painel enviado/atualizado no canal <#${ADMIN_CHANNEL_ID}>.`);
    } else {
      await message.channel.send(`❌ Falha ao enviar. Verifique se o bot tem permissão no canal <#${ADMIN_CHANNEL_ID}> e se o ID está correto.`);
    }
    return true;
  }

  if (message.content === "!reuniao_painel") { // Alias antigo
    if (!ALLOWED_USERS.includes(message.author.id)) return false;
    const state = loadState();
    state.panelMessageId = null; 
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

  const hasPerm = 
    ALLOWED_USERS.includes(interaction.user.id) || 
    interaction.member.roles.cache.some(r => ALLOWED_ROLES.includes(r.id));

  if (!hasPerm) {
    return interaction.reply({ content: "🚫 Você não tem permissão para gerenciar a reunião.", ephemeral: true });
  }

  if (interaction.customId === "reuniao_add_pauta") {
    const modal = new ModalBuilder().setCustomId("reuniao_modal_pauta").setTitle("Adicionar Pauta");
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("pauta_title").setLabel("Título da Pauta").setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("pauta_desc").setLabel("Descrição / Detalhes").setStyle(TextInputStyle.Paragraph).setRequired(true))
    );
    await interaction.showModal(modal);
    return true;
  }

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

  if (interaction.customId === "reuniao_clear_pautas") {
    const state = loadState();
    state.pautas = [];
    saveState(state);
    await updateAdminPanel(client);
    await interaction.reply({ content: "🧹 Pautas limpas.", ephemeral: true });
    return true;
  }

  if (interaction.customId === "reuniao_refresh") {
    await interaction.deferReply({ ephemeral: true });
    await updateAdminPanel(client);
    await interaction.editReply("✅ Dados atualizados.");
    return true;
  }

  if (interaction.customId === "reuniao_publish") {
    await interaction.deferReply({ ephemeral: true });
    const state = loadState();
    const data = aggregateData();
    const winners = calculateWinners(data);
    const logs = await applyRoles(interaction.guild, winners, state);
    const publicChannel = await client.channels.fetch(PUBLIC_CHANNEL_ID).catch(() => null);
    if (publicChannel) {
      const publicEmbed = buildPublicEmbed(state, data, winners);
      await publicChannel.send({ content: "@everyone Resumo da Reunião Semanal:", embeds: [publicEmbed] });
    }
    await interaction.editReply({ content: `✅ **Reunião Publicada!**\n\n📜 **Logs de Cargos:**\n${logs.join("\n") || "Nenhuma alteração."}` });
    return true;
  }

  if (interaction.customId === "reuniao_force_roles") {
    await interaction.deferReply({ ephemeral: true });
    const state = loadState();
    const data = aggregateData();
    const winners = calculateWinners(data);
    const logs = await applyRoles(interaction.guild, winners, state);
    await interaction.editReply({ content: `⚡ **Cargos Forçados!**\n\n${logs.join("\n") || "Nenhuma alteração."}` });
    return true;
  }

  return false;
}
