import { createSiteBridgeOperations } from '../utils/siteBridgeOperations.js';

import { createSiteTeamRequests } from "../utils/siteTeamRequests.js";

import {
  createSiteNotifications,
} from "../utils/siteNotifications.js";

import {
  pedirSetHandleInteraction,
  canApproveCreatorsSetFromSite,
  canRejectCreatorsSetFromSite,
} from "./pedirset.js";

import { createSiteSnapshotStore } from "../utils/siteSnapshotStore.js";
import { createSiteEventsLibrary } from "../utils/siteEventsLibrary.js";
import { getCronogramaSiteData } from "../utils/cronogramaSiteRead.js";

import {
  createQuizRemoteClient,
} from '../utils/quizSiteBridge.js';
import { fileURLToPath as snapshotPath } from "node:url";
import express from "express";
import { timingSafeEqual } from "node:crypto";

import {
  PermissionFlagsBits,
} from "discord.js";

import {
  getFivemRetentionSiteSnapshot,
} from "./fivemRetentionStatus.js";

import {
  getSetStaffSiteOptions,
  getSetStaffSiteSnapshot,
  submitSetStaffFromSite,
  decideSetStaffFromSite,
  canManageSetStaffFromSite,
} from "./setStaffV2.js";

import {
  getHallSiteSnapshot,
  hallSiteWorkflow,
} from "./hallDaFama.js";

import {
  dailySiteWorkflow,
} from "./eventosDiarios.js";

import {
  alignmentSiteWorkflow,
} from "./alinhamentos.js";

import {
  installApprovalAudit,
} from "../utils/approvalAudit.js";

import {
  getChecklistSiteCatalog,
  getChecklistSiteSnapshot,
  checklistSiteAction,
  getChecklistSitePendingNotifications,
} from "./logChecklistSemanal.js";

import {
  getHierarchySiteSnapshot,
  hierarchySiteAction,
  isOfficialSantaCreatorsTeamMember,
  canUsePersonalSantaCreatorsCentral,
} from "./hierarquiaDivisoes.js";

import { createSiteHubExperience } from "../utils/siteHubExperience.js";
import { getNpsSiteSnapshot } from "./npsOperacional.js";

import {
  createSiteCommunity,
  SITE_COMMUNITY_VIEW_CHANNELS,
} from "../utils/siteCommunity.js";

import {
  getVipEventoAdminSiteAccess,
  getVipEventoAdminSiteSnapshot,
} from "./vipEvento.js";

import {
  requestAbsencesSiteSnapshot,
  getAbsenceSiteForm,
  submitAbsenceFromSite,
} from "./ausencias.js";
import { readFile as readSiteAbsencesFile } from "node:fs/promises";
import { resolve as resolveSiteAbsencesPath } from "node:path";

import {
  getWeeklyRankingSiteSnapshot,
  adjustWeeklyPointsFromSite,
} from "./scGeralWeeklyRanking.js";

async function siteProvider(modulePath, exportName) {
  try {
    const module = await import(modulePath);
    if (typeof module[exportName] !== 'function') {
      throw new Error(`Exportação ${exportName} não encontrada.`);
    }
    return module[exportName];
  } catch (error) {
    console.error('[SITE HUB] Provedor indisponível:', modulePath, error.message);
    throw Object.assign(new Error('Esta integração ainda precisa ser habilitada no bot.'), { status: 503 });
  }
}


// =====================================================
// SITE HUB • MANAGERS
// =====================================================

import {
  getRegistroManagerSiteSnapshot,
  registroManagerSiteDecision,
  registroManagerSiteRegistration,
} from "./registroManager.js";

import {
  getConfirmacaoPresencaSiteSnapshot,
  setConfirmacaoPresencaFromSite,
} from "./confirmacaoPresenca.js";

import {
  getRankingAprovadoresManagersSiteSnapshot,
} from "./RankingAprovadoresManagers.js";

import {
  getGraficoManagersSiteSnapshot,
} from "./GraficoManagers.js";

import {
  getFacsSemanaisHistorySiteSnapshot,
} from "./facsSemanais.js";


// =====================================================
// SITE HUB • SOCIAL MEDIA
// =====================================================

import {
  getPagamentoSocialSiteSnapshot,
  getPagamentoSocialSitePendingNotifications,
  getPagamentoSocialSiteForm,
  submitPagamentoSocialFromSite,
  refreshPagamentoSocialFromSite,
  pagamentoSocialSiteDecision,
} from "./pagamentosocial.js";


const GUILD_ID =
  String(
    process.env.DISCORD_GUILD_ID ||
    "1262262852782129183"
  );


const CHANNELS = {
  powersdaily: [
    '1374066813171929218',
  ],

  powersevent: [
    '1392618646630568076',
  ],
  ...SITE_COMMUNITY_VIEW_CHANNELS,
  vipadmin: [
    "1414718336826081330",
  ],

  absences: [
    "1425945370621640704",
    "1520197927614677143",
  ],

  nps: [
    "1534315364152905959",
  ],

  retention: [
    "1501321157259956244",
    "1513967298690420876",
    "1513967343317942382",
    "1513967375769272400",
    "1513967404059983913",
  ],

  staff: [
    String(process.env.SETSTAFF_V2_CANAL_REGISTRO || "1379024704957841509").trim(),
    "1428003736671883405",
    "1352706078621696030",
  ],

  hall: [
    "1518696187237236816",
    "1518696133071863838",
  ],

  quiz: [
    "1495330319715532880",
  ],

  gi: [
    "1417366889398796318",
  ],

  hierarchy: [
    "1370830395637239928",
  ],

  weekly: [
    "1415387000416243722",
  ],

  cronograma: [
    "1474605177771397223",
  ],

  events: [
    "1457573495952248883",
  ],

  ai: [
    "1506520202576400404",
  ],

  /*
   * Organização Manager.
   *
   * Basta conseguir visualizar pelo menos
   * um dos canais oficiais abaixo.
   */
  manager: [
    "1392680204517769277",
    "1477800974574682242",

    String(
      process.env.FACSMENU_CHANNEL_ID ||
      "1400280714548744252"
    ).trim(),
  ],

  /*
   * Social Media.
   *
   * Registro + dashboard oficial.
   */
  social: [
    "1387922662134775818",
    "1505716526534103110",
  ],
};


function safeSecretEqual(
  received,
  expected
) {
  if (
    !received ||
    !expected
  ) {
    return false;
  }

  const actual = Buffer.from(String(received));
  const wanted = Buffer.from(`Bearer ${expected}`);
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}


const SITE_ROLE_CIDADAO =
  '1262978759922028575';

const SITE_ROLE_SEM_WL =
  '1430984036972494908';

const SITE_ROLE_SANTA_CREATORS =
  '1352275728476930099';


function siteMemberHasRole(
  member,
  roleId
) {
  return Boolean(
    member?.roles?.cache?.has(
      String(
        roleId
      )
    )
  );
}


function isCreatorsCommunityMember(
  member
) {
  if (!member) {
    return false;
  }

  /*
   * Santa Creators pode acessar
   * rankings comunitários.
   */
  if (
    siteMemberHasRole(
      member,
      SITE_ROLE_SANTA_CREATORS
    )
  ) {
    return true;
  }

  /*
   * Cidadão com WL concluída.
   */
  const hasCidadao =
    siteMemberHasRole(
      member,
      SITE_ROLE_CIDADAO
    );

  const hasSemWL =
    siteMemberHasRole(
      member,
      SITE_ROLE_SEM_WL
    );

  return (
    hasCidadao &&
    !hasSemWL
  );
}


async function canViewAnyChannel(
  client,
  member,
  channelIds
) {
  for (
    const channelId
    of channelIds
  ) {
    const channel =
      client.channels.cache.get(channelId) || await client.channels
        .fetch(
          channelId
        )
        .catch(
          () => null
        );

    if (!channel || channel.guildId !== member.guild.id) {
      continue;
    }

    const permissions =
      channel.permissionsFor(
        member
      );

    if (
      permissions?.has([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.ReadMessageHistory,
      ])
    ) {
      return true;
    }
  }

  return false;
}


function siteReadOnlyChannelIds(moduleKey) {
  if (moduleKey === 'payments') {
    return [
      ...new Set([
        ...(CHANNELS.social || []),
        ...(CHANNELS.vipadmin || []),
      ]),
    ];
  }

  return Array.isArray(CHANNELS[moduleKey])
    ? [...new Set(CHANNELS[moduleKey])]
    : [];
}

async function siteReadOnlyChannels(member, moduleKey) {
  const visible = [];

  for (const id of siteReadOnlyChannelIds(moduleKey)) {
    const channel = await member.guild.channels
      .fetch(id)
      .catch(() => null);

    if (
      !channel ||
      channel.guildId !== member.guild.id ||
      !channel.isTextBased() ||
      !channel.messages
    ) {
      continue;
    }

    const permissions = channel.permissionsFor(member);

    if (!permissions?.has([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.ReadMessageHistory,
    ])) {
      continue;
    }

    // Threads privadas exigem participação ou gestão de threads.
    if (
      channel.type === 12 &&
      !permissions.has(PermissionFlagsBits.ManageThreads)
    ) {
      const membership = await channel.members
        .fetch(member.id)
        .catch(() => null);

      if (!membership) continue;
    }

    visible.push(channel);
  }

  return visible;
}

