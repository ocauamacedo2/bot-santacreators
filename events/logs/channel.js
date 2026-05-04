import {
  EmbedBuilder,
  AuditLogEvent,
  ChannelType,
  PermissionFlagsBits
} from 'discord.js';

const DEFAULT_VOICE_LOG_CHANNEL_ID = '1377698974512844870';
const DEFAULT_DELETE_LOG_CHANNEL_ID = '1389857160871280650';
const DEFAULT_BACKUP_CATEGORY_ID = '1389857472906530866';

const OWNER_ROLE_ID = '1262262852949905408';
const ADMIN_ROLE_ID = '1352741003639132160';
const CIDADAO_ROLE_ID = '1262978759922028575';

const PERMISSION_TRANSLATIONS = {
  ViewChannel: 'Ver Canal',
  SendMessages: 'Enviar Mensagens',
  SendMessagesInThreads: 'Enviar Mensagens em Tópicos',
  CreatePublicThreads: 'Criar Tópicos Públicos',
  CreatePrivateThreads: 'Criar Tópicos Privados',
  EmbedLinks: 'Inserir Links',
  AttachFiles: 'Anexar Arquivos',
  AddReactions: 'Adicionar Reações',
  UseExternalEmojis: 'Usar Emojis Externos',
  UseExternalStickers: 'Usar Figurinhas Externas',
  MentionEveryone: 'Mencionar @everyone/@here',
  ManageMessages: 'Gerenciar Mensagens',
  ManageThreads: 'Gerenciar Tópicos',
  ReadMessageHistory: 'Ler Histórico',
  Connect: 'Conectar (Voz)',
  Speak: 'Falar (Voz)',
  Stream: 'Transmitir Tela',
  UseVAD: 'Usar Atividade de Voz',
  PrioritySpeaker: 'Prioridade de Voz',
  MuteMembers: 'Silenciar Membros',
  DeafenMembers: 'Ensurdecer Membros',
  MoveMembers: 'Mover Membros',
  RequestToSpeak: 'Pedir para Falar',
  ManageChannels: 'Gerenciar Canais',
  ManageRoles: 'Gerenciar Cargos',
  ManageWebhooks: 'Gerenciar Webhooks',
  ManageEvents: 'Gerenciar Eventos',
  CreateInstantInvite: 'Criar Convite',
  Administrator: 'Administrador'
};

function formatPermissionState(overwrite, permissionName) {
  if (!overwrite) return 'nenhuma';
  if (overwrite.allow.has(permissionName)) return 'permitido';
  if (overwrite.deny.has(permissionName)) return 'negado';
  return 'nenhuma';
}

function stateEmoji(state) {
  if (state === 'permitido') return '✅';
  if (state === 'negado') return '❌';
  return '🚫';
}

function buildChannelUrl(guildId, channelId) {
  return `https://discord.com/channels/${guildId}/${channelId}`;
}

function formatDiscordTimestamp(date) {
  const unix = Math.floor(date.getTime() / 1000);
  return `<t:${unix}:F>\n<t:${unix}:R>`;
}

function describeChannelType(channel) {
  switch (channel.type) {
    case ChannelType.GuildText:
      return 'Texto';
    case ChannelType.GuildVoice:
      return 'Voz';
    case ChannelType.GuildAnnouncement:
      return 'Anúncios';
    case ChannelType.GuildForum:
      return 'Fórum';
    case ChannelType.GuildStageVoice:
      return 'Palco';
    case ChannelType.GuildCategory:
      return 'Categoria';
    case ChannelType.PublicThread:
      return 'Tópico Público';
    case ChannelType.PrivateThread:
      return 'Tópico Privado';
    case ChannelType.AnnouncementThread:
      return 'Tópico de Anúncios';
    default:
      return `Tipo ${channel.type}`;
  }
}

