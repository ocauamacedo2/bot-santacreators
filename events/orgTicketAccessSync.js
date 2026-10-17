import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import {
  AuditLogEvent,
  ChannelType,
  PermissionsBitField,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';

const ORG_ACCESS_LOG_CHANNEL_ID = '1510770121411395614';

const TAGS_TOP_ROLE_ID = '1353487329544638485';
const TAGS_BOTTOM_ROLE_ID = '1353487354228375644';

const ORG_TICKET_CATEGORY_IDS = [
  '1414687963161559180',
  '1428572742051168378',
  '1482874296685695118',
];

const ROLE_SEM_WL_ID = '1430984036972494908';
const ROLE_LIDERES_ID = '1353858422063239310';
const ROLE_CIDADAO_ID = '1262978759922028575';

const USERS_SEMPRE_PODEM = [
  '660311795327828008',
  '1422203191214477406',
];

const ALLOWED_TO_MANAGE_TICKET = [
  '660311795327828008',
  '1422203191214477406',
  '1262262852949905408',
  '1352408327983861844',
  '1262262852949905409',
  '1352407252216184833',
  '1414651836861907006',
  '1352385500614234134',
  '1282119104576098314',
  '1372716303122567239',
  '1352493359897378941',
];

const IGNORE_ROLE_NAMES = [
  'tag',
  'tags',
  'lider',
  'lideres',
  'líder',
  'líderes',
  'staff',
  'admin',
  'owner',
  'bot',
  'everyone',
  'cidadão',
  'cidadao',
  'entrevista',
];

const recentActions = new Map();

const ORG_ACCESS_STORAGE = path.resolve(process.cwd(), 'data', 'org_ticket_access_sync.json');

function loadOrgAccessState() {
  try {
    if (!fs.existsSync(ORG_ACCESS_STORAGE)) {
      return {};
    }

    const state = JSON.parse(
      fs.readFileSync(ORG_ACCESS_STORAGE, 'utf8')
    );

    const record = value =>
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value);

    const id = value =>
      /^\d{17,20}$/.test(value);

    if (!record(state)) {
      throw new Error(
        'Raiz inválida no histórico de acessos.'
      );
    }

    for (
      const [guildId, channels]
      of Object.entries(state)
    ) {
      if (!id(guildId) || !record(channels)) {
        throw new Error(
          'Servidor inválido no histórico.'
        );
      }

      for (
        const [channelId, members]
        of Object.entries(channels)
      ) {
        if (!id(channelId) || !record(members)) {
          throw new Error(
            'Canal inválido no histórico.'
          );
        }

        for (
          const [memberId, roles]
          of Object.entries(members)
        ) {
          if (
            !id(memberId) ||
            !Array.isArray(roles) ||
            roles.some(roleId => !id(roleId))
          ) {
            throw new Error(
              'Membro ou cargos inválidos no histórico.'
            );
          }
        }
      }
    }

    return state;
  } catch (error) {
    console.error(
      '[ORG ACCESS] Histórico preservado; leitura interrompida:',
      error.message
    );

    throw error;
  }
}

function saveOrgAccessState(state) {
  const dir = path.dirname(ORG_ACCESS_STORAGE);

  fs.mkdirSync(dir, {
    recursive: true,
    mode: 0o700,
  });

  const temporary =
    ORG_ACCESS_STORAGE +
    '.' +
    randomUUID() +
    '.tmp';

  try {
    fs.writeFileSync(
      temporary,
      JSON.stringify(state, null, 2),
      {
        flag: 'wx',
        mode: 0o600,
      }
    );

    fs.renameSync(
      temporary,
      ORG_ACCESS_STORAGE
    );
  } finally {
    try {
      fs.unlinkSync(temporary);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn(
          '[ORG ACCESS] Temporário:',
          error.code || error.name
        );
      }
    }
  }
}

function rememberSystemAccess({ guildId, channelId, memberId, roleId }) {
  const state = loadOrgAccessState();

  state[guildId] ??= {};
  state[guildId][channelId] ??= {};
  state[guildId][channelId][memberId] ??= [];

  if (!state[guildId][channelId][memberId].includes(roleId)) {
    state[guildId][channelId][memberId].push(roleId);
  }

  saveOrgAccessState(state);
}

function forgetSystemAccess({ guildId, channelId, memberId, roleId }) {
  const state = loadOrgAccessState();

  const list = state?.[guildId]?.[channelId]?.[memberId];
  if (!Array.isArray(list)) return;

  state[guildId][channelId][memberId] = list.filter(id => id !== roleId);

  if (state[guildId][channelId][memberId].length === 0) {
    delete state[guildId][channelId][memberId];
  }

  if (Object.keys(state[guildId][channelId] || {}).length === 0) {
    delete state[guildId][channelId];
  }

  if (Object.keys(state[guildId] || {}).length === 0) {
    delete state[guildId];
  }

  saveOrgAccessState(state);
}

