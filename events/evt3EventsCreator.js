// /application/events/evt3EventsCreator.js
// EVT3_EVENTSCREATOR (HOOKS) — Evento cria thread no canal A, menus criam threads no canal B
// ✅ Hook-based: SEM client.on aqui dentro
// ✅ 1 clique por botão (links/audios/adms/org) + trava anti double-click
// ✅ ADMS igual aos outros (thread pública normal)
// ✅ Estado em: /application/data/evt3_events_state.json
//
// ✅ FIX (botão fixo):
// - Reinício do bot NÃO cria outro botão se já existir
// - Só troca (apaga + manda novo) quando criar um NOVO EVENTO (ou comando !evt3)
// - Cleanup remove botões duplicados e garante no máximo 1

import fs from "node:fs";
import path from "node:path";
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
} from "discord.js";

// =========================
// EVT3 CONFIG
// =========================
const EVT3_EVENT_CHANNEL_ID = "1457573495952248883"; // canal do evento (thread principal + botão "Criar Evento")
const EVT3_MENU_CHANNEL_ID = "1457577651152883797"; // canal onde criam os tópicos dos botões
const EVT3_BUTTON_CHANNEL_ID = "1457573495952248883"; // onde fica a msg com botão "Criar Evento"

// =========================
// EVT3 PERMISSÕES
// =========================
const EVT3_ROLE_OWNER_ID = "1262262852949905408";
const EVT3_USER_VOCE_ID = "660311795327828008";
const EVT3_ROLE_RESPONSAVEIS_ID = "1414651836861907006";
const EVT3_ROLE_MKT_TICKET_ID = "1282119104576098314";
const EVT3_ROLE_SOCIAL_MEDIAS_ID = "1387253972661964840";

const EVT3_ALLOWED_IDS = [
  EVT3_ROLE_OWNER_ID,
  EVT3_USER_VOCE_ID,
  EVT3_ROLE_RESPONSAVEIS_ID,
  EVT3_ROLE_MKT_TICKET_ID,
  EVT3_ROLE_SOCIAL_MEDIAS_ID,
];

// =========================
// EVT3 PERSISTÊNCIA (MESMO ARQUIVO que payEvtDash lê)
// =========================
const EVT3_DATA_DIR = path.resolve(process.cwd(), "data");
const EVT3_STATE_FILE = path.resolve(EVT3_DATA_DIR, "evt3_events_state.json");

function EVT3_ensureDir() {
  if (!fs.existsSync(EVT3_DATA_DIR)) fs.mkdirSync(EVT3_DATA_DIR, { recursive: true });
}

function EVT3_readState() {
  EVT3_ensureDir();
  if (!fs.existsSync(EVT3_STATE_FILE)) {
    return {
      evt3ButtonMessageId: null,
      evt3ButtonChannelId: EVT3_BUTTON_CHANNEL_ID,
      evt3Events: {},
    };
  }
  try {
    const data = JSON.parse(fs.readFileSync(EVT3_STATE_FILE, "utf8"));
    return {
      evt3ButtonMessageId: data?.evt3ButtonMessageId ?? null,
      evt3ButtonChannelId: data?.evt3ButtonChannelId ?? EVT3_BUTTON_CHANNEL_ID,
      evt3Events: data?.evt3Events ?? {},
    };
  } catch {
    return {
      evt3ButtonMessageId: null,
      evt3ButtonChannelId: EVT3_BUTTON_CHANNEL_ID,
      evt3Events: {},
    };
  }
}

