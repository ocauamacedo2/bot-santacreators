import {
  createHash,
  randomUUID,
} from 'node:crypto';

import {
  mkdir,
  readFile,
  writeFile,
  rename,
} from 'node:fs/promises';

import path from 'node:path';

const GROUPS = {
  tickets: {
    label: 'Tickets',
    icon: '✉',
    actionable: true,
  },

  approvals: {
    label: 'Aprovações',
    icon: '✓',
    actionable: true,
  },

  protection: {
    label: 'Proteção',
    icon: '🛡',
    actionable: false,
  },

  general: {
    label: 'Gerais',
    icon: '◈',
    actionable: false,
  },
};

function readable(value, guild) {
  return String(value || '')
    .replace(
      /<@&(\d{17,20})>/g,
      (_, id) =>
        guild.roles.cache.get(id)?.name ||
        'Cargo não disponível'
    )
    .replace(
      /<@!?(\d{17,20})>/g,
      (_, id) =>
        guild.members.cache.get(id)?.displayName ||
        `Usuário ${id}`
    )
    .replace(
      /<#(\d{17,20})>/g,
      (_, id) =>
        `#${guild.channels.cache.get(id)?.name || id}`
    )
    .replace(
      /<a?:([\w]+):\d{17,20}>/g,
      (_, name) =>
        name.replaceAll('_', ' ')
    )
    .replace(
      /<t:(\d+)(?::[tTdDfFR])?>/g,
      (_, seconds) =>
        new Date(
          Number(seconds) * 1000
        ).toLocaleString(
          'pt-BR',
          {
            timeZone: 'America/Sao_Paulo',
          }
        )
    );
}

