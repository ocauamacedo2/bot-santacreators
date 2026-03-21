// commands/admin/say.js
import {
  AttachmentBuilder,
  EmbedBuilder,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import fetch from 'node-fetch';
import { autoReactsFotosProcessSentMessage } from '../../events/autoReactsFotos.js';

const MAX_LEN = 2000;
const LOG_CHANNEL_ID = '1425184455185924127';

// ===== helpers visuais =====
const TYPE_ICON = {
  [ChannelType.GuildText]: '📝',
  [ChannelType.GuildAnnouncement]: '📣',
  [ChannelType.GuildVoice]: '🔊',
  [ChannelType.GuildStageVoice]: '🎙️',
  [ChannelType.PublicThread]: '🧵',
  [ChannelType.PrivateThread]: '🧵🔒',
  [ChannelType.AnnouncementThread]: '🧵📣',
};

function prettyType(channel) {
  const icon = TYPE_ICON[channel?.type] ?? '📦';
  const label =
    channel?.type === ChannelType.GuildText ? 'Texto' :
    channel?.type === ChannelType.GuildVoice ? 'Voz' :
    channel?.type === ChannelType.GuildStageVoice ? 'Palco' :
    channel?.type === ChannelType.PublicThread ? 'Tópico público' :
    channel?.type === ChannelType.PrivateThread ? 'Tópico privado' :
    channel?.type === ChannelType.AnnouncementThread ? 'Tópico de anúncio' :
    String(channel?.type ?? '—');
  return `${icon} ${label}`;
}

// ===== LOG mais bonito =====
async function logSayUsage(message, opts = {}) {
  try {
    const { firstOutputMsg = null, partes = 1, anexosQtd = 0, preview = null } = opts;

    const guild   = message.guild;
    const channel = message.channel;
    const parent  = channel?.parent ?? null;

    // links (capturados antes da deleção do comando)
    const cmdJump = message.url;
    const outJump = firstOutputMsg?.url ?? null;

    // horário
    const usedAt = Math.floor((message.createdTimestamp ?? Date.now()) / 1000);

    const logChannel = await message.client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    if (!logChannel) return;

    const user   = message.author;
    const avatar = user.displayAvatarURL({ size: 256 });

    // cabeçalho com ícone e timestamp
    const embed = new EmbedBuilder()
      .setAuthor({ name: 'Comando SAY utilizado', iconURL: 'https://cdn-icons-png.flaticon.com/512/724/724715.png' })
      .setThumbnail(avatar)
      .setColor(0x8B5CF6) // roxo suave
      .addFields(
        {
          name: '👤 Executor',
          value: `${user}  \n\`${user.tag}\` ・ \`${user.id}\``,
          inline: true
        },
        {
          name: '🕒 Quando',
          value: `<t:${usedAt}:F>\n(<t:${usedAt}:R>)`,
          inline: true
        },
        {
          name: '📍 Local',
          value:
            `${prettyType(channel)} em <#${channel?.id}> \n` +
            `Categoria: **${parent?.name ?? 'sem categoria'}**${parent ? ` \`(${parent.id})\`` : ''}`,
          inline: false
        },
        {
          name: '📦 Detalhes',
          value: `Partes: **${partes}** ・ Anexos: **${anexosQtd}**`,
          inline: true
        }
      )
      .setTimestamp(usedAt * 1000);

    if (preview) {
      // usa code-block pra ficar limpo e não “sujar” o log com markdown do usuário
      const safe = preview.replace(/```/g, 'ʼʼʼ'); // evita quebrar o bloco se tiver ```
      embed.addFields({ name: '📝 Prévia do conteúdo', value: '```txt\n' + safe + '\n```' });
    }

    if (guild?.name) {
      const icon = guild.iconURL?.({ size: 128 }) ?? null;
      embed.setFooter({ text: guild.name, iconURL: icon ?? undefined });
    }

    // botões de ação (ficam MUITO mais bonitos que links soltos no embed)
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Abrir comando')
        .setStyle(ButtonStyle.Link)
        .setURL(cmdJump ?? 'https://discord.com'),
      new ButtonBuilder()
        .setLabel('Abrir 1ª saída')
        .setStyle(ButtonStyle.Link)
        .setDisabled(!outJump)
        .setURL(outJump ?? 'https://discord.com')
    );

    await logChannel.send({ embeds: [embed], components: [row] }).catch(() => {});
  } catch (e) {
    console.error('[say][log] falha ao enviar log:', e);
  }
}

