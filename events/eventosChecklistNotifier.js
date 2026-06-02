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

function hmToMinutes(hm) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hm || "").trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
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

function getPhase(eventStartMinutes) {
  const now = minutesNowSP();

  // Janelas de 5 minutos para evitar repetição no mesmo ciclo
  if (now >= eventStartMinutes - 60 && now < eventStartMinutes - 55) return "PRE_60";
  if (now >= eventStartMinutes - 30 && now < eventStartMinutes - 25) return "PRE_30";
  if (now >= eventStartMinutes + 25 && now < eventStartMinutes + 30) return "PONTO_25";
  if (now >= eventStartMinutes + 60 && now < eventStartMinutes + 65) return "POS_60";
  if (now >= eventStartMinutes + 80 && now < eventStartMinutes + 85) return "POS_80";
  if (now >= eventStartMinutes + 100 && now < eventStartMinutes + 105) return "POS_100";

  return null;
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

async function runNotifierTick(client) {
  const guild = client.guilds.cache.first();
  if (!guild) {
    console.log("[EventosChecklistNotifier] Nenhuma guilda encontrada.");
    return;
  }

  const state = loadJson(NOTIFIER_STATE_FILE, { sent: {} });
  const events = getTodayEvents();
  if (events.length > 0) console.log(`[EventosChecklistNotifier] Evento(s) encontrado(s): ${events.map(e => e.eventName).join(", ")}`);

  for (const event of events) {
    const start = hmToMinutes(event.time);
    if (start === null) continue;

    const phase = getPhase(start);
    if (!phase) continue;
    console.log(`[EventosChecklistNotifier] Fase detectada: ${phase} para o evento ${event.eventName}`);

    const uniqueBase = `${todayDateBR()}_${event.type}_${event.cityKey}_${event.eventName}_${phase}`;
    if (alreadySent(state, uniqueBase)) continue;

    const cityRole = CITY_ROLES[event.cityKey];

    const respRoles =
      event.cityKey === "nobre"
        ? [ROLES.RESP_CREATORS, ROLES.RESP_INFLU, ROLES.RESP_LIDER]
        : [ROLES.RESP_CREATORS, ROLES.RESP_INFLU, ROLES.RESP_LIDER, cityRole];

    const equipeRoles = [ROLES.EQUIPE_CREATORS, cityRole];

    const respMembers = await getMembersByRoles(guild, respRoles);
    const equipeMembers = await getMembersByRoles(guild, equipeRoles);

    const onlineEquipe = equipeMembers.filter(isOnline);
    const offlineEquipe = equipeMembers.filter((m) => !isOnline(m));

    if (phase === "PRE_60" || phase === "PRE_30") {
      const embed = buildPrepareEmbed(event, phase);

      for (const member of respMembers.filter(isOnline)) {
        await dm(client, member, embed, event, phase === "PRE_60" ? "pré-evento" : "F3");
        console.log(`[EventosChecklistNotifier] PV enviado (${phase}) para ${member.user.tag}`);
      }
    }

    if (phase === "PONTO_25") {
      const reportEmbed = buildRespReportEmbed(event, onlineEquipe, offlineEquipe);

      for (const member of onlineEquipe) {
        const already = globalThis.SC_BP_hasPunchedEffective?.(member.id);
        if (!already) {
          const pointEmbed = buildPointEmbed({...event, targetId: member.id});
          await dm(client, member, pointEmbed, event, "bate-ponto");
          console.log(`[EventosChecklistNotifier] PV enviado (Ponto) para ${member.user.tag}`);
        } else {
          console.log(`[EventosChecklistNotifier] Usuário ${member.user.tag} já bateu ponto, ignorando.`);
        }
      }

      for (const resp of respMembers.filter(isOnline)) {
        await dm(client, resp, reportEmbed, event, "Relatório Responsáveis");
      }
    }

    if (phase === "POS_60" || phase === "POS_80" || phase === "POS_100") {
      for (const member of onlineEquipe) {
        // Normalização de nome de evento para busca segura na memória global
        const eventSearchName = event.eventName.toLowerCase().trim();
        
        const hasPower = globalThis.SC_EVENT_POWER_hasRegistered?.(
          member.id,
          eventSearchName,
          todayDateBR()
        );

        if (!hasPower) {
          const powerEmbed = buildPowerEmbed({...event, targetId: member.id});
          await dm(client, member, powerEmbed, event, "registro de poderes");
          console.log(`[EventosChecklistNotifier] PV enviado (Poderes) para ${member.user.tag}`);
        } else {
          console.log(`[EventosChecklistNotifier] Usuário ${member.user.tag} já registrou poderes, ignorando.`);
        }
      }
    }

    markSent(state, uniqueBase);
    saveJson(NOTIFIER_STATE_FILE, state);
  }
}

async function sendTestPanel(client) {
  const channel = await client.channels.fetch(TEST_PANEL_CHANNEL_ID).catch(() => null);

  if (!channel || !channel.isTextBased()) {
    console.log("[EventosChecklistNotifier] Canal do painel de teste não encontrado ou não é texto.");
    return;
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
}

function canUseTestButton(member, userId) {
  if (TEST_ALLOWED_USERS.includes(userId)) return true;

  return TEST_ALLOWED_ROLES.some((roleId) => member?.roles?.cache?.has(roleId));
}

export async function eventosChecklistNotifierOnInteraction(interaction, client) {
  if (!interaction.isButton()) return;
  if (interaction.customId !== TEST_BUTTON_ID) return;

  if (!canUseTestButton(interaction.member, interaction.user.id)) {
    await interaction.reply({
      content: "❌ Você não tem permissão para usar esse botão de teste.",
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({
    content: "🧪 Teste iniciado. Vou rodar o notifier agora e registrar no console/log.",
    ephemeral: true,
  });

  console.log(`[EventosChecklistNotifier] Teste manual acionado por ${interaction.user.tag} (${interaction.user.id}).`);

  await runNotifierTick(client ?? interaction.client);

  console.log(`[EventosChecklistNotifier] Teste manual finalizado por ${interaction.user.tag} (${interaction.user.id}).`);
}

export function eventosChecklistNotifierOnReady(client) {
  if (client.__SC_EVENT_CHECKLIST_NOTIFIER__) return;
  client.__SC_EVENT_CHECKLIST_NOTIFIER__ = true;

  console.log("[EventosChecklistNotifier] iniciado.");

  sendTestPanel(client).catch((e) => {
    console.error("[EventosChecklistNotifier] erro ao enviar painel de teste:", e);
  });

  runNotifierTick(client).catch((e) => {
    console.error("[EventosChecklistNotifier] erro no primeiro tick:", e);
  });

  setInterval(() => {
    runNotifierTick(client).catch((e) => {
      console.error("[EventosChecklistNotifier] erro:", e);
    });
  }, 60 * 1000);
}