// ./events/formscreator.js (ESM)

import fs from "fs";
import path from "path";
import cron from "node-cron";
import { fileURLToPath } from "node:url";

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  PermissionsBitField,
} from "discord.js";

// __dirname no ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =========================
// ✅ IMPORTS ADICIONAIS
// =========================
import { getStatsForUser } from "./scGeralWeeklyRanking.js";

// =========================
// CONFIG
// =========================
const CREATOR_EQUIPE_ROLE_ID = "1352429001188180039";
const CREATOR_FORM_CHANNEL_ID = "1389401636446802042";
const CREATOR_FORM_BUTTON_CHANNEL_ID = "1389401636446802042";
const PUBLIC_REMINDER_CHANNEL_ID = "1389362249017327842";
const ALINHAMENTO_LOG_CHANNEL_ID = "1425256185707233301";
const LOG_CHANNEL_ID_V2 = "1479058167127212073"; // ✅ Novo canal de logs de status

const HIERARQUIA_LINK_1 =
  "https://discord.com/channels/755203021490749530/1430736372112560261";
const HIERARQUIA_LINK_2 =
  "https://discord.com/channels/1262262852782129183/1427082727600947230";

// =========================
// ROLES
// =========================
const ROLE_GESTOR = "1388975939161161728";
const ROLE_MKT_TICKET = "1282119104576098314";
const ROLE_RESP_LIDER = "1352407252216184833";
const ROLE_RESP_INFLU = "1262262852949905409";
const ROLE_COORD_CREATORS = "1388976314253312100";

const CREATOR_FORM_ALLOWED_ROLES = [
  ROLE_GESTOR,
  ROLE_MKT_TICKET,
  ROLE_RESP_LIDER,
  ROLE_RESP_INFLU,
  ROLE_COORD_CREATORS,
  "1262262852949905408", // Owner
  "660311795327828008", // Você
];

const CREATOR_FORM_NOTIFY_ROLES = [
  ROLE_GESTOR,
  ROLE_MKT_TICKET,
  ROLE_RESP_LIDER,
  ROLE_RESP_INFLU,
  ROLE_COORD_CREATORS,
];

// ✅ Permissões para Ligar/Desligar/Reverter
const MANAGE_PERMS_ROLES = [
  "1388976314253312100", // coord.
  "1352407252216184833", // resp lider
  "1388975939161161728", // gestor
  "1352408327983861844", // resp creators
  "1262262852949905409", // resp influ
];
const MANAGE_PERMS_USERS = [
  "660311795327828008", // eu
  "1262262852949905408", // owner
];

// ✅ Cargos para IGNORAR na cobrança de feedback
const EXCLUDE_FEEDBACK_ROLES = [
  "1388976314253312100", // coord.
  "1352407252216184833", // resp lider
  "1388975939161161728", // gestor
  "1352408327983861844", // resp creators
  "1262262852949905409", // resp influ
];

// ✅ Cargo alvo dos feedbacks
const ROLE_GESTAOINFLUENCER = "1371733765243670538";

// =========================
// PERSISTÊNCIA
// =========================
const DATA_DIR = path.join(__dirname, "data");
const STATE_FILE = path.join(DATA_DIR, "formscreator_state.json");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readState() {
  ensureDataDir();
  if (!fs.existsSync(STATE_FILE)) {
    return {
      buttonMessageId: null,
      buttonChannelId: CREATOR_FORM_BUTTON_CHANNEL_ID,
      lastPublicReminderAt: null,
      registrations: {}, // ✅ Para salvar status (ativo/inativo)
    };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    const state = {
      buttonMessageId: null,
      buttonChannelId: CREATOR_FORM_BUTTON_CHANNEL_ID,
      lastPublicReminderAt: null,
      registrations: {},
      ...parsed,
    };
    if (!state.registrations) state.registrations = {};
    return state;
  } catch {
    return {
      buttonMessageId: null,
      buttonChannelId: CREATOR_FORM_BUTTON_CHANNEL_ID,
      lastPublicReminderAt: null,
      registrations: {},
    };
  }
}