async function resolveOverwriteTarget(guild, overwriteId, oldOverwrite, newOverwrite) {
  const overwrite = newOverwrite ?? oldOverwrite;
  const overwriteType = overwrite?.type;

  let role = guild.roles.cache.get(overwriteId) ?? null;
  if (!role) {
    role = await guild.roles.fetch(overwriteId).catch(() => null);
  }

  if (role) {
    return {
      kind: 'role',
      id: role.id,
      mention: `<@&${role.id}>`,
      display: `Cargo: **${role.name}**`,
      compact: `Cargo: ${role.name}`,
      rawName: role.name
    };
  }

  let member = guild.members.cache.get(overwriteId) ?? null;
  if (!member) {
    member = await guild.members.fetch(overwriteId).catch(() => null);
  }

  if (member) {
    return {
      kind: 'member',
      id: member.id,
      mention: `<@${member.id}>`,
      display: `Membro: **${member.user.tag}**`,
      compact: `Membro: ${member.user.tag}`,
      rawName: member.user.tag
    };
  }

  if (overwriteType === 0 || overwriteType === 'role') {
    return {
      kind: 'role',
      id: overwriteId,
      mention: null,
      display: `Cargo: **Desconhecido** (\`${overwriteId}\`)`,
      compact: `Cargo desconhecido (${overwriteId})`,
      rawName: `Cargo desconhecido`
    };
  }

  if (overwriteType === 1 || overwriteType === 'member') {
    return {
      kind: 'member',
      id: overwriteId,
      mention: null,
      display: `Membro: **Desconhecido** (\`${overwriteId}\`)`,
      compact: `Membro desconhecido (${overwriteId})`,
      rawName: `Membro desconhecido`
    };
  }

  return {
    kind: 'unknown',
    id: overwriteId,
    mention: null,
    display: `Alvo: **Desconhecido** (\`${overwriteId}\`)`,
    compact: `Alvo desconhecido (${overwriteId})`,
    rawName: `Desconhecido`
  };
}

async function fetchRecentAuditEntry(guild, type, targetId, timeWindowMs = 15000, limit = 6) {
  const fetched = await guild.fetchAuditLogs({ type, limit }).catch(() => null);
  if (!fetched) return null;

  return (
    fetched.entries.find((entry) => {
      if (!entry?.target?.id) return false;
      if (entry.target.id !== targetId) return false;
      return Date.now() - entry.createdTimestamp < timeWindowMs;
    }) ?? null
  );
}

async function getOrCreateBackupCategory(guild, categoryId) {
  const existing = await guild.channels.fetch(categoryId).catch(() => null);
  if (existing && existing.type === ChannelType.GuildCategory) {
    return existing;
  }

  return guild.channels.create({
    name: '📂 Apagados Salvos',
    type: ChannelType.GuildCategory
  });
}

async function getTextChannel(client, channelId) {
  if (!channelId) return null;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return null;
  return channel;
}

function getParentCategoryLabel(channel) {
  const parent = channel.parent;
  if (!parent) return 'Sem categoria';
  return `${parent.name} (\`${parent.id}\`)`;
}

function buildPermissionDiffLines(permissionName, beforeState, afterState) {
  const translated = PERMISSION_TRANSLATIONS[permissionName] || permissionName;
  return [
    `🔧 **${translated}**`,
    `${stateEmoji(afterState)} Agora: **${afterState}**`,
    `📤 Antes: **${beforeState}**`
  ].join('\n');
}

async function buildPermissionChangeReport(oldChannel, newChannel) {
  const oldOverwrites = oldChannel.permissionOverwrites.cache;
  const newOverwrites = newChannel.permissionOverwrites.cache;
  const allIds = new Set([...oldOverwrites.keys(), ...newOverwrites.keys()]);
  const sections = [];

  for (const overwriteId of allIds) {
    const oldOverwrite = oldOverwrites.get(overwriteId);
    const newOverwrite = newOverwrites.get(overwriteId);

    const changedPermissions = [];

    for (const permissionName of Object.keys(PERMISSION_TRANSLATIONS)) {
      const beforeState = formatPermissionState(oldOverwrite, permissionName);
      const afterState = formatPermissionState(newOverwrite, permissionName);

      if (beforeState !== afterState) {
        changedPermissions.push(
          buildPermissionDiffLines(permissionName, beforeState, afterState)
        );
      }
    }

    if (!changedPermissions.length) continue;

    const target = await resolveOverwriteTarget(
      newChannel.guild,
      overwriteId,
      oldOverwrite,
      newOverwrite
    );

    const headerLines = [
      `👥 **Permissões alteradas para:** ${target.display}`,
      target.mention ? `🏷️ Menção: ${target.mention}` : `🏷️ Menção: não disponível`,
      `🆔 ID do alvo: \`${target.id}\``,
      `📌 Tipo: **${target.kind === 'role' ? 'Cargo' : target.kind === 'member' ? 'Membro' : 'Desconhecido'}**`
    ];

    sections.push(`${headerLines.join('\n')}\n\n${changedPermissions.join('\n\n')}`);
  }

  return sections.join('\n\n━━━━━━━━━━━━━━━━━━\n\n');
}

