// /application/events/logs/messageDelete.js
// Discord.js v14 (ESM)
// Roteamento perfeito:
// - HUMANO apagou -> 1377834202417856732
// - BOT apagou -> 1377852282779078666
//
// PLUS:
// - Reconstrói embeds
// - Lista botões/components
// - Baixa anexos e também tenta baixar imagem de embed
// - Usa CACHE pra não ficar "Autor: Desconhecido" quando bot apaga sticky/button

import {
  AuditLogEvent,
  EmbedBuilder,
  AttachmentBuilder,
  ChannelType,
  PermissionsBitField,
} from "discord.js";

import fs from "fs";
import path from "path";

import { getCachedMessage } from "./_deleteCache.js";

const HUMAN_LOG_CHANNEL_ID = "1377834202417856732";
const BOT_LOG_CHANNEL_ID = "1377852282779078666";

const STORAGE_DIR = path.join(process.cwd(), "storage", "deleted-attachments");
const AUDIT_TIME_WINDOW_MS = 12_000;

// ✅ AUTO-LIMPEZA: Apaga arquivos com mais de 24h para liberar espaço
const MAX_FILE_AGE_MS = 24 * 60 * 60 * 1000;

function cleanupStorage() {
  try {
    if (!fs.existsSync(STORAGE_DIR)) return;
    const files = fs.readdirSync(STORAGE_DIR);
    const now = Date.now();
    let deleted = 0;

    for (const file of files) {
      const filePath = path.join(STORAGE_DIR, file);
      try {
        const stat = fs.statSync(filePath);
        if (now - stat.mtimeMs > MAX_FILE_AGE_MS) {
          fs.unlinkSync(filePath);
          deleted++;
        }
      } catch {}
    }
    if (deleted > 0) console.log(`[MessageDelete] Limpeza automática: ${deleted} arquivos antigos removidos.`);
  } catch (e) {
    console.error("[MessageDelete] Erro na limpeza:", e);
  }
}

// Roda limpeza ao iniciar e a cada 1 hora
cleanupStorage();
setInterval(cleanupStorage, 60 * 60 * 1000);

function ensureDirSync(dir) { try { fs.mkdirSync(dir, { recursive: true }); } catch {} }

function safe(str, fallback = "—") {
  if (str === null || str === undefined) return fallback;
  const s = String(str).trim();
  return s.length ? s : fallback;
}

function tsFull(ms) {
  if (!ms) return "—";
  const t = Math.floor(ms / 1000);
  return `<t:${t}:F> • <t:${t}:R>`;
}

function getCategoryName(channel) {
  try {
    if (!channel) return "Sem categoria";
    if (channel.type === ChannelType.GuildCategory) return channel.name;
    const parent = channel.parent;
    return parent?.name || "Sem categoria";
  } catch {
    return "Sem categoria";
  }
}

async function downloadToFile(url, fullPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao baixar: ${res.status} ${res.statusText}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  await fs.promises.writeFile(fullPath, buffer);
  return fullPath;
}

async function findDeleterViaAuditLogs(guild, deletedMessage) {
  try {
    if (!guild || !deletedMessage) return null;

    const me = guild.members.me;
    if (!me) return null;

    if (!me.permissions.has(PermissionsBitField.Flags.ViewAuditLog)) return null;

    const logs = await guild.fetchAuditLogs({
      type: AuditLogEvent.MessageDelete,
      limit: 6,
    });

    const now = Date.now();
    const channelId = deletedMessage.channel?.id;

    for (const entry of logs.entries.values()) {
      const created = entry.createdTimestamp ?? 0;
      if (now - created > AUDIT_TIME_WINDOW_MS) continue;

      const extra = entry.extra;
      const sameChannel = extra?.channel?.id ? extra.channel.id === channelId : true;

      const target = entry.target;
      const sameTarget =
        target?.id && deletedMessage.author?.id
          ? target.id === deletedMessage.author.id
          : true;

      if (sameChannel && sameTarget) {
        return {
          executor: entry.executor ?? null,
          reason: entry.reason ?? null,
          matched: true,
        };
      }
    }

    return null;
  } catch {
    return null;
  }
}

function summarizeComponents(components) {
  try {
    const rows = components;
    if (!rows || !Array.isArray(rows) || rows.length === 0) return null;

    const lines = [];
    for (const row of rows) {
      const comps = row?.components ?? [];
      for (const c of comps) {
        const label = safe(c.label, "sem-label");
        if (c.url) lines.push(`🔗 **${label}** → ${c.url}`);
        else if (c.customId) lines.push(`🧩 **${label}** (customId: \`${c.customId}\`)`);
        else lines.push(`🧩 **${label}**`);
      }
    }

    return lines.length ? lines.slice(0, 25).join("\n") : null;
  } catch {
    return null;
  }
}

