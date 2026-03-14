import {
  EmbedBuilder,
  ButtonBuilder,
  ModalBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonStyle,
  Events
} from "discord.js";
import { dashEmit } from "../utils/dashHub.js";
/**
 * Inicializa o sistema de Bate Ponto (v3.12)
 * @param {import('discord.js').Client} client
 */
export default function setupBatePonto(client) {
  try {
    // ===== BLOQUEIA EXPORTS GLOBAIS DO GI (desacoplado) =====
    try {
      Object.defineProperty(globalThis, "SC_BP_getTotals", { value: undefined, writable: false, configurable: false });
      Object.defineProperty(globalThis, "SC_BP_getTotalsAll", { value: undefined, writable: false, configurable: false });
    } catch {}

    // ===== GUARD UNIVERSAL =====
    if (client.__SC_BP_ANY_ACTIVE) {
      console.log("[SC_BP] já ativo — pulando.");
      return;
    }
    client.__SC_BP_ANY_ACTIVE = true;

    // ===== CONFIG =====
    const CFG = Object.freeze({
  VERSION: "v3.12",
  TIMEZONE: "America/Sao_Paulo",

  // ✅ JANELAS DE BATE-PONTO
  // - 17:00–23:00 (23 exclusivo)
  // - 01:00–04:00 (04 exclusivo)
  WINDOWS: [
    { start: 17, end: 23 }, // 17..22
    { start: 1,  end: 4  }, // 01..03
  ],

  // ✅ REGRA DO "DIA" (pra não bater 2x atravessando a madrugada)
  // Se bater entre 01:00–03:59, conta como o "dia anterior" do turno.
  LATE_NIGHT_ROLLOVER_HOUR: 4,

  CHANNELS: {
    sm: "1417601634644525147",
    gestor: "1417601906305536101",
    manager: "1417602111495077920",
    coord: "1417602334036463656",
    responsaveis: "1425943893400227892",
    bateponto_log: "1427956344148852856",
    calendar: "1417602545953804328"
  },
  ROLES_ENV: "rolespermissionbateponto",
  CLEAR_ROLES_ENV: "rolespermissionbatepontoclear",
  GIF_ENV: "gifbateponto",
  ENABLE_CLEAR_BUTTON: false,
  FETCH_LIMIT: 100,
  BACKLOG_PAGES: 1000,
  PAGE_SOFT_LIMIT: 3800,
  KEYS: {
    BUTTON_PUNCH: "SC_BP_BTN_PUNCH",
    BUTTON_CLEAR_MONTH: "SC_BP_BTN_CLEAR",
    MODAL_ID: "SC_BP_MODAL",
    MODAL_NAME_ID: "SC_BP_MODAL_FIRSTNAME",
    STICKY_TAG: "[SC_BP_STICKY]",
    CAL_TAG: "[SC_BP_CALENDAR]",
    CAL_MENTION_TITLE: "📜 Linha do Tempo — Menções",
    CAL_NAME_TITLE: "🗒️ Linha do Tempo — Primeiro Nome"
  },
  COLORS: { primary: 0x8A2BE2, ok: 0x22C55E, warn: 0xF59E0B, err: 0xEF4444 }
});


    // ===== Helper de compat pra pins (fetchPins() vs fetchPinned()) =====
    function toMsgArray(pins) {
      if (!pins) return [];
      if (Array.isArray(pins.items)) return pins.items;
      if (typeof pins.forEach === "function" && typeof pins.values === "function") return [...pins.values()];
      if (Array.isArray(pins)) return pins;
      if (pins.messages && Array.isArray(pins.messages)) return pins.messages;
      return [];
    }

    async function fetchPinnedMessages(cal) {
      const mm = cal?.messages;
      if (!mm) return null;
      if (typeof mm.fetchPins === "function") return await mm.fetchPins().catch(() => null);
      if (typeof mm.fetchPinned === "function") return await mm.fetchPinned().catch(() => null);
      return null;
    }

    // ===== PERMISSÕES =====
    const EXTRA_ALLOWED_ROLES = [
      "1262262852949905408", // owner
      "660311795327828008",  // eu
      "1352429001188180039", // equipe creator
      "1352385500614234134", // coordenação
      "1414651836861907006", // responsaveis
      "1352408327983861844", // resp creators
      "1262262852949905409", // resp influ
      "1352407252216184833"  // resp lider
    ];

    const fromEnv = (name) =>
      (process.env[name] || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

    const ALLOWED = Array.from(new Set([...fromEnv(CFG.ROLES_ENV), ...EXTRA_ALLOWED_ROLES]));
    const CLEAR_ALLOWED = Array.from(
      new Set([
        ...(fromEnv(CFG.CLEAR_ROLES_ENV).length ? fromEnv(CFG.CLEAR_ROLES_ENV) : fromEnv(CFG.ROLES_ENV)),
        ...EXTRA_ALLOWED_ROLES
      ])
    );

    const hasAnyRole = (member, list) => {
      if (!member) return false;
      if (member.id === process.env.OWNER) return true;
      const roles = member.roles?.cache?.map((r) => r.id) || [];
      return list.some((rid) => roles.includes(rid));
    };
    const canClick = (m) => hasAnyRole(m, ALLOWED);
    const canClear = (m) => hasAnyRole(m, CLEAR_ALLOWED);

    // ===== GIF =====
    const GIF =
      process.env[CFG.GIF_ENV] ||
      "https://media.discordapp.net/attachments/1362477839944777889/1374893068649500783/standard_1.gif";

    // ===== TEMPO =====
    const MONTHS_PT = [
      "janeiro","fevereiro","março","abril","maio","junho",
      "julho","agosto","setembro","outubro","novembro","dezembro"
    ];

    const nowParts = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: CFG.TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  })
    .formatToParts(date)
    .reduce((a, p) => ((a[p.type] = p.value), a), {});

  const yyyy = +parts.year,
    mm = +parts.month,
    dd = +parts.day,
    hh = +parts.hour,
    mi = +parts.minute;

  return {
    yyyy,
    mm,
    dd,
    hh,
    mi,
    asKey: `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`,
    monthKey: `${yyyy}-${String(mm).padStart(2, "0")}`,
    monthHuman: `${String(mm).padStart(2, "0")}/${yyyy}`,
    monthName: MONTHS_PT[mm - 1]?.toUpperCase() || `${mm}`
  };
};

