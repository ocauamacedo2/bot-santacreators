// /application/events/vipRegistro.js
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

// Guard to prevent multiple initializations
if (globalThis.__VIP_REGISTRO_LOADED__) {
  // já carregado
}
globalThis.__VIP_REGISTRO_LOADED__ = true;

// ====== CONFIG ======
const VIP_CANAL_ID = "1411814379162308688";
const VIP_MAIN_BUTTON_ID = "vip_registrar_btn";
const VIP_GIF =
  "https://media.discordapp.net/attachments/1362477839944777889/1384245215249825832/standard_2rss.gif?ex=68b5ec51&is=68b49ad1&hm=f194706bc612abcd8cbbbf6d62d2c393d49339bfea8714ceab371a0a4c95a670&=";

// canal onde cai a reprovação
const VIP_REPROVA_CANAL_ID = "1411819432862285854";

// Quem PODE registrar (abrir modal) OU operar nos botões dos registros:
const VIP_AUTH = new Set([
  "1262262852949905408", // owner
  "1352408327983861844", // resp creator
  "1262262852949905409", // resp influ
  "1352407252216184833", // resp lider
  "660311795327828008", // eu
]);

let ultimaMsgBotao = null;

// ====== HELPERS ======
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
  if (/(ouro)/.test(s)) return "OURO";
  if (/(prata)/.test(s)) return "PRATA";
  if (/(bronze)/.test(s)) return "BRONZE";
  if (/(rolepass|role pass|pass)/.test(s)) return "ROLEPASS";
  return null;
}

const vipDecor = {
  OURO: { label: "VIP OURO", emoji: "🥇", color: "#f1c40f" },
  PRATA: { label: "VIP PRATA", emoji: "🥈", color: "#bdc3c7" },
  BRONZE: { label: "VIP BRONZE", emoji: "🥉", color: "#cd7f32" },
  ROLEPASS: { label: "ROLEPASS", emoji: "🎟️", color: "#9b59b6" },
  CUSTOM: { label: "VIP EVENTO", emoji: "💎", color: "#8e44ad" },
};

// ====== HELPERS VISUAIS ======
function buildMainButton() {
  return new ButtonBuilder()
    .setCustomId(VIP_MAIN_BUTTON_ID)
    .setLabel("💎 Registrar VIP / Rolepass")
    .setStyle(ButtonStyle.Primary);
}

function buildMainEmbed() {
  return new EmbedBuilder()
    .setColor("#8e44ad")
    .setTitle("💜 Registro de VIP Mensal + Destaque")
    .setDescription(
      [
        "Use o botão abaixo para **registrar**:",
        "• **VIP Ouro / VIP Prata / VIP Bronze / Rolepass**",
        "• **Duração:** 1 mês **+ Destaque**",
        "",
        "📝 **O que você vai informar:**",
        "• Nome do membro da equipe",
        "• **ID do Discord do beneficiário** (será mencionado)",
        "• Qual VIP? *(Ouro/Prata/Bronze/Rolepass)*",
      ].join("\n")
    )
    .setImage(VIP_GIF)
    .setFooter({ text: "SantaCreators – Sistema Oficial de Premium" });
}

async function ensureMainButton(channel) {
  const msgs = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  if (!msgs) return null;

  const minhasComBotao = msgs.filter(
    (m) =>
      m.author?.id === channel.client.user.id &&
      m.components?.[0]?.components?.[0]?.customId === VIP_MAIN_BUTTON_ID
  );

  if (minhasComBotao.size > 0) {
    const ordered = [...minhasComBotao.values()].sort(
      (a, b) => b.createdTimestamp - a.createdTimestamp
    );
    const keep = ordered[0];
    ultimaMsgBotao = keep.id;

    for (let i = 1; i < ordered.length; i++) {
      ordered[i].delete().catch(() => {});
    }

    return keep;
  }

  const row = new ActionRowBuilder().addComponents(buildMainButton());
  const embed = buildMainEmbed();
  const sent = await channel
    .send({ embeds: [embed], components: [row] })
    .catch(() => null);

  if (sent) ultimaMsgBotao = sent.id;
  return sent;
}

