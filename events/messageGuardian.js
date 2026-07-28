// d:\santacreators-main\events\messageGuardian.js
import {
    EmbedBuilder,
    AuditLogEvent,
    PermissionsBitField,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from 'discord.js';

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

// Cargos que podem utilizar o botão de restauração
const RESTORE_ALLOWED_ROLE_IDS = [
    '1352407252216184833', // Resp Líder
    '1262262852949905409', // Resp Influ
    '1352408327983861844', // Resp Creators
];

// Usuários com bypass total na restauração
const RESTORE_BYPASS_USER_IDS = [
    '1262262852949905408', // Owner
    '660311795327828008',  // Você
];

// Tempo máximo para aguardar a criação da log profissional
const PROFESSIONAL_LOG_WAIT_ATTEMPTS = 20;
const PROFESSIONAL_LOG_WAIT_INTERVAL_MS = 500;

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
    const hasAllowedRole = member.roles.cache.some(role =>
        ALLOWED_ROLES.includes(role.id)
    );

    if (hasAllowedRole) return true;

    // 4. Qualquer outro cargo abaixo do bot, mesmo com Administrador, NÃO pode apagar
    return false;
}

function truncateGuardianText(value, maxLength = 1000) {
    const normalizedValue = String(value ?? '').trim();

    if (!normalizedValue) {
        return 'Mensagem sem texto visível. O conteúdo pode estar em embed, imagem, arquivo ou botão.';
    }

    if (normalizedValue.length <= maxLength) {
        return normalizedValue;
    }

    return `${normalizedValue.slice(0, maxLength - 3)}...`;
}

function buildDeletedMessageContent(message) {
    const parts = [];

    const messageContent = message.content?.trim();

    if (messageContent) {
        parts.push(messageContent);
    }

    if (message.embeds?.length) {
        for (const embed of message.embeds.slice(0, 3)) {
            if (embed.title) {
                parts.push(`Título do embed: ${embed.title}`);
            }

            if (embed.description) {
                parts.push(`Descrição do embed: ${embed.description}`);
            }

            if (embed.fields?.length) {
                for (const field of embed.fields.slice(0, 10)) {
                    parts.push(`${field.name}: ${field.value}`);
                }
            }
        }
    }

    if (message.attachments?.size) {
        for (const attachment of message.attachments.values()) {
            parts.push(
                `Anexo: ${attachment.name || 'arquivo sem nome'}\n${attachment.url}`
            );
        }
    }

    if (message.components?.length) {
        const componentLabels = [];

        for (const row of message.components) {
            for (const component of row.components ?? []) {
                if (component.label) {
                    componentLabels.push(component.label);
                }
            }
        }

        if (componentLabels.length) {
            parts.push(`Botões encontrados: ${componentLabels.join(', ')}`);
        }
    }

    return truncateGuardianText(
        parts.join('\n\n'),
        1000
    );
}

async function waitForProfessionalDeleteLog(messageId) {
    for (
        let attempt = 0;
        attempt < PROFESSIONAL_LOG_WAIT_ATTEMPTS;
        attempt++
    ) {
        const storedLog =
            globalThis.__SC_DELETED_MESSAGE_LOGS__?.get(messageId);

        if (storedLog?.logMessageUrl) {
            return storedLog;
        }

        await new Promise(resolve =>
            setTimeout(resolve, PROFESSIONAL_LOG_WAIT_INTERVAL_MS)
        );
    }

    return null;
}

function buildRestoreButtonCustomId(punishmentId) {
    return `message_guardian_restore:${punishmentId}`;
}

function getRestoreRole(member) {
    if (!member) return null;

    return member.roles.cache
        .filter(role => RESTORE_ALLOWED_ROLE_IDS.includes(role.id))
        .sort((firstRole, secondRole) =>
            secondRole.position - firstRole.position
        )
        .first() ?? null;
}

function getHighestRemovedRole(guild, removedRoleIds) {
    if (!guild || !Array.isArray(removedRoleIds)) {
        return null;
    }

    return removedRoleIds
        .map(roleId => guild.roles.cache.get(roleId))
        .filter(Boolean)
        .sort((firstRole, secondRole) =>
            secondRole.position - firstRole.position
        )[0] ?? null;
}

