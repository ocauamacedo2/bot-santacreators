// ./events/application/events/vipEvento.js
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID, createHash } from "node:crypto";
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

import {
  moveVipMessage,
  vipCurrentId,
  vipOriginalTime,
  vipCurrentUrl,
} from '../utils/vipMessageMoves.js';
import { getMemberOrgTicketContext } from "./orgTicketAccessSync.js";

import {
  validatePrizeInput,
  normalizePrizeAliases,
} from '../utils/prizeValidation.js';
// ── CONFIG DE CANAIS ─────────────────────────────────────────────
import {
  isOfficialSantaCreatorsTeamMember,
} from "./hierarquiaDivisoes.js";

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

const VIP_LIDER_CITY_KEYS = ["nobre", "santa", "maresia", "grande"];

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
const VIP_CLIENTS_COM_PROTECAO_DE_EDICAO = new WeakSet();
const VIP_CORRECOES_EM_ANDAMENTO = new Set();
const VIP_PRESERVAR_PREMIACAO_ORIGINAL = true;

const VIP_OPEN_PREPARED_MODAL_PREFIX = "vip_open_prepared_modal:";
const VIP_PREPARED_MODALS = new Map();
const VIP_PREPARED_MODAL_TTL_MS = 5 * 60_000;

const VIP_SITE_DIRECTORY =
  path.join(DATA_DIR, 'vip-site-requests');

const VIP_SITE_IN_FLIGHT =
  new Map();

const VIP_SITE_ACTOR_LOCKS =
  new Map();

const VIP_SITE_UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

const VIP_siteFail = (status, message) =>
  Object.assign(
    new Error(message),
    { status }
  );

async function VIP_prepareModal(i, modal, onOpened = null) {
  const key = i.id;
  const entry = {
    userId: i.user.id,
    guildId: i.guildId,
    modal,
    onOpened,
    expiresAt: Date.now() + VIP_PREPARED_MODAL_TTL_MS,
  };

  VIP_PREPARED_MODALS.set(key, entry);

  const timer = setTimeout(() => {
    if (VIP_PREPARED_MODALS.get(key) === entry) {
      VIP_PREPARED_MODALS.delete(key);
    }
  }, VIP_PREPARED_MODAL_TTL_MS);

  timer.unref?.();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${VIP_OPEN_PREPARED_MODAL_PREFIX}${key}`)
      .setLabel("Abrir formulário")
      .setEmoji("📝")
      .setStyle(ButtonStyle.Primary)
  );

  try {
    await i.editReply({
      content: "✅ Validação concluída. Clique abaixo para abrir o formulário.",
      components: [row],
    });
  } catch (error) {
    VIP_PREPARED_MODALS.delete(key);
    clearTimeout(timer);
    throw error;
  }
}

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

async function VIP_getLeaderRequestContext(
  member,
  options = {}
) {
  try {
    if (options.freshMember !== true) {
      member = await member.guild.members.fetch({
        user: member.id,
        force: true,
      });
    }
  } catch (error) {
    console.error(
      '[VIP CIDADE] Falha ao conferir cargos atuais:',
      error
    );

    return {
      strict: true,
      ok: false,
      source: 'error',
      cityKeys: [],
      orgName: null,
      orgMatch: null,
      message:
        '⚠️ Não consegui conferir seus cargos atuais. Tente novamente.',
    };
  }

  const isLeader =
    member.roles.cache.has(IDS.LIDERES);

  const isStaff =
    hasAnyRole(
      member,
      REGISTER_ALLOWED.filter(
        id => id !== IDS.LIDERES
      )
    ) ||
    REGISTER_ALLOWED_USERS.includes(member.id);

  if (!isLeader || isStaff) {
    return {
      strict: false,
      ok: true,
      source: 'normal',
      cityKeys: Object.keys(CITIES),
      orgName: null,
      orgMatch: null,
    };
  }

  let orgContext;

  try {
    orgContext = await getMemberOrgTicketContext(
      member,
      {
        freshMember: true,
      }
    );
  } catch (error) {
    console.error('[VIP] Falha ao validar organização/ticket do líder:', error);

    return {
      strict: true,
      ok: false,
      source: 'error',
      cityKeys: [],
      orgName: null,
      orgMatch: null,
      message: '⚠️ Não consegui validar sua organização agora. Tente novamente em alguns segundos.',
    };
  }

  const orgMatches = Array.isArray(orgContext?.matches) ? orgContext.matches : [];

  const missingTagTickets = Array.isArray(orgContext?.missingTagTickets)
    ? orgContext.missingTagTickets
    : [];

  if (missingTagTickets.length > 0) {
    const orgNames = missingTagTickets
      .map(ticket => `**${ticket.orgName || ticket.channelName}**`)
      .join(', ');

    return {
      strict: true,
      ok: false,
      source: 'missing_org_tag',
      cityKeys: [],
      orgName: null,
      orgMatch: null,
      message:
        '🚫 **Solicitação de VIP bloqueada.**\n' +
        `Você possui ticket de organização aberto (${orgNames}), mas não está usando a **tag/cargo correspondente à própria organização**.\n` +
        'Peça para corrigirem sua tag antes de solicitar o VIP.',
    };
  }

  if (orgMatches.length > 1) {
    return {
      strict: true,
      ok: false,
      source: 'multiple_orgs',
      cityKeys: [],
      orgName: null,
      orgMatch: null,
      message:
        '🚫 **Solicitação de VIP bloqueada.**\n' +
        'Foram encontradas **mais de uma tag de organização com ticket aberto** no seu usuário.\n' +
        'Por segurança, deixe apenas a tag correta da sua organização antes de solicitar o VIP.',
    };
  }

  if (orgMatches.length === 1) {
    const orgMatch = orgMatches[0];

    const cityKeys =
      VIP_LIDER_CITY_KEYS.filter(key =>
        member.roles.cache.has(
          CITIES[key].roleId
        )
      );

    if (cityKeys.length !== 1) {
      return {
        strict: true,
        ok: false,
        source: 'city_role_conflict',
        cityKeys: [],
        orgName: orgMatch.orgName,
        orgMatch,
        message:
          cityKeys.length === 0
            ? 'Nenhum cargo de cidade autorizado foi encontrado. Peça à equipe para corrigir seu cargo de cidade e consulte novamente.'
            : 'Há mais de uma cidade autorizada no seu usuário: ' +
              cityKeys.map(
                key => CITIES[key].label
              ).join(', ') +
              '. Peça à equipe para manter somente a cidade correta.',
      };
    }

    return {
      strict: true,
      ok: true,
      source: 'org_ticket',
      cityKeys,
      orgName: orgMatch.orgName,
      orgMatch,
    };
  }

  const cityKeys = VIP_LIDER_CITY_KEYS.filter(cityKey =>
    member.roles.cache.has(CITIES[cityKey].roleId)
  );

  if (cityKeys.length !== 1) {
    return {
      strict: true,
      ok: false,
      source: 'missing_requirement',
      cityKeys: [],
      orgName: null,
      orgMatch: null,
      message:
        '🚫 **Solicitação de VIP bloqueada.**\n' +
        'Seu usuário precisa ter exatamente um cargo de cidade autorizado. ' +
        'Nenhuma cidade ou mais de uma cidade foi encontrada.\n' +
        VIP_LIDER_CITY_KEYS.map(
          cityKey =>
            `<@&${CITIES[cityKey].roleId}>`
        ).join(' • '),
    };
  }

  return {
    strict: true,
    ok: true,
    source: 'city_role',
    cityKeys,
    orgName: null,
    orgMatch: null,
  };
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
    if (!fs.existsSync(CRONO_FILE)) {
      return null;
    }

    const crono = JSON.parse(
      fs.readFileSync(CRONO_FILE, "utf8")
    );

    const todayKey =
      getTodayKey();

    const blocks = [
      crono.schedule?.[todayKey],
      crono.madrugada?.[todayKey],
    ].flatMap(value =>
      Array.isArray(value)
        ? value
        : value
          ? [value]
          : []
    );

    const weekday = [
      'dom',
      'seg',
      'ter',
      'qua',
      'qui',
      'sex',
      'sab',
    ].indexOf(todayKey);

    if (Array.isArray(crono.events)) {
      blocks.push(
        ...crono.events.filter(event =>
          Number(event.weekday) === weekday
        )
      );
    }

    return blocks.find(event =>
      event &&
      event.active
    ) || null;
  } catch (e) {
    console.error(
      "[vipEvento] Erro ao ler cronograma:",
      e
    );

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

function VIP_buildModal(eventData = null, defaults = {}) {
  const orgInput = new TextInputBuilder()
    .setCustomId("vip_org_nome")
    .setLabel("Nome da organização")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Ex: Bellagio")
    .setRequired(true);

  if (defaults?.orgName) {
    orgInput.setValue(String(defaults.orgName).slice(0, 100));
  }

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
      new ActionRowBuilder().addComponents(orgInput),
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

function VIP_parseGanhadorFlex(
  input,
  orgFallback = "Não identificado"
) {
  const raw =
    String(input || "").trim();

  const tokenId = value => {
    const text = String(value || "")
      .replace(/`/g, "")
      .trim();

    return (
      text.match(
        /^(?:id\s*:?\s*)?(\d{1,25})$/i
      )?.[1] ||
      text.match(
        /^<@!?(\d{1,25})>$/
      )?.[1] ||
      ""
    );
  };

  if (!raw) {
    return {
      nome: orgFallback || "Não identificado",
      id: "",
    };
  }

  const parts = raw
    .split(/[|\/\\]/g)
    .map(part => part.trim())
    .filter(Boolean);

  if (parts.length === 1) {
    return {
      id: tokenId(raw),
      nome:
        tokenId(raw)
          ? "Não identificado"
          : raw,
    };
  }

  if (parts.length !== 2) {
    return {
      id: "",
      nome: orgFallback || "Não identificado",
    };
  }

  const idA =
    tokenId(parts[0]);

  const idB =
    tokenId(parts[1]);

  if (Boolean(idA) === Boolean(idB)) {
    return {
      id: "",
      nome: orgFallback || "Não identificado",
    };
  }

  return idA
    ? {
        id: idA,
        nome: parts[1],
      }
    : {
        id: idB,
        nome: parts[0],
      };
}

