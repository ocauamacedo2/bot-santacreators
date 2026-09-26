import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  OverwriteType,
  PermissionsBitField,
} from 'discord.js';

const RESTORE_PREFIX = 'restaurar_ticket:';
const BACKFILL_LIMIT = 1000;
const REPLAY_DELAY_MS = 550;

// =========================================================
// ♻️ LOGS ANTIGOS PRIORITÁRIOS PARA RESTAURAÇÃO
// =========================================================
//
// Estes registros são buscados DIRETAMENTE pelo ID
// da mensagem do log.
//
// Isso significa que eles não dependem:
// - de estarem entre os últimos 1000 logs;
// - da paginação normal do backfill;
// - de o sistema encontrar o ticket por acaso.
//
// logMessageId = ID DA MENSAGEM no canal de transcripts.
// ticketId     = ID DO CANAL ORIGINAL que foi apagado.
//
// Para adicionar outros tickets antigos no futuro,
// basta adicionar outro objeto neste array.
// =========================================================

const PRIORITY_OLD_RESTORE_LOGS = [
  {
    logMessageId: '1553421533005750417',
    ticketId: '1553211623458738227'
  }
];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function splitText(value, max = 1750) {
  let text = String(value ?? '').trim();

  if (!text) {
    return ['[Mensagem sem conteúdo]'];
  }

  const parts = [];

  while (text.length > max) {
    let at = text.lastIndexOf('\n', max);

    if (at < max * 0.55) {
      at = text.lastIndexOf(' ', max);
    }

    if (at < max * 0.55) {
      at = max;
    }

    parts.push(
      text
        .slice(0, at)
        .trim()
    );

    text =
      text
        .slice(at)
        .trimStart();
  }

  if (text) {
    parts.push(text);
  }

  return parts;
}

function cleanWebhookName(value) {
  return String(
    value ||
      'Usuário'
  )
    .replace(
      /discord/gi,
      'disc'
    )
    .replace(
      /clyde/gi,
      'usuario'
    )
    .replace(
      /[\r\n\t]/g,
      ' '
    )
    .trim()
    .slice(
      0,
      80
    ) ||
    'Usuário';
}

function stripTranscriptHtml(html) {
  return String(
    html ||
      ''
  )
    .replace(
      /<br\s*\/?\s*>/gi,
      '\n'
    )
    .replace(
      /<a\s+[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gis,
      '$2 ($1)'
    )
    .replace(
      /<img\s+[^>]*alt="([^"]*)"[^>]*>/gis,
      '$1'
    )
    .replace(
      /<video\s+[^>]*src="([^"]+)"[^>]*>[\s\S]*?<\/video>/gis,
      '🎥 $1'
    )
    .replace(
      /<button[^>]*>(.*?)<\/button>/gis,
      '[$1]'
    )
    .replace(
      /<div[^>]*class="discord-select"[^>]*>(.*?)<\/div>/gis,
      '[$1]'
    )
    .replace(
      /<strong>(.*?)<\/strong>/gis,
      '**$1**'
    )
    .replace(
      /<em>(.*?)<\/em>/gis,
      '*$1*'
    )
    .replace(
      /<u>(.*?)<\/u>/gis,
      '__$1__'
    )
    .replace(
      /<code>(.*?)<\/code>/gis,
      '`$1`'
    )
    .replace(
      /<[^>]+>/g,
      ''
    )
    .replace(
      /&lt;/g,
      '<'
    )
    .replace(
      /&gt;/g,
      '>'
    )
    .replace(
      /&quot;/g,
      '"'
    )
    .replace(
      /&#039;/g,
      "'"
    )
    .replace(
      /&amp;/g,
      '&'
    )
    .replace(
      /\n{3,}/g,
      '\n\n'
    )
    .trim();
}

function extractArchiveLinks(html) {
  const links = [];

  const regex =
    /\b(?:href|src)="(https?:\/\/[^"\s]+)"/gi;

  let match;

  while (
    (
      match =
        regex.exec(
          String(
            html ||
              ''
          )
        )
    )
  ) {
    const url =
      match[1];

    if (
      !links.includes(
        url
      )
    ) {
      links.push(
        url
      );
    }
  }

  return links;
}

function restoredMessageText(item) {
  const body =
    stripTranscriptHtml(
      item?.conteudo ||
        ''
    );

  const links =
    extractArchiveLinks(
      item?.conteudo ||
        ''
    )
      .filter(
        url =>
          !body.includes(
            url
          )
      )
      .slice(
        0,
        12
      );

  return [
    body ||
      '[Mensagem sem conteúdo]',

    links.length
      ? links
          .map(
            (
              url,
              index
            ) =>
              `📎 Arquivo/registro ${index + 1}: ${url}`
          )
          .join(
            '\n'
          )
      : '',
  ]
    .filter(
      Boolean
    )
    .join(
      '\n\n'
    );
}

function buildTicketButtons() {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(
          'assumir_ticket'
        )
        .setLabel(
          '🎫 Assumir Ticket'
        )
        .setStyle(
          ButtonStyle.Secondary
        ),

      new ButtonBuilder()
        .setCustomId(
          'assumir_resp'
        )
        .setLabel(
          '👑 Assumir Resp'
        )
        .setStyle(
          ButtonStyle.Danger
        ),

      new ButtonBuilder()
        .setCustomId(
          'fechar_ticket'
        )
        .setLabel(
          '❌ Fechar Ticket'
        )
        .setStyle(
          ButtonStyle.Secondary
        ),

      new ButtonBuilder()
        .setCustomId(
          'adicionar_membro'
        )
        .setLabel(
          '➕ Adicionar Usuário'
        )
        .setStyle(
          ButtonStyle.Success
        ),

      new ButtonBuilder()
        .setCustomId(
          'remover_membro'
        )
        .setLabel(
          '➖ Remover Usuário'
        )
        .setStyle(
          ButtonStyle.Danger
        )
    );
}

function buildRestoreButton(
  ticketId
) {
  return new ButtonBuilder()
    .setCustomId(
      `${RESTORE_PREFIX}${ticketId}`
    )
    .setLabel(
      '♻️ Restaurar Ticket'
    )
    .setStyle(
      ButtonStyle.Success
    );
}

