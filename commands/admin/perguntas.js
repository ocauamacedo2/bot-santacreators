import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';

import entrevista from '../../utils/entrevista.js';

import { dashEmit } from "../../utils/dashHub.js";

import { iaInterviewPauseForManualInterview } from "../../events/iaChatAuto.js";

const ALERT_ROLE_IDS = [
  "1282119104576098314",
  "1352407252216184833",
  "1262262852949905409",
  "1388976314253312100",
  "1388975939161161728",
];

const LOG_CHANNEL_ID = "1486084249755979950";

const PERGUNTAS_ALLOWED_CATEGORY_IDS = new Set([
  "1359244725781266492",
]);

const PERGUNTAS_BYPASS_USER_IDS = new Set([
  "660311795327828008", // você
  "1262262852949905408", // owner
]);

function fireAndForget(promise, label = 'async_task') {
  Promise.resolve(promise).catch((e) => {
    console.error(`[!perguntas] Falha em ${label}:`, e);
  });
}

async function disableOldStartButtons(channel, clientUserId, keepMessageId) {
  const mensagensRecentes = await channel.messages
    .fetch({ limit: 50 })
    .catch(() => null);

  if (!mensagensRecentes) return;

  const tarefas = [];

  for (const msg of mensagensRecentes.values()) {
    if (msg.id === keepMessageId) continue;

    if (msg.author?.id !== clientUserId) continue;

    const temBotaoAntigo = msg.components?.some((row) =>
      row.components?.some((component) =>
        component.customId === `iniciar|${channel.id}`
      )
    );

    if (!temBotaoAntigo) continue;

    tarefas.push(
      msg.edit({
        components: []
      }).catch((e) => {
        console.warn(
          `[!perguntas] Não foi possível remover botão antigo da mensagem ${msg.id}:`,
          e?.message || e
        );
      })
    );
  }

  if (tarefas.length > 0) {
    await Promise.allSettled(tarefas);
  }
}

