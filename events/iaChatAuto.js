// d:\santacreators-main\events\iaChatAuto.js

import {
  AttachmentBuilder,
  ChannelType,
} from "discord.js";

import { GoogleGenAI } from "@google/genai";

// =====================================================
// IA CHAT AUTO PROFISSIONAL — SANTACREATORS
// =====================================================
// • Lê menções
// • Lê cargos
// • Lê canais
// • Lê IDs
// • Lê imagens
// • Lê links
// • Lê reply
// • Lê contexto
// • Memória recente
// • Anti spam
// • Cooldown
// • Logs detalhados
// • Reconhece quando estão falando com ela
// • Respostas mais humanas
// • Melhor leitura do Discord
// =====================================================

const AI_CHANNEL_ID = "1506520202576400404";

const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY || "";

const COOLDOWN_MS = 12000;

const MAX_RESPONSE_CHARS = 1900;

const MAX_HISTORY_MESSAGES = 8;

const MAX_MESSAGE_CHARS = 1200;

const cooldowns = new Map();

const channelHistory = new Map();

let gemini = null;

// =====================================================
// CONTEXTO FIXO
// =====================================================

const SANTACREATORS_CONTEXT = `
Você é a IA oficial da SantaCreators.

Seu nome é SantaCreators IA.

Você conversa dentro de um servidor RP/FiveM.

REGRAS:
- Responda SEMPRE em português brasileiro.
- Seja natural.
- Seja inteligente.
- Seja divertida quando fizer sentido.
- Seja profissional quando necessário.
- Nunca fale como robô.
- Nunca diga que é uma IA limitada.
- Nunca invente regras da staff.
- Nunca peça token, senha, API KEY ou dados sensíveis.
- Você pode ajudar:
  • eventos
  • anúncios
  • criatividade
  • dúvidas
  • socialização
  • RP
  • organização
  • Discord
  • SantaCreators

COMPORTAMENTO:
- Se a pessoa marcar alguém, entenda isso.
- Se a pessoa responder alguém, entenda isso.
- Se mandarem link, analise o contexto.
- Se mandarem imagem, reconheça que existe imagem.
- Se mandarem ID, reconheça que é um ID.
- Se mandarem canal, reconheça canal.
- Se mandarem cargo, reconheça cargo.
- Se mandarem usuário, reconheça usuário.

IMPORTANTE:
- Responda de forma humana.
- Evite respostas secas.
- Não faça textão enorme.
- Respostas naturais.
- Use contexto da conversa.
- Não repita mensagens.
- Não responda igual toda hora.
- Você faz parte da SantaCreators.
`;

// =====================================================
// CLIENT GEMINI
// =====================================================

function getGeminiClient() {
  if (gemini) return gemini;

  if (!GEMINI_API_KEY) {
    console.error(
      "[IA CHAT AUTO] GEMINI_API_KEY não encontrada."
    );

    return null;
  }

  gemini = new GoogleGenAI({
    apiKey: GEMINI_API_KEY,
  });

  return gemini;
}

// =====================================================
// HELPERS
// =====================================================

function cleanText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_MESSAGE_CHARS);
}

function limitDiscordText(text) {
  const finalText = String(text || "").trim();

  if (!finalText) return null;

  if (finalText.length <= MAX_RESPONSE_CHARS) {
    return finalText;
  }

  return `${finalText.slice(0, MAX_RESPONSE_CHARS - 3)}...`;
}

function rememberMessage(channelId, author, content) {
  const history = channelHistory.get(channelId) || [];

  history.push({
    author,
    content,
    timestamp: Date.now(),
  });

  while (history.length > MAX_HISTORY_MESSAGES) {
    history.shift();
  }

  channelHistory.set(channelId, history);
}

function getHistory(channelId) {
  const history = channelHistory.get(channelId) || [];

  if (!history.length) {
    return "Sem histórico.";
  }

  return history
    .map((msg) => {
      return `${msg.author}: ${msg.content}`;
    })
    .join("\n");
}

function getCooldownRemaining(userId) {
  const expiresAt = cooldowns.get(userId) || 0;

  const now = Date.now();

  if (now >= expiresAt) return 0;

  return expiresAt - now;
}

function setCooldown(userId) {
  cooldowns.set(userId, Date.now() + COOLDOWN_MS);
}

// =====================================================
// LEITURA PROFISSIONAL DISCORD
// =====================================================

