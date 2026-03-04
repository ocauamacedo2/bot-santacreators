import { SC_GI_STATE, scheduleSave } from "./state.js";

export function addGIHistory(targetId, {
  action,
  authorId,
  extra
}) {
  if (!SC_GI_STATE.historyByTarget.has(targetId)) {
    SC_GI_STATE.historyByTarget.set(targetId, []);
  }

  SC_GI_STATE.historyByTarget.get(targetId).push({
    action,
    authorId,
    atMs: Date.now(),
    extra: extra || null
  });

  scheduleSave();
}

export function getGIHistory(targetId) {
  return SC_GI_STATE.historyByTarget.get(targetId) || [];
}
