import fs from "node:fs";
import path from "node:path";
import cron from "node-cron";
import { EmbedBuilder } from "discord.js";

import {
  getFormsCreatorPersonData,
} from "./formscreator.js";

import {
  getStatsForUser,
  getWeeklyRanking,
} from "./scGeralWeeklyRanking.js";

import {
  generateSantaCreatorsStandaloneText,
} from "./iaChatAuto.js";

const TZ = "America/Sao_Paulo";

// =====================================================
// CARGOS ACOMPANHADOS
// =====================================================

const TARGET_ROLE_IDS = new Set([
  "1352429001188180039", // Equipe Creators
  "1352385500614234134", // Coordenação / Gestão
  "1414651836861907006", // Responsáveis
]);

// =====================================================
// ARQUIVOS
// =====================================================

function pickFeedbackPersistRoot() {
  const candidates = [
    process.env.SQUARECLOUD_STORAGE_PATH?.trim(),
    "/storage",
    "/home/container/storage",
    "/home/squarecloud/storage",
  ].filter(Boolean);

  for (
    const directory of
    candidates
  ) {
    try {
      if (
        fs.existsSync(
          directory
        )
      ) {
        return directory;
      }
    } catch {}
  }

  return null;
}

const APP_DATA_DIR =
  path.resolve(
    process.cwd(),
    "data"
  );

const PERSIST_DATA_DIR =
  path.resolve(
    pickFeedbackPersistRoot() ||
      process.cwd(),
    "data"
  );

// =====================================================
// CONTROLE GI
// =====================================================
//
// Mantém o mesmo local utilizado atualmente pelo GI.
//
const GI_DATA_FILE =
  path.join(
    APP_DATA_DIR,
    "sc_gi_registros.json"
  );

// =====================================================
// FONTES DO RANKING
// =====================================================
//
// Procura primeiro no storage persistente da Square Cloud
// e mantém /application/data como fallback.
//
// Assim o feedback consegue enxergar os mesmos registros
// que o Ranking está mostrando no painel.
//
const WEEKLY_SOURCES_FILES =
  [
    path.join(
      PERSIST_DATA_DIR,
      "sc_geral_weekly_rank_sources.json"
    ),

    path.join(
      APP_DATA_DIR,
      "sc_geral_weekly_rank_sources.json"
    ),
  ].filter(
    (
      file,
      index,
      array
    ) =>
      array.indexOf(
        file
      ) === index
  );

// =====================================================
// ESTADO DO FEEDBACK
// =====================================================
//
// O estado dos comentários fica persistente para sobreviver
// a restart/deploy quando storage estiver disponível.
//
const FEEDBACK_STATE_FILE =
  path.join(
    PERSIST_DATA_DIR,
    "sc_weekly_member_ai_feedback.json"
  );

// Compatibilidade com funções existentes que utilizam DATA_DIR.
const DATA_DIR =
  PERSIST_DATA_DIR;
// =====================================================
// CONFIGURAÇÃO
// =====================================================

const FEEDBACK_MARKER =
  "SC_WEEKLY_MEMBER_AI_FEEDBACK::V1";

const AUTOMATIC_CRON =
  "30 22 * * 6";

const runningKeys =
  new Set();

let schedulerStarted =
  false;

// =====================================================
// CACHE DE ATUALIZAÇÃO DO RANKING
// =====================================================
//
// Antes de montar um feedback, força uma leitura atual
// do Ranking Semanal.
//
// O cache evita que o fechamento automático de sábado
// execute uma varredura pesada para CADA membro.
//
let rankingRefreshPromise =
  null;

let rankingRefreshAt =
  0;

// =====================================================
// ✅ ÚLTIMO RANKING REAL CARREGADO
// =====================================================
//
// Além de controlar o cache, agora preservamos o resultado
// obtido pelo próprio getWeeklyRanking().
//
// Assim cada feedback consegue descobrir posição, pontos
// e fontes da pessoa sem executar outra leitura completa.
//
let rankingRefreshValue =
  [];

const RANKING_REFRESH_CACHE_MS =
  2 * 60 * 1000;

async function ensureWeeklyRankingFresh(
  client
) {
  const now =
    Date.now();

  if (
    rankingRefreshAt &&
    now - rankingRefreshAt <
      RANKING_REFRESH_CACHE_MS
  ) {
    return rankingRefreshValue;
  }

  if (
    rankingRefreshPromise
  ) {
    return await rankingRefreshPromise;
  }

  rankingRefreshPromise =
    Promise.resolve()
      .then(
        async () => {
          const ranking =
            await getWeeklyRanking(
              client
            );

          rankingRefreshValue =
            Array.isArray(
              ranking
            )
              ? ranking
              : [];

          return rankingRefreshValue;
        }
      )
      .catch(
        error => {
          console.warn(
            "[Weekly Member Feedback] Não foi possível atualizar o Ranking antes do feedback:",
            error?.message ||
              error
          );

          return rankingRefreshValue;
        }
      )
      .finally(
        () => {
          rankingRefreshAt =
            Date.now();

          rankingRefreshPromise =
            null;
        }
      );

  return await rankingRefreshPromise;
}

// =====================================================
// NOMES AMIGÁVEIS DAS FONTES
// =====================================================

const SOURCE_LABELS = {
  manager:
    "Registro Manager",

  pagamentos:
    "Pagamentos",

  bateponto:
    "Bate Ponto",

  poderes:
    "Registro de Poderes",

  poderesdias:
    "Dias com Registro de Poderes",

  eventos:
    "Eventos",

  eventopoder:
    "Eventos de Poder",

  eventosdiarios:
    "Eventos Diários",

  halldafama:
    "Hall da Fama",

  cronograma:
    "Cronograma",

  presenca:
    "Presença",

  presencas:
    "Presença",

  alinhamentos:
    "Alinhamentos",

  orgs:
    "Registros de Organizações",

  confirmacoes:
    "Confirmações de Presença",

  convites:
    "Convites para Líderes",

  doacoes:
    "Doações",

  vendas:
    "Vendas",

  perguntas:
    "Quiz e Perguntas",

  correcao:
    "Correções",

  vippagos:
    "VIPs e Premiações",

  tickets:
    "Tickets",

  ticket:
    "Tickets",

  atendimentos:
    "Atendimentos",

  atendimento:
    "Atendimentos",
};

// =====================================================
// PERSISTÊNCIA
// =====================================================

function ensureDataDir() {
  if (
    !fs.existsSync(
      DATA_DIR
    )
  ) {
    fs.mkdirSync(
      DATA_DIR,
      {
        recursive: true,
      }
    );
  }
}

function readJson(
  file,
  fallback
) {
  try {
    if (
      !fs.existsSync(
        file
      )
    ) {
      return fallback;
    }

    const raw =
      fs.readFileSync(
        file,
        "utf8"
      );

    if (
      !raw.trim()
    ) {
      return fallback;
    }

    return JSON.parse(
      raw
    );
  } catch (error) {
    console.error(
      `[Weekly Member AI] Erro ao ler ${file}:`,
      error
    );

    return fallback;
  }
}

function writeJson(
  file,
  value
) {
  try {
    ensureDataDir();

    const temporaryFile =
      `${file}.tmp`;

    fs.writeFileSync(
      temporaryFile,
      JSON.stringify(
        value,
        null,
        2
      ),
      "utf8"
    );

    fs.renameSync(
      temporaryFile,
      file
    );
  } catch (error) {
    console.error(
      `[Weekly Member AI] Erro ao salvar ${file}:`,
      error
    );
  }
}

function loadFeedbackState() {
  const state =
    readJson(
      FEEDBACK_STATE_FILE,
      {}
    );

  return {
    version: 1,

    manual:
      state?.manual &&
      typeof state.manual ===
        "object"
        ? state.manual
        : {},

    automatic:
      state?.automatic &&
      typeof state.automatic ===
        "object"
        ? state.automatic
        : {},
  };
}

function saveFeedbackState(
  state
) {
  writeJson(
    FEEDBACK_STATE_FILE,
    state
  );
}

// =====================================================
// SEMANA OPERACIONAL
// =====================================================

function getSpParts(
  reference = new Date()
) {
  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          TZ,

        year:
          "numeric",

        month:
          "2-digit",

        day:
          "2-digit",

        weekday:
          "short",

        hour:
          "2-digit",

        minute:
          "2-digit",

        hourCycle:
          "h23",
      }
    ).formatToParts(
      reference
    );

  const get =
    type =>
      parts.find(
        part =>
          part.type === type
      )?.value;

  return {
    year:
      Number(
        get("year")
      ),

    month:
      Number(
        get("month")
      ),

    day:
      Number(
        get("day")
      ),

    weekday:
      get("weekday"),

    hour:
      Number(
        get("hour") || 0
      ),

    minute:
      Number(
        get("minute") || 0
      ),
  };
}

function getWeekKeySP(
  reference = new Date()
) {
  const parts =
    getSpParts(
      reference
    );

  const weekdayMap = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  const weekday =
    weekdayMap[
      parts.weekday
    ] ?? 0;

  const currentDay =
    new Date(
      Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        3,
        0,
        0
      )
    );

  currentDay.setUTCDate(
    currentDay.getUTCDate() -
    weekday
  );

  return currentDay
    .toISOString()
    .slice(
      0,
      10
    );
}

