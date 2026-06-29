import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EmbedBuilder, AttachmentBuilder } from "discord.js";
import sharp from "sharp";
import { dashOn } from "../utils/dashHub.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TZ = "America/Sao_Paulo";

const DASHBOARD_CHANNEL_ID = "1521217298126340136";
const LOG_CHANNEL_ID = "1521218191869739310";

const ROLE_SANTA_CREATORS = "1352275728476930099";
const ROLE_CIDADAO = "1262978759922028575";

function pickPersistRoot() {
  const candidates = [
    process.env.SQUARECLOUD_STORAGE_PATH?.trim(),
    "/storage",
    "/home/container/storage",
    "/home/squarecloud/storage",
  ].filter(Boolean);

  for (const dir of candidates) {
    try {
      if (fs.existsSync(dir)) return dir;
    } catch {}
  }

  return null;
}

const DATA_DIR = path.resolve(pickPersistRoot() || path.join(__dirname, ".."), "data");
const FALLBACK_DATA_DIR = path.resolve(__dirname, "../data");

function dataFile(name) {
  const primary = path.join(DATA_DIR, name);
  const fallback = path.join(FALLBACK_DATA_DIR, name);

  if (fs.existsSync(primary)) return primary;
  if (fs.existsSync(fallback)) return fallback;

  return primary;
}

const STATE_FILE = dataFile("meta_interna_semanal_state.json");
const CRONO_FILE = dataFile("cronograma_state.json");
const BP_DIR = fs.existsSync(path.join(DATA_DIR, "sc_bp_monthly"))
  ? path.join(DATA_DIR, "sc_bp_monthly")
  : path.join(FALLBACK_DATA_DIR, "sc_bp_monthly");
const VENDAS_FILE = dataFile("vendas_state.json");
const GERAL_WEEKLY_SOURCES_FILE = dataFile("sc_geral_weekly_rank_sources.json");

const DASH_MARKER = "SC_META_INTERNA_SEMANAL::V1";

const PESOS = {
  eventos: 25,
  pontos: 20,
  poderesDias: 10,
  orgs: 10,
  confirmacoes: 10,
  doacoes: 5,
  vendas: 5,
  dmLideres: 5,
  pagamentos: 5,
  eventosDiarios: 5,
};

const METAS = {
  eventosRatio: 0.9,
  pontos: 50,
  poderesDias: 6,
  orgs: 10,
  confirmacoes: 10,
  doacoes: 2,
  vendas: 1,
  dmLideres: 1,
  pagamentos: 2,
  eventosDiarios: 1,
};

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  ensureDir();
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

function nowSP() {
  return new Date();
}

function ymdSP(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  return {
    y: Number(parts.find((p) => p.type === "year")?.value || 0),
    m: Number(parts.find((p) => p.type === "month")?.value || 0),
    d: Number(parts.find((p) => p.type === "day")?.value || 0),
  };
}

function startOfDaySP(date) {
  const { y, m, d } = ymdSP(date);
  return new Date(Date.UTC(y, m - 1, d, 3, 0, 0));
}

function dowSP(date) {
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "short",
  }).format(date);

  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[wd] ?? 0;
}