function VIP_formatarCampoIdGanhador(ganhadorId) {
  const id =
    String(ganhadorId || "").trim();

  if (!id) {
    return "`Não informado`";
  }

  if (/^\d{17,20}$/.test(id)) {
    return `<@${id}> (\`${id}\`)`;
  }

  if (/^\d{1,25}$/.test(id)) {
    return `\`${id}\``;
  }

  return "`Não informado`";
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
      {
        name: "🏢 Organização",
        value: `\`${
          String(payload.org || '')
            .normalize('NFKC')
            .replace(/\p{Cf}/gu, '')
            .replace(/[^\p{L}\p{N}\p{M}\s]/gu, ' ')
            .replace(/\s+/g, ' ')
            .trim() || 'Não informada'
        }\``,
        inline: true,
      },
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
async function VIP_deleteOldMenus(
  channel,
  client,
  keepId = null
) {
  let before;

  while (true) {
    const messages =
      await channel.messages.fetch({
        limit: 100,
        ...(before ? { before } : {}),
      });

    if (!messages.size) {
      return;
    }

    const oldest = [
      ...messages.values(),
    ].reduce(
      (previous, message) => {
        if (
          !previous ||
          BigInt(message.id) <
            BigInt(previous.id)
        ) {
          return message;
        }

        return previous;
      },
      null
    );

    for (
      const message of
      messages.values()
    ) {
      if (
        message.author.id !==
        client.user.id
      ) {
        continue;
      }

      const isMenu =
        message.components?.some(
          row =>
            row.components?.some(
              component =>
                component.customId ===
                VIP_MENU_BUTTON_ID
            )
        );

      if (
        isMenu &&
        (
          !keepId ||
          BigInt(message.id) < BigInt(keepId)
        )
      ) {
        await message.delete();
      }
    }

    if (
      messages.size < 100 ||
      !oldest
    ) {
      return;
    }

    if (oldest.id === before) {
      throw new Error(
        'Não foi possível avançar na limpeza dos menus VIP.'
      );
    }

    before = oldest.id;
  }
}

const VIP_MENU_CREATIONS = new WeakMap();

async function VIP_ensureFreshMenu(
  guild,
  client,
  force = false
) {
  if (
    !force &&
    VIP_REORDER_LOCKS.has(
      VIP_MENU_CHANNEL_ID
    )
  ) {
    return null;
  }

  const ch =
    await guild.channels.fetch(
      VIP_MENU_CHANNEL_ID
    );

  if (
    !ch?.isTextBased() ||
    ch.guildId !== guild.id
  ) {
    return null;
  }

  let jobs =
    VIP_MENU_CREATIONS.get(client);

  if (!jobs) {
    jobs = new Map();

    VIP_MENU_CREATIONS.set(
      client,
      jobs
    );
  }

  if (jobs.has(ch.id)) {
    return jobs.get(ch.id);
  }

  const operation = Promise.resolve()
    .then(async () => {
      const menu = await ch.send({
        embeds: [
          VIP_buildMenuEmbed(guild),
        ],

        components:
          VIP_buildMenuComponents(),

        allowedMentions: {
          parse: [],
        },
      });

      void VIP_deleteOldMenus(
        ch,
        client,
        menu.id
      ).catch(error => {
        console.error(
          '[VIP MENU] Menu criado; falha ao limpar menus anteriores:',
          error
        );
      });

      return menu;
    })
    .finally(() => {
      if (
        jobs.get(ch.id) === operation
      ) {
        jobs.delete(ch.id);
      }
    });

  jobs.set(
    ch.id,
    operation
  );

  return operation;
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
  const t = normalizePrizeAliases(texto)
    .normalize("NFKC")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s$.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const palavras = t.split(" ").filter(Boolean);
  const textoColado = t.replace(/\s+/g, "");

  // ✅ Se ficou vazio depois da limpeza, NÃO pode virar Dinheiro.
  if (!t) return "Não identificado";

  if (
    /\b(?:battle\s*pass|better\s*paste)\b/.test(
      t
    )
  ) {
    return 'Pass';
  }

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
    /\bvip\s*platinum\b/.test(t) ||
    /\bvip\s*platinium\b/.test(t) ||
    /\bvip\s*platina\b/.test(t) ||
    /\bplatinum\b/.test(t) ||
    /\bplatinium\b/.test(t) ||
    /\bplatnum\b/.test(t) ||
    /\bplatinun\b/.test(t) ||
    /\bplatibnum\b/.test(t) ||
    /\bplatina\b/.test(t) ||
    /\bplatino\b/.test(t) ||
    /\bplatnao\b/.test(t) ||
    /\bplatinu\b/.test(t) ||
    /\bplatin\b/.test(t) ||
    textoColado.includes("vipplatinum") ||
    textoColado.includes("vipplatinium") ||
    textoColado.includes("vipplatina")
  ) return "VIP Platinum";

  if (
    /\bvip\s*black\b/.test(t) ||
    /\bblack\b/.test(t) ||
    /\bblak\b/.test(t) ||
    /\bbleck\b/.test(t) ||
    /\bpreto\b/.test(t) ||
    textoColado.includes("vipblack") ||
    textoColado.includes("vipblak") ||
    textoColado.includes("vipbleck")
  ) return "VIP Black";
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
    /\bvip\s*lancamento\b/.test(t) ||
    /\bvip\s*lançamento\b/.test(t) ||
    /\blancamento\b/.test(t) ||
    /\blançamento\b/.test(t) ||
    /\blancamnto\b/.test(t) ||
    /\blancameto\b/.test(t) ||
    /\blancamento\b/.test(t) ||
    /\blanca\b/.test(t) ||
    textoColado.includes("viplancamento") ||
    textoColado.includes("viplançamento") ||
    textoColado.includes("viplancamnto") ||
    textoColado.includes("viplancameto")
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

  return "Não identificado";
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

  if (VIP_PRESERVAR_PREMIACAO_ORIGINAL) {
    const original = msg.embeds[0];
    const descricao = String(original.description || original.data?.description || "");
    const tipo = descricao.match(/Tipo Identificado:\*\*\s*`([^`]+)`/i)?.[1];

    return {
      ok: true,
      corrigido: false,
      tipoFinal: tipo || "Não identificado",
      premiacaoFinal: VIP_getFieldValue(original, "🎁 Premiação"),
      vinculado: false,
      motivo: "Registro original preservado; sem reescrita automática.",
    };
  }

  const embed = EmbedBuilder.from(msg.embeds[0]);
  const estadoAntes = JSON.stringify({
    description: embed.data.description || "",
    fields: embed.data.fields || [],
  });

  const analiseFinal = VIP_reanalisarEmbedVip(embed);

  const fields = VIP_getFields(embed);
  const premiacaoField = fields.find((f) => String(f.name || "").startsWith("🎁 Premiação"));
  const premiacaoTexto = String(premiacaoField?.value || "");

  const pagamentoResolvido = await VIP_resolverPagamentoLink(client, premiacaoTexto).catch(() => null);

  if (pagamentoResolvido?.ok) {
    const premiacaoFonte =
      pagamentoResolvido.info?.premiacao ||
      premiacaoTexto;

    const premiacaoPrincipalFonte =
      VIP_pegarTextoPrincipalPremiacao(premiacaoFonte);

    const tipoFinal = VIP_normalizarTipoPremiacao(
      premiacaoPrincipalFonte ||
      premiacaoFonte
    );

    const novosFields = VIP_getFields(embed).map((f) => {
      if (String(f.name || "").startsWith("🎁 Premiação")) {
        return {
          ...f,
          value: VIP_formatarPremiacaoInteligente(
            premiacaoFonte,
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
    analiseFinal.premiacaoFinal = premiacaoFonte;
  }

  const estadoDepois = JSON.stringify({
    description: embed.data.description || "",
    fields: embed.data.fields || [],
  });

  const precisaCorrigir = estadoAntes !== estadoDepois;

  if (precisaCorrigir) {
    await msg.edit({
      embeds: [embed],
      components: msg.components,
    }).catch(() => null);
  }

  return {
    ok: true,
    corrigido: precisaCorrigir,
    tipoFinal: analiseFinal.tipoFinal,
    vinculado: Boolean(pagamentoResolvido?.ok),
  };
}

function VIP_instalarProtecaoContraEdicaoIncorreta(client) {
  if (!client || VIP_CLIENTS_COM_PROTECAO_DE_EDICAO.has(client)) return;

  VIP_CLIENTS_COM_PROTECAO_DE_EDICAO.add(client);

  client.on("messageUpdate", async (_mensagemAntiga, mensagemNova) => {
    try {
      if (!mensagemNova || mensagemNova.channelId !== VIP_MENU_CHANNEL_ID) return;

      const msg = mensagemNova.partial
        ? await mensagemNova.fetch().catch(() => null)
        : mensagemNova;

      if (!msg?.embeds?.[0]) return;

      const titulo = String(msg.embeds[0]?.title || "");
      if (titulo !== "💎 Registro de VIP por Evento") return;
      if (VIP_CORRECOES_EM_ANDAMENTO.has(msg.id)) return;

      VIP_CORRECOES_EM_ANDAMENTO.add(msg.id);

      await VIP_corrigirRegistroVipMensagem(msg, client).catch((erro) => {
        console.error("[vipEvento] Erro ao proteger tipo da premiação após edição:", erro);
      });

      setTimeout(() => VIP_CORRECOES_EM_ANDAMENTO.delete(msg.id), 2_000);
    } catch (erro) {
      if (mensagemNova?.id) VIP_CORRECOES_EM_ANDAMENTO.delete(mensagemNova.id);
      console.error("[vipEvento] Erro na proteção de edição do registro:", erro);
    }
  });
}

async function VIP_corrigirRegistrosRecentesAoIniciar(client) {
  const canal = await client.channels.fetch(VIP_MENU_CHANNEL_ID).catch(() => null);
  if (!canal?.isTextBased()) return;

  const mensagens = await canal.messages.fetch({ limit: 100 }).catch(() => null);
  if (!mensagens) return;

  for (const msg of mensagens.values()) {
    if (!msg?.embeds?.[0]) continue;
    if (String(msg.embeds[0]?.title || "") !== "💎 Registro de VIP por Evento") continue;

    await VIP_corrigirRegistroVipMensagem(msg, client).catch((erro) => {
      console.error(`[vipEvento] Erro ao revisar registro ${msg.id} na inicialização:`, erro);
    });
  }
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
const VIP_REORDER_LOCKS = new Set();
async function VIP_reordenarRegistros(
  channel,
  filtro,
  client
) {
  if (
    VIP_REORDER_LOCKS.has(channel.id)
  ) {
    throw new Error(
      'Já existe uma reorganização neste canal.'
    );
  }

  VIP_REORDER_LOCKS.add(channel.id);

  let movidos = 0;
  let resultado;

  try {
    resultado =
      await VIP_moverRegistrosPorFiltro(
        channel,
        filtro,
        client
      );

    const members = new Map();

    const registros =
      resultado.registros.sort(
        (a, b) =>
          vipOriginalTime(a) -
          vipOriginalTime(b)
      );

    for (const message of registros) {
      const current =
        await message.channel.messages.fetch({
          message: message.id,
          force: true,
        });

      const embed =
        EmbedBuilder.from(
          current.embeds[0]
        );

      const solicitado =
        VIP_hasSolicitado(embed);

      const stillMatches =
        !VIP_isPago(embed) &&
        !VIP_isReprovado(embed) &&
        (
          filtro === 'solicitados'
            ? solicitado
            : !solicitado
        );

      if (!stillMatches) {
        continue;
      }

      const corrected =
        await corrigirCidadeVipPorCargo(
          current,
          members
        );

      await moveVipMessage(corrected);

      movidos++;
    }

    await VIP_ensureFreshMenu(
      channel.guild,
      client,
      true
    );
  } catch (error) {
    error.message =
      `${movidos} registro(s) movido(s). ` +
      error.message;

    throw error;
  } finally {
    VIP_REORDER_LOCKS.delete(
      channel.id
    );
  }

  /*
   * A movimentação terminou.
   * A reconciliação continua sem manter
   * os botões do canal bloqueados.
   */
  try {
    const {
      reconciliarVinculosVipPagamento,
    } = await import(
      './pagamentosocial.js'
    );

    await reconciliarVinculosVipPagamento(
      client
    );
  } catch (error) {
    console.error(
      '[VIP RECONCILIACAO] Varredura interrompida após movimentação:',
      error
    );
  }

  return {
    movidos,
    examinadas: resultado.examinadas,
  };
}

async function VIP_moverRegistrosPorFiltro(channel, filtro, client) {
  if (!['solicitados', 'naoclicados'].includes(filtro)) {
    throw new Error('Filtro VIP inválido.');
  }

  const encontrados = [];

  let before;
  let examinadas = 0;
  let completo = false;

  while (true) {
    const lote = await channel.messages.fetch({
      limit: 100,
      ...(before ? { before } : {}),
    });

    if (!lote.size) {
      completo = true;
      break;
    }

    examinadas += lote.size;

    for (const msg of lote.values()) {
      if (msg.author?.id !== client.user.id) {
        continue;
      }

      const raw = msg.embeds?.[0];

      if (!raw) {
        continue;
      }

      if (
        !String(raw.title || '').includes(
          'Registro de VIP por Evento'
        )
      ) {
        continue;
      }

      if (!VIP_messageHasVipButtons(msg)) {
        continue;
      }

      const embed = EmbedBuilder.from(raw);

      const pago = VIP_isPago(embed);
      const reprovado = VIP_isReprovado(embed);
      const solicitado = VIP_hasSolicitado(embed);

      const entra = filtro === 'solicitados'
        ? solicitado && !pago && !reprovado
        : !solicitado && !pago && !reprovado;

      if (entra) {
        encontrados.push(msg);
      }
    }

    const oldest = [...lote.values()].reduce(
      (previous, message) => {
        if (
          !previous ||
          BigInt(message.id) < BigInt(previous.id)
        ) {
          return message;
        }

        return previous;
      },
      null
    );

    if (!oldest || oldest.id === before) {
      throw new Error(
        'Não foi possível avançar na leitura do canal VIP.'
      );
    }

    before = oldest.id;

    if (lote.size < 100) {
      completo = true;
      break;
    }
  }

  encontrados.sort(
    (a, b) =>
      b.createdTimestamp - a.createdTimestamp
  );

  return {
    registros: encontrados,
    examinadas,
    completo,
  };
}

// =====================================================
// ✅ EXPORTS (o que o index vai chamar)
// =====================================================

function VIP_siteDate(value) {
  const match = String(value || '')
    .trim()
    .match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (!match) {
    throw VIP_siteFail(
      400,
      'Informe a data no formato DD/MM/AAAA.'
    );
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);

  const date = new Date(
    Date.UTC(year, month - 1, day)
  );

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw VIP_siteFail(
      400,
      'A data do evento não existe no calendário.'
    );
  }

  return [
    String(day).padStart(2, '0'),
    String(month).padStart(2, '0'),
    year,
  ].join('/');
}

async function VIP_siteActor(guild, actorId) {
  actorId = String(actorId || '').trim();

  if (!/^\d{17,20}$/.test(actorId)) {
    throw VIP_siteFail(
      400,
      'Usuário inválido para solicitar VIP.'
    );
  }

  const member = await guild.members.fetch({
    user: String(actorId),
    force: true,
  }).catch(error => {
    console.warn(
      '[VIP SITE] Consulta do solicitante:',
      {
        code: error.code || null,
        status: error.status || null,
      }
    );

    throw VIP_siteFail(
      Number(error.code) === 10007 ? 403 : 503,

      Number(error.code) === 10007
        ? 'Seu usuário não está mais no servidor.'
        : 'O Discord não respondeu à consulta dos seus cargos. Tente novamente.'
    );
  });

  if (
    member?.guild?.id !== guild.id ||
    member.user?.bot ||
    !member.roles.cache.has(IDS.LIDERES) ||
    !canRegister(member)
  ) {
    throw VIP_siteFail(
      403,
      'O formulário do site é exclusivo dos líderes autorizados.'
    );
  }

  const context = await VIP_getLeaderRequestContext(
    member,
    {
      freshMember: true,
    }
  );

  if (
    !context.strict ||
    !context.ok
  ) {
    throw VIP_siteFail(
      context.source === 'error' ? 503 : 403,
      context.message ||
      'Não foi possível validar sua organização ou cidade.'
    );
  }

  return {
    member,
    context,
  };
}

export async function getVipEventoAdminSiteAccess({
  guild,
  member,
}) {
  const sameGuild =
    member?.guild?.id === guild.id;

  if (
    !sameGuild ||
    member.user?.bot
  ) {
    return {
      rights: {
        view: false,
      },
    };
  }

  const administrativeReader =
    member.id === IDS.EU ||
    member.roles.cache.some(role =>
      [
        IDS.OWNER,
        IDS.RESP_LIDER,
        IDS.RESP_INFLU,
        IDS.RESP_CREATORS,
      ].includes(role.id)
    );

  const teamReader =
    administrativeReader ||
    isOfficialSantaCreatorsTeamMember(member) ||
    canAction(member) ||
    canMarkPaid(member) ||
    canReprove(member);

  if (!teamReader) {
    return {
      rights: {
        view: false,
      },
    };
  }

  let channel;

  try {
    channel =
      await guild.channels.fetch(
        VIP_MENU_CHANNEL_ID
      );
  } catch (error) {
    console.warn(
      "[VIP SITE] Canal administrativo indisponível:",
      {
        guildId: guild.id,
        code: error.code || null,
        message: error.message,
      }
    );

    return {
      rights: {
        view: false,
      },

      unavailable: true,
    };
  }

  const available =
    channel?.guildId === guild.id &&
    Boolean(channel.messages);

  const allowed =
    available &&
    (
      administrativeReader ||
      channel.permissionsFor(member)?.has([
        "ViewChannel",
        "ReadMessageHistory",
      ]) === true
    );

  return {
    rights: {
      view: allowed,
    },

    unavailable:
      !available,
  };
}

function projectVipAdminSiteRecord(
  message,
  guild
) {
  const embed =
    message.embeds[0];

  const paid =
    VIP_isPago(embed);

  const rejected =
    VIP_isReprovado(embed);

  const requested =
    VIP_hasSolicitado(embed);

  const fields =
    VIP_getFields(embed);

  const hasStatusFields =
    fields.some(field =>
      String(field.name || "").startsWith(
        "💸 Pagamento"
      )
    );

  const status =
    paid && rejected
      ? "inconsistent"
      : rejected
        ? "rejected"
        : paid
          ? "approved"
          : requested
            ? "requested"
            : hasStatusFields
              ? "pending"
              : "unknown";

  const readable = value =>
    String(value || "")
      .replace(
        /<@&(\d{17,20})>/g,
        (_, id) =>
          guild.roles.cache.get(id)?.name ||
          id
      )
      .replace(
        /<@!?(\d{17,20})>/g,
        (_, id) =>
          guild.members.cache.get(id)?.displayName ||
          id
      )
      .replace(/[`*_]/g, "")
      .trim();

  const field = prefix =>
    readable(
      VIP_getFieldValueByNameStarts(
        fields,
        prefix
      )
    );

  const creatorMatch =
    String(embed.description || "").match(
      /Registrado por:\*{0,2}\s*<@!?(\d{17,20})>/i
    );

  return {
    messageId:
      message.id,

    creatorId:
      creatorMatch?.[1] || null,

    status,

    event:
      field("🏁 Nome do evento ganho"),

    eventDate:
      field("📅 Dia do evento"),

    organization:
      field("🏢 Organização"),

    city:
      field("🌆 Cidade"),

    winner:
      field("👤 Nome do ganhador"),

    winnerId:
      field("🆔 ID do ganhador"),

    prize:
      field("🎁 Premiação"),

    createdAt:
      message.createdTimestamp,

    url:
      message.url,

    presentation: {
      description:
        readable(embed.description),

      fields:
        fields.map(item => ({
          name:
            readable(item.name),

          value:
            readable(item.value),
        })),

      links: [
        {
          label:
            "Abrir registro no Discord",

          url:
            message.url,
        },
      ],
    },
  };
}