function getField(
  embed,
  text
) {
  return (
    embed?.fields ||
    embed?.data?.fields ||
    []
  ).find(
    item =>
      String(
        item.name ||
          ''
      )
        .toLowerCase()
        .includes(
          text.toLowerCase()
        )
  );
}

function mentionId(
  value
) {
  return String(
    value ||
      ''
  )
    .match(
      /<@!?(\d{17,20})>/
    )
    ?.[1] ||
    null;
}

function getHintsFromLog(
  message,
  ticketId
) {
  const embed =
    message?.embeds?.[0];

  return {
    ticketId,

    tipo:
      String(
        getField(
          embed,
          'tipo de ticket'
        )?.value ||
          ''
      )
        .replace(
          /`/g,
          ''
        )
        .trim()
        .toLowerCase() ||
      null,

    openerId:
      mentionId(
        getField(
          embed,
          'ticket aberto por'
        )?.value
      ),

    assumedById:
      mentionId(
        getField(
          embed,
          'creator que atendeu'
        )?.value
      ),
  };
}

function getTicketIdFromLog(
  message
) {
  for (
    const row of
    message.components ||
    []
  ) {
    for (
      const component of
      row.components ||
      []
    ) {
      const match =
        String(
          component.url ||
            ''
        )
          .match(
            /\/transcript\/(\d{17,20})/i
          );

      if (
        match?.[1]
      ) {
        return match[1];
      }
    }
  }

  const idField =
    getField(
      message.embeds?.[0],
      'canal do ticket'
    ) ||
    getField(
      message.embeds?.[0],
      'canal antigo'
    );

  return String(
    idField?.value ||
      ''
  )
    .match(
      /(\d{17,20})/
    )
    ?.[1] ||
    null;
}

function hasRestoreButton(
  message,
  ticketId
) {
  return (
    message.components ||
    []
  ).some(
    row =>
      (
        row.components ||
        []
      ).some(
        component =>
          component.customId ===
          `${RESTORE_PREFIX}${ticketId}`
      )
  );
}

function addRestoreButtonToRows(
  message,
  ticketId
) {
  const rows =
    (
      message.components ||
      []
    ).map(
      row =>
        ActionRowBuilder.from(
          row
        )
    );

  if (
    hasRestoreButton(
      message,
      ticketId
    )
  ) {
    return rows;
  }

  /*
   * Primeiro tenta colocar exatamente
   * na mesma linha do botão Abrir Transcript.
   *
   * Dessa forma os tickets antigos ficam com:
   *
   * [Abrir Transcript] [Restaurar Ticket]
   */
  const transcriptRowIndex =
    (
      message.components ||
      []
    ).findIndex(
      row =>
        (
          row.components ||
          []
        ).length < 5 &&
        (
          row.components ||
          []
        ).some(
          component =>
            String(
              component.url ||
                ''
            ).includes(
              '/transcript/'
            )
        )
    );

  if (
    transcriptRowIndex >=
    0
  ) {
    rows[
      transcriptRowIndex
    ].addComponents(
      buildRestoreButton(
        ticketId
      )
    );

    return rows;
  }

  /*
   * Caso não exista uma linha de transcript,
   * tenta aproveitar qualquer ActionRow
   * que ainda tenha espaço.
   */
  const availableRowIndex =
    (
      message.components ||
      []
    ).findIndex(
      row =>
        (
          row.components ||
          []
        ).length < 5
    );

  if (
    availableRowIndex >=
    0
  ) {
    rows[
      availableRowIndex
    ].addComponents(
      buildRestoreButton(
        ticketId
      )
    );

    return rows;
  }

  /*
   * Último fallback:
   * cria uma nova linha.
   */
  if (
    rows.length <
    5
  ) {
    rows.push(
      new ActionRowBuilder()
        .addComponents(
          buildRestoreButton(
            ticketId
          )
        )
    );
  }

  return rows;
}

function addRestoredChannelButtonToRows(
  message,
  restoredChannelUrl
) {
  const rows =
    (
      message.components ||
      []
    ).map(
      row =>
        ActionRowBuilder.from(
          row
        )
    );

  const alreadyExists =
    (
      message.components ||
      []
    ).some(
      row =>
        (
          row.components ||
          []
        ).some(
          component =>
            String(
              component.url ||
                ''
            ) ===
            restoredChannelUrl
        )
    );

  if (
    alreadyExists
  ) {
    return rows;
  }

  const restoredButton =
    new ButtonBuilder()
      .setStyle(
        ButtonStyle.Link
      )
      .setLabel(
        '📎 Abrir canal restaurado'
      )
      .setURL(
        restoredChannelUrl
      );

  /*
   * Se já existe o botão Restaurar Ticket,
   * coloca o botão do canal restaurado
   * nessa mesma linha.
   */
  const restoreRowIndex =
    (
      message.components ||
      []
    ).findIndex(
      row =>
        (
          row.components ||
          []
        ).length < 5 &&
        (
          row.components ||
          []
        ).some(
          component =>
            String(
              component.customId ||
                ''
            ).startsWith(
              RESTORE_PREFIX
            )
        )
    );

  if (
    restoreRowIndex >=
    0
  ) {
    rows[
      restoreRowIndex
    ].addComponents(
      restoredButton
    );

    return rows;
  }

  const transcriptRowIndex =
    (
      message.components ||
      []
    ).findIndex(
      row =>
        (
          row.components ||
          []
        ).length < 5 &&
        (
          row.components ||
          []
        ).some(
          component =>
            String(
              component.url ||
                ''
            ).includes(
              '/transcript/'
            )
        )
    );

  if (
    transcriptRowIndex >=
    0
  ) {
    rows[
      transcriptRowIndex
    ].addComponents(
      restoredButton
    );

    return rows;
  }

  const availableRowIndex =
    (
      message.components ||
      []
    ).findIndex(
      row =>
        (
          row.components ||
          []
        ).length < 5
    );

  if (
    availableRowIndex >=
    0
  ) {
    rows[
      availableRowIndex
    ].addComponents(
      restoredButton
    );

    return rows;
  }

  if (
    rows.length <
    5
  ) {
    rows.push(
      new ActionRowBuilder()
        .addComponents(
          restoredButton
        )
    );
  }

  return rows;
}

function serializeOverwrites(
  channel
) {
  return channel
    .permissionOverwrites
    .cache
    .map(
      ow => ({
        id:
          ow.id,

        allow:
          ow.allow
            .bitfield
            .toString(),

        deny:
          ow.deny
            .bitfield
            .toString(),

        type:
          ow.type,
      })
    );
}

async function getBestTranscript(
  Transcript,
  ticketId
) {
  const docs =
    await Transcript
      .collection
      .find({
        canalId:
          String(
            ticketId
          )
      })
      .sort({
        _id:
          -1
      })
      .limit(
        10
      )
      .toArray();

  if (
    !docs.length
  ) {
    return null;
  }

  /*
   * Se houver mais de um transcript com o mesmo canal,
   * preferimos:
   *
   * 1. aquele que possui restoreMeta;
   * 2. aquele com maior quantidade de mensagens.
   */
  return docs
    .sort(
      (
        a,
        b
      ) => {
        const score =
          doc =>
            (
              doc
                ?.restoreMeta
                ?.version
                ? 1_000_000
                : 0
            ) +
            (
              Array.isArray(
                doc?.mensagens
              )
                ? doc.mensagens.length *
                  100
                : 0
            );

        return (
          score(
            b
          ) -
          score(
            a
          )
        );
      }
    )[0];
}

function fallbackPermissions(
  category,
  openerId
) {
  /*
   * Para transcript antigo sem restoreMeta,
   * herdamos as permissões atuais da categoria.
   */
  const overwrites =
    category
      .permissionOverwrites
      .cache
      .map(
        ow => ({
          id:
            ow.id,

          allow:
            ow.allow
              .bitfield,

          deny:
            ow.deny
              .bitfield,

          type:
            ow.type,
        })
      );

  /*
   * Garante que quem abriu tenha acesso.
   */
  if (
    openerId &&
    !overwrites.some(
      ow =>
        String(
          ow.id
        ) ===
        String(
          openerId
        )
    )
  ) {
    overwrites.push({
      id:
        openerId,

      type:
        OverwriteType.Member,

      allow:
        new PermissionsBitField([
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.AttachFiles,
        ]).bitfield,

      deny:
        0n,
    });
  }

  return overwrites;
}

async function sanitizeOverwrites(
  guild,
  values,
  openerId,
  category
) {
  const overwrites =
    [];

  for (
    const value of
    values ||
    []
  ) {
    const id =
      String(
        value.id ||
          ''
      );

    if (
      !id
    ) {
      continue;
    }

    /*
     * Se era permissão de cargo,
     * verifica se o cargo ainda existe.
     */
    if (
      Number(
        value.type
      ) ===
      Number(
        OverwriteType.Role
      )
    ) {
      if (
        !guild
          .roles
          .cache
          .has(
            id
          )
      ) {
        continue;
      }
    } else {
      /*
       * Se era permissão individual,
       * verifica se a pessoa ainda está
       * no servidor.
       */
      const member =
        guild
          .members
          .cache
          .get(
            id
          ) ||
        await guild
          .members
          .fetch(
            id
          )
          .catch(
            () =>
              null
          );

      if (
        !member
      ) {
        continue;
      }
    }

    overwrites.push({
      id,

      type:
        Number(
          value.type
        ),

      allow:
        BigInt(
          String(
            value.allow ??
              0
          )
        ),

      deny:
        BigInt(
          String(
            value.deny ??
              0
          )
        ),
    });
  }

  /*
   * Caso todas as permissões salvas
   * tenham deixado de existir,
   * usa as da categoria.
   */
  return overwrites.length
    ? overwrites
    : fallbackPermissions(
        category,
        openerId
      );
}

export function createTicketRestoreSystem({
  client,
  Transcript,
  transcriptLogChannelId,
  transcriptBaseUrl,
  allowedUserIds = [],
  allowedRoleIds = [],
  typeCategoryMap = {},
  legacyParentOverrides = {},
}) {
  const allowedUsers =
    new Set(
      allowedUserIds
        .map(
          String
        )
    );

  const allowedRoles =
    new Set(
      allowedRoleIds
        .map(
          String
        )
    );

  const oldTicketParentOverrides =
    new Map(
      Object
        .entries(
          legacyParentOverrides
        )
        .map(
          (
            [
              ticketId,
              categoryId
            ]
          ) => [
            String(
              ticketId
            ),
            String(
              categoryId
            )
          ]
        )
    );

  function canRestore(
    interaction
  ) {
    if (
      allowedUsers.has(
        String(
          interaction
            .user
            ?.id
        )
      )
    ) {
      return true;
    }

    return (
      interaction
        .member
        ?.roles
        ?.cache
        ?.some(
          role =>
            allowedRoles.has(
              String(
                role.id
              )
            )
        ) ||
      false
    );
  }

  async function saveRestoreMeta({
    transcriptDocument,
    channel,
    tipoTicket,
    openerId,
    assumedById,
  }) {
    if (
      !transcriptDocument
        ?._id
    ) {
      return false;
    }

    /*
     * Estes são os dados leves
     * necessários para recriar o canal.
     *
     * Não copiamos as mensagens novamente.
     * Elas continuam no transcript normal.
     */
    const restoreMeta = {
      version:
        2,

      originalParentId:
        channel.parentId ||
        null,

      originalName:
        channel.name,

      originalTopic:
        channel.topic ||
        '',

      originalPosition:
        channel.rawPosition ??
        channel.position ??
        0,

      originalNsfw:
        Boolean(
          channel.nsfw
        ),

      originalRateLimitPerUser:
        channel.rateLimitPerUser ||
        0,

      permissionOverwrites:
        serializeOverwrites(
          channel
        ),

      tipo:
        String(
          tipoTicket ||
            ''
        )
          .toLowerCase(),

      openerId:
        openerId ||
        null,

      assumedById:
        assumedById ||
        null,
    };

    /*
     * Usamos collection diretamente.
     *
     * Isso permite guardar restoreMeta
     * sem precisar alterar seu schema
     * principal do Transcript.
     */
    await Transcript
      .collection
      .updateOne(
        {
          _id:
            transcriptDocument._id
        },
        {
          $set: {
            restoreMeta
          }
        }
      );

    return true;
  }
  // =========================================================
  // ♻️ GARANTE BOTÃO EM LOGS ANTIGOS PRIORITÁRIOS
  // =========================================================
  //
  // Primeiro tenta editar diretamente a mensagem antiga.
  //
  // Se o Discord não permitir editar porque:
  // - foi enviada por outro bot;
  // - foi enviada por webhook;
  // - não pertence à instância atual;
  // - deixou de ser editável;
  //
  // o sistema cria automaticamente um controle logo
  // abaixo daquele log.
  //
  // Assim o ticket continua podendo ser restaurado.
  // =========================================================

  async function ensurePriorityOldRestoreButtons(channel) {
    for (
      const target of
      PRIORITY_OLD_RESTORE_LOGS
    ) {
      // =====================================================
      // BUSCA EXATAMENTE A MENSAGEM DO LOG
      // =====================================================

      const logMessage =
        await channel.messages
          .fetch(
            target.logMessageId
          )
          .catch(error => {
            console.error(
              `[TICKET RESTORE] Não consegui buscar o log antigo ${target.logMessageId}:`,
              error?.message || error
            );

            return null;
          });

      if (!logMessage) {
        console.warn(
          `[TICKET RESTORE] Log prioritário ${target.logMessageId} não encontrado.`
        );

        continue;
      }

      // =====================================================
      // JÁ TEM BOTÃO?
      // =====================================================

      if (
        hasRestoreButton(
          logMessage,
          target.ticketId
        )
      ) {
        console.log(
          `[TICKET RESTORE] O log ${target.logMessageId} já possui botão para o ticket ${target.ticketId}.`
        );

        continue;
      }

      // =====================================================
      // CAMINHO IDEAL
      //
      // Edita a própria mensagem antiga e coloca:
      //
      // [📂 Abrir Transcript] [♻️ Restaurar Ticket]
      // =====================================================

      if (
        logMessage.author?.id ===
          client.user?.id &&
        logMessage.editable
      ) {
        const rows =
          addRestoreButtonToRows(
            logMessage,
            target.ticketId
          );

        const edited =
          await logMessage
            .edit({
              components:
                rows
            })
            .catch(error => {
              console.error(
                `[TICKET RESTORE] Falha ao editar diretamente o log ${target.logMessageId}:`,
                error?.message || error
              );

              return null;
            });

        if (edited) {
          console.log(
            `[TICKET RESTORE] ✅ Botão adicionado diretamente ao log ${target.logMessageId} do ticket ${target.ticketId}.`
          );

          continue;
        }
      }

      // =====================================================
      // FALLBACK PROFISSIONAL
      //
      // A mensagem antiga não pode ser editada.
      //
      // Nesse caso criamos uma mensagem ligada ao log,
      // logo abaixo dele, com o botão verdadeiro.
      // =====================================================

      console.warn(
        `[TICKET RESTORE] O log ${target.logMessageId} não pode ser editado diretamente. Criando controle alternativo...`
      );

      // =====================================================
      // PROCURA O TRANSCRIPT
      // =====================================================

      const transcript =
        await getBestTranscript(
          Transcript,
          target.ticketId
        )
          .catch(
            () =>
              null
          );

      // =====================================================
      // EVITA CRIAR MENSAGEM DUPLICADA A CADA RESTART
      // =====================================================

      const previousControlId =
        transcript
          ?.restoreMeta
          ?.restoreControlMessageId ||
        null;

      if (
        previousControlId
      ) {
        const previousControl =
          await channel.messages
            .fetch(
              previousControlId
            )
            .catch(
              () =>
                null
            );

        if (
          previousControl &&
          hasRestoreButton(
            previousControl,
            target.ticketId
          )
        ) {
          console.log(
            `[TICKET RESTORE] Controle alternativo já existe para o ticket ${target.ticketId}.`
          );

          continue;
        }
      }

      // =====================================================
      // EMBED DO CONTROLE
      // =====================================================

      const controlEmbed =
        new EmbedBuilder()
          .setColor(
            '#ff009a'
          )
          .setTitle(
            '♻️ Restauração disponível'
          )
          .setDescription(
            `Este controle pertence ao ticket antigo \`${target.ticketId}\`.\n` +
            `O transcript original acima será mantido e o canal será recriado a partir dele.`
          )
          .addFields(
            {
              name:
                '🆔 Ticket original',

              value:
                `\`${target.ticketId}\``,

              inline:
                true
            },

            {
              name:
                '📄 Log original',

              value:
                `\`${target.logMessageId}\``,

              inline:
                true
            }
          )
          .setFooter({
            text:
              'SantaCreators • Recuperação de Ticket'
          });

      // =====================================================
      // CRIA O BOTÃO LOGO ABAIXO DO LOG ANTIGO
      // =====================================================

      const controlMessage =
        await channel
          .send({
            reply: {
              messageReference:
                logMessage.id,

              failIfNotExists:
                false
            },

            embeds: [
              controlEmbed
            ],

            components: [
              new ActionRowBuilder()
                .addComponents(
                  buildRestoreButton(
                    target.ticketId
                  )
                )
            ],

            allowedMentions: {
              parse: [],
              repliedUser: false
            }
          })
          .catch(error => {
            console.error(
              `[TICKET RESTORE] Falha ao criar controle alternativo para ${target.ticketId}:`,
              error?.message || error
            );

            return null;
          });

      if (
        !controlMessage
      ) {
        continue;
      }

      // =====================================================
      // MEMORIZA A MENSAGEM DE CONTROLE
      //
      // Assim um restart NÃO cria outra mensagem igual.
      // =====================================================

      await Transcript.collection
        .updateMany(
          {
            canalId:
              String(
                target.ticketId
              )
          },

          {
            $set: {
              'restoreMeta.restoreControlMessageId':
                controlMessage.id,

              'restoreMeta.restoreControlLogMessageId':
                logMessage.id
            }
          }
        )
        .catch(
          error => {
            console.error(
              '[TICKET RESTORE] Falha ao registrar mensagem de controle:',
              error?.message || error
            );
          }
        );

      console.log(
        `[TICKET RESTORE] ✅ Controle alternativo criado para o ticket ${target.ticketId}: ${controlMessage.id}`
      );
    }
  }
  async function backfillRestoreButtons(
    limit =
      BACKFILL_LIMIT
  ) {
    const channel =
      await client
        .channels
        .fetch(
          transcriptLogChannelId
        )
        .catch(
          () =>
            null
        );

    if (
      !channel
        ?.isTextBased
        ?.()
    ) {
      console.error(
        `[TICKET RESTORE] Canal de transcripts ${transcriptLogChannelId} não encontrado.`
      );

      return;
    }

    // =====================================================
    // PRIORIDADE ABSOLUTA
    //
    // Antes de analisar os últimos 1000 logs,
    // busca DIRETAMENTE os logs antigos que foram
    // adicionados em PRIORITY_OLD_RESTORE_LOGS.
    //
    // Portanto o ticket específico que você precisa
    // NÃO depende mais da paginação normal.
    // =====================================================

    await ensurePriorityOldRestoreButtons(
      channel
    );

    // =====================================================
    // BACKFILL NORMAL
    //
    // Depois continua analisando os demais logs antigos.
    // =====================================================

    let before;

    let scanned =
      0;

    let edited =
      0;

    while (
      scanned <
      limit
    ) {
      const batch =
        await channel
          .messages
          .fetch({
            limit:
              Math.min(
                100,
                limit -
                  scanned
              ),

            before,
          })
          .catch(
            () =>
              null
          );

      if (
        !batch
          ?.size
      ) {
        break;
      }

      const ordered =
        [
          ...batch
            .values()
        ]
          .sort(
            (
              a,
              b
            ) =>
              b.createdTimestamp -
              a.createdTimestamp
          );

      for (
        const message of
        ordered
      ) {
        scanned++;

        before =
          message.id;

        /*
         * Só edita mensagens enviadas
         * pelo próprio bot.
         */
        if (
          message
            .author
            ?.id !==
              client.user?.id ||
          !message.editable
        ) {
          continue;
        }

        const ticketId =
          getTicketIdFromLog(
            message
          );

        if (
          !ticketId ||
          hasRestoreButton(
            message,
            ticketId
          )
        ) {
          continue;
        }

        const rows =
          addRestoreButtonToRows(
            message,
            ticketId
          );

        if (
          !rows.length
        ) {
          continue;
        }

        await message
          .edit({
            components:
              rows
          })
          .catch(
            () => {}
          );

        edited++;

        /*
         * Pequena pausa para não bater
         * rate limit enquanto edita
         * muitos logs antigos.
         */
        await sleep(
          650
        );
      }

      if (
        batch.size <
        100
      ) {
        break;
      }
    }

    console.log(
      `[TICKET RESTORE] Backfill concluído: ${scanned} lidos / ${edited} atualizados.`
    );
  }

  // =========================================================
  // ♻️ ATUALIZAÇÃO MANUAL DOS LOGS RECENTES
  // =========================================================
  //
  // Usado pelo comando !atualizartickets.
  //
  // Diferente do backfill automático:
  // - conta LOGS DE TICKET, não mensagens aleatórias;
  // - atualiza os tickets mais recentes primeiro;
  // - informa exatamente quantos foram alterados;
  // - verifica o ticket prioritário antes de tudo.
  // =========================================================

  async function forceUpdateRecentTicketLogs(
    requestedLimit = 50
  ) {
    const limit = Math.max(
      1,
      Math.min(
        Number(requestedLimit) || 50,
        200
      )
    );

    const channel =
      await client.channels
        .fetch(
          transcriptLogChannelId
        )
        .catch(
          () => null
        );

    if (
      !channel ||
      !channel.isTextBased?.()
    ) {
      throw new Error(
        `Canal de transcripts ${transcriptLogChannelId} não encontrado ou não é textual.`
      );
    }

    // =====================================================
    // PRIMEIRO: TICKETS PRIORITÁRIOS
    // =====================================================
    //
    // Isso garante que o ticket antigo específico:
    //
    // Log:
    // 1553421533005750417
    //
    // Ticket:
    // 1553211623458738227
    //
    // seja verificado ANTES de qualquer paginação.
    // =====================================================

    await ensurePriorityOldRestoreButtons(
      channel
    );

    let before = null;

    let scannedMessages = 0;

    let ticketLogsFound = 0;

    let updated = 0;

    let alreadyHadButton = 0;

    let notEditable = 0;

    let failed = 0;

    // =====================================================
    // LIMITE DE SEGURANÇA
    // =====================================================
    //
    // Queremos 50 LOGS de ticket.
    //
    // Porém o canal pode possuir mensagens que não sejam
    // logs de ticket.
    //
    // Por isso o sistema pode analisar mais de 50 mensagens
    // até encontrar os 50 tickets verdadeiros.
    // =====================================================

    const maxMessagesToScan =
      Math.max(
        1000,
        limit * 20
      );

    while (
      ticketLogsFound < limit &&
      scannedMessages < maxMessagesToScan
    ) {
      const batch =
        await channel.messages
          .fetch({
            limit: 100,

            before:
              before ||
              undefined
          });

      if (
        !batch ||
        batch.size === 0
      ) {
        break;
      }

      // ===================================================
      // MAIS RECENTES PRIMEIRO
      // ===================================================

      const ordered =
        [...batch.values()]
          .sort(
            (a, b) =>
              b.createdTimestamp -
              a.createdTimestamp
          );

      for (
        const logMessage of
        ordered
      ) {
        scannedMessages++;

        // =================================================
        // IDENTIFICA O ID DO TICKET
        // =================================================

        const ticketId =
          getTicketIdFromLog(
            logMessage
          );

        // Não é um log de ticket.
        if (
          !ticketId
        ) {
          continue;
        }

        ticketLogsFound++;

        // =================================================
        // JÁ POSSUI BOTÃO
        // =================================================

        if (
          hasRestoreButton(
            logMessage,
            ticketId
          )
        ) {
          alreadyHadButton++;

          if (
            ticketLogsFound >= limit
          ) {
            break;
          }

          continue;
        }

        // =================================================
        // VERIFICA SE O LOG PODE SER EDITADO
        // =================================================
        //
        // Discord só permite ao mesmo bot editar
        // a mensagem que ele próprio publicou.
        // =================================================

        if (
          logMessage.author?.id !==
            client.user?.id ||
          !logMessage.editable
        ) {
          notEditable++;

          console.warn(
            `[TICKET RESTORE] Log ${logMessage.id} do ticket ${ticketId} não é editável por este bot.`
          );

          if (
            ticketLogsFound >= limit
          ) {
            break;
          }

          continue;
        }

        // =================================================
        // MONTA NOVAMENTE AS ACTION ROWS
        // =================================================
        //
        // Mantém:
        //
        // 📂 Abrir Transcript
        //
        // e adiciona:
        //
        // ♻️ Restaurar Ticket
        // =================================================

        const rows =
          addRestoreButtonToRows(
            logMessage,
            ticketId
          );

        if (
          !rows.length
        ) {
          failed++;

          if (
            ticketLogsFound >= limit
          ) {
            break;
          }

          continue;
        }

        // =================================================
        // EDITA O LOG
        // =================================================

        const editedMessage =
          await logMessage
            .edit({
              components:
                rows
            })
            .catch(
              error => {
                console.error(
                  `[TICKET RESTORE] Falha ao atualizar o log ${logMessage.id} do ticket ${ticketId}:`,
                  error?.message ||
                    error
                );

                return null;
              }
            );

        if (
          editedMessage
        ) {
          updated++;

          // Pequena pausa para evitar rate limit.
          await sleep(
            350
          );
        } else {
          failed++;
        }

        if (
          ticketLogsFound >= limit
        ) {
          break;
        }
      }

      // ===================================================
      // PAGINAÇÃO
      // ===================================================
      //
      // Continua a partir da mensagem mais antiga
      // deste lote.
      // ===================================================

      before =
        batch.last()?.id ||
        null;

      if (
        batch.size < 100
      ) {
        break;
      }
    }

    // =====================================================
    // RESULTADO
    // =====================================================

    const result = {
      ok: true,

      requested:
        limit,

      ticketLogsFound,

      updated,

      alreadyHadButton,

      notEditable,

      failed,

      scannedMessages
    };

    console.log(
      `[TICKET RESTORE] Atualização manual concluída: ` +
      `${ticketLogsFound}/${limit} logs encontrados, ` +
      `${updated} atualizados, ` +
      `${alreadyHadButton} já tinham botão, ` +
      `${notEditable} não editáveis, ` +
      `${failed} falharam.`
    );

    return result;
  }

  async function resolveCategory(
    guild,
    transcript,
    hints
  ) {
    const tipo =
      String(
        hints.tipo ||
        transcript
          ?.restoreMeta
          ?.tipo ||
        ''
      )
        .toLowerCase();

    /*
     * Ordem de preferência:
     *
     * 1. Categoria verdadeira salva no restoreMeta;
     * 2. Override manual para tickets antigos;
     * 3. Categoria padrão do tipo.
     */
    const candidates =
      [
        transcript
          ?.restoreMeta
          ?.originalParentId,

        oldTicketParentOverrides
          .get(
            String(
              hints.ticketId
            )
          ),

        typeCategoryMap[
          tipo
        ],
      ]
        .filter(
          Boolean
        );

    for (
      const categoryId of
      candidates
    ) {
      const category =
        guild
          .channels
          .cache
          .get(
            categoryId
          ) ||
        await guild
          .channels
          .fetch(
            categoryId
          )
          .catch(
            () =>
              null
          );

      if (
        category
          ?.type ===
        ChannelType.GuildCategory
      ) {
        return category;
      }
    }

    return null;
  }

  async function replayTranscript({
    restoredChannel,
    transcript,
    interaction
  }) {
    /*
     * Webhook permite reproduzir
     * nome + avatar de cada autor.
     */
    let webhook =
      null;

    try {
      const canUseWebhook =
        restoredChannel
          .guild
          .members
          .me
          ?.permissionsIn(
            restoredChannel
          )
          .has(
            PermissionsBitField
              .Flags
              .ManageWebhooks
          );

      if (
        canUseWebhook
      ) {
        webhook =
          await restoredChannel
            .createWebhook({
              name:
                'SantaCreators • Histórico',

              reason:
                `Restauração do ticket ${transcript.canalId}`,
            });
      }
    } catch {}

    const messages =
      Array.isArray(
        transcript.mensagens
      )
        ? transcript.mensagens
        : [];

    let sends =
      0;

    for (
      let index = 0;
      index <
      messages.length;
      index++
    ) {
      const item =
        messages[
          index
        ];

      let originalAt =
        new Date(
          item.horario ||
          Date.now()
        )
          .getTime();

      if (
        !Number.isFinite(
          originalAt
        )
      ) {
        originalAt =
          Date.now();
      }

      const authorId =
        String(
          item.idAutor ||
          '0'
        );

      const authorName =
        cleanWebhookName(
          item.autor
        );

      const avatar =
        /^https?:\/\//i
          .test(
            String(
              item.avatar ||
                ''
            )
          )
          ? item.avatar
          : undefined;

      const parts =
        splitText(
          restoredMessageText(
            item
          )
        );

      for (
        let partIndex = 0;
        partIndex <
        parts.length;
        partIndex++
      ) {
        /*
         * Discord não deixa falsificar
         * a data real de criação da mensagem,
         * então mostramos a data original
         * explicitamente.
         */
        const meta =
          `-# 🕒 Original: <t:${Math.floor(originalAt / 1000)}:F>` +
          (
            authorId !==
              '0' &&
            authorId !==
              'BOT'
              ? ` • <@${authorId}>`
              : ''
          ) +
          (
            partIndex
              ? ' • continuação'
              : ''
          );

        if (
          webhook
        ) {
          await webhook
            .send({
              username:
                authorName,

              avatarURL:
                avatar,

              content:
                `${meta}\n${parts[partIndex]}`
                  .slice(
                    0,
                    2000
                  ),

              allowedMentions: {
                parse:
                  []
              },
            });
        } else {
          /*
           * Se o bot não tiver Manage Webhooks,
           * ainda restaura o conteúdo usando embeds.
           */
          const embed =
            new EmbedBuilder()
              .setAuthor({
                name:
                  authorName,

                iconURL:
                  avatar
              })
              .setDescription(
                parts[
                  partIndex
                ]
                  .slice(
                    0,
                    4096
                  )
              )
              .setFooter({
                text:
                  `Mensagem original • ${authorId}`
              })
              .setTimestamp(
                originalAt
              );

          await restoredChannel
            .send({
              embeds: [
                embed
              ],

              allowedMentions: {
                parse:
                  []
              },
            });
        }

        sends++;

        await sleep(
          REPLAY_DELAY_MS
        );
      }

      /*
       * Atualização visual a cada
       * 20 mensagens restauradas.
       */
      if (
        (
          index +
          1
        ) %
          20 ===
        0
      ) {
        await interaction
          .editReply(
            `⏳ Restaurando histórico... **${index + 1}/${messages.length}** mensagens.\n📍 ${restoredChannel}`
          )
          .catch(
            () => {}
          );
      }
    }

    /*
     * O webhook temporário só serve
     * durante a reconstrução.
     */
    if (
      webhook
    ) {
      await webhook
        .delete(
          'Histórico restaurado'
        )
        .catch(
          () => {}
        );
    }

    return sends;
  }

  async function handleRestoreInteraction(
    interaction
  ) {
    if (
      !interaction.isButton() ||
      !interaction
        .customId
        .startsWith(
          RESTORE_PREFIX
        )
    ) {
      return false;
    }

    /*
     * Segurança:
     * somente Macedo/Owner,
     * conforme os IDs passados
     * no entrevistasTickets.js.
     */
    if (
      !canRestore(
        interaction
      )
    ) {
      await interaction
        .reply({
          content:
            '🚫 Apenas Owner/Macedo pode restaurar tickets fechados.',

          ephemeral:
            true,
        })
        .catch(
          () => {}
        );

      return true;
    }

    const ticketId =
      interaction
        .customId
        .slice(
          RESTORE_PREFIX.length
        )
        .replace(
          /\D/g,
          ''
        );

    await interaction
      .deferReply({
        ephemeral:
          true
      })
      .catch(
        () => {}
      );

    if (
      !ticketId ||
      !interaction.guild
    ) {
      await interaction
        .editReply(
          '⚠️ Não consegui identificar o ticket/servidor.'
        )
        .catch(
          () => {}
        );

      return true;
    }

    /*
     * Impede restauração duplicada.
     */
    const alreadyRestored =
      interaction
        .guild
        .channels
        .cache
        .find(
          channel =>
            channel.type ===
              ChannelType.GuildText &&
            String(
              channel.topic ||
                ''
            )
              .includes(
                `restaurado_de:${ticketId}`
              )
        );

    if (
      alreadyRestored
    ) {
      await interaction
        .editReply(
          `✅ Esse ticket já está restaurado em ${alreadyRestored}.`
        )
        .catch(
          () => {}
        );

      return true;
    }

    await interaction
      .editReply(
        '♻️ Buscando transcript e configuração original...'
      )
      .catch(
        () => {}
      );

    const transcript =
      await getBestTranscript(
        Transcript,
        ticketId
      )
        .catch(
          () =>
            null
        );

    if (
      !transcript
    ) {
      await interaction
        .editReply(
          `❌ Não achei transcript salvo para \`${ticketId}\`.`
        )
        .catch(
          () => {}
        );

      return true;
    }

    const hints =
      getHintsFromLog(
        interaction.message,
        ticketId
      );

    const tipo =
      String(
        transcript
          ?.restoreMeta
          ?.tipo ||
        hints.tipo ||
        'suporte'
      )
        .toLowerCase();

    const openerId =
      String(
        transcript
          ?.restoreMeta
          ?.openerId ||
        hints.openerId ||
        ''
      ) ||
      null;

    const assumedById =
      String(
        transcript
          ?.restoreMeta
          ?.assumedById ||
        hints.assumedById ||
        ''
      ) ||
      null;

    const category =
      await resolveCategory(
        interaction.guild,
        transcript,
        {
          ...hints,
          tipo,
          ticketId
        }
      );

    if (
      !category
    ) {
      await interaction
        .editReply(
          `❌ Não achei a categoria original nem o fallback do tipo \`${tipo}\`.`
        )
        .catch(
          () => {}
        );

      return true;
    }

    const openerMember =
      openerId
        ? interaction
            .guild
            .members
            .cache
            .get(
              openerId
            ) ||
          await interaction
            .guild
            .members
            .fetch(
              openerId
            )
            .catch(
              () =>
                null
            )
        : null;

    const savedOverwrites =
      transcript
        ?.restoreMeta
        ?.permissionOverwrites ||
      [];

    /*
     * Se for um ticket novo, recupera
     * exatamente as permissões antigas.
     *
     * Se for um transcript antigo,
     * usa as permissões da categoria
     * + acesso de quem abriu.
     */
    const permissionOverwrites =
      savedOverwrites.length
        ? await sanitizeOverwrites(
            interaction.guild,
            savedOverwrites,
            openerMember
              ? openerId
              : null,
            category
          )
        : fallbackPermissions(
            category,
            openerMember
              ? openerId
              : null
          );

    const openerUser =
      openerId
        ? await client
            .users
            .fetch(
              openerId
            )
            .catch(
              () =>
                null
            )
        : null;

    const channelName =
      String(
        transcript
          ?.restoreMeta
          ?.originalName ||
        `🎫┋${tipo}-${openerUser?.username || ticketId.slice(-6)}`
      )
        .slice(
          0,
          100
        );

    const originalTopic =
      String(
        transcript
          ?.restoreMeta
          ?.originalTopic ||
        ''
      );

    const topic =
      [
        originalTopic,

        originalTopic.includes(
          'ticket_tipo:'
        )
          ? null
          : `ticket_tipo:${tipo}`,

        openerId &&
        !originalTopic.includes(
          'aberto_por:'
        )
          ? `aberto_por:${openerId}`
          : null,

        `restaurado_de:${ticketId}`,

        `restaurado_por:${interaction.user.id}`,
      ]
        .filter(
          Boolean
        )
        .join(
          ';'
        )
        .slice(
          0,
          1024
        );

    await interaction
      .editReply(
        '📁 Criando canal no local correto...'
      )
      .catch(
        () => {}
      );

    /*
     * Cria o NOVO canal.
     *
     * Discord não permite ressuscitar
     * literalmente um channelId apagado.
     */
    const restoredChannel =
      await interaction
        .guild
        .channels
        .create({
          name:
            channelName,

          type:
            ChannelType.GuildText,

          parent:
            category.id,

          topic,

          nsfw:
            Boolean(
              transcript
                ?.restoreMeta
                ?.originalNsfw
            ),

          rateLimitPerUser:
            Number(
              transcript
                ?.restoreMeta
                ?.originalRateLimitPerUser ||
              0
            ),

          permissionOverwrites,

          reason:
            `Ticket ${ticketId} restaurado por ${interaction.user.tag}`,
        });

    /*
     * Reaplica a posição aproximada
     * que o ticket possuía.
     */
    const oldPosition =
      Number(
        transcript
          ?.restoreMeta
          ?.originalPosition
      );

    if (
      Number.isFinite(
        oldPosition
      )
    ) {
      await restoredChannel
        .setPosition(
          oldPosition
        )
        .catch(
          () => {}
        );
    }

    /*
     * Cabeçalho inicial da restauração.
     */
    const restoreHeader =
      new EmbedBuilder()
        .setColor(
          '#ff009a'
        )
        .setTitle(
          '♻️ Ticket restaurado'
        )
        .setDescription(
          `Restauração do ticket original \`${ticketId}\`.\n` +
          `O transcript original continua preservado no canal de logs.`
        )
        .addFields(
          {
            name:
              '📄 Tipo',

            value:
              `\`${tipo.toUpperCase()}\``,

            inline:
              true
          },

          {
            name:
              '📨 Aberto por',

            value:
              openerId
                ? `<@${openerId}>`
                : '`Não identificado`',

            inline:
              true
          },

          {
            name:
              '♻️ Restaurado por',

            value:
              `<@${interaction.user.id}>`,

            inline:
              true
          },

          {
            name:
              '📂 Transcript original',

            value:
              `[Abrir transcript](${transcriptBaseUrl}${ticketId})`,

            inline:
              false
          }
        )
        .setFooter({
          text:
            'SantaCreators • Restauração de Tickets'
        })
        .setTimestamp();

    await restoredChannel
      .send({
        embeds: [
          restoreHeader
        ],

        allowedMentions: {
          parse:
            []
        },
      });

    /*
     * Reconstrói todas as mensagens.
     */
    const restoredMessages =
      await replayTranscript({
        restoredChannel,
        transcript,
        interaction,
      });

    /*
     * Depois do histórico, cria um painel
     * NOVO e FUNCIONAL.
     *
     * Estes são exatamente os mesmos
     * customIds usados pelo seu
     * entrevistasTickets.js.
     */
    const activePanel =
      new EmbedBuilder()
        .setTitle(
          tipo
            .charAt(
              0
            )
            .toUpperCase() +
          tipo.slice(
            1
          )
        )
        .setColor(
          '#ff009a'
        )
        .setThumbnail(
          interaction
            .guild
            .iconURL({
              dynamic:
                true
            })
        )
        .addFields(
          {
            name:
              'Aberto por:',

            value:
              openerId
                ? `<@${openerId}> • ticket original \`${ticketId}\``
                : '`Não identificado`',

            inline:
              true,
          },

          {
            name:
              'Assumido por:',

            value:
              assumedById
                ? `<@${assumedById}>`
                : '`Ninguém`',

            inline:
              true,
          },

          {
            name:
              '♻️ Restauração:',

            value:
              `Histórico preservado • ${restoredMessages} envio(s) reconstruído(s)`,

            inline:
              false,
          }
        )
        .setFooter({
          text:
            'SantaCreators - Tickets'
        });

    /*
     * O painel restaurado volta com:
     *
     * Assumir Ticket
     * Assumir Resp
     * Fechar Ticket
     * Adicionar Usuário
     * Remover Usuário
     */
    await restoredChannel
      .send({
        content:
          openerId
            ? `<@${openerId}>`
            : undefined,

        embeds: [
          activePanel
        ],

        components: [
          buildTicketButtons()
        ],

        allowedMentions: {
          parse:
            []
        },
      });

    /*
     * Ticket de líder possuía também
     * o botão Registrar Líder.
     */
    if (
      tipo ===
      'lider'
    ) {
      await restoredChannel
        .send({
          content:
            '👑 Controles adicionais do ticket de Líder:',

          components: [
            new ActionRowBuilder()
              .addComponents(
                new ButtonBuilder()
                  .setCustomId(
                    'registrar_lider_org'
                  )
                  .setLabel(
                    '✍️ Registrar Líder'
                  )
                  .setStyle(
                    ButtonStyle.Primary
                  )
              )
          ],
        });
    }

    /*
     * Marca no Mongo que o transcript
     * já foi restaurado e para onde.
     *
     * O transcript NÃO é apagado.
     */
    await Transcript
      .collection
      .updateMany(
        {
          canalId:
            String(
              ticketId
            )
        },
        {
          $set: {
            'restoreMeta.lastRestoredChannelId':
              restoredChannel.id,

            'restoreMeta.lastRestoredAt':
              Date.now(),

            'restoreMeta.lastRestoredBy':
              interaction.user.id,
          }
        }
      )
      .catch(
        () => {}
      );

    /*
     * Depois da restauração,
     * coloca também o botão para abrir
     * diretamente o canal novo.
     */
    const restoredChannelUrl =
      `https://discord.com/channels/${interaction.guild.id}/${restoredChannel.id}`;

    const updatedRows =
      addRestoredChannelButtonToRows(
        interaction.message,
        restoredChannelUrl
      );

    if (
      updatedRows.length
    ) {
      await interaction
        .message
        .edit({
          components:
            updatedRows
        })
        .catch(
          () => {}
        );
    }

    await interaction
      .editReply(
        `✅ Ticket \`${ticketId}\` restaurado com sucesso em ${restoredChannel}.\n` +
        `💬 Histórico reconstruído: **${restoredMessages}** envio(s).\n` +
        `📄 O transcript original foi mantido.`
      )
      .catch(
        () => {}
      );

    return true;
  }

  return {
    saveRestoreMeta,
    backfillRestoreButtons,
    forceUpdateRecentTicketLogs,
    handleRestoreInteraction,
    buildRestoreButton,
  };
}