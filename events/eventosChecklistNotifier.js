import fs from "node:fs";
import path from "node:path";
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";

const TZ = "America/Sao_Paulo";
const DATA_DIR = path.resolve(process.cwd(), "data");
const CRONO_FILE = path.join(DATA_DIR, "cronograma_state.json");
const NOTIFIER_STATE_FILE = path.join(DATA_DIR, "eventos_checklist_notifier_state.json");

// ✅ CANAL DE LOG DE TODAS AS NOTIFICAÇÕES ENVIADAS NO PV
const DM_LOG_CHANNEL_ID = "1486009690767757322";

// ✅ CANAL ONDE VAI FICAR O BOTÃO DE TESTE
const TEST_PANEL_CHANNEL_ID = "1416693217415663657";

// ✅ BOTÃO DE TESTE DO NOTIFIER
const TEST_BUTTON_ID = "sc_eventos_checklist_notifier_test";

// ✅ QUEM PODE USAR O BOTÃO DE TESTE
const TEST_ALLOWED_USERS = ["660311795327828008"];

const TEST_ALLOWED_ROLES = [
  "1262262852949905408",
  "1352408327983861844",
  "1262262852949905409",
  "1352407252216184833",
];

const ROLES = {
  RESP_CREATORS: "1352408327983861844",
  RESP_INFLU: "1262262852949905409",
  RESP_LIDER: "1352407252216184833",
  RESPONSAVEIS: "1414651836861907006",

  COORDENACAO_GERAL: "1352385500614234134",
  EQUIPE_CREATORS: "1352429001188180039",
  CREATOR_SENIOR: "1379172775905984703",

  EQUIPE_MANAGER: "1392678638176043029",
  MANAGER_CREATORS: "1388976155830255697",

  EQUIPE_SOCIAL: "1387253972661964840",
  SOCIAL_MEDIAS: "1388976094920704141",

  GESTOR_CREATORS: "1388975939161161728",
  COORD_CREATORS: "1388976314253312100",
};

const CITY_ROLES = {
  maresia: "1379021994678288465",
  grande: "1418691103397253322",
  santa: "1379021888709464168",
  nobre: "1379021805544804382",
};

const CITY_CALLS = {
  nobre: {
    name: "Nobre",
    call: "https://discord.com/channels/755203021490749530/1426780129236881519",
    suporte: "https://discord.com/channels/755203021490749530/1445912045898698803",
  },

  santa: {
    name: "Cidade Santa",
    call: "https://discord.com/channels/690983940567334964/1437900173006077952",
    suporte: "https://discord.com/channels/690983940567334964/1437900087438213211",
  },

  grande: {
    name: "Cidade Grande",
    call: "https://discord.com/channels/788905600699858944/1455260718021480560",
    suporte: "https://discord.com/channels/788905600699858944/1407515329630048417",
  },

  maresia: {
    name: "Maresia",
    call: "https://discord.com/channels/798594785896038401/1471325919716048976",
    suporte: "https://discord.com/channels/798594785896038401/1471325624713875547",
  },
};

const POINT_CHANNELS = {
  manager: "1417602111495077920",
  social: "1417601634644525147",
  gestor: "1417601906305536101",
  coord: "1417602334036463656",
  resp: "1425943893400227892",
};

const DAY_KEYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadJson(file, fallback) {
  ensureDir();
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function saveJson(file, data) {
  ensureDir();
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function nowSP() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: TZ }));
}

/**
 * Extrai todos os horários de uma string (ex: "19:00 e 21:00") 
 * e converte para minutos desde a meia-noite.
 */
function extractAllTimesInMinutes(timeStr) {
  const matches = String(timeStr || "").match(/(\d{1,2}):(\d{2})/g);
  if (!matches) return [];
  
  return matches.map(m => {
    const [h, min] = m.split(":").map(Number);
    if (isNaN(h) || isNaN(min)) return null;
    return h * 60 + min;
  }).filter(v => v !== null);
}

function minutesNowSP() {
  const d = nowSP();
  return d.getHours() * 60 + d.getMinutes();
}

function todayKeySP() {
  return DAY_KEYS[nowSP().getDay()];
}

function todayDateBR() {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());
}

function cityKey(city) {
  const c = String(city || "").toLowerCase();
  if (c.includes("maresia")) return "maresia";
  if (c.includes("grande")) return "grande";
  if (c.includes("santa")) return "santa";
  if (c.includes("nobre")) return "nobre";
  return null;
}

function getTodayEvents() {
  const crono = loadJson(CRONO_FILE, null);
  if (!crono) return [];

  const key = todayKeySP();
  const events = [];

  const normal = crono.schedule?.[key];
  if (normal?.active && normal?.time && normal.time !== "—") {
    events.push({
      type: "normal",
      city: normal.city,
      cityKey: cityKey(normal.city),
      time: normal.time,
      eventName: normal.eventName || "Evento SantaCreators",
      prizes: normal.prizes || "—",
    });
  }

  const madru = crono.madrugada?.[key];
  if (madru?.active && madru?.time && madru.time !== "—") {
    events.push({
      type: "madrugada",
      city: madru.city,
      cityKey: cityKey(madru.city),
      time: String(madru.time).match(/\d{1,2}:\d{2}/)?.[0] || "23:00",
      eventName: madru.eventName || "F3 MADRUGADA",
      prizes: madru.prizes || "—",
    });
  }

  return events;
}

/**
 * Calcula a diferença em minutos entre agora e o alvo, 
 * lidando corretamente com a virada do dia (1440 minutos).
 */
function getMinutesDiff(now, target) {
  let diff = target - now;
  if (diff < -720) diff += 1440; // O alvo é "amanhã" em relação a agora
  if (diff > 720) diff -= 1440;  // O alvo foi "ontem" em relação a agora
  return diff;
}

/**
 * Determina a fase do evento baseada na distância em minutos para o início.
 * @param {number} diff Diferença (Target - Agora). Positivo = Futuro, Negativo = Passado.
 */
function getPhaseByDiff(diff) {
  // 2 horas antes do evento
  if (diff <= 130 && diff > 105) return "PRE_120";

  // Antes do evento
  if (diff <= 70 && diff > 45) return "PRE_60";
  if (diff <= 40 && diff > 10) return "PRE_30";

  // Durante o evento
  if (diff <= 0 && diff > -20) return "DURANTE";

  // 20 a 45 minutos depois: Cobrança de Bate-Ponto
  if (diff <= -25 && diff > -45) return "PONTO_25";

  // 50 a 85 minutos depois: Checklist Final
  if (diff <= -50 && diff > -85) return "POS_CHECKLIST";

  // 90 a 130 minutos depois: Cobrança de Poderes
  if (diff <= -90 && diff > -130) return "POS_PODERES";

  return null;
}

