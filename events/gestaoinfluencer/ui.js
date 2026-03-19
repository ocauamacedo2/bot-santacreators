import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from "discord.js";

import { SC_GI_CFG } from "./config.js";

export const BTN = {
  PAUSE: "GI_PAUSE_",
  EDIT: "GI_EDIT_",
  OFF: "GI_OFF_",
  RESP: "GI_RESP_",
  HISTORY: "GI_HISTORY_" // 👈 NOVO
};



export function registroEmbed({ rec, member, registrar }) {
  return new EmbedBuilder()
    .setColor(rec.active ? 0x2ecc71 : 0xe74c3c)
    .setTitle(`${rec.active ? "🟢" : "🔴"} Registro — Gestaoinfluencer`)
    .setDescription([
      `👤 **Membro:** <@${rec.targetId}>`,
      `🧭 **Área:** \`${rec.area}\``,
      `🗓️ **Entrada:** <t:${Math.floor(rec.joinDateMs / 1000)}:d>`,
      ``,
      `🔒 Cargo obrigatório enquanto ativo: <@&${SC_GI_CFG.ROLE_GESTAOINFLUENCER}>`
    ].join("\n"))
    .setFooter({
      text: `Registrado por ${registrar.username}`
    })
    .setTimestamp();
}

export function registroButtons(messageId, active) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(BTN.PAUSE + messageId)
      .setLabel(active ? "Pausar" : "Retomar")
      .setStyle(active ? ButtonStyle.Danger : ButtonStyle.Success)
      .setEmoji(active ? "⏸️" : "▶️"),

    new ButtonBuilder()
      .setCustomId(BTN.EDIT + messageId)
      .setLabel("Editar")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("✏️"),

    new ButtonBuilder()
      .setCustomId(BTN.RESP + messageId)
      .setLabel("Responsável")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("🧭"),

    new ButtonBuilder()
      .setCustomId(BTN.HISTORY + messageId)
      .setLabel("Histórico")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("📜"),

    new ButtonBuilder()
      .setCustomId(BTN.OFF + messageId)
      .setLabel("Desligar")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🗑️")
  );
}

