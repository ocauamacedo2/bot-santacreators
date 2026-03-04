// ./application/events/pagamentosocial.js
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { dashEmit } from "../utils/dashHub.js";

// ============================================================================
// PAGAMENTOS SOCIAL MÍDIAS (SEM LISTENERS AQUI)
// - Exporta: pagamentoSocialOnReady(client) e handlePagamentoSocial(interaction, client)
// ============================================================================

// =============================
// ✅ CONFIG (OBRIGATÓRIO)
// =============================
// Canal onde fica o menu + onde os registros são postados
const CANAL_PAGAMENTO = "1387922662134775818";

// Canal de logs (auditoria) do sistema de pagamentos
// ⚠️ Troca aqui pelo teu canal de logs real, se for outro.
const CANAL_LOG_PAGAMENTO = "1405634185841869022";

// Textos padrão (se teu arquivo já tem em outro lugar, pode remover daqui)
// Mantive pra evitar ReferenceError se não existir no teu arquivo.
const PADRAO_INDEFINIDO = "Não informado";

// Regex separadores de Nome/ID (se teu arquivo já tem, pode remover daqui)
// Mantive pra evitar ReferenceError se não existir no teu arquivo.
const SEP_REGEX = /[|\/\\]/g;

// ===== PERMISSÕES =====
// Quem pode USAR o sistema (abrir form, filtrar, etc.)
const ALLOWED_IDS = [
  "1262262852949905408", // OWNER (id)
  "660311795327828008",  // você (id)
  "1387253972661964840", // Equipe Social Mídias (role)
  "1388976094920704141", // Social Medias (role)
  "1352408327983861844", // Resp Creator (role)
  "1262262852949905409", // Resp Influ (role)
  "1352407252216184833", // Resp Líder (role)
  "1388976314253312100", // COORD+ (role)
  "1282119104576098314", // Mkt Creators (role)
];
// 🔥 Chefões: podem aprovar ATÉ o próprio
const SELF_APPROVE_USER_IDS = [
  "660311795327828008",  // você
  "1262262852949905408", // owner
];

const SELF_APPROVE_ROLE_IDS = [
  "1352408327983861844", // resp creators
  "1262262852949905409", // resp influ
  "1352407252216184833", // resp líder
];

// ✅ Quem pode aprovar/recusar (mas NÃO o próprio, a menos que seja chefão acima)
const APPROVER_ROLE_IDS = [
  "1388976314253312100", // coord
  "1282119104576098314", // mkt ticket
];

// =============================
// Helpers de permissão
// =============================
function _hasAnyRole(interaction, roleIds) {
  const member = interaction.member;
  return (member?.roles?.cache?.some((r) => roleIds.includes(r.id))) ?? false;
}

function temPermissaoPagamento(interaction) {
  const hasRole = _hasAnyRole(interaction, ALLOWED_IDS);
  const hasUser = ALLOWED_IDS.includes(interaction.user.id);
  return hasRole || hasUser;
}

// ✅ Chefão = pode até aprovar o próprio
function podeAprovarProprio(interaction) {
  const hasUser = SELF_APPROVE_USER_IDS.includes(interaction.user.id);
  const hasRole = _hasAnyRole(interaction, SELF_APPROVE_ROLE_IDS);
  return hasUser || hasRole;
}

// ✅ Aprovação = Coord/Mkt ou Chefão
function temPermissaoAprovacao(interaction) {
  if (podeAprovarProprio(interaction)) return true;
  return _hasAnyRole(interaction, APPROVER_ROLE_IDS);
}


function isUnknownInteraction(err) {
  return err?.code === 10062 || err?.code === 40060;
}

// =============================
// ✅ DEDUPE / DEBUG (anti duplicação)
// - trava o mesmo interaction.id por alguns segundos
// - resolve handler rodando 2x por roteador/listeners duplicados
// =============================
const DEDUPE_TTL_MS = 8000; // 8s (pode subir p/ 15000 se quiser)

function _getDedupeStore(client) {
  if (!client.__SC_PAGAMENTO_SOCIAL_DEDUPE__) {
    client.__SC_PAGAMENTO_SOCIAL_DEDUPE__ = new Map(); // key -> ts
  }
  return client.__SC_PAGAMENTO_SOCIAL_DEDUPE__;
}

