// d:\santacreators-main\events\autoReactsFotos.js
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  Events,
  ChannelType,
  PermissionsBitField,
} from "discord.js";

// ==========================================
// SANTA CREATORS — AUTO REACT (OTIMIZADO v2)
// ==========================================

// ========= CONFIG =========
const PHOTO_CHANNEL_ID = "1432149017378426941";
const ALL_MESSAGES_CHANNEL_ID = "1262262852949905414";

const MAX_REACTIONS_PER_MESSAGE = 20;
const BACKFILL_FETCH_PER_PAGE = 50; // Reduzido para aliviar a API
const BACKFILL_MAX_MESSAGES_HARD_LIMIT = 50; // Se não tiver estado salvo, lê apenas as últimas 50
const REACTION_DELAY_MS = 1500; // Aumentado: 1.5s entre reações para evitar 429
const IGNORE_BOT_MESSAGES = true;

const MANUAL_BACKFILL_COMMAND = "!reagirantigas";
const MANUAL_BACKFILL_ALLOWED_USER_IDS = [];

// ========= PERSISTÊNCIA =========
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, "../data");
const STATE_FILE = path.join(DATA_DIR, "autoreact_state.json");

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {}
  return {};
}

function saveState(data) {
  ensureDir();
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("[AUTO_REACTS] Erro ao salvar estado:", e);
  }
}

// ========= EMOJIS CUSTOM DO SERVIDOR (PRIORIDADE) =========
const PRIORITY_CUSTOM_EMOJI_NAMES = [
  "lgbt", "festinha", "gayyy", "santacreators", "abuser", "roxinho",
  "aqui", "huhu", "coracaoroxo", "coroaroxa", "palmas", "amarelo",
  "quebrada", "alertaa", "bunda", "fofinho", "ban", "e_diorgifs", "diabinho",
];

// ========= EMOJIS UNICODE PRA COMPLETAR =========
const UNICODE_REACTIONS = [
  "💜", "❤️", "🩷", "🧡", "💙", "💚", "💛", "😍", "🥰", "🤩",
  "😻", "👏", "🙌", "🎉", "🎊", "🔥", "✨", "👑", "💫", "🌟",
  "🥳", "🫶", "💕", "💖", "💞", "😁", "😄",
];

// ========= GUARD GLOBAL =========
if (!globalThis.__SC_AUTO_REACTS_FOTOS_BOOTSTRAPPED__) {
  globalThis.__SC_AUTO_REACTS_FOTOS_BOOTSTRAPPED__ = true;
  // Hook client is handled in setupAutoReacts
}

// ========= FILA GLOBAL (RATE LIMITER) =========
// Uma fila única para garantir que não spammamos a API de reações
const queue = [];
let processingQueue = false;

async function processQueue() {
  if (processingQueue) return;
  processingQueue = true;

  while (queue.length > 0) {
    const task = queue.shift();
    try {
      await task();
    } catch (e) {
      // Ignora erros comuns para não travar a fila
      if (!String(e).includes("Unknown Message")) {
         console.error("[AUTO_REACTS] Erro na fila:", e.message);
      }
    }
    // Delay obrigatório entre chamadas à API
    await new Promise((r) => setTimeout(r, REACTION_DELAY_MS));
  }

  processingQueue = false;
}

function enqueueReaction(message, emoji) {
  queue.push(async () => {
    try {
        // Verifica se a mensagem ainda existe e é válida antes de reagir
        if (!message || !message.channel) return;
        
        // Verifica se já reagimos (cache local do d.js)
        const existing = message.reactions.cache.find(r => 
            (r.emoji.id && emoji.includes(r.emoji.id)) || r.emoji.name === emoji
        );
        if (existing?.me) return;

        await message.react(emoji);
    } catch (err) {
        // Erros específicos de permissão ou mensagem deletada abortam silenciosamente
        const msg = String(err?.message || err);
        if (msg.includes("Unknown Message") || msg.includes("10008") || msg.includes("30010")) return;
        throw err;
    }
  });
  processQueue();
}

