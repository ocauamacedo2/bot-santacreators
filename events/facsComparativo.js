// /application/events/facsComparativo.js
// SC_FACS_COMPARATIVO v1.1 — SOMENTE ORGS NÃO CONVIDADAS
// ✅ Permissões travadas por cargos definidos
// ❌ Remove preview de aprovadas
// ✅ Painel limpo, direto e funcional

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
} from "discord.js";

// ===============================
// CONFIG
// ===============================

const COMP_CHANNEL_ID = "1465142628839456829";

const COMP_BTN_SETMASTER = "sc_facscomp_setmaster";
const COMP_BTN_REFRESH   = "sc_facscomp_refresh";
const COMP_BTN_FINALIZE  = "sc_facscomp_finalize";
const COMP_BTN_RESETDRAFT = "sc_facscomp_resetdraft";
const COMP_BTN_CLEARMSTR = "sc_facscomp_clearmaster";

const COMP_MODAL_SETMASTER = "sc_facscomp_modal_setmaster";
const COMP_MODAL_INPUT_TEXT = "sc_facscomp_modal_text";

// 🔒 PERMISSÕES — SOMENTE ESSES
const MASTER_ALLOWED = {
  userIds: new Set([
    "660311795327828008",
    "1262262852949905408",
  ]),
  roleIds: new Set([
    "1282119104576098314",
    "1262262852949905409",
    "1414651836861907006",
    "1352408327983861844",
    "1352407252216184833",
  ]),
};

// ===============================
// STATE STORE (painel)
// ===============================

const STATE_PATH = "./facs_comparativo_state.json";

function loadState() {
  try {
    if (!fs.existsSync(STATE_PATH)) {
      return { channelId: COMP_CHANNEL_ID, messageId: null };
    }
    const raw = fs.readFileSync(STATE_PATH, "utf-8");
    return raw
      ? JSON.parse(raw)
      : { channelId: COMP_CHANNEL_ID, messageId: null };
  } catch {
    return { channelId: COMP_CHANNEL_ID, messageId: null };
  }
}

function saveState(state) {
  try {
    fs.writeFileSync(
      STATE_PATH,
      JSON.stringify(state, null, 2)
    );
  } catch {}
}

// ===============================
// MASTER STORE
// ===============================

// ===============================
// MASTER STORE
// ===============================

const MASTER_PATH = "./facs_comparativo_master.json";

function loadMaster() {
  try {
    if (!fs.existsSync(MASTER_PATH)) return [];
    const raw = fs.readFileSync(MASTER_PATH, "utf-8");
    const data = raw ? JSON.parse(raw) : {};
    return Array.isArray(data.orgs) ? data.orgs : [];
  } catch {
    return [];
  }
}

function saveMaster(orgs) {
  try {
    fs.writeFileSync(
      MASTER_PATH,
      JSON.stringify({ orgs }, null, 2)
    );
  } catch {}
}

// ===============================
// NORMALIZA + HELPERS
// ===============================

function extractOrgName(str) {
  const raw = String(str || "").trim();
  if (!raw) return "";

  // Se vier "Família | ORG", pega só a ORG
  const parts = raw.split("|").map(p => p.trim()).filter(Boolean);
  if (parts.length >= 2) return parts[parts.length - 1];

  return raw;
}

function norm(str) {
  return extractOrgName(str)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}


function chunkLines(lines, maxChars = 900) {
  const out = [];
  let buf = "";

  for (const line of lines) {
    if ((buf + line + "\n").length > maxChars) {
      out.push(buf);
      buf = "";
    }
    buf += line + "\n";
  }

  if (buf) out.push(buf);
  return out.length ? out : ["_(vazio)_"];
}

// ===============================
// EMBED — SOMENTE NÃO CONVIDADAS
// ===============================

// ===============================
function buildComparativoEmbed({ master, missing }) {
  const e = new EmbedBuilder()
    .setColor("Red")
    .setTitle("❌ ORGS NÃO CONVIDADAS")
    .setDescription(
      [
        `📦 **TOTAL NA MASTER:** ${master.length}`,
        `❌ **NÃO convidadas:** ${missing.length}`,
        "",
        "🧠 Mostra **SOMENTE NOMES**",
        "📌 Atualização automática",
      ].join("\n")
    )
    .setTimestamp();

  const missingSorted = [...missing].sort((a, b) =>
    norm(a).localeCompare(norm(b))
  );

  const parts = chunkLines(missingSorted.map(x => `• ${x}`), 900);

  let idx = 1;
  for (const p of parts) {
    e.addFields({
      name: idx === 1
        ? `❌ NÃO CONVIDADAS (${missingSorted.length})`
        : `❌ NÃO CONVIDADAS (cont. ${idx})`,
      value: "```diff\n" + p + "\n```",
      inline: false,
    });
    idx++;
    if (idx > 6) break;
  }

  return e;
}


