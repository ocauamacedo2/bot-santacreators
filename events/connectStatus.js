// /application/events/connectStatus.js
// CONNECT STATUS — sticky (auto + !connect) [ESM, robusto]
// ✅ feito pra teu roteador central (ready + messageCreate), SEM client.on aqui

import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
} from "discord.js";

// ⚙️ CONFIG
const CN2_DEBUG = false;
const CN2_FIXED_CHANNEL_ID = "1415124878134087783";

const CN2_ENABLE_AUTO_REFRESH = true;
const CN2_REFRESH_MS = 5 * 60 * 1000; // 5 min

const CN2_SERVER_HOSTPORT = "172.84.94.95:30120";
const CN2_API_URL = `http://${CN2_SERVER_HOSTPORT}/dynamic.json`;

const CN2_AUTH_ROLES = [
  "1262262852949905408", // owner (cargo)
  "1352408327983861844", // resp creator
  "1352407252216184833", // resp lider
  "1262262852949905409", // resp influ
];
const CN2_AUTH_USERS = ["660311795327828008"]; // você

const CN2_TAG = "[CONNECT_STATUS]";
const CN2_STATE = new Map(); // channelId -> { intervalId, messageId }

// ---------- utils

function cn2ParseColor(input, fallback = 0x2b2d31) {
  if (!input) return fallback;
  let s = String(input).trim();
  if (/^#?[0-9a-f]{6}$/i.test(s)) {
    if (s.startsWith("#")) s = s.slice(1);
    return parseInt(s, 16);
  }
  if (/^0x[0-9a-f]{6}$/i.test(s)) return parseInt(s, 16);
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function cn2HasPermUser(message) {
  if (!message.guild || !message.member) return false;
  if (message.guild.ownerId === message.author.id) return true;
  if (CN2_AUTH_USERS.includes(message.author.id)) return true;
  return message.member.roles.cache.some((r) => CN2_AUTH_ROLES.includes(r.id));
}

function cn2LogApiError(prefix, e) {
  try {
    console.error(prefix, {
      name: e?.name,
      code: e?.code,
      status: e?.status,
      message: e?.message,
      raw: e?.rawError ?? undefined,
      data: e?.requestData ?? undefined,
    });
  } catch {
    console.error(prefix, e);
  }
}

async function cn2GetFetch() {
  // Node 18+ tem fetch global. Se não tiver, tenta node-fetch.
  if (typeof globalThis.fetch === "function") return globalThis.fetch.bind(globalThis);
  try {
    const mod = await import("node-fetch");
    return (mod.default || mod.fetch).bind(globalThis);
  } catch {
    throw new Error("fetch não disponível. Use Node 18+ ou instale node-fetch.");
  }
}

async function cn2BuildEmbed(guild) {
  let playersTxt = "N/A";
  let statusTxt = ":red_circle: Offline";

  try {
    const fetchFn = await cn2GetFetch();
    const res = await fetchFn(CN2_API_URL, { method: "GET" });

    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data && typeof data.clients !== "undefined" && typeof data.sv_maxclients !== "undefined") {
        playersTxt = `${data.clients}/${data.sv_maxclients}`;
        statusTxt = "Online BB";
      }
    } else {
      CN2_DEBUG && console.log("[CONNECT2] dynamic.json HTTP", res.status);
    }
  } catch (err) {
    console.error("[CONNECT2] Falha ao buscar dynamic.json:", err?.message || err);
  }

  const baseColor = cn2ParseColor(process.env.BASE_COLORS, 0x2b2d31);

  const embed = new EmbedBuilder()
    .setColor(baseColor)
    .setTitle("```🏫 | Cidade Nobre RP```")
    .setThumbnail(
      "https://media.discordapp.net/attachments/1362477839944777889/1368084293905285170/sc2.png?ex=68c1a989&is=68c05809&hm=78cbc80c10cfe8c5cb729374c2615fb600ab933b8725351fba2bd49d8919c12d&=&format=webp&quality=lossless&width=1320&height=1320"
    )
    .addFields(
      { name: ":video_game: Players:", value: `\`\`\`${playersTxt}\`\`\``, inline: true },
      { name: ":bar_chart: Status:", value: `\`\`\`${statusTxt}\`\`\``, inline: true }
    )
    .addFields({ name: ":link: Conectar pelo F8:", value: "```connect jogar.cidadenobre.com```" })
    .setImage(
      "https://media.discordapp.net/attachments/1362477839944777889/1374893068649500783/standard_1.gif?ex=68c16233&is=68c010b3&hm=ac6aeb4d2fd773985062b6c0366f34226a332df46e64afe9d846186901cd17be&="
    )
    .setFooter({ text: `Santa Creators • ${CN2_TAG}`, iconURL: guild?.iconURL() || undefined });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel("🔗 Conectar").setStyle(ButtonStyle.Link).setURL("https://cfx.re/join/vxz4gq"),
    new ButtonBuilder().setLabel("🎮 Discord").setStyle(ButtonStyle.Link).setURL("https://discord.gg/cidadenobre")
  );

  return { embed, row };
}

