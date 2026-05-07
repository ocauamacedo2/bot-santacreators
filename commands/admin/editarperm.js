// d:\santacreators-main\commands\admin\editarperm.js
import fs from 'node:fs';
import path from 'node:path';
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
  ChannelType,
  MessageFlags,
} from 'discord.js';

// ================= CONFIG =================
const ALLOWED_USERS = new Set([
  '1262262852949905408', // owner
  '660311795327828008',  // você
]);

const LOG_CHANNEL_ID = '1479773472082235422';
const PROGRESS_UPDATE_INTERVAL_MS = 1500; // Atualiza a cada 1.5 segundos

// Mapeamento de nomes amigáveis para Flags do Discord
const PERMS_MAP = {
  'visualizar canal': PermissionsBitField.Flags.ViewChannel,
  'gerenciar canal': PermissionsBitField.Flags.ManageChannels,
  'gerenciar permissoes': PermissionsBitField.Flags.ManageRoles,
  'gerenciar webhooks': PermissionsBitField.Flags.ManageWebhooks,
  'vercanal': PermissionsBitField.Flags.ViewChannel,
  'vercanais': PermissionsBitField.Flags.ViewChannel,
  'mandarmensagem': PermissionsBitField.Flags.SendMessages,
  'mensagem': PermissionsBitField.Flags.SendMessages,
  'criar convite': PermissionsBitField.Flags.CreateInstantInvite,
  'enviar mensagens': PermissionsBitField.Flags.SendMessages,
  'enviar mensagens em topicos': PermissionsBitField.Flags.SendMessagesInThreads,
  'criar topicos publicos': PermissionsBitField.Flags.CreatePublicThreads,
  'criar topicos privados': PermissionsBitField.Flags.CreatePrivateThreads,
  'inserir links': PermissionsBitField.Flags.EmbedLinks,
  'anexar arquivos': PermissionsBitField.Flags.AttachFiles,
  'anexar': PermissionsBitField.Flags.AttachFiles,
  'adicionar reacoes': PermissionsBitField.Flags.AddReactions,
  'usar emojis externos': PermissionsBitField.Flags.UseExternalEmojis,
  'usar figurinhas externas': PermissionsBitField.Flags.UseExternalStickers,
  'mencionar everyone': PermissionsBitField.Flags.MentionEveryone,
  'gerenciar mensagens': PermissionsBitField.Flags.ManageMessages,
  'ler historico de mensagens': PermissionsBitField.Flags.ReadMessageHistory,
  'enviar tts': PermissionsBitField.Flags.SendTTSMessages,
  'gerenciar': PermissionsBitField.Flags.ManageChannels,
  'usar comandos de aplicativo': PermissionsBitField.Flags.UseApplicationCommands,
  'conectar': PermissionsBitField.Flags.Connect,
  'falar': PermissionsBitField.Flags.Speak,
  'video': PermissionsBitField.Flags.Stream,
  'usar atividade de voz': PermissionsBitField.Flags.UseVAD,
  'prioridade de voz': PermissionsBitField.Flags.PrioritySpeaker,
  'silenciar membros': PermissionsBitField.Flags.MuteMembers,
  'ensurdecer membros': PermissionsBitField.Flags.DeafenMembers,
  'mover membros': PermissionsBitField.Flags.MoveMembers,
  'administrador': PermissionsBitField.Flags.Administrator
};

// Caminho para salvar estados de Undo
const DATA_DIR = path.resolve('data', 'admin');
const UNDO_FILE = path.join(DATA_DIR, 'editarperm_undo.json');

// ================= HELPERS =================
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function saveUndoState(id, data) {
  ensureDataDir();
  let store = {};
  try {
    if (fs.existsSync(UNDO_FILE)) {
      store = JSON.parse(fs.readFileSync(UNDO_FILE, 'utf-8'));
    }
  } catch {}
  
  store[id] = {
    timestamp: Date.now(),
    ...data
  };
  
  // Limpeza básica (remove estados com mais de 7 dias)
  const now = Date.now();
  for (const key in store) {
    if (now - store[key].timestamp > 7 * 24 * 60 * 60 * 1000) {
      delete store[key];
    }
  }

  fs.writeFileSync(UNDO_FILE, JSON.stringify(store, null, 2));
}

function loadUndoState(id) {
  try {
    if (!fs.existsSync(UNDO_FILE)) return null;
    const store = JSON.parse(fs.readFileSync(UNDO_FILE, 'utf-8'));
    return store[id] || null;
  } catch {
    return null;
  }
}

