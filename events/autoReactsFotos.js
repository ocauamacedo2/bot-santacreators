import {
  Events,
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

const MEDIA_CHANNEL_IDS = [
  PHOTO_CHANNEL_ID,
  "1385003944803041371", // Eventos Diários
  "1474605177771397223", // Cronograma / Agenda
  "1386503496353976470", // Hall da Fama
];

const EVENT_REACTION_CHANNEL_IDS = [
  "1386503496353976470", // Hall da Fama
  "1474605177771397223", // Cronograma / Agenda
  "1385003944803041371", // Eventos Diários
];

const REACT_ONLY_IF_MESSAGE_ALREADY_HAS_REACTIONS = true;

const MAX_REACTIONS_PER_MESSAGE = 20;
const BACKFILL_FETCH_PER_PAGE = 100;
const BACKFILL_MAX_MESSAGES = 1000;
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

/**
 * Enfileira uma tarefa e retorna o resultado da execução.
 */
function enqueue(task) {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });

  reactionQueue = reactionQueue.then(async () => {
    try {
      const result = await task();
      resolve(result);
    } catch (e) {
      reject(e);
    }
  }).catch(() => {});

  return promise;
}

/**
 * Gera logs padronizados conforme solicitado.
 */
function logAction(channelId, msgId, emoji, result, reason = "") {
  console.log(
    `[SC_AUTO_REACTS]\n` +
    `canal=${channelId}\n` +
    `msg=${msgId}\n` +
    `emoji=${emoji}\n` +
    `resultado=${result}${reason ? `\nmotivo=${reason}` : ""}\n`
  );
}

/**
 * Inicialização
 */
export async function autoReactsFotosOnReady(client) {
  if (!client) return;

  if (client.__SC_AUTO_REACTS__) {
    return;
  }

  client.__SC_AUTO_REACTS__ = true;

  client.on(Events.MessageCreate, async (message) => {
    try {
      await autoReactsFotosHandleMessage(message, client);
    } catch (err) {
      console.error("[SC_AUTO_REACTS] erro no listener MessageCreate:", err?.message || err);
    }
  });

  console.log("[SC_AUTO_REACTS] sistema inicializado e listener MessageCreate conectado.");
}

