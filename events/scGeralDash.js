// /application/events/scGeralDash.js
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  EmbedBuilder,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";


import { dashOn } from "../utils/dashHub.js";
import { resolveLogChannel } from "./channelResolver.js";

// ✅ __dirname no ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ pasta /data do projeto (ajuste os ".." se teu arquivo estiver em outro nível)
const DATA_DIR = path.resolve(__dirname, "../data");

// ✅ GUARD GLOBAL REAL (se esse arquivo for importado 2x, a 2ª vez NÃO pode ligar nada)
const __SC_GERAL_DASH_SKIP__ = Boolean(globalThis.__SC_GERAL_DASH_ALREADY_BOOTSTRAPPED__);

if (__SC_GERAL_DASH_SKIP__) {
  // console.log("[SC_GERAL_DASH] já bootstrapped — pulando exports init.");
} else {
  globalThis.__SC_GERAL_DASH_ALREADY_BOOTSTRAPPED__ = true;
  // console.log("[SC_GERAL_DASH] bootstrapped OK.");
}





// ============================================================================
// SC_GERAL_DASH v3.0 — Modular + HUB
// ✅ Boot: scan completo (pesado) 1x
// ✅ Pós-boot: só atualiza quando houver interação humana (via HUB)
// ✅ Cooldown: 4 horas entre scans (após o boot)
// ✅ Mantém comandos: !geraldashrefresh / !geraldashdebug
// ✅ Adiciona infos de: Doação / Líderes Convites / VIP Evento / Perguntas
// ============================================================================

// ================== CONFIG ==================
const DASH_CHANNEL_ID = "1458132388281585696";

// ✅ MARKER fixo pra identificar a msg do dashboard
const DASH_MARKER = "SC_GERAL_DASH::MAIN_V3";

// ✅ quantas páginas de 100 msgs procurar quando reinicia (se o canal tem conversa, sobe isso)
const DASH_FIND_PAGES = 15; // 15*100 = 1500 msgs


// ✅ canal de logs (novidades/mudanças)
const DASH_LOG_CHANNEL_ID = "1460762416768880711";

const DASH_BANNER_URL =
  "https://media.discordapp.net/attachments/1362477839944777889/1384245215249825832/standard_2rss.gif";

// ============================================================================
// ✅ BACKFILL EXTRA (pra não zerar no restart):
// Doações / Convites / Perguntas
//
// A gente reconstrói a SEMANA ATUAL lendo os CANAIS DE LOG desses módulos.
// Isso NÃO interfere em nenhum outro contador e NÃO mexe no fluxo do HUB.
// ============================================================================

// 🔥 DOAÇÃO: canal onde o módulo doação.js manda os registros (embed "📦 Nova Doação Registrada")
// - ele usa env SCDOACAO_LOGS_ID, fallback: "1392343906535870597"
const DOACAO_LOGS_CHANNEL_ID =
  process.env.SCDOACAO_LOGS_ID?.trim() || "1392343906535870597";

// 🔥 CONVITES: canal LOG do módulo lideresConvites.js
// - no teu arquivo lideresConvites.js: const LOG_CHANNEL_ID = "1415102820826349648";
const CONVITES_LOGS_CHANNEL_ID = "1415102820826349648";

// 🔥 PERGUNTAS: canal onde entrevista.logCompleto manda o log do "!perguntas usado"
// ✅ Aqui eu deixei via ENV pra você setar 1 vez e nunca mais mexer.
// 👉 Coloca no .env / painel:
//    SCPERGUNTAS_LOGS_ID=SEU_CANAL_AQUI
//
// Se não setar, o backfill de perguntas só será ignorado (não quebra nada).
const PERGUNTAS_LOGS_CHANNEL_ID = process.env.SCPERGUNTAS_LOGS_ID?.trim() || "";

// 🔥 VENDAS: canal de logs do registroVendas.js
const VENDAS_LOGS_CHANNEL_ID = "1475237983782179028";

// 🔥 CRONOGRAMA: canal de aprovação (onde fica o embed verde)
const CRONOGRAMA_LOGS_CHANNEL_ID = "1387864036259004436";

// 🔥 PRESENÇA: canal de logs do confirmacaoPresenca.js
const PRESENCA_LOGS_CHANNEL_ID = "1477802343407026257";

// 🔥 CORREÇÃO: canal de logs do correcao.js
const CORRECAO_LOGS_CHANNEL_ID = "1471695257010831614";

// ✅ NOVOS CANAIS PARA BACKFILL (VIP / HALL)
const VIP_MENU_CHANNEL_ID = "1414718336826081330";
const HALL_CHANNEL_ID = "1386503496353976470";



// Fontes do teu scan “antigo”
const CH_PODERES_ID = "1374066813171929218";
const CH_EVENTOS_ID = "1392618646630568076";
const CH_PAGAMENTOS_ID = "1387922662134775818";
const CH_MANAGER_ID = "1392680204517769277";
// ✅ NOVO: Alinhamentos (é o mesmo canal onde ele posta os registros)
const CH_ALINHAMENTOS_ID = "1425256185707233301";
const EVT3_STATE_FILE = path.join(DATA_DIR, "evt3_events_state.json");
const EVT3_EVENT_PARENT_ID = "1457573495952248883";
const BP_CALENDAR_CHANNEL_ID = "1417602545953804328";

// Estado do dashboard (msg fixa + counters)
const STATE_PATH = path.join(DATA_DIR, "sc_geral_dashboard_state_v3.json");

// ✅ NOVO: snapshot imutável por semana (congela o total)
const WEEKLY_SNAPSHOT_PATH = path.join(
  DATA_DIR,
  "sc_geral_weekly_snapshot.json"
);

// ================== AJUSTES MANUAIS (REMOVER / ADICIONAR PONTOS) ==================
const MANUAL_ADJUST_ALLOWED_ROLES = new Set([
  "1352408327983861844", // resp creators
  "1262262852949905409", // resp influ
  "1262262852949905408", // owner
]);
const MANUAL_ADJUST_ALLOWED_USERS = new Set([
  "660311795327828008", // você
]);
const MANUAL_ADJUST_PATH = path.join(DATA_DIR, "sc_geral_manual_adjustments.json");

function loadManualAdjustments() {
  return readJSON(MANUAL_ADJUST_PATH, {
    byWeek: {
      // "YYYY-MM-DD": { "userId": -2 }
    },
  });
}

function saveManualAdjustments(data) {
  writeJSON(MANUAL_ADJUST_PATH, data);
}

// Timezone
const TZ = "America/Sao_Paulo";

// Cooldowns
const COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4h
const BOOT_SCAN_FULL = true;

// Scans (full)
const FULL_SCAN = {
  PODERES: 20,
  EVENTOS: 20,
  PAGAMENTOS: 30,
  MANAGER: 30,
  ALINHAMENTOS: 20,

  // ✅ NOVO: extras que também contam no GERAL e no Top (pessoal)
  DOACOES: 20,
  CONVITES: 20,
  PERGUNTAS: 20,
  VENDAS: 20,
  CRONOGRAMA: 20,
  PRESENCAS: 20, // ✅ NOVO
  HALLDAFAMA: 20, // ✅ NOVO
  EVENTOSDIARIOS: 20, // ✅ NOVO
  CORRECAO: 20, // ✅ NOVO
};


// Scan TTL (cache interno)
const SCAN_TTL_MS = 20 * 60 * 1000;

// Barra/escala
const BAR_MAX = 350; // 🎯 nova meta: 350 pontos


// ================== MEMÓRIA ==================
let LOCK = false;
let LOCK_TS = 0; // ✅ Timestamp da trava local
let CACHE = { at: 0, payload: null };
let DIRTY = false; // marcou que teve interação humana desde última atualização
let NEXT_ALLOWED_AT = 0; // quando pode rodar scan novamente

const DEBUG = {
  lastRunAt: null,
  lastReason: "",
  dashMsgId: null,
  weekKeysFound: {},
};

// ================== FILE HELPERS ==================
function ensureDirForFile(filePath) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  } catch {}
}

function readJSON(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;

    const raw = fs.readFileSync(file, "utf8");
    if (!raw || !raw.trim()) return fallback;

    return JSON.parse(raw);
  } catch (e) {
    console.error("[SC_GERAL_DASH] ⚠️ State JSON inválido/corrompido, usando fallback:", file, e?.message || e);
    return fallback;
  }
}

// ✅ write ATÔMICO: escreve em .tmp e depois renomeia (evita state quebrar em restart)
function writeJSON(file, data) {
  try {
    ensureDirForFile(file);

    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, file);
  } catch (e) {
    console.error("[SC_GERAL_DASH] ❌ Falha ao salvar state:", file, e?.message || e);
  }
}

/* ========================================================================
 * ✅ WEEKLY SNAPSHOT — CONGELA SEMANAS PASSADAS (NÃO MUDA NUNCA MAIS)
 * - Semana atual SEMPRE recalcula
 * - Semana passada e anteriores ficam imutáveis
 * ====================================================================== */

function loadWeeklySnapshot() {
  return readJSON(WEEKLY_SNAPSHOT_PATH, {
    totals: {
      // "YYYY-MM-DD": number
    },
  });
}

function saveWeeklySnapshot(data) {
  writeJSON(WEEKLY_SNAPSHOT_PATH, data);
}

/**
 * Congela AUTOMATICAMENTE a semana passada.
 * Se já existir snapshot, NÃO recalcula.
 */
function freezeLastWeekIfNeeded(items) {
  const snap = loadWeeklySnapshot();

  const wkNow = weekKeyFromDateSP(nowSP());
  const lastWeekKey = addDaysToWeekKey(wkNow, -7);

  if (!lastWeekKey) return;

  // ✅ já congelado → não mexe
  if (snap.totals[lastWeekKey] != null) return;

  const total = items.filter(
    (x) => weekKeyFromDateSP(x.ts) === lastWeekKey
  ).length;

  snap.totals[lastWeekKey] = total;
  saveWeeklySnapshot(snap);
}



function loadState() {
  return readJSON(STATE_PATH, {
    dashboardMsgId: null,
    lastBootFullScanAt: null,
    lastScanAt: null,
    nextAllowedAt: 0,

    // ✅ NOVO: guarda a msg do LOG por semana (pra editar ao invés de spammar)
    logWeeklyMsgIds: {},

    weekly: {
      doacoes: {},
      convites: {},
      vipCriados: {},
      vipSolicitados: {},
      vipPagos: {},
      vipReprovados: {},
      perguntas: {},
      vendas: {},
      cronograma: {},
      rmAprovados: {},
      rmReprovados: {},
      presencas: {}, // ✅ NOVO
      halldafama: {}, // ✅ NOVO
      eventosdiarios: {}, // ✅ NOVO
      correcao: {}, // ✅ NOVO

      // ✅ alinhamentos
      alinhamentos: {},


      // ✅ NOVO: bate-ponto (contador humano semanal pro LOG)
  bateponto: {},

      // ✅ social medias: poderes em evento
      eventosPoderes: {},

      // ✅ NOVO: poderes utilizados (módulo separado do canal 137406...)
      poderesUtilizados: {},

      // ✅ pagamentos social
      pagCriados: {},
      pagSolicitados: {},
      pagPagos: {},
      pagReprovados: {},
    },

    // ✅ marca se já fez backfill da semana (pra não duplicar)
    backfill: {
  pagamentosocialWeeks: {},
  geralWeeks: {},
},

    // ✅ assinatura do log por semana (pra não editar se não mudou)
_logSig: {},
  });
}


function saveState(s) {
  writeJSON(STATE_PATH, s);
}

// ================== TIME HELPERS ==================
const nowSP = () =>
  new Date(new Date().toLocaleString("en-US", { timeZone: TZ }));

function ymdSP(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return {
    y: +parts.find((p) => p.type === "year").value,
    m: +parts.find((p) => p.type === "month").value,
    d: +parts.find((p) => p.type === "day").value,
  };
}

function startOfDaySP(date) {
  const { y, m, d } = ymdSP(date);
  return new Date(Date.UTC(y, m - 1, d, 3, 0, 0)); // ✅ FIX: 03:00 UTC = 00:00 SP
}

function dowSP(date) {
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "short",
  }).format(date);
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[wd] ?? 0;
}

