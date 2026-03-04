// events/gestaoinfluencer/state.js
// SantaCreators — GestãoInfluencer v3.4 (STATE GLOBAL)

import fs from "node:fs";
import { promises as fsp } from "node:fs";
import { SC_GI_CFG } from "./config.js";

export const SC_GI_STATE = {
  // menu
  menuMessageId: null,

  // registros
  registros: new Map(),

  // board
  boardMessageIds: [],
  boardContentHash: null,
  dashboardMessageId: null,
  boardDirty: true,

  // 🔒 trava GI / punições
  giWarningsByUser: new Map(),
  roleBypass: new Map(),
  roleSnapshots: new Map(),
  restoreTimers: new Map(),

  // 🔐 TRAVA DE AÇÃO (ANTI DOUBLE-CLICK)
  actionLocks: new Set(), // messageId

  // 📜 HISTÓRICO GI
  historyByTarget: new Map(),
};


export async function SC_GI_init() {
  await loadState();
}

/* =========================
   LOAD / SAVE
========================= */

async function loadState() {
  try {
    if (!fs.existsSync(SC_GI_CFG.DATA_FILE)) return;

    const raw = await fsp.readFile(SC_GI_CFG.DATA_FILE, "utf8");
    const data = JSON.parse(raw || "{}");

   SC_GI_STATE.menuMessageId = data.menuMessageId || null;
SC_GI_STATE.boardMessageIds = data.boardMessageIds || [];
SC_GI_STATE.boardContentHash = data.boardContentHash || null;
SC_GI_STATE.dashboardMessageId = data.dashboardMessageId || null;
SC_GI_STATE.boardDirty = data.boardDirty ?? true;



    // registros
    SC_GI_STATE.registros.clear();
    for (const r of data.registros || []) {
      SC_GI_STATE.registros.set(String(r.messageId), {
        ...r,
        messageId: String(r.messageId),
        joinDateMs: Number(r.joinDateMs),
        createdAtMs: Number(r.createdAtMs),
        pausedAtMs: r.pausedAtMs ?? null,
        totalPausedMs: Number(r.totalPausedMs || 0),
        active: r.active !== false,
        oneMonthNotified: !!r.oneMonthNotified,
        nextWeekTickMs: r.nextWeekTickMs ?? null,
      });
    }

    // warnings GI
    SC_GI_STATE.giWarningsByUser.clear();
    for (const w of data.giWarnings || []) {
      if (!w?.userId) continue;
      SC_GI_STATE.giWarningsByUser.set(String(w.userId), {
        count: Number(w.count || 0),
        lastAtMs: w.lastAtMs ?? null,
      });
    }

    // snapshots de cargos
    SC_GI_STATE.roleSnapshots.clear();
    for (const s of data.roleSnapshots || []) {
      if (!s?.userId) continue;
      SC_GI_STATE.roleSnapshots.set(String(s.userId), {
        roleIds: Array.isArray(s.roleIds) ? s.roleIds : [],
        restoreAtMs: Number(s.restoreAtMs || 0),
        createdAtMs: Number(s.createdAtMs || 0),
        recordMessageId: s.recordMessageId ?? null,
      });
    }

    console.log(`[GI] Registros carregados: ${SC_GI_STATE.registros.size}`);
  } catch (e) {
    console.warn("[GI] Erro ao carregar estado:", e.message);
  }
}

let saveTimer = null;
export function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const data = {
           menuMessageId: SC_GI_STATE.menuMessageId,
  boardMessageIds: SC_GI_STATE.boardMessageIds,
  boardContentHash: SC_GI_STATE.boardContentHash,
  dashboardMessageId: SC_GI_STATE.dashboardMessageId,
  boardDirty: SC_GI_STATE.boardDirty,
  registros: Array.from(SC_GI_STATE.registros.values()),
  historyByTarget: Array.from(
    SC_GI_STATE.historyByTarget.entries()
  ).map(([targetId, items]) => ({
    targetId,
    items
  })),
        giWarnings: Array.from(SC_GI_STATE.giWarningsByUser.entries()).map(
          ([userId, v]) => ({
            userId,
            count: v.count || 0,
            lastAtMs: v.lastAtMs ?? null,
          })
        ),
        roleSnapshots: Array.from(SC_GI_STATE.roleSnapshots.entries()).map(
          ([userId, s]) => ({
            userId,
            roleIds: s.roleIds,
            restoreAtMs: s.restoreAtMs,
            createdAtMs: s.createdAtMs,
            recordMessageId: s.recordMessageId,
          })
        ),
      };

      await fsp.writeFile(
        SC_GI_CFG.DATA_FILE,
        JSON.stringify(data, null, 2),
        "utf8"
      );
    } catch {}
  }, 700);
}
