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

if (!globalThis.SC_OPERATIONAL_METRICS_PROVIDERS) {
  globalThis.SC_OPERATIONAL_METRICS_PROVIDERS = new Map();
}

const providers =
  globalThis.SC_OPERATIONAL_METRICS_PROVIDERS;

// ============================================================================
// CONTROLE DE PERFORMANCE
// ============================================================================

/*
 * Tempo máximo permitido para um único provedor.
 *
 * Como os provedores agora são executados em paralelo,
 * um provedor lento não poderá bloquear indefinidamente
 * todo o NPS Operacional.
 */
const OPERATIONAL_PROVIDER_TIMEOUT_MS =
  15 * 1000;

/*
 * Cache extremamente curto da coleta completa.
 *
 * Evita executar novamente todos os provedores quando:
 *
 * • o painel acabou de ser atualizado;
 * • o usuário clica logo depois em "Semana atual";
 * • o usuário clica logo depois em "Relatório completo";
 * • duas partes do sistema solicitam a mesma coleta ao mesmo tempo.
 *
 * O período curto mantém os dados praticamente em tempo real.
 */
const OPERATIONAL_COLLECTION_CACHE_MS =
  15 * 1000;

/*
 * Cache da última coleta concluída.
 */
let operationalCollectionCache = {
  key:
    null,

  collectedAt:
    0,

  payload:
    null,

  promise:
    null,
};

// ============================================================================
// HELPERS
// ============================================================================

function invalidateOperationalCollectionCache() {
  operationalCollectionCache.key =
    null;

  operationalCollectionCache.collectedAt =
    0;

  operationalCollectionCache.payload =
    null;
}

/*
 * Gera uma chave simples para impedir que dados de contextos diferentes
 * sejam reutilizados incorretamente.
 */
function buildOperationalCollectionKey(
  context = {}
) {
  const clientId =
    String(
      context.client?.user?.id ||
      context.client?.id ||
      "no-client"
    );

  const currentWeekKey =
    String(
      context.currentWeek?.key ||
      "no-current-week"
    );

  const previousWeekKey =
    String(
      context.previousWeek?.key ||
      "no-previous-week"
    );

  return [
    clientId,
    currentWeekKey,
    previousWeekKey,
  ].join(":");
}

/*
 * Executa um provedor com limite máximo de tempo.
 *
 * Isso impede que uma leitura travada no Discord,
 * API, cache ou arquivo mantenha o relatório
 * permanentemente carregando.
 */
async function executeProviderWithTimeout(
  providerId,
  provider,
  context
) {
  let timeoutHandle =
    null;

  try {
    const providerPromise =
      Promise.resolve()
        .then(
          () =>
            provider(
              context
            )
        );

    const timeoutPromise =
      new Promise(
        (
          _resolve,
          reject
        ) => {
          timeoutHandle =
            setTimeout(
              () => {
                const error =
                  new Error(
                    `O provedor "${providerId}" excedeu o limite de ${OPERATIONAL_PROVIDER_TIMEOUT_MS / 1000} segundos.`
                  );

                error.code =
                  "SC_OPERATIONAL_PROVIDER_TIMEOUT";

                reject(
                  error
                );
              },
              OPERATIONAL_PROVIDER_TIMEOUT_MS
            );
        }
      );

    return await Promise.race([
      providerPromise,
      timeoutPromise,
    ]);
  } finally {
    if (
      timeoutHandle
    ) {
      clearTimeout(
        timeoutHandle
      );
    }
  }
}

// ============================================================================
// REGISTRO DOS PROVEDORES
// ============================================================================

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

  /*
   * Se a lista de provedores mudou,
   * qualquer cache anterior deixa de representar
   * corretamente a coleta atual.
   */
  invalidateOperationalCollectionCache();
}

export function unregisterOperationalMetricProvider(
  providerId
) {
  providers.delete(
    String(providerId || "").trim()
  );

  /*
   * Também invalida o cache quando um provedor é removido.
   */
  invalidateOperationalCollectionCache();
}

export function listOperationalMetricProviders() {
  return [
    ...providers.keys(),
  ];
}

// ============================================================================
// COLETA DAS MÉTRICAS
// ============================================================================

export async function collectOperationalMetrics(
  context = {}
) {
  const collectionKey =
    buildOperationalCollectionKey(
      context
    );

  const now =
    Date.now();

  const cacheIsValid =
    operationalCollectionCache.key ===
      collectionKey &&
    operationalCollectionCache.payload &&
    now -
      Number(
        operationalCollectionCache.collectedAt ||
        0
      ) <
      OPERATIONAL_COLLECTION_CACHE_MS;

  /*
   * Se uma coleta recente já terminou,
   * retorna imediatamente.
   */
  if (
    cacheIsValid
  ) {
    return operationalCollectionCache.payload;
  }

  /*
   * Se a mesma coleta já estiver acontecendo,
   * não inicia outra.
   *
   * O segundo relatório simplesmente aguarda
   * a Promise que já está trabalhando.
   */
  if (
    operationalCollectionCache.key ===
      collectionKey &&
    operationalCollectionCache.promise
  ) {
    return operationalCollectionCache.promise;
  }

  /*
   * Registra o contexto da coleta que será iniciada.
   */
  operationalCollectionCache.key =
    collectionKey;

  const collectionStartedAt =
    Date.now();

  /*
   * Todos os provedores são iniciados em paralelo.
   *
   * A ordem final permanece igual à ordem de registro
   * dos provedores no Map.
   */
  operationalCollectionCache.promise =
    Promise.all(
      [
        ...providers.entries(),
      ].map(
        async (
          [
            providerId,
            provider,
          ]
        ) => {
          const providerStartedAt =
            Date.now();

          try {
            const result =
              await executeProviderWithTimeout(
                providerId,
                provider,
                context
              );

            return {
              success:
                true,

              providerId,

              result,

              duration:
                Date.now() -
                providerStartedAt,
            };
          } catch (error) {
            console.error(
              `[OperationalMetricsHub] Erro no provedor "${providerId}":`,
              error
            );

            return {
              success:
                false,

              providerId,

              error,

              duration:
                Date.now() -
                providerStartedAt,
            };
          }
        }
      )
    )
      .then(
        providerResponses => {
          const results = [];
          const errors = [];

          for (
            const providerResponse of
            providerResponses
          ) {
            if (
              providerResponse.success
            ) {
              /*
               * Mantém exatamente o comportamento anterior:
               * provedores que retornam null ou undefined
               * simplesmente não entram nos resultados.
               */
              if (
                !providerResponse.result
              ) {
                continue;
              }

              results.push({
                providerId:
                  providerResponse.providerId,

                ...providerResponse.result,
              });

              continue;
            }

            errors.push({
              providerId:
                providerResponse.providerId,

              message:
                providerResponse.error
                  ?.message ||
                String(
                  providerResponse.error
                ),

              code:
                providerResponse.error
                  ?.code ||
                null,
            });
          }

          const collectedAt =
            Date.now();

          const payload = {
            results,
            errors,
            collectedAt,
          };

          operationalCollectionCache.payload =
            payload;

          operationalCollectionCache.collectedAt =
            collectedAt;

          console.log(
            "[OperationalMetricsHub] Coleta concluída:",
            {
              providers:
                providers.size,

              results:
                results.length,

              errors:
                errors.length,

              durationMs:
                collectedAt -
                collectionStartedAt,
            }
          );

          return payload;
        }
      )
      .finally(
        () => {
          operationalCollectionCache.promise =
            null;
        }
      );

  return operationalCollectionCache.promise;
}