// d:\bots\events\confirmacaoPresenca.js
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
import { dashEmit } from "../utils/dashHub.js";

// ================= CONFIGURAÇÃO =================
const PANEL_CHANNEL_ID = "1477800974574682242"; // Canal do Painel
const LOG_CHANNEL_ID = "1477802343407026257";   // Canal de Logs

// Arquivos de Dados
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, "../data");
const PRESENCA_FILE = path.join(DATA_DIR, "confirmacao_presenca_state.json");

// ✅ FIX: Procura o arquivo na raiz (padrão do facsSemanais.js) ou na pasta data
const FACS_FILE_ROOT = path.resolve(process.cwd(), "facs_semanais.json");
const FACS_FILE_DATA = path.join(DATA_DIR, "facs_semanais.json");

// Horários permitidos (Quinta, Sexta, Sábado das 16h às 19h)
const ALLOWED_DAYS = [4, 5, 6]; // 0=Dom, 1=Seg, ..., 4=Qui, 5=Sex, 6=Sab
const ALLOWED_HOUR_START = 16;
const ALLOWED_HOUR_END = 19; // Até 18:59

// Permissões: Quem pode confirmar (Vai/Não Vai)
const CONFIRM_ROLES = [
  "1282119104576098314", // Mkt Creators
  "1388976155830255697", // Manager Creators
  "1392678638176043029", // Equipe Manager
  "1388976314253312100", // Coord. Creators
];

// Permissões: Admin (Resetar, Gerenciar)
const ADMIN_ROLES = [
  "1352407252216184833", // Resp Lider
  "1352408327983861844", // Resp Creators
  "1262262852949905409", // Resp Influ
];
const ADMIN_USERS = [
  "1262262852949905408", // Owner
  "660311795327828008",  // Você
];

// Cores e Imagens
const COLORS = {
  PENDING: "#95a5a6", // Cinza
  YES: "#2ecc71",     // Verde
  NO: "#e74c3c",      // Vermelho
  PANEL: "#9b59b6"    // Roxo SC
};
const GIF_BANNER = "https://media.discordapp.net/attachments/1362477839944777889/1384245215249825832/standard_2rss.gif";

// ================= PERSISTÊNCIA =================
function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadState() {
  ensureDir();
  try {
    if (!fs.existsSync(PRESENCA_FILE)) return { messageId: null, statuses: {}, lastResetDate: null };
    return JSON.parse(fs.readFileSync(PRESENCA_FILE, "utf8"));
  } catch {
    return { messageId: null, statuses: {}, lastResetDate: null };
  }
}

function saveState(data) {
  ensureDir();
  fs.writeFileSync(PRESENCA_FILE, JSON.stringify(data, null, 2));
}

// Lê o arquivo do módulo facsSemanais.js para pegar a lista atualizada
function loadFacsSource() {
  try {
    // Tenta ler da raiz primeiro, depois da pasta data
    let fileToRead = FACS_FILE_ROOT;
    if (!fs.existsSync(fileToRead) && fs.existsSync(FACS_FILE_DATA)) {
      fileToRead = FACS_FILE_DATA;
    }

    if (!fs.existsSync(fileToRead)) return [];
    const data = JSON.parse(fs.readFileSync(fileToRead, "utf8"));
    const rawList = data.lista || "";
    
    // Parseia a lista "ID | Nome"
    return String(rawList || "")
      .split("\n")
      .flatMap((line) => {
        const clean = line.trim();
        if (!clean) return [];
        const matches = clean.match(/\b\d{2}\s*\|\s*.*?(?=\s+\d{2}\s*\||$)/g);
        if (matches && matches.length > 1) {
          return matches.map((m) => m.trim());
        }
        return [clean];
      })
      .filter(Boolean);
  } catch (e) {
    console.error("[ConfirmacaoPresenca] Erro ao ler facs_semanais.json:", e);
    return [];
  }
}

// ================= HELPERS =================
function getNowSP() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
}

function isWindowOpen() {
  const now = getNowSP();
  const day = now.getDay();
  const hour = now.getHours();

  // Verifica dia
  if (!ALLOWED_DAYS.includes(day)) return false;
  // Verifica hora (16:00 até 18:59)
  if (hour >= ALLOWED_HOUR_START && hour < ALLOWED_HOUR_END) return true;
  
  return false;
}

