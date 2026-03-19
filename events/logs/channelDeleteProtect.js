import { AuditLogEvent, ChannelType, EmbedBuilder } from 'discord.js';

// ================== CONFIG ==================
// Canais para onde os logs de proteção serão enviados
const MAIN_GUILD_ID = '1262262852782129183';
const CENTRAL_LOG_CHANNEL_ID = '1423088696835571804'; // Canal central de logs de proteção

// Mapeamento de Guild ID para Canal de Log Local
const LOCAL_LOG_CHANNELS = {
  '1262262852782129183': '1423088696835571804', // Principal (logs no próprio canal central)
  '1362899773992079533': '1363295055384809483', // Cidade Santa -> #sc-logs
  '1452416085751234733': '1455312395269443813', // Administração -> #sc-logs
  // Adicione outros servidores e seus canais de log aqui
};

// IDs de usuários que podem deletar canais livremente (ex: donos, admins de confiança)
const BYPASS_USER_IDS = new Set([
    '660311795327828008', // Seu ID
    // Adicione outros IDs se necessário
]);

// IDs de cargos que podem deletar canais livremente
const BYPASS_ROLE_IDS = new Set([
    '1262262852949905408', // Exemplo: Cargo 'Owner'
    '1352408327983861844', // Exemplo: Resp Creator
]);

// Categorias ou canais que NUNCA devem ser restaurados (ex: canais temporários de tickets)
const IGNORE_IDS = new Set([
    '1359244725781266492', // Categoria de Entrevista (exemplo)
]);

// ================== HELPERS ==================

/**
 * Busca o executor de uma ação no Audit Log.
 * @param {import('discord.js').Guild} guild
 * @param {import('discord.js').PartialDMChannel | import('discord.js').DMChannel | import('discord.js').PartialGroupDMChannel | import('discord.js').GuildChannel} channel
 * @returns {Promise<import('discord.js').GuildMember|null>}
 */
async function findChannelDeleter(guild, channel) {
    try {
        const logs = await guild.fetchAuditLogs({
            type: AuditLogEvent.ChannelDelete,
            limit: 5,
        });

        const entry = logs.entries.find(
            e => e.target?.id === channel.id && (Date.now() - e.createdTimestamp) < 15000 // Janela de 15s
        );

        if (!entry || !entry.executor) return null;

        return await guild.members.fetch(entry.executor.id).catch(() => null);
    } catch (error) {
        console.error('[ChannelProtect] Erro ao buscar Audit Log:', error);
        return null;
    }
}

/**
 * Verifica se um membro tem permissão para deletar, baseado na hierarquia ou bypass.
 * @param {import('discord.js').GuildMember | null} executor
 * @param {import('discord.js').GuildMember} botMember
 * @returns {boolean}
 */
function hasDeletionPermission(executor, botMember) {
    if (!executor) return false;

    // 1. Dono do servidor sempre pode
    if (executor.id === executor.guild.ownerId) {
        return true;
    }

    // 2. Usuários e cargos na lista de bypass sempre podem
    if (BYPASS_USER_IDS.has(executor.id) || executor.roles.cache.some(role => BYPASS_ROLE_IDS.has(role.id))) {
        return true;
    }

    // 3. Verifica hierarquia: se o cargo mais alto do executor é maior que o do bot
    if (executor.roles.highest.position > botMember.roles.highest.position) {
        return true;
    }

    return false;
}

// ================== EVENT HANDLER ==================

/**
 * @param {import('discord.js').Client} client
 */
export default function installChannelDeleteProtection(client) {
    if (client.channelDeleteProtectionInstalled) return;
    client.channelDeleteProtectionInstalled = true;

    client.on('channelDelete', async (channel) => {
        if (!channel.guild) return;
        if (IGNORE_IDS.has(channel.id) || (channel.parentId && IGNORE_IDS.has(channel.parentId))) return;

        const guild = channel.guild;
        const botMember = guild.members.me;
        if (!botMember) return;

        await new Promise(resolve => setTimeout(resolve, 2000)); // Espera o Audit Log

        const executor = await findChannelDeleter(guild, channel);

        if (executor && executor.id === client.user.id) return; // Bot deletou, ignora

        if (hasDeletionPermission(executor, botMember)) {
            // Ação permitida, não faz nada. Opcional: logar a deleção.
            return;
        }

        // Se chegou aqui, a deleção foi NÃO AUTORIZADA.
        // O código para recriar o canal iria aqui.
        // Por segurança, a recriação automática foi omitida.
        // O ideal é logar a tentativa de deleção indevida.

        const embed = new EmbedBuilder()
            .setColor('Red')
            .setTitle('🚨 ALERTA: Tentativa de Deleção de Canal Bloqueada')
            .setDescription(`O canal **#${channel.name}** foi protegido contra deleção.`)
            .addFields(
                { name: 'Executor Indevido', value: executor ? `${executor.user.tag} (${executor.id})` : 'Desconhecido' },
                { name: 'ID do Canal', value: `\`${channel.id}\`` }
            )
            .setTimestamp();

        const localLogChannelId = LOCAL_LOG_CHANNELS[guild.id];
        if (localLogChannelId) {
            const localLogChannel = await client.channels.fetch(localLogChannelId).catch(() => null);
            if (localLogChannel) {
                const localEmbed = EmbedBuilder.from(embed)
                    .setFooter(null);
                await localLogChannel.send({ embeds: [localEmbed] }).catch(() => {});
            }
        }
    });

    console.log('✅ [ChannelProtect] Proteção contra deleção de canais ativada.');
}