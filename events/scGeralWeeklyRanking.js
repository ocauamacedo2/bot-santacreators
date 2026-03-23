// /application/events/scGeralWeeklyRanking.js
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  EmbedBuilder,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";

import { dashOn } from "../utils/dashHub.js";

// ✅ __dirname no ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ pasta /data do projeto
const DATA_DIR = path.resolve(__dirname, "../data");
// ================== AJUSTE MANUAL (CONFIG GLOBAL) ==================
const ADJUSTMENTS_FILE = path.join(DATA_DIR, "sc_geral_manual_adjustments.json");

const ALLOWED_REMOVE_ROLES = new Set([
  "1352408327983861844", // resp creators
  "1262262852949905409", // resp influ
]);

const ALLOWED_REMOVE_USERS = new Set([
  "660311795327828008", // você
  "1262262852949905408", // owner
]);

// ✅ GUARD GLOBAL REAL (não deixa boot 2x se importou duplicado)
const __SC_GERAL_RANK_SKIP__ = Boolean(globalThis.__SC_GERAL_WEEKLY_RANK_ALREADY_BOOTSTRAPPED__);
if (__SC_GERAL_RANK_SKIP__) {
  // console.log("[SC_GERAL_WEEKLY_RANK] já bootstrapped — pulando init.");
} else {
  globalThis.__SC_GERAL_WEEKLY_RANK_ALREADY_BOOTSTRAPPED__ = true;
  // console.log("[SC_GERAL_WEEKLY_RANK] bootstrapped OK.");
}

// ============================================================================
// SC_GERAL_WEEKLY_RANK v1.0 — Ranking semanal (SEM IMAGENS)
// - Pega as MESMAS fontes do scGeralDash.js (scan + extras + evt3 + bp)
// - Envia/edita ranking no canal: 1415387000416243722
// - Mínimo por pessoa/semana: 7 pontos
// - Atualiza:
//    • durante a semana quando DIRTY (via HUB)
//    • no domingo, quando vira a semana (cria/edita msg da semana nova)
// - Não interfere no GeralDash (state/guards separados)
// ============================================================================

// ================== CONFIG ==================
const RANK_CHANNEL_ID = "1415387000416243722";

// marker p/ achar msg no canal
const RANK_MARKER_PREFIX = "SC_GERAL_WEEKLY_RANK::WK=";

// mínimo de pontos por semana
const MIN_POINTS_WEEK = 25;

// timezone
const TZ = "America/Sao_Paulo";

// ===== VISUAL =====
const RANK_BANNER =
  "https://media.discordapp.net/attachments/1362477839944777889/1384245215249825832/standard_2rss.gif";

// medalhas bonitinhas
function medal(i) {
  if (i === 0) return "🥇";
  if (i === 1) return "🥈";
  if (i === 2) return "🥉";
  return "🏅";
}

function fmtPts(n) {
  return `**${Number(n || 0)}** pts`;
}

// cor por “status” (mais gente batendo o mínimo = mais verde)
function pickColorByHitRate(participants, metMin) {
  const r = participants > 0 ? metMin / participants : 0;
  if (r >= 0.7) return 0x16a34a; // verde
  if (r >= 0.4) return 0xf59e0b; // laranja
  return 0xef4444; // vermelho
}


// cooldowns/scan
const SCAN_TTL_MS = 20 * 60 * 1000;
const COOLDOWN_LIGHT_MS = 60 * 1000; // 1min throttle de update leve
const COOLDOWN_FULL_MS = 4 * 60 * 60 * 1000; // 4h (igual teu dash, se quiser full manual)

// quantas páginas procurar no canal de ranking (pra achar msg antiga)
const RANK_FIND_PAGES = 10; // 1000 msgs

// ================== FONTES (IGUAL TEU DASH) ==================

// DOAÇÃO logs (env SCDOACAO_LOGS_ID fallback)
const DOACAO_LOGS_CHANNEL_ID =
  process.env.SCDOACAO_LOGS_ID?.trim() || "1392343906535870597";

// CONVITES logs
const CONVITES_LOGS_CHANNEL_ID = "1415102820826349648";

// PERGUNTAS logs (env opcional)
const PERGUNTAS_LOGS_CHANNEL_ID = process.env.SCPERGUNTAS_LOGS_ID?.trim() || "";
const VENDAS_LOGS_CHANNEL_ID = "1475237983782179028";
const CRONOGRAMA_LOGS_CHANNEL_ID = "1387864036259004436";
const PRESENCA_LOGS_CHANNEL_ID = "1477802343407026257";
const CORRECAO_LOGS_CHANNEL_ID = "1471695257010831614"; // ✅ Canal de logs de correção
const HALL_CHANNEL_ID = "1386503496353976470"; // ✅ Canal do Hall da Fama
const VIP_MENU_CHANNEL_ID = "1414718336826081330"; // ✅ registros VIP por evento

// canais base
const CH_PODERES_ID = "1374066813171929218";
const CH_EVENTOS_ID = "1392618646630568076";
const CH_PAGAMENTOS_ID = "1387922662134775818";
const CH_MANAGER_ID = "1459789854408708319"; 
const CH_ALINHAMENTOS_ID = "1425256185707233301";

// EVT3
const EVT3_STATE_FILE = path.join(DATA_DIR, "evt3_events_state.json");
const EVT3_EVENT_PARENT_ID = "1457573495952248883";

// Bate Ponto calendário
const BP_CALENDAR_CHANNEL_ID = "1417602545953804328";

// ================== STATE ==================
const STATE_PATH = path.join(DATA_DIR, "sc_geral_weekly_rank_state_v1.json");

let LOCK = false;
let LOCK_TS = 0; // ✅ Timestamp da trava local
let DIRTY = false;
let CACHE = { at: 0, payload: null };
let LAST_LIGHT_AT = 0;

const DEBUG = {
  lastRunAt: null,
  lastReason: "",
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
    console.error("[SC_GERAL_WEEKLY_RANK] ⚠️ JSON inválido, usando fallback:", file, e?.message || e);
    return fallback;
  }
}

function writeJSON(file, data) {
  try {
    ensureDirForFile(file);
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, file);
  } catch (e) {
    console.error("[SC_GERAL_WEEKLY_RANK] ❌ Falha ao salvar state:", file, e?.message || e);
  }
}

function loadState() {
  return readJSON(STATE_PATH, {
    // msgId por weekKey (pra editar sem spammar)
    weeklyMsgIds: {},
    // última weekKey que foi “detectada” no scheduler
    lastSeenWeekKey: null,
    // cache de assinatura por weekKey (não editar se nada mudou)
    sigByWeek: {},
    // para full manual cooldown
    nextFullAllowedAt: 0,
  });
}

function saveState(s) {
  writeJSON(STATE_PATH, s);
}

// ================== TIME HELPERS ==================
const nowSP = () => new Date(new Date().toLocaleString("en-US", { timeZone: TZ }));

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

// ✅ FIX REAL: início do dia em SP (00:00 SP) convertido pra UTC
// SP = UTC-3 → 00:00 SP = 03:00 UTC
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

