// /events/npsOperationalProviders.js
// ============================================================================
// SANTACREATORS — PROVEDORES CENTRAIS DO NPS OPERACIONAL
// ============================================================================
// Este arquivo lê diretamente a fonte consolidada produzida pelo
// Ranking Semanal Geral.
//
// Ele cria duas métricas centrais:
//
// • participacao_equipe:
//   avalia quantas pessoas atingiram o mínimo individual de 25 pontos;
//
// • desempenho_geral:
//   avalia o ritmo atual diante da meta geral de 500 pontos.
//
// A mesma leitura também entrega todas as fontes utilizadas na semana,
// permitindo que o relatório fale sobre Poderes, Pagamentos, Presenças,
// Manager, Bate Ponto, Eventos e demais atividades encontradas.
// ============================================================================

import fs from "node:fs";
import path from "node:path";

import {
  registerOperationalMetricProvider,
  listOperationalMetricProviders,
} from "../utils/operationalMetricsHub.js";

import {
  collectPayEvtOperationalData,
} from "./payEvtDash/index.js";

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================

const TZ =
  "America/Sao_Paulo";

const MINIMUM_POINTS_PER_USER =
  25;

const GENERAL_WEEKLY_GOAL =
  500;

/*
 * Bate Ponto corresponde à presença da equipe.
 *
 * Esta meta NÃO representa confirmação de ORGs em eventos.
 * A presença das ORGs é calculada separadamente pelo
 * confirmacao_presenca_state.json.
 */
const PRESENCE_WEEKLY_GOAL =
  15;

/*
 * Meta semanal de pagamentos aprovados.
 */
const PAYMENT_WEEKLY_GOAL =
  10;

/*
 * Checklist semanal das logs dos membros.
 *
 * O arquivo é produzido pelo logChecklistSemanal.js.
 */
const LOG_CHECKLIST_FILE =
  path.join(
    process.cwd(),
    "data",
    "sc_logs_checklist.json"
  );

// ============================================================================
// COLETA HISTÓRICA COMPARTILHADA DO PAY EVENT DASH
// ============================================================================

let payEvtOperationalCollection = {
  client:
    null,

  promise:
    null,

  collectedAt:
    0,

  payload:
    null,
};

const PAY_EVT_OPERATIONAL_CACHE_MS =
  60 * 1000;

/**
 * Executa uma varredura histórica real dos canais e arquivos oficiais.
 *
 * Durante a mesma atualização do NPS, Presenças, Pagamentos,
 * Poderes, Hall da Fama, Eventos Diários e Cronograma utilizam
 * exatamente a mesma coleta.
 *
 * Isso evita:
 *
 * • executar o scanner várias vezes;
 * • receber um cache incompleto criado antes do Discord estar pronto;
 * • encontrar totais diferentes entre áreas da mesma atualização.
 */
async function getFreshPayEvtOperationalData(
  context = {}
) {
  const client =
    context.client ||
    null;

  if (!client) {
    return collectPayEvtOperationalData(
      null,
      false
    );
  }

  const now =
    Date.now();

  const sameClient =
    payEvtOperationalCollection.client ===
    client;

  const cacheIsValid =
    sameClient &&
    payEvtOperationalCollection.payload &&
    now -
      Number(
        payEvtOperationalCollection.collectedAt ||
        0
      ) <
      PAY_EVT_OPERATIONAL_CACHE_MS;

  if (
    cacheIsValid
  ) {
    return payEvtOperationalCollection.payload;
  }

  if (
    sameClient &&
    payEvtOperationalCollection.promise
  ) {
    return payEvtOperationalCollection.promise;
  }

  payEvtOperationalCollection.client =
    client;

  /*
   * force = false:
   *
   * permite que o payEvtDash reutilize a coleta já disponível
   * quando ela ainda puder ser utilizada.
   *
   * Isso evita obrigar uma nova varredura histórica completa
   * de canais, logs e arquivos sempre que o NPS for consultado.
   *
   * A camada deste provedor continua controlando seu próprio
   * cache e sua Promise compartilhada normalmente.
   */
  payEvtOperationalCollection.promise =
    collectPayEvtOperationalData(
      client,
      false
    )
      .then(
        payload => {
          payEvtOperationalCollection.payload =
            payload;

          payEvtOperationalCollection.collectedAt =
            Date.now();

          console.log(
            "[NPS Providers] Varredura histórica compartilhada concluída:",
            {
              payments:
                Array.isArray(
                  payload?.payments
                )
                  ? payload.payments.length
                  : 0,

              events:
                Array.isArray(
                  payload?.events
                )
                  ? payload.events.length
                  : 0,

              users:
                Object.keys(
                  payload?.users ||
                  {}
                ).length,

              scannedChannels: {
                ...(
                  payload?.debug
                    ?.scannedChannels ||
                  {}
                ),
              },

              recoveredFromLogs:
                Number(
                  payload?.debug
                    ?.recoveredFromLogs ||
                  0
                ),

              duplicatesIgnored:
                Number(
                  payload?.debug
                    ?.duplicatesIgnored ||
                  0
                ),
            }
          );

          return payload;
        }
      )
      .catch(
        error => {
          console.error(
            "[NPS Providers] Falha na varredura histórica compartilhada:",
            error
          );

          /*
           * Se uma coleta anterior válida existir,
           * ela é utilizada somente como fallback.
           */
          if (
            payEvtOperationalCollection.payload
          ) {
            return payEvtOperationalCollection.payload;
          }

          return {
            generatedAt:
              Date.now(),

            payments:
              [],

            events:
              [],

            byWeek:
              {},

            byMonth:
              {},

            users:
              {},

            debug: {
              scannedChannels:
                {},

              recoveredFromLogs:
                0,

              duplicatesIgnored:
                0,

              error:
                error?.message ||
                String(
                  error
                ),
            },
          };
        }
      )
      .finally(
        () => {
          payEvtOperationalCollection.promise =
            null;
        }
      );

  return payEvtOperationalCollection.promise;
}

// ============================================================================
// PERSISTÊNCIA
// ============================================================================
function pickPersistRoot() {
  const candidates = [
    process.env.SQUARECLOUD_STORAGE_PATH?.trim(),
    "/storage",
    "/home/container/storage",
    "/home/squarecloud/storage",
  ].filter(Boolean);

  for (const directory of candidates) {
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

const DATA_DIRECTORY =
  path.resolve(
    pickPersistRoot() ||
    process.cwd(),
    "data"
  );

const WEEKLY_SOURCES_FILE =
  path.join(
    DATA_DIRECTORY,
    "sc_geral_weekly_rank_sources.json"
  );

/*
 * Fonte oficial do sistema confirmacaoPresenca.js.
 *
 * Esse arquivo contém:
 *
 * • organizações confirmadas;
 * • organizações ausentes;
 * • organizações pendentes;
 * • usuário responsável;
 * • horário da resposta.
 */
const ORGANIZATION_CONFIRMATION_FILE =
  path.join(
    DATA_DIRECTORY,
    "confirmacao_presenca_state.json"
  );

// ============================================================================
// NOMES AMIGÁVEIS DAS FONTES
// ============================================================================

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
    "Presença das ORGs nos Eventos",

  presencas:
    "Presença das ORGs nos Eventos",

  alinhamentos:
    "Alinhamentos",

  orgs:
    "Registros de Organizações",

  confirmacoes:
    "Presença das ORGs nos Eventos",

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

  vipPagos:
    "VIPs e Premiações",
};

// ============================================================================
// HELPERS
// ============================================================================

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
      "[NPS Providers] Erro ao ler a fonte consolidada:",
      error
    );

    return fallback;
  }
}

function clamp(
  value,
  minimum = 0,
  maximum = 100
) {
  const numeric =
    Number(value);

  if (
    !Number.isFinite(
      numeric
    )
  ) {
    return minimum;
  }

  return Math.max(
    minimum,
    Math.min(
      maximum,
      numeric
    )
  );
}

function normalizeSourceName(
  value
) {
  return String(
    value || ""
  )
    .trim()
    .toLowerCase()
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
    "Outra fonte"
  );
}

