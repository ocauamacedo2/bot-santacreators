// /events/npsOperacional.js
// ============================================================================
// SANTACREATORS — NPS OPERACIONAL
// ============================================================================
// Objetivos:
// • Reunir métricas reais emitidas pelos sistemas da SantaCreators;
// • Calcular NPS Geral e NPS por categoria;
// • Comparar semana atual com semana anterior;
// • Aplicar transição inteligente entre semanas;
// • Acompanhar liderança, retenção, comunidade e produtividade;
// • Medir tempos de resposta quando os eventos possuírem correlação;
// • Gerar painel fixo;
// • Enviar resumo automático sábado às 23:40;
// • Permitir envio no PV do resumo atual e da semana anterior.
//
// Este arquivo não remove nem substitui nenhuma lógica existente.
// Ele apenas escuta acontecimentos já emitidos pelo dashHub e recebe
// eventos de membro encaminhados pelo core/index.js.
// ============================================================================

import fs from "node:fs";
import path from "node:path";
import cron from "node-cron";

import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from "discord.js";

import {
  dashOnAny,
} from "../utils/dashHub.js";

import {
  collectOperationalMetrics,
} from "../utils/operationalMetricsHub.js";

/*
 * Carrega os provedores individuais dos sistemas antes
 * de o NPS iniciar a coleta das métricas.
 */
import {
  logRegisteredNpsOperationalProviders,
} from "./npsOperationalProviders.js";

import {
  PROCESS_SLA_MINUTES,
  getOperationalWeekMoment,
  createOperationalMetricSnapshot,
  buildSameMomentComparison,
  buildGoalProgress,
  buildOperationalProjection,
  buildResponseTimeStatistics,
  buildOperationalRoleBreakdown,
} from "../utils/operationalIntelligence.js";

import {
  buildWeeklyRankingOperationalMetric,
} from "./scGeralWeeklyRanking.js";

import {
  buildGeneralDashOperationalMetric,
} from "./scGeralDash.js";

// ============================================================================
// CONFIGURAÇÃO PRINCIPAL
// ============================================================================

const TZ = "America/Sao_Paulo";

const NPS_DASHBOARD_CHANNEL_ID = "1534295811117154404";

// Painel executivo completo, organizado em vários embeds.
const NPS_EXECUTIVE_CHANNEL_ID = "1534315364152905959";

const NPS_WEEKLY_REPORT_CHANNEL_ID = "1387864036259004436";

const ROLE_LIDER_ID = "1353858422063239310";
const ROLE_CIDADAO_ID = "1262978759922028575";

const ROLE_EQUIPE_CREATOR_ID =
  "1352429001188180039";

const ROLE_COORDENACAO_ID =
  "1352385500614234134";

const ROLE_RESPONSAVEIS_GERAIS_ID =
  "1414651836861907006";

const ROLE_RESPONSAVEIS_CREATORS_ID =
  "1352408327983861844";

const ROLE_RESPONSAVEIS_INFLUENCIADORES_ID =
  "1262262852949905409";

const ROLE_RESPONSAVEIS_LIDERES_ID =
  "1352407252216184833";

/*
 * A ordem representa a hierarquia operacional.
 *
 * Quando uma pessoa possuir mais de um desses cargos,
 * ela será considerada somente no grupo mais alto:
 *
 * 1. Responsáveis;
 * 2. Gestão;
 * 3. Equipe Creators;
 * 4. Outros.
 */
const OPERATIONAL_ROLE_GROUPS = [
  {
    id:
      ROLE_RESPONSAVEIS_GERAIS_ID,

    key:
      "responsaveis",

    label:
      "Responsáveis",

    mention:
      `<@&${ROLE_RESPONSAVEIS_GERAIS_ID}>`,
  },

  {
    id:
      ROLE_RESPONSAVEIS_CREATORS_ID,

    key:
      "responsaveis",

    label:
      "Responsáveis",

    mention:
      `<@&${ROLE_RESPONSAVEIS_CREATORS_ID}>`,
  },

  {
    id:
      ROLE_RESPONSAVEIS_INFLUENCIADORES_ID,

    key:
      "responsaveis",

    label:
      "Responsáveis",

    mention:
      `<@&${ROLE_RESPONSAVEIS_INFLUENCIADORES_ID}>`,
  },

  {
    id:
      ROLE_RESPONSAVEIS_LIDERES_ID,

    key:
      "responsaveis",

    label:
      "Responsáveis",

    mention:
      `<@&${ROLE_RESPONSAVEIS_LIDERES_ID}>`,
  },

  {
    id:
      ROLE_COORDENACAO_ID,

    key:
      "coordenacao",

    label:
      "Gestão",

    mention:
      `<@&${ROLE_COORDENACAO_ID}>`,
  },

  {
    id:
      ROLE_EQUIPE_CREATOR_ID,

    key:
      "equipe_creator",

    label:
      "Equipe Creators",

    mention:
      `<@&${ROLE_EQUIPE_CREATOR_ID}>`,
  },
];

const NPS_DASH_MARKER = "SC_NPS_OPERACIONAL::V1";
const NPS_EXECUTIVE_MARKER = "SC_NPS_EXECUTIVO::V1";

const BUTTON_REFRESH_ID = "sc_nps_operacional_refresh";
const BUTTON_CURRENT_DM_ID = "sc_nps_operacional_current_dm";
const BUTTON_PREVIOUS_DM_ID = "sc_nps_operacional_previous_dm";
const BUTTON_EXECUTIVE_DM_ID = "sc_nps_operacional_executive_dm";

/*
 * Estas categorias somente podem influenciar o NPS quando
 * o respectivo sistema entregar uma métrica operacional real.
 *
 * O arquivo consolidado continuará fornecendo volume e histórico,
 * mas não poderá transformar quantidade em desempenho positivo
 * automaticamente.
 */
const PROVIDER_REQUIRED_CATEGORY_IDS = new Set([
  "meta_interna",
  "desempenho_geral",
  "participacao_equipe",
  "registro_manager",
  "social_media",
  "gestao",
  "bate_ponto",
  "presencas",
  "alinhamentos",
  "organizacoes",
  "pagamentos",
  "eventos",
  "quiz",
  "comunidade",
  "ausencias",
  "qualidade",
  "tempo_resposta",
  "set_staff",
]);

const ALLOWED_MANAGE_USERS = new Set([
  "660311795327828008",
  "1262262852949905408",
]);

const ALLOWED_MANAGE_ROLES = new Set([
  "1262262852949905408",
  "1352408327983861844",
  "1262262852949905409",
  "1352407252216184833",
  "1388976314253312100",
]);

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

  for (const dir of candidates) {
    try {
      if (fs.existsSync(dir)) {
        return dir;
      }
    } catch {}
  }

  return null;
}

const DATA_DIR = path.resolve(
  pickPersistRoot() || process.cwd(),
  "data"
);

const STATE_FILE = path.join(
  DATA_DIR,
  "sc_nps_operacional_state.json"
);

const CONFIG_FILE = path.join(
  DATA_DIR,
  "sc_nps_operacional_config.json"
);

// Fonte consolidada gerada pelo Ranking Geral Semanal.
// Ela contém os registros já existentes da semana atual
// e de semanas anteriores.
const GERAL_WEEKLY_SOURCES_FILE = path.join(
  DATA_DIR,
  "sc_geral_weekly_rank_sources.json"
);

function ensureDataDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, {
        recursive: true,
      });
    }
  } catch (error) {
    console.error(
      "[NPS Operacional] Não foi possível criar a pasta de dados:",
      error
    );
  }
}

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) {
      return fallback;
    }

    const raw = fs.readFileSync(file, "utf8");

    if (!raw.trim()) {
      return fallback;
    }

    return JSON.parse(raw);
  } catch (error) {
    console.error(
      `[NPS Operacional] Erro ao ler ${file}:`,
      error
    );

    return fallback;
  }
}

function writeJson(file, value) {
  try {
    ensureDataDir();

    const temporaryFile = `${file}.tmp`;

    fs.writeFileSync(
      temporaryFile,
      JSON.stringify(value, null, 2),
      "utf8"
    );

    fs.renameSync(
      temporaryFile,
      file
    );
  } catch (error) {
    console.error(
      `[NPS Operacional] Erro ao salvar ${file}:`,
      error
    );
  }
}

// ============================================================================
// CONFIGURAÇÃO DAS CATEGORIAS
// ============================================================================

const DEFAULT_CONFIG = {
  version: 1,

  classifications: [
    {
      minimum: 90,
      label: "Excelente",
      emoji: "🟢",
    },
    {
      minimum: 80,
      label: "Muito bom",
      emoji: "🟢",
    },
    {
      minimum: 70,
      label: "Bom",
      emoji: "🟡",
    },
    {
      minimum: 60,
      label: "Atenção",
      emoji: "🟠",
    },
    {
      minimum: 0,
      label: "Crítico",
      emoji: "🔴",
    },
  ],

categories: {
  meta_interna: {
    label: "Cumprimento das Metas Internas",
    weight: 0,
    enabled: false,
    weeklyGoal: 100,
  },

  desempenho_geral: {
    label: "Ritmo Geral da Operação",
    weight: 18,
    enabled: true,
    weeklyGoal: 500,
  },

  participacao_equipe: {
    label: "Participação da Equipe",
    weight: 16,
    enabled: true,
    weeklyGoal: 25,
  },

  registro_manager: {
      label: "Registro Manager",
      weight: 12,
      enabled: true,
      weeklyGoal: 25,
    },

    social_media: {
      label: "Registro Social Media",
      weight: 10,
      enabled: true,
      weeklyGoal: 20,
    },

    gestao: {
      label: "Gestão",
      weight: 10,
      enabled: true,
      weeklyGoal: 15,
    },

bate_ponto: {
  label: "Bate Ponto",
  weight: 0,
  enabled: false,
  weeklyGoal: 15,
},

presencas: {
  label: "Presenças / Bate Ponto",
  weight: 8,
  enabled: true,
  weeklyGoal: 15,
},

    alinhamentos: {
      label: "Alinhamentos",
      weight: 8,
      enabled: true,
      weeklyGoal: 10,
    },

    organizacoes: {
      label: "Organizações",
      weight: 10,
      enabled: true,
      weeklyGoal: 15,
    },

    pagamentos: {
  label: "Pagamentos",
  weight: 7,
  enabled: true,
  weeklyGoal: 10,
},

set_staff: {
  label: "Set Staff",
  weight: 7,
  enabled: true,
  weeklyGoal: 10,
},

eventos: {
  label: "Eventos",
  weight: 7,
  enabled: true,
  weeklyGoal: 10,
},

    quiz: {
      label: "Quiz e Engajamento",
      weight: 6,
      enabled: true,
      weeklyGoal: 30,
    },

    lideranca: {
      label: "Liderança e Retenção",
      weight: 8,
      enabled: true,
      weeklyGoal: 5,
    },

    comunidade: {
      label: "Comunidade",
      weight: 6,
      enabled: true,
      weeklyGoal: 20,
    },

    ausencias: {
      label: "Ausências e Capacidade",
      weight: 4,
      enabled: true,
      weeklyGoal: 5,
    },

    qualidade: {
      label: "Qualidade Operacional",
      weight: 8,
      enabled: true,
      weeklyGoal: 20,
    },

    tempo_resposta: {
      label: "Tempo de Resposta",
      weight: 8,
      enabled: true,
      weeklyGoal: 10,
    },
  },
};

function loadConfig() {
  const saved = readJson(
    CONFIG_FILE,
    null
  );

  if (!saved) {
    writeJson(
      CONFIG_FILE,
      DEFAULT_CONFIG
    );

    return structuredClone(
      DEFAULT_CONFIG
    );
  }

  const mergedConfig = {
    ...structuredClone(DEFAULT_CONFIG),
    ...saved,

    categories: {
      ...structuredClone(DEFAULT_CONFIG.categories),
      ...(saved.categories || {}),
    },

    classifications:
      Array.isArray(saved.classifications)
        ? saved.classifications
        : structuredClone(DEFAULT_CONFIG.classifications),
  };

  /*
   * A Meta Interna possui seu próprio painel e sua própria régua.
   *
   * Ela permanece disponível no projeto, mas não influencia
   * o NPS Operacional Geral.
   */
  mergedConfig.categories.meta_interna = {
    ...mergedConfig.categories.meta_interna,

    label:
      "Cumprimento das Metas Internas",

    weight:
      0,

    enabled:
      false,

    weeklyGoal:
      100,
  };

  return mergedConfig;
}

// ============================================================================
// ESTADO
// ============================================================================

function createEmptyState() {
  return {
    version: 1,

    // Mensagem do painel rápido.
    dashboardMessageId: null,

    // Mensagem do painel executivo completo.
    executiveDashboardMessageId: null,

    weeks: {},

    pendingOperations: {},

    metadata: {
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastDashboardUpdateAt: null,
      lastExecutiveDashboardUpdateAt: null,
      lastAutomaticReportWeek: null,
    },
  };
}

function loadState() {
  const state = readJson(
    STATE_FILE,
    createEmptyState()
  );

  state.version ||= 1;
  state.dashboardMessageId ||= null;
  state.executiveDashboardMessageId ||= null;
  state.weeks ||= {};
  state.pendingOperations ||= {};

  state.metadata ||= {
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastDashboardUpdateAt: null,
    lastAutomaticReportWeek: null,
  };

  return state;
}

function saveState(state) {
  state.metadata ||= {};
  state.metadata.updatedAt = Date.now();

  writeJson(
    STATE_FILE,
    state
  );
}

// ============================================================================
// DATA E SEMANA
// ============================================================================

function getSPParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
      weekday: "short",
    }
  ).formatToParts(date);

  const get = type =>
    parts.find(
      part => part.type === type
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
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: weekdayMap[get("weekday")] ?? 0,
  };
}

function createSPDate({
  year,
  month,
  day,
  hour = 0,
  minute = 0,
  second = 0,
}) {
  return new Date(
    Date.UTC(
      year,
      month - 1,
      day,
      hour + 3,
      minute,
      second
    )
  );
}

function addDays(date, amount) {
  const result = new Date(
    date.getTime()
  );

  result.setUTCDate(
    result.getUTCDate() + amount
  );

  return result;
}

function dateKey(date) {
  return date
    .toISOString()
    .slice(0, 10);
}

function formatDateBR(date) {
  return date.toLocaleDateString(
    "pt-BR",
    {
      timeZone: TZ,
    }
  );
}

function getWeekInfo(reference = new Date()) {
  const parts = getSPParts(reference);

  const todayStart = createSPDate({
    year: parts.year,
    month: parts.month,
    day: parts.day,
  });

  const sunday = addDays(
    todayStart,
    -parts.weekday
  );

  const saturday = addDays(
    sunday,
    6
  );

  const endExclusive = addDays(
    sunday,
    7
  );

  return {
    key: dateKey(sunday),
    start: sunday,
    saturday,
    endExclusive,
    label:
      `${formatDateBR(sunday)} até ` +
      `${formatDateBR(saturday)}`,
    weekday: parts.weekday,
  };
}

function getPreviousWeekInfo(reference = new Date()) {
  const current = getWeekInfo(reference);

  return getWeekInfo(
    addDays(current.start, -1)
  );
}

function ensureWeek(state, weekInfo) {
  if (!state.weeks[weekInfo.key]) {
    state.weeks[weekInfo.key] = {
      key: weekInfo.key,
      startAt: weekInfo.start.getTime(),
      endAt: weekInfo.endExclusive.getTime(),

      events: [],

      categories: {},

      // Totais consolidados vindos do Ranking Geral Semanal.
      // Estes valores funcionam como uma base mínima.
      // Eventos recebidos em tempo real não serão somados duas vezes.
      consolidatedSources: {},

      /*
       * Snapshots separados por provedor.
       *
       * Formato:
       *
       * {
       *   registro_manager: [],
       *   pagamentos: [],
       *   presencas: [],
       * }
       *
       * Isso permitirá comparar terça-feira às 20h com
       * terça-feira às 20h da semana anterior.
       */
      providerSnapshots: {},

      leaders: {
        entered: [],
        removed: [],
        leftServer: [],
        returned: [],
      },

      members: {
        entered: [],
        left: [],
      },

      approvals: [],

      // Snapshots gerais da nota do NPS.
      snapshots: [],

      closedAt: null,
      finalScore: null,
    };
  }

  // Compatibilidade com estados criados antes desta atualização.
  state.weeks[weekInfo.key].events ||= [];
  state.weeks[weekInfo.key].categories ||= {};
  state.weeks[weekInfo.key].consolidatedSources ||= {};
  state.weeks[weekInfo.key].providerSnapshots ||= {};

  state.weeks[weekInfo.key].leaders ||= {
    entered: [],
    removed: [],
    leftServer: [],
    returned: [],
  };

  state.weeks[weekInfo.key].members ||= {
    entered: [],
    left: [],
  };

  state.weeks[weekInfo.key].approvals ||= [];
  state.weeks[weekInfo.key].snapshots ||= [];

  return state.weeks[weekInfo.key];
}

