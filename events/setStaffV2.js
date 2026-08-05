// /application/events/setStaffV2.js
// SantaCreators • Set Staff (V2) — Modular / SEM ENV
// - Botão fixo auto-gerenciado no canal do menu
// - Fluxo: Cidade -> Nível -> Modal -> Envia pra aprovação
// - Aprovar/Reprovar com histórico em JSON
// - Compatível com teu roteador central (messageCreate / interactionCreate / ready)

import fs from "node:fs";
import path from "node:path";
import {
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";

import {
  registerOperationalMetricProvider,
} from "../utils/operationalMetricsHub.js";

// =====================================================
// CONFIG FIXA (SEM .env)
// =====================================================
const CFG = {
  GUILD_ID: "1262262852782129183",

  // Canal do MENU (mensagem fixa com botões de cidade)
  CANAL_MENU: "1382830421909438484",

  // Canal onde cai o pedido pra aprovar/reprovar
  CANAL_REGISTRO: "1379024704957841509",

  // Canal de notificação "novo set"
  CANAL_NOTIF: "1262262853436440652",

  // Cargos gerais
  CARGO_CIDADAO: "1262978759922028575",
  CARGO_STAFF_GERAL: "1353151740362625055",
  CARGO_SEM_WL: "1430984036972494908", // ✅ Cargo SEM WL para remoção

  // Permissões de aprovação
  PODE_APROVAR_ROLES: [
    "1414651836861907006", // RESPONSÁVEIS
    "1352385500614234134", // COORDENAÇÃO
    "1262262852949905408", // OWNER
    "1282119104576098314", // MKT TICKET
  ],
  PODE_APROVAR_USERS: [
    "660311795327828008", // você
  ],

  /*
   * Meta semanal utilizada pelo NPS Operacional.
   *
   * Ela representa a quantidade de pedidos de Set Staff
   * que a equipe deve conseguir concluir durante a semana.
   */
  NPS_WEEKLY_GOAL:
    10,

  /*
   * Tempo considerado saudável para analisar um pedido.
   *
   * 240 minutos correspondem a quatro horas.
   */
  NPS_IDEAL_RESPONSE_MINUTES:
    240,
};

// =====================================================
// CARGOS (Cidades / Níveis)
// =====================================================
const CARGOS_CIDADES = {
  nobre: "1379021805544804382",
  santa: "1379021888709464168",
  maresia: "1379021994678288465",
  royal: "1379021933324271719",
  universo: "1379022090891427892",
  kng: "1379022161519312896",
  malta: "1379022050403815454",
  real: "1423348501110198343",
  grande: "1418691103397253322",
  boomerang: "1423354185570586694",
  district99: "1500677281864093746",
  liberty99: "1500676325042688092",
  prime: "1500677363917258822",
  fronteira: "1500677363917258822",
  goat: "1500669528479371268",
};

const CARGOS_STAFF = {
  // NOVOS
  diretoria: "1377127454543708253",
  diretorcomunidade: "1377109308730376202",
  respadministrativo: "1459624402231754876",
  respwallstreet: "1353019238658347070",

  // JÁ EXISTIAM
  adm: "1352367267547058319",
  masterstaff: "1366960248530796564",
  respstaff: "1366961308314108015", // Resp Cultura
  senior: "1379172775905984703",
  auxiliar: "1381865464187326545",
  pleno: "1379172895116361770",
  junior: "1379262716564471971",
  estagiario: "1379172934387630160",
};


const NIVEL_LABELS = {
  // NOVOS
  diretoria: "DIRETORIA",
  diretorcomunidade: "Diretor Comunidade",
  respstaff: "Resp Cultura",
  respadministrativo: "Resp Administrativo",
  respwallstreet: "Resp Wallstreet",

  // JÁ EXISTIAM
  masterstaff: "Responsáveis",
  adm: "ADM",
  senior: "Sênior",
  auxiliar: "Auxiliar",
  pleno: "Pleno",
  junior: "Junior",
  estagiario: "Estagiário",
};

const ABREVIACOES_CIDADES = {
  nobre: "NB",
  santa: "ST",
  maresia: "MRS",
  royal: "RYL",
  universo: "UNV",
  kng: "KNG",
  malta: "MLT",
  real: "REAL",
  grande: "GRND",
  boomerang: "BMG",
  district99: "D99",
  liberty99: "L99",
  prime: "PRM",
  fronteira: "FRNT",
  goat: "GOT",
};

// Níveis que puxam cargos extras ao aprovar
const EXTRA_BY_LEVEL = {
  adm: ["senior"],
  masterstaff: ["senior"],
  respstaff: ["senior"],
  auxiliar: ["senior"], // ✅ Mudou de pleno para senior
};

const LABELS_CIDADES = {
  nobre: "Nobre",
  santa: "Santa",
  maresia: "Maresia",
  royal: "Royal UK",
  universo: "Universo",
  kng: "KNG",
  malta: "Malta",
  real: "Real",
  grande: "Grande",
  boomerang: "Boomerang",
  district99: "District 99",
  liberty99: "Liberty 99",
  prime: "Prime",
  fronteira: "Fronteira",
  goat: "Goat",
};

// =====================================================
// STATE GLOBAL (anti duplicação)
// =====================================================
globalThis.__SC_SETSTAFF_V2__ ??= {
  installed: false,
  lastFixedMsgId: null,
  lastFixRunAt: 0,
  lock: false,
  pedidosMap: new Map(), // memória do fluxo
};

const ST = globalThis.__SC_SETSTAFF_V2__;

// =====================================================
// PERSISTÊNCIA (arquivo próprio do módulo)
// (não depende do teu salvarPedido/obterPedido do index)
// =====================================================

// ✅ DICA: se teu host tiver "storage" persistente, isso fica ainda mais seguro.
// Se não tiver, continua funcionando igual (mas se o host apagar arquivos no restart, perde).
const DATA_DIR = path.resolve("./events/data/setstaff");
const DATA_FILE = path.join(DATA_DIR, "pedidos_setstaff.json");

function ensureDataFile() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({ users: {}, byMsgId: {} }, null, 2));
  } catch (e) {
    console.error("[SETSTAFF_V2] erro criando data file:", e);
  }
}

// ✅ Normaliza formato do JSON (suporta o antigo que era { [userId]: [] })
function normalizeAll(rawObj) {
  const obj = rawObj && typeof rawObj === "object" ? rawObj : {};

  // formato novo
  if (obj.users && typeof obj.users === "object") {
    obj.byMsgId ??= {};
    if (typeof obj.byMsgId !== "object") obj.byMsgId = {};
    return { users: obj.users, byMsgId: obj.byMsgId };
  }

  // formato antigo (legacy): { "123": [ ... ] }
  return { users: obj, byMsgId: {} };
}

