export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function nowMs() {
  return Date.now();
}

export function weeksBetween(startMs, pausedMs = 0) {
  return Math.floor((nowMs() - startMs - pausedMs) / WEEK_MS);
}

export function monthsFromWeeks(weeks) {
  return Math.floor(weeks / 4);
}

export function isMidnightTZ(offsetMin) {
  const d = new Date(Date.now() + offsetMin * 60 * 1000);
  return d.getHours() === 0 && d.getMinutes() === 0;
}