// ✅ "Dia efetivo" (pra travar 2x no mesmo turno atravessando a madrugada)
const effectiveKeyParts = () => {
  const real = nowParts(); // hora real (SP)
  // Se for 01:00–03:59, conta como dia anterior
  if (real.hh >= 0 && real.hh < CFG.LATE_NIGHT_ROLLOVER_HOUR) {
    const shifted = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return nowParts(shifted);
  }
  return real;
};

// ✅ Checa se está em qualquer janela
const withinWindow = () => {
  const { hh } = nowParts();
  return (CFG.WINDOWS || []).some((w) => hh >= w.start && hh < w.end);
};


    // ===== STATE (JSON pinnado por mês) =====
    let STATE = null;
    let LAST_SYNC_MONTHKEY = null;
    let STATE_MSG_ID = null;
    let SYNCING = false;

    const emptyMonth = (mk) => ({ monthKey: mk, days: {} });
    const ensureMonth = (mk) => {
      if (!STATE || STATE.monthKey !== mk) STATE = emptyMonth(mk);
    };
    const entryKey = (e) => `${e.uid}|${e.time}`;
    const addIfMissing = (dk, e) => {
      STATE.days[dk] ??= [];
      const has = STATE.days[dk].some((x) => entryKey(x) === entryKey(e));
      if (!has) STATE.days[dk].push(e);
      return !has;
    };
    const alreadyToday = (userId) => {
  const eff = effectiveKeyParts();
  ensureMonth(eff.monthKey);

  const dayKey = `${eff.monthKey}-${String(eff.dd).padStart(2, "0")}`;
  return (STATE.days[dayKey] || []).some((e) => e.uid === userId);
};


    const findOrCreateStateMsg = async (cal, monthKey) => {
      const sig = `"monthKey":"${monthKey}"`;
      let msg = null;

      const pins = await fetchPinnedMessages(cal);
      const pinList = toMsgArray(pins);
      if (pinList.length) {
        msg =
          pinList.find(
            (m) =>
              m.author?.id === client.user.id &&
              m.content?.startsWith("```json\n{") &&
              m.content.includes(sig)
          ) || null;
      }

      if (!msg) {
        const recent = await cal.messages.fetch({ limit: CFG.FETCH_LIMIT }).catch(() => null);
        if (recent?.size) {
          msg =
            [...recent.values()].find(
              (m) =>
                m.author?.id === client.user.id &&
                m.content?.startsWith("```json\n{") &&
                m.content.includes(sig)
            ) || null;
        }
      }

      if (!msg) {
        STATE = emptyMonth(monthKey);
        msg = await cal.send({ content: "```json\n" + JSON.stringify(STATE) + "\n```" }).catch(() => null);
        if (msg?.pin) await msg.pin().catch(() => {});
      } else {
        try {
          const disk = JSON.parse(msg.content.replace(/^```json\n/, "").replace(/\n```$/, ""));
          if (STATE && STATE.monthKey === monthKey) {
            for (const [day, arr] of Object.entries(STATE.days || {})) {
              disk.days[day] ??= [];
              for (const e of arr) {
                if (!(disk.days[day] || []).some((x) => entryKey(x) === entryKey(e))) disk.days[day].push(e);
              }
            }
          }
          STATE = disk;
          ensureMonth(monthKey);
          const fixed = "```json\n" + JSON.stringify(STATE) + "\n```";
          if (fixed !== msg.content) await msg.edit({ content: fixed }).catch(() => {});
          if (!msg.pinned && msg.pin) await msg.pin().catch(() => {});
        } catch {
          STATE = emptyMonth(monthKey);
          await msg.edit({ content: "```json\n" + JSON.stringify(STATE) + "\n```" }).catch(() => {});
          if (!msg.pinned && msg.pin) await msg.pin().catch(() => {});
        }
      }

      STATE_MSG_ID = msg?.id || null;
      return msg;
    };

    const persist = async (cal, monthKey) => {
      if (STATE_MSG_ID) {
        const msg = await cal.messages.fetch(STATE_MSG_ID).catch(() => null);
        if (msg) {
          await msg.edit({ content: "```json\n" + JSON.stringify(STATE) + "\n```" }).catch(() => {});
          if (!msg.pinned && msg.pin) await msg.pin().catch(() => {});
          return;
        }
      }

      await findOrCreateStateMsg(cal, monthKey);
      if (STATE_MSG_ID) {
        const msg = await cal.messages.fetch(STATE_MSG_ID).catch(() => null);
        if (msg) await msg.edit({ content: "```json\n" + JSON.stringify(STATE) + "\n```" }).catch(() => {});
      }
    };

    const getMonthState = async (cal, monthKey) => {
      try {
        const sig = `"monthKey":"${monthKey}"`;
        const pins = await fetchPinnedMessages(cal);
        const pinList = toMsgArray(pins);
        let msg = null;

        if (pinList.length) {
          msg =
            pinList.find(
              (m) =>
                m.author?.id === client.user.id &&
                m.content?.startsWith("```json\n{") &&
                m.content.includes(sig)
            ) || null;
        }

        if (!msg) {
          const recent = await cal.messages.fetch({ limit: 200 }).catch(() => null);
          if (recent?.size) {
            msg =
              [...recent.values()].find(
                (m) =>
                  m.author?.id === client.user.id &&
                  m.content?.startsWith("```json\n{") &&
                  m.content.includes(sig)
              ) || null;
          }
        }

        if (!msg) return { monthKey, days: {} };
        const parsed = JSON.parse(msg.content.replace(/^```json\n/, "").replace(/\n```$/, ""));
        return parsed?.monthKey === monthKey ? parsed : { monthKey, days: {} };
      } catch {
        return { monthKey, days: {} };
      }
    };

    // ===== UI =====
    const stickyEmbed = (team) =>
      new EmbedBuilder()
        .setColor(CFG.COLORS.primary)
        .setTitle(`🕒 Bater Ponto — ${team}`)
        .setDescription(
          "Clique entre **17:00 e 23:00** ou entre **01:00 e 04:00** e informe **apenas seu primeiro nome**.\nO registro vai direto para a **Linha do Tempo Oficial**."

        )
        .setImage(GIF)
        .setFooter({ text: `Sincronizado • SantaCreators • ${CFG.VERSION}` });

    const btnPunch = () =>
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(CFG.KEYS.BUTTON_PUNCH)
          .setStyle(ButtonStyle.Primary)
          .setEmoji("🟣")
          .setLabel("Bater Ponto")
      );

    const btnClear = () =>
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(CFG.KEYS.BUTTON_CLEAR_MONTH)
          .setStyle(ButtonStyle.Danger)
          .setEmoji("🧹")
          .setLabel("Limpar mês")
      );

    const embPunch = ({ user, channel, team, timeStr, name }) =>
      new EmbedBuilder()
        .setColor(CFG.COLORS.ok)
        .setAuthor({ name: `${user.username} bateu ponto`, iconURL: user.displayAvatarURL?.() || user.avatarURL?.() })
        .setDescription(
          `**Quem:** ${user}\n**Primeiro nome:** \`${name}\`\n**Equipe:** \`${team}\`\n**Canal:** <#${channel.id}>\n**Horário:** ${timeStr}\n\n✅ **Contabilizado no Ranking Geral**`
        )
        .setImage(GIF)
        .setFooter({ text: "Linha do Tempo atualizada ✔" });

    const warn = (m) => new EmbedBuilder().setColor(CFG.COLORS.warn).setDescription(`⚠️ ${m}`);
    const err = (m) => new EmbedBuilder().setColor(CFG.COLORS.err).setDescription(`❌ ${m}`);

    // ===== RENDER / CALENDÁRIO =====
    const lines = (mapper, mk) => {
      ensureMonth(mk);
      const keys = Object.keys(STATE.days)
        .filter((k) => k.startsWith(mk + "-"))
        .sort((a, b) => a.localeCompare(b))
        .reverse();
      const out = [];
      for (const k of keys) {
        const [, M, D] = k.split("-");
        for (const e of STATE.days[k] || []) out.push(`${D}/${M} — ${mapper(e)}`);
      }
      return out.length ? out : ["— sem registros neste mês —"];
    };

    const chunkLines = (prefix, ls, limit) => {
      const pages = [];
      let buf = "";
      for (const ln of ls) {
        const add = (buf ? "\n" : "") + prefix + ln;
        if ((buf + add).length > limit) {
          pages.push(buf);
          buf = prefix + ln;
        } else buf += add;
      }
      if (buf) pages.push(buf);
      if (!pages.length) pages.push(prefix + "— sem registros neste mês —");
      return pages;
    };

    const buildCalendarPages = (mk, mh, mname) => {
      const mentionLines = lines((e) => `${e.mention} • ${e.team} • ${(e.time || "").slice(11, 16)}`, mk);
      const mentionPages = chunkLines("• ", mentionLines, CFG.PAGE_SOFT_LIMIT).map((desc, i, arr) => {
        const tag = arr.length > 1 ? ` (p${i + 1}/${arr.length})` : "";
        const embed = new EmbedBuilder()
          .setColor(CFG.COLORS.primary)
          .setTitle(`${CFG.KEYS.CAL_MENTION_TITLE} — ${mh}${tag} ${CFG.KEYS.CAL_TAG}`)
          .setDescription(`${desc}\n\n**Formato:** dia — @menção • equipe • HH:MM\n**Mês:** ${mname}`)
          .setImage(GIF);

        const comps = i === 0 && CFG.ENABLE_CLEAR_BUTTON ? [btnClear()] : [];
        return { embed, components: comps };
      });

      const nameLines = lines((e) => `${(e.name || "").toUpperCase()} • ${e.team} • ${(e.time || "").slice(11, 16)}`, mk);
      const namePages = chunkLines("", nameLines, CFG.PAGE_SOFT_LIMIT - 16).map((chunk, i, arr) => {
        const tag = arr.length > 1 ? ` (p${i + 1}/${arr.length})` : "";
        return new EmbedBuilder()
          .setColor(CFG.COLORS.primary)
          .setTitle(`${CFG.KEYS.CAL_NAME_TITLE} — ${mh}${tag} ${CFG.KEYS.CAL_TAG}`)
          .setDescription("```\n" + chunk + "\n```\n**Formato:** dia — NOME • equipe • HH:MM\n**Mês:** " + mname)
          .setThumbnail(GIF);
      });

      return { mentionPages, namePages };
    };

    const collectPool = async (cal) => {
      const pool = new Map();
      const pins = await fetchPinnedMessages(cal);
      for (const m of toMsgArray(pins)) if (m?.id) pool.set(m.id, m);

      let lastId = undefined;
      for (let i = 0; i < CFG.BACKLOG_PAGES; i++) {
        const batch = await cal.messages.fetch({ limit: CFG.FETCH_LIMIT, before: lastId }).catch(() => null);
        if (!batch?.size) break;
        for (const m of batch.values()) pool.set(m.id, m);
        lastId = batch.last()?.id;
        if (!lastId) break;
      }
      return [...pool.values()];
    };

    const parseMonthHuman = (title = "") => (/—\s*(\d{2}\/\d{4})/.exec(title)?.[1] || null);
    const pageIdx = (title = "") => {
      const m = /\(p(\d+)\/(\d+)\)/.exec(title);
      return m ? { idx: +m[1], total: +m[2] } : { idx: 1, total: 1 };
    };

    const fetchMonthMessages = async (cal, mh) => {
      const all = (await collectPool(cal)).filter(
        (m) => m.author?.id === client.user.id && m.embeds?.[0]?.title?.includes(CFG.KEYS.CAL_TAG)
      );
      const isMention = (m) => m.embeds?.[0]?.title?.includes(CFG.KEYS.CAL_MENTION_TITLE);
      const isName = (m) => m.embeds?.[0]?.title?.includes(CFG.KEYS.CAL_NAME_TITLE);
      const sameMonth = (m) => parseMonthHuman(m.embeds?.[0]?.title || "") === mh;
      return { mention: all.filter((m) => isMention(m) && sameMonth(m)), name: all.filter((m) => isName(m) && sameMonth(m)), all };
    };

    const dedupeAllMonths = async (cal) => {
      const { monthHuman: curMH } = nowParts();
      const all = (await collectPool(cal)).filter(
        (m) => m.author?.id === client.user.id && m.embeds?.[0]?.title?.includes(CFG.KEYS.CAL_TAG)
      );
      const groups = {};
      for (const m of all) {
        const t = m.embeds?.[0]?.title || "";
        const mh = parseMonthHuman(t);
        if (!mh) continue;
        const kind = t.includes(CFG.KEYS.CAL_MENTION_TITLE) ? "mention" : t.includes(CFG.KEYS.CAL_NAME_TITLE) ? "name" : null;
        if (!kind) continue;
        const { idx } = pageIdx(t);
        groups[mh] ??= { mention: {}, name: {} };
        groups[mh][kind][idx] ??= [];
        groups[mh][kind][idx].push(m);
      }

      let del = 0;
      for (const [mh, perKind] of Object.entries(groups)) {
        const keepNewest = mh === curMH;
        for (const kind of ["mention", "name"]) {
          for (const arr of Object.values(perKind[kind])) {
            arr.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
            const chosen = keepNewest ? arr[arr.length - 1] : arr[0];
            for (const msg of arr) {
              if (msg.id !== chosen.id) {
                await msg.delete().catch(() => {});
                del++;
              }
            }
          }
        }
      }
      if (del) console.log(`[SC_BP] dedupe: removidas ${del} mensagens duplicadas.`);
    };

    // ===== RECOVERY (mantido) =====
    const parseConfirm = (emb) => {
      const parts = [];
      if (emb?.title) parts.push(String(emb.title));
      if (emb?.description) parts.push(String(emb.description));
      const flds = Array.isArray(emb?.fields) ? emb.fields : [];
      for (const f of flds) {
        if (f?.name) parts.push(String(f.name));
        if (f?.value) parts.push(String(f.value));
      }
      if (emb?.footer?.text) parts.push(String(emb.footer.text));

      const txt = parts.join("\n").replace(/\*\*/g, "").replace(/__/g, "");

      let uid = /<@!?(?<id>\d+)>/.exec(txt)?.groups?.id || null;
      const name = /Primeiro\s*nome:\s*`?([^`\n]+)`?/i.exec(txt)?.[1]?.trim() || "";
      const team = /Equipe:\s*`?([^`\n]+)`?/i.exec(txt)?.[1]?.trim() || "";
      const mTime = /Hor[aá]rio\s*:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/i.exec(txt);
      const timeStr = mTime
        ? `${String(mTime[1]).padStart(2, "0")}/${String(mTime[2]).padStart(2, "0")}/${mTime[3]} ${String(mTime[4]).padStart(2, "0")}:${mTime[5]}`
        : null;

      let authorName = "";
      const a = /^(.+?)\s+bateu ponto/i.exec(emb?.author?.name || "");
      if (a) authorName = (a[1] || "").trim();

      if (!uid && timeStr) {
        const base = (name || authorName || "USER").toUpperCase();
        uid = `synthetic:${base}|${timeStr}`;
      }

      return uid && timeStr ? { uid, name, team, timeStr, authorName } : { uid: null };
    };

    function timeStrKeys(timeStr) {
      const m = /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/.exec(timeStr || "");
      if (!m) return null;
      const [, DD, MM, YYYY] = m;
      const mm = String(MM).padStart(2, "0");
      const dd = String(DD).padStart(2, "0");
      return { monthKey: `${YYYY}-${mm}`, dayKey: `${YYYY}-${mm}-${dd}`, monthHuman: `${mm}/${YYYY}` };
    }

    const recoverFromLogs = async ({ monthKey, todayOnly = false }) => {
      const LOG_ZERO = process.env.SC_BP_LOG_ZERO === "1";

      const infoList = [
        { id: CFG.CHANNELS.sm, label: "Social Medias" },
        { id: CFG.CHANNELS.gestor, label: "Gestor" },
        { id: CFG.CHANNELS.manager, label: "Manager" },
        { id: CFG.CHANNELS.coord, label: "Coordenação" },
        { id: CFG.CHANNELS.responsaveis, label: "Responsáveis" },
        { id: CFG.CHANNELS.bateponto_log, label: "Bate-Ponto" }
      ];

      let added = 0;
      ensureMonth(monthKey);

      for (const info of infoList) {
        const ch = await client.channels.fetch(info.id).catch(() => null);
        if (!ch) continue;

        let scans = 0, matches = 0, addedHere = 0;
        let lastId = undefined;

        for (let page = 0; page < CFG.BACKLOG_PAGES; page++) {
          const batch = await ch.messages.fetch({ limit: CFG.FETCH_LIMIT, before: lastId }).catch(() => null);
          if (!batch?.size) break;
          lastId = batch.last()?.id;

          for (const m of batch.values()) {
            const emb = m.embeds?.[0];
            if (!emb) continue;
            scans++;

            const parsed = parseConfirm(emb);
            if (!parsed?.uid || !parsed.timeStr) continue;
            matches++;

            if (todayOnly) {
              const { yyyy, mm, dd } = nowParts();
              const todayStr = `${String(dd).padStart(2, "0")}/${String(mm).padStart(2, "0")}/${yyyy}`;
              if (!parsed.timeStr.startsWith(todayStr)) continue;
            }

            const tk = timeStrKeys(parsed.timeStr);
            if (!tk || tk.monthKey !== monthKey) continue;

            const entry = {
              uid: parsed.uid,
              mention: /^\d+$/.test(parsed.uid) ? `<@${parsed.uid}>` : parsed.name || parsed.authorName || "—",
              name: (parsed.name || parsed.authorName || "").trim(),
              time: parsed.timeStr,
              team: parsed.team || info.label
            };

            if (addIfMissing(tk.dayKey, entry)) {
              added++;
              addedHere++;
            }
          }

          if (!lastId) break;
        }

        if (LOG_ZERO || addedHere > 0) {
          // console.log(`[SC_BP] recover ${monthKey} — ${info.label}: msgs=${scans}, matches=${matches}, added=${addedHere}`);
        }
      }

      // if (LOG_ZERO || added > 0) console.log(`[SC_BP] recovery ${monthKey}${todayOnly ? " (today)" : ""}: +${added}`);
      return added;
    };

    // ===== SYNC mês atual =====
    const syncMonth = async () => {
      if (SYNCING) return null;
      SYNCING = true;
      try {
        const { monthKey, monthHuman, monthName } = nowParts();
        const cal = await client.channels.fetch(CFG.CHANNELS.calendar).catch(() => null);
        if (!cal) return null;

        if (!STATE || STATE.monthKey !== monthKey || !STATE_MSG_ID) await findOrCreateStateMsg(cal, monthKey);

         // await findOrCreateStateMsg(cal, monthKey);

        if (!STATE || STATE.monthKey !== monthKey || !STATE_MSG_ID) {
          await findOrCreateStateMsg(cal, monthKey);
        }
        const { mentionPages, namePages } = buildCalendarPages(monthKey, monthHuman, monthName);
        const found = await fetchMonthMessages(cal, monthHuman);

        const sortByPage = (arr) =>
          arr.sort((a, b) => pageIdx(a.embeds?.[0]?.title || "").idx - pageIdx(b.embeds?.[0]?.title || "").idx);

        const mentionExisting = sortByPage(found.mention);
        const nameExisting = sortByPage(found.name);

        for (let i = 0; i < mentionPages.length; i++) {
          const pg = mentionPages[i];
          if (mentionExisting[i]) await mentionExisting[i].edit({ embeds: [pg.embed], components: pg.components }).catch(() => {});
          else await cal.send({ embeds: [pg.embed], components: pg.components }).catch(() => {});
        }

        for (let i = 0; i < namePages.length; i++) {
          const pg = namePages[i];
          if (nameExisting[i]) await nameExisting[i].edit({ embeds: [pg] }).catch(() => {});
          else await cal.send({ embeds: [pg] }).catch(() => {});
        }

        await dedupeAllMonths(cal);
        await persist(cal, monthKey);

        try {
          if (LAST_SYNC_MONTHKEY && LAST_SYNC_MONTHKEY !== monthKey) {
            const prev = LAST_SYNC_MONTHKEY;
            const prevState = await getMonthState(cal, prev);
            if (prevState && Object.keys(prevState.days || {}).length) await uploadMonthArtifacts(cal, prevState);
          }
          LAST_SYNC_MONTHKEY = monthKey;
        } catch (e) {
          console.error("[SC_BP] month rollover export error:", e);
        }

        return { cal };
      } finally {
        SYNCING = false;
      }
    };

    // ===== STICKY (DESCE A CADA REGISTRO) =====
    const STICKY_MSG_IDS = new Map(); // channelId -> messageId

    const deleteKnownSticky = async (channel) => {
      const mid = STICKY_MSG_IDS.get(channel.id);
      if (mid) {
        const m = await channel.messages.fetch(mid).catch(() => null);
        if (m) await m.delete().catch(() => {});
      }

      // fallback: limpa stickies nossos recentes (se perdeu o id)
      const msgs = await channel.messages.fetch({ limit: 50 }).catch(() => null);
      if (msgs) {
        const ours = [...msgs.values()].filter(
          (m) => m.author?.id === client.user.id && (m.content || "").includes(CFG.KEYS.STICKY_TAG)
        );
        for (const m of ours) await m.delete().catch(() => {});
      }
    };

    const sendNewSticky = async (channel, label) => {
      const embed = stickyEmbed(label);
      const row = btnPunch();
      const sent = await channel.send({ content: CFG.KEYS.STICKY_TAG, embeds: [embed], components: [row] }).catch(() => null);
      if (sent?.id) STICKY_MSG_IDS.set(channel.id, sent.id);
      return sent;
    };

    // 👉 usado no boot (apaga antigo e manda novo)
    const ensureStickyOnBoot = async (channel, label) => {
      await deleteKnownSticky(channel);
      await sendNewSticky(channel, label);
    };

    // 👉 usado NO REGISTRO: apaga sticky antigo e manda novo no final (desce)
    const refreshStickyOnPunch = async (channel, label) => {
      await deleteKnownSticky(channel);
      await sendNewSticky(channel, label);
    };

    // ===== Bootstrap + keeper =====
    const PAIRS = [
      { id: CFG.CHANNELS.sm, label: "Social Medias" },
      { id: CFG.CHANNELS.gestor, label: "Gestor" },
      { id: CFG.CHANNELS.manager, label: "Manager" },
      { id: CFG.CHANNELS.coord, label: "Coordenação" },
      { id: CFG.CHANNELS.responsaveis, label: "Responsáveis" }
    ];

    const boot = async () => {
      for (const p of PAIRS) {
        const ch = await client.channels.fetch(p.id).catch(() => null);
        if (ch) await ensureStickyOnBoot(ch, p.label);
      }

      const { monthKey } = nowParts();
      await recoverFromLogs({ monthKey, todayOnly: false });
      await syncMonth();
    };

    // (mantém teu supervisor, mas SEM ficar mexendo no sticky)
    const supervise = async () => {
      const { monthKey } = nowParts();
      await recoverFromLogs({ monthKey, todayOnly: false });
      await syncMonth();
    };

    client.once(Events.ClientReady, async () => {
      // console.log(`[SC_BP] ${CFG.VERSION} pronto. userId=${client.user?.id}`);
      await boot();
      setInterval(supervise, 2 * 60 * 1000);
    });

    // ===== Comandos =====
    client.on(Events.MessageCreate, async (msg) => {
      try {
        const m = /^!scbp\s+recover(?:\s+(.+))?/i.exec(msg.content || "");
        if (!m) return;
        if (!canClear(msg.member)) return;

        const arg = (m[1] || "").trim();
        let added = 0;

        if (!arg) {
          const { monthKey } = nowParts();
          added = await recoverFromLogs({ monthKey, todayOnly: false });
        } else if (/^today$/i.test(arg)) {
          const { monthKey } = nowParts();
          added = await recoverFromLogs({ monthKey, todayOnly: true });
        } else if (/^\d{4}-\d{2}$/.test(arg)) {
          added = await recoverFromLogs({ monthKey: arg, todayOnly: false });
        } else {
          return msg.reply("uso: `!scbp recover` | `!scbp recover today` | `!scbp recover YYYY-MM`").catch(() => {});
        }

        await syncMonth();
        msg.reply(`✅ Recovery concluído: adicionados **${added}** registro(s).`).catch(() => {});
      } catch (e) {
        console.error("[SC_BP] recover cmd error:", e);
      }
    });

    // ===== Interações =====
    client.on(Events.InteractionCreate, async (it) => {
      try {
        // ✅ ISENÇÃO DE REGRAS (HORÁRIO E LIMITE)
        const isBypassUser = it.user.id === "660311795327828008";

        if (it.isButton() && it.customId === CFG.KEYS.BUTTON_PUNCH) {
          if (!canClick(it.member)) return it.reply({ ephemeral: true, embeds: [err("Você não tem permissão para bater ponto aqui.")] });
          if (!withinWindow() && !isBypassUser) {
  return it.reply({
    ephemeral: true,
    embeds: [warn("Bate-ponto disponível **das 17:00 às 23:00** e **das 01:00 às 04:00**.")]
  });
}

          if (alreadyToday(it.user.id) && !isBypassUser) return it.reply({ ephemeral: true, embeds: [warn("Você já bateu ponto hoje.")] });

          const modal = new ModalBuilder().setCustomId(CFG.KEYS.MODAL_ID).setTitle("Bater Ponto — Primeiro Nome");
          const input = new TextInputBuilder()
            .setCustomId(CFG.KEYS.MODAL_NAME_ID)
            .setLabel("Seu primeiro nome (ex.: Macedo)")
            .setMinLength(2)
            .setMaxLength(16)
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder("Ex.: Macedo");

          modal.addComponents(new ActionRowBuilder().addComponents(input));
          await it.showModal(modal);
          return;
        }

        if (it.isModalSubmit() && it.customId === CFG.KEYS.MODAL_ID) {
          const firstName = (it.fields.getTextInputValue(CFG.KEYS.MODAL_NAME_ID) || "")
            .trim()
            .split(/\s+/)[0]
            .slice(0, 16);

          if (!firstName || firstName.length < 2) return it.reply({ ephemeral: true, embeds: [err("Nome inválido. Tente novamente.")] });
          if (!withinWindow() && !isBypassUser) {
  return it.reply({
    ephemeral: true,
    embeds: [warn("Bate-ponto disponível **das 17:00 às 23:00** e **das 01:00 às 04:00**.")]
  });
}

          if (alreadyToday(it.user.id) && !isBypassUser) return it.reply({ ephemeral: true, embeds: [warn("Você já bateu ponto hoje.")] });

          let team = "Social Medias";
          const chId = it.channelId;
          if (chId === CFG.CHANNELS.gestor) team = "Gestor";
          else if (chId === CFG.CHANNELS.manager) team = "Manager";
          else if (chId === CFG.CHANNELS.coord) team = "Coordenação";
          else if (chId === CFG.CHANNELS.responsaveis) team = "Responsáveis";

          const real = nowParts();              // ✅ hora real do registro (SP)
const eff = effectiveKeyParts();      // ✅ chave do "dia do turno" (trava 2x)

// ✅ FIX CRÍTICO
const { monthKey } = eff;

ensureMonth(monthKey);

const timeStr =
  `${String(real.dd).padStart(2, "0")}/${String(real.mm).padStart(2, "0")}/${real.yyyy} ` +
  `${String(real.hh).padStart(2, "0")}:${String(real.mi)}`;

// ✅ dayKey do "dia efetivo" (01:00–03:59 conta como dia anterior)
const dayKey = `${monthKey}-${String(eff.dd).padStart(2, "0")}`;

addIfMissing(dayKey, {
  uid: it.user.id,
  mention: `<@${it.user.id}>`,
  name: firstName,
  time: timeStr,
  team
});

await it.reply({
  embeds: [embPunch({ user: it.user, channel: it.channel, team, timeStr, name: firstName })]
}).catch(() => {});

// ✅ desce o botão
await refreshStickyOnPunch(it.channel, team);

// ✅ agora monthKey EXISTE
const cal = await client.channels.fetch(CFG.CHANNELS.calendar).catch(() => null);
if (cal) await persist(cal, monthKey);

// ✅ atualiza as mensagens de “Linha do Tempo”
await syncMonth();

// ✅ HUB só depois de tudo persistido
try {
  dashEmit("bp:punch", {
    userId: it.user.id,
    team,
    timeStr,
    __at: Date.now(),
  });
} catch (e) {
  console.error("[SC_BP] dashEmit bp:punch error:", e);
}

return;


        }


        

        if (it.isButton() && it.customId === CFG.KEYS.BUTTON_CLEAR_MONTH) {
          if (!canClear(it.member)) return it.reply({ ephemeral: true, embeds: [err("Sem permissão para limpar o mês.")] });

          const { monthKey } = nowParts();
          STATE = emptyMonth(monthKey);

          const cal = await client.channels.fetch(CFG.CHANNELS.calendar).catch(() => null);
          if (cal) await persist(cal, monthKey);
          await syncMonth();

          return it.reply({ ephemeral: true, embeds: [warn("Calendário do mês **limpo** com sucesso.")] });
        }
      } catch (e) {
        console.error("[SC_BP] interaction error:", e);
        if (it?.replied || it?.deferred) {
          try { await it.followUp({ ephemeral: true, embeds: [err("Erro inesperado. Tente novamente.")] }); } catch {}
        } else {
          try { await it.reply({ ephemeral: true, embeds: [err("Erro inesperado. Tente novamente.")] }); } catch {}
        }
      }
    });

    async function uploadMonthArtifacts(cal, state) {
      try {
        const fnameBase = `SC_BP_${state.monthKey}`;
        const jsonBuf = Buffer.from(JSON.stringify(state, null, 2));
        const csvBuf = Buffer.from(stateToCSV(state));
        const sent = await cal
          .send({
            content: `📦 Arquivos do mês \`${state.monthKey}\``,
            files: [
              { attachment: jsonBuf, name: `${fnameBase}.json` },
              { attachment: csvBuf, name: `${fnameBase}.csv` }
            ]
          })
          .catch(() => null);
        if (sent?.pin) await sent.pin().catch(() => {});
      } catch (e) {
        console.error("[SC_BP] uploadMonthArtifacts error:", e);
      }
    }

    function stateToCSV(state) {
      const rows = [["dayKey", "uid", "mention", "name", "team", "time"]];
      const days = Object.keys(state?.days || {}).sort();
      for (const dayKey of days) {
        for (const e of state.days[dayKey] || []) {
          rows.push([dayKey, e.uid, e.mention || "", e.name || "", e.team || "", e.time || ""]);
        }
      }
      return rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n");
    }
  } catch (e) {
    console.error("[SC_BP] falha ao instalar v3.12:", e);
  }
}
