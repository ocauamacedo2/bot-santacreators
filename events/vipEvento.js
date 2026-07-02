// ./events/application/events/vipEvento.js
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
  TimestampStyles,
  time,
} from "discord.js";
// ✅ HUB do dashboard
import { dashEmit } from "../utils/dashHub.js";

// ── CONFIG DE CANAIS ─────────────────────────────────────────────
const VIP_MENU_CHANNEL_ID = "1414718336826081330"; // onde fica o MENU e os REGISTROS
const VIP_NOTIFY_CHANNEL_ID = "1424489278615978114"; // notificação de novo registro
const VIP_CHECK_MENU_CHAT_ID = "1387922662134775818"; // referência ao "outro menu" para checagem
const VIP_LOGS_CHANNEL_ID = "1486084363778261072"; // logs de ações (tudo)

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

  // ✅ cargos para PAGO / REPROVAR
  RESP_CREATORS: "1352408327983861844",
  COORD_CREATORS: "1388976314253312100",
  RESP_LIDER: "1352407252216184833",
  RESP_INFLU: "1262262852949905409",
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

// Quem pode clicar nos botões de ação (SOLICITADO + FILTROS)
const ACTION_ALLOWED = [
  IDS.OWNER,
  IDS.EU,
  IDS.COORDENACAO,
  IDS.RESPONSAVEIS,
  IDS.EQUIPE_CREATOR,
];
const ACTION_ALLOWED_USERS = [IDS.EU];

// ✅ Quem pode marcar como PAGO
const PAYMENT_ALLOWED = [
  IDS.COORD_CREATORS,
  IDS.RESP_LIDER,
  IDS.RESP_INFLU,
  IDS.RESP_CREATORS,
  IDS.OWNER,
];
const PAYMENT_ALLOWED_USERS = [IDS.EU];

// ✅ Quem pode REPROVAR pagamento
const REPROVE_ALLOWED = [
  IDS.COORD_CREATORS,
  IDS.RESP_LIDER,
  IDS.RESP_INFLU,
  IDS.RESP_CREATORS,
  IDS.OWNER,
];
const REPROVE_ALLOWED_USERS = [IDS.EU];

// ── CONSTs de UI ─────────────────────────────────────────────────
const VIP_MENU_BUTTON_ID = "vip_menu_open";
const VIP_MODAL_ID = "vip_modal_submit";
const VIP_SEL_CITY_ID = 'vip_select_city';