export function setupChannelLog(client) {
  client.on('channelUpdate', async (oldChannel, newChannel) => {
    const logChannelId = process.env.LOG_CHANNEL_PERMISSIONS;
    if (!logChannelId) return;

    try {
      const logEntry = await fetchRecentAuditEntry(
        newChannel.guild,
        AuditLogEvent.ChannelOverwriteUpdate,
        newChannel.id,
        15000,
        8
      );

      if (!logEntry || !logEntry.executor) return;

      const executor = logEntry.executor;
      const changesReport = await buildPermissionChangeReport(oldChannel, newChannel);

      if (!changesReport) return;

      const logChannel = await getTextChannel(client, logChannelId);
      if (!logChannel) return;

      const channelUrl = buildChannelUrl(newChannel.guild.id, newChannel.id);
      const parentLabel = getParentCategoryLabel(newChannel);

      const embed = new EmbedBuilder()
        .setTitle('⚙️ Permissões Atualizadas')
        .setColor('Orange')
        .setThumbnail(executor.displayAvatarURL({ extension: 'png', size: 512 }))
        .setDescription(changesReport)
        .addFields(
          {
            name: '🏠 Servidor',
            value: `**${newChannel.guild.name}**\nID: \`${newChannel.guild.id}\``,
            inline: true
          },
          {
            name: '📌 Canal',
            value: `${newChannel}\nNome: **${newChannel.name}**\nID: \`${newChannel.id}\``,
            inline: true
          },
          {
            name: '🧩 Tipo do Canal',
            value: `**${describeChannelType(newChannel)}**`,
            inline: true
          },
          {
            name: '🗂️ Categoria',
            value: parentLabel,
            inline: true
          },
          {
            name: '🔗 Link do Canal',
            value: `[Clique para abrir o canal](${channelUrl})`,
            inline: true
          },
          {
            name: '🛠️ Alterado por',
            value: `<@${executor.id}>\n\`${executor.tag}\`\nID: \`${executor.id}\``,
            inline: true
          },
          {
            name: '🕒 Data/Hora',
            value: formatDiscordTimestamp(new Date(logEntry.createdTimestamp)),
            inline: false
          }
        )
        .setFooter({
          text: `Executor: ${executor.tag} • Canal: ${newChannel.name}`,
          iconURL: executor.displayAvatarURL({ extension: 'png', size: 128 })
        })
        .setTimestamp(new Date(logEntry.createdTimestamp));

      await logChannel.send({ embeds: [embed] });
    } catch (err) {
      console.error('Erro ao logar update de permissões do canal:', err);
    }
  });

  client.on('channelUpdate', async (oldChannel, newChannel) => {
    if (oldChannel.type !== ChannelType.GuildVoice && newChannel.type !== ChannelType.GuildVoice) return;

    try {
      const entry = await fetchRecentAuditEntry(
        newChannel.guild,
        AuditLogEvent.ChannelUpdate,
        newChannel.id,
        15000,
        6
      );

      if (!entry?.executor) return;

      const executor = entry.executor;
      const canalLog = await getTextChannel(client, DEFAULT_VOICE_LOG_CHANNEL_ID);
      if (!canalLog) return;

      const channelUrl = buildChannelUrl(newChannel.guild.id, newChannel.id);

      const embed = new EmbedBuilder()
        .setTitle('📌 Status do Canal de Voz Atualizado')
        .setColor('Purple')
        .setDescription(
          `**${executor.tag}** definiu um novo status ou atualizou configurações do canal de voz **${newChannel.name}**.`
        )
        .addFields(
          {
            name: '🏠 Servidor',
            value: `**${newChannel.guild.name}**\nID: \`${newChannel.guild.id}\``,
            inline: true
          },
          {
            name: '🎙️ Canal de Voz',
            value: `${newChannel}\nNome: **${newChannel.name}**\nID: \`${newChannel.id}\``,
            inline: true
          },
          {
            name: '🗂️ Categoria',
            value: getParentCategoryLabel(newChannel),
            inline: true
          },
          {
            name: '👤 Executor',
            value: `<@${executor.id}>\n\`${executor.tag}\`\nID: \`${executor.id}\``,
            inline: true
          },
          {
            name: '🔗 Link do Canal',
            value: `[Clique para abrir o canal](${channelUrl})`,
            inline: true
          },
          {
            name: '🕒 Horário',
            value: formatDiscordTimestamp(new Date(entry.createdTimestamp)),
            inline: true
          }
        )
        .setFooter({ text: `ID do canal: ${newChannel.id}` })
        .setTimestamp(new Date(entry.createdTimestamp));

      await canalLog.send({ embeds: [embed] });
    } catch (err) {
      console.error('Erro ao logar atualização de voz:', err);
    }
  });

  client.on('channelDelete', async (channel) => {
    const logChannelId = DEFAULT_DELETE_LOG_CHANNEL_ID;

    try {
      const deletionLog = await fetchRecentAuditEntry(
        channel.guild,
        AuditLogEvent.ChannelDelete,
        channel.id,
        20000,
        6
      );

      if (!deletionLog?.executor) return;

      const executor = deletionLog.executor;
      if (executor.bot) return;

      const member = await channel.guild.members.fetch(executor.id).catch(() => null);
      if (!member) return;

      const logChannel = await getTextChannel(client, logChannelId);
      const botMember = await channel.guild.members.fetchMe().catch(() => null);
      if (!botMember) return;

      if (
        member.id === channel.guild.ownerId ||
        member.roles.highest.position > botMember.roles.highest.position ||
        member.roles.cache.has(OWNER_ROLE_ID) ||
        member.roles.cache.has(ADMIN_ROLE_ID)
      ) {
        return;
      }

      if (
        !botMember.permissions.has(PermissionFlagsBits.ManageRoles) ||
        botMember.roles.highest.comparePositionTo(member.roles.highest) <= 0
      ) {
        if (logChannel) {
          await logChannel.send({
            content: `⚠️ <@&${OWNER_ROLE_ID}> <@&${ADMIN_ROLE_ID}> — O bot tentou punir **${member.user.tag}**, mas não tem cargo suficiente para isso.`
          });
        }
        return;
      }

      // Filtra os cargos para remover: 
      // 1. Ignora o @everyone (guild.id)
      // 2. Ignora o cargo de Cidadão (base)
      // 3. Ignora cargos gerenciados (Bots/Booster)
      // 4. Garante que o bot tenha hierarquia para editar (editable)
      const rolesToRemove = member.roles.cache.filter(
        (role) =>
          role.id !== channel.guild.id &&
          role.id !== CIDADAO_ROLE_ID &&
          !role.managed &&
          role.editable
      ).map(r => r.id);

      try {
        if (rolesToRemove.length > 0) {
          await member.roles.remove(rolesToRemove, 'Canal deletado sem permissão');
        }

        if (!member.roles.cache.has(CIDADAO_ROLE_ID)) {
          await member.roles.add(CIDADAO_ROLE_ID, 'Aplicando cargo base após punição');
        }
      } catch (err) {
        if (logChannel) {
          await logChannel.send({
            content: `⚠️ Erro ao punir **${member.user.tag}**: \`${err.message}\``
          });
        }
      }

      await member.send({
        content: `🚫 | Você deletou um canal sem permissão.\nSeus cargos foram removidos temporariamente e a ação foi registrada.`
      }).catch(() => {});

      const backupCategory = await getOrCreateBackupCategory(
        channel.guild,
        DEFAULT_BACKUP_CATEGORY_ID
      );

      let restoredChannel = null;

      if (channel.type !== ChannelType.GuildCategory) {
        restoredChannel = await channel.guild.channels.create({
          name: `🔒-${channel.name}-restaurado`,
          type: channel.type,
          topic: 'topic' in channel ? channel.topic : null,
          nsfw: 'nsfw' in channel ? channel.nsfw : false,
          rateLimitPerUser: 'rateLimitPerUser' in channel ? channel.rateLimitPerUser : 0,
          parent: backupCategory.id,
          permissionOverwrites: channel.permissionOverwrites.cache.map((overwrite) => ({
            id: overwrite.id,
            allow: overwrite.allow.bitfield,
            deny: overwrite.deny.bitfield,
            type: overwrite.type
          }))
        });

        if (restoredChannel?.isTextBased()) {
          const restoredUrl = buildChannelUrl(channel.guild.id, restoredChannel.id);
          const notice = await restoredChannel.send({
            content: `🔧 **Canal restaurado automaticamente.**\nExecutor da exclusão: **${executor.tag}**\n[Ir para o canal restaurado](${restoredUrl})`
          }).catch(() => null);

          if (notice?.pinnable) {
            await notice.pin().catch(() => {});
          }
        }
      } else {
        restoredChannel = await channel.guild.channels.create({
          name: `🔒-${channel.name}-restaurada`,
          type: ChannelType.GuildCategory,
          permissionOverwrites: channel.permissionOverwrites.cache.map((overwrite) => ({
            id: overwrite.id,
            allow: overwrite.allow.bitfield,
            deny: overwrite.deny.bitfield,
            type: overwrite.type
          }))
        });
      }

      if (logChannel && restoredChannel) {
        const deletedChannelUrl =
          channel.type !== ChannelType.GuildCategory
            ? buildChannelUrl(channel.guild.id, channel.id)
            : null;

        const restoredChannelUrl =
          restoredChannel.type !== ChannelType.GuildCategory
            ? buildChannelUrl(channel.guild.id, restoredChannel.id)
            : null;

        const embed = new EmbedBuilder()
          .setTitle('🚨 Canal Deletado e Restaurado')
          .setColor('Red')
          .addFields(
            {
              name: '🏠 Servidor',
              value: `**${channel.guild.name}**\nID: \`${channel.guild.id}\``,
              inline: true
            },
            {
              name: '🧑 Executor',
              value: `<@${executor.id}>\n\`${executor.tag}\`\nID: \`${executor.id}\``,
              inline: true
            },
            {
              name: '📁 Canal Deletado',
              value: `**${channel.name}**\nID: \`${channel.id}\`\nTipo: **${describeChannelType(channel)}**`,
              inline: true
            },
            {
              name: '🗂️ Categoria Original',
              value: getParentCategoryLabel(channel),
              inline: true
            },
            {
              name: '📦 Restaurado como',
              value:
                restoredChannel.type === ChannelType.GuildCategory
                  ? `**${restoredChannel.name}**\nID: \`${restoredChannel.id}\``
                  : `<#${restoredChannel.id}>\nNome: **${restoredChannel.name}**`,
              inline: true
            },
            {
              name: '🔒 Ação Executada',
              value: 'Cargos removidos do executor e canal restaurado automaticamente.',
              inline: false
            },
            {
              name: '🔗 Link do Canal Restaurado',
              value: restoredChannelUrl
                ? `[Clique para abrir](${restoredChannelUrl})`
                : 'Não aplicável para categoria',
              inline: true
            },
            {
              name: '🔗 Link do Canal Original',
              value: deletedChannelUrl
                ? `[Referência do canal excluído](${deletedChannelUrl})`
                : 'Não aplicável para categoria',
              inline: true
            },
            {
              name: '🕒 Data/Hora',
              value: formatDiscordTimestamp(new Date(deletionLog.createdTimestamp)),
              inline: false
            }
          )
          .setFooter({
            text: `Executor: ${executor.tag} • Canal excluído: ${channel.name}`,
            iconURL: executor.displayAvatarURL({ extension: 'png', size: 128 })
          })
          .setTimestamp(new Date(deletionLog.createdTimestamp));

        await logChannel.send({
          content: `<@&${OWNER_ROLE_ID}> <@&${ADMIN_ROLE_ID}>`,
          embeds: [embed]
        });
      }
    } catch (err) {
      console.error('Erro ao processar canal deletado:', err);
    }
  });
}