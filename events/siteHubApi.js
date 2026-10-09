import { createSiteSnapshotStore } from "../utils/siteSnapshotStore.js";
import { createSiteEventsLibrary } from "../utils/siteEventsLibrary.js";
import { getCronogramaSiteData } from "../utils/cronogramaSiteRead.js";
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
} from "./hallDaFama.js";

import {
  getHierarchySiteSnapshot,
  hierarchySiteAction,
  isOfficialSantaCreatorsTeamMember,
} from "./hierarquiaDivisoes.js";

import { createSiteHubExperience } from "../utils/siteHubExperience.js";

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


// =====================================================
// SITE HUB • SOCIAL MEDIA
// =====================================================

import {
  getPagamentoSocialSiteSnapshot,
  refreshPagamentoSocialFromSite,
  pagamentoSocialSiteDecision,
} from "./pagamentosocial.js";


const GUILD_ID =
  String(
    process.env.DISCORD_GUILD_ID ||
    "1262262852782129183"
  );


const CHANNELS = {
  retention: [
    "1501321157259956244",
    "1513967298690420876",
    "1513967343317942382",
    "1513967375769272400",
    "1513967404059983913",
  ],

  staff: [
    String(process.env.SETSTAFF_V2_CANAL_REGISTRO || "1379024704957841509").trim(),
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
      permissions?.has(
        PermissionFlagsBits
          .ViewChannel
      )
    ) {
      return true;
    }
  }

  return false;
}


async function canAccessSiteModule(
  client,
  member,
  moduleKey
) {
  if (member?.id === '660311795327828008' && CHANNELS[moduleKey]) return true;

  const channelIds =
    CHANNELS[
      moduleKey
    ];

  if (!channelIds) {
    return false;
  }

  const discordChannelAccess =
    await canViewAnyChannel(
      client,
      member,
      channelIds
    );

  return discordChannelAccess;
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
    const error =
      new Error(
        'Você não possui acesso a esta área no Discord.'
      );

    error.status =
      403;

    throw error;
  }
}


let permissionRefresh = null, permissionsRefreshedAt = 0;
async function refreshDiscordPermissions(guild) {
  if (guild.channels.cache.size && guild.roles.cache.has(guild.id)) return;
  if (Date.now() - permissionsRefreshedAt < 30000) return;
  if (!permissionRefresh) {
    permissionRefresh = Promise.all([guild.channels.fetch(), guild.roles.fetch()])
      .then(() => { permissionsRefreshedAt = Date.now(); })
      .finally(() => { permissionRefresh = null; });
  }
  await permissionRefresh;
}

