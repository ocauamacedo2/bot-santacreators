// ./events/logs/nicknameChange.js
import { EmbedBuilder, AuditLogEvent, ChannelType, time, TimestampStyles } from 'discord.js';

/**
 * Log de alteração de NICKNAME (apelido do servidor)
 * - Detecta via guildMemberUpdate
 * - Tenta descobrir "quem alterou" pelo Audit Log (MemberUpdate com change 'nick')
 *
 * ENV:
 * - NICKNAME_LOG_CHANNEL_ID=123...
 *
 * Requisitos:
 * - Bot precisa ter permissão: View Audit Log (Ver registro de auditoria)
 */
export function setupNicknameChangeLog(client) {
  if (client.__nicknameChangeLogWired) return;
  client.__nicknameChangeLogWired = true;

  const LOG_CHANNEL_ID = process.env.NICKNAME_LOG_CHANNEL_ID?.trim();

  if (!LOG_CHANNEL_ID) {
    console.warn('⚠️ [nicknameChange] NICKNAME_LOG_CHANNEL_ID não definido no .env (log não será enviado).');
  }

  // Janela de tempo pra casar entry do audit com o evento (ms)
  const AUDIT_WINDOW_MS = 25_000;

  client.on('guildMemberUpdate', async (oldMember, newMember) => {
    try {
      // Só nickname (apelido no servidor)
      const beforeNick = oldMember.nickname ?? oldMember.user?.username ?? '(sem nick)';
      const afterNick = newMember.nickname ?? newMember.user?.username ?? '(sem nick)';

      if (beforeNick === afterNick) return;

      const guild = newMember.guild;

      // Pega canal de log
      let logChannel = null;
      if (LOG_CHANNEL_ID) {
        logChannel = await guild.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
      }

      // Mesmo sem canal, ainda tenta logar no console (pra debug)
      if (!logChannel) {
        console.warn('⚠️ [nicknameChange] canal de log não encontrado/sem acesso:', LOG_CHANNEL_ID);
      } else {
        // só manda se for canal de texto
        const ok =
          logChannel.type === ChannelType.GuildText ||
          logChannel.type === ChannelType.GuildAnnouncement ||
          logChannel.isTextBased?.();

        if (!ok) logChannel = null;
      }

      // Descobrir quem alterou no Audit Log
      let executor = null;
      let reason = null;
      let auditId = null;

      try {
        // busca algumas entradas recentes
        const audits = await guild.fetchAuditLogs({
          type: AuditLogEvent.MemberUpdate,
          limit: 6
        });

        const now = Date.now();

        // Procura a entrada cujo target é o membro e que tenha mudança 'nick'
        const entry = audits.entries.find((e) => {
          if (!e?.target) return false;

          const targetId = e.target.id;
          if (targetId !== newMember.id) return false;

          // precisa ser recente
          if (Math.abs(now - e.createdTimestamp) > AUDIT_WINDOW_MS) return false;

          // precisa conter change de nick
          const hasNickChange =
            Array.isArray(e.changes) && e.changes.some((c) => c.key === 'nick');

          return hasNickChange;
        });

        if (entry) {
          executor = entry.executor ?? null;
          reason = entry.reason ?? null;
          auditId = entry.id ?? null;
        }
      } catch (e) {
        // sem permissão de audit log ou falha de fetch
        // segue sem executor
      }

      const changedUserTag =
        newMember.user?.tag ?? `${newMember.user?.username ?? 'Usuário'}#????`;
      const executorTag =
        executor?.tag ?? `${executor?.username ?? 'Desconhecido'}#????`;

      const changedUserMention = `<@${newMember.id}>`;
      const executorMention = executor ? `<@${executor.id}>` : '`Desconhecido`';

      const perfilAlterado = `https://discord.com/users/${newMember.id}`;
      const perfilExecutor = executor ? `https://discord.com/users/${executor.id}` : null;

      // ✅ AVATAR DO USUÁRIO QUE SOFREU A ALTERAÇÃO
      // (se não tiver avatar custom, Discord retorna o default)
      const avatarAlterado = newMember.user.displayAvatarURL({
        extension: 'png',
        size: 256
      });

      const embed = new EmbedBuilder()
        .setTitle('🔁 Alteração de Nickname')
        .setColor(0xff009a)

        // ✅ Foto no canto do embed
        .setThumbnail(avatarAlterado)

        // ✅ Cabeçalho com nome + foto (fica bem “log”)
        .setAuthor({
          name: `${changedUserTag}`,
          iconURL: avatarAlterado
        })

        .addFields(
          {
            name: '👤 Usuário alterado',
            value:
              `${changedUserMention} (**${changedUserTag}**)\n` +
              `🆔 \`${newMember.id}\`\n` +
              `🔗 ${perfilAlterado}`,
            inline: false
          },
          {
            name: '🛠️ Alterado por',
            value: executor
              ? `${executorMention} (**${executorTag}**)\n🆔 \`${executor.id}\`\n🔗 ${perfilExecutor}`
              : `${executorMention}\n*(não consegui confirmar no Audit Log)*`,
            inline: false
          },
          {
            name: '📛 Antes',
            value: `\`${beforeNick}\``,
            inline: true
          },
          {
            name: '✅ Depois',
            value: `\`${afterNick}\``,
            inline: true
          },
          {
            name: '🕒 Data/Hora',
            value: `${time(new Date(), TimestampStyles.LongDateTime)} • ${time(
              new Date(),
              TimestampStyles.RelativeTime
            )}`,
            inline: false
          }
        )
        .setFooter({
          text: `Guild: ${guild.name} • AuditID: ${auditId ?? 'N/A'}`
        });

      if (reason) {
        embed.addFields({ name: '📝 Motivo', value: reason, inline: false });
      }

      // fallback console
      console.log('[LOG nicknameChange]', {
        guild: guild.id,
        userChanged: { id: newMember.id, tag: changedUserTag, beforeNick, afterNick },
        executor: executor ? { id: executor.id, tag: executorTag } : null,
        auditId,
        reason
      });

      // envia no canal, com allowedMentions liberando só quem precisa (se quiser pingar)
      if (logChannel) {
        const allowUsers = [newMember.id];
        if (executor?.id) allowUsers.push(executor.id);

        await logChannel
          .send({
            embeds: [embed],
            allowedMentions: {
              parse: [],
              users: allowUsers
            }
          })
          .catch(() => {});
      }
    } catch (err) {
      console.error('❌ [nicknameChange] erro:', err);
    }
  });
}
