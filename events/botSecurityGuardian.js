// =====================================================
// events/botSecurityGuardian.js
// SantaCreators • Security Guardian
//
// PROTEÇÕES:
// • Bloqueia bots adicionados por pessoas não autorizadas
// • Identifica quem adicionou o bot através do Audit Log
// • Expulsa automaticamente bot não autorizado
// • Proteção contra flood de bots
// • Proteção contra flood de usuários
// • Proteção contra mensagens repetidas
// • Proteção contra palavrões
// • Timeout automático de 30 minutos
// • Reincidência de flood = ban automático
// • Logs completos
// • Link da mensagem
// • Link do canal
// • Conteúdo original
// • Anexos
// • Imagem enviada
// • Avatar do infrator
// • IDs completos
// =====================================================

import {
  AuditLogEvent,
  EmbedBuilder,
  PermissionsBitField,
} from "discord.js";

// =====================================================
// CONFIGURAÇÃO PRINCIPAL
// =====================================================

const LOG_CHANNEL_ID = "1507676677927338107";

// =====================================================
// QUEM PODE ADICIONAR BOT
// =====================================================

// Usuários autorizados diretamente.
const AUTHORIZED_USER_IDS = new Set([
  "660311795327828008", // Rodney
]);

// Cargos autorizados.
const AUTHORIZED_ROLE_IDS = new Set([
  "1262262852949905408", // Owner
  "1352408327983861844", // Resp. Creators
]);

// =====================================================
// BOTS CONFIÁVEIS
// =====================================================

// O próprio bot conectado ao client é protegido
// automaticamente pelo código.
//
// Bots adicionados aqui também recebem proteção total
// contra:
// • expulsão automática ao entrar
// • flood de bot
// • mensagens repetidas
// • punições automáticas do Security Guardian

const TRUSTED_BOT_IDS = new Set([
  "1380989431011610634", // Amigo dos Creators
]);

// =====================================================
// CONFIGURAÇÃO DE FLOOD DE USUÁRIO
// =====================================================

// 5 mensagens em até 6 segundos = flood.
const HUMAN_FLOOD_MAX_MESSAGES = 5;

const HUMAN_FLOOD_WINDOW_MS = 6_000;

// 3 mensagens exatamente iguais em 15 segundos.
const HUMAN_REPEAT_MAX = 3;

const HUMAN_REPEAT_WINDOW_MS = 15_000;

// =====================================================
// CONFIGURAÇÃO DE FLOOD DE BOT
// =====================================================

// Bots recebem proteção mais agressiva.

const BOT_FLOOD_MAX_MESSAGES = 5;

const BOT_FLOOD_WINDOW_MS = 5_000;

// 3 mensagens iguais em 10 segundos.
const BOT_REPEAT_MAX = 3;

const BOT_REPEAT_WINDOW_MS = 10_000;

// =====================================================
// CASTIGO
// =====================================================

// 30 minutos.
const TIMEOUT_MS = 30 * 60 * 1000;

// Mensagem de aviso desaparece após 30 segundos.
const WARNING_DELETE_MS = 30_000;

// =====================================================
// REINCIDÊNCIA
// =====================================================

// Depois de tomar castigo por FLOOD,
// se repetir dentro de 24 horas:
//
// BAN AUTOMÁTICO.

const REOFFENSE_WINDOW_MS =
  24 * 60 * 60 * 1000;

// =====================================================
// LIMPEZA DE MEMÓRIA
// =====================================================

const STATE_TTL_MS =
  24 * 60 * 60 * 1000;

// =====================================================
// PALAVRÕES / EXPRESSÕES PROIBIDAS
// =====================================================
//
// O sistema trabalha em duas camadas:
//
// 1. Expressões/palavras conhecidas.
// 2. Padrões antiburla.
//
// A normalização feita mais abaixo permite detectar:
// • maiúsculas/minúsculas
// • acentos
// • números substituindo letras
// • pontuação entre letras
// • espaços artificiais
// • letras repetidas
// • abreviações comuns
//
// Exemplos:
// tomar no cu
// tomar n0 cu
// tomar.no.cu
// tomar-no-cu
// tomarrr no cuuu
// tmnc
// vtmc
// vtnc
// fdp
// vsf
// pqp
// =====================================================

const FORBIDDEN_WORDS = [
  // ===================================================
  // EXPRESSÕES COM "CU"
  // ===================================================

  "tomar no cu",
  "toma no cu",
  "tomá no cu",
  "vai tomar no cu",
  "vá tomar no cu",
  "va tomar no cu",
  "vai toma no cu",
  "vai toma no teu cu",
  "vai tomar no seu cu",
  "vai tomar no teu cu",
  "tomar no seu cu",
  "tomar no teu cu",

  // ===================================================
  // FODER / FUDER
  // ===================================================

  "vai se foder",
  "vai se fuder",
  "vá se foder",
  "vá se fuder",
  "va se foder",
  "va se fuder",
  "se foder",
  "se fuder",
  "foda-se",
  "foda se",
  "fodase",
  "foda",
  "foder",
  "fuder",
  "fodido",
  "fodida",
  "fodidos",
  "fodidas",

  // ===================================================
  // PUTA
  // ===================================================

  "puta",
  "puto",
  "putinha",
  "putinho",
  "putona",
  "putão",
  "putao",
  "puta que pariu",
  "puta merda",

  // ===================================================
  // FILHO / FILHA DA PUTA
  // ===================================================

  "filho da puta",
  "filha da puta",
  "filhos da puta",
  "filhas da puta",
  "filho de uma puta",
  "filha de uma puta",

  // ===================================================
  // CARALHO
  // ===================================================

  "caralho",
  "caralhos",
  "carai",
  "caralho mano",

  // ===================================================
  // PORRA
  // ===================================================

  "porra",
  "porras",

  // ===================================================
  // ARROMBADO
  // ===================================================

  "arrombado",
  "arrombada",
  "arrombados",
  "arrombadas",

  // ===================================================
  // DESGRAÇADO
  // ===================================================

  "desgraçado",
  "desgraçada",
  "desgraçados",
  "desgraçadas",
  "desgraça",
  "desgraca",

  // ===================================================
  // MERDA
  // ===================================================

  "merda",
  "bosta",

  // ===================================================
  // BABACA / OTÁRIO
  // ===================================================

  "babaca",
  "otário",
  "otaria",
  "otário",
  "otaria",
  "otario",
  "idiota",
  "imbecil",

  // ===================================================
  // CUZÃO
  // ===================================================

  "cuzão",
  "cuzao",
  "cuzona",

  // ===================================================
  // PAU NO CU
  // ===================================================

  "pau no cu",
  "pau no seu cu",
  "pau no teu cu",

  // ===================================================
  // ABREVIAÇÕES / GÍRIAS
  // ===================================================

  "fdp",
  "pqp",
  "vsf",
  "vsfd",
  "tmnc",
  "tnc",
  "vtmc",
  "vtnc",
  "vtncu",
  "vai tnc",
  "vai tmnc",
  "vai vtnc",
  "vai vtmc",
  "sfdr",
  "sfd",
  "krl",
  "krlh",
  "crl",
  "crlh",
  "pnc",
];

// =====================================================
// MEMÓRIA DO SISTEMA
// =====================================================

// Histórico recente das mensagens.
const messageHistory = new Map();

