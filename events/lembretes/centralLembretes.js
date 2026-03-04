// /application/events/lembretes/centralLembretes.js
// SantaCreators • Central de Lembretes (Coordenação/Creator/Responsáveis)
// discord.js v14 (ESM)

import fs from "node:fs";
import path from "node:path";
import {
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionsBitField,
} from "discord.js";

export function startCentralLembretes(client) {
// Guard APENAS para o menu (não bloqueia listeners)
if (!globalThis.__sc_remind_menu_guard) {
  globalThis.__sc_remind_menu_guard = true;
}


  // ============== CONFIG ==============
  const MENU_CHANNEL_ID = "1423355603375357982"; // canal do menu
  const CATEGORY_ID = "1384650670145278033"; // categoria alvo
  const LOG_CHANNEL_ID = "1415102820826349648"; // log do envio
  const ACTION_LOG_CHANNEL_ID = "1460792683810394175"; // ✅ logs das LIMPEZAS

  // Papéis alvo (destinatários)
  const TARGET_ROLE_IDS = [
    "1352385500614234134", // Coordenação
    "1352429001188180039", // Equipe Creator
    "1414651836861907006", // Responsáveis
  ];

  // Quem pode abrir/enviar pelo menu
  const ALLOWED_SENDERS = [
    "1262262852949905408", // owner
    "660311795327828008", // você
    "1352408327983861844", // resp creator
    "1262262852949905409", // resp influ
    "1352407252216184833", // resp lider
    "1414651836861907006", // responsáveis
    "1352385500614234134", // coordenação
    "1387253972661964840", // equipe social mídias
    "1392678638176043029", // equipe manager
  ];

  // ✅ Quem pode clicar nos botões de LIMPEZA
  const CLEAN_ALLOWED = {
    userIds: [
      "1262262852949905408", // owner
      "660311795327828008", // você
    ],
    roleIds: [
      "1352408327983861844", // resp creator
      "1352407252216184833", // resp lider
      "1262262852949905409", // resp influ
      "1282119104576098314", // mkt ticket
    ],
  };

  // Ignorar esses canais da categoria (inclui o próprio menu)
  const EXCLUDED_CHANNELS = new Set([MENU_CHANNEL_ID]);

  const gif_sc =
    "https://media.discordapp.net/attachments/1362477839944777889/1384245215249825832/standard_2rss.gif?ex=68c1c9d1&is=68c07851&hm=29559421d654743e459eebb0713dfab747061713b412c75336b5f0540f225ab5&=";

  // ============== STORAGE (pra conseguir apagar depois) ==============
  const DATA_DIR = path.resolve("./application/events/lembretes/data");
  const DATA_FILE = path.join(DATA_DIR, "centralLembretesLastBatch.json");

  function ensureStore() {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      if (!fs.existsSync(DATA_FILE)) {
        fs.writeFileSync(DATA_FILE, JSON.stringify({ lastBatch: null, batches: {} }, null, 2), "utf8");
      }
    } catch {}
  }

  function readStore() {
    ensureStore();
    try {
      return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    } catch {
      return { lastBatch: null, batches: {} };
    }
  }

  function writeStore(data) {
    ensureStore();
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
    } catch {}
  }

  function newBatchId() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}_${pad(d.getUTCHours())}${pad(
      d.getUTCMinutes()
    )}${pad(d.getUTCSeconds())}`;
  }

 // ============== IDs únicos de componentes ==============
const BTN_OPEN_ID = "sc_remind_open_menu";
const MODAL_ID = "sc_remind_modal_send";
const IN_TITULO = "sc_remind_titulo";
const IN_DATA = "sc_remind_data";
const IN_BODY = "sc_remind_body";

// ✅ Botões de limpeza (menu)
const BTN_PREVIEW = "sc_remind_preview";
const BTN_CLEAN_DMS = "sc_remind_clean_dms";
const BTN_CLEAN_CHANNELS = "sc_remind_clean_channels";
const BTN_CLEAN_ALL = "sc_remind_clean_all";


  // ============== HELPERS ==============
  function truncate(str, max = 1000) {
    const s = String(str ?? "");
    return s.length > max ? s.slice(0, max - 1) + "…" : s;
  }

  function getMe(guild) {
    return guild.members.me || guild.members.cache.get(client.user?.id);
  }

  function isChannelTextSendable(ch) {
    if (!ch || typeof ch.send !== "function") return false;
    const me = ch.guild ? getMe(ch.guild) : null;
    if (!me) return false;
    const perms = ch.permissionsFor(me);
    return (
      perms?.has(PermissionsBitField.Flags.ViewChannel) &&
      perms?.has(PermissionsBitField.Flags.SendMessages)
    );
  }

  async function safeReply(interaction, data) {
    try {
      if (interaction.deferred || interaction.replied) return await interaction.followUp(data);
      return await interaction.reply(data);
    } catch {
      return null;
    }
  }

  async function fetchAllGuildMembers(guild) {
    try {
      await guild.members.fetch();
    } catch {}
  }

  function hasSenderPermission(interaction) {
    const uid = interaction.user.id;
    if (ALLOWED_SENDERS.includes(uid)) return true;
    return interaction.member?.roles?.cache?.some((r) => ALLOWED_SENDERS.includes(r.id)) ?? false;
  }

  function getCleanerGrant(interaction) {
    const uid = interaction.user.id;
    if (CLEAN_ALLOWED.userIds.includes(uid)) return { ok: true, via: "ID liberado" };

    const roles = interaction.member?.roles?.cache;
    if (roles) {
      const hit = roles.find((r) => CLEAN_ALLOWED.roleIds.includes(r.id));
      if (hit) return { ok: true, via: `<@&${hit.id}> (${hit.name})` };
    }
    return { ok: false, via: "sem permissão" };
  }

  function nowUnix() {
    return Math.floor(Date.now() / 1000);
  }

  async function sendActionLog(guild, embed) {
    try {
      const ch = await client.channels.fetch(ACTION_LOG_CHANNEL_ID).catch(() => null);
      if (ch && isChannelTextSendable(ch)) await ch.send({ embeds: [embed] }).catch(() => {});
    } catch {}
  }

  // Busca destinatários por canal:
  async function getTargetsForChannel(channel) {
    await fetchAllGuildMembers(channel.guild);
    const ownerId = channel.guild.ownerId;

    const mlist = channel.guild.members.cache.filter((m) => {
      if (m.id === ownerId) return false;
      const hasAnyTargetRole = TARGET_ROLE_IDS.some((rid) => m.roles.cache.has(rid));
      if (!hasAnyTargetRole) return false;
      return channel.permissionsFor(m)?.has(PermissionsBitField.Flags.ViewChannel);
    });

    return [...mlist.values()];
  }

  // Embeds/menu
  function buildMenuEmbed(guild) {
    return new EmbedBuilder()
      .setColor("#9b59b6")
      .setAuthor({
        name: "Central de Lembretes • SantaCreators",
        iconURL: guild?.iconURL({ dynamic: true }) ?? null,
      })
      .setTitle("📨 Central de Lembretes/Convites")
      .setDescription(
        [
          "Clique no botão **Roxo** para abrir o formulário e enviar um **lembrete/convite**.",
          "",
          "• **Destino:** todos os canais da **categoria alvo**.",
          "• **Marcação no canal:** marca **somente os cargos** alvo (sem pingar user por user).",
          "• **DM:** cada destinatário recebe **1 DM** com os canais onde foi entregue.",
          "",
          "🧹 **Limpeza (botões):**",
          "• **Limpar PVs** — apaga DMs do *último disparo*",
          "• **Limpar Canais** — apaga mensagens do bot nos canais do *último disparo*",
          "• **Limpar Geral** — faz as duas coisas",
        ].join("\n")
      )
      .setImage(gif_sc)
      .setFooter({ text: "SantaCreators – Sistema Oficial • Anti-duplicata • Último disparo salvo" });
  }

  function buildMenuRowPrimary() {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(BTN_OPEN_ID).setLabel("💜 Abrir formulário de lembrete").setStyle(ButtonStyle.Primary)
    );
  }

  const BTN_CLEAN_HISTORY = "sc_remind_clean_history";

function buildMenuRowCleanup() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(BTN_PREVIEW)
      .setLabel("📊 Preview do último disparo")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId(BTN_CLEAN_DMS)
      .setLabel("🧹 Limpar PVs (último)")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId(BTN_CLEAN_CHANNELS)
      .setLabel("🧹 Limpar Canais (último)")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId(BTN_CLEAN_ALL)
      .setLabel("🧨 Limpar Geral (último)")
      .setStyle(ButtonStyle.Danger),

    new ButtonBuilder()
      .setCustomId(BTN_CLEAN_HISTORY)
      .setLabel("💣 Limpar TUDO (histórico)")
      .setStyle(ButtonStyle.Danger)
  );
}



  function buildBaseEmbed({ titulo, data, conteudo }) {
    return new EmbedBuilder()
      .setColor("#9b59b6")
      .setTitle(`📌 ${truncate(titulo, 240)}`)
      .addFields({ name: "📅 Data", value: data || "—", inline: true })
      .setDescription(truncate(conteudo, 3900))
      .setImage(gif_sc)
      .setTimestamp()
      .setFooter({ text: "SantaCreators – Lembrete/Convite" });
  }

  function buildChannelEmbed(baseEmbed, featuredMember, fallbackIconURL) {
    const e = EmbedBuilder.from(baseEmbed);
    if (featuredMember) {
      const tag = featuredMember.user.tag ?? featuredMember.displayName;
      e.setAuthor({ name: `${tag}`, iconURL: featuredMember.user.displayAvatarURL({ dynamic: true }) });
    } else if (fallbackIconURL) {
      e.setAuthor({ name: "SantaCreators", iconURL: fallbackIconURL });
    }
    return e;
  }

  function buildDmEmbed(baseEmbed, member, channelsForThisMember) {
    const e = EmbedBuilder.from(baseEmbed);
    const tag = member.user.tag ?? member.displayName;
    e.setAuthor({ name: `${tag}`, iconURL: member.user.displayAvatarURL({ dynamic: true }) });

    if (channelsForThisMember?.length) {
      const chList = channelsForThisMember.map((ch) => `<#${ch.id}>`).join("  ");
      e.addFields({ name: "📌 Canais", value: truncate(chList, 1000), inline: false });
    }
    return e;
  }

  // Apaga menus antigos no canal e cria um novo (anti-duplicata)
  async function createFreshMenuMessage(channel) {
    const recent = await channel.messages.fetch({ limit: 50 }).catch(() => null);
    if (recent) {
      const oldMenus = recent.filter(
        (m) =>
          m.author.id === channel.client.user.id &&
          m.components?.[0]?.components?.[0]?.customId === BTN_OPEN_ID
      );

      for (const m of oldMenus.values()) {
        await m.delete().catch(() => {});
      }
    }

    const embed = buildMenuEmbed(channel.guild);
    const row1 = buildMenuRowPrimary();
    const row2 = buildMenuRowCleanup();
    return await channel.send({ embeds: [embed], components: [row1, row2] });
  }

  // =========================================================
  // READY (1x) + LATE-WIRE (se já estiver pronto, recria agora)
  // =========================================================
  client.once(Events.ClientReady, async () => {
    try {
      const menuChannel = await client.channels.fetch(MENU_CHANNEL_ID).catch(() => null);
      if (!menuChannel || !isChannelTextSendable(menuChannel)) return;
      await createFreshMenuMessage(menuChannel);
      console.log("✅ [SC-REMIND] Menu criado no ready.");
    } catch (e) {
      console.warn("⚠️ [SC-REMIND] Falha no ready:", e);
    }
  });

  // ✅ LATE-WIRE: se o bot já estiver READY, recria o menu AGORA (resolve teu “nn mudou”)
  (async () => {
    try {
      if (!client.isReady?.()) return;
      const menuChannel = await client.channels.fetch(MENU_CHANNEL_ID).catch(() => null);
      if (!menuChannel || !isChannelTextSendable(menuChannel)) return;
      await createFreshMenuMessage(menuChannel);
      console.log("✅ [SC-REMIND] Menu recriado (late-wire).");
    } catch (e) {
      console.warn("⚠️ [SC-REMIND] Falha no late-wire:", e);
    }
  })();

  
  // =========================================================
  // INTERACTIONS
  // =========================================================
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      // =========================
    // =========================
