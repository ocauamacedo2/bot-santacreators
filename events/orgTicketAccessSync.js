import fs from 'node:fs';
import path from 'node:path';

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
    if (!fs.existsSync(ORG_ACCESS_STORAGE)) return {};
    const raw = fs.readFileSync(ORG_ACCESS_STORAGE, 'utf8');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveOrgAccessState(state) {
  try {
    const dir = path.dirname(ORG_ACCESS_STORAGE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(ORG_ACCESS_STORAGE, JSON.stringify(state, null, 2));
  } catch {}
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
  return state?.[guildId]?.[channelId]?.[memberId] || [];
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
    .replace(/[┃┋│|•・❖📁🎫🎟️💼🏷️📦🔒🔓#]/g, ' ')
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
  if (clean.length < 3) return false;

  return true;
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
    const category = await guild.channels.fetch(categoryId).catch(() => null);
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

  if (second && best.score < 0.94 && Math.abs(best.score - second.score) < 0.08) {
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

  const match = await findMatchingOrgTicketChannel(guild, role);
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
        reason: match.reason,
        score: match.score,
      });

      return { success: true, channel, reason: match.reason };
    }

    if (action === 'remove') {
      const overwrite = channel.permissionOverwrites.cache.get(member.id);

      forgetSystemAccess({
        guildId: guild.id,
        channelId: channel.id,
        memberId: member.id,
        roleId: role.id,
      });

      const remainingRoleIds = getRememberedMemberChannelRoles({
        guildId: guild.id,
        channelId: channel.id,
        memberId: member.id,
      });

      const stillHasAnotherAccessRole = remainingRoleIds.some(roleId => member.roles.cache.has(roleId));

      if (overwrite && !stillHasAnotherAccessRole) {
        await channel.permissionOverwrites.delete(member.id, `OrgTicketAccessSync: cargo ${role.name} removido`);
      }

      if (!overwrite) {
        return {
          success: false,
          channel,
          silent: true,
          reason: 'Usuário não tinha permissão específica nesse canal.',
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

async function cleanRememberedOrgAccess(client) {
  const state = loadOrgAccessState();

  for (const [guildId, channels] of Object.entries(state)) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) continue;

    for (const [channelId, members] of Object.entries(channels)) {
      const channel = await guild.channels.fetch(channelId).catch(() => null);
      if (!channel || channel.type !== ChannelType.GuildText) continue;

      for (const [memberId, roleIds] of Object.entries(members)) {
        const member = await guild.members.fetch(memberId).catch(() => null);

        if (!member) {
          await channel.permissionOverwrites
            .delete(memberId, 'OrgTicketAccessSync: membro saiu do servidor')
            .catch(() => {});

          delete state[guildId][channelId][memberId];
          continue;
        }

        const stillHasRole = Array.isArray(roleIds) && roleIds.some(roleId => member.roles.cache.has(roleId));

        if (!stillHasRole) {
          const overwrite = channel.permissionOverwrites.cache.get(memberId);

          if (overwrite) {
            await channel.permissionOverwrites
              .delete(memberId, 'OrgTicketAccessSync: limpeza automática sem cargo necessário')
              .catch(() => {});

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

  saveOrgAccessState(state);
}

export function installOrgTicketAccessSync(client) {
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

export async function orgTicketAccessHandleInteraction(interaction) {
  if (!interaction.isButton()) return false;
  if (!interaction.customId.startsWith('orgticket_remove_role:')) return false;

  await interaction.deferReply({ ephemeral: true }).catch(() => null);

  const [, memberId, roleId] = interaction.customId.split(':');

  const isAllowed =
    USERS_SEMPRE_PODEM.includes(interaction.user.id) ||
    ALLOWED_TO_MANAGE_TICKET.includes(interaction.user.id) ||
    interaction.member?.roles?.cache?.some(role => ALLOWED_TO_MANAGE_TICKET.includes(role.id));

  if (!isAllowed) {
    await interaction.editReply('🚫 Você não tem permissão para usar esse botão.');
    return true;
  }

  const member = await interaction.guild.members.fetch(memberId).catch(() => null);
  const role = interaction.guild.roles.cache.get(roleId);

  if (!member || !role) {
    await interaction.editReply('⚠️ Não achei o membro ou o cargo.');
    return true;
  }

  if (member.roles.cache.has(role.id)) {
    await member.roles.remove(role.id, `Botão log OrgTicketAccessSync usado por ${interaction.user.tag}`).catch(async error => {
      await interaction.editReply(`❌ Não consegui remover o cargo: ${error.message}`);
    });
  }

  await syncOrgTicketAccessForRoleChange({
    member,
    role,
    action: 'remove',
    executor: interaction.user,
    source: 'Botão da log',
  });

  await interaction.editReply(`✅ Cargo **${role.name}** removido e acesso do ticket sincronizado para <@${member.id}>.`);
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