// Usuários que já receberam punição por flood.
const floodPunishments = new Map();

// Impede instalação duplicada.
let installed = false;

// =====================================================
// HELPERS
// =====================================================

function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

// =====================================================
// LIMITADOR DE TEXTO
// =====================================================

function truncate(value, max = 1000) {
  const text = String(value ?? "");

  if (!text) {
    return "Sem conteúdo textual.";
  }

  return text.length > max
    ? `${text.slice(0, max - 3)}...`
    : text;
}

// =====================================================
// NORMALIZA TEXTO
// =====================================================

function normalizeText(value) {
  return String(value ?? "")
    // =================================================
    // NORMALIZA UNICODE
    // =================================================

    .normalize("NFD")

    // Remove acentos.
    .replace(/[\u0300-\u036f]/g, "")

    // Tudo minúsculo.
    .toLowerCase()

    // =================================================
    // LEETSPEAK / TROCA DE NÚMEROS
    // =================================================
    //
    // Exemplos:
    // p0rra -> porra
    // caralh0 -> caralho
    // f0der -> foder
    // put4 -> puta
    // =================================================

    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/7/g, "t")

    // =================================================
    // SÍMBOLOS USADOS PARA ESCONDER LETRAS
    // =================================================

    .replace(/@/g, "a")
    .replace(/\$/g, "s")

    // =================================================
    // SEPARADORES
    // =================================================
    //
    // Exemplos:
    // vai.tomar.no.cu
    // vai-tomar-no-cu
    // vai_tomar_no_cu
    //
    // viram:
    // vai tomar no cu
    // =================================================

    .replace(/[._,;:!?*~^`´'"()[\]{}|/\\+=<>-]+/g, " ")

    // =================================================
    // LETRAS REPETIDAS
    // =================================================
    //
    // porrrra -> porra
    // caraaaalho -> caralho
    // cuuuu -> cu
    //
    // Mantemos no máximo 2 caracteres repetidos para
    // reduzir risco de destruir palavras legítimas.
    // =================================================

    .replace(/(.)\1{2,}/g, "$1$1")

    // Normaliza espaços.
    .replace(/\s+/g, " ")

    .trim();
}

// =====================================================
// NORMALIZAÇÃO COMPACTA ANTIBURLA
// =====================================================
//
// Remove espaços, pontuação e qualquer outro caractere
// que não seja letra.
//
// Isso permite identificar tentativas como:
//
// v.s.f
// v-s-f
// v_s_f
// v s f
// f.d.p
// f-d-p
// f d p
// t.m.n.c
// t-m-n-c
// t m n c
// v.t.m.c
// v t m c
//
// Depois da normalização:
//
// v.s.f   -> vsf
// f.d.p   -> fdp
// t.m.n.c -> tmnc
// v.t.m.c -> vtmc
// =====================================================

function compactText(value) {
  return normalizeText(value)
    .replace(/[^a-z]/g, "");
}

// =====================================================
// CONTEÚDOS QUE NÃO CONTAM COMO FLOOD HUMANO
// =====================================================
//
// IMPORTANTE:
// Esta exceção vale SOMENTE para usuários humanos.
//
// Bots continuam sendo analisados normalmente,
// inclusive quando mandam links, GIFs, imagens,
// embeds ou qualquer outro conteúdo.
// =====================================================

function isSafeHumanFloodContent(message) {
  if (!message || message.author?.bot) {
    return false;
  }

  const content = String(message.content ?? "").trim();

  // ===================================================
  // 1. FIGURINHAS / STICKERS
  // ===================================================

  if (message.stickers?.size > 0) {
    return true;
  }

  // ===================================================
  // 2. GIF / IMAGEM / VÍDEO / ARQUIVO ANEXADO
  // ===================================================

  if (message.attachments?.size > 0) {
    return true;
  }

  // ===================================================
  // 3. MENSAGEM SEM TEXTO
  // Ex.: mídia, interação ou conteúdo especial.
  // ===================================================

  if (!content) {
    return true;
  }

  // ===================================================
  // 4. URL
  // ===================================================

  const urlRegex = /^https?:\/\/\S+$/i;

  if (urlRegex.test(content)) {
    return true;
  }

  // ===================================================
  // 5. LINK DO YOUTUBE
  // ===================================================

  const youtubeRegex =
    /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\//i;

  if (youtubeRegex.test(content)) {
    return true;
  }

  // ===================================================
  // 6. GIFS TENOR
  // ===================================================

  const tenorRegex =
    /^(?:https?:\/\/)?(?:www\.)?tenor\.com\//i;

  if (tenorRegex.test(content)) {
    return true;
  }

  // ===================================================
  // 7. GIFS GIPHY
  // ===================================================

  const giphyRegex =
    /^(?:https?:\/\/)?(?:www\.)?giphy\.com\//i;

  if (giphyRegex.test(content)) {
    return true;
  }

  // ===================================================
  // 8. LINK DO MEDAL
  // ===================================================

  const medalRegex =
    /^(?:https?:\/\/)?(?:www\.)?medal\.tv\//i;

  if (medalRegex.test(content)) {
    return true;
  }

  return false;
}

// =====================================================
// USUÁRIO ISENTO DE PUNIÇÃO POR FLOOD
// =====================================================
//
// IMPORTANTE:
//
// Estes usuários continuam tendo flood detectado.
//
// Se realmente fizerem flood:
// • as mensagens continuam sendo apagadas
// • NÃO recebem timeout
// • NÃO recebem castigo
// • NÃO entram na reincidência
// • NÃO recebem ban automático por flood
//
// São protegidos:
// • Rodney pelo ID
// • Owner pelo cargo
// • Resp. Creators pelo cargo
// • qualquer pessoa que possua Administrator
// =====================================================

function isHumanFloodPunishmentExempt(member) {
  if (!member) {
    return false;
  }

  // ===================================================
  // 1. macedo
  // ===================================================

  if (
    member.id ===
    "660311795327828008"
  ) {
    return true;
  }

  // ===================================================
  // 2. OWNER + RESP. CREATORS
  // ===================================================

  const exemptRoleIds =
    new Set([
      "1262262852949905408", // Owner
      "1352408327983861844", // Resp. Creators
    ]);

  if (
    member.roles?.cache?.some(
      (role) =>
        exemptRoleIds.has(
          role.id
        )
    )
  ) {
    return true;
  }

  // ===================================================
  // 3. QUALQUER CARGO COM ADMINISTRATOR
  // ===================================================

  if (
    member.roles?.cache?.some(
      (role) =>
        role.permissions?.has(
          "Administrator"
        )
    )
  ) {
    return true;
  }

  // ===================================================
  // 4. PERMISSÃO EFETIVA ADMINISTRATOR
  // ===================================================

  if (
    member.permissions?.has(
      "Administrator"
    )
  ) {
    return true;
  }

  return false;
}

// =====================================================
// USUÁRIO ISENTO DE PUNIÇÃO POR PALAVRÃO
// =====================================================

function isProfanityPunishmentExempt(member) {
  if (!member) {
    return false;
  }

  if (
    member.id ===
    "660311795327828008"
  ) {
    return true;
  }

  const exemptRoleIds =
    new Set([
      "1262262852949905408", // Owner
      "1352408327983861844", // Resp. Creators
    ]);

  if (
    member.roles?.cache?.some(
      (role) =>
        exemptRoleIds.has(
          role.id
        )
    )
  ) {
    return true;
  }

  return false;
}

// =====================================================
// PADRÕES COMPACTOS DE PALAVRÕES / ABREVIAÇÕES
// =====================================================
//
// Esta lista é usada para detectar abreviações e
// tentativas de burlar o sistema usando separadores.
//
// Exemplos:
//
// vsf
// v.s.f
// v-s-f
// v_s_f
// v s f
//
// Todos serão transformados em:
//
// vsf
//
// O mesmo acontece com:
//
// f.d.p   -> fdp
// p.q.p   -> pqp
// t.m.n.c -> tmnc
// v.t.m.c -> vtmc
//
// A comparação dessas abreviações é EXATA para evitar
// detectar acidentalmente uma sequência curta dentro
// de uma palavra legítima maior.
// =====================================================

const FORBIDDEN_COMPACT_PATTERNS = [
  // ===================================================
  // VAI TOMAR NO CU / TOMAR NO CU
  // ===================================================

  "vtmc",
  "vtnc",
  "vtncu",
  "tmnc",
  "tnc",

  // ===================================================
  // VAI SE FODER / VAI SE FUDER
  // ===================================================

  "vsf",
  "vsfd",
  "sfd",
  "sfdr",

  // ===================================================
  // FILHO DA PUTA
  // ===================================================

  "fdp",

  // ===================================================
  // PUTA QUE PARIU
  // ===================================================

  "pqp",

  // ===================================================
  // PAU NO CU
  // ===================================================

  "pnc",

  // ===================================================
  // CARALHO
  // ===================================================

  "krl",
  "krlh",
  "crl",
  "crlh",
];

// =====================================================
// PROCURA PALAVRÃO
// =====================================================

function containsForbiddenWord(content) {
  const normalized =
    normalizeText(content);

  const compact =
    compactText(content);

  if (!normalized) {
    return null;
  }

  // ===================================================
  // 1. PALAVRAS / EXPRESSÕES COMPLETAS
  // ===================================================

  for (
    const word of
    FORBIDDEN_WORDS
  ) {
    const normalizedWord =
      normalizeText(word);

    if (
      normalized.includes(
        normalizedWord
      )
    ) {
      return word;
    }
  }

  // ===================================================
  // 2. ABREVIAÇÕES EXATAS
  // ===================================================
  //
  // Detecta:
  //
  // vsf
  // v.s.f
  // v-s-f
  // v s f
  // v_s_f
  //
  // sem procurar "vsf" no meio de uma palavra maior.
  // ===================================================

  for (
    const pattern of
    FORBIDDEN_COMPACT_PATTERNS
  ) {
    if (
      compact === pattern
    ) {
      return pattern;
    }
  }

  // ===================================================
  // 3. EXPRESSÕES IMPORTANTES COM ESPAÇAMENTO BURLADO
  // ===================================================

  const compactExpressions = [
    {
      value: "vaitomarnocu",
      label: "vai tomar no cu",
    },
    {
      value: "tomarnocu",
      label: "tomar no cu",
    },
    {
      value: "tomanocu",
      label: "toma no cu",
    },
    {
      value: "vaitomanocu",
      label: "vai toma no cu",
    },
    {
      value: "vaisefoder",
      label: "vai se foder",
    },
    {
      value: "vaisefuder",
      label: "vai se fuder",
    },
    {
      value: "filhodaputa",
      label: "filho da puta",
    },
    {
      value: "filhadaputa",
      label: "filha da puta",
    },
    {
      value: "putaquepariu",
      label: "puta que pariu",
    },
    {
      value: "paunocu",
      label: "pau no cu",
    },
  ];

  for (
    const expression of
    compactExpressions
  ) {
    if (
      compact.includes(
        expression.value
      )
    ) {
      return expression.label;
    }
  }

  return null;
}

// =====================================================
// LINK DA MENSAGEM
// =====================================================

function getMessageLink(message) {
  if (
    !message?.guildId ||
    !message?.channelId ||
    !message?.id
  ) {
    return null;
  }

  return (
    `https://discord.com/channels/` +
    `${message.guildId}/` +
    `${message.channelId}/` +
    `${message.id}`
  );
}

