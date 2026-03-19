// /application/events/facsSemanais.js
// SC_FACS_SEMANAIS v3 (HOOKS) — 1 LISTÃO (sem Qui/Sex/Sáb)
// ✅ Hook-based (SEM client.on aqui dentro)
// ✅ !menueventos cria/atualiza o menu no canal atual (somente cargos autorizados)
// ✅ 1 botão: "✏️ Registrar ORGs da Semana" (modal com 1 campo: uma por linha)
// ✅ Embed mostra semana vigente (Dom..Sáb) e total
// ✅ Persiste em facs_semanais.json (weekKey = domingo da semana)
// ✅ Limpa domingo 00:00 SP (sem depender do timezone do host)
// ✅ Quarta 15:00 SP envia DM p/ roles mencionadas (com log)
// ✅ Backups + Restaurar
// ✅ Repopular: varre canal do RM e puxa SOMENTE APROVADOS da semana vigente
// ✅ BRIDGE mantido p/ RM: __FACS_ONEBTN_BRIDGE__.appendOrgToWeek(displayOrg) / removeOrgFromWeek(displayOrg)
// -------------------------------------------------------
// Como plugar no index:
//   import { facsSemanaisOnReady, facsSemanaisHandleMessage, facsSemanaisHandleInteraction } from "./events/facsSemanais.js";
//   no ready: await facsSemanaisOnReady(client);   (ANTES do Registro Manager)
//   no messageCreate: if (await facsSemanaisHandleMessage(message, client)) return;
//   no interactionCreate: if (await facsSemanaisHandleInteraction(interaction, client)) return;

import fs from "node:fs";
import path from "node:path";
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";

// ===============================
// CONFIG
// ===============================
// ✅ REGISTRAR + REMOVER ORG (mais cargos)
const PERMS_REGISTER = [
  "660311795327828008",  // Eu
  "1262262852949905408", // Owner
  "1352408327983861844", // Resp Creators
  "1262262852949905409", // Resp Influ
  "1352407252216184833", // Resp Lider
  "1282119104576098314", // MKT CREATORS
];

// ✅ REPPOPULAR (RM aprovados) + LIMPAR SEMANA + RESTAURAR ÚLTIMA (só topo)
const PERMS_MANAGE = [
  "660311795327828008",  // Eu
  "1262262852949905408", // Owner
  "1352408327983861844", // Resp Creators
  "1262262852949905409", // Resp Influ
];


const FACSMENU_ROLES_MENTION = ["1388976155830255697", "1392678638176043029"];

const FACSMENU_LOG_DM_CHANNEL_ID = "1411801178014220348";
// ✅ LOG AUDITORIA (todas mudanças do painel FACs Semanais)
const FACSMENU_AUDIT_LOG_CHANNEL_ID = "1460127042224914637";

const FACSMENU_GIF =
  "https://cdn.discordapp.com/attachments/1362477839944777889/1380979949816643654/standard_2r.gif?ex=68b14b8d&is=68affa0d&hm=4344e83845de790d605bb94ff03f10442a9d1f88f78d4278d5237e0876279502";

const FACSMENU_STORE = "./facs_semanais.json";
const FACSMENU_BACKUPS_STORE = "./facs_semanais.backups.json";

// Canal do RM (pra repopular pelos aprovados)
const CANAL_REGISTRO_MANAGER_ID = "1392680204517769277";