function addDays(d, n) {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

function dateKeySP(date) {
  return date.toISOString().slice(0, 10);
}

function labelDateSP(date) {
  return date.toLocaleDateString("pt-BR", { timeZone: TZ });
}

function getWeekInfo() {
  const now = nowSP();
  const todayStart = startOfDaySP(now);
  const day = dowSP(now);
  const sunday = addDays(todayStart, -day);
  const saturday = addDays(sunday, 6);
  const end = addDays(sunday, 7);
  const weekKey = dateKeySP(sunday);

  return {
    weekKey,
    start: sunday,
    saturday,
    end,
    label: `${labelDateSP(sunday)} até ${labelDateSP(saturday)}`,
  };
}

function loadState() {
  const week = getWeekInfo();
  const state = readJson(STATE_FILE, {
    weekKey: week.weekKey,
    dashboardMessageId: null,
    logMessageId: null,
    users: {},
  });

  if (state.weekKey !== week.weekKey) {
    return {
      weekKey: week.weekKey,
      dashboardMessageId: null,
      logMessageId: null,
      users: {},
    };
  }

  state.users ||= {};
  return state;
}

function saveState(state) {
  writeJson(STATE_FILE, state);
}

function ensureUser(state, userId) {
  state.users[userId] ||= {
    orgs: [],
    confirmacoes: [],
    poderesEventos: [],
    poderesDias: {},
    doacoes: [],
    vendas: [],
    dmLideres: [],
    pagamentos: [],
    eventosDiarios: [],
  };

  return state.users[userId];
}

function pushUnique(arr, item, key) {
  if (!arr.some((x) => x.key === key)) arr.push({ ...item, key });
}

function resolveSourceUserId(extra = {}) {
  return (
    extra.userId ||
    extra.pointsOwnerId ||
    extra.managerId ||
    extra.registradorId ||
    extra.creatorId ||
    extra.createdBy ||
    extra.targetId ||
    extra.by ||
    extra.byUserId ||
    null
  );
}

function isAtInCurrentWeek(at) {
  const week = getWeekInfo();
  const n = Number(at || 0);
  return n >= week.start.getTime() && n < week.end.getTime();
}

function keepOnlyCurrentWeekUsers(users = {}) {
  const out = {};

  for (const [userId, data] of Object.entries(users || {})) {
    const next = {
      orgs: [],
      confirmacoes: [],
      poderesEventos: [],
      poderesDias: {},
      doacoes: [],
      vendas: [],
      dmLideres: [],
      pagamentos: [],
      eventosDiarios: [],
    };

    for (const key of ["orgs", "confirmacoes", "poderesEventos", "doacoes", "vendas", "dmLideres", "pagamentos", "eventosDiarios"]) {
      next[key] = (Array.isArray(data?.[key]) ? data[key] : []).filter((x) => isAtInCurrentWeek(x.at));
    }

    for (const [dayKey, value] of Object.entries(data?.poderesDias || {})) {
      if (value) next.poderesDias[dayKey] = true;
    }

    out[userId] = next;
  }

  return out;
}

function registerSource(userId, source, extra = {}) {
  const resolvedUserId = userId || resolveSourceUserId(extra);
  if (!resolvedUserId) return;

  const state = loadState();
  const user = ensureUser(state, String(resolvedUserId));
  const at = Number(extra.__at || extra.at || Date.now());

  if (!isAtInCurrentWeek(at)) return;

  const stableId =
    extra.dedupeKey ||
    extra.messageId ||
    extra.msgId ||
    extra.newMessageId ||
    extra.oldMessageId ||
    extra.channelId ||
    `${source}:${resolvedUserId}:${at}`;

  const key = `${source}:${stableId}`;

  if (source === "orgs") pushUnique(user.orgs, { at }, key);
  if (source === "confirmacoes") pushUnique(user.confirmacoes, { at }, key);
  if (source === "poderesEventos") pushUnique(user.poderesEventos, { at, evento: extra.evento || null }, key);
  if (source === "poderesDias") {
    const dayKey = new Date(at).toLocaleDateString("en-CA", { timeZone: TZ });
    user.poderesDias[dayKey] = true;
  }
  if (source === "doacoes") pushUnique(user.doacoes, { at }, key);
  if (source === "vendas") pushUnique(user.vendas, { at }, key);
  if (source === "dmLideres") pushUnique(user.dmLideres, { at }, key);
  if (source === "pagamentos") pushUnique(user.pagamentos, { at }, key);
  if (source === "eventosDiarios") pushUnique(user.eventosDiarios, { at }, key);

  saveState(state);
}

function setupDashHooks(client) {
  if (client.__SC_META_INTERNA_HOOKS__) return;
  client.__SC_META_INTERNA_HOOKS__ = true;

dashOn("rm:approved", (p = {}) => registerSource(null, "orgs", p));
dashOn("presenca:confirmada", (p = {}) => registerSource(null, "confirmacoes", p));
dashOn("eventopoder:registrado", (p = {}) => registerSource(null, "poderesEventos", p));
dashOn("poderes:registrado", (p = {}) => registerSource(null, "poderesDias", p));
dashOn("doacao:registrada", (p = {}) => registerSource(null, "doacoes", p));
dashOn("venda:registrada", (p = {}) => registerSource(null, "vendas", p));
dashOn("lideres:convite_enviado", (p = {}) => registerSource(null, "dmLideres", p));
dashOn("pagamento:pago", (p = {}) => registerSource(null, "pagamentos", p));
dashOn("eventosdiarios:aprovado", (p = {}) => registerSource(null, "eventosDiarios", p));
}

function parseTimes(str) {
  return [...String(str || "").matchAll(/\b(\d{1,2})[:h](\d{2})?\b/g)]
    .map((m) => `${String(m[1]).padStart(2, "0")}:${String(m[2] || "00").padStart(2, "0")}`);
}

function buildCronogramaEventos() {
  const crono = readJson(CRONO_FILE, null);
  if (!crono) return [];

  const week = getWeekInfo();
  const dayKeys = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
  const eventos = [];

  function dateForDayKey(key) {
    const idx = dayKeys.indexOf(key);
    return addDays(week.start, idx);
  }

  function addFromGroup(groupName) {
    const group = crono[groupName] || {};
    for (const [dayKey, item] of Object.entries(group)) {
      if (!item?.active) continue;

      const times = parseTimes(item.time);
      if (!times.length) continue;

      const hasOu = String(item.time || "").toLowerCase().includes("ou");

      if (hasOu) {
        eventos.push({
          key: `${groupName}:${dayKey}:alt`,
          dayKey,
          date: dateForDayKey(dayKey),
          city: item.city || "—",
          eventName: item.eventName || "—",
          times,
        });
      } else {
        for (const time of times) {
          eventos.push({
            key: `${groupName}:${dayKey}:${time}`,
            dayKey,
            date: dateForDayKey(dayKey),
            city: item.city || "—",
            eventName: item.eventName || "—",
            times: [time],
          });
        }
      }
    }
  }

  addFromGroup("schedule");
  addFromGroup("madrugada");

  return eventos
    .sort((a, b) => a.date - b.date)
    .slice(0, 10);
}

function parseBpTime(timeStr) {
  const m = String(timeStr || "").match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (!m) return null;

  const [, dd, mm, yyyy, hh, mi] = m;
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(mi), 0, 0);
}