function checkPerms(member, type = "CONFIRM") {
  if (!member) return false;
  
  // Admins sempre podem tudo
  if (ADMIN_USERS.includes(member.id)) return true;
  if (member.roles.cache.some(r => ADMIN_ROLES.includes(r.id))) return true;

  if (type === "ADMIN") return false; // Se chegou aqui e queria admin, nega

  // Checa roles de confirmação
  return member.roles.cache.some(r => CONFIRM_ROLES.includes(r.id));
}

function getOrgId(orgString) {
  const match = orgString.match(/^(\d{2})\s*\|/);
  return match ? match[1] : null;
}

// Sincroniza a lista do facsSemanais com o estado local
function syncOrgs(state) {
  const sourceList = loadFacsSource();
  const todayKey = getNowSP().toISOString().slice(0, 10);

  // Se mudou o dia, reseta status (opcional, ou mantém semanal)
  // O pedido foi "toda quinta sexta sabado tem q dar pra confirmar novamente"
  // Então resetamos se a data salva for diferente de hoje E hoje for um dia de evento
  if (state.lastResetDate !== todayKey && ALLOWED_DAYS.includes(getNowSP().getDay())) {
    state.statuses = {};
    state.lastResetDate = todayKey;
  }

  // Garante que todas as orgs da fonte estejam no objeto de status
  // E remove as que não estão mais na fonte
  const currentOrgs = new Set(sourceList);
  
  // Remove antigas
  for (const org of Object.keys(state.statuses)) {
    if (!currentOrgs.has(org)) {
      delete state.statuses[org];
    }
  }

  // Adiciona novas (como pendente)
  for (const org of sourceList) {
    if (!state.statuses[org]) {
      state.statuses[org] = { status: "PENDING", by: null, time: null };
    }
  }
  
  return state;
}

// ================= UI BUILDERS =================
function buildPanelEmbed(state) {
  const orgs = Object.keys(state.statuses).sort(); // Ordem alfabética/numérica
  
  let description = `**📅 Data:** ${getNowSP().toLocaleDateString("pt-BR")}\n`;
  description += `**⏰ Horário de Confirmação:** Qui/Sex/Sáb das 16h às 19h\n\n`;
  
  const statusCount = { YES: 0, NO: 0, PENDING: 0 };

  const lines = orgs.map(org => {
    const info = state.statuses[org];
    statusCount[info.status]++;
    
    let icon = "⏳";
    if (info.status === "YES") icon = "✅";
    if (info.status === "NO") icon = "❌";
    
    // Formata: ⏳ 08 | Caribe (por @User)
    let line = `\`${icon}\` **${org}**`;
    if (info.by) line += ` — <@${info.by}>`;
    return line;
  });

  // Divide em chunks se for muito grande (simples aqui, mas ideal é paginação se crescer muito)
  const chunks = [];
  let currentChunk = "";
  
  for (const line of lines) {
    if (currentChunk.length + line.length > 3800) {
      chunks.push(currentChunk);
      currentChunk = "";
    }
    currentChunk += line + "\n";
  }
  if (currentChunk) chunks.push(currentChunk);

  const embed = new EmbedBuilder()
    .setColor(COLORS.PANEL)
    .setTitle("📋 Confirmação de Presença — Eventos")
    .setDescription(description + (chunks[0] || "_Nenhuma ORG registrada na semana._"))
    .addFields(
      { name: "Resumo", value: `✅ **${statusCount.YES}** Confirmados\n❌ **${statusCount.NO}** Ausentes\n⏳ **${statusCount.PENDING}** Pendentes`, inline: false }
    )
    .setImage(GIF_BANNER)
    .setFooter({ text: "SantaCreators • Sistema de Presença" })
    .setTimestamp();

  return embed;
}

function buildPanelRows() {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("presenca_confirmar")
      .setLabel("✅ Confirmar Presença (Vai)")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("presenca_negar")
      .setLabel("❌ Informar Ausência (Não Vai)")
      .setStyle(ButtonStyle.Danger)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("presenca_admin_reset")
      .setLabel("🔄 Resetar Dia (Admin)")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("presenca_admin_remove")
      .setLabel("🗑️ Resetar Org Específica")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("presenca_refresh")
      .setLabel("🔃 Atualizar Painel")
      .setStyle(ButtonStyle.Primary)
  );

  return [row1, row2];
}

