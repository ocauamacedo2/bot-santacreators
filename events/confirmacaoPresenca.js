// d:\bots\events\confirmacaoPresenca.js
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
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
import { resolveLogChannel } from "./channelResolver.js";

// ================= CONFIGURAÇÃO =================
const PANEL_CHANNEL_ID = "1477800974574682242"; // Canal do Painel
const LOG_CHANNEL_ID = "1486006866046615682";   // Canal de Logs

// Arquivos de Dados
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, "../data");
const PRESENCA_FILE = path.join(DATA_DIR, "confirmacao_presenca_state.json");
const PRESENCA_UNDO_FILE = path.join(DATA_DIR, "confirmacao_presenca_undo.json");

// ✅ FIX: Procura o arquivo na raiz (padrão do facsSemanais.js) ou na pasta data
const FACS_FILE_ROOT = path.resolve(process.cwd(), "facs_semanais.json");
const FACS_FILE_DATA = path.join(DATA_DIR, "facs_semanais.json");

// Horários permitidos (Quinta, Sexta, Sábado das 19h às 21h)
const ALLOWED_DAYS = [4, 5, 6]; // 0=Dom, 1=Seg, ..., 4=Qui, 5=Sex, 6=Sab

// Permissões: Quem pode confirmar (Vai/Não Vai)
const CONFIRM_ROLES = [
  "1282119104576098314", // Mkt Creators
  "1388976155830255697", // Manager Creators
  "1392678638176043029", // Equipe Manager
  "1388976314253312100", // Coord. Creators
];

// Permissões: Admin (Resetar, Gerenciar)
const ADMIN_ROLES = [
  "1352408327983861844", // resp creators
  "1262262852949905409", // resp influ
  "1262262852949905408", // owner (cargo)
];
const ADMIN_USERS = [
  "660311795327828008", // eu
  "1262262852949905408", // owner (id)
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
    if (!fs.existsSync(PRESENCA_FILE)) return { 
      messageId: null, 
      statuses: {}, 
      lastResetDate: null, 
      activeWindow: 1,
      lastWeekKey: null 
    };
    const data = JSON.parse(fs.readFileSync(PRESENCA_FILE, "utf8"));
    // ✅ Garante que o campo lastWeekKey exista para o reset offline-safe
    if (!data.lastWeekKey) data.lastWeekKey = null;
    return data;
  } catch {
    return { messageId: null, statuses: {}, lastResetDate: null, activeWindow: 1, lastWeekKey: null };
  }
}

function saveState(data) {
  ensureDir();
  fs.writeFileSync(PRESENCA_FILE, JSON.stringify(data, null, 2));
}

