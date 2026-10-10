import {
  createTeamRequestSiteInteraction,
} from './teamRequestInteraction.js';

const DEFINITIONS = {
  leaders: {
    label: 'Set Líderes',
    color: 'red',
    channelId: '1428003736671883405',
  },

  staff: {
    label: 'Set Staff',
    color: 'blue',

    channelId: String(
      process.env.SETSTAFF_V2_CANAL_REGISTRO ||
      '1379024704957841509'
    ).trim(),
  },

  creators: {
    label: 'Set Santa Creators',
    color: 'purple',
    channelId: '1352706078621696030',
  },
};

function fail(message, status = 400) {
  return Object.assign(
    new Error(message),
    { status }
  );
}

function messageButtons(message) {
  return (message.components || []).flatMap(
    row => row.components || []
  );
}

function pendingCustomId(message, category, action) {
  const prefix = category === 'leaders'
    ? (
      action === 'approve'
        ? 'aprovar_set:'
        : 'recusar_set:'
    )
    : (
      action === 'approve'
        ? 'aprovar_set_'
        : 'reprovar_set_'
    );

  return messageButtons(message).find(
    button =>
      !button.disabled &&
      String(button.customId || '').startsWith(prefix)
  )?.customId || null;
}

function readableText(value, guild) {
  return String(value || '')
    .replace(
      /<@&(\d{17,20})>/g,
      (_, id) =>
        guild.roles.cache.get(id)?.name ||
        `Cargo ${id}`
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
        guild.channels.cache.get(id)?.name ||
        `Canal ${id}`
    );
}

function messageRecord(message, category, rights) {
  const embed = message.embeds?.[0];

  if (!embed) {
    return null;
  }

  const title = String(embed.title || '');

  const recognized = category === 'leaders'
    ? title.includes(
      'Solicitação de Set — Líder de Organização'
    )
    : title.includes(
      'Novo Pedido de Set Recebido'
    );

  if (!recognized) {
    return null;
  }

  const approveId = pendingCustomId(
    message,
    category,
    'approve'
  );

  const rejectId = pendingCustomId(
    message,
    category,
    'reject'
  );

  const resultField = (embed.fields || []).find(
    field => field.name === 'Resultado do pedido'
  );

  const decisionText =
    `${embed.footer?.text || ''}\n${resultField?.value || ''}`;

  const buttons = messageButtons(message);

  let status = 'indisponivel';

  if (approveId || rejectId) {
    status = 'pendente';
  } else if (/reprovado|recusado/i.test(decisionText)) {
    status = 'reprovado';
  } else if (
    /aprovado/i.test(decisionText) ||
    buttons.some(
      button => button.customId === 'set_aprovado'
    )
  ) {
    status = 'aprovado';
  } else if (
    /processando/i.test(decisionText) ||
    buttons.some(
      button => button.customId === 'set_processando'
    )
  ) {
    status = 'processando';
  }

  const requesterField = (embed.fields || []).find(
    field => /solicitante|usuário|usuario|membro/i.test(
      field.name
    )
  );

  const userId = [
    requesterField?.value,
    embed.description,
    ...(embed.fields || []).map(
      field => field.value
    )
  ]
    .map(
      value => String(
        value || ''
      ).match(
        /<@!?(\d{17,20})>/
      )?.[1]
    )
    .find(Boolean) || null;

  return {
    userId,
    msgId: message.id,
    createdAt: message.createdTimestamp,
    status,
    title,

    description: readableText(
      embed.description,
      message.guild
    ),

    fields: (embed.fields || []).map(
      field => ({
        name: field.name,

        value: readableText(
          field.value,
          message.guild
        ),
      })
    ),

    footer: readableText(
      embed.footer?.text,
      message.guild
    ),

    url:
      `https://discord.com/channels/${message.guildId}/${message.channelId}/${message.id}`,

    rights: {
      approve:
        rights.approve &&
        Boolean(approveId),

      reject:
        rights.reject &&
        Boolean(rejectId),
    },
  };
}

