import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Events,
  PermissionFlagsBits
} from 'discord.js';

const MAIN_GUILD_ID = '1262262852782129183';
const BUTTON_CHANNEL_ID = '1493014122944532560';
const BUTTON_CUSTOM_ID = 'sync_roles_btn';

const ROLE_MAP = {
  '1352408327983861844': '1493008185970262048', // Resp Creators
  '1262262852949905409': '1490389060802445463', // Resp Influ
  '1352407252216184833': '1489955553592742019', // Resp Lider
  '1388976314253312100': '1483392951378772030', // Coord Creators
  '1388975939161161728': '1483393762737782885', // Gestor Creators
  '1388976155830255697': '1483393512337575997', // Manager Creators
  '1388976094920704141': '1483391811794767942', // Social Medias
  '1392678638176043029': '1483393303230808155', // Equipe Manager
  '1387253972661964840': '1483392652924813475'  // Equipe Social
};

const AUTHORIZED_USERS = [
  '660311795327828008',
  '1262262852949905408'
];

async function ensureSyncButtonMessage(client) {
  try {
    const channel = await client.channels.fetch(BUTTON_CHANNEL_ID).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    const messages = await channel.messages.fetch({ limit: 20 }).catch(() => null);
    if (!messages) return;

    const existing = messages.find(msg =>
      msg.author?.id === client.user.id &&
      msg.components?.some(row =>
        row.components?.some(component => component.customId === BUTTON_CUSTOM_ID)
      )
    );

    if (existing) return;

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(BUTTON_CUSTOM_ID)
        .setLabel('Setar Cargo')
        .setStyle(ButtonStyle.Success)
    );

    await channel.send({
      content: 'Clique no botão abaixo para sincronizar seus cargos e nome com o servidor principal.',
      components: [row]
    });
  } catch (err) {
    console.error('[SYNC-CARGOS] Erro ao criar botão fixo:', err);
  }
}

async function syncMember(client, targetMember) {
  if (!targetMember || targetMember.guild.id === MAIN_GUILD_ID) return;

  try {
    const mainGuild = await client.guilds.fetch(MAIN_GUILD_ID).catch(() => null);
    if (!mainGuild) return;

    const mainMember = await mainGuild.members.fetch(targetMember.id).catch(() => null);
    if (!mainMember) return;

    if (targetMember.nickname !== mainMember.displayName) {
      await targetMember.setNickname(mainMember.displayName).catch(() => {});
    }

    const rolesToAdd = [];
    const mappedSecondaryRoles = Object.values(ROLE_MAP);

    for (const [mainRoleId, secondaryRoleId] of Object.entries(ROLE_MAP)) {
      if (mainMember.roles.cache.has(mainRoleId)) {
        rolesToAdd.push(secondaryRoleId);
      }
    }

    const rolesToRemove = targetMember.roles.cache.filter(role =>
      role.id !== targetMember.guild.id &&
      !role.managed &&
      !role.permissions.has(PermissionFlagsBits.Administrator)
    );

    for (const role of rolesToRemove.values()) {
      if (!role.editable) continue;

      const shouldKeepMappedRole = rolesToAdd.includes(role.id);
      if (!shouldKeepMappedRole) {
        await targetMember.roles.remove(role).catch(() => {});
      }
    }

    for (const roleId of rolesToAdd) {
      if (!targetMember.roles.cache.has(roleId)) {
        const role = targetMember.guild.roles.cache.get(roleId);
        if (role && role.editable) {
          await targetMember.roles.add(roleId).catch(() => {});
        }
      }
    }
  } catch (err) {
    console.error(`[SYNC-CARGOS] Erro ao sincronizar ${targetMember.user.tag}:`, err);
  }
}

export function setupSyncCargos(client) {
  client.once(Events.ClientReady, async () => {
    await ensureSyncButtonMessage(client);
  });

  client.on(Events.GuildMemberAdd, async (member) => {
    if (member.user.bot) return;
    await syncMember(client, member);
  });

  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    if (!message.guild) return;
    if (message.guild.id === MAIN_GUILD_ID) return;
    if (!message.content.startsWith('!sincronizarcargos')) return;
    if (!AUTHORIZED_USERS.includes(message.author.id)) return;

    const status = await message.reply('⏳ Iniciando sincronização global neste servidor...').catch(() => null);

    const members = await message.guild.members.fetch().catch(() => null);
    if (!members) {
      if (status) {
        await status.edit('❌ Não consegui buscar os membros deste servidor.').catch(() => {});
      }
      return;
    }

    for (const member of members.values()) {
      if (member.user.bot) continue;
      await syncMember(client, member);
    }

    if (status) {
      await status.edit('✅ Sincronização de cargos finalizada com sucesso!').catch(() => {});
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;
    if (interaction.customId !== BUTTON_CUSTOM_ID) return;

    await interaction.deferReply({ ephemeral: true }).catch(() => {});

    await syncMember(client, interaction.member);

    await interaction.editReply('✅ Seus cargos foram sincronizados com o servidor principal!').catch(() => {});
  });
}