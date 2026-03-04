import { EmbedBuilder } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

const COLORS = {
    DEFAULT: process.env.BASE_COLORS,
};

const CONNECTION_QUALITY = {
    EXCELLENT: '🟢 Excelente',
    GOOD: '🟡 Boa',
    AVERAGE: '🟠 Média',
    POOR: '🔴 Ruim',
};

const getConnectionQuality = (ping) => {
    if (ping < 100) return CONNECTION_QUALITY.EXCELLENT;
    if (ping < 200) return CONNECTION_QUALITY.GOOD;
    if (ping < 400) return CONNECTION_QUALITY.AVERAGE;
    return CONNECTION_QUALITY.POOR;
};

export default {
    name: 'ping',
    description: 'Mostra a latência do bot',
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

        return roleIds.some(roleId => memberRoles.includes(roleId));
    },
    async execute(message, args, client) {

        if (!await this.hasPermission(message)) {
            setTimeout(() => message.delete().catch(() => {}), 1000);
            return message.reply('Você não tem permissão para usar este comando!')
                .then(msg => setTimeout(() => msg.delete(), 5000))
                .catch(err => console.error('Erro ao enviar mensagem de aviso:', err));
        }

        try {
            if (!client || !client.ws) {
                console.error('Cliente não está definido ou ws não está acessível.')
            return message.channel.send('Houve um erro ao executar o comando de ping!');
            }

            const timeBefore = Date.now();
            const sentMessage = await message.channel.send('Calculando ping...');
            const timeAfter = Date.now();

            const pingBot = timeAfter - timeBefore;
            const apiPing = Math.round(client.ws.ping);

            const pingEmbed = new EmbedBuilder()
                .setColor(COLORS.DEFAULT)
                .setTitle('🤖 | Ping do Bot')
                .setDescription('Informações sobre a latência do bot.')
                .setThumbnail(client.user?.displayAvatarURL({ dynamic: true }) || 'URL padrão')
                .addFields(
                    { name: '⚡ | Latência do Bot', value: `\`\`\`${pingBot}ms\`\`\``, inline: true },
                    { name: '📡 | Latência da API', value: `\`\`\`${apiPing}ms\`\`\``, inline: true },
                    {
                        name: '📊 | Qualidade da Conexão',
                        value: `> **BOT:** ${getConnectionQuality(pingBot)}\n> **API:** ${getConnectionQuality(apiPing)}`,
                        inline: false
                    }
                )
                .setFooter({ 
                    text: `Solicitado por ${message.author.tag}`,
                    iconURL: message.author.displayAvatarURL({ dynamic: true })
                })
                .setTimestamp();

            await sentMessage.edit({ content: '', embeds: [pingEmbed] });

            setTimeout(async () => {
                try {
                    if (sentMessage.deletable) {
                        await sentMessage.delete();
                    }
                } catch (deleteError) {
                    console.error('Erro ao tentar apagar a mensagem do ping:', deleteError);
                }
            }, 120000);

        } catch (error) {
            console.error('Erro ao executar comando ping:', error);
            await message.channel.send('Houve um erro ao executar o comando de ping!')
                .then(msg => setTimeout(() => msg.delete(), 5000))
                .catch(err => console.error('Erro ao enviar mensagem de erro:', err));
        }    
    },
};