function validateRestorePermission({
    guild,
    clickerMember,
    punishedUserId,
    removedRoleIds,
}) {
    if (!guild || !clickerMember) {
        return {
            allowed: false,
            reason: 'Não consegui identificar quem clicou no botão.',
        };
    }

    if (RESTORE_BYPASS_USER_IDS.includes(clickerMember.id)) {
        return {
            allowed: true,
            bypass: true,
        };
    }

    if (clickerMember.id === punishedUserId) {
        return {
            allowed: false,
            reason: 'Você não pode restaurar os seus próprios cargos.',
        };
    }

    const clickerRestoreRole = getRestoreRole(clickerMember);

    if (!clickerRestoreRole) {
        return {
            allowed: false,
            reason:
                'Somente Resp Líder, Resp Influ, Resp Creators, Owner ou Rodney podem utilizar este botão.',
        };
    }

    const highestRemovedRole = getHighestRemovedRole(
        guild,
        removedRoleIds
    );

    if (
        highestRemovedRole &&
        clickerRestoreRole.position <= highestRemovedRole.position
    ) {
        return {
            allowed: false,
            reason:
                `Seu cargo de autorização é ${clickerRestoreRole}, mas o maior cargo removido foi ${highestRemovedRole}. ` +
                'Você somente pode restaurar membros que estavam abaixo de você na hierarquia.',
        };
    }

    return {
        allowed: true,
        bypass: false,
        clickerRestoreRole,
        highestRemovedRole,
    };
}

async function restoreGuardianRoles({
    guild,
    punishmentId,
    restoredByMember,
}) {
    if (!globalThis.__SC_MESSAGE_GUARDIAN_PUNISHMENTS__) {
        globalThis.__SC_MESSAGE_GUARDIAN_PUNISHMENTS__ = new Map();
    }

    const punishment =
        globalThis.__SC_MESSAGE_GUARDIAN_PUNISHMENTS__.get(punishmentId);

    if (!punishment) {
        return {
            ok: false,
            reason:
                'Esta punição não está mais ativa. Os cargos já podem ter sido restaurados.',
        };
    }

    if (punishment.restored) {
        return {
            ok: false,
            reason: 'Os cargos desta punição já foram restaurados.',
        };
    }

    const permissionResult = validateRestorePermission({
        guild,
        clickerMember: restoredByMember,
        punishedUserId: punishment.userId,
        removedRoleIds: punishment.removedRoleIds,
    });

    if (!permissionResult.allowed) {
        return {
            ok: false,
            reason: permissionResult.reason,
        };
    }

    const punishedMember = await guild.members
        .fetch(punishment.userId)
        .catch(() => null);

    if (!punishedMember) {
        return {
            ok: false,
            reason: 'O membro punido não foi encontrado no servidor.',
        };
    }

    const botMember = guild.members.me;

    if (!botMember) {
        return {
            ok: false,
            reason: 'Não consegui localizar o membro do bot no servidor.',
        };
    }

    const rolesToRestore = punishment.removedRoleIds.filter(roleId => {
        const role = guild.roles.cache.get(roleId);

        if (!role) return false;
        if (role.id === guild.id) return false;
        if (role.managed) return false;
        if (!role.editable) return false;

        return role.position < botMember.roles.highest.position;
    });

    punishment.restored = true;
    punishment.restoredAt = Date.now();
    punishment.restoredBy = restoredByMember.id;

    try {
        if (rolesToRestore.length > 0) {
            await punishedMember.roles.add(
                rolesToRestore,
                `Restauração autorizada por ${restoredByMember.user.tag} após punição do MessageGuardian.`
            );
        }

        globalThis.__SC_MESSAGE_GUARDIAN_PUNISHMENTS__.delete(
            punishmentId
        );

        return {
            ok: true,
            punishedMember,
            restoredRolesCount: rolesToRestore.length,
            restoredRoleIds: rolesToRestore,
            punishment,
        };
    } catch (error) {
        punishment.restored = false;
        punishment.restoredAt = null;
        punishment.restoredBy = null;

        return {
            ok: false,
            reason:
                `O Discord recusou a devolução dos cargos: ` +
                `${error?.message || String(error)}`,
        };
    }
}

