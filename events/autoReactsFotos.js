import {
  Events,
  ChannelType,
  PermissionsBitField,
} from "discord.js";

// ========= CONFIG =========
const PHOTO_CHANNEL_ID = "1432149017378426941";
const ALL_MESSAGES_CHANNEL_ID = "1262262852949905414";

const MAX_REACTIONS_PER_MESSAGE = 20;
const REACTION_DELAY_MS = 200;
const IGNORE_BOT_MESSAGES = true;

// 🔥 comando manual
const COMMAND = "!reagir";

// quem pode usar
const ALLOWED_USER_IDS = [
  // coloca teu ID aqui
  // "SEU_ID"
  "660311795327828008",
  "1262262852949905408"
];

// ========= EMOJIS =========
const PRIORITY_CUSTOM_EMOJI_NAMES = [
  "lgbt","festinha","gayyy","santacreators","abuser",
];

const UNICODE_REACTIONS = [
  "💜","❤️","😍","👏","🎉","🔥","👑","✨","🥳","💖"
];

// ========= GUARD =========
if (!globalThis.__AUTO_REACT_LIGHT__) {
  globalThis.__AUTO_REACT_LIGHT__ = true;

  const client = globalThis.client;
  // Garante que o client existe antes de iniciar
  if (client) setup(client);
}

// ========= FILA =========
let queue = Promise.resolve();

function enqueue(task) {
  queue = queue.then(task).catch(()=>{});
  return queue;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ========= PAGINAÇÃO (Fetch > 100) =========
async function fetchManyMessages(channel, limit) {
  let collected = [];
  let lastId = null;
  
  // Limite de segurança pra não explodir a RAM (ex: max 1000 por comando)
  const safeLimit = Math.min(limit, 1000);

  while (collected.length < safeLimit) {
    const options = { limit: Math.min(safeLimit - collected.length, 100) };
    if (lastId) options.before = lastId;
    
    const batch = await channel.messages.fetch(options).catch(() => null);
    if (!batch || batch.size === 0) break;
    
    collected.push(...batch.values());
    lastId = batch.last().id;
  }
  return collected;
}

// ========= SETUP =========
function setup(client) {

  // 🔥 mensagens novas
  client.on(Events.MessageCreate, async (message) => {
    if (await handleCommand(message)) return;
    processMessage(message);
  });

  // 🔥 detecta embeds que aparecem depois (links de imagens)
  client.on(Events.MessageUpdate, async (_old, newMessage) => {
    // Se for parcial, tenta buscar (mas sem travar)
    if (newMessage.partial) {
      try { await newMessage.fetch(); } catch { return; }
    }
    processMessage(newMessage);
  });

  // 🔥 mini varredura diária leve (10 msgs)
  // Inicia direto pois o módulo é carregado no ready
  setInterval(() => {
    lightScan(client);
  }, 24 * 60 * 60 * 1000); // 1 dia
  
  console.log("[AUTO_REACT] Sistema iniciado (v2 corrigida)");
}

// ========= PROCESSAMENTO =========
async function processMessage(message) {
  if (!message || !message.guild) return;
  if (IGNORE_BOT_MESSAGES && message.author.bot) return;

  // Verifica permissões básicas antes de tentar
  const perms = message.channel.permissionsFor(message.guild.members.me);
  if (!perms?.has(PermissionsBitField.Flags.AddReactions)) return;
  if (!perms?.has(PermissionsBitField.Flags.ReadMessageHistory)) return;

  if (message.channel.id === ALL_MESSAGES_CHANNEL_ID) {
    await react(message);
  }

  if (message.channel.id === PHOTO_CHANNEL_ID) {
    if (hasMedia(message)) {
      await react(message);
    }
  }
}

// ========= DETECTAR MIDIA =========
function hasMedia(message) {
  if (!message) return false;
  return message.attachments.size > 0 || message.embeds.length > 0;
}

// ========= EMOJIS =========
function getCustom(guild) {
  return guild.emojis.cache
    .filter(e => PRIORITY_CUSTOM_EMOJI_NAMES.some(n => e.name.includes(n)))
    .map(e => e.toString());
}

function buildReactions(guild) {
  return [...getCustom(guild), ...UNICODE_REACTIONS]
    .slice(0, MAX_REACTIONS_PER_MESSAGE);
}

// ========= REAGIR =========
async function react(message) {
  if (!message || !message.guild) return;
  const reactions = buildReactions(message.guild);

  for (const emoji of reactions) {
    await enqueue(async () => {
      try {
        // Verifica duplicidade usando o cache da mensagem
        const already = message.reactions.cache.find(r =>
          r.emoji.name === emoji || emoji.includes(r.emoji.id)
        );

        if (already?.me) return;

        if (message.reactions.cache.size >= 20 && !already) return;

        await message.react(emoji);
        await sleep(REACTION_DELAY_MS);
      } catch {}
    });
  }
}

// ========= COMANDO =========
async function handleCommand(message) {
  if (!message.content || !message.content.startsWith(COMMAND)) return false;

  const isAdmin = message.member.permissions.has(PermissionsBitField.Flags.Administrator);
  const isAllowed = ALLOWED_USER_IDS.includes(message.author.id);

  if (!isAdmin && !isAllowed) {
    // message.reply("❌ Sem permissão"); // opcional: não responder pra não poluir
    return true;
  }

  const amount = Number(message.content.split(" ")[1]) || 100;

  message.reply(`🔄 Processando últimas ${amount} mensagens (pode demorar um pouco)...`);

  const channel = message.channel;
  
  // ✅ Correção: Busca paginada
  const msgs = await fetchManyMessages(channel, amount);

  let processed = 0;
  // Itera array reverso (do mais antigo pro mais novo) ou normal, tanto faz
  for (const msg of msgs) {
    if (channel.id === PHOTO_CHANNEL_ID && !hasMedia(msg)) continue;
    await react(msg);
    processed++;
  }

  message.channel.send(`✅ Finalizado! Processadas ${processed} mensagens.`);
  return true;
}

// ========= SCAN LEVE =========
async function lightScan(client) {
  const channel = await client.channels.fetch(PHOTO_CHANNEL_ID).catch(()=>null);
  if (!channel) return;

  const msgs = await channel.messages.fetch({ limit: 10 });

  for (const msg of msgs.values()) {
    if (hasMedia(msg)) {
      await react(msg);
    }
  }

  // console.log("[AUTO_REACT] scan leve diário executado");
}