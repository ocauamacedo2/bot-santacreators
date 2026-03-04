// d:\santacreators-main\events\hallDaFama.js
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
const HALL_CHANNEL_ID = "1386503496353976470"; // Canal Oficial do Hall da Fama
const APPROVAL_CHANNEL_ID = "1387864036259004436"; // Canal de Aprovação

// Cargos Fixos para Menção
const ROLE_CIDADAO = "1262978759922028575";
const ROLE_LIDERES = "1353858422063239310";

// Cidades e seus Cargos
const CITIES = {
  nobre:   { label: "Cidade Nobre",   roleId: "1379021805544804382", emoji: "💎" },
  santa:   { label: "Cidade Santa",   roleId: "1379021888709464168", emoji: "🎅" },
  grande:  { label: "Cidade Grande",  roleId: "1418691103397253322", emoji: "🏙️" },
  maresia: { label: "Cidade Maresia", roleId: "1379021994678288465", emoji: "🌊" },
};

// Permissões (Quem pode enviar e aprovar)
// Mesma lista do Cronograma
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
const BTN_OPEN_MENU = "hf_open_menu";
const SEL_CITY = "hf_select_city";
const MODAL_SUBMIT = "hf_modal_submit";
const BTN_APPROVE_PREFIX = "hf_approve_";
const BTN_REJECT_PREFIX = "hf_reject_";

// Memória temporária para aprovação (reiniciou o bot, perde o pendente, mas ok para fluxo rápido)
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
      .setLabel("🏆 Registrar Hall da Fama")
      .setStyle(ButtonStyle.Success)
      .setEmoji("👑")
  );
}

// Garante que o botão fique sempre no final
async function ensureButtonAtBottom(channel, client) {
  try {
    // 1. Busca mensagens recentes
    const messages = await channel.messages.fetch({ limit: 20 }).catch(() => null);
    if (!messages) return;

    // 2. Remove botões antigos do bot
    const myMsgs = messages.filter(
      (m) => m.author.id === client.user.id && m.components.length > 0 && m.components[0].components[0].customId === BTN_OPEN_MENU
    );

    for (const m of myMsgs.values()) {
      await m.delete().catch(() => {});
    }

    // 3. Envia novo botão
    await channel.send({
      components: [buildRegisterButton()]
    });
  } catch (e) {
    console.error("[HallDaFama] Erro ao mover botão:", e);
  }
}

// ================= EXPORTS =================

export async function hallDaFamaOnReady(client) {
  const channel = await client.channels.fetch(HALL_CHANNEL_ID).catch(() => null);
  if (channel && channel.isTextBased()) {
    await ensureButtonAtBottom(channel, client);
  }
}

export async function hallDaFamaHandleInteraction(interaction, client) {
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
      content: "🌆 **Para qual cidade é este Hall da Fama?**",
      components: [row],
      ephemeral: true
    });
    return true;
  }

  // 2. Seleção de Cidade -> Modal
  if (interaction.isStringSelectMenu() && interaction.customId === SEL_CITY) {
    const cityKey = interaction.values[0];
    
    const modal = new ModalBuilder()
      .setCustomId(`${MODAL_SUBMIT}:${cityKey}`)
      .setTitle(`Hall da Fama - ${CITIES[cityKey].label}`);

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("hf_event_name")
          .setLabel("Nome do Evento")
          .setPlaceholder("Ex: Fuga Espacial")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("hf_winners")
          .setLabel("Vencedores (Top 1, 2, 3 ou GG)")
          .setPlaceholder("TOP:: 1️⃣ :: Nome | ID | Prêmio\nTOP:: 2️⃣ :: ...")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("hf_image")
          .setLabel("Link da Imagem (Banner/Print)")
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
    const eventName = interaction.fields.getTextInputValue("hf_event_name");
    const winnersText = interaction.fields.getTextInputValue("hf_winners");
    const imageUrl = interaction.fields.getTextInputValue("hf_image");

    const reqId = `${interaction.user.id}-${Date.now()}`;
    
    // Salva dados temporários
    pendingRequests.set(reqId, {
      userId: interaction.user.id,
      cityKey,
      eventName,
      winnersText,
      imageUrl
    });

    const approvalChannel = await client.channels.fetch(APPROVAL_CHANNEL_ID).catch(() => null);
    if (!approvalChannel) {
      return interaction.editReply("❌ Canal de aprovação não encontrado.");
    }

    const embed = new EmbedBuilder()
      .setTitle("🛡️ Aprovação: Hall da Fama")
      .setColor("#FFD700")
      .setDescription(`**Solicitante:** <@${interaction.user.id}>\n**Cidade:** ${CITIES[cityKey].label}`)
      .addFields(
        { name: "Evento", value: eventName },
        { name: "Vencedores", value: winnersText },
        { name: "Imagem", value: imageUrl }
      )
      .setImage(imageUrl)
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(``)
        .setLabel("✅ Aprovar e Postar")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(``)
        .setLabel("❌ Recusar")
        .setStyle(ButtonStyle.Danger)
    );

    await approvalChannel.send({
      content: "Nova solicitação de Hall da Fama pendente.",
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

    const hallChannel = await client.channels.fetch(HALL_CHANNEL_ID).catch(() => null);
    if (!hallChannel) return interaction.editReply("❌ Canal do Hall da Fama não encontrado.");

    // Monta a mensagem final (Formato Texto + Imagem Grande)
    const cityData = CITIES[data.cityKey];
    
    const finalMessage = 
`# 🎉 :  **Santa Creators : ${data.eventName}** 🎉 

É com MUITO orgulho que anunciamos os grandes vencedores do nosso evento de ** ${data.eventName.toUpperCase()} ** na **${cityData.label.toUpperCase()}**! <:coroa_orange:1353939359144870019> 

👏  Uma salva de palmas para os brabos 👏 

 :**HALL DA FAMA**

${data.winnersText}

Mostraram habilidade, esperteza e sangue nos olhos! <:__:1357520048318709840>

@everyone @here <@&${ROLE_CIDADAO}> <@&${ROLE_LIDERES}> <@&${cityData.roleId}>

${data.imageUrl}`;

    // Envia no canal oficial
    await hallChannel.send({ content: finalMessage });

    // Garante botão no final
    await ensureButtonAtBottom(hallChannel, client);

    // Computa pontos (Igual Cronograma)
    dashEmit("halldafama:aprovado", {
      userId: data.userId,
      approverId: interaction.user.id,
      at: Date.now()
    });

    // Atualiza mensagem de aprovação
    const embedApproved = EmbedBuilder.from(interaction.message.embeds[0])
      .setColor("#2ecc71")
      .setTitle("✅ Hall da Fama APROVADO")
      .setFooter({ text: `Aprovado por ${interaction.user.tag}` });

    await interaction.message.edit({ embeds: [embedApproved], components: [] });
    
    pendingRequests.delete(reqId);
    await interaction.editReply("✅ Hall da Fama postado e pontos computados!");
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
      .setTitle("❌ Hall da Fama RECUSADO")
      .setFooter({ text: `Recusado por ${interaction.user.tag}` });

    await interaction.message.edit({ embeds: [embedRejected], components: [] });
    
    pendingRequests.delete(reqId);
    await interaction.reply({ content: "❌ Solicitação recusada.", ephemeral: true });
    return true;
  }

  return false;
}
