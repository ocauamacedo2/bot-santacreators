// /application/commands/admin/clearHandler.js
import clear from './clear.js';

export async function clearHandleMessage(message, client) {
  try {
    if (!message || message.author?.bot || !message.guild) return false;

    const PREFIX = process.env.PREFIX || '!';
    const content = message.content || '';
    if (!content.startsWith(PREFIX)) return false;

    const [cmd, ...args] = content.slice(PREFIX.length).trim().split(/\s+/);
    const name = (cmd || '').toLowerCase();

    // só trata os dois comandos
    if (name !== 'clear' && name !== 'clearbotao') return false;

    // se for clearbotao, força modo "só botões"
    if (name === 'clearbotao') {
      message.__FORCE_CLEAR_BUTTONS__ = true;
    }

    await clear.execute(message, args);
    return true;
  } catch (e) {
    console.error('[clearHandleMessage] erro:', e);
    return false;
  }
}