function getWeekForTimestamp(state, timestamp) {
  const info = getWeekInfo(
    new Date(timestamp)
  );

  return ensureWeek(
    state,
    info
  );
}

// ============================================================================
// SNAPSHOTS DOS PROVEDORES
// ============================================================================

function syncProviderMetricSnapshots({
  state,
  currentWeekInfo,
  previousWeekInfo,
  providerMetrics,
  timestamp = Date.now(),
}) {
  const currentWeek =
    ensureWeek(
      state,
      currentWeekInfo
    );

  const previousWeek =
    ensureWeek(
      state,
      previousWeekInfo
    );

  currentWeek.providerSnapshots ||= {};
  previousWeek.providerSnapshots ||= {};

  const referenceDate =
    new Date(
      timestamp
    );

  const currentMoment =
    getOperationalWeekMoment(
      referenceDate,
      TZ
    );

  for (
    const metric of
    providerMetrics || []
  ) {
const metricId =
  safeString(
    metric?.id ||
    metric?.providerId
  );

if (
  !metricId
) {
  continue;
}

/*
 * Não grava snapshots vazios ou indisponíveis.
 *
 * Isso evita salvar falsos zeros quando um módulo
 * ainda não terminou a coleta ou quando o cache
 * temporário está vazio.
 */
if (
  metric.available === false ||
  !Number.isFinite(
    Number(
      metric.score
    )
  )
) {
  continue;
}

currentWeek.providerSnapshots[
  metricId
] ||= [];

    previousWeek.providerSnapshots[
      metricId
    ] ||= [];

    /*
     * Compara o valor atual com o snapshot mais próximo
     * do mesmo momento da semana anterior.
     */
    metric.sameMomentComparison =
      buildSameMomentComparison({
        currentMetric:
          metric,

        previousSnapshots:
          previousWeek.providerSnapshots[
            metricId
          ],

        reference:
          referenceDate,

        timezone:
          TZ,

        toleranceMinutes:
          180,
      });

    /*
     * Enriquece automaticamente provedores que já enviam
     * os campos current e goal.
     */
    if (
      Number.isFinite(
        Number(
          metric.current
        )
      ) &&
      Number.isFinite(
        Number(
          metric.goal
        )
      ) &&
      Number(
        metric.goal
      ) > 0
    ) {
      metric.progress =
        metric.progress ||
        buildGoalProgress({
          current:
            metric.current,

          goal:
            metric.goal,

          reference:
            referenceDate,

          timezone:
            TZ,
        });

      metric.prediction =
        metric.prediction ||
        buildOperationalProjection({
          current:
            metric.current,

          goal:
            metric.goal,

          reference:
            referenceDate,

          timezone:
            TZ,
        });
    }

    /*
     * Enriquece provedores que entregam uma lista de
     * tempos em milissegundos.
     */
    const responseDurations =
      metric.responseTimes ||
      metric.details?.responseTimes ||
      [];

    if (
      Array.isArray(
        responseDurations
      ) &&
      responseDurations.length
    ) {
      const idealMinutes =
        metric.idealMinutes ??
        PROCESS_SLA_MINUTES[
          metricId
        ] ??
        null;

      metric.responseTime =
        metric.responseTime ||
        buildResponseTimeStatistics({
          durations:
            responseDurations,

          idealMinutes,
        });
    }

    const snapshot =
      createOperationalMetricSnapshot(
        metric,
        referenceDate,
        TZ
      );

    const snapshotList =
      currentWeek.providerSnapshots[
        metricId
      ];

    const lastSnapshot =
      snapshotList[
        snapshotList.length -
        1
      ];

    /*
     * Apenas um snapshot por janela de dez minutos.
     *
     * Caso o painel seja atualizado várias vezes dentro
     * da mesma janela, substitui o snapshot anterior.
     */
    if (
      lastSnapshot &&
      lastSnapshot.snapshotBucket ===
        currentMoment.snapshotBucket
    ) {
      snapshotList[
        snapshotList.length -
        1
      ] =
        snapshot;
    } else {
      snapshotList.push(
        snapshot
      );
    }

    /*
     * Limite máximo de sete dias com um snapshot
     * a cada dez minutos:
     *
     * 7 × 24 × 6 = 1008 snapshots.
     */
    if (
      snapshotList.length >
      1008
    ) {
      currentWeek.providerSnapshots[
        metricId
      ] =
        snapshotList.slice(
          -1008
        );
    }
  }

  return {
    currentWeek,
    previousWeek,
    currentMoment,
  };
}

// ============================================================================
// IMPORTAÇÃO DAS FONTES SEMANAIS EXISTENTES
// ============================================================================

function normalizeSourceName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_");
}

function resolveConsolidatedCategory(sourceName) {
  const source = normalizeSourceName(
    sourceName
  );

  if (
    source === "manager" ||
    source === "managers" ||
    source === "registro_manager" ||
    source === "rm"
  ) {
    return "registro_manager";
  }

  if (
    source.includes("social")
  ) {
    return "social_media";
  }

  if (
    source === "presenca" ||
    source === "presencas" ||
    source === "confirmacao" ||
    source === "confirmacoes" ||
    source.includes("presenca")
  ) {
    return "presencas";
  }

  if (
    source === "bate_ponto" ||
    source === "bateponto" ||
    source === "bp" ||
    source.includes("punch")
  ) {
    return "bate_ponto";
  }

  if (
    source.includes("alinhamento")
  ) {
    return "alinhamentos";
  }

  if (
    source.includes("facs") ||
    source.includes("organizacao") ||
    source.includes("org")
  ) {
    return "organizacoes";
  }

  if (
    source.includes("pagamento")
  ) {
    return "pagamentos";
  }

  if (
    source.includes("quiz") ||
    source.includes("pergunta")
  ) {
    return "quiz";
  }

  if (
    source.includes("convite") ||
    source.includes("lider") ||
    source.includes("dm_lideres")
  ) {
    return "lideranca";
  }

  if (
    source.includes("ausencia")
  ) {
    return "ausencias";
  }

  if (
    source.includes("correcao") ||
    source.includes("reprovado") ||
    source.includes("rejeitado")
  ) {
    return "qualidade";
  }

  if (
    source.includes("evento") ||
    source.includes("cronograma") ||
    source.includes("hall") ||
    source.includes("poder")
  ) {
    return "eventos";
  }

  if (
    source.includes("entrevista") ||
    source.includes("comunidade")
  ) {
    return "comunidade";
  }

  if (
    source.includes("gestao") ||
    source.startsWith("gi")
  ) {
    return "gestao";
  }

  if (
    source.includes("venda") ||
    source.includes("doacao")
  ) {
    return "gestao";
  }

  return null;
}

function buildConsolidatedCategoryData(
  sourceWeek
) {
  const consolidated = {};

  for (
    const bySource of Object.values(
      sourceWeek || {}
    )
  ) {
    if (
      !bySource ||
      typeof bySource !== "object"
    ) {
      continue;
    }

    for (
      const [
        sourceName,
        amountRaw,
      ] of Object.entries(
        bySource
      )
    ) {
      const amount = Math.max(
        0,
        Number(amountRaw || 0)
      );

      if (
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        continue;
      }

      const categoryId =
        resolveConsolidatedCategory(
          sourceName
        );

      if (!categoryId) {
        continue;
      }

      consolidated[categoryId] ||= {
        events: 0,
        points: 0,
        positive: 0,
        negative: 0,
        neutral: 0,
        sources: {},
      };

      consolidated[categoryId].events +=
        amount;

      consolidated[categoryId].points +=
        amount;

      consolidated[categoryId].positive +=
        amount;

      const normalizedSource =
        normalizeSourceName(
          sourceName
        );

      consolidated[categoryId].sources[
        normalizedSource
      ] =
        (
          consolidated[categoryId].sources[
            normalizedSource
          ] || 0
        ) + amount;
    }
  }

  return consolidated;
}

function syncConsolidatedWeeklySources(
  state
) {
  const allSources = readJson(
    GERAL_WEEKLY_SOURCES_FILE,
    {}
  );

  const availableWeeks =
    Object.keys(
      allSources || {}
    );

  let importedWeeks = 0;
  let importedEvents = 0;

  for (
    const weekKey of availableWeeks
  ) {
    const weekDate =
      new Date(
        `${weekKey}T03:00:00.000Z`
      );

    if (
      Number.isNaN(
        weekDate.getTime()
      )
    ) {
      continue;
    }

    const weekInfo =
      getWeekInfo(
        weekDate
      );

    const week =
      ensureWeek(
        state,
        weekInfo
      );

    const consolidated =
      buildConsolidatedCategoryData(
        allSources[weekKey]
      );

    week.consolidatedSources =
      consolidated;

    importedWeeks += 1;

    importedEvents +=
      Object.values(
        consolidated
      ).reduce(
        (
          total,
          category
        ) =>
          total +
          Number(
            category.events || 0
          ),
        0
      );
  }

  console.log(
    "[NPS Operacional] Fontes consolidadas sincronizadas:",
    {
      file:
        GERAL_WEEKLY_SOURCES_FILE,
      exists:
        fs.existsSync(
          GERAL_WEEKLY_SOURCES_FILE
        ),
      weeks:
        importedWeeks,
      events:
        importedEvents,
    }
  );

  return {
    importedWeeks,
    importedEvents,
  };
}

// ============================================================================
// HELPERS GERAIS
// ============================================================================

function clamp(value, minimum, maximum) {
  return Math.max(
    minimum,
    Math.min(
      maximum,
      value
    )
  );
}

