// ./events/lideresConvites.js
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionsBitField,
} from "discord.js";

import { dashEmit } from "../utils/dashHub.js";
const MENU_CHANNEL_ID = "1414718856542421052"; // canal do menu (não envia lá)

const CATEGORY_IDS = new Set([
  "1414687963161559180", // categoria 1
  "1428572742051168378", // categoria 2
]);

const LIDER_ROLE_ID = "1353858422063239310";
const LOG_CHANNEL_ID = "1415102820826349648";

// Canais a ignorar SEMPRE
const EXCLUDED_CHANNELS = new Set([
  "1414718856542421052", // menu
  "1414718336826081330", // extra
]);

// Quem pode usar
// ======================= PERMISSÕES =======================

// Cargos autorizados
const ALLOWED_ROLES = new Set([
  "1282119104576098314", // MKT TICKET
  "1352407252216184833", // Resp Líder
  "1352408327983861844", // Resp Creators
  "1262262852949905409", // Resp Influ
  "1388976314253312100", // Coord.
  "1388975939161161728", // Gestor
]);

// Usuários autorizados (exceção)
const ALLOWED_USERS = new Set([
  "1262262852949905408", // Owner
  "660311795327828008",  // Você
]);


// ======================= IDs de componentes =======================
const BTN_OPEN_ID = "lid_open_menu";
const BTN_CLEAN_ID = "lid_clean_all";
const BTN_CLEAN_LEG = "lid_clean_legacy";
const MODAL_ID = "lid_modal_send";
const IN_TITULO = "lid_titulo";
const IN_DATA = "lid_data";
const IN_BODY = "lid_body";

// Marca para identificar mensagens deste módulo (não apaga o menu)
const TAG = "#LIDv4";
const GIF_URL =
  "https://media.discordapp.net/attachments/1362477839944777889/1384245215249825832/standard_2rss.gif";

// ======================= HELPERS =======================
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const trunc = (s, m = 1000) =>
  String(s ?? "").length > m ? String(s).slice(0, m - 1) + "…" : String(s ?? "");

/**
 * Discord limita content em 4000 chars.
 * Aqui a gente usa 3900 pra ter folga.
 */
const MAX_CONTENT = 3900;

function canSend(ch) {
  if (!ch || typeof ch.send !== "function") return false;
  const me = ch.guild?.members?.me;
  if (!me) return false;
  const p = ch.permissionsFor(me);
  return (
    p?.has(PermissionsBitField.Flags.ViewChannel) &&
    p?.has(PermissionsBitField.Flags.SendMessages)
  );
}

function allowed(i) {
  // Usuários liberados (Owner + Você)
  if (ALLOWED_USERS.has(i.user.id)) return true;

  // Cargos liberados
  return i.member?.roles?.cache?.some((r) => ALLOWED_ROLES.has(r.id)) ?? false;
}


// Heurística para identificar convites antigos (sem TAG) — só usada nas categorias
function isLikelyLegacyInvite(msg) {
  // nunca apagar menus de qualquer módulo
  if (msg.components?.length) return false;

  const emb = msg.embeds?.[0];
  if (!emb) return false;

  const footer = emb.footer?.text?.toLowerCase() || "";
  const title = emb.title?.toLowerCase() || "";
  const descr = emb.description?.toLowerCase() || "";
  const imgUrl = emb.image?.url || "";

  const hasInviteWords =
    footer.includes("convite para líderes") ||
    title.startsWith("📌") ||
    title.includes("convite") ||
    title.includes("líder");

  const hasGifSignature =
    typeof imgUrl === "string" && imgUrl.includes("standard_2rss.gif");

  // mensagens do próprio bot com “cara” de convite antigo
  return (
    hasInviteWords ||
    hasGifSignature ||
    descr.includes("convite") ||
    descr.includes("líder")
  );
}

/**
 * Quebra uma lista de IDs em blocos de menções <= MAX_CONTENT
 * Ex: ["1","2","3"] -> ["<@1> <@2> ...", "..."]
 */
