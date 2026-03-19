import { EmbedBuilder } from "discord.js";
import { SC_GI_CFG } from "./config.js";

export async function sendGIResumo(client, {
  ativos,
  pausados,
  veteranos
}) {
  const channel = await client.channels
    .fetch(SC_GI_CFG.CHANNEL_RESUMO_GI)
    .catch(() => null);

  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle("📊 GestãoInfluencer — Resumo Diário")
    .setDescription([
      `🟢 **Ativos:** ${ativos}`,
      `⏸️ **Pausados:** ${pausados}`,
      ``,
      `🏆 **Veteranos (4+ semanas):**`,
      veteranos.length
        ? veteranos.map(v => `• ${v}`).join("\n")
        : "_Nenhum ainda_"
    ].join("\n"))
    .setTimestamp();

  await channel.send({ embeds: [embed] });
}
