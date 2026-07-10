// events/memberFlowDashboard.js — discord.js v14 + MongoDB (ESM)

import mongoose from 'mongoose';

import {
  ActionRowBuilder,
  AuditLogEvent,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  PermissionsBitField,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';

// =====================================================
// CONFIGURAÇÃO
// =====================================================

const GUILD_ID = '1262262852782129183';

const DASHBOARD_CHANNEL_ID = '1525216613672947773';

const ENTRY_CHANNEL_IDS = [
  '1362651746866036837',
  '1352493047140847627',
  '1262262852949905411',
];

const EXIT_CHANNEL_IDS = [
  '1352491049452568646',
  '1262262852949905411',
];

const DASHBOARD_COLOR = '#ff009a';

const UPDATE_INTERVAL_MS = 15 * 60 * 1000;

const IMPORT_DELAY_MS = 850;

const DUPLICATE_WINDOW_MS = 5 * 60 * 1000;

const STATE_KEY = `${GUILD_ID}:${DASHBOARD_CHANNEL_ID}`;

// =====================================================
// IDs DOS BOTÕES E MODAL
// =====================================================

const CUSTOM_IDS = {
  previous: 'memberflow:previous:',
  next: 'memberflow:next:',
  current: 'memberflow:current',
  choose: 'memberflow:choose',
  total: 'memberflow:total',
  refresh: 'memberflow:refresh:',
  modal: 'memberflow:modal',
};

// =====================================================
// BANCO DE DADOS
// =====================================================

const memberFlowEventSchema = new mongoose.Schema(
  {
    guildId: {
      type: String,
      required: true,
      index: true,
    },

    userId: {
      type: String,
      required: true,
      index: true,
    },

    type: {
      type: String,
      required: true,
      enum: [
        'join',
        'leave',
        'kick',
        'ban',
      ],
      index: true,
    },

    occurredAt: {
      type: Date,
      required: true,
      index: true,
    },

    source: {
      type: String,
      required: true,
    },

    sourceChannelId: {
      type: String,
      default: null,
    },

    sourceMessageId: {
      type: String,
      default: null,
    },

    eventKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    displayName: {
      type: String,
      default: null,
    },

    reason: {
      type: String,
      default: null,
    },

    executorId: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

memberFlowEventSchema.index({
  guildId: 1,
  userId: 1,
  type: 1,
  occurredAt: 1,
});

const memberFlowStateSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    dashboardMessageId: {
      type: String,
      default: null,
    },

    historyImported: {
      type: Boolean,
      default: false,
    },

    lastUpdateAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

const MemberFlowEvent =
  mongoose.models.MemberFlowEvent ||
  mongoose.model(
    'MemberFlowEvent',
    memberFlowEventSchema,
    'member_flow_events',
  );

const MemberFlowState =
  mongoose.models.MemberFlowState ||
  mongoose.model(
    'MemberFlowState',
    memberFlowStateSchema,
    'member_flow_states',
  );

// =====================================================
// ESTADO LOCAL
// =====================================================

let readyPromise = null;

let dashboardUpdating = false;

let historyImportRunning = false;

let refreshTimeout = null;

let updateInterval = null;

// =====================================================
// HELPERS
// =====================================================

function sleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function formatNumber(value) {
  return new Intl.NumberFormat('pt-BR').format(
    Number(value || 0),
  );
}

function formatPercent(value) {
  const safeValue =
    Number.isFinite(value)
      ? value
      : 0;

  return `${safeValue.toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

function getCurrentMonthKey() {
  return getMonthKeyFromDate(new Date());
}

function getMonthKeyFromDate(date) {
  const year = date.getUTCFullYear();

  const month = String(
    date.getUTCMonth() + 1,
  ).padStart(2, '0');

  return `${year}-${month}`;
}

function parseMonthKey(monthKey) {
  const match = /^(\d{4})-(\d{2})$/.exec(
    String(monthKey || ''),
  );

  if (!match) {
    return null;
  }

  const year = Number(match[1]);

  const month = Number(match[2]);

  if (
    year < 2015 ||
    year > 2200 ||
    month < 1 ||
    month > 12
  ) {
    return null;
  }

  return {
    year,
    month,
  };
}

function parseMonthInput(input) {
  const value = String(input || '')
    .trim()
    .replace(/\s+/g, '');

  let match = /^(\d{1,2})[/-](\d{4})$/.exec(
    value,
  );

  if (match) {
    const month = Number(match[1]);

    const year = Number(match[2]);

    if (
      month >= 1 &&
      month <= 12 &&
      year >= 2015 &&
      year <= 2200
    ) {
      return `${year}-${String(month).padStart(2, '0')}`;
    }
  }

  match = /^(\d{4})[/-](\d{1,2})$/.exec(
    value,
  );

  if (match) {
    const year = Number(match[1]);

    const month = Number(match[2]);

    if (
      month >= 1 &&
      month <= 12 &&
      year >= 2015 &&
      year <= 2200
    ) {
      return `${year}-${String(month).padStart(2, '0')}`;
    }
  }

  return null;
}

function getMonthRange(monthKey) {
  const parsed = parseMonthKey(monthKey);

  if (!parsed) {
    throw new Error(
      `Mês inválido: ${monthKey}`,
    );
  }

  const start = new Date(
    Date.UTC(
      parsed.year,
      parsed.month - 1,
      1,
      0,
      0,
      0,
      0,
    ),
  );

  const end = new Date(
    Date.UTC(
      parsed.year,
      parsed.month,
      1,
      0,
      0,
      0,
      0,
    ),
  );

  return {
    start,
    end,
  };
}

function shiftMonth(monthKey, amount) {
  const {
    start,
  } = getMonthRange(monthKey);

  const shiftedDate = new Date(
    Date.UTC(
      start.getUTCFullYear(),
      start.getUTCMonth() + amount,
      1,
    ),
  );

  return getMonthKeyFromDate(
    shiftedDate,
  );
}

function getMonthLabel(monthKey) {
  const {
    start,
  } = getMonthRange(monthKey);

  const label = new Intl.DateTimeFormat(
    'pt-BR',
    {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    },
  ).format(start);

  return (
    label.charAt(0).toUpperCase() +
    label.slice(1)
  );
}

function calculateVariation(current, previous) {
  const currentValue = Number(current || 0);

  const previousValue = Number(previous || 0);

  if (previousValue === 0) {
    return currentValue === 0
      ? 0
      : 100;
  }

  return (
    (
      currentValue -
      previousValue
    ) /
    previousValue
  ) * 100;
}

function formatComparison(current, previous) {
  const difference =
    Number(current || 0) -
    Number(previous || 0);

  const variation =
    calculateVariation(
      current,
      previous,
    );

  const differenceSign =
    difference > 0
      ? '+'
      : '';

  const variationSign =
    variation > 0
      ? '+'
      : '';

  return (
    `${differenceSign}${formatNumber(difference)}` +
    ` (${variationSign}${formatPercent(variation)})`
  );
}

function getMessageText(message) {
  const pieces = [
    message.content || '',
  ];

  for (
    const embed
    of message.embeds || []
  ) {
    pieces.push(
      embed.title || '',
    );

    pieces.push(
      embed.description || '',
    );

    pieces.push(
      embed.author?.name || '',
    );

    pieces.push(
      embed.footer?.text || '',
    );

    for (
      const field
      of embed.fields || []
    ) {
      pieces.push(
        field.name || '',
      );

      pieces.push(
        field.value || '',
      );
    }
  }

  return pieces.join('\n');
}

function extractUserId(text) {
  const source = String(
    text || '',
  );

  const explicitId =
    /(?:ID(?:\s+do)?\s+usu[aá]rio|usu[aá]rio\s*ID)\D{0,30}(\d{16,22})/i.exec(
      source,
    );

  if (explicitId) {
    return explicitId[1];
  }

  const mention =
    /<@!?(\d{16,22})>/.exec(
      source,
    );

  if (mention) {
    return mention[1];
  }

  return null;
}

function detectEventType(
  text,
  fallbackType,
) {
  const normalizedText =
    String(text || '')
      .toLowerCase();

  if (
    normalizedText.includes(
      'banido',
    ) ||
    normalizedText.includes(
      'banida',
    )
  ) {
    return 'ban';
  }

  if (
    normalizedText.includes(
      'expulso',
    ) ||
    normalizedText.includes(
      'expulsa',
    ) ||
    normalizedText.includes(
      'kick',
    )
  ) {
    return 'kick';
  }

  if (
    normalizedText.includes(
      'saiu do servidor',
    ) ||
    normalizedText.includes(
      'registro de saída',
    ) ||
    normalizedText.includes(
      'registro de saida',
    )
  ) {
    return 'leave';
  }

  if (
    normalizedText.includes(
      'entrou no servidor',
    ) ||
    normalizedText.includes(
      'novo membro entrou',
    ) ||
    normalizedText.includes(
      'bem-vindo',
    ) ||
    normalizedText.includes(
      'bem vindo',
    )
  ) {
    return 'join';
  }

  return fallbackType;
}

function createEventKey(data) {
  if (data.sourceMessageId) {
    const group =
      data.type === 'join'
        ? 'join'
        : 'exit';

    return (
      `${data.guildId}:` +
      `${data.sourceMessageId}:` +
      `${data.userId}:` +
      `${group}`
    );
  }

  const minute = Math.floor(
    new Date(
      data.occurredAt,
    ).getTime() / 60000,
  );

  const group =
    data.type === 'join'
      ? 'join'
      : 'exit';

  return (
    `${data.guildId}:` +
    `${data.userId}:` +
    `${group}:` +
    `${minute}`
  );
}

// =====================================================
// REGISTRO E PROTEÇÃO CONTRA DUPLICAÇÃO
// =====================================================

async function saveMemberEvent(data) {
  if (
    !data ||
    data.guildId !== GUILD_ID ||
    !data.userId ||
    !data.type
  ) {
    return false;
  }

  const occurredAt = new Date(
    data.occurredAt ||
    Date.now(),
  );

  const typesToSearch =
    data.type === 'join'
      ? [
          'join',
        ]
      : [
          'leave',
          'kick',
          'ban',
        ];

  const nearbyEvent =
    await MemberFlowEvent.findOne({
      guildId: GUILD_ID,

      userId: data.userId,

      type: {
        $in: typesToSearch,
      },

      occurredAt: {
        $gte: new Date(
          occurredAt.getTime() -
          DUPLICATE_WINDOW_MS,
        ),

        $lte: new Date(
          occurredAt.getTime() +
          DUPLICATE_WINDOW_MS,
        ),
      },
    });

  if (nearbyEvent) {
    if (
      nearbyEvent.type === 'leave' &&
      [
        'kick',
        'ban',
      ].includes(data.type)
    ) {
      nearbyEvent.type =
        data.type;

      nearbyEvent.reason =
        data.reason ||
        nearbyEvent.reason;

      nearbyEvent.executorId =
        data.executorId ||
        nearbyEvent.executorId;

      await nearbyEvent.save();
    }

    return false;
  }

  try {
    await MemberFlowEvent.create({
      ...data,

      occurredAt,

      eventKey:
        createEventKey({
          ...data,
          occurredAt,
        }),
    });

    return true;
  } catch (error) {
    if (error?.code === 11000) {
      return false;
    }

    throw error;
  }
}

// =====================================================
// AUDITORIA DE SAÍDAS
// =====================================================

async function detectRemovalReason(
  guild,
  userId,
) {
  const fallback = {
    type: 'leave',
    reason: null,
    executorId: null,
  };

  try {
    const botMember =
      guild.members.me;

    if (
      !botMember?.permissions.has(
        PermissionsBitField.Flags.ViewAuditLog,
      )
    ) {
      return fallback;
    }

    await sleep(1200);

    const auditLogs =
      await guild.fetchAuditLogs({
        limit: 20,
      }).catch(() => null);

    if (!auditLogs) {
      return fallback;
    }

    const now = Date.now();

    const entry =
      auditLogs.entries.find(
        (auditEntry) => {
          const supportedAction =
            auditEntry.action ===
              AuditLogEvent.MemberKick ||
            auditEntry.action ===
              AuditLogEvent.MemberBanAdd;

          const sameUser =
            auditEntry.target?.id ===
            userId;

          const recent =
            now -
              auditEntry.createdTimestamp <=
            10 * 60 * 1000;

          return (
            supportedAction &&
            sameUser &&
            recent
          );
        },
      );

    if (!entry) {
      return fallback;
    }

    return {
      type:
        entry.action ===
        AuditLogEvent.MemberBanAdd
          ? 'ban'
          : 'kick',

      reason:
        entry.reason ||
        null,

      executorId:
        entry.executor?.id ||
        null,
    };
  } catch (error) {
    console.error(
      '[MEMBER_FLOW] Erro ao consultar auditoria:',
      error,
    );

    return fallback;
  }
}

// =====================================================
// ENTRADAS EM TEMPO REAL
// =====================================================

export async function memberFlowHandleGuildMemberAdd(
  member,
) {
  try {
    if (
      member.guild?.id !==
      GUILD_ID
    ) {
      return false;
    }

    if (member.user?.bot) {
      return false;
    }

    await saveMemberEvent({
      guildId: GUILD_ID,

      userId: member.id,

      type: 'join',

      occurredAt:
        member.joinedAt ||
        new Date(),

      source: 'live',

      sourceChannelId: null,

      sourceMessageId: null,

      displayName:
        member.displayName ||
        member.user?.globalName ||
        member.user?.username ||
        null,
    });

    scheduleDashboardRefresh(
      member.client,
    );

    return true;
  } catch (error) {
    console.error(
      '[MEMBER_FLOW] Erro ao registrar entrada:',
      error,
    );

    return false;
  }
}

// =====================================================
// SAÍDAS EM TEMPO REAL
// =====================================================

export async function memberFlowHandleGuildMemberRemove(
  member,
) {
  try {
    if (
      member.guild?.id !==
      GUILD_ID
    ) {
      return false;
    }

    if (member.user?.bot) {
      return false;
    }

    const removal =
      await detectRemovalReason(
        member.guild,
        member.id,
      );

    await saveMemberEvent({
      guildId: GUILD_ID,

      userId: member.id,

      type: removal.type,

      occurredAt:
        new Date(),

      source:
        removal.type === 'leave'
          ? 'live'
          : 'audit_log',

      sourceChannelId: null,

      sourceMessageId: null,

      displayName:
        member.displayName ||
        member.user?.globalName ||
        member.user?.username ||
        null,

      reason:
        removal.reason,

      executorId:
        removal.executorId,
    });

    scheduleDashboardRefresh(
      member.client,
    );

    return true;
  } catch (error) {
    console.error(
      '[MEMBER_FLOW] Erro ao registrar saída:',
      error,
    );

    return false;
  }
}

// =====================================================
// LEITURA DOS CANAIS ANTIGOS
// =====================================================

async function getTextChannel(
  client,
  channelId,
) {
  const channel =
    client.channels.cache.get(
      channelId,
    ) ||
    await client.channels.fetch(
      channelId,
    ).catch(() => null);

  if (
    !channel ||
    !channel.isTextBased() ||
    !channel.messages
  ) {
    return null;
  }

  return channel;
}

function parseHistoryMessage(
  message,
  expectedKind,
) {
  const completeText =
    getMessageText(message);

  const eventType =
    detectEventType(
      completeText,

      expectedKind === 'entry'
        ? 'join'
        : 'leave',
    );

  if (
    expectedKind === 'entry' &&
    eventType !== 'join'
  ) {
    return null;
  }

  if (
    expectedKind === 'exit' &&
    eventType === 'join'
  ) {
    return null;
  }

  const userId =
    extractUserId(
      completeText,
    );

  if (!userId) {
    return null;
  }

  if (
    userId ===
    message.client.user?.id
  ) {
    return null;
  }

  /*
   * Nos canais compartilhados, quando o log contém explicitamente
   * outro servidor, ele é ignorado.
   */

  const guildIdMatch =
    /(?:servidor|guild)(?:\s+ID)?\D{0,30}(\d{16,22})/i.exec(
      completeText,
    );

  if (
    guildIdMatch &&
    guildIdMatch[1] !==
      GUILD_ID
  ) {
    return null;
  }

  return {
    guildId: GUILD_ID,

    userId,

    type: eventType,

    occurredAt:
      message.createdAt,

    source:
      'log_channel',

    sourceChannelId:
      message.channelId,

    sourceMessageId:
      message.id,

    displayName: null,

    reason: null,

    executorId: null,
  };
}

async function importChannelHistory(
  client,
  channelId,
  expectedKind,
  sinceDate = null,
) {
  const channel =
    await getTextChannel(
      client,
      channelId,
    );

  if (!channel) {
    console.warn(
      `[MEMBER_FLOW] Canal não encontrado ou sem acesso: ${channelId}`,
    );

    return {
      scanned: 0,
      imported: 0,
    };
  }

  let beforeMessageId;

  let scanned = 0;

  let imported = 0;

  while (true) {
    const page =
      await channel.messages.fetch({
        limit: 100,

        ...(
          beforeMessageId
            ? {
                before:
                  beforeMessageId,
              }
            : {}
        ),
      }).catch(() => null);

    if (
      !page ||
      page.size === 0
    ) {
      break;
    }

    const messages =
      [
        ...page.values(),
      ].sort(
        (first, second) =>
          second.createdTimestamp -
          first.createdTimestamp,
      );

    let mustStop = false;

    for (
      const message
      of messages
    ) {
      scanned += 1;

      if (
        sinceDate &&
        message.createdAt <
          sinceDate
      ) {
        mustStop = true;

        break;
      }

      const parsed =
        parseHistoryMessage(
          message,
          expectedKind,
        );

      if (!parsed) {
        continue;
      }

      const inserted =
        await saveMemberEvent(
          parsed,
        );

      if (inserted) {
        imported += 1;
      }
    }

    beforeMessageId =
      messages[
        messages.length - 1
      ]?.id;

    if (
      mustStop ||
      page.size < 100
    ) {
      break;
    }

    await sleep(
      IMPORT_DELAY_MS,
    );
  }

  return {
    scanned,
    imported,
  };
}

async function importCompleteHistory(
  client,
) {
  if (historyImportRunning) {
    return;
  }

  historyImportRunning = true;

  try {
    const state =
      await MemberFlowState.findOneAndUpdate(
        {
          key: STATE_KEY,
        },

        {
          $setOnInsert: {
            key: STATE_KEY,
          },
        },

        {
          upsert: true,
          new: true,
        },
      );

    /*
     * Na primeira execução lê todo o histórico disponível.
     * Nas próximas execuções revisa apenas as últimas 48 horas.
     */

    const sinceDate =
      state.historyImported
        ? new Date(
            Date.now() -
            48 * 60 * 60 * 1000,
          )
        : null;

    let totalScanned = 0;

    let totalImported = 0;

    for (
      const channelId
      of ENTRY_CHANNEL_IDS
    ) {
      const result =
        await importChannelHistory(
          client,
          channelId,
          'entry',
          sinceDate,
        );

      totalScanned +=
        result.scanned;

      totalImported +=
        result.imported;

      await updatePublicDashboard(
        client,

        `Importando histórico • ${formatNumber(totalScanned)} mensagens analisadas`,
      ).catch(() => {});
    }

    for (
      const channelId
      of EXIT_CHANNEL_IDS
    ) {
      const result =
        await importChannelHistory(
          client,
          channelId,
          'exit',
          sinceDate,
        );

      totalScanned +=
        result.scanned;

      totalImported +=
        result.imported;

      await updatePublicDashboard(
        client,

        `Importando histórico • ${formatNumber(totalScanned)} mensagens analisadas`,
      ).catch(() => {});
    }

    await MemberFlowState.updateOne(
      {
        key: STATE_KEY,
      },

      {
        $set: {
          historyImported: true,

          lastUpdateAt:
            new Date(),
        },
      },

      {
        upsert: true,
      },
    );

    console.log(
      `[MEMBER_FLOW] Histórico concluído. Mensagens analisadas: ${totalScanned} | Registros novos: ${totalImported}`,
    );
  } catch (error) {
    console.error(
      '[MEMBER_FLOW] Erro ao importar histórico:',
      error,
    );
  } finally {
    historyImportRunning = false;

    await updatePublicDashboard(
      client,
    ).catch(() => {});
  }
}

// =====================================================
// MÉTRICAS BÁSICAS
// =====================================================

async function getBasicMetrics(
  startDate,
  endDate,
) {
  const rows =
    await MemberFlowEvent.aggregate([
      {
        $match: {
          guildId: GUILD_ID,

          occurredAt: {
            $gte: startDate,
            $lt: endDate,
          },
        },
      },

      {
        $group: {
          _id: '$type',

          count: {
            $sum: 1,
          },

          users: {
            $addToSet:
              '$userId',
          },
        },
      },
    ]);

  const result = {
    joins: 0,

    leaves: 0,

    kicks: 0,

    bans: 0,

    exits: 0,

    uniqueJoinUsers: 0,

    uniqueExitUsers: 0,

    netBalance: 0,
  };

  const uniqueExitUsers =
    new Set();

  for (
    const row
    of rows
  ) {
    if (
      row._id === 'join'
    ) {
      result.joins =
        row.count;

      result.uniqueJoinUsers =
        row.users.length;
    }

    if (
      row._id === 'leave'
    ) {
      result.leaves =
        row.count;
    }

    if (
      row._id === 'kick'
    ) {
      result.kicks =
        row.count;
    }

    if (
      row._id === 'ban'
    ) {
      result.bans =
        row.count;
    }

    if (
      [
        'leave',
        'kick',
        'ban',
      ].includes(row._id)
    ) {
      for (
        const userId
        of row.users
      ) {
        uniqueExitUsers.add(
          userId,
        );
      }
    }
  }

  result.exits =
    result.leaves +
    result.kicks +
    result.bans;

  result.uniqueExitUsers =
    uniqueExitUsers.size;

  result.netBalance =
    result.joins -
    result.exits;

  return result;
}

async function getReturnsInRange(
  startDate,
  endDate,
) {
  const joins =
    await MemberFlowEvent.find({
      guildId: GUILD_ID,

      type: 'join',

      occurredAt: {
        $gte: startDate,
        $lt: endDate,
      },
    })
      .select({
        userId: 1,
        occurredAt: 1,
      })
      .lean();

  let returnEvents = 0;

  const returnedUsers =
    new Set();

  for (
    const join
    of joins
  ) {
    const previousExit =
      await MemberFlowEvent.exists({
        guildId: GUILD_ID,

        userId:
          join.userId,

        type: {
          $in: [
            'leave',
            'kick',
            'ban',
          ],
        },

        occurredAt: {
          $lt:
            join.occurredAt,
        },
      });

    if (previousExit) {
      returnEvents += 1;

      returnedUsers.add(
        join.userId,
      );
    }
  }

  return {
    returnEvents,

    returnedUsers:
      returnedUsers.size,
  };
}

async function getMonthMetrics(
  selectedMonthKey,
) {
  const currentRange =
    getMonthRange(
      selectedMonthKey,
    );

  const previousMonthKey =
    shiftMonth(
      selectedMonthKey,
      -1,
    );

  const previousRange =
    getMonthRange(
      previousMonthKey,
    );

  const [
    current,
    previous,
    currentReturns,
    previousReturns,
  ] = await Promise.all([
    getBasicMetrics(
      currentRange.start,
      currentRange.end,
    ),

    getBasicMetrics(
      previousRange.start,
      previousRange.end,
    ),

    getReturnsInRange(
      currentRange.start,
      currentRange.end,
    ),

    getReturnsInRange(
      previousRange.start,
      previousRange.end,
    ),
  ]);

  current.returnEvents =
    currentReturns.returnEvents;

  current.returnedUsers =
    currentReturns.returnedUsers;

  current.returnRate =
    current.uniqueExitUsers > 0
      ? (
          current.returnedUsers /
          current.uniqueExitUsers
        ) * 100
      : 0;

  current.banRate =
    current.exits > 0
      ? (
          current.bans /
          current.exits
        ) * 100
      : 0;

  previous.returnEvents =
    previousReturns.returnEvents;

  previous.returnedUsers =
    previousReturns.returnedUsers;

  previous.returnRate =
    previous.uniqueExitUsers > 0
      ? (
          previous.returnedUsers /
          previous.uniqueExitUsers
        ) * 100
      : 0;

  previous.banRate =
    previous.exits > 0
      ? (
          previous.bans /
          previous.exits
        ) * 100
      : 0;

  return {
    selectedMonthKey,

    previousMonthKey,

    current,

    previous,
  };
}

// =====================================================
// TOTAL HISTÓRICO
// =====================================================

async function getAllTimeMetrics() {
  const allEvents =
    await MemberFlowEvent.find({
      guildId: GUILD_ID,
    })
      .sort({
        occurredAt: 1,
      })
      .lean();

  const uniqueJoinUsers =
    new Set();

  const uniqueExitUsers =
    new Set();

  const usersWithExit =
    new Set();

  const returnedUsers =
    new Set();

  let joins = 0;

  let leaves = 0;

  let kicks = 0;

  let bans = 0;

  for (
    const event
    of allEvents
  ) {
    if (
      event.type === 'join'
    ) {
      joins += 1;

      uniqueJoinUsers.add(
        event.userId,
      );

      if (
        usersWithExit.has(
          event.userId,
        )
      ) {
        returnedUsers.add(
          event.userId,
        );
      }
    } else {
      uniqueExitUsers.add(
        event.userId,
      );

      usersWithExit.add(
        event.userId,
      );

      if (
        event.type === 'leave'
      ) {
        leaves += 1;
      }

      if (
        event.type === 'kick'
      ) {
        kicks += 1;
      }

      if (
        event.type === 'ban'
      ) {
        bans += 1;
      }
    }
  }

  const exits =
    leaves +
    kicks +
    bans;

  const returnRate =
    uniqueExitUsers.size > 0
      ? (
          returnedUsers.size /
          uniqueExitUsers.size
        ) * 100
      : 0;

  const banRate =
    exits > 0
      ? (
          bans /
          exits
        ) * 100
      : 0;

  return {
    joins,

    leaves,

    kicks,

    bans,

    exits,

    uniqueJoinUsers:
      uniqueJoinUsers.size,

    uniqueExitUsers:
      uniqueExitUsers.size,

    returnedUsers:
      returnedUsers.size,

    returnRate,

    banRate,

    firstRecord:
      allEvents[0]?.occurredAt ||
      null,

    lastRecord:
      allEvents[
        allEvents.length - 1
      ]?.occurredAt ||
      null,
  };
}

// =====================================================
// GRÁFICO POR URL
// =====================================================

async function createChartUrl(
  selectedMonthKey,
) {
  const labels = [];

  const entries = [];

  const exits = [];

  const returns = [];

  const bans = [];

  for (
    let monthOffset = 5;
    monthOffset >= 0;
    monthOffset -= 1
  ) {
    const currentKey =
      shiftMonth(
        selectedMonthKey,
        -monthOffset,
      );

    const range =
      getMonthRange(
        currentKey,
      );

    const basic =
      await getBasicMetrics(
        range.start,
        range.end,
      );

    const returnData =
      await getReturnsInRange(
        range.start,
        range.end,
      );

    const monthOnly =
      getMonthLabel(
        currentKey,
      ).split(' de ')[0];

    labels.push(
      monthOnly,
    );

    entries.push(
      basic.joins,
    );

    exits.push(
      basic.exits,
    );

    returns.push(
      returnData.returnEvents,
    );

    bans.push(
      basic.bans,
    );
  }

  const chartConfig = {
    type: 'bar',

    data: {
      labels,

      datasets: [
        {
          label: 'Entradas',

          data: entries,

          backgroundColor:
            '#39d98a',
        },

        {
          label: 'Saídas',

          data: exits,

          backgroundColor:
            '#ff5c77',
        },

        {
          label: 'Retornos',

          data: returns,

          backgroundColor:
            '#9b8cff',
        },

        {
          label: 'Banimentos',

          data: bans,

          backgroundColor:
            '#ffb84d',
        },
      ],
    },

    options: {
      responsive: true,

      plugins: {
        title: {
          display: true,

          text:
            'Fluxo de membros — SantaCreators',

          color:
            '#ffffff',

          font: {
            size: 22,
          },
        },

        legend: {
          labels: {
            color:
              '#ffffff',
          },
        },
      },

      scales: {
        x: {
          ticks: {
            color:
              '#ffffff',
          },

          grid: {
            color:
              'rgba(255,255,255,0.10)',
          },
        },

        y: {
          beginAtZero: true,

          ticks: {
            color:
              '#ffffff',

            precision: 0,
          },

          grid: {
            color:
              'rgba(255,255,255,0.10)',
          },
        },
      },
    },
  };

  const encodedConfig =
    encodeURIComponent(
      JSON.stringify(
        chartConfig,
      ),
    );

  return (
    'https://quickchart.io/chart' +
    '?width=1400' +
    '&height=760' +
    '&backgroundColor=%2316001f' +
    `&c=${encodedConfig}`
  );
}

// =====================================================
// BOTÕES
// =====================================================

function createButtons(
  selectedMonthKey,
) {
  const nextMonthKey =
    shiftMonth(
      selectedMonthKey,
      1,
    );

  const currentMonthKey =
    getCurrentMonthKey();

  const firstRow =
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            `${CUSTOM_IDS.previous}${selectedMonthKey}`,
          )
          .setLabel(
            'Mês anterior',
          )
          .setEmoji('⬅️')
          .setStyle(
            ButtonStyle.Secondary,
          ),

        new ButtonBuilder()
          .setCustomId(
            `${CUSTOM_IDS.next}${selectedMonthKey}`,
          )
          .setLabel(
            'Próximo mês',
          )
          .setEmoji('➡️')
          .setStyle(
            ButtonStyle.Secondary,
          )
          .setDisabled(
            nextMonthKey >
              currentMonthKey,
          ),

        new ButtonBuilder()
          .setCustomId(
            CUSTOM_IDS.current,
          )
          .setLabel(
            'Mês atual',
          )
          .setEmoji('📅')
          .setStyle(
            ButtonStyle.Primary,
          )
          .setDisabled(
            selectedMonthKey ===
              currentMonthKey,
          ),
      );

  const secondRow =
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            CUSTOM_IDS.choose,
          )
          .setLabel(
            'Escolher mês e ano',
          )
          .setEmoji('🔎')
          .setStyle(
            ButtonStyle.Primary,
          ),

        new ButtonBuilder()
          .setCustomId(
            CUSTOM_IDS.total,
          )
          .setLabel(
            'Total histórico',
          )
          .setEmoji('📊')
          .setStyle(
            ButtonStyle.Success,
          ),

        new ButtonBuilder()
          .setCustomId(
            `${CUSTOM_IDS.refresh}${selectedMonthKey}`,
          )
          .setLabel(
            'Atualizar',
          )
          .setEmoji('🔄')
          .setStyle(
            ButtonStyle.Secondary,
          ),
      );

  return [
    firstRow,
    secondRow,
  ];
}

// =====================================================
// PAYLOAD MENSAL
// =====================================================

async function createMonthPayload(
  selectedMonthKey,
  extraFooter = null,
) {
  const metrics =
    await getMonthMetrics(
      selectedMonthKey,
    );

  const chartUrl =
    await createChartUrl(
      selectedMonthKey,
    );

  const current =
    metrics.current;

  const previous =
    metrics.previous;

  const embed =
    new EmbedBuilder()
      .setColor(
        DASHBOARD_COLOR,
      )

      .setAuthor({
        name:
          'SantaCreators • Movimento de membros',
      })

      .setTitle(
        `📊 Relatório de ${getMonthLabel(selectedMonthKey)}`,
      )

      .setDescription(
        [
          'Dados exclusivos do servidor principal.',

          `Servidor analisado: \`${GUILD_ID}\``,

          '',

          `**Saldo do mês:** ${
            current.netBalance >= 0
              ? '+'
              : ''
          }${formatNumber(current.netBalance)}`,

          `**Comparação:** ${getMonthLabel(metrics.previousMonthKey)}`,
        ].join('\n'),
      )

      .addFields(
        {
          name:
            '📥 Entradas no mês',

          value:
            `**${formatNumber(current.joins)}** entradas\n` +
            `**${formatNumber(current.uniqueJoinUsers)}** pessoas únicas\n` +
            `Comparado ao mês anterior: **${formatComparison(current.joins, previous.joins)}**`,

          inline: true,
        },

        {
          name:
            '📤 Saídas no mês',

          value:
            `**${formatNumber(current.exits)}** saídas\n` +
            `**${formatNumber(current.uniqueExitUsers)}** pessoas únicas\n` +
            `Comparado ao mês anterior: **${formatComparison(current.exits, previous.exits)}**`,

          inline: true,
        },

        {
          name:
            '🔁 Retornos no mês',

          value:
            `**${formatNumber(current.returnEvents)}** retornos registrados\n` +
            `**${formatNumber(current.returnedUsers)}** pessoas retornaram\n` +
            `Comparado ao mês anterior: **${formatComparison(current.returnEvents, previous.returnEvents)}**`,

          inline: true,
        },

        {
          name:
            '💗 Taxa de retorno',

          value:
            `**${formatPercent(current.returnRate)}**\n` +
            `${formatNumber(current.returnedUsers)} retornaram entre ` +
            `${formatNumber(current.uniqueExitUsers)} pessoas únicas que saíram.\n` +
            `Mês anterior: **${formatPercent(previous.returnRate)}**`,

          inline: true,
        },

        {
          name:
            '⛔ Banimentos',

          value:
            `**${formatNumber(current.bans)}** banimentos\n` +
            `Representam **${formatPercent(current.banRate)}** das saídas.\n` +
            `Mês anterior: **${formatNumber(previous.bans)}**`,

          inline: true,
        },

        {
          name:
            '🥾 Expulsões e saídas comuns',

          value:
            `Expulsões: **${formatNumber(current.kicks)}**\n` +
            `Saídas comuns: **${formatNumber(current.leaves)}**\n` +
            `Expulsões no mês anterior: **${formatNumber(previous.kicks)}**`,

          inline: true,
        },
      )

      .setImage(
        chartUrl,
      )

      .setFooter({
        text: [
          'Atualização automática a cada 15 minutos',

          historyImportRunning
            ? 'importação histórica em andamento'
            : null,

          extraFooter,
        ]
          .filter(Boolean)
          .join(' • '),
      })

      .setTimestamp();

  return {
    embeds: [
      embed,
    ],

    components:
      createButtons(
        selectedMonthKey,
      ),
  };
}

// =====================================================
// PAYLOAD TOTAL HISTÓRICO
// =====================================================

async function createTotalPayload() {
  const total =
    await getAllTimeMetrics();

  const firstRecordText =
    total.firstRecord
      ? `<t:${Math.floor(
          new Date(
            total.firstRecord,
          ).getTime() / 1000,
        )}:D>`
      : 'Nenhum registro';

  const lastRecordText =
    total.lastRecord
      ? `<t:${Math.floor(
          new Date(
            total.lastRecord,
          ).getTime() / 1000,
        )}:R>`
      : 'Nenhum registro';

  const embed =
    new EmbedBuilder()
      .setColor(
        '#9b8cff',
      )

      .setTitle(
        '📚 Total histórico de membros',
      )

      .setDescription(
        [
          'Contagem baseada nos registros encontrados nos canais e nos novos eventos salvos pelo bot.',

          '',

          `Primeiro registro encontrado: **${firstRecordText}**`,

          `Registro mais recente: **${lastRecordText}**`,
        ].join('\n'),
      )

      .addFields(
        {
          name:
            '👥 Pessoas únicas que já entraram',

          value:
            `**${formatNumber(total.uniqueJoinUsers)}** pessoas`,

          inline: true,
        },

        {
          name:
            '📥 Entradas registradas',

          value:
            `**${formatNumber(total.joins)}** eventos`,

          inline: true,
        },

        {
          name:
            '📤 Saídas registradas',

          value:
            `**${formatNumber(total.exits)}** eventos`,

          inline: true,
        },

        {
          name:
            '🔁 Pessoas que saíram e retornaram',

          value:
            `**${formatNumber(total.returnedUsers)}** pessoas\n` +
            `Taxa histórica: **${formatPercent(total.returnRate)}**`,

          inline: true,
        },

        {
          name:
            '⛔ Banimentos',

          value:
            `**${formatNumber(total.bans)}** banimentos\n` +
            `**${formatPercent(total.banRate)}** de todas as saídas`,

          inline: true,
        },

        {
          name:
            '🥾 Expulsões e saídas comuns',

          value:
            `Expulsões: **${formatNumber(total.kicks)}**\n` +
            `Saídas comuns: **${formatNumber(total.leaves)}**`,

          inline: true,
        },
      )

      .setFooter({
        text:
          historyImportRunning
            ? 'A importação histórica ainda está em andamento.'
            : 'Histórico salvo permanentemente no MongoDB.',
      })

      .setTimestamp();

  return {
    embeds: [
      embed,
    ],

    components:
      createButtons(
        getCurrentMonthKey(),
      ),
  };
}

// =====================================================
// MENSAGEM PÚBLICA DO DASHBOARD
// =====================================================

async function getOrCreateDashboardMessage(
  client,
) {
  const channel =
    await getTextChannel(
      client,
      DASHBOARD_CHANNEL_ID,
    );

  if (!channel) {
    throw new Error(
      `Canal do dashboard não encontrado ou inacessível: ${DASHBOARD_CHANNEL_ID}`,
    );
  }

  const state =
    await MemberFlowState.findOneAndUpdate(
      {
        key: STATE_KEY,
      },

      {
        $setOnInsert: {
          key: STATE_KEY,
        },
      },

      {
        upsert: true,
        new: true,
      },
    );

  if (
    state.dashboardMessageId
  ) {
    const savedMessage =
      await channel.messages.fetch(
        state.dashboardMessageId,
      ).catch(() => null);

    if (
      savedMessage?.author?.id ===
      client.user.id
    ) {
      return savedMessage;
    }
  }

  const recentMessages =
    await channel.messages.fetch({
      limit: 50,
    }).catch(() => null);

  const existingMessage =
    recentMessages?.find(
      (message) =>
        message.author?.id ===
          client.user.id &&
        message.components?.some(
          (row) =>
            row.components?.some(
              (component) =>
                String(
                  component.customId ||
                  '',
                ).startsWith(
                  'memberflow:',
                ),
            ),
        ),
    );

  if (existingMessage) {
    await MemberFlowState.updateOne(
      {
        key: STATE_KEY,
      },

      {
        $set: {
          dashboardMessageId:
            existingMessage.id,
        },
      },
    );

    return existingMessage;
  }

  const createdMessage =
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(
            DASHBOARD_COLOR,
          )
          .setTitle(
            '📊 Preparando painel de membros...',
          )
          .setDescription(
            'Aguarde alguns segundos.',
          ),
      ],
    });

  await MemberFlowState.updateOne(
    {
      key: STATE_KEY,
    },

    {
      $set: {
        dashboardMessageId:
          createdMessage.id,
      },
    },

    {
      upsert: true,
    },
  );

  return createdMessage;
}

