import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  OverwriteType,
} from "discord.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =====================================================
// CONFIGURAÇÃO GERAL
// =====================================================

const GUILD_ID = "1262262852782129183";

const STATE_FILE = path.join(
  __dirname,
  "..",
  "data",
  "evolution_hierarchy.json"
);

export const EVOLUTION_TIERS = Object.freeze({
  TEAM: 1,
  COORDINATION: 2,
  RESPONSIBLES: 3,
});

const CHANNEL_BY_TIER = Object.freeze({
  [EVOLUTION_TIERS.TEAM]:
    "1389401636446802042",

  [EVOLUTION_TIERS.COORDINATION]:
    "1549505905228259489",

  [EVOLUTION_TIERS.RESPONSIBLES]:
    "1549505951009218641",
});

const ROLE = Object.freeze({
  OWNER:
    "1262262852949905408",

  RESP_CREATORS:
    "1352408327983861844",

  RESP_INFLU:
    "1262262852949905409",

  RESP_LIDER:
    "1352407252216184833",

  COORD_CREATORS:
    "1388976314253312100",

  GESTOR_CREATORS:
    "1388975939161161728",

  MANAGER_CREATORS:
    "1388976155830255697",

  SOCIAL_MEDIAS:
    "1388976094920704141",

  EQUIPE_MANAGER:
    "1392678638176043029",

  EQUIPE_SOCIAL_MEDIAS:
    "1387253972661964840",

  EQUIPE_CREATORS:
    "1352429001188180039",
});

const ADMIN_USERS = new Set([
  "660311795327828008",
]);

/*
 * Responsáveis:
 * podem visualizar todas as três fases.
 */

const RESPONSIBLE_ROLES = new Set([
  ROLE.OWNER,
  ROLE.RESP_CREATORS,
  ROLE.RESP_INFLU,
  ROLE.RESP_LIDER,
]);

/*
 * Coordenação:
 * pode avaliar Equipe e Gestão.
 *
 * Quando uma pessoa possui Coord. Creators,
 * o próprio tópico dela fica na fase dos
 * Responsáveis para que ela não veja os
 * feedbacks escritos sobre ela.
 */

const COORDINATOR_ROLES = new Set([
  ROLE.COORD_CREATORS,
]);

/*
 * Gestão:
 * pode avaliar os membros da Equipe.
 *
 * O próprio tópico de um Gestor, Manager
 * Creators ou Social Medias fica na fase
 * da Coordenação.
 */

const MANAGEMENT_ROLES = new Set([
  ROLE.GESTOR_CREATORS,
  ROLE.MANAGER_CREATORS,
  ROLE.SOCIAL_MEDIAS,
]);

/*
 * Equipe:
 * o tópico fica na primeira fase.
 */

const TEAM_ROLES = new Set([
  ROLE.EQUIPE_MANAGER,
  ROLE.EQUIPE_SOCIAL_MEDIAS,
  ROLE.EQUIPE_CREATORS,
]);

/*
 * Quem pode avaliar os tópicos da Equipe.
 */

const TEAM_EVALUATOR_ROLES = new Set([
  ...RESPONSIBLE_ROLES,
  ...COORDINATOR_ROLES,
  ...MANAGEMENT_ROLES,
]);

/*
 * Quem pode avaliar os tópicos da Gestão.
 *
 * Os próprios Gestores não estão aqui.
 */

const MANAGEMENT_EVALUATOR_ROLES = new Set([
  ...RESPONSIBLE_ROLES,
  ...COORDINATOR_ROLES,
]);

/*
 * Quem pode avaliar os tópicos da Coordenação.
 *
 * Os próprios Coordenadores não estão aqui.
 */

const COORDINATION_EVALUATOR_ROLES = new Set([
  ...RESPONSIBLE_ROLES,
]);
const TIER_NAME = Object.freeze({
  [EVOLUTION_TIERS.TEAM]:
    "Equipe Creators",

  [EVOLUTION_TIERS.COORDINATION]:
    "Coordenação",

  [EVOLUTION_TIERS.RESPONSIBLES]:
    "Responsáveis",
});

// Evita duas migrações simultâneas para o mesmo sistema.
let syncQueue = Promise.resolve();

// =====================================================
// ESTADO
// =====================================================

function emptyState() {
  return {
    version: 1,
    users: {},
  };
}

function readState() {
  try {
    const parsed = JSON.parse(
      fs.readFileSync(
        STATE_FILE,
        "utf8"
      )
    );

    if (
      !parsed ||
      typeof parsed !== "object" ||
      !parsed.users ||
      typeof parsed.users !== "object" ||
      Array.isArray(parsed.users)
    ) {
      throw new Error("Formato inválido do estado da evolução.");
    }

    return parsed;
  } catch (error) {
    if (error.code === "ENOENT") {
      return emptyState();
    }

    throw new Error(
      `Não foi possível ler ${STATE_FILE}: ${error.message}`
    );
  }
}

function writeState(state) {
  fs.mkdirSync(
    path.dirname(STATE_FILE),
    {
      recursive: true,
    }
  );

  const tempFile =
    `${STATE_FILE}.tmp`;

  fs.writeFileSync(
    tempFile,
    JSON.stringify(
      state,
      null,
      2
    ),
    "utf8"
  );

  fs.renameSync(
    tempFile,
    STATE_FILE
  );
}

// =====================================================
// HIERARQUIA
// =====================================================

function hasAnyRole(
  member,
  roleSet
) {
  return (
    member?.roles?.cache?.some(
      (role) =>
        roleSet.has(role.id)
    ) || false
  );
}

