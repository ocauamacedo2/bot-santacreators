import { EmbedBuilder } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

// =======================
// CONFIG FIXA
// =======================
const CARGO_INTERACAO_COM_BOT = '1352493359897378941';
const CARGOS_PODEM_SETAR_INTERACAO = [
  '660311795327828008', // eu
  '1262262852949905408', // owner
  '1352408327983861844', // Resp Creator
  '1262262852949905409', // Resp Influ
  '1352407252216184833'  // Resp Lider
];

// =======================
// LOGS POR SERVIDOR
// =======================
// SantaCreators (Cidade Santa) guild: 1362899773992079533 -> canal: 1363295055384809483
// DC Administração guild: 1452416085751234733 -> canal: 1455312395269443813
const LOGS_BY_GUILD = {
  '1362899773992079533': '1363295055384809483',
  '1452416085751234733': '1455312395269443813',
};

// Fallback opcional (se quiser manter env antiga como reserva)
// Se não quiser fallback, pode deixar vazio.
const FALLBACK_LOGS_CHANNEL = (process.env.ADDCARGO_CHANNEL || '').split(',').map(s => s.trim()).filter(Boolean)[0] || null;

// Cargos proibidos via ENV
const CARGOSOFF = process.env.CARGOS_NAO;

// ✅ CARGOS TRAVADOS (Hardcoded) - Segurança extra
const CARGOS_TRAVADOS_FIXOS = [
  '1371733765243670538',
  '1352275728476930099',
  '1353841582176210944',
  '1403170838529966140'
];

// Hierarquia interna (opcional)
const hierarquia = [
  '1377127454543708253', // Diretoria SG
  '1373016502424571974', // Alta Cúpula
  '1377109308730376202', // Resp Comunidade
  '1366961308314108015', // Resp Staff
  '1366960248530796564', // Master Staff
  '1352367267547058319', // ADM
  '1379172775905984703', // Sênior
  '1381865464187326545', // Auxiliar
  '1379172895116361770'  // Pleno
];

function getLogChannel(message) {
  const guildId = message.guild?.id;
  if (!guildId) return null;

  const channelId = LOGS_BY_GUILD[guildId] || FALLBACK_LOGS_CHANNEL;
  if (!channelId) return null;

  const ch = message.guild.channels.cache.get(channelId);
  return ch?.isTextBased() ? ch : null;
}

async function hasPermission(message) {
  // donos sempre podem
  const owners = (process.env.OWNER || '').split(',').map(id => id.trim()).filter(Boolean);
  if (owners.includes(message.author.id)) return true;

  // cargos de staff (env STAFF)
  const staffRoles = (process.env.STAFF || '').split(',').map(id => id.trim()).filter(Boolean);

  // cargos que podem usar comandos de cargo (env ROLES_PERMISSION)
  const rolesPermission = (process.env.ROLES_PERMISSION || '').split(',').map(id => id.trim()).filter(Boolean);

  // responsáveis por cargos (env RESPS_CARGOS)
  const respsCargos = (process.env.RESPS_CARGOS || '').split(',').map(id => id.trim()).filter(Boolean);

  // cargos relacionados à interação com bot (env INTERACAO_BOT)
  const interacaoBotRoles = (process.env.INTERACAO_BOT || '').split(',').map(id => id.trim()).filter(Boolean);

  // força incluir Interação BOT na lista de cargos permitidos (se não estiver)
  const roleIds = [
    ...staffRoles,
    ...rolesPermission,
    ...respsCargos,
    ...interacaoBotRoles,
  ];
  if (!roleIds.includes(CARGO_INTERACAO_COM_BOT)) roleIds.push(CARGO_INTERACAO_COM_BOT);

  const memberRoles = message.member.roles.cache.map(role => role.id);
  return roleIds.some(roleId => memberRoles.includes(roleId));
}

