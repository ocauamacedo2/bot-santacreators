// /application/events/blacklistFacs.js
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder
} from "discord.js";

// Guard global para evitar múltiplas inicializações
if (globalThis.__SC_BLACKLIST_MINI_INSTALLED) {
  // já carregado
} else {
  globalThis.__SC_BLACKLIST_MINI_INSTALLED = true;
}

// ================== CONFIG ==================
const BLACKLIST_BUTTON_CHANNEL_ID = "1409223457446694992";
const BLACKLIST_ALLOWED_ROLES = [
  "1352493359897378941", // interação com o bot
  "1262262852949905408", // owner
  "660311795327828008",  // eu
  "1388976155830255697", // manager creator
];

const BLACKLIST_GIF =
  "https://cdn.discordapp.com/attachments/1362477839944777889/1384245215249825832/standard_2rss.gif";

// ids fixos de UI
const BTN_ID = "abrir_blacklist";
const MODAL_ID = "modal_blacklist";

const INPUT_ORG_ID = "input_org";
const INPUT_FAMILIA_ID = "input_familia";
const INPUT_RESP_AUTORIZOU_ID = "input_resp_autorizou";
const INPUT_MOTIVO_ID = "input_motivo";

// ================== PERMISSÃO ==================
function hasAnyAllowedRole(member) {
  try {
    if (member && BLACKLIST_ALLOWED_ROLES.includes(member.id)) return true;
    return BLACKLIST_ALLOWED_ROLES.some((r) => member?.roles?.cache?.has(r));
  } catch {
    return false;
  }
}

// ================== HELPERS ==================
function extractSnowflakeId(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  // aceita <@123>, <@!123> ou ID puro
  const m = s.match(/^<@!?(\d{15,21})>$/) || s.match(/(\d{15,21})/);
  return m ? m[1] : null;
}

// ================== UI HELPERS ==================
function buildBlacklistButtonRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(BTN_ID)
      .setLabel("🛑 Registrar BLACKLIST")
      .setStyle(ButtonStyle.Danger)
  );
}

function buildBlacklistModal() {
  const modal = new ModalBuilder()
    .setCustomId(MODAL_ID)
    .setTitle("Registrar BLACKLIST");

  const org = new TextInputBuilder()
    .setCustomId(INPUT_ORG_ID)
    .setLabel("Nome da organização")
    .setPlaceholder("Ex.: Família Aurora")
    .setRequired(true)
    .setStyle(TextInputStyle.Short);

  const fam = new TextInputBuilder()
    .setCustomId(INPUT_FAMILIA_ID)
    .setLabel("Família ativa")
    .setPlaceholder("Sim / Não — ou detalhe aqui")
    .setRequired(true)
    .setStyle(TextInputStyle.Short);

  const resp = new TextInputBuilder()
    .setCustomId(INPUT_RESP_AUTORIZOU_ID)
    .setLabel("Resp que autorizou (ID ou @menção)")
    .setPlaceholder("Ex.: 123456789012345678 ou @Resp")
    .setRequired(true)
    .setStyle(TextInputStyle.Short);

  const mot = new TextInputBuilder()
    .setCustomId(INPUT_MOTIVO_ID)
    .setLabel("Motivo da blacklist")
    .setPlaceholder("Descreva o motivo com detalhes")
    .setRequired(true)
    .setStyle(TextInputStyle.Paragraph);

  return modal.addComponents(
    new ActionRowBuilder().addComponents(org),
    new ActionRowBuilder().addComponents(fam),
    new ActionRowBuilder().addComponents(resp),
    new ActionRowBuilder().addComponents(mot)
  );
}

async function sendFreshBlacklistButton(channel, clientUser) {
  /*
   * Procura painéis antigos de blacklist.
   *
   * Remove:
   * - painel enviado pelo bot atual;
   * - painel enviado pelo bot antigo;
   * - qualquer mensagem de bot que possua o botão abrir_blacklist.
   *
   * Não remove registros de blacklist, pois os registros não possuem
   * o botão com customId abrir_blacklist.
   */
  try {
    let beforeId = null;
    let paginasLidas = 0;

    while (paginasLidas < 5) {
      const messages = await channel.messages
        .fetch({
          limit: 100,
          before: beforeId || undefined,
        })
        .catch(() => null);

      if (!messages || messages.size === 0) {
        break;
      }

      for (const msg of messages.values()) {
        const possuiBotaoBlacklist = msg.components?.some((row) =>
          row.components?.some(
            (component) => component.customId === BTN_ID
          )
        );

        if (msg.author?.bot && possuiBotaoBlacklist) {
          await msg.delete().catch((error) => {
            console.warn(
              `[Blacklist] Não consegui apagar o painel antigo ${msg.id}:`,
              error?.message || error
            );
          });
        }
      }

      beforeId = messages.last()?.id || null;
      paginasLidas++;

      if (!beforeId || messages.size < 100) {
        break;
      }
    }
  } catch (error) {
    console.error(
      "[Blacklist] Erro ao procurar painéis antigos:",
      error
    );
  }

  const embed = new EmbedBuilder()
    .setTitle("🛑 Blacklist – Registro")
    .setDescription(
      "Clique no botão abaixo para abrir o formulário e registrar uma blacklist."
    )
    .setImage(BLACKLIST_GIF)
    .setColor(0x8a2be2)
    .setFooter({ text: "SantaCreators • Blacklist" });

  const painel = await channel
    .send({
      embeds: [embed],
      components: [buildBlacklistButtonRow()],
    })
    .catch((error) => {
      console.error(
        "[Blacklist] Não consegui enviar o novo painel:",
        error
      );

      return null;
    });

  return painel;
}

