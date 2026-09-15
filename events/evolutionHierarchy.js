import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
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

const RESPONSIBLE_ROLES = new Set([
  ROLE.OWNER,
  ROLE.RESP_CREATORS,
  ROLE.RESP_INFLU,
  ROLE.RESP_LIDER,
]);

const COORDINATION_ROLES = new Set([
  ROLE.COORD_CREATORS,
  ROLE.GESTOR_CREATORS,
  ROLE.MANAGER_CREATORS,
  ROLE.SOCIAL_MEDIAS,
]);

const TEAM_ROLES = new Set([
  ROLE.EQUIPE_MANAGER,
  ROLE.EQUIPE_SOCIAL_MEDIAS,
  ROLE.EQUIPE_CREATORS,
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
      !parsed.users ||
      typeof parsed.users !== "object"
    ) {
      parsed.users = {};
    }

    return parsed;
  } catch {
    return emptyState();
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
   * Exemplo:
   * se a pessoa ainda tiver Equipe Creators,
   * mas também tiver Resp. Líder,
   * ela será colocada em Responsáveis.
   */

  if (
    ADMIN_USERS.has(member.id) ||
    hasAnyRole(
      member,
      RESPONSIBLE_ROLES
    )
  ) {
    return EVOLUTION_TIERS.RESPONSIBLES;
  }

  if (
    hasAnyRole(
      member,
      COORDINATION_ROLES
    )
  ) {
    return EVOLUTION_TIERS.COORDINATION;
  }

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
   * O canal original da Equipe Creators
   * mantém as permissões que já existem.
   *
   * Nos canais superiores, @everyone
   * não pode ver nem escrever.
   */

  if (
    tier >=
    EVOLUTION_TIERS.COORDINATION
  ) {
    await channel
      .permissionOverwrites
      .edit(
        guild.roles.everyone,
        {
          ViewChannel: false,
          SendMessages: false,
          SendMessagesInThreads: false,
          CreatePublicThreads: false,
          CreatePrivateThreads: false,
        },
        {
          reason:
            "Proteção automática da evolução por hierarquia",
        }
      );
  }

  const allowedRoles =
    tier ===
    EVOLUTION_TIERS.RESPONSIBLES
      ? RESPONSIBLE_ROLES
      : new Set([
          ...RESPONSIBLE_ROLES,
          ...COORDINATION_ROLES,
        ]);

  /*
   * Bloqueia explicitamente os cargos
   * inferiores nos canais superiores.
   *
   * Isso impede que uma permissão antiga
   * do próprio cargo libere o canal.
   */

  const deniedRoles =
    tier ===
    EVOLUTION_TIERS.RESPONSIBLES
      ? new Set([
          ...TEAM_ROLES,
          ...COORDINATION_ROLES,
        ])
      : tier ===
        EVOLUTION_TIERS.COORDINATION
        ? TEAM_ROLES
        : new Set();

  if (
    tier >=
    EVOLUTION_TIERS.COORDINATION
  ) {
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
          },
          {
            reason:
              "Bloqueio automático dos cargos inferiores",
          }
        );
    }

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
          },
          {
            reason:
              "Acesso automático à evolução por hierarquia",
          }
        );
    }
  }

  /*
   * Bypass do Macedo.
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
    await thread
      .messages
      .fetch({
        limit: 100,
      })
      .catch(() => null);

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
  /*
   * Antes de atualizar, desarquiva.
   */

  if (thread.archived) {
    await thread
      .setArchived(
        false,
        reason
      )
      .catch(() => null);
  }

  /*
   * Tópico ativo:
   * locked precisa ser false.
   *
   * Tópico histórico:
   * locked precisa ser true.
   */

  if (
    thread.locked === active
  ) {
    await thread
      .setLocked(
        !active,
        reason
      )
      .catch(() => null);
  }

  /*
   * Tópicos históricos são arquivados
   * depois de serem bloqueados.
   */

  if (
    !active &&
    !thread.archived
  ) {
    await thread
      .setArchived(
        true,
        reason
      )
      .catch(() => null);
  }
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
      .fetch(userId)
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

    const isActive =
      Number(savedTier) ===
      tier;

    /*
     * Precisa desarquivar temporariamente
     * para atualizar painel e botões.
     */

    if (thread.archived) {
      await thread
        .setArchived(
          false,
          "Atualizando sinalização da evolução"
        )
        .catch(() => null);
    }

    await updateStatusMessage(
      thread,
      {
        embeds: [
          createStatusEmbed({
            member,
            tier,
            activeThread,
            allThreadIds:
              userState.tiers,
          }),
        ],

        components:
          createStatusComponents(
            guild.id,
            thread.id,
            activeThread.id
          ),

        allowedMentions: {
          parse: [],
        },
      }
    );

    /*
     * Desabilita os botões antigos
     * quando o tópico não é o atual.
     */

    await setFormsManagementButtonsDisabled(
      thread,
      !isActive
    );

    /*
     * Aplica bloqueio ou liberação.
     */

    await setThreadMode(
      thread,
      isActive,
      (
        `${reason} • fase ` +
        `${TIER_NAME[tier]}`
      )
    );
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