export function getEvolutionTierForMember(
  member
) {
  if (!member) {
    return null;
  }

  /*
   * A fase mais alta sempre vence.
   *
   * Coord. Creators sobe para o canal dos
   * Responsáveis. Assim, o Coordenador não
   * consegue visualizar as avaliações feitas
   * sobre ele mesmo.
   *
   * Os Responsáveis também permanecem na
   * fase mais reservada disponível.
   */

  if (
    ADMIN_USERS.has(member.id) ||
    hasAnyRole(
      member,
      RESPONSIBLE_ROLES
    ) ||
    hasAnyRole(
      member,
      COORDINATOR_ROLES
    )
  ) {
    return EVOLUTION_TIERS.RESPONSIBLES;
  }

  /*
   * Gestor Creators, Manager Creators e
   * Social Medias possuem seus tópicos no
   * canal da Coordenação.
   *
   * Como MANAGEMENT_ROLES não recebe acesso
   * ao canal da Coordenação, essas pessoas
   * não enxergam os próprios feedbacks.
   */

  if (
    hasAnyRole(
      member,
      MANAGEMENT_ROLES
    )
  ) {
    return EVOLUTION_TIERS.COORDINATION;
  }

  /*
   * Os cargos iniciais permanecem no
   * canal original da Equipe Creators.
   */

  if (
    hasAnyRole(
      member,
      TEAM_ROLES
    )
  ) {
    return EVOLUTION_TIERS.TEAM;
  }

  return null;
}

// =====================================================
// LINKS E CANAIS
// =====================================================

function discordLink(
  guildId,
  channelId,
  messageId = null
) {
  return (
    `https://discord.com/channels/` +
    `${guildId}/${channelId}` +
    (
      messageId
        ? `/${messageId}`
        : ""
    )
  );
}

async function fetchChannel(
  client,
  channelId
) {
  return (
    client.channels.cache.get(
      channelId
    ) ||
    await client.channels
      .fetch(channelId)
      .catch(() => null)
  );
}

// =====================================================
// CONFIGURAÇÃO AUTOMÁTICA DOS CANAIS
// =====================================================

