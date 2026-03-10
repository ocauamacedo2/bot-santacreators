import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType
} from "discord.js";

// Guard to prevent multiple initializations if imported multiple times
if (globalThis.__AUSENCIAS_MINI_V3__) {
    // already loaded
}
globalThis.__AUSENCIAS_MINI_V3__ = true;

// ===== CONFIG PRINCIPAL =====
const CANAIS_REGISTRO = {
  social:       '1404610825670627419',
  manager:      '1404610718514544822',
  gestor:       '1404610649987747940',
  coord:        '1404610565040635974',
  responsaveis: '1425943951201796206',
};

const AUSENCIAS_GERAIS_CHANNEL_ID = '1425945370621640704';

// cargos que PODEM abrir o modal
const CARGOS_AUTORIZADOS_AUSENCIA = [
  '1352429001188180039',
  '1352385500614234134',
  '1282119104576098314',
  '1352407252216184833',
  '1262262852949905409',
  '1352408327983861844',
  '1388976314253312100',
  '1262262852949905408',
  '660311795327828008',
];

const GIF_URL =
  'https://media.discordapp.net/attachments/1362477839944777889/1384245215249825832/standard_2rss.gif';

// ===== ESTADO EM MEMÓRIA =====
const registrosPorDia = new Map();
const mensagemBotaoIds = {};

// ===== HELPERS DE DATA =====
function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

function parseDataBr(str) {
  if (!str) return null;
  const [dd, mm, yyyy] = str.split('/');
  const d = Number(dd), m = Number(mm), y = Number(yyyy);
  if (!d || !m || !y) return null;
  const dt = new Date(y, m - 1, d, 0, 0, 0, 0);
  if (isNaN(dt.getTime())) return null;
  return dt;
}

function dateToIso(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function addDias(dt, dias) {
  const d = new Date(dt.getTime());
  d.setDate(d.getDate() + dias);
  return d;
}

function registrarAusenciaMem(userId, dataIso) {
  if (!registrosPorDia.has(dataIso)) {
    registrosPorDia.set(dataIso, new Set());
  }
  registrosPorDia.get(dataIso).add(userId);
}

function registrarAusenciaIntervalo(userId, dtInicio, dtFim) {
  const inicio = dtInicio.getTime();
  const fim    = dtFim.getTime();
  if (fim < inicio) {
    registrarAusenciaMem(userId, dateToIso(dtInicio));
    return;
  }
  let atual = new Date(dtInicio.getTime());
  while (atual.getTime() <= fim) {
    registrarAusenciaMem(userId, dateToIso(atual));
    atual = addDias(atual, 1);
  }
}

// ===== UI HELPERS =====
function criarBotaoAusencia() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('abrir_ausencia')
      .setLabel('📋 Registrar Ausência')
      .setStyle(ButtonStyle.Primary)
  );
}

function criarEmbedRegistro({ user, nome, data, hora, motivo, gifUrl, addOrigem, origem, intervaloAte }) {
  const avatar = user.displayAvatarURL({ size: 1024 });
  const emb = new EmbedBuilder()
    .setColor('#ff007f')
    .setTitle('📌 Registro de Ausência')
    .setThumbnail(avatar)
    .addFields(
      { name: '👤 Nome', value: nome || '—', inline: true },
      { name: '📅 Data', value: data || '—', inline: true },
      { name: '🕒 Hora', value: hora || '—', inline: true },
    )
    .setFooter({ text: `Enviado por ${user.tag}`, iconURL: avatar })
    .setImage(gifUrl)
    .setTimestamp();

  if (motivo) emb.addFields({ name: '📝 Motivo', value: motivo, inline: false });
  if (intervaloAte) emb.addFields({ name: '📆 Até', value: intervaloAte, inline: true });
  if (addOrigem && origem) emb.addFields({ name: '📍 Origem', value: origem, inline: false });

  return emb;
}

