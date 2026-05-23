// d:\santacreators-main\events\serverConfigGuardian.js
import { EmbedBuilder, AuditLogEvent } from 'discord.js';

// =====================================================
// CONFIGURAÇÃO DO GUARDIÃO DE CONFIGURAÇÕES (SERVER)
// =====================================================

const LOG_CHANNEL_ID = '1378206851467972778';

// Cargos proibidos de alterar qualquer configuração de canal ou cargo
const FORBIDDEN_CHANGER_ROLES = [
    '1403170838529966140', // c- level
    '1353841582176210944', // coordenação
    '1377127454543708253', // diretoria sg
    '1262690714513571914', // developer
    '1377109308730376202'  // diretoria comunidade
];

// Usuários com bypass total
const BYPASS_USERS = [
    '1262262852949905408', // Owner
    '660311795327828008',  // Você
];

// Cargos que NUNCA devem ser removidos na punição
const EXEMPT_FROM_PUNISHMENT = [
    '1352493359897378941', // Interação BOT
];

const violationTracker = new Map(); // userId -> { count, firstTime }

async function sendSecurityLog(client, guild, perpetrator, type, target, punished, reason) {
    const logChannel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    if (!logChannel || !logChannel.isTextBased()) return;

    const embed = new EmbedBuilder()
        .setTitle(punished ? '🚨 PUNIÇÃO: Abuso de Configurações' : '⚠️ Alteração Bloqueada e Revertida')
        .setColor(punished ? '#FF0000' : '#FFA500')
        .setThumbnail(perpetrator.user.displayAvatarURL())
        .addFields(
            { name: '🧑 Executor', value: `${perpetrator} (\`${perpetrator.id}\`)`, inline: true },
            { name: '📂 Alvo', value: `${target.name || 'Alvo'} (\`${target.id}\`)`, inline: true },
            { name: '🛠️ Tipo', value: type, inline: true },
            { name: '🔒 Status', value: punished ? 'Cargos Removidos' : 'Ação Revertida', inline: true },
            { name: '📝 Motivo', value: reason, inline: false }
        )
        .setFooter({ text: 'Sistema de Segurança SantaCreators' })
        .setTimestamp();

    await logChannel.send({ embeds: [embed] }).catch(() => {});
}

async function punishMember(member, guild, reason) {
    // Impede que o Role Guardian devolva os cargos durante a punição
    if (!globalThis.__SC_ROLE_BYPASS__) globalThis.__SC_ROLE_BYPASS__ = new Map();
    globalThis.__SC_ROLE_BYPASS__.set(member.id, Date.now() + 20000);

    const rolesToRemove = member.roles.cache.filter(role => 
        role.id !== guild.id && 
        role.editable && 
        !EXEMPT_FROM_PUNISHMENT.includes(role.id)
    );

    if (rolesToRemove.size > 0) {
        await member.roles.remove(rolesToRemove, reason).catch(() => {});
        return true;
    }
    return false;
}

async function findChannelConfigExecutor(guild, channelId) {
    const auditTypes = [
        AuditLogEvent.ChannelUpdate,
        AuditLogEvent.ChannelOverwriteCreate,
        AuditLogEvent.ChannelOverwriteUpdate,
        AuditLogEvent.ChannelOverwriteDelete,
    ];

    for (const type of auditTypes) {
        const fetchedLogs = await guild.fetchAuditLogs({ limit: 5, type }).catch(() => null);
        if (!fetchedLogs) continue;

        const logEntry = fetchedLogs.entries.find(entry =>
            entry.target?.id === channelId &&
            Date.now() - entry.createdTimestamp < 15000
        );

        if (logEntry) return logEntry;
    }

    return null;
}

function buildChannelRestoreData(oldChannel) {
    const data = {
        name: oldChannel.name,
        parent: oldChannel.parentId ?? null,
        permissionOverwrites: oldChannel.permissionOverwrites.cache.map(overwrite => ({
            id: overwrite.id,
            allow: overwrite.allow.bitfield,
            deny: overwrite.deny.bitfield,
            type: overwrite.type,
        })),
    };

    if ('topic' in oldChannel) data.topic = oldChannel.topic ?? null;
    if ('nsfw' in oldChannel) data.nsfw = oldChannel.nsfw ?? false;
    if ('rateLimitPerUser' in oldChannel) data.rateLimitPerUser = oldChannel.rateLimitPerUser ?? 0;
    if ('bitrate' in oldChannel) data.bitrate = oldChannel.bitrate;
    if ('userLimit' in oldChannel) data.userLimit = oldChannel.userLimit;

    return data;
}

