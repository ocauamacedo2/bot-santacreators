// /application/events/alinhamentos.js
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";

// ✅ HUB (pra contar no scGeralDash)
import { dashEmit } from "../utils/dashHub.js";

// ======= ALINHAMENTOS (alinv1) — Menu + Modal + Registro + Validação + Anti-farm =======

// -------- CONFIG --------
const ALINV1_MENU_CHANNEL_ID = "1425256185707233301"; // Canal do botão/menu e onde os registros são postados
const gifalinhamento =
  "https://media.discordapp.net/attachments/1362477839944777889/1384245215249825832/standard_2rss.gif?ex=68e6b3d1&is=68e56251&hm=01e02a1446b7db9171771335faa2c546889c6d60024dbd5d844b4e15079d99ae&=";

// Cargos/IDs com permissão
const constpermalinhamento = new Set([
  "1414651836861907006", // responsaveis
  "1352385500614234134", // coordenação
  "1262262852949905408", // owner
  "660311795327828008", // eu (ID de usuário)
  "1282119104576098314", // mkt ticket

  // ——— adicionados ———
  "1262262852949905409", // Resp Influ
  "1352408327983861844", // Resp creators
]);
// ✅ cargos/usuários que PODEM aprovar o próprio registro
const ALINV1_SELF_APPROVE_BYPASS = new Set([
  "1262262852949905408", // owner
  "1352408327983861844", // resp creators
  "1262262852949905409", // resp influ
  "660311795327828008",  // você
]);

// -------- IDs únicos do sistema --------
const ALINV1_MARK = "[ALINV1_MENU_MARK]";
const ALINV1_BTN_OPEN_ID = "alinv1:open";
const ALINV1_MODAL_ID = "alinv1:modal";

const ALINV1_FOIALINHADO = "alinv1:foi";
const ALINV1_QUEMALINHOU = "alinv1:quem";
const ALINV1_SOBRE = "alinv1:sobre";

// ✅ botões de validação
const ALINV1_BTN_VALID_ID = "alinv1:valid";
const ALINV1_BTN_INVALID_ID = "alinv1:invalid";

// ✅ reações pós-decisão (na própria msg do registro)
const ALINV1_REACT_VALID = "☑️";
const ALINV1_REACT_INVALID = "❌";


// ✅ anti-farm (mesmo registrador + mesma pessoa alinhada = 1 por hora)
const COOLDOWN_MS = 60 * 60 * 1000;

// ✅ storage anti-farm (persistente)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STORAGE_DIR = path.join(__dirname, "..", "storage");
const RL_PATH = path.join(STORAGE_DIR, "alinv1_rate_limit.json");

// -------- Helpers --------


function getHighestRole(member) {
  if (!member || !member.roles?.cache) return null;
  return member.roles.cache
    .filter(r => r.id !== member.guild.id) // ignora @everyone
    .sort((a, b) => b.position - a.position)
    .first() || null;
}

function canValidateByHierarchy(validatorMember, registradorMember) {
  if (!validatorMember || !registradorMember) return false;

  const validatorRole = getHighestRole(validatorMember);
  const registradorRole = getHighestRole(registradorMember);

  if (!validatorRole || !registradorRole) return false;

  return validatorRole.position > registradorRole.position;
}



function ensureDir(dir) {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch {}
}

function loadRL() {
  try {
    if (!fs.existsSync(RL_PATH)) return {};
    return JSON.parse(fs.readFileSync(RL_PATH, "utf-8")) || {};
  } catch {
    return {};
  }
}

function saveRL(obj) {
  try {
    ensureDir(STORAGE_DIR);
    fs.writeFileSync(RL_PATH, JSON.stringify(obj, null, 2));
  } catch {}
}

function hasPerm(member) {
  if (!member) return false;
  if (constpermalinhamento.has(member.id)) return true; // por ID de usuário
  return member.roles?.cache?.some((r) => constpermalinhamento.has(r.id)) || false;
}