async function enviarBotaoFixoPorCanal(client, canalId) {
  const canal = await client.channels.fetch(canalId).catch(() => null);
  if (!canal) return;

  const mensagens = await canal.messages.fetch({ limit: 20 }).catch(() => null);
  if (mensagens) {
    for (const msg of mensagens.values()) {
      if (msg.author?.id === client.user.id && (msg.components?.length ?? 0) > 0) {
        // Check if it's our button to avoid deleting other bots/features buttons if they exist (though unlikely in this specific channel setup)
        const isMyButton = msg.components[0].components.some(c => c.customId === 'abrir_ausencia');
        if (isMyButton) {
             await msg.delete().catch(() => {});
        }
      }
    }
  }

  const embed = new EmbedBuilder()
    .setColor('#ff007f')
    .setTitle('📋 Registro de Ausência')
    .setDescription('Clique no botão abaixo para registrar sua ausência.')
    .setImage(GIF_URL);

  const novaMsg = await canal
    .send({ embeds: [embed], components: [criarBotaoAusencia()] })
    .catch(() => null);

  if (novaMsg?.id) mensagemBotaoIds[canalId] = novaMsg.id;
}

// ===== EXPORTS =====

export async function ausenciasOnReady(client) {
  console.log('✅ [AUSÊNCIAS] (somente registro) online');
  for (const canalId of Object.values(CANAIS_REGISTRO)) {
    await enviarBotaoFixoPorCanal(client, canalId);
  }
}

