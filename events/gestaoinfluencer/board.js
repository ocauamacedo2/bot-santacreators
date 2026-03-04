// events/gestaoinfluencer/board.js

import { SC_GI_STATE, scheduleSave } from "./state.js";
import { SC_GI_CFG } from "./config.js";

/* ===========================
   UTIL
=========================== */

function chunkText(text, max = 1900) {
  const parts = [];
  let buf = "";

  for (const line of text.split("\n")) {
    if ((buf + "\n" + line).length > max) {
      parts.push(buf);
      buf = line;
    } else {
      buf += (buf ? "\n" : "") + line;
    }
  }

  if (buf) parts.push(buf);
  return parts;
}

/* ===========================
   RENDER BOARD
=========================== */

export async function renderBoard(client, force = false) {
const guild = client.guilds.cache.get(SC_GI_CFG.GUILD_ID);

  if (!guild) return;

  const channel = await guild.channels
    .fetch(SC_GI_CFG.CHANNEL_RESP_BOARD)
    .catch(() => null);

  if (!channel) return;

  /* 🔁 evita rebuild desnecessário */
  if (!force && !SC_GI_STATE.boardDirty) return;

  /* 🧹 apaga board antigo */
  if (Array.isArray(SC_GI_STATE.boardMessageIds)) {
    for (const id of SC_GI_STATE.boardMessageIds) {
      await channel.messages.delete(id).catch(() => {});
    }
  }

  SC_GI_STATE.boardMessageIds = [];

  /* ===========================
     AGRUPAMENTO
  =========================== */

  const groups = new Map();

  for (const rec of SC_GI_STATE.registros.values()) {
    const resp = rec.responsibleUserId || "SEM_RESP";

    if (!groups.has(resp)) groups.set(resp, []);
    groups.get(resp).push(rec);
  }

  /* ===========================
     MONTAGEM TEXTO
  =========================== */

  let text = "📋 **PAINEL — GESTÃO INFLUENCER**\n";
  text += "_Atualiza automaticamente. Não editar._\n\n";

  for (const [resp, list] of groups.entries()) {
    const title =
      resp === "SEM_RESP"
        ? "❓ **Sem Responsável**"
        : `🧭 **Responsável:** <@${resp}>`;

    text += `${title}\n`;

    for (const rec of list) {
      const status = rec.active ? "🟢" : "⏸️";
      text += `${status} <@${rec.targetId}> — \`${rec.area}\`\n`;
    }

    text += "\n";
  }

  /* ===========================
     ENVIO
  =========================== */

  const chunks = chunkText(text);

  for (const part of chunks) {
    const msg = await channel.send(part);
    SC_GI_STATE.boardMessageIds.push(msg.id);
  }

  SC_GI_STATE.boardDirty = false;
  scheduleSave();
}
