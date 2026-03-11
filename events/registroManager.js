// /application/events/registroManager.js
// SC_REGISTRO_MANAGER vLOG+HOOKS — Registro Manager + Logs Arquivo
// ✅ Hook-based (SEM client.on aqui dentro)
// ✅ Canal principal zera domingo 00:00 SP
// ✅ Canal ARQUIVO mantém histórico completo (criado/aprovado/reprovado + motivo + datas + links)
// ✅ Log “vivo”: edita o log quando a msg original muda (aprovação/reprovação/edições do bot)
// ✅ Bridge FACs: só APROVADO entra (append). Reprovado remove.
// ✅ Integração scGeralDash: dashEmit("rm:approved") / dashEmit("rm:rejected")
// ✅ Manager responsável: aceita SOMENTE ID puro. Se inválido/vazio/menção/texto -> assume registrante.
// ✅ Anti self-approve: ninguém aprova o próprio registro, EXCETO cargos/IDs permitidos.
//
// Como plugar no index:
//   import {
//     registroManagerOnReady,
//     registroManagerHandleInteraction,
//     registroManagerHandleMessageDelete,
//     registroManagerHandleMessageBulkDelete,
//     registroManagerHandleMessageUpdate,
//   } from "./events/registroManager.js";
//
//   no ready: await registroManagerOnReady(client);
//   no interactionCreate: await registroManagerHandleInteraction(interaction, client);
//   nos eventos: await registroManagerHandleMessageDelete(msg, client);
//              await registroManagerHandleMessageBulkDelete(collection, channel, client);
//              await registroManagerHandleMessageUpdate(oldMsg, newMsg, client);

