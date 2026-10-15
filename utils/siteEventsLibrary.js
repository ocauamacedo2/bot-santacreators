import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { PermissionFlagsBits } from 'discord.js';
import { createShareAuditQueue } from './shareAuditQueue.js';
import { isOfficialSantaCreatorsTeamMember } from '../events/hierarquiaDivisoes.js';

const MAIN = '1457573495952248883';
const MENUS = '1457577651152883797';

const EDIT_ROLES = [
  '1262262852949905408',
  '1352408327983861844',
  '1262262852949905409',
  '1352407252216184833',
  '1388976314253312100'
];

const SECTIONS = ['links', 'uniforms', 'adms', 'audios', 'org', 'daily', 'rules', 'cds'];

const fail = (status, message) =>
  Object.assign(new Error(message), { status });

const digest = value =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function eventMediaUrl(value) {
  let url;

  try {
    url = new URL(String(value || '').trim());
  } catch {
    throw fail(400, 'Use um link HTTPS válido.');
  }

  if (url.protocol !== 'https:' || url.username || url.password) {
    throw fail(400, 'Use um link HTTPS válido.');
  }

  return url.href;
}

export function createSiteEventsLibrary({ client }) {
  const folder = resolve(
    process.env.SANTA_SITE_HISTORY_DIR || 'data/site-history'
  );

  const file = join(folder, 'events-library.json');
  const confirmations = new Map();

  const publicationAudit = createShareAuditQueue(
    join(folder, 'events-publication-audit.json'),
    async (channelId, job) => {
      if (!client.isReady()) {
        throw new Error('O bot ainda não está conectado ao Discord.');
      }

      const audit = client.channels.cache.get(channelId) ||
        await client.channels.fetch(channelId);

      if (!audit?.isTextBased() || audit.guildId !== job.guildId) {
        throw new Error('Canal de logs de publicação inválido.');
      }

      await audit.send({
        ...job.payload,
        files: (job.payload.files || []).map(item => ({
          ...item,
          attachment: Buffer.from(item.attachment.data || item.attachment),
        })),
      });
    }
  );

  void publicationAudit.catch(error => {
    console.error('[EVENT RULES AUDIT] Fila indisponível:', {
      name: error.name,
      message: error.message,
    });
  });

  let writes = Promise.resolve();

  const serial = task => {
    const operation = writes.then(task);
    writes = operation.catch(() => {});
    return operation;
  };

  async function read() {
    let state;

    try {
      state = JSON.parse(await readFile(file, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') {
        return {
          items: {},
          hidden: {},
          covers: {}
        };
      }

      if (error instanceof SyntaxError) {
        throw fail(
          503,
          'O JSON da biblioteca de eventos está inválido. Nenhum dado foi alterado.'
        );
      }

      throw error;
    }

    if (
      !state ||
      typeof state !== 'object' ||
      Array.isArray(state)
    ) {
      throw fail(
        503,
        'A estrutura da biblioteca de eventos está inválida. Nenhum dado foi alterado.'
      );
    }

    for (const key of ['items', 'hidden', 'covers']) {
      if (!Object.hasOwn(state, key)) {
        state[key] = {};
        continue;
      }

      if (
        !state[key] ||
        typeof state[key] !== 'object' ||
        Array.isArray(state[key])
      ) {
        throw fail(
          503,
          'O campo ' + key + ' da biblioteca de eventos está inválido. Nenhum dado foi alterado.'
        );
      }
    }

    for (const key of ['targets', 'names', 'publications', 'localEvents', 'removedEvents']) {
      if (
        Object.hasOwn(state, key) &&
        (
          !state[key] ||
          typeof state[key] !== 'object' ||
          Array.isArray(state[key])
        )
      ) {
        throw fail(
          503,
          'O campo ' + key + ' da biblioteca de eventos está inválido. Nenhum dado foi alterado.'
        );
      }
    }

    return state;
  }

  async function save(state) {
    await mkdir(folder, {
      recursive: true,
      mode: 0o700
    });

    const temporary =
      file + '.' + randomUUID() + '.tmp';

    try {
      await writeFile(
        temporary,
        JSON.stringify(state),
        {
          mode: 0o600
        }
      );

      await rename(
        temporary,
        file
      );
    } finally {
      await unlink(temporary).catch(error => {
        if (error.code !== 'ENOENT') {
          console.warn(
            '[EVENT LIBRARY] Limpeza temporária:',
            error.message
          );
        }
      });
    }
  }

  const mayEdit = member =>
    member.id === '660311795327828008' ||
    EDIT_ROLES.some(id => member.roles.cache.has(id));

  const mayDeleteEvent = member =>
    member?.id === '660311795327828008' ||
    [
      '1262262852949905408',
      '1352408327983861844',
      '1262262852949905409',
      '1352407252216184833'
    ].some(id => member?.roles?.cache?.has(id));

  const mayReadLibrary = (guild, member) =>
    member?.guild?.id === guild.id &&
    member.user?.bot !== true &&
    (
      mayEdit(member) ||
      isOfficialSantaCreatorsTeamMember(member)
    );

  async function channel(guild, member, id, parent = null) {
    if (!member || member.guild?.id !== guild.id) {
      throw fail(403, 'Membro inválido para este servidor.');
    }

    const value =
      guild.channels.cache.get(id) ||
      await guild.channels.fetch(id);

    if (
      !value ||
      value.guildId !== guild.id ||
      (parent && value.parentId !== parent) ||
      value.type === 12
    ) {
      throw fail(403, 'Canal de evento inválido ou privado.');
    }

    const cdsChannelId = String(
      process.env.SANTA_EVENTS_CDS_CHANNEL_ID || ''
    ).trim();

    const isLibraryChannel =
      value.id === MAIN ||
      value.id === MENUS ||
      (
        value.type === 11 &&
        value.parentId === MENUS
      ) ||
      (
        cdsChannelId !== '' &&
        value.id === cdsChannelId
      );

    const siteReadAllowed =
      isLibraryChannel &&
      mayReadLibrary(guild, member);

    const permissions = value.permissionsFor(member);

    if (
      member.id !== '660311795327828008' &&
      !siteReadAllowed &&
      (
        !permissions?.has(PermissionFlagsBits.ViewChannel) ||
        !permissions.has(PermissionFlagsBits.ReadMessageHistory)
      )
    ) {
      throw fail(403, 'Você não pode visualizar este conteúdo no Discord.');
    }

    return value;
  }

  async function catalog(guild, member) {
    await channel(guild, member, MAIN);

    let state;

    try {
      state = JSON.parse(
        await readFile(resolve('data/evt3_events_state.json'), 'utf8')
      );
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      state = { evt3Events: {} };
    }

    if (
      !state ||
      typeof state !== 'object' ||
      Array.isArray(state)
    ) {
      throw fail(
        503,
        'O estado dos eventos possui estrutura inválida. Nenhum catálogo vazio foi criado para substituir os dados.'
      );
    }

    if (state.evt3Events == null) {
      state.evt3Events = {};
    }

    if (
      typeof state.evt3Events !== 'object' ||
      Array.isArray(state.evt3Events)
    ) {
      throw fail(
        503,
        'O campo evt3Events está inválido. Os dados existentes foram preservados.'
      );
    }

    for (const [id, value] of Object.entries(state.evt3Events)) {
      if (
        !value ||
        typeof value !== 'object' ||
        Array.isArray(value)
      ) {
        throw fail(
          503,
          'O evento ' + id + ' possui estrutura inválida. Os dados existentes foram preservados.'
        );
      }

      if (
        value.areas != null &&
        (
          typeof value.areas !== 'object' ||
          Array.isArray(value.areas)
        )
      ) {
        throw fail(
          503,
          'As áreas do evento ' + id + ' estão inválidas. Os dados existentes foram preservados.'
        );
      }

      for (const [section, area] of Object.entries(value.areas || {})) {
        if (
          !area ||
          typeof area !== 'object' ||
          Array.isArray(area)
        ) {
          throw fail(
            503,
            'A área ' + section + ' do evento ' + id + ' está inválida. Os dados existentes foram preservados.'
          );
        }
      }
    }

    const grouped = new Map();
    for (const [id, value] of Object.entries(state.evt3Events || {})) {
      const name = String(value.eventName || 'Evento')
        .replace(/^[#\s]+/, '').replace(/[*_`]/g, '').trim();
      const key = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ');
      let event = grouped.get(key);
      if (!event) {
        event = { id, name, aliasIds: [], areas: {} };
        grouped.set(key, event);
      }
      event.aliasIds.push(id);
      for (const [section, area] of Object.entries(value.areas || {})) {
        const ids = event.areas[section]?.threadIds || [];
        if (area.threadId && !ids.includes(area.threadId)) ids.push(area.threadId);
        event.areas[section] = { ...area, threadId: ids[0], threadIds: ids };
      }
    }
    const events = [...grouped.values()];
    const libraryState = await read();

    for (const [id, record] of Object.entries(
      libraryState.localEvents || {}
    )) {
      if (
        record?.guildId !== guild.id ||
        libraryState.removedEvents?.[guild.id + ':' + id]
      ) {
        continue;
      }

      events.push({
        id,
        name: record.name,
        aliasIds: [id],
        areas: {},
        siteCreated: true
      });
    }

    const cds = String(
      process.env.SANTA_EVENTS_CDS_CHANNEL_ID || ''
    ).trim();

    if (cds) {
      try {
        await channel(guild, member, cds);

        events.push({
          id: 'cds',
          name: 'CDS • Locais dos eventos',
          areas: {
            cds: { threadId: cds }
          }
        });
      } catch (error) {
        if (error.status !== 403) throw error;
      }
    }

    return events.filter(event =>
      !(event.aliasIds || [event.id]).some(id =>
        libraryState.removedEvents?.[guild.id + ':' + id]
      )
    );
  }

  async function eventSources(guild, member, event, section) {
    if (!SECTIONS.includes(section)) throw fail(400, 'Seção inválida.');
    const state = await read();
    const saved = state.targets?.[guild.id + ':' + event.id + ':' + section];
    const ids = section === 'cds'
      ? [String(process.env.SANTA_EVENTS_CDS_CHANNEL_ID || '')]
      : [saved, ...(event.areas[section]?.threadIds || []), event.areas[section]?.threadId];
    const result = [];
    for (const id of new Set(ids.filter(Boolean))) {
      try {
        result.push(await channel(guild, member, id, section === 'cds' ? null : MENUS));
      } catch (error) {
        if (Number(error.code) !== 10003) throw error;
      }
    }
    return result;
  }

  async function target(guild, member, event, section) {
    return serial(async () => {
      const existing = await eventSources(guild, member, event, section);
      if (existing.length) return existing[0];
      if (section === 'cds') throw fail(409, 'Configure o canal de CDS antes de editar.');
      const parent = await channel(guild, member, MENUS);
      const created = await parent.threads.create({
        name: (event.name + ' • ' + section).slice(0, 100),
        type: 11,
        autoArchiveDuration: 1440,
        reason: 'Biblioteca de eventos da Santa Creators'
      });
      const state = await read();
      state.targets ||= {};
      state.targets[guild.id + ':' + event.id + ':' + section] = created.id;
      await save(state);
      return created;
    });
  }

  function mediaOf(message) {
    const result = [];

    const add = (url, kind) => {
      try {
        url = eventMediaUrl(url);
      } catch {
        return;
      }

      if (!result.some(item => item.url === url)) {
        result.push({ url, kind });
      }
    };

    for (const attachment of message.attachments.values()) {
      const kind = attachment.contentType?.startsWith('image/')
        ? 'image'
        : attachment.contentType?.startsWith('audio/')
          ? 'audio'
          : attachment.contentType?.startsWith('video/')
            ? 'video'
            : 'link';

      add(attachment.url, kind);
    }

    for (const embed of message.embeds) {
      if (embed.image?.url) {
        add(
          embed.image.url,
          'image'
        );
      }

      if (embed.thumbnail?.url) {
        add(
          embed.thumbnail.url,
          'image'
        );
      }
    }

    for (
      const value of
      String(message.content || '').match(/https:\/\/[^\s<>]+/g) || []
    ) {
      const url = value.replace(/[),;]+$/, '');

      let extension;

      try {
        extension = new URL(url).pathname.toLowerCase();
      } catch {
        continue;
      }

      const kind = /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/.test(extension)
        ? 'image'
        : /\.(mp3|wav|ogg|m4a|aac|flac)$/.test(extension)
          ? 'audio'
          : /\.(mp4|webm|mov|m4v)$/.test(extension)
            ? 'video'
            : 'link';

      add(url, kind);
    }

    return result.slice(0, 12);
  }

  async function messages(value) {
    const result = new Map();
    let before;

    for (let page = 0; page < 5; page++) {
      const batch = await value.messages.fetch({
        limit: 100,
        ...(before ? { before } : {})
      });

      if (!batch.size) {
        return {
          items: [...result.values()],
          truncated: false
        };
      }

      let oldest;

      for (const message of batch.values()) {
        const id = String(message.id);

        if (!/^\d{17,20}$/.test(id)) {
          throw fail(
            503,
            'Uma mensagem da biblioteca possui ID inválido.'
          );
        }

        if (
          before &&
          BigInt(id) >= BigInt(before)
        ) {
          if (result.has(id)) {
            continue;
          }

          throw fail(
            503,
            'A paginação da biblioteca retornou uma mensagem fora do período solicitado.'
          );
        }

        result.set(id, message);

        if (
          !oldest ||
          BigInt(id) < BigInt(oldest)
        ) {
          oldest = id;
        }
      }

      if (
        !oldest ||
        (
          before &&
          BigInt(oldest) >= BigInt(before)
        )
      ) {
        throw fail(
          503,
          'A paginação da biblioteca não avançou. Os dados anteriores devem ser preservados.'
        );
      }

      if (batch.size < 100) {
        return {
          items: [...result.values()],
          truncated: false
        };
      }

      before = oldest;
    }

    return {
      items: [...result.values()],
      truncated: true
    };
  }

  async function snapshot(guild, member, payload) {
    const events = await catalog(guild, member);
    const state = await read();

    const result = {
      events: events.map(event => ({
        ...event,

        publicationEventId:
          (event.aliasIds || [event.id]).find(id =>
            state.publications?.[
              guild.id + ':' + id
            ]?.online === true
          ) || null,

               publicationOnline:
          (event.aliasIds || [event.id]).some(id =>
            Boolean(
              state.publications?.[
                guild.id + ':' + id
              ]?.online
            )
          ),

        name:
          state.names?.[guild.id + ':' + event.id] ||
          (event.aliasIds || [event.id])
            .map(
              id =>
                state.names?.[guild.id + ':' + id]
            )
            .find(Boolean) ||
          event.name,
        metadataRevision: digest([
          (event.aliasIds || [event.id])
            .slice()
            .sort(),

          Object.values(state.items)
            .filter(item =>
              item.guildId === guild.id &&
              (event.aliasIds || [event.id]).includes(
                item.eventId
              )
            )
            .map(item => [
              item.id,
              item.revision
            ])
            .sort((a, b) =>
              String(a[0]).localeCompare(
                String(b[0])
              )
            ),

          state.names?.[guild.id + ':' + event.id] ||
          (event.aliasIds || [event.id])
            .map(
              id =>
                state.names?.[guild.id + ':' + id]
            )
            .find(Boolean) ||
          event.name,

          Object.hasOwn(
            state.covers,
            guild.id + ':' + event.id
          )
            ? state.covers[guild.id + ':' + event.id]
            : (event.aliasIds || [event.id])
                .map(id =>
                  state.covers[guild.id + ':' + id]
                )
                .find(Boolean) || ''
        ]),
        cover: Object.hasOwn(state.covers, guild.id + ':' + event.id)
          ? state.covers[guild.id + ':' + event.id]
          : (event.aliasIds || [event.id]).map(id => state.covers[guild.id + ':' + id]).find(Boolean) || ''
      })),
      rights: {
        edit: mayEdit(member),
        createEvent: mayEdit(member),
        deleteEvent: mayDeleteEvent(member)
      },
      sections: {},
      warnings: []
    };

    if (!payload.eventId) return result;

    const event = events.find(value => value.id === payload.eventId);

    if (!event) throw fail(404, 'Evento não encontrado.');

    const all = Object.values(state.items).filter(
      item => item.guildId === guild.id && (event.aliasIds || [event.id]).includes(item.eventId)
    );

    const mirrored = new Set(
      all.flatMap(item => item.messageIds || [])
    );

    for (const section of SECTIONS) {
      if (event.id === 'cds' && section !== 'cds') continue;
      if (event.id !== 'cds' && section === 'cds') continue;

           result.sections[section] = [];
      if (payload.section && payload.section !== section) continue;

    

      {
        try {
          const sources = await eventSources(guild, member, event, section);
          for (const source of sources) {
          const page = await messages(source);

          if (page.truncated) {
            result.warnings.push(
              'A seção ' + section +
              ' possui mais de 500 mensagens; foram carregadas as mais recentes.'
            );
          }

          for (const message of page.items.reverse()) {
            if (message.components.length || mirrored.has(message.id)) {
              continue;
            }

            const id = source.id + ':' + message.id;

            if (
              state.hidden[guild.id + ':' + id] ||
              all.some(item => item.sourceId === id)
            ) {
              continue;
            }

            const text = [
              message.content,
              ...message.embeds.flatMap(embed => [
                embed.title,
                embed.description,
                ...(embed.fields || []).map(
                  field => field.name + '\n' + field.value
                )
              ])
            ].filter(Boolean).join('\n');

            const media = mediaOf(message);

            if (!text.trim() && !media.length) continue;

            result.sections[section].push({
              id,
              eventId: event.id,
              section,
              title: text.split('\n')[0].slice(0, 120) || 'Mídia do evento',
              text,
              media,
              revision: digest([text, media]),
              source: true
            });
          }
          }
        } catch (error) {
          if (
            error.status === 403 ||
            error.status === 401
          ) {
            throw error;
          }

          throw Object.assign(
            fail(
              503,
              'Não foi possível ler a seção ' +
              section +
              '. A consulta anterior deve ser preservada.'
            ),
            {
              cause: error
            }
          );
        }
      }

      result.sections[section].push(
        ...all.filter(item => item.section === section)
      );
    }

    result.rulesRevision =
      digest(
        result.sections.rules || []
      );

    return result;
  }

  function input(payload) {
    const value = {
      id: String(payload.id || ''),
      eventId: String(payload.eventId || ''),
      section: String(payload.section || ''),
      title: String(payload.title || '').trim(),
      text: String(payload.text || ''),
      revision: String(payload.revision || ''),
      cover: payload.cover ? eventMediaUrl(payload.cover) : '',
      media: (
        Array.isArray(payload.media) ? payload.media : []
      ).map(item => {
        if (
          !item ||
          typeof item !== 'object' ||
          Array.isArray(item)
        ) {
          throw fail(
            400,
            'Uma mídia do evento possui formato inválido.'
          );
        }

        return {
          kind:
            ['image', 'audio', 'video', 'link'].includes(
              item.kind
            )
              ? item.kind
              : 'link',

          url:
            eventMediaUrl(item.url)
        };
      })
    };

    if (
      !SECTIONS.includes(value.section) ||
      !value.title ||
      value.title.length > 120 ||
      value.text.length > (value.section === 'rules' ? 25000 : 10000) ||
      value.media.length > 12
    ) {
      throw fail(
        400,
        'Use título de até 120 caracteres, texto de até 10000 (25000 nas regras) e no máximo 12 links.'
      );
    }

    return value;
  }

  async function publishedRules(
    guild,
    payload
  ) {
    const state =
      await read();

    const records =
      Object.entries(
        state.publications || {}
      ).filter(
        ([key, value]) =>
          key.startsWith(
            guild.id + ':'
          ) &&
          value.online
      );

    const events =
      records.map(
        ([, value]) => ({
          id:
            value.eventId,

          name:
            state.names?.[
              guild.id + ':' + value.eventId
            ] || value.name,

          cover:
            Object.hasOwn(
              state.covers,
              guild.id + ':' + value.eventId
            )
              ? state.covers[guild.id + ':' + value.eventId]
              : value.cover ||
                (
                  Array.isArray(value.rules)
                    ? value.rules
                    : []
                )
                  .flatMap(rule =>
                    Array.isArray(rule?.media)
                      ? rule.media
                      : []
                  )
                  .find(media =>
                    media?.kind === 'image'
                  )?.url ||
                '',

          publicationOnline:
            true,

          publishedAt:
            value.publishedAt,
        })
      );

    const selected =
      records.find(
        ([, value]) =>
          value.eventId ===
            String(
              payload.eventId || ''
            )
      )?.[1];

    return {
      events,

      sections: {
        rules:
          selected?.rules || [],
      },

      rights: {
        edit:
          false,
      },

      warnings:
        payload.eventId &&
        !selected
          ? [
              'As regras deste evento não estão publicadas.',
            ]
          : [],

      publicRules:
        true,
    };
  }

  async function publishRules(
    guild,
    member,
    payload
  ) {
    return serial(
      async () => {
        const decision = consumeEventDecision(
          guild,
          member,
          'events.publish',
          payload
        );

        payload = {
          ...payload,
          ...decision
        };

        const data =
          await snapshot(
            guild,
            member,
            {
              eventId:
                payload.eventId,

              section:
                'rules',
            }
          );

        const event =
          data.events.find(
            item =>
              item.id ===
                payload.eventId
          );

        if (
          !event ||
          event.id === 'cds'
        ) {
          throw fail(
            404,
            'Evento inválido.'
          );
        }

        if (
          ![
            'online',
            'offline',
          ].includes(
            payload.status
          )
        ) {
          throw fail(
            400,
            'Estado de publicação inválido.'
          );
        }

        const rules =
          data.sections.rules || [];

        if (
          payload.status === 'online' &&
          data.warnings.length
        ) {
          throw fail(
            409,
            'Resolva os avisos de leitura antes de publicar as regras.'
          );
        }

        if (
          digest(rules) !==
            payload.rulesRevision
        ) {
          throw fail(
            409,
            'As regras mudaram. Confira o conteúdo novamente.'
          );
        }

        if (
          payload.status === 'online' &&
          !rules.length
        ) {
          throw fail(
            400,
            'Adicione as regras antes de publicar.'
          );
        }

        const state =
          await read();

        state.publications ||= {};

        const key =
          guild.id + ':' +
          event.id;

        const previous =
          state.publications[key] ||
          null;

        const record = {
          eventId:
            event.id,

          name:
            event.name,

          cover:
            event.cover || '',

          online:
            payload.status ===
              'online',

          rules:
            JSON.parse(
              JSON.stringify(
                rules
              )
            ),

          publishedAt:
            Date.now(),

          publishedBy:
            member.id,
        };

        state.publications[key] =
          record;

        await save(state);

        let auditWarning = '';

        try {
          const channelId = String(
            process.env.SANTA_EVENTS_PUBLICATION_LOG_CHANNEL_ID ||
            '1554381360200683581'
          ).trim();

          if (!/^\d{17,20}$/.test(channelId)) {
            throw new Error('SANTA_EVENTS_PUBLICATION_LOG_CHANNEL_ID inválido.');
          }

          const queue = await publicationAudit;

          const before =
            JSON.stringify(
              previous,
              null,
              2
            );

          const after =
            JSON.stringify(
              record,
              null,
              2
            );

          await queue.enqueue([channelId], {
            guildId: guild.id,
            payload: {
            content:
              'Publicação de regras: **' +
              event.name +
              '** — **' +
              payload.status.toUpperCase() +
              '**',

            embeds: [
              {
                color:
                  record.online
                    ? 0x57F287
                    : 0xED4245,

                author: {
                  name:
                    member.displayName,

                  icon_url:
                    member.user
                      .displayAvatarURL(),

                  url:
                    'https://discord.com/users/' +
                    member.id,
                },

                description:
                  'Responsável: <@' +
                  member.id +
                  '>\nData: <t:' +
                  Math.floor(
                    record.publishedAt /
                      1000
                  ) +
                  ':F>',
              },
            ],

            files: [
              {
                attachment:
                  Buffer.from(
                    'ANTES\n' +
                    before +
                    '\n\nDEPOIS\n' +
                    after
                  ),

                name:
                  'publicacao-' +
                  event.id +
                  '.txt',
              },
            ],

            allowedMentions: {
              parse:
                [],
            },
            },
          });

          auditWarning =
            'Publicação salva; log registrada na fila de entrega ao Discord.';
        } catch (error) {
          auditWarning =
            'Publicação salva, mas não foi possível registrar a fila da log. Confira o console do bot.';

          console.error('[EVENT RULES AUDIT]', {
            code: error.code || null,
            name: error.name,
            message: error.message,
          });
        }

        return {
          ok:
            true,

          online:
            record.online,

          auditWarning,
        };
      }
    );
  }

  function eventDecisionValue(operation, payload) {
    if (operation === 'events.eventCreate') {
      const name = String(payload.name || '').trim();

      if (
        !name ||
        name.length > 120
      ) {
        throw fail(400, 'Use um nome de até 120 caracteres.');
      }

      return {
        name,
        cover: payload.cover
          ? eventMediaUrl(payload.cover)
          : ''
      };
    }

    if (operation === 'events.eventDelete') {
      const eventId = String(payload.eventId || '').trim();

      if (
        !eventId ||
        eventId === 'cds'
      ) {
        throw fail(400, 'Evento inválido para exclusão.');
      }

      return {
        eventId,
        revision: String(payload.revision || '')
      };
    }

    const eventId = String(payload.eventId || '').trim();

    if (!eventId) {
      throw fail(400, 'Informe o evento.');
    }

    if (operation === 'events.metadata') {
      const field = String(payload.field || '');

      if (!['name', 'cover'].includes(field)) {
        throw fail(400, 'Campo de evento inválido.');
      }

      const value = String(payload.value || '').trim();

      if (
        field === 'name' &&
        (
          !value ||
          value.length > 120
        )
      ) {
        throw fail(400, 'Use um nome de até 120 caracteres.');
      }

      return {
        eventId,
        field,
        value:
          field === 'cover' && value
            ? eventMediaUrl(value)
            : value,
        revision: String(payload.revision || '')
      };
    }

    if (operation === 'events.publish') {
      const status = String(payload.status || '');

      if (!['online', 'offline'].includes(status)) {
        throw fail(400, 'Estado de publicação inválido.');
      }

      return {
        eventId,
        status,
        rulesRevision: String(payload.rulesRevision || '')
      };
    }

    throw fail(400, 'Operação de confirmação inválida.');
  }

  function issueEventDecision(guild, member, operation, payload) {
    const value = eventDecisionValue(operation, payload);

    for (const [key, item] of confirmations) {
      if (item.expires < Date.now()) {
        confirmations.delete(key);
      }
    }

    if (confirmations.size >= 1000) {
      throw fail(429, 'Há muitas confirmações pendentes.');
    }

    const token = randomUUID();

    confirmations.set(token, {
      guild: guild.id,
      actor: member.id,
      operation,
      hash: digest(value),
      expires: Date.now() + 60000
    });

    return { token };
  }

  function consumeEventDecision(guild, member, operation, payload) {
    const value = eventDecisionValue(operation, payload);
    const confirmation = confirmations.get(payload.confirmation);

    if (
      !confirmation ||
      confirmation.guild !== guild.id ||
      confirmation.actor !== member.id ||
      confirmation.operation !== operation ||
      confirmation.hash !== digest(value) ||
      confirmation.expires < Date.now()
    ) {
      throw fail(409, 'Confirme novamente esta alteração.');
    }

    confirmations.delete(payload.confirmation);

    return value;
  }

  async function handle({ guild, member, action, payload = {} }) {
    if (
      action ===
        'events.published'
    ) {
      await writes;

      return publishedRules(
        guild,
        payload
      );
    }

    if (
      !member ||
      member.guild?.id !== guild.id ||
      member.user?.bot === true
    ) {
      throw fail(
        403,
        'Membro inválido para acessar a biblioteca de eventos.'
      );
    }

    if (action === 'events.snapshot') {
      await writes;
      return snapshot(guild, member, payload);
    }

    if (!mayEdit(member)) {
      throw fail(
        403,
        'Somente responsáveis e Coord. Creators podem editar eventos.'
      );
    }

    if (
      action === 'events.confirm' &&
      [
        'events.metadata',
        'events.publish',
        'events.eventCreate',
        'events.eventDelete'
      ].includes(payload.operation)
    ) {
      if (
        payload.operation === 'events.eventDelete' &&
        !mayDeleteEvent(member)
      ) {
        throw fail(
          403,
          'Somente os responsáveis autorizados podem excluir eventos.'
        );
      }

      return issueEventDecision(
        guild,
        member,
        payload.operation,
        payload
      );
    }

    if (action === 'events.eventCreate') {
      return serial(async () => {
        const decision = consumeEventDecision(
          guild,
          member,
          'events.eventCreate',
          payload
        );

        const current = await snapshot(guild, member, {});

        const normalizeName = value =>
          String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();

        const existing = current.events.some(event =>
          normalizeName(event.name) ===
          normalizeName(decision.name)
        );

        if (existing) {
          throw fail(
            409,
            'Já existe um evento com esse nome na biblioteca.'
          );
        }

        const state = await read();
        const id = 'site-event:' + randomUUID();

        state.localEvents ||= {};
        state.localEvents[id] = {
          guildId: guild.id,
          name: decision.name,
          createdBy: member.id,
          createdAt: Date.now()
        };

        state.covers[guild.id + ':' + id] = decision.cover;

        await save(state);

        return {
          ok: true,
          eventId: id
        };
      });
    }

    if (action === 'events.eventDelete') {
      if (!mayDeleteEvent(member)) {
        throw fail(
          403,
          'Somente os responsáveis autorizados podem excluir eventos.'
        );
      }

      return serial(async () => {
        const decision = consumeEventDecision(
          guild,
          member,
          'events.eventDelete',
          payload
        );

        const current = await snapshot(guild, member, {});
        const event = current.events.find(
          item => item.id === decision.eventId
        );

        if (!event || event.id === 'cds') {
          throw fail(404, 'Evento não encontrado.');
        }

        if (event.metadataRevision !== decision.revision) {
          throw fail(
            409,
            'O evento mudou. Atualize antes de excluir.'
          );
        }

        const state = await read();
        const aliases = event.aliasIds || [event.id];

        const isPublished = aliases.some(id =>
          state.publications?.[
            guild.id + ':' + id
          ]?.online
        );

        if (isPublished) {
          throw fail(
            409,
            'Retire a publicação das regras antes de excluir este evento.'
          );
        }

        state.removedEvents ||= {};

        for (const id of aliases) {
          state.removedEvents[guild.id + ':' + id] = {
            removedBy: member.id,
            removedAt: Date.now(),
            name: event.name
          };

          if (
            state.localEvents?.[id]?.guildId === guild.id
          ) {
            delete state.localEvents[id];
          }
        }

        await save(state);

        return {
          ok: true,
          eventId: event.id
        };
      });
    }

    if (action === 'events.metadata') {
      return serial(async () => {
        const decision = consumeEventDecision(
          guild,
          member,
          'events.metadata',
          payload
        );

        const current = await snapshot(guild, member, {});
        const event = current.events.find(
          item => item.id === decision.eventId
        );

        if (!event) {
          throw fail(404, 'Evento não encontrado.');
        }

        if (event.metadataRevision !== decision.revision) {
          throw fail(
            409,
            'O evento mudou. Atualize antes de editar.'
          );
        }

        const state = await read();

        if (
          decision.field === 'name'
        ) {
          const normalizeName =
            value =>
              String(value || '')
                .normalize('NFD')
                .replace(
                  /[\u0300-\u036f]/g,
                  ''
                )
                .replace(
                  /\s+/g,
                  ' '
                )
                .trim()
                .toLowerCase();

          if (
            current.events.some(other =>
              other.id !== event.id &&
              normalizeName(other.name) ===
                normalizeName(decision.value)
            )
          ) {
            throw fail(
              409,
              'Já existe outro evento com esse nome na biblioteca.'
            );
          }

          state.names ||= {};

          state.names[
            guild.id + ':' + event.id
          ] =
            decision.value;
        } else {
          state.covers[guild.id + ':' + event.id] =
            decision.value;
        }

        const eventAliases = new Set(event.aliasIds || [event.id]);
        eventAliases.add(event.id);

        for (const [key, publication] of Object.entries(state.publications || {})) {
          if (
            !key.startsWith(guild.id + ':') ||
            !publication ||
            typeof publication !== 'object' ||
            Array.isArray(publication) ||
            !eventAliases.has(publication.eventId)
          ) continue;

          if (decision.field === 'name') {
            publication.name = decision.value;
          } else {
            publication.cover = decision.value;
          }
        }

        await save(state);

        return { ok: true };
      });
    }

    if (
      action ===
        'events.publish'
    ) {
      return publishRules(
        guild,
        member,
        payload
      );
    }

    const value = input(payload);
    const events = await catalog(guild, member);
    const event = events.find(item => item.id === value.eventId);

    if (!event) throw fail(404, 'Evento não encontrado.');

    if (action === 'events.confirm') {
      const operation = payload.operation;

      if (
        !['events.save', 'events.delete'].includes(operation) ||
        (
          operation === 'events.delete' &&
          !value.id
        )
      ) {
        throw fail(400, 'Confirmação inválida.');
      }

      for (const [key, item] of confirmations) {
        if (item.expires < Date.now()) confirmations.delete(key);
      }

      if (confirmations.size >= 1000) {
        throw fail(429, 'Há muitas confirmações pendentes.');
      }

      const token = randomUUID();

      confirmations.set(token, {
        guild: guild.id,
        actor: member.id,
        operation,
        hash: digest(value),
        expires: Date.now() + 60000
      });

      return { token };
    }

    if (!['events.save', 'events.delete'].includes(action)) {
      throw fail(404, 'Operação desconhecida.');
    }

    if (
      action === 'events.delete' &&
      !value.id
    ) {
      throw fail(400, 'Informe o conteúdo a excluir.');
    }

    const pendingConfirmation = confirmations.get(
      payload.confirmation
    );

    if (
      !pendingConfirmation ||
      pendingConfirmation.actor !== member.id ||
      pendingConfirmation.guild !== guild.id ||
      pendingConfirmation.operation !== action ||
      pendingConfirmation.hash !== digest(value) ||
      pendingConfirmation.expires < Date.now()
    ) {
      throw fail(409, 'Confirme novamente esta alteração.');
    }

        let source;

    if (
      value.id
    ) {
      const current =
        (
          await snapshot(
            guild,
            member,
            {
              eventId:
                value.eventId,

              section:
                value.section
            }
          )
        ).sections[
          value.section
        ]?.find(
          item =>
            item.id === value.id
        );

      if (
        !current ||
        current.revision !== value.revision
      ) {
        throw fail(
          409,
          'Este conteúdo mudou. Atualize antes de editar ou excluir.'
        );
      }

      const sourceId =
        String(
          current.messageChannelId ||
          String(
            current.sourceId ||
            current.id
          ).split(':')[0]
        );

      if (
        /^\d{17,20}$/.test(sourceId)
      ) {
        source =
          await channel(
            guild,
            member,
            sourceId,
            value.section === 'cds'
              ? null
              : MENUS
          );
      }
    }

    if (
      !source &&
      action === 'events.delete'
    ) {
      const sources =
        await eventSources(
          guild,
          member,
          event,
          value.section
        );

      source =
        sources[0];

      if (
        !source
      ) {
        throw fail(
          409,
          'O tópico deste conteúdo não foi encontrado. Atualize antes de excluir.'
        );
      }
    } else if (
      !source
    ) {
      source =
        await target(
          guild,
          member,
          event,
          value.section
        );
    }

    return serial(async () => {
      const confirmation = confirmations.get(
        payload.confirmation
      );

      if (
        !confirmation ||
        confirmation.actor !== member.id ||
        confirmation.guild !== guild.id ||
        confirmation.operation !== action ||
        confirmation.hash !== digest(value) ||
        confirmation.expires < Date.now()
      ) {
        throw fail(409, 'Confirme novamente esta alteração.');
      }

      confirmations.delete(payload.confirmation);

      const state = await read();
      const old = state.items[value.id];

      if (
        old &&
        (
          old.guildId !== guild.id ||
          !(event.aliasIds || [event.id]).includes(old.eventId) ||
          old.section !== value.section
        )
      ) {
        throw fail(403, 'Conteúdo de outra área.');
      }

      if (value.id) {
        const current = old || (
          await snapshot(guild, member, { eventId: value.eventId, section: value.section })
        ).sections[value.section]?.find(item => item.id === value.id);

        if (!current || current.revision !== value.revision) {
          throw fail(
            409,
            'Este conteúdo mudou. Atualize antes de editar.'
          );
        }
      }

      const warnings = [];

      if (action === 'events.delete') {
        if (old) delete state.items[value.id];

        state.hidden[
          guild.id + ':' + (old?.sourceId || value.id)
        ] = true;

        for (const id of old?.messageIds || []) {
          state.hidden[guild.id + ':' + source.id + ':' + id] = true;
        }

        await save(state);

        for (const id of old?.messageIds || []) {
          try {
            await (await source.messages.fetch(id)).delete();
          } catch {
            warnings.push(
              'Não consegui excluir uma cópia publicada pelo site no Discord.'
            );
          }
        }

        return { ok: true, warnings };
      }

      if (value.section === 'audios') {
        const current = await snapshot(guild, member, { eventId: event.id, section: 'audios' });
        const count = (current.sections.audios || [])
          .filter(record => record.id !== value.id)
          .reduce((total, record) => total + record.media.filter(media => media.kind === 'audio').length, 0);
        const added = value.media.filter(media => media.kind === 'audio').length;
        if (!added || count + added > 10) {
          throw fail(400, 'Cada evento permite até 10 áudios. Edite ou remova um áudio existente.');
        }
      }

      const item = {
        ...value,
        id: old?.id || 'site:' + randomUUID(),
        guildId: guild.id,
        sourceId: old?.sourceId || (value.id && !old ? value.id : ''),
        messageIds: [],
        messageChannelId: source.id,
        updatedBy: member.id,
        updatedAt: Date.now(),
        revision: randomUUID()
      };

      if (source.archived) await source.setArchived(false);

      const content =
        '✦ ' + item.title + '\n' +
        item.text + '\n' +
        item.media.map(media => media.url).join('\n');

      try {
        for (let offset = 0; offset < content.length;) {
          let end = Math.min(offset + 1900, content.length);

          if (
            end < content.length &&
            /[\uD800-\uDBFF]/.test(content[end - 1])
          ) {
            end--;
          }

          const chunk = content.slice(offset, end);
          offset = end;

          const message = await source.send({
            content: chunk,
            allowedMentions: { parse: [] }
          });

          item.messageIds.push(message.id);
        }

        state.items[item.id] = item;
        if (!Object.hasOwn(state.covers, guild.id + ':' + event.id)) {
          state.covers[guild.id + ':' + event.id] = value.cover;
        }

        for (const id of old?.messageIds || []) {
          state.hidden[guild.id + ':' + source.id + ':' + id] = true;
        }

        await save(state);
      } catch (error) {
        for (const id of item.messageIds) {
          await source.messages.delete(id).catch(() => {});
        }

        throw error;
      }

      for (const id of old?.messageIds || []) {
        try {
          await (await source.messages.fetch(id)).delete();
        } catch {
          warnings.push(
            'Uma versão anterior publicada pelo site permaneceu no Discord.'
          );
        }
      }

      return { ok: true, warnings };
    });
  }

  return { handle };
}