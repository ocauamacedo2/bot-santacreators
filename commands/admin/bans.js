import { EmbedBuilder, AuditLogEvent, PermissionFlagsBits } from 'discord.js';
import { cacheBanSnapshotForUnban } from '../../events/logs/ban.js';

const CENTRAL_LOG_BAN_ID = '1362540782829048170';
const CENTRAL_LOG_UNBAN_ID = '1553925418304671785';

const BANS_ALLOWED_ROLE_IDS = new Set([
  '1388976314253312100', // Coord.
  '1352407252216184833', // Resp. Líderes
]);

const UNBAN_ALL_ALLOWED_ROLE_IDS = new Set([
  '1262262852949905409', // Resp. Influ
  '1352408327983861844', // Resp. Creators
  '1262262852949905408', // Owner
]);

const UNBAN_ALL_ALLOWED_USER_IDS = new Set([
  '660311795327828008', // Macedo
]);

const BANS_EMBEDS_PER_MESSAGE = 4;
const AUDIT_MAX_PAGES = 25;
const runningUnbanAllGuilds = new Set();

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function truncateText(value, max = 1024) {
  const text = value == null ? '' : String(value);

  return text.length <= max
    ? text
    : `${text.slice(0, max - 3)}...`;
}

function formatDateTime(timestamp) {
  if (!timestamp) {
    return 'Não localizado';
  }

  return new Date(timestamp).toLocaleString(
    'pt-BR',
    {
      timeZone: 'America/Sao_Paulo',
    }
  );
}

function getGuildLogo(guild) {
  return (
    guild.iconURL({
      size: 256
    }) || null
  );
}

function memberHasAnyRole(
  member,
  allowedRoleIds
) {
  return Boolean(
    member?.roles?.cache &&
    [...allowedRoleIds].some(
      (roleId) =>
        member.roles.cache.has(
          roleId
        )
    )
  );
}

function parseStoredReason(
  rawReason
) {
  const text =
    String(
      rawReason || ''
    ).trim();

  const requesterId =
    text.match(
      /\[SOLICITANTE:(\d{17,20})\]/
    )?.[1] || null;

  const command =
    text.match(
      /\[COMANDO:([a-z0-9_-]+)\]/i
    )?.[1]?.toLowerCase() ||
    null;

  const reason =
    text
      .replace(
        /\[SOLICITANTE:\d{17,20}\]\s*/gi,
        ''
      )
      .replace(
        /\[COMANDO:[a-z0-9_-]+\]\s*/gi,
        ''
      )
      .trim() ||
    'Sem motivo especificado';

  return {
    requesterId,
    command,
    reason
  };
}

function formatExecutor(
  executor
) {
  if (!executor) {
    return (
      'Não localizado no ' +
      'Audit Log'
    );
  }

  return (
    `<@${executor.id}>\n` +
    `\`${executor.tag}\`\n` +
    `ID: \`${executor.id}\``
  );
}

function formatRequester(
  requesterId,
  executor
) {
  if (requesterId) {
    return (
      `<@${requesterId}>\n` +
      `ID: \`${requesterId}\``
    );
  }

  if (
    executor &&
    !executor.bot
  ) {
    return 'O próprio executor';
  }

  if (executor?.bot) {
    return (
      'Não informado pelo bot ' +
      'que realizou o banimento'
    );
  }

  return 'Não identificado';
}

function getExecutionOrigin(
  executor
) {
  if (!executor) {
    return (
      '❓ Não identificada\n' +
      'Audit Log não localizado'
    );
  }

  return executor.bot
    ? '🤖 Bot / Integração'
    : '👤 Ação manual';
}

async function sendEmbedToChannel(
  client,
  channelId,
  embed
) {
  try {
    const channel =
      await client.channels
        .fetch(channelId)
        .catch(() => null);

    if (
      !channel ||
      !channel.isTextBased()
    ) {
      return false;
    }

    await channel.send({
      embeds: [
        embed
      ],
      allowedMentions: {
        parse: []
      }
    });

    return true;
  } catch (error) {
    console.error(
      `[BANS] Erro ao enviar log para ${channelId}:`,
      error
    );

    return false;
  }
}