async function configureChannelPermissions(
  guild,
  channelId,
  tier
) {
  const channel =
    await guild.channels
      .fetch(channelId)
      .catch(() => null);

  if (!channel) {
    throw new Error(
      `Canal da evolução da fase ${tier} ` +
      `não encontrado: ${channelId}`
    );
  }

  /*
   * Define quem pode visualizar e escrever
   * em cada uma das três fases.
   */

  let allowedRoles =
    new Set();

  let deniedRoles =
    new Set();

  /*
   * FASE 1 — EQUIPE
   *
   * Gestores, Coordenadores e Responsáveis
   * podem avaliar a equipe.
   *
   * A própria Equipe não pode visualizar
   * os feedbacks reservados.
   */

  if (
    tier ===
    EVOLUTION_TIERS.TEAM
  ) {
    allowedRoles =
      TEAM_EVALUATOR_ROLES;

    deniedRoles =
      new Set([
        ...TEAM_ROLES,
      ]);
  }

  /*
   * FASE 2 — GESTÃO
   *
   * Somente Coordenadores e Responsáveis
   * podem avaliar os Gestores.
   *
   * Gestores e Equipe não podem visualizar.
   */

  if (
    tier ===
    EVOLUTION_TIERS.COORDINATION
  ) {
    allowedRoles =
      MANAGEMENT_EVALUATOR_ROLES;

    deniedRoles =
      new Set([
        ...MANAGEMENT_ROLES,
        ...TEAM_ROLES,
      ]);
  }

  /*
   * FASE 3 — COORDENAÇÃO E RESPONSÁVEIS
   *
   * Somente Responsáveis podem visualizar.
   *
   * Coordenadores, Gestores e Equipe
   * não podem visualizar.
   */

  if (
    tier ===
    EVOLUTION_TIERS.RESPONSIBLES
  ) {
    allowedRoles =
      COORDINATION_EVALUATOR_ROLES;

    deniedRoles =
      new Set([
        ...COORDINATOR_ROLES,
        ...MANAGEMENT_ROLES,
        ...TEAM_ROLES,
      ]);
  }

  /*
   * Bloqueia o canal para @everyone.
   *
   * Depois disso, somente os cargos que
   * pertencem ao allowedRoles recebem acesso.
   */

  await channel
    .permissionOverwrites
    .edit(
      guild.roles.everyone,
      {
        ViewChannel: false,
        ReadMessageHistory: false,
        SendMessages: false,
        SendMessagesInThreads: false,
        CreatePublicThreads: false,
        CreatePrivateThreads: false,

        /*
         * Impede que permissões gerais de cargos
         * permitam reabrir tópicos históricos.
         */

        ManageThreads: false,
      },
      {
        reason:
          "Proteção automática da evolução por hierarquia",
      }
    );

  /*
   * Remove permissões antigas de cargos e
   * usuários que não pertencem às regras
   * atuais desse canal.
   *
   * Isso é importante porque apenas bloquear
   * @everyone não elimina uma permissão
   * positiva antiga configurada diretamente.
   */

  const botUserId =
    guild.members.me?.id ||
    guild.client.user?.id ||
    null;

  for (
    const overwrite
    of channel
      .permissionOverwrites
      .cache
      .values()
  ) {
    if (
      overwrite.id ===
      guild.roles.everyone.id
    ) {
      continue;
    }

    /*
     * Permissão vinculada diretamente
     * a um cargo.
     */

    if (
      overwrite.type ===
      OverwriteType.Role
    ) {
      const isKnownAllowedRole =
        allowedRoles.has(
          overwrite.id
        );

      const isKnownDeniedRole =
        deniedRoles.has(
          overwrite.id
        );

      if (
        !isKnownAllowedRole &&
        !isKnownDeniedRole
      ) {
        await channel
          .permissionOverwrites
          .delete(
            overwrite.id,
            "Removendo permissão antiga da evolução"
          );
      }

      continue;
    }

    /*
     * Permissão vinculada diretamente
     * a uma pessoa.
     *
     * Mantém somente o bot e os usuários
     * administrativos configurados.
     */

    if (
      overwrite.type ===
      OverwriteType.Member
    ) {
      const isBot =
        botUserId &&
        overwrite.id ===
          botUserId;

      const isAdminUser =
        ADMIN_USERS.has(
          overwrite.id
        );

      if (
        !isBot &&
        !isAdminUser
      ) {
        await channel
          .permissionOverwrites
          .delete(
            overwrite.id,
            "Removendo acesso individual antigo da evolução"
          );
      }
    }
  }

  /*
   * Aplica bloqueio explícito nos cargos
   * que não podem acessar esta fase.
   */

  for (
    const roleId
    of deniedRoles
  ) {
    if (
      !guild.roles.cache.has(
        roleId
      )
    ) {
      continue;
    }

    await channel
      .permissionOverwrites
      .edit(
        roleId,
        {
          ViewChannel: false,
          ReadMessageHistory: false,
          SendMessages: false,
          SendMessagesInThreads: false,
          CreatePublicThreads: false,
          CreatePrivateThreads: false,

          /*
           * Mesmo que esse cargo possua
           * Gerenciar tópicos no servidor,
           * dentro deste canal não poderá
           * reabrir tópicos históricos.
           */

          ManageThreads: false,
        },
        {
          reason:
            "Bloqueio automático de avaliação por hierarquia",
        }
      );
  }

  /*
   * Libera os cargos autorizados.
   */

  for (
    const roleId
    of allowedRoles
  ) {
    if (
      !guild.roles.cache.has(
        roleId
      )
    ) {
      continue;
    }

    await channel
      .permissionOverwrites
      .edit(
        roleId,
        {
          ViewChannel: true,
          ReadMessageHistory: true,
          SendMessages: true,
          SendMessagesInThreads: true,

          /*
           * Pode avaliar tópicos ativos,
           * mas não pode reabrir um tópico
           * histórico bloqueado.
           */

          CreatePublicThreads: false,
          CreatePrivateThreads: false,
          ManageThreads: false,
        },
        {
          reason:
            "Acesso automático de avaliação por hierarquia",
        }
      );
  }

  /*
   * Garante o acesso do próprio bot.
   */

  if (botUserId) {
    await channel
      .permissionOverwrites
      .edit(
        botUserId,
        {
          ViewChannel: true,
          ReadMessageHistory: true,
          SendMessages: true,
          SendMessagesInThreads: true,
          CreatePublicThreads: true,
          CreatePrivateThreads: true,
          ManageMessages: true,
          ManageThreads: true,
        },
        {
          reason:
            "Acesso operacional do bot à evolução",
        }
      );
  }

  /*
   * Bypass administrativo do Macedo.
   */

  for (
    const userId
    of ADMIN_USERS
  ) {
    await channel
      .permissionOverwrites
      .edit(
        userId,
        {
          ViewChannel: true,
          ReadMessageHistory: true,
          SendMessages: true,
          SendMessagesInThreads: true,
          CreatePublicThreads: true,
          CreatePrivateThreads: true,
          ManageThreads: false,
        },
        {
          reason:
            "Bypass administrativo da evolução",
        }
      );
  }

  return channel;
}

export async function configureEvolutionHierarchyChannels(
  client,
  guildId = GUILD_ID
) {
  const guild =
    client.guilds.cache.get(
      guildId
    ) ||
    await client.guilds
      .fetch(guildId)
      .catch(() => null);

  if (!guild) {
    throw new Error(
      `Servidor não encontrado: ${guildId}`
    );
  }

  await guild.roles
    .fetch()
    .catch(() => null);

  for (
    const tier
    of Object.values(
      EVOLUTION_TIERS
    )
  ) {
    await configureChannelPermissions(
      guild,
      CHANNEL_BY_TIER[tier],
      tier
    );
  }
}

// =====================================================
// LEITURA COMPLETA DAS MENSAGENS
// =====================================================

async function fetchAllMessages(
  thread
) {
  const allMessages = [];
  let before;

  while (true) {
    const page =
      await thread.messages.fetch({
        limit: 100,
        ...(
          before
            ? { before }
            : {}
        ),
      });

    if (!page.size) {
      break;
    }

    allMessages.push(
      ...page.values()
    );

    before =
      page.last().id;

    if (page.size < 100) {
      break;
    }
  }

  return allMessages.sort(
    (messageA, messageB) =>
      messageA.createdTimestamp -
      messageB.createdTimestamp
  );
}

function trimText(
  value,
  maximum
) {
  const text =
    String(value || "")
      .trim();

  if (
    text.length <= maximum
  ) {
    return text;
  }

  return (
    `${text.slice(
      0,
      maximum - 1
    )}…`
  );
}

// =====================================================
// RECRIAÇÃO ORGANIZADA DAS MENSAGENS
// =====================================================