function addDaysUTC(d, n) {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

function weekKeyFromDateSP(date) {
  const sod = startOfDaySP(date);
  const dow = dowSP(date);
  const sunday = addDaysUTC(sod, -dow);
  return sunday.toISOString().slice(0, 10);
}


// ✅ helpers pra andar semanas (ISO y-m-d)
function weekKeyToDateUTC(weekKey) {
  const [Y, M, D] = String(weekKey || "").split("-").map(Number);
  if (!Y || !M || !D) return null;
  return new Date(Date.UTC(Y, M - 1, D));
}
function addDaysToWeekKey(weekKey, days) {
  const base = weekKeyToDateUTC(weekKey);
  if (!base) return null;
  const next = addDaysUTC(base, days);
  return next.toISOString().slice(0, 10);
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function triLabelShortFromWeekKey(weekKey) {
  try {
    const [Y, M, D] = weekKey.split("-").map(Number);
    const sundayUTC = new Date(Date.UTC(Y, M - 1, D));
    const thu = addDaysUTC(sundayUTC, 4);
    const fri = addDaysUTC(sundayUTC, 5);
    const sat = addDaysUTC(sundayUTC, 6);

    const f = (dt) => {
      const { d, m } = ymdSP(
        new Date(dt.toLocaleString("en-US", { timeZone: TZ }))
      );
      return { dd: pad2(d), mm: pad2(m) };
    };

    const a = f(thu),
      b = f(fri),
      c = f(sat);
    const sameMonth = a.mm === b.mm && b.mm === c.mm;

    return sameMonth
      ? `${a.dd}/${b.dd}/${c.dd}-${a.mm}`
      : `${a.dd}-${a.mm}/${b.dd}-${b.mm}/${c.dd}-${c.mm}`;
  } catch {
    return weekKey;
  }
}

// ================== TEXT HELPERS ==================
function norm(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
function getFields(emb) {
  return emb?.fields || emb?.data?.fields || [];
}

function gradeLabel(total) {
  if (total >= 350) return { emoji: "🏆", label: "META BATIDA" };
  if (total >= 300) return { emoji: "✅", label: "BOM" };
  if (total >= 250) return { emoji: "🙂", label: "OK" };
  if (total >= 200) return { emoji: "🟡", label: "NO PROCESSO - TÁ OK" };
  if (total >= 150) return { emoji: "🟠", label: "ABAIXO DO ESPERADO" };
  if (total >= 100) return { emoji: "🔴", label: "MUITO ABAIXO DA MÉDIA" };
  if (total >= 50) return { emoji: "📉", label: "NEGATIVADOS" };
  return { emoji: "⚫", label: "RUIM" };
}


function progressBarGeneralSimple(value, max = BAR_MAX, width = 18) {
  const v = Math.max(0, Math.min(max, Number(value) || 0));
  const pct = max > 0 ? v / max : 0;

  const filled = Math.round(pct * width);
  const empty = Math.max(0, width - filled);

  // cor do "filled" muda por faixa (bem mais clean que aquela régua gigante)
 const fillEmoji =
  v >= 350 ? "🟩" :
  v >= 250 ? "🟦" :
  v >= 150 ? "🟨" :
  v >= 50  ? "🟧" : "🟥";


  return `${fillEmoji.repeat(filled)}${"⬛".repeat(empty)}`;
}


// ================== QUICKCHART ==================
function colorForGeneralValue(v) {
  const x = Number(v) || 0;
  if (x >= 350) return "#16a34a";
  if (x >= 300) return "#22c55e";
  if (x >= 250) return "#4ade80";
  if (x >= 200) return "#facc15";
  if (x >= 150) return "#fde047";
  if (x >= 100) return "#f59e0b";
  if (x >= 50) return "#ef4444";
  return "#991b1b";
}


function chartUrlLast4Weeks({ labels, data, title }) {
  const barColors = (data || []).map(colorForGeneralValue);
  const grandTotal = (data || []).reduce((acc, v) => acc + (Number(v) || 0), 0);

  const cfg = {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Semanas",
          data,
          backgroundColor: barColors,
          borderWidth: 0,
          barThickness: 12,
          maxBarThickness: 16,
        },
      ],
    },
    options: {
      layout: { padding: { top: 28, left: 10, right: 10, bottom: 10 } },
      legend: { display: false }, // ✅ v2 style (safe)
      title: {
        display: true,
        text: `${title} • TOTAL GERAL: ${grandTotal}`,
        fontSize: 18, // ✅ v2 style (safe)
      },
      plugins: {
        datalabels: {
          anchor: "end",
          align: "top",
          offset: 2,
          clamp: true,
          color: "#111",
          font: { weight: "bold", size: 12 },
          formatter: (v) => String(v),
        },
      },

      // ✅ FIX PRINCIPAL: Chart.js v2 usa yAxes/xAxes
      // ✅ E a gente força min=0 pro 80 não “sumir” na base
      scales: {
        yAxes: [
          {
            ticks: {
              min: 0,
              beginAtZero: true,
              precision: 0,
              callback: (v) => String(v),
            },
          },
        ],
        xAxes: [
          {
            ticks: {
              autoSkip: false,
              maxRotation: 0,
              minRotation: 0,
            },
          },
        ],
      },
    },
  };

  return `https://quickchart.io/chart?c=${encodeURIComponent(
    JSON.stringify(cfg)
  )}&width=1150&height=420&backgroundColor=white&plugins=datalabels`;
}


// ================== PARSERS (antigos) ==================
function isPoderesRecordEmbed(emb) {
  const t = norm(emb?.title || emb?.data?.title || "");
  return (
    t.includes("registro") && t.includes("poderes") && t.includes("utilizados")
  );
}
function poderes_getUserId(emb) {
  const f = getFields(emb).find((x) => norm(x?.name).includes("id"));
  const v = String(f?.value || "").trim();
  return /^\d{17,20}$/.test(v) ? v : null;
}

function eventos_getRecordType(emb) {
  const t = norm(emb?.title || emb?.data?.title || "");

  // registro “evento normal”
  const isEvento = t.includes("registro") && t.includes("evento") && !t.includes("uso de poderes");

  // registro “poderes em evento”
  const isPoderEmEvento =
    t.includes("registro") &&
    (t.includes("uso de poderes") || (t.includes("poderes") && t.includes("evento")));

  if (isPoderEmEvento) return "eventopoder";
  if (isEvento) return "eventos";
  return null;
}

function isEventosRecordEmbed(emb) {
  return !!eventos_getRecordType(emb);
}



function eventos_getRegistrarId(emb) {
  const f = getFields(emb).find((x) => norm(x?.name).includes("registrado por"));
  const m = /<@!?(\d+)>/.exec(String(f?.value || ""));
  return m ? m[1] : null;
}

function isPaymentRecordEmbed(emb) {
  const t = String(emb?.title || emb?.data?.title || "");
  return t.includes("Registro de Pagamento de Evento") && t.includes("SANTACREATORS");
}
function pagamentos_getRegistrarId(emb) {
  const f = getFields(emb).find((x) => norm(x?.name).includes("registro"));
  const m = /<@!?(\d+)>/.exec(String(f?.value || ""));
  return m ? m[1] : null;
}

function isRegistroManagerEmbed(emb) {
  const t = norm(emb?.title || emb?.data?.title || "");
  return t.includes("registro") && t.includes("evento") && t.includes("manager");
}
function manager_isApproved(emb) {
  return getFields(emb).some((f) => norm(f?.name).includes("aprovado por"));
}
function manager_isRejected(emb) {
  return getFields(emb).some((f) => norm(f?.name).includes("reprovado por"));
}
function manager_getRegistrarId(emb) {
  const f = getFields(emb).find((x) => norm(x?.name).includes("registrado por"));
  const m = /<@!?(\d+)>/.exec(String(f?.value || ""));
  return m ? m[1] : null;
}

// ✅ NOVO: pega o ID do "Manager responsável" (menção / `id` / id puro)
function manager_getManagerId(emb) {
  const fields = getFields(emb);
  const f = fields.find((x) => norm(x?.name).includes("manager responsavel"));
  const v = String(f?.value || "").trim();
  if (!v) return null;

  // ID puro
  if (/^\d{17,20}$/.test(v)) return v;

  // <@id>
  let m = /<@!?(\d{17,20})>/.exec(v);
  if (m) return m[1];

  // (`id`)
  m = /`(\d{17,20})`/.exec(v);
  if (m) return m[1];

  return null;
}

// ================== PARSER — ALINHAMENTOS (ALINV1) ==================
function isAlinhamentoRecordEmbed(emb) {
  const t = norm(emb?.title || emb?.data?.title || "");
  const footer = norm(emb?.footer?.text || emb?.data?.footer?.text || "");
  return (
    t.includes("registro de alinhamento") ||
    (t.includes("registro") && t.includes("alinhamento")) ||
    footer.includes("alinv1")
  );
}

function alinhamento_getQuemAlinhouId(emb) {
  const fields = getFields(emb);

  // ✅ teu embed tem: "🧭 Quem alinhou?"
  const f = fields.find((x) => norm(x?.name).includes("quem alinhou"));
  const v = String(f?.value || "").trim();
  if (!v) return null;

  // <@id>
  let m = /<@!?(\d{17,20})>/.exec(v);
  if (m) return m[1];

  // (`id`)
  m = /`(\d{17,20})`/.exec(v);
  if (m) return m[1];

  // ID puro
  if (/^\d{17,20}$/.test(v)) return v;

  return null;
}



function readEvt3State() {
  try {
    if (!fs.existsSync(EVT3_STATE_FILE)) return null;
    return JSON.parse(fs.readFileSync(EVT3_STATE_FILE, "utf-8")) || null;
  } catch {
    return null;
  }
}

function safeParseJSONBlock(content) {
  try {
    const s = String(content || "").trim();
    if (!s.startsWith("```json")) return null;
    const body = s.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
    const obj = JSON.parse(body);
    return obj && typeof obj === "object" ? obj : null;
  } catch {
    return null;
  }
}

function parseBPTimeToDateSP(timeStr) {
  const m = /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/.exec(
    String(timeStr || "")
  );
  if (!m) return null;
  const dd = +m[1],
    mm = +m[2],
    yy = +m[3],
    hh = +m[4],
    mi = +m[5];
  // ✅ FIX TIMEZONE: Soma 3h ao horário SP para obter o UTC correto
  return new Date(Date.UTC(yy, mm - 1, dd, hh + 3, mi, 0));
}

async function scanChannelEmbeds(client, { channelId, weekFloorKey, maxPages = 60, onMessage }) {
  const ch = await client.channels.fetch(channelId).catch(() => null);
  if (!ch?.isTextBased?.()) return;

  // se não passar floor, mantém comportamento antigo (seguro)
  const floor = String(weekFloorKey || "").trim() || null;

  let lastId;
  let stop = false;

  for (let p = 0; p < maxPages; p++) {
    const batch = await ch.messages
      .fetch({ limit: 100, before: lastId })
      .catch(() => null);

    if (!batch?.size) break;

    for (const msg of batch.values()) {
      // ✅ condição de parada: quando chegar em msgs mais antigas que o floor
      if (floor) {
        const wkMsg = weekKeyFromDateSP(new Date(msg.createdTimestamp));
        // wkMsg e floor são ISO (YYYY-MM-DD), comparação string funciona
        if (wkMsg < floor) { stop = true; break; }
      }

      await onMessage(msg);
    }

    lastId = batch.last()?.id;
    if (!lastId) break;
    if (stop) break;
  }
}


/**
 * Resolve a mensagem do LOG para a semana (wk).
 * Ordem:
 *  1) tenta pelo ID salvo no state
 *  2) se não existir/encontrar, procura no canal uma msg com "WEEK_KEY: wk"
 *  3) se achar, salva o ID e retorna a msg
 *  4) se não achar, retorna null (caller decide criar)
 */
async function resolveLogMessageForWeek(logChannel, st, wk) {
  try {
    st.logWeeklyMsgIds = st.logWeeklyMsgIds || {};

    const savedId = st.logWeeklyMsgIds[wk] || null;
    if (savedId) {
      const byId = await logChannel.messages.fetch(savedId).catch(() => null);
      if (byId) return byId;
    }

    // procura no histórico recente (até 300 msgs) uma msg que tenha o WEEK_KEY
    let lastId;
    for (let p = 0; p < 3; p++) {
      const batch = await logChannel.messages
        .fetch({ limit: 100, before: lastId })
        .catch(() => null);
      if (!batch?.size) break;

      for (const m of batch.values()) {
        const emb = m.embeds?.[0];
        const footer = emb?.footer?.text || emb?.data?.footer?.text || "";
        if (String(footer).includes(`WEEK_KEY: ${wk}`)) {
          st.logWeeklyMsgIds[wk] = m.id; // salva pra editar sempre daqui pra frente
          return m;
        }
      }

      lastId = batch.last()?.id;
      if (!lastId) break;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Resolve a mensagem fixa do DASH.
 * Ordem:
 *  1) tenta pelo ID salvo no state
 *  2) tenta nos PINNED (rápido)
 *  3) varre RECENTES (até 300) buscando marker no content OU footer
 *  4) se achar várias, mantém a mais recente e apaga as duplicadas (cura o canal)
 */
