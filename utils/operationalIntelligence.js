// /utils/operationalIntelligence.js
// ============================================================================
// SANTACREATORS — INTELIGÊNCIA OPERACIONAL COMPARTILHADA
// ============================================================================
// Funções comuns utilizadas pelos provedores do NPS:
//
// • cálculo do momento atual da semana;
// • comparação com o mesmo momento da semana anterior;
// • snapshots por módulo;
// • progresso de metas;
// • previsões;
// • estatísticas de tempo de resposta;
// • SLAs configuráveis;
// • agrupamento por cargos operacionais.
//
// Este arquivo não possui listeners e não altera sistemas existentes.
// ============================================================================

const DEFAULT_TIMEZONE =
  "America/Sao_Paulo";

const WEEK_TOTAL_MINUTES =
  7 * 24 * 60;

// ============================================================================
// SLAs PADRÃO
// ============================================================================

export const PROCESS_SLA_MINUTES =
  Object.freeze({
    registro_manager:
      120,

    social_media:
      180,

    pagamentos:
      180,

    presencas:
      120,

    organizacoes:
      180,

    alinhamentos:
      120,

    set_staff:
      240,

    pedido_set:
      240,

    cronograma:
      120,

    hall_da_fama:
      30,

    eventos:
      30,

    poderes:
      480,

    bate_ponto:
      30,

    gestao:
      1440,

    quiz:
      1440,
  });

// ============================================================================
// HELPERS NUMÉRICOS
// ============================================================================

export function clampOperationalValue(
  value,
  minimum = 0,
  maximum = 100
) {
  const numericValue =
    Number(value);

  if (
    !Number.isFinite(
      numericValue
    )
  ) {
    return minimum;
  }

  return Math.max(
    minimum,
    Math.min(
      maximum,
      numericValue
    )
  );
}

export function operationalAverage(
  values = []
) {
  const validValues =
    values
      .map(Number)
      .filter(
        Number.isFinite
      );

  if (
    !validValues.length
  ) {
    return 0;
  }

  return (
    validValues.reduce(
      (
        total,
        value
      ) =>
        total +
        value,
      0
    ) /
    validValues.length
  );
}

export function operationalMedian(
  values = []
) {
  const validValues =
    values
      .map(Number)
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
    !validValues.length
  ) {
    return 0;
  }

  const middleIndex =
    Math.floor(
      validValues.length /
      2
    );

  if (
    validValues.length %
      2 ===
    0
  ) {
    return (
      (
        validValues[
          middleIndex -
          1
        ] +
        validValues[
          middleIndex
        ]
      ) /
      2
    );
  }

  return validValues[
    middleIndex
  ];
}

export function operationalPercentile(
  values = [],
  percentileValue = 0.9
) {
  const validValues =
    values
      .map(Number)
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
    !validValues.length
  ) {
    return 0;
  }

  const normalizedPercentile =
    clampOperationalValue(
      percentileValue,
      0,
      1
    );

  const position =
    Math.ceil(
      normalizedPercentile *
      validValues.length
    ) - 1;

  const safePosition =
    Math.max(
      0,
      Math.min(
        validValues.length -
          1,
        position
      )
    );

  return validValues[
    safePosition
  ];
}

// ============================================================================
// DATA E MOMENTO DA SEMANA
// ============================================================================

export function getOperationalSPParts(
  reference = new Date(),
  timezone = DEFAULT_TIMEZONE
) {
  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          timezone,

        year:
          "numeric",

        month:
          "2-digit",

        day:
          "2-digit",

        hour:
          "2-digit",

        minute:
          "2-digit",

        second:
          "2-digit",

        weekday:
          "short",

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

  const weekdayMap = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

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

    hour:
      Number(
        get("hour")
      ),

    minute:
      Number(
        get("minute")
      ),

    second:
      Number(
        get("second")
      ),

    weekday:
      weekdayMap[
        get("weekday")
      ] ?? 0,
  };
}