// =====================================================
// LINK DO CANAL
// =====================================================

function getChannelLink(
  guildId,
  channelId
) {
  if (!guildId || !channelId) {
    return null;
  }

  return (
    `https://discord.com/channels/` +
    `${guildId}/` +
    `${channelId}`
  );
}

// =====================================================
// PEGA IMAGEM DA MENSAGEM
// =====================================================

function getFirstImage(message) {
  const attachmentImage =
    message.attachments?.find(
      (attachment) => {
        const contentType =
          attachment.contentType || "";

        return contentType.startsWith(
          "image/"
        );
      }
    );

  if (attachmentImage?.url) {
    return attachmentImage.url;
  }

  for (
    const embed of
    message.embeds ?? []
  ) {
    if (embed?.image?.url) {
      return embed.image.url;
    }

    if (embed?.thumbnail?.url) {
      return embed.thumbnail.url;
    }
  }

  return null;
}

// =====================================================
// LISTA ANEXOS
// =====================================================

function getAttachmentSummary(message) {
  if (!message.attachments?.size) {
    return "Nenhum.";
  }

  return truncate(
    [
      ...message.attachments.values(),
    ]
      .map((attachment) => {
        const name =
          attachment.name || "arquivo";

        return (
          `${name}: ` +
          `${attachment.url}`
        );
      })
      .join("\n"),
    1000
  );
}

// =====================================================
// AVATAR
// =====================================================

function getAuthorAvatar(user) {
  return (
    user?.displayAvatarURL?.({
      extension: "png",
      size: 256,
      forceStatic: false,
    }) ?? null
  );
}

// =====================================================
// BOT CONFIÁVEL
// =====================================================

function isTrustedBot(
  client,
  userId
) {
  return (
    userId === client.user?.id ||
    TRUSTED_BOT_IDS.has(userId)
  );
}

// =====================================================
// VERIFICA QUEM PODE ADICIONAR BOT
// =====================================================

function isAuthorizedBotAdder(member) {
  if (!member) {
    return false;
  }

  // Autorização direta pelo ID.
  if (
    AUTHORIZED_USER_IDS.has(
      member.id
    )
  ) {
    return true;
  }

  // Autorização por cargo.
  return (
    member.roles?.cache?.some(
      (role) =>
        AUTHORIZED_ROLE_IDS.has(
          role.id
        )
    ) ?? false
  );
}

// =====================================================
// CANAL DE LOG
// =====================================================

async function getLogChannel(guild) {
  const cached =
    guild.channels.cache.get(
      LOG_CHANNEL_ID
    );

  if (
    cached?.isTextBased()
  ) {
    return cached;
  }

  const fetched =
    await guild.channels
      .fetch(LOG_CHANNEL_ID)
      .catch(() => null);

  return fetched?.isTextBased()
    ? fetched
    : null;
}

// =====================================================
// ENVIA LOG
// =====================================================