function _cleanupDedupe(store) {
  const now = Date.now();
  for (const [k, ts] of store.entries()) {
    if (now - ts > DEDUPE_TTL_MS) store.delete(k);
  }
}

function makeDedupeKey(interaction) {
  // interaction.id já é único por evento do Discord
  // inclui tipo só pra ficar mais claro em debug
  const t =
    interaction.isButton?.() ? "BTN" :
    interaction.isModalSubmit?.() ? "MODAL" :
    "OTHER";
  return `${t}:${interaction.id}`;
}

async function blockIfDuplicate(client, interaction, debugLabel = "PagamentoSocial") {
  const store = _getDedupeStore(client);
  _cleanupDedupe(store);

  const key = makeDedupeKey(interaction);
  if (store.has(key)) {
    // ✅ DUPLICADO BLOQUEADO (debug leve)
    try {
      console.warn(`[${debugLabel}] DUPLICADO BLOQUEADO:`, {
        key,
        user: interaction.user?.id,
        customId: interaction.customId,
        at: new Date().toISOString(),
      });
    } catch {}

    // Se der, avisa no log (sem quebrar nada)
    try {
      await logPagamento(
        client,
        interaction,
        "🛡️ Dedupe: duplicado bloqueado",
        [
          `Chave: \`${key}\``,
          `CustomId: \`${interaction.customId || "—"}\``,
          `Usuário: <@${interaction.user?.id || "—"}>`,
        ].join("\n")
      );
    } catch {}

    // IMPORTANTe: retorna true => "isso era nosso" e impede o roteador de cair em outros handlers
    // mas não responde o usuário (pra não gerar spam)
    return true;
  }

  store.set(key, Date.now());
  return false;
}



// =============================
// Helpers de parse
// =============================
function parseNomeIdFlex(texto) {
  const t = String(texto || "").trim();
  if (!t) return { nome: PADRAO_INDEFINIDO, id: PADRAO_INDEFINIDO, hasId: false };

  const parts = t
    .split(SEP_REGEX)
    .map((s) => s.trim())
    .filter(Boolean);

  if (parts.length <= 1) {
    return { nome: parts[0], id: PADRAO_INDEFINIDO, hasId: false };
  }

  const id = parts.pop();
  const nome = parts.join(" | ") || PADRAO_INDEFINIDO;
  return { nome, id, hasId: true };
}

function normalizarDataEvento(s) {
  const t = String(s || "").trim();
  return t || PADRAO_INDEFINIDO;
}

// =============================
// Helpers de UI
// =============================
function criarRowMenu() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("abrirform")
      .setLabel("➕ Novo Pagamento")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId("filtro_solicitados")
      .setLabel("📌 Solicitados")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId("filtro_naoclicados")
      .setLabel("🕗 Não clicados")
      .setStyle(ButtonStyle.Secondary)
  );
}

function criarEmbedMenu() {
  const instrucoes = [
    "🩷 **Guia rápido — Como preencher:**",
    "┃ 🏷️ **Evento:** _SantaCreators: Missão Rosa_",
    "┃ 📅 **Data:** _20/09/2025_  _(aceita “Sex, 20/09”)_",
    "┃ 👤 **Ganhador (Nome** ou **Nome |/\\ ID/Texto):** _Virtude_ **ou** _Virtude | 12345_ **ou** _Virtude / 12345_ **ou** _Virtude \\ 12345_",
    "┃ 💰 **Pagante (Nome** ou **Nome |/\\ ID/Texto):** _Macedo_ **ou** _Macedo | 30_ **ou** _Macedo / 1000_ **ou** _Macedo \\ 1000_",
    "┃ 🎁 **Premiação:** _Valor: 10kk | VIP: Sim/Não_",
  ].join("\n");

  return new EmbedBuilder()
    .setColor("#ff3399")
    .setTitle("💸 Registro de Pagamento de Evento")
    .setDescription(
      [
        "🎯 **Clique no botão abaixo para registrar um pagamento de evento.**",
        "",
        instrucoes,
        "",
        "🧾 **Apenas membros autorizados podem registrar.**",
      ].join("\n")
    )
    .setImage(
      "https://media.discordapp.net/attachments/1362477839944777889/1384245215249825832/standard_2rss.gif?width=515&height=66"
    )
    .setFooter({ text: "SantaCreators – Sistema Oficial de Registro" });
}

