import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';

import {
  getOrgTicketImageContext,
} from '../events/orgTicketAccessSync.js';

const GUILD = '1262262852782129183';
const LOG_GUILD = '1482114384208597174';
const LOG_CHANNEL = '1560080529964007424';

const CATEGORIES = new Set([
  '1414687963161559180',
  '1428572742051168378',
  '1482874296685695118',
]);

const BUTTON = 'sc_org_image_open';
const MODAL = 'sc_org_image_submit';
const PREFIX = 'SC_ORG_IMAGE_V1 ';

const root = [
  process.env.SQUARECLOUD_STORAGE_PATH,
  '/application/storage',
  '/storage',
].find(
  value => value && fs.existsSync(value)
) || process.cwd();

const file = path.join(
  root,
  'data',
  'org_images.json'
);

const norm = value => String(value || '')
  .split('|')
  .at(-1)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]/gi, '')
  .toLowerCase();

let records = null;
let recovery = null;

const locks = new Set();

function load() {
  if (records) {
    return records;
  }

  try {
    records = JSON.parse(
      fs.readFileSync(file, 'utf8')
    );
  } catch {
    records = {};
  }

  if (
    !records ||
    typeof records !== 'object' ||
    Array.isArray(records)
  ) {
    records = {};
  }

  return records;
}