async function resolveDashboardMessage(dashChannel, st) {
  try {
    const marker = String(DASH_MARKER);

    const messageHasMarker = (m) => {
      try {
        if (!m) return false;

        // ✅ marker no content (linha "SC_GERAL_DASH::MAIN_V3")
        const content = String(m.content || "");
        if (content.includes(marker)) return true;

        // ✅ marker no footer de QUALQUER embed
        const embeds = Array.isArray(m.embeds) ? m.embeds : [];
        for (const e of embeds) {
          const footer = e?.footer?.text || e?.data?.footer?.text || "";
          if (String(footer).includes(marker)) return true;
        }

        return false;
      } catch {
        return false;
      }
    };

    // ✅ só consideramos msgs do próprio bot (evita pegar msg de alguém copiando marker)
    const isFromBot = (m) => {
      try {
        return String(m.author?.id || "") === String(dashChannel.client?.user?.id || "");
      } catch {
        return false;
      }
    };

    // 1) pelo ID salvo
    if (st.dashboardMsgId) {
      const byId = await dashChannel.messages.fetch(st.dashboardMsgId).catch(() => null);
      if (byId && isFromBot(byId) && messageHasMarker(byId)) return byId;
    }

  // 2) pins (mais rápido)
    let pins = null;
    if (typeof dashChannel.messages?.fetchPins === 'function') {
      pins = await dashChannel.messages.fetchPins().catch(() => null);
    }

    if (pins?.size) {
      const pinned = [...pins.values()].filter((m) => isFromBot(m) && messageHasMarker(m));

      if (pinned.length) {
        pinned.sort((a, b) => (b.createdTimestamp || 0) - (a.createdTimestamp || 0));
        const keep = pinned[0];

        // salva ID
        st.dashboardMsgId = keep.id;
        saveState(st);

        // ✅ remove duplicadas pinadas
        for (const extra of pinned.slice(1)) {
          await extra.delete().catch(() => {});
        }

        return keep;
      }
    }

    // 3) varre RECENTES (até 300 msgs) — pega TODAS as matches e limpa duplicadas
    const found = [];
    let lastId;

    for (let p = 0; p < 3; p++) {
      const batch = await dashChannel.messages.fetch({ limit: 100, before: lastId }).catch(() => null);
      if (!batch?.size) break;

      for (const m of batch.values()) {
        if (!isFromBot(m)) continue;
        if (messageHasMarker(m)) found.push(m);
      }

      lastId = batch.last()?.id;
      if (!lastId) break;
    }

    if (found.length) {
      found.sort((a, b) => (b.createdTimestamp || 0) - (a.createdTimestamp || 0));
      const keep = found[0];

      // salva ID
      st.dashboardMsgId = keep.id;
      saveState(st);

      // ✅ apaga duplicadas no histórico recente
      for (const extra of found.slice(1)) {
        await extra.delete().catch(() => {});
      }

      // ✅ tenta pin (se ainda não)
      try {
        if (!keep.pinned) await keep.pin().catch(() => {});
      } catch {}

      return keep;
    }

    // 4) fallback: varre mais pesado (DASH_FIND_PAGES)
    const foundHeavy = [];
    lastId = undefined;

    for (let p = 0; p < DASH_FIND_PAGES; p++) {
      const batch = await dashChannel.messages.fetch({ limit: 100, before: lastId }).catch(() => null);
      if (!batch?.size) break;

      for (const m of batch.values()) {
        if (!isFromBot(m)) continue;
        if (messageHasMarker(m)) foundHeavy.push(m);
      }

      lastId = batch.last()?.id;
      if (!lastId) break;

      // ✅ se já achou pelo menos 2, já dá pra curar
      if (foundHeavy.length >= 2) break;
    }

    if (foundHeavy.length) {
      foundHeavy.sort((a, b) => (b.createdTimestamp || 0) - (a.createdTimestamp || 0));
      const keep = foundHeavy[0];

      st.dashboardMsgId = keep.id;
      saveState(st);

      for (const extra of foundHeavy.slice(1)) {
        await extra.delete().catch(() => {});
      }

      try {
        if (!keep.pinned) await keep.pin().catch(() => {});
      } catch {}

      return keep;
    }

    return null;
  } catch (e) {
    console.error("[SC_GERAL_DASH] resolveDashboardMessage erro:", e?.message || e);
    return null;
  }
}



async function collectAllGeneral(client, mode = "light") {
  const now = Date.now();

  // ✅ SE VAI USAR CACHE, RECONSTRÓI weekKeysFound A PARTIR DELE
  if (mode === "light" && CACHE.payload && now - CACHE.at < SCAN_TTL_MS) {
    DEBUG.weekKeysFound = {};
    for (const it of CACHE.payload.items || []) {
      const wk = weekKeyFromDateSP(it.ts);
      DEBUG.weekKeysFound[wk] = (DEBUG.weekKeysFound[wk] || 0) + 1;
    }
    return CACHE.payload;
  }

    DEBUG.weekKeysFound = {};
  const items = [];

  // ✅ floor = volta 5 semanas (4 semanas do gráfico + 1 semana de folga)
  const wkNow = weekKeyFromDateSP(nowSP());
  const weekFloorKey = addDaysToWeekKey(wkNow, -35);

  await scanChannelEmbeds(client, {
    channelId: CH_PODERES_ID,
    weekFloorKey,
    maxPages: 80,
    onMessage: async (m) => {
      const emb = m.embeds?.[0];
      if (!emb) return;
      if (!isPoderesRecordEmbed(emb)) return;
      const uid = poderes_getUserId(emb);
      if (!uid) return;
      items.push({
        userId: uid,
        ts: new Date(m.createdTimestamp),
        source: "poderes",
      });
    },
  });


      await scanChannelEmbeds(client, {
    channelId: CH_EVENTOS_ID,
    weekFloorKey,
    maxPages: 80,
    onMessage: async (m) => {
      const emb = m.embeds?.[0];
      if (!emb) return;

      const type = eventos_getRecordType(emb);
      if (!type) return;

      const uid = eventos_getRegistrarId(emb);
      if (!uid) return;

      items.push({
        userId: uid,
        ts: new Date(m.createdTimestamp),
        source: type, // ✅ "eventos" ou "eventopoder"
      });
    },
  });



    await scanChannelEmbeds(client, {
    channelId: CH_PAGAMENTOS_ID,
    weekFloorKey,
    maxPages: 80,
    onMessage: async (m) => {
      const emb = m.embeds?.[0];
      if (!emb) return;
      if (!isPaymentRecordEmbed(emb)) return;
      const uid = pagamentos_getRegistrarId(emb);
      if (!uid) return;
      items.push({
        userId: uid,
        ts: new Date(m.createdTimestamp),
        source: "pagamentos",
      });
    },
  });


    // ✅ NOVO: pega a data/hora do campo "✅ Aprovado por" (se existir)
  function manager_getApprovedAtSP(emb) {
    try {
      const f = getFields(emb).find((x) => norm(x?.name).includes("aprovado por"));
      const v = String(f?.value || "").trim();
      if (!v) return null;

      // tenta achar "dd/mm/aaaa, hh:mm:ss" ou "dd/mm/aaaa hh:mm:ss"
      const m = /(\d{2})\/(\d{2})\/(\d{4})[,\s]+(\d{2}):(\d{2})(?::(\d{2}))?/.exec(v);
      if (!m) return null;

      const dd = +m[1], mm = +m[2], yy = +m[3], hh = +m[4], mi = +m[5], ss = +(m[6] || 0);
      
      // ✅ FIX TIMEZONE: Soma 3h ao horário SP para obter o UTC correto
      return new Date(Date.UTC(yy, mm - 1, dd, hh + 3, mi, ss));
    } catch {
      return null;
    }
  }

    await scanChannelEmbeds(client, {
    channelId: CH_MANAGER_ID,
    weekFloorKey,
    maxPages: 80,
    onMessage: async (m) => {
      const emb = m.embeds?.[0];
      if (!emb) return;
      if (!isRegistroManagerEmbed(emb)) return;
      if (manager_isRejected(emb)) return;
      if (!manager_isApproved(emb)) return;

      // ✅ dono do ponto = manager responsável (fallback registrante)
      const uid = manager_getManagerId(emb) || manager_getRegistrarId(emb);
      if (!uid) return;

      // ✅ aqui é o FIX: conta na SEMANA DA APROVAÇÃO (se tiver no embed)
      const approvedAt = manager_getApprovedAtSP(emb);

      items.push({
        userId: uid,
        ts: approvedAt || new Date(m.createdTimestamp),
        source: "manager",
      });
    },
  });


  // ✅ ✅ ✅ ADD AQUI: ALINHAMENTOS (conta pro "quem alinhou")
await scanChannelEmbeds(client, {
  channelId: CH_ALINHAMENTOS_ID,
  weekFloorKey,
  maxPages: 80,
  onMessage: async (m) => {
    const emb = m.embeds?.[0];
    if (!emb) return;

    if (!isAlinhamentoRecordEmbed(emb)) return;

    // ✅ ponto vai para quem alinhou (campo 🧭)
    const uid = alinhamento_getQuemAlinhouId(emb);
    if (!uid) return;

    items.push({
      userId: uid,
      ts: new Date(m.createdTimestamp),
      source: "alinhamentos",
    });
  },
});


// ================== ✅ ADD: EXTRAS NO RANKING (PESSOAL + GERAL) ==================
// Doações / Convites / Perguntas entram no items[] pra contar no total e no Top por pessoa

// ✅ DOAÇÕES (canal de logs do doacao.js)
await scanChannelEmbeds(client, {
  channelId: DOACAO_LOGS_CHANNEL_ID,
  weekFloorKey,
  maxPages: 80,
  onMessage: async (m) => {
    const emb = m.embeds?.[0];
    if (!emb) return;

    // só conta quando for o embed certo e quando pontuou/isento (anti-farm)
    if (!isDoacaoLogEmbed(emb)) return;
    if (!doacaoWasScoredFromEmbed(emb)) return;

    // dono do ponto (quem registrou)
    const uid = doacao_getRegistrarId(emb);
    if (!uid) return;

    items.push({
      userId: uid,
      ts: new Date(m.createdTimestamp),
      source: "doacoes",
    });
  },
});


// ✅ CONVITES (log do lideresConvites.js)
await scanChannelEmbeds(client, {
  channelId: CONVITES_LOGS_CHANNEL_ID,
  weekFloorKey,
  maxPages: 80,
  onMessage: async (m) => {
    const emb = m.embeds?.[0];
    if (!emb) return;

    if (!isConviteLogEmbed(emb)) return;

    const uid = convite_getSenderId(emb);
    if (!uid) return;

    items.push({
      userId: uid,
      ts: new Date(m.createdTimestamp),
      source: "convites",
    });
  },
});

// ✅ PONTO DE ENTREVISTA (via entrevista.js)
if (CORRECAO_LOGS_CHANNEL_ID) {
  await scanChannelEmbeds(client, {
    channelId: CORRECAO_LOGS_CHANNEL_ID,
    weekFloorKey,
    maxPages: 80,
    onMessage: async (m) => {
      const emb = m.embeds?.[0];
      if (!emb) return;
      if (!isEntrevistaConcluidaLogEmbed(emb)) return; // Procura pelo novo log

      const uid = entrevistaConcluida_getUserId(emb); // Pega o ID do aplicador
      if (!uid) return;

      items.push({
        userId: uid,
        ts: new Date(m.createdTimestamp),
        source: "perguntas",
      });
    },
  });
}
// ✅ CRONOGRAMA (Aprovados)
if (CRONOGRAMA_LOGS_CHANNEL_ID) {
  await scanChannelEmbeds(client, {
    channelId: CRONOGRAMA_LOGS_CHANNEL_ID,
    weekFloorKey,
    maxPages: 80,
    onMessage: async (m) => {
      const emb = m.embeds?.[0];
      if (!emb) return;

      // Verifica se está aprovado (Verde ou footer "Aprovado por")
      const isGreen = emb.color === 3066993; // #2ecc71
      const footer = emb.footer?.text || "";
      if (!isGreen && !footer.includes("Aprovado por")) return;

      // Pega ID do solicitante na descrição: "**Solicitante:** <@123>"
      const desc = emb.description || "";
      const match = desc.match(/Solicitante:.*?<@!?(\d+)>/i);
      if (!match) return;

      items.push({
        userId: match[1],
        ts: new Date(m.editedTimestamp || m.createdTimestamp), // Data da aprovação (edit) ou criação
        source: "cronograma",
      });
    },
  });
}

// ✅ PRESENÇAS (Log)
if (PRESENCA_LOGS_CHANNEL_ID) {
  await scanChannelEmbeds(client, {
    channelId: PRESENCA_LOGS_CHANNEL_ID,
    weekFloorKey,
    maxPages: 80,
    onMessage: async (m) => {
      const emb = m.embeds?.[0];
      if (!emb) return;
      if (!isPresencaLogEmbed(emb)) return;
      if (!presenca_isConfirmed(emb)) return;

      const uid = presenca_getUserId(emb);
      if (!uid) return;

      items.push({
        userId: uid,
        ts: new Date(m.createdTimestamp),
        source: "presencas",
    });
  },
});
}

// ✅ CORREÇÃO (logs)
if (CORRECAO_LOGS_CHANNEL_ID) {
await scanChannelEmbeds(client, {
  channelId: CORRECAO_LOGS_CHANNEL_ID,
  weekFloorKey,
  maxPages: 80,
  onMessage: async (m) => {
    const emb = m.embeds?.[0];
    if (!emb) return;
    if (!isCorrecaoLogEmbed(emb)) return;
    if (!correcaoWasScored(emb)) return;

    const uid = correcao_getUserId(emb);
    if (!uid) return;

    items.push({
      userId: uid,
      ts: new Date(m.createdTimestamp),
      source: "correcao",
      });
    },
  });
}

  // EVT3 (via JSON + thread createdTimestamp)
  try {
    const st = readEvt3State();
    const map = st?.evt3Events || {};
    const entries = Object.entries(map);
    const parent = await client.channels
      .fetch(EVT3_EVENT_PARENT_ID)
      .catch(() => null);

    for (const [mainThreadId, info] of entries) {
      const creatorId = String(info?.creatorId || "").trim();
      if (!creatorId) continue;

      let thread = await client.channels.fetch(mainThreadId).catch(() => null);

      if (!thread && parent?.isTextBased?.()) {
        try {
          const active = await parent.threads.fetchActive().catch(() => null);
          thread = active?.threads?.get(mainThreadId) || null;
        } catch {}
        if (!thread) {
          try {
            const archived = await parent.threads
              .fetchArchived({ type: "public", limit: 100 })
              .catch(() => null);
            thread = archived?.threads?.get(mainThreadId) || null;
          } catch {}
        }
      }

      const createdAt = thread?.createdTimestamp
        ? new Date(thread.createdTimestamp)
        : null;
      if (!createdAt) continue;

      items.push({ userId: creatorId, ts: createdAt, source: "evt3" });
    }
  } catch {}

  // bate-ponto (pinned + recentes)
  try {
    const cal = await client.channels
      .fetch(BP_CALENDAR_CHANNEL_ID)
      .catch(() => null);
    if (cal?.isTextBased?.()) {
    // 2) pins (mais rápido)
const pins = await cal.fetchPins().catch(() => null);

      const pinList = pins?.values ? [...pins.values()] : [];

      const recent = await cal.messages.fetch({ limit: 120 }).catch(() => null);
      const recList = recent?.values ? [...recent.values()] : [];

      const pool = new Map();
      for (const m of [...pinList, ...recList]) pool.set(m.id, m);

      for (const msg of pool.values()) {
        const obj = safeParseJSONBlock(msg.content);
        if (!obj?.monthKey || !obj?.days) continue;

        for (const arr of Object.values(obj.days || {})) {
          if (!Array.isArray(arr)) continue;
          for (const e of arr) {
            const uid = String(e?.uid || "").trim();
            const timeStr = String(e?.time || "").trim();
            if (!uid || !timeStr) continue;

            const dt = parseBPTimeToDateSP(timeStr);
            if (!dt) continue;

            if (!/^\d{17,20}$/.test(uid)) continue;
            items.push({ userId: uid, ts: dt, source: "bateponto" });
          }
        }
      }
    }
  } catch {}

  for (const it of items) {
    const wk = weekKeyFromDateSP(it.ts);
    DEBUG.weekKeysFound[wk] = (DEBUG.weekKeysFound[wk] || 0) + 1;
  }

  const payload = { items };
  CACHE = { at: now, payload };
  return payload;
}

