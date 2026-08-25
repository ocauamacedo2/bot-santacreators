// d:\santacreators-main\events\chatCleaner.js
import {
  EmbedBuilder,
  PermissionsBitField,
} from "discord.js";

// IDs de Configuração

const MONITOR_CHANNEL_ID = "1381597720007151698"; // Canal que o bot observa

const LOG_REDIRECT_CHANNEL_ID = "1370512999298891806"; // Canal onde as marcações são logadas

const CORRECT_CHAT_CHANNEL_ID = "1370512999298891806"; // Canal correto para redirecionamento

// =====================================================
// USUÁRIOS ISENTOS DO CHAT CLEANER
// =====================================================

const CHAT_CLEANER_BYPASS_USER_IDS = new Set([
  "660311795327828008", // MAcedo
]);

// =====================================================
// CARGOS ISENTOS DO CHAT CLEANER
// =====================================================

const CHAT_CLEANER_BYPASS_ROLE_IDS = new Set([
  "1262262852949905408", // Owner
  "1352408327983861844", // Resp. Creators
]);

// =====================================================
// VERIFICA SE O USUÁRIO DEVE SER IGNORADO
// =====================================================

function isChatCleanerExempt(member) {
  if (!member) {
    return false;
  }

  // Rodney
  if (
    CHAT_CLEANER_BYPASS_USER_IDS.has(
      member.id
    )
  ) {
    return true;
  }

  // Owner + Resp. Creators
  if (
    member.roles?.cache?.some(
      (role) =>
        CHAT_CLEANER_BYPASS_ROLE_IDS.has(
          role.id
        )
    )
  ) {
    return true;
  }

  // Qualquer cargo com Administrator
  if (
    member.roles?.cache?.some(
      (role) =>
        role.permissions?.has(
          PermissionsBitField.Flags.Administrator
        )
    )
  ) {
    return true;
  }

  // Permissão efetiva Administrator
  if (
    member.permissions?.has(
      PermissionsBitField.Flags.Administrator
    )
  ) {
    return true;
  }

  return false;
}

/**
 * Lógica de limpeza humanizada para o canal de IA
 */
export async function chatCleanerHandleMessage(message, client) {
  if (message.author.bot || !message.guild) return false;
  if (message.channelId !== MONITOR_CHANNEL_ID) return false;

  // ===================================================
  // BYPASS COMPLETO
  // ===================================================
  //
  // Rodney, Owner, Resp. Creators e Administrator
  // não são afetados pelo Chat Cleaner.
  //
  // O bot:
  // • não responde
  // • não apaga
  // • não redireciona
  // • não gera log dessa limpeza
  // ===================================================

  if (
    isChatCleanerExempt(
      message.member
    )
  ) {
    return false;
  }

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
  const onlyMentionsRegex = /^(<@!?\d+>|<@&\d+>|\s)+$/;
  if ((message.mentions.users.size > 0 || message.mentions.roles.size > 0) && onlyMentionsRegex.test(content)) {
    // Resposta humana imediata
    const reply = await message.reply({
      content: `Fala <@${userId}>! Vi que você marcou o pessoal aí, mas aqui não é o chat ideal pra isso não... tenta no <#${CORRECT_CHAT_CHANNEL_ID}>! Vou limpar sua mensagem daqui em 30 segundinhos. 💜`,
      allowedMentions: { users: [userId] }
    }).catch(() => null);

    // Redireciona para o canal de auditoria/log
    const logChannel = await client.channels.fetch(LOG_REDIRECT_CHANNEL_ID).catch(() => null);
    if (logChannel?.isTextBased()) {
      // Coleta todas as menções de usuários e cargos
      const userTargets = message.mentions.users.map(u => `<@${u.id}>`);
      const roleTargets = message.mentions.roles.map(r => `<@&${r.id}>`);
      const allTargets = [...userTargets, ...roleTargets].join(', ');

      await logChannel.send({
        content: `⚠️ **Marcação em local incorreto**\nO usuário <@${userId}> marcou ${allTargets || "alguém"} no canal <#${message.channelId}>.`
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
