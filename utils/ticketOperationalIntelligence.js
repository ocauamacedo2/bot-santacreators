import fs from "node:fs";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";
import { dashEmit } from "./dashHub.js";

const TZ = "America/Sao_Paulo";

const DATA_DIR = path.resolve(process.cwd(), "data");

const TICKET_OPERATIONAL_FILE = path.join(
  DATA_DIR,
  "sc_ticket_operational.json"
);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

const GEMINI_MODEL =
  String(process.env.GEMINI_MODEL || "").trim() ||
  "gemini-3.6-flash";
  const GEMINI_MODEL_FALLBACKS = [
  GEMINI_MODEL,
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
].filter((model, index, array) => {
  return model && array.indexOf(model) === index;
});

const MAX_RECORDS = 5000;
const MAX_TRANSCRIPT_CHARS_FOR_AI = 60000;
const AI_TIMEOUT_MS = 18000;

let gemini = null;

// ============================================================================
// PERSISTÊNCIA
// ============================================================================

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, {
      recursive: true,
    });
  }
}

function loadState() {
  try {
    ensureDataDir();

    if (!fs.existsSync(TICKET_OPERATIONAL_FILE)) {
      return {
        version: 1,
        records: [],
      };
    }

    const raw = fs.readFileSync(
      TICKET_OPERATIONAL_FILE,
      "utf8"
    );

    if (!raw.trim()) {
      return {
        version: 1,
        records: [],
      };
    }

    const parsed = JSON.parse(raw);

    return {
      version: 1,

      records:
        Array.isArray(parsed?.records)
          ? parsed.records
          : [],
    };
  } catch (error) {
    console.error(
      "[TICKET IA/NPS] Falha ao ler estado operacional:",
      error
    );

    return {
      version: 1,
      records: [],
    };
  }
}

function saveState(state) {
  try {
    ensureDataDir();

    const temporaryFile =
      `${TICKET_OPERATIONAL_FILE}.tmp`;

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
      TICKET_OPERATIONAL_FILE
    );
  } catch (error) {
    console.error(
      "[TICKET IA/NPS] Falha ao salvar estado operacional:",
      error
    );
  }
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

function average(
  values = []
) {
  const valid =
    values
      .map(Number)
      .filter(Number.isFinite);

  if (
    valid.length ===
    0
  ) {
    return 0;
  }

  return (
    valid.reduce(
      (
        total,
        value
      ) =>
        total +
        value,
      0
    ) /
    valid.length
  );
}

function percentile(
  values = [],
  percentileValue = 0.9
) {
  const valid =
    values
      .map(Number)
      .filter(Number.isFinite)
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
    return 0;
  }

  const index =
    Math.min(
      valid.length - 1,
      Math.max(
        0,
        Math.ceil(
          valid.length *
          percentileValue
        ) - 1
      )
    );

  return valid[index];
}

function normalizeText(
  value = ""
) {
  return String(
    value || ""
  )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}

function formatDuration(
  milliseconds = 0
) {
  const numeric =
    Math.max(
      0,
      Number(milliseconds) ||
      0
    );

  const minutes =
    Math.round(
      numeric /
      60000
    );

  if (
    minutes <
    60
  ) {
    return `${minutes} min`;
  }

  const hours =
    minutes /
    60;

  if (
    hours <
    24
  ) {
    return `${hours.toFixed(
      hours >= 10
        ? 0
        : 1
    )} h`;
  }

  const days =
    hours /
    24;

  return `${days.toFixed(
    days >= 10
      ? 0
      : 1
  )} d`;
}

function getWeekKeySP(
  reference = new Date()
) {
  const localDate =
    new Date(
      reference.toLocaleString(
        "en-US",
        {
          timeZone:
            TZ,
        }
      )
    );

  /*
   * A operação da SantaCreators usa semana:
   *
   * domingo 00:00
   * até
   * sábado 23:59
   */
  const day =
    localDate.getDay();

  localDate.setDate(
    localDate.getDate() -
    day
  );

  localDate.setHours(
    0,
    0,
    0,
    0
  );

  const year =
    localDate.getFullYear();

  const month =
    String(
      localDate.getMonth() +
      1
    ).padStart(
      2,
      "0"
    );

  const date =
    String(
      localDate.getDate()
    ).padStart(
      2,
      "0"
    );

  return (
    `${year}-` +
    `${month}-` +
    `${date}`
  );
}

function addDaysToWeekKey(
  weekKey,
  amount
) {
  const [
    year,
    month,
    day,
  ] =
    String(
      weekKey
    )
      .split("-")
      .map(Number);

  const date =
    new Date(
      year,
      month - 1,
      day,
      12,
      0,
      0,
      0
    );

  date.setDate(
    date.getDate() +
    amount
  );

  return getWeekKeySP(
    date
  );
}

