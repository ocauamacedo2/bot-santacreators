// /application/events/blacklistFacs.js
import { runSiteOperation } from "../utils/siteOperationJournal.js";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder
} from "discord.js";

import {
  isOfficialSantaCreatorsTeamMember,
} from "./hierarquiaDivisoes.js";

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
  const m =
    s.match(/^<@!?(\d{17,20})>$/) ||
    s.match(/^(\d{17,20})$/);
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
export async function getBlacklistSiteSnapshot({
  client,
  guild,
  member,
  before,
}) {
  const sameGuild =
    member?.guild?.id === guild.id;

  const communityReader =
    sameGuild &&
    (
      member.id === '660311795327828008' ||
      isOfficialSantaCreatorsTeamMember(member) ||
      hasAnyAllowedRole(member) ||
      member.roles.cache.has('1353858422063239310') ||
      member.roles.cache.has('1352275728476930099') ||
      (
        member.roles.cache.has('1262978759922028575') &&
        !member.roles.cache.has('1430984036972494908')
      )
    );

  if (!communityReader) {
    throw Object.assign(
      new Error(
        'Seu acesso atual não permite consultar a blacklist.'
      ),
      { status: 403 }
    );
  }

  const cursor = String(before || '');

  if (
    cursor &&
    !/^\d{17,20}$/.test(cursor)
  ) {
    throw Object.assign(
      new Error('Página de blacklist inválida.'),
      { status: 400 }
    );
  }

  const channel = await client.channels.fetch(
    BLACKLIST_BUTTON_CHANNEL_ID
  );

  if (
    channel?.guildId !== guild.id ||
    !channel.isTextBased()
  ) {
    throw Object.assign(
      new Error('O canal de blacklist está indisponível.'),
      { status: 503 }
    );
  }

  const page = await channel.messages.fetch({
    limit: 100,
    ...(cursor ? { before: cursor } : {}),
  });

  const readable = value => String(value || '')
    .replace(
      /<@&(\d{17,20})>/g,
      (_, id) =>
        guild.roles.cache.get(id)?.name ||
        'Organização'
    )
    .replace(
      /<@!?(\d{17,20})>/g,
      (_, id) =>
        guild.members.cache.get(id)?.displayName ||
        'Responsável'
    )
    .replace(/[*_`]/g, '')
    .trim();

  const records = [];

  for (const message of page.values()) {
    const embed = message.embeds[0];

    if (
      message.author?.id !== client.user.id ||
      embed?.title !== '🛑 REGISTRO DE BLACKLIST'
    ) {
      continue;
    }

    const field = name => readable(
      (embed.fields || []).find(
        item => item.name === name
      )?.value
    );

    records.push({
      name: field('Organização'),
      family: field('Família Ativa'),
      responsible: field('Resp que autorizou'),
      reason: field('Motivo'),
      image: embed.image?.url || '',
      at: message.createdTimestamp,
      url: message.url,
    });
  }

  return {
    records,

    rights: {
      view: true,
      create: hasAnyAllowedRole(member),
    },

    nextBefore:
      page.size === 100
        ? page.last()?.id || null
        : null,

    generatedAt: Date.now(),
  };
}

const blacklistSiteLocks = new Set();

export async function submitBlacklistFromSite(options) {
  return runSiteOperation({
    action: 'orgblacklist.submit',
    guildId: options.guild.id,
    actorId: options.actorId,
    payload: options.payload || {},
    authorize: async () => {
      const member = await options.guild.members.fetch({
        user: String(options.actorId), force: true,
      });

      if (
        member.guild.id !== options.guild.id ||
        !hasAnyAllowedRole(member)
      ) {
        throw Object.assign(
          new Error('Seu acesso atual não permite este registro.'),
          { status: 403 }
        );
      }
    },
    execute: () => executeBlacklistFromSite(options),
  });
}

async function executeBlacklistFromSite({
  client,
  guild,
  actorId,
  payload = {},
}) {
  const lockKey =
    `${guild.id}:${actorId}`;

  if (blacklistSiteLocks.has(lockKey)) {
    throw Object.assign(
      new Error(
        "Já existe um cadastro de blacklist em processamento para sua conta."
      ),
      { status: 409 }
    );
  }

  blacklistSiteLocks.add(lockKey);

  try {
    const member =
      await guild.members.fetch({
        user: String(actorId),
        force: true,
      });

    if (
      member.guild.id !== guild.id ||
      !hasAnyAllowedRole(member)
    ) {
      throw Object.assign(
        new Error(
          "Seu cargo atual não permite cadastrar blacklist."
        ),
        { status: 403 }
      );
    }

    const fields = {
      [INPUT_ORG_ID]:
        String(payload.org || "").trim(),

      [INPUT_FAMILIA_ID]:
        String(payload.familia || "").trim(),

      [INPUT_RESP_AUTORIZOU_ID]:
        String(payload.resp || "").trim(),

      [INPUT_MOTIVO_ID]:
        String(payload.motivo || "").trim(),
    };

    const limits = {
      [INPUT_ORG_ID]: 256,
      [INPUT_FAMILIA_ID]: 256,
      [INPUT_RESP_AUTORIZOU_ID]: 128,
      [INPUT_MOTIVO_ID]: 1024,
    };

    for (const [key, value] of Object.entries(fields)) {
      if (!value || value.length > limits[key]) {
        throw Object.assign(
          new Error(
            "Preencha organização, família, responsável e motivo dentro dos limites do formulário."
          ),
          { status: 400 }
        );
      }
    }

    if (
      !extractSnowflakeId(
        fields[INPUT_RESP_AUTORIZOU_ID]
      )
    ) {
      throw Object.assign(
        new Error(
          "Informe um ID Discord válido ou a menção do responsável."
        ),
        { status: 400 }
      );
    }

    const interaction = {
      siteOrigin: true,
      client,
      guild,
      guildId: guild.id,
      member,
      user: member.user,
      customId: MODAL_ID,
      deferred: false,
      replied: false,
      lastReply: null,

      fields: {
        getTextInputValue(key) {
          return fields[key] || "";
        },
      },

      isButton() {
        return false;
      },

      isModalSubmit() {
        return true;
      },

      isRepliable() {
        return true;
      },

      async deferReply() {
        this.deferred = true;
      },

      async reply(value) {
        this.replied = true;
        this.lastReply = value;
        return value;
      },

      async editReply(value) {
        this.lastReply = value;
        return value;
      },
    };

    await blacklistFacsHandleInteraction(
      interaction,
      client
    );

    if (!interaction.__scBlacklistApplied) {
      const reply =
        interaction.lastReply;

      throw Object.assign(
        new Error(
          typeof reply === "string"
            ? reply
            : reply?.content ||
              "O cadastro de blacklist não foi confirmado."
        ),
        { status: 409 }
      );
    }

    return {
      ok: true,

      message:
        "Blacklist registrada no Discord.",

      ...interaction.__scBlacklistApplied,
    };
  } finally {
    blacklistSiteLocks.delete(lockKey);
  }
}

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

      const ch =
        await interaction.client.channels.fetch(
          BLACKLIST_BUTTON_CHANNEL_ID
        ).catch(() => null);

      if (
        !ch ||
        !ch.isTextBased() ||
        typeof ch.send !== "function" ||
        ch.guildId !== interaction.guildId
      ) {
        return interaction.editReply(
          "⚠️ Não consegui acessar o canal de registros deste servidor."
        );
      }

      // ✅ Menciona quem registrou + quem autorizou
      const publishedBlacklist = await ch.send({
        content: `📌 Registro por <@${interaction.user.id}> • ✅ Autorizado por <@${respId}>`,
        embeds: [registro],
      });

      interaction.__scBlacklistApplied = {
        messageId: publishedBlacklist.id,
        url: publishedBlacklist.url,
      };

      await interaction.editReply(
        "✅ Blacklist registrada com sucesso!"
      );

      // reexibe um único botão “limpo” no final
      if (interaction.siteOrigin !== true) {
        await sendFreshBlacklistButton(
          ch,
          client.user
        ).catch(error => {
          console.warn(
            "[Blacklist] Registro publicado, mas o painel não foi atualizado:",
            error
          );
        });
      }

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