function setTime(baseDate, hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(baseDate);
  d.setHours(h, m, 0, 0);
  return d;
}

function validWindowForEvento(evento, time) {
  if (time === "21:00") {
    return {
      start: setTime(evento.date, "19:00"),
      end: setTime(evento.date, "22:30"),
    };
  }

  return {
    start: setTime(evento.date, "23:30"),
    end: setTime(addDays(evento.date, 1), "01:00"),
  };
}

function loadBpEntriesForWeek() {
  const week = getWeekInfo();
  const monthKeys = new Set([
    `${week.start.getFullYear()}-${String(week.start.getMonth() + 1).padStart(2, "0")}`,
    `${week.end.getFullYear()}-${String(week.end.getMonth() + 1).padStart(2, "0")}`,
  ]);

  const entries = [];

  for (const monthKey of monthKeys) {
    const file = path.join(BP_DIR, `${monthKey}.json`);
    const data = readJson(file, { days: {} });

    for (const arr of Object.values(data.days || {})) {
      for (const e of Array.isArray(arr) ? arr : []) {
        const dt = parseBpTime(e.time);
        if (!dt) continue;
        if (dt >= week.start && dt < week.end) {
          entries.push({
            userId: String(e.uid),
            time: e.time,
            dt,
          });
        }
      }
    }
  }

  return entries;
}

function countPresencasEventos(userId, eventos, bpEntries) {
  const userBp = bpEntries.filter((e) => e.userId === String(userId));
  let presentes = 0;

  for (const evento of eventos) {
    let ok = false;

    for (const t of evento.times) {
      const win = validWindowForEvento(evento, t);
      if (userBp.some((bp) => bp.dt >= win.start && bp.dt <= win.end)) {
        ok = true;
        break;
      }
    }

    if (ok) presentes++;
  }

  return presentes;
}

function injectVendasFromFile(state) {
  const week = getWeekInfo();
  const vendas = readJson(VENDAS_FILE, { sales: {} });

  for (const [userId, data] of Object.entries(vendas.sales || {})) {
    const user = ensureUser(state, userId);

    for (const h of Array.isArray(data.history) ? data.history : []) {
      const at = Number(h.ts || 0);
      if (!at || at < week.start.getTime() || at >= week.end.getTime()) continue;

      pushUnique(user.vendas, { at }, `vendas-file:${userId}:${at}:${h.value || 0}`);
    }
  }
}

