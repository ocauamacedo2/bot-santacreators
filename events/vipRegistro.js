// ./application/events/vipRegistro.js
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
} from "discord.js";

import { dashEmit } from "../utils/dashHub.js";

// Guard para evitar dupla carga
if (globalThis.__VIP_REGISTRO_LOADED__) {
  // já carregado
}
globalThis.__VIP_REGISTRO_LOADED__ = true;

globalThis.__VIP_REGISTRO_STATE__ ??= {
  isMoving: false,
  handledInteractions: new Set()
};
const ST = globalThis.__VIP_REGISTRO_STATE__;

function VIP_hasHandled(i) {
  try {
    if (!i?.id) return false;
    if (ST.handledInteractions.has(i.id)) return true;
    ST.handledInteractions.add(i.id);
    setTimeout(() => ST.handledInteractions.delete(i.id), 60_000);
    return false;
  } catch { return false; }
}

// =============================
// CONFIG
// =============================
const VIP_CANAL_ID = "1411814379162308688";
const VIP_REPROVA_CANAL_ID = "1411819432862285854";

const VIP_MAIN_REGISTER_ID = "vip_menu_registrar";
const VIP_MAIN_FILTER_SOLIC_ID = "vip_menu_solicitados";
const VIP_MAIN_FILTER_NAOCLIC_ID = "vip_menu_naoclicados";
const VIP_MAIN_MOTIVO_ID = "vip_menu_motivo";

const VIP_MAIN_REGISTER_IDS = new Set([
  VIP_MAIN_REGISTER_ID,
  "vip_abrir_formulario",
  "vip_abrir_form",
  "vip_menu_abrir_formulario",
  "vip_registrar_btn",
]);

const VIP_MAIN_FILTER_SOLIC_IDS = new Set([
  VIP_MAIN_FILTER_SOLIC_ID,
  "vip_menu_solicitados_antigo",
  "vip_solicitados",
]);

const VIP_MAIN_FILTER_NAOCLIC_IDS = new Set([
  VIP_MAIN_FILTER_NAOCLIC_ID,
  "vip_menu_nao_clicados",
  "vip_naoclicados",
]);

const VIP_MAIN_MOTIVO_IDS = new Set([
  VIP_MAIN_MOTIVO_ID,
  "vip_menu_motivo_antigo",
  "vip_motivo",
]);

const VIP_GIF =
  "https://media.discordapp.net/attachments/1362477839944777889/1384245215249825832/standard_2rss.gif?ex=68b5ec51&is=68b49ad1&hm=f194706bc612abcd8cbbbf6d62d2c393d49339bfea8714ceab371a0a4c95a670&=";

// Quem pode registrar/operar
const VIP_AUTH = new Set([
  "1262262852949905408", // owner
  "1352408327983861844", // resp creator
  "1262262852949905409", // resp influ
  "1352407252216184833", // resp lider
  "1388976314253312100", // coord creators
  "660311795327828008",  // você
]);

const CITY_ALIASES = [
  { key: "grande", label: "Cidade Grande", aliases: ["grande", "cidade grande", "cg"] },
  { key: "maresia", label: "Cidade Maresia", aliases: ["maresia", "cidade maresia", "cm"] },
  { key: "santa", label: "Cidade Santa", aliases: ["santa", "cidade santa", "cs"] },
  { key: "nobre", label: "Cidade Nobre", aliases: ["nobre", "cidade nobre", "cn"] },
];

// =============================
// HELPERS BÁSICOS
// =============================
function ensureIsTextChannel(ch) {
  return ch && ch.type === ChannelType.GuildText;
}

function hasVipAuth(member) {
  return (
    VIP_AUTH.has(member?.id) ||
    member?.roles?.cache?.some((r) => VIP_AUTH.has(r.id))
  );
}

function isDiscordId(text) {
  return /^\d{17,20}$/.test((text || "").trim());
}

function extractId(text) {
  const t = (text || "").trim();
  if (isDiscordId(t)) return t;
  const m = t.match(/^<@!?(\d{17,20})>$/);
  if (m?.[1]) return m[1];
  return null;
}

function vipNormalize(t) {
  const s = (t || "").toString().trim().toLowerCase();
  if (/(ouro)/i.test(s)) return "OURO";
  if (/(prata)/i.test(s)) return "PRATA";
  if (/(bronze)/i.test(s)) return "BRONZE";
  if (/(rolepass|role pass|pass)/i.test(s)) return "ROLEPASS";
  return null;
}

