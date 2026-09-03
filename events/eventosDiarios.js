// d:\santacreators-main\events\eventosDiarios.js
import fs from "node:fs";
import path from "node:path";
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

import {
  getOperationalDateKeySP,
  getOperationalMidnightTimestampSP,
  recordExpectedOperation,
  recordApprovalCreated,
  recordApprovalDecision,
  markExpectedOperationPosted,
} from "../utils/approvalOperationalIntelligence.js";

///teste
// ================= PERSISTÊNCIA =================
const DATA_DIR = path.resolve(process.cwd(), "data");
const STATE_FILE = path.join(DATA_DIR, "eventos_diarios_state.json");
const CRONO_FILE = path.join(DATA_DIR, "cronograma_state.json"); // ✅ NOVO

const ensureDir = () => { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); };

// ✅ Escrita Atômica (mais segura: escreve num .tmp e renomeia, evitando corromper se o bot cair no meio)
const saveState = (data) => { 
  ensureDir(); 
  const tmp = `${STATE_FILE}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, STATE_FILE);
  } catch (e) {
    console.error("[EventosDiarios] Erro ao salvar state:", e);
  }
};

const loadState = () => { 
  try { if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch (e) { console.error("[EventosDiarios] Erro load:", e); } 
  return { pendingRequests: {} }; 
};

// ================= CONFIGURAÇÃO =================
const EVENTOS_CHANNEL_ID = "1385003944803041371"; // Canal Oficial de Eventos Diários
const APPROVAL_CHANNEL_ID = "1387864036259004436"; // Canal de Aprovação

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

function normalizeCityText(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function resolveCityKey(value = "") {
  const normalized = normalizeCityText(value);
  if (!normalized) return null;

  return Object.keys(CITIES).find((key) => {
    const cityLabel = normalizeCityText(CITIES[key].label);

    return (
      normalized === key ||
      normalized === cityLabel ||
      normalized.includes(key) ||
      cityLabel.includes(normalized) ||
      normalized.includes(cityLabel)
    );
  }) || null;
}

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

const BTN_OPEN_MENU = "evd_open_menu";
const SEL_CITY = "evd_select_city";
const MODAL_SUBMIT = "evd_modal_submit";
const BTN_APPROVE_PREFIX = "evd_approve_";
const BTN_REJECT_PREFIX = "evd_reject_";

// Carrega os pedidos pendentes do arquivo ao iniciar
const BTN_EDIT_LAST = "evd_edit_last";
const MODAL_EDIT_SUBMIT = "evd_modal_edit_submit";
const BTN_EDIT_CITY = "evd_edit_city";
const MODAL_CITY_SUBMIT = "evd_modal_city_submit";
let state = loadState();

const processingApprovals = new Set();

function buildDisabledApprovalButtons(reqId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${BTN_APPROVE_PREFIX}${reqId}`)
      .setLabel("⏳ Postando...")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`${BTN_REJECT_PREFIX}${reqId}`)
      .setLabel("🔒 Travado")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );
}

// ================= LÓGICA INTELIGENTE (CRONOGRAMA) =================

// Pega o dia da semana em SP (seg, ter, qua...)
function getTodayKey(sourceType = "schedule") {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));

  if (sourceType === "madrugada" && now.getHours() < 3) {
    now.setDate(now.getDate() - 1);
  }

  const days = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
  return days[now.getDay()];
}

function hasMadrugadaAgora(eventData) {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const hour = now.getHours();

  if (hour >= 3) return true;

  const timeText = String(eventData?.time || "").toLowerCase();

  return (
    /\b0?1[:h]?00\b/i.test(timeText) ||
    /\b0?0[:h]?00\b/i.test(timeText)
  );
}

// Lê o cronograma e retorna os dados de HOJE
function getTodayEventOptions() {
  try {
    if (!fs.existsSync(CRONO_FILE)) return [];

    const crono = JSON.parse(fs.readFileSync(CRONO_FILE, "utf8"));
    const scheduleKey = getTodayKey("schedule");
    const madrugadaKey = getTodayKey("madrugada");

    const options = [];

    const madru = crono.madrugada?.[madrugadaKey];
    if (madru && madru.active && hasMadrugadaAgora(madru)) {
      options.push({
        ...madru,
        sourceType: "madrugada",
        eventKey: `${madrugadaKey}:madrugada`,
      });
    }

    const normal = crono.schedule?.[scheduleKey];
    if (normal && normal.active) {
      options.push({
        ...normal,
        sourceType: "schedule",
        eventKey: `${scheduleKey}:schedule`,
      });
    }

    return options;
  } catch (e) {
    console.error("[EventosDiarios] Erro ao ler cronograma:", e);
    return [];
  }
}

function getTodayEventData(preferredEventKey = null) {
  const options = getTodayEventOptions();

  if (preferredEventKey) {
    return options.find((ev) => ev.eventKey === preferredEventKey) || null;
  }

  return options[0] || null;
}

