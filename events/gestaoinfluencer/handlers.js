// events/gestaoinfluencer/handlers.js

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  ChannelType,
  MessageFlags,
} from "discord.js";
import {
  createRegistro,
  toggleRegistro,
  desligarRegistro
} from "./records.js";
import { registroEmbed } from "./ui.js"; // 👈 ADD ISSO

import { BTN } from "./ui.js";

import { SC_GI_STATE, scheduleSave } from "./state.js";
import { SC_GI_CFG } from "./config.js";
import { getGIHistory } from "./history.js";

const nowMs = () => Date.now();

function hasAuth(member) {
  if (!member) return false;
  if (SC_GI_CFG.AUTH_USER_IDS.includes(member.id)) return true;
  return SC_GI_CFG.AUTH_ROLE_IDS.some((r) => member.roles.cache.has(r));
}



/* =========================
   MENU
========================= */

const GIF_SC_GI =
  'https://media.discordapp.net/attachments/1362477839944777889/1384245215249825832/standard_2rss.gif?width=515&height=66';

function menuEmbed() {
  return new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle('🛠️ Controle — **GESTAOINFLUENCER**')
    .setDescription([
      `> Registre membros do cargo <@&${SC_GI_CFG.ROLE_GESTAOINFLUENCER}> para monitorar **semanas** e **1 mês**.`,
      `> Apenas responsáveis/autorizados podem registrar, editar e gerenciar.`,
      '',
      '✅ **Automático:** DM semanal (00:00), aviso 1 mês, espelho de DM, logs.',
      '📝 **Dica:** defina um **Responsável Direto** (só escolher a pessoa; a área é detectada automática).',
      '',
      `🔒 **Trava GI:** enquanto a contagem estiver **ativa**, não pode remover o cargo <@&${SC_GI_CFG.ROLE_GESTAOINFLUENCER}>.`
    ].join('\n'))
    .setImage(GIF_SC_GI)
    .setFooter({ text: 'SantaCreators • gestaoinfluencer' });
}


function menuRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('SC_GI_OPEN_MODAL')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('📝')
      .setLabel('Novo Registro (GI)')
  );
}


async function ensureMenu(guild) {
  const ch = await guild.channels
    .fetch(SC_GI_CFG.CHANNEL_MENU_E_REGISTROS)
    .catch(() => null);
  if (!ch || ch.type !== ChannelType.GuildText) return;

  const msgs = await ch.messages.fetch({ limit: 20 }).catch(() => null);
  if (msgs) {
    for (const [, m] of msgs) {
      if (
        m.author.id === guild.client.user.id &&
        m.components?.some((r) =>
          r.components?.some((c) => c.customId === "SC_GI_OPEN_MODAL")
        )
      ) {
        SC_GI_STATE.menuMessageId = m.id;
        return;
      }
    }
  }

  const msg = await ch.send({ embeds: [menuEmbed()], components: [menuRow()] });
  SC_GI_STATE.menuMessageId = msg.id;
  scheduleSave();
}

/* =========================
   ✅ EXPORT GLOBAL
========================= */

export async function ensureMenuForAllGuilds(client) {
  for (const [, guild] of client.guilds.cache) {
    await ensureMenu(guild);
  }
}








/* ===========================
   INTERACTION CREATE
=========================== */

export async function handleInteraction(interaction, client) {
  const guild = interaction.guild;
  if (!guild) return false;

   // 🔒 BLOQUEIA INTERAÇÃO EM REGISTRO DESLIGADO
  if (
    interaction.isButton() &&
    interaction.customId.match(/^(GI_PAUSE_|GI_EDIT_|GI_OFF_|GI_RESP_|GI_HISTORY_)/)
  ) {
    const messageId = interaction.customId.split("_").pop();
    const rec = SC_GI_STATE.registros.get(messageId);

    if (!rec) {
      return interaction.reply({
        content: "⛔ Este registro não existe mais.",
        ephemeral: true
      });
    }
  }

  /* ---- ABRIR MODAL ---- */
if (interaction.isButton() && interaction.customId.startsWith(BTN.RESP)) {
  const id = interaction.customId.replace(BTN.RESP, "");

  const modal = new ModalBuilder()
    .setCustomId("GI_SET_RESP_" + id)
    .setTitle("Definir Responsável")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("respId")
          .setLabel("ID do responsável")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );

  await interaction.showModal(modal);
  return true;
}
if (interaction.isButton() && interaction.customId.startsWith(BTN.HISTORY)) {

  // 🔒 BLOQUEIO DE PERMISSÃO
  if (!hasAuth(interaction.member)) {
    return interaction.reply({
      content: "❌ Você não tem permissão para ver o histórico.",
      ephemeral: true
    });
  }

  const messageId = interaction.customId.replace(BTN.HISTORY, "");
  const rec = SC_GI_STATE.registros.get(messageId);

  if (!rec) {
    return interaction.reply({
      content: "❌ Registro não encontrado.",
      ephemeral: true
    });
  }

  const history = getGIHistory(rec.targetId);

  if (!history.length) {
    return interaction.reply({
      content: "📭 Sem histórico para este membro.",
      ephemeral: true
    });
  }

  const lines = history
    .slice(-15)
    .reverse()
    .map(h =>
      `• <t:${Math.floor(h.atMs / 1000)}:R> — **${h.action}** ${
        h.authorId ? `(<@${h.authorId}>)` : ""
      }`
    )
    .join("\n");

  return interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle("📜 Histórico — GestãoInfluencer")
        .setDescription(lines)
        .setColor(0x9b59b6)
    ],
    ephemeral: true
  });
}


