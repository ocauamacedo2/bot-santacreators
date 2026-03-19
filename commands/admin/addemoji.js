import { PermissionsBitField } from 'discord.js';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

export default {
    name: 'addemoji',
    description: 'Adiciona um emoji personalizado ao servidor.',
    hasPermission: async (message) => {
        const owners = process.env.OWNER.split(',').map(id => id.trim());

        if (owners.includes(message.author.id)) {
            return true;
        }

        const roleIdsString = process.env.ROLES_PERMISSION;
        if (!roleIdsString) return false;

        const roleIds = roleIdsString.split(',').map(id => id.trim()).filter(id => id);
        const memberRoles = message.member.roles.cache.map(role => role.id);

        return roleIds.some(roleId => memberRoles.includes(roleId));
    },
    async execute(message, args) {
        if (!await this.hasPermission(message)) {
            setTimeout(() => message.delete().catch(() => {}), 1000);
            return message.reply('❌ Você não tem permissão para usar este comando.')
                .then(msg => setTimeout(() => msg.delete(), 5000));
        }

        if (!message.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageEmojisAndStickers)) {
            return message.reply('❌ Eu não tenho permissão para adicionar emojis no servidor!');
        }

        const emoji = args[0];
        if (!emoji) return message.reply('❗ Você precisa fornecer um emoji para adicionar!');

        const emojiRegex = /<a?:\w+:(\d+)>/;
        const match = emoji.match(emojiRegex);
        if (!match) return message.reply('⚠️ Forneça um emoji válido!');

        const emojiId = match[1];
        const isAnimated = emoji.startsWith('<a:');
        const emojiUrl = `https://cdn.discordapp.com/emojis/${emojiId}.${isAnimated ? 'gif' : 'png'}`;

        try {
            const response = await fetch(emojiUrl);
            if (!response.ok) return message.reply('🚫 Não foi possível acessar a imagem do emoji.');

            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            const emojiName = args.slice(1).join(' ').trim() || 'novo_emoji';
            if (!/^[\w-]{2,32}$/.test(emojiName)) {
                return message.reply('⚠️ O nome do emoji deve ter entre 2 e 32 caracteres e conter apenas letras, números, `-` e `_`.');
            }

            const newEmoji = await message.guild.emojis.create({ attachment: buffer, name: emojiName });
            message.channel.send(`${newEmoji} | Emoji **${emojiName}** adicionado com sucesso!`);
        } catch (error) {
            console.error('Erro ao adicionar o emoji:', error);
            message.reply('❌ Ocorreu um erro ao tentar adicionar o emoji.');
        }
    },
};
