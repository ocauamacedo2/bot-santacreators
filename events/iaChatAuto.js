// d:\santacreators-main\events\iaChatAuto.js
import { OpenAI } from "openai";
import { EmbedBuilder, PermissionFlagsBits } from "discord.js";

// =====================================================
// CONFIGURAÇÃO DA IA
// =====================================================
const AI_CHANNEL_ID = "1506520202576400404";
const COOLDOWN_MS = 10000; // 10 segundos
const cooldowns = new Map();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Personalidade e Contexto da IA
 */
const SYSTEM_PROMPT = `
Você é a inteligência artificial oficial da SantaCreators, uma organização de Roleplay de alto nível.
Responda em Português do Brasil de forma natural, informal e prestativa. Use gírias leves de Discord/RP quando apropriado, mas mantenha o profissionalismo.
Seu objetivo é interagir, tirar dúvidas, dar ideias e conversar com os membros.

REGRAS CRÍTICAS:
1. Nunca invente regras internas da SantaCreators se não tiver certeza.
2. Se alguém perguntar sobre permissões, cargos, banimentos ou decisões administrativas sensíveis, responda educadamente para que a pessoa entre em contato com um "Responsável" (Coordenação ou Owner).
3. Seja conciso. Evite textos gigantescos a menos que seja necessário.
4. Responda diretamente ao que foi perguntado.
`;

// =====================================================
// SETUP DO MÓDULO
// =====================================================
export function setupIaChatAuto(client) {
  // Proteção contra bootstrap duplicado
  if (globalThis.__SC_IA_CHAT_AUTO_BOOTSTRAPPED__) return;
  globalThis.__SC_IA_CHAT_AUTO_BOOTSTRAPPED__ = true;

  console.log("[IA CHAT AUTO] Módulo iniciado com sucesso.");

  client.on("messageCreate", async (message) => {
    try {
      // Validações básicas
      if (!message.guild || message.author.bot || message.channelId !== AI_CHANNEL_ID) return;
      
      const content = message.content?.trim();
      if (!content) return;

      // Proteção contra resposta infinita (ignora se começar com menção ao bot)
      if (message.mentions.has(client.user) && content.startsWith('<@')) return;

      // Cooldown por usuário
      const now = Date.now();
      const userCooldown = cooldowns.get(message.author.id) || 0;
      if (now < userCooldown) {
        // Opcional: Avisar sobre o cooldown apenas se for muito frequente
        return; 
      }
      cooldowns.set(message.author.id, now + COOLDOWN_MS);

      console.log(`[IA CHAT AUTO] Pergunta recebida de ${message.author.tag}: ${content}`);

      // Feedback visual de digitação
      await message.channel.sendTyping();

      // Chamada para a API da OpenAI
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo", // Ou "gpt-4" se preferir
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { 
            role: "user", 
            content: `Usuário: ${message.author.username} (ID: ${message.author.id})\nCanal: ${message.channel.name}\nMensagem: ${content}` 
          }
        ],
        max_tokens: 500,
        temperature: 0.8,
      });

      const response = completion.choices[0]?.message?.content;

      if (!response) return;

      // Limita o tamanho para o Discord (2000 chars)
      const finalResponse = response.length > 2000 ? response.slice(0, 1990) + "..." : response;

      // Responde com Reply
      await message.reply({
        content: finalResponse,
        allowedMentions: { repliedUser: true }
      });

    } catch (err) {
      console.error("[IA CHAT AUTO] Erro ao gerar resposta:", err);
      // Failsafe: não envia mensagem de erro no chat para não poluir, apenas loga no console.
    }
  });
}
