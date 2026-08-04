// /utils/operationalMetricsHub.js
// ============================================================================
// SANTACREATORS — CENTRAL DE MÉTRICAS OPERACIONAIS
// ============================================================================
// Cada sistema registra um provedor responsável por entregar suas métricas
// reais ao NPS Operacional.
//
// Um provedor deve retornar:
//
// {
//   id,
//   label,
//   available,
//   score,
//   confidence,
//   volume,
//   goal,
//   current,
//   previous,
//   difference,
//   positivePoints,
//   attentionPoints,
//   recommendations,
//   details
// }
// ============================================================================

if (!globalThis.__SC_OPERATIONAL_METRICS_PROVIDERS__) {
  globalThis.__SC_OPERATIONAL_METRICS_PROVIDERS__ = new Map();
}

const providers =
  globalThis.__SC_OPERATIONAL_METRICS_PROVIDERS__;

export function registerOperationalMetricProvider(
  providerId,
  provider
) {
  const normalizedId =
    String(providerId || "").trim();

  if (!normalizedId) {
    throw new Error(
      "[OperationalMetricsHub] O ID do provedor é obrigatório."
    );
  }

  if (typeof provider !== "function") {
    throw new TypeError(
      `[OperationalMetricsHub] O provedor "${normalizedId}" precisa ser uma função.`
    );
  }

  providers.set(
    normalizedId,
    provider
  );
}

export function unregisterOperationalMetricProvider(
  providerId
) {
  providers.delete(
    String(providerId || "").trim()
  );
}

export function listOperationalMetricProviders() {
  return [
    ...providers.keys(),
  ];
}

export async function collectOperationalMetrics(
  context = {}
) {
  const results = [];
  const errors = [];

  for (
    const [
      providerId,
      provider,
    ] of providers.entries()
  ) {
    try {
      const result =
        await provider(context);

      if (!result) {
        continue;
      }

      results.push({
        providerId,
        ...result,
      });
    } catch (error) {
      errors.push({
        providerId,
        message:
          error?.message ||
          String(error),
      });

      console.error(
        `[OperationalMetricsHub] Erro no provedor "${providerId}":`,
        error
      );
    }
  }

  return {
    results,
    errors,
    collectedAt:
      Date.now(),
  };
}