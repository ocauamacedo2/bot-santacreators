import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  AttachmentBuilder
} from "discord.js";

import sharp from "sharp";

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
const AUSENCIAS_DASHBOARD_CHANNEL_ID = '1520197927614677143';

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

// ===== DASHBOARD MENSAL DE AUSÊNCIAS =====
function escaparSvg(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function nomeMesPtBr(mesIndex) {
  const meses = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];
  return meses[mesIndex] || 'Mês';
}

function nomeSemanaMes(dia) {
  if (dia <= 7) return 'Primeira semana do mês';
  if (dia <= 14) return 'Segunda semana do mês';
  if (dia <= 21) return 'Terceira semana do mês';
  if (dia <= 28) return 'Quarta semana do mês';
  return 'Quinta semana do mês';
}

function extrairCampoEmbed(embed, nomeCampo) {
  const fields = embed?.fields || [];
  const campo = fields.find(f => String(f.name || '').toLowerCase().includes(nomeCampo.toLowerCase()));
  return campo?.value || null;
}

function extrairPrimeiraMencaoId(content) {
  const match = String(content || '').match(/<@!?(\d+)>/);
  return match?.[1] || null;
}

async function buscarMensagensMesAtual(canal, inicioMes, fimMes) {
  const mensagens = [];
  let before;

  for (let pagina = 0; pagina < 20; pagina++) {
    const lote = await canal.messages.fetch({
      limit: 100,
      ...(before ? { before } : {})
    }).catch(() => null);

    if (!lote || lote.size === 0) break;

    for (const msg of lote.values()) {
      if (msg.createdAt < inicioMes) return mensagens;
      if (msg.createdAt <= fimMes) mensagens.push(msg);
    }

    before = lote.last()?.id;
    if (!before) break;
  }

  return mensagens;
}

function adicionarDiaNoRanking(ranking, userId, data) {
  if (!ranking.has(userId)) {
    ranking.set(userId, {
      total: 0,
      semanas: {
        'Primeira semana do mês': 0,
        'Segunda semana do mês': 0,
        'Terceira semana do mês': 0,
        'Quarta semana do mês': 0,
        'Quinta semana do mês': 0,
      }
    });
  }

  const semana = nomeSemanaMes(data.getDate());
  ranking.get(userId).total += 1;
  ranking.get(userId).semanas[semana] += 1;
}

function montarSvgDashboardAusencias({ mesNome, ano, rankingOrdenado, totalAusencias }) {
  const largura = 1400;
  const alturaBase = 430;
  const alturaLinha = 128;
  const altura = Math.max(900, alturaBase + rankingOrdenado.length * alturaLinha);

  const maxTotal = Math.max(...rankingOrdenado.map(item => item.total), 1);

  const linhas = rankingOrdenado.map((item, index) => {
    const y = 330 + index * alturaLinha;
    const larguraBarra = Math.max(40, Math.round((item.total / maxTotal) * 620));
    const medalha = index === 0 ? '👑' : index === 1 ? '🥈' : index === 2 ? '🥉' : '◆';

    const semanasTexto = Object.entries(item.semanas)
      .filter(([, qtd]) => qtd > 0)
      .map(([semana, qtd]) => `${semana}: marcou ${qtd} ${qtd === 1 ? 'ausência' : 'ausências'}`)
      .join(' • ');

    return `
      <g>
        <rect x="80" y="${y}" width="1240" height="104" rx="28" fill="rgba(255,255,255,0.075)" stroke="rgba(255,255,255,0.12)" />
        <text x="115" y="${y + 43}" font-size="34" font-weight="800" fill="#ffffff">${medalha} TOP ${index + 1}</text>
        <text x="315" y="${y + 43}" font-size="32" font-weight="800" fill="#ffffff">${escaparSvg(item.nome)}</text>
        <text x="315" y="${y + 78}" font-size="22" font-weight="500" fill="#d8c7ff">${escaparSvg(semanasTexto || 'Sem divisão semanal encontrada')}</text>

        <rect x="815" y="${y + 31}" width="640" height="28" rx="14" fill="rgba(255,255,255,0.14)" />
        <rect x="815" y="${y + 31}" width="${larguraBarra}" height="28" rx="14" fill="url(#barraAusencia)" />

        <text x="1210" y="${y + 78}" font-size="34" font-weight="900" fill="#ffffff" text-anchor="end">${item.total}</text>
        <text x="1222" y="${y + 78}" font-size="22" font-weight="700" fill="#ff9bd3">ausências</text>
      </g>
    `;
  }).join('');

  const vazio = rankingOrdenado.length === 0 ? `
    <text x="700" y="520" font-size="42" font-weight="900" fill="#ffffff" text-anchor="middle">Nenhuma ausência registrada neste mês.</text>
    <text x="700" y="575" font-size="26" font-weight="600" fill="#d8c7ff" text-anchor="middle">Assim que alguém marcar ausência, o ranking aparece aqui.</text>
  ` : '';

  return `
<svg width="${largura}" height="${altura}" viewBox="0 0 ${largura} ${altura}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#170019"/>
      <stop offset="42%" stop-color="#35002f"/>
      <stop offset="100%" stop-color="#07000b"/>
    </linearGradient>

    <linearGradient id="barraAusencia" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#ff007f"/>
      <stop offset="55%" stop-color="#b300ff"/>
      <stop offset="100%" stop-color="#ffffff"/>
    </linearGradient>

    <filter id="glow">
      <feGaussianBlur stdDeviation="8" result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <rect width="1400" height="${altura}" fill="url(#bg)" />
  <circle cx="1180" cy="120" r="230" fill="#ff007f" opacity="0.18" filter="url(#glow)" />
  <circle cx="130" cy="760" r="260" fill="#7b00ff" opacity="0.16" filter="url(#glow)" />

  <rect x="55" y="55" width="1290" height="${altura - 110}" rx="44" fill="rgba(0,0,0,0.25)" stroke="rgba(255,255,255,0.16)" />

  <text x="700" y="125" font-size="58" font-weight="950" fill="#ffffff" text-anchor="middle">Dashboard Mensal de Ausências</text>
  <text x="700" y="170" font-size="28" font-weight="700" fill="#ff9bd3" text-anchor="middle">${escaparSvg(mesNome)} de ${ano}</text>

  <rect x="190" y="215" width="440" height="72" rx="24" fill="rgba(255,255,255,0.09)" />
  <text x="410" y="260" font-size="28" font-weight="900" fill="#ffffff" text-anchor="middle">👥 ${rankingOrdenado.length} pessoas no ranking</text>

  <rect x="770" y="215" width="440" height="72" rx="24" fill="rgba(255,255,255,0.09)" />
  <text x="990" y="260" font-size="28" font-weight="900" fill="#ffffff" text-anchor="middle">📌 ${totalAusencias} ausências no mês</text>

  ${linhas}
  ${vazio}

  <text x="700" y="${altura - 55}" font-size="22" font-weight="700" fill="#bda7ff" text-anchor="middle">
    SantaCreators • Ranking automático do mês • Do maior número de ausências para o menor
  </text>
</svg>`;
}