export async function installServerConfigGuardian(client) {
    // --- Proteção de Canais ---
    client.on('channelUpdate', async (oldChannel, newChannel) => {
        if (!newChannel.guild) return;
        const guild = newChannel.guild;

        await new Promise(r => setTimeout(r, 2000));

        try {
            const logEntry = await findChannelConfigExecutor(guild, newChannel.id);
if (!logEntry || logEntry.executor?.bot) return;
            if (BYPASS_USERS.includes(logEntry.executor.id)) return;

            const member = await guild.members.fetch(logEntry.executor.id).catch(() => null);
            if (!member || !member.roles.cache.some(r => FORBIDDEN_CHANGER_ROLES.includes(r.id))) return;

            // Reverte Propriedades e Overwrites (Permissões)
await newChannel.edit(
    buildChannelRestoreData(oldChannel),
    'Proteção: Alteração de configuração/permissão de canal por cargo não autorizado.'
).catch((error) => {
    console.error('[ServerConfigGuardian] Falha ao reverter canal:', error);
});

            const now = Date.now();
            const data = violationTracker.get(member.id) || { count: 0, firstTime: now };
            if (now - data.firstTime > 60000) { data.count = 1; data.firstTime = now; }
            else data.count++;
            violationTracker.set(member.id, data);

            if (data.count >= 3) {
                const did = await punishMember(member, guild, 'Punição: Alteração repetida de configurações de canais.');
                await sendSecurityLog(client, guild, member, 'Config Canal', newChannel, did, 'Punido por insistir em alterar canais.');
                violationTracker.delete(member.id);
            } else {
                await sendSecurityLog(client, guild, member, 'Config Canal', newChannel, false, `Tentativa ${data.count}/3: Alteração bloqueada e revertida.`);
            }
        } catch (err) { console.error('[ServerConfigGuardian] Erro no canal:', err); }
    });

    // --- Proteção de Cargos ---
    client.on('roleUpdate', async (oldRole, newRole) => {
        if (!newRole.guild) return;
        const guild = newRole.guild;

        await new Promise(r => setTimeout(r, 2000));

        try {
            const fetchedLogs = await guild.fetchAuditLogs({ limit: 5, type: AuditLogEvent.RoleUpdate }).catch(() => null);
            if (!fetchedLogs) return;

            const logEntry = fetchedLogs.entries.find(e => e.target.id === newRole.id && Date.now() - e.createdTimestamp < 10000);
            if (!logEntry || logEntry.executor.bot) return;
            if (BYPASS_USERS.includes(logEntry.executor.id)) return;

            const member = await guild.members.fetch(logEntry.executor.id).catch(() => null);
            if (!member || !member.roles.cache.some(r => FORBIDDEN_CHANGER_ROLES.includes(r.id))) return;

            // Reverte Cargo
            await newRole.edit({
                name: oldRole.name,
                color: oldRole.color,
                hoist: oldRole.hoist,
                mentionable: oldRole.mentionable,
                permissions: oldRole.permissions,
                reason: 'Proteção: Alteração de configuração de cargo por cargo não autorizado.'
            }).catch(() => {});

            const now = Date.now();
            const data = violationTracker.get(member.id) || { count: 0, firstTime: now };
            if (now - data.firstTime > 60000) { data.count = 1; data.firstTime = now; }
            else data.count++;
            violationTracker.set(member.id, data);

            if (data.count >= 3) {
                const did = await punishMember(member, guild, 'Punição: Alteração repetida de configurações de cargos.');
                await sendSecurityLog(client, guild, member, 'Config Cargo', newRole, did, 'Punido por insistir em alterar cargos.');
                violationTracker.delete(member.id);
            } else {
                await sendSecurityLog(client, guild, member, 'Config Cargo', newRole, false, `Tentativa ${data.count}/3: Alteração bloqueada e revertida.`);
            }
        } catch (err) { console.error('[ServerConfigGuardian] Erro no cargo:', err); }
    });

    console.log('[ServerConfigGuardian] Instalado com sucesso.');
}
