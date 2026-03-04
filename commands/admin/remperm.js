import { ChannelType, EmbedBuilder } from 'discord.js';

// Configurações
const MEMBROS_PERMITIDOS = ['660311795327828008', '1021174007577444463'];
const CARGOS_PERMITIDOS = ['1262262852949905408', '1352408327983861844', '1262262852949905409'];
const CANAL_LOGS_ID = '1372721748092387348';

// Função auxiliar para enviar mensagens com segurança (substituindo a sua safeSend externa)
async function safeSend(channel, content) {
  try {
    return await channel.send(content);
  } catch (error) {
    console.error('Erro ao enviar mensagem:', error);
    return null;
  }
}

/**
 * Executa o comando !remperm
 * @param {import('discord.js').Message} message 
 */
async function executarRemPerm(message) {
  // Apaga a mensagem do comando
  message.delete().catch(() => {});

  const member = message.member;
  
  // Verifica permissões
  const isAllowed =
    MEMBROS_PERMITIDOS.includes(member.id) ||
    member.roles.cache.some(role => CARGOS_PERMITIDOS.includes(role.id));

  if (!isAllowed) {
    const msg = await safeSend(message.channel, '❌ Você não tem permissão para usar este comando.');
    if (msg) setTimeout(() => msg.delete().catch(() => {}), 10000);
    return;
  }

  const args = message.content.split(/ +/).slice(1);
  if (args.length < 2) { // espera 2 argumentos
    const msg = await safeSend(message.channel, '❌ Uso incorreto! Formato: `!remperm <canal/categoria> <cargoARemover>`');
    if (msg) setTimeout(() => msg.delete().catch(() => {}), 10000);
    return;
  }

  const extractId = (input) => input.replace(/[^0-9]/g, '');
  const canalId = extractId(args[0]);
  const cargoARemoverId = extractId(args[1]);

  try {
    const channel = await message.guild.channels.fetch(canalId).catch(() => null);
    if (!channel) {
      const msg = await safeSend(message.channel, '❌ Canal ou categoria não encontrado.');
      if (msg) setTimeout(() => msg.delete().catch(() => {}), 10000);
      return;
    }

    const roleToRemove = await message.guild.roles.fetch(cargoARemoverId).catch(() => null);
    if (!roleToRemove) {
      const msg = await safeSend(message.channel, '❌ O cargo fornecido é inválido.');
      if (msg) setTimeout(() => msg.delete().catch(() => {}), 10000);
      return;
    }

    const logChannel = message.guild.channels.cache.get(CANAL_LOGS_ID);
    let resultadoMsg = '';
    let progressMsg;

    // Lógica para processar múltiplos canais (caso seja categoria)
    const processChannels = async (channels) => {
      const total = channels.size;
      let processed = 0;

      progressMsg = await safeSend(message.channel, `Iniciando remoção do cargo <@&${roleToRemove.id}> das permissões...`);

      for (const [_, chan] of channels) {
        const overwrite = chan.permissionOverwrites.cache.get(roleToRemove.id);

        if (overwrite) {
          await chan.permissionOverwrites.delete(roleToRemove.id, `Removido por ${message.author.tag} via comando !remperm`);
          processed++;
          const percent = Math.round((processed / total) * 100);
          if (progressMsg) await progressMsg.edit(`Canal ${chan.name}: Cargo <@&${roleToRemove.id}> removido das permissões. (${percent}%)`).catch(() => {});
        } else {
          processed++;
          const percent = Math.round((processed / total) * 100);
          if (progressMsg) await progressMsg.edit(`Canal ${chan.name}: Cargo <@&${roleToRemove.id}> não possuía permissões específicas. (${percent}%)`).catch(() => {});
        }
      }

      if (progressMsg) {
        await progressMsg.edit(`✅ Cargo <@&${roleToRemove.id}> processado em todos os canais da categoria ${channel.name}.`).catch(() => {});
        setTimeout(() => progressMsg.delete().catch(() => {}), 15000);
      }
    };

    // Verifica se é Categoria ou Canal único
    if (channel.type === ChannelType.GuildCategory) {
      const children = channel.children.cache;
      if (!children.size) {
        const msg = await safeSend(message.channel, '❌ Esta categoria não possui canais.');
        if (msg) setTimeout(() => msg.delete().catch(() => {}), 10000);
        return;
      }

      await processChannels(children);
      resultadoMsg = `✅ Cargo <@&${roleToRemove.id}> processado em **todos os canais da categoria** ${channel.name}.`;
    } else {
      // Canal único
      const overwrite = channel.permissionOverwrites.cache.get(roleToRemove.id);

      if (overwrite) {
        await channel.permissionOverwrites.delete(roleToRemove.id, `Removido por ${message.author.tag} via comando !remperm`);
        resultadoMsg = `✅ Cargo <@&${roleToRemove.id}> removido das permissões do canal <#${channel.id}>.`;
      } else {
        resultadoMsg = `ℹ️ Cargo <@&${roleToRemove.id}> não possuía permissões específicas no canal <#${channel.id}>. Nenhuma ação foi tomada.`;
        if (logChannel && logChannel.isTextBased()) {
          await safeSend(logChannel, `ℹ️ Tentativa de remover cargo <@&${roleToRemove.id}> do canal <#${channel.id}>, mas ele não possuía permissões específicas. (Comando por: ${message.author.tag})`);
        }
      }
    }

    // Envia mensagem final
    const msg = await safeSend(message.channel, resultadoMsg);
    if (msg) setTimeout(() => msg.delete().catch(() => {}), 15000);

    // Log Embed
    if (logChannel && logChannel.isTextBased()) {
      const embedLog = new EmbedBuilder()
        .setTitle('📋 Log de Permissões')
        .setDescription(resultadoMsg)
        .setColor(0x57F287)
        .setFooter({ text: `Comando executado por ${message.author.tag}` })
        .setTimestamp();

      await safeSend(logChannel, { embeds: [embedLog] });
    }

  } catch (err) {
    console.error(err);
    const msg = await safeSend(message.channel, '❌ Ocorreu um erro ao tentar remover as permissões do cargo.');
    if (msg) setTimeout(() => msg.delete().catch(() => {}), 10000);
  }
}

export default {
  async execute(message) {
    return executarRemPerm(message);
  }
};