// label curto (qui/sex/sab igual teu dash)
function triLabelShortFromWeekKey(weekKey) {
  try {
    const [Y, M, D] = weekKey.split("-").map(Number);
    const sundayUTC = new Date(Date.UTC(Y, M - 1, D));
    const thu = addDaysUTC(sundayUTC, 4);
    const fri = addDaysUTC(sundayUTC, 5);
    const sat = addDaysUTC(sundayUTC, 6);

    const f = (dt) => {
      const { d, m } = ymdSP(new Date(dt.toLocaleString("en-US", { timeZone: TZ })));
      return { dd: pad2(d), mm: pad2(m) };
    };

    const a = f(thu), b = f(fri), c = f(sat);
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

// ================== SCAN HELPERS ==================
async function scanChannelEmbeds(client, { channelId, weekFloorKey, maxPages = 60, onMessage }) {
  const ch = await client.channels.fetch(channelId).catch(() => null);
  if (!ch?.isTextBased?.()) return;

  const floor = String(weekFloorKey || "").trim() || null;
  let lastId;
  let stop = false;

  for (let p = 0; p < maxPages; p++) {
    const batch = await ch.messages.fetch({ limit: 100, before: lastId }).catch(() => null);
    if (!batch?.size) break;

    for (const msg of batch.values()) {
      if (floor) {
        const wkMsg = weekKeyFromDateSP(new Date(msg.createdTimestamp));
        if (wkMsg < floor) { stop = true; break; }
      }
      await onMessage(msg);
    }

    lastId = batch.last()?.id;
    if (!lastId) break;
    if (stop) break;
  }
}

// ================== PARSERS (MESMOS DO TEU DASH) ==================
function isPoderesRecordEmbed(emb) {
  const t = norm(emb?.title || emb?.data?.title || "");
  return t.includes("registro") && t.includes("poderes") && t.includes("utilizados");
}
function poderes_getUserId(emb) {
  const f = getFields(emb).find((x) => norm(x?.name).includes("id"));
  const v = String(f?.value || "").trim();
  return /^\d{17,20}$/.test(v) ? v : null;
}

function eventos_getRecordType(emb) {
  const t = norm(emb?.title || emb?.data?.title || "");

  const isEvento = t.includes("registro") && t.includes("evento") && !t.includes("uso de poderes");
  const isPoderEmEvento =
    t.includes("registro") &&
    (t.includes("uso de poderes") || (t.includes("poderes") && t.includes("evento")));

  if (isPoderEmEvento) return "eventopoder";
  if (isEvento) return "eventos";
  return null;
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

  return (
    (t.includes("registro") && t.includes("evento") && t.includes("manager")) ||
    (t.includes("log") && t.includes("registro") && t.includes("manager"))
  );
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
function manager_getManagerId(emb) {
  const fields = getFields(emb);
  const f = fields.find((x) => norm(x?.name).includes("manager responsavel"));
  const v = String(f?.value || "").trim();
  if (!v) return null;

  if (/^\d{17,20}$/.test(v)) return v;
  let m = /<@!?(\d{17,20})>/.exec(v);
  if (m) return m[1];
  m = /`(\d{17,20})`/.exec(v);
  if (m) return m[1];
  return null;
}

// VIP EVENTO
function isVipRecordEmbed(emb) {
  const t = norm(emb?.title || emb?.data?.title || "");
  return t.includes("registro de vip por evento");
}

function vip_getStatus(emb) {
  const fields = getFields(emb);
  
  const solValue = fields.find(f => norm(f.name).startsWith("solicitacoes"))?.value || "";
  const pagValue = fields.find(f => norm(f.name).startsWith("pagamento"))?.value || "";
  const repValue = fields.find(f => norm(f.name).startsWith("reprovacao"))?.value || "";

  const solNorm = norm(solValue);
  const pagNorm = norm(pagValue);
  const repNorm = norm(repValue);

  return {
    isSolicitado: solNorm.includes("solicitado"),
    isPago: pagNorm.includes("pago"),
    isReprovado: repNorm.includes("reprovado")
  };
}

function vip_getPagoByUserId(emb) {
  const fields = getFields(emb);
  const f = fields.find((x) => norm(x?.name).startsWith("pagamento"));
  const v = String(f?.value || "");
  const m = /por\s+<@!?(\d+)>/i.exec(v);
  return m ? m[1] : null;
}

function vip_getPagoAtSP(emb) {
  try {
    const fields = getFields(emb);
    const f = fields.find((x) => norm(x?.name).startsWith("pagamento"));
    const v = String(f?.value || "").trim();
    if (!v) return null;

    // 1) tenta pegar timestamp do Discord: <t:1234567890:F>
    let m = /<t:(\d{10,})/i.exec(v);
    if (m) {
      return new Date(Number(m[1]) * 1000);
    }

    // 2) fallback pra dd/mm/yyyy hh:mm:ss caso um dia o formato mude
    m = /(\d{1,2})\/(\d{1,2})\/(\d{4}).*?(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/i.exec(v);
    if (!m) return null;

    const dd = +m[1];
    const mm = +m[2];
    const yy = +m[3];
    const hh = +m[4];
    const mi = +m[5];
    const ss = +(m[6] || 0);

    return new Date(Date.UTC(yy, mm - 1, dd, hh + 3, mi, ss));
  } catch {
    return null;
  }
}


// ✅ data/hora do aprovado (pra semana certa)
function manager_getApprovedAtSP(emb) {
  try {
    const f = getFields(emb).find((x) => norm(x?.name).includes("aprovado por"));
    const v = String(f?.value || "").trim();
    if (!v) return null;

    // ✅ Regex mais flexível: procura DD/MM/YYYY e HH:MM:SS em qualquer lugar
    const m = v.match(/(\d{1,2})\/(\d{1,2})\/(\d{4}).*?(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
    if (!m) return null;

    const dd = +m[1], mm = +m[2], yy = +m[3], hh = +m[4], mi = +m[5], ss = +(m[6] || 0);
    // ✅ FIX TIMEZONE: Soma 3h ao horário SP para obter o UTC correto
    return new Date(Date.UTC(yy, mm - 1, dd, hh + 3, mi, ss));
  } catch {
    return null;
  }
}

// ALINHAMENTOS
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
  const f = fields.find((x) => norm(x?.name).includes("quem alinhou"));
  const v = String(f?.value || "").trim();
  if (!v) return null;

  let m = /<@!?(\d{17,20})>/.exec(v);
  if (m) return m[1];
  m = /`(\d{17,20})`/.exec(v);
  if (m) return m[1];
  if (/^\d{17,20}$/.test(v)) return v;
  return null;
}

// EVT3 read
function readEvt3State() {
  try {
    if (!fs.existsSync(EVT3_STATE_FILE)) return null;
    return JSON.parse(fs.readFileSync(EVT3_STATE_FILE, "utf-8")) || null;
  } catch {
    return null;
  }
}

// Bate ponto JSON pinned
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
  const m = /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/.exec(String(timeStr || ""));
  if (!m) return null;

  const dd = +m[1], mm = +m[2], yy = +m[3], hh = +m[4], mi = +m[5];
  return new Date(Date.UTC(yy, mm - 1, dd, hh + 3, mi, 0));
}

const BP_STATE_DIR = path.join(DATA_DIR, "sc_bp_monthly");

function monthKeyFromDateSP(date) {
  const { y, m } = ymdSP(date);
  return `${y}-${String(m).padStart(2, "0")}`;
}

function addMonthsUTC(date, diff) {
  const d = new Date(date.getTime());
  d.setUTCMonth(d.getUTCMonth() + diff);
  return d;
}

function getRelevantBPMonthKeys() {
  const now = nowSP();
  const prev = addMonthsUTC(now, -1);
  const next = addMonthsUTC(now, 1);

  return Array.from(
    new Set([
      monthKeyFromDateSP(prev),
      monthKeyFromDateSP(now),
      monthKeyFromDateSP(next),
    ])
  );
}

function bpPinsToArray(pins) {
  if (!pins) return [];
  if (pins?.values) return [...pins.values()];
  if (Array.isArray(pins?.items)) return pins.items;
  if (Array.isArray(pins)) return pins;
  return [];
}

function readBPStatesFromDisk(monthKeys = []) {
  const out = [];

  try {
    for (const mk of monthKeys) {
      const file = path.join(BP_STATE_DIR, `${mk}.json`);
      if (!fs.existsSync(file)) continue;

      const raw = JSON.parse(fs.readFileSync(file, "utf8"));
      if (raw?.monthKey === mk && raw?.days && typeof raw.days === "object") {
        out.push(raw);
      }
    }
  } catch (e) {
    console.error("[SC_GERAL_WEEKLY_RANK] readBPStatesFromDisk error:", e);
  }

  return out;
}

// ================== EXTRAS LOG PARSERS (DOAÇÃO/CONVITE/PERGUNTAS) ==================
function isDoacaoLogEmbed(emb) {
  const t = norm(emb?.title || emb?.data?.title || "");
  return t.includes("nova doacao registrada");
}
function doacaoWasScoredFromEmbed(emb) {
  try {
    const fields = getFields(emb);

    // prioridade = regra do Geral/Semanal (12h)
    const geral = fields.find((f) => {
      const n = norm(f?.name);
      return n.includes("geraldash/semanal") || n.includes("geraldash") || n.includes("semanal");
    });

    const vg = String(geral?.value || "");
    if (vg) {
      if (/isento/i.test(vg)) return true;
      if (/\+1/.test(vg)) return true;
      if (/✅/.test(vg)) return true;
      return false;
    }

    // fallback para logs antigos
    const anti = fields.find((f) => norm(f?.name).includes("anti-farm"));
    const v = String(anti?.value || "");
    if (/isento/i.test(v)) return true;
    if (/\+1/.test(v)) return true;
    return false;
  } catch {
    return false;
  }
}
function isConviteLogEmbed(emb) {
  const t = norm(emb?.title || emb?.data?.title || "");
  return t.includes("convite enviado");
}
function isPerguntasLogEmbed(emb) {
  const t = norm(emb?.title || emb?.data?.title || "");
  return (t.includes("!perguntas") && t.includes("usado")) || t.includes("entrevista iniciada");
}
function isVendaLogEmbed(emb) {
  const t = norm(emb?.title || emb?.data?.title || "");
  return t.includes("registro de venda");
}

// ✅ NOVO: PARSERS PARA PONTO DE ENTREVISTA
function isEntrevistaConcluidaLogEmbed(emb) {
  const t = norm(emb?.title || emb?.data?.title || "");
  const footer = norm(emb?.footer?.text || emb?.data?.footer?.text || "");

  return (
    footer.includes("sc_entrevista_point_v1") ||
    t.includes("ponto de entrevista concluida") ||
    t.includes("ponto entrevista concluida") ||
    t.includes("pontuacao de entrevista") ||
    t.includes("pontuação de entrevista")
  );
}

function entrevistaConcluida_getUserId(emb) {
  const fields = getFields(emb);

  const f =
    fields.find(x => norm(x?.name).includes("aplicador (ganhou ponto)")) ||
    fields.find(x => norm(x?.name).includes("ganhou ponto")) ||
    fields.find(x => norm(x?.name).includes("quem aplicou")) ||
    null;

  if (!f) return null;

  const v = String(f?.value || "");
  return pickFirstMentionId(v) || pickFirstIdLoose(v);
}

// Presença parsers
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

// ================== COLLECT (MESMA IDEIA DO TEU items[]) ==================
async function collectAllPoints(client, mode = "light") {
  const now = Date.now();

  if (mode === "light" && CACHE.payload && now - CACHE.at < SCAN_TTL_MS) {
    // reconstrói debug weekkeys
    DEBUG.weekKeysFound = {};
    for (const it of CACHE.payload.items || []) {
      const wk = weekKeyFromDateSP(it.ts);
      DEBUG.weekKeysFound[wk] = (DEBUG.weekKeysFound[wk] || 0) + 1;
    }
    return CACHE.payload;
  }

  DEBUG.weekKeysFound = {};
  const items = [];
  const counts = {}; // ✅ Debug: contagem por tipo

  const pushItem = (item) => {
    items.push(item);
    counts[item.source] = (counts[item.source] || 0) + 1;
  };

  // floor = volta 5 semanas (pra manter leve)
  const wkNow = weekKeyFromDateSP(nowSP());
  const weekFloorKey = addDaysToWeekKey(wkNow, -35);

  // PODERES
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
      pushItem({ userId: uid, ts: new Date(m.createdTimestamp), source: "poderes" });
    },
  });

  // EVENTOS / EVENTOPODER
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

      pushItem({ userId: uid, ts: new Date(m.createdTimestamp), source: type });
    },
  });

  // PAGAMENTOS
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
      pushItem({ userId: uid, ts: new Date(m.createdTimestamp), source: "pagamentos" });
    },
  });