export async function getVipEventoAdminSiteSnapshot({
  guild,
  member,
  before,
}) {
  const access =
    await getVipEventoAdminSiteAccess({
      guild,
      member,
    });

  if (access.unavailable === true) {
    throw Object.assign(
      new Error(
        "O canal de registros VIP está indisponível."
      ),
      { status: 503 }
    );
  }

  if (access.rights.view !== true) {
    throw Object.assign(
      new Error(
        "Seu acesso atual não permite consultar os registros VIP."
      ),
      { status: 403 }
    );
  }

  const cursor =
    String(before || "").trim();

  if (
    cursor &&
    !/^\d{17,20}$/.test(cursor)
  ) {
    throw Object.assign(
      new Error(
        "Página de registros VIP inválida."
      ),
      { status: 400 }
    );
  }

  const channel =
    await guild.channels.fetch(
      VIP_MENU_CHANNEL_ID
    );

  if (
    channel?.guildId !== guild.id ||
    !channel.messages
  ) {
    throw Object.assign(
      new Error(
        "O canal VIP deste servidor está indisponível."
      ),
      { status: 503 }
    );
  }

  const page =
    await channel.messages.fetch({
      limit: 100,

      ...(cursor
        ? { before: cursor }
        : {}),
    });

  const records = [];

  for (const message of page.values()) {
    const embed =
      message.embeds[0];

    const recognizedTitle =
      /^(?:💎\s*)?Registro de VIP por Evento$/i.test(
        String(embed?.title || "").trim()
      );

    if (
      message.author?.bot !== true ||
      !recognizedTitle ||
      !VIP_messageHasVipButtons(message)
    ) {
      continue;
    }

    records.push(
      projectVipAdminSiteRecord(
        message,
        guild
      )
    );
  }

  return {
    records,

    recordsAvailable:
      true,

    rights: {
      view: true,
    },

    before:
      cursor || null,

    nextBefore:
      page.size === 100
        ? page.last()?.id || null
        : null,

    scannedMessages:
      page.size,

    source:
      "vip_evento_discord",

    generatedAt:
      Date.now(),
  };
}

