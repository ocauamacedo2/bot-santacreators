import { EmbedBuilder, AuditLogEvent } from 'discord.js';

const CARGOLOG_LOCAL_ADD_CHANNEL_MAP = {
  '1262262852782129183': '1352491088870375531',
  '1362899773992079533': '1363295055384809483',
  '1452416085751234733': '1455312395269443813',
};

const CARGOLOG_LOCAL_REMOVE_CHANNEL_MAP = {
  '1262262852782129183': '1352491135339204649',
  '1362899773992079533': '1363295056634843226',
  '1452416085751234733': '1455311262237065388',
};

async function getLocalAddChannel(client, guild) {
  const mappedId = CARGOLOG_LOCAL_ADD_CHANNEL_MAP[guild.id];
  if (!mappedId) return null;
  return await client.channels.fetch(mappedId).catch(() => null);
}

async function getLocalRemoveChannel(client, guild) {
  const mappedId = CARGOLOG_LOCAL_REMOVE_CHANNEL_MAP[guild.id];
  if (!mappedId) return null;
  return await client.channels.fetch(mappedId).catch(() => null);
}

function formatRoleLocal(guild, roleId) {
  const role = guild.roles.cache.get(roleId);
  return role ? `<@&${role.id}>` : `\`${roleId}\``;
}

function buildLocalEmbed({ type, guild, member, executorUser, roleIds }) {
  const isAdd = type === 'add';
  const title = isAdd ? '✅ Cargo Adicionado' : '❌ Cargo Removido';
  const color = isAdd ? 0x00b05e : 0xff3b3b;
  const rolesList = roleIds.map(rid => formatRoleLocal(guild, rid)).join('\n') || '—';

  const desc =
    `👤 **Usuário:** <@${member.id}> (\`${member.user.tag}\`)\n` +
    `🛠️ **Alterado por:** ${executorUser ? `<@${executorUser.id}>` : 'Desconhecido'}\n\n` +
    `📌 **Cargos ${isAdd ? 'adicionados' : 'removidos'}:**\n${rolesList}\n\n` +
    `🕒 <t:${Math.floor(Date.now() / 1000)}:F>`;

  return new EmbedBuilder()
    .setAuthor({ name: 'Cargo alterado' })
    .setTitle(title)
    .setColor(color)
    .setDescription(desc)
    .setTimestamp();
}

export function setupRoleUpdateLog(client) {
  client.on('guildMemberUpdate', async (oldMember, newMember) => {
    try {
      if (oldMember.roles.cache.size === newMember.roles.cache.size) return;

      const guild = newMember.guild;
      const oldRoles = [...oldMember.roles.cache.keys()];
      const newRoles = [...newMember.roles.cache.keys()];

      const addedRoles = newRoles.filter(rid => !oldRoles.includes(rid));
      const removedRoles = oldRoles.filter(rid => !newRoles.includes(rid));

      if (!addedRoles.length && !removedRoles.length) return;

      let executorUser = null;
      try {
        await new Promise(res => setTimeout(res, 1500));
        const fetchedLogs = await guild.fetchAuditLogs({
          type: AuditLogEvent.MemberRoleUpdate,
          limit: 6,
        });
        const relevantLog = fetchedLogs.entries.find(entry =>
          entry.target?.id === newMember.id &&
          Date.now() - entry.createdTimestamp < 15000
        );
        if (relevantLog?.executor) executorUser = relevantLog.executor;
      } catch (err) {
        console.error('[CARGOLOG] erro audit log:', err);
      }

      const localAddCh = await getLocalAddChannel(client, guild);
      const localRemoveCh = await getLocalRemoveChannel(client, guild);

      if (localAddCh && addedRoles.length) {
        const embLocalAdd = buildLocalEmbed({ type: 'add', guild, member: newMember, executorUser, roleIds: addedRoles });
        localAddCh.send({ embeds: [embLocalAdd] }).catch(console.error);
      }

      if (localRemoveCh && removedRoles.length) {
        const embLocalRem = buildLocalEmbed({ type: 'remove', guild, member: newMember, executorUser, roleIds: removedRoles });
        localRemoveCh.send({ embeds: [embLocalRem] }).catch(console.error);
      }

    } catch (error) {
      console.error('[ERRO] Falha ao registrar alteração de cargos:', error);
    }
  });
}