// VIP EVENTO (conta ponto só para quem clicou em PAGO)
await scanChannelEmbeds(client, {
  channelId: VIP_MENU_CHANNEL_ID,
  weekFloorKey,
  maxPages: 80,
  onMessage: async (m) => {
    const emb = m.embeds?.[0];
    if (!emb) return;
    if (!isVipRecordEmbed(emb)) return;

    const status = vip_getStatus(emb);
    if (!status.isPago) return;

    const uid = vip_getPagoByUserId(emb);
    if (!uid) return;

    const paidAt = vip_getPagoAtSP(emb);

    pushItem({
      userId: uid,
      ts: paidAt || new Date(m.createdTimestamp),
      source: "vipPagos",
    });
  },
});
  // MANAGER (só aprovados, na semana do approvedAt)
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

      const uid = manager_getManagerId(emb) || manager_getRegistrarId(emb);
      if (!uid) return;

      const approvedAt = manager_getApprovedAtSP(emb);
      pushItem({ userId: uid, ts: approvedAt || new Date(m.createdTimestamp), source: "manager" });
    },
  });

  // ALINHAMENTOS
  await scanChannelEmbeds(client, {
    channelId: CH_ALINHAMENTOS_ID,
    weekFloorKey,
    maxPages: 80,
    onMessage: async (m) => {
      const emb = m.embeds?.[0];
      if (!emb) return;
      if (!isAlinhamentoRecordEmbed(emb)) return;
      const uid = alinhamento_getQuemAlinhouId(emb);
      if (!uid) return;
      pushItem({ userId: uid, ts: new Date(m.createdTimestamp), source: "alinhamentos" });
    },
  });

  // DOAÇÕES (logs)
  await scanChannelEmbeds(client, {
    channelId: DOACAO_LOGS_CHANNEL_ID,
    weekFloorKey,
    maxPages: 80,
    onMessage: async (m) => {
      const emb = m.embeds?.[0];
      if (!emb) return;
      if (!isDoacaoLogEmbed(emb)) return;
      if (!doacaoWasScoredFromEmbed(emb)) return;

      const uid = doacao_getRegistrarId(emb);
      if (!uid) return;

      pushItem({ userId: uid, ts: new Date(m.createdTimestamp), source: "doacoes" });
    },
  });

  // CONVITES (logs)
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

      pushItem({ userId: uid, ts: new Date(m.createdTimestamp), source: "convites" });
    },
  });

  // PONTO DE ENTREVISTA (logs)
  if (CORRECAO_LOGS_CHANNEL_ID) {
    await scanChannelEmbeds(client, {
      channelId: CORRECAO_LOGS_CHANNEL_ID,
      weekFloorKey,
      maxPages: 80,
      onMessage: async (m) => {
        const emb = m.embeds?.[0];
        if (!emb) return;
        if (!isEntrevistaConcluidaLogEmbed(emb)) return;

        const uid = entrevistaConcluida_getUserId(emb);
        if (!uid) return;

        pushItem({ userId: uid, ts: new Date(m.createdTimestamp), source: "perguntas" });
      },
    });
  }

  // VENDAS (logs)
  if (VENDAS_LOGS_CHANNEL_ID) {
    await scanChannelEmbeds(client, {
      channelId: VENDAS_LOGS_CHANNEL_ID,
      weekFloorKey,
      maxPages: 80,
      onMessage: async (m) => {
        const emb = m.embeds?.[0];
        if (!emb) return;
        if (!isVendaLogEmbed(emb)) return;
        if (!doacaoWasScoredFromEmbed(emb)) return; // Reusa lógica anti-farm

        const uid = venda_getSellerId(emb);
        if (!uid) return;
        pushItem({ userId: uid, ts: new Date(m.createdTimestamp), source: "vendas" });
      },
    });
  }

  // CRONOGRAMA (Aprovados)
  if (CRONOGRAMA_LOGS_CHANNEL_ID) {
    await scanChannelEmbeds(client, {
      channelId: CRONOGRAMA_LOGS_CHANNEL_ID,
      weekFloorKey,
      maxPages: 80,
      onMessage: async (m) => {
        const emb = m.embeds?.[0];
        if (!emb) return;
        
        const isGreen = emb.color === 3066993; 
        const footer = emb.footer?.text || "";
        if (!isGreen && !footer.includes("Aprovado por")) return;
        
        const title = emb.title || "";
        const desc = emb.description || "";
        const match = desc.match(/Solicitante:.*?<@!?(\d+)>/i);
        if (!match) return;
        const userId = match[1];

        // Diferencia Cronograma, Hall da Fama e Eventos Diários pelo título/descrição
        if (title.includes("Hall da Fama")) {
           pushItem({ userId, ts: new Date(m.editedTimestamp || m.createdTimestamp), source: "halldafama" });
        } else if (title.includes("Evento Diário")) {
           pushItem({ userId, ts: new Date(m.editedTimestamp || m.createdTimestamp), source: "eventosdiarios" });
        } else {
           // Assume cronograma se não for os outros
           pushItem({ userId, ts: new Date(m.editedTimestamp || m.createdTimestamp), source: "cronograma" });
        }
      },
    });
  }

  // HALL DA FAMA (Scan do canal oficial)
  if (HALL_CHANNEL_ID) {
    await scanChannelEmbeds(client, {
      channelId: HALL_CHANNEL_ID,
      weekFloorKey,
      maxPages: 80,
      onMessage: async (m) => {
        // O Hall da Fama é texto puro, mas é enviado pelo bot.
        // Vamos procurar o padrão do texto.
        if (m.author.id !== client.user.id) return;
        if (!m.content.includes("HALL DA FAMA")) return;

        // O bot não marca quem enviou no texto final (só no log/aprovação).
        // MAS, como o sistema emite evento, o ideal é confiar no evento em tempo real.
        // Para persistência retroativa de texto puro, é difícil sem um ID no texto.
        // PORÉM, o código do Hall da Fama que fiz NÃO coloca o ID do autor no texto final público.
        // SOLUÇÃO: Vou adicionar um comentário invisível ou rodapé no código do Hall da Fama
        // para permitir esse scan, OU confiamos apenas no dashOn em tempo real.
        // Como o usuário pediu "igual cronograma", e cronograma tem scan...
        // Vou assumir que o dashOn segura a onda por enquanto, ou você pode adicionar um log channel pro Hall.
        // (O código do Hall da Fama já emite dashOn).
      },
    });
  }

  // PRESENÇAS (logs)
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

        pushItem({ userId: uid, ts: new Date(m.createdTimestamp), source: "presencas" });
      },
    });
  }

  // CORREÇÃO (logs)
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

        pushItem({
          userId: uid,
          ts: new Date(m.createdTimestamp),
          source: "correcao"
        });
      },
    });
  }

  // EVT3 (json + thread createdTimestamp)
  try {
    const st = readEvt3State();
    const map = st?.evt3Events || {};
    const entries = Object.entries(map);

    const parent = await client.channels.fetch(EVT3_EVENT_PARENT_ID).catch(() => null);

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
            const archived = await parent.threads.fetchArchived({ type: "public", limit: 100 }).catch(() => null);
            thread = archived?.threads?.get(mainThreadId) || null;
          } catch {}
        }
      }

      const createdAt = thread?.createdTimestamp ? new Date(thread.createdTimestamp) : null;
      if (!createdAt) continue;

      // ✅ 1 ponto por EVT3
      pushItem({ userId: creatorId, ts: createdAt, source: "evt3" });
    }
  } catch {}

    // BATE PONTO (PRIORIDADE: disco local / fallback: calendário Discord)
  try {
    const monthKeys = getRelevantBPMonthKeys();
    let bpStates = readBPStatesFromDisk(monthKeys);

    if (!bpStates.length) {
      const cal = await client.channels.fetch(BP_CALENDAR_CHANNEL_ID).catch(() => null);

      if (cal?.isTextBased?.()) {
        let pins = null;

        if (typeof cal.messages?.fetchPinned === "function") {
          pins = await cal.messages.fetchPinned().catch(() => null);
        } else if (typeof cal.messages?.fetchPins === "function") {
          pins = await cal.messages.fetchPins().catch(() => null);
        }

        const pinList = bpPinsToArray(pins);
        const recent = await cal.messages.fetch({ limit: 300 }).catch(() => null);
        const recList = recent?.values ? [...recent.values()] : [];

        const pool = new Map();
        for (const m of [...pinList, ...recList]) {
          if (m?.id) pool.set(m.id, m);
        }

        bpStates = [];
        for (const msg of pool.values()) {
          const obj = safeParseJSONBlock(msg.content);
          if (!obj?.monthKey || !obj?.days) continue;
          bpStates.push(obj);
        }
      }
    }

    for (const obj of bpStates) {
      for (const arr of Object.values(obj.days || {})) {
        if (!Array.isArray(arr)) continue;

        for (const e of arr) {
          const uid = String(e?.uid || "").trim();
          const timeStr = String(e?.time || "").trim();
          if (!uid || !timeStr) continue;
          if (!/^\d{17,20}$/.test(uid)) continue;

          const dt = parseBPTimeToDateSP(timeStr);
          if (!dt) continue;

          pushItem({
            userId: uid,
            ts: dt,
            source: "bateponto",
          });
        }
      }
    }
  } catch (e) {
    console.error("[SC_GERAL_WEEKLY_RANK] Bate-ponto collect error:", e);
  }

  // debug keys
  for (const it of items) {
    const wk = weekKeyFromDateSP(it.ts);
    DEBUG.weekKeysFound[wk] = (DEBUG.weekKeysFound[wk] || 0) + 1;
  }

  console.log("[SC_GERAL_WEEKLY_RANK] Collect summary:", counts);

  const payload = { items };
  CACHE = { at: now, payload };
  return payload;
}