function chooseWeeksUnion() {
  const keys = Object.keys(DEBUG.weekKeysFound || {}).sort((a, b) =>
    a > b ? -1 : 1
  );
  return { thisKey: keys[0] || null, lastKey: keys[1] || null, keys };
}

function aggregateByWeek(items, weekKey) {
  const only = items.filter((x) => weekKeyFromDateSP(x.ts) === weekKey);
  const byUser = {};

  for (const e of only) {
    byUser[e.userId] = (byUser[e.userId] || 0) + 1;
  }

  // ✅ APLICA AJUSTES MANUAIS
  const manual = loadManualAdjustments();
  const weekAdj = manual.byWeek?.[weekKey] || {};

  for (const [userId, adj] of Object.entries(weekAdj)) {
    byUser[userId] = (byUser[userId] || 0) + Number(adj);
    if (byUser[userId] <= 0) delete byUser[userId];
  }

  const top = Object.entries(byUser)
    .map(([userId, count]) => ({ userId, count }))
    .sort((a, b) => b.count - a.count);

  const total = Object.values(byUser).reduce((a, b) => a + b, 0);

  return { total, top };
}


function diff(a, b) {
  const d = a - b;
  const pct = b > 0 ? (d / b) * 100 : a > 0 ? 100 : 0;
  const mood = d > 0 ? "🟢" : d < 0 ? "🔴" : "🟡";
  const sign = d > 0 ? "+" : d < 0 ? "−" : "";
  return { d, pct, mood, sign };
}

// ================== BACKFILL (EXTRAS - Doações/Convites/Perguntas) ==================
// Recalcula a SEMANA ATUAL a partir dos canais de LOG dos módulos.
// Isso deixa esses 3 contadores "à prova de restart".

function isDoacaoLogEmbed(emb) {
  const t = norm(emb?.title || emb?.data?.title || "");
  // doacao.js usa: .setTitle("📦 Nova Doação Registrada")
  return t.includes("nova doacao registrada");
}

function bumpWeekly(state, key, weekKey, inc = 1) {
  if (!state.weekly[key]) state.weekly[key] = {};
  state.weekly[key][weekKey] = Number(state.weekly[key][weekKey] || 0) + inc;
}

function getWeekly(state, key, weekKey) {
  return Number(state.weekly?.[key]?.[weekKey] || 0);
}

function getStatusValueFromEmbed(emb) {
  const fields = emb?.fields || emb?.data?.fields || [];
  const f = fields.find((x) => x?.name === "📌 Status");
  return String(f?.value || "");
}

function doacaoWasScoredFromEmbed(emb) {
  try {
    const fields = getFields(emb);
    const anti = fields.find((f) => norm(f?.name).includes("anti-farm"));
    const v = String(anti?.value || "");

    // conta quando pontuou (+1) OU quando é isento (conta tudo)
    // doacao.js monta:
    // - "⚡ Pontuação: **isento** (conta tudo)"
    // - "✅ Pontuação: **+1** (limite 1/h)"
    if (/isento/i.test(v)) return true;
    if (/\+1/.test(v)) return true;

    return false;
  } catch {
    return false;
  }
}

function isPagamentoSocialRecordEmbed(emb) {
  const t = String(emb?.title || emb?.data?.title || "");
  return t.includes("Registro de Pagamento de Evento") && t.includes("SANTACREATORS");
}

function isEventoPoderRecordEmbed(emb) {
  const t = norm(emb?.title || emb?.data?.title || "");
  // ajuste se teu título for diferente
  return (
    t.includes("registro") &&
    (t.includes("uso de poderes") || (t.includes("poderes") && t.includes("evento")))
  );
}

function isConviteLogEmbed(emb) {
  const t = norm(emb?.title || emb?.data?.title || "");
  // lideresConvites.js usa: .setTitle("📣 Convite enviado")
  return t.includes("convite enviado");
}

function isPerguntasLogEmbed(emb) {
  const t = norm(emb?.title || emb?.data?.title || "");
  // teu !perguntas logCompleto usa: '🧾 !perguntas usado'
  return (t.includes("!perguntas") && t.includes("usado")) || t.includes("entrevista iniciada");
}

function isVendaLogEmbed(emb) {
  const t = norm(emb?.title || emb?.data?.title || "");
  // registroVendas.js usa: .setTitle("💰 Registro de Venda")
  return t.includes("registro de venda");
}

// ============================================================================
// ✅ NOVO: extrair userId “dono do ponto” (quem fez) a partir do EMBED de LOG
// - tenta fields primeiro
// - tenta description
// - fallback: primeira menção <@id> que aparecer
// ============================================================================

function pickFirstMentionId(text) {
  const m = /<@!?(\d{17,20})>/.exec(String(text || ""));
  return m ? m[1] : null;
}

function pickFirstIdLoose(text) {
  const s = String(text || "");
  const m = /(\d{17,20})/.exec(s);
  return m ? m[1] : null;
}

function getEmbedTextBag(emb) {
  const fields = getFields(emb);
  const desc = String(emb?.description || emb?.data?.description || "");
  const footer = String(emb?.footer?.text || emb?.data?.footer?.text || "");
  const title = String(emb?.title || emb?.data?.title || "");
  const fieldText = fields.map(f => `${f?.name || ""}\n${f?.value || ""}`).join("\n");
  return `${title}\n${desc}\n${fieldText}\n${footer}`;
}

// DOAÇÃO: geralmente tem "Registrado por" / "Quem registrou" / algo assim
function doacao_getRegistrarId(emb) {
  try {
    const fields = getFields(emb);

    const f =
      fields.find(x => norm(x?.name).includes("registrado por")) ||
      fields.find(x => norm(x?.name).includes("registrante")) ||
      fields.find(x => norm(x?.name).includes("quem registrou")) ||
      fields.find(x => norm(x?.name).includes("autor")) ||
      null;

    if (f) {
      const v = String(f?.value || "");
      return pickFirstMentionId(v) || pickFirstIdLoose(v);
    }

    const bag = getEmbedTextBag(emb);
    return pickFirstMentionId(bag) || pickFirstIdLoose(bag);
  } catch {
    return null;
  }
}

// CONVITE: normalmente tem "Enviado por" / "Líder" / "Registrado por"
function convite_getSenderId(emb) {
  try {
    const fields = getFields(emb);

    const f =
      fields.find(x => norm(x?.name).includes("enviado por")) ||
      fields.find(x => norm(x?.name).includes("lider")) ||
      fields.find(x => norm(x?.name).includes("líder")) ||
      fields.find(x => norm(x?.name).includes("registrado por")) ||
      null;

    if (f) {
      const v = String(f?.value || "");
      return pickFirstMentionId(v) || pickFirstIdLoose(v);
    }

    const bag = getEmbedTextBag(emb);
    return pickFirstMentionId(bag) || pickFirstIdLoose(bag);
  } catch {
    return null;
  }
}

// PERGUNTAS: log do "!perguntas usado" costuma ter o usuário em field/desc
function perguntas_getUserId(emb) {
  try {
    const fields = getFields(emb);

    const f =
      fields.find(x => norm(x?.name).includes("usuario")) ||
      fields.find(x => norm(x?.name).includes("usuário")) ||
      fields.find(x => norm(x?.name).includes("autor")) ||
      fields.find(x => norm(x?.name).includes("id")) ||
      fields.find(x => norm(x?.name).includes("quem")) ||
      fields.find(x => norm(x?.name).includes("aplicador")) ||
      null;

    if (f) {
      const v = String(f?.value || "");
      return pickFirstMentionId(v) || pickFirstIdLoose(v);
    }

    const bag = getEmbedTextBag(emb);
    return pickFirstMentionId(bag) || pickFirstIdLoose(bag);
  } catch {
    return null;
  }
}

// VENDAS: log tem "Vendedor"
function venda_getSellerId(emb) {
  try {
    const fields = getFields(emb);
    const f = fields.find(x => norm(x?.name).includes("vendedor"));
    
    if (f) {
      const v = String(f?.value || "");
      return pickFirstMentionId(v) || pickFirstIdLoose(v);
    }

    const bag = getEmbedTextBag(emb);
    return pickFirstMentionId(bag) || pickFirstIdLoose(bag);
  } catch {
    return null;
  }
}

// Helper para Cronograma (Backfill)
function isCronogramaApprovedEmbed(emb) {
  const isGreen = emb.color === 3066993; // #2ecc71
  const footer = emb.footer?.text || "";
  return isGreen || footer.includes("Aprovado por");
}

function cronograma_getUserId(emb) {
  const desc = emb.description || "";
  const match = desc.match(/Solicitante:.*?<@!?(\d+)>/i);
  return match ? match[1] : null;
}

// Helper para Presença (Backfill/Scan)
function isPresencaLogEmbed(emb) {
  const t = norm(emb?.title || emb?.data?.title || "");
  return t.includes("log de presenca");
}
function presenca_isConfirmed(emb) {
  const t = norm(emb?.title || emb?.data?.title || "");
  return t.includes("confirmou");
}
function presenca_getUserId(emb) {
  const f = getFields(emb).find(x => norm(x?.name).includes("autor"));
  if (!f) return null;
  const v = String(f.value || "");
  return pickFirstMentionId(v) || pickFirstIdLoose(v);
}

// Helper para Correção (Backfill/Scan)
function isCorrecaoLogEmbed(emb) {
  const t = norm(emb?.title || emb?.data?.title || "");
  return t.includes("log de correcao de entrevista");
}
function correcaoWasScored(emb) {
  const f = getFields(emb).find(x => norm(x?.name).includes("anti-farm"));
  return f && (f.value.includes("✅") || f.value.includes("+1"));
}
function correcao_getUserId(emb) {
  const f = getFields(emb).find(x => norm(x?.name).includes("staff que corrigiu"));
  return f ? (pickFirstMentionId(f.value) || pickFirstIdLoose(f.value)) : null;
}

// ✅ NOVO: PARSERS PARA PONTO DE ENTREVISTA
function isEntrevistaConcluidaLogEmbed(emb) {
  const t = norm(emb?.title || emb?.data?.title || "");
  return t.includes("ponto de entrevista concluida");
}

function entrevistaConcluida_getUserId(emb) {
  const fields = getFields(emb);
  // O campo é "🏆 Aplicador (ganhou ponto)"
  const f = fields.find(x => norm(x?.name).includes("aplicador (ganhou ponto)"));
  if (f) {
    const v = String(f?.value || "");
    return pickFirstMentionId(v) || pickFirstIdLoose(v);
  }
  return null;
}

// Helper para Pagamento Social (Backfill)
function pagamento_getStatus(emb) {
  const fields = getFields(emb);
  // ✅ FIX: Checa o VALOR do campo de status, não o nome.
  const statusField = fields.find(f => norm(f.name).includes("status"));
  const statusValue = norm(statusField?.value || "");

  const isPago = statusValue.includes("pago");
  const isReprovado = statusValue.includes("reprovado");
  const isSolicitado = statusValue.includes("solicitado");
  
  return { isPago, isReprovado, isSolicitado };
}