function toNumber(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function uniquePush(array, item, identity) {
  if (
    array.some(
      existing =>
        identity(existing) === identity(item)
    )
  ) {
    return false;
  }

  array.push(item);

  return true;
}

function safeString(value) {
  return String(
    value ?? ""
  ).trim();
}

function truncate(value, maximum = 1024) {
  const text = safeString(value);

  if (!text) {
    return "—";
  }

  if (text.length <= maximum) {
    return text;
  }

  return `${text.slice(0, maximum - 1)}…`;
}

function percentageChange(current, previous) {
  const a = toNumber(current);
  const b = toNumber(previous);

  if (b === 0) {
    if (a === 0) {
      return 0;
    }

    return 100;
  }

  return (
    ((a - b) / Math.abs(b)) *
    100
  );
}

function absoluteDifference(current, previous) {
  return (
    toNumber(current) -
    toNumber(previous)
  );
}

function formatSigned(value, digits = 1) {
  const number = toNumber(value);

  const prefix =
    number > 0
      ? "+"
      : "";

  return (
    `${prefix}${number.toFixed(digits)}`
  );
}

function formatDuration(milliseconds) {
  const totalMinutes = Math.max(
    0,
    Math.round(
      toNumber(milliseconds) / 60000
    )
  );

  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }

  const hours = Math.floor(
    totalMinutes / 60
  );

  const minutes =
    totalMinutes % 60;

  if (minutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${minutes}min`;
}

function average(numbers) {
  const valid = numbers
    .map(Number)
    .filter(Number.isFinite);

  if (!valid.length) {
    return 0;
  }

  return (
    valid.reduce(
      (total, value) => total + value,
      0
    ) / valid.length
  );
}

function median(numbers) {
  const valid = numbers
    .map(Number)
    .filter(Number.isFinite)
    .sort(
      (a, b) => a - b
    );

  if (!valid.length) {
    return 0;
  }

  const middle = Math.floor(
    valid.length / 2
  );

  if (valid.length % 2 === 0) {
    return (
      (
        valid[middle - 1] +
        valid[middle]
      ) / 2
    );
  }

  return valid[middle];
}

function percentile(numbers, percentileValue) {
  const valid = numbers
    .map(Number)
    .filter(Number.isFinite)
    .sort(
      (a, b) => a - b
    );

  if (!valid.length) {
    return 0;
  }

  const position = Math.ceil(
    percentileValue * valid.length
  ) - 1;

  return valid[
    clamp(
      position,
      0,
      valid.length - 1
    )
  ];
}

function getClassification(score, config) {
  const classifications = [
    ...(config.classifications || []),
  ].sort(
    (a, b) =>
      toNumber(b.minimum) -
      toNumber(a.minimum)
  );

  return (
    classifications.find(
      classification =>
        score >= toNumber(
          classification.minimum
        )
    ) || {
      minimum: 0,
      label: "Crítico",
      emoji: "🔴",
    }
  );
}

function hasManagePermission(interaction) {
  const userId = safeString(
    interaction?.user?.id
  );

  if (
    ALLOWED_MANAGE_USERS.has(userId)
  ) {
    return true;
  }

  try {
    return interaction.member?.roles?.cache?.some(
      role =>
        ALLOWED_MANAGE_ROLES.has(
          role.id
        )
    ) || false;
  } catch {
    return false;
  }
}

// ============================================================================
// MAPEAMENTO DOS EVENTOS
// ============================================================================

const EVENT_RULES = [
  {
    test: name =>
      name === "rm:approved",
    category: "registro_manager",
    points: 1,
    quality: 1,
    decision: "approved",
  },

  {
    test: name =>
      name === "rm:rejected",
    category: "registro_manager",
    points: 0.35,
    quality: -0.25,
    decision: "rejected",
  },

  {
    test: name =>
      name.includes("social") &&
      (
        name.includes("aprov") ||
        name.includes("registr")
      ),
    category: "social_media",
    points: 1,
    quality: 0.75,
  },

  {
    test: name =>
      name === "bp:punch" ||
      name.includes("bateponto"),
    category: "bate_ponto",
    points: 1,
    quality: 0.5,
  },

  {
    test: name =>
      name === "presenca:confirmada",
    category: "presencas",
    points: 1,
    quality: 0.75,
  },

  {
    test: name =>
      name.includes("presenca") &&
      name.includes("nao"),
    category: "presencas",
    points: 0.15,
    quality: -0.15,
  },

  {
    test: name =>
      name === "alinhamento:registrado",
    category: "alinhamentos",
    points: 0.5,
    quality: 0.25,
    operation: "created",
  },

  {
    test: name =>
      name === "alinhamento:validado",
    category: "alinhamentos",
    points: 1,
    quality: 1,
    decision: "approved",
  },

  {
    test: name =>
      name.includes("alinhamento") &&
      name.includes("invalid"),
    category: "alinhamentos",
    points: 0.1,
    quality: -0.5,
    decision: "rejected",
  },

  {
    test: name =>
      name === "lideres:convite_enviado",
    category: "organizacoes",
    points: 1,
    quality: 0.75,
  },

  {
    test: name =>
      name.includes("facs") ||
      name.includes("org"),
    category: "organizacoes",
    points: 0.75,
    quality: 0.5,
  },

  {
    test: name =>
      name === "pagamento:criado",
    category: "pagamentos",
    points: 0.35,
    quality: 0.25,
    operation: "created",
  },

  {
    test: name =>
      name === "pagamento:solicitado",
    category: "pagamentos",
    points: 0.5,
    quality: 0.35,
  },

  {
    test: name =>
      name === "pagamento:pago",
    category: "pagamentos",
    points: 1,
    quality: 1,
    decision: "approved",
  },

  {
    test: name =>
      name === "pagamento:reprovado",
    category: "pagamentos",
    points: 0.2,
    quality: -0.35,
    decision: "rejected",
  },

  {
    test: name =>
      name.includes("evento") ||
      name.includes("cronograma") ||
      name.includes("halldafama"),
    category: "eventos",
    points: 0.75,
    quality: 0.5,
  },

  {
    test: name =>
      name.includes("quiz"),
    category: "quiz",
    points: 1,
    quality: 0.75,
  },

  {
    test: name =>
      name.includes("gi:") ||
      name.includes("lider"),
    category: "lideranca",
    points: 0.75,
    quality: 0.5,
  },

  {
    test: name =>
      name.includes("entrevista") ||
      name.includes("comunidade"),
    category: "comunidade",
    points: 0.75,
    quality: 0.5,
  },

  {
    test: name =>
      name.includes("ausencia"),
    category: "ausencias",
    points: 0.5,
    quality: 0,
  },

  {
    test: name =>
      name.includes("correcao"),
    category: "qualidade",
    points: 0.2,
    quality: -0.35,
  },

  {
    test: name =>
      name.includes("aprovado") ||
      name.includes("approved"),
    category: "qualidade",
    points: 0.75,
    quality: 0.75,
  },

  {
    test: name =>
      name.includes("reprovado") ||
      name.includes("rejected"),
    category: "qualidade",
    points: 0.15,
    quality: -0.4,
  },
];

function findEventRule(eventName) {
  return EVENT_RULES.find(
    rule => {
      try {
        return rule.test(eventName);
      } catch {
        return false;
      }
    }
  ) || null;
}

function ensureCategoryData(
  week,
  categoryId
) {
  if (!week.categories[categoryId]) {
    week.categories[categoryId] = {
      events: 0,
      points: 0,
      qualityPoints: 0,
      positive: 0,
      negative: 0,
      neutral: 0,
      uniqueUsers: [],
      responseTimes: [],
      pending: 0,
      completed: 0,
      approved: 0,
      rejected: 0,
    };
  }

  return week.categories[categoryId];
}

function resolveUserId(payload = {}) {
  return safeString(
    payload.userId ||
    payload.memberId ||
    payload.targetId ||
    payload.creatorId ||
    payload.createdBy ||
    payload.registradorId ||
    payload.managerId ||
    payload.pointsOwnerId ||
    payload.byUserId ||
    payload.by ||
    payload.approverId ||
    payload.executorId ||
    ""
  ) || null;
}

function resolveOperationId(
  eventName,
  payload = {}
) {
  const explicit =
    payload.operationId ||
    payload.correlationId ||
    payload.recordId ||
    payload.registroId ||
    payload.paymentId ||
    payload.messageId ||
    payload.msgId ||
    payload.originalMessageId ||
    payload.threadId ||
    payload.ticketId;

  if (explicit) {
    return safeString(explicit);
  }

  const userId = resolveUserId(payload);

  if (!userId) {
    return null;
  }

  const base = eventName
    .replace(/:(criado|created|registrado|solicitado|pago|approved|rejected|aprovado|reprovado|validado)$/i, "");

  return `${base}:${userId}`;
}

function isCreationEvent(
  eventName,
  rule
) {
  if (rule?.operation === "created") {
    return true;
  }

  return (
    eventName.includes("criado") ||
    eventName.includes("created") ||
    eventName.endsWith(":registrado") ||
    eventName.endsWith(":solicitado")
  );
}

function isDecisionEvent(
  eventName,
  rule
) {
  if (rule?.decision) {
    return true;
  }

  return (
    eventName.includes("approved") ||
    eventName.includes("rejected") ||
    eventName.includes("aprovado") ||
    eventName.includes("reprovado") ||
    eventName.includes("validado") ||
    eventName.includes(":pago")
  );
}

// ============================================================================
// COLETA DOS EVENTOS DO DASH HUB
// ============================================================================

let activeClient = null;
let dashboardUpdateTimer = null;
let dashboardUpdating = false;
let dashboardNeedsUpdate = false;

function scheduleDashboardUpdate(
  client,
  reason = "event"
) {
  if (!client) {
    return;
  }

  if (dashboardUpdateTimer) {
    clearTimeout(
      dashboardUpdateTimer
    );
  }

  dashboardUpdateTimer = setTimeout(
    () => {
      dashboardUpdateTimer = null;

      updateDashboard(
        client,
        reason
      ).catch(
        error =>
          console.error(
            "[NPS Operacional] Erro ao atualizar painel:",
            error
          )
      );
    },
    5000
  );
}

function registerDashEvent(
  client,
  eventName,
  payload = {}
) {
  const timestamp = toNumber(
    payload.__at ||
    payload.at ||
    Date.now(),
    Date.now()
  );

  const normalizedEventName =
    safeString(eventName)
      .toLowerCase();

  if (!normalizedEventName) {
    return;
  }

  const state = loadState();

  const week =
    getWeekForTimestamp(
      state,
      timestamp
    );

  const rule =
    findEventRule(
      normalizedEventName
    );

  const userId =
    resolveUserId(payload);

  const eventRecord = {
    id:
      safeString(
        payload.dedupeKey ||
        payload.eventId ||
        payload.messageId ||
        payload.msgId ||
        payload.interactionId ||
        ""
      ) ||
      `${normalizedEventName}:${timestamp}:${userId || "unknown"}`,

    eventName:
      normalizedEventName,

    timestamp,

    userId,

    payload: {
      guildId:
        payload.guildId || null,

      channelId:
        payload.channelId || null,

      messageId:
        payload.messageId ||
        payload.msgId ||
        null,

      approverId:
        payload.approverId ||
        payload.executorId ||
        payload.byUserId ||
        null,

      city:
        payload.city ||
        payload.cidade ||
        null,

      source:
        payload.source ||
        null,
    },
  };

  const inserted =
    uniquePush(
      week.events,
      eventRecord,
      item => item.id
    );

  if (!inserted) {
    return;
  }

  if (rule) {
    const category =
      ensureCategoryData(
        week,
        rule.category
      );

    category.events += 1;
    category.points += toNumber(
      rule.points,
      0.5
    );

    category.qualityPoints +=
      toNumber(
        rule.quality,
        0
      );

    if (rule.quality > 0) {
      category.positive += 1;
    } else if (rule.quality < 0) {
      category.negative += 1;
    } else {
      category.neutral += 1;
    }

    if (
      userId &&
      !category.uniqueUsers.includes(userId)
    ) {
      category.uniqueUsers.push(userId);
    }

    if (
      rule.decision === "approved"
    ) {
      category.approved += 1;
      category.completed += 1;
    }

    if (
      rule.decision === "rejected"
    ) {
      category.rejected += 1;
      category.completed += 1;
    }
  }

  const operationId =
    resolveOperationId(
      normalizedEventName,
      payload
    );

  if (
    operationId &&
    isCreationEvent(
      normalizedEventName,
      rule
    )
  ) {
    state.pendingOperations[operationId] = {
      operationId,
      eventName:
        normalizedEventName,
      category:
        rule?.category ||
        "tempo_resposta",
      createdAt:
        timestamp,
      userId,
      guildId:
        payload.guildId || null,
      messageId:
        payload.messageId ||
        payload.msgId ||
        null,
    };

    if (rule) {
      ensureCategoryData(
        week,
        rule.category
      ).pending += 1;
    }
  }

  if (
    operationId &&
    isDecisionEvent(
      normalizedEventName,
      rule
    )
  ) {
    const pending =
      state.pendingOperations[operationId];

    const explicitCreatedAt =
      toNumber(
        payload.createdAt ||
        payload.createdAtMs ||
        payload.registeredAt ||
        0
      );

    const createdAt =
      pending?.createdAt ||
      explicitCreatedAt ||
      null;

    if (
      createdAt &&
      timestamp >= createdAt
    ) {
      const duration =
        timestamp - createdAt;

      const categoryId =
        rule?.category ||
        pending?.category ||
        "tempo_resposta";

      const category =
        ensureCategoryData(
          week,
          categoryId
        );

      category.responseTimes.push(
        duration
      );

      if (category.pending > 0) {
        category.pending -= 1;
      }

      const responseCategory =
        ensureCategoryData(
          week,
          "tempo_resposta"
        );

      responseCategory.events += 1;
      responseCategory.points += 1;
      responseCategory.completed += 1;
      responseCategory.responseTimes.push(
        duration
      );

      week.approvals.push({
        operationId,
        category:
          categoryId,
        createdAt,
        decidedAt:
          timestamp,
        duration,
        decision:
          rule?.decision ||
          "completed",
        userId:
          pending?.userId ||
          userId ||
          null,
        approverId:
          payload.approverId ||
          payload.executorId ||
          payload.byUserId ||
          null,
      });
    }

    delete state.pendingOperations[
      operationId
    ];
  }

  saveState(state);

  scheduleDashboardUpdate(
    client,
    `dash:${normalizedEventName}`
  );
}

// ============================================================================
// EVENTOS DE MEMBROS E LIDERANÇA
// ============================================================================

export async function npsOperacionalHandleGuildMemberAdd(
  member,
  client
) {
  try {
    if (
      !member ||
      member.user?.bot
    ) {
      return;
    }

    const state = loadState();
    const week =
      getWeekForTimestamp(
        state,
        Date.now()
      );

    uniquePush(
      week.members.entered,
      {
        userId: member.id,
        at: Date.now(),
        citizen:
          member.roles.cache.has(
            ROLE_CIDADAO_ID
          ),
        leader:
          member.roles.cache.has(
            ROLE_LIDER_ID
          ),
      },
      item =>
        `${item.userId}:${item.at}`
    );

    if (
      member.roles.cache.has(
        ROLE_LIDER_ID
      )
    ) {
      uniquePush(
        week.leaders.returned,
        {
          userId:
            member.id,
          at:
            Date.now(),
          reason:
            "joined_with_leader_role",
        },
        item =>
          `${item.userId}:${item.at}`
      );
    }

    saveState(state);

    scheduleDashboardUpdate(
      client,
      "member_add"
    );
  } catch (error) {
    console.error(
      "[NPS Operacional] Erro ao registrar entrada:",
      error
    );
  }
}

export async function npsOperacionalHandleGuildMemberRemove(
  member,
  client
) {
  try {
    if (
      !member ||
      member.user?.bot
    ) {
      return;
    }

    const state = loadState();
    const week =
      getWeekForTimestamp(
        state,
        Date.now()
      );

    const wasLeader =
      member.roles.cache.has(
        ROLE_LIDER_ID
      );

    uniquePush(
      week.members.left,
      {
        userId:
          member.id,
        at:
          Date.now(),
        citizen:
          member.roles.cache.has(
            ROLE_CIDADAO_ID
          ),
        leader:
          wasLeader,
      },
      item =>
        `${item.userId}:${item.at}`
    );

    if (wasLeader) {
      uniquePush(
        week.leaders.leftServer,
        {
          userId:
            member.id,
          at:
            Date.now(),
        },
        item =>
          `${item.userId}:${item.at}`
      );
    }

    saveState(state);

    scheduleDashboardUpdate(
      client,
      "member_remove"
    );
  } catch (error) {
    console.error(
      "[NPS Operacional] Erro ao registrar saída:",
      error
    );
  }
}

export async function npsOperacionalHandleGuildMemberUpdate(
  oldMember,
  newMember,
  client
) {
  try {
    if (
      !oldMember ||
      !newMember ||
      newMember.user?.bot
    ) {
      return;
    }

    const hadLeader =
      oldMember.roles.cache.has(
        ROLE_LIDER_ID
      );

    const hasLeader =
      newMember.roles.cache.has(
        ROLE_LIDER_ID
      );

    if (hadLeader === hasLeader) {
      return;
    }

    const state = loadState();
    const week =
      getWeekForTimestamp(
        state,
        Date.now()
      );

    const category =
      ensureCategoryData(
        week,
        "lideranca"
      );

    category.events += 1;

    if (
      !hadLeader &&
      hasLeader
    ) {
      category.points += 1;
      category.qualityPoints += 1;
      category.positive += 1;

      uniquePush(
        week.leaders.entered,
        {
          userId:
            newMember.id,
          at:
            Date.now(),
          citizen:
            newMember.roles.cache.has(
              ROLE_CIDADAO_ID
            ),
        },
        item =>
          `${item.userId}:${item.at}`
      );
    }

    if (
      hadLeader &&
      !hasLeader
    ) {
      category.points += 0.1;
      category.qualityPoints -= 1;
      category.negative += 1;

      uniquePush(
        week.leaders.removed,
        {
          userId:
            newMember.id,
          at:
            Date.now(),
          citizen:
            newMember.roles.cache.has(
              ROLE_CIDADAO_ID
            ),
        },
        item =>
          `${item.userId}:${item.at}`
      );
    }

    saveState(state);

    scheduleDashboardUpdate(
      client,
      "leader_role_update"
    );
  } catch (error) {
    console.error(
      "[NPS Operacional] Erro ao registrar cargo de líder:",
      error
    );
  }
}

// ============================================================================
// CÁLCULO DAS CATEGORIAS
// ============================================================================

function getExpectedProgress(reference = new Date()) {
  const parts = getSPParts(reference);

  const completedDays =
    parts.weekday +
    (
      (
        parts.hour * 60 +
        parts.minute
      ) /
      1440
    );

  return clamp(
    completedDays / 7,
    0.08,
    1
  );
}

function calculateResponseScore(
  responseTimes
) {
  if (!responseTimes.length) {
    return null;
  }

  const mean =
    average(responseTimes);

  const medianValue =
    median(responseTimes);

  const p90 =
    percentile(
      responseTimes,
      0.9
    );

  const meanHours =
    mean / 3600000;

  const medianHours =
    medianValue / 3600000;

  const p90Hours =
    p90 / 3600000;

  const meanScore =
    clamp(
      100 -
      meanHours * 7,
      0,
      100
    );

  const medianScore =
    clamp(
      100 -
      medianHours * 8,
      0,
      100
    );

  const p90Score =
    clamp(
      100 -
      p90Hours * 4,
      0,
      100
    );

  return {
    score:
      meanScore * 0.4 +
      medianScore * 0.35 +
      p90Score * 0.25,

    average:
      mean,

    median:
      medianValue,

    p90,

    minimum:
      Math.min(
        ...responseTimes
      ),

    maximum:
      Math.max(
        ...responseTimes
      ),

    samples:
      responseTimes.length,
  };
}

function calculateCategoryResult({
  categoryId,
  categoryConfig,
  categoryData,
  consolidatedData,
  expectedProgress,
}) {
  const liveData =
    categoryData || {
      events: 0,
      points: 0,
      qualityPoints: 0,
      positive: 0,
      negative: 0,
      neutral: 0,
      uniqueUsers: [],
      responseTimes: [],
      pending: 0,
      completed: 0,
      approved: 0,
      rejected: 0,
    };

  const consolidated =
    consolidatedData || {
      events: 0,
      points: 0,
      positive: 0,
      negative: 0,
      neutral: 0,
      sources: {},
    };

  /*
   * O consolidado funciona como um piso.
   *
   * Exemplo:
   * - arquivo semanal informa 30 registros;
   * - o NPS recebeu 4 desses registros em tempo real;
   * - resultado utilizado: 30, e não 34.
   *
   * Assim o painel recupera dados anteriores sem duplicar
   * acontecimentos recebidos após a inicialização.
   */
  const data = {
    ...liveData,

    events:
      Math.max(
        Number(
          liveData.events || 0
        ),
        Number(
          consolidated.events || 0
        )
      ),

    points:
      Math.max(
        Number(
          liveData.points || 0
        ),
        Number(
          consolidated.points || 0
        )
      ),

    positive:
      Math.max(
        Number(
          liveData.positive || 0
        ),
        Number(
          consolidated.positive || 0
        )
      ),

    negative:
      Math.max(
        Number(
          liveData.negative || 0
        ),
        Number(
          consolidated.negative || 0
        )
      ),

    neutral:
      Math.max(
        Number(
          liveData.neutral || 0
        ),
        Number(
          consolidated.neutral || 0
        )
      ),

    uniqueUsers:
      Array.isArray(
        liveData.uniqueUsers
      )
        ? liveData.uniqueUsers
        : [],

    responseTimes:
      Array.isArray(
        liveData.responseTimes
      )
        ? liveData.responseTimes
        : [],

    consolidatedSources:
      consolidated.sources || {},
  };

  const weeklyGoal = Math.max(
    1,
    toNumber(
      categoryConfig.weeklyGoal,
      1
    )
  );

  const expectedGoal =
    weeklyGoal *
    expectedProgress;

  const productivityScore =
    clamp(
      (
        data.points /
        Math.max(
          1,
          expectedGoal
        )
      ) *
      100,
      0,
      100
    );

  const evaluated =
    data.positive +
    data.negative;

  const qualityScore =
    evaluated > 0
      ? clamp(
          (
            data.positive /
            evaluated
          ) *
          100,
          0,
          100
        )
      : (
          data.events > 0
            ? 75
            : 0
        );

  const completionDenominator =
    data.completed +
    data.pending;

  const completionScore =
    completionDenominator > 0
      ? clamp(
          (
            data.completed /
            completionDenominator
          ) *
          100,
          0,
          100
        )
      : (
          data.events > 0
            ? 80
            : 0
        );

  const response =
    calculateResponseScore(
      data.responseTimes || []
    );

  let score =
    productivityScore * 0.5 +
    qualityScore * 0.3 +
    completionScore * 0.2;

  if (response) {
    score =
      score * 0.8 +
      response.score * 0.2;
  }

  const hasData =
    data.events > 0 ||
    data.points > 0 ||
    data.responseTimes?.length > 0;

  return {
    categoryId,

    label:
      categoryConfig.label,

    weight:
      toNumber(
        categoryConfig.weight,
        1
      ),

    hasData,

    score:
      hasData
        ? clamp(score, 0, 100)
        : null,

    productivityScore,

    qualityScore,

    completionScore,

    response,

    raw: data,
  };
}

// ============================================================================
// CÁLCULO DA LIDERANÇA
// ============================================================================

function calculateLeadershipContext(
  week
) {
  const entered =
    week.leaders.entered.length;

  const removed =
    week.leaders.removed.length;

  const leftServer =
    week.leaders.leftServer.length;

  const totalLosses =
    removed +
    leftServer;

  const retentionBase =
    entered > 0
      ? entered
      : Math.max(
          1,
          entered + totalLosses
        );

  const retention =
    clamp(
      (
        (
          retentionBase -
          totalLosses
        ) /
        retentionBase
      ) *
      100,
      0,
      100
    );

  return {
    entered,
    removed,
    leftServer,
    returned:
      week.leaders.returned.length,
    totalLosses,
    retention,
  };
}

// ============================================================================
// CÁLCULO DA SEMANA
// ============================================================================

function calculateWeek(
  state,
  weekInfo,
  config,
  {
    currentWeek = false,
  } = {}
) {
  const week =
    ensureWeek(
      state,
      weekInfo
    );

  const expectedProgress =
    currentWeek
      ? getExpectedProgress()
      : 1;

  const categories = [];

  for (
    const [
      categoryId,
      categoryConfig,
    ] of Object.entries(
      config.categories
    )
  ) {
    if (
      categoryConfig.enabled === false
    ) {
      continue;
    }

    categories.push(
      calculateCategoryResult({
        categoryId,
        categoryConfig,

        categoryData:
          week.categories[
            categoryId
          ],

        consolidatedData:
          week.consolidatedSources?.[
            categoryId
          ],

        expectedProgress,
      })
    );
  }

  const leadership =
    calculateLeadershipContext(
      week
    );

  const leadershipCategory =
    categories.find(
      category =>
        category.categoryId ===
        "lideranca"
    );

  if (
    leadershipCategory &&
    (
      leadership.entered > 0 ||
      leadership.totalLosses > 0
    )
  ) {
    leadershipCategory.hasData = true;

    const baseScore =
      leadershipCategory.score ?? 70;

    leadershipCategory.score =
      baseScore * 0.55 +
      leadership.retention * 0.45;
  }

  const validCategories =
    categories.filter(
      category =>
        category.hasData &&
        Number.isFinite(
          category.score
        )
    );

  const totalWeight =
    validCategories.reduce(
      (total, category) =>
        total + category.weight,
      0
    );

  const rawScore =
    totalWeight > 0
      ? validCategories.reduce(
          (total, category) =>
            total +
            category.score *
            category.weight,
          0
        ) / totalWeight
      : 0;

  const consolidatedEvents =
    Object.values(
      week.consolidatedSources || {}
    ).reduce(
      (
        total,
        category
      ) =>
        total +
        Number(
          category?.events || 0
        ),
      0
    );

  const liveEvents =
    Array.isArray(
      week.events
    )
      ? week.events.length
      : 0;

  /*
   * Utiliza o maior total entre:
   *
   * • eventos consolidados recuperados do Ranking Geral;
   * • eventos recebidos em tempo real pelo NPS.
   *
   * Isso evita exibir zero após importar o histórico
   * e também evita somar os mesmos acontecimentos duas vezes.
   */
  const totalEvents =
    Math.max(
      consolidatedEvents,
      liveEvents
    );

  return {
    week,
    weekInfo,
    expectedProgress,
    categories,
    validCategories,
    rawScore:
      clamp(
        rawScore,
        0,
        100
      ),
    leadership,
    totalEvents,
  };
}

// ============================================================================
// TRAVA DE REALIDADE OPERACIONAL
// ============================================================================

function applyOperationalRealityGate(
  displayed,
  current,
  providerMetrics = []
) {
  const findMetric =
    metricId =>
      providerMetrics.find(
        metric =>
          (
            metric.id ||
            metric.providerId
          ) === metricId &&
          metric.available !== false &&
          Number.isFinite(
            Number(
              metric.score
            )
          )
      );

  const generalPerformance =
    findMetric(
      "desempenho_geral"
    );

  const teamParticipation =
    findMetric(
      "participacao_equipe"
    );

  const availableCoreMetrics = [
    generalPerformance,
    teamParticipation,
  ].filter(Boolean);

  /*
   * Sem os indicadores centrais, a confiança geral é insuficiente
   * para declarar que toda a operação está em nível excelente
   * ou muito bom.
   */
  if (!availableCoreMetrics.length) {
    return {
      ...displayed,

      score:
        Math.min(
          displayed.score,
          69.9
        ),

      operationalGate: {
        applied:
          true,

        reason:
          "core_metrics_missing",

        coreScore:
          null,

        originalScore:
          displayed.score,

        finalScore:
          Math.min(
            displayed.score,
            69.9
          ),
      },
    };
  }

  const generalScore =
    generalPerformance
      ? Number(
          generalPerformance.score
        )
      : null;

  const participationScore =
    teamParticipation
      ? Number(
          teamParticipation.score
        )
      : null;

  let coreScore;

  if (
    generalScore != null &&
    participationScore != null
  ) {
    /*
     * O ritmo geral possui 55% da leitura central.
     * A distribuição da participação possui 45%.
     */
    coreScore =
      generalScore * 0.55 +
      participationScore * 0.45;
  } else {
    coreScore =
      generalScore ??
      participationScore ??
      0;
  }

  let maximumAllowedScore =
    100;

  /*
   * As categorias individuais podem melhorar a nota,
   * mas não podem esconder uma operação geral crítica.
   */
  if (coreScore < 40) {
    maximumAllowedScore =
      59.9;
  } else if (coreScore < 55) {
    maximumAllowedScore =
      64.9;
  } else if (coreScore < 70) {
    maximumAllowedScore =
      74.9;
  } else if (coreScore < 80) {
    maximumAllowedScore =
      84.9;
  }

  const finalScore =
    Math.min(
      displayed.score,
      maximumAllowedScore
    );

  return {
    ...displayed,

    score:
      clamp(
        finalScore,
        0,
        100
      ),

    operationalGate: {
      applied:
        finalScore <
        displayed.score,

      reason:
        finalScore <
        displayed.score
          ? "core_metrics_below_general_score"
          : "not_required",

      coreScore,

      generalScore,

      participationScore,

      originalScore:
        displayed.score,

      maximumAllowedScore,

      finalScore,
    },
  };
}

// ============================================================================
// TRANSIÇÃO INTELIGENTE ENTRE SEMANAS
// ============================================================================

function calculateDisplayedCurrentScore(
  currentResult,
  previousResult
) {
  const currentVolume =
    currentResult.totalEvents;

  const progress =
    currentResult.expectedProgress;

  const volumeConfidence =
    clamp(
      currentVolume / 45,
      0,
      1
    );

  const timeConfidence =
    clamp(
      progress,
      0,
      1
    );

  const currentWeight =
    clamp(
      volumeConfidence * 0.65 +
      timeConfidence * 0.35,
      0.12,
      1
    );

  const previousScore =
    previousResult.rawScore > 0
      ? previousResult.rawScore
      : currentResult.rawScore;

  const displayedScore =
    currentResult.rawScore *
      currentWeight +
    previousScore *
      (
        1 -
        currentWeight
      );

  return {
    score:
      clamp(
        displayedScore,
        0,
        100
      ),
    currentWeight,
    historicalWeight:
      1 - currentWeight,
  };
}

// ============================================================================
// DIAGNÓSTICO INTELIGENTE
// ============================================================================

function buildDiagnosis(
  current,
  previous,
  displayed,
  providerMetrics = []
) {
  const categoryComparisons =
    current.categories
      .map(
        category => {
          const previousCategory =
            previous.categories.find(
              item =>
                item.categoryId ===
                category.categoryId
            );

          if (
            !category.hasData ||
            !previousCategory?.hasData
          ) {
            return {
              ...category,
              previousScore:
                previousCategory?.score ??
                null,
              difference: null,
            };
          }

          return {
            ...category,
            previousScore:
              previousCategory.score,
            difference:
              category.score -
              previousCategory.score,
          };
        }
      );

  const improved =
    categoryComparisons
      .filter(
        category =>
          category.difference != null &&
          category.difference > 1
      )
      .sort(
        (a, b) =>
          b.difference -
          a.difference
      );

  const worsened =
    categoryComparisons
      .filter(
        category =>
          category.difference != null &&
          category.difference < -1
      )
      .sort(
        (a, b) =>
          a.difference -
          b.difference
      );

  const strongest =
    [...current.validCategories]
      .sort(
        (a, b) =>
          b.score -
          a.score
      );

  const weakest =
    [...current.validCategories]
      .sort(
        (a, b) =>
          a.score -
          b.score
      );

  const generalDifference =
    displayed.score -
    previous.rawScore;

  const positives = [];
  const attentions = [];
  const recommendations = [];

  if (
    displayed.operationalGate?.applied
  ) {
    const gate =
      displayed.operationalGate;

    attentions.push(
      gate.coreScore != null
        ? `Os indicadores gerais da operação estão em ${gate.coreScore.toFixed(1)}%. Por esse motivo, a nota geral foi limitada de ${gate.originalScore.toFixed(1)}% para ${gate.finalScore.toFixed(1)}%.`
        : `Os indicadores centrais do Ranking Geral e do GeralDash ainda não estavam disponíveis. Por segurança, a nota geral foi limitada a ${gate.finalScore.toFixed(1)}%.`
    );

    recommendations.push(
      "Priorizar o ritmo da meta geral e aumentar a quantidade de participantes que atingem o mínimo individual antes de classificar a operação como saudável."
    );
  }

 /*
 * Estas métricas possuem seções próprias no relatório humano.
 *
 * Por isso, seus textos não devem ser copiados novamente para
 * os blocos genéricos de pontos positivos, atenção e recomendações.
 *
 * A Meta Interna também é ignorada porque está desabilitada e
 * não participa do NPS Operacional Geral.
 */
const metricsWithDedicatedAnalysis =
  new Set([
    "participacao_equipe",
    "desempenho_geral",
    "meta_interna",
    "set_staff",
  ]);

for (
  const metric of providerMetrics
) {
  if (
    metric.available === false
  ) {
    continue;
  }

  const metricId =
    safeString(
      metric?.id ||
      metric?.providerId
    );

  if (
    metricsWithDedicatedAnalysis.has(
      metricId
    )
  ) {
    continue;
  }

  for (
    const point of
    metric.positivePoints || []
  ) {
    positives.push(
      `${metric.label}: ${point}`
    );
  }

  for (
    const point of
    metric.attentionPoints || []
  ) {
    attentions.push(
      `${metric.label}: ${point}`
    );
  }

  for (
    const recommendation of
    metric.recommendations || []
  ) {
    recommendations.push(
      `${metric.label}: ${recommendation}`
    );
  }
}

  if (improved.length) {
    positives.push(
      `${improved[0].label} apresentou a maior evolução da semana, com avanço de ${formatSigned(improved[0].difference)} pontos.`
    );
  }

  if (
    strongest.length &&
    strongest[0].score >= 80
  ) {
    positives.push(
      `${strongest[0].label} mantém desempenho forte, alcançando ${strongest[0].score.toFixed(1)}%.`
    );
  }

  if (
    current.leadership.entered > 0 &&
    current.leadership.retention >= 80
  ) {
    positives.push(
      `A liderança apresentou retenção estimada de ${current.leadership.retention.toFixed(1)}%, indicando boa permanência dos novos líderes.`
    );
  }

  if (worsened.length) {
    attentions.push(
      `${worsened[0].label} registrou a maior queda, com variação de ${formatSigned(worsened[0].difference)} pontos.`
    );
  }

  if (
    weakest.length &&
    weakest[0].score < 60
  ) {
    attentions.push(
      `${weakest[0].label} está em nível crítico, com ${weakest[0].score.toFixed(1)}%.`
    );
  }

  const responseCategory =
    current.categories.find(
      category =>
        category.categoryId ===
        "tempo_resposta"
    );

  if (
    responseCategory?.response &&
    responseCategory.response.average >
      6 * 60 * 60 * 1000
  ) {
    attentions.push(
      `O tempo médio observado para conclusão dos processos está em ${formatDuration(responseCategory.response.average)}, indicando possível gargalo operacional.`
    );
  }

  if (
    current.leadership.totalLosses >
    current.leadership.entered &&
    current.leadership.totalLosses > 0
  ) {
    attentions.push(
      `As perdas de liderança superaram as entradas nesta semana. Foram ${current.leadership.entered} entradas e ${current.leadership.totalLosses} perdas.`
    );
  }

  if (worsened.length) {
    recommendations.push(
      `Priorizar o acompanhamento de ${worsened[0].label}, verificando volume, responsáveis disponíveis e pendências acumuladas.`
    );
  }

  if (
    responseCategory?.raw?.pending > 0
  ) {
    recommendations.push(
      `Revisar as ${responseCategory.raw.pending} pendências ainda abertas para evitar aumento do tempo de espera dos membros.`
    );
  }

  if (
    current.leadership.retention < 70 &&
    (
      current.leadership.entered > 0 ||
      current.leadership.totalLosses > 0
    )
  ) {
    recommendations.push(
      "Acompanhar os motivos de remoção e saída dos líderes, reforçando integração e suporte durante os primeiros dias."
    );
  }

  if (!positives.length) {
    positives.push(
      "A operação continua gerando dados e mantendo atividade durante a semana, permitindo acompanhamento progressivo dos indicadores."
    );
  }

  if (!attentions.length) {
    attentions.push(
      "Nenhum ponto crítico dominante foi identificado com os dados disponíveis até o momento."
    );
  }

  if (!recommendations.length) {
    recommendations.push(
      "Manter o ritmo atual e acompanhar as categorias com menor volume para garantir fechamento equilibrado da semana."
    );
  }

  let trend;

  if (generalDifference >= 3) {
    trend =
      "A tendência geral é de crescimento consistente.";
  } else if (
    generalDifference <= -3
  ) {
    trend =
      "A tendência geral indica queda e exige recuperação antes do fechamento.";
  } else {
    trend =
      "A tendência geral permanece estável.";
  }

  return {
    generalDifference,
    improved,
    worsened,
    strongest,
    weakest,
    positives,
    attentions,
    recommendations,
    trend,
  };
}

// ============================================================================
// EMBED DO PAINEL
// ============================================================================

function progressBar(
  percentage,
  size = 10
) {
  const safePercentage =
    clamp(
      percentage,
      0,
      100
    );

  const filled =
    Math.round(
      (
        safePercentage /
        100
      ) *
      size
    );

  return (
    "█".repeat(filled) +
    "░".repeat(
      size - filled
    )
  );
}
function buildDashboardEmbed({
  current,
  previous,
  displayed,
  diagnosis,
  config,
}) {
  const score =
    displayed.score;

  const classification =
    getClassification(
      score,
      config
    );

  const difference =
    diagnosis.generalDifference;

  const movementEmoji =
    difference > 1
      ? "📈"
      : difference < -1
        ? "📉"
        : "➡️";

  const movementText =
    difference > 1
      ? `+${Math.abs(difference).toFixed(1)} pts`
      : difference < -1
        ? `-${Math.abs(difference).toFixed(1)} pts`
        : "estável";

  const validCategories =
    current.validCategories
      .slice()
      .sort(
        (firstCategory, secondCategory) =>
          secondCategory.score -
          firstCategory.score
      );

  const strongest =
    validCategories[0] ||
    null;

  const weakest =
    validCategories[
      validCategories.length - 1
    ] ||
    null;

  const strongestClassification =
    strongest
      ? getClassification(
          strongest.score,
          config
        )
      : null;

  const weakestClassification =
    weakest
      ? getClassification(
          weakest.score,
          config
        )
      : null;

  const currentWeekProgress =
    Math.max(
      0,
      Math.min(
        100,
        Number(
          current.expectedProgress ||
          0
        ) * 100
      )
    );

  const previousScore =
    Number.isFinite(
      Number(
        previous.rawScore
      )
    )
      ? Number(
          previous.rawScore
        )
      : 0;

  const summaryLines = [
    `\`${NPS_DASH_MARKER}\``,
    "",
    `\`${progressBar(score, 14)}\``,
    "",
    `📅 **${current.weekInfo.label}**`,
    `${movementEmoji} **${movementText}** em relação à semana passada`,
    "",
    `🏆 ${strongestClassification?.emoji || "⚪"} **Melhor:** ${
      strongest
        ? `${strongest.label} · ${strongest.score.toFixed(1)}%`
        : "Aguardando dados"
    }`,
    `⚠️ ${weakestClassification?.emoji || "⚪"} **Atenção:** ${
      weakest
        ? `${weakest.label} · ${weakest.score.toFixed(1)}%`
        : "Aguardando dados"
    }`,
    "",
    `📦 **${current.totalEvents}** atividades analisadas`,
    `📊 **${current.validCategories.length}** áreas avaliadas`,
    `🗓️ **${currentWeekProgress.toFixed(0)}%** da semana concluída`,
    "",
    `Semana passada: **${previousScore.toFixed(1)}%**`,
  ];

  return new EmbedBuilder()
    .setColor(
      score >= 90
        ? 0x2ecc71
        : score >= 80
          ? 0x57f287
          : score >= 70
            ? 0xf1c40f
            : score >= 60
              ? 0xe67e22
              : 0xed4245
    )
    .setAuthor({
      name:
        "SantaCreators • NPS Operacional",
    })
    .setTitle(
      `${classification.emoji} ${score.toFixed(1)}% · ${classification.label}`
    )
    .setDescription(
      summaryLines.join(
        "\n"
      )
    )
    .setFooter({
      text:
        "Atualização automática • Consulte os botões para abrir as análises",
    })
    .setTimestamp();
}

