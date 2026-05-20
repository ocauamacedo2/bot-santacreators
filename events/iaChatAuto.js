// d:\santacreators-main\events\iaChatAuto.js
import OpenAI from "openai";

// =====================================================
// IA CHAT AUTO — SANTACREATORS
// Discord.js v14 | ESM | Square Cloud
// =====================================================

const AI_CHANNEL_ID = "1506520202576400404";

// Modelo recomendado custo/benefício.
// Se quiser trocar depois: "gpt-4.1-mini", "gpt-4o-mini", etc.
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

const COOLDOWN_MS = 10_000;
const MAX_USER_MESSAGE_CHARS = 1200;
const MAX_RESPONSE_CHARS = 1900;
const MAX_HISTORY_MESSAGES = 8;

const cooldowns = new Map();
const channelHistory = new Map();

let openai = null;

// =====================================================
// BASE DE CONHECIMENTO FIXA DA IA
// =====================================================

const SANTACREATORS_CONTEXT = `
Você é a IA oficial da SantaCreators.

CONTEXTO GERAL:
- SantaCreators é uma organização de RP/FiveM focada em eventos, creators, social mídia, gestão e organização interna.
- A IA conversa no Discord de forma natural, informal, útil e com vibe de comunidade.
- Ela deve ajudar com ideias, mensagens, organização, dúvidas simples, textos, anúncios, eventos, cronogramas e explicações.
- Ela NÃO deve fingir que executou ações no bot.
- Ela NÃO deve inventar regras internas se não tiver certeza.
- Se o assunto for cargo, punição, banimento, decisão administrativa, permissão, pagamento, VIP, aprovação/reprovação, ela deve orientar a chamar um responsável.

CIDADES/EVENTOS:
- Cidades usadas com frequência: Santa, Nobre, Grande, Maresia.
- Eventos podem envolver horários, equipes, anúncios, chamadas, missões, drogas, F3, armas brancas, arma de fogo e premiações.

ESTILO:
- Português do Brasil.
- Natural, informal e direto.
- Pode usar emoji com moderação.
- Não responder como robô.
- Não fazer textão sem necessidade.
- Se a pessoa pedir algo curto, responder curto.
- Se a pessoa pedir organização, deixar bonito e pronto para copiar.

SEGURANÇA:
- Não pedir token, chave, senha, API key ou dados sensíveis.
- Se alguém mandar chave/token, avisar para revogar.
- Não orientar burlar sistema, explorar falha, roubar conta ou prejudicar servidor.
`;

// =====================================================
// PROMPT PRINCIPAL
// =====================================================

function buildSystemPrompt() {
  return `
${SANTACREATORS_CONTEXT}

REGRAS DE RESPOSTA:
1. Responda como se estivesse conversando no chat da SantaCreators.
2. Seja útil e interativo.
3. Não diga que é "ChatGPT"; você é a IA da SantaCreators.
4. Se não souber algo interno, diga que não tem certeza e peça para confirmar com um responsável.
5. Nunca exponha IDs internos sem necessidade.
6. Não mande resposta gigante se a pergunta for simples.
7. Se pedirem anúncio/mensagem, entregue já pronto para copiar.
8. Se o usuário estiver brincando, pode brincar junto, mas sem perder o respeito.
9. Se a mensagem parecer spam, responda curto ou ignore.
10. Se perguntarem sobre sistemas do bot, explique de forma simples, mas não invente implementação que não foi fornecida.
`;
}

// =====================================================
// HELPERS
// =====================================================

function getOpenAIClient() {
  if (openai) return openai;

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.error("[IA CHAT AUTO] OPENAI_API_KEY não encontrada no process.env.");
    return null;
  }

  openai = new OpenAI({ apiKey });
  return openai;
}

function isQuotaError(err) {
  return (
    err?.status === 429 ||
    err?.code === "insufficient_quota" ||
    err?.type === "insufficient_quota" ||
    String(err?.message || "").toLowerCase().includes("quota")
  );
}

function isRateLimitError(err) {
  return (
    err?.status === 429 ||
    String(err?.message || "").toLowerCase().includes("rate limit")
  );
}

function cleanContent(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_USER_MESSAGE_CHARS);
}

function rememberMessage(channelId, authorName, content) {
  const history = channelHistory.get(channelId) || [];

  history.push({
    authorName,
    content: cleanContent(content),
    at: Date.now(),
  });

  while (history.length > MAX_HISTORY_MESSAGES) {
    history.shift();
  }

  channelHistory.set(channelId, history);
}

function getHistoryText(channelId) {
  const history = channelHistory.get(channelId) || [];

  if (!history.length) return "Sem histórico recente.";

  return history
    .map((item) => `${item.authorName}: ${item.content}`)
    .join("\n");
}

