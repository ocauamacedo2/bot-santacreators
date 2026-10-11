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

  if (/reprovado|recusado/i.test(decisionText)) {
    status = 'reprovado';
  } else if (
    /aprovado/i.test(decisionText) ||
    buttons.some(button => button.customId === 'set_aprovado')
  ) {
    status = 'aprovado';
  } else if (
    /processando/i.test(decisionText) ||
    buttons.some(button => button.customId === 'set_processando')
  ) {
    status = 'processando';
  } else if (approveId || rejectId) {
    status = 'pendente';
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
        status === 'pendente' &&
        rights.approve &&
        Boolean(approveId),

      reject:
        status === 'pendente' &&
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
  canManageStaff,
}) {
  const decisionBuild = '20261011-decisions-9';

  console.info('[SITE TEAM REQUESTS] Módulo carregado:', {
    build: decisionBuild,
    module: import.meta.url,
    pid: process.pid,
  });

  const decisionOperations = new Map();

  async function categoryAccess(guild, member, key) {
    const definition = DEFINITIONS[key];

    if (!definition) {
      throw fail('Categoria de pedidos inválida.');
    }

    const channel = guild.channels.cache.get(definition.channelId) ||
      await guild.channels
        .fetch(definition.channelId)
        .catch(error => {
          if (
            [10003, 50001, 50013].includes(
              Number(error.code)
            )
          ) {
            return null;
          }

          console.warn(
            '[SITE TEAM REQUESTS] Falha ao consultar canal da categoria:',
            {
              guildId: guild.id,
              channelId: definition.channelId,
              category: key,
              code: error.code || null,
              status: error.status || null,
              name: error.name,
            }
          );

          throw fail(
            'Não foi possível consultar o canal desta categoria agora. Tente novamente.',
            503
          );
        });

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
      if (typeof canManageStaff === 'function') {
        const allowed =
          Boolean(
            await canManageStaff(member)
          );

        rights = {
          approve: allowed,
          reject: allowed,
        };
      } else {
        staffData = await getStaffSnapshot({
          guild,
          actorId: member.id,
        });

        rights = {
          approve: Boolean(staffData.rights?.decide),
          reject: Boolean(staffData.rights?.decide),
        };
      }
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

    return {
      channel,
      rights,
      staffData,
    };
  }

  async function canView(guild, member) {
    let unavailable = false;

    for (const [key, definition] of Object.entries(DEFINITIONS)) {
      try {
        if (key === 'staff' && typeof canManageStaff === 'function') {
          const channel = guild.channels.cache.get(definition.channelId) ||
            await guild.channels.fetch(definition.channelId);
          const permissions = channel?.permissionsFor(member);
          if (
            channel?.isTextBased() && channel.messages &&
            channel.guildId === guild.id &&
            permissions?.has(['ViewChannel', 'ReadMessageHistory'])
          ) {
            return true;
          }
          continue;
        }
        if (await categoryAccess(guild, member, key)) return true;
      } catch (error) {
        if (
          error?.status === 403 ||
          [10003, 50001, 50013].includes(
            Number(error.code)
          )
        ) {
          continue;
        }

        if (
          error?.status === 503 ||
          key === 'staff'
        ) {
          unavailable = true;

          console.warn(
            '[SITE TEAM REQUESTS] Verificação de leitura indisponível:',
            {
              guildId: guild.id,
              actorId: member.id,
              category: key,
              code: error.code || null,
              status: error.status || null,
              name: error.name,
            }
          );

          continue;
        }

        throw error;
      }
    }

    if (unavailable) {
      throw fail(
        'Não foi possível confirmar o acesso aos pedidos agora. Tente novamente.',
        503
      );
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

      const checkedAt = Date.now();

      let records;
      let nextCursor = null;

      if (key === 'staff') {
        const staffData =
          access.staffData ||
          await getStaffSnapshot({
            guild,
            actorId: member.id,
          });

        const canDecide =
          Boolean(staffData.rights?.decide);

        access.rights = {
          approve:
            access.rights.approve &&
            canDecide,

          reject:
            access.rights.reject &&
            canDecide,
        };

        records = (
          staffData.requests || []
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

      categories.push({
        key,
        ...DEFINITIONS[key],

        checkedAt,

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

    await enrichTeamRequestProfiles(
      guild,
      categories.flatMap(
        category => category.records
      )
    );

    return {
      categories: categories.map(category => ({
        ...category,
        records: category.records.map(record => {
          const key = `${guild.id}:${category.key}:${record.msgId}`;
          return decisionOperations.has(key)
            ? {
                ...record,
                status: 'processando',
                rights: { approve: false, reject: false },
              }
            : record;
        }),
      })),
      warnings,
      updatedAt: Date.now(),
    };
  }

  async function executeDecision({
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
    }).catch(error => {
      if (Number(error.code) === 10007) {
        return null;
      }

      console.warn(
        '[SITE TEAM REQUESTS] Falha ao validar membro:',
        {
          guildId: guild.id,
          actorId: member.id,
          code: error.code || null,
          status: error.status || null,
          name: error.name
        }
      );

      throw fail(
        'Não foi possível validar seu acesso agora. A decisão não foi executada. Tente novamente.',
        503
      );
    });

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
      .fetch({ message: msgId, force: true })
      .catch(error => {
        if (Number(error.code) === 10008) {
          return null;
        }

        console.warn(
          '[SITE TEAM REQUESTS] Falha ao consultar pedido:',
          {
            guildId: guild.id,
            channelId: access.channel.id,
            msgId,
            code: error.code || null,
            status: error.status || null,
            name: error.name
          }
        );

        throw fail(
          'Não foi possível consultar este pedido no Discord. A decisão não foi executada. Tente novamente.',
          503
        );
      });

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

    if (record && ['aprovado', 'reprovado'].includes(record.status)) {
      return {
        ok: true,
        status: record.status,
        alreadyDecided: true,
        record: {
          ...record,
          rights: { approve: false, reject: false },
        },
      };
    }

    if (!record || record.status !== 'pendente' || !customId) {
      throw fail(
        'Este pedido está em processamento ou seus controles não estão disponíveis. Atualize para confirmar o estado no Discord.',
        409
      );
    }

    const interaction = createTeamRequestSiteInteraction({
      guild,
      member: freshMember,
      message,
      customId,
    });

    let handlerError = null;

    try {
      if (key === 'leaders') {
        await client.__SC_LEADER_SET_SITE__.handle(interaction);
      } else {
        await handleCreators(interaction, client);
      }
    } catch (error) {
      const committed = key === 'leaders'
        ? interaction.__scLeaderSetDecisionApplied
        : interaction.__scSetDecisionApplied;

      if (!committed) {
        handlerError = error;

        console.warn(
          '[SITE TEAM REQUESTS] Handler falhou; consultando resultado no Discord:',
          {
            category: key,
            msgId,
            name: error.name,
            message: error.message,
          }
        );
      } else {
        console.warn('[SITE TEAM REQUESTS] Decisão aplicada; aviso posterior falhou:', {
          category: key,
          msgId,
          name: error.name,
          message: error.message,
        });
      }
    }

    const applied = key === 'leaders'
      ? interaction.__scLeaderSetDecisionApplied
      : interaction.__scSetDecisionApplied;

    if (!applied) {
      console.warn('[SITE TEAM REQUESTS] Handler não confirmou a decisão:', {
        build: decisionBuild,
        module: import.meta.url,
        pid: process.pid,
        guildId: guild.id,
        category: key,
        msgId,
        action,
        handler: key === 'leaders'
          ? 'client.__SC_LEADER_SET_SITE__.handle'
          : 'handleCreators',
        leaderDecisionApplied:
          interaction.__scLeaderSetDecisionApplied === true,
        creatorsDecisionApplied:
          interaction.__scSetDecisionApplied === true,
        replyContent: interaction.lastReply?.content || null,
      });

      const currentMessage = await access.channel.messages
        .fetch({ message: msgId, force: true })
        .catch(error => {
          console.warn(
            '[SITE TEAM REQUESTS] Falha ao reconciliar decisão:',
            {
              guildId: guild.id,
              channelId: access.channel.id,
              msgId,
              category: key,
              action,
              code: error.code || null,
              status: error.status || null,
              name: error.name,
            }
          );

          throw fail(
            'Não foi possível confirmar o resultado atual no Discord. Atualize este pedido antes de tentar outra decisão.',
            503
          );
        });

      const currentRecord =
        currentMessage.author.id === client.user.id
          ? messageRecord(
              currentMessage,
              key,
              access.rights
            )
          : null;

      if (
        currentRecord &&
        ['aprovado', 'reprovado'].includes(currentRecord.status)
      ) {
        return {
          ok: true,
          status: currentRecord.status,
          alreadyDecided: true,
          record: {
            ...currentRecord,
            rights: { approve: false, reject: false },
          },
        };
      }

      if (handlerError) {
        throw handlerError;
      }

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

  async function decide(args) {
    const key = `${args.guild.id}:${args.payload?.category || ''}:${args.payload?.msgId || ''}`;
    const previous = decisionOperations.get(key);

    if (previous) {
      if (
        previous.actorId === args.member.id &&
        previous.action === args.payload?.action
      ) {
        return previous.promise;
      }

      console.warn('[SITE TEAM REQUESTS] Decisão concorrente:', {
        build: decisionBuild,
        pid: process.pid,
        guildId: args.guild.id,
        category: args.payload?.category,
        msgId: args.payload?.msgId,
      });

      throw fail('Outra decisão está em andamento neste pedido.', 409);
    }

    const operation = {
      actorId: args.member.id,
      action: args.payload?.action,
      promise: null,
    };

    console.info('[SITE TEAM REQUESTS] Decisão recebida:', {
      build: decisionBuild,
      pid: process.pid,
      guildId: args.guild.id,
      category: args.payload?.category,
      msgId: args.payload?.msgId,
      action: args.payload?.action,
    });

    operation.promise = executeDecision(args)
      .then(result => {
        console.info('[SITE TEAM REQUESTS] Decisão concluída:', {
          build: decisionBuild,
          pid: process.pid,
          category: args.payload?.category,
          msgId: args.payload?.msgId,
          status: result?.status,
          alreadyDecided: result?.alreadyDecided === true,
        });

        return {
          ...result,
          decisionBuild,
        };
      })
      .catch(error => {
        console.warn('[SITE TEAM REQUESTS] Decisão falhou:', {
          build: decisionBuild,
          module: import.meta.url,
          pid: process.pid,
          category: args.payload?.category,
          msgId: args.payload?.msgId,
          action: args.payload?.action,
          status: error.status || error.statusCode || null,
          message: error.message,
        });

        throw error;
      })
      .finally(() => {
        if (decisionOperations.get(key) === operation) {
          decisionOperations.delete(key);
        }
      });

    decisionOperations.set(key, operation);
    return operation.promise;
  }

  return {
    canView,
    list,
    decide,
  };
}