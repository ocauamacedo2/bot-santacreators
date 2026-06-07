// d:\santacreators-main\events\hallDaFama.js
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";

import { dashEmit } from "../utils/dashHub.js";

// ================= CONFIGURAÇÃO =================
const HALL_CHANNEL_ID = "1386503496353976470"; // Canal Oficial do Hall da Fama
const APPROVAL_CHANNEL_ID = "1387864036259004436"; // Canal de Aprovação
const HALL_AUDIT_LOG_CH_ID = "1486006930492362893";

// Cargos Fixos para Menção
const ROLE_CIDADAO = "1262978759922028575";
const ROLE_LIDERES = "1353858422063239310";

// Cidades e seus Cargos
const CITIES = {
  nobre:   { label: "Cidade Nobre",   roleId: "1379021805544804382", emoji: "💎" },
  santa:   { label: "Cidade Santa",   roleId: "1379021888709464168", emoji: "🎅" },
  grande:  { label: "Cidade Grande",  roleId: "1418691103397253322", emoji: "🏙️" },
  maresia: { label: "Cidade Maresia", roleId: "1379021994678288465", emoji: "🌊" },
};

// Permissões
const ALLOWED_ROLES = [
  "1352408327983861844", // Resp Creators
  "1262262852949905409", // Resp Influ
  "1352407252216184833", // Resp Lider
  "1388976314253312100", // Coord Creators
  "1282119104576098314", // Mkt Creators
  "1262262852949905408", // Owner
  "1387253972661964840", // Equipe Social Medias
  "1388976094920704141", // Social Medias
  "1388975939161161728", // Gestor Creators
  "1352385500614234134", // Coordenação
  "1352429001188180039", // Equipe Creators
  "1414651836861907006", // Responsáveis
];

const APPROVER_ROLES = [
  "1262262852949905408", // Owner
  "1352408327983861844", // Resp Creators
  "1262262852949905409", // Resp Influ
  "1352407252216184833", // Resp Lider
];

const ALLOWED_USERS = [
  "660311795327828008", // Você
  "1262262852949905408", // Owner
];

const BTN_OPEN_MENU = "hf_open_menu";
const SEL_CITY = "hf_select_city";
const MODAL_SUBMIT = "hf_modal_submit";
const BTN_APPROVE_PREFIX = "hf_approve_";
const BTN_REJECT_PREFIX = "hf_reject_";
const BTN_EDIT_LAST = "hf_edit_last";
const MODAL_EDIT_SUBMIT = "hf_modal_edit_submit";
const BTN_EDIT_PRIZES = "hf_edit_prizes";
const MODAL_PRIZES_SUBMIT = "hf_modal_prizes_submit";
const BTN_EDIT_CITY = "hf_edit_city";
const MODAL_CITY_SUBMIT = "hf_modal_city_submit";
const BTN_SCAN_ALL = "hf_scan_all";

// ================= PERSISTÊNCIA =================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, "../data");
const STATE_FILE = path.join(DATA_DIR, "halldafama_state.json");
const CRONO_FILE = path.join(DATA_DIR, "cronograma_state.json"); // Lê o arquivo do cronograma

const ensureDir = () => { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); };
const saveState = (data) => { ensureDir(); fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2)); };
const loadState = () => { try { if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch {} return { pendingRequests: {} }; };

async function sendAuditHallLog(client, member, data, msg) {
  const ch = await client.channels.fetch(HALL_AUDIT_LOG_CH_ID).catch(() => null);
  if (!ch || !ch.isTextBased()) return;

  const now = Date.now();
  const embed = new EmbedBuilder()
    .setTitle("⭐ Log: Hall da Fama Publicado")
    .setColor("Gold")
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: "👤 Aprovador", value: `${member} (\`${member.id}\`)`, inline: true },
      { name: "🔗 Perfil", value: `Clique aqui`, inline: true },
      { name: "📍 Mensagem", value: `Ir para mensagem`, inline: true },
      { name: "🏁 Evento", value: `\`${data.eventName}\``, inline: true },
      { name: "🌆 Cidade", value: `\`${data.cityDisplayName}\``, inline: true },
      { name: "🕒 Horário", value: `<t:${Math.floor(now / 1000)}:R>`, inline: true },
      { name: "🏆 Vencedores", value: data.winnersText.slice(0, 1000), inline: false },
      { name: "🕒 Enviado em", value: `<t:${Math.floor(now / 1000)}:F>`, inline: false }
    )
    .setFooter({ text: "SantaCreators • Auditoria Hall da Fama" })
    .setTimestamp();

  await ch.send({ content: `${member}`, embeds: [embed] }).catch(() => {});
}

let state = loadState();

const processingApprovals = new Set();

function getHallScanKeySP() {
  return new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function shouldRunHallScanToday() {
  return state?.lastAutoCorrectScanKey !== getHallScanKeySP();
}

function markHallScanDoneToday() {
  state.lastAutoCorrectScanKey = getHallScanKeySP();
  saveState(state);
}

// ================= LÓGICA INTELIGENTE (CRONOGRAMA) =================

// Pega o dia da semana em SP (seg, ter, qua...)
function getTodayKey() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  // ✅ SEM ROLLOVER: Passou da meia-noite (00:00), já puxa o evento do dia novo.
  const days = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
  return days[now.getDay()];
}

// Lê o cronograma e retorna os dados de HOJE
function getTodayEventData() {
  try {
    if (!fs.existsSync(CRONO_FILE)) return null;
    const crono = JSON.parse(fs.readFileSync(CRONO_FILE, "utf8"));
    const todayKey = getTodayKey();
    
    // Tenta pegar do schedule normal (19h)
    const normal = crono.schedule?.[todayKey];
    if (normal && normal.active) return normal;

    // Se não tiver, tenta madrugada (se for madrugada agora, pega do dia anterior tecnicamente, mas vamos simplificar)
    const madru = crono.madrugada?.[todayKey];
    if (madru && madru.active) return madru;

    return null;
  } catch (e) {
    console.error("Erro ao ler cronograma:", e);
    return null;
  }
}

