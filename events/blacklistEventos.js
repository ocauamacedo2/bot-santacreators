// d:\bots\events\blacklistEventos.js

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  escapeMarkdown
} from "discord.js";

///teste
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ================= CONFIG =================
const CHANNEL_DISPLAY_ID = "1470953978790412462";
const CHANNEL_LOGS_ID = "1470954366507683891";

const GIF_URL = "https://media.discordapp.net/attachments/1362477839944777889/1384245215249825832/standard_2rss.gif";
const COLOR_THEME = "#9b59b6"; // Roxo SantaCreators

// Quem pode ADICIONAR/REMOVER
const ALLOWED_ROLES = [
  "1282119104576098314",
  "1352408327983861844",
  "1262262852949905409",
  "1352407252216184833",
  "1388976314253312100",
];

const ALLOWED_USERS = [
  "660311795327828008", // Eu
  "1262262852949905408", // Owner
];

// Quem recebe NOTIFICAÇÃO (se online)
const NOTIFY_ROLES = [
  "1282119104576098314",
  "1352408327983861844",
  "1262262852949905409",
  "1352407252216184833",
  "1388976314253312100",
  "1352385500614234134",
];

const DATA_FILE = path.resolve(__dirname, "../data/blacklist_eventos.json");

// ================= STATE / DATA =================
function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return { list: [], messageIds: [] };
    }

    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

    // Garante compatibilidade com versão antiga
    if (!Array.isArray(data.messageIds)) {
      data.messageIds = [];
    }

    if (!Array.isArray(data.list)) {
      data.list = [];
    }

    return data;

  } catch (err) {
    console.error("[BlacklistEventos] Erro loadData:", err);
    return { list: [], messageIds: [] };
  }
}
function saveData(data) {
  try {
    const dir = path.dirname(DATA_FILE);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("[BlacklistEventos] Erro saveData:", err);
  }
}

// ================= HELPERS =================
// ================= HELPERS =================
function hasPermission(member) {
  if (!member) return false;
  if (ALLOWED_USERS.includes(member.id)) return true;
  return member.roles?.cache?.some((r) => ALLOWED_ROLES.includes(r.id)) || false;
}

// 🔒 Mutex global pra evitar race condition (add/remove ao mesmo tempo)
if (!globalThis.__BL_EVT_MUTEX__) globalThis.__BL_EVT_MUTEX__ = Promise.resolve();

function withBlacklistLock(fn) {
  const run = async () => {
    try {
      return await fn();
    } catch (e) {
      throw e;
    }
  };

  const chained = globalThis.__BL_EVT_MUTEX__.then(run, run);
  // mantém a cadeia viva mesmo se der erro
  globalThis.__BL_EVT_MUTEX__ = chained.catch(() => {});
  return chained;
}

// 🧼 normaliza ID (aceita "123", "<@123>", "<@!123>")
function parseUserId(input) {
  const raw = String(input || "").trim();
  const m = raw.match(/^<@!?(\d+)>$/);
  if (m) return m[1];
  // se vier com lixo, tenta extrair dígitos
  const digits = raw.replace(/[^\d]/g, "");
  return digits.length ? digits : raw;
}

function truncate(text, max = 30) {
  if (!text) return null;
  return text.length > max ? text.slice(0, max) + "…" : text;
}

function formatEntry(entry) {
  const parts = [];

  const safeName = entry.name && entry.name.trim().length > 0
    ? escapeMarkdown(entry.name.trim())
    : "SEM NOME";

  const safeOrg = entry.org && entry.org.trim().length > 0
    ? escapeMarkdown(entry.org.trim())
    : "—";

  parts.push(`🆔 \`${entry.id}\``);
  parts.push(`👤 **${safeName}**`);
  parts.push(`🏢 ${safeOrg}`);

  if (entry.addedBy) parts.push(`👮 <@${entry.addedBy}>`);

  return `• ${parts.join(" | ")}`;
}

// ================= UI BUILDERS =================
function buildDisplayMessages(list) {
  const header = "**🚫 LISTA NEGRA — EVENTOS NOBRE**\nPessoas proibidas de participar dos eventos Santa Creators NOBRE.\n\n";
  const MAX = 1900;

  if (list.length === 0) {
    return [header + "_Nenhuma pessoa banida no momento._\n" + GIF_URL];
  }

  const lines = list.map(formatEntry);
  const chunks = [];
  let currentText = header;

  for (const line of lines) {
    if ((currentText + line + "\n").length > MAX) {
      chunks.push(currentText);
      currentText = "";
    }
    currentText += line + "\n";
  }

  if (currentText.length > 0) {
    chunks.push(currentText);
  }

  // Adiciona GIF no final
  const lastIdx = chunks.length - 1;
  if ((chunks[lastIdx] + "\n" + GIF_URL).length <= 2000) {
    chunks[lastIdx] += "\n" + GIF_URL;
  } else {
    chunks.push(GIF_URL);
  }

  return chunks;
}