function addDaysToWeekKey(
  weekKey,
  amount
) {
  const date =
    new Date(
      `${weekKey}T03:00:00.000Z`
    );

  date.setUTCDate(
    date.getUTCDate() +
    amount
  );

  return date
    .toISOString()
    .slice(
      0,
      10
    );
}

function formatWeekLabel(
  weekKey
) {
  const start =
    new Date(
      `${weekKey}T03:00:00.000Z`
    );

  const end =
    new Date(
      start
    );

  end.setUTCDate(
    end.getUTCDate() +
    6
  );

  const format =
    date =>
      new Intl.DateTimeFormat(
        "pt-BR",
        {
          timeZone:
            TZ,

          day:
            "2-digit",

          month:
            "2-digit",
        }
      ).format(
        date
      );

  return (
    `${format(start)} a ${format(end)}`
  );
}

// =====================================================


function formatAnalyzedPeriodLabel(
  weekKey,
  reference =
    new Date()
) {
  const start =
    new Date(
      `${weekKey}T03:00:00.000Z`
    );

  const theoreticalEnd =
    new Date(
      start
    );

  theoreticalEnd.setUTCDate(
    theoreticalEnd.getUTCDate() +
      6
  );

  theoreticalEnd.setUTCHours(
    26,
    59,
    59,
    999
  );

  const now =
    reference instanceof Date
      ? reference
      : new Date(
          reference
        );

  const realEnd =
    now.getTime() <
    theoreticalEnd.getTime()
      ? now
      : theoreticalEnd;

  const format =
    date =>
      new Intl.DateTimeFormat(
        "pt-BR",
        {
          timeZone:
            TZ,

          day:
            "2-digit",

          month:
            "2-digit",
        }
      ).format(
        date
      );

  return (
    `${format(start)} a ${format(realEnd)}`
  );
}



// FONTES DO RANKING / NPS
// =====================================================

function normalizeSourceName(
  value
) {
  return String(
    value || ""
  )
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(
      /[\s_-]+/g,
      ""
    );
}

function getSourceLabel(
  sourceName
) {
  const normalized =
    normalizeSourceName(
      sourceName
    );

  return (
    SOURCE_LABELS[
      normalized
    ] ||
    sourceName ||
    "Outra atividade"
  );
}

function normalizeSourceBucket(
  raw
) {
  if (
    !raw ||
    typeof raw !==
      "object"
  ) {
    return {};
  }

  const result = {};

  for (
    const [
      sourceName,
      amountRaw,
    ]
    of Object.entries(
      raw
    )
  ) {
    const amount =
      Math.max(
        0,
        Number(
          amountRaw || 0
        )
      );

    if (
      !Number.isFinite(
        amount
      ) ||
      amount <= 0
    ) {
      continue;
    }

    result[
      sourceName
    ] = amount;
  }

  return result;
}

function getUserWeekSources(
  userId,
  weekKey
) {
  let bestBucket =
    {};

  let bestTotal =
    0;

  for (
    const sourceFile of
    WEEKLY_SOURCES_FILES
  ) {
    const allWeeks =
      readJson(
        sourceFile,
        {}
      );

    const bucket =
      normalizeSourceBucket(
        allWeeks?.[
          weekKey
        ]?.[
          String(
            userId
          )
        ] || {}
      );

    const total =
      sumSources(
        bucket
      );

    /*
     * Pode existir uma cópia antiga em /application/data
     * e uma mais atual em /storage/data.
     *
     * Não soma os dois arquivos porque seriam as mesmas
     * atividades duplicadas.
     *
     * Utiliza a leitura mais completa.
     */
    if (
      total >
      bestTotal
    ) {
      bestBucket =
        bucket;

      bestTotal =
        total;
    }
  }

  return bestBucket;
}

function sumSources(
  sources
) {
  return Object.values(
    sources || {}
  ).reduce(
    (
      total,
      value
    ) =>
      total +
      Math.max(
        0,
        Number(
          value || 0
        )
      ),
    0
  );
}

function formatSourcesForPrompt(
  sources
) {
  const entries =
    Object.entries(
      sources || {}
    )
      .map(
        ([
          sourceName,
          amount,
        ]) => ({
          sourceName,

          label:
            getSourceLabel(
              sourceName
            ),

          amount:
            Number(
              amount || 0
            ),
        })
      )
      .filter(
        item =>
          item.amount >
          0
      )
      .sort(
        (
          a,
          b
        ) =>
          b.amount -
          a.amount
      );

  if (
    !entries.length
  ) {
    return (
      "- Nenhuma atividade individual consolidada foi localizada nesta semana."
    );
  }

  return entries
    .map(
      item =>
        `- ${item.label}: ${item.amount}`
    )
    .join(
      "\n"
    );
}

// =====================================================
// CONTROLE GI
// =====================================================

function hasTargetRole(
  member
) {
  return Boolean(
    member?.roles?.cache?.some(
      role =>
        TARGET_ROLE_IDS.has(
          role.id
        )
    )
  );
}

function getLatestGiRecords(
  guildId
) {
  const data =
    readJson(
      GI_DATA_FILE,
      {}
    );

  const records =
    Array.isArray(
      data?.registros
    )
      ? data.registros
      : [];

  const latestByUser =
    new Map();

  for (
    const record of
    records
  ) {
    if (
      String(
        record?.guildId ||
        ""
      ) !==
      String(
        guildId || ""
      )
    ) {
      continue;
    }

    const targetId =
      String(
        record?.targetId ||
        ""
      ).trim();

    if (
      !targetId
    ) {
      continue;
    }

    const previous =
      latestByUser.get(
        targetId
      );

    if (
      !previous ||
      Number(
        record?.createdAtMs ||
        0
      ) >
      Number(
        previous?.createdAtMs ||
        0
      )
    ) {
      latestByUser.set(
        targetId,
        record
      );
    }
  }

  return [
    ...latestByUser.values(),
  ];
}

// =====================================================
// HISTÓRICO DO FORMS PESSOAL
// =====================================================

function messageToContextLine(
  message
) {
  const parts = [];

  if (
    message?.content
  ) {
    parts.push(
      String(
        message.content
      )
        .replace(
          /\s+/g,
          " "
        )
        .trim()
    );
  }

  for (
    const embed of
    message?.embeds || []
  ) {
    if (
      embed?.title
    ) {
      parts.push(
        `Título: ${embed.title}`
      );
    }

    if (
      embed?.description
    ) {
      parts.push(
        String(
          embed.description
        )
          .replace(
            /\s+/g,
            " "
          )
          .trim()
      );
    }

    for (
      const field of
      embed?.fields || []
    ) {
      parts.push(
        `${field.name}: ${String(
          field.value || ""
        )
          .replace(
            /\s+/g,
            " "
          )
          .trim()}`
      );
    }
  }

  const text =
    parts
      .filter(
        Boolean
      )
      .join(
        " | "
      )
      .slice(
        0,
        1300
      );

  if (
    !text
  ) {
    return null;
  }

  const author =
    message?.member
      ?.displayName ||
    message?.author
      ?.globalName ||
    message?.author
      ?.username ||
    message?.author
      ?.id ||
    "Autor não identificado";

  const date =
    new Date(
      Number(
        message
          ?.createdTimestamp ||
        Date.now()
      )
    ).toLocaleString(
      "pt-BR",
      {
        timeZone:
          TZ,
      }
    );

  return (
    `${date} | ${author}: ${text}`
  );
}

function isOurFeedbackMessage(
  message
) {
  const raw = [
    message?.content ||
      "",

    ...(
      message?.embeds ||
      []
    ).flatMap(
      embed => [
        embed?.title ||
          "",

        embed?.description ||
          "",

        embed?.footer
          ?.text ||
          "",
      ]
    ),
  ].join(
    "\n"
  );

  const authoredByBot =
    message?.author?.id &&
    message?.client?.user?.id &&
    message.author.id ===
      message.client.user.id;

  if (
    !authoredByBot
  ) {
    return false;
  }

  // Compatibilidade com comentários antigos.
  if (
    raw.includes(
      FEEDBACK_MARKER
    )
  ) {
    return true;
  }

  // Comentários novos não precisam exibir marker técnico.
  return (
    raw.includes(
      "💬 Um retorno sobre sua semana"
    ) ||
    raw.includes(
      "🌟 Fechando sua semana"
    )
  );
}

