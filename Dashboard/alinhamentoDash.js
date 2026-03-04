  // /application/events/alinhamento.js  (DASH)
  // (Se teu nome do arquivo for outro, só mantém o conteúdo igual)

  import fs from "node:fs";
  import path from "node:path";
  import crypto from "node:crypto";
  import { fileURLToPath } from "node:url";
  import { EmbedBuilder } from "discord.js";

  /**
   * Inicializa o Dashboard de Alinhamentos (v1)
   * @param {import('discord.js').Client} client
   */
  export default function setupAlinhamentoDash(client) {
   // ===============================
// ALINV1_DASH v1 — Dashboard de Alinhamentos (sem conflito)
// ===============================

// ✅ HARD GUARD (não deixa instalar 2x nem por import duplicado / hot reload / etc)
if (globalThis.__SC_ALINV1_DASH_BOOTSTRAPPED__) {
  console.log("[ALINV1_DASH] módulo já carregado, abortando duplicação");
  return;
}
globalThis.__SC_ALINV1_DASH_BOOTSTRAPPED__ = true;


    // ---- CONFIG ----
    const ALINV1_MENU_CHANNEL_ID = "1425256185707233301"; // onde os registros são postados (embeds)
    const ALINV1_DASH_CHANNEL_ID = "1458121089665335339"; // onde o dashboard fica

    const TZ = "America/Sao_Paulo";

    // meta opcional (se não quiser, bota 0)
    const ALINV1_WEEK_GOAL = 0; // ex: 20 ou 30. 0 = não mostra meta

    // ✅ __dirname no ESM (path estável)
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    // ✅ pasta estável pra persistir entre reinícios
    const STORAGE_DIR = path.join(__dirname, "..", "storage");
    const STATE_PATH = path.join(STORAGE_DIR, "sc_alinv1_dashboard_state.json");

    // ✅ marker fixo pra achar a mensagem antiga se o state sumir
    const DASH_MARKER = "SC_ALINV1_DASH::MAIN_V1";

    const SCAN_PAGES = 60;
    const SCAN_TTL_MS = 25 * 1000;

    // ✅ interval “leve” + cooldown (evita spam)
    const INTERVAL_MS = 3 * 60 * 1000; // 3 min
    const MIN_UPDATE_GAP_MS = 10 * 60 * 1000; // ✅ só permite update real a cada 10 min (exceto manual/novo registro)
    const ENABLE_INTERVAL_LOG = false; // ✅ não logar a cada intervalo

    // ---- runtime ----
    let LOCK = false;
    let CACHE = { at: 0, payload: null };

    // ✅ assinatura do conteúdo (pra não editar msg sem necessidade)
    let LAST_SIGNATURE = "";
    let LAST_UPDATE_AT = 0;

    const DEBUG = {
      lastRunAt: null,
      lastReason: "",
      stage: "",
      error: "",
      dashMsgId: null,

      scannedMsgs: 0,
      scannedRegs: 0,

      weekKeysFound: {},
      chosenThis: null,
      chosenLast: null,
    };

    // ✅ debug controlável por env
    const DEBUG_ON = process.env.DASH_DEBUG === "1";
    const log = (...a) => console.log("[ALINV1_DASH]", ...a);
    const dlog = (...a) => {
      if (DEBUG_ON) console.log("[ALINV1_DASH][debug]", ...a);
    };

    // ---- fs robusto ----
    function ensureDir(dir) {
      try {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      } catch {}
    }

    function loadState() {
      try {
        if (!fs.existsSync(STATE_PATH)) return {};
        return JSON.parse(fs.readFileSync(STATE_PATH, "utf-8")) || {};
      } catch {
        return {};
      }
    }

    function saveState(s) {
      try {
        ensureDir(STORAGE_DIR);
        fs.writeFileSync(STATE_PATH, JSON.stringify(s, null, 2));
      } catch {}
    }

    // ----------------- TIME (SP safe) -----------------
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

    function startOfDaySP(date) {
      const { y, m, d } = ymdSP(date);
      return new Date(Date.UTC(y, m - 1, d));
    }

    function dowSP(date) {
      const wd = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(date);
      const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
      return map[wd] ?? 0;
    }

    function addDaysUTC(d, n) {
      const x = new Date(d.getTime());
      x.setUTCDate(x.getUTCDate() + n);
      return x;
    }

    // weekKey = domingo da semana (YYYY-MM-DD)
    function weekKeyFromDateSP(date) {
      const sod = startOfDaySP(date);
      const dow = dowSP(date);
      const sunday = addDaysUTC(sod, -dow);
      return sunday.toISOString().slice(0, 10);
    }

    function pad2(n) {
      return String(n).padStart(2, "0");
    }

    // Label bonita da semana: "01–07/01" (domingo–sábado) em SP
    function weekLabelFromWeekKey(weekKey) {
      try {
        const [Y, M, D] = weekKey.split("-").map(Number);
        const sundayUTC = new Date(Date.UTC(Y, M - 1, D));
        const saturdayUTC = addDaysUTC(sundayUTC, 6);

        const f = (dt) => {
          const { d, m } = ymdSP(new Date(dt.toLocaleString("en-US", { timeZone: TZ })));
          return { dd: pad2(d), mm: pad2(m) };
        };

        const a = f(sundayUTC);
        const b = f(saturdayUTC);

        if (a.mm === b.mm) return `${a.dd}–${b.dd}/${a.mm}`;
        return `${a.dd}/${a.mm}–${b.dd}/${b.mm}`;
      } catch {
        return weekKey;
      }
    }

    // ----------------- Parse embeds ALINV1 -----------------
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

    function isAlinv1RegistroEmbed(emb) {
      // bate no título e no footer
      const t = norm(emb?.title || emb?.data?.title || "");
      const ft = norm(emb?.footer?.text || emb?.data?.footer?.text || "");
      const okTitle = t.includes("registro") && t.includes("alinhamento");
      const okFooter = ft.includes("alinv1");
      return okTitle || okFooter;
    }

    function getFieldByNameContains(emb, contains) {
      const c = norm(contains);
      const f = getFields(emb).find((x) => norm(x?.name).includes(c));
      return String(f?.value || "").trim();
    }

    function cleanMentionOrText(v) {
      const s = String(v || "").trim();
      if (!s || s === "—") return null;
      const m = s.match(/<@!?(\d{17,20})>/);
      if (m) return { type: "user", id: m[1], raw: `<@${m[1]}>` };
      const id = s.match(/^\d{17,20}$/);
      if (id) return { type: "user", id: id[0], raw: `<@${id[0]}>` };
      return { type: "text", id: null, raw: s };
    }

    // ✅ NOVO: só contar quando o registro estiver VALIDADO
    function isRegistroValidado(emb) {
      const st = norm(getFieldByNameContains(emb, "status"));
      // no teu alinhamentos.js validado vira:
      // "VÁLIDO — aprovado por <@id> ..."
      if (st.includes("valido") || st.includes("aprov")) return true;
      return false;
    }

    // ----------------- SCAN -----------------
    async function collectAlinhamentos() {
      const now = Date.now();
      if (CACHE.payload && now - CACHE.at < SCAN_TTL_MS) return CACHE.payload;

      DEBUG.scannedMsgs = 0;
      DEBUG.scannedRegs = 0;
      DEBUG.weekKeysFound = {};

      const ch = await client.channels.fetch(ALINV1_MENU_CHANNEL_ID).catch(() => null);
      if (!ch) return { items: [] };

      let lastId;
      const items = [];

      for (let page = 0; page < SCAN_PAGES; page++) {
        const batch = await ch.messages.fetch({ limit: 100, before: lastId }).catch(() => null);
        if (!batch?.size) break;

        for (const m of batch.values()) {
          DEBUG.scannedMsgs++;

          const emb = m.embeds?.[0];
          if (!emb) continue;

          if (!isAlinv1RegistroEmbed(emb)) continue;
          DEBUG.scannedRegs++;

          // ✅ FILTRO: só entra se estiver VALIDADO
          if (!isRegistroValidado(emb)) continue;

          // fields
          const foi = getFieldByNameContains(emb, "quem foi alinhado");
          const quem = getFieldByNameContains(emb, "quem alinhou");
          const sobre = getFieldByNameContains(emb, "sobre");

          const ts = new Date(m.createdTimestamp);
          const wk = weekKeyFromDateSP(ts);

          DEBUG.weekKeysFound[wk] = (DEBUG.weekKeysFound[wk] || 0) + 1;

          items.push({
            weekKey: wk,
            alinhado: cleanMentionOrText(foi),
            alinhador: cleanMentionOrText(quem),
            sobre: String(sobre || "").slice(0, 250),
          });
        }

        lastId = batch.last()?.id;
        if (!lastId) break;
      }

      const payload = { items };
      CACHE = { at: now, payload };
      return payload;
    }

    function chooseWeeksFromScan() {
      const keys = Object.keys(DEBUG.weekKeysFound || {}).sort((a, b) => (a > b ? -1 : 1)); // desc
      return {
        thisKey: keys[0] || null,
        lastKey: keys[1] || null,
        keys,
      };
    }

    function aggregate(items, weekKey) {
      const only = items.filter((x) => x.weekKey === weekKey);
      const total = only.length;

      const byAlinhador = {};
      const byAlinhado = {};

      for (const x of only) {
        const a = x.alinhador?.raw || null;
        const f = x.alinhado?.raw || null;
        if (a) byAlinhador[a] = (byAlinhador[a] || 0) + 1;
        if (f) byAlinhado[f] = (byAlinhado[f] || 0) + 1;
      }

      const topAlinhador = Object.entries(byAlinhador)
        .map(([who, count]) => ({ who, count }))
        .sort((a, b) => b.count - a.count);

      const topAlinhado = Object.entries(byAlinhado)
        .map(([who, count]) => ({ who, count }))
        .sort((a, b) => b.count - a.count);

      return { total, topAlinhador, topAlinhado };
    }

    function diff(a, b) {
      const d = a - b;
      const pct = b > 0 ? (d / b) * 100 : a > 0 ? 100 : 0;
      const mood = d > 0 ? "🟢" : d < 0 ? "🔴" : "🟡";
      const sign = d > 0 ? "+" : d < 0 ? "−" : "";
      return { d, pct, mood, sign };
    }

    function goalLine(total) {
      if (!ALINV1_WEEK_GOAL || ALINV1_WEEK_GOAL <= 0) return null;

      const pct = Math.min(999, (total / ALINV1_WEEK_GOAL) * 100);
      const ok = total >= ALINV1_WEEK_GOAL;
      const fill = ok ? "🟩" : "🟨";
      const barW = 14;
      const filled = Math.min(barW, Math.round((total / Math.max(1, ALINV1_WEEK_GOAL)) * barW));
      const bar = fill.repeat(filled) + "⬜".repeat(Math.max(0, barW - filled));
      const tag =
        total > ALINV1_WEEK_GOAL ? "MUITO BOM" : total === ALINV1_WEEK_GOAL ? "BOM" : "ABAIXO";

      return `🎯 **Meta:** **${total}/${ALINV1_WEEK_GOAL}** (**${pct.toFixed(
        0
      )}%**)  ${bar} — **${tag}**`;
    }

    // ----------------- SIGNATURE (pra não editar sem mudar) -----------------
    function hash(obj) {
      return crypto.createHash("sha1").update(JSON.stringify(obj)).digest("hex");
    }

    function makeSignature({ thisWeekKey, lastWeekKey, cur, prev, weekKeysFound }) {
      return hash({
        thisWeekKey,
        lastWeekKey,
        curTotal: cur?.total || 0,
        prevTotal: prev?.total || 0,
        topA: (cur?.topAlinhador || []).slice(0, 5),
        topF: (cur?.topAlinhado || []).slice(0, 5),
        wk: weekKeysFound || {},
        goal: ALINV1_WEEK_GOAL || 0,
        onlyValid: true, // só pra deixar claro na assinatura
      });
    }

    async function findExistingDashboardMessage(dashCh, maxPages = 6) {
      let beforeId = undefined;

      for (let page = 0; page < maxPages; page++) {
        const batch = await dashCh.messages.fetch({ limit: 100, before: beforeId }).catch(() => null);
        if (!batch?.size) break;

        for (const m of batch.values()) {
          const emb = m.embeds?.[0];
          if (!emb) continue;

          const ft = String(emb?.footer?.text || emb?.data?.footer?.text || "");
          const title = String(emb?.title || emb?.data?.title || "");

          if (ft.includes(DASH_MARKER) || title.includes("Dashboard — Alinhamentos")) {
            return m;
          }
        }

        beforeId = batch.last()?.id;
        if (!beforeId) break;
      }

      return null;
    }

    // ----------------- UPSERT DASH -----------------
    async function upsertDashboard(reason) {
      DEBUG.lastRunAt = Date.now();
      DEBUG.lastReason = reason;
      DEBUG.stage = "start";
      DEBUG.error = "";

      DEBUG.stage = "fetch dash channel";
      const dashCh = await client.channels.fetch(ALINV1_DASH_CHANNEL_ID).catch((e) => {
        DEBUG.error = "fetch dashChannel falhou: " + String(e?.message || e);
        return null;
      });
      if (!dashCh) return;

      DEBUG.stage = "scan";
      const st = loadState();
      const { items } = await collectAlinhamentos();

      const chosen = chooseWeeksFromScan();
      const thisWeekKey = chosen.thisKey;
      const lastWeekKey = chosen.lastKey;

      DEBUG.chosenThis = thisWeekKey;
      DEBUG.chosenLast = lastWeekKey;

      const cur = thisWeekKey
        ? aggregate(items, thisWeekKey)
        : { total: 0, topAlinhador: [], topAlinhado: [] };
      const prev = lastWeekKey
        ? aggregate(items, lastWeekKey)
        : { total: 0, topAlinhador: [], topAlinhado: [] };
      const dd = diff(cur.total, prev.total);

      const gLine = goalLine(cur.total);

      const sig = makeSignature({
        thisWeekKey,
        lastWeekKey,
        cur,
        prev,
        weekKeysFound: DEBUG.weekKeysFound,
      });

      // ✅ se não mudou nada, não edita
      if (sig === LAST_SIGNATURE && reason !== "manual !alindashrefresh") {
        DEBUG.stage = "skip (no changes)";
        dlog("skip update (no changes)", { reason });
        return;
      }

      // ✅ cooldown pra interval (mas manual/registro novo passa)
      const now = Date.now();
      const isInterval = String(reason || "").startsWith("interval");
      const isManual = String(reason || "").startsWith("manual");
      const isNewRegistro = String(reason || "").includes("new registro");

      if (isInterval && !isManual && !isNewRegistro) {
        if (now - LAST_UPDATE_AT < MIN_UPDATE_GAP_MS) {
          DEBUG.stage = "skip (cooldown)";
          dlog("skip update (cooldown)", {
            reason,
            gapSec: Math.floor((now - LAST_UPDATE_AT) / 1000),
          });
          return;
        }
      }

      // monta textos
      const top3Alinhou = cur.topAlinhador.slice(0, 3);
      const top3AlinhouTxt = top3Alinhou.length
        ? [
            `🥇 **Top 1:** ${top3Alinhou[0].who} — **${top3Alinhou[0].count}**`,
            top3Alinhou[1]
              ? `🥈 **Top 2:** ${top3Alinhou[1].who} — **${top3Alinhou[1].count}**`
              : `🥈 **Top 2:** _(vazio)_`,
            top3Alinhou[2]
              ? `🥉 **Top 3:** ${top3Alinhou[2].who} — **${top3Alinhou[2].count}**`
              : `🥉 **Top 3:** _(vazio)_`,
          ].join("\n")
        : "_(vazio)_";

      const top3Foi = cur.topAlinhado.slice(0, 3);
      const top3FoiTxt = top3Foi.length
        ? [
            `🥇 **Top 1:** ${top3Foi[0].who} — **${top3Foi[0].count}**`,
            top3Foi[1]
              ? `🥈 **Top 2:** ${top3Foi[1].who} — **${top3Foi[1].count}**`
              : `🥈 **Top 2:** _(vazio)_`,
            top3Foi[2]
              ? `🥉 **Top 3:** ${top3Foi[2].who} — **${top3Foi[2].count}**`
              : `🥉 **Top 3:** _(vazio)_`,
          ].join("\n")
        : "_(vazio)_";

      const topLast = prev.topAlinhador?.[0]
        ? `${prev.topAlinhador[0].who} (**${prev.topAlinhador[0].count}**)`
        : "_(ninguém)_";

      DEBUG.stage = "embeds";
      const keysPreview =
        Object.entries(DEBUG.weekKeysFound || {})
          .sort((a, b) => (a[0] > b[0] ? -1 : 1))
          .slice(0, 6)
          .map(([k, v]) => `${k}=${v}`)
          .join(" • ") || "(nenhuma)";

      const embedMain = new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle("💜 Dashboard — Alinhamentos (Apenas VALIDADOS)")
        .setDescription(
          [
            `🗓️ **Semana Atual:** \`${thisWeekKey || "—"}\` • **${
              thisWeekKey ? weekLabelFromWeekKey(thisWeekKey) : "—"
            }**`,
            `🗓️ **Semana Passada:** \`${lastWeekKey || "—"}\` • **${
              lastWeekKey ? weekLabelFromWeekKey(lastWeekKey) : "—"
            }**`,
            "",
            `📌 **Total Atual (válidos):** **${cur.total}**`,
            `📌 **Total Passada (válidos):** **${prev.total}**`,
            `📊 **Diferença:** ${dd.mood} **${dd.sign}${Math.abs(dd.d)}** (${dd.pct.toFixed(1)}%)`,
            gLine ? "\n" + gLine : "",
            "",
            `🏆 **Quem mais alinhou na semana passada:** ${topLast}`,
            "",
            "⚠️ **Regra:** só conta quando alguém clica **ALINHAMENTO VÁLIDO** no registro.",
          ]
            .join("\n")
            .replace(/\n\n\n+/g, "\n\n")
        )
        .addFields(
          { name: "🧭 Top 3 — Quem alinhou (semana atual)", value: top3AlinhouTxt, inline: false },
          { name: "👤 Top 3 — Quem foi alinhado (semana atual)", value: top3FoiTxt, inline: false }
        )
        .setFooter({
          text: `${DASH_MARKER} • scan: msgs=${DEBUG.scannedMsgs} regs=${DEBUG.scannedRegs} • keys: ${keysPreview} • !alindashrefresh/.alindashrefresh • !alindashdebug/.alindashdebug`,
        })
        .setTimestamp(nowSP());

      const embeds = [embedMain];

      DEBUG.stage = "upsert msg";
      let msg = null;

      if (st.dashboardMsgId) {
        msg = await dashCh.messages.fetch(st.dashboardMsgId).catch(() => null);
      }

      // ✅ fallback: se o state sumiu ou a msg foi deletada, tenta achar no canal pelo marker
      if (!msg) {
        const found = await findExistingDashboardMessage(dashCh, 6);
        if (found) {
          msg = found;
          st.dashboardMsgId = msg.id;
          saveState(st);
        }
      }

      const payload = { content: "‎", embeds };

      if (!msg) {
        msg = await dashCh.send(payload).catch((e) => {
          DEBUG.error = "send falhou: " + String(e?.message || e);
          return null;
        });
        if (!msg) {
          DEBUG.stage = "failed send/edit";
          return;
        }
        st.dashboardMsgId = msg.id;
        saveState(st);
        DEBUG.dashMsgId = msg.id;
      } else {
        const ok = await msg
          .edit(payload)
          .then(() => true)
          .catch((e) => {
            DEBUG.error = "edit falhou: " + String(e?.message || e);
            return false;
          });
        if (!ok) {
          DEBUG.stage = "failed send/edit";
          return;
        }
        DEBUG.dashMsgId = msg.id;
      }

      try {
        if (msg && !msg.pinned) await msg.pin().catch(() => {});
      } catch {}

      // ✅ atualiza “estado” do módulo
      LAST_SIGNATURE = sig;
      LAST_UPDATE_AT = Date.now();

      DEBUG.stage = "done";

      // ✅ log só se não for intervalo (ou se você permitir)
      if (!isInterval || ENABLE_INTERVAL_LOG || DEBUG_ON) {
        log("Dashboard alinhamentos atualizado ✅", {
          reason,
          thisWeekKey,
          lastWeekKey,
          cur: cur.total,
          prev: prev.total,
        });
      }
    }

    async function safeUpdate(reason) {
      if (LOCK) return;
      LOCK = true;
      try {
        CACHE.at = 0;
        CACHE.payload = null;
        await upsertDashboard(reason);
      } finally {
        LOCK = false;
      }
    }

    // ---------------- Commands ----------------
    function debugText() {
      const dt = DEBUG.lastRunAt
        ? new Date(DEBUG.lastRunAt).toLocaleString("pt-BR", { timeZone: TZ })
        : "nunca";

      const keys =
        Object.entries(DEBUG.weekKeysFound || {})
          .sort((a, b) => (a[0] > b[0] ? -1 : 1))
          .slice(0, 12)
          .map(([k, v]) => `${k}=${v}`)
          .join(" • ") || "(nenhuma)";

      return [
        "🧾 **ALINV1_DASH Debug (v1)**",
        `• lastRun: **${dt}**`,
        `• reason: **${DEBUG.lastReason || "—"}**`,
        `• stage: **${DEBUG.stage || "—"}**`,
        `• dashMsgId: **${DEBUG.dashMsgId || "—"}**`,
        `• lastSig: **${LAST_SIGNATURE ? LAST_SIGNATURE.slice(0, 10) + "…" : "—"}**`,
        DEBUG.error ? `• ❌ error: **${DEBUG.error}**` : "• ✅ error: —",
        "",
        "📦 **Scan (somente VALIDADOS)**",
        `• scannedMsgs: **${DEBUG.scannedMsgs}**`,
        `• scannedRegs: **${DEBUG.scannedRegs}**`,
        `• chosenThis: **${DEBUG.chosenThis || "—"}**`,
        `• chosenLast: **${DEBUG.chosenLast || "—"}**`,
        `• weekKeysFound: ${keys}`,
        "",
        `• lastUpdateAt: **${
          LAST_UPDATE_AT
            ? new Date(LAST_UPDATE_AT).toLocaleString("pt-BR", { timeZone: TZ })
            : "—"
        }**`,
      ].join("\n");
    }

    // ----------------- Listeners -----------------
// ✅ READY ÚNICO (sem duplicar)
client.once("ready", async () => {
  log("ALINV1_DASH v1 instalado ✅ (ready único)");

  // tenta carregar estado logo no boot (só pra debug/garantia)
  try {
    const st = loadState();
    if (st?.dashboardMsgId) {
      log("State detectado: dashboardMsgId =", st.dashboardMsgId);
    } else {
      log("State vazio: vai localizar msg pelo marker ou criar 1x.");
    }
  } catch {}

  await safeUpdate("ready");
});


    // ✅ Intervalo (com trava global anti-duplicação)
if (!globalThis.__SC_ALINV1_DASH_INTERVAL__) {
  globalThis.__SC_ALINV1_DASH_INTERVAL__ = setInterval(
    () => safeUpdate("interval 3min"),
    INTERVAL_MS
  );
}

// ✅ Listener messageCreate (com trava global anti-duplicação)
if (!globalThis.__SC_ALINV1_DASH_MSG_LISTENER__) {
  globalThis.__SC_ALINV1_DASH_MSG_LISTENER__ = true;

  // se alguém postar registro novo no canal do menu, atualiza
  client.on("messageCreate", async (message) => {
    try {
      if (!message.guild || message.author.bot) return;

      const txt = (message.content || "").trim().toLowerCase();

      // aceita ! e .
      const isRefresh = txt === "!alindashrefresh" || txt === ".alindashrefresh";
      const isDebug = txt === "!alindashdebug" || txt === ".alindashdebug";

      if (isRefresh) {
        await message.reply("🔄 Atualizando dashboard de **Alinhamentos**...").catch(() => {});
        await safeUpdate("manual alindashrefresh");
        return;
      }

      if (isDebug) {
        await message.reply({ content: debugText() }).catch(() => {});
        return;
      }

      if (message.channelId === ALINV1_MENU_CHANNEL_ID) {
        const emb = message.embeds?.[0];
        // ✅ agora só atualiza quando um registro VALIDADO aparecer
        if (emb && isAlinv1RegistroEmbed(emb) && isRegistroValidado(emb)) {
          await safeUpdate("new registro embed (validado)");
        }
      }
    } catch {}
  });
}

  }
