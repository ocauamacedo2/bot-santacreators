import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createShareAuditQueue } from '../utils/shareAuditQueue.js';

const SANTA_CREATORS_GUILD_ID =
  '1262262852782129183';

/*
 * Servidor onde ficam os canais
 * de auditoria do Creators Share.
 *
 * Ele pode ser diferente do
 * servidor principal Santa Creators.
 */
const SANTA_SHARE_LOG_GUILD_ID =
  String(
    process.env
      .SANTA_SHARE_LOG_GUILD_ID ||
    process.env
      .LOG_GUILD_ID ||
    SANTA_CREATORS_GUILD_ID
  ).trim();

if (
  !/^\d{17,20}$/.test(
    SANTA_SHARE_LOG_GUILD_ID
  )
) {
  throw new Error(
    '[SANTA SHARE BRIDGE] SANTA_SHARE_LOG_GUILD_ID possui ID inválido.'
  );
}

function readLogChannelId(
  envName,
  fallback
) {
  const value =
    String(
      process.env[envName] ||
      fallback ||
      ''
    ).trim();

  if (
    !/^\d{17,20}$/.test(
      value
    )
  ) {
    throw new Error(
      `[SANTA SHARE BRIDGE] ${envName} possui ID inválido: ${value || '(vazio)'}`
    );
  }

  return value;
}

const logChannels =
  Object.freeze({
    general:
      readLogChannelId(
        'LOG_GENERAL_CHANNEL_ID',
        '1557160033324630086'
      ),

    enter:
      readLogChannelId(
        'LOG_ENTER_CHANNEL_ID',
        '1557160105525518418'
      ),

    leave:
      readLogChannelId(
        'LOG_LEAVE_CHANNEL_ID',
        '1557160146986340383'
      ),

    move:
      readLogChannelId(
        'LOG_MOVE_CHANNEL_ID',
        '1557160183770255401'
      ),

    stream:
      readLogChannelId(
        'LOG_STREAM_CHANNEL_ID',
        '1557160258424545402'
      ),

    mute:
      readLogChannelId(
        'LOG_MUTE_CHANNEL_ID',
        '1557160294114000976'
      ),

    unmute:
      readLogChannelId(
        'LOG_UNMUTE_CHANNEL_ID',
        '1557160322790596732'
      ),

    active:
      readLogChannelId(
        'LOG_ACTIVE_CHANNEL_ID',
        '1557160836588380290'
      ),

    create:
      readLogChannelId(
        'LOG_CREATE_CHANNEL_ID',
        '1557160787011838082'
      ),

    chat:
      readLogChannelId(
        'LOG_CHAT_CHANNEL_ID',
        '1557160033324630086'
      ),
  });