async function sendSecurityLog(
    client,
    guild,
    perpetrator,
    punished,
    reason,
    options = {}
) {
    const logChannel = await client.channels
        .fetch(LOG_CHANNEL_ID)
        .catch(() => null);

    if (!logChannel || !logChannel.isTextBased()) {
        return null;
    }

    const {
        deletedMessage = null,
        deletedContent = null,
        professionalLog = null,
        punishmentId = null,
        removedRoleIds = [],
        punishmentApplied = punished,
    } = options;

    const deletedChannelId =
        deletedMessage?.channel?.id ??
        professionalLog?.channelId ??
        null;

    const deletedMessageId =
        deletedMessage?.id ??
        professionalLog?.deletedMessageId ??
        null;

    const deletedAuthorId =
        deletedMessage?.author?.id ??
        professionalLog?.deletedMessageAuthorId ??
        null;

    const contentToDisplay = truncateGuardianText(
        deletedContent ??
        professionalLog?.deletedMessageContent ??
        buildDeletedMessageContent(deletedMessage),
        1000
    );

    const professionalLogValue = professionalLog?.logMessageUrl
        ? `[Abrir log profissional completa](${professionalLog.logMessageUrl})\n` +
          `Canal da log: <#${professionalLog.logChannelId}>\n` +
          `ID da log: \`${professionalLog.logMessageId}\``
        : 'A log profissional não foi localizada dentro do tempo de espera.';

    const removedRolesText = removedRoleIds.length > 0
        ? removedRoleIds
            .map(roleId => `<@&${roleId}>`)
            .join(', ')
            .slice(0, 1000)
        : 'Nenhum cargo removível foi encontrado.';

    const embed = new EmbedBuilder()
        .setTitle(
            punishmentApplied
                ? '🚨 Mensagem do Bot Apagada - PUNIÇÃO'
                : '⚠️ Mensagem do Bot Apagada (Autorizado)'
        )
        .setColor(
            punishmentApplied
                ? '#FF0000'
                : '#FFFF00'
        )
        .setThumbnail(perpetrator.user.displayAvatarURL())
        .addFields(
            {
                name: '🧑 Executor',
                value: `${perpetrator} (\`${perpetrator.id}\`)`,
                inline: true,
            },
            {
                name: '🔒 Status',
                value: punishmentApplied
                    ? 'Cargos Removidos'
                    : 'Ação Permitida',
                inline: true,
            },
            {
                name: '👤 Autor da mensagem apagada',
                value: deletedAuthorId
                    ? `<@${deletedAuthorId}> (\`${deletedAuthorId}\`)`
                    : 'Autor não identificado.',
                inline: false,
            },
            {
                name: '📍 Local da mensagem',
                value:
                    `${deletedChannelId ? `<#${deletedChannelId}>` : 'Canal não identificado'}\n` +
                    `ID da mensagem: \`${deletedMessageId || 'Não identificado'}\``,
                inline: false,
            },
            {
                name: '💬 Conteúdo que foi apagado',
                value: `\`\`\`\n${contentToDisplay}\n\`\`\``,
                inline: false,
            },
            {
                name: '🔗 Log profissional ligada a esta punição',
                value: professionalLogValue,
                inline: false,
            },
            {
                name: punishmentApplied
                    ? '📦 Cargos removidos'
                    : '📦 Cargos afetados',
                value: punishmentApplied
                    ? removedRolesText
                    : 'Nenhum cargo foi removido.',
                inline: false,
            },
            {
                name: '📝 Motivo',
                value: reason,
                inline: false,
            },
            {
                name: '🕒 Data',
                value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
                inline: false,
            }
        )
        .setFooter({
            text:
                'Sistema de Proteção de Mensagens • SantaCreators',
        })
        .setTimestamp();

    const components = [];

    if (
        punishmentApplied &&
        punishmentId &&
        removedRoleIds.length > 0
    ) {
        const restoreRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(
                    buildRestoreButtonCustomId(punishmentId)
                )
                .setLabel('Restaurar cargos')
                .setEmoji('🔓')
                .setStyle(ButtonStyle.Success)
        );

        components.push(restoreRow);
    }

    return await logChannel.send({
        embeds: [embed],
        components,
    }).catch(error => {
        console.error(
            '[MessageGuardian] Falha ao enviar log de segurança:',
            error
        );

        return null;
    });
}