function splitText(text, maxLength = 2000) {
  const chunks = [];
  let remaining = String(text || "");

  while (remaining.length > maxLength) {
    const window = remaining.slice(0, maxLength);
    let cut = window.lastIndexOf("\n\n");
    if (cut >= maxLength / 2) cut += 2;
    else {
      cut = window.lastIndexOf("\n");
      if (cut >= maxLength / 2) cut += 1;
      else {
        cut = window.lastIndexOf(" ");
        cut = cut >= maxLength / 2 ? cut + 1 : maxLength;
      }
    }

    // Não corta um emoji entre as duas unidades UTF-16.
    const lastCode = remaining.charCodeAt(cut - 1);
    if (lastCode >= 0xD800 && lastCode <= 0xDBFF) cut--;

    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut);
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

const eventMessageLocks = new Set();
const EVENT_REACTIONS = ["💜", "🔥", "🚀", "👏", "🎉", "🤩", "🤯", "🏆", "👑", "💸", "👀", "✨", "💯", "✅", "📸", "💎", "⚡", "💣", "🫡", "🤝", "👻", "💀", "👽", "👾", "🤖", "🎃", "😺"];

function rememberEventMessages(messages, content) {
  if (!messages.length) return;
  state.eventMessageGroups ??= {};
  state.eventMessageGroups[messages[0].id] = {
    ids: messages.map(message => message.id),
    content,
  };
  saveState(state);
}

function isEventMentionsLine(line = "") {
  const tokens = String(line).trim().split(/\s+/);
  if (tokens.length !== 5) return false;

  const required = [
    "@everyone",
    "@here",
    `<@&${ROLE_CIDADAO}>`,
    `<@&${ROLE_LIDERES}>`,
  ];

  return required.every(token => tokens.includes(token)) &&
    Object.values(CITIES).some(city => tokens.includes(`<@&${city.roleId}>`));
}

async function readEventMessages(channel, firstMessage) {
  const saved = state.eventMessageGroups?.[firstMessage.id];
  if (saved) {
    const messages = [];
    for (const id of saved.ids) {
      // Falha de acesso não deve ser confundida com uma parte apagada.
      messages.push(await channel.messages.fetch(id));
    }
    return { messages, content: saved.content };
  }

  // Recupera eventos antigos que este arquivo publicou em partes consecutivas.
  const messages = [firstMessage];
  if (!firstMessage.content.split("\n").some(isEventMentionsLine)) {
    const fetched = await channel.messages.fetch({ after: firstMessage.id, limit: 100 });
    const following = [...fetched.values()].sort((a, b) =>
      BigInt(a.id) < BigInt(b.id) ? -1 : 1
    );

    for (const message of following) {
      if (message.author.id !== firstMessage.author.id ||
          message.components.length || message.embeds.length ||
          !message.content ||
          message.content.includes("# 🎉 :  **Santa Creators :") ||
          message.createdTimestamp - firstMessage.createdTimestamp > 60000) break;

      messages.push(message);
      if (message.content.split("\n").some(isEventMentionsLine)) break;
    }

    if (!messages.at(-1).content.split("\n").some(isEventMentionsLine)) {
      throw new Error("Não foi possível identificar todas as partes antigas do evento com segurança.");
    }
  }

  const content = messages.map(message => message.content).join("\n");
  rememberEventMessages(messages, content);
  return { messages, content };
}

async function applyEventReactions(message) {
  // O Discord aceita até 20 tipos diferentes de reação por mensagem.
  for (const emoji of EVENT_REACTIONS) {
    const existing = message.reactions.cache.find(reaction => reaction.emoji.name === emoji);
    if (existing?.me) continue;
    if (!existing && message.reactions.cache.size >= 20) break;
    try {
      await message.react(emoji);
    } catch (error) {
      console.error("[EventosDiarios] Não foi possível adicionar reação:", emoji, error.message);
      break;
    }
  }
}

async function syncEventMessages(channel, fullContent, firstMessage = null) {
  const lockKey = channel.id;
  if (eventMessageLocks.has(lockKey)) {
    throw new Error("Outra atualização do evento está em andamento. Aguarde e tente novamente.");
  }
  eventMessageLocks.add(lockKey);

  try {
    const previous = firstMessage
      ? await readEventMessages(channel, firstMessage)
      : { messages: [], content: "" };
    const chunks = splitText(fullContent);
    if (!chunks.length) throw new Error("O conteúdo do evento está vazio.");
    const messages = [...previous.messages];

    // Salva cada etapa: uma falha não perde os IDs das partes já enviadas.
    for (let index = 0; index < chunks.length; index++) {
      const payload = { content: chunks[index] };
      if (firstMessage) payload.allowedMentions = { parse: [] };
      if (messages[index]) {
        messages[index] = await messages[index].edit(payload);
      } else {
        messages.push(await channel.send(payload));
      }
      rememberEventMessages(messages, messages.map(message => message.content).join("\n"));
    }

    while (messages.length > chunks.length) {
      await messages.at(-1).delete();
      messages.pop();
      rememberEventMessages(messages, messages.map(message => message.content).join("\n"));
    }

    rememberEventMessages(messages, fullContent);

    // Move somente as reações do próprio bot para o final; preserva as dos membros.
    for (const message of messages.slice(0, -1)) {
      for (const reaction of message.reactions.cache.values()) {
        if (reaction.me && EVENT_REACTIONS.includes(reaction.emoji.name)) {
          await reaction.users.remove(message.author.id).catch(error => {
            console.error("[EventosDiarios] Erro ao mover reação:", error.message);
          });
        }
      }
    }
    await applyEventReactions(messages.at(-1));
    return messages;
  } finally {
    eventMessageLocks.delete(lockKey);
  }
}

function getTodayPostKey() {
  return new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function getPostedEventKeys(scope = "eventosDiarios") {
  const key = getTodayPostKey();
  state.postedEventKeys ??= {};
  state.postedEventKeys[scope] ??= {};
  state.postedEventKeys[scope][key] ??= [];
  return state.postedEventKeys[scope][key];
}

function getNextTodayEventData(scope = "eventosDiarios") {
  const options = getTodayEventOptions();
  const posted = getPostedEventKeys(scope);

  return options.find((ev) => !posted.includes(ev.eventKey)) || options[options.length - 1] || null;
}

function markTodayEventPosted(eventKey, scope = "eventosDiarios") {
  if (!eventKey) return;

  const posted = getPostedEventKeys(scope);

  if (!posted.includes(eventKey)) {
    posted.push(eventKey);
    saveState(state);
  }
}

// ============================================================================
// NPS OPERACIONAL — EVENTOS DIÁRIOS ESPERADOS PELO CRONOGRAMA
// ============================================================================

function registerTodayExpectedEventsForNps() {
  try {
    const events =
      getTodayEventOptions();

    if (
      !Array.isArray(events) ||
      events.length === 0
    ) {
      return;
    }

    const now =
      Date.now();

    const dateKey =
      getOperationalDateKeySP(
        now
      );

    const midnight =
      getOperationalMidnightTimestampSP(
        now
      );

    for (
      const eventData of
      events
    ) {
      if (
        !eventData?.eventKey
      ) {
        continue;
      }

      recordExpectedOperation({
        system:
          "eventos_diarios",

        dateKey,

        eventKey:
          eventData.eventKey,

        label:
          eventData.title ||
          eventData.eventName ||
          eventData.name ||
          eventData.eventKey,

        expectedAt:
          midnight,
      });
    }
  } catch (error) {
    console.error(
      "[EventosDiarios] Erro ao registrar eventos esperados no NPS:",
      error
    );
  }
}

function startEventosDiariosOperationalMonitor() {
  if (
    globalThis.__SC_EVENTOS_DIARIOS_OPERATIONAL_MONITOR__
  ) {
    return;
  }

  globalThis.__SC_EVENTOS_DIARIOS_OPERATIONAL_MONITOR__ =
    true;

  registerTodayExpectedEventsForNps();

  setInterval(
    () => {
      registerTodayExpectedEventsForNps();
    },
    10 * 60 * 1000
  );
}

function isRequestProcessing(reqId) {
  state.processingRequests ??= {};
  return Boolean(state.processingRequests[reqId]);
}

function lockRequestProcessing(reqId, userId) {
  state.processingRequests ??= {};
  state.processingRequests[reqId] = {
    userId,
    lockedAt: Date.now()
  };
  saveState(state);
}

function unlockRequestProcessing(reqId) {
  state.processingRequests ??= {};
  delete state.processingRequests[reqId];
  saveState(state);
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
      .setLabel("📅 Registrar Evento Diário")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("📢"),
    new ButtonBuilder()
      .setCustomId(BTN_EDIT_LAST)
      .setLabel("✏️ Editar Último Evento")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("✍️"),
    new ButtonBuilder()
      .setCustomId(BTN_EDIT_CITY)
      .setLabel("🌆 Editar Última CDD")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("🌆")
  );
}

function createEventModal(cityKey, eventData) {
  let defaultTitle = "";
  let defaultDescription = "";
  const eventKey = eventData?.eventKey || "auto";

  // Verifica se o evento do dia bate com a cidade selecionada
  if (eventData && eventData.city) {
    const cName = eventData.city.toLowerCase();
    const cKey = cityKey.toLowerCase();
    const cLabel = (CITIES[cityKey]?.label || "").toLowerCase();
    
    // Match flexível (ex: "Nobre" bate com "Cidade Nobre" ou "nobre")
    if (cName === cKey || cLabel.includes(cName) || cName.includes(cKey)) {
      defaultTitle = eventData.eventName || "";
      const prizes = eventData.prizes || "A definir";
      defaultDescription = `🏆 **Premiação:**\n${prizes}\n\n📝 **Regras/Descrição:**\n- `;
    }
  }

  const modal = new ModalBuilder()
    .setCustomId(`${MODAL_SUBMIT}:${cityKey}:${eventKey}`)
    .setTitle(`Evento - ${CITIES[cityKey].label}`);

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("evd_title")
        .setLabel("Título do Evento")
        .setPlaceholder("Ex: SANTA DO CRIME")
        .setValue(defaultTitle)
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("evd_description")
        .setLabel("Descrição / Regras / Horário")
        .setPlaceholder("Cole aqui todo o texto explicativo...")
        .setValue(defaultDescription)
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("evd_image")
        .setLabel("Link da Imagem (Banner)")
        .setPlaceholder("https://cdn.discordapp.com/...")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("evd_custom_city")
        .setLabel("Cidade do Evento")
        .setPlaceholder("Ex: Nobre, Cidade Nobre, Santa, Grande ou Maresia")
        .setValue(CITIES[cityKey]?.label || "")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
    )
  );
  return modal;
}

