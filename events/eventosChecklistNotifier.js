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
  COORD_CREATORS: "1352385500614234134",
  EQUIPE_CREATORS: "1352429001188180039",
};

const CITY_ROLES = {
  maresia: "1379021994678288465",
  grande: "1418691103397253322",
  santa: "1379021888709464168",
  nobre: "1379021805544804382",
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
  // Antes do evento
  if (diff <= 70 && diff > 45) return "PRE_60";
  if (diff <= 40 && diff > 10) return "PRE_30";

  // Durante o evento (nos primeiros 20 minutos)
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
  // Fallback se a Intent de Presença estiver desligada
  if (!member?.presence) {
    console.log(`[EventosChecklistNotifier] ⚠️ Sem cache de presence para ${member?.user?.tag}. Ignorando status.`);
    return true; 
  }
  const status = member?.presence?.status;
  const online = status === "online" || status === "idle" || status === "dnd";
  return online;
}

async function getMembersByRoles(guild, roleIds) {
  await guild.members.fetch().catch(() => null);

  const ids = new Set();

  for (const roleId of roleIds.filter(Boolean)) {
    const role = guild.roles.cache.get(roleId);
    if (!role) continue;

    for (const member of role.members.values()) {
      if (!member.user.bot) ids.add(member.id);
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
    await member.send({ embeds: [embed] });
    await logDmNotification(client, member, embed, "ENVIADO", event, type);
    return true;
  } catch {
    await logDmNotification(client, member, embed, "FALHOU", event, type);
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
      `eaiii <@${event.targetId}>, bora registrar teu uso de poderes no evento **${event.eventName}** pra eu parar de te encher o saco? vi que o evento já acabou e ainda falta esse registro kkkkk registra lá queridão que eu PARO de mandar mensagem, prometo 💜`
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
  if (events.length > 0) console.log(`[EventosChecklistNotifier] Evento(s) encontrado(s): ${events.map(e => e.eventName).join(", ")}`);
  
  const nowMinutes = minutesNowSP();

  for (const event of events) {
    // Extrai todos os horários possíveis (suporta "21:00 ou 00:00")
    const startTimes = extractAllTimesInMinutes(event.time);

    for (const start of startTimes) {
      const phase = forceTest ? "TESTE_MANUAL" : getPhase(start);

      if (!phase) {
        // console.log(`[EventosChecklistNotifier] Evento ${event.eventName} às ${event.time} fora das janelas.`);
        continue;
      }

      console.log(`[EventosChecklistNotifier] Fase detectada: ${phase} para ${event.eventName} às ${start}`);

      const uniqueBase = `${todayDateBR()}_${event.type}_${event.cityKey}_${event.eventName}_${start}_${phase}`;
      if (alreadySent(state, uniqueBase)) continue;

      const respRoles = [ROLES.RESP_CREATORS, ROLES.RESP_INFLU, ROLES.RESP_LIDER];
      const equipeRoles = [ROLES.COORD_CREATORS, ROLES.EQUIPE_CREATORS];

      const respMembers = await getMembersByRoles(guild, respRoles);
      const equipeMembers = await getMembersByRoles(guild, equipeRoles);

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
          ].join("\n")
        );

        if (!testMember) continue;

        const testEmbed = new EmbedBuilder()
          .setColor("#9b59b6")
          .setTitle("🧪 Teste Manual do Notifier")
          .setDescription(
            [
              "Funcionou! O sistema processou o evento e os horários corretamente.",
              "",
              `🎯 **Evento:** ${event.eventName}`,
              `🏙️ **Cidade:** ${event.city}`,
              `⏰ **Horário Configurado:** ${event.time}`,
              `⏱️ **Minutos extraídos:** ${start}`,
              "",
              `🟢 **Equipe considerada online:** ${onlineEquipe.length}`,
            ].join("\n")
          );

        await dm(client, testMember, testEmbed, event, "teste manual");

        const respReminderEmbed = buildRespReminderEmbed(event);
        const teamTestEmbed = buildTeamTestEmbed(event);

        for (const member of respMembers) {
          await dm(client, member, respReminderEmbed, event, "teste manual responsáveis");
        }

        for (const member of equipeMembers) {
          await dm(client, member, teamTestEmbed, event, "teste manual equipe");
        }

        await sendProgressLog(
          client,
          "✅ Teste manual finalizado",
          `🎯 **Evento:** ${event.eventName}\n\nPVs de teste enviados para equipe e responsáveis.`
        );
        
        markSent(state, uniqueBase);
        continue;
      }

      // Lógica de envio real das fases
      if (phase === "PRE_60" || phase === "PRE_30") {
        const embed = buildPrepareEmbed(event, phase);
        for (const member of respMembers.filter(isOnline)) {
          await dm(client, member, embed, event, phase);
        }
      } 
      else if (phase === "DURANTE") {
        const duringEmbed = buildDuringEmbed(event);
        for (const member of respMembers.filter(isOnline)) {
          await dm(client, member, duringEmbed, event, "durante");
        }
      }
      else if (phase === "PONTO_25") {
        const reportEmbed = buildRespReportEmbed(event, onlineEquipe, offlineEquipe);
        for (const member of onlineEquipe) {
          if (!globalThis.SC_BP_hasPunchedEffective?.(member.id)) {
            const pointEmbed = buildPointEmbed({ ...event, targetId: member.id });
            await dm(client, member, pointEmbed, event, "ponto");
          }
        }
        for (const resp of respMembers.filter(isOnline)) {
          await dm(client, resp, reportEmbed, event, "relatório");
        }
      }
      else if (phase === "POS_CHECKLIST") {
        const postEmbed = buildPostChecklistEmbed(event);
        for (const member of respMembers.filter(isOnline)) {
          await dm(client, member, postEmbed, event, "pós-checklist");
        }
      }
      else if (phase === "POS_PODERES") {
        for (const member of onlineEquipe) {
          if (!globalThis.SC_EVENT_POWER_hasRegistered?.(member.id, event.eventName, todayDateBR())) {
            const powerEmbed = buildPowerEmbed({ ...event, targetId: member.id });
            await dm(client, member, powerEmbed, event, "poderes");
          }
        }
      }

      markSent(state, uniqueBase);
    }
  }

  saveJson(NOTIFIER_STATE_FILE, state);
}

