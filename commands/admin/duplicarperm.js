// /application/commands/admin/duplicarperm.js
// SC_CMD — !duplicarperm @cargoOrigem @cargoDestino [motivo...]
//
// ✅ Copia permissões do cargo origem pro cargo destino
// ✅ Copia do CANAL se existir overwrite; senão copia da CATEGORIA (parent)
// ✅ Aplica como { Permissao: true/false } (mais confiável que allow/deny direto)
// ✅ Log em: 1459628931794731266 (com botões)
// ✅ Progresso no chat onde foi usado
// ✅ Motivo obrigatório pra todo mundo, exceto: EU / OWNER / RESP CREATOR
//
// Plug no index.js:
//   import { duplicarPermHandleMessage, duplicarPermHandleInteraction } from "./commands/admin/duplicarperm.js";
//   messageCreate: if (await duplicarPermHandleMessage(message, client)) return;
//   interactionCreate (NO TOPO): if (await duplicarPermHandleInteraction(interaction, client)) return;

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
} from "discord.js";

// ================== CONFIG ==================
const PREFIX = process.env.PREFIX || "!";
const LOG_CHANNEL_ID = "1459628931794731266";

// Quem pode usar (IDs de usuário OU cargos)
const ALLOWED_IDS = new Set([
  "660311795327828008",   // eu
  "1262262852949905408",  // owner
  "1352408327983861844",  // resp creator
  "1262262852949905409",  // resp influ
]);

// Quem NÃO precisa escrever motivo (IDs de usuário OU cargos)
const NO_REASON_IDS = new Set([
  "660311795327828008",   // eu
  "1262262852949905408",  // owner
  "1352408327983861844",  // resp creator
]);

// Cache dos detalhes pro botão
const DATA_DIR = path.resolve("./events/data/admin");
const CACHE_FILE = path.join(DATA_DIR, "duplicarperm_cache.json");
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 3; // 3 dias

// ================== HELPERS ==================
function ensureDataDir() {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}
}