function getWeekKeySP(
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

  const weekdayMap = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  const year =
    Number(
      get("year")
    );

  const month =
    Number(
      get("month")
    );

  const day =
    Number(
      get("day")
    );

  const weekday =
    weekdayMap[
      get("weekday")
    ] ?? 0;

  const currentDay =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day,
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

function getCurrentWeekProgress() {
  const parts =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          TZ,

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
      new Date()
    );

  const get =
    type =>
      parts.find(
        part =>
          part.type === type
      )?.value;

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
      get("weekday")
    ] ?? 0;

  const hour =
    Number(
      get("hour") || 0
    );

  const minute =
    Number(
      get("minute") || 0
    );

  const elapsedMinutes =
    (
      weekday *
      24 *
      60
    ) +
    (
      hour *
      60
    ) +
    minute;

  return clamp(
    elapsedMinutes /
    (
      7 *
      24 *
      60
    ),
    0.08,
    1
  );
}

// ============================================================================
// LEITURA DA SEMANA
// ============================================================================

function collectWeekData(
  weekKey
) {
  const allWeeks =
    readJson(
      WEEKLY_SOURCES_FILE,
      {}
    );

  const week =
    allWeeks?.[
      weekKey
    ] || {};

  const byUser = {};
  const sourceTotals = {};

  for (
    const [
      userId,
      sourceData,
    ] of Object.entries(
      week
    )
  ) {
    if (
      !sourceData ||
      typeof sourceData !==
        "object"
    ) {
      continue;
    }

    let userTotal =
      0;

    const normalizedSources =
      {};

    for (
      const [
        sourceName,
        amountRaw,
      ] of Object.entries(
        sourceData
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

      const normalizedSource =
        normalizeSourceName(
          sourceName
        );

      userTotal +=
        amount;

      normalizedSources[
        normalizedSource
      ] =
        (
          normalizedSources[
            normalizedSource
          ] || 0
        ) +
        amount;

      sourceTotals[
        normalizedSource
      ] =
        (
          sourceTotals[
            normalizedSource
          ] || 0
        ) +
        amount;
    }

    if (
      userTotal <= 0
    ) {
      continue;
    }

    byUser[
      userId
    ] = {
      total:
        userTotal,

      sources:
        normalizedSources,
    };
  }

  const participants =
    Object.keys(
      byUser
    ).length;

  const totalPoints =
    Object.values(
      byUser
    ).reduce(
      (
        total,
        user
      ) =>
        total +
        Number(
          user.total || 0
        ),
      0
    );

  const reachedMinimum =
    Object.values(
      byUser
    ).filter(
      user =>
        Number(
          user.total || 0
        ) >=
        MINIMUM_POINTS_PER_USER
    ).length;

  const belowMinimum =
    Math.max(
      0,
      participants -
      reachedMinimum
    );

  const hitRate =
    participants > 0
      ? (
          reachedMinimum /
          participants
        ) *
        100
      : 0;

  const averagePoints =
    participants > 0
      ? totalPoints /
        participants
      : 0;

  const sortedSources =
    Object.entries(
      sourceTotals
    )
      .sort(
        (first, second) =>
          second[1] -
          first[1]
      )
      .map(
        (
          [
            source,
            amount,
          ]
        ) => ({
          source,
          label:
            getSourceLabel(
              source
            ),
          amount,
        })
      );

  return {
    weekKey,
    participants,
    totalPoints,
    reachedMinimum,
    belowMinimum,
    hitRate,
    averagePoints,
    byUser,
    sourceTotals,
    sortedSources,
  };
}

// ============================================================================
// MÉTRICA: PARTICIPAÇÃO DA EQUIPE
// ============================================================================

function buildTeamParticipationMetric() {
  const currentWeekKey =
    getWeekKeySP();

  const previousWeekKey =
    addDaysToWeekKey(
      currentWeekKey,
      -7
    );

  const current =
    collectWeekData(
      currentWeekKey
    );

  const previous =
    collectWeekData(
      previousWeekKey
    );

  const averageGoalRate =
    clamp(
      (
        current.averagePoints /
        MINIMUM_POINTS_PER_USER
      ) *
      100
    );

  /*
   * A nota prioriza a distribuição:
   *
   * 75% = pessoas que atingiram o mínimo;
   * 25% = média de pontos da equipe.
   */
  const score =
    current.hitRate *
      0.75 +
    averageGoalRate *
      0.25;

  const difference =
    current.hitRate -
    previous.hitRate;

  const positivePoints = [];
  const attentionPoints = [];
  const recommendations = [];

  if (
    current.reachedMinimum > 0
  ) {
    positivePoints.push(
      `${current.reachedMinimum} de ${current.participants} participantes já alcançaram os ${MINIMUM_POINTS_PER_USER} pontos da semana.`
    );
  }

  if (
    current.sortedSources.length
  ) {
    positivePoints.push(
      `As atividades com maior volume até agora são ${current.sortedSources
        .slice(0, 4)
        .map(
          source =>
            `${source.label} (${source.amount})`
        )
        .join(", ")}.`
    );
  }

  if (
    current.belowMinimum > 0
  ) {
    attentionPoints.push(
      `${current.belowMinimum} de ${current.participants} participantes ainda estão abaixo dos ${MINIMUM_POINTS_PER_USER} pontos.`
    );
  }

  if (
    current.hitRate < 50 &&
    current.participants > 0
  ) {
    attentionPoints.push(
      `Neste momento, apenas ${current.hitRate.toFixed(1)}% da equipe alcançou o mínimo semanal.`
    );
  }

  if (
    current.averagePoints <
      MINIMUM_POINTS_PER_USER &&
    current.participants > 0
  ) {
    attentionPoints.push(
      `A média atual é de ${current.averagePoints.toFixed(1)} pontos por participante.`
    );
  }

  recommendations.push(
    current.belowMinimum > 0
      ? `Acompanhar os ${current.belowMinimum} participantes abaixo da meta e verificar quais atividades ainda não foram realizadas por eles.`
      : "Manter a distribuição atual das atividades até o fechamento da semana."
  );

  return {
    id:
      "participacao_equipe",

    label:
      "Ranking Geral da Equipe",

    available:
      current.participants > 0,

    score:
      clamp(
        score
      ),

    confidence:
      clamp(
        50 +
        current.participants *
        5
      ),

    volume:
      current.totalPoints,

    goal:
      MINIMUM_POINTS_PER_USER,

    current:
      current.hitRate,

    previous:
      previous.hitRate,

    difference,

    positivePoints,

    attentionPoints,

    recommendations,

    details: {
      ...current,

      previousParticipants:
        previous.participants,

      previousTotalPoints:
        previous.totalPoints,

      previousReachedMinimum:
        previous.reachedMinimum,

      previousBelowMinimum:
        previous.belowMinimum,

      previousHitRate:
        previous.hitRate,

      minimumPerUser:
        MINIMUM_POINTS_PER_USER,
    },
  };
}

// ============================================================================
// MÉTRICA: RITMO GERAL DA OPERAÇÃO
// ============================================================================

function buildGeneralPerformanceMetric() {
  const currentWeekKey =
    getWeekKeySP();

  const previousWeekKey =
    addDaysToWeekKey(
      currentWeekKey,
      -7
    );

  const current =
    collectWeekData(
      currentWeekKey
    );

  const previous =
    collectWeekData(
      previousWeekKey
    );

  const weekProgress =
    getCurrentWeekProgress();

  const expectedNow =
    GENERAL_WEEKLY_GOAL *
    weekProgress;

  const paceScore =
    expectedNow > 0
      ? clamp(
          (
            current.totalPoints /
            expectedNow
          ) *
          100
        )
      : 0;

  const finalCompletion =
    clamp(
      (
        current.totalPoints /
        GENERAL_WEEKLY_GOAL
      ) *
      100
    );

  /*
   * O ritmo atual é a parte principal.
   * O progresso final impede nota máxima cedo demais.
   */
  const score =
    paceScore *
      0.75 +
    finalCompletion *
      0.25;

  const difference =
    current.totalPoints -
    previous.totalPoints;

  const projectedTotal =
    current.totalPoints /
    Math.max(
      0.08,
      weekProgress
    );

  const positivePoints = [];
  const attentionPoints = [];
  const recommendations = [];

  if (
    current.totalPoints >=
    expectedNow
  ) {
    positivePoints.push(
      `A operação está no ritmo esperado para o momento atual da semana.`
    );
  }

  if (
    difference > 0
  ) {
    positivePoints.push(
      `A semana atual possui ${difference} ponto(s) a mais do que a semana anterior no total disponível.`
    );
  }

  if (
    current.totalPoints <
    expectedNow
  ) {
    attentionPoints.push(
      `Para este momento da semana, o ritmo esperado seria de aproximadamente ${Math.round(expectedNow)} pontos. O total atual é ${current.totalPoints}.`
    );
  }

  if (
    difference < 0
  ) {
    attentionPoints.push(
      `O total atual está ${Math.abs(difference)} ponto(s) abaixo dos ${previous.totalPoints} pontos da semana anterior.`
    );
  }

  if (
    projectedTotal <
    GENERAL_WEEKLY_GOAL
  ) {
    attentionPoints.push(
      `Mantendo o ritmo atual, a projeção de fechamento é de aproximadamente ${Math.round(projectedTotal)} pontos.`
    );
  }

  recommendations.push(
    projectedTotal >=
      GENERAL_WEEKLY_GOAL
      ? "Manter o ritmo atual e evitar concentração das atividades em poucas pessoas."
      : `Será necessário aumentar o ritmo para buscar os ${GENERAL_WEEKLY_GOAL} pontos até sábado.`
  );

  return {
    id:
      "desempenho_geral",

    label:
      "Desempenho Geral da Semana",

    available:
      current.totalPoints > 0,

    score:
      clamp(
        score
      ),

    confidence:
      clamp(
        60 +
        current.participants *
        3
      ),

    volume:
      current.totalPoints,

    goal:
      GENERAL_WEEKLY_GOAL,

    current:
      current.totalPoints,

    previous:
      previous.totalPoints,

    difference,

    positivePoints,

    attentionPoints,

    recommendations,

    details: {
      ...current,

      previousTotalPoints:
        previous.totalPoints,

      weekProgress,

      expectedNow,

      paceScore,

      finalCompletion,

      projectedTotal,

      remaining:
        Math.max(
          0,
          GENERAL_WEEKLY_GOAL -
          current.totalPoints
        ),
    },
  };
}

// ============================================================================
// MÉTRICA: PRESENÇAS / BATE PONTO
// ============================================================================

async function buildPresenceMetric(
  context = {}
) {
  const client =
    context.client ||
    null;

  const currentWeekKey =
    context.currentWeek?.key ||
    getWeekKeySP();

  const previousWeekKey =
    context.previousWeek?.key ||
    addDaysToWeekKey(
      currentWeekKey,
      -7
    );

  /*
   * Reutiliza a varredura histórica compartilhada.
   *
   * Ela lê os canais e arquivos oficiais uma única vez
   * durante esta atualização do NPS.
   */
  const operationalData =
    await getFreshPayEvtOperationalData(
      context
    );

  const currentBucket =
    operationalData.byWeek?.[
      currentWeekKey
    ] || {};

  const previousBucket =
    operationalData.byWeek?.[
      previousWeekKey
    ] || {};

  const currentRecords =
    Math.max(
      0,
      Number(
        currentBucket.eventsBatePonto ||
        0
      )
    );

  const previousRecords =
    Math.max(
      0,
      Number(
        previousBucket.eventsBatePonto ||
        0
      )
    );

  const weekProgress =
    Math.max(
      0.08,
      Number(
        context.currentMoment
          ?.progress ||
        getCurrentWeekProgress()
      )
    );

  const expectedNow =
    PRESENCE_WEEKLY_GOAL *
    weekProgress;

  const paceScore =
    expectedNow > 0
      ? clamp(
          (
            currentRecords /
            expectedNow
          ) *
          100
        )
      : (
          currentRecords > 0
            ? 100
            : 0
        );

  const finalCompletion =
    clamp(
      (
        currentRecords /
        PRESENCE_WEEKLY_GOAL
      ) *
      100
    );

  /*
   * A nota dá prioridade ao ritmo da semana.
   *
   * 75% = ritmo diante do momento atual;
   * 25% = conclusão efetiva da meta semanal.
   */
  const score =
    paceScore *
      0.75 +
    finalCompletion *
      0.25;

  const difference =
    currentRecords -
    previousRecords;

  const projectedTotal =
    currentRecords /
    Math.max(
      0.08,
      weekProgress
    );

  const currentEvents =
    Array.isArray(
      operationalData.events
    )
      ? operationalData.events.filter(
          event =>
            event?.kind ===
              "bateponto" &&
            event?.periodKey ===
              currentWeekKey
        )
      : [];

  const previousEvents =
    Array.isArray(
      operationalData.events
    )
      ? operationalData.events.filter(
          event =>
            event?.kind ===
              "bateponto" &&
            event?.periodKey ===
              previousWeekKey
        )
      : [];

  const currentParticipants =
    new Set(
      currentEvents
        .map(
          event =>
            String(
              event?.userId ||
              ""
            )
        )
        .filter(Boolean)
    );

  const previousParticipants =
    new Set(
      previousEvents
        .map(
          event =>
            String(
              event?.userId ||
              ""
            )
        )
        .filter(Boolean)
    );

  const teamTotals = {};

  for (
    const event of
    currentEvents
  ) {
    const team =
      String(
        event?.team ||
        event?.payload?.team ||
        "Equipe não identificada"
      ).trim();

    teamTotals[team] =
      Number(
        teamTotals[team] ||
        0
      ) +
      1;
  }

  const positivePoints = [];
  const attentionPoints = [];
  const recommendations = [];

  if (
    currentRecords >=
    expectedNow
  ) {
    positivePoints.push(
      `O Bate Ponto está acompanhando o ritmo esperado para este momento da semana, com ${currentRecords} registro(s) realizados.`
    );
  }

  if (
    difference > 0
  ) {
    positivePoints.push(
      `Foram registrados ${difference} ponto(s) a mais do que na semana anterior.`
    );
  }

  if (
    currentParticipants.size > 0
  ) {
    positivePoints.push(
      `${currentParticipants.size} participante(s) diferente(s) já registraram presença nesta semana.`
    );
  }

  if (
    currentRecords <
    expectedNow
  ) {
    attentionPoints.push(
      `Para o momento atual da semana, o ritmo esperado seria de aproximadamente ${Math.round(expectedNow)} registros. O total atual é ${currentRecords}.`
    );
  }

  if (
    difference < 0
  ) {
    attentionPoints.push(
      `O volume atual está ${Math.abs(difference)} registro(s) abaixo da semana anterior.`
    );
  }

  if (
    projectedTotal <
    PRESENCE_WEEKLY_GOAL
  ) {
    attentionPoints.push(
      `Mantendo o ritmo atual, a projeção de fechamento é de aproximadamente ${Math.round(projectedTotal)} registros de presença.`
    );
  }

  recommendations.push(
    projectedTotal >=
      PRESENCE_WEEKLY_GOAL
      ? "Manter os lembretes e acompanhar se os registros permanecem distribuídos entre todas as equipes."
      : `Reforçar os lembretes de Bate Ponto para buscar pelo menos ${PRESENCE_WEEKLY_GOAL} registros até o encerramento da semana.`
  );

  return {
    id:
      "bate_ponto",

    label:
      "Bate Ponto da Equipe",

    available:
      currentRecords > 0 ||
      previousRecords > 0,

    score:
      clamp(
        score
      ),

    confidence:
      clamp(
        55 +
        currentRecords *
        3
      ),

    volume:
      currentRecords,

    goal:
      PRESENCE_WEEKLY_GOAL,

    current:
      currentRecords,

    previous:
      previousRecords,

    difference,

    positivePoints,

    attentionPoints,

    recommendations,

    details: {
      currentWeekKey,

      previousWeekKey,

      currentRecords,

      previousRecords,

      participants:
        currentParticipants.size,

      previousParticipants:
        previousParticipants.size,

      expectedNow,

      paceScore,

      finalCompletion,

      projectedTotal,

      remaining:
        Math.max(
          0,
          PRESENCE_WEEKLY_GOAL -
          currentRecords
        ),

      teamTotals,

      byUser:
        currentEvents.reduce(
          (
            result,
            event
          ) => {
            const userId =
              String(
                event?.userId ||
                ""
              );

            if (!userId) {
              return result;
            }

            result[userId] =
              Number(
                result[userId] ||
                0
              ) +
              1;

            return result;
          },
          {}
        ),
    },
  };
}

// ============================================================================
// MÉTRICAS COMPROVADAS PELO PAY EVENT DASH
// ============================================================================

const PAY_EVT_SOURCE_METRICS = {
  registro_poderes: {
    label:
      "Registro de Poderes",

    goal:
      15,

    sourceName:
      "poderes",

    eventKinds:
      new Set([
        "poderes",
        "registros_poderes",
      ]),
  },

  hall_da_fama: {
    label:
      "Hall da Fama",

    goal:
      10,

    sourceName:
      "halldafama",

    eventKinds:
      new Set([
        "hall",
      ]),
  },

  eventos_diarios: {
    label:
      "Eventos Diários",

    goal:
      10,

    sourceName:
      "eventosdiarios",

    eventKinds:
      new Set([
        "diarios",
      ]),
  },

  cronograma: {
    label:
      "Cronograma",

    goal:
      10,

    sourceName:
      "cronograma",

    eventKinds:
      new Set([
        "cronograma",
      ]),
  },
};

function buildPayEvtUsersBySource({
  events = [],
  sourceName,
} = {}) {
  return events.reduce(
    (
      result,
      event
    ) => {
      const userId =
        String(
          event?.userId ||
          ""
        ).trim();

      if (!userId) {
        return result;
      }

      result[userId] ||= {
        total:
          0,

        points:
          0,

        sources: {
          [sourceName]:
            0,
        },
      };

      result[userId].total +=
        1;

      result[userId].points +=
        1;

      result[userId]
        .sources[
          sourceName
        ] +=
        1;

      return result;
    },
    {}
  );
}

async function buildPayEvtSourceMetric(
  metricId,
  context = {}
) {
  const definition =
    PAY_EVT_SOURCE_METRICS[
      metricId
    ];

  if (!definition) {
    return null;
  }

  const client =
    context.client ||
    null;

  const currentWeekKey =
    context.currentWeek?.key ||
    getWeekKeySP();

  const previousWeekKey =
    context.previousWeek?.key ||
    addDaysToWeekKey(
      currentWeekKey,
      -7
    );

  /*
   * Esta coleta executa os scanners oficiais do payEvtDash.
   *
   * Ela lê canais, logs e arquivos persistentes.
   * Não utiliza o Ranking Geral como fonte primária.
   */
  const operationalData =
    await getFreshPayEvtOperationalData(
      context
    );

  const allEvents =
    Array.isArray(
      operationalData?.events
    )
      ? operationalData.events
      : [];

  const currentEvents =
    allEvents.filter(
      event =>
        event?.periodKey ===
          currentWeekKey &&
        definition.eventKinds.has(
          String(
            event?.kind ||
            ""
          )
        )
    );

  const previousEvents =
    allEvents.filter(
      event =>
        event?.periodKey ===
          previousWeekKey &&
        definition.eventKinds.has(
          String(
            event?.kind ||
            ""
          )
        )
    );

  const current =
    currentEvents.length;

  const previous =
    previousEvents.length;

  const difference =
    current -
    previous;

  const weekProgress =
    Math.max(
      0.08,
      Number(
        context.currentMoment
          ?.progress ||
        getCurrentWeekProgress()
      )
    );

  const expectedNow =
    definition.goal *
    weekProgress;

  const paceScore =
    expectedNow > 0
      ? clamp(
          (
            current /
            expectedNow
          ) *
          100
        )
      : current > 0
        ? 100
        : 0;

  const completionScore =
    definition.goal > 0
      ? clamp(
          (
            current /
            definition.goal
          ) *
          100
        )
      : 0;

  /*
   * 75% considera o ritmo proporcional ao momento da semana.
   * 25% considera o cumprimento efetivo da meta.
   */
  const score =
    paceScore *
      0.75 +
    completionScore *
      0.25;

  const projectedTotal =
    current /
    Math.max(
      0.08,
      weekProgress
    );

  const participants =
    new Set(
      currentEvents
        .map(
          event =>
            String(
              event?.userId ||
              ""
            )
        )
        .filter(Boolean)
    );

  const positivePoints = [];
  const attentionPoints = [];
  const recommendations = [];

  if (
    current > 0
  ) {
    positivePoints.push(
      `${current} atividade(s) foram comprovadas diretamente pelos canais e logs oficiais nesta semana.`
    );
  }

  if (
    participants.size > 0
  ) {
    positivePoints.push(
      `${participants.size} pessoa(s) diferente(s) contribuíram nesta atividade.`
    );
  }

  if (
    difference > 0
  ) {
    positivePoints.push(
      `A semana atual possui ${difference} atividade(s) a mais do que a semana anterior.`
    );
  }

  if (
    difference < 0
  ) {
    attentionPoints.push(
      `O volume atual está ${Math.abs(difference)} atividade(s) abaixo da semana anterior.`
    );
  }

  if (
    current <
    expectedNow
  ) {
    attentionPoints.push(
      `Para o momento atual da semana, seriam esperadas aproximadamente ${Math.round(expectedNow)} atividade(s). O total comprovado é ${current}.`
    );
  }

  if (
    projectedTotal <
    definition.goal
  ) {
    attentionPoints.push(
      `Mantendo o ritmo atual, a projeção é encerrar a semana com aproximadamente ${Math.round(projectedTotal)} atividade(s).`
    );
  }

  recommendations.push(
    projectedTotal >=
      definition.goal
      ? "Manter o ritmo atual e distribuir a atividade entre mais integrantes da equipe."
      : `Reforçar esta atividade para buscar pelo menos ${definition.goal} registros comprovados até o fechamento semanal.`
  );

  const byUser =
    buildPayEvtUsersBySource({
      events:
        currentEvents,

      sourceName:
        definition.sourceName,
    });

  const scanDiagnostic = {
    metricId,

    label:
      definition.label,

    currentWeekKey,

    previousWeekKey,

    acceptedKinds:
      [
        ...definition.eventKinds,
      ],

    allEvents:
      allEvents.length,

    currentEvents:
      currentEvents.length,

    previousEvents:
      previousEvents.length,

    knownKinds:
      [
        ...new Set(
          allEvents.map(
            event =>
              String(
                event?.kind ||
                "sem_kind"
              )
          )
        ),
      ],

    scannedChannels: {
      ...(
        operationalData?.debug
          ?.scannedChannels ||
        {}
      ),
    },

    recoveredFromLogs:
      Number(
        operationalData?.debug
          ?.recoveredFromLogs ||
        0
      ),

    duplicatesIgnored:
      Number(
        operationalData?.debug
          ?.duplicatesIgnored ||
        0
      ),
  };

  console.log(
    `[NPS Providers] Diagnóstico da fonte ${metricId}:`,
    scanDiagnostic
  );

  return {
    id:
      metricId,

    label:
      definition.label,

    available:
      current > 0 ||
      previous > 0,

    officialSource:
      true,

    sourceType:
      "discord_logs_and_persistent_dashboard",

    source:
      definition.sourceName,

    score:
      clamp(
        score
      ),

    confidence:
      clamp(
        55 +
        current *
        4
      ),

    volume:
      current,

    goal:
      definition.goal,

    current,

    previous,

    difference,

    positivePoints,
    attentionPoints,
    recommendations,

    details: {
      currentWeekKey,
      previousWeekKey,

      current,
      previous,
      difference,

      expectedNow,
      paceScore,
      completionScore,
      projectedTotal,

      participants:
        participants.size,

      byUser,

      records:
        currentEvents,

      previousRecords:
        previousEvents,

      scanDiagnostic,

      scanDebug: {
        scannedChannels: {
          ...(
            operationalData?.debug
              ?.scannedChannels ||
            {}
          ),
        },

        recoveredFromLogs:
          Number(
            operationalData?.debug
              ?.recoveredFromLogs ||
            0
          ),

        duplicatesIgnored:
          Number(
            operationalData?.debug
              ?.duplicatesIgnored ||
            0
          ),
      },
    },
  };
}

// ============================================================================
// MÉTRICA: CONFIRMAÇÃO DE ORGANIZAÇÕES
// ============================================================================

function buildOrganizationConfirmationMetric() {
  const state =
    readJson(
      ORGANIZATION_CONFIRMATION_FILE,
      {
        statuses:
          {},

        lastWeekKey:
          null,

        lastResetDate:
          null,
      }
    );

  const statuses =
    state?.statuses &&
    typeof state.statuses ===
      "object"
      ? state.statuses
      : {};

  const organizations =
    Object.entries(
      statuses
    );

  const confirmed =
    organizations.filter(
      (
        [
          ,
          information,
        ]
      ) =>
        information?.status ===
        "YES"
    );

  const absent =
    organizations.filter(
      (
        [
          ,
          information,
        ]
      ) =>
        information?.status ===
        "NO"
    );

  const pending =
    organizations.filter(
      (
        [
          ,
          information,
        ]
      ) =>
        !information ||
        information.status ===
          "PENDING"
    );

  const totalOrganizations =
    organizations.length;

  const answered =
    confirmed.length +
    absent.length;

  const responseRate =
    totalOrganizations > 0
      ? (
          answered /
          totalOrganizations
        ) *
        100
      : 0;

  const attendanceRate =
    answered > 0
      ? (
          confirmed.length /
          answered
        ) *
        100
      : 0;

  /*
   * A confirmação precisa avaliar duas coisas diferentes:
   *
   * 65% = organizações que responderam, independentemente
   *       de terem informado presença ou ausência;
   *
   * 35% = proporção das respostas positivas.
   *
   * Dessa forma, uma organização que informa ausência
   * não é tratada como se tivesse ignorado o painel.
   */
  const score =
    responseRate *
      0.65 +
    attendanceRate *
      0.35;

  const responsibleUsers =
    new Set(
      organizations
        .map(
          (
            [
              ,
              information,
            ]
          ) =>
            String(
              information?.by ||
              ""
            )
        )
        .filter(Boolean)
    );

  const positivePoints = [];
  const attentionPoints = [];
  const recommendations = [];

  if (
    answered > 0
  ) {
    positivePoints.push(
      `${answered} de ${totalOrganizations} organizações já responderam ao painel de confirmação.`
    );
  }

  if (
    confirmed.length > 0
  ) {
    positivePoints.push(
      `${confirmed.length} organização(ões) confirmaram presença até o momento.`
    );
  }

  if (
    responseRate >= 80
  ) {
    positivePoints.push(
      `A taxa de resposta está em ${responseRate.toFixed(1)}%, indicando boa adesão ao processo de confirmação.`
    );
  }

  if (
    pending.length > 0
  ) {
    attentionPoints.push(
      `${pending.length} organização(ões) ainda não responderam ao painel.`
    );
  }

  if (
    absent.length > 0
  ) {
    attentionPoints.push(
      `${absent.length} organização(ões) informaram ausência nesta janela.`
    );
  }

  if (
    responseRate < 60 &&
    totalOrganizations > 0
  ) {
    attentionPoints.push(
      `A taxa de resposta está em ${responseRate.toFixed(1)}%, o que ainda deixa uma parte importante das organizações sem posicionamento.`
    );
  }

  recommendations.push(
    pending.length > 0
      ? `Entrar em contato com as ${pending.length} organização(ões) pendentes antes do fechamento da janela de confirmação.`
      : "Manter o acompanhamento atual, pois todas as organizações cadastradas já apresentaram uma resposta."
  );

  if (
    absent.length > 0
  ) {
    recommendations.push(
      "Avaliar as ausências informadas para identificar se existe concentração por cidade, horário ou tipo de evento."
    );
  }

return {
  id:
    "presencas",

  label:
    "Presença das ORGs nos Eventos",

  /*
   * A existência de organizações cadastradas não significa
   * que a janela de confirmação já produziu dados válidos.
   *
   * A métrica somente participa da nota quando pelo menos
   * uma organização confirmar presença ou informar ausência.
   *
   * Enquanto todas permanecerem pendentes, o provedor continua
   * entregando os detalhes, mas não influencia o NPS Geral.
   */
  available:
    answered > 0,

  score:
    clamp(
      score
    ),

  confidence:
    clamp(
      50 +
      answered *
      3
    ),

  volume:
    answered,

  goal:
    totalOrganizations,

  current:
    answered,

  /*
   * O arquivo atual é reiniciado por dia e por semana.
   *
   * O histórico será construído pelos snapshots do próprio
   * NPS a partir desta implementação.
   */
  previous:
    null,

  difference:
    null,

  positivePoints,

  attentionPoints,

  recommendations,

  details: {
    weekKey:
      state.lastWeekKey ||
      null,

    lastResetDate:
      state.lastResetDate ||
      null,

    totalOrganizations,

    answered,

    approved:
      confirmed.length,

    confirmed:
      confirmed.length,

    rejected:
      absent.length,

    absent:
      absent.length,

    pending:
      pending.length,

    responseRate,

    attendanceRate,

    participants:
      responsibleUsers.size,

    responsibleUsers:
      [
        ...responsibleUsers,
      ],

    confirmedOrganizations:
      confirmed.map(
        (
          [
            organization,
          ]
        ) =>
          organization
      ),

    absentOrganizations:
      absent.map(
        (
          [
            organization,
          ]
        ) =>
          organization
      ),

    pendingOrganizations:
      pending.map(
        (
          [
            organization,
          ]
        ) =>
          organization
      ),

    byUser:
      organizations.reduce(
        (
          result,
          [
            ,
            information,
          ]
        ) => {
          const userId =
            String(
              information?.by ||
              ""
            );

          if (!userId) {
            return result;
          }

          result[userId] =
            Number(
              result[userId] ||
              0
            ) +
            1;

          return result;
        },
        {}
      ),
  },
};
}

// ============================================================================
// MÉTRICA: PAGAMENTOS
// ============================================================================

async function buildPaymentMetric(
  context = {}
) {
  const client =
    context.client ||
    null;

  const currentWeekKey =
    context.currentWeek?.key ||
    getWeekKeySP();

  const previousWeekKey =
    context.previousWeek?.key ||
    addDaysToWeekKey(
      currentWeekKey,
      -7
    );

  /*
   * Reutiliza a varredura histórica compartilhada.
   *
   * Ela lê os canais e arquivos oficiais uma única vez
   * durante esta atualização do NPS.
   */
  const operationalData =
    await getFreshPayEvtOperationalData(
      context
    );

  const currentBucket =
    operationalData.byWeek?.[
      currentWeekKey
    ] || {};

  const previousBucket =
    operationalData.byWeek?.[
      previousWeekKey
    ] || {};

  const approved =
    Math.max(
      0,
      Number(
        currentBucket.paymentsApproved ||
        0
      )
    );

  const rejected =
    Math.max(
      0,
      Number(
        currentBucket.paymentsRejected ||
        0
      )
    );

  const requested =
    Math.max(
      0,
      Number(
        currentBucket.paymentsRequested ||
        0
      )
    );

  const previousApproved =
    Math.max(
      0,
      Number(
        previousBucket.paymentsApproved ||
        0
      )
    );

  const previousRejected =
    Math.max(
      0,
      Number(
        previousBucket.paymentsRejected ||
        0
      )
    );

  const previousRequested =
    Math.max(
      0,
      Number(
        previousBucket.paymentsRequested ||
        0
      )
    );

  const decided =
    approved +
    rejected;

  const previousDecided =
    previousApproved +
    previousRejected;

  const approvalRate =
    decided > 0
      ? (
          approved /
          decided
        ) *
        100
      : 0;

  const previousApprovalRate =
    previousDecided > 0
      ? (
          previousApproved /
          previousDecided
        ) *
        100
      : 0;

  const weekProgress =
    Math.max(
      0.08,
      Number(
        context.currentMoment
          ?.progress ||
        getCurrentWeekProgress()
      )
    );

  const expectedNow =
    PAYMENT_WEEKLY_GOAL *
    weekProgress;

  const paceScore =
    expectedNow > 0
      ? clamp(
          (
            approved /
            expectedNow
          ) *
          100
        )
      : (
          approved > 0
            ? 100
            : 0
        );

  /*
   * A nota de pagamentos considera:
   *
   * 70% = qualidade das decisões, medida pela aprovação;
   * 30% = ritmo de pagamentos aprovados diante da meta.
   */
  const score =
    approvalRate *
      0.70 +
    paceScore *
      0.30;

  const difference =
    approved -
    previousApproved;

  const projectedApproved =
    approved /
    Math.max(
      0.08,
      weekProgress
    );

  const currentPayments =
    Array.isArray(
      operationalData.payments
    )
      ? operationalData.payments.filter(
          payment =>
            payment?.periodKey ===
              currentWeekKey
        )
      : [];

  const responsibleCreators =
    new Set(
      currentPayments
        .map(
          payment =>
            String(
              payment?.creatorId ||
              ""
            )
        )
        .filter(Boolean)
    );

  const decisionUsers =
    new Set(
      currentPayments
        .map(
          payment =>
            String(
              payment?.decisionUserId ||
              ""
            )
        )
        .filter(Boolean)
    );

  const positivePoints = [];
  const attentionPoints = [];
  const recommendations = [];

  if (
    approved > 0
  ) {
    positivePoints.push(
      `${approved} pagamento(s) foram aprovados nesta semana.`
    );
  }

  if (
    approvalRate >= 85 &&
    decided > 0
  ) {
    positivePoints.push(
      `A taxa de aprovação está em ${approvalRate.toFixed(1)}%, indicando boa qualidade nos registros enviados.`
    );
  }

  if (
    difference > 0
  ) {
    positivePoints.push(
      `A semana atual possui ${difference} pagamento(s) aprovado(s) a mais do que a semana anterior.`
    );
  }

  if (
    responsibleCreators.size > 0
  ) {
    positivePoints.push(
      `${responsibleCreators.size} pessoa(s) diferente(s) criaram registros de pagamento nesta semana.`
    );
  }

  if (
    requested > 0
  ) {
    attentionPoints.push(
      `${requested} pagamento(s) permanecem solicitados e ainda aguardam uma decisão final.`
    );
  }

  if (
    rejected > 0
  ) {
    attentionPoints.push(
      `${rejected} pagamento(s) foram reprovados nesta semana.`
    );
  }

  if (
    approvalRate < 80 &&
    decided > 0
  ) {
    attentionPoints.push(
      `A taxa de aprovação está em ${approvalRate.toFixed(1)}%. As reprovações estão reduzindo a qualidade do processo.`
    );
  }

  if (
    approved <
    expectedNow
  ) {
    attentionPoints.push(
      `Para este momento da semana, seriam esperados aproximadamente ${Math.round(expectedNow)} pagamentos aprovados. O total atual é ${approved}.`
    );
  }

  if (
    projectedApproved <
    PAYMENT_WEEKLY_GOAL
  ) {
    attentionPoints.push(
      `Mantendo o ritmo atual, a projeção é encerrar a semana com aproximadamente ${Math.round(projectedApproved)} pagamentos aprovados.`
    );
  }

  if (
    requested > 0
  ) {
    recommendations.push(
      `Revisar os ${requested} pagamento(s) solicitados para reduzir a fila pendente e evitar acúmulo próximo ao fechamento.`
    );
  }

  if (
    rejected > 0
  ) {
    recommendations.push(
      "Revisar os motivos das reprovações e orientar os responsáveis sobre os erros mais recorrentes."
    );
  }

  recommendations.push(
    projectedApproved >=
      PAYMENT_WEEKLY_GOAL
      ? "Manter o ritmo atual de análise, preservando a qualidade das aprovações."
      : `Aumentar o ritmo de análise para buscar pelo menos ${PAYMENT_WEEKLY_GOAL} pagamentos aprovados até o encerramento da semana.`
  );

  return {
    id:
      "pagamentos",

    label:
      "Pagamentos Social Media",

    source:
      "pagamentos",

    officialSource:
      true,

    sourceType:
      "discord_logs_and_persistent_dashboard",

    sourceChannelId:
      "1387922662134775818",

    sourceLogChannelId:
      "1486084352403312843",

    available:
      approved > 0 ||
      rejected > 0 ||
      requested > 0 ||
      previousApproved > 0 ||
      previousRejected > 0 ||
      previousRequested > 0,

    score:
      clamp(
        score
      ),

    confidence:
      clamp(
        55 +
        decided *
        4
      ),

    volume:
      approved +
      rejected +
      requested,

    goal:
      PAYMENT_WEEKLY_GOAL,

    current:
      approved,

    previous:
      previousApproved,

    difference,

    positivePoints,

    attentionPoints,

    recommendations,

    details: {
      currentWeekKey,

      previousWeekKey,

      approved,

      rejected,

      requested,

      pending:
        requested,

      decided,

      approvalRate,

      previousApproved,

      previousRejected,

      previousRequested,

      previousDecided,

      previousApprovalRate,

      expectedNow,

      paceScore,

      projectedApproved,

      remaining:
        Math.max(
          0,
          PAYMENT_WEEKLY_GOAL -
          approved
        ),

      participants:
        responsibleCreators.size,

      responsibleCreators:
        [
          ...responsibleCreators,
        ],

      decisionUsers:
        [
          ...decisionUsers,
        ],

      /*
       * Distribuição por criador do registro.
       *
       * Somente pagamentos aprovados entram em "sources.pagamentos",
       * porque somente eles entregam ponto operacional.
       *
       * Reprovados e solicitados continuam disponíveis para
       * diagnóstico, mas não contam como produtividade concluída.
       */
      byUser:
        currentPayments.reduce(
          (
            result,
            payment
          ) => {
            const userId =
              String(
                payment?.creatorId ||
                ""
              ).trim();

            if (!userId) {
              return result;
            }

            result[userId] ||= {
              total:
                0,

              points:
                0,

              approved:
                0,

              rejected:
                0,

              requested:
                0,

              sources: {
                pagamentos:
                  0,
              },
            };

            result[userId].total +=
              1;

            if (
              payment.status ===
              "approved"
            ) {
              result[userId].approved +=
                1;

              result[userId].points +=
                1;

              result[userId]
                .sources
                .pagamentos +=
                1;
            }

            if (
              payment.status ===
              "rejected"
            ) {
              result[userId].rejected +=
                1;
            }

            if (
              payment.status ===
              "requested"
            ) {
              result[userId].requested +=
                1;
            }

            return result;
          },
          {}
        ),

      /*
       * Distribuição das decisões.
       *
       * Esta estrutura não entrega pontos.
       * Ela serve para identificar quem está analisando
       * e concluindo os pagamentos.
       */
      decisionsByUser:
        currentPayments.reduce(
          (
            result,
            payment
          ) => {
            const decisionUserId =
              String(
                payment?.decisionUserId ||
                ""
              ).trim();

            if (!decisionUserId) {
              return result;
            }

            result[
              decisionUserId
            ] ||= {
              total:
                0,

              approved:
                0,

              rejected:
                0,

              requested:
                0,
            };

            result[
              decisionUserId
            ].total +=
              1;

            if (
              payment.status ===
              "approved"
            ) {
              result[
                decisionUserId
              ].approved +=
                1;
            }

            if (
              payment.status ===
              "rejected"
            ) {
              result[
                decisionUserId
              ].rejected +=
                1;
            }

            if (
              payment.status ===
              "requested"
            ) {
              result[
                decisionUserId
              ].requested +=
                1;
            }

            return result;
          },
          {}
        ),
    },
  };
}

function npsWeekKeyToChecklistWeekKey(
  weekKey
) {
  const raw =
    String(
      weekKey ||
      ""
    ).trim();

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      raw
    )
  ) {
    return raw;
  }

  const date =
    new Date(
      `${raw}T12:00:00-03:00`
    );

  date.setDate(
    date.getDate() -
    1
  );

  return new Intl.DateTimeFormat(
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
    }
  ).format(
    date
  );
}

