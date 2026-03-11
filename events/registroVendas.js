// d:\bots\events\registroVendas.js
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
  AttachmentBuilder,
  PermissionsBitField,
} from "discord.js";
import { dashEmit } from "../utils/dashHub.js";
import { resolveLogChannel } from "./channelResolver.js";

// ================= CONFIGURAÇÃO =================
const LOG_CHANNEL_ID = "1475237983782179028"; // Canal de Logs
const PANEL_CHANNEL_ID = "1475240261796892894"; // Canal do Painel Fixo

const COOLDOWN_MS = 60 * 60 * 1000; // 1 hora (para pontuar no GeralDash)
const COLOR_THEME = "#9b59b6"; // Roxo

// Quem pode REGISTRAR (usar o botão de venda)
const REGISTER_USER_IDS = ["660311795327828008", "1262262852949905408"];
const REGISTER_ROLE_IDS = [
  "1352275728476930099", // SantaCreators
  "1352408327983861844", // Resp Creators
  "1262262852949905409", // Resp Influ
  "1352407252216184833", // Resp Lider
];

// Quem pode GERENCIAR (Admin: !painelvendas, editar, remover)
const ADMIN_USER_IDS = ["660311795327828008", "1262262852949905408"];
const ADMIN_ROLE_IDS = ["1352408327983861844"]; // Resp Creators

// ================= PERSISTÊNCIA =================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, "../data");
const STATE_FILE = path.join(DATA_DIR, "vendas_state.json");

function ensureDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (e) {
    console.error("[Vendas] ERRO ensureDir()", "DATA_DIR=", DATA_DIR, e);
    throw e;
  }
}

function loadState() {
  ensureDir();

  // ✅ se o arquivo existir mas estiver corrompido, renomeia e recria limpo
  try {
    if (!fs.existsSync(STATE_FILE)) return { sales: {}, panelMsgId: null, lastScore: {} };

    const raw = fs.readFileSync(STATE_FILE, "utf8");
    const parsed = JSON.parse(raw);

    // garante shape
    if (!parsed || typeof parsed !== "object") return { sales: {}, panelMsgId: null, lastScore: {} };
    if (!parsed.sales || typeof parsed.sales !== "object") parsed.sales = {};
    if (!parsed.lastScore || typeof parsed.lastScore !== "object") parsed.lastScore = {};
    if (!("panelMsgId" in parsed)) parsed.panelMsgId = null;

    return parsed;
  } catch (e) {
    console.error("[Vendas] ERRO loadState()", "STATE_FILE=", STATE_FILE, e);

    // backup do arquivo ruim
    try {
      const badName = `vendas_state.BAD_${Date.now()}.json`;
      const badPath = path.join(DATA_DIR, badName);
      if (fs.existsSync(STATE_FILE)) fs.renameSync(STATE_FILE, badPath);
      console.error("[Vendas] State corrompido -> movido para:", badPath);
    } catch (e2) {
      console.error("[Vendas] Falha ao mover state corrompido:", e2);
    }

    // recria limpo
    const fresh = { sales: {}, panelMsgId: null, lastScore: {} };
    try {
      saveState(fresh);
    } catch {}
    return fresh;
  }
}

function saveState(data) {
  ensureDir();

  // ✅ escrita atômica (evita arquivo quebrar se o bot cair no meio)
  const tmp = `${STATE_FILE}.tmp`;

  try {
    const json = JSON.stringify(data, null, 2);
    fs.writeFileSync(tmp, json, "utf8");
    fs.renameSync(tmp, STATE_FILE);
  } catch (e) {
    console.error("[Vendas] ERRO saveState()", "STATE_FILE=", STATE_FILE, "TMP=", tmp, e);

    // tenta limpar tmp
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch {}

    throw e;
  }
}

// ================= HELPERS =================
function parseValue(str) {
  if (!str) return 0;
  let s = str.toLowerCase().replace(/\s/g, "").replace(/,/g, ".");
  let mult = 1;

  if (s.includes("kk") || s.includes("m") || s.includes("milhao")) {
    mult = 1_000_000;
    s = s.replace(/kk|milhao|milhão|m/g, "");
  } else if (s.includes("k") || s.includes("mil")) {
    mult = 1_000;
    s = s.replace(/k|mil/g, "");
  } else if (s.includes("b") || s.includes("bi")) {
    mult = 1_000_000_000;
    s = s.replace(/bi|bilhao|bilhão|b/g, "");
  }

  const val = parseFloat(s);
  return isNaN(val) ? 0 : val * mult;
}

