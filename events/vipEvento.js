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

// ============================================================================
// VIP REGISTRO
// - Menu fixo com 4 botões
// - Sempre mantém só 1 menu
// - Ao clicar em qualquer botão do menu, o menu vai pro final
// - Ao criar novo registro, o menu antigo é apagado e recriado no final
// - Agora pergunta a CIDADE no modal
// - Corrige o problema de "Cidade inválida ou não selecionada"
// ============================================================================

// Guard para evitar dupla carga
if (globalThis.__VIP_REGISTRO_LOADED__) {
  // já carregado
}
globalThis.__VIP_REGISTRO_LOADED__ = true;

// =============================
// CONFIG
// =============================
const VIP_CANAL_ID = "1411814379162308688";
const VIP_REPROVA_CANAL_ID = "1411819432862285854";

const VIP_MAIN_REGISTER_ID = "vip_menu_registrar";
const VIP_MAIN_FILTER_SOLIC_ID = "vip_menu_solicitados";
const VIP_MAIN_FILTER_NAOCLIC_ID = "vip_menu_naoclicados";
const VIP_MAIN_MOTIVO_ID = "vip_menu_motivo";

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
    case "Cidade Grande":
      return "🏙️";
    case "Cidade Maresia":
      return "🌊";
    case "Cidade Santa":
      return "⛪";
    case "Cidade Nobre":
      return "👑";
    default:
      return "📍";
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

function buildMainEmbed() {
  return new EmbedBuilder()
    .setColor("#8e44ad")
    .setTitle("💜 Registro Mensal + Destaque")
    .setDescription(
      [
        "Use os botões abaixo para **registrar** ou **organizar a fila**.",
        "",
        "📝 **O que você vai informar:**",
        "• Nome do membro da equipe",
        "• Beneficiário (**ID, @menção ou texto livre**)",
        "• Tipo (**Ouro / Prata / Bronze / Rolepass**)",
        "• **Cidade** do VIP",
        "• **Motivo do registro**",
        "",
        "🔎 **Filtros:**",
        "• **Solicitados** = já marcaram solicitação, mas ainda não recebeu e não foi reprovado",
        "• **Não clicados** = ninguém clicou em solicitado, não recebeu e não foi reprovado",
        "",
        "ℹ️ Use **📌 Motivo** pra ver o objetivo do menu/registro.",
      ].join("\n")
    )
    .setImage(VIP_GIF)
    .setFooter({ text: "SantaCreators – Sistema Oficial de Premium" });
}

async function limparMenusAntigos(channel) {
  const msgs = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  if (!msgs) return null;

  const menus = msgs.filter((m) => {
    const ehDoBot = m.author?.id === channel.client.user.id;
    const temEmbed = m.embeds?.length > 0;
    const titulo = m.embeds?.[0]?.title || "";
    const temComponents = m.components?.length > 0;

    if (!ehDoBot || !temEmbed || !temComponents) return false;
    if (!titulo.includes("Registro Mensal + Destaque")) return false;

    const ids = m.components
      ?.flatMap((row) => row.components || [])
      ?.map((c) => c.customId)
      ?.filter(Boolean) || [];

    return (
      ids.includes(VIP_MAIN_REGISTER_ID) &&
      ids.includes(VIP_MAIN_FILTER_SOLIC_ID) &&
      ids.includes(VIP_MAIN_FILTER_NAOCLIC_ID) &&
      ids.includes(VIP_MAIN_MOTIVO_ID)
    );
  });

  const ordenadas = [...menus.values()].sort(
    (a, b) => b.createdTimestamp - a.createdTimestamp
  );

  const paraDeletar = ordenadas.slice(1);

  for (const msg of paraDeletar) {
    await msg.delete().catch(() => {});
  }

  return ordenadas[0] || null;
}

async function createFreshMainMenu(channel) {
  const msgs = await channel.messages.fetch({ limit: 100 }).catch(() => null);

  if (msgs) {
    const menus = msgs.filter((m) => {
      const ehDoBot = m.author?.id === channel.client.user.id;
      const ids = m.components
        ?.flatMap((row) => row.components || [])
        ?.map((c) => c.customId)
        ?.filter(Boolean) || [];

      return (
        ehDoBot &&
        ids.includes(VIP_MAIN_REGISTER_ID) &&
        ids.includes(VIP_MAIN_FILTER_SOLIC_ID) &&
        ids.includes(VIP_MAIN_FILTER_NAOCLIC_ID) &&
        ids.includes(VIP_MAIN_MOTIVO_ID)
      );
    });

    for (const m of menus.values()) {
      await m.delete().catch(() => {});
    }
  }

  return await channel.send({
    embeds: [buildMainEmbed()],
    components: [createMainMenuRow()],
  }).catch(() => null);
}

