// d:\bots\events\cadastroManual.js
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  OverwriteType,
} from "discord.js";

// ====== CONFIGS ======
const CHANNEL_ID = '1384238156731252736';     // canal onde fica o botão
const CARGO_CIDADAO = '1262978759922028575';  // role "Cidadão"
// cargo temporário que a pessoa tem ANTES do cadastro e deve ser removido DEPOIS de enviar o modal:
const CARGO_TEMP_REMOVER = '1430984036972494908';

const GIF_BANNER_SETARCARGO_CIDADAO = 'https://media.discordapp.net/attachments/1362477839944777889/1384245215249825832/standard_2rss.gif?ex=68fb2311&is=68f9d191&hm=eb8c8c6bc6fbf723af69152eb5fff67c0a39eea8c38ff7445b300befea2d93b7&=&width=515&height=66';

// customId fixo pra localizar/remover mensagens antigas do bot
const BOTAO_CUSTOM_ID = 'cadastro_cidadao';

// Configs do botão de limpeza
const LOG_CHANNEL_ID = '1486009608765050940';
const BOTAO_LIMPAR_ID = 'cadastro_limpar_registros';
const BOTAO_RESTAURAR_ID = 'cadastro_restaurar_backup';

const ALLOWED_CLEAR_USERS = ['660311795327828008', '1262262852949905408'];
const ALLOWED_CLEAR_ROLES = [
  '1352407252216184833', // resp lider
  '1352408327983861844', // resp creators
  '1262262852949905409', // resp influ
  '1282119104576098314', // mkt creators
];

// Persistência do backup
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKUP_FILE = path.resolve(__dirname, "../data/cadastro_backup.json");

// ====== UTILS ======
function sanitizeNick(nome, id) {
  const base = `${String(nome).trim()} | ${String(id).trim()}`.replace(/\s+/g, ' ');
  return base.length <= 32 ? base : base.slice(0, 32);
}

async function setNickSafe(member, newNick) {
  try {
    if (!member?.manageable) throw new Error('membro não é gerenciável (hierarquia/permissão)');
    await member.setNickname(newNick);
    return true;
  } catch (e) {
    console.warn('[nick] falhou:', e?.message || e);
    return false;
  }
}

async function addRoleSafe(member, roleId) {
  try {
    const role = member.guild.roles.cache.get(roleId) || await member.guild.roles.fetch(roleId);
    if (!role) throw new Error('role não encontrada');
    if (!role.editable) throw new Error('role acima do cargo do bot');
    await member.roles.add(role);
    return true;
  } catch (e) {
    console.warn('[role] falhou:', e?.message || e);
    return false;
  }
}

async function removeRoleSafe(member, roleId) {
  try {
    const role = member.guild.roles.cache.get(roleId) || await member.guild.roles.fetch(roleId);
    if (!role) return true; // já não tem/foi removida
    await member.roles.remove(role);
    return true;
  } catch (e) {
    console.warn('[role-remove] falhou:', e?.message || e);
    return false;
  }
}

function hasClearPermission(member) {
  if (!member) return false;
  if (ALLOWED_CLEAR_USERS.includes(member.id)) return true;
  return member.roles.cache.some(r => ALLOWED_CLEAR_ROLES.includes(r.id));
}

