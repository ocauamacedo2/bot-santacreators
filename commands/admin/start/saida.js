// events/saida.js — discord.js v14 (ESM)
import { EmbedBuilder, Events, PermissionsBitField, AuditLogEvent } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config();

const CANAL_SAIDA   = process.env.CANAL_SAIDA;            // fallback padrão (se não tiver mapeado)
const SAIDA_COLOR   = process.env.SAIDA_COLOR || '#ff3455';
const SAIDA_TTL_MS  = Number(process.env.SAIDA_TTL_MS || 86_400_000); // 24h; use 0 p/ não apagar

// 🔒 Constante única para o GIF de saída (evita colisões em outros arquivos)
// Para trocar sem mexer no código, defina SAIDA_GIF_URL no .env
const SC_GIF_SAIDA_UNICO =
  (process.env.SAIDA_GIF_URL && process.env.SAIDA_GIF_URL.trim()) ||
  'https://media.discordapp.net/attachments/1362477839944777889/1384245215249825832/standard_2rss.gif?ex=68dc27d1&is=68dad651&hm=6945c4f850142baacf43e05be6e0e285ebc3c034a86359c0369fedb8a4f254a0&=&width=585&height=75';

// ✅ Canais de saída por servidor (guildId -> channelId)
// (mantém o comportamento atual com fallback no CANAL_SAIDA do .env)
const CANAIS_SAIDA_POR_GUILD = {
  '1362899773992079533': '1363295053702758472',
  '1452416085751234733': '1455301725291282432',
};

export default {
  name: Events.GuildMemberRemove, // ou 'guildMemberRemove' se teu loader usar string
  once: false,
  async execute(member) {
    try {
      const guild = member.guild;

      // 🔁 escolhe canal pela guild; se não existir no map, usa o .env (como antes)
      const canalId = CANAIS_SAIDA_POR_GUILD[guild.id] || CANAL_SAIDA;

      if (!canalId) {
        console.warn('[saida] ❗ Falta CANAL_SAIDA no .env e não há canal mapeado para esta guild.');
        return;
      }

      const canal =
        guild.channels.cache.get(canalId) ||
        (await guild.channels.fetch(canalId).catch(() => null));

      if (!canal || !canal.isTextBased()) {
        console.warn(`[saida] ❗ Canal inválido/inacessível: ${canalId} (guild: ${guild.id})`);
        return;
      }

      const user = member.user;
      const display = member.displayName || user?.username || 'Membro';
      const avatar  = user?.displayAvatarURL?.({ size: 256 }) || null;
      const joined  = member.joinedAt ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:R>` : '—';

      // tenta identificar kick/ban recente via Audit Log (se o bot puder ver)
      let acao = 'saiu do servidor';
      let motivo = null;
      try {
        if (guild.members.me?.permissions.has(PermissionsBitField.Flags.ViewAuditLog)) {
          const now = Date.now();
          const logs = await guild.fetchAuditLogs({ limit: 6 }).catch(() => null);
          const entry = logs?.entries.find(
            (e) =>
              (e.action === AuditLogEvent.MemberKick || e.action === AuditLogEvent.MemberBanAdd) &&
              e.target?.id === user?.id &&
              now - e.createdTimestamp < 5 * 60 * 1000 // 5 min
          );
          if (entry) {
            acao = entry.action === AuditLogEvent.MemberKick ? 'foi **expulso(a)**' : 'foi **banido(a)**';
            motivo = entry.reason || null;
          }
        }
      } catch {
        // silencioso: sem permissão ou sem logs, segue normal
      }

      const embed = new EmbedBuilder()
        .setColor(SAIDA_COLOR)
        .setTitle('🚪 Saída de membro')
        .setDescription(`**${display}** ${acao}.\nID: \`${user?.id ?? '—'}\``)
        .addFields(
          { name: 'Entrou', value: joined, inline: true },
          { name: 'Perfil', value: user ? `<@${user.id}>` : '—', inline: true },
          ...(motivo ? [{ name: 'Motivo (audit log)', value: motivo, inline: false }] : [])
        )
        .setThumbnail(avatar)
        .setImage(SC_GIF_SAIDA_UNICO)
        .setFooter({ text: 'Valeu pela presença — volte sempre! 💜' })
        .setTimestamp();

      const msg = await canal.send({ embeds: [embed] });

      if (SAIDA_TTL_MS > 0) {
        setTimeout(() => msg.delete().catch(() => {}), SAIDA_TTL_MS);
      }

      console.log(`[saida] ✅ Log enviado: ${display} (guild: ${guild.id})`);
    } catch (err) {
      console.error('[saida] Erro ao enviar saída:', err);
    }
  },
};