export function installSiteHubApi({
  app,
  client,
}) {
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

  const snapshots = createSiteSnapshotStore({
    directory: snapshotPath(new URL('../data/site-consultas/', import.meta.url)),
    freshMs: 30000,
    maxAgeMs: 30 * 24 * 60 * 60 * 1000,
    maxBytes: 2 * 1024 * 1024,
    maxTotalBytes: 32 * 1024 * 1024,
  });
  for (const event of ['guildMemberUpdate','guildMemberRemove','channelUpdate','channelDelete','roleUpdate','roleDelete'])
    client.on(event, () => snapshots.invalidate());
  for (const event of ['messageCreate', 'messageUpdate', 'messageDelete', 'messageDeleteBulk']) {
    client.on(event, (first, second) => {
      const messages = event === 'messageDeleteBulk' ? [...first.values()] : [second || first];
      if (messages.some(message => Object.values(CHANNELS).flat().includes(message?.channelId) ||
        Object.values(CHANNELS).flat().includes(message?.channel?.parentId))) snapshots.invalidate();
    });
  }

  const snapshotKey = (guild, member, action, payload = {}) => {
    const moduleKey = action === 'history.snapshot' ? payload.module : action.split('.')[0];
    const cleanPayload = { ...payload };
    delete cleanPayload.refresh;
    delete cleanPayload.requireFresh;
    const permissionChannels = new Set(CHANNELS[moduleKey] || []);
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

    express.json({
      limit:
        "128kb",
    }),

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

        await refreshDiscordPermissions(guild);
        if (action.startsWith('public.')) {
          const modules = {};
          for (const key of ['hall', 'quiz']) {
            modules[key] = CHANNELS[key].some(channelId => {
              const channel = guild.channels.cache.get(channelId);
              return channel?.guildId === guild.id && channel.permissionsFor(guild.roles.everyone)?.has(PermissionFlagsBits.ViewChannel);
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
        const member =
          await guild.members
            .fetch({ user: actorId, force: action !== 'changes.snapshot' })
            .catch(
              () => null
            );

        if (!member) {
          return res
            .status(403)
            .json({
              error:
                "Você não está no servidor Santa Creators.",
            });
        }


        if (action === 'changes.snapshot') return res.json({ revision: snapshots.revision() });
        if (action === 'cache.authorize') {
          const requested = String(payload.action || '');
          const requestedPayload = payload.payload || {};
          const module = requested === 'history.snapshot' ? requestedPayload.module : requested.split('.')[0];
          if (!requested.endsWith('.snapshot') || !CHANNELS[module]) {
            return res.status(400).json({ error: 'Consulta de cache inválida.' });
          }
          await assertModuleView(client, member, module);
          return res.json({ scope: snapshotKey(guild, member, requested, requestedPayload) });
        }

        // Autorizar ANTES de ler qualquer consulta persistida, inclusive em atualização manual.
        const moduleKey = action.split('.')[0];
        if (action.endsWith('.snapshot') && CHANNELS[moduleKey]) {
          await assertModuleView(client, member, moduleKey);
          const key = snapshotKey(guild, member, action, payload);
          const saved = snapshots.get(key);
          const deliver = record => {
            const value = JSON.parse(JSON.stringify(record.value));
            const readonly = node => {
              if (!node || typeof node !== 'object') return;
              if (node.rights) for (const flag of Object.keys(node.rights)) {
                if (typeof node.rights[flag] === 'boolean' && !['orgs', 'players', 'view'].includes(flag)) node.rights[flag] = false;
              }
              Object.values(node).forEach(readonly);
            };
            if (!record.fresh) readonly(value);
            return { ...value, cacheScope: key,
              delivery: { savedAt: record.at, updating: !record.fresh, source: 'consulta-salva' } };
          };
          if (saved?.fresh && !payload.refresh) return res.json(deliver(saved));
          const task = snapshots.begin(key);
          if (!task.owner) {
            if (saved && !payload.requireFresh) return res.json(deliver({ ...saved, fresh:false }));
            const result = await task.promise;
            if (result.error) throw result.error;
            return res.json(result.value);
          }
          const realResponse = res;
          const background = Boolean(saved && !payload.requireFresh);
          if (background) realResponse.json(deliver({ ...saved, fresh:false }));
          let statusCode = 200;
          res = {
            get statusCode() { return statusCode; },
            status(code) { statusCode=code;return this; },
            json(value) {
              if (statusCode>=400 || value?.error) {
                snapshots.finish(key,null,Object.assign(new Error(value?.error || 'Falha ao atualizar consulta'),{status:statusCode}));
              } else {
                if(moduleKey==='gi' && Array.isArray(value.records)) {
                  value.records=[...new Map([...value.records].sort((a,b)=>Number(a.createdAtMs||0)-Number(b.createdAtMs||0)).map(item=>[String(item.targetId)+':'+String(item.area||''),item])).values()]
                    .map(item=>({...item,rolePosition:guild.members.cache.get(String(item.targetId))?.roles.highest.position || 0}))
                    .sort((a,b)=>b.rolePosition-a.rolePosition);
                }
                value.cacheScope = key;
                snapshots.finish(key,value);
              }
              if (!background) return realResponse.status(statusCode).json(value);
              return value;
            }
          };
        } else if (!['bootstrap','profile-options','identity.batch','ai.ask'].includes(action) &&
          !action.startsWith('history.') && !action.startsWith('profile.')) {
          // Toda escrita real passa pelas validações originais; a próxima consulta será refeita.
          snapshots.invalidate();
        }

        if (action.startsWith('events.')) {
          await assertModuleView(client, member, 'events');

          return res.json(
            await eventsLibrary.handle({
              guild,
              member,
              action,
              payload
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
    team: isOfficialSantaCreatorsTeamMember(member),

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
            ]);

          return res.json({
            records,
            presence,
            approvers,
            performance,
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

          const giData = await globalThis.__SC_GI_SITE_API__.snapshot({ actorId });
          const ids = [...new Set((giData.records || []).map(item => String(item.targetId)))];
          let next = 0;
          await Promise.all(Array.from({ length: Math.min(4, ids.length) }, async () => {
            while (next < ids.length) {
              const id = ids[next++];
              if (!guild.members.cache.has(id)) await guild.members.fetch(id).catch(() => null);
            }
          }));
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

          return res.json(
            await globalThis
              .__SC_GI_SITE_API__
              .action({
                actorId,

                action:
                  payload.action,

                payload:
                  payload.payload ||
                  {},
              })
          );
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

      const getCronogramaData = getCronogramaSiteData;
      return res.json({
        data: await getCronogramaData(),
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
        console.error(
          "[SITE HUB]",
          error
        );

        return res
          .status(
            Number(
              error?.status
            ) ||
            500
          )
          .json({
            error:
              error?.message ||
              "Falha no Creators Hub.",
          });
      }
    }
  );

  console.log(
    "[SITE HUB] API Discord ↔ Site instalada."
  );

  return true;
}



