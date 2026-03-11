// d:\santacreators-main\services\guildClone\cloneChannel.js
import { getMirroredId, mapId } from './idRegistry.js';
import { mapPermissionOverwrites } from './permissionMapper.js';

/**
 * Resolve um canal na guilda de destino, criando-o se necessário.
 * @param {import('discord.js').GuildChannel} sourceChannel O canal de origem.
 * @param {import('discord.js').CategoryChannel} targetCategory A categoria de destino onde o canal será criado.
 * @param {import('discord.js').Guild} targetGuild A guilda de destino.
 * @returns {Promise<{channel: import('discord.js').GuildChannel | null, status: 'created' | 'reused' | 'failed'}>}
 */
export async function resolveOrCreateChannel(sourceChannel, targetCategory, targetGuild) {
  const sourceGuildId = sourceChannel.guild.id;

  // 1. Verifica se já existe um mapeamento.
  const mirroredId = getMirroredId('channels', sourceGuildId, sourceChannel.id);
  if (mirroredId) {
    const existingChannel = await targetGuild.channels.fetch(mirroredId).catch(() => null);
    if (existingChannel) {
      // Opcional: Aqui você poderia adicionar lógica para ATUALIZAR o canal existente (nome, tópico, etc.)
      // Por segurança, por enquanto apenas o reutilizamos.
      return { channel: existingChannel, status: 'reused' };
    }
  }

  // 2. Mapeia as permissões antes de criar.
  const permissionOverwrites = await mapPermissionOverwrites(sourceChannel, targetGuild);

  // 3. Define as opções do canal com base no tipo.
  const channelOptions = {
    name: sourceChannel.name,
    type: sourceChannel.type,
    parent: targetCategory.id,
    position: sourceChannel.position,
    permissionOverwrites,
    reason: `Espelhamento do canal ${sourceChannel.name} do servidor de origem.`,
  };

  // Adiciona propriedades específicas do tipo de canal
  if (sourceChannel.isTextBased() && !sourceChannel.isVoiceBased()) {
    channelOptions.topic = sourceChannel.topic;
    channelOptions.nsfw = sourceChannel.nsfw;
    channelOptions.rateLimitPerUser = sourceChannel.rateLimitPerUser;
  }

  if (sourceChannel.isVoiceBased()) {
    channelOptions.bitrate = sourceChannel.bitrate;
    channelOptions.userLimit = sourceChannel.userLimit;
  }

  // Suporte a outros tipos de canal pode ser adicionado aqui (Forum, Stage, etc.)
  // if (sourceChannel.type === ChannelType.GuildForum) { ... }

  // 4. Cria o canal.
  try {
    console.log(`[GuildClone] Criando canal: ${sourceChannel.name} (Tipo: ${sourceChannel.type})`);
    const newChannel = await targetGuild.channels.create(channelOptions);

    // Salva o novo mapeamento.
    mapId('channels', sourceGuildId, sourceChannel.id, newChannel.id);

    return { channel: newChannel, status: 'created' };
  } catch (error) {
    console.error(`[GuildClone] Falha ao criar canal '${sourceChannel.name}':`, error.message);
    return { channel: null, status: 'failed' };
  }
}