function createArchivedMessageEmbed(
  message
) {
  const author =
    message.author;

  const attachments =
    [
      ...message
        .attachments
        .values(),
    ]
      .map(
        (
          attachment,
          index
        ) => {
          const attachmentName =
            attachment.name ||
            "arquivo";

          return (
            `[Anexo ${index + 1}: ` +
            `${attachmentName}]` +
            `(${attachment.url})`
          );
        }
      )
      .join("\n");

  const originalEmbeds =
    message.embeds
      .map(
        (
          embed,
          index
        ) => {
          const title =
            embed.title
              ? `**${embed.title}**\n`
              : "";

          const description =
            embed.description || "";

          const fields =
            (
              embed.fields || []
            )
              .map(
                (field) =>
                  `**${field.name}:** ` +
                  `${field.value}`
              )
              .join("\n");

          return [
            `**Embed ${index + 1}**`,
            title + description,
            fields,
          ]
            .filter(Boolean)
            .join("\n");
        }
      )
      .join("\n\n");

  const completeBody =
    [
      message.content,
      originalEmbeds,
      attachments,
    ]
      .filter(Boolean)
      .join("\n\n") ||
    "*(mensagem sem texto)*";

  const displayName =
    author?.globalName ||
    author?.username ||
    "Usuário desconhecido";

  const username =
    author?.username ||
    "desconhecido";

  const userId =
    author?.id ||
    "sem ID";

  return new EmbedBuilder()
    .setAuthor({
      name:
        `${displayName} • ` +
        `@${username} • ` +
        `${userId}`,

      iconURL:
        author?.displayAvatarURL?.({
          size: 128,
        }) ||
        undefined,
    })
    .setDescription(
      trimText(
        completeBody,
        4096
      )
    )
    .setColor(
      author?.bot
        ? 0x5865f2
        : 0x9b59b6
    )
    .setFooter({
      text:
        `Cópia histórica • ` +
        `origem ${message.id}`,
    })
    .setTimestamp(
      message.createdAt
    );
}

async function archivedMessageAlreadyExists(
  targetThread,
  sourceMessageId
) {
  const messages =
    await targetThread
      .messages
      .fetch({
        limit: 100,
      })
      .catch(() => null);

  if (!messages) {
    return false;
  }

  return messages.some(
    (message) =>
      message.embeds?.some(
        (embed) =>
          String(
            embed.footer?.text ||
            ""
          ).includes(
            `origem ${sourceMessageId}`
          )
      )
  );
}

async function copyHistory(
  sourceThread,
  targetThread
) {
  const sourceTier = Number(
    Object.keys(CHANNEL_BY_TIER).find(
      (key) =>
        CHANNEL_BY_TIER[key] === sourceThread.parentId
    )
  );

  const targetTier = Number(
    Object.keys(CHANNEL_BY_TIER).find(
      (key) =>
        CHANNEL_BY_TIER[key] === targetThread.parentId
    )
  );

  if (!sourceTier || !targetTier) {
    throw new Error("Canal de migração desconhecido.");
  }

  /*
   * O histórico somente sobe.
   * Nunca copia para a mesma fase ou para uma inferior.
   */

  if (targetTier <= sourceTier) {
    return 0;
  }

  await setThreadMode(
    sourceThread,
    false,
    "Origem preservada como histórico"
  );

  await setThreadMode(
    targetThread,
    true,
    "Destino da promoção"
  );

  const messages =
    await fetchAllMessages(
      sourceThread
    );

  let copied = 0;

  for (
    const message
    of messages
  ) {
    const alreadyExists =
      await archivedMessageAlreadyExists(
        targetThread,
        message.id
      );

    if (alreadyExists) {
      continue;
    }

    await targetThread.send({
      embeds: [
        createArchivedMessageEmbed(
          message
        ),
      ],

      /*
       * Não recria os botões do registro antigo.
       *
       * Isso impede que um botão copiado
       * altere o tópico errado.
       */

      components: [],

      /*
       * Não notifica novamente todas as
       * pessoas mencionadas no histórico.
       */

      allowedMentions: {
        parse: [],
      },
    });

    copied += 1;
  }

  return copied;
}

// =====================================================
// PAINEL VISUAL DE LOCALIZAÇÃO
// =====================================================

function createStatusEmbed({
  member,
  tier,
  activeThread,
  allThreadIds,
}) {
  /*
   * Quando uma pessoa é rebaixada,
   * o tópico inferior não mostra links
   * dos níveis superiores.
   *
   * Isso evita exposição da existência
   * de históricos reservados.
   */

  const visibleLinks =
    Object.entries(
      allThreadIds
    )
      .filter(
        ([
          savedTier,
          threadId,
        ]) =>
          threadId &&
          Number(savedTier) <= tier
      )
      .map(
        ([
          savedTier,
          threadId,
        ]) => {
          const isCurrent =
            Number(savedTier) === tier;

          const status =
            isCurrent
              ? " — **ATIVO PARA ESCRITA**"
              : " — histórico bloqueado";

          return (
            `• ${TIER_NAME[savedTier]}: ` +
            `[abrir tópico](` +
            `${discordLink(
              member.guild.id,
              threadId
            )})` +
            `${status}`
          );
        }
      );

  return new EmbedBuilder()
    .setTitle(
      "🔐 Evolução organizada por hierarquia"
    )
    .setDescription(
      [
        `👤 **Membro:** <@${member.id}>`,

        `🪪 **Usuário:** ` +
        `${member.user.tag}`,

        `🆔 **ID Discord:** ` +
        `\`${member.id}\``,

        `📍 **Fase atual:** ` +
        `**${TIER_NAME[tier]}**`,

        `✍️ **Tópico ativo:** ` +
        `<#${activeThread.id}>`,

        "",

        "**Histórico disponível nesta fase**",

        ...visibleLinks,

        "",

        "Quando o cargo do membro mudar, " +
        "o bot atualizará automaticamente " +
        "qual tópico aceita novas mensagens.",
      ].join("\n")
    )
    .setThumbnail(
      member.user
        .displayAvatarURL({
          size: 256,
        })
    )
    .setColor(
      tier ===
      EVOLUTION_TIERS.RESPONSIBLES
        ? 0xe74c3c
        : tier ===
          EVOLUTION_TIERS.COORDINATION
          ? 0xf1c40f
          : 0x2ecc71
    )
    .setTimestamp();
}

