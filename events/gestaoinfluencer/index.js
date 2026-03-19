// events/gestaoinfluencer/index.js
// SantaCreators — Controle GestãoInfluencer v3.4 (EVENTS MODE)
// ⚠️ NÃO cria client
// ⚠️ NÃO registra listeners sozinho
// ⚠️ SOMENTE expõe hooks (onReady / onInteraction / onGuildMemberUpdate)
import { handleGIRoleRemoved } from "./roles.js";
import { gestaoinfluencerInit } from "./init.js";
import { SC_GI_tickStart } from "./tick.js";
import {
  handleInteraction,
  ensureMenuForAllGuilds
} from "./handlers.js";
import { renderBoard } from "./board.js";
import { SC_GI_CFG } from "./config.js"; // ✅ UM ÚNICO IMPORT


let initialized = false;

export async function gestaoinfluencerOnReady(client) {
  if (initialized) return;
  initialized = true;

  // 🔥 FASE 1 — inicializa o estado global
  await gestaoinfluencerInit(client);



  // ✅ CRIA / GARANTE O MENU NA INICIALIZAÇÃO
  await ensureMenuForAllGuilds(client);

  SC_GI_tickStart(client);
// 🧠 cria o board ao ligar
  await renderBoard(client, true);
  console.log("✅ [GI] GestãoInfluencer carregado (events)");
}

export async function gestaoinfluencerHandleInteraction(interaction, client) {
  return handleInteraction(interaction, client);
}

export async function gestaoinfluencerHandleGuildMemberUpdate(oldMember, newMember) {
  const roleId = SC_GI_CFG.ROLE_GESTAOINFLUENCER;

  const had = oldMember.roles.cache.has(roleId);
  const has = newMember.roles.cache.has(roleId);

  if (had && !has) {
    await handleGIRoleRemoved(newMember.guild, newMember.id);
  }
}