export default {
  async hasPermission(message) {
    const idsPermitidos = [
      '660311795327828008',
      '1262262852949905408',
      '1352408327983861844',
      '1262262852949905409',
      '1352407252216184833',
      '1282119104576098314'
    ];

    return idsPermitidos.includes(message.author.id) ||
           message.member?.roles?.cache?.some(
             (r) => idsPermitidos.includes(r.id)
           );
  },

  async execute(message, args, client) {
    if (!message.guild) {
      return message.channel.send(
        "Esse comando só funciona dentro do servidor."
      );
    }

    // =====================================================
    // 1. IDENTIFICA O CANDIDATO ANTES DE APAGAR O COMANDO
    // =====================================================

    const topic = String(message.channel?.topic || "");

    const m = topic.match(
      /aberto_por:(\d{17,20})/i
    );

    const openerId = m ? m[1] : null;

    if (!openerId) {
      await message.channel.send(
        "❌ Não consegui identificar quem abriu o ticket pelo tópico do canal. Verifique se o tópico tem `aberto_por:ID_DO_USUÁRIO`."
      ).catch(() => {});

      return;
    }

    // =====================================================
    // 2. MONTA O BOTÃO
    // =====================================================

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`iniciar|${message.channel.id}`)
        .setLabel('📨 Iniciar Entrevista')
        .setStyle(ButtonStyle.Success)
    );

    // =====================================================
    // 3. PREPARA O NOVO TÓPICO
    // =====================================================

    const oldTopic = String(
      message.channel.topic || ""
    );

    const cleanedTopic = oldTopic
      .replace(
        /\bentrevista_aplicador:\d{17,20}\b/gi,
        ""
      )
      .replace(
        /\bentrevista_starter:\d{17,20}\b/gi,
        ""
      )
      .replace(
        /\bentrevista_ativa:[01]\b/gi,
        ""
      )
      .replace(
        /\s*\|\s*\|\s*/g,
        " | "
      )
      .replace(
        /\s{2,}/g,
        " "
      )
      .trim();

    const nextTopic =
      `${cleanedTopic}${cleanedTopic ? " | " : ""}` +
      `entrevista_aplicador:${message.author.id}`;

    // =====================================================
    // 4. ENVIA O BOTÃO E ATUALIZA O TÓPICO EM PARALELO
    // =====================================================

    let buttonMessage = null;

    try {
      const [
        sendResult,
        topicResult
      ] = await Promise.allSettled([
        message.channel.send({
          content:
            `Clique no botão abaixo para iniciar a entrevista 🎤`,
          components: [row]
        }),

        typeof message.channel.setTopic === "function"
          ? message.channel.setTopic(
              nextTopic.slice(0, 1024)
            )
          : Promise.resolve()
      ]);

      // ===================================================
      // BOTÃO NÃO CONSEGUIU SER CRIADO
      // ===================================================

      if (sendResult.status !== "fulfilled") {
        throw (
          sendResult.reason ||
          new Error(
            "Falha desconhecida ao enviar o botão de entrevista."
          )
        );
      }

      buttonMessage = sendResult.value;

      // ===================================================
      // TÓPICO NÃO CONSEGUIU SER ATUALIZADO
      //
      // Não deixamos o botão funcionando sem aplicador
      // corretamente registrado.
      // ===================================================

      if (topicResult.status === "rejected") {
        await buttonMessage
          .delete()
          .catch(() => {});

        throw (
          topicResult.reason ||
          new Error(
            "O botão foi criado, mas não foi possível atualizar o tópico do canal."
          )
        );
      }

    } catch (e) {
      console.error(
        `[!perguntas] Falha ao criar o botão no canal ${message.channel.id}:`,
        e
      );

      await message.reply({
        content:
          "❌ Não consegui criar o botão da entrevista agora. " +
          "O comando não foi apagado para você poder tentar novamente.",

        allowedMentions: {
          repliedUser: false
        }
      }).catch(() => {});

      return;
    }

    // =====================================================
    // 5. SOMENTE AGORA APAGA O !PERGUNTAS
    //
    // Neste ponto sabemos que:
    //
    // - candidato foi identificado;
    // - botão existe;
    // - tópico foi atualizado;
    // - aplicador foi registrado.
    // =====================================================

    if (message.deletable) {
      fireAndForget(
        message.delete(),
        'message.delete'
      );
    }

    // =====================================================
    // 6. PAUSA A IA PARA A ENTREVISTA MANUAL
    //
    // Não deixamos uma falha aqui destruir o botão.
    // =====================================================

    try {
      iaInterviewPauseForManualInterview(
        message.channel,
        openerId,
        message.author.id
      );
    } catch (e) {
      console.warn(
        `[!perguntas] Falha não crítica ao pausar IA para entrevista manual no canal ${message.channel.id}:`,
        e?.message || e
      );
    }

    // =====================================================
    // 7. LIMPA BOTÕES ANTIGOS SEM SEGURAR O COMANDO
    //
    // O botão recém-criado é preservado.
    // Botões antigos "Iniciar Entrevista" são removidos.
    // =====================================================

    fireAndForget(
      disableOldStartButtons(
        message.channel,
        client.user.id,
        buttonMessage.id
      ),
      'disableOldStartButtons'
    );

    // =====================================================
    // 8. NOTIFICAÇÕES
    // =====================================================

    (async () => {
      const alertMsg =
        `📢 **ENTREVISTA INICIADA!**\n\n` +

        `📍 **Canal:** ${message.channel}\n` +

        `👤 **Candidato:** <@${openerId}>\n` +

        `👮 **Aplicador:** ${message.author}\n\n` +

        `👉 Fiquem atentos para corrigir assim que o candidato terminar!`;

      const notifiedIds = new Set();

      for (const roleId of ALERT_ROLE_IDS) {
        const role =
          message.guild.roles.cache.get(
            roleId
          );

        if (!role) continue;

        for (const [id, member] of role.members) {
          if (
            !member ||
            member.user?.bot ||
            id === message.author.id ||
            notifiedIds.has(id)
          ) {
            continue;
          }

          member
            .send(alertMsg)
            .catch(() => {});

          notifiedIds.add(id);
        }
      }
    })();

    // =====================================================
    // 9. LOG PRINCIPAL
    // =====================================================

    fireAndForget(
      client.channels
        .fetch(LOG_CHANNEL_ID)
        .then(async (logChannel) => {
          if (!logChannel) return;

          const logEmbed =
            new EmbedBuilder()
              .setTitle(
                '🎬 Entrevista Iniciada'
              )
              .setColor(
                '#00ff00'
              )
              .setDescription(
                `O comando **!perguntas** foi usado para iniciar.`
              )
              .addFields(
                {
                  name: '👤 Candidato',
                  value:
                    `<@${openerId}>`,
                  inline: true
                },

                {
                  name: '👮 Aplicador',
                  value:
                    `${message.author}`,
                  inline: true
                },

                {
                  name: '📍 Canal',
                  value:
                    `${message.channel}`,
                  inline: true
                }
              )
              .setTimestamp();

          await logChannel.send({
            embeds: [logEmbed]
          });
        }),

      'logChannel.send'
    );

    // =====================================================
    // 10. LOG COMPLETO
    // =====================================================

    fireAndForget(
      entrevista.logCompleto(
        client,
        {
          titulo:
            '🧾 !perguntas usado',

          cor:
            0x9b59b6,

          autorTag:
            message.author.tag,

          autorIcon:
            message.author.displayAvatarURL({
              dynamic: true
            }),

          desc:
            `O comando **!perguntas** foi usado.`,

          fields: [
            {
              name:
                '👤 Quem',

              value:
                `<@${message.author.id}>\n` +
                `\`${message.author.id}\``,

              inline:
                true
            },

            {
              name:
                '📍 Onde',

              value:
                `<#${message.channel.id}>\n` +
                `\`${message.channel.id}\``,

              inline:
                true
            },

            {
              name:
                '🏠 Servidor',

              value:
                `${message.guild?.name}\n` +
                `\`${message.guildId}\``,

              inline:
                false
            }
          ],

          thumb:
            message.guild?.iconURL({
              dynamic: true
            })
        }
      ),

      'entrevista.logCompleto'
    );
  }
};