function pushManyVirtual(arr, count, prefix) {
  const total = Math.max(0, Number(count || 0));

  for (let i = 0; i < total; i++) {
    pushUnique(arr, { at: Date.now(), virtual: true }, `${prefix}:${i + 1}`);
  }
}

function injectGeralWeeklySources(state) {
  const week = getWeekInfo();
  const all = readJson(GERAL_WEEKLY_SOURCES_FILE, {});
  const sources = all?.[week.weekKey] || {};

  console.log("[MetaInternaSemanal] Arquivo de fontes:", {
    file: GERAL_WEEKLY_SOURCES_FILE,
    exists: fs.existsSync(GERAL_WEEKLY_SOURCES_FILE),
    weekKey: week.weekKey,
    semanasDisponiveis: Object.keys(all || {}).slice(-5),
  });

  const userIds = Object.keys(sources || {});

  console.log("[MetaInternaSemanal] Fontes semanais carregadas:", {
    weekKey: week.weekKey,
    usuariosComFonte: userIds.length,
  });

  for (const [userIdRaw, bySource] of Object.entries(sources || {})) {
    const userId = String(userIdRaw || "").trim();
    if (!userId || !bySource || typeof bySource !== "object") continue;

    const user = ensureUser(state, userId);

    for (const [sourceRaw, amountRaw] of Object.entries(bySource || {})) {
      const source = String(sourceRaw || "").toLowerCase();
      const amount = Number(amountRaw || 0);

      if (amount <= 0) continue;

      const prefix = `geral-weekly:${week.weekKey}:${userId}:${source}`;

      if (source === "manager" || source === "managers" || source === "registro_manager") {
        pushManyVirtual(user.orgs, amount, prefix);
      }

      if (source === "presenca" || source === "presencas" || source === "confirmacao" || source === "confirmacoes") {
        pushManyVirtual(user.confirmacoes, amount, prefix);
      }

      if (source === "eventopoder" || source === "eventos_poder" || source === "evento_poder") {
        pushManyVirtual(user.poderesEventos, amount, prefix);
      }

      if (source === "poderes" || source === "registro_poderes") {
        for (let i = 0; i < Math.max(0, amount); i++) {
          user.poderesDias[`virtual-${week.weekKey}-${userId}-${source}-${i + 1}`] = true;
        }
      }

      if (source === "doacoes" || source === "doacao") {
        pushManyVirtual(user.doacoes, amount, prefix);
      }

      if (source === "vendas" || source === "venda") {
        pushManyVirtual(user.vendas, amount, prefix);
      }

      if (source === "convites" || source === "lideres" || source === "dm_lideres") {
        pushManyVirtual(user.dmLideres, amount, prefix);
      }

      if (source === "pagamentos" || source === "pagamento") {
        pushManyVirtual(user.pagamentos, amount, prefix);
      }

      if (source === "eventosdiarios" || source === "eventos_diarios") {
        pushManyVirtual(user.eventosDiarios, amount, prefix);
      }
    }
  }
}

function clampPercent(n) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function ratioPercent(value, target) {
  if (!target) return 0;
  return Math.min(1, value / target);
}