function getPhase(eventStartMinutes) {
  const now = minutesNowSP();
  const diff = getMinutesDiff(now, eventStartMinutes);
  return getPhaseByDiff(diff);
}

function alreadySent(state, key) {
  return Boolean(state.sent?.[key]);
}

function markSent(state, key) {
  state.sent ??= {};
  state.sent[key] = Date.now();
}

function isOnline(member) {
  const presence = member?.presence || member?.guild?.presences?.cache?.get(member.id);

  if (!presence) {
    console.log(`[EventosChecklistNotifier] ⚠️ Sem presence para ${member?.user?.tag}. Considerando offline/invisível.`);
    return false;
  }

  const status = presence.status;
  return status === "online" || status === "idle" || status === "dnd";
}

async function getMembersByRoles(guild, roleIds) {
  await guild.members.fetch().catch(() => null);

  const allowedRoleIds = new Set(roleIds.filter(Boolean));
  const ids = new Set();

  for (const roleId of allowedRoleIds) {
    const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
    if (!role) continue;

    for (const member of role.members.values()) {
      if (member.user.bot) continue;

      const hasAllowedRole = [...allowedRoleIds].some((id) =>
        member.roles.cache.has(id)
      );

      if (!hasAllowedRole) continue;

      ids.add(member.id);
    }
  }

  return [...ids]
    .map((id) => guild.members.cache.get(id))
    .filter(Boolean);
}

function checklistText(event) {
  return [
    "📋 **CHECKLIST · ANTES DO EVENTO**",
    "",
    "☐ ⚡ Setagem de poderes feita apenas para cargos abaixo de Coordenação.",
    "☐ ⚠️ GestãoInfluencer setado no cargo correto.",
    "☐ 👗 Roupas da temática conferidas.",
    "☐ 📍 Local do evento verificado.",
    "☐ 📄 F3/convite enviado.",
    "☐ 👥 ADMs do evento definidos.",
    "☐ 🪪 Cargos necessários conferidos.",
    "",
    "🏆 **CHECKLIST · PÓS EVENTO**",
    "",
    "☐ ⭐ Hall da Fama registrado.",
    "☐ 👑 VIP/premiações solicitados.",
    "☐ 💳 Pagamento do evento liberado/registrado.",
    "☐ ⚡ Poderes removidos.",
    "☐ 📢 GG oficial enviado na cidade.",
    "",
    `🎯 **Evento:** ${event.eventName}`,
    `🏙️ **Cidade:** ${event.city}`,
    `⏰ **Horário:** ${event.time}`,
  ].join("\n");
}

