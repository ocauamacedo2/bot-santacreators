import { PermissionsBitField } from 'discord.js';
import { joinVoiceChannel } from '@discordjs/voice';
import dotenv from 'dotenv';

dotenv.config();

export default {
  name: 'joincall',
  description: 'Faz o bot entrar em um canal de voz.',
  hasPermission: async (message) => {
    if (message.author.id === process.env.OWNER) return true;

    const roleIdsString = process.env.ROLES_PERMISSION;
    if (!roleIdsString) return false;

    const roleIds = roleIdsString.split(',').map(id => id.trim()).filter(Boolean);
    const memberRoles = message.member.roles.cache.map(role => role.id);
    return roleIds.some(roleId => memberRoles.includes(roleId));
  },

  async execute(message) {
    if (!await this.hasPermission(message)) {
      setTimeout(() => message.delete().catch(() => {}), 1000);
      const replyMsg = await message.reply('Você não tem permissão para fazer o bot entrar em um canal de voz!');
      setTimeout(() => replyMsg.delete().catch(console.error), 5000);
      return;
    }

    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) {
      const replyMsg = await message.reply('Você precisa estar em um canal de voz para que eu possa te acompanhar!');
      setTimeout(() => replyMsg.delete().catch(console.error), 5000);
      return;
    }

    const permissions = voiceChannel.permissionsFor(message.guild.members.me);
    if (!permissions?.has(PermissionsBitField.Flags.Connect) || !permissions?.has(PermissionsBitField.Flags.Speak)) {
      const replyMsg = await message.reply('Eu não tenho permissão para entrar ou falar neste canal de voz!');
      setTimeout(() => replyMsg.delete().catch(console.error), 5000);
      return;
    }

    try {
      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: message.guild.id,
        adapterCreator: message.guild.voiceAdapterCreator,
        selfDeaf: false, // 👈 entra sem se ensurdecer
        selfMute: false, // 👈 entra sem se mutar
      });

      const replyMsg = await message.reply(`Entrei no canal de voz: **${voiceChannel.name}**`);
      setTimeout(() => replyMsg.delete().catch(console.error), 5000);

      // Se for Stage Channel e você quiser falar, pode precisar “dessuprimir”:
      // try { await message.guild.members.me.voice.setSuppressed(false); } catch {}
    } catch (error) {
      console.error('Erro ao tentar entrar no canal de voz:', error);
      const replyMsg = await message.reply('Houve um erro ao tentar entrar no canal de voz.');
      setTimeout(() => replyMsg.delete().catch(console.error), 5000);
    }
  },
};