function loadAll() {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const json = JSON.parse(raw || "{}");
    return normalizeAll(json);
  } catch {
    return { users: {}, byMsgId: {} };
  }
}

function saveAll(obj) {
  ensureDataFile();
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(obj, null, 2));
  } catch (e) {
    console.error("[SETSTAFF_V2] erro salvando json:", e);
  }
}

function pushHistorico(userId, payload) {
  const all = loadAll();
  all.users[userId] ??= [];
  all.users[userId].push(payload);
  saveAll(all);
}

function getHistorico(userId) {
  const all = loadAll();
  return Array.isArray(all.users[userId]) ? all.users[userId] : [];
}

function getUltimo(userId) {
  const h = getHistorico(userId);
  return h.length ? h[h.length - 1] : null;
}

function updateUltimoStatus(userId, status) {
  const all = loadAll();
  const h = Array.isArray(all.users[userId]) ? all.users[userId] : [];
  if (!h.length) return;

  h[h.length - 1].status = status;
  all.users[userId] = h;

  // se o último tiver msgId, atualiza também a tabela por msgId
  const last = h[h.length - 1];
  if (last?.msgId) {
    all.byMsgId[last.msgId] = { ...(all.byMsgId[last.msgId] || {}), ...last, status };
  }

  saveAll(all);
}

// ✅ salva/atualiza lookup por msgId (pra aprovar/reprovar sempre achar o pedido certo)
function setByMsgId(msgId, payload) {
  if (!msgId) return;
  const all = loadAll();
  all.byMsgId[msgId] = payload;
  saveAll(all);
}

function getByMsgId(msgId) {
  if (!msgId) return null;
  const all = loadAll();
  const p = all.byMsgId?.[msgId];
  return p && typeof p === "object" ? p : null;
}

function updateByMsgIdStatus(msgId, status) {
  if (!msgId) return;
  const all = loadAll();
  if (!all.byMsgId?.[msgId]) return;
  all.byMsgId[msgId].status = status;
  saveAll(all);
}

/**
 * Registra os dados completos da decisão de um pedido.
 *
 * Além de atualizar o índice por mensagem, a função também
 * localiza o mesmo pedido no histórico do usuário.
 */
function updateSetStaffDecision({
  userId,
  msgId,
  status,
  decision,
  decisionBy,
  decidedAt,
}) {
  if (
    !userId ||
    !msgId
  ) {
    return;
  }

  const all =
    loadAll();

  const normalizedStatus =
    String(
      status ||
      ""
    ).trim();

  const normalizedDecision =
    String(
      decision ||
      normalizedStatus
    ).trim();

  const numericDecidedAt =
    Number(
      decidedAt ||
      Date.now()
    );

  const decisionPayload = {
    status:
      normalizedStatus,

    decision:
      normalizedDecision,

    decisionBy:
      decisionBy
        ? String(
            decisionBy
          )
        : null,

    decidedAt:
      Number.isFinite(
        numericDecidedAt
      )
        ? numericDecidedAt
        : Date.now(),
  };

  all.byMsgId ||=
    {};

  if (
    all.byMsgId[msgId]
  ) {
    all.byMsgId[msgId] = {
      ...all.byMsgId[msgId],
      ...decisionPayload,
    };
  }

  all.users ||=
    {};

  const userHistory =
    Array.isArray(
      all.users[userId]
    )
      ? all.users[userId]
      : [];

  const historyIndex =
    userHistory.findIndex(
      item =>
        String(
          item?.msgId ||
          ""
        ) ===
        String(
          msgId
        )
    );

  if (
    historyIndex >= 0
  ) {
    userHistory[
      historyIndex
    ] = {
      ...userHistory[
        historyIndex
      ],

      ...decisionPayload,
    };
  } else if (
    all.byMsgId[msgId]
  ) {
    userHistory.push({
      ...all.byMsgId[msgId],
      ...decisionPayload,
    });
  }

  all.users[userId] =
    userHistory;

  saveAll(
    all
  );
}

function getPedidoPendente(userId) {
  const historico = getHistorico(userId);
  if (!historico.length) return null;

  for (let i = historico.length - 1; i >= 0; i--) {
    const item = historico[i];
    if (String(item?.status || "").toLowerCase() === "pendente") {
      return item;
    }
  }

  return null;
}

function hasPedidoPendente(userId) {
  return !!getPedidoPendente(userId);
}

// =====================================================
// MÉTRICAS OPERACIONAIS DO SET STAFF
// =====================================================

const SET_STAFF_TIMEZONE =
  "America/Sao_Paulo";

function getSetStaffWeekKey(
  reference = new Date()
) {
  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          SET_STAFF_TIMEZONE,

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
          part.type ===
          type
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

  const localDay =
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

  localDay.setUTCDate(
    localDay.getUTCDate() -
    weekday
  );

  return localDay
    .toISOString()
    .slice(
      0,
      10
    );
}

function addSetStaffDays(
  weekKey,
  amount
) {
  const date =
    new Date(
      `${weekKey}T03:00:00.000Z`
    );

  date.setUTCDate(
    date.getUTCDate() +
    Number(
      amount ||
      0
    )
  );

  return date
    .toISOString()
    .slice(
      0,
      10
    );
}

function parseSetStaffLegacyDate(
  value
) {
  const raw =
    String(
      value ||
      ""
    ).trim();

  const match =
    raw.match(
      /(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/
    );

  if (!match) {
    return null;
  }

  const day =
    Number(
      match[1]
    );

  const month =
    Number(
      match[2]
    );

  const year =
    Number(
      match[3]
    );

  const hour =
    Number(
      match[4]
    );

  const minute =
    Number(
      match[5]
    );

  const second =
    Number(
      match[6] ||
      0
    );

  const parsed =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day,
        hour + 3,
        minute,
        second
      )
    );

  return Number.isNaN(
    parsed.getTime()
  )
    ? null
    : parsed.getTime();
}

function resolveSetStaffCreatedAt(
  item
) {
  const numeric =
    Number(
      item?.createdAt
    );

  if (
    Number.isFinite(
      numeric
    ) &&
    numeric > 0
  ) {
    return numeric;
  }

  return parseSetStaffLegacyDate(
    item?.dataHora
  );
}