// ===============================
// TIME HELPERS (SP) — confiável
// ===============================
// ===============================
// TIME HELPERS (SP) — timezone-safe (NÃO depende do timezone do host)
// ===============================
const TIME_LOCAL = (() => {
  const TZ = "America/Sao_Paulo";

  // pega "agora em SP" como uma Date em UTC, mas com o relógio de SP embutido
  // (ou seja: usa getUTC* para ler dia/hora/minuto corretos de SP)
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

    // Date UTC montada com os números de SP
    return new Date(Date.UTC(y, m - 1, d, hh, mm, ss));
  }

  // início do dia (00:00) em SP, retornando Date em UTC
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
    const dow = now.getUTCDay(); // ✅ day-of-week de SP (0=Dom)
    const sunday = startOfDaySP(addDays(now, -dow));
    const saturday = startOfDaySP(addDays(sunday, 6));
    const weekKey = sunday.toISOString().slice(0, 10);
    return { sunday, saturday, weekKey };
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

// ===============================
// STATE
// ===============================
function blankState(weekKey) {
  return {
    channelId: null,
    messageId: null,
    weekKey: weekKey ?? getCurrentWeekSP().weekKey,
    lista: "", // 1 LISTÃO

    // ✅ PERSISTENTE (não perde no restart)
    lastCleanupKey: null,
    lastDMKey: null,
  };
}


function loadStore() {
  const wk = getCurrentWeekSP().weekKey;
  const d = readJSON(FACSMENU_STORE, blankState(wk));

  return {
    channelId: d.channelId ?? null,
    messageId: d.messageId ?? null,
    weekKey: d.weekKey ?? wk,
    lista: d.lista ?? "",

    // ✅ PERSISTENTE (não perde no restart)
    lastCleanupKey: d.lastCleanupKey ?? null,
    lastDMKey: d.lastDMKey ?? null,
  };
}


function saveStore(s) {
  writeJSON(FACSMENU_STORE, s);
}

let facsState = loadStore();



// ===== Backups persistentes (para RESTAURAR) =====
function loadBackups() {
  return readJSON(FACSMENU_BACKUPS_STORE, []);
}
function saveBackups(b) {
  writeJSON(FACSMENU_BACKUPS_STORE, b);
}
let facsBackups = loadBackups();

function pushBackup(reason = "edit") {
  try {
    const snap = {
      ts: Date.now(),
      reason,
      weekKey: facsState.weekKey,
      lista: facsState.lista,
    };
    const last = facsBackups[facsBackups.length - 1];
    const same = last && last.weekKey === snap.weekKey && last.lista === snap.lista;
    if (!same) {
      facsBackups.push(snap);
      if (facsBackups.length > 20) facsBackups.shift();
      saveBackups(facsBackups);
    }
  } catch {}
}

async function restoreLastBackup(client) {
  try {
    const snap = facsBackups.pop();
    if (!snap) return false;

    facsState.weekKey = snap.weekKey;
    facsState.lista = snap.lista;

    saveStore(facsState);
    saveBackups(facsBackups);

    await _refreshMenu(client);
    return true;
  } catch {
    return false;
  }
}

// ===============================
// NORMALIZA + LIST OPS
// ===============================
function extractOrgName(str) {
  const raw = String(str || "").trim();
  if (!raw) return "";

  // se vier "Família | ORG", pega só a ORG
  const parts = raw.split("|").map(p => p.trim()).filter(Boolean);
  if (parts.length >= 2) return parts[parts.length - 1];

  return raw;
}

function norm(str) {
  return extractOrgName(str)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}


function _lines(txt) {
  return String(txt || "")
    .split("\n")
    .flatMap((line) => {
      const clean = line.trim();
      if (!clean) return [];

      /*
        ✅ Regex CORRETA:
        - Captura CADA "ID | ORG"
        - Funciona mesmo com espaços gigantes no meio
        - Não quebra casos normais
        - Não interfere no RM / Bridge / Sync
      */
      const matches = clean.match(/\b\d{2}\s*\|\s*.*?(?=\s+\d{2}\s*\||$)/g);



      if (matches && matches.length > 1) {
        return matches.map((m) => m.trim());
      }

      return [clean];
    })
    .filter(Boolean);
}



function _countLines(txt) {
  return _lines(txt).length;
}

function _addLine(current, line) {
  const ls = _lines(current);
  const tgt = norm(line); // ✅ função EXISTENTE
  if (!ls.some((x) => norm(x) === tgt)) ls.push(line.trim());
  return ls.join("\n");
}


function _removeLine(current, line) {
  const tgt = norm(line);
  const ls = _lines(current);
  const kept = ls.filter((x) => norm(x) !== tgt);
  return kept.join("\n");
}




// ===============================
// ORG NAME HELPERS (pra remover por ORG)
// ===============================
function _extractOrgNameFromLine(line) {
  // espera algo tipo: "59 | Tropa da Big"
  // mas também aguenta "Tropa da Big" sem "|"
  const raw = String(line || "").trim();
  if (!raw) return "";

  const parts = raw.split("|").map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    // "familia | org" -> org é o último pedaço
    return parts.slice(1).join(" | ").trim();
  }
  return raw;
}

function _removeByOrgName(current, orgName) {
  const targetOrg = norm(orgName);
  if (!targetOrg) return current;

  const ls = _lines(current);

  const kept = ls.filter((line) => {
    const onlyOrgName = _extractOrgNameFromLine(line);
    const orgNorm = norm(onlyOrgName);
    return orgNorm !== targetOrg;
  });

  return kept.join("\n");
}

function _countByOrgName(current, orgName) {
  const targetOrg = norm(orgName);
  if (!targetOrg) return 0;

  const ls = _lines(current);
  let c = 0;

  for (const line of ls) {
    const onlyOrgName = _extractOrgNameFromLine(line);
    const orgNorm = norm(onlyOrgName);
    if (orgNorm === targetOrg) c++;
  }

  return c;
}


// ===============================
// ORG ID HELPERS (pra remover/checar por ID forte)
// Lista é: "ID | ORG"
// Ex: "59 | RedLine"
// ===============================
function _extractOrgIdFromLine(line) {
  const raw = String(line || "").trim();
  if (!raw) return null;

  const first = raw.split("|")[0]?.trim() || "";
  if (!first) return null;

  // ✅ PADRÃO: ID SEMPRE 2 dígitos (00–99)
  if (/^\d{2}$/.test(first)) return first;

  return null;
}


function _removeByOrgId(current, orgId) {
  const id = String(orgId || "").trim();
  if (!/^\d{2}$/.test(id)) return current; // ✅ só 2 dígitos

  const target = id;
  const ls = _lines(current);

  const kept = ls.filter((line) => {
    const lid = _extractOrgIdFromLine(line);
    return String(lid || "") !== String(target);
  });

  return kept.join("\n");
}


function _countByOrgId(current, orgId) {
  const id = String(orgId || "").trim();
  if (!/^\d{2}$/.test(id)) return 0; // ✅ só 2 dígitos

  const target = id;
  const ls = _lines(current);

  let c = 0;
  for (const line of ls) {
    const lid = _extractOrgIdFromLine(line);
    if (String(lid || "") === String(target)) c++;
  }
  return c;
}


function _hasOrgId(current, orgId) {
  return _countByOrgId(current, orgId) > 0;
}

function _hasOrgName(current, orgName) {
  return _countByOrgName(current, orgName) > 0;
}



// ===============================
// RM EMBED HELPERS (repop)
// ===============================
function _getEmbedFieldsAny(emb) {
  return emb?.fields || emb?.data?.fields || [];
}