export default {
  name: 'say',
  description: 'Repete a mensagem do autor o mais fiel possível (texto, reply e anexos).',

  checkPerms(message) {
    const membrosPermitidos = ['660311795327828008'];
    const cargosPermitidos = [
      '1262262852949905408',
      '1352408327983861844',
      '1262262852949905409',
    ];

    const membroTemPermissao = membrosPermitidos.includes(message.author.id);
    const cargoTemPermissao =
      message.member?.roles.cache.some((role) => cargosPermitidos.includes(role.id)) || false;

    return membroTemPermissao || cargoTemPermissao;
  },

  // pega o conteúdo EXATO após o token de comando (!say, /say, .say, etc.)
  _rawTextoDepoisDoComando(message) {
    const m = message.content.match(/^\s*([!./])?\s*say\b/i);
    if (!m) return '';
    const start = m[0].length;
    return message.content.slice(start).replace(/^\s/, '');
  },

  _dividirMensagemBruta(texto, limite = MAX_LEN) {
    const partes = [];
    let t = texto;
    while (t.length > limite) {
      let chunk = t.slice(0, limite);
      const q1 = chunk.lastIndexOf('\n');
      const q2 = chunk.lastIndexOf(' ');
      const quebra = Math.max(q1, q2);
      if (quebra > 0) chunk = chunk.slice(0, quebra);
      partes.push(chunk);
      t = t.slice(chunk.length);
    }
    if (t.length) partes.push(t);
    return partes;
  },

  async _coletarAnexos(message) {
    const arquivos = [];
    for (const att of message.attachments.values()) {
      try {
        const res = await fetch(att.url);
        const buffer = Buffer.from(await res.arrayBuffer());
        const file = new AttachmentBuilder(buffer, { name: att.name });
        if (att.spoiler) file.setSpoiler(true);
        arquivos.push(file);
      } catch (err) {
        console.error(`[say] Falha ao baixar anexo ${att.name}:`, err);
      }
    }
    return arquivos;
  },

  _allowedMentionsFromOriginal(message) {
    return {
      parse: [],
      users: [...message.mentions.users.keys()],
      roles: [...message.mentions.roles.keys()],
      repliedUser: false,
    };
  },

  async execute(message /*, args */) {
    // salva o link antes de deletar
    const cmdJumpLink = message.url;

    try {
      if (!this.checkPerms(message)) {
        setTimeout(() => message.delete().catch(() => {}), 1000);
        const warn = await message.reply('❌ Você não tem permissão para usar este comando.');
        setTimeout(() => warn.delete().catch(() => {}), 5000);
        return;
      }

      const textoOriginal = this._rawTextoDepoisDoComando(message);
      const anexos = await this._coletarAnexos(message);

      if (!textoOriginal && anexos.length === 0) {
        const warn = await message.reply('⚠️ Você precisa escrever algo ou enviar um anexo.');
        setTimeout(() => warn.delete().catch(() => {}), 5000);
        return;
      }

      const replyTargetId = message.reference?.messageId ?? null;
      const replyOpt = replyTargetId
        ? { messageReference: replyTargetId, failIfNotExists: false }
        : undefined;

      const allowedMentions = this._allowedMentionsFromOriginal(message);

      if (message.deletable) await message.delete().catch(() => {});

      let firstOutputMsg = null;

if (!textoOriginal || textoOriginal.length <= MAX_LEN) {
  const sent = await message.channel.send({
    content: textoOriginal || null,
    files: anexos.length ? anexos : undefined,
    allowedMentions,
    reply: replyOpt,
  });
  firstOutputMsg = sent;

  Promise.resolve()
    .then(() => autoReactsFotosProcessSentMessage(sent, message.client, {
      retries: 3,
      delayMs: 900,
      mode: 'say'
    }))
    .catch((err) => console.error('[say] Falha no auto react pós-envio:', err));

  await logSayUsage(message, {
    firstOutputMsg,
    partes: 1,
    anexosQtd: anexos.length,
    preview: (textoOriginal || '').slice(0, 300)
  });
  return;
}

const partes = this._dividirMensagemBruta(textoOriginal);
for (let i = 0; i < partes.length; i++) {
  const isLast = i === partes.length - 1;
  const sent = await message.channel.send({
    content: partes[i],
    files: isLast && anexos.length ? anexos : undefined,
    allowedMentions,
    reply: i === 0 ? replyOpt : undefined,
  });

  if (i === 0) firstOutputMsg = sent;

  Promise.resolve()
    .then(() => autoReactsFotosProcessSentMessage(sent, message.client, {
      retries: isLast ? 3 : 1,
      delayMs: 900,
      mode: 'say'
    }))
    .catch((err) => console.error('[say] Falha no auto react pós-envio:', err));
}

      await logSayUsage(message, {
        firstOutputMsg,
        partes: partes.length,
        anexosQtd: anexos.length,
        preview: textoOriginal.slice(0, 300)
      });

    } catch (err) {
      console.error('[say] Erro ao executar:', err);
      try {
        const warn = await message.channel.send('⚠️ Deu algo errado ao enviar o say.');
        setTimeout(() => warn.delete().catch(() => {}), 6000);
      } catch {}
      try {
        await logSayUsage(message, {
          firstOutputMsg: null,
          partes: 0,
          anexosQtd: 0,
          preview: (this._rawTextoDepoisDoComando(message) || '').slice(0, 300)
        });
      } catch {}
    }
  },
};