function collectSetStaffRequests() {
  const all =
    loadAll();

  const requestsByMessage =
    Object.values(
      all.byMsgId ||
      {}
    );

  const requestsWithoutMessage =
    Object.values(
      all.users ||
      {}
    )
      .flatMap(
        history =>
          Array.isArray(
            history
          )
            ? history
            : []
      )
      .filter(
        item =>
          !item?.msgId
      );

  const uniqueRequests =
    new Map();

  for (
    const request of [
      ...requestsByMessage,
      ...requestsWithoutMessage,
    ]
  ) {
    const createdAt =
      resolveSetStaffCreatedAt(
        request
      );

    const identity =
      request?.msgId
        ? `message:${request.msgId}`
        : [
            "legacy",
            request?.userId ||
              "unknown",
            createdAt ||
              request?.dataHora ||
              "unknown",
            request?.cidade ||
              "unknown",
            request?.nivel ||
              "unknown",
          ].join(":");

    uniqueRequests.set(
      identity,
      {
        ...request,
        createdAt,
      }
    );
  }

  return [
    ...uniqueRequests.values(),
  ];
}

function averageSetStaffValues(
  values = []
) {
  const valid =
    values
      .map(Number)
      .filter(
        value =>
          Number.isFinite(
            value
          ) &&
          value >= 0
      );

  if (!valid.length) {
    return 0;
  }

  return valid.reduce(
    (
      total,
      value
    ) =>
      total +
      value,
    0
  ) / valid.length;
}

async function buildSetStaffOperationalMetric() {
  const currentWeekKey =
    getSetStaffWeekKey();

  const previousWeekKey =
    addSetStaffDays(
      currentWeekKey,
      -7
    );

  const requests =
    collectSetStaffRequests();

  const currentRequests =
    requests.filter(
      request =>
        request.createdAt &&
        getSetStaffWeekKey(
          new Date(
            request.createdAt
          )
        ) ===
          currentWeekKey
    );

  const previousRequests =
    requests.filter(
      request =>
        request.createdAt &&
        getSetStaffWeekKey(
          new Date(
            request.createdAt
          )
        ) ===
          previousWeekKey
    );

  const approved =
    currentRequests.filter(
      request =>
        String(
          request?.status ||
          ""
        ).toLowerCase() ===
          "aprovado"
    );

  const rejected =
    currentRequests.filter(
      request =>
        String(
          request?.status ||
          ""
        ).toLowerCase() ===
          "reprovado"
    );

  const pending =
    currentRequests.filter(
      request =>
        String(
          request?.status ||
          "pendente"
        ).toLowerCase() ===
          "pendente"
    );

  const previousApproved =
    previousRequests.filter(
      request =>
        String(
          request?.status ||
          ""
        ).toLowerCase() ===
          "aprovado"
    ).length;

  const previousRejected =
    previousRequests.filter(
      request =>
        String(
          request?.status ||
          ""
        ).toLowerCase() ===
          "reprovado"
    ).length;

  const previousPending =
    previousRequests.filter(
      request =>
        String(
          request?.status ||
          "pendente"
        ).toLowerCase() ===
          "pendente"
    ).length;

  const decided =
    approved.length +
    rejected.length;

  const approvalRate =
    decided > 0
      ? (
          approved.length /
          decided
        ) *
        100
      : 0;

  const responseTimes =
    currentRequests
      .map(
        request => {
          const createdAt =
            Number(
              request?.createdAt
            );

          const decidedAt =
            Number(
              request?.decidedAt
            );

          if (
            !Number.isFinite(
              createdAt
            ) ||
            !Number.isFinite(
              decidedAt
            ) ||
            decidedAt <
              createdAt
          ) {
            return null;
          }

          return (
            decidedAt -
            createdAt
          );
        }
      )
      .filter(
        value =>
          Number.isFinite(
            value
          )
      );

  const averageResponseMilliseconds =
    averageSetStaffValues(
      responseTimes
    );

  const idealResponseMilliseconds =
    CFG.NPS_IDEAL_RESPONSE_MINUTES *
    60000;

  const responseScore =
    responseTimes.length > 0
      ? Math.max(
          0,
          Math.min(
            100,
            (
              idealResponseMilliseconds /
              Math.max(
                idealResponseMilliseconds,
                averageResponseMilliseconds
              )
            ) *
              100
          )
        )
      : (
          pending.length > 0
            ? 40
            : 100
        );

  const completionRate =
    currentRequests.length > 0
      ? (
          decided /
          currentRequests.length
        ) *
        100
      : 0;

  /*
   * A nota considera:
   *
   * 45% conclusão dos pedidos;
   * 35% qualidade das decisões;
   * 20% velocidade das análises.
   */
  const score =
    completionRate *
      0.45 +
    approvalRate *
      0.35 +
    responseScore *
      0.20;

  const decisionUsers = {};

  for (
    const request of
    currentRequests
  ) {
    const decisionBy =
      String(
        request?.decisionBy ||
        ""
      );

    if (!decisionBy) {
      continue;
    }

    decisionUsers[
      decisionBy
    ] ||= {
      total:
        0,

      approved:
        0,

      rejected:
        0,
    };

    decisionUsers[
      decisionBy
    ].total +=
      1;

    if (
      String(
        request.status ||
        ""
      ).toLowerCase() ===
        "aprovado"
    ) {
      decisionUsers[
        decisionBy
      ].approved +=
        1;
    }

    if (
      String(
        request.status ||
        ""
      ).toLowerCase() ===
        "reprovado"
    ) {
      decisionUsers[
        decisionBy
      ].rejected +=
        1;
    }
  }

  const positivePoints = [];
  const attentionPoints = [];
  const recommendations = [];

  if (
    currentRequests.length > 0
  ) {
    positivePoints.push(
      `Foram recebidos ${currentRequests.length} pedido(s) de Set Staff nesta semana.`
    );
  }

  if (
    approved.length > 0
  ) {
    positivePoints.push(
      `${approved.length} pedido(s) foram aprovados pelos responsáveis.`
    );
  }

  if (
    decided > 0
  ) {
    positivePoints.push(
      `${Object.keys(decisionUsers).length} responsável(is) diferente(s) participaram das decisões.`
    );
  }

  if (
    responseTimes.length > 0 &&
    averageResponseMilliseconds <=
      idealResponseMilliseconds
  ) {
    positivePoints.push(
      `O tempo médio de análise está em ${(averageResponseMilliseconds / 3600000).toFixed(1)} hora(s), dentro do limite esperado de ${(CFG.NPS_IDEAL_RESPONSE_MINUTES / 60).toFixed(1)} hora(s).`
    );
  }

  if (
    pending.length > 0
  ) {
    attentionPoints.push(
      `${pending.length} pedido(s) ainda aguardam análise dos responsáveis.`
    );
  }

  if (
    rejected.length > 0
  ) {
    attentionPoints.push(
      `${rejected.length} pedido(s) foram reprovados nesta semana.`
    );
  }

  if (
    responseTimes.length > 0 &&
    averageResponseMilliseconds >
      idealResponseMilliseconds
  ) {
    attentionPoints.push(
      `O tempo médio de análise está em ${(averageResponseMilliseconds / 3600000).toFixed(1)} hora(s), acima do limite esperado de ${(CFG.NPS_IDEAL_RESPONSE_MINUTES / 60).toFixed(1)} hora(s).`
    );
  }

  if (
    pending.length > 0
  ) {
    recommendations.push(
      `Revisar os ${pending.length} pedido(s) pendentes e distribuir as análises entre os responsáveis disponíveis.`
    );
  }

  if (
    responseTimes.length > 0 &&
    averageResponseMilliseconds >
      idealResponseMilliseconds
  ) {
    recommendations.push(
      "Reduzir o intervalo entre o envio do pedido e a decisão final, evitando acúmulo no canal de análise."
    );
  }

  if (
    !recommendations.length
  ) {
    recommendations.push(
      "Manter o ritmo atual de análise e acompanhar se os pedidos permanecem distribuídos entre os responsáveis."
    );
  }

  return {
    id:
      "set_staff",

    label:
      "Set Staff",

    available:
      currentRequests.length > 0 ||
      previousRequests.length > 0,

    score:
      Math.max(
        0,
        Math.min(
          100,
          score
        )
      ),

    confidence:
      Math.max(
        0,
        Math.min(
          100,
          50 +
          currentRequests.length *
            5
        )
      ),

    volume:
      currentRequests.length,

    goal:
      CFG.NPS_WEEKLY_GOAL,

    current:
      decided,

    previous:
      previousApproved +
      previousRejected,

    difference:
      decided -
      (
        previousApproved +
        previousRejected
      ),

    responseTimes,

    idealMinutes:
      CFG.NPS_IDEAL_RESPONSE_MINUTES,

    positivePoints,

    attentionPoints,

    recommendations,

    details: {
      currentWeekKey,

      previousWeekKey,

      requested:
        currentRequests.length,

      approved:
        approved.length,

      rejected:
        rejected.length,

      pending:
        pending.length,

      decided,

      approvalRate,

      completionRate,

      averageResponseMilliseconds,

      averageResponseMinutes:
        averageResponseMilliseconds /
        60000,

      previousRequested:
        previousRequests.length,

      previousApproved,

      previousRejected,

      previousPending,

      responsibleCount:
        Object.keys(
          decisionUsers
        ).length,

      decisionUsers,

      byUser:
        currentRequests.reduce(
          (
            result,
            request
          ) => {
            const userId =
              String(
                request?.userId ||
                ""
              );

            if (!userId) {
              return result;
            }

            result[userId] ||= {
              total:
                0,

              approved:
                0,

              rejected:
                0,

              pending:
                0,
            };

            result[userId].total +=
              1;

            const status =
              String(
                request?.status ||
                "pendente"
              ).toLowerCase();

            if (
              status ===
              "aprovado"
            ) {
              result[userId].approved +=
                1;
            } else if (
              status ===
              "reprovado"
            ) {
              result[userId].rejected +=
                1;
            } else {
              result[userId].pending +=
                1;
            }

            return result;
          },
          {}
        ),
    },
  };
}