function normalizeCity(raw) {
  const s = (raw || "").toString().trim().toLowerCase();
  if (!s) return null;
  for (const city of CITY_ALIASES) {
    if (city.aliases.some((a) => a === s)) {
      return city.label;
    }
  }
  return null;
}

function cityDecor(cityLabel) {
  switch (cityLabel) {
    case "Cidade Grande": return "🏙️";
    case "Cidade Maresia": return "🌊";
    case "Cidade Santa": return "⛪";
    case "Cidade Nobre": return "👑";
    default: return "📍";
  }
}

const vipDecor = {
  OURO: { label: "VIP OURO", emoji: "🥇", color: "#f1c40f" },
  PRATA: { label: "VIP PRATA", emoji: "🥈", color: "#bdc3c7" },
  BRONZE: { label: "VIP BRONZE", emoji: "🥉", color: "#cd7f32" },
  ROLEPASS: { label: "ROLEPASS", emoji: "🎟️", color: "#9b59b6" },
  CUSTOM: { label: "VIP EVENTO", emoji: "💎", color: "#8e44ad" },
};

function disableComponents(rows = []) {
  return rows.map((row) => {
    const clonedRow = ActionRowBuilder.from(row);
    clonedRow.components = clonedRow.components.map((c) =>
      ButtonBuilder.from(c).setDisabled(true)
    );
    return clonedRow;
  });
}

function getFieldValue(embedLike, fieldName) {
  const fields = embedLike?.fields || embedLike?.data?.fields || [];
  const f = fields.find((x) => x.name === fieldName);
  return (f?.value || "").trim();
}

function getStatusValueFromEmbed(embedLike) {
  return getFieldValue(embedLike, "📌 Status");
}

function extractTargetIdFromComponents(rows = []) {
  const ids = rows
    ?.flatMap((row) => row.components || [])
    ?.map((c) => c.customId)
    ?.filter(Boolean) || [];

  const btnRecebeu = ids.find((id) => id.startsWith("vip_recebeu_") || id.startsWith("vip_pago_") || id.startsWith("vip_negar_") || id.startsWith("vip_reprovar_"));
  if (!btnRecebeu) return "none";

  const parts = btnRecebeu.split("_");
  return parts[3] || "none";
}

function isVipMainRegisterId(customId) {
  return VIP_MAIN_REGISTER_IDS.has(customId);
}

function isVipMainSolicitadosId(customId) {
  return VIP_MAIN_FILTER_SOLIC_IDS.has(customId);
}

function isVipMainNaoClicadosId(customId) {
  return VIP_MAIN_FILTER_NAOCLIC_IDS.has(customId);
}

function isVipMainMotivoId(customId) {
  return VIP_MAIN_MOTIVO_IDS.has(customId);
}

function parseVipLegacyAction(customId) {
  if (!customId?.startsWith("vip_")) return null;
  const parts = customId.split("_");

  if (customId.startsWith("vip_solicitado_")) {
    return { action: "solicitado", msgId: parts[2] || null, targetId: null };
  }
  if (customId.startsWith("vip_recebeu_") || customId.startsWith("vip_pago_")) {
    return { action: "recebeu", msgId: parts[2] || null, targetId: parts[3] || "none" };
  }
  if (customId.startsWith("vip_negar_") || customId.startsWith("vip_reprovar_")) {
    return { action: "negar", msgId: parts[2] || (parts[1] === "reprovar" ? parts[2] : null), targetId: parts[3] || "none" };
  }
  return null;
}

// =============================
// NOVO: SISTEMA DE DM SEGURA
// =============================
async function safeSendVipDM(client, targetId, payload) {
  try {
    if (!targetId || targetId === "none") return false;
    const user = await client.users.fetch(targetId).catch(() => null);
    if (!user) return false;
    await user.send(payload).catch(() => {
      console.warn(`[VIP Registro] Não foi possível enviar DM para o beneficiário: ${targetId}`);
    });
    return true;
  } catch {
    return false;
  }
}