export async function getVipEventoSiteForm({
  guild,
  actorId,
}) {
  const { context } =
    await VIP_siteActor(guild, actorId);

  const today =
    getTodayEventData();

  return {
    cities: context.cityKeys.map(key => ({
      key,
      label: CITIES[key].label,
      emoji: CITIES[key].emoji,
    })),

    orgLocked:
      context.source === 'org_ticket',

    defaults: {
      cityKey:
        context.cityKeys.length === 1
          ? context.cityKeys[0]
          : '',

      evento:
        typeof today?.eventName === 'string'
          ? today.eventName
          : '',

      data:
        getTodayDateFormatted(),

      ganhador:
        '',

      org:
        context.orgName || '',

      premiacao:
        typeof today?.prizes === 'string'
          ? today.prizes
          : '',
    },

    limits: {
      evento: 100,
      data: 10,
      ganhador: 200,
      org: 100,
      premiacao: 900,
    },

    generatedAt:
      Date.now(),
  };
}

async function VIP_sitePrepare(
  guild,
  actorId,
  payload
) {
  const { member, context } =
    await VIP_siteActor(guild, actorId);

  const cityKey =
    String(payload.cityKey || '');

  if (!context.cityKeys.includes(cityKey)) {
    throw VIP_siteFail(
      403,
      'A cidade não corresponde aos seus cargos atuais.'
    );
  }

  const values = {};

  for (const [key, limit] of Object.entries({
    evento: 100,
    data: 10,
    ganhador: 200,
    org: 100,
    premiacao: 900,
  })) {
    if (
      key === 'org' &&
      context.source === 'org_ticket'
    ) {
      values.org = context.orgName;
      continue;
    }

    if (typeof payload[key] !== 'string') {
      throw VIP_siteFail(
        400,
        'Preencha o campo ' + key + '.'
      );
    }

    const value =
      payload[key].trim();

    if (
      !value ||
      value.length > limit
    ) {
      throw VIP_siteFail(
        400,
        'O campo ' +
        key +
        ' deve ter entre 1 e ' +
        limit +
        ' caracteres.'
      );
    }

    values[key] = value;
  }

  values.data =
    VIP_siteDate(values.data);

  const winner = VIP_parseGanhadorFlex(
    values.ganhador,
    values.org
  );

  if (
    !/^\d{1,25}$/.test(
      String(winner.id || '')
    )
  ) {
    throw VIP_siteFail(
      400,
      'Informe Nome | ID ou ID | Nome, com um único ID válido.'
    );
  }

  const error = validatePrizeInput({
    prize:
      values.premiacao,

    type:
      VIP_normalizarTipoPremiacao(values.premiacao),

    classify:
      VIP_normalizarTipoPremiacao,
  });

  if (error) {
    throw VIP_siteFail(400, error);
  }

  return {
    member,
    cityKey,
    values,
  };
}

