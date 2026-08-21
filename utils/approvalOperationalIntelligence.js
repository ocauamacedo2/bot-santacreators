// /utils/approvalOperationalIntelligence.js

import fs from "node:fs";
import path from "node:path";

const TZ = "America/Sao_Paulo";

const DATA_DIR = path.resolve(
  process.env.SQUARECLOUD_STORAGE_PATH?.trim() ||
  process.cwd(),
  "data"
);

const STATE_FILE = path.join(
  DATA_DIR,
  "sc_approval_operational.json"
);

const MAX_REQUESTS = 5000;
const MAX_EXPECTATIONS = 1500;

// ============================================================================
// PERSISTÊNCIA
// ============================================================================

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, {
      recursive: true
    });
  }
}

function loadState() {
  try {
    ensureDataDir();

    if (!fs.existsSync(STATE_FILE)) {
      return {
        version: 1,
        systems: {}
      };
    }

    const raw = fs.readFileSync(
      STATE_FILE,
      "utf8"
    );

    if (!raw.trim()) {
      return {
        version: 1,
        systems: {}
      };
    }

    const parsed = JSON.parse(raw);

    parsed.version ??= 1;
    parsed.systems ??= {};

    return parsed;
  } catch (error) {
    console.error(
      "[Approval Intelligence] Erro ao carregar estado:",
      error
    );

    return {
      version: 1,
      systems: {}
    };
  }
}

function saveState(state) {
  try {
    ensureDataDir();

    const temporaryFile =
      `${STATE_FILE}.tmp`;

    fs.writeFileSync(
      temporaryFile,
      JSON.stringify(
        state,
        null,
        2
      ),
      "utf8"
    );

    fs.renameSync(
      temporaryFile,
      STATE_FILE
    );
  } catch (error) {
    console.error(
      "[Approval Intelligence] Erro ao salvar estado:",
      error
    );
  }
}

function getSystemState(
  state,
  system
) {
  state.systems ??= {};

  state.systems[system] ??= {
    requests: [],
    expectations: []
  };

  state.systems[system].requests ??= [];
  state.systems[system].expectations ??= [];

  return state.systems[system];
}

// ============================================================================
// DATAS / SEMANAS
// ============================================================================

function getDatePartsSP(
  timestamp = Date.now()
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
      new Date(
        Number(timestamp) ||
        Date.now()
      )
    );

  const get =
    type =>
      parts.find(
        part =>
          part.type ===
          type
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
  };
}

export function getOperationalDateKeySP(
  timestamp = Date.now()
) {
  const {
    year,
    month,
    day
  } =
    getDatePartsSP(
      timestamp
    );

  return (
    `${String(year).padStart(4, "0")}-` +
    `${String(month).padStart(2, "0")}-` +
    `${String(day).padStart(2, "0")}`
  );
}

function getWeekKeySP(
  timestamp = Date.now()
) {
  const {
    year,
    month,
    day,
    weekday
  } =
    getDatePartsSP(
      timestamp
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
    (
      weekdayMap[
        weekday
      ] ?? 0
    )
  );

  return currentDay
    .toISOString()
    .slice(
      0,
      10
    );
}

function getPreviousWeekKey(
  weekKey
) {
  const date =
    new Date(
      `${weekKey}T03:00:00.000Z`
    );

  date.setUTCDate(
    date.getUTCDate() -
    7
  );

  return date
    .toISOString()
    .slice(
      0,
      10
    );
}

export function getOperationalMidnightTimestampSP(
  timestamp = Date.now()
) {
  const {
    year,
    month,
    day
  } =
    getDatePartsSP(
      timestamp
    );

  return Date.UTC(
    year,
    month - 1,
    day,
    3,
    0,
    0
  );
}

// ============================================================================
// HELPERS
// ============================================================================

