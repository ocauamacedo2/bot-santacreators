import express from "express";

import {
  PermissionFlagsBits,
} from "discord.js";

import {
  getFivemRetentionSiteSnapshot,
} from "./fivemRetentionStatus.js";

import {
  getSetStaffSiteOptions,
  getSetStaffSiteSnapshot,
  submitSetStaffFromSite,
} from "./setStaffV2.js";

import {
  getHallSiteSnapshot,
} from "./hallDaFama.js";

import {
  getHierarchySiteSnapshot,
  hierarchySiteAction,
} from "./hierarquiaDivisoes.js";

import {
  getWeeklyRankingSiteSnapshot,
  adjustWeeklyPointsFromSite,
} from "./scGeralWeeklyRanking.js";

import {
  getCronogramaData,
} from "./cronogramaCreators.js";

import {
  generateSantaCreatorsStandaloneText,
} from "./iaChatAuto.js";


const GUILD_ID =
  String(
    process.env.DISCORD_GUILD_ID ||
    "1262262852782129183"
  );


const CHANNELS = {
  retention: [
    "1501321157259956244",
    "1513967298690420876",
    "1513967343317942382",
    "1513967375769272400",
    "1513967404059983913",
  ],

  staff: [
    "1379024704957841509",
  ],

  hall: [
    "1518696187237236816",
    "1518696133071863838",
  ],

  quiz: [
    "1495330319715532880",
  ],

  gi: [
    "1417366889398796318",
  ],

  hierarchy: [
    "1370830395637239928",
  ],

  weekly: [
    "1415387000416243722",
  ],

  cronograma: [
    "1474605177771397223",
  ],

  ai: [
    "1506520202576400404",
  ],
};


function safeSecretEqual(
  received,
  expected
) {
  if (
    !received ||
    !expected
  ) {
    return false;
  }

  return (
    String(received) ===
    `Bearer ${expected}`
  );
}


async function canViewAnyChannel(
  client,
  member,
  channelIds
) {
  for (
    const channelId
    of channelIds
  ) {
    const channel =
      await client.channels
        .fetch(
          channelId
        )
        .catch(
          () => null
        );

    if (!channel) {
      continue;
    }

    const permissions =
      channel.permissionsFor(
        member
      );

    if (
      permissions?.has(
        PermissionFlagsBits
          .ViewChannel
      )
    ) {
      return true;
    }
  }

  return false;
}


async function assertModuleView(
  client,
  member,
  moduleKey
) {
  const channelIds =
    CHANNELS[
      moduleKey
    ];

  if (!channelIds) {
    throw new Error(
      "Módulo desconhecido."
    );
  }

  const allowed =
    await canViewAnyChannel(
      client,
      member,
      channelIds
    );

  if (!allowed) {
    const error =
      new Error(
        "Você não possui acesso a esta área no Discord."
      );

    error.status =
      403;

    throw error;
  }
}


