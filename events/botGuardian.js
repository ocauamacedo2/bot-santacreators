// d:\santacreators-main\events\botGuardian.js
import { EmbedBuilder, AuditLogEvent, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField } from 'discord.js';

// ================= CONFIG =================
const LOG_CHANNEL_ID = '1377900084293009418';

// Cargos que podem adicionar bots.
const ADMIN_ROLE_IDS = [
    '1262262852949905408', // Owner (cargo)
    '1352367267547058319', // ADM
    '1352407252216184833', // Resp Lider
    '1352408327983861844', // Resp Creator
    '1262262852949905409', // Resp Influ
    '1414651836861907006', // Responsáveis
];

// Usuários que sempre podem adicionar bots, independente do cargo.
const ADMIN_USER_IDS = [
    '660311795327828008', // Você
];
// ==========================================

/**
 * Verifica se um membro tem permissão para adicionar bots.
 * @param {import('discord.js').GuildMember} member O membro que adicionou o bot.
 * @returns {boolean}
 */
function hasBotAddPermission(member) {
    if (!member) return false;
    if (ADMIN_USER_IDS.includes(member.id)) return true;
    if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
    return member.roles.cache.some(role => ADMIN_ROLE_IDS.includes(role.id));
}

/**
 * Cria o embed de log para a adição de bot.
 * @param {{botMember: import('discord.js').GuildMember, executor: import('discord.js').User, allowed: boolean, inviteURL: string | null}} data
 * @returns {EmbedBuilder}
 */
function createLogEmbed({ botMember, executor, allowed, inviteURL }) {
    const botUser = botMember.user;
    const embed = new EmbedBuilder()
        .setAuthor({ name: executor.tag, iconURL: executor.displayAvatarURL() })
        .setThumbnail(botUser.displayAvatarURL())
        .setTimestamp();

    if (allowed) {
        embed
            .setTitle('✅ Adição de Bot Permitida')
            .setColor('Green')
            .setDescription(`O bot **${botUser.tag}** foi adicionado ao servidor por um administrador.`);
    } else {
        embed
            .setTitle('❌ Adição de Bot Bloqueada')
            .setColor('Red')
            .setDescription(`O bot **${botUser.tag}** foi **expulso** por ter sido adicionado por um usuário não autorizado.`);
    }

    embed.addFields(
        { name: '🤖 Bot', value: `${botUser} (\`${botUser.id}\`)`, inline: true },
        { name: '👤 Adicionado por', value: `${executor} (\`${executor.id}\`)`, inline: true },
        { name: '🔗 Link de Convite', value: inviteURL ? `Clique aqui` : 'Não foi possível obter o link.', inline: false },
        { name: '🕒 Data/Hora', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
    );

    return embed;
}

/**
 * Envia o log para o canal configurado.
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').Guild} guild
 * @param {EmbedBuilder} embed
 * @param {import('discord.js').User} executor
 */
async function sendLog(client, guild, embed, executor) {
    try {
        const logChannel = LOG_CHANNEL_ID ? await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null) : null;
        if (!logChannel || !logChannel.isTextBased()) {
            console.error(`[BotGuardian] Canal de log ${LOG_CHANNEL_ID} não encontrado ou não é de texto.`);
            return;
        }

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Ver Perfil do Usuário')
                .setStyle(ButtonStyle.Link)
                .setURL(`https://discord.com/users/${executor.id}`)
        );

        await logChannel.send({ embeds: [embed], components: [row] });
    } catch (error) {
        console.error('[BotGuardian] Erro ao enviar log:', error);
    }
}

/**
 * Função principal que lida com a adição de novos membros.
 * @param {import('discord.js').GuildMember} member
 */
async function handleBotAdded(member) {
    if (!member.user.bot || !member.guild) return;

    const guild = member.guild;
    const client = member.client;

    await new Promise(resolve => setTimeout(resolve, 1500));

    let executor = null;
    let inviteURL = null;

    try {
        const fetchedLogs = await guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 5 });
        const botAddLog = fetchedLogs.entries.find(entry => entry.target.id === member.id);

        if (botAddLog) {
            executor = botAddLog.executor;
            if (botAddLog.extra?.invite?.url) inviteURL = botAddLog.extra.invite.url;
        }
    } catch (error) {
        console.error('[BotGuardian] Erro ao buscar logs de auditoria:', error);
    }

    if (!executor) {
        await member.kick('Não foi possível verificar o autor da adição. Expulso por segurança.').catch(err => console.error(`[BotGuardian] Falha ao expulsar bot sem executor: ${err}`));
        const embed = new EmbedBuilder().setTitle('⚠️ Adição de Bot Bloqueada (Executor Desconhecido)').setColor('Orange').setDescription(`O bot **${member.user.tag}** foi **expulso** porque não foi possível identificar quem o adicionou.`).addFields({ name: '🤖 Bot', value: `${member.user} (\`${member.user.id}\`)` }, { name: '🕒 Data/Hora', value: `<t:${Math.floor(Date.now() / 1000)}:F>` });
        const logChannel = LOG_CHANNEL_ID ? await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null) : null;
        if (logChannel) await logChannel.send({ embeds: [embed] });
        return;
    }

    const executorMember = await guild.members.fetch(executor.id).catch(() => null);
    const isAllowed = hasBotAddPermission(executorMember);

    const logEmbed = createLogEmbed({ botMember: member, executor, allowed: isAllowed, inviteURL });
    await sendLog(client, guild, logEmbed, executor);

    if (!isAllowed) {
        await member.kick(`Adicionado por ${executor.tag}, que não tem permissão.`).catch(err => console.error(`[BotGuardian] Falha ao expulsar o bot ${member.user.tag}:`, err));
    }
}

/**
 * Instala o listener de eventos no cliente.
 * @param {import('discord.js').Client} client
 */
export function installBotGuardian(client) {
    client.on('guildMemberAdd', handleBotAdded);
    console.log('[BotGuardian] Guardião de bots instalado com sucesso.');
}