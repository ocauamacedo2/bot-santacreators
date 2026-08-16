import { PermissionsBitField, EmbedBuilder } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

// =====================================================
// USUÁRIOS/BOTS QUE NUNCA PODEM SER EXPULSOS
// =====================================================
const KICK_PROTECTED_USER_IDS = new Set([
    '1380989431011610634', // Amigo dos Creators
]);

export default {
    name: 'kick',
    description: 'Expulsa um usuário do servidor.',
    hasPermission: async (message) => {
        if (message.author.id === process.env.OWNER || message.author.id === '660311795327828008') {
            return true;
        }
        const roleIdsString = process.env.ROLES_PERMISSION;

        if (!roleIdsString) {
            return false;
        }

        const roleIds = roleIdsString.split(',').map(id => id.trim()).filter(id => id);
        const memberRoles = message.member.roles.cache.map(role => role.id);

        return roleIds.some(roleId => memberRoles.includes(roleId));
    },
    async execute(message, args) {
        if (!await this.hasPermission(message)) {
            setTimeout(() => message.delete().catch(() => {}), 1000);
            return message.reply('Você não tem permissão para expulsar membros!')
                .then(msg => setTimeout(() => msg.delete(), 5000))
                .catch(err => console.error('Erro ao enviar mensagem de aviso:', err));
        }

        const userToKick = message.mentions.users.first();

if (!userToKick) {
    return message.reply('Você precisa mencionar um usuário para expulsar!');
}

// =====================================================
// PROTEÇÃO ABSOLUTA CONTRA KICK
// =====================================================
if (KICK_PROTECTED_USER_IDS.has(userToKick.id)) {
    console.warn(
        `[KICK PROTECTION] Tentativa bloqueada de expulsar ${userToKick.tag} (${userToKick.id}) por ${message.author.tag} (${message.author.id}).`
    );

    return message.reply(
        '🛡️ Este usuário/bot está protegido e não pode ser expulso do servidor.'
    );
}

const reason = args.slice(1).join(' ') || 'Sem motivo especificado';

try {
    const member = await message.guild.members.fetch(userToKick.id);

    // Segunda proteção antes da ação real.
    if (KICK_PROTECTED_USER_IDS.has(member.id)) {
        console.warn(
            `[KICK PROTECTION] Kick cancelado para usuário protegido ${member.id}.`
        );

        return message.reply(
            '🛡️ Este usuário/bot está protegido e não pode ser expulso do servidor.'
        );
    }

    await member.kick(reason);

    const kickEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('Usuário Expulso')
                .addFields(
                    { name: 'Usuário:', value: `${userToKick.tag} (${userToKick.id})` },
                    { name: 'Motivo:', value: reason },
                    { name: 'Expulso por:', value: `${message.author}` }
                )
                .setTimestamp();

            const sentMessage = await message.channel.send({ embeds: [kickEmbed] });

            setTimeout(() => {
                sentMessage.delete().catch(err => console.error('Erro ao deletar a mensagem:', err));
            }, 10000);

            const logChannelId = process.env.LOG_CHANNEL_ID;
            const logChannel = await message.client.channels.fetch(logChannelId).catch(() => null);
            if (logChannel) {
                await logChannel.send({ embeds: [kickEmbed] });
            } else {
                console.error('Canal de logs não encontrado.');
            }
        } catch (error) {
            console.error('Erro ao expulsar o usuário:', error);
            message.reply('Ocorreu um erro ao tentar expulsar o usuário. Verifique se eu tenho permissão para expulsar membros.');
        }
    },
};