import {
  ChannelType,
  PermissionsBitField,
} from "discord.js";

// ==========================================
// SANTA CREATORS — AUTO REACT LIMPO
// • Sem flood de logs
// • Sem backfill automático no ready
// • Só espera mensagem nova e reage
// ==========================================

const PHOTO_CHANNEL_ID = "1432149017378426941";
const ALL_MESSAGES_CHANNEL_ID = "1262262852949905414";

const MAX_REACTIONS_PER_MESSAGE = 20;
const BACKFILL_FETCH_PER_PAGE = 100;
const BACKFILL_MAX_MESSAGES = 400;
const IGNORE_BOT_MESSAGES = true;

const MANUAL_BACKFILL_COMMANDS = ["!reagirscantigas", "!reagirsc"];

const MANUAL_BACKFILL_ALLOWED_USER_IDS = [
  "660311795327828008",
  "1262262852949905408",
];

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

let reactionQueue = Promise.resolve();

function enqueue(task) {
  reactionQueue = reactionQueue
    .then(() => task())
    .catch(() => {});
  return reactionQueue;
}

export async function autoReactsFotosOnReady(client) {
  if (!client) return;

  if (client.__SC_AUTO_REACTS__) {
    return;
  }

  client.__SC_AUTO_REACTS__ = true;
  console.log("[SC_AUTO_REACTS] sistema inicializado.");
}

export async function autoReactsFotosHandleMessage(message, client, options = {}) {
  try {
    if (!message?.guild || !message?.channel) return false;
    if (message.system) return false;

    const allowBotMessage = options.allowBotMessage === true;

    if (IGNORE_BOT_MESSAGES && message.author?.bot && !allowBotMessage) {
      return false;
    }

    // comando manual continua existindo, mas só se a mensagem começar com ele
    if (!allowBotMessage && await handleManualBackfillCommand(message, client)) {
      return true;
    }

    const channelId = message.channel.id;

    // ignora tudo fora dos canais monitorados
    if (
      channelId !== PHOTO_CHANNEL_ID &&
      channelId !== ALL_MESSAGES_CHANNEL_ID
    ) {
      return false;
    }

    // canal geral -> reage em toda mensagem nova
    if (channelId === ALL_MESSAGES_CHANNEL_ID) {
      await reactToMessage(message, options.mode || "all");
      return false;
    }

    // canal de fotos -> reage só se tiver mídia
    if (channelId === PHOTO_CHANNEL_ID && hasMediaContent(message)) {
      await reactToMessage(message, options.mode || "media");
    }

    return false;
  } catch (err) {
    console.error("[SC_AUTO_REACTS] erro:", err?.message || err);
    return false;
  }
}

export async function autoReactsFotosProcessSentMessage(message, client, options = {}) {
  try {
    if (!message?.guild || !message?.channel) return false;

    const retries = Number(options.retries ?? 3);
    const delayMs = Number(options.delayMs ?? 900);

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        if (attempt > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));

          if (message.partial) {
            try {
              await message.fetch();
            } catch {}
          }
        }

        await autoReactsFotosHandleMessage(message, client, {
          allowBotMessage: true,
          mode: options.mode || "say",
        });

        // se for canal de foto e ainda não detectou mídia, tenta de novo nas próximas voltas
        if (
          message.channel?.id === PHOTO_CHANNEL_ID &&
          !hasMediaContent(message) &&
          attempt < retries - 1
        ) {
          continue;
        }

        break;
      } catch {}
    }

    return true;
  } catch (err) {
    console.error("[SC_AUTO_REACTS] erro ao processar mensagem enviada externamente:", err?.message || err);
    return false;
  }
}


