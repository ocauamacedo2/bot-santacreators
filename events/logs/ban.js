import { EmbedBuilder, AuditLogEvent } from 'discord.js';

// ================== CONFIGURAÇÃO DE LOGS ==================

const MAIN_GUILD_ID = '1262262852782129183';

// Canal central de BAN
const CENTRAL_LOG_BAN_ID =
  '1362540782829048170';

// Canal central de UNBAN
const CENTRAL_LOG_UNBAN_ID =
  '1553925418304671785';

/*
 * Convite oficial da Santa Creators.
 *
 * Caso queira colocar um convite clicável na DM de desbanimento,
 * configure no ambiente:
 *
 * SANTA_CREATORS_INVITE_URL=https://discord.gg/SEU_CONVITE
 *
 * Se não configurar, a DM continuará funcionando normalmente,
 * apenas sem o link clicável.
 */
const SANTA_CREATORS_INVITE_URL =
  process.env.SANTA_CREATORS_INVITE_URL || null;

// Mapeamento de Guild ID para Canal de Log Local
const LOCAL_LOG_CHANNELS = {
  '1262262852782129183': '1362540782829048170', // Principal
  '1362899773992079533': '1363295055384809483', // Cidade Santa -> #sc-logs
  '1452416085751234733': '1455312395269443813', // Administração -> #sc-logs
};

// ==========================================================

// Guarda temporariamente os cargos do membro antes da saída/ban
const preBanCache = new Map();

/*
 * Guarda dados recentes do ban para facilitar o unban.
 *
 * Isso NÃO vira arquivo JSON.
 * Isso NÃO fica crescendo para sempre.
 *
 * Caso o bot reinicie, o sistema tenta recuperar os dados
 * através do Audit Log do Discord.
 */
const banHistoryCache = new Map();

const BAN_HISTORY_MEMORY_TTL =
  30 * 24 * 60 * 60 * 1000;

// ==========================================================
// FUNÇÕES AUXILIARES
// ==========================================================

/**
 * Aguarda o tempo informado antes de realizar uma nova tentativa.
 */
function wait(milliseconds) {
  return new Promise(resolve =>
    setTimeout(resolve, milliseconds)
  );
}

/**
 * Gera a chave utilizada pelo cache de histórico.
 */
function getBanHistoryKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

/**
 * Limpa registros muito antigos do cache em memória.
 *
 * O Audit Log continua sendo utilizado como fallback.
 */
function cleanupBanHistoryCache() {
  const now = Date.now();

  for (const [key, data] of banHistoryCache.entries()) {
    if (
      !data?.cachedAt ||
      now - data.cachedAt > BAN_HISTORY_MEMORY_TTL
    ) {
      banHistoryCache.delete(key);
    }
  }
}

/**
 * Evita ultrapassar os limites de caracteres dos campos
 * de Embed do Discord.
 */
function truncateText(value, maximumLength = 1024) {
  const text =
    value === null || value === undefined
      ? ''
      : String(value);

  if (text.length <= maximumLength) {
    return text;
  }

  return `${text.slice(
    0,
    maximumLength - 3
  )}...`;
}

/**
 * Retorna data formatada no horário de São Paulo.
 */
function formatDate(timestamp) {
  return new Date(timestamp).toLocaleDateString(
    'pt-BR',
    {
      timeZone: 'America/Sao_Paulo'
    }
  );
}

/**
 * Retorna horário formatado no horário de São Paulo.
 */
function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString(
    'pt-BR',
    {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }
  );
}

/**
 * Retorna data + horário.
 */
function formatDateTime(timestamp) {
  return new Date(timestamp).toLocaleString(
    'pt-BR',
    {
      timeZone: 'America/Sao_Paulo'
    }
  );
}

/**
 * Converte milissegundos em uma duração amigável.
 *
 * Exemplo:
 * 4 dias, 6 horas, 23 minutos
 */
