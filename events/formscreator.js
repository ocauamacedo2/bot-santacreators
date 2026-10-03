// ./events/formscreator.js (ESM)

import fs from "fs";
import path from "path";
import os from "node:os";
import cron from "node-cron";
import { fileURLToPath } from "node:url";

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";

import {
  dashEmit
} from "../utils/dashHub.js";

import {
  sendBotDmLogged
} from "../utils/botDmLogger.js";

import {
  resolveDiscordIdentity,
  getDiscordIdentityFamily
} from "../shared/scDiscordIdentity.js";

// __dirname no ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =========================
// ✅ IMPORTS ADICIONAIS
// =========================
import { getWeeklyRanking } from "./scGeralWeeklyRanking.js";

import {
  getActiveEvolutionThreadId,
  initializeEvolutionHierarchy,
  syncEvolutionHierarchyForMember,
  migrateEvolutionHierarchyDiscordId,
  isHistoricalEvolutionThread,
  restoreHistoricalEvolutionThread,
  getEvolutionFeedbackContext,
  withActiveEvolutionThread,
} from "./evolutionHierarchy.js";

const GUILD_ID = "1262262852782129183";
const CREATOR_EQUIPE_ROLE_ID = "1352429001188180039";
const CREATOR_FORM_CHANNEL_ID = "1389401636446802042";
const CREATOR_FORM_BUTTON_CHANNEL_ID = "1389401636446802042";
const PUBLIC_REMINDER_CHANNEL_ID = "1389362249017327842";
const ALINHAMENTO_LOG_CHANNEL_ID = "1425256185707233301";
const LOG_CHANNEL_ID_V2 = "1486009731595112448"; // ✅ Novo canal de logs de status
const HIERARQUIA_LINK_1 =
  "https://discord.com/channels/755203021490749530/1430736372112560261";
const HIERARQUIA_LINK_2 =
  "https://discord.com/channels/1262262852782129183/1427082727600947230";

// =========================
// ROLES
// =========================
const ROLE_GESTOR = "1388975939161161728";
const ROLE_MKT_TICKET = "1282119104576098314";
const ROLE_RESP_LIDER = "1352407252216184833";
const ROLE_RESP_INFLU = "1262262852949905409";
const ROLE_COORD_CREATORS = "1388976314253312100";

const CREATOR_FORM_ALLOWED_ROLES = [
  ROLE_GESTOR,
  ROLE_MKT_TICKET,
  ROLE_RESP_LIDER,
  ROLE_RESP_INFLU,
  ROLE_COORD_CREATORS,
  "1262262852949905408", // Owner
  "660311795327828008", // Você
];

const CREATOR_FORM_NOTIFY_ROLES = [
  ROLE_GESTOR,
  ROLE_MKT_TICKET,
  ROLE_RESP_LIDER,
  ROLE_RESP_INFLU,
  ROLE_COORD_CREATORS,
];

// ✅ Permissões para Ligar/Desligar/Reverter
const MANAGE_PERMS_ROLES = [
  "1388976314253312100", // coord.
  "1352407252216184833", // resp lider
  "1388975939161161728", // gestor
  "1352408327983861844", // resp creators
  "1262262852949905409", // resp influ
];
const MANAGE_PERMS_USERS = [
  "660311795327828008", // eu
  "1262262852949905408", // owner
];

// Cargos que mudam a fase ativa da Evolução.
const EVOLUTION_PROFILE_ROLE_IDS = new Set([
  // Equipe
  "1352429001188180039",
  "1392678638176043029",
  "1387253972661964840",

  // Gestão / Coordenação
  "1352385500614234134",
  "1388976155830255697",
  "1388976094920704141",
  "1388975939161161728",
  "1388976314253312100",

  // Responsáveis
  "1414651836861907006",
  "1352407252216184833",
  "1262262852949905409",
  "1352408327983861844",
]);

// ✅ Cargos para IGNORAR no ranking/cobrança de feedback
const EXCLUDE_FEEDBACK_ROLES = [
  "1262262852949905408", // owner
  "1352408327983861844", // resp creators
  "1262262852949905409", // resp influ
  "1352407252216184833", // resp lider
  "1388976314253312100", // coord. creators
];

// ✅ Usuários para IGNORAR no ranking/cobrança de feedback
const EXCLUDE_FEEDBACK_USERS = [
  "660311795327828008", // eu
];

// ✅ Cargos que recebem lembrete no PV (dia alternado ao público)
const DM_REMINDER_ROLES = [
  "1388976314253312100", // coord.
  "1352407252216184833", // resp lider
  "1388975939161161728", // gestor
  "1352408327983861844", // resp creators
  "1262262852949905409", // resp influ
];

// ✅ Cargo alvo dos feedbacks
const ROLE_GESTAOINFLUENCER = "1371733765243670538";

// ✅ Cargo OBRIGATÓRIO para estar ativo no projeto
const ROLE_REQUIRED_FOR_ACTIVE = "1352275728476930099";

// =========================
// PERSISTÊNCIA
// =========================
function canWriteDirectory(
  dir
) {
  if (!dir) {
    return false;
  }

  try {
    fs.mkdirSync(
      dir,
      {
        recursive:
          true,
      }
    );

    fs.accessSync(
      dir,
      fs.constants.R_OK |
      fs.constants.W_OK
    );

    const probeFile =
      path.join(
        dir,
        `.formscreator-write-test-${process.pid}-${Date.now()}.tmp`
      );

    fs.writeFileSync(
      probeFile,
      "ok",
      "utf8"
    );

    fs.unlinkSync(
      probeFile
    );

    return true;
  } catch {
    return false;
  }
}

function pickPersistDataDir() {
  const squareStorage =
    process.env
      .SQUARECLOUD_STORAGE_PATH
      ?.trim();

  const genericStorage =
    process.env
      .STORAGE_PATH
      ?.trim();

  // =====================================================
  // SQUARE CLOUD — STORAGE PERSISTENTE
  // =====================================================
  //
  // Na Square Cloud, /application pode ficar somente leitura.
  //
  // O próprio projeto já utiliza /application/storage para
  // arquivos persistentes, então ele recebe prioridade.
  //
  // No Windows/local esse caminho não é criado por engano.
  // =====================================================

  const applicationStorageData =
    (
      process.platform !==
        "win32" &&
      fs.existsSync(
        "/application/storage"
      )
    )
      ? "/application/storage/data"
      : null;

  const candidates = [
    applicationStorageData,

    squareStorage
      ? path.resolve(
          squareStorage,
          "data"
        )
      : null,

    genericStorage
      ? path.resolve(
          genericStorage,
          "data"
        )
      : null,

    "/storage/data",

    "/home/container/storage/data",

    "/home/squarecloud/storage/data",

    // Ambiente local / projeto gravável.
    path.resolve(
      __dirname,
      "..",
      "data"
    ),

    // Último fallback para impedir o Forms de quebrar.
    path.resolve(
      os.tmpdir(),
      "santacreators",
      "data"
    ),
  ].filter(
    Boolean
  );

  for (
    const dir
    of candidates
  ) {
    if (
      canWriteDirectory(
        dir
      )
    ) {
      return dir;
    }
  }

  throw new Error(
    "[FormsCreator] Nenhum diretório gravável foi encontrado para persistência."
  );
}

const DATA_DIR =
  pickPersistDataDir();

console.log(
  `[FormsCreator] Persistência ativa em: ${DATA_DIR}`
);

const LEGACY_DATA_DIR =
  path.resolve(
    __dirname,
    "..",
    "data"
  );

const STATE_FILE =
  path.join(
    DATA_DIR,
    "formscreator_state.json"
  );


// =====================================================
// 🎫 HISTÓRICO DOS TICKETS PESSOAIS
// =====================================================
//
// Mantém um histórico estruturado e limitado das mensagens
// dos tickets pessoais vinculados ao Controle GI.
//
// Não armazena bytes de imagens/vídeos.
// Guarda somente metadados, texto, links e resumos produzidos
// pela própria IA, evitando crescimento infinito do arquivo.
// =====================================================

const PERSONAL_TICKET_HISTORY_FILE =
  path.join(
    DATA_DIR,
    "formscreator_personal_ticket_history.json"
  );

// =====================================================
// MIGRAÇÃO DO STATE ANTIGO
// =====================================================
//
// Se o arquivo antigo existir em /application/data,
// mas o diretório tiver virado somente leitura,
// copiamos os dados para o novo destino gravável.
//
// Nada é apagado do local antigo.
// =====================================================

function migrateLegacyFormsCreatorFile(
  fileName
) {
  if (
    DATA_DIR ===
    LEGACY_DATA_DIR
  ) {
    return;
  }

  const source =
    path.join(
      LEGACY_DATA_DIR,
      fileName
    );

  const target =
    path.join(
      DATA_DIR,
      fileName
    );

  if (
    !fs.existsSync(
      source
    ) ||
    fs.existsSync(
      target
    )
  ) {
    return;
  }

  try {
    fs.copyFileSync(
      source,
      target
    );

    console.log(
      `[FormsCreator] Estado legado migrado para diretório gravável: ${fileName}`
    );
  } catch (error) {
    console.warn(
      `[FormsCreator] Não foi possível migrar ${fileName}:`,
      error?.message ||
      error
    );
  }
}

migrateLegacyFormsCreatorFile(
  "formscreator_state.json"
);

migrateLegacyFormsCreatorFile(
  "formscreator_personal_ticket_history.json"
);

const PERSONAL_TICKET_HISTORY_RETENTION_MS =
  180 *
  24 *
  60 *
  60 *
  1000;

const PERSONAL_TICKET_HISTORY_MAX_PER_USER =
  400;

function readPersonalTicketHistoryState() {
  ensureDataDir();

  if (
    !fs.existsSync(
      PERSONAL_TICKET_HISTORY_FILE
    )
  ) {
    return {
      version:
        1,

      users:
        {},
    };
  }

  try {
    const parsed =
      JSON.parse(
        fs.readFileSync(
          PERSONAL_TICKET_HISTORY_FILE,
          "utf8"
        ) ||
        "{}"
      );

    return {
      version:
        1,

      users:
        (
          parsed?.users &&
          typeof parsed.users ===
            "object"
        )
          ? parsed.users
          : {},
    };
  } catch (error) {
    console.warn(
      "[FormsCreator] Falha ao ler histórico dos tickets pessoais:",
      error?.message || error
    );

    return {
      version:
        1,

      users:
        {},
    };
  }
}

function writePersonalTicketHistoryState(
  state
) {
  try {
    ensureDataDir();

    const temporaryFile =
      `${PERSONAL_TICKET_HISTORY_FILE}.${process.pid}.${Date.now()}.tmp`;

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
      PERSONAL_TICKET_HISTORY_FILE
    );
  } catch (error) {
    console.error(
      "[FormsCreator] Falha ao salvar histórico dos tickets pessoais:",
      error?.message || error
    );
  }
}

// =====================================================
// MIGRA HISTÓRICO DO TICKET PESSOAL ENTRE DISCORDS
// =====================================================

function migratePersonalTicketHistoryDiscordId(
  oldUserId,
  newUserId
) {
  const oldId =
    String(
      oldUserId || ""
    ).trim();

  const newId =
    String(
      newUserId || ""
    ).trim();

  if (
    !oldId ||
    !newId ||
    oldId === newId
  ) {
    return {
      changed:
        false,

      moved:
        0,
    };
  }

  const state =
    readPersonalTicketHistoryState();

  const oldRows =
    Array.isArray(
      state.users?.[
        oldId
      ]
    )
      ? state.users[
          oldId
        ]
      : [];

  const newRows =
    Array.isArray(
      state.users?.[
        newId
      ]
    )
      ? state.users[
          newId
        ]
      : [];

  if (
    oldRows.length === 0
  ) {
    return {
      changed:
        false,

      moved:
        0,
    };
  }

  const merged =
    new Map();

  for (
    const item
    of [
      ...oldRows,
      ...newRows
    ]
  ) {
    const dedupeKey =
      String(
        item?.dedupeKey ||
        `${item?.messageId || "sem-id"}:${item?.type || "message"}`
      );

    merged.set(
      dedupeKey,
      {
        ...item,

        userId:
          newId,
      }
    );
  }

  const rows =
    [
      ...merged.values()
    ]
      .sort(
        (a, b) =>
          Number(
            a?.createdAtMs ||
            0
          ) -
          Number(
            b?.createdAtMs ||
            0
          )
      )
      .slice(
        -PERSONAL_TICKET_HISTORY_MAX_PER_USER
      );

  state.users[
    newId
  ] =
    rows;

  delete state.users[
    oldId
  ];

  writePersonalTicketHistoryState(
    state
  );

  return {
    changed:
      true,

    moved:
      oldRows.length,

    total:
      rows.length,
  };
}

function sanitizePersonalTicketAttachments(
  attachments
) {
  return (
    Array.isArray(
      attachments
    )
      ? attachments
      : []
  )
    .slice(
      0,
      8
    )
    .map(
      item => ({
        name:
          String(
            item?.name ||
            "arquivo"
          ).slice(
            0,
            180
          ),

        url:
          String(
            item?.url ||
            ""
          ).slice(
            0,
            1000
          ),

        contentType:
          String(
            item?.contentType ||
            ""
          ).slice(
            0,
            120
          ),

        size:
          Math.max(
            0,
            Number(
              item?.size ||
              0
            )
          ),
      })
    );
}

export function recordPersonalTicketActivity({
  userId,
  guildId = null,
  channelId,
  messageId,
  authorId,
  authorName = null,
  relation = null,
  evidenceKind = null,
  type = "message",
  content = "",
  summary = "",
  attachments = [],
  createdAtMs = Date.now(),
  messageUrl = null,
} = {}) {
  const rawTargetUserId =
    String(
      userId ||
      ""
    ).trim();

  const targetUserId =
    resolveDiscordIdentity(
      rawTargetUserId
    ) ||
    rawTargetUserId;

  const normalizedMessageId =
    String(
      messageId ||
      ""
    ).trim();

  if (
    !targetUserId ||
    !channelId ||
    !normalizedMessageId
  ) {
    return null;
  }

  const state =
    readPersonalTicketHistoryState();

  const current =
    Array.isArray(
      state.users[
        targetUserId
      ]
    )
      ? state.users[
          targetUserId
        ]
      : [];

  const dedupeKey =
    `${normalizedMessageId}:${String(type || "message")}`;

  const alreadyExists =
    current.some(
      item =>
        item?.dedupeKey ===
        dedupeKey
    );

  if (alreadyExists) {
    return null;
  }

  const record = {
    dedupeKey,

    userId:
      targetUserId,

    guildId:
      guildId
        ? String(
            guildId
          )
        : null,

    channelId:
      String(
        channelId
      ),

    messageId:
      normalizedMessageId,

    authorId:
      authorId
        ? String(
            authorId
          )
        : null,

    authorName:
      authorName
        ? String(
            authorName
          ).slice(
            0,
            150
          )
        : null,

    relation:
      relation
        ? String(
            relation
          ).slice(
            0,
            40
          )
        : null,

    evidenceKind:
      evidenceKind
        ? String(
            evidenceKind
          ).slice(
            0,
            60
          )
        : null,

    type:
      String(
        type ||
        "message"
      ).slice(
        0,
        50
      ),

    content:
      String(
        content ||
        ""
      )
        .trim()
        .slice(
          0,
          type === "forms_feedback" || type === "ai_forms_followup"
            ? 16000
            : 2200
        ),

    summary:
      String(
        summary ||
        ""
      )
        .trim()
        .slice(
          0,
          3000
        ),

    attachments:
      sanitizePersonalTicketAttachments(
        attachments
      ),

    createdAtMs:
      Number(
        createdAtMs ||
        Date.now()
      ),

    messageUrl:
      messageUrl
        ? String(
            messageUrl
          ).slice(
            0,
            1000
          )
        : null,
  };

  const cutoff =
    Date.now() -
    PERSONAL_TICKET_HISTORY_RETENTION_MS;

  const next = [
    ...current,
    record,
  ]
    .filter(
      item =>
        Number(
          item?.createdAtMs ||
          0
        ) >=
        cutoff
    )
    .sort(
      (a, b) =>
        Number(
          a?.createdAtMs ||
          0
        ) -
        Number(
          b?.createdAtMs ||
          0
        )
    )
    .slice(
      -PERSONAL_TICKET_HISTORY_MAX_PER_USER
    );

  state.users[
    targetUserId
  ] =
    next;

  writePersonalTicketHistoryState(
    state
  );

  return record;
}

// =====================================================
// 🎫 ATENDIMENTOS DE TICKETS FEITOS PARA TERCEIROS
// =====================================================
//
// IMPORTANTE:
//
// Isto NÃO representa o ticket pessoal do membro.
//
// Aqui entram somente tickets abertos por OUTRAS pessoas
// nos quais esse membro atuou como:
//
// - atendente principal;
// - apoio;
// - fechador;
// - fechador sem participação anterior.
//
// Dessa forma o ticket pessoal da própria pessoa nunca
// entra como avaliação operacional do atendimento dela.
// =====================================================

export function recordServiceTicketOperationalActivity({
  staffUserId,
  guildId = null,
  channelId,
  ticketType = "SEM TIPO",

  openerId = null,
  closerId = null,
  primaryAttendantId = null,

  participantRole = "participante",

  authorityLevel = null,
  authorityLabel = null,

  messageCount = 0,
  firstMessageAt = null,
  lastMessageAt = null,
  individualFirstResponseMs = null,

  higherSupportIds = [],

  humanConclusion = "",
  autoReasonType = null,
  waitingOn = null,

  openedAt = null,
  closedAt = Date.now(),

  participantExcerpt = "",
  conversationExcerpt = "",

  operationalRecord = null,
} = {}) {
  const rawStaffUserId =
    String(
      staffUserId ||
      ""
    ).trim();

  const targetUserId =
    resolveDiscordIdentity(
      rawStaffUserId
    ) ||
    rawStaffUserId;

  const normalizedChannelId =
    String(
      channelId ||
      ""
    ).trim();

  const normalizedOpenerId =
    openerId
      ? String(
          openerId
        ).trim()
      : null;

  // =====================================================
  // TRAVA PRINCIPAL
  // =====================================================
  //
  // Nunca transformar o próprio ticket da pessoa em
  // atendimento realizado por ela.
  // =====================================================

  if (
    !targetUserId ||
    !normalizedChannelId ||
    (
      normalizedOpenerId &&
      targetUserId ===
        normalizedOpenerId
    )
  ) {
    return null;
  }

  const state =
    readPersonalTicketHistoryState();

  const current =
    Array.isArray(
      state.users[
        targetUserId
      ]
    )
      ? state.users[
          targetUserId
        ]
      : [];

  const dedupeKey =
    `service_ticket:${normalizedChannelId}`;

  const previous =
    current.find(
      item =>
        item?.dedupeKey ===
        dedupeKey
    ) ||
    null;

  const safeNumber =
    value => {
      if (
        value === null ||
        value === undefined ||
        value === ""
      ) {
        return null;
      }

      const parsed =
        Number(
          value
        );

      return Number.isFinite(
        parsed
      )
        ? parsed
        : null;
    };

  // =====================================================
  // RESULTADO DA ANÁLISE OPERACIONAL
  // =====================================================

  const evaluation = {
    resolved:
      operationalRecord
        ?.evaluation
        ?.resolved ||
      "inconclusivo",

    teamPerformance:
      operationalRecord
        ?.evaluation
        ?.teamPerformance ||
      "nao_classificado",

    whoSolved:
      operationalRecord
        ?.evaluation
        ?.whoSolved ||
      "nao_identificado",

    summaryShort:
      String(
        operationalRecord
          ?.evaluation
          ?.summaryShort ||
        ""
      )
        .trim()
        .slice(
          0,
          3500
        ),

    closingContext:
      String(
        operationalRecord
          ?.evaluation
          ?.closingContext ||
        ""
      )
        .trim()
        .slice(
          0,
          3500
        ),

    confidence:
      safeNumber(
        operationalRecord
          ?.evaluation
          ?.confidence
      ),
  };

  const serviceTicket = {
    ticketType:
      String(
        ticketType ||
        "SEM TIPO"
      )
        .trim()
        .slice(
          0,
          80
        ),

    openerId:
      normalizedOpenerId,

    closerId:
      closerId
        ? String(
            closerId
          ).trim()
        : null,

    primaryAttendantId:
      primaryAttendantId
        ? String(
            primaryAttendantId
          ).trim()
        : null,

    participantRole:
      String(
        participantRole ||
        "participante"
      )
        .trim()
        .slice(
          0,
          80
        ),

    authorityLevel:
      safeNumber(
        authorityLevel
      ),

    authorityLabel:
      authorityLabel
        ? String(
            authorityLabel
          )
            .trim()
            .slice(
              0,
              120
            )
        : null,

    messageCount:
      Math.max(
        0,
        Number(
          messageCount ||
          0
        )
      ),

    firstMessageAt:
      safeNumber(
        firstMessageAt
      ),

    lastMessageAt:
      safeNumber(
        lastMessageAt
      ),

    individualFirstResponseMs:
      safeNumber(
        individualFirstResponseMs
      ),

    higherSupportIds:
      [
        ...new Set(
          (
            Array.isArray(
              higherSupportIds
            )
              ? higherSupportIds
              : []
          )
            .map(
              value =>
                String(
                  value ||
                  ""
                ).trim()
            )
            .filter(
              Boolean
            )
        )
      ].slice(
        0,
        20
      ),

    openedAt:
      safeNumber(
        openedAt
      ),

    closedAt:
      safeNumber(
        closedAt
      ) ||
      Date.now(),

    totalOpenMs:
      safeNumber(
        operationalRecord
          ?.metrics
          ?.totalOpenMs
      ),

    globalFirstHumanResponseMs:
      safeNumber(
        operationalRecord
          ?.metrics
          ?.firstHumanResponseMs
      ),

    waitingOn:
      waitingOn
        ? String(
            waitingOn
          ).slice(
            0,
            40
          )
        : operationalRecord
            ?.metrics
            ?.waitingOn
          ? String(
              operationalRecord
                .metrics
                .waitingOn
            ).slice(
              0,
              40
            )
          : null,

    autoReasonType:
      autoReasonType
        ? String(
            autoReasonType
          ).slice(
            0,
            60
          )
        : null,

    humanConclusion:
      String(
        humanConclusion ||
        ""
      )
        .trim()
        .slice(
          0,
          5000
        ),

    participantExcerpt:
      String(
        participantExcerpt ||
        ""
      )
        .trim()
        .slice(
          0,
          9000
        ),

    conversationExcerpt:
      String(
        conversationExcerpt ||
        ""
      )
        .trim()
        .slice(
          0,
          14000
        ),

    evaluation,

    // =====================================================
    // FEEDBACK DE QUEM ABRIU O TICKET
    // =====================================================
    //
    // Preserva caso o registro seja regravado depois.
    // =====================================================

    userFeedback:
      previous
        ?.serviceTicket
        ?.userFeedback ||
      null,

    userFeedbackBy:
      previous
        ?.serviceTicket
        ?.userFeedbackBy ||
      null,

    userFeedbackAt:
      previous
        ?.serviceTicket
        ?.userFeedbackAt ||
      null,
  };

  const summaryParts = [
    `Ticket ${serviceTicket.ticketType}`,

    `papel=${serviceTicket.participantRole}`,

    `mensagens=${serviceTicket.messageCount}`,

    serviceTicket
      .evaluation
      ?.resolved
        ? `resultado=${serviceTicket.evaluation.resolved}`
        : "",

    serviceTicket
      .evaluation
      ?.teamPerformance
        ? `qualidade=${serviceTicket.evaluation.teamPerformance}`
        : "",
  ]
    .filter(
      Boolean
    );

  const nextRecord = {
    dedupeKey,

    userId:
      targetUserId,

    guildId:
      guildId
        ? String(
            guildId
          )
        : null,

    channelId:
      normalizedChannelId,

    messageId:
      `service-ticket-${normalizedChannelId}`,

    authorId:
      targetUserId,

    authorName:
      null,

    relation:
      "atendimento_terceiro",

    evidenceKind:
      "ticket_operacional",

    type:
      "service_ticket_operational",

    content:
      evaluation
        .summaryShort ||
      serviceTicket
        .humanConclusion ||
      summaryParts.join(
        " | "
      ),

    summary:
      summaryParts.join(
        " | "
      ),

    attachments:
      [],

    createdAtMs:
      serviceTicket.closedAt,

    messageUrl:
      null,

    serviceTicket,
  };

  const next =
    [
      ...current.filter(
        item =>
          item?.dedupeKey !==
          dedupeKey
      ),

      nextRecord,
    ]
      .filter(
        item =>
          Number(
            item?.createdAtMs ||
            0
          ) >=
          (
            Date.now() -
            PERSONAL_TICKET_HISTORY_RETENTION_MS
          )
      )
      .sort(
        (a, b) =>
          Number(
            a?.createdAtMs ||
            0
          ) -
          Number(
            b?.createdAtMs ||
            0
          )
      )
      .slice(
        -PERSONAL_TICKET_HISTORY_MAX_PER_USER
      );

  state.users[
    targetUserId
  ] =
    next;

  writePersonalTicketHistoryState(
    state
  );

  return nextRecord;
}