// =========================
// BOTÃO: PREVIEW LIMPEZA
// =========================
if (interaction.isButton() && interaction.customId === BTN_PREVIEW) {
  const store = readStore();
  const batchId = store?.lastBatch;
  const batch = batchId ? store?.batches?.[batchId] : null;

  if (!batch) {
    return safeReply(interaction, {
      content: "❌ Nenhum batch encontrado para preview.",
      ephemeral: true,
    });
  }

  const previewEmbed = new EmbedBuilder()
    .setColor("#3498db")
    .setTitle("📊 Preview — Limpeza do Último Disparo")
    .addFields(
      { name: "🧾 Batch", value: `\`${batchId}\`` },
      { name: "📡 Mensagens em canais", value: `${batch.channels?.length || 0}` },
      { name: "📬 Mensagens em PVs", value: `${batch.dms?.length || 0}` }
    );

  return interaction.reply({ embeds: [previewEmbed], ephemeral: true });
}


// =========================
// BOTÃO: LIMPAR TUDO (HISTÓRICO COMPLETO)
// =========================
if (interaction.isButton() && interaction.customId === BTN_CLEAN_HISTORY) {
  const grant = getCleanerGrant(interaction);
  if (!grant.ok) {
    return safeReply(interaction, {
      content: "🚫 Você não tem permissão pra usar essa limpeza.",
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: true });

  const store = readStore();
  const guild = interaction.guild;

  let totalChannelsOk = 0;
  let totalChannelsFail = 0;
  let totalDMsOk = 0;
  let totalDMsFail = 0;

  for (const batchId of Object.keys(store.batches || {})) {
    const batch = store.batches[batchId];

    for (const item of batch.channels || []) {
      try {
        const ch = await guild.channels.fetch(item.channelId);
        const msg = await ch.messages.fetch(item.messageId);
        if (msg.author.id === client.user.id) {
          await msg.delete();
          totalChannelsOk++;
        }
      } catch {
        totalChannelsFail++;
      }
    }

    for (const item of batch.dms || []) {
      try {
        const user = await client.users.fetch(item.userId);
        const dm = await user.createDM();
        const msg = await dm.messages.fetch(item.messageId);
        if (msg.author.id === client.user.id) {
          await msg.delete();
          totalDMsOk++;
        }
      } catch {
        totalDMsFail++;
      }
    }

    batch.cleanedAt = Date.now();
    batch.cleanedBy = interaction.user.id;
    batch.cleanAction = "HISTORY";
  }

  writeStore(store);

  await interaction.editReply({
    content:
      `💣 **LIMPEZA TOTAL EXECUTADA**\n` +
      `• Canais: ok **${totalChannelsOk}** | falhou **${totalChannelsFail}**\n` +
      `• PVs: ok **${totalDMsOk}** | falhou **${totalDMsFail}**`,
  });

  await sendActionLog(
    guild,
    new EmbedBuilder()
      .setColor("#c0392b")
      .setTitle("💣 Central Lembretes — Limpeza TOTAL")
      .setTimestamp()
  );

  return;
}


// =========================
// BOTÕES: LIMPEZA DO ÚLTIMO DISPARO
// =========================
if (interaction.isButton() &&
  (interaction.customId === BTN_CLEAN_DMS ||
    interaction.customId === BTN_CLEAN_CHANNELS ||
    interaction.customId === BTN_CLEAN_ALL)
) {
  const grant = getCleanerGrant(interaction);
  if (!grant.ok) {
    return safeReply(interaction, {
      content: "🚫 Você não tem permissão pra usar essa limpeza.",
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: true });

  const store = readStore();
  const guild = interaction.guild;
  const batchId = store?.lastBatch;
  const batch = batchId ? store?.batches?.[batchId] : null;

  if (!batch) {
    return interaction.editReply({
      content: "❌ Não encontrei o último disparo para limpar.",
    });
  }

  if (batch.cleanedAt) {
    const cleaner = batch.cleanedBy ? `<@${batch.cleanedBy}>` : "Alguém";
    return interaction.editReply({
      content: `⚠️ O batch \`${batchId}\` já foi limpo por ${cleaner}.`,
    });
  }

  const doDms =
    interaction.customId === BTN_CLEAN_DMS ||
    interaction.customId === BTN_CLEAN_ALL;
  const doChannels =
    interaction.customId === BTN_CLEAN_CHANNELS ||
    interaction.customId === BTN_CLEAN_ALL;

  let channelsOk = 0, channelsFail = 0;
  let dmsOk = 0, dmsFail = 0;

  if (doChannels) {
    for (const item of batch.channels || []) {
      try {
        const ch = await guild.channels.fetch(item.channelId);
        const msg = await ch.messages.fetch(item.messageId);
        if (msg.author.id === client.user.id) {
          await msg.delete();
          channelsOk++;
        }
      } catch {
        channelsFail++;
      }
    }
  }

  if (doDms) {
    for (const item of batch.dms || []) {
      try {
        const user = await client.users.fetch(item.userId);
        const dm = await user.createDM();
        const msg = await dm.messages.fetch(item.messageId);
        if (msg.author.id === client.user.id) {
          await msg.delete();
          dmsOk++;
        }
      } catch {
        dmsFail++;
      }
    }
  }

  batch.cleanedAt = Date.now();
  batch.cleanedBy = interaction.user.id;
  batch.cleanAction = interaction.customId;
  writeStore(store);

  const summary = [];
  if (doChannels) summary.push(`• Canais: ok **${channelsOk}** | falhou **${channelsFail}**`);
  if (doDms) summary.push(`• PVs: ok **${dmsOk}** | falhou **${dmsFail}**`);

  await interaction.editReply({
    content: `🧹 **Limpeza concluída (batch ${batchId})**\n${summary.join("\n")}`,
  });

  await sendActionLog(
    guild,
    new EmbedBuilder()
      .setColor("#e67e22")
      .setTitle("🧹 Central Lembretes — Limpeza de Batch")
      .setDescription(`Ação: **${interaction.customId}**`)
      .addFields(
        { name: "Executor", value: `${interaction.user}` },
        { name: "Batch ID", value: `\`${batchId}\`` },
        { name: "Resultado", value: summary.join("\n") || "Nenhuma ação executada." }
      )
      .setTimestamp()
  );

  return;
}


      // =========================
      // BOTÃO: ABRIR MODAL
      // =========================
      if (interaction.isButton() && interaction.customId === BTN_OPEN_ID) {
        if (!hasSenderPermission(interaction)) {
          return safeReply(interaction, { content: "🚫 Você não tem permissão para usar este menu.", ephemeral: true });
        }

        const modal = new ModalBuilder().setCustomId(MODAL_ID).setTitle("💜 Lembrete/Convite – SC");

        const inTitulo = new TextInputBuilder()
          .setCustomId(IN_TITULO)
          .setLabel("📝 Título")
          .setPlaceholder("Ex.: SantaCreators | Reunião de Alinhamento")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const inData = new TextInputBuilder()
          .setCustomId(IN_DATA)
          .setLabel("📅 Data")
          .setPlaceholder("Ex.: Hoje 19:30 / 03/10 às 21:00")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const inBody = new TextInputBuilder()
          .setCustomId(IN_BODY)
          .setLabel("✍️ Conteúdo (aceita emojis do Discord)")
          .setPlaceholder("Escreva o lembrete aqui... (pode usar <:emoji:id> ou 😊)")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder().addComponents(inTitulo),
          new ActionRowBuilder().addComponents(inData),
          new ActionRowBuilder().addComponents(inBody)
        );

        await interaction.showModal(modal);
        return;
      }

      // =========================
      // MODAL SUBMIT: ENVIAR
      // =========================
      if (interaction.isModalSubmit() && interaction.customId === MODAL_ID) {
        await interaction.deferReply({ ephemeral: true });

        if (!hasSenderPermission(interaction)) {
          return interaction.editReply({ content: "🚫 Você não tem permissão para enviar lembretes." });
        }

        const titulo = interaction.fields.getTextInputValue(IN_TITULO).trim();
        const dataTxt = interaction.fields.getTextInputValue(IN_DATA).trim();
        const conteudo = interaction.fields.getTextInputValue(IN_BODY).trim();

        const guild = interaction.guild;
        if (!guild) return interaction.editReply({ content: "❌ Use dentro do servidor." });

        const baseEmbed = buildBaseEmbed({ titulo, data: dataTxt, conteudo });

        // canais destino (categoria)
        const targetChannels = guild.channels.cache.filter(
          (ch) => ch?.parentId === CATEGORY_ID && !EXCLUDED_CHANNELS.has(ch.id) && isChannelTextSendable(ch)
        );

        // mapa DM: userId -> Set(channels)
        const perMemberChannels = new Map();
        const channelLinks = [];
        const recipientMentions = new Set();

        let channelsSent = 0;

        const batchId = newBatchId();
        const batch = { id: batchId, createdAt: Date.now(), createdBy: interaction.user.id, channels: [], dms: [] };

        // envio por canal
        for (const ch of targetChannels.values()) {
          try {
            const members = await getTargetsForChannel(ch);

            for (const m of members) {
              recipientMentions.add(`<@${m.id}>`);
              if (!perMemberChannels.has(m.id)) perMemberChannels.set(m.id, new Set());
              perMemberChannels.get(m.id).add(ch);
            }

            const featured = members[0] ?? null;
            const channelEmbed = buildChannelEmbed(baseEmbed, featured, guild.iconURL({ dynamic: true }));

            // ✅ marca SOMENTE cargos
            const roleMentions = TARGET_ROLE_IDS.map((rid) => `<@&${rid}>`).join(" ");

            const sentMsg = await ch.send({
  content: `👤 Enviado por ${interaction.user}\n${roleMentions}`,
  embeds: [channelEmbed],
  allowedMentions: {
    users: [interaction.user.id],
    roles: TARGET_ROLE_IDS,
    repliedUser: false,
  },
});


            batch.channels.push({ channelId: ch.id, messageId: sentMsg.id });

            channelsSent++;
            channelLinks.push(`<#${ch.id}>`);
          } catch (err) {
            console.error(`Falha ao enviar em #${ch?.name} (${ch?.id})`, err);
          }
        }

        // DMs únicas
        let dmsSent = 0;
        for (const [userId, setChannels] of perMemberChannels.entries()) {
          try {
            const member = await guild.members.fetch(userId).catch(() => null);
            if (!member) continue;

            const channelsArr = [...setChannels.values()];
            const dmEmbed = buildDmEmbed(baseEmbed, member, channelsArr);

            const dmMsg = await member.send({
  content: `👋 <@${userId}>\n👤 Enviado por ${interaction.user}`,
  embeds: [dmEmbed],
  allowedMentions: {
    users: [userId, interaction.user.id],
    repliedUser: false,
  },
});


            batch.dms.push({ userId, messageId: dmMsg.id });
            dmsSent++;
          } catch {}
        }

        // salva batch
        try {
          const store = readStore();
          store.lastBatch = batchId;
          store.batches ??= {};
          store.batches[batchId] = batch;
          writeStore(store);
        } catch {}

        // log envio
        try {
          const logCh = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
          if (logCh && isChannelTextSendable(logCh)) {
            const sender = interaction.user;
            const recipientsMentionsStr = [...recipientMentions].join(" ");
            const recipientsIdsStr = [...perMemberChannels.keys()].join(", ");
            const channelLinksStr = channelLinks.join("  ");

            const logEmbed = new EmbedBuilder()
              .setColor("#8e44ad")
              .setAuthor({ name: `${sender.tag} • Lembrete enviado`, iconURL: sender.displayAvatarURL({ dynamic: true }) })
              .setTitle("📣 Lembrete/Convite – Coordenação/Creator/Responsáveis")
              .addFields(
                { name: "👤 Enviado por", value: `${sender}\n\`ID:\` ${sender.id}`, inline: false },
                { name: "📝 Título", value: truncate(titulo, 256) || "—", inline: true },
                { name: "📅 Data", value: dataTxt || "—", inline: true },
                { name: "🧾 Conteúdo", value: truncate(conteudo, 1000) || "—", inline: false },
                { name: "📡 Canais entregues", value: `**${channelsSent}**\n${truncate(channelLinksStr, 1000) || "—"}`, inline: false },
                { name: "📬 DMs enviadas", value: `**${dmsSent}**`, inline: true },
                { name: "🧾 Batch (pra limpeza)", value: `\`${batchId}\``, inline: true },
                { name: "👥 Destinatários (menções)", value: truncate(recipientsMentionsStr, 1000) || "—", inline: false },
                { name: "🆔 Destinatários (IDs)", value: truncate(recipientsIdsStr, 1000) || "—", inline: false }
              )
              .setImage(gif_sc)
              .setTimestamp();

            await logCh.send({ embeds: [logEmbed] });
          }
        } catch (err) {
          console.error("[SC-REMIND] Falha ao enviar log:", err);
        }

        await interaction.editReply({
          content:
            `✅ Lembrete enviado!\n` +
            `• **Canais entregues:** ${channelsSent}\n` +
            `• **DMs enviadas:** ${dmsSent}\n` +
            `• **Batch:** \`${batchId}\`\n` +
            `(Nos canais: marca SOMENTE os cargos alvo.)`,
        });

        // recria menu
        try {
          const menuChannel = await client.channels.fetch(MENU_CHANNEL_ID).catch(() => null);
          if (menuChannel && isChannelTextSendable(menuChannel)) await createFreshMenuMessage(menuChannel);
        } catch {}

        return;
      }
    } catch (err) {
      console.error("[SC-REMIND] Erro geral InteractionCreate:", err);
      try {
        if (interaction.isRepliable?.()) {
          if (interaction.deferred) await interaction.editReply({ content: "❌ Ocorreu um erro ao executar essa ação." });
          else await safeReply(interaction, { content: "❌ Ocorreu um erro ao executar essa ação.", ephemeral: true });
        }
      } catch {}
    }
  });
}