// ============================================================================
// PAINEL EXECUTIVO COMPLETO
// ============================================================================

function buildExecutiveDashboardEmbeds({
  current,
  previous,
  displayed,
  diagnosis,
  config,
}) {
  const score =
    displayed.score;

  const classification =
    getClassification(
      score,
      config
    );

  const difference =
    diagnosis.generalDifference;

  const validCategories =
    current.validCategories
      .slice()
      .sort(
        (a, b) =>
          b.score - a.score
      );

  const strongest =
    validCategories.slice(
      0,
      3
    );

  const weakest =
    validCategories
      .slice()
      .sort(
        (a, b) =>
          a.score - b.score
      )
      .slice(
        0,
        3
      );

  const movementText =
    difference > 1
      ? `A operação melhorou ${difference.toFixed(1)} pontos em relação à semana passada.`
      : difference < -1
        ? `A operação caiu ${Math.abs(difference).toFixed(1)} pontos em relação à semana passada.`
        : "A operação permanece próxima do resultado da semana passada.";

  const currentInfluence =
    displayed.currentWeight * 100;

  const previousInfluence =
    displayed.historicalWeight * 100;

  const overviewEmbed =
    new EmbedBuilder()
      .setColor(
        score >= 90
          ? 0x2ecc71
          : score >= 80
            ? 0x57f287
            : score >= 70
              ? 0xf1c40f
              : score >= 60
                ? 0xe67e22
                : 0xed4245
      )
      .setAuthor({
        name:
          "SantaCreators • Centro de Inteligência Operacional",
      })
      .setTitle(
        "📊 Visão geral da operação"
      )
      .setDescription(
        [
          `\`${NPS_EXECUTIVE_MARKER}\``,
          "",
          `## ${classification.emoji} ${score.toFixed(1)}% — ${classification.label}`,
          `\`${progressBar(score, 18)}\``,
          "",
          `📅 **Semana analisada:** ${current.weekInfo.label}`,
          `📌 **Leitura geral:** ${movementText}`,
          `📈 **Direção da semana:** ${diagnosis.trend}`,
          "",
          "A nota reúne produtividade, qualidade, participação, liderança, aprovações e demais atividades registradas pelos sistemas da SantaCreators.",
        ].join("\n")
      )
      .addFields(
        {
          name:
            "🗓️ Semana atual",
          value:
            `${current.rawScore.toFixed(1)}%`,
          inline:
            true,
        },
        {
          name:
            "📆 Semana passada",
          value:
            `${previous.rawScore.toFixed(1)}%`,
          inline:
            true,
        },
        {
          name:
            "🔄 Diferença",
          value:
            `${formatSigned(difference)} pontos`,
          inline:
            true,
        },
        {
          name:
            "🧠 Como a nota foi formada",
          value: [
            `**Informações desta semana:** ${currentInfluence.toFixed(0)}%`,
            `**Referência da semana passada:** ${previousInfluence.toFixed(0)}%`,
            "",
            "Essa combinação evita que a nota despenque no começo de uma nova semana.",
          ].join("\n"),
          inline:
            false,
        },
        {
          name:
            "📡 Tamanho da análise",
          value: [
            `**Atividades consideradas:** ${current.totalEvents}`,
            `**Áreas avaliadas:** ${current.validCategories.length}`,
            `**Progresso da semana:** ${(current.expectedProgress * 100).toFixed(0)}%`,
          ].join("\n"),
          inline:
            false,
        }
      )
      .setFooter({
        text:
          "Painel executivo • Atualização automática",
      })
      .setTimestamp();

  const categoryLines =
    validCategories
      .map(
        category => {
          const status =
            getClassification(
              category.score,
              config
            );

          const previousCategory =
            previous.categories.find(
              item =>
                item.categoryId ===
                category.categoryId
            );

          let comparisonText =
            "sem comparação anterior";

          if (
            previousCategory?.hasData &&
            Number.isFinite(
              previousCategory.score
            )
          ) {
            const categoryDifference =
              category.score -
              previousCategory.score;

            comparisonText =
              categoryDifference > 1
                ? `cresceu ${categoryDifference.toFixed(1)} pontos`
                : categoryDifference < -1
                  ? `caiu ${Math.abs(categoryDifference).toFixed(1)} pontos`
                  : "permaneceu estável";
          }

          return (
            `${status.emoji} **${category.label} — ${category.score.toFixed(1)}%**\n` +
            `└ ${comparisonText} • ${category.raw.events} atividades analisadas`
          );
        }
      )
      .join("\n\n") ||
    "Ainda não existem áreas com informações suficientes.";

  const categoriesEmbed =
    new EmbedBuilder()
      .setColor(
        0x5865f2
      )
      .setTitle(
        "🏢 Resultado por área"
      )
      .setDescription(
        "Cada área possui sua própria nota. Isso permite descobrir exatamente onde a operação está forte e onde precisa de acompanhamento."
      )
      .addFields(
        {
          name:
            "📋 Áreas avaliadas",
          value:
            truncate(
              categoryLines,
              4000
            ),
          inline:
            false,
        }
      )
      .setFooter({
        text:
          "As áreas sem dados suficientes não reduzem a nota geral",
      });

  const strongestLines =
    strongest.length
      ? strongest
          .map(
            (
              category,
              index
            ) =>
              `${index + 1}. **${category.label}** — ${category.score.toFixed(1)}%`
          )
          .join("\n")
      : "Ainda não existem destaques suficientes.";

  const weakestLines =
    weakest.length
      ? weakest
          .map(
            (
              category,
              index
            ) =>
              `${index + 1}. **${category.label}** — ${category.score.toFixed(1)}%`
          )
          .join("\n")
      : "Nenhum ponto de atenção identificado.";

  const improvedLines =
    diagnosis.improved.length
      ? diagnosis.improved
          .slice(
            0,
            5
          )
          .map(
            category =>
              `📈 **${category.label}:** aumentou ${category.difference.toFixed(1)} pontos`
          )
          .join("\n")
      : "Nenhuma melhora comparável foi identificada até o momento.";

  const worsenedLines =
    diagnosis.worsened.length
      ? diagnosis.worsened
          .slice(
            0,
            5
          )
          .map(
            category =>
              `📉 **${category.label}:** caiu ${Math.abs(category.difference).toFixed(1)} pontos`
          )
          .join("\n")
      : "Nenhuma queda comparável foi identificada até o momento.";

  const performanceEmbed =
    new EmbedBuilder()
      .setColor(
        0xf1c40f
      )
      .setTitle(
        "📈 Evolução e impacto no resultado"
      )
      .addFields(
        {
          name:
            "🏆 Áreas com melhor desempenho",
          value:
            strongestLines,
          inline:
            false,
        },
        {
          name:
            "⚠️ Áreas que mais precisam de atenção",
          value:
            weakestLines,
          inline:
            false,
        },
        {
          name:
            "⬆️ O que melhorou",
          value:
            truncate(
              improvedLines,
              1024
            ),
          inline:
            false,
        },
        {
          name:
            "⬇️ O que piorou",
          value:
            truncate(
              worsenedLines,
              1024
            ),
          inline:
            false,
        }
      );

  const positiveLines =
    diagnosis.positives
      .map(
        text =>
          `✅ ${text}`
      )
      .join("\n\n");

  const attentionLines =
    diagnosis.attentions
      .map(
        text =>
          `⚠️ ${text}`
      )
      .join("\n\n");

  const recommendationLines =
    diagnosis.recommendations
      .map(
        text =>
          `🎯 ${text}`
      )
      .join("\n\n");

  const responseCategory =
    current.categories.find(
      category =>
        category.categoryId ===
        "tempo_resposta"
    );

  const responseText =
    responseCategory?.response
      ? [
          `**Tempo médio:** ${formatDuration(responseCategory.response.average)}`,
          `**Tempo mais comum:** ${formatDuration(responseCategory.response.median)}`,
          `**90% dos casos concluídos em até:** ${formatDuration(responseCategory.response.p90)}`,
          `**Mais rápido:** ${formatDuration(responseCategory.response.minimum)}`,
          `**Mais demorado:** ${formatDuration(responseCategory.response.maximum)}`,
          `**Processos analisados:** ${responseCategory.response.samples}`,
        ].join("\n")
      : "Ainda não existem registros suficientes ligando a criação de uma solicitação à sua conclusão.";

  const analysisEmbed =
    new EmbedBuilder()
      .setColor(
        0x3498db
      )
      .setTitle(
        "🧠 Leitura inteligente da semana"
      )
      .setDescription(
        "Esta seção transforma os números em uma leitura simples para apoiar as decisões da gestão."
      )
      .addFields(
        {
          name:
            "🟢 O que está funcionando bem",
          value:
            truncate(
              positiveLines,
              1024
            ),
          inline:
            false,
        },
        {
          name:
            "🟠 O que precisa ser acompanhado",
          value:
            truncate(
              attentionLines,
              1024
            ),
          inline:
            false,
        },
        {
          name:
            "🎯 Próximas ações recomendadas",
          value:
            truncate(
              recommendationLines,
              1024
            ),
          inline:
            false,
        },
        {
          name:
            "⏱️ Agilidade dos processos",
          value:
            truncate(
              responseText,
              1024
            ),
          inline:
            false,
        },
        {
          name:
            "👑 Movimento da liderança",
          value: [
            `**Novos líderes:** ${current.leadership.entered}`,
            `**Cargos removidos:** ${current.leadership.removed}`,
            `**Líderes que saíram do servidor:** ${current.leadership.leftServer}`,
            `**Retornos:** ${current.leadership.returned}`,
            `**Permanência estimada:** ${current.leadership.retention.toFixed(1)}%`,
          ].join("\n"),
          inline:
            false,
        }
      )
      .setFooter({
        text:
          "As análises são atualizadas conforme novas atividades são registradas",
      });

  return [
    overviewEmbed,
    categoriesEmbed,
    performanceEmbed,
    analysisEmbed,
  ];
}