function shouldIgnoreMessage(message, client) {
  if (!message) return true;
  if (!message.guild) return true;
  if (message.channelId !== AI_CHANNEL_ID) return true;
  if (message.author?.bot) return true;
  if (message.webhookId) return true;

  const content = message.content?.trim();
  if (!content) return true;

  if (client?.user?.id && message.author?.id === client.user.id) return true;

  return false;
}

function getCooldownRemaining(userId) {
  const now = Date.now();
  const expiresAt = cooldowns.get(userId) || 0;

  if (now >= expiresAt) return 0;

  return expiresAt - now;
}

function setCooldown(userId) {
  cooldowns.set(userId, Date.now() + COOLDOWN_MS);
}

function limitDiscordText(text) {
  const finalText = String(text || "").trim();

  if (!finalText) return null;

  if (finalText.length <= MAX_RESPONSE_CHARS) {
    return finalText;
  }

  return `${finalText.slice(0, MAX_RESPONSE_CHARS - 20)}...`;
}

async function generateIaResponse({ message, content }) {
  const client = getOpenAIClient();

  if (!client) {
    return "Minha chave de IA não está configurada ainda. Chama o Macedo pra verificar a `OPENAI_API_KEY` na Square Cloud.";
  }

  const historyText = getHistoryText(message.channelId);

  const input = `
CONTEXTO DO CANAL:
${historyText}

MENSAGEM ATUAL:
Usuário: ${message.author.username}
ID do usuário: ${message.author.id}
Canal: ${message.channel?.name || message.channelId}
Mensagem: ${content}

Responda diretamente para esse usuário.
`;

  const response = await client.responses.create({
    model: OPENAI_MODEL,
    input: [
      {
        role: "system",
        content: buildSystemPrompt(),
      },
      {
        role: "user",
        content: input,
      },
    ],
    temperature: 0.8,
    max_output_tokens: 500,
  });

  return response.output_text;
}

// =====================================================
// SETUP PRINCIPAL
// =====================================================

export function setupIaChatAuto(client) {
  if (globalThis.__SC_IA_CHAT_AUTO_BOOTSTRAPPED__) {
    console.log("[IA CHAT AUTO] Bootstrap ignorado: módulo já iniciado.");
    return;
  }

  globalThis.__SC_IA_CHAT_AUTO_BOOTSTRAPPED__ = true;

  console.log("[IA CHAT AUTO] Módulo iniciado com sucesso.");
  console.log(`[IA CHAT AUTO] Canal ativo: ${AI_CHANNEL_ID}`);
  console.log(`[IA CHAT AUTO] Modelo configurado: ${OPENAI_MODEL}`);

  client.on("messageCreate", async (message) => {
    try {
      if (shouldIgnoreMessage(message, client)) return;

      const content = cleanContent(message.content);
      if (!content) return;

      rememberMessage(message.channelId, message.author.username, content);

      const remaining = getCooldownRemaining(message.author.id);

      if (remaining > 0) {
        const seconds = Math.ceil(remaining / 1000);

        if (seconds >= 8) {
          await message.reply({
            content: `Calma aí kkk espera ${seconds}s pra eu não travar respondendo todo mundo junto.`,
            allowedMentions: { repliedUser: true },
          }).catch(() => {});
        }

        return;
      }

      setCooldown(message.author.id);

      console.log(
        `[IA CHAT AUTO] Mensagem recebida | user=${message.author.tag} | id=${message.author.id} | content=${content}`
      );

      await message.channel.sendTyping().catch(() => {});

      const iaText = await generateIaResponse({ message, content });
      const finalResponse = limitDiscordText(iaText);

      if (!finalResponse) return;

      await message.reply({
        content: finalResponse,
        allowedMentions: {
          repliedUser: true,
          parse: [],
        },
      });

    } catch (err) {
      console.error("[IA CHAT AUTO] Erro ao gerar resposta:", err);

      if (isQuotaError(err)) {
        await message.reply({
          content:
            "Minha IA está configurada, mas a conta da API está sem crédito/limite agora. O Macedo precisa ativar billing/crédito da OpenAI API.",
          allowedMentions: { repliedUser: true },
        }).catch(() => {});
        return;
      }

      if (isRateLimitError(err)) {
        await message.reply({
          content:
            "Recebi muita mensagem de uma vez e a IA limitou por alguns segundos. Tenta de novo daqui a pouco.",
          allowedMentions: { repliedUser: true },
        }).catch(() => {});
        return;
      }

      await message.reply({
        content:
          "Deu um erro interno na IA agora, mas já registrei no console pra verificarem.",
        allowedMentions: { repliedUser: true },
      }).catch(() => {});
    }
  });
}