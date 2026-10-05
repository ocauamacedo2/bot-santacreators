import { EmbedBuilder } from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { dashEmit } from './dashHub.js';

// =====================================================
// SANTACREATORS
// PONTUAÇÃO AUTOMÁTICA DE CORREÇÃO DE ENTREVISTA
// =====================================================
//
// Este módulo é usado quando alguém confirma:
//
// ✅ Aprovação
// ❌ Reprovação
//
// no relatório inteligente da entrevista.
//
// Ele replica a regra de pontuação do !correcao:
//
// • mesma categoria válida
// • mesmo cooldown de 1 hora
// • mesmos bypasses
// • mesma log de correção
// • mesmo dashEmit('correcao:usado')
// • +1 tanto ao aprovar quanto ao reprovar
//
// Também impede que o mesmo relatório gere ponto
// mais de uma vez.
// =====================================================

const CANAL_LOGS_CORRECAO =
  '1486006908056899748';

const CATEGORIA_CORRECAO_PONTUA_ID =
  '1359244725781266492';

// =====================================================
// BYPASS DE CATEGORIA + COOLDOWN
// =====================================================
//
// Os mesmos usuários do !correcao podem pontuar
// independentemente da categoria e do cooldown.
// =====================================================

const CORRECAO_ANYWHERE_BYPASS_USERS =
  new Set([
    '660311795327828008',
    '1262262852949905408',
  ]);

// =====================================================
// BYPASS SOMENTE DO COOLDOWN
// =====================================================

const CORRECAO_COOLDOWN_BYPASS_USERS =
  new Set([
    '660311795327828008',
    '1262262852949905408',
  ]);

const CORRECAO_COOLDOWN_BYPASS_ROLES =
  new Set([
    '1352408327983861844',
  ]);

// =====================================================
// ARQUIVOS DE PERSISTÊNCIA
// =====================================================

const __filename =
  fileURLToPath(
    import.meta.url
  );

const __dirname =
  path.dirname(
    __filename
  );

// IMPORTANTE:
//
// Este é exatamente o mesmo arquivo de cooldown
// utilizado pelo !correcao.
//
// Como correcaoScore.js está dentro de /utils,
// precisamos subir apenas um nível para /data.
// =====================================================

const COOLDOWN_FILE =
  path.resolve(
    __dirname,
    '../data/correcao_cooldown.json'
  );

// Guarda quais relatórios já tiveram a pontuação
// automática processada.
//
// Isso protege contra:
// • clique duplicado
// • retry
// • interação repetida
// • tentativa de pontuar novamente o mesmo relatório
// =====================================================

const DECISION_SCORE_STATE_FILE =
  path.resolve(
    __dirname,
    '../data/correcao_decision_score.json'
  );

// Proteção em memória contra dois cliques chegando
// praticamente ao mesmo tempo.
const DECISION_SCORE_LOCKS =
  new Set();

// =====================================================
// BYPASS
// =====================================================

function hasCooldownBypass(
  member
) {
  if (
    !member
  ) {
    return false;
  }

  if (
    CORRECAO_COOLDOWN_BYPASS_USERS.has(
      String(
        member.id
      )
    )
  ) {
    return true;
  }

  if (
    member.roles
      ?.cache
      ?.some(
        (role) =>
          CORRECAO_COOLDOWN_BYPASS_ROLES.has(
            String(
              role.id
            )
          )
      )
  ) {
    return true;
  }

  return false;
}

function hasAnywhereBypass(
  userId
) {
  return (
    CORRECAO_ANYWHERE_BYPASS_USERS.has(
      String(
        userId
      )
    )
  );
}

// =====================================================
// CATEGORIA
// =====================================================

function isAllowedCorrecaoCategory(
  channel
) {
  if (
    !channel
  ) {
    return false;
  }

  if (
    String(
      channel.parentId ||
      ''
    ) ===
    CATEGORIA_CORRECAO_PONTUA_ID
  ) {
    return true;
  }

  if (
    String(
      channel.parent?.id ||
      ''
    ) ===
    CATEGORIA_CORRECAO_PONTUA_ID
  ) {
    return true;
  }

  return false;
}

// =====================================================
// JSON
// =====================================================

function ensureJsonDirectory(
  filePath
) {
  const directory =
    path.dirname(
      filePath
    );

  if (
    !fs.existsSync(
      directory
    )
  ) {
    fs.mkdirSync(
      directory,
      {
        recursive: true,
      }
    );
  }
}

