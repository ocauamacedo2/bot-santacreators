// d:\santacreators-main\events\messageGuardian.js
import { EmbedBuilder, AuditLogEvent, PermissionsBitField } from 'discord.js';

// =====================================================
// CONFIGURAÇÃO DO GUARDIÃO DE MENSAGENS DO BOT
// =====================================================

const LOG_CHANNEL_ID = '1507676677927338107'; // Canal de logs de segurança

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

// =====================================================
// CONFIGURAÇÃO DO GUARDIÃO DE CONFIGURAÇÕES DE CANAIS
// =====================================================

const CHANNEL_CONFIG_PROTECTED_ROLES = [
    '1403170838529966140', // c-level
    '1353841582176210944', // coordenação
    '1377127454543708253', // diretoria sg
    '1262690714513571914', // developer
    '1377109308730376202', // diretoria comunidade
];

const CHANNEL_CONFIG_MAX_ATTEMPTS = 3;
const CHANNEL_CONFIG_WINDOW_MS = 60 * 1000;

const channelConfigAttempts = new Map();

function hasProtectedChannelConfigRole(member) {
    if (!member) return false;
    return member.roles.cache.some(role => CHANNEL_CONFIG_PROTECTED_ROLES.includes(role.id));
}

function registerChannelConfigAttempt(memberId) {
    const now = Date.now();
    const current = channelConfigAttempts.get(memberId) || [];

    const recentAttempts = current.filter(timestamp => now - timestamp <= CHANNEL_CONFIG_WINDOW_MS);
    recentAttempts.push(now);

    channelConfigAttempts.set(memberId, recentAttempts);

    return recentAttempts.length;
}

async function punishChannelConfigExecutor(guild, member, reason) {
    const botMember = guild.members.me;
    if (!botMember) return false;

    if (member.roles.highest.position >= botMember.roles.highest.position) {
        return false;
    }

    if (!globalThis.__SC_ROLE_BYPASS__) globalThis.__SC_ROLE_BYPASS__ = new Map();
    globalThis.__SC_ROLE_BYPASS__.set(member.id, Date.now() + 15000);

    const rolesToRemove = member.roles.cache.filter(role =>
        role.id !== guild.id &&
        role.editable &&
        !EXEMPT_FROM_PUNISHMENT.includes(role.id)
    );

    if (rolesToRemove.size <= 0) return false;

    await member.roles.remove(rolesToRemove, reason);
    return true;
}

