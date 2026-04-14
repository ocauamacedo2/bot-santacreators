// events/saida.js — discord.js v14 (ESM)
import {
  EmbedBuilder,
  Events,
  PermissionsBitField,
  AuditLogEvent,
} from 'discord.js';
import { resolveLogChannel } from '../../../events/channelResolver.js';
import dotenv from 'dotenv';
dotenv.config();

const CANAL_SAIDA = process.env.CANAL_SAIDA; // fallback padrão
const SAIDA_COLOR = process.env.SAIDA_COLOR || '#ff3455';
const SAIDA_TTL_MS = Number(process.env.SAIDA_TTL_MS || 86_400_000); // 24h; use 0 p/ não apagar

// 🔒 GIF/arte principal do embed de saída
const SC_GIF_SAIDA_UNICO =
  (process.env.SAIDA_GIF_URL && process.env.SAIDA_GIF_URL.trim()) ||
  'https://media.discordapp.net/attachments/1362477839944777889/1384245215249825832/standard_2rss.gif?ex=68dc27d1&is=68dad651&hm=6945c4f850142baacf43e05be6e0e285ebc3c034a86359c0369fedb8a4f254a0&=&width=585&height=75';

// ✅ Canais de saída por servidor (guildId -> channelId)
// Mantém fallback no CANAL_SAIDA do .env caso a guild não esteja aqui
const CANAIS_SAIDA_POR_GUILD = {
  '1262262852782129183': process.env.CANAL_SAIDA_PRINCIPAL || CANAL_SAIDA,
  '1482114384208597174': process.env.CANAL_SAIDA_INFO_SC || CANAL_SAIDA,
};

// ✅ Nome personalizado por servidor
const NOMES_SERVIDOR_POR_GUILD = {
  '1262262852782129183': 'Servidor Principal',
  '1482114384208597174': 'Servidor Informações SC',
};

// ✅ Link/convite do servidor por guild
// Coloca aqui os convites reais dos servidores quando quiser
const LINKS_SERVIDOR_POR_GUILD = {
  '1262262852782129183': process.env.LINK_SERVIDOR_PRINCIPAL || 'Não configurado',
  '1482114384208597174': process.env.LINK_SERVIDOR_INFO_SC || 'Não configurado',
};

// ✅ Ícone padrão caso o servidor não tenha icon
const ICON_PADRAO_SERVIDOR =
  (process.env.SAIDA_DEFAULT_GUILD_ICON && process.env.SAIDA_DEFAULT_GUILD_ICON.trim()) ||
  null;

function formatDiscordTimestamp(date, style = 'F') {
  if (!date) return '—';
  return `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;
}

function truncate(value, max = 1024) {
  if (!value) return '—';
  const text = String(value);
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function getGuildDisplayName(guild) {
  return NOMES_SERVIDOR_POR_GUILD[guild.id] || guild.name || 'Servidor desconhecido';
}

function getGuildLink(guild) {
  return LINKS_SERVIDOR_POR_GUILD[guild.id] || 'Não configurado';
}

function getGuildIcon(guild) {
  return guild.iconURL({ size: 512, extension: 'png' }) || ICON_PADRAO_SERVIDOR || null;
}

function getUserAvatar(user) {
  return user?.displayAvatarURL?.({ size: 512, extension: 'png' }) || null;
}

function getActionLabel(action) {
  if (action === AuditLogEvent.MemberKick) return 'foi **expulso(a)** do servidor';
  if (action === AuditLogEvent.MemberBanAdd) return 'foi **banido(a)** do servidor';
  return 'saiu do servidor';
}

async function detectarSaidaPorAuditLog(guild, userId) {
  try {
    if (!guild?.members?.me?.permissions.has(PermissionsBitField.Flags.ViewAuditLog)) {
      return {
        acaoTexto: 'saiu do servidor',
        motivo: null,
        executor: null,
      };
    }

    const now = Date.now();
    const logs = await guild.fetchAuditLogs({ limit: 10 }).catch(() => null);

    const entry = logs?.entries?.find((e) => {
      const isAction =
        e.action === AuditLogEvent.MemberKick ||
        e.action === AuditLogEvent.MemberBanAdd;

      const isTarget = e.target?.id === userId;
      const isRecent = now - e.createdTimestamp < 5 * 60 * 1000;

      return isAction && isTarget && isRecent;
    });

    if (!entry) {
      return {
        acaoTexto: 'saiu do servidor',
        motivo: null,
        executor: null,
      };
    }

    return {
      acaoTexto: getActionLabel(entry.action),
      motivo: entry.reason || null,
      executor: entry.executor
        ? `${entry.executor.tag} (\`${entry.executor.id}\`)`
        : null,
    };
  } catch {
    return {
      acaoTexto: 'saiu do servidor',
      motivo: null,
      executor: null,
    };
  }
}