function buildVipDmEmbed({ title, color, tipo, cidade, motivo, autorLabel, autorValue }) {
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(color)
    .addFields(
      { name: "🧾 Tipo", value: tipo, inline: true },
      { name: "🌆 Cidade", value: cidade, inline: true },
      { name: "📝 Motivo", value: motivo || "Não informado", inline: false },
      { name: autorLabel, value: autorValue, inline: true },
      { name: "📅 Data", value: `<t:${Math.floor(Date.now() / 1000)}:f>`, inline: true }
    )
    .setFooter({ text: "SantaCreators – VIP / Rolepass" })
    .setTimestamp();
  return embed;
}

// =============================
// UI MENU
// =============================
function createMainMenuRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(VIP_MAIN_REGISTER_ID)
      .setLabel("💎 Registrar VIP / Rolepass")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId(VIP_MAIN_FILTER_SOLIC_ID)
      .setLabel("📨 Solicitados")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId(VIP_MAIN_FILTER_NAOCLIC_ID)
      .setLabel("🕒 Não clicados")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId(VIP_MAIN_MOTIVO_ID)
      .setLabel("📌 Motivo")
      .setStyle(ButtonStyle.Secondary)
  );
}

function isVipMenuMessage(msg, client) {
  if (!msg || msg.author?.id !== client.user.id) return false;
  if (!msg.components?.length) return false;

  const ids = msg.components.flatMap((row) => row.components || []).map((c) => c.customId);
  return ids.some((id) => VIP_MAIN_REGISTER_IDS.has(id));
}

async function limparMenusAntigos(channel, keepNewest = false) {
  const msgs = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  if (!msgs) return;

  const menus = msgs.filter((m) => isVipMenuMessage(m, channel.client));

  const ordenadas = [...menus.values()].sort((a, b) => b.createdTimestamp - a.createdTimestamp);
  const paraDeletar = keepNewest ? ordenadas.slice(1) : ordenadas;

  for (const msg of paraDeletar) {
    await msg.delete().catch(() => {});
  }
}

async function createFreshMainMenu(channel) {
  if (ST.isMoving) return null;
  ST.isMoving = true;

  try {
    await limparMenusAntigos(channel, false);

    return await channel.send({
      embeds: [buildMainEmbed()],
      components: [createMainMenuRow()],
    }).catch(() => null);
  } finally {
    ST.isMoving = false;
  }
}

async function moveMainMenuToBottom(channel) {
  if (ST.isMoving) return;

  const msgs = await channel.messages.fetch({ limit: 5 }).catch(() => null);
  if (msgs) {
    const lastMsg = msgs.first();
    if (isVipMenuMessage(lastMsg, channel.client)) {
      await limparMenusAntigos(channel, true);
      return;
    }
  }

  await createFreshMainMenu(channel);
}

function moveMainMenuToBottomLater(client, delayMs = 1200) {
  setTimeout(async () => {
    try {
      const canal = await client.channels.fetch(VIP_CANAL_ID).catch(() => null);
      if (!ensureIsTextChannel(canal)) return;
      await moveMainMenuToBottom(canal);
    } catch {}
  }, delayMs);
}

// =============================
// BOTÕES DOS REGISTROS
// =============================
function createStatusRow(messageId, targetId, { disableSolicitado = false } = {}) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`vip_solicitado_${messageId}`).setLabel("📨 Já foi solicitado").setStyle(ButtonStyle.Secondary).setDisabled(disableSolicitado),
    new ButtonBuilder().setCustomId(`vip_recebeu_${messageId}_${targetId}`).setLabel("💸 Já foi pago").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`vip_negar_${messageId}_${targetId}`).setLabel("⛔ Reprovar pagamento").setStyle(ButtonStyle.Danger)
  );
}

