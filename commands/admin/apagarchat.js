// commands/admin/apagarchat.js
import { EmbedBuilder, PermissionsBitField } from 'discord.js';

const LOG_CHANNEL_ID = '1486006769296740532';

// pega prefixo do .env (ou usa !)
function getPrefix() {
  return (process.env.PREFIX || '!').trim() || '!';
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

/**
 * !apagarchat <@user|id>
 * Apaga mensagens do usuário nas últimas 24h em todos os canais visíveis
 */
export async function apagarChatHandleMessage(message, client) {
  try {
    if (message.author.bot || !message.guild) return false;

    const PREFIX = getPrefix();

    // aceita !apagarchat e também variações tipo !ApagarChat
    if (!message.content?.toLowerCase().startsWith(`${PREFIX}apagarchat`)) return false;

    const args = message.content.trim().split(/\s+/);
    const idArgumento = args[1];
    if (!idArgumento) {
      await message.reply(`❌ Você precisa mencionar um usuário ou colocar o ID.\nEx: \`${PREFIX}apagarchat @usuario\``);
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

    const botPerms = me.permissions;
    if (!botPerms.has(PermissionsBitField.Flags.ManageMessages)) {
      await message.reply('❌ O bot está sem permissão **Manage Messages**.');
      await sendLog(client, message.guild, {
        content: '⚠️ **!apagarchat** falhou: bot sem **Manage Messages**.'
      });
      return true;
    }

    // alvo
    const userId = idArgumento.replace(/[<@!>]/g, '');
    const membroAlvo = await message.guild.members.fetch(userId).catch(() => null);
    if (!membroAlvo) {
      await message.reply('❌ Usuário não encontrado no servidor.');
      return true;
    }

    // feedback rápido
    await message.react('🧹').catch(() => {});
    const startTs = Date.now();

    const agora = Date.now();
    const LIMITE_24H = 24 * 60 * 60 * 1000;

    let totalApagadas = 0;
    let canaisEscaneados = 0;
    let canaisComErro = 0;
    const logsPorCanal = [];
    const erros = [];

    // pega canais texto que o bot consegue ver + ler histórico
    const canaisTexto = message.guild.channels.cache.filter(c => {
      if (!c?.isTextBased?.()) return false;
      if (!c.viewable) return false;

      // checa permissões do bot no canal
      const perms = c.permissionsFor(me);
      if (!perms) return false;
      return perms.has(PermissionsBitField.Flags.ViewChannel) &&
             perms.has(PermissionsBitField.Flags.ReadMessageHistory);
    });

    for (const canal of canaisTexto.values()) {
      canaisEscaneados++;

      // paginação: busca várias páginas até achar msgs >24h ou atingir limite
      let beforeId = null;
      let deletadasNoCanal = 0;
      let foundAny = false;

      try {
        for (let page = 0; page < 10; page++) { // até 10 páginas (1000 msgs) por canal
          const mensagens = await canal.messages.fetch({
            limit: 100,
            ...(beforeId ? { before: beforeId } : {})
          }).catch(err => {
            throw new Error(`fetch: ${err?.message || err}`);
          });

          if (!mensagens || mensagens.size === 0) break;

          // atualiza cursor
          beforeId = mensagens.last().id;

          // filtra do alvo e dentro de 24h
          const msgsDoUser = mensagens.filter(msg =>
            msg.author?.id === userId &&
            (agora - msg.createdTimestamp) <= LIMITE_24H
          );

          // se nessa página não tem nada do user, ainda assim pode ter nas anteriores,
          // mas se a ÚLTIMA msg da página já é mais velha que 24h, podemos parar.
          const lastMsg = mensagens.last();
          const lastIsOlderThan24h = lastMsg ? (agora - lastMsg.createdTimestamp) > LIMITE_24H : false;

          if (msgsDoUser.size > 0) {
            foundAny = true;

            // tenta bulkDelete (mais rápido) — só funciona em msgs <14 dias (ok pra 24h)
            const toDelete = [...msgsDoUser.values()];
            const chunks = chunkArray(toDelete, 100);

            for (const chunk of chunks) {
              // cria collection-like com ids
              const ids = chunk.map(m => m.id);

              // bulkDelete aceita array de ids também
              const deleted = await canal.bulkDelete(ids, true).catch(() => null);

              if (deleted && typeof deleted.size === 'number') {
                deletadasNoCanal += deleted.size;
                totalApagadas += deleted.size;
              } else {
                // fallback: deleta 1 a 1
                for (const msg of chunk) {
                  const ok = await msg.delete().then(() => true).catch(() => false);
                  if (ok) {
                    deletadasNoCanal++;
                    totalApagadas++;
                  }
                }
              }
            }
          }

          if (lastIsOlderThan24h) break;
        }

        if (foundAny) {
          logsPorCanal.push(`📁 **#${canal.name}**: \`${deletadasNoCanal} msg(s)\``);
        }

      } catch (err) {
        canaisComErro++;
        erros.push(`❗ #${canal?.name || 'canal'}: ${err?.message || err}`);
      }
    }

    const duracaoMs = Date.now() - startTs;

    // embed retorno no chat onde rodou
    const embed = new EmbedBuilder()
      .setColor('#ff6600')
      .setAuthor({
        name: `Limpeza de mensagens: ${membroAlvo.user.tag}`,
        iconURL: membroAlvo.user.displayAvatarURL()
      })
      .setDescription(`🧹 Apaguei **${totalApagadas} mensagens** de <@${userId}> nas últimas 24h.`)
      .addFields(
        { name: 'Canais escaneados', value: `\`${canaisEscaneados}\``, inline: true },
        { name: 'Canais com erro', value: `\`${canaisComErro}\``, inline: true },
        { name: 'Tempo', value: `\`${Math.ceil(duracaoMs / 1000)}s\``, inline: true },
        logsPorCanal.length > 0
          ? { name: 'Canais afetados', value: logsPorCanal.slice(0, 20).join('\n') }
          : { name: 'ℹ️ Resultado', value: 'Nenhuma mensagem encontrada nas últimas 24h.' },
      )
      .setFooter({
        text: `Comando executado por ${message.author.tag}`,
        iconURL: message.author.displayAvatarURL()
      })
      .setTimestamp();

    await message.channel.send({ embeds: [embed] }).catch(() => {});

    // ✅ LOG NO CANAL FIXO
    await sendLog(client, message.guild, {
      embeds: [
        new EmbedBuilder()
          .setColor('#ff6600')
          .setTitle('🧹 LOG — !apagarchat')
          .setDescription(
            `Executor: **${message.author.tag}** (\`${message.author.id}\`)\n` +
            `Alvo: **${membroAlvo.user.tag}** (\`${userId}\`)\n` +
            `Apagadas: **${totalApagadas}**\n` +
            `Canais escaneados: **${canaisEscaneados}** | Erros: **${canaisComErro}**\n` +
            `Tempo: **${Math.ceil(duracaoMs / 1000)}s**`
          )
          .addFields(
            logsPorCanal.length > 0
              ? { name: 'Canais afetados', value: logsPorCanal.slice(0, 25).join('\n') }
              : { name: 'Canais afetados', value: 'Nenhum.' },
            erros.length > 0
              ? { name: 'Erros (top 10)', value: erros.slice(0, 10).join('\n') }
              : { name: 'Erros', value: 'Nenhum.' }
          )
          .setTimestamp()
      ]
    });

    await message.delete().catch(() => {});
    await message.react('✅').catch(() => {});
    return true;

  } catch (e) {
    // se deu merda, tenta logar
    try {
      await sendLog(client, message.guild, {
        content: `❌ **!apagarchat** crashou: \`${e?.message || e}\``
      });
    } catch {}
    return true;
  }
}
