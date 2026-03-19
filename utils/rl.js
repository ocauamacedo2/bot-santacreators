// utils/rl.js
import Bottleneck from 'bottleneck';

export const rl = new Bottleneck({
  minTime: 300,                    // ~3 req/s
  reservoir: 60,                   // máx 60 req/min
  reservoirRefreshInterval: 60_000,
  reservoirRefreshAmount: 60
});

export const wrapRL = (fn) => (...a) => rl.schedule(() => fn(...a));
