// /application/events/vipRegistro.js
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  Events,
  TimestampStyles,
  time,
} from "discord.js";

// Guard to prevent multiple initializations
if (globalThis.__VIP_REGISTRO_LOADED__) {
  // This module is already loaded, do nothing.
}
globalThis.__VIP_REGISTRO_LOADED__ = true;

// ====== CONFIG ======
const VIP_CANAL_ID = '1411814379162308688';

// MENU (agora tem 4 botões - adicionado "Motivo")
const VIP_MENU_OPEN_ID = 'vip_registrar_btn';
const VIP_MENU_FILTER_SOLICITADOS_ID = 'vip_filter_solicitados';
const VIP_MENU_FILTER_NAOCLICADOS_ID = 'vip_filter_naoclicados';

// ✅ NOVO: "ABA"/BOTÃO PRA MOSTRAR O MOTIVO DO MENU/REGISTRO
const VIP_MENU_MOTIVO_ID = 'vip_menu_motivo_info';

// ✅ NOVO: TEXTO DO MOTIVO (edita como quiser)
const VIP_MENU_MOTIVO_TEXTO = [
  '📌 **Motivo deste menu/registro**',
  '',
  'Este painel existe para **centralizar** os registros de VIP/Rolepass,',
  '**organizar a fila**, e deixar tudo **auditável** (quem registrou, quando, tipo e status).',
  '',
  '✅ Ajuda a evitar perda de pedidos',
  '✅ Facilita cobrança/checagem',
  '✅ Mantém histórico do que foi solicitado, entregue ou reprovado',
  '',
  'Se quiser, eu também posso deixar esse motivo como um **embed fixo** no canal.',
].join('\n');

const VIP_GIF =
  'https://media.discordapp.net/attachments/1362477839944777889/1384245215249825832/standard_2rss.gif?ex=68b5ec51&is=68b49ad1&hm=f194706bc612abcd8cbbbf6d62d2c393d49339bfea8714ceab371a0a4c95a670&=';

// canal onde cai a reprovação
const VIP_REPROVA_CANAL_ID = '1411819432862285854';

// Quem PODE registrar (abrir modal) OU operar nos botões dos registros:
const VIP_AUTH = new Set([
  '1262262852949905408', // owner
  '1352408327983861844', // resp creator
  '1262262852949905409', // resp influ
  '1352407252216184833', // resp lider
  '660311795327828008'   // eu
]);

let ultimaMsgBotao = null;

// ====== HELPERS ======
function ensureIsTextChannel(ch) {
  return ch && ch.type === ChannelType.GuildText;
}

function isDiscordId(text) {
  return /^\d{17,20}$/.test((text || '').trim());
}

// tenta extrair um ID caso venha como <@123> ou <@!123>
function extractId(text) {
  const t = (text || '').trim();
  if (isDiscordId(t)) return t;
  const m = t.match(/^<@!?(\d{17,20})>$/);
  if (m?.[1]) return m[1];
  return null;
}

function vipNormalizeFree(t) {
  const s = (t || '').toString().trim().toLowerCase();
  if (/(ouro)/.test(s)) return 'OURO';
  if (/(prata)/.test(s)) return 'PRATA';
  if (/(bronze)/.test(s)) return 'BRONZE';
  if (/(rolepass|role pass|pass)/.test(s)) return 'ROLEPASS';
  return null;
}

const vipDecor = {
  OURO:     { label: 'VIP OURO',    emoji: '🥇', color: '#f1c40f' },
  PRATA:    { label: 'VIP PRATA',   emoji: '🥈', color: '#bdc3c7' },
  BRONZE:   { label: 'VIP BRONZE',  emoji: '🥉', color: '#cd7f32' },
  ROLEPASS: { label: 'ROLEPASS',    emoji: '🎟️', color: '#9b59b6' },
  CUSTOM:   { label: 'PERSONALIZADO', emoji: '💎', color: '#8e44ad' },
};