function clamp(
  value,
  minimum = 0,
  maximum = 100
) {
  const numeric =
    Number(
      value
    );

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

function average(
  values
) {
  const valid =
    values
      .map(
        Number
      )
      .filter(
        Number.isFinite
      );

  if (
    valid.length ===
    0
  ) {
    return null;
  }

  return valid.reduce(
    (
      total,
      value
    ) =>
      total +
      value,
    0
  ) /
  valid.length;
}

function median(
  values
) {
  const valid =
    values
      .map(
        Number
      )
      .filter(
        Number.isFinite
      )
      .sort(
        (
          first,
          second
        ) =>
          first -
          second
      );

  if (
    valid.length ===
    0
  ) {
    return null;
  }

  const middle =
    Math.floor(
      valid.length /
      2
    );

  if (
    valid.length %
      2 ===
    0
  ) {
    return (
      valid[
        middle - 1
      ] +
      valid[
        middle
      ]
    ) /
    2;
  }

  return valid[
    middle
  ];
}

function scoreApprovalMinutes(
  minutes
) {
  if (
    minutes ===
    null
  ) {
    return 0;
  }

  if (minutes <= 15) return 100;
  if (minutes <= 30) return 92;
  if (minutes <= 60) return 82;
  if (minutes <= 180) return 65;
  if (minutes <= 360) return 45;
  if (minutes <= 720) return 30;

  return 10;
}

function scorePublishDelayMinutes(
  minutes
) {
  if (
    minutes ===
    null
  ) {
    return 0;
  }

  if (minutes <= 30) return 100;
  if (minutes <= 60) return 92;
  if (minutes <= 120) return 80;
  if (minutes <= 180) return 68;
  if (minutes <= 360) return 48;
  if (minutes <= 720) return 28;

  return 8;
}

function formatMinutes(
  value
) {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(
      Number(
        value
      )
    )
  ) {
    return "sem dados";
  }

  const totalMinutes =
    Math.max(
      0,
      Math.round(
        Number(
          value
        )
      )
    );

  if (
    totalMinutes <
    60
  ) {
    return `${totalMinutes} min`;
  }

  const hours =
    Math.floor(
      totalMinutes /
      60
    );

  const minutes =
    totalMinutes %
    60;

  return minutes >
    0
      ? `${hours}h ${minutes}min`
      : `${hours}h`;
}

// ============================================================================
// EVENTOS ESPERADOS PELO CRONOGRAMA
// ============================================================================

export function recordExpectedOperation({
  system,
  dateKey,
  eventKey,
  label = null,
  expectedAt = null,
} = {}) {
  if (
    !system ||
    !dateKey ||
    !eventKey
  ) {
    return false;
  }

  const state =
    loadState();

  const systemState =
    getSystemState(
      state,
      system
    );

  const existing =
    systemState.expectations.find(
      item =>
        item.dateKey ===
          dateKey &&
        item.eventKey ===
          eventKey
    );

  if (
    existing
  ) {
    if (
      label &&
      !existing.label
    ) {
      existing.label =
        label;
    }

    saveState(
      state
    );

    return true;
  }

  systemState.expectations.push({
    dateKey,
    eventKey,

    label:
      label ||
      eventKey,

    expectedAt:
      Number(
        expectedAt ||
        Date.now()
      ),

    firstObservedAt:
      Date.now(),

    postedAt:
      null,

    operationId:
      null,
  });

  systemState.expectations =
    systemState.expectations.slice(
      -MAX_EXPECTATIONS
    );

  saveState(
    state
  );

  return true;
}

// ============================================================================
// FILA DE APROVAÇÕES
// ============================================================================

export function recordApprovalCreated({
  system,
  operationId,
  eventKey = null,
  creatorId = null,
  createdAt = Date.now(),
} = {}) {
  if (
    !system ||
    !operationId
  ) {
    return false;
  }

  const state =
    loadState();

  const systemState =
    getSystemState(
      state,
      system
    );

  const existing =
    systemState.requests.some(
      item =>
        item.operationId ===
        operationId
    );

  if (
    existing
  ) {
    return true;
  }

  systemState.requests.push({
    operationId,
    eventKey,
    creatorId,

    createdAt:
      Number(
        createdAt ||
        Date.now()
      ),

    decidedAt:
      null,

    decision:
      "pending",

    approverId:
      null,

    postedAt:
      null,
  });

  systemState.requests =
    systemState.requests.slice(
      -MAX_REQUESTS
    );

  saveState(
    state
  );

  return true;
}

export function recordApprovalDecision({
  system,
  operationId,
  decision,
  approverId = null,
  decidedAt = Date.now(),
  postedAt = null,
} = {}) {
  if (
    !system ||
    !operationId
  ) {
    return false;
  }

  const state =
    loadState();

  const systemState =
    getSystemState(
      state,
      system
    );

  let record =
    systemState.requests.find(
      item =>
        item.operationId ===
        operationId
    );

  if (
    !record
  ) {
    record = {
      operationId,

      eventKey:
        null,

      creatorId:
        null,

      createdAt:
        Number(
          decidedAt ||
          Date.now()
        ),

      decidedAt:
        null,

      decision:
        "pending",

      approverId:
        null,

      postedAt:
        null,
    };

    systemState.requests.push(
      record
    );
  }

  record.decision =
    decision ||
    "unknown";

  record.approverId =
    approverId ||
    null;

  record.decidedAt =
    Number(
      decidedAt ||
      Date.now()
    );

  if (
    postedAt
  ) {
    record.postedAt =
      Number(
        postedAt
      );
  }

  systemState.requests =
    systemState.requests.slice(
      -MAX_REQUESTS
    );

  saveState(
    state
  );

  return true;
}

