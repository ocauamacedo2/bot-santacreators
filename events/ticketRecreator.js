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
const TRANSCRIPTS_CHANNEL_ID = "1358568999738409151";
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

const RECRIAR_ALLOWED_USERS = new Set([
  "660311795327828008", // Macedo
]);

const RECRIAR_ALLOWED_ROLES = new Set([
  "1262262852949905408", // Owner
]);

function isAdminAutorizado(message) {
  if (RECRIAR_ALLOWED_USERS.has(message.author.id)) return true;

  return message.member?.roles?.cache?.some((role) =>
    RECRIAR_ALLOWED_ROLES.has(role.id)
  );
}

async function fetchTextChannelSafe(client, guild, channelId) {
  const channel =
    client.channels.cache.get(channelId) ||
    guild.channels.cache.get(channelId) ||
    await client.channels.fetch(channelId).catch(() => null) ||
    await guild.channels.fetch(channelId).catch(() => null);

  if (!channel || !channel.isTextBased()) return null;

  return channel;
}

async function getOrCreateTempCategory(guild, originalCategory) {
  const existing = guild.channels.cache.find((channel) =>
    channel.type === ChannelType.GuildCategory &&
    channel.name === "♻️・RECRIANDO-TICKETS"
  );

  if (existing) return existing;

  const permissionOverwrites = originalCategory?.permissionOverwrites?.cache?.map((ow) => ({
    id: ow.id,
    allow: ow.allow.bitfield,
    deny: ow.deny.bitfield,
    type: ow.type,
  })) || [];

  return await guild.channels.create({
    name: "♻️・RECRIANDO-TICKETS",
    type: ChannelType.GuildCategory,
    permissionOverwrites,
    reason: "Categoria temporária para recriar tickets antigos",
  });
}

