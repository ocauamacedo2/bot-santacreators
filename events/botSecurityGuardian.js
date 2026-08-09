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
// Caso futuramente queira liberar outro bot para flood
// legítimo, coloque o ID aqui.

const TRUSTED_BOT_IDS = new Set([
  // "ID_DO_BOT",
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
// Você pode adicionar mais palavras aqui depois.
//
// IMPORTANTE:
// É melhor usar palavras/expressões completas para
// diminuir falso positivo.
// =====================================================

const FORBIDDEN_WORDS = [
  "filho da puta",
  "filha da puta",
  "vai tomar no cu",
  "vai se foder",
  "vai se fuder",
  "puta que pariu",
  "arrombado",
  "arrombada",
  "desgraçado",
  "desgraçada",
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
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// =====================================================
// PROCURA PALAVRÃO
// =====================================================

function containsForbiddenWord(content) {
  const normalized = normalizeText(content);

  if (!normalized) {
    return null;
  }

  return (
    FORBIDDEN_WORDS.find((word) =>
      normalized.includes(
        normalizeText(word)
      )
    ) ?? null
  );
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
    // REGISTRA HISTÓRICO
    // =================================================

    const history =
      pushHistory(message);

    // =================================================
    // BOT
    // =================================================

    if (message.author.bot) {
      // Bot confiável não recebe punição.
      if (
        isTrustedBot(
          client,
          message.author.id
        )
      ) {
        return;
      }

      const detection =
        detectFlood(
          message,
          history
        );

      if (
        detection.detected
      ) {
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

    const forbiddenWord =
      containsForbiddenWord(
        message.content
      );

    if (forbiddenWord) {
      await punishHumanForProfanity(
        message,
        forbiddenWord
      );

      return;
    }

    // =================================================
    // FLOOD
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
    // NUNCA REMOVE O PRÓPRIO BOT
    // =================================================

    if (
      member.id ===
      client.user?.id
    ) {
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