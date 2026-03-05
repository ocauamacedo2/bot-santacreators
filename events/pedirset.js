// /application/events/pedirset.js
import fs from 'fs';
import path from 'path';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  PermissionFlagsBits,
} from 'discord.js';

import { getChannel } from '../utils/cacheDiscord.js';
import { onceIn } from '../utils/onceIn.js';
import { dashEmit } from '../utils/dashHub.js';
import {
  createFormsCreatorRecord,
  findFormsCreatorThreadIdByUserId,
  setFormsCreatorStatus
} from './formscreator.js';

// ---------- PEDIR SET ----------
///!pedirset

const pedidosSet = new Map();

const CANAL_BOTAO_SET_ID = '1352705879039803474';
const CANAL_LOG_REGISTRO = '1352706078621696030';
const CANAL_AVISO_EQUIPE = '1352279622162583593';
const CANAL_ADMINISTRACAO = '1262262853436440652';
const CARGO_ENTREVISTA = '1353797415488196770';
const CARGO_SET = '1352275728476930099';
const CARGO_EQUIPE_CREATOR = '1352429001188180039';
const CARGO_COORDENACAO = '1352385500614234134';

// Novos cargos para adicionar ao aprovar
const CARGO_SENIOR_CREATOR = '1352493359897378941';
const CARGO_EQUIPE_CREATOR_ADD = '1352429001188180039';

const CARGOS_PODE_ENVIAR_COMANDO = [
  '660311795327828008',
  '1262262852949905408',
  '1352408327983861844',
  '1262262852949905409',
  '1352407252216184833'
];

const CARGOS_AUTORIZADOS_APROVACAO = [
  ...CARGOS_PODE_ENVIAR_COMANDO,
  '1352385500614234134',
  '1282119104576098314',
  '1372716303122567239'
];

// ================================
// ✅ PERSISTÊNCIA (NÃO PERDE REGISTROS)
// ================================
const PEDIDOS_SET_FILE = path.join(process.cwd(), 'pedidos_set.json');

function loadPedidosSet() {
  try {
    if (!fs.existsSync(PEDIDOS_SET_FILE)) return;
    const raw = fs.readFileSync(PEDIDOS_SET_FILE, 'utf8');
    if (!raw) return;

    const data = JSON.parse(raw);
    for (const [idUnico, payload] of Object.entries(data)) {
      pedidosSet.set(idUnico, payload);
    }

    // console.log(`✅ PedidosSet carregados: ${Object.keys(data).length}`);
  } catch (e) {
    console.warn('⚠️ Erro ao carregar pedidos_set.json:', e.message);
  }
}

function savePedidosSet() {
  try {
    const obj = Object.fromEntries(pedidosSet.entries());
    fs.writeFileSync(PEDIDOS_SET_FILE, JSON.stringify(obj, null, 2), 'utf8');
  } catch (e) {
    console.warn('⚠️ Erro ao salvar pedidos_set.json:', e.message);
  }
}

// Fallback: tenta reconstruir os dados do embed do registro
function recuperarDadosDoEmbed(embed) {
  try {
    const desc = embed?.description || '';
    if (!desc) return null;

    const userIdMatch = desc.match(/<@(\d+)>/);
    const nomeMatch = desc.match(/\*\*📛 Nome In Game:\*\*\s*(.+)/);
    const passaporteMatch = desc.match(/\*\*🆔 Passaporte:\*\*\s*(.+)/);
    const alinhadoMatch = desc.match(/\*\*🎯 Alinhado por:\*\*\s*(.+)/);
    const indicacaoMatch = desc.match(/\*\*📣 Indicação:\*\*\s*(.+)/);
    const zipzapMatch = desc.match(/\*\*📞 ZipZap:\*\*\s*(.+)/);

    if (!userIdMatch) return null;

    return {
      userId: userIdMatch[1],
      nome: (nomeMatch?.[1] || '').trim() || 'N/A',
      passaporte: (passaporteMatch?.[1] || '').trim() || 'N/A',
      alinhado: (alinhadoMatch?.[1] || '').trim() || 'N/A',
      indicacao: (indicacaoMatch?.[1] || '').trim() || 'N/A',
      zipzap: (zipzapMatch?.[1] || '').trim() || 'N/A'
    };
  } catch {
    return null;
  }
}

async function safeReply(message, content) {
  try {
    return await message.reply({ content });
  } catch {
    try {
      return await message.channel.send({ content });
    } catch {}
  }
}

// Guarda o ID da mensagem do botão para preservar
let BUTTON_MESSAGE_ID = null;
// Guarda o interval pra não duplicar
let limparInterval = null;