function buildReconstructedEmbeds(embeds) {
  try {
    if (!embeds || !Array.isArray(embeds) || embeds.length === 0) return [];

    const out = [];
    for (const e of embeds.slice(0, 3)) {
      const b = new EmbedBuilder();
      if (e.color) b.setColor(e.color);

      if (e.author?.name) {
        b.setAuthor({
          name: e.author.name,
          iconURL: e.author.iconURL ?? undefined,
          url: e.author.url ?? undefined,
        });
      }

      if (e.title) b.setTitle(e.title);
      if (e.url) b.setURL(e.url);
      if (e.description) b.setDescription(String(e.description).slice(0, 3800));

      if (e.thumbnail?.url) b.setThumbnail(e.thumbnail.url);
      if (e.image?.url) b.setImage(e.image.url);

      if (Array.isArray(e.fields) && e.fields.length) {
        b.addFields(
          e.fields.slice(0, 10).map(f => ({
            name: safe(f.name, "—").slice(0, 256),
            value: safe(f.value, "—").slice(0, 1024),
            inline: !!f.inline,
          }))
        );
      }

      if (e.footer?.text) {
        b.setFooter({
          text: e.footer.text.slice(0, 2048),
          iconURL: e.footer.iconURL ?? undefined,
        });
      }

      if (e.timestamp) {
        try { b.setTimestamp(new Date(e.timestamp)); } catch {}
      }

      const hasSomething =
        e.title || e.description || e.fields?.length || e.image?.url || e.thumbnail?.url || e.author?.name;

      if (hasSomething) out.push(b);
    }

    return out;
  } catch {
    return [];
  }
}