function calcUserMeta({ userId, state, eventos, bpEntries }) {
  const user = ensureUser(state, userId);

  const eventosTotal = Math.max(1, eventos.length || 10);
  const eventosPresentes = countPresencasEventos(userId, eventos, bpEntries);
  const eventosMeta = Math.ceil(eventosTotal * METAS.eventosRatio);

  const raw = {
    eventosPresentes,
    eventosTotal,
    eventosMeta,
    orgs: user.orgs.length,
    confirmacoes: user.confirmacoes.length,
    poderesEventos: user.poderesEventos.length,
    poderesDias: Object.keys(user.poderesDias || {}).length,
    doacoes: user.doacoes.length,
    vendas: user.vendas.length,
    dmLideres: user.dmLideres.length,
    pagamentos: user.pagamentos.length,
    eventosDiarios: user.eventosDiarios.length,
  };

  raw.pontos =
    raw.orgs +
    raw.confirmacoes +
    raw.poderesEventos +
    raw.poderesDias +
    raw.doacoes +
    raw.vendas +
    raw.dmLideres +
    raw.pagamentos +
    raw.eventosDiarios;

  const percent =
    ratioPercent(raw.eventosPresentes, raw.eventosMeta) * PESOS.eventos +
    ratioPercent(raw.pontos, METAS.pontos) * PESOS.pontos +
    ratioPercent(raw.poderesDias, METAS.poderesDias) * PESOS.poderesDias +
    ratioPercent(raw.orgs, METAS.orgs) * PESOS.orgs +
    ratioPercent(raw.confirmacoes, METAS.confirmacoes) * PESOS.confirmacoes +
    ratioPercent(raw.doacoes, METAS.doacoes) * PESOS.doacoes +
    ratioPercent(raw.vendas, METAS.vendas) * PESOS.vendas +
    ratioPercent(raw.dmLideres, METAS.dmLideres) * PESOS.dmLideres +
    ratioPercent(raw.pagamentos, METAS.pagamentos) * PESOS.pagamentos +
    ratioPercent(raw.eventosDiarios, METAS.eventosDiarios) * PESOS.eventosDiarios;

  const finalPercent = clampPercent(percent);

  return {
    userId,
    percent: finalPercent,
    ok: finalPercent >= 100,
    raw,
  };
}

async function getEligibleMembers(guild) {
  await guild.members.fetch({ withPresences: false }).catch(() => null);

  let totalSanta = 0;
  let totalCidadao = 0;
  let totalAmbos = 0;

  const members = guild.members.cache.filter((m) => {
    if (m.user.bot) return false;

    const hasSanta = m.roles.cache.has(ROLE_SANTA_CREATORS);
    const hasCidadao = m.roles.cache.has(ROLE_CIDADAO);

    if (hasSanta) totalSanta++;
    if (hasCidadao) totalCidadao++;
    if (hasSanta && hasCidadao) totalAmbos++;

    return hasSanta && hasCidadao;
  });

  console.log("[MetaInternaSemanal] Cargos encontrados:", {
    santaCreators: totalSanta,
    cidadao: totalCidadao,
    ambos: totalAmbos,
    participantes: members.size,
  });

  return members;
}

function esc(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function statusEmoji(percent) {
  if (percent >= 100) return "🟢";
  if (percent >= 60) return "👍";
  return "🔻";
}

async function makeDashboardImage(rows, weekLabel) {
  const top = rows.slice(0, 12);

  const rowSvg = top.map((r, i) => {
    const y = 205 + i * 76;
    const barW = Math.round(700 * (r.percent / 100));

    return `
      <text x="76" y="${y}" font-size="26" fill="#ffffff" font-weight="700">#${i + 1}</text>
      <text x="145" y="${y}" font-size="26" fill="#ffffff" font-weight="700">${esc(r.name)}</text>
      <text x="850" y="${y}" font-size="26" fill="#ffffff" font-weight="700">${r.percent}%</text>
      <rect x="145" y="${y + 18}" width="700" height="16" rx="8" fill="#2b1748"/>
      <rect x="145" y="${y + 18}" width="${barW}" height="16" rx="8" fill="#a855f7"/>
    `;
  }).join("");

  const svg = `
  <svg width="1100" height="1180" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#140021"/>
        <stop offset="50%" stop-color="#3b0764"/>
        <stop offset="100%" stop-color="#05000a"/>
      </linearGradient>
      <filter id="glow">
        <feGaussianBlur stdDeviation="5" result="coloredBlur"/>
        <feMerge>
          <feMergeNode in="coloredBlur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>
    <rect width="1100" height="1180" fill="url(#bg)"/>
    <circle cx="950" cy="130" r="170" fill="#7e22ce" opacity="0.22"/>
    <circle cx="120" cy="980" r="220" fill="#a855f7" opacity="0.14"/>
    <text x="70" y="92" font-size="48" fill="#ffffff" font-weight="900" filter="url(#glow)">META INTERNA SEMANAL</text>
    <text x="70" y="135" font-size="24" fill="#d8b4fe">SantaCreators • ${esc(weekLabel)}</text>
    <text x="70" y="170" font-size="21" fill="#c084fc">Metas internas semanais a serem batidas</text>
    ${rowSvg || `<text x="70" y="260" font-size="30" fill="#ffffff">Nenhum participante encontrado.</text>`}
    <text x="70" y="1130" font-size="22" fill="#d8b4fe">POSITIVO • SUBINDO • NEGATIVO</text>
  </svg>`;

  return await sharp(Buffer.from(svg)).png().toBuffer();
}

function publicDescription(rows) {
  if (!rows.length) return "_Nenhum participante encontrado._";

  return rows.slice(0, 30).map((r, i) => {
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`;
    const situacao = r.percent >= 100 ? "POSITIVO" : r.percent >= 60 ? "SUBINDO" : "NEGATIVO";
    return `${medal} <@${r.userId}>\n${statusEmoji(r.percent)} **${r.percent}%** • ${situacao}`;
  }).join("\n\n");
}

function logDescription(rows) {
  if (!rows.length) return "_Nenhum participante encontrado._";

  return rows.map((r, i) => {
    const x = r.raw;
    return [
      `**#${i + 1} — <@${r.userId}>**`,
      `📊 Meta: **${r.percent}%**`,
      `🎯 Pontos internos: **${x.pontos}/${METAS.pontos}**`,
      `🎮 Eventos: **${x.eventosPresentes}/${x.eventosTotal}** mínimo ${x.eventosMeta}`,
      `⚡ Poderes em dias: **${x.poderesDias}/${METAS.poderesDias}**`,
      `🏢 Registros de ORG: **${x.orgs}/${METAS.orgs}**`,
      `✅ Confirmações de ORG: **${x.confirmacoes}/${METAS.confirmacoes}**`,
      `🎁 Eventos diários: **${x.eventosDiarios}/${METAS.eventosDiarios}**`,
      `💳 Botões de pagamento: **${x.pagamentos}/${METAS.pagamentos}**`,
      `💜 Doações: **${x.doacoes}/${METAS.doacoes}**`,
      `💰 Vendas: **${x.vendas}/${METAS.vendas}**`,
      `📩 DM líderes: **${x.dmLideres}/${METAS.dmLideres}**`,
    ].join("\n");
  }).join("\n\n━━━━━━━━━━━━━━━━━━━━━━\n\n").slice(0, 3900);
}