function readJsonFile(
  filePath,
  fallback = {}
) {
  try {
    if (
      !fs.existsSync(
        filePath
      )
    ) {
      return fallback;
    }

    const raw =
      fs.readFileSync(
        filePath,
        'utf8'
      );

    if (
      !String(
        raw
      ).trim()
    ) {
      return fallback;
    }

    const parsed =
      JSON.parse(
        raw
      );

    if (
      !parsed ||
      typeof parsed !==
        'object'
    ) {
      return fallback;
    }

    return parsed;
  } catch (error) {
    console.error(
      '[CORRECAO SCORE] Erro ao ler JSON:',
      filePath,
      error
    );

    return fallback;
  }
}

function writeJsonFile(
  filePath,
  data
) {
  ensureJsonDirectory(
    filePath
  );

  fs.writeFileSync(
    filePath,
    JSON.stringify(
      data,
      null,
      2
    ),
    'utf8'
  );
}

// =====================================================
// COOLDOWN
// =====================================================
//
// Repete a mesma regra do !correcao:
//
// • 1 hora
// • bypasses pontuam sempre
// =====================================================

function checkCooldown(
  userId,
  member
) {
  try {
    if (
      hasCooldownBypass(
        member
      )
    ) {
      return {
        scored: true,
        remaining: 0,
        bypass: true,
      };
    }

    ensureJsonDirectory(
      COOLDOWN_FILE
    );

    const data =
      readJsonFile(
        COOLDOWN_FILE,
        {}
      );

    const now =
      Date.now();

    const last =
      Number(
        data[
          String(
            userId
          )
        ] ||
        0
      );

    const cooldown =
      60 *
      60 *
      1000;

    if (
      now - last <
      cooldown
    ) {
      return {
        scored: false,

        remaining:
          cooldown -
          (
            now -
            last
          ),

        bypass: false,
      };
    }

    data[
      String(
        userId
      )
    ] =
      now;

    writeJsonFile(
      COOLDOWN_FILE,
      data
    );

    return {
      scored: true,
      remaining: 0,
      bypass: false,
    };
  } catch (error) {
    console.error(
      '[CORRECAO SCORE] Erro no cooldown:',
      error
    );

    // Mantém o comportamento histórico do !correcao.
    //
    // Uma falha de leitura do JSON não deve fazer
    // desaparecer uma correção legítima.
    return {
      scored: true,
      remaining: 0,
      bypass: false,
    };
  }
}

// =====================================================
// ESTADO DE RELATÓRIOS JÁ PROCESSADOS
// =====================================================

function readDecisionScoreState() {
  const state =
    readJsonFile(
      DECISION_SCORE_STATE_FILE,
      {
        reports: {},
      }
    );

  if (
    !state.reports ||
    typeof state.reports !==
      'object'
  ) {
    state.reports = {};
  }

  return state;
}

function getExistingDecisionRecord(
  reportMessageId
) {
  if (
    !reportMessageId
  ) {
    return null;
  }

  const state =
    readDecisionScoreState();

  return (
    state.reports[
      String(
        reportMessageId
      )
    ] ||
    null
  );
}

function saveDecisionRecord(
  reportMessageId,
  record
) {
  if (
    !reportMessageId
  ) {
    return false;
  }

  try {
    const state =
      readDecisionScoreState();

    state.reports[
      String(
        reportMessageId
      )
    ] = {
      ...record,

      reportMessageId:
        String(
          reportMessageId
        ),
    };

    writeJsonFile(
      DECISION_SCORE_STATE_FILE,
      state
    );

    return true;
  } catch (error) {
    console.error(
      '[CORRECAO SCORE] Não foi possível salvar o controle anti-duplicidade:',
      error
    );

    return false;
  }
}

// =====================================================
// TEXTO DE RESULTADO
// =====================================================

function buildScoreLabel({
  scoreInfo,
  actorUserId,
}) {
  if (
    scoreInfo?.duplicate
  ) {
    return (
      'ℹ️ O ponto desta entrevista já havia sido processado anteriormente.'
    );
  }

  if (
    scoreInfo
      ?.blockedByCategory
  ) {
    return (
      '🚫 A decisão foi aplicada, mas não pontuou porque o ticket está fora da categoria válida.'
    );
  }

  if (
    scoreInfo?.bypass &&
    hasAnywhereBypass(
      actorUserId
    )
  ) {
    return (
      '✅ Ponto de correção registrado (+1) • isento de cooldown e categoria.'
    );
  }

  if (
    scoreInfo?.bypass
  ) {
    return (
      '✅ Ponto de correção registrado (+1) • isento de cooldown.'
    );
  }

  if (
    scoreInfo?.scored
  ) {
    return (
      '✅ Ponto de correção registrado (+1).'
    );
  }

  const remainingMinutes =
    Math.max(
      1,
      Math.ceil(
        Number(
          scoreInfo
            ?.remaining ||
          0
        ) /
        60000
      )
    );

  return (
    `⏳ A decisão foi aplicada, mas o ponto está em cooldown (${remainingMinutes} min restantes).`
  );
}