async function sendSecurityLog(
  guild,
  embed
) {
  try {
    const channel =
      await getLogChannel(guild);

    if (!channel) {
      console.error(
        `[SECURITY] Canal de logs ` +
        `${LOG_CHANNEL_ID} não encontrado ` +
        `ou não é textual.`
      );

      return;
    }

    await channel.send({
      embeds: [embed],

      allowedMentions: {
        parse: [],
      },
    });
  } catch (error) {
    console.error(
      "[SECURITY] Falha ao enviar log:",
      error
    );
  }
}

// =====================================================
// REGISTRA HISTÓRICO
// =====================================================

function pushHistory(message) {
  const key =
    `${message.guildId}:` +
    `${message.author.id}`;

  const currentTime =
    Date.now();

  const normalized =
    normalizeText(
      message.content
    );

  const history =
    messageHistory.get(key) ?? [];

  history.push({
    at: currentTime,

    content: normalized,

    messageId:
      message.id,

    channelId:
      message.channelId,
  });

  const filtered =
    history.filter(
      (entry) =>
        currentTime -
          entry.at <=
        STATE_TTL_MS
    );

  messageHistory.set(
    key,
    filtered
  );

  return filtered;
}

// =====================================================
// DETECTOR DE FLOOD
// =====================================================

function detectFlood(
  message,
  history
) {
  const currentTime =
    Date.now();

  const isBot =
    message.author.bot;

  const floodWindow =
    isBot
      ? BOT_FLOOD_WINDOW_MS
      : HUMAN_FLOOD_WINDOW_MS;

  const floodMax =
    isBot
      ? BOT_FLOOD_MAX_MESSAGES
      : HUMAN_FLOOD_MAX_MESSAGES;

  const repeatWindow =
    isBot
      ? BOT_REPEAT_WINDOW_MS
      : HUMAN_REPEAT_WINDOW_MS;

  const repeatMax =
    isBot
      ? BOT_REPEAT_MAX
      : HUMAN_REPEAT_MAX;

  // ===================================================
  // FLOOD POR VELOCIDADE
  // ===================================================

  const recent =
    history.filter(
      (entry) =>
        currentTime -
          entry.at <=
        floodWindow
    );

  if (
    recent.length >=
    floodMax
  ) {
    return {
      detected: true,

      type:
        "FLOOD_RAPIDO",

      details:
        `${recent.length} mensagens ` +
        `em até ` +
        `${Math.ceil(
          floodWindow / 1000
        )} segundos.`,
    };
  }

  // ===================================================
  // FLOOD POR REPETIÇÃO
  // ===================================================

  const normalized =
    normalizeText(
      message.content
    );

  if (normalized) {
    const repeated =
      history.filter(
        (entry) =>
          currentTime -
            entry.at <=
            repeatWindow &&
          entry.content &&
          entry.content ===
            normalized
      );

    if (
      repeated.length >=
      repeatMax
    ) {
      return {
        detected: true,

        type:
          "MENSAGEM_REPETIDA",

        details:
          `${repeated.length} mensagens ` +
          `iguais em até ` +
          `${Math.ceil(
            repeatWindow /
              1000
          )} segundos.`,
      };
    }
  }

  return {
    detected: false,
    type: null,
    details: null,
  };
}

// =====================================================
// APAGA MENSAGENS DO FLOOD
// =====================================================

async function deleteRecentOffendingMessages(
  message,
  history
) {
  const channel =
    message.channel;

  if (
    !channel?.isTextBased() ||
    !channel.messages
  ) {
    return 0;
  }

  const recentIds =
    history
      .filter(
        (entry) =>
          Date.now() -
            entry.at <=
          15_000
      )
      .filter(
        (entry) =>
          entry.channelId ===
          message.channelId
      )
      .map(
        (entry) =>
          entry.messageId
      );

  let deleted = 0;

  for (
    const messageId of
    [...new Set(recentIds)]
  ) {
    const target =
      channel.messages.cache.get(
        messageId
      ) ||
      (await channel.messages
        .fetch(messageId)
        .catch(() => null));

    if (!target) {
      continue;
    }

    const ok =
      await target
        .delete()
        .then(() => true)
        .catch(() => false);

    if (ok) {
      deleted += 1;
    }
  }

  return deleted;
}

// =====================================================
// AVISO TEMPORÁRIO
// =====================================================

async function sendTemporaryWarning(
  message,
  text
) {
  try {
    if (
      !message.channel?.isTextBased()
    ) {
      return;
    }

    const warning =
      await message.channel.send({
        content: text,

        allowedMentions: {
          users: [
            message.author.id,
          ],

          parse: [],
        },
      });

    setTimeout(() => {
      warning
        .delete()
        .catch(() => {});
    }, WARNING_DELETE_MS);
  } catch (error) {
    console.error(
      "[SECURITY] Falha ao enviar aviso temporário:",
      error
    );
  }
}

// =====================================================
// EMBED COMPLETO DA MENSAGEM
// =====================================================

function buildMessageLogEmbed({
  message,
  title,
  color,
  reason,
  action,
  deletedCount = 0,
  imageUrl = null,
}) {
  const messageLink =
    getMessageLink(message);

  const channelLink =
    getChannelLink(
      message.guildId,
      message.channelId
    );

  const avatar =
    getAuthorAvatar(
      message.author
    );

  const embed =
    new EmbedBuilder()
      .setColor(color)

      .setTitle(title)

      .setAuthor({
        name:
          `${message.author.tag ||
            message.author.username}` +
          ` • ${message.author.id}`,

        iconURL:
          avatar || undefined,
      })

      .setThumbnail(
        avatar
      )

      .addFields(
        {
          name:
            "👤 Autor",

          value:
            `<@${message.author.id}>\n` +

            `**Usuário:** ` +
            `${message.author.tag ||
              message.author.username}\n` +

            `**ID:** ` +
            `\`${message.author.id}\`\n` +

            `**Bot:** ` +
            `${message.author.bot
              ? "Sim"
              : "Não"}`,

          inline: false,
        },

        {
          name:
            "📍 Local",

          value:
            `**Servidor:** ` +
            `${message.guild?.name ||
              "Desconhecido"}\n` +

            `**Canal:** ` +
            `<#${message.channelId}>\n` +

            `**ID do canal:** ` +
            `\`${message.channelId}\`\n` +

            `**Link do canal:** ` +
            `${channelLink ||
              "Indisponível"}`,

          inline: false,
        },

        {
          name:
            "💬 Conteúdo detectado",

          value:
            `\`\`\`\n` +
            `${truncate(
              message.content,
              900
            )}` +
            `\n\`\`\``,

          inline: false,
        },

        {
          name:
            "📎 Anexos",

          value:
            getAttachmentSummary(
              message
            ),

          inline: false,
        },

        {
          name:
            "🚨 Motivo",

          value:
            truncate(
              reason,
              1000
            ),

          inline: false,
        },

        {
          name:
            "⚖️ Ação automática",

          value:
            `${action}\n` +

            `**Mensagens removidas:** ` +
            `${deletedCount}\n` +

            `**Mensagem original:** ` +
            `${messageLink ||
              "Link indisponível"}`,

          inline: false,
        },

        {
          name:
            "🧾 Identificadores",

          value:
            `**Mensagem:** ` +
            `\`${message.id}\`\n` +

            `**Autor:** ` +
            `\`${message.author.id}\`\n` +

            `**Canal:** ` +
            `\`${message.channelId}\`\n` +

            `**Servidor:** ` +
            `\`${message.guildId}\``,

          inline: false,
        }
      )

      .setFooter({
        text:
          "SantaCreators • Security Guardian",
      })

      .setTimestamp();

  // ===================================================
  // IMAGEM PUBLICADA
  // ===================================================

  if (imageUrl) {
    embed.setImage(
      imageUrl
    );
  }

  return embed;
}