async function upsertMessage(channel, messageId, payload, markerText) {
  if (messageId) {
    const old = await channel.messages.fetch(messageId).catch(() => null);
    if (old) {
      await old.edit(payload).catch(() => null);
      return old;
    }
  }

  const messages = await channel.messages.fetch({ limit: 30 }).catch(() => null);

  if (messages) {
    const botMessages = messages
      .filter((msg) => {
        if (msg.author?.id !== channel.client.user.id) return false;

        const content = String(msg.content || "");
        const title = String(msg.embeds?.[0]?.title || "");
        const footer = String(msg.embeds?.[0]?.footer?.text || "");

        return (
          content.includes(markerText) ||
          title.includes(markerText) ||
          footer.includes(markerText)
        );
      })
      .sort((a, b) => b.createdTimestamp - a.createdTimestamp);

    const principal = botMessages.first();

    for (const msg of botMessages.values()) {
      if (principal && msg.id !== principal.id) {
        await msg.delete().catch(() => {});
      }
    }

    if (principal) {
      await principal.edit(payload).catch(() => null);
      return principal;
    }
  }

  const sent = await channel.send(payload);
  return sent;
}

async function updateMetaInterna(client, reason = "auto") {
  const dashboardChannel = await client.channels.fetch(DASHBOARD_CHANNEL_ID).catch(() => null);
  const logChannel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);

  const guild = dashboardChannel?.guild || logChannel?.guild || client.guilds.cache.first();
  if (!guild) return;

  const week = getWeekInfo();
  const state = loadState();

  // ✅ Mantém os eventos ao vivo da semana atual e remove só sujeira antiga
  state.users = keepOnlyCurrentWeekUsers(state.users);

  injectVendasFromFile(state);
  injectGeralWeeklySources(state);

  const eventos = buildCronogramaEventos();
  const bpEntries = loadBpEntriesForWeek();
  const members = await getEligibleMembers(guild);

  const rows = members.map((m) => {
    const calc = calcUserMeta({ userId: m.id, state, eventos, bpEntries });
    return {
      ...calc,
      name: m.displayName || m.user.username,
    };
  }).sort((a, b) => b.percent - a.percent);

  saveState(state);

  if (dashboardChannel?.isTextBased?.()) {
    const image = await makeDashboardImage(rows, week.label);
    const file = new AttachmentBuilder(image, { name: "meta-interna-semanal.png" });

    const embed = new EmbedBuilder()
      .setColor("#8a2be2")
.setTitle("💜 Dashboard — Meta Interna Semanal")
.setDescription("📌 **Metas internas semanais a serem batidas.**\n\n" + publicDescription(rows))
.setImage("attachment://meta-interna-semanal.png")
.setFooter({ text: `SantaCreators • Meta Interna Semanal • Atualizado automaticamente` })
.setTimestamp();

const msg = await upsertMessage(
  dashboardChannel,
  state.dashboardMessageId,
  {
    content: "",
    embeds: [embed],
    files: [file],
    allowedMentions: { parse: [] },
  },
  "Dashboard — Meta Interna Semanal"
);

    state.dashboardMessageId = msg.id;
  }

  if (logChannel?.isTextBased?.()) {
    const embed = new EmbedBuilder()
      .setColor("#7c3aed")
      .setTitle("📋 Logs completos — Meta Interna Semanal")
      .setDescription(logDescription(rows))
      .addFields(
        { name: "📅 Semana", value: week.label, inline: true },
        { name: "🎮 Eventos usados", value: String(eventos.length || 0), inline: true },
        { name: "🕒 Regra BP", value: "21h: 19:00–22:30\n23:30/00/01: 23:30–01:00", inline: false },
      )
      .setFooter({ text: `SantaCreators • Logs da Meta Interna • Atualizado automaticamente` })
.setTimestamp();

const msg = await upsertMessage(
  logChannel,
  state.logMessageId,
  {
    content: "",
    embeds: [embed],
    allowedMentions: { parse: [] },
  },
  "Logs completos — Meta Interna Semanal"
);

    state.logMessageId = msg.id;
  }

  saveState(state);
}

