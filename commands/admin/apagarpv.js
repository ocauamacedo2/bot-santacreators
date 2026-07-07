// /application/commands/admin/apagarpv.js
import { EmbedBuilder, PermissionsBitField, ChannelType, User } from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';

const LOG_CHANNEL_ID = '1524041749905801216';

const PERMITIDOS = [
  '1262262852949905408',
  '1352408327983861844',
  '1262262852949905409',
];

const PV_REGISTRY_PATH = path.resolve('data', 'pvMessages.json');

function carregarRegistroPV() {
  try {
    if (!fs.existsSync('data')) fs.mkdirSync('data', { recursive: true });
    if (!fs.existsSync(PV_REGISTRY_PATH)) fs.writeFileSync(PV_REGISTRY_PATH, '{}', 'utf8');
    return JSON.parse(fs.readFileSync(PV_REGISTRY_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function salvarRegistroPV(data) {
  try {
    if (!fs.existsSync('data')) fs.mkdirSync('data', { recursive: true });
    fs.writeFileSync(PV_REGISTRY_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch {}
}

export function registrarMensagemPV(userId, message) {
  if (!userId || !message?.id || !message?.channelId) return;

  const data = carregarRegistroPV();

  data[userId] ??= [];

  data[userId].push({
    messageId: message.id,
    channelId: message.channelId,
    createdAt: Date.now(),
    authorId: message.author?.id || null,
  });

  data[userId] = data[userId]
    .filter(item => item?.messageId && item?.channelId)
    .slice(-500);

  salvarRegistroPV(data);
}

export function instalarRegistroAutomaticoPV(client) {
  if (globalThis.__SC_PV_AUTO_REGISTRY_INSTALLED__) return;
  globalThis.__SC_PV_AUTO_REGISTRY_INSTALLED__ = true;

  const originalSend = User.prototype.send;

  User.prototype.send = async function (...args) {
    const sentMessage = await originalSend.apply(this, args);

    try {
      if (
        sentMessage?.id &&
        sentMessage?.channelId &&
        sentMessage?.author?.id === client.user?.id
      ) {
        registrarMensagemPV(this.id, sentMessage);
      }
    } catch {}

    return sentMessage;
  };
}

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
  return String(valor || '').replace(/[<@!>&]/g, '');
}

function extrairIdsMencionados(content) {
  return [...String(content || '').matchAll(/<@!?(\d{17,22})>/g)].map(match => match[1]);
}

function cortarTexto(texto, limite = 950) {
  const str = String(texto || '');
  if (!str.trim()) return '*[sem texto]*';
  if (str.length <= limite) return str;
  return `${str.slice(0, limite - 20)}... [cortado]`;
}

function detectarErroDM(erroMsg) {
  const texto = String(erroMsg || '').toLowerCase();

  if (
    texto.includes('anti-spam') ||
    texto.includes('quarantine') ||
    texto.includes('appeal this action') ||
    texto.includes('flagged by our anti-spam')
  ) {
    return 'ANTI_SPAM_QUARENTENA';
  }

  if (
    texto.includes('50007') ||
    texto.includes('cannot send messages to this user') ||
    texto.includes('missing access') ||
    texto.includes('missing permissions') ||
    texto.includes('unknown channel') ||
    texto.includes('unknown message')
  ) {
    return 'DM_INACESSIVEL';
  }

  return 'ERRO_DESCONHECIDO';
}

async function resolveLogChannel(client) {
  const canal = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
  if (!canal || !canal.isTextBased?.()) return null;
  return canal;
}

async function enviarLog(client, payload) {
  const canal = await resolveLogChannel(client).catch(() => null);
  if (!canal) return false;
  await canal.send(payload).catch(() => {});
  return true;
}

async function editarStatus(statusMsg, embed) {
  if (!statusMsg) return;
  await statusMsg.edit({
    embeds: [embed],
    allowedMentions: { parse: [] }
  }).catch(() => {});
}

function procurarDmNoCacheDoUsuario(client, userId) {
  return client.channels.cache.find((canal) => {
    if (!canal) return false;

    const isDM =
      canal.type === ChannelType.DM ||
      canal.type === 1 ||
      canal.constructor?.name === 'DMChannel';

    if (!isDM) return false;

    return canal.recipient?.id === userId || canal.recipientId === userId;
  }) || null;
}

async function buscarDmDoUsuario(user, client, permitirAbrirDM = false) {
  let dm = user.dmChannel || null;

  if (!dm) {
    dm = procurarDmNoCacheDoUsuario(client, user.id);
  }

  if (dm) {
    return dm;
  }

  if (!permitirAbrirDM) {
    throw new Error(
      'DM não está no cache do bot. Para tentar abrir a DM mesmo assim, use --scan-force. ' +
      'Aviso: o Discord pode bloquear por anti-spam/quarentena.'
    );
  }

  dm = await user.createDM().catch((err) => {
    throw new Error(
      `Não consegui abrir/criar DM: ${err?.code || ''} ${err?.message || err}`
    );
  });

  if (!dm) {
    dm = user.dmChannel || null;
  }

  if (!dm) {
    dm = procurarDmNoCacheDoUsuario(client, user.id);
  }

  if (!dm) {
    throw new Error('Não consegui abrir/criar DM: retorno vazio.');
  }

  return dm;
}

async function apagarMensagensRegistradasPV(userId, client) {
  const data = carregarRegistroPV();
  const registros = Array.isArray(data[userId]) ? data[userId] : [];

  let apagadas = 0;
  let falhas = 0;
  const erros = [];
  const restantes = [];

  for (const item of registros) {
    try {
      const canal = await client.channels.fetch(item.channelId).catch(() => null);

      if (!canal || !canal.isTextBased?.()) {
        falhas++;
        erros.push(`Canal DM não encontrado: ${item.channelId} / msg ${item.messageId}`);
        restantes.push(item);
        continue;
      }

      const msg = await canal.messages.fetch(item.messageId).catch(() => null);

      if (!msg) {
        continue;
      }

      if (msg.author?.id !== client.user.id) {
        restantes.push(item);
        continue;
      }

      await msg.delete();
      apagadas++;

      await sleep(350);
    } catch (err) {
      falhas++;
      erros.push(`${item.channelId}/${item.messageId}: ${err?.code || ''} ${err?.message || err}`);
      restantes.push(item);
    }
  }

  data[userId] = restantes;
  salvarRegistroPV(data);

  return {
    tentadas: registros.length,
    apagadas,
    falhas,
    erros,
  };
}

async function buscarMensagensDoBotNaDM(dm, client, totalLimit = 2000) {
  const todas = [];
  const erros = [];

  let beforeId = null;
  let paginas = 0;

  while (todas.length < totalLimit) {
    paginas++;

    const options = { limit: 100 };
    if (beforeId) options.before = beforeId;

    const fetched = await dm.messages.fetch(options).catch((err) => {
      erros.push(`Página ${paginas}: ${err?.code || ''} ${err?.message || err}`);
      return null;
    });

    if (!fetched || fetched.size === 0) break;

    for (const msg of fetched.values()) {
      todas.push(msg);
    }

    beforeId = fetched.last()?.id || null;

    if (!beforeId) break;
    if (fetched.size < 100) break;

    await sleep(400);
  }

  const mensagensDoBotAtual = todas.filter(msg => msg.author?.id === client.user.id);
  const mensagensDeOutrosBots = todas.filter(msg => msg.author?.bot && msg.author?.id !== client.user.id);

  return {
    paginas,
    totalLidas: todas.length,
    mensagensDoBotAtual,
    mensagensDeOutrosBots,
    erros,
    primeiraMensagemId: todas[0]?.id || 'nenhuma',
    ultimaMensagemId: todas[todas.length - 1]?.id || 'nenhuma',
  };
}

async function resolverMembros(message, alvo) {
  const modoEveryone =
    alvo === '@everyone' ||
    alvo === 'everyone' ||
    alvo === '@here' ||
    alvo === 'here';

  let membros = [];

  if (modoEveryone) {
    const todosMembros = await message.guild.members.fetch().catch(() => null);

    if (!todosMembros) {
      throw new Error('Não consegui buscar todos os membros. Ative a intent Guild Members no portal e no client.');
    }

    membros = [...todosMembros.values()].filter(m => !m.user.bot);
  } else if (message.mentions.roles.size > 0) {
    const cargo = message.mentions.roles.first();

    const todosMembros = await message.guild.members.fetch().catch(() => null);

    if (!todosMembros) {
      throw new Error('Não consegui buscar os membros para filtrar o cargo.');
    }

    membros = [...todosMembros.values()].filter(m =>
      !m.user.bot && m.roles.cache.has(cargo.id)
    );
  } else {
    const idsMencionados = extrairIdsMencionados(message.content);

    if (idsMencionados.length > 0) {
      for (const id of idsMencionados) {
        const membro = await message.guild.members.fetch(id).catch(() => null);
        if (membro && !membro.user.bot) membros.push(membro);
      }
    } else {
      const idLimpo = limparId(alvo);

      if (/^\d{17,22}$/.test(idLimpo)) {
        const membro = await message.guild.members.fetch(idLimpo).catch(() => null);
        if (membro && !membro.user.bot) membros.push(membro);
      }
    }
  }

  membros = [...new Map(membros.map(m => [m.id, m])).values()];

  return {
    modoEveryone,
    membros,
  };
}

export async function apagarPVHandleMessage(message, client) {
  try {
    if (message.author.bot) return false;
    if (!message.guild) return false;

    const PREFIX = getPrefix();
    const content = message.content?.trim() || '';
    const contentLower = content.toLowerCase();

    if (
      contentLower !== `${PREFIX}apagarpv` &&
      !contentLower.startsWith(`${PREFIX}apagarpv `)
    ) {
      return false;
    }

    const membroTemPermissao =
      message.author.id === '660311795327828008' ||
      message.member?.roles?.cache?.some(role => PERMITIDOS.includes(role.id));

    if (!membroTemPermissao) {
      setTimeout(() => message.delete().catch(() => {}), 1000);
      const msg = await message.reply('🚫 Você não tem permissão para usar esse comando.').catch(() => null);
      setTimeout(() => msg?.delete().catch(() => {}), 5000);
      return true;
    }

    const me = await message.guild.members.fetchMe().catch(() => null);

    if (!me) {
      await message.reply('❌ Não consegui checar o bot no servidor.').catch(() => {});
      return true;
    }

    const botPerms = message.channel.permissionsFor(me);

    if (!botPerms?.has(PermissionsBitField.Flags.SendMessages)) {
      return true;
    }

    const logChannel = await resolveLogChannel(client);

    if (!logChannel) {
      await message.reply('❌ Canal de log não encontrado ou inválido.').catch(() => {});
      return true;
    }

    const args = content.split(/\s+/).slice(1);
    const alvo = args.join(' ').trim();

    if (!alvo) {
      await message.reply(
        `❌ Informe o ID, mencione a pessoa, mencione um cargo ou use \`${PREFIX}apagarpv @everyone\`.\n\n` +
        `Ex: \`${PREFIX}apagarpv @usuario\`\n` +
        `Ex: \`${PREFIX}apagarpv 123456789012345678\`\n` +
        `Ex: \`${PREFIX}apagarpv @cargo\`\n` +
        `Ex: \`${PREFIX}apagarpv @everyone\``
      ).catch(() => {});
      return true;
    }

    let modoEveryone = false;
    let membros = [];

    try {
      const resolvido = await resolverMembros(message, alvo);
      modoEveryone = resolvido.modoEveryone;
      membros = resolvido.membros;
    } catch (err) {
      await message.reply(`❌ ${err?.message || err}`).catch(() => {});
      return true;
    }

    if (membros.length === 0) {
      await message.reply('❌ Nenhum membro válido encontrado.').catch(() => {});
      return true;
    }

    const inicioMs = Date.now();
    const inicioUnix = Math.floor(inicioMs / 1000);

    const canalOrigemLink = channelLink(message.guild.id, message.channel.id);
    const mensagemOrigemLink = messageLink(message.guild.id, message.channel.id, message.id);

    await message.delete().catch(() => {});

    const statusMsg = await message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor('#ff0066')
          .setTitle('🧹 Apagamento de PV iniciado')
          .setDescription(
            `**Alvo:** ${modoEveryone ? '@everyone / todos os membros' : alvo}\n` +
            `**Usuários na fila:** \`${membros.length}\`\n` +
            `**Executor:** <@${message.author.id}>\n` +
            `**Canal usado:** <#${message.channel.id}>\n` +
            `**Bot atual:** <@${client.user.id}> \`${client.user.id}\`\n` +
            `**Início:** <t:${inicioUnix}:F>`
          )
          .addFields(
            { name: 'Progresso', value: `\`0/${membros.length}\``, inline: true },
            { name: 'Apagadas', value: '`0`', inline: true },
            { name: 'Falhas', value: '`0`', inline: true }
          )
          .setFooter({ text: 'SantaCreators | Processo em andamento' })
          .setTimestamp()
      ],
      allowedMentions: { parse: [] }
    }).catch(() => null);

    await enviarLog(client, {
      embeds: [
        new EmbedBuilder()
          .setColor('#ffcc00')
          .setTitle('🧹 LOG — !apagarpv iniciado')
          .setDescription(
            `**Executor:** <@${message.author.id}> — \`${message.author.tag}\`\n` +
            `**ID Executor:** \`${message.author.id}\`\n` +
            `**Link do executor:** ${userLink(message.author.id)}\n\n` +
            `**Bot atual:** <@${client.user.id}> — \`${client.user.tag}\` — \`${client.user.id}\`\n\n` +
            `**Alvo informado:** \`${alvo}\`\n` +
            `**Modo:** ${modoEveryone ? '`@everyone / todos os membros`' : '`alvo específico/cargo`'}\n` +
            `**Usuários na fila:** \`${membros.length}\`\n\n` +
            `**Servidor:** \`${message.guild.name}\` — \`${message.guild.id}\`\n` +
            `**Canal usado:** <#${message.channel.id}>\n` +
            `**Link do canal:** ${canalOrigemLink}\n` +
            `**Link da mensagem original:** ${mensagemOrigemLink}\n\n` +
            `**Data/Hora:** <t:${inicioUnix}:F> — <t:${inicioUnix}:R>`
          )
          .setTimestamp()
      ],
      allowedMentions: { parse: [] }
    });

    let totalApagadas = 0;
    let totalProcessados = 0;
    let totalDmInacessivel = 0;
    let totalSemMensagemDoBotAtual = 0;
    let totalMensagensLidas = 0;
    let totalMensagensDeOutrosBots = 0;
    let totalFalhas = 0;
    let totalPaginas = 0;
    let totalAntiSpamQuarentena = 0;
    let ultimoErroVisivel = 'Nenhum erro até agora.';

    const detalhes = [];
    const erros = [];

    for (const membro of membros) {
      const user = membro.user;
      totalProcessados++;

      try {
        const forcarScanDM = contentLower.includes('--scan');
        const forcarAbrirDM = contentLower.includes('--scan-force');
        const apagadasRegistradas = await apagarMensagensRegistradasPV(user.id, client);

        if (apagadasRegistradas.apagadas > 0) {
          totalApagadas += apagadasRegistradas.apagadas;

          detalhes.push(
            `✅ <@${user.id}> — \`${apagadasRegistradas.apagadas}\` mensagem(ns) apagada(s) pelo registro salvo.`
          );
        }

        if (apagadasRegistradas.falhas > 0) {
          totalFalhas += apagadasRegistradas.falhas;
          erros.push(
            `⚠️ Falhas no registro salvo de ${user.tag} (${user.id}): ` +
            apagadasRegistradas.erros.slice(0, 5).join(' | ')
          );
        }

        const deveVarrerDM =
          forcarScanDM ||
          apagadasRegistradas.tentadas === 0 ||
          apagadasRegistradas.apagadas === 0;

        if (!deveVarrerDM) {
          detalhes.push(
            `ℹ️ <@${user.id}> — mensagens registradas processadas. ` +
            `Scan da DM ignorado para evitar bloqueio anti-spam. Use \`--scan\` se quiser forçar a varredura.`
          );

          continue;
        }

        const dm = await buscarDmDoUsuario(user, client, forcarAbrirDM);
        const resultadoBusca = await buscarMensagensDoBotNaDM(dm, client, 2000);

        totalPaginas += resultadoBusca.paginas;
        totalMensagensLidas += resultadoBusca.totalLidas;
        totalMensagensDeOutrosBots += resultadoBusca.mensagensDeOutrosBots.length;

        if (resultadoBusca.erros.length > 0) {
          erros.push(`⚠️ ${user.tag} (${user.id}) busca parcial: ${resultadoBusca.erros.slice(0, 2).join(' | ')}`);
        }

        if (resultadoBusca.mensagensDoBotAtual.length === 0) {
          totalSemMensagemDoBotAtual++;

          detalhes.push(
            `ℹ️ <@${user.id}> — 0 msgs do bot atual | lidas: \`${resultadoBusca.totalLidas}\` | páginas: \`${resultadoBusca.paginas}\` | outros bots: \`${resultadoBusca.mensagensDeOutrosBots.length}\``
          );

          continue;
        }

        let apagadasUser = 0;
        let falhasUser = 0;

        for (const msg of resultadoBusca.mensagensDoBotAtual) {
          const conteudo = cortarTexto(msg.content, 950);
          const criadoUnix = Math.floor(msg.createdTimestamp / 1000);
          const apagadoUnix = Math.floor(Date.now() / 1000);

          const deletou = await msg.delete().then(() => true).catch((err) => {
            falhasUser++;
            totalFalhas++;
            erros.push(`❌ Falha ao apagar msg \`${msg.id}\` no PV de ${user.tag} (${user.id}): ${err?.code || ''} ${err?.message || err}`);
            return false;
          });

          if (deletou) {
            apagadasUser++;
            totalApagadas++;

            await enviarLog(client, {
              embeds: [
                new EmbedBuilder()
                  .setColor('#ff0066')
                  .setTitle('🧹 Mensagem apagada no PV')
                  .addFields(
                    { name: '👤 Usuário', value: `<@${user.id}> \`(${user.id})\`\n${userLink(user.id)}` },
                    { name: '🗑️ Apagado por', value: `<@${message.author.id}> \`(${message.author.id})\`\n${userLink(message.author.id)}` },
                    { name: '🤖 Bot atual', value: `<@${client.user.id}> \`(${client.user.id})\`` },
                    { name: '📍 Local usado', value: `<#${message.channel.id}>\n${canalOrigemLink}` },
                    { name: '🕒 Criada em', value: `<t:${criadoUnix}:F>`, inline: true },
                    { name: '🧹 Apagada em', value: `<t:${apagadoUnix}:F>`, inline: true },
                    { name: '💬 Conteúdo', value: conteudo }
                  )
                  .setFooter({ text: `ID da mensagem apagada: ${msg.id}` })
                  .setTimestamp()
              ],
              allowedMentions: { parse: [] }
            });
          }

          await sleep(500);
        }

        detalhes.push(
          `✅ <@${user.id}> — apagadas: \`${apagadasUser}\` | falhas: \`${falhasUser}\` | lidas: \`${resultadoBusca.totalLidas}\` | páginas: \`${resultadoBusca.paginas}\``
        );

      } catch (err) {
        totalFalhas++;

        const erroMsg = `${err?.code || ''} ${err?.message || err}`.trim();
        const erroStack = err?.stack ? String(err.stack).slice(0, 1500) : 'Sem stack disponível.';
        const tipoErroDM = detectarErroDM(erroMsg);

        ultimoErroVisivel = `${user.tag} (${user.id}): ${erroMsg}`;

        if (tipoErroDM === 'ANTI_SPAM_QUARENTENA') {
          totalAntiSpamQuarentena++;
          detalhes.push(
            `🚫 <@${user.id}> — Discord bloqueou a abertura da DM por anti-spam/quarentena. ` +
            `Se a DM não estiver no cache do bot, não dá para buscar mensagens antigas até o Discord liberar.`
          );
        } else if (tipoErroDM === 'DM_INACESSIVEL') {
          totalDmInacessivel++;
          detalhes.push(`🔒 <@${user.id}> — DM inacessível.`);
        } else {
          detalhes.push(`❌ <@${user.id}> — ${erroMsg}`);
        }

        erros.push(
          `❌ ${user.tag} (${user.id}): ${erroMsg}\n` +
          `Tipo: ${tipoErroDM}\n` +
          `Stack: ${erroStack}`
        );
      }

      if (statusMsg && (totalProcessados % 1 === 0 || totalProcessados === membros.length)) {
        await editarStatus(
          statusMsg,
          new EmbedBuilder()
            .setColor('#ff0066')
            .setTitle('🧹 Apagamento de PV em andamento')
            .setDescription(
              `**Alvo:** ${modoEveryone ? '@everyone / todos os membros' : alvo}\n` +
              `**Executor:** <@${message.author.id}>\n` +
              `**Canal usado:** <#${message.channel.id}>\n` +
              `**Bot atual:** <@${client.user.id}> \`${client.user.id}\``
            )
            .addFields(
              { name: 'Progresso', value: `\`${totalProcessados}/${membros.length}\``, inline: true },
              { name: 'Apagadas', value: `\`${totalApagadas}\``, inline: true },
              { name: 'Falhas', value: `\`${totalFalhas}\``, inline: true },
              { name: 'Mensagens lidas', value: `\`${totalMensagensLidas}\``, inline: true },
              { name: 'Páginas lidas', value: `\`${totalPaginas}\``, inline: true },
              { name: 'Outros bots encontrados', value: `\`${totalMensagensDeOutrosBots}\``, inline: true },
              { name: 'Sem msg do bot atual', value: `\`${totalSemMensagemDoBotAtual}\``, inline: true },
              { name: 'DM inacessível', value: `\`${totalDmInacessivel}\``, inline: true },
              { name: 'Anti-spam/quarentena', value: `\`${totalAntiSpamQuarentena}\``, inline: true },
              { name: 'Usuário atual', value: `<@${user.id}> \`(${user.id})\``, inline: false },
              { name: 'Último erro', value: `\`${cortarTexto(ultimoErroVisivel, 950)}\``, inline: false }
            )
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
        `**Bot atual:** <@${client.user.id}> \`${client.user.id}\`\n` +
        `**Canal usado:** <#${message.channel.id}>`
      )
      .addFields(
        { name: 'Usuários na fila', value: `\`${membros.length}\``, inline: true },
        { name: 'Processados', value: `\`${totalProcessados}\``, inline: true },
        { name: 'Apagadas', value: `\`${totalApagadas}\``, inline: true },
        { name: 'Mensagens lidas', value: `\`${totalMensagensLidas}\``, inline: true },
        { name: 'Páginas lidas', value: `\`${totalPaginas}\``, inline: true },
        { name: 'Outros bots encontrados', value: `\`${totalMensagensDeOutrosBots}\``, inline: true },
        { name: 'Sem msg do bot atual', value: `\`${totalSemMensagemDoBotAtual}\``, inline: true },
        { name: 'DM inacessível', value: `\`${totalDmInacessivel}\``, inline: true },
        { name: 'Anti-spam/quarentena', value: `\`${totalAntiSpamQuarentena}\``, inline: true },
        { name: 'Falhas', value: `\`${totalFalhas}\``, inline: true },
        { name: 'Tempo total', value: `\`${duracao}s\``, inline: true },
        { name: 'Início', value: `<t:${inicioUnix}:F>`, inline: true },
        { name: 'Fim', value: `<t:${fimUnix}:F>`, inline: true },
        { name: 'Último erro', value: `\`${cortarTexto(ultimoErroVisivel, 950)}\``, inline: false }
      )
      .setFooter({ text: 'Essa mensagem será apagada automaticamente.' })
      .setTimestamp();

    if (statusMsg) {
      await statusMsg.edit({
        embeds: [resumoEmbed],
        allowedMentions: { parse: [] }
      }).catch(() => {});

      setTimeout(() => statusMsg.delete().catch(() => {}), 30000);
    }

    await enviarLog(client, {
      embeds: [
        EmbedBuilder.from(resumoEmbed)
          .setTitle('✅ LOG — !apagarpv finalizado')
          .addFields(
            { name: 'Link do executor', value: userLink(message.author.id) },
            { name: 'Link do canal usado', value: canalOrigemLink },
            { name: 'Link da mensagem original', value: mensagemOrigemLink },
            { name: 'Detalhes', value: detalhes.slice(0, 20).join('\n') || 'Nenhum detalhe.' },
            { name: 'Erros', value: erros.slice(0, 15).join('\n') || 'Nenhum erro.' }
          )
      ],
      allowedMentions: { parse: [] }
    });

    return true;

  } catch (err) {
    await enviarLog(client, {
      embeds: [
        new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ LOG — !apagarpv crashou')
          .setDescription(`Erro: \`${err?.code || ''} ${err?.message || err}\``)
          .setTimestamp()
      ],
      allowedMentions: { parse: [] }
    }).catch(() => {});

    await message.reply(`❌ O comando crashou: \`${err?.code || ''} ${err?.message || err}\``)
      .then(m => setTimeout(() => m.delete().catch(() => {}), 10000))
      .catch(() => {});

    return true;
  }
}

export function registerApagarPV(client) {
  // Instala apenas uma vez o registro automático
  instalarRegistroAutomaticoPV(client);

  if (client.__apagarPvListenerRegistrado) return;
  client.__apagarPvListenerRegistrado = true;

  client.on('messageCreate', async (message) => {
    await apagarPVHandleMessage(message, client);
  });
}