// ============================================================================
// PUBLICAÇÃO REAL DO EVENTO DIÁRIO
// ============================================================================

export function markExpectedOperationPosted({
  system,
  dateKey,
  eventKey,
  postedAt = Date.now(),
  operationId = null,
} = {}) {
  if (
    !system ||
    !dateKey ||
    !eventKey
  ) {
    return false;
  }

  const state =
    loadState();

  const systemState =
    getSystemState(
      state,
      system
    );

  let expectation =
    systemState.expectations.find(
      item =>
        item.dateKey ===
          dateKey &&
        item.eventKey ===
          eventKey
    );

  if (
    !expectation
  ) {
    expectation = {
      dateKey,
      eventKey,

      label:
        eventKey,

      expectedAt:
        Number(
          postedAt ||
          Date.now()
        ),

      firstObservedAt:
        Date.now(),

      postedAt:
        null,

      operationId:
        null,
    };

    systemState.expectations.push(
      expectation
    );
  }

  expectation.postedAt =
    Number(
      postedAt ||
      Date.now()
    );

  expectation.operationId =
    operationId ||
    expectation.operationId ||
    null;

  systemState.expectations =
    systemState.expectations.slice(
      -MAX_EXPECTATIONS
    );

  saveState(
    state
  );

  return true;
}

// ============================================================================
// LEITURA SEMANAL
// ============================================================================

function collectPeriodData(
  systemState,
  weekKey,
  now = Date.now()
) {
  const requests =
    systemState.requests.filter(
      item =>
        getWeekKeySP(
          item.createdAt
        ) ===
        weekKey
    );

  const expectations =
    systemState.expectations.filter(
      item =>
        getWeekKeySP(
          item.expectedAt
        ) ===
        weekKey
    );

  const decidedRequests =
    requests.filter(
      item =>
        item.decidedAt
    );

  const pendingRequests =
    requests.filter(
      item =>
        !item.decidedAt
    );

  const approvalMinutes =
    decidedRequests.map(
      item =>
        Math.max(
          0,
          (
            Number(
              item.decidedAt
            ) -
            Number(
              item.createdAt
            )
          ) /
          60000
        )
    );

  const overduePending =
    pendingRequests.filter(
      item =>
        now -
          Number(
            item.createdAt
          ) >=
        60 *
          60 *
          1000
    );

  const postedExpectations =
    expectations.filter(
      item =>
        item.postedAt
    );

  const missingExpectations =
    expectations.filter(
      item =>
        !item.postedAt
    );

  const publishDelayMinutes =
    postedExpectations.map(
      item =>
        Math.max(
          0,
          (
            Number(
              item.postedAt
            ) -
            Number(
              item.expectedAt
            )
          ) /
          60000
        )
    );

  const approvalAverage =
    average(
      approvalMinutes
    );

  const publishAverage =
    average(
      publishDelayMinutes
    );

  return {
    requests,
    expectations,
    decidedRequests,
    pendingRequests,
    overduePending,

    approvalAverage,

    approvalMedian:
      median(
        approvalMinutes
      ),

    approvalScore:
      approvalAverage ===
      null
        ? (
            pendingRequests.length >
            0
              ? 20
              : 100
          )
        : scoreApprovalMinutes(
            approvalAverage
          ),

    postedExpectations,
    missingExpectations,

    publishAverage,

    publishMedian:
      median(
        publishDelayMinutes
      ),

    publishDelayScore:
      publishAverage ===
      null
        ? (
            expectations.length >
            0
              ? 0
              : 100
          )
        : scorePublishDelayMinutes(
            publishAverage
          ),

    complianceRate:
      expectations.length >
      0
        ? (
            postedExpectations.length /
            expectations.length
          ) *
          100
        : null,
  };
}

// ============================================================================
// CÁLCULO DA NOTA
// ============================================================================

function buildPeriodScore(
  system,
  period,
  baseScore
) {
  const safeBase =
    clamp(
      baseScore
    );

  if (
    system ===
    "eventos_diarios"
  ) {
    const compliance =
      period.complianceRate ===
      null
        ? safeBase
        : clamp(
            period.complianceRate
          );

    return clamp(
      safeBase *
        0.25 +
      compliance *
        0.45 +
      period.publishDelayScore *
        0.20 +
      period.approvalScore *
        0.10
    );
  }

  return clamp(
    safeBase *
      0.40 +
    period.approvalScore *
      0.60
  );
}

// ============================================================================
// ENRIQUECIMENTO DO PROVEDOR NPS
// ============================================================================

