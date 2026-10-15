import fs from 'node:fs';
import path from 'node:path';

const directory = path.resolve(
  process.env.SQUARECLOUD_STORAGE_PATH ||
  (
    fs.existsSync('/application/storage')
      ? '/application/storage'
      : 'storage'
  ),
  'data'
);

const file = path.join(
  directory,
  'vip-message-moves.json'
);

let state;

function load() {
  if (!state) {
    try {
      state = JSON.parse(
        fs.readFileSync(file, 'utf8')
      );
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }

      state = {
        moves: {},
      };
    }

    if (
      !state ||
      typeof state.moves !== 'object' ||
      !state.moves
    ) {
      throw new Error(
        'Índice de movimentações VIP inválido.'
      );
    }
  }

  return state;
}

function save() {
  fs.mkdirSync(directory, {
    recursive: true,
  });

  const temporary = file + '.tmp';

  fs.writeFileSync(
    temporary,
    JSON.stringify(load()),
    { mode: 0o600 }
  );

  fs.renameSync(
    temporary,
    file
  );
}

const key = (channelId, id) =>
  `${channelId}:${id}`;

export function vipCurrentId(
  channelId,
  messageId
) {
  let id = String(messageId);

  const visited = new Set();

  while (
    load().moves[
      key(channelId, id)
    ]?.newId
  ) {
    if (visited.has(id)) {
      throw new Error(
        'Ciclo no índice VIP.'
      );
    }

    visited.add(id);

    id = load().moves[
      key(channelId, id)
    ].newId;
  }

  return id;
}

export function vipOriginalTime(message) {
  return Number(
    load().moves[
      key(
        message.channelId ||
        message.channel.id,
        message.id
      )
    ]?.originalAt ||
    message.createdTimestamp
  );
}

export function vipCurrentUrl(url) {
  return String(url || '').replace(
    /(discord(?:app)?\.com\/channels\/\d+\/)(\d+)\/(\d+)/,

    (_, prefix, channelId, id) =>
      `${prefix}${channelId}/${
        vipCurrentId(
          channelId,
          id
        )
      }`
  );
}

export async function moveVipMessage(message) {
  const channel = message.channel;

  const id = key(
    channel.id,
    message.id
  );

  const previous = load().moves[id];

  if (previous?.newId) {
    const target =
      await channel.messages.fetch(
        vipCurrentId(
          channel.id,
          message.id
        )
      );

    await message.delete();

    return target;
  }

  if (previous?.phase === 'sending') {
    throw new Error(
      `Movimentação ${message.id} interrompida. ` +
      'Original preservado; confira o destino antes de repetir.'
    );
  }

  const original =
    await channel.messages.fetch({
      message: message.id,
      force: true,
    });

  const attachments = [
    ...original.attachments.values(),
  ];

  const names = attachments.map(
    item => item.name
  );

  if (
    new Set(names).size !== names.length
  ) {
    throw new Error(
      'Anexos com nomes repetidos: registro preservado.'
    );
  }

  const rewrite = value => {
    if (typeof value === 'string') {
      const attachment = attachments.find(
        item =>
          item.url === value ||
          item.proxyURL === value
      );

      return attachment
        ? `attachment://${attachment.name}`
        : value;
    }

    if (Array.isArray(value)) {
      return value.map(rewrite);
    }

    if (
      value &&
      typeof value === 'object'
    ) {
      return Object.fromEntries(
        Object.entries(value).map(
          ([field, item]) => [
            field,
            rewrite(item),
          ]
        )
      );
    }

    return value;
  };

  load().moves[id] = {
    phase: 'sending',
    originalAt:
      vipOriginalTime(original),
  };

  save();

  const copy = await channel.send({
    content:
      original.content ||
      undefined,

    embeds: original.embeds.map(
      embed =>
        rewrite(
          embed.toJSON()
        )
    ),

    components: original.components.map(
      row => row.toJSON()
    ),

    files: attachments.map(
      item => ({
        attachment: item.url,
        name: item.name,
      })
    ),

    allowedMentions: {
      parse: [],
    },

    nonce:
      'v' + original.id,

    enforceNonce:
      true,
  });

  const current =
    await channel.messages.fetch({
      message: original.id,
      force: true,
    });

  if (
    current.editedTimestamp !==
    original.editedTimestamp
  ) {
    await copy.delete();

    delete load().moves[id];

    save();

    throw new Error(
      'O registro foi editado durante a movimentação. Original preservado.'
    );
  }

  load().moves[
    key(
      channel.id,
      copy.id
    )
  ] = {
    originalAt:
      load().moves[id].originalAt,
  };

  load().moves[id] = {
    ...load().moves[id],

    phase:
      'copied',

    newId:
      copy.id,
  };

  save();

  await original.delete();

  return copy;
}