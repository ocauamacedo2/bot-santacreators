import {
  createHash,
  randomUUID,
} from 'node:crypto';

import {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
} from 'discord.js';

import {
  createTeamRequestSiteInteraction,
} from './teamRequestInteraction.js';

import {
  approvalReceipts,
  recordApprovalReceipt,
  installApprovalAudit,
} from './approvalAudit.js';

const error = (
  text,
  status = 400
) =>
  Object.assign(
    new Error(text),
    { status }
  );

const clone = value =>
  JSON.parse(
    JSON.stringify(value)
  );

const fingerprint = value =>
  createHash('sha256')
    .update(
      JSON.stringify(value)
    )
    .digest('hex');

const buttons = message =>
  (message.components || [])
    .flatMap(
      row =>
        row.components || []
    );

const bypassConfirmation = member =>
  member.id === '660311795327828008' ||
  member.roles.cache.has('1262262852949905408') ||
  member.roles.cache.has('1352408327983861844');

function proxyInteraction(
  interaction,
  member,
  message,
  customId = interaction.customId,
  button = false
) {
  return new Proxy(
    interaction,
    {
      get(target, property) {
        if (property === 'member') {
          return member;
        }

        if (property === 'message') {
          return message;
        }

        if (property === 'customId') {
          return customId;
        }

        if (
          button &&
          property === 'isButton'
        ) {
          return () => true;
        }

        if (
          button &&
          property === 'isModalSubmit'
        ) {
          return () => false;
        }

        if (property === 'deferReply') {
          return async payload => {
            if (
              !target.deferred &&
              !target.replied
            ) {
              await target.deferReply(payload);
            }
          };
        }

        if (property === 'reply') {
          return payload =>
            target.deferred || target.replied
              ? target.followUp(payload)
              : target.reply(payload);
        }

        const value =
          Reflect.get(
            target,
            property,
            target
          );

        return typeof value === 'function'
          ? value.bind(target)
          : value;
      },
    }
  );
}