function getRememberedMemberChannelRoles({ guildId, channelId, memberId }) {
  const state = loadOrgAccessState();
  const roles =
    state?.[guildId]?.[channelId]?.[memberId];

  return Array.isArray(roles)
    ? [...roles]
    : [];
}

function normalizeName(value) {

    
  return String(value || '')
    .normalize('NFKC')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .toLowerCase()
    .trim();
}

function prettyChannelName(channelName) {
  return String(channelName || '')
    .normalize('NFKC')
    .replace(/\p{Cf}/gu, '')
    .replace(/[^\p{L}\p{N}\p{M}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a, b) {
  a = normalizeName(a);
  b = normalizeName(b);

  if (!a || !b) return 999;
  if (a === b) return 0;

  const matrix = Array.from({ length: b.length + 1 }, (_, i) => [i]);

  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] = b.charAt(i - 1) === a.charAt(j - 1)
        ? matrix[i - 1][j - 1]
        : Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
    }
  }

  return matrix[b.length][a.length];
}



function similarity(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;

  if (na === nb) return 1;

  const distance = levenshtein(na, nb);
  const max = Math.max(na.length, nb.length);

  return 1 - distance / max;
}

function isIgnoredRoleName(roleName) {
  const normalized = normalizeName(roleName);
  if (!normalized) return true;

  return IGNORE_ROLE_NAMES.some(name => normalizeName(name) === normalized);
}

function isRoleInsideTagsRange(guild, role) {
  const topRole = guild.roles.cache.get(TAGS_TOP_ROLE_ID);
  const bottomRole = guild.roles.cache.get(TAGS_BOTTOM_ROLE_ID);

  if (!topRole || !bottomRole || !role) return false;

  const max = Math.max(topRole.position, bottomRole.position);
  const min = Math.min(topRole.position, bottomRole.position);

  return role.position <= max && role.position >= min;
}

function isProbablyOrgRole(guild, role) {
  if (!role) return false;
  if (role.managed) return false;
  if (role.id === guild.id) return false;
  if (isIgnoredRoleName(role.name)) return false;

  if (isRoleInsideTagsRange(guild, role)) return true;

  const clean = normalizeName(role.name);

  if (clean.length < 3) {
    return false;
  }

  return [
    ...guild.channels.cache.values(),
  ].some(channel =>
    channel.type === ChannelType.GuildText &&
    ORG_TICKET_CATEGORY_IDS.includes(
      channel.parentId
    ) &&
    normalizeName(
      prettyChannelName(channel.name)
    ) === clean
  );
}

function roleMentionOrName(role) {
  if (!role) return '`Cargo desconhecido`';
  return `<@&${role.id}>\n\`${role.name}\`\n\`${role.id}\``;
}

function userMentionOrName(memberOrUser) {
  if (!memberOrUser) return '`Desconhecido`';
  const user = memberOrUser.user || memberOrUser;
  return `<@${user.id}>\n\`${user.tag || user.username || user.id}\`\n\`${user.id}\``;
}

function channelLink(channel) {
  if (!channel?.guild?.id || !channel?.id) return '`Sem link`';
  return `https://discord.com/channels/${channel.guild.id}/${channel.id}`;
}

async function fetchOrgTicketChannels(guild) {
  const result = [];

  for (const categoryId of ORG_TICKET_CATEGORY_IDS) {
    const category =
      guild.channels.cache.get(categoryId) ||
      await guild.channels.fetch(categoryId).catch(() => null);

    if (!category || category.type !== ChannelType.GuildCategory) continue;

    const children = category.children?.cache?.values
      ? [...category.children.cache.values()]
      : [...guild.channels.cache.values()].filter(ch => ch.parentId === categoryId);

    for (const channel of children) {
      if (channel.type !== ChannelType.GuildText) continue;
      result.push(channel);
    }
  }

  return result;
}

