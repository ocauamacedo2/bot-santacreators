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
import fs from "node:fs";
import path from "node:path";

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
  ...Object.values(CANAIS_REGISTRO),
];

const AUSENCIAS_NOMES_PARA_USER_IDS = {
  'nox': '531702211387064330',
  'nox a nata': '531702211387064330',
};

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

  const texto =
    String(str).trim();

  const match =
    texto.match(
      /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/
    );

  if (!match) {
    return null;
  }

  const d =
    Number(match[1]);

  const m =
    Number(match[2]);

  const anoAtual =
    Number(
      new Intl.DateTimeFormat(
        'en-US',
        {
          timeZone:
            'America/Sao_Paulo',
          year:
            'numeric',
        }
      ).format(
        new Date()
      )
    );

  let y =
    match[3]
      ? Number(match[3])
      : anoAtual;

  if (y < 100) {
    y += 2000;
  }

  if (
    !Number.isInteger(y) ||
    y < 1000 ||
    y > 9999 ||
    m < 1 ||
    m > 12 ||
    d < 1 ||
    d > 31
  ) {
    return null;
  }

  const dt =
    new Date(
      y,
      m - 1,
      d,
      0,
      0,
      0,
      0
    );

  if (
    !Number.isFinite(
      dt.getTime()
    ) ||
    dt.getFullYear() !== y ||
    dt.getMonth() !== m - 1 ||
    dt.getDate() !== d
  ) {
    return null;
  }

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
  const match =
    String(content || '')
      .match(
        /<@!?(\d{17,20})>/
      );

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

function resolverUserIdPorNomeAusencia(nome, content = '') {
  const chaveNome =
    normalizarChaveAusencia(nome);

  if (!chaveNome) {
    return null;
  }

  const userId =
    AUSENCIAS_NOMES_PARA_USER_IDS[
      chaveNome
    ];

  if (
    !/^\d{17,20}$/.test(
      String(userId || '')
    )
  ) {
    return null;
  }

  return String(userId);
}

function criarChaveRegistroAusencia({
  userId,
  nome,
  dataTxt,
  ateTxt,
  horaTxt,
  motivoTxt,
}) {
  return [
    userId || normalizarChaveAusencia(nome),
    normalizarChaveAusencia(dataTxt),
    normalizarChaveAusencia(ateTxt),
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
  const idsColetados = new Set();

  const inicioChave =
    dateToIso(
      inicioMes
    );

  const fimChave =
    dateToIso(
      fimMes
    );

  const formatadorPublicacao =
    new Intl.DateTimeFormat(
      'en-US',
      {
        timeZone:
          'America/Sao_Paulo',
        year:
          'numeric',
        month:
          '2-digit',
        day:
          '2-digit',
      }
    );

  let before;

  for (let pagina = 0; pagina < 80; pagina++) {
    const lote = await canal.messages.fetch({
      limit: 100,
      ...(before ? { before } : {}),
    });

    if (lote.size === 0) {
      return mensagens;
    }

    let encontrouMensagemAntesDoMes = false;

    for (const msg of lote.values()) {
      if (idsColetados.has(msg.id)) {
        continue;
      }

      idsColetados.add(msg.id);

      const partesPublicacao =
        Object.fromEntries(
          formatadorPublicacao
            .formatToParts(
              msg.createdAt
            )
            .filter(parte =>
              [
                'year',
                'month',
                'day',
              ].includes(
                parte.type
              )
            )
            .map(parte => [
              parte.type,
              parte.value,
            ])
        );

      const diaPublicacao =
        partesPublicacao.year +
        '-' +
        partesPublicacao.month +
        '-' +
        partesPublicacao.day;

      if (
        diaPublicacao <
        inicioChave
      ) {
        encontrouMensagemAntesDoMes = true;
        continue;
      }

      if (
        diaPublicacao <=
        fimChave
      ) {
        mensagens.push(msg);
      }
    }

    if (
      encontrouMensagemAntesDoMes ||
      lote.size < 100
    ) {
      return mensagens;
    }

    const mensagemMaisAntiga =
      [...lote.values()].reduce(
        (maisAntiga, mensagem) => {
          if (!maisAntiga) {
            return mensagem;
          }

          return BigInt(mensagem.id) <
            BigInt(maisAntiga.id)
              ? mensagem
              : maisAntiga;
        },
        null
      );

    const nextBefore =
      mensagemMaisAntiga?.id;

    if (
      !nextBefore ||
      (
        before &&
        BigInt(nextBefore) >= BigInt(before)
      )
    ) {
      throw new Error(
        `A coleta de ausências não avançou no canal ${canal.id}. ` +
        'O dashboard não foi substituído por uma consulta incompleta.'
      );
    }

    before = nextBefore;
  }

  throw new Error(
    `A coleta de ausências atingiu 80 páginas no canal ${canal.id}. ` +
    'O dashboard não foi substituído por uma consulta incompleta.'
  );
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
      },
      dias:
        new Set(),
    });
  }

  const registro =
    ranking.get(userId);

  const dia =
    dateToIso(data);

  if (
    registro.dias.has(dia)
  ) {
    return;
  }

  registro.dias.add(dia);

  const semana =
    nomeSemanaMes(
      data.getDate()
    );

  registro.total += 1;
  registro.semanas[semana] += 1;
}

