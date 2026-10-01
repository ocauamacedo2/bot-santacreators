import {
  AttachmentBuilder,
  EmbedBuilder,
} from "discord.js";

const BOT_DM_LOG_CHANNEL_ID =
  "1554974969648382083";

function serializeEmbed(
  embed
) {
  if (!embed) {
    return null;
  }

  try {
    if (
      typeof embed.toJSON ===
      "function"
    ) {
      return embed.toJSON();
    }

    if (
      embed.data
    ) {
      return embed.data;
    }

    return embed;
  } catch {
    return null;
  }
}

function serializeFile(
  file
) {
  if (!file) {
    return null;
  }

  if (
    typeof file ===
    "string"
  ) {
    return {
      value:
        file,
    };
  }

  return {
    name:
      file?.name ||
      file?.attachment?.name ||
      null,

    url:
      file?.url ||
      (
        typeof file?.attachment ===
          "string"
          ? file.attachment
          : null
      ),

    description:
      file?.description ||
      null,
  };
}

export async function sendBotDmLogged({
  client,
  target,
  payload,
  source =
    "Sistema SantaCreators",
  guild =
    null,
} = {}) {
  if (
    !client ||
    !target ||
    typeof target.send !==
      "function"
  ) {
    throw new Error(
      "sendBotDmLogged recebeu client ou destinatário inválido."
    );
  }

  const user =
    target.user ||
    target;

  const normalizedPayload =
    typeof payload ===
      "string"
      ? {
          content:
            payload,
        }
      : (
        payload ||
        {}
      );

  let sentMessage =
    null;

  let dmError =
    null;

  try {
    sentMessage =
      await target.send(
        normalizedPayload
      );
  } catch (error) {
    dmError =
      error;
  }

  try {
    const logChannel =
      client.channels.cache.get(
        BOT_DM_LOG_CHANNEL_ID
      ) ||
      await client.channels
        .fetch(
          BOT_DM_LOG_CHANNEL_ID
        )
        .catch(
          () => null
        );

    if (
      logChannel?.isTextBased?.()
    ) {
      const embeds =
        Array.isArray(
          normalizedPayload.embeds
        )
          ? normalizedPayload.embeds
              .map(
                serializeEmbed
              )
              .filter(
                Boolean
              )
          : [];

      const files =
        Array.isArray(
          normalizedPayload.files
        )
          ? normalizedPayload.files
              .map(
                serializeFile
              )
              .filter(
                Boolean
              )
          : [];

      const record = {
        loggedAt:
          new Date()
            .toISOString(),

        status:
          dmError
            ? "falhou"
            : "enviada",

        source,

        guild: {
          id:
            guild?.id ||
            null,

          name:
            guild?.name ||
            null,
        },

        target: {
          id:
            user?.id ||
            target?.id ||
            null,

          username:
            user?.username ||
            null,

          globalName:
            user?.globalName ||
            null,

          displayName:
            target?.displayName ||
            null,

          mention:
            (
              user?.id ||
              target?.id
            )
              ? `<@${user?.id || target?.id}>`
              : null,

          avatar:
            user
              ?.displayAvatarURL?.({
                size:
                  512,
              }) ||
            null,

          profile:
            (
              user?.id ||
              target?.id
            )
              ? `https://discord.com/users/${user?.id || target?.id}`
              : null,
        },

        message: {
          content:
            String(
              normalizedPayload
                ?.content ||
              ""
            ),

          embeds,

          files,

          sentMessageId:
            sentMessage?.id ||
            null,
        },

        error:
          dmError
            ? String(
                dmError?.message ||
                dmError
              )
            : null,
      };

      const statusEmbed =
        new EmbedBuilder()
          .setColor(
            dmError
              ? 0xe67e22
              : 0x2ecc71
          )
          .setTitle(
            dmError
              ? "⚠️ DM padrão não entregue"
              : "📨 DM padrão enviada"
          )
          .setDescription(
            String(
              normalizedPayload
                ?.content ||
              (
                embeds.length
                  ? "Mensagem enviada por embed."
                  : "Mensagem sem conteúdo textual."
              )
            )
              .slice(
                0,
                4000
              )
          )
          .addFields(
            {
              name:
                "👤 Destinatário",

              value:
                (
                  user?.id ||
                  target?.id
                )
                  ? `<@${user?.id || target?.id}>\nID: \`${user?.id || target?.id}\`\nUsername: \`${user?.username || "não disponível"}\``
                  : "Não identificado",

              inline:
                false,
            },

            {
              name:
                "🧩 Origem",

              value:
                String(
                  source
                ),

              inline:
                false,
            },

            {
              name:
                "📌 Resultado",

              value:
                dmError
                  ? `Falhou: \`${String(dmError?.message || dmError).slice(0, 900)}\``
                  : "Enviada com sucesso.",

              inline:
                false,
            }
          )
          .setTimestamp();

      await logChannel.send({
        embeds: [
          statusEmbed,
        ],

        files: [
          new AttachmentBuilder(
            Buffer.from(
              JSON.stringify(
                record,
                null,
                2
              ),
              "utf8"
            ),
            {
              name:
                `dm-bot-${user?.id || target?.id || "unknown"}-${Date.now()}.json`,
            }
          ),
        ],

        allowedMentions: {
          parse: [],
        },
      });
    }
  } catch (logError) {
    console.error(
      "[BOT DM LOG] Falha ao registrar DM:",
      logError?.message ||
      logError
    );
  }

  if (dmError) {
    throw dmError;
  }

  return sentMessage;
}