// Extrai a premiação do texto do cronograma para uma posição específica (1, 2, 3)
function extractPrizeForRank(prizesText, rank) {
  if (!prizesText) return "";
  const lines = prizesText.split('\n');
  // Procura linhas que tenham "TOP X" ou "1º" ou apenas comece com o numero
  const regex = new RegExp(`(TOP\\s*${rank}|${rank}º|${rank}\\.|^${rank}\\s)`, 'i');
  
  const line = lines.find(l => regex.test(l));
  if (line) {
    // Remove o prefixo "TOP 1:" para ficar só o prêmio
    return line.replace(regex, '').replace(/^[:\-\s]+/, '').trim();
  }
  return "";
}

// ================= TEMPLATES DE TEXTO (VARIAÇÃO) =================
const INTRO_TEMPLATES = [
  "A disputa foi pesada e só os brabos ficaram de pé. Confira os vencedores:",
  "Mais um evento finalizado com sucesso! Hoje quem brilhou foram eles:",
  "Teve estratégia, coragem e muita pressão. Esses foram os grandes campeões:",
  "O evento foi insano do começo ao fim, e esses nomes dominaram a disputa:",
  "Eles chegaram focados, jogaram muito e garantiram o topo do Hall da Fama:",
  "A SantaCreators presenciou mais uma disputa absurda. Confira quem levou a melhor:",
  "Hoje foi dia de mostrar habilidade, frieza e raça. Parabéns aos vencedores:",
  "Mais uma batalha concluída, e esses brabos cravaram seus nomes na história:",
  "O evento pegou fogo, mas eles mantiveram o controle e saíram campeões:",
  "No fim, só quem teve sangue frio ficou no topo. Confira os destaques:"
];

function getRandomIntro() {
  return INTRO_TEMPLATES[Math.floor(Math.random() * INTRO_TEMPLATES.length)];
}

// Função para dividir texto longo em partes de 2000 caracteres
function splitText(text, maxLength = 2000) {
  if (text.length <= maxLength) return [text];
  const chunks = [];
  let currentChunk = "";
  const lines = text.split("\n");
  for (const line of lines) {
    if (currentChunk.length + line.length + 1 <= maxLength) {
      currentChunk += (currentChunk ? "\n" : "") + line;
    } else {
      if (currentChunk) chunks.push(currentChunk);
      currentChunk = line;
      while (currentChunk.length > maxLength) {
          chunks.push(currentChunk.slice(0, maxLength));
          currentChunk = currentChunk.slice(maxLength);
      }
    }
  }
  if (currentChunk) chunks.push(currentChunk);
  return chunks;
}

function cleanOneLine(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

function isBadHallIntro(value = "") {
  const text = cleanOneLine(value);

  if (!text) return true;
  if (text.length < 25) return true;
  if (text.length > 160) return true;
  if (text.startsWith("http")) return true;
  if (text.includes("**TOP**")) return true;
  if (text.includes("HALL DA FAMA")) return true;
  if (/^é\s+com$/i.test(text)) return true;
  if (/^é\s+com\s*$/i.test(text)) return true;
  if ((text.match(/Confira os vencedores/gi) || []).length > 1) return true;
  if ((text.match(/Hall da Fama/gi) || []).length > 1) return true;

  return false;
}

function extractHallParts(content = "") {
  const rawContent = String(content || "");
  const lines = rawContent.split("\n").map(l => l.trim()).filter(Boolean);

  const imageUrl = rawContent.match(/https?:\/\/\S+/i)?.[0] || "";

  const contentWithoutUrls = rawContent
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\|\|@everyone[\s\S]*?\|\|/gi, "")
    .replace(/@everyone|@here/gi, "")
    .trim();

  const eventName =
    contentWithoutUrls.match(/Santa Creators\s*:\s*(.*?)\*\*/i)?.[1]?.trim() ||
    contentWithoutUrls.match(/Santa Creators\s*:\s*(.*?)\s*🎉/i)?.[1]?.trim() ||
    "Evento";

  const cityName =
    rawContent.match(/na\s+\*\*(Cidade\s+(?:Nobre|Santa|Grande|Maresia))\*\*!/i)?.[1]?.trim() ||
    rawContent.match(/na\s+\*\*CIDADE\s+(NOBRE|SANTA|GRANDE|MARESIA)\*\*!/i)?.[1]?.replace(/^/, "Cidade ").trim() ||
    rawContent.match(/na\s+(Cidade\s+(?:Nobre|Santa|Grande|Maresia))!/i)?.[1]?.trim() ||
    rawContent.match(/CIDADE\s+(NOBRE|SANTA|GRANDE|MARESIA)/i)?.[1]?.replace(/^/, "Cidade ").trim() ||
    "Cidade";

  let introText =
    rawContent.match(/\n\n([\s\S]*?)\n\n🏆\s+\*\*/i)?.[1]?.trim() ||
    contentWithoutUrls.match(/🎉\s*(.*?)\s+\*\*[^*]+\*\*\s+na\s+\*\*Cidade\s+(?:Nobre|Santa|Grande|Maresia)\*\*!/i)?.[1]?.trim() ||
    contentWithoutUrls.match(/🎉\s*(.*?)\s+[A-ZÀ-Ú0-9\s]+na\s+CIDADE\s+(?:NOBRE|SANTA|GRANDE|MARESIA)!/i)?.[1]?.trim() ||
    "";

  introText = cleanOneLine(
    introText
      .replace(/^:\s*/, "")
      .replace(/\*\*/g, "")
      .replace(/Santa Creators\s*:\s*.*?🎉/i, "")
      .replace(/<:coroa_orange:\d+>/g, "")
      .replace(/:coroa_orange:/g, "")
  );
  if (isBadHallIntro(introText)) {
    introText = getRandomIntro();
  }

  let winnersText = "";

  const hallIndex = lines.findIndex(l => l.includes("HALL DA FAMA"));
  const endIndex = lines.findIndex(l => l.includes("Foi insano, mas mais uma vez"));
  if (hallIndex !== -1 && endIndex !== -1 && endIndex > hallIndex) {
    winnersText = lines
      .slice(hallIndex + 1, endIndex)
      .filter(l => l.includes("**TOP**") || l.toUpperCase().startsWith("TOP"))
      .join("\n")
      .trim();
  }

  if (!winnersText) {
    const topMatches = [...contentWithoutUrls.matchAll(/\*\*TOP\*\*[\s\S]*?(?=\*\*TOP\*\*|\*\*Foi insano|Foi insano|$)/g)];

    winnersText = topMatches
      .map(m => cleanOneLine(m[0]))
      .filter(Boolean)
      .join("\n");
  }

  if (!winnersText || winnersText.includes("Santa Creators :")) {
    winnersText = "";
  }

  return {
    eventName: cleanOneLine(eventName) || "Evento",
    cityName: cleanOneLine(cityName) || "Cidade",
    introText: cleanOneLine(introText) || getRandomIntro(),
    winnersText,
    imageUrl
  };
}

