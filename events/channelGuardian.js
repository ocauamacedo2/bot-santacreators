import { EmbedBuilder, AuditLogEvent, PermissionsBitField, Collection } from 'discord.js';

// =====================================================
// CONFIGURAÇÃO DO GUARDIÃO DE CANAIS
// =====================================================

const LOG_CHANNEL_ID = '1486006908056899748'; // ⚠️ Substitua pelo ID do seu canal de logs de segurança

// Usuários que SEMPRE podem deletar canais sem serem punidos
const ALLOWED_DELETERS_USER_IDS = [
    '1262262852949905408', // Owner
    '660311795327828008',  // Você
    '1262262852949905408'  // Outro ID de segurança
];

// Cargos que podem deletar canais sem serem punidos
const ALLOWED_DELETERS_ROLE_IDS = [
    '1377127454543708253', // Diretoria
    '1262262852949905408', // Owner (cargo)
    '1352408327983861844', // Resp Creators
    '1262262852949905409', // Resp Influ
    '1352407252216184833', // Resp Líder
    '1414651836861907006', // Responsáveis
];

// Cargos que NUNCA devem ser removidos do usuário, mesmo se ele for punido
// (Ex: @everyone, cargos que o bot não pode gerenciar, cargos de bypass)
const EXEMPT_ROLES_FROM_PUNISHMENT = [
    '1352493359897378941', // Interação BOT
    // 'ID_DO_CARGO_CRITICO_2',
];

// =====================================================
// FUNÇÕES AUXILIARES
// =====================================================

/**
 * Verifica se um membro tem permissão para deletar canais sem ser punido.
 * @param {import('discord.js').GuildMember} member O membro a ser verificado.
 * @returns {boolean} True se o membro tem permissão, false caso contrário.
 */
function isAuthorizedDeleter(member) {
    if (!member) return false;
    if (ALLOWED_DELETERS_USER_IDS.includes(member.id)) return true;
    
    // ⚠️ Se você quiser punir MESMO quem é Administrador (exceto os IDs acima), 
    // mantenha a linha abaixo comentada ou removida:
    // if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true; 

    return member.roles.cache.some(role => ALLOWED_DELETERS_ROLE_IDS.includes(role.id));
}

/**
 * Envia um log detalhado para o canal de logs.
 * @param {import('discord.js').Client} client O cliente do Discord.
 * @param {import('discord.js').Guild} guild A guilda onde a ação ocorreu.
 * @param {import('discord.js').GuildMember} perpetrator O membro que deletou o canal.
 * @param {import('discord.js').GuildChannel} deletedChannel O canal que foi deletado.
 * @param {boolean} punished True se o membro foi punido, false caso contrário.
 * @param {string} reason O motivo da ação.
 */
