// D:\santacreators-main\events\autoReactsFotos.js
import {
  Events,
} from "discord.js";

// ==========================================
// SANTA CREATORS — AUTO REACT LEVE
// ==========================================
// • NÃO faz backfill
// • NÃO varre mensagens antigas
// • NÃO tem comando manual
// • Reage somente nas próximas mensagens
//
// 1) Canal de FOTOS/UPS:
//    - reage quando detectar imagem OU vídeo
//
// 2) Canal geral:
//    - reage em TODAS as mensagens
//
// 3) Usa emojis do servidor com prioridade
// ==========================================

// ========= CONFIG =========
const PHOTO_CHANNEL_ID = "1432149017378426941";         // canal onde cai foto/ups
const ALL_MESSAGES_CHANNEL_ID = "1262262852949905414";  // canal que reage em tudo

const MAX_REACTIONS_PER_MESSAGE = 20;
const REACTION_DELAY_MS = 200;
const IGNORE_BOT_MESSAGES = true;

// ========= EMOJIS CUSTOM DO SERVIDOR (PRIORIDADE) =========
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
if (!globalThis.__SC_AUTO_REACTS_FOTOS_LIGHT_BOOTSTRAPPED__) {
  globalThis.__SC_AUTO_REACTS_FOTOS_LIGHT_BOOTSTRAPPED__ = true;

  const client = globalThis.client;

  if (!client) {
    console.warn("[AUTO_REACTS_LIGHT] globalThis.client não encontrado. O módulo foi importado antes do client ficar global.");
  } else {
    console.log("[AUTO_REACTS_LIGHT] módulo carregado.");
    setupAutoReacts(client);
  }
}

// ========= FILA GLOBAL =========
let reactionQueue = Promise.resolve();

function enqueue(task) {
  reactionQueue = reactionQueue
    .then(() => task())
    .catch((err) => {
      console.error("[AUTO_REACTS_LIGHT] erro na fila:", err);
    });

  return reactionQueue;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ========= SETUP =========
function setupAutoReacts(client) {
  client.on(Events.MessageCreate, async (message) => {
    try {
      await processMessage(message, "create");
    } catch (err) {
      console.error("[AUTO_REACTS_LIGHT] erro em MessageCreate:", err);
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
      console.error("[AUTO_REACTS_LIGHT] erro em MessageUpdate:", err);
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

      if (ct.startsWith("image/")) return true;
      if (ct.startsWith("video/")) return true;

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
    console.error("[AUTO_REACTS_LIGHT] erro ao detectar mídia:", err);
  }

  return false;
}

// ========= MONTAR LISTA DE REAÇÕES =========
function buildReactionList(guild) {
  const finalList = [];
  const seen = new Set();

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

        // Se a mensagem já bateu o limite de reações únicas, não tenta criar outra nova
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
          msg.includes("30010") ||
          err.code === 30010
        ) {
          return;
        }

        console.error(
          `[AUTO_REACTS_LIGHT] erro ao reagir msg=${message.id} canal=${message.channel?.id} modo=${mode} fonte=${source} emoji=${emoji}:`,
          err
        );
      }
    });
  }
}