function createStatusComponents(
  guildId,
  currentThreadId,
  activeThreadId
) {
  const isActive =
    currentThreadId ===
    activeThreadId;

  return [
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            `evolution:status:` +
            `${currentThreadId}`
          )
          .setLabel(
            isActive
              ? "✅ Tópico ativo para escrita"
              : "🔒 Histórico bloqueado"
          )
          .setStyle(
            isActive
              ? ButtonStyle.Success
              : ButtonStyle.Secondary
          )
          .setDisabled(true),

        new ButtonBuilder()
          .setLabel(
            "📍 Abrir tópico ativo"
          )
          .setStyle(
            ButtonStyle.Link
          )
          .setURL(
            discordLink(
              guildId,
              activeThreadId
            )
          )
      ),
  ];
}

async function updateStatusMessage(
  thread,
  payload
) {
  const messages =
    await fetchAllMessages(thread);

  const previous =
    messages?.find(
      (message) =>
        message.author.id ===
          thread.client.user.id &&
        message.embeds?.[0]?.title ===
          "🔐 Evolução organizada por hierarquia"
    );

  if (previous) {
    return previous.edit(
      payload
    );
  }

  return thread.send(
    payload
  );
}

// =====================================================
// BOTÕES DOS TÓPICOS ANTIGOS
// =====================================================

async function setFormsManagementButtonsDisabled(
  thread,
  disabled
) {
  const messages =
    await thread
      .messages
      .fetch({
        limit: 100,
      })
      .catch(() => null);

  if (!messages) {
    return;
  }

  for (
    const message
    of messages.values()
  ) {
    if (
      message.author.id !==
        thread.client.user.id ||
      !message.components?.length
    ) {
      continue;
    }

    let changed = false;

    const rows =
      message.components.map(
        (row) => {
          const rebuiltRow =
            ActionRowBuilder.from(
              row
            );

          rebuiltRow.components
            .forEach(
              (component) => {
                const customId =
                  component.data
                    ?.custom_id ||
                  "";

                const isFormsButton =
                  customId.startsWith(
                    "editar_id_"
                  ) ||
                  customId.startsWith(
                    "editar_area_"
                  ) ||
                  customId.startsWith(
                    "fc_toggle_status:"
                  );

                if (
                  isFormsButton
                ) {
                  component
                    .setDisabled(
                      disabled
                    );

                  changed = true;
                }
              }
            );

          return rebuiltRow;
        }
      );

    if (changed) {
      await message
        .edit({
          components: rows,
        })
        .catch(() => null);
    }
  }
}

// =====================================================
// TRAVAR E DESTRAVAR TÓPICOS
// =====================================================

async function setThreadMode(
  thread,
  active,
  reason
) {
  let current = await thread.fetch(true);

  if (active) {
    if (current.archived || current.locked) {
      await current.edit({
        archived: false,
        locked: false,
        reason,
      });
    }
  } else if (!current.archived || !current.locked) {
    /*
     * Um histórico já arquivado e travado não é reaberto.
     *
     * Quando está arquivado, mas ainda não possui trava,
     * a alteração precisa desarquivá-lo para aplicar
     * a trava e depois arquivá-lo novamente.
     */

    if (current.archived) {
      current = await current.edit({
        archived: false,
        locked: true,
        reason,
      });
    }

    await current.edit({
      archived: true,
      locked: true,
      reason,
    });
  }

  const confirmed = await thread.fetch(true);

  if (
    confirmed.archived !== !active ||
    confirmed.locked !== !active
  ) {
    throw new Error(
      `Não consegui confirmar a trava do tópico ${thread.id}.`
    );
  }

  return confirmed;
}

// =====================================================
// CRIAÇÃO DO TÓPICO DE UMA NOVA FASE
// =====================================================

async function createTierThread(
  parentChannel,
  member,
  tier,
  sourceThread
) {
  const topicName =
    trimText(
      (
        `${member.displayName || member.user.username}` +
        ` • ${TIER_NAME[tier]}`
      ),
      100
    );

  const starterEmbed =
    new EmbedBuilder()
      .setTitle(
        `👤 ${
          member.displayName ||
          member.user.username
        }`
      )
      .setDescription(
        [
          `<@${member.id}>`,

          `🪪 **Usuário:** ` +
          `${member.user.tag}`,

          `🆔 **ID Discord:** ` +
          `\`${member.id}\``,

          `📚 **Fase:** ` +
          `${TIER_NAME[tier]}`,

          sourceThread
            ? (
                `📥 **Histórico originado de:** ` +
                `<#${sourceThread.id}>`
              )
            : (
                "📥 **Primeiro tópico desta fase**"
              ),
        ].join("\n")
      )
      .setThumbnail(
        member.user
          .displayAvatarURL({
            size: 256,
          })
      )
      .setColor(
        tier ===
        EVOLUTION_TIERS.RESPONSIBLES
          ? 0xe74c3c
          : tier ===
            EVOLUTION_TIERS.COORDINATION
            ? 0xf1c40f
            : 0x2ecc71
      )
      .setTimestamp();

  const createdThread =
    await parentChannel
      .threads
      .create({
        name: topicName,
        autoArchiveDuration: 10080,

        reason:
          `Evolução hierárquica de ` +
          `${member.user.tag}`,

        message: {
          embeds: [
            starterEmbed,
          ],

          allowedMentions: {
            parse: [],
          },
        },
      });

  return createdThread;
}