async function moveMainMenuToBottom(channel) {
  await createFreshMainMenu(channel).catch(() => {});
}

// =============================
// BOTÕES DOS REGISTROS
// =============================
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

// =============================
// MOVER REGISTROS PELOS FILTROS
// =============================
async function moverRegistrosPorFiltroVIP(channel, filtro) {
  const mensagens = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  if (!mensagens) return { movidos: 0 };

  const lista = [...mensagens.values()]
    .filter((m) => m.author?.id === channel.client.user.id)
    .filter((m) => m.embeds?.length > 0)
    .filter((m) => {
      const titulo = m.embeds?.[0]?.title || "";
      return titulo.includes("VIP") || titulo.includes("ROLEPASS") || titulo.includes("Premiação");
    })
    .filter((m) => {
      const ids = m.components
        ?.flatMap((row) => row.components || [])
        ?.map((c) => c.customId)
        ?.filter(Boolean) || [];

      return ids.some((id) => id.startsWith("vip_solicitado_") || id.startsWith("vip_recebeu_") || id.startsWith("vip_negar_"));
    });

  let movidos = 0;

  for (const msg of lista) {
    const embedRaw = msg.embeds?.[0];
    if (!embedRaw) continue;

    const embedOriginal = EmbedBuilder.from(embedRaw);
    const statusValue = getStatusValueFromEmbed(embedOriginal);

    const ehSolicitado = /JÁ FOI SOLICITADO/i.test(statusValue);
    const ehAguardando =
      /Aguardando/i.test(statusValue) ||
      !/JÁ FOI SOLICITADO/i.test(statusValue) &&
      !/RECEBIDO/i.test(statusValue) &&
      !/REPROVADO/i.test(statusValue);

    const ehRecebeuFinal = /RECEBIDO/i.test(statusValue);
    const ehReprovadoFinal = /REPROVADO/i.test(statusValue);

    const entra =
      (filtro === "solicitados" && ehSolicitado) ||
      (filtro === "naoclicados" && ehAguardando);

    if (!entra) continue;

    const msgNova = await channel.send({ embeds: [embedOriginal] }).catch(() => null);
    if (!msgNova) continue;

    if (ehRecebeuFinal || ehReprovadoFinal) {
      await msgNova.edit({ components: [] }).catch(() => {});
    } else {
      const ids = msg.components
        ?.flatMap((row) => row.components || [])
        ?.map((c) => c.customId) || [];

      const btnRecebeu = ids.find((x) => x.startsWith("vip_recebeu_"));
      let targetId = "none";

      if (btnRecebeu) {
        const parts = btnRecebeu.split("_");
        targetId = parts[3] || "none";
      }

      await msgNova.edit({
        components: [createStatusRow(msgNova.id, targetId)],
      }).catch(() => {});
    }

    await msg.delete().catch(() => {});
    movidos++;
  }

  return { movidos };
}

// =============================
// ATUALIZA STATUS NO EMBED
// =============================
function atualizarCampoStatusVip(embedBuilder, novoTexto, cor) {
  const data = embedBuilder.data ?? {};
  const fields = Array.isArray(data.fields) ? [...data.fields] : [];

  const idx = fields.findIndex((f) => f.name === "📌 Status");
  const novo = { name: "📌 Status", value: novoTexto, inline: false };

  if (idx >= 0) fields[idx] = novo;
  else fields.push(novo);

  embedBuilder.setFields(fields);
  if (cor) embedBuilder.setColor(cor);

  return embedBuilder;
}

