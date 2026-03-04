import { PermissionsBitField, EmbedBuilder } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

export default {
    name: 'ban',
    description: 'Bane um usuário do servidor.',
    hasPermission: async (message) => {

        if (message.author.id === process.env.OWNER) {
            return true;
        }

        const roleIdsString = process.env.ROLES_PERMISSION;

        if (!roleIdsString) {
            return false;
        }

        const roleIds = roleIdsString.split(',').map(id => id.trim()).filter(id => id);
        const memberRoles = message.member.roles.cache.map(role => role.id);

        const hasRole = roleIds.some(roleId => memberRoles.includes(roleId));

        return hasRole;
    },
    async execute(message, args) {
        if (!await this.hasPermission(message)) {
            setTimeout(() => message.delete().catch(() => {}), 1000);
            return message.reply('Você não tem permissão para usar este comando.')
                .then(msg => setTimeout(() => msg.delete(), 5000));
        }

        if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
            return message.reply('Você não tem permissão para banir membros!');
        }

        const userToBan = message.mentions.users.first();
        if (!userToBan) {
            return message.reply('Você precisa mencionar um usuário para banir!');
        }

        const reason = args.slice(1).join(' ') || 'Sem motivo especificado';

        try {
            const member = await message.guild.members.fetch(userToBan.id);
            await member.ban({ reason });

            const banEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('Usuário Banido')
                .addFields(
                    { name: 'Usuário:', value: `${userToBan.tag} (${userToBan.id})` },
                    { name: 'Motivo:', value: reason },
                    { name: 'Banido por:', value: `${message.author}` }
                )
                .setTimestamp();

            const sentMessage = await message.channel.send({ embeds: [banEmbed] });

            setTimeout(() => {
                sentMessage.delete().catch(err => console.error('Erro ao deletar a mensagem:', err));
            }, 10000);

            const logChannelId = process.env.LOG_CHANNEL_ID;
            const logChannel = message.guild.channels.cache.get(logChannelId);
            if (logChannel) {
                await logChannel.send({ embeds: [banEmbed] });
            } else {
                console.error('Canal de logs não encontrado.');
            }
        } catch (error) {
            console.error('Erro ao banir o usuário:', error);
            message.reply('Ocorreu um erro ao tentar banir o usuário. Verifique se eu tenho permissão para banir membros.');
        }
    },
};