// =====================================================
// SINCRONIZAÇÃO PRINCIPAL
// =====================================================

async function performSync(
  client,
  {
    guildId = GUILD_ID,
    userId,
    originalThreadId = null,
    reason =
      "Sincronização automática",
  }
) {
  const guild =
    client.guilds.cache.get(
      guildId
    ) ||
    await client.guilds
      .fetch(guildId)
      .catch(() => null);

  if (!guild) {
    return {
      ok: false,
      reason:
        "guild_not_found",
    };
  }

  const member =
    await guild.members
      .fetch({
        user: userId,
        force: true,
      })
      .catch(() => null);

  if (!member) {
    return {
      ok: false,
      reason:
        "member_not_found",
    };
  }

  const tier =
    getEvolutionTierForMember(
      member
    );

  /*
   * Se a pessoa não possui nenhum dos
   * cargos mapeados, não movemos nada.
   */

  if (!tier) {
    return {
      ok: false,
      reason:
        "member_without_mapped_role",
    };
  }

  const state =
    readState();

  const userState =
    state.users[userId] || {
      tiers: {},
      activeTier: null,
      activeThreadId: null,
    };

  const previousActiveTier =
    Number(
      userState.activeTier || 0
    );

  /*
   * O tópico original sempre pertence
   * à fase Equipe Creators.
   */

  if (
    originalThreadId &&
    !userState.tiers[
      EVOLUTION_TIERS.TEAM
    ]
  ) {
    userState.tiers[
      EVOLUTION_TIERS.TEAM
    ] = originalThreadId;
  }

  let activeThreadId =
    userState.tiers[tier];

  let activeThread =
    activeThreadId
      ? await fetchChannel(
          client,
          activeThreadId
        )
      : null;

  const previousThreadId =
    userState.activeThreadId ||
    originalThreadId;

  const previousThread =
    previousThreadId
      ? await fetchChannel(
          client,
          previousThreadId
        )
      : null;

  const createdNow =
    !activeThread;

  /*
   * Só cria um novo tópico quando ainda
   * não existe tópico para aquela fase.
   */

  if (!activeThread) {
    const parentChannel =
      await fetchChannel(
        client,
        CHANNEL_BY_TIER[tier]
      );

    if (
      !parentChannel
        ?.threads
        ?.create
    ) {
      return {
        ok: false,
        reason:
          "target_forum_not_found",
      };
    }

    activeThread =
      await createTierThread(
        parentChannel,
        member,
        tier,
        previousThread
      );

    activeThreadId =
      activeThread.id;

    userState.tiers[tier] =
      activeThreadId;

    /*
     * Copia o histórico quando o tópico
     * superior é criado.
     */

    if (
      previousThread &&
      previousThread.id !==
        activeThread.id
    ) {
      await copyHistory(
        previousThread,
        activeThread
      );
    }
  }

  /*
   * Se o tópico superior já existia e a
   * pessoa foi promovida novamente,
   * copia somente as mensagens novas
   * que ainda não existem nele.
   */

  if (
    !createdNow &&
    activeThread &&
    previousThread &&
    previousThread.id !==
      activeThread.id &&
    tier >
      previousActiveTier
  ) {
    await copyHistory(
      previousThread,
      activeThread
    );
  }

  /*
   * No rebaixamento não existe cópia.
   *
   * Isso impede que informações dos
   * Responsáveis ou da Coordenação
   * desçam para canais inferiores.
   */

  userState.activeTier =
    tier;

  userState.activeThreadId =
    activeThread.id;

  userState.updatedAt =
    new Date()
      .toISOString();

  userState.lastReason =
    reason;

  state.users[userId] =
    userState;

  writeState(state);

  /*
   * Atualiza todos os tópicos conhecidos
   * daquela pessoa.
   */

  /*
   * Primeiro fecha os históricos.
   *
   * Assim, uma falha posterior na edição de um painel
   * não impede o fechamento dos demais históricos.
   */

  for (
    const [savedTier, threadId]
    of Object.entries(userState.tiers)
  ) {
    if (Number(savedTier) === tier) {
      continue;
    }

    const historical = await fetchChannel(
      client,
      threadId
    );

    if (!historical?.isThread?.()) {
      throw new Error(
        `Histórico indisponível para conferência: ${threadId}`
      );
    }

    await setThreadMode(
      historical,
      false,
      "Histórico: somente leitura"
    );
  }

  for (
    const [
      savedTier,
      threadId,
    ]
    of Object.entries(
      userState.tiers
    )
  ) {
    const thread =
      await fetchChannel(
        client,
        threadId
      );

    if (!thread) {
      continue;
    }

    const isActive = Number(savedTier) === tier;

    const panelKey = JSON.stringify([
      tier,
      activeThread.id,
      userState.tiers,
    ]);

    userState.panelKeys ||= {};

    /*
     * Uma consulta do tópico ativo não deve reabrir
     * os históricos apenas para repetir o mesmo painel.
     */

    if (
      !isActive &&
      userState.panelKeys[threadId] === panelKey
    ) {
      await setThreadMode(
        thread,
        false,
        "Histórico permanece fechado"
      );

      continue;
    }

    try {
      /*
       * Quando o painel precisa mudar, a manutenção
       * mantém locked: true nos tópicos históricos.
       */

      if (
        thread.archived ||
        thread.locked !== !isActive
      ) {
        await thread.edit({
          archived: false,
          locked: !isActive,
          reason: "Atualizando sinalização da evolução",
        });
      }

      await updateStatusMessage(
        thread,
        {
          embeds: [
            createStatusEmbed({
              member,
              tier,
              activeThread,
              allThreadIds: userState.tiers,
            }),
          ],

          components: createStatusComponents(
            guild.id,
            thread.id,
            activeThread.id
          ),

          allowedMentions: {
            parse: [],
          },
        }
      );

      await setFormsManagementButtonsDisabled(
        thread,
        !isActive
      );

      userState.panelKeys[threadId] = panelKey;

      writeState(state);
    } finally {
      /*
       * Mesmo que editar o painel ou os botões falhe,
       * o histórico precisa voltar a ficar fechado.
       */

      await setThreadMode(
        thread,
        isActive,
        `${reason} • fase ${TIER_NAME[tier]}`
      );
    }
  }

  return {
    ok: true,
    tier,
    threadId:
      activeThread.id,

    threadLink:
      discordLink(
        guild.id,
        activeThread.id
      ),

    created:
      createdNow,
  };
}