function intervaloAusenciaDentroDoMes(dtInicio, dtFim, inicioMes, fimMes) {
  const fimReal = dtFim && dtFim >= dtInicio ? dtFim : dtInicio;

  if (fimReal < inicioMes) return false;
  if (dtInicio > fimMes) return false;

  return true;
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

function salvarSnapshotAusenciasMensal({
  mesNome,
  ano,
  mes,
  rankingOrdenado,
  totalAusencias,
}) {
  const directory =
    path.resolve(
      process.cwd(),
      'data'
    );

  const file =
    path.join(
      directory,
      'ausencias_dashboard.json'
    );

  fs.mkdirSync(
    directory,
    {
      recursive: true,
    }
  );

  let stored = {
    version: 1,
    months: {},
  };

  if (
    fs.existsSync(file)
  ) {
    stored =
      JSON.parse(
        fs.readFileSync(
          file,
          'utf8'
        )
      );

    if (
      stored?.version !== 1 ||
      !stored.months ||
      typeof stored.months !== 'object' ||
      Array.isArray(stored.months)
    ) {
      throw new Error(
        'O JSON do dashboard de ausências está inválido. O arquivo existente foi preservado.'
      );
    }
  }

  const monthKey =
    String(ano) +
    '-' +
    pad(mes + 1);

  stored.months[monthKey] = {
    monthKey,
    mesNome,
    ano,
    generatedAt:
      new Date().toISOString(),
    coverage:
      'mensagens_publicadas_no_mes',
    metric:
      'dias_distintos_por_pessoa',
    totalAusencias,
    totalPessoas:
      rankingOrdenado.length,
    ranking:
      rankingOrdenado,
  };

  const temporary =
    file + '.tmp';

  fs.writeFileSync(
    temporary,
    JSON.stringify(
      stored,
      null,
      2
    ),
    'utf8'
  );

  fs.renameSync(
    temporary,
    file
  );
}

const ausenciasDashboardJobs =
  new Map();

const ausenciasDashboardTimers =
  new Map();

function atualizarDashboardAusenciasMensal(
  client,
  options = {}
) {
  const key =
    String(
      client.user?.id || ''
    );

  if (!key) {
    return Promise.reject(
      new Error(
        'O cliente Discord ainda não está pronto para atualizar as ausências.'
      )
    );
  }

  const previous =
    ausenciasDashboardJobs.get(key);

  if (previous) {
    if (
      options.requireFresh === true
    ) {
      previous.rerun = true;
    }

    return previous.promise;
  }

  const job = {
    rerun:
      false,
    promise:
      null,
  };

  ausenciasDashboardJobs.set(
    key,
    job
  );

  job.promise =
    Promise.resolve()
      .then(async () => {
        do {
          job.rerun = false;

          await executarAtualizacaoDashboardAusenciasMensal(
            client
          );
        } while (
          job.rerun
        );
      })
      .finally(() => {
        if (
          ausenciasDashboardJobs.get(key) === job
        ) {
          ausenciasDashboardJobs.delete(key);
        }
      });

  return job.promise;
}

function agendarDashboardAusencias(client) {
  const key =
    String(
      client.user?.id || ''
    );

  if (!key) {
    return;
  }

  clearTimeout(
    ausenciasDashboardTimers.get(key)
  );

  ausenciasDashboardTimers.set(
    key,
    setTimeout(() => {
      ausenciasDashboardTimers.delete(key);

      void atualizarDashboardAusenciasMensal(
        client,
        {
          requireFresh:
            true,
        }
      ).catch(error => {
        console.error(
          '[AUSÊNCIAS DASHBOARD] Falha na atualização após registro:',
          error
        );
      });
    }, 2500)
  );
}

function lerEstadoPainelAusencias() {
  const file =
    path.resolve(
      process.cwd(),
      'data',
      'ausencias_dashboard_painel.json'
    );

  const stored =
    fs.existsSync(file)
      ? JSON.parse(
          fs.readFileSync(
            file,
            'utf8'
          )
        )
      : {
          version:
            1,
          panels:
            {},
        };

  if (
    stored?.version !== 1 ||
    !stored.panels ||
    typeof stored.panels !== 'object' ||
    Array.isArray(stored.panels)
  ) {
    throw new Error(
      'O JSON de identificação do painel de ausências está inválido. O arquivo foi preservado.'
    );
  }

  return {
    file,
    stored,
  };
}

function salvarIdPainelAusencias(
  client,
  channel,
  message
) {
  if (
    !/^\d{17,20}$/.test(
      String(message?.id || '')
    )
  ) {
    throw new Error(
      'Não foi possível confirmar o ID do painel de ausências.'
    );
  }

  const {
    file,
    stored,
  } =
    lerEstadoPainelAusencias();

  const key =
    `${client.user.id}:${channel.id}`;

  stored.panels[key] =
    String(message.id);

  fs.mkdirSync(
    path.dirname(file),
    {
      recursive:
        true,
    }
  );

  const temporary =
    file + '.tmp';

  fs.writeFileSync(
    temporary,
    JSON.stringify(
      stored,
      null,
      2
    ),
    'utf8'
  );

  fs.renameSync(
    temporary,
    file
  );
}

async function buscarPainelAusencias(
  client,
  channel
) {
  const {
    stored,
  } =
    lerEstadoPainelAusencias();

  const key =
    `${client.user.id}:${channel.id}`;

  const savedId =
    stored.panels[key];

  const painelValido =
    message =>
      message?.author?.id === client.user.id &&
      message.embeds?.[0]?.title === '📊 Dashboard Mensal de Ausências';

  if (
    savedId !== undefined
  ) {
    if (
      !/^\d{17,20}$/.test(
        String(savedId)
      )
    ) {
      throw new Error(
        'O ID salvo do painel de ausências está inválido. O arquivo foi preservado.'
      );
    }

    let message;

    try {
      message =
        await channel.messages.fetch(
          String(savedId)
        );
    } catch (error) {
      if (
        Number(error?.code) !== 10008
      ) {
        throw error;
      }
    }

    if (
      painelValido(message)
    ) {
      return message;
    }
  }

  let before;

  for (
    let page = 0;
    page < 20;
    page++
  ) {
    const messages =
      await channel.messages.fetch({
        limit:
          100,
        ...(before
          ? {
              before,
            }
          : {}),
      });

    const existing =
      messages.find(
        painelValido
      );

    if (existing) {
      return existing;
    }

    if (
      messages.size < 100
    ) {
      return null;
    }

    const oldest =
      [...messages.values()].reduce(
        (previous, message) =>
          !previous ||
          BigInt(message.id) < BigInt(previous.id)
            ? message
            : previous,
        null
      );

    const nextBefore =
      oldest?.id;

    if (
      !nextBefore ||
      (
        before &&
        BigInt(nextBefore) >= BigInt(before)
      )
    ) {
      throw new Error(
        'A busca pelo painel de ausências não avançou. Nenhum painel novo foi criado.'
      );
    }

    before =
      nextBefore;
  }

  throw new Error(
    'A busca inicial pelo painel de ausências atingiu 20 páginas. Nenhum painel novo foi criado para evitar duplicação.'
  );
}

async function executarAtualizacaoDashboardAusenciasMensal(client) {
  const canalFonte =
    await client.channels.fetch(
      AUSENCIAS_GERAIS_CHANNEL_ID
    );

  const canalDestino =
    await client.channels.fetch(
      AUSENCIAS_DASHBOARD_CHANNEL_ID
    );

  if (
    !canalFonte?.isTextBased?.() ||
    !canalFonte.messages
  ) {
    throw new Error(
      'O canal geral de ausências está indisponível ou não permite leitura de mensagens.'
    );
  }

  if (
    !canalDestino?.isTextBased?.() ||
    !canalDestino.messages
  ) {
    throw new Error(
      'O canal do dashboard de ausências está indisponível ou não é textual.'
    );
  }

  const partesAgora =
    Object.fromEntries(
      new Intl.DateTimeFormat(
        'en-US',
        {
          timeZone:
            'America/Sao_Paulo',
          year:
            'numeric',
          month:
            '2-digit',
          day:
            '2-digit',
        }
      )
        .formatToParts(
          new Date()
        )
        .filter(parte =>
          [
            'year',
            'month',
            'day',
          ].includes(
            parte.type
          )
        )
        .map(parte => [
          parte.type,
          parte.value,
        ])
    );

  const agora =
    new Date(
      Number(partesAgora.year),
      Number(partesAgora.month) - 1,
      Number(partesAgora.day)
    );

  const inicioMes =
    new Date(
      agora.getFullYear(),
      agora.getMonth(),
      1,
      0,
      0,
      0,
      0
    );

  const fimMes =
    new Date(
      agora.getFullYear(),
      agora.getMonth() + 1,
      0,
      23,
      59,
      59,
      999
    );

  const mesNome =
    nomeMesPtBr(
      agora.getMonth()
    );

  const mensagens = [];
  const idsMensagensColetadas = new Set();

  for (const canalFonteId of AUSENCIAS_DASHBOARD_FONTES_CHANNEL_IDS) {
    const canalColeta =
      await client.channels.fetch(
        canalFonteId
      );

    if (
      !canalColeta?.isTextBased?.() ||
      !canalColeta.messages
    ) {
      throw new Error(
        `A fonte de ausências ${canalFonteId} está indisponível. ` +
        'A atualização foi interrompida para evitar totais incompletos.'
      );
    }

    const mensagensCanal =
      await buscarMensagensMesAtual(
        canalColeta,
        inicioMes,
        fimMes
      );

    for (const msg of mensagensCanal) {
      if (
        idsMensagensColetadas.has(msg.id)
      ) {
        continue;
      }

      idsMensagensColetadas.add(msg.id);
      mensagens.push(msg);
    }
  }

  const ranking = new Map();
  const registrosUnicos = new Set();

  for (const msg of mensagens) {
    const embed =
      msg.embeds?.[0];

    if (
      !embed ||
      !msg.author?.bot ||
      normalizarChaveAusencia(
        embed.title
      ) !== 'registro de ausencia'
    ) {
      continue;
    }

    const nomeAusencia =
      extrairNomeAusencia(embed);

    const userId =
      extrairPrimeiraMencaoId(
        msg.content
      ) ||
      resolverUserIdPorNomeAusencia(
        nomeAusencia,
        msg.content
      );

    if (
      !userId &&
      !normalizarChaveAusencia(
        nomeAusencia
      )
    ) {
      continue;
    }

    const dataTxt = extrairCampoEmbed(embed, 'Data');
    const ateTxt = extrairCampoEmbed(embed, 'Até');
    const horaTxt = extrairCampoEmbed(embed, 'Hora');
    const motivoTxt = extrairCampoEmbed(embed, 'Motivo');

    const chaveRegistro = criarChaveRegistroAusencia({
      userId,
      nome: nomeAusencia,
      dataTxt,
      ateTxt,
      horaTxt,
      motivoTxt,
    });

    if (registrosUnicos.has(chaveRegistro)) continue;
    registrosUnicos.add(chaveRegistro);

const dtInicio = parseDataBr(dataTxt);
const dtFim = ateTxt ? parseDataBr(ateTxt) : null;

if (!dtInicio) continue;

if (!intervaloAusenciaDentroDoMes(dtInicio, dtFim, inicioMes, fimMes)) {
  continue;
}

const inicio = dtInicio < inicioMes ? inicioMes : dtInicio;
const fim = dtFim && dtFim >= dtInicio ? dtFim : dtInicio;
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

  salvarSnapshotAusenciasMensal({
    mesNome,
    ano:
      agora.getFullYear(),
    mes:
      agora.getMonth(),
    rankingOrdenado,
    totalAusencias,
  });

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

  const msgExistente =
    await buscarPainelAusencias(
      client,
      canalDestino
    );

  let mensagemPublicada;

  if (msgExistente) {
    try {
      mensagemPublicada =
        await msgExistente.edit({
          embeds: [
            embed,
          ],
          files: [
            arquivo,
          ],
          attachments: [],
        });
    } catch (error) {
      if (
        Number(error?.code) !== 10008
      ) {
        throw error;
      }

      mensagemPublicada =
        await canalDestino.send({
          embeds: [
            embed,
          ],
          files: [
            arquivo,
          ],
        });
    }
  } else {
    mensagemPublicada =
      await canalDestino.send({
        embeds: [
          embed,
        ],
        files: [
          arquivo,
        ],
      });
  }

  salvarIdPainelAusencias(
    client,
    canalDestino,
    mensagemPublicada
  );
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
          await interaction.deferReply({
            flags: 64,
          });
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

        // Valida as datas antes de registrar ou enviar.
        const dtInicio =
          parseDataBr(data);

        const possuiDataFim =
          Boolean(
            String(ate || '').trim()
          );

        const dtFim =
          possuiDataFim
            ? parseDataBr(ate)
            : null;

        if (
          !dtInicio ||
          (
            possuiDataFim &&
            !dtFim
          )
        ) {
          await interaction.editReply({
            content:
              '❌ Data inválida. Use DD/MM ou DD/MM/AAAA e informe um dia existente.',
          });

          return true;
        }

        if (
          dtFim &&
          dtFim.getTime() <
            dtInicio.getTime()
        ) {
          await interaction.editReply({
            content:
              '❌ A data final da ausência não pode ser anterior à data inicial.',
          });

          return true;
        }

        const canalGerais =
          await client.channels.fetch(
            AUSENCIAS_GERAIS_CHANNEL_ID
          );

        if (
          !canalGerais?.isTextBased?.() ||
          typeof canalGerais.send !== 'function' ||
          canalGerais.guildId !== interaction.guildId
        ) {
          throw new Error(
            'O canal geral de ausências está indisponível para registrar esta ausência.'
          );
        }

        const origemStr =
          canalOrigem
            ? `${canalOrigem.toString()} • (${canalOrigem.id})`
            : 'Canal de origem indisponível';

        const embedGerais =
          criarEmbedRegistro({
            user:
              interaction.user,
            nome,
            data,
            hora,
            motivo,
            gifUrl:
              GIF_URL,
            addOrigem:
              true,
            origem:
              origemStr,
            intervaloAte:
              ate || null,
          });

        await canalGerais.send({
          content:
            `<@${interaction.user.id}>`,
          embeds: [
            embedGerais,
          ],
        });

        if (dtFim) {
          registrarAusenciaIntervalo(
            interaction.user.id,
            dtInicio,
            dtFim
          );
        } else {
          registrarAusenciaMem(
            interaction.user.id,
            dateToIso(dtInicio)
          );
        }

        let origemEnviada =
          canalOrigem?.id ===
          canalGerais.id;

        if (
          canalOrigem?.id !== canalGerais.id &&
          canalOrigem?.guildId === interaction.guildId &&
          typeof canalOrigem?.send === 'function'
        ) {
          const embedOrigem =
            criarEmbedRegistro({
              user:
                interaction.user,
              nome,
              data,
              hora,
              motivo,
              gifUrl:
                GIF_URL,
              addOrigem:
                false,
              intervaloAte:
                ate || null,
            });

          try {
            await canalOrigem.send({
              content:
                `<@${interaction.user.id}>`,
              embeds: [
                embedOrigem,
              ],
            });

            origemEnviada = true;
          } catch (error) {
            console.warn(
              '[AUSÊNCIAS] Registro salvo no canal geral, mas a cópia no canal de origem falhou:',
              error
            );
          }

          if (origemEnviada) {
            await enviarBotaoFixoPorCanal(
              client,
              canalId
            ).catch(error => {
              console.warn(
                '[AUSÊNCIAS] Registro enviado, mas a atualização do botão de origem falhou:',
                error
              );
            });
          }
        }

        agendarDashboardAusencias(
          client
        );

        await interaction.editReply({
          content:
            origemEnviada
              ? '✅ Ausência registrada com sucesso.'
              : '✅ Ausência registrada no canal geral. A cópia no canal de origem não foi enviada; não é necessário registrar novamente.',
        }).catch(error => {
          console.warn(
            '[AUSÊNCIAS] Registro publicado, mas a confirmação privada não pôde ser enviada:',
            error
          );
        });

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

    try {
      await atualizarDashboardAusenciasMensal(
        client,
        {
          requireFresh:
            true,
        }
      );

      const reply =
        await message.channel.send(
          '✅ Dashboard mensal de ausências atualizado.'
        ).catch(() => null);

      if (reply) {
        setTimeout(() => {
          reply.delete().catch(() => {});
        }, 8000);
      }
    } catch (error) {
      console.error(
        '[AUSÊNCIAS DASHBOARD] erro no comando manual:',
        error
      );

      const motivo =
        String(
          error?.message || error
        ).slice(0, 1500);

      const reply =
        await message.channel.send(
          '❌ Não foi possível concluir a atualização do dashboard de ausências.\n' +
          motivo
        ).catch(() => null);

      if (reply) {
        setTimeout(() => {
          reply.delete().catch(() => {});
        }, 20000);
      }
    }

    return true;
  }

  return false;
}