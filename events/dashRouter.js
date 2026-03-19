// /application/events/dashRouter.js
import { dashEmit } from "../utils/dashHub.js";

// ✅ IDs que podem usar o !dashtest (ajusta se quiser)
const ALLOWED_IDS = new Set([
  "660311795327828008", // você
  "1262262852949905408", // owner
]);

export async function dashRouterOnReady(client) {
  // ❌ NÃO MANDA MENSAGEM EM CANAL (pra não aparecer pra geral)
  // console.log("[DASH_ROUTER] online ✅");
}

export async function dashRouterHandleMessage(message) {
  try {
    if (!message?.guild || message.author?.bot) return false;

    const txt = (message.content || "").trim().toLowerCase();
    if (txt !== "!dashtest") return false;

    const ok =
      ALLOWED_IDS.has(message.author.id) ||
      message.member?.roles?.cache?.some((r) => ALLOWED_IDS.has(r.id));

    if (!ok) {
      await message.reply("🚫 Sem permissão.").catch(() => {});
      return true;
    }

    // Teste simples (não precisa aparecer debug público)
    dashEmit("teste:ping", { by: message.author.id });

    await message.reply("✅ disparei um evento de teste no HUB.").catch(() => {});
    return true;
  } catch {
    return false;
  }
}