function getFieldValueByPrefix(emb, startsWith) {
  const f = _getEmbedFieldsAny(emb).find((x) =>
    (x?.name || "").trim().toLowerCase().startsWith(startsWith.toLowerCase())
  );
  return (f?.value ?? "").trim();
}

function isRMEmbed(emb) {
  const title = String(emb?.title || emb?.data?.title || "").toLowerCase();
  return title.includes("registro de evento - manager");
}

function isApprovedRMEmbed(emb) {
  return _getEmbedFieldsAny(emb).some((x) =>
    (x?.name || "").trim().toLowerCase().startsWith("✅ aprovado por")
  );
}

function displayOrgFromRMEmbed(emb) {
  const org = getFieldValueByPrefix(emb, "🏷️ org");
  const fam = getFieldValueByPrefix(emb, "👨‍👩‍👧‍👦 família ativa");
  return `${(fam || "").trim()} | ${(org || "").trim()}`.trim();
}

// ===============================
// EMBED/MENU
// ===============================
function mentionRoles() {
  return FACSMENU_ROLES_MENTION.map((id) => `<@&${id}>`).join(" ");
}

function splitIntoFieldsBigList(label, text) {
  const max = 950;
  const lines = _lines(text);
  const count = lines.length;

  if (!count) {
    return [
      {
        name: `📌 **${label} — 0**`,
        value: "_(vazio)_",
        inline: false,
      },
    ];
  }

  const out = [];
  let buf = "";
  let part = 1;

  const mkTitle = (p) => (p === 1 ? `📌 **${label} — ${count}**` : `📌 **${label} — ${count}** (cont. ${p})`);

  const push = () => {
    out.push({
      name: mkTitle(part),
      value: "```\n" + buf.trim() + "\n```",
      inline: false,
    });
    buf = "";
    part++;
  };

  for (const line of lines) {
    if ((buf + line + "\n").length > max) push();
    buf += line + "\n";
  }
  if (buf.trim()) push();

  return out;
}

function buildEmbed() {
  const { sunday, saturday, weekKey } = getCurrentWeekSP();
  const weekLabel = weekRangeLabelBR({ sunday, saturday });

  const tot = _countLines(facsState.lista);

  const header =
    `**${weekLabel}**\n` +
    `> Contabiliza **somente a semana vigente** (Dom 00:00 → Sáb 23:59).\n` +
    `📊 **Total de ORGs aprovadas na semana:** **${tot}**\n\n` +
    `**Managers:** ${mentionRoles()}`;

  const fields = splitIntoFieldsBigList("ORGS APROVADAS DA SEMANA", facsState.lista);

  return new EmbedBuilder()
    .setColor("Purple")
    .setTitle("🗓️ FACs — ORGs da Semana (Aprovadas)")
    .setDescription(header)
    .addFields(fields)
    .setImage(FACSMENU_GIF)
    .setFooter({ text: `SantaCreators • weekKey=${weekKey}` });
}

function buildButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("facs_semana_register")
        .setLabel("✏️ Registrar ORGs da Semana")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("facs_semana_remove_org")
        .setLabel("🗑️ Remover ORG")
        .setStyle(ButtonStyle.Danger),

      new ButtonBuilder()
        .setCustomId("facs_semana_clear")
        .setLabel("🧹 Limpar Semana (manual)")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("facs_semana_restore")
        .setLabel("↩️ Restaurar (última)")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("facs_semana_sync_rm")
        .setLabel("🔄 Repopular (aprovados RM)")
        .setStyle(ButtonStyle.Secondary)
    ),
  ];
}


function makeModal() {
  return new ModalBuilder()
    .setCustomId("facs_semana_modal")
    .setTitle("Registrar ORGs da Semana")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("facs_semana_text")
          .setLabel("ORGS aprovadas (uma por linha)")
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder("Ex:\nFamília Silva | Vanilla\nFamília Araujo | Virtude")
          .setRequired(false)
      )
    );
}


function makeRemoveOrgModal() {
  return new ModalBuilder()
    .setCustomId("facs_semana_remove_org_modal")
    .setTitle("Remover ORG da Semana")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("facs_remove_org_name")
          .setLabel("Nome da ORG (remove todas as ocorrências)")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("Ex: Tropa da Big")
          .setRequired(true)
      )
    );
}

function checkPerms(member, allowedList) {
  try {
    if (!member) return false;
    if (allowedList.includes(member.id)) return true;
    return member.roles?.cache?.some((r) => allowedList.includes(r.id)) || false;
  } catch {
    return false;
  }
}

async function sendOrUpdateMenu(channel) {
  const embed = buildEmbed();
  const components = buildButtons();

  if (facsState.messageId) {
    const prev = await channel.messages.fetch(facsState.messageId).catch(() => null);
    if (prev) {
      await prev.edit({ content: mentionRoles(), embeds: [embed], components }).catch(() => {});
      return prev;
    }
  }

  const msg = await channel.send({ content: mentionRoles(), embeds: [embed], components }).catch(() => null);
  if (!msg) return null;

  const wk = getCurrentWeekSP().weekKey;
  facsState.channelId = channel.id;
  facsState.messageId = msg.id;
  facsState.weekKey = wk;
  saveStore(facsState);

  return msg;
}