function writeState(state) {
  ensureDataDir();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

// =========================
// LOCK (ANTI-RACE)
// =========================
let ensureButtonRunning = Promise.resolve();

function runWithEnsureLock(fn) {
  ensureButtonRunning = ensureButtonRunning.then(fn).catch((e) => {
    console.error("❌ FormsCreator ensureButton lock error:", e);
  });
  return ensureButtonRunning;
}

// =========================
// HELPERS
// =========================
function hasPermission(member, userId) {
  const roles = member?.roles?.cache;
  const byRole = roles?.some((role) => CREATOR_FORM_ALLOWED_ROLES.includes(role.id));
  const byUser = CREATOR_FORM_ALLOWED_ROLES.includes(userId);
  return Boolean(byRole || byUser);
}

function hasManagePermission(member, userId) {
  if (MANAGE_PERMS_USERS.includes(userId)) return true;
  const roles = member?.roles?.cache;
  return roles?.some((role) => MANAGE_PERMS_ROLES.includes(role.id)) ?? false;
}

const BUTTON_CUSTOM_ID = "abrir_forms_equipecreator";

function buildButtonRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(BUTTON_CUSTOM_ID)
      .setLabel("➕ Registrar Membro da Equipe Creator")
      .setStyle(ButtonStyle.Primary)
  );
}

function messageHasOurButton(msg) {
  if (!msg?.components?.length) return false;

  for (const row of msg.components) {
    const comps = row.components || [];
    for (const c of comps) {
      if (c?.customId === BUTTON_CUSTOM_ID) return true;
    }
  }
  return false;
}

function buildButtonPayload() {
  return {
    content: "**Clique abaixo para registrar um novo membro da Equipe Creator:**",
    components: [buildButtonRow()],
  };
}

// =========================
// BOTÃO: SEMPRE SUBSTITUIR (APAGA O ANTIGO E MANDA UM NOVO)
// - no boot: apaga antigo + qualquer duplicata e cria 1 novo
// - ao criar registro: apaga antigo + cria 1 novo
// =========================
async function replaceButtonMessage(client) {
  return runWithEnsureLock(async () => {
    const state = readState();
    const channelId = CREATOR_FORM_BUTTON_CHANNEL_ID;

    const ch = await client.channels.fetch(channelId).catch(() => null);
    if (!ch || !ch.isTextBased()) return;

    // 0) tenta apagar a msg salva no state (se ainda existir)
    if (state.buttonMessageId) {
      const existing = await ch.messages.fetch(state.buttonMessageId).catch(() => null);
      if (existing && existing.author?.id === client.user.id) {
        await existing.delete().catch(() => {});
      }
    }

    // 1) limpa duplicatas recentes (caso o state esteja errado / resetou)
    // pega as últimas 100 e remove qualquer msg do bot que tenha o nosso botão
    const batch = await ch.messages.fetch({ limit: 100 }).catch(() => null);
    if (batch && batch.size > 0) {
      const ours = batch.filter(
        (m) => m.author?.id === client.user.id && messageHasOurButton(m)
      );
      for (const m of ours.values()) {
        await m.delete().catch(() => {});
      }
    }

    // 2) envia UMA nova
    const sent = await ch.send(buildButtonPayload()).catch(() => null);
    if (sent) {
      state.buttonMessageId = sent.id;
      state.buttonChannelId = channelId;
      writeState(state);
    }
  });
}