// =============================
// FILTROS
// =============================
async function moverRegistrosPorFiltroVIP(channel, filtro) {
  const mensagens = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  if (!mensagens) return { movidos: 0 };

  const lista = [...mensagens.values()]
    .filter((m) => m.author?.id === channel.client.user.id && m.embeds?.length > 0)
    .filter((m) => {
      const ids = m.components?.flatMap((row) => row.components || []).map((c) => c.customId).filter(Boolean) || [];
      return ids.some((id) => id.startsWith("vip_solicitado_") || id.startsWith("vip_recebeu_") || id.startsWith("vip_negar_"));
    });

  let movidos = 0;
  for (const msg of lista) {
    const embedRaw = msg.embeds?.[0];
    if (!embedRaw) continue;
    const embedOriginal = EmbedBuilder.from(embedRaw);
    const statusValue = getStatusValueFromEmbed(embedOriginal);

    const ehSolicitado = /JÁ FOI SOLICITADO/i.test(statusValue);
    const ehAguardando = /Aguardando/i.test(statusValue) || (!ehSolicitado && !/RECEBIDO|REPROVADO/i.test(statusValue));

    if ((filtro === "solicitados" && ehSolicitado) || (filtro === "naoclicados" && ehAguardando)) {
      const targetId = extractTargetIdFromComponents(msg.components || []);
      const msgNova = await channel.send({ embeds: [embedOriginal] }).catch(() => null);
      if (msgNova) {
        await msgNova.edit({ components: [createStatusRow(msgNova.id, targetId, { disableSolicitado: ehSolicitado })] }).catch(() => {});
        await msg.delete().catch(() => {});
        movidos++;
      }
    }
  }
  return { movidos };
}

function atualizarCampoStatusVip(embedBuilder, novoTexto, cor) {
  const fields = Array.isArray(embedBuilder.data.fields) ? [...embedBuilder.data.fields] : [];
  const idx = fields.findIndex((f) => f.name === "📌 Status");
  const novo = { name: "📌 Status", value: novoTexto, inline: false };
  if (idx >= 0) fields[idx] = novo; else fields.push(novo);
  embedBuilder.setFields(fields);
  if (cor) embedBuilder.setColor(cor);
  return embedBuilder;
}

// =============================
// CRIAÇÃO DE REGISTRO
// =============================
async function createVipRecordInternal(client, {
  registrarUser, nomeEquipe, beneficiarioRaw, tipoRaw, cidadeRaw, motivoRegistro, isProgrammatic = false,
}) {
  const canal = await client.channels.fetch(VIP_CANAL_ID).catch(() => null);
  if (!ensureIsTextChannel(canal)) return null;

  const extractedId = extractId(beneficiarioRaw);
  if (!extractedId) return { error: "INVALID_DISCORD_ID" };

  let beneficiarioUser = null;
  try { beneficiarioUser = await client.users.fetch(extractedId); } catch {}

  const tipoNormalizado = vipNormalize(tipoRaw);
  const decor = tipoNormalizado ? vipDecor[tipoNormalizado] : vipDecor.CUSTOM;
  const cidadeNormalizada = normalizeCity(cidadeRaw);

  if (!cidadeNormalizada) return { error: "INVALID_CITY" };

  const fields = [
    { name: "👤 Beneficiário", value: `<@${extractedId}>\n\`${extractedId}\``, inline: true },
    { name: "🏷️ Nome | ID", value: nomeEquipe || "-", inline: true },
    { name: "🧾 Tipo", value: tipoNormalizado ? `**${decor.label}**` : `**${tipoRaw || "VIP EVENTO"}**`, inline: true },
    { name: `${cityDecor(cidadeNormalizada)} Cidade`, value: cidadeNormalizada, inline: true },
    { name: "✍️ Registrado por", value: registrarUser?.id ? `<@${registrarUser.id}>` : "`(sistema)`", inline: true },
    { name: "🕒 Data", value: `<t:${Math.floor(Date.now() / 1000)}:f>`, inline: true },
    { name: "📌 Status", value: "`Aguardando ação...`", inline: false },
  ];

  if (motivoRegistro) fields.splice(4, 0, { name: "📌 Motivo do registro", value: motivoRegistro, inline: false });

  const embed = new EmbedBuilder()
    .setColor(decor.color).setTitle(tipoNormalizado ? `${decor.emoji} ${decor.label} — 1 mês + Destaque` : `${decor.emoji} ${decor.label} — Premiação`)
    .setDescription(tipoNormalizado ? ["Registro de **premium** criado.", "Inclui: **1 mês** + **Destaque**."].join("\n") : ["Registro de **premium** criado.", "Premiação registrada pelo sistema."].join("\n"))
    .addFields(fields).setAuthor({ name: registrarUser?.tag ? `Registrado por ${registrarUser.tag}` : "Registro programático", iconURL: registrarUser?.displayAvatarURL?.() || null })
    .setThumbnail(beneficiarioUser?.displayAvatarURL?.({ size: 256 }) || registrarUser?.displayAvatarURL?.() || null)
    .setImage(VIP_GIF).setFooter({ text: isProgrammatic ? "SantaCreators – VIP / Premiação" : "SantaCreators – VIP / Rolepass" }).setTimestamp();

  const msg = await canal.send({ embeds: [embed] }).catch(() => null);
  if (!msg) return null;
  await msg.edit({ components: [createStatusRow(msg.id, extractedId)] }).catch(() => {});

  // ✅ ENVIO DA DM DE CRIAÇÃO
  const dmEmbed = buildVipDmEmbed({
    title: "💎 Você recebeu uma solicitação de VIP / Rolepass!",
    color: decor.color,
    tipo: tipoNormalizado ? decor.label : (tipoRaw || "VIP EVENTO"),
    cidade: cidadeNormalizada,
    motivo: motivoRegistro,
    autorLabel: "✍️ Registrado por",
    autorValue: registrarUser?.tag || "Sistema"
  });
  await safeSendVipDM(client, extractedId, { embeds: [dmEmbed] });

  try { dashEmit("vip:criado", { by: registrarUser?.id || "system", __at: Date.now(), targetId: extractedId, tipo: tipoRaw, cidade: cidadeNormalizada }); } catch {}
  return { message: msg };
}

