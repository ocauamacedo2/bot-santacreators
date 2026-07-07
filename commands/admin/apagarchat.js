// commands/admin/apagarchat.js
import { EmbedBuilder, PermissionsBitField } from 'discord.js';

const LOG_CHANNEL_ID = '1524041749905801216';

// pega prefixo do .env (ou usa !)
function getPrefix() {
  return (process.env.PREFIX || '!').trim() || '!';
}

async function resolveLogChannel(client, channelId) {
  try {
    const ch = await client.channels.fetch(channelId).catch(() => null);
    if (!ch || !ch.isTextBased?.()) return null;
    return ch;
  } catch {
    return null;
  }
}

async function sendLog(client, guild, payload) {
  try {
    const ch = await resolveLogChannel(client, LOG_CHANNEL_ID);
    if (ch) await ch.send(payload).catch(() => {});
  } catch {}
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function canalLink(guildId, channelId) {
  return `https://discord.com/channels/${guildId}/${channelId}`;
}

function mensagemLink(guildId, channelId, messageId) {
  return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}

function limparIdUsuario(valor) {
  return String(valor || '').replace(/[<@!>]/g, '');
}

/**
 * !apagarchat <@user|id|@everyone>
 * !apagachat <@user|id|@everyone>
 *
 * Apaga mensagens das últimas 24h em todos os canais visíveis.
 * Se usar @everyone, apaga mensagens de todos os usuários nas últimas 24h.
 */
export async function apagarChatHandleMessage(message, client) {
  try {
    if (message.author.bot || !message.guild) return false;

    const PREFIX = getPrefix();
    const content = message.content?.trim() || '';
    const contentLower = content.toLowerCase();

    const comandosAceitos = [
      `${PREFIX}apagarchat`,
      `${PREFIX}apagachat`,
    ];

    const comandoUsado = comandosAceitos.find(cmd =>
      contentLower === cmd || contentLower.startsWith(`${cmd} `)
    );

    if (!comandoUsado) return false;

    const args = content.split(/\s+/);
    const idArgumento = args[1];

    if (!idArgumento) {
      await message.reply(
        `❌ Você precisa mencionar um usuário, colocar o ID ou usar \`${PREFIX}apagarchat @everyone\`.\n` +
        `Ex: \`${PREFIX}apagarchat @usuario\`\n` +
        `Ex: \`${PREFIX}apagarchat 123456789012345678\`\n` +
        `Ex: \`${PREFIX}apagarchat @everyone\``
      );
      return true;
    }

    // ✅ permissões (user)
    const IDS_PERMITIDOS = [
      '660311795327828008', // Cauã
      '1262262852949905408', // Owner
      '1352408327983861844', // Resp Creator
      '1262262852949905409', // Resp Influ
      '1352407252216184833', // Resp Líder
      '1282119104576098314', // MKT Ticket
    ];

    const temPermissao =
      IDS_PERMITIDOS.includes(message.author.id) ||
      message.member?.roles?.cache?.some(r => IDS_PERMITIDOS.includes(r.id));

    if (!temPermissao) {
      setTimeout(() => message.delete().catch(() => {}), 1000);
      await message.reply('❌ Você não tem permissão pra usar esse comando.')
        .then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
      return true;
    }

    // ✅ permissões (bot)
    const me = await message.guild.members.fetchMe().catch(() => null);

    if (!me) {
      await message.reply('❌ Não consegui checar permissões do bot.');
      return true;
    }

    const botPermsGuild = me.permissions;

    if (!botPermsGuild.has(PermissionsBitField.Flags.ManageMessages)) {
      await message.reply('❌ O bot está sem permissão **Manage Messages**.');
      await sendLog(client, message.guild, {
        content: '⚠️ **!apagarchat** falhou: bot sem **Manage Messages**.'
      });
      return true;
    }

    const modoEveryone =
      idArgumento === '@everyone' ||
      idArgumento === 'everyone' ||
      idArgumento === '@here' ||
      idArgumento === 'here';

    const userId = limparIdUsuario(idArgumento);

    let membroAlvo = null;
    let alvoTexto = '';
    let alvoLog = '';

    if (modoEveryone) {
      alvoTexto = '@everyone';
      alvoLog = '@everyone / todos os usuários';
    } else {
      membroAlvo = await message.guild.members.fetch(userId).catch(() => null);

      if (!membroAlvo) {
        await message.reply('❌ Usuário não encontrado no servidor.');
        return true;
      }

      alvoTexto = `<@${userId}>`;
      alvoLog = `${membroAlvo.user.tag} (${userId})`;
    }

    await message.react('🧹').catch(() => {});

    const startTs = Date.now();
    const unixInicio = Math.floor(startTs / 1000);

    const agora = Date.now();
    const LIMITE_24H = 24 * 60 * 60 * 1000;
    const MAX_PAGINAS_POR_CANAL = 20;
    const DELETE_STATUS_APOS_MS = 30000;

    let totalApagadas = 0;
    let canaisEscaneados = 0;
    let canaisIgnorados = 0;
    let canaisComErro = 0;

    const logsPorCanal = [];
    const erros = [];
    const canaisSemPermissao = [];

    const canalComandoLink = canalLink(message.guild.id, message.channel.id);
    const mensagemComandoLink = mensagemLink(message.guild.id, message.channel.id, message.id);

    const statusEmbedInicial = new EmbedBuilder()
      .setColor('#ff6600')
      .setTitle('🧹 Limpeza iniciada')
      .setDescription(
        `Estou fazendo a varredura das mensagens das últimas **24h**.\n\n` +
        `**Alvo:** ${alvoTexto}\n` +
        `**Executor:** <@${message.author.id}>\n` +
        `**Canal:** <#${message.channel.id}>\n` +
        `**Início:** <t:${unixInicio}:F>`
      )
      .addFields(
        { name: 'Status', value: '`Preparando varredura...`', inline: false },
      )
      .setFooter({
        text: `Comando executado por ${message.author.tag}`,
        iconURL: message.author.displayAvatarURL()
      })
      .setTimestamp();

    const statusMsg = await message.channel.send({ embeds: [statusEmbedInicial] }).catch(() => null);

    await sendLog(client, message.guild, {
      embeds: [
        new EmbedBuilder()
          .setColor('#ffcc00')
          .setTitle('🧹 LOG — !apagarchat iniciado')
          .setThumbnail(message.author.displayAvatarURL())
          .setDescription(
            `**Executor:** ${message.author} — \`${message.author.tag}\`\n` +
            `**ID Executor:** \`${message.author.id}\`\n` +
            `**Alvo:** ${modoEveryone ? '@everyone / todos os usuários' : `<@${userId}> — \`${alvoLog}\``}\n` +
            `**Servidor:** \`${message.guild.name}\` — \`${message.guild.id}\`\n` +
            `**Canal usado:** <#${message.channel.id}>\n` +
            `**Link do canal:** ${canalComandoLink}\n` +
            `**Link da mensagem:** ${mensagemComandoLink}\n` +
            `**Data/Hora:** <t:${unixInicio}:F> — <t:${unixInicio}:R>`
          )
          .setTimestamp()
      ]
    });

    const canaisTexto = message.guild.channels.cache.filter(c => {
      if (!c?.isTextBased?.()) return false;
      if (!c.viewable) return false;
      if (!c.messages?.fetch) return false;

      const perms = c.permissionsFor(me);
      if (!perms) return false;

      return perms.has(PermissionsBitField.Flags.ViewChannel) &&
             perms.has(PermissionsBitField.Flags.ReadMessageHistory);
    });

    const totalCanaisParaEscanear = canaisTexto.size;

    if (statusMsg) {
      await statusMsg.edit({
        embeds: [
          EmbedBuilder.from(statusEmbedInicial)
            .setFields(
              { name: 'Status', value: `\`0/${totalCanaisParaEscanear} canais escaneados...\``, inline: false },
              { name: 'Mensagens apagadas até agora', value: '`0`', inline: true },
              { name: 'Erros até agora', value: '`0`', inline: true },
            )
        ]
      }).catch(() => {});
    }

    for (const canal of canaisTexto.values()) {
      canaisEscaneados++;

      let beforeId = null;
      let deletadasNoCanal = 0;
      let encontradasNoCanal = 0;
      let paginasLidas = 0;

      try {
        const permsCanal = canal.permissionsFor(me);

        if (!permsCanal?.has(PermissionsBitField.Flags.ManageMessages)) {
          canaisIgnorados++;
          canaisSemPermissao.push(`#${canal.name} (${canal.id}) — sem Manage Messages`);
          continue;
        }

        for (let page = 0; page < MAX_PAGINAS_POR_CANAL; page++) {
          paginasLidas++;

          const mensagens = await canal.messages.fetch({
            limit: 100,
            ...(beforeId ? { before: beforeId } : {})
          }).catch(err => {
            throw new Error(`fetch falhou: ${err?.message || err}`);
          });

          if (!mensagens || mensagens.size === 0) break;

          beforeId = mensagens.last()?.id || null;

          const mensagensDentroDe24h = mensagens.filter(msg =>
            (agora - msg.createdTimestamp) <= LIMITE_24H
          );

          const msgsParaApagar = mensagensDentroDe24h.filter(msg => {
            if (!msg.author?.id) return false;
            if (msg.id === message.id) return false;
            if (statusMsg && msg.id === statusMsg.id) return false;

            if (modoEveryone) return true;
            return msg.author.id === userId;
          });

          const lastMsg = mensagens.last();
          const lastIsOlderThan24h = lastMsg ? (agora - lastMsg.createdTimestamp) > LIMITE_24H : false;

          if (msgsParaApagar.size > 0) {
            encontradasNoCanal += msgsParaApagar.size;

            const toDelete = [...msgsParaApagar.values()];
            const chunks = chunkArray(toDelete, 100);

            for (const chunk of chunks) {
              const ids = chunk.map(m => m.id);

              const deleted = await canal.bulkDelete(ids, true).catch(() => null);

              if (deleted && typeof deleted.size === 'number') {
                deletadasNoCanal += deleted.size;
                totalApagadas += deleted.size;
              } else {
                for (const msg of chunk) {
                  const ok = await msg.delete().then(() => true).catch(() => false);
                  if (ok) {
                    deletadasNoCanal++;
                    totalApagadas++;
                  }
                }
              }

              await sleep(350);
            }
          }

          if (lastIsOlderThan24h) break;
          if (!beforeId) break;
        }

        if (encontradasNoCanal > 0 || deletadasNoCanal > 0) {
          logsPorCanal.push(
            `📁 **#${canal.name}** — apagadas: \`${deletadasNoCanal}\` | encontradas: \`${encontradasNoCanal}\` | páginas: \`${paginasLidas}\` | ${canalLink(message.guild.id, canal.id)}`
          );
        }

      } catch (err) {
        canaisComErro++;
        erros.push(`❗ #${canal?.name || 'canal'} (${canal?.id || 'sem id'}): ${err?.message || err}`);
      }

      if (statusMsg && (canaisEscaneados % 5 === 0 || canaisEscaneados === totalCanaisParaEscanear)) {
        await statusMsg.edit({
          embeds: [
            new EmbedBuilder()
              .setColor('#ff6600')
              .setTitle('🧹 Limpeza em andamento')
              .setDescription(
                `**Alvo:** ${alvoTexto}\n` +
                `**Executor:** <@${message.author.id}>\n` +
                `**Canal:** <#${message.channel.id}>\n` +
                `**Início:** <t:${unixInicio}:F>`
              )
              .addFields(
                { name: 'Progresso', value: `\`${canaisEscaneados}/${totalCanaisParaEscanear}\` canais`, inline: true },
                { name: 'Apagadas', value: `\`${totalApagadas}\``, inline: true },
                { name: 'Erros', value: `\`${canaisComErro}\``, inline: true },
                { name: 'Canal atual', value: `\`#${canal.name}\``, inline: false },
              )
              .setFooter({
                text: `Comando executado por ${message.author.tag}`,
                iconURL: message.author.displayAvatarURL()
              })
              .setTimestamp()
          ]
        }).catch(() => {});
      }
    }

    const duracaoMs = Date.now() - startTs;
    const unixFim = Math.floor(Date.now() / 1000);

    const embedFinal = new EmbedBuilder()
      .setColor(totalApagadas > 0 ? '#00cc66' : '#ffcc00')
      .setAuthor({
        name: modoEveryone
          ? 'Limpeza de mensagens: @everyone'
          : `Limpeza de mensagens: ${membroAlvo.user.tag}`,
        iconURL: modoEveryone
          ? message.guild.iconURL()
          : membroAlvo.user.displayAvatarURL()
      })
      .setDescription(
        `🧹 Apaguei **${totalApagadas} mensagens** ${modoEveryone ? 'de **todos os usuários**' : `de ${alvoTexto}`} nas últimas **24h**.`
      )
      .addFields(
        { name: 'Canais escaneados', value: `\`${canaisEscaneados}\``, inline: true },
        { name: 'Canais ignorados', value: `\`${canaisIgnorados}\``, inline: true },
        { name: 'Canais com erro', value: `\`${canaisComErro}\``, inline: true },
        { name: 'Tempo', value: `\`${Math.ceil(duracaoMs / 1000)}s\``, inline: true },
        { name: 'Início', value: `<t:${unixInicio}:T>`, inline: true },
        { name: 'Fim', value: `<t:${unixFim}:T>`, inline: true },
        logsPorCanal.length > 0
          ? { name: 'Canais afetados', value: logsPorCanal.slice(0, 10).join('\n') }
          : { name: 'ℹ️ Resultado', value: 'Nenhuma mensagem encontrada nas últimas 24h.' },
      )
      .setFooter({
        text: `Essa mensagem será apagada automaticamente.`,
        iconURL: message.author.displayAvatarURL()
      })
      .setTimestamp();

    if (statusMsg) {
      await statusMsg.edit({ embeds: [embedFinal] }).catch(() => {});
      setTimeout(() => statusMsg.delete().catch(() => {}), DELETE_STATUS_APOS_MS);
    } else {
      await message.channel.send({ embeds: [embedFinal] })
        .then(m => setTimeout(() => m.delete().catch(() => {}), DELETE_STATUS_APOS_MS))
        .catch(() => {});
    }

    const logFinal = new EmbedBuilder()
      .setColor(totalApagadas > 0 ? '#00cc66' : '#ffcc00')
      .setTitle('🧹 LOG — !apagarchat finalizado')
      .setThumbnail(modoEveryone ? message.guild.iconURL() : membroAlvo.user.displayAvatarURL())
      .setDescription(
        `**Executor:** ${message.author} — \`${message.author.tag}\`\n` +
        `**ID Executor:** \`${message.author.id}\`\n` +
        `**Alvo:** ${modoEveryone ? '@everyone / todos os usuários' : `<@${userId}> — \`${alvoLog}\``}\n` +
        `**Servidor:** \`${message.guild.name}\` — \`${message.guild.id}\`\n` +
        `**Canal usado:** <#${message.channel.id}>\n` +
        `**Link do canal:** ${canalComandoLink}\n` +
        `**Link da mensagem original:** ${mensagemComandoLink}\n` +
        `**Início:** <t:${unixInicio}:F> — <t:${unixInicio}:R>\n` +
        `**Fim:** <t:${unixFim}:F> — <t:${unixFim}:R>\n` +
        `**Tempo:** \`${Math.ceil(duracaoMs / 1000)}s\``
      )
      .addFields(
        { name: 'Mensagens apagadas', value: `\`${totalApagadas}\``, inline: true },
        { name: 'Canais escaneados', value: `\`${canaisEscaneados}\``, inline: true },
        { name: 'Canais ignorados', value: `\`${canaisIgnorados}\``, inline: true },
        { name: 'Canais com erro', value: `\`${canaisComErro}\``, inline: true },
        logsPorCanal.length > 0
          ? { name: 'Canais afetados', value: logsPorCanal.slice(0, 20).join('\n') }
          : { name: 'Canais afetados', value: 'Nenhum.' },
        erros.length > 0
          ? { name: 'Erros encontrados', value: erros.slice(0, 10).join('\n') }
          : { name: 'Erros encontrados', value: 'Nenhum.' },
        canaisSemPermissao.length > 0
          ? { name: 'Canais sem permissão', value: canaisSemPermissao.slice(0, 10).join('\n') }
          : { name: 'Canais sem permissão', value: 'Nenhum.' }
      )
      .setTimestamp();

    await sendLog(client, message.guild, {
      embeds: [logFinal]
    });

    await message.delete().catch(() => {});
    return true;

  } catch (e) {
    try {
      await sendLog(client, message.guild, {
        embeds: [
          new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('❌ LOG — !apagarchat crashou')
            .setDescription(
              `**Executor:** ${message.author ? `<@${message.author.id}>` : 'desconhecido'}\n` +
              `**Canal:** ${message.channel ? `<#${message.channel.id}>` : 'desconhecido'}\n` +
              `**Erro:** \`${e?.message || e}\``
            )
            .setTimestamp()
        ]
      });
    } catch {}

    try {
      await message.reply(`❌ O comando crashou: \`${e?.message || e}\``)
        .then(m => setTimeout(() => m.delete().catch(() => {}), 10000));
    } catch {}

    return true;
  }
}