// ================== BACKFILL (GESTAO / PAGAMENTOS) ==================
async function backfillGestaoThisWeek(client) {
  try {
    const st = loadState();
    const wkNow = weekKeyFromDateSP(nowSP());

    // Garante objetos no state e zera contadores da semana atual
    const keysToReset = [
      "rmAprovados", "rmReprovados", "alinhamentos", "eventosPoderes", 
      "poderesUtilizados", "pagCriados", "pagSolicitados", "pagPagos", "pagReprovados"
    ];
    for (const key of keysToReset) {
      st.weekly[key] = st.weekly[key] || {};
      st.weekly[key][wkNow] = 0;
    }

    // -------- MANAGER (Aprovados/Reprovados) --------
    if (CH_MANAGER_ID) {
      await scanCurrentWeekEmbeds(client, CH_MANAGER_ID, (emb) => isRegistroManagerEmbed(emb),
        async (_m, emb) => {
          if (manager_isApproved(emb)) st.weekly.rmAprovados[wkNow] += 1;
          if (manager_isRejected(emb)) st.weekly.rmReprovados[wkNow] += 1;
        }, 25);
    }

    // -------- ALINHAMENTOS --------
    if (CH_ALINHAMENTOS_ID) {
      await scanCurrentWeekEmbeds(client, CH_ALINHAMENTOS_ID, (emb) => isAlinhamentoRecordEmbed(emb),
        async () => { st.weekly.alinhamentos[wkNow] += 1; }, 25);
    }

    // -------- PODERES EM EVENTO (Social Medias) --------
    if (CH_EVENTOS_ID) {
      await scanCurrentWeekEmbeds(client, CH_EVENTOS_ID, (emb) => eventos_getRecordType(emb) === 'eventopoder',
        async () => { st.weekly.eventosPoderes[wkNow] += 1; }, 25);
    }

    // -------- PODERES UTILIZADOS (Geral) --------
    if (CH_PODERES_ID) {
      await scanCurrentWeekEmbeds(client, CH_PODERES_ID, (emb) => isPoderesRecordEmbed(emb),
        async () => { st.weekly.poderesUtilizados[wkNow] += 1; }, 25);
    }
    
    // -------- PAGAMENTO SOCIAL --------
    if (CH_PAGAMENTOS_ID) {
      await scanCurrentWeekEmbeds(client, CH_PAGAMENTOS_ID, (emb) => isPaymentRecordEmbed(emb),
        async (_m, emb) => {
          st.weekly.pagCriados[wkNow] += 1;
          const status = pagamento_getStatus(emb);
          if (status.isSolicitado) st.weekly.pagSolicitados[wkNow] += 1;
          if (status.isPago) st.weekly.pagPagos[wkNow] += 1;
          if (status.isReprovado) st.weekly.pagReprovados[wkNow] += 1;
        }, 25);
    }

    saveState(st);
  } catch (e) {
    console.error("[SC_GERAL_DASH] Erro no backfill de Gestão:", e);
  }
}

// ================== BACKFILL (VIP / HALL / EVENTOS DIÁRIOS) ==================

async function scanCurrentWeekEmbeds(client, channelId, filterFn, actionFn, maxPages = 25) {
  const wkNow = weekKeyFromDateSP(nowSP());
  
  await scanChannelEmbeds(client, {
    channelId,
    weekFloorKey: wkNow,
    maxPages,
    onMessage: async (msg) => {
      const emb = msg.embeds?.[0];
      if (!emb) return;
      
      const wkMsg = weekKeyFromDateSP(new Date(msg.createdTimestamp));
      if (wkMsg !== wkNow) return;

      if (filterFn(emb)) {
        await actionFn(msg, emb);
      }
    }
  });
}

function isVipRecordEmbed(emb) {
  const t = norm(emb?.title || emb?.data?.title || "");
  return t.includes("registro de vip por evento");
}

function vip_getStatus(emb) {
  const fields = getFields(emb);
  
  // Procura campos que comecem com o nome esperado (normalizado)
  const sol = fields.find(f => norm(f.name).startsWith("solicitacoes"))?.value || "";
  const pag = fields.find(f => norm(f.name).startsWith("pagamento"))?.value || "";
  const rep = fields.find(f => norm(f.name).startsWith("reprovacao"))?.value || "";

  return {
    isSolicitado: sol.includes("SOLICITADO"),
    isPago: pag.includes("PAGO"),
    isReprovado: rep.includes("REPROVADO")
  };
}

function isHallDaFamaMsg(msg) {
  // Hall da fama é mensagem de texto enviada pelo bot
  return msg.content && msg.content.includes("HALL DA FAMA");
}

function isEventoDiarioLogEmbed(emb) {
  const t = norm(emb?.title || emb?.data?.title || "");
  // Título do log de cronograma para eventos diários
  return t.includes("evento diario");
}

async function backfillVipAndOthersThisWeek(client) {
  try {
    const st = loadState();
    const wkNow = weekKeyFromDateSP(nowSP());

    // Garante objetos no state
    st.weekly = st.weekly || {};
    st.weekly.vipCriados = st.weekly.vipCriados || {};
    st.weekly.vipSolicitados = st.weekly.vipSolicitados || {};
    st.weekly.vipPagos = st.weekly.vipPagos || {};
    st.weekly.vipReprovados = st.weekly.vipReprovados || {};
    st.weekly.halldafama = st.weekly.halldafama || {};
    st.weekly.eventosdiarios = st.weekly.eventosdiarios || {};

    // Zera semana atual para recalcular
    st.weekly.vipCriados[wkNow] = 0;
    st.weekly.vipSolicitados[wkNow] = 0;
    st.weekly.vipPagos[wkNow] = 0;
    st.weekly.vipReprovados[wkNow] = 0;
    st.weekly.halldafama[wkNow] = 0;
    st.weekly.eventosdiarios[wkNow] = 0;

    // 1. VIP EVENTO (Scan do canal de menu/registros)
    await scanCurrentWeekEmbeds(
      client,
      VIP_MENU_CHANNEL_ID,
      (emb) => isVipRecordEmbed(emb),
      async (_m, emb) => {
        st.weekly.vipCriados[wkNow] += 1;
        
        const status = vip_getStatus(emb);
        if (status.isSolicitado) st.weekly.vipSolicitados[wkNow] += 1;
        if (status.isPago) st.weekly.vipPagos[wkNow] += 1;
        if (status.isReprovado) st.weekly.vipReprovados[wkNow] += 1;
      },
      40 // páginas (olha um pouco mais longe pra garantir)
    );

    // 2. HALL DA FAMA (Scan manual de mensagens de texto)
    const hallCh = await client.channels.fetch(HALL_CHANNEL_ID).catch(() => null);
    if (hallCh?.isTextBased()) {
       let lastId;
       for(let p=0; p<15; p++) {
          const batch = await hallCh.messages.fetch({ limit: 100, before: lastId }).catch(() => null);
          if(!batch?.size) break;
          
          for(const m of batch.values()) {
             const wkMsg = weekKeyFromDateSP(new Date(m.createdTimestamp));
             
             // Se a mensagem é mais nova que a semana atual (futuro?), ignora
             if(wkMsg > wkNow) continue;
             // Se a mensagem é mais velha que a semana atual, para o scan
             if(wkMsg < wkNow) { 
                lastId = null; // Força parada do loop externo
                break; 
             }

             if (isHallDaFamaMsg(m)) {
                st.weekly.halldafama[wkNow] += 1;
             }
          }
          if(!lastId) break; // Sai se o loop interno pediu
          lastId = batch.last()?.id;
       }
    }

    // 3. EVENTOS DIÁRIOS (Log de Cronograma)
    if (CRONOGRAMA_LOGS_CHANNEL_ID) {
      await scanCurrentWeekEmbeds(
        client,
        CRONOGRAMA_LOGS_CHANNEL_ID,
        // Usa isCronogramaApprovedEmbed (já existente) + filtro de título
        (emb) => isEventoDiarioLogEmbed(emb) && isCronogramaApprovedEmbed(emb),
        async (_m, _emb) => {
          st.weekly.eventosdiarios[wkNow] += 1;
        },
        25
      );
    }

    saveState(st);
    return { done: true };

  } catch (e) {
    console.error("[SC_GERAL_DASH] Erro no backfill VIP/Outros:", e);
    return { done: false, error: e };
  }
}

async function backfillExtrasThisWeek(client) {
  try {
    const st = loadState();
    const wkNow = weekKeyFromDateSP(nowSP());

    // garante mapas
    st.weekly = st.weekly || {};
    st.weekly.doacoes = st.weekly.doacoes || {};
    st.weekly.convites = st.weekly.convites || {};
    st.weekly.perguntas = st.weekly.perguntas || {};
    st.weekly.vendas = st.weekly.vendas || {};
    st.weekly.cronograma = st.weekly.cronograma || {};
    st.weekly.presencas = st.weekly.presencas || {};
    st.weekly.correcao = st.weekly.correcao || {};

    // zera semana atual e recalcula
    st.weekly.doacoes[wkNow] = 0;
    st.weekly.convites[wkNow] = 0;
    st.weekly.perguntas[wkNow] = 0;
    st.weekly.vendas[wkNow] = 0;
    st.weekly.cronograma[wkNow] = 0;
    st.weekly.presencas[wkNow] = 0;
    st.weekly.correcao[wkNow] = 0;

    // -------- DOAÇÕES (somente quando pontuou / isento) --------
    if (DOACAO_LOGS_CHANNEL_ID) {
      await scanCurrentWeekEmbeds(
        client,
        DOACAO_LOGS_CHANNEL_ID,
        (emb) => isDoacaoLogEmbed(emb),
        async (_m, emb) => {
          if (doacaoWasScoredFromEmbed(emb)) st.weekly.doacoes[wkNow] += 1;
        },
        25
      );
    }

    // -------- CONVITES (1 por envio; log "📣 Convite enviado") --------
    if (CONVITES_LOGS_CHANNEL_ID) {
      await scanCurrentWeekEmbeds(
        client,
        CONVITES_LOGS_CHANNEL_ID,
        (emb) => isConviteLogEmbed(emb),
        async (_m, _emb) => {
          st.weekly.convites[wkNow] += 1;
        },
        25
      );
    }

    // -------- PONTO DE ENTREVISTA (via entrevista.js) --------
    if (CORRECAO_LOGS_CHANNEL_ID) {
      await scanCurrentWeekEmbeds(
        client,
        CORRECAO_LOGS_CHANNEL_ID,
        (emb) => isEntrevistaConcluidaLogEmbed(emb), // Procura pelo novo log de ponto
        async (_m, _emb) => {
          // Pega o ID do aplicador que ganhou o ponto
          const uid = entrevistaConcluida_getUserId(_emb);
          if (uid) st.weekly.perguntas[wkNow] += 1;
        },
        25
      );
    }

    if (VENDAS_LOGS_CHANNEL_ID) {
      await scanCurrentWeekEmbeds(
        client,
        VENDAS_LOGS_CHANNEL_ID,
        (emb) => isVendaLogEmbed(emb),
        async (_m, emb) => {
          if (doacaoWasScoredFromEmbed(emb)) st.weekly.vendas[wkNow] += 1; // Reusa a lógica de checar campo "Anti-farm"
        },
        25
      );
    }

    // -------- CRONOGRAMA (Aprovados) --------
    if (CRONOGRAMA_LOGS_CHANNEL_ID) {
      await scanCurrentWeekEmbeds(
        client,
        CRONOGRAMA_LOGS_CHANNEL_ID,
        (emb) => isCronogramaApprovedEmbed(emb),
        async (_m, _emb) => {
          st.weekly.cronograma[wkNow] += 1;
        },
        25
      );
    }

    // -------- PRESENÇAS (Confirmadas) --------
    if (PRESENCA_LOGS_CHANNEL_ID) {
      await scanCurrentWeekEmbeds(
        client,
        PRESENCA_LOGS_CHANNEL_ID,
        (emb) => isPresencaLogEmbed(emb) && presenca_isConfirmed(emb),
        async (_m, _emb) => {
          st.weekly.presencas[wkNow] += 1;
        },
        25
      );
    }

    // -------- CORREÇÃO (Pontuou) --------
    if (CORRECAO_LOGS_CHANNEL_ID) {
      await scanCurrentWeekEmbeds(
        client,
        CORRECAO_LOGS_CHANNEL_ID,
        (emb) => isCorrecaoLogEmbed(emb) && correcaoWasScored(emb),
        async (_m, _emb) => {
          st.weekly.correcao[wkNow] += 1;
        },
        25
      );
    }

    // salva
    saveState(st);

    return {
      done: true,
      wkNow,
      doacoes: st.weekly.doacoes[wkNow],
      convites: st.weekly.convites[wkNow],
      perguntas: st.weekly.perguntas[wkNow],
      vendas: st.weekly.vendas[wkNow],
      cronograma: st.weekly.cronograma[wkNow],
      presencas: st.weekly.presencas[wkNow],
    };
  } catch (e) {
    return { done: false, reason: e?.message || "erro" };
  }
}

async function runAllBackfillsOnReady(client) {
  console.log("[SC_GERAL_DASH] 🔄 Rodando backfills...");
  await backfillExtrasThisWeek(client);
  await backfillVipAndOthersThisWeek(client);
  await backfillGestaoThisWeek(client);
  console.log("[SC_GERAL_DASH] ✅ Backfills concluídos.");
}