// =============================
// EXPORTS CORE
// =============================
export async function createVipRecordProgrammatically(client, data = {}) {
  return await createVipRecordInternal(client, { ...data, isProgrammatic: true });
}

export async function vipRegistroOnReady(client) {
  const canal = await client.channels.fetch(VIP_CANAL_ID).catch(() => null);
  if (ensureIsTextChannel(canal)) await createFreshMainMenu(canal);
}

export async function vipRegistroHandleMessage(message, client) {
  if (!message.guild || message.author.bot) return false;
  if (message.content.toLowerCase() === "!vipmenu") {
    if (!hasVipAuth(message.member)) return message.reply("🚫 Sem permissão.").then(m => setTimeout(() => { m.delete().catch(() => {}); message.delete().catch(() => {}); }, 5000));
    const canal = await client.channels.fetch(VIP_CANAL_ID).catch(() => null);
    if (!ensureIsTextChannel(canal)) return message.reply("❌ Canal inválido.");
    await message.delete().catch(() => {});
    await createFreshMainMenu(canal);
    return true;
  }
  return false;
}

export async function vipRegistroHandleInteraction(interaction, client) {
  try {
    console.log("[VIP Registro DEBUG] interaction recebida:", {
      customId: interaction.customId,
      isButton: interaction.isButton?.(),
      isModalSubmit: interaction.isModalSubmit?.(),
      user: interaction.user?.id
    });

    if (!interaction.guild || !interaction.customId?.includes('vip_')) return false;
    if (VIP_hasHandled(interaction)) return true;

    const isAuth = hasVipAuth(interaction.member);
    if (interaction.isButton()) {
      const cid = interaction.customId;
      if (isVipMainRegisterId(cid)) {
        if (!isAuth) return interaction.reply({ content: "🚫 Sem permissão.", ephemeral: true }).catch(() => {});
        const modal = new ModalBuilder().setCustomId("vip_modal_submit").setTitle("💎 Registrar VIP / Rolepass").addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("vip_nome_id").setLabel("Nome | ID").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("Ex: Macedo | 1000")),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("vip_beneficiario_discord").setLabel("ID Discord do beneficiário").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("Ex: 660311795327828008")),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("vip_tipo").setLabel("Tipo (Ouro/Prata/Bronze/Rolepass)").setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("vip_cidade").setLabel("Cidade (Grande, Maresia, Santa, Nobre)").setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("vip_motivo_registro").setLabel("Motivo").setStyle(TextInputStyle.Paragraph).setRequired(false))
        );
        await interaction.showModal(modal).catch(() => {});
        moveMainMenuToBottomLater(client);
        return true;
      }
      if (isVipMainSolicitadosId(cid) || isVipMainNaoClicadosId(cid)) {
        if (!isAuth) return interaction.reply({ content: "🚫 Sem permissão.", ephemeral: true }).catch(() => {});
        if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ ephemeral: true }).catch(() => {});
        const canal = await client.channels.fetch(VIP_CANAL_ID).catch(() => null);
        const type = isVipMainSolicitadosId(cid) ? "solicitados" : "naoclicados";
        const { movidos } = await moverRegistrosPorFiltroVIP(canal, type);
        if (interaction.deferred || interaction.replied) await interaction.editReply(`✅ Filtro aplicado. Movidos: **${movidos}**`).catch(() => {});
        moveMainMenuToBottomLater(client);
        return true;
      }
      if (isVipMainMotivoId(cid)) {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor("#8e44ad").setTitle("📌 Objetivo").setDescription("Menu para organização de VIPs.")], ephemeral: true });
      }

      const legacy = parseVipLegacyAction(cid);
      if (legacy) {
        const canal = await client.channels.fetch(VIP_CANAL_ID).catch(() => null);
        const msg = await canal.messages.fetch(legacy.msgId).catch(() => null);
        if (!msg) return interaction.reply({ content: "❌ Não encontrado.", ephemeral: true }).catch(() => {});

        const targetId = legacy.targetId !== "none" ? legacy.targetId : extractTargetIdFromComponents(msg.components);

        if (legacy.action === "solicitado") {
          if (!isAuth) return interaction.reply({ content: "🚫 Sem permissão.", ephemeral: true }).catch(() => {});
          const emb = EmbedBuilder.from(msg.embeds[0]);
          atualizarCampoStatusVip(emb, `📨 **JÁ FOI SOLICITADO**\nPor <@${interaction.user.id}> em <t:${Math.floor(Date.now() / 1000)}:f>`, "#f1c40f");
          await msg.edit({ embeds: [emb], components: [createStatusRow(msg.id, targetId, { disableSolicitado: true })] });
          
          // DM Solicitado
          const dmEmbed = buildVipDmEmbed({
            title: "📨 Seu VIP / Rolepass foi marcado como solicitado!",
            color: "#f1c40f",
            tipo: getFieldValue(emb, "🧾 Tipo"),
            cidade: getFieldValue(emb, `${cityDecor(normalizeCity(getFieldValue(emb, " Cidade")))} Cidade`) || getFieldValue(emb, "🌆 Cidade"),
            motivo: getFieldValue(emb, "📌 Motivo do registro"),
            autorLabel: "📨 Solicitado por",
            autorValue: interaction.user.tag
          });
          await safeSendVipDM(client, targetId, { embeds: [dmEmbed] });

          return interaction.reply({ content: "📨 Marcado.", ephemeral: true }).catch(() => {});
        }
        if (legacy.action === "recebeu") {
          if (!isAuth && interaction.user.id !== targetId) return interaction.reply({ content: "🚫 Sem permissão.", ephemeral: true }).catch(() => {});
          const emb = EmbedBuilder.from(msg.embeds[0]);
          atualizarCampoStatusVip(emb, `✅ **PAGO / RECEBIDO**\nPor <@${interaction.user.id}> em <t:${Math.floor(Date.now() / 1000)}:f>`, "Green");
          await msg.edit({ embeds: [emb], components: disableComponents(msg.components) });
          
          // DM Pago
          const dmEmbed = buildVipDmEmbed({
            title: "✅ Seu VIP / Rolepass foi marcado como pago/recebido!",
            color: "Green",
            tipo: getFieldValue(emb, "🧾 Tipo"),
            cidade: getFieldValue(emb, `${cityDecor(normalizeCity(getFieldValue(emb, " Cidade")))} Cidade`) || getFieldValue(emb, "🌆 Cidade"),
            motivo: getFieldValue(emb, "📌 Motivo do registro"),
            autorLabel: "✅ Confirmado por",
            autorValue: interaction.user.tag
          });
          await safeSendVipDM(client, targetId, { embeds: [dmEmbed] });

          dashEmit("vip:pago", { by: interaction.user.id, targetId: targetId });
          return interaction.reply({ content: "✅ Confirmado.", ephemeral: true }).catch(() => {});
        }
        if (legacy.action === "negar") {
          if (!isAuth) return interaction.reply({ content: "🚫 Sem permissão.", ephemeral: true }).catch(() => {});
          const modal = new ModalBuilder().setCustomId(`vip_modal_negar_${legacy.msgId}_${targetId}`).setTitle("❌ Reprovar").addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("vip_motivo_reprovacao").setLabel("Motivo").setStyle(TextInputStyle.Paragraph).setRequired(true))
          );
          return interaction.showModal(modal).catch(() => {});
        }
      }
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId === "vip_modal_submit") {
        await interaction.deferReply({ ephemeral: true }).catch(() => {});

        console.log("[VIP Registro DEBUG] submit modal VIP:", {
          nomeId: interaction.fields.getTextInputValue("vip_nome_id"),
          beneficiarioDiscord: interaction.fields.getTextInputValue("vip_beneficiario_discord"),
          tipo: interaction.fields.getTextInputValue("vip_tipo"),
          cidade: interaction.fields.getTextInputValue("vip_cidade"),
          motivo: interaction.fields.getTextInputValue("vip_motivo_registro")
        });

        const res = await createVipRecordInternal(client, {
          registrarUser: interaction.user, 
          nomeEquipe: interaction.fields.getTextInputValue("vip_nome_id"),
          beneficiarioRaw: interaction.fields.getTextInputValue("vip_beneficiario_discord"), 
          tipoRaw: interaction.fields.getTextInputValue("vip_tipo"),
          cidadeRaw: interaction.fields.getTextInputValue("vip_cidade"), 
          motivoRegistro: interaction.fields.getTextInputValue("vip_motivo_registro")
        });

        if (res?.error === "INVALID_DISCORD_ID") {
          return interaction.editReply({ content: "❌ ID do Discord inválido. Envie o ID numérico ou mencione o usuário." }).catch(() => {});
        }
        if (res?.error === "INVALID_CITY") {
          return interaction.editReply({ content: "❌ Cidade inválida. Use: Grande, Maresia, Santa ou Nobre." }).catch(() => {});
        }

        const canal = await client.channels.fetch(VIP_CANAL_ID).catch(() => null);
        if (canal) await moveMainMenuToBottom(canal);
        return interaction.editReply({ content: "✅ Registro criado!" }).catch(() => {});
      }
      if (interaction.customId.startsWith("vip_modal_negar_")) {
        await interaction.deferReply({ ephemeral: true }).catch(() => {});

        const [, , , msgId, targetId] = interaction.customId.split("_");
        const motivo = interaction.fields.getTextInputValue("vip_motivo_reprovacao");
        const canal = await client.channels.fetch(VIP_CANAL_ID).catch(() => null);
        const msg = await canal.messages.fetch(msgId).catch(() => null);

        if (!msg) return interaction.editReply({ content: "❌ Registro original não encontrado." }).catch(() => {});

        const emb = EmbedBuilder.from(msg.embeds[0]);
        atualizarCampoStatusVip(emb, `❌ **REPROVADO**\nPor <@${interaction.user.id}>\nMotivo: ${motivo}`, "Red");
        await msg.edit({ embeds: [emb], components: disableComponents(msg.components) });
        
        // DM Reprovado
        const dmEmbed = buildVipDmEmbed({
          title: "❌ Seu VIP / Rolepass foi reprovado.",
          color: "Red",
          tipo: getFieldValue(emb, "🧾 Tipo"),
          cidade: getFieldValue(emb, `${cityDecor(normalizeCity(getFieldValue(emb, " Cidade")))} Cidade`) || getFieldValue(emb, "🌆 Cidade"),
          motivo: motivo,
          autorLabel: "❌ Reprovado por",
          autorValue: interaction.user.tag
        });
        await safeSendVipDM(client, targetId, { embeds: [dmEmbed] });

        const reprovaCh = await client.channels.fetch(VIP_REPROVA_CANAL_ID).catch(() => null);
        if (reprovaCh) reprovaCh.send({ embeds: [new EmbedBuilder().setColor("Red").setTitle("❌ VIP Reprovado").setDescription(`Beneficiário: <@${targetId}>\nMotivo: ${motivo}\nPor: ${interaction.user.tag}`)] });
        return interaction.editReply({ content: "❌ Reprovado com sucesso." }).catch(() => {});
      }
    }
  } catch (e) { console.error("[VIP Registro] Erro:", e); }
}

function buildMainEmbed() {
  return new EmbedBuilder()
    .setColor("#8e44ad").setTitle("💜 Registro Mensal + Destaque")
    .setDescription(["Use os botões para **registrar** ou **organizar a fila**.", "", "📝 **Informações:**", "• Nome | ID", "• ID Discord do beneficiário", "• Tipo (Ouro/Prata/Bronze/Rolepass)", "• **Cidade**", "• **Motivo**", "", "🔎 **Filtros:**", "• **Solicitados**", "• **Não clicados**"].join("\n"))
    .setImage(VIP_GIF).setFooter({ text: "SantaCreators – Sistema Oficial" });
}
