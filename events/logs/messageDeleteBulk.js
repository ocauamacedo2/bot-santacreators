// /application/events/logs/messageDeleteBulk.js
import { EmbedBuilder, PermissionsBitField } from "discord.js";

const LOG_CHANNEL_ID = "1377834202417856732";

export default {
  name: "messageDeleteBulk",
  once: false,

  async execute(messages, client) {
    try {
      const first = messages.first();
      if (!first?.guild) return;

      const guild = first.guild;
      const channel = first.channel;

      const logChannel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
      if (!logChannel) return;

      const me = guild.members.me;
      const canAudit = me?.permissions.has(PermissionsBitField.Flags.ViewAuditLog);

      const embed = new EmbedBuilder()
        .setTitle("🧹 Limpeza / bulk delete")
        .setDescription(
          [
            `**Servidor:** ${guild.name}`,
            `**Canal:** <#${channel.id}>`,
            `**Quantidade:** ${messages.size}`,
            canAudit ? "" : "\n⚠️ (Sem permissão de ver Audit Log: ViewAuditLog)",
          ].join("\n")
        )
        .setTimestamp(new Date());

      const sample = messages
        .filter(m => !m.author?.bot)
        .map(m => `• ${m.author?.tag ?? m.author?.username ?? "Desconhecido"}: ${String(m.content || "").slice(0, 80) || "(sem texto)"}`)
        .slice(0, 10);

      if (sample.length) {
        embed.addFields({ name: "Amostra (até 10)", value: sample.join("\n"), inline: false });
      }

      await logChannel.send({ embeds: [embed] });
    } catch {}
  },
};