import fs from "node:fs";
import path from "node:path";
import {
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";

import { dashEmit } from "../utils/dashHub.js";
import { resolveLogChannel } from "../utils/channelResolver.js";
import { graficoManagersEmitUpdate } from "./GraficoManagers.js";

// ===============================
// CONFIG
// ===============================
const CANAL_REGISTRO_MANAGER = "1392680204517769277"; // principal (zera domingo)
const CANAL_REGISTRO_MANAGER_ARQUIVO = "1459789854408708319"; // arquivo/logs (NÃO zera)
const CANAL_DECISOES_ID = "1392677042931105843"; // avisos públicos de aprovar/reprovar (mantido)

const CARGOS_PODE_REGISTRAR = [
  "1388976155830255697", // manager creator
  "1392678638176043029", // equipe manager
  "1388976314253312100", // coord. creators
  "1352407252216184833", // resp lider
  "1262262852949905409", // resp influ
  "1352408327983861844", // resp creators
  "1282119104576098314", // MKT TICKETS
  "1262262852949905408", // owner
  "660311795327828008",  // você
];


const CARGOS_PODE_APROVAR = [
  "1262262852949905409", // resp influ
  "1388976314253312100", // coord creators
  "1352408327983861844", // resp creators
  "1352407252216184833", // resp lider
  "1262262852949905408", // owner
  "660311795327828008",  // você
];

// ✅ NOVO: quem pode usar o botão de "limpar reprovados da semana"
const RM_PURGE_REJECTED_ALLOWED = {
  userIds: new Set([
    "1262262852949905408", // owner
    "660311795327828008",  // você
  ]),
  roleIds: new Set([
    "1352408327983861844", // resp creators
    "1262262852949905409", // resp influ
    "1352407252216184833", // resp lider
  ]),
};

function canUseRmPurgeRejected(member, userId) {
  try {
    if (RM_PURGE_REJECTED_ALLOWED.userIds.has(String(userId))) return true;
    for (const rid of RM_PURGE_REJECTED_ALLOWED.roleIds) {
      if (member?.roles?.cache?.has(rid)) return true;
    }
    return false;
  } catch {
    return false;
  }
}


// quem pode aprovar o PRÓPRIO registro (exceção do bloqueio)
const SELF_APPROVE_ALLOWED = {
  userIds: new Set([
    "1262262852949905408", // owner
    "660311795327828008",  // você (garantia)
  ]),
  roleIds: new Set([
    "1262262852949905409", // resp influ
    "1352408327983861844", // resp creators
  ]),
};

// ===============================
// COMANDO MANUAL (repost totais) — PERMISSÕES
// ===============================
// ===============================
// COMANDO MANUAL (zerar orgs semana) — PERMISSÕES
// ===============================
// ===============================
// COMANDO MANUAL (repost totais) — PERMISSÕES
// ===============================
const RM_REPOST_ALLOWED = {
  userIds: new Set([
    "1262262852949905408", // owner
    "660311795327828008",  // você
  ]),
  roleIds: new Set([
    "1414651836861907006", // responsaveis
    "1352408327983861844", // resp creators
    "1262262852949905409", // resp influ
  ]),
};

// ===============================
// COMANDO MANUAL (zerar orgs semana) — PERMISSÕES
// ===============================
const RM_ZERAR_ORGS_ALLOWED = {
  userIds: new Set([
    "1262262852949905408", // owner
    "660311795327828008",  // você
  ]),
  roleIds: new Set([
    "1414651836861907006", // responsaveis
    "1352408327983861844", // resp creators
    "1262262852949905409", // resp influ
  ]),
};


function canUseRmZerarOrgsCommand(member, userId) {
  try {
    if (RM_ZERAR_ORGS_ALLOWED.userIds.has(String(userId))) return true;
    for (const rid of RM_ZERAR_ORGS_ALLOWED.roleIds) {
      if (member?.roles?.cache?.has(rid)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function canUseRmRepostCommand(member, userId) {
  try {
    if (RM_REPOST_ALLOWED.userIds.has(String(userId))) return true;
    for (const rid of RM_REPOST_ALLOWED.roleIds) {
      if (member?.roles?.cache?.has(rid)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

// ===============================
// STATE / FILES
// ===============================

// ===============================
// TIME HELPERS (SP) — timezone-safe (NÃO depende do timezone do host)
// ✅ Fica antes de getWeekKeyNow pra não dar erro
// ===============================
const TIME_LOCAL = (() => {
  const TZ = "America/Sao_Paulo";

  // agora em SP “embutido” numa Date UTC (ler com getUTC*)
  function nowInSP() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(new Date());

    const get = (t) => Number(parts.find((p) => p.type === t)?.value || 0);

    const y = get("year");
    const m = get("month");
    const d = get("day");
    const hh = get("hour");
    const mm = get("minute");
    const ss = get("second");

    return new Date(Date.UTC(y, m - 1, d, hh, mm, ss));
  }

  function startOfDaySP(dateUTC) {
    return new Date(Date.UTC(dateUTC.getUTCFullYear(), dateUTC.getUTCMonth(), dateUTC.getUTCDate()));
  }

  function addDays(dateUTC, n) {
    const x = new Date(dateUTC.getTime());
    x.setUTCDate(x.getUTCDate() + n);
    return x;
  }

  function fmtDateBR(dateUTC) {
    return dateUTC.toLocaleDateString("pt-BR", { timeZone: TZ });
  }

  function getCurrentWeekSP() {
    const now = nowInSP();
    const dow = now.getUTCDay(); // ✅ dia da semana de SP
    const sunday = startOfDaySP(addDays(now, -dow));
    const saturday = startOfDaySP(addDays(sunday, 6));
    const thursday = startOfDaySP(addDays(sunday, 4));
    const friday = startOfDaySP(addDays(sunday, 5));
    const weekKey = sunday.toISOString().slice(0, 10);
    return { sunday, saturday, thursday, friday, weekKey };
  }

  function weekRangeLabelBR({ sunday, saturday }) {
    const [ds, ms, ys] = fmtDateBR(sunday).split("/");
    const [de, me, ye] = fmtDateBR(saturday).split("/");
    return ms === me && ys === ye
      ? `Semana ${ds}–${de}/${ms}/${ys}`
      : `Semana ${ds}/${ms}/${ys} – ${de}/${me}/${ye}`;
  }

  return { nowInSP, startOfDaySP, addDays, fmtDateBR, getCurrentWeekSP, weekRangeLabelBR };
})();

const { nowInSP, startOfDaySP, addDays, fmtDateBR, getCurrentWeekSP, weekRangeLabelBR } = TIME_LOCAL;

// semana label + datas qui/sex/sab
function weekBySundayToSaturdaySP() {
  const { sunday, saturday } = getCurrentWeekSP();
  const weekLabel = weekRangeLabelBR({ sunday, saturday });

  const fmt = (d) => fmtDateBR(d).slice(0, 5);
  const line = `Dom ${fmt(sunday)} • Sáb ${fmt(saturday)}`;

  return { weekLabel, weekLine: line, sunday, saturday };
}


// ===============================
// WEEKLY STATS (Dom..Sáb) — persistente p/ gráficos
// ===============================
const WEEKLY_STATS_PATH = "./reg_manager_weekly_stats.json";

function loadWeeklyStats() {
  return readJSON(WEEKLY_STATS_PATH, { weeks: {} }); 
  // weeks[weekKey] = {
  //   createdBy:{}, approvedBy:{}, rejectedBy:{},
  //   approvedForRegistrant:{}, rejectedForRegistrant:{},
  //   approvedForManager:{}, rejectedForManager:{}
  // }
}

function saveWeeklyStats(s) {
  writeJSON(WEEKLY_STATS_PATH, s);
}

function getWeekKeyNow() {
  return TIME_LOCAL.getCurrentWeekSP().weekKey;
}

function bumpWeekly(weekKey, bucket, id, delta = 1) {
  const uid = String(id);
  const st = loadWeeklyStats();
  st.weeks ||= {};
  st.weeks[weekKey] ||= {
    createdBy: {},
    approvedBy: {},
    rejectedBy: {},
    approvedForRegistrant: {},
    rejectedForRegistrant: {},
    approvedForManager: {},
    rejectedForManager: {},
  };

  const w = st.weeks[weekKey];
  w[bucket] ||= {};
  w[bucket][uid] = Math.max(0, (+w[bucket][uid] || 0) + delta);

  saveWeeklyStats(st);
}


const DATA_DIR = "./data";
const STATS_PATH = "./reg_manager_stats.json";
const STATE_PATH = "./reg_manager_state.json";
const LOG_STATE_PATH = "./reg_manager_logs_state.json";



// msg do botão (principal)
let ultimaMsgBotao = null;

// 🔒 lock pra evitar menu duplicar quando a gente "move" pro final
if (globalThis.__SC_RM_MENU_MOVING__ == null) globalThis.__SC_RM_MENU_MOVING__ = false;

// cache leve
const __RM_CACHE__ = {
  byUser: {},
  scanCache: new Map(),
  ttlMs: 5 * 60 * 1000,
};

// map temporário runtime
const RM_MSG_OWNER = new Map(); // msgId -> registrantId
const RM_DISPLAY = new Map();   // msgId -> "Família | ORG"

// ===============================
// FS HELPERS
// ===============================
function ensureDir(filePath) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  } catch {}
}

function readJSON(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const raw = fs.readFileSync(file, "utf-8");
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(file, data) {
  try {
    ensureDir(file);
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch {}
}

// stats (contagens)
function rmCarregarContagens() {
  return readJSON(STATS_PATH, { byUser: {} });
}
function rmSalvarContagens(data) {
  try {
    const cur = readJSON(STATS_PATH, {});
    const merged = { ...cur, ...data };
    writeJSON(STATS_PATH, merged);
  } catch {}
}

// state (totais msg id etc)
function rmLoadState() {
  return readJSON(STATE_PATH, {});
}
function rmSaveState(obj) {
  writeJSON(STATE_PATH, obj);
}

// ========= TOTAIS (pin) =========
function getTotalsState() {
  const s = rmLoadState();
  return { msgId: s.totaisMsgId || null };
}
function setTotalsStateMsgId(idOrNull) {
  const s = rmLoadState();
  if (idOrNull) s.totaisMsgId = String(idOrNull);
  else delete s.totaisMsgId;
  rmSaveState(s);
}

// ========= MENU (botão abrir modal) =========
function getMenuState() {
  const s = rmLoadState();
  return { menuMsgId: s.menuMsgId || null };
}
function setMenuStateMsgId(idOrNull) {
  const s = rmLoadState();
  if (idOrNull) s.menuMsgId = String(idOrNull);
  else delete s.menuMsgId;
  rmSaveState(s);
}

// ========= CLEANUP semanal =========
function getCleanupState() {
  const s = rmLoadState();
  return { lastCleanupKey: s.lastCleanupKey || null };
}
function setCleanupStateKey(weekKeyOrNull) {
  const s = rmLoadState();
  if (weekKeyOrNull) s.lastCleanupKey = String(weekKeyOrNull);
  else delete s.lastCleanupKey;
  rmSaveState(s);
}


// logs mapping
function loadLogsState() {
  return readJSON(LOG_STATE_PATH, { map: {} }); // map: { [rmMsgId]: { logMsgId, createdAt } }
}
function saveLogsState(s) {
  writeJSON(LOG_STATE_PATH, s);
}
function setLogLink(rmMsgId, logMsgId) {
  const st = loadLogsState();
  st.map = st.map || {};
  st.map[String(rmMsgId)] = { logMsgId: String(logMsgId), createdAt: Date.now() };
  saveLogsState(st);
}
function getLogLink(rmMsgId) {
  const st = loadLogsState();
  return st?.map?.[String(rmMsgId)] || null;
}

// init caches
try {
  __RM_CACHE__.byUser = rmCarregarContagens().byUser || {};
} catch {
  __RM_CACHE__.byUser = {};
}

// ===============================


function getWeekKeyFromRMEmbed(emb) {
  try {
    const v = getFieldValueContains(emb, "semana & datas");
    const txt = String(v || "");

    // tenta pegar o "Dom DD/MM" e o ano do weekLabel
    // exemplo do teu embed:
    // Semana 14–20/02/2026
    // Dom 14/02 • Sáb 20/02
    const dom = txt.match(/Dom\s+(\d{2})\/(\d{2})/i);
    const ano = txt.match(/\/(\d{4})/); // pega 2026 de qualquer ".../2026"

    if (!dom || !ano) return null;

    const day = Number(dom[1]);
    const month = Number(dom[2]);
    const year = Number(ano[1]);

    if (!year || !month || !day) return null;

    const sundayUTC = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
    return sundayUTC.toISOString().slice(0, 10); // YYYY-MM-DD
  } catch {
    return null;
  }
}

function isRMMessageInCurrentWeek(msg, emb) {
  try {
    const wkNow = getWeekKeyNow(); // sunday ISO da semana atual (SP-safe)
    const wkEmb = getWeekKeyFromRMEmbed(emb);

    // 1) fonte principal: semana do embed
    if (wkEmb) return String(wkEmb) === String(wkNow);

    // 2) fallback: timestamp (como estava antes)
    const { sunday, saturday } = getCurrentWeekSP();
    const start = startOfDaySP(sunday).getTime();
    const end = startOfDaySP(addDays(saturday, 1)).getTime();
    const ts = +msg.createdTimestamp;

    return ts >= start && ts < end;
  } catch {
    return false;
  }
}



// HELPERS
// ===============================
function _getEmbedFieldsAny(emb) {
  return emb?.fields || emb?.data?.fields || [];
}

function _norm(s) {
  return String(s || "").toLowerCase().normalize("NFKD");
}

function isRMEmbed(emb) {
  const title = _norm(emb?.title || emb?.data?.title || "");
  return title.includes("registro de evento - manager");
}

function embedIsApproved(emb) {
  return _getEmbedFieldsAny(emb).some((f) => _norm(f?.name).includes("aprovado por"));
}
function embedIsRejected(emb) {
  return _getEmbedFieldsAny(emb).some((f) => _norm(f?.name).includes("reprovado por"));
}

function parseRegistrantFromEmbed(emb) {
  const fields = _getEmbedFieldsAny(emb);
  const f = fields.find((x) => _norm(x?.name).includes("registrado por"));
  if (!f?.value) return null;
  const m = /<@!?(\d+)>/.exec(String(f.value));
  return m ? m[1] : null;
}

function getRegistrantIdFromMessage(msg, embMaybe) {
  const cached = RM_MSG_OWNER.get(msg.id);
  if (cached) return cached;

  const original = msg?.embeds?.[0];
  if (original) {
    const f0 = _getEmbedFieldsAny(original).find((x) => _norm(x?.name).includes("registrado por"));
    if (f0?.value) {
      const m = /<@!?(\d+)>/.exec(f0.value);
      if (m) return m[1];
    }
  }
  if (embMaybe) {
    const f1 = _getEmbedFieldsAny(embMaybe).find((x) => _norm(x?.name).includes("registrado por"));
    if (f1?.value) {
      const m = /<@!?(\d+)>/.exec(f1.value);
      if (m) return m[1];
    }
  }
  return null;
}

function getFieldValueByPrefix(emb, startsWith) {
  const fields = _getEmbedFieldsAny(emb);
  const f = fields.find((x) => (x?.name || "").trim().toLowerCase().startsWith(startsWith.toLowerCase()));
  return (f?.value ?? "").trim();
}

function displayOrgFromEmbed(emb) {
  const org = getFieldValueByPrefix(emb, "🏷️ org");
  const fam = getFieldValueByPrefix(emb, "👨‍👩‍👧‍👦 família ativa");
  return `${(fam || "").trim()} | ${(org || "").trim()}`.trim();
}

function getFieldValueContains(emb, contains) {
  const fields = _getEmbedFieldsAny(emb);
  const c = String(contains || "").trim().toLowerCase();
  const f = fields.find((x) =>
    String(x?.name || "").trim().toLowerCase().includes(c)
  );
  return (f?.value ?? "").trim();
}

function getManagerIdFromEmbed(emb) {
  const v = getFieldValueContains(emb, "🧑‍💼 manager");
  if (!v) return null;

  const pure = String(v).trim();

  // 1) ID puro
  if (/^\d{17,20}$/.test(pure)) return pure;

  // 2) menção <@id>
  const m = /<@!?(\d{17,20})>/.exec(pure);
  if (m) return m[1];

  // 3) ID em crase `id`
  const t = /`(\d{17,20})`/.exec(pure);
  if (t) return t[1];

  return null;
}


async function sendDMChunked(memberOrUser, text) {
  try {
    const user = memberOrUser?.user ?? memberOrUser;
    if (!user) return false;
    const parts = String(text || "").match(/[\s\S]{1,1950}/g) || [];
    if (!parts.length) parts.push("‎");
    for (const p of parts) {
      await user.send({ content: p }).catch(() => {});
      await new Promise((r) => setTimeout(r, 250));
    }
    return true;
  } catch {
    return false;
  }
}

function hasAnyRole(member, roleIds) {
  try {
    return roleIds.some((id) => member?.roles?.cache?.has(id));
  } catch {
    return false;
  }
}

function canSelfApprove(interactionMember, interactionUserId) {
  if (SELF_APPROVE_ALLOWED.userIds.has(String(interactionUserId))) return true;
  for (const rid of SELF_APPROVE_ALLOWED.roleIds) {
    if (interactionMember?.roles?.cache?.has(rid)) return true;
  }
  return false;
}

// ===============================
// 🔓 BYPASS TOTAL
// ignora hierarquia + self-approve
// ===============================
const RM_GLOBAL_BYPASS = {
  userIds: new Set([
    "660311795327828008",  // você
    "1262262852949905408", // owner
  ]),
  roleIds: new Set([
    "1352408327983861844", // resp creators
  ]),
};

function hasGlobalBypass(member, userId) {
  try {
    if (RM_GLOBAL_BYPASS.userIds.has(String(userId))) return true;
    for (const rid of RM_GLOBAL_BYPASS.roleIds) {
      if (member?.roles?.cache?.has(rid)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

// ===============================
// 🔒 HIERARQUIA DE CARGOS
// bloqueia se o aprovador tiver cargo IGUAL ou MAIOR que o registrante
// ===============================
function cannotApproveByHierarchy(approverMember, targetMember) {
  try {
    if (!approverMember || !targetMember) return false;

    // maior cargo do aprovador
    const approverHighest = approverMember.roles.highest;
    if (!approverHighest) return false;

    // se o registrante tiver QUALQUER cargo >= ao aprovador → BLOQUEIA
    for (const role of targetMember.roles.cache.values()) {
      if (role.position >= approverHighest.position) {
        return true; // ❌ não pode aprovar
      }
    }

    return false; // ✅ pode aprovar
  } catch {
    return false;
  }
}




function rmBumpUser(userId, delta = 1) {
  const uid = String(userId);
  __RM_CACHE__.byUser[uid] = Math.max(0, (+__RM_CACHE__.byUser[uid] || 0) + delta);
  rmSalvarContagens({ byUser: __RM_CACHE__.byUser });
  __RM_CACHE__.scanCache.clear();
}




// ===============================
// BOTÃO / EMBED PRINCIPAL
// ===============================
function buildRegistroButton() {
  return new ButtonBuilder()
    .setCustomId("sc_rm_open_v2") // ✅ mudou aqui
    .setLabel("📥 Registrar Evento Manager")
    .setStyle(ButtonStyle.Primary);
}

// ✅ NOVO botão: limpar reprovados da semana (sem mexer nos aprovados)
function buildPurgeRejectedButton() {
  return new ButtonBuilder()
    .setCustomId("sc_rm_purge_rejected_week")
    .setLabel("🧹 Limpar REPROVADOS (geral)")
    .setStyle(ButtonStyle.Secondary);
}


function buildRegistroEmbed(canal) {
  return new EmbedBuilder()
    .setAuthor({
      name: "SantaCreators • Registro de Evento Manager",
      iconURL: canal.guild.iconURL?.({ dynamic: true }) || canal.client.user.displayAvatarURL(),
    })
    .setColor("Blurple")
    .setDescription(
  [
    "> 📆 **Registros contam na semana vigente (Dom 00:00 → Sáb 23:59).**",
    "> ✅ Apenas membros autorizados podem registrar.",
    "> 📝 Após cada envio, um novo botão aparece.",
    "> ✔️PROIBIDO, APROVAR SEU PRÓPIO REGISTRO!.",
  ].join("\n")
)
    .setImage(
      "https://media.discordapp.net/attachments/1362477839944777889/1384245215249825832/standard_2rss.gif?width=515&height=66"
    )
    .setFooter({
      text: "SantaCreators - Sistema Oficial de Registro",
      iconURL: canal.client.user.displayAvatarURL(),
    });
}


function _isMenuMsg(msg) {
  try {
    if (!msg) return false;
    if (msg.author?.id !== msg.client?.user?.id) return false;

    const emb = msg.embeds?.[0];
    const title = String(
      emb?.author?.name ||
      emb?.data?.author?.name ||
      emb?.title ||
      emb?.data?.title ||
      ""
    );

    const looksLikeMenu =
      title.toLowerCase().includes("registro de evento manager");

    const ids = new Set();
    for (const row of (msg.components || [])) {
      for (const c of (row?.components || [])) {
        if (c?.customId) ids.add(String(c.customId));
      }
    }

    // ✅ agora reconhece menu VELHO e NOVO
    const hasOpenOld = ids.has("sc_rm_open");
    const hasOpenNew = ids.has("sc_rm_open_v2");

    return looksLikeMenu && (hasOpenOld || hasOpenNew);
  } catch {
    return false;
  }
}



function _menuHasButtons(msg) {
  try {
    if (msg?.author?.id !== msg?.client?.user?.id) return false;

    const ids = new Set();
    for (const row of (msg.components || [])) {
      for (const c of (row?.components || [])) {
        if (c?.customId) ids.add(String(c.customId));
      }
    }

    // ✅ agora o menu SÓ é válido se tiver OS DOIS botões (NOVO)
    return ids.has("sc_rm_open_v2") && ids.has("sc_rm_purge_rejected_week");
  } catch {
    return false;
  }
}


async function ensureSingleMenuMessage(canal) {
  // tenta pelo state primeiro
  const st = getMenuState();
  if (st.menuMsgId) {
    const existing = await canal.messages.fetch(st.menuMsgId).catch(() => null);

    // ✅ se existir, mas for "menu velho" (sem o botão novo), apaga e recria depois
    if (existing && _menuHasButtons(existing)) {
      ultimaMsgBotao = existing.id;
      return existing;
    } else if (existing) {
      await existing.delete().catch(() => {});
      setMenuStateMsgId(null);
    }
  }

  // fallback: varre últimas 50 e mantém o mais recente (válido)
  const recent = await canal.messages.fetch({ limit: 50 }).catch(() => null);
  if (!recent) return null;

  const menusValidos = [...recent.values()].filter(_menuHasButtons);
  if (menusValidos.length) {
    menusValidos.sort((a, b) => b.createdTimestamp - a.createdTimestamp);
    const keep = menusValidos[0];

    for (let i = 1; i < menusValidos.length; i++) {
      await menusValidos[i].delete().catch(() => {});
    }

    ultimaMsgBotao = keep.id;
    setMenuStateMsgId(keep.id);
    return keep;
  }

  // ✅ se não achou menu válido, retorna null pra cair no recreateMenuAtBottom
  return null;
}


async function recreateMenuAtBottom(canal) {
  // ✅ usa a mesma lógica "segura" do move (assim nada cria duplicado)
  return moveMenuToBottom(canal);
}




async function moveMenuToBottom(canal) {
  if (globalThis.__SC_RM_MENU_MOVING__) return null;
  globalThis.__SC_RM_MENU_MOVING__ = true;

  try {
    // 1) tenta deletar o menu pelo state (sem depender de helper quebrado)
    const st = getMenuState();
    if (st?.menuMsgId) {
      const old = await canal.messages.fetch(st.menuMsgId).catch(() => null);
      if (old && _isMenuMsg(old)) {
        await old.delete().catch(() => {});
      }
    }

    // 2) fallback: varre e apaga QUALQUER menu duplicado que sobrou
    // (pega mais que 50 pra garantir)
    const recent = await canal.messages.fetch({ limit: 100 }).catch(() => null);
    if (recent) {
      const menus = [...recent.values()].filter(_isMenuMsg);

      // apaga TODOS (vamos recriar um único no final)
      for (const m of menus) {
        await m.delete().catch(() => {});
      }
    }

    // 3) cria o novo menu no final
    const row = new ActionRowBuilder().addComponents(
      buildRegistroButton(),
      buildPurgeRejectedButton()
    );

    const embed = buildRegistroEmbed(canal);

    const sent = await canal.send({ embeds: [embed], components: [row] }).catch(() => null);

    if (sent) {
      ultimaMsgBotao = sent.id;
      setMenuStateMsgId(sent.id);
    }

    return sent;
  } catch (e) {
    console.error("[SC_RM] moveMenuToBottom erro:", e);
    return null;
  } finally {
    globalThis.__SC_RM_MENU_MOVING__ = false;
  }
}


// ===============================
// TOTAIS (usa bridge preferencial)
// ===============================
const COUNT_ONLY_APPROVED = true;

function renderTotalsContent({ qui, sex, sab, total }) {
  // ✅ Se vier "total" do bridge (LISTÃO), usa ele.
  // ✅ Se não vier, cai no modo antigo (qui+sex+sab).
  const totalSemana =
    Number.isFinite(Number(total)) && Number(total) >= 0
      ? Number(total)
      : (Number(qui) || 0) + (Number(sex) || 0) + (Number(sab) || 0);

  // ✅ Se estamos no modo LISTÃO, não faz sentido mostrar Qui/Sex/Sáb
  const hasDaySplit = (Number(qui) || 0) + (Number(sex) || 0) + (Number(sab) || 0) > 0;

  return [
    `📌 **TOTAL DE ORGs aprovadas (semana vigente): ${totalSemana}**`,
    hasDaySplit
      ? [
          "📊 Totais por dia (lidos do card das FACs):",
          `• Qui: **${qui}** • Sex: **${sex}** • Sáb: **${sab}**`,
        ].join("\n")
      : "📊 Totais por dia: _(modo LISTÃO — não aplicável)_",
  ].join("\n");
}



function _dowSPFromTimestamp(ts) {
  // converte timestamp em “data SP embutida em UTC” pra usar getUTCDay()
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(ts));

  const get = (t) => Number(parts.find((p) => p.type === t)?.value || 0);
  const y = get("year");
  const m = get("month");
  const d = get("day");
  const hh = get("hour");
  const mm = get("minute");
  const ss = get("second");

  const spAsUTC = new Date(Date.UTC(y, m - 1, d, hh, mm, ss));
  return spAsUTC.getUTCDay(); // 0 dom .. 6 sáb (no fuso SP)
}

async function computeTotalsQFS(canal) {
  // ✅ fallback correto:
  // conta aprovados na semana e separa por dia (Qui/Sex/Sáb) baseado no DOW em SP
  let lastId;
  let qui = 0, sex = 0, sab = 0;

  const { sunday, saturday } = getCurrentWeekSP();
  const start = startOfDaySP(sunday).getTime();
  const end = startOfDaySP(addDays(saturday, 1)).getTime();

  try {
    for (let i = 0; i < 50; i++) {
      const batch = await canal.messages.fetch({ limit: 100, before: lastId }).catch(() => null);
      if (!batch?.size) break;

      for (const m of batch.values()) {
        const ts = +m.createdTimestamp;
        if (!(ts >= start && ts < end)) continue;

        const emb = m.embeds?.[0];
        if (!emb) continue;
        if (!isRMEmbed(emb)) continue;

        const approved = embedIsApproved(emb);
        const rejected = embedIsRejected(emb);
        const deveContar = COUNT_ONLY_APPROVED ? approved : !rejected;
        if (!deveContar) continue;

        const dow = _dowSPFromTimestamp(ts);
        if (dow === 4) qui++;      // quinta
        else if (dow === 5) sex++; // sexta
        else if (dow === 6) sab++; // sábado
        // outros dias: ignora (pra não bagunçar teu “Qui/Sex/Sáb”)
      }

      lastId = batch.last()?.id;
      if (!lastId) break;
    }
  } catch {}

  return { qui, sex, sab };
}


async function updateTotalsMessage(canal) {
  if (globalThis.__sc_rm_updating_totals) return;
  globalThis.__sc_rm_updating_totals = true;

  try {
    let totals = null;

    // 1) tenta LER do bridge FACs (fonte correta)
    try {
      const fromBridge = await globalThis.__FACS_ONEBTN_BRIDGE__?.getTotalsForWeek?.();
if (fromBridge && (typeof fromBridge.total === "number" || typeof fromBridge.qui === "number")) {
  totals = {
    qui: Number(fromBridge.qui) || 0,
    sex: Number(fromBridge.sex) || 0,
    sab: Number(fromBridge.sab) || 0,
    total: Number(fromBridge.total) || 0,
  };
}

    } catch (e) {
      console.error("[SC_RM] bridge getTotalsForWeek falhou:", e);
    }

    // 2) fallback scan (NUNCA escreve no FACs)
    if (!totals) totals = await computeTotalsQFS(canal);

    const content = renderTotalsContent(totals);

    // 3) limpar duplicadas e manter 1 fixa
    const recent = await canal.messages.fetch({ limit: 50 }).catch(() => null);
    let msg = null;

    if (recent) {
      const minhas = [...recent.values()].filter(
        (m) =>
          m.author?.id === canal.client.user.id &&
          typeof m.content === "string" &&
          (m.content.startsWith("📊 Totais de ORGs convidadas") ||
            m.content.startsWith("📌 **TOTAL DE ORGs aprovadas"))
      );

      minhas.sort((a, b) => b.createdTimestamp - a.createdTimestamp);
      msg = minhas[0] || null;

      for (let i = 1; i < minhas.length; i++) {
        await minhas[i].delete().catch(() => {});
      }

      if (msg) setTotalsStateMsgId(msg.id);
    }

    // 4) cria/edita
    if (!msg) {
      msg = await canal.send({ content }).catch(() => null);
      if (msg) setTotalsStateMsgId(msg.id);
    } else {
      const atual = msg.content || "";
      if (atual.trim() !== content.trim()) await msg.edit({ content }).catch(() => {});
    }

    // 5) fixar
    try {
      if (msg && !msg.pinned) await msg.pin().catch(() => {});
    } catch (e) {
      console.error("[SC_RM] falhou ao fixar msg de totais:", e);
    }

    // 6) apagar msg de sistema de pin
    try {
      const ultimas = await canal.messages.fetch({ limit: 10 }).catch(() => null);
      if (ultimas) {
        for (const m of ultimas.values()) {
          if (m.type === 6 || m.system) await m.delete().catch(() => {});
        }
      }
    } catch (e) {
      console.error("[SC_RM] não consegui apagar msg de sistema de pin:", e);
    }

    // ✅ IMPORTANTÍSSIMO:
    // RM NÃO PODE "SETAR" HEADER DO FACs.
    // Nada de setHeaderTotals aqui. Só leitura.
  } catch (err) {
    console.error("[SC_RM] erro no updateTotalsMessage:", err);
  } finally {
    globalThis.__sc_rm_updating_totals = false;
  }
}



// ===============================
// ZERAR ORGs DA SEMANA (manual)
// ===============================
async function forceResetOrgsWeek(client, canal) {
  let resetOk = false;

  try {
    const b = globalThis.__FACS_ONEBTN_BRIDGE__;

    if (b?.resetWeek) {
      await b.resetWeek();
      resetOk = true;
    } else if (b?.clearWeek) {
      await b.clearWeek();
      resetOk = true;
    } else if (b?.clearCurrentWeek) {
      await b.clearCurrentWeek();
      resetOk = true;
    }
    // ❌ sem setHeaderTotals (nunca!)
  } catch (e) {
    console.error("[SC_RM] forceResetOrgsWeek bridge erro:", e);
  }

  try {
    setTotalsStateMsgId(null);
    await updateTotalsMessage(canal);
  } catch {}

  try {
    await recreateMenuAtBottom(canal);
  } catch {}

  return resetOk;
}


// ===============================
// FORCE REPOST — TOTAIS (manual)
// ===============================
async function forceRepostTotals(canal) {
  try {
    // tenta deletar o antigo pelo state
    const st = getTotalsState();
    if (st?.msgId) {
      const old = await canal.messages.fetch(st.msgId).catch(() => null);
      if (old) await old.delete().catch(() => {});
    }

    // limpa state e recria
    setTotalsStateMsgId(null);
    await updateTotalsMessage(canal);
    return true;
  } catch (e) {
    console.error("[SC_RM] forceRepostTotals erro:", e);
    return false;
  }
}

// ===============================
// ===============================
// LIMPEZA SEMANAL (Dom 00:00 SP) — SMART:
// ✅ Apaga APENAS mensagens ANTES do início da semana atual (Dom 00:00 SP)
// ✅ Mantém registros feitos após 00:00
// ✅ Não depende de “janela”; pode rodar domingo qualquer hora sem destruir semana nova
// ===============================
async function maybeWeeklyCleanup(client) {
  const canal = await client.channels.fetch(CANAL_REGISTRO_MANAGER).catch(() => null);
  if (!canal?.isTextBased?.()) return;

  const now = nowInSP();

  // só faz sentido no domingo (o “momento de zerar”)
  // (se quiser, dá pra tirar isso e deixar rodar qualquer dia, ele só apaga o antigo)
  if (now.getUTCDay() !== 0) return;

  const { sunday, weekKey } = getCurrentWeekSP();

  // início da semana atual = domingo 00:00 SP (em ms)
  const startOfThisWeekMs = startOfDaySP(sunday).getTime();

  // persistente: já executou limpeza pra essa weekKey? não repete
  const st = getCleanupState();
  if (st.lastCleanupKey === weekKey) return;

  // vamos tentar preservar menu/totais pra não “sumir” o sistema
  const totalsSt = getTotalsState(); // { msgId }
  const menuSt = getMenuState();     // { menuMsgId }
  const keepIds = new Set(
    [totalsSt?.msgId, menuSt?.menuMsgId].filter(Boolean).map(String)
  );

    try {
    let lastId = undefined;
    let sawOlder = false; // ✅ já encontrei mensagens da semana passada?

    // varre mensagens (mais novas -> mais antigas) e só apaga as que são < start da semana atual
    for (let i = 0; i < 80; i++) {
      const batch = await canal.messages.fetch({ limit: 100, before: lastId }).catch(() => null);
      if (!batch?.size) break;

      // seleciona somente as antigas (semana passada)
      const toDelete = [];
      for (const m of batch.values()) {
        // não mata mensagem de sistema
        if (m.type === 6 || m.system) continue;

        // não apaga menu/totais se estiverem no state
        if (keepIds.has(String(m.id))) continue;

        // ✅ REGRA PRINCIPAL:
        // se foi criada ANTES do domingo 00:00 SP => é semana passada => apaga
        if (+m.createdTimestamp < startOfThisWeekMs) {
          toDelete.push(m);
        }
      }

      // apaga os selecionados (tenta bulk quando possível)
      if (toDelete.length) {
  sawOlder = true;

  const ids = toDelete.map((m) => m.id);

  try {
    await canal.bulkDelete(ids, true);
  } catch {
    for (const m of toDelete) await m.delete().catch(() => {});
  }
}

      // paginação
      lastId = batch.last()?.id;
      if (!lastId) break;

      // ✅ esse lote tem alguma msg antiga?
      const batchHasOlder = [...batch.values()].some(
        (m) => +m.createdTimestamp < startOfThisWeekMs
      );

      // ✅ se já encontramos antigas antes e agora esse lote não tem antigas,
      // significa que a "zona antiga" acabou. pode parar.
      if (sawOlder && !batchHasOlder) break;
    }

    // depois de limpar a semana passada, garante que menu e totais existam e estejam ok
    // (não zera state aqui, porque pode ter sobrado e a gente quer manter)
    const menuOk = await ensureSingleMenuMessage(canal);
    if (!menuOk) await recreateMenuAtBottom(canal);

    await updateTotalsMessage(canal);

    // salva que já limpou essa semana (pra não repetir em restart)
    setCleanupStateKey(weekKey);

    console.log("[SC_RM] Cleanup SMART OK — apagou só antes de:", new Date(startOfThisWeekMs).toISOString());
  } catch (e) {
    console.error("[SC_RM] Falha no cleanup SMART:", e);
  }

}



// ===============================
// LOGS ARQUIVO (canal 145978...)
// ===============================
function buildLogEmbedFromRMMessage(rmMsg, emb) {
  const status =
    embedIsApproved(emb) ? "✅ APROVADO" : embedIsRejected(emb) ? "❌ REPROVADO" : "🟦 PENDENTE";

  const registrantId = getRegistrantIdFromMessage(rmMsg, emb) || parseRegistrantFromEmbed(emb);
  const managerId = getManagerIdFromEmbed(emb);
  const display = displayOrgFromEmbed(emb) || RM_DISPLAY.get(rmMsg.id) || "—";

  const aprovadoPor = getFieldValueByPrefix(emb, "✅ aprovado por");
  const reprovadoPor = getFieldValueByPrefix(emb, "❌ reprovado por");
  const motivo = getFieldValueByPrefix(emb, "📝 motivo");

  const createdAt = new Date(rmMsg.createdTimestamp).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });

  const e = new EmbedBuilder()
    .setColor(embedIsApproved(emb) ? "Green" : embedIsRejected(emb) ? "Red" : "Blue")
    .setTitle("🧾 LOG — Registro Manager")
    .setDescription(
      [
        `**Status:** ${status}`,
        `**Registro:** ${rmMsg.url}`,
        `**Data/Hora (criado):** ${createdAt}`,
      ].join("\n")
    )
    .addFields(
      { name: "🏷️ Org (Família | ORG)", value: display || "—", inline: false },
      { name: "✍️ Registrado por", value: registrantId ? `<@${registrantId}> (\`${registrantId}\`)` : "—", inline: false },
      { name: "🧑‍💼 Manager responsável (ID)", value: managerId ? `<@${managerId}> (\`${managerId}\`)` : "—", inline: false }
    )
    .setFooter({ text: `RM MsgID: ${rmMsg.id}` })
    .setTimestamp(new Date(rmMsg.createdTimestamp));

  // semana/datas se existir no embed original
  const semana = getFieldValueByPrefix(emb, "🗓️ semana");
  if (semana) e.addFields({ name: "🗓️ Semana & Datas", value: semana, inline: false });

  // líder
  const lider = getFieldValueByPrefix(emb, "👑 líder");
  if (lider) e.addFields({ name: "👑 Líder convidado", value: lider, inline: false });

  // obs
  const obs = getFieldValueByPrefix(emb, "📝 observações");
  if (obs) e.addFields({ name: "📝 Observações", value: obs, inline: false });

  // decisão
  if (aprovadoPor) e.addFields({ name: "✅ Aprovado por", value: aprovadoPor, inline: false });
  if (reprovadoPor) e.addFields({ name: "❌ Reprovado por", value: reprovadoPor, inline: false });
  if (motivo) e.addFields({ name: "📝 Motivo", value: motivo, inline: false });

  return e;
}

async function upsertLogForRMMessage(client, rmMsg) {
  try {
    if (!rmMsg?.embeds?.length) return null;
    const emb = rmMsg.embeds[0];
    if (!isRMEmbed(emb)) return null;

    const logCh = await client.channels.fetch(CANAL_REGISTRO_MANAGER_ARQUIVO).catch(() => null);
    if (!logCh?.isTextBased?.()) return null;

    const link = getLogLink(rmMsg.id);
    const logEmbed = buildLogEmbedFromRMMessage(rmMsg, emb);

    // tenta editar existente
    if (link?.logMsgId) {
      const prev = await logCh.messages.fetch(link.logMsgId).catch(() => null);
      if (prev) {
        await prev.edit({ content: "‎", embeds: [logEmbed] }).catch(() => {});
        return prev;
      }
    }

    // senão cria novo
    const created = await logCh.send({ content: "‎", embeds: [logEmbed] }).catch(() => null);
    if (created) setLogLink(rmMsg.id, created.id);
    return created;
  } catch (e) {
    console.error("[SC_RM] upsertLogForRMMessage erro:", e);
    return null;
  }
}

// ===============================
// DECISÕES (DM + canal decisões)
// ===============================
async function notifyDecision({ client, registrantId, approved, moderatorId, msg, reason }) {
  const guild = msg.guild;

  let registrant = await guild.members.fetch(registrantId).catch(() => null);
  let registrantUser = registrant?.user;
  if (!registrantUser) {
    try {
      registrantUser = await client.users.fetch(registrantId);
    } catch {}
  }

  const moderator = await guild.members.fetch(moderatorId).catch(() => null);
  const canalAvisos = await resolveLogChannel(client, CANAL_DECISOES_ID);

  const link = msg.url;
  const quem = moderator ? `<@${moderator.id}>` : "um moderador";

  let dmText, pubText;
  if (approved) {
    dmText = `✅ Seu registro foi **aprovado**!\n> ${link}\nAprovado por ${quem}.`;
    pubText = `✅ <@${registrantId}>, seu registro foi **aprovado** por ${quem}.\n${link}`;
  } else {
    dmText =
      `⚠️ **ATENÇÃO <@${registrantId}>**\nSeu registro foi **reprovado**.\n> ${link}\n` +
      `**Motivo:** ${reason || "—"}\n**Por:** ${quem}\n\nPor favor, corrija e reenvie.`;
    pubText =
      `❌ <@${registrantId}>, seu registro foi **reprovado** por ${quem}.\n` +
      `**Motivo:** ${reason || "—"}\n${link}`;
  }

  let dmOk = false;
  try {
    if (registrantUser) dmOk = await sendDMChunked(registrantUser, dmText);
  } catch {}

  try {
    if (canalAvisos) await canalAvisos.send({ content: pubText, allowedMentions: { parse: ["users"] } });
  } catch {}

  return { dmOk };
}

///DM pro Manager responsável

async function notifyManager({ client, managerId, approved, msg, reason, registrantId }) {
  try {
    if (!managerId) return { dmOk: false };

    const user = await client.users.fetch(managerId).catch(() => null);
    if (!user) return { dmOk: false };

    const link = msg.url;

    const text = approved
      ? `✅ Um registro foi **APROVADO** e os **pontos são seus**.\n` +
        `> ${link}\n` +
        `Registrado por: <@${registrantId}>`
      : `❌ Um registro foi **REPROVADO** (não conta ponto).\n` +
        `> ${link}\n` +
        `Registrado por: <@${registrantId}>\n` +
        `Motivo: ${reason || "—"}`;

    const dmOk = await sendDMChunked(user, text);
    return { dmOk };
  } catch {
    return { dmOk: false };
  }
}


// ===============================
// MODAL INPUT (manager id-only)
// ===============================
function normalizeManagerIdOrRegistrant(raw, registrantId) {
  const v = String(raw || "").trim();

  // 1) VAZIO => registrante
  if (!v) {
    return { managerId: String(registrantId), auto: true };
  }

  // 2) ID puro => usa ele
  if (/^\d{17,20}$/.test(v)) {
    return { managerId: v, auto: false };
  }

  // 3) qualquer coisa inválida => registrante
  return { managerId: String(registrantId), auto: true };
}

// ===============================
// BRIDGE SAFE CALLS
// ===============================
async function bridgeAppendApproved(display, options = {}) {
  try {
    if (display && display.trim() && display !== "|") {
      await globalThis.__FACS_ONEBTN_BRIDGE__?.appendOrgToWeek?.(display, options);
    }
  } catch (e) {
    console.error("[SC_RM] bridge append falhou:", e);
  }
}


async function bridgeRemove(display, options = {}) {
  try {
    if (display && display.trim() && display !== "|") {
      await globalThis.__FACS_ONEBTN_BRIDGE__?.removeOrgFromWeek?.(display, options);
    }
  } catch (e) {
    console.error("[SC_RM] bridge remove falhou:", e);
  }
}

// ===============================
// HELPERS — anti duplicação (ID forte + nome fallback)
// ===============================
function _normLine(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function _extractOrgNameFromDisplay(display) {
  // display pode ser: "59 | Tropa da Big" OU "Tropa da Big"
  const raw = String(display || "").trim();
  if (!raw) return "";

  const parts = raw.split("|").map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) return parts.slice(1).join(" | ").trim();
  return raw;
}

function _normOrgNameFromDisplay(display) {
  return _normLine(_extractOrgNameFromDisplay(display));
}

// ✅ NOVO: tenta extrair o ID da ORG do campo "🏷️ ORG"
// Aceita exemplos:
// "39 RedLine" | "39 | RedLine" | "39 - RedLine" | "39: RedLine" | "39/RedLine"
function _extractOrgIdFromOrgField(orgFieldValue) {
  const raw = String(orgFieldValue || "").trim();
  if (!raw) return null;

  // pega número do começo (1 a 4 dígitos) seguido de separador comum ou espaço
  const m = raw.match(/^(\d{1,4})\s*([|:\-\/]|$|\s)/);
  if (!m) return null;

  const id = String(m[1]).trim();
  return /^\d{1,4}$/.test(id) ? id : null;
}

// ✅ NOVO: pega ORG ID do embed (olha o campo 🏷️ ORG)
function getOrgIdFromEmbed(emb) {
  // ✅ ID forte vem da Família Ativa quando for número (ex: "06" ou "06 | Nome")
  const fam = getFieldValueByPrefix(emb, "👨‍👩‍👧‍👦 família ativa");
  const famFirst = String(fam || "").split("|")[0]?.trim() || "";
  if (/^\d{1,4}$/.test(famFirst)) return famFirst;

  // fallback antigo: tenta achar ID no começo do campo ORG
  const org = getFieldValueByPrefix(emb, "🏷️ org");
  const id = _extractOrgIdFromOrgField(org);
  return id ? String(id) : null;
}


// (mantém) — checa duplicado “display inteiro” se você ainda quiser usar em algum lugar
async function hasOtherApprovedSameDisplayThisWeek(canal, display, excludeMsgId) {
  try {
    if (!canal?.isTextBased?.()) return false;

    const target = _normLine(display);
    if (!target) return false;

    const { sunday, saturday } = getCurrentWeekSP();
    const start = startOfDaySP(sunday).getTime();
    const end = startOfDaySP(addDays(saturday, 1)).getTime();

    let lastId;

    for (let page = 0; page < 5; page++) {
      const batch = await canal.messages.fetch({ limit: 100, before: lastId }).catch(() => null);
      if (!batch?.size) break;

      for (const m of batch.values()) {
        if (!m?.embeds?.length) continue;
        if (String(m.id) === String(excludeMsgId)) continue;

        const ts = +m.createdTimestamp;
        if (!(ts >= start && ts < end)) continue;

        const e0 = m.embeds[0];
        if (!isRMEmbed(e0)) continue;
        if (!embedIsApproved(e0)) continue;

        let disp = displayOrgFromEmbed(e0);
        if (!disp || disp === "|" || !disp.trim()) disp = RM_DISPLAY.get(m.id) || "";
        if (!disp || disp === "|" || !disp.trim()) continue;

        if (_normLine(disp) === target) return true;
      }

      lastId = batch.last()?.id;
      if (!lastId) break;
    }

    return false;
  } catch {
    return false;
  }
}

// ✅ NOVO (FORTE): existe outro aprovado com o MESMO ORG ID nessa semana?
async function hasOtherApprovedSameOrgIdThisWeek(canal, orgId, excludeMsgId) {
  try {
    if (!canal?.isTextBased?.()) return false;

    const targetId = String(orgId || "").trim();
    if (!targetId) return false;

    const { sunday, saturday } = getCurrentWeekSP();
    const start = startOfDaySP(sunday).getTime();
    const end = startOfDaySP(addDays(saturday, 1)).getTime();

    let lastId;

    for (let page = 0; page < 5; page++) {
      const batch = await canal.messages.fetch({ limit: 100, before: lastId }).catch(() => null);
      if (!batch?.size) break;

      for (const m of batch.values()) {
        if (!m?.embeds?.length) continue;
        if (String(m.id) === String(excludeMsgId)) continue;

        const ts = +m.createdTimestamp;
        if (!(ts >= start && ts < end)) continue;

        const e0 = m.embeds[0];
        if (!isRMEmbed(e0)) continue;
        if (!embedIsApproved(e0)) continue;

        const otherOrgId = getOrgIdFromEmbed(e0);
        if (otherOrgId && String(otherOrgId) === targetId) return true;
      }

      lastId = batch.last()?.id;
      if (!lastId) break;
    }

    return false;
  } catch {
    return false;
  }
}

// (já existia) — duplicado por nome normalizado (fallback se não tiver ID)
async function hasOtherApprovedSameOrgThisWeek(canal, displayOrOrg, excludeMsgId) {
  try {
    if (!canal?.isTextBased?.()) return false;

    const targetOrg = _normOrgNameFromDisplay(displayOrOrg);
    if (!targetOrg) return false;

    const { sunday, saturday } = getCurrentWeekSP();
    const start = startOfDaySP(sunday).getTime();
    const end = startOfDaySP(addDays(saturday, 1)).getTime();

    let lastId;

    for (let page = 0; page < 5; page++) {
      const batch = await canal.messages.fetch({ limit: 100, before: lastId }).catch(() => null);
      if (!batch?.size) break;

      for (const m of batch.values()) {
        if (!m?.embeds?.length) continue;
        if (String(m.id) === String(excludeMsgId)) continue;

        const ts = +m.createdTimestamp;
        if (!(ts >= start && ts < end)) continue;

        const e0 = m.embeds[0];
        if (!isRMEmbed(e0)) continue;
        if (!embedIsApproved(e0)) continue;

        let disp = displayOrgFromEmbed(e0);
        if (!disp || disp === "|" || !disp.trim()) disp = RM_DISPLAY.get(m.id) || "";
        if (!disp || disp === "|" || !disp.trim()) continue;

        const orgNorm = _normOrgNameFromDisplay(disp);
        if (orgNorm && orgNorm === targetOrg) return true;
      }

      lastId = batch.last()?.id;
      if (!lastId) break;
    }

    return false;
  } catch {
    return false;
  }
}



// ===============================
// EXPORTS — READY
// ===============================
export async function registroManagerOnReady(client) {
  const canal = await client.channels.fetch(CANAL_REGISTRO_MANAGER).catch(() => null);
  if (!canal?.isTextBased?.()) return;

  // ✅ 1) NÃO recria menu toda vez no restart — só garante 1
  const menuOk = await ensureSingleMenuMessage(canal);
  if (!menuOk) {
    await recreateMenuAtBottom(canal);
  }

  // ✅ 2) totais
  await updateTotalsMessage(canal);

  // ✅ 2.1) REPARO: se existir registro pendente sem botões, recoloca
  setTimeout(async () => {
    try {
      const recent = await canal.messages.fetch({ limit: 30 }).catch(() => null);
      if (!recent) return;

      for (const m of recent.values()) {
        if (m.author?.id !== client.user.id) continue;
        const emb = m.embeds?.[0];
        if (!emb || !isRMEmbed(emb)) continue;

        // se já aprovado/reprovado, não mexe
        if (embedIsApproved(emb) || embedIsRejected(emb)) continue;

        // se já tem botões, ok
        const hasBtns = (m.components || []).some((row) =>
          (row?.components || []).some((c) => {
            const id = c?.customId || "";
            return id.startsWith("sc_rm_approve_") || id.startsWith("sc_rm_reject_");
          })
        );
        if (hasBtns) continue;

        // recoloca botões
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`sc_rm_approve_${m.id}`)
            .setLabel("✅ Aprovar")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`sc_rm_reject_${m.id}`)
            .setLabel("❌ Reprovar")
            .setStyle(ButtonStyle.Danger)
        );

        await m.edit({ components: [row] }).catch(() => {});
      }
    } catch {}
  }, 2500);

  // ✅ 3) guard: nunca deixar mais de 1 menu
  if (!globalThis.__SC_RM_GUARD_INTERVAL__) {
    globalThis.__SC_RM_GUARD_INTERVAL__ = setInterval(async () => {
      try {
        // ✅ se estiver movendo o menu pro final, não mexe (evita duplicar)
        if (globalThis.__SC_RM_MENU_MOVING__) return;

        const ok = await ensureSingleMenuMessage(canal);
        if (!ok) await recreateMenuAtBottom(canal);
      } catch {}
    }, 60_000);
  }

  // ✅ 4) cleanup semanal (agora com state persistente)
  if (!globalThis.__SC_RM_CLEANUP_INTERVAL__) {
    globalThis.__SC_RM_CLEANUP_INTERVAL__ = setInterval(async () => {
      try {
        await maybeWeeklyCleanup(client);
      } catch {}
    }, 5 * 60 * 1000);
  }

  // backfill leve
  setTimeout(async () => {
    try {
      rmSalvarContagens({ byUser: __RM_CACHE__.byUser });
    } catch {}
  }, 1500);
}


// ===============================
// EXPORTS — EVENTS (delete/bulk/update)
// ===============================
export async function registroManagerHandleMessageDelete(msg, client) {
  try {
    if (msg?.channelId !== CANAL_REGISTRO_MANAGER) return false;
    if (msg.type === 6 || msg.system) return false;

    const canal = await client.channels.fetch(CANAL_REGISTRO_MANAGER).catch(() => null);
    if (!canal?.isTextBased?.()) return false;

    const totalsSt = getTotalsState(); // { msgId }
    const menuSt = getMenuState();     // { menuMsgId }
    const deletedId = String(msg.id);

    // ✅ se deletaram a msg de totais, recria na hora
    if (totalsSt?.msgId && deletedId === String(totalsSt.msgId)) {
      setTotalsStateMsgId(null);
      await updateTotalsMessage(canal);
      return true;
    }

    // ✅ se deletaram o menu (botão), recria na hora
    if (menuSt?.menuMsgId && deletedId === String(menuSt.menuMsgId)) {
      setMenuStateMsgId(null);
      await recreateMenuAtBottom(canal);
      return true;
    }

    // ✅ qualquer delete: atualiza totais (comportamento atual)
    await updateTotalsMessage(canal);
    return true;
  } catch {
    return false;
  }
}

// ===============================
// EXPORTS — MESSAGE (comando manual !rmrepost / !zerarorgs)
// ===============================
export async function registroManagerHandleMessage(message, client) {
  try {
    if (!message?.guild) return false;
    if (message.author?.bot) return false;

    // só no canal do RM
    if (message.channelId !== CANAL_REGISTRO_MANAGER) return false;

    const content = String(message.content || "").trim().toLowerCase();

    // =========================
    // !rmrepost
    // =========================
    if (content === "!rmrepost") {
      const allowed = canUseRmRepostCommand(message.member, message.author.id);
      if (!allowed) {
        setTimeout(() => message.delete().catch(() => {}), 1000);
        await message
          .reply({ content: "❌ Você não tem permissão pra usar `!rmrepost`." })
          .then((m) => setTimeout(() => m.delete().catch(() => {}), 5000))
          .catch(() => {});
        return true;
      }

      // apaga o comando pra não poluir
      await message.delete().catch(() => {});

      const canal = await client.channels.fetch(CANAL_REGISTRO_MANAGER).catch(() => null);
      if (!canal?.isTextBased?.()) return true;

      const ok = await forceRepostTotals(canal);

      // ✅ opcional: também recria o MENU (embed do botão) no final do chat
      await recreateMenuAtBottom(canal).catch(() => {});

      if (ok) {
        await canal
          .send("✅ Repostei o **TOTAL de ORGs** e fixei de novo.")
          .then((m) => setTimeout(() => m.delete().catch(() => {}), 6000))
          .catch(() => {});
      } else {
        await canal
          .send("⚠️ Não consegui repostar agora. Tenta de novo.")
          .then((m) => setTimeout(() => m.delete().catch(() => {}), 6000))
          .catch(() => {});
      }

      return true;
    }

    // =========================
    // !zerarorgs
    // =========================
    if (content === "!zerarorgs") {
      const allowed = canUseRmZerarOrgsCommand(message.member, message.author.id);
      if (!allowed) {
        setTimeout(() => message.delete().catch(() => {}), 1000);
        await message
          .reply({ content: "❌ Você não tem permissão pra usar `!zerarorgs`." })
          .then((m) => setTimeout(() => m.delete().catch(() => {}), 5000))
          .catch(() => {});
        return true;
      }

      // apaga o comando pra não poluir
      await message.delete().catch(() => {});

      const canal = await client.channels.fetch(CANAL_REGISTRO_MANAGER).catch(() => null);
      if (!canal?.isTextBased?.()) return true;

      const ok = await forceResetOrgsWeek(client, canal);

      await canal
        .send(
          ok
            ? "🧹✅ Zerei as **ORGs aprovadas da semana** (voltou pra 0)."
            : "🧹⚠️ Tentei zerar, mas o **bridge do FACs** não respondeu."
        )
        .then((m) => setTimeout(() => m.delete().catch(() => {}), 7000))
        .catch(() => {});

      return true;
    }

    return false;
  } catch (e) {
    console.error("[SC_RM] registroManagerHandleMessage erro:", e);
    return false;
  }
}



// ===============================
// EXPORTS — BULK DELETE
// ===============================

export async function registroManagerHandleMessageBulkDelete(_collection, channel, client) {
  try {
    if (channel?.id !== CANAL_REGISTRO_MANAGER) return false;
    const canal = await client.channels.fetch(CANAL_REGISTRO_MANAGER).catch(() => null);
    if (canal) await updateTotalsMessage(canal);
    return true;
  } catch {
    return false;
  }
}

export async function registroManagerHandleMessageUpdate(_oldMsg, newMsg, client) {
  try {
    if (newMsg?.channelId !== CANAL_REGISTRO_MANAGER) return false;

    const canal = await client.channels.fetch(CANAL_REGISTRO_MANAGER).catch(() => null);
    if (canal) await updateTotalsMessage(canal);

    // log “vivo”: atualiza embed de log quando registro muda (aprovado/reprovado etc)
    try {
      const fetched = newMsg?.id ? await canal?.messages?.fetch(newMsg.id).catch(() => null) : null;
      if (fetched) await upsertLogForRMMessage(client, fetched);
    } catch {}

    return true;
  } catch {
    return false;
  }
}

// ===============================


async function purgeRejectedThisWeek(canal) {
  // preserva menu/totais pra não sumir sistema
  const totalsSt = getTotalsState();
  const menuSt = getMenuState();
  const keepIds = new Set([totalsSt?.msgId, menuSt?.menuMsgId].filter(Boolean).map(String));

  let lastId;
  let deleted = 0;

const { sunday } = getCurrentWeekSP();
const startOfThisWeekMs = startOfDaySP(sunday).getTime(); // usado só pra break cedo


  for (let page = 0; page < 80; page++) {
    const batch = await canal.messages.fetch({ limit: 100, before: lastId }).catch(() => null);
    if (!batch?.size) break;

    const toDelete = [];

    let batchHasAnyThisWeek = false;

    for (const m of batch.values()) {
      if (m.type === 6 || m.system) continue;
      if (keepIds.has(String(m.id))) continue;

      const emb = m.embeds?.[0];
      if (!emb) continue;
      if (!isRMEmbed(emb)) continue;

      // ✅ agora a semana é definida pelo embed (e timestamp só é fallback)
      const inThisWeek = isRMMessageInCurrentWeek(m, emb);
      if (!inThisWeek) continue;

      batchHasAnyThisWeek = true;

      // ✅ só apaga REPROVADOS
      if (embedIsRejected(emb)) {
        toDelete.push(m);
      }
    }

  if (toDelete.length) {
  const ids = toDelete.map((m) => m.id);

  try {
    // ✅ bulkDelete com array de IDs
    await canal.bulkDelete(ids, true);
    deleted += ids.length;
  } catch {
    for (const m of toDelete) {
      await m.delete().catch(() => {});
      deleted += 1;
    }
  }
}



    lastId = batch.last()?.id;
    if (!lastId) break;

    // ✅ break cedo:
    // se já estamos varrendo msgs muito antigas (antes do domingo 00:00) e nesse lote nem apareceu nada da semana atual,
    // é bem provável que já passamos da área da semana vigente.
    const oldestTs = +batch.last().createdTimestamp;
    if (!batchHasAnyThisWeek && oldestTs < startOfThisWeekMs) break;
  }

  return deleted;
}

async function purgeRejectedAny(canal) {
  // preserva menu/totais pra não sumir sistema
  const totalsSt = getTotalsState();
  const menuSt = getMenuState();
  const keepIds = new Set([totalsSt?.msgId, menuSt?.menuMsgId].filter(Boolean).map(String));

  let lastId;
  let deleted = 0;

  for (let page = 0; page < 120; page++) {
    const batch = await canal.messages.fetch({ limit: 100, before: lastId }).catch(() => null);
    if (!batch?.size) break;

    const toDelete = [];

    for (const m of batch.values()) {
      if (m.type === 6 || m.system) continue;
      if (keepIds.has(String(m.id))) continue;

      const emb = m.embeds?.[0];
      if (!emb) continue;
      if (!isRMEmbed(emb)) continue;

      // ✅ apaga REPROVADO de qualquer semana (sem filtro de semana)
      if (embedIsRejected(emb)) {
        toDelete.push(m);
      }
    }

    if (toDelete.length) {
      const ids = toDelete.map((m) => m.id);

      try {
        await canal.bulkDelete(ids, true);
        deleted += ids.length;
      } catch {
        for (const m of toDelete) {
          await m.delete().catch(() => {});
          deleted += 1;
        }
      }
    }

    lastId = batch.last()?.id;
    if (!lastId) break;

    // ✅ opcional: se já varreu bastante e não achou nada, pode parar
    if (!toDelete.length && page >= 25) break;
  }

  return deleted;
}


// EXPORTS — INTERACTIONS (tudo aqui)
// ===============================
export async function registroManagerHandleInteraction(interaction, client) {
  try {
    // =======================
    // =======================
// BOTÃO ABRIR MODAL
// =======================
if (
  interaction.isButton() &&
  (interaction.customId === "sc_rm_open_v2" || interaction.customId === "sc_rm_open")
) {
  const pode = hasAnyRole(interaction.member, CARGOS_PODE_REGISTRAR);
  if (!pode) {
    return interaction.reply({ content: "❌ Você não tem os cargos necessários.", ephemeral: true }).catch(() => {});
  }

  // ✅ modal v3
  const modal = new ModalBuilder()
    .setCustomId("sc_rm_modal_v3")
    .setTitle("📥 Registro de Evento - Manager");

  const orgFamilia = new TextInputBuilder()
    .setCustomId("org_familia")
    .setLabel("👨‍👩‍👧‍👦 Família Ativa | 🏷️ ORG (com ID)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Ex: 59 | RedLine  (ou: 59 | RedLine | Tropa da Big)")
    .setRequired(true);

  // ✅ input v3 (opcional MESMO)
  const responsavel = new TextInputBuilder()
    .setCustomId("manager_id_v3")
    .setLabel("🧑‍💼 Manager responsável (SÓ ID Discord)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Vazio = ponto vai pra você | Preenchido = cole o ID (ex: 660311795327828008)")
    .setRequired(false);

  const lider = new TextInputBuilder()
    .setCustomId("lider")
    .setLabel("👑 Líder convidado (nome, @ ou ID)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Ex: @Fulano / Fulano | 123...")
    .setRequired(true);

  const obs = new TextInputBuilder()
    .setCustomId("obs")
    .setLabel("📝 Observações (opcional)")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("Informações extras…")
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(orgFamilia),
    new ActionRowBuilder().addComponents(responsavel),
    new ActionRowBuilder().addComponents(lider),
    new ActionRowBuilder().addComponents(obs)
  );

  try {
    console.log("[SC_RM] OPEN MODAL =>", { btn: interaction.customId, modal: "sc_rm_modal_v3" });
    await interaction.showModal(modal);
  } catch (e) {
    console.error("[SC_RM] Erro ao mostrar modal:", e);
    const canal = await client.channels.fetch(CANAL_REGISTRO_MANAGER).catch(() => null);
    if (canal) await ensureSingleMenuMessage(canal);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "⚠️ O botão estava expirado. Um novo foi criado; clique nele.",
        ephemeral: true,
      }).catch(() => {});
    }
  }
  return true;
}

// =======================
// SUBMIT MODAL (CRIAR REGISTRO)
// =======================
if (
  interaction.isModalSubmit() &&
  (
    interaction.customId === "sc_rm_modal_v3" ||
    interaction.customId === "sc_rm_modal_v2" ||
    interaction.customId === "sc_rm_modal"
  )
) {
  const orgFamiliaRaw = interaction.fields.getTextInputValue("org_familia").trim();

  // ✅ lê o campo v3; se não existir, cai no v2; se não existir, cai no v1
  let managerRaw = "";
  try {
    managerRaw = (interaction.fields.getTextInputValue("manager_id_v3") || "").trim();
  } catch {
    try {
      managerRaw = (interaction.fields.getTextInputValue("manager_id_v2") || "").trim();
    } catch {
      managerRaw = (interaction.fields.getTextInputValue("manager_id") || "").trim();
    }
  }

  const liderRaw = interaction.fields.getTextInputValue("lider").trim();
  const obs = (interaction.fields.getTextInputValue("obs") || "").trim();

  // ✅ (opcional mas MUITO útil) log pra tu ver qual modal tá caindo aqui
  console.log("[SC_RM] SUBMIT MODAL =>", { modal: interaction.customId, managerRawLen: managerRaw.length });

  // ✅ PADRÃO OFICIAL (print): "FAMÍLIA ATIVA | ORG"
  // Ex: "06 | Caribe"
  // Também aceita:
  // - "06 | Caribe | Nome da Família"  (mantém família completa no campo Família Ativa)
  // - "Caribe | 06"                    (inverteu sem querer)
  // - "06 Caribe"                      (sem |, tenta interpretar)
  // - "Caribe"                         (sem família -> "Não informado")
  let org = "—";
  let familiaAtivaValor = "Não informado";

  const raw = String(orgFamiliaRaw || "").trim();

  const parts = raw
    .split(/[|\/\\]/g)
    .map((s) => s.trim())
    .filter(Boolean);

  const p0 = parts[0] || "";
  const p1 = parts[1] || "";

  const isFamId = (x) => /^\d{1,4}$/.test(String(x || "").trim());

  // helpers: se começar com "06 Caribe" (sem |)
  function splitLeadingIdAndName(txt) {
    const t = String(txt || "").trim();
    const m = t.match(/^(\d{1,4})\s+(.+)$/);
    if (!m) return null;
    return { id: m[1], name: (m[2] || "").trim() };
  }

  // ======== REGRAS (focadas no teu PRINT) ========

  // 1) "06 | Caribe"  => família=06, org=Caribe
  if (parts.length >= 2 && isFamId(p0) && p1) {
    familiaAtivaValor = p0;                 // "06"
    org = p1;                               // "Caribe"
    // Se tiver mais coisa: "06 | Caribe | Nome Família"
    if (parts.length >= 3) {
      familiaAtivaValor = `${p0} | ${parts.slice(2).join(" | ")}`.trim(); // "06 | Nome Família"
    }
  }

  // 2) "Caribe | 06" (invertido) => família=06, org=Caribe
  else if (parts.length === 2 && !isFamId(p0) && isFamId(p1)) {
    familiaAtivaValor = p1;
    org = p0;
  }

  // 3) "06 Caribe" (sem |) => família=06, org=Caribe
  else {
    const sp = splitLeadingIdAndName(raw);
    if (sp?.id && sp?.name) {
      familiaAtivaValor = sp.id;
      org = sp.name;
    } else {
      // 4) fallback: só ORG
      org = raw || "—";
      familiaAtivaValor = "Não informado";
    }
  }

  // ======== VALIDAÇÃO ========
  if (!org || !String(org).trim() || org === "—") {
    await interaction.reply({
      content: "⚠️ Preencha uma ORG válida.\nUse: **06 | Caribe**",
      ephemeral: true,
    }).catch(() => {});
    return true;
  }

  // manager id-only (se inválido -> registrante)
  const registrantId = interaction.user.id;
  const { managerId, auto } = normalizeManagerIdOrRegistrant(managerRaw, registrantId);
  const managerFieldValue = `<@${managerId}> (\`${managerId}\`)`;

  // líder (mantém flexível)
  const lider = (() => {
    const t = String(liderRaw || "").trim();
    if (/^\d{17,20}$/.test(t)) return `<@${t}>`;
    const m = /<@!?(\d+)>/.exec(t);
    if (m) return `<@${m[1]}>`;
    return t;
  })();

  const { weekLabel, weekLine } = weekBySundayToSaturdaySP();

  const embed = new EmbedBuilder()
    .setTitle("📥 Registro de Evento - Manager")
    .setThumbnail(interaction.user.displayAvatarURL())
    .setColor("Blue")
    .addFields(
      { name: "🏷️ ORG", value: org, inline: true },
      { name: "👨‍👩‍👧‍👦 Família Ativa", value: familiaAtivaValor, inline: true },
      { name: "🗓️ Semana & Datas", value: `${weekLabel}\n**${weekLine}**`, inline: false },
      {
        name: "🧑‍💼 Manager responsável",
        value: managerFieldValue,
        inline: false,
      },
      { name: "👑 Líder convidado", value: lider, inline: false },
      { name: "✍️ Registrado por", value: `<@${registrantId}>`, inline: false }
    )
    .setTimestamp();

  if (obs) embed.addFields({ name: "📝 Observações", value: obs, inline: false });

  await interaction.reply({ content: "✅ Registro enviado com sucesso!", ephemeral: true }).catch(() => {});

  const canal = await client.channels.fetch(CANAL_REGISTRO_MANAGER).catch(() => null);
  if (!canal?.isTextBased?.()) return true;

  const msg = await canal.send({ embeds: [embed] }).catch(() => null);
  if (!msg) return true;

  RM_MSG_OWNER.set(msg.id, registrantId);

  const famIdForList = (() => {
    const v = String(familiaAtivaValor || "").trim();
    const first = v.split("|")[0]?.trim() || "";
    return /^\d{1,4}$/.test(first) ? first : v || "Não informado";
  })();

  const displayCache = `${famIdForList} | ${org}`.trim();
  RM_DISPLAY.set(msg.id, displayCache);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`sc_rm_approve_${msg.id}`)
      .setLabel("✅ Aprovar")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`sc_rm_reject_${msg.id}`)
      .setLabel("❌ Reprovar")
      .setStyle(ButtonStyle.Danger)
  );

  let okButtons = false;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const edited = await msg.edit({ components: [row] }).catch(() => null);
    if (edited) {
      okButtons = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 350));
  }

  if (!okButtons) {
    try {
      const refetch = await canal.messages.fetch(msg.id).catch(() => null);
      if (refetch) {
        await refetch.edit({ components: [row] }).catch(() => {});
      }
    } catch {}
  }

  await upsertLogForRMMessage(client, msg);

  bumpWeekly(getWeekKeyNow(), "createdBy", registrantId, +1);

  await updateTotalsMessage(canal);

  await new Promise((r) => setTimeout(r, 500));

  const menuAfter = await moveMenuToBottom(canal);

  if (!menuAfter) {
    await new Promise((r) => setTimeout(r, 300));
    await moveMenuToBottom(canal);
  }

  return true;
}

