// d:\santacreators-main\events\messageGuardian.js
import { EmbedBuilder, AuditLogEvent, PermissionsBitField } from 'discord.js';

// =====================================================
// CONFIGURAÇÃO DO GUARDIÃO DE MENSAGENS DO BOT
// =====================================================

const LOG_CHANNEL_ID = '1486006908056899748'; // Canal de logs de segurança

// Usuários isentos (Bypass total)
const ALLOWED_USERS = [
    '1262262852949905408', // Owner
    '660311795327828008',  // Você
];

// Cargos autorizados a apagar mensagens do bot
const ALLOWED_ROLES = [
    '1262262852949905409', // Resp Influ
    '1352408327983861844', // Resp Creators
    '1352407252216184833', // Resp Líder
];

// ID do cargo limite (Ninguém abaixo deste pode apagar, exceto se estiver na whitelist acima)
const THRESHOLD_ROLE_ID = '1352275728476930099'; // SantaCreators

// Cargos que NUNCA devem ser removidos (Ex: Interação BOT)
const EXEMPT_FROM_PUNISHMENT = [
    '1352493359897378941',
];

/**
 * Verifica se o membro tem autorização para apagar mensagens do bot.
 */
function isAuthorized(member) {
    if (!member) return false;
    if (ALLOWED_USERS.includes(member.id)) return true;

    // Se tiver um dos cargos da whitelist, está liberado
    const hasWhitelistedRole = member.roles.cache.some(role => ALLOWED_ROLES.includes(role.id));
    if (hasWhitelistedRole) return true;

    // Verifica se está acima do cargo SantaCreators (Threshold)
    // Se não tiver um cargo superior ao threshold, assume-se que não é autorizado 
    // (a menos que já tenha passado na checagem de whitelist acima)
    const thresholdRole = member.guild.roles.cache.get(THRESHOLD_ROLE_ID);
    if (thresholdRole && member.roles.highest.position < thresholdRole.position) {
        return false;
    }

    // Se chegou aqui e não está na whitelist, mesmo sendo "admin" ou acima do threshold, 
    // a regra diz que não pode apagar (conforme seu pedido).
    return false;
}