// =====================================================
// FUNÇÃO PRINCIPAL
// =====================================================
//
// É esta função que interviewIntelligence.js importa:
//
// import {
//   scoreInterviewDecision
// } from '../utils/correcaoScore.js';
//
// =====================================================

export async function scoreInterviewDecision({
  client,
  actorMember,
  actorUser,
  targetChannel,
  candidateId,
  questions = [],
  decision,
  reportMessageId,
}) {
  // ===================================================
  // VALIDAÇÃO BÁSICA
  // ===================================================

  if (
    !client ||
    !actorUser?.id ||
    !targetChannel?.id
  ) {
    throw new Error(
      'Dados insuficientes para registrar o ponto de correção.'
    );
  }

  if (
    actorMember?.id &&
    String(
      actorMember.id
    ) !==
      String(
        actorUser.id
      )
  ) {
    throw new Error(
      'O membro responsável pela decisão não corresponde ao usuário da interação.'
    );
  }

  const normalizedReportId =
    String(
      reportMessageId ||
      ''
    ).trim();

  // ===================================================
  // ANTI-DUPLICIDADE PERSISTENTE
  // ===================================================

  if (
    normalizedReportId
  ) {
    const existing =
      getExistingDecisionRecord(
        normalizedReportId
      );

    if (
      existing
    ) {
      const duplicateResult = {
        scored: false,
        remaining: 0,
        bypass: false,
        blockedByCategory: false,
        duplicate: true,
        previous: existing,
      };

      duplicateResult.label =
        buildScoreLabel({
          scoreInfo:
            duplicateResult,

          actorUserId:
            actorUser.id,
        });

      return duplicateResult;
    }

    // Proteção contra dois cliques simultâneos.
    if (
      DECISION_SCORE_LOCKS.has(
        normalizedReportId
      )
    ) {
      const duplicateResult = {
        scored: false,
        remaining: 0,
        bypass: false,
        blockedByCategory: false,
        duplicate: true,
      };

      duplicateResult.label =
        buildScoreLabel({
          scoreInfo:
            duplicateResult,

          actorUserId:
            actorUser.id,
        });

      return duplicateResult;
    }

    DECISION_SCORE_LOCKS.add(
      normalizedReportId
    );
  }

  try {
    // =================================================
    // REGRA DA CATEGORIA
    // =================================================

    const canScoreHere =
      hasAnywhereBypass(
        actorUser.id
      ) ||
      isAllowedCorrecaoCategory(
        targetChannel
      );

    // =================================================
    // COOLDOWN
    // =================================================

    const scoreInfo =
      canScoreHere
        ? checkCooldown(
            actorUser.id,
            actorMember
          )
        : {
            scored: false,
            remaining: 0,
            bypass: false,
            blockedByCategory: true,
          };

    // =================================================
    // QUESTÕES
    // =================================================

    const uniqueQuestions =
      [
        ...new Set(
          (
            Array.isArray(
              questions
            )
              ? questions
              : []
          )
            .map(
              (value) =>
                Number(
                  value
                )
            )
            .filter(
              (value) =>
                Number.isInteger(
                  value
                ) &&
                value >= 1 &&
                value <= 30
            )
        ),
      ];

    // =================================================
    // ANTI-FARM VISUAL
    // =================================================

    let antiFarmText =
      '❌ Não pontuou';

    if (
      scoreInfo
        .blockedByCategory
    ) {
      antiFarmText =
        '🚫 Fora da categoria permitida';
    } else if (
      scoreInfo.bypass &&
      hasAnywhereBypass(
        actorUser.id
      )
    ) {
      antiFarmText =
        '✅ Pontuou (+1) • Isento de cooldown e categoria';
    } else if (
      scoreInfo.bypass
    ) {
      antiFarmText =
        '✅ Pontuou (+1) • Isento de cooldown';
    } else if (
      scoreInfo.scored
    ) {
      antiFarmText =
        '✅ Pontuou (+1)';
    } else {
      antiFarmText =
        `⏳ Cooldown (${Math.ceil(
          Number(
            scoreInfo.remaining ||
            0
          ) /
          60000
        )}m)`;
    }

    // =================================================
    // LOG
    // =================================================

    const canalLogs =
      await client.channels
        .fetch(
          CANAL_LOGS_CORRECAO
        )
        .catch(
          (error) => {
            console.error(
              '[CORRECAO SCORE] Erro ao buscar canal de logs:',
              CANAL_LOGS_CORRECAO,
              error
            );

            return null;
          }
        );

    if (
      !canalLogs
        ?.isTextBased?.()
    ) {
      console.error(
        `[CORRECAO SCORE] Canal de logs não encontrado ou inacessível: ${CANAL_LOGS_CORRECAO}`
      );
    } else {
      const logEmbed =
        new EmbedBuilder()
          .setTitle(
            '📝 Log de Correção de Entrevista'
          )
          .setColor(
            '#00ffff'
          )
          .addFields(
            {
              name:
                '🧑‍🏫 Creator que corrigiu',

              value:
                `<@${actorUser.id}> (\`${actorUser.id}\`)`,

              inline:
                true,
            },

            {
              name:
                '👤 Candidato (Opener)',

              value:
                candidateId
                  ? `<@${candidateId}>`
                  : 'Desconhecido',

              inline:
                true,
            },

            {
              name:
                '📍 Canal',

              value:
                `<#${targetChannel.id}>`,

              inline:
                true,
            },

            {
              name:
                '🗂️ Regra de pontuação',

              value:
                hasAnywhereBypass(
                  actorUser.id
                )
                  ? '✅ Livre em qualquer canal'
                  : (
                      isAllowedCorrecaoCategory(
                        targetChannel
                      )
                        ? '✅ Categoria válida'
                        : '❌ Fora da categoria válida'
                    ),

              inline:
                true,
            },

            {
              name:
                '❓ Questões Corrigidas',

              value:
                uniqueQuestions.length
                  ? uniqueQuestions.join(
                      ', '
                    )
                  : (
                      'Decisão final sem envio de gabarito detalhado.'
                    ),

              inline:
                false,
            },

            {
              name:
                '⚖️ Decisão aplicada',

              value:
                decision ===
                'reject'
                  ? '❌ REPROVAÇÃO'
                  : '✅ APROVAÇÃO',

              inline:
                true,
            },

            {
              name:
                '🧾 Origem automática',

              value:
                normalizedReportId
                  ? `Relatório: \`${normalizedReportId}\``
                  : 'Relatório não informado.',

              inline:
                false,
            },

            {
              name:
                '🕒 Data/Hora',

              value:
                `<t:${Math.floor(
                  Date.now() /
                  1000
                )}:F>`,

              inline:
                false,
            },

            {
              name:
                '🧠 Anti-farm',

              value:
                antiFarmText,

              inline:
                false,
            }
          )
          .setFooter({
            text:
              'Sistema de Correção • SantaCreators',
          })
          .setTimestamp();

      if (
        actorUser
          .displayAvatarURL
      ) {
        logEmbed.setThumbnail(
          actorUser.displayAvatarURL({
            dynamic: true,
          })
        );
      }

      await canalLogs
        .send({
          embeds: [
            logEmbed,
          ],
        })
        .catch(
          (error) => {
            console.error(
              '[CORRECAO SCORE] Erro ao enviar log de correção:',
              error
            );
          }
        );
    }

    // =================================================
    // PONTO DO RANKING
    // =================================================
    //
    // Mesmo evento emitido pelo !correcao.
    // =================================================

    if (
      scoreInfo.scored
    ) {
      dashEmit(
        'correcao:usado',
        {
          userId:
            actorUser.id,

          __at:
            Date.now(),

          source:
            'correcao',
        }
      );
    }

    // =================================================
    // RESULTADO
    // =================================================

    const finalResult = {
      ...scoreInfo,
      duplicate: false,
    };

    finalResult.label =
      buildScoreLabel({
        scoreInfo:
          finalResult,

        actorUserId:
          actorUser.id,
      });

    // =================================================
    // MARCA RELATÓRIO COMO PROCESSADO
    // =================================================
    //
    // Fazemos isso mesmo se estiver em cooldown.
    //
    // Assim o mesmo relatório não poderá ser usado
    // novamente uma hora depois para conseguir um ponto.
    // =================================================

    if (
      normalizedReportId
    ) {
      saveDecisionRecord(
        normalizedReportId,
        {
          actorId:
            String(
              actorUser.id
            ),

          candidateId:
            candidateId
              ? String(
                  candidateId
                )
              : null,

          channelId:
            String(
              targetChannel.id
            ),

          decision:
            String(
              decision ||
              ''
            ),

          scored:
            Boolean(
              finalResult.scored
            ),

          remaining:
            Number(
              finalResult.remaining ||
              0
            ),

          bypass:
            Boolean(
              finalResult.bypass
            ),

          blockedByCategory:
            Boolean(
              finalResult
                .blockedByCategory
            ),

          processedAt:
            Date.now(),
        }
      );
    }

    return finalResult;
  } finally {
    if (
      normalizedReportId
    ) {
      DECISION_SCORE_LOCKS.delete(
        normalizedReportId
      );
    }
  }
}