function safeJsonParse(
  text = ""
) {
  const cleaned =
    String(
      text ||
      ""
    )
      .trim()
      .replace(
        /^```json\s*/i,
        ""
      )
      .replace(
        /^```\s*/i,
        ""
      )
      .replace(
        /```$/i,
        ""
      )
      .trim();

  try {
    return JSON.parse(
      cleaned
    );
  } catch {}

  const firstBrace =
    cleaned.indexOf(
      "{"
    );

  const lastBrace =
    cleaned.lastIndexOf(
      "}"
    );

  if (
    firstBrace >= 0 &&
    lastBrace >
      firstBrace
  ) {
    try {
      return JSON.parse(
        cleaned.slice(
          firstBrace,
          lastBrace + 1
        )
      );
    } catch {}
  }

  return null;
}

function withTimeout(
  promise,
  milliseconds,
  label
) {
  let timer =
    null;

  const timeoutPromise =
    new Promise(
      (
        _resolve,
        reject
      ) => {
        timer =
          setTimeout(
            () => {
              reject(
                new Error(
                  `${label} excedeu ${milliseconds}ms`
                )
              );
            },
            milliseconds
          );
      }
    );

  return Promise.race([
    Promise.resolve(
      promise
    ),
    timeoutPromise,
  ]).finally(
    () => {
      if (
        timer
      ) {
        clearTimeout(
          timer
        );
      }
    }
  );
}

function getGemini() {
  if (
    !GEMINI_API_KEY
  ) {
    return null;
  }

  if (
    !gemini
  ) {
    gemini =
      new GoogleGenAI({
        apiKey:
          GEMINI_API_KEY,
      });
  }

  return gemini;
}

// ============================================================================
// NORMALIZAÇÃO DA AVALIAÇÃO
// ============================================================================

function normalizeResolved(
  value
) {
  const normalized =
    normalizeText(
      value
    ).toLowerCase();

  if (
    [
      "sim",
      "yes",
      "resolvido",
    ].includes(
      normalized
    )
  ) {
    return "sim";
  }

  if (
    [
      "parcial",
      "parcialmente",
      "partial",
    ].includes(
      normalized
    )
  ) {
    return "parcial";
  }

  if (
    [
      "nao",
      "não",
      "no",
      "nao_resolvido",
      "não_resolvido",
    ].includes(
      normalized
    )
  ) {
    return "nao";
  }

  return "inconclusivo";
}

function normalizeTeamPerformance(
  value
) {
  const normalized =
    normalizeText(
      value
    ).toLowerCase();

  if (
    normalized.includes(
      "excel"
    )
  ) {
    return "excelente";
  }

  if (
    normalized.includes(
      "bom"
    )
  ) {
    return "bom";
  }

  if (
    normalized.includes(
      "critic"
    )
  ) {
    return "critico";
  }

  return "atencao";
}

function normalizeWhoSolved(
  value
) {
  const normalized =
    normalizeText(
      value
    ).toLowerCase();

  if (
    normalized.includes(
      "misto"
    )
  ) {
    return "misto";
  }

  if (
    normalized.includes(
      "humano"
    )
  ) {
    return "humano";
  }

  if (
    normalized ===
      "ia" ||
    normalized.includes(
      "inteligencia artificial"
    ) ||
    normalized.includes(
      "inteligência artificial"
    )
  ) {
    return "ia";
  }

  return "nao_identificado";
}

// ============================================================================
// MÉTRICAS DO TICKET
// ============================================================================

function calculateTicketMetrics({
  openerId,
  openedAt,
  closedAt,
  messages = [],
}) {
  const sorted =
    [...messages]
      .filter(
        message =>
          Number.isFinite(
            Number(
              message.createdTimestamp
            )
          )
      )
      .sort(
        (
          first,
          second
        ) =>
          Number(
            first.createdTimestamp
          ) -
          Number(
            second.createdTimestamp
          )
      );

  const openerMessages =
    sorted.filter(
      message =>
        message.isOpener ===
          true ||
        message.authorId ===
          openerId
    );

  const staffMessages =
    sorted.filter(
      message =>
        message.isStaff ===
        true
    );

  const botMessages =
    sorted.filter(
      message =>
        message.isBot ===
        true
    );

  const firstOpenerMessage =
    openerMessages[0] ||
    null;

  const firstStaffAfterOpener =
    firstOpenerMessage
      ? staffMessages.find(
          message =>
            Number(
              message.createdTimestamp
            ) >
            Number(
              firstOpenerMessage
                .createdTimestamp
            )
        ) ||
        null
      : staffMessages[0] ||
        null;

  const firstHumanResponseMs =
    firstOpenerMessage &&
    firstStaffAfterOpener
      ? Math.max(
          0,
          Number(
            firstStaffAfterOpener
              .createdTimestamp
          ) -
          Number(
            firstOpenerMessage
              .createdTimestamp
          )
        )
      : null;

  const lastOpenerMessage =
    openerMessages[
      openerMessages.length -
      1
    ] ||
    null;

  const lastStaffMessage =
    staffMessages[
      staffMessages.length -
      1
    ] ||
    null;

  let waitingOn =
    "indefinido";

  if (
    lastOpenerMessage &&
    !lastStaffMessage
  ) {
    waitingOn =
      "equipe";
  } else if (
    !lastOpenerMessage &&
    lastStaffMessage
  ) {
    waitingOn =
      "cidadao";
  } else if (
    lastOpenerMessage &&
    lastStaffMessage
  ) {
    waitingOn =
      Number(
        lastOpenerMessage
          .createdTimestamp
      ) >
      Number(
        lastStaffMessage
          .createdTimestamp
      )
        ? "equipe"
        : "cidadao";
  }

  const staffByUser =
    {};

  for (
    const message of
    staffMessages
  ) {
    const userId =
      String(
        message.authorId ||
        ""
      );

    if (
      !userId
    ) {
      continue;
    }

    staffByUser[
      userId
    ] ??= {
      userId,
      messages:
        0,
      firstInteractionAt:
        null,
      lastInteractionAt:
        null,
    };

    staffByUser[
      userId
    ].messages +=
      1;

    const timestamp =
      Number(
        message.createdTimestamp
      );

    if (
      staffByUser[
        userId
      ].firstInteractionAt ==
        null ||
      timestamp <
        staffByUser[
          userId
        ].firstInteractionAt
    ) {
      staffByUser[
        userId
      ].firstInteractionAt =
        timestamp;
    }

    if (
      staffByUser[
        userId
      ].lastInteractionAt ==
        null ||
      timestamp >
        staffByUser[
          userId
        ].lastInteractionAt
    ) {
      staffByUser[
        userId
      ].lastInteractionAt =
        timestamp;
    }
  }

  return {
    totalOpenMs:
      Math.max(
        0,
        Number(
          closedAt ||
          Date.now()
        ) -
        Number(
          openedAt ||
          closedAt ||
          Date.now()
        )
      ),

    firstHumanResponseMs,

    openerMessageCount:
      openerMessages.length,

    humanStaffMessageCount:
      staffMessages.length,

    botMessageCount:
      botMessages.length,

    waitingOn,

    staffByUser:
      Object.values(
        staffByUser
      ),
  };
}

// ============================================================================
// FALLBACK DA IA
// ============================================================================

function getFallbackEvaluation({
  autoReasonType,
  waitingOn,
  humanConclusion,
  humanStaffMessageCount,
  botMessageCount,
}) {
  const conclusion =
    normalizeText(
      humanConclusion
    ).toLowerCase();

  const explicitResolved =
    /\b(resolvido|resolvida|concluido|concluído|concluída|finalizado|finalizada|deu certo|solucionado|solucionada)\b/i.test(
      conclusion
    );

  const explicitUnresolved =
    /\b(nao resolvido|não resolvido|nao foi resolvido|não foi resolvido|sem solucao|sem solução|pendente|nao concluido|não concluído)\b/i.test(
      conclusion
    );

  let resolved =
    "inconclusivo";

  let teamPerformance =
    "atencao";

  let teamAbandoned =
    false;

  let citizenAbandoned =
    false;

  if (
    explicitResolved
  ) {
    resolved =
      "sim";

    teamPerformance =
      "bom";
  }

  if (
    explicitUnresolved
  ) {
    resolved =
      "nao";

    teamPerformance =
      "critico";
  }

  if (
    autoReasonType ===
      "inatividade" &&
    waitingOn ===
      "equipe"
  ) {
    resolved =
      "nao";

    teamPerformance =
      "critico";

    teamAbandoned =
      true;
  }

  if (
    autoReasonType ===
      "inatividade" &&
    waitingOn ===
      "cidadao"
  ) {
    resolved =
      "inconclusivo";

    teamPerformance =
      humanStaffMessageCount >
      0
        ? "bom"
        : "atencao";

    citizenAbandoned =
      true;
  }

  let whoSolved =
    "nao_identificado";

  if (
    humanStaffMessageCount >
      0 &&
    botMessageCount >
      0
  ) {
    whoSolved =
      "misto";
  } else if (
    humanStaffMessageCount >
    0
  ) {
    whoSolved =
      "humano";
  } else if (
    botMessageCount >
    0
  ) {
    whoSolved =
      "ia";
  }

  let summaryShort;

  if (
    autoReasonType ===
      "inatividade" &&
    waitingOn ===
      "equipe"
  ) {
    summaryShort =
      "O ticket foi encerrado automaticamente enquanto o cidadão aguardava retorno da equipe.";
  } else if (
    autoReasonType ===
      "inatividade" &&
    waitingOn ===
      "cidadao"
  ) {
    summaryShort =
      "O ticket foi encerrado automaticamente enquanto a equipe aguardava retorno do cidadão.";
  } else if (
    explicitResolved
  ) {
    summaryShort =
      "A conclusão humana indica que a demanda foi resolvida.";
  } else if (
    explicitUnresolved
  ) {
    summaryShort =
      "A conclusão humana indica que a demanda não foi resolvida.";
  } else {
    summaryShort =
      "O ticket foi encerrado, mas não existem evidências suficientes para afirmar com segurança se houve solução completa.";
  }

  let closingContext =
  "Atendimento encerrado normalmente pela equipe.";

if (
  autoReasonType ===
    "inatividade"
) {
  if (
    waitingOn ===
    "equipe"
  ) {
    closingContext =
      "O ticket fechou por inatividade enquanto o cidadão ainda aguardava retorno da SantaCreators.";
  } else if (
    waitingOn ===
    "cidadao"
  ) {
    closingContext =
      "O ticket fechou por inatividade depois que a SantaCreators respondeu e o cidadão não retornou.";
  } else {
    closingContext =
      "O ticket fechou automaticamente por inatividade.";
  }
} else if (
  explicitResolved
) {
  closingContext =
    "Atendimento concluído normalmente com indicação de que a solicitação foi resolvida.";
} else if (
  explicitUnresolved
) {
  closingContext =
    "Atendimento encerrado sem indicação de que a solicitação tenha sido resolvida.";
} else {
  closingContext =
    "Atendimento encerrado sem confirmação clara sobre o resultado final.";
}

return {
  resolved,

  confidence:
    35,

  summaryShort,

  closingContext,

    mainReason:
      normalizeText(
        humanConclusion
      ) ||
      "Não informado.",

    teamPerformance,

    whoSolved,

    citizenAbandoned,

    teamAbandoned,

    evidence:
      "Fallback determinístico utilizado porque a avaliação por IA não ficou disponível.",

    source:
      "fallback",
  };
}

// ============================================================================
// ANÁLISE GEMINI
// ============================================================================

async function evaluateWithGemini({
  ticketType,
  humanConclusion,
  autoReasonType,
  waitingOn,
  metrics,
  messages,
}) {
  const ai =
    getGemini();

  if (
    !ai
  ) {
    return null;
  }

  const transcript =
    messages
      .map(
        message => {
          const actor =
            message.isOpener
              ? "CIDADAO"
              : message.isStaff
                ? "EQUIPE"
                : message.isBot
                  ? "BOT_IA"
                  : "OUTRO";

          const attachments =
            Number(
              message.attachments ||
              0
            ) >
            0
              ? ` [ANEXOS:${Number(
                  message.attachments
                )}]`
              : "";

          return (
            `[${new Date(
              Number(
                message.createdTimestamp
              )
            ).toISOString()}] ` +
            `[${actor}] ` +
            `${message.authorName || message.authorId || "Desconhecido"}: ` +
            `${normalizeText(message.content) || "[sem texto]"}` +
            attachments
          );
        }
      )
      .join("\n")
      .slice(
        0,
        MAX_TRANSCRIPT_CHARS_FOR_AI
      );

  const prompt = `
Você é o auditor interno de qualidade dos tickets da SantaCreators.

Você deve analisar SOMENTE os fatos presentes no ticket abaixo.

REGRAS OBRIGATÓRIAS:

1. Não invente acontecimentos.
2. Não considere um ticket resolvido apenas porque ele foi fechado.
3. Diferencie claramente ausência do cidadão e ausência da equipe.
4. Se o cidadão fez uma pergunta ou pediu ajuda e a equipe não respondeu, isso é falha grave da equipe.
5. Se a equipe respondeu e ficou aguardando algo do cidadão, não penalize injustamente a equipe.
6. Tickets de entrevista podem existir apenas para tirar dúvidas. Não exija necessariamente entrevista concluída para considerar uma dúvida resolvida.
7. Considere atendimento de suporte, bugs, perda de itens e denúncias de hacker da mesma forma: avalie se a necessidade apresentada recebeu resposta ou encaminhamento real.
8. Diferencie quem realmente participou da solução:
   humano
   ia
   misto
   nao_identificado

9. Use "humano" quando a solução veio principalmente de um Creator.

10. Use "ia" somente quando a inteligência da SantaCreators realmente respondeu, orientou ou resolveu a demanda.

11. Não considere mensagens automáticas, menu do ticket, aviso de abertura, lembretes, botões ou mensagens administrativas como participação da IA na solução.

12. Use "misto" somente quando existirem evidências reais de que tanto a SantaCreators quanto um Creator participaram da solução.

13. Se não houver evidência suficiente, use inconclusivo.

14. O resumo deve ser curto, direto e escrito de uma forma que qualquer pessoa consiga entender sem conhecer o funcionamento técnico do bot.

15. Analise também COMO o atendimento terminou.

16. No campo "closingContext", escreva UMA frase curta, natural e extremamente clara explicando a situação real no momento do encerramento.

17. Em fechamento MANUAL, NÃO diga que "o cidadão precisava responder" ou que "a equipe precisava responder" simplesmente porque uma das partes falou por último.

18. Em fechamento manual, considere a conclusão do Creator, a confirmação do cidadão e o contexto da conversa. Exemplos válidos:
   "Atendimento concluído normalmente após confirmação do cidadão."
   "Atendimento encerrado após a dúvida ser esclarecida."
   "Atendimento encerrado pelo Creator, mas sem confirmação clara de solução."
   "Atendimento encerrado com parte da solicitação ainda pendente."

19. Somente mencione que alguém ficou aguardando resposta quando isso realmente for relevante para o encerramento, principalmente em fechamento automático por inatividade.

20. Se o ticket fechar automaticamente enquanto o cidadão estava esperando a equipe, deixe isso explícito:
   "O ticket fechou por inatividade enquanto o cidadão ainda aguardava retorno da SantaCreators."

21. Se o ticket fechar automaticamente depois da equipe responder e o cidadão não retornar, deixe isso explícito:
   "O ticket fechou por inatividade depois que a SantaCreators respondeu e o cidadão não retornou."

22. Não use termos técnicos como:
   waitingOn
   humano
   misto
   BOT_IA
   classificação interna
   na frase de closingContext.

23. A conclusão escrita pelo Creator é uma fonte importante, mas compare-a com as mensagens do ticket.

24. Não exponha raciocínio interno. Retorne somente JSON válido.
DADOS DO TICKET:

Tipo:
${ticketType || "não identificado"}

Motivo de fechamento automático:
${autoReasonType || "não"}

Quem aparentemente aguardava resposta:
${waitingOn || "indefinido"}

Motivo De fechar do Creator:
${humanConclusion || "não informada"}

Métricas:
- mensagens do cidadão: ${metrics.openerMessageCount}
- mensagens humanas da equipe: ${metrics.humanStaffMessageCount}
- mensagens de bot/IA: ${metrics.botMessageCount}
- primeira resposta humana: ${
    metrics.firstHumanResponseMs == null
      ? "não identificada"
      : formatDuration(metrics.firstHumanResponseMs)
  }
- tempo total aberto: ${formatDuration(metrics.totalOpenMs)}

TRANSCRIPT:

${transcript}

RETORNE EXATAMENTE UM JSON NESTE FORMATO:

{
  "resolved": "sim|parcial|nao|inconclusivo",
  "confidence": 0,
  "summaryShort": "resumo curto e fácil de entender",
  "mainReason": "motivo principal",
  "closingContext": "frase curta e clara explicando como o atendimento terminou",
  "teamPerformance": "excelente|bom|atencao|critico",
  "whoSolved": "humano|ia|misto|nao_identificado",
  "citizenAbandoned": false,
  "teamAbandoned": false,
  "evidence": "breve justificativa baseada apenas nas mensagens"
}
`;

  for (
    const model of
    GEMINI_MODEL_FALLBACKS
  ) {
    try {
      const response =
        await withTimeout(
          ai.models.generateContent({
            model,

            contents:
              prompt,

            config: {
              temperature:
                0.15,

              responseMimeType:
                "application/json",
            },
          }),

          AI_TIMEOUT_MS,

          `Gemini ${model}`
        );

      const text =
        response?.text ||
        response?.candidates?.[0]
          ?.content
          ?.parts
          ?.map(
            part =>
              part?.text ||
              ""
          )
          .join("") ||
        "";

      const parsed =
        safeJsonParse(
          text
        );

      if (
        !parsed
      ) {
        continue;
      }

      return {
        resolved:
          normalizeResolved(
            parsed.resolved
          ),

        confidence:
          clamp(
            parsed.confidence,
            0,
            100
          ),

        summaryShort:
          normalizeText(
            parsed.summaryShort
          ).slice(
            0,
            900
          ) ||
          "A IA não forneceu um resumo conclusivo.",

        mainReason:
  normalizeText(
    parsed.mainReason
  ).slice(
    0,
    500
  ) ||
  "Não identificado.",

closingContext:
  normalizeText(
    parsed.closingContext
  ).slice(
    0,
    500
  ) ||
  (
    autoReasonType ===
      "inatividade"
      ? waitingOn ===
          "equipe"
        ? "O ticket fechou por inatividade enquanto o cidadão ainda aguardava retorno da SantaCreators."
        : waitingOn ===
            "cidadao"
          ? "O ticket fechou por inatividade depois que a SantaCreators respondeu e o cidadão não retornou."
          : "O ticket fechou automaticamente por inatividade."
      : "Atendimento encerrado normalmente pela equipe."
  ),

teamPerformance:
  normalizeTeamPerformance(
    parsed.teamPerformance
  ),

whoSolved:
  normalizeWhoSolved(
    parsed.whoSolved
  ),

        citizenAbandoned:
          parsed.citizenAbandoned ===
          true,

        teamAbandoned:
          parsed.teamAbandoned ===
          true,

        evidence:
          normalizeText(
            parsed.evidence
          ).slice(
            0,
            1000
          ),

        source:
          `gemini:${model}`,
      };
    } catch (error) {
      console.warn(
        `[TICKET IA/NPS] Modelo ${model} falhou:`,
        error?.message ||
        error
      );
    }
  }

  return null;
}

// ============================================================================
// FUNÇÃO PRINCIPAL
// ============================================================================

export async function analyzeAndRecordTicket({
  channelId,
  guildId,
  ticketType = null,
  openerId,
  closerId = null,
  primaryAttendantId = null,
  humanConclusion = "",
  autoReasonType = null,
  openedAt = Date.now(),
  closedAt = Date.now(),
  messages = [],
} = {}) {
  if (
    !channelId
  ) {
    throw new Error(
      "[TICKET IA/NPS] channelId é obrigatório."
    );
  }

  const safeMessages =
    Array.isArray(
      messages
    )
      ? messages
      : [];

  const metrics =
    calculateTicketMetrics({
      openerId,
      openedAt,
      closedAt,
      messages:
        safeMessages,
    });

  let evaluation =
    await evaluateWithGemini({
      ticketType,
      openerId,
      humanConclusion,
      autoReasonType,
      waitingOn:
        metrics.waitingOn,
      metrics,
      messages:
        safeMessages,
    });

  if (
    !evaluation
  ) {
    evaluation =
      getFallbackEvaluation({
        autoReasonType,
        waitingOn:
          metrics.waitingOn,
        humanConclusion,
        humanStaffMessageCount:
          metrics.humanStaffMessageCount,
        botMessageCount:
          metrics.botMessageCount,
      });
  }

  const closedTimestamp =
    Number(
      closedAt ||
      Date.now()
    );

  const record = {
    channelId:
      String(
        channelId
      ),

    guildId:
      guildId
        ? String(
            guildId
          )
        : null,

    ticketType:
      ticketType ||
      "nao_identificado",

    openerId:
      openerId
        ? String(
            openerId
          )
        : null,

    closerId:
      closerId
        ? String(
            closerId
          )
        : null,

    primaryAttendantId:
      primaryAttendantId
        ? String(
            primaryAttendantId
          )
        : null,

    humanConclusion:
      normalizeText(
        humanConclusion
      ),

    autoReasonType:
      autoReasonType ||
      null,

    openedAt:
      Number(
        openedAt ||
        closedTimestamp
      ),

    closedAt:
      closedTimestamp,

    weekKey:
      getWeekKeySP(
        new Date(
          closedTimestamp
        )
      ),

    metrics,

    evaluation,

    userFeedback:
      null,

    feedbackAt:
      null,

    recordedAt:
      Date.now(),
  };

  const state =
    loadState();

  const existingIndex =
    state.records.findIndex(
      existing =>
        String(
          existing?.channelId ||
          ""
        ) ===
        String(
          channelId
        )
    );

  if (
    existingIndex >=
    0
  ) {
    /*
     * Preserva feedback se por algum motivo
     * o mesmo ticket for regravado.
     */
    const previous =
      state.records[
        existingIndex
      ];

    record.userFeedback =
      previous?.userFeedback ||
      null;

    record.feedbackAt =
      previous?.feedbackAt ||
      null;

    state.records[
      existingIndex
    ] =
      record;
  } else {
    state.records.push(
      record
    );
  }

  state.records =
    state.records.slice(
      -MAX_RECORDS
    );

  saveState(
    state
  );

  try {
    dashEmit(
      "tickets:finalizado",
      {
        __at:
          closedTimestamp,

        channelId:
          record.channelId,

        guildId:
          record.guildId,

        userId:
          record.openerId,

        openerId:
          record.openerId,

        closerId:
          record.closerId,

        attendantId:
          record.primaryAttendantId,

        ticketType:
          record.ticketType,

        resolved:
          evaluation.resolved,

        teamPerformance:
          evaluation.teamPerformance,

        whoSolved:
          evaluation.whoSolved,

        teamAbandoned:
          evaluation.teamAbandoned,

        citizenAbandoned:
          evaluation.citizenAbandoned,

        firstHumanResponseMs:
          metrics.firstHumanResponseMs,

        totalOpenMs:
          metrics.totalOpenMs,

        waitingOn:
          metrics.waitingOn,

        source:
          "tickets",

        operationId:
          record.channelId,

        recordId:
          record.channelId,

        dedupeKey:
          `tickets:finalizado:${record.channelId}`,
      }
    );
  } catch (
    error
  ) {
    console.error(
      "[TICKET IA/NPS] Falha ao emitir telemetria:",
      error
    );
  }

  return record;
}

// ============================================================================
// FEEDBACK DO CIDADÃO
// ============================================================================

export function recordTicketFeedback({
  channelId,
  userId,
  feedback,
} = {}) {
  const validFeedbacks =
    new Set([
      "resolvido",
      "parcial",
      "nao_resolvido",
    ]);

  if (
    !validFeedbacks.has(
      feedback
    )
  ) {
    return {
      ok:
        false,

      reason:
        "feedback_invalido",
    };
  }

  const state =
    loadState();

  const record =
    state.records.find(
      item =>
        String(
          item?.channelId ||
          ""
        ) ===
        String(
          channelId ||
          ""
        )
    );

  if (
    !record
  ) {
    return {
      ok:
        false,

      reason:
        "ticket_nao_encontrado",
    };
  }

  if (
    String(
      record.openerId ||
      ""
    ) !==
    String(
      userId ||
      ""
    )
  ) {
    return {
      ok:
        false,

      reason:
        "usuario_nao_autorizado",
    };
  }

  if (
    record.userFeedback
  ) {
    return {
      ok:
        false,

      reason:
        "feedback_ja_registrado",
    };
  }

  record.userFeedback =
    feedback;

  record.feedbackAt =
    Date.now();

  saveState(
    state
  );

  try {
    dashEmit(
      "tickets:feedback",
      {
        __at:
          record.feedbackAt,

        channelId:
          record.channelId,

        userId:
          record.openerId,

        feedback:
          record.userFeedback,

        source:
          "tickets",

        operationId:
          record.channelId,

        recordId:
          record.channelId,

        dedupeKey:
          `tickets:feedback:${record.channelId}`,
      }
    );
  } catch {}

  return {
    ok:
      true,

    record,
  };
}

// ============================================================================
// LEITURA SEMANAL
// ============================================================================

function getRecordsByWeek(
  weekKey
) {
  const state =
    loadState();

  return state.records.filter(
    record =>
      record?.weekKey ===
      weekKey
  );
}

function feedbackValue(
  feedback
) {
  if (
    feedback ===
    "resolvido"
  ) {
    return 100;
  }

  if (
    feedback ===
    "parcial"
  ) {
    return 55;
  }

  if (
    feedback ===
    "nao_resolvido"
  ) {
    return 0;
  }

  return null;
}

function resolvedValue(
  resolved
) {
  if (
    resolved ===
    "sim"
  ) {
    return 100;
  }

  if (
    resolved ===
    "parcial"
  ) {
    return 55;
  }

  if (
    resolved ===
    "nao"
  ) {
    return 0;
  }

  return 40;
}

function performanceValue(
  performance
) {
  if (
    performance ===
    "excelente"
  ) {
    return 100;
  }

  if (
    performance ===
    "bom"
  ) {
    return 82;
  }

  if (
    performance ===
    "atencao"
  ) {
    return 50;
  }

  if (
    performance ===
    "critico"
  ) {
    return 10;
  }

  return 40;
}

function calculateQualityScore(
  records
) {
  if (
    !records.length
  ) {
    return 0;
  }

  const scores =
    records.map(
      record => {
        const evaluation =
          record?.evaluation ||
          {};

        let score =
          resolvedValue(
            evaluation.resolved
          ) *
            0.55 +
          performanceValue(
            evaluation.teamPerformance
          ) *
            0.30;

        const userFeedback =
          feedbackValue(
            record.userFeedback
          );

        if (
          userFeedback !==
          null
        ) {
          score =
            score *
              0.75 +
            userFeedback *
              0.25;
        }

        if (
          evaluation.teamAbandoned ===
          true
        ) {
          score =
            Math.min(
              score,
              15
            );
        }

        if (
          record.autoReasonType ===
            "inatividade" &&
          record.metrics?.waitingOn ===
            "equipe"
        ) {
          score =
            Math.min(
              score,
              10
            );
        }

        if (
          record.autoReasonType ===
            "inatividade" &&
          record.metrics?.waitingOn ===
            "cidadao"
        ) {
          /*
           * O cidadão sumir não deve destruir
           * injustamente a nota da equipe.
           */
          score =
            Math.max(
              score,
              record.metrics
                  ?.humanStaffMessageCount >
                0
                ? 65
                : score
            );
        }

        return clamp(
          score
        );
      }
    );

  return clamp(
    average(
      scores
    )
  );
}

function responseTimeScore(
  milliseconds
) {
  if (
    milliseconds == null
  ) {
    return 0;
  }

  const minutes =
    Number(
      milliseconds
    ) /
    60000;

  if (minutes <= 30) return 100;
  if (minutes <= 120) return 90;
  if (minutes <= 360) return 75;
  if (minutes <= 720) return 55;
  if (minutes <= 1440) return 35;

  return 10;
}

function calculateResponseScore(
  records
) {
  if (
    !records.length
  ) {
    return 0;
  }

  const scores =
    records.map(
      record => {
        if (
          record?.metrics
            ?.firstHumanResponseMs ==
            null
        ) {
          if (
            record?.metrics
              ?.waitingOn ===
            "equipe"
          ) {
            return 0;
          }

          return 45;
        }

        return responseTimeScore(
          record.metrics
            .firstHumanResponseMs
        );
      }
    );

  return clamp(
    average(
      scores
    )
  );
}

function buildStaffBreakdown(
  records
) {
  const map =
    {};

  for (
    const record of
    records
  ) {
    const staff =
      Array.isArray(
        record?.metrics
          ?.staffByUser
      )
        ? record.metrics
            .staffByUser
        : [];

    for (
      const item of
      staff
    ) {
      const userId =
        String(
          item?.userId ||
          ""
        );

      if (
        !userId
      ) {
        continue;
      }

      map[
        userId
      ] ??= {
        userId,
        messages:
          0,
        tickets:
          0,
      };

      map[
        userId
      ].messages +=
        Number(
          item.messages ||
          0
        );

      map[
        userId
      ].tickets +=
        1;
    }
  }

  return Object.values(
    map
  ).sort(
    (
      first,
      second
    ) =>
      second.messages -
      first.messages
  );
}

// ============================================================================
// NPS: QUALIDADE
// ============================================================================

export function buildTicketQualityOperationalMetric(
  context = {}
) {
  const currentWeekKey =
    context.currentWeek?.key ||
    getWeekKeySP();

  const previousWeekKey =
    context.previousWeek?.key ||
    addDaysToWeekKey(
      currentWeekKey,
      -7
    );

  const currentRecords =
    getRecordsByWeek(
      currentWeekKey
    );

  const previousRecords =
    getRecordsByWeek(
      previousWeekKey
    );

  if (
    !currentRecords.length &&
    !previousRecords.length
  ) {
    return {
      id:
        "qualidade",

      label:
        "Qualidade Operacional",

      available:
        false,

      officialSource:
        true,

      sourceType:
        "ticket_operational_intelligence",

      source:
        "tickets",

      score:
        0,

      confidence:
        0,

      volume:
        0,

      current:
        0,

      previous:
        0,

      difference:
        0,

      positivePoints:
        [],

      attentionPoints:
        [],

      recommendations:
        [],

      details: {
        currentWeekKey,
        previousWeekKey,
      },
    };
  }

  const currentScore =
    calculateQualityScore(
      currentRecords
    );

  const previousScore =
    calculateQualityScore(
      previousRecords
    );

  const resolved =
    currentRecords.filter(
      record =>
        record?.evaluation
          ?.resolved ===
        "sim"
    ).length;

  const partial =
    currentRecords.filter(
      record =>
        record?.evaluation
          ?.resolved ===
        "parcial"
    ).length;

  const unresolved =
    currentRecords.filter(
      record =>
        record?.evaluation
          ?.resolved ===
        "nao"
    ).length;

  const teamAbandoned =
    currentRecords.filter(
      record =>
        record?.evaluation
          ?.teamAbandoned ===
        true
    ).length;

  const citizenAbandoned =
    currentRecords.filter(
      record =>
        record?.evaluation
          ?.citizenAbandoned ===
        true
    ).length;

  const autoClosed =
    currentRecords.filter(
      record =>
        record?.autoReasonType ===
        "inatividade"
    ).length;

  const feedbacks =
    currentRecords.filter(
      record =>
        Boolean(
          record?.userFeedback
        )
    ).length;

  const humanSolved =
    currentRecords.filter(
      record =>
        record?.evaluation
          ?.whoSolved ===
        "humano"
    ).length;

  const aiSolved =
    currentRecords.filter(
      record =>
        record?.evaluation
          ?.whoSolved ===
        "ia"
    ).length;

  const mixedSolved =
    currentRecords.filter(
      record =>
        record?.evaluation
          ?.whoSolved ===
        "misto"
    ).length;

  const positivePoints =
    [];

  const attentionPoints =
    [];

  const recommendations =
    [];

  if (
    resolved >
    0
  ) {
    positivePoints.push(
      `${resolved} ticket(s) foram classificados como resolvidos nesta semana.`
    );
  }

  if (
    currentRecords.length >
      0 &&
    resolved /
      currentRecords.length >=
      0.8
  ) {
    positivePoints.push(
      `A taxa de resolução está em ${(
        resolved /
        currentRecords.length *
        100
      ).toFixed(1)}%.`
    );
  }

  if (
    teamAbandoned >
    0
  ) {
    attentionPoints.push(
      `${teamAbandoned} ticket(s) encerraram enquanto o cidadão aguardava a equipe.`
    );
  }

  if (
    unresolved >
    0
  ) {
    attentionPoints.push(
      `${unresolved} ticket(s) foram classificados como não resolvidos.`
    );
  }

  if (
    autoClosed >
    0
  ) {
    attentionPoints.push(
      `${autoClosed} ticket(s) chegaram ao fechamento automático por inatividade.`
    );
  }

  if (
    currentScore <
    previousScore
  ) {
    attentionPoints.push(
      `A qualidade caiu ${(previousScore - currentScore).toFixed(1)} ponto(s) em relação à semana anterior.`
    );
  }

  if (
    teamAbandoned >
    0
  ) {
    recommendations.push(
      "Priorizar tickets em que a última mensagem é do cidadão e eliminar encerramentos automáticos causados por falta de retorno da equipe."
    );
  }

  if (
    unresolved >
      0 ||
    partial >
      0
  ) {
    recommendations.push(
      "Revisar os tickets não resolvidos ou parcialmente resolvidos e identificar motivos recorrentes."
    );
  }

  if (
    recommendations.length ===
    0
  ) {
    recommendations.push(
      "Manter a cadência atual e continuar registrando conclusões humanas objetivas."
    );
  }

  return {
    id:
      "qualidade",

    label:
      "Qualidade Operacional",

    available:
      true,

    officialSource:
      true,

    sourceType:
      "ticket_operational_intelligence",

    source:
      "tickets",

    score:
      currentScore,

    confidence:
      clamp(
        55 +
        currentRecords.length *
          5
      ),

    volume:
      currentRecords.length,

    current:
      currentScore,

    previous:
      previousScore,

    difference:
      currentScore -
      previousScore,

    positivePoints,

    attentionPoints,

    recommendations,

    details: {
      currentWeekKey,
      previousWeekKey,

      total:
        currentRecords.length,

      resolved,

      partial,

      unresolved,

      teamAbandoned,

      citizenAbandoned,

      autoClosed,

      feedbacks,

      humanSolved,

      aiSolved,

      mixedSolved,

      byStaff:
        buildStaffBreakdown(
          currentRecords
        ),
    },
  };
}

// ============================================================================
// NPS: TEMPO DE RESPOSTA
// ============================================================================

export function buildTicketResponseOperationalMetric(
  context = {}
) {
  const currentWeekKey =
    context.currentWeek?.key ||
    getWeekKeySP();

  const previousWeekKey =
    context.previousWeek?.key ||
    addDaysToWeekKey(
      currentWeekKey,
      -7
    );

  const currentRecords =
    getRecordsByWeek(
      currentWeekKey
    );

  const previousRecords =
    getRecordsByWeek(
      previousWeekKey
    );

  if (
    !currentRecords.length &&
    !previousRecords.length
  ) {
    return {
      id:
        "tempo_resposta",

      label:
        "Tempo de Resposta",

      available:
        false,

      officialSource:
        true,

      sourceType:
        "ticket_operational_intelligence",

      source:
        "tickets",

      score:
        0,

      confidence:
        0,

      volume:
        0,

      current:
        0,

      previous:
        0,

      difference:
        0,

      responseTimes:
        [],

      positivePoints:
        [],

      attentionPoints:
        [],

      recommendations:
        [],

      details: {
        currentWeekKey,
        previousWeekKey,
      },
    };
  }

  const currentResponseTimes =
    currentRecords
      .map(
        record =>
          record?.metrics
            ?.firstHumanResponseMs
      )
      .map(Number)
      .filter(Number.isFinite);

  const previousResponseTimes =
    previousRecords
      .map(
        record =>
          record?.metrics
            ?.firstHumanResponseMs
      )
      .map(Number)
      .filter(Number.isFinite);

  const currentScore =
    calculateResponseScore(
      currentRecords
    );

  const previousScore =
    calculateResponseScore(
      previousRecords
    );

  const averageResponseMs =
    average(
      currentResponseTimes
    );

  const previousAverageResponseMs =
    average(
      previousResponseTimes
    );

  const p90ResponseMs =
    percentile(
      currentResponseTimes,
      0.9
    );

  const unansweredByTeam =
    currentRecords.filter(
      record =>
        record?.metrics
          ?.firstHumanResponseMs ==
          null &&
        record?.metrics
          ?.waitingOn ===
          "equipe"
    ).length;

  const withinSixHours =
    currentResponseTimes.filter(
      duration =>
        duration <=
        6 *
          60 *
          60 *
          1000
    ).length;

  const positivePoints =
    [];

  const attentionPoints =
    [];

  const recommendations =
    [];

  if (
    currentResponseTimes.length >
    0
  ) {
    positivePoints.push(
      `O tempo médio da primeira resposta humana está em ${formatDuration(averageResponseMs)}.`
    );

    positivePoints.push(
      `${withinSixHours}/${currentResponseTimes.length} primeira(s) resposta(s) ocorreram em até 6 horas.`
    );
  }

  if (
    previousAverageResponseMs >
      0 &&
    averageResponseMs >
      0 &&
    averageResponseMs <
      previousAverageResponseMs
  ) {
    positivePoints.push(
      `A primeira resposta ficou ${formatDuration(previousAverageResponseMs - averageResponseMs)} mais rápida, em média, do que na semana anterior.`
    );
  }

  if (
    unansweredByTeam >
    0
  ) {
    attentionPoints.push(
      `${unansweredByTeam} ticket(s) terminaram com o cidadão aguardando uma primeira resposta humana da equipe.`
    );
  }

  if (
    p90ResponseMs >
    12 *
      60 *
      60 *
      1000
  ) {
    attentionPoints.push(
      `90% das primeiras respostas levaram até ${formatDuration(p90ResponseMs)}, acima do limite de atenção de 12 horas.`
    );
  }

  if (
    averageResponseMs >
    6 *
      60 *
      60 *
      1000
  ) {
    attentionPoints.push(
      `A média de primeira resposta está acima de 6 horas: ${formatDuration(averageResponseMs)}.`
    );
  }

  if (
    unansweredByTeam >
    0
  ) {
    recommendations.push(
      "Tratar como prioridade máxima tickets cuja última interação é do cidadão e ainda não possuem resposta humana da equipe."
    );
  }

  if (
    averageResponseMs >
    2 *
      60 *
      60 *
      1000
  ) {
    recommendations.push(
      "Reduzir o tempo de primeira resposta e distribuir tickets pendentes entre os responsáveis disponíveis."
    );
  }

  if (
    recommendations.length ===
    0
  ) {
    recommendations.push(
      "Manter o ritmo atual e acompanhar principalmente o P90 para evitar poucos tickets extremamente demorados."
    );
  }

  return {
    id:
      "tempo_resposta",

    label:
      "Tempo de Resposta",

    available:
      currentRecords.length >
      0,

    officialSource:
      true,

    sourceType:
      "ticket_operational_intelligence",

    source:
      "tickets",

    score:
      currentScore,

    confidence:
      clamp(
        55 +
        currentRecords.length *
          5
      ),

    volume:
      currentRecords.length,

    current:
      currentScore,

    previous:
      previousScore,

    difference:
      currentScore -
      previousScore,

    responseTimes:
      currentResponseTimes,

    responseTime: {
      average:
        averageResponseMs,

      median:
        percentile(
          currentResponseTimes,
          0.5
        ),

      p90:
        p90ResponseMs,

      count:
        currentResponseTimes.length,
    },

    positivePoints,

    attentionPoints,

    recommendations,

    details: {
      currentWeekKey,
      previousWeekKey,

      tickets:
        currentRecords.length,

      answered:
        currentResponseTimes.length,

      unansweredByTeam,

      averageResponseMs,

      previousAverageResponseMs,

      p90ResponseMs,

      withinSixHours,

      averageTotalOpenMs:
        average(
          currentRecords.map(
            record =>
              Number(
                record?.metrics
                  ?.totalOpenMs ||
                0
              )
          )
        ),

      byStaff:
        buildStaffBreakdown(
          currentRecords
        ),
    },
  };
}