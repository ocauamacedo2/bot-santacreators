import {
  getMemberOrgTicketContext,
} from '../events/orgTicketAccessSync.js';

import {
  getPersonalHallSiteSnapshot,
} from '../events/hallDaFama.js';

import {
  getFacsSemanaisSiteSnapshot,
} from '../events/facsSemanais.js';

import {
  getFacsComparativoSiteSnapshot,
} from '../events/facsComparativo.js';

import {
  getBlacklistSiteSnapshot,
  submitBlacklistFromSite,
} from '../events/blacklistFacs.js';

import {
  getConfirmacaoPresencaSiteSnapshot,
  setConfirmacaoPresencaFromSite,
} from '../events/confirmacaoPresenca.js';

import {
  isOfficialSantaCreatorsTeamMember,
} from '../events/hierarquiaDivisoes.js';

import {
  getVipEventoSiteForm,
  submitVipEventoFromSite,
} from '../events/vipEvento.js';

import {
  getOrganizationImage,
} from './orgImages.js';

const leaderRole = '1353858422063239310';
const snowflake = /^\d{17,20}$/;

const fail = (status, message) =>
  Object.assign(new Error(message), { status });

const norm = value => String(value || '')
  .trim()
  .replace(/^\d+\s*\|\s*/, '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]/gi, '')
  .toLowerCase();

export function createSiteCommunity({ client }) {
  async function access(member, options = {}) {
    member = await member.guild.members.fetch({
      user: member.id,
      force: true,
    });

    if (options.vipOnly === true) {
      return {
        member,
        viprequest: member.roles.cache.has(leaderRole),
      };
    }

    const leader =
      member.roles.cache.has(leaderRole);

    const communityAdmin =
      member.id === '660311795327828008' ||
      member.roles.cache.has('1262262852949905408') ||
      member.roles.cache.has('1352407252216184833') ||
      member.roles.cache.has('1262262852949905409') ||
      member.roles.cache.has('1352408327983861844');

    const community =
      communityAdmin ||
      isOfficialSantaCreatorsTeamMember(member) ||
      member.roles.cache.has('1352275728476930099') ||
      (
        member.roles.cache.has('1262978759922028575') &&
        !member.roles.cache.has('1430984036972494908')
      );

    const presencePanel =
      await member.guild.channels.fetch(
        '1477800974574682242'
      ).catch(() => null);

    const presencePermissions =
      presencePanel?.permissionsFor(member);

    const presenceStaff =
      communityAdmin ||
      (
        isOfficialSantaCreatorsTeamMember(member) &&
        presencePermissions?.has(
          'ViewChannel'
        ) === true &&
        presencePermissions?.has(
          'ReadMessageHistory'
        ) === true
      );

    const context = leader
      ? await getMemberOrgTicketContext(member, { freshMember: true })
      : {
          matches: [],
          tags: [],
        };

    const tags = leader
      ? (context.tags || []).filter(tag =>
          member.roles.cache.has(tag.roleId)
        )
      : [];

    return {
      member,
      presenceStaff,
      mywins: community || leader,
      viprequest: leader,

      orgpresence:
        presenceStaff ||
        (leader && tags.length > 0),

      orginvites:
        community ||
        (leader && tags.length > 0),

      orgblacklist:
        community ||
        (leader && tags.length > 0),

      orgticket:
        leader &&
        (context.matches || []).length > 0,

      organizations: tags,

      tickets:
        leader
          ? context.matches || []
          : [],
    };
  }

  function readable(value, guild) {
    return String(value || '')
      .replace(
        /<@&(\d{17,20})>/g,
        (_, id) =>
          guild.roles.cache.get(id)?.name ||
          'Organização'
      )
      .replace(
        /<@!?(\d{17,20})>/g,
        (_, id) =>
          guild.members.cache.get(id)?.displayName ||
          'Participante'
      )
      .replace(
        /<#(\d{17,20})>/g,
        (_, id) =>
          guild.channels.cache.get(id)?.name ||
          'Canal'
      );
  }

  function projectMessage(message, guild) {
    const embeds = message.embeds.map(embed => ({
      title: readable(embed.title, guild),
      text: readable(embed.description, guild),

      fields: (embed.fields || []).map(field => ({
        name: readable(field.name, guild),
        value: readable(field.value, guild),
      })),
    }));

    const media = [
      ...message.attachments.values(),
    ].map(file => ({
      kind:
        file.contentType?.startsWith('image/') ||
        /\.(png|jpe?g|webp|gif)(?:\?|$)/i.test(file.url)
          ? 'image'
          : 'link',

      url: file.url,
      name: file.name || 'Arquivo',
    }));

    for (const embed of message.embeds) {
      for (const item of [
        embed.image,
        embed.thumbnail,
      ]) {
        if (item?.url) {
          media.push({
            kind: 'image',
            url: item.url,
            name: 'Imagem',
          });
        }
      }
    }

    return {
      id: message.id,

      author:
        message.member?.displayName ||
        message.author.globalName ||
        message.author.username,

      avatar:
        message.author.displayAvatarURL({ size: 128 }),

      text: readable(message.content, guild),
      embeds,
      media,
      at: message.createdTimestamp,
      url: message.url,
    };
  }

  async function wins(guild, member, permissions, payload) {
    const all = await getPersonalHallSiteSnapshot({
      guild,
      member,
      organizations: permissions.organizations,
    });

    const mode =
      payload.mode === 'organization'
        ? 'organization'
        : 'personal';

    if (
      mode === 'organization' &&
      !permissions.orgpresence
    ) {
      throw fail(
        403,
        'Sua organização ainda não foi identificada pelos cargos.'
      );
    }

    const search = String(payload.search || '')
      .trim()
      .slice(0, 100);

    const records = all[mode].filter(record =>
      !search ||
      norm(
        record.eventName +
        record.cityName +
        record.owner
      ).includes(norm(search))
    );

    const pages = Math.max(
      1,
      Math.ceil(records.length / 24)
    );

    const page = Math.max(
      1,
      Math.min(
        pages,
        Math.floor(Number(payload.page) || 1)
      )
    );

    return {
      playerId: all.playerId,
      organizations: permissions.organizations,

      totals: {
        personal: all.personal.length,
        organization: all.organization.length,
      },

      total: records.length,
      page,
      pages,

      records: records
        .slice((page - 1) * 24, page * 24)
        .map(({ source, ...record }) => record),

      generatedAt: Date.now(),
    };
  }

  async function detail(guild, member, permissions, payload) {
    const all = await getPersonalHallSiteSnapshot({
      guild,
      member,
      organizations: permissions.organizations,
    });

    const record = [
      ...all.personal,
      ...all.organization,
    ].find(item =>
      item.id === String(payload.id || '')
    );

    if (!record) {
      throw fail(
        404,
        'Esta vitória não pertence aos seus filtros atuais.'
      );
    }

    const channel = await guild.channels.fetch(
      record.source.channelId
    );

    if (
      channel?.guildId !== guild.id ||
      !channel.isTextBased() ||
      !channel.permissionsFor(member)?.has([
        'ViewChannel',
        'ReadMessageHistory',
      ])
    ) {
      throw fail(
        403,
        'Você não possui acesso ao registro de origem no Discord.'
      );
    }

    const message = await channel.messages.fetch({
      message: record.source.messageId,
      force: true,
    });

    const prize = message.embeds
      .flatMap(embed => embed.fields || [])
      .filter(field =>
        /premia[cç][aã]o|pr[eê]mio/i.test(field.name)
      )
      .map(field =>
        readable(field.value, guild)
      )
      .join('\n');

    const paymentOnly =
      channel.id !== '1386503496353976470';

    return {
      eventName: record.eventName,
      owner: record.owner,
      at: record.at,
      prize,
      paymentOnly,

      publication:
        paymentOnly
          ? null
          : projectMessage(message, guild),

      url: message.url,
    };
  }

  async function ticket(guild, member, permissions, payload) {
    const selected =
      permissions.tickets.find(item =>
        item.channelId === String(payload.channelId || '')
      ) ||
      (
        !payload.channelId
          ? permissions.tickets[0]
          : null
      );

    if (!selected) {
      throw fail(
        403,
        'Seu ticket não está vinculado ao cargo e ao seu acesso direto.'
      );
    }

    const channel = await guild.channels.fetch(
      selected.channelId
    );

    const direct =
      channel?.permissionOverwrites.cache
        .get(member.id)?.allow.has('ViewChannel');

    if (
      channel?.guildId !== guild.id ||
      !direct ||
      !channel.isTextBased() ||
      !channel.permissionsFor(member)?.has([
        'ViewChannel',
        'ReadMessageHistory',
      ])
    ) {
      throw fail(
        403,
        'O acesso ao seu ticket foi removido ou está indisponível.'
      );
    }

    const before = String(payload.before || '');

    if (
      before &&
      !snowflake.test(before)
    ) {
      throw fail(
        400,
        'Página de ticket inválida.'
      );
    }

    const messages = await channel.messages.fetch({
      limit: 50,
      ...(before ? { before } : {}),
    });

    const ordered = [
      ...messages.values(),
    ].sort(
      (a, b) =>
        a.createdTimestamp - b.createdTimestamp ||
        (
          BigInt(a.id) < BigInt(b.id)
            ? -1
            : 1
        )
    );

    return {
      tickets: permissions.tickets.map(item => ({
        channelId: item.channelId,
        name: item.orgName,
      })),

      selected: selected.channelId,

      messages: ordered.map(message =>
        projectMessage(message, guild)
      ),

      nextBefore:
        messages.size === 50
          ? ordered[0].id
          : null,

      generatedAt: Date.now(),
    };
  }

  async function board(
    guild,
    member,
    permissions,
    action,
    payload
  ) {
    if (action === 'orgblacklist.snapshot') {
      return getBlacklistSiteSnapshot({
        client,
        guild,
        member,
        before: payload.before,
      });
    }

    const invitations =
      await getFacsSemanaisSiteSnapshot({
        client,
        guild,
      });

    if (action === 'orginvites.snapshot') {
      const master =
        await getFacsComparativoSiteSnapshot();

      const invitedKeys = new Set(
        invitations.organizations.map(item =>
          norm(item.name)
        )
      );

      return {
        ...invitations,

        missing:
          invitations.currentWeek
            ? master.organizations
                .filter(name =>
                  !invitedKeys.has(norm(name))
                )
                .map(name => ({ name }))
            : [],

        generatedAt: Date.now(),
      };
    }

    const presence =
      await getConfirmacaoPresencaSiteSnapshot({
        guild,
        actorId: member.id,
      });

    const ownKeys = new Set(
      permissions.organizations.map(item =>
        norm(item.roleName)
      )
    );

    return {
      weekKey: invitations.weekKey,
      currentWeek: invitations.currentWeek,
      windowOpen: presence.windowOpen,

      organizations: presence.organizations.map(item => ({
        name: readable(item.name, guild),
        status: item.status,

        invited:
          invitations.currentWeek &&
          invitations.organizations.some(invitation =>
            norm(invitation.name) ===
            norm(readable(item.name, guild))
          ),

        mine:
          ownKeys.has(
            norm(readable(item.name, guild))
          ),

        canConfirm:
          (
            presence.windowOpen === true ||
            presence.rights.bypass === true
          ) &&
          presence.rights.confirm === true &&
          (
            item.status === 'PENDING' ||
            presence.rights.overwrite === true
          ) &&
          (
            permissions.presenceStaff === true ||
            ownKeys.has(
              norm(readable(item.name, guild))
            )
          ),

        image:
          guild.iconURL({ size: 128 }) || '',
      })).sort((a, b) =>
        a.name
          .replace(/^\s*\d+\s*\|\s*/, '')
          .localeCompare(
            b.name.replace(/^\s*\d+\s*\|\s*/, ''),
            'pt-BR',
            {
              sensitivity: 'base',
              numeric: true,
            }
          )
      ),

      generatedAt: Date.now(),
    };
  }

  async function confirm(
    guild,
    member,
    permissions,
    payload
  ) {
    const requestedStatus =
      String(payload.status || '').toUpperCase();

    if (!['YES', 'NO'].includes(requestedStatus)) {
      throw fail(
        400,
        'Informe YES para confirmar ou NO para registrar ausência.'
      );
    }

    const presence =
      await getConfirmacaoPresencaSiteSnapshot({
        guild,
        actorId: member.id,
      });

    const ownKeys = new Set(
      permissions.organizations.map(item =>
        norm(item.roleName)
      )
    );

    const matches = presence.organizations.filter(item =>
      norm(readable(item.name, guild)) ===
        norm(payload.org) &&
      (
        permissions.presenceStaff === true ||
        ownKeys.has(
          norm(readable(item.name, guild))
        )
      )
    );

    if (matches.length !== 1) {
      throw fail(
        403,
        'A organização não foi identificada de forma única ou você não possui acesso para confirmá-la.'
      );
    }

    return setConfirmacaoPresencaFromSite({
      client,
      guild,
      actorId: member.id,
      org: matches[0].name,
      status: payload.status,
    });
  }

  async function handle({
    guild,
    member,
    action,
    payload = {},
    res,
  }) {
    const routes = [
      'mywins.snapshot',
      'mywins.detail',
      'viprequest.snapshot',
      'viprequest.submit',
      'orgticket.snapshot',
      'orgpresence.snapshot',
      'orgpresence.confirm',
      'orgpresence.image',
      'orginvites.snapshot',
      'orgblacklist.snapshot',
      'orgblacklist.submit',
    ];

    if (!routes.includes(action)) {
      return false;
    }

    if (
      !payload ||
      typeof payload !== 'object' ||
      Array.isArray(payload)
    ) {
      throw fail(
        400,
        'Os dados da solicitação precisam ser um objeto válido.'
      );
    }

    const permissions = await access(member, {
      vipOnly:
        action === 'viprequest.snapshot' ||
        action === 'viprequest.submit',
    });

    member =
      permissions.member;

    const module =
      action.split('.')[0];

    if (!permissions[module]) {
      throw fail(
        403,
        'Seu cargo atual não permite acessar esta área.'
      );
    }

    if (action === 'orgpresence.image') {
      const name =
        String(payload.org || '').trim();

      if (
        !name ||
        name.length > 200
      ) {
        throw fail(
          400,
          'Informe uma organização válida.'
        );
      }

      const image =
        await getOrganizationImage(
          client,
          name,
          true
        );

      res.json({
        image,
      });

      return true;
    }

    if (action === 'orgblacklist.submit') {
      const result =
        await submitBlacklistFromSite({
          client,
          guild,
          actorId: member.id,
          payload,
        });

      res.json(result);

      return true;
    }

    if (action === 'viprequest.snapshot') {
      try {
        return res.json(
          await getVipEventoSiteForm({
            guild,
            actorId: member.id,
          })
        );
      } catch (error) {
        if (Number(error.status) !== 403) {
          throw error;
        }

        return res.json({
          blocked: true,
          reason: String(
            error.message ||
            'Confira seus cargos de cidade e organização.'
          ),
          generatedAt: Date.now(),
        });
      }
    }

    const result =
      action === 'viprequest.submit'
          ? await submitVipEventoFromSite({
              client,
              guild,
              actorId: member.id,
              payload,
            })
          : action === 'mywins.snapshot'
            ? await wins(guild, member, permissions, payload)
        : action === 'mywins.detail'
          ? await detail(guild, member, permissions, payload)
          : action === 'orgticket.snapshot'
            ? await ticket(guild, member, permissions, payload)
            : action === 'orgpresence.confirm'
              ? await confirm(guild, member, permissions, payload)
              : await board(
                  guild,
                  member,
                  permissions,
                  action,
                  payload
                );

    if (
      action === 'orgpresence.snapshot' ||
      action === 'orginvites.snapshot'
    ) {
      for (
        const list of [
          result.organizations,
          result.missing,
        ]
      ) {
        if (!Array.isArray(list)) {
          continue;
        }

        let nextIndex = 0;

        const worker = async () => {
          while (nextIndex < list.length) {
            const record = list[nextIndex++];

            if (
              !record ||
              typeof record.name !== 'string' ||
              !record.name.trim()
            ) {
              continue;
            }

            try {
              const image = await getOrganizationImage(
                client,
                record.name
              );

              if (image) {
                record.image = image;
              }
            } catch (error) {
              console.error(
                '[ORG IMAGES] Consulta do site:',
                {
                  organization: record.name,
                  message: error.message,
                }
              );
            }
          }
        };

        await Promise.all(
          Array.from(
            { length: Math.min(4, list.length) },
            worker
          )
        );
      }
    }

    res.json(result);

    return true;
  }

  return { access, handle };
}