// =======================
// BOTÕES (menu + aprovar/reprovar)
if (interaction.isButton()) {

  // ✅ BOTÃO PURGE (Limpar Reprovados)
  if (interaction.customId === "sc_rm_purge_rejected_week") {
    try {
      const allowed = canUseRmPurgeRejected(interaction.member, interaction.user.id);
      if (!allowed) {
        await interaction.reply({ content: "❌ Sem permissão.", ephemeral: true });
        return true;
      }

      await interaction.deferReply({ ephemeral: true });
      const canal = await client.channels.fetch(CANAL_REGISTRO_MANAGER).catch(() => null);
      if (!canal?.isTextBased?.()) {
        await interaction.editReply("❌ Canal inválido.");
        return true;
      }

      const deleted = await purgeRejectedAny(canal);
      await interaction.editReply(`✅ Limpeza concluída. **${deleted}** registros reprovados foram apagados.`);
    } catch (err) {
      console.error("[SC_RM] Erro no purge:", err);
      const msg = `❌ Erro ao limpar: ${err?.message || err}`;
      if (interaction.deferred) await interaction.editReply(msg).catch(() => {});
      else await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
    }
    return true;
  }

if (
  interaction.customId === "sc_rm_open" ||
  interaction.customId === "sc_rm_open_v2"
) return false;

  const id = interaction.customId;
  const isApprove = id.startsWith("sc_rm_approve_");
  const isReject = id.startsWith("sc_rm_reject_");
  if (!isApprove && !isReject) return false;




  // permissão de aprovar
  const pode = hasAnyRole(interaction.member, CARGOS_PODE_APROVAR);
  if (!pode) {
    if (!interaction.replied && !interaction.deferred) {
      await interaction
        .reply({ content: "❌ Sem permissão para aprovar/reprovar.", ephemeral: true })
        .catch(() => {});
    }
    return true;
  }

  const msgId = id.split("_").pop();
  const canal = await client.channels.fetch(CANAL_REGISTRO_MANAGER).catch(() => null);
  if (!canal?.isTextBased?.()) {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "⚠️ Canal de registros indisponível.", ephemeral: true }).catch(() => {});
    }
    return true;
  }

  const msg = await canal.messages.fetch(msgId).catch(() => null);
  if (!msg || !msg.embeds?.length) {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "❌ Não achei a mensagem do registro.", ephemeral: true }).catch(() => {});
    }
    return true;
  }

  const originalEmb = msg.embeds[0];
