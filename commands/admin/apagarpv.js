// /application/commands/admin/apagarpv.js
import { Events, EmbedBuilder, PermissionsBitField } from 'discord.js';

// ✅ Canais e variáveis importantes
const LOG_CHANNEL_ID = '1524041749905801216'; // Canal de logs completo

// ✅ Permissões autorizadas
const PERMITIDOS = [
  '1262262852949905408', // OWNER
  '1352408327983861844', // RESP CREATOR
  '1262262852949905409', // RESP INFLU
];

function getPrefix() {
  return (process.env.PREFIX || '!').trim() || '!';
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function userLink(userId) {
  return `https://discord.com/users/${userId}`;
}

function channelLink(guildId, channelId) {
  return `https://discord.com/channels/${guildId}/${channelId}`;
}

function messageLink(guildId, channelId, messageId) {
  return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}

function limparId(valor) {
  return String(valor || '').replace(/[<@!>]/g, '');
}

async function resolveLogChannel(client) {
  try {
    const canal = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    if (!canal || !canal.isTextBased?.()) return null;
    return canal;
  } catch {
    return null;
  }
}

async function editarStatus(statusMsg, embed) {
  if (!statusMsg) return;
  await statusMsg.edit({ embeds: [embed] }).catch(() => {});
}

async function buscarMensagensDoBotNaDM(dm, client, totalLimit = 1000) {
  const allMessages = [];
  let lastId = null;

  while (allMessages.length < totalLimit) {
    const options = { limit: 100 };
    if (lastId) options.before = lastId;

    const fetchedMessages = await dm.messages.fetch(options).catch(() => null);

    if (!fetchedMessages || fetchedMessages.size === 0) break;

    fetchedMessages.forEach(msg => allMessages.push(msg));

    lastId = fetchedMessages.last()?.id || null;

    if (!lastId) break;
    if (fetchedMessages.size < 100) break;

    await sleep(350);
  }

  return allMessages.filter(msg => msg.author?.id === client.user.id);
}

export function registerApagarPV(client) {
  client.on(Events.MessageCreate, async (message) => {
    try {
      if (message.author.bot) return;
      if (!message.guild) return;

      const PREFIX = getPrefix();
      const content = message.content?.trim() || '';
      const contentLower = content.toLowerCase();

      const comandosAceitos = [
        `${PREFIX}apagarpv`,
      ];

      const comandoUsado = comandosAceitos.find(cmd =>
        contentLower === cmd || contentLower.startsWith(`${cmd} `)
      );

      if (!comandoUsado) return;

      const membroTemPermissao =
        message.author.id === '660311795327828008' ||
        message.member?.roles?.cache?.some((role) => PERMITIDOS.includes(role.id));

      if (!membroTemPermissao) {
        setTimeout(() => message.delete().catch(() => {}), 1000);
        const msg = await message.reply('🚫 Você não tem permissão para usar esse comando.');
        setTimeout(() => msg.delete().catch(() => {}), 5000);
        return;
      }

      const args = content.split(/\s+/).slice(1);
      const alvo = args.join(' ').trim();

      if (!alvo) {
        return message.reply(
          `❌ Informe o ID, mencione a pessoa, mencione um cargo ou use \`${PREFIX}apagarpv @everyone\`.\n\n` +
          `Ex: \`${PREFIX}apagarpv @usuario\`\n` +
          `Ex: \`${PREFIX}apagarpv 123456789012345678\`\n` +
          `Ex: \`${PREFIX}apagarpv @cargo\`\n` +
          `Ex: \`${PREFIX}apagarpv @everyone\``
        );
      }

      const logChannel = await resolveLogChannel(client);

      if (!logChannel) {
        return message.reply('❌ Canal de log não encontrado ou inválido.');
      }

      const me = await message.guild.members.fetchMe().catch(() => null);

      if (!me) {
        return message.reply('❌ Não consegui checar o membro do bot no servidor.');
      }

      const botPerms = message.channel.permissionsFor(me);

      if (!botPerms?.has(PermissionsBitField.Flags.SendMessages)) {
        return;
      }

      const modoEveryone =
        alvo === '@everyone' ||
        alvo === 'everyone' ||
        alvo === '@here' ||
        alvo === 'here';

      let membros = [];

      if (modoEveryone) {
        const statusFetch = await message.reply('🔎 Buscando todos os membros do servidor...').catch(() => null);

        const todosMembros = await message.guild.members.fetch().catch(() => null);

        if (statusFetch) {
          await statusFetch.delete().catch(() => {});
        }

        if (!todosMembros) {
          return message.reply('❌ Não consegui buscar os membros do servidor. Verifique se o bot tem a intent **Guild Members** ativada.');
        }

        membros = [...todosMembros.values()].filter(m => !m.user.bot);
      } else if (message.mentions.roles.size > 0) {
        const cargo = message.mentions.roles.first();

        const todosMembros = await message.guild.members.fetch().catch(() => null);

        if (!todosMembros) {
          return message.reply('❌ Não consegui buscar os membros do servidor para filtrar o cargo.');
        }

        membros = [...todosMembros.values()].filter(m =>
          !m.user.bot && m.roles.cache.has(cargo.id)
        );
      } else if (message.mentions.members.size > 0) {
        membros = [...message.mentions.members.values()].filter(m => !m.user.bot);
      } else if (/^\d+$/.test(alvo)) {
        const membro = await message.guild.members.fetch(limparId(alvo)).catch(() => null);
        if (membro && !membro.user.bot) membros.push(membro);
      } else {
        return message.reply('❌ Nenhum membro ou cargo válido foi identificado.');
      }

      if (membros.length === 0) {
        return message.reply('❌ Nenhum membro válido encontrado para apagar PV.');
      }

      await message.delete().catch(() => {});

      const inicioMs = Date.now();
      const inicioUnix = Math.floor(inicioMs / 1000);

      const canalOrigemLink = channelLink(message.guild.id, message.channel.id);
      const mensagemOrigemLink = messageLink(message.guild.id, message.channel.id, message.id);

      const statusMsg = await message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor('#ff0066')
            .setTitle('🧹 Apagamento de PV iniciado')
            .setDescription(
              `Estou procurando mensagens enviadas pelo bot no privado dos usuários.\n\n` +
              `**Alvo:** ${modoEveryone ? '@everyone / todos os membros' : alvo}\n` +
              `**Total de membros na fila:** \`${membros.length}\`\n` +
              `**Executor:** <@${message.author.id}>\n` +
              `**Canal usado:** <#${message.channel.id}>\n` +
              `**Início:** <t:${inicioUnix}:F>`
            )
            .addFields(
              { name: 'Progresso', value: `\`0/${membros.length}\``, inline: true },
              { name: 'Mensagens apagadas', value: '`0`', inline: true },
              { name: 'Falhas', value: '`0`', inline: true }
            )
            .setFooter({ text: 'SantaCreators | Processo em andamento' })
            .setTimestamp()
        ],
        allowedMentions: { parse: [] }
      }).catch(() => null);

      await logChannel.send({
        embeds: [
          new EmbedBuilder()
            .setColor('#ffcc00')
            .setTitle('🧹 LOG — !apagarpv iniciado')
            .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
            .setDescription(
              `**Executor:** <@${message.author.id}> — \`${message.author.tag}\`\n` +
              `**ID Executor:** \`${message.author.id}\`\n` +
              `**Link do executor:** ${userLink(message.author.id)}\n\n` +
              `**Alvo informado:** \`${alvo}\`\n` +
              `**Modo:** ${modoEveryone ? '`@everyone / todos os membros`' : '`alvo específico/cargo`'}\n` +
              `**Total de membros na fila:** \`${membros.length}\`\n\n` +
              `**Servidor:** \`${message.guild.name}\` — \`${message.guild.id}\`\n` +
              `**Canal usado:** <#${message.channel.id}>\n` +
              `**Link do canal:** ${canalOrigemLink}\n` +
              `**Link da mensagem original:** ${mensagemOrigemLink}\n\n` +
              `**Data/Hora:** <t:${inicioUnix}:F> — <t:${inicioUnix}:R>`
            )
            .setFooter({ text: 'SantaCreators | Log completo de PV' })
            .setTimestamp()
        ],
        allowedMentions: { parse: [] }
      }).catch(() => {});

      let totalApagadas = 0;
      let totalUsuariosProcessados = 0;
      let totalUsuariosComDMFechada = 0;
      let totalUsuariosSemMensagem = 0;
      let totalFalhas = 0;

      const detalhesUsuarios = [];
      const erros = [];

      for (const membro of membros) {
        const user = membro.user;
        totalUsuariosProcessados++;

        let apagadasDoUsuario = 0;

        try {
          const dm = await user.createDM().catch(() => null);

          if (!dm) {
            totalUsuariosComDMFechada++;
            detalhesUsuarios.push(`🔒 <@${user.id}> — DM fechada ou inacessível.`);
            continue;
          }

          const mensagensDoBot = await buscarMensagensDoBotNaDM(dm, client, 1000);

          if (mensagensDoBot.length === 0) {
            totalUsuariosSemMensagem++;
            detalhesUsuarios.push(`ℹ️ <@${user.id}> — nenhuma mensagem do bot encontrada.`);
            continue;
          }

          for (const msg of mensagensDoBot) {
            const conteudo = msg.content?.slice(0, 1024) || '*[sem texto]*';
            const criadoUnix = Math.floor(msg.createdTimestamp / 1000);
            const apagadoUnix = Math.floor(Date.now() / 1000);

            const logEmbed = new EmbedBuilder()
              .setColor('#ff0066')
              .setTitle('🧹 Mensagem apagada no PV')
              .setThumbnail(user.displayAvatarURL({ dynamic: true }))
              .addFields(
                { name: '👤 Mensagem enviada para', value: `<@${user.id}> \`(${user.id})\`\n${userLink(user.id)}`, inline: false },
                { name: '🗑️ Apagado por', value: `<@${message.author.id}> \`(${message.author.id})\`\n${userLink(message.author.id)}`, inline: false },
                { name: '📍 Local usado', value: `<#${message.channel.id}>\n${canalOrigemLink}`, inline: false },
                { name: '🕒 Mensagem criada em', value: `<t:${criadoUnix}:F>`, inline: true },
                { name: '🧹 Apagada em', value: `<t:${apagadoUnix}:F>`, inline: true },
                { name: '💬 Conteúdo apagado', value: conteudo, inline: false }
              )
              .setFooter({ text: `SantaCreators | ID da mensagem apagada: ${msg.id}` })
              .setTimestamp();

            await logChannel.send({
              embeds: [logEmbed],
              allowedMentions: { parse: [] }
            }).catch(() => {});

            const deletou = await msg.delete().then(() => true).catch((err) => {
              erros.push(`❌ Falha ao apagar msg \`${msg.id}\` de ${user.tag} (${user.id}): ${err?.message || err}`);
              return false;
            });

            if (deletou) {
              apagadasDoUsuario++;
              totalApagadas++;
            }

            await sleep(450);
          }

          detalhesUsuarios.push(`✅ <@${user.id}> — \`${apagadasDoUsuario}\` mensagem(ns) apagada(s).`);

        } catch (err) {
          totalFalhas++;
          erros.push(`❌ ${user.tag} (${user.id}): ${err?.message || err}`);
          detalhesUsuarios.push(`❌ <@${user.id}> — erro no processo.`);
        }

        if (statusMsg && (totalUsuariosProcessados % 3 === 0 || totalUsuariosProcessados === membros.length)) {
          const agoraUnix = Math.floor(Date.now() / 1000);

          await editarStatus(
            statusMsg,
            new EmbedBuilder()
              .setColor('#ff0066')
              .setTitle('🧹 Apagamento de PV em andamento')
              .setDescription(
                `**Alvo:** ${modoEveryone ? '@everyone / todos os membros' : alvo}\n` +
                `**Executor:** <@${message.author.id}>\n` +
                `**Canal usado:** <#${message.channel.id}>\n` +
                `**Início:** <t:${inicioUnix}:F>\n` +
                `**Atualizado:** <t:${agoraUnix}:T>`
              )
              .addFields(
                { name: 'Progresso', value: `\`${totalUsuariosProcessados}/${membros.length}\``, inline: true },
                { name: 'Mensagens apagadas', value: `\`${totalApagadas}\``, inline: true },
                { name: 'Falhas', value: `\`${totalFalhas}\``, inline: true },
                { name: 'DM fechada/inacessível', value: `\`${totalUsuariosComDMFechada}\``, inline: true },
                { name: 'Sem mensagens do bot', value: `\`${totalUsuariosSemMensagem}\``, inline: true },
                { name: 'Usuário atual', value: `<@${user.id}> \`(${user.id})\``, inline: false }
              )
              .setFooter({ text: 'SantaCreators | Processo em andamento' })
              .setTimestamp()
          );
        }
      }

      const fimMs = Date.now();
      const fimUnix = Math.floor(fimMs / 1000);
      const duracao = Math.ceil((fimMs - inicioMs) / 1000);

      const resumoEmbed = new EmbedBuilder()
        .setColor(totalApagadas > 0 ? '#00ff88' : '#ffcc00')
        .setTitle('✅ Resumo do apagamento de PV')
        .setDescription(
          `O processo foi finalizado.\n\n` +
          `**Alvo:** ${modoEveryone ? '@everyone / todos os membros' : alvo}\n` +
          `**Executor:** <@${message.author.id}>\n` +
          `**Canal usado:** <#${message.channel.id}>`
        )
        .addFields(
          { name: '👥 Usuários na fila', value: `\`${membros.length}\``, inline: true },
          { name: '✅ Processados', value: `\`${totalUsuariosProcessados}\``, inline: true },
          { name: '🧹 Mensagens apagadas', value: `\`${totalApagadas}\``, inline: true },
          { name: '🔒 DM fechada/inacessível', value: `\`${totalUsuariosComDMFechada}\``, inline: true },
          { name: 'ℹ️ Sem mensagens do bot', value: `\`${totalUsuariosSemMensagem}\``, inline: true },
          { name: '❌ Falhas', value: `\`${totalFalhas}\``, inline: true },
          { name: '⏱️ Tempo total', value: `\`${duracao}s\``, inline: true },
          { name: '📅 Início', value: `<t:${inicioUnix}:F>`, inline: false },
          { name: '📅 Fim', value: `<t:${fimUnix}:F>`, inline: false }
        )
        .setFooter({ text: 'SantaCreators | Resumo de apagamento privado' })
        .setTimestamp();

      if (statusMsg) {
        await statusMsg.edit({
          embeds: [resumoEmbed],
          allowedMentions: { parse: [] }
        }).catch(() => {});

        setTimeout(() => statusMsg.delete().catch(() => {}), 30000);
      } else {
        const confirmMsg = await message.channel.send({
          embeds: [resumoEmbed],
          allowedMentions: { parse: [] }
        }).catch(() => null);

        setTimeout(() => {
          confirmMsg?.delete().catch(() => {});
        }, 30000);
      }

      const detalhesLimitados = detalhesUsuarios.slice(0, 25).join('\n') || 'Nenhum detalhe.';
      const errosLimitados = erros.slice(0, 15).join('\n') || 'Nenhum erro.';

      await logChannel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(totalApagadas > 0 ? '#00ff88' : '#ffcc00')
            .setTitle('✅ LOG — !apagarpv finalizado')
            .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
            .setDescription(
              `**Executor:** <@${message.author.id}> — \`${message.author.tag}\`\n` +
              `**ID Executor:** \`${message.author.id}\`\n` +
              `**Link do executor:** ${userLink(message.author.id)}\n\n` +
              `**Alvo informado:** \`${alvo}\`\n` +
              `**Modo:** ${modoEveryone ? '`@everyone / todos os membros`' : '`alvo específico/cargo`'}\n\n` +
              `**Servidor:** \`${message.guild.name}\` — \`${message.guild.id}\`\n` +
              `**Canal usado:** <#${message.channel.id}>\n` +
              `**Link do canal:** ${canalOrigemLink}\n` +
              `**Link da mensagem original:** ${mensagemOrigemLink}\n\n` +
              `**Início:** <t:${inicioUnix}:F> — <t:${inicioUnix}:R>\n` +
              `**Fim:** <t:${fimUnix}:F> — <t:${fimUnix}:R>\n` +
              `**Tempo total:** \`${duracao}s\``
            )
            .addFields(
              { name: '👥 Usuários na fila', value: `\`${membros.length}\``, inline: true },
              { name: '✅ Processados', value: `\`${totalUsuariosProcessados}\``, inline: true },
              { name: '🧹 Mensagens apagadas', value: `\`${totalApagadas}\``, inline: true },
              { name: '🔒 DM fechada/inacessível', value: `\`${totalUsuariosComDMFechada}\``, inline: true },
              { name: 'ℹ️ Sem mensagens do bot', value: `\`${totalUsuariosSemMensagem}\``, inline: true },
              { name: '❌ Falhas', value: `\`${totalFalhas}\``, inline: true },
              { name: '📋 Detalhes dos usuários', value: detalhesLimitados },
              { name: '⚠️ Erros encontrados', value: errosLimitados }
            )
            .setFooter({ text: 'SantaCreators | Log completo de PV' })
            .setTimestamp()
        ],
        allowedMentions: { parse: [] }
      }).catch(() => {});

    } catch (err) {
      const logChannel = await resolveLogChannel(client).catch(() => null);

      if (logChannel) {
        await logChannel.send({
          embeds: [
            new EmbedBuilder()
              .setColor('#ff0000')
              .setTitle('❌ LOG — !apagarpv crashou')
              .setDescription(
                `**Executor:** ${message.author ? `<@${message.author.id}>` : 'desconhecido'}\n` +
                `**Canal:** ${message.channel ? `<#${message.channel.id}>` : 'desconhecido'}\n` +
                `**Erro:** \`${err?.message || err}\``
              )
              .setTimestamp()
          ],
          allowedMentions: { parse: [] }
        }).catch(() => {});
      }

      await message.reply(`❌ O comando crashou: \`${err?.message || err}\``)
        .then(m => setTimeout(() => m.delete().catch(() => {}), 10000))
        .catch(() => {});
    }
  });
}