// =====================================================
// FEEDBACK DE QUEM ABRIU O TICKET
// =====================================================
//
// Quando o cidadão clicar:
//
// ✅ Resolvido
// 🟡 Em parte
// ❌ Não resolveu
//
// o feedback é anexado ao atendimento de TODOS os
// membros que participaram daquele ticket.
//
// Isso NÃO transforma automaticamente "não resolveu"
// em culpa do Creator. A interpretação será feita depois
// levando em consideração conversa, abandono e fechamento.
// =====================================================

export function applyServiceTicketUserFeedback({
  channelId,
  openerId,
  feedback,
  feedbackAt = Date.now(),
} = {}) {
  const normalizedChannelId =
    String(
      channelId ||
      ""
    ).trim();

  const normalizedFeedback =
    String(
      feedback ||
      ""
    ).trim();

  const allowedFeedbacks =
    new Set([
      "resolvido",
      "parcial",
      "nao_resolvido",
    ]);

  if (
    !normalizedChannelId ||
    !allowedFeedbacks.has(
      normalizedFeedback
    )
  ) {
    return {
      ok:
        false,

      updated:
        0,
    };
  }

  const state =
    readPersonalTicketHistoryState();

  let updated =
    0;

  for (
    const [
      storedUserId,
      rows
    ]
    of Object.entries(
      state.users ||
      {}
    )
  ) {
    if (
      !Array.isArray(
        rows
      )
    ) {
      continue;
    }

    let changed =
      false;

    const nextRows =
      rows.map(
        item => {
          if (
            item?.type !==
              "service_ticket_operational" ||
            String(
              item?.channelId ||
              ""
            ) !==
              normalizedChannelId
          ) {
            return item;
          }

          changed =
            true;

          updated++;

          return {
            ...item,

            userId:
              String(
                storedUserId
              ),

            serviceTicket: {
              ...(
                item
                  ?.serviceTicket ||
                {}
              ),

              userFeedback:
                normalizedFeedback,

              userFeedbackBy:
                openerId
                  ? String(
                      openerId
                    )
                  : null,

              userFeedbackAt:
                Number(
                  feedbackAt ||
                  Date.now()
                ),
            },
          };
        }
      );

    if (
      changed
    ) {
      state.users[
        storedUserId
      ] =
        nextRows;
    }
  }

  if (
    updated >
    0
  ) {
    writePersonalTicketHistoryState(
      state
    );
  }

  return {
    ok:
      true,

    updated,
  };
}

// =====================================================
// BUSCA SOMENTE ATENDIMENTOS FEITOS PARA OUTRAS PESSOAS
// =====================================================

export function getServiceTicketOperationalHistoryForUser(
  userId,
  {
    sinceMs = 0,
    untilMs = Number.POSITIVE_INFINITY,
    limit = 80,
  } = {}
) {
  return getPersonalTicketHistoryForUser(
    userId,
    {
      sinceMs,
      untilMs,

      limit:
        PERSONAL_TICKET_HISTORY_MAX_PER_USER,

      includeAi:
        true,

      includeServiceTickets:
        true,
    }
  )
    .filter(
      item =>
        item?.type ===
          "service_ticket_operational" &&
        item?.relation ===
          "atendimento_terceiro"
    )
    .slice(
      -Math.max(
        1,
        Number(
          limit ||
          80
        )
      )
    );
}

export function getPersonalTicketHistoryForUser(
  userId,
  {
    sinceMs = 0,
    untilMs = Number.POSITIVE_INFINITY,
    limit = 120,
    includeAi = true,
    includeServiceTickets = false,
  } = {}
) {
  const rawTargetUserId =
    String(
      userId ||
      ""
    ).trim();

  if (!rawTargetUserId) {
    return [];
  }

  const targetUserId =
    resolveDiscordIdentity(
      rawTargetUserId
    ) ||
    rawTargetUserId;

  const identityIds =
    new Set([
      rawTargetUserId,
      targetUserId,
      ...(
        typeof getDiscordIdentityFamily ===
          "function"
          ? getDiscordIdentityFamily(
              targetUserId
            )
          : []
      )
    ]);

  const state =
    readPersonalTicketHistoryState();

  const mergedRows =
    new Map();

  for (
    const identityId
    of identityIds
  ) {
    const sourceRows =
      Array.isArray(
        state.users?.[
          identityId
        ]
      )
        ? state.users[
            identityId
          ]
        : [];

    for (
      const item
      of sourceRows
    ) {
      const dedupeKey =
        String(
          item?.dedupeKey ||
          `${item?.messageId || "sem-id"}:${item?.type || "message"}`
        );

      if (
        !mergedRows.has(
          dedupeKey
        )
      ) {
        mergedRows.set(
          dedupeKey,
          item
        );
      }
    }
  }

  const rows =
    [
      ...mergedRows.values()
    ];

  return rows
    .filter(
      item => {
        const createdAt =
          Number(
            item?.createdAtMs ||
            0
          );

        if (
          createdAt <
            Number(
              sinceMs ||
              0
            ) ||
          createdAt >
            Number(
              untilMs
            )
        ) {
          return false;
        }

        if (
          includeAi !== true &&
          (
            String(item?.type || "").startsWith("ai_") ||
            item?.relation === "ia_santacreators"
          )
        ) {
          return false;
        }

        // =====================================================
        // SEPARA TICKET PESSOAL DE ATENDIMENTO A TERCEIROS
        // =====================================================
        //
        // Por padrão, o histórico pessoal NÃO deve devolver
        // registros de tickets que a pessoa atendeu.
        //
        // O getter específico de atendimentos habilita isso
        // explicitamente com includeServiceTickets: true.
        // =====================================================

        if (
          includeServiceTickets !== true &&
          item?.type ===
            "service_ticket_operational"
        ) {
          return false;
        }

        return true;
      }
    )
    .sort(
      (a, b) =>
        Number(
          a?.createdAtMs ||
          0
        ) -
        Number(
          b?.createdAtMs ||
          0
        )
    )
    .slice(
      -Math.max(
        1,
        Number(
          limit ||
          120
        )
      )
    );
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readState() {
  ensureDataDir();
  if (!fs.existsSync(STATE_FILE)) {
    return {
      buttonMessageId: null,
      buttonChannelId: CREATOR_FORM_BUTTON_CHANNEL_ID,
      lastPublicReminderAt: null,
      registrations: {}, // ✅ Para salvar status (ativo/inativo)
    };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    const state = {
      buttonMessageId: null,
      buttonChannelId: CREATOR_FORM_BUTTON_CHANNEL_ID,
      lastPublicReminderAt: null,
      registrations: {},
      ...parsed,
    };
    if (!state.registrations) state.registrations = {};
    return state;
  } catch {
    return {
      buttonMessageId: null,
      buttonChannelId: CREATOR_FORM_BUTTON_CHANNEL_ID,
      lastPublicReminderAt: null,
      registrations: {},
    };
  }
}

function writeState(state) {
  try {
    ensureDataDir();

    const tmp =
      `${STATE_FILE}.${process.pid}.${Date.now()}.tmp`;

    fs.writeFileSync(
      tmp,
      JSON.stringify(
        state,
        null,
        2
      ),
      "utf8"
    );

    fs.renameSync(
      tmp,
      STATE_FILE
    );
  } catch (e) {
    console.error(
      "[FormsCreator] ❌ Falha crítica ao salvar state:",
      {
        path:
          STATE_FILE,

        error:
          e.message,

        code:
          e.code,
      }
    );
  }
}

// =========================
// LOCK (ANTI-RACE)
// =========================
let ensureButtonRunning = Promise.resolve();

function runWithEnsureLock(fn) {
  ensureButtonRunning = ensureButtonRunning.then(fn).catch((e) => {
    console.error("❌ FormsCreator ensureButton lock error:", e);
  });
  return ensureButtonRunning;
}

// =====================================================
// 🔒 LOCK DE CRIAÇÃO POR USUÁRIO
// =====================================================
//
// Impede que dois formulários/processos criem tópicos
// simultaneamente para a mesma pessoa.
//
// A segunda tentativa espera a primeira terminar.
// Depois disso, ela encontra o tópico já existente
// e a criação é recusada normalmente.
// =====================================================

const formsCreatorUserCreateLocks = new Map();

async function runWithFormsCreatorUserCreateLock(
  userId,
  fn
) {
  const key = String(userId || "").trim();

  if (!key) {
    return await fn();
  }

  const previous =
    formsCreatorUserCreateLocks.get(key) ||
    Promise.resolve();

  let releaseCurrent =
    () => {};

  const gate = new Promise((resolve) => {
    releaseCurrent =
      () => resolve();
  });

  const current =
    previous.then(() => gate);

  formsCreatorUserCreateLocks.set(
    key,
    current
  );

  await previous;

  try {
    return await fn();
  } finally {
    releaseCurrent();

    if (
      formsCreatorUserCreateLocks.get(key) ===
      current
    ) {
      formsCreatorUserCreateLocks.delete(key);
    }
  }
}

// =========================
// HELPERS
// =========================
function hasPermission(member, userId) {
  const roles = member?.roles?.cache;
  const byRole = roles?.some((role) => CREATOR_FORM_ALLOWED_ROLES.includes(role.id));
  const byUser = CREATOR_FORM_ALLOWED_ROLES.includes(userId);
  return Boolean(byRole || byUser);
}

// =====================================================
// 🪞 IDENTIFICA ESPELHOS DO FORMSCREATOR
// =====================================================
//
// IMPORTANTE:
//
// Um espelho possui praticamente os mesmos campos
// do registro original.
//
// Sem esta trava, uma varredura pode interpretar
// o espelho como se fosse um Forms original.
// =====================================================

function isFormsCreatorMirrorEmbed(embed) {
  const footerText =
    String(
      embed?.footer?.text ||
      ""
    ).trim();

  return (
    footerText.startsWith(
      "SC_FORMS_ACTIVE_CARD:"
    ) ||
    footerText.startsWith(
      "SC_FORMS_AREA:"
    )
  );
}

// =====================================================
// TÓPICO ÚNICO: FORMSCREATOR + EVOLUÇÃO/GI
// =====================================================

async function resolveFormsCreatorCanonicalTopic(
  client,
  {
    guildId,
    userId,
    channel,
    topicName,
    reason,
    skipEvolutionLookup = false,
  }
) {
  let activeEvolutionThreadId =
    null;

  if (
    skipEvolutionLookup !==
    true
  ) {
    activeEvolutionThreadId =
      await getActiveEvolutionThreadId(
        client,
        userId,
        {
          guildId,
          originalThreadId: null,
          reason:
            "FormsCreator verificando tópico ativo antes da criação",
        }
      ).catch(() => null);
  }

  if (activeEvolutionThreadId) {
    const activeEvolutionThread =
      await client.channels
        .fetch(activeEvolutionThreadId)
        .catch(() => null);

    if (
      activeEvolutionThread?.isThread?.() &&
      activeEvolutionThread.parentId ===
        CREATOR_FORM_CHANNEL_ID
    ) {
      if (activeEvolutionThread.archived) {
        await activeEvolutionThread
          .setArchived(false)
          .catch(() => {});
      }

      return activeEvolutionThread;
    }
  }

  return await channel.threads
    .create({
      name: topicName,
      autoArchiveDuration: 1440,
      reason,
    })
    .catch(() => null);
}
async function consolidateFormsCreatorDuplicateThreadForUser(
  client,
  userId
) {
  const targetUserId =
    String(userId || "").trim();

  if (!targetUserId) {
    return false;
  }

  const formsThreadId =
    await findOriginalFormsCreatorThreadIdByUserId(
      client,
      targetUserId
    ).catch(() => null);

  if (!formsThreadId) {
    return false;
  }

  const evolutionThreadId =
    await getActiveEvolutionThreadId(
      client,
      targetUserId,
      {
        guildId:
          GUILD_ID,

        originalThreadId:
          formsThreadId,

        reason:
          "Conferindo duplicidade FormsCreator x Evolução",
      }
    ).catch(() => null);

  if (
    !evolutionThreadId ||
    evolutionThreadId ===
      formsThreadId
  ) {
    return false;
  }

  const formsThread =
    await client.channels
      .fetch(
        formsThreadId
      )
      .catch(() => null);

  const evolutionThread =
    await client.channels
      .fetch(
        evolutionThreadId
      )
      .catch(() => null);

  if (
    !formsThread?.isThread?.() ||
    !evolutionThread?.isThread?.() ||
    formsThread.parentId !==
      CREATOR_FORM_CHANNEL_ID ||
    evolutionThread.parentId !==
      CREATOR_FORM_CHANNEL_ID
  ) {
    return false;
  }

  /*
   * O bug cria primeiro o tópico da Evolução/GI
   * e depois cria o Forms separado.
   *
   * Só automatizamos a remoção nesse sentido.
   */

  if (
    Number(
      formsThread.createdTimestamp ||
      0
    ) <
    Number(
      evolutionThread.createdTimestamp ||
      0
    )
  ) {
    return false;
  }

  const state =
    readState();

  const registration =
    state.registrations?.[
      formsThreadId
    ];

  if (!registration) {
    return false;
  }

  let sourceMessage =
    registration.messageId
      ? await formsThread.messages
          .fetch(
            registration.messageId
          )
          .catch(() => null)
      : null;

  if (
    !sourceMessage ||
    !isFormsCreatorMainRegisterMessage(
      sourceMessage,
      client
    )
  ) {
    const messages =
      await formsThread.messages
        .fetch({
          limit: 100,
        })
        .catch(() => null);

    sourceMessage =
      messages?.find(
        (message) =>
          isFormsCreatorMainRegisterMessage(
            message,
            client
          )
      ) ||
      null;
  }

  if (
    !sourceMessage?.embeds?.[0]
  ) {
    return false;
  }

  const duplicateMessages =
    await formsThread.messages
      .fetch({
        limit: 100,
      })
      .catch(() => null);

  /*
   * SEGURANÇA:
   *
   * Se alguém já escreveu manualmente
   * nesse tópico duplicado, não apagamos.
   */

  if (
    !duplicateMessages ||
    duplicateMessages.some(
      (message) =>
        message.author?.id !==
        client.user?.id
    )
  ) {
    console.warn(
      `[FormsCreator] Duplicado ${formsThreadId} não foi apagado porque possui mensagem humana.`
    );

    return false;
  }

  if (
    evolutionThread.archived
  ) {
    await evolutionThread
      .setArchived(false)
      .catch(() => {});
  }

  const evolutionMessages =
    await evolutionThread.messages
      .fetch({
        limit: 100,
      })
      .catch(() => null);

  /*
   * Remove o espelho antigo do Forms,
   * porque agora o registro OFICIAL
   * ficará no próprio tópico da Evolução.
   */

  if (evolutionMessages) {
    for (
      const message
      of evolutionMessages.values()
    ) {
      const footerText =
        String(
          message.embeds?.[0]
            ?.footer?.text ||
          ""
        );

      if (
        footerText.startsWith(
          `SC_FORMS_ACTIVE_CARD:${targetUserId}:`
        )
      ) {
        await message
          .delete()
          .catch(() => {});
      }
    }
  }

  const rowEdit =
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            `editar_id_${evolutionThread.id}`
          )
          .setLabel(
            "✏️ Editar ID/Passaporte"
          )
          .setStyle(
            ButtonStyle.Secondary
          ),

        new ButtonBuilder()
          .setCustomId(
            `editar_area_${evolutionThread.id}`
          )
          .setLabel(
            "✏️ Editar Área de Interesse"
          )
          .setStyle(
            ButtonStyle.Secondary
          )
      );

  const rowStatus =
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            `fc_toggle_status:${evolutionThread.id}:${targetUserId}:${registration.active ? "inactive" : "active"}`
          )
          .setLabel(
            registration.active
              ? "Desligar do Projeto"
              : "Ligar ao Projeto"
          )
          .setStyle(
            registration.active
              ? ButtonStyle.Danger
              : ButtonStyle.Success
          )
      );

  /*
   * Recria o registro oficial do Forms
   * DENTRO do tópico já ligado ao GI.
   */

  const canonicalMessage =
    await evolutionThread
      .send({
        embeds: [
          EmbedBuilder.from(
            sourceMessage.embeds[0]
          ),
        ],

        components: [
          rowEdit,
          rowStatus,
        ],

        allowedMentions: {
          parse: [],
        },
      })
      .catch(() => null);

  if (!canonicalMessage) {
    return false;
  }

  /*
   * Só depois que o registro foi
   * preservado no tópico correto
   * tentamos remover o duplicado.
   */

  const deleted =
    await formsThread
      .delete(
        `FormsCreator duplicado consolidado no tópico ${evolutionThread.id}`
      )
      .then(
        () => true
      )
      .catch(
        () => false
      );

  if (!deleted) {
    /*
     * Se não conseguiu apagar,
     * desfaz a nova mensagem para
     * não criar outra duplicidade.
     */

    await canonicalMessage
      .delete()
      .catch(() => {});

    return false;
  }

  /*
   * Atualiza o FormsCreator para considerar
   * o tópico GI/Evolução como oficial.
   */

  state.registrations[
    evolutionThread.id
  ] = {
    ...registration,

    messageId:
      canonicalMessage.id,

    activeMirrorThreadId:
      null,

    activeMirrorMessageId:
      null,
  };

  delete state.registrations[
    formsThreadId
  ];

  writeState(
    state
  );

  console.log(
    `[FormsCreator] Duplicado ${formsThreadId} removido. ` +
    `Tópico canônico GI/Evolução: ${evolutionThread.id}`
  );

  return true;
}

// =====================================================
// 🧹 LIMPEZA DAS MENSAGENS ÓRFÃS "INICIOU UM TÓPICO"
// =====================================================
//
// Quando uma thread duplicada é realmente apagada,
// o Discord pode manter no canal principal a mensagem:
//
// "Santa Creators iniciou um tópico: Nome"
//
// Esta função remove SOMENTE essas mensagens quando:
//
// 1. São mensagens de criação de thread.
// 2. Foram geradas pelo próprio bot.
// 3. A thread vinculada já não existe.
// 4. A mensagem tem pelo menos 30 segundos.
//
// Não interfere em Coordenação, Responsáveis ou
// qualquer outro canal.
// =====================================================

async function cleanupOrphanThreadCreatedSystemMessages(
  client,
  channel
) {
  if (
    !channel?.messages ||
    !client?.user?.id
  ) {
    return 0;
  }

  let deleted = 0;
  let before = undefined;

  for (
    let page = 0;
    page < 10;
    page++
  ) {
    const messages =
      await channel.messages
        .fetch({
          limit: 100,
          before,
        })
        .catch(() => null);

    if (
      !messages?.size
    ) {
      break;
    }

    before =
      messages.last()?.id;

    for (
      const message
      of messages.values()
    ) {
      /*
       * Discord:
       * MessageType.ThreadCreated = 18
       */
      const isThreadCreatedSystemMessage =
        Number(
          message.type
        ) === 18;

      if (
        !isThreadCreatedSystemMessage ||
        message.author?.id !==
          client.user.id
      ) {
        continue;
      }

      /*
       * Evita mexer numa mensagem que acabou
       * de nascer enquanto Discord/cache ainda
       * pode estar sincronizando a nova thread.
       */
      const isTooRecent =
        Date.now() -
          Number(
            message.createdTimestamp ||
            0
          ) <
        30_000;

      if (
        isTooRecent
      ) {
        continue;
      }

      /*
       * Se ainda existe uma thread vinculada,
       * esta mensagem é válida e permanece.
       */
      if (
        message.hasThread ||
        message.thread
      ) {
        continue;
      }

      const wasDeleted =
        await message
          .delete()
          .then(
            () => true
          )
          .catch(
            (error) => {
              console.warn(
                `[FormsCreator] Não consegui apagar a mensagem órfã de criação de tópico ${message.id}:`,
                error
              );

              return false;
            }
          );

      if (
        wasDeleted
      ) {
        deleted += 1;
      }
    }

    if (
      !before ||
      messages.size < 100
    ) {
      break;
    }
  }

  if (
    deleted > 0
  ) {
    console.log(
      `[FormsCreator] ${deleted} mensagem(ns) órfã(s) de "iniciou um tópico" removida(s) do canal inicial.`
    );
  }

  return deleted;
}