function buildDashboardComponents() {
  return [
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            BUTTON_REFRESH_ID
          )
          .setLabel(
            "Atualizar dados"
          )
          .setEmoji("🔄")
          .setStyle(
            ButtonStyle.Primary
          ),

        new ButtonBuilder()
          .setCustomId(
            BUTTON_CURRENT_DM_ID
          )
          .setLabel(
            "Semana atual"
          )
          .setEmoji("📊")
          .setStyle(
            ButtonStyle.Success
          ),

        new ButtonBuilder()
          .setCustomId(
            BUTTON_PREVIOUS_DM_ID
          )
          .setLabel(
            "Semana passada"
          )
          .setEmoji("📅")
          .setStyle(
            ButtonStyle.Secondary
          ),

        new ButtonBuilder()
          .setCustomId(
            BUTTON_EXECUTIVE_DM_ID
          )
          .setLabel(
            "Relatório completo"
          )
          .setEmoji("🧠")
          .setStyle(
            ButtonStyle.Secondary
          )
      ),
  ];
}

// ============================================================================
// RECÁLCULO APÓS APLICAÇÃO DAS MÉTRICAS REAIS
// ============================================================================

function recalculateWeekResult(
  result
) {
  const validCategories =
    result.categories.filter(
      category =>
        category.hasData &&
        Number.isFinite(
          Number(
            category.score
          )
        )
    );

  const totalWeight =
    validCategories.reduce(
      (
        total,
        category
      ) =>
        total +
        Number(
          category.weight || 0
        ),
      0
    );

  const rawScore =
    totalWeight > 0
      ? validCategories.reduce(
          (
            total,
            category
          ) =>
            total +
            Number(
              category.score || 0
            ) *
            Number(
              category.weight || 0
            ),
          0
        ) / totalWeight
      : 0;

  const providerVolume =
    validCategories.reduce(
      (
        total,
        category
      ) =>
        total +
        Number(
          category.raw
            ?.providerMetric
            ?.volume || 0
        ),
      0
    );

  result.validCategories =
    validCategories;

  result.rawScore =
    clamp(
      rawScore,
      0,
      100
    );

  result.totalEvents =
    Math.max(
      Number(
        result.totalEvents || 0
      ),
      providerVolume
    );

  return result;
}

// ============================================================================
// GARANTIA DAS MÉTRICAS GERAIS
// ============================================================================

async function ensureCoreOperationalMetrics(
  providerCollection,
  context
) {
  providerCollection.results ||=
    [];

  providerCollection.errors ||=
    [];

  /*
   * Estas são as duas fontes oficiais da régua principal:
   *
   * • scGeralDash.js para a meta geral de 500 pontos;
   * • scGeralWeeklyRanking.js para participação individual.
   *
   * Mesmo que exista outro provedor com o mesmo ID no Hub,
   * a versão oficial abaixo sempre substituirá a anterior.
   */
  const requiredProviders = [
    {
      id:
        "desempenho_geral",

      label:
        "Ritmo Geral da Operação",

      provider:
        buildGeneralDashOperationalMetric,
    },

    {
      id:
        "participacao_equipe",

      label:
        "Participação da Equipe",

      provider:
        buildWeeklyRankingOperationalMetric,
    },
  ];

  for (
    const requiredProvider of
    requiredProviders
  ) {
    const existingMetricIndex =
      providerCollection.results.findIndex(
        metric =>
          metric.id ===
            requiredProvider.id ||
          metric.providerId ===
            requiredProvider.id
      );

    try {
      const metric =
        await requiredProvider.provider(
          context
        );

      if (
        !metric ||
        metric.available === false
      ) {
        providerCollection.errors.push({
          providerId:
            requiredProvider.id,

          message:
            `A fonte oficial de ${requiredProvider.label} não retornou dados disponíveis.`,
        });

        continue;
      }

      const normalizedMetric = {
        providerId:
          requiredProvider.id,

        ...metric,

        id:
          metric.id ||
          requiredProvider.id,

        officialSource:
          true,
      };

      if (
        existingMetricIndex >= 0
      ) {
        providerCollection.results[
          existingMetricIndex
        ] =
          normalizedMetric;
      } else {
        providerCollection.results.push(
          normalizedMetric
        );
      }

      console.log(
        `[NPS Operacional] Métrica oficial aplicada: ${requiredProvider.id}`,
        {
          available:
            normalizedMetric.available,

          score:
            normalizedMetric.score,

          volume:
            normalizedMetric.volume,

          current:
            normalizedMetric.current,

          previous:
            normalizedMetric.previous,

          difference:
            normalizedMetric.difference,
        }
      );
    } catch (error) {
      const message =
        error?.message ||
        String(error);

      providerCollection.errors.push({
        providerId:
          requiredProvider.id,

        message,
      });

      console.error(
        `[NPS Operacional] Falha ao consultar a fonte oficial "${requiredProvider.id}":`,
        error
      );
    }
  }

  return providerCollection;
}

