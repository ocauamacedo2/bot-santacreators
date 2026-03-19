// d:\santacreators-main\commands\admin\criarCategoriaEspelho.js
import { PermissionsBitField, ChannelType } from 'discord.js';
import { MIRROR_CONFIG } from './mirrorConfig.js';
import { ensureGuildEntry } from './idRegistry.js';
import { cloneSingleCategory } from './cloneCategory.js';

/**
 * Verifica se o usuário tem permissão para usar o comando.
 * @param {import('discord.js').Member} member
 * @returns {boolean}
 */
function hasPermission(member) {
  if (!member) return false;
  if (MIRROR_CONFIG.ALLOWED_USER_IDS.includes(member.id)) return true;
  return member.roles.cache.some(r => MIRROR_CONFIG.ALLOWED_ROLE_IDS.includes(r.id));
}

export default {
  name: 'criar',
  description: 'Cria um espelho de uma ou mais categorias em um servidor de destino.',
  async execute(message, args, client) {
    // 1. Validação de Permissão
    const memberOnTarget = await message.guild.members.fetch(message.author.id).catch(() => null);
    if (!hasPermission(memberOnTarget)) {
      return message.reply('❌ Você não tem permissão para usar este comando.');
    }

    // 2. Parse dos IDs de Categoria
    const categoryIds = args.join(' ').replace(/,/g, ' ').split(/\s+/).filter(id => /^\d+$/.test(id));
    if (categoryIds.length === 0) {
      return message.reply('❓ Uso: `!criar <ID_DA_CATEGORIA_1> [ID_DA_CATEGORIA_2]...` (use no servidor de **destino**).');
    }
    const uniqueCategoryIds = [...new Set(categoryIds)];

    // 3. Validação de Contexto (LÓGICA INVERTIDA)
    const targetGuild = message.guild; // O servidor de destino é onde o comando é executado.
    let sourceGuild = null;

    // Tenta encontrar a guilda de origem baseada no primeiro ID de categoria
    const firstCategoryId = uniqueCategoryIds[0];
    for (const guild of client.guilds.cache.values()) {
      if (guild.id === targetGuild.id) continue; // Não pode copiar de si mesmo

      try {
        const channel = await guild.channels.fetch(firstCategoryId);
        if (channel && channel.type === ChannelType.GuildCategory) {
          sourceGuild = guild;
          break; // Encontrou a guilda de origem
        }
      } catch (e) {
        // Canal não encontrado nesta guilda, continua procurando
      }
    }

    if (!sourceGuild) {
      return message.reply(`❌ Não consegui encontrar a categoria com ID \`${firstCategoryId}\` em nenhum dos servidores em que estou (exceto este). Verifique o ID.`);
    }

    // 3. Validação de Permissões do Bot
    const botMemberInTarget = targetGuild.members.me;
    const requiredPerms = [
      PermissionsBitField.Flags.ManageChannels,
      PermissionsBitField.Flags.ManageRoles,
    ];

    const missingPerms = requiredPerms.filter(p => !botMemberInTarget.permissions.has(p));
    if (missingPerms.length > 0) {
      return message.reply(`❌ O bot não tem as permissões necessárias no servidor de destino: \`${missingPerms.join(', ')}\``);
    }

    // 5. Garante a entrada no registro
    ensureGuildEntry(sourceGuild.id, targetGuild.id);

    const initialReply = await message.reply(`🚀 Iniciando processo de espelhamento para ${uniqueCategoryIds.length} categoria(s). Isso pode levar vários minutos...`);

    const totalReport = {
      categoriesProcessed: 0,
      channelsCreated: 0,
      channelsReused: 0,
      errors: [],
    };

    // 6. Processa cada categoria
    for (const categoryId of uniqueCategoryIds) {
      // Valida se a categoria pertence à guilda de origem encontrada
      const categoryChannel = await sourceGuild.channels.fetch(categoryId).catch(() => null);
      if (!categoryChannel || categoryChannel.type !== ChannelType.GuildCategory) {
        totalReport.errors.push(`ID ${categoryId} não é uma categoria válida no servidor de origem '${sourceGuild.name}'.`);
        continue;
      }

      await initialReply.edit(`⏳ Processando categoria \`${categoryChannel.name}\` (\`${categoryId}\`)...`);

      const result = await cloneSingleCategory(categoryId, sourceGuild, targetGuild);

      if (result.success) {
        totalReport.categoriesProcessed++;
        totalReport.channelsCreated += result.channelsCreated;
        totalReport.channelsReused += result.channelsReused;
      }
      totalReport.errors.push(...result.errors);

      // Adiciona um delay maior entre categorias
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // 7. Resposta Final
    const summary = [
      `✅ **Processo de espelhamento concluído!**`,
      `--------------------------------------`,
      `- **Categorias Processadas:** ${totalReport.categoriesProcessed}`,
      `- **Canais Criados:** ${totalReport.channelsCreated}`,
      `- **Canais Reutilizados:** ${totalReport.channelsReused}`,
      `- **Erros:** ${totalReport.errors.length}`,
    ];

    if (totalReport.errors.length > 0) {
      summary.push(`\n**Detalhes dos Erros:**`);
      summary.push('```');
      summary.push(...totalReport.errors.slice(0, 10)); // Limita a 10 erros para não poluir
      if (totalReport.errors.length > 10) {
        summary.push(`... e mais ${totalReport.errors.length - 10} erros.`);
      }
      summary.push('```');
    }

    await initialReply.edit(summary.join('\n'));
  },
};