async function sendChannelConfigLog(client, guild, member, channel, oldChannel, newChannel, attemptCount, punished, restored, reason) {
    const logChannel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    if (!logChannel || !logChannel.isTextBased()) return;

    const embed = new EmbedBuilder()
        .setTitle(punished ? '🚨 Proteção de Canal - PUNIÇÃO' : '⚠️ Proteção de Canal - Alteração Bloqueada')
        .setColor(punished ? '#FF0000' : '#FFA500')
        .setThumbnail(member.user.displayAvatarURL())
        .addFields(
            { name: '🧑 Executor', value: `${member} (\`${member.id}\`)`, inline: false },
            { name: '📌 Canal', value: `${channel} (\`${channel.id}\`)`, inline: false },
            { name: '🔁 Tentativas', value: `${attemptCount}/${CHANNEL_CONFIG_MAX_ATTEMPTS} em 1 minuto`, inline: true },
            { name: '♻️ Configuração restaurada', value: restored ? 'Sim' : 'Não', inline: true },
            { name: '🔒 Punição', value: punished ? 'Cargos removidos' : 'Ainda não punido', inline: true },
            { name: '📝 Motivo', value: reason, inline: false },
            { name: '🕒 Data', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
        )
        .setFooter({ text: 'Sistema de Proteção de Canais • SantaCreators' })
        .setTimestamp();

    await logChannel.send({ embeds: [embed] }).catch(() => {});
}

/**
 * Verifica se o membro tem autorização para apagar mensagens do bot.
 */
function isAuthorized(member) {
    if (!member) return false;

    // 1. Owner e você possuem bypass total
    if (ALLOWED_USERS.includes(member.id)) return true;

    const botMember = member.guild.members.me;
    if (!botMember) return false;

    // 2. Qualquer pessoa com cargo acima ou igual ao cargo mais alto do bot pode apagar
    if (member.roles.highest.position >= botMember.roles.highest.position) {
        return true;
    }

    // 3. Apenas esses cargos podem apagar mensagens do bot
    const hasAllowedRole = member.roles.cache.some(role => ALLOWED_ROLES.includes(role.id));
    if (hasAllowedRole) return true;

    // 4. Qualquer outro cargo abaixo do bot, mesmo com Administrador, NÃO pode apagar
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
    if (!message.guild) return;

    const guild = message.guild;

    const deletedMessageAuthorId = message.author?.id || null;

        // Aguarda o Audit Log processar
        await new Promise(resolve => setTimeout(resolve, 2500));

        let executor = null;
        try {
            const fetchedLogs = await guild.fetchAuditLogs({
    limit: 5,
    type: AuditLogEvent.MessageDelete,
});

const logEntry = fetchedLogs.entries.find(entry => {
    const isRecent = Date.now() - entry.createdTimestamp < 12000;
    const isBotMessage = entry.target?.id === client.user.id || deletedMessageAuthorId === client.user.id;
    const isSameChannel = entry.extra?.channel?.id === message.channel?.id;

    return isRecent && isBotMessage && isSameChannel;
});

if (logEntry) {
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

    client.on('channelUpdate', async (oldChannel, newChannel) => {
        if (!newChannel.guild) return;

        const guild = newChannel.guild;

        await new Promise(resolve => setTimeout(resolve, 2500));

        let executor = null;

        try {
            const fetchedLogs = await guild.fetchAuditLogs({
                limit: 3,
                type: AuditLogEvent.ChannelUpdate,
            });

            const logEntry = fetchedLogs.entries.find(entry =>
                entry.target?.id === newChannel.id &&
                Date.now() - entry.createdTimestamp < 10000
            );

            if (logEntry) {
                executor = logEntry.executor;
            }
        } catch (error) {
            console.error('[MessageGuardian] Erro ao buscar Audit Logs de channelUpdate:', error);
            return;
        }

        if (!executor || executor.bot) return;
        if (ALLOWED_USERS.includes(executor.id)) return;

        const member = await guild.members.fetch(executor.id).catch(() => null);
        if (!member) return;

        const isProtected = hasProtectedChannelConfigRole(member);
        if (!isProtected) return;

        let restored = false;

        try {
            await newChannel.edit({
                name: oldChannel.name,
                topic: oldChannel.topic ?? null,
                nsfw: oldChannel.nsfw ?? false,
                rateLimitPerUser: oldChannel.rateLimitPerUser ?? 0,
                parent: oldChannel.parentId ?? null,
                permissionOverwrites: oldChannel.permissionOverwrites.cache.map(overwrite => ({
                    id: overwrite.id,
                    allow: overwrite.allow.bitfield,
                    deny: overwrite.deny.bitfield,
                    type: overwrite.type,
                })),
            }, `Proteção SantaCreators: ${member.user.tag} não tem autorização para alterar configurações/permissões de canais.`);

            restored = true;
        } catch (error) {
            console.error('[MessageGuardian] Falha ao restaurar configurações do canal:', error);
        }

        const attemptCount = registerChannelConfigAttempt(member.id);

        let punished = false;
        let reason = 'Cargo protegido tentou alterar configurações/permissões de canal. Alteração revertida automaticamente.';

        if (attemptCount >= CHANNEL_CONFIG_MAX_ATTEMPTS) {
            punished = await punishChannelConfigExecutor(
                guild,
                member,
                'Punição: insistiu em alterar configurações/permissões de canais sem autorização.'
            );

            reason = punished
                ? 'Insistiu 3 vezes em menos de 1 minuto. Cargos removidos.'
                : 'Insistiu 3 vezes em menos de 1 minuto, mas o bot não conseguiu remover os cargos por hierarquia/permissão.';
        }

        await sendChannelConfigLog(
            client,
            guild,
            member,
            newChannel,
            oldChannel,
            newChannel,
            attemptCount,
            punished,
            restored,
            reason
        );
    });

    console.log('[MessageGuardian] Guardião de mensagens instalado com sucesso.');
}