function brNow() {
  try {
    return new Date().toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour12: false,
    });
  } catch {
    return new Date().toLocaleString("pt-BR", { hour12: false });
  }
}

function toMention(raw) {
  if (!raw) return "—";
  const s = String(raw).trim();
  if (s.startsWith("<@") && s.endsWith(">")) return s;
  if (/^\d{17,20}$/.test(s)) return `<@${s}>`;
  return s;
}

function extractId(raw) {
  const s = String(raw || "");
  const m = s.match(/\d{17,20}/);
  return m ? m[0] : null;
}

function hashText(s) {
  return crypto.createHash("sha1").update(String(s || "").trim().toLowerCase()).digest("hex").slice(0, 10);
}

function makeCooldownKey(registradorId, rawFoi) {
  const alvoId = extractId(rawFoi);
  // se tiver ID, perfeito; se não tiver, usa hash do texto (ainda segura contra spam)
  const alvoKey = alvoId ? `id:${alvoId}` : `txt:${hashText(rawFoi)}`;
  return `${registradorId}::${alvoKey}`;
}

function readEmbedFields(emb) {
  return emb?.fields || emb?.data?.fields || [];
}

function getFieldValueByNameIncludes(emb, needle) {
  const n = String(needle || "").toLowerCase();
  const f = readEmbedFields(emb).find((x) => String(x?.name || "").toLowerCase().includes(n));
  return String(f?.value || "").trim();
}

function isRegistroEmbed(emb) {
  const title = String(emb?.title || emb?.data?.title || "").toLowerCase();
  const ft = String(emb?.footer?.text || emb?.data?.footer?.text || "").toLowerCase();
  return (title.includes("registro") && title.includes("alinhamento")) || ft.includes("alinv1");
}

function getRegistroStatus(emb) {
  const status = getFieldValueByNameIncludes(emb, "status");
  const up = status.toUpperCase();
  if (up.includes("PENDENTE")) return "PENDENTE";
  if (up.includes("NÃO VÁLIDO") || up.includes("NAO VALIDO") || up.includes("REPROV")) return "INVALIDO";
  if (up.includes("VÁLIDO") || up.includes("VALIDO") || up.includes("APROV")) return "VALIDO";
  return "DESCONHECIDO";
}

function extractRegistradorIdFromEmbed(emb) {
  // campo: "📌 Registrado por" => "<@id> (`id`)"
  const v = getFieldValueByNameIncludes(emb, "registrado por");
  const m = String(v || "").match(/\b(\d{17,20})\b/);
  return m ? m[1] : null;
}

async function fetchAvatarFromMaybeId(client, idOrMention) {
  try {
    const m = String(idOrMention || "").match(/\d{17,20}/);
    if (!m) return null;
    const user = await client.users.fetch(m[0]).catch(() => null);
    return user?.displayAvatarURL?.({ size: 256 }) ?? null;
  } catch {
    return null;
  }
}

async function purgeOldMenus(client, channel) {
  try {
    const msgs = await channel.messages.fetch({ limit: 50 });
    const mine = msgs.filter(
      (m) =>
        m.author?.id === client.user.id &&
        (m.content?.includes(ALINV1_MARK) ||
          m.embeds?.[0]?.footer?.text?.includes?.(ALINV1_MARK) ||
          (m.components?.length &&
            m.components.some((row) =>
              row.components?.some?.((c) => c.customId === ALINV1_BTN_OPEN_ID)
            )))
    );

    for (const [, msg] of mine) {
      await msg.delete().catch(() => {});
    }
  } catch {}
}