async function handleManualBackfillCommand(message, client) {
  if (!message?.guild || !message?.channel) return false;
  if (message.author?.bot) return false;

  const content = String(message.content || "").trim();
  if (!content.toLowerCase().startsWith(MANUAL_BACKFILL_COMMAND)) {
    return false;
  }

  const member = message.member;
  const isAdminByPerm =
    member?.permissions?.has(PermissionsBitField.Flags.Administrator) ||
    member?.permissions?.has(PermissionsBitField.Flags.ManageGuild);

  const isAllowedById =
    MANUAL_BACKFILL_ALLOWED_USER_IDS.length > 0 &&
    MANUAL_BACKFILL_ALLOWED_USER_IDS.includes(message.author.id);

  if (!isAdminByPerm && !isAllowedById) {
    await message.reply("❌ Você não tem permissão para usar esse comando.");
    return true;
  }

  const parts = content.split(/\s+/);
  const targetRaw = String(parts[1] || "").toLowerCase();
  const amountRaw = parts[2];

  let targetChannelId = null;
  let mode = null;
  let label = null;

  if (targetRaw === "fotos" || targetRaw === "foto" || targetRaw === "media") {
    targetChannelId = PHOTO_CHANNEL_ID;
    mode = "media";
    label = "canal de fotos/vídeos";
  } else if (targetRaw === "geral" || targetRaw === "all") {
    targetChannelId = ALL_MESSAGES_CHANNEL_ID;
    mode = "all";
    label = "canal geral";
  } else {
    await message.reply(
      "⚠️ Usa assim:\n`!reagirantigas fotos`\n`!reagirantigas geral`\n`!reagirantigas fotos 500`"
    );
    return true;
  }

  let customMaxMessages = 500; // Padrão seguro para manual
  if (amountRaw && /^\d+$/.test(amountRaw)) {
    customMaxMessages = Math.max(1, Math.min(Number(amountRaw), 2000)); // Limite duro de 2000
  }

  await message.reply(
    `🔄 Iniciando backfill manual no ${label}...\n📦 Limite: **${customMaxMessages}** mensagens.`
  );

  // No manual, ignoramos o estado salvo e forçamos a busca
  try {
    const result = await backfillChannel(client, targetChannelId, mode, {
      maxMessages: customMaxMessages,
      manual: true,
      ignoreState: true 
    });

    await message.reply(
      `✅ Backfill manual concluído em ${label}.\n` +
      `• Vasculhadas: **${result?.scanned ?? 0}**\n` +
      `• Processadas: **${result?.processed ?? 0}**`
    );
  } catch (err) {
    console.error("[AUTO_REACTS] erro no comando manual de backfill:", err);
    await message.reply("❌ Deu erro ao rodar o backfill manual.");
  }

  return true;
}

// ========= SETUP =========
export default function setupAutoReacts(client) {
  client.on(Events.ClientReady, async () => {
    // console.log("[AUTO_REACTS] ClientReady detectado. Iniciando backfill inteligente...");

    // Delay inicial para não competir com outros sistemas no boot
    setTimeout(async () => {
        try {
            await backfillChannel(client, PHOTO_CHANNEL_ID, "media");
        } catch (err) {
            console.error("[AUTO_REACTS] erro no backfill do canal de mídia:", err);
        }

        try {
            await backfillChannel(client, ALL_MESSAGES_CHANNEL_ID, "all");
        } catch (err) {
            console.error("[AUTO_REACTS] erro no backfill do canal geral:", err);
        }
    }, 15000); // 15 segundos após boot
  });

  client.on(Events.MessageCreate, async (message) => {
    try {
      if (await handleManualBackfillCommand(message, client)) {
        return;
      }
      await processMessage(message, "create");
    } catch (err) {
      console.error("[AUTO_REACTS] erro em MessageCreate:", err);
    }
  });
}

// ========= PROCESSAMENTO =========
async function processMessage(message, source = "unknown") {
  if (!message || !message.guild || message.system) return;
  if (IGNORE_BOT_MESSAGES && message.author?.bot) return;

  const channelId = message.channel.id;

  // Atualiza o estado da última mensagem vista em tempo real
  updateLastSeenState(channelId, message.id);

  if (channelId === ALL_MESSAGES_CHANNEL_ID) {
    await reactToMessage(message, "all", source);
    return;
  }

  if (channelId === PHOTO_CHANNEL_ID) {
    if (hasMediaContent(message)) {
      await reactToMessage(message, "media", source);
    }
    return;
  }
}

// ========= STATE HELPERS =========
function updateLastSeenState(channelId, messageId) {
    const state = loadState();
    state[channelId] = messageId;
    saveState(state);
}

// ========= DETECÇÃO DE MÍDIA =========
function hasMediaContent(message) {
  try {
    const attachments = [...message.attachments.values()];
    for (const att of attachments) {
      const ct = String(att.contentType || "").toLowerCase();
      if (ct.startsWith("image/") || ct.startsWith("video/")) return true;
    }
    // Simplificado: se tem attachment e não sabemos o tipo, assume que é mídia
    if (attachments.length > 0) return true;

    for (const embed of message.embeds || []) {
      if (embed?.image || embed?.video || embed?.thumbnail?.url || embed?.type === 'gifv' || embed?.type === 'image' || embed?.type === 'video') {
        return true;
      }
    }
    
    // Links comuns de mídia
    if (/(https?:\/\/.*\.(?:png|jpg|jpeg|gif|webp|mp4|mov))/i.test(message.content)) return true;
    
  } catch (err) {
    console.error("[AUTO_REACTS] erro ao detectar mídia:", err);
  }
  return false;
}