// ================== DASH UPDATE ==================
async function upsertDashboard(
  client,
  reason,
  { scanMode = "light", emitLog = false } = {}
) {
  // ✅ TRAVA GLOBAL (resolve o “edita uma e manda outra”)
  // Isso evita 2 execuções simultâneas (boot + interval + hub) gerarem duplicata.
  if (globalThis.__SC_GERAL_DASH_UPSERTING__) {
     const now = Date.now();
     const last = globalThis.__SC_GERAL_DASH_LOCK_TS__ || 0;
     if (now - last > 120000) { // 2 min
        console.warn("[SC_GERAL_DASH] ⚠️ Global lock travado. Forçando reset.");
        globalThis.__SC_GERAL_DASH_UPSERTING__ = false;
     } else {
        return false; // ✅ Retorna false indicando que pulou
     }
  }

  globalThis.__SC_GERAL_DASH_UPSERTING__ = true;
  globalThis.__SC_GERAL_DASH_LOCK_TS__ = Date.now();

  try {
    DEBUG.lastRunAt = Date.now();
    DEBUG.lastReason = reason;

    const dash = await client.channels.fetch(DASH_CHANNEL_ID).catch(() => null);
if (!dash?.isTextBased?.()) return false;

// ✅ ANTI-SPAM: se o bot não consegue ler histórico/pins, ele NUNCA vai achar a msg antiga.
// então a gente PARA AQUI pra ele não mandar msg nova a cada restart.
try {
  const me = dash.guild?.members?.me || (await dash.guild.members.fetch(client.user.id).catch(() => null));
  const perms = dash.permissionsFor(me);

  const need = [
  PermissionsBitField.Flags.ViewChannel,
  PermissionsBitField.Flags.SendMessages,
  PermissionsBitField.Flags.ReadMessageHistory, // ✅ essa é a que causa spam se faltar
];

const missing = need.filter((p) => !perms?.has?.(p));

  if (missing.length) {
    console.error(
      "[SC_GERAL_DASH] ❌ SEM PERMISSÃO NO CANAL DO DASH. Vou abortar pra não spammar.",
      { channelId: DASH_CHANNEL_ID, missing, reason }
    );
    return false; // ✅ para antes de send()
  }

  // opcional: pra pin/apagar duplicadas
  // se não tiver, o bot ainda edita normalmente, só não consegue pin/delete
  if (!perms?.has?.(PermissionsBitField.Flags.ManageMessages)) {
  console.warn("[SC_GERAL_DASH] ⚠️ Sem ManageMessages no canal do dash (não vou conseguir pin/delete duplicadas).");
}

} catch (e) {
  console.error("[SC_GERAL_DASH] erro checando permissões:", e?.message || e);
  // se deu erro aqui, melhor abortar também pra evitar spam
  return false;
}

const st = loadState();
DEBUG.dashMsgId = st.dashboardMsgId || null;

const { items } = await collectAllGeneral(client, scanMode);

// ✅ congela a semana passada pra nunca mais mudar
freezeLastWeekIfNeeded(items);

    // ✅ Carrega o snapshot DEPOIS de congelar, para garantir que os dados estão atualizados
    const snap = loadWeeklySnapshot();



    const chosen = chooseWeeksUnion();
    const thisWeekKey = chosen.thisKey;
    const lastWeekKey = chosen.lastKey;

    const cur = thisWeekKey
      ? aggregateByWeek(items, thisWeekKey)
      : { total: 0, top: [] };
    const prev = lastWeekKey
      ? aggregateByWeek(items, lastWeekKey)
      : { total: 0, top: [] };

    // ✅ FIX: Usa o snapshot (valor congelado) para o total passado, se existir.
    // Isso garante que o texto bata com o gráfico e não diminua se mensagens forem apagadas.
    const prevTotalDisplay = (lastWeekKey && snap.totals[lastWeekKey] != null)
      ? snap.totals[lastWeekKey]
      : prev.total;

    const dd = diff(cur.total, prevTotalDisplay);
    const g = gradeLabel(cur.total);

    const top3 = cur.top.slice(0, 3);
    const top3Text = top3.length
      ? [
          `🥇 <@${top3[0].userId}> — **${top3[0].count}**`,
          top3[1]
            ? `🥈 <@${top3[1].userId}> — **${top3[1].count}**`
            : `🥈 _(vazio)_`,
          top3[2]
            ? `🥉 <@${top3[2].userId}> — **${top3[2].count}**`
            : `🥉 _(vazio)_`,
        ].join("\n")
  : "_Ainda sem registros nesta semana_";


    const topLast = prev.top[0]
      ? `<@${prev.top[0].userId}> (**${prev.top[0].count}**)`
      : "_(ninguém)_";

    const barLine = `\`${progressBarGeneralSimple(cur.total, BAR_MAX, 18)}\` **${cur.total}/${BAR_MAX}**`;

    // gráfico geral (últimas 4 semanas do “scan antigo”)
    const weekKeysDesc = (chosen.keys || []).slice(0, 4);
    const weekKeysAsc = [...weekKeysDesc].sort((a, b) => (a > b ? 1 : -1));
    const chartLabels = weekKeysAsc.map((k) => triLabelShortFromWeekKey(k));

const chartData = weekKeysAsc.map((k) => {
  // semana atual SEMPRE recalcula
  if (k === thisWeekKey) {
    return aggregateByWeek(items, k).total;
  }

  // semanas passadas usam snapshot congelado
  if (snap.totals[k] != null) {
    return snap.totals[k];
  }

  // fallback (caso antigo)
  return aggregateByWeek(items, k).total;
});


    const chartUrl = chartUrlLast4Weeks({
      labels: chartLabels,
      data: chartData,
      title: "Histórico — Últimas 4 semanas (GERAL)",
    });

    // ====== métricas humanas (doação/vip/líder/perguntas) ======
// wk = semana do SCAN (pode “puxar” a última semana com atividade nos canais)
const wk = thisWeekKey || weekKeyFromDateSP(nowSP());

// ✅ wkNow = semana atual REAL (SP) — só pra Doação / Convites / Perguntas não ficarem 0
const wkNow = weekKeyFromDateSP(nowSP());

// ✅ SÓ esses 3 usam wkNow (sem interferir no resto)
const mDoacoes = getWeekly(st, "doacoes", wkNow);
const mConvites = getWeekly(st, "convites", wkNow);
const mPerg = getWeekly(st, "perguntas", wkNow);
const mVendas = getWeekly(st, "vendas", wkNow);
const mCronograma = getWeekly(st, "cronograma", wk); // usa wk do scan (histórico)
const mPresencas = getWeekly(st, "presencas", wkNow); // ✅ NOVO
const mHall = getWeekly(st, "halldafama", wkNow); // ✅ NOVO
const mEventosDiarios = getWeekly(st, "eventosdiarios", wkNow); // ✅ NOVO
const mCorrecao = getWeekly(st, "correcao", wkNow); // ✅ NOVO

// ✅ todo o resto continua como tava (wk do scan)
const mVipCriados = getWeekly(st, "vipCriados", wk);
const mVipSol = getWeekly(st, "vipSolicitados", wk);
const mVipPago = getWeekly(st, "vipPagos", wk);
const mVipRep = getWeekly(st, "vipReprovados", wk);
const mRmOk = getWeekly(st, "rmAprovados", wk);
const mRmNo = getWeekly(st, "rmReprovados", wk);
const mAlinh = getWeekly(st, "alinhamentos", wk);
const mEvtPoder = getWeekly(st, "eventosPoderes", wk);
const mPoderesUtil = getWeekly(st, "poderesUtilizados", wk);

// ✅ pagamentos social
const mPagCriados = getWeekly(st, "pagCriados", wk);
const mPagSol = getWeekly(st, "pagSolicitados", wk);
const mPagPago = getWeekly(st, "pagPagos", wk);
const mPagRep = getWeekly(st, "pagReprovados", wk);


    // ================== LOG DE ATIVIDADE (CANAL SEPARADO) ==================
    // ✅ Só roda quando emitLog = true (ou seja: NÃO roda no boot)
    if (emitLog) {
      try {
        // ✅ USA O RESOLVEDOR
        const logChannel = await resolveLogChannel(client, DASH_LOG_CHANNEL_ID);

        if (logChannel) {
          st.logWeeklyMsgIds = st.logWeeklyMsgIds || {};

          const wkLabel = triLabelShortFromWeekKey(wk);
const wkNowLabel = triLabelShortFromWeekKey(wkNow);


          const logEmbed = new EmbedBuilder()
            .setColor(0x2b2d31)
            .setTitle("🧠 Atividades — GeralDash (SEMANA ATUAL)")
            .setDescription(
              [
                `📆 **Semana (scan):** **${wkLabel}**`,
                `📆 **Semana (Doação/Convites/Perguntas):** **${wkNowLabel}**`,
                "",
                "👨‍💼 **REGISTROS / GESTÃO**",
                `• Manager aprovados: **${mRmOk}**`,
                `• Manager reprovados: **${mRmNo}**`,
                `• Alinhamentos: **${mAlinh}**`,
                `• Poderes em Evento (Social Medias): **${mEvtPoder}**`,
                `• Poderes Utilizados (geral): **${mPoderesUtil}**`,
                "",
                "💸 **FINANCEIRO — PAGAMENTO SOCIAL**",
                `• Criados: **${mPagCriados}**`,
                `• Solicitados: **${mPagSol}**`,
                `• Pagos: **${mPagPago}**`,
                `• Reprovados: **${mPagRep}**`,
                "",
                "💎 **BENEFÍCIOS — VIP EVENTO**",
                `• Criados: **${mVipCriados}**`,
                `• Solicitados: **${mVipSol}**`,
                `• Pagos: **${mVipPago}**`,
                `• Reprovados: **${mVipRep}**`,
                "",
                "📊 **OUTROS**",
                `• Doações: **${mDoacoes}**`,
                `• Convites: **${mConvites}**`,
                `• Perguntas: **${mPerg}**`,
                `• Vendas: **${mVendas}**`,
                `• Cronograma: **${mCronograma}**`,
                `• Presenças Confirmadas: **${mPresencas}**`, // ✅ NOVO
                `• Hall da Fama: **${mHall}**`, // ✅ NOVO
                `• Eventos Diários: **${mEventosDiarios}**`, // ✅ NOVO
                `• Correções: **${mCorrecao}**`, // ✅ NOVO
              ].join("\n")
            )
            .setFooter({ text: `WEEK_KEY: ${wk}` })
            .setTimestamp(nowSP());

          // ✅ assinatura SEM timestamp (só muda quando os números mudam)
const sigObj = {
  wk,
  mRmOk, mRmNo,
  mAlinh, mEvtPoder, mPoderesUtil,
  mPagCriados, mPagSol, mPagPago, mPagRep,
  mVipCriados, mVipSol, mVipPago, mVipRep,
  mDoacoes, mConvites, mPerg, mVendas, mCronograma, mPresencas, mHall, mEventosDiarios, mCorrecao // ✅ NOVO
};

const newSig = JSON.stringify(sigObj);
st._logSig = st._logSig || {};
const oldSig = st._logSig[wk];

          if (oldSig !== newSig) {
            // ✅ tenta achar a msg certa (por ID salvo ou por busca no canal)
            const msgToEdit = await resolveLogMessageForWeek(logChannel, st, wk);

            if (msgToEdit) {
              await msgToEdit.edit({ embeds: [logEmbed] }).catch(() => {});
            } else {
              // ✅ se não achou nenhuma, cria UMA e salva o ID
              const created = await logChannel.send({ embeds: [logEmbed] }).catch(() => null);
              if (created) st.logWeeklyMsgIds[wk] = created.id;
            }

            st._logSig[wk] = newSig;
            saveState(st);
          }
        }
      } catch {}
    }

    const metricsHuman = [
      "🧑‍💼 **REGISTROS / GESTÃO**",
      `• Manager aprovados: **${mRmOk}**`,
      `• Manager reprovados: **${mRmNo}**`,
      `• Alinhamentos: **${mAlinh}**`,
      `• Poderes em Evento (Social Medias): **${mEvtPoder}**`,
      `• Poderes Utilizados (geral): **${mPoderesUtil}**`,
      "",
      "💸 **FINANCEIRO — PAGAMENTO SOCIAL**",
      `• Criados: **${mPagCriados}**`,
      `• Solicitados: **${mPagSol}**`,
      `• Pagos: **${mPagPago}**`,
      `• Reprovados: **${mPagRep}**`,
      "",
      "💎 **BENEFÍCIOS — VIP EVENTO**",
      `• Criados: **${mVipCriados}**`,
      `• Solicitados: **${mVipSol}**`,
      `• Pagos: **${mVipPago}**`,
      `• Reprovados: **${mVipRep}**`,
      "",
      "📊 **OUTROS**",
      `• Doações: **${mDoacoes}**`,
      `• Convites: **${mConvites}**`,
      `• Perguntas: **${mPerg}**`,
      `• Vendas: **${mVendas}**`,
      `• Cronograma: **${mCronograma}**`,
      `• Presenças: **${mPresencas}**`, // ✅ NOVO
      `• Hall da Fama: **${mHall}**`, // ✅ NOVO
      `• Eventos Diários: **${mEventosDiarios}**`, // ✅ NOVO
      `• Correções: **${mCorrecao}**`, // ✅ NOVO
    ].join("\n");

    const mainColor =
      cur.total >= 350
        ? 0x16a34a
        : cur.total >= 300
        ? 0x22c55e
        : cur.total >= 250
        ? 0x4ade80
        : cur.total >= 200
        ? 0xfacc15
        : cur.total >= 150
        ? 0xfde047
        : cur.total >= 100
        ? 0xf59e0b
        : cur.total >= 50
        ? 0xef4444
        : 0x991b1b;

    const embedMain = new EmbedBuilder()
      .setColor(mainColor)
.setTitle("📈 GeralDash — Desempenho Semanal (Meta 350)")
      .setImage(DASH_BANNER_URL)
      .setDescription(
        [
          `📆 **Semana Atual:** **${
            thisWeekKey ? triLabelShortFromWeekKey(thisWeekKey) : "—"
          }**`,
          `📆 **Semana Passada:** **${
            lastWeekKey ? triLabelShortFromWeekKey(lastWeekKey) : "—"
          }**`,
          "",
          `📌 **Total Atual:** **${cur.total}**`,
          `📌 **Total Passado:** **${prevTotalDisplay}**`,
          `📊 **Diferença:** ${dd.mood} **${dd.sign}${Math.abs(dd.d)}** (${dd.pct.toFixed(
            1
          )}%)`,
          "",
          `${g.emoji} **Status:** **${g.label}**`,
          "",
          `📍 **Progresso:** ${barLine}`,
          "",
          `🏆 **Top 1 da semana passada:** ${topLast}`,
        ].join("\n")
      )
      .addFields({ name: "🏅 Top 3 — Semana Atual", value: top3Text, inline: false })
      // ✅ assinatura fixa pra achar a msg no restart
      .setFooter({ text: `${DASH_MARKER}` })
      .setTimestamp(nowSP());

    const embedChart = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("📊 Gráfico — Últimas 4 semanas")
      .setDescription("Total geral por semana (número em cima de cada barra).")
      .setImage(chartUrl);

    const embeds = [embedMain, embedChart];

    // ================== BOTÃO ADMIN — REMOVER PONTO ==================
const adminRow = new ActionRowBuilder().addComponents(
  new ButtonBuilder()
    .setCustomId("geraldash_remove_point")
 .setLabel("Ajuste manual (-)")
    .setStyle(ButtonStyle.Danger)
    .setDisabled(false)
);



    /// ✅ resolve a msg fixa do dash SEMPRE (ID -> pins -> histórico)
let msg = await resolveDashboardMessage(dash, st);

// ✅ marker no content pra achar SEMPRE no restart
const me = dash.guild?.members?.me || await dash.guild.members.fetch(client.user.id).catch(() => null);
const perms = dash.permissionsFor(me);

const components = perms?.has(PermissionsBitField.Flags.Administrator)
  ? [adminRow]
  : [];

const payload = {
  content: `‎\n${DASH_MARKER}`,
  embeds,
  components,
};




// ✅ se não achou, antes de criar: tenta achar nas 50 mais recentes (extra safe)
if (!msg) {
  const recent = await dash.messages.fetch({ limit: 50 }).catch(() => null);

  if (recent?.size) {
    const botId = String(client.user.id);
    const found = [...recent.values()].find((m) => {
      if (String(m.author?.id || "") !== botId) return false;

      const c = String(m.content || "");
      if (c.includes(DASH_MARKER)) return true;

      const embs = Array.isArray(m.embeds) ? m.embeds : [];
      return embs.some((e) => {
        const footer = e?.footer?.text || e?.data?.footer?.text || "";
        return String(footer).includes(DASH_MARKER);
      });
    });

    if (found) {
      msg = found;
      st.dashboardMsgId = msg.id;
      saveState(st);
    }
  }
}

if (!msg) {
  // ✅ só cria se realmente não existir mais
  msg = await dash.send(payload).catch((e) => {
    console.error("[SC_GERAL_DASH] ❌ Erro ao enviar nova mensagem:", e);
    return null;
  });
  if (!msg) return;

  st.dashboardMsgId = msg.id;
  saveState(st);
} else {
  await msg.edit(payload).catch((e) => {
    console.error("[SC_GERAL_DASH] ❌ Erro ao editar mensagem:", e);
    return null;
  });
}

// ✅ pinar só se tiver ManageMessages (senão fica tentando toda hora)
try {
  const me = dash.guild?.members?.me || (await dash.guild.members.fetch(client.user.id).catch(() => null));
  const perms = dash.permissionsFor(me);
  if (perms?.has?.(PermissionsBitField.Flags.ManageMessages)) {
  if (msg && !msg.pinned) await msg.pin().catch(() => {});
}

} catch {}

    st.lastScanAt = Date.now();
    st.nextAllowedAt = NEXT_ALLOWED_AT;
    saveState(st);

    // console.log("[SC_GERAL_DASH] atualizado ✅", { reason, scanMode });
    return true; // ✅ Sucesso
  } finally {
    // ✅ libera a trava global SEMPRE
    globalThis.__SC_GERAL_DASH_UPSERTING__ = false;
    globalThis.__SC_GERAL_DASH_LOCK_TS__ = 0;
  }
}