export default function installSantaShareBridge(
  client
) {
  const flag =
    Symbol.for(
      'SantaCreators.SantaShareBridge'
    );

  if (
    client[flag]
  ) {
    return;
  }

  const configuredGuildId =
    String(
      process.env
        .SANTA_SHARE_GUILD_ID ||
      process.env
        .DISCORD_GUILD_ID ||
      SANTA_CREATORS_GUILD_ID
    ).trim();

  if (
    configuredGuildId !==
    SANTA_CREATORS_GUILD_ID
  ) {
    console.error(
      '[SANTA SHARE BRIDGE] ⚠️ Guild configurada incorretamente.',
      {
        configurada:
          configuredGuildId,

        correta:
          SANTA_CREATORS_GUILD_ID,
      }
    );
  }

  /*
   * Esta integração pertence somente
   * ao servidor oficial Santa Creators.
   *
   * Não permitimos que uma variável antiga
   * faça as logs serem comparadas com outro servidor.
   */
  const guildId =
  SANTA_CREATORS_GUILD_ID;

const logGuildId =
  SANTA_SHARE_LOG_GUILD_ID;

const secret =
    String(
      process.env
        .SANTA_SHARE_BRIDGE_SECRET ||
      process.env
        .BRIDGE_SECRET ||
      ''
    ).trim();

  const site =
    String(
      process.env
        .SANTA_SHARE_URL ||
      process.env
        .PUBLIC_URL ||
      ''
    )
      .trim()
      .replace(
        /\/$/,
        ''
      );
  let bridgeReady = false;
  try { bridgeReady = new URL(site).protocol === 'https:' && secret.length >= 64; } catch {}
  if (!bridgeReady) console.error('[SANTA SHARE BRIDGE] URL/segredo inválidos. Logs do Discord continuam ativos; sincronização do site está desativada.');
  client[flag] = true;
  const joined = new Map();
  let retrySync = false, syncTimer;
const outbox =
  createShareAuditQueue(
    'data/discord-audit-outbox.json',

    async (
      id,
      embed
    ) => {
      const channel =
        await client.channels
          .fetch(
            id
          );

      if (
        channel?.guildId !==
          logGuildId ||
        !channel.isTextBased() ||
        !channel.send
      ) {
        throw new Error(
          `Canal ${id} inválido ou não pertence ao servidor de logs ${logGuildId}.`
        );
      }
///teste
      await channel.send({
        embeds: [
          embed
        ],

        allowedMentions: {
          parse: []
        }
      });
    }
  );
  outbox.catch(error => console.error('[SANTA AUDIT] Falha ao iniciar fila do bot:', error.message));
let nextAttemptAt = 0;
let consecutiveFailures = 0;
let lastDeliveredSignature = null;
let lastDeliveredAt = 0;

const FULL_SYNC_MS = 30000;

function requestSync() {
  if (syncTimer) return;

  const delay = Math.max(
    1000,
    nextAttemptAt - Date.now()
  );

  syncTimer = setTimeout(() => {
    syncTimer = null;
    void sync();
  }, delay);

  syncTimer.unref();
}
let chain = Promise.resolve(),
  pending = 0,
  syncing = false,
  panelId,
  lastPanel = 0,
  lastSyncLog = 0;
  function queue(task) {
    if (pending >= 300) { console.error('[SANTA SHARE BRIDGE] Fila de logs cheia.'); return; }
    pending++; chain = chain.then(task).catch(error => console.error('[SANTA SHARE BRIDGE] Log não enviado:', error.code || error.name)).finally(() => pending--);
  }
  function record(title, userId, channelId, extra = '', category = 'general') {
    const now = new Date();
    const unix = Math.floor(now.getTime() / 1000);
    const embed = { title, color: 0xa855f7, timestamp: now.toISOString(),
      footer: { text: 'Santa Creators • Call real do Discord' }, fields: [
        { name: 'Participante', value: userId ? `<@${userId}>\nID: ${userId}\n[Perfil](https://discord.com/users/${userId})` : 'Sistema / não identificado pelo evento', inline: true },
        { name: 'Call', value: channelId ? `<#${channelId}>\nID: ${channelId}\n[Abrir call](https://discord.com/channels/${guildId}/${channelId})` : 'Sem canal', inline: true },
        { name: 'Data e hora', value: `<t:${unix}:F>\n<t:${unix}:R>` },
        ...(extra ? [{ name: 'Detalhes', value: String(extra).slice(0, 1000) }] : [])
      ] };
    void outbox.then(queue => queue.enqueue([logChannels.general, logChannels[category]], embed))
      .catch(error => console.error('[SANTA AUDIT] Registro não persistido:', error.message));
  }
  client.on('voiceStateUpdate', (before, after) => {
    if (after.guild.id !== guildId) return;
    const id = after.id, time = Date.now(), duration = joined.has(id) ? `Tempo observado no canal: ${Math.round((time - joined.get(id)) / 1000)}s.` : 'Entrada anterior ao início deste módulo; duração desconhecida.';
    if (!before.channelId && after.channelId) {
      joined.set(id, time);

      record(
        'Entrada na call do Discord',
        id,
        after.channelId,
        '',
        'enter'
      );
    }

    else if (before.channelId && !after.channelId) {
      record(
        'Saída da call do Discord',
        id,
        before.channelId,
        duration,
        'leave'
      );

      joined.delete(id);
    }

    else if (before.channelId !== after.channelId) {
      record(
        'Mudança de call no Discord',
        id,
        after.channelId,
        `Origem: <#${before.channelId}>\nDestino: <#${after.channelId}>\n${duration}`,
        'move'
      );

      joined.set(id, time);
    }

    /*
     * Não espera o próximo ciclo de 10 segundos.
     * Sempre que uma mudança de voz acontecer,
     * tenta sincronizar imediatamente com o site.
     */
    requestSync();
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
    if (!client.isReady()) return;
    if (syncing) { retrySync = true; return; }
    syncing = true;
    try {
      if (!client.options.intents.has(128)) {
        throw new Error('GuildVoiceStates ausente. Ative esse intent antes de conectar o bot.');
      }
      const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId);
      if (!guild || guild.available === false) throw new Error(`Servidor ${guildId} indisponível para o bot.`);
      const states = [...guild.voiceStates.cache.values()].filter(state => state.channelId);
      if (bridgeReady) {
        try {
          const response = await fetch(`${site}/api/bridge/voice`, {
            method: 'POST', signal: AbortSignal.timeout(10000),
            headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ guildId, generatedAt: new Date().toISOString(), users: states.map(state => ({
              id: state.id, channelId: state.channelId,
              channelName: state.channel?.name || 'Call Discord', muted: !!(state.selfMute || state.serverMute)
            })) })
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
          if (Date.now() - lastSyncLog > 60000) {
            lastSyncLog = Date.now();
            console.log('[SANTA SHARE BRIDGE] Sincronização OK:', { guildId, usuariosEmCall: states.length });
          }
        } catch (error) {
          console.error('[SANTA SHARE BRIDGE] Site não recebeu snapshot:', error.message);
        }
      }
      if (Date.now() - lastPanel > 60000) {
        lastPanel = Date.now();
        const calls = [...new Set(states.map(state => state.channelId))];
        const description = calls.map(id => `<#${id}> · ${states.filter(state => state.channelId === id).length} pessoas`).join('\n').slice(0, 3800) || 'Nenhuma call ocupada agora.';
        queue(async () => {
const channel =
  await client.channels
    .fetch(
      logChannels.active
    );

if (
  channel?.guildId !==
    logGuildId ||
  !channel.isTextBased()
) {
  return;
}
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
    } catch (error) {
      console.error(
        '[SANTA SHARE BRIDGE] Sincronização indisponível:',
        {
          name:
            error?.name ||
            null,

          message:
            error?.message ||
            String(error),

          cause:
            error?.cause?.message ||
            null
        }
      );
    }

    finally {
      syncing = false;
      if (retrySync) { retrySync = false; requestSync(); }
    }
  }
  let started = false;
  async function start() {
    if (started || !client.isReady()) return; started = true;
    try { panelId = JSON.parse(await readFile('data/santa_share_voice_panel.json', 'utf8')).id; } catch {}
    void sync(); const timer = setInterval(() => { void sync(); }, 10000); timer.unref();
    if (!client.options.intents.has(128)) console.error('[SANTA SHARE BRIDGE] GuildVoiceStates ausente. Aplique a alteração no core e reinicie o bot.');
    record('Auditoria das calls Discord inicializada', null, null, `Servidor: ${guildId}. Entradas anteriores ao início não são contabilizadas como novas entradas.`);
    client.on('shardResume', requestSync);
    client.on('guildAvailable', guild => { if (guild.id === guildId) requestSync(); });
    console.log('[SANTA SHARE BRIDGE] Integração de calls instalada.');
  }
  if (client.isReady()) void start();
  else { client.once('clientReady', start); client.once('ready', start); }
}