function VIP_siteRead(file) {
  if (!fs.existsSync(file)) {
    return null;
  }

  let record;

  try {
    record = JSON.parse(
      fs.readFileSync(file, 'utf8')
    );
  } catch {
    throw VIP_siteFail(
      503,
      'Não foi possível ler o comprovante do pedido. Nenhum novo registro foi criado.'
    );
  }

  if (
    !record ||
    !/^[a-f0-9]{64}$/.test(record.fingerprint || '') ||
    ![
      'pending',
      'created',
      'retryable',
    ].includes(record.phase)
  ) {
    throw VIP_siteFail(
      503,
      'O comprovante do pedido está inválido. Nenhum novo registro foi criado.'
    );
  }

  if (
    record.phase === 'created' &&
    (
      !/^\d{17,20}$/.test(
        String(record.messageId || '')
      ) ||
      !/^https:\/\/discord\.com\/channels\/\d{17,20}\/\d{17,20}\/\d{17,20}$/.test(
        String(record.url || '')
      )
    )
  ) {
    throw VIP_siteFail(
      503,
      'O comprovante não contém um link válido. Confira o canal VIP.'
    );
  }

  return record;
}

function VIP_siteSave(file, record) {
  const temporary =
    file + '.' + randomUUID() + '.tmp';

  try {
    fs.writeFileSync(
      temporary,
      JSON.stringify(record),
      {
        flag: 'wx',
        mode: 0o600,
      }
    );

    fs.renameSync(temporary, file);
  } finally {
    try {
      fs.unlinkSync(temporary);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn(
          '[VIP SITE] Limpeza de temporário:',
          error.code || error.name
        );
      }
    }
  }
}

function VIP_siteResult(
  record,
  reused = false
) {
  return {
    ok: true,

    messageId:
      vipCurrentId(
        VIP_MENU_CHANNEL_ID,
        record.messageId
      ),

    url:
      vipCurrentUrl(
        record.url
      ),

    reused,
  };
}

const VIP_SITE_RECOVERING = new Map();

async function VIP_siteRecover(
  client,
  guild,
  key,
  file,
  fingerprint
) {
  const running = VIP_SITE_RECOVERING.get(key);

  if (running) {
    if (running.fingerprint !== fingerprint) {
      throw VIP_siteFail(
        409,
        'A recuperação em andamento pertence a outro conteúdo.'
      );
    }

    return running.promise;
  }

  const promise = VIP_siteRecoverLive(
    client,
    guild,
    key,
    file,
    fingerprint
  ).finally(() => {
    if (
      VIP_SITE_RECOVERING.get(key)?.promise === promise
    ) {
      VIP_SITE_RECOVERING.delete(key);
    }
  });

  VIP_SITE_RECOVERING.set(key, {
    fingerprint,
    promise,
  });

  return promise;
}

async function VIP_siteRecoverLive(
  client,
  guild,
  key,
  file,
  fingerprint
) {
  const channel = await guild.channels.fetch(
    VIP_MENU_CHANNEL_ID
  );

  if (
    channel?.guildId !== guild.id ||
    !channel.isTextBased()
  ) {
    throw VIP_siteFail(
      503,
      'Não foi possível conferir o pedido no canal VIP.'
    );
  }

  let before;

  const startedAt = VIP_siteRead(file)?.at;

  const earliest =
    Number.isSafeInteger(startedAt) &&
    startedAt > 0
      ? startedAt - 120000
      : 0;

  for (let page = 0; page < 5; page++) {
    const messages = await channel.messages.fetch({
      limit: 100,
      ...(before ? { before } : {}),
    });

    const message = [
      ...messages.values(),
    ].find(item =>
      item.author.id === client.user.id &&
      item.embeds.some(embed =>
        String(embed.footer?.text || '')
          .endsWith('SITE:' + key)
      )
    );

    if (message) {
      const record = {
        phase: 'created',
        fingerprint,
        messageId: message.id,
        url: message.url,
        at: Date.now(),
      };

      VIP_siteSave(file, record);

      return VIP_siteResult(record, true);
    }

    if (
      messages.size < 100 ||
      (
        earliest > 0 &&
        [...messages.values()].some(message =>
          Number.isFinite(message.createdTimestamp) &&
          message.createdTimestamp < earliest
        )
      )
    ) {
      break;
    }

    const oldest = [...messages.values()].reduce(
      (previous, message) =>
        !previous ||
        BigInt(message.id) < BigInt(previous.id)
          ? message
          : previous,
      null
    );

    if (!oldest || oldest.id === before) {
      break;
    }

    before = oldest.id;
  }

  return null;
}

function VIP_siteInteraction(guild, prepared) {
  const fields = {
    vip_evt_nome:
      prepared.values.evento,

    vip_evt_data:
      prepared.values.data,

    vip_ganhador_id:
      prepared.values.ganhador,

    vip_org_nome:
      prepared.values.org,

    vip_premiacao:
      prepared.values.premiacao,
  };

  return {
    __scSiteVip: true,

    id:
      'site-vip-' + randomUUID(),

    customId:
      VIP_MODAL_ID + ':' + prepared.cityKey,

    guild,
    guildId: guild.id,

    member:
      prepared.member,

    user:
      prepared.member.user,

    client:
      null,

    channel:
      null,

    channelId:
      VIP_MENU_CHANNEL_ID,

    createdTimestamp:
      Date.now(),

    deferred:
      false,

    replied:
      false,

    fields: {
      getTextInputValue:
        key => fields[key] || '',
    },

    isButton:
      () => false,

    isStringSelectMenu:
      () => false,

    isModalSubmit:
      () => true,

    isMessageComponent:
      () => false,

    isRepliable:
      () => true,

    async deferReply() {
      this.deferred = true;
    },

    async reply(payload) {
      this.replied = true;
      this.lastReply = payload;
      return payload;
    },

    async editReply(payload) {
      this.lastReply = payload;
      return payload;
    },

    async followUp(payload) {
      this.lastReply = payload;
      return payload;
    },
  };
}

async function VIP_siteExecute({
  client,
  guild,
  prepared,
  file,
  fingerprint,
}) {
  const interaction =
    VIP_siteInteraction(guild, prepared);

  interaction.client =
    client;

  interaction.__scSiteVipRequestKey =
    path.basename(file, '.json');

  const record = {
    phase: 'pending',
    fingerprint,
    at: Date.now(),
  };

  fs.mkdirSync(
    VIP_SITE_DIRECTORY,
    {
      recursive: true,
      mode: 0o700,
    }
  );

  if (!fs.existsSync(file)) {
    fs.writeFileSync(
      file,
      JSON.stringify(record),
      {
        flag: 'wx',
        mode: 0o600,
      }
    );
  } else {
    VIP_siteSave(file, record);
  }

  return new Promise((resolve, reject) => {
    interaction.__scSiteVipCreatedHook = async message => {
      const saved = {
        ...record,
        phase: 'created',
        messageId: message.id,
        url: message.url,
        at: Date.now(),
      };

      let warning = '';

      try {
        VIP_siteSave(file, saved);
      } catch (error) {
        warning =
          'O registro foi criado, mas o comprovante local não pôde ser atualizado. Guarde o link e não repita o pedido.';

        console.error(
          '[VIP SITE] Falha ao salvar comprovante:',
          error
        );
      }

      resolve({
        ...VIP_siteResult(saved),
        warning,
      });
    };

    void vipEventoHandleInteraction(
      interaction,
      client
    ).then(() => {
      if (interaction.__scSiteVipCreated) {
        resolve(
          VIP_siteResult({
            ...record,
            ...interaction.__scSiteVipCreated,
            phase: 'created',
          })
        );

        return;
      }

      if (!interaction.__scSiteVipSending) {
        try {
          VIP_siteSave(
            file,
            {
              ...record,
              phase: 'retryable',
            }
          );
        } catch (error) {
          console.error(
            '[VIP SITE] Falha ao registrar tentativa:',
            error
          );
        }
      }

      const reply =
        interaction.lastReply;

      const message =
        typeof reply === 'string'
          ? reply
          : reply?.content;

      const status =
        interaction.__scSiteVipSending
          ? 409
          : Number(interaction.__scSiteVipError?.status) || 503;

      reject(
        VIP_siteFail(
          status,

          interaction.__scSiteVipSending
            ? 'O envio ao Discord não foi confirmado. Não crie outro pedido; consulte o registro antes de repetir.'
            : message ||
              interaction.__scSiteVipError?.message ||
              'Não foi possível criar o registro VIP. Tente novamente.'
        )
      );
    }).catch(reject);
  });
}