async function postMenu(channel) {
  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle("💜🔮 Registro de Alinhamentos")
    .setDescription(
      [
        "Clique no botão abaixo para registrar um **alinhamento**.",
        "",
        "Campos do formulário:",
        "• **Quem foi alinhado?** *(Nome ou ID Discord)*",
        "• **Quem alinhou?** *(deixe em branco para ser você)*",
        "• **Sobre o que foi o alinhamento?**",
        "",
        "Apenas cargos autorizados podem registrar.",
        "",
        "⚠️ **Anti-farm:** o mesmo registrador só pode registrar o **mesmo ID** 1x por hora.",
        "",
        ALINV1_MARK,
      ].join("\n")
    )
    .setImage(gifalinhamento)
    .setFooter({ text: ALINV1_MARK + " • Sempre mantém só o botão mais recente" });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(ALINV1_BTN_OPEN_ID)
      .setStyle(ButtonStyle.Primary)
      .setEmoji("🟣")
      .setLabel("Abrir formulário")
  );

  return channel.send({ embeds: [embed], components: [row] });
}

async function findExistingMenuMessage(client, channel) {
  try {
    const msgs = await channel.messages.fetch({ limit: 50 });

    // pega o MAIS RECENTE que pareça ser o menu
    const candidates = msgs.filter((m) => {
      if (m.author?.id !== client.user.id) return false;

      const hasMarker =
        m.content?.includes(ALINV1_MARK) ||
        m.embeds?.[0]?.footer?.text?.includes?.(ALINV1_MARK) ||
        m.embeds?.[0]?.description?.includes?.(ALINV1_MARK);

      const hasOpenBtn =
        m.components?.length &&
        m.components.some((row) =>
          row.components?.some?.((c) => c.customId === ALINV1_BTN_OPEN_ID)
        );

      // menu = marker + botão
      return hasMarker && hasOpenBtn;
    });

    if (!candidates.size) return null;

    // messages.fetch retorna Collection ordenada do mais recente pro mais antigo
    return candidates.first() || null;
  } catch {
    return null;
  }
}

function buildMenuPayload() {
  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle("💜🔮 Registro de Alinhamentos")
    .setDescription(
      [
        "Clique no botão abaixo para registrar um **alinhamento**.",
        "",
        "Campos do formulário:",
        "• **Quem foi alinhado?** *(Nome ou ID Discord)*",
        "• **Quem alinhou?** *(deixe em branco para ser você)*",
        "• **Sobre o que foi o alinhamento?**",
        "",
        "Apenas cargos autorizados podem registrar.",
        "",
        "⚠️ **Anti-farm:** o mesmo registrador só pode registrar o **mesmo ID** 1x por hora.",
        "",
        ALINV1_MARK,
      ].join("\n")
    )
    .setImage(gifalinhamento)
    .setFooter({ text: ALINV1_MARK + " • Sempre mantém só o botão mais recente" });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(ALINV1_BTN_OPEN_ID)
      .setStyle(ButtonStyle.Primary)
      .setEmoji("🟣")
      .setLabel("Abrir formulário")
  );

  return { embeds: [embed], components: [row] };
}

async function resetMenu(client) {
  const channel = await client.channels.fetch(ALINV1_MENU_CHANNEL_ID).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  const existing = await findExistingMenuMessage(client, channel);

  const payload = buildMenuPayload();

  // ✅ Se já existe menu, SÓ EDITA
  if (existing) {
    await existing.edit(payload).catch(() => {});
    return;
  }

  // ✅ Se não existe menu, cria um novo (sem apagar nada)
  await channel.send(payload).catch(() => {});
}


async function sendTemp(channel, content, ms = 5000) {
  const msg = await channel.send(content).catch(() => null);
  if (!msg) return;
  setTimeout(() => msg.delete().catch(() => {}), ms);
}

function buildValidationRow(disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(ALINV1_BTN_VALID_ID)
      .setStyle(ButtonStyle.Success)
      .setEmoji("✅")
      .setLabel("ALINHAMENTO VÁLIDO")
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(ALINV1_BTN_INVALID_ID)
      .setStyle(ButtonStyle.Danger)
      .setEmoji("❌")
      .setLabel("ALINHAMENTO NÃO VÁLIDO")
      .setDisabled(disabled)
  );
}