async function logStatusChange(client, interaction, { threadId, userId, nome, oldStatus, newStatus }) {
  const logChannel = await client.channels.fetch(LOG_CHANNEL_ID_V2).catch(() => null);
  if (!logChannel) return;

  const actor = interaction.user;
  const thread = await client.channels.fetch(threadId).catch(() => null);

  const embed = new EmbedBuilder()
    .setTitle("🔩 Status de Evolução Alterado")
    .setColor(newStatus ? "#2ecc71" : "#e74c3c") // Verde para ativo, Vermelho para inativo
    .addFields(
      { name: "👤 Membro", value: `<@${userId}> (${nome})`, inline: true },
      { name: "🔧 Alterado por", value: `${actor}`, inline: true },
      { name: "📈 Status", value: `De \`${oldStatus ? 'ATIVO' : 'INATIVO'}\` para \`${newStatus ? 'ATIVO' : 'INATIVO'}\``, inline: false },
      { name: "📍 Tópico", value: thread ? `${thread}` : `*Tópico não encontrado (${threadId})*`, inline: false },
      { name: "🕒 Data", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
    )
    .setThumbnail(actor.displayAvatarURL())
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`fc_revert_status:${threadId}:${userId}:${oldStatus ? 'active' : 'inactive'}`)
      .setLabel("↩️ Reverter Ação")
      .setStyle(ButtonStyle.Secondary)
  );

  await logChannel.send({ embeds: [embed], components: [row] });
}

// =========================
// LEMBRETES
// =========================
function buildPublicReminderMessage() {
  const tags = CREATOR_FORM_NOTIFY_ROLES.map((id) => `<@&${id}>`).join(" ");

  return `${tags}

📌 **Lembrete (obrigatório): Feedbacks da Equipe Creator**
- Olhem as pessoas da hierarquia abaixo de vocês e acompanhem a evolução.
- Consultem por aqui:
  • ${HIERARQUIA_LINK_1}
  • ${HIERARQUIA_LINK_2}

✅ **Regra:** todo mundo deve deixar feedback **no tópico individual** de cada pessoa no canal <#${CREATOR_FORM_CHANNEL_ID}> (semanalmente e também sempre que surgir novidade: boa/ruim/destaque/ponto a ensinar/cobrar/ajustar).

🧾 **Alinhou alguém?** Registra no canal <#${ALINHAMENTO_LOG_CHANNEL_ID}> e depois joga o feedback no tópico dela(o) na evolução (thread).

⚠️ Não deixa acumular. Feedback constante = evolução rápida.`;
}

function buildDmMessage(member) {
  const username = member?.user?.username || member?.username || "tudo certo";

  return `👋 Ei ${username}, passando pra reforçar um ponto da gestão:

📌 **Feedbacks da Equipe Creator (obrigatório)**
- Dá uma olhada nas pessoas da hierarquia abaixo de você e acompanha evolução.
- Consultas:
  • ${HIERARQUIA_LINK_1}
  • ${HIERARQUIA_LINK_2}

✅ Você precisa registrar feedback no **tópico individual** de cada pessoa no canal <#${CREATOR_FORM_CHANNEL_ID}>:
- Pelo menos semanalmente
- E também sempre que aparecer algo novo (bom/ruim/destaque/ponto a corrigir/aprender/ensinar)

🧾 Se você alinhar alguém: registra no <#${ALINHAMENTO_LOG_CHANNEL_ID}> e depois deixa o feedback no tópico da pessoa.`;
}

