// /application/events/dashDebug.js
import fs from "node:fs";
import path from "node:path";
import { EmbedBuilder } from "discord.js";
import { dashOnAny } from "../utils/dashHub.js";

// =====================================================
// DASH DEBUG (v2)
// ✅ DESLIGADO por padrão (não vaza pra geral)
// ✅ Se ligar, posta/edita UMA msg só num canal de debug
// =====================================================

const STATE_PATH = "./data/dash_debug_state.json";

// Coloca no .env se quiser:
// DASH_DEBUG=1
// DASH_DEBUG_CHANNEL_ID=SEU_CANAL_DE_LOGS (privado)
const ENABLED = String(process.env.DASH_DEBUG || "").trim() === "1";
const DEBUG_CHANNEL_ID = String(process.env.DASH_DEBUG_CHANNEL_ID || "").trim();

function ensureDir(p) {
  try { fs.mkdirSync(path.dirname(p), { recursive: true }); } catch {}
}

function readState() {
  try {
    if (!fs.existsSync(STATE_PATH)) return { msgId: null };
    return JSON.parse(fs.readFileSync(STATE_PATH, "utf8")) || { msgId: null };
  } catch {
    return { msgId: null };
  }
}

function writeState(s) {
  try {
    ensureDir(STATE_PATH);
    fs.writeFileSync(STATE_PATH, JSON.stringify(s, null, 2));
  } catch {}
}

export function dashDebugOnReady(client) {
  // 🔒 Se não ligar no .env, NÃO FAZ NADA (zero vazamento)
  if (!ENABLED) {
    // console.log("[dashDebug] desativado (DASH_DEBUG!=1).");
    return;
  }

  if (client.__dashDebugWired) return;
  client.__dashDebugWired = true;

  // console.log("[dashDebug] ATIVADO ✅ (vai logar no canal de debug) ");

  // Guarda só o último evento (pra não spammar)
  let last = null;
  let lock = false;

  async function upsert() {
    if (lock) return;
    lock = true;
    try {
      if (!DEBUG_CHANNEL_ID) {
        // Se não tiver canal, só loga no console
        console.log("[dashDebug] DEBUG_CHANNEL_ID não setado. Último evento:", last);
        return;
      }

      const ch = DEBUG_CHANNEL_ID ? await client.channels.fetch(DEBUG_CHANNEL_ID).catch(() => null) : null;
      if (!ch?.isTextBased?.()) return;

      const st = readState();
      let msg = null;
      if (st.msgId) msg = await ch.messages.fetch(st.msgId).catch(() => null);

      const embed = new EmbedBuilder()
        .setColor(0x8b5cf6)
        .setTitle("🧪 DASH DEBUG (privado)")
        .setDescription(
          last
            ? [
                `**Evento:** \`${last.event}\``,
                `**Quando:** <t:${Math.floor((last.at || Date.now()) / 1000)}:R>`,
                "",
                "```json",
                JSON.stringify(last.payload || {}, null, 2).slice(0, 3500),
                "```",
              ].join("\n")
            : "_(nenhum evento ainda)_"
        )
        .setTimestamp(new Date());

      const payload = { content: "‎", embeds: [embed] };

      if (!msg) {
        msg = await ch.send(payload).catch(() => null);
        if (!msg) return;
        st.msgId = msg.id;
        writeState(st);
      } else {
        await msg.edit(payload).catch(() => {});
      }
    } finally {
      lock = false;
    }
  }

  // Escuta QUALQUER evento do hub (mas só mantém o último)
  dashOnAny((event, payload) => {
    last = { event, payload, at: payload?.__at || Date.now() };
    // debounce curtinho pra juntar “rajadas”
    setTimeout(upsert, 800);
  });
}