function criarRowStatus(messageId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`pago__${messageId}`)
      .setLabel("✅ PAGO")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId(`solicitado__${messageId}`)
      .setLabel("📌 JÁ FOI SOLICITADO")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId(`reprovado__${messageId}`)
      .setLabel("❌ REPROVADO")
      .setStyle(ButtonStyle.Danger)
  );
}

// =============================
// Log visual completo
// =============================
async function logPagamento(client, interaction, titulo, descricao, linkMsg = null) {
  const canalLog = await client.channels.fetch(CANAL_LOG_PAGAMENTO).catch(() => null);
  if (!canalLog) return;

  const embed = new EmbedBuilder()
    .setColor("#ff3399")
    .setAuthor({
      name: `${interaction.user.tag}`,
      iconURL: interaction.user.displayAvatarURL({ dynamic: true }),
    })
    .setTitle(titulo)
    .setDescription(`${descricao}\n\n👤 **Usuário:** <@${interaction.user.id}>`)
    .addFields(
      { name: "🆔 ID do Usuário", value: `\`${interaction.user.id}\``, inline: true },
      { name: "🕒 Horário", value: `<t:${Math.floor(Date.now() / 1000)}:f>`, inline: true }
    )
    .setTimestamp();

  if (linkMsg) {
    embed.addFields({ name: "🔗 Link da Mensagem", value: `[Clique aqui](${linkMsg})` });
  }

  await canalLog.send({ embeds: [embed] }).catch(() => {});
}

// =============================

function buildLogContext({
  registroMsg = null,
  criadorId = null,
  actionById = null,
}) {
  const linhas = [];

  if (registroMsg) {
    linhas.push(`🔗 **Registro:** [Abrir mensagem](${registroMsg.url})`);
  }

  if (criadorId) {
    linhas.push(`📝 **Criado por:** <@${criadorId}>`);
  }

  if (actionById) {
    linhas.push(`🧑‍⚖️ **Ação feita por:** <@${actionById}>`);
  }

  linhas.push(`🕒 **Horário:** <t:${Math.floor(Date.now() / 1000)}:f>`);

  return linhas.join("\n");
}


// =============================
// Status update + auditoria (Status + Última decisão)
// =============================
function getFieldValue(embedLike, fieldName) {
  const fields = embedLike?.fields || embedLike?.data?.fields || [];
  const f = fields.find((x) => x.name === fieldName);
  return (f?.value || "").trim();
}

function getCriadorIdFromEmbed(embedLike) {
  // Preferência: campo fixo novo
  const v = getFieldValue(embedLike, "🆔 Criador do Registro");
  // v = "<@123> (`123`)" -> extrai ID
  const m = v.match(/`(\d{10,25})`/);
  if (m?.[1]) return m[1];

  // Fallback: tenta do campo antigo "📝 Registro"
  const r = getFieldValue(embedLike, "📝 Registro");
  const m2 = r.match(/<@(\d{10,25})>/);
  return m2?.[1] || null;
}

function getStatusValueFromEmbed(embed) {
  const status = getFieldValue(embed, "📌 Status");
  return status || "";
}

function atualizarCampoStatus(embedBuilder, novoTexto, cor, actionByUserId = null, actionLabel = null) {
  const data = embedBuilder.data ?? {};
  const fields = Array.isArray(data.fields) ? [...data.fields] : [];

  // 1) atualiza/injeta Status
  const idxStatus = fields.findIndex((f) => f.name === "📌 Status");
  const novoFieldStatus = { name: "📌 Status", value: novoTexto, inline: false };
  if (idxStatus >= 0) fields[idxStatus] = novoFieldStatus;
  else fields.push(novoFieldStatus);

  // 2) atualiza/injeta Última decisão (quem mexeu)
  if (actionByUserId) {
    const ts = Math.floor(Date.now() / 1000);
    const label = actionLabel || "Atualizado";
    const textoDecisao = `**${label} por:** <@${actionByUserId}>\n🕒 <t:${ts}:f>`;

    const idxDec = fields.findIndex((f) => f.name === "🧑‍⚖️ Última decisão");
    const novoFieldDec = { name: "🧑‍⚖️ Última decisão", value: textoDecisao, inline: false };
    if (idxDec >= 0) fields[idxDec] = novoFieldDec;
    else fields.push(novoFieldDec);
  }

  embedBuilder.setFields(fields);
  if (cor) embedBuilder.setColor(cor);
  return embedBuilder;
}


