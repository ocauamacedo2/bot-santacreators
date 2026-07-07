import {
  ChannelType,
  PermissionsBitField,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  OverwriteType,
} from "discord.js";

const LOG_RECRIAR_CHANNEL_ID = "1523901588828192798";
const TRANSCRIPTS_BASE_URL = "https://transcripts-santa.squareweb.app/transcript/";

const RECRIA_PERMS = [
  PermissionsBitField.Flags.ManageChannels,
  PermissionsBitField.Flags.ViewChannel,
  PermissionsBitField.Flags.SendMessages,
  PermissionsBitField.Flags.ReadMessageHistory,
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAdminAutorizado(message) {
  return message.member?.permissions?.has(PermissionsBitField.Flags.ManageChannels);
}

function getTicketTipo(channel) {
  const topic = channel.topic || "";
  const match = topic.match(/ticket_tipo:([^;]+)/i);
  if (match?.[1]) return match[1];

  const name = channel.name.toLowerCase();

  if (name.includes("entrevista")) return "entrevista";
  if (name.includes("suporte")) return "suporte";
  if (name.includes("lider")) return "lider";
  if (name.includes("ideia")) return "ideias";
  if (name.includes("roupa")) return "roupas";
  if (name.includes("banner")) return "designer";

  return "suporte";
}

function getOpenerId(channel) {
  const topic = channel.topic || "";
  const topicMatch = topic.match(/aberto_por:(\d{17,20})/i);
  if (topicMatch?.[1]) return topicMatch[1];

  const memberOverwrite = channel.permissionOverwrites.cache.find((ow) => {
    return (
      ow.type === OverwriteType.Member &&
      ow.allow.has(PermissionsBitField.Flags.ViewChannel)
    );
  });

  return memberOverwrite?.id || null;
}

function buildTicketButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("assumir_ticket")
      .setLabel("🎫 Assumir Ticket")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId("assumir_resp")
      .setLabel("👑 Assumir Resp")
      .setStyle(ButtonStyle.Danger),

    new ButtonBuilder()
      .setCustomId("fechar_ticket")
      .setLabel("❌ Fechar Ticket")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId("adicionar_membro")
      .setLabel("➕ Adicionar Usuário")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId("remover_membro")
      .setLabel("➖ Remover Usuário")
      .setStyle(ButtonStyle.Danger)
  );
}

async function fetchTranscriptMessages(channel) {
  const collected = [];
  let before;

  while (collected.length < 300) {
    const batch = await channel.messages.fetch({
      limit: 100,
      before,
    }).catch(() => null);

    if (!batch || batch.size === 0) break;

    collected.push(...batch.values());
    before = batch.last()?.id;

    if (batch.size < 100) break;
    await sleep(900);
  }

  return collected.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}

async function saveTranscript(Transcript, oldChannel, newChannel, openerId) {
  if (!Transcript) return;

  const messages = await fetchTranscriptMessages(oldChannel);

  const payload = {
    canalId: oldChannel.id,
    abertoPor: openerId ? `ID: ${openerId}` : "Desconhecido",
    assumidoPor: "Canal recriado",
    mensagens: messages.map((msg) => ({
      autor: msg.member?.displayName || msg.author?.username || "Desconhecido",
      idAutor: msg.author?.id || "0",
      conteudo: msg.content || "[sem texto/anexo/embed]",
      horario: msg.createdAt,
      avatar: msg.author?.displayAvatarURL({ dynamic: true, size: 64 }) || "",
    })),
  };

  await Transcript.create(payload).catch((err) => {
    console.error("[RECRIAR_TICKET] Erro ao salvar transcript:", err);
  });
}