async function siteReadOnlySnapshot(member, payload = {}) {
  const moduleKey = String(payload.module || '');

  if (
    moduleKey !== 'payments' &&
    !Object.prototype.hasOwnProperty.call(CHANNELS, moduleKey)
  ) {
    throw Object.assign(
      new Error('Área de leitura desconhecida.'),
      { status: 404 }
    );
  }

  const channels = await siteReadOnlyChannels(
    member,
    moduleKey
  );

  if (!channels.length) {
    throw Object.assign(
      new Error('Você não pode visualizar os canais desta área no Discord.'),
      { status: 403 }
    );
  }

  const selectedId = String(payload.channelId || '');
  const selected = selectedId
    ? channels.find(channel => channel.id === selectedId)
    : channels[0];

  if (!selected) {
    throw Object.assign(
      new Error('Canal não autorizado.'),
      { status: 403 }
    );
  }

  const before = String(payload.before || '');

  if (before && !/^\d{17,20}$/.test(before)) {
    throw Object.assign(
      new Error('Referência de paginação inválida.'),
      { status: 400 }
    );
  }

  const batch = await selected.messages.fetch({
    limit: 25,
    ...(before ? { before } : {}),
  });

  const messages = [...batch.values()].sort(
    (a, b) => b.createdTimestamp - a.createdTimestamp
  );

  return {
    readOnly: true,
    module: moduleKey,
    channelId: selected.id,
    channels: channels.map(channel => ({
      id: channel.id,
      name: channel.name,
    })),
    records: messages.map(message => ({
      id: message.id,
      author: message.author?.globalName ||
        message.author?.username ||
        'Discord',
      createdAt: message.createdTimestamp,
      content: message.content || '',
      url: message.url,
      embeds: message.embeds.map(embed => ({
        title: embed.title || '',
        description: embed.description || '',
        fields: (embed.fields || []).map(field => ({
          name: field.name,
          value: field.value,
        })),
      })),
    })),
    nextBefore: messages.length === 25
      ? messages[messages.length - 1].id
      : null,
  };
}

async function canAccessSiteModule(
  client,
  member,
  moduleKey
) {
  const channelIds =
    CHANNELS[moduleKey];

  if (
    !member ||
    !Array.isArray(channelIds)
  ) {
    return false;
  }

  const isCentralMember =
    member.id === '660311795327828008' ||
    isOfficialSantaCreatorsTeamMember(member);

  if (!isCentralMember) {
    // Estes módulos possuem caminhos próprios de autorização.
    // Não liberar suas consultas agregadas por um canal isolado.
    const separatelyAuthorized = new Set([
      'staff',
      'workflow',
      'ai',
    ]);

    if (separatelyAuthorized.has(moduleKey)) {
      return false;
    }

    // Para um painel com várias fontes, a liberação integral
    // exige leitura de todos os canais configurados.
    // A liberação parcial precisa ser feita pelo provedor.
    const sourceIds = [...new Set(channelIds.map(String))];

    if (!sourceIds.length) {
      return false;
    }

    for (const channelId of sourceIds) {
      const channel = await member.guild.channels
        .fetch(channelId)
        .catch(() => null);

      if (
        !channel ||
        channel.guildId !== member.guild.id ||
        !channel.permissionsFor(member)?.has([
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ReadMessageHistory,
        ])
      ) {
        return false;
      }

      if (
        channel.type === 12 &&
        !channel.permissionsFor(member)?.has(
          PermissionFlagsBits.ManageThreads
        )
      ) {
        const threadMember = await channel.members
          .fetch(member.id)
          .catch(() => null);

        if (!threadMember) {
          return false;
        }
      }
    }
  }

  const visible =
    await canViewAnyChannel(
      client,
      member,
      channelIds
    );

  if (!visible) {
    return false;
  }

  if (moduleKey === 'vipadmin') {
    const access =
      await getVipEventoAdminSiteAccess({
        guild: member.guild,
        member,
      });

    return access.rights.view === true;
  }

  return true;
}


async function assertModuleView(
  client,
  member,
  moduleKey
) {
  if (
    !CHANNELS[
      moduleKey
    ]
  ) {
    const error =
      new Error(
        'Módulo desconhecido.'
      );

    error.status =
      404;

    throw error;
  }

  const allowed =
    await canAccessSiteModule(
      client,
      member,
      moduleKey
    );

  if (!allowed) {
    const error = Object.assign(
      new Error(
        'Você não possui acesso a esta área no Discord.'
      ),
      {
        status: 403,
        code: 'MODULE_VIEW_DENIED',
        moduleKey
      }
    );

    console.warn(
      '[SITE HUB ACCESS]',
      {
        actorId: member?.id || null,
        guildId: member?.guild?.id || null,
        moduleKey,
        sourceChannelIds:
          CHANNELS[moduleKey] || [],
        code: error.code
      }
    );

    throw error;
  }
}


let permissionRefresh = null, permissionsRefreshedAt = 0;
async function refreshDiscordPermissions(guild, force = false) {
  const available = guild.channels.cache.size > 0 && guild.roles.cache.has(guild.id);
  if (!force && available && Date.now() - permissionsRefreshedAt < 30000) return;

  if (!permissionRefresh) {
    permissionRefresh = Promise.all([
      guild.channels.fetch(),
      guild.roles.fetch(),
    ])
      .then(() => { permissionsRefreshedAt = Date.now(); })
      .finally(() => { permissionRefresh = null; });
    permissionRefresh.catch(error => {
      console.warn('[SITE PERMISSIONS] Atualização indisponível:', error.code || error.name);
    });
  }

  if (!force && available) return;
  await permissionRefresh;
}