export async function installMessageGuardian(client) {
    if (!client.__messageGuardianRestoreHandlerInstalled) {
        client.__messageGuardianRestoreHandlerInstalled = true;

        client.on('interactionCreate', async interaction => {
            try {
                if (!interaction.isButton()) return;

                if (
                    !interaction.customId?.startsWith(
                        'message_guardian_restore:'
                    )
                ) {
                    return;
                }

                const punishmentId = interaction.customId.slice(
                    'message_guardian_restore:'.length
                );

                if (!punishmentId) {
                    await interaction.reply({
                        content:
                            '❌ Não consegui identificar esta punição.',
                        ephemeral: true,
                    }).catch(() => {});

                    return;
                }

                if (!interaction.guild) {
                    await interaction.reply({
                        content:
                            '❌ Este botão somente funciona dentro do servidor.',
                        ephemeral: true,
                    }).catch(() => {});

                    return;
                }

                const restoredByMember = await interaction.guild.members
                    .fetch(interaction.user.id)
                    .catch(() => null);

                if (!restoredByMember) {
                    await interaction.reply({
                        content:
                            '❌ Não consegui identificar os seus cargos no servidor.',
                        ephemeral: true,
                    }).catch(() => {});

                    return;
                }

                const result = await restoreGuardianRoles({
                    guild: interaction.guild,
                    punishmentId,
                    restoredByMember,
                });

                if (!result.ok) {
                    await interaction.reply({
                        content: `🚫 ${result.reason}`,
                        ephemeral: true,
                    }).catch(() => {});

                    return;
                }

                const disabledRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(
                                buildRestoreButtonCustomId(
                                    punishmentId
                                )
                            )
                            .setLabel('Cargos restaurados')
                            .setEmoji('✅')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(true)
                    );

                const originalEmbed =
                    interaction.message.embeds?.[0] ?? null;

                const updatedEmbeds = interaction.message.embeds.map(
                    embed => new EmbedBuilder(embed.toJSON())
                );

                if (originalEmbed && updatedEmbeds.length > 0) {
                    updatedEmbeds[0]
                        .setColor('#57F287')
                        .setTitle(
                            '✅ Cargos Restaurados - PUNIÇÃO ENCERRADA'
                        )
                        .addFields({
                            name: '🔓 Restauração concluída',
                            value:
                                `**Membro restaurado:** ${result.punishedMember}\n` +
                                `**Restaurado por:** ${restoredByMember}\n` +
                                `**Responsável:** \`${restoredByMember.user.tag}\`\n` +
                                `**Cargos devolvidos:** ${result.restoredRolesCount}\n` +
                                `**Data:** <t:${Math.floor(Date.now() / 1000)}:F>`,
                            inline: false,
                        });
                }

                await interaction.update({
                    embeds:
                        updatedEmbeds.length > 0
                            ? updatedEmbeds
                            : interaction.message.embeds,
                    components: [disabledRow],
                });

                const restoredRolesText =
                    result.restoredRoleIds.length > 0
                        ? result.restoredRoleIds
                            .map(roleId => `<@&${roleId}>`)
                            .join(', ')
                            .slice(0, 1000)
                        : 'Nenhum cargo estava disponível para devolução.';

                const restorationEmbed = new EmbedBuilder()
                    .setTitle(
                        '🔓 Restauração de cargos concluída'
                    )
                    .setColor('#57F287')
                    .setThumbnail(
                        result.punishedMember.user.displayAvatarURL()
                    )
                    .addFields(
                        {
                            name: '👤 Membro restaurado',
                            value:
                                `${result.punishedMember} ` +
                                `(\`${result.punishedMember.id}\`)`,
                            inline: false,
                        },
                        {
                            name: '🧑 Restaurado por',
                            value:
                                `${restoredByMember} ` +
                                `(\`${restoredByMember.id}\`)`,
                            inline: false,
                        },
                        {
                            name: '📦 Cargos devolvidos',
                            value: restoredRolesText,
                            inline: false,
                        },
                        {
                            name: '🕒 Data',
                            value:
                                `<t:${Math.floor(Date.now() / 1000)}:F>`,
                            inline: false,
                        }
                    )
                    .setFooter({
                        text:
                            'Sistema de Proteção de Mensagens • SantaCreators',
                    })
                    .setTimestamp();

                const logChannel = await client.channels
                    .fetch(LOG_CHANNEL_ID)
                    .catch(() => null);

                if (logChannel?.isTextBased()) {
                    await logChannel.send({
                        embeds: [restorationEmbed],
                    }).catch(error => {
                        console.error(
                            '[MessageGuardian] Falha ao enviar a log da restauração:',
                            error
                        );
                    });
                }
            } catch (error) {
                console.error(
                    '[MessageGuardian] Erro no botão de restauração:',
                    error
                );

                if (
                    !interaction.replied &&
                    !interaction.deferred
                ) {
                    await interaction.reply({
                        content:
                            '❌ Ocorreu um erro inesperado ao tentar restaurar os cargos.',
                        ephemeral: true,
                    }).catch(() => {});
                }
            }
        });
    }

    client.on('messageDelete', async (message) => {
        if (!message.guild) return;

        const guild = message.guild;

        const deletedMessageAuthorId =
            message.author?.id || null;

        const deletedContent =
            buildDeletedMessageContent(message);

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
    const professionalLog = await waitForProfessionalDeleteLog(
        message.id
    );

    await sendSecurityLog(
        client,
        guild,
        perpetratorMember,
        false,
        'Apagou mensagem do bot, mas possui autorização.',
        {
            deletedMessage: message,
            deletedContent,
            professionalLog,
            punishmentApplied: false,
        }
    );

    return;
}

        // 2. Punição (Remoção de cargos)
        
        // Hierarquia: O bot não pode punir quem tem cargo maior ou igual ao dele
const botHighestRole = guild.members.me.roles.highest;

if (
    perpetratorMember.roles.highest.position >=
    botHighestRole.position
) {
    const professionalLog = await waitForProfessionalDeleteLog(
        message.id
    );

    await sendSecurityLog(
        client,
        guild,
        perpetratorMember,
        false,
        'Tentativa de punição falhou: o infrator possui cargo superior ou igual ao cargo mais alto do bot.',
        {
            deletedMessage: message,
            deletedContent,
            professionalLog,
            punishmentApplied: false,
        }
    );

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
    const removedRoleIds = rolesToRemove.map(role => role.id);

    const punishmentId =
        `${guild.id}_${perpetratorMember.id}_${message.id}_${Date.now()}`;

    if (!globalThis.__SC_MESSAGE_GUARDIAN_PUNISHMENTS__) {
        globalThis.__SC_MESSAGE_GUARDIAN_PUNISHMENTS__ = new Map();
    }

    globalThis.__SC_MESSAGE_GUARDIAN_PUNISHMENTS__.set(
        punishmentId,
        {
            punishmentId,
            guildId: guild.id,
            userId: perpetratorMember.id,
            deletedMessageId: message.id,
            deletedChannelId: message.channel?.id ?? null,
            removedRoleIds,
            appliedAt: Date.now(),
            restored: false,
            restoredAt: null,
            restoredBy: null,
        }
    );

    try {
        await perpetratorMember.roles.remove(
            rolesToRemove,
            'Punição: apagou mensagem do bot sem autorização.'
        );

        await perpetratorMember.send({
            content:
                `⚠️ **Aviso de Segurança:** Seus cargos foram removidos em **${guild.name}** ` +
                'porque você apagou uma mensagem oficial do sistema sem autorização. ' +
                'Reclamações devem ser feitas com a diretoria.',
        }).catch(() => {});

        const professionalLog = await waitForProfessionalDeleteLog(
            message.id
        );

        const securityLogMessage = await sendSecurityLog(
            client,
            guild,
            perpetratorMember,
            true,
            'Cargos removidos por apagar mensagem do bot sem autorização.',
            {
                deletedMessage: message,
                deletedContent,
                professionalLog,
                punishmentId,
                removedRoleIds,
                punishmentApplied: true,
            }
        );

        const punishment =
            globalThis.__SC_MESSAGE_GUARDIAN_PUNISHMENTS__.get(
                punishmentId
            );

        if (punishment && securityLogMessage) {
            punishment.securityLogChannelId =
                securityLogMessage.channelId;

            punishment.securityLogMessageId =
                securityLogMessage.id;
        }
    } catch (err) {
        globalThis.__SC_MESSAGE_GUARDIAN_PUNISHMENTS__.delete(
            punishmentId
        );

        console.error(
            '[MessageGuardian] Falha ao remover cargos:',
            err
        );
    }
} else {
    const professionalLog = await waitForProfessionalDeleteLog(
        message.id
    );

    await sendSecurityLog(
        client,
        guild,
        perpetratorMember,
        false,
        'O infrator não possui cargos removíveis pelo bot.',
        {
            deletedMessage: message,
            deletedContent,
            professionalLog,
            punishmentApplied: false,
        }
    );
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