if (
  interaction.isModalSubmit() &&
  interaction.customId.startsWith("GI_SET_RESP_")
) {
  const messageId = interaction.customId.replace("GI_SET_RESP_", "");
  const rec = SC_GI_STATE.registros.get(messageId);
  if (!rec) {
    return interaction.reply({ content: "❌ Registro não encontrado.", ephemeral: true });
  }

  const respId = interaction.fields.getTextInputValue("respId");

  rec.responsibleUserId = respId;
  SC_GI_STATE.boardDirty = true;
  scheduleSave();

  return interaction.reply({
    content: `🧭 Responsável definido: <@${respId}>`,
    ephemeral: true
  });
}
// ✏️ EDITAR REGISTRO
if (interaction.isButton() && interaction.customId.startsWith(BTN.EDIT)) {
  if (!hasAuth(interaction.member)) {
    return interaction.reply({
      content: "❌ Sem permissão para editar.",
      ephemeral: true
    });
  }

  const messageId = interaction.customId.replace(BTN.EDIT, "");
  const rec = SC_GI_STATE.registros.get(messageId);

  if (!rec) {
    return interaction.reply({
      content: "❌ Registro não encontrado.",
      ephemeral: true
    });
  }

  const modal = new ModalBuilder()
    .setCustomId("GI_EDIT_" + messageId)
    .setTitle("Editar Registro — GI")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("area")
          .setLabel("Área")
          .setStyle(TextInputStyle.Short)
          .setValue(rec.area)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("date")
          .setLabel("Data de entrada (DD/MM/AAAA)")
          .setStyle(TextInputStyle.Short)
          .setValue(
            new Date(rec.joinDateMs)
              .toLocaleDateString("pt-BR")
          )
          .setRequired(true)
      )
    );

  await interaction.showModal(modal);
  return true;
}
// 💾 SALVAR EDIÇÃO
if (
  interaction.isModalSubmit() &&
  interaction.customId.startsWith("GI_EDIT_")
) {
  const messageId = interaction.customId.replace("GI_EDIT_", "");
  const rec = SC_GI_STATE.registros.get(messageId);

  if (!rec) {
    return interaction.reply({
      content: "❌ Registro não encontrado.",
      ephemeral: true
    });
  }

  const area = interaction.fields.getTextInputValue("area");
  const date = interaction.fields.getTextInputValue("date");

  const [d, m, y] = date.split("/");
  const joinDateMs = Date.UTC(y, m - 1, d);

  rec.area = area;
  rec.joinDateMs = joinDateMs;

  SC_GI_STATE.boardDirty = true;
  scheduleSave();

  // 🔄 Atualiza embed
  const channel = await interaction.guild.channels.fetch(rec.channelId);
  const msg = await channel.messages.fetch(rec.messageId);

  const member = await interaction.guild.members.fetch(rec.targetId);
  const registrar = await interaction.guild.members.fetch(rec.registrarId);

  const embed = registroEmbed({ rec, member, registrar });

  await msg.edit({ embeds: [embed] });

  return interaction.reply({
    content: "✏️ Registro atualizado com sucesso!",
    ephemeral: true
  });
}


  // ⏸️ Pausar / ▶️ Retomar
if (interaction.isButton() && interaction.customId.startsWith(BTN.PAUSE)) {
  const id = interaction.customId.replace(BTN.PAUSE, "");
 await toggleRegistro(interaction.guild, id, interaction.user);
  return interaction.reply({
    content: "✅ Atualizado",
    ephemeral: true
  });
}

// 🗑️ Desligar
if (interaction.isButton() && interaction.customId.startsWith(BTN.OFF)) {
  const id = interaction.customId.replace(BTN.OFF, "");
await desligarRegistro(
  interaction.guild,
  id,
  interaction.user
);
  return interaction.reply({
    content: "🗑️ Registro removido",
    ephemeral: true
  });
}


  if (interaction.isButton() && interaction.customId === "SC_GI_OPEN_MODAL") {
    if (!hasAuth(interaction.member))
      return interaction.reply({
        content: "❌ Sem permissão.",
        flags: MessageFlags.Ephemeral,
      });

    const modal = new ModalBuilder()
      .setCustomId("GI_MODAL_CREATE")
      .setTitle("Novo Registro — GI")
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("date")
            .setLabel("Data de entrada (DD/MM/AAAA)")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("area")
            .setLabel("Área")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("id")
            .setLabel("ID do Discord")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      );

    await interaction.showModal(modal);
    return true;
  }

  /* ---- MODAL SUBMIT ---- */
  if (interaction.isModalSubmit() && interaction.customId === "GI_MODAL_CREATE") {
  if (!hasAuth(interaction.member)) {
    return interaction.reply({
      content: "❌ Sem permissão.",
      ephemeral: true
    });
  }

  const date = interaction.fields.getTextInputValue("date");
  const area = interaction.fields.getTextInputValue("area");
  const id   = interaction.fields.getTextInputValue("id");

  const [d, m, y] = date.split("/");
  const joinDateMs = Date.UTC(y, m - 1, d);

  await interaction.deferReply({ ephemeral: true });

  try {
    const channel = await interaction.guild.channels.fetch(
      SC_GI_CFG.CHANNEL_MENU_E_REGISTROS
    );

    const target = await interaction.guild.members.fetch(id);

    await createRegistro({
      guild: interaction.guild,
      channel,
      target,
      registrar: interaction.user,
      area,
      joinDateMs
    });

    await interaction.editReply("✅ Registro criado com sucesso!");
  } catch (e) {
    await interaction.editReply(`❌ ${e.message}`);
  }

  return true;
}

  return false;
}



/* ===========================
   GUILD MEMBER UPDATE
=========================== */