async function findMatchingOrgTicketChannel(guild, role) {
  if (!isProbablyOrgRole(guild, role)) {
    return {
      channel: null,
      score: 0,
      reason: 'Cargo ignorado pelo filtro profissional.',
      candidates: [],
    };
  }

  const channels = await fetchOrgTicketChannels(guild);
  const roleClean = normalizeName(role.name);

  const candidates = channels.map(channel => {
    const channelPretty = prettyChannelName(channel.name);
    const channelClean = normalizeName(channelPretty);

    let score = similarity(roleClean, channelClean);

    if (channelClean === roleClean) score = 1;
    else if (channelClean.includes(roleClean) || roleClean.includes(channelClean)) {
      score = Math.max(score, 0.94);
    }

    return {
      channel,
      score,
      channelPretty,
      channelClean,
    };
  }).sort((a, b) => b.score - a.score);

  const best = candidates[0];

  if (!best) {
    return {
      channel: null,
      score: 0,
      reason: 'Nenhum canal encontrado nas categorias configuradas.',
      candidates,
    };
  }

  const second = candidates[1];

  if (best.score < 0.86) {
    return {
      channel: null,
      score: best.score,
      reason: `Nenhum canal parecido o suficiente. Melhor tentativa: #${best.channel.name} (${Math.round(best.score * 100)}%).`,
      candidates,
    };
  }

  if (
    second &&
    (
      (
        best.score === 1 &&
        second.score === 1
      ) ||
      (
        best.score < 1 &&
        Math.abs(
          best.score - second.score
        ) < 0.08
      )
    )
  ) {
    return {
      channel: null,
      score: best.score,
      reason: `Match ambíguo entre #${best.channel.name} e #${second.channel.name}. Por segurança não setei ninguém.`,
      candidates,
    };
  }

  return {
    channel: best.channel,
    score: best.score,
    reason: `Canal encontrado com ${Math.round(best.score * 100)}% de confiança.`,
    candidates,
  };
}

export async function getOrgTicketImageContext(
  channel,
  actorId
) {
  if (!channel?.guild?.id || !channel.id) {
    throw new Error(
      'Ticket de organização inválido.'
    );
  }

  const expectedGuildId =
    channel.guild.id;

  channel = await channel.guild.channels.fetch(
    channel.id
  );

  if (
    channel?.guild?.id !== expectedGuildId
  ) {
    throw new Error(
      'O ticket não pertence ao servidor esperado.'
    );
  }

  if (
    !channel ||
    !ORG_TICKET_CATEGORY_IDS.includes(
      channel.parentId
    )
  ) {
    throw new Error(
      'Este canal não está em uma categoria de organização.'
    );
  }

  const member =
    await channel.guild.members.fetch({
      user: String(actorId),
      force: true,
    });

  const permissions =
    channel.permissionsFor(member);

  if (
    !permissions?.has(
      PermissionsBitField.Flags.ViewChannel
    ) ||
    !permissions.has(
      PermissionsBitField.Flags.ReadMessageHistory
    )
  ) {
    throw new Error(
      'Você não possui acesso a este ticket.'
    );
  }

  const manager =
    USERS_SEMPRE_PODEM.includes(member.id) ||
    ALLOWED_TO_MANAGE_TICKET.includes(member.id) ||
    member.roles.cache.some(
      role =>
        ALLOWED_TO_MANAGE_TICKET.includes(
          role.id
        )
    );

  if (
    member.roles.cache.has(
      ROLE_LIDERES_ID
    )
  ) {
    const context =
      await getMemberOrgTicketContext(member);

    const own =
      context.matches.filter(
        item =>
          item.channelId === channel.id
      );

    if (own.length === 1) {
      return {
        roleId: own[0].roleId,
        name: own[0].roleName,
      };
    }
  }

  if (!manager) {
    throw new Error(
      'Somente a gestão autorizada ou o líder desta organização pode alterar a imagem.'
    );
  }

  const roles =
    channel.guild.roles.cache.filter(
      role =>
        !role.managed &&
        !isIgnoredRoleName(role.name) &&
        normalizeName(role.name) ===
          normalizeName(
            prettyChannelName(channel.name)
          )
    );

  if (roles.size !== 1) {
    throw new Error(
      'O nome deste ticket não identifica um único cargo de organização.'
    );
  }

  const role = roles.first();

  return {
    roleId: role.id,
    name: role.name,
  };
}