async function cleanupFormsCreatorDuplicateThreads(
  client
) {
  const state =
    readState();

  const channel =
    await client.channels
      .fetch(
        CREATOR_FORM_CHANNEL_ID
      )
      .catch(() => null);

  if (
    !channel?.threads
  ) {
    return 0;
  }

  // =====================================================
  // BUSCA SOMENTE OS TÓPICOS DA CATEGORIA INICIAL
  // =====================================================

  const allThreadsMap =
    new Map();

  const activeThreads =
    await channel.threads
      .fetchActive()
      .catch(() => null);

  if (
    activeThreads?.threads
  ) {
    for (
      const thread
      of activeThreads.threads.values()
    ) {
      allThreadsMap.set(
        thread.id,
        thread
      );
    }
  }

  const fetchArchivedThreads =
    async (type) => {
      let before =
        undefined;

      for (
        let page = 0;
        page < 10;
        page++
      ) {
        const archived =
          await channel.threads
            .fetchArchived({
              type,
              limit: 100,
              before,
            })
            .catch(() => null);

        if (
          !archived?.threads?.size
        ) {
          break;
        }

        for (
          const thread
          of archived.threads.values()
        ) {
          allThreadsMap.set(
            thread.id,
            thread
          );
        }

        before =
          archived.threads
            .last()
            ?.id;

        if (
          !before ||
          archived.threads.size < 100
        ) {
          break;
        }

        await new Promise(
          (resolve) =>
            setTimeout(
              resolve,
              300
            )
        );
      }
    };

  await fetchArchivedThreads(
    "public"
  );

  await fetchArchivedThreads(
    "private"
  );

  // =====================================================
  // IDENTIFICA QUAL USUÁRIO PERTENCE A CADA THREAD
  // =====================================================

  const extractUserIdFromThread =
    async (thread) => {
      const stateUserId =
        String(
          state.registrations?.[
            thread.id
          ]?.userId ||
          ""
        ).trim();

      if (stateUserId) {
        return stateUserId;
      }

      const messages =
        await thread.messages
          .fetch({
            limit: 100,
          })
          .catch(() => null);

      if (!messages) {
        return null;
      }

      for (
        const message
        of messages.values()
      ) {
        if (
          message.author?.id !==
          client.user?.id
        ) {
          continue;
        }

        const embed =
          message.embeds?.[0];

        if (!embed) {
          continue;
        }

        // ===============================================
        // FORMSCREATOR
        // ===============================================

        if (
          isFormsCreatorMainRegisterMessage(
            message,
            client
          )
        ) {
          const formsUserId =
            String(
              embed.description ||
              ""
            )
              .trim()
              .match(
                /^<@!?(\d{17,20})>$/
              )?.[1];

          if (formsUserId) {
            return formsUserId;
          }
        }

        // ===============================================
        // TÓPICO DA EVOLUÇÃO / GI
        // ===============================================

        const raw =
          [
            embed.title || "",
            embed.description || "",
            ...(embed.fields || [])
              .flatMap(
                (field) => [
                  field.name || "",
                  field.value || "",
                ]
              ),
          ].join("\n");

        const isTeamEvolutionCard =
          raw.includes(
            "Equipe Creators"
          ) &&
          (
            raw.includes(
              "Fase"
            ) ||
            raw.includes(
              "ID Discord"
            )
          );

        if (
          !isTeamEvolutionCard
        ) {
          continue;
        }

        const idDiscordMatch =
          raw.match(
            /ID Discord[^\d]*(\d{17,20})/i
          );

        if (
          idDiscordMatch?.[1]
        ) {
          return idDiscordMatch[1];
        }

        const mentionMatch =
          raw.match(
            /<@!?(\d{17,20})>/
          );

        if (
          mentionMatch?.[1]
        ) {
          return mentionMatch[1];
        }
      }

      return null;
    };

  // =====================================================
  // AGRUPA THREADS DA MESMA PESSOA
  // =====================================================

  const groups =
    new Map();

  for (
    const thread
    of allThreadsMap.values()
  ) {
    if (
      thread.parentId !==
      CREATOR_FORM_CHANNEL_ID
    ) {
      continue;
    }

    const userId =
      await extractUserIdFromThread(
        thread
      );

    if (!userId) {
      continue;
    }

    if (
      !groups.has(userId)
    ) {
      groups.set(
        userId,
        []
      );
    }

    groups
      .get(userId)
      .push(
        thread
      );
  }

  let deleted =
    0;

  // =====================================================
  // PROCESSA SOMENTE QUEM TEM MAIS DE UMA THREAD
  // =====================================================

  for (
    const [
      userId,
      threads,
    ]
    of groups.entries()
  ) {
    if (
      threads.length < 2
    ) {
      continue;
    }

    // ===================================================
    // O TÓPICO QUE DEVE PERMANECER É O EQP.C
    // ===================================================

    const canonicalCandidates =
      threads
        .filter(
          (thread) =>
            /^EQP\.C\s*\|/i.test(
              String(
                thread.name ||
                ""
              )
            ) &&
            /Equipe Creators/i.test(
              String(
                thread.name ||
                ""
              )
            )
        )
        .sort(
          (a, b) =>
            Number(
              a.createdTimestamp ||
              0
            ) -
            Number(
              b.createdTimestamp ||
              0
            )
        );

    if (
      canonicalCandidates.length ===
      0
    ) {
      continue;
    }

    const canonicalThread =
      canonicalCandidates[0];

    if (
      canonicalThread.archived
    ) {
      await canonicalThread
        .setArchived(false)
        .catch(() => {});
    }

    let canonicalMessages =
      await canonicalThread.messages
        .fetch({
          limit: 100,
        })
        .catch(() => null);

    let canonicalFormsMessage =
      canonicalMessages?.find(
        (message) =>
          isFormsCreatorMainRegisterMessage(
            message,
            client
          ) &&
          String(
            message.embeds?.[0]
              ?.description ||
            ""
          )
            .trim()
            .match(
              /^<@!?(\d{17,20})>$/
            )?.[1] ===
              userId
      ) ||
      null;

    const duplicateThreads =
      threads.filter(
        (thread) =>
          thread.id !==
          canonicalThread.id
      );

    // ===================================================
    // APAGA AS OUTRAS THREADS REAIS DO DISCORD
    // ===================================================

    for (
      const duplicateThread
      of duplicateThreads
    ) {
      const duplicateMessages =
        await duplicateThread.messages
          .fetch({
            limit: 100,
          })
          .catch(() => null);

      if (!duplicateMessages) {
        continue;
      }

      // =================================================
      // SEGURANÇA:
      // se alguém humano escreveu ali, não apaga
      // =================================================

      const hasHumanMessages =
        duplicateMessages.some(
          (message) =>
            message.author?.id !==
            client.user?.id
        );

      if (hasHumanMessages) {
        console.warn(
          `[FormsCreator] Tópico duplicado ${duplicateThread.id} de ${userId} não foi apagado porque possui mensagem humana.`
        );

        continue;
      }

      // =================================================
      // PROCURA O FORMS NO TÓPICO DUPLICADO
      // =================================================

      const duplicateFormsMessage =
        duplicateMessages.find(
          (message) =>
            isFormsCreatorMainRegisterMessage(
              message,
              client
            ) &&
            String(
              message.embeds?.[0]
                ?.description ||
              ""
            )
              .trim()
              .match(
                /^<@!?(\d{17,20})>$/
              )?.[1] ===
                userId
        ) ||
        null;

      const duplicateRegistration =
        state.registrations?.[
          duplicateThread.id
        ] ||
        null;

      // =================================================
      // SE O EQP.C AINDA NÃO TEM O FORMS,
      // MOVE O FORMS PARA ELE ANTES DE APAGAR
      // =================================================

      if (
        !canonicalFormsMessage &&
        duplicateFormsMessage?.embeds?.[0]
      ) {
        const statusText =
          duplicateFormsMessage
            .embeds[0]
            .fields
            ?.find(
              (field) =>
                String(
                  field?.name ||
                  ""
                ) ===
                "Status do Projeto"
            )
            ?.value ||
          "";

        const isActive =
          duplicateRegistration?.active ??
          (
            statusText.includes(
              "🟢"
            ) ||
            (
              /\bativo\b/i.test(
                statusText
              ) &&
              !/\binativo\b/i.test(
                statusText
              )
            )
          );

        const rowEdit =
          new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(
                  `editar_id_${canonicalThread.id}`
                )
                .setLabel(
                  "✏️ Editar ID/Passaporte"
                )
                .setStyle(
                  ButtonStyle.Secondary
                ),

              new ButtonBuilder()
                .setCustomId(
                  `editar_area_${canonicalThread.id}`
                )
                .setLabel(
                  "✏️ Editar Área de Interesse"
                )
                .setStyle(
                  ButtonStyle.Secondary
                )
            );

        const rowStatus =
          new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(
                  `fc_toggle_status:${canonicalThread.id}:${userId}:${isActive ? "inactive" : "active"}`
                )
                .setLabel(
                  isActive
                    ? "Desligar do Projeto"
                    : "Ligar ao Projeto"
                )
                .setStyle(
                  isActive
                    ? ButtonStyle.Danger
                    : ButtonStyle.Success
                )
            );

        canonicalFormsMessage =
          await canonicalThread
            .send({
              embeds: [
                EmbedBuilder.from(
                  duplicateFormsMessage
                    .embeds[0]
                ),
              ],

              components: [
                rowEdit,
                rowStatus,
              ],

              allowedMentions: {
                parse: [],
              },
            })
            .catch(() => null);

        if (
          !canonicalFormsMessage
        ) {
          console.warn(
            `[FormsCreator] Não consegui mover o Forms de ${duplicateThread.id} para ${canonicalThread.id}. O duplicado não será apagado.`
          );

          continue;
        }

        const sourceEmbed =
          duplicateFormsMessage.embeds[0];

        state.registrations[
          canonicalThread.id
        ] = {
          ...(
            duplicateRegistration ||
            {}
          ),

          userId,

          nome:
            duplicateRegistration?.nome ||
            String(
              sourceEmbed.title ||
              canonicalThread.name ||
              userId
            )
              .replace(
                /^👤\s*/,
                ""
              )
              .trim(),

          idCidade:
            duplicateRegistration?.idCidade ||
            sourceEmbed.fields
              ?.find(
                (field) =>
                  String(
                    field?.name ||
                    ""
                  ).includes(
                    "ID/Passaporte"
                  )
              )
              ?.value ||
            "?",

          area:
            duplicateRegistration?.area ||
            sourceEmbed.fields
              ?.find(
                (field) =>
                  String(
                    field?.name ||
                    ""
                  ).includes(
                    "Área de Interesse"
                  )
              )
              ?.value ||
            "?",

          active:
            isActive,

          messageId:
            canonicalFormsMessage.id,

          activeMirrorThreadId:
            null,

          activeMirrorMessageId:
            null,
        };
      }

      // =================================================
      // AQUI SIM APAGA A THREAD REAL DO DISCORD
      // =================================================

      const deletedThread =
        await duplicateThread
          .delete(
            `Tópico inicial duplicado de ${userId}; mantido ${canonicalThread.id}`
          )
          .then(
            () => true
          )
          .catch(
            (error) => {
              console.error(
                `[FormsCreator] Falha ao apagar de fato o tópico duplicado ${duplicateThread.id}:`,
                error
              );

              return false;
            }
          );

      if (!deletedThread) {
        continue;
      }

      // =================================================
      // SÓ LIMPA O STATE DEPOIS QUE O DISCORD APAGOU
      // =================================================

      delete state.registrations[
        duplicateThread.id
      ];

      writeState(
        state
      );

      deleted += 1;

      console.log(
        `[FormsCreator] TÓPICO DUPLICADO APAGADO DO DISCORD: ${duplicateThread.name} (${duplicateThread.id}). ` +
        `Mantido: ${canonicalThread.name} (${canonicalThread.id}).`
      );
    }
  }

  // ===================================================
  // 🧹 LIMPA AS MENSAGENS ÓRFÃS DO CANAL PRINCIPAL
  // ===================================================
  //
  // Exemplo:
  //
  // "Santa Creators iniciou um tópico: Vitor taborda."
  //
  // Se a thread já foi apagada, a mensagem de sistema
  // também desaparece.
  // ===================================================

  await cleanupOrphanThreadCreatedSystemMessages(
    client,
    channel
  );

  return deleted;
}
// =====================================================
// ESPELHO CANÔNICO DO FORMS NO TÓPICO ATIVO
// =====================================================
//
// REGRA:
//
// 1. O Forms ORIGINAL continua sendo a fonte oficial.
// 2. Se o tópico original já for o ativo, não duplica.
// 3. Se a pessoa subir de fase/cargo, cria ou atualiza
//    um espelho COMPLETO no tópico ativo.
// 4. Os botões do espelho continuam apontando para o
//    tópico original.
// 5. Se a pessoa mudar novamente de fase, os botões do
//    espelho antigo são desativados.
// 6. O antigo resumo SC_FORMS_AREA é removido para não
//    gerar duplicação.
// =====================================================

async function withFormsCreatorThreadMaintenance(thread, action) {
  if (!thread?.isThread?.()) return action(thread);

  const current = await thread.fetch(true);
  const wasArchived = current.archived;
  const wasLocked = current.locked;

  if (wasArchived) {
    await current.edit({
      archived: false,
      locked: wasLocked,
      reason: "Manutenção do registro FormsCreator",
    });
  }

  try {
    return await action(current);
  } finally {
    if (wasArchived) {
      await current.edit({
        archived: true,
        locked: wasLocked,
        reason: "Restaurando o estado do tópico após manutenção do FormsCreator",
      });
    }
  }
}

async function syncFormsCreatorActiveMirror(
  client,
  {
    originalThreadId,
    registration,
    reason = "Sincronização do FormsCreator com o tópico ativo",
  }
) {
  const normalizedOriginalThreadId =
    String(
      originalThreadId ||
      ""
    ).trim();

  const userId =
    String(
      registration?.userId ||
      ""
    ).trim();

  if (
    !normalizedOriginalThreadId ||
    !userId
  ) {
    return {
      ok: false,
      status: "skipped",
    };
  }

  const originalThread =
    await client.channels
      .fetch(
        normalizedOriginalThreadId
      )
      .catch(
        () => null
      );

  if (
    !originalThread ||
    !originalThread.isTextBased?.()
  ) {
    throw new Error(
      "Tópico original do FormsCreator não encontrado."
    );
  }

  let sourceMessage =
    registration?.messageId
      ? await originalThread.messages
          .fetch(
            registration.messageId
          )
          .catch(
            () => null
          )
      : null;

  if (
    sourceMessage &&
    sourceMessage.author?.id !==
      client.user?.id
  ) {
    sourceMessage =
      null;
  }

  if (!sourceMessage) {
    const recent =
      await originalThread.messages
        .fetch({
          limit: 100,
        })
        .catch(
          () => null
        );

    sourceMessage =
      recent?.find(
        message =>
          isFormsCreatorMainRegisterMessage(
            message,
            client
          )
      ) ||
      null;
  }

  if (
    !sourceMessage ||
    !sourceMessage.embeds?.[0]
  ) {
    throw new Error(
      "Mensagem principal do FormsCreator não encontrada para sincronizar o tópico ativo."
    );
  }

  registration.messageId =
    sourceMessage.id;

  const persistRegistration =
    () => {
      const latestState =
        readState();

      latestState.registrations ||= {};

      latestState.registrations[
        normalizedOriginalThreadId
      ] = {
        ...(
          latestState.registrations[
            normalizedOriginalThreadId
          ] ||
          {}
        ),

        ...registration,
      };

      writeState(
        latestState
      );
    };

  // Inativação não depende de cargo: os cargos podem já ter sido removidos pelo GI.
  // Atualiza somente o espelho já vinculado, sem criar/reabrir uma fase de evolução.
  if (registration.active === false) {
    const mirrorThreadId = registration.activeMirrorThreadId;
    const mirrorMessageId = registration.activeMirrorMessageId;

    if (
      mirrorThreadId &&
      mirrorMessageId &&
      String(mirrorThreadId) !== normalizedOriginalThreadId
    ) {
      const missingDiscordResource = error => {
        if ([10003, 10008].includes(Number(error?.code))) return null;
        throw error;
      };

      const mirrorThread = await client.channels
        .fetch(mirrorThreadId)
        .catch(missingDiscordResource);

      if (mirrorThread && mirrorThread.guildId !== GUILD_ID) {
        throw new Error("O espelho do FormsCreator pertence a outra guilda.");
      }

      const mirrorMessage = mirrorThread?.isTextBased?.()
        ? await mirrorThread.messages.fetch(mirrorMessageId).catch(missingDiscordResource)
        : null;

      if (mirrorMessage) {
        if (mirrorMessage.author?.id !== client.user?.id || !mirrorMessage.embeds?.[0]) {
          throw new Error("O espelho vinculado não é um registro válido deste bot.");
        }

        const inactiveEmbed = EmbedBuilder.from(mirrorMessage.embeds[0]);
        const fields = [...(inactiveEmbed.data.fields || [])];
        const statusField = {
          name: "Status do Projeto",
          value: "🔴 Inativo",
          inline: false,
        };
        const index = fields.findIndex(field => field.name === statusField.name);
        if (index >= 0) fields[index] = statusField;
        else fields.push(statusField);
        inactiveEmbed.setFields(fields);

        await withFormsCreatorThreadMaintenance(mirrorThread, () =>
          mirrorMessage.edit({
            embeds: [inactiveEmbed],
            components: [],
            allowedMentions: { parse: [] },
          })
        );
      }
    }

    // Preserva os IDs para histórico e eventual reativação.
    persistRegistration();
    return {
      ok: true,
      status: "inactive_mirror_synced",
      threadId: mirrorThreadId || normalizedOriginalThreadId,
      messageId: mirrorMessageId || sourceMessage.id,
    };
  }

  // Inativação não depende de cargo: os cargos podem já ter sido removidos pelo GI.
  // Atualiza somente o espelho já vinculado, sem criar/reabrir uma fase de evolução.
  if (registration.active === false) {
    const mirrorThreadId = registration.activeMirrorThreadId;
    const mirrorMessageId = registration.activeMirrorMessageId;

    if (
      mirrorThreadId &&
      mirrorMessageId &&
      String(mirrorThreadId) !== normalizedOriginalThreadId
    ) {
      const missingDiscordResource = error => {
        if ([10003, 10008].includes(Number(error?.code))) return null;
        throw error;
      };

      const mirrorThread = await client.channels
        .fetch(mirrorThreadId)
        .catch(missingDiscordResource);

      if (mirrorThread && mirrorThread.guildId !== GUILD_ID) {
        throw new Error("O espelho do FormsCreator pertence a outra guilda.");
      }

      const mirrorMessage = mirrorThread?.isTextBased?.()
        ? await mirrorThread.messages.fetch(mirrorMessageId).catch(missingDiscordResource)
        : null;

      if (mirrorMessage) {
        if (mirrorMessage.author?.id !== client.user?.id || !mirrorMessage.embeds?.[0]) {
          throw new Error("O espelho vinculado não é um registro válido deste bot.");
        }

        const inactiveEmbed = EmbedBuilder.from(mirrorMessage.embeds[0]);
        const fields = [...(inactiveEmbed.data.fields || [])];
        const statusField = {
          name: "Status do Projeto",
          value: "🔴 Inativo",
          inline: false,
        };
        const index = fields.findIndex(field => field.name === statusField.name);
        if (index >= 0) fields[index] = statusField;
        else fields.push(statusField);
        inactiveEmbed.setFields(fields);

        await withFormsCreatorThreadMaintenance(mirrorThread, () =>
          mirrorMessage.edit({
            embeds: [inactiveEmbed],
            components: [],
            allowedMentions: { parse: [] },
          })
        );
      }
    }

    // Preserva os IDs para histórico e eventual reativação.
    persistRegistration();
    return {
      ok: true,
      status: "inactive_mirror_synced",
      threadId: mirrorThreadId || normalizedOriginalThreadId,
      messageId: mirrorMessageId || sourceMessage.id,
    };
  }

  const disablePreviousMirror =
    async () => {
      const previousThreadId =
        registration
          ?.activeMirrorThreadId;

      const previousMessageId =
        registration
          ?.activeMirrorMessageId;

      if (
        !previousThreadId ||
        !previousMessageId
      ) {
        return;
      }

      const previousThread =
        await client.channels
          .fetch(
            previousThreadId
          )
          .catch(
            () => null
          );

      const previousMessage =
        previousThread
          ?.isTextBased?.()
          ? await previousThread.messages
              .fetch(
                previousMessageId
              )
              .catch(
                () => null
              )
          : null;

      if (
        previousMessage &&
        previousMessage.author?.id ===
          client.user?.id
      ) {
        await previousMessage
          .edit({
            components: [],
          })
          .catch(
            () => {}
          );
      }
    };

  const evolution =
    await getEvolutionFeedbackContext(
      client,
      userId,
      {
        guildId:
          GUILD_ID,

        originalThreadId:
          normalizedOriginalThreadId,

        reason,
      }
    );

  if (
    !evolution?.thread ||
    evolution.tier ==
      null
  ) {
    throw new Error(
      "Não foi possível confirmar o tópico ativo do FormsCreator."
    );
  }

  // =====================================================
  // O ORIGINAL JÁ É O TÓPICO ATIVO
  // =====================================================

  if (
    evolution.thread.id ===
    normalizedOriginalThreadId
  ) {
    await disablePreviousMirror();

    registration.activeMirrorThreadId =
      null;

    registration.activeMirrorMessageId =
      null;

    delete registration.activeAreaThreadId;
    delete registration.activeAreaMessageId;

    persistRegistration();

    return {
      ok: true,
      status: "original_is_active",
      threadId:
        normalizedOriginalThreadId,
      messageId:
        sourceMessage.id,
    };
  }

  return await withActiveEvolutionThread(
    client,
    userId,
    {
      tier:
        evolution.tier,

      thread:
        evolution.thread,
    },

    async (
      activeThread
    ) => {
      // =====================================================
      // DESATIVA O ESPELHO DA FASE ANTERIOR
      // =====================================================

      if (
        registration
          .activeMirrorThreadId &&
        registration
          .activeMirrorThreadId !==
          activeThread.id
      ) {
        await disablePreviousMirror();
      }

      const marker =
        `SC_FORMS_ACTIVE_CARD:${userId}:${normalizedOriginalThreadId}`;

      const legacyAreaMarker =
        `SC_FORMS_AREA:${userId}`;

      let mirrorMessage =
        (
          registration
            .activeMirrorThreadId ===
              activeThread.id &&
          registration
            .activeMirrorMessageId
        )
          ? await activeThread.messages
              .fetch(
                registration
                  .activeMirrorMessageId
              )
              .catch(
                () => null
              )
          : null;

      const recent =
        await activeThread.messages
          .fetch({
            limit: 100,
          })
          .catch(
            () => null
          );

      if (
        !mirrorMessage &&
        recent
      ) {
        mirrorMessage =
          recent.find(
            message =>
              message.author?.id ===
                client.user?.id &&
              message.embeds?.[0]
                ?.footer?.text ===
                marker
          ) ||
          null;
      }

      const mirrorEmbed =
        EmbedBuilder.from(
          sourceMessage.embeds[0]
        );

      const fields =
        Array.isArray(
          mirrorEmbed.data.fields
        )
          ? [
              ...mirrorEmbed.data.fields,
            ]
          : [];

      const originalLink =
        `https://discord.com/channels/${GUILD_ID}/${normalizedOriginalThreadId}/${sourceMessage.id}`;

      const originalLinkField = {
        name:
          "🔗 Registro original",
        value:
          `[Abrir Forms original](${originalLink})`,
        inline:
          false,
      };

      const linkFieldIndex =
        fields.findIndex(
          field =>
            String(
              field?.name ||
              ""
            ) ===
            "🔗 Registro original"
        );

      if (
        linkFieldIndex >=
        0
      ) {
        fields[
          linkFieldIndex
        ] =
          originalLinkField;
      } else {
        fields.push(
          originalLinkField
        );
      }

      // =====================================================
      // LINK DE VOLTA PARA O CONTROLE GI
      // =====================================================

      const giControl =
        globalThis
          .SC_GI_CONTROL_API
          ?.getControl?.(
            GUILD_ID,
            userId
          ) ||
        null;

      if (
        giControl?.channelId &&
        giControl?.messageId
      ) {
        const giLink =
          `https://discord.com/channels/${GUILD_ID}/${giControl.channelId}/${giControl.messageId}`;

        const giLinkField = {
          name:
            "🧭 Controle GI",
          value:
            `[Abrir registro no Controle GI](${giLink})`,
          inline:
            false,
        };

        const giFieldIndex =
          fields.findIndex(
            field =>
              String(
                field?.name ||
                ""
              ) ===
              "🧭 Controle GI"
          );

        if (
          giFieldIndex >=
          0
        ) {
          fields[
            giFieldIndex
          ] =
            giLinkField;
        } else {
          fields.push(
            giLinkField
          );
        }
      }

      mirrorEmbed
        .setFields(
          fields
        )
        .setFooter({
          text:
            marker,
        });

      // =====================================================
      // BOTÕES DO ESPELHO
      // =====================================================
      //
      // IMPORTANTE:
      // todos apontam para o tópico ORIGINAL.
      // =====================================================

      const editRow =
        new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(
                `editar_id_${normalizedOriginalThreadId}`
              )
              .setLabel(
                "✏️ Editar ID/Passaporte"
              )
              .setStyle(
                ButtonStyle.Secondary
              ),

            new ButtonBuilder()
              .setCustomId(
                `editar_area_${normalizedOriginalThreadId}`
              )
              .setLabel(
                "✏️ Editar Área de Interesse"
              )
              .setStyle(
                ButtonStyle.Secondary
              )
          );

      const statusRow =
        new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(
                `fc_toggle_status:${normalizedOriginalThreadId}:${userId}:${registration.active ? "inactive" : "active"}`
              )
              .setLabel(
                registration.active
                  ? "Desligar do Projeto"
                  : "Ligar ao Projeto"
              )
              .setStyle(
                registration.active
                  ? ButtonStyle.Danger
                  : ButtonStyle.Success
              )
          );

      const payload = {
        embeds: [
          mirrorEmbed,
        ],

        components: [
          editRow,
          statusRow,
        ],

        allowedMentions: {
          parse: [],
        },
      };

      const posted =
        mirrorMessage
          ? await mirrorMessage.edit(
              payload
            )
          : await activeThread.send(
              payload
            );

      // =====================================================
      // REMOVE O RESUMO ANTIGO DA ÁREA
      // =====================================================

      if (
        recent
      ) {
        const legacyAreaMessage =
          recent.find(
            message =>
              message.id !==
                posted.id &&
              message.author?.id ===
                client.user?.id &&
              message.embeds?.[0]
                ?.footer?.text ===
                legacyAreaMarker
          );

        if (
          legacyAreaMessage
        ) {
          await legacyAreaMessage
            .delete()
            .catch(
              () => {}
            );
        }
      }

      registration.activeMirrorThreadId =
        activeThread.id;

      registration.activeMirrorMessageId =
        posted.id;

      delete registration.activeAreaThreadId;
      delete registration.activeAreaMessageId;

      persistRegistration();

      return {
        ok: true,
        status:
          mirrorMessage
            ? "updated"
            : "created",

        threadId:
          activeThread.id,

        messageId:
          posted.id,
      };
    }
  );
}