async function collectFormsHistory(
  thread,
  weekKey
) {
  if (
    !thread
      ?.isTextBased
      ?.()
  ) {
    return {
      currentWeek: [],
      previousContext: [],
      totalScanned: 0,
    };
  }

  const collected =
    new Map();

  let before =
    null;

  // =====================================================
  // VARREDURA DE ATÉ 300 MENSAGENS DO FORMS
  // =====================================================
  //
  // Isso permite enxergar registros, alinhamentos,
  // comentários e avaliações que poderiam ficar fora
  // das últimas 100 mensagens.
  //
  for (
    let page = 0;
    page < 3;
    page++
  ) {
    const options = {
      limit: 100,
    };

    if (
      before
    ) {
      options.before =
        before;
    }

    const batch =
      await thread
        .messages
        .fetch(
          options
        )
        .catch(
          () => null
        );

    if (
      !batch ||
      batch.size ===
        0
    ) {
      break;
    }

    for (
      const message of
      batch.values()
    ) {
      collected.set(
        message.id,
        message
      );
    }

    const oldest =
      batch.last();

    before =
      oldest?.id ||
      null;

    if (
      batch.size <
      100
    ) {
      break;
    }
  }

  const weekStartMs =
    new Date(
      `${weekKey}T03:00:00.000Z`
    ).getTime();

  const nowMs =
    Date.now();

  const previousCutoff =
    weekStartMs -
    45 *
      24 *
      60 *
      60 *
      1000;

  const ordered =
    [
      ...collected.values(),
    ]
      .filter(
        message =>
          !isOurFeedbackMessage(
            message
          )
      )
      .sort(
        (
          a,
          b
        ) =>
          Number(
            a.createdTimestamp ||
              0
          ) -
          Number(
            b.createdTimestamp ||
              0
          )
      );

  const currentWeek =
    ordered
      .filter(
        message => {
          const timestamp =
            Number(
              message
                .createdTimestamp ||
                0
            );

          return (
            timestamp >=
              weekStartMs &&
            timestamp <=
              nowMs
          );
        }
      )
      .map(
        messageToContextLine
      )
      .filter(
        Boolean
      )
      .slice(
        -50
      );

  const previousContext =
    ordered
      .filter(
        message => {
          const timestamp =
            Number(
              message
                .createdTimestamp ||
                0
            );

          return (
            timestamp <
              weekStartMs &&
            timestamp >=
              previousCutoff
          );
        }
      )
      .map(
        messageToContextLine
      )
      .filter(
        Boolean
      )
      .slice(
        -20
      );

  return {
    currentWeek,
    previousContext,

    totalScanned:
      collected.size,
  };
}

// =====================================================
// COLETA INDIVIDUAL
// =====================================================

async function collectMemberFacts({
  client,
  guild,
  record,
  weekKey,
}) {
  const userId =
    String(
      record.targetId
    );

  const previousWeekKey =
    addDaysToWeekKey(
      weekKey,
      -7
    );

  // =====================================================
  // 1. ATUALIZA PRIMEIRO AS FONTES VIVAS DO RANKING
  // =====================================================
  //
  // Isso evita montar o feedback em cima de um JSON
  // antigo antes de o Ranking fazer sua leitura atual.
  //
  const weeklyRanking =
    await ensureWeeklyRankingFresh(
      client
    );

  const rankingStats =
    await getStatsForUser(
      client,
      userId
    ).catch(
      () => null
    );

  // =====================================================
  // ✅ POSIÇÃO REAL DA PESSOA NA SEMANA ATUAL
  // =====================================================

  const rankingIndex =
    Array.isArray(
      weeklyRanking
    )
      ? weeklyRanking.findIndex(
          item =>
            String(
              item?.userId ||
              ""
            ) ===
            userId
        )
      : -1;

  const rankingEntry =
    rankingIndex >=
    0
      ? weeklyRanking[
          rankingIndex
        ]
      : null;

  const rankingPosition =
    rankingIndex >=
    0
      ? rankingIndex + 1
      : null;

  const rankingSize =
    Array.isArray(
      weeklyRanking
    )
      ? weeklyRanking.length
      : 0;

  const rankingPoints =
    rankingEntry
      ? Math.max(
          0,
          Number(
            rankingEntry
              ?.points ||
            0
          )
        )
      : 0;

  // =====================================================
  // 2. SÓ DEPOIS RELEIA O CONSOLIDADO
  // =====================================================
  const currentSources =
    getUserWeekSources(
      userId,
      weekKey
    );

  const previousSources =
    getUserWeekSources(
      userId,
      previousWeekKey
    );

  const formsData =
    await getFormsCreatorPersonData(
      client,
      userId
    ).catch(
      () => null
    );

  const formsThread =
    formsData?.threadId
      ? await client
          .channels
          .fetch(
            formsData.threadId
          )
          .catch(
            () => null
          )
      : null;

  const formsHistory =
    await collectFormsHistory(
      formsThread,
      weekKey
    );

  const member =
    await guild
      .members
      .fetch(
        userId
      )
      .catch(
        () => null
      );

  const consolidatedCurrentTotal =
    sumSources(
      currentSources
    );

  const rankingCurrentTotal =
    Math.max(
      0,
      Number(
        rankingStats
          ?.thisWeekPoints ||
          0
      )
    );

  // Se uma das fontes estiver mais atualizada que a outra,
  // utiliza a maior leitura sem somar as duas.
  //
  // Isso evita duplicar atividade.
  const currentTotal =
    Math.max(
      consolidatedCurrentTotal,
      rankingCurrentTotal,
      rankingPoints
    );

  // =====================================================
  // CONTEXTO DO PROCESSO NO CONTROLE GI
  // =====================================================

  const giCreatedAtMs =
    Number(
      record?.createdAtMs ||
      0
    );

  const giJoinDateMs =
    Number(
      record?.joinDateMs ||
      0
    );

  const giReferenceStartMs =
    giCreatedAtMs >
    0
      ? giCreatedAtMs
      : giJoinDateMs;

  const giDaysInProcess =
    giReferenceStartMs >
    0
      ? Math.max(
          0,
          Math.floor(
            (
              Date.now() -
              giReferenceStartMs
            ) /
            (
              24 *
              60 *
              60 *
              1000
            )
          )
        )
      : null;

  const responsibleUserId =
    record
      ?.responsibleUserId
      ? String(
          record.responsibleUserId
        )
      : null;

  const responsibleType =
    record
      ?.responsibleType ||
    null;

  const giNote =
    String(
      record?.note ||
      ""
    )
      .trim()
      .slice(
        0,
        1500
      );

  return {
    userId,

    displayName:
      member
        ?.displayName ||
      formsData?.nome ||
      userId,

    area:
      formsData?.area ||
      record?.area ||
      "Não informada",

    giActive:
      record?.active !==
      false,

    giCreatedAtMs,

    giJoinDateMs,

    giDaysInProcess,

    responsibleUserId,

    responsibleType,

    giNote,

    currentSources,

    previousSources,

    currentTotal,

    consolidatedCurrentTotal,

    rankingCurrentTotal,

    previousTotal:
      sumSources(
        previousSources
      ),

    formsData,

    formsThread,

    formsHistory:
      formsHistory.currentWeek,

    previousFormsHistory:
      formsHistory.previousContext,

    formsMessagesScanned:
      formsHistory.totalScanned,

    rankingStats,

    rankingEntry,

    rankingPosition,

    rankingSize,

    rankingPoints,

    weekKey,

    previousWeekKey,

    analyzedPeriod:
      formatAnalyzedPeriodLabel(
        weekKey
      ),
  };
}

// =====================================================
// PROMPT DA IA
// =====================================================