// ============================================================================
// GERAÇÃO DOS RESULTADOS
// ============================================================================

async function generateResults() {
  const config = loadConfig();
  const state = loadState();

  syncConsolidatedWeeklySources(
    state
  );

  const providerContext = {
    client:
      activeClient,

    currentWeek:
      getWeekInfo(),

    previousWeek:
      getPreviousWeekInfo(),

    currentMoment:
      getOperationalWeekMoment(
        new Date(),
        TZ
      ),

    roleGroups:
      OPERATIONAL_ROLE_GROUPS,

    processSlas:
      PROCESS_SLA_MINUTES,

    intelligence: {
      getOperationalWeekMoment,
      buildGoalProgress,
      buildOperationalProjection,
      buildResponseTimeStatistics,
      buildOperationalRoleBreakdown,
    },
  };

  const providerCollection =
    await collectOperationalMetrics(
      providerContext
    );

  /*
   * Garante que as duas métricas gerais mais importantes
   * sempre participem do cálculo.
   *
   * Se o Hub já as coletou, nada será executado novamente.
   * Se não coletou, o NPS consulta diretamente os módulos.
   */
await ensureCoreOperationalMetrics(
  providerCollection,
  providerContext
);

/*
 * Usa a distribuição oficial do Ranking Semanal Geral
 * para calcular o desempenho por hierarquia.
 */
const participationMetric =
  providerCollection.results.find(
    metric =>
      (
        metric.id ||
        metric.providerId
      ) ===
      "participacao_equipe" &&
      metric.available !== false
  ) ||
  null;

const operationalRoleAnalysis =
  await buildOperationalRoleBreakdown({
    client:
      activeClient,

    guildId:
      "1262262852782129183",

    byUser:
      participationMetric
        ?.details
        ?.byUser ||
      {},

    roleGroups:
      OPERATIONAL_ROLE_GROUPS,
  });

providerCollection.operationalRoleAnalysis =
  operationalRoleAnalysis;

/*
 * Salva snapshots separados por módulo e adiciona:
   *
   * • comparação no mesmo momento;
   * • progresso da meta;
   * • previsão;
   * • estatísticas de tempo, quando disponíveis.
   */
  syncProviderMetricSnapshots({
    state,

    currentWeekInfo:
      providerContext.currentWeek,

    previousWeekInfo:
      providerContext.previousWeek,

    providerMetrics:
      providerCollection.results,

    timestamp:
      Date.now(),
  });

  console.log(
    "[NPS Operacional] Resultado da coleta de métricas:",
    {
      metrics:
        providerCollection.results.map(
         metric => ({
  id:
    metric.id ||
    metric.providerId,

  available:
    metric.available,

  score:
    metric.score,

  volume:
    metric.volume,

  current:
    metric.current,

  goal:
    metric.goal,

  paceScore:
    metric.progress
      ?.paceScore ??
      null,

  projectedTotal:
    metric.prediction
      ?.projectedTotal ??
      null,

  sameMomentAvailable:
    metric.sameMomentComparison
      ?.available ??
      false,

  sameMomentPrevious:
    metric.sameMomentComparison
      ?.previous ??
      null,
})
        ),

      errors:
        providerCollection.errors,
    }
  );

  const currentWeekInfo =
    getWeekInfo();

  const previousWeekInfo =
    getPreviousWeekInfo();

  const current =
    calculateWeek(
      state,
      currentWeekInfo,
      config,
      {
        currentWeek: true,
      }
    );

const previous =
  calculateWeek(
    state,
    previousWeekInfo,
    config,
    {
      currentWeek: false,
    }
  );

/*
 * Remove as notas genéricas das categorias que exigem
 * dados reais fornecidos pelos próprios sistemas.
 *
 * Os totais consolidados permanecem guardados em raw,
 * mas não participam do NPS até existir um provedor válido.
 */
for (const category of current.categories) {
  if (
    !PROVIDER_REQUIRED_CATEGORY_IDS.has(
      category.categoryId
    )
  ) {
    continue;
  }

  category.hasData = false;
  category.score = null;

  category.productivityScore = null;
  category.qualityScore = null;
  category.completionScore = null;

  category.raw = {
    ...category.raw,
    awaitingProvider: true,
  };
}

/*
 * A semana anterior também não deve utilizar uma nota
 * genérica para comparar com uma métrica real da semana atual.
 *
 * A comparação será liberada quando o provedor daquele módulo
 * também entregar seu histórico próprio.
 */
for (const category of previous.categories) {
  if (
    !PROVIDER_REQUIRED_CATEGORY_IDS.has(
      category.categoryId
    )
  ) {
    continue;
  }

  category.hasData = false;
  category.score = null;

  category.productivityScore = null;
  category.qualityScore = null;
  category.completionScore = null;

  category.raw = {
    ...category.raw,
    awaitingProvider: true,
  };
}

for (
  const providerMetric of
  providerCollection.results
) {
  if (
    providerMetric.available === false ||
    !Number.isFinite(
      Number(
        providerMetric.score
      )
    )
  ) {
    continue;
  }

  const providerMetricId =
    safeString(
      providerMetric.id ||
      providerMetric.providerId
    );

  const category =
    current.categories.find(
      item =>
        item.categoryId ===
        providerMetricId
    );

  if (!category) {
    continue;
  }

  category.hasData = true;

  category.score =
    clamp(
      Number(
        providerMetric.score
      ),
      0,
      100
    );

  category.raw = {
    ...category.raw,

    events:
      Math.max(
        Number(
          category.raw?.events || 0
        ),
        Number(
          providerMetric.volume || 0
        )
      ),

    awaitingProvider: false,
    providerMetric,
  };
}

// Recalcula as categorias válidas, os pesos,
// o volume e o NPS Geral após aplicar as métricas reais.
recalculateWeekResult(
  current
);

const displayedBase =
  calculateDisplayedCurrentScore(
    current,
    previous
  );

const displayed =
  applyOperationalRealityGate(
    displayedBase,
    current,
    providerCollection.results
  );

const diagnosis =
  buildDiagnosis(
    current,
    previous,
    displayed,
    providerCollection.results
  );

  return {
  config,
  state,
  current,
  previous,
  displayed,
  diagnosis,

  providerMetrics:
    providerCollection.results,

  providerErrors:
    providerCollection.errors,
};
}

// ============================================================================
// ATUALIZAÇÃO DO PAINEL
// ============================================================================

async function findExistingDashboardMessage(
  channel,
  messageId,
  marker
) {
  if (messageId) {
    const existing =
      await channel.messages.fetch(
        messageId
      ).catch(
        () => null
      );

    if (existing) {
      return existing;
    }
  }

  const messages =
    await channel.messages.fetch({
      limit: 50,
    }).catch(
      () => null
    );

  if (!messages) {
    return null;
  }

  return messages.find(
    message =>
      message.author?.id ===
        channel.client.user?.id &&
      message.embeds?.some(
        embed =>
          safeString(
            embed.description
          ).includes(
            marker
          )
      )
  ) || null;
}

async function updateDashboard(
  client,
  reason = "manual"
) {
  if (dashboardUpdating) {
    dashboardNeedsUpdate = true;
    return;
  }

  dashboardUpdating = true;

  try {
    const [
      quickChannel,
      executiveChannel,
    ] = await Promise.all([
      client.channels.fetch(
        NPS_DASHBOARD_CHANNEL_ID
      ).catch(
        () => null
      ),

      client.channels.fetch(
        NPS_EXECUTIVE_CHANNEL_ID
      ).catch(
        () => null
      ),
    ]);

    const results =
      await generateResults();

    const components =
      buildDashboardComponents();

    // ==================================================
    // PAINEL RÁPIDO
    // ==================================================

    if (
      quickChannel &&
      quickChannel.isTextBased()
    ) {
      const quickEmbed =
        buildDashboardEmbed(
          results
        );

      const existingQuick =
        await findExistingDashboardMessage(
          quickChannel,
          results.state.dashboardMessageId,
          NPS_DASH_MARKER
        );

      let quickMessage;

      if (existingQuick) {
        quickMessage =
          await existingQuick.edit({
            embeds: [
              quickEmbed,
            ],
            components,
          });
      } else {
        quickMessage =
          await quickChannel.send({
            embeds: [
              quickEmbed,
            ],
            components,
          });
      }

      results.state.dashboardMessageId =
        quickMessage.id;
    } else {
      console.error(
        `[NPS Operacional] Canal rápido inválido: ${NPS_DASHBOARD_CHANNEL_ID}`
      );
    }

    // ==================================================
    // PAINEL EXECUTIVO
    // ==================================================

    if (
      executiveChannel &&
      executiveChannel.isTextBased()
    ) {
      const executiveEmbeds =
        buildExecutiveDashboardEmbeds(
          results
        );

      const existingExecutive =
        await findExistingDashboardMessage(
          executiveChannel,
          results.state.executiveDashboardMessageId,
          NPS_EXECUTIVE_MARKER
        );

      let executiveMessage;

      if (existingExecutive) {
        executiveMessage =
          await existingExecutive.edit({
            embeds:
              executiveEmbeds,
            components,
          });
      } else {
        executiveMessage =
          await executiveChannel.send({
            embeds:
              executiveEmbeds,
            components,
          });
      }

      results.state.executiveDashboardMessageId =
        executiveMessage.id;

      results.state.metadata.lastExecutiveDashboardUpdateAt =
        Date.now();
    } else {
      console.error(
        `[NPS Operacional] Canal executivo inválido: ${NPS_EXECUTIVE_CHANNEL_ID}`
      );
    }

    results.state.metadata.lastDashboardUpdateAt =
      Date.now();

    results.state.metadata.lastDashboardReason =
      reason;

    results.current.week.snapshots.push({
      at:
        Date.now(),
      score:
        results.displayed.score,
      rawScore:
        results.current.rawScore,
      reason,
    });

    if (
      results.current.week.snapshots.length >
      500
    ) {
      results.current.week.snapshots =
        results.current.week.snapshots.slice(
          -500
        );
    }

    saveState(
      results.state
    );
  } finally {
    dashboardUpdating = false;

    if (dashboardNeedsUpdate) {
      dashboardNeedsUpdate = false;

      setTimeout(
        () => {
          updateDashboard(
            client,
            "queued"
          ).catch(
            error =>
              console.error(
                "[NPS Operacional] Erro na atualização enfileirada:",
                error
              )
          );
        },
        1500
      );
    }
  }
}

// ============================================================================
// RESUMO SEMANAL
// ============================================================================