export function getOperationalWeekMoment(
  reference = new Date(),
  timezone = DEFAULT_TIMEZONE
) {
  const parts =
    getOperationalSPParts(
      reference,
      timezone
    );

  const elapsedMinutes =
    parts.weekday *
      24 *
      60 +
    parts.hour *
      60 +
    parts.minute;

  const progress =
    clampOperationalValue(
      elapsedMinutes /
        WEEK_TOTAL_MINUTES,
      0,
      1
    );

  return {
    timestamp:
      reference.getTime(),

    weekday:
      parts.weekday,

    hour:
      parts.hour,

    minute:
      parts.minute,

    elapsedMinutes,

    progress,

    progressPercent:
      progress *
      100,

    snapshotBucket:
      Math.floor(
        elapsedMinutes /
        10
      ),
  };
}

// ============================================================================
// PROGRESSO DE METAS
// ============================================================================

export function buildGoalProgress({
  current = 0,
  goal = 0,
  reference = new Date(),
  timezone = DEFAULT_TIMEZONE,
} = {}) {
  const currentValue =
    Math.max(
      0,
      Number(
        current || 0
      )
    );

  const goalValue =
    Math.max(
      0,
      Number(
        goal || 0
      )
    );

  const moment =
    getOperationalWeekMoment(
      reference,
      timezone
    );

  const expectedNow =
    goalValue *
    moment.progress;

  const finalCompletion =
    goalValue > 0
      ? clampOperationalValue(
          (
            currentValue /
            goalValue
          ) *
          100
        )
      : 0;

  const paceScore =
    expectedNow > 0
      ? clampOperationalValue(
          (
            currentValue /
            expectedNow
          ) *
          100
        )
      : (
          currentValue > 0
            ? 100
            : 0
        );

  const remaining =
    Math.max(
      0,
      goalValue -
      currentValue
    );

  return {
    current:
      currentValue,

    goal:
      goalValue,

    expectedNow,

    remaining,

    finalCompletion,

    paceScore,

    weekProgress:
      moment.progress,

    weekProgressPercent:
      moment.progressPercent,

    aheadOfExpected:
      currentValue >
      expectedNow,

    behindExpected:
      currentValue <
      expectedNow,

    differenceFromExpected:
      currentValue -
      expectedNow,
  };
}

// ============================================================================
// PREVISÃO DE FECHAMENTO
// ============================================================================

export function buildOperationalProjection({
  current = 0,
  goal = 0,
  reference = new Date(),
  timezone = DEFAULT_TIMEZONE,
} = {}) {
  const currentValue =
    Math.max(
      0,
      Number(
        current || 0
      )
    );

  const goalValue =
    Math.max(
      0,
      Number(
        goal || 0
      )
    );

  const moment =
    getOperationalWeekMoment(
      reference,
      timezone
    );

  const safeProgress =
    Math.max(
      0.01,
      moment.progress
    );

  const projectedTotal =
    currentValue /
    safeProgress;

  const projectedCompletion =
    goalValue > 0
      ? (
          projectedTotal /
          goalValue
        ) *
        100
      : 0;

  const currentRatePerMinute =
    currentValue /
    Math.max(
      1,
      moment.elapsedMinutes
    );

  const remaining =
    Math.max(
      0,
      goalValue -
      currentValue
    );

  const minutesToGoal =
    currentRatePerMinute > 0
      ? remaining /
        currentRatePerMinute
      : null;

  const estimatedGoalTimestamp =
    minutesToGoal != null
      ? reference.getTime() +
        minutesToGoal *
          60000
      : null;

  let risk =
    "low";

  if (
    projectedCompletion <
    60
  ) {
    risk =
      "critical";
  } else if (
    projectedCompletion <
    85
  ) {
    risk =
      "high";
  } else if (
    projectedCompletion <
    100
  ) {
    risk =
      "medium";
  }

  return {
    projectedTotal:
      Math.max(
        0,
        projectedTotal
      ),

    projectedCompletion:
      Math.max(
        0,
        projectedCompletion
      ),

    currentRatePerMinute,

    remaining,

    minutesToGoal,

    estimatedGoalTimestamp,

    likelyToReachGoal:
      projectedTotal >=
      goalValue,

    risk,
  };
}

// ============================================================================
// TEMPOS DE RESPOSTA
// ============================================================================