export async function updatePublicDashboard(
  client,
  extraFooter = null,
) {
  if (dashboardUpdating) {
    return false;
  }

  dashboardUpdating = true;

  try {
    const dashboardMessage =
      await getOrCreateDashboardMessage(
        client,
      );

    const payload =
      await createMonthPayload(
        getCurrentMonthKey(),
        extraFooter,
      );

    await dashboardMessage.edit(
      payload,
    );

    await MemberFlowState.updateOne(
      {
        key: STATE_KEY,
      },

      {
        $set: {
          dashboardMessageId:
            dashboardMessage.id,

          lastUpdateAt:
            new Date(),
        },
      },

      {
        upsert: true,
      },
    );

    return true;
  } catch (error) {
    console.error(
      '[MEMBER_FLOW] Erro ao atualizar dashboard:',
      error,
    );

    return false;
  } finally {
    dashboardUpdating = false;
  }
}

function scheduleDashboardRefresh(
  client,
) {
  if (refreshTimeout) {
    return;
  }

  refreshTimeout =
    setTimeout(
      async () => {
        refreshTimeout = null;

        await updatePublicDashboard(
          client,
        ).catch(() => {});
      },

      5000,
    );
}

// =====================================================
// MODAL DE ESCOLHA DE DATA
// =====================================================