async function _refreshMenu(client) {
  try {
    if (!facsState.channelId) return;
    const ch = await client.channels.fetch(facsState.channelId).catch(() => null);
    if (!ch?.isTextBased?.()) return;

    const msg = facsState.messageId ? await ch.messages.fetch(facsState.messageId).catch(() => null) : null;
    if (msg) {
      await msg.edit({ content: mentionRoles(), embeds: [buildEmbed()], components: buildButtons() }).catch(() => {});
    } else {
      await sendOrUpdateMenu(ch);
    }
  } catch (e) {
    console.error("[FACS_SEMANAIS] refresh err:", e);
  }
}

// ===============================
// REPUBLISH / SYNC FROM RM (APROVADOS DA SEMANA)
// ===============================
async function syncFromRegistroManager(client) {
  const canal = await client.channels.fetch(CANAL_REGISTRO_MANAGER_ID).catch(() => null);
  if (!canal?.isTextBased?.()) return { added: 0, skipped: 0, scanned: 0 };

  const { sunday, saturday, weekKey } = getCurrentWeekSP();
  const start = startOfDaySP(sunday).getTime();
  const end = startOfDaySP(addDays(saturday, 1)).getTime();

  // ✅ REFATORA DO ZERO (somente aprovados dessa semana)
  pushBackup("sync_from_rm_refaz_semana");
  facsState.weekKey = weekKey;
  facsState.lista = "";
  saveStore(facsState);

  let lastId;
  let scanned = 0,
    added = 0,
    skipped = 0;

  for (let page = 0; page < 5; page++) {
    const batch = await canal.messages.fetch({ limit: 100, before: lastId }).catch(() => null);
    if (!batch?.size) break;

    for (const m of batch.values()) {
      const ts = +m.createdTimestamp;
      if (!(ts >= start && ts < end)) continue;

      const emb = m.embeds?.[0];
      if (!emb) continue;
      if (!isRMEmbed(emb)) continue;

      scanned++;
      if (!isApprovedRMEmbed(emb)) continue;

      const display = displayOrgFromRMEmbed(emb);
      if (!display || display === "|" || !display.trim()) continue;

      const before = facsState.lista;
      facsState.lista = _addLine(facsState.lista, display);

      if (before !== facsState.lista) added++;
      else skipped++;
    }

    lastId = batch.last()?.id;
    if (!lastId) break;
  }

  saveStore(facsState);
  await _refreshMenu(client);

  return { added, skipped, scanned };
}


// ===============================
// ROTINAS (DOM 00:00 / QUA 15:00) — SP
// ===============================
async function limparDomingoIfNeeded(client) {
  const now = nowInSP();
  const { weekKey } = getCurrentWeekSP();

  // ✅ Se já limpou essa semana (persistente), não faz nada
  if (String(facsState.lastCleanupKey || "") === String(weekKey)) return;

  // ✅ OFFLINE-SAFE:
  // Se a "weekKey" atual (domingo da semana) é diferente da weekKey que está salva,
  // significa que entrou semana nova e a lista deve iniciar vazia.
  //
  // Isso resolve: bot offline na virada -> quando voltar, limpa 1x.
  const weekChanged = String(facsState.weekKey || "") !== String(weekKey);

  if (!weekChanged) return;

  try {
    pushBackup("auto_clear_week_changed_offline_safe");

    // inicia semana nova
    facsState.weekKey = weekKey;
    facsState.lista = "";

    // ✅ marca e salva (persistente) para não repetir em restart
    facsState.lastCleanupKey = weekKey;
    saveStore(facsState);

    await _refreshMenu(client);

    console.log("[FACS_SEMANAIS] Semana limpa (offline-safe por weekChanged):", weekKey);
  } catch (e) {
    console.error("[FACS_SEMANAIS] limparDomingo err (offline-safe):", e);
  }
}



async function dmQuartaManagersIfNeeded(client) {
  const now = nowInSP();
  const { weekKey, sunday, saturday } = getCurrentWeekSP();

 // quarta 15:00 (SP embutido -> ler com getUTC*)
if (!(now.getUTCDay() === 3 && now.getUTCHours() === 15 && now.getUTCMinutes() === 0)) return;


    const dmKey = `${weekKey}-wed15`;

  // ✅ persistente: não repete no restart
  if (String(facsState.lastDMKey || "") === String(dmKey)) return;

  try {
    const channel = facsState.channelId ? await client.channels.fetch(facsState.channelId).catch(() => null) : null;
    const guild = channel?.guild ?? client.guilds.cache.first();
    if (!guild) return;

    await guild.members.fetch().catch(() => null);

    const targs = new Map();
    for (const roleId of FACSMENU_ROLES_MENTION) {
      const role = await guild.roles.fetch(roleId).catch(() => null);
      if (!role) continue;
      for (const [, m] of role.members) targs.set(m.id, m);
    }

    const weekLabel = weekRangeLabelBR({ sunday, saturday });
    const texto =
      `👋 Oi! Lembrete das **FACs da semana**.\n\n` +
      `**${weekLabel}**\n` +
      `Atualizem no menu com o botão **"Registrar ORGs da Semana"** 🙌`;

    for (const [, m] of targs) {
      let ok = true;
      try {
        await m.send({ content: texto });
      } catch {
        ok = false;
      }
      await logDM(client, m.id, texto, [], { dmOk: ok });
      await new Promise((r) => setTimeout(r, 300));
    }

    // ✅ marca e salva no JSON (persistente)
    facsState.lastDMKey = dmKey;
    saveStore(facsState);

    console.log(`[FACS_SEMANAIS] DMs enviadas para ${targs.size} managers.`);
  } catch (e) {
    console.error("[FACS_SEMANAIS] dmQuarta err:", e);
  }

}

