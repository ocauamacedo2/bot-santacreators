import { EmbedBuilder } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config();

export default {
    name: 'meuscargos',
    description: 'Lista os cargos do usuário que executou o comando.',
    execute: async (message, args, client) => {
        const allowedRoles = [
            '1352408327983861844', // Creator Principal
            '1262262852949905409', // Creator Secundário
            '1352407252216184833', // Líder Creator
            '1352385500614234134', // Creator Geral
            '1352429001188180039', // Creator Plus
            '1352939011253076000', // Creator Interativo
            '1352275728476930099', // Creator Aprovado
            '1262262852949905408', // OWNER ✅
            '1262823861658058752', // SERVER BOOSTER ✅
            ...(process.env.STAFF?.split(',').map(id => id.trim()) || [])
        ];

        const membroTemPermissao = message.member.roles.cache.some(role => allowedRoles.includes(role.id));

        if (!membroTemPermissao) {
            setTimeout(() => message.delete().catch(() => {}), 1000);
            return message.reply('❌ Você não tem permissão pra usar esse comando.').then(msg => {
                setTimeout(() => msg.delete().catch(() => {}), 8000);
            });
        }

        message.delete().catch(() => {});

        const roles = message.member.roles.cache
            .sort((a, b) => b.position - a.position)
            .filter(role => role.name !== '@everyone')
            .map(role => `<@&${role.id}>`)
            .join('\n');

        const embed = new EmbedBuilder()
            .setColor(0x00ff99)
            .setAuthor({
                name: `${message.author.username} usou o comando !meuscargos`,
                iconURL: message.author.displayAvatarURL({ dynamic: true })
            })
            .setDescription(`🔎 **Cargos de <@${message.author.id}>:**\n\n${roles || 'Você não possui cargos visíveis.'}`)
            .setFooter({
                text: `Horário: ${new Date().toLocaleTimeString('pt-BR')}`
            })
            .setTimestamp();

        const resposta = await message.channel.send({ embeds: [embed] });

        setTimeout(() => {
            resposta.delete().catch(() => {});
        }, 30 * 1000);
    }
};