// ====== MENU UI ======
function buildMenuEmbed(guild) {
  return new EmbedBuilder()
    .setColor('#8e44ad')
    .setTitle('💜 Registro Mensal + Destaque')
    .setDescription(
      [
        'Use os botões abaixo pra **registrar** ou **organizar** a fila.',
        '',
        '📝 **O que você vai informar:**',
        '• Nome do membro da equipe',
        '• Beneficiário (**ID, @menção ou texto livre**)',
        '• Tipo (**texto livre**)',
        '• ✅ **Motivo do registro** (fica aparente no embed)',
        '',
        '🔎 **Filtros:**',
        '• **Solicitados** = já marcaram solicitação, mas ainda não recebeu e não foi reprovado',
        '• **Não clicados** = ninguém clicou em solicitado, não recebeu e não foi reprovado',
        '',
        'ℹ️ Use **📌 Motivo** pra ver o objetivo do menu/registro.'
      ].join('\n')
    )
    .setImage(VIP_GIF)
    .setFooter({ text: 'SantaCreators – Sistema Oficial de Premium' });
}

function buildMenuComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(VIP_MENU_OPEN_ID)
        .setLabel('💎 Registrar VIP / Rolepass')
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId(VIP_MENU_FILTER_SOLICITADOS_ID)
        .setLabel('📨 Solicitados')
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId(VIP_MENU_FILTER_NAOCLICADOS_ID)
        .setLabel('🕗 Não clicados')
        .setStyle(ButtonStyle.Secondary),

      // ✅ NOVO BOTÃO (ABA)
      new ButtonBuilder()
        .setCustomId(VIP_MENU_MOTIVO_ID)
        .setLabel('📌 Motivo')
        .setStyle(ButtonStyle.Secondary),
    )
  ];
}

// ====== DETECTAR STATUS DO REGISTRO (pelo embed) ======
function getEmbedFields(rawEmbed) {
  return rawEmbed?.fields || rawEmbed?.data?.fields || [];
}

function fieldValueStartsWith(fields, starts) {
  const f = fields.find(x => ((x.name || '').startsWith(starts)));
  return f?.value ?? null;
}

function isSolicitado(rawEmbed) {
  const fields = getEmbedFields(rawEmbed);
  const v = fieldValueStartsWith(fields, '📨 Solicitação');
  return !!v;
}

function isRecebeu(rawEmbed) {
  const fields = getEmbedFields(rawEmbed);
  const v = fieldValueStartsWith(fields, '✅ Entrega');
  return !!v;
}

function isReprovado(rawEmbed) {
  const fields = getEmbedFields(rawEmbed);
  const v = fieldValueStartsWith(fields, '❌ Reprovado');
  return !!v;
}

function getRegistradoPorId(rawEmbed) {
  const fields = getEmbedFields(rawEmbed);
  const v = fieldValueStartsWith(fields, '✍️ Registrado por');
  if (!v) return null;
  const m = v.match(/<@!?(\d{17,20})>/);
  return m?.[1] || null;
}

function getBeneficiarioId(rawEmbed) {
    const fields = getEmbedFields(rawEmbed);
    const v = fieldValueStartsWith(fields, '👤 Beneficiário');
    if (!v) return null;
    const m = v.match(/<@!?(\d{17,20})>/);
    return m?.[1] || null;
}

// Só considera registro “válido” se tiver nossos botões (pra não puxar msg antiga)
function messageHasVipButtons(msg) {
  const rows = msg.components || [];
  for (const row of rows) {
    const comps = row?.components || [];
    for (const c of comps) {
      const id = c.customId || '';
      if (id.startsWith('vip_solicitado_') || id.startsWith('vip_recebeu_') || id.startsWith('vip_negar_')) return true;
    }
  }
  return false;
}

// ====== BOTÃO PRINCIPAL (garantia/refresh) ======
async function ensureMenu(channel) {
  const msgs = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  if (!msgs) return null;

  const minhasComMenu = msgs.filter(
    (m) =>
      m.author?.id === channel.client.user.id &&
      m.components?.[0]?.components?.some((c) => c.customId === VIP_MENU_OPEN_ID)
  );

  if (minhasComMenu.size > 0) {
    const ordered = [...minhasComMenu.values()].sort((a, b) => b.createdTimestamp - a.createdTimestamp);
    const keep = ordered[0];
    ultimaMsgBotao = keep.id;

    for (let i = 1; i < ordered.length; i++) ordered[i].delete().catch(() => {});
    return keep;
  }

  const embed = buildMenuEmbed(channel.guild);
  const sent = await channel.send({ embeds: [embed], components: buildMenuComponents() }).catch(() => null);
  if (sent) ultimaMsgBotao = sent.id;
  return sent;
}