function buildHumanWeeklyAnalysisText({
  selected,
  comparison,
  displayScore,
  diagnosis,
  providerMetrics = [],
  operationalRoleAnalysis = null,
}) {
  const findMetric =
    metricId =>
      providerMetrics.find(
        metric =>
          String(
            metric?.id ||
            metric?.providerId ||
            ""
          ) === metricId &&
          metric?.available !== false
      ) || null;

  const participationMetric =
    findMetric(
      "participacao_equipe"
    );

  const generalPerformanceMetric =
    findMetric(
      "desempenho_geral"
    );

  const managerMetric =
    findMetric(
      "registro_manager"
    );

const managementMetric =
  findMetric(
    "gestao"
  );

const setStaffMetric =
  findMetric(
    "set_staff"
  );

const setStaffDetails =
  setStaffMetric?.details ||
  {};

const participationDetails =
  participationMetric?.details ||
  {};

  const generalPerformanceDetails =
    generalPerformanceMetric?.details ||
    {};

  const leadership =
    selected?.leadership || {
      entered: 0,
      removed: 0,
      leftServer: 0,
      returned: 0,
      retention: 100,
    };

const memberEntryRecords =
  Array.isArray(
    selected?.week?.members?.entered
  )
    ? selected.week.members.entered
    : [];

const memberExitRecords =
  Array.isArray(
    selected?.week?.members?.left
  )
    ? selected.week.members.left
    : [];

const memberEntries =
  memberEntryRecords.length;

const memberExits =
  memberExitRecords.length;

/*
 * Pessoas que entraram no servidor já possuindo
 * o cargo oficial de líder.
 *
 * Isso é diferente de receber o cargo depois da entrada.
 */
const membersEnteredAsLeader =
  memberEntryRecords.filter(
    item =>
      item?.leader === true
  ).length;

/*
 * Pessoas que saíram do servidor enquanto ainda
 * possuíam o cargo oficial de líder.
 */
const membersExitedAsLeader =
  memberExitRecords.filter(
    item =>
      item?.leader === true
  ).length;

const communityBalance =
  memberEntries -
  memberExits;

const paragraphs = [];

  paragraphs.push(
    "🧠 **Análise inteligente da semana**",
    "",
    "Esta leitura reúne o ritmo geral da operação, a participação da equipe e o desempenho dos sistemas que já entregaram dados confiáveis ao NPS.",
    ""
  );

  // ==========================================================================
  // VISÃO GERAL
  // ==========================================================================

  paragraphs.push(
    "📌 **Visão geral**"
  );

if (
  generalPerformanceMetric
) {
  const currentPoints =
    Number(
      generalPerformanceMetric.current ??
      generalPerformanceDetails.total ??
      0
    );

  const previousPoints =
    Number(
      generalPerformanceMetric.previous ??
      generalPerformanceDetails.previousTotal ??
      0
    );

  const goal =
    Number(
      generalPerformanceMetric.goal ||
      generalPerformanceDetails.goal ||
      500
    );

  const weeklyDifference =
    currentPoints -
    previousPoints;

  const weeklyDifferencePercent =
    previousPoints > 0
      ? (
          weeklyDifference /
          previousPoints
        ) *
        100
      : (
          currentPoints > 0
            ? 100
            : 0
        );

  const expectedNow =
    Number(
      generalPerformanceDetails.expectedPointsNow ??
      generalPerformanceDetails.expectedNow ??
      generalPerformanceMetric.progress
        ?.expectedNow ??
      0
    );

  const projectedTotal =
    Number(
      generalPerformanceMetric.prediction
        ?.projectedTotal ??
      generalPerformanceDetails.projectedTotal ??
      0
    );

  const missingToGoal =
    Math.max(
      0,
      goal -
      currentPoints
    );

  paragraphs.push(
    `A equipe somou **${currentPoints} pontos nesta semana**, dentro da meta geral de **${goal} pontos**. Ainda faltam **${missingToGoal} pontos** para completar a meta.`
  );

  if (
    previousPoints > 0
  ) {
    if (
      weeklyDifference > 0
    ) {
      paragraphs.push(
        `No mesmo comparativo semanal, a semana passada tinha fechado com **${previousPoints} pontos**. O resultado atual está **${weeklyDifference} pontos acima**, uma melhora de **${Math.abs(weeklyDifferencePercent).toFixed(1)}%**.`
      );
    } else if (
      weeklyDifference < 0
    ) {
      paragraphs.push(
        `A semana passada terminou com **${previousPoints} pontos**. O total atual está **${Math.abs(weeklyDifference)} pontos abaixo**, uma diferença de **${Math.abs(weeklyDifferencePercent).toFixed(1)}%**. Essa comparação considera o total geral registrado pelo GeralDash, não apenas uma fonte isolada.`
      );
    } else {
      paragraphs.push(
        `A semana atual está com o mesmo total da semana passada: **${currentPoints} pontos**.`
      );
    }
  }

  if (
    expectedNow > 0
  ) {
    if (
      currentPoints >=
      expectedNow
    ) {
      paragraphs.push(
        `Para este momento da semana, o ritmo esperado era de aproximadamente **${Math.round(expectedNow)} pontos**. A equipe está acompanhando ou superando esse ritmo.`
      );
    } else {
      paragraphs.push(
        `Para este momento da semana, o ritmo esperado era de aproximadamente **${Math.round(expectedNow)} pontos**. O resultado atual está **${Math.round(expectedNow - currentPoints)} pontos atrás desse ritmo**.`
      );
    }
  }

  if (
    projectedTotal > 0
  ) {
    if (
      projectedTotal >=
      goal
    ) {
      paragraphs.push(
        `Se a equipe mantiver o ritmo atual, a projeção aponta para aproximadamente **${Math.round(projectedTotal)} pontos**, o que mantém a meta ao alcance.`
      );
    } else {
      paragraphs.push(
        `Se o ritmo continuar igual, a projeção é fechar a semana com aproximadamente **${Math.round(projectedTotal)} pontos**. Nesse cenário, será necessário aumentar a participação para alcançar os **${goal} pontos**.`
      );
    }
  }
} else {
  paragraphs.push(
    "O GeralDash ainda não entregou uma leitura válida da meta semanal de 500 pontos."
  );
}

  paragraphs.push("");

  // ==========================================================================
  // PARTICIPAÇÃO DA EQUIPE
  // ==========================================================================

  paragraphs.push(
    "👥 **Participação da equipe**"
  );

  if (
    participationMetric
  ) {
    const participants =
      Number(
        participationDetails.participants ||
        0
      );

    const reachedMinimum =
      Number(
        participationDetails.reachedMinimum ||
        0
      );

    const belowMinimum =
      Number(
        participationDetails.belowMinimum ||
        0
      );

    const minimumPerUser =
      Number(
        participationDetails.minimumPerUser ||
        participationMetric.goal ||
        25
      );

    const averagePoints =
      Number(
        participationDetails.averagePoints ||
        0
      );

    paragraphs.push(
      `Foram encontrados **${participants} participantes** no Ranking Semanal Geral.`,
      `Até agora, **${reachedMinimum} atingiram o mínimo de ${minimumPerUser} pontos** e **${belowMinimum} ainda estão abaixo da meta individual**.`,
      `A média atual é de **${averagePoints.toFixed(1)} pontos por participante**.`
    );

    if (
      participants > 0
    ) {
      const hitRate =
        (
          reachedMinimum /
          participants
        ) *
        100;

      if (
        hitRate >= 70
      ) {
        paragraphs.push(
          `A distribuição do trabalho está saudável, pois **${hitRate.toFixed(1)}% da equipe** já alcançou o mínimo semanal.`
        );
      } else if (
        hitRate >= 40
      ) {
        paragraphs.push(
          `A participação está em desenvolvimento, mas ainda existe uma parte importante da equipe abaixo do mínimo.`
        );
      } else {
        paragraphs.push(
          `O principal ponto de atenção é a distribuição do trabalho: apenas **${hitRate.toFixed(1)}% da equipe** atingiu o mínimo semanal.`
        );
      }
    }
  } else {
    paragraphs.push(
      "Ainda não existem dados suficientes do Ranking Geral para avaliar a participação da equipe."
    );
  }

paragraphs.push("");

// ==========================================================================
// DESEMPENHO POR HIERARQUIA
// ==========================================================================

paragraphs.push(
  "🏅 **Desempenho por equipe**"
);

if (
  operationalRoleAnalysis &&
  Number(
    operationalRoleAnalysis.totalRecords ||
    0
  ) > 0
) {
  const roleGroups = [
    operationalRoleAnalysis.responsaveis,
    operationalRoleAnalysis.coordenacao,
    operationalRoleAnalysis.equipe_creator,
  ].filter(Boolean);

  for (
    const group of
    roleGroups
  ) {
    const strongestSources =
      Object.entries(
        group.sources ||
        {}
      )
        .sort(
          (
            first,
            second
          ) =>
            second[1] -
            first[1]
        )
        .slice(
          0,
          3
        );

    const sourceText =
      strongestSources.length
        ? strongestSources
            .map(
              (
                [
                  sourceName,
                  amount,
                ]
              ) =>
                `${sourceName}: ${amount}`
            )
            .join(", ")
        : "nenhuma fonte com atividade";

    paragraphs.push(
      `• **${group.label}:** ${group.records} atividade(s), representando **${group.percentage.toFixed(1)}% do trabalho registrado**. Participaram ${group.activeMembers} pessoa(s). Principais fontes: ${sourceText}.`
    );
  }

  const sortedGroups =
    roleGroups
      .slice()
      .sort(
        (
          first,
          second
        ) =>
          second.records -
          first.records
      );

  const highestGroup =
    sortedGroups[0];

  const lowestGroup =
    sortedGroups[
      sortedGroups.length -
      1
    ];

  if (
    highestGroup &&
    highestGroup.records > 0
  ) {
    paragraphs.push(
      `Nesta semana, **${highestGroup.label}** é o grupo com maior participação, concentrando **${highestGroup.percentage.toFixed(1)}% das atividades**.`
    );
  }

  if (
    lowestGroup &&
    highestGroup &&
    highestGroup.records >
      lowestGroup.records * 2
  ) {
    paragraphs.push(
      `A diferença entre **${highestGroup.label}** e **${lowestGroup.label}** está alta. Vale dividir melhor algumas tarefas para que o trabalho não fique preso em apenas uma parte da equipe.`
    );
  }

  const topUser =
    operationalRoleAnalysis
      .topUsers?.[0] ||
    null;

  if (topUser) {
    paragraphs.push(
      `A pessoa com maior volume realizou **${topUser.amount} atividades**, equivalente a **${operationalRoleAnalysis.concentration.topUserPercentage.toFixed(1)}% de tudo o que foi registrado**.`
    );
  }

  if (
    operationalRoleAnalysis
      .concentration
      ?.overloaded
  ) {
    paragraphs.push(
      "Foi percebido que uma parte grande do trabalho está concentrada em poucas pessoas. Isso não significa que alguém esteja fazendo algo errado, mas pode causar cansaço e deixar a operação dependente sempre dos mesmos membros."
    );
  }
} else {
  paragraphs.push(
    "Ainda não foi possível separar as atividades entre Responsáveis, Gestão e Equipe Creators."
  );
}

paragraphs.push("");

// ==========================================================================
// PONTOS CRÍTICOS
// ==========================================================================

paragraphs.push(
  "🚨 **Pontos críticos**"
);

const criticalPoints = [];

if (
  operationalRoleAnalysis
    ?.concentration
    ?.overloaded
) {
  criticalPoints.push(
    `O trabalho está concentrado em poucas pessoas. Os três membros com maior volume reúnem **${operationalRoleAnalysis.concentration.topThreePercentage.toFixed(1)}% das atividades da semana**.`
  );
}

if (
  Array.isArray(
    operationalRoleAnalysis
      ?.conflicts
  ) &&
  operationalRoleAnalysis
    .conflicts
    .length > 0
) {
  criticalPoints.push(
    `Foram encontrados **${operationalRoleAnalysis.conflicts.length} membro(s)** com cargo de Responsável junto com Gestão ou Equipe Creators. Como Responsáveis já representam o nível mais alto desta análise, essa mistura pode indicar desorganização na setagem dos cargos.`
  );
}

const participationParticipants =
  Number(
    participationDetails.participants ||
    0
  );

const participationReached =
  Number(
    participationDetails.reachedMinimum ||
    0
  );

if (
  participationParticipants > 0 &&
  participationReached /
    participationParticipants <
    0.4
) {
  criticalPoints.push(
    `Somente **${participationReached} de ${participationParticipants} participantes** atingiram o mínimo individual. Isso mostra que o resultado ainda depende de uma parte pequena da equipe.`
  );
}

const setStaffPending =
  Number(
    setStaffDetails.pending ||
    0
  );

const setStaffAverageMinutes =
  Number(
    setStaffDetails.averageResponseMinutes ||
    0
  );

if (
  setStaffPending > 0
) {
  criticalPoints.push(
    `Existem **${setStaffPending} pedido(s) de Set Staff pendentes**, aguardando análise dos responsáveis.`
  );
}

if (
  setStaffAverageMinutes > 240
) {
  criticalPoints.push(
    `Os pedidos de Set Staff estão levando, em média, **${(setStaffAverageMinutes / 60).toFixed(1)} hora(s)** para receber uma decisão. A referência atual é de quatro horas.`
  );
}

if (
  criticalPoints.length
) {
  for (
    const point of
    criticalPoints
  ) {
    paragraphs.push(
      `• ${point}`
    );
  }
} else {
  paragraphs.push(
    "• Nenhum problema grave foi encontrado nos dados disponíveis até agora."
  );
}

paragraphs.push("");

// ==========================================================================
// FONTES DA SEMANA
// ==========================================================================

paragraphs.push(
  "📦 **Atividades registradas nesta semana**"
);

  const sortedSources =
    Array.isArray(
      participationDetails.sortedSources
    )
      ? participationDetails.sortedSources
      : [];

  if (
    sortedSources.length
  ) {
    for (
      const source of
      sortedSources
    ) {
      paragraphs.push(
        `• **${source.label}:** ${Number(source.amount || 0)} registro(s)`
      );
    }
  } else {
    paragraphs.push(
      "Ainda não foi possível separar os registros por fonte."
    );
  }

  paragraphs.push("");

  // ==========================================================================
  // REGISTRO MANAGER
  // ==========================================================================

  if (
    managerMetric
  ) {
    const details =
      managerMetric.details ||
      {};

    paragraphs.push(
      "🗂️ **Registro Manager**",
      `Foram concluídos **${Number(managerMetric.current || 0)} de ${Number(managerMetric.goal || 0)} registros esperados**.`,
      `A nota atual do setor é **${Number(managerMetric.score || 0).toFixed(1)}%**.`
    );

    if (
      Number.isFinite(
        Number(
          details.approvalRate
        )
      )
    ) {
      paragraphs.push(
        `A taxa de aprovação está em **${Number(details.approvalRate).toFixed(1)}%**.`
      );
    }

    if (
      Number.isFinite(
        Number(
          details.approved
        )
      )
    ) {
      paragraphs.push(
        `Registros aprovados: **${Number(details.approved)}**.`
      );
    }

    if (
      Number.isFinite(
        Number(
          details.rejected
        )
      )
    ) {
      paragraphs.push(
        `Registros reprovados: **${Number(details.rejected)}**.`
      );
    }

    paragraphs.push("");
  }

  // ==========================================================================
  // GESTÃO
  // ==========================================================================

  if (
    managementMetric
  ) {
    const details =
      managementMetric.details ||
      {};

    paragraphs.push(
      "👔 **Gestão e recrutamento**",
      `A nota atual da Gestão é **${Number(managementMetric.score || 0).toFixed(1)}%**.`
    );

    if (
      Number.isFinite(
        Number(
          details.active
        )
      ) &&
      Number.isFinite(
        Number(
          details.total
        )
      )
    ) {
      paragraphs.push(
        `Existem **${Number(details.active)} controles ativos de ${Number(details.total)} cadastrados**.`
      );
    }

    if (
      Number.isFinite(
        Number(
          details.paused
        )
      )
    ) {
      paragraphs.push(
        `Controles pausados atualmente: **${Number(details.paused)}**.`
      );
    }

    paragraphs.push("");
  }

  // ==========================================================================
  // SET STAFF
  // ==========================================================================

  paragraphs.push(
    "🛠️ **Pedidos de Set Staff**"
  );

  if (
    setStaffMetric
  ) {
    const requested =
      Number(
        setStaffDetails.requested ||
        0
      );

    const approved =
      Number(
        setStaffDetails.approved ||
        0
      );

    const rejected =
      Number(
        setStaffDetails.rejected ||
        0
      );

    const pending =
      Number(
        setStaffDetails.pending ||
        0
      );

    const responsibleCount =
      Number(
        setStaffDetails.responsibleCount ||
        0
      );

    const averageMinutes =
      Number(
        setStaffDetails.averageResponseMinutes ||
        0
      );

    paragraphs.push(
      `Nesta semana foram recebidos **${requested} pedido(s) de Set Staff**. Até o momento, **${approved} foram aprovados**, **${rejected} foram reprovados** e **${pending} continuam aguardando análise**.`
    );

    if (
      responsibleCount > 0
    ) {
      paragraphs.push(
        `As decisões foram realizadas por **${responsibleCount} responsável(is) diferente(s)**, permitindo acompanhar se a análise está distribuída ou concentrada em poucas pessoas.`
      );
    } else if (
      pending > 0
    ) {
      paragraphs.push(
        "Ainda não existe uma decisão registrada por responsável nesta semana, embora existam pedidos aguardando análise."
      );
    }

    if (
      averageMinutes > 0
    ) {
      const averageHours =
        averageMinutes /
        60;

      paragraphs.push(
        `O tempo médio entre o envio e a decisão está em aproximadamente **${averageHours.toFixed(1)} hora(s)**.`
      );

      if (
        averageMinutes <= 240
      ) {
        paragraphs.push(
          "Esse tempo está dentro da referência operacional de quatro horas e indica que os pedidos estão sendo acompanhados com boa agilidade."
        );
      } else {
        paragraphs.push(
          "Esse tempo está acima da referência operacional de quatro horas e pode indicar acúmulo de pedidos ou distribuição insuficiente entre os responsáveis."
        );
      }
    } else if (
      requested > 0
    ) {
      paragraphs.push(
        "Ainda não existem decisões novas com horário completo suficiente para calcular o tempo médio de análise."
      );
    }
  } else {
    paragraphs.push(
      "Ainda não existem dados suficientes do Set Staff para avaliar pedidos, decisões e tempo de resposta."
    );
  }

  paragraphs.push("");

  // ==========================================================================
  // PONTOS POSITIVOS
  // ==========================================================================

  paragraphs.push(
    "🟢 **Principais pontos positivos**"
  );

  if (
    Array.isArray(
      diagnosis?.positives
    ) &&
    diagnosis.positives.length
  ) {
    for (
      const positive of
      diagnosis.positives
    ) {
      paragraphs.push(
        `• ${positive}`
      );
    }
  } else {
    paragraphs.push(
      "• Ainda não existe um destaque positivo forte o suficiente para ser confirmado."
    );
  }

  paragraphs.push("");

  // ==========================================================================
  // PONTOS DE ATENÇÃO
  // ==========================================================================

  paragraphs.push(
    "🟠 **O que precisa de atenção**"
  );

  if (
    Array.isArray(
      diagnosis?.attentions
    ) &&
    diagnosis.attentions.length
  ) {
    for (
      const attention of
      diagnosis.attentions
    ) {
      paragraphs.push(
        `• ${attention}`
      );
    }
  } else {
    paragraphs.push(
      "• Nenhum problema urgente foi identificado até o momento."
    );
  }

  paragraphs.push("");

  // ==========================================================================
  // RECOMENDAÇÕES
  // ==========================================================================

  paragraphs.push(
    "🎯 **Ações recomendadas**"
  );

  if (
    Array.isArray(
      diagnosis?.recommendations
    ) &&
    diagnosis.recommendations.length
  ) {
    for (
      const recommendation of
      diagnosis.recommendations
    ) {
      paragraphs.push(
        `• ${recommendation}`
      );
    }
  } else {
    paragraphs.push(
      "• Manter o acompanhamento atual até o encerramento da semana."
    );
  }

  paragraphs.push("");

// ==========================================================================
// LIDERANÇA
// ==========================================================================

paragraphs.push(
  "👑 **Movimento da liderança**",
  `• Pessoas que receberam o cargo de líder nesta semana: **${Number(leadership.entered || 0)}**`,
  `• Pessoas que perderam o cargo de líder nesta semana: **${Number(leadership.removed || 0)}**`,
  `• Líderes que saíram do servidor ainda com o cargo: **${Number(leadership.leftServer || 0)}**`,
  `• Pessoas que retornaram ao servidor já com o cargo de líder: **${Number(leadership.returned || 0)}**`,
  `• Retenção estimada da liderança: **${Number(leadership.retention || 0).toFixed(1)}%**`,
  ""
);

// ==========================================================================
// COMUNIDADE
// ==========================================================================

paragraphs.push(
  "🏙️ **Movimento geral da comunidade**",
  `• Novos membros que entraram no servidor: **${memberEntries}**`,
  `• Membros que saíram do servidor: **${memberExits}**`,
  `• Saldo de membros na semana: **${communityBalance >= 0 ? "+" : ""}${communityBalance}**`,
  `• Membros que entraram já com o cargo de líder: **${membersEnteredAsLeader}**`,
  `• Membros que saíram ainda com o cargo de líder: **${membersExitedAsLeader}**`
);

if (
  memberEntries > 0 ||
  memberExits > 0
) {
  if (
    communityBalance > 0
  ) {
    paragraphs.push(
      "",
      `A comunidade apresenta saldo positivo de **${communityBalance} membro(s)** nesta semana, pois as entradas superaram as saídas.`
    );
  } else if (
    communityBalance < 0
  ) {
    paragraphs.push(
      "",
      `A comunidade apresenta saldo negativo de **${Math.abs(communityBalance)} membro(s)** nesta semana, pois as saídas superaram as entradas.`
    );
  } else {
    paragraphs.push(
      "",
      "A quantidade de entradas e saídas está equilibrada nesta semana."
    );
  }
}

if (
  memberEntries === 0 &&
  memberExits === 0
) {
  paragraphs.push(
    "",
    "Ainda não existem movimentações gerais suficientes registradas pelo NPS para comparar entradas e saídas com segurança."
  );
}

  paragraphs.push(
    "",
    `📊 **Leitura final:** ${Number(displayScore || 0).toFixed(1)}%`,
    diagnosis?.trend ||
      "A tendência ainda não pôde ser determinada com segurança.",
    "",
    "*Esta análise é atualizada automaticamente conforme novos registros chegam aos sistemas.*"
  );

  return paragraphs
    .join("\n")
    .trim();
}

