import { EmbedBuilder, AuditLogEvent } from 'discord.js';

// ================== CONFIGURAÇÃO DE LOGS ==================
const MAIN_GUILD_ID = '1262262852782129183';

const CENTRAL_LOG_BAN_ID = process.env.LOG_BAN || '1362540782829048170'; // Canal central para bans
const CENTRAL_LOG_UNBAN_ID = process.env.LOG_UNBAN || '1362540930300641490'; // Canal central para unbans

// Mapeamento de Guild ID para Canal de Log Local
const LOCAL_LOG_CHANNELS = {
  '1262262852782129183': '1362540782829048170', // Principal (logs no próprio canal central)
  '1362899773992079533': '1363295055384809483', // Cidade Santa -> #sc-logs
  '1452416085751234733': '1455312395269443813', // Administração -> #sc-logs
};
// ==========================================================

const preBanCache = new Map();

/**
 * Aguarda o tempo informado antes de realizar uma nova tentativa.
 */
function wait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

/**
 * Procura uma entrada específica no log de auditoria.
 *
 * O Discord pode disparar guildBanAdd ou guildBanRemove antes de a entrada
 * aparecer no log de auditoria. Por isso, a consulta é repetida algumas vezes.
 */
async function fetchBanAuditEntry(guild, auditLogType, userId) {
  const maximumAttempts = 5;
  const delayBetweenAttempts = 1200;
  const maximumEntryAge = 30000;

  for (let attempt = 1; attempt <= maximumAttempts; attempt++) {
    try {
      const logs = await guild.fetchAuditLogs({
        type: auditLogType,
        limit: 10
      });

      const entry = logs.entries.find(auditEntry =>
        auditEntry.target?.id === userId &&
        Date.now() - auditEntry.createdTimestamp < maximumEntryAge
      );

      if (entry) {
        return entry;
      }
    } catch (error) {
      console.warn(
        `[AUDITORIA] Tentativa ${attempt}/${maximumAttempts} falhou no servidor ${guild.id}:`,
        error
      );
    }

    if (attempt < maximumAttempts) {
      await wait(delayBetweenAttempts);
    }
  }

  return null;
}

/**
 * Separa o ID do solicitante e o motivo verdadeiro.
 *
 * Formato interno utilizado pelo comando:
 * [SOLICITANTE:ID_DO_USUARIO] motivo informado
 */
function parseBanReason(rawReason) {
  const defaultReason = 'Sem motivo especificado';

  if (!rawReason || typeof rawReason !== 'string') {
    return {
      requesterId: null,
      reason: defaultReason
    };
  }

  const requesterMatch = rawReason.match(/^\[SOLICITANTE:(\d{17,20})\]\s*/);

  if (!requesterMatch) {
    return {
      requesterId: null,
      reason: rawReason.trim() || defaultReason
    };
  }

  const requesterId = requesterMatch[1];
  const cleanReason = rawReason
    .replace(requesterMatch[0], '')
    .trim();

  return {
    requesterId,
    reason: cleanReason || defaultReason
  };
}