async function handleManualBackfillCommand(message, client) {
  if (!message?.guild || !message?.channel) return false;
  if (message.author?.bot) return false;

  const content = String(message.content || "").trim();
  const lower = content.toLowerCase();

  const matchedCommand = MANUAL_BACKFILL_COMMANDS.find((cmd) =>
    lower.startsWith(cmd)
  );

  if (!matchedCommand) return false;

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

  if (["fotos", "foto", "media", "midia"].includes(targetRaw)) {
    targetChannelId = PHOTO_CHANNEL_ID;
    mode = "media";
    label = "canal de fotos/vídeos";
  } else if (["geral", "all"].includes(targetRaw)) {
    targetChannelId = ALL_MESSAGES_CHANNEL_ID;
    mode = "all";
    label = "canal geral";
  } else {
    await message.reply(
      "⚠️ Usa assim:\n`!reagirsc fotos`\n`!reagirsc geral`\n`!reagirsc fotos 200`\n`!reagirsc geral 400`"
    );
    return true;
  }

  let customMaxMessages = BACKFILL_MAX_MESSAGES;
  if (amountRaw && /^\d+$/.test(amountRaw)) {
    customMaxMessages = Math.max(1, Math.min(Number(amountRaw), 3000));
  }

  await message.reply(
    `🔄 Iniciando backfill manual SC no ${label}...\n📦 Limite: **${customMaxMessages}** mensagens.`
  );

  try {
    const result = await backfillChannel(client, targetChannelId, mode, {
      maxMessages: customMaxMessages,
      manual: true,
    });

    await message.reply(
      `✅ Backfill manual SC concluído em ${label}.\n` +
      `• Vasculhadas: **${result?.scanned ?? 0}**\n` +
      `• Processadas: **${result?.processed ?? 0}**`
    );
  } catch (err) {
    console.error("[SC_AUTO_REACTS] erro no backfill manual:", err?.message || err);
    await message.reply("❌ Deu erro ao rodar o backfill manual SC.");
  }

  return true;
}

function hasMediaContent(message) {
  try {
    const attachments = [...(message.attachments?.values?.() || [])];

    if (attachments.length > 0) {
      return true;
    }

    for (const embed of message.embeds || []) {
      if (
        embed?.image?.url ||
        embed?.thumbnail?.url ||
        embed?.video?.url ||
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
  } catch {}

  return false;
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

function extractCustomEmojiId(emoji) {
  const match = String(emoji).match(/^<a?:[^:]+:(\d+)>$/);
  return match?.[1] || null;
}

function reactionMatchesEmoji(reaction, emoji) {
  const customId = extractCustomEmojiId(emoji);

  if (customId) {
    return reaction?.emoji?.id === customId;
  }

  return reaction?.emoji?.name === emoji;
}

async function reactToMessage(message, mode = "unknown") {
  if (!message?.guild) return;

  const reactions = buildReactionList(message.guild);
  if (!reactions.length) return;

  for (const emoji of reactions) {
    await enqueue(async () => {
      try {
        const alreadyThere = message.reactions.cache.find((r) =>
          reactionMatchesEmoji(r, emoji)
        );

        if (alreadyThere?.me) return;
        if (message.reactions.cache.size >= 20 && !alreadyThere) return;

        await message.react(emoji);
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
          err?.code === 30010
        ) {
          return;
        }

        console.error(
          `[SC_AUTO_REACTS] erro ao reagir msg=${message.id} canal=${message.channel?.id} modo=${mode}:`,
          err?.message || err
        );
      }
    });
  }
}

async function backfillChannel(client, channelId, mode, options = {}) {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) {
    return { scanned: 0, processed: 0 };
  }

  if (
    channel.type !== ChannelType.GuildText &&
    channel.type !== ChannelType.GuildAnnouncement
  ) {
    return { scanned: 0, processed: 0 };
  }

  const maxMessages = Number(options.maxMessages || BACKFILL_MAX_MESSAGES);

  let lastId;
  let scanned = 0;
  let processed = 0;

  while (scanned < maxMessages) {
    const remaining = maxMessages - scanned;
    const limit = Math.min(BACKFILL_FETCH_PER_PAGE, remaining);

    const messages = await channel.messages.fetch({
      limit,
      before: lastId,
    }).catch(() => null);

    if (!messages?.size) break;

    const ordered = [...messages.values()].sort(
      (a, b) => a.createdTimestamp - b.createdTimestamp
    );

    for (const msg of ordered) {
      scanned++;

      if (!msg || msg.system) continue;
      if (IGNORE_BOT_MESSAGES && msg.author?.bot) continue;
      if (mode === "media" && !hasMediaContent(msg)) continue;

      await reactToMessage(msg, mode);
      processed++;
    }

    lastId = ordered[0]?.id;
    if (!lastId || messages.size < limit) break;
  }

  return { scanned, processed };
}