function buildHallIntroLine(intro, eventName, cityName) {
  return `${cleanOneLine(intro)}\n\n🏆 **${cleanOneLine(eventName).toUpperCase()}** na **${cleanOneLine(cityName).toUpperCase()}**! <:coroa_orange:1353939359144870019>`;
}

function fixDuplicatedHallContent(content = "", attachmentUrls = []) {
  if (!content.includes("Santa Creators :") || !content.includes("HALL DA FAMA")) return content;

  const parts = extractHallParts(content);
  if (!parts.winnersText) return content;

  const lines = content.split("\n");
  const mentionsLine = lines.find(l => l.includes("@everyone")) || "";

  const imageLinesFromContent = getImageUrlsFromContent(content);
  const imageLines = uniqueImageUrls([
    ...imageLinesFromContent,
    ...attachmentUrls
  ]);

  const safeIntro = isBadHallIntro(parts.introText) ? getRandomIntro() : parts.introText;
  const introLine = buildHallIntroLine(safeIntro, parts.eventName, parts.cityName);

  const fixedMessage =
`# 🎉 :  **Santa Creators : ${parts.eventName}** 🎉 

${introLine}

👏  Uma salva de palmas para os BRABOS! 👏 

<:12633559939374122111:1368796471297576970>  **HALL DA FAMA** <:12633559939374122111:1368796471297576970> 

${parts.winnersText.trim()}

**Foi insano, mas mais uma vez os vencedores mostraram que a vitória só é possível com raça! <:__:1357520048318709840>**

${mentionsLine}

${imageLines.join("\n")}`;

  return fixedMessage.trim();
}

function updateHallCityOnly(content = "", newCityName = "", attachmentUrls = []) {
  const cleanedContent = fixDuplicatedHallContent(content, attachmentUrls);
  const parts = extractHallParts(cleanedContent);

  if (!parts.winnersText) return cleanedContent;

  const lines = cleanedContent.split("\n");
  const mentionsLine = lines.find(l => l.includes("@everyone")) || "";

  const imageLinesFromContent = getImageUrlsFromContent(cleanedContent);
  const imageLines = uniqueImageUrls([
    ...imageLinesFromContent,
    ...attachmentUrls
  ]);

  const safeIntro = isBadHallIntro(parts.introText) ? getRandomIntro() : parts.introText;
  const introLine = buildHallIntroLine(safeIntro, parts.eventName, newCityName);

  const fixedMessage =
`# 🎉 :  **Santa Creators : ${parts.eventName}** 🎉 

${introLine}

👏  Uma salva de palmas para os BRABOS! 👏 

<:12633559939374122111:1368796471297576970>  **HALL DA FAMA** <:12633559939374122111:1368796471297576970> 

${parts.winnersText.trim()}

**Foi insano, mas mais uma vez os vencedores mostraram que a vitória só é possível com raça! <:__:1357520048318709840>**

${mentionsLine}

${imageLines.join("\n")}`;

  return fixedMessage.trim();
}

function normalizeHallName(value = "") {
  return cleanOneLine(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeImageUrl(url = "") {
  return String(url)
    .trim()
    .replace(/[>)\]\s]+$/g, "");
}

function uniqueImageUrls(urls = []) {
  const seen = new Set();
  const finalUrls = [];

  for (const rawUrl of urls) {
    const url = normalizeImageUrl(rawUrl);
    if (!url) continue;

    const key = url.split("?")[0].toLowerCase();

    if (seen.has(key)) continue;
    seen.add(key);
    finalUrls.push(url);
  }

  return finalUrls;
}

function getImageUrlsFromContent(content = "") {
  return uniqueImageUrls(String(content).match(/https?:\/\/\S+/gi) || []);
}

function getImageUrlsFromAttachments(message) {
  return uniqueImageUrls([...message.attachments.values()].map(a => a.url));
}

