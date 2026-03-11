import { 
  Events, 
  EmbedBuilder, 
  ButtonBuilder, 
  ModalBuilder, 
  ActionRowBuilder, 
  TextInputBuilder, 
  TextInputStyle, 
  ButtonStyle, 
  PermissionFlagsBits 
} from 'discord.js';
import { resolveLogChannel } from './channelResolver.js';
// ✅ ADD: HUB (pra contar nas métricas humanas do GeralDash)
import { dashEmit } from "../utils/dashHub.js";
// ========================== CONFIG ==========================
const CANAL_REGISTRO_EVENTO = '1392618646630568076';

const CARGOS_REGISTRO_EVENTO = [
  '1262262852949905408', // OWNER
  '1352408327983861844', // RESP CREATOR
  '1262262852949905409', // RESP INFLU
  '1352407252216184833', // RESP LIDER
  '1388976314253312100', // COORD
  '1352429001188180039', // EQUIPE CREATOR
  '1282119104576098314', // MKT TICKET
  '1352385500614234134', // COORDENAÇÃO
];

const USUARIOS_LIBERADOS = [
  '660311795327828008', // você
];

// =================== UI BUILDERS ===================
const buildBotao = (label = '📋 Registrar Poderes em Evento') =>
  new ButtonBuilder()
    .setCustomId('abrir_registro_evento')
    .setLabel(label)
    .setStyle(ButtonStyle.Primary);

const buildEmbedBotao = () =>
  new EmbedBuilder()
    .setColor('Blue')
    .setTitle('📋 Registro de Poderes em Evento – Social Medias')
    .setDescription(
      [
        '🎯 **Registro obrigatório para uso de poderes com players.**',
        '',
        '📅 Informe a **data do uso**',
        '🎥 Diga o **evento ou contexto**',
        '⏰ Informe o **horário**',
        '👤 Quem **utilizou os poderes**',
        '',
        '✅ Apenas membros autorizados',
        '🔁 Um novo botão é gerado após cada envio',
      ].join('\n')
    )
    .setImage(
      'https://media.discordapp.net/attachments/1362477839944777889/1384245215249825832/standard_2rss.gif'
    )
    .setFooter({ text: 'SantaCreators – Sistema Oficial de Registro' });

const buildModal = () => {
  const input = (id, label, placeholder) =>
    new TextInputBuilder()
      .setCustomId(id)
      .setLabel(label)
      .setPlaceholder(placeholder)
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

  return new ModalBuilder()
    .setCustomId('modal_registro_evento')
    .setTitle('📋 Registro de Evento')
    .addComponents(
      new ActionRowBuilder().addComponents(
        input('jogador', '👤 Quem usou os poderes?', 'Nome em game')
      ),
      new ActionRowBuilder().addComponents(
        input('evento', '📌 Evento/Contexto', 'Nome do evento')
      ),
      new ActionRowBuilder().addComponents(
        input('horario', '⏰ Horário', 'Ex.: 20:30 às 21:30')
      ),
      new ActionRowBuilder().addComponents(
        input('data', '📅 Data do uso', 'DD/MM/YYYY')
      )
    );
};

// =================== PERMISSÃO ===================
async function isAutorizado(ctx) {
  try {
    const perms = ctx.memberPermissions;
    if (
      perms?.has(PermissionFlagsBits.Administrator) ||
      perms?.has(PermissionFlagsBits.ManageGuild)
    ) return true;

    if (USUARIOS_LIBERADOS.includes(ctx.user?.id)) return true;

    const member =
      ctx.member?.roles?.cache
        ? ctx.member
        : await ctx.guild?.members.fetch(ctx.user.id).catch(() => null);

    if (!member) return false;

    return CARGOS_REGISTRO_EVENTO.some(id =>
      member.roles.cache.has(id)
    );
  } catch {
    return false;
  }
}

// ✅ Verificação RÁPIDA (sem fetch) para o botão não travar
function isAutorizadoFast(interaction) {
  try {
    const perms = interaction.memberPermissions;
    if (perms?.has(PermissionFlagsBits.Administrator) || perms?.has(PermissionFlagsBits.ManageGuild)) return true;
    if (USUARIOS_LIBERADOS.includes(interaction.user.id)) return true;

    const member = interaction.member;
    // Se não tiver cache de cargos, retorna null (deixa abrir e checa no submit)
    if (!member || !member.roles || !member.roles.cache) return null;

    return CARGOS_REGISTRO_EVENTO.some(id => member.roles.cache.has(id));
  } catch {
    return null;
  }
}

// =================== LÓGICA AUXILIAR ===================
/**
 * Remove botões antigos e envia um novo para o final do chat
 */