async function buildDiscordContext(message) {
  const context = [];

  // =====================================================
  // AUTOR
  // =====================================================

  context.push(`AUTOR:
- Username: ${message.author.username}
- Display Name: ${message.member?.displayName || "Sem nome"}
- User ID: ${message.author.id}`);

  // =====================================================
  // CANAL
  // =====================================================

  context.push(`CANAL:
- Nome: ${message.channel?.name || "Desconhecido"}
- Canal ID: ${message.channelId}`);

  // =====================================================
  // MENSAGEM
  // =====================================================

  context.push(`MENSAGEM:
${cleanText(message.content || "")}`);

  // =====================================================
  // MENÇÕES DE USUÁRIOS
  // =====================================================

  if (message.mentions.users.size > 0) {
    const users = [];

    for (const [, user] of message.mentions.users) {
      users.push(
        `- ${user.username} (${user.id})`
      );
    }

    context.push(`USUÁRIOS MARCADOS:
${users.join("\n")}`);
  }

  // =====================================================
  // MENÇÕES DE CARGOS
  // =====================================================

  if (message.mentions.roles.size > 0) {
    const roles = [];

    for (const [, role] of message.mentions.roles) {
      roles.push(
        `- ${role.name} (${role.id})`
      );
    }

    context.push(`CARGOS MARCADOS:
${roles.join("\n")}`);
  }

  // =====================================================
  // MENÇÕES DE CANAIS
  // =====================================================

  if (message.mentions.channels.size > 0) {
    const channels = [];

    for (const [, channel] of message.mentions.channels) {
      channels.push(
        `- #${channel.name} (${channel.id})`
      );
    }

    context.push(`CANAIS MARCADOS:
${channels.join("\n")}`);
  }

  // =====================================================
  // LINKS
  // =====================================================

  const links =
    message.content?.match(
      /(https?:\/\/[^\s]+)/gi
    ) || [];

  if (links.length > 0) {
    context.push(`LINKS:
${links.join("\n")}`);
  }

  // =====================================================
  // ANEXOS / IMAGENS
  // =====================================================

  if (message.attachments.size > 0) {
    const attachments = [];

    for (const [, attachment] of message.attachments) {
      attachments.push(
        `- Nome: ${attachment.name}
- URL: ${attachment.url}
- Tipo: ${attachment.contentType || "Desconhecido"}`
      );
    }

    context.push(`ANEXOS:
${attachments.join("\n\n")}`);
  }

  // =====================================================
  // REPLY
  // =====================================================

  if (message.reference?.messageId) {
    try {
      const replied =
        await message.channel.messages.fetch(
          message.reference.messageId
        );

      if (replied) {
        context.push(`RESPONDENDO MENSAGEM:
Autor: ${replied.author.username}
Conteúdo: ${cleanText(replied.content)}`);
      }
    } catch {}
  }

  // =====================================================
  // CARGOS DO AUTOR
  // =====================================================

  if (message.member?.roles?.cache) {
    const roles =
      message.member.roles.cache
        .filter((r) => r.name !== "@everyone")
        .map((r) => r.name)
        .slice(0, 15);

    if (roles.length > 0) {
      context.push(`CARGOS DO AUTOR:
${roles.join(", ")}`);
    }
  }

  return context.join("\n\n");
}

// =====================================================
// IGNORAR
// =====================================================

function shouldIgnoreMessage(message, client) {
  if (!message) return true;

  if (!message.guild) return true;

  if (message.author?.bot) return true;

  if (message.webhookId) return true;

  if (message.channelId !== AI_CHANNEL_ID) {
    return true;
  }

  if (
    client?.user?.id &&
    message.author.id === client.user.id
  ) {
    return true;
  }

  const content =
    message.content?.trim() || "";

  if (
    !content &&
    message.attachments.size <= 0
  ) {
    return true;
  }

  return false;
}

// =====================================================
// DETECTAR SE ESTÃO FALANDO COM A IA
// =====================================================

function isTalkingToAI(message, client) {
  const content =
    String(message.content || "")
      .toLowerCase();

  const triggers = [
    "ia",
    "bot",
    "santa",
    "santacreators",
    "sc",
    "me ajuda",
    "ajuda",
    "você",
    "tu",
  ];

  const mentioned =
    message.mentions.users.has(client.user.id);

  if (mentioned) return true;

  return triggers.some((t) =>
    content.includes(t)
  );
}

// =====================================================
// PROMPT
// =====================================================

function buildPrompt({
  discordContext,
  history,
}) {
  return `
${SANTACREATORS_CONTEXT}

HISTÓRICO:
${history}

CONTEXTO DISCORD:
${discordContext}

IMPORTANTE:
- Entenda menções.
- Entenda IDs.
- Entenda replies.
- Entenda cargos.
- Entenda links.
- Entenda canais.
- Entenda contexto social.
- Responda como alguém da SantaCreators.

Agora responda naturalmente:
`;
}