export default {
  name: Events.GuildMemberRemove,
  once: false,

  async execute(member) {
    try {
      const guild = member.guild;
      const user = member.user;

      const canalId = CANAIS_SAIDA_POR_GUILD[guild.id] || CANAL_SAIDA;
      const canal = await resolveLogChannel(member.client, canalId);

      if (!canal || !canal.isTextBased()) {
        console.warn(`[saida] ❗ Canal inválido/inacessível: ${canalId} (guild: ${guild.id})`);
        return;
      }

      const guildName = getGuildDisplayName(guild);
      const guildLink = getGuildLink(guild);
      const guildIcon = getGuildIcon(guild);

      const displayName =
        member.displayName ||
        user?.globalName ||
        user?.username ||
        'Membro';

      const avatar = getUserAvatar(user);

      const entrouEmRelativo = formatDiscordTimestamp(member.joinedAt, 'R');
      const entrouEmCompleto = formatDiscordTimestamp(member.joinedAt, 'F');
      const contaCriadaEm = formatDiscordTimestamp(user?.createdAt, 'F');
      const contaCriadaRelativo = formatDiscordTimestamp(user?.createdAt, 'R');

      const { acaoTexto, motivo, executor } = await detectarSaidaPorAuditLog(guild, user?.id);

      const descricaoBase = [
        `O membro **${displayName}** ${acaoTexto}.`,
        `**Usuário:** ${user ? `<@${user.id}>` : '—'}`,
        `**ID do usuário:** \`${user?.id ?? '—'}\``,
      ].join('\n');

      const fields = [
        {
          name: '🏠 Servidor',
          value: `**Nome:** ${truncate(guildName, 200)}\n**ID:** \`${guild.id}\``,
          inline: true,
        },
        {
          name: '🔗 Link do servidor',
          value:
            guildLink !== 'Não configurado'
              ? `[Clique aqui para abrir](${guildLink})`
              : 'Não configurado',
          inline: true,
        },
        {
          name: '📸 Foto do perfil',
          value: avatar ? `[Abrir avatar](${avatar})` : '—',
          inline: true,
        },
        {
          name: '📅 Entrou no servidor',
          value: `${entrouEmCompleto}\n(${entrouEmRelativo})`,
          inline: true,
        },
        {
          name: '🕓 Conta criada em',
          value: `${contaCriadaEm}\n(${contaCriadaRelativo})`,
          inline: true,
        },
        {
          name: '👤 Nome de exibição',
          value: truncate(displayName, 256),
          inline: true,
        },
      ];

      if (executor) {
        fields.push({
          name: '🛡️ Executor da ação',
          value: truncate(executor, 1024),
          inline: false,
        });
      }

      if (motivo) {
        fields.push({
          name: '📝 Motivo (audit log)',
          value: truncate(motivo, 1024),
          inline: false,
        });
      }

      const embed = new EmbedBuilder()
        .setColor(SAIDA_COLOR)
        .setAuthor({
          name: `${guildName} • Registro de saída`,
          iconURL: guildIcon || undefined,
          url: guildLink !== 'Não configurado' ? guildLink : undefined,
        })
        .setTitle('🚪 Saída de membro')
        .setDescription(descricaoBase)
        .addFields(fields)
        .setThumbnail(avatar)
        .setImage(SC_GIF_SAIDA_UNICO)
        .setFooter({
          text: `Saída registrada • ${guildName}`,
          iconURL: guildIcon || undefined,
        })
        .setTimestamp();

      const msg = await canal.send({ embeds: [embed] });

      if (SAIDA_TTL_MS > 0) {
        setTimeout(() => {
          msg.delete().catch(() => {});
        }, SAIDA_TTL_MS);
      }

      console.log(
        `[saida] ✅ Log enviado com sucesso: ${displayName} (${user?.id}) | guild: ${guild.id} | ação: ${acaoTexto}`
      );
    } catch (err) {
      console.error('[saida] Erro ao enviar saída:', err);
    }
  },
};