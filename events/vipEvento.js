// ./events/application/events/vipEvento.js
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
  TimestampStyles,
  time,
} from "discord.js";
// ✅ HUB do dashboard (o mesmo que o scGeralDash usa)
import { dashEmit } from "../utils/dashHub.js";

// ── CONFIG DE CANAIS ─────────────────────────────────────────────
const VIP_MENU_CHANNEL_ID = "1414718336826081330"; // onde fica o MENU e os REGISTROS
const VIP_NOTIFY_CHANNEL_ID = "1424489278615978114"; // notificação de novo registro
const VIP_CHECK_MENU_CHAT_ID = "1387922662134775818"; // referência ao "outro menu" para checagem
const VIP_LOGS_CHANNEL_ID = "1414726734472941708"; // logs de ações (tudo)

// ✅ Arquivo do cronograma para dados automáticos
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, "../data");
const CRONO_FILE = path.join(DATA_DIR, "cronograma_state.json");

// ── CARGOS/USUÁRIOS AUTORIZADOS ─────────────────────────────────
const IDS = {
  LIDERES: "1353858422063239310",
  OWNER: "1262262852949905408",
  EU: "660311795327828008",
  COORDENACAO: "1352385500614234134",
  RESPONSAVEIS: "1414651836861907006",
  EQUIPE_CREATOR: "1352429001188180039",

  // 🔥 novos cargos p/ REPROVAR
  MKT_TICKET: "1282119104576098314",
  RESP_CREATORS: "1352408327983861844",
  COORD_CREATORS: "1388976314253312100",
};

// Quem pode ABRIR o modal/registrar:
const REGISTER_ALLOWED = [
  IDS.LIDERES,
  IDS.OWNER,
  IDS.COORDENACAO,
  IDS.RESPONSAVEIS,
  IDS.EQUIPE_CREATOR,
];
const REGISTER_ALLOWED_USERS = [IDS.EU];

// Quem pode clicar nos botões de ação (SOLICITADO / PAGO) + usar filtros:
const ACTION_ALLOWED = [
  IDS.OWNER,
  IDS.EU,
  IDS.COORDENACAO,
  IDS.RESPONSAVEIS,
  IDS.EQUIPE_CREATOR,
];
const ACTION_ALLOWED_USERS = [IDS.EU];

// Quem pode REPROVAR:
const REPROVE_ALLOWED = [
  IDS.OWNER,
  IDS.RESPONSAVEIS,
  IDS.MKT_TICKET,
  IDS.RESP_CREATORS,
  IDS.COORD_CREATORS,
];
const REPROVE_ALLOWED_USERS = [IDS.EU];

// ── CONSTs de UI ─────────────────────────────────────────────────
const VIP_MENU_BUTTON_ID = "vip_menu_open";
const VIP_MODAL_ID = "vip_modal_submit";

const VIP_BTN_SOLICITADO_ID = "vip_mark_solicitado";
const VIP_BTN_PAGO_ID = "vip_mark_pago";
const VIP_BTN_REPROVAR_ID = "vip_mark_reprovado";

const VIP_REPROVE_MODAL_ID = "vip_modal_reprove";

// ✅ FILTROS
const VIP_FILTER_SOLICITADOS_ID = "vip_filter_solicitados";
const VIP_FILTER_NAOCLICADOS_ID = "vip_filter_naoclicados";

const MENU_COLOR = 0x8b5cf6; // roxo
const REG_COLOR = 0xd946ef; // roxo/rosa SC
const MENU_GIF =
  "https://cdn.discordapp.com/attachments/1362477839944777889/1380979949816643654/standard_2r.gif?ex=68c074cd&is=68bf234d&hm=a99745e758f3dbefca4f9b914a56b0da8fdf62c5aa42234a0fcdc2da3a27a7dd";