export async function autoReactsFotosHandleMessage(message, client, options = {}) {
  try {
    if (!message?.guild || !message?.channel) return false;
    if (message.system) return false;

    const allowBotMessage = options.allowBotMessage === true;

    if (
      IGNORE_BOT_MESSAGES &&
      message.author?.bot &&
      !allowBotMessage &&
      !MEDIA_CHANNEL_IDS.includes(message.channel.id)
    ) {
      return false;
    }

    if (!allowBotMessage && await handleManualBackfillCommand(message, client)) return true;

    const channelId = message.channel.id;
    if (!MEDIA_CHANNEL_IDS.includes(channelId) && channelId !== ALL_MESSAGES_CHANNEL_ID) return false;

    if (message.partial) await message.fetch().catch(() => {});

    if (channelId === ALL_MESSAGES_CHANNEL_ID) {
      await reactToMessage(message, options.mode || "all");
      return false;
    }

    if (MEDIA_CHANNEL_IDS.includes(channelId)) {
      if (hasMediaContent(message) && (await shouldReactByExistingReactionsRule(message))) {
        await reactToMessage(message, options.mode || (message.author.bot ? "media-bot" : "media"));
      }
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
          MEDIA_CHANNEL_IDS.includes(message.channel?.id) &&
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
  } else if (["eventos", "evento", "chats", "canais"].includes(targetRaw)) {
    targetChannelId = EVENT_REACTION_CHANNEL_IDS;
    mode = "media";
    label = "canais de eventos / cronograma / hall da fama";
  } else if (["geral", "all"].includes(targetRaw)) {
    targetChannelId = ALL_MESSAGES_CHANNEL_ID;
    mode = "all";
    label = "canal geral";
  } else {
    await message.reply(
      "⚠️ Usa assim:\n`!reagirsc fotos`\n`!reagirsc eventos`\n`!reagirsc geral`\n`!reagirsc eventos 1000`\n`!reagirsc fotos 200`\n`!reagirsc geral 400`"
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
    const result = Array.isArray(targetChannelId)
      ? await backfillChannels(client, targetChannelId, mode, {
          maxMessages: customMaxMessages,
          manual: true,
        })
      : await backfillChannel(client, targetChannelId, mode, {
          maxMessages: customMaxMessages,
          manual: true,
        });

    await message.reply(
      `✅ Backfill manual SC concluído em ${label}.\n` +
      `• Vasculhadas: **${result?.scanned ?? 0}**\n` +
      `• Mensagens com reação nova: **${result?.processed ?? 0}**\n` +
      `• Reações adicionadas: **${result?.added ?? 0}**\n` +
      `• Já eram minhas: **${result?.alreadyMine ?? 0}**\n` +
      `• Sem espaço para emoji novo: **${result?.noSlot ?? 0}**\n` +
      `• Reações bloqueadas pelo Discord: **${result?.blocked ?? 0}**\n` +
      `• Falhas ignoradas: **${result?.failed ?? 0}**`
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
      const data = embed.data || embed;
      if (data.image?.url || data.thumbnail?.url || data.video?.url || data.type === "gifv") return true;
    }

    const content = String(message.content || "").toLowerCase();
    const mediaPatterns = [
      "cdn.discordapp.com", "media.discordapp.net", "tenor.com", "giphy.com",
      "image.png", "image.jpg", "image.jpeg", "image.webp",
      ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".avif", ".heic",
      ".mp4", ".mov", ".webm", ".mkv", ".avi", ".m4v"
    ];

    if (mediaPatterns.some(p => content.includes(p))) return true;
  } catch {}

  return false;
}

async function shouldReactByExistingReactionsRule(message) {
  if (!REACT_ONLY_IF_MESSAGE_ALREADY_HAS_REACTIONS) return true;
  if (!EVENT_REACTION_CHANNEL_IDS.includes(message.channel?.id)) return true;

  // Força o fetch das reações para garantir que o bot as veja
  const reactions = await message.reactions.cache;
  if (reactions.size === 0) {
    const fetched = await message.reactions.fetch().catch(() => null);
    return (fetched?.size || 0) > 0;
  }
  return true;
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

function buildExistingReactionList(message) {
  const existing = [];

  try {
    for (const reaction of message.reactions.cache.values()) {
      if (reaction?.emoji?.id) {
        existing.push(reaction.emoji.toString());
      } else if (reaction?.emoji?.name) {
        existing.push(reaction.emoji.name);
      }
    }
  } catch {}

  return existing;
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
  const stats = { added: 0, alreadyMine: 0, noSlot: 0, blocked: 0, failed: 0 };
  if (!message?.guild) return stats;

  try {
    if (message.partial) await message.fetch().catch(() => {});
  } catch {}

  const existingReactions = await buildExistingReactionList(message);
  const defaultReactions = buildReactionList(message.guild);

  const reactions = [];
  const seen = new Set();

  for (const emoji of [...existingReactions, ...defaultReactions]) {
    const key = String(emoji);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    reactions.push(emoji);

    if (reactions.length >= MAX_REACTIONS_PER_MESSAGE) break;
  }

  const tasks = [];
  for (const emoji of reactions) {
    tasks.push(enqueue(async () => {
      try {
        const alreadyThere = message.reactions.cache.find((r) =>
          reactionMatchesEmoji(r, emoji)
        );

        if (alreadyThere?.me) {
          logAction(message.channel.id, message.id, emoji, "BLOCKED_ALREADY_REACTED");
          stats.alreadyMine++;
          return;
        }

        if (message.reactions.cache.size >= 20 && !alreadyThere) {
          logAction(message.channel.id, message.id, emoji, "MAX_REACTIONS_REACHED");
          stats.noSlot++;
          return;
        }

        await message.react(emoji);
        logAction(message.channel.id, message.id, emoji, "SUCCESS");
        stats.added++;
      } catch (err) {
        const code = err?.code || err?.rawError?.code;
        const msg = String(err?.message || err);

        if (msg.includes("Reaction blocked") || code === 90001) {
          logAction(message.channel.id, message.id, emoji, "BLOCKED_DISCORD");
          stats.blocked++;
          return;
        }

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
          code === 30010
        ) {
          logAction(message.channel.id, message.id, emoji, "NO_PERMISSION", msg);
          stats.failed++;
          return;
        }

        logAction(message.channel.id, message.id, emoji, "ERROR", msg);
        stats.failed++;
      }
    }));
  }

  // Aguarda todas as reações agendadas para esta mensagem para retornar stats precisos
  await Promise.all(tasks).catch(() => {});

  return stats;
}

async function backfillChannels(client, channelIds, mode, options = {}) {
  let totalScanned = 0;
  let totalProcessed = 0;
  let totalAdded = 0;
  let totalAlreadyMine = 0;
  let totalNoSlot = 0;
  let totalBlocked = 0;
  let totalFailed = 0;

  for (const channelId of channelIds) {
    const result = await backfillChannel(client, channelId, mode, options);
    totalScanned += Number(result?.scanned || 0);
    totalProcessed += Number(result?.processed || 0);
    totalAdded += Number(result?.added || 0);
    totalAlreadyMine += Number(result?.alreadyMine || 0);
    totalNoSlot += Number(result?.noSlot || 0);
    totalBlocked += Number(result?.blocked || 0);
    totalFailed += Number(result?.failed || 0);
  }

  return {
    scanned: totalScanned,
    processed: totalProcessed,
    added: totalAdded,
    alreadyMine: totalAlreadyMine,
    noSlot: totalNoSlot,
    blocked: totalBlocked,
    failed: totalFailed,
  };
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
  let totalAdded = 0;
  let totalAlreadyMine = 0;
  let totalNoSlot = 0;
  let totalBlocked = 0;
  let totalFailed = 0;

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
      if (
        IGNORE_BOT_MESSAGES &&
        msg.author?.bot &&
        !MEDIA_CHANNEL_IDS.includes(msg.channel.id)
      ) continue;

      if (mode === "media" && !hasMediaContent(msg)) continue;
      if (!(await shouldReactByExistingReactionsRule(msg))) continue;

      const reactStats = await reactToMessage(msg, mode);

      if (reactStats.added > 0) {
        processed++;
      }

      totalAdded += reactStats.added;
      totalAlreadyMine += reactStats.alreadyMine;
      totalNoSlot += reactStats.noSlot;
      totalBlocked += reactStats.blocked;
      totalFailed += reactStats.failed;
    }

    lastId = ordered[0]?.id;
    if (!lastId || messages.size < limit) break;
  }

  console.log(
     `[SC_AUTO_REACTS] backfill canal=${channelId} finalizado | vasculhadas=${scanned} | mensagens_reagidas=${processed} | reacoes_add=${totalAdded} | ja_eram_minhas=${totalAlreadyMine} | sem_slot=${totalNoSlot} | bloqueadas=${totalBlocked} | falhas=${totalFailed}`
  );

  return {
    scanned,
    processed,
    added: totalAdded,
    alreadyMine: totalAlreadyMine,
    noSlot: totalNoSlot,
    blocked: totalBlocked,
    failed: totalFailed,
  };
}