registerOperationalMetricProvider(
  "set_staff",
  async () =>
    buildSetStaffOperationalMetric()
);

async function resolveLogChannel(client, channelId) {
  try {
    if (!client || !channelId) return null;

    const canal = await client.channels.fetch(channelId).catch(() => null);
    if (!canal) return null;

    if (canal.type !== ChannelType.GuildText) return null;

    return canal;
  } catch (e) {
    console.error("[SETSTAFF_V2] resolveLogChannel erro:", e);
    return null;
  }
}

// ✅ NOVO: Reconstrói dados a partir do Embed se o JSON falhar
function reconstruirPedidoDoEmbed(embed, userIdTarget) {
  try {
    if (!embed || !embed.fields) return null;

    const getVal = (namePart) => {
      const f = embed.fields.find(f => f.name.includes(namePart));
      return f ? f.value : null;
    };

    const nome = getVal("Nome") || "—";
    const pasta = getVal("Pasta") || "—";
    const passaporte = getVal("Passaporte") || "—";
    const dataHora = getVal("Data/Hora") || "—";
    
    const cidadeRaw = getVal("Cidade") || "";
    const nivelRaw = getVal("Nível") || "";

    // Tenta descobrir a chave da cidade
    let cidadeKey = null;
    for (const [key, roleId] of Object.entries(CARGOS_CIDADES)) {
      if (cidadeRaw.includes(roleId)) { cidadeKey = key; break; }
    }
    if (!cidadeKey) {
      const clean = cidadeRaw.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
      for (const key of Object.keys(CARGOS_CIDADES)) {
        if (clean.includes(key.toLowerCase())) { cidadeKey = key; break; }
      }
    }

    // Tenta descobrir a chave do nível
    let nivelKey = null;
    for (const [key, roleId] of Object.entries(CARGOS_STAFF)) {
      if (nivelRaw.includes(roleId)) { nivelKey = key; break; }
    }
    if (!nivelKey) {
       for (const [key, label] of Object.entries(NIVEL_LABELS)) {
         if (nivelRaw.toLowerCase().includes(label.toLowerCase())) { nivelKey = key; break; }
       }
    }
    if (!nivelKey) {
       for (const key of Object.keys(CARGOS_STAFF)) {
         if (nivelRaw.toLowerCase().includes(key.toLowerCase())) { nivelKey = key; break; }
       }
    }

    if (cidadeKey && nivelKey) {
      return {
        userId: userIdTarget,
        cidade: cidadeKey,
        nivel: nivelKey,
        nome,
        pasta,
        passaporte,
        dataHora,
        status: "pendente",
        reconstructed: true
      };
    }
  } catch (e) {
    console.error("[SETSTAFF_V2] Erro reconstruindo embed:", e);
  }
  return null;
}


