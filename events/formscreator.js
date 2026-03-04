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
} from "discord.js";

// __dirname no ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =========================
// CONFIG
// =========================
const CREATOR_EQUIPE_ROLE_ID = "1352429001188180039";
const CREATOR_FORM_CHANNEL_ID = "1389401636446802042";
const CREATOR_FORM_BUTTON_CHANNEL_ID = "1389401636446802042";
const PUBLIC_REMINDER_CHANNEL_ID = "1389362249017327842";
const ALINHAMENTO_LOG_CHANNEL_ID = "1425256185707233301";

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
    };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    return {
      buttonMessageId: null,
      buttonChannelId: CREATOR_FORM_BUTTON_CHANNEL_ID,
      lastPublicReminderAt: null,
      ...parsed,
    };
  } catch {
    return {
      buttonMessageId: null,
      buttonChannelId: CREATOR_FORM_BUTTON_CHANNEL_ID,
      lastPublicReminderAt: null,
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
  const state = readState();
  const now = new Date();
  const days = diffDays(state.lastPublicReminderAt, now);

  // console.log(
  //   `[FormsCreator] runReminderJob rodou. daysSinceLastPublic=${days} now=${now.toISOString()}`
  // );

  const guild = client.guilds.cache.first();
  if (!guild) return;

  if (days >= 3) {
    const ch = await client.channels.fetch(PUBLIC_REMINDER_CHANNEL_ID).catch(() => null);
    if (ch && ch.isTextBased())
      await ch.send({ content: buildPublicReminderMessage() }).catch(() => {});
    state.lastPublicReminderAt = now.toISOString();
    writeState(state);
    return;
  }

  // Dias “intermediários”: DM individual (sem marcar cargo)
  const uniqueMembers = new Map();

  for (const roleId of CREATOR_FORM_NOTIFY_ROLES) {
    const role = guild.roles.cache.get(roleId);
    if (!role) continue;

    for (const m of role.members.values()) {
      if (m.user.bot) continue;
      uniqueMembers.set(m.id, m);
    }
  }

  for (const member of uniqueMembers.values()) {
    try {
      await member.send({ content: buildDmMessage(member) });
    } catch {
      // DM bloqueada etc
    }
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

      await topic.send({ embeds: [embed], components: [row] }).catch(() => {});

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
        embed.spliceFields(0, 1, { name: "📌 ID/Passaporte", value: novoValor, inline: true });
      if (tipo === "area")
        embed.spliceFields(1, 1, { name: "📚 Área de Interesse", value: novoValor, inline: true });

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