function formatDuration(milliseconds) {
  if (
    !Number.isFinite(milliseconds) ||
    milliseconds < 0
  ) {
    return 'Não foi possível calcular';
  }

  const totalSeconds = Math.floor(
    milliseconds / 1000
  );

  const days = Math.floor(
    totalSeconds / 86400
  );

  const hours = Math.floor(
    (totalSeconds % 86400) / 3600
  );

  const minutes = Math.floor(
    (totalSeconds % 3600) / 60
  );

  const seconds = totalSeconds % 60;

  const parts = [];

  if (days > 0) {
    parts.push(
      `${days} dia${days !== 1 ? 's' : ''}`
    );
  }

  if (hours > 0) {
    parts.push(
      `${hours} hora${hours !== 1 ? 's' : ''}`
    );
  }

  if (minutes > 0) {
    parts.push(
      `${minutes} minuto${
        minutes !== 1 ? 's' : ''
      }`
    );
  }

  if (
    days === 0 &&
    hours === 0 &&
    minutes === 0
  ) {
    parts.push(
      `${seconds} segundo${
        seconds !== 1 ? 's' : ''
      }`
    );
  }

  return parts.slice(0, 3).join(', ');
}

/**
 * Retorna a logo atual do servidor.
 *
 * Dessa forma não é necessário colocar uma URL fixa
 * da Santa Creators no código.
 */
function getGuildLogo(guild) {
  return (
    guild.iconURL({
      size: 256
    }) || null
  );
}

/**
 * Identifica a origem da ação administrativa.
 */
function getExecutionOrigin(executor) {
  if (!executor) {
    return (
      '❓ Não identificada\n' +
      'Entrada não localizada no log de auditoria'
    );
  }

  if (executor.bot) {
    return '🤖 Bot / Integração';
  }

  return '👤 Ação manual';
}

/**
 * Formata o executor para os logs.
 */
function formatExecutor(executor) {
  if (!executor) {
    return 'Não localizado no log de auditoria';
  }

  return (
    `<@${executor.id}>\n` +
    `\`${executor.tag}\`\n` +
    `ID: \`${executor.id}\``
  );
}

/**
 * Formata executor armazenado no cache.
 */
function formatCachedExecutor(data) {
  if (!data?.executorId) {
    return 'Não localizado no histórico';
  }

  return (
    `<@${data.executorId}>\n` +
    `\`${data.executorTag || 'Tag indisponível'}\`\n` +
    `ID: \`${data.executorId}\``
  );
}

/**
 * Formata quem solicitou o banimento.
 */
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

  if (executor && !executor.bot) {
    return 'O próprio executor';
  }

  if (executor?.bot) {
    return (
      'Não informado pelo bot que realizou ' +
      'o banimento'
    );
  }

  return (
    'Não foi possível identificar pelo ' +
    'log de auditoria'
  );
}

/**
 * Formata o solicitante usando dados em cache.
 */
function formatCachedRequester(data) {
  if (data?.requesterId) {
    return (
      `<@${data.requesterId}>\n` +
      `ID: \`${data.requesterId}\``
    );
  }

  if (
    data?.executorId &&
    data?.executorBot === false
  ) {
    return 'O próprio executor';
  }

  if (data?.executorBot === true) {
    return (
      'Não informado pelo bot que realizou ' +
      'o banimento'
    );
  }

  return 'Não identificado';
}

/**
 * Procura uma entrada RECENTE no log de auditoria.
 *
 * Usada no momento em que guildBanAdd ou
 * guildBanRemove acontece.
 */
async function fetchBanAuditEntry(
  guild,
  auditLogType,
  userId
) {
  const maximumAttempts = 5;
  const delayBetweenAttempts = 1200;
  const maximumEntryAge = 30000;

  for (
    let attempt = 1;
    attempt <= maximumAttempts;
    attempt++
  ) {
    try {
      const logs =
        await guild.fetchAuditLogs({
          type: auditLogType,
          limit: 10
        });

      const entry = logs.entries.find(
        auditEntry =>
          (
            auditEntry.target?.id === userId ||
            auditEntry.targetId === userId
          ) &&
          Date.now() -
            auditEntry.createdTimestamp <
            maximumEntryAge
      );

      if (entry) {
        return entry;
      }
    } catch (error) {
      console.warn(
        `[AUDITORIA] Tentativa ${attempt}/${maximumAttempts} falhou no servidor ${guild.id}:`,
        error
      );
    }

    if (attempt < maximumAttempts) {
      await wait(delayBetweenAttempts);
    }
  }

  return null;
}

/**
 * Procura o BANIMENTO ANTERIOR do usuário.
 *
 * Essa função é utilizada principalmente no UNBAN.
 *
 * Caso o bot tenha reiniciado e perdido o cache,
 * ela percorre o Audit Log do Discord procurando
 * o último MemberBanAdd daquele usuário.
 */
