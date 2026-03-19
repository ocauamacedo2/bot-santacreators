// utils/onceIn.js
const lastRun = new Map();

export function onceIn(key, ms, fn) {
  const now = Date.now();
  if ((lastRun.get(key) ?? 0) + ms > now) return;
  lastRun.set(key, now);
  return fn();
}