async function _performStatusUpdate(client, { registration, threadId, newStatus, actor, fromGi = false }) {
    const formChannel = await client.channels.fetch(CREATOR_FORM_CHANNEL_ID).catch(() => null);
    const guild = formChannel?.guild || null;
    const userId = registration.userId;

    if (!guild) {
        throw new Error("Não foi possível resolver a guild do FormsCreator.");
    }

    if (newStatus) {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member || !member.roles.cache.has(ROLE_REQUIRED_FOR_ACTIVE)) {
            throw new Error(`Não é possível ativar este membro. Ele não possui o cargo obrigatório <@&${ROLE_REQUIRED_FOR_ACTIVE}>.`);
        }
    }

    if (!newStatus && !fromGi) {
        const giApi = globalThis.SC_GI_CONTROL_API;
        if (!giApi?.ready || typeof giApi.desligarFromForms !== "function") {
            throw new Error("A integração de desligamento com o Controle GI não está disponível. O status não foi alterado.");
        }

        await giApi.desligarFromForms({
            guildId: guild.id,
            userId,
            actor,
            reason: "Desligamento pelo FormsCreator",
        });

        const updated = readState().registrations?.[threadId];
        if (updated?.active === false) {
            Object.assign(registration, updated);
            return;
        }
    }

    const oldStatus = registration.active;
    registration.active = newStatus;

    const thread = await client.channels.fetch(threadId).catch(() => null);
    if (!thread?.isTextBased?.()) {
        throw new Error("Tópico do FormsCreator não encontrado para atualizar o status.");
    }
    await withFormsCreatorThreadMaintenance(thread, async currentThread => {
        const registroMsg = await currentThread.messages.fetch(registration.messageId);
        if (!registroMsg?.embeds?.[0]) {
            throw new Error("Mensagem do FormsCreator sem o embed do registro.");
        }
        if (registroMsg) {
            const oldEmbed = EmbedBuilder.from(registroMsg.embeds[0]);
            const statusField = { name: "Status do Projeto", value: newStatus ? "🟢 Ativo" : "🔴 Inativo", inline: false };
            const fields = oldEmbed.data.fields || [];
            const statusIndex = fields.findIndex(f => f.name === "Status do Projeto");
            if (statusIndex > -1) fields[statusIndex] = statusField;
            else fields.push(statusField);
            oldEmbed.setFields(fields);

            const newStatusRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`fc_toggle_status:${threadId}:${userId}:${newStatus ? 'inactive' : 'active'}`)
                    .setLabel(newStatus ? "Desligar do Projeto" : "Ligar ao Projeto")
                    .setStyle(newStatus ? ButtonStyle.Danger : ButtonStyle.Success)
            );
            const existingRows = registroMsg.components.filter(row => !row.components.some(c => c.customId?.startsWith('fc_toggle_status')));
            await registroMsg.edit({ embeds: [oldEmbed], components: [...existingRows, newStatusRow] });
        }
        const latestState = readState();
        latestState.registrations ||= {};
        latestState.registrations[threadId] = {
            ...(latestState.registrations[threadId] || {}),
            ...registration,
        };
        writeState(latestState);

        // =====================================================
        // AVISO GENÉRICO DE STATUS
        // =====================================================
        //
        // No desligamento vindo do Controle GI, NÃO publica a
        // frase genérica "Fulano alterou o status...".
        //
        // O fluxo do GI publicará uma nota final específica no
        // último tópico ativo e, em seguida, travará toda a
        // trajetória da Evolução.
        //
        // Alterações manuais feitas diretamente pelo Forms
        // continuam usando o comportamento anterior.
        // =====================================================

        if (
            !(
                fromGi &&
                newStatus === false
            )
        ) {
            await currentThread.send({
                content: `**${actor?.username || actor?.id || "Sistema"}** alterou o status do projeto para **${newStatus ? 'ATIVO' : 'INATIVO'}**.`,
                allowedMentions: { parse: [] },
            }).catch(error => console.warn("[FormsCreator] Status salvo; aviso no tópico pendente:", error));
        }
    });

    await logStatusChange(
        client,
        { user: actor },
        {
            threadId,
            userId,
            nome: registration.nome,
            oldStatus,
            newStatus
        }
    ).catch(error => console.warn("[FormsCreator] Status salvo; log de auditoria pendente:", error));

    await syncFormsCreatorActiveMirror(
        client,
        {
            originalThreadId: threadId,
            registration,
            reason: "Status do FormsCreator alterado",
        }
    ).catch((error) => {
        console.error(
            `[FormsCreator] Status atualizado no original, mas o espelho ativo ficou pendente para ${userId}:`,
            error
        );
    });
}
function hasManagePermission(member, userId) {
  if (MANAGE_PERMS_USERS.includes(userId)) return true;
  const roles = member?.roles?.cache;
  return roles?.some((role) => MANAGE_PERMS_ROLES.includes(role.id)) ?? false;
}

const BUTTON_CUSTOM_ID = "abrir_forms_equipecreator";

const SYNC_FORMS_BUTTON_CUSTOM_ID = "sync_formscreator_threads";

function buildButtonRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(BUTTON_CUSTOM_ID)
      .setLabel("➕ Registrar Membro da Equipe Creator")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId(SYNC_FORMS_BUTTON_CUSTOM_ID)
      .setLabel("🔄 Sincronizar/Limpar Tópicos")
      .setStyle(ButtonStyle.Secondary)
  );
}

function messageHasOurButton(msg) {
  if (!msg?.components?.length) return false;

  for (const row of msg.components) {
    const comps = row.components || [];
    for (const c of comps) {
      if (c?.customId === BUTTON_CUSTOM_ID) return true;
    }
  }
  return false;
}

function buildButtonPayload() {
  return {
    content: "**Clique abaixo para registrar um novo membro da Equipe Creator:**",
    components: [buildButtonRow()],
  };
}

// =========================
// BOTÃO: SEMPRE SUBSTITUIR (APAGA O ANTIGO E MANDA UM NOVO)
// - no boot: apaga antigo + qualquer duplicata e cria 1 novo
// - ao criar registro: apaga antigo + cria 1 novo
// =========================
async function replaceButtonMessage(client) {
  return runWithEnsureLock(async () => {
    const state = readState();
    const channelId = CREATOR_FORM_BUTTON_CHANNEL_ID;

    const ch = await client.channels.fetch(channelId).catch(() => null);
    if (!ch || !ch.isTextBased()) return;

    // 0) tenta apagar a msg salva no state (se ainda existir)
    if (state.buttonMessageId) {
      const existing = await ch.messages.fetch(state.buttonMessageId).catch(() => null);
      if (existing && existing.author?.id === client.user.id) {
        await existing.delete().catch(() => {});
      }
    }

    // 1) limpa duplicatas recentes (caso o state esteja errado / resetou)
    // pega as últimas 100 e remove qualquer msg do bot que tenha o nosso botão
    const batch = await ch.messages.fetch({ limit: 100 }).catch(() => null);
    if (batch && batch.size > 0) {
      const ours = batch.filter(
        (m) => m.author?.id === client.user.id && messageHasOurButton(m)
      );
      for (const m of ours.values()) {
        await m.delete().catch(() => {});
      }
    }

    // 2) envia UMA nova
    const sent = await ch.send(buildButtonPayload()).catch(() => null);
    if (sent) {
      state.buttonMessageId = sent.id;
      state.buttonChannelId = channelId;
      writeState(state);
    }
  });
}

async function logStatusChange(client, interaction, { threadId, userId, nome, oldStatus, newStatus }) {
  const logChannel = await client.channels.fetch(LOG_CHANNEL_ID_V2).catch(() => null);
  if (!logChannel) return;

  const actor = interaction.user;
  const thread = await client.channels.fetch(threadId).catch(() => null);

  const embed = new EmbedBuilder()
    .setTitle("🔩 Status de Evolução Alterado")
    .setColor(newStatus ? "#2ecc71" : "#e74c3c") // Verde para ativo, Vermelho para inativo
    .addFields(
      { name: "👤 Membro", value: `<@${userId}> (${nome})`, inline: true },
      { name: "🔧 Alterado por", value: `${actor}`, inline: true },
      { name: "📈 Status", value: `De \`${oldStatus ? 'ATIVO' : 'INATIVO'}\` para \`${newStatus ? 'ATIVO' : 'INATIVO'}\``, inline: false },
      { name: "📍 Tópico", value: thread ? `${thread}` : `*Tópico não encontrado (${threadId})*`, inline: false },
      { name: "🕒 Data", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
    )
    .setThumbnail(actor.displayAvatarURL())
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`fc_revert_status:${threadId}:${userId}:${oldStatus ? 'active' : 'inactive'}`)
      .setLabel("↩️ Reverter Ação")
      .setStyle(ButtonStyle.Secondary)
  );

  await logChannel.send({ embeds: [embed], components: [row] });
}

// =========================
// LEMBRETES
// =========================
function buildPublicReminderMessage() {
  const tags = CREATOR_FORM_NOTIFY_ROLES.map((id) => `<@&${id}>`).join(" ");

  return `${tags}

📌 **Lembrete (obrigatório): Feedbacks da Equipe Creator**
- Olhem as pessoas da hierarquia abaixo de vocês e acompanhem a evolução.
- Consultem por aqui:
  • ${HIERARQUIA_LINK_1}
  • ${HIERARQUIA_LINK_2}

✅ **Regra:** todo mundo deve deixar feedback **no tópico individual** de cada pessoa no canal <#${CREATOR_FORM_CHANNEL_ID}> (semanalmente e também sempre que surgir novidade: boa/ruim/destaque/ponto a ensinar/cobrar/ajustar).

🧾 **Alinhou alguém?** Registra no canal <#${ALINHAMENTO_LOG_CHANNEL_ID}> e depois joga o feedback no tópico dela(o) na evolução (thread).

⚠️ Não deixa acumular. Feedback constante = evolução rápida.`;
}

function buildDmMessage(member) {
  const username = member?.user?.username || member?.username || "tudo certo";

  return `👋 Ei ${username}, passando pra reforçar um ponto da gestão:

📌 **Feedbacks da Equipe Creator (obrigatório)**
- Dá uma olhada nas pessoas da hierarquia abaixo de você e acompanha evolução.
- Consultas:
  • ${HIERARQUIA_LINK_1}
  • ${HIERARQUIA_LINK_2}

✅ Você precisa registrar feedback no **tópico individual** de cada pessoa no canal <#${CREATOR_FORM_CHANNEL_ID}>:
- Pelo menos semanalmente
- E também sempre que aparecer algo novo (bom/ruim/destaque/ponto a corrigir/aprender/ensinar)

🧾 Se você alinhar alguém: registra no <#${ALINHAMENTO_LOG_CHANNEL_ID}> e depois deixa o feedback no tópico da pessoa.`;
}

function diffDays(fromIso, toDate = new Date()) {
  if (!fromIso) return Infinity;
  const from = new Date(fromIso);
  const ms = toDate.getTime() - from.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}
// =====================================================
// ✅ MEMBROS — CACHE + DEDUPLICAÇÃO DE REST
// =====================================================
//
// Usado somente para consultas onde não é necessário
// forçar uma leitura fresh dos cargos.
//
// Não substitui fetches administrativos que precisam
// obrigatoriamente consultar o estado mais recente.
async function fetchGuildMemberShared(
  guild,
  userId
) {
  try {
    if (
      !guild ||
      !userId
    ) {
      return null;
    }

    const id =
      String(userId);

    // ==================================================
    // 1. CACHE NATIVO
    // ==================================================

    const cached =
      guild.members.cache.get(
        id
      );

    if (cached) {
      return cached;
    }

    // ==================================================
    // 2. UMA PROMISE POR GUILD + MEMBRO
    // ==================================================

    globalThis.__SC_MEMBER_FETCH_PROMISES__ ??=
      new Map();

    const key =
      `${guild.id}:${id}`;

    const running =
      globalThis
        .__SC_MEMBER_FETCH_PROMISES__
        .get(
          key
        );

    if (running) {
      return await running;
    }

    // ==================================================
    // 3. REST SOMENTE SE NÃO ESTIVER NO CACHE
    // ==================================================

    const request =
      guild.members
        .fetch(
          id
        )
        .catch(
          () => null
        )
        .finally(
          () => {
            globalThis
              .__SC_MEMBER_FETCH_PROMISES__
              ?.delete(
                key
              );
          }
        );

    globalThis
      .__SC_MEMBER_FETCH_PROMISES__
      .set(
        key,
        request
      );

    return await request;
  } catch {
    return null;
  }
}
async function getRankingText(guild, client) {
  try {
    const weeklyRanking = await getWeeklyRanking(client);

    console.log("[FormsCreator] weeklyRanking bruto:", (weeklyRanking || []).slice(0, 15));

    const validMembers = [];
    let notFoundInGuild = 0;

    for (const user of weeklyRanking || []) {
      if (!user?.userId) continue;

      const points = Number(user.points || 0);
      if (!Number.isFinite(points) || points <= 0) continue;

const member =
  guild.members.cache.get(
    String(user.userId)
  ) ||
  await fetchGuildMemberShared(
    guild,
    String(user.userId)
  );

if (!member) {
  notFoundInGuild++;
  continue;
}

if (member.user?.bot) continue;

const memberId =
  String(user.userId);

if (
  EXCLUDE_FEEDBACK_USERS.includes(
    memberId
  )
) {
  continue;
}

const hasExcludedRole =
  member.roles.cache.some(
    role =>
      EXCLUDE_FEEDBACK_ROLES.includes(
        role.id
      )
  );

if (
  hasExcludedRole
) {
  continue;
}

validMembers.push({
  userId: memberId,
  points,
});
    }

    console.log("[FormsCreator] guild usada:", guild.id, guild.name);
    console.log("[FormsCreator] membros válidos no ranking:", validMembers.slice(0, 15));
    console.log("[FormsCreator] membros não encontrados nessa guild:", notFoundInGuild);

    validMembers.sort((a, b) => b.points - a.points);

    const top5 = validMembers.slice(0, 5);
    const bottom5 = [...validMembers].sort((a, b) => a.points - b.points).slice(0, 5);

    if (!validMembers.length) {
      return {
        publicText: "• Nenhum membro do ranking semanal pontuou na semana atual.",
        dmText: "• Nenhum membro do ranking semanal pontuou na semana atual.",
        topMentions: "",
        bottomMentions: "",
      };
    }

    const topLines = top5.length
      ? top5.map((u, i) => `• ${i + 1}. <@${u.userId}> (${u.points} pontos)`).join("\n")
      : "• Ninguém no TOP 5.";

const bottomLines = bottom5.length
  ? bottom5.map((u, i) => `• ${i + 1}. <@${u.userId}> (${u.points} pontos)`).join("\n")
  : "• Ninguém nos 5 com menos pontos.";

    const topMentions = top5.map((u) => `<@${u.userId}>`).join(" ");
    const bottomMentions = bottom5.map((u) => `<@${u.userId}>`).join(" ");

    return {
publicText:
  `**5 maiores pontuações da semana:**\n${topLines}\n\n` +
  `**5 menores pontuações da semana:**\n${bottomLines}`,
dmText:
  `**5 maiores pontuações da semana:**\n${topLines}\n\n` +
  `**5 menores pontuações da semana:**\n${bottomLines}`,
      topMentions,
      bottomMentions,
    };
  } catch (error) {
    console.error("[FormsCreator] Erro em getRankingText:", error);
    return {
      publicText: "• Ocorreu um erro ao buscar o ranking.",
      dmText: "• Ocorreu um erro ao buscar o ranking.",
      topMentions: "",
      bottomMentions: "",
    };
  }
}

async function runReminderJob(client) {
// ...

  const formChannel = await client.channels.fetch(CREATOR_FORM_CHANNEL_ID).catch(() => null);
  const guild = formChannel?.guild || null;
  if (!guild) {
    console.warn("[FormsCreator] runReminderJob: não consegui resolver a guild pelo canal do FormsCreator.");
    return;
  }

  const state = readState();
  const now = new Date();
  const days = diffDays(state.lastPublicReminderAt, now);
  // 🔄 AUTO-DESLIGAMENTO (Check de cargo obrigatório)
  let stateChanged = false;
for (const [threadId, reg] of Object.entries(state.registrations)) {
  if (!reg.active) continue;

  const member =
    await fetchGuildMemberShared(
      guild,
      reg.userId
    );

  if (
    !member ||
    !member.roles.cache.has(
      ROLE_REQUIRED_FOR_ACTIVE
    )
  ) {
      // Desliga automaticamente
      reg.active = false;
      stateChanged = true;

      try {
        const thread = await guild.channels.fetch(threadId).catch(() => null);
        if (thread) {
          const msg = await thread.messages.fetch(reg.messageId).catch(() => null);
          if (msg) {
            const oldEmbed = EmbedBuilder.from(msg.embeds[0]);
            const statusField = { name: "Status do Projeto", value: "🔴 Inativo (Sem cargo obrigatório)", inline: false };
            
            const fields = oldEmbed.data.fields || [];
            const statusIndex = fields.findIndex(f => f.name === "Status do Projeto");
            if (statusIndex > -1) fields[statusIndex] = statusField;
            else fields.push(statusField);
            oldEmbed.setFields(fields);

            const rowEdit = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`editar_id_${threadId}`).setLabel("✏️ Editar ID/Passaporte").setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId(`editar_area_${threadId}`).setLabel("✏️ Editar Área de Interesse").setStyle(ButtonStyle.Secondary)
            );

            const newStatusRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`fc_toggle_status:${threadId}:${reg.userId}:active`)
                .setLabel("Ligar ao Projeto")
                .setStyle(ButtonStyle.Success)
            );

            await msg.edit({ embeds: [oldEmbed], components: [rowEdit, newStatusRow] });
            
            // ✅ Anti-spam: verifica se já avisou
            const recent = await thread.messages.fetch({ limit: 5 }).catch(() => null);
            const alreadyWarned = recent && recent.some(m => m.author.id === client.user.id && m.content.includes("Membro desligado automaticamente"));
            
            if (!alreadyWarned) {
                await thread.send(`⚠️ **Sistema:** Membro desligado automaticamente do projeto por não possuir o cargo obrigatório <@&${ROLE_REQUIRED_FOR_ACTIVE}>.`);
            }
          }
        }
      } catch (e) { console.error(`[FormsCreator] Erro ao auto-desligar ${reg.userId}:`, e); }
    }
  }
  if (stateChanged) writeState(state);

  // 2. Busca ranking formatado para lembrete
  const rankingData = await getRankingText(guild, client);

  // 3. Envia lembretes (Alternado: Dia Público / Dia PV)
  // ✅ Se passou 2 dias ou mais (ou nunca rodou), manda Público e reseta timer
  if (days >= 2) {
    const ch = await client.channels.fetch(PUBLIC_REMINDER_CHANNEL_ID).catch(() => null);
    if (ch && ch.isTextBased()) {
      const roleMentions = CREATOR_FORM_NOTIFY_ROLES.map(id => `<@&${id}>`).join(" ");
      const rankingMentions = [rankingData.topMentions, rankingData.bottomMentions]
        .filter(Boolean)
        .join(" ")
        .trim();

      const embed = new EmbedBuilder()
        .setTitle("📌 Lembrete: Feedbacks da Equipe Creator")
        .setColor("#f1c40f")
        .setDescription(
          "Vamos manter a evolução da nossa equipe em dia! Por favor, deixem seus feedbacks com base no ranking de atividades da semana atual.\n\n" +
          rankingData.publicText +
          "\n\n" +
          `Acesse o tópico de cada um no canal <#${CREATOR_FORM_CHANNEL_ID}> para registrar seu feedback sobre desempenho, ajuda, evolução e pontos de melhoria.`
        )
        .setFooter({ text: "Feedback constante = evolução rápida." });

      await ch.send({
        content:
          `📌 **Lembrete: Feedbacks da Equipe Creator**\n` +
          `${roleMentions}` +
          (rankingMentions ? `\n\n👥 **Membros citados no ranking:**\n${rankingMentions}` : ""),
        embeds: [embed],
        allowedMentions: { parse: ["roles", "users"] }
      });
    }

    state.lastPublicReminderAt = now.toISOString();
    writeState(state);
  }

    // ✅ Se passou 1 dia (dia intercalado), manda PV
  else if (days === 1) {
    // Coleta membros únicos dos cargos definidos
    const membersToNotify = new Map();
    for (const roleId of DM_REMINDER_ROLES) {
      const role = guild.roles.cache.get(roleId);
      if (role) {
        for (const [id, member] of role.members) {
          if (!member.user.bot) membersToNotify.set(id, member);
        }
      }
    }

    for (const member of membersToNotify.values()) {
      const embedDM = new EmbedBuilder()
        .setTitle("📌 Lembrete Pessoal: Feedbacks da Equipe Creator")
        .setColor("#f1c40f")
        .setDescription(
          `Olá, ${member.displayName}! 👋\n\n` +
          "Vamos manter a evolução da nossa equipe em dia! Por favor, deixem seus feedbacks com base no ranking de atividades da semana atual.\n\n" +
          rankingData.dmText +
          "\n\n" +
          `Acesse o tópico de cada um no canal <#${CREATOR_FORM_CHANNEL_ID}> para registrar seu feedback sobre desempenho, ajuda, evolução e pontos de melhoria.`
        )
        .setFooter({ text: "Hoje é dia de lembrete no PV." });

      try {
        await sendBotDmLogged({
          client,

          target:
            member,

          guild,

          source:
            "formscreator.js • Lembrete pessoal de feedback",

          payload: {
            embeds: [
              embedDM
            ]
          }
        });
      } catch (e) {
        console.error(
          `[FormsCreator] Falha ao enviar DM para ${member.user?.tag || member.id}:`,
          e?.message || e
        );
      }
    }
  }
}

function isFormsCreatorMainRegisterMessage(msg, client) {
  if (!msg || msg.author?.id !== client.user.id) return false;
  if (!msg.embeds?.length) return false;

  const embed = msg.embeds[0];

  // ===================================================
  // 🪞 ESPELHO NÃO É REGISTRO ORIGINAL
  // ===================================================

  if (
    isFormsCreatorMirrorEmbed(
      embed
    )
  ) {
    return false;
  }

  const description = String(embed.description || "").trim();

  const hasMemberDescription = /^<@!?\d+>$/.test(description);

  const hasIdField = embed.fields?.some((field) =>
    String(field.name || "").includes("ID/Passaporte")
  );

  const hasAreaField = embed.fields?.some((field) =>
    String(field.name || "").includes("Área de Interesse")
  );

  const hasStatusField = embed.fields?.some((field) =>
    String(field.name || "") === "Status do Projeto"
  );

  return Boolean(hasMemberDescription && hasIdField && hasAreaField && hasStatusField);
}

function isFormsCreatorLegacyRegisterMessage(msg) {
  if (!msg?.embeds?.length) return false;

  const embed = msg.embeds[0];

  // ===================================================
  // 🪞 ESPELHO NÃO É REGISTRO LEGADO ORIGINAL
  // ===================================================

  if (
    isFormsCreatorMirrorEmbed(
      embed
    )
  ) {
    return false;
  }

  const raw = [
    embed.title || "",
    embed.description || "",
    ...(embed.fields || []).flatMap((field) => [
      field.name || "",
      field.value || "",
    ]),
  ].join("\n");

  const hasIdField = embed.fields?.some((field) =>
    String(field.name || "").includes("ID/Passaporte")
  );

  const hasAreaField = embed.fields?.some((field) =>
    String(field.name || "").includes("Área de Interesse")
  );

  const hasStatusField = embed.fields?.some((field) =>
    String(field.name || "") === "Status do Projeto"
  );

  const hasMentionOrUserId = /<@!?\d+>/.test(raw) || /\b\d{17,22}\b/.test(raw);

  return Boolean(hasIdField && hasAreaField && hasStatusField && hasMentionOrUserId);
}