// ================= LOGIC =================
async function updatePanel(client) {
  let state = loadState();
  state = syncOrgs(state);
  saveState(state);

  const channel = await client.channels.fetch(PANEL_CHANNEL_ID).catch(() => null);
  if (!channel) return;

  const embed = buildPanelEmbed(state);
  const components = buildPanelRows();

  if (state.messageId) {
    const msg = await channel.messages.fetch(state.messageId).catch(() => null);
    if (msg) {
      await msg.edit({ embeds: [embed], components }).catch(() => {});
      return;
    }
  }

  const newMsg = await channel.send({ embeds: [embed], components }).catch(() => null);
  if (newMsg) {
    state.messageId = newMsg.id;
    saveState(state);
  }
}

async function logAction(client, interaction, action, orgName, extra = "") {
  const channel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
  if (!channel) return;

  const color = action === "CONFIRMOU" ? COLORS.YES : action === "NEGOU" ? COLORS.NO : COLORS.PENDING;

  const embed = new EmbedBuilder()
    .setTitle(`📝 Log de Presença: ${action}`)
    .setColor(color)
    .setThumbnail(interaction.user.displayAvatarURL())
    .addFields(
      { name: "👤 Autor", value: `${interaction.user} (\`${interaction.user.id}\`)`, inline: true },
      { name: "🏢 Organização", value: `**${orgName}**`, inline: true },
      { name: "🕒 Hora", value: `<t:${Math.floor(Date.now() / 1000)}:T>`, inline: true }
    )
    .setFooter({ text: "SantaCreators • Logs" })
    .setTimestamp();

  if (extra) embed.setDescription(extra);

  // Botão para desfazer (resetar status dessa org)
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`presenca_undo_${Buffer.from(orgName).toString('base64')}`) // Encode org name to safe ID
      .setLabel("↩️ Desfazer Ação")
      .setStyle(ButtonStyle.Secondary)
  );

  await channel.send({ embeds: [embed], components: [row] });
}

// ================= EXPORTS =================
export async function confirmacaoPresencaOnReady(client) {
  await updatePanel(client);
  
  // Auto-refresh a cada 5 min para garantir sincronia e virada de dia
  setInterval(() => updatePanel(client), 5 * 60 * 1000);
}

