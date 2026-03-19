// /application/events/administração nobre/setStaff.js
import {
  ChannelType,
  Events,
  PermissionsBitField,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from "discord.js";

// ================= CONFIG =================
const SISTEMA_NOME = "💙 Set Staff";

// Canal do botão (painel)
const CANAL_PAINEL = "1452423414055829636";

// Canal onde os pedidos vão pra aprovação
const CANAL_APROVACAO = "1452771367626870834";

// Foto do painel (print)
const IMG_PAINEL =
  "https://media.discordapp.net/attachments/1362477839944777889/1453224283265302673/01.png?ex=69611b54&is=695fc9d4&hm=7cc9f1f261afeb47c7ed0a1e66f6db473ffee05a6052baa525095b9ca0af825d&=&format=webp&quality=lossless&width=1321&height=881";

// Guild que dá cargo automático ao entrar
const GUILD_AUTO_ROLE = "1452416085751234733";
const AUTO_ROLE_ID = "1452783590940213370";

// Cargos base de “pedido”
const CARGOS_PEDIDO = {
  responsaveis: "1452732902444892241",
  adm: "1452423391406456885",
  aux: "1452732732760133653",
};

// Cargos que o bot vai setar quando aprovar
const CARGOS_SET = {
  staff: "1452423389573546170",
  senior: "1452780631661477939",
  responsaveis: "1452732902444892241",
  adm: "1452423391406456885",
  auxiliar: "1452732732760133653",
};

// Quem aprova (por hierarquia)
const APROVACAO = {
  aceitaTodosRoles: [
    "1453216998023495771", // Diretor Comunidade (aceita todos)
    "1452423380413452289", // Diretor (aceita todos)
    "1452732902444892241", // Responsáveis (aceita todos)
  ],
  admAceitaApenasAuxRole: "1452423391406456885", // ADMs (aceita apenas AUX)
  usuariosAceitaTodos: [
    "660311795327828008", // você
  ],
};

const COR_AZUL = 0x5865f2;

// =========================================

// pedidos por guild + user (pra não misturar servidores)
const pedidos = new Map(); // key: `${guildId}:${userId}` => dados

function keyPedido(guildId, userId) {
  return `${guildId}:${userId}`;
}

function isGuildText(channel) {
  return channel && channel.type === ChannelType.GuildText;
}

function podeAprovar(interaction, pedido) {
  // segurança: tem que ser no mesmo servidor do pedido
  if (!interaction.inGuild() || interaction.guildId !== pedido.guildId) return false;

  const member = interaction.member;

  // admin do servidor
  if (interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) return true;

  // usuário específico (aceita todos)
  if (APROVACAO.usuariosAceitaTodos.includes(interaction.user.id)) return true;

  // roles que aceitam todos
  const temRoleAceitaTodos = member?.roles?.cache?.some((r) => APROVACAO.aceitaTodosRoles.includes(r.id));
  if (temRoleAceitaTodos) return true;

  // ADMs aceitam apenas AUX
  const temAdm = member?.roles?.cache?.has(APROVACAO.admAceitaApenasAuxRole);
  if (temAdm && pedido.cargoSolicitado === "aux") return true;

  return false;
}

function textoHierarquiaPublica() {
  return [
    "**Quem pode aprovar (hierarquia):**",
    "• **Diretor Comunidade** → aprova tudo",
    "• **Diretor** → aprova tudo",
    "• **Responsáveis** → aprova tudo",
    "• **ADMs** → aprovam apenas **AUX**",
  ].join("\n");
}

function buildPainelEmbed(guild) {
  return new EmbedBuilder()
    .setColor(COR_AZUL)
    .setAuthor({ name: "ADMINISTRAÇÃO", iconURL: guild.iconURL({ size: 256 }) ?? undefined })
    .setTitle("💙 Set Staff")
    .setDescription(
      [
        "Clique abaixo para solicitar:",
        "",
        textoHierarquiaPublica(),
      ].join("\n")
    )
    .setImage(IMG_PAINEL)
    .setFooter({ text: "Não compartilhe senha ou informações confidenciais." });
}

function buildPainelRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("setstaff_iniciar")
      .setLabel("💙 Solicitar Set Staff")
      .setStyle(ButtonStyle.Primary)
  );
}

function buildEscolhaCargoRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("cargo_responsaveis")
      .setLabel("RESPONSÁVEIS")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("cargo_adm")
      .setLabel("ADM")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("cargo_aux")
      .setLabel("AUX")
      .setStyle(ButtonStyle.Primary)
  );
}

function buildModalParaCargo(cargo) {
  // Campos:
  // RESPONSÁVEIS: nome, id, cargo atual na staff
  // ADM/AUX: nome, id, pasta atual na cidade
  const modal = new ModalBuilder()
    .setCustomId(`modal_setstaff_${cargo}`)
    .setTitle(SISTEMA_NOME);

  const nome = new TextInputBuilder()
    .setCustomId("nome")
    .setLabel("Nome")
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const id = new TextInputBuilder()
    .setCustomId("id")
    .setLabel("ID")
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  let extra;
  if (cargo === "responsaveis") {
    extra = new TextInputBuilder()
      .setCustomId("extra")
      .setLabel("Cargo atual na staff")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);
  } else {
    extra = new TextInputBuilder()
      .setCustomId("extra")
      .setLabel("Pasta atual na cidade")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);
  }

  modal.addComponents(
    new ActionRowBuilder().addComponents(nome),
    new ActionRowBuilder().addComponents(id),
    new ActionRowBuilder().addComponents(extra)
  );

  return modal;
}

function buildPedidoEmbed(pedido, requesterUser) {
  const cargoLabel =
    pedido.cargoSolicitado === "responsaveis" ? "RESPONSÁVEIS" :
    pedido.cargoSolicitado === "adm" ? "ADM" :
    "AUX";

  const extraLabel =
    pedido.cargoSolicitado === "responsaveis"
      ? "🧾 Cargo atual na staff"
      : "📁 Pasta atual na cidade";

  return new EmbedBuilder()
    .setColor(COR_AZUL)
    .setTitle(`${SISTEMA_NOME} | Novo Pedido`)
    .setThumbnail(requesterUser.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: "👤 Nome", value: pedido.nome, inline: true },
      { name: "🆔 ID", value: pedido.id, inline: true },
      { name: "🎭 Cargo solicitado", value: cargoLabel, inline: true },
      { name: extraLabel, value: pedido.extra || "—" },
      { name: "🕒 Data", value: pedido.data }
    )
    .setFooter({ text: `Solicitante: ${requesterUser.tag} | Discord ID: ${pedido.userId}` });
}

function buildAprovacaoRow(guildId, userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`aprovar:${guildId}:${userId}`)
      .setLabel("✅ Aprovar")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`reprovar:${guildId}:${userId}`)
      .setLabel("❌ Reprovar")
      .setStyle(ButtonStyle.Danger)
  );
}

function buildFinalizadoRow(aprovado) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("finalizado")
      .setLabel(aprovado ? "✅ Aprovado" : "❌ Reprovado")
      .setStyle(aprovado ? ButtonStyle.Success : ButtonStyle.Danger)
      .setDisabled(true)
  );
}

async function aplicarCargosENick(member, pedido) {
  // Limpa base roles (não mexe em outros cargos)
  const limpar = [CARGOS_SET.responsaveis, CARGOS_SET.adm, CARGOS_SET.auxiliar];
  await member.roles.remove(limpar).catch(() => {});

  // Sempre dá Staff + Senior
  const dar = [CARGOS_SET.staff, CARGOS_SET.senior];

  if (pedido.cargoSolicitado === "responsaveis") {
    dar.push(CARGOS_SET.responsaveis);
  } else if (pedido.cargoSolicitado === "adm") {
    dar.push(CARGOS_SET.adm);
  } else if (pedido.cargoSolicitado === "aux") {
    dar.push(CARGOS_SET.auxiliar);
  }

  await member.roles.add(dar).catch(() => {});

  // Nickname
  let nick;
  if (pedido.cargoSolicitado === "adm") {
    nick = `ADM | ${pedido.nome}`;
  } else if (pedido.cargoSolicitado === "aux") {
    nick = `Auxiliar | ${pedido.nome} | ${pedido.id}`;
  } else {
    nick = `${pedido.nome}`;
  }

  await member.setNickname(nick).catch(() => {});
}