export async function getMemberOrgTicketContext(
  member,
  options = {}
) {
  if (!member?.guild) {
    return {
      matches: [],
      missingTagTickets: [],
      tags: [],
    };
  }

  const guild = member.guild;

  const freshMember =
    options.freshMember === true
      ? member
      : await guild.members.fetch({
          user: member.id,
          force: true,
        });

  const channels = await fetchOrgTicketChannels(guild);

  const ticketNames = new Set(
    channels
      .map(
        channel =>
          normalizeName(
            prettyChannelName(channel.name)
          )
      )
      .filter(Boolean)
  );

  const tagRoles = [
    ...freshMember.roles.cache.values(),
  ].filter(role => {
    if (
      role.managed ||
      role.id === guild.id ||
      isIgnoredRoleName(role.name)
    ) {
      return false;
    }

    const exactTicketName = ticketNames.has(
      normalizeName(role.name)
    );

    return (
      isRoleInsideTagsRange(guild, role) ||
      exactTicketName
    );
  });

  const buildMatch = (role, channel) => {
    const roleClean = normalizeName(role.name);
    const channelPretty = prettyChannelName(channel.name);
    const channelClean = normalizeName(channelPretty);

    let score = similarity(roleClean, channelClean);

    if (channelClean === roleClean) score = 1;
    else if (channelClean.includes(roleClean) || roleClean.includes(channelClean)) {
      score = Math.max(score, 0.94);
    }

    return {
      role,
      channel,
      score,
      channelPretty,
    };
  };

  const directTicketChannels = channels.filter(channel => {
    const overwrite = channel.permissionOverwrites.cache.get(member.id);
    return (
      overwrite?.allow?.has(
        PermissionsBitField.Flags.ViewChannel
      ) === true &&
      channel.permissionsFor(freshMember)?.has([
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.ReadMessageHistory,
      ]) === true
    );
  });

  if (directTicketChannels.length > 0) {
    const matches = [];
    const missingTagTickets = [];

    for (const channel of directTicketChannels) {
      const candidates = tagRoles
        .map(role => buildMatch(role, channel))
        .sort((a, b) => b.score - a.score);

      const best = candidates[0];
      const second = candidates[1];

      const ambiguous =
        second &&
        best &&
        (
          (
            best.score === 1 &&
            second.score === 1
          ) ||
          (
            best.score < 1 &&
            Math.abs(
              best.score - second.score
            ) < 0.08
          )
        );

      if (!best || best.score < 0.86 || ambiguous) {
        missingTagTickets.push({
          channelId: channel.id,
          channelName: channel.name,
          orgName: prettyChannelName(channel.name),
        });
        continue;
      }

      matches.push({
        roleId: best.role.id,
        roleName: best.role.name,
        channelId: channel.id,
        channelName: channel.name,
        orgName: prettyChannelName(best.role.name) || best.channelPretty,
        score: best.score,
      });
    }

    return {
      matches,
      missingTagTickets,

      tags: tagRoles.map(role => ({
        roleId: role.id,
        roleName: role.name,
      })),
    };
  }

  return {
    matches: [],
    missingTagTickets: [],

    tags: tagRoles.map(role => ({
      roleId: role.id,
      roleName: role.name,
    })),
  };
}

function buildLeaderNickname(member) {
  const raw = String(
    member?.nickname ||
    member?.user?.globalName ||
    member?.user?.username ||
    'Nome'
  )
    .replace(/\s+/g, ' ')
    .trim();

  const parts = raw
    .split('|')
    .map(part => part.trim())
    .filter(Boolean);

  let name = '';
  let id = '';

  if (parts.length >= 3) {
    name = parts[1] || '';
    id = parts.slice(2).find(part => /^\d+$/.test(part)) || '';
  } else if (parts.length === 2) {
    if (/^\d+$/.test(parts[1])) {
      name = parts[0];
      id = parts[1];
    } else {
      const firstCompact = parts[0].replace(/\s+/g, '');
      const firstLooksLikeSigla =
        /^[A-Z0-9]{1,6}$/.test(firstCompact) &&
        /[A-Z]/.test(firstCompact);

      name = firstLooksLikeSigla ? parts[1] : parts[0];
    }
  } else {
    name = parts[0] || member?.user?.username || 'Nome';
  }

  name = String(name || member?.user?.username || 'Nome')
    .replace(/\s+/g, ' ')
    .trim();

  if (name) {
    name = name.charAt(0).toUpperCase() + name.slice(1);
  }

  const idText = id || 'ID?????';
  const fixedLength = 'LD | '.length + ' | '.length + idText.length;
  const maxNameLength = Math.max(1, 32 - fixedLength);
  const safeName = name.slice(0, maxNameLength).trim() || 'Nome';

  return `LD | ${safeName} | ${idText}`;
}

async function ensureLeaderNickname(member) {
  if (!member || member.user?.bot) return false;
  if (!member.roles.cache.has(ROLE_LIDERES_ID)) return false;

  const desiredNickname = buildLeaderNickname(member);
  const currentDisplay = String(member.nickname || member.user?.globalName || member.user?.username || '').trim();

  if (currentDisplay === desiredNickname) return false;

  if (!member.manageable) {
    console.warn(`[ORG_TICKET_ACCESS_SYNC] Não posso alterar o apelido de ${member.user?.tag || member.id}.`);
    return false;
  }

  try {
    await member.setNickname(
      desiredNickname,
      'OrgTicketAccessSync: padronização automática de líder'
    );

    return true;
  } catch (error) {
    console.error('[ORG_TICKET_ACCESS_SYNC] Erro ao padronizar apelido de líder:', error);
    return false;
  }
}