async function moveOldChannelToTempIfNeeded(oldChannel, statusMessage) {
  const originalParentId = oldChannel.parentId;
  const originalParent = oldChannel.parent;

  if (!originalParentId || !originalParent) {
    return {
      moved: false,
      originalParentId,
    };
  }

  const channelsInParent = oldChannel.guild.channels.cache.filter((channel) =>
    channel.parentId === originalParentId
  );

  if (channelsInParent.size < 50) {
    return {
      moved: false,
      originalParentId,
    };
  }

  await statusMessage.edit({
    content:
      `♻️ **Recriando tickets...**\n\n` +
      `⚠️ A categoria original está cheia com **50 canais**.\n` +
      `📦 Movendo o canal antigo temporariamente para liberar espaço...\n` +
      `🔎 Canal: ${oldChannel}`,
  }).catch(() => {});

  const tempCategory = await getOrCreateTempCategory(oldChannel.guild, originalParent);

  await oldChannel.setParent(tempCategory.id, {
    lockPermissions: false,
    reason: "Movendo temporariamente para liberar vaga na categoria original",
  });

  await sleep(1200);

  return {
    moved: true,
    originalParentId,
  };
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

async function saveTranscript(Transcript, oldChannel, newChannel, openerId, executorId) {
  if (!Transcript) return 0;

  const messages = await fetchTranscriptMessages(oldChannel);

  const payload = {
    canalId: oldChannel.id,
    abertoPor: openerId ? `ID: ${openerId}` : "Desconhecido",
    assumidoPor: `Canal recriado por ID: ${executorId}`,
    mensagens: [
      ...messages.map((msg) => ({
        autor: msg.member?.displayName || msg.author?.username || "Desconhecido",
        idAutor: msg.author?.id || "0",
        conteudo: msg.content || "[sem texto/anexo/embed]",
        horario: msg.createdAt,
        avatar: msg.author?.displayAvatarURL({ dynamic: true, size: 64 }) || "",
      })),
      {
        autor: "SantaCreators",
        idAutor: "BOT",
        conteudo: `Ticket fechado automaticamente pelo recriador. Motivo: Canal recriado. Novo canal: ${newChannel.id}`,
        horario: new Date(),
        avatar: "",
      },
    ],
  };

  await Transcript.create(payload);

  return messages.length;
}

async function sendLog({ client, guild, executor, oldChannel, newChannel, tipo, openerId, totalPerms, messagesCount }) {
  const logChannel = await fetchTextChannelSafe(client, guild, LOG_RECRIAR_CHANNEL_ID);

  if (!logChannel) {
    console.error(`[RECRIAR_TICKET] Canal de log ${LOG_RECRIAR_CHANNEL_ID} não encontrado ou sem permissão.`);
    return false;
  }

  const embed = new EmbedBuilder()
    .setTitle("📁 LOGS DE TICKETS")
    .setColor("#ff009a")
    .setThumbnail(guild.iconURL({ dynamic: true }))
    .addFields(
      { name: "📝 TIPO DE TICKET", value: `\`${tipo.toUpperCase()}\``, inline: false },
      { name: "📨 Ticket aberto por:", value: openerId ? `<@${openerId}>` : "`Não identificado`", inline: true },
      { name: "✅ Ticket fechado por:", value: `<@${executor.id}>`, inline: true },
      { name: "🎨 Creator que atendeu:", value: `<@${executor.id}>`, inline: true },
      { name: "🆔 Canal antigo:", value: `\`${oldChannel.id}\``, inline: true },
      { name: "♻️ Canal novo:", value: `${newChannel}\n\`${newChannel.id}\``, inline: true },
      { name: "🔐 Permissões copiadas:", value: `\`${totalPerms}\` overwrites`, inline: true },
      { name: "💬 Mensagens salvas:", value: `\`${messagesCount}\` mensagens`, inline: true },
      { name: "🕒 Fechamento:", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
      { name: "📝 Qual foi o desenrolar/motivo? Foi resolvido?", value: "Canal recriado", inline: false }
    )
    .setFooter({
      text: "SantaCreators",
      iconURL: guild.iconURL({ dynamic: true })
    });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel("📂 Abrir Transcript")
      .setURL(`${TRANSCRIPTS_BASE_URL}${oldChannel.id}`),

    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel("📎 Ir para canal novo")
      .setURL(`https://discord.com/channels/${guild.id}/${newChannel.id}`)
  );

  await logChannel.send({ embeds: [embed], components: [row] });
  return true;
}

async function sendTranscriptLog({ client, guild, executor, oldChannel, newChannel, tipo, openerId }) {
  const transcriptChannel = await fetchTextChannelSafe(client, guild, TRANSCRIPTS_CHANNEL_ID);

  if (!transcriptChannel) {
    console.error(`[RECRIAR_TICKET] Canal de transcript ${TRANSCRIPTS_CHANNEL_ID} não encontrado ou sem permissão.`);
    return false;
  }

  const embed = new EmbedBuilder()
    .setTitle("📁 LOGS DE TICKETS")
    .setColor("#ff009a")
    .setThumbnail(guild.iconURL({ dynamic: true }))
    .addFields(
      { name: "📝 TIPO DE TICKET", value: `\`${tipo.toUpperCase()}\``, inline: false },
      { name: "📨 Ticket aberto por:", value: openerId ? `<@${openerId}>` : "`Não identificado`", inline: true },
      { name: "✅ Ticket fechado por:", value: `<@${executor.id}>`, inline: true },
      { name: "🎨 Creator que atendeu:", value: `<@${executor.id}>`, inline: true },
      { name: "🆔 Canal do ticket:", value: `\`${oldChannel.id}\``, inline: false },
      { name: "🕒 Abertura:", value: `<t:${Math.floor(oldChannel.createdTimestamp / 1000)}:F>`, inline: true },
      { name: "🕓 Fechamento:", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
      { name: "♻️ Novo canal recriado:", value: `${newChannel}`, inline: false },
      { name: "📝 Qual foi o desenrolar/motivo? Foi resolvido?", value: "Canal recriado", inline: false }
    )
    .setFooter({
      text: "SantaCreators",
      iconURL: guild.iconURL({ dynamic: true })
    });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel("📂 Abrir Transcript")
      .setURL(`${TRANSCRIPTS_BASE_URL}${oldChannel.id}`)
  );

  await transcriptChannel.send({ embeds: [embed], components: [row] });
  return true;
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

  const originalParentId = oldChannel.parentId;
  const moveInfo = await moveOldChannelToTempIfNeeded(oldChannel, statusMessage);

  let newChannel;

  try {
    newChannel = await guild.channels.create({
      name: oldChannel.name,
      type: ChannelType.GuildText,
      parent: originalParentId || null,
      topic: `${oldChannel.topic || ""};recriado_de:${oldChannel.id};recriado_por:${message.author.id}`.slice(0, 1024),
      nsfw: oldChannel.nsfw,
      rateLimitPerUser: oldChannel.rateLimitPerUser,
      permissionOverwrites,
      reason: `Ticket recriado por ${message.author.tag}`,
    });
  } catch (err) {
    if (moveInfo.moved && moveInfo.originalParentId) {
      await oldChannel.setParent(moveInfo.originalParentId, {
        lockPermissions: false,
        reason: "Falha ao recriar ticket, voltando canal antigo para categoria original",
      }).catch(() => {});
    }

    throw err;
  }

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

  const messagesCount = await saveTranscript(
    Transcript,
    oldChannel,
    newChannel,
    openerId,
    message.author.id
  );

  const logEnviado = await sendLog({
    client,
    guild,
    executor: message.author,
    oldChannel,
    newChannel,
    tipo,
    openerId,
    totalPerms: permissionOverwrites.length,
    messagesCount,
  });

  const transcriptLogEnviado = await sendTranscriptLog({
    client,
    guild,
    executor: message.author,
    oldChannel,
    newChannel,
    tipo,
    openerId,
  });

  await statusMessage.edit({
    content:
      `♻️ **Recriando tickets...**\n\n` +
      `📌 Progresso: **${index}/${total}**\n` +
      `✅ Canal novo: ${newChannel}\n` +
      `${logEnviado ? "📁 Log enviado com sucesso." : "⚠️ Log principal não enviado: canal sem acesso/permissão."}\n` +
      `${transcriptLogEnviado ? "📂 Log de transcript enviado com sucesso." : "⚠️ Log de transcript não enviado: canal sem acesso/permissão."}\n` +
      `💬 Transcript salvo com **${messagesCount}** mensagens.\n` +
      `🗑️ Etapa: apagando canal antigo com segurança...`,
  }).catch(() => {});

  await oldChannel.send({
    content:
      `✅ Este ticket foi fechado pelo sistema.\n\n` +
      `📝 Motivo: **Canal recriado**\n` +
      `♻️ Novo canal: ${newChannel}\n` +
      `🕒 Fechando em alguns segundos...`,
  }).catch(() => {});

  await sleep(3000);

  await oldChannel.delete(`Ticket fechado | Motivo: Canal recriado | Novo canal: ${newChannel.id}`);

  return newChannel;
}

export async function recriarTicketsHandleMessage(message, client, Transcript) {
  if (!message.guild || message.author.bot) return false;

  const content = message.content.trim();
  if (!content.toLowerCase().startsWith("!recriar")) return false;

  if (!isAdminAutorizado(message)) {
    await message.reply("🚫 Apenas **Owner** ou **Macedo** podem usar esse comando.");
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