function EVT3_writeState(state) {
  EVT3_ensureDir();
  fs.writeFileSync(EVT3_STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

// =========================
// EVT3 TRAVA ANTI-DOUBLE CLICK (RACE)
// =========================
const EVT3_LOCKS = new Set(); // "mainThreadId:type"

// =========================
// HELPERS
// =========================
function EVT3_hasPerm(member, userId) {
  const roles = member?.roles?.cache;
  const byRole = roles?.some((r) => EVT3_ALLOWED_IDS.includes(r.id));
  const byUser = EVT3_ALLOWED_IDS.includes(userId);
  return Boolean(byRole || byUser);
}

function EVT3_areaLabel(type) {
  if (type === "links") return "MENU DE LINKS";
  if (type === "audios") return "ÁUDIOS";
  if (type === "adms") return "ADMS";
  if (type === "org") return "ORGANIZAÇÃO";
  return "MENU";
}

function EVT3_areaEmoji(type) {
  if (type === "links") return "🔗";
  if (type === "audios") return "🎧";
  if (type === "adms") return "🧑‍💼";
  if (type === "org") return "📋";
  return "📌";
}

function EVT3_buildCreateButtonRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("EVT3_open_create_modal")
      .setLabel("➕ Criar Evento")
      .setStyle(ButtonStyle.Primary)
  );
}

function EVT3_buildMenuRow(mainThreadId, areas) {
  const done = (k) => Boolean(areas?.[k]?.done);

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`EVT3_menu_links_${mainThreadId}`)
      .setLabel("MENU DE LINKS")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(done("links")),

    new ButtonBuilder()
      .setCustomId(`EVT3_menu_audios_${mainThreadId}`)
      .setLabel("ÁUDIOS")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(done("audios")),

    new ButtonBuilder()
      .setCustomId(`EVT3_menu_adms_${mainThreadId}`)
      .setLabel("ADMS")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(done("adms")),

    new ButtonBuilder()
      .setCustomId(`EVT3_menu_org_${mainThreadId}`)
      .setLabel("ORGANIZAÇÃO")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(done("org"))
  );
}

// =========================
// BOTÃO FIXO (ANTI-SPAM)
// =========================

