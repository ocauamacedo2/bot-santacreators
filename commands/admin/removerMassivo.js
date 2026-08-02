// /application/commands/admin/removerMassivo.js
// ✅ COMANDOS:
// • !remover @Cargo       -> remove somente o cargo informado (fluxo antigo preservado)
// • !removergeral @Cargo  -> limpa cargos, normaliza nomes, corrige WL e gera log completo
// • ESM / discord.js v14

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';

const LOG_CHANNEL_ID = '1423088696835571804';
const REVIEW_CHANNEL_ID = '1518707314901651576';

const CITIZEN_ROLE_ID = '1262978759922028575';
const NO_WL_ROLE_ID = '1430984036972494908';
const BOOST_ROLE_ID = '1262823861658058752';

// Quem PODE USAR o !remover antigo
const ALLOWED_USER_IDS = ['660311795327828008'];

const ALLOWED_ROLE_IDS = [
  '1262262852949905408', // OWNER
  '1352408327983861844'  // RESP CREATOR
];

// Quem PODE USAR o !removergeral
const GENERAL_ALLOWED_USER_IDS = [
  '660311795327828008'
];

const GENERAL_ALLOWED_ROLE_IDS = [
  '1262262852949905408', // OWNER
  '1352408327983861844', // RESP CREATORS
  '1262262852949905409'  // RESP INFLU
];

// Quem pode usar o botão/modal de correção de nome/WL
const REVIEW_ALLOWED_USER_IDS = [
  '660311795327828008'
];

const REVIEW_ALLOWED_ROLE_IDS = [
  '1352493359897378941', // SÊNIOR CREATOR
  '1262262852949905408', // OWNER
  '1352408327983861844', // RESP CREATORS
  '1262262852949905409', // RESP INFLU
  '1352407252216184833'  // RESP LÍDER
];

// Quem NUNCA PERDE o cargo-alvo no !remover antigo
const PROTECTED_USER_IDS = [
  '660311795327828008'
];

const PROTECTED_ROLE_IDS = [
  '1262262852949905408', // OWNER
  '1352408327983861844'  // RESP CREATOR
];

// Cargos comuns que o !removergeral sempre mantém
const GENERAL_KEEP_ROLE_IDS = [
  '1417599555100344381',
  '1419024042173665282',
  '1368422245193617518',
  '1519925668329033880',
  '1368416640412160100'
];

// Somente estes dois cargos podem ser usados como alvo do !removergeral
const GENERAL_TARGET_CONFIGS = new Map([
  [
    '1353858422063239310',
    {
      label: 'remoção geral padrão',
      extraKeepRoleIds: []
    }
  ],
  [
    '1353151740362625055',
    {
      label: 'remoção geral de líderes',
      extraKeepRoleIds: [
        '1423354185570586694',
        '1500677281864093746',
        '1500676778337763438',
        '1500669528479371268',
        '1418691103397253322',
        '1379021994678288465',
        '1379021805544804382',
        '1379021888709464168'
      ]
    }
  ]
]);

// Categorias onde ficam os canais de tickets
const TICKET_CATEGORY_IDS = new Set([
  '1414687963161559180',
  '1428572742051168378',
  '1482874296685695118'
]);

const CONFIRM_TTL_MS = 12_000;
const SMALL_DELAY_MS = 350;
const STATUS_UPDATE_EVERY = 1;

// Impede atualizar o painel rápido demais e tomar rate limit
const GENERAL_STATUS_MIN_INTERVAL_MS = 1_500;

// Apaga o painel 10 minutos depois da finalização
const GENERAL_FINAL_DELETE_MS = 10 * 60 * 1000;

// Solicitação de correção expira após 7 dias
const REVIEW_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const TZ = 'America/Sao_Paulo';

// Lock do comando antigo por servidor + cargo
globalThis.__SC_REMOVE_ROLE_LOCK ??= new Map();

// Lock do !removergeral por servidor
globalThis.__SC_REMOVE_GENERAL_LOCK ??= new Map();

// Armazena temporariamente solicitações de correção por botão/modal
globalThis.__SC_REMOVE_GENERAL_REVIEWS ??= new Map();

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/*
 * Executa uma Promise com tempo máximo.
 *
 * Isso impede que o comando fique travado indefinidamente
 * enquanto aguarda o Discord entregar todos os membros.
 */
