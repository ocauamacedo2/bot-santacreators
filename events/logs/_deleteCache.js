// /application/events/logs/_deleteCache.js
// Cache simples pra conseguir saber autor/embeds/components mesmo quando o delete vem "vazio".

const MAX_PER_CHANNEL = 80; // guarda as últimas 80 msgs por canal
const TTL_MS = 1000 * 60 * 60 * 6; // 6 horas

// global pra sobreviver a imports múltiplos
globalThis.__SC_DELETE_CACHE__ ??= {
  byChannel: new Map(), // channelId -> Map(messageId -> cached)
};

function now() { return Date.now(); }

function pruneChannel(map) {
  // remove expirados
  const t = now();
  for (const [id, v] of map.entries()) {
    if (t - (v.cachedAt ?? 0) > TTL_MS) map.delete(id);
  }
  // limita tamanho
  while (map.size > MAX_PER_CHANNEL) {
    // remove o mais antigo
    let oldestKey = null;
    let oldestAt = Infinity;
    for (const [k, v] of map.entries()) {
      const at = v.cachedAt ?? 0;
      if (at < oldestAt) { oldestAt = at; oldestKey = k; }
    }
    if (!oldestKey) break;
    map.delete(oldestKey);
  }
}

export function cacheMessage(message) {
  try {
    if (!message?.id || !message?.channelId) return;

    const chId = message.channelId;
    const store = globalThis.__SC_DELETE_CACHE__.byChannel;

    if (!store.has(chId)) store.set(chId, new Map());
    const map = store.get(chId);

    const cached = {
      cachedAt: now(),
      id: message.id,
      channelId: chId,
      guildId: message.guildId ?? null,

      author: message.author ? {
        id: message.author.id,
        tag: message.author.tag ?? message.author.username ?? null,
        bot: !!message.author.bot,
        avatar: message.author.displayAvatarURL?.({ size: 256 }) ?? null,
      } : null,

      content: message.content ?? null,

      // guarda embeds “crus” (discord.js já dá objetos prontos)
      embeds: Array.isArray(message.embeds) ? message.embeds : [],

      // guarda components (botões, selects, etc)
      components: Array.isArray(message.components) ? message.components : [],

      // anexos (urls)
      attachments: message.attachments?.size
        ? [...message.attachments.values()].map(a => ({
            url: a.url,
            name: a.name ?? null,
          }))
        : [],

      webhookId: message.webhookId ?? null,
      createdTimestamp: message.createdTimestamp ?? null,
    };

    map.set(message.id, cached);
    pruneChannel(map);
  } catch {}
}

export function getCachedMessage(channelId, messageId) {
  try {
    const store = globalThis.__SC_DELETE_CACHE__.byChannel;
    const map = store.get(channelId);
    if (!map) return null;
    return map.get(messageId) ?? null;
  } catch {
    return null;
  }
}