async function sendSecurityLog(client, guild, perpetrator, punished, reason) {
    const logChannel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    if (!logChannel || !logChannel.isTextBased()) return;

    const embed = new EmbedBuilder()
        .setTitle(punished ? '🚨 Mensagem do Bot Apagada - PUNIÇÃO' : '⚠️ Mensagem do Bot Apagada (Autorizado)')
        .setColor(punished ? '#FF0000' : '#FFFF00')
        .setThumbnail(perpetrator.user.displayAvatarURL())
        .addFields(
            { name: '🧑 Executor', value: `${perpetrator} (\`${perpetrator.id}\`)`, inline: true },
            { name: '🔒 Status', value: punished ? 'Cargos Removidos' : 'Ação Permitida', inline: true },
            { name: '📝 Motivo', value: reason, inline: false },
            { name: '🕒 Data', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
        )
        .setFooter({ text: 'Sistema de Proteção de Mensagens • SantaCreators' })
        .setTimestamp();

    await logChannel.send({ embeds: [embed] }).catch(() => {});
}

export async function installMessageGuardian(client) {
    client.on('messageDelete', async (message) => {
        // Só nos interessa se a mensagem deletada for do próprio bot
        if (!message.author || message.author.id !== client.user.id) return;
        if (!message.guild) return;

        const guild = message.guild;

        // Aguarda o Audit Log processar
        await new Promise(resolve => setTimeout(resolve, 2500));

        let executor = null;
        try {
            const fetchedLogs = await guild.fetchAuditLogs({
                limit: 1,
                type: AuditLogEvent.MessageDelete,
            });
            const logEntry = fetchedLogs.entries.first();

            // Verifica se o log condiz com a deleção (alvo bot e canal correto)
            if (logEntry && logEntry.target.id === client.user.id && Date.now() - logEntry.createdTimestamp < 8000) {
                executor = logEntry.executor;
            }
        } catch (error) {
            console.error('[MessageGuardian] Erro ao buscar Audit Logs:', error);
        }

        if (!executor || executor.bot) return;

        const perpetratorMember = await guild.members.fetch(executor.id).catch(() => null);
        if (!perpetratorMember) return;

        // 1. Checagem de autorização
        if (isAuthorized(perpetratorMember)) {
            await sendSecurityLog(client, guild, perpetratorMember, false, 'Apagou mensagem do bot (Usuário Autorizado).');
            return;
        }

        // 2. Punição (Remoção de cargos)
        
        // Hierarquia: O bot não pode punir quem tem cargo maior ou igual ao dele
        const botHighestRole = guild.members.me.roles.highest;
        if (perpetratorMember.roles.highest.position >= botHighestRole.position) {
            await sendSecurityLog(client, guild, perpetratorMember, true, 'Tentativa de punição falhou: Infrator tem cargo superior ao Bot.');
            return;
        }

        // Aplica bypass para o Role Guardian não devolver os cargos imediatamente
        if (!globalThis.__SC_ROLE_BYPASS__) globalThis.__SC_ROLE_BYPASS__ = new Map();
        globalThis.__SC_ROLE_BYPASS__.set(perpetratorMember.id, Date.now() + 15000);

        const rolesToRemove = perpetratorMember.roles.cache.filter(role => 
            role.id !== guild.id && // Não remove @everyone
            role.editable && // Bot consegue editar
            !EXEMPT_FROM_PUNISHMENT.includes(role.id)
        );

        if (rolesToRemove.size > 0) {
            try {
                await perpetratorMember.roles.remove(rolesToRemove, 'Punição: Apagou mensagem do Bot sem autorização.');
                
                // Envia DM ao infrator
                await perpetratorMember.send({
                    content: `⚠️ **Aviso de Segurança:** Seus cargos foram removidos em **${guild.name}** porque você apagou uma mensagem oficial do sistema sem autorização. Reclamações devem ser feitas com a diretoria.`
                }).catch(() => {});

                await sendSecurityLog(client, guild, perpetratorMember, true, 'Cargos removidos por apagar mensagem do bot.');
            } catch (err) {
                console.error('[MessageGuardian] Falha ao remover cargos:', err);
            }
        } else {
            await sendSecurityLog(client, guild, perpetratorMember, true, 'Infrator não possui cargos removíveis pelo bot.');
        }
    });

    // ✅ NOVO: Proteção adicional contra deleção em massa (Bulk Delete)
    client.on('messageDeleteBulk', async (messages) => {
        const firstMsg = messages.first();
        if (!firstMsg || !firstMsg.guild) return;
        
        // Se houver mensagens do bot no meio do bulk delete
        const botMessages = messages.filter(m => m.author?.id === client.user.id);
        if (botMessages.size === 0) return;

        await new Promise(resolve => setTimeout(resolve, 3000));
        const guild = firstMsg.guild;

        try {
            const fetchedLogs = await guild.fetchAuditLogs({
                limit: 1,
                type: AuditLogEvent.MessageBulkDelete,
            });
            const logEntry = fetchedLogs.entries.first();
            if (!logEntry || Date.now() - logEntry.createdTimestamp > 10000) return;

            const executor = logEntry.executor;
            if (!executor || executor.bot) return;

            const member = await guild.members.fetch(executor.id).catch(() => null);
            if (!member || isAuthorized(member)) return;

            // Punição por Bulk Delete
            const rolesToRemove = member.roles.cache.filter(r => r.id !== guild.id && r.editable && !EXEMPT_FROM_PUNISHMENT.includes(r.id));
            if (rolesToRemove.size > 0) {
                if (!globalThis.__SC_ROLE_BYPASS__) globalThis.__SC_ROLE_BYPASS__ = new Map();
                globalThis.__SC_ROLE_BYPASS__.set(member.id, Date.now() + 15000);
                
                await member.roles.remove(rolesToRemove, 'Punição: Bulk Delete envolvendo mensagens do Bot.');
                await sendSecurityLog(client, guild, member, true, `Cargos removidos por apagar ${botMessages.size} mensagens do bot via Bulk Delete.`);
            }
        } catch (e) {
            console.error('[MessageGuardian] Erro no bulk delete handler:', e);
        }
    });

    console.log('[MessageGuardian] Guardião de mensagens instalado com sucesso.');
}