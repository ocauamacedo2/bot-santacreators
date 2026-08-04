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

// ============================================================================
// CONFIGURAÇÃO PRINCIPAL
// ============================================================================

const TZ = "America/Sao_Paulo";

const NPS_DASHBOARD_CHANNEL_ID = "1534295811117154404";
const NPS_WEEKLY_REPORT_CHANNEL_ID = "1387864036259004436";

const ROLE_LIDER_ID = "1353858422063239310";
const ROLE_CIDADAO_ID = "1262978759922028575";

const NPS_DASH_MARKER = "SC_NPS_OPERACIONAL::V1";

const BUTTON_REFRESH_ID = "sc_nps_operacional_refresh";
const BUTTON_CURRENT_DM_ID = "sc_nps_operacional_current_dm";
const BUTTON_PREVIOUS_DM_ID = "sc_nps_operacional_previous_dm";

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
      weight: 8,
      enabled: true,
      weeklyGoal: 20,
    },

    presencas: {
      label: "Presenças",
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

  return {
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
}

// ============================================================================
// ESTADO
// ============================================================================

function createEmptyState() {
  return {
    version: 1,

    dashboardMessageId: null,

    weeks: {},

    pendingOperations: {},

    metadata: {
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastDashboardUpdateAt: null,
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

      snapshots: [],

      closedAt: null,
      finalScore: null,
    };
  }

  // Compatibilidade com estados criados antes desta atualização.
  state.weeks[weekInfo.key].events ||= [];
  state.weeks[weekInfo.key].categories ||= {};
  state.weeks[weekInfo.key].consolidatedSources ||= {};

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
  displayed
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

  const previousClassification =
    getClassification(
      previous.rawScore,
      config
    );

  const arrow =
    diagnosis.generalDifference > 1
      ? "⬆️"
      : (
          diagnosis.generalDifference < -1
            ? "⬇️"
            : "➡️"
        );

  const categoryLines =
    current.categories
      .filter(
        category =>
          config.categories[
            category.categoryId
          ]?.enabled !== false
      )
      .sort(
        (a, b) => {
          if (
            a.score == null &&
            b.score == null
          ) {
            return 0;
          }

          if (a.score == null) {
            return 1;
          }

          if (b.score == null) {
            return -1;
          }

          return b.score - a.score;
        }
      )
      .map(
        category => {
          if (!category.hasData) {
            return (
              `⚪ **${category.label}**\n` +
              "└ Amostra insuficiente"
            );
          }

          const categoryClassification =
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

          const difference =
            previousCategory?.hasData
              ? category.score -
                previousCategory.score
              : null;

          const changeText =
            difference == null
              ? "sem comparativo"
              : `${formatSigned(difference)} pts`;

          return (
            `${categoryClassification.emoji} **${category.label}** — ` +
            `**${category.score.toFixed(1)}%**\n` +
            `└ ${changeText} • ` +
            `${category.raw.events} eventos`
          );
        }
      );

  const topPositive =
    diagnosis.strongest[0];

  const topAttention =
    diagnosis.weakest[0];

  const currentTimestamp =
    Math.floor(
      Date.now() / 1000
    );

  const description = [
    `\`${NPS_DASH_MARKER}\``,
    "",
    `## ${classification.emoji} ${score.toFixed(1)}% — ${classification.label}`,
    `\`${progressBar(score)}\``,
    "",
    `📅 **Semana:** ${current.weekInfo.label}`,
    `${arrow} **Comparação:** ${formatSigned(diagnosis.generalDifference)} pontos`,
    `📊 **Semana anterior:** ${previous.rawScore.toFixed(1)}% — ${previousClassification.label}`,
    `🧠 **Peso atual:** ${(displayed.currentWeight * 100).toFixed(0)}% dados desta semana`,
    "",
    `📈 **Tendência:** ${diagnosis.trend}`,
    "",
    `🏆 **Destaque:** ${
      topPositive
        ? `${topPositive.label} — ${topPositive.score.toFixed(1)}%`
        : "Aguardando dados"
    }`,
    `⚠️ **Maior atenção:** ${
      topAttention
        ? `${topAttention.label} — ${topAttention.score.toFixed(1)}%`
        : "Aguardando dados"
    }`,
  ].join("\n");

  const firstCategoryBlock =
    categoryLines
      .slice(0, 8)
      .join("\n\n") ||
    "Nenhuma categoria possui dados suficientes.";

  const secondCategoryBlock =
    categoryLines
      .slice(8)
      .join("\n\n") ||
    "—";

  const responseCategory =
    current.categories.find(
      category =>
        category.categoryId ===
        "tempo_resposta"
    );

  const responseText =
    responseCategory?.response
      ? [
          `**Média:** ${formatDuration(responseCategory.response.average)}`,
          `**Mediana:** ${formatDuration(responseCategory.response.median)}`,
          `**P90:** ${formatDuration(responseCategory.response.p90)}`,
          `**Mínimo:** ${formatDuration(responseCategory.response.minimum)}`,
          `**Máximo:** ${formatDuration(responseCategory.response.maximum)}`,
          `**Amostras:** ${responseCategory.response.samples}`,
        ].join("\n")
      : "Ainda não existem pares suficientes entre criação e conclusão para calcular os tempos.";

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
    .setTitle(
      "📊 NPS Operacional — SantaCreators"
    )
    .setDescription(
      description
    )
    .addFields(
      {
        name:
          "📋 Categorias — Parte 1",
        value:
          truncate(
            firstCategoryBlock,
            1024
          ),
        inline:
          false,
      },
      {
        name:
          "📋 Categorias — Parte 2",
        value:
          truncate(
            secondCategoryBlock,
            1024
          ),
        inline:
          false,
      },
      {
        name:
          "⏱️ Eficiência e tempo de resposta",
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
          "👑 Liderança",
        value: [
          `**Entradas:** ${current.leadership.entered}`,
          `**Remoções:** ${current.leadership.removed}`,
          `**Saídas do servidor:** ${current.leadership.leftServer}`,
          `**Retornos:** ${current.leadership.returned}`,
          `**Retenção estimada:** ${current.leadership.retention.toFixed(1)}%`,
        ].join("\n"),
        inline:
          true,
      },
      {
        name:
          "📡 Dados utilizados",
        value: [
          `**Eventos atuais:** ${current.totalEvents}`,
          `**Categorias válidas:** ${current.validCategories.length}`,
          `**Progresso temporal:** ${(current.expectedProgress * 100).toFixed(0)}%`,
          `**Histórico no cálculo:** ${(displayed.historicalWeight * 100).toFixed(0)}%`,
        ].join("\n"),
        inline:
          true,
      },
      {
        name:
          "🧠 Diagnóstico rápido",
        value:
          truncate(
            diagnosis.attentions[0],
            1024
          ),
        inline:
          false,
      }
    )
    .setFooter({
      text:
        "NPS Operacional SantaCreators • Atualização automática",
    })
    .setTimestamp(
      new Date(
        currentTimestamp * 1000
      )
    );
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
            "Atualizar painel"
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
            "Resumo atual no PV"
          )
          .setEmoji("📩")
          .setStyle(
            ButtonStyle.Success
          ),

        new ButtonBuilder()
          .setCustomId(
            BUTTON_PREVIOUS_DM_ID
          )
          .setLabel(
            "Resumo anterior no PV"
          )
          .setEmoji("📅")
          .setStyle(
            ButtonStyle.Secondary
          )
      ),
  ];
}