// ========= LISTA DE REAÇÕES =========
function buildReactionList(guild) {
  const finalList = [];
  const seen = new Set();

  const allEmojis = guild.emojis?.cache || [];
  
  // 1) Emojis custom prioritários
  for (const wantedName of PRIORITY_CUSTOM_EMOJI_NAMES) {
    const target = wantedName.toLowerCase();
    const found = allEmojis.find(e => e.name?.toLowerCase().includes(target));
    if (found && !seen.has(found.id)) {
        seen.add(found.id);
        finalList.push(found); // Passa o objeto emoji, não string
        if (finalList.length >= MAX_REACTIONS_PER_MESSAGE) return finalList;
    }
  }

  // 2) Unicode
  for (const emoji of UNICODE_REACTIONS) {
    if (!seen.has(emoji)) {
        seen.add(emoji);
        finalList.push(emoji);
        if (finalList.length >= MAX_REACTIONS_PER_MESSAGE) break;
    }
  }

  return finalList;
}

// ========= REAGIR =========
async function reactToMessage(message, mode, source = "unknown") {
  if (!message?.guild) return;

  const reactions = buildReactionList(message.guild);
  if (!reactions.length) return;

  // Adiciona na fila com delay
  for (const emoji of reactions) {
    enqueueReaction(message, emoji);
  }
}

// ========= BACKFILL OTIMIZADO =========
async function backfillChannel(client, channelId, mode, options = {}) {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)) {
    return { scanned: 0, processed: 0 };
  }

  // Se for automático (boot), usa estado salvo para não ler o canal inteiro
  let afterId = null;
  if (!options.ignoreState && !options.manual) {
      const state = loadState();
      afterId = state[channelId];
  }

  // Se temos um afterId, usamos 'after' no fetch (lendo do antigo pro novo).
  // Se NÃO temos, usamos 'limit' (lendo do novo pro antigo) mas com limite baixo.
  
  let scanned = 0;
  let processed = 0;
  let messages = [];

  try {
      if (afterId && !options.manual) {
          // Modo "Catch Up": Lê o que perdeu desde a última vez
          // Nota: Discord API 'after' tem limite. Se for muito antigo, pode falhar ou retornar pouco.
          // Nesse caso, assumimos que o bot ficou off muito tempo e lemos apenas as ultimas 50.
          
          const recent = await channel.messages.fetch({ limit: BACKFILL_FETCH_PER_PAGE }).catch(() => null);
          if (recent) messages = [...recent.values()];
          
          // Filtra apenas o que é mais novo que o salvo
          // (D.js collections não suportam 'after' nativo no fetch simples de limit, apenas via parâmetro explicito,
          // mas 'after' pega mensagens APÓS aquele ID cronologicamente. Vamos simplificar: pega as últimas X e filtra).
          messages = messages.filter(m => m.id > afterId);
      } else {
          // Modo "Fresh" ou Manual: Pega as últimas X mensagens
          const limit = options.maxMessages || BACKFILL_MAX_MESSAGES_HARD_LIMIT;
          let lastId = undefined;
          
          while (scanned < limit) {
              const batchSize = Math.min(BACKFILL_FETCH_PER_PAGE, limit - scanned);
              const batch = await channel.messages.fetch({ limit: batchSize, before: lastId }).catch(() => null);
              if (!batch || batch.size === 0) break;
              
              const batchArr = [...batch.values()];
              messages.push(...batchArr);
              scanned += batchArr.length;
              lastId = batch.last()?.id;
          }
      }
  } catch (e) {
      console.error("[AUTO_REACTS] Erro no fetch do backfill:", e);
      return { scanned, processed };
  }

  // Ordena cronologicamente (antigo -> novo) para processar na ordem
  messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  let newestId = null;

  for (const message of messages) {
    // Atualiza o mais recente processado
    if (!newestId || message.id > newestId) newestId = message.id;

    if (!message.system && (!IGNORE_BOT_MESSAGES || !message.author.bot)) {
        if (mode === "all" || (mode === "media" && hasMediaContent(message))) {
            // Verifica se já reagiu para economizar API
            const hasMyReaction = message.reactions.cache.some(r => r.me);
            if (!hasMyReaction) {
                await reactToMessage(message, mode, options.manual ? "manual" : "backfill");
                processed++;
            }
        }
    }
  }

  // Atualiza o estado com a mensagem mais recente encontrada no canal
  if (newestId && !options.manual) {
      updateLastSeenState(channelId, newestId);
  }

  console.log(
    `[AUTO_REACTS] Backfill ${options.manual ? "manual" : "auto"} em ${channel.name}: ${messages.length} lidas, ${processed} na fila.`
  );

  return { scanned: messages.length, processed };
}