// ================== AJUSTES MANUAIS (POINT OVERRIDE) ==================
function loadAdjustments() {
  return readJSON(ADJUSTMENTS_FILE, { byWeek: {} });
}

function saveAdjustments(data) {
  writeJSON(ADJUSTMENTS_FILE, data);
}

function addWeeklyAdjustment(weekKey, userId, delta) {
  const data = loadAdjustments();
  data.byWeek = data.byWeek || {};
  data.byWeek[weekKey] = data.byWeek[weekKey] || {};
  data.byWeek[weekKey][userId] = (data.byWeek[weekKey][userId] || 0) + delta;
  saveAdjustments(data);
}

function getWeeklyAdjustment(weekKey, userId) {
  const data = loadAdjustments();
  return data.byWeek?.[weekKey]?.[userId] || 0;
}


// ================== AGGREGATION (RANK) ==================
const SOURCE_LABEL = {
  poderes: "Poderes",
  eventos: "Eventos",
  eventopoder: "Poder em Evento",
  pagamentos: "Pagamentos",
  vipPagos: "Líderes Pagamentos",
  manager: "Manager",
  alinhamentos: "Alinhamentos",
  doacoes: "Doações",
  convites: "Convites",
  perguntas: "Perguntas",
  evt3: "EVT3",
  bateponto: "Bate-ponto",
  vendas: "Vendas",
  cronograma: "Cronograma",
  presencas: "Presença",
  halldafama: "Hall da Fama",
  eventosdiarios: "Eventos Diários",
  correcao: "Correção de Entrevista",
};

function aggregateWeekDetailed(items, weekKey) {
  const only = (items || []).filter((x) => weekKeyFromDateSP(x.ts) === weekKey);

  const totalByUser = {};
  const bySourceByUser = {};

  for (const e of only) {
    totalByUser[e.userId] = (totalByUser[e.userId] || 0) + 1;

    bySourceByUser[e.userId] = bySourceByUser[e.userId] || {};
    bySourceByUser[e.userId][e.source] = (bySourceByUser[e.userId][e.source] || 0) + 1;
  }

  // ✅ Carrega ajustes (compartilhado com GeralDash)
  const adjustmentsData = loadAdjustments();
  const weekAdjustments = adjustmentsData.byWeek?.[weekKey] || {};

  // ✅ Une usuários (quem tem ponto base + quem tem ajuste)
  const allUserIds = new Set([...Object.keys(totalByUser), ...Object.keys(weekAdjustments)]);

  const list = [];
  let totalPoints = 0;

  for (const userId of allUserIds) {
    const basePoints = totalByUser[userId] || 0;
    const adj = weekAdjustments[userId] || 0;
    const finalPoints = basePoints + adj;

    // Só mostra quem tem > 0 pontos (igual ao GeralDash)
    if (finalPoints > 0) {
      list.push({
        userId,
        points: finalPoints,
        basePoints,
        adjustment: adj,
      });
      totalPoints += finalPoints;
    }
  }

  list.sort((a, b) => b.points - a.points);

  return { totalEvents: totalPoints, list, bySourceByUser };
}


function summarizeSources(bySource) {
  const entries = Object.entries(bySource || {})
    .sort((a, b) => (b[1] || 0) - (a[1] || 0))
    .filter(([, v]) => (v || 0) > 0);

  if (!entries.length) return "";

  // mostra mais fontes para não esconder "Correção de Entrevista"
  const top = entries.slice(0, 8).map(([k, v]) => `${SOURCE_LABEL[k] || k} ${v}`);
  return top.join(" • ");
}

function chunkLines(lines, maxChars = 950) {
  const chunks = [];
  let cur = [];
  let len = 0;

  for (const line of lines) {
    const add = line.length + 1;
    if (len + add > maxChars && cur.length) {
      chunks.push(cur.join("\n"));
      cur = [];
      len = 0;
    }
    cur.push(line);
    len += add;
  }
  if (cur.length) chunks.push(cur.join("\n"));
  return chunks;
}

// ================== CHART HELPERS ==================
function getQuickChartUrl(config) {
  return `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(config))}&width=800&height=450&backgroundColor=white`;
}

function getSourceStats(bySourceByUser) {
  const totals = {};
  for (const userSrc of Object.values(bySourceByUser)) {
    for (const [src, count] of Object.entries(userSrc)) {
      totals[src] = (totals[src] || 0) + count;
    }
  }
  return Object.entries(totals)
    .map(([key, val]) => ({ key, val, label: SOURCE_LABEL[key] || key }))
    .sort((a, b) => b.val - a.val);
}

function extractNameFromNick(nick) {
  let parts = String(nick || "").split('|').map(s => s.trim()).filter(s => s.length > 0);
  if (parts.length === 0) return "Desconhecido";

  // Se a última parte for ID (só números), removemos
  if (/^\d+$/.test(parts[parts.length - 1])) {
    const id = parts.pop();
    if (parts.length === 0) return id; // Se só tinha ID, retorna ele
  }

  // Se sobrou mais de 1 parte, assumimos que a primeira é Cargo e pegamos a segunda (Nome)
  if (parts.length > 1) return parts[1];
  return parts[0];
}

function getRandomColors(count) {
  const colors = [
    "#FF6384", "#36A2EB", "#FFCE56", "#4BC0C0", "#9966FF", "#FF9F40",
    "#C9CBCF", "#FF6384", "#36A2EB", "#FFCE56", "#4BC0C0", "#9966FF"
  ];
  return Array.from({ length: count }, (_, i) => colors[i % colors.length]);
}