function buildFeedbackPrompt({
  facts,
  previousManualText = "",
  mode,
}) {
  const currentFormsHistory =
    Array.isArray(
      facts.formsHistory
    ) &&
    facts.formsHistory.length
      ? facts.formsHistory
          .join("\n")
          .slice(
            0,
            16000
          )
      : (
        "Nenhum registro ou comentário do Forms foi localizado no período já transcorrido desta semana."
      );

  const previousFormsHistory =
    Array.isArray(
      facts.previousFormsHistory
    ) &&
    facts.previousFormsHistory.length
      ? facts.previousFormsHistory
          .join("\n")
          .slice(
            0,
            10000
          )
      : (
        "Nenhum histórico anterior relevante foi localizado no Forms."
      );

  const rankingCurrentPoints =
    Math.max(
      0,
      Number(
        facts
          ?.rankingStats
          ?.thisWeekPoints ||
        0
      )
    );

  const rankingHistory =
    facts?.rankingStats
      ? [
          `Pontos localizados especificamente nesta semana: ${rankingCurrentPoints}`,

          `Total histórico localizado no Ranking: ${Number(
            facts.rankingStats.total ||
            0
          )}`,

          `Histórico das semanas anteriores: ${
            (
              facts
                .rankingStats
                .weeksFormatted ||
              []
            )
              .slice(
                0,
                10
              )
              .join(" | ") ||
            "sem histórico semanal disponível"
          }`,
        ].join("\n")
      : (
        "Ranking detalhado indisponível neste momento."
      );

  return `
Você vai escrever diretamente para ${facts.displayName}.

O texto será colocado no acompanhamento pessoal dessa pessoa dentro da SantaCreators.

Sua tarefa NÃO é produzir um relatório.

Sua tarefa é deixar um feedback humano sobre como está sendo o processo da pessoa.

A mensagem deve parecer escrita por alguém da gestão que realmente conhece e acompanha a pessoa.

Não diga que é IA.
Não diga que fez análise automática.
Não diga que consultou sistemas.
Não diga que recebeu dados.

=====================================================
PERÍODO QUE REALMENTE ACONTECEU
=====================================================

Os fatos desta análise vão somente de:

${facts.analyzedPeriod}

Hoje ainda estamos dentro da semana.

Nunca trate dias futuros como se já tivessem acontecido.

Nunca faça avaliação sobre terça, quarta, quinta, sexta ou sábado se esses dias ainda não aconteceram.

${
  mode === "manual"
    ? `
Este feedback está sendo feito DURANTE a semana.

Portanto ele representa como a pessoa está indo ATÉ AGORA.

A semana ainda pode mudar.
`
    : `
Este feedback está sendo feito no fechamento de sábado.

A semana já está praticamente concluída e pode ser tratada como fechamento.
`
}

=====================================================
QUEM É A PESSOA NO PROCESSO
=====================================================

Nome:
${facts.displayName}

Área atual:
${facts.area}

Controle GI:
${facts.giActive ? "ativo" : "pausado"}

Tempo aproximado neste acompanhamento:
${
  Number.isFinite(
    facts.giDaysInProcess
  )
    ? `${facts.giDaysInProcess} dia(s)`
    : "não localizado"
}

Responsável direto cadastrado:
${
  facts.responsibleUserId
    ? `<@${facts.responsibleUserId}>`
    : "não definido"
}

Tipo de responsável:
${
  facts.responsibleType ||
  "não definido"
}

Observação existente no Controle GI:
${
  facts.giNote ||
  "nenhuma observação cadastrada"
}

=====================================================
O QUE ELA FEZ NESTA SEMANA
=====================================================

${formatSourcesForPrompt(
  facts.currentSources
)}

Total de atividade atualmente considerado:
${facts.currentTotal}

Leitura do consolidado:
${facts.consolidatedCurrentTotal}

Leitura atual do Ranking:
${facts.rankingCurrentTotal}

ATENÇÃO:

Ranking e consolidado podem estar falando das mesmas atividades.

NUNCA some esses valores.

Eles servem apenas para confirmar o que foi localizado.

=====================================================
O QUE APARECEU NO FORMS NESTA SEMANA
=====================================================

${currentFormsHistory}

=====================================================
HISTÓRICO ANTERIOR DO PROCESSO DA PESSOA
=====================================================

${previousFormsHistory}

Esse histórico é MUITO IMPORTANTE.

Use-o para entender o processo da pessoa ao longo do tempo.

Observe principalmente:

- orientações que ela recebeu;
- elogios anteriores;
- cobranças anteriores;
- pontos que ela precisava melhorar;
- coisas que ela já melhorou;
- erros que continuam aparecendo;
- comportamentos positivos que continuam acontecendo;
- evolução desde comentários anteriores.

Mas nunca diga que algo antigo aconteceu nesta semana se não aconteceu.

=====================================================
HISTÓRICO DO RANKING
=====================================================

${rankingHistory}
=====================================================
POSIÇÃO ATUAL DA PESSOA NA SEMANA
=====================================================

${
  Number.isFinite(
    facts.rankingPosition
  )
    ? `Posição atual: ${facts.rankingPosition}º de ${facts.rankingSize} pessoa(s) pontuada(s)

Pontuação atual confirmada pelo ranking:
${facts.rankingPoints}`
    : `A pessoa não possui posição atual confirmada no ranking retornado nesta consulta.`
}

IMPORTANTE:

- A posição atual serve como contexto para entender o peso da atividade da pessoa dentro da equipe.
- Não transforme o feedback em placar.
- Se estiver nas primeiras posições, reconheça isso naturalmente quando for relevante.
- Se estiver em 1º lugar, NÃO descreva a pessoa como pouco ativa, apagada ou parada se os próprios registros atuais confirmarem atividade.
- Não considere posição alta como prova automática de qualidade.
- Use as fontes individuais para explicar de onde veio essa movimentação.
=====================================================
SEMANA ANTERIOR
=====================================================

Atividades:

${formatSourcesForPrompt(
  facts.previousSources
)}

Total:
${facts.previousTotal}

Compare somente quando existir base real.

=====================================================
FEEDBACK MANUAL ANTERIOR DESTA SEMANA
=====================================================

${
  previousManualText
    ? previousManualText
    : "Nenhum feedback manual anterior foi feito nesta semana."
}

${
  previousManualText
    ? `
Se existiu feedback anterior nesta mesma semana, descubra o que mudou depois dele.

Não copie o comentário anterior.

Não reescreva apenas com outras palavras.

Atualize a leitura com os novos acontecimentos.
`
    : ""
}

=====================================================
COMO PENSAR SOBRE A PESSOA
=====================================================

Antes de escrever, faça internamente esta análise:

1. O que essa pessoa realmente fez nesta semana?

2. Em quais atividades ela mais apareceu?

3. Existe algum destaque concreto?

4. Existe alguma atividade que ela costuma fazer e nesta semana ainda não apareceu?

5. Comparando com a semana passada, ela:
   - aumentou participação;
   - manteve;
   - caiu;
   - ou ainda não existe dado suficiente?

6. Existe alguma orientação antiga no Forms?

7. Essa orientação parece ter sido seguida?

8. Existe algum problema que já apareceu antes e continua acontecendo?

9. Existe algo positivo recorrente no comportamento dela?

10. O que seria uma orientação realmente útil para essa pessoa agora?

Use essas respostas somente para construir a mensagem.

Não exponha esse raciocínio.

=====================================================
REGRAS DE VERDADE
=====================================================

Use SOMENTE informações apresentadas acima.

Não invente absolutamente nada.

Não invente presença.

Não invente quantidade de dias.

Não invente ticket.

Não invente atendimento.

Não invente Manager.

Não invente pagamento.

Não invente Poderes.

Não invente evento.

Não invente Hall da Fama.

Não invente cronograma.

Não invente alinhamento.

Não invente comportamento.

Não invente melhora.

Não invente problema.

Não invente cobrança.

Não invente elogio.

Não invente comparação.

Se não existe prova, não afirme.

=====================================================
PRESENÇA
=====================================================

Bate Ponto representa presença da equipe.

Mas:

3 Bate Pontos NÃO significam automaticamente 3 dias.

Somente diga quantos dias diferentes a pessoa esteve presente se existirem datas diferentes comprovando isso.

Se houver apenas quantidade de Bate Ponto, pode dizer:

"você apareceu no Bate Ponto"

ou

"teve presença registrada"

mas NÃO invente número de dias.

=====================================================
TICKETS
=====================================================

Só diga que a pessoa atendeu tickets quando existir registro explícito de:

ticket
atendimento
chamado atendido

Se não aparecer essa informação, não mencione tickets.

=====================================================
ATIVIDADES
=====================================================

Se houver atividades reais, cite-as naturalmente.

Por exemplo, se houver:

Manager: 3
Pagamentos: 2
Hall da Fama: 1

não diga apenas:

"você participou bastante."

Diga naturalmente algo próximo de:

"Vi bastante movimentação sua em Manager, você também apareceu nos pagamentos e ainda teve registro no Hall da Fama."

Não copie esse exemplo literalmente.

Adapte à pessoa.

=====================================================
PROCESSO E EVOLUÇÃO
=====================================================

O principal objetivo NÃO é apenas contar atividades.

O objetivo é falar sobre o PROCESSO da pessoa.

Se o Forms mostrar que anteriormente ela recebeu uma orientação e agora existem sinais concretos de melhora, reconheça isso.

Se uma cobrança antiga continua fazendo sentido, pode lembrá-la de forma leve.

Se existirem elogios recorrentes, reconheça a consistência.

Se a pessoa estiver começando agora, não faça uma avaliação definitiva.

Se houver poucos dados, deixe claro que ainda é cedo para uma leitura completa.

Nunca julgue caráter.

Nunca faça crítica pessoal.

Fale de participação, organização, registros, evolução e comportamento operacional documentado.

=====================================================
LEITURA HUMANA E LONGITUDINAL OBRIGATÓRIA
=====================================================

Você não está avaliando apenas uma fotografia desta semana.

Quando houver histórico suficiente, acompanhe a TRAJETÓRIA da pessoa.

O Forms pode possuir:

- alinhamentos;
- comentários de responsáveis;
- elogios;
- cobranças;
- observações de acompanhamento;
- orientações;
- avaliações;
- registros antigos;
- registros novos.

Essas informações não devem ser tratadas como blocos isolados.

Você deve entender o que veio ANTES e o que aconteceu DEPOIS.

Antes de escrever a resposta final, confronte internamente:

1. feedbacks e alinhamentos anteriores;

2. registros posteriores a esses feedbacks;

3. atividades atuais;

4. posição atual da pessoa;

5. distribuição das atividades;

6. registros e comentários desta semana;

7. orientações que já haviam sido dadas;

8. sinais posteriores relacionados a essas orientações.

Pergunte internamente:

- O que já haviam elogiado nessa pessoa?

- Esse ponto positivo continua aparecendo?

- O que haviam pedido para ela melhorar?

- Existem acontecimentos posteriores relacionados àquilo?

- Existe evidência concreta de melhora?

- Existe evidência concreta de que o problema continua?

- Existe evidência de que aquele ponto deixou de aparecer?

- Ainda é cedo para saber?

- Depois do último feedback, a pessoa aumentou a movimentação?

- Depois de uma orientação específica, apareceu alguma mudança relacionada?

- Alguma preocupação antiga deixou de aparecer?

- Alguma preocupação antiga voltou a aparecer?

- Algum elogio antigo continua sendo sustentado por acontecimentos novos?

- O perfil atual está mais consistente?

- A atuação ficou mais diversificada?

- A atuação ficou mais concentrada em determinada frente?

- A pessoa está colocando em prática aquilo que anteriormente estava aprendendo?

NÃO exponha essas perguntas.

Use-as somente para construir o comentário final.

=====================================================
ORDEM TEMPORAL DOS FEEDBACKS
=====================================================

Datas importam.

Um comentário antigo NÃO pode ser utilizado como se tivesse sido escrito depois de uma atividade nova.

Sempre entenda a ordem:

FEEDBACK / ORIENTAÇÃO
↓
ACONTECIMENTOS POSTERIORES
↓
LEITURA ATUAL

Exemplo conceitual:

Se anteriormente alguém escreveu que a pessoa:

"entendeu bem, mas ainda possuía dúvidas e precisava de acompanhamento"

e DEPOIS disso aparecem muitos registros daquela mesma função,

isso permite dizer que ela continuou praticando aquela frente.

Mas quantidade sozinha NÃO permite afirmar automaticamente que todas as dúvidas foram resolvidas.

Nesse caso, uma leitura correta seria reconhecer que houve prática e movimentação posterior, enquanto a qualidade/autonomia ainda precisa ser confirmada pelos retornos humanos.

Nunca copie esse exemplo literalmente.

Use a mesma lógica sobre os fatos reais da pessoa analisada.

=====================================================
FEEDBACK HUMANO TEM SIGNIFICADO
=====================================================

Não conte comentários humanos apenas como quantidade.

Se existirem comentários de responsáveis no Forms, LEIA O CONTEÚDO deles.

Um comentário dizendo:

"teve dúvidas"

não significa a mesma coisa que:

"teve ótimo desenvolvimento"

e nenhum dos dois significa apenas:

"existem 2 comentários no Forms".

Use o conteúdo e o momento de cada comentário para entender a evolução.

Quando um responsável registrar:

- dúvida;
- dificuldade;
- erro;
- necessidade de acompanhamento;
- boa aprendizagem;
- dedicação;
- interesse;
- melhora;
- autonomia;
- evolução;
- comunicação;
- postura operacional;

trate isso como informação qualitativa sobre o processo.

Mas somente afirme aquilo que o próprio comentário sustenta.

=====================================================
O QUE ACONTECEU DEPOIS DO FEEDBACK
=====================================================

Quando houver um feedback anterior relevante, procure obrigatoriamente o que aconteceu DEPOIS dele.

Se houver fatos posteriores relacionados:

mencione a mudança naturalmente.

Se houver sinais concretos de melhora:

reconheça a melhora e explique o que sustenta essa leitura.

Se existirem apenas mais registros, mas nenhuma avaliação de qualidade posterior:

pode reconhecer maior prática, movimentação ou constância.

NÃO transforme isso automaticamente em:

"o problema foi resolvido".

Se não houver evidência suficiente:

explique naturalmente que aquele ponto continua sendo algo para acompanhar.

Ausência de prova de melhora NÃO significa prova de que a pessoa não melhorou.

=====================================================
TRANSFORME NÚMEROS EM OBSERVAÇÕES HUMANAS
=====================================================

Os números são EVIDÊNCIA.

Eles não são o texto final.

Se uma pessoa tiver, por exemplo:

Manager: 22
Doações: 2
Bate Ponto: 2
Poderes: 1
Poderes Do Dia: 1

perceba internamente que:

- existe uma concentração muito forte em Manager;
- outras frentes também aparecem;
- a pessoa não está dependendo exclusivamente de uma única ocorrência;
- existe atividade operacional em outras áreas;
- Manager é claramente sua principal frente da semana.

Na resposta, fale disso naturalmente.

Algo como a INTENÇÃO:

"Você tem puxado bastante coisa em Manager nessa semana, e essa é claramente a frente onde mais apareceu. Ao mesmo tempo, também existem registros seus em outras atividades."

Esse é SOMENTE um exemplo de raciocínio.

NÃO copie essa frase automaticamente.

Crie um comentário novo e exclusivo para cada pessoa.

=====================================================
PROPORÇÃO DAS ATIVIDADES
=====================================================

Não trate todas as fontes com o mesmo peso.

Se uma pessoa possui:

22 Manager

e:

1 Poderes

Manager é uma característica muito mais importante da movimentação dela naquela semana.

A resposta deve refletir essa diferença.

Se uma frente representar a maior parte dos registros:

destaque isso naturalmente.

Se a pessoa estiver realmente distribuída entre várias frentes:

pode reconhecer essa variedade.

Não chame concentração de algo ruim automaticamente.

A função e o contexto da pessoa importam.

=====================================================
QUANTIDADE NÃO É QUALIDADE
=====================================================

Uma pessoa possuir muitos registros demonstra MOVIMENTAÇÃO naquela frente.

Isso NÃO prova automaticamente:

- qualidade perfeita;
- domínio completo;
- ausência de erros;
- liderança;
- maturidade;
- autonomia;
- boa comunicação;
- excelência;
- resolução de todas as dúvidas anteriores.

Para falar sobre qualidade, utilize:

- feedback humano;
- alinhamento;
- comentário;
- avaliação;
- evidência operacional explícita.

=====================================================
NÃO CONFUNDA AUSÊNCIA DE REGISTRO
=====================================================

Nunca diga:

"você não fez X"

somente porque X não apareceu nas informações disponíveis.

Prefira, quando necessário:

"não apareceu registro de X até aqui"

ou uma formulação humana equivalente.

Ausência de registro não prova ausência absoluta de trabalho.

=====================================================
CONTRADIÇÕES ENTRE FONTES
=====================================================

Antes de concluir que a pessoa está:

- apagada;
- parada;
- pouco ativa;
- sem movimentação;
- abaixo do esperado;

verifique os dados estruturados atuais.

Se uma leitura de mensagens do chat parecer fraca, mas o ranking atual mostrar que a pessoa possui muitos registros e está entre as primeiras posições:

NÃO descreva essa pessoa como inativa.

Mensagens do chat são contexto.

Registros operacionais atuais são evidência mais forte de atividade.

Se houver contradição:

priorize o dado operacional estruturado mais atual para representar a movimentação atual.

=====================================================
RANKING NÃO É SOMENTE PLACAR
=====================================================

A posição da pessoa serve para contextualizar sua movimentação em relação ao restante da equipe.

Se alguém estiver em 1º lugar:

isso é um destaque objetivo e pode ser reconhecido.

Mas não transforme todo o feedback em:

"você está em primeiro, parabéns".

Explique o que está fazendo aquela pessoa chegar naquela posição.

Use as fontes reais.

Exemplo:

se a maior parte vier de Manager, diga que Manager está puxando grande parte daquela movimentação.

=====================================================
FEEDBACKS RECORRENTES
=====================================================

Se o mesmo ponto aparecer em diferentes comentários humanos ao longo do tempo:

isso pode indicar recorrência.

Exemplos:

- dúvidas aparecendo repetidamente;
- necessidade de acompanhamento aparecendo repetidamente;
- elogios sobre dedicação aparecendo repetidamente;
- boa aprendizagem sendo registrada por mais de uma pessoa;
- dificuldade específica aparecendo novamente.

Só trate como recorrente quando realmente existir repetição documentada.

Não invente recorrência com um único comentário.

=====================================================
EXCLUSIVIDADE
=====================================================

O comentário final deve ser tão específico que NÃO seja possível trocar apenas o nome da pessoa e reutilizar o mesmo texto para outro membro.

Se o comentário poderia servir igualmente para cinco pessoas diferentes:

ele está genérico demais.

Use fatos individuais concretos.

Considere principalmente:

- principal frente da semana;
- proporção entre as atividades;
- posição;
- histórico de feedback;
- mudanças depois das orientações;
- pontos que continuam aparecendo;
- coisas que aparentemente evoluíram;
- pontos que ainda precisam ser acompanhados.

=====================================================
PRÓXIMO PASSO PRÁTICO
=====================================================

A orientação final precisa nascer da situação daquela pessoa.

Se ela já possui alto volume:

não mande simplesmente "registrar mais".

Pode ser mais útil orientar sobre:

- qualidade;
- autonomia;
- consistência;
- correção de dúvidas anteriores;
- distribuição da atuação;
- acompanhamento de um ponto específico.

Se a pessoa possui poucos registros:

pode fazer sentido falar de participação ou constância.

Se está começando:

pode fazer sentido priorizar aprendizagem e acompanhamento.

Não use uma orientação genérica só porque precisa terminar o texto.

=====================================================
HUMANIZAÇÃO
=====================================================

A mensagem precisa soar como uma pessoa falando com outra pessoa.

Não use frases robotizadas como:

"Após análise dos dados..."
"Foi identificado..."
"Os registros demonstram..."
"Com base nos indicadores..."
"Segundo as informações coletadas..."
"O sistema aponta..."
"A análise indica..."
"Seu desempenho apresenta..."

Não comece sempre da mesma forma.

Varie naturalmente.

Você pode começar, quando fizer sentido, com coisas como:

"${facts.displayName.split(/\s+/)[0]}, vi algumas coisas legais nesses primeiros dias 👀"

"${facts.displayName.split(/\s+/)[0]}, dando uma olhada em como sua semana está andando até aqui..."

"${facts.displayName.split(/\s+/)[0]}, queria deixar um retorno sobre como você está indo nessa semana 🙌"

"${facts.displayName.split(/\s+/)[0]}, algumas coisas suas chamaram atenção nesses últimos dias..."

Mas NÃO copie sempre esses modelos.

Crie uma abertura natural baseada no contexto real.

=====================================================
TOM
=====================================================

Se a semana estiver boa:

reconheça o que realmente foi feito e incentive continuidade.

Se estiver mediana:

reconheça o que existe e diga onde ainda dá para aparecer mais.

Se estiver fraca:

não humilhe.

Não diga que a pessoa "não fez nada" se existem poucos dados.

Mostre o que está faltando de maneira construtiva.

Se houver evolução:

destaque.

Se houver queda:

fale de retomada.

Se houver uma orientação antiga ainda pendente:

mencione com cuidado.

=====================================================
FORMATO
=====================================================

A profundidade do texto deve acompanhar a quantidade de informação real disponível.

Quando houver poucos dados:

- pode ser mais curto;
- não tente preencher espaço inventando observações.

Quando houver bastante histórico, atividades, feedbacks e comparação:

- escreva de 3 a 7 parágrafos;
- pode escrever mais se realmente houver informação útil;
- prefira aproximadamente 1200 a 3200 caracteres quando houver material suficiente;
- pode ultrapassar esse tamanho quando uma análise maior for necessária para não perder informação importante.

NÃO corte uma observação útil apenas para manter o texto curto.

NÃO estique uma análise sem informação real apenas para ficar grande.

Use emojis naturalmente, sem transformar o texto em carnaval.

Não faça tabela.

Não despeje uma lista fria de números.

Não coloque nota.

Não transforme o texto em relatório técnico.

Não use como título ou cabeçalho:

"Feedback semanal"

"Atualização semanal"

"Análise"

"IA"

"NPS"

"Banco de dados"

"Provider"

"JSON"

A palavra "ranking" PODE ser usada naturalmente dentro do texto quando a posição da pessoa for realmente relevante.

Exemplo de intenção:

"Hoje você aparece no topo do ranking da semana."

Mas não transforme o comentário em uma leitura de placar.

A pessoa não precisa saber como os sistemas internos funcionam.

Ela precisa receber um retorno humano sobre o próprio processo.

=====================================================
FINAL
=====================================================

Termine com algo útil e específico.

Não use automaticamente:

"continue assim".

Prefira uma orientação relacionada ao que realmente aconteceu.

Exemplos de intenção:

- manter a constância;
- aparecer mais em determinada frente;
- corrigir algo que já havia sido orientado;
- continuar a evolução que começou;
- distribuir melhor a participação;
- aproveitar os próximos dias da semana.

Mas escolha somente o que fizer sentido com os fatos.

Entregue SOMENTE a mensagem final para ${facts.displayName}.
`.trim();
}

