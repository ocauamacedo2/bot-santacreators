import { AuditLogEvent } from 'discord.js';

export const ALLOWED_GUILDS = new Set([
  '1452416085751234733', // administração nobre
  '1362899773992079533', // santa creators grande
  '1379642886269964358', // santa creators malta
  '1262262852782129183', // santa creators (principal)
]);

export const MAIN_GUILD_ID = '1262262852782129183';

export function getMemberRoles(member) {
  return member.roles.cache.filter(role => role.id !== member.guild.id);
}

export function roleIdSet(roles) {
  return new Set([...roles.keys()]);
}

export function setsAreEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

export function formatRoleList(roles, isMainGuild) {
  if (!roles.size) return 'Nenhum';
  if (isMainGuild) {
    return [...roles.values()].map(r => `<@&${r.id}>`).join(', ');
  }
  return [...roles.values()].map(r => `${r.name} (${r.id})`).join(', ');
}

export function buildRoleChangeText(oldRoles, newRoles, isMainGuild) {
  const oldSet = roleIdSet(oldRoles);
  const newSet = roleIdSet(newRoles);

  if (setsAreEqual(oldSet, newSet)) return null;

  return (
    `🎭 **Cargos alterados**\n` +
    `Antes: ${formatRoleList(oldRoles, isMainGuild)}\n` +
    `Depois: ${formatRoleList(newRoles, isMainGuild)}`
  );
}

export function buildGuildHeader(guild) {
  return (
    `🏠 **Servidor:** ${guild.name} (\`${guild.id}\`)\n` +
    `🔗 https://discord.com/channels/${guild.id}`
  );
}

export function buildUserHeader(member) {
  return (
    `👤 **Usuário:** <@${member.id}> (\`${member.id}\`)\n` +
    `🔗 https://discord.com/users/${member.id}`
  );
}

export async function resolveExecutor(newMember) {
  try {
    const logs = await newMember.guild.fetchAuditLogs({
      type: AuditLogEvent.MemberUpdate,
      limit: 5,
    });

    const entry = logs.entries.find(e =>
      e.target?.id === newMember.id &&
      Date.now() - e.createdTimestamp < 15_000
    );

    if (entry?.executor) {
      return {
        executor: entry.executor,
        foiProprio: entry.executor.id === newMember.id,
      };
    }
  } catch {}

  return { executor: null, foiProprio: false };
}
