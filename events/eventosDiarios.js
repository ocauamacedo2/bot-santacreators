// d:\santacreators-main\events\eventosDiarios.js
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";

import { dashEmit } from "../utils/dashHub.js";

// ================= CONFIGURAÇÃO =================
const EVENTOS_CHANNEL_ID = "1385003944803041371"; // Canal Oficial de Eventos Diários
const APPROVAL_CHANNEL_ID = "1387864036259004436"; // Canal de Aprovação (Mesmo do Cronograma/Hall)

// Cargos Fixos para Menção
const ROLE_CIDADAO = "1262978759922028575";
const ROLE_LIDERES = "1353858422063239310";

// Cidades e seus Cargos (Para mencionar na dinâmica)
const CITIES = {
  nobre:   { label: "Cidade Nobre",   roleId: "1379021805544804382", emoji: "💎" },
  santa:   { label: "Cidade Santa",   roleId: "1379021888709464168", emoji: "🎅" },
  grande:  { label: "Cidade Grande",  roleId: "1418691103397253322", emoji: "🏙️" },
  maresia: { label: "Cidade Maresia", roleId: "1379021994678288465", emoji: "🌊" },
};

// Permissões (Mesma lista do Cronograma/Hall)
const ALLOWED_ROLES = [
  "1352408327983861844", // Resp Creators
  "1262262852949905409", // Resp Influ
  "1352407252216184833", // Resp Lider
  "1388976314253312100", // Coord Creators
  "1282119104576098314", // Mkt Creators
  "1262262852949905408", // Owner
  "1387253972661964840", // Equipe Social Medias
  "1388976094920704141", // Social Medias
  "1388975939161161728", // Gestor Creators
  "1352385500614234134", // Coordenação
  "1352429001188180039", // Equipe Creators
  "1414651836861907006", // Responsáveis
];

// ✅ QUEM PODE APROVAR (Igual Cronograma)
const APPROVER_ROLES = [
  "1262262852949905408", // Owner
  "1352408327983861844", // Resp Creators
  "1262262852949905409", // Resp Influ
  "1352407252216184833", // Resp Lider
];

const ALLOWED_USERS = [
  "660311795327828008", // Você
  "1262262852949905408", // Owner
];

// IDs dos Componentes
const BTN_OPEN_MENU = "evd_open_menu";
const SEL_CITY = "evd_select_city";
const MODAL_SUBMIT = "evd_modal_submit";
const BTN_APPROVE_PREFIX = "evd_approve_";
const BTN_REJECT_PREFIX = "evd_reject_";

// Memória temporária para aprovação
const pendingRequests = new Map();

// ================= HELPERS =================
function hasPermission(member, userId) {
  if (ALLOWED_USERS.includes(userId)) return true;
  return member?.roles?.cache?.some((r) => ALLOWED_ROLES.includes(r.id)) || false;
}

function canApprove(member, userId) {
  if (ALLOWED_USERS.includes(userId)) return true;
  return member?.roles?.cache?.some((r) => APPROVER_ROLES.includes(r.id)) || false;
}

function buildRegisterButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(BTN_OPEN_MENU)
      .setLabel("📅 Registrar Evento Diário")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("📢")
  );
}

// Garante que o botão fique sempre no final
async function ensureButtonAtBottom(channel, client) {
  try {
    const messages = await channel.messages.fetch({ limit: 20 }).catch(() => null);
    if (!messages) return;

    const myMsgs = messages.filter(
      (m) => m.author.id === client.user.id && m.components.length > 0 && m.components[0].components[0].customId === BTN_OPEN_MENU
    );

    for (const m of myMsgs.values()) {
      await m.delete().catch(() => {});
    }

    await channel.send({
      components: [buildRegisterButton()]
    });
  } catch (e) {
    console.error("[EventosDiarios] Erro ao mover botão:", e);
  }
}

// ================= EXPORTS =================

export async function eventosDiariosOnReady(client) {
  const channel = await client.channels.fetch(EVENTOS_CHANNEL_ID).catch(() => null);
  if (channel && channel.isTextBased()) {
    await ensureButtonAtBottom(channel, client);
  }
}