async function safeUpdate(client, reason, opts = {}) {
  // ✅ FIX: Auto-unlock local se travado > 2min
  if (LOCK) {
     if (Date.now() - LOCK_TS > 120000) {
        console.warn("[SC_GERAL_DASH] ⚠️ Local LOCK travado. Resetando.");
        LOCK = false;
     } else {
        return false;
     }
  }

  LOCK = true;
  LOCK_TS = Date.now();
  try {
    return await upsertDashboard(client, reason, opts); // ✅ Retorna o resultado real
  } finally {
    LOCK = false;
    LOCK_TS = 0;
  }
}



function debugText() {
  const keys =
    Object.entries(DEBUG.weekKeysFound || {})
      .sort((a, b) => (a[0] > b[0] ? -1 : 1))
      .slice(0, 8)
      .map(([k, v]) => `${k}=${v}`)
      .join(" • ") || "(nenhuma)";

  const st = loadState();
  return [
    `🧾 Debug GERAL v3.0`,
    `• keys(scan): ${keys}`,
    `• lastReason: ${DEBUG.lastReason || "—"}`,
    `• dirty: ${DIRTY ? "sim" : "não"}`,
    `• nextAllowedAt: ${
      st.nextAllowedAt ? new Date(st.nextAllowedAt).toLocaleString("pt-BR") : "—"
    }`,
  ].join("\n");
}

// ================== HUB LISTENERS (human events) ==================
function wireHub(client) {
  if (client.__scGeralDashHubWired) return;
  client.__scGeralDashHubWired = true;

  const markDirty = (opts = {}) => {
  DIRTY = true;

  // ✅ FIX: se a mudança pode afetar o Top 3 / total do scan,
  // invalida o cache pra atualizar "na hora".
  if (opts.invalidateScanCache) {
    CACHE = { at: 0, payload: null };
    DEBUG.weekKeysFound = {};
  }
};

// ✅ BATE PONTO -> altera ranking (scan)
// FIX: faz update "fast" (não depende do scheduler de 60s)
let BP_FAST_TIMER = null;
let BP_FAST_LAST_AT = 0;

dashOn("bp:punch", (_p) => {
  // invalida cache IMEDIATO
  markDirty({ invalidateScanCache: true });

  // throttle pra não spammar
  const now = Date.now();
  if (now - BP_FAST_LAST_AT < 15 * 1000) return; // 15s

  // agenda update fast em ~6s (tempo do Discord terminar edit/pin)
  if (BP_FAST_TIMER) clearTimeout(BP_FAST_TIMER);

  BP_FAST_TIMER = setTimeout(async () => {
    try {
      BP_FAST_LAST_AT = Date.now();
      DIRTY = false; // já vamos atualizar aqui mesmo

      await safeUpdate(client, "bp:punch fast update", { scanMode: "light", emitLog: true });
      // console.log("[SC_GERAL_DASH] bp:punch fast ✅");
    } catch (e) {
      console.error("[SC_GERAL_DASH] bp:punch fast erro:", e);
    }
  }, 6000);
});




  dashOn("doacao:registrada", (p) => {
    try {
      const st = loadState();
      const wk = weekKeyFromDateSP(new Date(p.__at || Date.now()));
      bumpWeekly(st, "doacoes", wk, 1);
      saveState(st);
    } catch {}
    // ✅ altera ranking/total (agora entra em items via logs)
  markDirty({ invalidateScanCache: true });
});
  

  dashOn("lideres:convite_enviado", (p) => {
  try {
    const st = loadState();
    const wk = weekKeyFromDateSP(new Date(p.__at || Date.now()));
    bumpWeekly(st, "convites", wk, 1);
    saveState(st);
  } catch {}

  // ✅ como CONVITES entra no ranking via scan do canal de LOG,
  // invalida cache pra Top/Geral refletir na hora
  markDirty({ invalidateScanCache: true });
});

  dashOn("venda:registrada", (p) => {
    try {
      const st = loadState();
      const wk = weekKeyFromDateSP(new Date(p.__at || Date.now()));
      bumpWeekly(st, "vendas", wk, 1);
      saveState(st);
    } catch {}
    markDirty({ invalidateScanCache: true });
  });

  // ✅ CRONOGRAMA
  dashOn("cronograma:aprovado", (p) => {
    try {
      const st = loadState();
      const wk = weekKeyFromDateSP(new Date(p.at || Date.now()));
      bumpWeekly(st, "cronograma", wk, 1);
      saveState(st);
    } catch {}
    markDirty({ invalidateScanCache: true });
  });

  // ✅ HALL DA FAMA
  dashOn("halldafama:aprovado", (p) => {
    try {
      const st = loadState();
      const wk = weekKeyFromDateSP(new Date(p.at || Date.now()));
      bumpWeekly(st, "halldafama", wk, 1);
      saveState(st);
    } catch {}
    markDirty({ invalidateScanCache: true });
  });

  // ✅ EVENTOS DIÁRIOS
  dashOn("eventosdiarios:aprovado", (p) => {
    try {
      const st = loadState();
      const wk = weekKeyFromDateSP(new Date(p.at || Date.now()));
      bumpWeekly(st, "eventosdiarios", wk, 1);
      saveState(st);
    } catch {}
    markDirty({ invalidateScanCache: true });
  });

  // ✅ PRESENÇA CONFIRMADA
  dashOn("presenca:confirmada", (p) => {
    try {
      const st = loadState();
      const wk = weekKeyFromDateSP(new Date(p.__at || Date.now()));
      bumpWeekly(st, "presencas", wk, 1);
      saveState(st);
    } catch {}
    markDirty({ invalidateScanCache: true });
  });

  // ✅ PRESENÇA CONFIRMADA
  dashOn("presenca:confirmada", (p) => {
    try {
      const st = loadState();
      const wk = weekKeyFromDateSP(new Date(p.__at || Date.now()));
      bumpWeekly(st, "presencas", wk, 1);
      saveState(st);
    } catch {}
    markDirty({ invalidateScanCache: true });
  });

  // ✅ CORREÇÃO
  dashOn("correcao:usado", (p) => {
    try {
      const st = loadState();
      const wk = weekKeyFromDateSP(new Date(p.__at || Date.now()));
      bumpWeekly(st, "correcao", wk, 1);
      saveState(st);
    } catch {}
    markDirty({ invalidateScanCache: true });
  });

  // ✅ GI: DESLIGADO -> Remove do Ranking/Geral (aplica ajuste negativo massivo na semana)
  dashOn("gi:desligado", (p) => {
    try {
      const userId = p.userId;
      if (!userId) return;

      const wk = weekKeyFromDateSP(nowSP());
      const manual = loadManualAdjustments();
      
      manual.byWeek = manual.byWeek || {};
      manual.byWeek[wk] = manual.byWeek[wk] || {};
      
      // Aplica penalidade visual para sumir do ranking/geral (-99999)
      // Isso NÃO apaga os logs de manager/social media, apenas remove a pontuação do painel.
      manual.byWeek[wk][userId] = -99999;
      
      saveManualAdjustments(manual);
      
      // Força atualização imediata
      markDirty({ invalidateScanCache: true });
      
      // console.log(`[SC_GERAL_DASH] Usuário ${userId} desligado. Removido do ranking da semana ${wk}.`);
    } catch (e) {
      console.error("[SC_GERAL_DASH] Erro ao processar desligamento:", e);
    }
  });

  dashOn("vip:criado", (p) => {
    try {
      const st = loadState();
      const wk = weekKeyFromDateSP(new Date(p.__at || Date.now()));
      bumpWeekly(st, "vipCriados", wk, 1);
      saveState(st);
    } catch {}
    markDirty();
  });

  dashOn("vip:solicitado", (p) => {
    try {
      const st = loadState();
      const wk = weekKeyFromDateSP(new Date(p.__at || Date.now()));
      bumpWeekly(st, "vipSolicitados", wk, 1);
      saveState(st);
    } catch {}
    markDirty();
  });

  dashOn("vip:pago", (p) => {
    try {
      const st = loadState();
      const wk = weekKeyFromDateSP(new Date(p.__at || Date.now()));
      bumpWeekly(st, "vipPagos", wk, 1);
      saveState(st);
    } catch {}
    markDirty();
  });

  dashOn("vip:reprovado", (p) => {
    try {
      const st = loadState();
      const wk = weekKeyFromDateSP(new Date(p.__at || Date.now()));
      bumpWeekly(st, "vipReprovados", wk, 1);
      saveState(st);
    } catch {}
    markDirty();
  });

   dashOn("entrevista:perguntas", (p) => {
  try {
    const st = loadState();
    const wk = weekKeyFromDateSP(new Date(p.__at || Date.now()));
    bumpWeekly(st, "perguntas", wk, 1);
    saveState(st);
  } catch {}

  // ✅ perguntas também entra no ranking via scan do canal de LOG
  markDirty({ invalidateScanCache: true });
});



  // ✅ RM
  dashOn("rm:approved", (p) => {
  try {
    const st = loadState();
    const wk = weekKeyFromDateSP(new Date(p.__at || Date.now()));
    bumpWeekly(st, "rmAprovados", wk, 1);
    saveState(st);
  } catch {}
  // ✅ aqui precisa, porque o Top 3 depende do scan do canal RM
  markDirty({ invalidateScanCache: true });
});

dashOn("rm:rejected", (p) => {
  try {
    const st = loadState();
    const wk = weekKeyFromDateSP(new Date(p.__at || Date.now()));
    bumpWeekly(st, "rmReprovados", wk, 1);
    saveState(st);
  } catch {}
  // ✅ também pode alterar semana/contagem dependendo do teu fluxo
  markDirty({ invalidateScanCache: true });
});


    // ✅ ALINHAMENTOS (ALINV1)
  dashOn("alinhamento:registrado", (p) => {
    try {
      const st = loadState();
      const wk = weekKeyFromDateSP(new Date(p.__at || Date.now()));
      bumpWeekly(st, "alinhamentos", wk, 1);
      saveState(st);
    } catch {}

    // ✅ altera ranking/total do scan, então invalida cache
    markDirty({ invalidateScanCache: true });
  });

  // ✅ REGISTRO DE PODERES EM EVENTO (via HUB)
  dashOn("eventopoder:registrado", (p) => {
    try {
      const st = loadState();
      const wk = weekKeyFromDateSP(new Date(p.__at || Date.now()));
      bumpWeekly(st, "eventosPoderes", wk, 1);
      saveState(st);
    } catch {}

    

    // ✅ isso mexe em ranking/total também (porque vira msg no canal CH_EVENTOS_ID)
    markDirty({ invalidateScanCache: true });
  });

// ✅ PODERES UTILIZADOS (canal 137406...) -> métrica humana separada
dashOn("poderes:registrado", (p) => {
  try {
    const st = loadState();
    const wk = weekKeyFromDateSP(new Date(p.__at || Date.now()));
    bumpWeekly(st, "poderesUtilizados", wk, 1);
    saveState(st);
  } catch {}

  // ✅ pode mexer no ranking/total porque vira msg no canal de poderes
  markDirty({ invalidateScanCache: true });
});

  // ✅ PAGAMENTOS SOCIAL (via HUB)
  dashOn("pagamento:criado", (p) => {
    try {
      const st = loadState();
      const wk = weekKeyFromDateSP(new Date(p.__at || Date.now()));
      bumpWeekly(st, "pagCriados", wk, 1);
      saveState(st);
    } catch {}
    markDirty();
  });

  dashOn("pagamento:solicitado", (p) => {
    try {
      const st = loadState();
      const wk = weekKeyFromDateSP(new Date(p.__at || Date.now()));
      bumpWeekly(st, "pagSolicitados", wk, 1);
      saveState(st);
    } catch {}
    markDirty();
  });

  dashOn("pagamento:pago", (p) => {
    try {
      const st = loadState();
      const wk = weekKeyFromDateSP(new Date(p.__at || Date.now()));
      bumpWeekly(st, "pagPagos", wk, 1);
      saveState(st);
    } catch {}
    markDirty();
  });

  dashOn("pagamento:reprovado", (p) => {
    try {
      const st = loadState();
      const wk = weekKeyFromDateSP(new Date(p.__at || Date.now()));
      bumpWeekly(st, "pagReprovados", wk, 1);
      saveState(st);
    } catch {}
    markDirty();
  });

   // scheduler levinho
  setInterval(async () => {
    try {
      if (!client.isReady()) return;

      const st = loadState();
      NEXT_ALLOWED_AT = Number(st.nextAllowedAt || 0);

      // se ninguém mexeu, não faz nada
      if (!DIRTY) return;

      // ✅ SÓ limpa o DIRTY se a atualização rodar com sucesso (não estiver travada)
      const didRun = await safeUpdate(client, "hub dirty (light)", { scanMode: "light", emitLog: true });
      
      if (didRun) {
        DIRTY = false;
        const now = Date.now();
        st.lastHumanLightAt = now;
        saveState(st);
      }

    } catch {}
  }, 60 * 1000);
}