export default {
  name: "messageDelete",
  once: false,

  async execute(message, client) {
    try {
      if (!message || !message.guild) return;

      // tenta buscar, mas não confia 100% (às vezes falha)
      if (message.partial) {
        try { message = await message.fetch(); } catch {}
      }

      const guild = message.guild;
      const channel = message.channel;

      // ✅ puxa do cache (isso resolve o "Autor desconhecido" e o roteamento errado)
      const cached = getCachedMessage(message.channelId, message.id);

      // autor (prioriza cache)
      const authorObj = cached?.author ?? (message.author ? {
        id: message.author.id,
        tag: message.author.tag ?? message.author.username ?? null,
        bot: !!message.author.bot,
        avatar: message.author.displayAvatarURL?.({ size: 256 }) ?? null,
      } : null);

      const createdTs = cached?.createdTimestamp ?? message.createdTimestamp ?? null;

      // conteúdo/embeds/components (prioriza cache)
      const contentText = (cached?.content ?? message.content ?? "").toString();
      const embedsArr = (cached?.embeds?.length ? cached.embeds : (Array.isArray(message.embeds) ? message.embeds : []));
      const componentsArr = (cached?.components?.length ? cached.components : (Array.isArray(message.components) ? message.components : []));
      const attachmentsArr = cached?.attachments ?? [];

      // audit
      const audit = await findDeleterViaAuditLogs(guild, message);
      const deleterUser = audit?.executor ?? null;

      // self delete = sem audit
      const selfDelete = !deleterUser;

      // 🔥 detecção robusta de "apagado por bot"
      // - se audit executor é bot => bot
      // - se self delete e autor bot => bot
      // - se self delete e autor desconhecido => assume bot (é o teu caso do sticky/button)
      const deletionByBot =
        (deleterUser?.bot === true) ||
        (selfDelete && authorObj?.bot === true) ||
        (selfDelete && !authorObj); // 👈 chave pra consertar o teu problema

      const targetLogId = deletionByBot ? BOT_LOG_CHANNEL_ID : HUMAN_LOG_CHANNEL_ID;
      const logChannel = await client.channels.fetch(targetLogId).catch(() => null);
      if (!logChannel) return;

      const categoryName = getCategoryName(channel);

      const authorTag = authorObj
        ? `${safe(authorObj.tag, "Desconhecido")} (${authorObj.id})`
        : "Desconhecido";

      const deleterTag = deleterUser
        ? `${deleterUser.tag ?? deleterUser.username} (${deleterUser.id})`
        : selfDelete
          ? (deletionByBot ? "Próprio bot (self-delete)" : "Próprio autor (self-delete)")
          : "Desconhecido";

      const contentFallback = "Mensagem sem conteúdo visível (pode ser embed, anexo, imagem ou botão)";
      const contentForLog = safe(contentText, contentFallback);

      // links bonitos
      const channelLink = channel?.id ? `https://discord.com/channels/${guild.id}/${channel.id}` : null;
      let messageLink = null;
      try { if (message?.url) messageLink = message.url; } catch {}

      // anexos — junta cache + message.attachments
      ensureDirSync(STORAGE_DIR);
      const attachments = [];
      const savedFiles = [];

      // anexos do evento
      if (message.attachments?.size) {
        for (const att of message.attachments.values()) {
          try {
            const url = att.url;
            const name = att.name || `arquivo_${Date.now()}`;
            const cleanName = name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
            const filePath = path.join(STORAGE_DIR, `${guild.id}_${channel.id}_${Date.now()}_${cleanName}`);

            await downloadToFile(url, filePath);
            savedFiles.push({ filePath, originalName: cleanName });
            attachments.push(new AttachmentBuilder(filePath, { name: cleanName }));
          } catch {}
        }
      }

      // anexos do cache (se o evento vier vazio)
      for (const a of attachmentsArr) {
        try {
          if (!a?.url) continue;
          const name = a.name || `arquivo_cache_${Date.now()}`;
          const cleanName = name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
          const filePath = path.join(STORAGE_DIR, `${guild.id}_${channel.id}_${Date.now()}_${cleanName}`);

          await downloadToFile(a.url, filePath);
          savedFiles.push({ filePath, originalName: cleanName });
          attachments.push(new AttachmentBuilder(filePath, { name: cleanName }));
        } catch {}
      }

      // tenta baixar imagem de embed (caso era “só imagem no embed”)
      try {
        const embedImgUrl = embedsArr?.[0]?.image?.url || null;
        if (embedImgUrl) {
          const extMatch = embedImgUrl.split("?")[0].match(/\.(png|jpe?g|gif|webp)$/i);
          const ext = extMatch ? extMatch[1].toLowerCase() : "png";
          const cleanName = `embed_image_${Date.now()}.${ext}`;
          const filePath = path.join(STORAGE_DIR, `${guild.id}_${channel.id}_${cleanName}`);

          await downloadToFile(embedImgUrl, filePath).catch(() => null);
          if (fs.existsSync(filePath)) {
            savedFiles.push({ filePath, originalName: cleanName });
            attachments.push(new AttachmentBuilder(filePath, { name: cleanName }));
          }
        }
      } catch {}

      // reconstrução de embed e lista de botões
      const reconstructedEmbeds = buildReconstructedEmbeds(embedsArr);
      const componentsSummary = summarizeComponents(componentsArr);

      // embed principal
      const embed = new EmbedBuilder()
        .setAuthor({
          name: deletionByBot ? "🤖 Apagado por BOT" : "🧑 Mensagem apagada",
          iconURL: guild.iconURL({ size: 128 }) ?? undefined,
        })
        .setColor(deletionByBot ? 0x5865f2 : 0xff2d55)
        .addFields(
          {
            name: "👤 Autor",
            value: authorObj
              ? `${authorObj.bot ? "🤖" : "🧑"} <@${authorObj.id}>\n\`${authorTag}\``
              : "Desconhecido",
            inline: true,
          },
          {
            name: "🧹 Apagada por",
            value: deleterUser
              ? `${deleterUser.bot ? "🤖" : "🧑"} <@${deleterUser.id}>\n\`${deleterTag}\``
              : `🧑 \`${deleterTag}\``,
            inline: true,
          },
          {
            name: "📍 Local",
            value: `**Servidor:** ${safe(guild.name)}\n**Canal:** <#${channel?.id ?? "0"}>\n**Categoria:** ${safe(categoryName)}`,
            inline: false,
          },
          {
            name: "🕒 Horários",
            value: `**Criada:** ${tsFull(createdTs)}\n**Apagada:** ${tsFull(Date.now())}`,
            inline: false,
          }
        )
        .setFooter({ text: `ID msg: ${safe(message.id)} • ID autor: ${safe(authorObj?.id)}` })
        .setTimestamp(new Date());

      // thumb do autor (cache ou message)
      const thumb = authorObj?.avatar ?? (message.author?.displayAvatarURL?.({ size: 256 }) ?? null);
      if (thumb) embed.setThumbnail(thumb);

      embed.addFields({
        name: "💬 Conteúdo",
        value: `\`\`\`\n${String(contentForLog).slice(0, 1800)}\n\`\`\``,
        inline: false,
      });

      if (componentsSummary) {
        embed.addFields({
          name: "🧷 Componentes / Botões",
          value: componentsSummary.slice(0, 3800),
          inline: false,
        });
      }

      const linkParts = [];
      if (channelLink) linkParts.push(`🔗 **Abrir canal:** ${channelLink}`);
      if (messageLink) linkParts.push(`🧾 **Abrir mensagem:** ${messageLink}`);
      if (linkParts.length) {
        embed.addFields({ name: "🔎 Links", value: linkParts.join("\n"), inline: false });
      }

      if (attachments.length) {
        const first = attachments[0];
        const fileName = first.name;
        if (/\.(png|jpe?g|gif|webp)$/i.test(fileName)) {
          embed.setImage(`attachment://${fileName}`);
        }
      }

      if (audit?.reason) {
        embed.addFields({ name: "📝 Motivo (audit log)", value: safe(audit.reason), inline: false });
      }

      if (savedFiles.length) {
        embed.addFields({
          name: `📎 Anexos salvos (${savedFiles.length})`,
          value: savedFiles.map(f => `• \`${f.originalName}\``).slice(0, 20).join("\n"),
          inline: false,
        });
      }

      const embedsToSend = [embed, ...reconstructedEmbeds].slice(0, 10);

      await logChannel.send({
        embeds: embedsToSend,
        files: attachments.length ? attachments.slice(0, 10) : undefined,
      });
    } catch (err) {
      try {
        const logChannel = await client.channels.fetch(HUMAN_LOG_CHANNEL_ID).catch(() => null);
        if (logChannel) {
          await logChannel.send({
            content: `⚠️ Erro no logger messageDelete: \`${String(err?.message || err).slice(0, 1900)}\``,
          });
        }
      } catch {}
    }
  },
};