async function createFreshMainButton(channel) {
  const msgs = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  if (msgs) {
    const minhas = msgs.filter(
      (m) =>
        m.author?.id === channel.client.user.id &&
        m.components?.[0]?.components?.[0]?.customId === VIP_MAIN_BUTTON_ID
    );

    for (const m of minhas.values()) {
      await m.delete().catch(() => {});
    }
  }

  const row = new ActionRowBuilder().addComponents(buildMainButton());
  const embed = buildMainEmbed();
  const sent = await channel
    .send({ embeds: [embed], components: [row] })
    .catch(() => null);

  if (sent) ultimaMsgBotao = sent.id;
  return sent;
}

function createStatusRow(messageId, targetId) {
  const btnSolic = new ButtonBuilder()
    .setCustomId(`vip_solicitado_${messageId}`)
    .setLabel("📨 Já foi solicitado")
    .setStyle(ButtonStyle.Secondary);

  const btnRecebeu = new ButtonBuilder()
    .setCustomId(`vip_recebeu_${messageId}_${targetId}`)
    .setLabel("✅ Já recebeu")
    .setStyle(ButtonStyle.Success);

  const btnNegar = new ButtonBuilder()
    .setCustomId(`vip_negar_${messageId}_${targetId}`)
    .setLabel("❌ Negar")
    .setStyle(ButtonStyle.Danger);

  return new ActionRowBuilder().addComponents(btnSolic, btnRecebeu, btnNegar);
}

function disableComponents(rows = []) {
  return rows.map((row) => {
    const r = ActionRowBuilder.from(row);
    r.components = r.components.map((c) =>
      ButtonBuilder.from(c).setDisabled(true)
    );
    return r;
  });
}

// ====== CRIAÇÃO DE REGISTRO ======
async function createVipRecordInternal(client, {
  registrarUser,
  nomeEquipe,
  beneficiarioRaw,
  tipoRaw,
  motivoRegistro,
  isProgrammatic = false,
}) {
  const canal = await client.channels.fetch(VIP_CANAL_ID).catch(() => null);
  if (!ensureIsTextChannel(canal)) {
    return null;
  }

  const extractedId = extractId(beneficiarioRaw);

  let beneficiarioUser = null;
  if (extractedId) {
    try {
      beneficiarioUser = await client.users.fetch(extractedId);
    } catch {}
  }

  const tipoNormalizado = vipNormalize(tipoRaw);
  const decor = tipoNormalizado ? vipDecor[tipoNormalizado] : vipDecor.CUSTOM;

  const beneficiarioMention = extractedId
    ? `<@${extractedId}>`
    : (beneficiarioRaw || "Não informado");

  const fields = [
    {
      name: "👤 Beneficiário",
      value: extractedId
        ? `${beneficiarioMention}\n\`${extractedId}\``
        : `${beneficiarioMention}`,
      inline: true,
    },
    {
      name: "🏷️ Nome (Equipe)",
      value: nomeEquipe || "-",
      inline: true,
    },
    {
      name: "🧾 Tipo",
      value: tipoNormalizado
        ? `**${decor.label}**`
        : `**${tipoRaw || "VIP EVENTO"}**`,
      inline: true,
    },
    {
      name: "✍️ Registrado por",
      value: registrarUser?.id
        ? `<@${registrarUser.id}>`
        : "`(não identificado)`",
      inline: true,
    },
    {
      name: "🕒 Data",
      value: `<t:${Math.floor(Date.now() / 1000)}:f>`,
      inline: true,
    },
  ];

  if (motivoRegistro) {
    fields.splice(3, 0, {
      name: "📌 Motivo do registro",
      value: motivoRegistro,
      inline: false,
    });
  }

  const embed = new EmbedBuilder()
    .setColor(decor.color)
    .setTitle(
      tipoNormalizado
        ? `${decor.emoji} ${decor.label} — 1 mês + Destaque`
        : `${decor.emoji} ${decor.label} — Premiação`
    )
    .setDescription(
      tipoNormalizado
        ? [
            "Registro de **premium** criado com sucesso.",
            "Inclui: **1 mês** + **Destaque**.",
          ].join("\n")
        : [
            "Registro de **premium** criado com sucesso.",
            "Premiação registrada pelo sistema.",
          ].join("\n")
    )
    .addFields(fields)
    .setAuthor({
      name: registrarUser?.tag
        ? `Registrado por ${registrarUser.tag}`
        : "Registro programático",
      iconURL: registrarUser?.displayAvatarURL?.({ dynamic: true }) || null,
    })
    .setThumbnail(
      beneficiarioUser?.displayAvatarURL?.({ dynamic: true, size: 256 }) ||
        registrarUser?.displayAvatarURL?.({ dynamic: true }) ||
        null
    )
    .setImage(VIP_GIF)
    .setFooter({
      text: isProgrammatic
        ? "SantaCreators – VIP / Premiação"
        : "SantaCreators – VIP / Rolepass",
    })
    .setTimestamp();

  const registroMsg = await canal.send({ embeds: [embed] }).catch(() => null);
  if (!registroMsg) return null;

  const targetId = extractedId || "none";
  const row = createStatusRow(registroMsg.id, targetId);
  await registroMsg.edit({ components: [row] }).catch(() => {});

  try {
    dashEmit("vip:criado", {
      by: registrarUser?.id || "system",
      __at: Date.now(),
      targetId: extractedId || null,
      tipo: tipoRaw || null,
    });
  } catch {}

  return registroMsg;
}

