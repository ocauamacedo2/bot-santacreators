import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import entrevista from '../../utils/entrevista.js';
import { dashEmit } from "../../utils/dashHub.js";

const ALERT_ROLE_IDS = [
  "1282119104576098314", // mkt creators
  "1352407252216184833", // resp lider
  "1262262852949905409", // resp influ
  "1388976314253312100", // coord creators
  "1388975939161161728", // gestor creators
];

const LOG_CHANNEL_ID = "1471695257010831614";

export default {
  // (opcional) se quiser permissão aqui igual outros comandos:
  async hasPermission(message) {
    const idsPermitidos = [
      '1262262852949905408',
      '1352408327983861844',
      '1262262852949905409',
      '1352407252216184833',
      '1282119104576098314'
    ];
    return message.member?.roles?.cache?.some(r => idsPermitidos.includes(r.id));
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

    // 📊 DASH
try {
  dashEmit("entrevista:perguntas", { by: message.author.id });
} catch (e) {
  // não deixa o comando cair por causa do dash
  console.error("[!perguntas] dashEmit falhou:", e);
}


    // 📢 NOTIFICA EQUIPE NO PV
    const topic = message.channel.topic || "";
    const m = topic.match(/aberto_por:(\d{5,})/i);
    const openerId = m ? m[1] : "Desconhecido";

    const alertMsg = `📢 **ENTREVISTA INICIADA!**\n\n` +
      `📍 **Canal:** ${message.channel}\n` +
      `👤 **Candidato:** <@${openerId}>\n` +
      `👮 **Aplicador:** ${message.author}\n\n` +
      `👉 Fiquem atentos para corrigir assim que o candidato terminar!`;

    let fetchedAllMembers = false;

// tenta buscar todos os membros (pode falhar sem GUILD_MEMBERS intent)
try {
  await message.guild.members.fetch();
  fetchedAllMembers = true;
} catch (e) {
  console.warn("[!perguntas] members.fetch() falhou (provável falta de intent/perms). Vou usar cache:", e?.message || e);
}

for (const roleId of ALERT_ROLE_IDS) {
  const role = message.guild.roles.cache.get(roleId);
  if (!role) continue;

  // role.members = só quem tá no cache (se não conseguiu fetch geral)
  for (const [id, member] of role.members) {
    if (!member) continue;
    if (member.user?.bot) continue;
    if (id === message.author.id) continue;

    // DM pode falhar por privacidade, já tá safe
    member.send(alertMsg).catch(() => {});
  }
}

if (!fetchedAllMembers) {
  // opcional: só pra deixar claro no log do console
  console.log("[!perguntas] Notificação por DM rodou via cache (sem fetch geral).");
}


    // 📝 LOG NO CANAL NOVO
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
    console.error("[!perguntas] Falha ao enviar log no canal LOG_CHANNEL_ID:", e);
  }
}


    // log completo no canal 145...
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