// =============================
// Mantém só 1 menu (card do botão) no canal
// =============================
async function limparBotoesAntigos(client, canal) {
  const mensagens = await canal.messages.fetch({ limit: 100 }).catch(() => null);
  if (!mensagens) return null;

  const botoes = mensagens.filter((msg) => {
    const ehDoBot = msg.author?.id === client.user.id;
    const temEmbed = msg.embeds?.length === 1;
    const tituloOk = msg.embeds?.[0]?.title?.includes("Registro de Pagamento de Evento");
    const temComponentes = msg.components?.length > 0;

    const customIds = msg.components?.[0]?.components?.map((c) => c.customId) || [];
    const temAbrirForm = customIds.includes("abrirform");

    return ehDoBot && temEmbed && tituloOk && temComponentes && temAbrirForm;
  });

  const ordenadas = [...botoes.values()].sort((a, b) => b.createdTimestamp - a.createdTimestamp);
  const paraDeletar = ordenadas.slice(1);

  for (const msg of paraDeletar) {
    await msg.delete().catch(() => {});
  }

  return ordenadas[0] || null;
}

// =============================
// Mover registros pelo filtro
// =============================
async function moverRegistrosPorFiltro(client, canal, filtro) {
  const mensagens = await canal.messages.fetch({ limit: 100 }).catch(() => null);
  if (!mensagens) return { movidos: 0 };

  const lista = [...mensagens.values()]
    .filter((m) => m.author?.id === client.user.id)
    .filter((m) => m.embeds?.length > 0)
    .filter((m) => {
      const t = m.embeds?.[0]?.title || "";
      return t.includes("Registro de Pagamento de Evento – SANTACREATORS");
    });

  let movidos = 0;

  for (const msg of lista) {
    const embedRaw = msg.embeds?.[0];
    if (!embedRaw) continue;

    const embedOriginal = EmbedBuilder.from(embedRaw);
    const statusValue = getStatusValueFromEmbed(embedOriginal);

    const ehSolicitado = /JÁ FOI SOLICITADO/i.test(statusValue);
    const ehAguardando = /Aguardando confirmação/i.test(statusValue);

    const ehPagoFinal = /✅\s*\*\*PAGO\*\*/i.test(statusValue);
    const ehReprovadoFinal = /❌\s*\*\*REPROVADO\*\*/i.test(statusValue);

    const entra =
      (filtro === "solicitados" && ehSolicitado) ||
      (filtro === "naoclicados" && ehAguardando);

    if (!entra) continue;

    const msgNova = await canal.send({ embeds: [embedOriginal] }).catch(() => null);
    if (!msgNova) continue;

    if (ehPagoFinal || ehReprovadoFinal) {
      await msgNova.edit({ components: [] }).catch(() => {});
    } else {
      await msgNova.edit({ components: [criarRowStatus(msgNova.id)] }).catch(() => {});
    }

    await msg.delete().catch(() => {});
    movidos++;
  }

  return { movidos };
}

// ============================================================================
// ✅ EXPORT 1: CHAMA NO READY
// ============================================================================
export async function pagamentoSocialOnReady(client) {
  const canal = await client.channels.fetch(CANAL_PAGAMENTO).catch(() => null);
  if (!canal || !canal.isTextBased()) return;

  // se já existe, garante que só fica 1
  const existente = await limparBotoesAntigos(client, canal).catch(() => null);
  if (existente) return;

  // se não existe, cria
  await canal.send({
    embeds: [criarEmbedMenu()],
    components: [criarRowMenu()],
  }).catch(() => {});
}