// ================== EXPORTS ==================

// 1. Chamado no 'ready'
export async function blacklistFacsOnReady(client) {
  try {
    const ch = await client.channels
      .fetch(BLACKLIST_BUTTON_CHANNEL_ID)
      .catch(() => null);

    if (!ch || !ch.isTextBased()) {
      console.error(
        `[Blacklist] Canal inválido ou não encontrado: ${BLACKLIST_BUTTON_CHANNEL_ID}`
      );

      return false;
    }

    const painel = await sendFreshBlacklistButton(ch, client.user);

    if (!painel) {
      console.error(
        "[Blacklist] O canal foi encontrado, mas o painel não pôde ser criado."
      );

      return false;
    }

    console.log(
      `[Blacklist] ✅ Painel recriado automaticamente no canal ${ch.id}.`
    );

    return true;
  } catch (err) {
    console.error("[Blacklist] Erro no ready:", err);
    return false;
  }
}

// 2. Chamado no 'messageCreate' (!blacklistbtn)
export async function blacklistFacsHandleMessage(message, client) {
  try {
    if (!message.guild || message.author.bot) return false;

    const comandoValido =
      /^!blacklistbtn\b/i.test(message.content || "") ||
      /^!recriarblacklist\b/i.test(message.content || "");

    if (!comandoValido) return false;

    if (!hasAnyAllowedRole(message.member)) {
      await message
        .reply("❌ Você não tem permissão para recriar o painel de blacklist.")
        .catch(() => {});

      return true;
    }

    await message.delete().catch(() => {});

    const ch = await client.channels
      .fetch(BLACKLIST_BUTTON_CHANNEL_ID)
      .catch(() => null);

    if (!ch || !ch.isTextBased()) {
      return true;
    }

    const painel = await sendFreshBlacklistButton(ch, client.user);

    if (!painel) {
      console.error(
        "[Blacklist] Não foi possível recriar o painel manualmente."
      );
    }

    return true;
  } catch (err) {
    console.error("[Blacklist] erro no comando de recriação:", err);
    return false;
  }
}

// 3. Chamado no 'interactionCreate'
export async function blacklistFacsHandleInteraction(interaction, client) {
  try {
    if (!interaction.customId?.includes('blacklist')) return false;

    // Abrir modal
    if (interaction.isButton() && interaction.customId === BTN_ID) {
      if (!hasAnyAllowedRole(interaction.member)) {
        return interaction.reply({
          content: "❌ Você não tem permissão para abrir este formulário.",
          ephemeral: true,
        });
      }
      return interaction.showModal(buildBlacklistModal());
    }

    // Submeter modal
    if (interaction.isModalSubmit() && interaction.customId === MODAL_ID) {
      if (!hasAnyAllowedRole(interaction.member)) {
        return interaction.reply({
          content: "❌ Você não tem permissão para enviar este formulário.",
          ephemeral: true,
        });
      }

      await interaction.deferReply({ ephemeral: true }).catch(() => {});

      const org = interaction.fields.getTextInputValue(INPUT_ORG_ID)?.trim().slice(0, 256) || "-";
      const familia = interaction.fields.getTextInputValue(INPUT_FAMILIA_ID)?.trim().slice(0, 256) || "-";
      const motivo = interaction.fields.getTextInputValue(INPUT_MOTIVO_ID)?.trim().slice(0, 1024) || "-";

      const respRaw = interaction.fields
        .getTextInputValue(INPUT_RESP_AUTORIZOU_ID)
        ?.trim()
        .slice(0, 128) || "";

      const respId = extractSnowflakeId(respRaw);

      if (!respId) {
        return interaction.editReply(
          "❌ ID do Resp inválido. Envie um **ID** (números) ou uma **menção** (@Resp)."
        );
      }

      const registro = new EmbedBuilder()
        .setTitle("🛑 REGISTRO DE BLACKLIST")
        .setColor(0xff0040)
        .addFields(
          { name: "Organização", value: org, inline: true },
          { name: "Família Ativa", value: familia, inline: true },
          { name: "Resp que autorizou", value: `<@${respId}>`, inline: false },
          { name: "Motivo", value: motivo, inline: false }
        )
        .setImage(BLACKLIST_GIF)
        .setFooter({ text: `Registrado por: ${interaction.user.tag}` })
        .setTimestamp();

      const ch = await interaction.client.channels.fetch(BLACKLIST_BUTTON_CHANNEL_ID).catch(() => null);
      if (!ch || !ch.isTextBased()) {
        return interaction.editReply("⚠️ Não consegui acessar o canal de registros.");
      }

      // ✅ Menciona quem registrou + quem autorizou
      await ch.send({
        content: `📌 Registro por <@${interaction.user.id}> • ✅ Autorizado por <@${respId}>`,
        embeds: [registro],
      }).catch(() => {});

      await interaction.editReply("✅ Blacklist registrada com sucesso!");

      // reexibe um único botão “limpo” no final
      await sendFreshBlacklistButton(ch, client.user);
      return true;
    }
  } catch (err) {
    console.error("[Blacklist] Erro na interação:", err);
    try {
      if (interaction?.isRepliable?.()) {
        if (interaction.deferred) await interaction.editReply("⚠️ Ocorreu um erro ao processar a ação.");
        else await interaction.reply({ content: "⚠️ Ocorreu um erro ao processar a ação.", ephemeral: true });
      }
    } catch {}
  }
  return false;
}