export function buildResponseTimeStatistics({
  durations = [],
  idealMinutes = null,
} = {}) {
  const validDurations =
    durations
      .map(Number)
      .filter(
        duration =>
          Number.isFinite(
            duration
          ) &&
          duration >= 0
      );

  const idealMilliseconds =
    Number.isFinite(
      Number(
        idealMinutes
      )
    )
      ? Number(
          idealMinutes
        ) *
        60000
      : null;

  const withinSlaCount =
    idealMilliseconds != null
      ? validDurations.filter(
          duration =>
            duration <=
            idealMilliseconds
        ).length
      : 0;

  const withinSlaRate =
    idealMilliseconds != null &&
    validDurations.length > 0
      ? (
          withinSlaCount /
          validDurations.length
        ) *
        100
      : null;

  return {
    samples:
      validDurations.length,

    average:
      operationalAverage(
        validDurations
      ),

    median:
      operationalMedian(
        validDurations
      ),

    minimum:
      validDurations.length
        ? Math.min(
            ...validDurations
          )
        : 0,

    maximum:
      validDurations.length
        ? Math.max(
            ...validDurations
          )
        : 0,

    p90:
      operationalPercentile(
        validDurations,
        0.9
      ),

    idealMinutes:
      idealMilliseconds != null
        ? Number(
            idealMinutes
          )
        : null,

    idealMilliseconds,

    withinSlaCount,

    outsideSlaCount:
      idealMilliseconds != null
        ? validDurations.length -
          withinSlaCount
        : 0,

    withinSlaRate,
  };
}

// ============================================================================
// AGRUPAMENTO POR CARGOS
// ============================================================================

export function resolveOperationalRoleGroup(
  member,
  roleGroups = []
) {
  if (
    !member
  ) {
    return {
      key:
        "outros",

      label:
        "Outros",

      mention:
        null,

      roleId:
        null,
    };
  }

  for (
    const group of
    roleGroups
  ) {
    try {
      if (
        member.roles?.cache?.has(
          group.id
        )
      ) {
        return {
          key:
            group.key,

          label:
            group.label,

          mention:
            group.mention ||
            `<@&${group.id}>`,

          roleId:
            group.id,
        };
      }
    } catch {}
  }

  return {
    key:
      "outros",

    label:
      "Outros",

    mention:
      null,

    roleId:
      null,
  };
}

function resolveUserActivityAmount(
  value
) {
  if (
    Number.isFinite(
      Number(value)
    )
  ) {
    return Number(value);
  }

  if (
    value &&
    typeof value ===
      "object"
  ) {
    return Number(
      value.total ??
      value.count ??
      value.records ??
      value.events ??
      value.approved ??
      0
    );
  }

  return 0;
}