async function enrichTeamRequestProfiles(guild, records) {
  let next = 0;

  const profiles = new Map();

  const ids = [
    ...new Set(
      records
        .map(record => String(record.userId || ''))
        .filter(id => /^\d{17,20}$/.test(id))
    )
  ];

  await Promise.all(
    Array.from(
      {
        length: Math.min(4, ids.length)
      },
      async () => {
        while (next < ids.length) {
          const id = ids[next++];

          const member = await guild.members
            .fetch(id)
            .catch(() => null);

          if (!member) {
            continue;
          }

          profiles.set(id, {
            id,
            name: member.displayName,
            avatar: member.displayAvatarURL({
              size: 128
            }),
            roles: [
              ...member.roles.cache.values()
            ]
              .filter(role => role.id !== guild.id)
              .sort(
                (a, b) => b.position - a.position
              )
              .map(role => ({
                id: role.id,
                name: role.name,
                color: role.hexColor
              }))
          });
        }
      }
    )
  );

  for (const record of records) {
    record.profile = profiles.get(
      String(record.userId || '')
    ) || null;
  }

  return records;
}

export function createSiteTeamRequests({
  client,
  getStaffSnapshot,
  decideStaff,
  canApproveCreators,
  canRejectCreators,
  handleCreators,
}) {
  async function categoryAccess(guild, member, key) {
    const definition = DEFINITIONS[key];

    if (!definition) {
      throw fail('Categoria de pedidos inválida.');
    }

    const channel = await guild.channels
      .fetch(definition.channelId)
      .catch(() => null);

    const permissions = channel?.permissionsFor(member);

    if (
      !channel?.isTextBased() ||
      !channel.messages ||
      channel.guildId !== guild.id ||
      !permissions?.has([
        'ViewChannel',
        'ReadMessageHistory',
      ])
    ) {
      return null;
    }

    let rights;
    let staffData = null;

    if (key === 'staff') {
      staffData = await getStaffSnapshot({
        guild,
        actorId: member.id,
      });

      rights = {
        approve: Boolean(staffData.rights?.decide),
        reject: Boolean(staffData.rights?.decide),
      };
    } else if (key === 'leaders') {
      const provider = client.__SC_LEADER_SET_SITE__;

      if (!provider) {
        throw fail(
          'A integração de Set Líderes ainda não foi iniciada.',
          503
        );
      }

      const allowed = provider.canDecide(member);

      rights = {
        approve: allowed,
        reject: allowed,
      };
    } else {
      rights = {
        approve: canApproveCreators(member),
        reject: canRejectCreators(member),
      };
    }

    if (!rights.approve && !rights.reject) {
      return null;
    }

    return {
      channel,
      rights,
      staffData,
    };
  }

  async function canView(guild, member) {
    for (const key of Object.keys(DEFINITIONS)) {
      try {
        if (await categoryAccess(guild, member, key)) {
          return true;
        }
      } catch (error) {
        if (error?.status === 403 || error?.status === 503) {
          continue;
        }

        throw error;
      }
    }

    return false;
  }

  async function list({
    guild,
    member,
    payload = {},
  }) {
    const selected = payload.category
      ? String(payload.category)
      : null;

    if (selected && !DEFINITIONS[selected]) {
      throw fail('Categoria de pedidos inválida.');
    }

    if (
      payload.before &&
      !/^\d{17,20}$/.test(String(payload.before))
    ) {
      throw fail('Cursor de mensagens inválido.');
    }

    const categories = [];
    const warnings = [];

    for (
      const key of selected
        ? [selected]
        : Object.keys(DEFINITIONS)
    ) {
      let access;

      try {
        access = await categoryAccess(
          guild,
          member,
          key
        );
      } catch (error) {
        if (selected) {
          throw error;
        }

        if (error?.status === 403) {
          continue;
        }

        if (error?.status === 503) {
          console.warn(
            '[SITE TEAM REQUESTS] Categoria indisponível:',
            key,
            error.message
          );

          warnings.push(
            `${DEFINITIONS[key].label} está temporariamente indisponível.`
          );

          continue;
        }

        throw error;
      }

      if (!access) {
        continue;
      }

      let records;
      let nextCursor = null;

      if (key === 'staff') {
        records = (
          access.staffData.requests || []
        ).map(item => ({
          ...item,

          title: item.name || 'Pedido de Set Staff',
          description: '',
          footer: '',

          fields: [
            {
              name: 'Solicitante',

              value:
                guild.members.cache.get(item.userId)?.displayName ||
                `Usuário ${item.userId}`,
            },
            {
              name: 'Pasta / equipe',
              value: String(
                item.folder || '—'
              ),
            },
            {
              name: 'ID na cidade',
              value: String(
                item.gameId || '—'
              ),
            },
            {
              name: 'Cidade',

              value: String(
                item.cityLabel ||
                item.city ||
                '—'
              ),
            },
            {
              name: 'Nível',

              value: String(
                item.levelLabel ||
                item.level ||
                '—'
              ),
            },
          ],

          url:
            `https://discord.com/channels/${guild.id}/${access.channel.id}/${item.msgId}`,

          rights: {
            approve:
              access.rights.approve &&
              item.status === 'pendente',

            reject:
              access.rights.reject &&
              item.status === 'pendente',
          },
        }));
      } else {
        const page = await access.channel.messages.fetch({
          limit: 100,

          ...(
            payload.before
              ? { before: String(payload.before) }
              : {}
          ),
        });

        records = [...page.values()]
          .filter(
            message => message.author.id === client.user.id
          )
          .map(
            message => messageRecord(
              message,
              key,
              access.rights
            )
          )
          .filter(Boolean);

        if (page.size === 100) {
          nextCursor = page.last()?.id || null;
        }
      }

      await enrichTeamRequestProfiles(
        guild,
        records
      );

      categories.push({
        key,
        ...DEFINITIONS[key],

        rights: access.rights,

        records: records.sort(
          (a, b) =>
            Number(b.createdAt || 0) -
            Number(a.createdAt || 0)
        ),

        nextCursor,
      });
    }

    if (!categories.length) {
      if (warnings.length) {
        throw fail(
          'As categorias disponíveis ainda estão inicializando. Tente novamente em alguns instantes.',
          503
        );
      }

      throw fail(
        'Você não possui permissão para decidir pedidos destas categorias.',
        403
      );
    }

    return {
      categories,
      warnings,
      updatedAt: Date.now(),
    };
  }

  async function decide({
    guild,
    member,
    payload = {},
  }) {
    const key = String(payload.category || '');
    const action = String(payload.action || '');
    const msgId = String(payload.msgId || '');

    if (
      !DEFINITIONS[key] ||
      !['approve', 'reject'].includes(action) ||
      !/^\d{17,20}$/.test(msgId)
    ) {
      throw fail('Categoria, ação ou mensagem inválida.');
    }

    const freshMember = await guild.members.fetch({
      user: member.id,
      force: true,
    }).catch(() => null);

    if (!freshMember) {
      throw fail(
        'Seu acesso ao servidor não está disponível.',
        403
      );
    }

    const access = await categoryAccess(
      guild,
      freshMember,
      key
    );

    if (!access?.rights[action]) {
      throw fail(
        'Você não possui permissão para esta decisão.',
        403
      );
    }

    if (key === 'staff') {
      return decideStaff({
        client,
        guild,
        actorId: freshMember.id,
        msgId,
        action,
      });
    }

    const message = await access.channel.messages
      .fetch(msgId)
      .catch(() => null);

    if (
      !message ||
      message.author.id !== client.user.id
    ) {
      throw fail('Pedido oficial não encontrado.', 404);
    }

    const record = messageRecord(
      message,
      key,
      access.rights
    );

    const customId = pendingCustomId(
      message,
      key,
      action
    );

    if (
      !record ||
      record.status !== 'pendente' ||
      !customId
    ) {
      throw fail(
        'Este pedido já foi decidido ou está em processamento.',
        409
      );
    }

    const interaction = createTeamRequestSiteInteraction({
      guild,
      member: freshMember,
      message,
      customId,
    });

    if (key === 'leaders') {
      await client.__SC_LEADER_SET_SITE__.handle(
        interaction
      );
    } else {
      await handleCreators(
        interaction,
        client
      );
    }

    const applied = key === 'leaders'
      ? interaction.__scLeaderSetDecisionApplied
      : interaction.__scSetDecisionApplied;

    if (!applied) {
      throw fail(
        interaction.lastReply?.content ||
        'O bot não confirmou a conclusão da decisão.',
        409
      );
    }

    return {
      ok: true,

      status: action === 'approve'
        ? 'aprovado'
        : 'reprovado',
    };
  }

  return {
    canView,
    list,
    decide,
  };
}