async function garantirPainelNoGuild(client, guild) {
  const canal = await client.channels.fetch(CANAL_PAINEL).catch(() => null);
  if (!canal || !isGuildText(canal)) return;
  if (canal.guildId !== guild.id) return;

  const mensagens = await canal.messages.fetch({ limit: 30 }).catch(() => null);
  if (!mensagens) return;

  const antigas = mensagens.filter(
    (m) =>
      m.author?.id === client.user.id &&
      (m.embeds?.[0]?.title?.includes("Set Staff") || m.content?.includes(SISTEMA_NOME))
  );

  const embed = buildPainelEmbed(guild);
  const row = buildPainelRow();

  if (antigas.size > 0) {
    const principal = antigas.first();
    await principal.edit({ embeds: [embed], components: [row], content: "" }).catch(() => {});
    for (const msg of antigas.values()) {
      if (msg.id !== principal.id) await msg.delete().catch(() => {});
    }
  } else {
    await canal.send({ embeds: [embed], components: [row] }).catch(() => {});
  }
}

// =====================================================
// EXPORTS (pra plugar no teu roteador central)
// =====================================================

export async function setStaffOnReady(client) {
  // idempotência
  if (client.__SC_SETSTAFF_READY_DONE) return;
  client.__SC_SETSTAFF_READY_DONE = true;

  // garante painel só no(s) guild(s) onde o canal existir
  for (const guild of client.guilds.cache.values()) {
    await garantirPainelNoGuild(client, guild);
  }
}

export async function setStaffHandleGuildMemberAdd(member, client) {
  if (!member?.guild) return;
  if (member.guild.id !== GUILD_AUTO_ROLE) return;
  await member.roles.add(AUTO_ROLE_ID).catch(() => {});
}