async function sendLog({ guild, executor, oldChannel, newChannel, tipo, openerId, totalPerms }) {
  const logChannel = await guild.channels.fetch(LOG_RECRIAR_CHANNEL_ID).catch(() => null);
  if (!logChannel?.isTextBased()) return;

  const embed = new EmbedBuilder()
    .setTitle("♻️ Ticket recriado com sucesso")
    .setColor("#ff009a")
    .setThumbnail(guild.iconURL({ dynamic: true }))
    .addFields(
      { name: "🎫 Tipo", value: `\`${tipo}\``, inline: true },
      { name: "👤 Quem usou", value: `<@${executor.id}>`, inline: true },
      { name: "📨 Aberto por", value: openerId ? `<@${openerId}>` : "`Não identificado`", inline: true },
      { name: "📌 Canal antigo", value: `\`${oldChannel.name}\`\n\`${oldChannel.id}\``, inline: false },
      { name: "✅ Canal novo", value: `${newChannel}\n\`${newChannel.id}\``, inline: false },
      { name: "🔐 Permissões copiadas", value: `\`${totalPerms}\` overwrites copiados`, inline: true },
      { name: "📝 Motivo do fechamento", value: "`Canal recriado`", inline: true },
      { name: "🕒 Data/Hora", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
    )
    .setFooter({ text: "SantaCreators • Recriador de Tickets", iconURL: guild.iconURL({ dynamic: true }) });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel("📂 Abrir Transcript antigo")
      .setURL(`${TRANSCRIPTS_BASE_URL}${oldChannel.id}`),

    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel("📎 Ir para canal novo")
      .setURL(`https://discord.com/channels/${guild.id}/${newChannel.id}`)
  );

  await logChannel.send({ embeds: [embed], components: [row] }).catch(() => {});
}

async function recreateOneChannel({ oldChannel, message, client, Transcript, statusMessage, index, total }) {
  const guild = oldChannel.guild;
  const tipo = getTicketTipo(oldChannel);
  const openerId = getOpenerId(oldChannel);

  await statusMessage.edit({
    content:
      `♻️ **Recriando tickets...**\n\n` +
      `📌 Progresso: **${index}/${total}**\n` +
      `🔎 Canal atual: ${oldChannel}\n` +
      `⏳ Etapa: copiando permissões...`,
  }).catch(() => {});

  const permissionOverwrites = oldChannel.permissionOverwrites.cache.map((ow) => ({
    id: ow.id,
    allow: ow.allow.bitfield,
    deny: ow.deny.bitfield,
    type: ow.type,
  }));

  await statusMessage.edit({
    content:
      `♻️ **Recriando tickets...**\n\n` +
      `📌 Progresso: **${index}/${total}**\n` +
      `🔎 Canal atual: ${oldChannel}\n` +
      `⏳ Etapa: criando canal novo...`,
  }).catch(() => {});

  const newChannel = await guild.channels.create({
    name: oldChannel.name,
    type: ChannelType.GuildText,
    parent: oldChannel.parentId || null,
    topic: `${oldChannel.topic || ""};recriado_de:${oldChannel.id};recriado_por:${message.author.id}`.slice(0, 1024),
    nsfw: oldChannel.nsfw,
    rateLimitPerUser: oldChannel.rateLimitPerUser,
    permissionOverwrites,
    reason: `Ticket recriado por ${message.author.tag}`,
  });

  await newChannel.setPosition(oldChannel.position).catch(() => {});

  await statusMessage.edit({
    content:
      `♻️ **Recriando tickets...**\n\n` +
      `📌 Progresso: **${index}/${total}**\n` +
      `✅ Canal novo: ${newChannel}\n` +
      `⏳ Etapa: enviando painel novo...`,
  }).catch(() => {});

  const embedTicket = new EmbedBuilder()
    .setTitle(tipo.charAt(0).toUpperCase() + tipo.slice(1))
    .setColor("#ff009a")
    .setThumbnail(guild.iconURL({ dynamic: true }))
    .addFields(
      {
        name: "Aberto por:",
        value: openerId ? `<@${openerId}>` : "`Não identificado`",
        inline: true,
      },
      {
        name: "Assumido por:",
        value: "`Ninguém`",
        inline: true,
      },
      {
        name: "♻️ Recriado por:",
        value: `<@${message.author.id}> <t:${Math.floor(Date.now() / 1000)}:R>`,
        inline: false,
      }
    )
    .setFooter({ text: "SantaCreators - Tickets" });

  await newChannel.send({
    content: openerId ? `<@${openerId}>` : null,
    embeds: [embedTicket],
    components: [buildTicketButtons()],
  });

  await statusMessage.edit({
    content:
      `♻️ **Recriando tickets...**\n\n` +
      `📌 Progresso: **${index}/${total}**\n` +
      `✅ Canal novo: ${newChannel}\n` +
      `⏳ Etapa: salvando transcript/log...`,
  }).catch(() => {});

  await saveTranscript(Transcript, oldChannel, newChannel, openerId);

  await sendLog({
    guild,
    executor: message.author,
    oldChannel,
    newChannel,
    tipo,
    openerId,
    totalPerms: permissionOverwrites.length,
  });

  await statusMessage.edit({
    content:
      `♻️ **Recriando tickets...**\n\n` +
      `📌 Progresso: **${index}/${total}**\n` +
      `✅ Canal novo: ${newChannel}\n` +
      `🗑️ Etapa: apagando canal antigo com segurança...`,
  }).catch(() => {});

  await oldChannel.delete(`Canal recriado por ${message.author.tag} | Novo canal: ${newChannel.id}`);

  return newChannel;
}