async function fetchPreviousBanAuditEntry(
  guild,
  userId
) {
  const maximumPages = 5;

  let before = undefined;

  for (
    let page = 1;
    page <= maximumPages;
    page++
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

      const matchingEntry =
        entries.find(entry =>
          entry.target?.id === userId ||
          entry.targetId === userId
        );

      if (matchingEntry) {
        return matchingEntry;
      }

      if (entries.length < 100) {
        break;
      }

      const oldestEntry =
        entries[entries.length - 1];

      if (!oldestEntry?.id) {
        break;
      }

      before = oldestEntry.id;
    } catch (error) {
      console.warn(
        `[AUDITORIA] Não foi possível procurar o ban anterior de ${userId} no servidor ${guild.id}:`,
        error
      );

      break;
    }
  }

  return null;
}

/**
 * Separa o ID do solicitante e o motivo verdadeiro.
 *
 * Formato interno utilizado pelo comando:
 *
 * [SOLICITANTE:ID_DO_USUARIO] motivo informado
 */
function parseBanReason(rawReason) {
  const defaultReason =
    'Sem motivo especificado';

  if (
    !rawReason ||
    typeof rawReason !== 'string'
  ) {
    return {
      requesterId: null,
      reason: defaultReason
    };
  }

  const requesterMatch =
    rawReason.match(
      /^\[SOLICITANTE:(\d{17,20})\]\s*/
    );

  if (!requesterMatch) {
    return {
      requesterId: null,
      reason:
        rawReason.trim() ||
        defaultReason
    };
  }

  const requesterId =
    requesterMatch[1];

  const cleanReason =
    rawReason
      .replace(
        requesterMatch[0],
        ''
      )
      .trim();

  return {
    requesterId,
    reason:
      cleanReason ||
      defaultReason
  };
}

/**
 * Lê o motivo interno de um desbanimento disparado por comando.
 *
 * Formato:
 * [SOLICITANTE:ID] [COMANDO:unbangeral] motivo
 */
function parseUnbanCommandReason(rawReason) {
  const defaultReason =
    'Nenhum motivo de desbanimento foi informado';

  const text =
    typeof rawReason === 'string'
      ? rawReason.trim()
      : '';

  if (!text) {
    return {
      requesterId: null,
      command: null,
      reason: defaultReason
    };
  }

  const requesterId =
    text.match(
      /\[SOLICITANTE:(\d{17,20})\]/
    )?.[1] || null;

  const command =
    text.match(
      /\[COMANDO:([a-z0-9_-]+)\]/i
    )?.[1]?.toLowerCase() || null;

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
    defaultReason;

  return {
    requesterId,
    command,
    reason
  };
}

/**
 * Pré-carrega no cache os dados de um ban antes de um
 * desbanimento disparado por comando.
 *
 * Isso evita que o guildBanRemove precise fazer várias
 * buscas extras no Audit Log para recuperar o ban anterior.
 */
export function cacheBanSnapshotForUnban({
  guild,
  guildBan,
  auditEntry = null
}) {
  const user =
    guildBan?.user;

  if (!guild || !user) {
    return false;
  }

  cleanupBanHistoryCache();

  const rawReason =
    auditEntry?.reason ||
    guildBan.reason ||
    'Sem motivo especificado';

  const parsedReason =
    parseBanReason(
      rawReason
    );

  const executor =
    auditEntry?.executor ||
    null;

  banHistoryCache.set(
    getBanHistoryKey(
      guild.id,
      user.id
    ),
    {
      userId:
        user.id,

      guildId:
        guild.id,

      guildName:
        guild.name,

      bannedAt:
        auditEntry
          ?.createdTimestamp ||
        null,

      reason:
        parsedReason.reason,

      rawReason,

      requesterId:
        parsedReason
          .requesterId,

      executorId:
        executor?.id ||
        null,

      executorTag:
        executor?.tag ||
        null,

      executorBot:
        executor?.bot ??
        null,

      executionOrigin:
        getExecutionOrigin(
          executor
        ),

      auditLogId:
        auditEntry?.id ||
        null,

      cachedAt:
        Date.now()
    }
  );

  return true;
}

// ==========================================================
// ENVIO DE DM
// ==========================================================