export async function setStaffHandleInteraction(interaction, client) {
  try {
    // ===== botão do painel =====
    if (interaction.isButton() && interaction.customId === "setstaff_iniciar") {
      if (!interaction.inGuild()) {
        await interaction.reply({ content: "⚠️ Isso só funciona dentro do servidor.", ephemeral: true });
        return true;
      }

      const k = keyPedido(interaction.guildId, interaction.user.id);
      if (pedidos.has(k)) {
        await interaction.reply({ content: "⚠️ Você já tem um pedido em análise.", ephemeral: true });
        return true;
      }

      pedidos.set(k, {
        guildId: interaction.guildId,
        userId: interaction.user.id,
        etapa: "cargo",
      });

      await interaction.reply({
        content: "💙 **Escolha o cargo desejado:**",
        components: [buildEscolhaCargoRow()],
        ephemeral: true,
      });
      return true;
    }

    // ===== escolha de cargo =====
    if (interaction.isButton() && interaction.customId.startsWith("cargo_")) {
      if (!interaction.inGuild()) return false;

      const k = keyPedido(interaction.guildId, interaction.user.id);
      const pedido = pedidos.get(k);
      if (!pedido) {
        await interaction.reply({
          content: "⚠️ Seu pedido não foi encontrado. Tenta de novo no painel.",
          ephemeral: true,
        });
        return true;
      }

      const cargo = interaction.customId.replace("cargo_", ""); // responsaveis | adm | aux
      pedido.cargoSolicitado = cargo;
      pedido.etapa = "modal";

      const modal = buildModalParaCargo(cargo);
      await interaction.showModal(modal);
      return true;
    }

    // ===== modal submit =====
    if (interaction.isModalSubmit() && interaction.customId.startsWith("modal_setstaff_")) {
      if (!interaction.inGuild()) return false;

      const cargo = interaction.customId.replace("modal_setstaff_", "");
      const k = keyPedido(interaction.guildId, interaction.user.id);
      const pedido = pedidos.get(k);

      if (!pedido || pedido.cargoSolicitado !== cargo) {
        await interaction.reply({
          content: "⚠️ Seu pedido não foi encontrado ou expirou. Faz de novo no painel.",
          ephemeral: true,
        });
        return true;
      }

      const nome = interaction.fields.getTextInputValue("nome")?.trim();
      const id = interaction.fields.getTextInputValue("id")?.trim();
      const extra = interaction.fields.getTextInputValue("extra")?.trim();

      if (!nome || !id || !extra) {
        await interaction.reply({ content: "⚠️ Preenche tudo certinho.", ephemeral: true });
        return true;
      }

      pedido.nome = nome;
      pedido.id = id;
      pedido.extra = extra;
      pedido.data = new Date().toLocaleString("pt-BR");
      pedido.etapa = "enviado";

      const canal = await interaction.guild.channels.fetch(CANAL_APROVACAO).catch(() => null);
      if (!canal || !isGuildText(canal)) {
        pedidos.delete(k);
        await interaction.reply({
          content: `⚠️ Não achei o canal de aprovação (${CANAL_APROVACAO}) nesse servidor. Fala com a administração.`,
          ephemeral: true,
        });
        return true;
      }

      const embed = buildPedidoEmbed(pedido, interaction.user);
      const row = buildAprovacaoRow(interaction.guildId, interaction.user.id);

      await canal.send({ embeds: [embed], components: [row] });
      await interaction.reply({ content: "💙 Pedido enviado pra aprovação!", ephemeral: true });
      return true;
    }

    // ===== aprovar / reprovar =====
    if (
      interaction.isButton() &&
      (interaction.customId.startsWith("aprovar:") || interaction.customId.startsWith("reprovar:"))
    ) {
      if (!interaction.inGuild()) return false;

      const [acao, guildId, userId] = interaction.customId.split(":");
      const k = keyPedido(guildId, userId);
      const pedido = pedidos.get(k);

      if (!pedido) {
        await interaction.deferUpdate().catch(() => {});
        return true;
      }
      if (interaction.guildId !== guildId) {
        await interaction.deferUpdate().catch(() => {});
        return true;
      }

      if (!podeAprovar(interaction, pedido)) {
        await interaction.deferUpdate().catch(() => {});
        return true;
      }

      const aprovado = acao === "aprovar";
      const membro = await interaction.guild.members.fetch(userId).catch(() => null);

      if (membro && aprovado) {
        await aplicarCargosENick(membro, pedido);
      }

      // DM pro solicitante
      if (membro) {
        const dmEmbed = new EmbedBuilder()
          .setTitle(aprovado ? "💙 Set Staff Aprovado" : "❌ Set Staff Reprovado")
          .setColor(aprovado ? COR_AZUL : 0xff5555)
          .setDescription(
            aprovado
              ? `Seu pedido foi **aprovado** por **${interaction.user.username}** 💙`
              : `Seu pedido foi **reprovado** por **${interaction.user.username}**`
          );

        await membro.send({ embeds: [dmEmbed] }).catch(() => {});
      }

      pedidos.delete(k);

      // trava botões na msg
      await interaction.message.edit({ components: [buildFinalizadoRow(aprovado)] }).catch(() => {});
      await interaction.deferUpdate().catch(() => {});
      return true;
    }

    return false;
  } catch (err) {
    console.error("[SetStaff] erro:", err);
    if (interaction.isRepliable()) {
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp({ content: "⚠️ Deu erro aqui. Tenta de novo.", ephemeral: true });
        } else {
          await interaction.reply({ content: "⚠️ Deu erro aqui. Tenta de novo.", ephemeral: true });
        }
      } catch {}
    }
    return true; // tratou (mesmo com erro)
  }
}