function formatValue(num) {
  const abs = Math.abs(num);
  const sign = num < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}${parseFloat((abs / 1_000_000_000).toFixed(1))}B`;
  if (abs >= 1_000_000) return `${sign}${parseFloat((abs / 1_000_000).toFixed(1))}KK`;
  if (abs >= 1_000) return `${sign}${parseFloat((abs / 1_000).toFixed(1))}K`;
  return num.toLocaleString("pt-BR");
}

function canRegister(member) {
  if (!member) return false;
  if (REGISTER_USER_IDS.includes(member.id)) return true;
  return member.roles.cache.some((r) => REGISTER_ROLE_IDS.includes(r.id));
}

function isAdmin(member) {
  if (!member) return false;
  if (ADMIN_USER_IDS.includes(member.id)) return true;
  return member.roles.cache.some((r) => ADMIN_ROLE_IDS.includes(r.id));
}

// ================= LÓGICA DE PONTUAÇÃO =================
function checkCooldown(userId, state) {
  const now = Date.now();
  const last = state.lastScore?.[userId] || 0;
  const diff = now - last;
  
  if (diff < COOLDOWN_MS) {
    return { scored: false, remaining: COOLDOWN_MS - diff };
  }
  return { scored: true, remaining: 0 };
}

// ================= UI BUILDERS =================
function buildPanelEmbed(state) {
  // Calcula Top 10
  const ranking = Object.entries(state.sales)
    .map(([id, data]) => ({ id, total: data.total || 0 }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  const topText = ranking.length
    ? ranking
        .map((r, i) => {
          const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `**${i + 1}.**`;
          return `${medal} <@${r.id}> — **$${formatValue(r.total)}**`;
        })
        .join("\n")
    : "_Nenhuma venda registrada ainda._";

  return new EmbedBuilder()
    .setColor(COLOR_THEME)
    .setTitle("💰 Painel de Vendas & Ranking")
    .setDescription(
      `Registre suas vendas aqui para contabilizar no ranking e na meta.\n\n` +
      `🏆 **TOP 10 VENDEDORES**\n${topText}`
    )
    .setImage("https://media.discordapp.net/attachments/1362477839944777889/1384245215249825832/standard_2rss.gif")
    .setFooter({ text: "SantaCreators • Sistema de Vendas" })
    .setTimestamp();
}

function buildPanelRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("vendas_registrar")
      .setLabel("Registrar Venda")
      .setStyle(ButtonStyle.Success)
      .setEmoji("💸"),
    new ButtonBuilder()
      .setCustomId("vendas_refresh")
      .setLabel("Atualizar Ranking")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("🔄"),
    new ButtonBuilder()
      .setCustomId("vendas_admin_menu")
      .setLabel("Gerenciar (Admin)")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("⚙️")
  );
}

// ================= CORE FUNCTIONS =================

async function updatePanel(client) {
  const state = loadState();
  const channel = await client.channels.fetch(PANEL_CHANNEL_ID).catch(() => null);
  if (!channel) {
    console.error(`[Vendas] Erro: Canal do painel ${PANEL_CHANNEL_ID} não encontrado.`);
    return;
  }

  const embed = buildPanelEmbed(state);
  const row = buildPanelRow();

  if (state.panelMsgId) {
    const msg = await channel.messages.fetch(state.panelMsgId).catch(() => null);
    if (msg) {
      await msg.edit({ embeds: [embed], components: [row] });
      return;
    }
  }

  const newMsg = await channel.send({ embeds: [embed], components: [row] });
  state.panelMsgId = newMsg.id;
  saveState(state);
}

async function logSale(client, interaction, data, scoreInfo) {
  const channel = await resolveLogChannel(client, LOG_CHANNEL_ID);
  if (!channel) {
    console.error(`[Vendas] Erro: Canal de logs ${LOG_CHANNEL_ID} não encontrado.`);
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(COLOR_THEME)
    .setTitle("💰 Registro de Venda")
    .setThumbnail(interaction.user.displayAvatarURL())
    .addFields(
      { name: "👤 Vendedor", value: `<@${interaction.user.id}>`, inline: true },
      { name: "📦 Item", value: data.item, inline: true },
      { name: "🔢 Quantidade", value: data.qtd, inline: true },
      { name: "💵 Valor Depositado", value: `**$${formatValue(data.value)}**`, inline: true },
      { name: "📅 Data", value: data.date, inline: true },
      { 
        name: "🧠 Anti-farm (Pontos)", 
        value: scoreInfo.scored ? "✅ Pontuou (+1)" : `⏳ Cooldown (${Math.ceil(scoreInfo.remaining / 60000)}m)`, 
        inline: false 
      }
    )
    .setFooter({ text: `ID: ${interaction.user.id} • Log de Vendas` })
    .setTimestamp();

  if (data.image) embed.setImage(data.image);

  // Botão para editar valor (Admin) - Mantido no log para ajustes rápidos pontuais
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`vendas_edit_${interaction.user.id}_${Date.now()}`) // ID único fake pra log
      .setLabel("Editar Total (Admin)")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("✏️")
  );

  await channel.send({ embeds: [embed], components: [row] });
}

async function logAdminAction(client, interaction, targetId, actionLabel, amount, oldTotal, newTotal) {
  const channel = await resolveLogChannel(client, LOG_CHANNEL_ID);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(actionLabel === "Adicionar" ? "#2ecc71" : "#e74c3c")
    .setTitle("🔧 Ajuste Administrativo de Vendas")
    .setThumbnail(interaction.user.displayAvatarURL())
    .addFields(
      { name: "👮 Admin", value: `<@${interaction.user.id}>`, inline: true },
      { name: "👤 Alvo", value: `<@${targetId}>`, inline: true },
      { name: "📝 Ação", value: actionLabel.toUpperCase(), inline: true },
      { name: "💰 Valor", value: `**$${formatValue(amount)}**`, inline: true },
      { name: "📉 Antes", value: `**$${formatValue(oldTotal)}**`, inline: true },
      { name: "📈 Depois", value: `**$${formatValue(newTotal)}**`, inline: true }
    )
    .setFooter({ text: `ID Alvo: ${targetId} • Log Admin` })
    .setTimestamp();

  await channel.send({ embeds: [embed] });
}

// ================= EXPORTS =================

export async function registroVendasOnReady(client) {
  await updatePanel(client);
}

export async function registroVendasHandleMessage(message, client) {
  if (!message.guild || message.author.bot) return false;
  
  if (message.content === "!painelvendas") {
    if (!isAdmin(message.member)) {
      setTimeout(() => message.delete().catch(() => {}), 1000);
      const msg = await message.reply("❌ Você não tem permissão para usar este comando.");
      setTimeout(() => msg.delete().catch(() => {}), 5000);
      return true;
    }
    await message.delete().catch(() => {});
    
    // Força recriar no canal atual se quiser mudar, ou apenas atualiza o fixo
    // Aqui vamos apenas atualizar o fixo definido na config
    await updatePanel(client);
    const m = await message.channel.send("✅ Painel de vendas atualizado/enviado.");
    setTimeout(() => m.delete().catch(() => {}), 5000);
    return true;
  }
  return false;
}

export async function registroVendasHandleInteraction(interaction, client) {
  if (!interaction.guild) return false;

  // 1. Botão Registrar
  if (interaction.isButton() && interaction.customId === "vendas_registrar") {
    if (!canRegister(interaction.member)) {
      return interaction.reply({ content: "🚫 Você não tem permissão para registrar vendas.", ephemeral: true });
    }

    const modal = new ModalBuilder()
      .setCustomId("modal_vendas")
      .setTitle("Registrar Venda");

    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("item").setLabel("O que foi vendido?").setPlaceholder("Ex: Munição de AK").setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("qtd").setLabel("Quantidade").setPlaceholder("Ex: 500").setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("valor").setLabel("Quanto depositou? (Aceita k, kk, m)").setPlaceholder("Ex: 10kk").setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("data").setLabel("Data da Venda").setPlaceholder("DD/MM").setStyle(TextInputStyle.Short).setRequired(true))
    );

    await interaction.showModal(modal);
    return true;
  }

  // 2. Botão Refresh
  if (interaction.isButton() && interaction.customId === "vendas_refresh") {
    await interaction.deferReply({ ephemeral: true });
    await updatePanel(client);
    await interaction.editReply("✅ Ranking atualizado!");
    return true;
  }

  // 3. Botão Admin Menu (Gerenciar)
  if (interaction.isButton() && interaction.customId === "vendas_admin_menu") {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ content: "🚫 Apenas admins podem gerenciar.", ephemeral: true });
    }
    
    const modal = new ModalBuilder()
      .setCustomId("modal_vendas_admin_adjust")
      .setTitle("Ajustar Saldo de Vendas");
    
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("action_type").setLabel("Ação (Escreva: Adicionar ou Remover)").setStyle(TextInputStyle.Short).setPlaceholder("Adicionar / Remover").setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("target_id").setLabel("ID do Usuário").setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("amount").setLabel("Quantidade (ex: 10kk)").setStyle(TextInputStyle.Short).setRequired(true))
    );
    await interaction.showModal(modal);
    return true;
  }

  // 4. Botão Editar (Log - Legacy/Quick Edit)
  if (interaction.isButton() && interaction.customId.startsWith("vendas_edit_")) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ content: "🚫 Apenas admins podem editar valores.", ephemeral: true });
    }
    
    const targetId = interaction.customId.split("_")[2];
    const modal = new ModalBuilder()
      .setCustomId(`modal_vendas_edit_${targetId}`)
      .setTitle("Definir Valor Total do Usuário");

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("new_total")
          .setLabel("Novo Valor Total (Aceita k, kk)")
          .setPlaceholder("Ex: 50kk")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );

    await interaction.showModal(modal);
    return true;
  }

  // 5. Modal Submit (Registro)
  if (interaction.isModalSubmit() && interaction.customId === "modal_vendas") {
   const item = interaction.fields.getTextInputValue("item");
const qtd = interaction.fields.getTextInputValue("qtd");
const valorRaw = interaction.fields.getTextInputValue("valor");
const date = interaction.fields.getTextInputValue("data"); // ✅ agora é "date"

const value = parseValue(valorRaw);
if (value <= 0) {
  return interaction.reply({ content: "❌ Valor inválido. Use formatos como 100k, 1kk, 1.5m.", ephemeral: true });
}

    // Pergunta da imagem (Collector)
    await interaction.reply({ 
      content: "📸 **Envie o print do depósito neste canal em até 2 minutos** (Opcional).\nSe não quiser enviar, apenas aguarde ou envie qualquer mensagem de texto para pular.", 
      ephemeral: true 
    });

    // Verifica se o canal existe (segurança)
    if (!interaction.channel) {
      console.error("[Vendas] Canal da interação não encontrado.");
      return true;
    }

    const filter = m => m.author.id === interaction.user.id;
    const collector = interaction.channel.createMessageCollector({ filter, time: 120000, max: 1 });

    collector.on('end', async (collected) => {
      try {
        const msg = collected.first();
        let imageUrl = null;

        if (msg) {
          if (msg.attachments.size > 0) {
            imageUrl = msg.attachments.first().url;
          }
          // Tenta apagar a msg do usuário pra limpar o chat (se tiver perm)
          if (msg.deletable) await msg.delete().catch(() => {});
        }

        // Processa registro
        const state = loadState();
        const userId = interaction.user.id;

        // Atualiza Ranking (Valor)
        if (!state.sales[userId]) state.sales[userId] = { total: 0, history: [] };
        state.sales[userId].total += value;
        state.sales[userId].history.push({ item, qtd, value, date, ts: Date.now() });

        // Verifica Cooldown (Pontos de Atividade)
        const scoreInfo = checkCooldown(userId, state);
        if (scoreInfo.scored) {
          state.lastScore[userId] = Date.now();
          // Emite evento pro GeralDash
          try {
            dashEmit("venda:registrada", {
              userId,
              value,
              __at: Date.now()
            });
          } catch (e) {
            console.error("[Vendas] Erro ao emitir dash event:", e);
          }
        }

        saveState(state);
        
        try {
          await updatePanel(client);
        } catch (e) {
          console.error("[Vendas] Erro ao atualizar painel:", e);
        }

               // tenta mandar log (não pode quebrar o fluxo se falhar)
        try {
          await logSale(client, interaction, { item, qtd, value, date, image: imageUrl }, scoreInfo);
        } catch (e) {
          console.error("[Vendas] Erro ao enviar logSale:", e);
        }

        await interaction.followUp({ content: `✅ Venda registrada! **$${formatValue(value)}** adicionados ao seu ranking.`, ephemeral: true });
      } catch (err) {
        console.error("[Vendas] Erro crítico no collector:", err);

        // tenta mandar log no canal de logs (com caminho do arquivo)
        try {
          const ch = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
          if (ch) {
            const e = new EmbedBuilder()
              .setColor("#e74c3c")
              .setTitle("❌ Erro no Registro de Vendas")
              .setDescription("Deu erro ao salvar uma venda. Veja o erro abaixo:")
              .addFields(
                { name: "👤 User", value: `<@${interaction.user.id}> (${interaction.user.id})`, inline: false },
                { name: "📌 Onde", value: "collector.on('end')", inline: true },
                { name: "📁 DATA_DIR", value: `\`${DATA_DIR}\``, inline: false },
                { name: "📄 STATE_FILE", value: `\`${STATE_FILE}\``, inline: false },
                { name: "🧨 Erro", value: `\`\`\`${String(err?.stack || err).slice(0, 3500)}\`\`\``, inline: false }
              )
              .setTimestamp();

            await ch.send({ embeds: [e] });
          }
        } catch {}

        try {
          await interaction.followUp({ content: "❌ Ocorreu um erro interno ao salvar o registro.", ephemeral: true });
        } catch {}
      }
    });

    return true;
  }

  // 6. Modal Submit (Edição Admin - Ajuste + ou -)
  if (interaction.isModalSubmit() && interaction.customId === "modal_vendas_admin_adjust") {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: "🚫 Sem permissão.", ephemeral: true });

    const actionInput = interaction.fields.getTextInputValue("action_type").trim().toLowerCase();
    const targetId = interaction.fields.getTextInputValue("target_id").trim();
    const amountRaw = interaction.fields.getTextInputValue("amount").trim();

    let multiplier = 1;
    let actionLabel = "Adicionar";

    if (actionInput.includes("rem") || actionInput.includes("tirar") || actionInput.includes("sub") || actionInput.includes("menos")) {
        multiplier = -1;
        actionLabel = "Remover";
    } else if (actionInput.includes("add") || actionInput.includes("adic") || actionInput.includes("somar") || actionInput.includes("mais")) {
        multiplier = 1;
        actionLabel = "Adicionar";
    } else {
        return interaction.reply({ content: "⚠️ Ação não reconhecida. Escreva 'Adicionar' ou 'Remover'.", ephemeral: true });
    }

    const amount = parseValue(amountRaw);
    if (amount <= 0) return interaction.reply({ content: "⚠️ Valor inválido ou zero.", ephemeral: true });

    const finalAmount = amount * multiplier;

    const state = loadState();
    if (!state.sales[targetId]) state.sales[targetId] = { total: 0, history: [] };
    
    const oldVal = state.sales[targetId].total;
    state.sales[targetId].total += finalAmount;
    
    // Log history of adjustment
    state.sales[targetId].history.push({ 
        item: `Ajuste Admin (${actionLabel})`, 
        qtd: "1", 
        value: finalAmount, 
        date: new Date().toLocaleDateString("pt-BR"), 
        ts: Date.now(),
        adminId: interaction.user.id 
    });

    saveState(state);
    await updatePanel(client);
    await logAdminAction(client, interaction, targetId, actionLabel, amount, oldVal, state.sales[targetId].total);

    await interaction.reply({ 
        content: `✅ Saldo de <@${targetId}> ajustado.\n**${actionLabel}**: $${formatValue(amount)}\nNovo Total: **$${formatValue(state.sales[targetId].total)}**`, 
        ephemeral: true 
    });
    return true;
  }

  // 7. Modal Submit (Edição Admin - Setar Total - Legacy)
  if (interaction.isModalSubmit() && interaction.customId.startsWith("modal_vendas_edit_")) {
    const targetId = interaction.customId.split("_")[3];
    const newValRaw = interaction.fields.getTextInputValue("new_total");
    const newVal = parseValue(newValRaw);

    const state = loadState();
    if (!state.sales[targetId]) state.sales[targetId] = { total: 0, history: [] };
    
    const oldVal = state.sales[targetId].total;
    state.sales[targetId].total = newVal;
    saveState(state);
    await updatePanel(client);

    await interaction.reply({ 
      content: `✅ Valor total de <@${targetId}> atualizado de **$${formatValue(oldVal)}** para **$${formatValue(newVal)}**.`, 
      ephemeral: true 
    });
    return true;
  }

  return false;
}
