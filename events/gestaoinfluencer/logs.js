import { EmbedBuilder } from "discord.js";
import { SC_GI_CFG } from "./config.js";

export async function logGI(client, {
  action,
  author,
  targetId,
  area,
  extra
}) {
  const channel = await client.channels
    .fetch(SC_GI_CFG.CHANNEL_LOGS)
    .catch(() => null);

  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle(`📑 GI • ${action}`)
    .setDescription([
      `👤 **Membro:** <@${targetId}>`,
      area ? `🧭 **Área:** \`${area}\`` : null,
      author ? `🛠️ **Ação por:** <@${author.id}>` : null,
      extra ? `📌 **Info:** ${extra}` : null
    ].filter(Boolean).join("\n"))
    .setTimestamp();

  await channel.send({ embeds: [embed] });
}
