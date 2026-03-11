// /application/commands/entrevistasTickets.js
import {
  ChannelType,
  PermissionsBitField,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  OverwriteType,
} from 'discord.js';
import { resolveLogChannel } from '../events/channelResolver.js';

export default function createEntrevistasTickets({ client, Transcript }) {
  ///!ENTREVISTA

  // ✅ Variáveis importantes
  const TRANSCRIPTS_CHANNEL_ID = '1358568999738409151'; // Canal onde o log de tickets será enviado
  const TRANSCRIPTS_BASE_URL = 'https://transcripts-santa.squareweb.app/transcript/';

  // (REMOVIDO) não usamos mais modal de fechamento

  const MENU_CHANNEL_ID = '1352706630869061702'; // ✅ Canal onde o menu será enviado
  let menuMessageId = null;

  // ✅ PESSOAS que SEMPRE podem (independente de cargo)
  // → aqui vai você e qualquer outro dono
  const USERS_SEMPRE_PODEM = [
    '660311795327828008', // você
    '1422203191214477406' // owner que você colocou nos comentários
  ];

  const ENTREVISTA_ALLOWED = [
    '1262262852949905408', // OWNER (global)
    '1352408327983861844', // RESP CREATOR
    '1262262852949905409', // RESP INFLU
    '1282119104576098314'  // MKTK
  ];

  // ✅ quem PODE ASSUMIR / ATENDER ticket
  // (deixei teu id AQUI também pra garantir)
  const ALLOWED_TO_OPEN = [
    '660311795327828008',  // você (força tudo)
    '1422203191214477406', // owner / você (caso seja cargo ou outra conta)
    '1352408327983861844', // resp creator
    '1262262852949905409', // resp influ
    '1352407252216184833', // resp líder
    '1414651836861907006', // responsáveis
    '1352385500614234134', // coordenação
    '1282119104576098314', // mkt ticket
    '1372716303122567239'  // tickets
  ];

  // ✅ quem PODE assumir como RESPONSÁVEL (botão 👑) e furar fila
  // (teu id aqui também)
  const ADMIN_ONLY = [
    '660311795327828008',  // você
    '1422203191214477406', // owner / você
    '1352408327983861844'  // resp creator
  ];

  // 🔎 helpers de permissão
  // AGORA eles olham:
  // 1) se o user está no USERS_SEMPRE_PODEM → já libera
  // 2) se o user está na lista (id de usuário) → libera
  // 3) se ALGUM CARGO dele está na lista → libera
  function temCargoQuePodeAbrir(member) {
    if (!member) return false;

    // 1) sempre podem
    if (USERS_SEMPRE_PODEM.includes(member.id)) return true;

    // 2) id na lista de abrir
    if (ALLOWED_TO_OPEN.includes(member.id)) return true;

    // 3) id na lista de admin
    if (ADMIN_ONLY.includes(member.id)) return true;

    // 4) algum cargo na lista
    return member.roles.cache.some(r =>
      ALLOWED_TO_OPEN.includes(r.id) ||
      ADMIN_ONLY.includes(r.id)
    );
  }

  function temCargoDeResp(member) {
    if (!member) return false;

    // 1) sempre podem
    if (USERS_SEMPRE_PODEM.includes(member.id)) return true;

    // 2) id na lista de admin
    if (ADMIN_ONLY.includes(member.id)) return true;

    // 3) algum cargo na lista de admin
    return member.roles.cache.some(r => ADMIN_ONLY.includes(r.id));
  }

  // ✅ Cargos que devem ser notificados no PV ao abrir entrevista
  const NOTIFY_ROLES = [
    '1352429001188180039', // EQUIPE CREATOR
    '1352493359897378941', // INTERAÇÃO COM BOT
    '1352385500614234134', // COORD CREATOR
    '1352408327983861844', // RESP CREATOR
    '1262262852949905409', // RESP INFLU
    '1352407252216184833', // RESP LÍDER
    '1282119104576098314'  // MKT TICKET
  ];

  // ✅ NOVO: Cargos que serão notificados APENAS para tickets de ROUPAS
  const ROUPAS_NOTIFY_ROLES = [
    '1353032994486620180', // Equipe Designer (exemplo, mantive o original)
    // 'ID_DO_CARGO_COORD_DESIGNER',
    // Adicione ou remova os IDs dos cargos que devem receber a notificação de roupas
  ];

  const CATEGORIES = {
    entrevista: '1359244725781266492',
    suporte: '1359245003523756136',
    lider: '1414687963161559180',
    ideias: '1359245055239655544',
    roupas: '1352706815594598420',
    banners: '1404568518179029142'
  };

  // ✅ IDs de formulário/cargos/approvers para set de líder
  const FORMS_CHANNEL_ID = '1428003736671883405';
  const ROLE_LIDERES_ID   = '1353858422063239310';
  const ROLE_PARCEIROS_ID = '1275540170791452765';

  // ✅ Quem pode aprovar por USUÁRIO (pessoa)
  const SET_APPROVERS = new Set([
    '1262262852949905408', // owner
    '660311795327828008'   // você
  ]);

  // ✅ Quem pode aprovar por CARGO (roles)
  const APPROVER_ROLES = new Set([
    '1352407252216184833', // resp líder
    '1392678638176043029', // equipe manager
    '1262262852949905409', // resp influ
    '1352408327983861844', // resp creator
    '1352385500614234134', // coordenação
    '1352429001188180039'  // equipe creator
  ]);

  // ✅ Mapa de solicitações pendentes (approval ↔️ dados)
  const pendingLeaderSets = new Map(); // customId -> { userId, ticketChannelId, name, cid, faccao, requestMsgId }
  function upsertPending(reqId, data) {
  pendingLeaderSets.set(reqId, data);
}

function deletePending(reqId) {
  pendingLeaderSets.delete(reqId);
}

// fallback se perder o Map (restart / crash)
function rebuildPendingFromFormsMessage(message) {
  try {
    const embed = message.embeds?.[0];
    if (!embed) return null;

    const get = (name) =>
      embed.fields?.find(f => f.name === name)?.value || null;

    // ✅ FIX: Extração de ID mais robusta (regex) para garantir que pegue o ID mesmo com lixo
    const rawUserId = get('Solicitante');
    const userId = rawUserId?.match(/\d{17,20}/)?.[0];

    const name   = get('Nome na cidade')?.replace(/[`]/g, '')?.trim();
    const cid    = get('ID')?.replace(/[`]/g, '')?.trim();
    const faccao = get('Facção')?.replace(/[`]/g, '')?.trim();

    if (!userId || !name || !cid) return null;

    return {
      userId,
      name,
      cid,
      faccao,
      requestMsgId: message.id
    };
  } catch {
    return null;
  }
}


  const MENU_CHANNEL_ID_TICKET = '1352706630869061702';

  async function verificarOuCriarMenu() {
    try {
      const canal = await client.channels.fetch(MENU_CHANNEL_ID_TICKET);
      if (!canal) return;

      const mensagens = await canal.messages.fetch({ limit: 20 });

      const menuExistente = mensagens.find(msg =>
        msg.author.id === client.user.id && msg.components.length > 0
      );

      if (!menuExistente) {
        console.log('⚠️ Nenhum menu encontrado. Criando novo...');
        await canal.send({
          embeds: [criarMenuEmbed(canal.guild)],
          components: [criarMenuSelect()]
        });
      } else {
        console.log('✅ Menu já existe no canal. Nenhuma ação necessária.');
      }
    } catch (err) {
      console.error('Erro ao verificar/criar menu:', err);
    }
  }

  const responsaveisOficiais = new Map(); // canalId => userId do responsável

  function criarMenuEmbed(guild) {
    return new EmbedBuilder()
      .setTitle('📋 | Ticket - SantaCreators')
      .setDescription(
        '➡️ Selecione um ticket das seguintes opções abaixo:\n\n' +
        '1. 📋 **Entrevistas**\n' +
        '2. 🛠 **Suporte/Outros**\n' +
        '3. 🧭 **Líder de Organização**\n' +
        '4. 🎬 **Gravações/Ideias**\n' +
        '5. 👕 **Roupas/Designer** — Para solicitar o designer da sua roupa e envio pra cidade.\n' +
        '6. 🖼 **Banners/Designer** — Para solicitar um orçamento de banner/logo para Discord etc.'
      )
      .setColor('#ff009a')
      .setThumbnail(guild.iconURL({ dynamic: true }))
      .setImage('https://media.discordapp.net/attachments/1362477839944777889/1380979949816643654/standard_2r.gif');
  }

  function criarMenuSelect() {
    return new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('selecionar_ticket')
        .setPlaceholder('Selecione uma opção...')
        .addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel('Entrevistas')
            .setValue('abrir_entrevista')
            .setDescription('Abrir um ticket para entrevista.')
            .setEmoji('📋'),
          new StringSelectMenuOptionBuilder()
            .setLabel('Suporte/Outros')
            .setValue('abrir_suporte')
            .setDescription('Solicitar suporte ou tratar de outros assuntos.')
            .setEmoji('🛠️'),
          new StringSelectMenuOptionBuilder()
            .setLabel('Líder de Organização')
            .setValue('abrir_lider')
            .setDescription('Abrir ticket se você é Líder de Organização.')
            .setEmoji('🧭'),
          new StringSelectMenuOptionBuilder()
            .setLabel('Gravações/Ideias')
            .setValue('abrir_ideias')
            .setDescription('Registrar ideias ou agendar gravações.')
            .setEmoji('🎥'),
          new StringSelectMenuOptionBuilder()
            .setLabel('Roupas/Designer')
            .setValue('abrir_roupas')
            .setDescription('Para solicitar o designer da sua roupa e envio pra cidade.')
            .setEmoji('👕'),
          new StringSelectMenuOptionBuilder()
            .setLabel('Banners/Designer')
            .setValue('abrir_banners')
            .setDescription('Solicitar orçamento de banner/logo para Discord, etc.')
            .setEmoji('🖼')
        )
    );
  }

  async function enviarOuAtualizarMenu(atualizar = false) {
    const canal = await client.channels.fetch(MENU_CHANNEL_ID);
    if (!canal) return;

    const embed = criarMenuEmbed(canal.guild);
    const menu = criarMenuSelect();

    if (atualizar && menuMessageId) {
      try {
        const msg = await canal.messages.fetch(menuMessageId);
        await msg.edit({ embeds: [embed], components: [menu] });
        return;
      } catch {}
    }

    const mensagens = await canal.messages.fetch({ limit: 100 });
    mensagens.forEach(async msg => {
      if (msg.id !== menuMessageId) await msg.delete().catch(() => {});
    });

    const novaMsg = await canal.send({ embeds: [embed], components: [menu] });
    menuMessageId = novaMsg.id;
  }

  // ✅ Função que notifica os cargos autorizados via DM conforme o tipo
  async function notificarEquipeEntrevista(guild, canal, tipo) {
    try {
      if (tipo !== 'roupas' && tipo !== 'designer') {
        const membrosParaNotificar = guild.members.cache.filter(membro =>
          NOTIFY_ROLES.some(roleId => membro.roles.cache.has(roleId))
        );

        const textos = {
          entrevista: {
            titulo: '🎙️ Um novo ticket de **entrevista** foi aberto!',
            subtitulo: 'Por favor, entre no canal, dê as boas-vindas e atenda a entrevista o quanto antes.'
          },
          suporte: {
            titulo: '🛠️ Um novo ticket de **suporte** foi aberto!',
            subtitulo: 'Verifique se é necessário dar assistência técnica ou responder alguma dúvida urgente.'
          },
          lider: {
            titulo: '🧭 Um novo ticket de **Líder de Organização** foi aberto!',
            subtitulo: 'O solicitante é um líder de organização, dê as permissões e dê as boas-vindas.'
          },
          ideias: {
            titulo: '🎬 Um novo ticket de **ideia para gravação/evento** foi aberto!',
            subtitulo: 'Veja se dá pra transformar em conteúdo pra SantaCreators!'
          }
        };

        const aviso = textos[tipo] || textos['suporte'];

        for (const membro of membrosParaNotificar.values()) {
          membro.send({
            content: `${aviso.titulo}\n\n📎 Link: ${canal.toString()} <@${membro.id}>\n\n${aviso.subtitulo}`
          }).catch(() => {});
        }
      }

      if (tipo === 'roupas') {
        // ✅ Lógica alterada para usar a nova lista
        const membrosParaNotificar = guild.members.cache.filter(membro =>
          !membro.user.bot && ROUPAS_NOTIFY_ROLES.some(roleId => membro.roles.cache.has(roleId))
        );

        for (const [_, membro] of membrosParaNotificar) {
          membro.send({
            content: `🧵 Um novo ticket de **roupas** foi aberto!\n\n📎 Link: ${canal.toString()} <@${membro.id}>\n\nSolicite os detalhes do design e acompanhe o pedido.`
          }).catch(() => {});
        }
      }

      if (tipo === 'designer') {
        const equipeBanners = guild.roles.cache.get('1404348293374541834');
        if (equipeBanners) {
          for (const [_, membro] of equipeBanners.members) {
            membro.send({
              content: `🖼 Um novo ticket de **banners/designer** foi aberto!\n\n📎 Link: ${canal.toString()} <@${membro.id}>\n\nVerifique os detalhes e responda o cliente.`
            }).catch(() => {});
          }
        }
      }
    } catch (err) {
      console.error('Erro ao notificar equipe de ticket:', err);
    }
  }

  // ✅ Util: busca GuildMember com fallback
  async function safeFetchMember(guild, userId) {
    return guild.members.fetch(userId).catch(() => guild.members.cache.get(userId));
  }

  // ✅ Util: define nickname no formato "LD | NOME | ID"
  async function setNicknameLD(member, nome, cid) {
    const nick = `LD | ${nome} | ${cid}`;
    try {
      await member.setNickname(nick);
    } catch (e) {
      console.warn('Não consegui alterar o apelido (permissões?):', e.message);
    }
  }

  // =========================================================
  // ✅ AQUI É A CONVERSÃO CERTA:
  // - o que era client.on(MessageCreate) vira onMessageCreate(message)
  // - o que era client.on(InteractionCreate) vira onInteractionCreate(interaction)
  // - o que era client.once(ready) vira onReady()
  // =========================================================

  async function onReady() {
    await verificarOuCriarMenu();
    return true;
  }

  async function onMessageCreate(message) {
    // (era o client.on(Events.MessageCreate...))
    if (message.author.bot) return false;
    if (!message.content.toLowerCase().startsWith('!entrevistar')) return false;

    const temPermissao =
      ENTREVISTA_ALLOWED.includes(message.author.id) ||
      message.member.roles.cache.some(role => ENTREVISTA_ALLOWED.includes(role.id)) ||
      USERS_SEMPRE_PODEM.includes(message.author.id); // ← agora tbm passa aqui

    if (!temPermissao) {
      await message.reply('🚫 Você não tem permissão para usar esse comando.');
      return true;
    }

    await message.delete().catch(() => {});
    await enviarOuAtualizarMenu(false);
    await message.channel.send('✅ Menu de entrevista enviado com sucesso!');
    return true;
  }

  async function onInteractionCreate(interaction) {
    // (era o client.on(Events.InteractionCreate...))

    // ===== SELECT MENU =====
    if (interaction.isStringSelectMenu() && interaction.customId === 'selecionar_ticket') {
      try {
        await interaction.deferReply({ ephemeral: true });
      } catch (err) {
        console.error('⚠️ Erro ao deferReply da interação:', err);
        return true;
      }

      enviarOuAtualizarMenu(true);

      const tipo = interaction.values[0];
      const map = {
        abrir_entrevista: { categoria: CATEGORIES.entrevista, nome: 'entrevista' },
        abrir_suporte:    { categoria: CATEGORIES.suporte,     nome: 'suporte' },
        abrir_lider:      { categoria: CATEGORIES.lider,       nome: 'lider' },
        abrir_ideias:     { categoria: CATEGORIES.ideias,      nome: 'ideias' },
        abrir_gravacoes:  { categoria: CATEGORIES.ideias,      nome: 'ideias' },
        abrir_roupas:     { categoria: CATEGORIES.roupas,      nome: 'roupas' },
        abrir_banners:    { categoria: CATEGORIES.banners,     nome: 'designer' }
      };

      if (!map[tipo]) {
        console.warn(`[Tickets] Valor do select desconhecido: ${tipo}`);
        await interaction.editReply({ content: '⚠️ Opção inválida ou desatualizada. Tenta novamente.' });
        return true;
      }

      const dados = map[tipo];

      const categoria = await interaction.guild.channels.fetch(dados.categoria).catch(() => null);
      if (!categoria) {
        await interaction.editReply({ content: '⚠️ Não achei a categoria do ticket. Fala com um admin.' });
        return true;
      }

      let canal;
      try {
        const baseOverwrites = categoria.permissionOverwrites.cache.map(ow => ({
          id: ow.id,
          allow: ow.allow.bitfield,
          deny:  ow.deny.bitfield,
          type: (ow.type === OverwriteType.Member || ow.type === 1) ? 'member' : 'role'
        }));

        // adiciona o cara que abriu
        baseOverwrites.push({
          id: interaction.user.id,
          allow: new PermissionsBitField([
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
            PermissionsBitField.Flags.AttachFiles
          ]).bitfield,
          deny: 0n,
          type: 'member'
        });

        canal = await interaction.guild.channels.create({
          name: `🎫┋${dados.nome}-${interaction.user.username}`,
          type: ChannelType.GuildText,
          parent: categoria,
          permissionOverwrites: baseOverwrites
        });

        // 🔒 guarda o tipo + quem abriu no tópico (usado no fechamento)
        await canal.setTopic(`ticket_tipo:${dados.nome};aberto_por:${interaction.user.id}`);
      } catch (e) {
        console.error('[TICKET] erro ao criar canal:', e);
        await interaction.editReply({ content: `❌ Erro ao criar o canal: ${e.message}` });
        return true;
      }

      await notificarEquipeEntrevista(interaction.guild, canal, dados.nome);

      const embedTicket = new EmbedBuilder()
        .setTitle(dados.nome.charAt(0).toUpperCase() + dados.nome.slice(1))
        .setColor('#ff009a')
        .setThumbnail(interaction.guild.iconURL())
        .addFields(
          { name: 'Aberto por:',   value: `<@${interaction.user.id}> <t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
          { name: 'Assumido por:', value: '`Ninguém`', inline: true }
        )
        .setFooter({ text: 'SantaCreators - Tickets' });

      const botoes = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('assumir_ticket').setLabel('🎫 Assumir Ticket').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('assumir_resp').setLabel('👑 Assumir Resp').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('fechar_ticket').setLabel('❌ Fechar Ticket').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('adicionar_membro').setLabel('➕ Adicionar Usuário').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('remover_membro').setLabel('➖ Remover Usuário').setStyle(ButtonStyle.Danger)
      );

      await canal.send({ embeds: [embedTicket], components: [botoes] });

      if (dados.nome === 'lider') {
        try {
          const welcome = new EmbedBuilder()
            .setColor('#00D084')
            .setTitle('🎉 Bem-vindo(a) Líder de Organização!')
            .setDescription(
              `🎉 **Bem-vindo <@${interaction.user.id}> Líderes de Organização!** 🎉\n\n` +
              `✅ Tirar dúvidas sobre **eventos**;\n` +
              `✅ Solicitar a **inclusão da sua organização** nos eventos semanais;\n` +
              `✅ Informar o **ID do jogador vencedor** da sua organização para receber **VIP** ou premiação.\n\n` +
              `Sempre que sua organização vencer um evento, basta enviar aqui os dados necessários.`
            );

          const rowRegistro = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('registrar_lider_org')
              .setLabel('✍️ Registrar Líder')
              .setStyle(ButtonStyle.Primary)
          );

          await canal.send({ embeds: [welcome], components: [rowRegistro] });
        } catch (e) {
          console.error('[TICKET] erro ao mandar welcome do líder:', e);
        }
      }

      await interaction.editReply({ content: `✅ Canal criado com sucesso: ${canal}` });
      return true;
    }


  


    // ===== BOTÕES =====
    if (interaction.isButton()) {
      const member   = interaction.member;
      const id       = interaction.customId;
      const embedMsg = interaction.message;

     if (id.startsWith('aprovar_set:') || id.startsWith('recusar_set:')) {

  // ✅ FIX PRINCIPAL — DEFER IMEDIATO
  await interaction.deferReply({ flags: 64 });

  // 🔒 trava múltiplos cliques (agora DEPOIS do defer, seguro)
  if (interaction.message.components?.length) {
    try {
      const disabledRows = interaction.message.components.map(row => {
        const r = ActionRowBuilder.from(row);
        r.components = r.components.map(c =>
          ButtonBuilder.from(c).setDisabled(true)
        );
        return r;
      });

      await interaction.message.edit({ components: disabledRows });
    } catch (e) {
      console.warn('Falha ao desativar botões:', e.message);
    }
  }

  const [action, reqId] = id.split(':');
  const approverId = interaction.user.id;

  const hasUserPass = SET_APPROVERS.has(approverId);
  const hasRolePass = interaction.member?.roles?.cache?.some(r => APPROVER_ROLES.has(r.id));

  if (!hasUserPass && !hasRolePass && !USERS_SEMPRE_PODEM.includes(approverId)) {
    await interaction.editReply({ content: '🚫 Você não tem permissão para aprovar/recusar.', flags: 64 });
    return true;
  }

  const guild = interaction.guild;

  let data = pendingLeaderSets.get(reqId);

  if (!data) {
    const rebuilt = rebuildPendingFromFormsMessage(interaction.message);
    if (rebuilt) {
      data = rebuilt;
      upsertPending(reqId, data);
    }
  }

  if (!data) {
    await interaction.editReply({
      content: '⚠️ Não consegui localizar os dados desse pedido. Peça para reenviar.', flags: 64
    });
    return true;
  }

  const { userId, ticketChannelId, name, cid } = data;




  // =========================
  // ❌ SE FOR RECUSAR
  // =========================
  if (action === 'recusar_set') {
    deletePending(reqId);
    await interaction.editReply({ content: '❌ Solicitação recusada com sucesso.', flags: 64 });
    return true;
  }

  // =========================
  // ✅ SE FOR APROVAR
  // =========================
  const membro = await safeFetchMember(guild, userId);

  if (!membro) {
    deletePending(reqId);
    await interaction.editReply({ content: '⚠️ Usuário não encontrado no servidor.', flags: 64 });
    return true;
  }

  try {
    await membro.roles.add([ROLE_LIDERES_ID, ROLE_PARCEIROS_ID]);
  } catch (e) {
    console.error('Erro ao adicionar cargos:', e);
  }

  await setNicknameLD(membro, name, cid);

  deletePending(reqId);

  await interaction.editReply({
    content: '✅ Set aprovado e aplicado com sucesso!', flags: 64
  });

  return true;
}



      // ✅ 2) A partir daqui, botões que precisam do embed
      if (!embedMsg.embeds[0]) return false;
      const embed = EmbedBuilder.from(embedMsg.embeds[0]);

      // ✅ Botão: Registrar líder (abre modal)
      if (id === 'registrar_lider_org') {
        const modal = new ModalBuilder()
          .setCustomId('modal_registro_lider')
          .setTitle('Registro de Líder de Organização')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('nome_cidade')
                .setLabel('Seu nome')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('id_cidade')
                .setLabel('Seu ID')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('faccao')
                .setLabel('Nome da sua facção')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            )
          );

        await interaction.showModal(modal).catch(console.error);
        return true;
      }

      // ✅ Botão: Adicionar usuário (abre modal) → AGORA TEM PERMISSÃO
      if (id === 'adicionar_membro') {
        if (!temCargoQuePodeAbrir(member)) {
          await interaction.reply({ content: '🚫 Você não tem permissão para adicionar alguém neste ticket.', ephemeral: true });
          return true;
        }

        const modal = new ModalBuilder()
          .setCustomId('modal_adicionar')
          .setTitle('Adicionar usuário ao ticket')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('id_usuario')
                .setLabel('ID do usuário (ou menção)')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            )
          );

        await interaction.showModal(modal).catch(console.error);
        return true;
      }

      // ✅ Botão: Remover usuário (abre modal) → AGORA TEM PERMISSÃO
      if (id === 'remover_membro') {
        if (!temCargoQuePodeAbrir(member)) {
          await interaction.reply({ content: '🚫 Você não tem permissão para remover alguém deste ticket.', ephemeral: true });
          return true;
        }

        const modal = new ModalBuilder()
          .setCustomId('modal_remover')
          .setTitle('Remover usuário do ticket')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('id_usuario')
                .setLabel('ID do usuário (ou menção)')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            )
          );

        await interaction.showModal(modal).catch(console.error);
        return true;
      }

      // ✅ Botão: Assumir ticket
      if (id === 'assumir_ticket') {
        if (!temCargoQuePodeAbrir(member)) {
          const resposta = { content: '🚫 Você não tem permissão.', ephemeral: true };
          try {
            if (!interaction.replied && !interaction.deferred) {
              await interaction.reply(resposta);
            } else {
              await interaction.followUp(resposta);
            }
          } catch (err) {
            console.error('❌ Erro ao responder (assumir_ticket):', err);
          }
          return true;
        }

        const jaAssumido = embed.data.fields.some(
          field => field.name === 'Assumido por:' && field.value !== '`Ninguém`'
        );

        // se já foi assumido e a pessoa NÃO é resp, barra
        if (jaAssumido && !temCargoDeResp(member)) {
          await interaction.reply({ content: 'Esse ticket já foi assumido por outra pessoa.', ephemeral: true });
          return true;
        }

        // atualiza embed
        embed.data.fields[1].value = `<@${member.id}> <t:${Math.floor(Date.now() / 1000)}:R>`;
        await embedMsg.edit({ embeds: [embed] });

        // se for resp, já marca oficial
        if (temCargoDeResp(member)) {
          responsaveisOficiais.set(interaction.channel.id, member.id);
        }

        const resposta = { content: '🎫 Ticket assumido com sucesso!', ephemeral: true };
        try {
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply(resposta);
          } else {
            await interaction.followUp(resposta);
          }
        } catch (err) {
          console.error('❌ Erro ao responder interação (assumir_ticket sucesso):', err);
        }
        return true;
      }

      // ✅ Botão: Assumir como Responsável (ADMIN_ONLY)
      if (id === 'assumir_resp') {
        if (!temCargoDeResp(member)) {
          const resposta = { content: '🚫 Você não tem permissão.', ephemeral: true };
          try {
            if (!interaction.replied && !interaction.deferred) {
              await interaction.reply(resposta);
            } else {
              await interaction.followUp(resposta);
            }
          } catch (err) {
            console.error('❌ Erro ao responder (assumir_resp):', err);
          }
          return true;
        }

        // mostra no embed que agora é ele
        embed.data.fields[1].value = `<@${member.id}> <t:${Math.floor(Date.now() / 1000)}:R>`;
        await embedMsg.edit({ embeds: [embed] });

        // grava que ESTE é o dono oficial
        responsaveisOficiais.set(interaction.channel.id, member.id);

        await interaction.reply({ content: '👑 Você assumiu este ticket como responsável. Só você fecha agora.', ephemeral: true });
        return true;
      }

      // ✅ Botão: Fechar ticket (sem modal — pede mensagem no chat)
      if (id === 'fechar_ticket') {
        const canal   = interaction.channel;
        const canalId = canal.id;

        const ehResp = temCargoDeResp(member);            // 👑
        const idResp = responsaveisOficiais.get(canalId); // já tem alguém marcado como resp?

        const embedOriginal    = embedMsg.embeds[0];
        const campoAssumidoPor = embedOriginal?.data?.fields?.find(f => f.name === 'Assumido por:');
        const valorAssumidoPor = campoAssumidoPor?.value || '`Ninguém`';
        const match            = valorAssumidoPor.match(/<@(\d+)>/);
        const idAssumidoComum  = match ? match[1] : null;

        // 1) precisa ter cargo que pode abrir/fechar
        if (!temCargoQuePodeAbrir(member)) {
          await interaction.reply({ content: '🚫 Você não tem permissão para fechar este ticket.', ephemeral: true });
          return true;
        }

        // 2) se for RESP...
        if (ehResp) {
          // se não tinha resp salvo, marca ele agora
          if (!idResp) {
            responsaveisOficiais.set(canalId, member.id);
          } else if (idResp !== member.id) {
            // já tinha outro resp marcado -> só ele pode
            await interaction.reply({ content: '❌ Já existe um responsável marcado pra este ticket. Só ele pode fechar.', ephemeral: true });
            return true;
          }
          // resp pode seguir mesmo que NINGUÉM tenha assumido
        } else {
          // 3) NÃO é resp → segue regra antiga

          // 3.1 precisa ter sido assumido
          if (!idAssumidoComum) {
            await interaction.reply({
              content: '❌ Esse ticket ainda **não foi assumido**. Primeiro alguém com cargo autorizado precisa clicar em **"🎫 Assumir Ticket"**.',
              ephemeral: true

            });
            return true;
          }

          // 3.2 se tem resp oficial, só ele fecha
          if (idResp && idResp !== member.id) {
            await interaction.reply({ content: '❌ Apenas o responsável (Resp) atual pode fechar este ticket.', ephemeral: true });
            return true;
          }

          // 3.3 se não tem resp, só quem assumiu fecha
          if (!idResp && idAssumidoComum !== member.id) {
            await interaction.reply({ content: '❌ Apenas quem assumiu o ticket pode fechá-lo.', ephemeral: true });
            return true;
          }
        }

        // 4) pede a conclusão (SEM TEMPO)
        await interaction.reply({
          content: '📝 Envie **abaixo**, no chat, o motivo/conclusão para encerrar o ticket.\n(Só vou fechar quando você mandar.)',
          ephemeral: true
        });

        const filtro = msg => msg.author.id === member.id && msg.channel.id === canalId;

        // collector que fica esperando ATÉ vir a mensagem
        const collector = canal.createMessageCollector({ filter: filtro });

        collector.once('collect', async (msg) => {
          const resposta = msg.content?.trim() || "";
          const ignoreValidationRoles = new Set(['1262262852949905408', '660311795327828008', '1352408327983861844']);
          const memberHasBypass = ignoreValidationRoles.has(interaction.user.id) || interaction.member.roles.cache.some(r => ignoreValidationRoles.has(r.id));

          // Valida o motivo do fechamento, a menos que o usuário tenha permissão para ignorar
          if (!memberHasBypass) {
            const wordCount = resposta.split(' ').filter(Boolean).length;
            if (resposta.length <= 5 || wordCount < 2) {
              await interaction.followUp({
                content: '❌ **Motivo de fechamento inválido!**\n\nPara fechar o ticket, o motivo precisa ter **mais de 5 caracteres** e pelo menos **2 palavras**.\n\n*Exemplo: "O problema do usuário foi resolvido com sucesso."*',
                ephemeral: true
              });
              return; // Aborta o fechamento, o usuário precisará clicar no botão e tentar de novo.
            }
          }

          await canal.send('✅ Conclusão recebida! Fechando o ticket...');
          // Se a pessoa com bypass não colocar motivo, um texto padrão é usado.
          await finalizarTicketComConclusao(interaction, resposta || "Fechado sem motivo (permissão especial).");
          collector.stop('concluido');
        });

        return true;
      }
    }
    
    // ===== MODAIS =====
    // ================================