async function getAuditExecutor(guild, targetId) {
  await new Promise(resolve => setTimeout(resolve, 1200));

  const logs = await guild.fetchAuditLogs({
    type: AuditLogEvent.MemberRoleUpdate,
    limit: 6,
  }).catch(() => null);

  if (!logs) return null;

  const entry = logs.entries.find(e =>
    e.target?.id === targetId &&
    Date.now() - e.createdTimestamp < 15000
  );

  return entry?.executor || null;
}

async function applyOrgLeaderBaseRoles(member) {
  const changes = [];

  try {
    if (member.roles.cache.has(ROLE_SEM_WL_ID)) {
      await member.roles.remove(ROLE_SEM_WL_ID, 'OrgTicketAccessSync: recebeu cargo de org com ticket');
      changes.push('removeu SEM WL');
    }

    const rolesToAdd = [];

    if (!member.roles.cache.has(ROLE_LIDERES_ID)) {
      rolesToAdd.push(ROLE_LIDERES_ID);
      changes.push('setou Líderes');
    }

    if (!member.roles.cache.has(ROLE_CIDADAO_ID)) {
      rolesToAdd.push(ROLE_CIDADAO_ID);
      changes.push('setou Cidadão');
    }

    if (rolesToAdd.length > 0) {
      await member.roles.add(rolesToAdd, 'OrgTicketAccessSync: recebeu cargo de org com ticket');
    }

    return changes.length > 0
      ? changes.join(', ')
      : 'membro já estava com os cargos base corretos';
  } catch (error) {
    return `não consegui ajustar cargos base: ${error.message}`;
  }
}

async function sendOrgAccessLog({
  guild,
  action,
  member,
  role,
  channel,
  executor,
  source,
  success,
  reason,
  score,
}) {
  const logChannel = await guild.client.channels.fetch(ORG_ACCESS_LOG_CHANNEL_ID).catch(() => null);
  if (!logChannel?.isTextBased()) return;

  const color = success ? 0x00D084 : 0xFFB020;
  const title = success
    ? action === 'add'
      ? '✅ Acesso automático ao ticket aplicado'
      : '✅ Acesso automático ao ticket removido'
    : '⚠️ Acesso automático não aplicado';

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setThumbnail(member?.user?.displayAvatarURL?.({ dynamic: true, size: 1024 }) || guild.iconURL({ dynamic: true }))
    .addFields(
      { name: '👤 Membro', value: userMentionOrName(member), inline: true },
      { name: '👮 Quem alterou o cargo', value: executor ? userMentionOrName(executor) : '`Não identificado pelo audit log`', inline: true },
      { name: '🏷️ Cargo analisado', value: roleMentionOrName(role), inline: false },
      { name: '🎫 Canal encontrado', value: channel ? `${channel}\n[abrir canal](${channelLink(channel)})\n\`${channel.name}\`\n\`${channel.id}\`` : '`Nenhum canal aplicado`', inline: false },
      { name: '📌 Origem', value: `\`${source || 'Sistema automático'}\``, inline: true },
      { name: '🧠 Confiança', value: score ? `\`${Math.round(score * 100)}%\`` : '`—`', inline: true },
      { name: '🕒 Quando', value: `<t:${Math.floor(Date.now() / 1000)}:F>\n<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
      { name: '📝 Resultado', value: reason ? `\`${reason.slice(0, 900)}\`` : '`Sem observação`', inline: false },
    )
    .setFooter({ text: `${guild.name} • ${guild.id}` })
    .setTimestamp();

  const rows = [];

  if (member && role) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`orgticket_remove_role:${member.id}:${role.id}`)
          .setLabel('Remover cargo e acesso')
          .setStyle(ButtonStyle.Danger)
      )
    );
  }

  await logChannel.send({
    embeds: [embed],
    components: rows,
  }).catch(() => null);
}

