// /application/utils/dashHub.js
import { EventEmitter } from "node:events";

/**
 * HUB global de eventos para dashboards.
 * - dashEmit(event, payload)
 * - dashOn(event, handler)
 * - dashOnAny(handler)  ✅ NOVO
 */
if (!globalThis.__SC_DASH_HUB__) {
  globalThis.__SC_DASH_HUB__ = new EventEmitter();
  globalThis.__SC_DASH_HUB__.setMaxListeners(50);
}

const hub = globalThis.__SC_DASH_HUB__;

// =====================================================
// Emitir evento
// =====================================================
export function dashEmit(eventName, payload = {}) {
  try {
    hub.emit(eventName, {
      ...payload,
      __at: Date.now(),
    });
  } catch {}
}

// =====================================================
// Escutar evento específico
// =====================================================
export function dashOn(eventName, handler) {
  try {
    hub.on(eventName, handler);
  } catch {}
}

// =====================================================
// ✅ Escutar TODOS os eventos (debug / router)
// =====================================================
export function dashOnAny(handler) {
  try {
    // Padrão Node.js: intercepta emit
    const originalEmit = hub.emit.bind(hub);

    if (hub.__anyHooked) return;
    hub.__anyHooked = true;

    hub.emit = (eventName, ...args) => {
      try {
        handler(eventName, args?.[0]);
      } catch {}
      return originalEmit(eventName, ...args);
    };
  } catch {}
}