const registrantId =
  getRegistrantIdFromMessage(msg, originalEmb) || parseRegistrantFromEmbed(originalEmb);

// =======================
// 🔒 TRAVA DE HIERARQUIA
// quem tem cargo IGUAL ou MAIOR que o registrante NÃO pode aprovar
// =======================
if (isApprove && registrantId) {

  // 🔓 bypass total (owner / você / resp creators)
  const bypass = hasGlobalBypass(interaction.member, interaction.user.id);

  if (!bypass) {
    const registrantMember = await interaction.guild.members
      .fetch(registrantId)
      .catch(() => null);

    if (registrantMember) {
      const blockedByHierarchy = cannotApproveByHierarchy(
  interaction.member,
  registrantMember
);

if (blockedByHierarchy) {
  await interaction.reply({
    content:
      "❌ Você não pode aprovar este registro porque o registrante possui **cargo igual ou superior** ao seu.",
    ephemeral: true,
  });
  return true;
}

    }
  }
}


  // anti self-approve
  if (
  isApprove &&
  registrantId &&
  String(registrantId) === String(interaction.user.id)
) {
  const bypass = hasGlobalBypass(interaction.member, interaction.user.id);

  if (!bypass) {
    const allowed = canSelfApprove(interaction.member, interaction.user.id);
    if (!allowed) {
      await interaction.reply({
        content: "❌ Você **não pode aprovar** o seu próprio registro.",
        ephemeral: true,
      }).catch(() => {});
      return true;
    }
  }
}


  // REJECT (botão) -> abre modal motivo
  if (isReject) {
    const modal = new ModalBuilder()
      .setCustomId(`sc_rm_modal_reject_${msgId}`)
      .setTitle("Reprovar Registro — Motivo");

    const motivo = new TextInputBuilder()
      .setCustomId("rm_rej_reason")
      .setLabel("Escreva o motivo da reprovação")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setPlaceholder("Explique o que precisa ser corrigido...");

    modal.addComponents(new ActionRowBuilder().addComponents(motivo));

    try {
      await interaction.showModal(modal);
    } catch (e) {
      console.error("[SC_RM] Erro showModal reprovação:", e);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: "⚠️ Interação expirada. Clique de novo.", ephemeral: true }).catch(() => {});
      }
    }
    return true;
  }

  // =======================
  // APPROVE (botão)
  // =======================
  if (!interaction.deferred && !interaction.replied) {


// =======================
// ANTI DUPLICAÇÃO — antes de aprovar
// ✅ Fonte de verdade = FACs (LISTÃO), porque:
// - se removeu do FACs, pode aprovar de novo
// - o RM pode ter aprovado antigo ainda verde, mas se não tá no FACs, não conta
//
// Prioridade:
// 1) ORG ID (forte)
// 2) fallback por NOME
//
// Regra especial:
// - ORG ID "00" (org do legal) NÃO bloqueia nunca
// =======================
let displayForCheck = RM_DISPLAY.get(msg.id);
if (!displayForCheck || !displayForCheck.trim() || displayForCheck === "|") {
  displayForCheck = displayOrgFromEmbed(originalEmb) || "";
}

// 1) tenta pegar ORG ID do embed (forte)
let orgIdForCheck = getOrgIdFromEmbed(originalEmb);
orgIdForCheck = orgIdForCheck ? String(orgIdForCheck).padStart(2, "0") : null;

// 2) pega o nome (fallback)
const orgNameForCheck = _extractOrgNameFromDisplay(displayForCheck);

// ✅ REGRA: ID 00 = pode repetir (org do legal)
const isLegalOrg = orgIdForCheck === "00";

// ✅ helper: checa no FACs (se tiver bridge), senão cai pro scan antigo do RM
async function _isDuplicateByIdConsideringFacs(orgId) {
  const b = globalThis.__FACS_ONEBTN_BRIDGE__;
  if (b?.hasOrgIdInWeek) {
    return await b.hasOrgIdInWeek(orgId);
  }
  // fallback antigo: scan no RM
  return await hasOtherApprovedSameOrgIdThisWeek(canal, orgId, msg.id);
}

async function _isDuplicateByNameConsideringFacs(name) {
  const b = globalThis.__FACS_ONEBTN_BRIDGE__;
  if (b?.hasOrgNameInWeek) {
    return await b.hasOrgNameInWeek(name);
  }
  // fallback antigo: scan no RM
  return await hasOtherApprovedSameOrgThisWeek(canal, name, msg.id);
}

// ✅ se tiver ID (e não for 00), bloqueia por ID
if (orgIdForCheck && !isLegalOrg) {
  const duplicateInWeek = await _isDuplicateByIdConsideringFacs(orgIdForCheck);

  if (duplicateInWeek) {
    const msgTxt =
      `❌ Não vou aprovar porque a ORG **ID ${orgIdForCheck}** já está **contabilizada no FACs** na semana.\n` +
      `👉 Se esse aqui for o duplicado, reprove.\n` +
      `👉 Se você removeu do FACs e quer aprovar de novo, tenta aprovar agora (se não estiver no listão, vai liberar).`;

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: msgTxt, ephemeral: true }).catch(() => {});
    } else {
      await interaction.editReply({ content: msgTxt }).catch(() => {});
    }
    return true;
  }
}

