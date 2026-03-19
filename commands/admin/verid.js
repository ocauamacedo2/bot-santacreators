// ./commands/admin/verid.js
import { EmbedBuilder, ChannelType } from "discord.js";

// ===============================
// SC_CMD — !verid (modular)
// Uso: !verid <id|menção> [outros...]
// • Checa: membro, cargo, canal, emoji, webhook
// • Permissão por IDs/cargos (igual seu original)
// • Retorna true quando tratar (pra usar no roteador)
// ===============================

const IDS_PERMITIDOS = [
  "660311795327828008", // EU
  "1262262852949905408", // Owner
  "1352408327983861844", // Resp Creator
  "1262262852949905409", // Resp Influ
  "1352407252216184833", // Resp Líder
  "1282119104576098314", // MKT Ticket
];

// tenta extrair só números (pega de <@123>, <@&123>, <#123>, etc.)
function normalizeId(raw) {
  const s = String(raw ?? "").trim();
  const m = s.match(/\d{5,25}/); // discord ids geralmente 17-19, mas deixa flex
  return m ? m[0] : null;
}

function hasPerm(message) {
  if (!message?.member) return false;
  if (IDS_PERMITIDOS.includes(message.author.id)) return true;
  return message.member.roles?.cache?.some((r) => IDS_PERMITIDOS.includes(r.id)) ?? false;
}

function channelTypeLabel(t) {
  // só pra ficar bonito no embed
  switch (t) {
    case ChannelType.GuildText: return "Texto";
    case ChannelType.GuildVoice: return "Voz";
    case ChannelType.GuildCategory: return "Categoria";
    case ChannelType.GuildAnnouncement: return "Anúncios";
    case ChannelType.GuildForum: return "Fórum";
    case ChannelType.GuildStageVoice: return "Palco";
    case ChannelType.PublicThread: return "Thread Pública";
    case ChannelType.PrivateThread: return "Thread Privada";
    case ChannelType.AnnouncementThread: return "Thread Anúncio";
    default: return String(t);
  }
}

/**
 * Handler pro roteador central
 * @param {import("discord.js").Message} message
 * @param {import("discord.js").Client} client
 */
export async function verIdHandleMessage(message, client) {
  try {
    if (!message || message.author?.bot) return false;
    if (!message.guild) return false;

    const PREFIX = process.env.PREFIX || "!";
    if (!message.content?.startsWith(PREFIX)) return false;

    const [cmdRaw, ...rest] = message.content.slice(PREFIX.length).trim().split(/\s+/);
    const cmd = (cmdRaw || "").toLowerCase();
    if (cmd !== "verid") return false;

    // ✅ permissão
    if (!hasPerm(message)) {
      setTimeout(() => message.delete().catch(() => {}), 1000);
      message
        .reply("❌ Você não tem permissão para usar este comando.")
        .then((msg) => setTimeout(() => msg.delete().catch(() => {}), 5000))
        .catch(() => {});
      return true;
    }

    // apaga a msg do comando (igual seu original)
    await message.delete().catch(() => {});

    // ids recebidos
    const rawIds = rest || [];
    const ids = rawIds.map(normalizeId).filter(Boolean);

    const embed = new EmbedBuilder()
      .setTitle("🔍 Resultado da verificação de ID(s)")
      .setColor(0x2f3136)
      .setFooter({
        text: `Usado por ${message.author.tag}`,
        iconURL: message.author.displayAvatarURL({ dynamic: true }),
      })
      .setTimestamp();

    if (!ids.length) {
      embed.setDescription("⚠️ Nenhum ID fornecido.");
      const resposta = await message.channel.send({ embeds: [embed] }).catch(() => null);
      if (resposta) setTimeout(() => resposta.delete().catch(() => {}), 60_000);
      return true;
    }

    // webhook fetch 1x (ao invés de buscar a cada id)
    const webhooks = await message.guild.fetchWebhooks().catch(() => []);
    const MAX_FIELDS = 25; // limite do Discord por embed
    let fieldsUsed = 0;

    for (const id of ids) {
      if (fieldsUsed >= MAX_FIELDS) break;

      let base = `\`${id}\``;

      // 1) membro
      const membro = await message.guild.members.fetch(id).catch(() => null);
      if (membro) {
        embed.addFields({
          name: "👤 Membro",
          value: `${base} → 👤 Membro: ${membro} (${membro.user.tag})`,
        });
        fieldsUsed++;
        continue;
      }

      // 2) cargo
      const role = message.guild.roles.cache.get(id);
      if (role) {
        embed.addFields({
          name: "🛡️ Cargo",
          value: `${base} → 🛡️ Cargo: <@&${role.id}> (${role.name})`,
        });
        fieldsUsed++;
        continue;
      }

      // 3) canal
      const channel = await message.guild.channels.fetch(id).catch(() => null);
      if (channel) {
        embed.addFields({
          name: "📺 Canal",
          value: `${base} → 📺 Canal: <#${channel.id}> (${channelTypeLabel(channel.type)})`,
        });
        fieldsUsed++;
        continue;
      }

      // 4) emoji
      const emoji = client.emojis?.cache?.get(id);
      if (emoji) {
        embed.addFields({
          name: "😄 Emoji",
          value: `${base} → 😄 Emoji: ${emoji} (${emoji.name})`,
        });
        fieldsUsed++;
        continue;
      }

      // 5) webhook
      const webhook = Array.isArray(webhooks) ? webhooks.find((w) => w.id === id) : null;
      if (webhook) {
        embed.addFields({
          name: "🌐 Webhook",
          value: `${base} → 🌐 Webhook: ${webhook.name}`,
        });
        fieldsUsed++;
        continue;
      }

      // desconhecido
      embed.addFields({
        name: "❓ Desconhecido",
        value: `${base} → ❌ Não encontrado.`,
      });
      fieldsUsed++;
    }

    if (ids.length > MAX_FIELDS) {
      embed.setDescription(
        `⚠️ Você mandou **${ids.length}** IDs. Mostrei só os **${MAX_FIELDS}** primeiros (limite do Discord por embed).`
      );
    }

    const resposta = await message.channel.send({ embeds: [embed] }).catch(() => null);
    if (resposta) setTimeout(() => resposta.delete().catch(() => {}), 60_000);

    return true;
  } catch (e) {
    console.error("[verid] erro:", e);
    return false; // se der ruim, deixa outros handlers tentarem (mais seguro)
  }
}