function webUrl(value) {
  try {
    const url = new URL(
      String(value || '')
    );

    return [
      'https:',
      'http:',
    ].includes(url.protocol)
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function createSiteNotifications({
  client,
  teamRequests,
  workflowProviders,
  paymentPending,
  checklistPending,
  isTeamMember,

  file = path.resolve(
    'data/site-notification-read.json'
  ),
}) {
  let state = {
    users: {},
  };

  const ready = readFile(
    file,
    'utf8'
  ).then(text => {
    const data = JSON.parse(text);

    if (
      !data?.users ||
      typeof data.users !== 'object' ||
      Array.isArray(data.users)
    ) {
      throw new Error(
        'Estado de leitura de notificações inválido.'
      );
    }

    state = data;
  }).catch(error => {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  });

  void ready.catch(() => {});

  let writing = Promise.resolve();
  const issued = new Map();

  async function saveSeen(actorKey, keys) {
    const operation = writing.then(async () => {
      await ready;

      const next = structuredClone(state);
      const now = Date.now();
      const previous = next.users[actorKey] || {};

      for (const key of keys) {
        previous[key] = now;
      }

      next.users[actorKey] = Object.fromEntries(
        Object.entries(previous)
          .filter(
            ([, at]) =>
              at > now - 90 * 86400000
          )
          .sort(
            (first, second) =>
              second[1] - first[1]
          )
          .slice(0, 5000)
      );

      await mkdir(
        path.dirname(file),
        {
          recursive: true,
        }
      );

      const temporary =
        `${file}.${randomUUID()}.tmp`;

      await writeFile(
        temporary,
        JSON.stringify(next, null, 2)
      );

      await rename(
        temporary,
        file
      );

      state = next;
    });

    writing = operation.catch(() => {});

    return operation;
  }

  async function freshMember(guild, member) {
    const actor = await guild.members.fetch({
      user: member.id,
      force: true,
    });

    if (!actor) {
      throw Object.assign(
        new Error(
          'Acesso ao servidor indisponível.'
        ),
        {
          status: 403,
        }
      );
    }

    return actor;
  }

  async function build(guild, member) {
    await ready;

    const records = [];
    const warnings = [];
    const available = new Set();

    const add = (group, source, item) => {
      const record = {
        group,
        source,

        id: String(
          item.id ||
          item.msgId ||
          item.messageId
        ),

        title: readable(
          item.title,
          guild
        ),

        text: readable(
          item.text ||
          item.description,
          guild
        ),

        fields: (
          item.fields || []
        ).map(field => ({
          name: readable(
            field.name,
            guild
          ),

          value: readable(
            field.value,
            guild
          ),
        })),

        images: (
          item.images || []
        ).map(webUrl).filter(Boolean),

        attachments: (
          item.attachments || []
        ).map(value => ({
          name: String(
            value.name || 'Arquivo'
          ),

          url: webUrl(
            value.url
          ),
        })).filter(value =>
          value.url
        ),

        url: webUrl(
          item.url
        ),

        destination:
          item.destination || null,

        at: Number(
          item.createdAt || 0
        ),

        pending:
          Boolean(item.pending),
      };

      record.key =
        `${group}:${source}:${record.id}:` +
        createHash('sha256')
          .update(
            JSON.stringify(record)
          )
          .digest('hex')
          .slice(0, 20);

      records.push(record);
    };

    const attempt = async (label, task) => {
      try {
        await task();
      } catch (error) {
        if (error.status === 403) {
          return;
        }

        console.error(
          '[SITE NOTIFICATIONS]',
          label,
          error
        );

        warnings.push(
          `${label}: consulta indisponível; os totais podem estar incompletos.`
        );
      }
    };

    await attempt(
      'Tickets',
      async () => {
        const provider =
          client.__SC_TICKET_NOTIFICATION_SITE__;

        if (!provider) {
          throw new Error(
            'Provedor de tickets não inicializado.'
          );
        }

        const data = await provider.list({
          guild,
          member,
        });

        if (data.allowed) {
          available.add('tickets');
        }

        warnings.push(
          ...(data.warnings || [])
        );

        for (const item of data.records || []) {
          add(
            'tickets',
            'ticket',
            {
              ...item,
              pending: true,
            }
          );
        }
      }
    );

    if (
      member.id === '660311795327828008' ||
      isTeamMember(member)
    ) {
      await attempt(
        'Pedidos da equipe',
        async () => {
          const data = await teamRequests.list({
            guild,
            member,
          });

          available.add('approvals');

          warnings.push(
            ...(data.warnings || [])
          );

          for (const category of data.categories) {
            if (category.nextCursor) {
              warnings.push(
                `${category.label}: há páginas anteriores; o contador inclui apenas os pedidos carregados.`
              );
            }

            for (const item of category.records) {
              if (
                item.status !== 'pendente' ||
                !(
                  item.rights?.approve ||
                  item.rights?.reject
                )
              ) {
                continue;
              }

              add(
                'approvals',
                category.key,
                {
                  ...item,

                  title:
                    `${category.label} • ${item.title}`,

                  pending: true,
                  destination: 'staff',
                }
              );
            }
          }
        }
      );

      for (
        const [key, provider]
        of Object.entries(workflowProviders)
      ) {
        await attempt(
          key,
          async () => {
            const data = await provider.site({
              client,
              guild,
              member,
              action: 'list',
            });

            if (data.rights?.decide) {
              available.add('approvals');
            }

            warnings.push(
              `${key}: consulta limitada aos ${data.recordLimit || 500} registros recentes do módulo.`
            );

            for (const item of data.records || []) {
              if (
                item.status === 'pendente' &&
                item.rights?.decide
              ) {
                add(
                  'approvals',
                  key,
                  {
                    ...item,
                    pending: true,
                    destination: 'workflow',
                  }
                );
              }
            }
          }
        );
      }
    }

    await attempt(
      'Pagamentos',
      async () => {
        const data = await paymentPending({
          guild,
          member,
        });

        if (data.allowed) {
          available.add('approvals');
        }

        if (data.limited) {
          warnings.push(
            'Pagamentos: existem mensagens anteriores ao limite consultado.'
          );
        }

        for (const item of data.records || []) {
          add(
            'approvals',
            'payment',
            {
              ...item,
              pending: true,
              destination: 'payments',
            }
          );
        }
      }
    );

    await attempt(
      'Checklist semanal',
      async () => {
        const data = await checklistPending({
          guild,
          member,
        });

        if (data.allowed) {
          available.add('approvals');
        }

        for (const item of data.records || []) {
          add(
            'approvals',
            'checklist',
            {
              ...item,
              pending: true,
              destination: 'checklist',
            }
          );
        }
      }
    );

    const logSources = [
      [
        'protection',
        'Flood',
        '1507676677927338107',
      ],

      [
        'protection',
        'Proteção de cargos',
        '1378206851467972778',
      ],

      [
        'general',
        'Registros gerais',

        String(
          process.env.SANTA_SITE_GENERAL_LOG_CHANNEL_ID ||
          ''
        ).trim(),
      ],
    ];

    for (
      const [group, label, channelId]
      of logSources
    ) {
      if (!/^\d{17,20}$/.test(channelId)) {
        continue;
      }

      await attempt(
        label,
        async () => {
          const channel = await guild.channels.fetch(
            channelId
          );

          if (
            channel?.guildId !== guild.id ||
            !channel.messages ||
            !channel.permissionsFor(member)?.has([
              'ViewChannel',
              'ReadMessageHistory',
            ])
          ) {
            return;
          }

          available.add(group);

          const page = await channel.messages.fetch({
            limit: 50,
          });

          for (const message of page.values()) {
            if (
              message.author?.id !== client.user.id
            ) {
              continue;
            }

            const embeds =
              message.embeds || [];

            add(
              group,
              channelId,
              {
                id:
                  message.id,

                title:
                  embeds[0]?.title || label,

                text: [
                  message.content,

                  ...embeds.map(embed =>
                    embed.description
                  ),
                ].filter(Boolean).join('\n'),

                fields: embeds.flatMap(embed =>
                  embed.fields || []
                ),

                images: embeds
                  .flatMap(embed => [
                    embed.image?.url,
                    embed.thumbnail?.url,
                  ])
                  .filter(Boolean)
                  .concat(
                    [
                      ...message.attachments.values(),
                    ]
                      .filter(file =>
                        String(
                          file.contentType || ''
                        ).startsWith('image/')
                      )
                      .map(file =>
                        file.url
                      )
                  ),

                attachments: [
                  ...message.attachments.values(),
                ].map(file => ({
                  name:
                    file.name,

                  url:
                    file.url,
                })),

                url:
                  message.url,

                createdAt:
                  message.createdTimestamp,
              }
            );
          }
        }
      );
    }

    const actorKey =
      `${guild.id}:${member.id}`;

    const seen =
      state.users[actorKey] || {};

    const unique = [
      ...new Map(
        records.map(item => [
          item.key,
          item,
        ])
      ).values(),
    ]
      .sort(
        (first, second) =>
          second.at - first.at
      )
      .map(item => ({
        ...item,

        seen:
          Boolean(seen[item.key]),
      }));

    return {
      groups: Object.entries(GROUPS)
        .filter(
          ([key]) =>
            available.has(key)
        )
        .map(
          ([key, config]) => {
            const items = unique.filter(
              item =>
                item.group === key
            );

            return {
              key,
              ...config,

              unread: items.filter(
                item =>
                  !item.seen
              ).length,

              pending: items.filter(
                item =>
                  item.pending
              ).length,

              records:
                items,
            };
          }
        ),

      warnings: [
        ...new Set(warnings),
      ],

      generatedAt:
        Date.now(),
    };
  }

  async function handle({
    guild,
    member,
    action,
    payload = {},
  }) {
    member = await freshMember(
      guild,
      member
    );

    const actorKey =
      `${guild.id}:${member.id}`;

    if (action === 'notifications.snapshot') {
      const data = await build(
        guild,
        member
      );

      const token = randomUUID();

      for (const [id, session] of issued) {
        if (session.expires < Date.now()) {
          issued.delete(id);
        }
      }

      if (issued.size >= 1000) {
        issued.delete(
          issued.keys().next().value
        );
      }

      issued.set(
        token,
        {
          actorKey,

          expires:
            Date.now() + 120000,

          keys: new Set(
            data.groups.flatMap(group =>
              group.records.map(item =>
                item.key
              )
            )
          ),
        }
      );

      return {
        ...data,
        token,
      };
    }

    if (action !== 'notifications.seen') {
      throw Object.assign(
        new Error(
          'Ação de notificação inválida.'
        ),
        {
          status: 400,
        }
      );
    }

    const session = issued.get(
      String(payload.token || '')
    );

    if (
      !session ||
      session.actorKey !== actorKey ||
      session.expires < Date.now()
    ) {
      throw Object.assign(
        new Error(
          'Atualize as notificações antes de registrar a leitura.'
        ),
        {
          status: 409,
        }
      );
    }

    if (
      !Array.isArray(payload.keys) ||
      payload.keys.length > 100 ||
      payload.keys.some(key =>
        typeof key !== 'string' ||
        !session.keys.has(key)
      )
    ) {
      throw Object.assign(
        new Error(
          'Lista de leitura inválida.'
        ),
        {
          status: 400,
        }
      );
    }

    await saveSeen(
      actorKey,
      [
        ...new Set(payload.keys),
      ]
    );

    return {
      ok: true,
    };
  }

  return {
    handle,
  };
}