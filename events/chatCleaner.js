// d:\santacreators-main\events\chatCleaner.js
import { EmbedBuilder } from "discord.js";

// IDs de Configuração
const MONITOR_CHANNEL_ID = "1381597720007151698"; // Canal que o bot observa
const LOG_REDIRECT_CHANNEL_ID = "1370512999298891806"; // Canal onde as marcações são logadas
const CORRECT_CHAT_CHANNEL_ID = "1506520202576400404"; // Canal "ideal" ( SantaCreators IA )

/**
 * Lógica de limpeza humanizada para o canal de IA
 */
export async function chatCleanerHandleMessage(message, client) {
  if (message.author.bot || !message.guild) return false;
  if (message.channelId !== MONITOR_CHANNEL_ID) return false;

  const content = message.content.trim();
  const userId = message.author.id;

  // 1. Caso seja APENAS um ponto "."
  if (content === ".") {
    // Resposta humana imediata
    const reply = await message.reply({
      content: `Opa <@${userId}>! Vi seu ponto aqui, mas o canal certo pra isso é o <#${CORRECT_CHAT_CHANNEL_ID}> kkkk. Já já eu apago o seu aqui pra deixar o chat limpinho, fechado? 😉`,
      allowedMentions: { users: [userId] }
    }).catch(() => null);

    // Apaga a mensagem original em 30 segundos
    setTimeout(() => {
      message.delete().catch(() => {});
    }, 30000);

    // Apaga a resposta do bot em 1 minuto
    if (reply) {
      setTimeout(() => {
        reply.delete().catch(() => {});
      }, 60000);
    }
    return true;
  }

  // 2. Caso seja APENAS menção(ões) sem texto nenhum
  // Regex: verifica se o texto contém apenas uma ou mais menções e espaços
  const onlyMentionsRegex = /^(<@!?\d+>|\s)+$/;
  if (message.mentions.users.size > 0 && onlyMentionsRegex.test(content)) {
    // Resposta humana imediata
    const reply = await message.reply({
      content: `Fala <@${userId}>! Vi que você marcou o pessoal aí, mas aqui não é o chat ideal pra isso não... tenta no <#${CORRECT_CHAT_CHANNEL_ID}>! Vou limpar sua mensagem daqui em 30 segundinhos. 💜`,
      allowedMentions: { users: [userId] }
    }).catch(() => null);

    // Redireciona para o canal de auditoria/log
    const logChannel = await client.channels.fetch(LOG_REDIRECT_CHANNEL_ID).catch(() => null);
    if (logChannel?.isTextBased()) {
      const targets = message.mentions.users.map(u => `<@${u.id}>`).join(', ');
      await logChannel.send({
        content: `⚠️ **Marcação em local incorreto**\nO usuário <@${userId}> marcou ${targets} no canal <#${message.channelId}>.`
      }).catch(() => {});
    }

    // Apaga a mensagem original em 30 segundos
    setTimeout(() => {
      message.delete().catch(() => {});
    }, 30000);

    // Apaga a resposta do bot em 1 minuto
    if (reply) {
      setTimeout(() => {
        reply.delete().catch(() => {});
      }, 60000);
    }
    return true;
  }

  return false;
}