// ================================
// ✅ STATE DO BOTÃO (pra não reenviar a cada restart)
// ================================
const PEDIRSET_MARKER = 'SC_PEDIR_SET::BUTTON_V1';
const PEDIRSET_STATE_FILE = path.join(process.cwd(), 'pedirset_state.json');

function loadPedirSetState() {
  try {
    if (!fs.existsSync(PEDIRSET_STATE_FILE)) return;
    const raw = fs.readFileSync(PEDIRSET_STATE_FILE, 'utf8');
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data?.buttonMessageId) BUTTON_MESSAGE_ID = String(data.buttonMessageId);
  } catch (e) {
    console.warn('⚠️ Erro ao carregar pedirset_state.json:', e.message);
  }
}

function savePedirSetState() {
  try {
    const data = { buttonMessageId: BUTTON_MESSAGE_ID || null, marker: PEDIRSET_MARKER, updatedAt: Date.now() };
    fs.writeFileSync(PEDIRSET_STATE_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.warn('⚠️ Erro ao salvar pedirset_state.json:', e.message);
  }
}

// Util: cria OU edita o botão (não spamma em restart) e salva o ID
async function enviarOuEditarBotaoSet(client, canal) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('abrir_modal_set')
      .setLabel('📋 Pedir Set SantaCreators')
      .setStyle(ButtonStyle.Primary)
  );

  const embed = new EmbedBuilder()
  .setTitle('📥 Pedir Set Oficial – SantaCreators')
  .setDescription(
    [
      'Clique no botão abaixo para solicitar oficialmente seu set na SantaCreators! 💼',
      '',
      'Você deve estar com sua entrevista aprovada.'
    ].join('\n')
  )
  .setImage('https://media.discordapp.net/attachments/1362477839944777889/1380979949816643654/standard_2r.gif')
  .setColor('#ff3399');


  // 1) tenta editar pela ID salva
  if (BUTTON_MESSAGE_ID) {
    const existente = await canal.messages.fetch(BUTTON_MESSAGE_ID).catch(() => null);
    if (existente) {
      await existente.edit({ embeds: [embed], components: [row] }).catch(() => {});
      return existente;
    }
  }

  // 2) se não achou pela ID, tenta achar pelo MARKER nas últimas mensagens
  const ultimas = await canal.messages.fetch({ limit: 50 }).catch(() => null);
if (ultimas) {
  const candidatas = ultimas.filter(m => {
    if (m.author?.id !== client.user.id) return false;
    if (!m.components?.length) return false;

    // tem um botão com customId = abrir_modal_set?
    return m.components.some(row =>
      row.components?.some(comp => comp.customId === 'abrir_modal_set')
    );
  });

  // pega a mais recente
  const ordenadas = [...candidatas.values()].sort(
    (a, b) => (b.createdTimestamp || 0) - (a.createdTimestamp || 0)
  );
  const escolhida = ordenadas[0];

  if (escolhida) {
    BUTTON_MESSAGE_ID = escolhida.id;
    savePedirSetState();

    // edita a escolhida
    await escolhida.edit({ embeds: [embed], components: [row] }).catch(() => {});

    // apaga duplicadas antigas
    const duplicadas = ordenadas.slice(1);
    for (const m of duplicadas) {
      await m.delete().catch(() => {});
    }

    return escolhida;
  }
}

  // 3) não existe -> cria nova
  const msg = await canal.send({ embeds: [embed], components: [row] }).catch(() => null);
  if (msg) {
    BUTTON_MESSAGE_ID = msg.id;
    savePedirSetState();
    return msg;
  }

  return null;
}

// Loop de limpeza (preserva só o botão e mensagens fixadas)
async function startLimpeza(client, canal) {
  if (limparInterval) clearInterval(limparInterval);

  limparInterval = setInterval(async () => {
    await onceIn('limpeza_set', 10 * 60_000, async () => {
      try {
        const me = canal.guild.members.me;
        if (!me?.permissionsIn(canal).has(PermissionFlagsBits.ManageMessages)) return;

        // garante que o botão existe (EDITA se existe / CRIA se sumiu)
        const botaoMsg = await enviarOuEditarBotaoSet(client, canal);
        if (botaoMsg) {
          BUTTON_MESSAGE_ID = botaoMsg.id;
          savePedirSetState();
        }

        const msgs = await canal.messages.fetch({ limit: 10 }).catch(() => null);
        if (!msgs) return;

        // mantém apenas o botão e as fixadas (não apaga msgs do bot, nem fixadas)
        const paraApagar = msgs.filter(m =>
          m.id !== BUTTON_MESSAGE_ID &&
          !m.pinned &&
          m.author.id !== client.user.id
        );

        for (const [_, m] of paraApagar) {
          await m.delete().catch(() => {});
        }
      } catch {}
    });
  }, 10_000);
}


