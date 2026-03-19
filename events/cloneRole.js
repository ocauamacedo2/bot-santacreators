// d:\santacreators-main\services\guildClone\cloneRole.js
import { getMirroredId, mapId } from './idRegistry.js';

/**
 * Resolve um cargo na guilda de destino, criando-o se necessário.
 * @param {import('discord.js').Role} sourceRole O cargo original.
 * @param {import('discord.js').Guild} targetGuild A guilda de destino.
 * @returns {Promise<import('discord.js').Role | null>}
 */
export async function resolveOrCreateRole(sourceRole, targetGuild) {
  if (!sourceRole || !targetGuild) return null;

  const sourceGuildId = sourceRole.guild.id;

  // 1. Se for @everyone, retorna o @everyone da guilda de destino.
  if (sourceRole.id === sourceGuildId) {
    return targetGuild.roles.everyone;
  }

  // 2. Verifica se já existe um mapeamento salvo.
  const mirroredId = getMirroredId('roles', sourceGuildId, sourceRole.id);
  if (mirroredId) {
    const existingRole = await targetGuild.roles.fetch(mirroredId).catch(() => null);
    if (existingRole) {
      return existingRole; // Retorna o cargo mapeado se ele ainda existir.
    }
  }

  // 3. Procura por um cargo equivalente por nome.
  const equivalentRole = targetGuild.roles.cache.find(r => r.name === sourceRole.name);
  if (equivalentRole) {
    // Encontrou um cargo com o mesmo nome, vamos usá-lo e salvar o mapeamento.
    mapId('roles', sourceGuildId, sourceRole.id, equivalentRole.id);
    return equivalentRole;
  }

  // 4. Se não encontrou, cria um novo cargo.
  try {
    console.log(`[GuildClone] Criando cargo: ${sourceRole.name}`);
    const newRole = await targetGuild.roles.create({
      name: sourceRole.name,
      color: sourceRole.color,
      hoist: sourceRole.hoist,
      mentionable: sourceRole.mentionable,
      permissions: sourceRole.permissions,
      reason: `Espelhamento do cargo ${sourceRole.name} do servidor de origem.`,
    });

    // Salva o novo mapeamento.
    mapId('roles', sourceGuildId, sourceRole.id, newRole.id);
    return newRole;
  } catch (error) {
    console.error(`[GuildClone] Falha ao criar cargo '${sourceRole.name}':`, error.message);
    // Isso pode acontecer se o bot não tiver permissão ou o cargo estiver acima do bot.
    return null;
  }
}

/**
 * Pré-processa todos os cargos necessários para uma categoria e seus canais.
 * @param {import('discord.js').CategoryChannel} sourceCategory
 * @param {import('discord.js').Guild} targetGuild
 */
export async function preProcessCategoryRoles(sourceCategory, targetGuild) {
    const requiredRoleIds = new Set();

    // Coleta permissões da categoria
    sourceCategory.permissionOverwrites.cache.forEach(overwrite => {
        if (overwrite.type === 0) { // 0 = Role
            requiredRoleIds.add(overwrite.id);
        }
    });

    // Coleta permissões dos canais filhos
    for (const channel of sourceCategory.children.cache.values()) {
        channel.permissionOverwrites.cache.forEach(overwrite => {
            if (overwrite.type === 0) { // 0 = Role
                requiredRoleIds.add(overwrite.id);
            }
        });
    }

    console.log(`[GuildClone] Pré-processando ${requiredRoleIds.size} cargos necessários...`);

    // Itera e resolve cada cargo
    for (const roleId of requiredRoleIds) {
        const sourceRole = await sourceCategory.guild.roles.fetch(roleId).catch(() => null);
        if (sourceRole) {
            await resolveOrCreateRole(sourceRole, targetGuild);
            // Adiciona um pequeno delay para não sobrecarregar a API
            await new Promise(resolve => setTimeout(resolve, 300));
        }
    }

    console.log('[GuildClone] Pré-processamento de cargos concluído.');
}