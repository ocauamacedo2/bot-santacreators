import { Events, EmbedBuilder } from 'discord.js';
import {
  ALLOWED_GUILDS,
  MAIN_GUILD_ID,
  getMemberRoles,
  buildRoleChangeText,
  resolveExecutor,
  buildGuildHeader,
  buildUserHeader
} from './utils.js';

export function setupUserUpdateLog(client) {
  client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    try {
      if (!ALLOWED_GUILDS.has(newMember.guild.id)) return;

      const logChannel = client.channels.cache.get(process.env.LOG_USER_UPDATE);
      if (!logChannel) return;

      const oldNickname = oldMember.nickname || oldMember.user.username;
      const newNickname = newMember.nickname || newMember.user.username;

      const oldRoles = getMemberRoles(oldMember);
      const newRoles = getMemberRoles(newMember);

      const isMainGuild = newMember.guild.id === MAIN_GUILD_ID;

      const changes = [];

      if (oldNickname !== newNickname) {
        changes.push(
          `📛 **Apelido alterado**\nAntes: \`${oldNickname}\`\nDepois: \`${newNickname}\``
        );
      }

      const roleChange = buildRoleChangeText(oldRoles, newRoles, isMainGuild);
      if (roleChange) changes.push(roleChange);

      if (!changes.length) return;

      const { executor, foiProprio } = await resolveExecutor(newMember);

      let executorLine = '👮 **Alterado por:** Desconhecido';
      if (foiProprio) executorLine = '🔧 **Alterado por:** Ele mesmo';
      else if (executor) {
        executorLine =
          `👮 **Alterado por:** <@${executor.id}> (\`${executor.id}\`)\n` +
          `🔗 https://discord.com/users/${executor.id}`;
      }

      const embed = new EmbedBuilder()
        .setTitle('🛠️ Alteração de Usuário Detectada')
        .setColor(foiProprio ? 'Blue' : 'Orange')
        .setAuthor({
          name: newMember.user.tag,
          iconURL: newMember.user.displayAvatarURL({ dynamic: true }),
        })
        .setDescription(
          [
            buildGuildHeader(newMember.guild),
            '',
            buildUserHeader(newMember),
            '',
            executorLine,
          ].join('\n')
        )
        .addFields({ name: '📝 Alterações', value: changes.join('\n\n') })
        .setFooter({
          text: `🕒 ${new Date().toLocaleString('pt-BR', {
            timeZone: 'America/Sao_Paulo',
          })}`,
        })
        .setTimestamp();

      await logChannel.send({ embeds: [embed] });

    } catch (err) {
      console.error('[ERRO] Falha ao registrar alteração de usuário:', err);
    }
  });
}
