import { EmbedBuilder } from 'discord.js';

// Configuração centralizada para o sistema de log duplo
const MAIN_GUILD_ID = '1262262852782129183';

/**
 * Envia um log embed para um canal local e um canal central.
 *
 * @param {object} options
 * @param {import('discord.js').Client} options.client O cliente do Discord.
 * @param {import('discord.js').Guild} options.guild A guilda onde o evento ocorreu.
 * @param {EmbedBuilder} options.embed O embed a ser enviado.
 * @param {string} options.centralLogId O ID do canal de log central.
 * @param {Record<string, string>} options.localLogMap Um mapa de { guildId: localLogChannelId }.
 * @param {string} [options.eventName='log'] Um nome para o evento para facilitar o debug nos logs.
 * @returns {Promise<{local: boolean, central: boolean}>} Um objeto indicando sucesso para cada tipo de log.
 */
export async function sendDualLog({ client, guild, embed, centralLogId, localLogMap, eventName = 'log' }) {
    if (!client || !guild || !embed) {
        console.error(`[logSender] Parâmetros ausentes para o evento ${eventName}.`);
        return { local: false, central: false };
    }

    const isMainGuild = guild.id === MAIN_GUILD_ID;
    let localSuccess = false;
    let centralSuccess = isMainGuild; // Se for a guilda principal, o log central não é necessário.

    // 1. Envia para o canal de log local
    const localLogChannelId = localLogMap[guild.id];
    if (localLogChannelId) {
        try {
            const localLogChannel = await client.channels.fetch(localLogChannelId);
            if (localLogChannel?.isTextBased()) {
                const localEmbed = EmbedBuilder.from(embed).setFooter({ text: `Servidor: ${guild.name} • ${guild.id}` });
                await localLogChannel.send({ embeds: [localEmbed] });
                localSuccess = true;
            }
        } catch (error) {
            console.error(`[logSender/${eventName}] ERRO (Local): Falha ao enviar para o canal ${localLogChannelId} na guilda ${guild.name}.`, error.message);
        }
    } else {
        localSuccess = true; // Não é um erro se não houver canal local configurado.
    }

    // 2. Envia para o canal de log central (se não for a guilda principal)
    if (!isMainGuild && centralLogId) {
        try {
            const centralLogChannel = await client.channels.fetch(centralLogId);
            if (centralLogChannel?.isTextBased()) {
                const centralEmbed = EmbedBuilder.from(embed).setFooter({ text: `Origem: ${guild.name} • ${guild.id}` });
                await centralLogChannel.send({ embeds: [centralEmbed] });
                centralSuccess = true;
            } else {
                console.error(`[logSender/${eventName}] ERRO CRÍTICO: Canal de log CENTRAL (${centralLogId}) não encontrado ou não é de texto.`);
            }
        } catch (error) {
            console.error(`[logSender/${eventName}] ERRO CRÍTICO: Falha ao enviar para o canal central ${centralLogId}. Verifique as permissões do bot.`, error.message);
        }
    }

    return { local: localSuccess, central: centralSuccess };
}