// =====================================================
// FALLBACK LOCAL FACTUAL
// =====================================================
//
// Se o Gemini estiver sem quota, o sistema ainda consegue
// produzir um comentário útil baseado SOMENTE nos fatos
// que já foram coletados.
//
// Não utiliza informação inventada.
// =====================================================

function getFeedbackFirstName(
  facts
) {
  return (
    String(
      facts?.displayName ||
      "Oi"
    )
      .trim()
      .split(
        /\s+/
      )[0] ||
    "Oi"
  );
}

function getSortedCurrentSourceEntries(
  facts
) {
  return Object.entries(
    facts?.currentSources ||
      {}
  )
    .map(
      ([
        sourceName,
        amountRaw,
      ]) => ({
        sourceName,

        label:
          getSourceLabel(
            sourceName
          ),

        amount:
          Math.max(
            0,
            Number(
              amountRaw ||
                0
            )
          ),
      })
    )
    .filter(
      item =>
        item.amount >
        0
    )
    .sort(
      (
        first,
        second
      ) =>
        second.amount -
        first.amount
    );
}

function buildHumanSourceSentence(
  facts
) {
  const entries =
    getSortedCurrentSourceEntries(
      facts
    );

  if (
    !entries.length
  ) {
    return "";
  }

  const selected =
    entries.slice(
      0,
      5
    );

  const parts =
    selected.map(
      item => {
        const amount =
          item.amount;

        const label =
          item.label;

        if (
          amount ===
          1
        ) {
          return `1 registro em ${label}`;
        }

        return `${amount} registros em ${label}`;
      }
    );

  if (
    parts.length ===
    1
  ) {
    return parts[0];
  }

  if (
    parts.length ===
    2
  ) {
    return `${parts[0]} e ${parts[1]}`;
  }

  return (
    parts
      .slice(
        0,
        -1
      )
      .join(
        ", "
      ) +
    ` e ${
      parts[
        parts.length -
        1
      ]
    }`
  );
}