// ================================
// ✅ READY (chamado pelo teu index)
// ================================
export async function pedirSetOnReady(client) {
  loadPedidosSet();
  loadPedirSetState();

  const canal = await getChannel(client, CANAL_BOTAO_SET_ID).catch(() => null);
  if (!canal) return console.warn('❌ Canal do botão de set não encontrado.');

  // ✅ NÃO cria novo sempre: edita se existe / cria só se necessário
  await enviarOuEditarBotaoSet(client, canal);

  await startLimpeza(client, canal);
}


// ================================
// ✅ MESSAGE (chamado pelo teu index)
// ================================
export async function pedirSetHandleMessage(message, client) {
  if (message.author.bot) return false;
  if (!message.content?.toLowerCase().startsWith('!pedirset')) return false;

  const podeUsar =
    CARGOS_PODE_ENVIAR_COMANDO.includes(message.author.id) || // (isso aqui é meio inútil pq a lista é de cargos, mas mantive igual teu código)
    message.member?.roles?.cache?.some(role => CARGOS_PODE_ENVIAR_COMANDO.includes(role.id));

  if (!podeUsar) {
    await safeReply(message, '❌ Você não tem permissão para usar esse comando.');
    return true;
  }

  const canal = await getChannel(client, CANAL_BOTAO_SET_ID).catch(() => null);
  if (!canal) {
    await safeReply(message, '❌ Canal do botão não encontrado.');
    return true;
  }

    await enviarOuEditarBotaoSet(client, canal);
  await startLimpeza(client, canal);

  await safeReply(message, '✅ Botão de Set enviado/atualizado com sucesso!');
  return true;

}