// =====================================================
// ANÁLISE CONTEXTUAL DE LINGUAGEM
// =====================================================
//
// O detector tradicional continua encontrando palavras
// potencialmente ofensivas.
//
// Porém encontrar uma palavra NÃO significa mais,
// sozinho, que a mensagem merece punição.
//
// Este segundo estágio tenta separar:
//
// • conversa casual
// • gíria
// • reação
// • brincadeira
//
// de:
//
// • insulto direcionado
// • humilhação
// • ataque pessoal
// • ordem ofensiva
// • hostilidade explícita
//
// =====================================================

function shouldPunishProfanityByContext(
  message,
  forbiddenWord
) {
  const content =
    normalizeText(
      message?.content || ""
    );

  const detected =
    normalizeText(
      forbiddenWord || ""
    );

  if (!content || !detected) {
    return false;
  }

  // ===================================================
  // EXPRESSÕES FORTEMENTE DIRECIONADAS
  // ===================================================
  //
  // Estas expressões possuem intenção ofensiva muito
  // mais clara e não precisam ser liberadas apenas
  // porque existe outro texto ao redor.
  //
  // ===================================================

  const aggressiveExpressions = [
    "vai tomar no cu",
    "va tomar no cu",
    "vai toma no cu",
    "vai tomar no teu cu",
    "vai tomar no seu cu",
    "vai se foder",
    "vai se fuder",
    "se foder",
    "se fuder",
    "filho da puta",
    "filha da puta",
    "pau no cu",
    "pau no seu cu",
    "pau no teu cu",
    "arrombado",
    "arrombada",
    "cuzão",
    "cuzao",
    "cuzona",
    "idiota",
    "imbecil",
  ];

  if (
    aggressiveExpressions.some(
      (expression) =>
        content.includes(
          normalizeText(expression)
        )
    )
  ) {
    return true;
  }

  // ===================================================
  // ABREVIAÇÕES CLARAMENTE OFENSIVAS
  // ===================================================

  const compact =
    compactText(
      message?.content || ""
    );

  const aggressiveCompact = new Set([
    "vsf",
    "vsfd",
    "vtmc",
    "vtnc",
    "vtncu",
    "tmnc",
    "tnc",
    "fdp",
    "pnc",
  ]);

  if (
    aggressiveCompact.has(compact)
  ) {
    return true;
  }

  // ===================================================
  // PALAVRAS AMBÍGUAS / GÍRIAS
  // ===================================================
  //
  // Estas palavras aparecem frequentemente em conversa
  // informal sem necessariamente atacar alguém.
  //
  // Exemplos:
  //
  // "foi foda kkkkk"
  // "krlh ele falou tudo"
  // "caralho que evento"
  //
  // Sozinhas elas não justificam timeout automático.
  //
  // ===================================================

  const contextualWords = new Set([
    "foda",
    "foder",
    "fuder",
    "fodido",
    "fodida",
    "fodidos",
    "fodidas",
    "puta",
    "puto",
    "caralho",
    "caralhos",
    "carai",
    "porra",
    "porras",
    "merda",
    "bosta",
    "babaca",
    "otário",
    "otaria",
    "otario",
    "krl",
    "krlh",
    "crl",
    "crlh",
    "pqp",
  ]);

  if (
    contextualWords.has(
      detected
    )
  ) {
    // ===============================================
    // PROCURA INDÍCIO DE ATAQUE DIRECIONADO
    // ===============================================

    const directedPatterns = [
      /\bvoce\s+(e|eh)\s+/i,
      /\bvc\s+(e|eh)\s+/i,
      /\btu\s+(e|eh)\s+/i,
      /\bseu\s+/i,
      /\bsua\s+/i,
      /\besse\s+/i,
      /\bessa\s+/i,
    ];

    const directed =
      directedPatterns.some(
        (pattern) =>
          pattern.test(content)
      );

    // Se nem existe sinal de direcionamento,
    // tratamos como linguagem casual.
    if (!directed) {
      return false;
    }
  }

  // ===================================================
  // CASO INCERTO
  // ===================================================
  //
  // Mantém a proteção atual para palavras que não
  // pertencem ao grupo casual.
  //
  // ===================================================

  return true;
}

// =====================================================
// PALAVRÃO
// =====================================================

async function punishHumanForProfanity(
  message,
  forbiddenWord
) {
  const member =
    message.member;

  if (!member) {
    return;
  }

  // ===================================================
  // BYPASS EXCLUSIVO DE PALAVRÃO
  // ===================================================
  //
  // Somente:
  // • Rodney
  // • Owner
  // • Resp. Creators
  //
  // Administrator NÃO possui bypass automático.
  // ===================================================

  if (
    isProfanityPunishmentExempt(
      member
    )
  ) {
    console.log(
      `[SECURITY] Linguagem proibida ignorada para ` +
      `${message.author.tag} ` +
      `(${message.author.id}) por possuir bypass ` +
      `específico de palavrão.`
    );

    return;
  }

  // Captura evidências ANTES de apagar.
  const imageUrl =
    getFirstImage(message);

  const originalContent =
    message.content;

  // ===================================================
  // APAGA MENSAGEM
  // ===================================================

  const deleted =
    await message
      .delete()
      .then(() => 1)
      .catch(() => 0);

  // ===================================================
  // TIMEOUT
  // ===================================================

  let timeoutApplied =
    false;

  let timeoutError =
    null;

  if (member.moderatable) {
    await member
      .timeout(
        TIMEOUT_MS,

        `Linguagem proibida detectada automaticamente: ${forbiddenWord}`
      )
      .then(() => {
        timeoutApplied =
          true;
      })
      .catch((error) => {
        timeoutError =
          error;
      });
  }

  // ===================================================
  // AÇÃO PARA LOG
  // ===================================================

  const action =
    timeoutApplied
      ? (
          "Mensagem apagada + " +
          "castigo de 30 minutos."
        )
      : (
          "Mensagem apagada. " +
          "Não foi possível aplicar " +
          "o castigo." +

          (
            timeoutError
              ? ` Erro: ${truncate(
                  timeoutError.message,
                  300
                )}`
              : ""
          )
        );

  // ===================================================
  // GARANTE CONTEÚDO PARA LOG
  // ===================================================

  if (
    !message.content &&
    originalContent
  ) {
    try {
      Object.defineProperty(
        message,
        "content",
        {
          configurable: true,

          value:
            originalContent,
        }
      );
    } catch {}
  }

  // ===================================================
  // LOG
  // ===================================================

  const embed =
    buildMessageLogEmbed({
      message,

      title:
        "🤬 Linguagem proibida detectada",

      color:
        0xffa500,

      reason:
        `Palavra/expressão detectada: ` +
        `"${forbiddenWord}"`,

      action,

      deletedCount:
        deleted,

      imageUrl,
    });

  await sendSecurityLog(
    message.guild,
    embed
  );

  // ===================================================
  // AVISO
  // ===================================================

  await sendTemporaryWarning(
    message,

    `⚠️ <@${message.author.id}>, ` +
      `essa linguagem não é permitida aqui. ` +
      `A mensagem foi removida e você recebeu ` +
      `**30 minutos de castigo**. ` +
      `Este aviso será apagado automaticamente ` +
      `em 30 segundos.`
  );
}