async function resetarBotao(channel, client) {
  try {
    const msgs = await channel.messages.fetch({ limit: 20 }).catch(() => null);
    if (msgs) {
      for (const msg of msgs.values()) {
        const btn = msg.components?.[0]?.components?.[0];
        // Verifica se é msg do bot e se é o botão deste sistema
        if (msg.author.id === client.user.id && btn?.customId === 'abrir_registro_evento') {
          await msg.delete().catch(() => {});
        }
      }
    }

    await channel.send({
      embeds: [buildEmbedBotao()],
      components: [new ActionRowBuilder().addComponents(buildBotao())],
    });
  } catch (err) {
    console.error('Erro ao resetar botão de evento:', err);
  }
}

// =================== FUNÇÃO PRINCIPAL ===================
function iniciarRegistroEvento(client) {
  if (client.registroEventoSocialMediaIniciado) return;
  client.registroEventoSocialMediaIniciado = true;

  console.log('⚙️ Módulo Registro de Eventos carregado.');
  // console.log('⚙️ Módulo Registro de Eventos carregado.');

  // ✅ Função de Setup
  const setupBotaoEvento = async () => {
    const canal = await client.channels.fetch(CANAL_REGISTRO_EVENTO).catch(() => null);
    if (!canal) return console.log('❌ Canal de Registro de Evento não encontrado.');
    await resetarBotao(canal, client);
  };

  // ✅ SE O BOT JÁ ESTIVER ON, RODA AGORA.
  if (client.isReady()) {
    setupBotaoEvento();
  } else {
    client.once(Events.ClientReady, setupBotaoEvento);
  }

  // 2. COMANDO: !registroevento (Força o reenvio do botão)
  client.on(Events.MessageCreate, async message => {
    if (!message.guild || message.author.bot) return;
    if (!/^!registroevento\b/i.test(message.content)) return;

    const autorizado = await isAutorizado({
      user: message.author,
      member: message.member,
      memberPermissions: message.member?.permissions,
      guild: message.guild,
    });

    if (!autorizado) return;

    await message.delete().catch(() => {});

    const canal = await client.channels.fetch(CANAL_REGISTRO_EVENTO).catch(() => null);
    if (canal) await resetarBotao(canal, client);
  });

  // 3. INTERAÇÕES: Botão e Modal
  client.on(Events.InteractionCreate, async interaction => {
    try {
      // Botão -> Abre Modal
      if (interaction.isButton() && interaction.customId === 'abrir_registro_evento') {
        // ✅ Usa verificação rápida
        const auth = isAutorizadoFast(interaction);
        
        // Se tiver certeza que NÃO pode, bloqueia. Se for null (sem cache) ou true, deixa passar.
        if (auth === false) {
          return interaction.reply({ content: '⚠️ Você não tem permissão.', ephemeral: true }).catch(() => {});
        }
        return interaction.showModal(buildModal());
      }

            // Modal Submit -> Processa Registro
      if (interaction.isModalSubmit() && interaction.customId === "modal_registro_evento") {
        // ✅ Ganha tempo imediatamente
        await interaction.deferReply({ ephemeral: true });

        if (!(await isAutorizado(interaction))) {
          return interaction
            .editReply({ content: "⚠️ Sem permissão." })
            .catch(() => {});
        }

        const get = (id) =>
          interaction.fields.getTextInputValue(id)?.trim().slice(0, 256) || "—";

        const embed = new EmbedBuilder()
          .setTitle("📋 Registro de Poderes em Evento") // Padronizado
          .addFields(
            { name: "👤 Membro", value: get("jogador"), inline: true },
            { name: "📌 Evento", value: get("evento"), inline: true },
            { name: "⏰ Horário", value: get("horario"), inline: true },
            { name: "📅 Data", value: get("data"), inline: true },
            { name: "✍️ Registrado por", value: `<@${interaction.user.id}>` }
          )
          .setThumbnail(interaction.user.displayAvatarURL())
          .setColor("Blue")
          .setFooter({ text: `Registro por ${interaction.user.tag}` })
          .setTimestamp();

        // Responde para o usuário que clicou (ephemeral)
        await interaction.editReply({ content: "✅ Registro enviado!" });

        const canal = await client.channels.fetch(CANAL_REGISTRO_EVENTO).catch(() => null);
        if (!canal) return;

        // Envia o log no canal
        await canal.send({
          content: `<@${interaction.user.id}>`,
          embeds: [embed],
        });

        // ✅ conta nas métricas humanas do GeralDash (Social Medias / poderes em evento)
try {
  dashEmit("eventopoder:registrado", {
    userId: interaction.user.id,
    __at: Date.now(),
    source: "registro_poderes_em_evento",
    channelId: CANAL_REGISTRO_EVENTO,
  });
} catch {}



        // Limpa botões antigos e envia um novo para ficar no final
        await resetarBotao(canal, client);

        return;
      }

    } catch (err) {
      console.error('Erro na interação de Registro de Evento:', err);
    }
  });
}

export { iniciarRegistroEvento };