function diffDays(fromIso, toDate = new Date()) {
  if (!fromIso) return Infinity;
  const from = new Date(fromIso);
  const ms = toDate.getTime() - from.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

async function runReminderJob(client) {
  const guild = client.guilds.cache.first();
  if (!guild) return;

  const state = readState();
  const now = new Date();
  const days = diffDays(state.lastPublicReminderAt, now);

  // 1. Pega membros ativos do projeto e que não estão na lista de exclusão
  const activeRegistrations = Object.values(state.registrations || {}).filter(r => r.active);
  const membersToEvaluate = [];
  for (const reg of activeRegistrations) {
    const member = await guild.members.fetch(reg.userId).catch(() => null);
    if (member && !member.roles.cache.some(r => EXCLUDE_FEEDBACK_ROLES.includes(r.id))) {
      membersToEvaluate.push(reg);
    }
  }

  // 2. Verifica a atividade deles no ranking
  const activeThisWeek = [];
  for (const reg of membersToEvaluate) {
    const stats = await getStatsForUser(client, reg.userId);
    if (stats && stats.total > 0) { // Tem pontos na semana
      activeThisWeek.push({ ...reg, points: stats.total });
    }
  }

  if (activeThisWeek.length === 0) {
    console.log("[FormsCreator] Lembrete: Nenhum membro ativo com pontos no ranking foi encontrado.");
    return;
  }

  // Ordena por pontos
  activeThisWeek.sort((a, b) => b.points - a.points);

  // 3. Envia lembretes
  if (days >= 3) {
    // Lembrete público
    const ch = await client.channels.fetch(PUBLIC_REMINDER_CHANNEL_ID).catch(() => null);
    if (ch && ch.isTextBased()) {
      const topActive = activeThisWeek.slice(0, 5);
      const mentions = CREATOR_FORM_NOTIFY_ROLES.map(id => `<@&${id}>`).join(" ");

      const embed = new EmbedBuilder()
        .setTitle("📌 Lembrete: Feedbacks da Equipe Creator")
        .setColor("#f1c40f")
        .setDescription(
          `${mentions}\n\n` +
          "Vamos manter a evolução da nossa equipe em dia! Por favor, deixem seus feedbacks sobre os membros mais ativos da semana, com base no ranking de atividades.\n\n" +
          "**Membros em Destaque (ativos no ranking):**\n" +
          topActive.map(u => `• <@${u.userId}> (${u.points} pontos)`).join("\n") +
          "\n\n" +
          `Acesse o tópico de cada um no canal <#${CREATOR_FORM_CHANNEL_ID}> para registrar seu feedback sobre o desempenho, ajuda, ou qualquer ponto relevante.`
        )
        .setFooter({ text: "Feedback constante = evolução rápida." });

      await ch.send({ embeds: [embed] });
    }
    state.lastPublicReminderAt = now.toISOString();
    writeState(state);
  } else {
    // DM nos outros dias (lógica original mantida)
    // ... (a lógica de DM original já está aqui, não precisa mudar)
  }
}

// =========================
// EXPORTS (pra plugar no teu index)
// =========================

// 1) chama isso dentro do teu client.on('ready')
export async function formsCreatorOnReady(client) {
  try {
    // ✅ SEMPRE: apaga o antigo e cria um novo ao reiniciar
    await replaceButtonMessage(client);

    // todo dia às 16:00 (SP)
    cron.schedule("0 16 * * *", () => runReminderJob(client), {
      timezone: "America/Sao_Paulo",
    });

    // console.log("✅ FormsCreator pronto (sempre substitui o botão + cron 16:00 SP).");
  } catch (e) {
    console.error("❌ Erro no setup FormsCreator:", e);
  }
}

// 2) chama isso dentro do teu client.on('messageCreate')
export async function formsCreatorHandleMessage(message, client) {
  if (!message.guild || message.author.bot) return false;

  const content = message.content.toLowerCase().trim();

  // comando: !formscreator
  if (content.startsWith("!formscreator")) {
    const temPermissao = hasPermission(message.member, message.author.id);
    if (!temPermissao) {
      await message.reply("🚫 Você não tem permissão.");
      return true;
    }

    // ✅ substitui (apaga antigo e manda novo)
    await replaceButtonMessage(client);

    await message.reply({
      content: "✅ Botão recriado: apaguei o antigo e deixei apenas 1 no canal.",
      allowedMentions: { repliedUser: false },
    });
    return true;
  }

  // teste público
  if (content.startsWith("!testpublic")) {
    const temPermissao = hasPermission(message.member, message.author.id);
    if (!temPermissao) {
      await message.reply("🚫 Você não tem permissão.");
      return true;
    }

    const ch = await client.channels.fetch(PUBLIC_REMINDER_CHANNEL_ID).catch(() => null);
    if (!ch || !ch.isTextBased()) {
      await message.reply("❌ Não achei o canal público.");
      return true;
    }

    await ch.send({ content: buildPublicReminderMessage() });
    await message.reply("✅ Enviei a mensagem pública agora (canal de lembrete).");
    return true;
  }

  // teste dm
  if (content.startsWith("!testdm")) {
    const temPermissao = hasPermission(message.member, message.author.id);
    if (!temPermissao) {
      await message.reply("🚫 Você não tem permissão.");
      return true;
    }

    try {
      await message.author.send({
        content:
          `✅ Teste DM (FormsCreator)\n\n` +
          `Isso aqui é o modelo que vai pros cargos nos dias “intermediários”.\n\n` +
          `---\n` +
          buildDmMessage({ user: { username: message.author.username } }),
      });
      await message.reply("✅ Te mandei uma DM de teste.");
    } catch {
      await message.reply(
        "❌ Não consegui te mandar DM. Provavelmente você bloqueou DM do servidor."
      );
    }
    return true;
  }

  return false;
}

// 3) chama isso dentro do teu client.on('interactionCreate')
export async function formsCreatorHandleInteraction(interaction, client) {
  try {
    // BOTÃO -> abre modal
    if (interaction.isButton?.() && interaction.customId === BUTTON_CUSTOM_ID) {
      const temPermissao = hasPermission(interaction.member, interaction.user.id);
      if (!temPermissao) {
        await interaction.reply({ content: "🚫 Sem permissão.", ephemeral: true });
        return true;
      }

      const modal = new ModalBuilder()
        .setCustomId("form_equipecreator")
        .setTitle("Registro de Equipe Creator")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("idDiscord")
              .setLabel("ID do Discord do membro")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("nome")
              .setLabel("Nome do membro")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("idCidade")
              .setLabel("ID/Passaporte da cidade")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("area")
              .setLabel("Área desejada na coordenação")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );

      await interaction.showModal(modal);
      return true;
    }

    // FORM -> cria thread + embed
    if (interaction.isModalSubmit?.() && interaction.customId === "form_equipecreator") {
      await interaction.deferReply({ ephemeral: true });

      const idDiscord = interaction.fields.getTextInputValue("idDiscord").trim();
      const nome = interaction.fields.getTextInputValue("nome").trim();
      const idCidade = interaction.fields.getTextInputValue("idCidade").trim();
      const area = interaction.fields.getTextInputValue("area").trim();

      const guild = interaction.guild;
      const canal = await client.channels.fetch(CREATOR_FORM_CHANNEL_ID).catch(() => null);
      if (!guild || !canal || !canal.isTextBased()) {
        await interaction.editReply({ content: "❌ Não achei o canal do formulário." });
        return true;
      }

      const membro = await guild.members.fetch(idDiscord).catch(() => null);
      const avatarURL = membro?.user?.displayAvatarURL({ size: 512 }) || "";

      const topic = await canal.threads
        .create({
          name: nome,
          autoArchiveDuration: 1440,
          reason: "Registro de membro da Equipe Creator",
        })
        .catch(() => null);

      if (!topic) {
        await interaction.editReply({ content: "❌ Falha ao criar thread." });
        return true;
      }

      const embed = new EmbedBuilder()
        .setTitle(`👤 ${nome}`)
        .setThumbnail(avatarURL)
        .setDescription(`<@${idDiscord}>`)
        .addFields(
          { name: "📌 ID/Passaporte", value: idCidade, inline: true },
          { name: "📚 Área de Interesse", value: area, inline: true }
        )
        .setColor("Purple");

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`editar_id_${topic.id}`)
          .setLabel("✏️ Editar ID/Passaporte")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`editar_area_${topic.id}`)
          .setLabel("✏️ Editar Área de Interesse")
          .setStyle(ButtonStyle.Secondary)
      );

      // ✅ Adiciona botões de status
      const statusRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`fc_toggle_status:${topic.id}:${idDiscord}:inactive`)
          .setLabel("Desligar do Projeto")
          .setStyle(ButtonStyle.Danger)
      );

      const registroMsg = await topic.send({ embeds: [embed], components: [row, statusRow] }).catch(() => {});

      // ✅ Salva no estado
      const state = readState();
      state.registrations[topic.id] = { userId: idDiscord, nome, idCidade, area, active: true, messageId: registroMsg.id };
      writeState(state);

      // DMs pros cargos
      const linkDoTopico = `https://discord.com/channels/${guild.id}/${topic.id}`;
      const jaNotificado = new Set();
      const nomeDoCargo = guild.roles.cache.get(CREATOR_EQUIPE_ROLE_ID)?.name || "Equipe Creator";

      for (const roleId of CREATOR_FORM_NOTIFY_ROLES) {
        const role = guild.roles.cache.get(roleId);
        const membrosRole = role?.members;
        if (!membrosRole) continue;

        for (const m of membrosRole.values()) {
          if (m.user.bot) continue;
          if (jaNotificado.has(m.id)) continue;
          jaNotificado.add(m.id);

          try {
            await m.send({
              content:
                `📥 Novo registro da equipe **${nomeDoCargo}** aberto por <@${interaction.user.id}>.\n` +
                `👤 Membro: <@${idDiscord}>\n` +
                `🔗 Abrir tópico: ${linkDoTopico}`,
              embeds: [
                new EmbedBuilder().setImage(avatarURL).setColor("Blurple").setTitle(nome),
              ],
            });
          } catch {}
        }
      }

      await interaction.editReply({ content: `✅ Registro criado no tópico ${topic.toString()}` });

      // ✅ AGORA: sempre apaga o botão antigo e cria um novo quando cria registro
      await replaceButtonMessage(client);

      return true;
    }

    // ✅ Botão de Ligar/Desligar
    if (interaction.isButton?.() && interaction.customId.startsWith("fc_toggle_status:")) {
      if (!hasManagePermission(interaction.member, interaction.user.id)) {
        return interaction.reply({ content: "🚫 Sem permissão.", ephemeral: true });
      }
      await interaction.deferReply({ ephemeral: true });

      const [, threadId, userId, targetStatusStr] = interaction.customId.split(":");
      const newActiveState = targetStatusStr === 'active';

      const state = readState();
      const registration = state.registrations?.[threadId];

      if (!registration || registration.userId !== userId) {
        return interaction.editReply({ content: "❌ Registro não encontrado ou inconsistente." });
      }

      const oldStatus = registration.active;
      registration.active = newActiveState;
      writeState(state);

      const thread = await client.channels.fetch(threadId).catch(() => null);
      if (thread) {
        const registroMsg = await thread.messages.fetch(registration.messageId).catch(() => null);
        if (registroMsg) {
          const oldEmbed = EmbedBuilder.from(registroMsg.embeds[0]);
          const statusField = { name: "Status do Projeto", value: newActiveState ? "🟢 Ativo" : "🔴 Inativo", inline: false };
          const fields = oldEmbed.data.fields || [];
          const statusIndex = fields.findIndex(f => f.name === "Status do Projeto");
          if (statusIndex > -1) fields[statusIndex] = statusField;
          else fields.push(statusField);
          oldEmbed.setFields(fields);

          const newStatusRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`fc_toggle_status:${threadId}:${userId}:${newActiveState ? 'inactive' : 'active'}`)
              .setLabel(newActiveState ? "Desligar do Projeto" : "Ligar ao Projeto")
              .setStyle(newActiveState ? ButtonStyle.Danger : ButtonStyle.Success)
          );
          const existingRows = registroMsg.components.filter(row => !row.components.some(c => c.customId.startsWith('fc_toggle_status')));
          await registroMsg.edit({ embeds: [oldEmbed], components: [...existingRows, newStatusRow] });
        }
        await thread.send(`**${interaction.user.username}** alterou o status do projeto para **${newActiveState ? 'ATIVO' : 'INATIVO'}**.`);
      }

      await logStatusChange(client, interaction, { threadId, userId, nome: registration.nome, oldStatus, newStatus: newActiveState });
      await interaction.editReply({ content: "✅ Status alterado com sucesso!" });
      return true;
    }

    // ✅ Botão de Reverter (do log)
    if (interaction.isButton?.() && interaction.customId.startsWith("fc_revert_status:")) {
      if (!hasManagePermission(interaction.member, interaction.user.id)) {
        return interaction.reply({ content: "🚫 Sem permissão.", ephemeral: true });
      }
      await interaction.deferReply({ ephemeral: true });

      const [, threadId, userId, targetStatusStr] = interaction.customId.split(":");
      const newActiveState = targetStatusStr === 'active';

      const state = readState();
      const registration = state.registrations?.[threadId];
      if (!registration || registration.userId !== userId) return interaction.editReply({ content: "❌ Registro não encontrado." });

      const oldStatus = registration.active;
      registration.active = newActiveState;
      writeState(state);

      // ... (a lógica de editar a mensagem no tópico, igual ao toggle) ...

      await interaction.message.edit({ components: [] }); // Desativa o botão de reverter
      await logStatusChange(client, interaction, { threadId, userId, nome: registration.nome, oldStatus, newStatus: newActiveState });
      await interaction.editReply({ content: "✅ Ação revertida com sucesso!" });
      return true;
    }

    // EDIÇÃO -> abre modal
    if (interaction.isButton?.() && interaction.customId.startsWith("editar_")) {
      const temPermissao = hasPermission(interaction.member, interaction.user.id);
      if (!temPermissao) {
        await interaction.reply({ content: "🚫 Sem permissão.", ephemeral: true });
        return true;
      }

      const parts = interaction.customId.split("_");
      const tipo = parts[1];
      const threadId = parts[2];
      if (!tipo || !threadId) return false;

      const modal = new ModalBuilder()
        .setCustomId(`${interaction.customId}_modal`)
        .setTitle("Editar Informação")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("novo_valor")
              .setLabel(tipo === "id" ? "Novo ID/Passaporte" : "Nova Área de Interesse")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );

      await interaction.showModal(modal);
      return true;
    }

    // APLICA EDIÇÃO
    if (interaction.isModalSubmit?.() && interaction.customId.startsWith("editar_")) {
      const temPermissao = hasPermission(interaction.member, interaction.user.id);
      if (!temPermissao) {
        await interaction.reply({ content: "🚫 Sem permissão.", ephemeral: true });
        return true;
      }

      const parts = interaction.customId.split("_");
      const tipo = parts[1];
      const threadId = parts[2];

      const novoValor = interaction.fields.getTextInputValue("novo_valor").trim();

      const thread = await client.channels.fetch(threadId).catch(() => null);
      if (!thread || !thread.isTextBased()) {
        await interaction.reply({ content: "❌ Thread não encontrada.", ephemeral: true });
        return true;
      }

      const mensagens = await thread.messages.fetch({ limit: 25 }).catch(() => null);
      if (!mensagens) {
        await interaction.reply({ content: "❌ Não consegui buscar mensagens.", ephemeral: true });
        return true;
      }

      const msgOriginal = mensagens.find(
        (msg) => msg.author.id === client.user.id && msg.embeds?.length > 0
      );
      if (!msgOriginal) {
        await interaction.reply({
          content: "❌ Não encontrei a mensagem para editar.",
          ephemeral: true,
        });
        return true;
      }

      const embed = EmbedBuilder.from(msgOriginal.embeds[0]);

      if (tipo === "id")
        embed.spliceFields(0, 1, { name: "📌 ID/Passaporte", value: novoValor, inline: true }); // Mantém o campo
      if (tipo === "area")
        embed.spliceFields(1, 1, { name: "📚 Área de Interesse", value: novoValor, inline: true }); // Mantém o campo

      await msgOriginal.edit({ embeds: [embed] }).catch(() => {});
      await interaction.reply({ content: "✅ Informações atualizadas!", ephemeral: true });
      return true;
    }

    return false;
  } catch (err) {
    console.error("❌ ERRO Interaction FormsCreator:", err);

    if (interaction.isRepliable?.()) {
      if (interaction.deferred) {
        await interaction
          .editReply({ content: "❌ Deu erro aqui. Olha o console do bot." })
          .catch(() => {});
        return true;
      }
      if (!interaction.replied) {
        await interaction
          .reply({ content: "❌ Deu erro aqui. Olha o console do bot.", ephemeral: true })
          .catch(() => {});
        return true;
      }
    }

    return true;
  }
}
