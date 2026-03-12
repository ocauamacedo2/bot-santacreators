import { EmbedBuilder, AuditLogEvent } from 'discord.js';

export function setupVoiceLog(client) {
  if (global.voiceStateRegistered) return;
  global.voiceStateRegistered = true;

  const recentMoves = new Map();

  client.on('voiceStateUpdate', async (oldState, newState) => {
    const user = newState.member?.user;
    if (!user) return;

    const logs = {
      joined: process.env.LOG_JOINED_ID,
      left: process.env.LOG_LEFT_ID,
      moved: process.env.LOG_MOVED_ID,
      muted: process.env.LOG_MUTED_ID,
      deafened: process.env.LOG_DEAFENED_ID,
      selfMuted: process.env.LOG_SELF_MUTED_ID,
      selfDeafened: process.env.LOG_SELF_DEAFENED_ID,
    };

    const changes = [];

    if (!oldState.channelId && newState.channelId) {
      changes.push({ log: logs.joined, text: `entrou na call <#${newState.channelId}>` });
    }

    if (oldState.channelId && !newState.channelId) {
      changes.push({ log: logs.left, text: `saiu da call <#${oldState.channelId}>` });
    }

    // Move logic
    if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
      const guild = newState.guild;
      const logChannelId = logs.moved;
      const logChannel = logChannelId ? await client.channels.fetch(logChannelId).catch(() => null) : null;
      if (logChannel) {
        const key = `${user.id}-${oldState.channelId}-${newState.channelId}`;
        const now = Date.now();

        if (!recentMoves.has(key) || now - recentMoves.get(key) >= 6000) {
          recentMoves.set(key, now);
          setTimeout(() => recentMoves.delete(key), 10000);

          let executor = null;
          try {
            await new Promise(res => setTimeout(res, 1000));
            const auditLogs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberMove, limit: 6 });
            const moveLog = auditLogs.entries.find(entry =>
              entry.target?.id === user.id && now - entry.createdTimestamp < 15000
            );
            if (moveLog?.executor) executor = moveLog.executor;
          } catch (error) {
            console.error('Erro ao buscar audit logs:', error);
          }

          const from = `<#${oldState.channelId}>`;
          const to = `<#${newState.channelId}>`;

          const embed = new EmbedBuilder()
            .setAuthor({ name: `${user.username} foi movido`, iconURL: user.displayAvatarURL() })
            .setDescription(`🔁 <@${user.id}> foi movido de ${from} para ${to}\n👤 Por: ${executor ? `<@${executor.id}>` : '*Desconhecido*'}`)
            .setColor(0x5865F2)
            .setTimestamp();

          if (executor?.username && executor?.displayAvatarURL) {
            embed.setFooter({ text: `Movido por ${executor.username}`, iconURL: executor.displayAvatarURL() });
          }
          logChannel.send({ embeds: [embed] }).catch(() => {});
        }
      }
    }

    // Mute/Deaf logic
    const checkAudit = async (type, isNew) => {
      try {
        const fetchedLogs = await newState.guild.fetchAuditLogs({ limit: 5, type: AuditLogEvent.MemberUpdate });
        const entry = fetchedLogs.entries.find(e =>
          e.target.id === newState.id &&
          e.changes?.some(c => c.key === type && c.new === isNew) &&
          Date.now() - e.createdTimestamp < 10000
        );
        return entry?.executor ? `<@${entry.executor.id}>` : 'Desconhecido';
      } catch { return 'Desconhecido'; }
    };

    if (!oldState.serverMute && newState.serverMute) {
      const by = await checkAudit('mute', true);
      changes.push({ log: logs.muted, text: `foi mutado na call <#${newState.channelId}> por ${by}` });
    }
    if (oldState.serverMute && !newState.serverMute) {
      const by = await checkAudit('mute', false);
      changes.push({ log: logs.muted, text: `foi desmutado na call <#${newState.channelId}> por ${by}` });
    }
    if (!oldState.serverDeaf && newState.serverDeaf) {
      const by = await checkAudit('deaf', true);
      changes.push({ log: logs.deafened, text: `foi ensurdecido na call <#${newState.channelId}> por ${by}` });
    }
    if (oldState.serverDeaf && !newState.serverDeaf) {
      const by = await checkAudit('deaf', false);
      changes.push({ log: logs.deafened, text: `foi dessensurdecido na call <#${newState.channelId}> por ${by}` });
    }

    if (!oldState.selfMute && newState.selfMute) changes.push({ log: logs.selfMuted, text: `se mutou na call <#${newState.channelId}>` });
    if (oldState.selfMute && !newState.selfMute) changes.push({ log: logs.selfMuted, text: `se desmutou na call <#${newState.channelId}>` });
    if (!oldState.selfDeaf && newState.selfDeaf) changes.push({ log: logs.selfDeafened, text: `se ensurdesceu na call <#${newState.channelId}>` });
    if (oldState.selfDeaf && !newState.selfDeaf) changes.push({ log: logs.selfDeafened, text: `se dessensurdesceu na call <#${newState.channelId}>` });

    for (const change of changes) {
      const logChannelId = change.log;
      const logChannel = logChannelId ? await client.channels.fetch(logChannelId).catch(() => null) : null;
      if (logChannel) {
        const embed = new EmbedBuilder()
          .setAuthor({ name: user.username, iconURL: user.displayAvatarURL({ dynamic: true }) })
          .setDescription(`🔊 <@${user.id}> ${change.text}.`)
          .setColor(0x00AEFF)
          .setTimestamp();
        logChannel.send({ embeds: [embed] }).catch(() => {});
      }
    }
  });
}
