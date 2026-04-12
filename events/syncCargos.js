import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Events, PermissionFlagsBits } from 'discord.js';

const MAIN_GUILD_ID = '1262262852782129183';

// MAPEAMENTO DE CARGOS (ID Principal -> ID Secundário)
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
  '660311795327828008', // Você
  '1262262852949905408'  // Owner
];

async function syncMember(client, targetMember) {
  // Proteção: Nunca altera nada se o servidor atual for o principal
  if (!targetMember || targetMember.guild.id === MAIN_GUILD_ID) return;

  try {
    const mainGuild = await client.guilds.fetch(MAIN_GUILD_ID).catch(() => null);
    if (!mainGuild) return;

    const mainMember = await mainGuild.members.fetch(targetMember.id).catch(() => null);
    if (!mainMember) return;

    // SINCRONIZA NOME (Apenas se for diferente)
    if (targetMember.nickname !== mainMember.displayName) {
      await targetMember.setNickname(mainMember.displayName).catch(() => {});
    }

    const rolesToAdd = [];
    const rolesToKeep = Object.values(ROLE_MAP);

    for (const [mainRoleId, targetRoleId] of Object.entries(ROLE_MAP)) {
      if (mainMember.roles.cache.has(mainRoleId)) {
        rolesToAdd.push(targetRoleId);
      }
    }

    // REMOVE CARGOS (Menos os que possuem Administrador e os que estão no mapa)
    const rolesToRemove = targetMember.roles.cache.filter(r =>
      r.id !== targetMember.guild.id && // Ignora @everyone
      !r.managed && // Ignora cargos de bots/integrações
      !r.permissions.has(PermissionFlagsBits.Administrator) &&
      !rolesToKeep.includes(r.id)
    );

    for (const role of rolesToRemove.values()) {
      if (role.editable) {
        await targetMember.roles.remove(role).catch(() => {});
      }
    }

    // ADICIONA CARGOS MAPEADOS
    for (const roleId of rolesToAdd) {
      if (!targetMember.roles.cache.has(roleId)) {
        await targetMember.roles.add(roleId).catch(() => {});
      }
    }
  } catch (err) {
    console.error(`[SYNC-CARGOS] Erro ao sincronizar ${targetMember.user.tag}:`, err);
  }
}

export function setupSyncCargos(client) {
  // Sincroniza quando alguém entra no servidor secundário
  client.on(Events.GuildMemberAdd, async (member) => {
    await syncMember(client, member);
  });

  // Comando manual: !sincronizarcargos
  client.on(Events.MessageCreate, async (message) => {
    if (!message.content.startsWith('!sincronizarcargos')) return;
    if (!AUTHORIZED_USERS.includes(message.author.id)) return;
    if (!message.guild || message.guild.id === MAIN_GUILD_ID) return;

    const status = await message.reply('⏳ Iniciando sincronização global neste servidor...');
    const members = await message.guild.members.fetch();

    for (const member of members.values()) {
      if (member.user.bot) continue;
      await syncMember(client, member);
    }

    await status.edit('✅ Sincronização de cargos finalizada com sucesso!').catch(() => {});
  });

  // Interação de Botão
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;
    if (interaction.customId === 'sync_roles_btn') {
      await interaction.deferReply({ ephemeral: true });
      await syncMember(client, interaction.member);
      await interaction.editReply('✅ Seus cargos foram sincronizados com o servidor principal!');
    }
  });
}