/*
 * ============================================================================
 * MÉTRICA: CHECKLIST SEMANAL DE LOGS
 * ============================================================================
 *
 * Avalia a eficiência dos Responsáveis na conferência
 * das logs dos membros vinculados a eles.
 *
 * Regra operacional:
 *
 * • terminou no domingo = excelente;
 * • terminou na segunda = bom;
 * • terminou na terça = atenção;
 * • terminou na quarta = atrasado;
 * • terminou quinta/sexta = muito atrasado;
 * • deixou membro pendente = crítico.
 *
 * A métrica também compara o resultado com a semana anterior.
 */
function buildWeeklyLogChecklistMetric(
  context = {}
) {
  const checklist =
    readJson(
      LOG_CHECKLIST_FILE,
      {
        weeks:
          {},
      }
    );

  const currentNpsWeekKey =
    String(
      context.currentWeek?.key ||
      ""
    );

  const previousNpsWeekKey =
    String(
      context.previousWeek?.key ||
      ""
    );

  const currentChecklistWeekKey =
    npsWeekKeyToChecklistWeekKey(
      currentNpsWeekKey
    );

  const previousChecklistWeekKey =
    npsWeekKeyToChecklistWeekKey(
      previousNpsWeekKey
    );

  const currentWeek =
    checklist?.weeks?.[
      currentChecklistWeekKey
    ] || {
      responsaveis:
        {},
    };

  const previousWeek =
    checklist?.weeks?.[
      previousChecklistWeekKey
    ] || {
      responsaveis:
        {},
    };

  /*
   * Descobre em qual dia um responsável terminou
   * todas as conferências dele.
   */
  function getCompletionDayInformation(
    completedAt
  ) {
    if (
      !Number.isFinite(
        Number(
          completedAt
        )
      ) ||
      Number(
        completedAt
      ) <=
        0
    ) {
      return {
        label:
          "Não concluído",

        level:
          "critical",

        score:
          0,

        day:
          null,
      };
    }

    const date =
      new Date(
        Number(
          completedAt
        )
      );

    const weekday =
      new Intl.DateTimeFormat(
        "en-US",
        {
          timeZone:
            TZ,

          weekday:
            "short",
        }
      ).format(
        date
      );

    /*
     * Sun = domingo
     * Mon = segunda
     * Tue = terça
     * Wed = quarta
     * Thu = quinta
     * Fri = sexta
     * Sat = sábado
     */
    if (
      weekday ===
      "Sun"
    ) {
      return {
        label:
          "Concluiu no domingo",

        level:
          "excellent",

        score:
          100,

        day:
          weekday,
      };
    }

    if (
      weekday ===
      "Mon"
    ) {
      return {
        label:
          "Concluiu na segunda-feira",

        level:
          "good",

        score:
          85,

        day:
          weekday,
      };
    }

    if (
      weekday ===
      "Tue"
    ) {
      return {
        label:
          "Concluiu na terça-feira",

        level:
          "attention",

        score:
          65,

        day:
          weekday,
      };
    }

    if (
      weekday ===
      "Wed"
    ) {
      return {
        label:
          "Concluiu na quarta-feira",

        level:
          "late",

        score:
          45,

        day:
          weekday,
      };
    }

    if (
      weekday ===
        "Thu" ||
      weekday ===
        "Fri"
    ) {
      return {
        label:
          `Concluiu ${
            weekday ===
              "Thu"
              ? "na quinta-feira"
              : "na sexta-feira"
          }`,

        level:
          "critical",

        score:
          25,

        day:
          weekday,
      };
    }

    return {
      label:
        "Concluiu fora do período esperado",

      level:
        "critical",

      score:
        20,

      day:
        weekday,
    };
  }

  /*
   * Analisa uma semana inteira.
   */
  function analyzeChecklistWeek(
    weekData
  ) {
    const responsaveis =
      Object.entries(
        weekData?.responsaveis ||
        {}
      );

    const byResponsible =
      {};

    let totalMembers =
      0;

    let checkedMembers =
      0;

    let completedResponsibles =
      0;

    let responsiblesWithPending =
      0;

    let timelinessScoreTotal =
      0;

    let timelinessSamples =
      0;

    for (
      const [
        responsibleId,
        responsibleData,
      ] of responsaveis
    ) {
      const members =
        Object.entries(
          responsibleData
            ?.members ||
          {}
        );

      /*
       * Responsável sem membro vinculado não entra
       * na nota de cumprimento.
       */
      if (
        members.length ===
        0
      ) {
        byResponsible[
          responsibleId
        ] = {
          responsibleId,

          total:
            0,

          checked:
            0,

          pending:
            0,

          completed:
            true,

          completedAt:
            null,

          completion:
            null,

          ignored:
            true,
        };

        continue;
      }

      const checked =
        members.filter(
          (
            [
              ,
              member,
            ]
          ) =>
            member?.checked ===
            true
        );

      const pending =
        members.length -
        checked.length;

      totalMembers +=
        members.length;

      checkedMembers +=
        checked.length;

      const completed =
        pending ===
        0;

      let completedAt =
        null;

      if (
        completed
      ) {
        const timestamps =
          checked
            .map(
              (
                [
                  ,
                  member,
                ]
              ) =>
                Number(
                  member?.checkedAt ||
                  0
                )
            )
            .filter(
              timestamp =>
                Number.isFinite(
                  timestamp
                ) &&
                timestamp >
                  0
            );

        /*
         * O responsável terminou quando a última log
         * necessária foi marcada como conferida.
         */
        if (
          timestamps.length ===
          checked.length &&
          timestamps.length >
            0
        ) {
          completedAt =
            Math.max(
              ...timestamps
            );
        }
      }

      const completion =
        getCompletionDayInformation(
          completedAt
        );

      if (
        completed
      ) {
        completedResponsibles +=
          1;
      } else {
        responsiblesWithPending +=
          1;
      }

      if (
        completed &&
        completedAt
      ) {
        timelinessScoreTotal +=
          completion.score;

        timelinessSamples +=
          1;
      }

      byResponsible[
        responsibleId
      ] = {
        responsibleId,

        total:
          members.length,

        checked:
          checked.length,

        pending,

        completed,

        completedAt,

        completion,

        ignored:
          false,

        members:
          Object.fromEntries(
            members.map(
              (
                [
                  memberId,
                  member,
                ]
              ) => [
                memberId,
                {
                  checked:
                    member?.checked ===
                    true,

                  checkedAt:
                    member?.checkedAt ||
                    null,

                  checkedBy:
                    member?.checkedBy ||
                    null,
                },
              ]
            )
          ),
      };
    }

    const validResponsibles =
      Object.values(
        byResponsible
      ).filter(
        responsible =>
          responsible.ignored !==
          true
      );

    const totalResponsibles =
      validResponsibles.length;

    const completionRate =
      totalMembers >
        0
        ? (
            checkedMembers /
            totalMembers
          ) *
          100
        : 0;

    const responsibleCompletionRate =
      totalResponsibles >
        0
        ? (
            completedResponsibles /
            totalResponsibles
          ) *
          100
        : 0;

    const averageTimeliness =
      timelinessSamples >
        0
        ? timelinessScoreTotal /
          timelinessSamples
        : 0;

    /*
     * 65% = todas as logs realmente conferidas;
     * 35% = rapidez para finalizar.
     *
     * Se houver responsável ainda pendente,
     * a falta de conclusão já derruba a primeira parte.
     */
    const score =
      totalMembers >
        0
        ? clamp(
            completionRate *
              0.65 +
            averageTimeliness *
              0.35
          )
        : 0;

    return {
      score,

      totalMembers,
      checkedMembers,

      pendingMembers:
        Math.max(
          0,
          totalMembers -
          checkedMembers
        ),

      completionRate,

      totalResponsibles,
      completedResponsibles,
      responsiblesWithPending,
      responsibleCompletionRate,
      averageTimeliness,
      byResponsible,
    };
  }

  const current =
    analyzeChecklistWeek(
      currentWeek
    );

  const previous =
    analyzeChecklistWeek(
      previousWeek
    );

  const positivePoints =
    [];

  const attentionPoints =
    [];

  const recommendations =
    [];

  if (
    current.totalMembers >
    0
  ) {
    positivePoints.push(
      `${current.checkedMembers} de ${current.totalMembers} log(s) dos membros já foram conferidas nesta semana.`
    );
  }

  if (
    current.completedResponsibles >
    0
  ) {
    positivePoints.push(
      `${current.completedResponsibles} responsável(is) já concluíram todas as conferências dos próprios membros.`
    );
  }

  const excellentResponsibles =
    Object.values(
      current.byResponsible
    ).filter(
      responsible =>
        responsible.completed &&
        responsible.completion
          ?.level ===
          "excellent"
    );

  if (
    excellentResponsibles.length >
    0
  ) {
    positivePoints.push(
      `${excellentResponsibles.length} responsável(is) finalizaram todas as logs já no domingo, dentro do prazo ideal.`
    );
  }

  const mondayResponsibles =
    Object.values(
      current.byResponsible
    ).filter(
      responsible =>
        responsible.completed &&
        responsible.completion
          ?.level ===
          "good"
    );

  if (
    mondayResponsibles.length >
    0
  ) {
    positivePoints.push(
      `${mondayResponsibles.length} responsável(is) concluíram as logs na segunda-feira.`
    );
  }

  const tuesdayOrLater =
    Object.values(
      current.byResponsible
    ).filter(
      responsible =>
        responsible.completed &&
        [
          "attention",
          "late",
          "critical",
        ].includes(
          responsible.completion
            ?.level
        )
    );

  if (
    tuesdayOrLater.length >
    0
  ) {
    attentionPoints.push(
      `${tuesdayOrLater.length} responsável(is) só terminaram as logs na terça-feira ou depois.`
    );
  }

  if (
    current.responsiblesWithPending >
    0
  ) {
    attentionPoints.push(
      `${current.responsiblesWithPending} responsável(is) ainda possuem membros com logs pendentes de conferência.`
    );

    recommendations.push(
      "Cobrar imediatamente os Responsáveis que ainda possuem logs pendentes e concluir todas as conferências."
    );
  }

  if (
    current.pendingMembers >
    0
  ) {
    attentionPoints.push(
      `${current.pendingMembers} membro(s) ainda estão sem a conferência semanal concluída.`
    );
  }

  const scoreDifference =
    current.score -
    previous.score;

  if (
    previous.totalMembers >
      0 &&
    scoreDifference >=
      5
  ) {
    positivePoints.push(
      `A conferência semanal melhorou ${scoreDifference.toFixed(1)} pontos em relação à semana passada.`
    );
  }

  if (
    previous.totalMembers >
      0 &&
    scoreDifference <=
      -5
  ) {
    attentionPoints.push(
      `A eficiência na conferência das logs caiu ${Math.abs(scoreDifference).toFixed(1)} pontos em relação à semana passada.`
    );

    recommendations.push(
      "Revisar com os Responsáveis por que a conferência das logs ficou mais lenta do que na semana passada."
    );
  }

  if (
    !recommendations.length
  ) {
    recommendations.push(
      "Manter a conferência das logs concentrada no domingo e evitar deixar membros pendentes para terça ou quarta-feira."
    );
  }

  return {
    id:
      "log_checklist",

    label:
      "Checklist Semanal de Logs",

    available:
      current.totalMembers >
        0 ||
      previous.totalMembers >
        0,

    officialSource:
      true,

    sourceType:
      "persistent_checklist",

    score:
      current.score,

    confidence:
      current.totalMembers >
        0
        ? 100
        : 0,

    /*
     * Volume representa logs conferidas.
     */
    volume:
      current.checkedMembers,

    goal:
      current.totalMembers,

    current:
      current.checkedMembers,

    previous:
      previous.checkedMembers,

    difference:
      current.checkedMembers -
      previous.checkedMembers,

    positivePoints,
    attentionPoints,
    recommendations,

    details: {
      currentWeekKey:
        currentChecklistWeekKey,

      previousWeekKey:
        previousChecklistWeekKey,

      totalMembers:
        current.totalMembers,

      checkedMembers:
        current.checkedMembers,

      pendingMembers:
        current.pendingMembers,

      completionRate:
        current.completionRate,

      totalResponsibles:
        current.totalResponsibles,

      completedResponsibles:
        current.completedResponsibles,

      responsiblesWithPending:
        current.responsiblesWithPending,

      responsibleCompletionRate:
        current.responsibleCompletionRate,

      averageTimeliness:
        current.averageTimeliness,

      byResponsible:
        current.byResponsible,

      previous: {
        totalMembers:
          previous.totalMembers,

        checkedMembers:
          previous.checkedMembers,

        pendingMembers:
          previous.pendingMembers,

        completionRate:
          previous.completionRate,

        totalResponsibles:
          previous.totalResponsibles,

        completedResponsibles:
          previous.completedResponsibles,

        responsiblesWithPending:
          previous.responsiblesWithPending,

        responsibleCompletionRate:
          previous.responsibleCompletionRate,

        averageTimeliness:
          previous.averageTimeliness,

        score:
          previous.score,

        byResponsible:
          previous.byResponsible,
      },
    },
  };
}