function createMonthModal() {
  const input =
    new TextInputBuilder()
      .setCustomId(
        'month',
      )
      .setLabel(
        'Mês e ano',
      )
      .setPlaceholder(
        'Exemplo: 07/2026',
      )
      .setStyle(
        TextInputStyle.Short,
      )
      .setRequired(
        true,
      )
      .setMinLength(
        6,
      )
      .setMaxLength(
        7,
      );

  return new ModalBuilder()
    .setCustomId(
      CUSTOM_IDS.modal,
    )
    .setTitle(
      'Escolher período',
    )
    .addComponents(
      new ActionRowBuilder()
        .addComponents(
          input,
        ),
    );
}

// =====================================================
// INTERAÇÕES
// =====================================================

export async function memberFlowHandleInteraction(
  interaction,
  client,
) {
  try {
    if (
      interaction.isButton()
    ) {
      const customId =
        interaction.customId ||
        '';

      if (
        !customId.startsWith(
          'memberflow:',
        )
      ) {
        return false;
      }

      if (
        customId ===
        CUSTOM_IDS.choose
      ) {
        await interaction.showModal(
          createMonthModal(),
        );

        return true;
      }

      await interaction.deferReply({
        ephemeral: true,
      });

      if (
        customId ===
        CUSTOM_IDS.total
      ) {
        await interaction.editReply(
          await createTotalPayload(),
        );

        return true;
      }

      if (
        customId ===
        CUSTOM_IDS.current
      ) {
        await interaction.editReply(
          await createMonthPayload(
            getCurrentMonthKey(),
          ),
        );

        return true;
      }

      if (
        customId.startsWith(
          CUSTOM_IDS.previous,
        )
      ) {
        const baseMonthKey =
          customId.slice(
            CUSTOM_IDS.previous.length,
          ) ||
          getCurrentMonthKey();

        const previousMonthKey =
          shiftMonth(
            baseMonthKey,
            -1,
          );

        await interaction.editReply(
          await createMonthPayload(
            previousMonthKey,
          ),
        );

        return true;
      }

      if (
        customId.startsWith(
          CUSTOM_IDS.next,
        )
      ) {
        const baseMonthKey =
          customId.slice(
            CUSTOM_IDS.next.length,
          ) ||
          getCurrentMonthKey();

        const requestedMonthKey =
          shiftMonth(
            baseMonthKey,
            1,
          );

        const safeMonthKey =
          requestedMonthKey >
          getCurrentMonthKey()
            ? getCurrentMonthKey()
            : requestedMonthKey;

        await interaction.editReply(
          await createMonthPayload(
            safeMonthKey,
          ),
        );

        return true;
      }

      if (
        customId.startsWith(
          CUSTOM_IDS.refresh,
        )
      ) {
        const selectedMonthKey =
          customId.slice(
            CUSTOM_IDS.refresh.length,
          ) ||
          getCurrentMonthKey();

        if (
          selectedMonthKey ===
          getCurrentMonthKey()
        ) {
          await updatePublicDashboard(
            client,
          );
        }

        await interaction.editReply(
          await createMonthPayload(
            selectedMonthKey,
          ),
        );

        return true;
      }

      await interaction.editReply({
        content:
          '❌ Esse botão não foi reconhecido.',
      });

      return true;
    }

    if (
      interaction.isModalSubmit() &&
      interaction.customId ===
        CUSTOM_IDS.modal
    ) {
      await interaction.deferReply({
        ephemeral: true,
      });

      const rawValue =
        interaction.fields.getTextInputValue(
          'month',
        );

      const selectedMonthKey =
        parseMonthInput(
          rawValue,
        );

      if (!selectedMonthKey) {
        await interaction.editReply({
          content:
            '❌ Data inválida. Use `MM/AAAA`, por exemplo: `07/2026`.',
        });

        return true;
      }

      if (
        selectedMonthKey >
        getCurrentMonthKey()
      ) {
        await interaction.editReply({
          content:
            '❌ Não é possível consultar um mês futuro.',
        });

        return true;
      }

      await interaction.editReply(
        await createMonthPayload(
          selectedMonthKey,
        ),
      );

      return true;
    }

    return false;
  } catch (error) {
    console.error(
      '[MEMBER_FLOW] Erro na interação:',
      error,
    );

    const errorPayload = {
      content:
        '❌ Não consegui carregar o relatório agora. Tente novamente.',
    };

    if (
      interaction.deferred ||
      interaction.replied
    ) {
      await interaction.editReply(
        errorPayload,
      ).catch(() => {});
    } else {
      await interaction.reply({
        ...errorPayload,

        ephemeral: true,
      }).catch(() => {});
    }

    return true;
  }
}