async function execute(message, args) {
  if (!await hasPermission(message)) {
    setTimeout(() => message.delete().catch(() => {}), 1000);
    return message.reply('❌ Você não tem permissão para usar este comando.')
      .then(msg => setTimeout(() => msg.delete().catch(() => {}), 6000));
  }

  const roleMention = message.mentions.roles.first();
  const roleId = roleMention ? roleMention.id : args.shift();
  const role = message.guild.roles.cache.get(roleId);

  if (!role) {
    return message.reply('❌ Cargo não encontrado. Mencione o cargo ou forneça o ID corretamente.')
      .then(msg => setTimeout(() => msg.delete().catch(() => {}), 7000));
  }

  const cargosproibidosEnv = (CARGOSOFF || '').split(',').map(id => id.trim()).filter(Boolean);
  const cargosproibidos = [...cargosproibidosEnv, ...CARGOS_TRAVADOS_FIXOS];

  if (cargosproibidos.includes(role.id)) {
    return message.reply(`🚫 O cargo **${role.name}** não pode ser adicionado através deste comando.`)
      .then(msg => setTimeout(() => msg.delete().catch(() => {}), 7000));
  }

  // ❗️Verificação por hierarquia interna (opcional)
  const executorCargoMaisAlto = message.member.roles.cache
    .filter(r => hierarquia.includes(r.id))
    .sort((a, b) => hierarquia.indexOf(a.id) - hierarquia.indexOf(b.id))
    .first();

  if (executorCargoMaisAlto) {
    const cargoAlvoPos = hierarquia.indexOf(role.id);
    const executorPos = hierarquia.indexOf(executorCargoMaisAlto.id);
    if (cargoAlvoPos < executorPos && cargoAlvoPos !== -1) {
      return message.reply('⚠️ Você não pode setar esse cargo, pois ele está acima do seu na hierarquia interna.')
        .then(msg => setTimeout(() => msg.delete().catch(() => {}), 7000));
    }
  }

  // ✅ Verificação real de hierarquia do Discord
  const highestRole = message.member.roles.highest;
  if (role.position >= highestRole.position) {
    return message.channel.send({
      content: `❌ <@${message.author.id}> você não pode setar o cargo **${role.name}**, pois ele está no mesmo nível ou acima do seu cargo mais alto (**${highestRole.name}**).`,
    }).then(msg => setTimeout(() => msg.delete().catch(() => {}), 10000));
  }

  // alvos
  let members = message.mentions.members;
  if (!members || members.size === 0) {
    const userIds = args;
    const col = new Map();
    for (const userId of userIds) {
      const member = await message.guild.members.fetch(userId).catch(() => null);
      if (member) col.set(member.id, member);
    }
    if (col.size === 0) {
      return message.reply('❗ Por favor, mencione um ou mais usuários ou forneça os IDs deles.')
        .then(msg => setTimeout(() => msg.delete().catch(() => {}), 7000));
    }
    // recria no formato esperado
    members = { size: col.size, map: (fn) => [...col.values()].map(fn), values: () => col.values() };
  }

  // adiciona cargo
  for (const member of members.values()) {
    try {
      await member.roles.add(role);
    } catch (error) {
      console.error(`Erro ao adicionar cargo a ${member.user.tag}:`, error);
      return message.channel.send({
        content: `❌ <@${message.author.id}> você não pode adicionar cargo em **${member.user.tag}**, pois ele possui um cargo maior ou igual ao seu.`,
      }).then(msg => setTimeout(() => msg.delete().catch(() => {}), 10000));
    }
  }

  const nomes = members.map(member => `<@${member.user.id}>`).join(', ');
  const embed = new EmbedBuilder()
    .setColor('#00FF00')
    .setTitle('✅ Cargo adicionado com sucesso!')
    .addFields(
      { name: '👤 Adicionado por:', value: `<@${message.author.id}>`, inline: false },
      { name: '👥 Em:', value: nomes, inline: false },
      { name: '🧷 Cargo:', value: `<@&${role.id}>`, inline: true },
      { name: '🕒 Quando:', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
    )
    .setThumbnail(message.author.displayAvatarURL({ dynamic: true, size: 1024 }))
    .setFooter({ text: `Hoje às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` })
    .setTimestamp();

  const visualMessage = await message.channel.send({ embeds: [embed] });

  // ✅ LOG SÓ NO CANAL DO SERVIDOR ATUAL (sem vazar)
  const logChannel = getLogChannel(message);
  if (logChannel && logChannel.id !== message.channel.id) {
    await logChannel.send({ embeds: [embed] }).catch(() => {});
  }

  setTimeout(() => {
    message.delete().catch(() => {});
    visualMessage.delete().catch(() => {});
  }, 10000);
}

export default {
  name: 'addcargo',
  description: 'Adiciona um cargo a um ou mais usuários',
  execute
};
