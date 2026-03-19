import {
    ChannelType,
    EmbedBuilder
} from 'discord.js';

/* ================= CONFIG ================= */

const CONFIG = {
    membrosPermitidos: ['660311795327828008', '1021174007577444463'],
    cargosPermitidos: [
        '1262262852949905408',
        '1352408327983861844',
        '1262262852949905409'
    ],
    canalLogs: '1470511562740597012'
};

/* ================= HELPERS ================= */

const safeReply = async (channel, content) => {
    try {
        return await channel.send(content);
    } catch {
        return null;
    }
};

/* ================= COMMAND ================= */

export default {
    name: 'remperm',
    description: 'Remove COMPLETAMENTE um cargo de um canal ou categoria.',

    hasPermission(message) {
        const m = message.member;
        if (!m) return false;

        return (
            CONFIG.membrosPermitidos.includes(m.id) ||
            m.roles.cache.some(r => CONFIG.cargosPermitidos.includes(r.id))
        );
    },

    async execute(message, args) {
        try {
            if (args.length < 2) {
                return safeReply(
                    message.channel,
                    '❌ Uso correto:\n`!remperm <canal/categoria> <cargo>`'
                );
            }

            const channelId = args[0].replace(/\D/g, '');
            const roleId = args[1].replace(/\D/g, '');

            const channel = await message.guild.channels.fetch(channelId).catch(() => null);
            if (!channel) return safeReply(message.channel, '❌ Canal ou categoria inválido.');

            const role = await message.guild.roles.fetch(roleId).catch(() => null);
            if (!role) return safeReply(message.channel, '❌ Cargo inválido.');

            const targets =
                channel.type === ChannelType.GuildCategory
                    ? message.guild.channels.cache.filter(c => c.parentId === channel.id)
                    : [channel];

            let processed = 0;
const total = targets.size;

const progressMsg = await safeReply(
    message.channel,
    `🧹 Removendo cargo <@&${roleId}>...\n🔄 Progresso: **0/${total}**`
);

for (const ch of targets.values()) {
    try {
        await ch.permissionOverwrites.delete(roleId);
        processed++;

        await progressMsg.edit(
            `🧹 Removendo cargo <@&${roleId}>...\n` +
            `🔄 Progresso: **${processed}/${total}**`
        );
    } catch {}
}

await progressMsg.edit(
    `✅ **Concluído!**\n` +
    `🧹 Cargo <@&${roleId}> removido de **${processed}** canal(is).`
);


            const log = message.guild.channels.cache.get(CONFIG.canalLogs);
            if (log?.isTextBased()) {
                const embed = new EmbedBuilder()
    .setTitle('🧹 Remoção de Cargo em Canais')
    .setColor(0x9B59B6)
    .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
    .addFields(
        {
            name: '👤 Executor',
            value: `${message.author}\n\`${message.author.id}\``,
            inline: false
        },
        {
            name: '🎭 Cargo removido',
            value: `<@&${roleId}>\n\`${roleId}\``,
            inline: false
        },
        {
            name: '📍 Canal / Categoria alvo',
            value: `<#${channel.id}>\n\`${channel.id}\``,
            inline: false
        },
        {
            name: '📊 Resultado',
            value: `Cargo removido de **${processed}** canal(is).`,
            inline: false
        },
        {
            name: '💬 Comando executado em',
            value: `<#${message.channel.id}>`,
            inline: false
        }
    )
    .setFooter({
        text: `Executado em ${message.guild.name}`,
        iconURL: message.guild.iconURL({ dynamic: true })
    })
    .setTimestamp();


                log.send({ embeds: [embed] }).catch(() => {});
            }

        } catch (err) {
            console.error('[REMPERM]', err);
            safeReply(message.channel, '❌ Erro interno ao executar o comando.');
        }
    }
};