export function enrichApprovalOperationalMetric(
  baseMetric,
  system,
  context = {}
) {
  const state =
    loadState();

  const systemState =
    getSystemState(
      state,
      system
    );

  const currentWeekKey =
    context.currentWeek?.key ||
    getWeekKeySP();

  const previousWeekKey =
    context.previousWeek?.key ||
    getPreviousWeekKey(
      currentWeekKey
    );

  const current =
    collectPeriodData(
      systemState,
      currentWeekKey
    );

  const previous =
    collectPeriodData(
      systemState,
      previousWeekKey
    );

  const currentScore =
    buildPeriodScore(
      system,
      current,
      Number(
        baseMetric?.score ||
        0
      )
    );

  const previousBaseScore =
    Number(
      baseMetric?.previous ||
      0
    );

  const previousScore =
    buildPeriodScore(
      system,
      previous,
      previousBaseScore
    );

  const positivePoints = [
    ...(
      baseMetric
        ?.positivePoints ||
      []
    )
  ];

  const attentionPoints = [
    ...(
      baseMetric
        ?.attentionPoints ||
      []
    )
  ];

  const recommendations = [
    ...(
      baseMetric
        ?.recommendations ||
      []
    )
  ];

  if (
    current.decidedRequests.length >
    0
  ) {
    positivePoints.push(
      `Tempo médio real para decidir solicitações: ${formatMinutes(current.approvalAverage)}.`
    );
  }

  if (
    current.overduePending.length >
    0
  ) {
    attentionPoints.push(
      `${current.overduePending.length} solicitação(ões) permanecem pendentes há pelo menos 1 hora.`
    );

    recommendations.push(
      "Priorizar os botões de aprovação/reprovação mais antigos antes de novas solicitações."
    );
  }

  if (
    system ===
    "eventos_diarios"
  ) {
    if (
      current.expectations.length >
      0
    ) {
      positivePoints.push(
        `${current.postedExpectations.length} de ${current.expectations.length} Evento(s) Diário(s) esperado(s) pelo cronograma foram publicados no período registrado.`
      );
    }

    if (
      current.missingExpectations.length >
      0
    ) {
      attentionPoints.push(
        `${current.missingExpectations.length} Evento(s) Diário(s) esperado(s) pelo cronograma ainda não possuem publicação registrada.`
      );

      recommendations.push(
        "Tratar ausência de publicação do Evento Diário como prioridade operacional, pois o cronograma já indicava obrigação real."
      );
    }

    if (
      current.publishAverage !==
      null
    ) {
      positivePoints.push(
        `Tempo médio real entre 00:00 e a publicação registrada: ${formatMinutes(current.publishAverage)}.`
      );
    }
  }

  const hasOperationalHistory =
    current.requests.length >
      0 ||
    previous.requests.length >
      0 ||
    current.expectations.length >
      0 ||
    previous.expectations.length >
      0;

  return {
    ...baseMetric,

    available:
      Boolean(
        baseMetric
          ?.available
      ) ||
      hasOperationalHistory,

    score:
      currentScore,

    current:
      currentScore,

    previous:
      previousScore,

    difference:
      currentScore -
      previousScore,

    confidence:
      clamp(
        Math.max(
          Number(
            baseMetric
              ?.confidence ||
            0
          ),

          55 +
            current.requests.length *
              4 +
            current.expectations.length *
              5
        )
      ),

    positivePoints:
      [
        ...new Set(
          positivePoints
        )
      ],

    attentionPoints:
      [
        ...new Set(
          attentionPoints
        )
      ],

    recommendations:
      [
        ...new Set(
          recommendations
        )
      ],

    details: {
      ...(
        baseMetric
          ?.details ||
        {}
      ),

      approvalSla: {
        currentWeekKey,
        previousWeekKey,

        current: {
          totalRequests:
            current.requests.length,

          decided:
            current.decidedRequests.length,

          pending:
            current.pendingRequests.length,

          overduePending:
            current.overduePending.length,

          averageDecisionMinutes:
            current.approvalAverage,

          medianDecisionMinutes:
            current.approvalMedian,

          expected:
            current.expectations.length,

          posted:
            current.postedExpectations.length,

          missing:
            current.missingExpectations.length,

          complianceRate:
            current.complianceRate,

          averagePublishDelayMinutes:
            current.publishAverage,

          medianPublishDelayMinutes:
            current.publishMedian,
        },

        previous: {
          totalRequests:
            previous.requests.length,

          decided:
            previous.decidedRequests.length,

          pending:
            previous.pendingRequests.length,

          overduePending:
            previous.overduePending.length,

          averageDecisionMinutes:
            previous.approvalAverage,

          medianDecisionMinutes:
            previous.approvalMedian,

          expected:
            previous.expectations.length,

          posted:
            previous.postedExpectations.length,

          missing:
            previous.missingExpectations.length,

          complianceRate:
            previous.complianceRate,

          averagePublishDelayMinutes:
            previous.publishAverage,

          medianPublishDelayMinutes:
            previous.publishMedian,
        },
      },
    },
  };
}