async function createFreshMenu(channel) {
  const msgs = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  if (msgs) {
    const minhas = msgs.filter(
      (m) =>
        m.author?.id === channel.client.user.id &&
        m.components?.[0]?.components?.some((c) => c.customId === VIP_MENU_OPEN_ID)
    );
    for (const m of minhas.values()) await m.delete().catch(() => {});
  }

  const embed = buildMenuEmbed(channel.guild);
  const sent = await channel.send({ embeds: [embed], components: buildMenuComponents() }).catch(() => null);
  if (sent) ultimaMsgBotao = sent.id;
  return sent;
}

// ====== MOVER REGISTROS POR FILTRO (manda pra baixo) ======
// filtro: 'solicitados' | 'naoclicados'
async function moverRegistrosPorFiltro(channel, filtro) {
  const msgs = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  if (!msgs) return { movidos: 0 };

  const registros = [...msgs.values()]
    .filter(m => m.author?.id === channel.client.user.id)
    .filter(m => m.embeds?.length > 0)
    .filter(m => (m.embeds?.[0]?.title || '').includes('— 1 mês + Destaque'))
    .filter(m => messageHasVipButtons(m));

  let movidos = 0;

  for (const msg of registros) {
    const raw = msg.embeds?.[0];
    if (!raw) continue;

    const ehSolic = isSolicitado(raw);
    const ehReceb = isRecebeu(raw);
    const ehRepr = isReprovado(raw);

    const entra =
      (filtro === 'solicitados' && ehSolic && !ehReceb && !ehRepr) ||
      (filtro === 'naoclicados' && !ehSolic && !ehReceb && !ehRepr);

    if (!entra) continue;

    // reenvia o embed igual (manda pra baixo)
    const emb = EmbedBuilder.from(raw);
    const nova = await channel.send({ embeds: [emb] });

    const targetId = getBeneficiarioId(raw) || 'none';

    const btnSolic = new ButtonBuilder()
      .setCustomId(`vip_solicitado_${nova.id}`)
      .setLabel('📨 Já foi solicitado')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(ehReceb || ehRepr);

    const btnRecebeu = new ButtonBuilder()
      .setCustomId(`vip_recebeu_${nova.id}_${targetId}`)
      .setLabel('✅ Já recebeu')
      .setStyle(ButtonStyle.Success)
      .setDisabled(ehReceb || ehRepr);

    const btnNegar = new ButtonBuilder()
      .setCustomId(`vip_negar_${nova.id}_${targetId}`)
      .setLabel('❌ Negar')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(ehReceb || ehRepr);

    await nova.edit({ components: [new ActionRowBuilder().addComponents(btnSolic, btnRecebeu, btnNegar)] }).catch(() => {});
    await msg.delete().catch(() => {});
    movidos++;
  }

  return { movidos };
}

// ====== READY: refresh + watchdog ======
export async function vipRegistroOnReady(client) {
  if (globalThis.__VIP_REGISTRO_ON_READY_RAN__) return;
  globalThis.__VIP_REGISTRO_ON_READY_RAN__ = true;

  const canal = await client.channels.fetch(VIP_CANAL_ID).catch(() => null);
  if (!ensureIsTextChannel(canal)) {
    console.error('[VIP] Canal inválido:', VIP_CANAL_ID);
    return;
  }

  await createFreshMenu(canal);
  setInterval(() => ensureMenu(canal), 10_000);
}