export async function eventosDiariosHandleInteraction(interaction, client) {
  if (!interaction.guild) return false;

  // 1. Botão Inicial -> Select de Cidade
  if (interaction.isButton() && interaction.customId === BTN_OPEN_MENU) {
    if (!hasPermission(interaction.member, interaction.user.id)) {
      return interaction.reply({ content: "🚫 Sem permissão.", ephemeral: true });
    }

    const select = new StringSelectMenuBuilder()
      .setCustomId(SEL_CITY)
      .setPlaceholder("Selecione a Cidade do Evento")
      .addOptions(
        Object.entries(CITIES).map(([key, data]) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(data.label)
            .setValue(key)
            .setEmoji(data.emoji)
        )
      );

    const row = new ActionRowBuilder().addComponents(select);
    
    await interaction.reply({
      content: "🌆 **Em qual cidade será o evento?**",
      components: [row],
      ephemeral: true
    });
    return true;
  }

  // 2. Seleção de Cidade -> Modal
  if (interaction.isStringSelectMenu() && interaction.customId === SEL_CITY) {
    const cityKey = interaction.values[0];
    
    const modal = new ModalBuilder()
      .setCustomId(`${MODAL_SUBMIT}:${cityKey}`) // ✅ Garante que o ID da cidade vai no modal
      .setTitle(`Evento - ${CITIES[cityKey].label}`);

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("evd_title")
          .setLabel("Título do Evento")
          .setPlaceholder("Ex: SANTA DO CRIME")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("evd_description")
          .setLabel("Descrição / Regras / Horário")
          .setPlaceholder("Cole aqui todo o texto explicativo, regras, horários, premiações...")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("evd_image")
          .setLabel("Link da Imagem (Banner)")
          .setPlaceholder("https://cdn.discordapp.com/...")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );

    await interaction.showModal(modal);
    return true;
  }

  // 3. Modal Submit -> Envia para Aprovação
  if (interaction.isModalSubmit() && interaction.customId.startsWith(MODAL_SUBMIT)) {
    await interaction.deferReply({ ephemeral: true });

    const cityKey = interaction.customId.split(":")[1];
    if (!cityKey || !CITIES[cityKey]) {
      return interaction.editReply("❌ Erro: Cidade não identificada. Tente abrir o menu novamente.");
    }

    const title = interaction.fields.getTextInputValue("evd_title");
    const description = interaction.fields.getTextInputValue("evd_description");
    const imageUrl = interaction.fields.getTextInputValue("evd_image");

    const reqId = `${interaction.user.id}-${Date.now()}`;
    
    pendingRequests.set(reqId, {
      userId: interaction.user.id,
      cityKey,
      title,
      description,
      imageUrl
    });

    const approvalChannel = await client.channels.fetch(APPROVAL_CHANNEL_ID).catch(() => null);
    if (!approvalChannel) {
      return interaction.editReply("❌ Canal de aprovação não encontrado.");
    }

    const embed = new EmbedBuilder()
      .setTitle("🛡️ Aprovação: Evento Diário")
      .setColor("#9b59b6")
      .setDescription(`**Solicitante:** <@${interaction.user.id}>\n**Cidade:** ${CITIES[cityKey].label}`)
      .addFields(
        { name: "Título", value: title },
        { name: "Descrição (Preview)", value: description.slice(0, 1000) + (description.length > 1000 ? "..." : "") },
        { name: "Imagem", value: imageUrl }
      )
      .setImage(imageUrl)
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${BTN_APPROVE_PREFIX}${reqId}`)
        .setLabel("✅ Aprovar e Postar")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`${BTN_REJECT_PREFIX}${reqId}`)
        .setLabel("❌ Recusar")
        .setStyle(ButtonStyle.Danger)
    );

    await approvalChannel.send({
      content: "Nova solicitação de Evento Diário pendente.",
      embeds: [embed],
      components: [row]
    });

    await interaction.editReply("✅ Solicitação enviada para aprovação!");
    return true;
  }

  // 4. Aprovar
  if (interaction.isButton() && interaction.customId.startsWith(BTN_APPROVE_PREFIX)) {
    if (!canApprove(interaction.member, interaction.user.id)) {
      return interaction.reply({ content: "🚫 Você não tem permissão para aprovar.", ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });
    const reqId = interaction.customId.replace(BTN_APPROVE_PREFIX, "");
    const data = pendingRequests.get(reqId);

    if (!data) {
      return interaction.editReply("⚠️ Dados da solicitação expiraram ou não foram encontrados.");
    }

    const eventChannel = await client.channels.fetch(EVENTOS_CHANNEL_ID).catch(() => null);
    if (!eventChannel) return interaction.editReply("❌ Canal de Eventos não encontrado.");

    const cityData = CITIES[data.cityKey];
    
    // Monta a mensagem final (Texto + Menções + Imagem Grande no final)
    const finalMessage = 
`# 🎉 :  **Santa Creators : ${data.title}** 🎉 

${data.description}

@everyone @here <@&${ROLE_CIDADAO}> <@&${ROLE_LIDERES}> <@&${cityData.roleId}>

${data.imageUrl}`;

    // Envia no canal oficial
    await eventChannel.send({ content: finalMessage });

    // Garante botão no final
    await ensureButtonAtBottom(eventChannel, client);

    // Computa pontos (Igual Cronograma/Hall)
    dashEmit("eventosdiarios:aprovado", {
      userId: data.userId,
      approverId: interaction.user.id,
      at: Date.now()
    });

    // Atualiza mensagem de aprovação
    const embedApproved = EmbedBuilder.from(interaction.message.embeds[0])
      .setColor("#2ecc71")
      .setTitle("✅ Evento Diário APROVADO")
      .setFooter({ text: `Aprovado por ${interaction.user.tag}` });

    await interaction.message.edit({ embeds: [embedApproved], components: [] });
    
    pendingRequests.delete(reqId);
    await interaction.editReply("✅ Evento postado e pontos computados!");
    return true;
  }

  // 5. Recusar
  if (interaction.isButton() && interaction.customId.startsWith(BTN_REJECT_PREFIX)) {
    if (!canApprove(interaction.member, interaction.user.id)) {
      return interaction.reply({ content: "🚫 Você não tem permissão para recusar.", ephemeral: true });
    }

    const reqId = interaction.customId.replace(BTN_REJECT_PREFIX, "");
    
    const embedRejected = EmbedBuilder.from(interaction.message.embeds[0])
      .setColor("#e74c3c")
      .setTitle("❌ Evento Diário RECUSADO")
      .setFooter({ text: `Recusado por ${interaction.user.tag}` });

    await interaction.message.edit({ embeds: [embedRejected], components: [] });
    
    pendingRequests.delete(reqId);
    await interaction.reply({ content: "❌ Solicitação recusada.", ephemeral: true });
    return true;
  }

  return false;
}
