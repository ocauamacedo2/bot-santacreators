// d:\santacreators-main\events\hallDaFama.js
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";

import { dashEmit } from "../utils/dashHub.js";

// ================= CONFIGURAÇÃO =================
const HALL_CHANNEL_ID = "1386503496353976470"; // Canal Oficial do Hall da Fama
const APPROVAL_CHANNEL_ID = "1387864036259004436"; // Canal de Aprovação

// Cargos Fixos para Menção
const ROLE_CIDADAO = "1262978759922028575";
const ROLE_LIDERES = "1353858422063239310";

// Cidades e seus Cargos
const CITIES = {
  nobre:   { label: "Cidade Nobre",   roleId: "1379021805544804382", emoji: "💎" },
  santa:   { label: "Cidade Santa",   roleId: "1379021888709464168", emoji: "🎅" },
  grande:  { label: "Cidade Grande",  roleId: "1418691103397253322", emoji: "🏙️" },
  maresia: { label: "Cidade Maresia", roleId: "1379021994678288465", emoji: "🌊" },
};

// Permissões
const ALLOWED_ROLES = [
  "1352408327983861844", // Resp Creators
  "1262262852949905409", // Resp Influ
  "1352407252216184833", // Resp Lider
  "1388976314253312100", // Coord Creators
  "1282119104576098314", // Mkt Creators
  "1262262852949905408", // Owner
  "1387253972661964840", // Equipe Social Medias
  "1388976094920704141", // Social Medias
  "1388975939161161728", // Gestor Creators
  "1352385500614234134", // Coordenação
  "1352429001188180039", // Equipe Creators
  "1414651836861907006", // Responsáveis
];

const APPROVER_ROLES = [
  "1262262852949905408", // Owner
  "1352408327983861844", // Resp Creators
  "1262262852949905409", // Resp Influ
  "1352407252216184833", // Resp Lider
];

const ALLOWED_USERS = [
  "660311795327828008", // Você
  "1262262852949905408", // Owner
];

const BTN_OPEN_MENU = "hf_open_menu";
const SEL_CITY = "hf_select_city";
const MODAL_SUBMIT = "hf_modal_submit";
const BTN_APPROVE_PREFIX = "hf_approve_";
const BTN_REJECT_PREFIX = "hf_reject_";

// ================= PERSISTÊNCIA =================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, "../data");
const STATE_FILE = path.join(DATA_DIR, "halldafama_state.json");
const CRONO_FILE = path.join(DATA_DIR, "cronograma_state.json"); // Lê o arquivo do cronograma

const ensureDir = () => { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); };
const saveState = (data) => { ensureDir(); fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2)); };
const loadState = () => { try { if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch {} return { pendingRequests: {} }; };

let state = loadState();

// ================= LÓGICA INTELIGENTE (CRONOGRAMA) =================

// Pega o dia da semana em SP (seg, ter, qua...)
function getTodayKey() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  // ✅ SEM ROLLOVER: Passou da meia-noite (00:00), já puxa o evento do dia novo.
  const days = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
  return days[now.getDay()];
}

// Lê o cronograma e retorna os dados de HOJE
function getTodayEventData() {
  try {
    if (!fs.existsSync(CRONO_FILE)) return null;
    const crono = JSON.parse(fs.readFileSync(CRONO_FILE, "utf8"));
    const todayKey = getTodayKey();
    
    // Tenta pegar do schedule normal (19h)
    const normal = crono.schedule?.[todayKey];
    if (normal && normal.active) return normal;

    // Se não tiver, tenta madrugada (se for madrugada agora, pega do dia anterior tecnicamente, mas vamos simplificar)
    const madru = crono.madrugada?.[todayKey];
    if (madru && madru.active) return madru;

    return null;
  } catch (e) {
    console.error("Erro ao ler cronograma:", e);
    return null;
  }
}

// Extrai a premiação do texto do cronograma para uma posição específica (1, 2, 3)
function extractPrizeForRank(prizesText, rank) {
  if (!prizesText) return "";
  const lines = prizesText.split('\n');
  // Procura linhas que tenham "TOP X" ou "1º" ou apenas comece com o numero
  const regex = new RegExp(`(TOP\\s*${rank}|${rank}º|${rank}\\.|^${rank}\\s)`, 'i');
  
  const line = lines.find(l => regex.test(l));
  if (line) {
    // Remove o prefixo "TOP 1:" para ficar só o prêmio
    return line.replace(regex, '').replace(/^[:\-\s]+/, '').trim();
  }
  return "";
}

