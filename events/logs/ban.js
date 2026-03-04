import { EmbedBuilder, AuditLogEvent } from 'discord.js';

const preBanCache = new Map();

export function setupBanLog(client) {
  client.on('guildMemberRemove', async (member) => {
    try {
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
    const logChannel = client.channels.cache.get(process.env.LOG_BAN);
    if (!logChannel) return;

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

      await logChannel.send({ embeds: [embed] });
    } catch (err) {
      console.error('[ERRO] Falha no log de ban:', err);
    }
  });

  client.on('guildBanRemove', async (ban) => {
    const { user, guild } = ban;
    const logChannel = client.channels.cache.get(process.env.LOG_UNBAN);
    if (!logChannel) return;

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

      await logChannel.send({ embeds: [embed] });
    } catch (err) {
      console.error('[ERRO] Falha no log de unban:', err);
    }
  });
}