// ✅ se NÃO tiver ID, usa fallback por NOME
if (!orgIdForCheck && orgNameForCheck) {
  const duplicateInWeek = await _isDuplicateByNameConsideringFacs(orgNameForCheck);

  if (duplicateInWeek) {
    const msgTxt =
      `❌ Não vou aprovar porque **${orgNameForCheck}** já está **contabilizada no FACs** na semana.\n` +
      `👉 Se esse aqui for o duplicado, reprove.\n` +
      `👉 Se removeu do FACs e quer aprovar de novo, tenta aprovar agora (se não estiver no listão, vai liberar).`;

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: msgTxt, ephemeral: true }).catch(() => {});
    } else {
      await interaction.editReply({ content: msgTxt }).catch(() => {});
    }
    return true;
  }
}


await interaction.deferReply({ ephemeral: true }).catch(() => {});

  }

  const emb = EmbedBuilder.from(originalEmb);
emb.setColor("Green").addFields({
  name: "✅ Aprovado por",
  value: `<@${interaction.user.id}> • ${new Date().toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  })}`,
});

await msg.edit({ embeds: [emb], components: [] }).catch(() => {});

// ===== DONO DO PONTO = MANAGER RESPONSÁVEL (FIX) =====
// 1) tenta pegar do embed ORIGINAL (mais confiável)
// 2) fallback: tenta do embed que vamos salvar/editar
const managerId =
  getManagerIdFromEmbed(originalEmb) ||
  getManagerIdFromEmbed(emb) ||
  null;