// ===============================
// ===============================
// FACS SEMANAIS (ORGs CONVIDADAS)
// ===============================

const FACS_STORE_PATH = "./facs_semanais.json";

function loadInvitedNamesFromFacsStore() {
  try {
    if (!fs.existsSync(FACS_STORE_PATH)) return [];

    const raw = fs.readFileSync(FACS_STORE_PATH, "utf-8");
    if (!raw) return [];

    const data = JSON.parse(raw);

    // aceita dois formatos sem quebrar outros sistemas:
    // { lista: "Org1\nOrg2" }
    // { orgs: ["Org1", "Org2"] }

    if (Array.isArray(data.orgs)) {
      return data.orgs
        .map(x => String(x).trim())
        .filter(Boolean);
    }

    if (typeof data.lista === "string") {
      return data.lista
        .split("\n")
        .map(l => l.trim())
        .filter(Boolean);
    }

    return [];
  } catch {
    return [];
  }
}

// ===============================
// UPDATE PANEL (AJUSTADO)
// ===============================

async function updatePanel(client) {
  const master = loadMaster();
  const invited = loadInvitedNamesFromFacsStore();

  const invitedSet = new Set(invited.map(x => norm(x)));
  const missing = master.filter(m => !invitedSet.has(norm(m)));

  const msg = await ensurePanelMessage(client);
  if (!msg) return false;

  const emb = buildComparativoEmbed({ master, missing });

  await msg.edit({
    content: "‎",
    embeds: [emb],
    components: [buildComparativoRow()],
  }).catch(() => {});

  return true;
}




// ===============================
// PAINEL UPDATE
// ===============================
function buildComparativoRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(COMP_BTN_SETMASTER)
      .setLabel("📥 Colar MASTER")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId(COMP_BTN_FINALIZE)
      .setLabel("✅ Finalizar MASTER")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId(COMP_BTN_RESETDRAFT)
      .setLabel("🧹 Reset rascunho")
      .setStyle(ButtonStyle.Danger),

    // ✅ NOVO: zerar MASTER
    new ButtonBuilder()
      .setCustomId(COMP_BTN_CLEARMSTR)
      .setLabel("🧨 Zerar MASTER")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId(COMP_BTN_REFRESH)
      .setLabel("🔄 Atualizar")
      .setStyle(ButtonStyle.Secondary),
  );
}



async function ensurePanelMessage(client) {
  const st = loadState();

  const ch = await client.channels.fetch(COMP_CHANNEL_ID).catch(() => null);
  if (!ch?.isTextBased?.()) return null;

  // tenta buscar a msg anterior
  if (st.messageId) {
    const prev = await ch.messages.fetch(st.messageId).catch(() => null);
    if (prev) return prev;
  }

  // cria nova
  const created = await ch
    .send({
      content: "‎",
      embeds: [new EmbedBuilder().setDescription("Carregando...")],
      components: [buildComparativoRow()],
    })
    .catch(() => null);

  if (!created) return null;

  saveState({ channelId: COMP_CHANNEL_ID, messageId: created.id });
  return created;
}



