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

import { findFormsCreatorThreadIdByUserId } from "./formscreator.js";

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

const AUSENCIAS_DASHBOARD_FONTES_CHANNEL_IDS = [
  AUSENCIAS_GERAIS_CHANNEL_ID,
  '1425943951201796206',
];

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

  const texto = String(str).trim();
  const match = texto.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);

  if (!match) return null;

  const d = Number(match[1]);
  const m = Number(match[2]);

  let y = match[3] ? Number(match[3]) : new Date().getFullYear();
  if (y < 100) y += 2000;

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
function extrairPrimeiraMencaoId(content) {
  const match = String(content || '').match(/<@!?(\d+)>/);
  return match?.[1] || null;
}

function normalizarChaveAusencia(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function extrairNomeAusencia(embed) {
  const nome = extrairCampoEmbed(embed, 'Nome');
  if (!nome) return null;

  return String(nome)
    .replace(/<@!?\d+>/g, '')
    .replace(/`/g, '')
    .trim();
}

function criarChaveRegistroAusencia({ userId, nome, dataTxt, horaTxt, motivoTxt }) {
  return [
    userId || normalizarChaveAusencia(nome),
    normalizarChaveAusencia(dataTxt),
    normalizarChaveAusencia(horaTxt),
    normalizarChaveAusencia(motivoTxt),
  ].join('|');
}
function limparNomeRanking(nome) {
  const texto = String(nome || '').trim();

  if (!texto) return 'Usuário sem nome';

  const partes = texto
    .split('|')
    .map(p => p.trim())
    .filter(Boolean);

  if (partes.length >= 3) {
    return `${partes[partes.length - 2]} | ${partes[partes.length - 1]}`;
  }

  if (partes.length === 2) {
    return `${partes[0]} | ${partes[1]}`;
  }

  return texto;
}

function limitarTexto(str, limite = 38) {
  const texto = String(str || '').trim();
  if (texto.length <= limite) return texto;
  return texto.slice(0, limite - 3).trim() + '...';
}

async function buscarNomePorFormsCreator(client, userId) {
  const threadId = await findFormsCreatorThreadIdByUserId(client, userId).catch(() => null);
  if (!threadId) return null;

  const thread = await client.channels.fetch(threadId).catch(() => null);
  if (!thread || !thread.isTextBased()) return null;

  const mensagens = await thread.messages.fetch({ limit: 50 }).catch(() => null);
  if (!mensagens) return null;

  const msgRegistro = mensagens.find(msg => {
    const embed = msg.embeds?.[0];
    if (!embed) return false;

    const raw = [
      embed.title || '',
      embed.description || '',
      ...(embed.fields || []).flatMap(field => [field.name || '', field.value || ''])
    ].join('\n');

    return raw.includes(`<@${userId}>`) || raw.includes(`<@!${userId}>`) || raw.includes(userId);
  });

  const embed = msgRegistro?.embeds?.[0];
  if (!embed) return null;

  const nome = String(embed.title || '')
    .replace(/^👤\s*/i, '')
    .trim();

  const idCidade = embed.fields?.find(field =>
    String(field.name || '').includes('ID/Passaporte')
  )?.value;

  if (nome && idCidade) return `${nome} | ${idCidade}`;
  if (nome) return nome;

  return null;
}

async function resolverNomeDashboardAusencias(client, guild, userId) {
  const nomeForms = await buscarNomePorFormsCreator(client, userId).catch(() => null);

  if (nomeForms) {
    return limparNomeRanking(nomeForms);
  }

  const membro = await guild.members.fetch(userId).catch(() => null);
  return limparNomeRanking(membro?.displayName || `Usuário ${userId}`);
}

function montarLinhasSemanaSvg(semanas, x, y) {
  const textos = Object.entries(semanas)
    .filter(([, qtd]) => qtd > 0)
    .map(([semana, qtd]) => `${semana}: ${qtd} ${qtd === 1 ? 'ausência' : 'ausências'}`);

  if (!textos.length) {
    return `<text x="${x}" y="${y}" font-size="23" font-weight="600" fill="#d8c7ff">Sem divisão semanal encontrada</text>`;
  }

  const linha1 = textos.slice(0, 2).join(' • ');
  const linha2 = textos.slice(2, 5).join(' • ');

  return `
    <text x="${x}" y="${y}" font-size="23" font-weight="600" fill="#d8c7ff">${escaparSvg(linha1)}</text>
    ${linha2 ? `<text x="${x}" y="${y + 30}" font-size="21" font-weight="600" fill="#bfa8ff">${escaparSvg(linha2)}</text>` : ''}
  `;
}

async function buscarMensagensMesAtual(canal, inicioMes, fimMes) {
  const mensagens = [];
  let before;

  for (let pagina = 0; pagina < 80; pagina++) {
    const lote = await canal.messages.fetch({
      limit: 100,
      ...(before ? { before } : {})
    }).catch(() => null);

    if (!lote || lote.size === 0) break;

    let encontrouMensagemAntesDoMes = false;

    for (const msg of lote.values()) {
      if (msg.createdAt < inicioMes) {
        encontrouMensagemAntesDoMes = true;
        continue;
      }

      if (msg.createdAt <= fimMes) {
        mensagens.push(msg);
      }
    }

    if (encontrouMensagemAntesDoMes) break;

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
  const largura = 1800;
  const alturaBase = 470;
  const alturaLinha = 154;
  const altura = Math.max(980, alturaBase + rankingOrdenado.length * alturaLinha);

  const maxTotal = Math.max(...rankingOrdenado.map(item => item.total), 1);

  const linhas = rankingOrdenado.map((item, index) => {
    const y = 350 + index * alturaLinha;
    const larguraBarra = Math.max(55, Math.round((item.total / maxTotal) * 500));
    const medalha = index === 0 ? '👑' : index === 1 ? '🥈' : index === 2 ? '🥉' : '◆';
    const nomeLimpo = limitarTexto(item.nome, 42);

    return `
      <g>
        <rect x="90" y="${y}" width="1620" height="126" rx="30" fill="rgba(255,255,255,0.078)" stroke="rgba(255,255,255,0.14)" />

        <text x="135" y="${y + 50}" font-size="34" font-weight="900" fill="#ffffff">${medalha} TOP ${index + 1}</text>
        <text x="365" y="${y + 50}" font-size="36" font-weight="900" fill="#ffffff">${escaparSvg(nomeLimpo)}</text>

        ${montarLinhasSemanaSvg(item.semanas, 365, y + 86)}

        <rect x="1090" y="${y + 40}" width="520" height="30" rx="15" fill="rgba(255,255,255,0.18)" />
        <rect x="1090" y="${y + 40}" width="${larguraBarra}" height="30" rx="15" fill="url(#barraAusencia)" />

        <text x="1600" y="${y + 102}" font-size="38" font-weight="950" fill="#ffffff" text-anchor="end">${item.total}</text>
        <text x="1615" y="${y + 102}" font-size="24" font-weight="800" fill="#ff9bd3">${item.total === 1 ? 'ausência' : 'ausências'}</text>
      </g>
    `;
  }).join('');

  const vazio = rankingOrdenado.length === 0 ? `
    <text x="900" y="560" font-size="46" font-weight="950" fill="#ffffff" text-anchor="middle">Nenhuma ausência registrada neste mês.</text>
    <text x="900" y="620" font-size="28" font-weight="700" fill="#d8c7ff" text-anchor="middle">Assim que alguém marcar ausência, o ranking aparece aqui.</text>
  ` : '';

  return `
<svg width="${largura}" height="${altura}" viewBox="0 0 ${largura} ${altura}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#160018"/>
      <stop offset="42%" stop-color="#340031"/>
      <stop offset="100%" stop-color="#08000d"/>
    </linearGradient>

    <linearGradient id="barraAusencia" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#ff007f"/>
      <stop offset="50%" stop-color="#b300ff"/>
      <stop offset="100%" stop-color="#ffffff"/>
    </linearGradient>

    <filter id="glow">
      <feGaussianBlur stdDeviation="10" result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <rect width="${largura}" height="${altura}" fill="url(#bg)" />
  <circle cx="1520" cy="150" r="310" fill="#ff007f" opacity="0.17" filter="url(#glow)" />
  <circle cx="140" cy="820" r="340" fill="#7b00ff" opacity="0.17" filter="url(#glow)" />

  <rect x="65" y="65" width="1670" height="${altura - 130}" rx="50" fill="rgba(0,0,0,0.28)" stroke="rgba(255,255,255,0.17)" />

  <text x="900" y="145" font-size="72" font-weight="950" fill="#ffffff" text-anchor="middle">Dashboard Mensal de Ausências</text>
  <text x="900" y="200" font-size="34" font-weight="800" fill="#ff9bd3" text-anchor="middle">${escaparSvg(mesNome)} de ${ano}</text>

  <rect x="240" y="245" width="520" height="78" rx="26" fill="rgba(255,255,255,0.095)" />
  <text x="500" y="296" font-size="32" font-weight="950" fill="#ffffff" text-anchor="middle">👥 ${rankingOrdenado.length} pessoas no ranking</text>

  <rect x="1040" y="245" width="520" height="78" rx="26" fill="rgba(255,255,255,0.095)" />
  <text x="1300" y="296" font-size="32" font-weight="950" fill="#ffffff" text-anchor="middle">📌 ${totalAusencias} ausências no mês</text>

  ${linhas}
  ${vazio}

  <text x="900" y="${altura - 65}" font-size="25" font-weight="800" fill="#cbb4ff" text-anchor="middle">
    SantaCreators • Ranking automático mensal • Maior número de ausências para o menor
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

  const mensagens = [];
  const idsMensagensColetadas = new Set();

  for (const canalFonteId of AUSENCIAS_DASHBOARD_FONTES_CHANNEL_IDS) {
    const canalColeta = await client.channels.fetch(canalFonteId).catch(() => null);
    if (!canalColeta || !canalColeta.isTextBased()) continue;

    const mensagensCanal = await buscarMensagensMesAtual(canalColeta, inicioMes, fimMes);

    for (const msg of mensagensCanal) {
      if (idsMensagensColetadas.has(msg.id)) continue;
      idsMensagensColetadas.add(msg.id);
      mensagens.push(msg);
    }
  }

  const ranking = new Map();
  const registrosUnicos = new Set();

  for (const msg of mensagens) {
    const embed = msg.embeds?.[0];
    if (!embed) continue;

    const userId = extrairPrimeiraMencaoId(msg.content);
    const nomeAusencia = extrairNomeAusencia(embed);

    if (!userId && !nomeAusencia) continue;

    const dataTxt = extrairCampoEmbed(embed, 'Data');
    const ateTxt = extrairCampoEmbed(embed, 'Até');
    const horaTxt = extrairCampoEmbed(embed, 'Hora');
    const motivoTxt = extrairCampoEmbed(embed, 'Motivo');

    const chaveRegistro = criarChaveRegistroAusencia({
      userId,
      nome: nomeAusencia,
      dataTxt,
      horaTxt,
      motivoTxt,
    });

    if (registrosUnicos.has(chaveRegistro)) continue;
    registrosUnicos.add(chaveRegistro);

    const dtInicio = parseDataBr(dataTxt);
    const dtFim = ateTxt ? parseDataBr(ateTxt) : null;

    if (!dtInicio) continue;

    const inicio = dtInicio < inicioMes ? inicioMes : dtInicio;
    const fim = dtFim && dtFim > dtInicio ? dtFim : dtInicio;
    const fimLimitado = fim > fimMes ? fimMes : fim;

    const rankingId = userId || `nome:${normalizarChaveAusencia(nomeAusencia)}`;

    let atual = new Date(inicio.getTime());
    while (atual.getTime() <= fimLimitado.getTime()) {
      adicionarDiaNoRanking(ranking, rankingId, atual);
      atual = addDias(atual, 1);
    }
  }

  const rankingOrdenado = [];

  for (const [rankingId, dados] of ranking.entries()) {
    const isDiscordUser = !String(rankingId).startsWith('nome:');

    const nomeResolvido = isDiscordUser
      ? await resolverNomeDashboardAusencias(client, canalDestino.guild, rankingId)
      : limparNomeRanking(String(rankingId).replace('nome:', ''));

    rankingOrdenado.push({
      userId: rankingId,
      nome: nomeResolvido,
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