// se não achar manager, fallback pro registrante (pra não “perder” ponto)
const pointsOwnerId = managerId || registrantId;

// ✅ PONTO INDIVIDUAL (RM) vai pro manager responsável
if (pointsOwnerId) rmBumpUser(pointsOwnerId, +1);

// (opcional) debug pra você ver no log quem recebeu ponto
console.log("[SC_RM] ponto +1 =>", { pointsOwnerId, managerId, registrantId, msgId: msg.id });


  // ✅ weekly: moderador + registrante + manager que recebe ponto
  const wk = getWeekKeyNow();
  bumpWeekly(wk, "approvedBy", interaction.user.id, +1);
  if (registrantId) bumpWeekly(wk, "approvedForRegistrant", registrantId, +1);
  if (pointsOwnerId) bumpWeekly(wk, "approvedForManager", pointsOwnerId, +1);

  // FACs: só aprovado
  let display = RM_DISPLAY.get(msg.id);
  if (!display || !display.trim() || display === "|") display = displayOrgFromEmbed(emb);
  await bridgeAppendApproved(display, { byUserId: interaction.user.id, src: "rm_approve", rmMsgId: msg.id });


  // totals + log update
  await updateTotalsMessage(canal);
  await upsertLogForRMMessage(client, msg);

  // scGeralDash hub
  try {
    dashEmit("rm:approved", { __at: Date.now(), by: interaction.user.id, msgId: msg.id });
  } catch {}


   // ✅ ATUALIZA O DASHBOARD DO GRAFICO (instantâneo)
  try {
    await graficoManagersEmitUpdate(client, interaction.user.id, "rm:approved");
  } catch (e) {
    console.error("[GRAFICO_MANAGERS] falha ao atualizar (approved):", e);
  }

  // =======================