function buildPreviousWeekComparisonText(
  facts
) {
  const current =
    Number(
      facts?.currentTotal ||
        0
    );

  const previous =
    Number(
      facts?.previousTotal ||
        0
    );

  if (
    previous <=
    0
  ) {
    return "";
  }

  if (
    current >
    previous
  ) {
    return (
      "Comparando com a semana anterior, você já está com uma movimentação maior até aqui, então tem um sinal positivo de crescimento no ritmo."
    );
  }

  if (
    current ===
    previous
  ) {
    return (
      "Até aqui seu volume está próximo do que apareceu na semana anterior, então o ponto principal agora é manter a constância e continuar distribuindo bem sua participação."
    );
  }

  return (
    "Comparando com a semana anterior, o volume ainda está abaixo do que você vinha registrando. Como a semana ainda está andando, ainda existe espaço para recuperar esse ritmo nos próximos dias."
  );
}

function buildFormsContextText(
  facts
) {
  const currentForms =
    Array.isArray(
      facts?.formsHistory
    )
      ? facts.formsHistory
      : [];

  const previousForms =
    Array.isArray(
      facts?.previousFormsHistory
    )
      ? facts.previousFormsHistory
      : [];

  if (
    currentForms.length >
      0 &&
    previousForms.length >
      0
  ) {
    return (
      `Também existem ${currentForms.length} registro(s) ou comentário(s) no seu Forms nesta semana, além do histórico anterior que já vinha sendo acompanhado. Isso ajuda a olhar seu processo além da pontuação e acompanhar se as orientações e a forma de trabalhar estão evoluindo.`
    );
  }

  if (
    currentForms.length >
    0
  ) {
    return (
      `Seu Forms também já recebeu ${currentForms.length} registro(s) ou comentário(s) durante esta semana, então o acompanhamento não está olhando apenas quantidade de pontos, mas também o que vem sendo registrado sobre seu processo.`
    );
  }

  if (
    previousForms.length >
    0
  ) {
    return (
      "Existe histórico anterior no seu Forms que continua servindo como referência para acompanhar sua evolução, mesmo que ainda existam poucos registros novos nesta semana."
    );
  }

  return "";
}

function buildLocalFactRichFeedback({
  facts,
  mode,
}) {
  const firstName =
    getFeedbackFirstName(
      facts
    );

  const sourceSentence =
    buildHumanSourceSentence(
      facts
    );

  const comparison =
    buildPreviousWeekComparisonText(
      facts
    );

  const formsContext =
    buildFormsContextText(
      facts
    );

  const currentTotal =
    Math.max(
      0,
      Number(
        facts?.currentTotal ||
          0
      )
    );
  const rankingContext =
    Number.isFinite(
      facts?.rankingPosition
    )
      ? (
          facts.rankingPosition ===
          1
            ? `Hoje você aparece em 1º lugar entre ${facts.rankingSize} pessoa(s) pontuada(s), com ${facts.rankingPoints} pontos. Isso é um destaque concreto da sua movimentação nesta semana.`
            : `Hoje você aparece em ${facts.rankingPosition}º lugar entre ${facts.rankingSize} pessoa(s) pontuada(s), com ${facts.rankingPoints} pontos.`
        )
      : "";

  const currentSourceEntries =
    getSortedCurrentSourceEntries(
      facts
    );

  const dominantSource =
    currentSourceEntries[0] ||
    null;

  const dominantSourceContext =
    dominantSource &&
    currentTotal >
      0
      ? (
          dominantSource.amount /
          currentTotal >=
          0.5
            ? `A frente que mais concentra sua movimentação até aqui é ${dominantSource.label}, com ${dominantSource.amount} registro(s). Então esse é claramente o ponto onde você mais vem aparecendo na semana.`
            : `Sua participação está relativamente distribuída entre diferentes frentes, sem uma única atividade concentrando sozinha a maior parte do que foi registrado.`
        )
      : "";
  const paragraphs =
    [];

  if (
    sourceSentence
  ) {
    paragraphs.push(
      `${firstName}, já dá para enxergar melhor como sua semana está andando até aqui 👀 Você soma ${currentTotal} atividade(s) considerada(s) no acompanhamento, com ${sourceSentence}. Isso já mostra onde você mais apareceu nesses primeiros dias, em vez de olhar só para um número geral.`
    );
  } else if (
    currentTotal >
    0
  ) {
    paragraphs.push(
      `${firstName}, já existem ${currentTotal} atividade(s) registradas no seu acompanhamento nesta semana. O volume já aparece, mas ainda não consegui separar com segurança todas as frentes dessas atividades, então prefiro não inventar quais foram.`
    );
  } else {
    paragraphs.push(
      `${firstName}, por enquanto ainda existem poucos registros concretos desta semana para fazer uma leitura completa do seu andamento. Como ainda estamos no decorrer da semana, isso pode mudar bastante nos próximos dias.`
    );
  }
  if (
    rankingContext
  ) {
    paragraphs.push(
      rankingContext
    );
  }

  if (
    dominantSourceContext
  ) {
    paragraphs.push(
      dominantSourceContext
    );
  }
  if (
    formsContext
  ) {
    paragraphs.push(
      formsContext
    );
  }

  if (
    comparison
  ) {
    paragraphs.push(
      comparison
    );
  }

  if (
    mode ===
      "manual"
  ) {
    paragraphs.push(
      "Para o restante da semana, o ideal é continuar deixando sua participação registrada e manter constância nas frentes em que você já começou a aparecer. Assim, no próximo retorno dá para comparar seu processo com muito mais precisão. 🙌"
    );
  } else {
    paragraphs.push(
      "No fechamento, o mais importante é usar esse histórico para manter o que funcionou bem e ajustar as frentes em que sua participação ainda ficou menor. 🙌"
    );
  }

  return paragraphs
    .filter(
      Boolean
    )
    .slice(
      0,
      7
    )
    .join(
      "\n\n"
    )
    .slice(
      0,
      10000
    );
}