// ================================
// ✅ INTERACTION (chamado pelo teu index)
// ================================
export async function pedirSetHandleInteraction(interaction, client) {

  // BOTÃO → Abrir modal
  if (interaction.isButton() && interaction.customId === 'abrir_modal_set') {
    const modal = new ModalBuilder()
      .setCustomId('formulario_set')
      .setTitle('📋 Solicitação de Set SantaCreators')
      .addComponents([
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('nome_ingame').setLabel('Seu Nome EM GAME:').setStyle(TextInputStyle.Short).setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('id_passaporte').setLabel('Seu ID/Passaporte EM GAME:').setStyle(TextInputStyle.Short).setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('alinhado_ticket').setLabel('Quem te alinhou via ticket?').setStyle(TextInputStyle.Short)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('indicacao').setLabel('Veio por alguma indicação?').setStyle(TextInputStyle.Short)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('zipzap').setLabel('Seu número do ZipZap (do game):').setStyle(TextInputStyle.Short).setRequired(true)
        )
      ]);

    try {
      await interaction.showModal(modal);
    } catch (err) {
      console.warn("❌ Erro ao mostrar o modal de set:", err);
    }
    return true;
  }

  // MODAL → Resposta
  if (interaction.isModalSubmit() && interaction.customId === 'formulario_set') {
    await interaction.deferReply({ ephemeral: true }).catch(() => {});

    const nome       = interaction.fields.getTextInputValue('nome_ingame');
    const passaporte = interaction.fields.getTextInputValue('id_passaporte');
    const alinhado   = interaction.fields.getTextInputValue('alinhado_ticket') || 'N/A';
    const indicacao  = interaction.fields.getTextInputValue('indicacao') || 'N/A';
    const zipzap     = interaction.fields.getTextInputValue('zipzap');

    const idUnico = Date.now().toString();

    pedidosSet.set(idUnico, {
      userId: interaction.user.id,
      nome,
      passaporte,
      zipzap,
      alinhado,
      indicacao
    });

    savePedidosSet();

    const embed = new EmbedBuilder()
      .setTitle('📋 Novo Pedido de Set Recebido')
      .setThumbnail(interaction.user.displayAvatarURL())
      .setDescription([
        `**👤 Usuário:** <@${interaction.user.id}>`,
        `**📛 Nome In Game:** ${nome}`,
        `**🆔 Passaporte:** ${passaporte}`,
        `**🎯 Alinhado por:** ${alinhado}`,
        `**📣 Indicação:** ${indicacao}`,
        `**📞 ZipZap:** ${zipzap}`
      ].join('\n'))
      .setImage('https://media.discordapp.net/attachments/1362477839944777889/1380979949816643654/standard_2r.gif')
      .setColor('#00ffcc')
      .setFooter({ text: `Pedido feito por ${interaction.user.tag}` });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`aprovar_set_${idUnico}`)
        .setLabel('✅ Aprovar Set')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`reprovar_set_${idUnico}`)
        .setLabel('❌ Reprovar Set')
        .setStyle(ButtonStyle.Danger)
    );

    const canal = await client.channels.fetch(CANAL_LOG_REGISTRO).catch(() => null);
    if (canal) await canal.send({ embeds: [embed], components: [row] });

    await interaction.followUp({ content: '✅ Pedido enviado com sucesso!', ephemeral: true });
    return true;
  }

  // BOTÃO → Aprovar
  if (interaction.isButton() && interaction.customId.startsWith('aprovar_set_')) {
    await interaction.deferUpdate().catch(() => {});

    const idUnico = interaction.customId.replace('aprovar_set_', '');
    let dados = pedidosSet.get(idUnico);

    if (!dados) {
      const embedMsg = interaction.message?.embeds?.[0];
      const recuperado = recuperarDadosDoEmbed(embedMsg);
      if (recuperado) {
        dados = recuperado;
        pedidosSet.set(idUnico, dados);
        savePedidosSet();
      }
    }

    if (!dados) {
      await interaction.followUp({ content: '❌ Dados do formulário não encontrados (nem pelo embed).', ephemeral: true });
      return true;
    }

    const { userId, nome, passaporte, zipzap } = dados;

    const membro = await interaction.guild.members.fetch(userId).catch(() => null);
    if (!membro) {
      await interaction.followUp({ content: '❌ Membro não encontrado.', ephemeral: true });
      return true;
    }

    if (!CARGOS_AUTORIZADOS_APROVACAO.some(id => interaction.member.roles.cache.has(id))) {
      await interaction.followUp({ content: '❌ Você não tem permissão para aprovar sets.', ephemeral: true });
      return true;
    }

    // ✅ Adiciona cargos (SantaCreators + Sênior + Equipe)
    const rolesToAdd = [CARGO_SET, CARGO_SENIOR_CREATOR, CARGO_EQUIPE_CREATOR_ADD];
    await membro.roles.add(rolesToAdd).catch(err => console.error('Erro ao add roles no set:', err));

    await membro.roles.remove(CARGO_ENTREVISTA).catch(() => {});
    
    // ✅ Nickname atualizado para EQP.C
    await membro.setNickname(`EQP.C | ${nome} | ${passaporte}`).catch(err => console.error('Erro ao mudar nick:', err));

    // ✅ NOVO: Reativa ou cria registro no FormsCreator
    try {
      const existingThreadId = await findFormsCreatorThreadIdByUserId(userId);

      if (existingThreadId) {
        // Se já existe, apenas reativa o status
        await setFormsCreatorStatus(client, {
          threadId: existingThreadId,
          newStatus: true,
          actor: interaction.user,
        });
        console.log(`[PedirSet] FormsCreator reativado para o usuário ${userId}.`);
      } else {
        // Se não existe, cria um novo
        await createFormsCreatorRecord(client, {
          guildId: interaction.guildId,
          creatorId: interaction.user.id, // O aprovador
          targetId: userId,               // O novo membro
          targetName: nome,
          targetPassaporte: passaporte,
          area: "A Definir",              // Conforme solicitado
        });
        console.log(`[PedirSet] Novo FormsCreator criado para o usuário ${userId}.`);
      }
    } catch (e) {
      console.error("[PedirSet] Falha ao reativar/criar registro no FormsCreator:", e);
      try {
        await interaction.followUp({ content: `⚠️ Ocorreu um erro com o FormsCreator: ${e.message}`, ephemeral: true });
      } catch {}
    }

    // ✅ Emite evento para criar controle GI (pausado) e atualizar dashboard
    // (Movido para DEPOIS do FormsCreator para garantir que o link exista)
    dashEmit('pedirset:aprovado', {
      userId: userId,
      approverId: interaction.user.id,
      guildId: interaction.guildId,
      nome,
      passaporte,
      timestamp: Date.now()
    });

    const baseEmbed = interaction.message.embeds?.[0]
      ? EmbedBuilder.from(interaction.message.embeds[0])
      : new EmbedBuilder().setTitle('📋 Pedido de Set');

    const embedAtualizado = baseEmbed
      .setColor('Green')
      .setFooter({ text: `✅ Aprovado por ${interaction.user.tag}` });

    const rowAtualizada = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('set_aprovado')
        .setLabel('✅ Set Aprovado')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
    );

    try {
      await interaction.editReply({
        components: [rowAtualizada],
        embeds: [embedAtualizado]
      });
    } catch (err) {
      console.warn('⚠️ Erro ao atualizar a interação:', err.message);
      await interaction.followUp({ content: '✅ Set aprovado, mas houve erro ao atualizar a mensagem.', ephemeral: true }).catch(() => {});
    }

    await membro.send({
      embeds: [
        new EmbedBuilder()
          .setTitle('🎉 SET APROVADO COM SUCESSO! 🎉')
          .setDescription([
            'Parabéns! Seu set na **SantaCreators** foi oficialmente **aprovado** ✅',
            '',
            'Agora, **vá até o ticket onde fez sua entrevista** e diga quando poderá fazer a **contratação in game**.',
            '',
            'Se tiver dúvidas, fale com a Equipe Creator/Coordenação! 👥'
          ].join('\n'))
          .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
          .setImage('https://media.discordapp.net/attachments/1362477839944777889/1380979949816643654/standard_2r.gif')
          .setColor('#00cc99')
          .setFooter({ text: 'SantaCreators • Organização Oficial' })
      ]
    }).catch(() => {});

    const canalEquipe = await client.channels.fetch(CANAL_AVISO_EQUIPE).catch(() => null);
    if (canalEquipe) {
      await canalEquipe.send({
        content: `<@&${CARGO_EQUIPE_CREATOR}>`,
        embeds: [
          new EmbedBuilder()
            .setTitle('📢 Recrutamento Necessário')
            .setDescription([
              `🚨 O set de <@${userId}> foi **aprovado**!`,
              '',
              '👥 Alguém da **equipe** está disponível para fazer o recrutamento dela **na empresa** in game?',
              '',
              '> 🧠 **Importante lembrar:**',
              '• Explicar **muito bem as regras**, especialmente sobre **imersão**,',
              '• Falar sobre os **baús** (funções e como deve ser usado!),',
              '• Reforçar que é **obrigatório seguir a hierarquia** sempre,',
              '• Explicar sobre **doações** e que só se deve **registrar o que for doado**,',
              '• **Nunca doar** celular, rádio, colete ou qualquer coisa **que não é vendida na cidade**.'
            ].join('\n'))
            .setColor('#ff0055')
            .setFooter({ text: 'SantaCreators • Equipe Creator' })
            .setTimestamp()
        ],
        allowedMentions: { parse: ['roles', 'users'] }
      });
    }

    const canalAdm = await client.channels.fetch(CANAL_ADMINISTRACAO).catch(() => null);
    if (canalAdm) {
      await canalAdm.send({
        content: `📞 ZipZap recebido: \`${zipzap}\` de <@${userId}> <@&${CARGO_COORDENACAO}>`,
        allowedMentions: { parse: ['roles', 'users'] }
      });
    }

    pedidosSet.delete(idUnico);
    savePedidosSet();
    return true;
  }

  // BOTÃO → Reprovar
  if (interaction.isButton() && interaction.customId.startsWith('reprovar_set_')) {
    const idUnico = interaction.customId.replace('reprovar_set_', '');
    let dados = pedidosSet.get(idUnico);

    if (!dados) {
      const embedMsg = interaction.message?.embeds?.[0];
      const recuperado = recuperarDadosDoEmbed(embedMsg);
      if (recuperado) {
        dados = recuperado;
        pedidosSet.set(idUnico, dados);
        savePedidosSet();
      }
    }

    if (!dados) {
      await interaction.reply({ content: '❌ Dados do formulário não encontrados (nem pelo embed).', ephemeral: true });
      return true;
    }

    if (!CARGOS_AUTORIZADOS_APROVACAO.some(id => interaction.member.roles.cache.has(id))) {
      await interaction.reply({ content: '❌ Você não tem permissão para reprovar sets.', ephemeral: true });
      return true;
    }

    const baseEmbed = interaction.message.embeds?.[0]
      ? EmbedBuilder.from(interaction.message.embeds[0])
      : new EmbedBuilder().setTitle('📋 Pedido de Set');

    const embedAtualizado = baseEmbed
      .setColor('Red')
      .setFooter({ text: `❌ Reprovado por ${interaction.user.tag}` });

    await interaction.update({
      components: [],
      embeds: [embedAtualizado]
    }).catch(() => {});

    pedidosSet.delete(idUnico);
    savePedidosSet();
    return true;
  }

  return false;
}
