// /application/commands/admin/removerperm.js
import {
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
} from "discord.js";
import { resolveLogChannel } from "../../events/channelResolver.js";

// ===============================
// SC_PERM — REMOVER ACESSO POR CATEGORIA (MODULAR)
// Uso: !removerperm <categoryId> <@cargo|roleId> [@cargo|roleId] ...
// Ex.: !removerperm 1414687963161559180 @Creator 1352493359897378941
// Requer: MANAGE_CHANNELS (ou whitelist)
// ===============================

// === CONFIG EDITÁVEL ===
const CANAL_LOGS_ID = process.env.CANAL_LOGS_PERM || null; // opcional
const IDS_PODE_USAR = [
  "660311795327828008", // Você
  "1262262852949905408", // OWNER
  // adicione mais IDs de cargos ou usuários se quiser
];
// =======================

function parseRolesFromArgs(message, args) {
  const roleIds = new Set();

  // menções <@&id>
  for (const r of message.mentions.roles?.values?.() || []) roleIds.add(r.id);

  // ids crus nos args
  for (const a of args) {
    const m = String(a).match(/^\d{5,}$/);
    if (m) roleIds.add(m[0]);
  }

  return [...roleIds];
}

function isAllowedToUse(message) {
  // permite se autor tem MANAGE_CHANNELS ou está whitelisted
  const hasManage = message.member?.permissions?.has(PermissionFlagsBits.ManageChannels);

  const whitelisted = IDS_PODE_USAR.some((id) => {
    // se bater no autor
    if (message.author?.id === id) return true;
    // se bater em algum cargo do member
    return message.member?.roles?.cache?.has(id);
  });

  return !!(hasManage || whitelisted);
}

async function fetchCategory(guild, catId) {
  const ch = await guild.channels.fetch(catId).catch(() => null);
  return ch && ch.type === ChannelType.GuildCategory ? ch : null;
}

function listChildren(guild, categoryId) {
  return guild.channels.cache.filter((c) => c.parentId === categoryId);
}

async function denyInChannel(channel, roleId) {
  // Crava deny explícito e remove grants conflitantes
  const overwrite = {
    ViewChannel: false,
    SendMessages: false,
    SendMessagesInThreads: false,
    CreatePublicThreads: false,
    CreatePrivateThreads: false,
    Connect: false,
    Speak: false,
  };

  // ✅ discord.js v14: edit(target, options, reason)
  await channel.permissionOverwrites.edit(
    roleId,
    overwrite,
    "SC_PERM remover acesso por categoria"
  );

  // Threads ativas (se existir)
  if (channel.threads?.cache?.size) {
    for (const thr of channel.threads.cache.values()) {
      if (!thr.manageable) continue;
      await thr.permissionOverwrites
        .edit(roleId, { ViewChannel: false, SendMessages: false }, "SC_PERM deny em thread")
        .catch(() => null);
    }
  }
}

async function processCategory(message, categoryId, roleIds) {
  const guild = message.guild;
  const category = await fetchCategory(guild, categoryId);

  if (!category) {
    await message.reply(`❌ Categoria inválida (ID: \`${categoryId}\`).`);
    return;
  }

  const children = listChildren(guild, categoryId);
  if (!children.size) {
    await message.reply(`⚠️ A categoria **${category.name}** não tem canais filhos.`);
    return;
  }

  const statusMsg = await message.reply(
    `⏳ Aplicando bloqueio de acesso em **${children.size}** canais da categoria **${category.name}** para **${roleIds.length}** cargo(s)…`
  );

  let ok = 0,
    fail = 0;
  const details = [];

  // sequencial pra respeitar rate limit
  for (const ch of children.values()) {
    for (const rid of roleIds) {
      try {
        await denyInChannel(ch, rid);
        ok++;
      } catch (e) {
        fail++;
        details.push(
          `• Falhou em ${ch.name} (${ch.id}) p/ role ${rid}: ${e?.code || e?.message || e}`
        );
      }
      await new Promise((r) => setTimeout(r, 120));
    }
  }

  const sum = new EmbedBuilder()
    .setColor(fail ? 0xff5555 : 0x57f287)
    .setTitle("SC_PERM — Remoção de acesso por categoria")
    .setDescription(
      [
        `**Categoria:** ${category.name} (\`${category.id}\`)`,
        `**Cargos afetados:** ${
          roleIds.map((r) => `<@&${r}> (\`${r}\`)`).join(", ") || "_nenhum_"
        }`,
        `**Canais processados:** ${children.size}`,
        `**Overwrites aplicados:** ${ok}`,
        `**Falhas:** ${fail}`,
      ].join("\n")
    )
    .setFooter({ text: `Solicitado por ${message.author.tag}` })
    .setTimestamp();

  if (details.length) {
    sum.addFields({
      name: "Erros (parcial)",
      value: details.slice(0, 12).join("\n"),
    });
  }

  await statusMsg
    .edit({
      content: fail ? "✅ Finalizado com alertas." : "✅ Finalizado com sucesso!",
      embeds: [sum],
    })
    .catch(() => null);

  // logs opcional
  if (CANAL_LOGS_ID) {
    const logCh = await resolveLogChannel(message.client, CANAL_LOGS_ID);
    if (logCh?.isTextBased()) {
      await logCh.send({ embeds: [sum] }).catch(() => null);
    }
  }
}

/**
 * Handler modular para plugar no teu messageCreate roteado
 * @returns {Promise<boolean>} true se tratou o comando
 */
export async function removerPermHandleMessage(message, client) {
  try {
    if (message.author.bot || !message.guild) return false;

    const prefix = "!";
    if (!message.content.startsWith(prefix)) return false;

    const [cmd, ...args] = message.content.slice(prefix.length).trim().split(/\s+/);
    if ((cmd || "").toLowerCase() !== "removerperm") return false;

    if (!isAllowedToUse(message)) {
      setTimeout(() => message.delete().catch(() => {}), 1000);
      await message.reply(
        "❌ Você não tem permissão para usar este comando (requer **Gerenciar Canais** ou whitelisted)."
      ).then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
      return true;
    }

    const categoryId = args.shift();
    if (!categoryId || !/^\d{5,}$/.test(categoryId)) {
      await message.reply("❓ Uso: `!removerperm <categoryId> <@cargo|roleId> [@cargo|roleId] ...`");
      return true;
    }

    const roleIds = parseRolesFromArgs(message, args);
    if (!roleIds.length) {
      await message.reply("❓ Informe pelo menos **um** cargo (menção ou ID).");
      return true;
    }

    await processCategory(message, categoryId, roleIds);
    return true;
  } catch (err) {
    console.error("SC_PERM error:", err);
    await message.reply(`🔥 Erro inesperado: ${err?.message || err}`);
    return true;
  }
}