// ── 🔒 evita processar a mesma interação 2x ─────────────────────
const VIP_HANDLED_INTERACTIONS = new Set();
function VIP_hasHandled(i) {
  try {
    if (!i?.id) return false;
    if (VIP_HANDLED_INTERACTIONS.has(i.id)) return true;
    VIP_HANDLED_INTERACTIONS.add(i.id);
    setTimeout(() => VIP_HANDLED_INTERACTIONS.delete(i.id), 60_000);
    return false;
  } catch {
    return false;
  }
}

// ── Helpers anti-10062 ──────────────────────────────────────────
function isUnknownInteractionError(err) {
  return err?.code === 10062 || err?.rawError?.code === 10062;
}
async function safeDefer(i, { ephemeral = true, update = false } = {}) {
  try {
    if (i.deferred || i.replied) return;
    if (update && i.isMessageComponent()) await i.deferUpdate();
    else await i.deferReply({ ephemeral });
  } catch (e) {
    if (!isUnknownInteractionError(e)) throw e;
  }
}
async function safeReply(i, opts) {
  try {
    if (i.replied) return await i.followUp(opts);
    if (i.deferred) return await i.editReply(opts);
    return await i.reply(opts);
  } catch (e) {
    if (isUnknownInteractionError(e)) return;
    throw e;
  }
}

// ── Helpers de permissão ────────────────────────────────────────
function hasAnyRole(member, roleIds) {
  return member?.roles?.cache?.some((r) => roleIds.includes(r.id));
}
function canRegister(member) {
  return hasAnyRole(member, REGISTER_ALLOWED) || REGISTER_ALLOWED_USERS.includes(member.id);
}
function canAction(member) {
  return hasAnyRole(member, ACTION_ALLOWED) || ACTION_ALLOWED_USERS.includes(member?.id);
}
function canReprove(member) {
  return hasAnyRole(member, REPROVE_ALLOWED) || REPROVE_ALLOWED_USERS.includes(member.id);
}

// ── Helpers de status do registro ───────────────────────────────
function VIP_getFields(embed) {
  return embed?.fields || embed?.data?.fields || [];
}
function VIP_getFieldValueByNameStarts(fields, starts) {
  const f = fields.find((x) => (x.name || "").startsWith(starts));
  return f?.value ?? null;
}
function VIP_isPago(embed) {
  const fields = VIP_getFields(embed);
  const v = VIP_getFieldValueByNameStarts(fields, "💸 Pagamento");
  return !!(v && v !== "—");
}
function VIP_hasSolicitado(embed) {
  const fields = VIP_getFields(embed);
  const v = VIP_getFieldValueByNameStarts(fields, "📝 Solicitações");
  return !!(v && v !== "—");
}
function VIP_isReprovado(embed) {
  const fields = VIP_getFields(embed);
  const v = VIP_getFieldValueByNameStarts(fields, "⛔ Reprovação");
  return !!(v && /REPROVADO/i.test(v));
}

// ✅ Só considera “registro válido” se tiver os botões do VIP.
function VIP_messageHasVipButtons(msg) {
  const rows = msg.components || [];
  for (const row of rows) {
    const comps = row?.components || [];
    for (const c of comps) {
      if ([VIP_BTN_SOLICITADO_ID, VIP_BTN_PAGO_ID, VIP_BTN_REPROVAR_ID].includes(c.customId)) return true;
    }
  }
  return false;
}

// ── Helpers de data e cronograma ───────────────────────────────
function getTodayKey() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const days = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
  return days[now.getDay()];
}

function getTodayDateFormatted() {
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    return `${day}/${month}/${year}`;
}

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
    console.error("[vipEvento] Erro ao ler cronograma:", e);
    return null;
  }
}