// MODAL — REGISTRO DE LÍDER
// ================================
if (interaction.isModalSubmit() && interaction.customId === 'modal_registro_lider') {

  // 🔒 DEFER IMEDIATO (OBRIGATÓRIO)
  await interaction.deferReply({ ephemeral: true });

  try {
    // 📥 CAMPOS DO MODAL
    const nome = interaction.fields.getTextInputValue('nome_cidade').trim();
    const cid  = interaction.fields.getTextInputValue('id_cidade').trim();
    const fac  = interaction.fields.getTextInputValue('faccao').trim();

    if (!nome || !cid || !fac) {
      await interaction.editReply({
        content: '⚠️ Preencha todos os campos corretamente.'
      });
      return true;
    }

    // 📡 BUSCA CANAL DE FORMS
    const formsChannel = await interaction.guild.channels
      .fetch(FORMS_CHANNEL_ID)
      .catch(() => null);

    if (!formsChannel || !formsChannel.isTextBased()) {
      await interaction.editReply({
        content: '❌ Canal de formulários inválido ou sem permissão.'
      });
      return true;
    }

    // 🆔 ID ÚNICO DO PEDIDO
    const reqId = `set_${interaction.user.id}_${Date.now()}`;

    // 📄 EMBED
    const embed = new EmbedBuilder()
      .setColor('#ff009a')
      .setTitle('📨 Solicitação de Set — Líder de Organização')
      .addFields(
        { name: 'Solicitante',    value: `<@${interaction.user.id}>`, inline: true },
        { name: 'Nome na cidade', value: `\`${nome}\``,                inline: true },
        { name: 'ID',             value: `\`${cid}\``,                 inline: true },
        { name: 'Facção',         value: `\`${fac}\``,                 inline: true },
        { name: 'Ticket',         value: `${interaction.channel}`,     inline: false }
      )
      .setTimestamp();

    // 🔘 BOTÕES
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`aprovar_set:${reqId}`)
        .setLabel('✅ Aprovar Set')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`recusar_set:${reqId}`)
        .setLabel('❌ Recusar')
        .setStyle(ButtonStyle.Danger)
    );

    // 📤 ENVIO PARA FORMS
    const msg = await formsChannel.send({
      embeds: [embed],
      components: [row]
    });

    // 💾 SALVA PENDÊNCIA
    upsertPending(reqId, {
      userId: interaction.user.id,
      ticketChannelId: interaction.channel.id,
      name: nome,
      cid,
      faccao: fac,
      requestMsgId: msg.id,
      createdAt: Date.now()
    });

    // ✅ RESPOSTA FINAL
    await interaction.editReply({
      content: '✅ Seu pedido foi enviado para aprovação. Aguarde!'
    });

    return true;

  } catch (err) {
    console.error('[MODAL REGISTRO LÍDER] ERRO:', err);

    // ⚠️ GARANTE RESPOSTA
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({
        content: '❌ Erro interno ao processar seu pedido.'
      });
    }

    return true;
  }
}



    if (interaction.isModalSubmit() && interaction.customId === 'modal_adicionar') {
      const raw = interaction.fields.getTextInputValue('id_usuario')?.trim();
      const id = raw.replace(/[<@!>]/g, '');
      const channel = interaction.channel;

      try {
        const membro = await interaction.guild.members.fetch(id).catch(() => null);
        if (!membro) {
          await interaction.reply({ content: '⚠️ ID inválido ou usuário não está no servidor.', flags: 64 });
          return true;
        }

        await channel.permissionOverwrites.edit(id, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
          AttachFiles: true
        });

        await interaction.reply({ content: `<@${id}> adicionado com sucesso ao ticket.`, flags: 64 });
      } catch (e) {
        await interaction.reply({ content: `Erro ao adicionar: ${e.message}`, flags: 64 });
      }
      return true;
    }

    if (interaction.isModalSubmit() && interaction.customId === 'modal_remover') {
      const raw = interaction.fields.getTextInputValue('id_usuario')?.trim();
      const id = raw.replace(/[<@!>]/g, '');
      const channel = interaction.channel;

      try {
        const overwrite = channel.permissionOverwrites.cache.get(id);
        if (!overwrite) {
          await interaction.reply({ content: 'ℹ️ Esse usuário não tem permissão específica neste canal.', flags: 64 });
          return true;
        }

        await channel.permissionOverwrites.delete(id);
        await interaction.reply({ content: `<@${id}> removido com sucesso do ticket.`, flags: 64 });
      } catch (e) {
        await interaction.reply({ content: `Erro ao remover: ${e.message}`, flags: 64 });
      }
      return true;
    }

    // nada tratado
    return false;
  }

    // ✅ função que realmente fecha o ticket e manda tudo pros lugares certos
  // 🔧 FIX: evita travar no fechamento (timeout em promises “perigosas” + delete garantido)
  function withTimeout(promise, ms, label = "operação") {
    let t;
    const timeoutPromise = new Promise((_, reject) => {
      t = setTimeout(() => reject(new Error(`TIMEOUT ${label} (${ms}ms)`)), ms);
    });

    return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(t));
  }

  async function safeDelay(ms) {
    return new Promise(res => setTimeout(res, ms));
  }

  async function safeDeleteTicketChannel(canal, canalId) {
    // tenta 2x antes de desistir
    try {
      await canal.delete("Ticket finalizado (auto-close)");
      return true;
    } catch (e1) {
      console.error("[TICKET] Falha ao deletar canal (tentativa 1):", e1?.message || e1);
      await safeDelay(1500);
      try {
        await canal.delete("Ticket finalizado (auto-close retry)");
        return true;
      } catch (e2) {
        console.error("[TICKET] Falha ao deletar canal (tentativa 2):", e2?.message || e2);
        return false;
      }
    } finally {
      // limpa responsável de qualquer forma
      responsaveisOficiais.delete(canalId);
    }
  }

  async function finalizarTicketComConclusao(interaction, conclusaoFinal) {
    // garante que não dá erro de "já respondeu"
    try {
      const msg = { content: "📄 Fechando ticket e gerando transcript...", ephemeral: true };
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply(msg);
      } else {
        await interaction.followUp(msg);
      }
    } catch {}

    const canal   = interaction.channel;
    const canalId = canal.id;
    const guild   = interaction.guild;
    const closer  = interaction.member;

    // ✅ IMPORTANTE: se algo travar, a gente ainda vai deletar o canal
    let deleteAgendado = false;
    const agendarDeleteGarantido = async () => {
      if (deleteAgendado) return;
      deleteAgendado = true;

      // dá 5s pro log/transcript tentar rodar e depois deleta
      setTimeout(async () => {
        const ok = await safeDeleteTicketChannel(canal, canalId);
        if (!ok) {
          // se falhar, tenta avisar no canal (se ainda existir)
          try {
            await canal.send("⚠️ Não consegui deletar o canal automaticamente (permissão do bot). Um admin precisa apagar manualmente.");
          } catch {}
        }
      }, 5000);
    };

    // ⚙️ pega TODAS as mensagens em ordem crescente (só UMA vez aqui)
    // 🔧 FIX: se esse fetch ficar pesado/travar por rate, colocamos timeout por “lote”
    const sorted = await (async function fetchTodasAsMensagens(channel) {
      let mensagens = [];
      let ultimaId;

      while (true) {
        const options = { limit: 100 };
        if (ultimaId) options.before = ultimaId;

        // ⏱️ timeout por chamada ao Discord
        const lote = await withTimeout(
          channel.messages.fetch(options),
          20_000,
          "channel.messages.fetch"
        ).catch(err => {
          console.error("[TICKET] fetch mensagens falhou/timeout:", err?.message || err);
          return null;
        });

        if (!lote || lote.size === 0) break;

        mensagens.push(...lote.values());
        ultimaId = lote.last().id;

        // pequena pausa pra aliviar rate limit
        await safeDelay(250);
      }

      return mensagens.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    })(canal);

    // 🧵 tópico do canal é a fonte preferida (traz tipo e quem abriu se já estiver gravado)
    const topic = canal.topic || "";
    let tipoTicket = "SEM TIPO";
    let idAberto = null;

    const matchTipo = topic.match(/ticket_tipo:([a-zA-Z0-9_-]+)/i);
    if (matchTipo && matchTipo[1]) {
      tipoTicket = matchTipo[1].toUpperCase();
    } else {
      const tipoTicketBruto = canal.name.split("-")[0].replace("🎫┋", "");
      tipoTicket = tipoTicketBruto ? tipoTicketBruto.toUpperCase() : "SEM TIPO";
    }

    // tenta pegar quem abriu do tópico (novo formato)
    const matchAbertoTopic = topic.match(/aberto_por:(\d{5,})/i);
    if (matchAbertoTopic) idAberto = matchAbertoTopic[1];

    // 1º embed do bot (retrocompat) — também serve pra pegar “Assumido por”
    const firstBotEmbedMsg = sorted.find(m => m.author?.bot && m.embeds?.length > 0) || null;
    const embedOriginal = firstBotEmbedMsg?.embeds?.[0] || null;

    // se o tópico não tiver o ID de quem abriu, tenta extrair do embed inicial (formato antigo)
    if (!idAberto && embedOriginal) {
      const campoAberto = embedOriginal.data?.fields?.find(f => f.name === "Aberto por:")?.value || "";
      const matchAberto = campoAberto.match(/<@(\d+)>/);
      idAberto = matchAberto ? matchAberto[1] : null;
    }

    const userAberto = idAberto
      ? await withTimeout(guild.members.fetch(idAberto), 12_000, "guild.members.fetch(aberto)")
          .catch(() => null)
      : null;

    // “Assumido por” vem do embed inicial (se existir)
    const campoAssumido = embedOriginal?.data?.fields?.find(f => f.name === "Assumido por:")?.value || "`Ninguém`";
    const matchAssumido = campoAssumido.match(/<@(\d+)>/);
    const idAssumido    = matchAssumido ? matchAssumido[1] : null;

    // ✅ =======================
    // ✅ ATENDENTE = quem mais interagiu no chat (de verdade)
    // ✅ FECHADOR = quem clicou fechar (de verdade)
    // ✅ =======================

    const CLOSED_BY_ID = closer?.id || interaction.user?.id;

    async function isAtendenteValido(userId) {
      if (!userId) return false;

      if (client.user?.id && userId === client.user.id) return false;
      if (USERS_SEMPRE_PODEM.includes(userId)) return true;

      const m = await safeFetchMember(guild, userId);
      if (!m) return false;

      if (temCargoDeResp(m)) return true;
      if (temCargoQuePodeAbrir(m)) return true;

      return false;
    }

    const contagemAtendentes = new Map(); // userId -> { count, firstTs }

    for (const msg of sorted) {
      if (!msg || msg.author?.bot) continue;

      const uid = msg.author?.id;
      if (!uid) continue;

      if (idAberto && uid === idAberto) continue;
      if (!(await isAtendenteValido(uid))) continue;

      const atual = contagemAtendentes.get(uid);
      if (!atual) {
        contagemAtendentes.set(uid, { count: 1, firstTs: msg.createdTimestamp });
      } else {
        atual.count += 1;
      }
    }

    let atendenteId = null;
    for (const [uid, info] of contagemAtendentes.entries()) {
      if (!atendenteId) {
        atendenteId = uid;
        continue;
      }
      const best = contagemAtendentes.get(atendenteId);
      if (!best) {
        atendenteId = uid;
        continue;
      }

      if (info.count > best.count) atendenteId = uid;
      else if (info.count === best.count && info.firstTs < best.firstTs) atendenteId = uid;
    }

    const ATENDENTE_ID_FINAL = atendenteId || idAssumido || CLOSED_BY_ID;

    const horarioAbertura   = sorted.at(0)?.createdAt || new Date();
    const horarioFechamento = new Date();

    const IGNORE_CUSTOM_IDS = new Set(["assumir_ticket", "assumir_resp", "fechar_ticket", "adicionar_membro", "remover_membro"]);
    const IGNORE_LABELS     = new Set(["Assumir Ticket", "Assumir Resp", "Fechar Ticket", "Adicionar Usuário", "Remover Usuário"]);

    function isTicketMenuMessage(msg) {
      const hasIgnoredButtons = (msg.components?.some(row =>
        row.components?.some(c =>
          (c.customId && IGNORE_CUSTOM_IDS.has(c.customId)) ||
          (c.label && IGNORE_LABELS.has(c.label))
        )
      )) || false;
      const isBot = msg.author?.bot === true;
      return isBot && hasIgnoredButtons;
    }

    // 1. Helpers (movidos para fora do loop para eficiência)
    const escapeHtml = (unsafe) => {
      if (typeof unsafe !== 'string') return '';
      return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    };

    const getMemberName = (id) => guild?.members.cache.get(id)?.displayName || "UsuárioDesconhecido";
    const getRoleName   = (id) => guild?.roles.cache.get(id)?.name || "cargo-desconhecido";
    const getRoleColor  = (id) => guild?.roles.cache.get(id)?.hexColor || '#bbbbbb';
    const getChanName   = (id) => {
      const c = guild?.channels.cache.get(id);
      return c ? `#${c.name}` : `#${id}`;
    };

    // 2. Função de renderização unificada para todo o conteúdo
    const toHtml = (str) => {
      if (!str) return '';
      // Primeiro, escapa todo o HTML para segurança.
      let s = escapeHtml(String(str))
           // Em seguida, converte o markdown do Discord (que agora está escapado) para HTML.
           .replace(/&lt;@!?(\d+)&gt;/g, (_, id) => `<span class="mention">@${escapeHtml(getMemberName(id))}</span>`)
           .replace(/&lt;@&amp;(\d+)&gt;/g, (_, id) => `<span class="mention" style="color: ${getRoleColor(id)}">@${escapeHtml(getRoleName(id))}</span>`)
           .replace(/&lt;#(\d+)&gt;/g, (_, id) => `<span class="mention">#${escapeHtml(getChanName(id).replace('#',''))}</span>`)
           .replace(/&lt;t:(\d+)(?::[a-zA-Z])?&gt;/g, (_, ts) => `<span class="timestamp">${new Date(Number(ts)*1000).toLocaleString('pt-BR')}</span>`)
           .replace(/&lt;(a?):([a-zA-Z0-9_]+):(\d+)&gt;/g, (match, animated, name, id) => {
              const ext = animated ? 'gif' : 'png';
              return `<img class="emoji" src="https://cdn.discordapp.com/emojis/${id}.${ext}" alt=":${name}:" title=":${name}:">`;
           })
           // Formatação de texto como negrito, itálico, etc.
           // É seguro fazer isso agora, pois o conteúdo já foi escapado.
           .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
           .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
           .replace(/__(.*?)__/g, '<u>$1</u>')
           .replace(/\*(.*?)\*/g, '<em>$1</em>')
           .replace(/`(.*?)`/g, '<code>$1</code>')
           // Finalmente, converte quebras de linha.
           .replace(/\n/g, '<br>');
      return s;
    };

    // O filtro `isTicketMenuMessage` foi removido para que a mensagem inicial do ticket
    // (com o embed e os botões de controle) seja incluída no transcript, criando um "espelho" mais fiel.
    const mensagensTranscript = await Promise.all(
      sorted
        .map(async msg => {
          // 3. Construção do conteúdo da mensagem
          let conteudo = '';

          if (msg.content) {
            conteudo += toHtml(msg.content);
          }

          // Stickers (Figurinhas)
          if (msg.stickers?.size > 0) {
            const sticker = msg.stickers.first();
            conteudo += `<br><img class="sticker-image" src="${sticker.url}" alt="${escapeHtml(sticker.name)}" title="${escapeHtml(sticker.name)}" loading="lazy" referrerpolicy="no-referrer">`;
          }

          // Embeds
          if (msg.embeds?.length > 0) {
            let temp = "";
            for (const embed of msg.embeds) {
                const color = embed.hexColor || '#2f3136';
                temp += `<div class="embed" style="border-left-color: ${color};"><div class="embed-body">`;
                temp += `<div class="embed-content">`; // Início do conteúdo principal
                if (embed.author) {
                    temp += `<div class="embed-author">`;
                    if (embed.author.iconURL) temp += `<img src="${embed.author.iconURL}" class="embed-author-icon" loading="lazy" referrerpolicy="no-referrer">`;
                    temp += `<span>${toHtml(embed.author.name)}</span>`;
                    temp += `</div>`;
                }
                if (embed.title) {
                    temp += `<div class="embed-title">${embed.url ? `<a href="${embed.url}" target="_blank">${toHtml(embed.title)}</a>` : toHtml(embed.title)}</div>`;
                }
                if (embed.description) {
                    temp += `<div class="embed-description">${toHtml(embed.description)}</div>`;
                }
                if (embed.fields && embed.fields.length > 0) {
                    temp += `<div class="embed-fields">`;
                    embed.fields.forEach(field => {
                        temp += `<div class="embed-field ${field.inline ? 'inline' : ''}">`;
                        temp += `<div class="embed-field-name">${toHtml(field.name)}</div>`;
                        temp += `<div class="embed-field-value">${toHtml(field.value)}</div>`;
                        temp += `</div>`;
                    });
                    temp += `</div>`;
                }
                temp += `</div>`; // Fim do conteúdo principal
                if (embed.thumbnail?.url) {
                    temp += `<img src="${embed.thumbnail.url}" class="embed-thumbnail" loading="lazy" referrerpolicy="no-referrer">`;
                }
                temp += `</div>`; // Fim do embed-body
                // ✅ FIX: Trata vídeos dentro de embeds (para GIFs do Tenor) e também imagens.
                if (embed.video?.url) {
                    temp += `<div class="embed-image-container"><video src="${embed.video.url}" class="embed-image" autoplay loop muted playsinline controls></video></div>`;
                } else if (embed.image?.url) {
                    temp += `<div class="embed-image-container"><img src="${embed.image.url}" class="embed-image" loading="lazy" referrerpolicy="no-referrer"></div>`;
                }
                if (embed.footer) {
                    temp += `<div class="embed-footer">`;
                    if (embed.footer.iconURL) temp += `<img src="${embed.footer.iconURL}" class="embed-footer-icon" loading="lazy" referrerpolicy="no-referrer">`;
                    let footerText = toHtml(embed.footer.text);
                    if (embed.timestamp) footerText += ` • <span class="timestamp">${new Date(embed.timestamp).toLocaleString('pt-BR')}</span>`;
                    temp += `<span>${footerText}</span></div>`;
                }
                temp += `</div>`; // Fim do embed
            }
            if (temp.trim()) conteudo += temp;
          }

          // Components (Botões e Menus)
          if (msg.components?.length > 0) {
            let compHtml = '<div class="components-container" style="margin-top: 8px; display: flex; flex-direction: column; gap: 8px;">';
            for (const row of msg.components) {
              compHtml += '<div class="component-row" style="display: flex; flex-wrap: wrap; gap: 8px;">';
              for (const component of row.components) {
                // Button (Type 2)
                if (component.type === 2) {
                  let styleClass = 'btn-primary';
                  // 1=Primary(Blurple), 2=Secondary(Grey), 3=Success(Green), 4=Danger(Red), 5=Link(Grey/Url)
                  if (component.style === 2) styleClass = 'btn-secondary';
                  if (component.style === 3) styleClass = 'btn-success';
                  if (component.style === 4) styleClass = 'btn-danger';
                  if (component.style === 5) styleClass = 'btn-link';

                  const label = component.label || '';
                  let emojiHtml = '';
                  if (component.emoji) {
                    if (component.emoji.id) {
                      emojiHtml = `<img src="https://cdn.discordapp.com/emojis/${component.emoji.id}.png" style="width: 18px; height: 18px; vertical-align: text-bottom; margin-right: 4px;">`;
                    } else if (component.emoji.name) {
                      emojiHtml = `<span style="margin-right: 4px;">${component.emoji.name}</span>`;
                    }
                  }

                  const classes = `discord-btn ${styleClass}`;
                  if (component.style === 5 && component.url) {
                    compHtml += `<a href="${component.url}" target="_blank" class="${classes}">${emojiHtml}${label}</a>`;
                  } else {
                    compHtml += `<button class="${classes}" disabled>${emojiHtml}${label}</button>`;
                  }
                }
                // Select Menu (Type 3, 5, 6, 7, 8)
                else if ([3, 5, 6, 7, 8].includes(component.type)) {
                  const placeholder = component.placeholder || 'Selecione uma opção...';
                  compHtml += `<div class="discord-select">${placeholder}</div>`;
                }
              }
              compHtml += '</div>';
            }
            compHtml += '</div>';
            conteudo += compHtml;
            }

          // Anexos
          if (msg.attachments?.size > 0) {
            const attachments = [...msg.attachments.values()];

            // 1. Detectar Vídeos (PRIORIDADE MÁXIMA)
            const videoAttachments = attachments.filter(att => {
              const cleanUrl = (att.url || "").split("?")[0];
              const isVideoExt = /\.(mp4|webm|mov|mkv)$/i.test(cleanUrl);
              const isVideoType = att.contentType && att.contentType.startsWith("video/");
              return isVideoExt || isVideoType;
            });

            // 2. Detectar Imagens (Exclui o que já é vídeo)
            const imageAttachments = attachments.filter(att => {
              if (videoAttachments.includes(att)) return false;
              const cleanUrl = (att.url || "").split("?")[0];
              const isImageExt = /\.(jpe?g|png|gif|webp|bmp|avif)$/i.test(cleanUrl);
              const isImageType = att.contentType && att.contentType.startsWith("image/");
              // Videos tem width/height, então só checamos dimensão se não caiu no filtro de video acima
              const hasDims = (typeof att.height === "number" || typeof att.width === "number");
              return isImageType || isImageExt || hasDims;
            });

            if (imageAttachments.length > 0) {
              conteudo += `
                <div style="margin-top: 8px; display: flex; gap: 12px; flex-wrap: wrap;">
                  ${imageAttachments.map(att => {
                    const raw = att.url || att.proxyURL || "";
const src = String(raw).trim(); // mantém query
                    const name = (att.name || "Imagem enviada").replace(/"/g, "");
                    return `
                      <img
                        src="${src}" alt="${name}" loading="lazy" referrerpolicy="no-referrer" style="max-width: 400px; height: auto; border-radius: 8px; display: block;">
                    `;
                  }).join("")}
                </div>
              `;
            }

            if (videoAttachments.length > 0) {
              conteudo += `
                <div style="margin-top: 8px; display: flex; gap: 12px; flex-wrap: wrap;">
                  ${videoAttachments.map(att => {
                    const src = String(att.url || att.proxyURL || "").trim();
                    return `
                      <video controls src="${src}" style="max-width: 100%; width: 400px; border-radius: 8px; background: #000;"></video>
                    `;
                  }).join("")}
                </div>
              `;
            }

            const otherAttachments = attachments.filter(att => !imageAttachments.includes(att) && !videoAttachments.includes(att));
            if (otherAttachments.length > 0) {
              conteudo += `
                <div style="margin-top: 6px;">
                  ${otherAttachments.map(att => `
                    <a href="${att.url}" target="_blank" style="color: #61dafb; text-decoration: none;">
                      📎 Anexo: ${att.name}
                    </a>
                  `).join("<br>")}
                </div>
              `;
            }
          }

          if (!conteudo || !conteudo.trim()) {
  conteudo = '<span class="vazio">[Mensagem sem conteúdo]</span>';
        }

          return {
            autor:  msg.member?.displayName || msg.author?.username || "Desconhecido",
            idAutor: msg.author?.id || "0",
            conteudo,
            horario: msg.createdAt,
            // ✅ FIX: Usa dynamic:true para avatares animados (GIFs) e estáticos
            avatar: msg.author?.displayAvatarURL({ dynamic: true, size: 64 }) || ""
        };
        })
    );

    // ✅ cria transcript (NUNCA pode travar o fechamento)
    if (mensagensTranscript.length > 0) {
      const payload = {
        canalId: canalId,
        abertoPor: userAberto?.displayName || (idAberto ? `ID: ${idAberto}` : 'Desconhecido'),
        assumidoPor: (() => {
          const finalId = idAssumido || ATENDENTE_ID_FINAL;
          if (!finalId) return 'Ninguém';
          const m = guild.members.cache.get(finalId);
          // Retorna o nome de exibição se encontrar o membro, senão um fallback com o ID.
          return m ? m.displayName : `ID: ${finalId}`;
        })(),
        mensagens: mensagensTranscript
      };

      try {
        await withTimeout(Transcript.create(payload), 15_000, "Transcript.create");
      } catch (e) {
        console.error("[TICKET] Transcript.create falhou/timeout:", e?.message || e);
      }
    }

    const embedLog = new EmbedBuilder()
      .setTitle("📁 LOGS DE TICKETS")
      .setColor("#ff009a")
      .addFields(
        { name: "📝 TIPO DE TICKET", value: `\`${tipoTicket}\``, inline: false },
        { name: "📨 Ticket aberto por:",  value: idAberto ? `<@${idAberto}>` : "Desconhecido", inline: true },
        { name: "✅ Ticket fechado por:", value: `<@${CLOSED_BY_ID}>`, inline: true },
        { name: "🎨 Creator que atendeu:", value: `<@${ATENDENTE_ID_FINAL}>`, inline: true },
        { name: "🆔 Canal do ticket:",    value: `\`${canalId}\``, inline: false },
        { name: "🕒 Abertura:",           value: `<t:${Math.floor(horarioAbertura.getTime() / 1000)}:f>`, inline: true },
        { name: "🕓 Fechamento:",         value: `<t:${Math.floor(horarioFechamento.getTime() / 1000)}:f>`, inline: true },
        {
          name: "📝 Qual foi o desenrolar/motivo? Foi resolvido?",
          value: conclusaoFinal && conclusaoFinal.length > 0 ? conclusaoFinal : "Sem considerações."
        }
      )
      .setFooter({ text: "SantaCreators", iconURL: guild.iconURL() });

    const rowLog = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel("📂 Abrir Transcript")
        .setURL(`${TRANSCRIPTS_BASE_URL}${canalId}`)
    );

    // ✅ manda log (NUNCA pode travar o fechamento)
    try {
      const logChannel = await resolveLogChannel(client, TRANSCRIPTS_CHANNEL_ID);

      if (logChannel) {
        await withTimeout(logChannel.send({ embeds: [embedLog], components: [rowLog] }), 12_000, "logChannel.send");
      }
    } catch (e) {
      console.error("[TICKET] Falha ao enviar embed de log/timeout:", e?.message || e);
    }

    // ✅ DM pra quem abriu (NUNCA pode travar o fechamento)
    let dmEnviada = false;
    if (userAberto) {
      const dmEmbed = new EmbedBuilder()
        .setTitle("✅ Seu atendimento foi finalizado!")
        .setColor("#00d084")
        .setDescription("Obrigado por usar o suporte da **SantaCreators** 💗")
        .addFields(
          { name: "📄 Tipo de ticket", value: `\`${tipoTicket}\``, inline: true },
          { name: "📨 Aberto por", value: `<@${idAberto}>`, inline: true },
          { name: "🎨 Creator que atendeu", value: `<@${ATENDENTE_ID_FINAL}>`, inline: true },
          {
            name: "📝 Qual foi o desenrolar/motivo? Foi resolvido?",
            value: conclusaoFinal && conclusaoFinal.length > 0
              ? conclusaoFinal
              : "O creator não escreveu a conclusão."
          },
          { name: "🆔 ID do canal", value: `\`${canalId}\``, inline: false }
        )
        .setFooter({ text: "SantaCreators - Tickets", iconURL: guild.iconURL() });

      const dmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel("📂 Ver transcript do atendimento")
          .setURL(`${TRANSCRIPTS_BASE_URL}${canalId}`)
      );

      try {
        await withTimeout(userAberto.send({ embeds: [dmEmbed], components: [dmRow] }), 12_000, "DM userAberto.send");
        dmEnviada = true;
      } catch {
        dmEnviada = false;
      }
    }

    if (!dmEnviada && idAberto) {
      try {
        await withTimeout(
          canal.send({ content: `📩 <@${idAberto}> seu atendimento foi finalizado. Transcript: ${TRANSCRIPTS_BASE_URL}${canalId}` }),
          10_000,
          "canal.send(fallback DM)"
        );
      } catch {}
    }

    // ✅ AQUI: agenda delete garantido (independente do que aconteceu)
    await agendarDeleteGarantido();
  }



  return { onReady, onMessageCreate, onInteractionCreate };
}