export function installSiteHubApi({
  app,
  client,
}) {
  if (
    !app ||
    !client
  ) {
    throw new Error(
      "installSiteHubApi precisa de app e client."
    );
  }

  const secret =
    String(
      process.env
        .SANTA_SHARE_BRIDGE_SECRET ||
      process.env
        .BRIDGE_SECRET ||
      ""
    ).trim();

  if (
    secret.length < 64
  ) {
    console.error(
      "[SITE HUB] BRIDGE_SECRET inválido. API administrativa não iniciada."
    );

    return;
  }

  app.post(
    "/site-hub",

    express.json({
      limit:
        "128kb",
    }),

    async (
      req,
      res
    ) => {
      res.setHeader(
        "Cache-Control",
        "no-store"
      );

      try {
        if (
          !safeSecretEqual(
            req.headers
              .authorization,
            secret
          )
        ) {
          return res
            .status(401)
            .json({
              error:
                "Ponte não autorizada.",
            });
        }

        const guildId =
          String(
            req.body
              ?.guildId ||
            ""
          );

        const actorId =
          String(
            req.body
              ?.actorId ||
            ""
          );

        const action =
          String(
            req.body
              ?.action ||
            ""
          );

        const payload =
          req.body
            ?.payload &&
          typeof req.body
            .payload ===
            "object"
            ? req.body
                .payload
            : {};

        if (
          guildId !==
          GUILD_ID
        ) {
          return res
            .status(400)
            .json({
              error:
                "Servidor inválido.",
            });
        }

        if (
          !/^\d{17,20}$/.test(
            actorId
          )
        ) {
          return res
            .status(400)
            .json({
              error:
                "Usuário inválido.",
            });
        }

        const guild =
          await client.guilds
            .fetch(
              GUILD_ID
            );

        const member =
          await guild.members
            .fetch(
              actorId
            )
            .catch(
              () => null
            );

        if (!member) {
          return res
            .status(403)
            .json({
              error:
                "Você não está no servidor Santa Creators.",
            });
        }


        // ==========================================
        // BOOTSTRAP
        // ==========================================

        if (
          action ===
          "bootstrap"
        ) {
          const entries =
            await Promise.all(
              Object.keys(
                CHANNELS
              ).map(
                async key => [
                  key,

                  await canViewAnyChannel(
                    client,
                    member,
                    CHANNELS[
                      key
                    ]
                  ),
                ]
              )
            );

          return res.json({
            modules:
              Object.fromEntries(
                entries
              ),
          });
        }


        // ==========================================
        // CADASTRO / SET STAFF
        // ==========================================

        if (
          action ===
          "profile-options"
        ) {
          return res.json(
            getSetStaffSiteOptions()
          );
        }

        if (
          action ===
          "staff.submit"
        ) {
          const result =
            await submitSetStaffFromSite({
              client,
              guild,

              userId:
                actorId,

              data:
                payload,
            });

          return res.json(
            result
          );
        }

        if (
          action ===
          "staff.snapshot"
        ) {
          await assertModuleView(
            client,
            member,
            "staff"
          );

          return res.json(
            await getSetStaffSiteSnapshot({
              guild,
              actorId,
            })
          );
        }


        // ==========================================
        // RETENÇÃO
        // ==========================================

        if (
          action ===
          "retention.snapshot"
        ) {
          await assertModuleView(
            client,
            member,
            "retention"
          );

          return res.json(
            await getFivemRetentionSiteSnapshot({
              cityKey:
                payload.city ||
                null,
            })
          );
        }


        // ==========================================
        // HALL / GG
        // ==========================================

        if (
          action ===
          "hall.snapshot"
        ) {
          await assertModuleView(
            client,
            member,
            "hall"
          );

          return res.json(
            await getHallSiteSnapshot({
              guild,
              actorId,
            })
          );
        }


        // ==========================================
        // QUIZ
        // ==========================================

        if (
          action ===
          "quiz.snapshot"
        ) {
          await assertModuleView(
            client,
            member,
            "quiz"
          );

          if (
            !globalThis
              .__SC_QUIZ_SITE_API__
          ) {
            throw new Error(
              "Quiz ainda está inicializando."
            );
          }

          return res.json(
            await globalThis
              .__SC_QUIZ_SITE_API__
              .snapshot({
                actorId,
              })
          );
        }

        if (
          action ===
          "quiz.reset"
        ) {
          await assertModuleView(
            client,
            member,
            "quiz"
          );

          if (
            !globalThis
              .__SC_QUIZ_SITE_API__
          ) {
            throw new Error(
              "Quiz ainda está inicializando."
            );
          }

          return res.json(
            await globalThis
              .__SC_QUIZ_SITE_API__
              .reset({
                actorId,
              })
          );
        }


        // ==========================================
        // CONTROLE GI
        // ==========================================

        if (
          action ===
          "gi.snapshot"
        ) {
          await assertModuleView(
            client,
            member,
            "gi"
          );

          if (
            !globalThis
              .__SC_GI_SITE_API__
          ) {
            throw new Error(
              "Controle GI ainda está inicializando."
            );
          }

          return res.json(
            await globalThis
              .__SC_GI_SITE_API__
              .snapshot({
                actorId,
              })
          );
        }

        if (
          action ===
          "gi.action"
        ) {
          await assertModuleView(
            client,
            member,
            "gi"
          );

          if (
            !globalThis
              .__SC_GI_SITE_API__
          ) {
            throw new Error(
              "Controle GI ainda está inicializando."
            );
          }

          return res.json(
            await globalThis
              .__SC_GI_SITE_API__
              .action({
                actorId,

                action:
                  payload.action,

                payload:
                  payload.payload ||
                  {},
              })
          );
        }


        // ==========================================
        // HIERARQUIA
        // ==========================================

        if (
          action ===
          "hierarchy.snapshot"
        ) {
          await assertModuleView(
            client,
            member,
            "hierarchy"
          );

          return res.json(
            await getHierarchySiteSnapshot({
              guild,
              actorId,
            })
          );
        }

        if (
          action ===
          "hierarchy.action"
        ) {
          await assertModuleView(
            client,
            member,
            "hierarchy"
          );

          return res.json(
            await hierarchySiteAction({
              client,
              guild,
              actorId,

              action:
                payload.action,

              targetId:
                payload.targetId,

              values:
                payload.values,
            })
          );
        }


        // ==========================================
        // WEEKLY RANK
        // ==========================================

        if (
          action ===
          "weekly.snapshot"
        ) {
          await assertModuleView(
            client,
            member,
            "weekly"
          );

          return res.json(
            await getWeeklyRankingSiteSnapshot({
              client,
              guild,
              actorId,
            })
          );
        }

        if (
          action ===
          "weekly.adjust"
        ) {
          await assertModuleView(
            client,
            member,
            "weekly"
          );

          return res.json(
            await adjustWeeklyPointsFromSite({
              client,
              guild,
              actorId,

              targetId:
                payload.targetId,

              amount:
                payload.amount,

              mode:
                payload.mode,
            })
          );
        }


        // ==========================================
        // CRONOGRAMA
        // ==========================================

        if (
          action ===
          "cronograma.snapshot"
        ) {
          await assertModuleView(
            client,
            member,
            "cronograma"
          );

          return res.json({
            data:
              getCronogramaData(),
          });
        }


        // ==========================================
        // IA
        // ==========================================

        if (
          action ===
          "ai.ask"
        ) {
          await assertModuleView(
            client,
            member,
            "ai"
          );

          const prompt =
            String(
              payload.prompt ||
              ""
            ).trim();

          if (
            !prompt ||
            prompt.length >
              4000
          ) {
            throw new Error(
              "Mensagem inválida."
            );
          }

          const answer =
            await generateSantaCreatorsStandaloneText({
              prompt,

              label:
                `Creators Hub • ${actorId}`,

              fast:
                true,

              maxOutputTokens:
                2000,
            });

          return res.json({
            answer:
              String(
                answer ||
                ""
              ),
          });
        }


        return res
          .status(404)
          .json({
            error:
              "Ação do Hub não encontrada.",
          });

      } catch (error) {
        console.error(
          "[SITE HUB]",
          error
        );

        return res
          .status(
            Number(
              error?.status
            ) ||
            500
          )
          .json({
            error:
              error?.message ||
              "Falha no Creators Hub.",
          });
      }
    }
  );

  console.log(
    "[SITE HUB] API Discord ↔ Site instalada."
  );
}