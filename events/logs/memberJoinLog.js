import { EmbedBuilder, Events, ChannelType } from 'discord.js';

// Coloque o ID do canal de logs central aqui.
// Este canal receberá os avisos de entrada de todos os servidores.
const CENTRAL_LOG_CHANNEL_ID = 'YOUR_CENTRAL_LOG_CHANNEL_ID'; // <--- SUBSTITUA PELO ID DO SEU CANAL DE LOGS

/**
 * @param {import('discord.js').GuildMember} member 
 */
async function handleGuildMemberAdd(member) {
    // Ignora a entrada de outros bots
    if (member.user.bot) return;

    const { user, guild } = member;
    const client = guild.client;

    // Tenta buscar o canal de log central
    const logChannel = await client.channels.fetch(CENTRAL_LOG_CHANNEL_ID).catch(() => null);
    if (!logChannel || !logChannel.isTextBased()) {
        console.warn(`[MemberJoinLog] Canal de log central ${CENTRAL_LOG_CHANNEL_ID} não encontrado ou não é de texto.`);
        return;
    }

    // Tenta criar um convite temporário para o "link do servidor"
    let inviteLink = 'Não foi possível criar um convite.';
    let inviteCreated = false;
    try {
        const me = guild.members.me;
        if (me && me.permissions.has('CreateInstantInvite')) {
            // Tenta usar o canal de sistema, ou o primeiro canal de texto que o bot pode ver
            const inviteChannel = guild.systemChannel || guild.channels.cache.find(c => 
                c.type === ChannelType.GuildText && 
                c.permissionsFor(me).has('CreateInstantInvite')
            );

            if (inviteChannel) {
                const invite = await inviteChannel.createInvite({
                    maxAge: 3600, // O link dura 1 hora
                    maxUses: 1,   // O link pode ser usado 1 vez
                    unique: true,
                    reason: `Link temporário para log de entrada de ${user.tag}`
                });
                inviteLink = invite.url;
                inviteCreated = true;
            }
        }
    } catch (error) {
        console.error(`[MemberJoinLog] Falha ao criar convite para o servidor ${guild.name}:`, error);
    }

    const embed = new EmbedBuilder()
        .setColor('#2ecc71') // Verde
        .setAuthor({ name: 'Novo Membro Entrou', iconURL: guild.iconURL({ dynamic: true }) })
        .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
        .setDescription(`${user} (**${user.tag}**) entrou no servidor **${guild.name}**.`)
        .addFields(
            { name: '👤 Usuário', value: `<@${user.id}>\n\`${user.id}\``, inline: true },
            { name: '📅 Conta Criada', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
            { name: '📊 Total de Membros', value: `\`${guild.memberCount}\``, inline: true }
        )
        .setFooter({ text: `Servidor: ${guild.name} (${guild.id})`})
        .setTimestamp();
    
    // Adiciona o link do servidor apenas se o convite foi criado com sucesso
    if (inviteCreated) {
        embed.addFields({ name: '🔗 Link para o Servidor', value: `Clique aqui para entrar`, inline: false });
    } else {
        embed.addFields({ name: '🔗 Link para o Servidor', value: '`Permissão para criar convite ausente`', inline: false });
    }

    try {
        await logChannel.send({ embeds: [embed] });
    } catch (error) {
        console.error(`[MemberJoinLog] Falha ao enviar log para o canal ${logChannel.id} no servidor ${guild.name}:`, error);
    }
}

/**
 * @param {import('discord.js').Client} client 
 */
export function registerMemberJoinLog(client) {
    if (!CENTRAL_LOG_CHANNEL_ID || CENTRAL_LOG_CHANNEL_ID === 'YOUR_CENTRAL_LOG_CHANNEL_ID') {
        console.warn('⚠️ [MemberJoinLog] O ID do canal de logs central não foi definido. O log de entrada de membros está desativado.');
        return;
    }
    
    client.on(Events.GuildMemberAdd, handleGuildMemberAdd);
    console.log('✅ [MemberJoinLog] Módulo de log de entrada de membros registrado.');
}