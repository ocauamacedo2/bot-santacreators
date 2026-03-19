// d:\santacreators-main\services\guildClone\permissionMapper.js
import { OverwriteType } from 'discord.js';
import { getMirroredId } from './idRegistry.js';
import { MIRROR_CONFIG } from './mirrorConfig.js';

/**
 * Mapeia as permissões de um canal/categoria de origem para o destino.
 * @param {import('discord.js').GuildChannel} sourceChannel O canal ou categoria de origem.
 * @param {import('discord.js').Guild} targetGuild A guilda de destino.
 * @returns {Promise<Array<import('discord.js').PermissionOverwriteOptions>>}
 */
export async function mapPermissionOverwrites(sourceChannel, targetGuild) {
  const sourceGuildId = sourceChannel.guild.id;
  const newOverwrites = [];

  for (const overwrite of sourceChannel.permissionOverwrites.cache.values()) {
    let targetId = null;

    if (overwrite.type === OverwriteType.Role) {
      // Se for @everyone, usa o @everyone da guilda de destino.
      if (overwrite.id === sourceGuildId) {
        targetId = targetGuild.id;
      } else {
        // Procura o ID do cargo espelhado.
        targetId = getMirroredId('roles', sourceGuildId, overwrite.id);
      }
    } else if (overwrite.type === OverwriteType.Member) {
      // Cópia de permissões de membro é opcional e pode ser arriscada.
      if (MIRROR_CONFIG.ALLOW_MEMBER_OVERWRITES) {
        // Apenas copia se o membro existir na guilda de destino.
        const memberExists = await targetGuild.members.fetch(overwrite.id).catch(() => null);
        if (memberExists) {
          targetId = overwrite.id;
        }
      }
    }

    if (targetId) {
      newOverwrites.push({
        id: targetId,
        type: overwrite.type,
        allow: overwrite.allow.bitfield,
        deny: overwrite.deny.bitfield,
      });
    } else {
      console.warn(`[GuildClone] Não foi possível mapear o overwrite para ID: ${overwrite.id} (Tipo: ${overwrite.type})`);
    }
  }

  return newOverwrites;
}