// ── UI builders ─────────────────────────────────────────────────
function VIP_buildMenuEmbed(guild) {
  return new EmbedBuilder()
    .setColor(MENU_COLOR)
    .setTitle("💎 Solicitar VIP por Evento (Ganho da Org)")
    .setDescription(
      `Use o botão abaixo para registrar **premiação VIP** conquistada em eventos da organização.

**Quem pode registrar:** <@&${IDS.LIDERES}>, <@&${IDS.OWNER}>, <@&${IDS.COORDENACAO}>, <@&${IDS.RESPONSAVEIS}>, <@&${IDS.EQUIPE_CREATOR}> e <@${IDS.EU}>.

O registro contém:
• **Nome do evento ganho**
• **Dia do evento**
• **ID do ganhador**
• **Nome da organização**
• **Premiação**

> Sempre que um registro novo for enviado, eu recrio este menu para manter o chat organizado.`
    )
    .setThumbnail(guild?.iconURL({ size: 256, forceStatic: false }) ?? null)
    .setImage(MENU_GIF)
    .setFooter({ text: "SantaCreators • Sistema de Registro VIP" });
}

function VIP_buildMenuComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(VIP_MENU_BUTTON_ID)
        .setStyle(ButtonStyle.Primary)
        .setEmoji("💜")
        .setLabel("Abrir formulário"),

      new ButtonBuilder()
        .setCustomId(VIP_FILTER_SOLICITADOS_ID)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("📨")
        .setLabel("Solicitados"),

      new ButtonBuilder()
        .setCustomId(VIP_FILTER_NAOCLICADOS_ID)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("🕗")
        .setLabel("Não clicados")
    ),
  ];
}

function VIP_buildModal(eventData = null) {
  return new ModalBuilder()
    .setCustomId(VIP_MODAL_ID)
    .setTitle("Registro de VIP por Evento")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("vip_evt_nome")
          .setLabel("Nome do evento ganho")
          .setStyle(TextInputStyle.Short)
          .setValue(eventData?.eventName || "")
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("vip_evt_data")
          .setLabel("Dia do evento (ex: 08/09/2025)")
          .setStyle(TextInputStyle.Short)
          .setValue(getTodayDateFormatted())
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("vip_ganhador_id")
          .setLabel("ID do ganhador")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("vip_org_nome")
          .setLabel("Nome da organização")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("vip_premiacao")
          .setLabel("Premiação")
          .setStyle(TextInputStyle.Paragraph)
          .setValue(eventData?.prizes || "")
          .setRequired(true)
      )
    );
}

function VIP_buildReproveModal(messageId) {
  return new ModalBuilder()
    .setCustomId(`${VIP_REPROVE_MODAL_ID}:${messageId}`)
    .setTitle("Reprovar pagamento")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("vip_reprove_motivo")
          .setLabel("Qual o motivo da reprovação?")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
      )
    );
}

function VIP_buildRegistroEmbed(guild, registrante, payload) {
  const when = new Date();
  const avatar = registrante.displayAvatarURL({ size: 256 });
  return new EmbedBuilder()
    .setColor(REG_COLOR)
    .setTitle("💎 Registro de VIP por Evento")
    .setThumbnail(avatar)
    .setImage(MENU_GIF)
    .setDescription(
      `**Registrado por:** <@${registrante.id}>
**Data/Hora:** ${time(Math.floor(when.getTime() / 1000), TimestampStyles.LongDateTime)} (${time(
        Math.floor(when.getTime() / 1000),
        TimestampStyles.RelativeTime
      )})`
    )
    .addFields(
      { name: "🏁 Nome do evento ganho", value: `\`${payload.evento}\``, inline: false },
      { name: "📅 Dia do evento", value: `\`${payload.data}\``, inline: true },
      { name: "🆔 ID do ganhador", value: `<@${payload.ganhadorId}> (\`${payload.ganhadorId}\`)`, inline: true },
      { name: "🏢 Organização", value: `\`${payload.org}\``, inline: true },
      { name: "🎁 Premiação", value: payload.premiacao || "—", inline: false },
      { name: "📝 Solicitações", value: "—", inline: false },
      { name: "💸 Pagamento", value: "—", inline: false }
    )
    .setFooter({ text: "SantaCreators • VIP por Evento", iconURL: guild?.iconURL({ size: 64 }) ?? null })
    .setTimestamp(when);
}

