// application/events/lembretes/lembretePoderes.js
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ChannelType, PermissionFlagsBits, EmbedBuilder } from "discord.js";
// ✅ __dirname no ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ mesmo arquivo de state usado pelo registro
const PODERES_STATE_PATH = path.resolve(__dirname, "../../data/poderes_reminder_state.json");

function readPoderesState() {
  try {
    const raw = fs.readFileSync(PODERES_STATE_PATH, "utf8");
    const json = JSON.parse(raw);
    if (!json || typeof json !== "object") return { users: {} };
    if (!json.users || typeof json.users !== "object") json.users = {};
    return json;
  } catch {
    return { users: {} };
  }
}

function writePoderesState(state) {
  try {
    const dir = path.dirname(PODERES_STATE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const tmp = PODERES_STATE_PATH + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), "utf8");
    fs.renameSync(tmp, PODERES_STATE_PATH);
  } catch {}
}


export function startLembretePoderes(client) {
  if (globalThis.__LEMBRETE_PODERES_LOADED__) return;
  globalThis.__LEMBRETE_PODERES_LOADED__ = true;

  const PODERES_ROLE_ID = '1371733765243670538';
  const PODERES_CANAL_PUBLICO_ID = '1410688804226076785';
  const PODERES_REGISTRO_LINK = 'https://discord.com/channels/1262262852782129183/1374066813171929218';
  const PODERES_GIF_URL = 'https://media.discordapp.net/attachments/1362477839944777889/1384245215249825832/standard_2rss.gif?ex=68b14f11&is=68affd91&hm=29acdca41f5165a3688ef1f9fdddfd7b23511eb2d9665ec104495e97d4cd2aab&=&width=515&height=66';
  const PODERES_LOG_DM_CHANNEL_ID = '1411801178014220348';

  const PODERES_DM_HOURS = [11, 17];

    // ✅ Canal REAL onde o registro acontece (pelo teu link)
  // link: https://discord.com/channels/1262262852782129183/1374066813171929218
  const PODERES_REGISTRO_CHANNEL_ID = "1374066813171929218";

    function extractUserIdFromRegistroMessage(message) {
    try {
      const embed = message.embeds?.[0];
      if (embed) {
        // 0) author.name (muito comum em embeds “bonitos”)
        const authorName = String(embed.author?.name || "");
        let m = authorName.match(/<@!?(\d{10,30})>/);
        if (m) return m[1];

        // 1) fields
        if (Array.isArray(embed.fields)) {
          for (const f of embed.fields) {
            const name = String(f?.name || "").toLowerCase();
            const value = String(f?.value || "");

            // tenta achar menção direto
            m = value.match(/<@!?(\d{10,30})>/);
            if (m) return m[1];

            // às vezes o "Criado por" vem no próprio name
            m = name.match(/<@!?(\d{10,30})>/);
            if (m) return m[1];

            // se estiver escrito “Criado por” mas sem menção (só texto),
            // tenta puxar ID da tag do usuário se vier no value (alguns bots colocam ID puro)
            if (name.includes("criado por") || name.includes("created by")) {
              m = value.match(/(\d{10,30})/);
              if (m) return m[1];
            }
          }
        }

        // 2) description
        const desc = String(embed.description || "");
        m = desc.match(/<@!?(\d{10,30})>/);
        if (m) return m[1];
        m = desc.match(/(\d{10,30})/);
        if (m) return m[1];

        // 3) title
        const title = String(embed.title || "");
        m = title.match(/<@!?(\d{10,30})>/);
        if (m) return m[1];

        // 4) footer
        const footer = String(embed.footer?.text || "");
        m = footer.match(/<@!?(\d{10,30})>/);
        if (m) return m[1];
        m = footer.match(/(\d{10,30})/);
        if (m) return m[1];
      }

      // Fallback: content
      const content = String(message.content || "");
      let mc = content.match(/<@!?(\d{10,30})>/);
      if (mc) return mc[1];
      mc = content.match(/(\d{10,30})/);
      if (mc) return mc[1];

      return null;
    } catch {
      return null;
    }
  }

  function markRegistered(userId, tsMs = Date.now()) {
    const state = readPoderesState();
    if (!state.users[userId]) state.users[userId] = {};

    const u = state.users[userId];

    // se nunca tinha aparecido, marca firstSeen também
    if (!u.firstSeenAt) u.firstSeenAt = tsMs;

    // ✅ o ponto principal: registra o último registro
    u.lastRegisterAt = tsMs;

    // ✅ reseta o ciclo de lembrete
    // (pra não ficar travado em "mandei DM ontem" depois do registro)
    u.lastReminderAt = 0;

    writePoderesState(state);
  }

   function isRegistroChannelOrThread(message) {
    if (message.channelId === PODERES_REGISTRO_CHANNEL_ID) return true;

    const ch = message.channel;
    if (!ch) return false;

    // thread de fórum/texto: tem parentId
    if (typeof ch.parentId === "string" && ch.parentId === PODERES_REGISTRO_CHANNEL_ID) return true;

    return false;
  }

  // ✅ escuta registros em tempo real
  client.on("messageCreate", (message) => {
    try {
      if (!message || !message.guild) return;

      // só no canal de registro (ou threads dele)
      if (!isRegistroChannelOrThread(message)) return;

      // ignora msgs sem embed (normalmente o registro do "APP" vem com embed bonitão)
      if (!message.embeds || message.embeds.length === 0) return;

      // tenta extrair o userId do "Criado por"
      const userId = extractUserIdFromRegistroMessage(message);
      if (!userId) return;

      console.log(
        "[LembretesPoderes] Registro detectado:",
        "channelId=", message.channelId,
        "parentId=", message.channel?.parentId,
        "userId=", userId
      );


      // ✅ marca como registrado AGORA
      markRegistered(userId, Date.now());
    } catch {}
  });

  function buildDM24(userId, hours) {
  return (
    `👀 Oi vida <@${userId}>!\n\n` +
    `⏳ Você tá **há ${hours}h** sem registrar seus poderes.\n` +
    `📌 Lembra que o registro é **obrigatório** pra manter tudo certinho.\n\n` +
    `✅ Se você **usou poderes**, registra normal.\n` +
    `📝 Se você **não usou / nem logou**, registra mesmo assim e escreve algo tipo: **"não usei"**.\n` +
    `Assim eu sei que foi 0 uso e **paro de te encher o saco** 😭💜\n\n` +
    `⚡ Registra aqui agora:\n` +
    `🔗 ${PODERES_REGISTRO_LINK}`
  );
}

function buildDM48(userId, hours) {
  return (
    `🚨 Aí <@${userId}>… vem cá 😭💜\n\n` +
    `⏳ Você já tá **há ${hours}h (mais de 48h)** sem registrar seus poderes.\n\n` +
    `🤔 Você **esqueceu**? Ou você **nem entrou na cidade / não usou poderes**?\n` +
    `✅ Se não usou, vai lá e registra: **"não usei"**.\n` +
    `📌 Isso me ajuda a identificar e eu **paro de mandar lembrete toda hora** 🙏\n\n` +
    `⚡ Link do registro:\n` +
    `🔗 ${PODERES_REGISTRO_LINK}\n\n` +
    `Vai lá vida, rapidinho 😘✨`
  );
}


    // ✅ timezone fixo (SP), independente do host
  const TZ = "America/Sao_Paulo";

  function getTZParts(date, timeZone) {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

    const parts = dtf.formatToParts(date);
    const map = {};
    for (const p of parts) {
      if (p.type !== "literal") map[p.type] = p.value;
    }

    return {
      year: Number(map.year),
      month: Number(map.month),
      day: Number(map.day),
      hour: Number(map.hour),
      minute: Number(map.minute),
      second: Number(map.second),
    };
  }

  function getTZOffsetMinutes(date, timeZone) {
    // Node moderno costuma suportar "shortOffset" (GMT-3, GMT-2, etc)
    // Se não suportar, cai no fallback (não costuma acontecer)
    try {
      const dtf = new Intl.DateTimeFormat("en-US", {
        timeZone,
        timeZoneName: "shortOffset",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      const parts = dtf.formatToParts(date);
      const tzName = parts.find(p => p.type === "timeZoneName")?.value || "GMT+0";

      // tzName exemplo: "GMT-3" ou "GMT-03:00" ou "GMT+02"
      const m = tzName.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/i);
      if (!m) return 0;

      const sign = m[1] === "-" ? -1 : 1;
      const hh = Number(m[2] || 0);
      const mm = Number(m[3] || 0);
      return sign * (hh * 60 + mm);
    } catch {
      return 0;
    }
  }

  function addDaysYMD({ year, month, day }, addDays) {
    const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0)); // meio-dia UTC evita edge cases
    d.setUTCDate(d.getUTCDate() + addDays);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
  }

  function zonedTimeToUtcEpochMs({ year, month, day, hour, minute, second }, timeZone) {
    // Faz uma conversão robusta (2 iterações) pra lidar com offset/DST
    const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second, 0);
    let guessDate = new Date(utcGuess);

    let offset1 = getTZOffsetMinutes(guessDate, timeZone);
    let utc1 = utcGuess - offset1 * 60 * 1000;

    let guessDate2 = new Date(utc1);
    let offset2 = getTZOffsetMinutes(guessDate2, timeZone);
    let utc2 = utcGuess - offset2 * 60 * 1000;

    return utc2;
  }

  function msUntilSP(targetHour, targetMinute = 0, targetSecond = 0) {
    const now = new Date();

    const nowSP = getTZParts(now, TZ);

    // monta alvo no "hoje SP"
    let ymd = { year: nowSP.year, month: nowSP.month, day: nowSP.day };
    const nowSec = nowSP.hour * 3600 + nowSP.minute * 60 + nowSP.second;
    const targetSec = targetHour * 3600 + targetMinute * 60 + targetSecond;

    // se já passou no horário SP de hoje, joga pra amanhã SP
    if (targetSec <= nowSec) {
      ymd = addDaysYMD(ymd, 1);
    }

    const targetEpoch = zonedTimeToUtcEpochMs(
      {
        year: ymd.year,
        month: ymd.month,
        day: ymd.day,
        hour: targetHour,
        minute: targetMinute,
        second: targetSecond,
      },
      TZ
    );

    return targetEpoch - now.getTime();
  }

  function msUntilNextTopOfHourSP() {
    const now = new Date();
    const nowSP = getTZParts(now, TZ);

    let nextHour = nowSP.hour + 1;
    let ymd = { year: nowSP.year, month: nowSP.month, day: nowSP.day };

    if (nextHour >= 24) {
      nextHour = 0;
      ymd = addDaysYMD(ymd, 1);
    }

    const targetEpoch = zonedTimeToUtcEpochMs(
      {
        year: ymd.year,
        month: ymd.month,
        day: ymd.day,
        hour: nextHour,
        minute: 0,
        second: 0,
      },
      TZ
    );

    return targetEpoch - now.getTime();
  }

  async function logDMToChannel(userId, content, embeds, { dmOk = true } = {}) {
    try {
      const canalLog = await client.channels.fetch(PODERES_LOG_DM_CHANNEL_ID).catch(() => null);
      if (!canalLog) return;

      const ts = Math.floor(Date.now() / 1000);
      const header = dmOk
        ? `🧾 **Log DM enviada** — para <@${userId}> • <t:${ts}:f>`
        : `🧾 **Tentativa de DM (falhou)** — para <@${userId}> • <t:${ts}:f>`;

      await canalLog.send({ content: header, allowedMentions: { parse: [], repliedUser: false } }).catch(() => null);
      await canalLog.send({ content, embeds, allowedMentions: { parse: [], repliedUser: false } }).catch(() => null);
    } catch {}
  }

  async function enviarAvisoPublico() {
    try {
      const canal = await client.channels.fetch(PODERES_CANAL_PUBLICO_ID).catch(() => null);
      if (!canal || canal.type !== ChannelType.GuildText) return;

      const perms = canal.permissionsFor(client.user.id);
      if (perms?.has(PermissionFlagsBits.ManageMessages)) {
        const msgs = await canal.messages.fetch({ limit: 100 }).catch(() => null);
        if (msgs) {
          const minhas = msgs.filter(m => m.author?.id === client.user.id);
          for (const [, m] of minhas) await m.delete().catch(() => null);
        }
      }

      const embed = new EmbedBuilder()
        .setDescription(
`⚠ LEMBRE-SE DE REGISTRAR OS PODERES! ⚠

📌 É permanente e **obrigatório** realizar o registro de poderes no canal ${PODERES_REGISTRO_LINK}

❌ O **não** cumprimento resultará em restrição imediata, ficando **sem poderes** fora dos eventos.

✅ Garanta sua regularidade: **registre agora o seu uso de poderes!**`
        )
        .setImage(PODERES_GIF_URL);

      await canal.send({
        content: `<@&${PODERES_ROLE_ID}>`,
        embeds: [embed],
        allowedMentions: { parse: [], roles: [PODERES_ROLE_ID], repliedUser: false }
      });
    } catch (err) {
      console.error('[LembretesPoderes] Erro canal público:', err);
    }
  }

    async function enviarDMs() {
    try {
      const canalRef = await client.channels.fetch(PODERES_CANAL_PUBLICO_ID).catch(() => null);
      if (!canalRef?.guild) return;
      const guild = canalRef.guild;

      // garante membros em cache (pra cargo.members vir preenchido)
      await guild.members.fetch().catch(() => null);

      const cargo = await guild.roles.fetch(PODERES_ROLE_ID).catch(() => null);
      if (!cargo) return;

      const state = readPoderesState();
      const now = Date.now();

      const membros = cargo.members;

      let enviados = 0;
      let pulados = 0;

      for (const [, member] of membros) {
        const uid = member.id;

        if (!state.users[uid]) state.users[uid] = {};
        const u = state.users[uid];

        // ✅ primeira vez que o bot “vê” esse usuário: marca e NÃO manda DM agora
        if (!u.firstSeenAt) {
          u.firstSeenAt = now;
          pulados++;
          continue;
        }

        const lastReg = typeof u.lastRegisterAt === "number" && u.lastRegisterAt > 0 ? u.lastRegisterAt : null;
        const lastRem = typeof u.lastReminderAt === "number" && u.lastReminderAt > 0 ? u.lastReminderAt : null;

        // ✅ base: se já registrou alguma vez, conta desde o último registro
        // se nunca registrou, conta desde firstSeenAt
        const base = lastReg ?? u.firstSeenAt;
        const hoursSinceBase = Math.floor((now - base) / (60 * 60 * 1000));

        // ✅ se registrou há menos de 24h, não manda nada
        if (hoursSinceBase < 24) {
          pulados++;
          continue;
        }

        // ✅ manda no máximo 1x por 24h enquanto continuar sem registrar
        if (lastRem && (now - lastRem) < (24 * 60 * 60 * 1000)) {
          pulados++;
          continue;
        }

        const content =
          hoursSinceBase >= 48
            ? buildDM48(uid, hoursSinceBase)
            : buildDM24(uid, hoursSinceBase);

        const embeds = [new EmbedBuilder().setImage(PODERES_GIF_URL)];

        let dmOk = true;
        try {
          await member.send({ content, embeds });
        } catch (err) {
          dmOk = false;
          console.warn(`[LembretesPoderes] DM falhou para ${uid}:`, err?.message || err);
        }

        await logDMToChannel(uid, content, embeds, { dmOk });

        if (dmOk) {
          u.lastReminderAt = now;
          enviados++;
        }

        await new Promise(r => setTimeout(r, 450));
      }

      writePoderesState(state);

      console.log(`[LembretesPoderes] DMs: enviados=${enviados} | pulados=${pulados} | membrosCargo=${membros.size}`);
    } catch (err) {
      console.error("[LembretesPoderes] Erro ao enviar DMs:", err);
    }
  }


    function iniciarAgendamentoDMs() {
    PODERES_DM_HOURS.forEach((H) => {
      const wait = msUntilSP(H, 0, 0);
      setTimeout(async function tick() {
        await enviarDMs();
        setInterval(() => enviarDMs(), 24 * 60 * 60 * 1000);
      }, wait);
    });
  }

  function iniciarAgendamentoAvisoPublico() {
    enviarAvisoPublico();
    const wait = msUntilNextTopOfHourSP();
    setTimeout(async function tick() {
      await enviarAvisoPublico();
      setInterval(() => enviarAvisoPublico(), 60 * 60 * 1000);
    }, wait);
  }


  console.log('[LembretesPoderes] Agendadores iniciados (DM 11h/17h + aviso por hora).');
  iniciarAgendamentoDMs();
  iniciarAgendamentoAvisoPublico();
}