async function findApprovalImagesForHall(client, hallMessage, parts) {
  const approvalChannel = await client.channels.fetch(APPROVAL_CHANNEL_ID).catch(() => null);
  if (!approvalChannel || !approvalChannel.isTextBased()) return [];

  const messages = await approvalChannel.messages.fetch({ limit: 100 }).catch(() => null);
  if (!messages) return [];

  const hallEventName = normalizeHallName(parts.eventName);
  const hallCreatedAt = hallMessage?.createdTimestamp || Date.now();

  const candidates = messages
    .filter(m => {
      const diff = Math.abs((m.createdTimestamp || 0) - hallCreatedAt);
      const withinSameWindow = diff <= 1000 * 60 * 60 * 12;

      const embedText = m.embeds
        .map(e => [
          e.title,
          e.description,
          ...(e.fields || []).map(f => `${f.name} ${f.value}`)
        ].flat().join(" "))
        .join(" ");

      return withinSameWindow && normalizeHallName(embedText).includes(hallEventName);
    })
    .sort((a, b) => Math.abs(a.createdTimestamp - hallCreatedAt) - Math.abs(b.createdTimestamp - hallCreatedAt));

  const foundUrls = [];

  for (const approvalMsg of candidates.values()) {
    for (const emb of approvalMsg.embeds) {
      if (emb.image?.url) foundUrls.push(emb.image.url);
      if (emb.thumbnail?.url) foundUrls.push(emb.thumbnail.url);

      for (const field of emb.fields || []) {
        if (/imagem/i.test(field.name)) {
          const urls = String(field.value).match(/https?:\/\/\S+/gi) || [];
          foundUrls.push(...urls);
        }
      }
    }

    foundUrls.push(...[...approvalMsg.attachments.values()].map(a => a.url));

    if (foundUrls.length > 0) break;
  }

  return [...new Set(foundUrls)].filter(Boolean);
}

async function autoCorrectDuplications(channel, client) {
  try {
    const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
    if (!messages) return;

    const botHallMessages = messages.filter(m =>
      m.author.id === client.user.id &&
      m.content.includes("Santa Creators :") &&
      m.content.includes("HALL DA FAMA")
    );

    for (const msg of botHallMessages.values()) {
      const parts = extractHallParts(msg.content);

      const contentUrls = getImageUrlsFromContent(msg.content);
      const attachmentUrls = getImageUrlsFromAttachments(msg);

      let allImageUrls = uniqueImageUrls([
        ...contentUrls,
        ...attachmentUrls
      ]);

      if (allImageUrls.length === 0) {
        const approvalUrls = await findApprovalImagesForHall(client, msg, parts);
        allImageUrls = uniqueImageUrls(approvalUrls);
      }

      const fixed = fixDuplicatedHallContent(msg.content, allImageUrls);

      if (fixed !== msg.content && fixed.length <= 2000) {
        await msg.edit({
          content: fixed
        }).catch(() => {});
      }
    }
  } catch (e) {
    console.error("[HallDaFama] Erro na varredura automática:", e);
  }
}

// ================= HELPERS =================
function hasPermission(member, userId) {
  if (ALLOWED_USERS.includes(userId)) return true;
  return member?.roles?.cache?.some((r) => ALLOWED_ROLES.includes(r.id)) || false;
}

function canApprove(member, userId) {
  if (ALLOWED_USERS.includes(userId)) return true;
  return member?.roles?.cache?.some((r) => APPROVER_ROLES.includes(r.id)) || false;
}

function buildControlButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(BTN_OPEN_MENU)
      .setLabel("🏆 Registrar Hall da Fama")
      .setStyle(ButtonStyle.Success)
      .setEmoji("👑"),
    new ButtonBuilder()
  .setCustomId(BTN_EDIT_LAST)
  .setLabel("✏️ Editar TOPs")
  .setStyle(ButtonStyle.Secondary)
  .setEmoji("✍️"),
    new ButtonBuilder()
      .setCustomId(BTN_EDIT_PRIZES)
      .setLabel("🎁 Editar Premiações")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("💰"),
        new ButtonBuilder()
  .setCustomId(BTN_EDIT_CITY)
  .setLabel("🌆 Editar Última CDD")
  .setStyle(ButtonStyle.Secondary)
  .setEmoji("🌆"),
    new ButtonBuilder()
      .setCustomId(BTN_SCAN_ALL)
      .setLabel("🧹 Varredura Geral")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🧹")
  );
}

async function ensureButtonAtBottom(channel, client, force = true) {
  try {
    const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
    if (!messages) return;

  const myMsgs = messages.filter((m) => {
    if (m.author.id !== client.user.id || m.components.length === 0) return false;

    const allButtons = m.components.flatMap(row => row.components || []);
    return allButtons.some(c => [BTN_OPEN_MENU, BTN_EDIT_LAST, BTN_EDIT_PRIZES, BTN_EDIT_CITY, BTN_SCAN_ALL].includes(c.customId));
  });

    // ✅ Checa se já existe um painel de botões ATUALIZADO com o botão de varredura
  const upToDateMsg = myMsgs.find((m) => {
    const allButtons = m.components.flatMap(row => row.components || []);
    return allButtons.some(c => c.customId === BTN_SCAN_ALL);
  });

    // Se não for forçado e já existir um painel atualizado, não faz nada.
    if (!force && upToDateMsg) return;

    // Apaga todas as mensagens de botão antigas/desatualizadas do bot
    for (const m of myMsgs.values()) {
      await m.delete().catch(() => {});
    }

    await channel.send({
      components: [buildControlButtons()]
    });
  } catch (e) {
    console.error("[HallDaFama] Erro ao mover botão:", e);
  }
}