export function syncEvolutionHierarchyForMember(
  client,
  options
) {
  /*
   * Uma sincronização aguarda a anterior.
   *
   * Isso impede criação duplicada caso
   * dois eventos aconteçam juntos.
   */

  const task =
    syncQueue.then(
      () =>
        performSync(
          client,
          options
        )
    );

  syncQueue =
    task.catch(
      () => null
    );

  return task;
}

// =====================================================
// BUSCA DO TÓPICO ATIVO
// =====================================================

export function isHistoricalEvolutionThread(threadId) {
  const id = String(threadId);

  return Object.values(readState().users).some(
    (record) =>
      record.activeThreadId &&
      String(record.activeThreadId) !== id &&
      Object.values(record.tiers || {}).some(
        (savedId) => String(savedId) === id
      )
  );
}

export async function restoreHistoricalEvolutionThread(thread) {
  if (
    thread?.isThread?.() &&
    isHistoricalEvolutionThread(thread.id)
  ) {
    await setThreadMode(
      thread,
      false,
      "Histórico: somente leitura"
    );
  }
}

function installHistoricalEvolutionGuards(client) {
  if (
    !client ||
    client.__EVOLUTION_HISTORICAL_GUARDS__
  ) {
    return;
  }

  client.__EVOLUTION_HISTORICAL_GUARDS__ =
    true;

  /*
   * Se alguém com uma permissão elevada tentar
   * desbloquear manualmente um histórico, o bot
   * restaura a trava automaticamente.
   *
   * O listener reage ao DESBLOQUEIO.
   * Um histórico pode ficar temporariamente
   * desarquivado e ainda travado durante manutenção
   * interna do próprio bot sem causar conflito.
   */
  client.on(
    "threadUpdate",
    async (oldThread, newThread) => {
      if (
        newThread?.guildId !== GUILD_ID ||
        !newThread?.isThread?.() ||
        !isHistoricalEvolutionThread(
          newThread.id
        ) ||
        newThread.locked
      ) {
        return;
      }

      try {
        await restoreHistoricalEvolutionThread(
          newThread
        );
      } catch (error) {
        console.error(
          `[EVOLUTION_HIERARCHY] Falha ao retravar histórico ${newThread.id}:`,
          error
        );
      }
    }
  );

  /*
   * Segunda barreira.
   *
   * Se alguém conseguir enviar uma mensagem em um
   * histórico por possuir Administrator ou alguma
   * permissão externa que ignore a trava normal,
   * a mensagem é removida e o tópico é travado
   * novamente.
   *
   * Somente o próprio bot fica fora desta regra,
   * pois ele precisa realizar manutenção interna.
   */
  client.on(
    "messageCreate",
    async (message) => {
      if (
        message?.guildId !== GUILD_ID ||
        !message?.channel?.isThread?.() ||
        message.author?.id ===
          client.user?.id ||
        !isHistoricalEvolutionThread(
          message.channel.id
        )
      ) {
        return;
      }

      try {
        const deleted =
          await message
            .delete()
            .then(() => true)
            .catch(() => false);

        await restoreHistoricalEvolutionThread(
          message.channel
        );

        if (!deleted) {
          console.warn(
            `[EVOLUTION_HIERARCHY] Não consegui apagar mensagem enviada no histórico ${message.channel.id}. Confira ManageMessages do bot.`
          );
        }
      } catch (error) {
        console.error(
          `[EVOLUTION_HIERARCHY] Proteção de escrita do histórico ${message.channel.id}:`,
          error
        );
      }
    }
  );
}