// ====== FUNÇÃO PROGRAMÁTICA (usada pela reunião semanal) ======
export async function createVipRecordProgrammatically(
  client,
  {
    registrarUser,
    beneficiarioRaw,
    tipoRaw,
    motivoRegistro,
    nomeEquipe,
  } = {}
) {
  return await createVipRecordInternal(client, {
    registrarUser,
    nomeEquipe,
    beneficiarioRaw,
    tipoRaw,
    motivoRegistro,
    isProgrammatic: true,
  });
}

// ====== READY ======
export async function vipRegistroOnReady(client) {
  if (globalThis.__VIP_REGISTRO_ON_READY_RAN__) return;
  globalThis.__VIP_REGISTRO_ON_READY_RAN__ = true;

  const canal = await client.channels.fetch(VIP_CANAL_ID).catch(() => null);
  if (!ensureIsTextChannel(canal)) {
    console.error("[VIP] Canal inválido:", VIP_CANAL_ID);
    return;
  }

  await createFreshMainButton(canal);
  setInterval(() => ensureMainButton(canal), 10_000);
}

// ====== INTERAÇÕES ======
export async function vipRegistroHandleInteraction(interaction, client) {
  try {
    // ---------- ABRIR MODAL ----------
    if (interaction.isButton() && interaction.customId === VIP_MAIN_BUTTON_ID) {
      const member = interaction.member;
      const isAuth = hasVipAuth(member);

      if (!isAuth) {
        await interaction.reply({
          content: "🚫 Você não tem permissão para registrar.",
          ephemeral: true,
        }).catch(() => {});
        return true;
      }

      const modal = new ModalBuilder()
        .setCustomId("vip_modal_submit")
        .setTitle("💎 Registrar VIP / Rolepass");

      const inputNome = new TextInputBuilder()
        .setCustomId("vip_nome_membro")
        .setLabel("Nome do membro da equipe")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Ex: Social M. | Maria")
        .setRequired(true);

      const inputIdDiscord = new TextInputBuilder()
        .setCustomId("vip_id_discord")
        .setLabel("ID do Discord do beneficiário (17-20 dígitos)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Ex: 123456789012345678")
        .setRequired(true);

      const inputVip = new TextInputBuilder()
        .setCustomId("vip_tipo")
        .setLabel("Qual VIP? (Ouro/Prata/Bronze/Rolepass)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Digite: Ouro, Prata, Bronze ou Rolepass")
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(inputNome),
        new ActionRowBuilder().addComponents(inputIdDiscord),
        new ActionRowBuilder().addComponents(inputVip)
      );

      try {
        await interaction.showModal(modal);
      } catch (err) {
        console.error("[VIP] showModal falhou:", err);
        if (!interaction.deferred && !interaction.replied) {
          await interaction.reply({
            content: "⚠️ Interação expirada. Clique no botão novamente.",
            ephemeral: true,
          }).catch(() => {});
        }
      }

      return true;
    }

    // ---------- SUBMIT DO MODAL (REGISTRO) ----------
    if (interaction.isModalSubmit() && interaction.customId === "vip_modal_submit") {
      const nome = interaction.fields.getTextInputValue("vip_nome_membro")?.trim();
      const idRaw = interaction.fields.getTextInputValue("vip_id_discord")?.trim();
      const tipoRaw = interaction.fields.getTextInputValue("vip_tipo")?.trim();

      if (!/^\d{17,20}$/.test(idRaw)) {
        await interaction.reply({
          content: "❌ ID de Discord inválido. Informe apenas números (17-20 dígitos).",
          ephemeral: true,
        }).catch(() => {});
        return true;
      }

      const tipo = vipNormalize(tipoRaw);
      if (!tipo) {
        await interaction.reply({
          content: "❌ Tipo inválido. Use: **Ouro**, **Prata**, **Bronze** ou **Rolepass**.",
          ephemeral: true,
        }).catch(() => {});
        return true;
      }

      const registroMsg = await createVipRecordInternal(client, {
        registrarUser: interaction.user,
        nomeEquipe: nome,
        beneficiarioRaw: idRaw,
        tipoRaw,
        motivoRegistro: null,
        isProgrammatic: false,
      });

      if (!registroMsg) {
        await interaction.reply({
          content: "❌ Canal de registro inválido.",
          ephemeral: true,
        }).catch(() => {});
        return true;
      }

      const canal = await client.channels.fetch(VIP_CANAL_ID).catch(() => null);
      if (ensureIsTextChannel(canal)) {
        await createFreshMainButton(canal);
      }

      await interaction.reply({
        content: `✅ Registro criado para <@${idRaw}> — **${vipDecor[tipo].label}**.`,
        ephemeral: true,
      }).catch(() => {});

      return true;
    }

    // ---------- BOTÕES DOS REGISTROS ----------
    if (
      interaction.isButton() &&
      interaction.customId.startsWith("vip_") &&
      interaction.customId !== VIP_MAIN_BUTTON_ID
    ) {
      const parts = interaction.customId.split("_");
      const action = parts[1];

      const isAuth = hasVipAuth(interaction.member);

      const canal = await client.channels.fetch(VIP_CANAL_ID).catch(() => null);
      if (!ensureIsTextChannel(canal)) return true;

      // ====== SOLICITADO ======
      if (action === "solicitado" && parts[2]) {
        const msgAlvo = await canal.messages.fetch(parts[2]).catch(() => null);
        if (!msgAlvo) {
          await interaction.reply({
            content: "❌ Registro não encontrado.",
            ephemeral: true,
          }).catch(() => {});
          return true;
        }

        if (!isAuth) {
          await interaction.reply({
            content: "🚫 Sem permissão para marcar solicitação.",
            ephemeral: true,
          }).catch(() => {});
          return true;
        }

        const emb = EmbedBuilder.from(msgAlvo.embeds[0] ?? new EmbedBuilder());
        emb.addFields({
          name: "📨 Solicitação",
          value: `Marcado por <@${interaction.user.id}> em <t:${Math.floor(Date.now() / 1000)}:f>`,
          inline: false,
        });

        await msgAlvo.edit({ embeds: [emb] }).catch(() => {});

        await interaction.reply({
          content: "📨 Marcado como **solicitado**.",
          ephemeral: true,
        }).catch(() => {});

        return true;
      }

      // ====== RECEBEU ======
      if (action === "recebeu" && parts[2] && parts[3]) {
        const msgId = parts[2];
        const targetId = parts[3];

        const msgAlvo = await canal.messages.fetch(msgId).catch(() => null);
        if (!msgAlvo) {
          await interaction.reply({
            content: "❌ Registro não encontrado.",
            ephemeral: true,
          }).catch(() => {});
          return true;
        }

        const allowedByTarget = interaction.user.id === targetId;
        if (!isAuth && !allowedByTarget) {
          await interaction.reply({
            content: "🚫 Somente o beneficiário ou os cargos autorizados podem marcar como **recebido**.",
            ephemeral: true,
          }).catch(() => {});
          return true;
        }

        const emb = EmbedBuilder.from(msgAlvo.embeds[0] ?? new EmbedBuilder());
        emb.addFields({
          name: "✅ Entrega",
          value: `Confirmado por <@${interaction.user.id}> em <t:${Math.floor(Date.now() / 1000)}:f>`,
          inline: false,
        });

        const comps = disableComponents(msgAlvo.components || []);
        await msgAlvo.edit({ embeds: [emb], components: comps }).catch(() => {});

        await interaction.reply({
          content: "✅ Marcado como **recebido**.",
          ephemeral: true,
        }).catch(() => {});

        return true;
      }

      // ====== NEGAR (abre modal) ======
      if (action === "negar" && parts[2] && parts[3]) {
        const msgId = parts[2];
        const targetId = parts[3];

        if (!isAuth) {
          await interaction.reply({
            content: "🚫 Apenas cargos autorizados podem **negar**.",
            ephemeral: true,
          }).catch(() => {});
          return true;
        }

        const modal = new ModalBuilder()
          .setCustomId(`vip_modal_negar_${msgId}_${targetId}`)
          .setTitle("❌ Negar / Reprovar pagamento");

        const inputMotivo = new TextInputBuilder()
          .setCustomId("vip_motivo_reprovacao")
          .setLabel("Motivo da reprovação (enviado em privado e no canal)")
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder("Explique resumidamente o porquê da reprovação.")
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(inputMotivo));

        try {
          await interaction.showModal(modal);
        } catch (err) {
          console.error("[VIP] showModal negar falhou:", err);
          if (!interaction.deferred && !interaction.replied) {
            await interaction.reply({
              content: "⚠️ Interação expirada. Clique novamente em **Negar**.",
              ephemeral: true,
            }).catch(() => {});
          }
        }

        return true;
      }
    }

    // ---------- SUBMIT DO MODAL (NEGAR) ----------
    if (
      interaction.isModalSubmit() &&
      interaction.customId.startsWith("vip_modal_negar_")
    ) {
      const parts = interaction.customId.split("_");
      const msgId = parts[3];
      const targetId = parts[4];

      const isAuth = hasVipAuth(interaction.member);
      if (!isAuth) {
        await interaction.reply({
          content: "🚫 Apenas cargos autorizados podem **negar**.",
          ephemeral: true,
        }).catch(() => {});
        return true;
      }

      const motivo = interaction.fields.getTextInputValue("vip_motivo_reprovacao")?.trim();
      if (!motivo) {
        await interaction.reply({
          content: "❌ Motivo inválido.",
          ephemeral: true,
        }).catch(() => {});
        return true;
      }

      const canal = await client.channels.fetch(VIP_CANAL_ID).catch(() => null);
      if (!ensureIsTextChannel(canal)) {
        await interaction.reply({
          content: "❌ Canal de registro inválido.",
          ephemeral: true,
        }).catch(() => {});
        return true;
      }

      const msgAlvo = await canal.messages.fetch(msgId).catch(() => null);
      if (!msgAlvo) {
        await interaction.reply({
          content: "❌ Registro não encontrado.",
          ephemeral: true,
        }).catch(() => {});
        return true;
      }

      const emb = EmbedBuilder.from(msgAlvo.embeds[0] ?? new EmbedBuilder());
      emb.addFields({
        name: "❌ Reprovado",
        value: `Por <@${interaction.user.id}> em <t:${Math.floor(Date.now() / 1000)}:f>\n**Motivo:** ${motivo}`,
        inline: false,
      });

      const comps = disableComponents(msgAlvo.components || []);
      await msgAlvo.edit({ embeds: [emb], components: comps }).catch(() => {});

      let dmOk = true;
      try {
        const user = await client.users.fetch(targetId);
        const dmEmbed = new EmbedBuilder()
          .setColor("#e74c3c")
          .setTitle("❌ Seu pagamento foi reprovado")
          .setDescription(
            [
              `**Motivo:** ${motivo}`,
              "",
              `[Abrir registro](${msgAlvo.url})`,
            ].join("\n")
          )
          .setAuthor({
            name: `Reprovado por ${interaction.user.tag}`,
            iconURL: interaction.user.displayAvatarURL({ dynamic: true }),
          })
          .addFields({
            name: "🕒 Hora",
            value: `<t:${Math.floor(Date.now() / 1000)}:f>`,
            inline: true,
          })
          .setFooter({ text: "SantaCreators – VIP / Rolepass" })
          .setTimestamp();

        await user.send({ embeds: [dmEmbed] });
      } catch {
        dmOk = false;
      }

      const reprovaCanal = await client.channels
        .fetch(VIP_REPROVA_CANAL_ID)
        .catch(() => null);

      if (ensureIsTextChannel(reprovaCanal)) {
        const logEmbed = new EmbedBuilder()
          .setColor("#e74c3c")
          .setTitle("❌ Pagamento reprovado")
          .setDescription(
            [
              `**Beneficiário:** <@${targetId}> \`(${targetId})\``,
              `**Motivo:** ${motivo}`,
              "",
              `[🔗 Abrir registro](${msgAlvo.url})`,
            ].join("\n")
          )
          .setAuthor({
            name: `${interaction.user.tag}`,
            iconURL: interaction.user.displayAvatarURL({ dynamic: true }),
          })
          .addFields({
            name: "🕒 Hora",
            value: `<t:${Math.floor(Date.now() / 1000)}:f>`,
            inline: true,
          })
          .setFooter({ text: "SantaCreators – VIP / Rolepass" })
          .setTimestamp();

        await reprovaCanal.send({ embeds: [logEmbed] }).catch(() => {});
      }

      const extra = dmOk
        ? ""
        : "\n⚠️ **Atenção:** Não foi possível enviar DM (usuário com DM fechado).";

      await interaction.reply({
        content: `❌ Registro **reprovado** e motivo enviado para o privado do beneficiário e para o canal <#${VIP_REPROVA_CANAL_ID}>.${extra}`,
        ephemeral: true,
      }).catch(() => {});

      return true;
    }

    return false;
  } catch (e) {
    console.error("[VIP] Erro em interação:", e);
    if (!interaction.replied && !interaction.deferred) {
      interaction.reply({
        content: "⚠️ Ocorreu um erro. Tente novamente.",
        ephemeral: true,
      }).catch(() => {});
    }
    return true;
  }
}

// ====== COMMAND HANDLER ======
export async function vipRegistroHandleMessage(message, client) {
  if (!message.guild || message.author.bot) return false;

  if (message.content.toLowerCase() === "!vipmenu") {
    const isAuth = hasVipAuth(message.member);

    if (!isAuth) {
      const reply = await message
        .reply("🚫 Você não tem permissão para usar este comando.")
        .catch(() => {});

      setTimeout(() => {
        message.delete().catch(() => {});
        if (reply) reply.delete().catch(() => {});
      }, 5000);

      return true;
    }

    await message.delete().catch(() => {});

    const canal = await client.channels.fetch(VIP_CANAL_ID).catch(() => null);
    if (!ensureIsTextChannel(canal)) {
      const reply = await message.channel
        .send("❌ Canal do sistema VIP não encontrado ou inválido.")
        .catch(() => {});

      if (reply) setTimeout(() => reply.delete().catch(() => {}), 8000);
      return true;
    }

    await createFreshMainButton(canal).catch(() => {});

    const reply = await message.channel
      .send("✅ Menu do sistema VIP recriado com sucesso!")
      .catch(() => {});

    if (reply) setTimeout(() => reply.delete().catch(() => {}), 8000);

    return true;
  }

  return false;
}