/**
 * Envia mensagem privada ao usuário banido.
 *
 * Retorna true caso a mensagem seja entregue.
 * Retorna false caso o Discord bloqueie a DM.
 */
async function sendBanDM({
  user,
  guild,
  reason,
  bannedAt
}) {
  try {
    const guildLogo =
      getGuildLogo(guild);

    const embed =
      new EmbedBuilder()
        .setAuthor({
          name:
            'Santa Creators • Moderação',
          iconURL:
            guildLogo || undefined
        })

        .setTitle(
          '🔨 Você foi banido da Santa Creators'
        )

        .setColor(0xED4245)

        .setThumbnail(
          user.displayAvatarURL({
            size: 256
          })
        )

        .setDescription(
          [
            `Olá, **${user.globalName || user.username}**.`,
            '',
            'Identificamos que seu acesso ao servidor **Santa Creators** foi suspenso através de um banimento.',
            '',
            'Caso você acredite que essa decisão tenha sido aplicada de forma incorreta ou injusta, você poderá solicitar uma revisão entrando em contato com um dos **Responsáveis da Santa Creators**.',
            '',
            'Ao solicitar a revisão, explique a situação com clareza e apresente as informações necessárias para que a equipe possa analisar o ocorrido.'
          ].join('\n')
        )

        .addFields(
          {
            name: '📌 Situação',
            value:
              '🔴 **BANIDO**',
            inline: true
          },

          {
            name: '🏙️ Servidor',
            value:
              `**${guild.name}**`,
            inline: true
          },

          {
            name:
              '📅 Data do banimento',
            value:
              `${formatDate(
                bannedAt
              )}\n🕒 ${formatTime(
                bannedAt
              )}`,
            inline: true
          },

          {
            name:
              '📄 Motivo informado',
            value:
              truncateText(
                reason,
                1024
              ),
            inline: false
          },

          {
            name:
              '⚖️ Contestação / Revisão',
            value:
              'Caso considere o banimento incorreto, procure um dos responsáveis da **Santa Creators** e solicite a revisão da punição.',
            inline: false
          }
        )

        .setFooter({
          text:
            'Santa Creators • Sistema de Moderação',
          iconURL:
            guildLogo || undefined
        })

        .setTimestamp(
          bannedAt
        );

    await user.send({
      embeds: [embed]
    });

    return true;
  } catch (error) {
    console.warn(
      `[DM BAN] Não foi possível enviar DM para ${user.tag} (${user.id}):`,
      error?.message || error
    );

    return false;
  }
}

/**
 * Envia mensagem privada ao usuário desbanido.
 */
async function sendUnbanDM({
  user,
  guild,
  unbannedAt,
  bannedAt,
  originalReason,
  banDuration
}) {
  try {
    const guildLogo =
      getGuildLogo(guild);

    const embed =
      new EmbedBuilder()
        .setAuthor({
          name:
            'Santa Creators • Moderação',
          iconURL:
            guildLogo || undefined
        })

        .setTitle(
          '✅ Seu acesso à Santa Creators foi restaurado'
        )

        .setColor(0x57F287)

        .setThumbnail(
          user.displayAvatarURL({
            size: 256
          })
        )

        .setDescription(
          [
            `Olá, **${user.globalName || user.username}**!`,
            '',
            'Seu banimento da **Santa Creators** foi removido. 🥳',
            '',
            'A partir de agora você está autorizado a entrar novamente no servidor.',
            '',
            'Esperamos você de volta. Antes de retornar, recomendamos revisar as regras do servidor para evitar novos problemas.'
          ].join('\n')
        )

        .addFields(
          {
            name: '📌 Situação',
            value:
              '🟢 **DESBANIDO**',
            inline: true
          },

          {
            name: '🏙️ Servidor',
            value:
              `**${guild.name}**`,
            inline: true
          },

          {
            name:
              '📅 Desbanido em',
            value:
              `${formatDate(
                unbannedAt
              )}\n🕒 ${formatTime(
                unbannedAt
              )}`,
            inline: true
          },

          {
            name:
              '⏳ Tempo que permaneceu banido',
            value:
              banDuration ||
              'Não foi possível calcular',
            inline: false
          },

          {
            name:
              '📄 Motivo do banimento anterior',
            value:
              truncateText(
                originalReason ||
                  'Não localizado',
                1024
              ),
            inline: false
          }
        );

    if (
      SANTA_CREATORS_INVITE_URL
    ) {
      embed.addFields({
        name:
          '🔗 Voltar para a Santa Creators',
        value:
          `[➡️ Clique aqui para entrar novamente](${SANTA_CREATORS_INVITE_URL})`,
        inline: false
      });
    } else {
      embed.addFields({
        name:
          '🏠 Retorno ao servidor',
        value:
          'Você já pode utilizar novamente o convite oficial da **Santa Creators** para entrar no servidor.',
        inline: false
      });
    }

    embed
      .setFooter({
        text:
          'Santa Creators • Bem-vindo de volta!',
        iconURL:
          guildLogo || undefined
      })
      .setTimestamp(
        unbannedAt
      );

    await user.send({
      embeds: [embed]
    });

    return true;
  } catch (error) {
    console.warn(
      `[DM UNBAN] Não foi possível enviar DM para ${user.tag} (${user.id}):`,
      error?.message || error
    );

    return false;
  }
}