// =====================================================
// COMANDO MANUAL
// =====================================================

export async function memberFlowHandleMessage(
  message,
  client,
) {
  if (
    !message ||
    message.author?.bot
  ) {
    return false;
  }

  const command =
    String(
      message.content ||
      '',
    )
      .trim()
      .toLowerCase();

  const validCommands = [
    '!fluxomembros',
    '!graficomembros',
    '!recriarfluxomembros',
  ];

  if (
    !validCommands.includes(
      command,
    )
  ) {
    return false;
  }

  if (
    message.guild?.id !==
    GUILD_ID
  ) {
    await message.reply(
      '❌ Esse painel pertence somente ao servidor principal.',
    );

    return true;
  }

  const statusMessage =
    await message.reply(
      '⏳ Atualizando o painel de membros...',
    );

  const success =
    await updatePublicDashboard(
      client,
    );

  await statusMessage.edit(
    success
      ? `✅ Painel atualizado em <#${DASHBOARD_CHANNEL_ID}>.`
      : '❌ Não consegui atualizar o painel. Confira o console do bot.',
  ).catch(() => {});

  return true;
}

// =====================================================
// INICIALIZAÇÃO
// =====================================================

export async function memberFlowDashboardOnReady(
  client,
) {
  if (readyPromise) {
    return readyPromise;
  }

  readyPromise =
    (
      async () => {
        try {
          const guild =
            client.guilds.cache.get(
              GUILD_ID,
            ) ||
            await client.guilds.fetch(
              GUILD_ID,
            ).catch(() => null);

          if (!guild) {
            throw new Error(
              `Servidor não encontrado: ${GUILD_ID}`,
            );
          }

          await MemberFlowState.findOneAndUpdate(
            {
              key: STATE_KEY,
            },

            {
              $setOnInsert: {
                key: STATE_KEY,
              },
            },

            {
              upsert: true,
            },
          );

          await updatePublicDashboard(
            client,
          );

          /*
           * Aguarda cinco segundos para o bot terminar as outras inicializações
           * e começa a importação histórica em segundo plano.
           */

          setTimeout(
            () => {
              importCompleteHistory(
                client,
              ).catch(
                (error) => {
                  console.error(
                    '[MEMBER_FLOW] Falha na importação histórica:',
                    error,
                  );
                },
              );
            },

            5000,
          );

          if (!updateInterval) {
            updateInterval =
              setInterval(
                () => {
                  updatePublicDashboard(
                    client,
                  ).catch(() => {});
                },

                UPDATE_INTERVAL_MS,
              );

            updateInterval.unref?.();
          }

          console.log(
            `[MEMBER_FLOW] Dashboard iniciado no canal ${DASHBOARD_CHANNEL_ID}.`,
          );
        } catch (error) {
          console.error(
            '[MEMBER_FLOW] Erro ao iniciar:',
            error,
          );
        }
      }
    )();

  return readyPromise;
}