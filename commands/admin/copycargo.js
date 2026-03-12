// copycargo.js
import discord from 'discord.js';
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits } = discord;
import dotenv from 'dotenv';
dotenv.config();

/**
 * ✅ Permissão: SOMENTE estes cargos/ID podem usar
 * - owner (cargo):        1262262852949905408
 * - eu (usuário):         660311795327828008
 * - resp líder (cargo):   1352407252216184833
 * - resp creator (cargo): 1352408327983861844
 * - resp influ (cargo):   1262262852949905409
 * - mktticket (cargo):    1282119104576098314
 * - responsáveis (cargo): 1414651836861907006
 */

const ALLOWED_USER_IDS = [
  '660311795327828008', // você
];

const ALLOWED_ROLE_IDS = [
  '1262262852949905408', // owner
  '1352407252216184833', // resp líder
  '1352408327983861844', // resp creator
  '1262262852949905409', // resp influ
  '1282119104576098314', // mktticket
  '1414651836861907006', // responsáveis
];

// ✅ CARGOS TRAVADOS (Hardcoded) - Segurança extra (mesma lista do addcargo/remcargo)
const CARGOS_TRAVADOS_FIXOS = [
  '1371733765243670538',
  '1352275728476930099',
  '1353841582176210944',
  '1403170838529966140'
];

const LOG_CHANNEL_ID = '1415058932464091277';
const BASE_COLOR = (process.env.BASE_COLORS && Number.isInteger(+process.env.BASE_COLORS))
  ? +process.env.BASE_COLORS
  : 0x8651F6; // cor fallback

// ⏱ tempos aumentados
const INTERACTION_TIME_MS = 180_000; // 3 min pros botões
const NAME_COLLECT_TIME_MS = 180_000; // 3 min pro nome

async function hasStrictPermission(message) {
  try {
    if (!message?.member) return false;
    // usuário específico liberado
    if (ALLOWED_USER_IDS.includes(message.author.id)) return true;

    // checa cargos permitidos
    const memberRoles = message.member.roles.cache.map(r => r.id);
    return ALLOWED_ROLE_IDS.some(id => memberRoles.includes(id));
  } catch {
    return false;
  }
}

async function sendTimed(channel, payload, ms = 10_000) {
  const sent = await channel.send(payload);
  setTimeout(() => sent.delete().catch(() => {}), ms);
  return sent;
}