async function cn2FindStickyMessage(channel, botId) {
  try {
    const perms = channel.permissionsFor(botId);
    if (!perms?.has(PermissionsBitField.Flags.ViewChannel) || !perms?.has(PermissionsBitField.Flags.ReadMessageHistory)) {
      CN2_DEBUG && console.log("[CONNECT2] Sem permissão de Ler Histórico no canal", channel.id);
      return null;
    }
    const msgs = await channel.messages.fetch({ limit: 50 }).catch(() => null);
    if (!msgs) return null;

    const found = msgs.find(
      (m) =>
        m.author?.id === botId &&
        m.embeds?.length > 0 &&
        ((m.embeds[0].footer?.text || "").includes(CN2_TAG))
    );

    return found || null;
  } catch (e) {
    cn2LogApiError("[CONNECT2] Erro buscando sticky:", e);
    return null;
  }
}

async function cn2EnsureStickyMessage(channel) {
  const botId = channel.client.user.id;
  let msg = await cn2FindStickyMessage(channel, botId);

  if (!msg) {
    const perms = channel.permissionsFor(botId);
    if (!perms?.has(PermissionsBitField.Flags.SendMessages)) {
      throw new Error("Bot sem permissão de Enviar Mensagens no canal.");
    }
    if (!perms?.has(PermissionsBitField.Flags.EmbedLinks)) {
      throw new Error("Bot sem permissão de **Inserir Links Incorporados (Embed Links)** no canal.");
    }
    const { embed, row } = await cn2BuildEmbed(channel.guild);

    try {
      msg = await channel.send({ embeds: [embed], components: [row] });
      CN2_DEBUG && console.log("[CONNECT2] Sticky criada:", msg.id);
    } catch (e) {
      cn2LogApiError("[CONNECT2] Falha ao criar sticky:", e);
      throw e;
    }
  }

  return msg;
}

async function cn2EditSticky(channel) {
  const botId = channel.client.user.id;
  const perms = channel.permissionsFor(botId);

  if (!perms?.has(PermissionsBitField.Flags.ViewChannel) || !perms?.has(PermissionsBitField.Flags.SendMessages)) {
    CN2_DEBUG && console.log("[CONNECT2] Sem permissão de ver/enviar no canal", channel.id);
    return null;
  }
  if (!perms?.has(PermissionsBitField.Flags.EmbedLinks)) {
    CN2_DEBUG && console.log("[CONNECT2] Sem Embed Links no canal", channel.id);
    return null;
  }

  const sticky = await cn2EnsureStickyMessage(channel).catch((e) => {
    console.error("[CONNECT2] ensureSticky falhou:", e?.message || e);
    return null;
  });
  if (!sticky) return null;

  const { embed, row } = await cn2BuildEmbed(channel.guild);

  try {
    const edited = await sticky.edit({ embeds: [embed], components: [row] });
    if (edited) CN2_DEBUG && console.log("[CONNECT2] Sticky editada:", edited.id);
    return edited;
  } catch (e) {
    cn2LogApiError("[CONNECT2] Falha ao editar sticky:", e);
    return null;
  }
}

// ---------- PUBLIC API (pra teu roteador central)

export async function connectStatusOnReady(client) {
  try {
    const channel = await client.channels.fetch(CN2_FIXED_CHANNEL_ID).catch(() => null);
    if (!channel) return console.error("[CONNECT2] Canal fixo não encontrado:", CN2_FIXED_CHANNEL_ID);
    if (typeof channel.isTextBased !== "function" || !channel.isTextBased()) {
      return console.error("[CONNECT2] Canal fixo não é textual");
    }

    const edited = await cn2EditSticky(channel);
    if (!edited) return;

    const existing = CN2_STATE.get(channel.id);
    if (existing?.intervalId) clearInterval(existing.intervalId);

    let intervalId = null;
    if (CN2_ENABLE_AUTO_REFRESH) {
      intervalId = setInterval(async () => {
        await cn2EditSticky(channel);
      }, CN2_REFRESH_MS);
    }

    CN2_STATE.set(channel.id, { intervalId, messageId: edited.id });
    CN2_DEBUG && console.log("[CONNECT2] READY ok — sticky ok no canal", channel.id);
  } catch (err) {
    console.error("[CONNECT2] connectStatusOnReady erro:", err?.message || err);
  }
}

// retorna true se tratou
export async function connectStatusHandleMessage(message, client) {
  try {
    if (!message || message.author?.bot) return false;

    const content = (message.content || "").trim();
    if (!/^!connect\b/i.test(content)) return false;

    if (!message.guild) return true;

    if (!cn2HasPermUser(message)) {
      const reply = await message.reply(":x: Você não tem permissão para usar este comando.");
      setTimeout(() => reply.delete().catch(() => {}), 5000);
      return true;
    }

    // Atualiza no canal onde foi usado
    if (message.channel?.isTextBased?.()) {
      await cn2EditSticky(message.channel);
      CN2_DEBUG && console.log("[CONNECT2] Manual ok no canal", message.channel.id);
    }

    return true;
  } catch (e) {
    cn2LogApiError("[CONNECT2] connectStatusHandleMessage erro:", e);
    return false;
  }
}

export function connectStatusOnChannelDelete(channel) {
  const state = CN2_STATE.get(channel?.id);
  if (state?.intervalId) clearInterval(state.intervalId);
  if (channel?.id) CN2_STATE.delete(channel.id);
}