function saveBackup(data) {
  try {
    const dir = path.dirname(BACKUP_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(BACKUP_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Erro ao salvar backup:", e);
  }
}

function loadBackup() {
  try {
    if (!fs.existsSync(BACKUP_FILE)) return null;
    return JSON.parse(fs.readFileSync(BACKUP_FILE, "utf8"));
  } catch {
    return null;
  }
}

// Remove mensagens antigas do bot no canal que tenham o botão esperado
async function limparMensagensAntigas(client, canal) {
  try {
    const msgs = await canal.messages.fetch({ limit: 100 }).catch(() => null);
    if (!msgs?.size) return 0;

    const minhas = msgs.filter(m => m.author?.id === client.user.id);
    const paraApagar = [];

    for (const m of minhas.values()) {
      // se tiver componentes, tenta achar nosso botão pelo customId
      const temBotao = m.components?.some(row =>
        row?.components?.some?.(c => c.customId === BOTAO_CUSTOM_ID)
      );
      if (temBotao) paraApagar.push(m);
    }

    // apaga em série pra respeitar rate limit e não depender de bulkDelete (que tem limite de 14 dias)
    let count = 0;
    for (const msg of paraApagar) {
      try {
        await msg.delete().catch(() => null);
        count++;
      } catch {}
    }
    return count;
  } catch (e) {
    console.warn('Falha ao limpar mensagens antigas:', e?.message || e);
    return 0;
  }
}

// Cria a mensagem com botão do cadastro
async function postarMensagemCadastro(canal) {
  const embed = new EmbedBuilder()
    .setTitle('Setar Cargo - SantaCreators') // título atualizado
    .setDescription(
      [
        'Você atualmente está **Sem WL - Sem Cargo**.',
        'Para ter seu cargo, clique abaixo e preencha seu **nome** e **ID**.',
        '',
        'Assim que enviar:',
        '• Seu **nome** será atualizado;',
        '• O cargo **Cidadão** será adicionado.',
      ].join('\n')
    )
    .setColor('#ff009a');

  if (GIF_BANNER_SETARCARGO_CIDADAO) embed.setImage(GIF_BANNER_SETARCARGO_CIDADAO);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(BOTAO_CUSTOM_ID)
      .setLabel('Fazer Cadastro')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('📝'),
    new ButtonBuilder()
      .setCustomId(BOTAO_LIMPAR_ID)
      .setLabel('Limpar Registros (Admin)')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🧹')
  );

  const msg = await canal.send({ embeds: [embed], components: [row] });
  return msg;
}

// ====== EXPORTS (HOOKS) ======

export async function cadastroManualOnReady(client) {
  // console.log(`🤖 Bot iniciado como ${client.user.tag}`);

  try {
    const canal = await client.channels.fetch(CHANNEL_ID).catch(() => null);
    if (!canal?.isTextBased()) {
      console.warn('Canal inválido ou não-textual. Confira CHANNEL_ID.');
      return;
    }

    // 1) Apagar mensagens antigas com o botão
    const removidas = await limparMensagensAntigas(client, canal);
    // if (removidas > 0) console.log(`🧹 Mensagens antigas removidas: ${removidas}`);

    // 2) Postar NOVA mensagem com botão
    await postarMensagemCadastro(canal);
    // console.log('✅ Nova mensagem de cadastro criada.');

  } catch (e) {
    console.error('Falha ao preparar o menu de cadastro:', e);
  }
}

export async function cadastroManualHandleInteraction(interaction, client) {
  // BOTÃO → ABRE MODAL (NÃO REMOVE NENHUM CARGO AQUI)
  if (interaction.isButton() && interaction.customId === BOTAO_CUSTOM_ID) {
    try {
      if (interaction.replied || interaction.deferred) return true;

      const modal = new ModalBuilder()
        .setCustomId('formulario_nomeid')
        .setTitle('Setar Cargo'); // título do modal pode acompanhar o fluxo

      const nomeInput = new TextInputBuilder()
        .setCustomId('nome')
        .setLabel('Digite seu nome (ex: Macedo)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(25);

      const idInput = new TextInputBuilder()
        .setCustomId('idrp')
        .setLabel('Digite seu ID (ex: 445)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(10);

      modal.addComponents(
        new ActionRowBuilder().addComponents(nomeInput),
        new ActionRowBuilder().addComponents(idInput),
      );

      await interaction.showModal(modal);
    } catch (e) {
      console.warn('❌ Erro ao mostrar modal:', e?.message || e);
    }
    return true;
  }

  // BOTÃO → LIMPAR REGISTROS (ADMIN)
  if (interaction.isButton() && interaction.customId === BOTAO_LIMPAR_ID) {
    if (!hasClearPermission(interaction.member)) {
      return interaction.reply({ content: '🚫 Você não tem permissão para usar este botão.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const channel = interaction.channel;
    // Pega todas as permissões do canal
    const overwrites = channel.permissionOverwrites.cache;
    
    // Filtra apenas as permissões de MEMBROS (OverwriteType.Member = 1)
    // Isso remove as permissões específicas que escondem o canal (ViewChannel: false)
    const memberOverwrites = overwrites.filter(ow => ow.type === OverwriteType.Member);
    
    if (memberOverwrites.size === 0) {
      return interaction.editReply({ content: '⚠️ Nenhuma permissão de usuário encontrada para limpar.' });
    }

    const backupData = [];
    const removedNames = [];

    // Itera e remove
    for (const [id, ow] of memberOverwrites) {
      backupData.push({
        id: id,
        allow: ow.allow.bitfield.toString(),
        deny: ow.deny.bitfield.toString(),
        type: ow.type
      });
      
      const m = interaction.guild.members.cache.get(id);
      removedNames.push(m ? `${m.user.tag} (${m.displayName})` : id);
      
      await ow.delete().catch(() => {});
    }

    // Salva backup para reversão
    saveBackup({
      channelId: channel.id,
      timestamp: Date.now(),
      executorId: interaction.user.id,
      overwrites: backupData
    });

    // Envia Log
    const logChannel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    if (logChannel) {
      const logEmbed = new EmbedBuilder()
        .setTitle('🧹 Limpeza de Registros (Cadastro)')
        .setColor('#ff0000')
        .setThumbnail(interaction.user.displayAvatarURL())
        .setDescription(`**Executor:** ${interaction.user}\n**Canal:** ${channel}\n**Quantidade:** ${memberOverwrites.size} usuários resetados`)
        .addFields(
          { name: '🕒 Data', value: `<t:${Math.floor(Date.now()/1000)}:F> (<t:${Math.floor(Date.now()/1000)}:R>)`, inline: false },
          { name: '👥 Usuários Afetados', value: `\`\`\`\n${removedNames.slice(0, 30).join('\n')}${removedNames.length > 30 ? `\n...e mais ${removedNames.length - 30}` : ''}\n\`\`\`` }
        )
        .setFooter({ text: 'Use o botão abaixo para reverter se necessário.' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(BOTAO_RESTAURAR_ID)
          .setLabel('↩️ Desfazer (Restaurar Permissões)')
          .setStyle(ButtonStyle.Success)
      );

      await logChannel.send({ embeds: [logEmbed], components: [row] });
    }

    await interaction.editReply({ content: `✅ Limpeza concluída! ${memberOverwrites.size} usuários agora podem ver o canal novamente. Log enviado.` });
    return true;
  }

  // BOTÃO → RESTAURAR BACKUP (ADMIN - NO LOG)
  if (interaction.isButton() && interaction.customId === BOTAO_RESTAURAR_ID) {
    if (!hasClearPermission(interaction.member)) {
      return interaction.reply({ content: '🚫 Você não tem permissão.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const backup = loadBackup();
    if (!backup || !backup.overwrites || backup.overwrites.length === 0) {
      return interaction.editReply({ content: '⚠️ Nenhum backup válido encontrado.' });
    }

    const channel = await client.channels.fetch(backup.channelId).catch(() => null);
    if (!channel) {
      return interaction.editReply({ content: '❌ Canal original não encontrado.' });
    }

    let restoredCount = 0;
    for (const ow of backup.overwrites) {
      try {
        // Restaura a permissão de esconder o canal (ViewChannel: false)
        await channel.permissionOverwrites.edit(ow.id, { ViewChannel: false });
        restoredCount++;
      } catch (e) {
        console.error(`Erro ao restaurar ${ow.id}:`, e);
      }
    }

    await interaction.editReply({ content: `✅ Restauração concluída! ${restoredCount} permissões reaplicadas.` });
    
    // Atualiza o embed do log para mostrar que foi revertido
    try {
      const embed = EmbedBuilder.from(interaction.message.embeds[0]);
      embed.setColor('#00ff00');
      embed.addFields({ name: '🔄 Status', value: `Restaurado por ${interaction.user} em <t:${Math.floor(Date.now()/1000)}:R>` });
      await interaction.message.edit({ embeds: [embed], components: [] });
    } catch {}

    return true;
  }

  // SUBMIT DO MODAL → aplica nick + cargo Cidadão + remove cargo temporário
  if (interaction.isModalSubmit() && interaction.customId === 'formulario_nomeid') {
    const nome = interaction.fields.getTextInputValue('nome')?.trim();
    const id = interaction.fields.getTextInputValue('idrp')?.trim();

    // Responde de forma efêmera e nos dá tempo
    try { await interaction.deferReply({ ephemeral: true }); } catch {}

    const guild = interaction.guild;
    let member = interaction.member;
    try { member = await guild.members.fetch(interaction.user.id); } catch {}

    const mensagens = [];
    let ok = false;

    // 1) Setar nickname
    const novoNick = sanitizeNick(nome, id);
    const nickOk = await setNickSafe(member, novoNick);
    if (nickOk) {
      mensagens.push(`✅ Nome atualizado para \`${novoNick}\`.`);
      ok = true;
    } else {
      mensagens.push('⚠️ Não consegui alterar seu nome (permissão/hierarquia).');
    }

    // 2) Adicionar cargo Cidadão
    const roleOk = await addRoleSafe(member, CARGO_CIDADAO);
    if (roleOk) {
      mensagens.push('✅ Cargo **Cidadão** adicionado.');
      ok = true;
    } else {
      mensagens.push('⚠️ Não consegui adicionar o cargo **Cidadão** (hierarquia/permissão).');
    }

    // 3) REMOVER cargo temporário DEPOIS que enviou o modal
    const tempRemovido = await removeRoleSafe(member, CARGO_TEMP_REMOVER);
    if (tempRemovido) {
      mensagens.push('🧹 Cargo temporário removido.');
    } else {
      mensagens.push('ℹ️ Não consegui remover o cargo temporário (ou ele já não estava aplicado).');
    }

    // 4) DM (não bloqueia sucesso)
    try {
      await member.send(
        `👋 Olá, ${nome}! Bem-vindo(a) à **${guild.name}**.\n` +
        `Seu cadastro foi processado.\n` +
        `Nick: \`${novoNick}\`\n` +
        `Cargo: **Cidadão** ${member.roles.cache.has(CARGO_CIDADAO) ? '✅' : '⚠️ (não aplicado)'}`
      );
    } catch {
      mensagens.push('ℹ️ Não consegui te enviar DM (provavelmente fechado).');
    }

    // 5) (Opcional) esconder o canal de cadastro pra quem concluiu
    try {
      if (interaction.channel?.isTextBased()) {
        await interaction.channel.permissionOverwrites.edit(member.id, { ViewChannel: false });
      }
    } catch {}

    // 6) Resposta final
    try {
      await interaction.editReply({
        content: ok
          ? `✅ Cadastro processado!\n${mensagens.join('\n')}\n\nSe algo não aplicou, fala com um admin pra ajustar as permissões/hierarquia do bot.`
          : '❌ Não consegui concluir (nick e cargo falharam). Chama um admin pra revisar permissões/hierarquia do bot.',
      });
    } catch (e) {
      console.warn('Falha ao responder o modal:', e?.message || e);
    }
    return true;
  }

  return false;
}
