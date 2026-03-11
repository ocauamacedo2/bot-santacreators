import { EmbedBuilder, AuditLogEvent } from 'discord.js';

// ================== CONFIGURAÇÃO DE LOGS ==================
const MAIN_GUILD_ID = '1262262852782129183';
const CENTRAL_LOG_KICK_ID = process.env.LOG_KICK_DISCORD || '1377813917866397726'; // Canal central para kicks

// Mapeamento de Guild ID para Canal de Log Local
const LOCAL_LOG_CHANNELS = {
  '1262262852782129183': '1377813917866397726', // Principal (logs no próprio canal central)
  '1362899773992079533': '1363295055384809483', // Cidade Santa -> #sc-logs
  '1452416085751234733': '1455312395269443813', // Administração -> #sc-logs
};
// ==========================================================

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
      const isMainGuild = guild.id === MAIN_GUILD_ID;

      const executor = entry.executor;
      const reason = entry.reason || 'Sem motivo especificado';
      const roles = member.roles.cache
        .filter(r => r.id !== guild.id)
        .map(r => `<@&${r.id}>`)
        .join(', ') || 'Nenhum';

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

      // --- DUAL LOG ---
      const localLogChannelId = LOCAL_LOG_CHANNELS[guild.id];
      if (localLogChannelId) {
        const localLogChannel = await client.channels.fetch(localLogChannelId).catch(() => null);
        if (localLogChannel?.isTextBased()) {
          const localEmbed = new EmbedBuilder(embed.toJSON()).setFooter({ text: `Servidor: ${guild.name} • ${guild.id}` });
          await localLogChannel.send({ embeds: [localEmbed] }).catch(console.error);
        }
      }

      if (!isMainGuild) {
        const centralLogChannel = await client.channels.fetch(CENTRAL_LOG_KICK_ID).catch(() => null);
        if (centralLogChannel?.isTextBased()) {
          const centralEmbed = new EmbedBuilder(embed.toJSON()).setFooter({ text: `Origem: ${guild.name} • ${guild.id}` });
          await centralLogChannel.send({ embeds: [centralEmbed] }).catch(console.error);
        }
      } else if (isMainGuild && !localLogChannelId) {
          const centralLogChannel = await client.channels.fetch(CENTRAL_LOG_KICK_ID).catch(() => null);
          if (centralLogChannel) await centralLogChannel.send({ embeds: [embed.setFooter({ text: `Servidor: ${guild.name} • ${guild.id}` })] }).catch(console.error);
      }
    } catch (err) {
      console.error('[ERRO] Falha ao registrar log de kick:', err);
    }
  });
}