// =====================================================
// ERROS
// =====================================================

function isGeminiQuotaError(err) {
  const text =
    String(err?.message || err)
      .toLowerCase();

  return (
    text.includes("quota") ||
    text.includes("429") ||
    text.includes("rate")
  );
}

function isGeminiModelError(err) {
  const text =
    String(err?.message || err)
      .toLowerCase();

  return (
    text.includes("404") ||
    text.includes("model") ||
    text.includes("not found")
  );
}

function isGeminiKeyError(err) {
  const text =
    String(err?.message || err)
      .toLowerCase();

  return (
    text.includes("401") ||
    text.includes("403") ||
    text.includes("api key")
  );
}

// =====================================================
// GERAR RESPOSTA
// =====================================================

async function generateIAResponse({
  message,
  client,
}) {
  const geminiClient =
    getGeminiClient();

  if (!geminiClient) {
    return "Minha API Gemini ainda não foi configurada direito.";
  }

  const history =
    getHistory(message.channelId);

  const discordContext =
    await buildDiscordContext(message);

  const prompt =
    buildPrompt({
      discordContext,
      history,
    });

  const result =
    await geminiClient.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,

      config: {
        temperature: 0.9,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 250,
      },
    });

  return result.text;
}

// =====================================================
// SETUP PRINCIPAL
// =====================================================

export function setupIaChatAuto(client) {
  if (
    globalThis.__SC_IA_CHAT_AUTO_BOOTSTRAPPED__
  ) {
    console.log(
      "[IA CHAT AUTO] Bootstrap ignorado."
    );

    return;
  }

  globalThis.__SC_IA_CHAT_AUTO_BOOTSTRAPPED__ =
    true;

  console.log(
    "[IA CHAT AUTO] Sistema iniciado."
  );

  console.log(
    `[IA CHAT AUTO] Modelo: ${GEMINI_MODEL}`
  );

  console.log(
    `[IA CHAT AUTO] Canal: ${AI_CHANNEL_ID}`
  );

  client.on(
    "messageCreate",
    async (message) => {
      try {
        if (
          shouldIgnoreMessage(
            message,
            client
          )
        ) {
          return;
        }

        const content =
          cleanText(message.content);

        rememberMessage(
          message.channelId,
          message.author.username,
          content
        );

        // =====================================================
        // COOLDOWN
        // =====================================================

        const remaining =
          getCooldownRemaining(
            message.author.id
          );

        if (remaining > 0) {
          return;
        }

        setCooldown(message.author.id);

        // =====================================================
        // LOGS
        // =====================================================

        console.log(`
[IA CHAT AUTO]
User: ${message.author.tag}
ID: ${message.author.id}
Canal: ${message.channel?.name}
Mensagem: ${content}
        `);

        // =====================================================
        // DIGITANDO
        // =====================================================

        await message.channel
          .sendTyping()
          .catch(() => {});

        // =====================================================
        // GERAÇÃO IA
        // =====================================================

        const iaResponse =
          await generateIAResponse({
            message,
            client,
          });

        const finalText =
          limitDiscordText(
            iaResponse
          );

        if (!finalText) return;

        // =====================================================
        // RESPOSTA
        // =====================================================

        await message.reply({
          content: finalText,

          allowedMentions: {
            repliedUser: true,
            parse: [],
          },
        });

      } catch (err) {
        console.error(
          "[IA CHAT AUTO] ERRO:",
          err
        );

        // =====================================================
        // MODEL ERROR
        // =====================================================

        if (
          isGeminiModelError(err)
        ) {
          await message.reply({
            content:
              "O modelo Gemini configurado não existe ou está inválido.",

            allowedMentions: {
              repliedUser: true,
            },
          }).catch(() => {});

          return;
        }

        // =====================================================
        // QUOTA ERROR
        // =====================================================

        if (
          isGeminiQuotaError(err)
        ) {
          await message.reply({
            content:
              "A IA bateu o limite da API agora 😭 tenta novamente daqui a pouco.",

            allowedMentions: {
              repliedUser: true,
            },
          }).catch(() => {});

          return;
        }

        // =====================================================
        // KEY ERROR
        // =====================================================

        if (
          isGeminiKeyError(err)
        ) {
          await message.reply({
            content:
              "A chave Gemini parece inválida ou sem permissão.",

            allowedMentions: {
              repliedUser: true,
            },
          }).catch(() => {});

          return;
        }

        // =====================================================
        // ERRO GERAL
        // =====================================================

        await message.reply({
          content:
            "Deu um erro interno na IA agora, mas já registrei no console pra verificarem.",

          allowedMentions: {
            repliedUser: true,
          },
        }).catch(() => {});
      }
    }
  );
}