export async function confirmacaoPresencaHandleInteraction(interaction, client) {
  if (!interaction.guild) return false;

  // 1. Botão Refresh
  if (interaction.isButton() && interaction.customId === "presenca_refresh") {
    await interaction.deferReply({ ephemeral: true });
    await updatePanel(client);
    await interaction.editReply("✅ Painel sincronizado e atualizado.");
    return true;
  }

  // 2. Botões de Ação (Confirmar/Negar)
  if (interaction.isButton() && (interaction.customId === "presenca_confirmar" || interaction.customId === "presenca_negar")) {
    // Checa permissão
    if (!checkPerms(interaction.member, "CONFIRM")) {
      return interaction.reply({ content: "🚫 Você não tem permissão para alterar presenças.", ephemeral: true });
    }

    // Checa horário (Bypass para Admins)
    if (!isWindowOpen() && !checkPerms(interaction.member, "ADMIN")) {
      return interaction.reply({ content: "⏳ O sistema só aceita confirmações **Quinta, Sexta e Sábado das 16h às 19h**.", ephemeral: true });
    }

    const isConfirm = interaction.customId === "presenca_confirmar";
    const actionLabel = isConfirm ? "Confirmar" : "Negar";

    const modal = new ModalBuilder()
      .setCustomId(`modal_presenca_${isConfirm ? 'YES' : 'NO'}`)
      .setTitle(` Presença`);

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("org_input")
          .setLabel("ID ou Nome da ORG")
          .setPlaceholder("Ex: 08 ou Caribe")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );

    await interaction.showModal(modal);
    return true;
  }

  // 3. Modal Submit (Processar Confirmação)
  if (interaction.isModalSubmit() && interaction.customId.startsWith("modal_presenca_")) {
    await interaction.deferReply({ ephemeral: true });

    const status = interaction.customId.split("_")[2]; // YES ou NO
    const input = interaction.fields.getTextInputValue("org_input").trim().toLowerCase();
    
    let state = loadState();
    state = syncOrgs(state); // Garante sync antes de buscar

    // Busca a ORG (pelo ID ou Nome)
    const orgKey = Object.keys(state.statuses).find(key => {
      const id = getOrgId(key);
      if (id && id === input) return true; // Match exato de ID
      return key.toLowerCase().includes(input); // Match parcial de nome
    });

    if (!orgKey) {
      return interaction.editReply("❌ ORG não encontrada na lista da semana. Verifique se ela foi registrada no menu de FACs.");
    }

    // Atualiza estado
    state.statuses[orgKey] = {
      status: status,
      by: interaction.user.id,
      time: Date.now()
    };
    saveState(state);

    // Atualiza painel
    await updatePanel(client);

    // Log e Pontos
    const actionTxt = status === "YES" ? "CONFIRMOU" : "NEGOU";
    await logAction(client, interaction, actionTxt, orgKey);

    if (status === "YES") {
      // ✅ Emite evento para pontuação (GeralDash e WeeklyRanking escutam isso)
      try {
        dashEmit("presenca:confirmada", {
          userId: interaction.user.id,
          org: orgKey,
          __at: Date.now()
        });
      } catch (e) {
        console.error("Erro ao emitir dashEmit:", e);
      }
      await interaction.editReply(`✅ Presença de **** confirmada! (+1 ponto computado)`);
    } else {
      await interaction.editReply(`❌ Ausência de **** registrada.`);
    }

    return true;
  }

  // 4. Botão Admin Reset Dia
  if (interaction.isButton() && interaction.customId === "presenca_admin_reset") {
    if (!checkPerms(interaction.member, "ADMIN")) {
      return interaction.reply({ content: "🚫 Apenas admins podem resetar o dia.", ephemeral: true });
    }

    let state = loadState();
    state.statuses = {}; // Limpa tudo
    state.lastResetDate = getNowSP().toISOString().slice(0, 10); // Marca como resetado hoje
    saveState(state);
    
    // Re-sincroniza para trazer as orgs como PENDING
    await updatePanel(client);

    await logAction(client, interaction, "RESET GERAL", "TODAS", "O painel foi resetado manualmente.");
    return interaction.reply({ content: "✅ Painel resetado para o dia de hoje.", ephemeral: true });
  }

  // 5. Botão Admin Remover/Resetar Específico
  if (interaction.isButton() && interaction.customId === "presenca_admin_remove") {
    if (!checkPerms(interaction.member, "ADMIN")) {
      return interaction.reply({ content: "🚫 Sem permissão.", ephemeral: true });
    }

    const modal = new ModalBuilder()
      .setCustomId("modal_presenca_reset_one")
      .setTitle("Resetar Status de ORG");

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("org_input")
          .setLabel("ID ou Nome da ORG para resetar")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );

    await interaction.showModal(modal);
    return true;
  }

  // 6. Modal Reset Específico
  if (interaction.isModalSubmit() && interaction.customId === "modal_presenca_reset_one") {
    const input = interaction.fields.getTextInputValue("org_input").trim().toLowerCase();
    let state = loadState();
    
    const orgKey = Object.keys(state.statuses).find(key => {
      const id = getOrgId(key);
      if (id && id === input) return true;
      return key.toLowerCase().includes(input);
    });

    if (!orgKey) {
      return interaction.reply({ content: "❌ ORG não encontrada.", ephemeral: true });
    }

    // Reseta para PENDING
    state.statuses[orgKey] = { status: "PENDING", by: null, time: null };
    saveState(state);
    await updatePanel(client);

    await logAction(client, interaction, "RESET UNITÁRIO", orgKey);
    return interaction.reply({ content: `✅ Status de **** resetado para Pendente.`, ephemeral: true });
  }

  // 7. Botão Undo (Log)
  if (interaction.isButton() && interaction.customId.startsWith("presenca_undo_")) {
    if (!checkPerms(interaction.member, "ADMIN")) {
      return interaction.reply({ content: "🚫 Apenas admins podem desfazer ações pelo log.", ephemeral: true });
    }

    const encodedOrg = interaction.customId.replace("presenca_undo_", "");
    const orgKey = Buffer.from(encodedOrg, 'base64').toString('utf-8');

    let state = loadState();
    if (state.statuses[orgKey]) {
      state.statuses[orgKey] = { status: "PENDING", by: null, time: null };
      saveState(state);
      await updatePanel(client);
      return interaction.reply({ content: `✅ Ação desfeita. **** voltou para Pendente.`, ephemeral: true });
    } else {
      return interaction.reply({ content: "❌ Essa ORG não está mais na lista ativa.", ephemeral: true });
    }
  }

  return false;
}