/*
 * Busca todos os bans atuais.
 *
 * Caso o servidor possua muitos bans,
 * continua buscando as próximas páginas.
 */
async function fetchAllGuildBans(
  guild
) {
  const allBans =
    new Map();

  let after;

  for (
    let pageNumber = 0;
    pageNumber < 100;
    pageNumber++
  ) {
    const page =
      await guild.bans.fetch({
        limit: 1000,
        cache: false,

        ...(after
          ? {
              after
            }
          : {})
      });

    for (
      const [
        userId,
        guildBan
      ]
      of page.entries()
    ) {
      allBans.set(
        userId,
        guildBan
      );
    }

    if (
      page.size < 1000
    ) {
      break;
    }

    const lastId =
      [...page.keys()].at(-1);

    if (
      !lastId ||
      lastId === after
    ) {
      break;
    }

    after =
      lastId;
  }

  return [
    ...allBans.values()
  ];
}

/*
 * Busca MemberBanAdd no Audit Log
 * e cria um mapa por usuário.
 *
 * Isso evita uma consulta completa
 * separada para cada usuário.
 */
async function fetchBanAuditMap(
  guild,
  userIds
) {
  const wantedIds =
    new Set(
      userIds
    );

  const entriesByUser =
    new Map();

  let before;
  let pagesRead = 0;
  let error = null;

  while (
    pagesRead <
      AUDIT_MAX_PAGES &&
    entriesByUser.size <
      wantedIds.size
  ) {
    try {
      const logs =
        await guild.fetchAuditLogs({
          type:
            AuditLogEvent.MemberBanAdd,

          limit: 100,

          ...(before
            ? {
                before
              }
            : {})
        });

      const entries = [
        ...logs.entries.values()
      ];

      pagesRead++;

      for (
        const entry
        of entries
      ) {
        const targetId =
          entry.target?.id ||
          entry.targetId;

        if (
          targetId &&
          wantedIds.has(
            targetId
          ) &&
          !entriesByUser.has(
            targetId
          )
        ) {
          entriesByUser.set(
            targetId,
            entry
          );
        }
      }

      if (
        entries.length < 100
      ) {
        break;
      }

      const oldest =
        entries.at(-1);

      if (!oldest?.id) {
        break;
      }

      before =
        oldest.id;
    } catch (auditError) {
      error =
        auditError;

      console.warn(
        '[BANS] Erro ao consultar Audit Log:',
        auditError
      );

      break;
    }
  }

  return {
    entries:
      entriesByUser,

    pagesRead,

    error
  };
}

function createBanEmbed({
  guild,
  guildBan,
  auditEntry,
  position,
  total
}) {
  const user =
    guildBan.user;

  const rawReason =
    auditEntry?.reason ||
    guildBan.reason ||
    'Sem motivo especificado';

  const parsed =
    parseStoredReason(
      rawReason
    );

  const executor =
    auditEntry?.executor ||
    null;

  const bannedAt =
    auditEntry
      ?.createdTimestamp ||
    null;

  return new EmbedBuilder()

    .setAuthor({
      name:
        'Santa Creators • Consulta de Banimentos',

      iconURL:
        getGuildLogo(
          guild
        ) || undefined
    })

    .setTitle(
      `🔨 BANIMENTO ${position}/${total}`
    )

    .setColor(
      0xED4245
    )

    .setThumbnail(
      user.displayAvatarURL({
        size: 256
      })
    )

    .addFields(
      {
        name:
          '👤 Usuário banido',

        value:
          `<@${user.id}>\n` +
          `\`${user.tag}\`\n` +
          `ID: \`${user.id}\``,

        inline: true
      },

      {
        name:
          '🧬 Tipo de conta',

        value:
          user.bot
            ? '🤖 Bot'
            : '👤 Usuário',

        inline: true
      },

      {
        name:
          '📌 Status',

        value:
          '🔴 **BANIDO**',

        inline: true
      },

      {
        name:
          '🛡️ Ban executado por',

        value:
          truncateText(
            formatExecutor(
              executor
            )
          ),

        inline: true
      },

      {
        name:
          '👮 Ban solicitado por',

        value:
          truncateText(
            formatRequester(
              parsed.requesterId,
              executor
            )
          ),

        inline: true
      },

      {
        name:
          '🧭 Origem da ação',

        value:
          getExecutionOrigin(
            executor
          ),

        inline: true
      },

      {
        name:
          '📅 Data / Hora',

        value:
          bannedAt
            ? (
                `${formatDateTime(
                  bannedAt
                )}\n` +
                `<t:${Math.floor(
                  bannedAt / 1000
                )}:R>`
              )
            : '⚠️ Não localizada',

        inline: true
      },

      {
        name:
          '🏙️ Local / Servidor',

        value:
          `**${guild.name}**\n` +
          `ID: \`${guild.id}\``,

        inline: true
      },

      {
        name:
          '🔎 Auditoria',

        value:
          auditEntry?.id
            ? `ID: \`${auditEntry.id}\``
            : '⚠️ Não localizada',

        inline: true
      },

      {
        name:
          '⌨️ Origem por comando',

        value:
          parsed.command
            ? `\`!${parsed.command}\``
            : 'Não identificada',

        inline: true
      },

      {
        name:
          '📄 Motivo',

        value:
          truncateText(
            parsed.reason,
            1024
          ),

        inline: false
      }
    )

    .setFooter({
      text:
        `Santa Creators • Ban ${position} de ${total} • Usuário ${user.id}`
    })

    .setTimestamp();
}

