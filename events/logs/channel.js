import { EmbedBuilder, AuditLogEvent, ChannelType } from 'discord.js';

export function setupChannelLog(client) {
  // Log de permissões
  client.on('channelUpdate', async (oldChannel, newChannel) => {
    const logChannel = client.channels.cache.get(process.env.LOG_CHANNEL_PERMISSIONS);
    if (!logChannel) return;

    try {
      const logs = await newChannel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelOverwriteUpdate, limit: 5 });
      const logEntry = logs.entries.find(entry => entry.target.id === newChannel.id && Date.now() - entry.createdTimestamp < 15000);
      if (!logEntry || !logEntry.executor) return;

      const executor = logEntry.executor;
      const oldOverwrites = oldChannel.permissionOverwrites.cache;
      const newOverwrites = newChannel.permissionOverwrites.cache;
      const allIds = new Set([...oldOverwrites.keys(), ...newOverwrites.keys()]);

      let changesReport = '';
      const traducoesPerms = {
        ViewChannel: 'Ver Canal', SendMessages: 'Enviar Mensagens', Connect: 'Conectar (Voz)', Speak: 'Falar (Voz)',
        ManageMessages: 'Gerenciar Mensagens', ManageRoles: 'Gerenciar Cargos', ManageChannels: 'Gerenciar Canais',
        Administrator: 'Administrador', MoveMembers: 'Mover (Voz)', MuteMembers: 'Mutar (Voz)'
      };

      for (const id of allIds) {
        const oldPerms = oldOverwrites.get(id);
        const newPerms = newOverwrites.get(id);
        const role = newChannel.guild.roles.cache.get(id);
        const member = newChannel.guild.members.cache.get(id);
        const alvo = role ? `<@&${role.id}>` : member ? `<@${member.id}>` : `ID: \`${id}\``;
        const changedPerms = [];

        for (const perm of Object.keys(traducoesPerms)) {
          const before = oldPerms?.allow.has(perm) ? 'permitido' : oldPerms?.deny.has(perm) ? 'negado' : 'nenhuma';
          const after = newPerms?.allow.has(perm) ? 'permitido' : newPerms?.deny.has(perm) ? 'negado' : 'nenhuma';
          if (before !== after) {
            const nomeTraduzido = traducoesPerms[perm] || perm;
            let simbolo = after === 'permitido' ? '✅' : after === 'negado' ? '❌' : '🚫';
            changedPerms.push(`🔧 **${nomeTraduzido}**:\n${simbolo} Agora: **${after}**\n📤 Antes: ${before}`);
          }
        }
        if (changedPerms.length) changesReport += `👥 Permissões alteradas para ${alvo}\n${changedPerms.join('\n')}\n\n`;
      }

      if (!changesReport) return;

      const embed = new EmbedBuilder()
        .setTitle('⚙️ Permissões Atualizadas')
        .setColor('Orange')
        .setThumbnail(executor.displayAvatarURL({ dynamic: true, size: 512 }))
        .addFields(
          { name: '📌 Canal', value: `<#${newChannel.id}> (\`${newChannel.name}\`)` },
          { name: '🛠️ Alterado por', value: `<@${executor.id}> \`${executor.tag}\`` }
        )
        .setDescription(changesReport)
        .setFooter({ text: `Alterado por ${executor.tag}`, iconURL: executor.displayAvatarURL({ dynamic: true }) })
        .setTimestamp();

      await logChannel.send({ embeds: [embed] });
    } catch (err) {
      console.error('Erro ao logar update de canal:', err);
    }
  });

  // Log de status de voz
  client.on('channelUpdate', async (oldChannel, newChannel) => {
    if (oldChannel.type !== ChannelType.GuildVoice) return;
    const fetchedLogs = await newChannel.guild.fetchAuditLogs({ limit: 5, type: AuditLogEvent.ChannelUpdate });
    const entry = fetchedLogs.entries.find(log => log.target.id === newChannel.id && Date.now() - log.createdTimestamp < 15_000);
    if (!entry) return;

    const { executor } = entry;
    const embed = new EmbedBuilder()
      .setTitle('📌 Status do Canal de Voz Atualizado')
      .setDescription(`**${executor}** definiu um novo status no canal de voz **${newChannel.name}**.`)
      .addFields(
        { name: '👤 Executor', value: `${executor} (\`${executor.id}\`)`, inline: false },
        { name: '🕒 Horário', value: `<t:${Math.floor(entry.createdTimestamp / 1000)}:F>`, inline: false }
      )
      .setFooter({ text: `ID do Canal: ${newChannel.id}` })
      .setColor('Purple')
      .setTimestamp();

    const canalLog = await client.channels.fetch('1377698974512844870').catch(() => null);
    if (canalLog) canalLog.send({ embeds: [embed] });
  });

  // Proteção de canal deletado
  client.on('channelDelete', async (channel) => {
    try {
      const fetchedLogs = await channel.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.ChannelDelete });
      const deletionLog = fetchedLogs.entries.first();
      if (!deletionLog) return;

      const { executor } = deletionLog;
      if (!executor || executor.bot) return;

      const member = await channel.guild.members.fetch(executor.id).catch(() => null);
      if (!member) return;

      const OWNER_ID = '1262262852949905408';
      const ADMIN_ID = '1352741003639132160';
      const CIDADAO_ROLE_ID = '1262978759922028575';
      const categoriaBackupId = '1389857472906530866';
      const logChannelId = '1389857160871280650';
      const logChannel = await channel.guild.channels.fetch(logChannelId).catch(() => null);
      const botMember = await channel.guild.members.fetchMe();

      if (member.roles.cache.has(OWNER_ID) || member.roles.cache.has(ADMIN_ID)) return;

      if (!botMember.permissions.has('ManageRoles') || botMember.roles.highest.comparePositionTo(member.roles.highest) <= 0) {
        if (logChannel) logChannel.send({ content: `⚠️ <@&${OWNER_ID}> <@&${ADMIN_ID}> — O bot tentou punir **${member.user.tag}**, mas **não tem cargo suficiente**.` });
        return;
      }

      const rolesToRemove = member.roles.cache.filter(role => role.id !== CIDADAO_ROLE_ID && role.name !== 'Server Booster' && role.editable);
      try {
        await member.roles.remove(rolesToRemove);
        if (!member.roles.cache.has(CIDADAO_ROLE_ID)) await member.roles.add(CIDADAO_ROLE_ID);
      } catch (err) {
        if (logChannel) logChannel.send({ content: `⚠️ Erro ao punir **${member.user.tag}**: \`${err.message}\`` });
      }

      await member.send({ content: `🚫 | **Você deletou um canal sem permissão.**\nSeus cargos foram removidos.` }).catch(() => {});

      let newChannel = null;
      const categoriaBackup = await channel.guild.channels.fetch(categoriaBackupId).catch(async () => {
        return await channel.guild.channels.create({ name: '📂 Apagados Salvos', type: ChannelType.GuildCategory });
      });

      if (channel.type !== ChannelType.GuildCategory) {
        newChannel = await channel.guild.channels.create({
          name: `🔒-${channel.name}-restaurado`, type: channel.type, topic: channel.topic, nsfw: channel.nsfw,
          rateLimitPerUser: channel.rateLimitPerUser, parent: categoriaBackup.id,
          permissionOverwrites: channel.permissionOverwrites.cache.map(o => ({ id: o.id, allow: o.allow.bitfield, deny: o.deny.bitfield, type: o.type }))
        });
        await newChannel.send({ content: `🔧 **Canal restaurado.** Deletado por **${executor.tag}**.` }).then(m => m.pin());
      } else {
        newChannel = await channel.guild.channels.create({
          name: `🔒-${channel.name}-restaurada`, type: ChannelType.GuildCategory,
          permissionOverwrites: channel.permissionOverwrites.cache.map(o => ({ id: o.id, allow: o.allow.bitfield, deny: o.deny.bitfield, type: o.type }))
        });
      }

      if (logChannel) {
        const embed = new EmbedBuilder()
          .setTitle('🚨 Canal Deletado e Restaurado')
          .setColor('Red')
          .addFields(
            { name: '🧑 Executor', value: `${executor.tag} (<@${executor.id}>)`, inline: true },
            { name: '📁 Deletado', value: `\`${channel.name}\``, inline: true },
            { name: '📦 Restaurado como', value: `<#${newChannel.id}>`, inline: true },
            { name: '🔒 Ação', value: `Cargos removidos.` }
          )
          .setTimestamp();
        logChannel.send({ content: `<@&${OWNER_ID}> <@&${ADMIN_ID}>`, embeds: [embed] });
      }
    } catch (err) {
      console.error('Erro ao processar canal deletado:', err);
    }
  });
}