async function sendSecurityLog(client, guild, perpetrator, deletedChannel, punished, reason) {
    const logChannel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    if (!logChannel || !logChannel.isTextBased()) {
        console.error(`[ChannelGuardian] Canal de log ${LOG_CHANNEL_ID} não encontrado ou não é de texto.`);
        return;
    }

    const categoryName = deletedChannel.parent ? `${deletedChannel.parent.name} (${deletedChannel.parent.id})` : 'Nenhuma';

    const embed = new EmbedBuilder()
        .setTitle(punished ? '🚨 Canal Deletado e Restaurado' : '⚠️ Canal Deletado (Autorizado)')
        .setColor(punished ? '#FF0000' : '#00FF00')
        .setThumbnail(perpetrator.user.displayAvatarURL())
        .addFields(
            { name: '🏠 Servidor', value: `${guild.name}\nID: ${guild.id}`, inline: false },
            { name: '🧑 Executor', value: `${perpetrator}\n${perpetrator.user.tag}\nID: ${perpetrator.id}`, inline: false },
            { name: '📁 Canal Deletado', value: `${deletedChannel.name}\nID: ${deletedChannel.id}\nTipo: ${deletedChannel.type === 0 ? 'Texto' : 'Voz'}`, inline: false },
            { name: '🗂️ Categoria Original', value: categoryName, inline: false },
            { name: '🔒 Ação Executada', value: reason, inline: false },
            { name: '🕒 Data/Hora', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
        )
        .setFooter({ text: 'Sistema de Proteção de Canais • SantaCreators' })
        .setTimestamp();

    // Se foi restaurado, tenta pegar o link (embora o bot precise do link do clone)
    if (punished) {
        const recentClone = guild.channels.cache.find(c => c.name === deletedChannel.name && Date.now() - c.createdTimestamp < 10000);
        if (recentClone) {
            embed.addFields({ 
                name: '📦 Restaurado como', 
                value: `Nome: ${recentClone.name}\nClique para abrir`, 
                inline: false 
            });
        }
    }

    await logChannel.send({ embeds: [embed] }).catch(console.error);
}

// =====================================================
// GUARDIÃO DE CANAIS
// =====================================================

export async function installChannelGuardian(client) {
    client.on('channelDelete', async (channel) => {
        if (!channel.guild) return; // Ignora DMs

        const guild = channel.guild;

        // Verifica se o bot tem permissões básicas para agir
        const me = guild.members.me;
        if (!me.permissions.has(PermissionsBitField.Flags.ManageChannels) || !me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
            console.error('[ChannelGuardian] ❌ Erro: O bot não possui permissão de "Gerenciar Canais" ou "Gerenciar Cargos".');
            return;
        }

        // Aguarda um pouco para que o Audit Log seja atualizado
        await new Promise(resolve => setTimeout(resolve, 2000));

        let executor = null;
        try {
            const fetchedLogs = await guild.fetchAuditLogs({
                limit: 1,
                type: AuditLogEvent.ChannelDelete,
            });
            const channelDeleteLog = fetchedLogs.entries.first();

            // Verifica se o log é recente e corresponde ao canal deletado
            if (channelDeleteLog && channelDeleteLog.target.id === channel.id && Date.now() - channelDeleteLog.createdTimestamp < 5000) {
                executor = channelDeleteLog.executor;
            }
        } catch (error) {
            console.error('[ChannelGuardian] Erro ao buscar Audit Logs:', error);
        }

        if (!executor) {
            // Não foi possível determinar o executor, loga e não pune (para evitar falsos positivos)
            console.warn(`[ChannelGuardian] Canal #${channel.name} deletado, mas executor não pôde ser identificado.`);
            return;
        }

        // Busca o membro do executor com cache zerado para garantir dados atuais
        const perpetratorMember = await guild.members.fetch({ user: executor.id, force: true }).catch(() => null);

        if (!perpetratorMember) {
            console.warn(`[ChannelGuardian] Executor (${executor.tag}) não encontrado no servidor.`);
            return;
        }

        // Se o próprio bot deletou, ignora (evita loop)
        if (executor.id === client.user.id) return;

        // 🛠️ RESTAURAÇÃO: Clona o canal deletado para restaurar as configurações
        let restoreStatus = "Falha na restauração";
        try {
            const restoredChannel = await channel.clone({
                reason: `Restauração automática: Canal deletado por ${executor.tag}`,
                position: channel.rawPosition
            });
            console.log(`[ChannelGuardian] ✅ Canal #${channel.name} restaurado com sucesso.`);
            restoreStatus = "Canal restaurado automaticamente";
            await restoredChannel.send(`🚨 **Ação de Segurança:** Este canal foi deletado por ${perpetratorMember} e restaurado automaticamente.`).catch(() => {});
        } catch (error) {
            console.error(`[ChannelGuardian] ❌ Falha ao restaurar canal #${channel.name}:`, error);
            restoreStatus = "Falha ao restaurar canal (verifique permissões)";
        }

        if (isAuthorizedDeleter(perpetratorMember)) {
            await sendSecurityLog(client, guild, perpetratorMember, channel, false, `Deletou canal (Autorizado). ${restoreStatus}.`);
            return;
        }

        // 🛡️ PUNIÇÃO: Usuário não autorizado
        
        // Antes de remover, vamos verificar se o bot REALMENTE consegue editar os cargos do alvo
        const botHighestRole = guild.members.me.roles.highest;
        const targetHighestRole = perpetratorMember.roles.highest;
        
        if (targetHighestRole.position >= botHighestRole.position) {
            console.error(`[ChannelGuardian] ❌ HIERARQUIA: O bot não pode punir ${executor.tag} porque o cargo dele (${targetHighestRole.name}) é maior ou igual ao do bot (${botHighestRole.name}).`);
            await sendSecurityLog(client, guild, perpetratorMember, channel, true, `Tentativa de punição falhou: Executor tem cargo acima do Bot. ${restoreStatus}.`);
            return;
        }

        // 🔓 BYPASS: Avisa aos outros sistemas de segurança (Role Guardian) para não 
        // devolverem os cargos que vamos remover agora como punição.
        if (!globalThis.__SC_ROLE_BYPASS__) globalThis.__SC_ROLE_BYPASS__ = new Map();
        globalThis.__SC_ROLE_BYPASS__.set(perpetratorMember.id, Date.now() + 15000); 

        // Usuário não autorizado: remover todos os cargos
        const rolesToRemove = perpetratorMember.roles.cache.filter(role => 
            role.id !== guild.id && // Não remove @everyone
            role.editable && // O bot pode remover o cargo
            !EXEMPT_ROLES_FROM_PUNISHMENT.includes(role.id) // Não é um cargo isento
        );

        if (rolesToRemove.size > 0) {
            try {
                await perpetratorMember.roles.remove(rolesToRemove, `Punição: Deletou o canal #${channel.name} sem autorização.`);
                await sendSecurityLog(client, guild, perpetratorMember, channel, true, `Cargos removidos do executor e ${restoreStatus}.`);
                console.log(`[ChannelGuardian] Cargos removidos de ${perpetratorMember.user.tag} por deletar canal sem permissão.`);
            } catch (error) {
                console.error(`[ChannelGuardian] Erro ao remover cargos de ${perpetratorMember.user.tag}:`, error);
                await sendSecurityLog(client, guild, perpetratorMember, channel, true, `Deletou canal sem permissão. Falha ao remover cargos: ${error.message}`);
            }
        } else {
            console.warn(`[ChannelGuardian] ⚠️ Ninguém foi punido pois o executor não possui cargos removíveis.`);
            await sendSecurityLog(client, guild, perpetratorMember, channel, true, 'Deletou canal sem permissão. Nenhum cargo removível encontrado (Hierarquia).');
        }
    });

    console.log('[ChannelGuardian] Guardião de canais instalado com sucesso.');
}