// ===============================
// PERMISSÃO
// ===============================
function canSetMaster(member, userId) {
  try {
    if (MASTER_ALLOWED.userIds.has(String(userId))) return true;
    for (const rid of MASTER_ALLOWED.roleIds) {
      if (member?.roles?.cache?.has(rid)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

// ===============================
// EXPORTS (HOOKS)
// ===============================
export async function facsComparativoOnReady(client) {
  // guard
  if (client.__SC_FACS_COMPARATIVO_ACTIVE) return;
  client.__SC_FACS_COMPARATIVO_ACTIVE = true;

  // ✅ expõe um "force update" global pra outros módulos chamarem sem import
  globalThis.__FACS_COMPARATIVO_FORCE_UPDATE__ = async () => {
    try { return await updatePanel(client); } catch { return false; }
  };

  // garante painel e atualiza
  await updatePanel(client).catch(() => {});


  // loop de refresh
  if (!globalThis.__SC_FACS_COMPARATIVO_INTERVAL__) {
    globalThis.__SC_FACS_COMPARATIVO_INTERVAL__ = setInterval(async () => {
      try {
        await updatePanel(client);
      } catch {}
    }, 60_000);
  }
}
// ===============================
// PARSER MASTER (texto)
// ===============================

function parseMasterTextToNames(text) {
  return String(text || "")
    .split("\n")
    .map(l => l.trim())
    .filter(l => l.length > 1)
    .filter(Boolean);
}

export async function facsComparativoHandleMessage(message, client) {
  try {
    if (!message?.guild) return false;
    if (message.author?.bot) return false;

    const content = String(message.content || "");

    // comando
    const isCmd = content.trim().toLowerCase().startsWith("!facs_master");
    if (!isCmd) return false;

    const allowed = canSetMaster(message.member, message.author.id);
    if (!allowed) {
      await message.reply("❌ Sem permissão pra usar `!facs_master`.").catch(() => {});
      return true;
    }

    // pega tudo depois do comando
    const after = content.split("\n").slice(1).join("\n").trim();

    if (!after) {
      await message.reply(
        "⚠️ Manda assim:\n" +
        "`!facs_master` (na primeira linha)\n" +
        "e abaixo cola o textão inteiro (FACS ENTREGUES/LIVRES...)"
      ).catch(() => {});
      return true;
    }

    const names = parseMasterTextToNames(after);
    if (!names.length) {
      await message.reply("⚠️ Não consegui extrair nomes desse texto.").catch(() => {});
      return true;
    }

    saveMaster(names);

    await message.reply(
      `✅ MASTER atualizada com **${names.length}** orgs.\n` +
      `📌 Vou atualizar o painel no canal <#${COMP_CHANNEL_ID}> agora.`
    ).catch(() => {});

    await updatePanel(client).catch(() => {});
    return true;
  } catch (e) {
    console.error("[FACS_COMPARATIVO] handleMessage err:", e);
    return false;
  }
}

// ===============================
// RASCUNHO (draft)
// ===============================

const DRAFT_PATH = "./facs_comparativo_draft.json";

function loadDraft() {
  try {
    if (!fs.existsSync(DRAFT_PATH)) return {};
    return JSON.parse(fs.readFileSync(DRAFT_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function saveDraft(d) {
  try {
    fs.writeFileSync(
      DRAFT_PATH,
      JSON.stringify(d, null, 2)
    );
  } catch {}
}

function appendDraftText(userId, text) {
  const d = loadDraft();
  d[userId] = (d[userId] || "") + "\n" + text;
  saveDraft(d);
  return { size: d[userId].length };
}

function getDraftText(userId) {
  const d = loadDraft();
  return d[userId] || "";
}

function clearDraft(userId) {
  const d = loadDraft();
  delete d[userId];
  saveDraft(d);
}

export async function facsComparativoHandleInteraction(interaction, client) {

  try {
    if (!interaction?.guild) return false;

    // ========= BOTÕES =========
    if (interaction.isButton?.()) {

      // 🔄 Atualizar
      if (interaction.customId === COMP_BTN_REFRESH) {
        await interaction.deferReply({ ephemeral: true }).catch(() => {});
        await updatePanel(client).catch(() => {});
        await interaction.editReply("✅ Atualizei o comparativo.").catch(() => {});
        return true;
      }

      // 🧹 Reset rascunho (zera o texto gigante salvo por usuário)
      if (interaction.customId === COMP_BTN_RESETDRAFT) {
        const member = interaction.member;
        const allowed = canSetMaster(member, interaction.user.id);
        if (!allowed) {
          await interaction.reply({ content: "❌ Sem permissão pra mexer na MASTER.", ephemeral: true }).catch(() => {});
          return true;
        }

        clearDraft(interaction.user.id);

        await interaction.reply({
          content:
            "🧹 Rascunho zerado.\n" +
            "Agora clica em **📥 Colar MASTER** e vai colando em partes.\n" +
            "Quando terminar, clica em **✅ Finalizar MASTER**.",
          ephemeral: true,
        }).catch(() => {});
        return true;
      }

      // 🧨 Zerar MASTER (começar do 0)
if (interaction.customId === COMP_BTN_CLEARMSTR) {
  const member = interaction.member;
  const allowed = canSetMaster(member, interaction.user.id);
  if (!allowed) {
    await interaction.reply({ content: "❌ Sem permissão pra zerar a MASTER.", ephemeral: true }).catch(() => {});
    return true;
  }

  // zera MASTER + zera teu rascunho também (pra não confundir)
  saveMaster([]);
  clearDraft(interaction.user.id);

  await interaction.reply({
    content: "🧨 MASTER zerada. Agora o comparativo começou do **0**.",
    ephemeral: true,
  }).catch(() => {});

  await updatePanel(client).catch(() => {});
  return true;
}



      // ✅ Finalizar MASTER (junta tudo do rascunho, parseia, salva e atualiza painel)
      if (interaction.customId === COMP_BTN_FINALIZE) {
        const member = interaction.member;
        const allowed = canSetMaster(member, interaction.user.id);
        if (!allowed) {
          await interaction.reply({ content: "❌ Sem permissão pra setar a MASTER.", ephemeral: true }).catch(() => {});
          return true;
        }

        await interaction.deferReply({ ephemeral: true }).catch(() => {});

        const bigText = getDraftText(interaction.user.id);

        if (!bigText || bigText.trim().length < 10) {
          await interaction.editReply(
            "⚠️ Você ainda não colou nada no rascunho.\n" +
            "Clica em **📥 Colar MASTER** e cola o textão em partes.\n" +
            "Depois volta e clica **✅ Finalizar MASTER**."
          ).catch(() => {});
          return true;
        }

        const names = parseMasterTextToNames(bigText);

        if (!names.length) {
          await interaction.editReply("⚠️ Não consegui extrair nomes desse rascunho.").catch(() => {});
          return true;
        }

        saveMaster(names);
        clearDraft(interaction.user.id);

        await interaction.editReply(
          `✅ MASTER finalizada com **${names.length}** orgs.\n` +
          `📌 Atualizando painel no canal <#${COMP_CHANNEL_ID}>…`
        ).catch(() => {});

        await updatePanel(client).catch(() => {});
        return true;
      }

      // 📥 Colar MASTER (abre modal pra colar UMA PARTE)
      if (interaction.customId === COMP_BTN_SETMASTER) {
        const member = interaction.member;
        const allowed = canSetMaster(member, interaction.user.id);
        if (!allowed) {
          await interaction.reply({ content: "❌ Sem permissão pra setar a MASTER.", ephemeral: true }).catch(() => {});
          return true;
        }

        const modal = new ModalBuilder()
  .setCustomId(COMP_MODAL_SETMASTER)
  .setTitle("📥 Colar MASTER (parte)");

const input = new TextInputBuilder()
  .setCustomId(COMP_MODAL_INPUT_TEXT)
  .setLabel("Cole uma parte do texto (até 4k)")
  .setStyle(TextInputStyle.Paragraph)
.setMaxLength(4000)
.setRequired(true);


const row = new ActionRowBuilder().addComponents(input);
modal.addComponents(row);

await interaction.showModal(modal).catch(() => {});
return true;

      }

      return false;
    }

    // ========= MODAL SUBMIT =========
    if (interaction.isModalSubmit?.()) {
      if (interaction.customId !== COMP_MODAL_SETMASTER) return false;

      const member = interaction.member;
      const allowed = canSetMaster(member, interaction.user.id);
      if (!allowed) {
        await interaction.reply({ content: "❌ Sem permissão pra setar a MASTER.", ephemeral: true }).catch(() => {});
        return true;
      }

      const text = interaction.fields.getTextInputValue(COMP_MODAL_INPUT_TEXT) || "";
      if (!text.trim()) {
        await interaction.reply({ content: "⚠️ Cola alguma parte do textão aí.", ephemeral: true }).catch(() => {});
        return true;
      }

      const info = appendDraftText(interaction.user.id, text);

      await interaction.reply({
        content:
          `✅ Parte salva no rascunho.\n` +
          `📦 Tamanho atual: **${info.size} chars**\n\n` +
          `Se ainda falta colar, clica **📥 Colar MASTER** de novo.\n` +
          `Quando terminar, clica **✅ Finalizar MASTER**.`,
        ephemeral: true,
      }).catch(() => {});

      return true;
    }

    return false;
  } catch (e) {
    console.error("[FACS_COMPARATIVO] handleInteraction err:", e);
    return false;
  }
}


// export opcional pra outros módulos chamarem
export async function facsComparativoForceUpdate(client) {
  return updatePanel(client);
}