// =====================================================
// VALIDAÇÃO DE QUALIDADE DA RESPOSTA
// =====================================================

function normalizeFeedbackComparisonText(
  value
) {
  return String(
    value ||
      ""
  )
    .toLowerCase()
    .normalize(
      "NFD"
    )
    .replace(
      /[\u0300-\u036f]/g,
      ""
    );
}

function generatedFeedbackUsesRealActivity(
  text,
  facts
) {
  const entries =
    getSortedCurrentSourceEntries(
      facts
    );

  if (
    !entries.length
  ) {
    return true;
  }

  const normalizedText =
    normalizeFeedbackComparisonText(
      text
    );

  return entries
    .slice(
      0,
      5
    )
    .some(
      item => {
        const label =
          normalizeFeedbackComparisonText(
            item.label
          );

        const relevantWords =
          label
            .split(
              /\s+/
            )
            .filter(
              word =>
                word.length >=
                4
            );

        return relevantWords.some(
          word =>
            normalizedText.includes(
              word
            )
        );
      }
    );
}

function isGeneratedFeedbackGoodEnough(
  text,
  facts
) {
  const clean =
    String(
      text ||
        ""
    ).trim();

  if (
    !clean
  ) {
    return false;
  }

  const hasRealActivity =
    Object.keys(
      facts?.currentSources ||
        {}
    ).length >
    0;

  if (
    hasRealActivity &&
    clean.length <
      450
  ) {
    return false;
  }

  if (
    hasRealActivity &&
    !generatedFeedbackUsesRealActivity(
      clean,
      facts
    )
  ) {
    return false;
  }

  return true;
}

function cleanGeneratedText(
  value
) {
  return String(
    value || ""
  )
    .replace(
      /^```(?:markdown|md|text)?/i,
      ""
    )
    .replace(
      /```$/i,
      ""
    )
    .trim()
    .slice(
      0,
      12000
    );
}

async function generateFeedback({
  facts,
  previousManualText,
  mode,
}) {
  const prompt =
    buildFeedbackPrompt({
      facts,
      previousManualText,
      mode,
    });

  try {
    const generated =
      await generateSantaCreatorsStandaloneText({
        prompt,

        maxOutputTokens:
          2200,

        temperature:
          0.78,

        label:
          `Weekly Member Feedback ${facts.userId}`,
      });

    const text =
      cleanGeneratedText(
        generated
      );

    if (
      isGeneratedFeedbackGoodEnough(
        text,
        facts
      )
    ) {
      return text;
    }

    console.warn(
      `[Weekly Member Feedback] A resposta de ${facts.userId} ficou genérica ou curta demais. Utilizando fallback factual local.`
    );

    return buildLocalFactRichFeedback({
      facts,
      mode,
    });
  } catch (
    error
  ) {
    /*
     * Quota, timeout ou indisponibilidade do Gemini
     * NÃO devem impedir o acompanhamento da pessoa.
     */
    console.warn(
      `[Weekly Member Feedback] Gemini indisponível para ${facts.userId}. Utilizando fallback factual local:`,
      error?.message ||
        error
    );

    const fallback =
      buildLocalFactRichFeedback({
        facts,
        mode,
      });

    if (
      !fallback
    ) {
      throw new Error(
        "Não foi possível gerar o comentário e não havia fatos suficientes para montar o fallback local."
      );
    }

    return fallback;
  }
}

// =====================================================
// ✅ DIVISÃO SEGURA DE FEEDBACKS GRANDES
// =====================================================
//
// O Discord permite até 4096 caracteres na descrição
// de um embed.
//
// Utilizamos 3400 para deixar folga para textos adicionais
// e preservar parágrafos/frases inteiras sempre que possível.
//
// Quando houver mais conteúdo, serão enviadas mensagens
// de continuação logo abaixo do primeiro feedback.
//
function splitWeeklyFeedbackText(
  text,
  maxLength = 3400
) {
  const finalText =
    String(
      text || ""
    ).trim();

  if (
    !finalText
  ) {
    return [];
  }

  if (
    finalText.length <=
    maxLength
  ) {
    return [
      finalText,
    ];
  }

  const parts =
    [];

  let remaining =
    finalText;

  while (
    remaining.length >
    maxLength
  ) {
    let splitIndex =
      remaining.lastIndexOf(
        "\n\n",
        maxLength
      );

    if (
      splitIndex <
      Math.floor(
        maxLength *
        0.5
      )
    ) {
      splitIndex =
        remaining.lastIndexOf(
          "\n",
          maxLength
        );
    }

    if (
      splitIndex <
      Math.floor(
        maxLength *
        0.5
      )
    ) {
      splitIndex =
        remaining.lastIndexOf(
          ". ",
          maxLength
        );

      if (
        splitIndex !==
        -1
      ) {
        splitIndex +=
          1;
      }
    }

    if (
      splitIndex <
      Math.floor(
        maxLength *
        0.5
      )
    ) {
      splitIndex =
        remaining.lastIndexOf(
          " ",
          maxLength
        );
    }

    if (
      splitIndex <=
      0
    ) {
      splitIndex =
        maxLength;
    }

    const part =
      remaining
        .slice(
          0,
          splitIndex
        )
        .trim();

    if (
      part
    ) {
      parts.push(
        part
      );
    }

    remaining =
      remaining
        .slice(
          splitIndex
        )
        .trim();
  }

  if (
    remaining
  ) {
    parts.push(
      remaining
    );
  }

  return parts;
}

// =====================================================
// ✅ EMBED DE CONTINUAÇÃO
// =====================================================

function buildFeedbackContinuationEmbed({
  text,
  mode,
  partIndex,
  partCount,
}) {
  const isManual =
    mode ===
    "manual";

  return new EmbedBuilder()
    .setColor(
      isManual
        ? 0x5865f2
        : 0x57f287
    )
    .setTitle(
      `↳ Continuação ${partIndex + 1}/${partCount}`
    )
    .setDescription(
      String(
        text || ""
      )
        .trim()
        .slice(
          0,
          4096
        )
    );
}

// =====================================================
// ✅ LIMPA CONTINUAÇÕES ANTIGAS
// =====================================================
//
// Quando um feedback manual é atualizado, a primeira
// mensagem é editada.
//
// Caso a versão anterior tivesse continuações, elas também
// precisam ser apagadas para não deixar pedaços antigos.
//
async function deleteFeedbackContinuationMessages(
  thread,
  messageIds = []
) {
  if (
    !thread ||
    !Array.isArray(
      messageIds
    ) ||
    !messageIds.length
  ) {
    return;
  }

  for (
    const messageId of
    messageIds
  ) {
    const message =
      await thread
        .messages
        .fetch(
          messageId
        )
        .catch(
          () => null
        );

    if (
      !message
    ) {
      continue;
    }

    await message
      .delete()
      .catch(
        () => null
      );
  }
}

// =====================================================
// ✅ ENVIA / EDITA TODAS AS PARTES DO FEEDBACK
// =====================================================

async function sendWeeklyFeedbackParts({
  facts,
  text,
  mode,
  actorId = null,
  existingFirstMessage = null,
}) {
  const parts =
    splitWeeklyFeedbackText(
      text
    );

  if (
    !parts.length
  ) {
    throw new Error(
      "O feedback ficou vazio."
    );
  }

  const firstPayload = {
    content:
      `<@${facts.userId}>`,

    embeds: [
      buildFeedbackEmbed({
        facts,

        text:
          parts[0],

        mode,

        actorId,
      }),
    ],

    allowedMentions: {
      users: [
        facts.userId,
      ],
    },
  };

  let firstMessage =
    existingFirstMessage;

  if (
    firstMessage
  ) {
    await firstMessage.edit(
      firstPayload
    );
  } else {
    firstMessage =
      await facts
        .formsThread
        .send(
          firstPayload
        );
  }

  const continuationMessageIds =
    [];

  for (
    let index = 1;
    index < parts.length;
    index++
  ) {
    const continuationMessage =
      await facts
        .formsThread
        .send({
          embeds: [
            buildFeedbackContinuationEmbed({
              text:
                parts[index],

              mode,

              partIndex:
                index,

              partCount:
                parts.length,
            }),
          ],

          allowedMentions: {
            parse: [],
          },
        });

    continuationMessageIds.push(
      continuationMessage.id
    );
  }

  return {
    message:
      firstMessage,

    continuationMessageIds,
  };
}

// =====================================================
// EMBED
// =====================================================