export function setupBanLog(client) {
  client.on('guildMemberRemove', async (member) => {
    try {
      // Otimização: só guarda cache se o servidor tiver log configurado
      if (!LOCAL_LOG_CHANNELS[member.guild.id]) return;

      const roles = member.roles.cache
        .filter(r => r.id !== member.guild.id)
        .map(r => `<@&${r.id}>`);

      if (roles.length > 0) {
        preBanCache.set(member.id, roles);
        setTimeout(() => preBanCache.delete(member.id), 10 * 60 * 1000);
      }
    } catch (err) {
      console.warn('[CACHE] Erro ao armazenar cargos antes do ban:', err);
    }
  });

  client.on('guildBanAdd', async (ban) => {
    const { user, guild } = ban;

    try {
      const entry = await fetchBanAuditEntry(
        guild,
        AuditLogEvent.MemberBanAdd,
        user.id
      );

      const executor = entry?.executor || null;

      /*
       * Primeiro tenta usar o motivo do log de auditoria.
       * Caso ele ainda não esteja disponível, utiliza o motivo presente
       * no próprio objeto GuildBan.
       */
      const rawReason =
        entry?.reason ||
        ban.reason ||
        'Sem motivo especificado';

      const parsedReason = parseBanReason(rawReason);
      const requesterId = parsedReason.requesterId;
      const reason = parsedReason.reason;

      const roles = preBanCache.get(user.id)?.join(', ') || 'Não registrado';

      let executionOrigin;

      if (!executor) {
        executionOrigin =
          '❓ Não identificada — entrada não localizada no log de auditoria';
      } else if (executor.bot) {
        executionOrigin = '🤖 Bot/Integração';
      } else {
        executionOrigin = '👤 Ação manual';
      }

      let requesterText;

      if (requesterId) {
        requesterText = `<@${requesterId}> (\`${requesterId}\`)`;
      } else if (executor && !executor.bot) {
        requesterText = 'O próprio executor';
      } else if (executor?.bot) {
        requesterText =
          'Não informado pelo bot que realizou o banimento';
      } else {
        requesterText =
          'Não foi possível identificar pelo log de auditoria';
      }

      const executorText = executor
        ? `<@${executor.id}> (\`${executor.tag}\` | \`${executor.id}\`)`
        : 'Não localizado no log de auditoria';

      const embed = new EmbedBuilder()
        .setTitle('🔨 Usuário Banido')
        .setColor('Red')
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .setDescription(`
👤 **Banido:** <@${user.id}> (\`${user.tag}\` | \`${user.id}\`)
🛡️ **Executado por:** ${executorText}
🧭 **Origem:** ${executionOrigin}
👮 **Solicitado por:** ${requesterText}
📄 **Motivo:** \`${reason}\`
🎭 **Cargos antes do ban:** ${roles}
🏙️ **Servidor:** ${guild.name} (\`${guild.id}\`)
🕒 ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
`)
        .setFooter({
          text: `ID do usuário banido: ${user.id}`,
          iconURL: executor?.displayAvatarURL({ dynamic: true }) || undefined
        })
        .setTimestamp();

      const localLogChannelId = LOCAL_LOG_CHANNELS[guild.id];
      if (localLogChannelId) {
        const localLogChannel = await client.channels.fetch(localLogChannelId).catch(() => null);

        if (localLogChannel?.isTextBased()) {
          const localEmbed = new EmbedBuilder(embed.toJSON()).setFooter(null);
          await localLogChannel.send({ embeds: [localEmbed] }).catch(console.error);
        }
      }

      preBanCache.delete(user.id);
    } catch (err) {
      console.error('[ERRO] Falha no log de ban:', err);
    }
  });

  client.on('guildBanRemove', async (ban) => {
    const { user, guild } = ban;
    const isMainGuild = guild.id === MAIN_GUILD_ID;

    try {
      const entry = await fetchBanAuditEntry(
        guild,
        AuditLogEvent.MemberBanRemove,
        user.id
      );

      const executor = entry?.executor || null;

      let executionOrigin;

      if (!executor) {
        executionOrigin =
          '❓ Não identificada — entrada não localizada no log de auditoria';
      } else if (executor.bot) {
        executionOrigin = '🤖 Bot/Integração';
      } else {
        executionOrigin = '👤 Ação manual';
      }

      const executorText = executor
        ? `<@${executor.id}> (\`${executor.tag}\` | \`${executor.id}\`)`
        : 'Não localizado no log de auditoria';

      const embed = new EmbedBuilder()
        .setTitle('⚖️ Usuário Desbanido')
        .setColor('Green')
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .setDescription(`
👤 **Desbanido:** <@${user.id}> (\`${user.tag}\` | \`${user.id}\`)
🔓 **Executado por:** ${executorText}
🧭 **Origem:** ${executionOrigin}
🏙️ **Servidor:** ${guild.name} (\`${guild.id}\`)
🕒 ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
`)
        .setFooter({
          text: `ID do usuário desbanido: ${user.id}`,
          iconURL: executor?.displayAvatarURL({ dynamic: true }) || undefined
        })
        .setTimestamp();

      const localLogChannelId = LOCAL_LOG_CHANNELS[guild.id];
      if (localLogChannelId) {
        const localLogChannel = await client.channels.fetch(localLogChannelId).catch(() => null);

        if (localLogChannel?.isTextBased()) {
          const localEmbed = new EmbedBuilder(embed.toJSON()).setFooter(null);
          await localLogChannel.send({ embeds: [localEmbed] }).catch(console.error);
        }
      }
    } catch (err) {
      console.error('[ERRO] Falha no log de unban:', err);
    }
  });
}