// =====================================================
// FLOOD HUMANO
// =====================================================

async function punishHumanForFlood(
  message,
  detection,
  history
) {
  const member =
    message.member;

  if (!member) {
    return;
  }

  const key =
    `${message.guildId}:` +
    `${message.author.id}`;

  const previousPunishmentAt =
    floodPunishments.get(
      key
    ) ?? 0;

  // ===================================================
  // VERIFICA REINCIDÊNCIA
  // ===================================================

  const isReoffense =
    previousPunishmentAt > 0 &&
    Date.now() -
      previousPunishmentAt <=
      REOFFENSE_WINDOW_MS;

  // ===================================================
  // EVIDÊNCIA
  // ===================================================

  const imageUrl =
    getFirstImage(message);

  // ===================================================
  // APAGA FLOOD
  // ===================================================

  const deletedCount =
    await deleteRecentOffendingMessages(
      message,
      history
    );

  // ===================================================
  // REINCIDÊNCIA = BAN
  // ===================================================

  if (isReoffense) {
    let banned =
      false;

    let banError =
      null;

    if (member.bannable) {
      await member
        .ban({
          reason:
            "Flood reincidente detectado automaticamente pelo SantaCreators Security Guardian.",

          deleteMessageSeconds:
            60 * 60,
        })
        .then(() => {
          banned =
            true;
        })
        .catch((error) => {
          banError =
            error;
        });
    }

    // =================================================
    // RESULTADO
    // =================================================

    const action =
      banned
        ? (
            "BANIMENTO AUTOMÁTICO " +
            "por reincidência de flood."
          )
        : (
            "Tentativa de banimento por " +
            "reincidência. " +
            "Não foi possível banir." +

            (
              banError
                ? ` Erro: ${truncate(
                    banError.message,
                    300
                  )}`
                : ""
            )
          );

    // =================================================
    // LOG
    // =================================================

    const embed =
      buildMessageLogEmbed({
        message,

        title:
          "🔨 Flood reincidente • Banimento",

        color:
          0xed4245,

        reason:
          `${detection.type}: ` +
          `${detection.details}`,

        action,

        deletedCount,

        imageUrl,
      });

    await sendSecurityLog(
      message.guild,
      embed
    );

    // =================================================
    // CASO BAN FALHE
    // =================================================

    if (!banned) {
      await sendTemporaryWarning(
        message,

        `🚨 <@${message.author.id}>, ` +
          `foi detectada **reincidência de flood**, ` +
          `mas o sistema não conseguiu concluir ` +
          `o banimento. ` +
          `A administração foi avisada. ` +
          `Esta mensagem será apagada em 30 segundos.`
      );
    }

    return;
  }

  // ===================================================
  // PRIMEIRA OCORRÊNCIA
  // ===================================================

  let timeoutApplied =
    false;

  let timeoutError =
    null;

  if (member.moderatable) {
    await member
      .timeout(
        TIMEOUT_MS,

        `Flood detectado automaticamente: ${detection.type}`
      )
      .then(() => {
        timeoutApplied =
          true;
      })
      .catch((error) => {
        timeoutError =
          error;
      });
  }

  // ===================================================
  // REGISTRA PRIMEIRA PUNIÇÃO
  // ===================================================

  if (timeoutApplied) {
    floodPunishments.set(
      key,
      Date.now()
    );
  }

  // ===================================================
  // RESULTADO
  // ===================================================

  const action =
    timeoutApplied
      ? (
          "Mensagens de flood removidas + " +
          "castigo de 30 minutos. " +
          "Novo flood dentro de 24h " +
          "gera ban automático."
        )
      : (
          "Mensagens removidas. " +
          "Não foi possível aplicar castigo." +

          (
            timeoutError
              ? ` Erro: ${truncate(
                  timeoutError.message,
                  300
                )}`
              : ""
          )
        );

  // ===================================================
  // LOG
  // ===================================================

  const embed =
    buildMessageLogEmbed({
      message,

      title:
        "🌊 Flood detectado • 1ª ocorrência",

      color:
        0xfee75c,

      reason:
        `${detection.type}: ` +
        `${detection.details}`,

      action,

      deletedCount,

      imageUrl,
    });

  await sendSecurityLog(
    message.guild,
    embed
  );

  // ===================================================
  // AVISO
  // ===================================================

  await sendTemporaryWarning(
    message,

    `⚠️ <@${message.author.id}>, ` +
      `flood não é permitido. ` +
      `As mensagens foram removidas e você recebeu ` +
      `**30 minutos de castigo**. ` +
      `Se houver reincidência de flood dentro de ` +
      `24 horas, o sistema poderá aplicar ` +
      `**banimento automático**. ` +
      `Este aviso será apagado em 30 segundos.`
  );
}

// =====================================================
// FLOOD DE BOT
// =====================================================

async function punishBotForFlood(
  client,
  message,
  detection,
  history
) {
  // ===================================================
  // PROTEÇÃO DO NOSSO BOT
  // ===================================================

  if (
    isTrustedBot(
      client,
      message.author.id
    )
  ) {
    return;
  }

  const member =
    message.member;

  if (!member) {
    return;
  }

  // ===================================================
  // CAPTURA IMAGEM
  // ===================================================

  const imageUrl =
    getFirstImage(message);

  // ===================================================
  // APAGA MENSAGENS
  // ===================================================

  const deletedCount =
    await deleteRecentOffendingMessages(
      message,
      history
    );

  // ===================================================
  // EXPULSA BOT
  // ===================================================

  let kicked =
    false;

  let kickError =
    null;

  if (member.kickable) {
    await member
      .kick(
        `Bot expulso automaticamente por flood: ${detection.type}`
      )
      .then(() => {
        kicked =
          true;
      })
      .catch((error) => {
        kickError =
          error;
      });
  }

  // ===================================================
  // RESULTADO
  // ===================================================

  const action =
    kicked
      ? (
          "BOT EXPULSO automaticamente " +
          "por flood."
        )
      : (
          "Flood bloqueado, porém não foi " +
          "possível expulsar o bot." +

          (
            kickError
              ? ` Erro: ${truncate(
                  kickError.message,
                  300
                )}`
              : ""
          )
        );

  // ===================================================
  // LOG
  // ===================================================

  const embed =
    buildMessageLogEmbed({
      message,

      title:
        "🤖🚨 Bot em flood detectado",

      color:
        0xed4245,

      reason:
        `${detection.type}: ` +
        `${detection.details}`,

      action,

      deletedCount,

      imageUrl,
    });

  await sendSecurityLog(
    message.guild,
    embed
  );
}

// =====================================================
// MESSAGE CREATE
// =====================================================