async function logDmNotification(client, member, embed, status = "ENVIADO", event = {}, type = "comum") {
  try {
    const logChannel = await client.channels.fetch(DM_LOG_CHANNEL_ID).catch(() => null);
    if (!logChannel || !logChannel.isTextBased()) return;

    const avatar = member.user.displayAvatarURL({ dynamic: true, size: 1024 });
    const userLink = `https://discord.com/users/${member.id}`;

    const logEmbed = new EmbedBuilder()
      .setColor(status === "ENVIADO" ? "#2ecc71" : "#e74c3c")
      .setTitle(status === "ENVIADO" ? "📩 PV enviado com sucesso" : "⚠️ Falha ao enviar PV")
      .setThumbnail(avatar)
      .addFields(
        { name: "👤 Usuário", value: `${member} \`${member.user.tag}\``, inline: false },
        { name: "🆔 ID Discord", value: `\`${member.id}\``, inline: true },
        { name: "🔗 Link da pessoa", value: `[Abrir perfil](${userLink})`, inline: true },
        { name: "🎭 Cargos detectados", value: getMemberRoleNames(member).slice(0, 1000), inline: false },
        { name: "📌 Título", value: embed?.data?.title || "Sem título", inline: true },
        { name: "🎯 Evento", value: `\`${event.eventName || "—"}\` (${event.city || "—"})`, inline: true },
        { name: "🏷️ Tipo", value: `\`${type}\``, inline: true },
        { name: "📝 Conteúdo enviado", value: String(embed?.data?.description || "Sem descrição").slice(0, 1000), inline: false },
        { name: "⏰ Horário", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
      )
      .setFooter({ text: `SantaCreators • Log de PV • ${status}` })
      .setTimestamp();

    await logChannel.send({
      content: `${status === "ENVIADO" ? "✅" : "❌"} Log de PV para ${member}`,
      embeds: [logEmbed],
    });
  } catch (e) {
    console.error("[EventosChecklistNotifier] erro ao logar PV:", e);
  }
}

async function dm(client, member, embed, event, type) {
  try {
    const resultado = await globalThis.enviarMensagemPrivadaSegura(
      member,
      {
        embeds: [embed],
      },
      `EVENTOS_CHECKLIST:${String(type || "SEM_TIPO")}:${member.id}`
    );

    if (!resultado?.sucesso) {
      console.error(
        `[EventosChecklistNotifier] Falha ao enviar PV para ${member.user.tag} (${member.id}).`,
        {
          status: resultado?.status ?? "SEM_STATUS",
          codigo: resultado?.codigo ?? "SEM_CODIGO",
          mensagem: resultado?.mensagem ?? "SEM_MENSAGEM",
          tipo,
          evento: event?.eventName ?? "SEM_EVENTO",
        }
      );

      await logDmNotification(
        client,
        member,
        embed,
        "FALHOU",
        event,
        type
      );

      return false;
    }

    await logDmNotification(
      client,
      member,
      embed,
      "ENVIADO",
      event,
      type
    );

    return true;
  } catch (erro) {
    console.error(
      `[EventosChecklistNotifier] Erro inesperado ao enviar PV para ${member.user.tag} (${member.id}).`,
      {
        codigo:
          erro?.code ??
          erro?.rawError?.code ??
          "SEM_CODIGO",
        mensagem:
          erro?.rawError?.message ??
          erro?.message ??
          String(erro),
        stack: erro?.stack,
        tipo,
        evento: event?.eventName ?? "SEM_EVENTO",
      }
    );

    await logDmNotification(
      client,
      member,
      embed,
      "FALHOU",
      event,
      type
    );

    return false;
  }
}

async function sendProgressLog(client, title, description, color = "#9b59b6") {
  try {
    const logChannel = await client.channels.fetch(DM_LOG_CHANNEL_ID).catch(() => null);
    if (!logChannel || !logChannel.isTextBased()) return;

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(title)
      .setDescription(description)
      .addFields({
        name: "⏰ Data/Hora",
        value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
        inline: false,
      })
      .setFooter({ text: "SantaCreators • Progresso do Notifier" })
      .setTimestamp();

    await logChannel.send({ embeds: [embed] });
  } catch (e) {
    console.error("[EventosChecklistNotifier] erro ao enviar log de progresso:", e);
  }
}

function memberListText(members) {
  if (!members.length) return "Nenhum membro encontrado.";

  return members
    .map((m) => `• ${m} — \`${m.user.tag}\` — \`${m.id}\``)
    .join("\n")
    .slice(0, 1800);
}

function getMemberRoleNames(member) {
  return member.roles.cache
    .filter((role) => role.id !== member.guild.id)
    .map((role) => role.name)
    .join(", ") || "Sem cargos detectados";
}

function hasAnyRole(member, roleIds) {
  return roleIds.some((roleId) => member.roles.cache.has(roleId));
}

function isResponsible(member) {
  return hasAnyRole(member, [
    ROLES.RESPONSAVEIS,
    ROLES.RESP_CREATORS,
    ROLES.RESP_INFLU,
    ROLES.RESP_LIDER,
  ]);
}

function isCoordOrGestor(member) {
  return hasAnyRole(member, [
    ROLES.COORDENACAO_GERAL,
    ROLES.COORD_CREATORS,
    ROLES.GESTOR_CREATORS,
  ]);
}

function getPointChannelId(member) {
  if (isResponsible(member)) return POINT_CHANNELS.resp;

  if (member.roles.cache.has(ROLES.COORD_CREATORS)) {
    return POINT_CHANNELS.coord;
  }

  if (member.roles.cache.has(ROLES.GESTOR_CREATORS)) {
    return POINT_CHANNELS.gestor;
  }

  if (
    member.roles.cache.has(ROLES.EQUIPE_SOCIAL) ||
    member.roles.cache.has(ROLES.SOCIAL_MEDIAS)
  ) {
    return POINT_CHANNELS.social;
  }

  if (
    member.roles.cache.has(ROLES.EQUIPE_MANAGER) ||
    member.roles.cache.has(ROLES.MANAGER_CREATORS)
  ) {
    return POINT_CHANNELS.manager;
  }

  return POINT_CHANNELS.manager;
}

function getCityCalls(event) {
  return CITY_CALLS[event.cityKey] || {
    name: event.city || "Cidade",
    call: "Call da equipe não configurada.",
    suporte: "Call de suporte não configurada.",
  };
}

function getPresenceText(member) {
  const status = member?.presence?.status;

  if (!status) {
    return "não consegui ver teu status certinho, então já vou te chamar mesmo assim kkkkk";
  }

  if (status === "offline" || status === "invisible") {
    return "vi que você está offline/invisível, mas já deixei esse salve aqui pra quando você aparecer";
  }

  if (status === "idle") {
    return "vi que você está ausente, mas bora acordar pra esse evento kkkkk";
  }

  if (status === "dnd") {
    return "vi que você está no não perturbe, mas o evento tá chegando e preciso te cutucar";
  }

  return "vi que você está online, então já cola com a equipe e bora organizar isso bonito";
}

function buildChecklistAntesText(event) {
  const calls = getCityCalls(event);

  return [
    "📋 **CHECKLIST · ANTES DO EVENTO**",
    "━━━━━━━━━━━━━━━━━━━━",
    "",
    "☐ ⚡ **Setagem de poderes**",
    "Setar os poderes necessários apenas para cargos abaixo de Coordenação.",
    "Coordenadores também conseguem ajudar quando necessário.",
    "",
    "☐ ⚠️ **GestãoInfluencer correto**",
    "Setar o GestãoInfluencer de acordo com o cargo correto da pessoa.",
    "Nunca setar em quem não esteja apto/autorizado.",
    "",
    "☐ 👗 **Roupas verificadas**",
    "Conferir roupas da temática do evento e registrar no chat creators da cidade.",
    "",
    "☐ 📍 **Local do evento verificado**",
    "Checar se o local está correto e se não teve mudança/problema.",
    "",
    "☐ 📄 **F3 do evento enviado**",
    "Garantir que o convite do evento foi divulgado corretamente.",
    "",
    "☐ 👥 **ADM do evento definidos**",
    "Definir quem cuida da administração, controle, áudio e organização geral.",
    "",
    "☐ 🪪 **Cargos conferidos**",
    "Setar cargos necessários em quem estiver sem cargo para ajudar no evento.",
    "",
    `📞 **Call da equipe:** ${calls.call}`,
    `🆘 **Call suporte:** ${calls.suporte}`,
  ].join("\n");
}

function buildChecklistPosText(event) {
  const isNobre = event.cityKey === "nobre";

  return [
    "🏆 **CHECKLIST · PÓS EVENTO**",
    "━━━━━━━━━━━━━━━━━━━━",
    "",
    "☐ ⭐ **Hall da Fama**",
    "Registrar vencedores e destaques do evento.",
    "",
    "☐ 👑 **Solicitar VIP/premiações**",
    "Enviar as solicitações de VIP ou premiações dos vencedores.",
    "",
    "☐ 💳 **Pagamento do evento**",
    "Liberar ou registrar o pagamento referente ao evento.",
    "",
    "☐ 📢 **GG na cidade**",
    "Enviar GG oficial com vencedores e organização/equipe vencedora.",
    "",
"☐ ⚡ **Remover poderes/wall**",
"Remover poderes/wall de quem recebeu apenas para o evento.",
"",
"⚠️ **Exceção do wall:** não remover wall de Coord Creators, Gestor Creators e Responsáveis.",
"Esses cargos precisam manter porque faz parte do poder/função deles.",
    "",
    isNobre
      ? "📌 **Nobre:** foco total em remover wall/poderes usados no evento."
      : [
          "📌 **Outras cidades:** além do wall/poder, lembrar de remover GestãoInfluencer quando necessário.",
          "",
          "Coordenação geral:",
          "`ungroup id gestaoinfluencer 4`",
          "",
          "Equipe Creators:",
          "`ungroup id gestaoinfluencer 5`",
        ].join("\n"),
  ].join("\n");
}

function buildEquipeEventEmbed(member, event, phase) {
  const calls = getCityCalls(event);
  const pointChannel = getPointChannelId(member);
  const presenceText = getPresenceText(member);

  const titles = {
    PRE_120: "💜 Faltam 2 horas · bora aparecer no evento",
    PRE_60: "⏰ Falta 1 hora · esquenta da SantaCreators",
    PRE_30: "🚨 Falta 30 minutos · urgência real oficial",
    DURANTE: "🎬 Evento começou · cola e bate ponto",
    PONTO_25: "🕒 Bate-ponto do evento",
    POS_CHECKLIST: "🏆 Pós-evento · não some agora",
    POS_PODERES: "⚡ Pós-evento · poderes, wall e GestãoInfluencer",
  };

  const descriptions = {
    PRE_120: [
      `Eaiii ${member}, ${presenceText}.`,
      "",
      `Bora positivar e se organizar para o evento das **${event.time}** na **${event.city}**.`,
      "",
      `🎯 **Evento de hoje:** ${event.eventName}`,
      "",
      "É muitooo importante você aparecer, sério mesmo.",
      "",
      `📞 **Call da equipe:** ${calls.call}`,
      `🆘 **Sem acesso? Cola no suporte:** ${calls.suporte}`,
      "",
      "Assim que entrar e tiver responsável na call, pede um direcionamento:",
      "• como funciona o evento",
      "• onde você ajuda",
      "• se precisa setar wall",
      "• se precisa organizar F3, áudio, roupas ou local",
      "",
      "Se o responsável estiver AFK ou não estiver na call, relaxa: cobra no chat/grupo da tua equipe.",
      "Aquele grupo de 10 pessoas mesmo kkkkk. Manager tem o seu, Social tem o seu. Bora usar isso.",
    ],

    PRE_60: [
      `Ouuu ${member}, falta **1 hora** para **${event.eventName}** na **${event.city}**.`,
      "",
      "Agora não é hora de sumir não kkkkk.",
      "",
      `📞 Call da equipe: ${calls.call}`,
      `🆘 Suporte: ${calls.suporte}`,
      "",
      "Já confere:",
      "☐ roupa do evento",
      "☐ se tem cargo certinho",
      "☐ se sabe onde vai ficar",
      "☐ se precisa de wall",
      "☐ se alguém da equipe já está organizando",
      "",
      "Se ninguém chamou ainda, chama você mesmo no grupo. Quem puxa organização cresce demais.",
    ],

    PRE_30: [
      `${member}, AGORA É URGÊNCIA kkkkk.`,
      "",
      `Faltam **30 minutos** para **${event.eventName}** na **${event.city}**.`,
      "",
      `📞 Entra na call: ${calls.call}`,
      `🆘 Sem acesso? ${calls.suporte}`,
      "",
      "Quando entrar:",
      "• pede direcionamento",
      "• pergunta se precisa setar wall",
      "• confirma tua função",
      "• fica de olho no F3",
      "• ajuda a puxar a equipe",
      "",
      "Se tu ficar esperando alguém te chamar, o evento começa e vira bagunça. Boraaaa 💜",
    ],

    DURANTE: [
      `${member}, o evento **${event.eventName}** começou.`,
      "",
      `🏙️ Cidade: **${event.city}**`,
      `📞 Call: ${calls.call}`,
      "",
      `📌 **Bate teu ponto aqui:** <#${pointChannel}>`,
      "",
      "Se você está ajudando no evento, bate ponto bonitinho.",
      "Se usou poder/wall, depois registra também pra não virar cobrança.",
    ],

    PONTO_25: [
      `${member}, lembrete de bate-ponto do evento **${event.eventName}**.`,
      "",
      `📌 Canal correto pra você: <#${pointChannel}>`,
      "",
      "Se você ajudou no evento, registra aí bonitinho.",
      "Não deixa pra depois porque depois ninguém lembra e vira aquela novela kkkkk.",
    ],

    POS_CHECKLIST: [
      `${member}, pós-evento também conta, viu?`,
      "",
      `O evento **${event.eventName}** da **${event.city}** já passou da fase principal.`,
      "",
      "Se você ajudou, confere se ficou algo pendente:",
      "☐ bateu ponto",
      "☐ avisou algo importante",
      "☐ registrou poder se usou",
      "☐ ajudou a fechar organização",
      "",
      "Não some do nada depois do evento não kkkkk.",
    ],

    POS_PODERES: [
      `${member}, fechamento do evento **${event.eventName}**.`,
      "",
      event.cityKey === "nobre"
        ? "Na Nobre, lembra de conferir principalmente wall/poderes que foram setados para o evento."
        : [
            "Como não é Nobre, além do wall/poder também tem GestãoInfluencer pra lembrar.",
            "",
            "Se for Coordenação geral:",
            "`ungroup id gestaoinfluencer 4`",
            "",
            "Se for Equipe Creators:",
            "`ungroup id gestaoinfluencer 5`",
          ].join("\n"),
      "",
      "Se você recebeu algo só pro evento, confirma com responsável se precisa remover.",
    ],
  };

  return new EmbedBuilder()
    .setColor("#9b59b6")
    .setTitle(titles[phase] || "📋 Lembrete SantaCreators")
    .setDescription((descriptions[phase] || []).join("\n"))
    .setFooter({ text: "SantaCreators • Lembrete personalizado da equipe" })
    .setTimestamp();
}

function buildRespEventEmbed(member, event, phase) {
  const calls = getCityCalls(event);
  const pointChannel = getPointChannelId(member);

  const titles = {
    PRE_120: "🚨 Responsável, cadê você?",
    PRE_60: "📋 Responsável · falta 1 hora",
    PRE_30: "🚨 Responsável · falta 30 minutos",
    DURANTE: "🎬 Responsável · evento começou",
    PONTO_25: "🕒 Responsável · cobrança de bate-ponto",
    POS_CHECKLIST: "🏆 Responsável · checklist pós-evento",
    POS_PODERES: "⚡ Responsável · remover poderes e fechar evento",
  };

  const descriptions = {
    PRE_120: [
      `Ouuu ${member}, cadê você? kkkkk`,
      "",
      `O **${event.eventName}** de hoje, às **${event.time}**, na **${event.city}**, já tá chegando.`,
      "",
      "Tu como responsável vai viver dando ausência? pqp emmmm... logo mais é cobrança/rebaixamento mesmo kkkkk.",
      "",
      `📞 **Entra na call da equipe:** ${calls.call}`,
      "",
      "Mesmo que não tenha ninguém na call, fica lá.",
      "Quando o povo ver alguém lá, eles entram também.",
      "",
      "Já começa agora:",
      "☐ chamar equipe nos grupos",
      "☐ organizar quem vai administrar",
      "☐ orientar quem não sabe o evento",
      "☐ ver wall/poderes",
      "☐ lembrar F3",
      "☐ conferir roupa/local",
      "☐ alinhar áudio/controle",
      "",
      buildChecklistAntesText(event),
    ],

    PRE_60: [
      `${member}, falta **1 hora** para **${event.eventName}**.`,
      "",
      `📞 Call: ${calls.call}`,
      "",
      "Já era pra você estar puxando organização:",
      "☐ responsável em call",
      "☐ equipe sendo chamada",
      "☐ wall sendo visto",
      "☐ F3 no radar",
      "☐ roupas/local conferidos",
      "☐ ADM do evento definido",
      "",
      "Não espera virar caos pra agir não kkkkk.",
    ],

    PRE_30: [
      `${member}, agora é reta final.`,
      "",
      `Faltam **30 minutos** para **${event.eventName}** na **${event.city}**.`,
      "",
      `📞 Call da equipe: ${calls.call}`,
      "",
      "COBRA AGORA:",
      "☐ quem tá sem wall",
      "☐ quem tá sem cargo",
      "☐ quem tá perdido",
      "☐ quem precisa ir pra call",
      "☐ quem vai controlar áudio",
      "☐ quem vai administrar",
      "",
      "E já dá toque nos chats das equipes mandando bater presença e colar na call.",
    ],

    DURANTE: [
      `${member}, o evento **${event.eventName}** começou.`,
      "",
      `📌 **Teu bate-ponto:** <#${pointChannel}>`,
      "",
      "Bate teu ponto e lembra a equipe de bater também.",
      "",
      "Na call, reforça:",
      "☐ quem está administrando",
      "☐ quem está no áudio",
      "☐ quem está com wall",
      "☐ quem está cuidando da organização",
      "☐ qualquer problema precisa ser registrado",
    ],

    PONTO_25: [
      `${member}, cobrança de bate-ponto.`,
      "",
      `📌 Teu canal: <#${pointChannel}>`,
      "",
      "Bate teu ponto e lembra geral nos chats/call:",
"⚠️ Responsável também bate ponto, sem essa de cobrar geral e esquecer o próprio kkkkk.",
      "• Manager/Equipe Manager no canal de Manager",
      "• Social/Social Medias no canal de Social",
      "• Gestor no canal de Gestor",
      "• Coord no canal de Coord",
      "• Responsável no canal de Responsável",
      "",
      "Fala na call também, porque sempre tem alguém que esquece kkkkk.",
    ],

    POS_CHECKLIST: [
      `${member}, hora de fechar o evento sem deixar rastro de bagunça.`,
      "",
      buildChecklistPosText(event),
      "",
      "Confere isso e cobra quem precisa fazer. Pós-evento é onde a organização aparece de verdade.",
    ],

    POS_PODERES: [
      `${member}, fechamento de poderes do evento **${event.eventName}**.`,
      "",
      "Responsável precisa cobrar e ajudar a remover o que foi setado só para o evento.",
      "",
      event.cityKey === "nobre"
        ? "📌 **Nobre:** remover wall/poderes de quem recebeu para o evento."
        : [
            "📌 **Fora da Nobre:** remover wall/poderes e lembrar GestãoInfluencer.",
            "",
            "Coordenação geral:",
            "`ungroup id gestaoinfluencer 4`",
            "",
            "Equipe Creators:",
            "`ungroup id gestaoinfluencer 5`",
          ].join("\n"),
      "",
      "Coordenação e Gestor também precisam ajudar nisso. Não deixa só um carregar tudo.",
    ],
  };

  return new EmbedBuilder()
    .setColor("#e74c3c")
    .setTitle(titles[phase] || "🚨 Responsável · SantaCreators")
    .setDescription((descriptions[phase] || []).join("\n"))
    .setFooter({ text: "SantaCreators • Cobrança de responsáveis" })
    .setTimestamp();
}

function buildCoordEventEmbed(member, event, phase) {
  const calls = getCityCalls(event);
  const pointChannel = getPointChannelId(member);

  const titles = {
    PRE_120: "⚡ Coord/Gestor · já ajuda a puxar organização",
    PRE_60: "⏰ Coord/Gestor · falta 1 hora",
    PRE_30: "🚨 Coord/Gestor · falta 30 minutos",
    DURANTE: "🎬 Coord/Gestor · evento começou",
    PONTO_25: "🕒 Coord/Gestor · bate-ponto",
    POS_CHECKLIST: "🏆 Coord/Gestor · pós-evento",
    POS_PODERES: "⚡ Coord/Gestor · ajuda a remover poderes",
  };

  const descriptions = {
    PRE_120: [
      `${member}, evento chegando e tu já pode ajudar muito.`,
      "",
      `🎯 **Evento:** ${event.eventName}`,
      `🏙️ **Cidade:** ${event.city}`,
      `⏰ **Horário:** ${event.time}`,
      "",
      `📞 Call: ${calls.call}`,
      `🆘 Suporte: ${calls.suporte}`,
      "",
      "Ajuda os responsáveis com:",
      "☐ chamar equipe",
      "☐ orientar quem não sabe",
      "☐ ver quem precisa de wall",
      "☐ conferir organização do evento",
      "☐ lembrar a galera de entrar na call",
    ],

    PRE_60: [
      `${member}, falta 1 hora para **${event.eventName}**.`,
      "",
      `📞 Call: ${calls.call}`,
      "",
      "Já ajuda a puxar quem tá perdido e dá força pros responsáveis.",
    ],

    PRE_30: [
      `${member}, falta 30 minutos.`,
      "",
      "Agora é ajudar pesado:",
      "☐ chamar na call",
      "☐ cobrar organização",
      "☐ ver wall",
      "☐ ajudar responsável",
      "",
      `📞 ${calls.call}`,
    ],

    DURANTE: [
      `${member}, evento começou.`,
      "",
      `📌 Bate ponto aqui: <#${pointChannel}>`,
      "",
      "Ajuda a manter a call viva e a equipe orientada.",
    ],

    PONTO_25: [
      `${member}, bate teu ponto e lembra a equipe também.`,
      "",
      `📌 Canal: <#${pointChannel}>`,
    ],

    POS_CHECKLIST: [
      `${member}, ajuda no pós-evento também.`,
      "",
      buildChecklistPosText(event),
    ],

    POS_PODERES: [
      `${member}, ajuda os responsáveis a remover poderes/wall.`,
      "",
      "Coordenação/Gestor não pode sumir nessa parte.",
      "",
      event.cityKey === "nobre"
        ? "Na Nobre, foco em remover wall/poderes."
        : [
            "Fora da Nobre, lembra também GestãoInfluencer:",
            "",
            "Coordenação geral:",
            "`ungroup id gestaoinfluencer 4`",
            "",
            "Equipe Creators:",
            "`ungroup id gestaoinfluencer 5`",
          ].join("\n"),
    ],
  };

  return new EmbedBuilder()
    .setColor("#3498db")
    .setTitle(titles[phase] || "⚡ Coord/Gestor · SantaCreators")
    .setDescription((descriptions[phase] || []).join("\n"))
    .setFooter({ text: "SantaCreators • Coordenação/Gestão" })
    .setTimestamp();
}

function buildPersonalEmbed(member, event, phase) {
  if (isResponsible(member)) {
    return buildRespEventEmbed(member, event, phase);
  }

  if (isCoordOrGestor(member)) {
    return buildCoordEventEmbed(member, event, phase);
  }

  return buildEquipeEventEmbed(member, event, phase);
}
function buildRespReminderEmbed(event) {
  return new EmbedBuilder()
    .setColor("#9b59b6")
    .setTitle("📣 Relembra a equipe do evento")
    .setDescription(
      [
        `Eaiii, responsável! 💜`,
        "",
        `O evento **${event.eventName}** da cidade **${event.city}** está no radar.`,
        "",
        "Passando pra te lembrar de puxar a galera e conferir se todo mundo fez o básico:",
        "",
        "☐ bater ponto se participou/ajudou no evento",
        "☐ registrar poderes caso tenha usado",
        "☐ conferir se a equipe ficou organizada",
        "☐ lembrar a galera sem deixar virar bagunça kkkkk",
        "",
        `⏰ **Horário do evento:** ${event.time}`,
      ].join("\n")
    )
    .setFooter({ text: "SantaCreators • Lembrete para responsáveis" })
    .setTimestamp();
}

function buildTeamTestEmbed(event) {
  return new EmbedBuilder()
    .setColor("#3498db")
    .setTitle("🧪 Teste de Notificação da Equipe")
    .setDescription(
      [
        "Esse é um teste do notifier de eventos da SantaCreators.",
        "",
        `🎯 **Evento:** ${event.eventName}`,
        `🏙️ **Cidade:** ${event.city}`,
        `⏰ **Horário:** ${event.time}`,
        "",
        "No automático, essa mensagem vira lembrete de bate-ponto/registro quando cair na janela certa.",
      ].join("\n")
    )
    .setFooter({ text: "SantaCreators • Teste de equipe" })
    .setTimestamp();
}

function buildPrepareEmbed(event, phase) {
  const title =
    phase === "PRE_60"
      ? "⏰ Falta 1 hora para o evento"
      : "🚨 Falta 30 minutos para o evento / hora do F3";

  return new EmbedBuilder()
    .setColor("#9b59b6")
    .setTitle(title)
    .setDescription(
      [
        `Eaiii ${phase === "PRE_30" ? "bora chamar geral pro F3?" : "já tá tudo organizado?"}`,
        "",
        checklistText(event),
        "",
        "Confere tudo com carinho pra não virar bagunça depois kkk 💜",
      ].join("\n")
    )
    .setTimestamp();
}

function buildDuringEmbed(event) {
  return new EmbedBuilder()
    .setColor("#f1c40f")
    .setTitle("🎬 Evento em andamento")
    .setDescription(
      [
        `O evento **${event.eventName}** da cidade **${event.city}** começou.`,
        "",
        "📋 **Checklist durante o evento:**",
        "",
        "☐ 👥 ADMs responsáveis acompanhando o evento.",
        "☐ 🎙️ Áudio e organização geral sob controle.",
        "☐ ⚡ Poderes usados apenas por quem realmente precisa.",
        "☐ 🧍 Participantes e equipe organizados.",
        "☐ 📌 Qualquer problema importante registrado para resolver no pós-evento.",
        "",
        `⏰ **Horário do evento:** ${event.time}`,
      ].join("\n")
    )
    .setFooter({ text: "SantaCreators • Checklist durante o evento" })
    .setTimestamp();
}

function buildPostChecklistEmbed(event) {
  return new EmbedBuilder()
    .setColor("#2ecc71")
    .setTitle("🏆 Checklist pós-evento")
    .setDescription(
      [
        `O evento **${event.eventName}** da cidade **${event.city}** já passou da fase principal.`,
        "",
        "Agora é obrigatório conferir o pós-evento:",
        "",
        "☐ ⭐ **Hall da Fama** registrado.",
        "☐ 👑 **VIP/premiações** solicitados.",
        "☐ 💳 **Pagamento do evento** liberado ou registrado.",
        "☐ ⚡ **Poderes removidos** de quem recebeu para o evento.",
        "☐ 📢 **GG oficial enviado na cidade** com vencedores/equipe vencedora.",
        "",
        "⚠️ Não deixa isso pra depois, porque é exatamente aqui que começa a virar bagunça kkk 💜",
      ].join("\n")
    )
    .setFooter({ text: "SantaCreators • Checklist pós-evento" })
    .setTimestamp();
}

function buildPointEmbed(event) {
  return new EmbedBuilder()
    .setColor("#f1c40f")
    .setTitle("🕒 Lembrete de Bate-Ponto")
    .setDescription(
      `eaiii <@${event.targetId}>, bora bater teu ponto do evento **${event.eventName}**? se você ajudou no evento atual, registra aí bonitinho pra eu parar de te lembrar kkkkk 💜`
    )
    .setTimestamp();
}

function buildPowerEmbed(event) {
  return new EmbedBuilder()
    .setColor("#3498db")
    .setTitle("⚡ Lembrete de Registro de Poderes")
    .setDescription(
[
  `Eaiii <@${event.targetId}>, td bm?? como tu tá? kkkkk 💜`,
  "",
  `Vi que você tem poderes e estava online no horário do evento **${event.eventName}**.`,
  "",
  `Tu participou desse evento e usou poderes?`,
  `Se sim, registra lá bonitinho pra eu não ficar te enchendo o saco kkkkk`,
  "",
  `Se você não participou / não usou / nem logou, registra também como **"não usei"** ou desconsidera se realmente não era contigo, Eriese kkkkkkkk`,
  "",
  `📌 Registro: <#1374066813171929218>`,
].join("\n")
    )
    .setTimestamp();
}

function buildRespReportEmbed(event, onlineMembers, offlineMembers) {
  const onlineText = onlineMembers.length
    ? onlineMembers.map((m) => `• ${m} — online`).join("\n").slice(0, 900)
    : "Ninguém online detectado.";

  const offlineText = offlineMembers.length
    ? offlineMembers.map((m) => `• ${m} — offline/invisível`).join("\n").slice(0, 900)
    : "Ninguém offline detectado.";

  return new EmbedBuilder()
    .setColor("#9b59b6")
    .setTitle("📊 Conferência de equipe do evento")
    .setDescription(
      [
        `🎯 **Evento:** ${event.eventName}`,
        `🏙️ **Cidade:** ${event.city}`,
        "",
        "**Online agora:**",
        onlineText,
        "",
        "**Offline/Invisível ignorados pelo sistema:**",
        offlineText,
      ].join("\n")
    )
    .setTimestamp();
}

async function runNotifierTick(client, options = {}) {
  const guild = client.guilds.cache.first();
  if (!guild) {
    console.log("[EventosChecklistNotifier] Nenhuma guilda encontrada.");
    return;
  }

  const forceTest = Boolean(options.forceTest);
  const testUserId = options.testUserId || null;

  const state = loadJson(NOTIFIER_STATE_FILE, { sent: {} });
  const events = getTodayEvents();

  if (events.length > 0) {
    console.log(`[EventosChecklistNotifier] Evento(s) encontrado(s): ${events.map(e => e.eventName).join(", ")}`);
  }

  for (const event of events) {
    const startTimes = extractAllTimesInMinutes(event.time);

    for (const start of startTimes) {
      const phase = forceTest ? "TESTE_MANUAL" : getPhase(start);

      if (!phase) {
        continue;
      }

      console.log(`[EventosChecklistNotifier] Fase detectada: ${phase} para ${event.eventName} às ${start}`);

      const uniqueBase = `${todayDateBR()}_${event.type}_${event.cityKey}_${event.eventName}_${start}_${phase}`;
      if (alreadySent(state, uniqueBase)) continue;

      const respRoles = [
        ROLES.RESPONSAVEIS,
        ROLES.RESP_CREATORS,
        ROLES.RESP_INFLU,
        ROLES.RESP_LIDER,
      ];

const equipeRoles = [
  ROLES.COORDENACAO_GERAL,
  ROLES.EQUIPE_CREATORS,
];

// ✅ SOMENTE esses cargos recebem como equipe:
// <@&1352385500614234134> Coordenação Geral
// <@&1352429001188180039> Equipe Creators

      const respMembers = await getMembersByRoles(guild, respRoles);
      const equipeMembers = await getMembersByRoles(guild, equipeRoles);

      const allTargetsMap = new Map();

      for (const member of equipeMembers) {
        allTargetsMap.set(member.id, member);
      }

      for (const member of respMembers) {
        allTargetsMap.set(member.id, member);
      }

const allTargets = [...allTargetsMap.values()];

const onlineEquipe = equipeMembers.filter(isOnline);
const offlineEquipe = equipeMembers.filter((m) => !isOnline(m));

      if (phase === "TESTE_MANUAL") {
        const testMember = testUserId ? await guild.members.fetch(testUserId).catch(() => null) : null;

        await sendProgressLog(
          client,
          "🧪 Teste manual iniciado",
          [
            `👤 **Acionado por:** ${testMember || testUserId || "desconhecido"}`,
            "",
            `🎯 **Evento:** ${event.eventName}`,
            `🏙️ **Cidade:** ${event.city}`,
            `⏰ **Horário do evento:** ${event.time}`,
            "",
            `👑 **Responsáveis encontrados:** ${respMembers.length}`,
            memberListText(respMembers),
            "",
            `👥 **Equipe encontrada:** ${equipeMembers.length}`,
            memberListText(equipeMembers),
            "",
            `🟢 **Equipe online detectada:** ${onlineEquipe.length}`,
            `⚫ **Equipe offline/invisível detectada:** ${offlineEquipe.length}`,
          ].join("\n")
        );

        if (!testMember) continue;

        const testEmbed = new EmbedBuilder()
          .setColor("#9b59b6")
          .setTitle("🧪 Teste Manual do Notifier")
          .setDescription(
            [
              "Funcionou! O sistema processou o evento, cargos, cidade e horários.",
              "",
              `🎯 **Evento:** ${event.eventName}`,
              `🏙️ **Cidade:** ${event.city}`,
              `⏰ **Horário Configurado:** ${event.time}`,
              `⏱️ **Minutos extraídos:** ${start}`,
              "",
              `👑 **Responsáveis encontrados:** ${respMembers.length}`,
              `👥 **Equipe encontrada:** ${equipeMembers.length}`,
              `🟢 **Equipe online:** ${onlineEquipe.length}`,
              `⚫ **Equipe offline/invisível:** ${offlineEquipe.length}`,
            ].join("\n")
          )
          .setFooter({ text: "SantaCreators • Teste manual do notifier" })
          .setTimestamp();

        await dm(client, testMember, testEmbed, event, "teste manual");

        let sentTest = 0;
        let failedTest = 0;

// ✅ Teste manual agora manda somente para quem clicou no botão.
// Isso evita floodar o servidor inteiro por acidente.
const embed = buildPersonalEmbed(testMember, event, "PRE_120");
const ok = await dm(client, testMember, embed, event, "teste manual personalizado");

if (ok) sentTest++;
else failedTest++;

        await sendProgressLog(
          client,
          "✅ Teste manual finalizado",
          [
            `🎯 **Evento:** ${event.eventName}`,
            `🏙️ **Cidade:** ${event.city}`,
            "",
            `✅ PVs enviados: **${sentTest}**`,
            `❌ PVs falharam: **${failedTest}**`,
            "",
            "📌 Cada PV enviado/falhado também caiu como log individual nesse canal.",
          ].join("\n"),
          "#2ecc71"
        );

        markSent(state, uniqueBase);
        continue;
      }

      let targetsToSend = [];

if (phase === "PRE_120" || phase === "PRE_60" || phase === "PRE_30") {
  const targetsMap = new Map();

  // ✅ Responsáveis recebem sempre, independentemente da presença
  for (const member of respMembers) {
    targetsMap.set(member.id, member);
  }

  // ✅ Equipe/Coordenação também recebe sempre, mesmo offline ou invisível
  for (const member of equipeMembers) {
    targetsMap.set(member.id, member);
  }

  targetsToSend = [...targetsMap.values()];
}

else if (phase === "DURANTE") {
  const targetsMap = new Map();

  for (const member of respMembers) {
    targetsMap.set(member.id, member);
  }

  for (const member of equipeMembers) {
    targetsMap.set(member.id, member);
  }

  targetsToSend = [...targetsMap.values()];
}

else if (phase === "PONTO_25") {
  const targetsMap = new Map();

  for (const member of respMembers) {
    targetsMap.set(member.id, member);
  }

  for (const member of equipeMembers) {
    targetsMap.set(member.id, member);
  }

  targetsToSend = [...targetsMap.values()];
}

else if (phase === "POS_CHECKLIST") {
  const targetsMap = new Map();

  for (const member of respMembers) {
    targetsMap.set(member.id, member);
  }

  for (const member of equipeMembers) {
    targetsMap.set(member.id, member);
  }

  targetsToSend = [...targetsMap.values()];
}

else if (phase === "POS_PODERES") {
  const targetsMap = new Map();

  for (const member of respMembers) {
    targetsMap.set(member.id, member);
  }

  for (const member of equipeMembers) {
    targetsMap.set(member.id, member);
  }

  targetsToSend = [...targetsMap.values()];
}

      let sent = 0;
      let failed = 0;
      let ignored = 0;

      const failedMembers = [];
      const sentMembers = [];
      const ignoredMembers = [];

      for (const member of targetsToSend) {
        if (phase === "PONTO_25") {
          const alreadyPunched =
            typeof globalThis.SC_BP_hasPunchedEffective === "function"
              ? globalThis.SC_BP_hasPunchedEffective(member.id)
              : false;

          if (alreadyPunched && !isResponsible(member)) {
            ignored++;
            ignoredMembers.push(member);
            continue;
          }
        }

        if (phase === "POS_PODERES" && !isResponsible(member)) {
          const registered =
            typeof globalThis.SC_PODERES_hasRegisteredLastHours === "function"
              ? await globalThis.SC_PODERES_hasRegisteredLastHours(client, member.id, 24)
              : false;

          if (registered) {
            ignored++;
            ignoredMembers.push(member);
            console.log(`[EventosChecklistNotifier] ${member.user.tag} já registrou poderes nas últimas 24h. Ignorando.`);
            continue;
          }
        }

        const embed = buildPersonalEmbed(member, event, phase);
        const ok = await dm(client, member, embed, event, phase);

        if (ok) {
          sent++;
          sentMembers.push(member);
        } else {
          failed++;
          failedMembers.push(member);
        }
      }

      const failedText = failedMembers.length
        ? failedMembers
            .map((member) => `• ${member} — ${member.user.tag} — cargos: ${getMemberRoleNames(member)}`)
            .join("\n")
            .slice(0, 1800)
        : "Nenhum PV falhou.";

      const sentText = sentMembers.length
        ? sentMembers
            .map((member) => `• ${member} — ${member.user.tag} — cargos: ${getMemberRoleNames(member)}`)
            .join("\n")
            .slice(0, 1800)
        : "Nenhum PV enviado.";

      const ignoredText = ignoredMembers.length
        ? ignoredMembers
            .map((member) => `• ${member} — ${member.user.tag} — cargos: ${getMemberRoleNames(member)}`)
            .join("\n")
            .slice(0, 1800)
        : "Nenhum membro ignorado.";

      await sendProgressLog(
        client,
        `📨 Notifier disparado · ${phase}`,
        [
          `🎯 **Evento:** ${event.eventName}`,
          `🏙️ **Cidade:** ${event.city}`,
          `⏰ **Horário:** ${event.time}`,
          "",
          `✅ **Receberam:** ${sent}`,
          `❌ **Não receberam:** ${failed}`,
          `⏭️ **Ignorados:** ${ignored}`,
          "",
          "✅ **Quem recebeu:**",
          sentText,
          "",
          "❌ **Quem não recebeu:**",
          failedText,
          "",
          "⏭️ **Ignorados:**",
          ignoredText,
          "",
          "📌 Nos logs individuais acima também aparece exatamente qual mensagem cada pessoa recebeu.",
        ].join("\n"),
        failed > 0 ? "#e74c3c" : "#2ecc71"
      );

      markSent(state, uniqueBase);
    }
  }

  saveJson(NOTIFIER_STATE_FILE, state);
}

async function runNotifierTickOld(client, options = {}) {
  console.log("[EventosChecklistNotifier] runNotifierTickOld chamado. Redirecionando para runNotifierTick atual.");
  return runNotifierTick(client, options);
}

async function sendTestPanel(client) {
  try {
    const channel = await client.channels.fetch(TEST_PANEL_CHANNEL_ID).catch((e) => {
      console.error("[EventosChecklistNotifier] erro ao buscar canal do painel:", e);
      return null;
    });

    if (!channel || !channel.isTextBased()) {
      console.log("[EventosChecklistNotifier] Canal do painel de teste não encontrado ou não é texto.");
      return;
    }

    const oldMessages = await channel.messages.fetch({ limit: 20 }).catch(() => null);

    if (oldMessages) {
      const alreadyPanel = oldMessages.find((msg) =>
        msg.author?.id === client.user.id &&
        msg.components?.some((row) =>
          row.components?.some((btn) => btn.customId === TEST_BUTTON_ID)
        )
      );

      if (alreadyPanel) {
        console.log("[EventosChecklistNotifier] Painel de teste já existe, não vou duplicar.");
        return;
      }
    }

  const embed = new EmbedBuilder()
    .setColor("#9b59b6")
    .setTitle("🧪 Teste do Notifier de Eventos")
    .setDescription(
      [
        "Clique no botão abaixo para testar o sistema de notificações agora.",
        "",
        "Esse teste força o `runNotifierTick(client)` manualmente.",
        "",
        "✅ Se tiver evento dentro da janela certa, ele tenta enviar os PVs.",
        "📋 Mesmo se não tiver evento/fase agora, ele vai registrar o teste no console.",
      ].join("\n")
    )
    .setFooter({ text: "SantaCreators • Painel de teste do notifier" })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(TEST_BUTTON_ID)
      .setLabel("Testar Notifier Agora")
      .setEmoji("🧪")
      .setStyle(ButtonStyle.Secondary)
  );

    await channel.send({
      embeds: [embed],
      components: [row],
    });

    console.log("[EventosChecklistNotifier] Painel de teste enviado.");
  } catch (e) {
    console.error("[EventosChecklistNotifier] erro real ao enviar painel de teste:", e);
  }
}