export async function submitVipEventoFromSite({
  client,
  guild,
  actorId,
  payload = {},
}) {
  const operationId = String(payload.operationId || '')
    .toLowerCase();

  if (!VIP_SITE_UUID.test(operationId)) {
    throw VIP_siteFail(
      400,
      'Identificador do pedido inválido. Abra novamente o formulário.'
    );
  }

  const prepared =
    await VIP_sitePrepare(
      guild,
      actorId,
      payload
    );

  const actorKey =
    guild.id + ':' + prepared.member.id;

  const key = createHash('sha256')
    .update(actorKey + ':' + operationId)
    .digest('hex');

  const file = path.join(
    VIP_SITE_DIRECTORY,
    key + '.json'
  );

  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify([
        prepared.cityKey,
        prepared.values,
      ])
    )
    .digest('hex');

  let stored =
    VIP_siteRead(file);

  if (
    stored &&
    stored.fingerprint !== fingerprint
  ) {
    throw VIP_siteFail(
      409,
      'Este identificador já pertence a um pedido com outros dados.'
    );
  }

  if (stored?.phase === 'created') {
    return VIP_siteResult(stored, true);
  }

  const running =
    VIP_SITE_IN_FLIGHT.get(key);

  if (running) {
    if (running.fingerprint !== fingerprint) {
      throw VIP_siteFail(
        409,
        'O pedido em andamento possui outros dados.'
      );
    }

    return running.promise;
  }

  const activeActorRequest =
    VIP_SITE_ACTOR_LOCKS.get(actorKey);

  if (
    activeActorRequest &&
    activeActorRequest !== key
  ) {
    throw VIP_siteFail(
      429,
      'Outro pedido seu ainda está sendo enviado. Aguarde a conclusão.'
    );
  }

  if (stored?.phase === 'pending') {
    const recovered =
      await VIP_siteRecover(
        client,
        guild,
        key,
        file,
        fingerprint
      );

    if (recovered) {
      return recovered;
    }

    stored =
      VIP_siteRead(file);

    if (stored?.phase === 'created') {
      return VIP_siteResult(stored, true);
    }
  }

  if (stored?.phase === 'pending') {
    throw VIP_siteFail(
      409,
      'Este pedido está em verificação após uma interrupção. Confira o canal VIP antes de criar outro.'
    );
  }

  if (VIP_SITE_ACTOR_LOCKS.has(actorKey)) {
    throw VIP_siteFail(
      429,
      'Você já possui um pedido sendo enviado. Aguarde.'
    );
  }

  VIP_SITE_ACTOR_LOCKS.set(
    actorKey,
    key
  );

  const promise = VIP_siteExecute({
    client,
    guild,
    prepared,
    file,
    fingerprint,
  }).finally(() => {
    VIP_SITE_IN_FLIGHT.delete(key);

    if (
      VIP_SITE_ACTOR_LOCKS.get(actorKey) === key
    ) {
      VIP_SITE_ACTOR_LOCKS.delete(actorKey);
    }
  });

  VIP_SITE_IN_FLIGHT.set(
    key,
    {
      fingerprint,
      promise,
    }
  );

  return promise;
}

function VIP_instalarRecuperacaoMenu(client) {
  if (
    client.__SC_VIP_MENU_RECOVERY__
  ) {
    return;
  }

  client.__SC_VIP_MENU_RECOVERY__ =
    true;

  let busy = false;
  let scheduled = null;

  const check = async () => {
    if (
      busy ||
      !client.isReady()
    ) {
      return;
    }

    busy = true;

    try {
      const channel =
        await client.channels.fetch(
          VIP_MENU_CHANNEL_ID
        );

      if (!channel?.isTextBased()) {
        return;
      }

      const messages =
        await channel.messages.fetch({
          limit: 100,
        });

      const exists = [
        ...messages.values(),
      ].some(message => {
        if (
          message.author?.id !==
          client.user.id
        ) {
          return false;
        }

        return message.components.some(
          row =>
            row.components.some(
              component =>
                component.customId ===
                  VIP_MENU_BUTTON_ID &&
                component.disabled !== true
            )
        );
      });

      if (!exists) {
        await VIP_ensureFreshMenu(
          channel.guild,
          client,
          true
        );

        console.log(
          '[VIP MENU] Menu ausente no fim do canal: recriado.'
        );
      }
    } catch (error) {
      console.error(
        '[VIP MENU] Falha ao verificar/restaurar o menu:',
        error
      );
    } finally {
      busy = false;
    }
  };

  const schedule = () => {
    clearTimeout(scheduled);

    scheduled = setTimeout(
      () => {
        void check();
      },
      2000
    );

    scheduled.unref?.();
  };

  client.on(
    'messageDelete',
    message => {
      if (
        message.channelId ===
        VIP_MENU_CHANNEL_ID
      ) {
        schedule();
      }
    }
  );

  client.on(
    'messageDeleteBulk',
    (messages, channel) => {
      if (
        channel?.id ===
        VIP_MENU_CHANNEL_ID
      ) {
        schedule();
      }
    }
  );

  const timer = setInterval(
    () => {
      void check();
    },
    5 * 60_000
  );

  timer.unref?.();

  void check();
}

