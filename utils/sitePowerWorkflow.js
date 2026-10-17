import { createHash } from 'node:crypto';
import { PermissionFlagsBits as P } from 'discord.js';
import { runSiteOperation } from './siteOperationJournal.js';

const fail = (status, message) =>
  Object.assign(new Error(message), { status });

const locks =
  globalThis.__SC_POWER_SUBMISSION_LOCKS__ ??= new Set();

export function powerInteractionOperationId(id) {
  const hash = createHash('sha256')
    .update('discord-power:' + String(id))
    .digest('hex');

  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    hash.slice(12, 16),
    hash.slice(16, 20),
    hash.slice(20, 32),
  ].join('-');
}

export function withPowerStateLock(task) {
  const previous =
    globalThis.__PODERES_FILE_MUTEX__ || Promise.resolve();

  const next = previous.then(task, task);

  globalThis.__PODERES_FILE_MUTEX__ =
    next.catch(() => {});

  return next;
}

export function createPowerWorkflow(config) {
  let refreshing = null;

  async function access({
    client,
    guild,
    member,
    actorId,
    fresh = false,
    history = true,
  }) {
    actorId = String(actorId || member?.id || '');

    if (!guild || !/^\d{17,20}$/.test(actorId)) {
      throw fail(
        403,
        'Entre com sua conta do Discord para acessar os poderes.'
      );
    }

    if (
      fresh ||
      member?.id !== actorId ||
      member?.guild?.id !== guild.id
    ) {
      member = await guild.members.fetch({
        user: actorId,
        force: true,
      });
    }

    const channel = await guild.channels.fetch(
      config.channelId,
      fresh ? { force: true } : {}
    );

    if (
      !member ||
      !channel?.isTextBased?.() ||
      !channel.messages ||
      channel.guildId !== guild.id
    ) {
      throw fail(
        403,
        'O canal de poderes não está disponível para esta conta.'
      );
    }

    const permissions = channel.permissionsFor(member);

    if (
      !permissions?.has(P.ViewChannel) ||
      (
        history &&
        !permissions.has(P.ReadMessageHistory)
      )
    ) {
      throw fail(
        403,
        'Você não possui acesso ao canal de poderes no Discord.'
      );
    }

    const create = Boolean(
      await config.authorize({
        user: member.user,
        member,
        guild,
        memberPermissions: member.permissions,
      })
    );

    return {
      client,
      guild,
      member,
      channel,
      create,
    };
  }

  async function submit(args) {
    const lock =
      args.guild.id + ':' +
      config.key + ':' +
      args.member.id;

    if (locks.has(lock)) {
      throw fail(
        409,
        'Já existe um registro seu em andamento. Aguarde.'
      );
    }

    locks.add(lock);

    try {
      return await executeSubmission(args);
    } finally {
      locks.delete(lock);
    }
  }

  async function executeSubmission({
    client,
    guild,
    member,
    payload = {},
    history = false,
  }) {
    let context;

    return runSiteOperation({
      action: 'powers.' + config.key,
      guildId: guild.id,
      actorId: member.id,
      payload,

      authorize: async () => {
        context = await access({
          client,
          guild,
          member,
          fresh: true,
          history,
        });

        if (!context.create) {
          throw fail(
            403,
            'Seu cargo não permite registrar estes poderes.'
          );
        }
      },

      execute: async () => {
        const raw = payload.values;

        if (
          !raw ||
          typeof raw !== 'object' ||
          Array.isArray(raw)
        ) {
          throw fail(
            400,
            'Preencha os campos do registro.'
          );
        }

        const values = {};

        for (const field of config.fields) {
          const value =
            typeof raw[field.id] === 'string'
              ? raw[field.id].trim()
              : '';

          if (
            !value ||
            value.length > field.maxLength
          ) {
            throw fail(
              400,
              'Confira o campo: ' + field.label + '.'
            );
          }

          values[field.id] = value;
        }

        const bot =
          guild.members.me ||
          await guild.members.fetchMe();

        if (
          !context.channel.permissionsFor(bot)?.has([
            P.ViewChannel,
            P.SendMessages,
            P.EmbedLinks,
          ])
        ) {
          throw fail(
            503,
            'O bot não pode enviar registros neste canal.'
          );
        }

        await config.before?.(context, values);

        const message = await context.channel.send({
          ...await config.build(context, values),

          allowedMentions: {
            parse: [],
            users: [member.id],
          },
        });

        const warnings = [];

        try {
          await config.after?.(
            context,
            values,
            message
          );
        } catch (error) {
          console.error(
            '[PODERES] Registro enviado; atualização complementar falhou:',
            config.key,
            error.message
          );

          warnings.push(
            'Registro enviado; uma atualização complementar ficou pendente. Não registre novamente.'
          );
        }

        if (
          !refreshing &&
          config.refreshButton
        ) {
          refreshing = Promise.resolve()
            .then(() =>
              config.refreshButton(
                context.channel,
                client
              )
            )
            .catch(error =>
              console.warn(
                '[PODERES] Botão:',
                config.key,
                error.message
              )
            )
            .finally(() => {
              refreshing = null;
            });
        }

        return {
          ok: true,
          url: message.url,
          messageId: message.id,
          warnings,
        };
      },
    });
  }

  async function site(args) {
    const {
      client,
      guild,
      member,
      action,
      payload = {},
    } = args;

    if (action === 'create') {
      return submit({
        client,
        guild,
        member,
        payload,
        history: true,
      });
    }

    const context = await access({
      client,
      guild,
      member,
    });

    const rights = {
      view: true,
      create: context.create,
      approve: false,
      reject: false,
    };

    if (action === 'catalog') {
      return {
        key: config.key,
        label: config.label,
        direct: true,
        rights,
      };
    }

    if (action === 'schema') {
      if (!context.create) {
        throw fail(
          403,
          'Seu cargo não permite registrar estes poderes.'
        );
      }

      return {
        fields: config.fields.map(field => ({
          ...field,
          required: true,
          value: '',
        })),
      };
    }

    if (action === 'list') {
      const page =
        await context.channel.messages.fetch({
          limit: 100,
        });

      return {
        limit: 100,
        history: [],

        records: [...page.values()]
          .filter(message =>
            message.author?.id === client.user.id &&
            message.embeds?.[0]?.title === config.title
          )
          .map(message => ({
            msgId: message.id,
            title: config.title,
            status: 'registrado',
            city: '',

            text: (
              message.embeds[0].fields || []
            ).map(field =>
              field.name + '\n' + field.value
            ).join('\n\n'),

            images: [
              message.embeds[0].image?.url,
            ].filter(Boolean),

            url: message.url,

            rights: {
              approve: false,
              reject: false,
            },
          })),
      };
    }

    throw fail(
      404,
      'Ação de poderes não encontrada.'
    );
  }

  return {
    site,
    submit,
  };
}