export async function recriarTicketsHandleMessage(message, client, Transcript) {
  if (!message.guild || message.author.bot) return false;

  const content = message.content.trim();
  if (!content.toLowerCase().startsWith("!recriar")) return false;

  if (!isAdminAutorizado(message)) {
    await message.reply("🚫 Você precisa da permissão **Gerenciar Canais** para usar esse comando.");
    return true;
  }

  const args = content.split(/\s+/);
  const targetId = args[1]?.replace(/\D/g, "");

  await message.delete().catch(() => {});

  if (!targetId) {
    await message.channel.send("⚠️ Use assim: `!recriar ID_DA_CATEGORIA_OU_CANAL`");
    return true;
  }

  const statusMessage = await message.channel.send({
    content: "♻️ **Recriando tickets...**\n\n⏳ Buscando canal/categoria...",
  });

  const target = await message.guild.channels.fetch(targetId).catch(() => null);

  if (!target) {
    await statusMessage.edit("❌ Não encontrei esse canal/categoria.");
    return true;
  }

  let channels = [];

  if (target.type === ChannelType.GuildCategory) {
    channels = [...target.children.cache.values()]
      .filter((ch) => ch.type === ChannelType.GuildText)
      .sort((a, b) => a.position - b.position);
  } else if (target.type === ChannelType.GuildText) {
    channels = [target];
  } else {
    await statusMessage.edit("❌ Esse ID precisa ser de uma **categoria** ou de um **canal de texto**.");
    return true;
  }

  if (!channels.length) {
    await statusMessage.edit("⚠️ Não achei nenhum canal de texto para recriar.");
    return true;
  }

  const created = [];
  const failed = [];

  for (let i = 0; i < channels.length; i++) {
    const oldChannel = channels[i];

    try {
      const novo = await recreateOneChannel({
        oldChannel,
        message,
        client,
        Transcript,
        statusMessage,
        index: i + 1,
        total: channels.length,
      });

      created.push(novo);
      await sleep(1500);
    } catch (err) {
      console.error("[RECRIAR_TICKET] Erro:", err);
      failed.push({
        channel: oldChannel,
        error: err?.message || String(err),
      });

      await statusMessage.edit({
        content:
          `⚠️ **Erro ao recriar um canal.**\n\n` +
          `📌 Canal: ${oldChannel}\n` +
          `❌ Erro: \`${err?.message || err}\`\n\n` +
          `✅ Os canais antigos **não são apagados** quando dá erro.`,
      }).catch(() => {});
    }
  }

  await statusMessage.edit({
    content:
      `✅ **Processo finalizado!**\n\n` +
      `♻️ Canais recriados: **${created.length}**\n` +
      `❌ Falhas: **${failed.length}**\n\n` +
      created.map((ch) => `✅ ${ch}`).join("\n"),
  }).catch(() => {});

  return true;
}