function save() {
  fs.mkdirSync(
    path.dirname(file),
    { recursive: true }
  );

  const temporary =
    file + '.' + randomUUID();

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

async function logChannel(client) {
  const channel =
    await client.channels.fetch(LOG_CHANNEL);

  if (
    !channel?.isTextBased?.() ||
    channel.guildId !== LOG_GUILD
  ) {
    throw new Error(
      'Canal de imagens indisponível no servidor configurado.'
    );
  }

  return channel;
}

function readArchive(message, client) {
  if (
    message.author?.id !== client.user.id ||
    !message.content.startsWith(PREFIX)
  ) {
    return null;
  }

  try {
    const data = JSON.parse(
      message.content.slice(PREFIX.length)
    );

    if (
      data.guildId !== GUILD ||
      !/^\d{17,20}$/.test(data.roleId) ||
      typeof data.name !== 'string'
    ) {
      return null;
    }

    const attachment =
      message.attachments.first();

    if (
      !attachment?.contentType?.startsWith('image/')
    ) {
      return null;
    }

    return {
      ...data,
      messageId: message.id,
      url: attachment.url,
      checkedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

async function recover(client) {
  if (recovery) {
    return recovery;
  }

  recovery = (async () => {
    const channel =
      await logChannel(client);

    let before;

    for (
      let page = 0;
      page < 50;
      page += 1
    ) {
      const messages =
        await channel.messages.fetch({
          limit: 100,
          before,
        });

      for (const message of messages.values()) {
        const record =
          readArchive(message, client);

        if (!record) {
          continue;
        }

        const old =
          load()[record.roleId];

        if (
          !old ||
          BigInt(record.messageId) >
            BigInt(old.messageId)
        ) {
          load()[record.roleId] = record;
        }
      }

      if (messages.size < 100) {
        break;
      }

      const next =
        messages.last()?.id;

      if (
        !next ||
        next === before
      ) {
        break;
      }

      before = next;
    }

    save();
  })().catch(error => {
    recovery = null;
    throw error;
  });

  return recovery;
}

export async function getOrganizationImage(
  client,
  name,
  force = false
) {
  if (!norm(name)) {
    return null;
  }

  let matches =
    Object.values(load()).filter(
      record =>
        record?.roleId &&
        norm(record.name) === norm(name)
    );

  if (!matches.length) {
    await recover(client);

    matches =
      Object.values(load()).filter(
        record =>
          record?.roleId &&
          norm(record.name) === norm(name)
      );
  }

  if (matches.length !== 1) {
    return null;
  }

  const record = matches[0];

  if (
    force ||
    Date.now() -
      Number(record.checkedAt || 0) >
      3600000
  ) {
    const channel =
      await logChannel(client);

    const message =
      await channel.messages.fetch({
        message: record.messageId,
        force: true,
      });

    const refreshed =
      readArchive(message, client);

    if (
      !refreshed ||
      refreshed.roleId !== record.roleId
    ) {
      return null;
    }

    load()[record.roleId] = refreshed;
    save();

    return refreshed.url;
  }

  return record.url;
}

async function downloadImage(value) {
  const url = new URL(value);

  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (
      url.port &&
      url.port !== '443'
    ) ||
    ![
      'cdn.discordapp.com',
      'media.discordapp.net',
    ].includes(url.hostname)
  ) {
    throw new Error(
      'Use um link HTTPS de imagem enviado ao Discord.'
    );
  }

  const response = await fetch(
    url,
    {
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
    }
  );

  const type =
    response.headers
      .get('content-type')
      ?.split(';')[0];

  const extensions = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };

  if (
    !response.ok ||
    !extensions[type] ||
    !response.body
  ) {
    throw new Error(
      'O link não retornou uma imagem PNG, JPG, WEBP ou GIF.'
    );
  }

  const chunks = [];
  let size = 0;

  const reader =
    response.body.getReader();

  try {
    while (true) {
      const result =
        await reader.read();

      if (result.done) {
        break;
      }

      size += result.value.byteLength;

      if (size > 8 * 1024 * 1024) {
        await reader.cancel();

        throw new Error(
          'A imagem deve ter no máximo 8 MB.'
        );
      }

      chunks.push(
        Buffer.from(result.value)
      );
    }
  } finally {
    reader.releaseLock();
  }

  if (!size) {
    throw new Error(
      'A imagem está vazia.'
    );
  }

  return {
    attachment: Buffer.concat(chunks),
    name:
      'organizacao.' +
      extensions[type],
  };
}

function eligible(channel) {
  return (
    channel?.guildId === GUILD &&
    CATEGORIES.has(channel.parentId) &&
    channel.isTextBased?.() &&
    !channel.isThread?.()
  );
}

function isOriginalTicketPanel(message, client) {
  if (
    message?.author?.id !== client.user.id
  ) {
    return false;
  }

  const ids = new Set(
    (message.components || []).flatMap(
      row => row.components.map(
        component => component.customId
      )
    )
  );

  return (
    ids.has('fechar_ticket') &&
    ids.has('adicionar_membro')
  );
}

function isLegacyImagePanel(message, client) {
  const components =
    (message.components || []).flatMap(
      row => row.components
    );

  return (
    message.author?.id === client.user.id &&
    message.content ===
      '🖼️ Perfil da organização • gestão e líder autorizado podem definir a imagem.' &&
    !message.embeds?.length &&
    !message.attachments?.size &&
    components.length === 1 &&
    components[0].customId === BUTTON
  );
}

async function ensureButton(client, channel) {
  if (!eligible(channel)) {
    return;
  }

  client.__scOrgImagePanelJobs ||= new Map();

  const jobs =
    client.__scOrgImagePanelJobs;

  if (jobs.has(channel.id)) {
    return jobs.get(channel.id);
  }

  const operation = (async () => {
    let target = null;
    const legacy = [];

    const savedPanel =
      load().__panels?.[channel.id];

    if (savedPanel) {
      const saved =
        await channel.messages.fetch({
          message: savedPanel,
          force: true,
        }).catch(() => null);

      if (
        isOriginalTicketPanel(saved, client)
      ) {
        target = saved;
      }
    }

    let before;

    for (
      let page = 0;
      !target && page < 50;
      page += 1
    ) {
      const messages =
        await channel.messages.fetch({
          limit: 100,
          before,
        });

      for (const message of messages.values()) {
        if (
          isLegacyImagePanel(message, client)
        ) {
          legacy.push(message);
        }

        if (
          !target &&
          isOriginalTicketPanel(message, client)
        ) {
          target = message;
        }
      }

      if (
        target ||
        messages.size < 100
      ) {
        break;
      }

      const next =
        messages.last()?.id;

      if (
        !next ||
        next === before
      ) {
        break;
      }

      before = next;
    }

    if (!target) {
      console.warn(
        '[ORG IMAGES] Painel original não localizado:',
        {
          channelId: channel.id,
        }
      );

      return;
    }

    const current =
      await channel.guild.channels.fetch(
        channel.id
      );

    if (!eligible(current)) {
      return;
    }

    const fresh =
      await channel.messages.fetch({
        message: target.id,
        force: true,
      });

    if (
      !isOriginalTicketPanel(fresh, client)
    ) {
      return;
    }

    const hasButton =
      fresh.components.some(
        row => row.components.some(
          component =>
            component.customId === BUTTON
        )
      );

    if (!hasButton) {
      const rows =
        fresh.components.map(
          row => ActionRowBuilder.from(row)
        );

      let row = rows.find(
        item =>
          item.components.length < 5 &&
          item.components.every(
            component =>
              component.toJSON().type === 2
          )
      );

      if (!row) {
        if (rows.length >= 5) {
          throw new Error(
            'O painel original já utiliza todas as linhas disponíveis.'
          );
        }

        row = new ActionRowBuilder();
        rows.push(row);
      }

      row.addComponents(
        new ButtonBuilder()
          .setCustomId(BUTTON)
          .setLabel('Imagem da organização')
          .setStyle(ButtonStyle.Secondary)
      );

      await fresh.edit({
        components: rows,
      });
    }

    load().__panels ||= {};

    load().__panels[channel.id] =
      fresh.id;

    save();

    for (const message of legacy) {
      if (message.id !== fresh.id) {
        await message.delete().catch(
          error => console.warn(
            '[ORG IMAGES] Limpeza do painel separado:',
            {
              messageId: message.id,
              message: error.message,
            }
          )
        );
      }
    }
  })();

  jobs.set(
    channel.id,
    operation
  );

  try {
    return await operation;
  } finally {
    if (
      jobs.get(channel.id) === operation
    ) {
      jobs.delete(channel.id);
    }
  }
}

export function installOrganizationImages(client) {
  if (client.__scOrgImagesInstalled) {
    return;
  }

  client.__scOrgImagesInstalled = true;

  const ensure = channel =>
    ensureButton(client, channel).catch(
      error => console.error(
        '[ORG IMAGES] Botão:',
        error
      )
    );

  client.on(
    'channelCreate',
    ensure
  );

  client.on(
    'messageCreate',
    message => {
      if (
        eligible(message.channel) &&
        isOriginalTicketPanel(message, client)
      ) {
        void ensure(message.channel);
      }
    }
  );

  client.on(
    'messageUpdate',
    (oldMessage, message) => {
      if (
        !eligible(message.channel) ||
        !isOriginalTicketPanel(message, client)
      ) {
        return;
      }

      const hasButton =
        message.components.some(
          row => row.components.some(
            component =>
              component.customId === BUTTON
          )
        );

      if (!hasButton) {
        void ensure(message.channel);
      }
    }
  );

  client.on(
    'channelUpdate',
    (oldChannel, channel) => {
      if (
        oldChannel.parentId !== channel.parentId &&
        eligible(channel)
      ) {
        void ensure(channel);
      }
    }
  );

  void (async () => {
    const guild =
      await client.guilds.fetch(GUILD);

    const channels =
      await guild.channels.fetch();

    for (const channel of channels.values()) {
      await ensure(channel);
    }
  })().catch(
    error => console.error(
      '[ORG IMAGES] Inicialização:',
      error
    )
  );
}

export async function organizationImageInteraction(
  interaction,
  client
) {
  if (
    ![BUTTON, MODAL].includes(
      interaction.customId
    )
  ) {
    return false;
  }

  if (!eligible(interaction.channel)) {
    await interaction.reply({
      content:
        'Este canal não é um ticket de organização habilitado.',
      ephemeral: true,
    });

    return true;
  }

  if (
    interaction.isButton() &&
    interaction.customId === BUTTON
  ) {
    const modal =
      new ModalBuilder()
        .setCustomId(MODAL)
        .setTitle('Imagem da organização');

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('image_url')
          .setLabel('Link da imagem enviada ao Discord')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(2000)
          .setRequired(true)
      )
    );

    await interaction.showModal(modal);

    return true;
  }

  if (
    !interaction.isModalSubmit() ||
    interaction.customId !== MODAL
  ) {
    return true;
  }

  await interaction.deferReply({
    ephemeral: true,
  });

  let lock;
  let ownsLock = false;

  try {
    const context =
      await getOrgTicketImageContext(
        interaction.channel,
        interaction.user.id
      );

    lock = context.roleId;

    if (locks.has(lock)) {
      throw new Error(
        'Outra atualização desta organização está em andamento.'
      );
    }

    locks.add(lock);
    ownsLock = true;

    const image =
      await downloadImage(
        interaction.fields
          .getTextInputValue('image_url')
          .trim()
      );

    const latest =
      await getOrgTicketImageContext(
        interaction.channel,
        interaction.user.id
      );

    if (
      latest.roleId !== context.roleId
    ) {
      throw new Error(
        'O vínculo da organização mudou durante o envio.'
      );
    }

    const channel =
      await logChannel(client);

    const message =
      await channel.send({
        content:
          PREFIX +
          JSON.stringify({
            guildId: GUILD,
            roleId: context.roleId,
            name: context.name,
            ticketId: interaction.channelId,
            actorId: interaction.user.id,
          }),

        files: [
          image,
        ],

        allowedMentions: {
          parse: [],
        },
      });

    const record =
      readArchive(message, client);

    if (!record) {
      throw new Error(
        'A imagem foi arquivada, mas não foi possível validar o anexo.'
      );
    }

    load()[record.roleId] = record;

    try {
      save();
    } catch (error) {
      console.error(
        '[ORG IMAGES] Índice local:',
        error
      );
    }

    await interaction.editReply(
      '✅ Imagem arquivada e vinculada à organização. Atualize a lista no site para visualizar.'
    );
  } catch (error) {
    console.error(
      '[ORG IMAGES] Envio:',
      error
    );

    await interaction.editReply(
      error.message ||
      'Não foi possível salvar a imagem.'
    );
  } finally {
    if (ownsLock) {
      locks.delete(lock);
    }
  }

  return true;
}