// =====================================================
// ✅ 1) READY: recria menu quando o bot liga
// =====================================================
export async function alinhamentosOnReady(client) {
  await resetMenu(client);
}

// =====================================================
// ✅ 2) MESSAGE: comando !gifalinhamento
// =====================================================
export async function alinhamentosHandleMessage(message, client) {
  try {
    if (!message.guild || message.author.bot) return false;

    const txt = (message.content || "").trim().toLowerCase();
    if (!txt.startsWith("!gifalinhamento")) return false;

    if (!hasPerm(message.member)) {
      await sendTemp(
        message.channel,
        "❌ Você não tem permissão para recriar o menu de **Alinhamentos**.",
        5000
      );
      return true;
    }

    const ch = await client.channels.fetch(ALINV1_MENU_CHANNEL_ID).catch(() => null);
    if (!ch || !ch.isTextBased()) {
      await sendTemp(message.channel, "⚠️ Canal do menu não encontrado. Verifique o ID.", 7000);
      return true;
    }

    await purgeOldMenus(client, ch);
    await postMenu(ch);
    await sendTemp(message.channel, "✅ Menu de **Alinhamentos** recriado com sucesso!", 5000);

    return true;
  } catch {
    return false;
  }
}

// =====================================================
// ✅ 3) INTERACTIONS: botão + modal submit + validação
// =====================================================
export async function alinhamentosHandleInteraction(interaction, client) {
  try {
    // ---------- Botão abre modal ----------
    if (interaction.isButton?.() && interaction.customId === ALINV1_BTN_OPEN_ID) {
      if (!hasPerm(interaction.member)) {
        await interaction.reply({
          content: "❌ Você não tem permissão para registrar **Alinhamentos**.",
          ephemeral: true,
        });
        return true;
      }

      const modal = new ModalBuilder()
        .setCustomId(ALINV1_MODAL_ID)
        .setTitle("🟣 Registro de Alinhamento");

      const foi = new TextInputBuilder()
        .setCustomId(ALINV1_FOIALINHADO)
        .setLabel("Quem foi alinhado? (Nome ou ID)")
        .setPlaceholder("Nome ou ID Discord")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const quem = new TextInputBuilder()
        .setCustomId(ALINV1_QUEMALINHOU)
        .setLabel("Quem alinhou? (deixe vazio p/ você)")
        .setPlaceholder("opcional — Nome ou ID Discord — vazio = você")
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      const sobre = new TextInputBuilder()
        .setCustomId(ALINV1_SOBRE)
        .setLabel("Sobre o que foi o alinhamento?")
        .setPlaceholder("descreva resumidamente…")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(foi),
        new ActionRowBuilder().addComponents(quem),
        new ActionRowBuilder().addComponents(sobre)
      );

      await interaction.showModal(modal);
      return true;
    }

    // ---------- Submit do modal (cria registro PENDENTE + anti-farm por alvo) ----------
    if (interaction.isModalSubmit?.() && interaction.customId === ALINV1_MODAL_ID) {
      if (!hasPerm(interaction.member)) {
        await interaction.reply({
          content: "❌ Você não tem permissão para registrar **Alinhamentos**.",
          ephemeral: true,
        });
        return true;
      }

      const rawFoi = interaction.fields.getTextInputValue(ALINV1_FOIALINHADO)?.trim();
      const rawQuem = interaction.fields.getTextInputValue(ALINV1_QUEMALINHOU)?.trim();
      const rawSobre = interaction.fields.getTextInputValue(ALINV1_SOBRE)?.trim();

      const registradorId = interaction.user.id;

      // ✅ Anti-farm: mesmo registrador + mesmo alvo (id/texto) = 1 por hora
      const rl = loadRL();
      const k = makeCooldownKey(registradorId, rawFoi);
      const lastAt = Number(rl[k] || 0);
      const now = Date.now();

      if (lastAt && now - lastAt < COOLDOWN_MS) {
        const waitMs = COOLDOWN_MS - (now - lastAt);
        const mins = Math.max(1, Math.ceil(waitMs / 60000));
        await interaction.reply({
          content:
            `⏳ Calma aí: você já registrou esse **mesmo alinhamento pra esse mesmo ID** recentemente.\n` +
            `Tenta de novo em **${mins} min**.\n\n` +
            `✅ Você pode registrar **outras pessoas diferentes** normalmente.`,
          ephemeral: true,
        });
        return true;
      }

      // marca cooldown já no envio (pra impedir spam de submit)
      rl[k] = now;
      saveRL(rl);

      const quemFoi = toMention(rawFoi);
      const quemFez = rawQuem ? toMention(rawQuem) : `<@${interaction.user.id}>`;
      const quando = brNow();

      // Avatares
      let thumb = await fetchAvatarFromMaybeId(client, quemFoi);
      if (!thumb) thumb = interaction.user.displayAvatarURL?.({ size: 256 }) ?? null;
      const authorIcon = interaction.user.displayAvatarURL?.({ size: 256 }) ?? null;

      const emb = new EmbedBuilder()
        .setColor(0x9b59b6)
        .setAuthor({
          name: `${interaction.user.tag} registrou um alinhamento`,
          iconURL: authorIcon,
        })
        .setTitle("📝 Registro de Alinhamento")
        .addFields(
          { name: "👤 Quem foi alinhado?", value: quemFoi || "—", inline: false },

          // isso é o texto do formulário (quem alinhou)
          { name: "🧭 Quem alinhou?", value: quemFez || "—", inline: false },

          { name: "📝 Sobre o quê?", value: rawSobre || "—", inline: false },

          // ✅ pro dashboard / auditoria
          { name: "📌 Registrado por", value: `<@${registradorId}> (\`${registradorId}\`)`, inline: true },
          { name: "⏰ Quando", value: quando, inline: true },

          // ✅ status pendente até alguém validar/reprovar
          { name: "🕒 Status", value: "PENDENTE de validação", inline: false }
        )
        .setThumbnail(thumb)
        .setImage(gifalinhamento)
        .setFooter({ text: "ALINV1 • Registros não são apagados" });

      const ch = await client.channels.fetch(ALINV1_MENU_CHANNEL_ID).catch(() => null);
      if (!ch || !ch.isTextBased()) {
        await interaction.reply({
          content: "⚠️ Canal de registros não encontrado. Avise a administração.",
          ephemeral: true,
        });
        return true;
      }

      // Publica registro + botões de validação
      const msg = await ch
        .send({ embeds: [emb], components: [buildValidationRow(false)] })
        .catch(() => null);

      if (!msg) {
        await interaction.reply({
          content: "⚠️ Não consegui postar o registro agora. Tenta de novo.",
          ephemeral: true,
        });
        return true;
      }

      await interaction.reply({ content: "✅ Alinhamento enviado para validação!", ephemeral: true }).catch(() => {});

      // Renova o menu:
// ✅ após registrar: se já tinha menu, apaga e manda o novo (igual hoje)
// ✅ se não tinha, só cria
const existingMenu = await findExistingMenuMessage(client, ch);

if (existingMenu) {
  await purgeOldMenus(client, ch);
  await postMenu(ch);
} else {
  await postMenu(ch).catch(() => {});
}

return true;

    }

    // ---------- Validação / Reprovação ----------
if (
  interaction.isButton?.() &&
  (interaction.customId === ALINV1_BTN_VALID_ID || interaction.customId === ALINV1_BTN_INVALID_ID)
) {
  if (!hasPerm(interaction.member)) {
    await interaction.reply({
      content: "❌ Você não tem permissão para validar/reprovar **Alinhamentos**.",
      ephemeral: true,
    });
    return true;
  }

  const msg = interaction.message;
  const emb = msg?.embeds?.[0];
  if (!emb || !isRegistroEmbed(emb)) {
    await interaction.reply({ content: "⚠️ Isso não parece um registro de alinhamento.", ephemeral: true });
    return true;
  }

  const status = getRegistroStatus(emb);
  if (status === "VALIDO" || status === "INVALIDO") {
    await interaction.reply({
      content: "⚠️ Esse registro já foi decidido (validado/reprovado).",
      ephemeral: true,
    });
    return true;
  }

  const isValid = interaction.customId === ALINV1_BTN_VALID_ID;
const validatorId = interaction.user.id;
const quando = brNow();

const registradorId = extractRegistradorIdFromEmbed(emb);

// ✅ verifica se é alguém com permissão especial
const bypassSelfApprove = ALINV1_SELF_APPROVE_BYPASS.has(validatorId);

// ❌ não pode validar o próprio registro (exceto cargos especiais)
if (registradorId === validatorId && !bypassSelfApprove) {
  await interaction.reply({
    content:
      "❌ Você **não pode validar ou reprovar um alinhamento que você mesmo registrou**.\n" +
      "🔒 Apenas cargos superiores podem fazer isso.",
    ephemeral: true,
  });
  return true;
}
// ✅ se não for bypass, aplica hierarquia normal
if (!bypassSelfApprove) {
  const guild = interaction.guild;

  const registradorMember = await guild.members
    .fetch(registradorId)
    .catch(() => null);

  const validatorMember = interaction.member;

if (registradorMember && !canValidateByHierarchy(validatorMember, registradorMember)) {

    await interaction.reply({
      content:
        "❌ Você **não pode validar este alinhamento**.\n\n" +
        "📌 Motivo: o registrador possui **cargo igual ou superior** ao seu.\n" +
        "🔒 A hierarquia do Creator deve ser respeitada.",
      ephemeral: true,
    });
    return true;
  }
}

  // clona embed (pra editar)
  const newEmb = EmbedBuilder.from(emb);

  // atualiza cor pra dar leitura
  newEmb.setColor(isValid ? 0x2ecc71 : 0xe74c3c);

  // remove campo Status antigo e coloca um novo
  const fields = readEmbedFields(emb).filter((f) => {
    const name = String(f?.name || "");
    return !name.toLowerCase().includes("status");
  });

  fields.push({
    name: "✅ Status",
    value: isValid
      ? `**VÁLIDO** — aprovado por <@${validatorId}> • ${quando}`
      : `**NÃO VÁLIDO** — reprovado por <@${validatorId}> • ${quando}`,
    inline: false,
  });

  newEmb.setFields(fields);

  // desativa botões
  const rows = [buildValidationRow(true)];

  await interaction.deferReply({ ephemeral: true }).catch(() => {});

  const ok = await msg.edit({ embeds: [newEmb], components: rows }).then(() => true).catch(() => false);
  if (!ok) {
    await interaction.editReply("⚠️ Não consegui editar esse registro. Tenta de novo.").catch(() => {});
    return true;
  }

  // ✅ NOVO: reage a mensagem do registro com ☑️ (válido) ou ❌ (não válido)
  try {
    const emoji = isValid ? ALINV1_REACT_VALID : ALINV1_REACT_INVALID;
    await msg.react(emoji).catch(() => {});
  } catch {}

  // ✅ SÓ CONTA PONTO SE FOR VÁLIDO
  if (isValid) {
    const registradorId = extractRegistradorIdFromEmbed(emb);

    if (registradorId) {
      try {
        dashEmit("alinhamento:validado", {
          userId: registradorId,
          validatorId,
          __at: Date.now(),
          src: "alinv1",
        });
      } catch {}
    }
  }

  await interaction.editReply(
    isValid
      ? `✅ Marcado como **VÁLIDO**. (ponto contado pro registrador)`
      : `❌ Marcado como **NÃO VÁLIDO**. (sem ponto)`
  ).catch(() => {});

  return true;
}


    return false;
  } catch {
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "⚠️ Não deu para salvar agora. Tente novamente.",
          ephemeral: true,
        });
      }
    } catch {}
    return true; // melhor “consumir” pra não cair em outros handlers
  }
}
