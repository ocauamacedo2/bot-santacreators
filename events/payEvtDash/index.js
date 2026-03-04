  // /application/events/payEvtDash/index.js
  // SC_PAY_EVT_DASH v4.1 (HOOKS) — Dashboard por SEMANAS (domingo 00:00 → sábado 23:59)
  // ✅ Hook-based (SEM client.on aqui dentro) pra não duplicar listeners no teu index
  // ✅ ZERA todo domingo 00:00 SP (começa a contar a semana nova)
  // ✅ Ranking geral = Pagamentos + Eventos (EVT3)
  // ✅ Meta = 40 pagamentos por semana
  // ✅ Gráfico últimas 4 semanas (Pagamentos vs Eventos) + números em cima das barras
  // ✅ Atualiza: ready + intervalo + domingo 00:00 SP + comando manual
  // ✅ NOVO: RECUPERA a mensagem antiga automaticamente (mesmo se o state sumir)
  // ✅ NOVO: STATE em ./data/ (mais confiável)
  // ✅ NOVO: fingerprint só salva depois de editar/enviar com sucesso (evita "travado")

  // Como plugar no index:
  //   import { payEvtDashOnReady, payEvtDashHandleMessage } from "./events/payEvtDash/index.js";
  //   no ready: await payEvtDashOnReady(client);
  //   no messageCreate: if (await payEvtDashHandleMessage(message, client)) return;

  import fs from "node:fs";
  import path from "node:path";
  import { EmbedBuilder, AttachmentBuilder } from "discord.js";
  import { dashOn } from "../../utils/dashHub.js";

  // =========================
  // CONFIG
  // =========================
  const TZ = "America/Sao_Paulo";

  // Dashboard
  const DASH_CHANNEL_ID = "1457985700312911912";

  // Pagamentos
  const PAY_CHANNEL_ID = "1387922662134775818";

  // EVT3
  const EVT3_EVENT_CHANNEL_ID = "1457573495952248883";
  const EVT3_STATE_FILE =
    process.env.EVT3_STATE_FILE || path.resolve(process.cwd(), "data", "evt3_events_state.json");

  // Registro Manual de Eventos (Botão/Modal)
  const REGISTRO_EVENTO_CHANNEL_ID = "1392618646630568076";

  // Cronograma (Aprovados)
  const CRONOGRAMA_LOGS_CHANNEL_ID = "1387864036259004436";

  // Pagamentos — Regras da Semana
  // OK = 50 | META = 60 | LIMITE = 80 (não pode estourar)
  // ⚠️ Tudo aqui é baseado SOMENTE em pagamentos APROVADOS.
  const PAY_PERIOD_OK = 50;
  const PAY_PERIOD_GOAL = 60;
  const PAY_PERIOD_LIMIT = 80;


  // Scan
  const SCAN_PAGES = 160;
  const SCAN_TTL_MS = 25 * 1000;

  // =========================
  // ✅ STATE (msg id) — MAIS CONFIÁVEL EM ./data
  // (se quiser trocar sem mexer no código: env SC_PAY_EVT_DASH_STATE_FILE)
  // =========================
  const STATE_PATH =
    process.env.SC_PAY_EVT_DASH_STATE_FILE || path.resolve(process.cwd(), "data", "sc_pay_evt_dashboard_state.json");

  // =========================
  // Guards / cache
  // =========================
  let LOCK = false;
  let LOCK_TS = 0;
  let CACHE = { at: 0, payload: null };

  const DEBUG = {
    lastRunAt: null,
    lastReason: "",
    stage: "",
    error: "",
    dashMsgId: null,

    scannedPayMsgs: 0,
    scannedPayRegs: 0,
    scannedEvtManualMsgs: 0,

    // Pagamentos por período (semanas)
    // payPeriodFound = APROVADOS (usado no ranking/meta/limite)
    payPeriodFound: {},
    // extras pra mostrar no embed (informativo)
    payPeriodFoundAll: {},
    payPeriodFoundApproved: {},
    payPeriodFoundRejected: {},

    evtPeriodFound: {},

    chosenThis: null,
    chosenLast: null,
    chartPeriods: [],
  };


  function log(...a) {
    console.log("[SC_PAY_EVT_DASH]", ...a);
  }

  // =========================
  // FS helpers
  // =========================
  function ensureDirForFile(file) {
    try {
      const full = path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
      const dir = path.dirname(full);
      fs.mkdirSync(dir, { recursive: true });
    } catch {}
  }

  function loadState() {
    try {
      ensureDirForFile(STATE_PATH);

      const full = path.isAbsolute(STATE_PATH) ? STATE_PATH : path.resolve(process.cwd(), STATE_PATH);
      if (!fs.existsSync(full)) return { dashboardMsgId: null, lastFingerprint: "" };

      const parsed = JSON.parse(fs.readFileSync(full, "utf-8")) || {};
      return {
        dashboardMsgId: parsed.dashboardMsgId || null,
        lastFingerprint: parsed.lastFingerprint || "",
      };
    } catch {
      return { dashboardMsgId: null, lastFingerprint: "" };
    }
  }

  function saveState(s) {
    try {
      ensureDirForFile(STATE_PATH);

      const full = path.isAbsolute(STATE_PATH) ? STATE_PATH : path.resolve(process.cwd(), STATE_PATH);
      fs.writeFileSync(
        full,
        JSON.stringify(
          {
            dashboardMsgId: s?.dashboardMsgId || null,
            lastFingerprint: s?.lastFingerprint || "",
          },
          null,
          2
        )
      );
    } catch {}
  }

  function readEvt3State() {
    try {
      const full = path.resolve(process.cwd(), EVT3_STATE_FILE);
      if (!fs.existsSync(full)) return null;
      return JSON.parse(fs.readFileSync(full, "utf-8")) || null;
    } catch {
      return null;
    }
  }

  // =========================
  // TIME SAFE (SP)
  // =========================
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

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function addDaysUTC(dateUTC, days) {
    const d = new Date(dateUTC.getTime());
    d.setUTCDate(d.getUTCDate() + days);
    return d;
  }

  // ==========================================================
  // ✅ PERÍODO = semana (Dom 00:00 → Sáb 23:59) em SP
  // key = YYYY-MM-DD (domingo)
  // label = "DD-DD/MM" (se cruzar mês: "DD/MM-DD/MM")
  // ==========================================================
  function periodKeyFromDateSP(date) {
    const sp = new Date(new Date(date).toLocaleString("en-US", { timeZone: TZ }));

    // Descobre o dia da semana em SP (0=Dom..6=Sáb)
    const wd = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(sp);
    const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const dow = map[wd] ?? 0;

    // Pega o Y/M/D do dia em SP e cria um "UTC midnight" equivalente pra operar dias
    const { y, m, d } = ymdSP(sp);
    const todayUTC = new Date(Date.UTC(y, m - 1, d)); // 00:00 UTC do dia SP

    // Domingo dessa semana = hoje - dow
    const sundayUTC = addDaysUTC(todayUTC, -dow);
    const saturdayUTC = addDaysUTC(sundayUTC, 6);

    // Monta key baseado no domingo (YYYY-MM-DD)
    const key = `${sundayUTC.getUTCFullYear()}-${pad2(sundayUTC.getUTCMonth() + 1)}-${pad2(
      sundayUTC.getUTCDate()
    )}`;

    // Labels
    const sDay = pad2(sundayUTC.getUTCDate());
    const sMon = pad2(sundayUTC.getUTCMonth() + 1);
    const eDay = pad2(saturdayUTC.getUTCDate());
    const eMon = pad2(saturdayUTC.getUTCMonth() + 1);

    const label = sMon === eMon ? `${sDay}-${eDay}/${eMon}` : `${sDay}/${sMon}-${eDay}/${eMon}`;

    return { key, label };
  }

  function labelFromPeriodKey(key) {
    try {
      const [Y, M, D] = key.split("-").map(Number);
      const fake = new Date(new Date(Date.UTC(Y, M - 1, D)).toLocaleString("en-US", { timeZone: TZ }));
      return periodKeyFromDateSP(fake).label;
    } catch {
      return key;
    }
  }

  // =========================
  // PARSERS (Pagamentos)
  // =========================
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

  function isPaymentRecordEmbed(emb) {
    const t = String(emb?.title || emb?.data?.title || "");
    // ✅ Mais flexível: aceita se tiver "Registro de Pagamento" e ("Evento" OU "SANTACREATORS")
    return t.includes("Registro de Pagamento") && (t.includes("Evento") || t.includes("SANTACREATORS"));
  }

  function getPaymentRegistrarId(emb) {
    const f = getFields(emb).find((x) => norm(x?.name).includes("registro"));
    const m = /<@!?(\d+)>/.exec(f?.value || "");
    return m ? m[1] : null;
  }

  // ✅ Status do registro (APPROVED / REJECTED / UNKNOWN)
  // No teu pagamentosocial:
  // - Aprovado = quando vira "✅ **PAGO**"
  // - Recusado = quando vira "❌ **REPROVADO**"
  // - "📌 JÁ FOI SOLICITADO" e "Aguardando confirmação" NÃO contam como aprovado
  function getPaymentStatus(emb) {
    const fields = getFields(emb);

    const statusField = fields.find((x) => {
      const n = norm(x?.name);
      return (
        n.includes("status") ||
        n.includes("situacao") ||
        n.includes("situação") ||
        n.includes("aprov") ||
        n.includes("resultado")
      );
    });

    const raw = norm(statusField?.value || "");
    if (!raw) return "UNKNOWN";

    // ✅ APROVADO (PAGO)
    // pega "pago" mesmo se vier com emoji/markdown
    if (raw.includes("pago")) return "APPROVED";
    if (raw.includes("aprov")) return "APPROVED";
    if (raw.includes("confirmado")) return "APPROVED";

    // ❌ RECUSADO/REPROVADO
    if (raw.includes("reprov") || raw.includes("recus") || raw.includes("negad")) return "REJECTED";

    // solicitado/aguardando = não entra na meta/limite
    if (raw.includes("solicit")) return "UNKNOWN";
    if (raw.includes("aguard")) return "UNKNOWN";

    return "UNKNOWN";
  }

  // ✅ Parser para Registro Manual de Eventos
  function isManualEventEmbed(emb) {
    const t = norm(emb?.title || emb?.data?.title || "");
    // ✅ Parser mais flexível: aceita qualquer variação de título
    return t.includes("registro") && (t.includes("poderes") || t.includes("evento") || t.includes("uso de"));
  }

  function getManualEventUserId(emb) {
    // 1. Tenta pegar do footer (onde colocamos "User ID: 123...")
    const footer = emb?.footer?.text || emb?.data?.footer?.text || "";
    const mFooter = /User ID:\s*(\d+)/.exec(footer);
    if (mFooter) return mFooter[1];

    // 2. Tenta pegar do field "Registrado por" ou "Criado por"
    const fields = getFields(emb);
    const f = fields.find((x) => {
      const n = norm(x?.name);
      return n.includes("registrado por") || n.includes("criado por");
    });
    if (f) {
      const m = /<@!?(\d+)>/.exec(f.value || "");
      if (m) return m[1];
    }
    return null;
  }


  // =========================
  // ✅ RECUPERAÇÃO DA MENSAGEM DO DASH (ANTI-SPAM DE RESTART)
  // - Se state sumiu OU fetch por ID falhar, procura no canal uma mensagem do bot
  //   com o título do dashboard (preferindo pinned).
  // =========================
  const DASH_EMBED_TITLE_MATCH = "Dashboard — Registros (Pagamentos + Eventos)";

  function getEmbedTitle(emb) {
    return String(emb?.title || emb?.data?.title || "");
  }

  function looksLikeOurDashMessage(msg, client) {
    try {
      if (!msg) return false;
      if (!client?.user?.id) return false;
      if (msg.author?.id !== client.user.id) return false;

      const emb = msg.embeds?.[0];
      if (!emb) return false;

      const title = getEmbedTitle(emb);
      if (!title) return false;

      return title.includes(DASH_EMBED_TITLE_MATCH);
    } catch {
      return false;
    }
  }

  async function findExistingDashboardMessage(dash, client) {
    // IMPORTANTE: precisa de "Read Message History" no canal do dashboard
    // pra fetchar histórico e achar a msg antiga.
    try {
      // 1) tenta pegar pins primeiro (bem certeiro e barato)
      const pins = await dash.messages.fetchPinned().catch(() => null);
      if (pins?.size) {
        const pinnedCandidates = [...pins.values()].filter((m) => looksLikeOurDashMessage(m, client));
        if (pinnedCandidates.length) return pinnedCandidates[0];
      }

      // 2) se não achou pinned, varre algumas páginas recentes
      let lastId = undefined;
      const PAGES = 6; // 6 * 100 = 600 msgs (ajusta se teu canal for muito movimentado)
      for (let i = 0; i < PAGES; i++) {
        const batch = await dash.messages.fetch({ limit: 100, before: lastId }).catch(() => null);
        if (!batch?.size) break;

        const found = [...batch.values()].find((m) => looksLikeOurDashMessage(m, client));
        if (found) return found;

        lastId = batch.last()?.id;
        if (!lastId) break;
      }

      return null;
    } catch {
      return null;
    }
  }

  // =========================
  // Coleta Pagamentos + Eventos
  // =========================
  async function collectAll(client) {
    const now = Date.now();
    if (CACHE.payload && now - CACHE.at < SCAN_TTL_MS) return CACHE.payload;

    DEBUG.scannedPayMsgs = 0;
    DEBUG.scannedPayRegs = 0;
    DEBUG.scannedEvtManualMsgs = 0;

    // zera TODOS os mapas de pagamentos
    DEBUG.payPeriodFound = {};
    DEBUG.payPeriodFoundAll = {};
    DEBUG.payPeriodFoundApproved = {};
    DEBUG.payPeriodFoundRejected = {};

    // zera eventos
    DEBUG.evtPeriodFound = {};


    // -------- Pagamentos --------
    const payCh = await client.channels.fetch(PAY_CHANNEL_ID).catch(() => null);

    // payments = APROVADOS (é isso que conta pra meta/limite/ranking)
    const payments = [];

    // extras só pra mostrar no embed (info)
    const paymentsAll = [];
    const paymentsRejected = [];

    if (payCh?.isTextBased?.()) {
      let lastId;

      for (let page = 0; page < SCAN_PAGES; page++) {
        const batch = await payCh.messages.fetch({ limit: 100, before: lastId }).catch(() => null);
        if (!batch?.size) break;

                for (const m of batch.values()) {
          DEBUG.scannedPayMsgs++;

          const emb = m.embeds?.[0];
          if (!emb) continue;
          if (!isPaymentRecordEmbed(emb)) continue;

          DEBUG.scannedPayRegs++;

          const uid = getPaymentRegistrarId(emb);
          if (!uid) continue;

          // ✅ Semana do REGISTRO (quando foi criado)
          const tsCreated = new Date(m.createdTimestamp);
          const pAll = periodKeyFromDateSP(tsCreated);

          // ✅ conta TOTAL de registros (qualquer status) pela data de CRIAÇÃO
          DEBUG.payPeriodFoundAll[pAll.key] = (DEBUG.payPeriodFoundAll[pAll.key] || 0) + 1;

          paymentsAll.push({
            userId: String(uid),
            periodKey: pAll.key,
            kind: "pay_all",
          });

          // ✅ agora filtra o que importa de verdade (APROVADO/REPROVADO)
          const st = getPaymentStatus(emb);

          // ✅ Semana do STATUS (quando virou PAGO/REPROVADO)
          // Se o bot editou a msg ao aprovar/reprovar, editedTimestamp representa o “momento real” da mudança.
          const statusBaseTs =
            (st === "APPROVED" || st === "REJECTED")
              ? (m.editedTimestamp || m.createdTimestamp)
              : m.createdTimestamp;

          const tsStatus = new Date(statusBaseTs);
          const pStatus = periodKeyFromDateSP(tsStatus);

          if (st === "APPROVED") {
            // aprovado: entra no ranking/meta/limite pela data de APROVAÇÃO (edit)
            DEBUG.payPeriodFound[pStatus.key] = (DEBUG.payPeriodFound[pStatus.key] || 0) + 1;
            DEBUG.payPeriodFoundApproved[pStatus.key] =
              (DEBUG.payPeriodFoundApproved[pStatus.key] || 0) + 1;

            payments.push({
              userId: String(uid),
              periodKey: pStatus.key,
              kind: "pay",
            });
          } else if (st === "REJECTED") {
            // recusado: informativo pela data de REPROVAÇÃO (edit)
            DEBUG.payPeriodFoundRejected[pStatus.key] =
              (DEBUG.payPeriodFoundRejected[pStatus.key] || 0) + 1;

            paymentsRejected.push({
              userId: String(uid),
              periodKey: pStatus.key,
              kind: "pay_rejected",
            });
          } else {
            // UNKNOWN: fica só no total (paymentsAll)
            // não entra em aprovado nem recusado
          }
        }


        lastId = batch.last()?.id;
        if (!lastId) break;
      }
    }

    // Inicializa lista de eventos (usado por Manuais e EVT3)
    const events = [];
    const manualCandidates = [];

    // -------- Eventos Manuais (Registro de Poderes) --------
    const regEvtCh = await client.channels.fetch(REGISTRO_EVENTO_CHANNEL_ID).catch(() => null);
    if (regEvtCh?.isTextBased?.()) {
      let lastId;
      // Usa menos páginas pois é um log específico
      const MANUAL_PAGES = 50; 

      for (let page = 0; page < MANUAL_PAGES; page++) {
        const batch = await regEvtCh.messages.fetch({ limit: 100, before: lastId }).catch(() => null);
        if (!batch?.size) break;

        for (const m of batch.values()) {
          const emb = m.embeds?.[0];
          if (!emb) continue;
          if (!isManualEventEmbed(emb)) continue;

          // ✅ Tenta pegar ID do content (mais confiável pois o bot manda <@id>)
          let uid = null;
          const mContent = /<@!?(\d+)>/.exec(m.content || "");
          if (mContent) uid = mContent[1];

          // Se não achou no content, tenta no embed
          if (!uid) uid = getManualEventUserId(emb);

          if (!uid) continue;

          DEBUG.scannedEvtManualMsgs++;
          manualCandidates.push({
            userId: String(uid),
            ts: m.createdTimestamp,
          });
        }
        lastId = batch.last()?.id;
        if (!lastId) break;
      }
    }

    // ✅ COOLDOWN de 1h POR PESSOA (1 ponto por hora)
manualCandidates.sort((a, b) => a.ts - b.ts);

const lastUserTime = new Map();
const MANUAL_COOLDOWN = 60 * 60 * 1000; // 1 hora

for (const cand of manualCandidates) {
  const last = lastUserTime.get(cand.userId);

  // primeira vez da pessoa OU passou 1h
  if (!last || cand.ts - last >= MANUAL_COOLDOWN) {
    lastUserTime.set(cand.userId, cand.ts);

    const dateObj = new Date(cand.ts);
    const p = periodKeyFromDateSP(dateObj);

    DEBUG.evtPeriodFound[p.key] =
      (DEBUG.evtPeriodFound[p.key] || 0) + 1;

    events.push({
      userId: cand.userId,
      periodKey: p.key,
      kind: "evt_manual",
    });
  }
}


    // -------- Eventos (EVT3 via state) --------
    const st = readEvt3State();
    const map = st?.evt3Events || {};
    const entries = Object.entries(map);

    const parent = await client.channels.fetch(EVT3_EVENT_CHANNEL_ID).catch(() => null);

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

      const p = periodKeyFromDateSP(createdAt);
      DEBUG.evtPeriodFound[p.key] = (DEBUG.evtPeriodFound[p.key] || 0) + 1;

      events.push({
        userId: creatorId,
        periodKey: p.key,
        kind: "evt",
      });
    }

      const payload = { payments, paymentsAll, paymentsRejected, events };
    CACHE = { at: now, payload };
    return payload;

  }

  function choosePeriodsUnion(payments, events, forceKey) {
    const union = new Set();
    if (forceKey) union.add(forceKey);
    for (const p of payments) union.add(p.periodKey);
    for (const e of events) union.add(e.periodKey);

    const keys = [...union].sort((a, b) => (a > b ? -1 : 1)); // desc
    return { thisKey: keys[0] || null, lastKey: keys[1] || null, keys };
  }

  // =========================
  // Aggregations
  // =========================
  function aggregate(items, periodKey) {
    const only = items.filter((e) => e.periodKey === periodKey);
    const byUser = {};
    for (const e of only) byUser[e.userId] = (byUser[e.userId] || 0) + 1;

    const top = Object.entries(byUser)
      .map(([userId, count]) => ({ userId, count }))
      .sort((a, b) => b.count - a.count);

    return { total: only.length, top };
  }

  function diff(a, b) {
    const d = a - b;
    const pct = b > 0 ? (d / b) * 100 : a > 0 ? 100 : 0;
    const mood = d > 0 ? "🟢" : d < 0 ? "🔴" : "🟡";
    const sign = d > 0 ? "+" : d < 0 ? "−" : "";
    return { d, pct, mood, sign };
  }

  function payStatus(approved) {
    // OK <= 50 | META 60 | LIMITE 80 (passou disso = estourou)
    if (approved > PAY_PERIOD_LIMIT) return { icon: "🚨", label: "ESTOUROU O LIMITE", color: 0xed4245, fill: "🟥" };
    if (approved === PAY_PERIOD_LIMIT) return { icon: "⚠️", label: "NO LIMITE", color: 0xfaa61a, fill: "🟧" };
    if (approved >= PAY_PERIOD_GOAL) return { icon: "🟢", label: "META BATIDA", color: 0x57f287, fill: "🟩" };
    if (approved >= PAY_PERIOD_OK) return { icon: "🟡", label: "OK", color: 0xfee75c, fill: "🟨" };
    return { icon: "🔴", label: "ABAIXO DO OK", color: 0xed4245, fill: "🟥" };
  }

  function progressBarEmoji(value, max, width = 14, fill = "🟩") {
    const v = Math.max(0, value);
    const m = Math.max(1, max);
    const filled = Math.min(width, Math.round((v / m) * width));
    return fill.repeat(filled) + "⬜".repeat(Math.max(0, width - filled));
  }


  // =========================
  // Chart (QuickChart) + números em cima
  // =========================
  function chartUrlTwoDatasets({ labels, payData, evtData, title }) {
    const cfg = {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: "Pagamentos", data: payData },
          { label: "Eventos/Poderes", data: evtData },
        ],
      },
      options: {
        plugins: {
          title: { display: true, text: title, font: { size: 18 } },
          datalabels: {
            anchor: "end",
            align: "end",
            offset: 2,
            clamp: true,
            formatter: undefined,
          },
          legend: { display: true },
        },
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0 } },
        },
      },
    };

    const base = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(cfg))}`;
    return `${base}&width=1200&height=450&backgroundColor=white&plugins=chartjs-plugin-datalabels`;
  }

  async function fetchBuffer(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  // =========================
  // Upsert Dashboard
  // =========================
  async function upsertDashboard(client, reason) {
    DEBUG.lastRunAt = Date.now();
    DEBUG.lastReason = reason;
    DEBUG.stage = "start";
    DEBUG.error = "";

    DEBUG.stage = "fetch dash";
    const dash = await client.channels.fetch(DASH_CHANNEL_ID).catch((e) => {
      DEBUG.error = "fetch dashChannel falhou: " + String(e?.message || e);
      return null;
    });
    if (!dash?.isTextBased?.()) return;

    DEBUG.stage = "scan";
    const st = loadState();
      const { payments, paymentsAll, paymentsRejected, events } = await collectAll(client);


      // Ranking geral = pagamentos APROVADOS + eventos
    const all = [...payments, ...events];

      // ✅ FORÇA A SEMANA ATUAL (mesmo se vazia)
      const currentWk = periodKeyFromDateSP(new Date()).key;

      // Períodos: usa TODOS os registros de pagamento (all) + eventos
    // (mas ranking/meta/limite continuam só nos APROVADOS)
    const chosen = choosePeriodsUnion(paymentsAll, events, currentWk);


    const thisKey = chosen.thisKey;
    const lastKey = chosen.lastKey;

    DEBUG.chosenThis = thisKey;
    DEBUG.chosenLast = lastKey;

    const curAll = thisKey ? aggregate(all, thisKey) : { total: 0, top: [] };
    const prevAll = lastKey ? aggregate(all, lastKey) : { total: 0, top: [] };
    const ddAll = diff(curAll.total, prevAll.total);

    const curPay = thisKey ? aggregate(payments, thisKey) : { total: 0, top: [] };
    const prevPay = lastKey ? aggregate(payments, lastKey) : { total: 0, top: [] };
      // ✅ Informativos (não mexem no ranking/meta — só pra mostrar bonito)
    const curPayAll = thisKey ? aggregate(paymentsAll, thisKey) : { total: 0, top: [] };
    const prevPayAll = lastKey ? aggregate(paymentsAll, lastKey) : { total: 0, top: [] };

    const curPayRej = thisKey ? aggregate(paymentsRejected, thisKey) : { total: 0, top: [] };
    const prevPayRej = lastKey ? aggregate(paymentsRejected, lastKey) : { total: 0, top: [] };

    const curPayApproved = curPay.total; // aprovado = o payments mesmo
    const prevPayApproved = prevPay.total;

    const ddPay = diff(curPay.total, prevPay.total);

    const curEvt = thisKey ? aggregate(events, thisKey) : { total: 0, top: [] };

    const topEventos = curEvt.top.slice(0, 5);

  const topEventosText = topEventos.length
    ? topEventos
        .map((u, i) => {
          const medal =
            i === 0 ? "🥇" :
            i === 1 ? "🥈" :
            i === 2 ? "🥉" : "🔹";
          return `${medal} <@${u.userId}> — **${u.count}**`;
        })
        .join("\n")
    : "_(nenhum registro)_";

    const prevEvt = lastKey ? aggregate(events, lastKey) : { total: 0, top: [] };
    const ddEvt = diff(curEvt.total, prevEvt.total);

      const ps = payStatus(curPayApproved);

    // barra agora vai pelo LIMITE (80), porque é o teto que não pode passar
    const pctLimit = Math.min(999, (curPayApproved / PAY_PERIOD_LIMIT) * 100);
    const bar = progressBarEmoji(curPayApproved, PAY_PERIOD_LIMIT, 14, ps.fill);

    const goalLine = [
      `${ps.icon} **Pagamentos Aprovados (SEMANA):** **${curPayApproved}**`,
      `🟡 **OK:** ${PAY_PERIOD_OK}  •  🟢 **META:** ${PAY_PERIOD_GOAL}  •  ⚠️ **LIMITE:** ${PAY_PERIOD_LIMIT}`,
      `📌 **Progresso até o LIMITE:** **${curPayApproved}/${PAY_PERIOD_LIMIT}** (**${pctLimit.toFixed(0)}%**)  ${bar} — **${ps.label}**`,
    ].join("\n");


    const top3 = curAll.top.slice(0, 3);
    const top3Text = top3.length
      ? [
          `🥇 <@${top3[0].userId}> — **${top3[0].count}**`,
          top3[1] ? `🥈 <@${top3[1].userId}> — **${top3[1].count}**` : `🥈 _(vazio)_`,
          top3[2] ? `🥉 <@${top3[2].userId}> — **${top3[2].count}**` : `🥉 _(vazio)_`,
        ].join("\n")
      : "_(vazio)_";

    const topLast = prevAll.top[0] ? `<@${prevAll.top[0].userId}> (**${prevAll.top[0].count}**)` : "_(ninguém)_";

    // --------- chart últimas 4 ----------
    DEBUG.stage = "chart-build";
    const periodKeysDesc = (chosen.keys || []).slice(0, 4);
    const periodKeysAsc = [...periodKeysDesc].sort((a, b) => (a > b ? 1 : -1));
    DEBUG.chartPeriods = periodKeysAsc;

    const labels = periodKeysAsc.map((k) => labelFromPeriodKey(k));
    
    // ✅ payData = TODOS os registros feitos (solicitados/aprovados/recusados)
    // (Antes era só aprovados, mas agora reflete "registros feitos" no gráfico)
    const payData = periodKeysAsc.map((k) => DEBUG.payPeriodFoundAll?.[k] || 0);

    const evtData = periodKeysAsc.map((k) => DEBUG.evtPeriodFound?.[k] || 0);

    // ==========================================================
    // ✅ SKIP INTELIGENTE: se nada mudou, NÃO baixa gráfico,
    // NÃO edita msg, NÃO anexa arquivo.
    // ==========================================================
    const fingerprint = JSON.stringify({
      thisKey,
      lastKey,
      totals: { curAll: curAll.total, prevAll: prevAll.total },
      pay: { cur: curPay.total, prev: prevPay.total },
      evt: { cur: curEvt.total, prev: prevEvt.total },
      chartPeriods: periodKeysAsc,
      series: { payData, evtData },
    });

    if ((st.lastFingerprint || "") === fingerprint) {
      DEBUG.stage = "skip (no changes)";
      DEBUG.dashMsgId = st.dashboardMsgId || null;
      return;
    }

    DEBUG.stage = "chart-fetch";
    let files = [];
    let haveAttachment = false;

    try {
      const url = chartUrlTwoDatasets({
        labels,
        payData,
        evtData,
        title: "Histórico — Últimos 4 períodos (semanas: Dom→Sáb)",
      });
      const buf = await fetchBuffer(url);
      files = [new AttachmentBuilder(buf, { name: "pay_evt_last4periods.png" })];
      haveAttachment = true;
    } catch (e) {
      haveAttachment = false;
      files = [];
      DEBUG.error = "Falha baixar/anexar gráfico: " + String(e?.message || e);
    }

    DEBUG.stage = "embeds";
    const thisLabel = thisKey ? labelFromPeriodKey(thisKey) : "—";
    const lastLabel = lastKey ? labelFromPeriodKey(lastKey) : "—";

    const keysPreview = (() => {
      const union = new Set([...Object.keys(DEBUG.payPeriodFound || {}), ...Object.keys(DEBUG.evtPeriodFound || {})]);
      return [...union].sort((a, b) => (a > b ? -1 : 1)).slice(0, 10).join(" • ") || "(nenhum)";
    })();

      const embedMain = new EmbedBuilder()
      .setColor(ps.color)
      .setTitle("📈 Dashboard — Registros (Pagamentos + Eventos) • Semanal (Dom→Sáb)")

      .setDescription(
        [
          `🗓️ **Período Atual:** \`${thisLabel}\`  •  key: \`${thisKey || "—"}\``,
          `🗓️ **Período Passado:** \`${lastLabel}\`  •  key: \`${lastKey || "—"}\``,
          "",
          `📌 **Total Atual (Pagamentos+Eventos):** **${curAll.total}**`,
          `📌 **Total Passado (Pagamentos+Eventos):** **${prevAll.total}**`,
          `📊 **Dif Total:** ${ddAll.mood} **${ddAll.sign}${Math.abs(ddAll.d)}** (${ddAll.pct.toFixed(1)}%)`,
          "",
          `💸 **Pagamentos (APROVADOS) — Atual:** **${curPayApproved}**  •  Passado: **${prevPayApproved}**`,
          `🧾 **Registros Pagamentos (TOTAL) — Atual:** **${curPayAll.total}**  •  Passado: **${prevPayAll.total}**`,
          `❌ **Registros Pagamentos (RECUSADOS) — Atual:** **${curPayRej.total}**  •  Passado: **${prevPayRej.total}**`,
          `📊 **Dif Pagamentos (APROVADOS):** ${ddPay.mood} **${ddPay.sign}${Math.abs(ddPay.d)}** (${ddPay.pct.toFixed(1)}%)`,
          "",
          `🎉 **Eventos (Atual):** **${curEvt.total}**  •  Passado: **${prevEvt.total}**`,
          `📊 **Dif Eventos:** ${ddEvt.mood} **${ddEvt.sign}${Math.abs(ddEvt.d)}** (${ddEvt.pct.toFixed(1)}%)`,
          "",
          goalLine,
          "",
          `🏆 **Top 1 do período passado (ranking geral):** ${topLast}`,
        ].join("\n")
      )
      .addFields(
    { 
      name: "🏅 Top 3 — Ranking Geral (Pagamentos + Eventos + Poderes)", 
      value: top3Text, 
      inline: false 
    }
  )

      .setTimestamp(nowSP());

    const embeds = [embedMain];

    if (haveAttachment) {
      embeds.push(
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("📊 Gráfico — Últimos 4 períodos (com números)")
          .setDescription("Semanas: **Domingo 00:00** até **Sábado 23:59**.")
          .setImage("attachment://pay_evt_last4periods.png")
      );
    } else {
      embeds.push(
        new EmbedBuilder()
          .setColor(0xffcc00)
          .setTitle("⚠️ Gráfico")
          .setDescription("Não consegui anexar a imagem agora. Confere permissão **Attach Files** no canal do dashboard.")
      );
    }

    DEBUG.stage = "upsert msg";

    // ==========================================================
    // ✅ BUSCA MENSAGEM EXISTENTE:
    // 1) tenta pelo ID salvo
    // 2) se falhar, procura no canal (pins + histórico) e salva o ID
    // ==========================================================
    let msg = null;

    if (st.dashboardMsgId) {
      msg = await dash.messages.fetch(st.dashboardMsgId).catch(() => null);
    }

    if (!msg) {
      DEBUG.stage = "recover existing msg";
      const found = await findExistingDashboardMessage(dash, client);

      if (found) {
        msg = found;
        st.dashboardMsgId = found.id;
        saveState(st);
        log("Recuperei msg antiga do dashboard ✅", { id: found.id });
      }
    }

    const payload = { content: "‎", embeds, files };

    if (!msg) {
      // não existe mesmo -> cria UMA e salva ID
      msg = await dash.send(payload).catch((e) => {
        DEBUG.error = "send falhou: " + String(e?.message || e);
        return null;
      });

      if (!msg) {
        DEBUG.stage = "failed send/edit";
        return;
      }

      st.dashboardMsgId = msg.id;
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

    // ✅ agora que deu certo, salva fingerprint + msgId (anti travamento)
    st.lastFingerprint = fingerprint;
    st.dashboardMsgId = msg.id;
    saveState(st);

    try {
      if (msg && !msg.pinned) await msg.pin().catch(() => {});
    } catch {}

    DEBUG.stage = "done";
    log("Dashboard atualizado ✅", {
      reason,
      thisKey,
      lastKey,
      totals: { curAll: curAll.total, prevAll: prevAll.total },
      pay: { cur: curPay.total, prev: prevPay.total },
      evt: { cur: curEvt.total, prev: prevEvt.total },
      chartPeriods: DEBUG.chartPeriods,
    });
  }

  async function safeUpdate(client, reason) {
    if (LOCK) {
      if (Date.now() - LOCK_TS > 120000) {
        console.warn("[SC_PAY_EVT_DASH] ⚠️ Lock travado. Resetando.");
        LOCK = false;
      } else {
        return;
      }
    }
    LOCK = true;
    LOCK_TS = Date.now();

    try {
      const r = String(reason || "").toLowerCase();
      const shouldForceScan =
        r.includes("manual") || r.includes("ready") || r.includes("reset") || r.includes("sunday");

      if (shouldForceScan) {
        CACHE.at = 0;
        CACHE.payload = null;
      }

      await upsertDashboard(client, reason);
    } catch (e) {
      console.error("[SC_PAY_EVT_DASH] safeUpdate error:", e);
    } finally {
      LOCK = false;
      LOCK_TS = 0;
    }
  }

  // =========================
  // Scheduler: próximo domingo 00:00 SP (zera na virada)
  // =========================
  function msUntilNextSunday00SP() {
    const n = nowSP();
    const { y, m, d } = ymdSP(n);

    const todayUTC = new Date(Date.UTC(y, m - 1, d));

    const wd = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(n);
    const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const dow = map[wd] ?? 0;

    const daysToNext = (7 - dow) % 7 || 7;
    const nextSundayUTC = new Date(todayUTC.getTime());
    nextSundayUTC.setUTCDate(nextSundayUTC.getUTCDate() + daysToNext);

    return Math.max(1, nextSundayUTC.getTime() - todayUTC.getTime());
  }

  function scheduleWeeklySundayMidnight(client) {
    const delay = msUntilNextSunday00SP();
    setTimeout(async () => {
      await safeUpdate(client, "weekly sunday 00:00 SP (reset)");
      setInterval(() => safeUpdate(client, "weekly interval"), 7 * 24 * 60 * 60 * 1000);
    }, delay);
  }

  // =========================
  // Debug text
  // =========================
  function debugText() {
    const dt = DEBUG.lastRunAt ? new Date(DEBUG.lastRunAt).toLocaleString("pt-BR", { timeZone: TZ }) : "nunca";

      const keysPayApproved =
      Object.entries(DEBUG.payPeriodFoundApproved || {})
        .sort((a, b) => (a[0] > b[0] ? -1 : 1))
        .slice(0, 12)
        .map(([k, v]) => `${k}=${v}`)
        .join(" • ") || "(nenhum)";

    const keysPayAll =
      Object.entries(DEBUG.payPeriodFoundAll || {})
        .sort((a, b) => (a[0] > b[0] ? -1 : 1))
        .slice(0, 12)
        .map(([k, v]) => `${k}=${v}`)
        .join(" • ") || "(nenhum)";

    const keysPayRejected =
      Object.entries(DEBUG.payPeriodFoundRejected || {})
        .sort((a, b) => (a[0] > b[0] ? -1 : 1))
        .slice(0, 12)
        .map(([k, v]) => `${k}=${v}`)
        .join(" • ") || "(nenhum)";


    const keysEvt =
      Object.entries(DEBUG.evtPeriodFound || {})
        .sort((a, b) => (a[0] > b[0] ? -1 : 1))
        .slice(0, 12)
        .map(([k, v]) => `${k}=${v}`)
        .join(" • ") || "(nenhum)";

    const chart =
      (DEBUG.chartPeriods || []).map((k) => `${k}(${labelFromPeriodKey(k)})`).join(" • ") || "(nenhum)";

    return [
      "🧾 **SC_PAY_EVT_DASH Debug (v4.1/hooks semanal)**",
      `• lastRun: **${dt}**`,
      `• reason: **${DEBUG.lastReason || "—"}**`,
      `• stage: **${DEBUG.stage || "—"}**`,
      `• dashMsgId: **${DEBUG.dashMsgId || "—"}**`,
      DEBUG.error ? `• ❌ error: **${DEBUG.error}**` : "• ✅ error: —",
      "",
        "💸 **Pagamentos**",
      `• scannedPayMsgs: **${DEBUG.scannedPayMsgs}**`,
      `• scannedPayRegs: **${DEBUG.scannedPayRegs}**`,
      `• payPeriodFoundApproved: ${keysPayApproved}`,
      `• payPeriodFoundAll: ${keysPayAll}`,
      `• payPeriodFoundRejected: ${keysPayRejected}`,

      "",
      "🎉 **Eventos (EVT3)**",
      `• evtPeriodFound: ${keysEvt}`,
      "",
      `• scannedEvtManualMsgs: **${DEBUG.scannedEvtManualMsgs}**`,
      "📊 **Chart (4 períodos)**",
      `• chartPeriods: ${chart}`,
      "",
          "🎯 **Regras Pagamentos**",
      `• OK: **${PAY_PERIOD_OK}**`,
      `• META: **${PAY_PERIOD_GOAL}**`,
      `• LIMITE: **${PAY_PERIOD_LIMIT}**`,

    ].join("\n");
  }

  // =========================
  // EXPORTS (hooks)
  // =========================
  export async function payEvtDashOnReady(client) {
    if (client.__SC_PAY_EVT_DASH_READY__) return;
    client.__SC_PAY_EVT_DASH_READY__ = true;

    log("hooks v4.1 instalado ✅ (semanal domingo 00:00)");
    
    // ✅ Atualiza gráfico ao aprovar cronograma
    dashOn("cronograma:aprovado", () => safeUpdate(client, "cronograma approved"));
    dashOn("halldafama:aprovado", () => safeUpdate(client, "halldafama approved")); // ✅ NOVO
    dashOn("eventosdiarios:aprovado", () => safeUpdate(client, "eventosdiarios approved")); // ✅ NOVO

    await safeUpdate(client, "ready");
    setInterval(() => safeUpdate(client, "interval 3min"), 3 * 60 * 1000);
    scheduleWeeklySundayMidnight(client);
  }

  export async function payEvtDashHandleMessage(message, client) {
    try {
      if (!message?.guild) return false;

      // ✅ DETECTA NOVO REGISTRO DE EVENTO (do bot) PRA ATUALIZAR NA HORA
      if (message.channelId === REGISTRO_EVENTO_CHANNEL_ID && message.author?.id === client.user.id) {
        setTimeout(() => safeUpdate(client, "new manual event log"), 1500);
        return false;
      }

      if (message.author?.bot) return false;
      const txt = (message.content || "").trim().toLowerCase();

      if (txt === "!pevdashrefresh") {
        await message.reply("🔄 Atualizando dashboard agora...").catch(() => {});
        await safeUpdate(client, "manual !pevdashrefresh");
        return true;
      }

      if (txt === "!pevdashdebug") {
        await message.reply({ content: debugText() }).catch(() => {});
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }
