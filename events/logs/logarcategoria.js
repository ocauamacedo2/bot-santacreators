import { EmbedBuilder, ChannelType } from 'discord.js';

// ================== CONFIGURAÇÃO DE LOGS ==================
const MAIN_GUILD_ID = '1262262852782129183'; // Servidor Principal (Santa Creators)
const CENTRAL_LOG_CHANNEL_ID = '1377813851860504647'; // Canal central para logs

// Mapeamento de Guild ID para Canal de Log Local
const LOCAL_LOG_CHANNELS = {
  '1262262852782129183': '1377813851860504647', // Principal
  '1362899773992079533': '1363295055384809483', // Cidade Santa
  '1452416085751234733': '1455312395269443813', // Administração
};
// ==========================================================

// Permissões para usar o comando
const ALLOWED_ROLES = [
  '1262262852949905408', // Owner
  '1352408327983861844', // Resp Creator
];

const ALLOWED_USERS = [
  '660311795327828008', // Você
];

// ================== FUNÇÕES ==================

const TIMEZONE = 'America/Sao_Paulo';

function formatLocal(date) {
  return date.toLocaleString('pt-BR', {
    timeZone: TIMEZONE,
    dateStyle: 'short',
    timeStyle: 'medium',
  });
}

function toDiscordTimestamp(date) {
  const ts = Math.floor(date.getTime() / 1000);
  return `<t:${ts}:F> • <t:${ts}:R>`;
}

function channelTypeLabel(type) {
  switch (type) {
    case ChannelType.GuildText:
      return 'Texto';
    case ChannelType.GuildVoice:
      return 'Voz';
    case ChannelType.GuildCategory:
      return 'Categoria';
    case ChannelType.GuildAnnouncement:
      return 'Anúncios';
    case ChannelType.GuildStageVoice:
      return 'Palco';
    case ChannelType.GuildForum:
      return 'Fórum';
    default:
      return `Tipo(${type})`;
  }
}

function channelJumpLink(guildId, channelId) {
  return `https://discord.com/channels/${guildId}/${channelId}`;
}

// ================== COMANDO ==================

export default {
  name: 'logarcategoria',
  description: 'Gera logs de criação para todos os canais dentro de uma categoria.',

  async execute(message, args, client) {

    // 1️⃣ Permissão
    const hasPermission =
      message.member.roles.cache.some(role => ALLOWED_ROLES.includes(role.id)) ||
      ALLOWED_USERS.includes(message.author.id);

    if (!hasPermission) {
      return message.reply('❌ Você não tem permissão para usar este comando.');
    }

    // 2️⃣ Validar ID da categoria
    const categoryId = args[0];

    if (!categoryId || !/^\d{17,20}$/.test(categoryId)) {
      return message.reply('❌ Uso correto: `!logarcategoria <ID da Categoria>`');
    }

    const guild = message.guild;
    const category = await guild.channels.fetch(categoryId).catch(() => null);

    if (!category || category.type !== ChannelType.GuildCategory) {
      return message.reply('❌ Categoria não encontrada ou o ID não é de uma categoria.');
    }

    const statusMsg = await message.reply(
      `🔎 Analisando a categoria **${category.name}**. Isso pode levar um momento...`
    );

    const childChannels = guild.channels.cache.filter(
      ch => ch.parentId === category.id
    );

    if (childChannels.size === 0) {
      return statusMsg.edit(
        `ℹ️ A categoria **${category.name}** não possui canais.`
      );
    }

    let successCount = 0;
    let errorCount = 0;

    // ================== LOOP ==================

    for (const channel of childChannels.values()) {

      try {

        const executor = message.author;
        const createdAt = channel.createdAt;

        const embed = new EmbedBuilder()
          .setColor('#2ecc71')
          .setTitle('📁 Canal (Re)Logado')
          .setDescription(
            `Este é um log gerado manualmente para um canal já existente.\n\n` +
            `🔗 **Link do canal:** ${channelJumpLink(guild.id, channel.id)}\n` +
            `🕒 **Criado em:** \`${formatLocal(createdAt)}\` • ${toDiscordTimestamp(createdAt)}`
          )
          .setTimestamp(new Date());

        if (executor) {
          embed.setThumbnail(
            executor.displayAvatarURL({ size: 256 })
          );
        }

        embed.addFields(
          {
            name: '👤 Log gerado por',
            value: `${executor} • **ID:** \`${executor.id}\``,
          },
          {
            name: '🧾 Informações do Canal',
            value:
              `**Nome:** ${channel.name}\n` +
              `**Menção:** ${channel.toString?.() ?? `#${channel.name}`}\n` +
              `**ID:** \`${channel.id}\`\n` +
              `**Tipo:** \`${channelTypeLabel(channel.type)}\``,
            inline: true,
          },
          {
            name: '📂 Categoria',
            value:
              `**Nome:** ${category.name}\n` +
              `**ID:** \`${category.id}\``,
            inline: true,
          }
        );

        // ================== ENVIO DOS LOGS ==================

        const isMainGuild = guild.id === MAIN_GUILD_ID;

        let sentLocal = false;
        let sentCentral = isMainGuild;

        // ===== LOG LOCAL =====

        const localLogChannelId = LOCAL_LOG_CHANNELS[guild.id];

        if (localLogChannelId) {

          try {

            const localLogChannel =
              await client.channels.fetch(localLogChannelId);

            if (localLogChannel?.isTextBased()) {

              const localEmbed = new EmbedBuilder(embed.toJSON())
                .setFooter({
                  text: `Servidor: ${guild.name} • ${guild.id}`,
                });

              await localLogChannel.send({
                embeds: [localEmbed],
              });

              sentLocal = true;

            } else {

              console.error(
                `[logarcategoria] ERRO (Local): Canal ${localLogChannelId} não encontrado ou não é texto.`
              );

            }

          } catch (error) {

            console.error(
              `[logarcategoria] ERRO (Local): Falha ao enviar para o canal ${localLogChannelId} na guilda ${guild.name}.`,
              error.message
            );

          }

        } else {

          // Sem canal local configurado = OK
          sentLocal = true;

        }

        // ===== LOG CENTRAL =====

        if (!isMainGuild) {

          try {

            const centralLogChannel =
              await client.channels.fetch(CENTRAL_LOG_CHANNEL_ID);

            if (!centralLogChannel?.isTextBased()) {

              console.error(
                `[logarcategoria] ERRO CRÍTICO: Canal central (${CENTRAL_LOG_CHANNEL_ID}) não encontrado ou não é texto.`
              );

            } else {

              const centralEmbed = new EmbedBuilder(embed.toJSON())
                .setFooter({
                  text: `Origem: ${guild.name} • ${guild.id}`,
                });

              await centralLogChannel.send({
                embeds: [centralEmbed],
              });

              sentCentral = true;

            }

          } catch (error) {

            console.error(
              `[logarcategoria] ERRO CRÍTICO: Falha ao enviar para o canal central ${CENTRAL_LOG_CHANNEL_ID}.`,
              error.message
            );

          }

        }

        // ===== CONTAGEM =====

        if (sentLocal && sentCentral) {
          successCount++;
        } else {
          errorCount++;
        }

      } catch (err) {

        console.error(
          `[logarcategoria] Erro ao logar canal ${channel.name}:`,
          err
        );

        errorCount++;

      }

      // Delay anti rate limit
      await new Promise(res => setTimeout(res, 300));

    }

    // ================== FINAL ==================

    await statusMsg.edit(
      `✅ Concluído! Foram gerados **${successCount}** logs para a categoria **${category.name}**.\n` +
      `Falhas: **${errorCount}**.`
    );

  },
};