async function applyTicketPermission({ member, role, action, executor = null, source = 'Sistema automático' }) {
  const guild = member.guild;

  loadOrgAccessState();

  member = await guild.members.fetch({
    user: member.id,
    force: true,
  });

  const hasRole =
    member.roles.cache.has(role.id);

  if (
    (
      action === 'add' &&
      !hasRole
    ) ||
    (
      action === 'remove' &&
      hasRole
    )
  ) {
    return {
      success: false,
      channel: null,
      silent: true,
      reason:
        'O estado atual do cargo não corresponde à ação solicitada. Nenhuma permissão foi alterada.',
    };
  }

  const match = await findMatchingOrgTicketChannel(
    guild,
    role
  );
  const channel = match.channel;

  if (!channel) {
    return {
      success: false,
      channel: null,
      silent: true,
      reason: match.reason,
    };
  }

  try {
    if (action === 'add') {
      await channel.permissionOverwrites.edit(member.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AttachFiles: true,
      }, {
        reason: `OrgTicketAccessSync: cargo ${role.name} adicionado`,
      });

      const baseRolesResult = await applyOrgLeaderBaseRoles(member);

      rememberSystemAccess({
        guildId: guild.id,
        channelId: channel.id,
        memberId: member.id,
        roleId: role.id,
      });

      await sendOrgAccessLog({
        guild,
        action,
        member,
        role,
        channel,
        executor,
        source,
        success: true,
        reason: `${match.reason} Cargos base: ${baseRolesResult}.`,
        score: match.score,
      });

      return { success: true, channel, reason: match.reason };
    }

    if (action === 'remove') {
      const overwrite =
        channel.permissionOverwrites.cache.get(
          member.id
        );

      const remembered =
        getRememberedMemberChannelRoles({
          guildId: guild.id,
          channelId: channel.id,
          memberId: member.id,
        });

      if (!remembered.includes(role.id)) {
        return {
          success: false,
          channel,
          silent: true,
          reason:
            'Este acesso não está registrado como automático; a permissão existente foi preservada.',
        };
      }

      const remainingRoleIds = remembered.filter(
        id => id !== role.id
      );

      const stillHasAnotherAccessRole =
        remainingRoleIds.some(
          id => member.roles.cache.has(id)
        );

      if (
        overwrite &&
        !stillHasAnotherAccessRole
      ) {
        await channel.permissionOverwrites.delete(
          member.id,
          `OrgTicketAccessSync: cargo ${role.name} removido`
        );
      }

      forgetSystemAccess({
        guildId: guild.id,
        channelId: channel.id,
        memberId: member.id,
        roleId: role.id,
      });

      if (!overwrite) {
        return {
          success: true,
          channel,
          silent: true,
          reason:
            'Nenhuma permissão específica permanece nesse canal.',
        };
      }

      await sendOrgAccessLog({
        guild,
        action,
        member,
        role,
        channel,
        executor,
        source,
        success: true,
        reason: stillHasAnotherAccessRole
          ? `${match.reason} Usuário ainda possui outro cargo que mantém acesso ao mesmo canal.`
          : `${match.reason} Permissão específica removida.`,
        score: match.score,
      });

      return { success: true, channel, reason: match.reason };
    }

    return { success: false, channel, reason: 'Ação desconhecida.' };
  } catch (error) {
    await sendOrgAccessLog({
      guild,
      action,
      member,
      role,
      channel,
      executor,
      source,
      success: false,
      reason: error.message,
      score: match.score,
    });

    return { success: false, channel, reason: error.message };
  }
}

export async function syncOrgTicketAccessForRoleChange({
  member,
  role,
  action,
  executor = null,
  source = 'Comando',
}) {
  if (!member || !role) return null;

  if (
    member.guild?.id !== role.guild?.id ||
    !['add', 'remove'].includes(action) ||
    !/^\d{17,20}$/.test(String(member.id)) ||
    !/^\d{17,20}$/.test(String(role.id))
  ) {
    throw new Error(
      'Servidor, membro, cargo ou ação de sincronização inválidos.'
    );
  }

  const key = `${member.guild.id}:${member.id}:${role.id}:${action}`;
  const last = recentActions.get(key);

  if (last && Date.now() - last < 5000) return null;

  recentActions.set(key, Date.now());
  setTimeout(() => recentActions.delete(key), 7000);

  return applyTicketPermission({
    member,
    role,
    action,
    executor,
    source,
  });
}

let orgAccessCleanupTask = null;

function cleanRememberedOrgAccess(client) {
  if (orgAccessCleanupTask) {
    return orgAccessCleanupTask;
  }

  const task = cleanRememberedOrgAccessLive(
    client
  ).finally(() => {
    if (orgAccessCleanupTask === task) {
      orgAccessCleanupTask = null;
    }
  });

  orgAccessCleanupTask = task;

  return task;
}