async function sendCommandLog({
  client,
  guild,
  message,
  channelId,
  title,
  color,
  description,
  fields = []
}) {
  const embed =
    new EmbedBuilder()

      .setAuthor({
        name:
          'Santa Creators • Auditoria de Comandos',

        iconURL:
          getGuildLogo(
            guild
          ) || undefined
      })

      .setTitle(
        title
      )

      .setColor(
        color
      )

      .setDescription(
        description
      )

      .setThumbnail(
        message.author
          .displayAvatarURL({
            size: 256
          })
      )

      .addFields(
        {
          name:
            '👮 Comando utilizado por',

          value:
            `<@${message.author.id}>\n` +
            `\`${message.author.tag}\`\n` +
            `ID: \`${message.author.id}\``,

          inline: true
        },

        {
          name:
            '🏙️ Servidor',

          value:
            `**${guild.name}**\n` +
            `ID: \`${guild.id}\``,

          inline: true
        },

        {
          name:
            '💬 Canal',

          value:
            `<#${message.channel.id}>\n` +
            `ID: \`${message.channel.id}\``,

          inline: true
        },

        ...fields
      )

      .setFooter({
        text:
          'Santa Creators • Sistema de Moderação'
      })

      .setTimestamp();

  await sendEmbedToChannel(
    client,
    channelId,
    embed
  );
}

// ==========================================================
// HANDLER
// ==========================================================

