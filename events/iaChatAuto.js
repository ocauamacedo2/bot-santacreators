// d:\santacreators-main\events\iaChatAuto.js
import { GoogleGenerativeAI } from "@google/generative-ai";

// =====================================================
// IA CHAT AUTO — SANTACREATORS
// Discord.js v14 | ESM | Square Cloud | Gemini API
// =====================================================

const AI_CHANNEL_ID = "1506520202576400404";

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";

const COOLDOWN_MS = 30_000;
const MAX_USER_MESSAGE_CHARS = 250;
const MAX_RESPONSE_CHARS = 1900;
const MAX_HISTORY_MESSAGES = 2;

const cooldowns = new Map();
const channelHistory = new Map();

let gemini = null;

// =====================================================
// BASE DE CONHECIMENTO FIXA
// =====================================================

const SANTACREATORS_CONTEXT = `
Você é a IA oficial da SantaCreators.

CONTEXTO GERAL:
- SantaCreators é uma organização de RP/FiveM focada em eventos, creators, social mídia, gestão e organização interna.
- Você conversa no Discord de forma natural, informal, útil e com vibe de comunidade.
- Você ajuda com ideias, mensagens, organização, dúvidas simples, textos, anúncios, eventos, cronogramas e explicações.
- Você NÃO finge que executou ações no bot.
- Você NÃO inventa regras internas se não tiver certeza.
- Se o assunto for cargo, punição, banimento, decisão administrativa, permissão, pagamento, VIP, aprovação/reprovação, oriente a chamar um responsável.

CIDADES/EVENTOS:
- Cidades usadas com frequência: Santa, Nobre, Grande, Maresia.
- Eventos podem envolver horários, equipes, anúncios, chamadas, missões, drogas, F3, armas brancas, arma de fogo e premiações.

ESTILO:
- Português do Brasil.
- Natural, informal e direto.
- Pode usar emoji com moderação.
- Não responder como robô.
- Não fazer textão sem necessidade.
- Se a pessoa pedir algo curto, responda curto.
- Se a pessoa pedir organização, deixe bonito e pronto para copiar.

SEGURANÇA:
- Não peça token, chave, senha, API key ou dados sensíveis.
- Se alguém mandar chave/token, avise para revogar.
- Não oriente burlar sistema, explorar falha, roubar conta ou prejudicar servidor.
`;

function buildPrompt({ message, content }) {
  const historyText = getHistoryText(message.channelId);

  return `
${SANTACREATORS_CONTEXT}

REGRAS DE RESPOSTA:
1. Responda como se estivesse conversando no chat da SantaCreators.
2. Seja útil e interativo.
3. Não diga que é ChatGPT/Gemini; você é a IA da SantaCreators.
4. Se não souber algo interno, diga que não tem certeza e peça para confirmar com um responsável.
5. Nunca exponha IDs internos sem necessidade.
6. Não mande resposta gigante se a pergunta for simples.
7. Se pedirem anúncio/mensagem, entregue já pronto para copiar.
8. Se o usuário estiver brincando, pode brincar junto, mas sem perder o respeito.
9. Se a mensagem parecer spam, responda curto ou ignore.
10. Se perguntarem sobre sistemas do bot, explique simples, mas não invente implementação não fornecida.

HISTÓRICO RECENTE DO CANAL:
${historyText}

MENSAGEM ATUAL:
Usuário: ${message.author.username}
ID do usuário: ${message.author.id}
Canal: ${message.channel?.name || message.channelId}
Mensagem: ${content}

Responda diretamente para esse usuário.
`;
}

// =====================================================
// GEMINI CLIENT
// =====================================================

function getGeminiClient() {
  if (gemini) return gemini;

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error("[IA CHAT AUTO] GEMINI_API_KEY não encontrada no process.env.");
    return null;
  }

  gemini = new GoogleGenerativeAI(apiKey);
  return gemini;
}

// =====================================================
// HELPERS
// =====================================================

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

function isGeminiQuotaError(err) {
  const text = String(err?.message || err || "").toLowerCase();

  return (
    text.includes("quota") ||
    text.includes("rate limit") ||
    text.includes("resource_exhausted") ||
    text.includes("429")
  );
}

function isGeminiKeyError(err) {
  const text = String(err?.message || err || "").toLowerCase();

  return (
    text.includes("api key") ||
    text.includes("apikey") ||
    text.includes("permission") ||
    text.includes("unauthorized") ||
    text.includes("403") ||
    text.includes("401")
  );
}

async function generateIaResponse({ message, content }) {
  const genAI = getGeminiClient();

  if (!genAI) {
    return "Minha chave do Gemini ainda não está configurada. O Macedo precisa colocar `GEMINI_API_KEY` nas variáveis da Square Cloud e reiniciar o bot.";
  }

  const model = genAI.getGenerativeModel({ 
    model: GEMINI_MODEL,
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: 500,
    }
  });

  const prompt = buildPrompt({ message, content });
  const result = await model.generateContent(prompt);
  const response = await result.response;
  return response.text();
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

  console.log("[IA CHAT AUTO] Módulo iniciado com sucesso usando Gemini.");
  console.log(`[IA CHAT AUTO] Canal ativo: ${AI_CHANNEL_ID}`);
  console.log(`[IA CHAT AUTO] Modelo configurado: ${GEMINI_MODEL}`);

  client.on("messageCreate", async (message) => {
    try {
      if (shouldIgnoreMessage(message, client)) return;

      const content = cleanContent(message.content);
if (!content) return;

// Evita gastar IA com mensagens muito curtas tipo "oi", "kk", "eae"
if (content.length < 8 && !content.includes("?")) return;

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
      console.error("[IA CHAT AUTO] Erro ao gerar resposta Gemini:", err);

      if (isGeminiQuotaError(err)) {
        await message.reply({
          content:
            "A IA do Gemini bateu limite/cota agora. Espera um pouco ou verifica a cota da API Key no Google AI Studio.",
          allowedMentions: { repliedUser: true },
        }).catch(() => {});
        return;
      }

      if (isGeminiKeyError(err)) {
        await message.reply({
          content:
            "A chave do Gemini parece inválida, sem permissão ou não configurada direito. Verifica a variável `GEMINI_API_KEY` na Square Cloud.",
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