function commitOrgAccessCleanup(initial, cleaned) {
  const current = loadOrgAccessState();

  for (
    const [guildId, channels]
    of Object.entries(initial)
  ) {
    for (
      const [channelId, members]
      of Object.entries(channels)
    ) {
      for (
        const [memberId, roles]
        of Object.entries(members)
      ) {
        if (
          cleaned[guildId]?.[channelId]?.[memberId] !==
          undefined
        ) {
          continue;
        }

        const latest =
          current[guildId]?.[channelId]?.[memberId];

        if (
          JSON.stringify(latest) !==
          JSON.stringify(roles)
        ) {
          continue;
        }

        delete current[guildId][channelId][memberId];

        if (
          !Object.keys(
            current[guildId][channelId]
          ).length
        ) {
          delete current[guildId][channelId];
        }

        if (
          !Object.keys(current[guildId]).length
        ) {
          delete current[guildId];
        }
      }
    }
  }

  saveOrgAccessState(current);
}

async function cleanRememberedOrgAccessLive(client) {
  const state = loadOrgAccessState();

  const initialState = JSON.parse(
    JSON.stringify(state)
  );

  for (const [guildId, channels] of Object.entries(state)) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) continue;

    for (const [channelId, members] of Object.entries(channels)) {
      const channel = await guild.channels.fetch(
        channelId
      ).catch(error => {
        if (Number(error.code) === 10003) {
          return null;
        }

        console.warn(
          '[ORG ACCESS] Canal não conferido; histórico preservado:',
          {
            channelId,
            code: error.code || error.name,
          }
        );

        return undefined;
      });
      if (!channel || channel.type !== ChannelType.GuildText) continue;

      for (const [memberId, roleIds] of Object.entries(members)) {
        const member = await guild.members.fetch({
          user: memberId,
          force: true,
        }).catch(error => {
          if (Number(error.code) === 10007) {
            return null;
          }

          console.warn(
            '[ORG ACCESS] Membro não conferido; acesso preservado:',
            {
              memberId,
              code: error.code || error.name,
            }
          );

          return undefined;
        });

        if (member === undefined) {
          continue;
        }

        if (!member) {
          try {
            await channel.permissionOverwrites.delete(
              memberId,
              'OrgTicketAccessSync: membro saiu do servidor'
            );
          } catch (error) {
            console.warn(
              '[ORG ACCESS] Remoção não confirmada:',
              error.code || error.name
            );

            continue;
          }

          delete state[guildId][channelId][memberId];
          continue;
        }

        const stillHasRole = Array.isArray(roleIds) && roleIds.some(roleId => member.roles.cache.has(roleId));

        if (!stillHasRole) {
          const overwrite = channel.permissionOverwrites.cache.get(memberId);

          if (overwrite) {
            try {
              await channel.permissionOverwrites.delete(
                memberId,
                'OrgTicketAccessSync: limpeza automática sem cargo necessário'
              );
            } catch (error) {
              console.warn(
                '[ORG ACCESS] Limpeza não confirmada:',
                error.code || error.name
              );

              continue;
            }

            await sendOrgAccessLog({
              guild,
              action: 'remove',
              member,
              role: null,
              channel,
              executor: client.user,
              source: 'Limpeza automática',
              success: true,
              reason: 'Usuário estava com acesso automático salvo, mas não possui mais nenhum cargo necessário para este canal.',
              score: null,
            });
          }

          delete state[guildId][channelId][memberId];
        }
      }

      if (Object.keys(state[guildId][channelId] || {}).length === 0) {
        delete state[guildId][channelId];
      }
    }

    if (Object.keys(state[guildId] || {}).length === 0) {
      delete state[guildId];
    }
  }

  commitOrgAccessCleanup(
    initialState,
    state
  );
}