// ==========================================================
// ENVIO DOS LOGS
// ==========================================================

/**
 * Envia um Embed para um canal de log.
 */
async function sendEmbedToChannel(
  client,
  channelId,
  embed
) {
  if (!channelId) {
    return false;
  }

  try {
    const channel =
      await client.channels
        .fetch(channelId)
        .catch(() => null);

    if (
      !channel ||
      !channel.isTextBased()
    ) {
      console.warn(
        `[LOG] Canal ${channelId} não encontrado ou não é textual.`
      );

      return false;
    }

    await channel.send({
      embeds: [embed],
      allowedMentions: {
        parse: []
      }
    });

    return true;
  } catch (error) {
    console.error(
      `[LOG] Erro ao enviar log para ${channelId}:`,
      error
    );

    return false;
  }
}

/**
 * Envia o log para o canal CENTRAL.
 *
 * Nos servidores secundários também envia uma cópia
 * para o canal local configurado.
 *
 * No servidor principal evita enviar duas vezes.
 */
async function sendModerationLog({
  client,
  guild,
  centralChannelId,
  embed
}) {
  const channelIds =
    new Set();

  if (centralChannelId) {
    channelIds.add(
      centralChannelId
    );
  }

  const localLogChannelId =
    LOCAL_LOG_CHANNELS[
      guild.id
    ];

  /*
   * No MAIN_GUILD o log central é suficiente.
   *
   * Isso também impede que um UNBAN do servidor
   * principal caia no antigo canal de BAN
   * configurado em LOCAL_LOG_CHANNELS.
   */
  if (
    guild.id !== MAIN_GUILD_ID &&
    localLogChannelId
  ) {
    channelIds.add(
      localLogChannelId
    );
  }

  for (
    const channelId
    of channelIds
  ) {
    await sendEmbedToChannel(
      client,
      channelId,
      new EmbedBuilder(
        embed.toJSON()
      )
    );
  }
}

// ==========================================================
// EVENTOS
// ==========================================================