async function runNotifierTickOld(client, options = {}) {
  const guild = client.guilds.cache.first();
  if (!guild) {
    console.log("[EventosChecklistNotifier] Nenhuma guilda encontrada.");
    return;
  }

  const forceTest = Boolean(options.forceTest);
  const testUserId = options.testUserId || null;

  const state = loadJson(NOTIFIER_STATE_FILE, { sent: {} });
  const events = getTodayEvents();
  if (events.length > 0) console.log(`[EventosChecklistNotifier] Evento(s) encontrado(s): ${events.map(e => e.eventName).join(", ")}`);

  for (const event of events) {
    const start = hmToMinutes(event.time);
    if (start === null) continue;

    const phase = forceTest ? "TESTE_MANUAL" : getPhase(start);

    if (!phase) {
      console.log(`[EventosChecklistNotifier] Evento ${event.eventName} encontrado, mas fora das janelas de notificação agora.`);
      continue;
    }

    console.log(`[EventosChecklistNotifier] Fase detectada: ${phase} para o evento ${event.eventName}`);

    const uniqueBase = `${todayDateBR()}_${event.type}_${event.cityKey}_${event.eventName}_${phase}`;
    if (alreadySent(state, uniqueBase)) continue;

    const cityRole = CITY_ROLES[event.cityKey];

    const respRoles = [
      ROLES.RESP_CREATORS,
      ROLES.RESP_INFLU,
      ROLES.RESP_LIDER,
    ];

    const equipeRoles = [
      ROLES.COORD_CREATORS,
      ROLES.EQUIPE_CREATORS,
    ];

    const respMembers = await getMembersByRoles(guild, respRoles);
    const equipeMembers = await getMembersByRoles(guild, equipeRoles);

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
          `⏰ **Horário:** ${event.time}`,
          "",
          `👑 **Responsáveis encontrados:** ${respMembers.length}`,
          memberListText(respMembers),
          "",
          `👥 **Equipe encontrada:** ${equipeMembers.length}`,
          memberListText(equipeMembers),
        ].join("\n"),
        "#9b59b6"
      );

      if (!testMember) {
        console.log("[EventosChecklistNotifier] Teste manual acionado, mas não consegui encontrar o membro que clicou.");
        continue;
      }

      const testEmbed = new EmbedBuilder()
        .setColor("#9b59b6")
        .setTitle("🧪 Teste Manual do Notifier")
        .setDescription(
          [
            "Funcionou, Macedo! O botão conseguiu forçar um teste manual do notifier.",
            "",
            `🎯 **Evento encontrado:** ${event.eventName}`,
            `🏙️ **Cidade:** ${event.city}`,
            `⏰ **Horário do evento:** ${event.time}`,
            "",
            `👑 **Responsáveis encontrados:** ${respMembers.length}`,
            `👥 **Equipe encontrada:** ${equipeMembers.length}`,
            `🟢 **Equipe considerada online:** ${onlineEquipe.length}`,
            "",
            "📌 **Cargos considerados responsáveis:**",
            `• Resp Creators — \`${ROLES.RESP_CREATORS}\``,
            `• Resp Influ — \`${ROLES.RESP_INFLU}\``,
            `• Resp Líder — \`${ROLES.RESP_LIDER}\``,
            "",
            "📌 **Cargos considerados equipe:**",
            `• Coordenação — \`${ROLES.COORD_CREATORS}\``,
            `• Equipe Creators — \`${ROLES.EQUIPE_CREATORS}\``,
            "",
            "⚠️ O motivo de não enviar antes era simples:",
            "`o evento foi encontrado, mas o horário atual não estava dentro de nenhuma janela de disparo.`",
          ].join("\n")
        )
        .setFooter({ text: "SantaCreators • Teste manual do notifier" })
        .setTimestamp();

      await dm(client, testMember, testEmbed, event, "teste manual");

      const respReminderEmbed = buildRespReminderEmbed(event);
      const teamTestEmbed = buildTeamTestEmbed(event);

      let sentResp = 0;
      let failResp = 0;
      let sentTeam = 0;
      let failTeam = 0;

      for (const member of respMembers) {
        const ok = await dm(client, member, respReminderEmbed, event, "teste manual responsáveis");
        if (ok) sentResp++;
        else failResp++;
      }

      for (const member of equipeMembers) {
        const ok = await dm(client, member, teamTestEmbed, event, "teste manual equipe");
        if (ok) sentTeam++;
        else failTeam++;
      }

      await sendProgressLog(
        client,
        "✅ Teste manual finalizado",
        [
          `🎯 **Evento:** ${event.eventName}`,
          `🏙️ **Cidade:** ${event.city}`,
          "",
          `👤 **Teste enviado para quem clicou:** ${testMember}`,
          "",
          `👑 **Responsáveis:**`,
          `✅ Enviados: **${sentResp}**`,
          `❌ Falharam: **${failResp}**`,
          "",
          `👥 **Equipe:**`,
          `✅ Enviados: **${sentTeam}**`,
          `❌ Falharam: **${failTeam}**`,
          "",
          "📌 Cada PV enviado/falhado também cai como log individual nesse canal.",
        ].join("\n"),
        "#2ecc71"
      );

      console.log(`[EventosChecklistNotifier] Teste manual enviado para ${testMember.user.tag}.`);
      continue;
    }

    if (phase === "PRE_60" || phase === "PRE_30") {
      const embed = buildPrepareEmbed(event, phase);

      let sent = 0;
      let failed = 0;

      for (const member of respMembers.filter(isOnline)) {
        const ok = await dm(client, member, embed, event, phase === "PRE_60" ? "pré-evento" : "F3");
        if (ok) sent++;
        else failed++;

        console.log(`[EventosChecklistNotifier] PV enviado (${phase}) para ${member.user.tag}`);
      }

      await sendProgressLog(
        client,
        `📋 Checklist pré-evento disparado · ${phase}`,
        [
          `🎯 **Evento:** ${event.eventName}`,
          `🏙️ **Cidade:** ${event.city}`,
          `⏰ **Horário:** ${event.time}`,
          "",
          `✅ **Enviados:** ${sent}`,
          `❌ **Falharam:** ${failed}`,
          "",
          "📌 Tipo de envio: responsáveis online.",
        ].join("\n"),
        "#9b59b6"
      );
    }

    if (phase === "DURANTE") {
      const duringEmbed = buildDuringEmbed(event);

      let sent = 0;
      let failed = 0;

      for (const member of respMembers.filter(isOnline)) {
        const ok = await dm(client, member, duringEmbed, event, "durante evento");
        if (ok) sent++;
        else failed++;

        console.log(`[EventosChecklistNotifier] PV enviado (Durante) para ${member.user.tag}`);
      }

      await sendProgressLog(
        client,
        "🎬 Checklist durante o evento disparado",
        [
          `🎯 **Evento:** ${event.eventName}`,
          `🏙️ **Cidade:** ${event.city}`,
          `⏰ **Horário:** ${event.time}`,
          "",
          `✅ **Enviados:** ${sent}`,
          `❌ **Falharam:** ${failed}`,
          "",
          "📌 Tipo de envio: responsáveis online.",
        ].join("\n"),
        "#f1c40f"
      );
    }

    if (phase === "PONTO_25") {
      const reportEmbed = buildRespReportEmbed(event, onlineEquipe, offlineEquipe);

      let sentPoint = 0;
      let failedPoint = 0;
      let ignoredPoint = 0;
      let sentReport = 0;
      let failedReport = 0;

      for (const member of onlineEquipe) {
        const already = globalThis.SC_BP_hasPunchedEffective?.(member.id);

        if (!already) {
          const pointEmbed = buildPointEmbed({ ...event, targetId: member.id });
          const ok = await dm(client, member, pointEmbed, event, "bate-ponto");

          if (ok) sentPoint++;
          else failedPoint++;

          console.log(`[EventosChecklistNotifier] PV enviado (Ponto) para ${member.user.tag}`);
        } else {
          ignoredPoint++;
          console.log(`[EventosChecklistNotifier] Usuário ${member.user.tag} já bateu ponto, ignorando.`);
        }
      }

      for (const resp of respMembers.filter(isOnline)) {
        const ok = await dm(client, resp, reportEmbed, event, "Relatório Responsáveis");

        if (ok) sentReport++;
        else failedReport++;
      }

      await sendProgressLog(
        client,
        "🕒 Lembrete de bate-ponto disparado",
        [
          `🎯 **Evento:** ${event.eventName}`,
          `🏙️ **Cidade:** ${event.city}`,
          "",
          "👥 **Equipe:**",
          `✅ PVs enviados: **${sentPoint}**`,
          `❌ PVs falharam: **${failedPoint}**`,
          `⏭️ Ignorados por já terem batido ponto: **${ignoredPoint}**`,
          "",
          "👑 **Relatório para responsáveis:**",
          `✅ Enviados: **${sentReport}**`,
          `❌ Falharam: **${failedReport}**`,
        ].join("\n"),
        "#f1c40f"
      );
    }

    if (phase === "POS_CHECKLIST") {
      const postEmbed = buildPostChecklistEmbed(event);

      let sent = 0;
      let failed = 0;

      for (const member of respMembers.filter(isOnline)) {
        const ok = await dm(client, member, postEmbed, event, "checklist pós-evento");

        if (ok) sent++;
        else failed++;

        console.log(`[EventosChecklistNotifier] PV enviado (Pós-evento) para ${member.user.tag}`);
      }

      await sendProgressLog(
        client,
        "🏆 Checklist pós-evento disparado",
        [
          `🎯 **Evento:** ${event.eventName}`,
          `🏙️ **Cidade:** ${event.city}`,
          `⏰ **Horário:** ${event.time}`,
          "",
          `✅ **Enviados:** ${sent}`,
          `❌ **Falharam:** ${failed}`,
          "",
          "📌 Cobrança enviada para responsáveis online.",
        ].join("\n"),
        "#2ecc71"
      );
    }

    if (phase === "POS_PODERES") {
      let sentPower = 0;
      let failedPower = 0;
      let ignoredPower = 0;

      for (const member of onlineEquipe) {
        // Normalização de nome de evento para busca segura na memória global
        const eventSearchName = event.eventName.toLowerCase().trim();

        const hasPower = globalThis.SC_EVENT_POWER_hasRegistered?.(
          member.id,
          eventSearchName,
          todayDateBR()
        );

        if (!hasPower) {
          const powerEmbed = buildPowerEmbed({ ...event, targetId: member.id });
          const ok = await dm(client, member, powerEmbed, event, "registro de poderes");

          if (ok) sentPower++;
          else failedPower++;

          console.log(`[EventosChecklistNotifier] PV enviado (Poderes) para ${member.user.tag}`);
        } else {
          ignoredPower++;
          console.log(`[EventosChecklistNotifier] Usuário ${member.user.tag} já registrou poderes, ignorando.`);
        }
      }

      await sendProgressLog(
        client,
        "⚡ Cobrança de registro de poderes disparada",
        [
          `🎯 **Evento:** ${event.eventName}`,
          `🏙️ **Cidade:** ${event.city}`,
          "",
          `✅ PVs enviados: **${sentPower}**`,
          `❌ PVs falharam: **${failedPower}**`,
          `⏭️ Ignorados por já terem registrado: **${ignoredPower}**`,
        ].join("\n"),
        "#3498db"
      );
    }

    markSent(state, uniqueBase);
    saveJson(NOTIFIER_STATE_FILE, state);
  }
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