function isFormsCreatorProtectedMessage(msg, client) {
  if (!msg || msg.author?.id !== client.user.id) return false;

  const content = String(msg.content || "");
  const rawEmbedText = (msg.embeds || [])
    .map((embed) => [
      embed.title || "",
      embed.description || "",
      embed.footer?.text || "",
      ...(embed.fields || []).flatMap((field) => [field.name || "", field.value || ""]),
    ].join("\n"))
    .join("\n");

  return (
    content.includes("🧾 **Novo alinhamento registrado") ||
    rawEmbedText.includes("ALINV1_FORMS_KEEP") ||
    rawEmbedText.includes("SantaCreators • Evolução pessoal • Alinhamento")
  );
}

function isFormsCreatorDuplicateStatusMessage(msg, client) {
  if (!msg || msg.author?.id !== client.user.id) return false;
  if (isFormsCreatorMainRegisterMessage(msg, client)) return false;
  if (isFormsCreatorProtectedMessage(msg, client)) return false;

  const content = String(msg.content || "");

  const hasWelcomeText =
    content.includes("Este é seu tópico de acompanhamento individual") ||
    content.includes("Bem-vindo(a)");

  const hasFormsButtons = msg.components?.some((row) =>
    row.components?.some((component) =>
      String(component.customId || "").startsWith("editar_") ||
      String(component.customId || "").startsWith("fc_toggle_status:")
    )
  );

  const hasEmbed = msg.embeds?.length > 0;
  const embed = msg.embeds?.[0];

  const hasStatusField = embed?.fields?.some((field) =>
    String(field.name || "") === "Status do Projeto"
  );

  const hasIdField = embed?.fields?.some((field) =>
    String(field.name || "").includes("ID/Passaporte")
  );

  const hasAreaField = embed?.fields?.some((field) =>
    String(field.name || "").includes("Área de Interesse")
  );

  const isStatusOnlyEmbed =
    hasEmbed &&
    hasStatusField &&
    !hasIdField &&
    !hasAreaField;

  return Boolean(
    hasWelcomeText ||
    hasFormsButtons ||
    isStatusOnlyEmbed
  );
}

async function cleanupFormsCreatorDuplicateMessagesInThread(thread, client) {
  const messages = await thread.messages.fetch({ limit: 100 }).catch(() => null);
  if (!messages) return 0;

  let fixedProtected = 0;

  // ✅ Remove botões APENAS dos alinhamentos protegidos dentro do Forms pessoal
  const protectedAlinhamentos = messages.filter((msg) =>
    isFormsCreatorProtectedMessage(msg, client) &&
    msg.components?.length > 0
  );

  for (const protectedMsg of protectedAlinhamentos.values()) {
    await protectedMsg.edit({
      components: [],
    }).catch(() => {});
    fixedProtected++;
  }

  const mainMessages = messages.filter((msg) =>
    isFormsCreatorMainRegisterMessage(msg, client)
  );
  const mainMessageIds = new Set(mainMessages.map((msg) => msg.id));
  const duplicates = messages.filter((msg) =>
    !mainMessageIds.has(msg.id) &&
    isFormsCreatorDuplicateStatusMessage(msg, client)
  );
  let deleted = 0;
  for (const duplicate of duplicates.values()) {
    await duplicate.delete().catch(() => {});
    deleted++;
  }
  return deleted + fixedProtected;
}

let isSyncing = false;

async function syncLegacyThreads(client, progressMsg = null) {
  if (isSyncing) {
    console.log("[FormsCreator] Sincronização já em andamento. Pulando.");

    if (progressMsg) {
      await progressMsg.edit(
        "⚠️ **Já existe uma sincronização em andamento.**\n" +
        "Aguarde ela terminar antes de rodar `!syncforms` novamente."
      ).catch(() => {});
    }

    return;
  }

  isSyncing = true;

  try {
  const state = readState();
  const channel = await client.channels.fetch(CREATOR_FORM_CHANNEL_ID).catch(() => null);

  if (!channel) {
    if (progressMsg) {
      await progressMsg.edit(
        `❌ **Não achei o canal do FormsCreator.**\n` +
        `Canal configurado: <#${CREATOR_FORM_CHANNEL_ID}>`
      ).catch(() => {});
    }

    return;
  }

  const allThreads = [];

  // 1. Threads Ativas
  const activeThreads = await channel.threads.fetchActive().catch(() => null);
  if (activeThreads?.threads) activeThreads.threads.forEach(t => allThreads.push(t));

  // 2. Threads Arquivadas (públicas e privadas)
  const fetchArchivedThreads = async (type) => {
    let lastId = null;
    while (true) {
      try {
        const options = { limit: 100, type };
        if (lastId) options.before = lastId;

        const archived = await channel.threads.fetchArchived(options).catch(() => null);
        if (!archived || !archived.threads.size) break;

        archived.threads.forEach(t => allThreads.push(t));
        lastId = archived.threads.last().id;

        if (archived.threads.size < 100) break;
        await new Promise(r => setTimeout(r, 1000)); // Pausa entre páginas
      } catch (e) {
        console.error(`[FormsCreator] Erro ao buscar página de arquivadas (${type}):`, e);
        break;
      }
    }
  };

  await fetchArchivedThreads('private');
  await fetchArchivedThreads('public');

  console.log(`[FormsCreator] Varrendo ${allThreads.length} threads (ativas + arquivadas)...`);

  if (progressMsg) {
    await progressMsg.edit(
      "🔄 **Sincronização em andamento...**\n" +
      `📁 Tópicos encontrados: **${allThreads.length}**\n` +
      "⏳ Processando registros..."
    ).catch(() => {});
  }

  let updates = 0;
  let checkedThreads = 0;
  for (const thread of allThreads) {
    checkedThreads++;

    const removedHistoricalCopies =
      await cleanupEvolutionHistoricalDuplicatesInThread(
        thread
      ).catch(
        (error) => {
          console.warn(
            `[FormsCreator] Não consegui limpar cópias históricas duplicadas da thread ${thread.id}:`,
            error?.message ||
            error
          );

          return 0;
        }
      );

    if (
      removedHistoricalCopies >
      0
    ) {
      updates +=
        removedHistoricalCopies;

      console.log(
        `[FormsCreator] ${removedHistoricalCopies} cópia(s) histórica(s) duplicada(s)/operacional(is) removida(s) da thread ${thread.name} (${thread.id}).`
      );
    }

    if (isHistoricalEvolutionThread(thread.id)) {
      await restoreHistoricalEvolutionThread(thread);
      continue;
    }

    if (progressMsg && (checkedThreads === 1 || checkedThreads % 10 === 0 || checkedThreads === allThreads.length)) {
      await progressMsg.edit(
        "🔄 **Sincronização em andamento...**\n" +
        `📁 Tópicos encontrados: **${allThreads.length}**\n` +
        `🔎 Tópicos verificados: **${checkedThreads}/${allThreads.length}**\n` +
        `🛠️ Atualizações/limpezas feitas: **${updates}**`
      ).catch(() => {});
    }

    try {
      if (thread.archived) await thread.setArchived(false).catch(() => {});

      const deletedDuplicates = await cleanupFormsCreatorDuplicateMessagesInThread(thread, client);

      if (deletedDuplicates > 0) {
        updates += deletedDuplicates;

        console.log(
          `[FormsCreator] ${deletedDuplicates} mensagem(ns) duplicada(s) removida(s) dentro da thread ${thread.name} (${thread.id}).`
        );
      }
    } catch (e) {
      console.error(`[FormsCreator] Erro ao limpar duplicados da thread ${thread.name}:`, e);
    }

    let reg = state.registrations[thread.id];
    let msg = null;
    let userId = null;

    // 1. Tenta achar registro existente
    if (reg) {
      userId = reg.userId;
      try {
        msg = await thread.messages.fetch(reg.messageId).catch(() => null);

        // ✅ FIX: nunca tenta editar mensagem que não foi enviada por este bot
        // Evita DiscordAPIError[50005]: Cannot edit a message authored by another user
        if (msg && msg.author?.id !== client.user.id) {
          console.warn(
            `[FormsCreator] State apontava para msg de outro autor (${msg.id}) na thread ${thread.name}. Procurando mensagem válida do bot...`
          );
          msg = null;
        }
      } catch {}
    }

    // 2. Se não achou msg pelo registro, tenta varrer o canal
    let legacyMsg = null;

    if (!msg) {
      try {
        const messages = await thread.messages.fetch({ limit: 50 }).catch(() => null);
        if (messages) {
          msg = messages.find((m) => isFormsCreatorMainRegisterMessage(m, client));
          legacyMsg = messages.find((m) => isFormsCreatorLegacyRegisterMessage(m));
        }
      } catch {}
    }

    // ✅ FIX: se achou mensagem antiga de outro bot/autor, recria uma mensagem oficial do bot atual
    if (!msg && legacyMsg) {
      try {
        const legacyEmbed = legacyMsg.embeds[0];

        const rawLegacyText = [
          legacyEmbed.title || "",
          legacyEmbed.description || "",
          ...(legacyEmbed.fields || []).flatMap((field) => [
            field.name || "",
            field.value || "",
          ]),
        ].join("\n");

        const mentionMatch = rawLegacyText.match(/<@!?(\d+)>/);
        const idMatch = rawLegacyText.match(/\b\d{17,22}\b/);

        userId = mentionMatch?.[1] || idMatch?.[0] || userId;

        const member = userId
          ? await channel.guild.members.fetch(userId).catch(() => null)
          : null;

        const nome =
          legacyEmbed.title?.replace("👤 ", "").trim() ||
          member?.displayName ||
          thread.name ||
          userId ||
          "Membro";

        const idCidade =
          legacyEmbed.fields?.find((f) => String(f.name || "").includes("ID/Passaporte"))?.value ||
          "?";

        const area =
          legacyEmbed.fields?.find((f) => String(f.name || "").includes("Área de Interesse"))?.value ||
          "?";

        const statusValue =
          legacyEmbed.fields?.find((f) => String(f.name || "") === "Status do Projeto")?.value ||
          "";

        const active = statusValue.includes("Ativo") && !statusValue.includes("Inativo");

        const avatarURL = member?.user?.displayAvatarURL({ size: 512 }) || "";

        const embed = new EmbedBuilder()
          .setTitle(`👤 ${nome}`)
          .setThumbnail(avatarURL)
          .setDescription(userId ? `<@${userId}>` : legacyEmbed.description || "")
          .addFields(
            { name: "📌 ID/Passaporte", value: idCidade, inline: true },
            { name: "📚 Área de Interesse", value: area, inline: true },
            { name: "Status do Projeto", value: active ? "🟢 Ativo" : "🔴 Inativo", inline: false }
          )
          .setColor("Purple");

        const rowEdit = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`editar_id_${thread.id}`).setLabel("✏️ Editar ID/Passaporte").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`editar_area_${thread.id}`).setLabel("✏️ Editar Área de Interesse").setStyle(ButtonStyle.Secondary)
        );

        const rowStatus = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`fc_toggle_status:${thread.id}:${userId}:${active ? 'inactive' : 'active'}`)
            .setLabel(active ? "Desligar do Projeto" : "Ligar ao Projeto")
            .setStyle(active ? ButtonStyle.Danger : ButtonStyle.Success)
        );

        msg = await thread.send({
          embeds: [embed],
          components: [rowEdit, rowStatus],
        });

        reg = {
          userId,
          nome,
          idCidade,
          area,
          active,
          messageId: msg.id,
        };

        state.registrations[thread.id] = reg;
        writeState(state);
        updates++;

        console.log(`[FormsCreator] Recriei mensagem oficial a partir de mensagem antiga na thread ${thread.name} (${thread.id}).`);
      } catch (e) {
        console.error(`[FormsCreator] Erro ao recriar mensagem oficial a partir da antiga na thread ${thread.name}:`, e);
      }
    }

    // ✅ FIX: se existe registro no state, mas não existe mensagem editável do bot,
    // cria uma nova mensagem oficial do FormsCreator sem apagar nada antigo.
    if (!msg && reg && userId) {
      try {
        const member = await channel.guild.members.fetch(userId).catch(() => null);
        const avatarURL = member?.user?.displayAvatarURL({ size: 512 }) || "";

        const embed = new EmbedBuilder()
          .setTitle(`👤 ${reg.nome || thread.name || userId}`)
          .setThumbnail(avatarURL)
          .setDescription(`<@${userId}>`)
          .addFields(
            { name: "📌 ID/Passaporte", value: reg.idCidade || "?", inline: true },
            { name: "📚 Área de Interesse", value: reg.area || "?", inline: true },
            { name: "Status do Projeto", value: reg.active ? "🟢 Ativo" : "🔴 Inativo", inline: false }
          )
          .setColor("Purple");

        const rowEdit = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`editar_id_${thread.id}`).setLabel("✏️ Editar ID/Passaporte").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`editar_area_${thread.id}`).setLabel("✏️ Editar Área de Interesse").setStyle(ButtonStyle.Secondary)
        );

        const rowStatus = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`fc_toggle_status:${thread.id}:${userId}:${reg.active ? 'inactive' : 'active'}`)
            .setLabel(reg.active ? "Desligar do Projeto" : "Ligar ao Projeto")
            .setStyle(reg.active ? ButtonStyle.Danger : ButtonStyle.Success)
        );

        msg = await thread.send({
          embeds: [embed],
          components: [rowEdit, rowStatus],
        });

        reg.messageId = msg.id;
        state.registrations[thread.id] = reg;
        writeState(state);
        updates++;

        console.log(`[FormsCreator] Recriei mensagem oficial na thread ${thread.name} (${thread.id}) porque a antiga não era editável.`);
      } catch (e) {
        console.error(`[FormsCreator] Erro ao recriar msg oficial na thread ${thread.name}:`, e);
      }
    }

    // 3. Se achou msg mas não tinha registro, cria agora
    if (msg && !reg) {
      const embed = msg.embeds[0];
      userId = embed.description.replace(/[<@>]/g, '');
      const nome = embed.title.replace('👤 ', '');
      const idCidade = embed.fields.find(f => f.name.includes('ID/Passaporte'))?.value || '?';
      const area = embed.fields.find(f => f.name.includes('Área de Interesse'))?.value || '?';
      
      // ✅ FIX: Verifica cargo JÁ na criação para não nascer errado (evita flip-flop)
      const member = await channel.guild.members.fetch(userId).catch(() => null);
      const hasRole = member && member.roles.cache.has(ROLE_REQUIRED_FOR_ACTIVE);

      reg = { userId, nome, idCidade, area, active: !!hasRole, messageId: msg.id };
      state.registrations[thread.id] = reg;
      // Salva imediatamente para evitar perda em crash/restart
      writeState(state);
      updates++;
    }

    // 4. Processa atualização (Cargo, Icon, Botões)
    if (reg && msg && userId) {
      try {
        const recentMessages = await thread.messages.fetch({ limit: 25 }).catch(() => null);
        if (recentMessages) {
          const duplicates = recentMessages.filter((m) =>
            m.id !== msg.id &&
            isFormsCreatorDuplicateStatusMessage(m, client)
          );

          for (const duplicate of duplicates.values()) {
            await duplicate.delete().catch(() => {});
            updates++;
          }
        }
      } catch (e) {
        console.error(`[FormsCreator] Erro ao limpar duplicados na thread ${thread.name}:`, e);
      }

      // ✅ REVALIDAÇÃO: Checa se o status do cargo mudou
      const member = await channel.guild.members.fetch(userId).catch(() => null);
      // Se membro existe E tem cargo => ATIVO. Se não existe (saiu) ou não tem cargo => INATIVO.
      const shouldBeActive = !!(member && member.roles.cache.has(ROLE_REQUIRED_FOR_ACTIVE));

      // Se o status no state está diferente da realidade, corrige
      if (reg.active !== shouldBeActive) {
        reg.active = shouldBeActive;
        updates++;
        if (!shouldBeActive) {
            const motivo = member ? "falta do cargo obrigatório" : "saiu do servidor";
            
            // ✅ Anti-spam: verifica se já avisou nas últimas 10 msgs
            const recent = await thread.messages.fetch({ limit: 10 }).catch(() => null);
            const alreadyWarned = recent && recent.some(m => m.author.id === client.user.id && m.content.includes("Status atualizado para INATIVO"));

            if (!alreadyWarned) {
                thread.send(`⚠️ **Sistema:** Status atualizado para INATIVO durante a sincronização (${motivo}).`).catch(() => {});
            }
        }
      }

      try {
        const oldEmbed = EmbedBuilder.from(msg.embeds[0]);
        
        // ✅ Atualiza Thumbnail (Icon) se o membro estiver no servidor
        if (member && member.user) {
            const avatarURL = member.user.displayAvatarURL();
            if (oldEmbed.data.thumbnail?.url !== avatarURL) {
                oldEmbed.setThumbnail(avatarURL);
            }
        }

        // ✅ Atualiza Campo de Status
        const statusField = { name: "Status do Projeto", value: reg.active ? "🟢 Ativo" : "🔴 Inativo", inline: false };
        const fields = oldEmbed.data.fields || [];
        const statusIndex = fields.findIndex(f => f.name === "Status do Projeto");
        if (statusIndex > -1) fields[statusIndex] = statusField;
        else fields.push(statusField);
        oldEmbed.setFields(fields);

        // ✅ Recria Botões (garante que o botão de Ligar/Desligar esteja certo)
        const rowEdit = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`editar_id_${thread.id}`).setLabel("✏️ Editar ID/Passaporte").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`editar_area_${thread.id}`).setLabel("✏️ Editar Área de Interesse").setStyle(ButtonStyle.Secondary)
        );

        const rowStatus = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`fc_toggle_status:${thread.id}:${userId}:${reg.active ? 'inactive' : 'active'}`)
            .setLabel(reg.active ? "Desligar do Projeto" : "Ligar ao Projeto")
            .setStyle(reg.active ? ButtonStyle.Danger : ButtonStyle.Success)
        );

        // Se thread arquivada, desarquiva pra editar
        if (thread.archived) await thread.setArchived(false).catch(() => {});

        await msg.edit({ embeds: [oldEmbed], components: [rowEdit, rowStatus] });

      } catch (e) {
        console.error(`[FormsCreator] Erro ao atualizar msg ${msg.id} na thread ${thread.name}:`, e);
      }
    }

    // ✅ Adiciona um delay consistente no final de cada iteração do loop para evitar rate limits
    await new Promise(r => setTimeout(r, 300));
  }

  if (updates > 0) {
    writeState(state);
    console.log(`[FormsCreator] Sincronizados/limpos ${updates} item(ns).`);
  }

  if (progressMsg) {
    await progressMsg.edit(
      "✅ **Sincronização finalizada.**\n" +
      `📁 Tópicos verificados: **${checkedThreads}/${allThreads.length}**\n` +
      `🧹 Itens atualizados/removidos: **${updates}**`
    ).catch(() => {});
  }
  } finally {
    isSyncing = false;
  }
}

// =========================
// ✅ EXPORTS PARA INTEGRAÇÃO
// =========================

// =====================================================
// CONSULTA RÁPIDA DO FORMSCREATOR PELO STATE
// =====================================================
//
// Não varre tópicos do Discord.
//
// É usada pelo Controle GI apenas para montar o link visual
// do Forms sem travar a criação/atualização do controle.
// =====================================================
export function findFormsCreatorThreadIdFastByUserId(
  userId
) {
  const rawTargetUserId =
    String(
      userId ||
      ""
    ).trim();

  if (!rawTargetUserId) {
    return null;
  }

  const targetUserId =
    resolveDiscordIdentity(
      rawTargetUserId
    ) ||
    rawTargetUserId;

  const identityIds =
    new Set([
      rawTargetUserId,
      targetUserId,

      ...(
        typeof getDiscordIdentityFamily ===
          "function"
          ? getDiscordIdentityFamily(
              targetUserId
            )
          : []
      ),
    ].filter(Boolean));

  const state =
    readState();

  const entry =
    Object.entries(
      state.registrations ||
      {}
    ).find(
      ([
        ,
        registration,
      ]) =>
        identityIds.has(
          String(
            registration?.userId ||
            ""
          ).trim()
        )
    );

  return (
    entry?.[0] ||
    null
  );
}
export async function createFormsCreatorRecord(
  client,
  {
    guildId,
    creatorId,
    targetId,
    targetName,
    targetPassaporte,
    area = "A Definir",
    skipDeepDuplicateScan = false,
  }
) {
  return await runWithFormsCreatorUserCreateLock(
    targetId,
    async () => {
      const guild = await client.guilds
        .fetch(guildId)
        .catch(() => null);

      if (!guild) {
        throw new Error(
          "Guilda não encontrada para criar registro FormsCreator."
        );
      }

      const canal = await client.channels
        .fetch(
          CREATOR_FORM_CHANNEL_ID
        )
        .catch(() => null);

      if (
        !canal ||
        !canal.isTextBased()
      ) {
        throw new Error(
          "Canal de FormsCreator não encontrado."
        );
      }

      // ===============================================
      // 🚫 ANTI-DUPLICAÇÃO
      // ===============================================
      //
      // Fluxos normais continuam usando a busca profunda.
      //
      // O Pedir Set pode usar skipDeepDuplicateScan=true
      // para não ficar preso varrendo centenas de tópicos
      // ativos/arquivados antes de concluir uma aprovação.
      //
      // Nesse modo rápido:
      //
      // - o state oficial continua impedindo duplicação;
      // - resolveFormsCreatorCanonicalTopic() continua
      //   reutilizando o tópico ativo da Evolução/GI;
      // - nenhuma busca profunda é removida dos outros fluxos.
      // ===============================================

      let existingThreadId =
        null;

      if (
        skipDeepDuplicateScan ===
        true
      ) {
        const fastState =
          readState();

        const existingEntry =
          Object.entries(
            fastState.registrations ||
            {}
          ).find(
            ([
              ,
              registration,
            ]) =>
              String(
                registration?.userId ||
                ""
              ).trim() ===
              String(
                targetId
              ).trim()
          );

        existingThreadId =
          existingEntry?.[0] ||
          null;
      } else {
        existingThreadId =
          await findOriginalFormsCreatorThreadIdByUserId(
            client,
            targetId
          ).catch(
            () => null
          );
      }

      if (existingThreadId) {
        const error =
          Object.assign(
            new Error(
              `O membro ${targetId} já possui um tópico FormsCreator: ${existingThreadId}`
            ),
            {
              code:
                "FORMSCREATOR_ALREADY_EXISTS",

              threadId:
                existingThreadId,
            }
          );

        throw error;
      }

      const membro = await guild.members
        .fetch(targetId)
        .catch(() => null);

    const avatarURL = membro?.user?.displayAvatarURL({ size: 512 }) || "";

    const topic =
      await resolveFormsCreatorCanonicalTopic(
        client,
        {
          guildId: guild.id,
          userId: targetId,
          channel: canal,
          topicName: targetName,
          reason:
            `Registro automático para ${targetName}`,

          // No fluxo automático do Pedir Set,
          // não espera a Evolução antes de criar o Forms.
          skipEvolutionLookup:
            skipDeepDuplicateScan ===
            true,
        }
      );

    if (!topic) {
      throw new Error(
        "Falha ao criar ou reutilizar thread no FormsCreator."
      );
    }

  const isActiveOnCreate = !!(membro && membro.roles.cache.has(ROLE_REQUIRED_FOR_ACTIVE));
const embed = new EmbedBuilder()
    .setTitle(`👤 ${targetName}`)
    .setThumbnail(avatarURL)
    .setDescription(`<@${targetId}>`)
    .addFields(
        { name: "📌 ID/Passaporte", value: targetPassaporte, inline: true },
        { name: "📚 Área de Interesse", value: area, inline: true },
        { name: "Status do Projeto", value: isActiveOnCreate ? "🟢 Ativo" : "🔴 Inativo", inline: false }
    )
    .setColor("Purple");

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`editar_id_${topic.id}`).setLabel("✏️ Editar ID/Passaporte").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`editar_area_${topic.id}`).setLabel("✏️ Editar Área de Interesse").setStyle(ButtonStyle.Secondary)
    );

    const statusRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`fc_toggle_status:${topic.id}:${targetId}:inactive`).setLabel("Desligar do Projeto").setStyle(ButtonStyle.Danger)
    );

    // ✅ CORREÇÃO: Adicionado try...catch e mensagem de boas-vindas
    let registroMsg;
    try {
        registroMsg = await topic.send({ embeds: [embed], components: [row, statusRow] });
        await topic.send({ content: `✨ Bem-vindo(a) <@${targetId}>! Este é seu tópico de acompanhamento individual.` });
    } catch (e) {
        console.error(`[FormsCreator] Falha ao enviar mensagem inicial para o tópico ${topic.id}:`, e);
    }

    const state = readState();
    // ✅ CORREÇÃO: Garante que registroMsg.id existe antes de usar
