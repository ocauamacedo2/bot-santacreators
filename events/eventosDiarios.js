// d:\santacreators-main\events\eventosDiarios.js
import fs from "node:fs";
import path from "node:path";
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
///teste
// ================= PERSISTÊNCIA =================
const DATA_DIR = path.resolve(process.cwd(), "data");
const STATE_FILE = path.join(DATA_DIR, "eventos_diarios_state.json");
const CRONO_FILE = path.join(DATA_DIR, "cronograma_state.json"); // ✅ NOVO

const ensureDir = () => { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); };

// ✅ Escrita Atômica (mais segura: escreve num .tmp e renomeia, evitando corromper se o bot cair no meio)
const saveState = (data) => { 
  ensureDir(); 
  const tmp = `${STATE_FILE}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, STATE_FILE);
  } catch (e) {
    console.error("[EventosDiarios] Erro ao salvar state:", e);
  }
};

const loadState = () => { 
  try { if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch (e) { console.error("[EventosDiarios] Erro load:", e); } 
  return { pendingRequests: {} }; 
};

// ================= CONFIGURAÇÃO =================
const EVENTOS_CHANNEL_ID = "1385003944803041371"; // Canal Oficial de Eventos Diários
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

const BTN_OPEN_MENU = "evd_open_menu";
const SEL_CITY = "evd_select_city";
const MODAL_SUBMIT = "evd_modal_submit";
const BTN_APPROVE_PREFIX = "evd_approve_";
const BTN_REJECT_PREFIX = "evd_reject_";

// Carrega os pedidos pendentes do arquivo ao iniciar
const BTN_EDIT_LAST = "evd_edit_last";
const MODAL_EDIT_SUBMIT = "evd_modal_edit_submit";
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

    // Se não tiver, tenta madrugada
    const madru = crono.madrugada?.[todayKey];
    if (madru && madru.active) return madru;

    return null;
  } catch (e) {
    console.error("[EventosDiarios] Erro ao ler cronograma:", e);
    return null;
  }
}

function splitText(text, maxLength = 2000) {
  if (text.length <= maxLength) return [text];
  const chunks = [];
  let currentChunk = "";
  const lines = text.split("\n");
  for (const line of lines) {
    if (currentChunk.length + line.length + 1 <= maxLength) {
      currentChunk += (currentChunk ? "\n" : "") + line;
    } else {
      if (currentChunk) chunks.push(currentChunk);
      currentChunk = line;
      while (currentChunk.length > maxLength) {
          chunks.push(currentChunk.slice(0, maxLength));
          currentChunk = currentChunk.slice(maxLength);
      }
    }
  }
  if (currentChunk) chunks.push(currentChunk);
  return chunks;
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

function buildControlButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(BTN_OPEN_MENU)
      .setLabel("📅 Registrar Evento Diário")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("📢"),
    new ButtonBuilder()
      .setCustomId(BTN_EDIT_LAST)
      .setLabel("✏️ Editar Último Evento")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("✍️")
  );
}

function createEventModal(cityKey, eventData) {
  let defaultTitle = "";
  let defaultDescription = "";

  // Verifica se o evento do dia bate com a cidade selecionada
  if (eventData && eventData.city) {
    const cName = eventData.city.toLowerCase();
    const cKey = cityKey.toLowerCase();
    const cLabel = (CITIES[cityKey]?.label || "").toLowerCase();
    
    // Match flexível (ex: "Nobre" bate com "Cidade Nobre" ou "nobre")
    if (cName === cKey || cLabel.includes(cName) || cName.includes(cKey)) {
      defaultTitle = eventData.eventName || "";
      const prizes = eventData.prizes || "A definir";
      defaultDescription = `🏆 **Premiação:**\n${prizes}\n\n📝 **Regras/Descrição:**\n- `;
    }
  }

  const modal = new ModalBuilder()
    .setCustomId(`${MODAL_SUBMIT}:${cityKey}`)
    .setTitle(`Evento - ${CITIES[cityKey].label}`);

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("evd_title")
        .setLabel("Título do Evento")
        .setPlaceholder("Ex: SANTA DO CRIME")
        .setValue(defaultTitle)
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("evd_description")
        .setLabel("Descrição / Regras / Horário")
        .setPlaceholder("Cole aqui todo o texto explicativo...")
        .setValue(defaultDescription)
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("evd_image")
        .setLabel("Link da Imagem (Banner)")
        .setPlaceholder("https://cdn.discordapp.com/...")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    )
  );
  return modal;
}

// ✅ Lógica inteligente: se force=false, só cria se não existir. Se force=true, apaga e recria (pra descer).
async function ensureButtonAtBottom(channel, client, force = true) {
  try {
    const messages = await channel.messages.fetch({ limit: 20 }).catch(() => null);
    if (!messages) return;

    const myMsgs = messages.filter(
      (m) => m.author.id === client.user.id && m.components.length > 0 && m.components[0].components.some(c => c.customId === BTN_OPEN_MENU || c.customId === BTN_EDIT_LAST)
    );

    // ✅ Checa se já existe um painel de botões ATUALIZADO (com 2 botões)
    const upToDateMsg = myMsgs.find(m => m.components[0]?.components?.length === 2);

    // Se não for forçado e já existir um painel atualizado, não faz nada.
    if (!force && upToDateMsg) return;

    // Apaga todas as mensagens de botão antigas/desatualizadas do bot
    for (const m of myMsgs.values()) {
      await m.delete().catch(() => {});
    }

    await channel.send({
      components: [buildControlButtons()]
    });
  } catch (e) {
    console.error("[EventosDiarios] Erro ao mover botão:", e);
  }
}

// ================= EXPORTS =================

export async function eventosDiariosOnReady(client) {
  // Garante que o estado seja carregado no boot
  state = loadState();
  const channel = await client.channels.fetch(EVENTOS_CHANNEL_ID).catch(() => null);
  if (channel && channel.isTextBased()) {
    // ✅ No restart, passa false para não spammar se já tiver botão
    await ensureButtonAtBottom(channel, client, false);

    // ✅ Auto-correção: Converte embeds antigos para texto ao iniciar
    console.log('[EventosDiarios] Verificando embeds antigos para converter...');
    try {
      const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
      if (messages) {
        for (const msg of messages.values()) {
          // Apenas mensagens do bot com embeds
          if (msg.author.id !== client.user.id || msg.embeds.length === 0) continue;

          const embed = msg.embeds[0];
          // Verifica se é um embed de evento diário
          if (embed.title && embed.title.includes("Santa Creators :")) {
            const title = embed.title.replace(/🎉\s*:\s*\*\*Santa Creators\s*:\s*/i, '').replace(/\*\*\s*🎉/i, '').trim();
            const description = embed.description || '';
            const imageUrl = embed.image?.url || '';
            const mentions = msg.content || ''; // Menções ficam no conteúdo

            const newContent = 
`# 🎉 :  **Santa Creators : ${title}** 🎉 

${description}

${mentions}

${imageUrl}`;

            // Deleta a mensagem antiga e envia a nova, dividida se necessário
            await msg.delete().catch(() => {});
            await channel.send({ content: newContent, split: true });
            console.log(`[EventosDiarios] Mensagem de evento ${msg.id} convertida de embed para texto.`);
          }
        }
      }
    } catch (e) {
      console.error('[EventosDiarios] Erro ao tentar converter embeds antigos:', e);
    }
    console.log('[EventosDiarios] Verificação de embeds antigos concluída.');
  }
}

export async function eventosDiariosHandleInteraction(interaction, client) {
  if (!interaction.guild) return false;

  if (interaction.isButton() && interaction.customId === BTN_OPEN_MENU) {
    if (!hasPermission(interaction.member, interaction.user.id)) {
      return interaction.reply({ content: "🚫 Sem permissão.", ephemeral: true });
    }

    // ✅ Tenta detectar cidade automaticamente pelo cronograma
    const eventData = getTodayEventData();
    let autoCityKey = null;

    if (eventData && eventData.city) {
      const normalized = eventData.city.toLowerCase().trim();
      // Tenta achar a chave da cidade
      const foundKey = Object.keys(CITIES).find(k => 
        k === normalized || CITIES[k].label.toLowerCase().includes(normalized) || normalized.includes(k)
      );
      if (foundKey) autoCityKey = foundKey;
    }

    if (autoCityKey) {
      const modal = createEventModal(autoCityKey, eventData);
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
      content: "🌆 **Em qual cidade será o evento?**",
      components: [row],
      ephemeral: true
    });
    return true;
  }

  if (interaction.isStringSelectMenu() && interaction.customId === SEL_CITY) {
    const cityKey = interaction.values[0];
    
    // ✅ Pega dados do evento de hoje para pré-preencher
    const eventData = getTodayEventData();
    const modal = createEventModal(cityKey, eventData);
    await interaction.showModal(modal);
    return true;
  }

  if (interaction.isButton() && interaction.customId === BTN_EDIT_LAST) {
    if (!hasPermission(interaction.member, interaction.user.id)) {
      return interaction.reply({ content: "🚫 Sem permissão para editar.", ephemeral: true });
    }

    // await interaction.deferReply({ ephemeral: true }); // Removido para corrigir erro 'InteractionAlreadyReplied'

    const eventChannel = await client.channels.fetch(EVENTOS_CHANNEL_ID).catch(() => null);
    if (!eventChannel) {
      return interaction.reply({ content: "❌ Canal de Eventos não encontrado.", ephemeral: true });
    }

    const messages = await eventChannel.messages.fetch({ limit: 50 }).catch(() => null);
    if (!messages) {
      return interaction.reply({ content: "❌ Não foi possível buscar as mensagens do canal de eventos.", ephemeral: true });
    }

    // Find the most recent event message from the bot
    const lastEventMessage = messages
      .filter(m => m.author.id === client.user.id && m.content.includes("# 🎉 :  **Santa Creators :"))
      .sort((a, b) => b.createdTimestamp - a.createdTimestamp)
      .first();

    if (!lastEventMessage) {
      return interaction.reply({ content: "❌ Nenhum evento recente encontrado para editar.", ephemeral: true });
    }

    // Parse the content
    const lines = lastEventMessage.content.split('\n');
    const titleLineIndex = lines.findIndex(l => l.startsWith('# 🎉 :'));
    if (titleLineIndex === -1) {
        return interaction.reply({ content: "❌ Formato de título do evento não encontrado.", ephemeral: true });
    }
    const title = lines[titleLineIndex].match(/# 🎉 :  \*\*Santa Creators : (.*?)\*\* 🎉/)?.[1] || '';

    const imageUrlLineIndex = lines.findIndex(l => l.startsWith('https://'));
    const mentionsLineIndex = lines.findIndex(l => l.includes('@everyone'));

    const imageUrl = imageUrlLineIndex > -1 ? lines[imageUrlLineIndex] : '';

    const descriptionStartIndex = titleLineIndex + 2;
    let descriptionEndIndex = lines.length;
    if (imageUrlLineIndex > -1) {
        descriptionEndIndex = imageUrlLineIndex;
    }
    if (mentionsLineIndex > -1 && mentionsLineIndex < descriptionEndIndex) {
        descriptionEndIndex = mentionsLineIndex;
    }
    while (descriptionEndIndex > descriptionStartIndex && lines[descriptionEndIndex - 1].trim() === '') {
        descriptionEndIndex--;
    }

    const description = lines.slice(descriptionStartIndex, descriptionEndIndex).join('\n');

    const modal = new ModalBuilder()
      .setCustomId(`${MODAL_EDIT_SUBMIT}:${lastEventMessage.id}`)
      .setTitle(`✏️ Editando Evento`);

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("evd_edit_title")
          .setLabel("Título do Evento")
          .setValue(title)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("evd_edit_description")
          .setLabel("Descrição / Regras / Horário")
          .setValue(description)
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("evd_edit_image")
          .setLabel("Link da Imagem (Banner)")
          .setValue(imageUrl)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );
    
    await interaction.showModal(modal);
    return true;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith(MODAL_EDIT_SUBMIT)) {
    if (!hasPermission(interaction.member, interaction.user.id)) {
      return interaction.reply({ content: "🚫 Sem permissão para editar.", ephemeral: true });
    }
    
    await interaction.deferReply({ ephemeral: true });

    const messageId = interaction.customId.split(":")[1];
    const newTitle = interaction.fields.getTextInputValue("evd_edit_title");
    const newDescription = interaction.fields.getTextInputValue("evd_edit_description");
    const newImageUrl = interaction.fields.getTextInputValue("evd_edit_image");

    const eventChannel = await client.channels.fetch(EVENTOS_CHANNEL_ID).catch(() => null);
    if (!eventChannel) {
      return interaction.editReply("❌ Canal de Eventos não encontrado.");
    }

    const messageToEdit = await eventChannel.messages.fetch(messageId).catch(() => null);
    if (!messageToEdit) {
      return interaction.editReply("❌ A mensagem do evento original não foi encontrada. Talvez tenha sido apagada.");
    }

    // Extract old mentions to preserve them
    const oldContent = messageToEdit.content;
    const oldMentions = oldContent.split('\n').find(l => l.includes('@everyone')) || '';

    const newMessageContent = 
`# 🎉 :  **Santa Creators : ${newTitle}** 🎉 

${newDescription.trim()}

${newImageUrl}

${oldMentions}`;

    if (newMessageContent.length > 2000) {
      return interaction.editReply("❌ O conteúdo editado é muito longo (mais de 2000 caracteres) e não pode ser salvo. Por favor, reduza a descrição.");
    }

    await messageToEdit.edit({ content: newMessageContent });

    await interaction.editReply("✅ Evento editado com sucesso!");
    return true;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith(MODAL_SUBMIT)) {
    await interaction.deferReply({ ephemeral: true });

    const cityKey = interaction.customId.split(":")[1];
    if (!cityKey || !CITIES[cityKey]) {
      return interaction.editReply("❌ Erro: Cidade não identificada.");
    }

    const title = interaction.fields.getTextInputValue("evd_title");
    const description = interaction.fields.getTextInputValue("evd_description");
    const imageUrl = interaction.fields.getTextInputValue("evd_image");

    const reqId = `${interaction.user.id}-${Date.now()}`;
    
    state.pendingRequests[reqId] = {
      userId: interaction.user.id,
      cityKey,
      title,
      description,
      imageUrl
    };
    saveState(state); // Salva no arquivo

    const approvalChannel = await client.channels.fetch(APPROVAL_CHANNEL_ID).catch(() => null);
    if (!approvalChannel) {
      return interaction.editReply("❌ Canal de aprovação não encontrado.");
    }

    const embed = new EmbedBuilder()
      .setTitle("🛡️ Aprovação: Evento Diário")
      .setColor("#9b59b6")
      .setDescription(`**Solicitante:** <@${interaction.user.id}>\n**Cidade:** ${CITIES[cityKey].label}`)
      .addFields(
        { name: "Título", value: title },
        { name: "Descrição (Preview)", value: description.slice(0, 1000) + (description.length > 1000 ? "..." : "") },
        { name: "Imagem", value: imageUrl }
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
      content: "Nova solicitação de Evento Diário pendente.",
      embeds: [embed],
      components: [row]
    });

    await interaction.editReply("✅ Solicitação enviada para aprovação!");
    return true;
  }

  if (interaction.isButton() && interaction.customId.startsWith(BTN_APPROVE_PREFIX)) {
    if (!canApprove(interaction.member, interaction.user.id)) {
      return interaction.reply({ content: "🚫 Você não tem permissão para aprovar.", ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });
    const reqId = interaction.customId.replace(BTN_APPROVE_PREFIX, "");
    const data = state.pendingRequests[reqId];

    if (!data) {
      return interaction.editReply("⚠️ Dados da solicitação não encontrados (antigos ou expirados).");
    }

    const eventChannel = await client.channels.fetch(EVENTOS_CHANNEL_ID).catch(() => null);
    if (!eventChannel) return interaction.editReply("❌ Canal de Eventos não encontrado.");

    const cityData = CITIES[data.cityKey];

    const mentions = `@everyone @here <@&${ROLE_CIDADAO}> <@&${ROLE_LIDERES}> <@&${cityData.roleId}>`;

    // ✅ ALTERAÇÃO: Volta a ser mensagem de texto, mas com 'split' para evitar erro de limite
    const finalMessage = 
`# 🎉 :  **Santa Creators : ${data.title}** 🎉 

${data.description.trim()}

${data.imageUrl}

${mentions}`;

    const chunks = splitText(finalMessage);
    let sentMsg;
    for (const chunk of chunks) {
        sentMsg = await eventChannel.send({ content: chunk });
    }

    if (!sentMsg) {
      return interaction.editReply("❌ Falha ao enviar a mensagem do evento. O conteúdo pode estar vazio.");
    }
    
    // ✅ Mais emojis
    try {
      const emojis = ["💜", "🔥", "🚀", "👏", "🎉", "🤩", "🤯", "🏆", "👑", "💸", "👀", "✨", "💯", "✅", "📸", "💎", "⚡", "💣", "🫡", "🤝", "👻", "💀", "👽", "👾", "🤖", "🎃", "😺"];
      for (const e of emojis) await sentMsg.react(e).catch(() => {});
    } catch {}

    // ✅ Aqui passa true para forçar o botão a descer
    await ensureButtonAtBottom(eventChannel, client, true);

    dashEmit("eventosdiarios:aprovado", {
      userId: data.userId,
      approverId: interaction.user.id,
      at: Date.now()
    });

    const embedApproved = EmbedBuilder.from(interaction.message.embeds[0])
      .setColor("#2ecc71")
      .setTitle("✅ Evento Diário APROVADO")
      .setFooter({ text: `Aprovado por ${interaction.user.tag}` })
      .addFields({ name: '✅ Aprovado por', value: `${interaction.user} (\`${interaction.user.tag}\`)`, inline: false });

    await interaction.message.edit({ embeds: [embedApproved], components: [] }).catch(() => {});
    
    delete state.pendingRequests[reqId];
    saveState(state); // Salva a remoção
    await interaction.editReply("✅ Evento postado e pontos computados!");
    return true;
  }

  if (interaction.isButton() && interaction.customId.startsWith(BTN_REJECT_PREFIX)) {
    if (!canApprove(interaction.member, interaction.user.id)) {
      return interaction.reply({ content: "🚫 Você não tem permissão para recusar.", ephemeral: true });
    }

    const reqId = interaction.customId.replace(BTN_REJECT_PREFIX, "");
    
    const embedRejected = EmbedBuilder.from(interaction.message.embeds[0])
      .setColor("#e74c3c")
      .setTitle("❌ Evento Diário RECUSADO")
      .setFooter({ text: `Recusado por ${interaction.user.tag}` });

    await interaction.message.edit({ embeds: [embedRejected], components: [] }).catch(() => {});
    
    delete state.pendingRequests[reqId];
    saveState(state); // Salva a remoção
    await interaction.reply({ content: "❌ Solicitação recusada.", ephemeral: true });
    return true;
  }

  return false;
}