// DMs (registrante + manager) — sem duplicar quando for a mesma pessoa
// =======================
const samePerson =
  !!managerId &&
  !!registrantId &&
  String(managerId) === String(registrantId);

// 1) DM pro registrante (sempre que existir)
let dmInfo = { dmOk: false };
if (registrantId) {
  dmInfo = await notifyDecision({
    client,
    registrantId,
    approved: true,
    moderatorId: interaction.user.id,
    msg,
  }).catch(() => ({ dmOk: false }));
}

// 2) DM pro manager (SÓ se for diferente do registrante)
// - Se registrantId não existir, manda pro manager normalmente
let dmMgr = { dmOk: false };
if (managerId && (!registrantId || !samePerson)) {
  dmMgr = await notifyManager({
    client,
    managerId,
    approved: true,
    msg,
    registrantId: registrantId || interaction.user.id,
  }).catch(() => ({ dmOk: false }));
}

// 3) feedback pro moderador (ephemeral)
if (interaction.deferred && !interaction.replied) {
  const parts = [];
  parts.push(dmInfo.dmOk ? "📩 DM registrante." : "⚠️ Sem DM registrante.");

  if (managerId) {
    if (samePerson) parts.push("🧠 Registrante = Manager (enviei só 1 DM).");
    else parts.push(dmMgr.dmOk ? "📩 DM manager." : "⚠️ Sem DM manager.");
  }

  await interaction
    .editReply(`✅ Registro **aprovado**! ${parts.join(" ")}`)
    .catch(() => {});
}


  return true;
}



  


    // =======================
   // =======================
