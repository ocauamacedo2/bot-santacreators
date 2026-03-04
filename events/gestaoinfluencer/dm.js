import { EmbedBuilder } from "discord.js";
import { SC_GI_CFG } from "./config.js";

export async function sendDMWithMirror(client, userId, embed) {
  const user = await client.users.fetch(userId).catch(() => null);
  if (!user) return;

  await user.send({ embeds: [embed] }).catch(() => {});

  const mirror = await client.channels
    .fetch(SC_GI_CFG.CHANNEL_DM_MIRROR)
    .catch(() => null);

  if (mirror) {
    await mirror.send({
      content: `📩 DM enviada para <@${userId}>`,
      embeds: [embed]
    });
  }
}
export function autoOffEmbed(days) {
  return {
    title: "⛔ Registro desligado automaticamente",
    description:
      `Seu registro ficou **pausado por ${days} dias**.\n` +
      `Por isso, foi **desligado automaticamente**.\n\n` +
      `Se precisar, procure um responsável.`,
    color: 0xe74c3c,
    timestamp: new Date()
  };
}

export function weeklyDMEmbed(weeks) {
  return new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle("📆 Semana concluída — GestãoInfluencer")
    .setDescription(`Você completou **${weeks} semana(s)** na gestão 💜`)
    .setTimestamp();
}

export function oneMonthEmbed() {
  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle("🏆 1 MÊS NA GESTÃO")
    .setDescription("Parabéns! Você completou **1 mês** na GestãoInfluencer 💜")
    .setTimestamp();
}