// ====== INTERAÇÕES ======
export async function vipRegistroHandleInteraction(interaction, client) {
  try {
    // ✅ NOVO: "ABA" DO MOTIVO DO MENU/REGISTRO
    if (interaction.isButton() && interaction.customId === VIP_MENU_MOTIVO_ID) {
      const emb = new EmbedBuilder()
        .setColor('#8e44ad')
        .setTitle('📌 Motivo do Menu/Registro')
        .setDescription(VIP_MENU_MOTIVO_TEXTO)
        .setFooter({ text: 'SantaCreators – Premium' });

      await interaction.reply({ embeds: [emb], ephemeral: true });
      return true;
    }

    // ---------- MENU: FILTROS ----------
    if (interaction.isButton() && (interaction.customId === VIP_MENU_FILTER_SOLICITADOS_ID || interaction.customId === VIP_MENU_FILTER_NAOCLICADOS_ID)) {
      const member = interaction.member;
      const isAuth =
        VIP_AUTH.has(member?.id) ||
        member?.roles?.cache?.some((r) => VIP_AUTH.has(r.id));

      if (!isAuth) {
        await interaction.reply({ content: '🚫 Você não tem permissão para usar esse filtro.', ephemeral: true });
        return true;
      }

      await interaction.deferReply({ ephemeral: true }).catch(() => {});
      const canal = await client.channels.fetch(VIP_CANAL_ID).catch(() => null);
      if (!ensureIsTextChannel(canal)) {
        await interaction.editReply({ content: '❌ Canal inválido.' }).catch(() => {});
        return true;
      }

      const qual = interaction.customId === VIP_MENU_FILTER_SOLICITADOS_ID ? 'solicitados' : 'naoclicados';
      const { movidos } = await moverRegistrosPorFiltro(canal, qual);

      await createFreshMenu(canal);

      await interaction.editReply({
        content: `✅ Filtro aplicado: **${qual}**\n📦 Registros movidos: **${movidos}**`,
      }).catch(() => {});
      return true;
    }

    // ✅ NOVO: Handler para o menu de seleção de cidade
    if (interaction.isStringSelectMenu() && interaction.customId === VIP_SEL_CITY_ID) {
        const member = interaction.member;
        const isAuth =
            VIP_AUTH.has(member?.id) ||
            member?.roles?.cache?.some((r) => VIP_AUTH.has(r.id));

        if (!isAuth) {
            await interaction.reply({ content: '🚫 Você não tem permissão para registrar.', ephemeral: true });
            return true;
        }

        const cityKey = interaction.values[0];

        const modal = new ModalBuilder()
            .setCustomId(`${VIP_MODAL_ID}:${cityKey}`)
            .setTitle('💎 Registrar Premium');

        const inputNome = new TextInputBuilder().setCustomId('vip_nome_membro').setLabel('Nome do membro da equipe').setStyle(TextInputStyle.Short).setPlaceholder('Ex: Social M. | Maria').setRequired(true);
        const inputBenef = new TextInputBuilder().setCustomId('vip_beneficiario').setLabel('Beneficiário (ID/@/texto)').setStyle(TextInputStyle.Short).setPlaceholder('Ex: 123... OU <@123...> OU @fulano OU qualquer texto').setRequired(true);
        const inputVip = new TextInputBuilder().setCustomId('vip_tipo').setLabel('Tipo (livre)').setStyle(TextInputStyle.Short).setPlaceholder('Ex: Ouro / Prata / Rolepass / Premiação 2025 / #ABC123 / etc').setRequired(true);
        const inputMotivoRegistro = new TextInputBuilder().setCustomId('vip_motivo_registro').setLabel('Motivo do registro').setStyle(TextInputStyle.Paragraph).setPlaceholder('Ex: Destaque, + Doação no Mês, Pagamento Mensal.. etc...').setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(inputNome),
            new ActionRowBuilder().addComponents(inputBenef),
            new ActionRowBuilder().addComponents(inputVip),
            new ActionRowBuilder().addComponents(inputMotivoRegistro)
        );

        try {
            await interaction.showModal(modal);
        } catch (err) {
            console.error('[VIP] showModal (city select) falhou:', err);
            if (!interaction.deferred && !interaction.replied) {
                await interaction.reply({ content: '⚠️ Interação expirada. Clique no botão novamente.', ephemeral: true }).catch(() => {});
            }
        }
        return true;
    }

    // ---------- ABRIR MODAL (REGISTRAR) ----------
    if (interaction.isButton() && interaction.customId === VIP_MENU_OPEN_ID) {
      const member = interaction.member;
      const isAuth =
        VIP_AUTH.has(member?.id) ||
        member?.roles?.cache?.some((r) => VIP_AUTH.has(r.id));

      if (!isAuth) {
        await interaction.reply({
          content: '🚫 Você não tem permissão para registrar.',
          ephemeral: true,
        });
        return true;
      }

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(VIP_SEL_CITY_ID)
        .setPlaceholder('Selecione a cidade do evento')
        .addOptions(
            Object.entries(CITIES).map(([key, city]) =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(city.label)
                    .setValue(key)
                    .setEmoji(city.emoji)
            )
        );

      const row = new ActionRowBuilder().addComponents(selectMenu);

      await interaction.reply({
          content: '🌆 Para qual cidade é este registro de VIP?',
          components: [row],
          ephemeral: true,
      });
      return true;
    }

    // ---------- SUBMIT DO MODAL (REGISTRO) ----------
    if (interaction.isModalSubmit() && interaction.customId.startsWith(VIP_MODAL_ID)) {
      const nome = interaction.fields.getTextInputValue('vip_nome_membro')?.trim();
      const benefRaw = interaction.fields.getTextInputValue('vip_beneficiario')?.trim();
      const tipoRaw = interaction.fields.getTextInputValue('vip_tipo')?.trim();

      // ✅ NOVO: pega o motivo
      const motivoRegistro = interaction.fields.getTextInputValue('vip_motivo_registro')?.trim();

      // ✅ NOVO: Extrai a cityKey do customId
      const customIdParts = interaction.customId.split(':');
      const cityKey = customIdParts.length > 1 ? customIdParts[1] : null;

      if (!cityKey || !CITIES[cityKey]) {
          await interaction.reply({ content: "❌ Cidade inválida ou não selecionada. Por favor, comece o processo novamente.", ephemeral: true });
          return true;
      }

      const tipoNorm = vipNormalizeFree(tipoRaw);
      const decor = tipoNorm ? vipDecor[tipoNorm] : vipDecor.CUSTOM;

      const canal = await client.channels.fetch(VIP_CANAL_ID).catch(() => null);
      if (!ensureIsTextChannel(canal)) {
        await interaction.reply({
          content: '❌ Canal de registro inválido.',
          ephemeral: true,
        });
        return true;
      }

      const extractedId = extractId(benefRaw); // pode ser null
      const targetId = extractedId || 'none';
      const beneficiarioMention = extractedId ? `<@${extractedId}>` : benefRaw;

      let beneficiarioUser = null;
      if (extractedId) {
        try { beneficiarioUser = await client.users.fetch(extractedId); } catch {}
      }

      // ✅ NOVO: Pega o nome da cidade
      const cityName = CITIES[cityKey].label;

      const embed = new EmbedBuilder()
        .setColor(decor.color)
        .setTitle(`${decor.emoji} ${decor.label} — 1 mês + Destaque`)
        .setDescription(
          [
            'Registro de **premium** criado com sucesso.',
            'Inclui: **1 mês** + **Destaque**.',
          ].join('\n')
        )
        .addFields(
          {
            name: '👤 Beneficiário',
            value: extractedId
              ? `${beneficiarioMention}\n\`${extractedId}\``
              : `${beneficiarioMention}`,
            inline: true
          },
          { name: '🌆 Cidade', value: `**${cityName}**`, inline: true },
          },
          { name: '🏷️ Nome (Equipe)', value: nome || '-', inline: true },
          { name: '🧾 Tipo (livre)', value: `**${tipoRaw || '-'}**`, inline: true },

          // ✅ NOVO: motivo fica aparente
          { name: '📌 Motivo do registro', value: motivoRegistro || '-', inline: false },

          { name: '✍️ Registrado por', value: `<@${interaction.user.id}>`, inline: true },
          { name: '🕒 Data', value: `<t:${Math.floor(Date.now() / 1000)}:f>`, inline: true },
        )
        .setAuthor({
          name: `Registrado por ${interaction.user.tag}`,
          iconURL: interaction.user.displayAvatarURL({ dynamic: true })
        })
        .setThumbnail(
          beneficiarioUser?.displayAvatarURL?.({ dynamic: true, size: 256 }) ||
          interaction.user.displayAvatarURL({ dynamic: true })
        )
        .setImage(VIP_GIF)
        .setFooter({ text: 'SantaCreators – Premium' })
        .setTimestamp();
      
      // ✅ NOVO: Adiciona menção da cidade ao enviar a mensagem
      const cityRoleMention = CITIES[cityKey] ? `<@&${CITIES[cityKey].roleId}>` : '';
      const registroMsg = await canal.send({
        content: `Novo registro de VIP para a ${cityName}! ${cityRoleMention}`,
        embeds: [embed]
      });

      const btnSolic = new ButtonBuilder()
        .setCustomId(`vip_solicitado_${registroMsg.id}`)
        .setLabel('📨 Já foi solicitado')
        .setStyle(ButtonStyle.Secondary);

      const btnRecebeu = new ButtonBuilder()
        .setCustomId(`vip_recebeu_${registroMsg.id}_${targetId}`)
        .setLabel('✅ Já recebeu')
        .setStyle(ButtonStyle.Success);

      const btnNegar = new ButtonBuilder()
        .setCustomId(`vip_negar_${registroMsg.id}_${targetId}`)
        .setLabel('❌ Negar')
        .setStyle(ButtonStyle.Danger);

      await registroMsg.edit({ components: [new ActionRowBuilder().addComponents(btnSolic, btnRecebeu, btnNegar)] });

      await createFreshMenu(canal);

      await interaction.reply({
        content: `✅ Registro criado para **${benefRaw}** — tipo: **${tipoRaw}**.`,
        ephemeral: true,
      });
      return true;
    }

    // ---------- BOTÕES DOS REGISTROS ----------
    if (interaction.isButton() && interaction.customId.startsWith('vip_')) {
      const parts = interaction.customId.split('_');
      const action = parts[1];

      const isAuth =
        VIP_AUTH.has(interaction.member?.id) ||
        interaction.member?.roles?.cache?.some((r) => VIP_AUTH.has(r.id));

      const canal = await client.channels.fetch(VIP_CANAL_ID).catch(() => null);
      if (!ensureIsTextChannel(canal)) return true;

      // ====== SOLICITADO ======
      if (action === 'solicitado' && parts[2]) {
        const msgAlvo = await canal.messages.fetch(parts[2]).catch(() => null);
        if (!msgAlvo) {
          await interaction.reply({ content: '❌ Registro não encontrado.', ephemeral: true });
          return true;
        }
        if (!isAuth) {
          await interaction.reply({ content: '🚫 Sem permissão para marcar solicitação.', ephemeral: true });
          return true;
        }

        const emb = EmbedBuilder.from(msgAlvo.embeds[0] ?? new EmbedBuilder());
        emb.addFields({
          name: '📨 Solicitação',
          value: `Marcado por <@${interaction.user.id}> em <t:${Math.floor(Date.now()/1000)}:f>`,
          inline: false
        });
        await msgAlvo.edit({ embeds: [emb] });

        await interaction.reply({ content: '📨 Marcado como **solicitado**.', ephemeral: true });
        return true;
      }

      // ====== RECEBEU (APROVADO / ENTREGUE) ======
      if (action === 'recebeu' && parts[2] && parts[3]) {
        const msgId = parts[2];
        const targetId = parts[3]; // pode ser "none"

        const msgAlvo = await canal.messages.fetch(msgId).catch(() => null);
        if (!msgAlvo) {
          await interaction.reply({ content: '❌ Registro não encontrado.', ephemeral: true });
          return true;
        }

        const allowedByTarget = (targetId !== 'none') && (interaction.user.id === targetId);

        if (!isAuth && !allowedByTarget) {
          await interaction.reply({
            content: targetId === 'none'
              ? '🚫 Esse registro não tem ID de beneficiário. Só cargos autorizados podem marcar como **recebido**.'
              : '🚫 Somente o beneficiário ou cargos autorizados podem marcar como **recebido**.',
            ephemeral: true,
          });
          return true;
        }

        const emb = EmbedBuilder.from(msgAlvo.embeds[0] ?? new EmbedBuilder());
        emb.addFields({
          name: '✅ Entrega',
          value: `Confirmado por <@${interaction.user.id}> em <t:${Math.floor(Date.now()/1000)}:f>`,
          inline: false
        });

        const comps = (msgAlvo.components || []).map(row => {
          const r = ActionRowBuilder.from(row);
          r.components = r.components.map(c => ButtonBuilder.from(c).setDisabled(true));
          return r;
        });

        await msgAlvo.edit({ embeds: [emb], components: comps });

        // ✅ DM pro BENEFICIÁRIO quando marcar como RECEBEU
        if (targetId && targetId !== 'none' && isDiscordId(targetId)) {
          try {
            const user = await client.users.fetch(targetId);
            const dmEmbed = new EmbedBuilder()
              .setColor('#2ecc71')
              .setTitle('✅ Seu VIP/Rolepass foi entregue!')
              .setDescription(
                [
                  'Boa! O que foi solicitado **já caiu** ✅',
                  '',
                  `Abrir registro`,
                ].join('\n')
              )
              .setFooter({ text: 'SantaCreators – Premium' })
              .setTimestamp();

            await user.send({ embeds: [dmEmbed] }).catch(() => {});
          } catch {}
        }

        await interaction.reply({ content: '✅ Marcado como **recebido**.', ephemeral: true });
        return true;
      }

      // ====== NEGAR (abre modal) ======
      if (action === 'negar' && parts[2] && parts[3]) {
        const msgId = parts[2];
        const targetId = parts[3]; // pode ser "none"

        if (!isAuth) {
          await interaction.reply({
            content: '🚫 Apenas cargos autorizados podem **negar**.',
            ephemeral: true,
          });
          return true;
        }

        const modal = new ModalBuilder()
          .setCustomId(`vip_modal_negar_${msgId}_${targetId}`)
          .setTitle('❌ Negar / Reprovar pagamento');

        const inputMotivo = new TextInputBuilder()
          .setCustomId('vip_motivo_reprovacao')
          .setLabel('Motivo da reprovação')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Explique resumidamente o porquê da reprovação.')
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(inputMotivo));

        try {
          await interaction.showModal(modal);
        } catch (err) {
          console.error('[VIP] showModal negar falhou:', err);
          if (!interaction.deferred && !interaction.replied) {
            await interaction.reply({
              content: '⚠️ Interação expirada. Clique novamente em **Negar**.',
              ephemeral: true,
            }).catch(() => {});
          }
        }
        return true;
      }
    }

    // ---------- SUBMIT DO MODAL (NEGAR) ----------
    if (interaction.isModalSubmit() && interaction.customId.startsWith('vip_modal_negar_')) {
      const parts = interaction.customId.split('_'); // ['vip','modal','negar','<msgId>','<targetId>']
      const msgId = parts?.[3];
      const targetId = parts?.[4];

      const isAuth =
        VIP_AUTH.has(interaction.member?.id) ||
        interaction.member?.roles?.cache?.some((r) => VIP_AUTH.has(r.id));
      if (!isAuth) {
        await interaction.reply({
          content: '🚫 Apenas cargos autorizados podem **negar**.',
          ephemeral: true,
        });
        return true;
      }

      const motivo = interaction.fields.getTextInputValue('vip_motivo_reprovacao')?.trim();
      if (!motivo) {
        await interaction.reply({
          content: '❌ Motivo inválido.',
          ephemeral: true,
        });
        return true;
      }

      const canal = await client.channels.fetch(VIP_CANAL_ID).catch(() => null);
      if (!ensureIsTextChannel(canal)) {
        await interaction.reply({ content: '❌ Canal de registro inválido.', ephemeral: true });
        return true;
      }

      const msgAlvo = await canal.messages.fetch(msgId).catch(() => null);
      if (!msgAlvo) {
        await interaction.reply({ content: '❌ Registro não encontrado.', ephemeral: true });
        return true;
      }

      // pega registrante do embed pra marcar e DM
      const registranteId = getRegistradoPorId(msgAlvo.embeds?.[0]);

      const emb = EmbedBuilder.from(msgAlvo.embeds[0] ?? new EmbedBuilder());
      emb.addFields({
        name: '❌ Reprovado',
        value:
          `Por <@${interaction.user.id}> em <t:${Math.floor(Date.now()/1000)}:f>\n` +
          `**Motivo:** ${motivo}\n` +
          `${registranteId ? `**Registrado por:** <@${registranteId}>` : ''}`,
        inline: false
      });

      const comps = (msgAlvo.components || []).map(row => {
        const r = ActionRowBuilder.from(row);
        r.components = r.components.map(c => ButtonBuilder.from(c).setDisabled(true));
        return r;
      });

      await msgAlvo.edit({ embeds: [emb], components: comps }).catch(() => {});

      // ✅ DM ao BENEFICIÁRIO (se tiver ID válido)
      let dmOkBenef = false;
      if (targetId && targetId !== 'none' && isDiscordId(targetId)) {
        try {
          const user = await client.users.fetch(targetId);
          const dmEmbed = new EmbedBuilder()
            .setColor('#e74c3c')
            .setTitle('❌ Seu pagamento foi reprovado')
            .setDescription(
              [
                `**Motivo:** ${motivo}`,
                '',
                `Abrir registro`,
              ].join('\n')
            )
            .setAuthor({
              name: `Reprovado por ${interaction.user.tag}`,
              iconURL: interaction.user.displayAvatarURL({ dynamic: true })
            })
            .addFields({ name: '🕒 Hora', value: `<t:${Math.floor(Date.now()/1000)}:f>`, inline: true })
            .setFooter({ text: 'SantaCreators – Premium' })
            .setTimestamp();

          await user.send({ embeds: [dmEmbed] });
          dmOkBenef = true;
        } catch {
          dmOkBenef = false;
        }
      }

      // ✅ DM ao REGISTRANTE (pra ficar ciente que fez errado / foi reprovado)
      let dmOkReg = false;
      if (registranteId && isDiscordId(registranteId)) {
        try {
          const regUser = await client.users.fetch(registranteId);
          const dmEmbed = new EmbedBuilder()
            .setColor('#e74c3c')
            .setTitle('⛔ Um registro seu foi REPROVADO')
            .setDescription(
              [
                `**Motivo:** ${motivo}`,
                '',
                `**Reprovado por:** <@${interaction.user.id}>`,
                '',
                `Abrir registro`,
              ].join('\n')
            )
            .setFooter({ text: 'SantaCreators – Premium' })
            .setTimestamp();

          await regUser.send({ embeds: [dmEmbed] });
          dmOkReg = true;
        } catch {
          dmOkReg = false;
        }
      }

      // ✅ canal de reprovação com marcação do registrante também
      const reprovaCanal = await client.channels.fetch(VIP_REPROVA_CANAL_ID).catch(() => null);
      if (ensureIsTextChannel(reprovaCanal)) {
        const logEmbed = new EmbedBuilder()
          .setColor('#e74c3c')
          .setTitle('❌ Pagamento reprovado')
          .setDescription(
            [
              `**Beneficiário:** ${
                (targetId && targetId !== 'none') ? `<@${targetId}> \`(${targetId})\`` : '`(sem ID — texto livre)`'
              }`,
              `**Registrado por:** ${registranteId ? `<@${registranteId}> \`(${registranteId})\`` : '`(não identificado)`'}`,
              `**Motivo:** ${motivo}`,
              '',
              `🔗 Abrir registro`,
            ].join('\n')
          )
          .setAuthor({
            name: `${interaction.user.tag}`,
            iconURL: interaction.user.displayAvatarURL({ dynamic: true })
          })
          .addFields({ name: '🕒 Hora', value: `<t:${Math.floor(Date.now()/1000)}:f>`, inline: true })
          .setFooter({ text: 'SantaCreators – Premium' })
          .setTimestamp();

        await reprovaCanal.send({ embeds: [logEmbed] }).catch(() => {});
      }

      const extra =
        (targetId === 'none' || !isDiscordId(targetId))
          ? '\n⚠️ **Obs:** Sem ID válido do beneficiário, então não teve como mandar DM pra ele.'
          : (dmOkBenef ? '' : '\n⚠️ **Atenção:** Não foi possível enviar DM pro beneficiário (DM fechado ou erro).');

      const extra2 =
        registranteId
          ? (dmOkReg ? '' : '\n⚠️ **Atenção:** Não foi possível enviar DM pro registrante (DM fechado ou erro).')
          : '\n⚠️ **Obs:** Não consegui identificar o registrante no embed (campo “Registrado por”).';

      await interaction.reply({
        content: `❌ Registro **reprovado** e log enviado no canal <#${VIP_REPROVA_CANAL_ID}>.${extra}${extra2}`,
        ephemeral: true,
      });
      return true;
    }
    return false;
  } catch (e) {
    console.error('[VIP] Erro em interação:', e);
    if (!interaction.replied && !interaction.deferred) {
      interaction.reply({ content: '⚠️ Ocorreu um erro. Tente novamente.', ephemeral: true }).catch(() => {});
    }
    return true;
  }
}

