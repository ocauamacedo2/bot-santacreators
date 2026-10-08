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
        handler(eventName, payload);
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

    const eventPayload = {
      ...(
        payload &&
        typeof payload === "object"
          ? payload
          : {}
      ),

      __at: Date.now(),
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

export function dashOn(eventName, handler) {

  try {

    if (
      typeof handler !== "function"
    ) {
      return;
    }

    // =================================================
    // EVITA REGISTRAR A MESMA FUNÇÃO NOVAMENTE
    // =================================================

    const alreadyRegistered =
      hub.listeners(eventName)
        .includes(handler);

    if (alreadyRegistered) {
      return;
    }

    // =================================================
    // REGISTRA O LISTENER
    // =================================================

    hub.on(
      eventName,
      handler
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