

// D:\santacreators-main\events\autoReactsFotos.js
import {
  Events,
  ChannelType,
  PermissionsBitField,
} from "discord.js";

// ==========================================
// SANTA CREATORS — AUTO REACT EM PUBLICAÇÕES
// ==========================================
// 1) Canal de FOTOS/UPS:
//    - reage quando detectar imagem OU vídeo
//
// 2) Canal geral:
//    - reage em TODAS as mensagens
//
// 3) Usa emojis do servidor com prioridade:
//    - lgbt
//    - Festinha
//    - gayyy
//    - santacreators
//    - abuser
//
// 4) Backfill ao ligar:
//    - tenta reagir em mensagens recentes
//
// 5) Fila interna:
//    - evita bater forte demais em rate limit
// ==========================================

// ========= CONFIG =========
const PHOTO_CHANNEL_ID = "1432149017378426941";         // canal onde cai foto/ups
const ALL_MESSAGES_CHANNEL_ID = "1262262852949905414";  // canal que reage em tudo

const MAX_REACTIONS_PER_MESSAGE = 20;
const BACKFILL_FETCH_PER_PAGE = 100;   // máximo por fetch da API
const BACKFILL_MAX_MESSAGES = 5000;
const REACTION_DELAY_MS = 200;
const IGNORE_BOT_MESSAGES = true;

const MANUAL_BACKFILL_COMMAND = "!reagirantigas";
const MANUAL_BACKFILL_ALLOWED_USER_IDS = [
  // se quiser travar por usuário, coloca IDs aqui
  // "123456789012345678",
];

// ========= EMOJIS CUSTOM DO SERVIDOR (PRIORIDADE) =========
// Vai tentar achar exatamente ou por includes.
const PRIORITY_CUSTOM_EMOJI_NAMES = [
  "lgbt",
  "festinha",
  "gayyy",
  "santacreators",
  "abuser",
  "roxinho",
  "aqui",
  "huhu",
  "coracaoroxo",
  "coroaroxa",
  "palmas",
  "amarelo",
  "quebrada",
  "alertaa",
  "bunda",
  "fofinho",
  "ban",
  "e_diorgifs",
  "diabinho",
];

// ========= EMOJIS UNICODE PRA COMPLETAR =========
const UNICODE_REACTIONS = [
  "💜",
  "❤️",
  "🩷",
  "🧡",
  "💙",
  "💚",
  "💛",
  "😍",
  "🥰",
  "🤩",
  "😻",
  "👏",
  "🙌",
  "🎉",
  "🎊",
  "🔥",
  "✨",
  "👑",
  "💫",
  "🌟",
  "🥳",
  "🫶",
  "💕",
  "💖",
  "💞",
  "😁",
  "😄",
];

// ========= GUARD GLOBAL =========
if (!globalThis.__SC_AUTO_REACTS_FOTOS_BOOTSTRAPPED__) {
  globalThis.__SC_AUTO_REACTS_FOTOS_BOOTSTRAPPED__ = true;

  const client = globalThis.client;

  if (!client) {
    console.warn("[AUTO_REACTS] globalThis.client não encontrado. O módulo foi importado antes do client ficar global.");
  } else {
    console.log("[AUTO_REACTS] módulo carregado.");
    setupAutoReacts(client);
  }
}

// ========= FILA GLOBAL =========
let reactionQueue = Promise.resolve();