export async function getEvolutionFeedbackContext(
  client,
  userId,
  options = {}
) {
  const known = readState().users[String(userId)];

  if (
    !options.originalThreadId &&
    !Object.keys(known?.tiers || {}).length
  ) {
    throw new Error(
      "Nenhum registro de evolução foi associado a esta pessoa."
    );
  }

  const result = await syncEvolutionHierarchyForMember(
    client,
    {
      ...options,
      userId,
    }
  );

  if (!result.ok) {
    throw new Error(
      `Evolução indisponível: ${result.reason}`
    );
  }

  const record = readState().users[String(userId)];
  const threads = [];

  for (
    const [tierKey, threadId]
    of Object.entries(record?.tiers || {})
  ) {
    const tier = Number(tierKey);

    /*
     * Conteúdo superior não entra no prompt de uma
     * publicação que ficará disponível em nível inferior.
     */

    if (tier > result.tier) {
      continue;
    }

    const thread = await client.channels.fetch(
      threadId,
      {
        force: true,
      }
    );

    if (
      !thread?.isThread?.() ||
      thread.guildId !== (options.guildId || GUILD_ID) ||
      thread.parentId !== CHANNEL_BY_TIER[tier]
    ) {
      throw new Error(
        `Vínculo inválido da evolução: ${threadId}`
      );
    }

    threads.push(thread);
  }

  const thread = threads.find(
    (item) => item.id === result.threadId
  );

  if (!thread) {
    throw new Error(
      "Tópico ativo não encontrado entre os tópicos válidos."
    );
  }

  return {
    tier: result.tier,
    thread,
    threads,
  };
}

export function withActiveEvolutionThread(
  client,
  userId,
  expected,
  action
) {
  const task = syncQueue.then(async () => {
    const thread = await client.channels.fetch(
      expected.thread.id,
      {
        force: true,
      }
    );

    if (
      !thread?.isThread?.() ||
      thread.guildId !== expected.thread.guildId
    ) {
      throw new Error(
        "O tópico de publicação não está disponível."
      );
    }

    const member = await thread.guild.members.fetch({
      user: userId,
      force: true,
    });

    const record = readState().users[String(userId)];

    if (
      getEvolutionTierForMember(member) !== expected.tier ||
      record?.activeThreadId !== thread.id ||
      Number(record?.activeTier) !== expected.tier ||
      thread.parentId !== CHANNEL_BY_TIER[expected.tier]
    ) {
      throw new Error(
        "A hierarquia mudou durante a geração. Gere o feedback novamente."
      );
    }

    await setThreadMode(
      thread,
      true,
      "Publicação no tópico ativo confirmado"
    );

    return action(thread);
  });

  syncQueue = task.catch(() => null);

  return task;
}

export async function getActiveEvolutionThread(
  client,
  userId,
  options = {}
) {
  const result =
    await syncEvolutionHierarchyForMember(
      client,
      {
        ...options,
        userId,
      }
    );

  if (!result.ok) {
    return null;
  }

  return fetchChannel(
    client,
    result.threadId
  );
}

export async function getActiveEvolutionThreadId(
  client,
  userId,
  options = {}
) {
  const thread =
    await getActiveEvolutionThread(
      client,
      userId,
      options
    );

  return (
    thread?.id ||
    null
  );
}

// =====================================================
// INICIALIZAÇÃO E MIGRAÇÃO DOS REGISTROS ANTIGOS
// =====================================================

export async function initializeEvolutionHierarchy(
  client,
  resolveOriginalThreadId
) {
  await configureEvolutionHierarchyChannels(
    client,
    GUILD_ID
  );

  installHistoricalEvolutionGuards(
    client
  );

  if (!client.__EVOLUTION_HIERARCHY_ROLE_LISTENER__) {
    client.__EVOLUTION_HIERARCHY_ROLE_LISTENER__ = true;

    client.on(
      "guildMemberUpdate",
      async (oldMember, member) => {
        if (
          member.guild.id !== GUILD_ID ||
          member.user.bot
        ) {
          return;
        }

        const sameRoles =
          oldMember.roles.cache.size ===
            member.roles.cache.size &&
          oldMember.roles.cache.every(
            (role) =>
              member.roles.cache.has(role.id)
          );

        if (sameRoles) {
          return;
        }

        try {
          const known =
            readState().users[member.id];

          const originalThreadId =
            known?.tiers?.[EVOLUTION_TIERS.TEAM] ||
            (
              typeof resolveOriginalThreadId === "function"
                ? await resolveOriginalThreadId(member.id)
                : null
            );

          if (
            !originalThreadId &&
            !known?.activeThreadId
          ) {
            return;
          }

          await syncEvolutionHierarchyForMember(
            client,
            {
              guildId: member.guild.id,
              userId: member.id,
              originalThreadId,
              reason: "Mudança de cargos: conferência da evolução",
            }
          );
        } catch (error) {
          console.error(
            `[EVOLUTION_HIERARCHY] Mudança de cargos de ${member.id}:`,
            error
          );
        }
      }
    );
  }

  const guild =
    client.guilds.cache.get(
      GUILD_ID
    ) ||
    await client.guilds
      .fetch(GUILD_ID)
      .catch(() => null);

  if (!guild) {
    return;
  }

  await guild.members
    .fetch()
    .catch(() => null);

  for (
    const member
    of guild.members.cache.values()
  ) {
    if (
      member.user.bot ||
      !getEvolutionTierForMember(
        member
      )
    ) {
      continue;
    }

    const originalThreadId =
      typeof resolveOriginalThreadId ===
        "function"
        ? await resolveOriginalThreadId(
            member.id
          ).catch(() => null)
        : null;

    /*
     * Não cria nenhum tópico sem que exista
     * um registro original no FormsCreator.
     *
     * Isso evita tópicos vazios, pessoas
     * duplicadas e registros de membros que
     * não participam do Controle GI.
     */

    if (!originalThreadId) {
      continue;
    }

    await syncEvolutionHierarchyForMember(
      client,
      {
        guildId:
          guild.id,

        userId:
          member.id,

        originalThreadId,

        reason:
          "Inicialização e conferência automática",
      }
    ).catch(
      (error) => {
        console.error(
          `[EVOLUTION_HIERARCHY] ` +
          `${member.id}:`,
          error
        );
      }
    );
  }
}