export function setupBanLog(client) {
  // ========================================================
  // CACHE DE CARGOS ANTES DO BAN
  // ========================================================

  client.on(
    'guildMemberRemove',
    async member => {
      try {
        if (
          !LOCAL_LOG_CHANNELS[
            member.guild.id
          ]
        ) {
          return;
        }

        const roles =
          member.roles.cache
            .filter(
              role =>
                role.id !==
                member.guild.id
            )
            .map(
              role =>
                `<@&${role.id}>`
            );

        if (roles.length > 0) {
          preBanCache.set(
            member.id,
            roles
          );

          setTimeout(
            () =>
              preBanCache.delete(
                member.id
              ),
            10 * 60 * 1000
          );
        }
      } catch (error) {
        console.warn(
          '[CACHE] Erro ao armazenar cargos antes do ban:',
          error
        );
      }
    }
  );

  // ========================================================
  // BANIMENTO
  // ========================================================

  client.on(
    'guildBanAdd',
    async ban => {
      const {
        user,
        guild
      } = ban;

      try {
        cleanupBanHistoryCache();

        const entry =
          await fetchBanAuditEntry(
            guild,
            AuditLogEvent.MemberBanAdd,
            user.id
          );

        const executor =
          entry?.executor ||
          null;

        const rawReason =
          entry?.reason ||
          ban.reason ||
          'Sem motivo especificado';

        const parsedReason =
          parseBanReason(
            rawReason
          );

        const requesterId =
          parsedReason.requesterId;

        const reason =
          parsedReason.reason;

        const banTimestamp =
          entry?.createdTimestamp ||
          Date.now();

        const rolesArray =
          preBanCache.get(
            user.id
          ) || [];

        const roles =
          rolesArray.length > 0
            ? rolesArray.join(', ')
            : 'Não registrado';

        const executionOrigin =
          getExecutionOrigin(
            executor
          );

        const requesterText =
          formatRequester(
            requesterId,
            executor
          );

        const executorText =
          formatExecutor(
            executor
          );

        // ================================================
        // GUARDA O HISTÓRICO RECENTE DO BAN
        // ================================================

        const banHistoryKey =
          getBanHistoryKey(
            guild.id,
            user.id
          );

        banHistoryCache.set(
          banHistoryKey,
          {
            userId:
              user.id,

            guildId:
              guild.id,

            guildName:
              guild.name,

            bannedAt:
              banTimestamp,

            reason,

            rawReason,

            requesterId,

            executorId:
              executor?.id ||
              null,

            executorTag:
              executor?.tag ||
              null,

            executorBot:
              executor?.bot ??
              null,

            executionOrigin,

            auditLogId:
              entry?.id ||
              null,

            cachedAt:
              Date.now()
          }
        );

        // ================================================
        // ENVIA DM AO USUÁRIO BANIDO
        // ================================================

        const dmDelivered =
          await sendBanDM({
            user,
            guild,
            reason,
            bannedAt:
              banTimestamp
          });

        const guildLogo =
          getGuildLogo(
            guild
          );

        // ================================================
        // LOG PROFISSIONAL DO BAN
        // ================================================

        const embed =
          new EmbedBuilder()

            .setAuthor({
              name:
                'Santa Creators • Central de Moderação',
              iconURL:
                guildLogo ||
                undefined
            })

            .setTitle(
              '🔨 BANIMENTO REGISTRADO'
            )

            .setColor(
              0xED4245
            )

            .setThumbnail(
              user.displayAvatarURL({
                size: 256
              })
            )

            .setDescription(
              'Um novo banimento foi registrado pelo sistema de moderação da **Santa Creators**.'
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
                  '🏙️ Local / Servidor',

                value:
                  `**${guild.name}**\n` +
                  `ID: \`${guild.id}\``,

                inline: true
              },

              {
                name:
                  '🧭 Origem da ação',

                value:
                  executionOrigin,

                inline: true
              },

              {
                name:
                  '🛡️ Ban executado por',

                value:
                  truncateText(
                    executorText
                  ),

                inline: true
              },

              {
                name:
                  '👮 Ban solicitado por',

                value:
                  truncateText(
                    requesterText
                  ),

                inline: true
              },

              {
                name:
                  '📩 Notificação ao usuário',

                value:
                  dmDelivered
                    ? '✅ DM enviada com sucesso'
                    : '⚠️ Não foi possível entregar a DM',

                inline: true
              },

              {
                name:
                  '📄 Motivo do banimento',

                value:
                  truncateText(
                    reason
                  ),

                inline: false
              },

              {
                name:
                  '🎭 Cargos antes do banimento',

                value:
                  truncateText(
                    roles
                  ),

                inline: false
              },

              {
                name:
                  '📅 Data do banimento',

                value:
                  `${formatDate(
                    banTimestamp
                  )}\n🕒 ${formatTime(
                    banTimestamp
                  )}`,

                inline: true
              },

              {
                name:
                  '🔎 Registro de auditoria',

                value:
                  entry?.id
                    ? `ID: \`${entry.id}\``
                    : '⚠️ Entrada não localizada',

                inline: true
              },

              {
                name:
                  '📌 Status',

                value:
                  '🔴 **BANIDO**',

                inline: true
              }
            )

            .setFooter({
              text:
                `Santa Creators • Sistema de Moderação • Usuário ${user.id}`,

              iconURL:
                executor
                  ?.displayAvatarURL({
                    size: 128
                  }) ||
                guildLogo ||
                undefined
            })

            .setTimestamp(
              banTimestamp
            );

        await sendModerationLog({
          client,
          guild,
          centralChannelId:
            CENTRAL_LOG_BAN_ID,
          embed
        });

        preBanCache.delete(
          user.id
        );
      } catch (error) {
        console.error(
          '[ERRO] Falha no log de ban:',
          error
        );
      }
    }
  );

  // ========================================================
  // DESBANIMENTO
  // ========================================================

  client.on(
    'guildBanRemove',
    async ban => {
      const {
        user,
        guild
      } = ban;

      try {
        cleanupBanHistoryCache();

        // ================================================
        // AUDITORIA DO DESBANIMENTO
        // ================================================

        const unbanEntry =
          await fetchBanAuditEntry(
            guild,
            AuditLogEvent.MemberBanRemove,
            user.id
          );

        const unbanExecutor =
          unbanEntry?.executor ||
          null;

        const unbanTimestamp =
          unbanEntry
            ?.createdTimestamp ||
          Date.now();

        const unbanOrigin =
          getExecutionOrigin(
            unbanExecutor
          );

        const unbanExecutorText =
          formatExecutor(
            unbanExecutor
          );

        const parsedUnbanReason =
          parseUnbanCommandReason(
            unbanEntry?.reason
          );

        const unbanReason =
          parsedUnbanReason.reason;

        const unbanRequesterText =
          parsedUnbanReason.requesterId
            ? (
                `<@${parsedUnbanReason.requesterId}>\n` +
                `ID: \`${parsedUnbanReason.requesterId}\``
              )
            : (
                unbanExecutor &&
                !unbanExecutor.bot
                  ? 'O próprio executor'
                  : 'Não identificado'
              );

        const unbanCommand =
          parsedUnbanReason.command;

        // ================================================
        // PROCURA O BANIMENTO ORIGINAL
        // ================================================

        const banHistoryKey =
          getBanHistoryKey(
            guild.id,
            user.id
          );

        const cachedBanData =
          banHistoryCache.get(
            banHistoryKey
          ) || null;

        let previousBanEntry =
          null;

        /*
         * Se não estiver mais na memória,
         * procura o ban anterior no Audit Log.
         */
        if (!cachedBanData) {
          previousBanEntry =
            await fetchPreviousBanAuditEntry(
              guild,
              user.id
            );
        }

        // ================================================
        // RECUPERA MOTIVO ORIGINAL
        // ================================================

        const previousRawReason =
          cachedBanData?.rawReason ||
          previousBanEntry?.reason ||
          ban.reason ||
          'Motivo do banimento anterior não localizado';

        const previousParsedReason =
          parseBanReason(
            previousRawReason
          );

        const originalReason =
          cachedBanData?.reason ||
          previousParsedReason.reason;

        // ================================================
        // DATA DO BAN ORIGINAL
        // ================================================

        const originalBanTimestamp =
          cachedBanData?.bannedAt ||
          previousBanEntry
            ?.createdTimestamp ||
          null;

        // ================================================
        // EXECUTOR DO BAN ORIGINAL
        // ================================================

        const originalBanExecutor =
          previousBanEntry?.executor ||
          null;

        const originalExecutorText =
          cachedBanData
            ? formatCachedExecutor(
                cachedBanData
              )
            : formatExecutor(
                originalBanExecutor
              );

        // ================================================
        // SOLICITANTE DO BAN ORIGINAL
        // ================================================

        const originalRequesterText =
          cachedBanData
            ? formatCachedRequester(
                cachedBanData
              )
            : formatRequester(
                previousParsedReason
                  .requesterId,
                originalBanExecutor
              );

        // ================================================
        // DURAÇÃO DO BAN
        // ================================================

        const banDuration =
          originalBanTimestamp
            ? formatDuration(
                unbanTimestamp -
                  originalBanTimestamp
              )
            : 'Não foi possível calcular';

        // ================================================
        // ENVIA DM AO USUÁRIO DESBANIDO
        // ================================================

        const dmDelivered =
          await sendUnbanDM({
            user,
            guild,

            unbannedAt:
              unbanTimestamp,

            bannedAt:
              originalBanTimestamp,

            originalReason,

            banDuration
          });

        const guildLogo =
          getGuildLogo(
            guild
          );

        // ================================================
        // LOG PROFISSIONAL DO DESBANIMENTO
        // ================================================

        const embed =
          new EmbedBuilder()

            .setAuthor({
              name:
                'Santa Creators • Central de Moderação',
              iconURL:
                guildLogo ||
                undefined
            })

            .setTitle(
              '✅ DESBANIMENTO REGISTRADO'
            )

            .setColor(
              0x57F287
            )

            .setThumbnail(
              user.displayAvatarURL({
                size: 256
              })
            )

            .setDescription(
              'O acesso de um usuário foi restaurado e o desbanimento foi registrado pelo sistema de moderação da **Santa Creators**.'
            )

            .addFields(
              {
                name:
                  '👤 Usuário desbanido',

                value:
                  `<@${user.id}>\n` +
                  `\`${user.tag}\`\n` +
                  `ID: \`${user.id}\``,

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
                  '📌 Status atual',

                value:
                  '🟢 **DESBANIDO**',

                inline: true
              },

              {
                name:
                  '🔓 Desbanido por',

                value:
                  truncateText(
                    unbanExecutorText
                  ),

                inline: true
              },

              {
                name:
                  '👮 Desbanimento solicitado por',

                value:
                  truncateText(
                    unbanRequesterText
                  ),

                inline: true
              },

              {
                name:
                  '⌨️ Comando relacionado',

                value:
                  unbanCommand
                    ? `\`!${unbanCommand}\``
                    : 'Ação direta / não identificada',

                inline: true
              },

              {
                name:
                  '🧭 Origem do desbanimento',

                value:
                  unbanOrigin,

                inline: true
              },

              {
                name:
                  '📩 Notificação ao usuário',

                value:
                  dmDelivered
                    ? '✅ DM enviada com sucesso'
                    : '⚠️ Não foi possível entregar a DM',

                inline: true
              },

              {
                name:
                  '📝 Motivo do desbanimento',

                value:
                  truncateText(
                    unbanReason
                  ),

                inline: false
              },

              {
                name:
                  '🔨 Banimento anterior executado por',

                value:
                  truncateText(
                    originalExecutorText
                  ),

                inline: true
              },

              {
                name:
                  '👮 Banimento anterior solicitado por',

                value:
                  truncateText(
                    originalRequesterText
                  ),

                inline: true
              },

              {
                name:
                  '⏳ Tempo total banido',

                value:
                  `**${banDuration}**`,

                inline: true
              },

              {
                name:
                  '📄 Motivo do banimento anterior',

                value:
                  truncateText(
                    originalReason
                  ),

                inline: false
              },

              {
                name:
                  '🔨 Banido em',

                value:
                  originalBanTimestamp
                    ? `${formatDate(
                        originalBanTimestamp
                      )}\n🕒 ${formatTime(
                        originalBanTimestamp
                      )}`
                    : 'Não localizado',

                inline: true
              },

              {
                name:
                  '✅ Desbanido em',

                value:
                  `${formatDate(
                    unbanTimestamp
                  )}\n🕒 ${formatTime(
                    unbanTimestamp
                  )}`,

                inline: true
              },

              {
                name:
                  '🔎 Auditoria',

                value:
                  [
                    `**Ban:** ${
                      cachedBanData
                        ?.auditLogId ||
                      previousBanEntry?.id
                        ? `\`${
                            cachedBanData
                              ?.auditLogId ||
                            previousBanEntry
                              ?.id
                          }\``
                        : 'Não localizada'
                    }`,

                    `**Unban:** ${
                      unbanEntry?.id
                        ? `\`${unbanEntry.id}\``
                        : 'Não localizada'
                    }`
                  ].join('\n'),

                inline: true
              }
            )

            .setFooter({
              text:
                `Santa Creators • Sistema de Moderação • Usuário ${user.id}`,

              iconURL:
                unbanExecutor
                  ?.displayAvatarURL({
                    size: 128
                  }) ||
                guildLogo ||
                undefined
            })

            .setTimestamp(
              unbanTimestamp
            );

        await sendModerationLog({
          client,
          guild,
          centralChannelId:
            CENTRAL_LOG_UNBAN_ID,
          embed
        });

        /*
         * Depois do desbanimento o registro em memória
         * não é mais necessário.
         */
        banHistoryCache.delete(
          banHistoryKey
        );
      } catch (error) {
        console.error(
          '[ERRO] Falha no log de unban:',
          error
        );
      }
    }
  );
}