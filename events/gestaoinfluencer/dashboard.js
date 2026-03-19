// events/gestaoinfluencer/dashboard.js

import { EmbedBuilder } from "discord.js";
import { SC_GI_CFG } from "./config.js";
import { SC_GI_STATE, scheduleSave } from "./state.js";

export async function updateGIDashboard(client, stats) {
  const guild = client.guilds.cache.get(SC_GI_CFG.GUILD_ID);
  if (!guild) return;

  const channel = await guild.channels
    .fetch(SC_GI_CFG.CHANNEL_RESUMO_GI)
    .catch(() => null);
  if (!channel) return;

  let msg = null;

  if (SC_GI_STATE.dashboardMessageId) {
    msg = await channel.messages
      .fetch(SC_GI_STATE.dashboardMessageId)
      .catch(() => null);
  }

  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle("📊 Dashboard — GestãoInfluencer")
    .setDescription("Resumo automático da gestão")
    .addFields(
      { name: "👥 Ativos", value: `${stats.ativos}`, inline: true },
      { name: "⏸️ Pausados", value: `${stats.pausados}`, inline: true },
      {
        name: "🧓 Veteranos (4+ semanas)",
        value: stats.veteranos.length
          ? stats.veteranos.join("\n").slice(0, 1024)
          : "Nenhum",
      }
    )
    .setFooter({
      text: `Última atualização • ${new Date().toLocaleString("pt-BR")}`,
    });

  if (msg) {
    await msg.edit({ embeds: [embed] });
  } else {
    const sent = await channel.send({ embeds: [embed] });
    SC_GI_STATE.dashboardMessageId = sent.id;
    scheduleSave();
  }
}
