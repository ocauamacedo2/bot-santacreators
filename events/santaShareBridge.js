import { mkdir, readFile, writeFile } from 'node:fs/promises';

const logChannels = {
  general: '1557160033324630086', enter: '1557160105525518418', leave: '1557160146986340383',
  move: '1557160183770255401', stream: '1557160258424545402', mute: '1557160294114000976',
  unmute: '1557160322790596732', active: '1557160836588380290', create: '1557160787011838082'
};

export default function installSantaShareBridge(client) {
  const flag = Symbol.for('SantaCreators.SantaShareBridge');
  if (client[flag]) return;
  const guildId = process.env.SANTA_SHARE_GUILD_ID, secret = process.env.SANTA_SHARE_BRIDGE_SECRET;
  const site = process.env.SANTA_SHARE_URL;
  if (!guildId || !site || !secret || secret.length < 64 || !site.startsWith('https://')) {
    console.error('[SANTA SHARE BRIDGE] Configure SANTA_SHARE_GUILD_ID, SANTA_SHARE_URL e SANTA_SHARE_BRIDGE_SECRET.'); return;
  }
  client[flag] = true;
  const joined = new Map();
  let chain = Promise.resolve(), pending = 0, syncing = false, panelId, lastPanel = 0;
  function queue(task) {
    if (pending >= 300) { console.error('[SANTA SHARE BRIDGE] Fila de logs cheia.'); return; }
    pending++; chain = chain.then(task).catch(error => console.error('[SANTA SHARE BRIDGE] Log não enviado:', error.code || error.name)).finally(() => pending--);
  }
  function record(title, userId, channelId, extra, category) {
    const embed = { title, color: 0xa855f7, timestamp: new Date().toISOString(),
      footer: { text: 'Santa Creators • Call real do Discord' }, fields: [
        { name: 'Usuário', value: userId ? `<@${userId}>\nID: ${userId}` : 'Identidade não fornecida por este evento.', inline: true },
        { name: 'Canal de voz', value: channelId ? `<#${channelId}>\nID: ${channelId}` : 'Sem canal', inline: true },
        ...(extra ? [{ name: 'Detalhes', value: extra.slice(0, 1000) }] : [])
      ] };
    queue(async () => {
      for (const id of new Set([logChannels.general, logChannels[category]])) {
        const channel = await client.channels.fetch(id);
        if (channel?.guildId === guildId && channel.isTextBased()) await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
      }
    });
  }
  client.on('voiceStateUpdate', (before, after) => {
    if (after.guild.id !== guildId) return;
    const id = after.id, time = Date.now(), duration = joined.has(id) ? `Tempo observado no canal: ${Math.round((time - joined.get(id)) / 1000)}s.` : 'Entrada anterior ao início deste módulo; duração desconhecida.';
    if (!before.channelId && after.channelId) { joined.set(id, time); record('Entrada na call do Discord', id, after.channelId, '', 'enter'); }
    else if (before.channelId && !after.channelId) { record('Saída da call do Discord', id, before.channelId, duration, 'leave'); joined.delete(id); }
    else if (before.channelId !== after.channelId) {
      record('Mudança de call no Discord', id, after.channelId, `Origem: <#${before.channelId}>\nDestino: <#${after.channelId}>\n${duration}`, 'move'); joined.set(id, time);
    }
    if (!after.channelId) return;
    for (const [property, label] of [['selfMute', 'Microfone do usuário'], ['serverMute', 'Mute aplicado pelo servidor']]) {
      if (before[property] !== after[property]) record(after[property] ? 'Mute na call do Discord' : 'Desmute na call do Discord', id, after.channelId, label, after[property] ? 'mute' : 'unmute');
    }
    if (before.streaming !== after.streaming) record(after.streaming ? 'Transmissão nativa do Discord iniciada' : 'Transmissão nativa do Discord encerrada', id, after.channelId, 'Transmissão dentro do Discord, independente do site.', 'stream');
    if (before.selfVideo !== after.selfVideo) record(after.selfVideo ? 'Câmera do Discord ligada' : 'Câmera do Discord desligada', id, after.channelId, '', 'general');
    for (const property of ['selfDeaf', 'serverDeaf']) if (before[property] !== after[property]) record('Áudio da call alterado', id, after.channelId, `${property}: ${after[property] ? 'ativado' : 'desativado'}`, 'general');
  });
  client.on('channelCreate', channel => {
    if (channel.guildId === guildId && [2, 13].includes(channel.type)) record('Canal de voz criado no Discord', null, channel.id, 'Criador não identificado por este evento.', 'create');
  });
  async function sync() {
    if (syncing || !client.isReady()) return;
    syncing = true;
    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild || guild.available === false) return;
      const states = [...guild.voiceStates.cache.values()].filter(state => state.channelId);
      const response = await fetch(`${site.replace(/\/$/, '')}/api/bridge/voice`, { method: 'POST', signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ guildId, users: states.map(state => ({ id: state.id, channelId: state.channelId,
          channelName: state.channel?.name || 'Call Discord', muted: !!(state.selfMute || state.serverMute) })) }) });
      if (!response.ok) console.error('[SANTA SHARE BRIDGE] Sincronização recusada:', response.status);
      if (Date.now() - lastPanel > 60000) {
        lastPanel = Date.now();
        const calls = [...new Set(states.map(state => state.channelId))];
        const description = calls.map(id => `<#${id}> · ${states.filter(state => state.channelId === id).length} pessoas`).join('\n').slice(0, 3800) || 'Nenhuma call ocupada agora.';
        queue(async () => {
          const channel = await client.channels.fetch(logChannels.active);
          if (channel?.guildId !== guildId || !channel.isTextBased()) return;
          const message = { embeds: [{ title: 'Santa Creators • Calls ativas no Discord', description,
            color: 0xa855f7, timestamp: new Date().toISOString(), footer: { text: 'Canais de voz reais • Atualização a cada minuto' } }], allowedMentions: { parse: [] } };
          if (panelId) {
            try { await (await channel.messages.fetch(panelId)).edit(message); return; }
            catch (error) { if (error.code !== 10008) throw error; }
          }
          panelId = (await channel.send(message)).id;
          await mkdir('data', { recursive: true }); await writeFile('data/santa_share_voice_panel.json', JSON.stringify({ id: panelId }));
        });
      }
    } catch (error) { console.error('[SANTA SHARE BRIDGE] Sincronização indisponível:', error.name); }
    finally { syncing = false; }
  }
  let started = false;
  async function start() {
    if (started || !client.isReady()) return; started = true;
    try { panelId = JSON.parse(await readFile('data/santa_share_voice_panel.json', 'utf8')).id; } catch {}
    void sync(); const timer = setInterval(() => { void sync(); }, 10000); timer.unref();
    console.log('[SANTA SHARE BRIDGE] Integração de calls instalada.');
  }
  if (client.isReady()) void start();
  else { client.once('clientReady', start); client.once('ready', start); }
}