// ============================================================================
// GERAÇÃO DOS RESULTADOS
// ============================================================================

function generateResults() {
  const config = loadConfig();
  const state = loadState();

  // Recupera os dados que já existiam antes do NPS
  // e também atualiza os totais consolidados mais recentes.
  syncConsolidatedWeeklySources(
    state
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

  const displayed =
    calculateDisplayedCurrentScore(
      current,
      previous
    );

  const diagnosis =
    buildDiagnosis(
      current,
      previous,
      displayed
    );

  return {
    config,
    state,
    current,
    previous,
    displayed,
    diagnosis,
  };
}

// ============================================================================
// ATUALIZAÇÃO DO PAINEL
// ============================================================================

async function findExistingDashboardMessage(
  channel,
  state
) {
  if (
    state.dashboardMessageId
  ) {
    const existing =
      await channel.messages.fetch(
        state.dashboardMessageId
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
            NPS_DASH_MARKER
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
    const channel =
      await client.channels.fetch(
        NPS_DASHBOARD_CHANNEL_ID
      ).catch(
        () => null
      );

    if (
      !channel ||
      !channel.isTextBased()
    ) {
      console.error(
        `[NPS Operacional] Canal do painel inválido: ${NPS_DASHBOARD_CHANNEL_ID}`
      );

      return;
    }

    const results =
      generateResults();

    const embed =
      buildDashboardEmbed(
        results
      );

    const components =
      buildDashboardComponents();

    const existing =
      await findExistingDashboardMessage(
        channel,
        results.state
      );

    let dashboardMessage;

    if (existing) {
      dashboardMessage =
        await existing.edit({
          embeds: [embed],
          components,
        });
    } else {
      dashboardMessage =
        await channel.send({
          embeds: [embed],
          components,
        });
    }

    results.state.dashboardMessageId =
      dashboardMessage.id;

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
    analysisEmbed,
  ];
}

function generateCurrentSummary() {
  const results =
    generateResults();

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
    generateCurrentSummary();

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
      : generateCurrentSummary();

  try {
    await interaction.user.send({
      content:
        type === "previous"
          ? "📅 **Resumo do NPS Operacional da semana anterior**"
          : "📊 **Resumo parcial do NPS Operacional da semana atual**",
      embeds:
        summary.embeds,
    });

    await interaction.editReply({
      content:
        "✅ O resumo foi enviado para o seu privado.",
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