async function withTimeout(promise, milliseconds) {
  let timeoutId;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        new Error(
          `MEMBER_FETCH_TIMEOUT_${milliseconds}`
        )
      );
    }, milliseconds);
  });

  try {
    return await Promise.race([
      promise,
      timeoutPromise
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

/*
 * Carrega todos os membros do servidor antes da limpeza.
 *
 * O !removergeral não pode trabalhar com cache parcial,
 * porque isso faria apenas parte das pessoas ser processada.
 */
async function fetchAllGuildMembersForGeneral(
  guild,
  timeoutMs = 30_000
) {
  const cachedBefore =
    guild.members.cache.size;

  const expectedTotal =
    guild.memberCount ??
    cachedBefore;

  /*
   * Se o cache já possui todos os membros conhecidos
   * pelo servidor, não precisa fazer outra requisição.
   */
  if (
    expectedTotal > 0 &&
    cachedBefore >= expectedTotal
  ) {
    return {
      success: true,
      complete: true,
      cachedBefore,
      cachedAfter: cachedBefore,
      expectedTotal,
      reason: null
    };
  }

  try {
    /*
     * Sem query e sem limit:
     * solicita todos os membros pelo Gateway.
     *
     * Para funcionar corretamente, o bot precisa possuir
     * o Server Members Intent ativado.
     */
    await withTimeout(
      guild.members.fetch({
        withPresences: false
      }),
      timeoutMs
    );
  } catch (error) {
    const errorText =
      String(
        error?.message ||
        error ||
        ''
      ).toLowerCase();

    const cachedAfterError =
      guild.members.cache.size;

    if (
      errorText.includes('missing intents') ||
      errorText.includes('privileged intent') ||
      errorText.includes('guild_members')
    ) {
      return {
        success: false,
        complete: false,
        cachedBefore,
        cachedAfter: cachedAfterError,
        expectedTotal,
        reason: 'MISSING_MEMBERS_INTENT',
        error
      };
    }

    if (
      errorText.includes('member_fetch_timeout')
    ) {
      return {
        success: false,
        complete:
          expectedTotal > 0 &&
          cachedAfterError >= expectedTotal,
        cachedBefore,
        cachedAfter: cachedAfterError,
        expectedTotal,
        reason: 'TIMEOUT',
        error
      };
    }

    return {
      success: false,
      complete:
        expectedTotal > 0 &&
        cachedAfterError >= expectedTotal,
      cachedBefore,
      cachedAfter: cachedAfterError,
      expectedTotal,
      reason: 'FETCH_ERROR',
      error
    };
  }

  const cachedAfter =
    guild.members.cache.size;

  /*
   * A busca só será considerada completa quando
   * o cache possuir pelo menos a quantidade informada
   * pelo memberCount do servidor.
   */
  const complete =
    expectedTotal === 0 ||
    cachedAfter >= expectedTotal;

  return {
    success: complete,
    complete,
    cachedBefore,
    cachedAfter,
    expectedTotal,
    reason:
      complete
        ? null
        : 'PARTIAL_CACHE'
  };
}

/*
 * Coleta todos os membros que possuem o cargo informado.
 *
 * Essa função deve ser utilizada somente depois de
 * fetchAllGuildMembersForGeneral confirmar o cache completo.
 */
function getAllMembersWithRoleFromCache(
  guild,
  roleId
) {
  return guild.members.cache.filter((member) => {
    return member.roles.cache.has(roleId);
  });
}

function hasPermissionToUse(message) {
  if (!message?.member) return false;

  if (ALLOWED_USER_IDS.includes(message.author.id)) {
    return true;
  }

  return message.member.roles.cache.some((role) => {
    return ALLOWED_ROLE_IDS.includes(role.id);
  });
}

function hasPermissionToUseGeneral(message) {
  if (!message?.member) return false;

  if (GENERAL_ALLOWED_USER_IDS.includes(message.author.id)) {
    return true;
  }

  return message.member.roles.cache.some((role) => {
    return GENERAL_ALLOWED_ROLE_IDS.includes(role.id);
  });
}

function hasPermissionToReview(interaction) {
  if (!interaction?.member) return false;

  if (REVIEW_ALLOWED_USER_IDS.includes(interaction.user.id)) {
    return true;
  }

  const roleIds = interaction.member.roles?.cache
    ? Array.from(interaction.member.roles.cache.keys())
    : Array.isArray(interaction.member.roles)
      ? interaction.member.roles
      : [];

  return roleIds.some((roleId) => {
    return REVIEW_ALLOWED_ROLE_IDS.includes(roleId);
  });
}

function pickRoleFromArgs(message, args) {
  // 1. Tenta pegar o cargo por menção: <@&ID>
  const mentioned = message.mentions?.roles?.first?.();

  if (mentioned) {
    return mentioned;
  }

  // 2. Tenta pegar o cargo por ID puro
  const id = (args[0] || '').replace(/[<@&>]/g, '');

  if (/^\d{17,20}$/.test(id)) {
    return message.guild.roles.cache.get(id) || null;
  }

  // 3. Tenta localizar pelo nome exato do cargo
  if (args.length) {
    const name = args.join(' ').toLowerCase();

    return message.guild.roles.cache.find((role) => {
      return role.name.toLowerCase() === name;
    }) || null;
  }

  return null;
}

function roleEditableByBot(me, role) {
  // O bot só consegue alterar cargos abaixo do cargo mais alto dele.
  return role.comparePositionTo(me.roles.highest) < 0;
}

function roleIsRemovableByBot(me, role) {
  if (!role) {
    return false;
  }

  // Nunca tenta remover o @everyone.
  if (role.id === role.guild.id) {
    return false;
  }

  // Nunca tenta remover cargos gerenciados pelo Discord.
  // Isso inclui boost, cargos de bots e cargos de integrações.
  if (role.managed) {
    return false;
  }

  return roleEditableByBot(me, role);
}

function cleanText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasNumericIdAfterPipe(name) {
  const parts = cleanText(name)
    .split('|')
    .map((part) => cleanText(part))
    .filter(Boolean);

  if (parts.length < 2) {
    return false;
  }

  const finalPart = parts.at(-1);

  return /\d/.test(finalPart);
}

function analyzeMemberName(member) {
  const nickname = cleanText(member.nickname);

  /*
   * O membro não possui apelido configurado no servidor.
   *
   * Nesse caso:
   * - todos os cargos removíveis serão retirados;
   * - Cidadão também será retirado;
   * - Sem WL será aplicado.
   */
  if (!nickname) {
    return {
      type: 'NO_SERVER_NAME',
      original: member.user.username,
      currentNickname: null,
      finalNickname: null,
      hasId: false,
      needsNicknameChange: false
    };
  }

  const parts = nickname
    .split('|')
    .map((part) => cleanText(part))
    .filter(Boolean);

  const lastPartHasId =
    parts.length >= 2 &&
    /\d/.test(parts.at(-1));

  /*
   * Formato:
   *
   * LD | Rodney | 123
   *
   * Resultado:
   *
   * Rodney | 123
   */
  if (parts.length >= 3 && lastPartHasId) {
    const nameParts = parts.slice(1, -1);
    const idPart = parts.at(-1);

    const finalNickname =
      `${nameParts.join(' | ')} | ${idPart}`;

    return {
      type: 'CITY_NAME_ID',
      original: nickname,
      currentNickname: nickname,
      finalNickname,
      hasId: true,
      needsNicknameChange: finalNickname !== nickname
    };
  }

  /*
   * Formato:
   *
   * Rodney | 123
   *
   * Já está correto e será mantido.
   */
  if (parts.length === 2 && lastPartHasId) {
    return {
      type: 'NAME_ID',
      original: nickname,
      currentNickname: nickname,
      finalNickname: nickname,
      hasId: true,
      needsNicknameChange: false
    };
  }

  /*
   * Formato:
   *
   * LD | Rodney
   *
   * Não possui ID depois do último |.
   * Conforme solicitado, será mantido como está.
   */
  if (parts.length >= 2 && !lastPartHasId) {
    return {
      type: 'CITY_NAME_NO_ID',
      original: nickname,
      currentNickname: nickname,
      finalNickname: nickname,
      hasId: false,
      needsNicknameChange: false
    };
  }

  /*
   * Formato:
   *
   * Rodney
   *
   * Possui apenas um nome simples.
   * Será enviada uma solicitação para o canal de revisão.
   */
  return {
    type: 'PLAIN_NAME',
    original: nickname,
    currentNickname: nickname,
    finalNickname: nickname,
    hasId: false,
    needsNicknameChange: false
  };
}

function roleSnapshot(member) {
  return member.roles.cache
    .filter((role) => {
      return role.id !== member.guild.id;
    })
    .sort((firstRole, secondRole) => {
      return secondRole.position - firstRole.position;
    })
    .map((role) => {
      return {
        id: role.id,
        name: role.name,
        managed: role.managed
      };
    });
}

function formatRoleSnapshot(roles) {
  if (!roles?.length) {
    return 'Nenhum cargo além de @everyone';
  }

  return roles
    .map((role) => {
      const managedText = role.managed
        ? ' [GERENCIADO]'
        : '';

      return `${role.name} (${role.id})${managedText}`;
    })
    .join(', ');
}

function buildGeneralKeepSet(config) {
  return new Set([
    CITIZEN_ROLE_ID,
    BOOST_ROLE_ID,
    ...GENERAL_KEEP_ROLE_IDS,
    ...(config?.extraKeepRoleIds || [])
  ]);
}

function makeReviewKey(guildId, memberId, nonce) {
  return `${guildId}:${memberId}:${nonce}`;
}

function createNonce() {
  const timestampPart = Date.now().toString(36);
  const randomPart = Math.random()
    .toString(36)
    .slice(2, 8);

  return `${timestampPart}${randomPart}`;
}

async function sendTemp(channel, payload, ttl = CONFIRM_TTL_MS) {
  try {
    const msg = await channel.send(payload);
    setTimeout(() => msg.delete().catch(() => {}), ttl);
    return msg;
  } catch {
    return null;
  }
}

async function getMembersWithRoleOnly(guild, role) {
  const byRoleCache = role.members?.filter((m) => m.roles.cache.has(role.id));

  if (byRoleCache && byRoleCache.size > 0) {
    return byRoleCache;
  }

  const byGuildCache = guild.members.cache.filter((m) => {
    return m.roles.cache.has(role.id);
  });

  return byGuildCache;
}

async function editStatus(statusMsg, {
  color = 0x3498db,
  title = '⏳ Remoção em andamento',
  role,
  authorId,
  candidatesTotal = 0,
  targetsTotal = 0,
  processed = 0,
  removed = 0,
  skippedProtected = 0,
  failed = 0,
  extra = ''
}) {
  if (!statusMsg) return;

  await statusMsg.edit({
    embeds: [
      {
        color,
        title,
        description:
          `Alvo: ${role}\n` +
          `Solicitado por: <@${authorId}>\n\n` +
          `👥 Encontrados com o cargo: **${candidatesTotal}**\n` +
          `🎯 Válidos para remoção: **${targetsTotal}**\n` +
          `📊 Processados: **${processed}/${targetsTotal}**\n` +
          `✅ Removidos: **${removed}**\n` +
          `🛡️ Protegidos: **${skippedProtected}**\n` +
          `❌ Falhas: **${failed}**` +
          `${extra ? `\n\n${extra}` : ''}`,
        footer: { text: 'SantaCreators • Remoção massiva em tempo real' },
        timestamp: new Date().toISOString()
      }
    ]
  }).catch(() => null);
}

async function editGeneralStatus(statusMsg, data, force = false) {
  if (!statusMsg) {
    return;
  }

  const now = Date.now();

  if (
    !force &&
    now - (data.lastStatusEditAt || 0) < GENERAL_STATUS_MIN_INTERVAL_MS
  ) {
    return;
  }

  data.lastStatusEditAt = now;

  const currentMemberText = data.currentMemberId
    ? `<@${data.currentMemberId}> \`${data.currentMemberId}\``
    : 'Aguardando...';

  const steps = [
    `${data.phaseIndex >= 1 ? '✅' : '⬜'} Localizando membros`,
    `${data.phaseIndex >= 2
      ? '✅'
      : data.phaseIndex === 1
        ? '🔄'
        : '⬜'} Conferindo nomes e IDs`,
    `${data.phaseIndex >= 3
      ? '✅'
      : data.phaseIndex === 2
        ? '🔄'
        : '⬜'} Aplicando/removendo cargos`,
    `${data.phaseIndex >= 4
      ? '✅'
      : data.phaseIndex === 3
        ? '🔄'
        : '⬜'} Registrando revisões de WL`,
    `${data.phaseIndex >= 5
      ? '✅'
      : data.phaseIndex === 4
        ? '🔄'
        : '⬜'} Salvando logs completos`
  ].join('\n');

  await statusMsg.edit({
    embeds: [
      {
        color: data.color ?? 0x3498db,
        title:
          data.title ??
          '🧠 Remover Geral • processamento inteligente',
        description:
          `**Cargo-alvo:** <@&${data.targetRoleId}> \`${data.targetRoleId}\`\n` +
          `**Executor:** <@${data.authorId}>\n\n` +
          `${steps}\n\n` +
          `**Membro atual:** ${currentMemberText}\n` +
          `**Progresso:** \`${data.processed}/${data.total}\`\n` +
          `**Alterados:** \`${data.changed}\`\n` +
          `**Sem nome → Sem WL:** \`${data.noName}\`\n` +
          `**Revisões enviadas:** \`${data.reviewSent}\`\n` +
          `**WL bugada detectada:** \`${data.wlBugged}\`\n` +
          `**Falhas:** \`${data.failed}\`` +
          `${data.extra ? `\n\n${data.extra}` : ''}`,
        footer: {
          text: data.finished
            ? 'Finalizado • este painel será apagado automaticamente em 10 minutos'
            : 'SantaCreators • processo sendo atualizado automaticamente'
        },
        timestamp: new Date().toISOString()
      }
    ],
    components: []
  }).catch(() => null);
}

async function discoverTicketRoleIds(guild) {
  const ids = new Set();

  for (const categoryId of TICKET_CATEGORY_IDS) {
    const category = guild.channels.cache.get(categoryId);

    if (!category?.children?.cache) {
      continue;
    }

    for (const channel of category.children.cache.values()) {
      const normalizedChannelName = cleanText(channel.name)
        .toLowerCase();

      if (!normalizedChannelName) {
        continue;
      }

      const exactRole = guild.roles.cache.find((role) => {
        const normalizedRoleName = cleanText(role.name)
          .toLowerCase();

        return normalizedRoleName === normalizedChannelName;
      });

      if (exactRole) {
        ids.add(exactRole.id);
      }
    }
  }

  return ids;
}

async function sendReviewRequest(
  client,
  member,
  reason,
  sourceContext
) {
  const reviewChannel = await client.channels
    .fetch(REVIEW_CHANNEL_ID)
    .catch(() => null);

  if (!reviewChannel?.isTextBased?.()) {
    return {
      sent: false,
      reason: 'Canal de revisão indisponível'
    };
  }

  const nonce = createNonce();

  const key = makeReviewKey(
    member.guild.id,
    member.id,
    nonce
  );

  const beforeRoles = roleSnapshot(member);

  globalThis.__SC_REMOVE_GENERAL_REVIEWS.set(key, {
    guildId: member.guild.id,
    memberId: member.id,
    nonce,
    reason,
    sourceChannelId: sourceContext.channelId,
    executorId: sourceContext.executorId,
    createdAt: Date.now(),
    used: false
  });

  setTimeout(() => {
    const item =
      globalThis.__SC_REMOVE_GENERAL_REVIEWS.get(key);

    if (item && !item.used) {
      globalThis.__SC_REMOVE_GENERAL_REVIEWS.delete(key);
    }
  }, REVIEW_TTL_MS);

  const button = new ButtonBuilder()
    .setCustomId(`rg_fix:${member.id}:${nonce}`)
    .setLabel(
      reason === 'WL_BUG'
        ? 'Corrigir nome e WL'
        : 'Informar Nome | ID'
    )
    .setEmoji('🛠️')
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder()
    .addComponents(button);

  const sent = await reviewChannel.send({
    content: `<@${member.id}>`,
    allowedMentions: {
      users: [member.id]
    },
    embeds: [
      {
        color:
          reason === 'WL_BUG'
            ? 0xe67e22
            : 0xf1c40f,
        title:
          reason === 'WL_BUG'
            ? '⚠️ WL bugada detectada'
            : '🪪 Nome/ID precisa de conferência',
        description:
          `**Membro:** <@${member.id}> \`${member.id}\`\n` +
          `**Nome atual:** \`${member.nickname || member.user.username}\`\n` +
          `**Motivo:** ${
            reason === 'WL_BUG'
              ? 'O membro está ao mesmo tempo com **Cidadão** e **Sem WL**.'
              : 'O membro possui apenas um nome simples e precisa receber o formato **Nome | ID**.'
          }\n\n` +
          'Use o botão abaixo. Apenas a equipe autorizada consegue abrir e concluir a correção.',
        fields: [
          {
            name: 'Cargos atuais',
            value:
              `\`${formatRoleSnapshot(beforeRoles).slice(0, 1000)}\``
          },
          {
            name: 'Origem do processo',
            value:
              `<#${sourceContext.channelId}> • executor <@${sourceContext.executorId}>`
          }
        ],
        footer: {
          text:
            'Após uma correção válida, este botão será bloqueado definitivamente.'
        },
        timestamp: new Date().toISOString()
      }
    ],
    components: [row]
  }).catch(() => null);

  if (!sent) {
    globalThis.__SC_REMOVE_GENERAL_REVIEWS.delete(key);

    return {
      sent: false,
      reason: 'Falha ao enviar a mensagem'
    };
  }

  return {
    sent: true,
    messageId: sent.id,
    nonce
  };
}

function splitUtf8Text(text, maxBytes = 7_000_000) {
  const lines = String(text).split('\n');
  const chunks = [];

  let current = '';

  for (const line of lines) {
    const candidate = current
      ? `${current}\n${line}`
      : line;

    if (
      Buffer.byteLength(candidate, 'utf8') > maxBytes &&
      current
    ) {
      chunks.push(current);
      current = line;
    } else {
      current = candidate;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

async function sendGeneralLogs(
  client,
  message,
  role,
  startedAt,
  stats,
  details
) {
  const logs = await client.channels
    .fetch(LOG_CHANNEL_ID)
    .catch(() => null);

  if (!logs?.isTextBased?.()) {
    return;
  }

  const elapsed = Date.now() - startedAt;

  const header = `REMOVER GERAL — LOG COMPLETO
Servidor: ${message.guild.name} (${message.guild.id})
Canal de origem: #${message.channel?.name || 'desconhecido'} (${message.channel.id})
Executor: ${message.author.tag} (${message.author.id})
Cargo-alvo: ${role.name} (${role.id})
Comando: ${message.content}
Data/Hora BR: ${new Date().toLocaleString('pt-BR', {
    timeZone: TZ
  })}
Duração: ${(elapsed / 1000).toFixed(1)}s

TOTAIS
Encontrados: ${stats.total}
Processados: ${stats.processed}
Alterados: ${stats.changed}
Sem nome -> Sem WL: ${stats.noName}
Revisões enviadas: ${stats.reviewSent}
WL bugada: ${stats.wlBugged}
Falhas: ${stats.failed}

`;

  const body = details
    .map((item, index) => {
      return `================ MEMBRO ${index + 1} ================
Usuário: ${item.userTag} (${item.memberId})
Menção: <@${item.memberId}>
Resultado: ${item.result}
Nome antes: ${item.nameBefore || 'SEM APELIDO NO SERVIDOR'}
Nome depois: ${item.nameAfter || 'SEM APELIDO NO SERVIDOR'}
Tipo de nome: ${item.nameType}
Tinha ID após |: ${item.hadId ? 'SIM' : 'NÃO'}
Cargos antes: ${formatRoleSnapshot(item.rolesBefore)}
Cargos removidos: ${formatRoleSnapshot(item.rolesRemoved)}
Cargos adicionados: ${formatRoleSnapshot(item.rolesAdded)}
Cargos mantidos/depois: ${formatRoleSnapshot(item.rolesAfter)}
Ticket/cargo relacionado detectado: ${item.ticketRoleDetected ? 'SIM' : 'NÃO'}
Revisão enviada: ${item.reviewSent ? 'SIM' : 'NÃO'}
Erro: ${item.error || '—'}
`;
    })
    .join('\n');

  const chunks = splitUtf8Text(header + body);

  const files = chunks
    .slice(0, 10)
    .map((chunk, index) => {
      return {
        attachment: Buffer.from(chunk, 'utf8'),
        name:
          `removergeral_${role.id}_${Date.now()}_parte-${index + 1}.txt`
      };
    });

  const embed = {
    color:
      stats.failed > 0
        ? 0xe67e22
        : 0x2ecc71,
    title: '🧠 Remover Geral • log completo',
    author: {
      name: message.author.tag,
      icon_url:
        message.author.displayAvatarURL?.({
          size: 128
        })
    },
    thumbnail: {
      url: message.guild.iconURL?.({
        size: 128
      })
    },
    fields: [
      {
        name: 'Cargo-alvo',
        value: `${role} \`${role.id}\``,
        inline: true
      },
      {
        name: 'Executor',
        value: `<@${message.author.id}>`,
        inline: true
      },
      {
        name: 'Canal',
        value: `<#${message.channel.id}>`,
        inline: true
      },
      {
        name: 'Encontrados',
        value: String(stats.total),
        inline: true
      },
      {
        name: 'Alterados',
        value: String(stats.changed),
        inline: true
      },
      {
        name: 'Sem nome → Sem WL',
        value: String(stats.noName),
        inline: true
      },
      {
        name: 'Revisões',
        value: String(stats.reviewSent),
        inline: true
      },
      {
        name: 'WL bugada',
        value: String(stats.wlBugged),
        inline: true
      },
      {
        name: 'Falhas',
        value: String(stats.failed),
        inline: true
      },
      {
        name: 'Duração',
        value: `${(elapsed / 1000).toFixed(1)}s`,
        inline: true
      },
      {
        name: 'Arquivos',
        value:
          chunks.length <= 10
            ? `Log integral dividido em **${chunks.length}** arquivo(s), sem cortar os registros.`
            : 'O log ultrapassou 10 anexos. Os 10 primeiros arquivos foram enviados.'
      }
    ],
    timestamp: new Date().toISOString()
  };

  await logs.send({
    embeds: [embed],
    files
  }).catch(() => {});
}

async function runRemoveGeneral(
  message,
  client,
  role
) {
  const startedAt = Date.now();

  const config =
    GENERAL_TARGET_CONFIGS.get(role.id);

  /*
   * Segurança:
   * somente os dois cargos configurados podem ser usados
   * como alvo do !removergeral.
   */
  if (!config) {
    const allowedTargets = Array
      .from(GENERAL_TARGET_CONFIGS.keys())
      .map((roleId) => `<@&${roleId}>`)
      .join(' ');

    await sendTemp(message.channel, {
      content:
        '❌ Esse cargo não está autorizado como alvo do `!removergeral`.\n\n' +
        `Cargos permitidos: ${allowedTargets}`
    });

    return true;
  }

  const me =
    message.guild.members.me ||
    await message.guild.members
      .fetch(client.user.id)
      .catch(() => null);

  if (!me) {
    await sendTemp(message.channel, {
      content:
        '❌ Não consegui identificar o usuário do bot no servidor.'
    });

    return true;
  }

  /*
   * O bot precisa conseguir:
   *
   * - remover e adicionar cargos;
   * - trocar os apelidos dos membros.
   */
  if (
    !me.permissions.has('ManageRoles') ||
    !me.permissions.has('ManageNicknames')
  ) {
    await sendTemp(message.channel, {
      content:
        '❌ Para executar o `!removergeral`, preciso das permissões:\n\n' +
        '• **Gerenciar Cargos**\n' +
        '• **Gerenciar Apelidos**'
    });

    return true;
  }

  /*
   * Apenas um !removergeral pode executar por servidor.
   */
  const lockKey = message.guild.id;

  if (
    globalThis.__SC_REMOVE_GENERAL_LOCK.get(lockKey)
  ) {
    await sendTemp(message.channel, {
      content:
        '⏳ Já existe um `!removergeral` em andamento neste servidor.'
    });

    return true;
  }

  globalThis.__SC_REMOVE_GENERAL_LOCK.set(
    lockKey,
    true
  );

  /*
   * Apaga a mensagem original do comando.
   */
  message.delete().catch(() => {});

  const statusMsg =
    await message.channel.send({
      embeds: [
        {
          color: 0x9b59b6,
          title:
            '🧠 Remover Geral • preparando inteligência de limpeza',
          description:
            `**Cargo-alvo:** ${role} \`${role.id}\`\n` +
            `**Modo:** ${config.label}\n` +
            `**Executor:** <@${message.author.id}>\n\n` +
            '🔄 Carregando membros, cargos, nomes e regras de segurança...',
          footer: {
            text:
              'O painel será atualizado durante todo o processo.'
          },
          timestamp: new Date().toISOString()
        }
      ]
    });

  const stats = {
    total: 0,
    processed: 0,
    changed: 0,
    noName: 0,
    reviewSent: 0,
    wlBugged: 0,
    failed: 0,

    phaseIndex: 0,
    currentMemberId: null,

    targetRoleId: role.id,
    authorId: message.author.id,

    title:
      '🧠 Remover Geral • processamento inteligente',

    color: 0x3498db,
    extra: '',
    finished: false,
    lastStatusEditAt: 0
  };

  /*
   * Aqui será armazenado o espelho completo
   * de cada pessoa processada.
   */
  const details = [];

  try {
    /*
     * FASE 1:
     * busca todos os membros do servidor.
     */
    stats.phaseIndex = 1;

    stats.extra =
      'Carregando todos os membros do servidor antes de iniciar a limpeza. Nenhuma remoção parcial será executada.';

    await editGeneralStatus(
      statusMsg,
      stats,
      true
    );

    /*
     * Tenta carregar todos os membros.
     *
     * Não existe limite fixo de 100 pessoas aqui.
     * O processo continuará somente quando o cache
     * estiver completo em relação ao memberCount.
     */
    const membersFetchResult =
      await fetchAllGuildMembersForGeneral(
        message.guild,
        30_000
      );

    /*
     * O bot não inicia uma ação destrutiva
     * enquanto o cache estiver parcial.
     */
    if (!membersFetchResult.complete) {
      stats.finished = true;
      stats.color = 0xe74c3c;
      stats.title =
        '❌ Remover Geral cancelado por cache incompleto';

      if (
        membersFetchResult.reason ===
        'MISSING_MEMBERS_INTENT'
      ) {
        stats.extra =
          'O bot não conseguiu carregar todos os membros porque o **Server Members Intent** não está disponível.\n\n' +
          'Ative no Discord Developer Portal:\n' +
          '**Bot → Privileged Gateway Intents → Server Members Intent**\n\n' +
          `Cache atual: **${membersFetchResult.cachedAfter}/${membersFetchResult.expectedTotal}** membros.\n` +
          'Nenhum membro foi alterado.';
      } else if (
        membersFetchResult.reason ===
        'TIMEOUT'
      ) {
        stats.extra =
          'O Discord não terminou de entregar todos os membros dentro de 30 segundos.\n\n' +
          `Cache atual: **${membersFetchResult.cachedAfter}/${membersFetchResult.expectedTotal}** membros.\n` +
          'Nenhum membro foi alterado. Tente novamente em alguns segundos.';
      } else {
        stats.extra =
          'Não foi possível confirmar o carregamento completo dos membros.\n\n' +
          `Cache atual: **${membersFetchResult.cachedAfter}/${membersFetchResult.expectedTotal}** membros.\n` +
          'Nenhum membro foi alterado para evitar uma limpeza parcial.';
      }

      await editGeneralStatus(
        statusMsg,
        stats,
        true
      );

      setTimeout(() => {
        statusMsg.delete().catch(() => {});
      }, GENERAL_FINAL_DELETE_MS);

      return true;
    }

    /*
     * Agora que o cache foi confirmado como completo,
     * coleta todos os membros que possuem o cargo-alvo.
     *
     * Não usa .first(100), limit: 100 ou paginação parcial.
     */
    const candidates =
      getAllMembersWithRoleFromCache(
        message.guild,
        role.id
      );

    stats.total =
      candidates.size;

    stats.extra =
      `Cache completo confirmado: **${membersFetchResult.cachedAfter}/${membersFetchResult.expectedTotal}** membros carregados.\n` +
      `Pessoas encontradas com o cargo-alvo: **${stats.total}**.`;

    await editGeneralStatus(
      statusMsg,
      stats,
      true
    );

    /*
     * Descobre os cargos relacionados aos tickets.
     * Esses dados serão registrados na log.
     */
    const ticketRoleIds =
      await discoverTicketRoleIds(
        message.guild
      );

    /*
     * Monta a lista dos cargos que devem permanecer.
     */
    const normalKeepSet =
      buildGeneralKeepSet(config);

    /*
     * FASE 2:
     * inicia a conferência dos nomes.
     */
    stats.phaseIndex = 2;

    stats.extra = stats.total
      ? 'Membros encontrados. Iniciando conferência individual de nome, ID, WL e cargos.'
      : 'Nenhum membro possui o cargo-alvo.';

    await editGeneralStatus(
      statusMsg,
      stats,
      true
    );

    /*
     * Processa cada membro individualmente.
     */
    for (
      const member of candidates.values()
    ) {
      stats.currentMemberId = member.id;

      /*
       * Espelho anterior do membro.
       */
      const rolesBefore =
        roleSnapshot(member);

      const nameInfo =
        analyzeMemberName(member);

      const detail = {
        memberId: member.id,
        userTag: member.user.tag,

        result: 'PENDENTE',

        nameBefore: member.nickname,
        nameAfter: member.nickname,

        nameType: nameInfo.type,
        hadId: nameInfo.hasId,

        rolesBefore,
        rolesRemoved: [],
        rolesAdded: [],
        rolesAfter: [],

        ticketRoleDetected:
          rolesBefore.some((item) => {
            return ticketRoleIds.has(item.id);
          }),

        reviewSent: false,
        error: null
      };

      try {
        /*
         * O bot não consegue alterar:
         *
         * - dono do servidor;
         * - pessoas acima do cargo mais alto do bot;
         * - pessoas com cargos incompatíveis com a hierarquia.
         */
        if (!member.manageable) {
          throw new Error(
            'Membro não gerenciável pela hierarquia atual do bot.'
          );
        }

        /*
         * Bypass temporário para impedir que outros sistemas
         * devolvam os cargos durante a limpeza.
         */
        globalThis.__SC_ROLE_BYPASS__ ??=
          new Map();

        globalThis.__SC_ROLE_BYPASS__.set(
          member.id,
          Date.now() + 300000
        );

        /*
         * FASE 3:
         * cargos e nomes.
         */
        stats.phaseIndex = 3;

        /*
         * =====================================================
         * MEMBRO SEM APELIDO NO SERVIDOR
         * =====================================================
         *
         * Remove todos os cargos removíveis,
         * inclusive Cidadão.
         *
         * Depois adiciona somente Sem WL.
         */
        if (
          nameInfo.type ===
          'NO_SERVER_NAME'
        ) {
          const removableIds =
            member.roles.cache
              .filter((memberRole) => {
                return roleIsRemovableByBot(
                  me,
                  memberRole
                );
              })
              .map((memberRole) => {
                return memberRole.id;
              });

          if (removableIds.length) {
            await member.roles.remove(
              removableIds,
              `!removergeral: membro sem nome no servidor • executor ${message.author.tag}`
            );
          }

          const noWlRole =
            message.guild.roles.cache.get(
              NO_WL_ROLE_ID
            );

          if (
            noWlRole &&
            roleEditableByBot(me, noWlRole) &&
            !member.roles.cache.has(
              NO_WL_ROLE_ID
            )
          ) {
            await member.roles.add(
              NO_WL_ROLE_ID,
              `!removergeral: membro sem nome • executor ${message.author.tag}`
            );
          }

          stats.noName++;

          detail.result =
            'SEM NOME: todos os cargos removíveis foram retirados e Sem WL foi aplicado';
        } else {
          /*
           * =====================================================
           * MEMBRO COM NOME NO SERVIDOR
           * =====================================================
           *
           * Mantém:
           *
           * - Cidadão;
           * - boost;
           * - cargos configurados;
           * - cargos extras de liderança;
           * - cargos gerenciados pelo Discord.
           */
          const keepSet =
            new Set(normalKeepSet);

          const removableIds =
            member.roles.cache
              .filter((memberRole) => {
                if (
                  !roleIsRemovableByBot(
                    me,
                    memberRole
                  )
                ) {
                  return false;
                }

                if (
                  keepSet.has(memberRole.id)
                ) {
                  return false;
                }

                return true;
              })
              .map((memberRole) => {
                return memberRole.id;
              });

          if (removableIds.length) {
            await member.roles.remove(
              removableIds,
              `!removergeral: limpeza inteligente • executor ${message.author.tag}`
            );
          }

          /*
           * Garante que a pessoa possua Cidadão.
           */
          const citizenRole =
            message.guild.roles.cache.get(
              CITIZEN_ROLE_ID
            );

          if (
            citizenRole &&
            roleEditableByBot(
              me,
              citizenRole
            ) &&
            !member.roles.cache.has(
              CITIZEN_ROLE_ID
            )
          ) {
            await member.roles.add(
              CITIZEN_ROLE_ID,
              `!removergeral: manutenção da WL • executor ${message.author.tag}`
            );
          }

          /*
           * Caso esteja no formato:
           *
           * LD | Nome | ID
           *
           * troca para:
           *
           * Nome | ID
           */
          if (
            nameInfo.needsNicknameChange
          ) {
            await member.setNickname(
              nameInfo.finalNickname.slice(
                0,
                32
              ),
              `!removergeral: remoção da abreviação da cidade • executor ${message.author.tag}`
            );
          }

          detail.result =
            nameInfo.needsNicknameChange
              ? 'CARGOS LIMPOS E NOME NORMALIZADO PARA Nome | ID'
              : 'CARGOS LIMPOS; NOME MANTIDO CONFORME A REGRA';
        }

        /*
         * FASE 4:
         * revisões de nome e WL.
         */
        stats.phaseIndex = 4;

        /*
         * Busca novamente o membro depois da limpeza.
         *
         * Essa atualização é obrigatória para conferir
         * os cargos que realmente permaneceram.
         *
         * Antes, o código utilizava o estado antigo do membro
         * e podia enviar uma revisão de WL mesmo depois de
         * o cargo Sem WL já ter sido removido automaticamente.
         */
        const freshMember =
          await message.guild.members
            .fetch(member.id, {
              force: true
            })
            .catch(() => member);

        /*
         * Confere a WL usando os cargos atuais,
         * depois de todas as remoções e adições.
         */
        const stillHasCitizen =
          freshMember.roles.cache.has(
            CITIZEN_ROLE_ID
          );

        const stillHasNoWl =
          freshMember.roles.cache.has(
            NO_WL_ROLE_ID
          );

        const stillHasWlBug =
          stillHasCitizen &&
          stillHasNoWl;

        /*
         * Só envia a revisão quando a WL continua
         * realmente bugada depois da limpeza.
         */
        if (stillHasWlBug) {
          stats.wlBugged++;

          const review =
            await sendReviewRequest(
              client,
              freshMember,
              'WL_BUG',
              {
                channelId:
                  message.channel.id,

                executorId:
                  message.author.id
              }
            );

          if (review.sent) {
            stats.reviewSent++;
            detail.reviewSent = true;
          }
        } else if (
          nameInfo.type === 'PLAIN_NAME'
        ) {
          /*
           * Se a pessoa possui somente:
           *
           * Nome
           *
           * envia o botão para informar:
           *
           * Nome | ID
           */
          const review =
            await sendReviewRequest(
              client,
              freshMember,
              'PLAIN_NAME',
              {
                channelId:
                  message.channel.id,

                executorId:
                  message.author.id
              }
            );

          if (review.sent) {
            stats.reviewSent++;
            detail.reviewSent = true;
          }
        }

        /*
         * O freshMember já foi buscado acima depois
         * de todas as alterações.
         */

        const rolesAfter =
          roleSnapshot(freshMember);

        const beforeIds =
          new Set(
            rolesBefore.map((item) => {
              return item.id;
            })
          );

        const afterIds =
          new Set(
            rolesAfter.map((item) => {
              return item.id;
            })
          );

        detail.rolesRemoved =
          rolesBefore.filter((item) => {
            return !afterIds.has(item.id);
          });

        detail.rolesAdded =
          rolesAfter.filter((item) => {
            return !beforeIds.has(item.id);
          });

        detail.rolesAfter =
          rolesAfter;

        detail.nameAfter =
          freshMember.nickname;

        stats.changed++;
      } catch (error) {
        stats.failed++;

        detail.result = 'FALHA';

        detail.error =
          error?.stack ||
          error?.message ||
          String(error);

        detail.rolesAfter =
          roleSnapshot(member);
      }

      /*
       * Salva o resultado individual.
       */
      details.push(detail);

      stats.processed++;

      stats.extra =
        `Último resultado: **${detail.result}**`;

      await editGeneralStatus(
        statusMsg,
        stats
      );

      /*
       * Pequeno intervalo para evitar rate limit.
       */
      await sleep(SMALL_DELAY_MS);
    }

    /*
     * FASE 5:
     * logs completas.
     */
    stats.phaseIndex = 5;
    stats.currentMemberId = null;

    stats.extra =
      'Salvando o espelho completo de cada membro no canal de logs.';

    await editGeneralStatus(
      statusMsg,
      stats,
      true
    );

    await sendGeneralLogs(
      client,
      message,
      role,
      startedAt,
      stats,
      details
    );

    /*
     * Finaliza o painel.
     */
    stats.phaseIndex = 5;
    stats.finished = true;

    stats.color =
      stats.failed
        ? 0xe67e22
        : 0x2ecc71;

    stats.title =
      stats.failed
        ? '⚠️ Remover Geral finalizado com algumas falhas'
        : '✅ Remover Geral finalizado com sucesso';

    stats.extra =
      `Logs completos: <#${LOG_CHANNEL_ID}>\n` +
      `Pendências de nome/WL: <#${REVIEW_CHANNEL_ID}>\n\n` +
      `Este painel será apagado <t:${Math.floor(
        (
          Date.now() +
          GENERAL_FINAL_DELETE_MS
        ) / 1000
      )}:R>.`;

    await editGeneralStatus(
      statusMsg,
      stats,
      true
    );

    /*
     * Apaga o painel 10 minutos depois.
     */
    setTimeout(() => {
      statusMsg.delete().catch(() => {});
    }, GENERAL_FINAL_DELETE_MS);

    return true;
  } finally {
    /*
     * Sempre libera a trava,
     * mesmo que aconteça alguma falha.
     */
    globalThis.__SC_REMOVE_GENERAL_LOCK.delete(
      lockKey
    );
  }
}

export async function removerMassivoHandleMessage(message, client) {
  try {
    if (!message || message.author?.bot) {
      return false;
    }

    if (!message.guild) {
      return false;
    }

    const content =
      message.content || '';

    const parts =
      content
        .trim()
        .split(/\s+/);

    const cmd =
      parts[0]
        .toLowerCase();

    /*
     * Esta função aceita somente:
     *
     * !remover
     * !removergeral
     *
     * Isso impede conflito com:
     *
     * !removerperm
     * !remperm
     * outros comandos parecidos.
     */
    if (
      cmd !== '!remover' &&
      cmd !== '!removergeral'
    ) {
      return false;
    }

    const args =
      parts.slice(1);

    /*
     * =====================================================
     * NOVO COMANDO: !removergeral
     * =====================================================
     */
    if (cmd === '!removergeral') {
      /*
       * Confere quem pode utilizar o comando novo.
       */
      if (
        !hasPermissionToUseGeneral(message)
      ) {
        setTimeout(() => {
          message.delete().catch(() => {});
        }, 1000);

        await sendTemp(message.channel, {
          content:
            '❌ Você não tem permissão para usar o `!removergeral`.'
        });

        return true;
      }

      /*
       * Localiza o cargo informado por:
       *
       * - menção;
       * - ID;
       * - nome exato.
       */
      const generalRole =
        pickRoleFromArgs(
          message,
          args
        );

      if (!generalRole) {
        message.delete().catch(() => {});

        await sendTemp(message.channel, {
          content:
            '❌ Informe um cargo válido.\n\n' +
            'Exemplo: `!removergeral @Cargo`'
        });

        return true;
      }

      /*
       * Encaminha para o processamento inteligente.
       *
       * A própria função runRemoveGeneral valida
       * se o cargo informado é um dos dois permitidos.
       */
      return runRemoveGeneral(
        message,
        client,
        generalRole
      );
    }

    /*
     * =====================================================
     * COMANDO ANTIGO: !remover
     * =====================================================
     *
     * A partir daqui, o comportamento antigo continua.
     */
    const startedAt =
      Date.now();

    if (!hasPermissionToUse(message)) {
      setTimeout(() => {
        message.delete().catch(() => {});
      }, 1000);

      await sendTemp(message.channel, {
        content:
          '❌ Você não tem permissão pra usar esse comando.'
      });

      return true;
    }

    /*
     * Apaga a mensagem original do comando.
     */
    message.delete().catch(() => {});

    /*
     * Cargo usado pelo comando antigo.
     */
    const role =
      pickRoleFromArgs(
        message,
        args
      );

    if (!role) {
      await sendTemp(message.channel, {
        content:
          '❌ Informe um cargo válido.\n\n' +
          'Exemplos:\n' +
          '`!remover @Cargo`\n' +
          '`!remover 123456789012345678`'
      });

      return true;
    }

    // não deixa remover cargo protegido como alvo
    if (PROTECTED_ROLE_IDS.includes(role.id)) {
      await sendTemp(message.channel, {
        content: '⚠️ Esse cargo é protegido e não pode ser alvo de remoção em massa.'
      });
      return true;
    }

    const me = message.guild.members.me || await message.guild.members.fetch(client.user.id).catch(() => null);
    if (!me) {
      await sendTemp(message.channel, { content: '❌ Não consegui identificar meu usuário no servidor.' });
      return true;
    }

    if (!me.permissions.has('ManageRoles')) {
      await sendTemp(message.channel, { content: '❌ Eu não tenho a permissão **Gerenciar Cargos** para executar esta ação.' });
      return true;
    }

    if (!roleEditableByBot(me, role)) {
      await sendTemp(message.channel, {
        content: '❌ Não consigo remover esse cargo: ele está **acima** (ou no mesmo nível) do meu cargo mais alto.'
      });
      return true;
    }

    // lock por guild+role
    const lockKey = `${message.guild.id}:${role.id}`;
    if (globalThis.__SC_REMOVE_ROLE_LOCK.get(lockKey)) {
      await sendTemp(message.channel, { content: '⏳ Já existe uma remoção em andamento pra esse cargo. Aguarde terminar.' });
      return true;
    }
    globalThis.__SC_REMOVE_ROLE_LOCK.set(lockKey, true);

    // aviso inicial
    const statusMsg = await message.channel.send({
      embeds: [
        {
          color: 0xffa500,
          title: '🔧 Remoção em massa iniciada',
          description: `Alvo: ${role}\nSolicitado por: <@${message.author.id}>`,
          footer: { text: 'Removendo de todos que têm o cargo, exceto protegidos…' },
          timestamp: new Date().toISOString()
        }
      ]
    });

    let removed = 0,
      skippedProtected = 0,
      failed = 0;

    const removedIds = [];
    const skippedIds = [];
    const failedIds = [];

    try {
      // ✅ Busca somente membros que estão no cache com o cargo alvo
      // Usa a mesma lógica rápida do comando !grupo
      const candidates = await getMembersWithRoleOnly(message.guild, role);

      if (!candidates || candidates.size === 0) {
        const cached = message.guild.members.cache.size;
        const totalGuild = message.guild.memberCount ?? cached;

        await editStatus(statusMsg, {
          color: 0x2ecc71,
          title: '✅ Remoção finalizada',
          role,
          authorId: message.author.id,
          candidatesTotal: 0,
          targetsTotal: 0,
          processed: 0,
          removed,
          skippedProtected,
          failed,
          extra:
            cached < totalGuild
              ? `⚠️ Nenhum membro com **${role.name}** foi encontrado no cache atual.\nCache atual: **${cached}/${totalGuild}** membros. Use \`!grupo ${role.id}\` antes ou tente novamente em alguns segundos.`
              : `ℹ️ Nenhum membro possui o cargo **${role.name}**.`
        });

        return true;
      }

      await editStatus(statusMsg, {
        color: 0xf1c40f,
        title: '🔍 Membros encontrados',
        role,
        authorId: message.author.id,
        candidatesTotal: candidates.size,
        targetsTotal: 0,
        processed: 0,
        removed,
        skippedProtected,
        failed,
        extra: 'Filtrando protegidos, falhas de hierarquia e membros válidos...'
      });

      const targets = [];
      for (const m of Array.from(candidates.values())) {
        if (!m.roles.cache.has(role.id)) {
          continue;
        }

        // Se o bot não consegue gerenciar o membro (ex: dono do server ou cargo maior que o bot)
        if (!m.manageable) {
          failed++;
          failedIds.push(m.id);
          continue;
        }

        const isProtectedById = PROTECTED_USER_IDS.includes(m.id);
        const isProtectedByRole = m.roles.cache.some((r) => PROTECTED_ROLE_IDS.includes(r.id));
        if (isProtectedById || isProtectedByRole) {
          skippedProtected++;
          skippedIds.push(m.id);
          continue;
        }

        targets.push(m);
      }

      let processed = 0;

      await editStatus(statusMsg, {
        color: 0x3498db,
        title: '⏳ Remoção em massa em andamento',
        role,
        authorId: message.author.id,
        candidatesTotal: candidates.size,
        targetsTotal: targets.length,
        processed,
        removed,
        skippedProtected,
        failed,
        extra: targets.length === 0
          ? 'Nenhum membro válido para remover após o filtro.'
          : 'Iniciando remoção dos membros válidos...'
      });

      for (const m of targets) {
        processed++;
        try {
          if (!m.roles.cache.has(role.id)) {
            continue;
          }

          // se mexeram na hierarquia durante o processo
          if (!roleEditableByBot(me, role)) {
            failed++;
            failedIds.push(m.id);
            continue;
          }

          // ✅ Aplica bypass temporário (3 minutos) para que as proteções não devolvam o cargo
          if (!globalThis.__SC_ROLE_BYPASS__) globalThis.__SC_ROLE_BYPASS__ = new Map();
          globalThis.__SC_ROLE_BYPASS__.set(m.id, Date.now() + 180000);

          await m.roles.remove(role.id, `Remoção massiva por ${message.author.tag}`);
          removed++;
          removedIds.push(m.id);

          if (processed % STATUS_UPDATE_EVERY === 0 || processed === targets.length) {
            await editStatus(statusMsg, {
              color: 0x3498db,
              title: '⏳ Remoção em massa em andamento',
              role,
              authorId: message.author.id,
              candidatesTotal: candidates.size,
              targetsTotal: targets.length,
              processed,
              removed,
              skippedProtected,
              failed
            });
          }
        } catch (err) {
          failed++;
          failedIds.push(m.id);

          await editStatus(statusMsg, {
            color: 0xe74c3c,
            title: '⚠️ Remoção em andamento com falhas',
            role,
            authorId: message.author.id,
            candidatesTotal: candidates.size,
            targetsTotal: targets.length,
            processed,
            removed,
            skippedProtected,
            failed,
            extra: `Última falha: <@${m.id}>`
          });
        }

        await sleep(SMALL_DELAY_MS);
      }
    } finally {
      globalThis.__SC_REMOVE_ROLE_LOCK.delete(lockKey);
    }

    // resumo final fixo no chat
    await message.channel.send({
      embeds: [
        {
          color: 0x2ecc71,
          title: '✅ Remoção concluída',
          fields: [
            { name: 'Cargo alvo', value: `${role} \`${role.id}\``, inline: true },
            { name: 'Removidos', value: String(removed), inline: true },
            { name: 'Protegidos', value: String(skippedProtected), inline: true },
            { name: 'Falhas', value: String(failed), inline: true }
          ],
          footer: { text: 'Resumo temporário • detalhes no canal de logs' },
          timestamp: new Date().toISOString()
        }
      ]
    });

    // ----- LOG COMPLETO -----
    const logs = LOG_CHANNEL_ID ? await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null) : null;
    if (logs) {
      const elapsed = Date.now() - startedAt;
      const originalCmd = (content || `!remover ${role.id}`).slice(0, 1000);

      const logText = `Remoção massiva de cargo
Servidor: ${message.guild.name} (${message.guild.id})
Canal origem: #${message.channel?.name} (${message.channel?.id})
Executor: ${message.author.tag} (${message.author.id})
Cargo alvo: ${role.name} (${role.id})
Data (BR): ${new Date().toLocaleString('pt-BR', { timeZone: TZ })}
Duração: ${(elapsed / 1000).toFixed(1)}s

Totais:
- Removidos: ${removed}
- Protegidos: ${skippedProtected}
- Falhas: ${failed}

IDs removidos (${removedIds.length}):
${removedIds.join(', ') || '—'}

IDs protegidos (${skippedIds.length}):
${skippedIds.join(', ') || '—'}

IDs com falha (${failedIds.length}):
${failedIds.join(', ') || '—'}
`;

      const files = [
        {
          attachment: Buffer.from(logText, 'utf-8'),
          name: `remocao_${role.id}_${Date.now()}.txt`
        }
      ];

      const embed = {
        color: 0x5865f2,
        title: '🧹 Remoção massiva de cargo',
        author: {
          name: `${message.author.tag}`,
          icon_url: message.author.displayAvatarURL?.({ size: 128 })
        },
        thumbnail: { url: message.guild.iconURL?.({ size: 128 }) },
        fields: [
          { name: 'Cargo alvo', value: `${role} \`${role.id}\``, inline: true },
          { name: 'Solicitado por', value: `<@${message.author.id}> \`${message.author.id}\``, inline: true },
          { name: 'Canal', value: `<#${message.channel.id}>`, inline: true },
          { name: 'Data/Hora (BR)', value: new Date().toLocaleString('pt-BR', { timeZone: TZ }), inline: true },
          { name: 'Duração', value: `${(elapsed / 1000).toFixed(1)}s`, inline: true },
          { name: 'Removidos', value: String(removed), inline: true },
          { name: 'Protegidos (ignorados)', value: String(skippedProtected), inline: true },
          { name: 'Falhas', value: String(failed), inline: true },
          { name: 'Comando usado', value: '```' + originalCmd + '```' }
        ],
        timestamp: new Date().toISOString()
      };

      await logs.send({ embeds: [embed], files }).catch(() => {});
    }

    return true;
  } catch (error) {
    console.error(
      '[removerMassivo] erro:',
      error
    );

    return false;
  }
}

/*
 * =========================================================
 * BOTÃO E MODAL DO !removergeral
 * =========================================================
 *
 * Esta função precisa ser chamada dentro do interactionCreate
 * existente no core/index.js.
 *
 * O core já está configurado para chamar:
 *
 * removerGeralHandleInteraction(interaction)
 */
export async function removerGeralHandleInteraction(
  interaction
) {
  try {
    /*
     * O botão e o modal funcionam somente dentro de servidor.
     */
    if (!interaction?.guild) {
      return false;
    }

    /*
     * =====================================================
     * BOTÃO: ABRE O MODAL
     * =====================================================
     *
     * Formato do customId:
     *
     * rg_fix:ID_DO_MEMBRO:NONCE
     */
    if (
      interaction.isButton() &&
      interaction.customId.startsWith('rg_fix:')
    ) {
      const [
        ,
        memberId,
        nonce
      ] = interaction.customId.split(':');

      const key = makeReviewKey(
        interaction.guild.id,
        memberId,
        nonce
      );

      const review =
        globalThis.__SC_REMOVE_GENERAL_REVIEWS.get(
          key
        );

      /*
       * Somente os usuários e cargos autorizados
       * podem abrir o modal.
       */
      if (
        !hasPermissionToReview(interaction)
      ) {
        await interaction.reply({
          content:
            '❌ Você não possui autorização para corrigir este nome/WL.',
          ephemeral: true
        });

        return true;
      }

      /*
       * A solicitação pode:
       *
       * - já ter sido concluída;
       * - ter expirado;
       * - ter sido perdida após reinício do bot.
       */
      if (
        !review ||
        review.used
      ) {
        await interaction.reply({
          content:
            '⚠️ Esta solicitação já foi concluída, expirou ou o bot foi reiniciado.',
          ephemeral: true
        });

        return true;
      }

      /*
       * Busca novamente o membro no servidor.
       */
      const member =
        await interaction.guild.members
          .fetch(memberId)
          .catch(() => null);

      if (!member) {
        await interaction.reply({
          content:
            '❌ O membro não está mais no servidor.',
          ephemeral: true
        });

        return true;
      }

      /*
       * Cria o modal.
       */
      const modal =
        new ModalBuilder()
          .setCustomId(
            `rg_modal:${memberId}:${nonce}`
          )
          .setTitle(
            'Corrigir nome e WL'
          );

      /*
       * Campo onde será informado:
       *
       * Nome | ID
       */
      const nicknameInput =
        new TextInputBuilder()
          .setCustomId('nickname')
          .setLabel(
            'Novo nome no formato Nome | ID'
          )
          .setPlaceholder(
            'Exemplo: Macedo | 12345'
          )
          .setStyle(
            TextInputStyle.Short
          )
          .setRequired(true)
          .setMinLength(3)
          .setMaxLength(32)
          .setValue(
            (
              member.nickname ||
              member.user.username
            ).slice(0, 32)
          );

      const modalRow =
        new ActionRowBuilder()
          .addComponents(
            nicknameInput
          );

      modal.addComponents(
        modalRow
      );

      await interaction.showModal(
        modal
      );

      return true;
    }

    /*
     * =====================================================
     * MODAL: APLICA A ALTERAÇÃO
     * =====================================================
     *
     * Formato do customId:
     *
     * rg_modal:ID_DO_MEMBRO:NONCE
     */
    if (
      interaction.isModalSubmit() &&
      interaction.customId.startsWith(
        'rg_modal:'
      )
    ) {
      const [
        ,
        memberId,
        nonce
      ] = interaction.customId.split(':');

      const key = makeReviewKey(
        interaction.guild.id,
        memberId,
        nonce
      );

      const review =
        globalThis.__SC_REMOVE_GENERAL_REVIEWS.get(
          key
        );

      /*
       * Confere novamente a permissão.
       *
       * Mesmo que alguém consiga abrir o modal,
       * a permissão será validada outra vez
       * no momento de concluir.
       */
      if (
        !hasPermissionToReview(interaction)
      ) {
        await interaction.reply({
          content:
            '❌ Você não possui autorização para concluir esta correção.',
          ephemeral: true
        });

        return true;
      }

      /*
       * Impede utilizar o mesmo modal duas vezes.
       */
      if (
        !review ||
        review.used
      ) {
        await interaction.reply({
          content:
            '⚠️ Esta solicitação já foi usada, expirou ou o bot foi reiniciado.',
          ephemeral: true
        });

        return true;
      }

      /*
       * Lê e limpa o nome informado.
       */
      const requestedNickname =
        cleanText(
          interaction.fields
            .getTextInputValue(
              'nickname'
            )
        );

      /*
       * Exige:
       *
       * Nome | ID
       *
       * Também confere se existe pelo menos
       * um número depois do último |.
       */
      if (
        !hasNumericIdAfterPipe(
          requestedNickname
        )
      ) {
        await interaction.reply({
          content:
            '❌ Use obrigatoriamente o formato **Nome | ID**, com pelo menos um número depois do último `|`.',
          ephemeral: true
        });

        return true;
      }

      /*
       * Busca o membro novamente.
       */
      const member =
        await interaction.guild.members
          .fetch(memberId)
          .catch(() => null);

      if (!member) {
        await interaction.reply({
          content:
            '❌ O membro não está mais no servidor.',
          ephemeral: true
        });

        return true;
      }

      /*
       * Confere a hierarquia.
       */
      if (!member.manageable) {
        await interaction.reply({
          content:
            '❌ Não consigo alterar esse membro por causa da hierarquia de cargos.',
          ephemeral: true
        });

        return true;
      }

      /*
       * Confirma a interação antes das alterações
       * para evitar o erro "Esta interação falhou".
       */
      await interaction.deferReply({
        ephemeral: true
      });

      /*
       * Espelho anterior.
       */
      const beforeName =
        member.nickname ||
        member.user.username;

      const beforeRoles =
        roleSnapshot(member);

      /*
       * Bypass temporário para impedir
       * que outro sistema devolva os cargos.
       */
      globalThis.__SC_ROLE_BYPASS__ ??=
        new Map();

      globalThis.__SC_ROLE_BYPASS__.set(
        member.id,
        Date.now() + 180000
      );

      /*
       * Altera o nome para o formato:
       *
       * Nome | ID
       */
      await member.setNickname(
        requestedNickname.slice(0, 32),
        `Correção manual do !removergeral por ${interaction.user.tag}`
      );

      /*
       * Garante o cargo Cidadão.
       */
      if (
        !member.roles.cache.has(
          CITIZEN_ROLE_ID
        )
      ) {
        await member.roles.add(
          CITIZEN_ROLE_ID,
          `WL corrigida pelo modal do !removergeral por ${interaction.user.tag}`
        );
      }

      /*
       * Remove Sem WL, caso exista.
       */
      if (
        member.roles.cache.has(
          NO_WL_ROLE_ID
        )
      ) {
        await member.roles.remove(
          NO_WL_ROLE_ID,
          `WL corrigida pelo modal do !removergeral por ${interaction.user.tag}`
        );
      }

      /*
       * Marca a solicitação como utilizada.
       *
       * Depois disso, o botão e o modal
       * não poderão aplicar outra alteração.
       */
      review.used = true;
      review.usedBy =
        interaction.user.id;
      review.usedAt =
        Date.now();

      globalThis.__SC_REMOVE_GENERAL_REVIEWS.set(
        key,
        review
      );

      /*
       * Cria o botão desativado.
       */
      const disabledButton =
        new ButtonBuilder()
          .setCustomId(
            `rg_done:${memberId}:${nonce}`
          )
          .setLabel(
            'Correção concluída'
          )
          .setEmoji('✅')
          .setStyle(
            ButtonStyle.Success
          )
          .setDisabled(true);

      const disabledRow =
        new ActionRowBuilder()
          .addComponents(
            disabledButton
          );

      /*
       * Busca o estado atualizado do membro.
       */
      const freshMember =
        await interaction.guild.members
          .fetch(member.id)
          .catch(() => member);

      const afterRoles =
        roleSnapshot(freshMember);

      /*
       * Edita a mensagem original da solicitação.
       */
      if (interaction.message) {
        await interaction.message.edit({
          embeds: [
            {
              color: 0x2ecc71,
              title:
                '✅ Nome e WL corrigidos',
              description:
                `**Membro:** <@${member.id}> \`${member.id}\`\n` +
                `**Antes:** \`${beforeName}\`\n` +
                `**Depois:** \`${freshMember.nickname}\`\n` +
                `**Corrigido por:** <@${interaction.user.id}>\n\n` +
                `✅ Cargo <@&${CITIZEN_ROLE_ID}> garantido\n` +
                `✅ Cargo <@&${NO_WL_ROLE_ID}> removido, caso existisse`,
              fields: [
                {
                  name: 'Cargos antes',
                  value:
                    `\`${formatRoleSnapshot(beforeRoles).slice(0, 1000)}\``
                },
                {
                  name: 'Cargos depois',
                  value:
                    `\`${formatRoleSnapshot(afterRoles).slice(0, 1000)}\``
                }
              ],
              footer: {
                text:
                  'A trava de uso único foi aplicada. O modal não poderá ser usado novamente.'
              },
              timestamp:
                new Date().toISOString()
            }
          ],
          components: [
            disabledRow
          ]
        }).catch(() => {});
      }

      /*
       * Envia a log da correção manual.
       */
      const logChannel =
        await interaction.client.channels
          .fetch(LOG_CHANNEL_ID)
          .catch(() => null);

      if (
        logChannel?.isTextBased?.()
      ) {
        const logText =
`CORREÇÃO MANUAL — !removergeral
Servidor: ${interaction.guild.name} (${interaction.guild.id})
Membro: ${freshMember.user.tag} (${freshMember.id})
Responsável: ${interaction.user.tag} (${interaction.user.id})
Nome antes: ${beforeName}
Nome depois: ${freshMember.nickname}
Cargos antes: ${formatRoleSnapshot(beforeRoles)}
Cargos depois: ${formatRoleSnapshot(afterRoles)}
Data/Hora BR: ${new Date().toLocaleString('pt-BR', {
  timeZone: TZ
})}
`;

        await logChannel.send({
          embeds: [
            {
              color: 0x2ecc71,
              title:
                '🛠️ Correção manual concluída',
              fields: [
                {
                  name: 'Membro',
                  value:
                    `<@${freshMember.id}> \`${freshMember.id}\``,
                  inline: true
                },
                {
                  name: 'Responsável',
                  value:
                    `<@${interaction.user.id}>`,
                  inline: true
                },
                {
                  name: 'Nome anterior',
                  value:
                    `\`${beforeName}\``
                },
                {
                  name: 'Nome final',
                  value:
                    `\`${freshMember.nickname}\``
                }
              ],
              footer: {
                text:
                  'SantaCreators • correção manual do Remover Geral'
              },
              timestamp:
                new Date().toISOString()
            }
          ],
          files: [
            {
              attachment:
                Buffer.from(
                  logText,
                  'utf8'
                ),
              name:
                `correcao_removergeral_${freshMember.id}_${Date.now()}.txt`
            }
          ]
        }).catch(() => {});
      }

      /*
       * Confirma para quem realizou a correção.
       */
      await interaction.editReply({
        content:
          `✅ <@${member.id}> agora está como **${freshMember.nickname}**, com Cidadão e sem o cargo Sem WL.`
      });

      return true;
    }

    /*
     * Não é uma interação do Remover Geral.
     *
     * Permite que os demais handlers continuem.
     */
    return false;
  } catch (error) {
    console.error(
      '[removerGeralHandleInteraction] erro:',
      error
    );

    /*
     * Responde apenas se a interação permitir.
     */
    if (
      interaction?.isRepliable?.()
    ) {
      const payload = {
        content:
          '❌ Ocorreu um erro ao processar esta correção. Consulte os logs do bot.',
        ephemeral: true
      };

      if (
        interaction.deferred ||
        interaction.replied
      ) {
        await interaction.followUp(
          payload
        ).catch(() => {});
      } else {
        await interaction.reply(
          payload
        ).catch(() => {});
      }
    }

    return true;
  }
}