state.registrations[topic.id] = {
  userId: targetId,
  nome: targetName,
  idCidade: targetPassaporte,
  area,
  active: isActiveOnCreate,
  messageId: registroMsg?.id || null
};
    writeState(state);

    // =====================================================
    // PÓS-PROCESSAMENTO DO FORMSCREATOR
    // =====================================================
    //
    // O núcleo do Forms já existe neste ponto:
    //
    // - tópico criado;
    // - mensagem criada;
    // - state salvo.
    //
    // No Pedir Set, devolvemos o Forms imediatamente para
    // permitir que o Controle GI seja criado logo em seguida.
    //
    // Evolução, DM e log continuam existindo normalmente,
    // apenas rodam sem bloquear a sequência Forms -> GI.
    // =====================================================

    const finalizeFormsCreatorCreation =
      async () => {
        await syncEvolutionHierarchyForMember(client, {
            guildId: guild.id,
            userId: targetId,
            originalThreadId: topic.id,
            reason: "Registro de evolução criado",
        }).catch((error) => {
            console.error(
                `[FormsCreator] Falha ao sincronizar hierarquia de ${targetId}:`,
                error
            );
        });

        // ✅ CORREÇÃO: Enviar DM para o usuário
        if (membro) {
            try {
                await sendBotDmLogged({
                    client,

                    target:
                        membro,

                    guild,

                    source:
                        "formscreator.js • Novo tópico de acompanhamento",

                    payload: {
                        content:
                            `Olá! Um novo tópico de acompanhamento (<#${topic.id}>) foi criado para você no servidor **${guild.name}**. Fique de olho lá!`
                    }
                });
            } catch (e) {
                console.warn(
                    `[FormsCreator] Falha ao enviar DM para ${membro.user.tag} (${membro.id}). O usuário pode ter DMs desativadas.`
                );

                // Opcional: avisar no tópico que a DM falhou
                try {
                    await topic.send(
                        `⚠️ Não foi possível notificar <@${targetId}> por mensagem direta. Avise-o(a) manualmente sobre este tópico.`
                    );
                } catch {}
            }
        }

        // ✅ CORREÇÃO: Enviar log para o canal de logs
        try {
            const logChannel = await client.channels.fetch(LOG_CHANNEL_ID_V2).catch(() => null);

            if (
                logChannel &&
                logChannel.isTextBased()
            ) {
                const logEmbed =
                    new EmbedBuilder()
                        .setTitle("📝 Novo Registro de Evolução Criado")
                        .setColor("Blue")
                        .addFields(
                            {
                                name: "Membro",
                                value: `<@${targetId}>`,
                                inline: true
                            },
                            {
                                name: "Aprovado por",
                                value: `<@${creatorId}>`,
                                inline: true
                            },
                            {
                                name: "Tópico Criado",
                                value: `${topic}`,
                                inline: false
                            }
                        )
                        .setTimestamp();

                await logChannel.send({
                    embeds: [logEmbed]
                });
            }
        } catch (e) {
            console.error(
                `[FormsCreator] Falha ao enviar log de criação para o canal ${LOG_CHANNEL_ID_V2}:`,
                e
            );
        }
      };

    if (
      skipDeepDuplicateScan ===
      true
    ) {
      void finalizeFormsCreatorCreation()
        .catch(
          (error) => {
            console.error(
              `[FormsCreator] Pós-processamento do Pedir Set falhou para ${targetId}:`,
              error
            );
          }
        );
    } else {
      await finalizeFormsCreatorCreation();
    }

console.log(
  `[FormsCreator] Registro automático criado para ${targetName} (${targetId}) no tópico ${topic.id}`
);

return {
  threadId:
    topic.id,

  messageId:
    registroMsg?.id,
};
    }
  );
}

export async function findOriginalFormsCreatorThreadIdByUserId(clientOrUserId, maybeUserId = null) {
    const client = maybeUserId ? clientOrUserId : null;

    const rawTargetUserId =
        String(
            maybeUserId ||
            clientOrUserId ||
            ""
        ).trim();

    const targetUserId =
        resolveDiscordIdentity(
            rawTargetUserId
        ) ||
        rawTargetUserId;

    if (!targetUserId) return null;

    const identityIds =
        new Set([
            rawTargetUserId,
            targetUserId,

            ...(
                typeof getDiscordIdentityFamily ===
                    "function"
                    ? getDiscordIdentityFamily(
                        targetUserId
                    )
                    : []
            ),
        ].filter(Boolean));

    const matchesIdentity =
        (value) =>
            identityIds.has(
                String(
                    value ||
                    ""
                ).trim()
            );

    const state = readState();

function isOfficialFormsCreatorMessage(msg, threadId, expectedUserId) {
    if (!msg) return false;

    if (client && msg.author?.id !== client.user?.id) {
        return false;
    }

    const embed = msg.embeds?.[0];

    if (!embed) {
        return false;
    }

    // ===================================================
    // 🪞 NUNCA ACEITA UM ESPELHO COMO FORMS ORIGINAL
    // ===================================================

    if (
        isFormsCreatorMirrorEmbed(
            embed
        )
    ) {
        return false;
    }

    const description = String(embed.description || "").trim();

        const descriptionUserId =
            description.match(/^<@!?(\d{17,20})>$/)?.[1] || null;

        if (
            !matchesIdentity(
                descriptionUserId
            )
        ) {
            return false;
        }

        const fields = embed.fields || [];

        const hasPassaporteField = fields.some((field) =>
            String(field?.name || "")
                .toLowerCase()
                .includes("id/passaporte")
        );

        const hasAreaField = fields.some((field) =>
            String(field?.name || "")
                .toLowerCase()
                .includes("área de interesse")
        );

        const hasStatusField = fields.some((field) =>
            String(field?.name || "")
                .toLowerCase()
                .includes("status do projeto")
        );

        if (
            !hasPassaporteField ||
            !hasAreaField ||
            !hasStatusField
        ) {
            return false;
        }

        const components = msg.components || [];

        const hasFormsCreatorButton = components.some((row) =>
            (row.components || []).some((component) => {
                const customId = String(component?.customId || "");

                return (
                    customId === `editar_id_${threadId}` ||
                    customId === `editar_area_${threadId}` ||
                    customId.startsWith(
                        `fc_toggle_status:${threadId}:${expectedUserId}:`
                    )
                );
            })
        );

        /*
         * Registros antigos podem não possuir mais os botões,
         * então os campos oficiais + descrição EXATA com o usuário
         * já são suficientes.
         *
         * hasFormsCreatorButton fica como confirmação adicional
         * quando os botões existirem.
         */
        return (
            hasFormsCreatorButton ||
            (
                hasPassaporteField &&
                hasAreaField &&
                hasStatusField
            )
        );
    }

    async function validateStateRegistration(threadId, registration) {
        if (
            !matchesIdentity(
                registration?.userId
            )
        ) {
            return null;
        }

        if (!client) {
            return {
                threadId,
                thread: null,
                message: null,
            };
        }

        const thread = await client.channels
            .fetch(threadId)
            .catch(() => null);

        if (
            !thread ||
            !thread.isTextBased?.()
        ) {
            return null;
        }

        let registrationMessage = null;

        if (registration?.messageId) {
            registrationMessage = await thread.messages
                .fetch(registration.messageId)
                .catch(() => null);
        }

        if (
            registrationMessage &&
            isOfficialFormsCreatorMessage(
                registrationMessage,
                thread.id,
                targetUserId
            )
        ) {
            return {
                threadId: thread.id,
                thread,
                message: registrationMessage,
            };
        }

        const recentMessages = await thread.messages
            .fetch({ limit: 50 })
            .catch(() => null);

        if (!recentMessages) {
            return null;
        }

        const officialMessage = recentMessages.find((msg) =>
            isOfficialFormsCreatorMessage(
                msg,
                thread.id,
                targetUserId
            )
        );

        if (!officialMessage) {
            return null;
        }

        registration.messageId = officialMessage.id;

        return {
            threadId: thread.id,
            thread,
            message: officialMessage,
        };
    }

    // =====================================================
    // 1) VALIDA O STATE EM VEZ DE CONFIAR CEGAMENTE NELE
    // =====================================================

    const stateCandidates = [];

    for (
        const [threadId, registration]
        of Object.entries(state.registrations || {})
    ) {
        if (
            !matchesIdentity(
                registration?.userId
            )
        ) {
            continue;
        }

        const validated = await validateStateRegistration(
            threadId,
            registration
        );

        if (validated) {
            stateCandidates.push(validated);
        }
    }

    if (stateCandidates.length > 0) {
        stateCandidates.sort((a, b) => {
            const aCreated =
                Number(a.thread?.createdTimestamp || 0);

            const bCreated =
                Number(b.thread?.createdTimestamp || 0);

            return aCreated - bCreated;
        });

        const selected = stateCandidates[0];

        /*
         * Remove somente associações incorretas/duplicadas
         * do mesmo usuário no state.
         *
         * O tópico real do Discord NÃO é apagado.
         */
        for (
            const [threadId, registration]
            of Object.entries(state.registrations || {})
        ) {
            if (
                threadId !== selected.threadId &&
                matchesIdentity(
                    registration?.userId
                )
            ) {
                delete state.registrations[threadId];
            }
        }

        if (selected.message?.id) {
            state.registrations[selected.threadId] = {
                ...(state.registrations[selected.threadId] || {}),
                userId: targetUserId,
                messageId: selected.message.id,
            };
        }

        writeState(state);

        return selected.threadId;
    }

    // =====================================================
    // 2) FALLBACK: PROCURA NOS TÓPICOS REAIS
    // =====================================================

    if (!client) return null;

    const channel = await client.channels
        .fetch(CREATOR_FORM_CHANNEL_ID)
        .catch(() => null);

    if (
        !channel ||
        !channel.threads
    ) {
        return null;
    }

    const allThreadsMap = new Map();

    const activeThreads = await channel.threads
        .fetchActive()
        .catch(() => null);

    if (activeThreads?.threads) {
        activeThreads.threads.forEach((thread) => {
            allThreadsMap.set(thread.id, thread);
        });
    }

    const fetchArchivedThreads = async (type) => {
        let before = undefined;

        for (let page = 0; page < 10; page++) {
            const archived = await channel.threads
                .fetchArchived({
                    type,
                    limit: 100,
                    before,
                })
                .catch(() => null);

            if (!archived?.threads?.size) {
                break;
            }

            archived.threads.forEach((thread) => {
                allThreadsMap.set(thread.id, thread);
            });

            before = archived.threads.last()?.id;

            if (
                !before ||
                archived.threads.size < 100
            ) {
                break;
            }

            await new Promise((resolve) =>
                setTimeout(resolve, 500)
            );
        }
    };

    await fetchArchivedThreads("public");
    await fetchArchivedThreads("private");

    const allThreads = Array.from(
        allThreadsMap.values()
    );

    /*
     * Se por algum motivo existirem dois Forms oficiais
     * para a mesma pessoa, prioriza o tópico ORIGINAL,
     * ou seja, o mais antigo.
     *
     * Assim uma duplicata criada depois nunca assume
     * o lugar do registro canônico.
     */
    allThreads.sort(
        (a, b) =>
            Number(a.createdTimestamp || 0) -
            Number(b.createdTimestamp || 0)
    );

    for (const thread of allThreads) {
        const messages = await thread.messages
            .fetch({ limit: 50 })
            .catch(() => null);

        if (!messages) continue;

        const foundMsg = messages.find((msg) =>
            isOfficialFormsCreatorMessage(
                msg,
                thread.id,
                targetUserId
            )
        );

        if (!foundMsg) {
            continue;
        }

        const embed = foundMsg.embeds?.[0];

        const statusValue =
            embed?.fields?.find((field) =>
                String(field?.name || "")
                    .toLowerCase()
                    .includes("status do projeto")
            )?.value || "";

        state.registrations[thread.id] = {
            ...(state.registrations[thread.id] || {}),
            userId: targetUserId,

            nome:
                embed?.title?.replace("👤 ", "") ||
                thread.name ||
                targetUserId,

            idCidade:
                embed?.fields?.find((field) =>
                    String(field?.name || "")
                        .toLowerCase()
                        .includes("id/passaporte")
                )?.value ||
                state.registrations[thread.id]?.idCidade ||
                "?",

            area:
                embed?.fields?.find((field) =>
                    String(field?.name || "")
                        .toLowerCase()
                        .includes("área de interesse")
                )?.value ||
                state.registrations[thread.id]?.area ||
                "?",

            active:
                statusValue.includes("🟢") ||
                (
                    /\bativo\b/i.test(statusValue) &&
                    !/\binativo\b/i.test(statusValue)
                ),

            messageId: foundMsg.id,
        };

        /*
         * Limpa associações antigas/erradas do mesmo usuário.
         */
        for (
            const [savedThreadId, registration]
            of Object.entries(state.registrations || {})
        ) {
            if (
                savedThreadId !== thread.id &&
                matchesIdentity(
                    registration?.userId
                )
            ) {
                delete state.registrations[savedThreadId];
            }
        }

        writeState(state);

        return thread.id;
    }

    return null;
}

export async function findFormsCreatorThreadIdByUserId(
    clientOrUserId,
    maybeUserId = null
) {
    const client =
        maybeUserId
            ? clientOrUserId
            : null;

    const targetUserId =
        String(
            maybeUserId ||
            clientOrUserId ||
            ""
        ).trim();

    if (!targetUserId) {
        return null;
    }

    const originalThreadId =
        await findOriginalFormsCreatorThreadIdByUserId(
            clientOrUserId,
            maybeUserId
        );

    /*
     * Sem uma instância do client,
     * mantém o comportamento antigo.
     */

    if (!client) {
        return originalThreadId;
    }

    /*
     * Com o client, retorna o tópico
     * correspondente ao cargo atual.
     */

    return await getActiveEvolutionThreadId(
        client,
        targetUserId,
        {
            guildId: GUILD_ID,
            originalThreadId,
            reason: "Consulta do tópico ativo",
        }
    ).catch((error) => {
        console.error(
            "[FormsCreator] Falha ao resolver tópico ativo:",
            error
        );

        return null;
    });
}

export async function getFormsCreatorPersonData(client, userId) {
    const targetUserId = String(userId || "").trim();

    if (!targetUserId) {
        return null;
    }

    const threadId = await findOriginalFormsCreatorThreadIdByUserId(
        client,
        targetUserId
    );

    if (!threadId) {
        return null;
    }

    const state = readState();
    const registration =
        state.registrations?.[threadId] || null;

    const thread = client
        ? await client.channels
            .fetch(threadId)
            .catch(() => null)
        : null;

    let registrationMessage = null;

    if (
        thread?.isTextBased?.() &&
        registration?.messageId
    ) {
        registrationMessage =
            await thread.messages
                .fetch(registration.messageId)
                .catch(() => null);
    }

    if (
        !registrationMessage &&
        thread?.isTextBased?.()
    ) {
        const recentMessages =
            await thread.messages
                .fetch({ limit: 20 })
                .catch(() => null);

        if (recentMessages) {
            registrationMessage =
                recentMessages.find((msg) => {
                    const raw = [
                        msg.content || "",
                        ...msg.embeds.map((embed) => [
                            embed.title || "",
                            embed.description || "",
                            ...(embed.fields || []).flatMap(
                                (field) => [
                                    field.name || "",
                                    field.value || "",
                                ]
                            ),
                            embed.footer?.text || "",
                        ].join("\n")),
                    ].join("\n");

                    return (
                        raw.includes(
                            `<@${targetUserId}>`
                        ) ||
                        raw.includes(
                            `<@!${targetUserId}>`
                        ) ||
                        raw.includes(
                            targetUserId
                        )
                    );
                }) || null;
        }
    }

    const embed =
        registrationMessage?.embeds?.[0] ||
        null;

    const getEmbedFieldValue = (
        fieldNamePart
    ) => {
        if (!embed?.fields?.length) {
            return null;
        }

        const normalizedFieldNamePart =
            String(
                fieldNamePart || ""
            ).toLowerCase();

        const field =
            embed.fields.find(
                (currentField) =>
                    String(
                        currentField?.name || ""
                    )
                        .toLowerCase()
                        .includes(
                            normalizedFieldNamePart
                        )
            );

        return field?.value || null;
    };

    const nome =
        registration?.nome ||
        embed?.title?.replace("👤 ", "") ||
        thread?.name ||
        null;

    const idCidade =
        registration?.idCidade ||
        getEmbedFieldValue(
            "ID/Passaporte"
        ) ||
        null;

    const area =
        registration?.area ||
        getEmbedFieldValue(
            "Área de Interesse"
        ) ||
        null;

    const embedStatus =
        getEmbedFieldValue(
            "Status do Projeto"
        );

    let active = null;

    if (
        typeof registration?.active ===
        "boolean"
    ) {
        active = registration.active;
    } else if (embedStatus) {
        if (
            embedStatus.includes(
                "🟢"
            ) ||
            /\bativo\b/i.test(
                embedStatus
            )
        ) {
            active = true;
        } else if (
            embedStatus.includes(
                "🔴"
            ) ||
            /\binativo\b/i.test(
                embedStatus
            )
        ) {
            active = false;
        }
    }

    const guildId =
        thread?.guild?.id ||
        null;

    return {
        found: true,
        userId: targetUserId,
        threadId,
        threadName:
            thread?.name || null,
        threadUrl:
            guildId
                ? `https://discord.com/channels/${guildId}/${threadId}`
                : null,
        messageId:
            registration?.messageId ||
            registrationMessage?.id ||
            null,
        nome,
        idCidade,
        area,
        active,
        statusText:
            embedStatus || null,
        threadCreatedAt:
            thread?.createdAt
                ? thread.createdAt.toISOString()
                : null,

        personalTicketHistory:
            getPersonalTicketHistoryForUser(
                targetUserId,
                {
                    limit: 60,
                    includeAi: true,
                }
            ),

        serviceTicketHistory:
            getServiceTicketOperationalHistoryForUser(
                targetUserId,
                {
                    limit: 60,
                }
            ),
    };
}

export async function findFormsCreatorThreadLinkByUserId(client, userId, guildId = null) {
    const threadId = await findFormsCreatorThreadIdByUserId(client, userId);
    if (!threadId) return null;

    let resolvedGuildId = guildId;

    if (!resolvedGuildId && client) {
        const thread = await client.channels.fetch(threadId).catch(() => null);
        resolvedGuildId = thread?.guild?.id || null;
    }

    if (!resolvedGuildId) return null;

    return `https://discord.com/channels/${resolvedGuildId}/${threadId}`;
}

