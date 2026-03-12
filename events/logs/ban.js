import { EmbedBuilder, AuditLogEvent } from 'discord.js';

// ================== CONFIGURAÇÃO DE LOGS ==================
const MAIN_GUILD_ID = '1262262852782129183';

const CENTRAL_LOG_BAN_ID = process.env.LOG_BAN || '1377813917866397726'; // Canal central para bans
const CENTRAL_LOG_UNBAN_ID = process.env.LOG_UNBAN || '1377813917866397726'; // Canal central para unbans

// Mapeamento de Guild ID para Canal de Log Local
const LOCAL_LOG_CHANNELS = {
  '1262262852782129183': '1377813917866397726', // Principal (logs no próprio canal central)
  '1362899773992079533': '1363295055384809483', // Cidade Santa -> #sc-logs
  '1452416085751234733': '1455312395269443813', // Administração -> #sc-logs
};
// ==========================================================

const preBanCache = new Map();

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
      const logs = await guild.fetchAuditLogs({
        type: AuditLogEvent.MemberBanAdd,
        limit: 1
      });

      const entry = logs.entries.find(e =>
        e.target.id === user.id &&
        Date.now() - e.createdTimestamp < 15000
      );

      const executor = entry?.executor;
      const reason = entry?.reason || 'Sem motivo especificado';
      const roles = preBanCache.get(user.id)?.join(', ') || 'Não registrado';

      const embed = new EmbedBuilder()
        .setTitle('🔨 Usuário Banido')
        .setColor('Red')
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .setDescription(`
👤 **Banido:** <@${user.id}> (\`${user.tag}\`)
🛡️ **Por:** ${executor ? `<@${executor.id}>` : 'Desconhecido'}
📄 **Motivo:** \`${reason}\`
🎭 **Cargos antes do ban:** ${roles}
🕒 ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
`)
        .setFooter({
          text: `ID: ${user.id}`,
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
      console.error('[ERRO] Falha no log de ban:', err);
    }
  });

  client.on('guildBanRemove', async (ban) => {
    const { user, guild } = ban;

    try {
      const logs = await guild.fetchAuditLogs({
        type: AuditLogEvent.MemberBanRemove,
        limit: 1
      });

      const entry = logs.entries.find(e =>
        e.target.id === user.id &&
        Date.now() - e.createdTimestamp < 15000
      );

      const executor = entry?.executor;

      const embed = new EmbedBuilder()
        .setTitle('⚖️ Usuário Desbanido')
        .setColor('Green')
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .setDescription(`
👤 **Desbanido:** <@${user.id}> (\`${user.tag}\`)
🔓 **Por:** ${executor ? `<@${executor.id}>` : 'Desconhecido'}
🕒 ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
`)
        .setFooter({
          text: `ID: ${user.id}`,
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
