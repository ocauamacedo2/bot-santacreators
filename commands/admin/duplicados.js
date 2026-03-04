// d:\bots\commands\admin\duplicados.js
import { EmbedBuilder } from 'discord.js';

// Configurações
const LOG_CHANNEL_ID = '1469962433412989082';

// IDs permitidos (Usuários e Cargos misturados conforme solicitado)
const PERMITTED_IDS = [
    '660311795327828008',  // Eu
    '1262262852949905408', // Owner
    '1282119104576098314', // MKT Ticket
    '1414651836861907006'  // Responsaveis
];

function normalize(str) {
    // Remove caracteres especiais, acentos e espaços para comparação "parecida"
    return str.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') 
        .replace(/[^a-z0-9]/g, ''); 
}

export default {
    name: 'duplicados',
    description: 'Busca cargos com nomes duplicados ou similares.',

    async execute(message, args, client) {
        // 1. Verificação de Permissão
        const member = message.member;
        if (!member) return;

        const hasPermission = PERMITTED_IDS.includes(message.author.id) || 
                              member.roles.cache.some(r => PERMITTED_IDS.includes(r.id));

        if (!hasPermission) {
            setTimeout(() => message.delete().catch(() => {}), 1000);
            message.reply('❌ Você não tem permissão para usar este comando.')
                .then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000));
            return; 
        }

        // Auto-delete do comando (3 segundos)
        setTimeout(() => message.delete().catch(() => {}), 3000);

        // Feedback visual rápido
        const loadingMsg = await message.channel.send('🟣 **Analisando cargos...**');

        const guild = message.guild;
        await guild.roles.fetch(); // Garante cache atualizado

        // 2. Agrupamento de Cargos
        const roles = guild.roles.cache.filter(r => r.id !== guild.id); // Ignora @everyone
        const groups = new Map();

        roles.forEach(role => {
            const key = normalize(role.name);
            if (!key) return; // Pula nomes vazios após normalização

            if (!groups.has(key)) {
                groups.set(key, []);
            }
            groups.get(key).push(role);
        });

        // Filtra apenas onde há colisão (mais de 1 cargo com mesmo nome normalizado)
        const duplicates = Array.from(groups.values()).filter(g => g.length > 1);

        // Remove msg de carregamento
        await loadingMsg.delete().catch(() => {});

        if (duplicates.length === 0) {
            const msg = await message.channel.send('✅ **Tudo limpo!** Nenhum cargo duplicado ou similar encontrado.');
            setTimeout(() => msg.delete().catch(() => {}), 10000);
            return;
        }

        // 3. Montagem do Embed de Resposta
        const embed = new EmbedBuilder()
            .setTitle('🟣 Relatório de Cargos Duplicados')
            .setColor('#9b59b6') // Roxo
            .setDescription(`Encontrei **${duplicates.length}** grupos de cargos com nomes iguais ou similares.\n\n**Legenda:**\n👥 Membros • 🆔 ID • 🔢 Posição • 📅 Criação`)
            .setThumbnail(guild.iconURL({ dynamic: true }))
            .setFooter({ text: `Solicitado por ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
            .setTimestamp();

        let content = '';
        
        // Ordena grupos por quantidade de duplicatas
        duplicates.sort((a, b) => b.length - a.length);

        duplicates.forEach((group, i) => {
            // Ordena dentro do grupo por posição (hierarquia)
            group.sort((a, b) => b.position - a.position);
            
            const groupName = group[0].name;
            let groupBlock = `\n**${i + 1}. Grupo "${groupName}"**\n`;

            group.forEach(r => {
                const date = r.createdAt.toLocaleDateString('pt-BR');
                // Formatação bonita com emojis roxos/neutros
                groupBlock += `> <@&${r.id}>\n`;
                groupBlock += `> ╚ 👥 **${r.members.size}**  |  🆔 \`${r.id}\`  |  🔢 **${r.position}**  |  📅 ${date}\n`;
            });

            // Limite do Discord (4096 chars na description, usamos margem de segurança)
            if ((content.length + groupBlock.length) < 3500) {
                content += groupBlock;
            } else if (!content.includes('...mais')) {
                content += '\n... (lista cortada, verifique logs para relatório completo)';
            }
        });

        embed.setDescription(embed.data.description + content);

        const responseMsg = await message.channel.send({ embeds: [embed] });

        // Auto-delete da resposta (1 minuto = 60000ms)
        setTimeout(() => responseMsg.delete().catch(() => {}), 60000);

        // 4. Logs no Canal Específico
        const logChannel = client.channels.cache.get(LOG_CHANNEL_ID) || await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);

        if (logChannel && logChannel.isTextBased()) {
            const logEmbed = new EmbedBuilder()
                .setTitle('👾 LOG: Comando !duplicados')
                .setColor('#8e44ad') // Roxo escuro
                .setThumbnail(message.author.displayAvatarURL())
                .setDescription(`**Executor:** ${message.author} (\`${message.author.id}\`)\n**Canal:** ${message.channel}\n**Data:** <t:${Math.floor(Date.now()/1000)}:F>`)
                .addFields(
                    { name: '🔍 Resultado', value: `Detectados **${duplicates.length}** grupos de duplicatas.`, inline: false },
                    { name: '🔗 Link do Canal', value: `Ir para mensagem`, inline: false }
                )
                .setImage('https://media.discordapp.net/attachments/1362477839944777889/1384245215249825832/standard_2rss.gif') // Banner roxo
                .setFooter({ text: 'Sistema de Auditoria • SantaCreators' })
                .setTimestamp();

            await logChannel.send({ embeds: [logEmbed] });
        }
    }
};