// ================= TEMPLATES DE TEXTO (VARIAÇÃO) =================
const INTRO_TEMPLATES = [
  "É com **MUITO orgulho** que anunciamos os grandes vencedores do nosso evento!",
  "**É com MUITA honra** que trazemos os campeões do evento de hoje!",
  "A disputa foi insana, mas eles mostraram quem manda! Confira os vencedores:",
  "Mais um evento concluído com sucesso! Uma salva de palmas para os brabos:",
  "Eles mostraram habilidade, esperteza e sangue nos olhos! 🩸"
];

function getRandomIntro() {
  return INTRO_TEMPLATES[Math.floor(Math.random() * INTRO_TEMPLATES.length)];
}

// ================= HELPERS =================
function hasPermission(member, userId) {
  if (ALLOWED_USERS.includes(userId)) return true;
  return member?.roles?.cache?.some((r) => ALLOWED_ROLES.includes(r.id)) || false;
}

function canApprove(member, userId) {
  if (ALLOWED_USERS.includes(userId)) return true;
  return member?.roles?.cache?.some((r) => APPROVER_ROLES.includes(r.id)) || false;
}

function buildRegisterButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(BTN_OPEN_MENU)
      .setLabel("🏆 Registrar Hall da Fama")
      .setStyle(ButtonStyle.Success)
      .setEmoji("👑")
  );
}

async function ensureButtonAtBottom(channel, client, force = true) {
  try {
    const messages = await channel.messages.fetch({ limit: 20 }).catch(() => null);
    if (!messages) return;

    const myMsgs = messages.filter(
      (m) => m.author.id === client.user.id && m.components.length > 0 && m.components[0].components[0].customId === BTN_OPEN_MENU
    );

    if (!force && myMsgs.size > 0) return;

    for (const m of myMsgs.values()) {
      await m.delete().catch(() => {});
    }

    await channel.send({
      components: [buildRegisterButton()]
    });
  } catch (e) {
    console.error("[HallDaFama] Erro ao mover botão:", e);
  }
}

function buildHallDaFamaModal(cityKey, defaultEventName) {
  const modal = new ModalBuilder()
    .setCustomId(`${MODAL_SUBMIT}:${cityKey}`)
    .setTitle(`Hall da Fama - ${CITIES[cityKey].label}`);

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("hf_event_name")
        .setLabel("Nome do Evento")
        .setPlaceholder("Ex: SANTA DO CRIME")
        .setStyle(TextInputStyle.Short)
        .setValue(defaultEventName || "")
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("hf_top1")
        .setLabel("🥇 TOP 1 (Nome | ID)")
        .setPlaceholder("Ex: Macedo | 123")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("hf_tops_extra")
        .setLabel("🥈 TOP 2, 3... (Um por linha)")
        .setPlaceholder("Ex: Joao | 456\nMaria | 789")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("hf_image")
        .setLabel("Link da Imagem 1 (Banner/Print)")
        .setPlaceholder("https://cdn.discordapp.com/...")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("hf_image2")
        .setLabel("Link da Imagem 2 (Opcional)")
        .setPlaceholder("https://cdn.discordapp.com/...")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
    )
  );
  return modal;
}

// ================= EXPORTS =================

export async function hallDaFamaOnReady(client) {
  state = loadState();
  const channel = await client.channels.fetch(HALL_CHANNEL_ID).catch(() => null);
  if (channel && channel.isTextBased()) {
    await ensureButtonAtBottom(channel, client, false);
  }
}

