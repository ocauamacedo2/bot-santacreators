import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { PermissionFlagsBits } from 'discord.js';

const MAIN = '1457573495952248883';
const MENUS = '1457577651152883797';

const EDIT_ROLES = [
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

  let writes = Promise.resolve();

  const serial = task => {
    const operation = writes.then(task);
    writes = operation.catch(() => {});
    return operation;
  };

  async function read() {
    try {
      return JSON.parse(await readFile(file, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;

      return {
        items: {},
        hidden: {},
        covers: {}
      };
    }
  }

  async function save(state) {
    await mkdir(folder, {
      recursive: true,
      mode: 0o700
    });

    await writeFile(file + '.tmp', JSON.stringify(state), {
      mode: 0o600
    });

    await rename(file + '.tmp', file);
  }

  const mayEdit = member =>
    member.id === '660311795327828008' ||
    EDIT_ROLES.some(id => member.roles.cache.has(id));

  async function channel(guild, member, id, parent = null) {
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

    const permissions = value.permissionsFor(member);

    if (
      member.id !== '660311795327828008' && (
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

    return events;
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
      if (embed.image?.url) add(embed.image.url, 'image');
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
    const result = [];
    let before;

    for (let page = 0; page < 5; page++) {
      const batch = await value.messages.fetch({
        limit: 100,
        ...(before ? { before } : {})
      });

      result.push(...batch.values());

      if (batch.size < 100) {
        return { items: result, truncated: false };
      }

      before = batch.last().id;
    }

    return { items: result, truncated: true };
  }

  async function snapshot(guild, member, payload) {
    const events = await catalog(guild, member);
    const state = await read();

    const result = {
      events: events.map(event => ({
        ...event,
        name: state.names?.[guild.id + ':' + event.id] || event.name,
        metadataRevision: digest([
          state.names?.[guild.id + ':' + event.id] || event.name,
          Object.hasOwn(state.covers, guild.id + ':' + event.id)
          ? state.covers[guild.id + ':' + event.id]
          : (event.aliasIds || [event.id]).map(id => state.covers[guild.id + ':' + id]).find(Boolean) || ''
        ]),
        cover: Object.hasOwn(state.covers, guild.id + ':' + event.id)
          ? state.covers[guild.id + ':' + event.id]
          : (event.aliasIds || [event.id]).map(id => state.covers[guild.id + ':' + id]).find(Boolean) || ''
      })),
      rights: { edit: mayEdit(member) },
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
          if (error.status === 403 || error.status === 401) throw error;
          result.warnings.push(error.message);
        }
      }

      result.sections[section].push(
        ...all.filter(item => item.section === section)
      );
    }

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
      ).map(item => ({
        kind: ['image', 'audio', 'video', 'link'].includes(item.kind)
          ? item.kind
          : 'link',
        url: eventMediaUrl(item.url)
      }))
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

  async function handle({ guild, member, action, payload = {} }) {
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

    if (action === 'events.metadata') {
      return serial(async () => {
        const current = await snapshot(guild, member, {});
        const event = current.events.find(item => item.id === payload.eventId);
        if (!event) throw fail(404, 'Evento não encontrado.');
        if (event.metadataRevision !== payload.revision) throw fail(409, 'O evento mudou. Atualize antes de editar.');
        if (!['name', 'cover'].includes(payload.field)) throw fail(400, 'Campo de evento inválido.');
        const value = String(payload.value || '').trim();
        if (payload.field === 'name' && (!value || value.length > 120)) throw fail(400, 'Use um nome de até 120 caracteres.');
        const state = await read();
        if (payload.field === 'name') {
          state.names ||= {};
          state.names[guild.id + ':' + event.id] = value;
        } else {
          state.covers[guild.id + ':' + event.id] = value ? eventMediaUrl(value) : '';
        }
        await save(state);
        return { ok: true };
      });
    }

    const value = input(payload);
    const events = await catalog(guild, member);
    const event = events.find(item => item.id === value.eventId);

    if (!event) throw fail(404, 'Evento não encontrado.');

    const source = await target(guild, member, event, value.section);

    if (action === 'events.confirm') {
      const operation = payload.operation;

      if (
        !['events.save', 'events.delete'].includes(operation) ||
        !value.id
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

    return serial(async () => {
      if (value.id) {
        const confirmation = confirmations.get(payload.confirmation);
        confirmations.delete(payload.confirmation);

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
      } else if (action === 'events.delete') {
        throw fail(400, 'Informe o conteúdo a excluir.');
      }

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