// ================== EXPORTS (plug no index) ==================
export async function geralDashOnReady(client) {
 // ✅ se esse arquivo foi importado 2x, a 2ª vez NÃO roda nada
  if (__SC_GERAL_DASH_SKIP__) return;
 
  // ✅ GUARDA PRA NÃO RODAR 2x NO MESMO PROCESSO
  if (client.__SC_GERAL_DASH_READY_RAN_V3__) return;
  client.__SC_GERAL_DASH_READY_RAN_V3__ = true;

  wireHub(client);

  // ✅ Backfill unificado para evitar sobreescrita de estado
  await runAllBackfillsOnReady(client);
  const st = loadState();

  const now = Date.now();
  const firstBoot = !st.lastBootFullScanAt;

  if (BOOT_SCAN_FULL) {
    NEXT_ALLOWED_AT = now + COOLDOWN_MS;
    st.lastBootFullScanAt = now;
    st.nextAllowedAt = NEXT_ALLOWED_AT;
    saveState(st);

    // ✅ NO BOOT: não cria log durante o full scan (pra não spammar)
    await safeUpdate(client, "boot full scan", { scanMode: "full", emitLog: false });

    // ✅ FIX: no restart, o state já foi reconstruído pelos backfills,
    // mas o LOG fica “congelado” (0) porque emitLog tava false.
    // Então rodamos um update leve só pra EDITAR a msg do log.
    await safeUpdate(client, "boot sync log (light)", { scanMode: "light", emitLog: true });

    DIRTY = false;
    return;
  }

  NEXT_ALLOWED_AT = Math.max(Number(st.nextAllowedAt || 0), now + COOLDOWN_MS);
  st.nextAllowedAt = NEXT_ALLOWED_AT;
  saveState(st);

  if (firstBoot) {
    // ✅ NO BOOT: NÃO EMITE LOG
    await safeUpdate(client, "boot light", { scanMode: "light", emitLog: false });
    DIRTY = false;
  }
}

// ================== EXPORT: COMMAND HANDLER ==================
// Comandos:
//   !geraldashrefresh  -> força update (full scan)
//   !geraldashdebug    -> mostra debug (ephemeral via reply temporário)

export async function geralDashHandleInteraction(interaction, client) {

  // ================== BOTÃO ==================
  if (interaction.isButton()) {
    if (interaction.customId !== "geraldash_remove_point") return false;

    const member = interaction.member;
    const hasRole = member?.roles?.cache?.some((r) => MANUAL_ADJUST_ALLOWED_ROLES.has(r.id));
    const isAllowedUser = MANUAL_ADJUST_ALLOWED_USERS.has(member.id);

    if (!hasRole && !isAllowedUser) {
      await interaction.reply({
        content: "❌ Sem permissão.",
        ephemeral: true,
      });
      return true;
    }

    const modal = new ModalBuilder()
      .setCustomId("geraldash_remove_point_modal")
      .setTitle("Remover pontos — GeralDash");

    const inputUser = new TextInputBuilder()
      .setCustomId("userId")
      .setLabel("ID do Manager")
      .setPlaceholder("Ex: 123456789012345678")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const inputQty = new TextInputBuilder()
      .setCustomId("qty")
      .setLabel("Quantos pontos REMOVER?")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(inputUser),
      new ActionRowBuilder().addComponents(inputQty)
    );

    await interaction.showModal(modal);
    return true;
  }

  // ================== MODAL ==================
  if (interaction.isModalSubmit()) {
    if (interaction.customId !== "geraldash_remove_point_modal") return false;

    const member = interaction.member;
    const hasRole = member?.roles?.cache?.some((r) => MANUAL_ADJUST_ALLOWED_ROLES.has(r.id));
    const isAllowedUser = MANUAL_ADJUST_ALLOWED_USERS.has(member.id);

    if (!hasRole && !isAllowedUser) {
      await interaction.reply({
        content: "❌ Sem permissão.",
        ephemeral: true,
      });
      return true;
    }

    await interaction.deferReply({ ephemeral: true });

    const userId = interaction.fields.getTextInputValue("userId");

    if (!/^\d{17,20}$/.test(userId)) {
      await interaction.editReply({ content: "❌ ID de usuário inválido." });
      return true;
    }

    const qty = Number(interaction.fields.getTextInputValue("qty"));

    if (!Number.isInteger(qty) || qty <= 0 || qty > 50) {
      await interaction.editReply({ content: "❌ Quantidade inválida (1 a 50)." });
      return true;
    }

    const chosen = chooseWeeksUnion();
    const wk = chosen.thisKey || weekKeyFromDateSP(nowSP());

    const manual = loadManualAdjustments();
    manual.byWeek[wk] = manual.byWeek[wk] || {};
    manual.byWeek[wk][userId] =
      (manual.byWeek[wk][userId] || 0) - qty;

    saveManualAdjustments(manual);

    CACHE = { at: 0, payload: null };
    DIRTY = true;

    await safeUpdate(client, "manual remove point (modal)", {
      scanMode: "light",
      emitLog: true,
    });

    await interaction.editReply({
      content: `✅ Ajuste aplicado!\n➖ **${qty}** ponto(s) removido(s) de <@${userId}>.`,
    });

    return true;
  }

  return false;
}




export async function geralDashHandleMessage(message, client) {
  // ✅ proteção básica
  if (!message?.guild || message.author?.bot) return false;

  const content = String(message.content || "").trim();
  const low = content.toLowerCase();

  // ================== COMANDO ADMIN: !removept ==================
  if (low.startsWith("!removept")) {
    const member = message.member;
    const hasRole = member?.roles?.cache?.some((r) => MANUAL_ADJUST_ALLOWED_ROLES.has(r.id));
    const isAllowedUser = MANUAL_ADJUST_ALLOWED_USERS.has(member.id);
    if (!hasRole && !isAllowedUser) {
      await message.channel.send("❌ Sem permissão.");
      return true;
    }


    const args = content.split(/\s+/);
    const mention = args[1];
    const qty = Number(args[2] || 1);

    const m = /<@!?(\d{17,20})>/.exec(mention || "");
    if (!m || !qty || qty <= 0) {
      await message.channel.send(
        "❌ Uso correto: `!removept @usuario quantidade`"
      );
      return true;
    }

    const userId = m[1];
const chosen = chooseWeeksUnion();
const wk = chosen.thisKey || weekKeyFromDateSP(nowSP());

    const manual = loadManualAdjustments();
    manual.byWeek[wk] = manual.byWeek[wk] || {};
    manual.byWeek[wk][userId] =
      (manual.byWeek[wk][userId] || 0) - qty;

    saveManualAdjustments(manual);

    // força atualização geral
    CACHE = { at: 0, payload: null };
    DIRTY = true;

    await safeUpdate(client, "manual remove point", {
      scanMode: "light",
      emitLog: true,
    });

    await message.channel.send(
      `✅ Removido **${qty}** ponto(s) de <@${userId}>.`
    );
    return true;
  }

  // ================== COMANDOS NORMAIS DO DASH ==================
  if (__SC_GERAL_DASH_SKIP__) return false;

  if (!low.startsWith("!geraldash")) return false;

  try {
    await message.delete().catch(() => {});
  } catch {}

  if (low === "!geraldashdebug") {
    const txt = debugText();
    const reply = await message.channel
      .send("```" + txt + "```")
      .catch(() => null);
    if (reply) setTimeout(() => reply.delete().catch(() => {}), 15000);
    return true;
  }

  if (low === "!geraldashrefresh") {
    // ✅ FORCE UNLOCK: Destrava qualquer processo preso
    LOCK = false;
    globalThis.__SC_GERAL_DASH_UPSERTING__ = false;
    globalThis.__SC_GERAL_DASH_LOCK_TS__ = 0;
    console.log("[SC_GERAL_DASH] 🔓 Desbloqueio forçado via comando.");

    DIRTY = false;
    NEXT_ALLOWED_AT = Date.now() + COOLDOWN_MS;

    const st = loadState();
    st.nextAllowedAt = NEXT_ALLOWED_AT;
    saveState(st);

    // ✅ Roda o backfill unificado
    await runAllBackfillsOnReady(client);

    await safeUpdate(client, "manual refresh (!geraldashrefresh)", {
      scanMode: "full",
      emitLog: true,
    });

    const ok = await message.channel
      .send("✅ GeralDash atualizado (full scan).")
      .catch(() => null);
    if (ok) setTimeout(() => ok.delete().catch(() => {}), 8000);

    return true;
  }

  const warn = await message.channel
    .send("❓ Use: `!geraldashrefresh` ou `!geraldashdebug`")
    .catch(() => null);
  if (warn) setTimeout(() => warn.delete().catch(() => {}), 8000);

  return true;
}