function readCache() {
  ensureDataDir();
  try {
    if (!fs.existsSync(CACHE_FILE)) return {};
    const raw = fs.readFileSync(CACHE_FILE, "utf8");
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeCache(obj) {
  ensureDataDir();
  try { fs.writeFileSync(CACHE_FILE, JSON.stringify(obj, null, 2)); } catch {}
}

function cleanupCache(cache) {
  const now = Date.now();
  let changed = false;
  for (const [k, v] of Object.entries(cache)) {
    const t = Number(v?.createdAt || 0);
    if (!t || now - t > CACHE_TTL_MS) {
      delete cache[k];
      changed = true;
    }
  }
  if (changed) writeCache(cache);
}

function hasAnyId(member, idsSet) {
  if (!member) return false;
  if (idsSet.has(member.id)) return true;
  return member.roles?.cache?.some((r) => idsSet.has(r.id)) ?? false;
}

function pickRole(guild, token) {
  if (!guild || !token) return null;
  const m = token.match(/^<@&(\d+)>$/);
  const id = m?.[1] || (token.match(/^\d+$/) ? token : null);
  if (!id) return null;
  return guild.roles.cache.get(id) || null;
}

function fmtTimeBR(date = new Date()) {
  return date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

// ✅ pega overwrite do cargo origem no canal; se não tiver, tenta na categoria
function getOverwriteFromChannelOrCategory(channel, roleId) {
  if (!channel?.permissionOverwrites?.cache) return null;

  const direct = channel.permissionOverwrites.cache.get(roleId) || null;
  if (direct) return { ov: direct, from: "channel" };

  const parent = channel.parent;
  if (parent?.permissionOverwrites?.cache) {
    const parentOv = parent.permissionOverwrites.cache.get(roleId) || null;
    if (parentOv) return { ov: parentOv, from: "category" };
  }

  return null;
}

// ✅ transforma allow/deny em objeto { PERM: true/false }
function overwriteToPermissionObject(ov) {
  const allowArr = ov?.allow?.toArray?.() ?? [];
  const denyArr = ov?.deny?.toArray?.() ?? [];

  const obj = {};
  for (const p of allowArr) obj[p] = true;
  for (const p of denyArr) obj[p] = false;

  return { obj, allowArr, denyArr };
}

function shortList(arr, max = 10) {
  if (!Array.isArray(arr) || arr.length === 0) return "nenhuma";
  if (arr.length <= max) return arr.join(", ");
  return `${arr.slice(0, max).join(", ")}… (+${arr.length - max})`;
}

// ================== MAIN: MESSAGE ==================
export async function duplicarPermHandleMessage(message, client) {
  try {
    if (!message?.guild || message.author?.bot) return false;

    const content = (message.content || "").trim();
    if (!content.toLowerCase().startsWith(`${PREFIX}duplicarperm`)) return false;

    const member = message.member;

    if (!hasAnyId(member, ALLOWED_IDS)) {
      setTimeout(() => message.delete().catch(() => {}), 1000);
      await message.reply("❌ Você não tem permissão pra usar esse comando.")
        .then(m => setTimeout(() => m.delete().catch(() => {}), 5000))
        .catch(() => {});
      return true;
    }

    const parts = content.split(/\s+/);
    const roleSrcToken = parts[1];
    const roleDstToken = parts[2];

    if (!roleSrcToken || !roleDstToken) {
      await message.reply(
        `❌ Uso correto:\n` +
        `\`${PREFIX}duplicarperm @CargoOrigem @CargoDestino [motivo...]\`\n\n` +
        `Ex:\n\`${PREFIX}duplicarperm <@&1282119104576098314> <@&1459624402231754876> Ajuste de acesso\``
      ).catch(() => {});
      return true;
    }

    const roleSource = pickRole(message.guild, roleSrcToken);
    const roleTarget = pickRole(message.guild, roleDstToken);

    if (!roleSource || !roleTarget) {
      await message.reply("❌ Não consegui achar um dos cargos. Use menção de cargo ou ID.").catch(() => {});
      return true;
    }

    if (roleSource.id === roleTarget.id) {
      await message.reply("❌ Os cargos são iguais. Escolhe um cargo origem e outro destino.").catch(() => {});
      return true;
    }

    const needsReason = !hasAnyId(member, NO_REASON_IDS);
    const reason = parts.slice(3).join(" ").trim();

    if (needsReason && !reason) {
      await message.reply(
        `❌ Você precisa informar um **motivo**.\n` +
        `Uso:\n\`${PREFIX}duplicarperm @origem @destino motivo...\``
      ).catch(() => {});
      return true;
    }

    // Perm do BOT
    const me = await message.guild.members.fetchMe().catch(() => null);
    const botPerms = me?.permissions;
    if (!botPerms?.has(PermissionsBitField.Flags.ManageChannels)) {
      await message.reply("❌ Eu preciso de **MANAGE_CHANNELS** pra editar permissões dos canais.").catch(() => {});
      return true;
    }

    const startedAt = Date.now();
    const progressMsg = await message.channel.send(
      `🔁 **Duplicando permissões (overwrite real do canal/categoria)**...\n` +
      `Origem: ${roleSource} (\`${roleSource.id}\`)\n` +
      `Destino: ${roleTarget} (\`${roleTarget.id}\`)\n` +
      `Por: ${message.author}\n` +
      (needsReason ? `Motivo: **${reason}**\n` : `Motivo: *(dispensado)*\n`) +
      `\n⏳ Iniciando...`
    ).catch(() => null);

    const channels = [...message.guild.channels.cache.values()];

    let scanned = 0;
    let applied = 0;
    let skipped = 0;
    let failed = 0;

    let fromChannel = 0;
    let fromCategory = 0;

    const appliedList = [];
    const failedList = [];

    const UPDATE_EVERY = 10;
    let lastEdit = 0;

    for (const ch of channels) {
      scanned++;

      // ignora threads
      if (ch.isThread?.()) { skipped++; continue; }
      if (!ch.permissionOverwrites?.cache) { skipped++; continue; }

      const got = getOverwriteFromChannelOrCategory(ch, roleSource.id);
      if (!got) { skipped++; continue; }

      const { ov, from } = got;

      const { obj: permissionsToApply, allowArr, denyArr } = overwriteToPermissionObject(ov);

      // se overwrite existir mas tudo neutro (raríssimo), pula
      if (!allowArr.length && !denyArr.length) {
        skipped++;
        continue;
      }

      try {
        // ✅ AQUI É O PULO DO GATO: objeto true/false
        await ch.permissionOverwrites.edit(
          roleTarget.id,
          permissionsToApply,
          {
            reason: `DuplicarPerm: ${message.author.tag} (${message.author.id})` + (reason ? ` | Motivo: ${reason}` : ""),
          }
        );

        applied++;
        if (from === "channel") fromChannel++;
        else fromCategory++;

        appliedList.push({
          id: ch.id,
          name: ch.name,
          from,
          allow: allowArr,
          deny: denyArr,
        });
      } catch (e) {
        failed++;
        failedList.push({
          id: ch.id,
          name: ch.name,
          err: e?.message ? String(e.message).slice(0, 200) : String(e).slice(0, 200),
        });
      }

      if (progressMsg && scanned % UPDATE_EVERY === 0) {
        const now = Date.now();
        if (now - lastEdit > 1200) {
          lastEdit = now;
          await progressMsg.edit(
            `🔁 **Duplicando permissões**...\n` +
            `Origem: ${roleSource} → Destino: ${roleTarget}\n` +
            `📌 Progresso: **${scanned}/${channels.length}**\n` +
            `✅ Aplicados: **${applied}** (canal: **${fromChannel}**, categoria: **${fromCategory}**)\n` +
            `⏭️ Sem overwrite na origem: **${skipped}** | ❌ Falhas: **${failed}**`
          ).catch(() => {});
        }
      }
    }

    const ms = Date.now() - startedAt;

    if (progressMsg) {
      await progressMsg.edit(
        `✅ **Concluído!**\n` +
        `Origem: ${roleSource} (\`${roleSource.id}\`)\n` +
        `Destino: ${roleTarget} (\`${roleTarget.id}\`)\n` +
        `Por: ${message.author}\n` +
        (needsReason ? `Motivo: **${reason}**\n` : `Motivo: *(dispensado)*\n`) +
        `\n📊 Resultado:\n` +
        `🔎 Analisados: **${channels.length}**\n` +
        `✅ Copiados: **${applied}** (canal: **${fromChannel}**, categoria: **${fromCategory}**)\n` +
        `⏭️ Sem overwrite: **${skipped}**\n` +
        `❌ Falhas: **${failed}**\n` +
        `⏱️ Tempo: **${(ms / 1000).toFixed(1)}s**`
      ).catch(() => {});
    }

    // ============ LOG ============
    const logChannel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    const token = crypto.randomBytes(8).toString("hex");

    const cache = readCache();
    cleanupCache(cache);

    cache[token] = {
      createdAt: Date.now(),
      guildId: message.guild.id,
      executorId: message.author.id,
      executorTag: message.author.tag,
      usedAtChannelId: message.channel.id,
      usedAtMessageUrl: message.url,

      roleSource: { id: roleSource.id, name: roleSource.name },
      roleTarget: { id: roleTarget.id, name: roleTarget.name },

      reason: needsReason ? reason : null,

      stats: {
        scanned: channels.length,
        applied,
        skipped,
        failed,
        fromChannel,
        fromCategory,
        ms,
      },

      appliedList: appliedList.slice(0, 250),
      failedList: failedList.slice(0, 80),
    };

    writeCache(cache);

    if (logChannel?.isTextBased?.()) {
      const embed = new EmbedBuilder()
        .setTitle("🔐 Duplicação de Permissões (Cargo → Cargo)")
        .setColor(0xff009a)
        .setThumbnail(message.author.displayAvatarURL({ size: 256 }))
        .addFields(
          { name: "👤 Quem usou", value: `${message.author}\n\`${message.author.tag}\`\n\`${message.author.id}\``, inline: true },
          { name: "📍 Onde usou", value: `${message.channel}\n\`${message.channel.id}\``, inline: true },
          { name: "🕒 Quando", value: `\`${fmtTimeBR(new Date())}\``, inline: true },

          { name: "🧩 Cargo copiado (origem)", value: `${roleSource}\n\`${roleSource.id}\``, inline: true },
          { name: "📥 Cargo que recebeu (destino)", value: `${roleTarget}\n\`${roleTarget.id}\``, inline: true },
          { name: "📝 Motivo", value: needsReason ? `**${reason}**` : "*Dispensado (EU/OWNER/RESP CREATOR)*", inline: false },

          {
            name: "📊 Resultado",
            value:
              `🔎 Analisados: **${channels.length}**\n` +
              `✅ Copiados: **${applied}**\n` +
              `• do canal: **${fromChannel}**\n` +
              `• da categoria: **${fromCategory}**\n` +
              `⏭️ Sem overwrite: **${skipped}**\n` +
              `❌ Falhas: **${failed}**\n` +
              `⏱️ Tempo: **${(ms / 1000).toFixed(1)}s**`,
            inline: false,
          }
        )
        .setFooter({ text: "SantaCreators • Admin Logs" });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel("📌 Abrir mensagem do comando").setStyle(ButtonStyle.Link).setURL(message.url),
        new ButtonBuilder().setCustomId(`dupperm_details:${token}`).setLabel("📋 Ver detalhes").setStyle(ButtonStyle.Secondary),
      );

      await logChannel.send({ embeds: [embed], components: [row] }).catch(() => {});
    }

    return true;
  } catch (err) {
    console.error("[duplicarperm] erro:", err);
    try {
      await message.reply(`❌ Erro no comando: \`${err?.message ?? err}\``).catch(() => {});
    } catch {}
    return true;
  }
}

// ================== BUTTON HANDLER (LOG) ==================
export async function duplicarPermHandleInteraction(interaction, client) {
  try {
    if (!interaction?.isButton?.()) return false;
    const id = interaction.customId || "";
    if (!id.startsWith("dupperm_details:")) return false;

    // ✅ evita "interação falhou"
    await interaction.deferReply({ ephemeral: true }).catch(() => {});

    const token = id.split(":")[1];
    if (!token) {
      await interaction.editReply({ content: "❌ Token inválido." }).catch(() => {});
      return true;
    }

    const member = interaction.member;
    if (!hasAnyId(member, ALLOWED_IDS)) {
      await interaction.editReply({ content: "❌ Você não tem permissão pra ver os detalhes." }).catch(() => {});
      return true;
    }

    const cache = readCache();
    cleanupCache(cache);
    const data = cache[token];

    if (!data || data.guildId !== interaction.guildId) {
      await interaction.editReply({ content: "❌ Detalhes não encontrados (expirou ou não é deste servidor)." }).catch(() => {});
      return true;
    }

    const stats = data.stats || {};
    const appliedList = Array.isArray(data.appliedList) ? data.appliedList : [];
    const failedList = Array.isArray(data.failedList) ? data.failedList : [];

    const appliedPreview = appliedList.slice(0, 25).map((c, i) => {
      const allow = shortList(c.allow, 6);
      const deny = shortList(c.deny, 6);
      return `**${i + 1}.** ✅ <#${c.id}> • origem: **${c.from}**\n- 🔓 allow: \`${allow}\`\n- 🔒 deny: \`${deny}\``;
    }).join("\n\n");

    const failedPreview = failedList.slice(0, 15).map((c) => `❌ <#${c.id}> — \`${c.err}\``).join("\n");

    const msgUrl = data.usedAtMessageUrl;
    const src = data.roleSource;
    const dst = data.roleTarget;

    const text =
      `🔐 **Detalhes da duplicação**\n` +
      `👤 Executor: <@${data.executorId}> (\`${data.executorTag}\`)\n` +
      `📍 Canal: <#${data.usedAtChannelId}>\n` +
      `🧩 Origem: <@&${src.id}> (\`${src.id}\`)\n` +
      `📥 Destino: <@&${dst.id}> (\`${dst.id}\`)\n` +
      `📝 Motivo: ${data.reason ? `**${data.reason}**` : "*Dispensado*"}\n\n` +
      `📊 **Stats**\n` +
      `🔎 Analisados: **${stats.scanned ?? 0}**\n` +
      `✅ Copiados: **${stats.applied ?? 0}** (canal: **${stats.fromChannel ?? 0}**, categoria: **${stats.fromCategory ?? 0}**)\n` +
      `⏭️ Sem overwrite: **${stats.skipped ?? 0}**\n` +
      `❌ Falhas: **${stats.failed ?? 0}**\n` +
      `⏱️ Tempo: **${((stats.ms ?? 0) / 1000).toFixed(1)}s**\n\n` +
      `📌 **Primeiros canais alterados**\n` +
      (appliedPreview || "*nenhum*") +
      `\n\n⚠️ **Falhas**\n` +
      (failedPreview || "*nenhuma*");

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel("📌 Abrir mensagem do comando").setStyle(ButtonStyle.Link).setURL(msgUrl || "https://discord.com")
    );

    await interaction.editReply({ content: text, components: [row] }).catch(() => {});
    return true;
  } catch (err) {
    console.error("[duplicarperm_details] erro:", err);
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: `❌ Erro ao abrir detalhes: \`${err?.message ?? err}\`` }).catch(() => {});
      } else {
        await interaction.reply({ content: `❌ Erro ao abrir detalhes: \`${err?.message ?? err}\``, ephemeral: true }).catch(() => {});
      }
    } catch {}
    return true;
  }
}