export function installSiteHubApi({
  app,
  client,
}) {
  const bridgeOperations = createSiteBridgeOperations();
  if (
    !app ||
    !client
  ) {
    throw new Error(
      "installSiteHubApi precisa de app e client."
    );
  }

  const secret =
    String(
      process.env
        .SANTA_SHARE_BRIDGE_SECRET ||
      process.env
        .BRIDGE_SECRET ||
      ""
    ).trim();

  if (
    secret.length < 64
  ) {
    console.error(
      "[SITE HUB] BRIDGE_SECRET inválido. API administrativa não iniciada."
    );

    return false;
  }

  const missingSnapshotLogs =
    new Map();

  if (client.isReady()) {
    requestAbsencesSiteSnapshot(
      client
    );
  } else {
    client.once(
      'ready',
      () => {
        requestAbsencesSiteSnapshot(
          client
        );
      }
    );
  }

  const teamRequests = createSiteTeamRequests({
    client,

    canManageStaff:
      canManageSetStaffFromSite,

    getStaffSnapshot:
      getSetStaffSiteSnapshot,

    decideStaff:
      decideSetStaffFromSite,

    canApproveCreators:
      canApproveCreatorsSetFromSite,

    canRejectCreators:
      canRejectCreatorsSetFromSite,

    handleCreators:
      pedirSetHandleInteraction,
  });

  installApprovalAudit(client);

const powerSiteProvider = key => ({
  site(args) {
    const provider =
      client.__SC_POWER_WORKFLOWS__?.[key];

    if (!provider) {
      throw Object.assign(
        new Error(
          'O módulo de poderes ainda está inicializando.'
        ),
        { status: 503 }
      );
    }

    return provider.site(args);
  },
});

const workflowProviders = {
  powersdaily:
    powerSiteProvider('powersdaily'),

  powersevent:
    powerSiteProvider('powersevent'),

  hall:
    hallSiteWorkflow,

  daily:
    dailySiteWorkflow,

  alignment:
    alignmentSiteWorkflow,
};

const notifications = createSiteNotifications({
  client,
  teamRequests,
  workflowProviders,

  paymentPending:
    getPagamentoSocialSitePendingNotifications,

  checklistPending:
    getChecklistSitePendingNotifications,

  isTeamMember:
    member =>
      member?.id === '660311795327828008' ||
      isOfficialSantaCreatorsTeamMember(member),
});

async function workflowCatalog(
  guild,
  member
) {
  if (
    member.id !== '660311795327828008' &&
    !isOfficialSantaCreatorsTeamMember(
      member
    )
  ) {
    return {
      modules: [],
      warnings: [],
    };
  }

  const results =
    await Promise.allSettled(
      Object.entries(
        workflowProviders
      ).map(
        async ([key, provider]) => ({
          key,

          data:
            await provider.site({
              client,
              guild,
              member,
              action: 'catalog',
            }),
        })
      )
    );

  const modules = [];

  const warnings = [];

  for (
    let index = 0;
    index < results.length;
    index++
  ) {
    const result =
      results[index];

    if (
      result.status === 'fulfilled'
    ) {
      const catalog = result.value.data;
      if (
        !catalog || typeof catalog !== 'object' || Array.isArray(catalog) ||
        typeof catalog.key !== 'string' || !catalog.key.trim() ||
        !catalog.rights || typeof catalog.rights !== 'object' ||
        Array.isArray(catalog.rights)
      ) {
        warnings.push(`O catálogo de ${result.value.key} retornou dados inválidos.`);
        continue;
      }
      modules.push(catalog);

      continue;
    }

    if (
      result.reason?.status !== 403
    ) {
      const key =
        Object.keys(
          workflowProviders
        )[index];

      console.error(
        '[SITE HUB] Catálogo de publicações:',
        key,
        result.reason
      );

      warnings.push(
        `Não foi possível consultar ${key}.`
      );
    }
  }

  try {
    modules.push(
      await registroManagerSiteRegistration({
        client,
        guild,
        member,
        action: 'catalog',
      })
    );
  } catch (error) {
    if (error.status !== 403) {
      console.error(
        '[SITE HUB] Catálogo de organizações:',
        error
      );

      warnings.push(
        'Não foi possível consultar o Registro Manager.'
      );
    }
  }

  const organizationAccess =
    await community.access(member);

  let timeclock = null;
  let paymentForm = null;

  if (
    typeof client.__SC_BP_SITE_API__?.form ===
    'function'
  ) {
    try {
      timeclock =
        await client.__SC_BP_SITE_API__.form({
          guild,
          member,
        });
    } catch (error) {
      console.warn(
        '[SITE HUB] Catálogo de bate-ponto:',
        error
      );

      warnings.push(
        'Não foi possível consultar o bate-ponto.'
      );
    }
  }

  try {
    paymentForm = await getPagamentoSocialSiteForm({ guild, member });
  } catch (error) {
    console.warn('[SITE HUB] Catálogo de pagamento social:', error);
    warnings.push('Não foi possível consultar o pagamento social.');
  }

  return {
    modules,
    warnings,

    confirmOrganization:
      organizationAccess.orgpresence === true,

    blacklist:
      organizationAccess.orgblacklist === true,

    timeclock,
    paymentForm,
  };
}

const experience = createSiteHubExperience({
    client, channels: CHANNELS,
    isTeamMember: isOfficialSantaCreatorsTeamMember,
    getContext: async ({ guild, member, prompt }) => {
      const context = {};
      if (/cronograma|agenda|evento|hoje|amanh[ãa]/i.test(prompt) && await canAccessSiteModule(client, member, 'cronograma')) {
        const getData = getCronogramaSiteData;
        context.cronograma = await getData();
      }
      if (/ranking|rank|\bggs?\b/i.test(prompt) && await canAccessSiteModule(client, member, 'hall')) {
        const ranking = await getHallSiteSnapshot({ guild, actorId: member.id });
        context.hall = { orgs: ranking.orgs.slice(0, 10), players: ranking.players.slice(0, 10), updatedAt: ranking.updatedAt };
      }
      try {
        await assertModuleView(client, member, 'events');

        const catalog = await eventsLibrary.handle({
          guild,
          member,
          action: 'events.snapshot'
        });

        context.events = catalog.events.map(item => ({
          id: item.id,
          name: item.name
        }));

        const requested = catalog.events.find(item =>
          String(prompt)
            .toLocaleLowerCase('pt-BR')
            .includes(item.name.toLocaleLowerCase('pt-BR'))
        );

        if (requested) {
          const details = await eventsLibrary.handle({
            guild,
            member,
            action: 'events.snapshot',
            payload: { eventId: requested.id }
          });

          context.eventInformation = Object.fromEntries(
            Object.entries(details.sections).map(([key, items]) => [
              key,
              items.slice(-8).map(item => ({
                title: item.title,
                text: item.text.slice(0, 2000),
                media: item.media.slice(0, 4)
              }))
            ])
          );
        }
      } catch (error) {
        if (error.status !== 403) {
          console.warn('[SITE AI EVENTS]', error.code || error.message);
        }
      }

      return context;
    },
    generateAI: async options => {
      const generate = await siteProvider("./iaChatAuto.js", "generateSantaCreatorsSiteText");
      return generate(options);
    },
    logAI: async options => {
      const enqueue = await siteProvider("./iaChatAuto.js", "enqueueSantaCreatorsSiteAiLog");
      return enqueue({ client, ...options });
    },
  });

  const eventsLibrary = createSiteEventsLibrary({ client });

  const community = createSiteCommunity({
    client,
  });

  globalThis.__SC_QUIZ_SITE_API__ ||=
    createQuizRemoteClient();

  const snapshots = createSiteSnapshotStore({
    directory: snapshotPath(new URL('../data/site-consultas/', import.meta.url)),
    freshMs: 30000,
    maxAgeMs: 30 * 24 * 60 * 60 * 1000,
    maxBytes: 2 * 1024 * 1024,
    maxTotalBytes: 32 * 1024 * 1024,
  });
  const memberReads = new Map();

  client.on(
    'scAbsencesSnapshotUpdated',
    () => {
      snapshots.invalidate(
        'absences'
      );
    }
  );

  client.on('scRetentionSnapshotUpdated', () => {
    snapshots.invalidate('retention');
  });

  client.on('scNpsSnapshotUpdated', () => {
    snapshots.invalidate('nps');
  });

  async function resolveSiteMember(guild, actorId, force = false) {
    const id = guild.id + ':' + actorId;
    const previous = memberReads.get(id);
    if (!force && previous && Date.now() - previous.at < 30000) {
      return previous.promise;
    }
    const record = { at: Date.now(), promise: null };
    record.promise = guild.members.fetch({
      user: actorId,
      force: true,
    })
      .then(member => {
        record.at = Date.now();
        return member;
      })
      .catch(error => {
        if (memberReads.get(id) === record) memberReads.delete(id);
        if (Number(error.code) === 10007) return null;
        throw Object.assign(new Error('Não foi possível verificar seu vínculo com o Discord.'), { status: 503 });
      });
    memberReads.delete(id);
    memberReads.set(id, record);
    while (memberReads.size > 256) {
      memberReads.delete(memberReads.keys().next().value);
    }
    return record.promise;
  }

  for (const event of ['guildMemberUpdate', 'guildMemberRemove']) {
    client.on(event, (first, second) => {
      const member = second || first;

      if (member?.guild?.id !== GUILD_ID) {
        return;
      }

      memberReads.delete(member.guild.id + ':' + member.id);

      if (event === 'guildMemberUpdate') {
        const previousRoles = first.roles.cache;
        const currentRoles = second.roles.cache;

        const rolesChanged =
          previousRoles.size !== currentRoles.size ||
          [...previousRoles.keys()].some(
            roleId => !currentRoles.has(roleId)
          );

        if (!rolesChanged) {
          return;
        }
      }

      snapshots.invalidate();
    });
  }

  for (const event of ['channelUpdate', 'channelDelete', 'roleUpdate', 'roleDelete']) {
    client.on(event, (first, second) => {
      const target = second || first;

      if (target?.guild?.id !== GUILD_ID) {
        return;
      }

      permissionsRefreshedAt = 0;
      snapshots.invalidate();
    });
  }
  for (const event of ['messageCreate', 'messageUpdate', 'messageDelete', 'messageDeleteBulk']) {
    client.on(event, (first, second) => {
      const messages = event === 'messageDeleteBulk' ? [...first.values()] : [second || first];
      for (const [module, channels] of Object.entries(CHANNELS)) {
        const watched = module === 'staff' ? [...channels,
          '1428003736671883405', '1352706078621696030',
          String(process.env.SETSTAFF_V2_CANAL_REGISTRO || '1379024704957841509').trim()
        ] : channels;
        if (messages.some(message => watched.includes(message?.channelId) ||
          watched.includes(message?.channel?.parentId))) {
          snapshots.invalidate(module);
        }
      }
    });
  }

  let quizPollBusy = false;
  let quizRankingSignature = null;
  let quizRetryAt = 0;
  let quizFailures = 0;

  async function refreshQuizBridge() {
    if (
      quizPollBusy ||
      !process.env.SANTA_QUIZ_API_URL ||
      Date.now() < quizRetryAt
    ) {
      return;
    }

    quizPollBusy = true;

    try {
      const result =
        await globalThis.__SC_QUIZ_SITE_API__.snapshot({
          refresh: true,
        });

      if (
        result.pending === true
      ) {
        return;
      }

      const signature =
        JSON.stringify(
          result.ranking || []
        );

      if (signature !== quizRankingSignature) {
        quizRankingSignature = signature;

        snapshots.invalidate('quiz');
      }

      quizFailures = 0;
      quizRetryAt = 0;
    } catch (error) {
      quizFailures =
        Math.min(quizFailures + 1, 5);

      const retryAfterMs = Math.min(
        300000,
        30000 * (2 ** (quizFailures - 1))
      );

      quizRetryAt =
        Date.now() + retryAfterMs;

      console.warn('[SITE QUIZ SYNC]', {
        name:
          error?.name || 'Error',

        status:
          error?.status || null,

        code:
          error?.code || null,

        timedOut:
          error?.name === 'TimeoutError' ||
          error?.name === 'AbortError',

        retryAfterMs,

        nextRetryAt:
          new Date(quizRetryAt).toISOString(),

        phase: error?.phase || null,
        durationMs: error?.durationMs ?? null,
        timeoutMs: error?.timeoutMs ?? null,
        upstreamStatus: error?.upstreamStatus ?? null,

        message:
          String(
            error?.message ||
            'Falha na consulta ao bot do quiz.'
          ),
      });
    } finally {
      quizPollBusy = false;
    }
  }

  const quizRefreshTimer =
    setInterval(
      () => {
        void refreshQuizBridge();
      },
      30000
    );

  quizRefreshTimer.unref?.();

  const quizInitialRefresh =
    setTimeout(
      () => {
        void refreshQuizBridge();
      },
      1000
    );

  quizInitialRefresh.unref?.();

  const snapshotKey = (guild, member, action, payload = {}) => {
    const moduleKey = action === 'history.snapshot' ? payload.module : action.split('.')[0];
    const cleanPayload = { ...payload };
    delete cleanPayload.refresh;
    delete cleanPayload.requireFresh;
    delete cleanPayload.poll;
    delete cleanPayload.snapshotOnly;
    const permissionChannels = new Set(
      action === 'bootstrap' ? Object.values(CHANNELS).flat() :
      action === 'teamRequests.list' ? CHANNELS.staff || [] :
      CHANNELS[moduleKey] || []
    );
    if (action === 'bootstrap' || action === 'teamRequests.list') {
      permissionChannels.add('1428003736671883405');
      permissionChannels.add('1352706078621696030');
      permissionChannels.add(String(
        process.env.SETSTAFF_V2_CANAL_REGISTRO || '1379024704957841509'
      ).trim());
    }
    if (moduleKey === 'events') {
      permissionChannels.add('1457577651152883797');
      const cds = String(process.env.SANTA_EVENTS_CDS_CHANNEL_ID || '').trim();
      if (cds) permissionChannels.add(cds);
      for (const channel of guild.channels.cache.values()) {
        if (channel.parentId === '1457577651152883797') permissionChannels.add(channel.id);
      }
    }
    const permissionKey = [member.roles.cache.map(role => role.id).sort(),
      member.permissions.bitfield.toString(), [...permissionChannels].sort().map(id => {
        const channel = guild.channels.cache.get(id);
        return [id, channel?.permissionsFor(member)?.bitfield.toString() || ''];
      })];
    return snapshots.key([guild.id, member.id, action, cleanPayload, permissionKey]);
  };

  app.post(
    "/site-hub",

    (req, res, next) => {
      const startedAt = Date.now();

      const incomingId =
        req.headers["x-request-id"];

      const requestId =
        typeof incomingId === "string" &&
        /^[a-z0-9-]{1,80}$/i.test(incomingId)
          ? incomingId
          : null;

      const rawTimeout =
        req.headers["x-sc-hub-timeout-ms"];

      const numericTimeout =
        typeof rawTimeout === "string" &&
        /^\d+$/.test(rawTimeout)
          ? Number(rawTimeout)
          : NaN;

      const timeoutMs =
        Number.isSafeInteger(numericTimeout) &&
        numericTimeout > 0 &&
        numericTimeout <= 120000
          ? numericTimeout
          : null;

      let reported = false;

      if (requestId) {
        res.setHeader(
          "X-Request-ID",
          requestId
        );
      }

      const report = completed => {
        if (reported) {
          return;
        }

        reported = true;

        const durationMs =
          Date.now() - startedAt;

        if (
          completed &&
          res.statusCode < 400 &&
          durationMs < 10000
        ) {
          return;
        }

        console.warn(
          "[SITE HUB TRACE]",
          {
            requestId,
            action:
              typeof req.body?.action === "string"
                ? req.body.action.slice(0, 100)
                : null,
            status:
              completed
                ? res.statusCode
                : null,
            contentType:
              res.getHeader("content-type") ||
              null,
            name:
              completed
                ? res.statusCode >= 400
                  ? "HttpResponseError"
                  : "SlowResponse"
                : "ResponseClosed",
            timeoutMs,
            durationMs,
            completed,
          }
        );
      };

      res.once(
        "finish",
        () => report(true)
      );

      res.once(
        "close",
        () => {
          if (!res.writableFinished) {
            report(false);
          }
        }
      );

      next();
    },

    (req, res, next) => {
      express.json({
        limit: "128kb",
      })(req, res, error => {
        if (!error) {
          return next();
        }

        const status =
          error.type === "entity.too.large"
            ? 413
            : 400;

        res.setHeader(
          "Cache-Control",
          "no-store"
        );

        return res.status(status).json({
          error:
            status === 413
              ? "Os dados enviados excedem o limite de 128 KB."
              : "O corpo da requisição contém JSON inválido.",
        });
      });
    },

    async (
      req,
      res
    ) => {
      res.setHeader(
        "Cache-Control",
        "no-store"
      );

      try {
        if (
          !safeSecretEqual(
            req.headers
              .authorization,
            secret
          )
        ) {
          return res
            .status(401)
            .json({
              error:
                "Ponte não autorizada.",
            });
        }

        if (
          !req.body ||
          typeof req.body !== "object" ||
          Array.isArray(req.body)
        ) {
          return res.status(400).json({
            error:
              "O corpo da requisição deve ser um objeto JSON.",
          });
        }

        if (
          typeof req.body.action !== "string" ||
          !req.body.action.trim() ||
          req.body.action.length > 100
        ) {
          return res.status(400).json({
            error:
              "Informe uma ação válida da Central.",
          });
        }

        if (
          req.body.payload != null &&
          (
            typeof req.body.payload !== "object" ||
            Array.isArray(req.body.payload)
          )
        ) {
          return res.status(400).json({
            error:
              "Os dados da operação devem ser um objeto JSON.",
          });
        }

        const guildId =
          String(
            req.body
              ?.guildId ||
            ""
          );

        const actorId =
          String(
            req.body
              ?.actorId ||
            ""
          );

        const action =
          String(
            req.body
              ?.action ||
            ""
          );

        const payload =
          req.body
            ?.payload &&
          typeof req.body
            .payload ===
            "object"
            ? req.body
                .payload
            : {};

        if (
          guildId !==
          GUILD_ID
        ) {
          return res
            .status(400)
            .json({
              error:
                "Servidor inválido.",
            });
        }

        if (
          action ===
            'quiz.archive.read'
        ) {
          if (
            actorId
          ) {
            return res
              .status(403)
              .json({
                error:
                  'Esta leitura é exclusiva do servidor do site.',
              });
          }

          const snapshot =
            await globalThis
              .__SC_QUIZ_SITE_API__
              .snapshot({
                refresh:
                  true,
              });

          return res.json({
            ...snapshot,

            rights: {
              reset:
                false,
            },
          });
        }

        if (
          !action.startsWith('public.') &&
          !/^\d{17,20}$/.test(actorId)
        ) {
          return res
            .status(400)
            .json({
              error:
                "Usuário inválido.",
            });
        }

        if (
          action ===
          "profile-options"
        ) {
          return res.json(
            getSetStaffSiteOptions()
          );
        }

        if (
          !client.isReady()
        ) {
          throw Object.assign(
            new Error(
              'O bot ainda está conectando ao Discord.'
            ),
            {
              status: 503,
            }
          );
        }

        const guild = client.guilds.cache.get(GUILD_ID) ||
          await client.guilds.fetch(GUILD_ID);

        const permissionRead =
          action === 'bootstrap' ||
          action === 'profile-options' ||
          action === 'identity.batch' ||
          action === 'ai.ask' ||
          action === 'notifications.seen' ||
          action.endsWith('.snapshot') ||
          [
            'cache.authorize',
            'teamRequests.list',
            'workflow.catalog',
            'workflow.list',
            'workflow.schema',
            'events.published',
            'mywins.detail',
          ].includes(action) ||
          action.startsWith('history.') ||
          action.startsWith('public.');

        await refreshDiscordPermissions(
          guild,
          !permissionRead
        );

        if (action.startsWith('public.')) {
          const modules = {};
          for (const key of ['hall', 'quiz']) {
            modules[key] = CHANNELS[key].some(channelId => {
              const channel = guild.channels.cache.get(channelId);
              return channel?.guildId === guild.id &&
                channel.permissionsFor(guild.roles.everyone)?.has([
                  PermissionFlagsBits.ViewChannel,
                  PermissionFlagsBits.ReadMessageHistory,
                ]);
            });
          }
          if (action === 'public.bootstrap') return res.json({ modules, source: 'discord-public' });
          if (action === 'public.hall.snapshot' && modules.hall) {
            return res.json(await getHallSiteSnapshot({ guild, publicAccess: true }));
          }
          if (action === 'public.quiz.snapshot' && modules.quiz) {
            if (!globalThis.__SC_QUIZ_SITE_API__) throw Object.assign(new Error('Quiz ainda está inicializando.'), { status: 503 });
            const snapshot = await globalThis.__SC_QUIZ_SITE_API__.snapshot({ actorId: '' });
            return res.json({ ...snapshot, rights: { reset: false } });
          }
          return res.status(403).json({ error: 'Esta área exige login ou acesso ao canal do Discord.' });
        }
        const member = await resolveSiteMember(
          guild,
          actorId,
          action === 'central.access' ||
          !permissionRead ||
          (
            payload.requireFresh === true &&
            payload.poll !== true
          )
        );

        if (!member) {
          return res
            .status(403)
            .json({
              error:
                "Você não está no servidor Santa Creators.",
            });
        }

        if (action === 'central.access') {
          const mode =
            String(
              payload.mode || 'view'
            );

          if (
            !['view', 'admin'].includes(mode)
          ) {
            return res.status(400).json({
              error:
                'Modo de Central inválido.',
            });
          }

          const allowed =
            mode === 'view'
              ? canUsePersonalSantaCreatorsCentral(
                  member
                )
              : (
                  member.id === '660311795327828008' ||
                  isOfficialSantaCreatorsTeamMember(
                    member
                  )
                );

          if (!allowed) {
            return res.status(403).json({
              error:
                mode === 'view'
                  ? 'Sua Central é exclusiva do Owner e do Dark.'
                  : 'A Central Creators é exclusiva da equipe autorizada.',
            });
          }

          return res.json({
            allowed: true,
            actorId: member.id,
            mode,
          });
        }

        if (action === 'central.access') {
          const mode = String(payload.mode || 'view');

          if (!['view', 'admin'].includes(mode)) {
            return res.status(400).json({
              error: 'Modo de Central inválido.',
            });
          }

          const personalAllowed =
            !member.user?.bot &&
            (
              member.id === '660311795327828008' ||
              member.roles?.cache?.has('1262262852949905408') === true
            );

          const teamAllowed =
            !member.user?.bot &&
            (
              personalAllowed ||
              isOfficialSantaCreatorsTeamMember(member)
            );

          const allowed = mode === 'view'
            ? personalAllowed
            : teamAllowed;

          res.setHeader('Cache-Control', 'no-store');

          if (!allowed) {
            return res.status(403).json({
              error: mode === 'view'
                ? 'Sua Central é exclusiva do Owner e do Dark.'
                : 'A Central Creators é exclusiva da equipe autorizada.',
            });
          }

          return res.json({
            allowed: true,
            actorId: member.id,
            mode,
          });
        }

        const siteReadOnlyVisitor =
          member.id !== '660311795327828008' &&
          !isOfficialSantaCreatorsTeamMember(member);

        const siteVisitorReadActions = new Set([
          'bootstrap',
          'cache.authorize',
          'identity.batch',
          'profile-options',
          'changes.snapshot',
          'notifications.snapshot',
          'notifications.seen',

          'mywins.snapshot',
          'mywins.detail',
          'viprequest.snapshot',
          'viprequest.submit',

          'orgticket.snapshot',

          'orgpresence.snapshot',
          'orgpresence.confirm',
          'orgpresence.image',

          'events.published',
          'orginvites.snapshot',
          'orgblacklist.snapshot',

          'hall.snapshot',
          'quiz.snapshot',
          'cronograma.snapshot',
        ]);

        const discordModuleRead =
          action.endsWith('.snapshot') &&
          ![
            'staff.snapshot',
            'ai.snapshot',
          ].includes(action) &&
          Object.hasOwn(
            CHANNELS,
            action.slice(0, -'.snapshot'.length)
          );

        if (
          siteReadOnlyVisitor &&
          !siteVisitorReadActions.has(action) &&
          !discordModuleRead
        ) {
          return res.status(403).json({
            error:
              'Esta ação exige uma permissão de gerenciamento.',
          });
        }

        if (
          siteReadOnlyVisitor &&
          discordModuleRead
        ) {
          await assertModuleView(
            client,
            member,
            action.slice(0, -'.snapshot'.length)
          );
        }

        if (action === 'discordview.snapshot') {
          return res.json(
            await siteReadOnlySnapshot(member, payload)
          );
        }

        if (
          action === 'timeclock.form' ||
          action === 'timeclock.submit'
        ) {
          const centralMember =
            member.id === '660311795327828008' ||
            isOfficialSantaCreatorsTeamMember(
              member
            );

          if (!centralMember) {
            return res.status(403).json({
              error:
                'O bate-ponto é exclusivo da equipe autorizada.',
            });
          }

          const timeclock =
            client.__SC_BP_SITE_API__;

          if (
            typeof timeclock?.form !== 'function' ||
            typeof timeclock?.submit !== 'function'
          ) {
            return res.status(503).json({
              error:
                'O sistema de bate-ponto ainda não está disponível.',
            });
          }

          if (action === 'timeclock.form') {
            return res.json(
              await timeclock.form({
                guild,
                member,
              })
            );
          }

          const result =
            await timeclock.submit({
              guild,
              actorId: member.id,
              payload,
            });

          snapshots.invalidate(
            'weekly'
          );

          snapshots.invalidate(
            'nps'
          );

          return res.json(result);
        }

        if (
          action === 'social.form' ||
          action === 'social.submit'
        ) {
          const centralMember =
            member.id === '660311795327828008' ||
            isOfficialSantaCreatorsTeamMember(member);

          if (!centralMember) {
            return res.status(403).json({
              error:
                'O registro de pagamento é exclusivo da equipe autorizada.',
            });
          }

          if (action === 'social.form') {
            return res.json(
              await getPagamentoSocialSiteForm({
                guild,
                member,
              })
            );
          }

          const result =
            await submitPagamentoSocialFromSite({
              client,
              guild,
              actorId: member.id,
              payload,
            });

          snapshots.invalidate('social');
          snapshots.invalidate('weekly');
          snapshots.invalidate('nps');

          return res.json(result);
        }

        if (
          action === 'absences.form' ||
          action === 'absences.submit'
        ) {
          const centralMember =
            member.id === '660311795327828008' ||
            isOfficialSantaCreatorsTeamMember(
              member
            );

          if (!centralMember) {
            return res.status(403).json({
              error:
                'O registro de ausência é exclusivo da equipe autorizada.',
            });
          }

          if (action === 'absences.form') {
            return res.json(
              await getAbsenceSiteForm({
                guild,
                member,
              })
            );
          }

          const result =
            await submitAbsenceFromSite({
              client,
              guild,
              actorId: member.id,
              payload,
            });

          snapshots.invalidate(
            'absences'
          );

          return res.json(result);
        }

        if (
          await community.handle({
            guild,
            member,
            action,
            payload,
            res,
          })
        ) {
          return;
        }

        const isCentralActor =
          member.id === '660311795327828008' ||
          isOfficialSantaCreatorsTeamMember(member);

        const internalModules = new Set([
          'vipadmin',
          'timeclock',
          'absences',
          'nps',
          'checklist',
          'workflow',
          'events',
          'retention',
          'staff',
          'teamRequests',
          'gi',
          'hierarchy',
          'weekly',
          'manager',
          'social',
          'payments',
          'ai',
          'notifications',
        ]);

        const requestedAction = action === 'cache.authorize'
          ? String(payload.action || '')
          : action;

        const requestedModule = requestedAction.startsWith('history.')
          ? String(
              action === 'cache.authorize'
                ? payload.payload?.module || ''
                : payload.module || ''
            )
          : requestedAction.split('.')[0];

        const isRegistrationAction =
          action === 'staff.submit' ||
          action === 'staff.retry' ||
          action === 'profile-options';

        const requestedDiscordRead =
          requestedAction.endsWith('.snapshot') &&
          ![
            'staff.snapshot',
            'ai.snapshot',
          ].includes(requestedAction) &&
          Object.hasOwn(
            CHANNELS,
            requestedModule
          );

        if (
          !isCentralActor &&
          requestedDiscordRead
        ) {
          await assertModuleView(
            client,
            member,
            requestedModule
          );
        }

        if (
          !isCentralActor &&
          !isRegistrationAction &&
          ![
            'notifications.snapshot',
            'notifications.seen',
          ].includes(action) &&
          !requestedDiscordRead &&
          requestedAction !== 'events.published' &&
          (
            internalModules.has(requestedModule) ||
            requestedAction.startsWith('history.') ||
            requestedAction === 'quiz.reset'
          )
        ) {
          return res.status(403).json({
            error:
              'Esta ação é exclusiva da equipe autorizada.',
          });
        }

        if (
          action === 'notifications.snapshot' ||
          action === 'notifications.seen'
        ) {
          const startedAt = Date.now();

          if (
            process.env.SITE_NOTIFICATIONS_DEBUG === '1' &&
            (
              action !== 'notifications.snapshot' ||
              payload.poll !== true
            )
          ) {
            console.info(
              '[SITE HUB] Notificações recebidas:',
              {
                guildId: guild.id,
                actorId: member.id,
                action,
                poll: payload.poll === true,
                refresh: payload.refresh === true,
              }
            );
          }

          try {
            const result = await notifications.handle({
              guild,
              member,
              action,
              payload,
              memberVerified: true,
            });

            const durationMs =
              Date.now() - startedAt;

            if (
              (
                process.env.SITE_NOTIFICATIONS_DEBUG === '1' &&
                (
                  payload.poll !== true ||
                  result.pending !== true
                )
              ) ||
              durationMs >= 2000
            ) {
              console.info(
                '[SITE HUB] Notificações respondidas:',
                {
                  guildId: guild.id,
                  actorId: member.id,
                  action,
                  durationMs,
                  status:
                    result.pending === true ? 202 : 200,
                  pending:
                    result.pending === true,
                }
              );
            }

            return res
              .status(result.pending === true ? 202 : 200)
              .json(result);
          } catch (error) {
            console.warn(
              '[SITE HUB] Notificações falharam:',
              {
                guildId: guild.id,
                actorId: member.id,
                action,
                durationMs:
                  Date.now() - startedAt,
                status:
                  error.status || error.statusCode || null,
                code:
                  error.code || null,
                name:
                  error.name,
              }
            );

            throw error;
          }
        }

        if (
          action.startsWith('notifications.')
        ) {
          return res.status(404).json({
            error:
              'Ação de notificação não encontrada.',
          });
        }

        if (action === 'checklist.snapshot') {
          return res.json(
            await getChecklistSiteSnapshot({
              guild,
              member,
            })
          );
        }

        if (action === 'checklist.set') {
          return res.json(
            await checklistSiteAction({
              client,
              guild,
              member,
              payload,
            })
          );
        }

        if (action.startsWith('checklist.')) {
          return res.status(404).json({
            error:
              'Ação de checklist não encontrada.',
          });
        }

        if (
          action ===
            'events.published'
        ) {
          const allowed =
            isOfficialSantaCreatorsTeamMember(
              member
            ) ||
            isCreatorsCommunityMember(
              member
            );

          if (
            !allowed
          ) {
            return res
              .status(403)
              .json({
                error:
                  'Conclua seu acesso como cidadão para visualizar as regras.',
              });
          }

          return res.json(
            await eventsLibrary.handle({
              guild,
              member,
              action,
              payload,
            })
          );
        }

        if (action === 'absences.snapshot') {
          await assertModuleView(
            client,
            member,
            'absences'
          );

          if (guild.id !== '1262262852782129183') {
            throw Object.assign(
              new Error('Ausências indisponíveis neste servidor.'),
              { status: 403 }
            );
          }

          if (
            payload.refresh === true &&
            payload.poll !== true
          ) {
            const currentMonth =
              new Intl.DateTimeFormat(
                'en-US',
                {
                  timeZone:
                    'America/Sao_Paulo',

                  year:
                    'numeric',

                  month:
                    '2-digit'
                }
              ).formatToParts(
                new Date()
              );

            const currentMonthKey =
              currentMonth.find(
                part =>
                  part.type === 'year'
              ).value +
              '-' +
              currentMonth.find(
                part =>
                  part.type === 'month'
              ).value;

            if (
              !payload.month ||
              String(payload.month) === currentMonthKey
            ) {
              await requestAbsencesSiteSnapshot(
                client,
                {
                  requireFresh: true
                }
              );
            }
          }

          let stored;

          try {
            stored = JSON.parse(
              await readSiteAbsencesFile(
                resolveSiteAbsencesPath(
                  process.cwd(),
                  'data',
                  'ausencias_dashboard.json'
                ),
                'utf8'
              )
            );
          } catch (error) {
            if (
              error.code === 'ENOENT'
            ) {
              requestAbsencesSiteSnapshot(
                client
              );
            }

            throw Object.assign(
              new Error(
                error.code === 'ENOENT'
                  ? 'O bot ainda não gerou o snapshot de ausências.'
                  : 'Não foi possível ler o snapshot de ausências.'
              ),
              {
                status: 503,
                cause: error
              }
            );
          }

          if (
            stored?.version !== 1 ||
            !stored.months ||
            typeof stored.months !== 'object' ||
            Array.isArray(stored.months)
          ) {
            throw Object.assign(
              new Error('O snapshot de ausências está inválido.'),
              { status: 503 }
            );
          }

          const months = Object.keys(stored.months)
            .filter(key =>
              /^\d{4}-(0[1-9]|1[0-2])$/.test(key)
            )
            .sort()
            .reverse();

          const requestedMonth = String(
            payload.month || months[0] || ''
          );

          if (
            !months.includes(requestedMonth)
          ) {
            throw Object.assign(
              new Error('Não há snapshot disponível para este mês.'),
              { status: 404 }
            );
          }

          const month = stored.months[requestedMonth];

          if (
            !month ||
            month.monthKey !== requestedMonth ||
            !Array.isArray(month.ranking) ||
            month.ranking.some(item =>
              !item ||
              typeof item !== 'object' ||
              Array.isArray(item) ||
              !Number.isSafeInteger(item.total) ||
              item.total < 0 ||
              (
                item.dias != null &&
                (
                  !Array.isArray(item.dias) ||
                  item.dias.some(day =>
                    typeof day !== 'string' ||
                    !/^\d{4}-\d{2}-\d{2}$/.test(day)
                  )
                )
              )
            )
          ) {
            throw Object.assign(
              new Error('Os dados deste mês estão inválidos.'),
              { status: 503 }
            );
          }

          return res.json({
            months,
            month
          });
        }

        if (action === 'nps.snapshot') {
          await assertModuleView(
            client,
            member,
            'nps'
          );

          return res.json(
            getNpsSiteSnapshot({
              guild,
              client
            })
          );
        }

        if (action === 'changes.snapshot') return res.json({ revision: snapshots.revision() });
        const authorizeStoredRead = async (requested, requestedPayload = {}) => {
          if (requested === 'bootstrap') return;
          if (requested === 'teamRequests.list') {
            if (
              (!isOfficialSantaCreatorsTeamMember(member) && member.id !== '660311795327828008') ||
              !await teamRequests.canView(guild, member)
            ) {
              throw Object.assign(new Error('Você não possui acesso aos pedidos da equipe.'), { status: 403 });
            }
            return;
          }
          const module = requested === 'history.snapshot'
            ? requestedPayload.module : requested.split('.')[0];
          if (!requested.endsWith('.snapshot') || !CHANNELS[module]) {
            throw Object.assign(new Error('Consulta de cache inválida.'), { status: 400 });
          }
          await assertModuleView(client, member, module);
        };

        if (action === 'cache.authorize') {
          const requested = String(payload.action || '');
          const requestedPayload = payload.payload || {};
          await authorizeStoredRead(requested, requestedPayload);
          return res.json({ scope: snapshotKey(guild, member, requested, requestedPayload) });
        }

        if (
          action === 'retention.snapshot' &&
          payload.snapshotOnly === true
        ) {
          await assertModuleView(client, member, 'retention');
          const prepared = await getFivemRetentionSiteSnapshot({
            cityKey: payload.city || null,
            snapshotOnly: true,
          });
          return res.json({
            ...prepared,
            cacheScope: snapshotKey(guild, member, action, payload),
          });
        }

        // Autorizar ANTES de ler qualquer consulta persistida, inclusive em atualização manual.
        const moduleKey = action === 'teamRequests.list' ? 'staff' : action.split('.')[0];

        if (
          action === 'bootstrap' ||
          action === 'teamRequests.list' ||
          (
            action.endsWith('.snapshot') &&
            CHANNELS[moduleKey] &&
            ![
              'weekly.snapshot',
              'gi.snapshot',
              'hierarchy.snapshot',
            ].includes(action)
          )
        ) {
          await authorizeStoredRead(action, payload);
          const key = snapshotKey(guild, member, action, payload);
          const saved = snapshots.get(key);
          const deliver = record => {
            const value = JSON.parse(
              JSON.stringify(record.value)
            );

            return {
              ...value,
              cacheScope: key,
              delivery: {
                savedAt: record.at,
                updating: record.updating === true,
                stale: record.fresh !== true,
                invalidated: record.invalidated === true,
                source: 'consulta-salva',
              },
            };
          };
          const previousError = snapshots.error(key);
          if (
            previousError &&
            (
              payload.poll === true ||
              payload.refresh !== true
            )
          ) {
            if (
              saved &&
              !payload.requireFresh &&
              payload.poll !== true
            ) {
              return res.json(
                deliver({
                  ...saved,
                  fresh: false
                })
              );
            }

            throw previousError;
          }
          const completedPoll =
            payload.poll === true &&
            saved &&
            (
              saved.invalidated === false ||
              moduleKey === 'retention'
            ) &&
            saved.updating === false;

          if (
            completedPoll ||
            (
              saved?.fresh &&
              !payload.refresh
            )
          ) {
            return res.json(
              deliver(saved)
            );
          }

          const task = snapshots.begin(key, moduleKey);

          if (!task.owner) {
            if (saved && !payload.requireFresh) {
              return res.json(
                deliver({
                  ...saved,
                  fresh: false,
                  updating: true
                })
              );
            }

            return res.status(202).json({
              pending: true
            });
          }
          const realResponse = res;

          const background = true;

          if (background) {
            if (saved && !payload.requireFresh) {
              realResponse.json(
                deliver({
                  ...saved,
                  fresh: false,
                  updating: true
                })
              );
            } else {
              realResponse.status(202).json({
                pending: true
              });
            }
          }

          let statusCode = 200;
          res = {
            get statusCode() { return statusCode; },
            status(code) { statusCode=code;return this; },
            json(value) {
              if (
                statusCode < 400 &&
                value?.pending !== true &&
                !value?.error
              ) {
                const malformed =
                  !value ||
                  typeof value !== 'object' ||
                  Array.isArray(value) ||
                  (
                    action === 'retention.snapshot' &&
                    !Array.isArray(value.cities)
                  ) ||
                  (
                    action === 'teamRequests.list' &&
                    !Array.isArray(value.categories)
                  ) ||
                  (
                    action === 'nps.snapshot' &&
                    (
                      !Array.isArray(value.categories) ||
                      !Array.isArray(value.history)
                    )
                  ) ||
                  (
                    action === 'bootstrap' &&
                    (
                      !value.modules ||
                      typeof value.modules !== 'object' ||
                      Array.isArray(value.modules)
                    )
                  );

                if (malformed) {
                  statusCode = 502;

                  value = {
                    error:
                      'A consulta retornou um formato incompleto. O snapshot anterior foi preservado.'
                  };
                }
              }

              if (value?.pending === true && statusCode < 400 && !value?.error) {
                snapshots.finish(key, null);
                return value;
              }
              if (statusCode>=400 || value?.error) {
                if (statusCode < 400) {
                  statusCode = 502;
                }

                snapshots.finish(
                  key,
                  null,
                  Object.assign(
                    new Error(
                      value?.error ||
                      'Falha ao atualizar consulta'
                    ),
                    {
                      status: statusCode
                    }
                  )
                );
              } else {
                if(moduleKey==='gi' && Array.isArray(value.records)) {
                  value.records=[...new Map([...value.records].sort((a,b)=>Number(a.createdAtMs||0)-Number(b.createdAtMs||0)).map(item=>[String(item.targetId)+':'+String(item.area||''),item])).values()]
                    .map(item=>({...item,rolePosition:guild.members.cache.get(String(item.targetId))?.roles.highest.position || 0}))
                    .sort((a,b)=>b.rolePosition-a.rolePosition);
                }
                value.cacheScope = key;

                const finishError =
                  snapshots.finish(
                    key,
                    value
                  );

                if (finishError) {
                  statusCode =
                    Number(finishError.status) || 503;

                  value = {
                    error:
                      finishError.message ||
                      'Não foi possível armazenar a consulta.'
                  };
                }
              }
              const stored = snapshots.get(key);
              if (statusCode < 400 && !value?.error && !stored) {
                statusCode = 413;
                value = { error: 'Não foi possível armazenar esta consulta: o resultado excedeu o limite permitido.' };
              }
              if (!background) {
                return realResponse.status(statusCode).json(
                  statusCode < 400 && stored ? deliver(stored) : value
                );
              }
              if (statusCode >= 400) {
                console.warn('[SITE CONSULTAS]', moduleKey, statusCode, value?.error);
              }
              return value;
            }
          };
} else if (![
  'weekly.snapshot',
  'bootstrap',
  'profile-options',
  'identity.batch',
  'ai.ask',
  'teamRequests.list',
  'workflow.catalog',
  'workflow.list',
  'workflow.schema',
].includes(action) &&
  !action.startsWith('history.') &&
  !action.startsWith('profile.')) {
          // Toda escrita real passa pelas validações originais; a próxima consulta será refeita.
          snapshots.invalidate(
            action === 'teamRequests.decide'
              ? 'staff'
              : null
          );
        }

        if (action === 'vipadmin.snapshot') {
          await assertModuleView(
            client,
            member,
            'vipadmin'
          );

          return res.json(
            await getVipEventoAdminSiteSnapshot({
              guild,
              member,
              before: payload.before,
            })
          );
        }

        if (action.startsWith('events.')) {
          await assertModuleView(client, member, 'events');

          if (action === 'events.confirm') {
            return bridgeOperations.respond({
              res,
              guildId: guild.id,
              actorId,
              action,
              payload,

              execute: () => eventsLibrary.handle({
                guild,
                member,
                action,
                payload,
              }),
            });
          }

          return res.json(
            await eventsLibrary.handle({
              guild,
              member,
              action,
              payload
            })
          );
        }

        if (
          action === 'teamRequests.list' ||
          action === 'teamRequests.decide'
        ) {
          if (
            !isOfficialSantaCreatorsTeamMember(member) &&
            member.id !== '660311795327828008'
          ) {
            throw Object.assign(
              new Error(
                'Esta área é exclusiva da equipe autorizada.'
              ),
              { status: 403 }
            );
          }

          return res.json(
            action === 'teamRequests.list'
              ? await teamRequests.list({
                guild,
                member,
                payload,
              })
              : await teamRequests.decide({
                guild,
                member,
                payload,
              })
          );
        }

        if (
  action.startsWith('workflow.')
) {
  if (
    member.id !== '660311795327828008' &&
    !isOfficialSantaCreatorsTeamMember(
      member
    )
  ) {
    return res
      .status(403)
      .json({
        error:
          'Esta área é exclusiva da Central Creators.',
      });
  }

  if (
    action === 'workflow.catalog'
  ) {
    return res.json(
      await workflowCatalog(
        guild,
        member
      )
    );
  }

  const workflowAction =
    action.slice(
      'workflow.'.length
    );

  if (
    ![
      'schema',
      'create',
      'list',
      'prepare',
      'decide',
    ].includes(
      workflowAction
    )
  ) {
    return res
      .status(404)
      .json({
        error:
          'Ação de publicação não encontrada.',
      });
  }

  const module =
    String(
      payload.module || ''
    );

  if (module === 'managerRegistration') {
    return res.json(
      await registroManagerSiteRegistration({
        client,
        guild,
        member,
        action: workflowAction,
        payload,
      })
    );
  }

  const provider =
    workflowProviders[module];

  if (!provider) {
    return res
      .status(400)
      .json({
        error:
          'Escolha Hall da Fama, eventos diários ou alinhamentos.',
      });
  }

  return res.json(
    await provider.site({
      client,
      guild,
      member,

      action:
        workflowAction,

      payload,
    })
  );
}

if (await experience.handle({ guild, member, action, payload, res })) return;

        // ==========================================
        // BOOTSTRAP
        // ==========================================

        if (
  action ===
  "bootstrap"
) {
  const entries =
    await Promise.all(
      Object.keys(
        CHANNELS
      ).map(
        async key => [
          key,

          await canAccessSiteModule(
            client,
            member,
            key
          ),
        ]
      )
    );

  const eventsEntry =
    entries.find(
      ([key]) =>
        key === 'events'
    );

  if (eventsEntry) {
    eventsEntry[1] = await canAccessSiteModule(
      client,
      member,
      'events'
    );
  }

  const isCentralMember =
    member.id === '660311795327828008' ||
    isOfficialSantaCreatorsTeamMember(member);

  if (isCentralMember) {
    const staffEntry = entries.find(
      ([key]) => key === 'staff'
    );

    if (staffEntry) {
      staffEntry[1] = await teamRequests.canView(
        guild,
        member
      );
    }
  }

  const workflowData = await workflowCatalog(
    guild,
    member
  );

    entries.push([
    'workflow',
    workflowData.modules.length > 0 ||
    workflowData.confirmOrganization === true ||
    workflowData.timeclock?.rights?.view === true ||
    workflowData.paymentForm?.rights?.create === true,
  ]);

  for (
    const key
    of ['powersdaily', 'powersevent']
  ) {
    entries.push([
      key,

      isCentralMember
        ? workflowData.modules.some(module =>
            module.key === key &&
            module.rights?.view === true
          )
        : await canAccessSiteModule(
            client,
            member,
            key
          ),
    ]);
  }

  const checklistCatalog =
    isCentralMember
      ? await getChecklistSiteCatalog({
          guild,
          member,
        })
      : {
          allowed: false,
        };

  entries.push([
    'checklist',
    isCentralMember && checklistCatalog.allowed,
  ]);

  const communityAccess =
    await community.access(member);

  for (const key of [
    'mywins',
    'viprequest',
    'orgticket',
    'orgpresence',
    'orginvites',
    'orgblacklist',
  ]) {
    entries.push([
      key,
      communityAccess[key] === true,
    ]);
  }

  const socialEntry = entries.find(
    ([key]) => key === 'social'
  );

  const vipEntry = entries.find(
    ([key]) => key === 'vipadmin'
  );

  entries.push([
    'payments',
    isCentralMember &&
    (
      socialEntry?.[1] === true ||
      vipEntry?.[1] === true
    ),
  ]);

  return res.json({
    modules:
      Object.fromEntries(
        entries
      ),

    previews: Object.fromEntries(entries.filter(([,allowed]) => allowed).flatMap(([key]) => {
      const saved = snapshots.get(snapshotKey(guild, member, key+'.snapshot', key==='retention'?{city:null}:{}));
      if(!saved)return [];
      const value=saved.value;
      // Resumos leves: não duplicar listas completas na página inicial.
      return [[key, { count: key==='weekly' ? (Array.isArray(value.ranking)?value.ranking:value.ranking?.ranking||value.ranking?.items||[]).length :
        key==='gi' ? value.records?.length||0 : key==='manager' ? value.presence?.organizations?.length||0 :
        key==='hall' ? value.players?.length||0 : key==='staff' ? value.requests?.length||value.records?.length||0 : 0,
        totalPlayers:value.totals?.current ?? null, cityCount:value.cities?.length||0, savedAt:saved.at }]];
    })),
    profile: { ...experience.profile(member), preferences: await experience.preferences(guild, member) },
    team: isCentralMember,

    personalCentralAllowed:
      canUsePersonalSantaCreatorsCentral(
        member
      ),

    personalCentralActorId:
      member.id,

    readOnlyVisitor: !isCentralMember,

    discordReadOnlyModules: !isCentralMember
      ? Object.fromEntries(
          await Promise.all(
            [
              ...Object.keys(CHANNELS),
              'payments',
            ]
              .filter((key, index, keys) =>
                keys.indexOf(key) === index &&
                key !== 'ai'
              )
              .map(async key => [
                key,
                (
                  await siteReadOnlyChannels(member, key)
                ).length > 0,
              ])
          )
        )
      : {},

    community: {
      organizations:
        communityAccess.organizations,

      tickets:
        communityAccess.tickets.map(item => ({
          channelId: item.channelId,
          name: item.orgName,
        })),
    },

    source:
      'discord-live',

    generatedAt:
      Date.now(),
  });
}


        // ==========================================
        // CADASTRO / SET STAFF
        // ==========================================

        if (
          action ===
          "profile-options"
        ) {
          return res.json(
            getSetStaffSiteOptions()
          );
        }

        if (
          action ===
          "staff.submit"
        ) {
          const result =
            await submitSetStaffFromSite({
              client,
              guild,

              userId:
                actorId,

              data:
                payload,
            });

          return res.json(
            result
          );
        }

        if (
          action ===
          "staff.snapshot"
        ) {
          await assertModuleView(
            client,
            member,
            "staff"
          );

          return res.json(
            await getSetStaffSiteSnapshot({
              guild,
              actorId,
            })
          );
        }


        if (
          action ===
          "staff.decide"
        ) {
          await assertModuleView(
            client,
            member,
            "staff"
          );

          return res.json(
            await decideSetStaffFromSite({
              client,
              guild,
              actorId,

              msgId:
                payload.msgId,

              action:
                payload.action,
            })
          );
        }


        // ==========================================
        // ORGANIZAÇÃO MANAGER
        // ==========================================

        if (
          action ===
          "manager.snapshot"
        ) {
          await assertModuleView(
            client,
            member,
            "manager"
          );

          const [
            records,
            presence,
            approvers,
            performance,
            invitations,
          ] =
            await Promise.all([
              getRegistroManagerSiteSnapshot({
                client,
                guild,
                actorId,
              }),

              getConfirmacaoPresencaSiteSnapshot({
                guild,
                actorId,
              }),

              getRankingAprovadoresManagersSiteSnapshot({
                client,
                member,
                actorId,
              }),

              getGraficoManagersSiteSnapshot({
                guild,
                actorId,
              }),

              getFacsSemanaisHistorySiteSnapshot({
                client,
                guild,
              }).catch(error => {
                console.warn(
                  '[SITE HUB] Histórico de convites indisponível:',
                  error
                );

                return {
                  weeks: [],

                  error:
                    'Não foi possível carregar o histórico de convites.',
                };
              }),
            ]);

          return res.json({
            records,
            presence,
            approvers,
            performance,
            invitations,
          });
        }


        if (
          action ===
          "manager.decision"
        ) {
          await assertModuleView(
            client,
            member,
            "manager"
          );

          return res.json(
            await registroManagerSiteDecision({
              client,
              guild,
              actorId,

              messageId:
                payload.messageId,

              action:
                payload.action,

              reason:
                payload.reason ||
                "",
            })
          );
        }


        if (
          action ===
          "manager.presence"
        ) {
          await assertModuleView(
            client,
            member,
            "manager"
          );

          return res.json(
            await setConfirmacaoPresencaFromSite({
              client,
              guild,
              actorId,

              org:
                payload.org,

              status:
                payload.status,
            })
          );
        }


        // ==========================================
        // SOCIAL MEDIA
        // ==========================================

        if (
          action ===
          "social.snapshot"
        ) {
          await assertModuleView(
            client,
            member,
            "social"
          );

          return res.json(
            await getPagamentoSocialSiteSnapshot({
              guild,
              actorId,
            })
          );
        }


        if (
          action ===
          "social.refresh"
        ) {
          await assertModuleView(
            client,
            member,
            "social"
          );

          return res.json(
            await refreshPagamentoSocialFromSite({
              client,
              guild,
              actorId,
            })
          );
        }


        if (
          action ===
          "social.decision"
        ) {
          await assertModuleView(
            client,
            member,
            "social"
          );

          return res.json(
            await pagamentoSocialSiteDecision({
              client,
              guild,
              actorId,

              messageId:
                payload.messageId,

              action:
                payload.action,

              description:
                payload.description ||
                "",
            })
          );
        }


        // ==========================================
        // RETENÇÃO
        // ==========================================

        if (
          action ===
          "retention.snapshot"
        ) {
          await assertModuleView(
            client,
            member,
            "retention"
          );

          return res.json(
            await getFivemRetentionSiteSnapshot({
              cityKey:
                payload.city ||
                null,

              refresh:
                payload.refresh === true,

              snapshotOnly:
                payload.snapshotOnly === true,
            })
          );
        }


        // ==========================================
        // HALL / GG
        // ==========================================

        if (
          action ===
          "hall.snapshot"
        ) {
          await assertModuleView(
            client,
            member,
            "hall"
          );

          return res.json(
            await getHallSiteSnapshot({
              guild,
              actorId,
              member,
            })
          );
        }


        // ==========================================
        // QUIZ
        // ==========================================

        if (
          action ===
          "quiz.snapshot"
        ) {
          await assertModuleView(
            client,
            member,
            "quiz"
          );

          if (
            !globalThis
              .__SC_QUIZ_SITE_API__
          ) {
            throw new Error(
              "Quiz ainda está inicializando."
            );
          }

          return res.json(
            await globalThis
              .__SC_QUIZ_SITE_API__
              .snapshot({
                actorId,
              })
          );
        }

        if (
          action ===
          "quiz.reset"
        ) {
          await assertModuleView(
            client,
            member,
            "quiz"
          );

          if (
            !globalThis
              .__SC_QUIZ_SITE_API__
          ) {
            throw new Error(
              "Quiz ainda está inicializando."
            );
          }

          return res.json(
            await globalThis
              .__SC_QUIZ_SITE_API__
              .reset({
                actorId,
              })
          );
        }


        // ==========================================
        // CONTROLE GI
        // ==========================================

        if (
          action ===
          "gi.snapshot"
        ) {
          await assertModuleView(
            client,
            member,
            "gi"
          );

          if (
            !globalThis
              .__SC_GI_SITE_API__
          ) {
            throw new Error(
              "Controle GI ainda está inicializando."
            );
          }

          const giData =
            await globalThis.__SC_GI_SITE_API__.snapshot({
              actorId,
            });

          return res.json(giData);
        }

        if (
          action ===
          "gi.action"
        ) {
          await assertModuleView(
            client,
            member,
            "gi"
          );

          if (
            !globalThis
              .__SC_GI_SITE_API__
          ) {
            throw new Error(
              "Controle GI ainda está inicializando."
            );
          }

          return bridgeOperations.respond({
            res,
            guildId: guild.id,
            actorId,
            action,
            payload,

            execute: () =>
              globalThis.__SC_GI_SITE_API__.action({
                actorId,
                action: payload.action,
                payload: payload.payload || {},
              }),
          });
        }


        // ==========================================
        // HIERARQUIA
        // ==========================================

        if (
          action ===
          "hierarchy.snapshot"
        ) {
          await assertModuleView(
            client,
            member,
            "hierarchy"
          );

          return res.json(
            await getHierarchySiteSnapshot({
              guild,
              actorId,
            })
          );
        }

        if (
          action ===
          "hierarchy.action"
        ) {
          await assertModuleView(
            client,
            member,
            "hierarchy"
          );

          return res.json(
            await hierarchySiteAction({
              client,
              guild,
              actorId,

              action:
                payload.action,

              targetId:
                payload.targetId,

              values:
                payload.values,
            })
          );
        }


        // ==========================================
        // WEEKLY RANK
        // ==========================================

        if (
          action ===
          "weekly.snapshot"
        ) {
          await assertModuleView(
            client,
            member,
            "weekly"
          );

          return res.json(
            await getWeeklyRankingSiteSnapshot({
              client,
              guild,
              actorId,
              refresh:
                payload.refresh === true &&
                payload.poll !== true,
            })
          );
        }

        if (
          action ===
          "weekly.adjust"
        ) {
          await assertModuleView(
            client,
            member,
            "weekly"
          );

          return res.json(
            await adjustWeeklyPointsFromSite({
              client,
              guild,
              actorId,

              targetId:
                payload.targetId,

              amount:
                payload.amount,

              mode:
                payload.mode,

              operationId:
                payload.operationId ?? null,

              source:
                payload.source ?? null,
            })
          );
        }


        // ==========================================
        // CRONOGRAMA
        // ==========================================

        if (
          action ===
          "cronograma.snapshot"
        ) {
          await assertModuleView(
            client,
            member,
            "cronograma"
          );

      const getCronogramaData =
        getCronogramaSiteData;

      const data =
        await getCronogramaData();

      let eventCovers = {};
      const eventPublications = {};
      const eventWarnings = [];

      try {
        eventCovers = await eventsLibrary.scheduleCovers(
          guild,
          data
        );
      } catch (error) {
        console.warn(
          '[CRONOGRAMA SITE] Capas do cronograma:',
          error.message
        );

        eventWarnings.push(
          'Não foi possível consultar as capas configuradas do cronograma.'
        );
      }

      const canViewInternalEvents =
        await canAccessSiteModule(
          client,
          member,
          'events'
        );

      const canViewPublishedEvents =
        isOfficialSantaCreatorsTeamMember(member) ||
        isCreatorsCommunityMember(member);

      if (canViewInternalEvents || canViewPublishedEvents) {
        try {
          const catalog =
            await eventsLibrary.handle({
              guild,
              member,
              action: canViewInternalEvents
                ? 'events.snapshot'
                : 'events.published',
              payload: {}
            });

          if (!Array.isArray(catalog?.events)) {
            throw new Error(
              'O catálogo de eventos retornou uma consulta inválida.'
            );
          }

          const normalize = name => String(
            name || ''
          )
            .replace(/^[#\s]+/, '')
            .replace(/[*_`]/g, '')
            .normalize('NFD')
            .replace(
              /[\u0300-\u036f]/g,
              ''
            )
            .replace(
              /\s+/g,
              ' '
            )
            .trim()
            .toLocaleLowerCase('pt-BR');

          const eventsByName =
            new Map();

          for (const event of catalog.events) {
            const name =
              normalize(
                event.name
              );

            if (!name) {
              continue;
            }

            let group =
              eventsByName.get(name);

            if (!group) {
              group = {
                count:
                  0,
                covers:
                  new Set(),
                publication:
                  null,
              };

              eventsByName.set(
                name,
                group
              );
            }

            group.count += 1;

            if (
              typeof event.cover === 'string'
            ) {
              try {
                const imageUrl =
                  new URL(
                    event.cover.trim()
                  );

                if (
                  imageUrl.protocol === 'https:'
                ) {
                  group.covers.add(
                    imageUrl.href
                  );
                }
              } catch {
                // Uma URL inválida não elimina as outras capas.
              }
            }

            if (
              event.publicationOnline &&
              event.id
            ) {
              group.publication = {
                id:
                  String(
                    event.publicationEventId ||
                    event.id
                  ),
                name:
                  event.name,
              };
            }
          }

          for (
            const [name, group]
            of eventsByName
          ) {
            if (
              group.covers.size === 1
            ) {
              eventCovers[name] =
                [...group.covers][0];
            } else if (
              group.covers.size > 1
            ) {
              eventWarnings.push(
                `Há imagens diferentes cadastradas para "${name}". A capa não foi escolhida automaticamente.`
              );
            }

            if (
              group.count === 1 &&
              group.publication
            ) {
              eventPublications[name] =
                group.publication;
            }
          }
        } catch (error) {
          console.warn(
            '[CRONOGRAMA SITE] Capas e publicações indisponíveis:',
            error.message
          );

          eventWarnings.push(
            'Não foi possível consultar as imagens e publicações dos eventos. O cronograma foi carregado sem esses complementos.'
          );
        }
      }

      return res.json({
        data,
        eventCovers,
        eventPublications,
        eventWarnings
      });
        }


        // ==========================================
        // IA
        // ==========================================

        if (
          action ===
          "ai.ask"
        ) {
          await assertModuleView(
            client,
            member,
            "ai"
          );

          const prompt =
            String(
              payload.prompt ||
              ""
            ).trim();

          if (
            !prompt ||
            prompt.length >
              4000
          ) {
            throw new Error(
              "Mensagem inválida."
            );
          }

      const generateSantaCreatorsStandaloneText = await siteProvider('./iaChatAuto.js', 'generateSantaCreatorsStandaloneText');
      const answer =
        await generateSantaCreatorsStandaloneText({
              prompt,

              label:
                `Creators Hub • ${actorId}`,

              fast:
                true,

              maxOutputTokens:
                2000,
            });

          return res.json({
            answer:
              String(
                answer ||
                ""
              ),
          });
        }


        return res
          .status(404)
          .json({
            error:
              "Ação do Hub não encontrada.",
          });

      } catch (error) {
        const reportedStatus =
          Number(
            error?.status
          );

        const status =
          Number.isInteger(
            reportedStatus
          ) &&
          reportedStatus >= 400 &&
          reportedStatus <= 599
            ? reportedStatus
            : 500;

        const message =
          String(
            error?.message ||
            "Falha no Creators Hub."
          );

        const missingAbsencesSnapshot =
          status === 503 &&
          error?.cause?.code === "ENOENT" &&
          String(
            error?.cause?.path || ""
          ).endsWith(
            "/ausencias_dashboard.json"
          );

        const missingNpsSnapshot =
          status === 503 &&
          (
            message ===
              "O NPS ainda não gerou uma atualização válida para o site." ||
            message.startsWith(
              "O NPS ainda não possui snapshot disponível."
            )
          );

        const missingSnapshotKey =
          missingAbsencesSnapshot
            ? "absences"
            : (
                missingNpsSnapshot
                  ? "nps"
                  : null
              );

        if (missingSnapshotKey) {
          const now =
            Date.now();

          const previous =
            missingSnapshotLogs.get(
              missingSnapshotKey
            );

          if (
            !previous ||
            now - previous.loggedAt >= 60000
          ) {
            console.warn(
              "[SITE HUB] Snapshot ainda indisponível:",
              {
                module:
                  missingSnapshotKey,
                status,
                message,
                repeatedSinceLastLog:
                  previous?.repeated || 0
              }
            );

            missingSnapshotLogs.set(
              missingSnapshotKey,
              {
                loggedAt:
                  now,
                repeated:
                  0
              }
            );
          } else {
            previous.repeated += 1;
          }
        } else {
          console.error(
            "[SITE HUB]",
            error
          );
        }

        return res
          .status(status)
          .json({
            error:
              message,
          });
      }
    }
  );

  console.log(
    "[SITE HUB] API Discord ↔ Site instalada."
  );

  return true;
}



