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

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================

const TZ =
  "America/Sao_Paulo";

const MINIMUM_POINTS_PER_USER =
  25;

const GENERAL_WEEKLY_GOAL =
  500;

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

  presencas:
    "Presenças",

  alinhamentos:
    "Alinhamentos",

  orgs:
    "Registros de Organizações",

  confirmacoes:
    "Confirmações de Organizações",

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