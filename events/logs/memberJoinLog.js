import { EmbedBuilder, Events, Collection, ChannelType } from 'discord.js';

// Cache para os convites
const invites = new Collection();

// Canal de logs de entrada/saída
const LOG_CHANNEL_ID = '1377747538433806417';

/**
 * Inicializa o cache de convites quando o bot fica pronto.
 * @param {import('discord.js').Client} client
 */
async function initInviteCache(client) {
    try {
        // Espera o cliente estar pronto
        await client.guilds.fetch();
        for (const guild of client.guilds.cache.values()) {
            try {
                const fetchedInvites = await guild.invites.fetch();
                invites.set(guild.id, new Collection(fetchedInvites.map((invite) => [invite.code, invite.uses])));
            } catch (err) {
                console.error(`[InviteTracker] Falha ao carregar convites para o servidor ${guild.name}:`, err);
            }
        }
        console.log('[InviteTracker] Cache de convites inicializado.');
    } catch (err) {
        console.error('[InviteTracker] Erro ao inicializar cache de convites:', err);
    }
}

/**
 * Lida com a criação de um novo convite.
 * @param {import('discord.js').Invite} invite
 */
function handleInviteCreate(invite) {
    const guildInvites = invites.get(invite.guild.id);
    if (guildInvites) {
        guildInvites.set(invite.code, invite.uses);
    }
}

/**
 * Lida com a exclusão de um convite.
 * @param {import('discord.js').Invite} invite
 */
function handleInviteDelete(invite) {
    const guildInvites = invites.get(invite.guild.id);
    if (guildInvites) {
        guildInvites.delete(invite.code);
    }
}

/**
 * Função principal executada quando um membro entra.
 * @param {import('discord.js').GuildMember} member
 */
async function execute(member) {
    const { guild, user } = member;
    if (user.bot) return;

    try {
        const cachedInvites = invites.get(guild.id);
        const newInvites = await guild.invites.fetch();

        // Encontra o convite que foi usado
        const usedInvite = newInvites.find(inv => {
            const cachedUses = cachedInvites?.get(inv.code) ?? 0;
            return inv.uses > cachedUses;
        });

        // Atualiza o cache com os novos usos
        invites.set(guild.id, new Collection(newInvites.map((invite) => [invite.code, invite.uses])));

        const logChannel = LOG_CHANNEL_ID ? await guild.channels.fetch(LOG_CHANNEL_ID).catch(() => null) : null;
        if (!logChannel || !logChannel.isTextBased()) return;

        const embed = new EmbedBuilder()
            .setColor('#2ecc71')
            .setAuthor({ name: 'Novo Membro Entrou', iconURL: guild.iconURL({ dynamic: true }) })
            .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
            .setDescription(`${user} (**${user.tag}**) entrou no servidor.`)
            .addFields(
                { name: '👤 Usuário', value: `<@${user.id}>\n\`${user.id}\``, inline: true },
                { name: '📅 Conta Criada', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
                { name: '📊 Total de Membros', value: `\`${guild.memberCount}\``, inline: true }
            )
            .setFooter({ text: `Servidor: ${guild.name}` })
            .setTimestamp();

        if (usedInvite) {
            const inviter = usedInvite.inviter;
            embed.addFields(
                { name: '🔗 Convite Usado', value: `\`${usedInvite.code}\``, inline: true },
                { name: '🤝 Convidado por', value: inviter ? `${inviter} (\`${inviter.id}\`)` : 'Desconhecido', inline: true },
                { name: '📈 Usos do Convite', value: `\`${usedInvite.uses}\``, inline: true }
            );
        } else {
            embed.addFields({ name: '🔗 Convite', value: 'Não foi possível determinar o convite usado (pode ser link personalizado ou vanity URL).', inline: false });
        }

        await logChannel.send({ embeds: [embed] });

    } catch (error) {
        console.error(`[InviteTracker] Erro ao processar entrada de membro ${user.tag}:`, error);
    }
}

export {
    initInviteCache,
    handleInviteCreate,
    handleInviteDelete,
    execute
};