export async function hallDaFamaHandleInteraction(interaction, client) {
  if (!interaction.guild) return false;

  // 1. Botão Inicial
  if (interaction.isButton() && interaction.customId === BTN_OPEN_MENU) {
    if (!hasPermission(interaction.member, interaction.user.id)) {
      return interaction.reply({ content: "🚫 Sem permissão.", ephemeral: true });
    }

    // ✅ Tenta detectar cidade automaticamente pelo cronograma
    const eventData = getTodayEventData();
    let autoCityKey = null;

    if (eventData && eventData.city) {
      const normalized = eventData.city.toLowerCase().trim();
      if (CITIES[normalized]) {
        autoCityKey = normalized;
      } else {
        const foundKey = Object.keys(CITIES).find(k => normalized.includes(k));
        if (foundKey) autoCityKey = foundKey;
      }
    }

    if (autoCityKey) {
      const defaultEventName = eventData ? eventData.eventName : "";
      const modal = buildHallDaFamaModal(autoCityKey, defaultEventName);
      await interaction.showModal(modal);
      return true;
    }

    const select = new StringSelectMenuBuilder()
      .setCustomId(SEL_CITY)
      .setPlaceholder("Selecione a Cidade do Evento")
      .addOptions(
        Object.entries(CITIES).map(([key, data]) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(data.label)
            .setValue(key)
            .setEmoji(data.emoji)
        )
      );

    const row = new ActionRowBuilder().addComponents(select);
    
    await interaction.reply({
      content: "🌆 **Para qual cidade é este Hall da Fama?**",
      components: [row],
      ephemeral: true
    });
    return true;
  }

  // 2. Seleção de Cidade -> Abre Modal
  if (interaction.isStringSelectMenu() && interaction.customId === SEL_CITY) {
    const cityKey = interaction.values[0];
    
    // Tenta pegar dados automáticos
    const eventData = getTodayEventData();
    const defaultEventName = eventData ? eventData.eventName : "";
    
    const modal = buildHallDaFamaModal(cityKey, defaultEventName);

    await interaction.showModal(modal);
    return true;
  }

  // 3. Submit do Modal -> Monta Texto e Envia para Aprovação
  if (interaction.isModalSubmit() && interaction.customId.startsWith(MODAL_SUBMIT)) {
    await interaction.deferReply({ ephemeral: true });

    const cityKey = interaction.customId.split(":")[1];
    if (!cityKey || !CITIES[cityKey]) return interaction.editReply("❌ Erro: Cidade não identificada.");

    // Pega inputs
    const eventNameInput = interaction.fields.getTextInputValue("hf_event_name");
    const top1 = interaction.fields.getTextInputValue("hf_top1");
    const topsExtra = interaction.fields.getTextInputValue("hf_tops_extra");
    const imageUrl = interaction.fields.getTextInputValue("hf_image");
    const imageUrl2 = interaction.fields.getTextInputValue("hf_image2");

    // Pega dados do cronograma (automático)
    const eventData = getTodayEventData();
    const eventName = eventNameInput; // Usa o input do usuário
    const prizesText = eventData ? eventData.prizes : "";

    // Monta a string dos vencedores com premiação automática
    let winnersText = "";

    // ✅ LÓGICA MELHORADA DE PREMIAÇÃO
    let prize1 = "";
    const hasExtra = topsExtra && topsExtra.trim().length > 0;

    if (!hasExtra) {
      // Se só tem TOP 1, verifica se o texto de prêmios tem menção a outros ranks
      const hasOtherRanks = /(TOP\s*[2-9]|2º|3º|[2-9]\.|^[2-9]\s)/im.test(prizesText);
      
      if (!hasOtherRanks) {
        // Se não tem outros ranks, assume que TUDO é pro TOP 1
        // Removemos "TOP 1" se existir no começo, e juntamos linhas com " + "
        prize1 = prizesText
          .split('\n')
          .map(l => l.replace(/^(TOP\s*1|1º|1\.|^1\s)[:\-\s]*/i, '').trim())
          .filter(Boolean)
          .join(' + ');
      } else {
        prize1 = extractPrizeForRank(prizesText, 1);
      }
    } else {
      prize1 = extractPrizeForRank(prizesText, 1);
    }

    // TOP 1
    winnersText += `**TOP** <:novo_emoji:1381082106469290076> ${top1} ${prize1 ? `| **${prize1}**` : ""}\n`;

    // TOPS EXTRA
    if (hasExtra) {
      const lines = topsExtra.split('\n').map(l => l.trim()).filter(Boolean);
      lines.forEach((line, index) => {
        const rank = index + 2;
        const prize = extractPrizeForRank(prizesText, rank);
        
        let emoji = "🏅";
        if (rank === 2) emoji = "<:novo_emoji:1381082144981651500>";
        else if (rank === 3) emoji = "<:novo_emoji:1381082168142336095>";

        winnersText += `**TOP** ${emoji} ${line} ${prize ? `| **${prize}**` : ""}\n`;
      });
    }

    const reqId = `${interaction.user.id}-${Date.now()}`;
    
    state.pendingRequests[reqId] = {
      userId: interaction.user.id,
      cityKey,
      eventName,
      winnersText,
      imageUrl,
      imageUrl2
    };
    saveState(state);

    const approvalChannel = await client.channels.fetch(APPROVAL_CHANNEL_ID).catch(() => null);
    if (!approvalChannel) return interaction.editReply("❌ Canal de aprovação não encontrado.");

    const embed = new EmbedBuilder()
      .setTitle("🛡️ Aprovação: Hall da Fama")
      .setColor("#FFD700")
      .setDescription(`**Solicitante:** <@${interaction.user.id}>\n**Cidade:** ${CITIES[cityKey].label}`)
      .addFields(
        { name: "Evento (Automático)", value: eventName },
        { name: "Vencedores (Formatado)", value: winnersText },
        { name: "Imagem 1", value: imageUrl },
        { name: "Imagem 2", value: imageUrl2 || "—" }
      )
      .setImage(imageUrl)
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${BTN_APPROVE_PREFIX}${reqId}`)
        .setLabel("✅ Aprovar e Postar")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`${BTN_REJECT_PREFIX}${reqId}`)
        .setLabel("❌ Recusar")
        .setStyle(ButtonStyle.Danger)
    );

    await approvalChannel.send({
      content: "Nova solicitação de Hall da Fama pendente.",
      embeds: [embed],
      components: [row]
    });

    await interaction.editReply("✅ Solicitação enviada para aprovação!");
    return true;
  }

  // 4. Aprovação
  if (interaction.isButton() && interaction.customId.startsWith(BTN_APPROVE_PREFIX)) {
    if (!canApprove(interaction.member, interaction.user.id)) {
      return interaction.reply({ content: "🚫 Você não tem permissão para aprovar.", ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });
    const reqId = interaction.customId.replace(BTN_APPROVE_PREFIX, "");
    const data = state.pendingRequests[reqId];

    if (!data) return interaction.editReply("⚠️ Dados da solicitação expiraram.");

    const hallChannel = await client.channels.fetch(HALL_CHANNEL_ID).catch(() => null);
    if (!hallChannel) return interaction.editReply("❌ Canal do Hall da Fama não encontrado.");

    const cityData = CITIES[data.cityKey];
    const intro = getRandomIntro(); // Frase aleatória
    
    // Montagem da mensagem final (Estilo Diva/Grande)
    const finalMessage = 
`# 🎉 :  **Santa Creators : ${data.eventName}** 🎉 

${intro} **${data.eventName.toUpperCase()}** na **${cityData.label.toUpperCase()}**! <:coroa_orange:1353939359144870019> 

👏  Uma salva de palmas para os BRABOS! 👏 

<:12633559939374122111:1368796471297576970>  **HALL DA FAMA** <:12633559939374122111:1368796471297576970> 

${data.winnersText}

**Foi insano, mas mais uma vez os vencedores mostraram que a vitória só é possível com raça! <:__:1357520048318709840>**

||@everyone @here <@&${ROLE_CIDADAO}> <@&${ROLE_LIDERES}> <@&${cityData.roleId}>||

${data.imageUrl}${data.imageUrl2 ? `\n${data.imageUrl2}` : ''}`;

    const sentMsg = await hallChannel.send({ content: finalMessage });
    
    try {
      const emojis = ["💜", "🔥", "🚀", "👏", "🎉", "🤩", "🏆", "👑", "💸", "✨", "💯", "✅", "💎", "🫡", "🤝", "🤯", "👀", "📸", "⚡", "💣", "👻", "💀", "👽", "👾", "🤖", "🎃", "😺"];
      for (const e of emojis) await sentMsg.react(e).catch(() => {});
    } catch {}

    await ensureButtonAtBottom(hallChannel, client, true);

    dashEmit("halldafama:aprovado", {
      userId: data.userId,
      approverId: interaction.user.id,
      at: Date.now()
    });

    const embedApproved = EmbedBuilder.from(interaction.message.embeds[0])
      .setColor("#2ecc71")
      .setTitle("✅ Hall da Fama APROVADO")
      .setFooter({ text: `Aprovado por ${interaction.user.tag}` })
      .addFields({ name: '✅ Aprovado por', value: `${interaction.user} (\`${interaction.user.tag}\`)`, inline: false });

    await interaction.message.edit({ embeds: [embedApproved], components: [] });
    
    delete state.pendingRequests[reqId];
    saveState(state);
    await interaction.editReply("✅ Hall da Fama postado e pontos computados!");
    return true;
  }

  // 5. Reprovação
  if (interaction.isButton() && interaction.customId.startsWith(BTN_REJECT_PREFIX)) {
    if (!canApprove(interaction.member, interaction.user.id)) {
      return interaction.reply({ content: "🚫 Você não tem permissão para recusar.", ephemeral: true });
    }

    const reqId = interaction.customId.replace(BTN_REJECT_PREFIX, "");
    
    const embedRejected = EmbedBuilder.from(interaction.message.embeds[0])
      .setColor("#e74c3c")
      .setTitle("❌ Hall da Fama RECUSADO")
      .setFooter({ text: `Recusado por ${interaction.user.tag}` });

    await interaction.message.edit({ embeds: [embedRejected], components: [] });
    
    delete state.pendingRequests[reqId];
    saveState(state);
    await interaction.reply({ content: "❌ Solicitação recusada.", ephemeral: true });
    return true;
  }

  return false;
}