async function handleMessage(
  client,
  message
) {
  try {
    // =================================================
    // IGNORA DM / INVÁLIDO
    // =================================================

    if (
      !message?.guild ||
      !message?.author
    ) {
      return;
    }

    // =================================================
    // NUNCA PUNE O PRÓPRIO BOT
    // =================================================

    if (
      message.author.id ===
      client.user?.id
    ) {
      return;
    }

    // =================================================
    // BOT
    // =================================================
    //
    // Bots são analisados ANTES das exceções humanas.
    //
    // Portanto:
    // • link de bot conta
    // • imagem de bot conta
    // • GIF de bot conta
    // • embed de bot conta
    // • texto de bot conta
    //
    // Isso impede um bot malicioso de escapar do
    // anti-flood simplesmente usando links ou mídia.
    // =================================================

    if (message.author.bot) {
      // =================================================
      // BOT CONFIÁVEL
      // =================================================

      if (
        isTrustedBot(
          client,
          message.author.id
        )
      ) {
        return;
      }

      // =================================================
      // REGISTRA TODA MENSAGEM DE BOT
      // =================================================

      const history =
        pushHistory(message);

      // =================================================
      // DETECTA FLOOD
      // =================================================

      const detection =
        detectFlood(
          message,
          history
        );

      console.log(
        "[SECURITY][BOT-MESSAGE]",
        {
          bot: message.author.tag,
          botId: message.author.id,
          guildId: message.guildId,
          channelId: message.channelId,
          messageId: message.id,
          historyCount: history.length,
          detected: detection.detected,
          type: detection.type,
          details: detection.details,
          memberFound: Boolean(message.member),
          kickable: Boolean(message.member?.kickable),
          content: truncate(
            message.content,
            150
          ),
        }
      );

      if (
        detection.detected
      ) {
        console.warn(
          "[SECURITY][BOT-FLOOD-DETECTADO]",
          {
            bot: message.author.tag,
            botId: message.author.id,
            type: detection.type,
            details: detection.details,
            kickable: Boolean(
              message.member?.kickable
            ),
          }
        );

        await punishBotForFlood(
          client,
          message,
          detection,
          history
        );
      }

      return;
    }

    // =================================================
    // USUÁRIO HUMANO
    // =================================================

    // =================================================
    // PALAVRÃO
    // =================================================
    //
    // A verificação de palavrão vem ANTES da exceção
    // de flood.
    //
    // Assim uma pessoa não consegue escapar do filtro
    // escrevendo palavrão junto com algum conteúdo.
    // =================================================

   const forbiddenWord =
  containsForbiddenWord(
    message.content
  );

if (forbiddenWord) {
  const shouldPunish =
    shouldPunishProfanityByContext(
      message,
      forbiddenWord
    );

  if (shouldPunish) {
    await punishHumanForProfanity(
      message,
      forbiddenWord
    );

    return;
  }

  console.log(
    `[SECURITY] Linguagem casual/contextual ignorada: ` +
    `${message.author.tag} ` +
    `(${message.author.id}) | ` +
    `detectado="${forbiddenWord}" | ` +
    `mensagem="${truncate(
      message.content,
      150
    )}"`
  );
}

    // =================================================
    // CONTEÚDO SEGURO PARA FLOOD HUMANO
    // =================================================
    //
    // Não entra na contagem de flood:
    //
    // • GIF
    // • figurinha
    // • imagem
    // • vídeo
    // • arquivo
    // • link puro
    // • YouTube
    // • Medal
    // • Tenor
    // • Giphy
    //
    // IMPORTANTE:
    // Isso vale somente para HUMANOS.
    // =================================================
if (
  isSafeHumanFloodContent(
    message
  )
) {
  return;
}

// =================================================
// BYPASS COMPLETO DE FLOOD HUMANO
// =================================================
//
// Rodney, Owner, Resp. Creators e qualquer membro
// com Administrator ficam completamente fora do
// sistema de flood humano.
//
// As mensagens:
// • NÃO entram no histórico
// • NÃO são apagadas
// • NÃO geram timeout
// • NÃO geram reincidência
// • NÃO geram banimento
// =================================================

if (
  isHumanFloodPunishmentExempt(
    message.member
  )
) {
  return;
}

// =================================================
// SOMENTE AGORA REGISTRA NO HISTÓRICO HUMANO
// =================================================

const history =
  pushHistory(message);

// =================================================
// FLOOD HUMANO
// =================================================

const detection =
  detectFlood(
    message,
    history
  );

if (
  detection.detected
) {
      await punishHumanForFlood(
        message,
        detection,
        history
      );
    }
  } catch (error) {
    console.error(
      "[SECURITY] Erro no messageCreate:",
      error
    );
  }
}

// =====================================================
// DESCOBRE QUEM ADICIONOU O BOT
// =====================================================

async function findBotAdder(
  guild,
  botId
) {
  // ===================================================
  // ESPERA AUDIT LOG PROPAGAR
  // ===================================================

  await new Promise(
    (resolve) =>
      setTimeout(
        resolve,
        1500
      )
  );

  // ===================================================
  // CONSULTA AUDIT LOG
  // ===================================================

  const logs =
    await guild
      .fetchAuditLogs({
        type:
          AuditLogEvent.BotAdd,

        limit:
          10,
      })
      .catch((error) => {
        console.error(
          "[SECURITY] Falha ao consultar Audit Log BotAdd:",
          error
        );

        return null;
      });

  if (!logs) {
    return null;
  }

  // ===================================================
  // ACEITA SOMENTE REGISTRO RECENTE
  // ===================================================

  const maxAge =
    30_000;

  const entry =
    logs.entries.find(
      (auditEntry) => {
        const targetId =
          auditEntry.target?.id;

        const age =
          Date.now() -
          auditEntry.createdTimestamp;

        return (
          targetId === botId &&
          age >= 0 &&
          age <= maxAge
        );
      }
    );

  return entry ?? null;
}

// =====================================================
// BOT ENTROU NO SERVIDOR
// =====================================================

