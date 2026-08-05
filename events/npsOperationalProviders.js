// /events/npsOperationalProviders.js
// ============================================================================
// SANTACREATORS — PROVEDORES DOS SISTEMAS PARA O NPS OPERACIONAL
// ============================================================================
// Este arquivo será a ponte entre os sistemas oficiais da SantaCreators
// e o NPS Operacional.
//
// Cada módulo terá seu próprio provedor, usando a fonte oficial do sistema:
//
// • Registro de Poderes;
// • Presenças;
// • Confirmações de Organizações;
// • Pagamentos;
// • Bate Ponto;
// • Alinhamentos;
// • Social Media;
// • Hall da Fama;
// • Cronograma;
// • Eventos;
// • Set Staff;
// • Pedido de Set;
// • Quiz;
// • Ausências;
// • demais módulos operacionais.
//
// Não utiliza dados inventados e não substitui a lógica dos sistemas.
// ============================================================================

import {
  listOperationalMetricProviders,
} from "../utils/operationalMetricsHub.js";

// ============================================================================
// CONTROLE GLOBAL
// ============================================================================

if (
  !globalThis.__SC_NPS_OPERATIONAL_PROVIDERS_LOADED__
) {
  globalThis.__SC_NPS_OPERATIONAL_PROVIDERS_LOADED__ =
    true;

  console.log(
    "[NPS Providers] Arquivo central de provedores carregado."
  );
}

// ============================================================================
// DIAGNÓSTICO
// ============================================================================

export function getRegisteredNpsOperationalProviders() {
  return listOperationalMetricProviders();
}

export function logRegisteredNpsOperationalProviders() {
  const providers =
    getRegisteredNpsOperationalProviders();

  console.log(
    "[NPS Providers] Provedores registrados:",
    providers.length
      ? providers
      : "nenhum provedor registrado"
  );

  return providers;
}