export default {
  name: 'copycargo',
  description: 'Copia as permissões e cor de um cargo e cria outro igual (com opção de renomear).',
  hasPermission: hasStrictPermission,

  async execute(message) {
    // segurança: apenas no servidor
    if (!message.guild) return;

    // trava de perm
    if (!(await hasStrictPermission(message))) {
      setTimeout(() => message.delete().catch(() => {}), 1000);
      return sendTimed(message.channel, {
        content: 'Você não tem permissão para usar este comando.',
      }, 7000);
    }

    // precisa mencionar um cargo
    const roleMention = message.mentions.roles.first();
    if (!roleMention) {
      return sendTimed(message.channel, {
        content: 'Você precisa **mencionar** um cargo para copiar. Ex: `!copycargo @Cargo`',
      });
    }

    const role = roleMention;

    // =====================================================
    // 🔒 TRAVAS DE SEGURANÇA
    // =====================================================
    const me = message.guild.members.me;
    const member = message.member;

    // 1. Proteção por listas (Env + Fixos)
    const envCargosNao = (process.env.CARGOS_NAO || '').split(',').map(s => s.trim()).filter(Boolean);
    const envProtected = (process.env.PROTECTED_ROLE_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
    const allProtected = [...CARGOS_TRAVADOS_FIXOS, ...envCargosNao, ...envProtected];

    if (allProtected.includes(role.id)) {
      return sendTimed(message.channel, { content: `🚫 O cargo **${role.name}** é protegido e não pode ser copiado.` }, 7000);
    }

    // 2. Proteção: Cargo gerenciado (bot/integração)
    if (role.managed) {
      return sendTimed(message.channel, { content: `🚫 O cargo **${role.name}** é gerenciado por uma integração e não pode ser copiado.` }, 7000);
    }

    // 3. Proteção: Hierarquia do Bot (Acima do Bot)
    if (role.comparePositionTo(me.roles.highest) >= 0) {
      return sendTimed(message.channel, { content: `🚫 Não posso copiar o cargo **${role.name}** pois ele está acima ou igual ao meu cargo mais alto.` }, 7000);
    }

    // 4. Proteção: Hierarquia do Usuário (Acima do Usuário)
    if (message.author.id !== message.guild.ownerId && role.comparePositionTo(member.roles.highest) >= 0) {
      return sendTimed(message.channel, { content: `🚫 Você não pode copiar o cargo **${role.name}** pois ele é igual ou superior ao seu maior cargo.` }, 7000);
    }

    // 5. Proteção: Permissão de Administrador
    if (role.permissions.has(PermissionFlagsBits.Administrator)) {
      return sendTimed(message.channel, { content: `🚫 Segurança: Não é permitido copiar cargos com permissão de **Administrador**.` }, 7000);
    }
    // =====================================================

    // captura config
    const permissionsBitfield = role.permissions?.bitfield ?? 0n; // BigInt em v14
    const color = role.color ?? null;

    // pergunta se quer mudar o nome
    const askEmbed = new EmbedBuilder()
      .setTitle('Deseja mudar o nome do cargo novo?')
      .setColor(BASE_COLOR);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('copycargo:sim').setLabel('Sim').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('copycargo:nao').setLabel('Não').setStyle(ButtonStyle.Secondary),
    );

    const promptMsg = await message.channel.send({ embeds: [askEmbed], components: [row] });

    const filter = (i) =>
      (i.customId === 'copycargo:sim' || i.customId === 'copycargo:nao') &&
      i.user.id === message.author.id;

    const collector = promptMsg.createMessageComponentCollector({ filter, time: INTERACTION_TIME_MS });

    collector.on('collect', async (interaction) => {
      try {
        await interaction.deferUpdate();

        if (interaction.customId === 'copycargo:sim') {
          // pede o novo nome
          await promptMsg.delete().catch(() => {});
          const askName = new EmbedBuilder()
            .setTitle('Qual será o **novo nome** do cargo? (emojis e símbolos são aceitáveis)')
            .setColor(BASE_COLOR);
          await interaction.channel.send({ embeds: [askName] });

          const nameFilter = (m) => m.author.id === message.author.id && m.content?.trim()?.length;
          const nameCollector = interaction.channel.createMessageCollector({
            filter: nameFilter,
            time: NAME_COLLECT_TIME_MS
          });

          nameCollector.on('collect', async (nameMsg) => {
            const newName = nameMsg.content.trim();
            await nameMsg.delete().catch(() => {});
            try {
              const newRole = await message.guild.roles.create({
                name: newName,                    // aceita emojis/símbolos
                color: color ?? undefined,
                permissions: permissionsBitfield, // clona permissões
                mentionable: true,                // facilita mencionar
              });

              await sendTimed(interaction.channel, {
                embeds: [
                  new EmbedBuilder()
                    .setDescription(`Cargo criado com sucesso: <@&${newRole.id}>`)
                    .setColor(BASE_COLOR)
                ]
              });

              // log
              const logChannel = LOG_CHANNEL_ID ? await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null) : null;
              if (logChannel?.isTextBased?.()) {
                const logEmbed = new EmbedBuilder()
                  .setTitle('📋 Log de CopyCargo')
                  .setColor(BASE_COLOR)
                  .setThumbnail(message.author.displayAvatarURL())
                  .addFields(
                    { name: '👤 Usuário', value: `${message.author} (\`${message.author.id}\`)` },
                    { name: '📛 Cargo Base (copiado)', value: `<@&${role.id}>` },
                    { name: '🆕 Cargo Criado', value: `<@&${newRole.id}>` },
                    { name: '💬 Chat', value: `${message.channel}` },
                    { name: '⏰ Data/Hora', value: `<t:${Math.floor(Date.now() / 1000)}:F>` },
                  );
                await logChannel.send({ embeds: [logEmbed] });
              }

              nameCollector.stop();
              collector.stop();
            } catch (err) {
              console.error('Erro ao criar o cargo (rename path):', err);
              await sendTimed(interaction.channel, { content: 'Ocorreu um erro ao criar o cargo.' }, 10_000);
            }
          });

          nameCollector.on('end', async (_c, reason) => {
            if (reason === 'time') {
              await sendTimed(interaction.channel, { content: 'Tempo esgotado para informar o nome.' }, 7000);
            }
          });

        } else {
          // NÃO renomear → "Cópia de <nome>"
          await promptMsg.delete().catch(() => {});
          try {
            const newRole = await message.guild.roles.create({
              name: `Cópia de ${role.name}`,
              color: color ?? undefined,
              permissions: permissionsBitfield,
              mentionable: true,
            });

            await sendTimed(interaction.channel, {
              embeds: [
                new EmbedBuilder()
                  .setDescription(`Cargo criado com sucesso: <@&${newRole.id}>`)
                  .setColor(BASE_COLOR)
              ]
            });

            // log
            const logChannel = LOG_CHANNEL_ID ? await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null) : null;
            if (logChannel?.isTextBased?.()) {
              const logEmbed = new EmbedBuilder()
                .setTitle('📋 Log de CopyCargo')
                .setColor(BASE_COLOR)
                .setThumbnail(message.author.displayAvatarURL())
                .addFields(
                  { name: '👤 Usuário', value: `${message.author} (\`${message.author.id}\`)` },
                  { name: '📛 Cargo Base (copiado)', value: `<@&${role.id}>` },
                  { name: '🆕 Cargo Criado', value: `<@&${newRole.id}>` },
                  { name: '💬 Chat', value: `${message.channel}` },
                  { name: '⏰ Data/Hora', value: `<t:${Math.floor(Date.now() / 1000)}:F>` },
                );
              await logChannel.send({ embeds: [logEmbed] });
            }

            collector.stop();
          } catch (err) {
            console.error('Erro ao criar o cargo (no-rename path):', err);
            await sendTimed(interaction.channel, { content: 'Ocorreu um erro ao criar o cargo.' }, 10_000);
          }
        }
      } catch (err) {
        console.error('Erro no collector do copycargo:', err);
      }
    });

    collector.on('end', async () => {
      // limpa botões se ainda estiver na tela
      if (!promptMsg?.deleted) {
        try { await promptMsg.edit({ components: [] }); } catch {}
      }
    });
  },
};