export async function migrateFormsCreatorDiscordId(
  client,
  {
    oldUserId,
    newUserId,
    actor = null,
  } = {
    oldUserId: null,
    newUserId: null,
    actor: null,
  }
) {
  const oldId =
    String(
      oldUserId || ""
    ).trim();

  const newId =
    String(
      newUserId || ""
    ).trim();

  if (
    !/^\d{17,20}$/.test(
      oldId
    )
  ) {
    throw new Error(
      "ID Discord antigo inválido no FormsCreator."
    );
  }

  if (
    !/^\d{17,20}$/.test(
      newId
    )
  ) {
    throw new Error(
      "Novo ID Discord inválido no FormsCreator."
    );
  }

  if (
    oldId === newId
  ) {
    return {
      status:
        "unchanged",

      oldUserId:
        oldId,

      newUserId:
        newId,

      threadId:
        null,

      messageId:
        null,

      mirrorStatus:
        "unchanged",

      evolutionStatus:
        "unchanged",
    };
  }

  const originalThreadId =
    await findOriginalFormsCreatorThreadIdByUserId(
      client,
      oldId
    );

  if (!originalThreadId) {
    return {
      status:
        "not_found",

      oldUserId:
        oldId,

      newUserId:
        newId,

      threadId:
        null,

      messageId:
        null,

      mirrorStatus:
        "not_found",

      evolutionStatus:
        "not_found",
    };
  }

  const state =
    readState();

  state.registrations ||=
    {};

  const collision =
    Object.entries(
      state.registrations
    ).find(
      ([
        threadId,
        registration
      ]) =>
        threadId !==
          originalThreadId &&
        String(
          registration?.userId ||
          ""
        ).trim() ===
          newId
    );

  if (collision) {
    throw new Error(
      `O novo Discord já possui outro registro FormsCreator no tópico ${collision[0]}.`
    );
  }

  const registration =
    state.registrations[
      originalThreadId
    ];

  if (!registration) {
    throw new Error(
      "Registro FormsCreator não encontrado no state."
    );
  }

  if (
    String(
      registration.userId ||
      ""
    ).trim() !== oldId
  ) {
    throw new Error(
      "O FormsCreator encontrado não pertence mais ao Discord antigo informado."
    );
  }

  const thread =
    await client.channels
      .fetch(
        originalThreadId
      )
      .catch(
        () => null
      );

  if (
    !thread ||
    !thread.isTextBased?.()
  ) {
    throw new Error(
      "Tópico original do FormsCreator não encontrado."
    );
  }

  if (thread.archived) {
    await thread
      .setArchived(false)
      .catch(
        () => {}
      );
  }

  let registrationMessage =
    registration.messageId
      ? await thread.messages
          .fetch(
            registration.messageId
          )
          .catch(
            () => null
          )
      : null;

  if (
    !registrationMessage ||
    !isFormsCreatorMainRegisterMessage(
      registrationMessage,
      client
    )
  ) {
    const recent =
      await thread.messages
        .fetch({
          limit: 100,
        })
        .catch(
          () => null
        );

    registrationMessage =
      recent?.find(
        message => {
          if (
            !isFormsCreatorMainRegisterMessage(
              message,
              client
            )
          ) {
            return false;
          }

          const description =
            String(
              message
                .embeds?.[0]
                ?.description ||
              ""
            ).trim();

          return (
            description ===
              `<@${oldId}>` ||
            description ===
              `<@!${oldId}>`
          );
        }
      ) || null;
  }

  if (!registrationMessage) {
    throw new Error(
      "Mensagem principal do FormsCreator não encontrada para trocar o Discord."
    );
  }

  const guild =
    thread.guild ||
    await client.guilds
      .fetch(
        GUILD_ID
      )
      .catch(
        () => null
      );

  const newMember =
    guild
      ? await guild.members
          .fetch(
            newId
          )
          .catch(
            () => null
          )
      : null;

  const newUser =
    newMember?.user ||
    client.users.cache.get(
      newId
    ) ||
    await client.users
      .fetch(
        newId
      )
      .catch(
        () => null
      );

  const nextEmbed =
    EmbedBuilder.from(
      registrationMessage
        .embeds[0]
    )
      .setDescription(
        `<@${newId}>`
      );

  if (newUser) {
    nextEmbed.setThumbnail(
      newUser.displayAvatarURL({
        size: 512,
      })
    );
  }

  const rowEdit =
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            `editar_id_${originalThreadId}`
          )
          .setLabel(
            "✏️ Editar ID/Passaporte"
          )
          .setStyle(
            ButtonStyle.Secondary
          ),

        new ButtonBuilder()
          .setCustomId(
            `editar_area_${originalThreadId}`
          )
          .setLabel(
            "✏️ Editar Área de Interesse"
          )
          .setStyle(
            ButtonStyle.Secondary
          )
      );

  const rowStatus =
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            `fc_toggle_status:${originalThreadId}:${newId}:${registration.active ? "inactive" : "active"}`
          )
          .setLabel(
            registration.active
              ? "Desligar do Projeto"
              : "Ligar no Projeto"
          )
          .setStyle(
            registration.active
              ? ButtonStyle.Danger
              : ButtonStyle.Success
          )
      );

  await registrationMessage.edit({
    embeds: [
      nextEmbed,
    ],

    components: [
      rowEdit,
      rowStatus,
    ],
  });

  registration.discordIdHistory =
    Array.isArray(
      registration
        .discordIdHistory
    )
      ? registration
          .discordIdHistory
      : [];

  registration
    .discordIdHistory
    .push({
      from:
        oldId,

      to:
        newId,

      changedAtMs:
        Date.now(),

      changedBy:
        String(
          actor?.id ||
          actor ||
          ""
        ).trim() ||
        null,
    });

  registration.userId =
    newId;

  registration.messageId =
    registrationMessage.id;

  registration.lastDiscordMigration =
    {
      from:
        oldId,

      to:
        newId,

      changedAtMs:
        Date.now(),

      changedBy:
        String(
          actor?.id ||
          actor ||
          ""
        ).trim() ||
        null,
    };

  state.registrations[
    originalThreadId
  ] =
    registration;

  writeState(state);

  // =====================================================
  // MIGRA HISTÓRICO ESTRUTURADO DO TICKET PESSOAL
  // =====================================================

  const personalTicketHistoryMigration =
    migratePersonalTicketHistoryDiscordId(
      oldId,
      newId
    );

  // =====================================================
  // DEIXA REGISTRO VISÍVEL DA TROCA DENTRO DO FORMS
  // =====================================================

  try {
    const identityAuditEmbed =
      new EmbedBuilder()
        .setColor(
          0x5865f2
        )
        .setTitle(
          "🔁 Identidade Discord atualizada"
        )
        .setDescription(
          [
            "Este Forms continua pertencendo à mesma pessoa.",
            "",
            `📤 **Discord anterior:** <@${oldId}> (\`${oldId}\`)`,
            `📥 **Discord atual:** <@${newId}> (\`${newId}\`)`,
            actor?.id
              ? `👤 **Alterado por:** <@${actor.id}> (\`${actor.id}\`)`
              : "🤖 **Alterado por:** Sistema",
            `🕒 **Data:** <t:${Math.floor(Date.now() / 1000)}:F>`,
            "",
            `🎫 **Histórico do ticket migrado:** ${
              personalTicketHistoryMigration?.moved || 0
            } registro(s).`,
            "",
            "📚 Nenhum feedback anterior foi reiniciado. O histórico permanece vinculado à mesma trajetória."
          ].join(
            "\n"
          )
        )
        .setFooter({
          text:
            "SantaCreators • Histórico de identidade"
        })
        .setTimestamp();

    await thread.send({
      embeds: [
        identityAuditEmbed
      ],

      allowedMentions: {
        parse: []
      }
    });
  } catch (error) {
    console.warn(
      "[FormsCreator] Não consegui escrever a auditoria da troca dentro do Forms:",
      error?.message ||
      error
    );
  }

  let evolutionStatus =
    "synced";

  try {
    if (
      typeof migrateEvolutionHierarchyDiscordId ===
      "function"
    ) {
      await migrateEvolutionHierarchyDiscordId(
        client,
        {
          guildId:
            guild?.id ||
            GUILD_ID,

          oldUserId:
            oldId,

          newUserId:
            newId,

          originalThreadId,

          reason:
            `Troca de Discord ${oldId} -> ${newId}`,
        }
      );
    } else {
      await syncEvolutionHierarchyForMember(
        client,
        {
          guildId:
            guild?.id ||
            GUILD_ID,

          userId:
            newId,

          originalThreadId,

          reason:
            `Troca de Discord ${oldId} -> ${newId}`,
        }
      );
    }
  } catch (error) {
    evolutionStatus =
      "partial";

    console.error(
      `[FormsCreator] Registro migrado, mas a hierarquia de evolução ficou pendente para ${newId}:`,
      error?.message ||
      error
    );
  }

  let mirrorStatus =
    "synced";

  try {
    const mirrorResult =
      await syncFormsCreatorActiveMirror(
        client,
        {
          originalThreadId,

          registration,

          reason:
            `Troca de Discord ${oldId} -> ${newId}`,
        }
      );

    mirrorStatus =
      mirrorResult?.status ||
      "synced";
  } catch (error) {
    mirrorStatus =
      "partial";

    console.error(
      `[FormsCreator] Registro migrado, mas o espelho ativo ficou pendente para ${newId}:`,
      error?.message ||
      error
    );
  }

  try {
    const logChannel =
      await client.channels
        .fetch(
          LOG_CHANNEL_ID_V2
        )
        .catch(
          () => null
        );

    if (
      logChannel
        ?.isTextBased?.()
    ) {
      const logEmbed =
        new EmbedBuilder()
          .setTitle(
            "🔁 Troca de Discord no FormsCreator"
          )
          .setColor(
            "Purple"
          )
          .addFields(
            {
              name:
                "Discord anterior",

              value:
                `<@${oldId}> (\`${oldId}\`)`,

              inline:
                false,
            },

            {
              name:
                "Discord atual",

              value:
                `<@${newId}> (\`${newId}\`)`,

              inline:
                false,
            },

            {
              name:
                "Tópico preservado",

              value:
                `<#${originalThreadId}>`,

              inline:
                true,
            },

            {
              name:
                "Executado por",

              value:
                actor?.id
                  ? `<@${actor.id}>`
                  : "Sistema",

              inline:
                true,
            }
          )
          .setFooter({
            text:
              "O tópico e todo o histórico permanecem os mesmos; somente a identidade atual foi vinculada.",
          })
          .setTimestamp();

      await logChannel.send({
        embeds: [
          logEmbed,
        ],
      });
    }
  } catch (error) {
    console.error(
      "[FormsCreator] Falha ao registrar log da troca de Discord:",
      error?.message ||
      error
    );
  }

  const finalStatus =
    mirrorStatus ===
      "synced" &&
    evolutionStatus ===
      "synced"
      ? "synced"
      : "partial";

  return {
    status:
      finalStatus,

    oldUserId:
      oldId,

    newUserId:
      newId,

    threadId:
      originalThreadId,

    messageId:
      registrationMessage.id,

    mirrorStatus,

    evolutionStatus,
  };
}

export async function setFormsCreatorStatus(client, { threadId, newStatus, actor, fromGi = false }) {
    const state = readState();
    const registration = state.registrations?.[threadId];

    if (!registration) {
        throw new Error("Registro do FormsCreator não encontrado para alterar o status.");
    }
    
    if (registration.active === newStatus) return; // Nenhuma mudança necessária

    await _performStatusUpdate(client, { registration, threadId, newStatus, actor, fromGi });
    const latestState = readState();
    latestState.registrations ||= {};
    latestState.registrations[threadId] = {
        ...(latestState.registrations[threadId] || {}),
        ...registration,
    };
    writeState(latestState);
}

export async function setFormsCreatorArea(client, { threadId, newArea, actor }) {
    const normalizedThreadId =
        String(threadId || "").trim();

    const normalizedArea =
        String(newArea || "").trim();

    if (!normalizedThreadId) {
        throw new Error(
            "Thread do FormsCreator não informada."
        );
    }

    if (!normalizedArea) {
        throw new Error(
            "Nova Área de Interesse não informada."
        );
    }

    const state =
        readState();

    let registration =
        state.registrations?.[
            normalizedThreadId
        ] || null;

    const thread =
        await client.channels
            .fetch(normalizedThreadId)
            .catch(() => null);

    if (
        !thread ||
        !thread.isTextBased()
    ) {
        throw new Error(
            "Tópico do FormsCreator não encontrado."
        );
    }

    try {
        if (
            thread.archived ||
            isHistoricalEvolutionThread(thread.id)
        ) {
            await thread.edit({
                archived: false,
                locked: isHistoricalEvolutionThread(thread.id)
                    ? true
                    : thread.locked,
                reason: "Atualizando Área de Interesse",
            });
        }

        let registroMsg = null;

    if (
        registration?.messageId
    ) {
        registroMsg =
            await thread.messages
                .fetch(
                    registration.messageId
                )
                .catch(() => null);

        if (
            registroMsg &&
            registroMsg.author?.id !== client.user?.id
        ) {
            registroMsg = null;
        }
    }

    if (!registroMsg) {
        const mensagens =
            await thread.messages
                .fetch({
                    limit: 100
                })
                .catch(() => null);

        if (mensagens) {
            registroMsg =
                mensagens.find(
                    (msg) =>
                        isFormsCreatorMainRegisterMessage(
                            msg,
                            client
                        )
                ) || null;
        }
    }

    if (!registroMsg) {
        throw new Error(
            "Mensagem principal do FormsCreator não encontrada."
        );
    }

    const originalEmbed =
        registroMsg.embeds?.[0];

    if (!originalEmbed) {
        throw new Error(
            "Embed principal do FormsCreator não encontrado."
        );
    }

    const embed =
        EmbedBuilder.from(
            originalEmbed
        );

    const fields =
        Array.isArray(embed.data.fields)
            ? [...embed.data.fields]
            : [];

    const areaFieldIndex =
        fields.findIndex(
            (field) =>
                String(field?.name || "")
                    .toLowerCase()
                    .includes(
                        "área de interesse"
                    )
        );

    if (
        areaFieldIndex < 0
    ) {
        throw new Error(
            "Campo Área de Interesse não encontrado no FormsCreator."
        );
    }

    const oldArea =
        String(
            fields[areaFieldIndex]?.value ||
            registration?.area ||
            "A Definir"
        ).trim();

    fields[areaFieldIndex] = {
        ...fields[areaFieldIndex],
        name:
            fields[areaFieldIndex]?.name ||
            "📚 Área de Interesse",
        value:
            normalizedArea,
        inline:
            fields[areaFieldIndex]?.inline !== false
    };

    embed.setFields(
        fields
    );

    await registroMsg.edit({
        embeds: [embed]
    });

    if (!registration) {
        const description =
            String(
                originalEmbed.description ||
                ""
            ).trim();

        const userId =
            description.match(
                /^<@!?(\d{17,20})>$/
            )?.[1] || null;

        const idCidade =
            originalEmbed.fields
                ?.find(
                    (field) =>
                        String(
                            field?.name ||
                            ""
                        ).includes(
                            "ID/Passaporte"
                        )
                )
                ?.value || "?";

        const statusField =
            originalEmbed.fields
                ?.find(
                    (field) =>
                        String(
                            field?.name ||
                            ""
                        ) ===
                        "Status do Projeto"
                );

        const active =
            statusField
                ? String(
                    statusField.value ||
                    ""
                  ).includes("Ativo")
                : false;

        registration = {
            userId,
            nome:
                String(
                    originalEmbed.title ||
                    ""
                )
                    .replace(
                        /^👤\s*/,
                        ""
                    )
                    .trim() ||
                "Membro",
            idCidade,
            area:
                normalizedArea,
            active,
            messageId:
                registroMsg.id
        };
    }

    registration.area =
        normalizedArea;

    registration.messageId =
        registroMsg.id;

    state.registrations[
        normalizedThreadId
    ] = registration;

    writeState(
        state
    );

    // =====================================================
    // HISTÓRICO VISÍVEL DA ALTERAÇÃO DE ÁREA
    // =====================================================
    //
    // Mantém dentro do próprio Forms uma linha da trajetória.
    //
    // Não substitui feedback humano.
    // Não inventa avaliação.
    //
    // Apenas registra objetivamente:
    //
    // - área anterior;
    // - nova área;
    // - executor;
    // - data/hora;
    // - continuidade do histórico.
    //
    // =====================================================

    if (
        oldArea !==
        normalizedArea
    ) {
        try {
            const changedAtUnix =
                Math.floor(
                    Date.now() /
                    1000
                );

            const transitionEmbed =
                new EmbedBuilder()
                    .setColor(
                        0x8e44ad
                    )
                    .setTitle(
                        "🤖 Atualização automática da trajetória"
                    )
                    .setDescription(
                        [
                            "Uma mudança de função/área foi registrada no acompanhamento desta pessoa.",
                            "",
                            `📤 **Área anterior:** \`${oldArea}\``,
                            `📥 **Nova área:** \`${normalizedArea}\``,
                            "",
                            actor?.id
                                ? `👤 **Alteração realizada por:** <@${actor.id}> (\`${actor.id}\`)`
                                : "🤖 **Alteração realizada por:** Sistema",
                            `🕒 **Data da alteração:** <t:${changedAtUnix}:F>`,
                            "",
                            "📚 O histórico anterior permanece preservado. Esta alteração representa apenas uma nova etapa da trajetória dentro da SantaCreators."
                        ].join(
                            "\n"
                        )
                    )
                    .setFooter({
                        text:
                            "SantaCreators • histórico de evolução"
                    })
                    .setTimestamp();

            await thread.send({
                embeds: [
                    transitionEmbed
                ],

                allowedMentions: {
                    parse: []
                }
            });
        } catch (error) {
            console.warn(
                `[FormsCreator] Não consegui registrar a mudança de área no tópico ${normalizedThreadId}:`,
                error?.message ||
                error
            );
        }
    }

    let activeTopicUpdated = true;
    let activeTopicSyncPending = false;

    if (registration.userId) {
        // =====================================================
        // SINCRONIZA O TÓPICO ATIVO ANTES DE FINALIZAR
        // =====================================================
        //
        // O registro original já foi atualizado e salvo.
        //
        // Aqui aguardamos a Evolução terminar de reconciliar a
        // hierarquia antes de devolver o resultado ao Controle GI.
        // Isso impede que o GI finalize enquanto o espelho ainda
        // está usando um activeThreadId antigo.
        // =====================================================

        try {
            const mirrorResult =
                await syncFormsCreatorActiveMirror(
                    client,
                    {
                        originalThreadId:
                            normalizedThreadId,
                        registration,
                        reason:
                            "Área do FormsCreator alterada",
                    }
                );

            activeTopicUpdated =
                mirrorResult?.ok !==
                false;

            activeTopicSyncPending =
                mirrorResult?.ok ===
                false;

            if (
                mirrorResult?.ok ===
                false
            ) {
                console.warn(
                    `[FormsCreator] Espelho do tópico ativo ainda pendente para ${normalizedThreadId}.`
                );
            }
        } catch (error) {
            activeTopicUpdated =
                false;

            activeTopicSyncPending =
                true;

            console.error(
                "[FormsCreator] Registro original atualizado; espelho do tópico ativo pendente:",
                error
            );
        }
    }

    console.log(
        `[FormsCreator] Área da thread ${normalizedThreadId} alterada ` +
        `de "${oldArea}" para "${normalizedArea}" ` +
        `por ${actor?.id || "sistema"}.`
    );

    return {
        threadId:
            normalizedThreadId,
        messageId:
            registroMsg.id,
        oldArea,
        newArea:
            normalizedArea,
        activeTopicUpdated,
        activeTopicSyncPending
    };
    } finally {
        await restoreHistoricalEvolutionThread(thread);
    }
}

// =========================
// EXPORTS (pra plugar no teu index)
// =========================

// 1) chama isso dentro do teu client.on('ready')
export async function formsCreatorOnReady(client) {
  try {
    // ✅ SEMPRE: apaga o antigo e cria um novo ao reiniciar
    await replaceButtonMessage(client);

    // ✅ NOVO: Sincroniza registros antigos (adiciona botões e salva no state)
    await syncLegacyThreads(client);

    // ✅ Consolida tópicos duplicados FormsCreator x Evolução/GI
    await cleanupFormsCreatorDuplicateThreads(
      client
    );

    // ✅ EVOLUÇÃO EM TRÊS FASES
    // Configura os canais, confere os cargos atuais
    // e cria/trava os tópicos necessários.
    await initializeEvolutionHierarchy(
      client,
      (userId) =>
        findOriginalFormsCreatorThreadIdByUserId(
          client,
          userId
        )
    );
    // =====================================================
    // FORMS COMPLETO NO TÓPICO ATIVO
    // =====================================================

    if (
      !client
        .__FORMS_CREATOR_ACTIVE_MIRROR_ROLE_LISTENER__
    ) {
      client
        .__FORMS_CREATOR_ACTIVE_MIRROR_ROLE_LISTENER__ =
        true;

      client.on(
        "guildMemberUpdate",
        async (
          oldMember,
          member
        ) => {
          try {
            if (
              member.guild.id !==
                GUILD_ID ||
              member.user.bot
            ) {
              return;
            }

            const relevantRoleChanged =
              [...EVOLUTION_PROFILE_ROLE_IDS]
                .some(
                  roleId =>
                    oldMember.roles.cache.has(
                      roleId
                    ) !==
                    member.roles.cache.has(
                      roleId
                    )
                );

            if (
              !relevantRoleChanged
            ) {
              return;
            }

            const areaTransitionMap =
              globalThis
                .__SC_GI_AREA_TRANSITION__;

            const areaTransitionUntil =
              areaTransitionMap instanceof Map
                ? Number(
                    areaTransitionMap.get(
                      String(
                        member.id
                      )
                    ) ||
                    0
                  )
                : 0;

            if (
              areaTransitionUntil &&
              areaTransitionUntil <=
                Date.now()
            ) {
              areaTransitionMap.delete(
                String(
                  member.id
                )
              );
            }

            if (
              areaTransitionUntil >
              Date.now()
            ) {
              // =================================================
              // ALTERAÇÃO INTERNA DO CONTROLE GI
              // =================================================
              //
              // O próprio fluxo que editou a Área sincronizará
              // o Forms completo assim que terminar o pacote de
              // cargos. Não dispara um segundo espelho em paralelo.
              // =================================================
              return;
            }

            const roleUpdateInProgress =
              Number(
                globalThis.__SC_ROLE_BYPASS__?.get(
                  String(member.id)
                ) ||
                0
              ) >
              Date.now();

            const hasEvolutionRole =
              [...EVOLUTION_PROFILE_ROLE_IDS]
                .some(
                  roleId =>
                    member.roles.cache.has(
                      roleId
                    )
                );

            if (
              roleUpdateInProgress &&
              !hasEvolutionRole
            ) {
              // O desligamento GI atualizará o Forms depois da remoção dos cargos.
              return;
            }

            const state =
              readState();

            const registrationEntry =
              Object.entries(
                state.registrations ||
                  {}
              ).find(
                (
                  [
                    ,
                    registration,
                  ]
                ) =>
                  String(
                    registration
                      ?.userId ||
                      ""
                  ) ===
                  member.id
              );

            if (
              !registrationEntry
            ) {
              return;
            }

            const [
              originalThreadId,
              registration,
            ] =
              registrationEntry;

            await syncFormsCreatorActiveMirror(
              client,
              {
                originalThreadId,
                registration,
                reason:
                  "Mudança de cargo: sincronização do Forms completo no tópico ativo",
              }
            );
          } catch (
            error
          ) {
            console.error(
              "[FormsCreator] Falha ao atualizar espelho após mudança de cargo:",
              error
            );
          }
        }
      );
    }

    // =====================================================
    // BACKFILL
    // =====================================================
    //
    // Garante que registros criados antes desta melhoria
    // também recebam o card completo no tópico ativo.
    // =====================================================

    void (
      async () => {
        const state =
          readState();

        for (
          const [
            originalThreadId,
            registration,
          ]
          of Object.entries(
            state.registrations ||
              {}
          )
        ) {
          try {
            await syncFormsCreatorActiveMirror(
              client,
              {
                originalThreadId,
                registration,
                reason:
                  "Backfill do Forms completo no tópico ativo",
              }
            );
          } catch (
            error
          ) {
            console.error(
              `[FormsCreator] Backfill pendente em ${originalThreadId}:`,
              error
            );
          }

          await new Promise(
            resolve =>
              setTimeout(
                resolve,
                150
              )
          );
        }
      }
    )();
    // ✅ LISTENER RESERVA: garante que comandos como !syncforms funcionem
    // mesmo se o index.js não estiver chamando formsCreatorHandleMessage.
    if (!client.__FORMS_CREATOR_MESSAGE_LISTENER__) {
      client.__FORMS_CREATOR_MESSAGE_LISTENER__ = true;

      client.on("messageCreate", async (message) => {
        try {
          await formsCreatorHandleMessage(message, client);
        } catch (err) {
          console.error("❌ FormsCreator listener reserva falhou:", err);
        }
      });

      console.log("✅ FormsCreator listener reserva de messageCreate instalado.");
    }

    // todo dia às 16:00 (SP)
    cron.schedule("0 16 * * *", () => runReminderJob(client), {
      timezone: "America/Sao_Paulo",
    });

    // console.log("✅ FormsCreator pronto (sempre substitui o botão + cron 16:00 SP).");
  } catch (e) {
    console.error("❌ Erro no setup FormsCreator:", e);
  }
}