export async function metaInternaSemanalOnReady(client) {
  console.log("[MetaInternaSemanal] Iniciando...");

  setupDashHooks(client);

  await updateMetaInterna(client, "boot").catch((e) => {
    console.error("[MetaInternaSemanal] Erro boot:", e);
  });

  console.log("[MetaInternaSemanal] Dashboard atualizado no boot.");

  if (client.__SC_META_INTERNA_INTERVAL__) return;

  client.__SC_META_INTERNA_INTERVAL__ = setInterval(async () => {
    await updateMetaInterna(client, "intervalo").catch((e) => {
      console.error("[MetaInternaSemanal] Erro intervalo:", e);
    });
  }, 2 * 60 * 1000);

  console.log("[MetaInternaSemanal] Intervalo automático iniciado.");
}

export async function metaInternaSemanalHandleMessage(message, client) {
  if (!message.guild || message.author.bot) return false;

  const content = String(message.content || "").trim().toLowerCase();

  if (
    content !== "!metainterna" &&
    content !== "!metainternea" &&
    content !== "!meta_interna" &&
    content !== "!atualizarmeta"
  ) {
    return false;
  }

  const allowedUsers = new Set([
    "660311795327828008",
    "1262262852949905408",
  ]);

  const allowedRoles = new Set([
    "1352408327983861844",
    "1262262852949905409",
    "1352407252216184833",
    "1414651836861907006",
  ]);

  const hasPermission =
    allowedUsers.has(message.author.id) ||
    message.member?.roles?.cache?.some((role) => allowedRoles.has(role.id));

  if (!hasPermission) {
    await message.reply("🚫 Você não tem permissão para atualizar a meta interna.").catch(() => {});
    return true;
  }

  await message.delete().catch(() => {});

  const reply = await message.channel.send("🔄 Atualizando **Meta Interna Semanal**...").catch(() => null);

  try {
    await updateMetaInterna(client, `manual:${message.author.id}`);

    if (reply) {
      await reply.edit("✅ Meta Interna Semanal atualizada com sucesso.").catch(() => {});
      setTimeout(() => reply.delete().catch(() => {}), 8000);
    }
  } catch (e) {
    console.error("[MetaInternaSemanal] Erro comando manual:", e);

    if (reply) {
      await reply.edit("❌ Erro ao atualizar a Meta Interna Semanal. Veja o console.").catch(() => {});
      setTimeout(() => reply.delete().catch(() => {}), 12000);
    }
  }

  return true;
}