function normalize(str) {
  return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

// ================= COMANDO: !verperms =================
export async function verPermsHandleMessage(message) {
  if (!message.guild || message.author.bot) return false;
  const content = message.content.toLowerCase();

  // Aceita variações comuns como !verperms ou !verpemrs
  if (!content.startsWith('!verperms') && !content.startsWith('!verpemrs') && !content.startsWith('!verperm')) return false;

  if (!ALLOWED_USERS.has(message.author.id)) {
    const reply = await message.reply('❌ Você não possui permissão para ver o guia de permissões.');
    setTimeout(() => {
      message.delete().catch(() => {});
      reply.delete().catch(() => {});
    }, 5000);
    return true;
  }

  // Apaga comando
  await message.delete().catch(() => {});

  // Organiza as chaves em colunas para facilitar a leitura
  const keys = Object.keys(PERMS_MAP).sort();
  let listaFormatada = "";
  for (let i = 0; i < keys.length; i += 2) {
    const k1 = keys[i].padEnd(22);
    const k2 = keys[i + 1] ? `| ${keys[i + 1]}` : "";
    listaFormatada += `\`${k1}${k2}\` \n`;
  }

  const embed = new EmbedBuilder()
    .setTitle(' Guia de Uso: !editarperm')
    .setDescription(
      `O comando permite configurar permissões de um cargo em **toda uma categoria** (incluindo todos os canais dentro dela) de forma massiva.\n\n` +
      `**Estrutura do comando:**\n` +
      `\`!editarperm @Cargo <ID_DA_CATEGORIA> chave1,chave2,chave3\`\n\n` +
      `**Exemplo prático:**\n` +
      `\`!editarperm @Moderador 1359244725781266492 vercanal,mandarmensagem,conectar,falar\`\n\n` +
      `**Chaves disponíveis (o que por depois das vírgulas):**\n` +
      `${listaFormatada}`
    )
    .setColor('#00AAFF')
    .addFields({
      name: '⚠️ Importante',
      value: '• Não use espaços entre as vírgulas.\n• Permissões não listadas serão **removidas** do cargo nos canais alvo.'
    })
    .setFooter({ text: 'Este guia será apagado em 1 minuto.' });

  const msg = await message.channel.send({ embeds: [embed] });

  // Apaga depois de 1 minuto
  setTimeout(() => {
    msg.delete().catch(() => {});
  }, 60 * 1000);

  return true;
}

// ================= COMANDO: !editarperm =================
export async function editarPermHandleMessage(message, args, client) {
  if (!message.guild || message.author.bot) return false;
  if (!message.content.toLowerCase().startsWith('!editarperm')) return false;

  if (!ALLOWED_USERS.has(message.author.id)) {
    return false;
  }

  // Apaga comando imediatamente
  await message.delete().catch(() => {});

  // Feedback inicial
  const statusMsg = await message.channel.send('🔄 **Processando alterações de permissão...**');

  try {
    // 1. Cargo
    const roleMention = args.shift();
    const roleId = roleMention?.replace(/[<@&>]/g, '');
    const role = message.guild.roles.cache.get(roleId);

    // 2. Categoria opcional
let category = null;
let permsString = '';

const possibleCategoryId = args[0];
const possibleCategory = possibleCategoryId
  ? message.guild.channels.cache.get(possibleCategoryId)
  : null;

if (possibleCategory && possibleCategory.type === ChannelType.GuildCategory) {
  args.shift();
  category = possibleCategory;
}

// 3. Permissões
permsString = args.join(' ');
const permsList = permsString
  .split(',')
  .map(s => normalize(s))
  .filter(Boolean);

if (!role || !permsList.length) {
  await statusMsg.edit(
    '❌ **Erro:** Uso incorreto.\n' +
    '`!editarperm @cargo <id_categoria> permissao1,permissao2`\n' +
    'ou\n' +
    '`!editarperm @cargo permissao1,permissao2`'
  );
  setTimeout(() => statusMsg.delete().catch(() => {}), 10000);
  return true;
}

    // Mapear permissões
    const newPerms = {};
    const permsNames = [];
    
    for (const pName of permsList) {
      const flag = PERMS_MAP[pName];
      if (flag) {
        newPerms[flag] = true;
        permsNames.push(pName);
      }
    }

    if (Object.keys(newPerms).length === 0) {
      await statusMsg.edit('❌ **Erro:** Nenhuma permissão válida encontrada. Use `!verperms` para ver a lista.');
      setTimeout(() => statusMsg.delete().catch(() => {}), 10000);
      return true;
    }

    // ================= EXECUÇÃO =================
    
    // Snapshot para Undo
    const undoId = `${message.id}-${Date.now()}`;
   const undoData = {
  guildId: message.guild.id,
  roleId: role.id,
  categoryId: category ? category.id : null,
  mode: category ? 'category' : 'guild',
  executorId: message.author.id,
  channels: [] // { id, allow, deny }
};

    // Função para capturar estado atual de um canal/categoria
    const snapshotChannel = (ch) => {
      const overwrite = ch.permissionOverwrites.cache.get(role.id);
      return {
        id: ch.id,
        name: ch.name,
        type: ch.type === ChannelType.GuildCategory ? 'Categoria' : 'Canal',
        allow: overwrite ? overwrite.allow.bitfield.toString() : null,
        deny: overwrite ? overwrite.deny.bitfield.toString() : null
      };
    };

  // Lista de canais afetados
// Se tiver categoria: categoria + filhos
// Se não tiver categoria: varre todos os canais/categorias do servidor
const targets = category
  ? [category, ...category.children.cache.values()]
  : [...message.guild.channels.cache.values()].filter(ch => {
      return (
        ch &&
        ch.manageable &&
        ch.permissionOverwrites &&
        typeof ch.permissionOverwrites.create === 'function'
      );
    });

// Atualiza status
await statusMsg.edit(
  category
    ? `🔄 **Aplicando permissões em ${targets.length} canais/categoria da categoria ${category.name}...**`
    : `🔄 **Varrendo o servidor inteiro e aplicando permissões onde o bot tem acesso...**\nEncontrados: **${targets.length}** canais/categorias editáveis.`
);

    let changedCount = 0;

    for (const target of targets) {
      // Salva estado anterior
      undoData.channels.push(snapshotChannel(target));

      // Aplica nova permissão (Deleta overwrite anterior e cria novo apenas com as perms solicitadas)
      // Isso garante que "todas as outras perms são removidas"
      try {
        // Remove overwrite existente para limpar tudo
        if (target.permissionOverwrites.cache.has(role.id)) {
          await target.permissionOverwrites.delete(role.id, `EditarPerm: Reset by ${message.author.tag}`);
        }
        
        // Cria novo com as perms Allow especificadas (o resto fica neutro/inherit)
        await target.permissionOverwrites.create(role, newPerms, { reason: `EditarPerm: Set by ${message.author.tag}` });
        changedCount++;
      } catch (err) {
        console.error(`Erro ao editar canal ${target.name}:`, err);
      }
    }

    // Salva Undo
    saveUndoState(undoId, undoData);

    // ================= LOGS =================
    const logChannel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    if (logChannel && logChannel.isTextBased()) {
      const logEmbed = new EmbedBuilder()
        .setTitle('🛠️ Permissões Editadas em Massa')
        .setColor('#FFAA00')
        .addFields(
          { name: '👤 Executor', value: `<@${message.author.id}>`, inline: true },
          { name: '🎭 Cargo Afetado', value: `<@&${role.id}>`, inline: true },
          {
  name: '📂 Escopo',
  value: category
    ? `Categoria: ${category.name} (\`${category.id}\`)`
    : 'Servidor inteiro — apenas canais/categorias onde o bot conseguiu editar',
  inline: false
},
          { name: '✅ Permissões Definidas', value: permsNames.map(p => `\`${p}\``).join(', '), inline: false },
          { name: '📊 Canais Afetados', value: `${changedCount} canais`, inline: true },
          { name: '📍 Canal do Comando', value: `<#${message.channel.id}>`, inline: true }
        )
        .setTimestamp()
        .setFooter({ text: `Undo ID: ${undoId}` });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`editarperm_undo:${undoId}`)
          .setLabel('Desfazer Alterações')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('↩️'),
        new ButtonBuilder()
          .setLabel(`Executor: ${message.author.username}`)
          .setStyle(ButtonStyle.Secondary)
          .setCustomId('disabled_user_info')
          .setDisabled(true)
      );

      await logChannel.send({ embeds: [logEmbed], components: [row] });
    }

    // ================= CONCLUSÃO =================
    await statusMsg.edit(
  category
    ? `✅ **Concluído!** Permissões do cargo **${role.name}** alteradas na categoria **${category.name}** e seus canais.\nPermissões definidas: ${permsNames.join(', ')}.`
    : `✅ **Concluído!** Permissões do cargo **${role.name}** alteradas no servidor inteiro onde o bot tinha acesso.\nCanais/categorias alterados: **${changedCount}**.\nPermissões definidas: ${permsNames.join(', ')}.`
);

    // Apaga conclusão após 20s
    setTimeout(() => {
      statusMsg.delete().catch(() => {});
    }, 20000);

  } catch (error) {
    console.error('Erro no !editarperm:', error);
    await statusMsg.edit(`❌ **Erro Crítico:** ${error.message}`);
    setTimeout(() => statusMsg.delete().catch(() => {}), 15000);
  }

  return true;
}

