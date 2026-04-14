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

    // ✅ Permite se o usuário for você/owner OU se tiver um dos cargos permitidos
    return idsPermitidos.includes(message.author.id) || 
           message.member?.roles?.cache?.some(r => idsPermitidos.includes(r.id));
  },

  async execute(message, args, client) {
    if (!message.guild) {
      return message.channel.send("Esse comando só funciona dentro do servidor.");
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`iniciar|${message.channel.id}`)
        .setLabel('📨 Iniciar Entrevista')
        .setStyle(ButtonStyle.Success)
    );

    await message.channel.send({
  content: `Clique no botão abaixo para iniciar a entrevista 🎤`,
  components: [row]
});

// ✅ salva quem aplicou no tópico do canal para uso posterior
try {
  const oldTopic = String(message.channel.topic || "");
  const cleanedTopic = oldTopic
    .replace(/\bentrevista_aplicador:\d{17,20}\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

const nextTopic = `entrevista_aplicador:${message.author.id}`.slice(0, 1024);

  if (typeof message.channel.setTopic === "function") {
    await message.channel.setTopic(nextTopic).catch(() => {});
  }
} catch (e) {
  console.warn("[!perguntas] Falha ao salvar aplicador no tópico:", e?.message || e);
}

    // Este evento antigo é mantido para logs, mas não será usado para pontuação.

    const topic = message.channel.topic || "";
    const m = topic.match(/aberto_por:(\d{5,})/i);
    const openerId = m ? m[1] : "Desconhecido";

    const alertMsg = `📢 **ENTREVISTA INICIADA!**\n\n` +
      `📍 **Canal:** ${message.channel}\n` +
      `👤 **Candidato:** <@${openerId}>\n` +
      `👮 **Aplicador:** ${message.author}\n\n` +
      `👉 Fiquem atentos para corrigir assim que o candidato terminar!`;

    let fetchedAllMembers = false;

    try {
      await message.guild.members.fetch();
      fetchedAllMembers = true;
    } catch (e) {
      console.warn("[!perguntas] members.fetch() falhou:", e?.message || e);
    }

    for (const roleId of ALERT_ROLE_IDS) {
      const role = message.guild.roles.cache.get(roleId);
      if (!role) continue;

      for (const [id, member] of role.members) {
        if (!member) continue;
        if (member.user?.bot) continue;
        if (id === message.author.id) continue;
        member.send(alertMsg).catch(() => {});
      }
    }

    if (!fetchedAllMembers) {
      console.log("[!perguntas] Notificação por DM rodou via cache (sem fetch geral).");
    }

    const logChannel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    if (logChannel) {
      try {
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
      } catch (e) {
        console.error("[!perguntas] Falha ao enviar log:", e);
      }
    }

    try {
      await entrevista.logCompleto(client, {
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
      });
    } catch (e) {
      console.error("[!perguntas] entrevista.logCompleto falhou:", e);
    }
  }
};