function VIP_buildRegistroButtons(disableAll = false, pago = false, reprovado = false) {
  const lock = disableAll || pago === true || reprovado === true;

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(VIP_BTN_SOLICITADO_ID)
        .setLabel("Já foi solicitado")
        .setEmoji("📨")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(lock),

      new ButtonBuilder()
        .setCustomId(VIP_BTN_PAGO_ID)
        .setLabel("Já foi pago")
        .setEmoji("💸")
        .setStyle(ButtonStyle.Success)
        .setDisabled(lock),

      new ButtonBuilder()
        .setCustomId(VIP_BTN_REPROVAR_ID)
        .setLabel("Reprovar pagamento")
        .setEmoji("⛔")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(lock)
    ),
  ];
}

// ── FUNÇÕES DE MENU (limpar/recriar) ────────────────────────────
async function VIP_deleteOldMenus(channel, client) {
  const msgs = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  if (!msgs) return;
  for (const msg of msgs.values()) {
    if (msg.author.id !== client.user.id) continue;
    const hasOurButton = msg.components?.some((row) => row.components?.some((c) => c.customId === VIP_MENU_BUTTON_ID));
    if (hasOurButton) await msg.delete().catch(() => {});
  }
}

async function VIP_ensureFreshMenu(guild, client) {
  const ch = await guild.channels.fetch(VIP_MENU_CHANNEL_ID).catch(() => null);
  if (!ch || !ch.isTextBased()) return;

  await VIP_deleteOldMenus(ch, client);
  await ch.send({ embeds: [VIP_buildMenuEmbed(guild)], components: VIP_buildMenuComponents() });

  const lg = await guild.channels.fetch(VIP_LOGS_CHANNEL_ID).catch(() => null);
  if (lg?.isTextBased()) {
    const e = new EmbedBuilder()
      .setColor(MENU_COLOR)
      .setTitle("📌 Menu VIP recriado")
      .setDescription(`Canal: <#${VIP_MENU_CHANNEL_ID}>`)
      .setTimestamp();
    lg.send({ embeds: [e] }).catch(() => {});
  }
}

async function VIP_sendDM_VIP(client, userId, content, guild) {
  try {
    const user = await client.users.fetch(userId);
    await user.send({ content });
    return true;
  } catch (e) {
    try {
      const logs = guild ? await guild.channels.fetch(VIP_LOGS_CHANNEL_ID).catch(() => null) : null;
      if (logs?.isTextBased()) {
        const emb = new EmbedBuilder()
          .setColor(0xffa500)
          .setTitle("📪 Falha ao enviar DM")
          .setDescription(`Para: <@${userId}>\nMotivo: \`${e.message || e}\``)
          .setTimestamp();
        await logs.send({ embeds: [emb] }).catch(() => {});
      }
    } catch {}
    return false;
  }
}

// ── MOVER REGISTROS POR FILTRO ──────────────────────────────────
async function VIP_moverRegistrosPorFiltro(channel, filtro, client) {
  const msgs = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  if (!msgs) return { movidos: 0 };

  const registros = [...msgs.values()]
    .filter((m) => m.author?.id === client.user.id)
    .filter((m) => m.embeds?.length > 0)
    .filter((m) => (m.embeds?.[0]?.title || "").includes("Registro de VIP por Evento"))
    .filter((m) => VIP_messageHasVipButtons(m));

  let movidos = 0;

  for (const msg of registros) {
    const raw = msg.embeds?.[0];
    if (!raw) continue;

    const emb = EmbedBuilder.from(raw);

    const ehPago = VIP_isPago(emb);
    const ehReprovado = VIP_isReprovado(emb);
    const ehSolicitado = VIP_hasSolicitado(emb);

    const entra =
      (filtro === "solicitados" && ehSolicitado && !ehPago && !ehReprovado) ||
      (filtro === "naoclicados" && !ehSolicitado && !ehPago && !ehReprovado);

    if (!entra) continue;

    const nova = await channel.send({ embeds: [emb] });

    const comps = ehReprovado
      ? VIP_buildRegistroButtons(true, false, true)
      : ehPago
      ? VIP_buildRegistroButtons(true, true, false)
      : VIP_buildRegistroButtons(false, false, false);

    await nova.edit({ components: comps }).catch(() => {});
    await msg.delete().catch(() => {});
    movidos++;
  }

  return { movidos };
}