export function installOrgTicketAccessSync(client) {
  if (client.__SC_ORG_ACCESS_INSTALLED__) {
    return;
  }

  client.__SC_ORG_ACCESS_INSTALLED__ = true;

  cleanRememberedOrgAccess(client).catch(error => {
    console.error('[ORG_TICKET_ACCESS_SYNC] Erro na limpeza inicial:', error);
  });

  setInterval(() => {
    cleanRememberedOrgAccess(client).catch(error => {
      console.error('[ORG_TICKET_ACCESS_SYNC] Erro na limpeza automática:', error);
    });
  }, 10 * 60 * 1000);

  client.on('guildMemberUpdate', async (oldMember, newMember) => {
    try {
      const oldRoles = new Set(oldMember.roles.cache.keys());
      const newRoles = new Set(newMember.roles.cache.keys());

      const addedRoleIds = [...newRoles].filter(id => !oldRoles.has(id));
      const removedRoleIds = [...oldRoles].filter(id => !newRoles.has(id));

      const leaderWasAdded = addedRoleIds.includes(ROLE_LIDERES_ID);
      const leaderHasRole = newRoles.has(ROLE_LIDERES_ID);
      const nicknameChanged = oldMember.nickname !== newMember.nickname;

      if (leaderHasRole && (leaderWasAdded || nicknameChanged)) {
        await ensureLeaderNickname(newMember);
      }

      if (!addedRoleIds.length && !removedRoleIds.length) return;

      const executor = await getAuditExecutor(newMember.guild, newMember.id);

      for (const roleId of addedRoleIds) {
        const role = newMember.guild.roles.cache.get(roleId);
        if (!role) continue;

        await syncOrgTicketAccessForRoleChange({
          member: newMember,
          role,
          action: 'add',
          executor,
          source: executor ? 'Cargo setado manualmente / comando' : 'Cargo setado',
        });
      }

      for (const roleId of removedRoleIds) {
        const role = oldMember.guild.roles.cache.get(roleId);
        if (!role) continue;

        await syncOrgTicketAccessForRoleChange({
          member: newMember,
          role,
          action: 'remove',
          executor,
          source: executor ? 'Cargo removido manualmente / comando' : 'Cargo removido',
        });
      }
    } catch (error) {
      console.error('[ORG_TICKET_ACCESS_SYNC] Erro no guildMemberUpdate:', error);
    }
  });

  console.log('[ORG_TICKET_ACCESS_SYNC] instalado.');
}

export async function orgTicketAccessHandleInteraction(
  interaction
) {
  if (!interaction.isButton()) {
    return false;
  }

  if (
    !interaction.customId.startsWith(
      'orgticket_remove_role:'
    )
  ) {
    return false;
  }

  await interaction.deferReply({
    ephemeral: true,
  });

  try {
    const [
      ,
      memberId,
      roleId,
    ] = interaction.customId.split(':');

    if (
      !interaction.guild ||
      !/^\d{17,20}$/.test(memberId || '') ||
      !/^\d{17,20}$/.test(roleId || '')
    ) {
      throw new Error(
        'Pedido de remoção inválido.'
      );
    }

    const actor =
      await interaction.guild.members.fetch({
        user: interaction.user.id,
        force: true,
      });

    const allowed =
      USERS_SEMPRE_PODEM.includes(actor.id) ||
      ALLOWED_TO_MANAGE_TICKET.includes(
        actor.id
      ) ||
      actor.roles.cache.some(
        role =>
          ALLOWED_TO_MANAGE_TICKET.includes(
            role.id
          )
      );

    if (!allowed) {
      await interaction.editReply(
        '🚫 Você não tem permissão para usar esse botão.'
      );

      return true;
    }

    const member =
      await interaction.guild.members.fetch({
        user: memberId,
        force: true,
      });

    const role =
      await interaction.guild.roles.fetch(
        roleId
      );

    if (!role) {
      throw new Error(
        'O cargo não foi encontrado.'
      );
    }

    if (member.roles.cache.has(role.id)) {
      await member.roles.remove(
        role.id,
        `Botão log OrgTicketAccessSync usado por ${interaction.user.tag}`
      );
    }

    const result =
      await syncOrgTicketAccessForRoleChange({
        member,
        role,
        action: 'remove',
        executor: interaction.user,
        source: 'Botão da log',
      });

    const message =
      result?.success === true
        ? `✅ Cargo ${role.name} removido e sincronização confirmada.`
        : result
          ? 'O cargo foi removido, mas o acesso do ticket precisa ser conferido: ' +
            result.reason
          : 'O cargo foi removido. A sincronização já foi acionada; confira a log do ticket.';

    await interaction.editReply(message);
  } catch (error) {
    console.error(
      '[ORG ACCESS] Botão de remoção:',
      error
    );

    await interaction.editReply(
      'Não foi possível confirmar todas as etapas da remoção. Confira o cargo e a log: ' +
      error.message
    );
  }

  return true;
}

export async function logManualTicketAccessChange({
  interaction,
  targetMember,
  action,
}) {
  const channel = interaction.channel;
  const guild = interaction.guild;

  await sendOrgAccessLog({
    guild,
    action,
    member: targetMember,
    role: null,
    channel,
    executor: interaction.user,
    source: action === 'add' ? 'Botão manual do ticket' : 'Botão manual do ticket',
    success: true,
    reason: action === 'add'
      ? 'Usuário adicionado manualmente ao ticket pelo modal.'
      : 'Usuário removido manualmente do ticket pelo modal.',
    score: null,
  });
}