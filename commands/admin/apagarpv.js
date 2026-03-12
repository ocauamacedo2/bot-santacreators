// /application/commands/admin/apagarpv.js
import { Events, EmbedBuilder } from 'discord.js';

// ✅ Canais e variáveis importantes
const LOG_CHANNEL_ID = '1385324623301972120'; // Canal: APAGADOS PRIVADO POR BOT

// ✅ Permissões autorizadas
const PERMITIDOS = [
  '1262262852949905408', // OWNER
  '1352408327983861844', // RESP CREATOR
  '1262262852949905409', // RESP INFLU
];

export function registerApagarPV(client) {
  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    if (!message.content.toLowerCase().startsWith('!apagarpv')) return;

    const membroTemPermissao = message.member?.roles?.cache?.some((role) =>
      PERMITIDOS.includes(role.id)
    );

    if (!membroTemPermissao) {
      setTimeout(() => message.delete().catch(() => {}), 1000);
      const msg = await message.reply('🚫 Você não tem permissão para usar esse comando.');
      setTimeout(() => msg.delete().catch(() => {}), 5000);
      return;
    }

    const args = message.content.split(' ').slice(1);
    const alvo = args.join(' ').trim();

    if (!alvo) {
      return message.reply('❌ Informe o ID, mencione a pessoa ou mencione um cargo.');
    }

    const logChannel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    if (!logChannel) return message.reply('❌ Canal de log não encontrado.');

    let membros = [];

    if (alvo.match(/^\d+$/)) {
      const membro = await message.guild.members.fetch(alvo).catch(() => null);
      if (membro) membros.push(membro);
    } else if (message.mentions.members.size > 0) {
      membros = [...message.mentions.members.values()];
    } else if (message.mentions.roles.size > 0) {
      const cargo = message.mentions.roles.first();
      membros = message.guild.members.cache
        .filter((m) => m.roles.cache.has(cargo.id))
        .map((m) => m);
    } else {
      return message.reply('❌ Nenhum membro ou cargo válido foi identificado.');
    }

    await message.delete().catch(() => {});

    for (const membro of membros) {
      const user = membro.user;

      const dm = await user.createDM().catch(() => null);
      if (!dm) continue;

      // --- INÍCIO DA ALTERAÇÃO: Aumentar limite de busca ---
      const allMessages = [];
      let lastId;
      const totalLimit = 500; // Novo limite total de mensagens a buscar

      // Busca em lotes de 100 até atingir o limite ou não ter mais mensagens
      while (allMessages.length < totalLimit) {
        const options = { limit: 100 };
        if (lastId) {
          options.before = lastId;
        }
        const fetchedMessages = await dm.messages.fetch(options).catch(() => null);

        if (!fetchedMessages || fetchedMessages.size === 0) {
          break; // Acabaram as mensagens
        }

        fetchedMessages.forEach(msg => allMessages.push(msg));
        lastId = fetchedMessages.lastKey();
        if (fetchedMessages.size < 100) break; // Última página
      }

      const mensagensDoBot = allMessages.filter((msg) => msg.author.id === client.user.id);
      if (mensagensDoBot.length === 0) continue;

      let aviso = null;
      if (message.channel && message.channel.send) {
        aviso = await message.channel
          .send(`🫢 Apagando mensagens do bot enviadas para <@${user.id}>...`)
          .catch(() => null);
      }

      if (aviso) {
        setTimeout(() => aviso.delete().catch(() => {}), 30000);
      }

      let total = 0;

      for (const msg of mensagensDoBot) {
        const embed = new EmbedBuilder()
          .setColor('#ff0066')
          .setTitle('🧹 Mensagem apagada nas DMs')
          .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
          .addFields(
            { name: '👤 Mensagem enviada para:', value: `<@${user.id}> \`(${user.id})\`` },
            { name: '🗑️ Apagado por:', value: `<@${message.author.id}> \`(${message.author.id})\`` },
            { name: '🕒 Horário do apagamento:', value: `<t:${Math.floor(Date.now() / 1000)}:F>` },
            { name: '💬 Conteúdo apagado:', value: msg.content?.slice(0, 1024) || '*[sem texto]*' }
          )
          .setFooter({ text: 'SantaCreators | Log de PVs apagados' })
          .setTimestamp();

        await logChannel.send({ embeds: [embed] }).catch(() => {});
        await msg.delete().catch(() => {});
        total++;
      }

      const resumoEmbed = new EmbedBuilder()
        .setColor('#00ff88')
        .setTitle('✅ Resumo do apagamento')
        .setDescription(`Foram apagadas \`${total}\` mensagens enviadas para <@${user.id}>.`)
        .addFields(
          { name: '👤 Usuário:', value: `<@${user.id}> \`(${user.id})\``, inline: true },
          { name: '🔧 Apagado por:', value: `<@${message.author.id}> \`(${message.author.id})\``, inline: true },
          { name: '📅 Data:', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
        )
        .setFooter({ text: 'SantaCreators | Resumo de apagamento privado' })
        .setTimestamp();

      await logChannel.send({ embeds: [resumoEmbed] }).catch(() => {});

      let confirmMsg = null;
      if (message.channel && message.channel.send) {
        confirmMsg = await message.channel.send({ embeds: [resumoEmbed] }).catch(() => null);
      }

      setTimeout(() => {
        confirmMsg?.delete().catch(() => {});
      }, 30000);
    }
  });
}