async function atualizarDashboardAusenciasMensal(client) {
  const canalFonte = await client.channels.fetch(AUSENCIAS_GERAIS_CHANNEL_ID).catch(() => null);
  const canalDestino = await client.channels.fetch(AUSENCIAS_DASHBOARD_CHANNEL_ID).catch(() => null);

  if (!canalFonte || !canalFonte.isTextBased()) return;
  if (!canalDestino || !canalDestino.isTextBased()) return;

  const agora = new Date();
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1, 0, 0, 0, 0);
  const fimMes = new Date(agora.getFullYear(), agora.getMonth() + 1, 0, 23, 59, 59, 999);
  const mesNome = nomeMesPtBr(agora.getMonth());

  const mensagens = await buscarMensagensMesAtual(canalFonte, inicioMes, fimMes);
  const ranking = new Map();

  for (const msg of mensagens) {
    const userId = extrairPrimeiraMencaoId(msg.content);
    if (!userId) continue;

    const embed = msg.embeds?.[0];
    const dataTxt = extrairCampoEmbed(embed, 'Data');
    const ateTxt = extrairCampoEmbed(embed, 'Até');

    const dtInicio = parseDataBr(dataTxt);
    const dtFim = ateTxt ? parseDataBr(ateTxt) : null;

    if (!dtInicio) continue;

    const inicio = dtInicio < inicioMes ? inicioMes : dtInicio;
    const fim = dtFim && dtFim > dtInicio ? dtFim : dtInicio;
    const fimLimitado = fim > fimMes ? fimMes : fim;

    let atual = new Date(inicio.getTime());
    while (atual.getTime() <= fimLimitado.getTime()) {
      adicionarDiaNoRanking(ranking, userId, atual);
      atual = addDias(atual, 1);
    }
  }

  const rankingOrdenado = [];

  for (const [userId, dados] of ranking.entries()) {
    const membro = await canalDestino.guild.members.fetch(userId).catch(() => null);
    rankingOrdenado.push({
      userId,
      nome: membro?.displayName || `@${userId}`,
      total: dados.total,
      semanas: dados.semanas,
    });
  }

  rankingOrdenado.sort((a, b) => b.total - a.total);

  const totalAusencias = rankingOrdenado.reduce((acc, item) => acc + item.total, 0);

  const svg = montarSvgDashboardAusencias({
    mesNome,
    ano: agora.getFullYear(),
    rankingOrdenado,
    totalAusencias,
  });

  const pngBuffer = await sharp(Buffer.from(svg, 'utf8'))
    .png()
    .toBuffer();

  const arquivo = new AttachmentBuilder(pngBuffer, {
    name: 'dashboard-ausencias-mensal.png'
  });

  const embed = new EmbedBuilder()
    .setColor('#ff007f')
    .setTitle('📊 Dashboard Mensal de Ausências')
    .setDescription(
      [
        `**Período:** ${mesNome} de ${agora.getFullYear()}`,
        `**Ordem:** da pessoa que mais marcou ausência para a que menos marcou.`,
        `**Fonte:** <#${AUSENCIAS_GERAIS_CHANNEL_ID}>`
      ].join('\n')
    )
    .setImage('attachment://dashboard-ausencias-mensal.png')
    .setTimestamp();

  const mensagensDestino = await canalDestino.messages.fetch({ limit: 20 }).catch(() => null);
  const msgExistente = mensagensDestino?.find(msg =>
    msg.author.id === client.user.id &&
    msg.embeds?.[0]?.title === '📊 Dashboard Mensal de Ausências'
  );

  if (msgExistente) {
    await msgExistente.edit({
      embeds: [embed],
      files: [arquivo],
      attachments: []
    }).catch(async () => {
      await canalDestino.send({ embeds: [embed], files: [arquivo] }).catch(() => {});
    });
  } else {
    await canalDestino.send({ embeds: [embed], files: [arquivo] }).catch(() => {});
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
  if (!canal || !canal.isTextBased()) return;

  const mensagens = await canal.messages.fetch({ limit: 25 }).catch(() => null);
  if (mensagens) {
    const paraApagar = mensagens.filter(msg => 
      msg.author.id === client.user.id && 
      msg.components?.[0]?.components?.some(c => c.customId === 'abrir_ausencia')
    );
    
    for (const msg of paraApagar.values()) {
      await msg.delete().catch(() => {});
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

  await atualizarDashboardAusenciasMensal(client).catch(err => {
    console.error('[AUSÊNCIAS DASHBOARD] erro ao atualizar dashboard mensal:', err);
  });

  if (!globalThis.__AUSENCIAS_DASHBOARD_INTERVAL__) {
    globalThis.__AUSENCIAS_DASHBOARD_INTERVAL__ = setInterval(() => {
      atualizarDashboardAusenciasMensal(client).catch(err => {
        console.error('[AUSÊNCIAS DASHBOARD] erro ao atualizar dashboard mensal:', err);
      });
    }, 60 * 60 * 1000);
  }
}

export async function ausenciasHandleInteraction(interaction, client) {
    try {
      if (!interaction.customId?.includes('ausencia')) return false;

      // BOTÃO → abre modal
      if (interaction.isButton() && interaction.customId === 'abrir_ausencia') {
        const isUserAllowed = CARGOS_AUTORIZADOS_AUSENCIA.includes(interaction.user.id);
        const hasRole = interaction.member?.roles?.cache?.some(r => CARGOS_AUTORIZADOS_AUSENCIA.includes(r.id));
        const autorizado = isUserAllowed || hasRole;

        if (!autorizado) {
          await interaction.reply({
            content: '❌ Você não tem permissão para registrar ausência.',
            ephemeral: true,
            flags: 64,
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
        // Resposta imediata para evitar "interação falhou"
        if (!interaction.deferred && !interaction.replied) {
          await interaction.deferReply({ ephemeral: true }).catch(() => {});
          await interaction.deferReply({ flags: 64 }).catch(() => {});
        }

        const canalId = interaction.customId.replace('modal_ausencia_', '');
        const canalOrigem = await client.channels.fetch(canalId).catch(() => null);

        if (!canalOrigem) {
          console.warn(`[AUSÊNCIAS] Canal de origem ${canalId} não encontrado.`);
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
          await canalOrigem.send({ content: `<@${interaction.user.id}>`, embeds: [embedOrigem] }).catch(() => {});

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

        // Resposta final de sucesso
        await interaction.editReply({ content: '✅ Registro de ausência enviado com sucesso!' }).catch(() => {});
        return true;
      }
    } catch (err) {
      console.error('[AUSÊNCIAS] erro na interação (somente registro):', err);
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({
            content: '⚠️ Ocorreu um erro ao processar sua solicitação. Verifique se os dados estão corretos.',
          }).catch(() => {});
        } else {
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

  if (message.content.toLowerCase() === "!ausenciasdashboard") {
    const member = message.member;

    const isAuth = CARGOS_AUTORIZADOS_AUSENCIA.includes(message.author.id) ||
                   member?.roles?.cache?.some(r => CARGOS_AUTORIZADOS_AUSENCIA.includes(r.id));

    if (!isAuth) {
      const reply = await message.reply("🚫 Você não tem permissão para atualizar o dashboard de ausências.").catch(() => {});
      setTimeout(() => {
        message.delete().catch(() => {});
        if (reply) reply.delete().catch(() => {});
      }, 5000);
      return true;
    }

    await message.delete().catch(() => {});

    await atualizarDashboardAusenciasMensal(client).catch(err => {
      console.error('[AUSÊNCIAS DASHBOARD] erro no comando manual:', err);
    });

    const reply = await message.channel.send("✅ Dashboard mensal de ausências atualizado.").catch(() => {});
    if (reply) setTimeout(() => reply.delete().catch(() => {}), 8000);

    return true;
  }

  return false;
}