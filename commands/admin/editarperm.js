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
} from 'discord.js';

// ================= CONFIG =================
const ALLOWED_USERS = new Set([
  '1262262852949905408', // owner
  '660311795327828008',  // você
]);

const LOG_CHANNEL_ID = '1479773472082235422';

// Mapeamento de nomes amigáveis para Flags do Discord
const PERMS_MAP = {
  'visualizar canal': PermissionsBitField.Flags.ViewChannel,
  'gerenciar canal': PermissionsBitField.Flags.ManageChannels,
  'gerenciar permissoes': PermissionsBitField.Flags.ManageRoles,
  'gerenciar webhooks': PermissionsBitField.Flags.ManageWebhooks,
  'criar convite': PermissionsBitField.Flags.CreateInstantInvite,
  'enviar mensagens': PermissionsBitField.Flags.SendMessages,
  'enviar mensagens em topicos': PermissionsBitField.Flags.SendMessagesInThreads,
  'criar topicos publicos': PermissionsBitField.Flags.CreatePublicThreads,
  'criar topicos privados': PermissionsBitField.Flags.CreatePrivateThreads,
  'inserir links': PermissionsBitField.Flags.EmbedLinks,
  'anexar arquivos': PermissionsBitField.Flags.AttachFiles,
  'adicionar reacoes': PermissionsBitField.Flags.AddReactions,
  'usar emojis externos': PermissionsBitField.Flags.UseExternalEmojis,
  'usar figurinhas externas': PermissionsBitField.Flags.UseExternalStickers,
  'mencionar everyone': PermissionsBitField.Flags.MentionEveryone,
  'gerenciar mensagens': PermissionsBitField.Flags.ManageMessages,
  'ler historico de mensagens': PermissionsBitField.Flags.ReadMessageHistory,
  'enviar tts': PermissionsBitField.Flags.SendTTSMessages,
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
  if (!message.content.toLowerCase().startsWith('!verperms')) return false;

  if (!ALLOWED_USERS.has(message.author.id)) {
    return false; // Ignora silenciosamente ou pode mandar msg de erro
  }

  // Apaga comando
  await message.delete().catch(() => {});

  const lista = Object.keys(PERMS_MAP).map(p => `• \`${p}\``).join('\n');

  const embed = new EmbedBuilder()
    .setTitle('📜 Permissões Disponíveis para !editarperm')
    .setDescription(`Use estas chaves no comando (separadas por vírgula):\n\n${lista}`)
    .setColor('#00AAFF')
    .setFooter({ text: 'Esta mensagem será apagada em 2 minutos.' });

  const msg = await message.channel.send({ embeds: [embed] });

  // Apaga depois de 2 minutos
  setTimeout(() => {
    msg.delete().catch(() => {});
  }, 2 * 60 * 1000);

  return true;
}

// ================= COMANDO: !editarperm =================
export async function editarPermHandleMessage(message, client) {
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
    // Parse: !editarperm @cargo <id_cat> perm1, perm2
    const args = message.content.slice('!editarperm'.length).trim().split(/ +/);
    
    // 1. Cargo
    const roleMention = args.shift();
    const roleId = roleMention?.replace(/[<@&>]/g, '');
    const role = message.guild.roles.cache.get(roleId);

    // 2. Categoria
    const catId = args.shift();
    const category = message.guild.channels.cache.get(catId);

    // 3. Permissões (o resto da string)
    const permsString = args.join(' ');
    const permsList = permsString.split(',').map(s => normalize(s));

    if (!role || !category || category.type !== ChannelType.GuildCategory || !permsList.length) {
      await statusMsg.edit('❌ **Erro:** Uso incorreto.\n`!editarperm @cargo <id_categoria> Permissao1, Permissao2`');
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
      categoryId: category.id,
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

    // Lista de canais afetados (Categoria + Filhos)
    const targets = [category, ...category.children.cache.values()];
    
    // Atualiza status
    await statusMsg.edit(`🔄 **Aplicando permissões em ${targets.length} canais/categoria...**`);

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
    const logChannel = LOG_CHANNEL_ID ? await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null) : null;
    if (logChannel && logChannel.isTextBased()) {
      const logEmbed = new EmbedBuilder()
        .setTitle('🛠️ Permissões Editadas em Massa')
        .setColor('#FFAA00')
        .addFields(
          { name: '👤 Executor', value: `<@${message.author.id}>`, inline: true },
          { name: '🎭 Cargo Afetado', value: `<@&${role.id}>`, inline: true },
          { name: '📂 Categoria', value: `${category.name} (\`${category.id}\`)`, inline: false },
          { name: '✅ Permissões Definidas', value: permsNames.map(p => `\`${p}\``).join(', '), inline: false },
          { name: '📊 Canais Afetados', value: `${changedCount} canais`, inline: true },
          { name: '📍 Canal do Comando', value: `<#${message.channel.id}>`, inline: true }
        )
        .setTimestamp()
        .setFooter({ text: `Undo ID: ${undoId}` });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`editarperm_undo:`)
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
    await statusMsg.edit(`✅ **Concluído!** Permissões do cargo **${role.name}** alteradas na categoria **${category.name}** e seus canais.\nPermissões definidas: ${permsNames.join(', ')}.`);

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
  const logChannel = LOG_CHANNEL_ID ? await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null) : null;
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
