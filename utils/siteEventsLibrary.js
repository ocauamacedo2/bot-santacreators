import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { PermissionFlagsBits } from 'discord.js';

const MAIN = '1457573495952248883';
const MENUS = '1457577651152883797';

const EDIT_ROLES = [
  '1262262852949905408',
  '1352408327983861844',
  '1262262852949905409',
  '1352407252216184833',
  '1388976314253312100'
];

const SECTIONS = ['links', 'adms', 'audios', 'org', 'cds'];

const fail = (status, message) =>
  Object.assign(new Error(message), { status });

const digest = value =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function eventMediaUrl(value) {
  const url = new URL(String(value || '').trim());

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

    const events = Object.entries(state.evt3Events || {}).map(
      ([id, value]) => ({
        id,
        name: value.eventName || 'Evento',
        areas: value.areas || {}
      })
    );

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

  async function target(guild, member, event, section) {
    if (!SECTIONS.includes(section)) {
      throw fail(400, 'Seção inválida.');
    }

    const id = section === 'cds'
      ? String(process.env.SANTA_EVENTS_CDS_CHANNEL_ID || '')
      : event.areas[section]?.threadId;

    if (!id) {
      throw fail(
        409,
        'Abra esta área pelo painel do evento no Discord antes de adicionar conteúdo pelo site.'
      );
    }

    return channel(
      guild,
      member,
      id,
      section === 'cds' ? null : MENUS
    );
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
        cover: state.covers[guild.id + ':' + event.id] || ''
      })),
      rights: { edit: mayEdit(member) },
      sections: {},
      warnings: []
    };

    if (!payload.eventId) return result;

    const event = events.find(value => value.id === payload.eventId);

    if (!event) throw fail(404, 'Evento não encontrado.');

    const all = Object.values(state.items).filter(
      item => item.guildId === guild.id && item.eventId === event.id
    );

    const mirrored = new Set(
      all.flatMap(item => item.messageIds || [])
    );

    for (const section of SECTIONS) {
      if (event.id === 'cds' && section !== 'cds') continue;
      if (event.id !== 'cds' && section === 'cds') continue;

      result.sections[section] = [];

      if (event.areas[section]?.threadId || section === 'cds') {
        try {
          const source = await target(guild, member, event, section);
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
        } catch (error) {
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
      value.text.length > 10000 ||
      value.media.length > 12
    ) {
      throw fail(
        400,
        'Informe título de até 120 caracteres, texto de até 10000 e no máximo 12 links.'
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
          old.eventId !== value.eventId ||
          old.section !== value.section
        )
      ) {
        throw fail(403, 'Conteúdo de outra área.');
      }

      if (value.id) {
        const current = old || (
          await snapshot(guild, member, { eventId: value.eventId })
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
        state.covers[guild.id + ':' + event.id] = value.cover;

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