// ============================================================================
// REGISTRO DOS PROVEDORES
// ============================================================================
registerOperationalMetricProvider(
  "participacao_equipe",
  async () =>
    buildTeamParticipationMetric()
);

registerOperationalMetricProvider(
  "desempenho_geral",
  async () =>
    buildGeneralPerformanceMetric()
);

registerOperationalMetricProvider(
  "bate_ponto",
  async context =>
    buildPresenceMetric(
      context
    )
);

registerOperationalMetricProvider(
  "presencas",
  async () =>
    buildOrganizationConfirmationMetric()
);

registerOperationalMetricProvider(
  "pagamentos",
  async context =>
    buildPaymentMetric(
      context
    )
);

registerOperationalMetricProvider(
  "registro_poderes",
  async context =>
    buildPayEvtSourceMetric(
      "registro_poderes",
      context
    )
);

registerOperationalMetricProvider(
  "hall_da_fama",
  async context =>
    buildPayEvtSourceMetric(
      "hall_da_fama",
      context
    )
);

registerOperationalMetricProvider(
  "eventos_diarios",
  async context =>
    buildPayEvtSourceMetric(
      "eventos_diarios",
      context
    )
);

registerOperationalMetricProvider(
  "cronograma",
  async context =>
    buildPayEvtSourceMetric(
      "cronograma",
      context
    )
);

registerOperationalMetricProvider(
  "log_checklist",
  async context =>
    buildWeeklyLogChecklistMetric(
      context
    )
);

// ============================================================================
// CONTROLE GLOBAL
// ============================================================================
if (
  !globalThis.__SC_NPS_OPERATIONAL_PROVIDERS_LOADED__
) {
  globalThis.__SC_NPS_OPERATIONAL_PROVIDERS_LOADED__ =
    true;

  console.log(
    "[NPS Providers] Provedores centrais carregados pela fonte consolidada."
  );
}

// ============================================================================
// DIAGNÓSTICO
// ============================================================================

export function getRegisteredNpsOperationalProviders() {
  return listOperationalMetricProviders();
}

export function logRegisteredNpsOperationalProviders() {
  const providers =
    getRegisteredNpsOperationalProviders();

  console.log(
    "[NPS Providers] Provedores registrados:",
    providers.length
      ? providers
      : "nenhum provedor registrado"
  );

  return providers;
}