function EVT3_isCreateButtonMessage(msg) {
  try {
    if (!msg) return false;
    if (msg.author?.bot !== true) return false;

    const rows = msg.components || [];
    if (!rows.length) return false;

    for (const row of rows) {
      const comps = row?.components || [];
      for (const c of comps) {
        // discord.js v14: ButtonComponent
        if (c?.customId === "EVT3_open_create_modal") return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

async function EVT3_fetchButtonMessage(client, state) {
  try {
    if (!state?.evt3ButtonChannelId || !state?.evt3ButtonMessageId) return null;

    const ch = await client.channels.fetch(state.evt3ButtonChannelId).catch(() => null);
    if (!ch?.isTextBased?.()) return null;

    const msg = await ch.messages.fetch(state.evt3ButtonMessageId).catch(() => null);
    if (!msg) return null;

    // Confere se é realmente a mensagem do nosso botão
    if (!EVT3_isCreateButtonMessage(msg)) return null;

    return msg;
  } catch {
    return null;
  }
}

async function EVT3_cleanupDuplicateButtons(client) {
  // Apaga botões duplicados no canal, mantendo no máximo 1 (o mais novo)
  const ch = await client.channels.fetch(EVT3_BUTTON_CHANNEL_ID).catch(() => null);
  if (!ch?.isTextBased?.()) return { keptId: null };

  const fetched = await ch.messages.fetch({ limit: 50 }).catch(() => null);
  if (!fetched) return { keptId: null };

  const candidates = [];
  for (const msg of fetched.values()) {
    if (EVT3_isCreateButtonMessage(msg)) candidates.push(msg);
  }

  if (candidates.length === 0) return { keptId: null };

  // Ordena por data (mais novo primeiro)
  candidates.sort((a, b) => (b.createdTimestamp || 0) - (a.createdTimestamp || 0));

  const keep = candidates[0];
  const toDelete = candidates.slice(1);

  for (const m of toDelete) {
    await m.delete().catch(() => {});
  }

  // Atualiza state pra apontar pro que ficou
  const state = EVT3_readState();
  state.evt3ButtonChannelId = EVT3_BUTTON_CHANNEL_ID;
  state.evt3ButtonMessageId = keep.id;
  EVT3_writeState(state);

  return { keptId: keep.id };
}

async function EVT3_postNewButton(client) {
  const ch = await client.channels.fetch(EVT3_BUTTON_CHANNEL_ID).catch(() => null);
  if (!ch?.isTextBased?.()) return null;

  const sent = await ch
    .send({
      content: "**Clique abaixo para criar um novo evento:**",
      components: [EVT3_buildCreateButtonRow()],
    })
    .catch(() => null);

  if (!sent) return null;

  const state = EVT3_readState();
  state.evt3ButtonMessageId = sent.id;
  state.evt3ButtonChannelId = EVT3_BUTTON_CHANNEL_ID;
  EVT3_writeState(state);

  return sent;
}

async function EVT3_deleteTrackedButtonIfExists(client) {
  const state = EVT3_readState();

  const msg = await EVT3_fetchButtonMessage(client, state);
  if (!msg) {
    // se o state tá apontando pra algo inexistente, limpa
    state.evt3ButtonMessageId = null;
    state.evt3ButtonChannelId = EVT3_BUTTON_CHANNEL_ID;
    EVT3_writeState(state);
    return false;
  }

  await msg.delete().catch(() => {});
  state.evt3ButtonMessageId = null;
  state.evt3ButtonChannelId = EVT3_BUTTON_CHANNEL_ID;
  EVT3_writeState(state);
  return true;
}

/**
 * Garante 1 botão fixo.
 * - forceRefresh=false: não recria se já existir (ideal pro READY)
 * - forceRefresh=true: apaga o antigo e cria outro (ideal quando cria novo evento)
 */
async function EVT3_ensureSingleCreateButton(client, { forceRefresh = false } = {}) {
  // 1) faz um cleanup rápido (remove duplicados) sempre
  await EVT3_cleanupDuplicateButtons(client);

  const state = EVT3_readState();
  const existing = await EVT3_fetchButtonMessage(client, state);

  if (existing && !forceRefresh) {
    // já existe e não é pra trocar
    return { ok: true, action: "kept", messageId: existing.id };
  }

  if (forceRefresh) {
    await EVT3_deleteTrackedButtonIfExists(client);
  }

  // depois de refresh (ou se não existia), garante que tem um
  const state2 = EVT3_readState();
  const existing2 = await EVT3_fetchButtonMessage(client, state2);
  if (existing2) {
    return { ok: true, action: "kept", messageId: existing2.id };
  }

  const posted = await EVT3_postNewButton(client);
  if (!posted) return { ok: false, action: "failed", messageId: null };

  // por segurança: se por algum motivo duplicou, limpa de novo e mantém 1
  await EVT3_cleanupDuplicateButtons(client);

  const finalState = EVT3_readState();
  return { ok: true, action: "posted", messageId: finalState.evt3ButtonMessageId };
}

// =========================
// MENU THREADS (NO CANAL B)
// =========================
function EVT3_menuThreadName(type, eventName) {
  const base = (eventName || "Evento").slice(0, 60);
  const short = `${EVT3_areaEmoji(type)} ${type.toUpperCase()} • ${base}`;
  return short.slice(0, 100);
}

async function EVT3_createMenuThread({ client, guild, type, eventName, mainThreadId, openerUserId }) {
  const menusChannel = await client.channels.fetch(EVT3_MENU_CHANNEL_ID).catch(() => null);
  if (!menusChannel?.isTextBased?.()) return null;

  const t = await menusChannel.threads.create({
    name: EVT3_menuThreadName(type, eventName),
    autoArchiveDuration: 1440,
    type: ChannelType.PublicThread,
    reason: `EVT3 menu ${type} do evento ${eventName}`,
  });

  const mainLink = `https://discord.com/channels/${guild.id}/${mainThreadId}`;

  await t
    .send({
      content:
        `🧷 **Área: ${EVT3_areaLabel(type)}**\n` +
        `Evento principal: ${mainLink}\n` +
        `Aberta por: <@${openerUserId}>`,
    })
    .catch(() => {});

  return t;
}

async function EVT3_updatePanelButtons(client, mainThreadId) {
  const state = EVT3_readState();
  const evt = state.evt3Events?.[mainThreadId];
  if (!evt?.panelMessageId) return;

  const mainThread = await client.channels.fetch(mainThreadId).catch(() => null);
  if (!mainThread?.isThread?.()) return;

  const panelMsg = await mainThread.messages.fetch(evt.panelMessageId).catch(() => null);
  if (!panelMsg) return;

  const row = EVT3_buildMenuRow(mainThreadId, evt.areas);
  await panelMsg.edit({ components: [row] }).catch(() => {});
}

// =====================================================
// EXPORTS (HOOKS)
// =====================================================
export async function evt3EventsOnReady(client) {
  if (client.__EVT3_EVENTS_READY__) return;
  client.__EVT3_EVENTS_READY__ = true;

  // ✅ No ready: NÃO recria se já existir (evita spam em reinício)
  await EVT3_ensureSingleCreateButton(client, { forceRefresh: false });

  // console.log("✅ [EVT3] EventsCreator pronto.");
}

export async function evt3EventsHandleMessage(message, client) {
  try {
    if (!message?.guild || message.author?.bot) return false;

    const txt = (message.content || "").trim().toLowerCase();
    if (txt === "!evt3") {
      if (!EVT3_hasPerm(message.member, message.author.id)) {
        await message.reply("🚫 Sem permissão.").catch(() => {});
        return true;
      }

      // comando manual: força refresh (apaga + manda novo)
      await EVT3_ensureSingleCreateButton(client, { forceRefresh: true });
      await message.reply("✅ EVT3 botão atualizado (refresh).").catch(() => {});
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

export async function evt3EventsHandleInteraction(interaction, client) {
  try {
    // BOTÃO: abrir modal (criar evento)
    if (interaction.isButton() && interaction.customId === "EVT3_open_create_modal") {
      if (!EVT3_hasPerm(interaction.member, interaction.user.id)) {
        return interaction.reply({ content: "🚫 Sem permissão.", ephemeral: true });
      }

      const modal = new ModalBuilder()
        .setCustomId("EVT3_create_event_modal")
        .setTitle("Criar Evento")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("EVT3_event_name")
              .setLabel("Nome do evento")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("EVT3_creator_id")
              .setLabel("ID do Discord de quem criou o evento")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );

      await interaction.showModal(modal);
      return true;
    }

    // MODAL: cria thread principal no canal A
    if (interaction.isModalSubmit() && interaction.customId === "EVT3_create_event_modal") {
      await interaction.deferReply({ ephemeral: true });

      const eventName = interaction.fields.getTextInputValue("EVT3_event_name").trim();
      const creatorId = interaction.fields.getTextInputValue("EVT3_creator_id").trim();

      const parent = await client.channels.fetch(EVT3_EVENT_CHANNEL_ID).catch(() => null);
      if (!parent?.isTextBased?.()) {
        await interaction.editReply("❌ Canal do evento inválido.");
        return true;
      }

      const mainThread = await parent.threads.create({
        name: `🎉 Evento • ${eventName}`.slice(0, 100),
        autoArchiveDuration: 1440,
        reason: "EVT3 criação de evento",
      });

      const embed = new EmbedBuilder()
        .setTitle(`🎉 ${eventName}`)
        .setDescription(`👤 **Criador do evento:** <@${creatorId}>`)
        .setColor("Purple");

      const areas = {
        links: { done: false, threadId: null },
        audios: { done: false, threadId: null },
        adms: { done: false, threadId: null },
        org: { done: false, threadId: null },
      };

      const panelMsg = await mainThread.send({
        embeds: [embed],
        components: [EVT3_buildMenuRow(mainThread.id, areas)],
      });

      const state = EVT3_readState();
      state.evt3Events[mainThread.id] = {
        eventName,
        creatorId,
        panelMessageId: panelMsg.id,
        areas,
      };
      EVT3_writeState(state);

      // ✅ Quando cria NOVO EVENTO: aí sim troca o botão (apaga antigo e manda novo)
      await EVT3_ensureSingleCreateButton(client, { forceRefresh: true });

      await interaction.editReply(`✅ Evento criado: ${mainThread.toString()}`);
      return true;
    }

    // BOTÕES DOS MENUS (1 clique)
    if (interaction.isButton() && interaction.customId.startsWith("EVT3_menu_")) {
      if (!EVT3_hasPerm(interaction.member, interaction.user.id)) {
        return interaction.reply({ content: "🚫 Sem permissão.", ephemeral: true });
      }

      // EVT3_menu_<type>_<mainThreadId>
      const parts = interaction.customId.split("_");
      const type = parts[2];
      const mainThreadId = parts[3];

      const lockKey = `${mainThreadId}:${type}`;
      if (EVT3_LOCKS.has(lockKey)) {
        await interaction.reply({ content: "⏳ Já tô criando essa área…", ephemeral: true }).catch(() => {});
        return true;
      }

      const state = EVT3_readState();
      const evt = state.evt3Events?.[mainThreadId];
      if (!evt) {
        await interaction.reply({ content: "❌ Evento não encontrado no state.", ephemeral: true }).catch(() => {});
        return true;
      }

      const area = evt.areas?.[type];
      if (area?.done && area?.threadId) {
        const existing = await client.channels.fetch(area.threadId).catch(() => null);
        if (existing) {
          await interaction
            .reply({
              content: `⚠️ Esse menu já foi criado e só pode 1 vez. Aqui: ${existing.toString()}`,
              ephemeral: true,
            })
            .catch(() => {});
          return true;
        }
        // se thread sumiu, permite recriar
      }

      EVT3_LOCKS.add(lockKey);
      await interaction.deferReply({ ephemeral: true });

      try {
        const guild = interaction.guild;

        const newThread = await EVT3_createMenuThread({
          client,
          guild,
          type,
          eventName: evt.eventName,
          mainThreadId,
          openerUserId: interaction.user.id,
        });

        if (!newThread) {
          await interaction.editReply("❌ Não consegui criar o menu (canal inválido/permissão).").catch(() => {});
          return true;
        }

        evt.areas[type] = { done: true, threadId: newThread.id };
        state.evt3Events[mainThreadId] = evt;
        EVT3_writeState(state);

        await EVT3_updatePanelButtons(client, mainThreadId);

        const mainThread = await client.channels.fetch(mainThreadId).catch(() => null);
        if (mainThread?.isThread?.()) {
          await mainThread
            .send({
              content: `📌 Área **${EVT3_areaLabel(type)}:** ${newThread.toString()} (no canal <#${EVT3_MENU_CHANNEL_ID}>)`,
            })
            .catch(() => {});
        }

        await interaction.editReply(`✅ Área **${EVT3_areaLabel(type)}** criada: ${newThread.toString()}`).catch(() => {});
        return true;
      } finally {
        EVT3_LOCKS.delete(lockKey);
      }
    }

    return false;
  } catch (err) {
    console.error("❌ [EVT3] erro:", err);

    if (interaction?.isRepliable?.()) {
      if (interaction.deferred) {
        await interaction.editReply({ content: "❌ Deu erro aqui. Olha o console do bot." }).catch(() => {});
        return true;
      }
      if (!interaction.replied) {
        await interaction.reply({ content: "❌ Deu erro aqui. Olha o console do bot.", ephemeral: true }).catch(() => {});
        return true;
      }
    }
    return false;
  }
}
