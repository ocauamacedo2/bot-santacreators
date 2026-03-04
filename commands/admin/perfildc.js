import { EmbedBuilder } from 'discord.js';

const CARGOS_AUTORIZADOS = [
  '1352385500614234134', // coord
  '1262262852949905408', // owner
  '1352407252216184833', // resp lider
  '1352408327983861844', // resp creator
  '1262262852949905409', // resp influ
  '1352429001188180039'  // equipe creator
];

async function executarPerfilDc(message) {
  setTimeout(() => {
    message.delete().catch(() => {});
  }, 2000);

  const temPermissao = message.member?.roles?.cache?.some(role => CARGOS_AUTORIZADOS.includes(role.id));

  if (!temPermissao) {
    return message.channel.send('🚫 Você não tem permissão para usar esse comando.')
      .then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000));
  }

  // Avatar de um usuário mencionado
  if (message.mentions.users.size > 0) {
    const alvo = message.mentions.users.first();
    const avatarURL = alvo.displayAvatarURL({ dynamic: true, size: 512 });

    const embed = new EmbedBuilder()
      .setTitle(`👤 Avatar de ${alvo.tag}`)
      .setImage(avatarURL)
      .setColor('Purple')
      .setFooter({ text: `ID: ${alvo.id}` });

    return message.channel.send({ embeds: [embed] })
      .then(msg => setTimeout(() => msg.delete().catch(() => {}), 30000));
  }

  // Ícone do servidor
  const iconURL = message.guild?.iconURL({ dynamic: true, size: 512 });

  if (!iconURL) {
    return message.channel.send('❌ Este servidor não possui uma imagem de perfil definida.')
      .then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000));
  }

  const embed = new EmbedBuilder()
    .setTitle(`🖼️ Perfil do Servidor: ${message.guild.name}`)
    .setImage(iconURL)
    .setColor('Blue')
    .setFooter({ text: `ID do Servidor: ${message.guild.id}` });

  return message.channel.send({ embeds: [embed] })
    .then(msg => setTimeout(() => msg.delete().catch(() => {}), 30000));
}

export default {
  async execute(message) {
    return executarPerfilDc(message);
  }
};