export async function buildOperationalRoleBreakdown({
  client,
  guildId,
  byUser = {},
  roleGroups = [],
} = {}) {
  const createGroup =
    (
      label,
      priority
    ) => ({
      label,
      priority,
      members:
        0,
      activeMembers:
        0,
      records:
        0,
      percentage:
        0,
      averagePerActiveMember:
        0,
      sources:
        {},
      users:
        {},
    });

  const result = {
    responsaveis:
      createGroup(
        "Responsáveis",
        1
      ),

    coordenacao:
      createGroup(
        "Gestão",
        2
      ),

    equipe_creator:
      createGroup(
        "Equipe Creators",
        3
      ),

    outros:
      createGroup(
        "Outros",
        4
      ),

    totalRecords:
      0,

    activeUsers:
      0,

    conflicts:
      [],

    topUsers:
      [],

    concentration: {
      topUserPercentage:
        0,

      topThreePercentage:
        0,

      overloaded:
        false,
    },
  };

if (
  !client ||
  !guildId
) {
  console.error(
    "[OperationalIntelligence] Não foi possível separar os cargos porque o cliente ou o ID do servidor não foi informado.",
    {
      clientAvailable:
        Boolean(
          client
        ),

      guildId:
        guildId ||
        null,

      usersReceived:
        Object.keys(
          byUser ||
          {}
        ).length,
    }
  );

  return result;
}

const guild =
  client.guilds?.cache?.get(
    guildId
  ) ||
  await client.guilds.fetch(
    guildId
  ).catch(
    error => {
      console.error(
        `[OperationalIntelligence] Não foi possível acessar o servidor ${guildId}:`,
        error
      );

      return null;
    }
  );

if (!guild) {
  return result;
}

  const userEntries =
    Object.entries(
      byUser || {}
    );

  for (
    const [
      userId,
      activityData,
    ] of userEntries
  ) {
const member =
  guild.members.cache.get(
    userId
  ) ||
  await guild.members.fetch(
    userId
  ).catch(
    error => {
      console.error(
        `[OperationalIntelligence] Não foi possível buscar o membro ${userId} para a separação operacional:`,
        error?.message ||
        error
      );

      return null;
    }
  );

    const matchedGroups =
      roleGroups.filter(
        group => {
          try {
            return member?.roles?.cache?.has(
              group.id
            );
          } catch {
            return false;
          }
        }
      );

    const uniqueMatchedKeys =
      [
        ...new Set(
          matchedGroups.map(
            group =>
              group.key
          )
        ),
      ];

    const roleGroup =
      resolveOperationalRoleGroup(
        member,
        roleGroups
      );

    const group =
      result[
        roleGroup.key
      ] ||
      result.outros;

    const amount =
      Math.max(
        0,
        resolveUserActivityAmount(
          activityData
        )
      );

    const sources =
      activityData &&
      typeof activityData ===
        "object" &&
      activityData.sources &&
      typeof activityData.sources ===
        "object"
        ? activityData.sources
        : {};

    const displayName =
      member?.displayName ||
      member?.user?.globalName ||
      member?.user?.username ||
      userId;

    group.members +=
      1;

    if (
      amount > 0
    ) {
      group.activeMembers +=
        1;

      result.activeUsers +=
        1;
    }

    group.records +=
      amount;

    result.totalRecords +=
      amount;

    for (
      const [
        sourceName,
        sourceAmountRaw,
      ] of Object.entries(
        sources
      )
    ) {
      const sourceAmount =
        Math.max(
          0,
          Number(
            sourceAmountRaw ||
            0
          )
        );

      if (
        !Number.isFinite(
          sourceAmount
        ) ||
        sourceAmount <= 0
      ) {
        continue;
      }

      group.sources[
        sourceName
      ] =
        Number(
          group.sources[
            sourceName
          ] ||
          0
        ) +
        sourceAmount;
    }

    group.users[
      userId
    ] = {
      userId,
      amount,
      sources,
      displayName,

      roleGroup:
        roleGroup.key,

      matchedGroups:
        uniqueMatchedKeys,
    };

    /*
     * Responsável junto com Gestão ou Equipe Creators
     * indica possível conflito de setagem.
     *
     * A pessoa permanece classificada no cargo mais alto,
     * mas o conflito aparece no relatório.
     */
    if (
      uniqueMatchedKeys.includes(
        "responsaveis"
      ) &&
      (
        uniqueMatchedKeys.includes(
          "coordenacao"
        ) ||
        uniqueMatchedKeys.includes(
          "equipe_creator"
        )
      )
    ) {
      result.conflicts.push({
        userId,
        displayName,
        matchedGroups:
          uniqueMatchedKeys,
      });
    }
  }

  const groupKeys = [
    "responsaveis",
    "coordenacao",
    "equipe_creator",
    "outros",
  ];

  for (
    const groupKey of
    groupKeys
  ) {
    const group =
      result[groupKey];

    group.percentage =
      result.totalRecords > 0
        ? (
            group.records /
            result.totalRecords
          ) *
          100
        : 0;

    group.averagePerActiveMember =
      group.activeMembers > 0
        ? group.records /
          group.activeMembers
        : 0;
  }

  result.topUsers =
    groupKeys
      .flatMap(
        groupKey =>
          Object.values(
            result[groupKey].users
          )
      )
      .sort(
        (
          first,
          second
        ) =>
          second.amount -
          first.amount
      );

  const topUserRecords =
    Number(
      result.topUsers[0]?.amount ||
      0
    );

  const topThreeRecords =
    result.topUsers
      .slice(
        0,
        3
      )
      .reduce(
        (
          total,
          user
        ) =>
          total +
          Number(
            user.amount ||
            0
          ),
        0
      );

  result.concentration
    .topUserPercentage =
      result.totalRecords > 0
        ? (
            topUserRecords /
            result.totalRecords
          ) *
          100
        : 0;

  result.concentration
    .topThreePercentage =
      result.totalRecords > 0
        ? (
            topThreeRecords /
            result.totalRecords
          ) *
          100
        : 0;

  result.concentration
    .overloaded =
      result.concentration
        .topUserPercentage >=
        35 ||
      result.concentration
        .topThreePercentage >=
        70;

  return result;
}

// ============================================================================
// SNAPSHOTS
// ============================================================================