// =====================================================
// FORMAT HELPERS
// =====================================================
function fmtNivelLabel(nivel) {
  return NIVEL_LABELS[nivel] ?? String(nivel || "").toUpperCase();
}
function fmtCidadeLabel(cidade) {
  const rid = CARGOS_CIDADES[cidade];
  return rid ? `<@&${rid}>` : String(cidade || "").toUpperCase();
}
function fmtNivelComMenção(nivel) {
  const rid = CARGOS_STAFF[nivel];
  const label = fmtNivelLabel(nivel);
  return rid ? `${label} (<@&${rid}>)` : label;
}
function fmtExtrasLista(extrasKeys) {
  const labels = (extrasKeys || []).map((k) => fmtNivelComMenção(k));
  return labels.length ? labels.join(", ") : "—";
}

function canApprove(interaction) {
  const isUserAllowed = CFG.PODE_APROVAR_USERS.includes(interaction.user.id);
  const hasRoleAllowed = !!interaction.member?.roles?.cache?.some((r) => CFG.PODE_APROVAR_ROLES.includes(r.id));
  return isUserAllowed || hasRoleAllowed;
}

// =====================================================
// UI BUILDERS
// =====================================================
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function buildCityRows() {
  const entries = Object.entries(LABELS_CIDADES);
  const groups = chunk(entries, 5);

  const rows = groups.map((group) => {
    const row = new ActionRowBuilder();
    for (const [cidade, label] of group) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`ss2_cidade_${cidade}`)
          .setLabel(label)
          .setStyle(ButtonStyle.Primary)
      );
    }
    return row;
  });

  const extra = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ss2_ver_historico").setLabel("📖 Ver Histórico").setStyle(ButtonStyle.Secondary)
  );
  rows.push(extra);
  return rows;
}

function buildNivelRows() {
  // Agora com mais opções (máx 5 por linha)
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ss2_nivel_diretoria").setLabel("DIRETORIA").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("ss2_nivel_diretorcomunidade").setLabel("Diretor Comunidade").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("ss2_nivel_respstaff").setLabel("Resp Cultura").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("ss2_nivel_respadministrativo").setLabel("Resp Administrativo").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("ss2_nivel_respwallstreet").setLabel("Resp Wallstreet").setStyle(ButtonStyle.Danger)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ss2_nivel_masterstaff").setLabel("Responsáveis").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("ss2_nivel_adm").setLabel("ADM").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("ss2_nivel_senior").setLabel("Sênior").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("ss2_nivel_auxiliar").setLabel("Auxiliar").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("ss2_nivel_pleno").setLabel("Pleno").setStyle(ButtonStyle.Secondary)
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ss2_nivel_junior").setLabel("Junior").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("ss2_nivel_estagiario").setLabel("Estagiário").setStyle(ButtonStyle.Secondary)
  );

  return [row1, row2, row3];
}


function buildEmbedPedido({ userId, nome, pasta, passaporte, cidade, nivel, dataHora, status }) {
  return new EmbedBuilder()
    .setTitle("🛠️ Pedido de Set Staff")
    .setColor("#9146FF")
    .setThumbnail(`https://cdn.discordapp.com/avatars/${userId}/${"a".repeat(32)}.png`) // fallback visual (Discord troca sozinho se não achar)
    .addFields(
      { name: "👤 Nome:", value: nome || "—", inline: true },
      { name: "📁 Pasta:", value: pasta || "—", inline: true },
      { name: "🪪 Passaporte:", value: passaporte || "—", inline: true },
      { name: "🌆 Cidade Escolhida:", value: fmtCidadeLabel(cidade), inline: true },
      { name: "📊 Nível Staff:", value: fmtNivelComMenção(nivel), inline: true },
      { name: "🕒 Data/Hora do Pedido:", value: dataHora || "—", inline: false },
      { name: "📌 Status:", value: `**${String(status || "pendente").toUpperCase()}**`, inline: false }
    )
    .setFooter({ text: `ID do usuário: ${userId}` });
}