export async function ausenciasHandleInteraction(interaction, client) {
    try {
      // BOTÃO → abre modal
      if (interaction.isButton() && interaction.customId === 'abrir_ausencia') {
        const autorizado = interaction.member?.roles?.cache?.some(r =>
          CARGOS_AUTORIZADOS_AUSENCIA.includes(r.id)
        );

        if (!autorizado) {
          await interaction.reply({
            content: '❌ Você não tem permissão para registrar ausência.',
            ephemeral: true,
          });
          return true;
        }

        const modal = new ModalBuilder()
          .setCustomId(`modal_ausencia_${interaction.channelId}`)
          .setTitle('Registro de Ausência');

        const nome = new TextInputBuilder()
          .setCustomId('nome')
          .setLabel('Seu Nome')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const data = new TextInputBuilder()
          .setCustomId('data')
          .setLabel('Data da Ausência (início)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('DD/MM/AAAA')
          .setRequired(true);

        const ateData = new TextInputBuilder()
          .setCustomId('ate_data')
          .setLabel('Até que dia? (opcional)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('DD/MM/AAAA')
          .setRequired(false);

        const hora = new TextInputBuilder()
          .setCustomId('hora')
          .setLabel('Hora da Ausência')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('HH:MM')
          .setRequired(true);

        const motivo = new TextInputBuilder()
          .setCustomId('motivo')
          .setLabel('Motivo da Ausência')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder().addComponents(nome),
          new ActionRowBuilder().addComponents(data),
          new ActionRowBuilder().addComponents(ateData),
          new ActionRowBuilder().addComponents(hora),
          new ActionRowBuilder().addComponents(motivo),
        );

        await interaction.showModal(modal);
        return true;
      }

      // MODAL → envia no canal de origem + Ausências Gerais e recria botão
      if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_ausencia_')) {
        const canalId = interaction.customId.replace('modal_ausencia_', '');
        const canalOrigem = await client.channels.fetch(canalId).catch(() => null);

        if (!canalOrigem) {
          await interaction
            .reply({
              content:
                '⚠️ O canal de origem não foi encontrado. Vou registrar em Ausências Gerais.',
              ephemeral: true,
            })
            .catch(() => {});
        }

        const nome   = (interaction.fields.getTextInputValue('nome')     ?? '').slice(0, 128);
        const data   = (interaction.fields.getTextInputValue('data')     ?? '').slice(0, 64);
        const ate    = (interaction.fields.getTextInputValue('ate_data') ?? '').slice(0, 64);
        const hora   = (interaction.fields.getTextInputValue('hora')     ?? '').slice(0, 64);
        const motivo = (interaction.fields.getTextInputValue('motivo')   ?? '').slice(0, 1024);

        // registra em memória
        const dtInicio = parseDataBr(data);
        const dtFim    = ate ? parseDataBr(ate) : null;

        if (dtInicio) {
          if (dtFim) registrarAusenciaIntervalo(interaction.user.id, dtInicio, dtFim);
          else registrarAusenciaMem(interaction.user.id, dateToIso(dtInicio));
        }

        // Embed origem
        const embedOrigem = criarEmbedRegistro({
          user: interaction.user,
          nome,
          data,
          hora,
          motivo,
          gifUrl: GIF_URL,
          addOrigem: false,
          intervaloAte: ate || null,
        });

        // Envia no canal de origem (se existir) e reposta o botão único
        if (canalOrigem) {
          // apaga só nosso último botão (se ainda estiver lá)
          const mensagens = await canalOrigem.messages.fetch({ limit: 20 }).catch(() => null);
          if (mensagens) {
            for (const msg of mensagens.values()) {
              if (msg.id === mensagemBotaoIds[canalId]) {
                await msg.delete().catch(() => {});
              }
            }
          }

          await canalOrigem
            .send({ content: `<@${interaction.user.id}>`, embeds: [embedOrigem] })
            .catch(() => {});

          await enviarBotaoFixoPorCanal(client, canalId);
        }

        // Espelho: Ausências Gerais (com campo Origem)
        const canalGerais = await client.channels.fetch(AUSENCIAS_GERAIS_CHANNEL_ID).catch(() => null);
        if (canalGerais) {
          const origemStr = canalOrigem
            ? `${canalOrigem.toString()} • (${canalOrigem.id})`
            : 'Canal de origem indisponível';

          const embedGerais = criarEmbedRegistro({
            user: interaction.user,
            nome,
            data,
            hora,
            motivo,
            gifUrl: GIF_URL,
            addOrigem: true,
            origem: origemStr,
            intervaloAte: ate || null,
          });

          await canalGerais
            .send({ content: `<@${interaction.user.id}>`, embeds: [embedGerais] })
            .catch(() => {});
        }

        // resposta do modal (se ainda não respondeu ali em cima)
        if (!interaction.replied && !interaction.deferred) {
          await interaction
            .reply({ content: '✅ Registro de ausência enviado com sucesso!', ephemeral: true })
            .catch(() => {});
        } else {
          // se já respondeu (canalOrigem inexistente), só tenta followUp
          await interaction
            .followUp({ content: '✅ Registro de ausência enviado com sucesso!', ephemeral: true })
            .catch(() => {});
        }

        return true;
      }
    } catch (err) {
      console.error('[AUSÊNCIAS] erro na interação (somente registro):', err);
      try {
        if (!interaction.deferred && !interaction.replied) {
          await interaction.reply({
            content: '⚠️ Ocorreu um erro ao processar sua solicitação.',
            ephemeral: true,
          });
        }
      } catch {}
    }
    return false;
}

// ===== COMMAND HANDLER =====
export async function ausenciasHandleMessage(message, client) {
  if (!message.guild || message.author.bot) return false;

  if (message.content.toLowerCase() === "!ausenciasmenu") {
    const member = message.member;
    // Verifica se o ID do usuário está na lista OU se ele tem algum cargo da lista
    const isAuth = CARGOS_AUTORIZADOS_AUSENCIA.includes(message.author.id) ||
                   member?.roles?.cache?.some(r => CARGOS_AUTORIZADOS_AUSENCIA.includes(r.id));

    if (!isAuth) {
      const reply = await message.reply("🚫 Você não tem permissão para usar este comando.").catch(() => {});
      setTimeout(() => {
        message.delete().catch(() => {});
        if (reply) reply.delete().catch(() => {});
      }, 5000);
      return true;
    }

    await message.delete().catch(() => {});

    for (const canalId of Object.values(CANAIS_REGISTRO)) {
      await enviarBotaoFixoPorCanal(client, canalId);
    }

    const reply = await message.channel.send("✅ Botões de ausência verificados/recriados nos canais configurados.").catch(() => {});
    if (reply) setTimeout(() => reply.delete().catch(() => {}), 8000);

    return true;
  }

  return false;
}