// =====================================================
// ✅ EXPORTS (o que o index vai chamar)
// =====================================================

export async function vipEventoOnReady(client) {
  // recria menu no boot (em todas guilds que o bot tá)
  for (const g of client.guilds.cache.values()) {
    await VIP_ensureFreshMenu(g, client);
  }
}

export async function vipEventoHandleInteraction(i, client) {
  try {
    // 0) só trata interações que são nossas
    const isVipMenuButton =
      i.isButton?.() &&
      [VIP_MENU_BUTTON_ID, VIP_FILTER_SOLICITADOS_ID, VIP_FILTER_NAOCLICADOS_ID].includes(i.customId);

    const isVipModalCriar = i.isModalSubmit?.() && i.customId === VIP_MODAL_ID;
    const isVipRegistroButtons = i.isButton?.() && [VIP_BTN_SOLICITADO_ID, VIP_BTN_PAGO_ID, VIP_BTN_REPROVAR_ID].includes(i.customId);
    const isVipModalReprovar = i.isModalSubmit?.() && i.customId?.startsWith(`${VIP_REPROVE_MODAL_ID}:`);

    if (!isVipMenuButton && !isVipModalCriar && !isVipRegistroButtons && !isVipModalReprovar) {
      return false; // não é nosso
    }

    if (VIP_hasHandled(i)) return true;

    // ── 1) BOTÕES DO MENU: abrir + filtros ────────────────────────
    if (isVipMenuButton) {
      // ABRIR MODAL
      if (i.customId === VIP_MENU_BUTTON_ID) {
        if (!canRegister(i.member)) {
          await safeReply(i, { content: "🚫 Você não tem permissão para registrar.", ephemeral: true });
          return true;
        }
        // ✅ Pega dados do evento de hoje para pré-preencher
        const eventData = getTodayEventData();
        const modal = VIP_buildModal(eventData);
        await i.showModal(modal);
        return true;
      }

      // FILTROS
      if (!canAction(i.member)) {
        await safeReply(i, { content: "🚫 Você não tem permissão para usar esse filtro.", ephemeral: true });
        return true;
      }

      await safeDefer(i, { ephemeral: true });

      const guild = i.guild;
      const ch = await guild.channels.fetch(VIP_MENU_CHANNEL_ID).catch(() => null);
      if (!ch || !ch.isTextBased()) {
        await safeReply(i, { content: "⚠️ Canal do menu/registros indisponível.", ephemeral: true });
        return true;
      }

      const qual = i.customId === VIP_FILTER_SOLICITADOS_ID ? "solicitados" : "naoclicados";
      const { movidos } = await VIP_moverRegistrosPorFiltro(ch, qual, client);

      await VIP_ensureFreshMenu(guild, client);

      await safeReply(i, {
        content: `✅ Filtro aplicado: **${qual}**\n📦 Registros movidos: **${movidos}**`,
        ephemeral: true,
      });
      return true;
    }

    // ── 2) MODAL: Reprovar pagamento (submit) ─────────────────────
    if (isVipModalReprovar) {
      await safeDefer(i, { ephemeral: true });

      if (!canReprove(i.member)) {
        await safeReply(i, { content: "🚫 Você não tem permissão para reprovar pagamento.", ephemeral: true });
        return true;
      }

      const parts = i.customId.split(":");
      const messageId = parts[1];
      if (!messageId) {
        await safeReply(i, { content: "⚠️ Não consegui identificar o registro (messageId).", ephemeral: true });
        return true;
      }

      const motivo = i.fields.getTextInputValue("vip_reprove_motivo")?.trim();
      if (!motivo) {
        await safeReply(i, { content: "⚠️ Você precisa escrever o motivo.", ephemeral: true });
        return true;
      }

      const guild = i.guild;
      const menuCh = await guild.channels.fetch(VIP_MENU_CHANNEL_ID).catch(() => null);
      if (!menuCh || !menuCh.isTextBased()) {
        await safeReply(i, { content: "⚠️ Canal do menu/registros indisponível.", ephemeral: true });
        return true;
      }

      const msg = await menuCh.messages.fetch(messageId).catch(() => null);
      if (!msg?.embeds?.[0]) {
        await safeReply(i, { content: "⚠️ Não achei a mensagem do registro (ou embed inválido).", ephemeral: true });
        return true;
      }

      const embed = EmbedBuilder.from(msg.embeds[0]);
      const fields = embed.data.fields ?? [];

      const desc = embed.data.description || "";
      const m = desc.match(/<@!?(\d+)>/);
      const registranteId = m?.[1] || null;

      const now = new Date();
      const whenTxt = `${time(Math.floor(now.getTime() / 1000), TimestampStyles.LongDateTime)} (${time(
        Math.floor(now.getTime() / 1000),
        TimestampStyles.RelativeTime
      )})`;

      const repName = "⛔ Reprovação";
      const repIdx = fields.findIndex((f) => (f.name || "").startsWith(repName));

      const repText = `• **REPROVADO** por <@${i.user.id}> em ${whenTxt}\n• **Motivo:** ${motivo.slice(0, 900)}`;

      if (repIdx >= 0) fields[repIdx].value = repText.slice(0, 1024);
      else fields.push({ name: repName, value: repText.slice(0, 1024), inline: false });

      embed.setFields(fields);

      await msg.edit({ embeds: [embed], components: VIP_buildRegistroButtons(true, false, true) });

      if (registranteId) {
        await VIP_sendDM_VIP(
          client,
          registranteId,
          `⛔ Seu pagamento foi **REPROVADO**.\n\n• Registro: ${msg.url}\n• Reprovado por: <@${i.user.id}>\n• Motivo: ${motivo}\n\nSe precisar, resolve **no chat da empresa** 🙏`,
          guild
        );
      }

      const logs = await guild.channels.fetch(VIP_LOGS_CHANNEL_ID).catch(() => null);
      logs?.isTextBased() &&
        logs
          .send({
            embeds: [
              new EmbedBuilder()
                .setColor(0xff0000)
                .setTitle("⛔ Pagamento reprovado")
                .setDescription(`Registro: ${msg.url}\nPor: <@${i.user.id}>\nMotivo: ${motivo.slice(0, 500)}`)
                .setTimestamp(),
            ],
          })
          .catch(() => {});


          dashEmit("vip:reprovado", {
  by: i.user.id,
});

      await safeReply(i, { content: "✅ Reprovado e registrado com motivo. Botões desabilitados.", ephemeral: true });
      return true;
    }

    // ── 3) MODAL: Criar registro ──────────────────────────────────
    if (isVipModalCriar) {
      await safeDefer(i, { ephemeral: true });

      if (!canRegister(i.member)) {
        await safeReply(i, { content: "🚫 Você não tem permissão para registrar.", ephemeral: true });
        return true;
      }

      const evento = i.fields.getTextInputValue("vip_evt_nome").trim();
      const data = i.fields.getTextInputValue("vip_evt_data").trim();
      const ganhadorId = i.fields.getTextInputValue("vip_ganhador_id").trim();
      const org = i.fields.getTextInputValue("vip_org_nome").trim();
      const premiacao = i.fields.getTextInputValue("vip_premiacao").trim();

      const guild = i.guild;
      const menuCh = await guild.channels.fetch(VIP_MENU_CHANNEL_ID).catch(() => null);
      if (!menuCh || !menuCh.isTextBased()) {
        await safeReply(i, { content: "⚠️ Canal de menu/registros indisponível.", ephemeral: true });
        return true;
      }

      const embed = VIP_buildRegistroEmbed(guild, i.user, { evento, data, ganhadorId, org, premiacao });
      const msg = await menuCh.send({ embeds: [embed], components: VIP_buildRegistroButtons(false, false, false) });

      await VIP_sendDM_VIP(
        client,
        i.user.id,
        `📝 Seu registro de VIP foi criado!\n\n• Registro: ${msg.url}\n• Canal: <#${VIP_MENU_CHANNEL_ID}>\n\nAssim que marcarem como **solicitado** ou **pago**, te aviso por aqui.`,
        i.guild
      );

      await VIP_ensureFreshMenu(guild, client);

      const notify = await guild.channels.fetch(VIP_NOTIFY_CHANNEL_ID).catch(() => null);
      if (notify?.isTextBased()) {
        const aviso = new EmbedBuilder()
          .setColor(MENU_COLOR)
          .setTitle("🆕 Novo registro de VIP por evento")
          .setDescription(
            `O líder <@${i.user.id}> enviou um registro de premiação.

👀 **Coordenação** <@&${IDS.COORDENACAO}>: verificar se bate com o registro do outro menu em <#${VIP_CHECK_MENU_CHAT_ID}>.

🔗 Registro: ${msg.url}`
          )
          .setTimestamp();
        notify.send({ embeds: [aviso] }).catch(() => {});
      }

      const logs = await guild.channels.fetch(VIP_LOGS_CHANNEL_ID).catch(() => null);
      if (logs?.isTextBased()) {
        const logE = new EmbedBuilder()
          .setColor(REG_COLOR)
          .setTitle("📝 Registro criado")
          .addFields(
            { name: "Autor", value: `<@${i.user.id}>`, inline: true },
            { name: "Canal", value: `<#${VIP_MENU_CHANNEL_ID}>`, inline: true },
            { name: "Link", value: `${msg.url}`, inline: false }
          )
          .setTimestamp();
        logs.send({ embeds: [logE] }).catch(() => {});
      }

      dashEmit("vip:criado", {
  by: i.user.id,
});


      await safeReply(i, { content: `✅ Registro criado com sucesso! ${msg.url}`, ephemeral: true });
      return true;
    }

    // ── 4) BOTÕES DO REGISTRO: solicitado / pago / reprovar ───────
    if (isVipRegistroButtons) {
      // REPROVAR abre modal
      if (i.customId === VIP_BTN_REPROVAR_ID) {
        if (!canReprove(i.member)) {
          await safeReply(i, { content: "🚫 Você não tem permissão para reprovar pagamento.", ephemeral: true });
          return true;
        }
        const msg = i.message;
        if (!msg?.id) {
          await safeReply(i, { content: "⚠️ Mensagem do registro inválida.", ephemeral: true });
          return true;
        }
        const modal = VIP_buildReproveModal(msg.id);
        await i.showModal(modal);
        return true;
      }

      await safeDefer(i, { ephemeral: true });

      if (!canAction(i.member)) {
        await safeReply(i, { content: "🚫 Você não tem permissão para usar esse botão.", ephemeral: true });
        return true;
      }

      const msg = i.message;
      const guild = i.guild;

      if (!msg?.embeds?.[0]) {
        await safeReply(i, { content: "⚠️ Mensagem inválida.", ephemeral: true });
        return true;
      }

      const embed = EmbedBuilder.from(msg.embeds[0]);
      const fields = embed.data.fields ?? [];

      const desc = embed.data.description || "";
      const m = desc.match(/<@!?(\d+)>/);
      const registranteId = m?.[1] || null;

      const now = new Date();
      const whenTxt = `${time(Math.floor(now.getTime() / 1000), TimestampStyles.LongDateTime)} (${time(
        Math.floor(now.getTime() / 1000),
        TimestampStyles.RelativeTime
      )})`;

      // SOLICITADO
      if (i.customId === VIP_BTN_SOLICITADO_ID) {
        const idx = fields.findIndex((f) => f.name.startsWith("📝 Solicitações"));
        const linha = `• Marcado como **SOLICITADO** por <@${i.user.id}> em ${whenTxt}`;

        if (idx >= 0) {
          const cur = fields[idx].value === "—" ? "" : fields[idx].value + "\n";
          fields[idx].value = (cur + linha).slice(0, 1024);
        } else {
          fields.push({ name: "📝 Solicitações", value: linha, inline: false });
        }

        embed.setFields(fields);
        await msg.edit({ embeds: [embed], components: VIP_buildRegistroButtons(false, false, false) });

        if (registranteId) {
          await VIP_sendDM_VIP(
            client,
            registranteId,
            `📨 Sua premiação **foi solicitada**!\n\n• Registro: ${msg.url}\n• Marcado por: <@${i.user.id}>\n\n⚠️ Se em até **24h** não cair, avise **no seu chat da empresa** (nunca em PV de alguém).`,
            guild
          );
        }

        const logs = await guild.channels.fetch(VIP_LOGS_CHANNEL_ID).catch(() => null);
        logs?.isTextBased() &&
          logs
            .send({
              embeds: [
                new EmbedBuilder()
                  .setColor(MENU_COLOR)
                  .setTitle("📨 Marcado como solicitado")
                  .setDescription(`Registro: ${msg.url}\nPor: <@${i.user.id}>`)
                  .setTimestamp(),
              ],
            })
            .catch(() => {});


            dashEmit("vip:solicitado", {
  by: i.user.id,
});


        await safeReply(i, { content: "✅ Marcado como **solicitado**.", ephemeral: true });
        return true;
      }

      // PAGO
      if (i.customId === VIP_BTN_PAGO_ID) {
        const pagoIdx = fields.findIndex((f) => f.name.startsWith("💸 Pagamento"));
        const jaPago = pagoIdx >= 0 && fields[pagoIdx].value && fields[pagoIdx].value !== "—";
        if (jaPago) {
          await safeReply(i, { content: "⚠️ Este registro já foi marcado como **pago**.", ephemeral: true });
          return true;
        }

        const linha = `• **PAGO** por <@${i.user.id}> em ${whenTxt}`;
        if (pagoIdx >= 0) fields[pagoIdx].value = linha;
        else fields.push({ name: "💸 Pagamento", value: linha, inline: false });

        embed.setFields(fields);
        await msg.edit({ embeds: [embed], components: VIP_buildRegistroButtons(true, true, false) });

        if (registranteId) {
          const ganhadorField = fields.find((f) => f.name.includes("ID do ganhador"));
          const ganhadorId = ganhadorField ? ganhadorField.value.match(/`(\d+)`/)?.[1] ?? null : null;

          await VIP_sendDM_VIP(
            client,
            registranteId,
            `💸 Sua premiação **foi paga**!\n\n• Registro: ${msg.url}\n• Marcado por: <@${i.user.id}>\n• ID do beneficiado: ${ganhadorId ? `\`${ganhadorId}\`` : "—"}\n\nQualquer coisa, fale **no seu chat da empresa**!`,
            guild
          );
        }

        const logs = await guild.channels.fetch(VIP_LOGS_CHANNEL_ID).catch(() => null);
        logs?.isTextBased() &&
          logs
            .send({
              embeds: [
                new EmbedBuilder()
                  .setColor(REG_COLOR)
                  .setTitle("💸 Marcado como pago")
                  .setDescription(`Registro: ${msg.url}\nPor: <@${i.user.id}>`)
                  .setTimestamp(),
              ],
            })
            .catch(() => {});

            dashEmit("vip:pago", {
  by: i.user.id,
})

        await safeReply(i, { content: "✅ Marcado como **pago**. Botões desabilitados.", ephemeral: true });
        return true;
      }
    }

    return true;
  } catch (err) {
    if (!isUnknownInteractionError(err)) console.error("[VIP] erro:", err);
    return true; // se entrou aqui, era nosso
  }
}