async function logDM(client, userId, content, embeds, { dmOk = true } = {}) {
  try { 
    const canalLog = await client.channels.fetch(FACSMENU_LOG_DM_CHANNEL_ID).catch(() => null);
    if (!canalLog?.isTextBased?.()) return;

    const ts = Math.floor(Date.now() / 1000);
    await canalLog
      .send({
        content: dmOk
          ? `🧾 **DM enviada** — para <@${userId}> • <t:${ts}:f>`
          : `🧾 **Tentativa de DM (falhou)** — para <@${userId}> • <t:${ts}:f>`,
      })
      .catch(() => {});
    await canalLog.send({ content, embeds }).catch(() => {});
  } catch {}
}
function _clip(txt, max = 900) {
  const s = String(txt || "");
  if (s.length <= max) return s;
  return s.slice(0, max) + "\n…(cortado)";
}

function _fmtCodeBlock(txt) {
  const t = String(txt || "").trim();
  if (!t) return "_(vazio)_";
  return "```txt\n" + _clip(t, 900) + "\n```";
}

async function logAudit(
  client,
  title,
  lines = [],
  {
    byUserId = null,
    interaction = null,   // ✅ passa o interaction quando tiver
    beforeState = null,   // ✅ texto/lista antes
    afterState = null,    // ✅ texto/lista depois
    extra = null,         // ✅ qualquer extra em string/obj
  } = {}
) {
  try { 
    const ch = await client.channels.fetch(FACSMENU_AUDIT_LOG_CHANNEL_ID).catch(() => null);
    if (!ch?.isTextBased?.()) return;

    const nowTs = Math.floor(Date.now() / 1000);

    // ===== quem foi =====
    const user = interaction?.user || (byUserId ? await client.users.fetch(byUserId).catch(() => null) : null);
    const whoMention = byUserId ? `<@${byUserId}>` : "`(sistema/bridge)`";
    const whoId = byUserId ? `\`${byUserId}\`` : "`—`";
    const avatar = user?.displayAvatarURL?.({ size: 128 }) || null;

    // ===== infos do botão / interação =====
    const msgUrl = interaction?.message?.url || null;
    const msgId = interaction?.message?.id || null;
    const chId = interaction?.channelId || interaction?.channel?.id || null;

    const customId = interaction?.customId || null;
    const buttonLabel = interaction?.component?.label || null; // funciona em ButtonInteraction
    const interId = interaction?.id || null;

    // ===== “como estava / como ficou” =====
    const beforeTxt = beforeState != null ? _fmtCodeBlock(beforeState) : null;
    const afterTxt = afterState != null ? _fmtCodeBlock(afterState) : null;

    // ===== header bem completo =====
    const headerLines = [
      `🧾 **FACS SEMANAIS — AUDIT**`,
      `**Ação:** ${title}`,
      `**Quando:** <t:${nowTs}:f> • <t:${nowTs}:R>`,
      `**Quem:** ${whoMention} • ${whoId}`,
    ];

    if (interId) headerLines.push(`**Interaction ID:** \`${interId}\``);
    if (customId) headerLines.push(`**Botão customId:** \`${customId}\``);
    if (buttonLabel) headerLines.push(`**Botão label:** ${buttonLabel}`);
    if (chId) headerLines.push(`**Canal:** <#${chId}>${msgId ? ` • Msg: \`${msgId}\`` : ""}`);
    if (msgUrl) headerLines.push(`**Link da mensagem do botão:** ${msgUrl}`);

    const content =
      headerLines.join("\n") +
      (lines?.length ? `\n\n${lines.map((x) => `• ${x}`).join("\n")}` : "");

    // manda a parte “texto” (rápida de ler)
    await ch.send({ content }).catch(() => {});

    // manda embed com avatar + antes/depois (bem auditável)
    const emb = new EmbedBuilder()
      .setColor("Purple")
      .setTitle("📌 Detalhes do Audit")
      .setTimestamp(new Date());

    if (user?.username) {
      emb.setAuthor({ name: `${user.username}`, iconURL: avatar || undefined });
    }

    const fields = [];

    if (beforeTxt) fields.push({ name: "📥 Como estava (ANTES)", value: beforeTxt, inline: false });
    if (afterTxt) fields.push({ name: "📤 Como ficou (DEPOIS)", value: afterTxt, inline: false });

    if (extra != null) {
      const extraStr = typeof extra === "string" ? extra : JSON.stringify(extra, null, 2);
      fields.push({ name: "🧩 Extra", value: "```json\n" + _clip(extraStr, 900) + "\n```", inline: false });
    }

    if (fields.length) emb.addFields(fields);

    await ch.send({ embeds: [emb] }).catch(() => {});
  } catch {}
}


// ===============================
// BRIDGE (compat com RM)
// ===============================
function installBridge(client) {
  // mantém o mesmo nome pra não quebrar o RM
  globalThis.__FACS_ONEBTN_BRIDGE__ = {
    appendOrgToWeek: async (displayOrg, options = {}) => {
  try {
    if (!displayOrg || !String(displayOrg).trim() || displayOrg === "|") return false;

    const { weekKey } = getCurrentWeekSP();
    const now = nowInSP();

    // ✅ CORREÇÃO CRÍTICA:
    // Se o weekKey mudou, SEMPRE alinhar
    // MAS NUNCA DESCARTAR LISTA fora do domingo 00:00
    if (facsState.weekKey !== weekKey) {
      const isSundayMidnight =
        now.getUTCDay() === 0 &&
        now.getUTCHours() === 0 &&
        now.getUTCMinutes() === 0;

      if (isSundayMidnight) {
        // ✅ domingo 00:00 → semana nova REAL
        pushBackup("auto_clear_sunday");
        facsState.lista = "";
      }

      // ✅ SEMPRE atualiza a weekKey
      facsState.weekKey = weekKey;
      saveStore(facsState);
    }

    const before = facsState.lista;
    facsState.lista = _addLine(facsState.lista, displayOrg);

    // evita refresh inútil
    if (before !== facsState.lista) {
  saveStore(facsState);
  await _refreshMenu(client);

  await logAudit(
    client,
    "ADD ORG (bridge)",
    [
      `ORG: ${displayOrg}`,
      `Total antes: ${_countLines(before)}`,
      `Total depois: ${_countLines(facsState.lista)}`,
    ],
    {
      byUserId: options?.byUserId || null,
      interaction: null, // bridge nem sempre tem interaction
      beforeState: before,
      afterState: facsState.lista,
      extra: { via: "bridge", options },
    }
  );

  await globalThis.__FACS_COMPARATIVO_FORCE_UPDATE__?.().catch(() => {});
}


    return true;
  } catch (e) {
    console.error("[FACS_SEMANAIS][bridge] append err:", e);
    return false;
  }
},



    removeOrgFromWeek: async (displayOrg, options = {}) => {
  try {
    if (!displayOrg || !String(displayOrg).trim() || displayOrg === "|") return false;

    const beforeCount = _countLines(facsState.lista);

    pushBackup("remove");
    facsState.lista = _removeLine(facsState.lista, displayOrg);
    saveStore(facsState);

    const afterCount = _countLines(facsState.lista);

    await _refreshMenu(client);

    await logAudit(
      client,
      "REMOVE ORG (bridge)",
      [
        `ORG: ${displayOrg}`,
        `Total antes: ${beforeCount}`,
        `Total depois: ${afterCount}`,
      ],
      { byUserId: options?.byUserId || null }
    );

    return true;
  } catch (e) {
    console.error("[FACS_SEMANAIS][bridge] remove err:", e);
    return false;
  }
},

    removeOrgByNameFromWeek: async (orgName, options = {}) => {
  try {
    const name = String(orgName || "").trim();
    if (!name) return false;

    const beforeCount = _countLines(facsState.lista);
    const removedCount = _countByOrgName(facsState.lista, name);
    if (removedCount <= 0) return false;

    pushBackup("remove_by_org_bridge");
    facsState.lista = _removeByOrgName(facsState.lista, name);
    saveStore(facsState);

    const afterCount = _countLines(facsState.lista);

    await _refreshMenu(client);

    await logAudit(
      client,
      "REMOVE ORG (por nome) via BRIDGE",
      [
        `ORG: ${name}`,
        `Removidos: ${removedCount}`,
        `Total antes: ${beforeCount}`,
        `Total depois: ${afterCount}`,
      ],
      { byUserId: options?.byUserId || null }
    );

    return true;
  } catch (e) {
    console.error("[FACS_SEMANAIS][bridge] removeByName err:", e);
    return false;
  }
},

// ✅ NOVO: remove por ORG ID (forte) — remove todas ocorrências do ID
removeOrgByIdFromWeek: async (orgId, options = {}) => {
  try {
    const id = String(orgId || "").trim();
if (!/^\d{2}$/.test(id)) return false; // ✅ só 2 dígitos

const beforeCount = _countLines(facsState.lista);
const removedCount = _countByOrgId(facsState.lista, id);
if (removedCount <= 0) return false;


    pushBackup("remove_by_id_bridge");
    facsState.lista = _removeByOrgId(facsState.lista, id);
    saveStore(facsState);

    const afterCount = _countLines(facsState.lista);

    await _refreshMenu(client);

    await logAudit(
      client,
      "REMOVE ORG (por ID) via BRIDGE",
      [
        `ID: ${id}`,
        `Removidos: ${removedCount}`,
        `Total antes: ${beforeCount}`,
        `Total depois: ${afterCount}`,
      ],
      { byUserId: options?.byUserId || null }
    );

    return true;
  } catch (e) {
    console.error("[FACS_SEMANAIS][bridge] removeById err:", e);
    return false;
  }
},

// ✅ NOVO: checar se ORG ID já existe no LISTÃO da semana
hasOrgIdInWeek: async (orgId) => {
  try {
    const id = String(orgId || "").trim();
if (!/^\d{2}$/.test(id)) return false;
return _hasOrgId(facsState.lista, id);

  } catch {
    return false;
  }
},

// ✅ NOVO: checar se ORG (por nome) já existe no LISTÃO (fallback)
hasOrgNameInWeek: async (orgName) => {
  try {
    const name = String(orgName || "").trim();
    if (!name) return false;
    return _hasOrgName(facsState.lista, name);
  } catch {
    return false;
  }
},




    getTotalsForWeek: async () => {
  try {
    const { weekKey } = getCurrentWeekSP();
    const sameWeek = facsState.weekKey === weekKey;

    // ✅ total real é o tamanho do LISTÃO
    const total = _countLines(facsState.lista);

    // ✅ Como agora o FACs é 1 LISTÃO (sem Qui/Sex/Sáb),
    // devolvemos qui/sex/sab = 0 pra não triplicar no RM.
    return { qui: 0, sex: 0, sab: 0, total, sameWeek };
  } catch (e) {
    console.error("[FACS_SEMANAIS][bridge] totals err:", e);
    return { qui: 0, sex: 0, sab: 0, total: 0, sameWeek: false };
  }
},


    setHeaderTotals: async (_totals) => {
      // noop (mantido só pra compat)
      return true;
    },
  };
}

// ===============================
// EXPORTS (HOOKS)
// ===============================
export async function facsSemanaisOnReady(client) {
  // ✅ NÃO limpa lista no restart.
  // Só alinha weekKey SEM apagar, e deixa a limpeza pro domingo 00:00 (limparDomingoIfNeeded)
  const { weekKey } = getCurrentWeekSP();

  if (facsState.weekKey !== weekKey) {
    // só atualiza weekKey, mas NÃO apaga lista
    facsState.weekKey = weekKey;
    saveStore(facsState);
  }

  installBridge(client);

  // tick leve (pega domingo 00:00 e quarta 15:00 mesmo se o host for zoado)
  setInterval(async () => {
    try {
      await limparDomingoIfNeeded(client);
      await dmQuartaManagersIfNeeded(client);
    } catch {}
  }, 30_000);

  // console.log("[FACS_SEMANAIS] bridge + rotinas ligadas ✅");
}

export async function facsSemanaisHandleMessage(message, client) {
  try {
    if (!message?.guild || message.author?.bot) return false;

    const content = String(message.content || "").trim().toLowerCase();
    if (!content.startsWith("!menueventos")) return false;

    if (!checkPerms(message.member, PERMS_REGISTER)) return true;
    if (!checkPerms(message.member, PERMS_REGISTER)) {
      setTimeout(() => message.delete().catch(() => {}), 1000);
      const msg = await message.reply("❌ Você não tem permissão para usar este comando.");
      setTimeout(() => msg.delete().catch(() => {}), 5000);
      return true;
    }

    await message.delete().catch(() => {});
    const menuMsg = await sendOrUpdateMenu(message.channel);

    if (menuMsg) {
      message.channel
        .send({ content: `✅ Menu das FACs (semana) ativo: [ir à mensagem](${menuMsg.url})` })
        .then((m) => setTimeout(() => m.delete().catch(() => {}), 15000));
    }
    return true;
  } catch (e) {
    console.error("[FACS_SEMANAIS] handleMessage err:", e);
    return false;
  }
}

export async function facsSemanaisHandleInteraction(interaction, client) {
  try {
    if (interaction.isButton()) {
      const id = interaction.customId;

      if (id === "facs_semana_register") {
        if (!checkPerms(interaction.member, PERMS_REGISTER)) {
          await logAudit(client, "CLICK — REGISTER (sem permissão)", [], {
            byUserId: interaction.user.id,
            interaction,
          });
          return interaction.reply({ content: "❌ Sem permissão.", ephemeral: true });
        }

        await logAudit(client, "CLICK — REGISTER (abrir modal)", [], {
          byUserId: interaction.user.id,
          interaction,
        });

        try {
          await interaction.showModal(makeModal());
        } catch (e) {
          console.error("[FACS_SEMANAIS] showModal err:", e);
          if (!interaction.replied && !interaction.deferred) {
            await interaction
              .reply({ content: "⚠️ Interação expirada. Clique de novo.", ephemeral: true })
              .catch(() => {});
          }
        }
        return true;
      }

      if (id === "facs_semana_remove_org") {
        if (!checkPerms(interaction.member, PERMS_REGISTER)) {
          await logAudit(client, "CLICK — REMOVE ORG (sem permissão)", [], {
            byUserId: interaction.user.id,
            interaction,
          });
          return interaction.reply({ content: "❌ Sem permissão.", ephemeral: true });
        }

        await logAudit(client, "CLICK — REMOVE ORG (abrir modal)", [], {
          byUserId: interaction.user.id,
          interaction,
        });

        try {
          await interaction.showModal(makeRemoveOrgModal());
        } catch (e) {
          console.error("[FACS_SEMANAIS] showModal remove org err:", e);
          if (!interaction.replied && !interaction.deferred) {
            await interaction
              .reply({ content: "⚠️ Interação expirada. Clique de novo.", ephemeral: true })
              .catch(() => {});
          }
        }
        return true;
      }

      if (id === "facs_semana_clear") {
        if (!checkPerms(interaction.member, PERMS_MANAGE)) {
          await logAudit(client, "CLICK — CLEAR (sem permissão)", [], {
            byUserId: interaction.user.id,
            interaction,
          });
          return interaction.reply({ content: "❌ Sem permissão.", ephemeral: true });
        }

        const before = facsState.lista;

        pushBackup("clear_manual");
        const { weekKey } = getCurrentWeekSP();
        facsState.weekKey = weekKey;
        facsState.lista = "";
        saveStore(facsState);

        await _refreshMenu(client);

        await logAudit(
          client,
          "CLEAR MANUAL (botão)",
          [`weekKey=${facsState.weekKey}`, "lista zerada manualmente"],
          {
            byUserId: interaction.user.id,
            interaction,
            beforeState: before,
            afterState: facsState.lista,
            extra: {
              totalAntes: _countLines(before),
              totalDepois: _countLines(facsState.lista),
            },
          }
        );

        return interaction.reply({ content: "🧹 Semana limpa com sucesso.", ephemeral: true });
      }

      if (id === "facs_semana_restore") {
        if (!checkPerms(interaction.member, PERMS_MANAGE)) {
          await logAudit(client, "CLICK — RESTORE (sem permissão)", [], {
            byUserId: interaction.user.id,
            interaction,
          });
          return interaction.reply({ content: "❌ Sem permissão.", ephemeral: true });
        }

        const before = facsState.lista;

        const ok = await restoreLastBackup(client);

        await logAudit(
          client,
          ok ? "RESTORE BACKUP (botão) — OK" : "RESTORE BACKUP (botão) — SEM BACKUP",
          [],
          {
            byUserId: interaction.user.id,
            interaction,
            beforeState: before,
            afterState: facsState.lista,
            extra: {
              totalAntes: _countLines(before),
              totalDepois: _countLines(facsState.lista),
            },
          }
        );

        return interaction.reply({
          content: ok ? "↩️ Restaurado com sucesso." : "⚠️ Não há backup para restaurar.",
          ephemeral: true,
        });
      }

      if (id === "facs_semana_sync_rm") {
        if (!checkPerms(interaction.member, PERMS_MANAGE)) {
          await logAudit(client, "CLICK — SYNC RM (sem permissão)", [], {
            byUserId: interaction.user.id,
            interaction,
          });
          return interaction.reply({ content: "❌ Sem permissão.", ephemeral: true });
        }

        const before = facsState.lista;

        pushBackup("sync_from_rm");
        const { added, skipped, scanned } = await syncFromRegistroManager(client);

        await logAudit(
          client,
          "SYNC FROM RM (botão)",
          [`scanned=${scanned}`, `added=${added}`, `skipped=${skipped}`],
          {
            byUserId: interaction.user.id,
            interaction,
            beforeState: before,
            afterState: facsState.lista,
            extra: {
              totalAntes: _countLines(before),
              totalDepois: _countLines(facsState.lista),
            },
          }
        );

        return interaction.reply({
          content: `🔄 Varri **${scanned}** registros (semana vigente). **${added}** adicionadas, **${skipped}** já estavam.`,
          ephemeral: true,
        });
      }

      return false;
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId === "facs_semana_modal") {
        if (!checkPerms(interaction.member, PERMS_REGISTER)) {
          return interaction.reply({ content: "❌ Sem permissão.", ephemeral: true });
        }

        const before = facsState.lista;

        pushBackup("modal_edit");

        const { weekKey } = getCurrentWeekSP();
        if (String(facsState.weekKey || "") !== String(weekKey)) {
          facsState.weekKey = weekKey;
        }

        const txt = interaction.fields.getTextInputValue("facs_semana_text")?.trim() ?? "";
        facsState.lista = txt;

        saveStore(facsState);
        await _refreshMenu(client);

        await globalThis.__FACS_COMPARATIVO_FORCE_UPDATE__?.().catch(() => {});

        await logAudit(
          client,
          "SUBMIT — MODAL REGISTER (edit lista)",
          [`weekKey=${facsState.weekKey}`],
          {
            byUserId: interaction.user.id,
            interaction,
            beforeState: before,
            afterState: facsState.lista,
            extra: {
              totalAntes: _countLines(before),
              totalDepois: _countLines(facsState.lista),
            },
          }
        );

        return interaction.reply({ content: "✅ Atualizado!", ephemeral: true });
      }

      if (interaction.customId === "facs_semana_remove_org_modal") {
        if (!checkPerms(interaction.member, PERMS_REGISTER)) {
          return interaction.reply({ content: "❌ Sem permissão.", ephemeral: true });
        }

        const orgName = (interaction.fields.getTextInputValue("facs_remove_org_name") || "").trim();
        if (!orgName) {
          return interaction.reply({ content: "⚠️ Informe a ORG.", ephemeral: true });
        }

        const beforeList = facsState.lista;
        const beforeCount = _countLines(beforeList);
        const removedCount = _countByOrgName(beforeList, orgName);

        if (removedCount <= 0) {
          await logAudit(
            client,
            "SUBMIT — MODAL REMOVE ORG (não achou)",
            [`ORG: ${orgName}`],
            {
              byUserId: interaction.user.id,
              interaction,
              beforeState: beforeList,
              afterState: beforeList,
              extra: { total: beforeCount },
            }
          );

          return interaction.reply({
            content: `⚠️ Não achei **${orgName}** na lista.`,
            ephemeral: true,
          });
        }

        pushBackup("remove_by_org_modal");

        facsState.lista = _removeByOrgName(facsState.lista, orgName);
        saveStore(facsState);

        const afterList = facsState.lista;
        const afterCount = _countLines(afterList);

        await _refreshMenu(client);

        await logAudit(
          client,
          "SUBMIT — MODAL REMOVE ORG (por nome)",
          [
            `ORG: ${orgName}`,
            `Removidos: ${removedCount}`,
            `Total antes: ${beforeCount}`,
            `Total depois: ${afterCount}`,
          ],
          {
            byUserId: interaction.user.id,
            interaction,
            beforeState: beforeList,
            afterState: afterList,
          }
        );

        return interaction.reply({
          content: `🗑️ Removi **${removedCount}** ocorrência(s) de **${orgName}**.`,
          ephemeral: true,
        });
      }

      return false;
    }

    return false;
  } catch (e) {
    console.error("[FACS_SEMANAIS] interaction err:", e);
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction
          .reply({ content: "⚠️ Deu ruim aqui. Tenta de novo.", ephemeral: true })
          .catch(() => {});
      }
    } catch {}
    return true;
  }
}