function splitDiscordText(
  text,
  maximumLength = 1900
) {
  const normalizedText =
    String(
      text || ""
    ).trim();

  if (
    !normalizedText
  ) {
    return [];
  }

  const lines =
    normalizedText.split(
      "\n"
    );

  const chunks = [];
  let currentChunk = "";

  for (
    const line of
    lines
  ) {
    const candidate =
      currentChunk
        ? `${currentChunk}\n${line}`
        : line;

    if (
      candidate.length <=
      maximumLength
    ) {
      currentChunk =
        candidate;

      continue;
    }

    if (
      currentChunk
    ) {
      chunks.push(
        currentChunk
      );
    }

    if (
      line.length <=
      maximumLength
    ) {
      currentChunk =
        line;

      continue;
    }

    let remainingLine =
      line;

    while (
      remainingLine.length >
      maximumLength
    ) {
      chunks.push(
        remainingLine.slice(
          0,
          maximumLength
        )
      );

      remainingLine =
        remainingLine.slice(
          maximumLength
        );
    }

    currentChunk =
      remainingLine;
  }

  if (
    currentChunk
  ) {
    chunks.push(
      currentChunk
    );
  }

  return chunks;
}

function buildWeeklySummaryEmbeds({
  selected,
  comparison,
  displayScore,
  diagnosis,
  config,
  titleSuffix,
}) {
  const classification =
    getClassification(
      displayScore,
      config
    );

  const comparisonDifference =
    displayScore -
    comparison.rawScore;

  const comparisonArrow =
    comparisonDifference > 1
      ? "⬆️"
      : comparisonDifference < -1
        ? "⬇️"
        : "➡️";

  const improvedLines =
    diagnosis.improved.length
      ? diagnosis.improved
          .slice(0, 5)
          .map(
            item =>
              `• **${item.label}:** ${formatSigned(item.difference)} pontos`
          )
          .join("\n")
      : "Nenhum crescimento comparável identificado.";

  const worsenedLines =
    diagnosis.worsened.length
      ? diagnosis.worsened
          .slice(0, 5)
          .map(
            item =>
              `• **${item.label}:** ${formatSigned(item.difference)} pontos`
          )
          .join("\n")
      : "Nenhuma queda comparável identificada.";

  const positiveLines =
    diagnosis.positives
      .map(
        item =>
          `• ${item}`
      )
      .join("\n");

  const attentionLines =
    diagnosis.attentions
      .map(
        item =>
          `• ${item}`
      )
      .join("\n");

  const recommendationLines =
    diagnosis.recommendations
      .map(
        item =>
          `• ${item}`
      )
      .join("\n");

  const categoryLines =
    selected.categories
      .filter(
        category =>
          category.hasData
      )
      .sort(
        (a, b) =>
          b.score -
          a.score
      )
      .map(
        category => {
          const categoryClassification =
            getClassification(
              category.score,
              config
            );

          return (
            `${categoryClassification.emoji} ` +
            `**${category.label}:** ` +
            `${category.score.toFixed(1)}%`
          );
        }
      )
      .join("\n") ||
    "Nenhuma categoria possui dados suficientes.";

  const leadership =
    selected.leadership;

  const mainEmbed =
    new EmbedBuilder()
      .setColor(
        displayScore >= 80
          ? 0x57f287
          : displayScore >= 60
            ? 0xf1c40f
            : 0xed4245
      )
      .setTitle(
        `📊 Resumo NPS Operacional — ${titleSuffix}`
      )
      .setDescription(
        [
          `## ${classification.emoji} ${displayScore.toFixed(1)}% — ${classification.label}`,
          "",
          `📅 **Período:** ${selected.weekInfo.label}`,
          `${comparisonArrow} **Comparação:** ${formatSigned(comparisonDifference)} pontos`,
          `📦 **Eventos analisados:** ${selected.totalEvents}`,
          `📋 **Categorias com dados:** ${selected.validCategories.length}`,
          "",
          `📈 **Tendência:** ${diagnosis.trend}`,
        ].join("\n")
      )
      .addFields(
        {
          name:
            "📋 Resultado por categoria",
          value:
            truncate(
              categoryLines,
              1024
            ),
          inline:
            false,
        },
        {
          name:
            "⬆️ Setores que melhoraram",
          value:
            truncate(
              improvedLines,
              1024
            ),
          inline:
            false,
        },
        {
          name:
            "⬇️ Setores que pioraram",
          value:
            truncate(
              worsenedLines,
              1024
            ),
          inline:
            false,
        }
      )
      .setFooter({
        text:
          "SantaCreators • Inteligência Operacional",
      })
      .setTimestamp();

  const analysisEmbed =
    new EmbedBuilder()
      .setColor(
        0x5865f2
      )
      .setTitle(
        "🧠 Análise inteligente da semana"
      )
      .addFields(
        {
          name:
            "🟢 Principais pontos positivos",
          value:
            truncate(
              positiveLines,
              1024
            ),
          inline:
            false,
        },
        {
          name:
            "🔴 Principais pontos de atenção",
          value:
            truncate(
              attentionLines,
              1024
            ),
          inline:
            false,
        },
        {
          name:
            "🎯 Ações recomendadas",
          value:
            truncate(
              recommendationLines,
              1024
            ),
          inline:
            false,
        },
        {
          name:
            "👑 Crescimento e retenção da liderança",
          value: [
            `**Entradas:** ${leadership.entered}`,
            `**Remoções de cargo:** ${leadership.removed}`,
            `**Saídas do servidor:** ${leadership.leftServer}`,
            `**Retornos:** ${leadership.returned}`,
            `**Retenção estimada:** ${leadership.retention.toFixed(1)}%`,
          ].join("\n"),
          inline:
            false,
        }
      )
      .setTimestamp();

  return [
    mainEmbed,
  ];
}

async function generateCurrentSummary() {
  const results =
    await generateResults();

  return {
    ...results,

    embeds:
      buildWeeklySummaryEmbeds({
        selected:
          results.current,

        comparison:
          results.previous,

        displayScore:
          results.displayed.score,

        diagnosis:
          results.diagnosis,

        config:
          results.config,

        titleSuffix:
          "Semana Atual",
      }),
analysisText:
  buildHumanWeeklyAnalysisText({
    selected:
      results.current,

    comparison:
      results.previous,

    displayScore:
      results.displayed.score,

    diagnosis:
      results.diagnosis,

    providerMetrics:
      results.providerCollection
        ?.results ||
      [],

    operationalRoleAnalysis:
      results.providerCollection
        ?.operationalRoleAnalysis ||
      null,
  }),
  };
}

function generatePreviousSummary() {
  const config =
    loadConfig();

  const state =
    loadState();

  const previousInfo =
    getPreviousWeekInfo();

  const beforePreviousInfo =
    getPreviousWeekInfo(
      previousInfo.start
    );

  const selected =
    calculateWeek(
      state,
      previousInfo,
      config,
      {
        currentWeek: false,
      }
    );

  const comparison =
    calculateWeek(
      state,
      beforePreviousInfo,
      config,
      {
        currentWeek: false,
      }
    );

  const display = {
    score:
      selected.rawScore,
    currentWeight: 1,
    historicalWeight: 0,
  };

  const diagnosis =
    buildDiagnosis(
      selected,
      comparison,
      display
    );

  return {
    config,
    state,
    selected,
    comparison,
    display,
    diagnosis,

    embeds:
      buildWeeklySummaryEmbeds({
        selected,
        comparison,
        displayScore:
          selected.rawScore,
        diagnosis,
        config,
        titleSuffix:
          "Semana Anterior",
      }),
  };
}

// ============================================================================
// ENVIO AUTOMÁTICO
// ============================================================================

async function sendAutomaticWeeklyReport(
  client
) {
  const currentWeek =
    getWeekInfo();

  const state =
    loadState();

  if (
    state.metadata.lastAutomaticReportWeek ===
    currentWeek.key
  ) {
    return;
  }

  const channel =
    await client.channels.fetch(
      NPS_WEEKLY_REPORT_CHANNEL_ID
    ).catch(
      () => null
    );

  if (
    !channel ||
    !channel.isTextBased()
  ) {
    console.error(
      `[NPS Operacional] Canal do resumo semanal inválido: ${NPS_WEEKLY_REPORT_CHANNEL_ID}`
    );

    return;
  }

  const summary =
    await generateCurrentSummary();

  await channel.send({
    content:
      "📊 **Fechamento semanal automático do NPS Operacional da SantaCreators**",
    embeds:
      summary.embeds,
  });

  state.metadata.lastAutomaticReportWeek =
    currentWeek.key;

  const currentStoredWeek =
    ensureWeek(
      state,
      currentWeek
    );

  currentStoredWeek.closedAt =
    Date.now();

  currentStoredWeek.finalScore =
    summary.displayed.score;

  saveState(state);

  await updateDashboard(
    client,
    "automatic_weekly_report"
  );
}

// ============================================================================
// INTERAÇÕES
// ============================================================================

async function sendSummaryToUser(
  interaction,
  type
) {
  const summary =
    type === "previous"
      ? generatePreviousSummary()
      : await generateCurrentSummary();

  try {
    /*
     * Primeiro envia apenas o resumo principal como embed.
     */
    await interaction.user.send({
      content:
        type === "previous"
          ? "📅 **Resumo do NPS Operacional da semana anterior**"
          : "📊 **Resumo parcial do NPS Operacional da semana atual**",

      embeds:
        summary.embeds,
    });

    /*
     * Na semana atual, envia a análise completa abaixo
     * como texto normal, dividida em mensagens seguras
     * para o limite do Discord.
     */
    if (
      type !== "previous" &&
      summary.analysisText
    ) {
      const textChunks =
        splitDiscordText(
          summary.analysisText
        );

      for (
        const textChunk of
        textChunks
      ) {
        await interaction.user.send({
          content:
            textChunk,
        });
      }
    }

    await interaction.editReply({
      content:
        "✅ O resumo e a análise completa foram enviados para o seu privado.",
    });
  } catch (error) {
    const code =
      error?.code ||
      error?.rawError?.code ||
      null;

    await interaction.editReply({
      content:
        code === 50007
          ? "⚠️ O Discord bloqueou o envio no seu privado. Ative as mensagens diretas deste servidor e tente novamente."
          : `❌ Não consegui enviar o resumo no seu privado.\nErro: \`${truncate(error?.message || error, 500)}\``,
    });
  }
}

export async function npsOperacionalHandleInteraction(
  interaction,
  client
) {
  if (
    !interaction?.isButton?.()
  ) {
    return false;
  }

  const customId =
    interaction.customId;

  const isNpsButton = [
    BUTTON_REFRESH_ID,
    BUTTON_CURRENT_DM_ID,
    BUTTON_PREVIOUS_DM_ID,
    BUTTON_EXECUTIVE_DM_ID,
  ].includes(customId);

  if (!isNpsButton) {
    return false;
  }

  if (
    !hasManagePermission(
      interaction
    )
  ) {
    await interaction.reply({
      content:
        "🚫 Você não possui permissão para utilizar os controles do NPS Operacional.",
      flags:
        MessageFlags.Ephemeral,
    });

    return true;
  }

  await interaction.deferReply({
    flags:
      MessageFlags.Ephemeral,
  });

  if (
    customId ===
    BUTTON_REFRESH_ID
  ) {
    try {
      await updateDashboard(
        client,
        `button:${interaction.user.id}`
      );

      await interaction.editReply({
        content:
          "✅ Painel do NPS Operacional atualizado com sucesso.",
      });
    } catch (error) {
      await interaction.editReply({
        content:
          `❌ Não foi possível atualizar o painel.\nErro: \`${truncate(error?.message || error, 500)}\``,
      });
    }

    return true;
  }

  if (
    customId ===
    BUTTON_CURRENT_DM_ID
  ) {
    await sendSummaryToUser(
      interaction,
      "current"
    );

    return true;
  }

  if (
    customId ===
    BUTTON_PREVIOUS_DM_ID
  ) {
    await sendSummaryToUser(
      interaction,
      "previous"
    );

    return true;
  }

  if (
    customId ===
    BUTTON_EXECUTIVE_DM_ID
  ) {
    try {
      const results =
        await generateResults();

      const executiveEmbeds =
        buildExecutiveDashboardEmbeds(
          results
        );

      await interaction.user.send({
        content:
          "🧠 **Relatório completo da saúde operacional da SantaCreators**",
        embeds:
          executiveEmbeds,
      });

      await interaction.editReply({
        content:
          "✅ O relatório completo foi enviado para o seu privado.",
      });
    } catch (error) {
      const code =
        error?.code ||
        error?.rawError?.code ||
        null;

      await interaction.editReply({
        content:
          code === 50007
            ? "⚠️ O Discord bloqueou o envio no seu privado. Ative as mensagens diretas deste servidor e tente novamente."
            : `❌ Não consegui enviar o relatório completo.\nErro: \`${truncate(error?.message || error, 500)}\``,
      });
    }

    return true;
  }

  return false;
}

// ============================================================================
// INICIALIZAÇÃO
// ============================================================================

export async function npsOperacionalOnReady(
  client
) {
  if (
    client.__SC_NPS_OPERACIONAL_READY__
  ) {
    return;
  }

  client.__SC_NPS_OPERACIONAL_READY__ =
    true;

  activeClient = client;

  ensureDataDir();

  loadConfig();

  /*
   * Mostra exatamente quais sistemas possuem provedor
   * registrado e podem alimentar o NPS.
   */
  logRegisteredNpsOperationalProviders();

  const state =
    loadState();

  ensureWeek(
    state,
    getWeekInfo()
  );

  ensureWeek(
    state,
    getPreviousWeekInfo()
  );

  // Importa imediatamente os dados que já estavam
  // registrados nos sistemas antes da instalação do NPS.
  syncConsolidatedWeeklySources(
    state
  );

  saveState(state);

  // Escuta todos os eventos emitidos pelo dashHub.
  dashOnAny(
    (
      eventName,
      payload
    ) => {
      try {
        registerDashEvent(
          activeClient,
          eventName,
          payload || {}
        );
      } catch (error) {
        console.error(
          `[NPS Operacional] Erro ao processar evento ${eventName}:`,
          error
        );
      }
    }
  );

  // Atualização de segurança do painel a cada 10 minutos.
  // O painel também atualiza após acontecimentos recebidos pelo dashHub.
  cron.schedule(
    "*/10 * * * *",
    () => {
      updateDashboard(
        client,
        "scheduled_refresh"
      ).catch(
        error =>
          console.error(
            "[NPS Operacional] Erro na atualização agendada:",
            error
          )
      );
    },
    {
      timezone:
        TZ,
    }
  );

  // Resumo automático todo sábado às 23:40.
  cron.schedule(
    "40 23 * * 6",
    () => {
      sendAutomaticWeeklyReport(
        client
      ).catch(
        error =>
          console.error(
            "[NPS Operacional] Erro no relatório semanal:",
            error
          )
      );
    },
    {
      timezone:
        TZ,
    }
  );

  await updateDashboard(
    client,
    "ready"
  );

  console.log(
    "[NPS Operacional] Sistema iniciado com sucesso."
  );
}

// ============================================================================
// EXPORTS AUXILIARES
// ============================================================================

export {
  updateDashboard as npsOperacionalUpdateDashboard,
  sendAutomaticWeeklyReport as npsOperacionalSendWeeklyReport,
};