// /application/utils/dashHub.js
import { EventEmitter } from "node:events";

/**
 * HUB global de eventos para dashboards.
 * - dashEmit(event, payload)
 * - dashOn(event, handler)
 * - dashOnAny(handler)
 */
if (!globalThis.__SC_DASH_HUB__) {
  globalThis.__SC_DASH_HUB__ = new EventEmitter();
  globalThis.__SC_DASH_HUB__.setMaxListeners(50);
}

const hub = globalThis.__SC_DASH_HUB__;

// =====================================================
// ✅ LISTA GLOBAL DE OBSERVADORES DE TODOS OS EVENTOS
// =====================================================
// Mantém múltiplos handlers registrados pelo NPS, debug,
// router e outros sistemas, sem permitir duplicações.
if (!globalThis.__SC_DASH_ANY_HANDLERS__) {
  globalThis.__SC_DASH_ANY_HANDLERS__ = new Set();
}

const anyHandlers = globalThis.__SC_DASH_ANY_HANDLERS__;

// =====================================================
// ✅ INSTALA A INTERCEPTAÇÃO GLOBAL APENAS UMA VEZ
// =====================================================
if (!hub.__anyHooked) {
  const originalEmit = hub.emit.bind(hub);

  hub.__anyHooked = true;

  hub.emit = (eventName, ...args) => {
    const payload = args?.[0];

    for (const handler of anyHandlers) {
      try {
        const result = handler(
          eventName,
          payload
        );

        Promise.resolve(result).catch(
          error => {
            console.error(
              `[dashHub] Erro assíncrono em observador global do evento "${eventName}":`,
              error
            );
          }
        );
      } catch (error) {
        console.error(
          `[dashHub] Erro em observador global do evento "${eventName}":`,
          error
        );
      }
    }

    return originalEmit(eventName, ...args);
  };
}

// =====================================================
// Emitir evento
// =====================================================
// =====================================================
// SANTA CREATORS
// EMISSÃO DE EVENTOS COM DIAGNÓSTICO
// =====================================================

export function dashEmit(eventName, payload = {}) {

  try {

    // =================================================
    // NORMALIZA A INFORMAÇÃO
    // =================================================

    const emittedAt = Date.now();

    const originalAt = Number(
      payload?.__at
    );

    const eventPayload = {
      ...(
        payload &&
        typeof payload === "object"
          ? payload
          : {}
      ),

      __at:
        Number.isFinite(originalAt) &&
        originalAt > 0
          ? originalAt
          : emittedAt,

      __emittedAt: emittedAt,
    };

    // =================================================
    // DIAGNÓSTICO DO FORMSCREATOR
    // =================================================

    if (
      eventName ===
      "formscreator:comentario_registrado"
    ) {

      const listeners =
        hub.listenerCount(
          eventName
        );

      const diagnostic = {
        messageId:
          eventPayload.messageId ||
          null,

        userId:
          eventPayload.userId ||
          null,

        listeners
      };

      if (listeners === 0) {

        console.error(
          "[dashHub] Feedback emitido SEM consumidor IA:",
          diagnostic
        );

      } else {

        console.log(
          "[dashHub] Feedback recebido pelo hub:",
          diagnostic
        );

      }

    }

    // =================================================
    // DISTRIBUI EVENTO
    // =================================================

    return hub.emit(
      eventName,
      eventPayload
    );

  } catch (error) {

    console.error(
      `[dashHub] Erro ao emitir o evento "${eventName}":`,
      error
    );

    return false;

  }

}

// =====================================================
// Escutar evento específico
// =====================================================
// =====================================================
// SANTA CREATORS
// REGISTRO SEGURO DE LISTENERS
// =====================================================

if (!globalThis.__SC_DASH_SAFE_LISTENERS__) {
  globalThis.__SC_DASH_SAFE_LISTENERS__ = new Map();
}

const safeListeners =
  globalThis.__SC_DASH_SAFE_LISTENERS__;

export function dashOn(eventName, handler) {
  try {
    if (
      typeof handler !== "function"
    ) {
      return;
    }

    if (
      hub.listeners(eventName).includes(handler)
    ) {
      return;
    }

    let handlers = safeListeners.get(
      eventName
    );

    if (!handlers) {
      handlers = new WeakMap();

      safeListeners.set(
        eventName,
        handlers
      );
    }

    const existing = handlers.get(
      handler
    );

    if (
      existing &&
      hub.listeners(eventName).includes(existing)
    ) {
      return;
    }

    const safeHandler = function (...args) {
      try {
        const result = handler.apply(
          this,
          args
        );

        Promise.resolve(result).catch(
          error => {
            console.error(
              `[dashHub] Erro assíncrono no consumidor do evento "${eventName}":`,
              error
            );
          }
        );
      } catch (error) {
        console.error(
          `[dashHub] Erro no consumidor do evento "${eventName}":`,
          error
        );
      }
    };

    handlers.set(
      handler,
      safeHandler
    );

    hub.on(
      eventName,
      safeHandler
    );
  } catch (error) {
    console.error(
      `[dashHub] Erro ao registrar o evento "${eventName}":`,
      error
    );
  }
}

// =====================================================
// Escutar TODOS os eventos
// =====================================================
export function dashOnAny(handler) {
  try {
    if (typeof handler !== "function") return;

    anyHandlers.add(handler);
  } catch (error) {
    console.error(
      "[dashHub] Erro ao registrar observador global:",
      error
    );
  }
}