function buildControls() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("bl_evt_add")
      .setLabel("Adicionar à Blacklist")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("➕"),
    new ButtonBuilder()
      .setCustomId("bl_evt_remove")
      .setLabel("Remover da Blacklist")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("➖")
  );
}

// ================= CORE FUNCTIONS =================
async function updateDisplay(client) {
  const data = loadData();

  const channel = await client.channels.fetch(CHANNEL_DISPLAY_ID).catch(() => null);
  if (!channel || !channel.isTextBased()) return { url: null };

  const contents = buildDisplayMessages(data.list);
  const rows = [buildControls()];

  if (!Array.isArray(data.messageIds)) data.messageIds = [];

  let firstMessageUrl = null;

  for (let messageIndex = 0; messageIndex < contents.length; messageIndex++) {
    const text = contents[messageIndex];
    const isLast = messageIndex === contents.length - 1;

    const payload = {
      content: text,
      embeds: [],
      components: isLast ? rows : []
    };

    let msg = null;
    const existingId = data.messageIds[messageIndex];

    if (existingId) {
      msg = await channel.messages.fetch(existingId).catch(() => null);
    }

    if (msg) {
      await msg.edit(payload).catch(() => null);
    } else {
      const newMsg = await channel.send(payload).catch(() => null);
      if (newMsg) {
        data.messageIds[messageIndex] = newMsg.id;
        msg = newMsg;
      }
    }

    if (!firstMessageUrl && msg?.url) firstMessageUrl = msg.url;
  }

  // apaga mensagens extras antigas (se sobrou)
  if (data.messageIds.length > contents.length) {
    const extras = data.messageIds.slice(contents.length);
    for (const mid of extras) {
      const oldMsg = await channel.messages.fetch(mid).catch(() => null);
      if (oldMsg) await oldMsg.delete().catch(() => {});
    }
    data.messageIds = data.messageIds.slice(0, contents.length);
  }

  saveData(data);
  return { url: firstMessageUrl };
}



async function notifyStaff(client, guild, action, entry, actor) {
  try {
    const membersSet = new Map();

    for (const roleId of NOTIFY_ROLES) {
      const role = await guild.roles.fetch(roleId).catch(() => null);
      if (!role) continue;

      for (const [id, member] of role.members) {
        membersSet.set(id, member);
      }
    }

    const onlineMembers = [...membersSet.values()].filter((m) => {
      if (!m || m.user?.bot) return false;
      const status = m.presence?.status; // precisa intents/presence habilitado pra ficar preciso
      return status === "online" || status === "idle" || status === "dnd";
    });

    const title = action === "ADD" ? "🚫 Nova Adição à Blacklist" : "✅ Remoção da Blacklist";
    const color = action === "ADD" ? "#ff0000" : "#00ff00";

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(title)
      .setDescription(
        `**👮 Responsável:** ${actor}\n` +
        `**🚫 Banido:** ${entry.name || "Sem nome"} (ID: \`${entry.id}\`)\n` +
        `**🏢 Organização:** ${entry.org || "—"}`
      )
      .setTimestamp();

    for (const member of onlineMembers) {
      member.send({ embeds: [embed] }).catch(() => {});
    }
  } catch (e) {
    console.error("[BlacklistEventos] Erro ao notificar staff:", e);
  }
}


async function logAction(client, guild, action, entry, actor, displayMsgUrl) {
  const channel = await client.channels.fetch(CHANNEL_LOGS_ID).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  const title = action === "ADD" ? "🚫 Adicionado à Blacklist" : "✅ Removido da Blacklist";
  const color = action === "ADD" ? "#800080" : "#9b59b6"; // Roxo escuro / Roxo claro

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`💜 LOG BLACKLIST — ${action}`)
    .setThumbnail(actor.displayAvatarURL())
    .addFields(
      { name: "👮 Responsável", value: `${actor} (\`${actor.id}\`)`, inline: true },
      { name: "🚫 ID Banido", value: `\`${entry.id}\``, inline: true },
      { name: "📝 Nome", value: entry.name ? escapeMarkdown(entry.name) : "—", inline: true },
      { name: "🏢 Organização", value: entry.org || "—", inline: true },
      { name: "🕒 Data", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
    )
    .setImage(GIF_URL)
    .setFooter({ text: "SantaCreators • Logs Blacklist" })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel("Ir para Lista")
      .setStyle(ButtonStyle.Link)
      .setURL(displayMsgUrl || "https://discord.com")
  );

  await channel.send({ embeds: [embed], components: [row] });
}