function buildFeedbackEmbed({
  facts,
  text,
  mode,
  actorId = null,
}) {
  const isManual =
    mode ===
    "manual";

  const descriptionParts = [
    String(
      text || ""
    ).trim(),
  ];

  if (
    isManual &&
    actorId
  ) {
    descriptionParts.push(
      `👤 **Solicitado por:** <@${actorId}>`
    );
  }

  const embed =
    new EmbedBuilder()
      .setColor(
        isManual
          ? 0x5865f2
          : 0x57f287
      )
      .setTitle(
        isManual
          ? "💬 Um retorno sobre sua semana"
          : "🌟 Fechando sua semana"
      )
      .setDescription(
        descriptionParts
          .filter(
            Boolean
          )
          .join(
            "\n\n"
          )
          .slice(
            0,
            4096
          )
      );

  // =====================================================
  // DATA SOMENTE NO FECHAMENTO
  // =====================================================
  //
  // No acompanhamento manual não precisamos poluir
  // o comentário mostrando datas.
  //
  // No sábado, quando a semana efetivamente chegou
  // ao fechamento, aí sim mostra o período completo.
  //
  if (
    !isManual
  ) {
    embed.addFields({
      name:
        "📅 Semana",

      value:
        `\`${formatWeekLabel(
          facts.weekKey
        )}\``,

      inline:
        true,
    });
  }

  embed.setTimestamp(
    new Date()
  );

  return embed;
}

// =====================================================
// COMENTÁRIO MANUAL
// =====================================================

async function upsertManualFeedback({
  facts,
  text,
  actorId,
}) {
  const state =
    loadFeedbackState();

  state.manual[
    facts.weekKey
  ] =
    state.manual[
      facts.weekKey
    ] || {};

  const previous =
    state.manual[
      facts.weekKey
    ][
      facts.userId
    ] || null;

  let existingFirstMessage =
    null;

  let replaced =
    false;

  if (
    previous
      ?.messageId &&
    String(
      previous
        ?.threadId
    ) ===
      String(
        facts
          .formsThread
          .id
      )
  ) {
    existingFirstMessage =
      await facts
        .formsThread
        .messages
        .fetch(
          previous.messageId
        )
        .catch(
          () => null
        );

    if (
      existingFirstMessage
    ) {
      replaced =
        true;

      await deleteFeedbackContinuationMessages(
        facts.formsThread,
        previous
          ?.continuationMessageIds ||
          []
      );
    }
  }

  const result =
    await sendWeeklyFeedbackParts({
      facts,

      text,

      mode:
        "manual",

      actorId,

      existingFirstMessage,
    });

  const message =
    result.message;

  const continuationMessageIds =
    result.continuationMessageIds;

  state.manual[
    facts.weekKey
  ][
    facts.userId
  ] = {
    messageId:
      message.id,

    continuationMessageIds,

    threadId:
      facts
        .formsThread
        .id,

    text,

    actorId:
      String(
        actorId || ""
      ),

    updatedAt:
      Date.now(),
  };

  saveFeedbackState(
    state
  );

  return {
    message,
    replaced,

    continuationMessageIds,
  };
}

// =====================================================
// COMENTÁRIO AUTOMÁTICO
// =====================================================

async function sendAutomaticFeedback({
  facts,
  text,
}) {
  const state =
    loadFeedbackState();

  state.automatic[
    facts.weekKey
  ] =
    state.automatic[
      facts.weekKey
    ] || {};

  const existing =
    state.automatic[
      facts.weekKey
    ][
      facts.userId
    ];

  if (
    existing
      ?.messageId
  ) {
    return {
      skipped:
        true,

      reason:
        "already_sent",
    };
  }

  const result =
    await sendWeeklyFeedbackParts({
      facts,

      text,

      mode:
        "automatic",
    });

  const message =
    result.message;

  const continuationMessageIds =
    result.continuationMessageIds;

  state.automatic[
    facts.weekKey
  ][
    facts.userId
  ] = {
    messageId:
      message.id,

    continuationMessageIds,

    threadId:
      facts
        .formsThread
        .id,

    text,

    sentAt:
      Date.now(),
  };

  saveFeedbackState(
    state
  );

  return {
    skipped:
      false,

    message,

    continuationMessageIds,
  };
}

// =====================================================
// PROCESSAMENTO CENTRAL
// =====================================================

async function processFeedback({
  client,
  guild,
  record,
  mode,
  actorId = null,
}) {
  const userId =
    String(
      record?.targetId ||
      ""
    );

  if (
    !userId
  ) {
    throw new Error(
      "O Controle GI não possui membro alvo."
    );
  }

  const weekKey =
    getWeekKeySP();

  const runningKey =
    `${mode}:${weekKey}:${userId}`;

  if (
    runningKeys.has(
      runningKey
    )
  ) {
    throw new Error(
      "Já existe um comentário desta pessoa sendo gerado agora."
    );
  }

  runningKeys.add(
    runningKey
  );

  try {
    const member =
      await guild
        .members
        .fetch(
          userId
        )
        .catch(
          () => null
        );

    if (
      !member
    ) {
      throw new Error(
        "O membro não está disponível no servidor."
      );
    }

    if (
      !hasTargetRole(
        member
      )
    ) {
      throw new Error(
        "Este membro não possui um dos cargos acompanhados pelo comentário semanal."
      );
    }

    const facts =
      await collectMemberFacts({
        client,
        guild,
        record,
        weekKey,
      });

    if (
      !facts
        .formsThread ||
      !facts
        .formsThread
        .isTextBased
        ?.()
    ) {
      throw new Error(
        "Não encontrei o Forms pessoal desta pessoa para publicar o comentário."
      );
    }

    const state =
      loadFeedbackState();

    const previousManualText =
      mode ===
      "manual"
        ? String(
            state
              .manual
              ?.[
                weekKey
              ]
              ?.[
                userId
              ]
              ?.text ||
            ""
          ).trim()
        : "";

    const text =
      await generateFeedback({
        facts,
        previousManualText,
        mode,
      });

    if (
      mode ===
      "manual"
    ) {
      const result =
        await upsertManualFeedback({
          facts,
          text,
          actorId,
        });

      return {
        ...result,
        text,
        facts,
      };
    }

    const result =
      await sendAutomaticFeedback({
        facts,
        text,
      });

    return {
      ...result,
      text,
      facts,
    };
  } finally {
    runningKeys.delete(
      runningKey
    );
  }
}

// =====================================================
// EXECUÇÃO MANUAL
// =====================================================

export async function forceWeeklyMemberAiFeedback({
  client,
  guild,
  record,
  actorUser,
}) {
  if (
    !client ||
    !guild ||
    !record ||
    !actorUser?.id
  ) {
    throw new Error(
      "Dados insuficientes para gerar o comentário manual."
    );
  }

  return processFeedback({
    client,
    guild,
    record,

    mode:
      "manual",

    actorId:
      actorUser.id,
  });
}

// =====================================================
// EXECUÇÃO AUTOMÁTICA
// =====================================================

export async function runAutomaticWeeklyMemberFeedback(
  client
) {
  if (
    !client
  ) {
    return;
  }

  for (
    const guild of
    client
      .guilds
      .cache
      .values()
  ) {
    const records =
      getLatestGiRecords(
        guild.id
      );

    for (
      const record of
      records
    ) {
      const userId =
        String(
          record?.targetId ||
          ""
        );

      if (
        !userId
      ) {
        continue;
      }

      const member =
        await guild
          .members
          .fetch(
            userId
          )
          .catch(
            () => null
          );

      if (
        !member ||
        !hasTargetRole(
          member
        )
      ) {
        continue;
      }

      const weekKey =
        getWeekKeySP();

      const state =
        loadFeedbackState();

      if (
        state
          .automatic
          ?.[
            weekKey
          ]
          ?.[
            userId
          ]
          ?.messageId
      ) {
        continue;
      }

      try {
        await processFeedback({
          client,
          guild,
          record,

          mode:
            "automatic",
        });

        console.log(
          `[Weekly Member AI] Fechamento enviado para ${userId}.`
        );
      } catch (
        error
      ) {
        console.error(
          `[Weekly Member AI] Falha ao gerar fechamento de ${userId}:`,
          error
        );
      }

      await new Promise(
        resolve =>
          setTimeout(
            resolve,
            1500
          )
      );
    }
  }
}

// =====================================================
// RECUPERAÇÃO APÓS RESTART
// =====================================================

function isSaturdayAfterAutomaticTime() {
  const parts =
    getSpParts();

  if (
    parts.weekday !==
    "Sat"
  ) {
    return false;
  }

  return (
    parts.hour > 22 ||
    (
      parts.hour ===
        22 &&
      parts.minute >=
        30
    )
  );
}

// =====================================================
// SCHEDULER
// =====================================================

export function weeklyMemberAiFeedbackOnReady(
  client
) {
  if (
    !client ||
    schedulerStarted
  ) {
    return;
  }

  schedulerStarted =
    true;

  ensureDataDir();

  cron.schedule(
    AUTOMATIC_CRON,

    () => {
      runAutomaticWeeklyMemberFeedback(
        client
      ).catch(
        error =>
          console.error(
            "[Weekly Member AI] Erro no fechamento automático:",
            error
          )
      );
    },

    {
      timezone:
        TZ,
    }
  );

  /*
   * Se o bot tiver sido reiniciado no sábado
   * depois das 22:30 e o comentário ainda não
   * tiver sido enviado, tenta recuperar.
   */
  if (
    isSaturdayAfterAutomaticTime()
  ) {
    runAutomaticWeeklyMemberFeedback(
      client
    ).catch(
      error =>
        console.error(
          "[Weekly Member AI] Erro no catch-up do sábado:",
          error
        )
    );
  }

  console.log(
    "[Weekly Member AI] Scheduler ativo: sábado às 22:30 (America/Sao_Paulo)."
  );
}