// MODAL REPROVAÇÃO (MOTIVO)
// =======================
if (
  interaction.isModalSubmit() &&
  String(interaction.customId || "").startsWith("sc_rm_modal_reject_")
) {
  const msgId = String(interaction.customId).replace("sc_rm_modal_reject_", "");
  const canal = await client.channels.fetch(CANAL_REGISTRO_MANAGER).catch(() => null);
  if (!canal?.isTextBased?.()) return true;

  const msg = await canal.messages.fetch(msgId).catch(() => null);
  if (!msg || !msg.embeds?.length) {
    return interaction
      .reply({ content: "❌ Não achei a mensagem do registro.", ephemeral: true })
      .catch(() => true);
  }

  const reason =
    (interaction.fields.getTextInputValue("rm_rej_reason") || "").trim() || "—";

  // 🔎 estado ANTES de reprovar
  const embPrev = msg.embeds[0];
  const wasApprovedBefore = embedIsApproved(embPrev);

  const emb = EmbedBuilder.from(embPrev);

  emb.setColor("Red").addFields(
    {
      name: "❌ Reprovado por",
      value: `<@${interaction.user.id}> • ${new Date().toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
      })}`,
    },
    { name: "📝 Motivo da reprovação", value: reason }
  );

  await msg.edit({ embeds: [emb], components: [] }).catch(() => {});

  // =======================
  // FACs — REGRA CORRETA (POR ORG)
  // Só remove se:
  // 1) esse registro JÁ tinha sido aprovado
  // 2) NÃO existe outro aprovado da MESMA ORG na semana (ignorando família)
  // =======================
  let display = displayOrgFromEmbed(emb);
  if (!display || display === "|" || !display.trim())
    display = RM_DISPLAY.get(msg.id) || "";

  const orgNameForCheck = _extractOrgNameFromDisplay(display);
  const orgIdForCheck = getOrgIdFromEmbed(embPrev) || getOrgIdFromEmbed(emb) || null;

  let removedFromFacs = false;

  if (display && display.trim() && display !== "|") {
    if (wasApprovedBefore) {

      // ✅ 1) Se tem ORG ID, só remove se NÃO existir outro aprovado com o MESMO ID
      if (orgIdForCheck) {
        const hasOtherApprovedSameId =
          await hasOtherApprovedSameOrgIdThisWeek(canal, orgIdForCheck, msg.id);

        if (!hasOtherApprovedSameId) {
          try {
            // se teu bridge tiver remove por ID (melhor), usa.
            const ok = await globalThis.__FACS_ONEBTN_BRIDGE__?.removeOrgByIdFromWeek?.(
              orgIdForCheck,
              { byUserId: interaction.user.id, src: "rm_reject", rmMsgId: msg.id }
            );

            // fallback: se não tiver, remove por nome
            if (!ok && orgNameForCheck) {
              const ok2 = await globalThis.__FACS_ONEBTN_BRIDGE__?.removeOrgByNameFromWeek?.(
                orgNameForCheck,
                { byUserId: interaction.user.id, src: "rm_reject", rmMsgId: msg.id }
              );
              if (!ok2) {
                await bridgeRemove(display, { byUserId: interaction.user.id, src: "rm_reject", rmMsgId: msg.id });
              }
            }

            removedFromFacs = true;
          } catch {
            await bridgeRemove(display, { byUserId: interaction.user.id, src: "rm_reject", rmMsgId: msg.id });
            removedFromFacs = true;
          }
        }
      }

      // ✅ 2) Se NÃO tem ID, cai no fallback por NOME
      if (!orgIdForCheck && orgNameForCheck) {
        const hasOtherApprovedSameOrg =
          await hasOtherApprovedSameOrgThisWeek(canal, orgNameForCheck, msg.id);

        if (!hasOtherApprovedSameOrg) {
          try {
            const ok = await globalThis.__FACS_ONEBTN_BRIDGE__?.removeOrgByNameFromWeek?.(
              orgNameForCheck,
              { byUserId: interaction.user.id, src: "rm_reject", rmMsgId: msg.id }
            );

            if (!ok) {
              await bridgeRemove(display, { byUserId: interaction.user.id, src: "rm_reject", rmMsgId: msg.id });
            }

            removedFromFacs = true;
          } catch {
            await bridgeRemove(display, { byUserId: interaction.user.id, src: "rm_reject", rmMsgId: msg.id });
            removedFromFacs = true;
          }
        }
      }
    }
  }



  // totals + log update
  await updateTotalsMessage(canal);
  await upsertLogForRMMessage(client, msg);

  try {
    dashEmit("rm:rejected", { __at: Date.now(), by: interaction.user.id, msgId: msg.id });
  } catch {}

  try {
    await graficoManagersEmitUpdate(client, interaction.user.id, "rm:rejected");
  } catch {}

  const registrantId = parseRegistrantFromEmbed(emb) || getRegistrantIdFromMessage(msg, emb);
  const managerId = getManagerIdFromEmbed(emb) || null;
  const pointsOwnerId = managerId || registrantId;

  const wk = getWeekKeyNow();
  bumpWeekly(wk, "rejectedBy", interaction.user.id, +1);
  if (registrantId) bumpWeekly(wk, "rejectedForRegistrant", registrantId, +1);
  if (pointsOwnerId) bumpWeekly(wk, "rejectedForManager", pointsOwnerId, +1);

  const samePerson =
    !!managerId &&
    !!registrantId &&
    String(managerId) === String(registrantId);

  let dmInfo = { dmOk: false };
  if (registrantId) {
    dmInfo = await notifyDecision({
      client,
      registrantId,
      approved: false,
      moderatorId: interaction.user.id,
      msg,
      reason,
    }).catch(() => ({ dmOk: false }));
  }

  let dmMgr = { dmOk: false };
  if (managerId && (!registrantId || !samePerson)) {
    dmMgr = await notifyManager({
      client,
      managerId,
      approved: false,
      msg,
      reason,
      registrantId: registrantId || interaction.user.id,
    }).catch(() => ({ dmOk: false }));
  }

  const parts = [];
  parts.push(dmInfo.dmOk ? "📩 DM registrante." : "⚠️ Sem DM registrante.");

  if (managerId) {
    if (samePerson) parts.push("🧠 Registrante = Manager.");
    else parts.push(dmMgr.dmOk ? "📩 DM manager." : "⚠️ Sem DM manager.");
  }

  return interaction
    .reply({
      content:
        `❌ Registro **reprovado** — ` +
        (display && display.trim() && display !== "|"
          ? (wasApprovedBefore
              ? (removedFromFacs
                  ? "**removido** das FACs (nenhum outro aprovado na semana)."
                  : "**NÃO removido** das FACs (existe outro aprovado da mesma ORG).")
              : "**NÃO removido** das FACs (registro nunca foi aprovado).")
          : "**não removido** das FACs (display vazio).") +
        ` ${parts.join(" ")}`,
      ephemeral: true,
    })
    .catch(() => true);
}


    return false;
  } catch (e) {
    console.error("[SC_RM] registroManagerHandleInteraction erro:", e);
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: "⚠️ Ocorreu um erro ao processar a ação.", ephemeral: true }).catch(() => {});
      }
    } catch {}
    return true;
  }
}
