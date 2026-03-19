// events/gestaoinfluencer/roles.js
// SantaCreators — GestãoInfluencer v3.4
// FASE 2 — Trava de Cargo GI

import { SC_GI_CFG } from "./config.js";
import { SC_GI_STATE, scheduleSave } from "./state.js";

/* =========================
   HELPERS
========================= */

const nowMs = () => Date.now();

function setBypass(userId, ms = 8000) {
  SC_GI_STATE.roleBypass.set(String(userId), nowMs() + ms);
}

function hasBypass(userId) {
  const until = SC_GI_STATE.roleBypass.get(String(userId));
  if (!until) return false;
  if (nowMs() > until) {
    SC_GI_STATE.roleBypass.delete(String(userId));
    return false;
  }
  return true;
}

async function fetchMember(guild, userId) {
  return guild.members.fetch(userId).catch(() => null);
}

function getLatestActiveRecord(userId) {
  const arr = Array.from(SC_GI_STATE.registros.values())
    .filter(r => r.targetId === String(userId) && r.active);
  if (!arr.length) return null;
  arr.sort((a,b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
  return arr[0];
}

/* =========================
   ROLE HELPERS
========================= */

export async function addGIRole(guild, userId, reason = "GI obrigatório") {
  const member = await fetchMember(guild, userId);
  if (!member) return false;
  if (member.roles.cache.has(SC_GI_CFG.ROLE_GESTAOINFLUENCER)) return true;

  setBypass(userId);
  await member.roles
    .add(SC_GI_CFG.ROLE_GESTAOINFLUENCER, reason)
    .catch(() => {});
  return true;
}

export async function removeGIRole(guild, userId, reason = "GI removido") {
  const member = await fetchMember(guild, userId);
  if (!member) return false;
  if (!member.roles.cache.has(SC_GI_CFG.ROLE_GESTAOINFLUENCER)) return true;

  setBypass(userId);
  await member.roles
    .remove(SC_GI_CFG.ROLE_GESTAOINFLUENCER, reason)
    .catch(() => {});
  return true;
}

/* =========================
   TRAVA PRINCIPAL
========================= */

export async function handleGIRoleRemoved(guild, userId) {
  // se foi o bot mexendo, ignora
  if (hasBypass(userId)) return;

  const rec = getLatestActiveRecord(userId);
  if (!rec) return;

  const key = String(userId);
  const warn =
    SC_GI_STATE.giWarningsByUser.get(key) ||
    { count: 0, lastAtMs: null };

  const now = nowMs();

  // segunda remoção em < 2min
  if (warn.lastAtMs && (now - warn.lastAtMs) <= SC_GI_CFG.GI_REMOVE_WINDOW_MS) {
    warn.count += 1;
    warn.lastAtMs = now;
    SC_GI_STATE.giWarningsByUser.set(key, warn);
    scheduleSave();

    await punishSecondRemoval(guild, userId, rec);
    return;
  }

  // primeira vez
  warn.count = 1;
  warn.lastAtMs = now;
  SC_GI_STATE.giWarningsByUser.set(key, warn);
  scheduleSave();

  await warnAndReAdd(guild, userId, rec);
}

/* =========================
   AÇÕES
========================= */

async function warnAndReAdd(guild, userId, rec) {
  await addGIRole(guild, userId, "Trava GI: cargo obrigatório");

  try {
    const user = await guild.client.users.fetch(userId);
    await user.send({
      content: `<@${userId}> ⚠️`,
      embeds: [{
        title: "⚠️ Cargo obrigatório",
        description:
          `O cargo <@&${SC_GI_CFG.ROLE_GESTAOINFLUENCER}> é **obrigatório** enquanto seu registro estiver **ativo**.\n\n` +
          `Se remover novamente em menos de **2 minutos**, seus cargos serão **removidos temporariamente**.`,
        color: 0xe67e22
      }]
    }).catch(() => {});
  } catch {}
}

async function punishSecondRemoval(guild, userId, rec) {
  const member = await fetchMember(guild, userId);
  if (!member) return;

  // snapshot dos cargos
  const roles = member.roles.cache
    .filter(r => r.id !== guild.id)
    .map(r => r.id);

  const restoreAt = nowMs() + SC_GI_CFG.GI_RESTORE_AFTER_PUNISH_MS;

  SC_GI_STATE.roleSnapshots.set(String(userId), {
    roleIds: roles,
    restoreAtMs: restoreAt,
    createdAtMs: nowMs(),
    recordMessageId: rec.messageId
  });
  scheduleSave();

  // remove tudo
  setBypass(userId, 15000);
  await member.roles.set([]).catch(() => {});

  // DM punição
  try {
    const user = await guild.client.users.fetch(userId);
    await user.send({
      content: `<@${userId}> 🚨`,
      embeds: [{
        title: "🚨 Remoção repetida do cargo",
        description:
          `Você removeu o cargo <@&${SC_GI_CFG.ROLE_GESTAOINFLUENCER}> **2x em menos de 2 minutos**.\n\n` +
          `Todos os seus cargos foram **removidos temporariamente**.\n` +
          `Eles serão restaurados automaticamente em **10 minutos**.`,
        color: 0xe74c3c
      }]
    }).catch(() => {});
  } catch {}

  // agenda restore
  scheduleRestore(guild, userId);
}

/* =========================
   RESTORE
========================= */

function scheduleRestore(guild, userId) {
  const snap = SC_GI_STATE.roleSnapshots.get(String(userId));
  if (!snap) return;

  const delay = Math.max(0, snap.restoreAtMs - nowMs());

  if (SC_GI_STATE.restoreTimers.has(String(userId))) {
    clearTimeout(SC_GI_STATE.restoreTimers.get(String(userId)));
  }

  const timer = setTimeout(async () => {
    try {
      const member = await fetchMember(guild, userId);
      if (!member) return;

      setBypass(userId, 10000);
      await member.roles.set(snap.roleIds).catch(() => {});

      // se ainda estiver ativo, devolve GI
      const rec = getLatestActiveRecord(userId);
      if (rec) {
        await addGIRole(guild, userId, "Restore GI pós-punição");
      }

      SC_GI_STATE.roleSnapshots.delete(String(userId));
      scheduleSave();
    } catch {}
  }, delay);

  SC_GI_STATE.restoreTimers.set(String(userId), timer);
}