function enqueue(task) {
  reactionQueue = reactionQueue
    .then(() => task())
    .catch((err) => {
      console.error("[AUTO_REACTS] erro na fila:", err);
    });

  return reactionQueue;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  if (targetRaw === "fotos" || targetRaw === "foto" || targetRaw === "media" || targetRaw === "midia") {
    targetChannelId = PHOTO_CHANNEL_ID;
    mode = "media";
    label = "canal de fotos/vídeos";
  } else if (targetRaw === "geral" || targetRaw === "all") {
    targetChannelId = ALL_MESSAGES_CHANNEL_ID;
    mode = "all";
    label = "canal geral";
  } else {
    await message.reply(
      "⚠️ Usa assim:\n`!reagirantigas fotos`\n`!reagirantigas geral`\n`!reagirantigas fotos 2000`\n`!reagirantigas geral 3000`"
    );
    return true;
  }

  let customMaxMessages = BACKFILL_MAX_MESSAGES;
  if (amountRaw && /^\d+$/.test(amountRaw)) {
    customMaxMessages = Math.max(1, Math.min(Number(amountRaw), 20000));
  }

  await message.reply(
    `🔄 Iniciando backfill manual no ${label}...\n📦 Limite: **${customMaxMessages}** mensagens.`
  );

  try {
    const result = await backfillChannel(client, targetChannelId, mode, {
      maxMessages: customMaxMessages,
      manual: true,
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
function setupAutoReacts(client) {
  client.on(Events.ClientReady, async () => {
    console.log("[AUTO_REACTS] ClientReady detectado.");

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

    console.log("[AUTO_REACTS] backfill concluído.");
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

  client.on(Events.MessageUpdate, async (_oldMessage, newMessage) => {
    try {
      if (newMessage.partial) {
        try {
          await newMessage.fetch();
        } catch {}
      }

      await processMessage(newMessage, "update");
    } catch (err) {
      console.error("[AUTO_REACTS] erro em MessageUpdate:", err);
    }
  });
}

// ========= PROCESSAMENTO =========
async function processMessage(message, source = "unknown") {
  if (!message) return;
  if (!message.guild) return;
  if (!message.channel) return;
  if (message.system) return;
  if (IGNORE_BOT_MESSAGES && message.author?.bot) return;

  const channelId = message.channel.id;

  // Canal que reage em tudo
  if (channelId === ALL_MESSAGES_CHANNEL_ID) {
    await reactToMessage(message, "all", source);
    return;
  }

  // Canal que reage apenas em foto/vídeo
  if (channelId === PHOTO_CHANNEL_ID) {
    if (hasMediaContent(message)) {
      await reactToMessage(message, "media", source);
    }
    return;
  }
}

// ========= DETECÇÃO DE MÍDIA =========
function hasMediaContent(message) {
  try {
    const attachments = [...message.attachments.values()];

    for (const att of attachments) {
      const ct = String(att.contentType || "").toLowerCase();
      const name = String(att.name || "").toLowerCase();
      const url = String(att.url || "").toLowerCase();
      const proxyURL = String(att.proxyURL || "").toLowerCase();

      // imagem
      if (ct.startsWith("image/")) return true;

      // vídeo
      if (ct.startsWith("video/")) return true;

      // fallback por extensão
      if (
        name.endsWith(".png") ||
        name.endsWith(".jpg") ||
        name.endsWith(".jpeg") ||
        name.endsWith(".gif") ||
        name.endsWith(".webp") ||
        name.endsWith(".bmp") ||
        name.endsWith(".avif") ||
        name.endsWith(".heic") ||
        name.endsWith(".mp4") ||
        name.endsWith(".mov") ||
        name.endsWith(".webm") ||
        name.endsWith(".mkv") ||
        name.endsWith(".avi") ||
        name.endsWith(".m4v") ||
        url.endsWith(".png") ||
        url.endsWith(".jpg") ||
        url.endsWith(".jpeg") ||
        url.endsWith(".gif") ||
        url.endsWith(".webp") ||
        url.endsWith(".bmp") ||
        url.endsWith(".avif") ||
        url.endsWith(".heic") ||
        url.endsWith(".mp4") ||
        url.endsWith(".mov") ||
        url.endsWith(".webm") ||
        url.endsWith(".mkv") ||
        url.endsWith(".avi") ||
        url.endsWith(".m4v") ||
        proxyURL.endsWith(".png") ||
        proxyURL.endsWith(".jpg") ||
        proxyURL.endsWith(".jpeg") ||
        proxyURL.endsWith(".gif") ||
        proxyURL.endsWith(".webp") ||
        proxyURL.endsWith(".bmp") ||
        proxyURL.endsWith(".avif") ||
        proxyURL.endsWith(".heic") ||
        proxyURL.endsWith(".mp4") ||
        proxyURL.endsWith(".mov") ||
        proxyURL.endsWith(".webm") ||
        proxyURL.endsWith(".mkv") ||
        proxyURL.endsWith(".avi") ||
        proxyURL.endsWith(".m4v")
      ) {
        return true;
      }
    }

    // embeds com imagem/vídeo/thumbnail/gif
    for (const embed of message.embeds || []) {
      if (
        embed?.image?.url ||
        embed?.thumbnail?.url ||
        embed?.video?.url ||
        embed?.provider?.name ||
        embed?.type === "gifv"
      ) {
        return true;
      }
    }

    // links no conteúdo
    const content = String(message.content || "").toLowerCase();
    if (
      content.includes(".png") ||
      content.includes(".jpg") ||
      content.includes(".jpeg") ||
      content.includes(".gif") ||
      content.includes(".webp") ||
      content.includes(".bmp") ||
      content.includes(".avif") ||
      content.includes(".heic") ||
      content.includes(".mp4") ||
      content.includes(".mov") ||
      content.includes(".webm") ||
      content.includes(".mkv") ||
      content.includes(".avi") ||
      content.includes(".m4v")
    ) {
      return true;
    }
  } catch (err) {
    console.error("[AUTO_REACTS] erro ao detectar mídia:", err);
  }

  return false;
}

// ========= MONTAR LISTA DE REAÇÕES =========
function buildReactionList(guild) {
  const finalList = [];
  const seen = new Set();

  // 1) emojis custom prioritários do servidor
  const priorityCustoms = getPriorityCustomEmojis(guild);
  for (const emoji of priorityCustoms) {
    const key = String(emoji?.id || emoji);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    finalList.push(emoji.toString());

    if (finalList.length >= MAX_REACTIONS_PER_MESSAGE) {
      return finalList;
    }
  }

  // 2) completa com emojis unicode
  for (const emoji of UNICODE_REACTIONS) {
    if (seen.has(emoji)) continue;
    seen.add(emoji);
    finalList.push(emoji);

    if (finalList.length >= MAX_REACTIONS_PER_MESSAGE) {
      break;
    }
  }

  return finalList;
}

function getPriorityCustomEmojis(guild) {
  if (!guild?.emojis?.cache) return [];

  const all = [...guild.emojis.cache.values()].filter((e) => e.available !== false);
  const selected = [];
  const usedIds = new Set();

  for (const wantedName of PRIORITY_CUSTOM_EMOJI_NAMES) {
    const target = String(wantedName).toLowerCase();

    let found = all.find((emoji) => String(emoji.name || "").toLowerCase() === target);

    if (!found) {
      found = all.find((emoji) => String(emoji.name || "").toLowerCase().includes(target));
    }

    if (found && !usedIds.has(found.id)) {
      usedIds.add(found.id);
      selected.push(found);
    }
  }

  return selected;
}

// ========= REAGIR =========
async function reactToMessage(message, mode, source = "unknown") {
  if (!message?.guild) return;

  const reactions = buildReactionList(message.guild);
  if (!reactions.length) return;

  for (const emoji of reactions) {
    await enqueue(async () => {
      try {
        if (!message?.channel) return;

        const alreadyThere = message.reactions.cache.find((r) => {
          if (typeof r.emoji.id === "string" && emoji.startsWith("<")) {
            return emoji.includes(r.emoji.id);
          }
          return r.emoji.name === emoji;
        });

        if (alreadyThere?.me) return;
        
        // Otimização: Se já tem 20 reações únicas e essa não existe lá, nem tenta (vai dar erro 30010)
        // Mas se ela JÁ existe (alguém reagiu), o bot consegue somar (+1), então deixa passar.
        if (message.reactions.cache.size >= 20 && !alreadyThere) {
           return; 
        }

        await message.react(emoji);
        await sleep(REACTION_DELAY_MS);
      } catch (err) {
        const msg = String(err?.message || err);

        if (
          msg.includes("Unknown Emoji") ||
          msg.includes("Missing Access") ||
          msg.includes("Missing Permissions") ||
          msg.includes("Unknown Message") ||
          msg.includes("Invalid Form Body") ||
          msg.includes("10014") ||
          msg.includes("50001") ||
          msg.includes("50013") ||
          msg.includes("10008") ||
          msg.includes("30010") || // Máximo de reações atingido
          err.code === 30010
        ) {
          return;
        }

        console.error(
          `[AUTO_REACTS] erro ao reagir msg=${message.id} canal=${message.channel?.id} modo=${mode} fonte=${source} emoji=${emoji}:`,
          err
        );
      }
    });
  }
}

// ========= BACKFILL =========
async function backfillChannel(client, channelId, mode, options = {}) {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) {
    console.warn(`[AUTO_REACTS] canal ${channelId} não encontrado no backfill.`);
    return { scanned: 0, processed: 0 };
  }

  if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) {
    console.warn(`[AUTO_REACTS] canal ${channelId} não é texto/anúncio. Tipo: ${channel.type}`);
    return { scanned: 0, processed: 0 };
  }

  const maxMessages = Number(options.maxMessages || BACKFILL_MAX_MESSAGES);
  const sourceLabel = options.manual ? "manual" : "auto";

  let lastId = undefined;
  let scanned = 0;
  let processed = 0;

  while (scanned < maxMessages) {
    const remaining = maxMessages - scanned;
    const limit = Math.min(BACKFILL_FETCH_PER_PAGE, remaining);

    const messages = await channel.messages.fetch({
      limit,
      before: lastId,
    }).catch(() => null);

    if (!messages?.size) {
      break;
    }

    const ordered = [...messages.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    for (const message of ordered) {
      scanned++;

      if (!message || message.system) continue;
      if (IGNORE_BOT_MESSAGES && message.author?.bot) continue;

      if (mode === "media" && !hasMediaContent(message)) {
        continue;
      }

      await reactToMessage(message, mode, sourceLabel);
      processed++;
    }

    lastId = ordered[0]?.id;
    if (!lastId || messages.size < limit) {
      break;
    }
  }

  console.log(
    `[AUTO_REACTS] backfill ${sourceLabel} do canal ${channelId} concluído. Vasculhadas: ${scanned} | Processadas: ${processed}`
  );

  return { scanned, processed };
}



