// /application/events/logs/messageUpdate.js
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  time,
  TimestampStyles,
} from 'discord.js';

// >>> CONFIG
const BOT_LOG_CHANNEL_ID = '1486084307897417899';
const HUMAN_LOG_CHANNEL_ID = '1486084299743826136';

// corta texto com segurança
function cut(text, max = 1024) {
  const s = (text ?? '').toString();
  if (!s) return '*(vazio)*';
  return s.length > max ? `${s.slice(0, max - 10)}\n…(cortado)` : s;
}

// evita fechar codeblock se a msg tiver ```
function escapeCodeblock(s) {
  return (s ?? '').toString().replace(/```/g, '``\u200b`');
}

// cria o “fundo preto” (code block)
function box(text, maxInside = 950) {
  const raw = (text ?? '').toString();
  const safe = escapeCodeblock(raw);
  const inside = cut(safe, maxInside);
  return `\`\`\`\n${inside}\n\`\`\``;
}

function fmtMs(ms) {
  if (!ms || ms < 0) return '0s';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  parts.push(`${ss}s`);
  return parts.join(' ');
}

function channelLabel(ch) {
  if (!ch) return 'desconhecido';
  if (ch.type === ChannelType.GuildText) return `#${ch.name}`;
  if (ch.type === ChannelType.PublicThread || ch.type === ChannelType.PrivateThread) return `🧵 ${ch.name}`;
  return `${ch.name ?? ch.id}`;
}

function serializeEmbeds(embeds) {
  if (!Array.isArray(embeds) || embeds.length === 0) return null;

  const lines = [];
  embeds.slice(0, 3).forEach((e, idx) => {
    const title = e?.title ? `${cut(e.title, 120)}` : null;
    const desc = e?.description ? cut(e.description, 220) : null;
    const url = e?.url ? `URL: ${e.url}` : null;

    const img = e?.image?.url ? `IMG: ${e.image.url}` : null;
    const thumb = e?.thumbnail?.url ? `THUMB: ${e.thumbnail.url}` : null;
    const author = e?.author?.name ? `AUTHOR: ${cut(e.author.name, 120)}` : null;

    lines.push(`Embed ${idx + 1}:`);
    if (title) lines.push(`TITLE: ${title}`);
    if (author) lines.push(author);
    if (desc) lines.push(`DESC: ${desc}`);
    if (url) lines.push(url);
    if (img) lines.push(img);
    if (thumb) lines.push(thumb);
    lines.push('---');
  });

  if (embeds.length > 3) lines.push(`(+${embeds.length - 3} embeds escondidos)`);

  return lines.join('\n');
}

function serializeStickers(stickers) {
  if (!Array.isArray(stickers) || stickers.length === 0) return null;
  const lines = stickers.slice(0, 5).map(s => `• ${s.name ?? 'sticker'} (${s.id})`);
  if (stickers.length > 5) lines.push(`(+${stickers.length - 5} stickers)`);
  return lines.join('\n');
}

function serializeAttachments(attachments) {
  if (!attachments || attachments.size === 0) return null;

  const imgs = [];
  const vids = [];
  const others = [];

  for (const att of attachments.values()) {
    const url = att.url;
    const name = att.name ?? 'arquivo';
    const ct = (att.contentType ?? '').toLowerCase();

    const line = `• ${name} | ${url} | (${att.id})`;

    if (ct.startsWith('image/')) imgs.push(line);
    else if (ct.startsWith('video/')) vids.push(line);
    else others.push(line);
  }

  return {
    imgs: imgs.length ? imgs.join('\n') : null,
    vids: vids.length ? vids.join('\n') : null,
    others: others.length ? others.join('\n') : null,
    firstImageUrl: (() => {
      for (const att of attachments.values()) {
        const ct = (att.contentType ?? '').toLowerCase();
        if (ct.startsWith('image/')) return att.url;
      }
      return null;
    })(),
  };
}

export default {
  name: 'messageUpdate',

  execute: async (oldMessage, newMessage, client) => {
    try {
      if (!newMessage.guild) return;

      // fetch se vier parcial
      if (oldMessage?.partial) oldMessage = await oldMessage.fetch().catch(() => oldMessage);
      if (newMessage?.partial) newMessage = await newMessage.fetch().catch(() => newMessage);

      const author = newMessage.author;
      if (!author) return;

      // rota bot vs humano
      const targetChannelId = author.bot ? BOT_LOG_CHANNEL_ID : HUMAN_LOG_CHANNEL_ID;

      const logChannel = targetChannelId ? await client.channels.fetch(targetChannelId).catch(() => null) : null;
      if (!logChannel || !logChannel.isTextBased()) return;

      const oldContent = oldMessage?.content ?? '';
      const newContent = newMessage?.content ?? '';

      const oldEmbeds = oldMessage?.embeds ?? [];
      const newEmbeds = newMessage?.embeds ?? [];

      const oldAtt = oldMessage?.attachments ?? new Map();
      const newAtt = newMessage?.attachments ?? new Map();

      // evita logar coisa “fantasma”
      const changed =
        oldContent !== newContent ||
        (oldEmbeds?.length ?? 0) !== (newEmbeds?.length ?? 0) ||
        (oldAtt?.size ?? 0) !== (newAtt?.size ?? 0);

      if (!changed) return;

      const ch = newMessage.channel;
      const guild = newMessage.guild;
      const category = ch?.parent ?? null;

      const createdTs = newMessage.createdTimestamp ?? oldMessage?.createdTimestamp ?? Date.now();
      const editedTs = newMessage.editedTimestamp ?? Date.now();
      const delta = editedTs - createdTs;

      const oldAttachInfo = serializeAttachments(oldAtt);
      const newAttachInfo = serializeAttachments(newAtt);

      const oldEmbedText = serializeEmbeds(oldEmbeds);
      const newEmbedText = serializeEmbeds(newEmbeds);

      const oldStickerText = serializeStickers(oldMessage?.stickers ? Array.from(oldMessage.stickers.values?.() ?? []) : []);
      const newStickerText = serializeStickers(newMessage?.stickers ? Array.from(newMessage.stickers.values?.() ?? []) : []);

      const jumpLink = newMessage.url;
      const userLink = `https://discord.com/users/${author.id}`;

      const embed = new EmbedBuilder()
        .setAuthor({
          name: `${author.tag} (${author.id})`,
          iconURL: author.displayAvatarURL({ size: 256 }),
        })
        .setTitle(author.bot ? '🤖 Mensagem editada (BOT)' : '👤 Mensagem editada (HUMANO)')
        .setDescription(
          [
            `**Autor:** ${author} \`${author.tag}\``,
            `**Servidor:** \`${guild.name}\` (\`${guild.id}\`)`,
            `**Canal:** ${channelLabel(ch)} (\`${ch?.id ?? '??'}\`)`,
            `**Categoria:** ${category ? `\`${category.name}\` (\`${category.id}\`)` : '*(sem categoria)*'}`,
            `**Criada em:** ${time(Math.floor(createdTs / 1000), TimestampStyles.F)} (${time(Math.floor(createdTs / 1000), TimestampStyles.R)})`,
            `**Editada em:** ${time(Math.floor(editedTs / 1000), TimestampStyles.F)} (${time(Math.floor(editedTs / 1000), TimestampStyles.R)})`,
            `**Tempo até editar:** \`${fmtMs(delta)}\``,
          ].join('\n')
        )
        .setColor(author.bot ? 0x5865f2 : 0xff009a)
        .setFooter({ text: `msgId: ${newMessage.id}` });

      // ✅ FUNDO PRETO AQUI
      embed.addFields(
        { name: '📌 Antes', value: box(oldContent, 950) },
        { name: '🆕 Depois', value: box(newContent, 950) },
      );

      // Anexos (também com fundo preto)
      if (oldAttachInfo?.imgs) embed.addFields({ name: '🖼️ Imagens (ANTES)', value: box(oldAttachInfo.imgs, 950) });
      if (oldAttachInfo?.vids) embed.addFields({ name: '🎥 Vídeos (ANTES)', value: box(oldAttachInfo.vids, 950) });
      if (oldAttachInfo?.others) embed.addFields({ name: '📎 Arquivos (ANTES)', value: box(oldAttachInfo.others, 950) });

      if (newAttachInfo?.imgs) embed.addFields({ name: '🖼️ Imagens (DEPOIS)', value: box(newAttachInfo.imgs, 950) });
      if (newAttachInfo?.vids) embed.addFields({ name: '🎥 Vídeos (DEPOIS)', value: box(newAttachInfo.vids, 950) });
      if (newAttachInfo?.others) embed.addFields({ name: '📎 Arquivos (DEPOIS)', value: box(newAttachInfo.others, 950) });

      // Embeds (com fundo preto)
      if (oldEmbedText) embed.addFields({ name: '🧩 Embeds (ANTES)', value: box(oldEmbedText, 950) });
      if (newEmbedText) embed.addFields({ name: '🧩 Embeds (DEPOIS)', value: box(newEmbedText, 950) });

      // Stickers (com fundo preto)
      if (oldStickerText) embed.addFields({ name: '🧷 Stickers (ANTES)', value: box(oldStickerText, 950) });
      if (newStickerText) embed.addFields({ name: '🧷 Stickers (DEPOIS)', value: box(newStickerText, 950) });

      // Se tiver imagem depois, joga no embed
      const imgUrl = newAttachInfo?.firstImageUrl || null;
      if (imgUrl) embed.setImage(imgUrl);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('🔎 Ir pra mensagem').setStyle(ButtonStyle.Link).setURL(jumpLink),
        new ButtonBuilder().setLabel('👤 Ir pro usuário').setStyle(ButtonStyle.Link).setURL(userLink),
      );

      await logChannel.send({ embeds: [embed], components: [row] });
    } catch (err) {
      console.error('❌ messageUpdate log error:', err);
    }
  },
};
