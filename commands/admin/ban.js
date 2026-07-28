import { PermissionsBitField, EmbedBuilder } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

export default {
    name: 'ban',
    description: 'Bane um usuário do servidor.',
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

        /*
         * O Discord registra no log de auditoria o bot como executor,
         * porque é o bot que efetivamente realiza o banimento.
         *
         * Por isso, adicionamos o ID de quem solicitou o comando dentro
         * do motivo interno enviado ao Discord.
         *
         * O log de banimento removerá essa identificação do motivo
         * apresentado e mostrará o solicitante em um campo separado.
         */
        const auditReasonPrefix = `[SOLICITANTE:${message.author.id}]`;
        const maximumReasonLength = 512;
        const maximumOriginalReasonLength =
            maximumReasonLength - auditReasonPrefix.length - 1;

        const auditReason = `${auditReasonPrefix} ${reason.slice(0, maximumOriginalReasonLength)}`;

        try {
            const member = await message.guild.members.fetch(userToBan.id);
            await member.ban({ reason: auditReason });

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
            const logChannel = await message.client.channels.fetch(logChannelId).catch(() => null);
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