export function createOperationalMetricSnapshot(
  metric,
  reference = new Date(),
  timezone = DEFAULT_TIMEZONE
) {
  const moment =
    getOperationalWeekMoment(
      reference,
      timezone
    );

  return {
    at:
      reference.getTime(),

    id:
      String(
        metric?.id ||
        metric?.providerId ||
        ""
      ),

    score:
      Number.isFinite(
        Number(
          metric?.score
        )
      )
        ? Number(
            metric.score
          )
        : null,

    confidence:
      Number.isFinite(
        Number(
          metric?.confidence
        )
      )
        ? Number(
            metric.confidence
          )
        : null,

    volume:
      Number(
        metric?.volume ||
        0
      ),

    current:
      Number.isFinite(
        Number(
          metric?.current
        )
      )
        ? Number(
            metric.current
          )
        : null,

    goal:
      Number.isFinite(
        Number(
          metric?.goal
        )
      )
        ? Number(
            metric.goal
          )
        : null,

    previous:
      Number.isFinite(
        Number(
          metric?.previous
        )
      )
        ? Number(
            metric.previous
          )
        : null,

    difference:
      Number.isFinite(
        Number(
          metric?.difference
        )
      )
        ? Number(
            metric.difference
          )
        : null,

    weekday:
      moment.weekday,

    hour:
      moment.hour,

    minute:
      moment.minute,

    elapsedMinutes:
      moment.elapsedMinutes,

    snapshotBucket:
      moment.snapshotBucket,
  };
}

export function findClosestOperationalSnapshot({
  snapshots = [],
  elapsedMinutes,
  toleranceMinutes = 180,
} = {}) {
  const validSnapshots =
    snapshots.filter(
      snapshot =>
        snapshot &&
        Number.isFinite(
          Number(
            snapshot.elapsedMinutes
          )
        )
    );

  if (
    !validSnapshots.length
  ) {
    return null;
  }

  let closestSnapshot =
    null;

  let closestDistance =
    Infinity;

  for (
    const snapshot of
    validSnapshots
  ) {
    const distance =
      Math.abs(
        Number(
          snapshot.elapsedMinutes
        ) -
        Number(
          elapsedMinutes
        )
      );

    if (
      distance <
      closestDistance
    ) {
      closestSnapshot =
        snapshot;

      closestDistance =
        distance;
    }
  }

  if (
    closestDistance >
    toleranceMinutes
  ) {
    return null;
  }

  return {
    ...closestSnapshot,

    distanceMinutes:
      closestDistance,
  };
}

export function buildSameMomentComparison({
  currentMetric,
  previousSnapshots = [],
  reference = new Date(),
  timezone = DEFAULT_TIMEZONE,
  toleranceMinutes = 180,
} = {}) {
  const moment =
    getOperationalWeekMoment(
      reference,
      timezone
    );

  const previousSnapshot =
    findClosestOperationalSnapshot({
      snapshots:
        previousSnapshots,

      elapsedMinutes:
        moment.elapsedMinutes,

      toleranceMinutes,
    });

  if (
    !previousSnapshot
  ) {
    return {
      available:
        false,

      current:
        Number.isFinite(
          Number(
            currentMetric?.current
          )
        )
          ? Number(
              currentMetric.current
            )
          : null,

      previous:
        null,

      difference:
        null,

      differencePercent:
        null,

      snapshotDistanceMinutes:
        null,
    };
  }

  const currentValue =
    Number.isFinite(
      Number(
        currentMetric?.current
      )
    )
      ? Number(
          currentMetric.current
        )
      : Number(
          currentMetric?.volume ||
          0
        );

  const previousValue =
    Number.isFinite(
      Number(
        previousSnapshot.current
      )
    )
      ? Number(
          previousSnapshot.current
        )
      : Number(
          previousSnapshot.volume ||
          0
        );

  const difference =
    currentValue -
    previousValue;

  const differencePercent =
    previousValue !== 0
      ? (
          difference /
          Math.abs(
            previousValue
          )
        ) *
        100
      : (
          currentValue !== 0
            ? 100
            : 0
        );

  return {
    available:
      true,

    current:
      currentValue,

    previous:
      previousValue,

    difference,

    differencePercent,

    previousSnapshotAt:
      previousSnapshot.at,

    snapshotDistanceMinutes:
      previousSnapshot.distanceMinutes,
  };
}