// ================= EXPORTS =================
export async function blacklistEventosOnReady(client) {
  await updateDisplay(client);
}

export async function blacklistEventosHandleInteraction(interaction, client) {
  if (!interaction.guild) return false;

  // 1. Botões
  if (interaction.isButton()) {
    if (interaction.customId === "bl_evt_add") {
      if (!hasPermission(interaction.member)) {
        return interaction.reply({ content: "🚫 Sem permissão.", ephemeral: true });
      }

      const modal = new ModalBuilder()
        .setCustomId("modal_bl_evt_add")
        .setTitle("Adicionar à Blacklist");

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("bl_id")
            .setLabel("ID da Pessoa (Obrigatório)")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
  .setCustomId("bl_nome")
  .setLabel("Nome da Pessoa (Obrigatório)")
  .setStyle(TextInputStyle.Short)
  .setRequired(true)
  .setMinLength(2)
  .setMaxLength(25)

        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("bl_org")
            .setLabel("Nome da Organização (Opcional)")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
        )
      );

      await interaction.showModal(modal);
      return true;
    }

    if (interaction.customId === "bl_evt_remove") {
      if (!hasPermission(interaction.member)) {
        return interaction.reply({ content: "🚫 Sem permissão.", ephemeral: true });
      }

      const modal = new ModalBuilder()
        .setCustomId("modal_bl_evt_remove")
        .setTitle("Remover da Blacklist");

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("bl_id_remove")
            .setLabel("ID da Pessoa para remover")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      );

      await interaction.showModal(modal);
      return true;
    }
  }

  // 2. Modais
  if (interaction.isModalSubmit()) {
    if (interaction.customId === "modal_bl_evt_add") {
      await interaction.deferReply({ ephemeral: true });

      return withBlacklistLock(async () => {
        try {
          const id = parseUserId(interaction.fields.getTextInputValue("bl_id"));
          const nomeRaw = interaction.fields.getTextInputValue("bl_nome");
          const nome = (nomeRaw || "").trim();

          if (!nome || nome.length < 2) {
            await interaction.editReply("⚠️ Nome inválido.");
            return true;
          }

          const org = (interaction.fields.getTextInputValue("bl_org") || "").trim();

          const data = loadData();

          if (data.list.some((e) => String(e.id) === String(id))) {
            await interaction.editReply("⚠️ Esse ID já está na blacklist.");
            return true;
          }

          const entry = {
            id: String(id),
            name: nome,
            org: org,
            addedBy: interaction.user.id,
            at: Date.now()
          };

          data.list.push(entry);
          saveData(data);

          const msg = await updateDisplay(client).catch((e) => {
            console.error("Erro updateDisplay:", e);
            return { url: null };
          });

          await logAction(client, interaction.guild, "ADD", entry, interaction.user, msg?.url).catch(() => {});
          await notifyStaff(client, interaction.guild, "ADD", entry, interaction.user).catch(() => {});

          await interaction.editReply(`✅ ID **${entry.id}** adicionado à blacklist.`);
          return true;

        } catch (err) {
          console.error("Erro no modal ADD blacklist:", err);
          await interaction.editReply("❌ Ocorreu um erro ao adicionar. Verifique o console.").catch(() => {});
          return true;
        }
      });
    }

    if (interaction.customId === "modal_bl_evt_remove") {
      await interaction.deferReply({ ephemeral: true });

      return withBlacklistLock(async () => {
        try {
          const id = parseUserId(interaction.fields.getTextInputValue("bl_id_remove"));

          const data = loadData();
          const index = data.list.findIndex((e) => String(e.id) === String(id));

          if (index === -1) {
            await interaction.editReply("⚠️ ID não encontrado na blacklist.");
            return true;
          }

          const removedEntry = data.list[index];
          data.list.splice(index, 1);
          saveData(data);

          const msg = await updateDisplay(client).catch((e) => {
            console.error("Erro updateDisplay:", e);
            return { url: null };
          });

          await logAction(client, interaction.guild, "REMOVE", removedEntry, interaction.user, msg?.url).catch(() => {});
          await notifyStaff(client, interaction.guild, "REMOVE", removedEntry, interaction.user).catch(() => {});

          await interaction.editReply(`✅ ID **${removedEntry.id}** removido da blacklist.`);
          return true;

        } catch (err) {
          console.error("Erro no modal REMOVE blacklist:", err);
          await interaction.editReply("❌ Ocorreu um erro ao remover. Verifique o console.").catch(() => {});
          return true;
        }
      });
    }
  }

  return false;
}