function canUseTestButton(member, userId) {
  if (TEST_ALLOWED_USERS.includes(userId)) return true;

  return TEST_ALLOWED_ROLES.some((roleId) => member?.roles?.cache?.has(roleId));
}

export async function eventosChecklistNotifierOnInteraction(interaction, client) {
  if (!interaction.isButton()) return false;
  if (interaction.customId !== TEST_BUTTON_ID) return false;

  if (!canUseTestButton(interaction.member, interaction.user.id)) {
    await interaction.reply({
      content: "❌ Você não tem permissão para usar esse botão de teste.",
      ephemeral: true,
    });
    return true;
  }

  await interaction.reply({
    content: "🧪 Teste iniciado. Vou rodar o notifier agora e registrar no console/log.",
    ephemeral: true,
  });

  console.log(`[EventosChecklistNotifier] Teste manual acionado por ${interaction.user.tag} (${interaction.user.id}).`);

  await runNotifierTick(client ?? interaction.client, {
    forceTest: true,
    testUserId: interaction.user.id,
  });

  console.log(`[EventosChecklistNotifier] Teste manual finalizado por ${interaction.user.tag} (${interaction.user.id}).`);

  return true;
}

export function eventosChecklistNotifierOnReady(client) {
  if (client.__SC_EVENT_CHECKLIST_NOTIFIER__) {
    console.log("[EventosChecklistNotifier] já iniciado, verificando painel de teste novamente.");

    sendTestPanel(client).catch((e) => {
      console.error("[EventosChecklistNotifier] erro ao verificar painel já iniciado:", e);
    });

    return;
  }

  client.__SC_EVENT_CHECKLIST_NOTIFIER__ = true;

  console.log("[EventosChecklistNotifier] iniciado.");

  sendTestPanel(client).catch((e) => {
    console.error("[EventosChecklistNotifier] erro ao enviar painel de teste:", e);
  });

  setTimeout(() => {
    sendTestPanel(client).catch((e) => {
      console.error("[EventosChecklistNotifier] erro ao reenviar painel de teste:", e);
    });
  }, 5000);

  runNotifierTick(client).catch((e) => {
    console.error("[EventosChecklistNotifier] erro no primeiro tick:", e);
  });

  setInterval(() => {
    runNotifierTick(client).catch((e) => {
      console.error("[EventosChecklistNotifier] erro:", e);
    });
  }, 60 * 1000);
}