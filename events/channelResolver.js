// d:\santacreators-main\utils\channelResolver.js
import { getMirroredId, getTargetGuildId } from './idRegistry.js';
import { MIRROR_CONFIG } from './mirrorConfig.js';

/**
 * Resolve o ID de um canal espelhado.
 * @param {string} sourceChannelId O ID do canal original.
 * @returns {string | null} O ID do canal espelhado ou null se não houver mapeamento.
 */
export function resolveMirroredChannelId(sourceChannelId) {
    const sourceGuildId = MIRROR_CONFIG.SOURCE_GUILD_ID;
    if (!sourceGuildId || !sourceChannelId) return null;

    return getMirroredId('channels', sourceGuildId, sourceChannelId);
}

/**
 * Tenta buscar um canal de log, priorizando a versão espelhada.
 * Se o canal espelhado não for encontrado, usa o ID original como fallback.
 * @param {import('discord.js').Client} client O cliente do Discord.
 * @param {string} originalChannelId O ID do canal de log original (hardcoded).
 * @returns {Promise<import('discord.js').TextChannel | null>}
 */
export async function resolveLogChannel(client, originalChannelId) {
    const mirroredId = resolveMirroredChannelId(originalChannelId);

    if (mirroredId) {
        const mirroredChannel = await client.channels.fetch(mirroredId).catch(() => null);
        if (mirroredChannel && mirroredChannel.isTextBased()) {
            return mirroredChannel;
        }
    }

    // Fallback para o canal original se o espelhado não for encontrado
    const originalChannel = await client.channels.fetch(originalChannelId).catch(() => null);
    if (originalChannel && originalChannel.isTextBased()) {
        return originalChannel;
    }

    return null;
}