// ✅ Lógica inteligente: se force=false, só cria se não existir. Se force=true, apaga e recria (pra descer).
async function ensureButtonAtBottom(channel, client, force = true) {
  try {
    const messages = await channel.messages.fetch({ limit: 20 }).catch(() => null);
    if (!messages) return;

    const myMsgs = messages.filter((m) => {
      if (m.author.id !== client.user.id || m.components.length === 0) return false;

      const allButtons = m.components.flatMap(row => row.components || []);
      return allButtons.some(c => [BTN_OPEN_MENU, BTN_EDIT_LAST, BTN_EDIT_CITY].includes(c.customId));
    });

    // ✅ Checa se já existe um painel de botões atualizado com os 3 botões
    const upToDateMsg = myMsgs.find((m) => {
      const allButtons = m.components.flatMap(row => row.components || []);
      const ids = allButtons.map(c => c.customId);

      return (
        ids.includes(BTN_OPEN_MENU) &&
        ids.includes(BTN_EDIT_LAST) &&
        ids.includes(BTN_EDIT_CITY)
      );
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
    console.error("[EventosDiarios] Erro ao mover botão:", e);
  }
}

// ================= EXPORTS =================

export async function eventosDiariosOnReady(client) {
  // Garante que o estado seja carregado no boot
  state = loadState();

  // Registra no NPS quais Eventos Diários realmente
  // deveriam existir de acordo com o cronograma vigente.
  startEventosDiariosOperationalMonitor();

  const channel = await client.channels.fetch(EVENTOS_CHANNEL_ID).catch(() => null);
  if (channel && channel.isTextBased()) {
    // ✅ No restart, passa false para não spammar se já tiver botão
    await ensureButtonAtBottom(channel, client, false);

    // ✅ Auto-correção: Converte embeds antigos para texto ao iniciar
    console.log('[EventosDiarios] Verificando embeds antigos para converter...');
    try {
      const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
      if (messages) {
        for (const msg of messages.values()) {
          // Apenas mensagens do bot com embeds
          if (msg.author.id !== client.user.id || msg.embeds.length === 0) continue;

          const embed = msg.embeds[0];
          // Verifica se é um embed de evento diário
          if (embed.title && embed.title.includes("Santa Creators :")) {
            const title = embed.title.replace(/🎉\s*:\s*\*\*Santa Creators\s*:\s*/i, '').replace(/\*\*\s*🎉/i, '').trim();
            const description = embed.description || '';
            const imageUrl = embed.image?.url || '';
            const mentions = msg.content || ''; // Menções ficam no conteúdo

            const newContent = 
`# 🎉 :  **Santa Creators : ${title}** 🎉 

${description}

${mentions}

${imageUrl}`;

            // Converte a mensagem existente e vincula as partes adicionais.
            rememberEventMessages([msg], newContent);
            await syncEventMessages(channel, newContent, msg);
            await msg.edit({ embeds: [] });
            console.log(`[EventosDiarios] Mensagem de evento ${msg.id} convertida de embed para texto.`);
          }
        }
      }
    } catch (e) {
      console.error('[EventosDiarios] Erro ao tentar converter embeds antigos:', e);
    }
    console.log('[EventosDiarios] Verificação de embeds antigos concluída.');
  }
}

export async function eventosDiariosHandleInteraction(interaction, client) {
  if (!interaction.guild) return false;

  if (interaction.isButton() && interaction.customId === BTN_OPEN_MENU) {
    if (!hasPermission(interaction.member, interaction.user.id)) {
      return interaction.reply({ content: "🚫 Sem permissão.", ephemeral: true });
    }

    // ✅ Tenta detectar cidade automaticamente pelo cronograma
const eventData = getNextTodayEventData("eventosDiarios");
let autoCityKey = null;

    if (eventData && eventData.city) {
      const normalized = eventData.city.toLowerCase().trim();
      // Tenta achar a chave da cidade
      const foundKey = Object.keys(CITIES).find(k => 
        k === normalized || CITIES[k].label.toLowerCase().includes(normalized) || normalized.includes(k)
      );
      if (foundKey) autoCityKey = foundKey;
    }

    if (autoCityKey) {
      const modal = createEventModal(autoCityKey, eventData);
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
      content: "🌆 **Em qual cidade será o evento?**",
      components: [row],
      ephemeral: true
    });
    return true;
  }

  if (interaction.isStringSelectMenu() && interaction.customId === SEL_CITY) {
    const cityKey = interaction.values[0];
    
    // ✅ Pega dados do evento de hoje para pré-preencher
const eventOptions = getTodayEventOptions();
const posted = getPostedEventKeys("eventosDiarios");

const eventData =
  eventOptions.find((ev) => {
    const cName = ev.city?.toLowerCase().trim();
    return cName && !posted.includes(ev.eventKey) && (
      cName === cityKey ||
      CITIES[cityKey].label.toLowerCase().includes(cName) ||
      cName.includes(cityKey)
    );
  }) ||
  eventOptions.find((ev) => {
    const cName = ev.city?.toLowerCase().trim();
    return cName && (
      cName === cityKey ||
      CITIES[cityKey].label.toLowerCase().includes(cName) ||
      cName.includes(cityKey)
    );
  }) ||
  getNextTodayEventData("eventosDiarios");

const modal = createEventModal(cityKey, eventData);
    await interaction.showModal(modal);
    return true;
  }

  if (interaction.isButton() && interaction.customId === BTN_EDIT_CITY) {
    if (!hasPermission(interaction.member, interaction.user.id)) {
      return interaction.reply({ content: "🚫 Sem permissão para editar a cidade.", ephemeral: true });
    }

    const eventChannel = await client.channels.fetch(EVENTOS_CHANNEL_ID).catch(() => null);
    if (!eventChannel) {
      return interaction.reply({ content: "❌ Canal de Eventos não encontrado.", ephemeral: true });
    }

    const messages = await eventChannel.messages.fetch({ limit: 50 }).catch(() => null);
    if (!messages) {
      return interaction.reply({ content: "❌ Não foi possível buscar as mensagens do canal de eventos.", ephemeral: true });
    }

    const lastEventMessage = messages
      .filter(m => m.author.id === client.user.id && m.content.includes("# 🎉 :  **Santa Creators :"))
      .sort((a, b) => b.createdTimestamp - a.createdTimestamp)
      .first();

    if (!lastEventMessage) {
      return interaction.reply({ content: "❌ Nenhum evento recente encontrado para editar a cidade.", ephemeral: true });
    }

    const modal = new ModalBuilder()
      .setCustomId(`${MODAL_CITY_SUBMIT}:${lastEventMessage.id}`)
      .setTitle("🌆 Editar Cidade do Evento");

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("evd_city_key")
          .setLabel("Cidade correta")
          .setPlaceholder("nobre, santa, grande ou maresia")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );

    await interaction.showModal(modal);
    return true;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith(MODAL_CITY_SUBMIT)) {
    if (!hasPermission(interaction.member, interaction.user.id)) {
      return interaction.reply({ content: "🚫 Sem permissão para editar a cidade.", ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const messageId = interaction.customId.split(":")[1];
    const rawCity = interaction.fields.getTextInputValue("evd_city_key").toLowerCase().trim();

    const cityKey = Object.keys(CITIES).find(k =>
      k === rawCity ||
      CITIES[k].label.toLowerCase().includes(rawCity) ||
      rawCity.includes(k)
    );

    if (!cityKey || !CITIES[cityKey]) {
      return interaction.editReply("❌ Cidade inválida. Use: nobre, santa, grande ou maresia.");
    }

    const eventChannel = await client.channels.fetch(EVENTOS_CHANNEL_ID).catch(() => null);
    if (!eventChannel) {
      return interaction.editReply("❌ Canal de Eventos não encontrado.");
    }

    const messageToEdit = await eventChannel.messages.fetch(messageId).catch(() => null);
    if (!messageToEdit) {
      return interaction.editReply("❌ A mensagem do evento original não foi encontrada. Talvez tenha sido apagada.");
    }

    const cityData = CITIES[cityKey];

    let completeEvent;
    try {
      completeEvent = await readEventMessages(eventChannel, messageToEdit);
    } catch (error) {
      console.error("[EventosDiarios] Erro ao ler evento:", error);
      return interaction.editReply("❌ Não consegui ler todas as partes do evento. Nenhum texto foi alterado.");
    }

    const oldContentWithoutMentions = completeEvent.content
      .split("\n")
      .filter(line => !isEventMentionsLine(line))
      .join("\n")
      .trim();

    const newMentions = `@everyone @here <@&${ROLE_CIDADAO}> <@&${ROLE_LIDERES}> <@&${cityData.roleId}>`;

    const finalContent = `${oldContentWithoutMentions}\n\n${newMentions}`;

    try {
      await syncEventMessages(eventChannel, finalContent, messageToEdit);
      await ensureButtonAtBottom(eventChannel, client, true);
    } catch (error) {
      console.error("[EventosDiarios] Erro ao editar cidade:", error);
      return interaction.editReply("❌ Não consegui concluir a atualização. Os IDs das partes processadas foram mantidos; confira o evento antes de tentar novamente.");
    }

    await interaction.editReply(`✅ Cidade do último Evento Diário alterada para: **${cityData.label}**`);
    return true;
  }

  if (interaction.isButton() && interaction.customId === BTN_EDIT_LAST) {
    if (!hasPermission(interaction.member, interaction.user.id)) {
      return interaction.reply({ content: "🚫 Sem permissão para editar.", ephemeral: true });
    }

    // await interaction.deferReply({ ephemeral: true }); // Removido para corrigir erro 'InteractionAlreadyReplied'

    const eventChannel = await client.channels.fetch(EVENTOS_CHANNEL_ID).catch(() => null);
    if (!eventChannel) {
      return interaction.reply({ content: "❌ Canal de Eventos não encontrado.", ephemeral: true });
    }

    const messages = await eventChannel.messages.fetch({ limit: 50 }).catch(() => null);
    if (!messages) {
      return interaction.reply({ content: "❌ Não foi possível buscar as mensagens do canal de eventos.", ephemeral: true });
    }

    // Find the most recent event message from the bot
    const lastEventMessage = messages
      .filter(m => m.author.id === client.user.id && m.content.includes("# 🎉 :  **Santa Creators :"))
      .sort((a, b) => b.createdTimestamp - a.createdTimestamp)
      .first();

    if (!lastEventMessage) {
      return interaction.reply({ content: "❌ Nenhum evento recente encontrado para editar.", ephemeral: true });
    }

    let completeEvent;
    try {
      completeEvent = await readEventMessages(eventChannel, lastEventMessage);
    } catch (error) {
      console.error("[EventosDiarios] Erro ao ler evento:", error);
      return interaction.reply({ content: "❌ Não consegui identificar todas as partes do evento para editar.", ephemeral: true });
    }

    // O formulário recebe o conteúdo completo de todas as mensagens.
    const lines = completeEvent.content.split('\n');
    const titleLineIndex = lines.findIndex(l => l.startsWith('# 🎉 :'));
    if (titleLineIndex === -1) {
        return interaction.reply({ content: "❌ Formato de título do evento não encontrado.", ephemeral: true });
    }
    const title = lines[titleLineIndex].match(/# 🎉 :  \*\*Santa Creators : (.*?)\*\* 🎉/)?.[1] || '';

    const imageUrlLineIndex = lines.findLastIndex(l => /^https?:\/\/\S+$/.test(l.trim()));
    const mentionsLineIndex = lines.findLastIndex(isEventMentionsLine);
    const imageUrl = imageUrlLineIndex > -1 ? lines[imageUrlLineIndex] : '';

    const descriptionStartIndex = titleLineIndex + 2;
    let descriptionEndIndex = lines.length;
    if (imageUrlLineIndex > -1) {
        descriptionEndIndex = imageUrlLineIndex;
    }
    if (mentionsLineIndex > -1 && mentionsLineIndex < descriptionEndIndex) {
        descriptionEndIndex = mentionsLineIndex;
    }
    while (descriptionEndIndex > descriptionStartIndex && lines[descriptionEndIndex - 1].trim() === '') {
        descriptionEndIndex--;
    }

    const description = lines.slice(descriptionStartIndex, descriptionEndIndex).join('\n');

    const modal = new ModalBuilder()
      .setCustomId(`${MODAL_EDIT_SUBMIT}:${lastEventMessage.id}`)
      .setTitle(`✏️ Editando Evento`);

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("evd_edit_title")
          .setLabel("Título do Evento")
          .setValue(title)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("evd_edit_description")
          .setLabel("Descrição / Regras / Horário")
          .setValue(description)
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("evd_edit_image")
          .setLabel("Link da Imagem (Banner)")
          .setValue(imageUrl)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );
    
    await interaction.showModal(modal);
    return true;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith(MODAL_EDIT_SUBMIT)) {
    if (!hasPermission(interaction.member, interaction.user.id)) {
      return interaction.reply({ content: "🚫 Sem permissão para editar.", ephemeral: true });
    }
    
    await interaction.deferReply({ ephemeral: true });

    const messageId = interaction.customId.split(":")[1];
    const newTitle = interaction.fields.getTextInputValue("evd_edit_title");
    const newDescription = interaction.fields.getTextInputValue("evd_edit_description");
    const newImageUrl = interaction.fields.getTextInputValue("evd_edit_image");

    const eventChannel = await client.channels.fetch(EVENTOS_CHANNEL_ID).catch(() => null);
    if (!eventChannel) {
      return interaction.editReply("❌ Canal de Eventos não encontrado.");
    }

    const messageToEdit = await eventChannel.messages.fetch(messageId).catch(() => null);
    if (!messageToEdit) {
      return interaction.editReply("❌ A mensagem do evento original não foi encontrada. Talvez tenha sido apagada.");
    }

    let completeEvent;
    try {
      completeEvent = await readEventMessages(eventChannel, messageToEdit);
    } catch (error) {
      console.error("[EventosDiarios] Erro ao ler evento:", error);
      return interaction.editReply("❌ Não consegui ler todas as partes do evento. Nenhum texto foi alterado.");
    }

    // Preserva somente o rodapé oficial, sem confundir com as regras.
    const oldContent = completeEvent.content;
    const oldMentions = oldContent.split('\n').findLast(isEventMentionsLine) || '';

    const newMessageContent = 
`# 🎉 :  **Santa Creators : ${newTitle}** 🎉 

${newDescription.trim()}

${newImageUrl}

${oldMentions}`;

    try {
      await syncEventMessages(eventChannel, newMessageContent, messageToEdit);
      await ensureButtonAtBottom(eventChannel, client, true);
    } catch (error) {
      console.error("[EventosDiarios] Erro ao editar evento:", error);
      return interaction.editReply("❌ Não consegui concluir a atualização. Os IDs das partes processadas foram mantidos; confira o evento antes de tentar novamente.");
    }

    await interaction.editReply("✅ Evento editado com sucesso!");
    return true;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith(MODAL_SUBMIT)) {
    await interaction.deferReply({ ephemeral: true });

const [, cityKey, eventKeyFromModal] = interaction.customId.split(":");
if (!cityKey || !CITIES[cityKey]) {
  return interaction.editReply("❌ Erro: Cidade não identificada.");
}

const eventData =
  getTodayEventData(eventKeyFromModal !== "auto" ? eventKeyFromModal : null) ||
  getNextTodayEventData("eventosDiarios");

const title = interaction.fields.getTextInputValue("evd_title");
const description = interaction.fields.getTextInputValue("evd_description");
const imageUrl = interaction.fields.getTextInputValue("evd_image");
const customCityInput = interaction.fields.getTextInputValue("evd_custom_city")?.trim() || "";

const finalCityKey = resolveCityKey(customCityInput) || cityKey;

if (!finalCityKey || !CITIES[finalCityKey]) {
  return interaction.editReply("❌ Cidade inválida. Use: nobre, cidade nobre, santa, cidade santa, grande, cidade grande, maresia ou cidade maresia.");
}

const reqId = `${interaction.user.id}-${Date.now()}`;
    
state.pendingRequests[reqId] = {
  userId:
    interaction.user.id,

  cityKey:
    finalCityKey,

  title,

  description,

  imageUrl,

  eventKey:
    eventData?.eventKey ||
    null,

  expectedDateKey:
    getOperationalDateKeySP(),

  createdAt:
    Date.now(),

  operationId:
    reqId,
};

saveState(state);

recordApprovalCreated({
  system:
    "eventos_diarios",

  operationId:
    reqId,

  eventKey:
    eventData?.eventKey ||
    null,

  creatorId:
    interaction.user.id,

  createdAt:
    state.pendingRequests[
      reqId
    ].createdAt,
});

    const approvalChannel = await client.channels.fetch(APPROVAL_CHANNEL_ID).catch(() => null);
    if (!approvalChannel) {
      return interaction.editReply("❌ Canal de aprovação não encontrado.");
    }

    const embed = new EmbedBuilder()
      .setTitle("🛡️ Aprovação: Evento Diário")
      .setColor("#9b59b6")
      .setDescription(`**Solicitante:** <@${interaction.user.id}>\n**Cidade:** ${CITIES[finalCityKey].label}`)
      .addFields(
        { name: "Título", value: title },
        { name: "Descrição (Preview)", value: description.slice(0, 1000) + (description.length > 1000 ? "..." : "") },
        { name: "Imagem", value: imageUrl }
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

    const approvalMessage =
      await approvalChannel.send({
        content:
          "Nova solicitação de Evento Diário pendente.",

        embeds:
          [embed],

        components:
          [row]
      });

    try {
      dashEmit(
        "eventosdiarios:criado",
        {
          __at:
            state.pendingRequests[
              reqId
            ].createdAt,

          createdAt:
            state.pendingRequests[
              reqId
            ].createdAt,

          operationId:
            reqId,

          recordId:
            reqId,

          messageId:
            approvalMessage.id,

          channelId:
            approvalMessage.channelId,

          guildId:
            approvalMessage.guildId,

          userId:
            interaction.user.id,

          creatorId:
            interaction.user.id,

          source:
            "eventos_diarios",

          dedupeKey:
            `eventosdiarios:criado:${reqId}`,
        }
      );
    } catch {}

    await interaction.editReply(
      "✅ Solicitação enviada para aprovação!"
    );   return true;
  }

  if (interaction.isButton() && interaction.customId.startsWith(BTN_APPROVE_PREFIX)) {
    if (!canApprove(interaction.member, interaction.user.id)) {
      return interaction.reply({ content: "🚫 Você não tem permissão para aprovar.", ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const reqId = interaction.customId.replace(BTN_APPROVE_PREFIX, "");

    if (isRequestProcessing(reqId)) {
      return interaction.editReply("⏳ Essa solicitação já está sendo processada. Aguarde finalizar.");
    }

    const data = state.pendingRequests[reqId];

    if (!data) {
      return interaction.editReply("⚠️ Dados da solicitação não encontrados (antigos ou expirados).");
    }

    lockRequestProcessing(reqId, interaction.user.id);

    await interaction.message.edit({
      components: []
    }).catch(() => {});

    try {
      const eventChannel = await client.channels.fetch(EVENTOS_CHANNEL_ID).catch(() => null);
      if (!eventChannel) {
        unlockRequestProcessing(reqId);
        return interaction.editReply("❌ Canal de Eventos não encontrado.");
      }

      const cityData = CITIES[data.cityKey];

      const mentions = `@everyone @here <@&${ROLE_CIDADAO}> <@&${ROLE_LIDERES}> <@&${cityData.roleId}>`;

      // ✅ ALTERAÇÃO: Volta a ser mensagem de texto, mas com 'split' para evitar erro de limite
      const finalMessage = 
`# 🎉 :  **Santa Creators : ${data.title}** 🎉 

${data.description.trim()}

${data.imageUrl}

${mentions}`;

      const sentMessages = await syncEventMessages(eventChannel, finalMessage);
      const sentMsg = sentMessages.at(-1);

if (!sentMsg) {
  unlockRequestProcessing(reqId);

  return interaction.editReply(
    "❌ Falha ao enviar a mensagem do evento. O conteúdo pode estar vazio."
  );
}

const postedAt =
  Date.now();

recordApprovalDecision({
  system:
    "eventos_diarios",

  operationId:
    reqId,

  decision:
    "approved",

  approverId:
    interaction.user.id,

  decidedAt:
    postedAt,

  postedAt,
});

if (
  data.eventKey
) {
  markExpectedOperationPosted({
    system:
      "eventos_diarios",

    dateKey:
      data.expectedDateKey ||
      getOperationalDateKeySP(
        postedAt
      ),

    eventKey:
      data.eventKey,

    postedAt,

    operationId:
      reqId,
  });
}

// ✅ As reações já foram aplicadas na última parte por syncEventMessages.

      // ✅ Aqui passa true para forçar o botão a descer
      await ensureButtonAtBottom(eventChannel, client, true);

dashEmit(
  "eventosdiarios:aprovado",
  {
    __at:
      postedAt,

    decidedAt:
      postedAt,

    postedAt,

    createdAt:
      Number(
        data.createdAt ||
        0
      ),

          operationId:
            reqId,

          recordId:
            reqId,

          userId:
            data.userId,

          creatorId:
            data.userId,

          approverId:
            interaction.user.id,

          executorId:
            interaction.user.id,

          source:
            "eventos_diarios",

          decision:
            "approved",

          dedupeKey:
            `eventosdiarios:aprovado:${reqId}`,
        }
      );

      const embedApproved = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor("#2ecc71")
        .setTitle("✅ Evento Diário APROVADO")
        .setFooter({ text: `Aprovado por ${interaction.user.tag}` })
        .addFields({ name: '✅ Aprovado por', value: `${interaction.user} (\`${interaction.user.tag}\`)`, inline: false });

      await interaction.message.edit({ embeds: [embedApproved], components: [] }).catch(() => {});
      
      markTodayEventPosted(data.eventKey, "eventosDiarios");

      delete state.pendingRequests[reqId];
      unlockRequestProcessing(reqId);
      saveState(state); // Salva a remoção

      await interaction.editReply("✅ Evento postado e pontos computados!");
      return true;
    } catch (e) {
      console.error("[EventosDiarios] Erro ao aprovar evento diário:", e);
      unlockRequestProcessing(reqId);
      await interaction.editReply("❌ Erro ao aprovar/postar o Evento Diário. Verifique o console.");
      return true;
    }
  }

  if (interaction.isButton() && interaction.customId.startsWith(BTN_REJECT_PREFIX)) {
    if (!canApprove(interaction.member, interaction.user.id)) {
      return interaction.reply({ content: "🚫 Você não tem permissão para recusar.", ephemeral: true });
    }

    const reqId = interaction.customId.replace(BTN_REJECT_PREFIX, "");

    if (isRequestProcessing(reqId)) {
      return interaction.reply({ content: "⏳ Essa solicitação já está sendo processada. Aguarde finalizar.", ephemeral: true });
    }

    lockRequestProcessing(reqId, interaction.user.id);
    
    const embedRejected = EmbedBuilder.from(interaction.message.embeds[0])
      .setColor("#e74c3c")
      .setTitle("❌ Evento Diário RECUSADO")
      .setFooter({ text: `Recusado por ${interaction.user.tag}` });

    await interaction.message.edit({
      embeds:
        [embedRejected],

      components:
        []
    }).catch(() => {});

   const rejectedData =
  state.pendingRequests[
    reqId
  ];

if (
  rejectedData
) {
  const rejectedAt =
    Date.now();

  try {
    dashEmit(
      "eventosdiarios:reprovado",
      {
        __at:
          rejectedAt,

        decidedAt:
          rejectedAt,

        createdAt:
          Number(
            rejectedData.createdAt ||
            0
          ),

        operationId:
          reqId,

        recordId:
          reqId,

        userId:
          rejectedData.userId,

        creatorId:
          rejectedData.userId,

        approverId:
          interaction.user.id,

        executorId:
          interaction.user.id,

        source:
          "eventos_diarios",

        decision:
          "rejected",

        dedupeKey:
          `eventosdiarios:reprovado:${reqId}`,
      }
    );
  } catch {}

  recordApprovalDecision({
    system:
      "eventos_diarios",

    operationId:
      reqId,

    decision:
      "rejected",

    approverId:
      interaction.user.id,

    decidedAt:
      rejectedAt,
  });
}

delete state.pendingRequests[
  reqId
];

unlockRequestProcessing(
  reqId
);

saveState(state);

await interaction.reply({
  content:
    "❌ Solicitação recusada.",

  ephemeral:
    true
});
    return true;
  }

  return false;
}