function loadUndoStore() {
  ensureDir();

  try {
    if (!fs.existsSync(PRESENCA_UNDO_FILE)) return {};
    return JSON.parse(fs.readFileSync(PRESENCA_UNDO_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveUndoStore(data) {
  ensureDir();
  fs.writeFileSync(PRESENCA_UNDO_FILE, JSON.stringify(data, null, 2));
}

function createUndoEntry(payload) {
  const store = loadUndoStore();
  const token = crypto.randomUUID();

  store[token] = {
    ...payload,
    createdAt: Date.now()
  };

  saveUndoStore(store);
  return token;
}

function consumeUndoEntry(token) {
  const store = loadUndoStore();
  const entry = store[token];

  if (!entry) return null;

  delete store[token];
  saveUndoStore(store);

  return entry;
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

// ✅ Função para calcular a semana (Sincronizada com FACs e RM)
function getCurrentWeekKeySP() {
  const now = getNowSP();
  const day = now.getDay(); // 0=Dom

  // Início da semana = Domingo 00:00
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - day);
  return sunday.toISOString().slice(0, 10); // YYYY-MM-DD
}

// ================= HELPERS =================
function getNowSP() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
}

function isWindowOpen(state) {
  const now = getNowSP();
  const day = now.getDay();
  const hour = now.getHours();

  // Verifica dia
  if (!ALLOWED_DAYS.includes(day)) return false;

  // FIX: Na sexta-feira (dia 5), o horário é fixo das 19h às 21h
  if (day === 5) {
    if (hour >= 19 && hour < 21) {
      return true;
    }
    return false;
  }

  // Para outros dias permitidos (Quinta, Sábado), usa a janela ativa
  const window = state.activeWindow || 1;

  // Janela 1: 19h às 21h | Janela 2: 22h às 00h
  if (window === 1) {
    if (hour >= 19 && hour < 21) return true;
  } else {
    if (hour >= 22 && hour < 24) return true;
  }

  return false;
}

function checkPerms(member, type = "CONFIRM") {
  if (!member) return false;
  
  const userId = member.id;
  const roles = member.roles?.cache;

  // Admins sempre podem tudo
  if (ADMIN_USERS.includes(userId)) return true;
  if (roles && roles.some(r => ADMIN_ROLES.includes(r.id))) return true;

  if (type === "ADMIN") return false; // Se chegou aqui e queria admin, nega

  // Checa roles de confirmação
  return roles && roles.some(r => CONFIRM_ROLES.includes(r.id));
}

function getOrgId(orgString) {
  const match = orgString.match(/^(\d{2})\s*\|/);
  return match ? match[1] : null;
}

function getOrgNameOnly(orgString) {
  const raw = String(orgString || "").trim();
  const parts = raw.split("|").map(p => p.trim()).filter(Boolean);
  if (parts.length >= 2) return parts.slice(1).join(" | ").trim();
  return raw;
}

function normalizeOrgName(orgString) {
  return getOrgNameOnly(orgString)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

function isPresenceBypass(member) {
  if (!member) return false;

  const userId = member.id;
  const roles = member.roles?.cache;

  // Você
  if (userId === "660311795327828008") return true;

  // Owner por ID ou cargo
  if (userId === "1262262852949905408") return true;
  if (roles && roles.some(r => r.id === "1262262852949905408")) return true;

  return false;
}

// Sincroniza a lista do facsSemanais com o estado local
function syncOrgs(state) {
  const now = getNowSP();
  const todayKey = now.toISOString().slice(0, 10);
  const weekKey = getCurrentWeekKeySP();
  const day = now.getDay();

  if (!state.statuses || typeof state.statuses !== "object") {
    state.statuses = {};
  }

  // ✅ 1. Reset Semanal (Domingo 00:00 ou Mudança de Semana no Boot)
  // Se entramos em uma nova semana, limpa TUDO imediatamente.
  if (state.lastWeekKey !== weekKey) {
    console.log(`[ConfirmacaoPresenca] Mudança de semana detectada (${weekKey}). Zerando painel.`);
    state.statuses = {};
    state.lastWeekKey = weekKey;
    state.lastResetDate = todayKey;
  }

  // ✅ 2. Reset Diário (Quinta, Sexta, Sábado)
  // Permite que as orgs confirmem presença novamente em cada dia de evento diferente.
  if (state.lastResetDate !== todayKey && ALLOWED_DAYS.includes(day)) {
    console.log(`[ConfirmacaoPresenca] Reset diário para novo dia de evento: ${todayKey}`);
    state.statuses = {};
    state.lastResetDate = todayKey;
  }

  const sourceList = loadFacsSource();

  // ✅ Guarda confirmações antigas pelo NOME da ORG, ignorando a família ativa/ID.
  // Exemplo: "47 | Tropa do Cold" e "48 | Tropa do Cold" viram a mesma chave.
  const oldStatusByOrgName = new Map();

  for (const [oldOrgKey, oldInfo] of Object.entries(state.statuses)) {
    const orgNameKey = normalizeOrgName(oldOrgKey);
    if (!orgNameKey) continue;

    if (oldInfo && oldInfo.status && oldInfo.status !== "PENDING") {
      oldStatusByOrgName.set(orgNameKey, {
        ...oldInfo,
        previousOrgKey: oldOrgKey
      });
    }
  }

  const nextStatuses = {};

  for (const org of sourceList) {
    const orgNameKey = normalizeOrgName(org);

    if (state.statuses[org]) {
      nextStatuses[org] = state.statuses[org];
      continue;
    }

    if (orgNameKey && oldStatusByOrgName.has(orgNameKey)) {
      nextStatuses[org] = oldStatusByOrgName.get(orgNameKey);
      continue;
    }

    nextStatuses[org] = { status: "PENDING", by: null, time: null };
  }

  state.statuses = nextStatuses;

  return state;
}

// ================= UI BUILDERS =================
function buildPanelEmbed(state) {
  const orgs = Object.keys(state.statuses).sort(); // Ordem alfabética/numérica
  
  const window = state.activeWindow || 1;
  const windowTxt = window === 1 ? "19h às 21h" : "22h às 00h";

  let description = `**📅 Data:** ${getNowSP().toLocaleDateString("pt-BR")}\n`;
  
  const now = getNowSP();
  const day = now.getDay();
  if (day === 5) { // Friday
    description += `**⏰ Horário de Confirmação:** Sexta das 19h às 21h (fixo)\n\n`;
  } else {
    description += `**⏰ Horário de Confirmação:** Qui/Sáb das ${windowTxt}\n\n`;
  }
  
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
      .setCustomId("presenca_toggle_window")
      .setLabel("🕒 Alternar Horário (Admin)")
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

  if (msg && msg.author?.id === client.user.id) {
    await msg.edit({ embeds: [embed], components }).catch(() => {});
    return;
  }

  if (msg && msg.author?.id !== client.user.id) {
    console.warn("[ConfirmacaoPresenca] Painel antigo é de outro bot. Recriando com o bot atual.");
  }

  state.messageId = null;
  saveState(state);
}

const newMsg = await channel.send({ embeds: [embed], components }).catch(() => null);
if (newMsg) {
  state.messageId = newMsg.id;
  saveState(state);
}
}

async function logAction(client, interaction, action, orgName, extra = "", undoPayload = null) {
  const channel = LOG_CHANNEL_ID ? await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null) : null;
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

  let undoCustomId;

  if (undoPayload) {
    const token = createUndoEntry({
      action,
      orgName,
      ...undoPayload
    });

    undoCustomId = `presenca_undo_v2_${token}`;
  } else {
    undoCustomId = `presenca_undo_${Buffer.from(orgName).toString("base64")}`;
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(undoCustomId)
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

  const customId = interaction.customId || "";

  // 1. Botão Refresh
  if (interaction.isButton() && customId === "presenca_refresh") {
    await interaction.deferReply({ ephemeral: true });
    await updatePanel(client);
    await interaction.editReply("✅ Painel sincronizado e atualizado.");
    return true;
  }

  // 2. Botões de Ação (Confirmar/Negar)
  if (interaction.isButton() && (customId === "presenca_confirmar" || customId === "presenca_negar")) {
    // Checa permissão
    if (!checkPerms(interaction.member, "CONFIRM")) {
      return interaction.reply({ content: "🚫 Você não tem permissão para alterar presenças.", ephemeral: true });
    }

let state = loadState();
const isUserBypass = isPresenceBypass(interaction.member);

    // Checa horário (Ignora para o seu ID)
    if (!isWindowOpen(state) && !isUserBypass) { // Se a janela não está aberta e não é bypass
      const now = getNowSP();
      const day = now.getDay();
      let replyMessage;

      if (day === 5) { // Friday
        replyMessage = "⏳ O sistema só aceita confirmações na **Sexta das 19h às 21h**.";
      } else { // Thursday or Saturday
        const windowTxt = (state.activeWindow === 2) ? "22h às 00h" : "19h às 21h";
        replyMessage = `⏳ O sistema só aceita confirmações **Quinta e Sábado das ${windowTxt}**.`;
      }
      return interaction.reply({ content: replyMessage, ephemeral: true });
    }

    const isConfirm = customId === "presenca_confirmar";
    const actionLabel = isConfirm ? "Confirmar" : "Negar";

    const modal = new ModalBuilder()
      .setCustomId(`modal_presenca_${isConfirm ? "YES" : "NO"}`)
      .setTitle(`${actionLabel} Presença`);

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

    try {
      await interaction.showModal(modal);
    } catch (err) {
      if (err.code === 10062) {
        console.error("[ConfirmacaoPresenca] Erro 10062: A interação expirou antes de mostrar o modal. O bot pode estar lento.");
      } else {
        console.error("❌ Erro ao mostrar modal:", err);
      }
    }

    return true;
  }

  // 3. Modal Submit (Processar Confirmação)
  if (interaction.isModalSubmit() && customId.startsWith("modal_presenca_")) {
    await interaction.deferReply({ ephemeral: true });

let state = loadState();
const isUserBypass = isPresenceBypass(interaction.member);

    // Re-checa horário no submit (Ignora para o seu ID)
    if (!isWindowOpen(state) && !isUserBypass) { // Se a janela não está aberta e não é bypass
      const now = getNowSP();
      const day = now.getDay();
      let replyMessage;

      if (day === 5) { // Friday
        replyMessage = "⏳ O sistema fechou para confirmações na **Sexta das 19h às 21h**.";
      } else { // Thursday or Saturday
        const windowTxt = (state.activeWindow === 2) ? "22h às 00h" : "19h às 21h";
        replyMessage = `⏳ O sistema fechou para confirmações (${windowTxt}).`;
      }
      return interaction.editReply(replyMessage);
    }

    const status = customId.split("_")[2]; // YES ou NO
    const input = interaction.fields.getTextInputValue("org_input").trim().toLowerCase();
    
    // Removida redeclaração duplicada de 'state' que causava erro
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

const orgNameKey = normalizeOrgName(orgKey);
const alreadyConfirmedKey = Object.keys(state.statuses).find(key => {
  const info = state.statuses[key];
  if (!info || info.status === "PENDING") return false;
  return normalizeOrgName(key) === orgNameKey;
});

if (alreadyConfirmedKey && alreadyConfirmedKey !== orgKey && !isPresenceBypass(interaction.member)) {
  const info = state.statuses[alreadyConfirmedKey];
  const statusTxt = info.status === "YES" ? "presença confirmada" : "ausência registrada";

  return interaction.editReply(
    `🚫 Essa ORG já teve ${statusTxt} hoje como **${alreadyConfirmedKey}** por <@${info.by}>.\n` +
    `Se mudou apenas a família ativa/ID, a confirmação continua valendo e ninguém pode confirmar por cima.`
  );
}

if (alreadyConfirmedKey && alreadyConfirmedKey === orgKey && state.statuses[orgKey]?.status !== "PENDING" && !isPresenceBypass(interaction.member)) {
  const info = state.statuses[orgKey];
  const statusTxt = info.status === "YES" ? "presença confirmada" : "ausência registrada";

  return interaction.editReply(
    `🚫 Essa ORG já teve ${statusTxt} hoje por <@${info.by}>.\n` +
    `Apenas você ou a owner podem alterar por cima.`
  );
}

const previousInfo = state.statuses[orgKey]
  ? { ...state.statuses[orgKey] }
  : { status: "PENDING", by: null, time: null };

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
await logAction(client, interaction, actionTxt, orgKey, "", {
  type: "SET_STATUS",
  orgKey,
  previousInfo
});

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
      await interaction.editReply(`✅ Presença de **${orgKey}** confirmada! (+1 ponto computado)`);
    } else {
      await interaction.editReply(`❌ Ausência de **${orgKey}** registrada.`);
    }

    return true;
  }

  // 4. Botão Admin Reset Dia
  if (interaction.isButton() && customId === "presenca_admin_reset") {
    if (!checkPerms(interaction.member, "ADMIN")) {
      return interaction.reply({ content: "🚫 Apenas admins podem resetar o dia.", ephemeral: true });
    }

let state = loadState();

const previousStatuses = JSON.parse(JSON.stringify(state.statuses || {}));

state.statuses = {}; // Limpa tudo
state.lastResetDate = getNowSP().toISOString().slice(0, 10); // Marca como resetado hoje
saveState(state);

// Re-sincroniza para trazer as orgs como PENDING
await updatePanel(client);

await logAction(client, interaction, "RESET GERAL", "TODAS", "O painel foi resetado manualmente.", {
  type: "RESET_ALL",
  previousStatuses
});

return interaction.reply({ content: "✅ Painel resetado para o dia de hoje.", ephemeral: true });
  }

  // 5. Botão Admin Remover/Resetar Específico
  if (interaction.isButton() && customId === "presenca_admin_remove") {
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
  if (interaction.isModalSubmit() && customId === "modal_presenca_reset_one") {
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

const previousInfo = state.statuses[orgKey]
  ? { ...state.statuses[orgKey] }
  : { status: "PENDING", by: null, time: null };

// Reseta para PENDING
state.statuses[orgKey] = { status: "PENDING", by: null, time: null };
saveState(state);
await updatePanel(client);

await logAction(client, interaction, "RESET UNITÁRIO", orgKey, "", {
  type: "RESET_ONE",
  orgKey,
  previousInfo
});

return interaction.reply({ content: `✅ Status de **${orgKey}** resetado para Pendente.`, ephemeral: true });
  }

// 7. Botão Undo (Log)
if (interaction.isButton() && customId.startsWith("presenca_undo_")) {
  if (!checkPerms(interaction.member, "ADMIN")) {
    return interaction.reply({ content: "🚫 Apenas admins podem desfazer ações pelo log.", ephemeral: true });
  }

  let state = loadState();

  if (customId.startsWith("presenca_undo_v2_")) {
    const token = customId.replace("presenca_undo_v2_", "");
    const undoEntry = consumeUndoEntry(token);

    if (!undoEntry) {
      return interaction.reply({
        content: "❌ Esse botão de desfazer já foi usado ou o histórico não existe mais.",
        ephemeral: true
      });
    }

    if (undoEntry.type === "RESET_ALL") {
      state.statuses = undoEntry.previousStatuses || {};
      saveState(state);
      await updatePanel(client);

      return interaction.reply({
        content: "✅ Reset geral desfeito. O painel voltou para o estado anterior.",
        ephemeral: true
      });
    }

    if (undoEntry.type === "SET_STATUS" || undoEntry.type === "RESET_ONE") {
      const orgKey = undoEntry.orgKey || undoEntry.orgName;

      state.statuses[orgKey] = undoEntry.previousInfo || {
        status: "PENDING",
        by: null,
        time: null
      };

      saveState(state);
      await updatePanel(client);

      return interaction.reply({
        content: `✅ Ação desfeita. **${orgKey}** voltou para o estado anterior.`,
        ephemeral: true
      });
    }

    return interaction.reply({
      content: "❌ Tipo de desfazer desconhecido.",
      ephemeral: true
    });
  }

  const encodedOrg = customId.replace("presenca_undo_", "");
  const orgKey = Buffer.from(encodedOrg, "base64").toString("utf-8");

  if (orgKey === "TODAS" || orgKey === "TODOS") {
    return interaction.reply({
      content: "⚠️ Esse log de reset geral é antigo e não possui histórico salvo. A partir desta correção, os próximos resets gerais poderão ser desfeitos corretamente.",
      ephemeral: true
    });
  }

  state.statuses[orgKey] = { status: "PENDING", by: null, time: null };
  saveState(state);
  await updatePanel(client);

  return interaction.reply({
    content: `✅ Ação desfeita. **${orgKey}** voltou para Pendente.`,
    ephemeral: true
  });
}

  // 8. Botão Toggle Window (Admin)
  if (interaction.isButton() && customId === "presenca_toggle_window") {
    if (!checkPerms(interaction.member, "ADMIN")) {
      return interaction.reply({ content: "🚫 Apenas admins autorizados podem alternar o horário.", ephemeral: true });
    }

    const now = getNowSP();
    const day = now.getDay();
    if (day !== 4 && day !== 6) { // Quinta=4, Sábado=6
      return interaction.reply({ content: "⏳ A troca de horário só é permitida na **Quinta** e no **Sábado**.", ephemeral: true });
    }

    let state = loadState();
    state.activeWindow = state.activeWindow === 1 ? 2 : 1;
    saveState(state);
    await updatePanel(client);

    const newTxt = state.activeWindow === 1 ? "19h às 21h" : "22h às 00h";
    return interaction.reply({ content: `✅ Horário de confirmação alternado para: **${newTxt}**.`, ephemeral: true });
  }

  return false;
}
