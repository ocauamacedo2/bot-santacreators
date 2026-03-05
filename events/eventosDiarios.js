// d:\santacreators-main\events\eventosDiarios.js
import fs from "node:fs";
import path from "node:path";
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

// ================= PERSISTÊNCIA =================
const DATA_DIR = path.resolve(process.cwd(), "data");
const STATE_FILE = path.join(DATA_DIR, "eventos_diarios_state.json");

const ensureDir = () => { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); };
const saveState = (data) => { ensureDir(); fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2)); };
const loadState = () => { try { if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch {} return { pendingRequests: {} }; };

// ================= CONFIGURAÇÃO =================
const EVENTOS_CHANNEL_ID = "1385003944803041371"; // Canal Oficial de Eventos Diários
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

// Permissões
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

const BTN_OPEN_MENU = "evd_open_menu";
const SEL_CITY = "evd_select_city";
const MODAL_SUBMIT = "evd_modal_submit";
const BTN_APPROVE_PREFIX = "evd_approve_";
const BTN_REJECT_PREFIX = "evd_reject_";

// Carrega os pedidos pendentes do arquivo ao iniciar
let state = loadState();

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

// ✅ Lógica inteligente: se force=false, só cria se não existir. Se force=true, apaga e recria (pra descer).
async function ensureButtonAtBottom(channel, client, force = true) {
  try {
    const messages = await channel.messages.fetch({ limit: 20 }).catch(() => null);
    if (!messages) return;

    const myMsgs = messages.filter(
      (m) => m.author.id === client.user.id && m.components.length > 0 && m.components[0].components[0].customId === BTN_OPEN_MENU
    );

    // Se não for forçado (restart) e já existir botão, não faz nada
    if (!force && myMsgs.size > 0) return;

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
  // Garante que o estado seja carregado no boot
  state = loadState();
  const channel = await client.channels.fetch(EVENTOS_CHANNEL_ID).catch(() => null);
  if (channel && channel.isTextBased()) {
    // ✅ No restart, passa false para não spammar se já tiver botão
    await ensureButtonAtBottom(channel, client, false);
  }
}

export async function eventosDiariosHandleInteraction(interaction, client) {
  if (!interaction.guild) return false;

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

  if (interaction.isStringSelectMenu() && interaction.customId === SEL_CITY) {
    const cityKey = interaction.values[0];
    
    const modal = new ModalBuilder()
      .setCustomId(`${MODAL_SUBMIT}:${cityKey}`)
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
          .setPlaceholder("Cole aqui todo o texto explicativo...")
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

  if (interaction.isModalSubmit() && interaction.customId.startsWith(MODAL_SUBMIT)) {
    await interaction.deferReply({ ephemeral: true });

    const cityKey = interaction.customId.split(":")[1];
    if (!cityKey || !CITIES[cityKey]) {
      return interaction.editReply("❌ Erro: Cidade não identificada.");
    }

    const title = interaction.fields.getTextInputValue("evd_title");
    const description = interaction.fields.getTextInputValue("evd_description");
    const imageUrl = interaction.fields.getTextInputValue("evd_image");

    const reqId = `${interaction.user.id}-${Date.now()}`;
    
    state.pendingRequests[reqId] = {
      userId: interaction.user.id,
      cityKey,
      title,
      description,
      imageUrl
    };
    saveState(state); // Salva no arquivo

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

  if (interaction.isButton() && interaction.customId.startsWith(BTN_APPROVE_PREFIX)) {
    if (!canApprove(interaction.member, interaction.user.id)) {
      return interaction.reply({ content: "🚫 Você não tem permissão para aprovar.", ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });
    const reqId = interaction.customId.replace(BTN_APPROVE_PREFIX, "");
    const data = state.pendingRequests[reqId];

    if (!data) {
      return interaction.editReply("⚠️ Dados da solicitação expiraram.");
    }

    const eventChannel = await client.channels.fetch(EVENTOS_CHANNEL_ID).catch(() => null);
    if (!eventChannel) return interaction.editReply("❌ Canal de Eventos não encontrado.");

    const cityData = CITIES[data.cityKey];

    // ✅ CORREÇÃO: Mover texto longo para o Embed
    const eventEmbed = new EmbedBuilder()
      .setTitle(`🎉 :  **Santa Creators : ${data.title}** 🎉`)
      .setDescription(data.description)
      .setImage(data.imageUrl)
      .setColor("#9b59b6");

    const mentions = `@everyone @here <@&${ROLE_CIDADAO}> <@&${ROLE_LIDERES}> <@&${cityData.roleId}>`;

    const sentMsg = await eventChannel.send({ 
      content: mentions,
      embeds: [eventEmbed]
    });
    
    // ✅ Mais emojis
    try {
      const emojis = ["💜", "🔥", "🚀", "👏", "🎉", "🤩", "🤯", "🏆", "👑", "💸"];
      for (const e of emojis) await sentMsg.react(e).catch(() => {});
    } catch {}

    // ✅ Aqui passa true para forçar o botão a descer
    await ensureButtonAtBottom(eventChannel, client, true);

    dashEmit("eventosdiarios:aprovado", {
      userId: data.userId,
      approverId: interaction.user.id,
      at: Date.now()
    });

    const embedApproved = EmbedBuilder.from(interaction.message.embeds[0])
      .setColor("#2ecc71")
      .setTitle("✅ Evento Diário APROVADO")
      .setFooter({ text: `Aprovado por ${interaction.user.tag}` });

    await interaction.message.edit({ embeds: [embedApproved], components: [] }).catch(() => {});
    
    delete state.pendingRequests[reqId];
    saveState(state); // Salva a remoção
    await interaction.editReply("✅ Evento postado e pontos computados!");
    return true;
  }

  if (interaction.isButton() && interaction.customId.startsWith(BTN_REJECT_PREFIX)) {
    if (!canApprove(interaction.member, interaction.user.id)) {
      return interaction.reply({ content: "🚫 Você não tem permissão para recusar.", ephemeral: true });
    }

    const reqId = interaction.customId.replace(BTN_REJECT_PREFIX, "");
    
    const embedRejected = EmbedBuilder.from(interaction.message.embeds[0])
      .setColor("#e74c3c")
      .setTitle("❌ Evento Diário RECUSADO")
      .setFooter({ text: `Recusado por ${interaction.user.tag}` });

    await interaction.message.edit({ embeds: [embedRejected], components: [] }).catch(() => {});
    
    delete state.pendingRequests[reqId];
    saveState(state); // Salva a remoção
    await interaction.reply({ content: "❌ Solicitação recusada.", ephemeral: true });
    return true;
  }

  return false;
}
