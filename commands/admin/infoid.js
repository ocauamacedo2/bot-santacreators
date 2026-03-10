import { EmbedBuilder } from 'discord.js';

// Constantes copiadas de 'entrevistasTickets.js' para manter o módulo isolado
const TICKET_CATEGORIES = new Set([
    '1359244725781266492', // Entrevista
    '1359245003523756136', // Suporte
    '1414687963161559180', // Lider
    '1359245055239655544', // Ideias
    '1352706815594598420', // Roupas
    '1404568518179029142',  // Banners
    // Adicionando as categorias que faltavam
    '1384650670145278033',
    '1359244743724241156',
    '1444857594517913742'
]);

const cargosPermitidos = new Set([
    '660311795327828008', // Você
    '1262262852949905408', // Owner
    '1352408327983861844', // Resp Creator
    '1262262852949905409', // Resp Influ
    '1352407252216184833', // Resp Líder
    '1352385500614234134', // Coordenação
    '1352493359897378941', // Interação Bot
    '1352367267547058319', // ADM
    '1379172775905984703', // Sênior
    '1379172895116361770'  // Pleno
]);

/**
 * Procura por canais de ticket abertos por um usuário específico.
 * @param {import('discord.js').Guild} guild A guilda para procurar.
 * @param {import('discord.js').GuildMember} member O membro para verificar as permissões.
 * @returns {Promise<string[]>} Uma lista de IDs de canais de ticket.
 */
async function findOpenTickets(guild, member) {
    if (!member) return [];
    const openTickets = [];
    for (const channel of guild.channels.cache.values()) {
        if (TICKET_CATEGORIES.has(channel.parentId)) {
            // Verifica se o membro tem uma permissão explícita (overwrite) no canal,
            // ignorando permissões herdadas de cargos.
            const overwrite = channel.permissionOverwrites.cache.get(member.id);
            // A permissão de ver é concedida se houver um overwrite para o membro que permite 'ViewChannel'
            if (overwrite && overwrite.allow.has('ViewChannel')) {
                openTickets.push(channel.id);
            }
        }
    }
    return openTickets;
}

export default {
    name: 'infoid',
    description: 'Exibe informações detalhadas sobre um usuário.',
    async execute(message, args, client) {
        const temPermissao =
            message.member.roles.cache.some(role => cargosPermitidos.has(role.id)) ||
            cargosPermitidos.has(message.author.id);
        if (!temPermissao) return;

        const query = args[0];
        if (!query) {
            const reply = await message.reply('❌ Informe o ID, menção ou número do ID no nome. Ex: `!infoid @usuario`, `!infoid 12345...` ou `!infoid 445`');
            setTimeout(() => reply.delete().catch(() => {}), 8000);
            return;
        }

        await message.delete().catch(() => {});

        let membroAlvo = null;

        // 1. Tenta por menção
        if (message.mentions.members.size > 0) {
            membroAlvo = message.mentions.members.first();
        }

        // 2. Tenta por ID de usuário
        if (!membroAlvo && /^\d{17,20}$/.test(query)) {
            membroAlvo = await message.guild.members.fetch(query).catch(() => null);
        }

        // 3. Tenta por busca no nome/nick
        if (!membroAlvo) {
            // Busca por `| 34` ou ` 34` no final do nome/nick.
            // O `\s*` permite espaços opcionais em volta do `|`.
            const searchRegex = new RegExp(`\\s*\\|\\s*${query}$`, 'i');
            // Garante que o cache de membros está o mais atualizado possível
            await message.guild.members.fetch().catch(() => {});
            membroAlvo = message.guild.members.cache.find(m => {
                const displayName = m.displayName || '';
                // Procura pelo padrão exato para evitar falsos positivos
                return searchRegex.test(displayName);
            });
        }

        if (!membroAlvo) {
            const resposta = await message.channel.send(`❌ Nenhum usuário encontrado com a busca: \`${query}\``);
            setTimeout(() => resposta.delete().catch(() => {}), 15000);
            return;
        }

        const user = membroAlvo.user;
        const avatar = user.displayAvatarURL({ dynamic: true, size: 1024 });
        const dataEntrada = membroAlvo.joinedTimestamp ? `<t:${Math.floor(membroAlvo.joinedTimestamp / 1000)}:f> (<t:${Math.floor(membroAlvo.joinedTimestamp / 1000)}:R>)` : '—';
        const dataCriacao = user.createdTimestamp ? `<t:${Math.floor(user.createdTimestamp / 1000)}:f> (<t:${Math.floor(user.createdTimestamp / 1000)}:R>)` : '—';
        
        const statusMap = {
            online: '🟢 Online',
            idle: '🟡 Ausente',
            dnd: '🔴 Não Incomodar',
            offline: '⚫ Offline/Invisível'
        };
        const status = membroAlvo.presence?.status ? statusMap[membroAlvo.presence.status] : statusMap.offline;

        const booster = membroAlvo.premiumSince ? `Sim, desde <t:${Math.floor(membroAlvo.premiumSinceTimestamp / 1000)}:d> 💎` : 'Não';
        const apelido = membroAlvo.nickname || 'Nenhum';
        const cargoMaisAlto = membroAlvo.roles.highest.id === message.guild.id ? 'Nenhum' : membroAlvo.roles.highest.toString();
        
        const cargos = membroAlvo.roles.cache
            .filter(role => role.id !== message.guild.id)
            .sort((a, b) => b.position - a.position)
            .map(role => role.toString());

        const openTickets = await findOpenTickets(message.guild, membroAlvo);
        const ticketsText = openTickets.length > 0 
            ? openTickets.map(id => `<#${id}>`).join('\n') 
            : 'Nenhum ticket aberto.';

        const embed = new EmbedBuilder()
            .setAuthor({ name: user.tag, iconURL: avatar })
            .setThumbnail(avatar)
            .setColor('#ff009a')
            .setTitle(`📄 Informações sobre ${membroAlvo.displayName}`)
            .setDescription(`**Menção:** ${membroAlvo}`)
            .addFields(
                { name: '🆔 ID do Usuário', value: `\`${user.id}\``, inline: true },
                { name: '🌐 Apelido', value: `\`${apelido}\``, inline: true },
                { name: '✨ Status', value: status, inline: true },
                { name: '📥 Entrada no Servidor', value: dataEntrada, inline: false },
                { name: '🎂 Criação da Conta', value: dataCriacao, inline: false },
                { name: '💎 Booster', value: booster, inline: true },
                { name: '👑 Cargo Mais Alto', value: cargoMaisAlto, inline: true },
                { name: '🔗 Link do Avatar', value: `Clique aqui`, inline: true },
                { name: '🎫 Tickets Abertos', value: ticketsText, inline: false },
                { name: `🎖️ Cargos (${cargos.length})`, value: cargos.length > 0 ? cargos.join(', ') : 'Nenhum' }
            )
            .setFooter({ text: 'SantaCreators - InfoID', iconURL: message.guild.iconURL() || undefined })
            .setTimestamp();

        const resposta = await message.channel.send({ embeds: [embed] });
        setTimeout(() => resposta.delete().catch(() => {}), 60 * 1000); // Aumentei para 1 minuto
    }
};