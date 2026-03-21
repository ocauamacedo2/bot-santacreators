import {
  Events,
  ChannelType,
  PermissionsBitField,
} from "discord.js";

// ==========================================
// SANTA CREATORS — AUTO REACT ISOLADO
// FORMATO PADRÃO DO PROJETO: autoReactsFotosOnReady(client)
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
    .catch((err) => {
      console.error("[SC_AUTO_REACTS] erro na fila:", err?.message || err);
    });

  return reactionQueue;
}

export async function autoReactsFotosOnReady(client) {
  console.log("🚀 AUTO REACT FOI CHAMADO");

  if (!client) {
    console.warn("[SC_AUTO_REACTS] client ausente.");
    return;
  }

  if (client.__SC_AUTO_REACTS_ISOLATED__) {
    console.log("[SC_AUTO_REACTS] já estava inicializado.");
    return;
  }

  client.__SC_AUTO_REACTS_ISOLATED__ = true;
  console.log("[SC_AUTO_REACTS] inicializando no padrão OnReady...");

  client.on(Events.MessageCreate, async (message) => {
    try {
      console.log("📩 MessageCreate capturado:", message.content || "[sem texto]", "| canal:", message.channel?.id);

      if (await handleManualBackfillCommand(message, client)) return;
      await processSantaMessage(message);
    } catch (err) {
      console.error("[SC_AUTO_REACTS] erro em MessageCreate:", err);
    }
  });

  console.log("[SC_AUTO_REACTS] listener de MessageCreate registrado.");
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

  console.log("[SC_AUTO_REACTS] comando reconhecido:", content);

  console.log(`[SC_AUTO_REACTS] comando detectado: ${content} por ${message.author.tag}`);

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
    console.error("[SC_AUTO_REACTS] erro no comando manual:", err);
    await message.reply("❌ Deu erro ao rodar o backfill manual SC.");
  }

  return true;
}

async function processSantaMessage(message) {
  if (!message) return;
  if (!message.guild) return;
  if (!message.channel) return;
  if (message.system) return;
  if (IGNORE_BOT_MESSAGES && message.author?.bot) return;

  const channelId = message.channel.id;
  console.log("[SC_AUTO_REACTS] processando canal:", channelId, "| msg:", message.id);

  if (channelId === ALL_MESSAGES_CHANNEL_ID) {
    console.log(`[SC_AUTO_REACTS] mensagem detectada no canal geral: ${message.id}`);
    await reactToMessage(message, "all");
    return;
  }

  if (channelId === PHOTO_CHANNEL_ID) {
    const hasMedia = hasMediaContent(message);
    console.log(`[SC_AUTO_REACTS] checando mídia no canal de fotos: ${message.id} | resultado=${hasMedia}`);

    if (hasMedia) {
      console.log(`[SC_AUTO_REACTS] mídia detectada no canal de fotos: ${message.id}`);
      await reactToMessage(message, "media");
    }
  }
}

function hasMediaContent(message) {
  try {
    const attachments = [...(message.attachments?.values?.() || [])];

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
    console.error("[SC_AUTO_REACTS] erro ao detectar mídia:", err?.message || err);
  }

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

async function reactToMessage(message, mode = "unknown") {
  if (!message?.guild) return;

  const reactions = buildReactionList(message.guild);
  if (!reactions.length) {
    console.log("[SC_AUTO_REACTS] nenhuma reação disponível no servidor.");
    return;
  }

  for (const emoji of reactions) {
    await enqueue(async () => {
      try {
        const alreadyThere = message.reactions.cache.find((r) => {
          if (typeof r.emoji.id === "string" && String(emoji).startsWith("<")) {
            return String(emoji).includes(r.emoji.id);
          }
          return r.emoji.name === emoji;
        });

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
          `[SC_AUTO_REACTS] erro ao reagir msg=${message.id} canal=${message.channel?.id} modo=${mode} emoji=${emoji}:`,
          err
        );
      }
    });
  }
}

async function backfillChannel(client, channelId, mode, options = {}) {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) {
    console.warn(`[SC_AUTO_REACTS] canal ${channelId} não encontrado.`);
    return { scanned: 0, processed: 0 };
  }

  if (
    channel.type !== ChannelType.GuildText &&
    channel.type !== ChannelType.GuildAnnouncement
  ) {
    console.warn(`[SC_AUTO_REACTS] canal ${channelId} não é texto/anúncio. Tipo: ${channel.type}`);
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

  console.log(
    `[SC_AUTO_REACTS] backfill concluído canal=${channelId} vasculhadas=${scanned} processadas=${processed}`
  );

  return { scanned, processed };
}