function buildMentionChunksFromIds(userIds, maxLen = MAX_CONTENT) {
  const chunks = [];
  let current = "";

  for (const id of userIds) {
    const part = `<@${id}>`;
    const next = current ? `${current} ${part}` : part;

    if (next.length > maxLen) {
      if (current) chunks.push(current);
      current = part;
    } else {
      current = next;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

/**
 * Envia convite no canal:
 * - 1ª mensagem: embed + 1º chunk de menções (se existir)
 * - demais: só menções (sem embed), pra não duplicar embed
 */
async function sendInviteToChannel(ch, emb, mentionChunks) {
  // Se não tem menção nenhuma, manda só o embed
  if (!mentionChunks || mentionChunks.length === 0) {
    await ch.send({
      embeds: [emb],
      allowedMentions: { parse: ["users"], repliedUser: false },
    });
    return 1;
  }

  // 1ª: embed + 1º bloco
  await ch.send({
    content: mentionChunks[0],
    embeds: [emb],
    allowedMentions: { parse: ["users"], repliedUser: false },
  });

  // resto: só content
  for (let idx = 1; idx < mentionChunks.length; idx++) {
    await ch.send({
      content: mentionChunks[idx],
      allowedMentions: { parse: ["users"], repliedUser: false },
    });
    await wait(120);
  }

  // conta mensagens enviadas nesse canal
  return mentionChunks.length;
}

// ======================= UI =======================
function menuEmbed(guild) {
  const catsLabel = Array.from(CATEGORY_IDS)
    .map((id) => `<#${id}>`)
    .join("  ");
  return new EmbedBuilder()
    .setColor("#9b59b6")
    .setAuthor({
      name: "Líderes • Central de Convites",
      iconURL: guild?.iconURL({ dynamic: true }) ?? null,
    })
    .setTitle("📨 Enviar convite para Líderes")
    .setDescription(
      [
        "Clique no botão **Roxo** para abrir o formulário e enviar um convite.",
        `• **Destino:** todos os canais das **categorias Líderes** (${catsLabel}) (exceto os ignorados) **e** DM pra quem tem o cargo e acesso.`,
        "• **Menções:** marca automaticamente os **Líderes** com acesso em cada canal.",
        "",
        "📝 **Campos:** **Título**, **Data**, **Conteúdo** (aceita emojis padrão e `<:emoji:id>`).",
        "✅ **Quem pode enviar:** cargos/IDs autorizados.",
      ].join("\n")
    )
    .setImage(GIF_URL)
    .setFooter({ text: `SantaCreators – Sistema Oficial • Anti-duplicata • ${TAG}` });
}

function menuRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(BTN_OPEN_ID)
      .setLabel("💜 Abrir formulário de convite")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(BTN_CLEAN_ID)
      .setLabel("🧹 Limpar convites")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(BTN_CLEAN_LEG)
      .setLabel("🧹 Limpar (legacy)")
      .setStyle(ButtonStyle.Secondary)
  );
}

async function createOrReplaceMenu(channel) {
  const msgs = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  if (msgs) {
    const olds = msgs.filter(
      (m) =>
        m.author.id === channel.client.user.id &&
        m.components?.[0]?.components?.some((c) =>
          [BTN_OPEN_ID, BTN_CLEAN_ID, BTN_CLEAN_LEG].includes(c?.customId)
        )
    );
    for (const m of olds.values()) await m.delete().catch(() => {});
  }
  return channel.send({ embeds: [menuEmbed(channel.guild)], components: [menuRow()] });
}

function buildBaseEmbed({ titulo, data, conteudo }) {
  return new EmbedBuilder()
    .setColor("#9b59b6")
    .setTitle(`📌 ${trunc(titulo, 240)}`)
    .addFields({ name: "📅 Data", value: data || "—", inline: true })
    .setDescription(trunc(conteudo, 3900))
    .setImage(GIF_URL)
    .setTimestamp()
    .setFooter({ text: `SantaCreators – Convite para Líderes • ${TAG}` });
}

function channelEmbed(base, member, fallbackIcon) {
  const e = EmbedBuilder.from(base);
  if (member) {
    e.setAuthor({
      name: `${member.user.tag} • Líder`,
      iconURL: member.user.displayAvatarURL({ dynamic: true }),
    });
  } else if (fallbackIcon) {
    e.setAuthor({ name: "Líderes", iconURL: fallbackIcon });
  }
  return e;
}

function dmEmbed(base, member, channels) {
  const e = EmbedBuilder.from(base);
  e.setAuthor({
    name: member.user.tag,
    iconURL: member.user.displayAvatarURL({ dynamic: true }),
  });
  if (channels?.length) {
    const list = channels.map((ch) => `<#${ch.id}>`).join("  ");
    e.addFields({ name: "📌 Canais", value: trunc(list, 1000), inline: false });
  }
  return e;
}

// Agora busca todos os canais cujos parentId pertençam a QUALQUER categoria em CATEGORY_IDS
function categoryTargets(guild) {
  return guild.channels.cache.filter(
    (ch) =>
      ch?.parentId &&
      CATEGORY_IDS.has(ch.parentId) &&
      !EXCLUDED_CHANNELS.has(ch.id) &&
      canSend(ch)
  );
}

// ======================= LIMPEZA =======================
// Apaga convites deste módulo (TAG) e, opcionalmente, convites antigos (legacy) sem TAG.
async function cleanAllInvites(guild, { legacy = false } = {}) {
  let deletedGuild = 0,
    scannedGuild = 0,
    deletedDM = 0;

  // 1) Canais das categorias
  const targets = categoryTargets(guild);
  for (const ch of targets.values()) {
    let lastId = null;
    for (let page = 0; page < 30; page++) {
      const opts = lastId ? { limit: 100, before: lastId } : { limit: 100 };
      const batch = await ch.messages.fetch(opts).catch(() => null);
      if (!batch || batch.size === 0) break;

      for (const msg of batch.values()) {
        scannedGuild++;
        const isMine = msg.author?.id === guild.client.user.id;

        // NÃO apagar menus (de qualquer módulo)
        const isMenu = msg.components?.length
          ? msg.components.some((row) =>
              row.components?.some((c) =>
                [BTN_OPEN_ID, BTN_CLEAN_ID, BTN_CLEAN_LEG].includes(c?.customId)
              )
            )
          : false;

        const isTag = msg.embeds?.some((e) => (e.footer?.text || "").includes(TAG));
        const match = isTag || (legacy && isLikelyLegacyInvite(msg));

        if (isMine && !isMenu && match) {
          await msg.delete().catch(() => {});
          deletedGuild++;
          await wait(80);
        }
      }

      lastId = batch.lastKey();
      if (!lastId) break;
      await wait(150);
    }
  }

  // 2) DMs dos líderes — apenas mensagens com TAG (evitar risco em conversas antigas)
  const members = guild.members.cache.filter((m) => m.roles.cache.has(LIDER_ROLE_ID));
  for (const m of members.values()) {
    try {
      const dm = await m.createDM().catch(() => null);
      if (!dm) continue;

      let lastId = null;
      for (let page = 0; page < 10; page++) {
        const opts = lastId ? { limit: 100, before: lastId } : { limit: 100 };
        const batch = await dm.messages.fetch(opts).catch(() => null);
        if (!batch || batch.size === 0) break;

        for (const msg of batch.values()) {
          const isMine = msg.author?.id === guild.client.user.id;
          const isTag = msg.embeds?.some((e) => (e.footer?.text || "").includes(TAG));
          if (isMine && isTag) {
            await msg.delete().catch(() => {});
            deletedDM++;
            await wait(80);
          }
        }

        lastId = batch.lastKey();
        if (!lastId) break;
        await wait(150);
      }
    } catch {}
  }

  return { deletedGuild, deletedDM, scannedGuild };
}

// ======================= EXPORTS =======================
export async function lideresConvitesOnReady(client) {
  const ch = await client.channels.fetch(MENU_CHANNEL_ID).catch(() => null);
  if (!ch || !canSend(ch)) return;
  await createOrReplaceMenu(ch).catch(() => {});
}

export async function lideresConvitesHandleInteraction(i, client) {
  // Só trata interações nossas
  const isBtn =
    i.isButton?.() && [BTN_OPEN_ID, BTN_CLEAN_ID, BTN_CLEAN_LEG].includes(i.customId);
  const isModal = i.isModalSubmit?.() && i.customId === MODAL_ID;
  if (!isBtn && !isModal) return false;

  // Permissão
  if (!allowed(i)) {
    if (i.isButton?.()) {
      await i.reply({ content: "🚫 Você não tem permissão.", ephemeral: true }).catch(() => {});
      return true;
    }
    if (i.isModalSubmit?.()) {
      await i.reply({ content: "🚫 Você não tem permissão.", ephemeral: true }).catch(() => {});
      return true;
    }
  }

  // ========== BOTÃO: ABRIR MODAL ==========
  if (i.isButton?.() && i.customId === BTN_OPEN_ID) {
    const modal = new ModalBuilder().setCustomId(MODAL_ID).setTitle("💜 Convite para Líderes");

    const t = new TextInputBuilder()
      .setCustomId(IN_TITULO)
      .setLabel("📝 Título")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const d = new TextInputBuilder()
      .setCustomId(IN_DATA)
      .setLabel("📅 Data")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const b = new TextInputBuilder()
      .setCustomId(IN_BODY)
      .setLabel("✍️ Conteúdo (aceita emojis)")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(t),
      new ActionRowBuilder().addComponents(d),
      new ActionRowBuilder().addComponents(b)
    );

    await i.showModal(modal).catch(() => {});
    return true;
  }

  // ========== BOTÃO: LIMPAR (TAG) ==========
  if (i.isButton?.() && i.customId === BTN_CLEAN_ID) {
    await i.deferReply({ ephemeral: true }).catch(() => {});
    const guild = i.guild;
    if (!guild) {
      await i.editReply({ content: "❌ Use dentro do servidor." }).catch(() => {});
      return true;
    }

    const { deletedGuild, deletedDM } = await cleanAllInvites(guild, { legacy: false }).catch(() => ({
      deletedGuild: 0,
      deletedDM: 0,
    }));

    // LOG
    try {
      const log = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
      if (log && canSend(log)) {
        const emb = new EmbedBuilder()
          .setColor("#c0392b")
          .setAuthor({
            name: `${i.user.tag} • Limpeza de convites`,
            iconURL: i.user.displayAvatarURL({ dynamic: true }),
          })
          .setTitle("🧹 Convites limpos")
          .setDescription("Removidas mensagens **marcadas com TAG** deste módulo (categorias + DMs).")
          .addFields(
            { name: "🗑️ Apagadas nas categorias", value: String(deletedGuild), inline: true },
            { name: "📬 Apagadas em DMs", value: String(deletedDM), inline: true }
          )
          .setTimestamp();
        await log.send({ embeds: [emb] }).catch(() => {});
      }
    } catch {}

    await i
      .editReply({
        content: `✅ Limpeza concluída:\n• 🗑️ **Categorias**: ${deletedGuild}\n• 📬 **DMs**: ${deletedDM}`,
      })
      .catch(() => {});

    // garante menu
    const menu = await client.channels.fetch(MENU_CHANNEL_ID).catch(() => null);
    if (menu && canSend(menu)) await createOrReplaceMenu(menu).catch(() => {});
    return true;
  }

  // ========== BOTÃO: LIMPAR LEGACY ==========
  if (i.isButton?.() && i.customId === BTN_CLEAN_LEG) {
    await i.deferReply({ ephemeral: true }).catch(() => {});
    const guild = i.guild;
    if (!guild) {
      await i.editReply({ content: "❌ Use dentro do servidor." }).catch(() => {});
      return true;
    }

    const { deletedGuild, deletedDM } = await cleanAllInvites(guild, { legacy: true }).catch(() => ({
      deletedGuild: 0,
      deletedDM: 0,
    }));

    // LOG
    try {
      const log = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
      if (log && canSend(log)) {
        const emb = new EmbedBuilder()
          .setColor("#7f8c8d")
          .setAuthor({
            name: `${i.user.tag} • Limpeza LEGACY`,
            iconURL: i.user.displayAvatarURL({ dynamic: true }),
          })
          .setTitle("🧹 Convites limpos (legacy)")
          .setDescription(
            "Removeu convites antigos **sem TAG** apenas nas **categorias**. DMs permanecem seguras (somente com TAG)."
          )
          .addFields(
            { name: "🗑️ Apagadas (categorias)", value: String(deletedGuild), inline: true },
            { name: "📬 Apagadas em DMs", value: String(deletedDM), inline: true }
          )
          .setTimestamp();
        await log.send({ embeds: [emb] }).catch(() => {});
      }
    } catch {}

    await i
      .editReply({
        content: `✅ Limpeza LEGACY concluída:\n• 🗑️ **Categorias**: ${deletedGuild}\n• 📬 **DMs** (apenas com TAG): ${deletedDM}`,
      })
      .catch(() => {});

    // garante menu
    const menu = await client.channels.fetch(MENU_CHANNEL_ID).catch(() => null);
    if (menu && canSend(menu)) await createOrReplaceMenu(menu).catch(() => {});
    return true;
  }

  // ========== MODAL: ENVIAR CONVITE ==========
  if (i.isModalSubmit?.() && i.customId === MODAL_ID) {
    await i.deferReply({ ephemeral: true }).catch(() => {});

    const titulo = i.fields.getTextInputValue(IN_TITULO).trim();
    const dataTxt = i.fields.getTextInputValue(IN_DATA).trim();
    const body = i.fields.getTextInputValue(IN_BODY).trim();

    const guild = i.guild;
    if (!guild) {
      await i.editReply({ content: "❌ Use dentro do servidor." }).catch(() => {});
      return true;
    }

    await guild.members.fetch().catch(() => {});

    const base = buildBaseEmbed({ titulo, data: dataTxt, conteudo: body });

    const targets = categoryTargets(guild);
    const perUser = new Map(); // userId -> Set(channels)
    const channelLinks = [];

    let chSent = 0; // canais que receberam o embed
    let dmSent = 0;

    for (const ch of targets.values()) {
      try {
        const ownerId = guild.ownerId;

        const leaders = guild.members.cache.filter(
          (m) =>
            m.roles.cache.has(LIDER_ROLE_ID) &&
            m.id !== ownerId &&
            ch.permissionsFor(m)?.has(PermissionsBitField.Flags.ViewChannel)
        );

        const list = [...leaders.values()];

        // registra canais por usuário (pra DM)
        for (const m of list) {
          if (!perUser.has(m.id)) perUser.set(m.id, new Set());
          perUser.get(m.id).add(ch);
        }

        // faz chunks de menções (pra não estourar 4000 chars)
        const ids = list.map((m) => m.id);
        const mentionChunks = buildMentionChunksFromIds(ids);

        const emb = channelEmbed(base, list[0] ?? null, guild.iconURL({ dynamic: true }));

        // envia (1 embed + menções chunkadas)
        await sendInviteToChannel(ch, emb, mentionChunks);

        chSent++;
        channelLinks.push(`<#${ch.id}>`);
        if (chSent % 3 === 0) await wait(200);
      } catch (e) {
        console.error("[Líderes] falha canal", ch?.id, e);
      }
    }

    for (const [uid, setCh] of perUser.entries()) {
      try {
        const m = await guild.members.fetch(uid).catch(() => null);
        if (!m) continue;
        const emb = dmEmbed(base, m, [...setCh.values()]);
        await m.send({
          content: `👋 <@${uid}>`,
          embeds: [emb],
          allowedMentions: { parse: ["users"], repliedUser: false },
        });
        dmSent++;
        if (dmSent % 5 === 0) await wait(200);
      } catch {}
    }

    // log de envio
    try {
      const log = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
      if (log && canSend(log)) {
       const logEmb = new EmbedBuilder()
  .setColor("#8e44ad")
  .setAuthor({
    name: `${i.user.tag} • Envio para Líderes`,
    iconURL: i.user.displayAvatarURL({ dynamic: true }),
  })
  .setTitle("📣 Convite enviado")
  .addFields(
    {
      name: "👤 Enviado por",
      value: `<@${i.user.id}> \n\`${i.user.id}\``,
      inline: false,
    },
    {
      name: "📡 Canais entregues",
      value: `**${chSent}**\n${trunc(channelLinks.join("  "), 1000)}`,
      inline: false,
    },
    { name: "📬 DMs enviadas", value: String(dmSent), inline: true }
  )
  .setImage(GIF_URL)
  .setTimestamp();
        await log.send({ embeds: [logEmb] }).catch(() => {});
      }
    } catch {}


   dashEmit("lideres:convite_enviado", {
  by: i.user.id,
  userId: i.user.id,
  canais: chSent,
  dms: dmSent,
  __at: Date.now(),
});


    await i
      .editReply({
        content: `✅ Convite enviado!\n• **Canais:** ${chSent}\n• **DMs:** ${dmSent}`,
      })
      .catch(() => {});

    // garante menu
    const menu = await client.channels.fetch(MENU_CHANNEL_ID).catch(() => null);
    if (menu && canSend(menu)) await createOrReplaceMenu(menu).catch(() => {});
    return true;
  }

  return true;
}
