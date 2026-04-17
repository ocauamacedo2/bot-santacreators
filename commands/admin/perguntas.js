import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import entrevista from '../../utils/entrevista.js';
import { dashEmit } from "../../utils/dashHub.js";

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
           message.member?.roles?.cache?.some(r => idsPermitidos.includes(r.id));
  },

  async execute(message, args, client) {
    if (!message.guild) {
      return message.channel.send("Esse comando só funciona dentro do servidor.");
    }

    const mensagensRecentes = await message.channel.messages.fetch({ limit: 15 }).catch(() => null);
    if (mensagensRecentes) {
      const jaExisteBotao = mensagensRecentes.some((msg) =>
        msg.author.id === client.user.id &&
        msg.components?.some((row) =>
          row.components?.some((component) =>
            component.customId === `iniciar|${message.channel.id}`
          )
        )
      );

      if (jaExisteBotao) {
        return message.reply({
          content: "⚠️ Já existe um botão de iniciar entrevista ativo neste canal."
        }).catch(() => {});
      }
    }

    // --- 🚀 EXECUÇÃO PARALELA E RÁPIDA ---
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`iniciar|${message.channel.id}`)
        .setLabel('📨 Iniciar Entrevista')
        .setStyle(ButtonStyle.Success)
    );

    const oldTopic = String(message.channel.topic || "");
    const cleanedTopic = oldTopic.replace(/\bentrevista_aplicador:\d{17,20}\b/gi, "").replace(/\s{2,}/g, " ").trim();
    const nextTopic = `${cleanedTopic}${cleanedTopic ? " | " : ""}entrevista_aplicador:${message.author.id}`.slice(0, 1024);

    // Envia o botão e seta o tópico ao mesmo tempo
    await Promise.all([
      message.channel.send({
        content: `Clique no botão abaixo para iniciar a entrevista 🎤`,
        components: [row]
      }),
      typeof message.channel.setTopic === "function" ? message.channel.setTopic(nextTopic).catch(() => {}) : Promise.resolve()
    ]);

    // Pega as informações do tópico para identificar o candidato
    const topic = message.channel.topic || "";
    const m = topic.match(/aberto_por:(\d{5,})/i);
    const openerId = m ? m[1] : "Desconhecido";

    // --- 🛠️ NOTIFICAÇÕES EM BACKGROUND ---
    (async () => {
      const alertMsg = `📢 **ENTREVISTA INICIADA!**\n\n` +
      `📍 **Canal:** ${message.channel}\n` +
      `👤 **Candidato:** <@${openerId}>\n` +
      `👮 **Aplicador:** ${message.author}\n\n` +
      `👉 Fiquem atentos para corrigir assim que o candidato terminar!`;

      const notifiedIds = new Set();
      for (const roleId of ALERT_ROLE_IDS) {
        const role = message.guild.roles.cache.get(roleId);
        if (!role) continue;
        for (const [id, member] of role.members) {
          if (!member || member.user?.bot || id === message.author.id || notifiedIds.has(id)) continue;
          member.send(alertMsg).catch(() => {});
          notifiedIds.add(id);
        }
      }
    })();

    fireAndForget(
      client.channels.fetch(LOG_CHANNEL_ID).then(async (logChannel) => {
        if (!logChannel) return;

        const logEmbed = new EmbedBuilder()
          .setTitle('🎬 Entrevista Iniciada')
          .setColor('#00ff00')
          .setDescription(`O comando **!perguntas** foi usado para iniciar.`)
          .addFields(
            { name: '👤 Candidato', value: `<@${openerId}>`, inline: true },
            { name: '👮 Aplicador', value: `${message.author}`, inline: true },
            { name: '📍 Canal', value: `${message.channel}`, inline: true }
          )
          .setTimestamp();

        await logChannel.send({ embeds: [logEmbed] });
      }),
      'logChannel.send'
    );

    fireAndForget(
      entrevista.logCompleto(client, {
        titulo: '🧾 !perguntas usado',
        cor: 0x9b59b6,
        autorTag: message.author.tag,
        autorIcon: message.author.displayAvatarURL({ dynamic: true }),
        desc: `O comando **!perguntas** foi usado.`,
        fields: [
          { name: '👤 Quem', value: `<@${message.author.id}>\n\`${message.author.id}\``, inline: true },
          { name: '📍 Onde', value: `<#${message.channel.id}>\n\`${message.channel.id}\``, inline: true },
          { name: '🏠 Servidor', value: `${message.guild?.name}\n\`${message.guildId}\``, inline: false }
        ],
        thumb: message.guild?.iconURL({ dynamic: true })
      }),
      'entrevista.logCompleto'
    );
  }
};