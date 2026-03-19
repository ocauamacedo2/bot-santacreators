// d:\bots\commands\admin\cargosvazios.js
import { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ComponentType } from 'discord.js';

// Configurações
const LOG_CHANNEL_ID = '1469964510315020450';

// IDs permitidos (Usuários e Cargos misturados conforme solicitado)
const PERMITTED_IDS = [
    '660311795327828008',  // Eu
    '1262262852949905408', // Owner
    '1282119104576098314', // MKT Ticket
    '1414651836861907006'  // Responsaveis
];

// IDs permitidos APENAS PARA DELETAR (Eu, Owner, Responsáveis)
const DELETE_PERMITTED_IDS = [
    '660311795327828008',  // Eu
    '1262262852949905408', // Owner
    '1414651836861907006'  // Responsaveis
];

export default {
    name: 'cargosvazios',
    description: 'Lista e permite deletar cargos sem membros.',

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
        const loadingMsg = await message.channel.send('🟣 **Buscando cargos vazios...**');

        const guild = message.guild;
        await guild.roles.fetch(); // Garante cache atualizado

        // 2. Filtra cargos vazios
        // Ignora: gerenciados (bots), @everyone, e cargos com membros
        let emptyRoles = guild.roles.cache.filter(r => 
            r.members.size === 0 && 
            !r.managed && 
            r.id !== guild.id
        ).sort((a, b) => a.position - b.position);

        await loadingMsg.delete().catch(() => {});

        if (emptyRoles.size === 0) {
            const msg = await message.channel.send('✅ **Tudo limpo!** Nenhum cargo vazio encontrado.');
            setTimeout(() => msg.delete().catch(() => {}), 10000);
            return;
        }

        // Funções auxiliares para atualizar a mensagem (Embed e Menu)
        const generateComponents = (rolesCollection) => {
            if (rolesCollection.size === 0) return [];
            
            // Select Menu suporta max 25 opções
            const options = rolesCollection.first(25).map(r => ({
                label: r.name.slice(0, 100),
                value: r.id,
                description: `ID: ${r.id}`,
                emoji: '🗑️'
            }));

            const row = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('delete_empty_role')
                        .setPlaceholder('Selecione um cargo para DELETAR')
                        .addOptions(options)
                );
            
            return [row];
        };

        const generateEmbed = (rolesCollection) => {
            const embed = new EmbedBuilder()
                .setTitle('🟣 Relatório de Cargos Vazios')
                .setColor('#9b59b6') // Roxo
                .setDescription(`Encontrei **${rolesCollection.size}** cargos sem membros.\nSelecione no menu abaixo para **DELETAR**.\n*(Menu limitado aos primeiros 25 cargos)*`)
                .setThumbnail(guild.iconURL({ dynamic: true }))
                .setFooter({ text: `Solicitado por ${message.author.tag} • Expira em 2 min`, iconURL: message.author.displayAvatarURL() })
                .setTimestamp();

            let content = '';
            // Lista até 40 no embed para não estourar limite visual
            const rolesList = rolesCollection.first(40);
            
            rolesList.forEach(r => {
                const date = r.createdAt.toLocaleDateString('pt-BR');
                content += `> <@&${r.id}>\n> ╚ 🆔 \`${r.id}\` | 📅 \n`;
            });

            if (rolesCollection.size > 40) {
                content += `\n... e mais **${rolesCollection.size - 40}** cargos.`;
            }

            embed.setDescription(embed.data.description + '\n\n' + content);
            return embed;
        };

        // 3. Envia mensagem interativa
        const responseMsg = await message.channel.send({
            embeds: [generateEmbed(emptyRoles)],
            components: generateComponents(emptyRoles)
        });

        // 4. Collector para interação (2 minutos)
        const collector = responseMsg.createMessageComponentCollector({ 
            componentType: ComponentType.StringSelect, 
            time: 120000 
        });

        collector.on('collect', async i => {
            if (i.user.id !== message.author.id) {
                await i.reply({ content: '❌ Apenas quem executou o comando pode usar o menu.', ephemeral: true });
                return;
            }

            // Verifica permissão de deletar
            const canDelete = DELETE_PERMITTED_IDS.includes(i.user.id) || 
                              (i.member && i.member.roles.cache.some(r => DELETE_PERMITTED_IDS.includes(r.id)));

            if (!canDelete) {
                await i.reply({ content: '🔒 **Acesso restrito:** Você só pode visualizar. Apenas Owner e Responsáveis podem deletar.', ephemeral: true });
                return;
            }

            const roleId = i.values[0];
            const role = guild.roles.cache.get(roleId);

            if (!role) {
                await i.reply({ content: '❌ Cargo não encontrado (já deletado?).', ephemeral: true });
                emptyRoles.delete(roleId); // Remove da lista local
                await i.message.edit({
                    embeds: [generateEmbed(emptyRoles)],
                    components: generateComponents(emptyRoles)
                });
                return;
            }

            try {
                const roleName = role.name;
                await role.delete(`Comando !cargosvazios por ${message.author.tag}`);
                
                // Remove da lista local para atualizar UI
                emptyRoles.delete(roleId);

                // Log no canal específico
                const logChannel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
                if (logChannel && logChannel.isTextBased()) {
                    const logEmbed = new EmbedBuilder()
                        .setTitle('🗑️ Cargo Vazio Deletado')
                        .setColor('#e74c3c') // Vermelho
                        .setThumbnail(message.author.displayAvatarURL())
                        .setDescription(`**Executor:** ${message.author} (\`${message.author.id}\`)\n**Cargo Deletado:** ${roleName}\n**ID:** \`${roleId}\``)
                        .setTimestamp();
                    await logChannel.send({ embeds: [logEmbed] });
                }

                await i.reply({ content: `✅ Cargo **${roleName}** deletado com sucesso.`, ephemeral: true });

                // Atualiza a mensagem principal
                if (emptyRoles.size === 0) {
                    await i.message.edit({
                        content: '✅ Todos os cargos vazios listados foram deletados.',
                        embeds: [],
                        components: []
                    });
                    collector.stop();
                } else {
                    await i.message.edit({
                        embeds: [generateEmbed(emptyRoles)],
                        components: generateComponents(emptyRoles)
                    });
                }

            } catch (err) {
                console.error(err);
                await i.reply({ content: '❌ Erro ao deletar cargo (verifique permissões ou hierarquia do bot).', ephemeral: true });
            }
        });

        collector.on('end', () => {
            // Apaga a mensagem após 2 minutos
            responseMsg.delete().catch(() => {});
        });
    }
};