// ============================================================================
// ✅ EXPORT 2: HANDLER DO ROTEADOR CENTRAL
// - Retorna true se a interação era nossa
// ============================================================================
export async function handlePagamentoSocial(interaction, client) {
  try {


    // ✅ ANTI DUPLICAÇÃO (dedupe)
    // =========================
    const isDup = await blockIfDuplicate(client, interaction, "PagamentoSocial");
    if (isDup) return true;
    // =========================
    // BOTÕES
    // =========================
    if (interaction.isButton()) {
      const id = interaction.customId;

      // ✅ FILTROS
      if (id.startsWith("filtro_")) {
        if (!temPermissaoPagamento(interaction)) {
          await interaction.reply({
            content: "🚫 Você não tem permissão para usar esse filtro.",
            ephemeral: true,
          }).catch(() => {});
          return true;
        }

        const qual = id.split("_")[1]; // solicitados | naoclicados
        await interaction.deferReply({ ephemeral: true }).catch(() => {});

        const canal = await client.channels.fetch(CANAL_PAGAMENTO).catch(() => null);
        if (!canal || !canal.isTextBased()) {
          await interaction.followUp({ content: "❌ Não achei o canal.", ephemeral: true }).catch(() => {});
          return true;
        }

        const { movidos } = await moverRegistrosPorFiltro(client, canal, qual);

        // repostar menu e limpar duplicados
        await canal.send({ embeds: [criarEmbedMenu()], components: [criarRowMenu()] }).catch(() => {});
        await limparBotoesAntigos(client, canal).catch(() => {});

        logPagamento(client, interaction, "🔎 Filtro aplicado", `Filtro: **${qual}**\nRegistros movidos: **${movidos}**`)
          .catch(() => {});

        await interaction.followUp({
          content: `✅ Filtro aplicado: **${qual}**\n📦 Registros movidos: **${movidos}**`,
          ephemeral: true,
        }).catch(() => {});
        return true;
      }

      // ✅ ABRIR FORM
      if (id === "abrirform") {
        if (!temPermissaoPagamento(interaction)) {
          await interaction.reply({
            content: "🚫 Você não tem permissão para usar este formulário.",
            ephemeral: true,
          }).catch(() => {});
          return true;
        }

        const modal = new ModalBuilder()
          .setCustomId("form_pagamento")
          .setTitle("Pagamento Evento");

        const campos = [
          { id: "eventoNome",  label: "Nome do evento",               exemplo: "Ex: SantaCreators: Missão Rosas",          style: TextInputStyle.Short },
          { id: "eventoData",  label: "Data do evento",               exemplo: "Ex: 09/09/2025 (ou Sex, 09/09)",           style: TextInputStyle.Short },
          { id: "ganhador",    label: "Ganhador (Nome ou Nome |/\\ ID)", exemplo: "Ex: Virtude | 12345  /  Virtude \\ 12345", style: TextInputStyle.Short },
          { id: "pagante",     label: "Pagante (Nome ou Nome |/\\ ID)",  exemplo: "Ex: Macedo | 30  /  Macedo \\ 30",       style: TextInputStyle.Short },
          { id: "premiacao",   label: "Informações de Premiação",     exemplo: "Valor: 10kk | VIP: Sim/Não",               style: TextInputStyle.Paragraph },
        ];

        campos.forEach((c) =>
          modal.addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId(c.id)
                .setLabel(c.label)
                .setPlaceholder(c.exemplo)
                .setStyle(c.style)
                .setRequired(true)
            )
          )
        );

        await interaction.showModal(modal).catch((err) => {
          if (isUnknownInteraction(err)) return;
          throw err;
        });

        logPagamento(client, interaction, "🟣 Formulário aberto", `**Usuário:** <@${interaction.user.id}> abriu o formulário de pagamento.`)
          .catch(() => {});
        return true;
      }

      // ✅ STATUS (abre modal)
// formato: pago__{messageId} / solicitado__{messageId} / reprovado__{messageId}
if (id.startsWith("pago__") || id.startsWith("solicitado__") || id.startsWith("reprovado__")) {
  // ✅ só aprovadores (coord/mkt) + chefões
  if (!temPermissaoAprovacao(interaction)) {
    await interaction.reply({ content: "🚫 Você não tem permissão para aprovar/reprovar registros.", ephemeral: true }).catch(() => {});
    return true;
  }

  const [action, messageId] = id.split("__");

  // ✅ TRAVA: não pode aprovar o próprio (a menos que seja chefão)
  try {
    const embedClicado = interaction.message?.embeds?.[0];
    const criadorId = getCriadorIdFromEmbed(embedClicado);
    const ehProprio = criadorId && criadorId === interaction.user.id;

    if (ehProprio && !podeAprovarProprio(interaction)) {
      await interaction.reply({
        content: "🚫 Você não pode aprovar/reprovar **o seu próprio registro**.",
        ephemeral: true,
      }).catch(() => {});

      // loga tentativa
      logPagamento(
        client,
        interaction,
        "⛔ Bloqueado: auto-aprovação",
        `Usuário tentou **${action.toUpperCase()}** o próprio registro.\nCriador: <@${criadorId}>\nMensagem: \`${messageId}\``
      ).catch(() => {});
      return true;
    }
  } catch {}

  const tituloModal =
    action === "pago" ? "Descrição do Pagamento" :
    action === "solicitado" ? "Detalhes do Solicitado" :
    "Motivo da Reprovação";

  const modal = new ModalBuilder()
    .setCustomId(`${action}_desc_${messageId}`)
    .setTitle(tituloModal)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("descricao")
          .setLabel("Descreva o motivo")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
      )
    );

  await interaction.showModal(modal).catch((err) => {
    if (isUnknownInteraction(err)) return;
    throw err;
  });

  const tituloLog =
    action === "pago" ? "✅ Pagamento em avaliação" :
    action === "solicitado" ? "📌 Já foi solicitado" :
    "❌ Reprovado";

 logPagamento(
  client,
  interaction,
  tituloLog,
  [
    `Usuário clicou em **${action.toUpperCase()}**`,
    buildLogContext({
      registroMsg: interaction.message,
      actionById: interaction.user.id,
      criadorId: getCriadorIdFromEmbed(interaction.message?.embeds?.[0]),
    }),
  ].join("\n"),
  interaction.message?.url
).catch(() => {});

  return true;
}


      return false;
    }

    // =========================
    // MODAL SUBMIT
    // =========================
    if (interaction.isModalSubmit()) {
      const id = interaction.customId;

      // ✅ CRIAR REGISTRO
      if (id === "form_pagamento") {
        if (!temPermissaoPagamento(interaction)) {
          await interaction.reply({ content: "🚫 Você não tem permissão.", ephemeral: true }).catch(() => {});
          return true;
        }


        // =========================
  // ✅ TRAVA EXTRA (anti registro duplicado por “double submit”)
  // - segura 1 registro por usuário a cada X segundos
  // =========================
  if (!client.__SC_PAGAMENTO_SOCIAL_USERLOCK__) {
    client.__SC_PAGAMENTO_SOCIAL_USERLOCK__ = new Map(); // userId -> ts
  }
  {
    const now = Date.now();
    const last = client.__SC_PAGAMENTO_SOCIAL_USERLOCK__.get(interaction.user.id) || 0;
    const WIN = 6000; // 6s
    if (now - last < WIN) {
      try {
        await logPagamento(
          client,
          interaction,
          "🛑 Registro bloqueado (janela curta)",
          `Mesmo usuário tentou registrar 2x em menos de ${WIN / 1000}s.`
        );
      } catch {}

      // se já respondeu/deferiu em outro fluxo, só sai quieto
      try {
        await interaction.reply({ content: "🛑 Calma aí — já peguei teu envio. (anti duplicação)", ephemeral: true });
      } catch {}
      return true;
    }
    client.__SC_PAGAMENTO_SOCIAL_USERLOCK__.set(interaction.user.id, now);
  }


        const eventoNome = interaction.fields.getTextInputValue("eventoNome").trim();
        const eventoData = normalizarDataEvento(interaction.fields.getTextInputValue("eventoData"));

        const { nome: ganhadorNome, id: ganhadorId } = parseNomeIdFlex(interaction.fields.getTextInputValue("ganhador"));
        const { nome: paganteNome, id: paganteId } = parseNomeIdFlex(interaction.fields.getTextInputValue("pagante"));

        const premiacao = interaction.fields.getTextInputValue("premiacao").trim();

        const canal = await client.channels.fetch(CANAL_PAGAMENTO).catch(() => null);
        if (!canal || !canal.isTextBased()) {
          await interaction.reply({ content: "❌ Não achei o canal de pagamento.", ephemeral: true }).catch(() => {});
          return true;
        }

        const registrador = interaction.user;
        const registradorAvatar = registrador.displayAvatarURL({ dynamic: true });

        const embed = new EmbedBuilder()
  .setColor("#ff3399")
  .setAuthor({ name: `${registrador.tag} • Registro criado`, iconURL: registradorAvatar })
  .setTitle("🎉 Registro de Pagamento de Evento – SANTACREATORS")
  .setDescription("📌 Registro obrigatório de pagamentos de eventos e ações especiais.")
  .addFields(
    { name: "🏷️ Evento", value: `${eventoNome || PADRAO_INDEFINIDO}`, inline: true },
    { name: "📅 Data do Evento", value: `${eventoData || PADRAO_INDEFINIDO}`, inline: true },
    { name: "🎁 Premiação", value: `${premiacao || PADRAO_INDEFINIDO}`, inline: false },
    { name: "👤 Ganhador", value: `${ganhadorNome} | ${ganhadorId}`, inline: true },
    { name: "💰 Pagante", value: `${paganteNome} | ${paganteId}`, inline: true },

    // ✅ FIXO PRA TRAVA / AUDITORIA
    { name: "🆔 Criador do Registro", value: `<@${registrador.id}> (\`${registrador.id}\`)`, inline: false },

    { name: "📝 Registro", value: `Feito por <@${registrador.id}>`, inline: false },
    { name: "📌 Status", value: "`Aguardando confirmação...`", inline: false },

    // ✅ vai ser preenchido quando aprovar/reprovar/solicitar
    { name: "🧑‍⚖️ Última decisão", value: "`—`", inline: false }
  )
  .setThumbnail(registradorAvatar)
  .setImage(
    "https://media.discordapp.net/attachments/1362477839944777889/1384245215249825832/standard_2rss.gif?width=515&height=66"
  )
  .setFooter({ text: "SantaCreators – Sistema Oficial de Registro" })
  .setTimestamp();


        const mensagem = await canal.send({ embeds: [embed] }).catch(() => null);
        if (!mensagem) {
          await interaction.reply({ content: "❌ Falhei ao enviar o registro no canal.", ephemeral: true }).catch(() => {});
          return true;
        }

        await mensagem.edit({ components: [criarRowStatus(mensagem.id)] }).catch(() => {});

        // reposta o menu e limpa duplicados
        await canal.send({ embeds: [criarEmbedMenu()], components: [criarRowMenu()] }).catch(() => {});
        await limparBotoesAntigos(client, canal).catch(() => {});

        await interaction.reply({ content: "✅ Registro criado!", ephemeral: true }).catch(() => {});

        try {
  dashEmit("pagamento:criado", {
    __at: Date.now(),
    by: interaction.user.id,
    canal: CANAL_PAGAMENTO,
  });
} catch {}

        logPagamento(
  client,
  interaction,
  "📩 Novo pagamento registrado",
  [
    `**Evento:** \`${eventoNome || PADRAO_INDEFINIDO}\``,
    `**Data do Evento:** \`${eventoData || PADRAO_INDEFINIDO}\``,
    `**Ganhador:** \`${ganhadorNome} | ${ganhadorId}\``,
    `**Pagante:** \`${paganteNome} | ${paganteId}\``,
    `**Premiação:** \`${premiacao || PADRAO_INDEFINIDO}\``,
    ``,
    buildLogContext({
      registroMsg: mensagem,
      criadorId: registrador.id,
    }),
  ].join("\n"),
  mensagem.url
).catch(() => {});


        return true;
      }

      // ✅ STATUS UPDATE
if (id.startsWith("pago_desc_") || id.startsWith("solicitado_desc_") || id.startsWith("reprovado_desc_")) {
  await interaction.deferReply({ ephemeral: true }).catch(() => {});

  // ✅ só aprovadores (coord/mkt) + chefões
  if (!temPermissaoAprovacao(interaction)) {
    await interaction.followUp({
      content: "🚫 Você não tem permissão para aprovar/reprovar registros.",
      ephemeral: true
    }).catch(() => {});
    return true;
  }

  const parts = id.split("_desc_");
  const action = parts[0]; // pago | solicitado | reprovado
  const messageId = parts.slice(1).join("_desc_"); // segura caso tenha underscore

  const descricao = interaction.fields.getTextInputValue("descricao")?.trim() || PADRAO_INDEFINIDO;

  const canal = await client.channels.fetch(CANAL_PAGAMENTO).catch(() => null);
  if (!canal || !canal.isTextBased()) {
    await interaction.followUp({ content: "❌ Não achei o canal.", ephemeral: true }).catch(() => {});
    return true;
  }

  const msgOriginal = await canal.messages.fetch(messageId).catch(() => null);
  if (!msgOriginal?.embeds?.[0]) {
    await interaction.followUp({ content: "❌ Não achei o embed desse registro.", ephemeral: true }).catch(() => {});
    return true;
  }

  const embedOriginal = EmbedBuilder.from(msgOriginal.embeds[0]);

  // ✅ TRAVA: não pode aprovar o próprio (a menos que seja chefão)
  try {
    const criadorId = getCriadorIdFromEmbed(embedOriginal);
    const ehProprio = criadorId && criadorId === interaction.user.id;

    if (ehProprio && !podeAprovarProprio(interaction)) {
      await interaction.followUp({
        content: "🚫 Você não pode aprovar/reprovar **o seu próprio registro**.",
        ephemeral: true,
      }).catch(() => {});

      logPagamento(
        client,
        interaction,
        "⛔ Bloqueado: auto-aprovação (submit)",
        `Usuário tentou **${action.toUpperCase()}** o próprio registro.\nCriador: <@${criadorId}>\nMensagem: \`${messageId}\``
      ).catch(() => {});
      return true;
    }
  } catch {}

  const statusTexto =
    action === "pago"
      ? `✅ **PAGO**\n💬 ${descricao}`
      : action === "solicitado"
        ? `📌 **JÁ FOI SOLICITADO**\n💬 ${descricao}`
        : `❌ **REPROVADO**\n💬 ${descricao}`;

  const cor =
    action === "pago" ? "Green"
      : action === "solicitado" ? "#f1c40f"
        : "Red";

  const labelAuditoria =
    action === "pago" ? "PAGO"
      : action === "solicitado" ? "SOLICITADO"
        : "REPROVADO";

  // ✅ agora escreve também quem fez a ação no próprio registro
  const embedAtualizado = atualizarCampoStatus(
    embedOriginal,
    statusTexto,
    cor,
    interaction.user.id,
    labelAuditoria
  );

  const msgNova = await canal.send({ embeds: [embedAtualizado] }).catch(() => null);
  if (!msgNova) {
    await interaction.followUp({ content: "❌ Falhei ao enviar a atualização.", ephemeral: true }).catch(() => {});
    return true;
  }

  // Se solicitado, mantém botões (pra depois virar pago/reprovado). Se pago/reprovado, remove botões.
  if (action === "solicitado") {
    await msgNova.edit({ components: [criarRowStatus(msgNova.id)] }).catch(() => {});
  } else {
    await msgNova.edit({ components: [] }).catch(() => {});
  }

  // apaga o original (ou deixa como movido)
  try {
    await msgOriginal.delete();
  } catch {
    await msgOriginal.edit({
      content: "🧾 Registro movido/atualizado (mensagem antiga).",
      components: [],
    }).catch(() => {});
  }

  // reposta menu e limpa duplicados
  await canal.send({ embeds: [criarEmbedMenu()], components: [criarRowMenu()] }).catch(() => {});
  await limparBotoesAntigos(client, canal).catch(() => {});

  await interaction.followUp({ content: "✅ Atualizado e jogado pro final do chat!", ephemeral: true }).catch(() => {});

  // ✅ EMITE EVENTO PRO GERALDASH (aqui!)
  try {
    const map = {
      pago: "pagamento:pago",
      solicitado: "pagamento:solicitado",
      reprovado: "pagamento:reprovado",
    };
    dashEmit(map[action] || "pagamento:status", {
      __at: Date.now(),
      by: interaction.user.id,
      action,
      canal: CANAL_PAGAMENTO,
    });
  } catch {}

  const tituloLog =
    action === "pago" ? "💰 Pagamento confirmado"
      : action === "solicitado" ? "📌 Marcado como solicitado"
        : "🚫 Pagamento reprovado";

  logPagamento(
  client,
  interaction,
  tituloLog,
  [
    `**Motivo:**`,
    `\`\`\`${descricao}\`\`\``,
    ``,
    buildLogContext({
      registroMsg: msgNova,
      criadorId: getCriadorIdFromEmbed(embedOriginal),
      actionById: interaction.user.id,
    }),
  ].join("\n"),
  msgNova.url
).catch(() => {});


  return true;
}


      return false;
    }

    return false;
  } catch (err) {
    if (isUnknownInteraction(err)) return true;
    console.warn("Erro no sistema de pagamentos:", err);
    return true;
  }
}