// ====== COMMAND HANDLER ======
export async function vipRegistroHandleMessage(message, client) {
  if (!message.guild || message.author.bot) return false;

  if (message.content.toLowerCase() === "!vipmenu") {
    const member = message.member;
    const isAuth =
      VIP_AUTH.has(member?.id) ||
      member?.roles?.cache?.some((r) => VIP_AUTH.has(r.id));

    if (!isAuth) {
      const reply = await message.reply("🚫 Você não tem permissão para usar este comando.").catch(() => {});
      setTimeout(() => {
        message.delete().catch(() => {});
        if (reply) reply.delete().catch(() => {});
      }, 5000);
      return true;
    }

    await message.delete().catch(() => {});

    const canal = await client.channels.fetch(VIP_CANAL_ID).catch(() => null);
    if (!ensureIsTextChannel(canal)) {
      const reply = await message.channel.send("❌ Canal do sistema VIP não encontrado ou inválido.").catch(() => {});
      if (reply) setTimeout(() => reply.delete().catch(() => {}), 8000);
      return true;
    }

    await createFreshMenu(canal);
    const reply = await message.channel.send("✅ Menu do sistema VIP recriado com sucesso!").catch(() => {});
    if (reply) setTimeout(() => reply.delete().catch(() => {}), 8000);

    return true;
  }

  return false;
}