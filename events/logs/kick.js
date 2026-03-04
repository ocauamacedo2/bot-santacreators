import { EmbedBuilder, AuditLogEvent } from 'discord.js';

export function setupKickLog(client) {
  client.on('guildMemberRemove', async (member) => {
    try {
      const { guild } = member;
      await new Promise(res => setTimeout(res, 1500));

      const logs = await guild.fetchAuditLogs({
        type: AuditLogEvent.MemberKick,
        limit: 5
      });

      const entry = logs.entries.find(e =>
        e.target.id === member.id &&
        Date.now() - e.createdTimestamp < 15000
      );

      if (!entry) return;

      const executor = entry.executor;
      const reason = entry.reason || 'Sem motivo especificado';
      const roles = member.roles.cache
        .filter(r => r.id !== guild.id)
        .map(r => `<@&${r.id}>`)
        .join(', ') || 'Nenhum';

      const logChannel = client.channels.cache.get(process.env.LOG_KICK_DISCORD);
      if (!logChannel) return;

      const embed = new EmbedBuilder()
        .setTitle('👢 Usuário Expulso')
        .setColor('Orange')
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .setDescription(`
👤 **Expulso:** <@${member.id}> (\`${member.user.tag}\`)
🛡️ **Por:** ${executor ? `<@${executor.id}>` : 'Desconhecido'}
📄 **Motivo:** \`${reason}\`
🎭 **Cargos antes do kick:** ${roles}
🕒 ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
      `)
        .setFooter({
          text: `ID: ${member.id}`,
          iconURL: executor?.displayAvatarURL({ dynamic: true }) || undefined
        })
        .setTimestamp();

      await logChannel.send({ embeds: [embed] });
    } catch (err) {
      console.error('[ERRO] Falha ao registrar log de kick:', err);
    }
  });
}