async function handleBotJoin(
  client,
  member
) {
  try {
    // =================================================
    // SÓ BOT
    // =================================================

    if (
      !member?.guild ||
      !member.user?.bot
    ) {
      return;
    }

   // =================================================
// NUNCA REMOVE BOT CONFIÁVEL
// =================================================

// Protege:
// • o próprio Security Guardian
// • todos os bots cadastrados em TRUSTED_BOT_IDS
//
// Bot confiável não depende do Audit Log.
// Mesmo que o Discord demore para informar quem adicionou,
// ele permanecerá no servidor.

if (
  isTrustedBot(
    client,
    member.id
  )
) {
  console.log(
    `[SECURITY] Bot confiável protegido na entrada: ` +
    `${member.user?.tag || member.user?.username} ` +
    `(${member.id}).`
  );

  return;
}

const guild =
  member.guild;

    // =================================================
    // DESCOBRE QUEM ADICIONOU
    // =================================================

    const auditEntry =
      await findBotAdder(
        guild,
        member.id
      );

    const executor =
      auditEntry?.executor ??
      null;

    const executorId =
      executor?.id ??
      null;

    // =================================================
    // CARREGA MEMBRO RESPONSÁVEL
    // =================================================

    const executorMember =
      executorId
        ? await guild.members
            .fetch(
              executorId
            )
            .catch(
              () => null
            )
        : null;

    // =================================================
    // VERIFICA AUTORIZAÇÃO
    // =================================================

    const authorized =
      isAuthorizedBotAdder(
        executorMember
      );

    // =================================================
    // LISTA CARGOS
    // =================================================

    const executorRoles =
      executorMember
        ? (
            executorMember.roles.cache
              .filter(
                (role) =>
                  role.id !==
                  guild.id
              )
              .map(
                (role) =>
                  `${role.name} ` +
                  `(\`${role.id}\`)`
              )
              .join("\n") ||
            "Nenhum cargo."
          )
        : (
            "Não foi possível " +
            "carregar os cargos."
          );

    let action =
      "";

    let color =
      0x57f287;

    // =================================================
    // AUTORIZADO
    // =================================================

    if (authorized) {
      action =
        "✅ Entrada autorizada. " +
        "O bot permaneceu no servidor.";
    }

    // =================================================
    // NÃO AUTORIZADO
    // =================================================

    else {
      color =
        0xed4245;

      if (!auditEntry) {
        action =
          "⚠️ Não foi possível confirmar " +
          "quem adicionou o bot pelo Audit Log. " +
          "Por segurança, foi realizada tentativa " +
          "de expulsão.";
      } else {
        action =
          "🚫 Responsável sem autorização. " +
          "Foi realizada tentativa de " +
          "expulsão automática.";
      }

      // =================================================
      // KICK
      // =================================================

      if (member.kickable) {
        const kicked =
          await member
            .kick(
              "Bot adicionado sem autorização do SantaCreators Security Guardian."
            )
            .then(
              () => true
            )
            .catch(
              (error) => {
                console.error(
                  "[SECURITY] Falha ao expulsar bot não autorizado:",
                  error
                );

                return false;
              }
            );

        action +=
          kicked
            ? (
                "\n✅ **Bot expulso " +
                "com sucesso.**"
              )
            : (
                "\n❌ **Não foi possível " +
                "expulsar o bot. " +
                "Verifique hierarquia/permissões.**"
              );
      } else {
        action +=
          "\n❌ **O bot não é expulsável " +
          "pelo bot de segurança. " +
          "Verifique a hierarquia de cargos.**";
      }
    }

    // =================================================
    // EMBED
    // =================================================

    const embed =
      new EmbedBuilder()

        .setColor(
          color
        )

        .setTitle(
          authorized
            ? (
                "🤖✅ Bot adicionado " +
                "com autorização"
              )
            : (
                "🤖🚨 Bot não autorizado " +
                "detectado"
              )
        )

        .setThumbnail(
          getAuthorAvatar(
            member.user
          )
        )

        .addFields(
          {
            name:
              "🤖 Bot",

            value:
              `**Nome:** ` +
              `${member.user.tag ||
                member.user.username}\n` +

              `**ID:** ` +
              `\`${member.id}\`\n` +

              `**Menção:** ` +
              `<@${member.id}>`,

            inline:
              false,
          },

          {
            name:
              "👤 Quem adicionou",

            value:
              executor
                ? (
                    `**Usuário:** ` +
                    `${executor.tag ||
                      executor.username}\n` +

                    `**ID:** ` +
                    `\`${executor.id}\`\n` +

                    `**Menção:** ` +
                    `<@${executor.id}>`
                  )
                : (
                    "Não identificado " +
                    "no Audit Log."
                  ),

            inline:
              false,
          },

          {
            name:
              "🎭 Cargos de quem adicionou",

            value:
              truncate(
                executorRoles,
                1000
              ),

            inline:
              false,
          },

          {
            name:
              "🔐 Autorização",

            value:
              authorized
                ? "AUTORIZADO"
                : "NÃO AUTORIZADO",

            inline:
              true,
          },

          {
            name:
              "⚖️ Ação",

            value:
              action,

            inline:
              false,
          },

          {
            name:
              "🕒 Detecção",

            value:
              `<t:${nowUnix()}:F>`,

            inline:
              false,
          }
        )

        .setFooter({
          text:
            "SantaCreators • Bot Security Guardian",
        })

        .setTimestamp();

    // =================================================
    // ENVIA LOG
    // =================================================

    await sendSecurityLog(
      guild,
      embed
    );
  } catch (error) {
    console.error(
      "[SECURITY] Erro no guildMemberAdd:",
      error
    );
  }
}

// =====================================================
// LIMPEZA AUTOMÁTICA DA MEMÓRIA
// =====================================================

function cleanupState() {
  const now =
    Date.now();

  // ===================================================
  // HISTÓRICO
  // ===================================================

  for (
    const [
      key,
      history,
    ] of messageHistory.entries()
  ) {
    const filtered =
      history.filter(
        (entry) =>
          now -
            entry.at <=
          STATE_TTL_MS
      );

    if (
      filtered.length === 0
    ) {
      messageHistory.delete(
        key
      );
    } else {
      messageHistory.set(
        key,
        filtered
      );
    }
  }

  // ===================================================
  // PUNIÇÕES
  // ===================================================

  for (
    const [
      key,
      timestamp,
    ] of floodPunishments.entries()
  ) {
    if (
      now -
        timestamp >
      REOFFENSE_WINDOW_MS
    ) {
      floodPunishments.delete(
        key
      );
    }
  }
}

// =====================================================
// INSTALAÇÃO DO GUARDIÃO
// =====================================================

export function installBotSecurityGuardian(
  client
) {
  // ===================================================
  // CLIENT OBRIGATÓRIO
  // ===================================================

  if (!client) {
    throw new Error(
      "[SECURITY] Client não informado ao installBotSecurityGuardian."
    );
  }

  // ===================================================
  // IMPEDE DUPLICAÇÃO
  // ===================================================

  if (
    installed ||
    client
      .__SC_BOT_SECURITY_GUARDIAN_INSTALLED__
  ) {
    return;
  }

  installed =
    true;

  client
    .__SC_BOT_SECURITY_GUARDIAN_INSTALLED__ =
    true;

  // ===================================================
  // ENTRADA DE BOT
  // ===================================================

  client.on(
    "guildMemberAdd",

    async (member) => {
      if (
        !member.user?.bot
      ) {
        return;
      }

      await handleBotJoin(
        client,
        member
      );
    }
  );

  // ===================================================
  // MENSAGENS
  // ===================================================

  client.on(
    "messageCreate",

    async (message) => {
      await handleMessage(
        client,
        message
      );
    }
  );

  // ===================================================
  // LIMPEZA DE MEMÓRIA
  // ===================================================

  const cleanupInterval =
    setInterval(
      cleanupState,

      30 * 60 * 1000
    );

  if (
    typeof cleanupInterval.unref ===
    "function"
  ) {
    cleanupInterval.unref();
  }

  // ===================================================
  // READY
  // ===================================================

  client.once(
    "ready",

    () => {
      const me =
        client.user;

      console.log(
        `[SECURITY] Guardian ativo como ` +
        `${me?.tag ||
          me?.username ||
          "bot"} ` +
        `(${me?.id ||
          "sem-id"}).`
      );

      console.log(
        `[SECURITY] Log: ` +
        `${LOG_CHANNEL_ID} | ` +

        `Flood humano: ` +
        `${HUMAN_FLOOD_MAX_MESSAGES}/` +
        `${HUMAN_FLOOD_WINDOW_MS}ms | ` +

        `Flood bot: ` +
        `${BOT_FLOOD_MAX_MESSAGES}/` +
        `${BOT_FLOOD_WINDOW_MS}ms | ` +

        `Timeout: ` +
        `${TIMEOUT_MS}ms.`
      );
    }
  );
}

// =====================================================
// EXPORT DEFAULT
// =====================================================

export default installBotSecurityGuardian;