function buildRowAprovacao(userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ss2_aprovar_${userId}`).setLabel("Aprovar").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`ss2_reprovar_${userId}`).setLabel("Reprovar").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`ss2_verhistorico_${userId}`).setLabel("Ver Histórico").setStyle(ButtonStyle.Secondary)
  );
}

function buildRowFinal(acao) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ss2_finalizado")
      .setLabel(acao === "aprovar" ? "✅ Aprovado" : "❌ Reprovado")
      .setStyle(acao === "aprovar" ? ButtonStyle.Success : ButtonStyle.Danger)
      .setDisabled(true)
  );
}

// =====================================================
// FIXED MESSAGE (BOTÃO FIXO AUTO-EDIT)
// - roda no ready
// - e roda sempre que alguém interage (com throttle)
// =====================================================
async function ensureFixedMessage(client, force = false) {
  const now = Date.now();
  if (!force && now - ST.lastFixRunAt < 2500) return; // throttle
  if (ST.lock) return;
  ST.lock = true;
  ST.lastFixRunAt = now;

  try {
    const canal = await client.channels.fetch(CFG.CANAL_MENU).catch(() => null);
    if (!canal || canal.type !== ChannelType.GuildText) return;

    const msgs = await canal.messages.fetch({ limit: 50 }).catch(() => null);
    if (!msgs) return;

    const marker = "🛠️ Clique abaixo para iniciar seu pedido de set staff:";
    const rows = buildCityRows();

    const minhas = msgs.filter(
      (m) =>
        m.author?.id === client.user.id &&
        (m.content || "").includes(marker) &&
        Array.isArray(m.components) &&
        m.components.length > 0
    );

    if (minhas.size > 0) {
      const sorted = [...minhas.values()].sort((a, b) => b.createdTimestamp - a.createdTimestamp);
      const keep = sorted[0];
      ST.lastFixedMsgId = keep.id;

      // sempre edita pra garantir que tá atualizado
      await keep.edit({ content: marker, components: rows }).catch(() => {});

      // apaga duplicadas
      const dups = sorted.slice(1);
      for (const d of dups) await d.delete().catch(() => {});
      return;
    }

    // se não existe, cria
    const sent = await canal.send({ content: marker, components: rows }).catch(() => null);
    if (sent) ST.lastFixedMsgId = sent.id;
  } catch (e) {
    console.error("[SETSTAFF_V2] ensureFixedMessage erro:", e);
  } finally {
    ST.lock = false;
  }
}

// =====================================================
// API DO MÓDULO (pra teu roteador)
// =====================================================
export async function setStaffV2OnReady(client) {
  if (ST.installed) return;
  ST.installed = true;

  ensureDataFile();

  // garante mensagem fixa quando ligar
  await ensureFixedMessage(client, true);
  // console.log("[SETSTAFF_V2] pronto ✅ (mensagem fixa garantida)");
}

export async function setStaffV2HandleMessage(message, client) {
  try {
    if (!message.guild || message.author.bot) return false;
    if (message.guild.id !== CFG.GUILD_ID) return false;

    const PREFIX = process.env.PREFIX || "!";
    if (!message.content.startsWith(PREFIX)) return false;

    const [cmd] = message.content.slice(PREFIX.length).trim().split(/\s+/);
    const name = (cmd || "").toLowerCase();

    // opcional: comando manual pra repostar/forçar arrumar
    if (name === "postsetstaff") {
      const allowed =
        CFG.PODE_APROVAR_USERS.includes(message.author.id) ||
        message.member?.roles?.cache?.some((r) => CFG.PODE_APROVAR_ROLES.includes(r.id));

      if (!allowed) {
        await message.reply("❌ Você não tem permissão pra usar isso.").catch(() => {});
        return true;
      }

      await ensureFixedMessage(client, true);
      await message.reply("✅ Mensagem fixa do Set Staff garantida/atualizada.").catch(() => {});
      return true;
    }

    // se alguém usar "!staff" em qualquer lugar, também força o fixo (e apaga o comando)
    if (name === "staff") {
      await ensureFixedMessage(client, true);
      await message.delete().catch(() => {});
      return true;
    }

    return false;
  } catch (e) {
    console.error("[SETSTAFF_V2] HandleMessage erro:", e);
    return false;
  }
}

export async function setStaffV2HandleInteraction(interaction, client) {
  try {
    if (!interaction.guildId || interaction.guildId !== CFG.GUILD_ID) return false;

    // sempre que alguém encostar em algo do setstaff, garante o botão fixo “vivo”
    // (isso atende teu “se auto edita sempre que é interagido”)
    ensureFixedMessage(client).catch(() => {});

    const userId = interaction.user.id;

    // ===========================================
    // (A) BOTÕES DE CIDADE (menu fixo)
    // ===========================================
    if (interaction.isButton() && interaction.customId.startsWith("ss2_cidade_")) {
  const pedidoPendente = getPedidoPendente(userId);
  if (pedidoPendente) {
    await interaction.reply({
      content:
        "⚠️ Você já possui um pedido de set staff pendente de análise.\n" +
        "Aguarde aprovação ou reprovação antes de enviar outro.",
      ephemeral: true,
    });
    return true;
  }

  const cidade = interaction.customId.split("_")[2];
  ST.pedidosMap.set(userId, { cidade });

  const rows = buildNivelRows();
  await interaction.reply({
    content: "👤 Escolha o nível do seu cargo:",
    components: rows,
    ephemeral: true,
  });
  return true;
}

    // ===========================================
    // (B) VER HISTÓRICO (menu fixo)
    // ===========================================
    if (interaction.isButton() && interaction.customId === "ss2_ver_historico") {
      const historico = getHistorico(userId);
      if (!historico.length) {
        await interaction.reply({ content: "❌ Você ainda não fez nenhum pedido.", ephemeral: true });
        return true;
      }

      const ultimo = historico[historico.length - 1];
      const cor =
        ultimo.status === "aprovado" ? "#43B581" : ultimo.status === "reprovado" ? "#ED4245" : "#FEE75C";

      const embed = new EmbedBuilder()
        .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
        .setColor(cor)
        .setTitle("📖 Seu Último Pedido de Set Staff")
        .setThumbnail(interaction.user.displayAvatarURL())
        .addFields(
          { name: "🧑 Nome", value: ultimo.nome || "—", inline: true },
          { name: "🗂️ Pasta", value: ultimo.pasta || "—", inline: true },
          { name: "🪪 Passaporte", value: ultimo.passaporte || "—", inline: true },
          { name: "🌆 Cidade", value: String(ultimo.cidade || "—").toUpperCase(), inline: true },
          { name: "📊 Nível", value: fmtNivelLabel(ultimo.nivel), inline: true },
          { name: "📅 Data", value: ultimo.dataHora || "—", inline: true },
          { name: "📌 Status", value: `**${String(ultimo.status || "pendente").toUpperCase()}**`, inline: true }
        )
        .setFooter({ text: `ID do usuário: ${interaction.user.id}` });

      await interaction.reply({ embeds: [embed], ephemeral: true });
      return true;
    }

    // ===========================================
    // (C) BOTÕES DE NÍVEL
    // ===========================================
if (interaction.isButton() && interaction.customId.startsWith("ss2_nivel_")) {
  const pedidoPendente = getPedidoPendente(userId);
  if (pedidoPendente) {
    await interaction.reply({
      content:
        "⚠️ Você já possui um pedido de set staff pendente de análise.\n" +
        "Aguarde aprovação ou reprovação antes de enviar outro.",
      ephemeral: true,
    });
    return true;
  }

  const nivel = interaction.customId.split("_")[2];
  const base = ST.pedidosMap.get(userId);
  if (!base?.cidade) {
    await interaction.reply({
      content: "⚠️ Seu pedido perdeu o contexto (cidade). Clique no botão de cidade de novo.",
      ephemeral: true,
    });
    return true;
  }

  base.nivel = nivel;
  ST.pedidosMap.set(userId, base);

  const modal = new ModalBuilder()
    .setCustomId("ss2_modal_setstaff")
    .setTitle("Pedido de Set Staff")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("nome")
          .setLabel("Seu Nome")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("pasta")
          .setLabel("Sua pasta na cidade")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("id")
          .setLabel("Seu ID/Passaporte")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );

  await interaction.showModal(modal);
  return true;
}

    // ===========================================
    // (D) SUBMIT DO MODAL
    // ===========================================
    if (interaction.isModalSubmit() && interaction.customId === "ss2_modal_setstaff") {
  const base = ST.pedidosMap.get(userId) || {};
  const { cidade, nivel } = base;

  if (!cidade || !nivel) {
    await interaction.reply({
      content: "⚠️ Seu pedido perdeu o contexto (cidade/nível). Refaz o fluxo pelo menu.",
      ephemeral: true,
    });
    return true;
  }

  const pedidoPendente = getPedidoPendente(userId);
  if (pedidoPendente) {
    await interaction.reply({
      content:
        "⚠️ Você já possui um pedido de set staff pendente de análise.\n" +
        "Aguarde aprovação ou reprovação antes de enviar outro.",
      ephemeral: true,
    });
    return true;
  }

  const nome =
  interaction.fields
    .getTextInputValue(
      "nome"
    )
    ?.trim();

const pasta =
  interaction.fields
    .getTextInputValue(
      "pasta"
    )
    ?.trim();

const passaporte =
  interaction.fields
    .getTextInputValue(
      "id"
    )
    ?.trim();

const createdAt =
  Date.now();

const dataHora =
  new Date(
    createdAt
  ).toLocaleString(
    "pt-BR",
    {
      timeZone:
        "America/Sao_Paulo",
    }
  );

if (
  !nome ||
  !pasta ||
  !passaporte
) {
  await interaction.reply({
    content:
      "❌ Preencha nome, pasta e passaporte corretamente.",

    ephemeral:
      true,
  });

  return true;
}

const payload = {
  userId,
  cidade,
  nivel,
  nome,
  pasta,
  passaporte,
  dataHora,

  /*
   * Timestamp numérico usado pelo NPS para localizar
   * a semana do pedido e calcular o tempo de análise.
   */
  createdAt,

  status:
    "pendente",

  decidedAt:
    null,

  decisionBy:
    null,

  decision:
    null,
};

  const embed = buildEmbedPedido(payload);
  const row = buildRowAprovacao(userId);

  const canalRegistro = await resolveLogChannel(client, CFG.CANAL_REGISTRO);
  if (!canalRegistro) {
    await interaction.reply({
      content: "❌ Não achei o canal de registro do set staff.",
      ephemeral: true,
    });
    return true;
  }

  let msgRegistro = null;

  try {
    msgRegistro = await canalRegistro.send({
      content: `Novo pedido de set staff de <@${userId}>`,
      embeds: [embed],
      components: [row],
      allowedMentions: { parse: ["users"] },
    });
  } catch (e) {
    console.error("[SETSTAFF_V2] erro enviando pedido no canal de registro:", e);
    await interaction.reply({
      content: "❌ Não consegui enviar seu pedido para análise. Tente novamente em instantes.",
      ephemeral: true,
    });
    return true;
  }

  const payloadFinal = {
    ...payload,
    msgId: msgRegistro.id,
  };

  pushHistorico(userId, payloadFinal);
  setByMsgId(msgRegistro.id, payloadFinal);
  ST.pedidosMap.delete(userId);

  const canalNotif = await resolveLogChannel(client, CFG.CANAL_NOTIF);
  if (canalNotif) {
    await canalNotif
      .send({
        content:
          `📢 Novo pedido de set staff feito por <@${userId}>!\n` +
          `📌 Analise aqui: <#${CFG.CANAL_REGISTRO}>`,
        allowedMentions: { parse: ["users"] },
      })
      .catch(() => {});
  }

  const membro = await interaction.guild.members.fetch(userId).catch(() => null);
  if (membro) {
    await membro.setNickname(`${nome} | ${passaporte}`).catch(() => {});
    await membro.roles.add(CFG.CARGO_CIDADAO).catch(() => {});

    // ✅ Remove o cargo SEM WL imediatamente ao enviar o pedido
    await membro.roles.remove(CFG.CARGO_SEM_WL).catch(() => {});
  }

  await interaction.reply({ content: "✅ Pedido enviado com sucesso!", ephemeral: true });
  return true;
}
    // ===========================================
    // (E) VER HISTÓRICO (botão no registro)
    // ===========================================
    if (interaction.isButton() && interaction.customId.startsWith("ss2_verhistorico_")) {
      const userIdTarget = interaction.customId.split("_")[2];
      const ehAprovador = canApprove(interaction);

      if (!ehAprovador && interaction.user.id !== userIdTarget) {
        await interaction.reply({ content: "❌ Você só pode ver seu próprio histórico.", ephemeral: true });
        return true;
      }

      // ✅ tenta achar pelo msgId do próprio pedido (mais confiável)
const byMsg = getByMsgId(interaction.message?.id);
const ultimo = byMsg || getUltimo(userIdTarget);

if (!ultimo) {
  await interaction.reply({ content: "⚠️ Nenhum histórico encontrado.", ephemeral: true });
  return true;
}

      const embed = new EmbedBuilder()
        .setTitle("📂 Último pedido de Set Staff")
        .setColor(ultimo.status === "aprovado" ? "#43B581" : ultimo.status === "reprovado" ? "#ED4245" : "#5865F2")
        .addFields(
          { name: "👤 Nome:", value: ultimo.nome || "—", inline: true },
          { name: "📁 Pasta:", value: ultimo.pasta || "—", inline: true },
          { name: "🪪 Passaporte:", value: ultimo.passaporte || "—", inline: true },
          { name: "🌆 Cidade:", value: fmtCidadeLabel(ultimo.cidade), inline: true },
          { name: "📊 Nível Staff:", value: fmtNivelLabel(ultimo.nivel), inline: true },
          { name: "📅 Data do pedido:", value: ultimo.dataHora || "—", inline: false },
          { name: "📌 Status:", value: `**${String(ultimo.status || "pendente").toUpperCase()}**`, inline: false }
        )
        .setFooter({ text: `ID do usuário: ${userIdTarget}` });

      await interaction.reply({ embeds: [embed], ephemeral: true });
      return true;
    }

    // ===========================================
    // (F) APROVAR / REPROVAR
    // ===========================================
    if (interaction.isButton() && (interaction.customId.startsWith("ss2_aprovar_") || interaction.customId.startsWith("ss2_reprovar_"))) {
      const acao = interaction.customId.startsWith("ss2_aprovar_") ? "aprovar" : "reprovar";
      const userIdTarget = interaction.customId.split("_")[2];

      // evita "This interaction failed"
      await interaction.deferUpdate().catch(() => {});

      if (!canApprove(interaction)) {
        await interaction.followUp({ content: "❌ Você não tem permissão pra aprovar/reprovar.", ephemeral: true }).catch(() => {});
        return true;
      }

      // ✅ pega o pedido pelo msgId da mensagem (sempre certo)
      let pedido = getByMsgId(interaction.message?.id) || getUltimo(userIdTarget);

      // 🚨 FALLBACK: Se não achou no JSON, tenta reconstruir lendo o Embed da mensagem
      if (!pedido && interaction.message?.embeds?.[0]) {
        pedido = reconstruirPedidoDoEmbed(interaction.message.embeds[0], userIdTarget);
        // Se reconstruiu com sucesso, salva no JSON pra não perder de novo
        if (pedido) {
           pedido.msgId = interaction.message.id;
           setByMsgId(interaction.message.id, pedido);
        }
      }

if (!pedido) {
  await interaction.followUp({ content: "⚠️ Pedido não encontrado no histórico.", ephemeral: true }).catch(() => {});
  return true;
}


      const membro = await interaction.guild.members.fetch(userIdTarget).catch(() => null);
      if (!membro) {
        await interaction.followUp({ content: "❌ Membro não encontrado no servidor.", ephemeral: true }).catch(() => {});
        return true;
      }

      const { cidade, nivel, nome, pasta, passaporte, dataHora } = pedido;

      const ehADM = [
  "adm",
  "responsaveis",
  "respstaff",
  "diretoria",
  "diretorcomunidade",
  "respadministrativo",
  "respwallstreet",
].includes(String(nivel).toLowerCase());

      const abrevCidade = ABREVIACOES_CIDADES[cidade] || String(cidade || "").toUpperCase();
      const finalNickname = ehADM ? `${abrevCidade} | ${nome}` : `${abrevCidade} | ${nome} | ${passaporte}`;

const decidedAt =
  Date.now();

const agora =
  new Date(
    decidedAt
  ).toLocaleString(
    "pt-BR",
    {
      timeZone:
        "America/Sao_Paulo",
    }
  );

let dmFalhou =
  false;

let extrasAplicados =
  [];

      if (acao === "aprovar") {
        const rolesParaAdd = [];

        if (CARGOS_CIDADES[cidade]) rolesParaAdd.push(CARGOS_CIDADES[cidade]);
        if (CARGOS_STAFF[nivel]) rolesParaAdd.push(CARGOS_STAFF[nivel]);

        // extras
        const extrasKeys = EXTRA_BY_LEVEL[nivel] || [];
        for (const k of extrasKeys) {
          const rid = CARGOS_STAFF[k];
          if (rid && !rolesParaAdd.includes(rid)) rolesParaAdd.push(rid);
        }

        // staff geral
        if (CFG.CARGO_STAFF_GERAL && !rolesParaAdd.includes(CFG.CARGO_STAFF_GERAL)) rolesParaAdd.push(CFG.CARGO_STAFF_GERAL);

        // aplica
        if (rolesParaAdd.length) await membro.roles.add(rolesParaAdd).catch(() => {});
        
        // ✅ Remove o cargo SEM WL automaticamente ao aprovar
        await membro.roles.remove(CFG.CARGO_SEM_WL).catch(() => {});

        await membro.setNickname(finalNickname).catch(() => {});

        // quais extras entraram
        extrasAplicados = [];
        for (const k of extrasKeys) {
          const rid = CARGOS_STAFF[k];
          if (rid && rolesParaAdd.includes(rid)) extrasAplicados.push(k);
        }

        await membro
          .send(
            `✅ Seu set foi aprovado!\n\n` +
              `**Cidade:** ${String(cidade).toUpperCase()}\n` +
              `**Nível:** ${fmtNivelLabel(nivel)}\n` +
              `**Novo nome:** ${finalNickname}\n\n` +
              `Seja bem-vindo à equipe Staff da Santa Group! 💜`
          )
          .catch(() => {
            dmFalhou = true;
          });

updateUltimoStatus(
  userIdTarget,
  "aprovado"
);

updateByMsgIdStatus(
  interaction.message?.id,
  "aprovado"
);

updateSetStaffDecision({
  userId:
    userIdTarget,

  msgId:
    interaction.message?.id,

  status:
    "aprovado",

  decision:
    "approved",

  decisionBy:
    interaction.user.id,

  decidedAt,
});

      } else {
        await membro
          .send(
            `❌ Seu pedido de set staff foi **reprovado**.\n` +
              `Motivo: Análise da equipe.\n\n` +
              `Caso tenha dúvidas, entre em contato com a liderança.`
          )
          .catch(() => {
            dmFalhou = true;
          });

updateUltimoStatus(
  userIdTarget,
  "reprovado"
);

updateByMsgIdStatus(
  interaction.message?.id,
  "reprovado"
);

updateSetStaffDecision({
  userId:
    userIdTarget,

  msgId:
    interaction.message?.id,

  status:
    "reprovado",

  decision:
    "rejected",

  decisionBy:
    interaction.user.id,

  decidedAt,
});

      }

      const extrasLabel = fmtExtrasLista(extrasAplicados);

      const embedFinal = new EmbedBuilder()
        .setTitle(`📋 Pedido de Set Staff ${acao === "aprovar" ? "Aprovado" : "Reprovado"}`)
        .setColor(acao === "aprovar" ? 0x00ff88 : 0xff5555)
        .setThumbnail(membro.displayAvatarURL())
        .addFields(
          { name: "👤 Nome:", value: nome || "—", inline: true },
          { name: "📁 Pasta:", value: pasta || "—", inline: true },
          { name: "🪪 Passaporte:", value: passaporte || "—", inline: true },
          { name: "🌆 Cidade:", value: fmtCidadeLabel(cidade), inline: true },
          { name: "📊 Nível Staff:", value: fmtNivelComMenção(nivel), inline: true },
          ...(acao === "aprovar" ? [{ name: "➕ Cargos extras adicionados:", value: extrasLabel, inline: false }] : []),
          { name: "🕒 Pedido feito em:", value: dataHora || "—", inline: false },
          {
            name: acao === "aprovar" ? "✅ Aprovado por:" : "❌ Reprovado por:",
            value: `<@${interaction.user.id}> em ${agora}`,
            inline: false,
          }
        )
        .setFooter({ text: `ID do usuário: ${userIdTarget}` });

      // edita a msg do registro (a própria interaction.message)
      await interaction.message
        .edit({ embeds: [embedFinal], components: [buildRowFinal(acao)] })
        .catch(() => {});

      // logzinho compact de extras (no próprio canal do registro)
      if (acao === "aprovar") {
        const canalRegistro = await resolveLogChannel(client, CFG.CANAL_REGISTRO);
        if (canalRegistro) {
          await canalRegistro
            .send({ content: `🧩 **Extras adicionados** para <@${userIdTarget}>: ${extrasLabel}`, allowedMentions: { parse: ["users"] } })
            .catch(() => {});
        }
      }

      // feedback
      ST.pedidosMap.delete(userIdTarget);

await interaction
  .followUp({
    content: `✔️ Pedido ${acao === "aprovar" ? "aprovado" : "reprovado"} com sucesso.${dmFalhou ? " (⚠️ DM não foi.)" : ""}`,
    ephemeral: true,
  })
  .catch(() => {});

return true;
    }

    return false;
  } catch (e) {
    console.error("[SETSTAFF_V2] HandleInteraction erro:", e);
    // tenta responder se ainda der
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.reply({ content: "⚠️ Deu erro ao processar o Set Staff.", ephemeral: true });
      }
    } catch {}
    return true;
  }
}