// ================= INTERAÇÃO: UNDO =================
export async function editarPermHandleInteraction(interaction, client) {
  if (!interaction.isButton()) return false;
  if (!interaction.customId.startsWith('editarperm_undo:')) return false;

  if (!ALLOWED_USERS.has(interaction.user.id)) {
    await interaction.reply({ content: '🚫 Você não tem permissão para desfazer.', ephemeral: true });
    return true;
  }

  const undoId = interaction.customId.split(':')[1];
  const undoData = loadUndoState(undoId);

  if (!undoData) {
    await interaction.reply({ content: '❌ Dados de desfazer não encontrados ou expirados.', ephemeral: true });
    return true;
  }

  await interaction.reply({ content: '🔄 **Desfazendo alterações... aguarde.**', ephemeral: true });

  const guild = client.guilds.cache.get(undoData.guildId);
  if (!guild) return true;

  const role = guild.roles.cache.get(undoData.roleId);
  if (!role) {
    await interaction.followUp({ content: '❌ O cargo não existe mais.', ephemeral: true });
    return true;
  }

  let restoredCount = 0;

  for (const chData of undoData.channels) {
    const channel = guild.channels.cache.get(chData.id);
    if (!channel) continue;

    try {
      if (chData.allow === null && chData.deny === null) {
        // Não tinha overwrite antes, então remove o atual
        if (channel.permissionOverwrites.cache.has(role.id)) {
          await channel.permissionOverwrites.delete(role.id, `Undo: Revert by ${interaction.user.tag}`);
        }
      } else {
        // Tinha overwrite, restaura valores
        await channel.permissionOverwrites.create(role, {
          ...PermissionsBitField.resolve(BigInt(chData.allow || 0)).serialize(), // Converte bitfield allow para objeto true
          // Para deny, precisamos setar false no objeto de create? 
          // create(role, { Flag: true/false })
          // Se estava no deny, setamos false. Se estava no allow, true.
        }, { reason: `Undo: Revert by ${interaction.user.tag}` });

        // O método acima é simplificado. Para restaurar EXATAMENTE allow/deny bitfields:
        // Precisamos usar edit com allow/deny explícitos
        await channel.permissionOverwrites.edit(role, {
          allow: BigInt(chData.allow || 0),
          deny: BigInt(chData.deny || 0)
        }, { reason: `Undo: Revert by ${interaction.user.tag}` });
      }
      restoredCount++;
    } catch (e) {
      console.error(`Erro ao restaurar canal ${chData.id}:`, e);
    }
  }

  // Log do Undo
  const logChannel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
  if (logChannel && logChannel.isTextBased()) {
    const logEmbed = new EmbedBuilder()
      .setTitle('↩️ Alterações Desfeitas')
      .setColor('#FF0000')
      .setDescription(`As permissões do cargo <@&${role.id}> foram restauradas para o estado anterior.`)
      .addFields(
        { name: '👤 Quem Desfez', value: `<@${interaction.user.id}>`, inline: true },
        { name: '📊 Canais Restaurados', value: `${restoredCount}`, inline: true }
      )
      .setTimestamp();
    
    await logChannel.send({ embeds: [logEmbed] });
  }

  // Atualiza botão original para desativado
  try {
    const row = ActionRowBuilder.from(interaction.message.components[0]);
    row.components[0].setDisabled(true).setLabel('Desfeito');
    await interaction.message.edit({ components: [row] });
  } catch {}

  await interaction.editReply({ content: `✅ **Sucesso!** ${restoredCount} canais/categorias restaurados.` });
  return true;
}

export default {
  name: 'editarperm',
  execute: editarPermHandleMessage,
};