export async function vipEventoOnReady(client) {
  VIP_instalarRecuperacaoMenu(client);

  if (!VIP_PRESERVAR_PREMIACAO_ORIGINAL) {
    VIP_instalarProtecaoContraEdicaoIncorreta(client);
    await VIP_corrigirRegistrosRecentesAoIniciar(client);
  }

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
    const isVipPreparedModalButton =
      i.isButton?.() &&
      i.customId?.startsWith(VIP_OPEN_PREPARED_MODAL_PREFIX);

    if (!isVipMenuButton && !isVipModalCriar && !isVipRegistroButtons && !isVipModalReprovar && !isVipCitySelect && !isVipPreparedModalButton) {
      return false;
    }

    if (VIP_hasHandled(i)) return true;

    if (
      VIP_REORDER_LOCKS.has(
        i.channelId
      ) &&
      (
        isVipRegistroButtons ||
        isVipModalReprovar
      )
    ) {
      await safeReply(i, {
        content:
          '⏳ Os registros estão sendo reorganizados. Aguarde a conclusão e use os botões na mensagem reposicionada.',
        ephemeral: true,
      });

      return true;
    }

    if (isVipPreparedModalButton) {
      if (!canRegister(i.member)) {
        await safeReply(i, {
          content: "🚫 Você não tem permissão para registrar.",
          ephemeral: true,
        });
        return true;
      }

      const key = i.customId.slice(VIP_OPEN_PREPARED_MODAL_PREFIX.length);
      const entry = VIP_PREPARED_MODALS.get(key);

      if (!entry || Date.now() >= entry.expiresAt) {
        if (entry) VIP_PREPARED_MODALS.delete(key);

        await safeReply(i, {
          content: "⌛ Este formulário expirou. Clique novamente em Abrir formulário no menu de VIP.",
          ephemeral: true,
        });
        return true;
      }

      if (entry.userId !== i.user.id || entry.guildId !== i.guildId) {
        await safeReply(i, {
          content: "🚫 Este formulário não pertence a você ou a este servidor.",
          ephemeral: true,
        });
        return true;
      }

      if (i.deferred || i.replied) {
        console.warn("[VIP] A abertura do modal chegou com a interação já respondida.", {
          interactionId: i.id,
          customId: i.customId,
          deferred: i.deferred,
          replied: i.replied,
        });

        await safeReply(i, {
          content: "⚠️ Não consegui abrir o formulário neste clique. Clique novamente no botão Abrir formulário.",
          ephemeral: true,
        });
        return true;
      }

      try {
        await i.showModal(entry.modal);
      } catch (error) {
        console.error("[VIP] Falha ao abrir formulário preparado:", {
          code: error?.code ?? error?.rawError?.code ?? null,
          message: error?.message ?? String(error),
          interactionId: i.id,
          ageMs: typeof i.createdTimestamp === "number"
            ? Date.now() - i.createdTimestamp
            : null,
        });

        if (!isUnknownInteractionError(error)) {
          await safeReply(i, {
            content: "⚠️ Não consegui abrir o formulário. Tente clicar novamente.",
            ephemeral: true,
          });
        }

        return true;
      }

      if (typeof entry.onOpened === "function") {
        try {
          await entry.onOpened(i);
        } catch (error) {
          console.error("[VIP] Falha na auditoria do formulário aberto:", {
            code: error?.code ?? error?.rawError?.code ?? null,
            message: error?.message ?? String(error),
          });
        }
      }

      return true;
    }

    // ── 1) BOTÕES DO MENU: abrir + filtros ────────────────────────
    if (isVipMenuButton) {
      if (i.customId === VIP_MENU_BUTTON_ID) {
        if (!canRegister(i.member)) {
          await safeReply(i, { content: "🚫 Você não tem permissão para registrar.", ephemeral: true });
          return true;
        }

        if (!i.deferred && !i.replied) {
          await i.deferReply({ ephemeral: true });
        }

        const leaderContext = await VIP_getLeaderRequestContext(i.member);

        if (leaderContext.strict && !leaderContext.ok) {
          await safeReply(i, {
            content: leaderContext.message,
            ephemeral: true,
          });
          return true;
        }

        const directCityKey = leaderContext.strict && (
          leaderContext.source === 'org_ticket' ||
          leaderContext.cityKeys.length === 1
        )
          ? leaderContext.cityKeys[0]
          : null;

        if (directCityKey) {
          const eventData = getTodayEventData();

          const modal = VIP_buildModal(eventData, {
            orgName: leaderContext.orgName,
          });

          modal.setCustomId(`${VIP_MODAL_ID}:${directCityKey}`);

          try {
            await VIP_prepareModal(i, modal, async (modalInteraction) => {
              await VIP_sendAuditLog(client, modalInteraction.guild, {
                title: "🌆 Modal de VIP aberto automaticamente",
                color: MENU_COLOR,
                action: "ABRIU_MODAL_VIP_AUTO",
                interaction: modalInteraction,
                actor: modalInteraction.user,
                channel: modalInteraction.channel,
                during: "O sistema validou automaticamente o líder e abriu o modal de VIP.",
                before: "Antes: usuário clicou em Abrir formulário.",
                after: [
                  `Depois: modal aberto para **${CITIES[directCityKey].label}**.`,
                  leaderContext.orgName
                    ? `Organização detectada: **${leaderContext.orgName}**.`
                    : "Organização: preenchimento manual.",
                ].join("\n"),
                extra: `Fonte da validação: \`${leaderContext.source}\``,
              });
            });
          } catch (err) {
            console.error("[VIP] Preparação do modal automático falhou:", {
              code: err?.code ?? err?.rawError?.code ?? null,
              message: err?.message ?? String(err),
              interactionId: i.id,
            });

            await safeReply(i, {
              content: "⚠️ Não consegui preparar o formulário. Tente novamente pelo menu de VIP.",
              components: [],
              ephemeral: true,
            });
          }

          return true;
        }

        const allowedCityKeys = leaderContext.strict
          ? leaderContext.cityKeys
          : Object.keys(CITIES);

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId(VIP_SEL_CITY_ID)
          .setPlaceholder('Selecione a cidade do evento')
          .addOptions(
            allowedCityKeys.map(key => {
              const city = CITIES[key];

              return new StringSelectMenuOptionBuilder()
                .setLabel(city.label)
                .setValue(key)
                .setEmoji(city.emoji);
            })
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

      const qual =
        i.customId === VIP_FILTER_SOLICITADOS_ID
          ? 'solicitados'
          : 'naoclicados';

      await safeReply(i, {
        content:
          '⏳ Reorganizando os registros no canal. O menu será colocado abaixo deles ao terminar.',
        ephemeral: true,
      });

      try {
        const resultado =
          await VIP_reordenarRegistros(
            ch,
            qual,
            client
          );

        await i.editReply({
          content:
            `✅ Reorganização concluída.\n` +
            `📦 Registros movidos: **${resultado.movidos}**.\n` +
            'O menu de solicitação foi recriado no fim do canal.',

          allowedMentions: {
            parse: [],
          },
        });
      } catch (error) {
        console.error(
          '[VIP FILTRO] Falha na reorganização:',
          {
            filtro: qual,
            channelId: ch.id,
            code: error?.code,
            message: error?.message,
          }
        );

        await i.editReply({
          content:
            '⚠️ A reorganização foi interrompida.\n' +
            String(
              error?.message ||
              'Confira os logs do bot.'
            ).slice(0, 1200),

          allowedMentions: {
            parse: [],
          },
        });
      }

      return true;
    }

    if (isVipCitySelect) {
      if (!canRegister(i.member)) {
        await safeReply(i, { content: '🚫 Você não tem permissão para registrar.', ephemeral: true });
        return true;
      }

      const cityKey = i.values[0];

      if (!cityKey || !CITIES[cityKey]) {
        await safeReply(i, {
          content: '❌ Cidade inválida. Comece o processo novamente.',
          ephemeral: true,
        });
        return true;
      }

      if (!i.deferred && !i.replied) {
        await i.deferReply({ ephemeral: true });
      }

      const leaderContext = await VIP_getLeaderRequestContext(i.member);

      if (leaderContext.strict && !leaderContext.ok) {
        await safeReply(i, {
          content: leaderContext.message,
          ephemeral: true,
        });
        return true;
      }

      if (leaderContext.strict && !leaderContext.cityKeys.includes(cityKey)) {
        await safeReply(i, {
          content: '🚫 Essa cidade não corresponde aos seus cargos/ticket atuais. Abra o formulário novamente.',
          ephemeral: true,
        });
        return true;
      }

      const eventData = getTodayEventData();

      const modal = VIP_buildModal(eventData, {
        orgName: leaderContext.source === 'org_ticket'
          ? leaderContext.orgName
          : null,
      });

      modal.setCustomId(`${VIP_MODAL_ID}:${cityKey}`);

      try {
        await VIP_prepareModal(i, modal, async (modalInteraction) => {
          await VIP_sendAuditLog(client, modalInteraction.guild, {
            title: "🌆 Modal de VIP aberto",
            color: MENU_COLOR,
            action: "ABRIU_MODAL_VIP",
            interaction: modalInteraction,
            actor: modalInteraction.user,
            channel: modalInteraction.channel,
            during: "Usuário selecionou a cidade e o sistema abriu o modal de registro de VIP.",
            before: "Antes: usuário estava no seletor de cidade.",
            after: `Depois: modal aberto para preenchimento.\nCidade selecionada: **${CITIES[cityKey].label}** (\`${cityKey}\`)`,
            extra: `Dados automáticos do cronograma:\n\`\`\`json\n${VIP_cut(JSON.stringify(eventData || {}, null, 2), 900)}\n\`\`\``,
          });
        });
      } catch (err) {
        console.error("[VIP] Preparação do modal da cidade falhou:", {
          code: err?.code ?? err?.rawError?.code ?? null,
          message: err?.message ?? String(err),
          interactionId: i.id,
        });

        await safeReply(i, {
          content: "⚠️ Não consegui preparar o formulário. Selecione a cidade novamente pelo menu de VIP.",
          components: [],
          ephemeral: true,
        });
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

      const msg = await menuCh.messages.fetch(
        vipCurrentId(
          menuCh.id,
          messageId
        )
      ).catch(() => null);
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
        await safeReply(i, {
          content: "❌ Cidade inválida ou não selecionada. Por favor, comece o processo novamente.",
          ephemeral: true,
        });
        return true;
      }

      const leaderContext = await VIP_getLeaderRequestContext(i.member);

      if (leaderContext.strict && !leaderContext.ok) {
        await safeReply(i, {
          content: leaderContext.message,
          ephemeral: true,
        });
        return true;
      }

      if (leaderContext.strict && !leaderContext.cityKeys.includes(cityKey)) {
        await safeReply(i, {
          content: "🚫 Seus cargos/ticket mudaram e esta cidade não é mais válida para você. Abra o formulário novamente.",
          ephemeral: true,
        });
        return true;
      }

let evento = i.fields.getTextInputValue("vip_evt_nome").trim();
let data = i.fields.getTextInputValue("vip_evt_data").trim();
const ganhadorInput = i.fields.getTextInputValue("vip_ganhador_id").trim();
let org = i.fields.getTextInputValue("vip_org_nome").trim();
let premiacao = i.fields.getTextInputValue("vip_premiacao").trim();

if (leaderContext.strict && leaderContext.source === 'org_ticket' && leaderContext.orgName) {
  org = leaderContext.orgName;
}

const ganhadorFlex = VIP_parseGanhadorFlex(ganhadorInput, org);

let ganhadorId = ganhadorFlex.id;
let ganhadorNome = ganhadorFlex.nome || org || "Não identificado";

const pagamentoResolvido = VIP_PRESERVAR_PREMIACAO_ORIGINAL
  ? null
  : await VIP_resolverPagamentoLink(client, premiacao);

const premiacaoPrincipal = VIP_limparTextoAnalise(premiacao);
let tipo = VIP_normalizarTipoPremiacao(premiacaoPrincipal || premiacao);
let pagamentoLink = null;

if (pagamentoResolvido?.ok) {
  pagamentoLink = pagamentoResolvido.link.url;

  if (pagamentoResolvido.info?.evento) evento = pagamentoResolvido.info.evento;
  if (pagamentoResolvido.info?.data) data = pagamentoResolvido.info.data;
  if (pagamentoResolvido.info?.ganhadorId) ganhadorId = pagamentoResolvido.info.ganhadorId;
  if (pagamentoResolvido.info?.nomeGanhador) ganhadorNome = pagamentoResolvido.info.nomeGanhador;

  const premiacaoFonte = pagamentoResolvido.info?.premiacao || premiacao;
  const premiacaoPrincipalFonte = VIP_pegarTextoPrincipalPremiacao(premiacaoFonte);

  tipo = VIP_normalizarTipoPremiacao(premiacaoPrincipalFonte || premiacaoFonte || premiacao);

  if (pagamentoResolvido.info?.premiacao) premiacao = pagamentoResolvido.info.premiacao;
}

const prizeError =
  validatePrizeInput({
    prize:
      premiacao,

    type:
      tipo,

    classify:
      VIP_normalizarTipoPremiacao,
  });

if (
  prizeError
) {
  await safeReply(
    i,
    {
      content:
        '❌ ' + prizeError,

      ephemeral:
        true,
    }
  );

  return true;
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
      if (i.__scSiteVip) {
        const latestMember = await guild.members.fetch({
          user: i.user.id,
          force: true,
        });

        const latestContext =
          await VIP_getLeaderRequestContext(
            latestMember,
            {
              freshMember: true,
            }
          );

        if (
          !latestMember.roles.cache.has(IDS.LIDERES) ||
          !canRegister(latestMember) ||
          !latestContext.strict ||
          !latestContext.ok ||
          !latestContext.cityKeys.includes(cityKey) ||
          (
            latestContext.source === 'org_ticket' &&
            latestContext.orgName !== org
          )
        ) {
          throw VIP_siteFail(
            403,
            'Seus cargos ou organização mudaram. Reabra o formulário antes de solicitar o VIP.'
          );
        }

        embed.setFooter({
          text:
            'SantaCreators • VIP por Evento • SITE:' +
            i.__scSiteVipRequestKey,

          iconURL:
            guild.iconURL({ size: 64 }) || undefined,
        });

        i.__scSiteVipSending = true;
      }

      const msg = await menuCh.send({
        content: `Novo registro de VIP para a ${cityName}! ${cityRoleMention}`,
        embeds: [embed],
        components: VIP_buildRegistroButtons(false, false, false) });

      if (i.__scSiteVip) {
        i.__scSiteVipCreated = {
          messageId: msg.id,
          url: msg.url,
        };

        await i.__scSiteVipCreatedHook?.(msg);
      }

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

        if (pagoIdx >= 0 && (fieldsPagoCorrigidos[pagoIdx]?.value || "—") !== "—") {
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
  after: `Depois:\n${VIP_extractEmbedFields(embedPagoCorrigido)}`,
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
    if (i.__scSiteVip) {
      i.__scSiteVipError = err;
    }

    if (!isUnknownInteractionError(err)) console.error("[VIP] erro:", err);

    return true;
  }
}

export async function vipEventoHandleMessage(message, client) {
  if (
    message.author?.bot ||
    !message.guild
  ) {
    return false;
  }

  const command = String(
    message.content || ''
  ).trim().toLowerCase();

  if (command !== '!menuvip') {
    return false;
  }

  try {
    const member =
      await message.guild.members.fetch({
        user: message.author.id,
        force: true,
      });

    if (!canAction(member)) {
      await message.reply({
        content:
          '🚫 Você não tem permissão para recriar o menu VIP.',

        allowedMentions: {
          repliedUser: false,
          parse: [],
        },
      });

      return true;
    }

    const menu = await VIP_ensureFreshMenu(
      message.guild,
      client,
      true
    );

    await message.reply({
      content: menu
        ? `✅ Menu VIP recriado!\n${menu.url}`
        : '⚠️ O canal VIP não foi encontrado neste servidor.',

      allowedMentions: {
        repliedUser: false,
        parse: [],
      },
    });
  } catch (error) {
    console.error(
      '[VIP MENU] Falha no comando !menuvip:',
      error
    );

    await message.reply({
      content:
        '❌ Não consegui recriar o menu. Confira o erro [VIP MENU] no console do bot.',

      allowedMentions: {
        repliedUser: false,
        parse: [],
      },
    }).catch(() => {});
  }

  return true;
}
export async function corrigirCidadeVipPorCargo(
  message,
  members = new Map()
) {
  if (
    message.author?.id !== message.client.user?.id ||
    !message.guild ||
    !String(
      message.embeds?.[0]?.title || ''
    ).includes('Registro de VIP por Evento')
  ) {
    return message;
  }

  const embedRaw = message.embeds[0];

  const actorId = String(
    embedRaw.description || ''
  ).match(
    /Registrado por:\*{0,2}\s*<@!?(\d{17,20})>/i
  )?.[1];

  if (!actorId) return message;

  if (!members.has(actorId)) {
    members.set(
      actorId,
      message.guild.members.fetch({
        user: actorId,
        force: true,
      }).catch(error => {
        console.warn(
          '[VIP CIDADE] Membro indisponível:',
          actorId,
          error.code
        );

        return null;
      })
    );
  }

  const member = await members.get(actorId);

  if (
    !member?.roles?.cache?.has(
      IDS.LIDERES
    )
  ) {
    return message;
  }

  const staffRoles =
    REGISTER_ALLOWED.filter(
      id => id !== IDS.LIDERES
    );

  if (
    hasAnyRole(member, staffRoles) ||
    REGISTER_ALLOWED_USERS.includes(
      member.id
    )
  ) {
    return message;
  }

  const keys =
    VIP_LIDER_CITY_KEYS.filter(key =>
      member.roles.cache.has(
        CITIES[key].roleId
      )
    );

  if (keys.length !== 1) {
    const warningKey =
      `city-warning:${actorId}`;

    if (!members.has(warningKey)) {
      members.set(warningKey, true);

      const countKey =
        'city-warning-count';

      const count =
        Number(members.get(countKey) || 0);

      members.set(countKey, count + 1);

      if (count < 10) {
        console.warn(
          '[VIP CIDADE] Registrante sem cidade única:',
          {
            registranteId: actorId,
            exemploRegistroId: message.id,
            cidadesEncontradas: keys,

            cargosAtuais: [
              ...member.roles.cache.values(),
            ]
              .filter(role =>
                role.id !== member.guild.id
              )
              .map(role => ({
                nome: role.name,
                id: role.id,
              })),

            cidadeDoRegistroPreservada: true,
          }
        );
      } else if (count === 10) {
        console.warn(
          '[VIP CIDADE] Demais avisos de cidade omitidos nesta varredura. Registros sem cidade única serão preservados.'
        );
      }
    }

    return message;
  }

  const city = CITIES[keys[0]];

  const normalize = value =>
    String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/gi, '')
      .toLowerCase();

  const previous =
    VIP_getFieldValue(
      embedRaw,
      '🌆 Cidade'
    );

  if (
    normalize(previous) ===
    normalize(city.label)
  ) {
    return message;
  }

  const current =
    await message.channel.messages.fetch({
      message: message.id,
      force: true,
    });

  if (
    current.editedTimestamp !==
    message.editedTimestamp
  ) {
    console.warn(
      '[VIP CIDADE] Registro alterado durante leitura:',
      message.id
    );

    return current;
  }

  const embed =
    EmbedBuilder.from(
      current.embeds[0]
    );

  const fields = [
    ...(embed.data.fields || []),
  ];

  const index = fields.findIndex(
    field =>
      String(field.name).startsWith(
        '🌆 Cidade'
      )
  );

  if (index < 0) return current;

  fields[index] = {
    ...fields[index],
    value: `**${city.label}**`,
  };

  const audit = {
    name: '🛠️ Correção da cidade',

    value:
      `Anterior: ${previous}\n` +
      `Atual: **${city.label}**\n` +
      `Conferido pelo cargo <@&${city.roleId}> ` +
      `do registrante <@${actorId}>.`,

    inline: false,
  };

  const auditIndex =
    fields.findIndex(
      field =>
        field.name === audit.name
    );

  if (auditIndex >= 0) {
    fields[auditIndex] = audit;
  } else if (fields.length < 25) {
    fields.push(audit);
  }

  embed.setFields(fields);

  let content =
    String(current.content || '').replace(
      /Novo registro de VIP para (?:a|o) [^!\n]+!/i,
      `Novo registro de VIP para a ${city.label}!`
    );

  for (
    const config of Object.values(CITIES)
  ) {
    content = content
      .split(`<@&${config.roleId}>`)
      .join(`<@&${city.roleId}>`);
  }

  const updated = await current.edit({
    content,

    embeds: [
      embed,
      ...current.embeds.slice(1),
    ],

    allowedMentions: {
      parse: [],
    },
  });

  console.info(
    '[VIP CIDADE] Corrigida:',
    {
      messageId: updated.id,
      registranteId: actorId,
      anterior: previous,
      atual: city.label,
    }
  );

  return updated;
}