export async function bansHandleMessage(
  message,
  client
) {
  if (
    !message?.guild ||
    !message?.author ||
    message.author.bot
  ) {
    return false;
  }

  const command =
    message.content
      ?.trim()
      .match(
        /^!(bans|unbangeral)(?:\s|$)/i
      )?.[1]
      ?.toLowerCase();

  if (!command) {
    return false;
  }

  const guild =
    message.guild;

  const me =
    guild.members.me ||
    await guild.members
      .fetchMe()
      .catch(() => null);

  if (
    !me?.permissions.has(
      PermissionFlagsBits.BanMembers
    )
  ) {
    await message.reply({
      content:
        '❌ Eu preciso da permissão **Banir membros** para consultar ou remover banimentos.',

      allowedMentions: {
        repliedUser: false,
        parse: []
      }
    });

    return true;
  }

  // ========================================================
  // !bans
  // ========================================================

  if (
    command === 'bans'
  ) {
    if (
      !memberHasAnyRole(
        message.member,
        BANS_ALLOWED_ROLE_IDS
      )
    ) {
      await message.reply({
        content:
          '❌ Você não possui permissão para usar `!bans`.',

        allowedMentions: {
          repliedUser: false,
          parse: []
        }
      });

      return true;
    }

    const statusMessage =
      await message.reply({
        embeds: [
          new EmbedBuilder()

            .setColor(
              0xFEE75C
            )

            .setTitle(
              '🔎 Consultando banimentos...'
            )

            .setDescription(
              'Buscando a lista de bans e cruzando os dados disponíveis com o Audit Log.'
            )

            .setTimestamp()
        ],

        allowedMentions: {
          repliedUser: false,
          parse: []
        }
      });

    try {
      const bans =
        await fetchAllGuildBans(
          guild
        );

      if (
        bans.length === 0
      ) {
        await statusMessage.edit({
          embeds: [
            new EmbedBuilder()

              .setColor(
                0x57F287
              )

              .setTitle(
                '✅ Nenhum banimento ativo'
              )

              .setDescription(
                `O servidor **${guild.name}** não possui usuários banidos neste momento.`
              )

              .setThumbnail(
                getGuildLogo(
                  guild
                )
              )

              .setTimestamp()
          ],

          allowedMentions: {
            parse: []
          }
        });

        await sendCommandLog({
          client,
          guild,
          message,

          channelId:
            CENTRAL_LOG_BAN_ID,

          title:
            '📋 CONSULTA DE BANIMENTOS',

          color:
            0x5865F2,

          description:
            'O comando `!bans` foi utilizado e não havia banimentos ativos.',

          fields: [
            {
              name:
                '🔢 Total encontrado',

              value:
                '**0**',

              inline: true
            }
          ]
        });

        return true;
      }

      const canViewAuditLog =
        me.permissions.has(
          PermissionFlagsBits.ViewAuditLog
        );

      const auditResult =
        canViewAuditLog

          ? await fetchBanAuditMap(
              guild,

              bans.map(
                (guildBan) =>
                  guildBan.user.id
              )
            )

          : {
              entries:
                new Map(),

              pagesRead:
                0,

              error:
                null
            };

      const summary =
        new EmbedBuilder()

          .setAuthor({
            name:
              'Santa Creators • Central de Moderação',

            iconURL:
              getGuildLogo(
                guild
              ) || undefined
          })

          .setTitle(
            '📋 BANIMENTOS ATIVOS'
          )

          .setColor(
            0x5865F2
          )

          .setDescription(
            'Todos os banimentos atuais encontrados serão listados abaixo. O sistema envia em blocos para não ultrapassar os limites de mensagem do Discord.'
          )

          .addFields(
            {
              name:
                '🔢 Total',

              value:
                `**${bans.length}**`,

              inline: true
            },

            {
              name:
                '👮 Consulta por',

              value:
                `<@${message.author.id}>\n` +
                `ID: \`${message.author.id}\``,

              inline: true
            },

            {
              name:
                '🔎 Audit Log',

              value:
                canViewAuditLog

                  ? (
                      auditResult.error

                        ? '⚠️ Leitura parcial'

                        : `✅ ${auditResult.pagesRead} página(s) consultada(s)`
                    )

                  : '⚠️ Sem permissão para ver o Audit Log',

              inline: true
            },

            {
              name:
                'ℹ️ Dados antigos',

              value:
                'Se uma entrada antiga não estiver disponível no Audit Log, o usuário e o motivo continuam aparecendo, mas data ou executor podem ficar como não localizados.',

              inline: false
            }
          )

          .setThumbnail(
            getGuildLogo(
              guild
            )
          )

          .setFooter({
            text:
              'Santa Creators • Sistema de Moderação'
          })

          .setTimestamp();

      await statusMessage.edit({
        embeds: [
          summary
        ],

        allowedMentions: {
          parse: []
        }
      });

      const embeds =
        bans.map(
          (
            guildBan,
            index
          ) =>
            createBanEmbed({
              guild,

              guildBan,

              auditEntry:
                auditResult.entries.get(
                  guildBan.user.id
                ) || null,

              position:
                index + 1,

              total:
                bans.length
            })
        );

      for (
        let index = 0;

        index <
          embeds.length;

        index +=
          BANS_EMBEDS_PER_MESSAGE
      ) {
        await message.channel.send({
          embeds:
            embeds.slice(
              index,

              index +
                BANS_EMBEDS_PER_MESSAGE
            ),

          allowedMentions: {
            parse: []
          }
        });

        if (
          index +
            BANS_EMBEDS_PER_MESSAGE <
          embeds.length
        ) {
          await wait(
            350
          );
        }
      }

      await sendCommandLog({
        client,
        guild,
        message,

        channelId:
          CENTRAL_LOG_BAN_ID,

        title:
          '📋 CONSULTA DE BANIMENTOS',

        color:
          0x5865F2,

        description:
          'O comando `!bans` foi utilizado para consultar os banimentos ativos.',

        fields: [
          {
            name:
              '🔢 Total encontrado',

            value:
              `**${bans.length}**`,

            inline: true
          }
        ]
      });

      return true;
    } catch (error) {
      console.error(
        '[COMANDO !bans] Erro:',
        error
      );

      await statusMessage
        .edit({
          embeds: [
            new EmbedBuilder()

              .setColor(
                0xED4245
              )

              .setTitle(
                '❌ Erro ao listar banimentos'
              )

              .setDescription(
                'Não consegui concluir a consulta. O erro completo foi enviado ao console.'
              )

              .setTimestamp()
          ],

          allowedMentions: {
            parse: []
          }
        })
        .catch(() => {});

      return true;
    }
  }

  // ========================================================
  // !unbangeral
  // ========================================================

  const allowedUnbanAll =
    UNBAN_ALL_ALLOWED_USER_IDS.has(
      message.author.id
    ) ||

    memberHasAnyRole(
      message.member,
      UNBAN_ALL_ALLOWED_ROLE_IDS
    );

  if (
    !allowedUnbanAll
  ) {
    await message.reply({
      content:
        '❌ Você não possui permissão para usar `!unbangeral`.',

      allowedMentions: {
        repliedUser: false,
        parse: []
      }
    });

    return true;
  }

  if (
    runningUnbanAllGuilds.has(
      guild.id
    )
  ) {
    await message.reply({
      content:
        '⚠️ Já existe um `!unbangeral` em andamento neste servidor.',

      allowedMentions: {
        repliedUser: false,
        parse: []
      }
    });

    return true;
  }

  runningUnbanAllGuilds.add(
    guild.id
  );

  let progressMessage =
    null;

  try {
    const bans =
      await fetchAllGuildBans(
        guild
      );

    if (
      bans.length === 0
    ) {
      await message.reply({
        embeds: [
          new EmbedBuilder()

            .setColor(
              0x57F287
            )

            .setTitle(
              '✅ Nenhum banimento para remover'
            )

            .setDescription(
              `O servidor **${guild.name}** já está sem bans ativos.`
            )

            .setTimestamp()
        ],

        allowedMentions: {
          repliedUser: false,
          parse: []
        }
      });

      await sendCommandLog({
        client,
        guild,
        message,

        channelId:
          CENTRAL_LOG_UNBAN_ID,

        title:
          '🔓 REMOÇÃO GERAL DE BANS',

        color:
          0x57F287,

        description:
          'O comando `!unbangeral` foi utilizado, mas não havia bans ativos.',

        fields: [
          {
            name:
              '🔢 Total encontrado',

            value:
              '**0**',

            inline: true
          }
        ]
      });

      return true;
    }

    const canViewAuditLog =
      me.permissions.has(
        PermissionFlagsBits.ViewAuditLog
      );

    const auditResult =
      canViewAuditLog

        ? await fetchBanAuditMap(
            guild,

            bans.map(
              (guildBan) =>
                guildBan.user.id
            )
          )

        : {
            entries:
              new Map()
          };

    /*
     * Pré-carrega o histórico do ban anterior.
     *
     * Assim o evento guildBanRemove não precisa
     * fazer várias buscas pesadas usuário por usuário.
     */
    for (
      const guildBan
      of bans
    ) {
      cacheBanSnapshotForUnban({
        guild,

        guildBan,

        auditEntry:
          auditResult.entries.get(
            guildBan.user.id
          ) || null
      });
    }

    progressMessage =
      await message.reply({
        embeds: [
          new EmbedBuilder()

            .setAuthor({
              name:
                'Santa Creators • Central de Moderação',

              iconURL:
                getGuildLogo(
                  guild
                ) || undefined
            })

            .setTitle(
              '🔓 REMOÇÃO GERAL DE BANIMENTOS'
            )

            .setColor(
              0xFEE75C
            )

            .setDescription(
              'O processo foi iniciado. Cada desbanimento continuará gerando o log individual já existente.'
            )

            .addFields(
              {
                name:
                  '👮 Comando utilizado por',

                value:
                  `<@${message.author.id}>\n` +
                  `\`${message.author.tag}\`\n` +
                  `ID: \`${message.author.id}\``,

                inline: true
              },

              {
                name:
                  '🔢 Total encontrado',

                value:
                  `**${bans.length}**`,

                inline: true
              },

              {
                name:
                  '📊 Progresso',

                value:
                  `**0/${bans.length}**`,

                inline: true
              }
            )

            .setThumbnail(
              message.author
                .displayAvatarURL({
                  size: 256
                })
            )

            .setTimestamp()
        ],

        allowedMentions: {
          repliedUser: false,
          parse: []
        }
      });

    await sendCommandLog({
      client,
      guild,
      message,

      channelId:
        CENTRAL_LOG_UNBAN_ID,

      title:
        '🔓 REMOÇÃO GERAL DE BANS INICIADA',

      color:
        0xFEE75C,

      description:
        'O comando `!unbangeral` iniciou a remoção de todos os banimentos ativos.',

      fields: [
        {
          name:
            '🔢 Total encontrado',

          value:
            `**${bans.length}**`,

          inline: true
        }
      ]
    });

    let success = 0;
    let failed = 0;

    const failedUsers =
      [];

    for (
      let index = 0;

      index <
        bans.length;

      index++
    ) {
      const user =
        bans[index].user;

      try {
        await guild.bans.remove(
          user.id,

          `[SOLICITANTE:${message.author.id}] [COMANDO:unbangeral] Remoção geral de banimentos solicitada por ${message.author.tag} (${message.author.id})`
        );

        success++;
      } catch (error) {
        failed++;

        failedUsers.push(
          `${user.tag} (\`${user.id}\`)`
        );

        console.error(
          `[COMANDO !unbangeral] Falha ao desbanir ${user.tag} (${user.id}):`,
          error
        );
      }

      const processed =
        index + 1;

      if (
        processed ===
          bans.length ||

        processed % 5 === 0
      ) {
        await progressMessage
          .edit({
            embeds: [
              new EmbedBuilder()

                .setAuthor({
                  name:
                    'Santa Creators • Central de Moderação',

                  iconURL:
                    getGuildLogo(
                      guild
                    ) || undefined
                })

                .setTitle(
                  '🔓 REMOÇÃO GERAL DE BANIMENTOS'
                )

                .setColor(
                  0xFEE75C
                )

                .addFields(
                  {
                    name:
                      '👮 Comando utilizado por',

                    value:
                      `<@${message.author.id}>\n` +
                      `ID: \`${message.author.id}\``,

                    inline: true
                  },

                  {
                    name:
                      '📊 Progresso',

                    value:
                      `**${processed}/${bans.length}**`,

                    inline: true
                  },

                  {
                    name:
                      '✅ Desbanidos',

                    value:
                      `**${success}**`,

                    inline: true
                  },

                  {
                    name:
                      '❌ Falhas',

                    value:
                      `**${failed}**`,

                    inline: true
                  }
                )

                .setTimestamp()
            ],

            allowedMentions: {
              parse: []
            }
          })
          .catch(() => {});
      }

      /*
       * Evita uma rajada de dezenas
       * de requests ao Discord.
       *
       * Também facilita a criação
       * da entrada de Audit Log.
       */
      if (
        processed <
        bans.length
      ) {
        await wait(
          1200
        );
      }
    }

    const failedText =
      failedUsers.length > 0

        ? truncateText(
            failedUsers
              .slice(
                0,
                10
              )
              .map(
                (item) =>
                  `• ${item}`
              )
              .join(
                '\n'
              ),

            1024
          )

        : 'Nenhuma falha';

    const finalEmbed =
      new EmbedBuilder()

        .setAuthor({
          name:
            'Santa Creators • Central de Moderação',

          iconURL:
            getGuildLogo(
              guild
            ) || undefined
        })

        .setTitle(
          failed === 0

            ? '✅ REMOÇÃO GERAL CONCLUÍDA'

            : '⚠️ REMOÇÃO GERAL CONCLUÍDA COM FALHAS'
        )

        .setColor(
          failed === 0
            ? 0x57F287
            : 0xFEE75C
        )

        .setDescription(
          failed === 0

            ? 'Todos os banimentos encontrados foram removidos.'

            : 'O processo terminou, mas alguns desbanimentos falharam.'
        )

        .addFields(
          {
            name:
              '👮 Comando utilizado por',

            value:
              `<@${message.author.id}>\n` +
              `\`${message.author.tag}\`\n` +
              `ID: \`${message.author.id}\``,

            inline: true
          },

          {
            name:
              '🔢 Total processado',

            value:
              `**${bans.length}**`,

            inline: true
          },

          {
            name:
              '✅ Desbanidos',

            value:
              `**${success}**`,

            inline: true
          },

          {
            name:
              '❌ Falhas',

            value:
              `**${failed}**`,

            inline: true
          },

          {
            name:
              '📄 Falhas registradas',

            value:
              failedText,

            inline: false
          }
        )

        .setThumbnail(
          message.author
            .displayAvatarURL({
              size: 256
            })
        )

        .setFooter({
          text:
            'Santa Creators • Sistema de Moderação'
        })

        .setTimestamp();

    await progressMessage.edit({
      embeds: [
        finalEmbed
      ],

      allowedMentions: {
        parse: []
      }
    });

    await sendCommandLog({
      client,
      guild,
      message,

      channelId:
        CENTRAL_LOG_UNBAN_ID,

      title:
        failed === 0

          ? '✅ REMOÇÃO GERAL DE BANS CONCLUÍDA'

          : '⚠️ REMOÇÃO GERAL DE BANS CONCLUÍDA COM FALHAS',

      color:
        failed === 0
          ? 0x57F287
          : 0xFEE75C,

      description:
        'O comando `!unbangeral` terminou o processamento.',

      fields: [
        {
          name:
            '🔢 Total processado',

          value:
            `**${bans.length}**`,

          inline: true
        },

        {
          name:
            '✅ Desbanidos',

          value:
            `**${success}**`,

          inline: true
        },

        {
          name:
            '❌ Falhas',

          value:
            `**${failed}**`,

          inline: true
        },

        {
          name:
            '📄 Falhas registradas',

          value:
            failedText,

          inline: false
        }
      ]
    });

    return true;
  } catch (error) {
    console.error(
      '[COMANDO !unbangeral] Erro geral:',
      error
    );

    const errorEmbed =
      new EmbedBuilder()

        .setColor(
          0xED4245
        )

        .setTitle(
          '❌ Falha na remoção geral de banimentos'
        )

        .setDescription(
          'O processo encontrou um erro. O erro completo foi enviado ao console.'
        )

        .setTimestamp();

    if (
      progressMessage
    ) {
      await progressMessage
        .edit({
          embeds: [
            errorEmbed
          ],

          allowedMentions: {
            parse: []
          }
        })
        .catch(() => {});
    } else {
      await message
        .reply({
          embeds: [
            errorEmbed
          ],

          allowedMentions: {
            repliedUser: false,
            parse: []
          }
        })
        .catch(() => {});
    }

    await sendCommandLog({
      client,
      guild,
      message,

      channelId:
        CENTRAL_LOG_UNBAN_ID,

      title:
        '❌ FALHA NA REMOÇÃO GERAL DE BANS',

      color:
        0xED4245,

      description:
        'O comando `!unbangeral` encontrou um erro antes de concluir.',

      fields: [
        {
          name:
            '⚠️ Erro',

          value:
            truncateText(
              error?.message ||
              String(
                error
              ),

              1024
            ),

          inline: false
        }
      ]
    }).catch(() => {});

    return true;
  } finally {
    runningUnbanAllGuilds.delete(
      guild.id
    );
  }
}