function buildHallDaFamaModal(cityKey, defaultEventName) {
  const defaultCityName = CITIES[cityKey]?.label || "Cidade";
  const modal = new ModalBuilder()
    .setCustomId(`${MODAL_SUBMIT}:${cityKey}`)
    .setTitle(`Hall da Fama - ${defaultCityName}`);

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("hf_event_name")
        .setLabel("Nome do Evento")
        .setPlaceholder("Ex: SANTA DO CRIME")
        .setStyle(TextInputStyle.Short)
        .setValue(defaultEventName || "")
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("hf_custom_city")
            .setLabel("Cidade (Opcional - deixe vazio p/ auto)")
            .setPlaceholder(`Vazio = ${defaultCityName}`)
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
        ),
        new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("hf_tops")
        .setLabel("Vencedores (Um por linha, TOP 1 no topo)")
        .setPlaceholder("Ex:\nMacedo | 123\nJoao | 456\nMaria | 789")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("hf_image")
        .setLabel("Link da Imagem 1")
        .setPlaceholder("https://cdn.discordapp.com/...")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("hf_image2")
        .setLabel("Link da Imagem 2 (Opcional)")
        .setPlaceholder("https://cdn.discordapp.com/...")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
    )
  );
  return modal;
}

// ================= EXPORTS =================

export async function hallDaFamaOnReady(client) {
  state = loadState();
  const channel = await client.channels.fetch(HALL_CHANNEL_ID).catch(() => null);
  if (channel && channel.isTextBased()) {
     await ensureButtonAtBottom(channel, client, true);

    if (shouldRunHallScanToday()) {
      await autoCorrectDuplications(channel, client);
      markHallScanDoneToday();
    }
  }
}

