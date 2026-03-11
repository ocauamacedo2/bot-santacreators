// d:\santacreators-main\services\guildClone\cloneCategory.js
import { ChannelType } from 'discord.js';
import { getMirroredId, mapId } from './idRegistry.js';
import { mapPermissionOverwrites } from './permissionMapper.js';
import { resolveOrCreateChannel } from './cloneChannel.js';
import { preProcessCategoryRoles } from './cloneRole.js';

/**
 * Clona uma categoria inteira, incluindo seus canais e permissões.
 * @param {string} sourceCategoryId O ID da categoria de origem.
 * @param {import('discord.js').Guild} sourceGuild A guilda de origem.
 * @param {import('discord.js').Guild} targetGuild A guilda de destino.
 * @returns {Promise<{
 *   success: boolean,
 *   category: import('discord.js').CategoryChannel | null,
 *   channelsCreated: number,
 *   channelsReused: number,
 *   errors: string[]
 * }>}
 */
export async function cloneSingleCategory(sourceCategoryId, sourceGuild, targetGuild) {
  const report = {
    success: false,
    category: null,
    channelsCreated: 0,
    channelsReused: 0,
    errors: [],
  };

  // 1. Valida a categoria de origem.
  const sourceCategory = await sourceGuild.channels.fetch(sourceCategoryId).catch(() => null);
  if (!sourceCategory || sourceCategory.type !== ChannelType.GuildCategory) {
    report.errors.push(`Categoria de origem com ID ${sourceCategoryId} não encontrada ou não é uma categoria.`);
    return report;
  }

  // 2. Pré-processa todos os cargos necessários para evitar race conditions.
  await preProcessCategoryRoles(sourceCategory, targetGuild);

  // 3. Mapeia as permissões da categoria.
  const permissionOverwrites = await mapPermissionOverwrites(sourceCategory, targetGuild);

  // 4. Resolve ou cria a categoria de destino.
  let targetCategory = null;
  const mirroredId = getMirroredId('categories', sourceGuild.id, sourceCategoryId);
  if (mirroredId) {
    targetCategory = await targetGuild.channels.fetch(mirroredId).catch(() => null);
  }

  if (targetCategory) {
    // Categoria já existe, atualiza se necessário (opcional).
    // Por enquanto, apenas a reutilizamos.
    report.category = targetCategory;
  } else {
    try {
      console.log(`[GuildClone] Criando categoria: ${sourceCategory.name}`);
      targetCategory = await targetGuild.channels.create({
        name: sourceCategory.name,
        type: sourceCategory.type,
        permissionOverwrites,
        position: sourceCategory.position,
        reason: `Espelhamento da categoria ${sourceCategory.name}`,
      });
      mapId('categories', sourceGuild.id, sourceCategoryId, targetCategory.id);
      report.category = targetCategory;
    } catch (error) {
      report.errors.push(`Falha ao criar categoria '${sourceCategory.name}': ${error.message}`);
      return report;
    }
  }

  // 5. Itera e clona cada canal filho.
  const sourceChannels = [...sourceCategory.children.cache.values()].sort((a, b) => a.position - b.position);

  for (const sourceChannel of sourceChannels) {
    const result = await resolveOrCreateChannel(sourceChannel, targetCategory, targetGuild);
    if (result.status === 'created') {
      report.channelsCreated++;
    } else if (result.status === 'reused') {
      report.channelsReused++;
    } else {
      report.errors.push(`Falha ao processar o canal '${sourceChannel.name}'.`);
    }
    // Adiciona um delay para evitar rate limits da API do Discord.
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  report.success = true;
  return report;
}