export function createApprovalWorkflow(cfg) {
  const locks = new Set();

  const tokens = new Map();

  const modalPrefix =
    `awf_${cfg.key}_`;

  let messageCache = null;

  let fetching = null;

  async function access(
    guild,
    member,
    channelId
  ) {
    const channel =
      await guild.channels
        .fetch(channelId)
        .catch(() => null);

    if (
      channel?.guildId !== guild.id ||
      !channel.messages ||
      !channel.permissionsFor(member)?.has([
        'ViewChannel',
        'ReadMessageHistory',
      ])
    ) {
      throw error(
        'Você não possui acesso a este canal no Discord.',
        403
      );
    }

    return channel;
  }

  async function currentMember(
    guild,
    actorId
  ) {
    const member =
      await guild.members
        .fetch({
          user: actorId,
          force: true,
        })
        .catch(() => null);

    if (!member) {
      throw error(
        'Membro não encontrado no servidor.',
        403
      );
    }

    return member;
  }

  async function messages(guild) {
    if (
      messageCache?.guildId === guild.id &&
      Date.now() - messageCache.at < 15000
    ) {
      return messageCache.messages;
    }

    if (!fetching) {
      fetching = (
        async () => {
          const channel =
            await guild.channels.fetch(
              cfg.channelId
            );

          if (
            channel?.guildId !== guild.id
          ) {
            throw error(
              'Canal de aprovação de outro servidor.',
              403
            );
          }

          const result = [];

          let before;

          for (
            let page = 0;
            page < 5;
            page++
          ) {
            const batch =
              await channel.messages.fetch({
                limit: 100,

                ...(before
                  ? { before }
                  : {}),
              });

            result.push(
              ...batch.values()
            );

            if (batch.size < 100) {
              break;
            }

            before =
              batch.last().id;
          }

          messageCache = {
            guildId: guild.id,
            at: Date.now(),
            messages: result,
          };

          return result;
        }
      )().finally(
        () => {
          fetching = null;
        }
      );
    }

    return fetching;
  }

  function decode(
    customId,
    message
  ) {
    if (cfg.decode) {
      return cfg.decode(
        customId,
        message
      );
    }

    if (
      customId.startsWith(
        cfg.approvePrefix
      )
    ) {
      return {
        action: 'approve',

        reqId:
          customId.slice(
            cfg.approvePrefix.length
          ),
      };
    }

    if (
      customId.startsWith(
        cfg.rejectPrefix
      )
    ) {
      return {
        action: 'reject',

        reqId:
          customId.slice(
            cfg.rejectPrefix.length
          ),
      };
    }

    return null;
  }

  function customId(
    action,
    reqId
  ) {
    return cfg.buttonId
      ? cfg.buttonId(action)
      : `${action === 'approve' ? cfg.approvePrefix : cfg.rejectPrefix}${reqId}`;
  }

  function view(
    message,
    data,
    status = 'pendente'
  ) {
    return {
      reqId: data.reqId,

      msgId: message.id,

      userId: data.userId,

      title:
        data.eventName ||
        data.title ||
        cfg.label,

      text:
        data.winnersText ||
        data.description ||
        '',

      city:
        data.cityDisplayName ||
        cfg.cities?.[data.cityKey]?.label ||
        '',

      createdAt:
        data.createdAt ||
        message.createdTimestamp,

      images: [
        ...new Set(
          data.imageUrls || [
            data.imageUrl,
            data.imageUrl2,
            data.imageUrl3,
            data.imageUrl4,
          ].filter(Boolean)
        ),
      ],

      status,

      url:
        `https://discord.com/channels/${message.guildId}/${message.channelId}/${message.id}`,
    };
  }

  async function preflight(
    guild,
    member,
    message,
    action,
    reqId
  ) {
    await access(
      guild,
      member,
      cfg.channelId
    );

    if (
      !cfg.canDecide(member)
    ) {
      throw error(
        'Sem permissão para esta decisão.',
        403
      );
    }

    const data =
      cfg.getRequest(
        reqId,
        message
      );

    const active =
      buttons(message).some(
        button =>
          button.customId ===
            customId(action, reqId) &&
          !button.disabled
      );

    if (
      !data ||
      !active
    ) {
      throw error(
        'Pedido finalizado ou em processamento.',
        409
      );
    }

    const check =
      await cfg.validate(
        {
          guild,
          member,
          user: member.user,
          message,
        },
        data,
        action
      );

    if (!check.allowed) {
      throw error(
        check.reason ||
        check.message ||
        'Decisão bloqueada pela hierarquia.',
        403
      );
    }

    return {
      ...clone(data),
      reqId,
    };
  }

  function makeToken(
    guild,
    member,
    message,
    action,
    data
  ) {
    for (
      const [id, item]
      of tokens
    ) {
      if (
        item.expiresAt < Date.now()
      ) {
        tokens.delete(id);
      }
    }

    if (
      tokens.size >= 1000
    ) {
      tokens.delete(
        tokens.keys().next().value
      );
    }

    const token =
      randomUUID();

    tokens.set(
      token,
      {
        guildId: guild.id,

        actorId: member.id,

        msgId: message.id,

        action,

        reqId: data.reqId,

        revision:
          fingerprint(data),

        expiresAt:
          Date.now() + 120000,
      }
    );

    return token;
  }

  async function execute({
    client,
    guild,
    member,
    message,
    action,
    reqId,
    reason = '',
    token,
    interaction,
  }) {
    const lockKey =
      `${guild.id}:${message.id}`;

    if (
      locks.has(lockKey)
    ) {
      throw error(
        'Pedido já em processamento.',
        409
      );
    }

    locks.add(lockKey);

    try {
      installApprovalAudit(client);

      member =
        await currentMember(
          guild,
          member.id
        );

      message =
        await message.fetch();

      if (
        message.author.id !==
        client.user.id
      ) {
        throw error(
          'Mensagem não pertence ao bot.',
          403
        );
      }

      const data =
        await preflight(
          guild,
          member,
          message,
          action,
          reqId
        );

      if (
        !bypassConfirmation(member)
      ) {
        const prepared =
          tokens.get(token);

        if (
          !prepared ||
          prepared.expiresAt < Date.now() ||
          prepared.guildId !== guild.id ||
          prepared.actorId !== member.id ||
          prepared.msgId !== message.id ||
          prepared.action !== action ||
          prepared.reqId !== reqId ||
          prepared.revision !== fingerprint(data)
        ) {
          throw error(
            'Confirmação expirada ou pedido alterado. Confirme novamente.',
            409
          );
        }

        tokens.delete(token);
      }

      reason =
        String(reason).trim();

      if (
        reason.length > 1000
      ) {
        throw error(
          'O motivo pode ter até 1000 caracteres.'
        );
      }

      const original =
        clone(
          message.embeds.map(
            embed =>
              embed.toJSON()
          )
        );

      const run =
        interaction ||
        createTeamRequestSiteInteraction({
          guild,
          member,
          message,

          customId:
            customId(action, reqId),
        });

      if (
        !run.deferred &&
        !run.replied
      ) {
        await run.deferReply({
          ephemeral: true,
        });
      }

      try {
        await cfg.handler(
          proxyInteraction(
            run,
            member,
            message,
            customId(action, reqId),
            true
          ),
          client
        );
      } catch (e) {
        if (
          !run.__approvalWorkflowApplied
        ) {
          throw e;
        }

        console.error(
          '[ApprovalWorkflow] Decisão concluída; aviso posterior falhou:',
          e.message
        );
      }

      let updated =
        await message.fetch();

      const expectedStatus =
        action === 'approve'
          ? 'aprovado'
          : 'reprovado';

      if (
        cfg.status(updated) !== expectedStatus &&
        run.__approvalWorkflowApplied
      ) {
        const embed =
          EmbedBuilder
            .from(
              updated.embeds[0]
            )
            .setTitle(
              `${action === 'approve' ? '✅' : '❌'} ${cfg.label} ${action === 'approve' ? 'APROVADO' : 'RECUSADO'}`
            )
            .setColor(
              action === 'approve'
                ? 0x2ecc71
                : 0xe74c3c
            );

        const components =
          (updated.components || [])
            .map(row => ({
              type: 1,
              components:
                row.components
                  .filter(button =>
                    !decode(
                      String(button.customId || ''),
                      updated
                    )
                  )
                  .map(button => button.toJSON()),
            }))
            .filter(row => row.components.length);

        await updated.edit({
          embeds: [
            embed,
            ...updated.embeds.slice(1),
          ],
          components,
        });

        updated =
          await message.fetch();
      }

      const status =
        cfg.status(updated);

      if (
        status !== expectedStatus
      ) {
        const response =
          run.lastReply;

        throw error(
          typeof response === 'string'
            ? response
            : response?.content ||
              'O bot não confirmou a conclusão. Confira o pedido no Discord.',
          409
        );
      }

      try {
        const components =
          (updated.components || [])
            .map(
              row => ({
                type: 1,

                components:
                  row.components
                    .filter(
                      button =>
                        !decode(
                          String(
                            button.customId || ''
                          ),
                          updated
                        )
                    )
                    .map(
                      button =>
                        button.toJSON()
                    ),
              })
            )
            .filter(
              row =>
                row.components.length
            );

        await updated.edit({
          components,
        });
      } catch (e) {
        console.error(
          '[ApprovalWorkflow] Remoção dos controles:',
          e.message
        );
      }

      const decidedAt =
        Date.now();

      try {
        const embed =
          EmbedBuilder.from(
            updated.embeds[0]
          );

        const fields =
          embed.data.fields || [];

        if (
          fields.length < 25
        ) {
          embed.addFields({
            name:
              '🧾 Decisão registrada',

            value:
              `<@${member.id}> • <t:${Math.floor(decidedAt / 1000)}:F>\n${reason || 'Motivo não informado.'}`
                .slice(0, 1024),
          });
        }

        await updated.edit({
          embeds: [
            embed,
            ...updated.embeds.slice(1),
          ],
        });

        updated =
          await message.fetch();
      } catch (e) {
        console.error(
          '[ApprovalWorkflow] Complemento da mensagem:',
          e.message
        );
      }

      const receipt = {
        ...view(
          updated,
          data,
          status
        ),

        workflow: cfg.key,

        label: cfg.label,

        guildId: guild.id,

        actorId: member.id,

        actorName:
          member.user.tag ||
          member.displayName,

        actorAvatar:
          member.user.displayAvatarURL({
            size: 128,
          }),

        decidedAt,

        reason,

        origin:
          run.siteOrigin
            ? 'Site'
            : 'Discord',

        auditChannelId:
          cfg.auditChannelId,

        before: {
          data,
          embeds: original,
        },

        after: {
          status,

          embeds:
            updated.embeds.map(
              embed =>
                embed.toJSON()
            ),
        },
      };

      try {
        recordApprovalReceipt(
          receipt
        );
      } catch (e) {
        console.error(
          '[ApprovalWorkflow] Decisão concluída; falha ao persistir auditoria:',
          e
        );
      }

      messageCache = null;

      return {
        ok: true,
        status,
      };
    } finally {
      locks.delete(lockKey);
    }
  }

  async function handle(
    interaction,
    client
  ) {
    if (
      !interaction.guild
    ) {
      return cfg.handler(
        interaction,
        client
      );
    }

    const decision =
      interaction.isButton()
        ? decode(
            String(
              interaction.customId || ''
            ),
            interaction.message
          )
        : null;

    const confirm =
      interaction.isModalSubmit() &&
      String(
        interaction.customId
      ).startsWith(modalPrefix);

    const creating =
      interaction.isModalSubmit() &&
      cfg.isCreateModal(
        interaction.customId
      );

    if (
      !decision &&
      !confirm &&
      !creating
    ) {
      return cfg.handler(
        interaction,
        client
      );
    }

    try {
      if (creating) {
        await interaction.deferReply({
          ephemeral: true,
        });

        const member =
          await currentMember(
            interaction.guild,
            interaction.user.id
          );

        await access(
          interaction.guild,
          member,
          cfg.sourceChannelId
        );

        if (
          !cfg.canCreate(member)
        ) {
          throw error(
            'Sem permissão para criar este registro.',
            403
          );
        }

        return await cfg.handler(
          proxyInteraction(
            interaction,
            member,
            interaction.message
          ),
          client
        );
      }

      if (
        decision &&
        !bypassConfirmation(
          interaction.member
        )
      ) {
        if (
          !cfg.canDecide(
            interaction.member
          )
        ) {
          throw error(
            'Sem permissão para decidir.',
            403
          );
        }

        const data =
          cfg.getRequest(
            decision.reqId,
            interaction.message
          );

        if (!data) {
          throw error(
            'Pedido não encontrado.',
            409
          );
        }

        const token =
          makeToken(
            interaction.guild,
            interaction.member,
            interaction.message,
            decision.action,
            {
              ...clone(data),

              reqId:
                decision.reqId,
            }
          );

        const modal =
          new ModalBuilder()
            .setCustomId(
              `${modalPrefix}${token}`
            )
            .setTitle(
              decision.action === 'approve'
                ? 'Confirmar aprovação'
                : 'Confirmar recusa'
            );

        modal.addComponents(
          new ActionRowBuilder()
            .addComponents(
              new TextInputBuilder()
                .setCustomId('reason')
                .setLabel(
                  'Motivo (opcional)'
                )
                .setStyle(
                  TextInputStyle.Paragraph
                )
                .setMaxLength(1000)
                .setRequired(false)
            )
        );

        await interaction.showModal(
          modal
        );

        return true;
      }

      await interaction.deferReply({
        ephemeral: true,
      });

      const member =
        await currentMember(
          interaction.guild,
          interaction.user.id
        );

      let target =
        decision;

      let message =
        interaction.message;

      let reason = '';

      let token;

      if (confirm) {
        token =
          interaction.customId.slice(
            modalPrefix.length
          );

        const prepared =
          tokens.get(token);

        if (
          !prepared ||
          prepared.actorId !== member.id ||
          prepared.guildId !== interaction.guildId
        ) {
          throw error(
            'Confirmação inválida ou expirada.',
            409
          );
        }

        const channel =
          await access(
            interaction.guild,
            member,
            cfg.channelId
          );

        message =
          await channel.messages.fetch(
            prepared.msgId
          );

        target =
          prepared;

        reason =
          interaction.fields
            .getTextInputValue(
              'reason'
            );
      }

      await execute({
        client,

        guild:
          interaction.guild,

        member,

        message,

        ...target,

        reason,

        token,

        interaction,
      });

      return true;
    } catch (e) {
      const payload = {
        content: e.message,
        ephemeral: true,
      };

      if (
        interaction.deferred ||
        interaction.replied
      ) {
        await interaction
          .followUp(payload)
          .catch(() => {});
      } else {
        await interaction
          .reply(payload)
          .catch(() => {});
      }

      return true;
    }
  }

  async function site({
    client,
    guild,
    member,
    action,
    payload = {},
  }) {
    installApprovalAudit(client);

    member =
      await currentMember(
        guild,
        member.id
      );

    if (
      action === 'catalog'
    ) {
      let create = false;

      let decide = false;

      try {
        await access(
          guild,
          member,
          cfg.sourceChannelId
        );

        create =
          cfg.canCreate(member);
      } catch (e) {
        if (
          e.status !== 403
        ) {
          throw e;
        }
      }

      try {
        await access(
          guild,
          member,
          cfg.channelId
        );

        decide =
          cfg.canDecide(member);
      } catch (e) {
        if (
          e.status !== 403
        ) {
          throw e;
        }
      }

      if (
        !create &&
        !decide
      ) {
        throw error(
          'Sem acesso a este módulo.',
          403
        );
      }

      return {
        key: cfg.key,
        label: cfg.label,

        rights: {
          create,
          decide,
        },
      };
    }

    if (
      action === 'schema' ||
      action === 'create'
    ) {
      const source =
        await access(
          guild,
          member,
          cfg.sourceChannelId
        );

      if (
        !cfg.canCreate(member)
      ) {
        throw error(
          'Sem permissão para criar.',
          403
        );
      }

      const modal =
        cfg.modal(payload).toJSON();

      const fields =
        modal.components
          .map(
            row =>
              row.components[0]
          )
          .map(
            field => ({
              id:
                field.custom_id,

              label:
                field.label,

              value:
                field.value || '',

              required:
                Boolean(
                  field.required
                ),

              maxLength:
                field.max_length ||
                4000,

              paragraph:
                field.style === 2,
            })
          );

      if (
        action === 'schema'
      ) {
        return {
          fields,

          cities:
            Object.entries(
              cfg.cities || {}
            ).map(
              ([key, value]) => ({
                key,

                label:
                  value.label,
              })
            ),
        };
      }

      const values =
        payload.values;

      if (
        !values ||
        typeof values !== 'object' ||
        Array.isArray(values)
      ) {
        throw error(
          'Campos do formulário inválidos.'
        );
      }

      if (
        Object.keys(values).some(
          id =>
            !fields.some(
              field =>
                field.id === id
            )
        )
      ) {
        throw error(
          'O formulário contém campos desconhecidos.'
        );
      }

      for (
        const field
        of fields
      ) {
        if (
          values[field.id] !== undefined &&
          typeof values[field.id] !== 'string'
        ) {
          throw error(
            `${field.label}: envie um texto.`
          );
        }

        const value =
          String(
            values[field.id] || ''
          );

        if (
          field.required &&
          !value.trim()
        ) {
          throw error(
            `Preencha: ${field.label}.`
          );
        }

        if (
          value.length >
          field.maxLength
        ) {
          throw error(
            `${field.label}: máximo de ${field.maxLength} caracteres.`
          );
        }
      }

      const createLock =
        `create:${guild.id}:${member.id}`;

      if (
        locks.has(createLock)
      ) {
        throw error(
          'Já existe uma criação em processamento.',
          409
        );
      }

      locks.add(createLock);

      try {
        const before =
          new Set(
            (
              await messages(guild)
            ).map(
              message =>
                message.id
            )
          );

        const run =
          createTeamRequestSiteInteraction({
            guild,

            member,

            message: {
              channel: source,
              channelId: source.id,
            },

            customId:
              modal.custom_id,
          });

        run.isButton =
          () => false;

        run.isModalSubmit =
          () => true;

        run.fields = {
          getTextInputValue:
            id =>
              String(
                values[id] || ''
              ),
        };

        await handle(
          run,
          client
        );

        messageCache = null;

        const found =
          (
            await messages(guild)
          ).find(
            message =>
              !before.has(message.id) &&
              message.author.id === client.user.id &&
              buttons(message).some(
                button => {
                  const parsed =
                    decode(
                      String(
                        button.customId || ''
                      ),
                      message
                    );

                  return (
                    parsed &&
                    cfg.getRequest(
                      parsed.reqId,
                      message
                    )?.userId === member.id
                  );
                }
              )
          );

        if (!found) {
          throw error(
            typeof run.lastReply === 'string'
              ? run.lastReply
              : run.lastReply?.content ||
                'Criação não confirmada pelo bot.',
            409
          );
        }

        return {
          ok: true,
          url: found.url,
        };
      } finally {
        locks.delete(createLock);
      }
    }

    const channel =
      await access(
        guild,
        member,
        cfg.channelId
      );

    if (
      action === 'list'
    ) {
      if (
        !cfg.canCreate(member) &&
        !cfg.canDecide(member)
      ) {
        throw error(
          'Sem acesso a este módulo.',
          403
        );
      }

      const records = [];

      const receiptsByMessage = new Map(
        approvalReceipts(
          guild.id,
          cfg.key
        ).map(receipt => [
          String(receipt.msgId),
          receipt,
        ])
      );

      for (
        const message
        of await messages(guild)
      ) {
        if (
          message.author.id !==
          client.user.id
        ) {
          continue;
        }

        const receipt = receiptsByMessage.get(
          String(message.id)
        );

        const status = cfg.status(message);

        const decoded = buttons(message)
          .map(button =>
            decode(
              String(button.customId || ''),
              message
            )
          )
          .find(Boolean);

        const archivedData =
          receipt?.before?.data;

        const archivedId =
          archivedData?.reqId ||
          receipt?.reqId;

        const finalized = [
          'aprovado',
          'reprovado',
        ].includes(status);

        const parsed = decoded || (
          finalized &&
          receipt?.status === status &&
          archivedId
            ? {
                reqId: String(archivedId),
              }
            : null
        );

        if (!parsed) {
          continue;
        }

        const data =
          cfg.getRequest(
            parsed.reqId,
            message
          ) || (
            finalized &&
            receipt?.status === status
              ? archivedData
              : null
          );

        if (!data) {
          continue;
        }

        const rights = {
          approve: false,
          reject: false,
        };

        let canView =
          data.userId === member.id;

        if (cfg.canDecide(member)) {
          for (const decision of ['approve', 'reject']) {
            const check = await cfg.validate(
              {
                guild,
                member,
                user: member.user,
                message,
                siteReadOnly: finalized,
              },
              data,
              decision
            );

            if (check.allowed) {
              canView = true;
            }

            rights[decision] = Boolean(
              check.allowed &&
              status === 'pendente' &&
              buttons(message).some(
                button =>
                  !button.disabled &&
                  button.customId === customId(
                    decision,
                    parsed.reqId
                  )
              )
            );
          }
        }

        if (!canView) {
          continue;
        }

        const item = view(
          message,
          {
            ...data,
            reqId: parsed.reqId,
          },
          cfg.status(message)
        );

        item.rights = {
          ...rights,
          decide: rights.approve || rights.reject,
        };

        records.push(item);
      }

      return {
        records,

        history: (() => {
          const visibleMessageIds = new Set(
            records.map(record => String(record.msgId))
          );

          return approvalReceipts(
            guild.id,
            cfg.key
          )
            .filter(receipt =>
              visibleMessageIds.has(String(receipt.msgId))
            )
            .map(({
              before,
              after,
              ...item
            }) => item);
        })(),

        rights: {
          create:
            cfg.canCreate(member),

          decide:
            cfg.canDecide(member),
        },

        requiresConfirmation:
          !bypassConfirmation(member),

        recordLimit: 500,
      };
    }

    if (
      !/^\d{17,20}$/.test(
        String(
          payload.msgId || ''
        )
      )
    ) {
      throw error(
        'Mensagem inválida.'
      );
    }

    if (
      !['approve', 'reject'].includes(
        payload.decision
      )
    ) {
      throw error(
        'Decisão inválida.'
      );
    }

    const message =
      await channel.messages.fetch(
        payload.msgId
      );

    if (
      message.author.id !==
      client.user.id
    ) {
      throw error(
        'Mensagem não pertence ao bot.',
        403
      );
    }

    const parsed =
      buttons(message)
        .map(
          button =>
            decode(
              String(
                button.customId || ''
              ),
              message
            )
        )
        .find(Boolean);

    if (!parsed) {
      throw error(
        'Pedido finalizado.',
        409
      );
    }

    const data =
      await preflight(
        guild,
        member,
        message,
        payload.decision,
        parsed.reqId
      );

    if (
      action === 'prepare'
    ) {
      return {
        token:
          makeToken(
            guild,
            member,
            message,
            payload.decision,
            data
          ),

        requiresConfirmation:
          !bypassConfirmation(member),
      };
    }

    if (
      action !== 'decide'
    ) {
      throw error(
        'Ação desconhecida.'
      );
    }

    return execute({
      client,

      guild,

      member,

      message,

      action:
        payload.decision,

      reqId:
        parsed.reqId,

      reason:
        payload.reason,

      token:
        payload.token,
    });
  }

  return {
    handle,
    site,
  };
}