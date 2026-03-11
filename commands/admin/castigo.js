import { EmbedBuilder } from 'discord.js';
import dotenv from 'dotenv';
import { resolveLogChannel } from '../../events/channelResolver.js';

dotenv.config();

export default {
    name: 'castigo',
    description: 'Aplica castigo em um usuário',
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
    async execute(message, args, client) {
        if (!await this.hasPermission(message)) {
            setTimeout(() => message.delete().catch(() => {}), 1000);
            return message.reply('Você não tem permissão para usar este comando.')
                .then(msg => setTimeout(() => msg.delete(), 5000));
        }

        try {
            const target = message.mentions.members.first();
            if (!target) {
                return message.reply('Por favor, mencione um usuário para aplicar o castigo!')
                    .then(msg => setTimeout(() => msg.delete(), 5000));
            }

            if (!target.moderatable) {
                return message.reply('Não tenho permissão para aplicar castigo neste usuário!')
                    .then(msg => setTimeout(() => msg.delete(), 5000));
            }

            const time = args[1] || '60'; 
            const timeInMinutes = parseInt(time);
            const reason = args.slice(2).join(' ') || 'Nenhum motivo especificado';

            if (isNaN(timeInMinutes) || timeInMinutes <= 0) {
                return message.reply('Por favor, forneça um tempo válido em minutos!')
                    .then(msg => setTimeout(() => msg.delete(), 5000));
            }

            try {
                await target.timeout(timeInMinutes * 60 * 1000, reason);
            } catch (timeoutError) {
                return message.reply('Ocorreu um erro ao aplicar o castigo. Verifique as permissões do bot.')
                    .then(msg => setTimeout(() => msg.delete(), 5000));
            }

            const timeoutEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('Castigo Aplicado')
                .addFields(
                    { name: '❌ | Castigado:', value: `${target}`, inline: false },
                    { name: '👮 | Staff', value: `${message.author}`, inline: false },
                    { name: '⏱️ | Duração', value: `\`${timeInMinutes} minutos\``, inline: false },
                    { name: '📄 | Motivo', value: `\`${reason}\``, inline: false }
                )
                .setTimestamp();

            const replyMessage = await message.channel.send({ embeds: [timeoutEmbed] });

            const logChannelId = process.env.LOG_CHANNEL_ID;
            const logChannel = await resolveLogChannel(client, logChannelId);
            if (logChannel) {
                await logChannel.send({ embeds: [timeoutEmbed] });
            } else {
                console.error('Canal de logs não encontrado!');
            }

            setTimeout(() => replyMessage.delete().catch(err => console.error(`Erro ao deletar mensagem: ${err}`)), 10000);

        } catch (error) {
            console.error('Erro ao executar comando de castigo:', error);
            message.reply('Ocorreu um erro ao executar o comando!')
                .then(msg => setTimeout(() => msg.delete(), 5000))
                .catch(err => console.error(`Erro ao enviar mensagem de erro: ${err}`));
        }
    },
};