// 2) chama isso dentro do teu client.on('messageCreate')
export async function formsCreatorHandleMessage(message, client) {
  if (!message.guild || message.author.bot) return false;

  // =====================================================
  // FEEDBACK DO FORMS -> TICKET PESSOAL
  // =====================================================
  //
  // Quando alguém da equipe escreve dentro do Forms
  // individual de uma pessoa, avisamos a IA.
  //
  // A IA poderá utilizar esse comentário para conversar
  // naturalmente com o membro no ticket pessoal.
  //
  // IMPORTANTE:
  //
  // - a mensagem original permanece normalmente no Forms;
  // - não removemos nada;
  // - o próprio membro escrevendo no próprio Forms não
  //   dispara uma orientação para ele mesmo;
  // - a deduplicação evita emitir duas vezes caso este
  //   handler seja chamado tanto pelo index quanto pelo
  //   listener reserva do FormsCreator.
  // =====================================================

  if (
    message.guild.id === GUILD_ID &&
    message.channel?.isThread?.()
  ) {
    const state =
      readState();

    const registration =
      state.registrations?.[message.channel.id] ||
      Object.values(state.registrations || {}).find(item =>
        item?.active === true &&
        String(item?.activeMirrorThreadId || "") === message.channel.id
      ) ||
      null;

    const rawTargetUserId =
      String(
        registration?.userId ||
        ""
      ).trim();

    const targetUserId =
      resolveDiscordIdentity(
        rawTargetUserId
      ) ||
      rawTargetUserId;

    // =====================================================
    // AUTORREPARO DE IDENTIDADE DO FORMS
    // =====================================================
    //
    // Pode existir um Forms antigo cujo state ainda guarda
    // o Discord anterior.
    //
    // Se o módulo central já conhece a migração:
    //
    // Discord antigo -> Discord atual
    //
    // executamos a própria rotina oficial de migração do
    // Forms. Assim não fazemos uma alteração parcial.
    //
    // A rotina oficial preserva:
    //
    // - tópico original;
    // - histórico;
    // - comentários;
    // - espelho/evolução;
    // - histórico estruturado;
    // - identidade anterior.
    // =====================================================

    if (
      registration &&
      rawTargetUserId &&
      targetUserId &&
      rawTargetUserId !==
        targetUserId
    ) {
      await migrateFormsCreatorDiscordId(
        client,
        {
          oldUserId:
            rawTargetUserId,

          newUserId:
            targetUserId,

          actor:
            null,
        }
      ).catch(
        error => {
          console.warn(
            `[FormsCreator] Autorreparo de Discord pendente ${rawTargetUserId} -> ${targetUserId}:`,
            error?.message ||
            error
          );
        }
      );
    }

    if (
      targetUserId &&
      targetUserId !==
        String(
          message.author.id
        )
    ) {
      const seen =
        globalThis.__SC_FORMS_COMMENT_BRIDGE_SEEN__ ||
        new Set();

      globalThis.__SC_FORMS_COMMENT_BRIDGE_SEEN__ =
        seen;

      if (
        !seen.has(
          message.id
        )
      ) {
        seen.add(
          message.id
        );

        const cleanupTimer =
          setTimeout(
            () => {
              seen.delete(
                message.id
              );
            },
            60 *
              60 *
              1000
          );

        cleanupTimer.unref?.();

        const attachments =
          [
            ...(
              message.attachments
                ?.values?.() ||
              []
            ),
          ].map(
            attachment => ({
              name:
                attachment?.name ||
                "arquivo",

              url:
                attachment?.url ||
                "",

              contentType:
                attachment?.contentType ||
                "",

              size:
                Number(
                  attachment?.size ||
                  0
                ),
            })
          );

        for (
          const embed
          of message.embeds ||
          []
        ) {
          const videoUrl =
            embed?.video?.proxyURL ||
            embed?.video?.url ||
            null;

          if (
            videoUrl
          ) {
            attachments.push({
              name:
                /medal/i.test(
                  String(
                    embed?.provider
                      ?.name ||
                    embed?.url ||
                    ""
                  )
                )
                  ? "medal-forms.mp4"
                  : "video-forms.mp4",

              url:
                String(
                  videoUrl
                ),

              contentType:
                "video/mp4",

              size:
                0,
            });
          }
        }

        dashEmit(
          "formscreator:comentario_registrado",
          {
            guildId:
              message.guild.id,

            userId:
              targetUserId,

            threadId:
              message.channel.id,

            messageId:
              message.id,

            authorId:
              message.author.id,

            authorName:
              message.member?.displayName ||
              message.author.globalName ||
              message.author.username,

            content:
              String(
                message.content ||
                ""
              ),

            attachments,

            createdAtMs:
              Number(
                message.createdTimestamp ||
                Date.now()
              ),

            messageUrl:
              message.url ||
              `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.id}`,
          }
        );
      }
    }
  }

  const content = message.content.toLowerCase().trim();

   if (content.startsWith("!forms")) {
    if (content.startsWith("!forms")) {
    console.log("[FormsCreator] HandleMessage recebeu:", {
      author: message.author?.tag,
      content,
      guild: message.guild?.name,
      channel: message.channel?.id,
    });
  }
  }

  // comando: !formscreator
  if (content.startsWith("!formscreator")) {
    const temPermissao = hasPermission(message.member, message.author.id);
    if (!temPermissao) {
      await message.channel.send("🚫 Você não tem permissão.");
      return true;
    }

    await replaceButtonMessage(client);

    await message.channel.send("✅ Botão recriado: apaguei o antigo e deixei apenas 1 no canal.");
    return true;
  }

  // comando: !syncforms (força atualização dos botões em registros antigos)
  if (content.startsWith("!syncforms")) {
    const temPermissao = hasPermission(message.member, message.author.id);
    if (!temPermissao) {
      await message.channel.send("🚫 Você não tem permissão.");
      return true;
    }

    const progressMsg = await message.channel.send(
      "🔄 **Iniciando sincronização do FormsCreator...**\n" +
      "📌 Buscando tópicos ativos e arquivados..."
    );

    await syncLegacyThreads(client, progressMsg);

    const removedDuplicateThreads =
      await cleanupFormsCreatorDuplicateThreads(
        client
      );

    await initializeEvolutionHierarchy(
      client,
      (userId) =>
        findOriginalFormsCreatorThreadIdByUserId(
          client,
          userId
        )
    );

    await progressMsg.edit(
      "✅ **Sincronização finalizada.**\n" +
      "🧹 Registros, espelhos e hierarquia foram conferidos.\n" +
      `🗑️ Tópicos duplicados removidos: **${removedDuplicateThreads}**`
    ).catch(() => {});

    return true;
  }

  // teste público
  if (content.startsWith("!testpublic")) {
    const temPermissao = hasPermission(message.member, message.author.id);
    if (!temPermissao) {
      await message.channel.send("🚫 Você não tem permissão.");
      return true;
    }

    const ch = await client.channels.fetch(PUBLIC_REMINDER_CHANNEL_ID).catch(() => null);
    if (!ch || !ch.isTextBased()) {
      await message.channel.send("❌ Não achei o canal público.");
      return true;
    }

    const rankingData = await getRankingText(message.guild, client);
    const mentions = CREATOR_FORM_NOTIFY_ROLES.map(id => `<@&${id}>`).join(" ");
    const rankingMentions = [rankingData.topMentions, rankingData.bottomMentions]
      .filter(Boolean)
      .join(" ")
      .trim();

    const embed = new EmbedBuilder()
      .setTitle("📌 Lembrete: Feedbacks da Equipe Creator")
      .setColor("#f1c40f")
      .setDescription(
        "Vamos manter a evolução da nossa equipe em dia! Por favor, deixem seus feedbacks com base no ranking de atividades da semana atual.\n\n" +
        rankingData.publicText +
        "\n\n" +
        `Acesse o tópico de cada um no canal <#${CREATOR_FORM_CHANNEL_ID}> para registrar seu feedback sobre desempenho, ajuda, evolução e pontos de melhoria.`
      )
      .setFooter({ text: "Feedback constante = evolução rápida." });

    await ch.send({
      content:
        `📌 **Lembrete: Feedbacks da Equipe Creator**\n${mentions}` +
        (rankingMentions ? `\n\n👥 **Membros citados no ranking:**\n${rankingMentions}` : ""),
      embeds: [embed],
      allowedMentions: { parse: ["roles", "users"] }
    });

    await message.channel.send("✅ Enviei a mensagem pública agora no canal de lembrete.");
    return true;
  }

    // teste dm
  if (content.startsWith("!testdm")) {
    console.log("[FormsCreator] comando !testdm detectado");

    const temPermissao = hasPermission(message.member, message.author.id);
    console.log("[FormsCreator] permissão !testdm:", temPermissao);

    if (!temPermissao) {
      await message.channel.send("🚫 Você não tem permissão.");
      return true;
    }

    try {
      const rankingData = await getRankingText(message.guild, client);
      console.log("[FormsCreator] rankingData !testdm:", rankingData);

      const embedDM = new EmbedBuilder()
        .setTitle("📌 Lembrete Pessoal: Feedbacks da Equipe Creator")
        .setColor("#f1c40f")
        .setDescription(
          `Olá, ${message.member.displayName}! 👋\n\n` +
          "Vamos manter a evolução da nossa equipe em dia! Por favor, deixem seus feedbacks com base no ranking de atividades da semana atual.\n\n" +
          rankingData.dmText +
          "\n\n" +
          `Acesse o tópico de cada um no canal <#${CREATOR_FORM_CHANNEL_ID}> para registrar seu feedback sobre desempenho, ajuda, evolução e pontos de melhoria.`
        )
        .setFooter({ text: "Hoje é dia de lembrete no PV." });

      await message.author.send({
        embeds: [embedDM]
      });

      console.log("[FormsCreator] DM enviada com sucesso para:", message.author?.tag);

      await message.channel.send("✅ Te mandei a DM de teste com o ranking.");
    } catch (err) {
      console.error("[FormsCreator] erro no !testdm:", err);
      await message.channel.send(
        "❌ Não consegui te mandar DM. Provavelmente você bloqueou DM do servidor."
      );
    }
    return true;
  }

  // teste do lembrete completo
  if (content.startsWith("!testrunreminder")) {
    const temPermissao = hasPermission(message.member, message.author.id);
    if (!temPermissao) {
      await message.channel.send("🚫 Você não tem permissão.");
      return true;
    }

    try {
      console.log("[FormsCreator] iniciando !testrunreminder");
      await runReminderJob(client);
      await message.channel.send("✅ runReminderJob executado manualmente.");
    } catch (err) {
      console.error("[FormsCreator] erro no !testrunreminder:", err);
      await message.channel.send("❌ Erro ao executar runReminderJob manualmente.");
    }
    return true;
  }

  return false;
}

// 3) chama isso dentro do teu client.on('interactionCreate')
export async function formsCreatorHandleInteraction(interaction, client) {
  try {


        // BOTÃO -> sincroniza e limpa duplicados
    if (interaction.isButton?.() && interaction.customId === SYNC_FORMS_BUTTON_CUSTOM_ID) {
      const temPermissao = hasPermission(interaction.member, interaction.user.id);
      if (!temPermissao) {
        await interaction.reply({
          content: "🚫 Sem permissão.",
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }

      await interaction.reply({
        content:
          "🔄 **Iniciando sincronização do FormsCreator...**\n" +
          "📌 Vou varrer tópicos ativos/arquivados e tentar remover mensagens duplicadas.",
        flags: MessageFlags.Ephemeral,
      });

      const progressMsg = await interaction.fetchReply().catch(() => null);

      await syncLegacyThreads(client, progressMsg);

      const removedDuplicateThreads =
        await cleanupFormsCreatorDuplicateThreads(
          client
        );

      await initializeEvolutionHierarchy(
        client,
        (userId) =>
          findOriginalFormsCreatorThreadIdByUserId(
            client,
            userId
          )
      );

      await interaction.editReply({
        content:
          "✅ **Sincronização finalizada.**\n" +
          "🧹 Registros, espelhos e hierarquia foram conferidos.\n" +
          `🗑️ Tópicos duplicados removidos: **${removedDuplicateThreads}**`,
      }).catch(() => {});

      return true;
    }
    // BOTÃO -> abre modal
    if (interaction.isButton?.() && interaction.customId === BUTTON_CUSTOM_ID) {
      const temPermissao = hasPermission(interaction.member, interaction.user.id);
      if (!temPermissao) {
        await interaction.reply({
          content: "🚫 Sem permissão.",
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }

      const modal = new ModalBuilder()
        .setCustomId("form_equipecreator")
        .setTitle("Registro de Equipe Creator")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("idDiscord")
              .setLabel("ID do Discord do membro")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("nome")
              .setLabel("Nome do membro")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("idCidade")
              .setLabel("ID/Passaporte da cidade")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("area")
              .setLabel("Área desejada na coordenação")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );

      await interaction.showModal(modal);
      return true;
    }

// FORM -> cria thread + embed
if (interaction.isModalSubmit?.() && interaction.customId === "form_equipecreator") {
  await interaction.deferReply({
    flags: MessageFlags.Ephemeral,
  });

  const idDiscord = interaction.fields.getTextInputValue("idDiscord").trim();
  const nome = interaction.fields.getTextInputValue("nome").trim();
  const idCidade = interaction.fields.getTextInputValue("idCidade").trim();
  const area = interaction.fields.getTextInputValue("area").trim();

  return await runWithFormsCreatorUserCreateLock(
    idDiscord,
    async () => {
      const guild = interaction.guild;

      const canal = await client.channels
        .fetch(
          CREATOR_FORM_CHANNEL_ID
        )
        .catch(() => null);

      if (
        !guild ||
        !canal ||
        !canal.isTextBased()
      ) {
        await interaction.editReply({
          content:
            "❌ Não achei o canal do formulário.",
        });

        return true;
      }

      // =================================================
      // 🚫 ANTI-DUPLICAÇÃO
      // =================================================
      //
      // Antes de criar QUALQUER tópico, procura
      // um Forms original já existente para este ID.
      // =================================================

      const existingThreadId =
        await findOriginalFormsCreatorThreadIdByUserId(
          client,
          idDiscord
        ).catch(() => null);

      if (existingThreadId) {
        await interaction.editReply({
          content:
            `⚠️ **Este membro já possui um tópico de evolução.**\n\n` +
            `👤 Membro: <@${idDiscord}>\n` +
            `📌 Tópico existente: <#${existingThreadId}>\n\n` +
            `❌ Nenhum novo tópico foi criado.`,
        });

        return true;
      }

      const membro = await guild.members
        .fetch(idDiscord)
        .catch(() => null);

      const avatarURL =
        membro?.user?.displayAvatarURL({
          size: 512,
        }) || "";

      const topic =
        await resolveFormsCreatorCanonicalTopic(
          client,
          {
            guildId:
              guild.id,

            userId:
              idDiscord,

            channel:
              canal,

            topicName:
              nome,

            reason:
              "Registro de membro da Equipe Creator",
          }
        );

      if (!topic) {
        await interaction.editReply({
          content:
            "❌ Falha ao criar ou reutilizar thread.",
        });

        return true;
      }

      const isActiveOnCreate =
        !!(
          membro &&
          membro.roles.cache.has(
            ROLE_REQUIRED_FOR_ACTIVE
          )
        );

      const embed =
        new EmbedBuilder()
          .setTitle(
            `👤 ${nome}`
          )
          .setThumbnail(
            avatarURL
          )
          .setDescription(
            `<@${idDiscord}>`
          )
          .addFields(
            {
              name:
                "📌 ID/Passaporte",
              value:
                idCidade,
              inline:
                true,
            },
            {
              name:
                "📚 Área de Interesse",
              value:
                area,
              inline:
                true,
            },
            {
              name:
                "Status do Projeto",
              value:
                isActiveOnCreate
                  ? "🟢 Ativo"
                  : "🔴 Inativo",
              inline:
                false,
            }
          )
          .setColor(
            "Purple"
          );

      const row =
        new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(
                `editar_id_${topic.id}`
              )
              .setLabel(
                "✏️ Editar ID/Passaporte"
              )
              .setStyle(
                ButtonStyle.Secondary
              ),

            new ButtonBuilder()
              .setCustomId(
                `editar_area_${topic.id}`
              )
              .setLabel(
                "✏️ Editar Área de Interesse"
              )
              .setStyle(
                ButtonStyle.Secondary
              )
          );

      // ✅ Adiciona botões de status
      const statusRow =
        new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(
                `fc_toggle_status:${topic.id}:${idDiscord}:inactive`
              )
              .setLabel(
                "Desligar do Projeto"
              )
              .setStyle(
                ButtonStyle.Danger
              )
          );

      if (
        !membro ||
        !membro.roles.cache.has(
          ROLE_REQUIRED_FOR_ACTIVE
        )
      ) {
        setTimeout(
          () =>
            topic
              .send(
                `⚠️ **Atenção:** Este membro não possui o cargo <@&${ROLE_REQUIRED_FOR_ACTIVE}>. Ele será desligado automaticamente no próximo ciclo se não receber o cargo.`
              )
              .catch(() => {}),
          2000
        );
      }

      const registroMsg =
        await topic.send({
          embeds: [
            embed,
          ],

          components: [
            row,
            statusRow,
          ],
        }).catch((e) => {
          console.error(
            `[FormsCreator] Falha ao enviar registro inicial na thread ${topic.id}:`,
            e
          );

          return null;
        });

      // ===============================================
      // ✅ SALVA NO ESTADO
      // ===============================================

      const state =
        readState();

      state.registrations[
        topic.id
      ] = {
        userId:
          idDiscord,

        nome,

        idCidade,

        area,

        active:
          isActiveOnCreate,

        messageId:
          registroMsg?.id ||
          null,
      };

      writeState(
        state
      );

      await syncEvolutionHierarchyForMember(
        client,
        {
          guildId:
            guild.id,

          userId:
            idDiscord,

          originalThreadId:
            topic.id,

          reason:
            "Registro de evolução criado pelo formulário",
        }
      ).catch((error) => {
        console.error(
          `[FormsCreator] Falha ao sincronizar hierarquia de ${idDiscord}:`,
          error
        );
      });

      // DMs pros cargos
      const linkDoTopico =
        `https://discord.com/channels/${guild.id}/${topic.id}`;

      const jaNotificado =
        new Set();

      const nomeDoCargo =
        guild.roles.cache.get(
          CREATOR_EQUIPE_ROLE_ID
        )?.name ||
        "Equipe Creator";

      for (
        const roleId
        of CREATOR_FORM_NOTIFY_ROLES
      ) {
        const role =
          guild.roles.cache.get(
            roleId
          );

        const membrosRole =
          role?.members;

        if (!membrosRole) {
          continue;
        }

        for (
          const m
          of membrosRole.values()
        ) {
          if (m.user.bot) {
            continue;
          }

          if (
            jaNotificado.has(
              m.id
            )
          ) {
            continue;
          }

          jaNotificado.add(
            m.id
          );

          try {
            await m.send({
              content:
                `📥 Novo registro da equipe **${nomeDoCargo}** aberto por <@${interaction.user.id}>.\n` +
                `👤 Membro: <@${idDiscord}>\n` +
                `🔗 Abrir tópico: ${linkDoTopico}`,

              embeds: [
                new EmbedBuilder()
                  .setImage(
                    avatarURL
                  )
                  .setColor(
                    "Blurple"
                  )
                  .setTitle(
                    nome
                  ),
              ],
            });
          } catch {}
        }
      }

      await interaction.editReply({
        content:
          `✅ Registro criado no tópico ${topic.toString()}`,
      });

      // ✅ AGORA: sempre apaga o botão antigo e cria um novo quando cria registro
      await replaceButtonMessage(
        client
      );

      return true;
    }
  );
}



    // ✅ Botão de Ligar/Desligar
    if (interaction.isButton?.() && interaction.customId.startsWith("fc_toggle_status:")) {
      if (!hasManagePermission(interaction.member, interaction.user.id)) {
        return interaction.reply({
          content: "🚫 Sem permissão.",
          flags: MessageFlags.Ephemeral,
        });
      }

      await interaction.deferReply({
        flags: MessageFlags.Ephemeral,
      });

      const [, threadId, userId, targetStatusStr] = interaction.customId.split(":");
      const newActiveState = targetStatusStr === 'active';

      const state = readState();
      let registration = state.registrations?.[threadId];

      // 🛠️ AUTO-RECOVERY: Se não achou no state, tenta reconstruir da mensagem
      if (!registration) {
        const msg = interaction.message;
        if (msg && msg.embeds.length > 0) {
           const embed = msg.embeds[0];
           const descId = embed.description?.replace(/[<@>]/g, '');
           
           if (descId === userId) {
               const nome = embed.title?.replace('👤 ', '') || 'Membro';
               const idCidade = embed.fields.find(f => f.name.includes('ID/Passaporte'))?.value || '?';
               const area = embed.fields.find(f => f.name.includes('Área de Interesse'))?.value || '?';
               
               // Assume estado atual baseado no botão que foi clicado
               const statusField = embed.fields.find(f => f.name === "Status do Projeto");
               const currentActive = statusField ? statusField.value.includes("Ativo") : !newActiveState; 

               registration = {
                   userId, nome, idCidade, area, active: currentActive, messageId: msg.id
               };
               state.registrations[threadId] = registration;
           }
        }
      }

      if (!registration || registration.userId !== userId) {
        return interaction.editReply({ content: "❌ Registro não encontrado ou inconsistente (tentei recuperar mas falhou)." });
      }

      if (registration.active === newActiveState) {
        return interaction.editReply({ content: "ℹ️ O status já está como solicitado." });
      }

      try {
        await _performStatusUpdate(client, { registration, threadId, newStatus: newActiveState, actor: interaction.user });
        const latestState = readState();
        latestState.registrations ||= {};
        latestState.registrations[threadId] = {
          ...(latestState.registrations[threadId] || {}),
          ...registration,
        };
        writeState(latestState);
        await interaction.editReply({ content: "✅ Status alterado com sucesso!" });
      } catch (e) {
        await interaction.editReply({ content: `❌ ${e.message}` });
      }
      return true;
    }

    // ✅ Botão de Reverter (do log)
    if (interaction.isButton?.() && interaction.customId.startsWith("fc_revert_status:")) {
      if (!hasManagePermission(interaction.member, interaction.user.id)) {
        return interaction.reply({
          content: "🚫 Sem permissão.",
          flags: MessageFlags.Ephemeral,
        });
      }

      await interaction.deferReply({
        flags: MessageFlags.Ephemeral,
      });

      const [, threadId, userId, targetStatusStr] = interaction.customId.split(":");
      const newActiveState = targetStatusStr === 'active';

      const state = readState();
      const registration = state.registrations?.[threadId];
      if (!registration || registration.userId !== userId) return interaction.editReply({ content: "❌ Registro não encontrado." });

      try {
        await setFormsCreatorStatus(client, {
          threadId,
          newStatus: newActiveState,
          actor: interaction.user,
        });
        await interaction.message.edit({ components: [] });
        await interaction.editReply({ content: "✅ Ação revertida com sucesso!" });
      } catch (error) {
        await interaction.editReply({ content: `❌ ${error.message}` });
      }
      return true;
    }

    // EDIÇÃO -> abre modal
    if (interaction.isButton?.() && interaction.customId.startsWith("editar_")) {
      const temPermissao = hasPermission(interaction.member, interaction.user.id);
      if (!temPermissao) {
        await interaction.reply({
          content: "🚫 Sem permissão.",
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }

      const parts = interaction.customId.split("_");
      const tipo = parts[1];
      const threadId = parts[2];
      if (!tipo || !threadId) return false;

      const modal = new ModalBuilder()
        .setCustomId(`${interaction.customId}_modal`)
        .setTitle("Editar Informação")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("novo_valor")
              .setLabel(tipo === "id" ? "Novo ID/Passaporte" : "Nova Área de Interesse")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );

      await interaction.showModal(modal);
      return true;
    }

    // APLICA EDIÇÃO
    if (interaction.isModalSubmit?.() && interaction.customId.startsWith("editar_")) {
      const temPermissao = hasPermission(interaction.member, interaction.user.id);
      if (!temPermissao) {
        await interaction.reply({
          content: "🚫 Sem permissão.",
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }

      const parts = interaction.customId.split("_");
      const tipo = parts[1];
      const threadId = parts[2];

      const novoValor = interaction.fields.getTextInputValue("novo_valor").trim();

      const thread = await client.channels.fetch(threadId).catch(() => null);
      if (!thread || !thread.isTextBased()) {
        await interaction.reply({
          content: "❌ Thread não encontrada.",
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }

      const mensagens = await thread.messages.fetch({ limit: 25 }).catch(() => null);
      if (!mensagens) {
        await interaction.reply({
          content: "❌ Não consegui buscar mensagens.",
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }

      const msgOriginal = mensagens.find((msg) =>
        isFormsCreatorMainRegisterMessage(msg, client)
      );

      if (!msgOriginal) {
        await interaction.reply({
          content: "❌ Não encontrei a mensagem principal do registro para editar.",
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }

      // =====================================================
      // ÁREA
      // =====================================================
      //
      // A alteração de Área precisa obrigatoriamente passar
      // pelo helper oficial.
      //
      // Nunca editar apenas o embed local.
      // =====================================================

      if (
        tipo ===
        "area"
      ) {
        try {
          const result =
            await setFormsCreatorArea(
              client,
              {
                threadId,
                newArea:
                  novoValor,
                actor:
                  interaction.user,
              }
            );

          await interaction.reply({
            content:
              result
                ?.activeTopicUpdated
                ? "✅ Área atualizada no Forms original e no tópico ativo!"
                : "⚠️ Área atualizada no Forms original, mas a sincronização do tópico ativo ficou pendente e será refeita pelo sincronizador.",

            flags:
              MessageFlags.Ephemeral,
          });
        } catch (
          error
        ) {
          await interaction.reply({
            content:
              `❌ Não consegui atualizar a Área: ${error?.message || error}`,

            flags:
              MessageFlags.Ephemeral,
          });
        }

        return true;
      }

      // =====================================================
      // ID / PASSAPORTE
      // =====================================================

      const embed =
        EmbedBuilder.from(
          msgOriginal.embeds[0]
        );

      if (
        tipo ===
        "id"
      ) {
        embed.spliceFields(
          0,
          1,
          {
            name:
              "📌 ID/Passaporte",

            value:
              novoValor,

            inline:
              true,
          }
        );
      }

      await msgOriginal.edit({
        embeds: [
          embed,
        ],
      });

      const state =
        readState();

      const registration =
        state.registrations?.[
          threadId
        ];

      if (
        registration
      ) {
        registration.idCidade =
          novoValor;

        registration.messageId =
          msgOriginal.id;

        writeState(
          state
        );

        await syncFormsCreatorActiveMirror(
          client,
          {
            originalThreadId:
              threadId,

            registration,

            reason:
              "ID/Passaporte do FormsCreator alterado",
          }
        ).catch(
          error => {
            console.error(
              `[FormsCreator] ID atualizado no original, mas espelho ativo pendente para ${registration.userId}:`,
              error
            );
          }
        );
      }

      await interaction.reply({
        content:
          "✅ Informações atualizadas!",

        flags:
          MessageFlags.Ephemeral,
      });

      return true;
    }

    return false;
  } catch (err) {
    console.error("❌ ERRO Interaction FormsCreator:", err);

    if (interaction.isRepliable?.()) {
      if (interaction.deferred) {
        await interaction
          .editReply({
            content: "❌ Deu erro aqui. Olha o console do bot.",
          })
          .catch(() => {});
        return true;
      }

      if (!interaction.replied) {
        await interaction
          .reply({
            content: "❌ Deu erro aqui. Olha o console do bot.",
            flags: MessageFlags.Ephemeral,
          })
          .catch(() => {});
        return true;
      }
    }

    return true;
  }
}