// ================== MESSAGE RESOLVE (EDITAR SEM SPAM) ==================
async function resolveRankMessageForWeek(rankChannel, st, wk) {
  try {
    st.weeklyMsgIds = st.weeklyMsgIds || {};
    const savedId = st.weeklyMsgIds[wk] || null;

    if (savedId) {
      const byId = await rankChannel.messages.fetch(savedId).catch(() => null);
      if (byId) return byId;
      
      // ✅ Se tinha ID salvo mas a msg sumiu (foi apagada), limpa do state
      // Isso força o bot a procurar de novo ou criar uma nova
      delete st.weeklyMsgIds[wk];
    }

    const marker = `${RANK_MARKER_PREFIX}${wk}`;

    // busca no histórico pelo marker NO FOOTER do embed (sem sujar o chat)
    let lastId;
    for (let p = 0; p < RANK_FIND_PAGES; p++) {
      const batch = await rankChannel.messages.fetch({ limit: 100, before: lastId }).catch(() => null);
      if (!batch?.size) break;

      for (const m of batch.values()) {
        if (String(m.author?.id || "") !== String(rankChannel.client?.user?.id || "")) continue;

        const embeds = Array.isArray(m.embeds) ? m.embeds : [];
        const hasMarker = embeds.some((emb) => {
          const footer = String(emb?.footer?.text || emb?.data?.footer?.text || "");
          return footer.includes(marker);
        });

        if (hasMarker) {
          st.weeklyMsgIds[wk] = m.id;
          saveState(st);
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


// ================== BUILD EMBEDS (SEM IMAGENS) ==================
function buildRankEmbeds({ wk, wkLabel, agg, minPoints, nameMap = {} }) {
  const list = agg.list || [];
  const bySourceByUser = agg.bySourceByUser || {};

  const participants = list.length;
  const metMin = list.filter((x) => x.points >= minPoints).length;
  const belowMin = participants - metMin;

  const colorCover = pickColorByHitRate(participants, metMin);

  // ✅ SEM LIMITE: mostra TODO MUNDO
  const top = list;

  // (mantém esse bloco se você curte “menos pontuaram”, não interfere em nada)
  const bottom = [...list].sort((a, b) => a.points - b.points).slice(0, 8);

  const marker = `${RANK_MARKER_PREFIX}${wk}`;

const topLines = top.map((u, i) => {
  const src = summarizeSources(bySourceByUser[u.userId]);
  const adj =
    u.adjustment > 0
      ? ` • Ajuste +${u.adjustment}`
      : u.adjustment < 0
      ? ` • Ajuste ${u.adjustment}`
      : "";

  const detail = [src, adj.replace(/^ • /, "")].filter(Boolean).join(" • ");
  const extra = detail ? `\n└ ${detail}` : "";

  return `${medal(i)} **${i + 1}.** <@${u.userId}> — ${fmtPts(u.points)}${extra}`;
});

const bottomLines = bottom.map((u, i) => {
  const src = summarizeSources(bySourceByUser[u.userId]);
  const adj =
    u.adjustment > 0
      ? ` • Ajuste +${u.adjustment}`
      : u.adjustment < 0
      ? ` • Ajuste ${u.adjustment}`
      : "";

  const detail = [src, adj.replace(/^ • /, "")].filter(Boolean).join(" • ");
  const extra = detail ? `\n└ ${detail}` : "";

  return `🔻 **${i + 1}.** <@${u.userId}> — ${fmtPts(u.points)}${extra}`;
});

  const allLines = list.map((u, i) => `**${i + 1}.** <@${u.userId}> — ${fmtPts(u.points)}`);

  const embeds = [];

  // ===== CAPA / RESUMO =====
  embeds.push(
    new EmbedBuilder()
      .setColor(colorCover)
      .setTitle("🏁 Ranking Semanal — Geral (todas as fontes)")
      .setDescription(
        [
          `📆 **Semana:** **${wkLabel}**`,
          `🎯 **Mínimo:** **${minPoints} pts**`,
          "",
          `👥 **Participantes:** **${participants}**`,
          `✅ **Bateram o mínimo:** **${metMin}**`,
          `⚠️ **Abaixo do mínimo:** **${belowMin}**`,
          "",
          `🧾 **Registros somados na semana:** **${agg.totalEvents || 0}**`,
          "",
          "✨ _Bora amassar essa meta essa semana_",
        ].join("\n")
      )
      .setImage(RANK_BANNER)
      .setFooter({ text: marker })
      .setTimestamp(nowSP())
  );

  // ===== GRÁFICOS (NOVOS) =====
  const sourceStats = getSourceStats(bySourceByUser);
  
  // 1. Pizza: O que mais dá pontos (Top 5 fontes)
  if (sourceStats.length > 0) {
    const topSources = sourceStats.slice(0, 6);
    const chartConfig = {
      type: 'doughnut',
      data: {
        labels: topSources.map(s => s.label),
        datasets: [{
          data: topSources.map(s => s.val),
          backgroundColor: getRandomColors(topSources.length),
        }]
      },
      options: {
        title: { display: true, text: 'Distribuição de Pontos (Fontes)' },
        legend: { display: true, position: 'bottom' },
        plugins: { datalabels: { display: true, color: '#000', font: { weight: 'bold', size: 14 } } }
      }
    };
    embeds.push(new EmbedBuilder()
      .setColor(0x36A2EB)
      .setTitle("🍕 Fontes de Pontos (Top)")
      .setImage(getQuickChartUrl(chartConfig))
      .setFooter({ text: marker }));
  }

  // 2. Pizza: Quem mais tem pontos (Top 7)
  if (list.length > 0) {
    const topUsers = list.slice(0, 7);
    const chartConfig = {
      type: 'doughnut',
      data: {
        labels: topUsers.map(u => extractNameFromNick(nameMap[u.userId] || u.userId)),
        datasets: [{
          data: topUsers.map(u => u.points),
          backgroundColor: getRandomColors(topUsers.length),
        }]
      },
      options: {
        title: { display: true, text: 'Top Usuários com Mais Pontos' },
        legend: { display: true, position: 'bottom' },
        plugins: { datalabels: { display: true, color: '#000', font: { weight: 'bold', size: 14 } } }
      }
    };
    embeds.push(new EmbedBuilder()
      .setColor(0x4BC0C0)
      .setTitle("📊 Top Usuários (Mais Pontos)")
      .setImage(getQuickChartUrl(chartConfig))
      .setFooter({ text: marker }));
  }

  // 3. Pizza: Quem menos tem pontos (Bottom 7, > 0)
  if (list.length > 0) {
    const bottomUsers = [...list].reverse().slice(0, 7); // Já filtramos > 0 no aggregate
    const chartConfig = {
      type: 'doughnut',
      data: {
        labels: bottomUsers.map(u => extractNameFromNick(nameMap[u.userId] || u.userId)),
        datasets: [{
          data: bottomUsers.map(u => u.points),
          backgroundColor: getRandomColors(bottomUsers.length),
        }]
      },
      options: {
        title: { display: true, text: 'Usuários com Menos Pontos (mas pontuaram)' },
        legend: { display: true, position: 'bottom' },
        plugins: { datalabels: { display: true, color: '#000', font: { weight: 'bold', size: 14 } } }
      }
    };
    embeds.push(new EmbedBuilder()
      .setColor(0xFF6384)
      .setTitle("📉 Usuários com Menos Pontos")
      .setImage(getQuickChartUrl(chartConfig))
      .setFooter({ text: marker }));
  }

  // 4. Pizza: O que menos dá pontos (Bottom fontes)
  if (sourceStats.length > 0) {
    const bottomSources = [...sourceStats].reverse().slice(0, 6);
    const chartConfig = {
      type: 'doughnut',
      data: {
        labels: bottomSources.map(s => s.label),
        datasets: [{
          data: bottomSources.map(s => s.val),
          backgroundColor: getRandomColors(bottomSources.length),
        }]
      },
      options: {
        title: { display: true, text: 'Fontes com Menos Pontos Gerados' },
        legend: { display: true, position: 'bottom' },
        plugins: { datalabels: { display: true, color: '#000', font: { weight: 'bold', size: 14 } } }
      }
    };
    embeds.push(new EmbedBuilder()
      .setColor(0xFFCE56)
      .setTitle("📉 Fontes Menos Utilizadas")
      .setImage(getQuickChartUrl(chartConfig))
      .setFooter({ text: marker }));
  }

  // ===== RANKING DA SEMANA (TODOS) — com paginação se precisar =====
  const pagesTop = chunkLines(topLines, 3800); // 3800 pra ficar seguro no limite do Discord
  if (!pagesTop.length) {
    embeds.push(
      new EmbedBuilder()
        .setColor(0x8b5cf6)
        .setTitle("🏆 Ranking da semana (todos)")
        .setDescription("_(ninguém pontuou ainda)_")
        .setFooter({ text: marker })
    );
  } else {
    for (let i = 0; i < pagesTop.length; i++) {
      embeds.push(
        new EmbedBuilder()
          .setColor(0x8b5cf6) // roxinho
          .setTitle(`🏆 Ranking da semana (todos) — pág ${i + 1}/${pagesTop.length}`)
          .setDescription(pagesTop[i])
          .setFooter({ text: marker })
      );
    }
  }

  // ===== MENOS PONTUARAM =====
  embeds.push(
    new EmbedBuilder()
      .setColor(0xf59e0b)
      .setTitle("⚠️ Menos pontuaram (mas pontuaram)")
      .setDescription(bottomLines.length ? bottomLines.join("\n\n") : "_(vazio)_")
      .addFields(
        { name: "📌 Regra da semana", value: `Fez **${minPoints}+** = ✅ bateu o mínimo`, inline: true },
        { name: "🔥 Dica rápida", value: "Mistura fontes (pagamentos + poderes + etc) pra subir rápido", inline: true }
      )
      .setFooter({ text: marker })
  );

  // ===== RANKING COMPLETO (compacto) — sem cortar com "..." =====
  const pagesFull = chunkLines(allLines, 3800);
  if (!pagesFull.length) {
    embeds.push(
      new EmbedBuilder()
        .setColor(0x2b2d31)
        .setTitle("📜 Ranking completo (ordem)")
        .setDescription("_(vazio)_")
        .setFooter({ text: marker })
    );
  } else {
    for (let i = 0; i < pagesFull.length; i++) {
      embeds.push(
        new EmbedBuilder()
          .setColor(0x2b2d31)
          .setTitle(`📜 Ranking completo (ordem) — pág ${i + 1}/${pagesFull.length}`)
          .setDescription(pagesFull[i])
          .setFooter({ text: marker })
      );
    }
  }

  // ⚠️ Discord deixa no máximo 10 embeds por mensagem — a gente respeita
return embeds.slice(0, 9);
}



// ================== CORE UPSERT ==================
async function upsertWeeklyRank(client, reason, { scanMode = "light", targetWeekKey = null } = {}) {
  // ✅ FIX: Auto-unlock global se travado > 2min
  if (globalThis.__SC_GERAL_WEEKLY_RANK_UPSERTING__) {
    const now = Date.now();
    const last = globalThis.__SC_GERAL_WEEKLY_RANK_LOCK_TS__ || 0;
    if (now - last > 120000) {
       console.warn("[SC_GERAL_WEEKLY_RANK] ⚠️ Global lock travado. Forçando reset.");
       globalThis.__SC_GERAL_WEEKLY_RANK_UPSERTING__ = false;
    } else {
       return false; // ✅ Retorna false indicando que NÃO rodou
    }
  }

  globalThis.__SC_GERAL_WEEKLY_RANK_UPSERTING__ = true;
  globalThis.__SC_GERAL_WEEKLY_RANK_LOCK_TS__ = Date.now();

  try {
    DEBUG.lastRunAt = Date.now();
    DEBUG.lastReason = reason;

    const ch = await client.channels.fetch(RANK_CHANNEL_ID).catch(() => null);
    if (!ch?.isTextBased?.()) return false;

    // anti-spam permission check
    try {
      const me = ch.guild?.members?.me || (await ch.guild.members.fetch(client.user.id).catch(() => null));
      const perms = ch.permissionsFor(me);

      const need = [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
      ];
      const missing = need.filter((p) => !perms?.has?.(p));
      if (missing.length) {
        console.error("[SC_GERAL_WEEKLY_RANK] ❌ Sem permissão no canal do ranking. Abortando pra não spammar.", {
          channelId: RANK_CHANNEL_ID,
          missing,
          reason,
        });
        return false; // ✅ Retorna false (falha permissão)
      }
    } catch {
      return false;
    }

    const st = loadState();

    const { items } = await collectAllPoints(client, scanMode);

    // week alvo
    const wkNow = weekKeyFromDateSP(nowSP());
    const wk = String(targetWeekKey || wkNow);
    const wkLabel = triLabelShortFromWeekKey(wk);

    const agg = aggregateWeekDetailed(items, wk);

    // ✅ NOVO: Salva os dados por fonte para o reuniaoSemanal.js
    try {
      const sourcesStatePath = path.join(DATA_DIR, "sc_geral_weekly_rank_sources.json");
      const sourcesState = readJSON(sourcesStatePath, {});
      sourcesState[wk] = agg.bySourceByUser;
      writeJSON(sourcesStatePath, sourcesState);
    } catch (e) {
      console.error("[SC_GERAL_WEEKLY_RANK] Erro ao salvar dados por fonte:", e);
    }

    // assinatura (não editar se idêntico)
    // ✅ Inclui nameMap na assinatura se quiser que atualize quando nomes mudam, mas talvez seja overkill.
    // Vamos buscar nomes agora.
    const nameMap = {};
    if (agg.list.length > 0) {
      const topU = agg.list.slice(0, 10);
      const botU = agg.list.slice(-10);
      const usersToFetch = new Set([...topU.map(u => u.userId), ...botU.map(u => u.userId)]);
      
      await Promise.all([...usersToFetch].map(async (uid) => {
        try {
          const member = await ch.guild.members.fetch(uid).catch(() => null);
          nameMap[uid] = member ? (member.displayName || member.user.username) : (await client.users.fetch(uid).catch(() => null))?.username || uid;
        } catch (e) { 
          console.warn(`[SC_GERAL_WEEKLY_RANK] Erro ao buscar usuário ${uid}:`, e?.message || e);
          nameMap[uid] = uid; 
        }
      }));
    }

    const sig = JSON.stringify({
      wk,
      min: MIN_POINTS_WEEK,
      totalEvents: agg.totalEvents,
      list: (agg.list || []).map((x) => [x.userId, x.points]),
      nameMap // ✅ ADICIONA nameMap (para atualizar ao mudar nomes)
    });

    st.sigByWeek = st.sigByWeek || {};
    const oldSig = st.sigByWeek[wk];

// resolve msg
// ✅ Se a mensagem foi apagada manualmente, isso aqui vai retornar null
// (porque limpamos o ID inválido no resolveRankMessageForWeek)
let msg = await resolveRankMessageForWeek(ch, st, wk);

const embeds = buildRankEmbeds({ wk, wkLabel, agg, minPoints: MIN_POINTS_WEEK, nameMap });

// 🔘 BOTÃO (UMA ÚNICA VEZ)
const row = new ActionRowBuilder().addComponents(
  new ButtonBuilder()
    .setCustomId("SC_REMOVE_POINTS")
    .setLabel("➖ Remover Pontos")
    .setStyle(ButtonStyle.Danger)
);

// se não mudou e já existe msg, sai
if (msg && oldSig === sig && msg.editable) {
  await msg.edit({
    embeds,
    components: [row],
  }).catch((e) => {
    console.error("[SC_GERAL_WEEKLY_RANK] ❌ Erro ao editar msg existente:", e);
    return null;
  });
  return true; // ✅ Sucesso
}


if (!msg) {
  const created = await ch.send({
    embeds,
    components: [row],
  }).catch((e) => {
    console.error("[SC_GERAL_WEEKLY_RANK] ❌ Erro ao criar nova msg:", e);
    return null;
  });

  if (!created) return false;
  st.weeklyMsgIds = st.weeklyMsgIds || {};
  st.weeklyMsgIds[wk] = created.id;
  st.sigByWeek[wk] = sig;
  saveState(st);
  return true; // ✅ Sucesso
}

// ✅ AQUI É ONDE VOCÊ PERGUNTOU
await msg.edit({
  embeds,
  components: [row],
}).catch((e) => {
  console.error("[SC_GERAL_WEEKLY_RANK] ❌ Erro ao editar msg final:", e);
  return null;
});

st.sigByWeek[wk] = sig;
saveState(st);
return true; // ✅ Sucesso
  } catch (e) {
    console.error("[SC_GERAL_WEEKLY_RANK] upsert error:", e);
    return false;
  } finally {
    globalThis.__SC_GERAL_WEEKLY_RANK_UPSERTING__ = false;
    globalThis.__SC_GERAL_WEEKLY_RANK_LOCK_TS__ = 0;
  }
}

async function safeUpdate(client, reason, opts = {}) {
  // ✅ FIX: Auto-unlock local se travado > 2min
  if (LOCK) {
    if (Date.now() - LOCK_TS > 120000) {
      console.warn("[SC_GERAL_WEEKLY_RANK] ⚠️ Local LOCK travado. Resetando.");
      LOCK = false;
    } else {
      return false;
    }
  }

   if (LOCK) return false;

  LOCK = true;
  LOCK_TS = Date.now();
  try {
    return await upsertWeeklyRank(client, reason, opts); // ✅ Retorna o resultado real (true/false)
  } finally {
    LOCK = false;
    LOCK_TS = 0;
  }
}

// ================== HUB WIRING (igual ideia do teu dash) ==================
function wireHub(client) {
  if (client.__scGeralWeeklyRankHubWired) return;
  client.__scGeralWeeklyRankHubWired = true;

  const markDirty = (opts = {}) => {
    DIRTY = true;
    // se mexe no ranking (quase tudo), invalida cache
    if (opts.invalidateScanCache) {
      CACHE = { at: 0, payload: null };
      DEBUG.weekKeysFound = {};
    }
  };

  // eventos que mexem no ranking (tudo que vira log / msg / registro)
dashOn("bp:punch", () => markDirty({ invalidateScanCache: true }));
dashOn("doacao:registrada", () => markDirty({ invalidateScanCache: true }));
dashOn("lideres:convite_enviado", () => markDirty({ invalidateScanCache: true }));
dashOn("entrevista:ponto_concluido", () => markDirty({ invalidateScanCache: true }));
dashOn("presenca:confirmada", () => markDirty({ invalidateScanCache: true }));
dashOn("rm:approved", () => markDirty({ invalidateScanCache: true }));
dashOn("rm:rejected", () => markDirty({ invalidateScanCache: true }));
dashOn("alinhamento:registrado", () => markDirty({ invalidateScanCache: true }));
dashOn("eventopoder:registrado", () => markDirty({ invalidateScanCache: true }));
dashOn("poderes:registrado", () => markDirty({ invalidateScanCache: true }));
dashOn("pagamento:criado", () => markDirty({ invalidateScanCache: true }));
dashOn("pagamento:solicitado", () => markDirty({ invalidateScanCache: true }));
dashOn("pagamento:pago", () => markDirty({ invalidateScanCache: true }));
dashOn("pagamento:reprovado", () => markDirty({ invalidateScanCache: true }));
dashOn("venda:registrada", () => markDirty({ invalidateScanCache: true }));
dashOn("cronograma:aprovado", () => markDirty({ invalidateScanCache: true }));
dashOn("halldafama:aprovado", () => markDirty({ invalidateScanCache: true }));
dashOn("eventosdiarios:aprovado", () => markDirty({ invalidateScanCache: true }));
dashOn("correcao:usado", () => markDirty({ invalidateScanCache: true }));
dashOn("gi:desligado", () => markDirty({ invalidateScanCache: true }));

  // scheduler leve: se DIRTY, atualiza
  setInterval(async () => {

    try {
      if (!client.isReady()) return;
      if (!DIRTY) return;

      const now = Date.now();
      if (now - LAST_LIGHT_AT < COOLDOWN_LIGHT_MS) return;

      // ✅ SÓ limpa o DIRTY se a atualização rodar com sucesso
      const didRun = await safeUpdate(client, "hub dirty (light)", { scanMode: "light" });
      if (didRun) {
        LAST_LIGHT_AT = now;
        DIRTY = false;
      }
    } catch {}
  }, 30 * 1000);
}

// ================== SCHEDULER DOMINGO (vira semana) ==================
function wireWeekFlipScheduler(client) {
  if (client.__scGeralWeeklyRankWeekFlipWired) return;
  client.__scGeralWeeklyRankWeekFlipWired = true;

  setInterval(async () => {
    try {
      if (!client.isReady()) return;

      const st = loadState();
      const wkNow = weekKeyFromDateSP(nowSP());
      const lastSeen = st.lastSeenWeekKey;

      if (!lastSeen) {
        st.lastSeenWeekKey = wkNow;
        saveState(st);
        return;
      }

      // virou a semana (domingo 00:00 SP)
      if (wkNow !== lastSeen) {
        // ✅ FIX: Se já estiver rodando update (LOCK), espera o próximo tick (20s)
        // MAS verifica se é trava velha (stale) pra não travar pra sempre
        const isLocked = LOCK || globalThis.__SC_GERAL_WEEKLY_RANK_UPSERTING__;
        if (isLocked) {
           const now = Date.now();
           const lockTs = LOCK_TS || globalThis.__SC_GERAL_WEEKLY_RANK_LOCK_TS__ || 0;
           
           // Se travado há menos de 2 min, espera. Se mais, ignora a trava (stale).
           if (now - lockTs < 120000) {
               console.log("[SC_GERAL_WEEKLY_RANK] ⏳ Virada pendente, sistema ocupado. Tentando em 20s...");
               return;
           }
           console.warn("[SC_GERAL_WEEKLY_RANK] ⚠️ Virada pendente com LOCK travado (stale). Forçando execução.");
        }

        console.log(`[SC_GERAL_WEEKLY_RANK] 🔄 Virada de semana detectada: ${lastSeen} -> ${wkNow}`);

        // posta ranking da SEMANA QUE ACABOU (a anterior)
        const wkPrev = addDaysToWeekKey(wkNow, -7);

        // full pra garantir fechado certinho
        const okPrev = await safeUpdate(client, "week flip (post prev week)", { scanMode: "full", targetWeekKey: wkPrev });

        // e já cria/edita a semana nova zerada (opcional, mas eu acho bom)
        const okNow = await safeUpdate(client, "week flip (start new week)", { scanMode: "light", targetWeekKey: wkNow });

        // ✅ Só salva o estado DEPOIS de rodar os updates com sucesso
        // Se falhar (ex: bot caiu, erro de rede), ele tenta de novo no próximo ciclo (20s)
        if (okPrev && okNow) {
            st.lastSeenWeekKey = wkNow;
            saveState(st);
            DIRTY = false;
            console.log(`[SC_GERAL_WEEKLY_RANK] ✅ Virada de semana concluída com sucesso!`);
        } else {
            console.warn(`[SC_GERAL_WEEKLY_RANK] ⚠️ Falha ao enviar/atualizar ranking na virada. Tentando novamente em 20s.`);
        }
      } else {
        // ✅ AUTO-REPAIR: Se já estamos na semana (wkNow), mas o bot não tem o ID da mensagem salva,
        // significa que ele não criou o painel novo ainda (ou perdeu a referência).
        // Força a criação agora.
        if (!st.weeklyMsgIds[wkNow]) {
           const isLocked = LOCK || globalThis.__SC_GERAL_WEEKLY_RANK_UPSERTING__;
           if (!isLocked) {
               console.log(`[SC_GERAL_WEEKLY_RANK] 🛠️ Auto-Repair: Mensagem da semana atual (${wkNow}) ausente. Criando...`);
               await safeUpdate(client, "auto-repair missing current week", { scanMode: "light", targetWeekKey: wkNow });
           }
        }
      }
    } catch (e) {
      console.error("[SC_GERAL_WEEKLY_RANK] Erro no scheduler de virada de semana:", e);
    }
  }, 20 * 1000);
}

// ================== DEBUG TEXT ==================
function debugText() {
  const keys =
    Object.entries(DEBUG.weekKeysFound || {})
      .sort((a, b) => (a[0] > b[0] ? -1 : 1))
      .slice(0, 10)
      .map(([k, v]) => `${k}=${v}`)
      .join(" • ") || "(nenhuma)";
  const st = loadState();
  return [
    `🧾 Debug WEEKLY_RANK v1.0`,
    `• keys(scan): ${keys}`,
    `• lastReason: ${DEBUG.lastReason || "—"}`,
    `• dirty: ${DIRTY ? "sim" : "não"}`,
    `• nextFullAllowedAt: ${st.nextFullAllowedAt ? new Date(st.nextFullAllowedAt).toLocaleString("pt-BR") : "—"}`,
  ].join("\n");
}

// ✅ NOVO: Exporta o ranking semanal para outros módulos
export async function getWeeklyRanking(client) {
  try {
    const { items } = await collectAllPoints(client, "light");
    const wkNow = weekKeyFromDateSP(nowSP());
    const agg = aggregateWeekDetailed(items, wkNow);

    return [...(agg.list || [])].sort((a, b) => {
      const pa = Number(a?.points || 0);
      const pb = Number(b?.points || 0);
      return pb - pa;
    });
  } catch (e) {
    console.error("[scGeralWeeklyRanking] getWeeklyRanking error:", e);
    return [];
  }
}

export async function getWeeklyRankingDebug(client) {
  try {
    const { items } = await collectAllPoints(client, "light");
    const wkNow = weekKeyFromDateSP(nowSP());
    const agg = aggregateWeekDetailed(items, wkNow);

    return {
      weekKey: wkNow,
      totalItems: items.length,
      totalRankedUsers: agg.list?.length || 0,
      top15: [...(agg.list || [])]
        .sort((a, b) => Number(b?.points || 0) - Number(a?.points || 0))
        .slice(0, 15),
    };
  } catch (e) {
    console.error("[scGeralWeeklyRanking] getWeeklyRankingDebug error:", e);
    return {
      weekKey: null,
      totalItems: 0,
      totalRankedUsers: 0,
      top15: [],
    };
  }
}

// ✅ NOVO: Export para uso externo (ex: gestaoinfluencer desligamento)
export async function getStatsForUser(client, userId) {

  try {
    // Usa scanMode light pra aproveitar cache se tiver, ou scan rápido
    const { items } = await collectAllPoints(client, "light");
    
    const userItems = items.filter(i => i.userId === String(userId));
    const total = userItems.length;
    
    const bySource = {};
    const byWeek = {};
    
    // Carrega ajustes manuais pra somar também
    const adjustmentsData = loadAdjustments();
    
    for (const item of userItems) {
      // Por fonte
      const label = SOURCE_LABEL[item.source] || item.source;
      bySource[label] = (bySource[label] || 0) + 1;
      
      // Por semana
      const wk = weekKeyFromDateSP(item.ts);
      byWeek[wk] = (byWeek[wk] || 0) + 1;
    }

    // Soma ajustes manuais no total e nas semanas
    let totalAdjustments = 0;
    if (adjustmentsData.byWeek) {
      for (const [wk, users] of Object.entries(adjustmentsData.byWeek)) {
        const adj = users[String(userId)] || 0;
        if (adj !== 0) {
          byWeek[wk] = (byWeek[wk] || 0) + adj;
          totalAdjustments += adj;
        }
      }
    }
    
    // Formata semanas para label legível
    const weeksFormatted = [];
    const sortedWeeks = Object.keys(byWeek).sort().reverse(); // Mais recente primeiro
    
    for (const wk of sortedWeeks) {
      const pts = byWeek[wk];
      if (pts === 0) continue;
      const label = triLabelShortFromWeekKey(wk);
      weeksFormatted.push(`• **${label}**: ${pts} pts`);
    }

    // Formata fontes
    const sourcesFormatted = Object.entries(bySource)
      .sort((a, b) => b[1] - a[1])
      .map(([src, count]) => `• ${src}: **${count}**`);

    // ✅ NOVO: Pega pontos da semana atual
const currentWeekKey = weekKeyFromDateSP(nowSP());

// byWeek já recebeu os ajustes no loop acima
const thisWeekTotalPoints = byWeek[currentWeekKey] || 0;
const thisWeekAdjustment = adjustmentsData.byWeek?.[currentWeekKey]?.[String(userId)] || 0;

 return {
  total: total + totalAdjustments,
  thisWeekPoints: thisWeekTotalPoints,
  totalBase: total,
  totalAdjustments,
  sourcesFormatted,
  weeksFormatted
};
  } catch (e) {
    console.error("[scGeralWeeklyRanking] getStatsForUser error:", e);
    return null;
  }
}

export async function handleWeeklyRankInteractions(interaction, client) {
  if (interaction.isButton() && interaction.customId === "SC_REMOVE_POINTS") {
    const member = interaction.member;
    if (!member || !member.roles) {
      return interaction.reply({
        content: "❌ Não foi possível validar suas permissões.",
        ephemeral: true,
      });
    }

    const hasRole = member.roles.cache.some((r) => ALLOWED_REMOVE_ROLES.has(r.id));
    const isAllowedUser = ALLOWED_REMOVE_USERS.has(member.id);

    if (!hasRole && !isAllowedUser) {

      return interaction.reply({
        content: "❌ Você não tem permissão para remover pontos.",
        ephemeral: true,
      });
    }

    const modal = new ModalBuilder()
      .setCustomId("SC_REMOVE_POINTS_MODAL")
      .setTitle("Remover Pontos (Ranking Semanal)");

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("userId")
          .setLabel("ID do Discord")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("points")
          .setLabel("Quantidade de pontos a REMOVER")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );

    return interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && interaction.customId === "SC_REMOVE_POINTS_MODAL") {
    const userId = interaction.fields.getTextInputValue("userId").trim();
    const points = Number(interaction.fields.getTextInputValue("points"));

    if (!/^\d{17,20}$/.test(userId) || !Number.isFinite(points) || points <= 0) {
      return interaction.reply({ content: "❌ Dados inválidos.", ephemeral: true });
    }

    const wk = weekKeyFromDateSP(nowSP());
    addWeeklyAdjustment(wk, userId, -Math.abs(points));

    DIRTY = true;

    return interaction.reply({
      content: `✅ Removidos **${points} pts** de <@${userId}> na semana atual.`,
      ephemeral: true,
    });
  }
}

// ================== EXPORTS ==================
export async function geralWeeklyRankOnReady(client) {
  if (__SC_GERAL_RANK_SKIP__) return;

  // ✅ evita rodar 2x no mesmo process
  if (client.__SC_GERAL_WEEKLY_RANK_READY_RAN_V1__) return;
  client.__SC_GERAL_WEEKLY_RANK_READY_RAN_V1__ = true;

  wireHub(client);
  wireWeekFlipScheduler(client);

  // primeira render assim que subir
  await safeUpdate(client, "boot (light)", { scanMode: "light" });
  DIRTY = false;
}

// comandos:
//  !geralrankdebug
//  !geralrankrefresh  (full)
//  !geralrankweek 2026-01-18 (gera/atualiza semana específica)
export async function geralWeeklyRankHandleMessage(message, client) {
  if (__SC_GERAL_RANK_SKIP__) return false;

  try {
    if (!message?.guild || message.author?.bot) return false;

    const content = String(message.content || "").trim();
    const low = content.toLowerCase();

    if (!low.startsWith("!geralrank")) return false;

    try { await message.delete().catch(() => {}); } catch {}

    if (low === "!geralrankdebug") {
      const txt = debugText();
      const reply = await message.channel.send("```" + txt + "```").catch(() => null);
      if (reply) setTimeout(() => reply.delete().catch(() => {}), 15000);
      return true;
    }

    if (low === "!geralrankrefresh") {
      // ✅ FORCE UNLOCK: Destrava qualquer processo preso
      LOCK = false;
      globalThis.__SC_GERAL_WEEKLY_RANK_UPSERTING__ = false;
      globalThis.__SC_GERAL_WEEKLY_RANK_LOCK_TS__ = 0;
      console.log("[SC_GERAL_WEEKLY_RANK] 🔓 Desbloqueio forçado via comando.");

      const st = loadState();
      const now = Date.now();
      
      // ✅ Bypass cooldown para você e Owner
      const isBypass = ALLOWED_REMOVE_USERS.has(message.author.id) || message.author.id === "1262262852949905408";

      if (!isBypass && now < Number(st.nextFullAllowedAt || 0)) {
        const warn = await message.channel
          .send("⏳ Full scan ainda em cooldown (4h). Usa de novo mais tarde.")
          .catch(() => null);
        if (warn) setTimeout(() => warn.delete().catch(() => {}), 8000);
        return true;
      }

      st.nextFullAllowedAt = now + COOLDOWN_FULL_MS;
      saveState(st);

      DIRTY = false;
      await safeUpdate(client, "manual refresh (!geralrankrefresh)", { scanMode: "full" });

      const ok = await message.channel.send("✅ Ranking semanal atualizado (full scan).").catch(() => null);
      if (ok) setTimeout(() => ok.delete().catch(() => {}), 8000);
      return true;
    }

    // !geralrankweek YYYY-MM-DD
    if (low.startsWith("!geralrankweek")) {
      const parts = content.split(/\s+/g);
      const wk = String(parts[1] || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(wk)) {
        const warn = await message.channel
          .send("❓ Use: `!geralrankweek 2026-01-18` (weekKey do domingo)")
          .catch(() => null);
        if (warn) setTimeout(() => warn.delete().catch(() => {}), 9000);
        return true;
      }

      await safeUpdate(client, `manual week (${wk})`, { scanMode: "full", targetWeekKey: wk });

      const ok = await message.channel.send(`✅ Ranking da semana **${wk}** atualizado.`).catch(() => null);
      if (ok) setTimeout(() => ok.delete().catch(() => {}), 8000);
      return true;
    }

    const warn = await message.channel
      .send("❓ Use: `!geralrankrefresh` ou `!geralrankdebug` ou `!geralrankweek YYYY-MM-DD`")
      .catch(() => null);
    if (warn) setTimeout(() => warn.delete().catch(() => {}), 9000);

    return true;
  } catch (e) {
    console.error("[SC_GERAL_WEEKLY_RANK] handleMessage erro:", e);
    return true;
  }
}