// =============================
// CRIAÇÃO DE REGISTRO
// =============================
async function createVipRecordInternal(client, {
  registrarUser,
  nomeEquipe,
  beneficiarioRaw,
  tipoRaw,
  cidadeRaw,
  motivoRegistro,
  isProgrammatic = false,
}) {
  const canal = await client.channels.fetch(VIP_CANAL_ID).catch(() => null);
  if (!ensureIsTextChannel(canal)) return null;

  const extractedId = extractId(beneficiarioRaw);

  let beneficiarioUser = null;
  if (extractedId) {
    try {
      beneficiarioUser = await client.users.fetch(extractedId);
    } catch {}
  }

  const tipoNormalizado = vipNormalize(tipoRaw);
  const decor = tipoNormalizado ? vipDecor[tipoNormalizado] : vipDecor.CUSTOM;

  const cidadeNormalizada = normalizeCity(cidadeRaw);
  if (!cidadeNormalizada) {
    return { error: "cidade_invalida" };
  }

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
      name: `${cityDecor(cidadeNormalizada)} Cidade`,
      value: cidadeNormalizada,
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
    {
      name: "📌 Status",
      value: "`Aguardando ação...`",
      inline: false,
    },
  ];

  if (motivoRegistro) {
    fields.splice(4, 0, {
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
  await registroMsg.edit({
    components: [createStatusRow(registroMsg.id, targetId)],
  }).catch(() => {});

  try {
    dashEmit("vip:criado", {
      by: registrarUser?.id || "system",
      __at: Date.now(),
      targetId: extractedId || null,
      tipo: tipoRaw || null,
      cidade: cidadeNormalizada,
    });
  } catch {}

  return { message: registroMsg };
}

// =============================
// FUNÇÃO PROGRAMÁTICA
// =============================
export async function createVipRecordProgrammatically(
  client,
  {
    registrarUser,
    beneficiarioRaw,
    tipoRaw,
    cidadeRaw,
    motivoRegistro,
    nomeEquipe,
  } = {}
) {
  return await createVipRecordInternal(client, {
    registrarUser,
    nomeEquipe,
    beneficiarioRaw,
    tipoRaw,
    cidadeRaw,
    motivoRegistro,
    isProgrammatic: true,
  });
}

// =============================
// READY
// =============================
export async function vipEventoOnReady(client) {
  if (globalThis.__VIP_REGISTRO_ON_READY_RAN__) return;
  globalThis.__VIP_REGISTRO_ON_READY_RAN__ = true;

  const canal = await client.channels.fetch(VIP_CANAL_ID).catch(() => null);
  if (!ensureIsTextChannel(canal)) {
    console.error("[VIP] Canal inválido:", VIP_CANAL_ID);
    return;
  }

  const existente = await limparMenusAntigos(canal).catch(() => null);
  if (existente) return;

  await canal.send({
    embeds: [buildMainEmbed()],
    components: [createMainMenuRow()],
  }).catch(() => {});
}

// =============================
// INTERAÇÕES
// =============================
export async function vipEventoHandleInteraction(interaction, client) {
  try {
    // ==========================================================
    // BOTÕES DO MENU
    // ==========================================================
    if (interaction.isButton()) {
      const customId = interaction.customId;
      const isAuth = hasVipAuth(interaction.member);

      // ---------- REGISTRAR ----------
      if (customId === VIP_MAIN_REGISTER_ID) {
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

        const inputBeneficiario = new TextInputBuilder()
          .setCustomId("vip_beneficiario")
          .setLabel("Beneficiário (ID, @menção ou texto)")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("Ex: 123456789012345678 ou @Fulano")
          .setRequired(true);

        const inputVip = new TextInputBuilder()
          .setCustomId("vip_tipo")
          .setLabel("Qual VIP? (Ouro/Prata/Bronze/Rolepass)")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("Digite: Ouro, Prata, Bronze ou Rolepass")
          .setRequired(true);

        const inputCidade = new TextInputBuilder()
          .setCustomId("vip_cidade")
          .setLabel("Qual cidade? (Grande, Maresia, Santa, Nobre)")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("Ex: Grande")
          .setRequired(true);

        const inputMotivo = new TextInputBuilder()
          .setCustomId("vip_motivo_registro")
          .setLabel("Motivo do registro")
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder("Ex: Creator Destaque, Premiação semanal...")
          .setRequired(false);

        modal.addComponents(
          new ActionRowBuilder().addComponents(inputNome),
          new ActionRowBuilder().addComponents(inputBeneficiario),
          new ActionRowBuilder().addComponents(inputVip),
          new ActionRowBuilder().addComponents(inputCidade),
          new ActionRowBuilder().addComponents(inputMotivo)
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

        // joga o menu lá pra baixo toda vez que clicarem no botão do menu
        const canal = await client.channels.fetch(VIP_CANAL_ID).catch(() => null);
        if (ensureIsTextChannel(canal)) {
          await moveMainMenuToBottom(canal);
        }

        return true;
      }

      // ---------- FILTRO SOLICITADOS ----------
      if (customId === VIP_MAIN_FILTER_SOLIC_ID) {
        if (!isAuth) {
          await interaction.reply({
            content: "🚫 Você não tem permissão para usar esse filtro.",
            ephemeral: true,
          }).catch(() => {});
          return true;
        }

        await interaction.deferReply({ ephemeral: true }).catch(() => {});

        const canal = await client.channels.fetch(VIP_CANAL_ID).catch(() => null);
        if (!ensureIsTextChannel(canal)) {
          await interaction.followUp({
            content: "❌ Canal VIP inválido.",
            ephemeral: true,
          }).catch(() => {});
          return true;
        }

        const { movidos } = await moverRegistrosPorFiltroVIP(canal, "solicitados");
        await moveMainMenuToBottom(canal);

        await interaction.followUp({
          content: `✅ Filtro aplicado: **Solicitados**\n📦 Registros movidos: **${movidos}**`,
          ephemeral: true,
        }).catch(() => {});

        return true;
      }

      // ---------- FILTRO NÃO CLICADOS ----------
      if (customId === VIP_MAIN_FILTER_NAOCLIC_ID) {
        if (!isAuth) {
          await interaction.reply({
            content: "🚫 Você não tem permissão para usar esse filtro.",
            ephemeral: true,
          }).catch(() => {});
          return true;
        }

        await interaction.deferReply({ ephemeral: true }).catch(() => {});

        const canal = await client.channels.fetch(VIP_CANAL_ID).catch(() => null);
        if (!ensureIsTextChannel(canal)) {
          await interaction.followUp({
            content: "❌ Canal VIP inválido.",
            ephemeral: true,
          }).catch(() => {});
          return true;
        }

        const { movidos } = await moverRegistrosPorFiltroVIP(canal, "naoclicados");
        await moveMainMenuToBottom(canal);

        await interaction.followUp({
          content: `✅ Filtro aplicado: **Não clicados**\n📦 Registros movidos: **${movidos}**`,
          ephemeral: true,
        }).catch(() => {});

        return true;
      }

      // ---------- MOTIVO ----------
      if (customId === VIP_MAIN_MOTIVO_ID) {
        if (!isAuth) {
          await interaction.reply({
            content: "🚫 Você não tem permissão para usar esse botão.",
            ephemeral: true,
          }).catch(() => {});
          return true;
        }

        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("#8e44ad")
              .setTitle("📌 Objetivo do menu VIP")
              .setDescription(
                [
                  "Esse menu serve para registrar e organizar:",
                  "• VIP Ouro",
                  "• VIP Prata",
                  "• VIP Bronze",
                  "• Rolepass",
                  "",
                  "Também permite acompanhar:",
                  "• Quem já teve **solicitação marcada**",
                  "• Quem ainda está **sem clique/sem andamento**",
                  "• O **motivo** de cada registro",
                ].join("\n")
              )
              .setFooter({ text: "SantaCreators – VIP / Rolepass" }),
          ],
          ephemeral: true,
        }).catch(() => {});

        const canal = await client.channels.fetch(VIP_CANAL_ID).catch(() => null);
        if (ensureIsTextChannel(canal)) {
          await moveMainMenuToBottom(canal);
        }

        return true;
      }
    }

    // ==========================================================
    // SUBMIT DO MODAL DE REGISTRO
    // ==========================================================
    if (interaction.isModalSubmit() && interaction.customId === "vip_modal_submit") {
      const nome = interaction.fields.getTextInputValue("vip_nome_membro")?.trim();
      const beneficiarioRaw = interaction.fields.getTextInputValue("vip_beneficiario")?.trim();
      const tipoRaw = interaction.fields.getTextInputValue("vip_tipo")?.trim();
      const cidadeRaw = interaction.fields.getTextInputValue("vip_cidade")?.trim();
      const motivoRegistro = interaction.fields.getTextInputValue("vip_motivo_registro")?.trim();

      const tipo = vipNormalize(tipoRaw);
      if (!tipo) {
        await interaction.reply({
          content: "❌ Tipo inválido. Use: **Ouro**, **Prata**, **Bronze** ou **Rolepass**.",
          ephemeral: true,
        }).catch(() => {});
        return true;
      }

      const cidade = normalizeCity(cidadeRaw);
      if (!cidade) {
        await interaction.reply({
          content: "❌ Cidade inválida ou não selecionada. Use: **Grande**, **Maresia**, **Santa** ou **Nobre**.",
          ephemeral: true,
        }).catch(() => {});
        return true;
      }

      const result = await createVipRecordInternal(client, {
        registrarUser: interaction.user,
        nomeEquipe: nome,
        beneficiarioRaw,
        tipoRaw,
        cidadeRaw,
        motivoRegistro,
        isProgrammatic: false,
      });

      if (!result) {
        await interaction.reply({
          content: "❌ Canal de registro inválido.",
          ephemeral: true,
        }).catch(() => {});
        return true;
      }

      if (result?.error === "cidade_invalida") {
        await interaction.reply({
          content: "❌ Cidade inválida ou não selecionada. Use: **Grande**, **Maresia**, **Santa** ou **Nobre**.",
          ephemeral: true,
        }).catch(() => {});
        return true;
      }

      const canal = await client.channels.fetch(VIP_CANAL_ID).catch(() => null);
      if (ensureIsTextChannel(canal)) {
        await moveMainMenuToBottom(canal);
      }

      const maybeId = extractId(beneficiarioRaw);
      const mention = maybeId ? `<@${maybeId}>` : `\`${beneficiarioRaw}\``;

      await interaction.reply({
        content: `✅ Registro criado para ${mention} — **${vipDecor[tipo].label}** — **${cidade}**.`,
        ephemeral: true,
      }).catch(() => {});

      return true;
    }

    // ==========================================================
    // BOTÕES DOS REGISTROS
    // ==========================================================
    if (
      interaction.isButton() &&
      interaction.customId.startsWith("vip_") &&
      ![
        VIP_MAIN_REGISTER_ID,
        VIP_MAIN_FILTER_SOLIC_ID,
        VIP_MAIN_FILTER_NAOCLIC_ID,
        VIP_MAIN_MOTIVO_ID,
      ].includes(interaction.customId)
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
        atualizarCampoStatusVip(
          emb,
          `📨 **JÁ FOI SOLICITADO**\nMarcado por <@${interaction.user.id}> em <t:${Math.floor(Date.now() / 1000)}:f>`,
          "#f1c40f"
        );

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
        atualizarCampoStatusVip(
          emb,
          `✅ **RECEBIDO**\nConfirmado por <@${interaction.user.id}> em <t:${Math.floor(Date.now() / 1000)}:f>`,
          "Green"
        );

        const comps = disableComponents(msgAlvo.components || []);
        await msgAlvo.edit({ embeds: [emb], components: comps }).catch(() => {});

        await interaction.reply({
          content: "✅ Marcado como **recebido**.",
          ephemeral: true,
        }).catch(() => {});

        try {
          dashEmit("vip:pago", {
            by: interaction.user.id,
            __at: Date.now(),
            targetId: targetId !== "none" ? targetId : null,
            sourceMessageId: msgId,
          });
        } catch {}

        return true;
      }

      // ====== NEGAR ======
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
          .setLabel("Motivo da reprovação")
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

    // ==========================================================
    // SUBMIT DO MODAL DE NEGAR
    // ==========================================================
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
      atualizarCampoStatusVip(
        emb,
        `❌ **REPROVADO**\nPor <@${interaction.user.id}> em <t:${Math.floor(Date.now() / 1000)}:f>\n**Motivo:** ${motivo}`,
        "Red"
      );

      const comps = disableComponents(msgAlvo.components || []);
      await msgAlvo.edit({ embeds: [emb], components: comps }).catch(() => {});

      let dmOk = true;
      try {
        if (targetId !== "none") {
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
        }
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
              `**Beneficiário:** ${targetId !== "none" ? `<@${targetId}> \`(${targetId})\`` : "`Não identificado`"}`,
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
        : "\n⚠️ Não foi possível enviar DM.";

      await interaction.reply({
        content: `❌ Registro **reprovado**.${extra}`,
        ephemeral: true,
      }).catch(() => {});

      return true;
    }

    return false;
  } catch (e) {
    console.error("[VIP] Erro em interação:", e);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "⚠️ Ocorreu um erro. Tente novamente.",
        ephemeral: true,
      }).catch(() => {});
    }
    return true;
  }
}

// =============================
// COMMAND HANDLER
// =============================
export async function vipEventoHandleMessage(message, client) {
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

      if (reply) {
        setTimeout(() => reply.delete().catch(() => {}), 8000);
      }
      return true;
    }

    await createFreshMainMenu(canal).catch(() => {});

    const reply = await message.channel
      .send("✅ Menu do sistema VIP recriado com sucesso!")
      .catch(() => {});

    if (reply) {
      setTimeout(() => reply.delete().catch(() => {}), 8000);
    }

    return true;
  }

  return false;
}