const CITIES = {
    nobre: { label: "Nobre", emoji: "👑", roleId: "1379021805544804382" },
    santa: { label: "Santa", emoji: "🎅", roleId: "1379021888709464168" },
    maresia: { label: "Maresia", emoji: "🌊", roleId: "1379021994678288465" },
    royal: { label: "Royal UK", emoji: "🇬🇧", roleId: "1379021933324271719" },
    universo: { label: "Universo", emoji: "🌌", roleId: "1379022090891427892" },
    kng: { label: "KNG", emoji: "🦁", roleId: "1379022161519312896" },
    malta: { label: "Malta", emoji: "🇲🇹", roleId: "1379022050403815454" },
    real: { label: "Real", emoji: "💎", roleId: "1423348501110198343" },
    grande: { label: "Grande", emoji: "🐘", roleId: "1418691103397253322" },
    boomerang: { label: "Boomerang", emoji: "🪃", roleId: "1423354185570586694" },
};

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

    if (update && i.isMessageComponent()) {
      i.__vipDeferredUpdate = true;
      await i.deferUpdate();
      return;
    }

    i.__vipDeferredUpdate = false;
    await i.deferReply({ ephemeral });
  } catch (e) {
    if (!isUnknownInteractionError(e)) throw e;
  }
}
async function safeReply(i, opts) {
  try {
    if (i.replied) {
      return await i.followUp(opts);
    }

    if (i.deferred) {
      if (i.__vipDeferredUpdate) {
        return await i.followUp({
          ephemeral: true,
          ...opts,
        });
      }

      return await i.editReply(opts);
    }

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
function canMarkPaid(member) {
  return hasAnyRole(member, PAYMENT_ALLOWED) || PAYMENT_ALLOWED_USERS.includes(member?.id);
}
function canReprove(member) {
  return hasAnyRole(member, REPROVE_ALLOWED) || REPROVE_ALLOWED_USERS.includes(member?.id);
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
    
    const normal = crono.schedule?.[todayKey];
    if (normal && normal.active) return normal;

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
  .setLabel("Nome | ID do ganhador")
  .setPlaceholder("Ex: Lopess 7 | 209311 ou 209311 | Lopess 7")
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

function VIP_parseGanhadorFlex(input, orgFallback = "Não identificado") {
  const raw = String(input || "").trim();

  if (!raw) {
    return {
      nome: orgFallback || "Não identificado",
      id: "",
    };
  }

  const partes = raw
    .split(/[|\/\\]/g)
    .map((p) => p.trim())
    .filter(Boolean);

  const extrairId = (texto) => {
    const mention = String(texto || "").match(/<@!?(\d{1,25})>/);
    if (mention?.[1]) return mention[1];

    const numero = String(texto || "").match(/\b\d{1,25}\b/);
    return numero?.[0] || "";
  };

  if (partes.length >= 2) {
    const a = partes[0];
    const b = partes.slice(1).join(" | ");

    const idA = extrairId(a);
    const idB = extrairId(b);

    if (idA && !idB) {
      return {
        id: idA,
        nome: b || orgFallback || "Não identificado",
      };
    }

    if (idB) {
      return {
        id: idB,
        nome: a || orgFallback || "Não identificado",
      };
    }

    return {
      nome: a || orgFallback || "Não identificado",
      id: b || "",
    };
  }

  const unico = partes[0] || raw;
  const idUnico = extrairId(unico);

return {
  id: idUnico,
  nome: idUnico ? "Não identificado" : unico,
};
}

function VIP_formatarCampoIdGanhador(ganhadorId) {
  const id = String(ganhadorId || "").trim();

  if (!id) return "`Não informado`";
  if (/^\d{1,25}$/.test(id)) return `<@${id}> (\`${id}\`)`;

  return `\`${id}\``;
}

function VIP_buildRegistroEmbed(guild, registrante, payload, cityName) {
  const when = new Date();
  const avatar = registrante.displayAvatarURL({ size: 256 });

  const tipoIdentificado = VIP_normalizarTipoPremiacao(payload.tipo || payload.premiacao);
  const tipoBonito = VIP_formatTipoBonito(tipoIdentificado);

  const fontePagamento = payload.pagamentoLink
    ? `🔗 **Link analisado:** ${payload.pagamentoLink}`
    : "—";

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
      )})

**Tipo Identificado:** \`${tipoIdentificado}\``
    )
    .addFields(
      { name: "🏁 Nome do evento ganho", value: `\`${payload.evento}\``, inline: false },
      { name: "📅 Dia do evento", value: `\`${payload.data}\``, inline: true },
      { name: "🆔 ID do ganhador", value: VIP_formatarCampoIdGanhador(payload.ganhadorId), inline: true },
      { name: "👤 Nome do ganhador", value: `\`${payload.ganhadorNome || "Não identificado"}\``, inline: true },
      { name: "🌆 Cidade", value: `**${cityName}**`, inline: true },
      { name: "🏢 Organização", value: `\`${payload.org}\``, inline: true },
      { name: "🎁 Premiação", value: `${tipoBonito}\n\n${payload.premiacao || "—"}`, inline: false },
      { name: "🔎 Fonte automática", value: fontePagamento, inline: false },
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
// ── Helpers de LOG/AUDITORIA VIP ────────────────────────────────
function VIP_cut(value, max = 1024) {
  const text = String(value ?? "—");
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function VIP_userTag(user) {
  if (!user) return "—";
  return `<@${user.id}> (\`${user.id}\`)`;
}

function VIP_channelTag(channel) {
  if (!channel) return "—";
  return `<#${channel.id}> (\`${channel.id}\`)`;
}

function VIP_formatDateSP(date = new Date()) {
  return `${time(Math.floor(date.getTime() / 1000), TimestampStyles.LongDateTime)} (${time(
    Math.floor(date.getTime() / 1000),
    TimestampStyles.RelativeTime
  )})`;
}

function VIP_normalizarTipoPremiacao(texto) {
  const t = String(texto || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s$.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const palavras = t.split(" ").filter(Boolean);
  const textoColado = t.replace(/\s+/g, "");

  // ✅ Se ficou vazio depois da limpeza, NÃO pode virar Dinheiro.
  if (!t) return "Não identificado";

  // ✅ PRIORIDADE REAL:
  // Se tiver Rolepass/Pass escrito em qualquer linha da premiação,
  // ele ganha de "VIP Evento", "VIP Staff" e "VIP Gente Boa".
  if (
    /\brole\s*pass\b/.test(t) ||
    /\brolepass\b/.test(t) ||
    /\brol\s*pass\b/.test(t) ||
    /\brole\s*passe\b/.test(t) ||
    /\brolipass\b/.test(t) ||
    /\broll\s*pass\b/.test(t) ||
    /\brole\s*p\b/.test(t) ||
    /\brol\s*passe\b/.test(t) ||
    /\brp\b/.test(t) ||
    textoColado.includes("rolepass") ||
    textoColado.includes("rollpass") ||
    textoColado.includes("rolpass") ||
    textoColado.includes("rolipass") ||
    textoColado.includes("rolepasse")
  ) return "Pass";

  if (/\bpass\b/.test(t) || /\bpasse\b/.test(t)) return "Pass";

  // ✅ VIP Evento só entra se NÃO tiver Rolepass/Pass na premiação.
  if (
    /\bvip\s*evento\b/.test(t) ||
    /\bvipevento\b/.test(t) ||
    /\bevento\s*vip\b/.test(t) ||
    /\bvip\s*event\b/.test(t) ||
    /\bvip\s*evnto\b/.test(t) ||
    /\bvip\s*eventu\b/.test(t) ||
    /\bvip\s*eventos\b/.test(t) ||
    /\bvip\s*por\s*evento\b/.test(t) ||
    /\bpor\s*evento\b/.test(t) ||
    (/\bevento\b/.test(t) && /\bvip\b/.test(t)) ||
    textoColado.includes("vipevento") ||
    textoColado.includes("vipporevento") ||
    textoColado.includes("vipporvento") ||
    textoColado.includes("vipevent") ||
    textoColado.includes("vipevnto") ||
    textoColado.includes("vipeventu")
  ) return "VIP Evento";

  if (
    t.includes("platinum") ||
    t.includes("platinium") ||
    t.includes("platnum") ||
    t.includes("platinun") ||
    t.includes("platibnum") ||
    t.includes("platina") ||
    t.includes("platino") ||
    t.includes("platnao") ||
    t.includes("platinu") ||
    t.includes("platin")
  ) return "VIP Platinum";

  if (t.includes("black") || t.includes("blak") || t.includes("bleck")) return "VIP Black";
  if (t.includes("bronze") || t.includes("bronz") || t.includes("bronzi")) return "VIP Bronze";
  if (t.includes("prata") || t.includes("prataa")) return "VIP Prata";
  if (t.includes("ouro") || t.includes("oru")) return "VIP Ouro";



  if (
    t.includes("staff") ||
    t.includes("gente boa") ||
    t.includes("genteboa") ||
    t.includes("gente boua") ||
    t.includes("vip gente")
  ) {
    return "VIP Staff";
  }

  if (
    t.includes("lancamento") ||
    t.includes("lançamento") ||
    t.includes("lancamnto") ||
    t.includes("lancamento") ||
    t.includes("lanca")
  ) return "VIP Lancamento";

  const pareceDinheiro =
    /\bdinheiro\b/.test(t) ||
    /\bgrana\b/.test(t) ||
    /\bcash\b/.test(t) ||
    /\bvalor\b/.test(t) ||
    /\breais\b/.test(t) ||
    /r\s*\$/.test(t) ||
    /\b\d{1,3}(?:[.\s]\d{3})+(?:,\d{1,2})?\b/.test(t) ||
    /\b\d+(?:[.,]\d+)?\s*(?:k|kk|m|mi|mil|milhao|milhoes)\b/.test(t) ||
    /\b\d+\s*(?:mi|milhoes|milhao|kk)\b/.test(t);

  if (pareceDinheiro) return "Dinheiro";

  return "Dinheiro";
}

function VIP_formatTipoBonito(tipo) {
  const t = String(tipo || "").trim();

  if (t === "Pass") return "🎟️ **Tipo:** `Rolepass`";
  if (t === "Dinheiro") return "💰 **Tipo:** `Dinheiro`";
  if (t === "VIP Platinum") return "💎 **Tipo:** `VIP Platinum`";
  if (t === "VIP Black") return "🖤 **Tipo:** `VIP Black`";
  if (t === "VIP Bronze") return "🥉 **Tipo:** `VIP Bronze`";
  if (t === "VIP Prata") return "🥈 **Tipo:** `VIP Prata`";
  if (t === "VIP Ouro") return "🥇 **Tipo:** `VIP Ouro`";
  if (t === "VIP Staff") return "🛡️ **Tipo:** `VIP Staff`";
  if (t === "VIP Lancamento") return "🚀 **Tipo:** `VIP Lançamento`";
  if (t === "VIP Evento") return "🎁 **Tipo:** `VIP Evento`";
  if (t === "Não identificado") return "❔ **Tipo:** `Não identificado`";

  return `🎁 **Tipo:** \`${t || "Não identificado"}\``;
}

function VIP_extractDiscordMessageUrl(texto) {
  const match = String(texto || "").match(/https?:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/channels\/(\d{10,25})\/(\d{10,25})\/(\d{10,25})/i);
  if (!match) return null;

  return {
    guildId: match[1],
    channelId: match[2],
    messageId: match[3],
    url: match[0],
  };
}

function VIP_getFieldValue(embedLike, fieldNameStarts) {
  const fields = embedLike?.fields || embedLike?.data?.fields || [];
  const field = fields.find((f) => String(f.name || "").startsWith(fieldNameStarts));
  return String(field?.value || "").trim();
}

function VIP_extractPagamentoInfoFromEmbed(embedLike) {
  const desc = String(embedLike?.description || embedLike?.data?.description || "");

  const tipoMatch =
    desc.match(/Tipo Identificado:\*\*\s*`([^`]+)`/i) ||
    desc.match(/Tipo Identificado:\s*`([^`]+)`/i) ||
    desc.match(/Tipo Identificado:\s*([^\n]+)/i);

const premiacaoParaAnalise =
  VIP_getFieldValue(embedLike, "🎁 Premiação") ||
  VIP_getFieldValue(embedLike, "🔗 Premiação") ||
  VIP_getFieldValue(embedLike, "🔗 Premiação / Link") ||
  "";

const tipoRaw = [
  tipoMatch?.[1] || "",
  premiacaoParaAnalise,
  VIP_getFieldValue(embedLike, "🏷️ Tipo") || "",
].join("\n").trim();

  const ganhadorRaw = VIP_getFieldValue(embedLike, "👤 Ganhador");
  const idMatch =
    ganhadorRaw.match(/<@!?(\d{10,25})>/) ||
    ganhadorRaw.match(/\|\s*(\d{1,25})\b/) ||
    ganhadorRaw.match(/\bID\s*[:\-]?\s*(\d{1,25})\b/i) ||
    ganhadorRaw.match(/\b(\d{1,25})\b/);

  const nomeGanhador = ganhadorRaw
    .replace(/<@!?\d{10,25}>/g, "")
    .replace(/\|\s*\d{1,25}\b/g, "")
    .replace(/\bID\s*[:\-]?\s*\d{1,25}\b/gi, "")
    .replace(/[`*_]/g, "")
    .trim();

  const eventoRaw =
    VIP_getFieldValue(embedLike, "🏷️ Evento") ||
    VIP_getFieldValue(embedLike, "🏁 Nome do evento ganho");

  const dataRaw =
    VIP_getFieldValue(embedLike, "📅 Data do Evento") ||
    VIP_getFieldValue(embedLike, "📅 Dia do evento") ||
    VIP_getFieldValue(embedLike, "📅 Data");

  const premiacaoRaw =
    VIP_getFieldValue(embedLike, "🔗 Premiação / Link") ||
    VIP_getFieldValue(embedLike, "🎁 Premiação") ||
    tipoRaw;

  return {
    tipo: VIP_normalizarTipoPremiacao(tipoRaw || premiacaoRaw),
    nomeGanhador: nomeGanhador || null,
    ganhadorId: idMatch?.[1] || null,
    evento: eventoRaw || null,
    data: dataRaw || null,
    premiacao: premiacaoRaw || tipoRaw || null,
  };
}

async function VIP_resolverPagamentoLink(client, texto) {
  const link = VIP_extractDiscordMessageUrl(texto);
  if (!link) return null;

  const channel = await client.channels.fetch(link.channelId).catch(() => null);
  if (!channel?.isTextBased()) {
    return {
      ok: false,
      link,
      erro: "Canal do link não encontrado ou não é texto.",
    };
  }

  const msg = await channel.messages.fetch(link.messageId).catch(() => null);
  if (!msg?.embeds?.[0]) {
    return {
      ok: false,
      link,
      erro: "Mensagem do link não encontrada ou sem embed.",
    };
  }

  return {
    ok: true,
    link,
    message: msg,
    info: VIP_extractPagamentoInfoFromEmbed(msg.embeds[0]),
  };
}

function VIP_limparTextoAnalise(texto) {
  return String(texto || "")
    .replace(/<@!?\d{10,25}>/g, " ")
    .replace(/<@&\d{10,25}>/g, " ")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[`*_~|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function VIP_extrairQuantidadePremiacao(texto) {
  const t = VIP_limparTextoAnalise(texto);

  const match =
    t.match(/\b(\d{1,3})\s*(?:x|un|unidade|unidades)?\s*(role\s*pass|rolepass|pass|vip|platinum|ouro|prata|bronze|black|staff|evento)\b/i) ||
    t.match(/\b(role\s*pass|rolepass|pass|vip|platinum|ouro|prata|bronze|black|staff|evento)\s*(?:x|un|unidade|unidades)?\s*(\d{1,3})\b/i);

  if (!match) return null;

  const quantidade = /^\d+$/.test(match[1]) ? match[1] : match[2];
  return quantidade || null;
}

function VIP_limparPremiacaoFormatada(texto) {
  const linhas = String(texto || "")
    .split(/\r?\n/g)
    .map((linha) => linha.trim())
    .filter(Boolean);

  const limpas = [];

  for (const linhaOriginal of linhas) {
    let linha = linhaOriginal;

    // ✅ Remove linhas automáticas antigas do próprio bot.
    if (/\*\*Tipo:\*\*\s*`[^`]+`/i.test(linha)) continue;
    if (/^.*Tipo:\s*`[^`]+`\s*$/i.test(linha)) continue;
    if (/^\*\*Quantidade:\*\*/i.test(linha)) continue;
    if (/^\*\*Item:\*\*/i.test(linha)) continue;

    // ✅ Remove linha formatada antiga SOMENTE se tiver emoji/símbolo no começo.
    // Remove: "🎟️ Rolepass"
    // Mantém: "rolepass"
    // Mantém: "vip gente boa"
    if (/^[^\w\s`]+\s*(role\s*pass|rolepass|vip\s*evento|vip\s*staff|vip\s*gente\s*boa|vip\s*platinum|vip\s*black|vip\s*bronze|vip\s*prata|vip\s*ouro|vip\s*lancamento)\s*$/i.test(linha)) {
      continue;
    }

    // ✅ Remove prefixos confusos.
    // "GG : VIP GENTE BOA" vira "VIP GENTE BOA"
    linha = linha.replace(/^\s*(gg|g\.g|premio|premiação|premiacao|tipo|item)\s*[:\-]\s*/i, "").trim();

    if (linha) limpas.push(linha);
  }

  return limpas.join("\n").trim();
}

function VIP_pegarTextoPrincipalPremiacao(texto) {
  const limpo = VIP_limparPremiacaoFormatada(texto);
  const linhas = limpo
    .split(/\r?\n/g)
    .map((linha) => linha.trim())
    .filter(Boolean);

  return linhas.length ? linhas[linhas.length - 1] : limpo;
}

function VIP_formatarPremiacaoInteligente(texto, tipoForcado = null) {
  const textoLimpo = VIP_limparPremiacaoFormatada(texto);
  const tipo = VIP_normalizarTipoPremiacao(tipoForcado || textoLimpo);
  const tipoBonito = VIP_formatTipoBonito(tipo);
  const quantidade = VIP_extrairQuantidadePremiacao(textoLimpo);

  const bruto = String(textoLimpo || "—").trim();

  if (quantidade && tipo !== "Dinheiro") {
    return `${tipoBonito}\n\n**Quantidade:** \`${quantidade}\`\n**Item:** \`${tipo === "Pass" ? "Rolepass" : tipo}\``;
  }

  return `${tipoBonito}\n\n${bruto || "—"}`;
}

function VIP_getTextoCompletoEmbed(embedLike) {
  const desc = String(embedLike?.description || embedLike?.data?.description || "");
  const fields = embedLike?.fields || embedLike?.data?.fields || [];

  const campos = fields
    .map((f) => `${f.name || ""}\n${f.value || ""}`)
    .join("\n");

  return `${desc}\n${campos}`;
}
function VIP_reanalisarEmbedVip(embedBuilder) {
  const fields = embedBuilder.data.fields ?? [];
  const premiacaoField = fields.find((f) => String(f.name || "").startsWith("🎁 Premiação"));

  const textoPremiacao = String(premiacaoField?.value || "");
  const textoRealPremiacao = VIP_limparPremiacaoFormatada(textoPremiacao);
  const textoPrincipalPremiacao = VIP_pegarTextoPrincipalPremiacao(textoPremiacao);

  // ✅ Identifica pelo texto principal real.
  // Se tiver várias linhas confusas, a última premiação real manda.
  const tipoFinal = VIP_normalizarTipoPremiacao(textoPrincipalPremiacao || textoRealPremiacao);

  const premiacaoFinal = VIP_formatarPremiacaoInteligente(textoRealPremiacao || textoPremiacao, tipoFinal);

  const novosFields = fields.map((f) => {
    if (String(f.name || "").startsWith("🎁 Premiação")) {
      return {
        ...f,
        value: premiacaoFinal.slice(0, 1024),
      };
    }

    return f;
  });

  const descAtual = String(embedBuilder.data.description || "");
  const descCorrigida = descAtual.replace(
    /\*\*Tipo Identificado:\*\*\s*`[^`]+`/i,
    `**Tipo Identificado:** \`${tipoFinal}\``
  );

  embedBuilder.setDescription(descCorrigida);
  embedBuilder.setFields(novosFields);

  return {
    tipoFinal,
    premiacaoFinal,
  };
}

async function VIP_corrigirRegistroVipMensagem(msg, client) {
  if (!msg?.embeds?.[0]) {
    return {
      ok: false,
      corrigido: false,
      motivo: "Mensagem sem embed.",
    };
  }

  const embed = EmbedBuilder.from(msg.embeds[0]);
  const antes = String(embed.data.description || "");

  const analiseFinal = VIP_reanalisarEmbedVip(embed);

  const fields = VIP_getFields(embed);
  const premiacaoField = fields.find((f) => String(f.name || "").startsWith("🎁 Premiação"));
  const premiacaoTexto = String(premiacaoField?.value || "");

  const pagamentoResolvido = await VIP_resolverPagamentoLink(client, premiacaoTexto).catch(() => null);

  if (pagamentoResolvido?.ok) {
    const tipoFinal = VIP_normalizarTipoPremiacao(
      [
        pagamentoResolvido.info?.tipo || "",
        pagamentoResolvido.info?.premiacao || "",
        premiacaoTexto,
      ].join("\n")
    );

    const novosFields = VIP_getFields(embed).map((f) => {
      if (String(f.name || "").startsWith("🎁 Premiação")) {
        return {
          ...f,
          value: VIP_formatarPremiacaoInteligente(
            pagamentoResolvido.info?.premiacao || premiacaoTexto,
            tipoFinal
          ).slice(0, 1024),
        };
      }

      if (String(f.name || "").startsWith("🔎 Fonte automática")) {
        return {
          ...f,
          value: `🔗 **Link analisado:** ${pagamentoResolvido.link.url}`,
        };
      }

      return f;
    });

    embed.setFields(novosFields);

    const descAtual = String(embed.data.description || "");
    const descCorrigida = descAtual.replace(
      /\*\*Tipo Identificado:\*\*\s*`[^`]+`/i,
      `**Tipo Identificado:** \`${tipoFinal}\``
    );

    embed.setDescription(descCorrigida);

    analiseFinal.tipoFinal = tipoFinal;
    analiseFinal.premiacaoFinal = pagamentoResolvido.info?.premiacao || premiacaoTexto;
  }

  const depois = String(embed.data.description || "");

  await msg.edit({
    embeds: [embed],
    components: msg.components,
  }).catch(() => null);

  return {
    ok: true,
    corrigido: antes !== depois || Boolean(pagamentoResolvido?.ok),
    tipoFinal: analiseFinal.tipoFinal,
    vinculado: Boolean(pagamentoResolvido?.ok),
  };
}

function VIP_extractEmbedFields(embedLike) {
  const fields = embedLike?.data?.fields || embedLike?.fields || [];
  if (!fields.length) return "—";

  return fields
    .map((f) => `**${f.name || "Campo"}:** ${f.value || "—"}`)
    .join("\n")
    .slice(0, 1000);
}

async function VIP_sendAuditLog(client, guild, payload = {}) {
  try {
    const logs = await client.channels.fetch(VIP_LOGS_CHANNEL_ID).catch(() => null);
    if (!logs?.isTextBased()) return;

    const now = new Date();
    const actor = payload.actor || payload.interaction?.user || null;
    const member = payload.interaction?.member || null;
    const channel = payload.channel || payload.interaction?.channel || null;
    const message = payload.message || payload.interaction?.message || null;

    const guildIcon = guild?.iconURL({ size: 256, forceStatic: false }) ?? null;
    const actorIcon = actor?.displayAvatarURL?.({ size: 256, forceStatic: false }) ?? null;

    const serverLink = guild?.id ? `https://discord.com/channels/${guild.id}` : "—";
    const channelLink = guild?.id && channel?.id ? `https://discord.com/channels/${guild.id}/${channel.id}` : "—";
    const messageLink = message?.url || payload.messageUrl || "—";

    const embed = new EmbedBuilder()
      .setColor(payload.color ?? MENU_COLOR)
      .setTitle(payload.title || "📋 Log VIP")
      .setAuthor({
        name: actor ? `${actor.tag || actor.username} • ${actor.id}` : "Sistema VIP",
        iconURL: actorIcon ?? undefined,
      })
      .setThumbnail(actorIcon || guildIcon)
      .addFields(
        {
          name: "👤 Usuário",
          value: VIP_cut(
            actor
              ? [
                  `Menção: ${VIP_userTag(actor)}`,
                  `Tag: \`${actor.tag || actor.username || "—"}\``,
                  `Avatar: ${actorIcon || "—"}`,
                ].join("\n")
              : "—"
          ),
          inline: false,
        },
        {
          name: "🏠 Servidor",
          value: VIP_cut(
            [
              `Nome: \`${guild?.name || "—"}\``,
              `ID: \`${guild?.id || "—"}\``,
              `Link: ${serverLink}`,
              `Ícone: ${guildIcon || "—"}`,
            ].join("\n")
          ),
          inline: false,
        },
        {
          name: "📍 Canal / Local",
          value: VIP_cut(
            [
              `Canal: ${VIP_channelTag(channel)}`,
              `Categoria: ${channel?.parent ? `${channel.parent.name} (\`${channel.parent.id}\`)` : "—"}`,
              `Link do canal: ${channelLink}`,
              `Link da mensagem: ${messageLink}`,
            ].join("\n")
          ),
          inline: false,
        },
        {
          name: "⚙️ Interação",
          value: VIP_cut(
            [
              `Ação: \`${payload.action || "—"}\``,
              `CustomId: \`${payload.interaction?.customId || "—"}\``,
              `Interaction ID: \`${payload.interaction?.id || "—"}\``,
              `Data/Hora: ${VIP_formatDateSP(now)}`,
            ].join("\n")
          ),
          inline: false,
        }
      )
      .setFooter({
        text: "SantaCreators • Auditoria VIP",
        iconURL: guildIcon ?? undefined,
      })
      .setTimestamp(now);

    if (member?.roles?.cache?.size) {
      embed.addFields({
        name: "🎭 Cargos do usuário",
        value: VIP_cut(member.roles.cache.filter((r) => r.id !== guild?.id).map((r) => `<@&${r.id}>`).join(", ") || "—"),
        inline: false,
      });
    }

    if (payload.during) {
      embed.addFields({
        name: "🔄 Durante o processo",
        value: VIP_cut(payload.during),
        inline: false,
      });
    }

    if (payload.before) {
      embed.addFields({
        name: "⬅️ Antes",
        value: VIP_cut(payload.before),
        inline: false,
      });
    }

    if (payload.after) {
      embed.addFields({
        name: "➡️ Depois",
        value: VIP_cut(payload.after),
        inline: false,
      });
    }

    if (payload.extra) {
      embed.addFields({
        name: "📌 Informações extras",
        value: VIP_cut(payload.extra),
        inline: false,
      });
    }

    await logs.send({ embeds: [embed] }).catch(() => {});
  } catch (err) {
    console.error("[VIP LOG] Erro ao enviar auditoria:", err);
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

const resultadoCorrecao = await VIP_corrigirRegistroVipMensagem(msg, client).catch(() => null);

const rawCorrigido = msg.embeds?.[0];
if (!rawCorrigido) continue;

const embCorrigido = EmbedBuilder.from(rawCorrigido);

let analiseFinal = {
  tipoFinal: resultadoCorrecao?.tipoFinal || VIP_normalizarTipoPremiacao(VIP_getTextoCompletoEmbed(embCorrigido)),
  premiacaoFinal: null,
};

emb.setDescription(embCorrigido.data.description || emb.data.description || "");
emb.setFields(embCorrigido.data.fields || emb.data.fields || []);

const descAtual = String(emb.data.description || "");
const descSemFiltro = descAtual.replace(/\n\n\*\*Filtro automático:\*\* `[^`]+`/gi, "");

emb.setDescription(
  `${descSemFiltro}\n\n**Filtro automático:** \`${analiseFinal.tipoFinal}\``
);

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
  for (const g of client.guilds.cache.values()) {
    await VIP_ensureFreshMenu(g, client);
  }
}

export async function vipEventoHandleInteraction(i, client) {
  try {
    const isVipMenuButton =
      i.isButton?.() &&
      [VIP_MENU_BUTTON_ID, VIP_FILTER_SOLICITADOS_ID, VIP_FILTER_NAOCLICADOS_ID].includes(i.customId);

    const isVipCitySelect = i.isStringSelectMenu?.() && i.customId === VIP_SEL_CITY_ID;

const isVipModalCriar =
  i.isModalSubmit?.() &&
  (i.customId === VIP_MODAL_ID || i.customId.startsWith(`${VIP_MODAL_ID}:`));
    const isVipRegistroButtons = i.isButton?.() && [VIP_BTN_SOLICITADO_ID, VIP_BTN_PAGO_ID, VIP_BTN_REPROVAR_ID].includes(i.customId);
    const isVipModalReprovar = i.isModalSubmit?.() && i.customId?.startsWith(`${VIP_REPROVE_MODAL_ID}:`);

    if (!isVipMenuButton && !isVipModalCriar && !isVipRegistroButtons && !isVipModalReprovar && !isVipCitySelect) {
      return false;
    }

    if (VIP_hasHandled(i)) return true;

    // ── 1) BOTÕES DO MENU: abrir + filtros ────────────────────────
    if (isVipMenuButton) {
      if (i.customId === VIP_MENU_BUTTON_ID) {
        if (!canRegister(i.member)) {
          await safeReply(i, { content: "🚫 Você não tem permissão para registrar.", ephemeral: true });
          return true;
        }

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(VIP_SEL_CITY_ID)
            .setPlaceholder('Selecione a cidade do evento')
            .addOptions(
                Object.entries(CITIES).map(([key, city]) =>
                    new StringSelectMenuOptionBuilder()
                        .setLabel(city.label)
                        .setValue(key)
                        .setEmoji(city.emoji)
                )
            );
        const row = new ActionRowBuilder().addComponents(selectMenu);
        await safeReply(i, {
            content: '🌆 Para qual cidade é este registro de VIP?',
            components: [row],
            ephemeral: true,
        });
        return true;
      }

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

    if (isVipCitySelect) {
        if (!canRegister(i.member)) {
            await safeReply(i, { content: '🚫 Você não tem permissão para registrar.', ephemeral: true });
            return true;
        }
        const cityKey = i.values[0];
        const eventData = getTodayEventData();

        const modal = VIP_buildModal(eventData);
        modal.setCustomId(`${VIP_MODAL_ID}:${cityKey}`);

        try {
    await i.showModal(modal);

    await VIP_sendAuditLog(client, i.guild, {
      title: "🌆 Modal de VIP aberto",
      color: MENU_COLOR,
      action: "ABRIU_MODAL_VIP",
      interaction: i,
      actor: i.user,
      channel: i.channel,
      during: "Usuário selecionou a cidade e o sistema abriu o modal de registro de VIP.",
      before: "Antes: usuário estava no seletor de cidade.",
      after: `Depois: modal aberto para preenchimento.\nCidade selecionada: **${CITIES[cityKey].label}** (\`${cityKey}\`)`,
      extra: `Dados automáticos do cronograma:\n\`\`\`json\n${VIP_cut(JSON.stringify(eventData || {}, null, 2), 900)}\n\`\`\``,
    });
} catch (err) {
    console.error('[VIP] showModal (city select) falhou:', err);
}
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

      await VIP_sendAuditLog(client, guild, {
  title: "⛔ Pagamento VIP reprovado",
  color: 0xff0000,
  action: "REPROVOU_PAGAMENTO",
  interaction: i,
  actor: i.user,
  channel: msg.channel,
  message: msg,
  messageUrl: msg.url,
  during: "Usuário enviou o modal de reprovação, o sistema registrou o motivo e desabilitou os botões do registro.",
  before: `Antes:\n${VIP_extractEmbedFields(msg.embeds?.[0])}`,
  after: `Depois:\n${VIP_extractEmbedFields(embed)}`,
  extra: [
    `Registrante original: ${registranteId ? `<@${registranteId}> (\`${registranteId}\`)` : "—"}`,
    `Motivo: ${motivo}`,
    `Link do registro: ${msg.url}`,
  ].join("\n"),
});


         dashEmit("vip:reprovado", {
  by: i.user.id,
  source: "vipreprovado",
  sourceLabel: "VIP Líderes (Reprovado)",
  __at: Date.now(),
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

      const customIdParts = i.customId.split(':');
      const cityKey = customIdParts.length > 1 ? customIdParts[1] : null;

      if (!cityKey || !CITIES[cityKey]) {
          await safeReply(i, { content: "❌ Cidade inválida ou não selecionada. Por favor, comece o processo novamente.", ephemeral: true });
          return true;
      }

let evento = i.fields.getTextInputValue("vip_evt_nome").trim();
let data = i.fields.getTextInputValue("vip_evt_data").trim();
const ganhadorInput = i.fields.getTextInputValue("vip_ganhador_id").trim();
const org = i.fields.getTextInputValue("vip_org_nome").trim();
let premiacao = i.fields.getTextInputValue("vip_premiacao").trim();

const ganhadorFlex = VIP_parseGanhadorFlex(ganhadorInput, org);

let ganhadorId = ganhadorFlex.id;
let ganhadorNome = ganhadorFlex.nome || org || "Não identificado";

const pagamentoResolvido = await VIP_resolverPagamentoLink(client, premiacao);
const premiacaoPrincipal = VIP_pegarTextoPrincipalPremiacao(premiacao);
let tipo = VIP_normalizarTipoPremiacao(premiacaoPrincipal || premiacao);
let pagamentoLink = null;

if (pagamentoResolvido?.ok) {
  pagamentoLink = pagamentoResolvido.link.url;

  if (pagamentoResolvido.info?.evento) evento = pagamentoResolvido.info.evento;
  if (pagamentoResolvido.info?.data) data = pagamentoResolvido.info.data;
  if (pagamentoResolvido.info?.ganhadorId) ganhadorId = pagamentoResolvido.info.ganhadorId;
  if (pagamentoResolvido.info?.nomeGanhador) ganhadorNome = pagamentoResolvido.info.nomeGanhador;

  tipo = VIP_normalizarTipoPremiacao(
    `${pagamentoResolvido.info?.tipo || ""}\n${pagamentoResolvido.info?.premiacao || ""}\n${premiacao}`
  );

  if (pagamentoResolvido.info?.premiacao) premiacao = pagamentoResolvido.info.premiacao;
}

// A premiação fica bruta aqui.
// O formato bonito é aplicado dentro de VIP_buildRegistroEmbed,
// evitando duplicar "Tipo" no campo de premiação.

      const guild = i.guild;
      const menuCh = await guild.channels.fetch(VIP_MENU_CHANNEL_ID).catch(() => null);
      if (!menuCh || !menuCh.isTextBased()) {
        await safeReply(i, { content: "⚠️ Canal de menu/registros indisponível.", ephemeral: true });
        return true;
      }

      const cityName = CITIES[cityKey].label;
      const cityRoleMention = CITIES[cityKey] ? `<@&${CITIES[cityKey].roleId}>` : '';

     const embed = VIP_buildRegistroEmbed(
  guild,
  i.user,
  {
    evento,
    data,
    ganhadorId,
    ganhadorNome,
    org,
    premiacao,
    tipo,
    pagamentoLink,
  },
  cityName
);
      const msg = await menuCh.send({
        content: `Novo registro de VIP para a ${cityName}! ${cityRoleMention}`,
        embeds: [embed],
        components: VIP_buildRegistroButtons(false, false, false) });

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

      await VIP_sendAuditLog(client, guild, {
  title: "📝 Registro VIP criado",
  color: REG_COLOR,
  action: "CRIOU_REGISTRO_VIP",
  interaction: i,
  actor: i.user,
  channel: menuCh,
  message: msg,
  messageUrl: msg.url,
  during: "Usuário enviou o modal preenchido e o sistema criou uma nova mensagem de registro VIP com botões de ação.",
  before: "Antes: o registro ainda não existia no canal.",
  after: VIP_extractEmbedFields(embed),
extra: [
  `Cidade: **${cityName}** (\`${cityKey}\`)`,
  `Cargo da cidade: ${cityRoleMention || "—"}`,
  `Evento: \`${evento}\``,
  `Data do evento: \`${data}\``,
  `ID ganhador: \`${ganhadorId}\``,
  `Nome ganhador: \`${ganhadorNome || "Não identificado"}\``,
  `Organização: \`${org}\``,
  `Tipo identificado: \`${tipo}\``,
  `Premiação final: ${VIP_cut(premiacao || "—", 500)}`,
  `Link analisado: ${pagamentoLink || "—"}`,
  pagamentoResolvido?.ok
    ? `Mensagem fonte: ${pagamentoResolvido.message?.url || pagamentoLink}`
    : pagamentoResolvido?.erro
    ? `Erro ao analisar link: \`${pagamentoResolvido.erro}\``
    : "Sem link de pagamento vinculado.",
  `Link do registro criado: ${msg.url}`,
].join("\n"),
});

     dashEmit("vip:criado", {
  by: i.user.id,
  source: "vipcriado",
  sourceLabel: "VIP Líderes (Criado)",
  __at: Date.now(),
});


      await safeReply(i, { content: `✅ Registro criado com sucesso! ${msg.url}`, ephemeral: true });
      return true;
    }

    // ── 4) BOTÕES DO REGISTRO: solicitado / pago / reprovar ───────
    if (isVipRegistroButtons) {
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

      await safeDefer(i, { update: true });

      if (i.customId === VIP_BTN_SOLICITADO_ID) {
        if (!canAction(i.member)) {
          await safeReply(i, { content: "🚫 Você não tem permissão para usar esse botão.", ephemeral: true });
          return true;
        }
      }

      if (i.customId === VIP_BTN_PAGO_ID) {
        if (!canMarkPaid(i.member)) {
          await safeReply(i, { content: "🚫 Você não tem permissão para marcar como pago.", ephemeral: true });
          return true;
        }
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
        await VIP_corrigirRegistroVipMensagem(msg, client).catch(() => null);

        const embedCorrigido = EmbedBuilder.from(msg.embeds[0]);
        const fieldsCorrigidos = embedCorrigido.data.fields ?? [];

        const idx = fieldsCorrigidos.findIndex((f) => (f.name || "").startsWith("📝 Solicitações"));
        const linha = `• Marcado como **SOLICITADO** por <@${i.user.id}> em ${whenTxt}`;

        if (idx >= 0) {
          const atual = fieldsCorrigidos[idx]?.value || "—";
          const cur = atual === "—" ? "" : atual + "\n";
          fieldsCorrigidos[idx].value = (cur + linha).slice(0, 1024);
        } else {
          fieldsCorrigidos.push({ name: "📝 Solicitações", value: linha.slice(0, 1024), inline: false });
        }

        embedCorrigido.setFields(fieldsCorrigidos);

        await msg.edit({
          embeds: [embedCorrigido],
          components: VIP_buildRegistroButtons(false, false, false),
        });
        if (registranteId) {
          await VIP_sendDM_VIP(
            client,
            registranteId,
            `📨 Sua premiação **foi solicitada**!\n\n• Registro: ${msg.url}\n• Marcado por: <@${i.user.id}>\n\n⚠️ Se em até **24h** não cair, avise **no seu chat da empresa** (nunca em PV de alguém).`,
            guild
          );
        }

        await VIP_sendAuditLog(client, guild, {
  title: "📨 Registro marcado como solicitado",
  color: MENU_COLOR,
  action: "MARCOU_SOLICITADO",
  interaction: i,
  actor: i.user,
  channel: msg.channel,
  message: msg,
  messageUrl: msg.url,
  during: "Usuário clicou no botão 'Já foi solicitado', o sistema corrigiu/reanalisou o tipo da premiação e adicionou uma linha no campo de solicitações.",
  before: `Antes:\n${VIP_extractEmbedFields(msg.embeds?.[0])}`,
  after: `Depois:\n${VIP_extractEmbedFields(embedCorrigido)}`,
  extra: [
    `Registrante original: ${registranteId ? `<@${registranteId}> (\`${registranteId}\`)` : "—"}`,
    `Linha adicionada: ${linha}`,
    `Link do registro: ${msg.url}`,
  ].join("\n"),
});

        try {
          dashEmit("vip:solicitado", {
            by: i.user.id,
            source: "vipsolicitado",
            sourceLabel: "VIP Líderes (Solicitado)",
            __at: Date.now(),
          });
        } catch {}

        await safeReply(i, { content: "✅ Marcado como **solicitado**.", ephemeral: true });
        return true;
      }

      // PAGO
      if (i.customId === VIP_BTN_PAGO_ID) {
        await VIP_corrigirRegistroVipMensagem(msg, client).catch(() => null);

        const embedPagoCorrigido = EmbedBuilder.from(msg.embeds[0]);
        const fieldsPagoCorrigidos = embedPagoCorrigido.data.fields ?? [];

        const pagoIdx = fieldsPagoCorrigidos.findIndex((f) => (f.name || "").startsWith("💸 Pagamento"));

        if (pagoIdx >= 0 && (fields[pagoIdx]?.value || "—") !== "—") {
          await safeReply(i, { content: "⚠️ Esse registro já está marcado como pago.", ephemeral: true });
          return true;
        }

        const reprovadoIdx = fieldsPagoCorrigidos.findIndex((f) => (f.name || "").startsWith("⛔ Reprovação"));
        if (reprovadoIdx >= 0 && /REPROVADO/i.test(fieldsPagoCorrigidos[reprovadoIdx]?.value || "")) {
          await safeReply(i, { content: "⚠️ Esse registro está reprovado.", ephemeral: true });
          return true;
        }

        const linha = `• **PAGO** por <@${i.user.id}> em ${whenTxt}`;

        if (pagoIdx >= 0) fieldsPagoCorrigidos[pagoIdx].value = linha.slice(0, 1024);
        else fieldsPagoCorrigidos.push({ name: "💸 Pagamento", value: linha.slice(0, 1024), inline: false });

        embedPagoCorrigido.setFields(fieldsPagoCorrigidos);

        await msg.edit({
          embeds: [embedPagoCorrigido],
          components: VIP_buildRegistroButtons(true, true, false),
        });

        if (registranteId) {
          const ganhadorField = fields.find((f) => (f.name || "").includes("ID do ganhador"));
          const ganhadorId = ganhadorField ? ganhadorField.value.match(/`(\d+)`/)?.[1] ?? null : null;

          await VIP_sendDM_VIP(
            client,
            registranteId,
            `💸 Sua premiação **foi paga**!\n\n• Registro: ${msg.url}\n• Marcado por: <@${i.user.id}>\n• ID do beneficiado: ${ganhadorId ? `\`${ganhadorId}\`` : "—"}\n\nQualquer coisa, fale **no seu chat da empresa**!`,
            guild
          );
        }

        await VIP_sendAuditLog(client, guild, {
  title: "💸 Registro marcado como pago",
  color: REG_COLOR,
  action: "MARCOU_PAGO",
  interaction: i,
  actor: i.user,
  channel: msg.channel,
  message: msg,
  messageUrl: msg.url,
  during: "Usuário clicou no botão 'Já foi pago', o sistema atualizou o campo de pagamento e desabilitou os botões.",
  before: `Antes:\n${VIP_extractEmbedFields(msg.embeds?.[0])}`,
  after: `Depois:\n${VIP_extractEmbedFields(embed)}`,
  extra: [
    `Registrante original: ${registranteId ? `<@${registranteId}> (\`${registranteId}\`)` : "—"}`,
    `Linha adicionada: ${linha}`,
    `Link do registro: ${msg.url}`,
  ].join("\n"),
});

        try {
          dashEmit("vip:pago", {
            by: i.user.id,
            source: "vippago",
            sourceLabel: "VIP Líderes",
            __at: Date.now(),
          });
        } catch {}

        await safeReply(i, { content: "✅ Marcado como **pago**. Botões desabilitados.", ephemeral: true });
        return true;
      }
    }

    return true;
  } catch (err) {
    if (!isUnknownInteractionError(err)) console.error("[VIP] erro:", err);
    return true;
  }
}

export async function vipEventoHandleMessage(message, client) {
  return false;
}