export async function hallDaFamaHandleInteraction(interaction, client) {
  if (!interaction.guild) return false;

  // ✅ Botão manual para varredura geral dos Halls antigos
  if (interaction.isButton() && interaction.customId === BTN_SCAN_ALL) {
    if (!hasPermission(interaction.member, interaction.user.id)) {
      return interaction.reply({ content: "🚫 Sem permissão para fazer varredura geral.", ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const hallChannel = await client.channels.fetch(HALL_CHANNEL_ID).catch(() => null);
    if (!hallChannel) {
      return interaction.editReply("❌ Canal do Hall da Fama não encontrado.");
    }

    await autoCorrectDuplications(hallChannel, client);

    state.lastAutoCorrectScanKey = "";
    saveState(state);

    await interaction.editReply("✅ Varredura geral concluída. Os Halls duplicados foram corrigidos quando possível.");
    return true;
  }

  // ✅ Botão para editar somente a cidade do último Hall da Fama
  if (interaction.isButton() && interaction.customId === BTN_EDIT_CITY) {
    if (!hasPermission(interaction.member, interaction.user.id)) {
      return interaction.reply({ content: "🚫 Sem permissão para editar a cidade.", ephemeral: true });
    }

    const hallChannel = await client.channels.fetch(HALL_CHANNEL_ID).catch(() => null);
    if (!hallChannel) {
      return interaction.reply({ content: "❌ Canal do Hall da Fama não encontrado.", ephemeral: true });
    }

    const messages = await hallChannel.messages.fetch({ limit: 50 }).catch(() => null);
    if (!messages) {
      return interaction.reply({ content: "❌ Não foi possível buscar as mensagens do canal.", ephemeral: true });
    }

    const lastHallMessage = messages
      .filter(m => m.author.id === client.user.id && m.content.includes("Santa Creators :") && m.content.includes("HALL DA FAMA"))
      .sort((a, b) => b.createdTimestamp - a.createdTimestamp)
      .first();

    if (!lastHallMessage) {
      return interaction.reply({ content: "❌ Nenhum Hall da Fama recente encontrado para editar a cidade.", ephemeral: true });
    }

    const parts = extractHallParts(lastHallMessage.content);

    const modal = new ModalBuilder()
      .setCustomId(`${MODAL_CITY_SUBMIT}:${lastHallMessage.id}`)
      .setTitle("🌆 Editar Cidade do Hall");

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("hf_city_only")
          .setLabel("Cidade correta do evento")
          .setValue(parts.cityName || "Cidade")
          .setPlaceholder("Ex: Cidade Maresia")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );

    await interaction.showModal(modal);
    return true;
  }

  // ✅ Modal para editar somente a cidade do último Hall da Fama
  if (interaction.isModalSubmit() && interaction.customId.startsWith(MODAL_CITY_SUBMIT)) {
    if (!hasPermission(interaction.member, interaction.user.id)) {
      return interaction.reply({ content: "🚫 Sem permissão para editar a cidade.", ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const messageId = interaction.customId.split(":")[1];
    const newCityName = interaction.fields.getTextInputValue("hf_city_only");

    const hallChannel = await client.channels.fetch(HALL_CHANNEL_ID).catch(() => null);
    if (!hallChannel) {
      return interaction.editReply("❌ Canal do Hall da Fama não encontrado.");
    }

    const messageToEdit = await hallChannel.messages.fetch(messageId).catch(() => null);
    if (!messageToEdit) {
      return interaction.editReply("❌ A mensagem do Hall da Fama original não foi encontrada. Talvez tenha sido apagada.");
    }

    const attachmentUrls = getImageUrlsFromAttachments(messageToEdit);
    const finalContent = updateHallCityOnly(messageToEdit.content, newCityName, attachmentUrls);

    if (finalContent.length > 2000) {
      return interaction.editReply("❌ O Hall ficou maior que 2000 caracteres e não pode ser salvo.");
    }

    await messageToEdit.edit({
      content: finalContent
    });

    await interaction.editReply(`✅ Cidade alterada com sucesso para: **${newCityName}**`);
    return true;
  }

  // ✅ Botão para editar o último post
  if (interaction.isButton() && (interaction.customId === BTN_EDIT_LAST || interaction.customId === BTN_EDIT_PRIZES)) {
    if (!hasPermission(interaction.member, interaction.user.id)) {
      return interaction.reply({ content: "🚫 Sem permissão para editar.", ephemeral: true });
    }

    // await interaction.deferReply({ ephemeral: true }); // Removido para corrigir erro 'InteractionAlreadyReplied'

    const hallChannel = await client.channels.fetch(HALL_CHANNEL_ID).catch(() => null);
    if (!hallChannel) {
      return interaction.reply({ content: "❌ Canal do Hall da Fama não encontrado.", ephemeral: true });
    }

    const messages = await hallChannel.messages.fetch({ limit: 50 }).catch(() => null);
    if (!messages) {
      return interaction.reply({ content: "❌ Não foi possível buscar as mensagens do canal.", ephemeral: true });
    }

    // Encontra a última mensagem de Hall da Fama postada pelo bot
    const lastHallMessage = messages
      .filter(m => m.author.id === client.user.id && m.content.includes("# 🎉 :  **Santa Creators :"))
      .sort((a, b) => b.createdTimestamp - a.createdTimestamp)
      .first();

    if (!lastHallMessage) {
      return interaction.reply({ content: "❌ Nenhum post recente do Hall da Fama encontrado para editar.", ephemeral: true });
    }

  // Parse inteligente do conteúdo da mensagem
const parts = extractHallParts(lastHallMessage.content);

const eventName = parts.eventName;
const cityName = parts.cityName;
const introText = parts.introText;
const winnersText = parts.winnersText;
const imageUrl = parts.imageUrl;

if (!winnersText) {
  return interaction.reply({
    content: "❌ Não consegui separar os vencedores dessa mensagem antiga porque ela está muito embolada. Use o botão 🎁 Editar Premiações para ajustar os TOPs ou poste um novo Hall já com a versão corrigida.",
    ephemeral: true
  });
}

    let modal;

    modal = new ModalBuilder()
      .setCustomId(`${MODAL_PRIZES_SUBMIT}:${lastHallMessage.id}`)
      .setTitle(`✏️ Editar TOPs do Hall`);

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("hf_edit_winners")
          .setLabel("🏆 TOPs / Vencedores")
          .setValue(winnersText)
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder("Edite somente os TOPs aqui.")
          .setRequired(true)
      )
    );
    
    await interaction.showModal(modal);
    return true;
  }

  // ✅ Modal de edição de Hall da Fama
  if (interaction.isModalSubmit() && (interaction.customId.startsWith(MODAL_EDIT_SUBMIT) || interaction.customId.startsWith(MODAL_PRIZES_SUBMIT))) {
    if (!hasPermission(interaction.member, interaction.user.id)) {
      return interaction.reply({ content: "🚫 Sem permissão para editar.", ephemeral: true });
    }
    
    await interaction.deferReply({ ephemeral: true });

    const isPrizesOnly = interaction.customId.startsWith(MODAL_PRIZES_SUBMIT);
    const messageId = interaction.customId.split(":")[1];
    const newWinnersText = interaction.fields.getTextInputValue("hf_edit_winners");
    
    let newEventName, newImageUrl, newImageUrl2, newCityName, newIntro;
    
    if (!isPrizesOnly) {
      newEventName = interaction.fields.getTextInputValue("hf_edit_event_name");
      newCityName = interaction.fields.getTextInputValue("hf_edit_city");
      newIntro = interaction.fields.getTextInputValue("hf_edit_intro");
      newImageUrl = interaction.fields.getTextInputValue("hf_edit_image");
    }

    const hallChannel = await client.channels.fetch(HALL_CHANNEL_ID).catch(() => null);
    if (!hallChannel) {
      return interaction.editReply("❌ Canal do Hall da Fama não encontrado.");
    }

    const messageToEdit = await hallChannel.messages.fetch(messageId).catch(() => null);
    if (!messageToEdit) {
      return interaction.editReply("❌ A mensagem do Hall da Fama original não foi encontrada. Talvez tenha sido apagada.");
    }

    // Preserva partes que não são editáveis no modal
    const oldContent = messageToEdit.content;
    const lines = oldContent.split('\n');
    
    // Se for apenas prêmios, extraímos o resto da mensagem original
    if (isPrizesOnly) {
      const titleLine = lines.find(l => l.startsWith('# 🎉 :'));
      newEventName = titleLine?.match(/# 🎉 :  \*\*Santa Creators : (.*?)\*\* 🎉/)?.[1] || 'Evento';
      const cityMatch = oldContent.match(/na \*\*(.*?)\*\*!/);
      newCityName = cityMatch ? cityMatch[1] : "CIDADE";
      const introLineIndex = lines.findIndex(l => l.startsWith('# 🎉 :')) + 2;
      newIntro = lines[introLineIndex]?.split(/\s+\*\*.*?\*\*\s+na\s+/)[0]?.trim() || getRandomIntro();
      const imageLines = lines.filter(l => l.startsWith('https://'));
      newImageUrl = imageLines[0] || '';
      newImageUrl2 = imageLines[1] || '';
    } else {
      newImageUrl2 = oldContent.split('\n').filter(l => l.startsWith('https://'))[1] || '';
    }

    const mentionsLine = lines.find(l => l.includes('@everyone')) || '';

   // Remonta a mensagem
const introLine = buildHallIntroLine(newIntro, newEventName, newCityName);

const finalMessage = 
`# 🎉 :  **Santa Creators : ${newEventName}** 🎉 

${introLine}

👏  Uma salva de palmas para os BRABOS! 👏 

<:12633559939374122111:1368796471297576970>  **HALL DA FAMA** <:12633559939374122111:1368796471297576970> 

${newWinnersText.trim()}

**Foi insano, mas mais uma vez os vencedores mostraram que a vitória só é possível com raça! <:__:1357520048318709840>**

${mentionsLine}

${newImageUrl}${newImageUrl2 ? `\n${newImageUrl2}` : ''}`;

    if (finalMessage.length > 2000) {
      return interaction.editReply("❌ O conteúdo editado é muito longo (mais de 2000 caracteres) e não pode ser salvo. Por favor, reduza o texto dos vencedores.");
    }

    await messageToEdit.edit({ content: finalMessage });

    await interaction.editReply("✅ Hall da Fama editado com sucesso!");
    return true;
  }

  // 1. Botão Inicial
  if (interaction.isButton() && interaction.customId === BTN_OPEN_MENU) {
    if (!hasPermission(interaction.member, interaction.user.id)) {
      return interaction.reply({ content: "🚫 Sem permissão.", ephemeral: true });
    }

    // ✅ Tenta detectar cidade automaticamente pelo cronograma
    const eventData = getTodayEventData();
    let autoCityKey = null;

    if (eventData && eventData.city) {
      const normalized = eventData.city.toLowerCase().trim();
      if (CITIES[normalized]) {
        autoCityKey = normalized;
      } else {
        const foundKey = Object.keys(CITIES).find(k => normalized.includes(k));
        if (foundKey) autoCityKey = foundKey;
      }
    }

    if (autoCityKey) {
      const defaultEventName = eventData ? eventData.eventName : "";
      const modal = buildHallDaFamaModal(autoCityKey, defaultEventName);
      await interaction.showModal(modal);
      return true;
    }

    const select = new StringSelectMenuBuilder()
      .setCustomId(SEL_CITY)
      .setPlaceholder("Selecione a Cidade do Evento")
      .addOptions(
        Object.entries(CITIES).map(([key, data]) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(data.label)
            .setValue(key)
            .setEmoji(data.emoji)
        )
      );

    const row = new ActionRowBuilder().addComponents(select);
    
    await interaction.reply({
      content: "🌆 **Para qual cidade é este Hall da Fama?**",
      components: [row],
      ephemeral: true
    });
    return true;
  }

  // 2. Seleção de Cidade -> Abre Modal
  if (interaction.isStringSelectMenu() && interaction.customId === SEL_CITY) {
    const cityKey = interaction.values[0];
    
    // Tenta pegar dados automáticos
    const eventData = getTodayEventData();
    const defaultEventName = eventData ? eventData.eventName : "";
    
    const modal = buildHallDaFamaModal(cityKey, defaultEventName);

    await interaction.showModal(modal);
    return true;
  }

  // 3. Submit do Modal -> Monta Texto e Envia para Aprovação
  if (interaction.isModalSubmit() && interaction.customId.startsWith(MODAL_SUBMIT)) {
    await interaction.deferReply({ ephemeral: true });

    const cityKey = interaction.customId.split(":")[1];
    if (!cityKey || !CITIES[cityKey]) return interaction.editReply("❌ Erro: Cidade não identificada.");

    // Pega inputs
    const eventNameInput = interaction.fields.getTextInputValue("hf_event_name");
    const topsInput = interaction.fields.getTextInputValue("hf_tops");
    const imageUrl = interaction.fields.getTextInputValue("hf_image");
    const imageUrl2 = interaction.fields.getTextInputValue("hf_image2");
const customCityInput = interaction.fields.getTextInputValue("hf_custom_city")?.trim() || "";

// Pega dados do cronograma (automático)
const eventData = getTodayEventData();
const eventName = eventNameInput; // Usa o input do usuário
const prizesText = eventData ? eventData.prizes : "";
const cityDisplayName = customCityInput || CITIES[cityKey].label;

    // Monta a string dos vencedores com premiação automática
    let winnersText = "";

  // ✅ NOVA LÓGICA DE PREMIAÇÃO (Cenários 1, 2 e 3)
    const allTopLines = topsInput.split('\n').map(l => l.trim()).filter(Boolean);
    const top1 = allTopLines[0] || "N/A";
    const extraLines = allTopLines.slice(1);
    const totalWinners = allTopLines.length;

    let prize1 = "";

    // 🏆 Cenário 1: Apenas TOP 1 -> Recebe TUDO
    if (totalWinners === 1) {
      // Acumula todos os prêmios encontrados no texto do cronograma
      prize1 = ["1", "2", "3"].map(r => extractPrizeForRank(prizesText, r)).filter(Boolean).join(" + ");
    } else {
      // 🏅 Cenário 3: TOP 1, 2 e 3 -> Distribuição normal
      prize1 = extractPrizeForRank(prizesText, 1);
    }

    // TOP 1
    winnersText += `**TOP** <:novo_emoji:1381082106469290076> ${top1} ${prize1 ? `| **${prize1}**` : ""}\n`;

    // TOPS EXTRA
    if (extraLines.length > 0) {
      extraLines.forEach((line, index) => {
        const rank = index + 2;
        const prize = extractPrizeForRank(prizesText, rank);
        
        let emoji = "🏅";
        if (rank === 2) emoji = "<:novo_emoji:1381082144981651500>";
        else if (rank === 3) emoji = "<:novo_emoji:1381082168142336095>";

        winnersText += `**TOP** ${emoji} ${line} ${prize ? `| **${prize}**` : ""}\n`;
      });
    }

    const reqId = `${interaction.user.id}-${Date.now()}`;
    
    state.pendingRequests[reqId] = {
  userId: interaction.user.id,
  cityKey,
  cityDisplayName,
  eventName,
  winnersText,
  imageUrl,
  imageUrl2
};
    saveState(state);

    const approvalChannel = await client.channels.fetch(APPROVAL_CHANNEL_ID).catch(() => null);
    if (!approvalChannel) return interaction.editReply("❌ Canal de aprovação não encontrado.");

    const embed = new EmbedBuilder()
      .setTitle("🛡️ Aprovação: Hall da Fama")
      .setColor("#FFD700")
      .setDescription(`**Solicitante:** <@${interaction.user.id}>\n**Cidade:** ${cityDisplayName}`)
      .addFields(
        { name: "Evento (Automático)", value: eventName },
        { name: "Vencedores (Formatado)", value: winnersText },
        { name: "Imagem 1", value: imageUrl },
        { name: "Imagem 2", value: imageUrl2 || "—" }
      )
      .setImage(imageUrl)
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${BTN_APPROVE_PREFIX}${reqId}`)
        .setLabel("✅ Aprovar e Postar")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`${BTN_REJECT_PREFIX}${reqId}`)
        .setLabel("❌ Recusar")
        .setStyle(ButtonStyle.Danger)
    );

    await approvalChannel.send({
      content: "Nova solicitação de Hall da Fama pendente.",
      embeds: [embed],
      components: [row]
    });

    await interaction.editReply("✅ Solicitação enviada para aprovação!");
    return true;
  }

  // 4. Aprovação
  if (interaction.isButton() && interaction.customId.startsWith(BTN_APPROVE_PREFIX)) {
    if (!canApprove(interaction.member, interaction.user.id)) {
      return interaction.reply({ content: "🚫 Você não tem permissão para aprovar.", ephemeral: true });
    }

    const reqId = interaction.customId.replace(BTN_APPROVE_PREFIX, "");

    if (processingApprovals.has(reqId)) {
      return interaction.reply({
        content: "⏳ Esse Hall da Fama já está sendo aprovado. Aguarde finalizar.",
        ephemeral: true
      });
    }

    processingApprovals.add(reqId);

    await interaction.deferReply({ ephemeral: true });

    const data = state.pendingRequests[reqId];

    if (!data) {
      processingApprovals.delete(reqId);
      return interaction.editReply("⚠️ Dados da solicitação expiraram.");
    }

    await interaction.message.edit({ components: [] }).catch(() => {});

    const hallChannel = await client.channels.fetch(HALL_CHANNEL_ID).catch(() => null);
    if (!hallChannel) return interaction.editReply("❌ Canal do Hall da Fama não encontrado.");

    const cityData = CITIES[data.cityKey];
const cityName = data.cityDisplayName || cityData.label;
const intro = getRandomIntro(); // Frase aleatória
const introLine = buildHallIntroLine(intro, data.eventName, cityName);

// Montagem da mensagem final (Estilo Diva/Grande)
const finalMessage = 
`# 🎉 :  **Santa Creators : ${data.eventName}** 🎉 

${introLine}

👏  Uma salva de palmas para os BRABOS! 👏 

<:12633559939374122111:1368796471297576970>  **HALL DA FAMA** <:12633559939374122111:1368796471297576970> 

${data.winnersText}

**Foi insano, mas mais uma vez os vencedores mostraram que a vitória só é possível com raça! <:__:1357520048318709840>**

||@everyone @here <@&${ROLE_CIDADAO}> <@&${ROLE_LIDERES}> <@&${cityData.roleId}>||

${data.imageUrl}${data.imageUrl2 ? `\n${data.imageUrl2}` : ''}`;

    const chunks = splitText(finalMessage);
    let sentMsg;
    for (const chunk of chunks) {
        sentMsg = await hallChannel.send({ content: chunk });
    }

    if (!sentMsg) {
      return interaction.editReply("❌ Falha ao enviar a mensagem do Hall da Fama. O conteúdo pode estar vazio.");
    }
    
    try {
      const emojis = ["💜", "🔥", "🚀", "👏", "🎉", "🤩", "🏆", "👑", "💸", "✨", "💯", "✅", "💎", "🫡", "🤝", "🤯", "👀", "📸", "⚡", "💣", "👻", "💀", "👽", "👾", "🤖", "🎃", "😺"];
      for (const e of emojis) await sentMsg.react(e).catch(() => {});
    } catch {}

    await ensureButtonAtBottom(hallChannel, client, true);

    dashEmit("halldafama:aprovado", {
      userId: data.userId,
      approverId: interaction.user.id,
      at: Date.now()
    });

    // ✅ Log de Auditoria
    await sendAuditHallLog(client, interaction.member, data, sentMsg);


    const embedApproved = EmbedBuilder.from(interaction.message.embeds[0])
      .setColor("#2ecc71")
      .setTitle("✅ Hall da Fama APROVADO")
      .setFooter({ text: `Aprovado por ${interaction.user.tag}` })
      .addFields({ name: '✅ Aprovado por', value: `${interaction.user} (\`${interaction.user.tag}\`)`, inline: false });

    await interaction.message.edit({ embeds: [embedApproved], components: [] });
    
    delete state.pendingRequests[reqId];
    saveState(state);
    processingApprovals.delete(reqId);
    await interaction.editReply("✅ Hall da Fama postado e pontos computados!");
    return true;
  }

  // 5. Reprovação
  if (interaction.isButton() && interaction.customId.startsWith(BTN_REJECT_PREFIX)) {
    if (!canApprove(interaction.member, interaction.user.id)) {
      return interaction.reply({ content: "🚫 Você não tem permissão para recusar.", ephemeral: true });
    }

    const reqId = interaction.customId.replace(BTN_REJECT_PREFIX, "");
    
    const embedRejected = EmbedBuilder.from(interaction.message.embeds[0])
      .setColor("#e74c3c")
      .setTitle("❌ Hall da Fama RECUSADO")
      .setFooter({ text: `Recusado por ${interaction.user.tag}` });

    await interaction.message.edit({ embeds: [embedRejected], components: [] });
    
    delete state.pendingRequests[reqId];
    saveState(state);
    await interaction.reply({ content: "❌ Solicitação recusada.", ephemeral: true });
    return true;
  }

  return false;
}
