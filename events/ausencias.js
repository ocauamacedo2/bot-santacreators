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
import { randomUUID } from "node:crypto";

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

function parseDataBr(str, reference = Date.now()) {
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
        new Date(
          Number.isFinite(Number(reference))
            ? Number(reference)
            : Date.now()
        )
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

function extrairCampoEmbed(
  embed,
  nomeCampo
) {
  const chave =
    normalizarChaveAusencia(
      nomeCampo
    );

  const fields =
    Array.isArray(embed?.fields)
      ? embed.fields
      : [];

  const campo =
    fields.find(field =>
      field &&
      typeof field.name === "string" &&
      normalizarChaveAusencia(
        field.name
      ) === chave
    );

  return typeof campo?.value === "string"
    ? campo.value.trim() || null
    : null;
}

function extrairPrimeiraMencaoId(content) {
  const match =
    String(content || '')
      .match(
        /<@!?(\d{17,20})>/
      );

  return match?.[1] || null;
}

function resolverIdentidadeRegistroAusencia(
  message,
  embed,
  nome
) {
  const explicit =
    extrairCampoEmbed(
      embed,
      'ID Discord'
    );

  if (
    explicit != null
  ) {
    const id =
      String(explicit).replace(
        /[`\s]/g,
        ''
      );

    const match = id.match(
      /^(?:<@!?(\d{17,20})>|(\d{17,20}))$/
    );

    return match
      ? match[1] || match[2]
      : null;
  }

  const mentions = [
    ...new Set(
      [
        ...String(
          message.content || ''
        ).matchAll(
          /<@!?(\d{17,20})>/g
        )
      ].map(
        match =>
          match[1]
      )
    )
  ];

  if (
    mentions.length === 1
  ) {
    return mentions[0];
  }

  if (
    mentions.length > 1
  ) {
    return null;
  }

  return resolverUserIdPorNomeAusencia(
    nome,
    message.content
  );
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

async function buscarNomePorFormsCreator(
  client,
  userId
) {
  userId = String(userId || "");

  if (!/^\d{17,20}$/.test(userId)) {
    return null;
  }

  const threadId =
    await lerAusenciasComPrazo(
      "forms.find_thread:" + userId,
      () => findFormsCreatorThreadIdByUserId(
        client,
        userId
      )
    );

  if (!threadId) {
    return null;
  }

  const thread =
    await lerAusenciasComPrazo(
      "forms.thread_channel:" + threadId,
      () => client.channels.fetch(
        threadId
      )
    );

  if (
    !thread ||
    !thread.isTextBased()
  ) {
    return null;
  }

  const mensagens =
    await lerAusenciasComPrazo(
      "forms.messages:" + threadId,
      () => thread.messages.fetch({
        limit: 50,
      })
    );

  if (!mensagens) {
    return null;
  }

  const identityPattern = new RegExp(
    "(^|\\D)" + userId + "(?!\\d)"
  );

  const msgRegistro =
    mensagens.find(msg => {
      const embed = msg.embeds?.[0];

      if (!embed) {
        return false;
      }

      const raw = [
        embed.title || "",
        embed.description || "",
        ...(embed.fields || []).flatMap(
          field => [
            field.name || "",
            field.value || "",
          ]
        ),
      ].join("\n");

      return identityPattern.test(raw);
    });

  const embed =
    msgRegistro?.embeds?.[0];

  if (!embed) {
    return null;
  }

  const nome = String(
    embed.title || ""
  )
    .replace(/^👤\s*/i, "")
    .trim();

  const idCidade =
    embed.fields?.find(field =>
      String(field.name || "")
        .includes("ID/Passaporte")
    )?.value;

  if (nome && idCidade) {
    return `${nome} | ${idCidade}`;
  }

  if (nome) {
    return nome;
  }

  return null;
}

async function resolverNomeDashboardAusencias(client, guild, userId) {
  const membroEmCache =
    guild.members.cache.get(userId);

  const nomeEmCache =
    String(
      membroEmCache?.displayName || ""
    ).trim();

  if (nomeEmCache) {
    return limparNomeRanking(
      nomeEmCache
    );
  }

  const nomeForms =
    await buscarNomePorFormsCreator(
      client,
      userId
    ).catch(() => null);

  if (nomeForms) {
    return limparNomeRanking(
      nomeForms
    );
  }

  const membro =
    guild.members.cache.get(userId) ||
    await lerAusenciasComPrazo(
      "dashboard.member:" + userId,
      () => guild.members.fetch(
        userId
      )
    ).catch(() => null);

  return limparNomeRanking(
    membro?.displayName ||
    `Usuário ${userId}`
  );
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

async function buscarMensagensMesAtual(
  canal,
  inicioMes,
  fimMes
) {
  if (
    !canal?.messages ||
    !(inicioMes instanceof Date) ||
    !(fimMes instanceof Date) ||
    !Number.isFinite(
      inicioMes.getTime()
    ) ||
    !Number.isFinite(
      fimMes.getTime()
    ) ||
    fimMes < inicioMes
  ) {
    throw new Error(
      "Fonte ou período inválido para coletar ausências."
    );
  }

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

  const deadlineAt =
    Date.now() + 60000;

  for (
    let pagina = 0;
    pagina < 80;
    pagina++
  ) {
    if (
      Date.now() >= deadlineAt
    ) {
      throw new Error(
        'A coleta mensal de ausências atingiu o prazo. O snapshot anterior foi preservado.'
      );
    }

    let fetchTimer;

    const lote =
      await Promise.race([
        canal.messages.fetch({
          limit:
            100,

          ...(before
            ? { before }
            : {})
        }),

        new Promise((resolve, reject) => {
          fetchTimer =
            setTimeout(
              () => reject(
                new Error(
                  'Uma página de ausências não respondeu em 30 segundos.'
                )
              ),

              Math.min(
                30000,
                deadlineAt - Date.now()
              )
            );
        })
      ]).finally(() => {
        clearTimeout(
          fetchTimer
        );
      });

    if (Date.now() >= deadlineAt) {
      throw new Error(
        "A coleta mensal de ausências atingiu o prazo após a leitura da página. O snapshot anterior foi preservado."
      );
    }

    if (lote.size === 0) {
      return mensagens;
    }

    let encontrouMensagemAntesDoMes = false;

    for (const msg of lote.values()) {
      if (
        !/^\d{17,20}$/.test(
          String(msg?.id || "")
        ) ||
        !(msg.createdAt instanceof Date) ||
        !Number.isFinite(
          msg.createdAt.getTime()
        )
      ) {
        throw new Error(
          "Uma mensagem da fonte de ausências possui identificação ou data inválida. O snapshot anterior foi preservado."
        );
      }

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

function intervaloAusenciaDentroDoMes(
  dtInicio,
  dtFim,
  inicioMes,
  fimMes
) {
  if (
    ![
      dtInicio,
      inicioMes,
      fimMes,
    ].every(date =>
      date instanceof Date &&
      Number.isFinite(
        date.getTime()
      )
    ) ||
    fimMes < inicioMes ||
    (
      dtFim != null &&
      (
        !(dtFim instanceof Date) ||
        !Number.isFinite(
          dtFim.getTime()
        ) ||
        dtFim < dtInicio
      )
    )
  ) {
    return false;
  }

  const fimReal =
    dtFim ?? dtInicio;

  return (
    fimReal >= inicioMes &&
    dtInicio <= fimMes
  );
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

function lerAusenciasComPrazo(
  label,
  read,
  timeoutMs = 30000
) {
  let timer = null;

  const startedAt = Date.now();

  return Promise.race([
    Promise.resolve().then(read),

    new Promise((_resolve, reject) => {
      timer = setTimeout(() => {
        const error = new Error(
          label + " excedeu " + timeoutMs + " ms."
        );

        error.code = "SC_ABSENCES_READ_TIMEOUT";
        error.status = 503;

        console.warn(
          "[AUSÊNCIAS LEITURA]",
          {
            action: label,
            name: error.name,
            code: error.code,
            timeoutMs,
            durationMs:
              Date.now() - startedAt,
          }
        );

        reject(error);
      }, timeoutMs);
    }),
  ]).finally(() => {
    if (timer !== null) {
      clearTimeout(timer);
    }
  });
}

function gravarJsonAusenciasAtomico(
  file,
  value
) {
  const bytes = JSON.stringify(
    value,
    null,
    2
  );

  const temporary =
    file + "." + randomUUID() + ".tmp";

  fs.mkdirSync(
    path.dirname(file),
    {
      recursive: true,
    }
  );

  if (
    path.basename(file) ===
      "ausencias_dashboard.json" &&
    fs.existsSync(file)
  ) {
    const backup = path.join(
      path.dirname(file),
      "ausencias_dashboard.before-integrity.json"
    );

    try {
      fs.copyFileSync(
        file,
        backup,
        fs.constants.COPYFILE_EXCL
      );
    } catch (error) {
      if (error.code !== "EEXIST") {
        throw error;
      }
    }
  }

  try {
    fs.writeFileSync(
      temporary,
      bytes,
      {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      }
    );

    fs.renameSync(
      temporary,
      file
    );
  } finally {
    try {
      fs.unlinkSync(temporary);
    } catch (error) {
      if (error.code !== "ENOENT") {
        console.warn(
          "[AUSÊNCIAS JSON] Falha ao limpar temporário:",
          {
            code:
              error.code || null,
            name:
              error.name,
          }
        );
      }
    }
  }
}

function salvarSnapshotAusenciasMensal({
  mesNome,
  ano,
  mes,
  rankingOrdenado,
  totalAusencias,
}) {
  if (
    !Number.isInteger(ano) ||
    ano < 1000 ||
    ano > 9999 ||
    !Number.isInteger(mes) ||
    mes < 0 ||
    mes > 11 ||
    typeof mesNome !== "string" ||
    !mesNome.trim() ||
    !Array.isArray(rankingOrdenado) ||
    !Number.isSafeInteger(totalAusencias) ||
    totalAusencias < 0
  ) {
    throw new Error(
      "Período ou totais inválidos no snapshot de ausências."
    );
  }

  const expectedMonth =
    String(ano) + "-" + pad(mes + 1);

  const people = new Set();

  let computedTotal = 0;

  for (const record of rankingOrdenado) {
    if (
      !record ||
      typeof record !== "object" ||
      Array.isArray(record) ||
      typeof record.userId !== "string" ||
      !/^(?:\d{17,20}|nome:[a-z0-9]+(?: [a-z0-9]+)*)$/.test(
        record.userId
      ) ||
      typeof record.nome !== "string" ||
      !record.nome.trim() ||
      !Array.isArray(record.dias) ||
      !Number.isSafeInteger(record.total) ||
      record.total < 0
    ) {
      throw new Error(
        "Um registro do snapshot de ausências possui estrutura inválida."
      );
    }

    if (people.has(record.userId)) {
      throw new Error(
        "Uma pessoa aparece repetida no snapshot de ausências."
      );
    }

    people.add(record.userId);

    const days = new Set();

    const weeks = {
      "Primeira semana do mês": 0,
      "Segunda semana do mês": 0,
      "Terceira semana do mês": 0,
      "Quarta semana do mês": 0,
      "Quinta semana do mês": 0,
    };

    for (const day of record.dias) {
      if (
        typeof day !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(day)
      ) {
        throw new Error(
          "Um dia do snapshot de ausências possui formato inválido."
        );
      }

      const [
        year,
        month,
        date,
      ] = day.split("-").map(Number);

      const parsed = new Date(
        year,
        month - 1,
        date
      );

      if (
        day.slice(0, 7) !== expectedMonth ||
        parsed.getFullYear() !== year ||
        parsed.getMonth() !== month - 1 ||
        parsed.getDate() !== date ||
        days.has(day)
      ) {
        throw new Error(
          "O snapshot de ausências contém dia inválido, repetido ou fora do mês."
        );
      }

      days.add(day);

      weeks[
        nomeSemanaMes(date)
      ]++;
    }

    if (record.total !== days.size) {
      throw new Error(
        "O total de uma pessoa não corresponde aos dias de ausência."
      );
    }

    if (
      !record.semanas ||
      typeof record.semanas !== "object" ||
      Array.isArray(record.semanas) ||
      Object.keys(weeks).some(week =>
        record.semanas[week] !== weeks[week]
      )
    ) {
      throw new Error(
        "Os totais semanais não correspondem aos dias de ausência."
      );
    }

    computedTotal += record.total;
  }

  if (computedTotal !== totalAusencias) {
    throw new Error(
      "O total geral não corresponde ao ranking de ausências."
    );
  }

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
      Array.isArray(stored.months) ||
      Object.keys(stored.months).some(key =>
        !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(key)
      )
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

  gravarJsonAusenciasAtomico(
    file,
    stored
  );
}

const ausenciasSiteRecoveryRequestedAt =
  new WeakMap();

export function requestAbsencesSiteSnapshot(
  client,
  options = {}
) {
  if (
    !client ||
    typeof client.isReady !== 'function' ||
    !client.isReady()
  ) {
    if (
      options.requireFresh === true
    ) {
      return Promise.reject(
        Object.assign(
          new Error(
            'O bot não está pronto para atualizar as ausências.'
          ),
          {
            status: 503
          }
        )
      );
    }

    return;
  }

  const now =
    Date.now();

  const previous =
    ausenciasSiteRecoveryRequestedAt.get(
      client
    );

  if (
    options.requireFresh !== true &&
    previous !== undefined &&
    now >= previous &&
    now - previous < 60000
  ) {
    return;
  }

  ausenciasSiteRecoveryRequestedAt.set(
    client,
    now
  );

  return atualizarDashboardAusenciasMensal(
    client,
    options
  ).catch(error => {
    console.error(
      '[AUSÊNCIAS SITE] Falha ao gerar o snapshot:',
      error
    );

    if (
      options.requireFresh === true
    ) {
      throw error;
    }
  });
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
        let passes = 0;

        do {
          job.rerun = false;

          await executarAtualizacaoDashboardAusenciasMensal(
            client
          );

          passes++;
        } while (
          job.rerun &&
          passes < 2
        );

        if (job.rerun) {
          agendarDashboardAusencias(
            client
          );
        }
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

  if (
    ausenciasDashboardTimers.has(key)
  ) {
    return;
  }

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
    Array.isArray(stored.panels) ||
    Object.entries(stored.panels).some(
      ([key, id]) =>
        !/^\d{17,20}:\d{17,20}$/.test(key) ||
        typeof id !== "string" ||
        !/^\d{17,20}$/.test(id)
    )
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

  gravarJsonAusenciasAtomico(
    file,
    stored
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
        await lerAusenciasComPrazo(
          "dashboard.saved_panel:" +
            savedId,
          () => channel.messages.fetch(
            String(savedId)
          )
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
      await lerAusenciasComPrazo(
        "dashboard.panel_page:" +
          channel.id,
        () => channel.messages.fetch({
          limit: 100,
          ...(before
            ? { before }
            : {}),
        })
      );

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
    await lerAusenciasComPrazo(
      "dashboard.source_channel:" +
        AUSENCIAS_GERAIS_CHANNEL_ID,
      () => client.channels.fetch(
        AUSENCIAS_GERAIS_CHANNEL_ID
      )
    );

  if (
    !canalFonte?.isTextBased?.() ||
    !canalFonte.messages ||
    !canalFonte.guild
  ) {
    throw new Error(
      'O canal geral de ausências está indisponível ou não permite leitura de mensagens.'
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
      await lerAusenciasComPrazo(
        "dashboard.source_channel:" +
          canalFonteId,
        () => client.channels.fetch(
          canalFonteId
        )
      );

    if (
      !canalColeta?.isTextBased?.() ||
      !canalColeta.messages ||
      canalColeta.guildId !==
        canalFonte.guild.id
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
      msg.author?.id !== client.user.id ||
      normalizarChaveAusencia(
        embed.title
      ) !== 'registro de ausencia'
    ) {
      continue;
    }

    const nomeAusencia =
      extrairNomeAusencia(embed);

    const userId =
      resolverIdentidadeRegistroAusencia(
        msg,
        embed,
        nomeAusencia
      );

    if (!userId) {
      const explicitId =
        extrairCampoEmbed(
          embed,
          "ID Discord"
        );

      const mentionedIds = new Set(
        [
          ...String(
            msg.content || ""
          ).matchAll(
            /<@!?(\d{17,20})>/g
          ),
        ].map(match => match[1])
      );

      if (
        explicitId !== null ||
        mentionedIds.size > 1
      ) {
        continue;
      }

      if (
        !normalizarChaveAusencia(
          nomeAusencia
        )
      ) {
        continue;
      }
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

const dtInicio =
  parseDataBr(
    dataTxt,
    msg.createdTimestamp
  );

const dtFim =
  ateTxt
    ? parseDataBr(
        ateTxt,
        msg.createdTimestamp
      )
    : null;

if (!dtInicio) continue;
if (ateTxt && !dtFim) continue;
if (dtFim && dtFim < dtInicio) continue;

if (!intervaloAusenciaDentroDoMes(dtInicio, dtFim, inicioMes, fimMes)) {
  continue;
}

if (registrosUnicos.has(chaveRegistro)) continue;
registrosUnicos.add(chaveRegistro);

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
      ? await resolverNomeDashboardAusencias(client, canalFonte.guild, rankingId)
      : limparNomeRanking(String(rankingId).replace('nome:', ''));

    const membro =
      isDiscordUser
        ? canalFonte.guild.members.cache.get(
            String(rankingId)
          )
        : null;

    const usuario =
      isDiscordUser
        ? client.users.cache.get(
            String(rankingId)
          )
        : null;

    const dias =
      [...dados.dias].sort();

    rankingOrdenado.push({
      userId: rankingId,
      nome: nomeResolvido,
      total: dados.total,
      semanas: dados.semanas,
      dias,
      avatar:
        membro?.displayAvatarURL({
          size: 128
        }) ||
        usuario?.displayAvatarURL({
          size: 128
        }) ||
        null,
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

  client.emit(
    'scAbsencesSnapshotUpdated',
    {
      monthKey:
        String(agora.getFullYear()) +
        '-' +
        pad(agora.getMonth() + 1)
    }
  );

  const canalDestino =
    await lerAusenciasComPrazo(
      "dashboard.destination_channel:" +
        AUSENCIAS_DASHBOARD_CHANNEL_ID,
      () => client.channels.fetch(
        AUSENCIAS_DASHBOARD_CHANNEL_ID
      )
    );

  if (
    !canalDestino?.isTextBased?.() ||
    !canalDestino.messages
  ) {
    throw new Error(
      'O snapshot de ausências foi salvo, mas o canal de publicação do dashboard está indisponível.'
    );
  }

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
      { name: '🆔 ID Discord', value: String(user.id), inline: true },
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
  console.log(
    '[AUSÊNCIAS] Inicializando registros e snapshot mensal.'
  );

  if (!globalThis.__AUSENCIAS_DASHBOARD_INTERVAL__) {
    globalThis.__AUSENCIAS_DASHBOARD_INTERVAL__ =
      setInterval(() => {
        atualizarDashboardAusenciasMensal(client).catch(err => {
          console.error(
            '[AUSÊNCIAS DASHBOARD] erro ao atualizar dashboard mensal:',
            err
          );
        });
      }, 60 * 60 * 1000);
  }

  await atualizarDashboardAusenciasMensal(client).catch(err => {
    console.error(
      '[AUSÊNCIAS DASHBOARD] falha na geração inicial do snapshot:',
      err
    );
  });

  for (const canalId of Object.values(CANAIS_REGISTRO)) {
    try {
      await enviarBotaoFixoPorCanal(
        client,
        canalId
      );
    } catch (error) {
      console.error(
        `[AUSÊNCIAS] Não foi possível instalar o botão no canal ${canalId}:`,
        error
      );
    }
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

        const canalId = interaction.customId.replace(
          'modal_ausencia_',
          ''
        );

        if (
          !Object.values(
            CANAIS_REGISTRO
          ).includes(canalId)
        ) {
          await interaction.editReply({
            content:
              "❌ Este canal não está autorizado para registrar ausência.",
          });

          return true;
        }

        const membroAtual =
          await lerAusenciasComPrazo(
            "modal.member:" +
              interaction.user.id,
            () => interaction.guild.members.fetch({
              user:
                interaction.user.id,
              force:
                true,
            })
          );

        const autorizadoAgora =
          CARGOS_AUTORIZADOS_AUSENCIA.includes(
            interaction.user.id
          ) ||
          membroAtual.roles.cache.some(role =>
            CARGOS_AUTORIZADOS_AUSENCIA.includes(
              role.id
            )
          );

        if (!autorizadoAgora) {
          await interaction.editReply({
            content:
              "❌ Você não tem permissão para registrar ausência.",
          });

          return true;
        }

        const canalOrigem =
          await lerAusenciasComPrazo(
            "modal.origin_channel:" +
              canalId,
            () => client.channels.fetch(
              canalId
            )
          ).catch(() => null);

        if (!canalOrigem) {
          console.warn(`[AUSÊNCIAS] Canal de origem ${canalId} não encontrado.`);
        }

        const nome   = (interaction.fields.getTextInputValue('nome')     ?? '').trim().slice(0, 128);
        const data   = (interaction.fields.getTextInputValue('data')     ?? '').trim().slice(0, 64);
        const ate    = (interaction.fields.getTextInputValue('ate_data') ?? '').trim().slice(0, 64);
        const hora   = (interaction.fields.getTextInputValue('hora')     ?? '').trim().replace(/^(\d):/, '0$1:').slice(0, 64);
        const motivo = (interaction.fields.getTextInputValue('motivo')   ?? '').trim().slice(0, 1024);

        if (
          !nome ||
          !motivo ||
          !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(hora)
        ) {
          await interaction.editReply({
            content:
              "❌ Informe nome, motivo e um horário válido no formato HH:MM, de 00:00 a 23:59.",
          });

          return true;
        }
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