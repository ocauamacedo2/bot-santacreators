import { EmbedBuilder } from "discord.js";
import { SC_GI_CFG } from "./config.js";

export async function notifyGI(client, {
  title,
  targetId,
  responsibleId,
  description,
  color = 0xe67e22
}) {
  const channel = await client.channels
    .fetch(SC_GI_CFG.CHANNEL_ALERTAS_GI)
    .catch(() => null);

  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();

  const content = [
    targetId ? `<@${targetId}>` : null,
    responsibleId ? `🧭 Resp: <@${responsibleId}>` : null
  ].filter(Boolean).join(" • ");

  await channel.send({
    content,
    embeds: [embed]
  });
}
