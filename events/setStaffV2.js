// /application/events/setStaffV2.js
// SantaCreators • Set Staff (V2) — Modular / SEM ENV
// - Botão fixo auto-gerenciado no canal do menu
// - Fluxo: Cidade -> Nível -> Modal -> Envia pra aprovação
// - Aprovar/Reprovar com histórico em JSON
// - Compatível com teu roteador central (messageCreate / interactionCreate / ready)

import fs from "node:fs";
import path from "node:path";
import {
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";

// =====================================================
// CONFIG FIXA (SEM .env)
// =====================================================
const CFG = {
  GUILD_ID: "1262262852782129183",

  // Canal do MENU (mensagem fixa com botões de cidade)
  CANAL_MENU: "1382830421909438484",

  // Canal onde cai o pedido pra aprovar/reprovar
  CANAL_REGISTRO: "1379024704957841509",

  // Canal de notificação "novo set"
  CANAL_NOTIF: "1262262853436440652",

  // Cargos gerais
  CARGO_CIDADAO: "1262978759922028575",
  CARGO_STAFF_GERAL: "1353151740362625055",

  // Permissões de aprovação
  PODE_APROVAR_ROLES: [
    "1414651836861907006", // RESPONSÁVEIS
    "1352385500614234134", // COORDENAÇÃO
    "1262262852949905408", // OWNER
    "1282119104576098314", // MKT TICKET
  ],
  PODE_APROVAR_USERS: [
    "660311795327828008", // você
  ],
};

// =====================================================
// CARGOS (Cidades / Níveis)
// =====================================================
const CARGOS_CIDADES = {
  nobre: "1379021805544804382",
  santa: "1379021888709464168",
  maresia: "1379021994678288465",
  royal: "1379021933324271719",
  universo: "1379022090891427892",
  kng: "1379022161519312896",
  malta: "1379022050403815454",
  real: "1423348501110198343",
  grande: "1418691103397253322",
  boomerang: "1423354185570586694",
  district99: "1500677281864093746",
  liberty99: "1500676325042688092",
  prime: "1500677363917258822",
  fronteira: "1500677363917258822",
  goat: "1500669528479371268",
};

const CARGOS_STAFF = {
  // NOVOS
  diretoria: "1377127454543708253",
  diretorcomunidade: "1377109308730376202",
  respadministrativo: "1459624402231754876",
  respwallstreet: "1353019238658347070",

  // JÁ EXISTIAM
  adm: "1352367267547058319",
  masterstaff: "1366960248530796564",
  respstaff: "1366961308314108015", // Resp Cultura
  senior: "1379172775905984703",
  auxiliar: "1381865464187326545",
  pleno: "1379172895116361770",
  junior: "1379262716564471971",
  estagiario: "1379172934387630160",
};


const NIVEL_LABELS = {
  // NOVOS
  diretoria: "DIRETORIA",
  diretorcomunidade: "Diretor Comunidade",
  respstaff: "Resp Cultura",
  respadministrativo: "Resp Administrativo",
  respwallstreet: "Resp Wallstreet",

  // JÁ EXISTIAM
  masterstaff: "Responsáveis",
  adm: "ADM",
  senior: "Sênior",
  auxiliar: "Auxiliar",
  pleno: "Pleno",
  junior: "Junior",
  estagiario: "Estagiário",
};

const ABREVIACOES_CIDADES = {
  nobre: "NB",
  santa: "ST",
  maresia: "MRS",
  royal: "RYL",
  universo: "UNV",
  kng: "KNG",
  malta: "MLT",
  real: "REAL",
  grande: "GRND",
  boomerang: "BMG",
  district99: "D99",
  liberty99: "L99",
  prime: "PRM",
  fronteira: "FRNT",
  goat: "GOT",
};

// Níveis que puxam cargos extras ao aprovar
const EXTRA_BY_LEVEL = {
  adm: ["senior"],
  masterstaff: ["senior"],
  respstaff: ["senior"],
  auxiliar: ["pleno"],
};

const LABELS_CIDADES = {
  nobre: "Nobre",
  santa: "Santa",
  maresia: "Maresia",
  royal: "Royal UK",
  universo: "Universo",
  kng: "KNG",
  malta: "Malta",
  real: "Real",
  grande: "Grande",
  boomerang: "Boomerang",
  district99: "District 99",
  liberty99: "Liberty 99",
  prime: "Prime",
  fronteira: "Fronteira",
  goat: "Goat",
};

// =====================================================
// STATE GLOBAL (anti duplicação)
// =====================================================
globalThis.__SC_SETSTAFF_V2__ ??= {
  installed: false,
  lastFixedMsgId: null,
  lastFixRunAt: 0,
  lock: false,
  pedidosMap: new Map(), // memória do fluxo
};

const ST = globalThis.__SC_SETSTAFF_V2__;

// =====================================================
// PERSISTÊNCIA (arquivo próprio do módulo)
// (não depende do teu salvarPedido/obterPedido do index)
// =====================================================

// ✅ DICA: se teu host tiver "storage" persistente, isso fica ainda mais seguro.
// Se não tiver, continua funcionando igual (mas se o host apagar arquivos no restart, perde).
const DATA_DIR = path.resolve("./events/data/setstaff");
const DATA_FILE = path.join(DATA_DIR, "pedidos_setstaff.json");

function ensureDataFile() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({ users: {}, byMsgId: {} }, null, 2));
  } catch (e) {
    console.error("[SETSTAFF_V2] erro criando data file:", e);
  }
}

// ✅ Normaliza formato do JSON (suporta o antigo que era { [userId]: [] })
function normalizeAll(rawObj) {
  const obj = rawObj && typeof rawObj === "object" ? rawObj : {};

  // formato novo
  if (obj.users && typeof obj.users === "object") {
    obj.byMsgId ??= {};
    if (typeof obj.byMsgId !== "object") obj.byMsgId = {};
    return { users: obj.users, byMsgId: obj.byMsgId };
  }

  // formato antigo (legacy): { "123": [ ... ] }
  return { users: obj, byMsgId: {} };
}

function loadAll() {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const json = JSON.parse(raw || "{}");
    return normalizeAll(json);
  } catch {
    return { users: {}, byMsgId: {} };
  }
}

function saveAll(obj) {
  ensureDataFile();
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(obj, null, 2));
  } catch (e) {
    console.error("[SETSTAFF_V2] erro salvando json:", e);
  }
}

function pushHistorico(userId, payload) {
  const all = loadAll();
  all.users[userId] ??= [];
  all.users[userId].push(payload);
  saveAll(all);
}

function getHistorico(userId) {
  const all = loadAll();
  return Array.isArray(all.users[userId]) ? all.users[userId] : [];
}

function getUltimo(userId) {
  const h = getHistorico(userId);
  return h.length ? h[h.length - 1] : null;
}

function updateUltimoStatus(userId, status) {
  const all = loadAll();
  const h = Array.isArray(all.users[userId]) ? all.users[userId] : [];
  if (!h.length) return;

  h[h.length - 1].status = status;
  all.users[userId] = h;

  // se o último tiver msgId, atualiza também a tabela por msgId
  const last = h[h.length - 1];
  if (last?.msgId) {
    all.byMsgId[last.msgId] = { ...(all.byMsgId[last.msgId] || {}), ...last, status };
  }

  saveAll(all);
}

// ✅ salva/atualiza lookup por msgId (pra aprovar/reprovar sempre achar o pedido certo)
function setByMsgId(msgId, payload) {
  if (!msgId) return;
  const all = loadAll();
  all.byMsgId[msgId] = payload;
  saveAll(all);
}

function getByMsgId(msgId) {
  if (!msgId) return null;
  const all = loadAll();
  const p = all.byMsgId?.[msgId];
  return p && typeof p === "object" ? p : null;
}

function updateByMsgIdStatus(msgId, status) {
  if (!msgId) return;
  const all = loadAll();
  if (!all.byMsgId?.[msgId]) return;
  all.byMsgId[msgId].status = status;
  saveAll(all);
}

function getPedidoPendente(userId) {
  const historico = getHistorico(userId);
  if (!historico.length) return null;

  for (let i = historico.length - 1; i >= 0; i--) {
    const item = historico[i];
    if (String(item?.status || "").toLowerCase() === "pendente") {
      return item;
    }
  }

  return null;
}

function hasPedidoPendente(userId) {
  return !!getPedidoPendente(userId);
}

async function resolveLogChannel(client, channelId) {
  try {
    if (!client || !channelId) return null;

    const canal = await client.channels.fetch(channelId).catch(() => null);
    if (!canal) return null;

    if (canal.type !== ChannelType.GuildText) return null;

    return canal;
  } catch (e) {
    console.error("[SETSTAFF_V2] resolveLogChannel erro:", e);
    return null;
  }
}

// ✅ NOVO: Reconstrói dados a partir do Embed se o JSON falhar
function reconstruirPedidoDoEmbed(embed, userIdTarget) {
  try {
    if (!embed || !embed.fields) return null;

    const getVal = (namePart) => {
      const f = embed.fields.find(f => f.name.includes(namePart));
      return f ? f.value : null;
    };

    const nome = getVal("Nome") || "—";
    const pasta = getVal("Pasta") || "—";
    const passaporte = getVal("Passaporte") || "—";
    const dataHora = getVal("Data/Hora") || "—";
    
    const cidadeRaw = getVal("Cidade") || "";
    const nivelRaw = getVal("Nível") || "";

    // Tenta descobrir a chave da cidade
    let cidadeKey = null;
    for (const [key, roleId] of Object.entries(CARGOS_CIDADES)) {
      if (cidadeRaw.includes(roleId)) { cidadeKey = key; break; }
    }
    if (!cidadeKey) {
      const clean = cidadeRaw.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
      for (const key of Object.keys(CARGOS_CIDADES)) {
        if (clean.includes(key.toLowerCase())) { cidadeKey = key; break; }
      }
    }

    // Tenta descobrir a chave do nível
    let nivelKey = null;
    for (const [key, roleId] of Object.entries(CARGOS_STAFF)) {
      if (nivelRaw.includes(roleId)) { nivelKey = key; break; }
    }
    if (!nivelKey) {
       for (const [key, label] of Object.entries(NIVEL_LABELS)) {
         if (nivelRaw.toLowerCase().includes(label.toLowerCase())) { nivelKey = key; break; }
       }
    }
    if (!nivelKey) {
       for (const key of Object.keys(CARGOS_STAFF)) {
         if (nivelRaw.toLowerCase().includes(key.toLowerCase())) { nivelKey = key; break; }
       }
    }

    if (cidadeKey && nivelKey) {
      return {
        userId: userIdTarget,
        cidade: cidadeKey,
        nivel: nivelKey,
        nome,
        pasta,
        passaporte,
        dataHora,
        status: "pendente",
        reconstructed: true
      };
    }
  } catch (e) {
    console.error("[SETSTAFF_V2] Erro reconstruindo embed:", e);
  }
  return null;
}


// =====================================================
// FORMAT HELPERS
// =====================================================
function fmtNivelLabel(nivel) {
  return NIVEL_LABELS[nivel] ?? String(nivel || "").toUpperCase();
}
function fmtCidadeLabel(cidade) {
  const rid = CARGOS_CIDADES[cidade];
  return rid ? `<@&${rid}>` : String(cidade || "").toUpperCase();
}
function fmtNivelComMenção(nivel) {
  const rid = CARGOS_STAFF[nivel];
  const label = fmtNivelLabel(nivel);
  return rid ? `${label} (<@&${rid}>)` : label;
}
function fmtExtrasLista(extrasKeys) {
  const labels = (extrasKeys || []).map((k) => fmtNivelComMenção(k));
  return labels.length ? labels.join(", ") : "—";
}

function canApprove(interaction) {
  const isUserAllowed = CFG.PODE_APROVAR_USERS.includes(interaction.user.id);
  const hasRoleAllowed = !!interaction.member?.roles?.cache?.some((r) => CFG.PODE_APROVAR_ROLES.includes(r.id));
  return isUserAllowed || hasRoleAllowed;
}

// =====================================================
// UI BUILDERS
// =====================================================
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function buildCityRows() {
  const entries = Object.entries(LABELS_CIDADES);
  const groups = chunk(entries, 5);

  const rows = groups.map((group) => {
    const row = new ActionRowBuilder();
    for (const [cidade, label] of group) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`ss2_cidade_${cidade}`)
          .setLabel(label)
          .setStyle(ButtonStyle.Primary)
      );
    }
    return row;
  });

  const extra = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ss2_ver_historico").setLabel("📖 Ver Histórico").setStyle(ButtonStyle.Secondary)
  );
  rows.push(extra);
  return rows;
}

function buildNivelRows() {
  // Agora com mais opções (máx 5 por linha)
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ss2_nivel_diretoria").setLabel("DIRETORIA").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("ss2_nivel_diretorcomunidade").setLabel("Diretor Comunidade").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("ss2_nivel_respstaff").setLabel("Resp Cultura").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("ss2_nivel_respadministrativo").setLabel("Resp Administrativo").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("ss2_nivel_respwallstreet").setLabel("Resp Wallstreet").setStyle(ButtonStyle.Danger)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ss2_nivel_masterstaff").setLabel("Responsáveis").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("ss2_nivel_adm").setLabel("ADM").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("ss2_nivel_senior").setLabel("Sênior").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("ss2_nivel_auxiliar").setLabel("Auxiliar").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("ss2_nivel_pleno").setLabel("Pleno").setStyle(ButtonStyle.Secondary)
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ss2_nivel_junior").setLabel("Junior").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("ss2_nivel_estagiario").setLabel("Estagiário").setStyle(ButtonStyle.Secondary)
  );

  return [row1, row2, row3];
}


function buildEmbedPedido({ userId, nome, pasta, passaporte, cidade, nivel, dataHora, status }) {
  return new EmbedBuilder()
    .setTitle("🛠️ Pedido de Set Staff")
    .setColor("#9146FF")
    .setThumbnail(`https://cdn.discordapp.com/avatars/${userId}/${"a".repeat(32)}.png`) // fallback visual (Discord troca sozinho se não achar)
    .addFields(
      { name: "👤 Nome:", value: nome || "—", inline: true },
      { name: "📁 Pasta:", value: pasta || "—", inline: true },
      { name: "🪪 Passaporte:", value: passaporte || "—", inline: true },
      { name: "🌆 Cidade Escolhida:", value: fmtCidadeLabel(cidade), inline: true },
      { name: "📊 Nível Staff:", value: fmtNivelComMenção(nivel), inline: true },
      { name: "🕒 Data/Hora do Pedido:", value: dataHora || "—", inline: false },
      { name: "📌 Status:", value: `**${String(status || "pendente").toUpperCase()}**`, inline: false }
    )
    .setFooter({ text: `ID do usuário: ${userId}` });
}

function buildRowAprovacao(userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ss2_aprovar_${userId}`).setLabel("Aprovar").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`ss2_reprovar_${userId}`).setLabel("Reprovar").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`ss2_verhistorico_${userId}`).setLabel("Ver Histórico").setStyle(ButtonStyle.Secondary)
  );
}

function buildRowFinal(acao) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ss2_finalizado")
      .setLabel(acao === "aprovar" ? "✅ Aprovado" : "❌ Reprovado")
      .setStyle(acao === "aprovar" ? ButtonStyle.Success : ButtonStyle.Danger)
      .setDisabled(true)
  );
}

// =====================================================
// FIXED MESSAGE (BOTÃO FIXO AUTO-EDIT)
// - roda no ready
// - e roda sempre que alguém interage (com throttle)
// =====================================================
async function ensureFixedMessage(client, force = false) {
  const now = Date.now();
  if (!force && now - ST.lastFixRunAt < 2500) return; // throttle
  if (ST.lock) return;
  ST.lock = true;
  ST.lastFixRunAt = now;

  try {
    const canal = await client.channels.fetch(CFG.CANAL_MENU).catch(() => null);
    if (!canal || canal.type !== ChannelType.GuildText) return;

    const msgs = await canal.messages.fetch({ limit: 50 }).catch(() => null);
    if (!msgs) return;

    const marker = "🛠️ Clique abaixo para iniciar seu pedido de set staff:";
    const rows = buildCityRows();

    const minhas = msgs.filter(
      (m) =>
        m.author?.id === client.user.id &&
        (m.content || "").includes(marker) &&
        Array.isArray(m.components) &&
        m.components.length > 0
    );

    if (minhas.size > 0) {
      const sorted = [...minhas.values()].sort((a, b) => b.createdTimestamp - a.createdTimestamp);
      const keep = sorted[0];
      ST.lastFixedMsgId = keep.id;

      // sempre edita pra garantir que tá atualizado
      await keep.edit({ content: marker, components: rows }).catch(() => {});

      // apaga duplicadas
      const dups = sorted.slice(1);
      for (const d of dups) await d.delete().catch(() => {});
      return;
    }

    // se não existe, cria
    const sent = await canal.send({ content: marker, components: rows }).catch(() => null);
    if (sent) ST.lastFixedMsgId = sent.id;
  } catch (e) {
    console.error("[SETSTAFF_V2] ensureFixedMessage erro:", e);
  } finally {
    ST.lock = false;
  }
}

// =====================================================
// API DO MÓDULO (pra teu roteador)
// =====================================================
export async function setStaffV2OnReady(client) {
  if (ST.installed) return;
  ST.installed = true;

  ensureDataFile();

  // garante mensagem fixa quando ligar
  await ensureFixedMessage(client, true);
  // console.log("[SETSTAFF_V2] pronto ✅ (mensagem fixa garantida)");
}

export async function setStaffV2HandleMessage(message, client) {
  try {
    if (!message.guild || message.author.bot) return false;
    if (message.guild.id !== CFG.GUILD_ID) return false;

    const PREFIX = process.env.PREFIX || "!";
    if (!message.content.startsWith(PREFIX)) return false;

    const [cmd] = message.content.slice(PREFIX.length).trim().split(/\s+/);
    const name = (cmd || "").toLowerCase();

    // opcional: comando manual pra repostar/forçar arrumar
    if (name === "postsetstaff") {
      const allowed =
        CFG.PODE_APROVAR_USERS.includes(message.author.id) ||
        message.member?.roles?.cache?.some((r) => CFG.PODE_APROVAR_ROLES.includes(r.id));

      if (!allowed) {
        await message.reply("❌ Você não tem permissão pra usar isso.").catch(() => {});
        return true;
      }

      await ensureFixedMessage(client, true);
      await message.reply("✅ Mensagem fixa do Set Staff garantida/atualizada.").catch(() => {});
      return true;
    }

    // se alguém usar "!staff" em qualquer lugar, também força o fixo (e apaga o comando)
    if (name === "staff") {
      await ensureFixedMessage(client, true);
      await message.delete().catch(() => {});
      return true;
    }

    return false;
  } catch (e) {
    console.error("[SETSTAFF_V2] HandleMessage erro:", e);
    return false;
  }
}

export async function setStaffV2HandleInteraction(interaction, client) {
  try {
    if (!interaction.guildId || interaction.guildId !== CFG.GUILD_ID) return false;

    // sempre que alguém encostar em algo do setstaff, garante o botão fixo “vivo”
    // (isso atende teu “se auto edita sempre que é interagido”)
    ensureFixedMessage(client).catch(() => {});

    const userId = interaction.user.id;

    // ===========================================
    // (A) BOTÕES DE CIDADE (menu fixo)
    // ===========================================
    if (interaction.isButton() && interaction.customId.startsWith("ss2_cidade_")) {
  const pedidoPendente = getPedidoPendente(userId);
  if (pedidoPendente) {
    await interaction.reply({
      content:
        "⚠️ Você já possui um pedido de set staff pendente de análise.\n" +
        "Aguarde aprovação ou reprovação antes de enviar outro.",
      ephemeral: true,
    });
    return true;
  }

  const cidade = interaction.customId.split("_")[2];
  ST.pedidosMap.set(userId, { cidade });

  const rows = buildNivelRows();
  await interaction.reply({
    content: "👤 Escolha o nível do seu cargo:",
    components: rows,
    ephemeral: true,
  });
  return true;
}

    // ===========================================
    // (B) VER HISTÓRICO (menu fixo)
    // ===========================================
    if (interaction.isButton() && interaction.customId === "ss2_ver_historico") {
      const historico = getHistorico(userId);
      if (!historico.length) {
        await interaction.reply({ content: "❌ Você ainda não fez nenhum pedido.", ephemeral: true });
        return true;
      }

      const ultimo = historico[historico.length - 1];
      const cor =
        ultimo.status === "aprovado" ? "#43B581" : ultimo.status === "reprovado" ? "#ED4245" : "#FEE75C";

      const embed = new EmbedBuilder()
        .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
        .setColor(cor)
        .setTitle("📖 Seu Último Pedido de Set Staff")
        .setThumbnail(interaction.user.displayAvatarURL())
        .addFields(
          { name: "🧑 Nome", value: ultimo.nome || "—", inline: true },
          { name: "🗂️ Pasta", value: ultimo.pasta || "—", inline: true },
          { name: "🪪 Passaporte", value: ultimo.passaporte || "—", inline: true },
          { name: "🌆 Cidade", value: String(ultimo.cidade || "—").toUpperCase(), inline: true },
          { name: "📊 Nível", value: fmtNivelLabel(ultimo.nivel), inline: true },
          { name: "📅 Data", value: ultimo.dataHora || "—", inline: true },
          { name: "📌 Status", value: `**${String(ultimo.status || "pendente").toUpperCase()}**`, inline: true }
        )
        .setFooter({ text: `ID do usuário: ${interaction.user.id}` });

      await interaction.reply({ embeds: [embed], ephemeral: true });
      return true;
    }

    // ===========================================
    // (C) BOTÕES DE NÍVEL
    // ===========================================
if (interaction.isButton() && interaction.customId.startsWith("ss2_nivel_")) {
  const pedidoPendente = getPedidoPendente(userId);
  if (pedidoPendente) {
    await interaction.reply({
      content:
        "⚠️ Você já possui um pedido de set staff pendente de análise.\n" +
        "Aguarde aprovação ou reprovação antes de enviar outro.",
      ephemeral: true,
    });
    return true;
  }

  const nivel = interaction.customId.split("_")[2];
  const base = ST.pedidosMap.get(userId);
  if (!base?.cidade) {
    await interaction.reply({
      content: "⚠️ Seu pedido perdeu o contexto (cidade). Clique no botão de cidade de novo.",
      ephemeral: true,
    });
    return true;
  }

  base.nivel = nivel;
  ST.pedidosMap.set(userId, base);

  const modal = new ModalBuilder()
    .setCustomId("ss2_modal_setstaff")
    .setTitle("Pedido de Set Staff")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("nome")
          .setLabel("Seu Nome")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("pasta")
          .setLabel("Sua pasta na cidade")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("id")
          .setLabel("Seu ID/Passaporte")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );

  await interaction.showModal(modal);
  return true;
}

    // ===========================================
    // (D) SUBMIT DO MODAL
    // ===========================================
    if (interaction.isModalSubmit() && interaction.customId === "ss2_modal_setstaff") {
  const base = ST.pedidosMap.get(userId) || {};
  const { cidade, nivel } = base;

  if (!cidade || !nivel) {
    await interaction.reply({
      content: "⚠️ Seu pedido perdeu o contexto (cidade/nível). Refaz o fluxo pelo menu.",
      ephemeral: true,
    });
    return true;
  }

  const pedidoPendente = getPedidoPendente(userId);
  if (pedidoPendente) {
    await interaction.reply({
      content:
        "⚠️ Você já possui um pedido de set staff pendente de análise.\n" +
        "Aguarde aprovação ou reprovação antes de enviar outro.",
      ephemeral: true,
    });
    return true;
  }

  const nome = interaction.fields.getTextInputValue("nome")?.trim();
  const pasta = interaction.fields.getTextInputValue("pasta")?.trim();
  const passaporte = interaction.fields.getTextInputValue("id")?.trim();
  const dataHora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

  if (!nome || !pasta || !passaporte) {
    await interaction.reply({
      content: "❌ Preencha nome, pasta e passaporte corretamente.",
      ephemeral: true,
    });
    return true;
  }

  const payload = {
    userId,
    cidade,
    nivel,
    nome,
    pasta,
    passaporte,
    dataHora,
    status: "pendente",
  };

  const embed = buildEmbedPedido(payload);
  const row = buildRowAprovacao(userId);

  const canalRegistro = await resolveLogChannel(client, CFG.CANAL_REGISTRO);
  if (!canalRegistro) {
    await interaction.reply({
      content: "❌ Não achei o canal de registro do set staff.",
      ephemeral: true,
    });
    return true;
  }

  let msgRegistro = null;

  try {
    msgRegistro = await canalRegistro.send({
      content: `Novo pedido de set staff de <@${userId}>`,
      embeds: [embed],
      components: [row],
      allowedMentions: { parse: ["users"] },
    });
  } catch (e) {
    console.error("[SETSTAFF_V2] erro enviando pedido no canal de registro:", e);
    await interaction.reply({
      content: "❌ Não consegui enviar seu pedido para análise. Tente novamente em instantes.",
      ephemeral: true,
    });
    return true;
  }

  const payloadFinal = {
    ...payload,
    msgId: msgRegistro.id,
  };

  pushHistorico(userId, payloadFinal);
  setByMsgId(msgRegistro.id, payloadFinal);
  ST.pedidosMap.delete(userId);

  const canalNotif = await resolveLogChannel(client, CFG.CANAL_NOTIF);
  if (canalNotif) {
    await canalNotif
      .send({
        content:
          `📢 Novo pedido de set staff feito por <@${userId}>!\n` +
          `📌 Analise aqui: <#${CFG.CANAL_REGISTRO}>`,
        allowedMentions: { parse: ["users"] },
      })
      .catch(() => {});
  }

  const membro = await interaction.guild.members.fetch(userId).catch(() => null);
  if (membro) {
    await membro.setNickname(`${nome} | ${passaporte}`).catch(() => {});
    await membro.roles.add(CFG.CARGO_CIDADAO).catch(() => {});
  }

  await interaction.reply({ content: "✅ Pedido enviado com sucesso!", ephemeral: true });
  return true;
}
    // ===========================================
    // (E) VER HISTÓRICO (botão no registro)
    // ===========================================
    if (interaction.isButton() && interaction.customId.startsWith("ss2_verhistorico_")) {
      const userIdTarget = interaction.customId.split("_")[2];
      const ehAprovador = canApprove(interaction);

      if (!ehAprovador && interaction.user.id !== userIdTarget) {
        await interaction.reply({ content: "❌ Você só pode ver seu próprio histórico.", ephemeral: true });
        return true;
      }

      // ✅ tenta achar pelo msgId do próprio pedido (mais confiável)
const byMsg = getByMsgId(interaction.message?.id);
const ultimo = byMsg || getUltimo(userIdTarget);

if (!ultimo) {
  await interaction.reply({ content: "⚠️ Nenhum histórico encontrado.", ephemeral: true });
  return true;
}

      const embed = new EmbedBuilder()
        .setTitle("📂 Último pedido de Set Staff")
        .setColor(ultimo.status === "aprovado" ? "#43B581" : ultimo.status === "reprovado" ? "#ED4245" : "#5865F2")
        .addFields(
          { name: "👤 Nome:", value: ultimo.nome || "—", inline: true },
          { name: "📁 Pasta:", value: ultimo.pasta || "—", inline: true },
          { name: "🪪 Passaporte:", value: ultimo.passaporte || "—", inline: true },
          { name: "🌆 Cidade:", value: fmtCidadeLabel(ultimo.cidade), inline: true },
          { name: "📊 Nível Staff:", value: fmtNivelLabel(ultimo.nivel), inline: true },
          { name: "📅 Data do pedido:", value: ultimo.dataHora || "—", inline: false },
          { name: "📌 Status:", value: `**${String(ultimo.status || "pendente").toUpperCase()}**`, inline: false }
        )
        .setFooter({ text: `ID do usuário: ${userIdTarget}` });

      await interaction.reply({ embeds: [embed], ephemeral: true });
      return true;
    }

    // ===========================================
    // (F) APROVAR / REPROVAR
    // ===========================================
    if (interaction.isButton() && (interaction.customId.startsWith("ss2_aprovar_") || interaction.customId.startsWith("ss2_reprovar_"))) {
      const acao = interaction.customId.startsWith("ss2_aprovar_") ? "aprovar" : "reprovar";
      const userIdTarget = interaction.customId.split("_")[2];

      // evita "This interaction failed"
      await interaction.deferUpdate().catch(() => {});

      if (!canApprove(interaction)) {
        await interaction.followUp({ content: "❌ Você não tem permissão pra aprovar/reprovar.", ephemeral: true }).catch(() => {});
        return true;
      }

      // ✅ pega o pedido pelo msgId da mensagem (sempre certo)
      let pedido = getByMsgId(interaction.message?.id) || getUltimo(userIdTarget);

      // 🚨 FALLBACK: Se não achou no JSON, tenta reconstruir lendo o Embed da mensagem
      if (!pedido && interaction.message?.embeds?.[0]) {
        pedido = reconstruirPedidoDoEmbed(interaction.message.embeds[0], userIdTarget);
        // Se reconstruiu com sucesso, salva no JSON pra não perder de novo
        if (pedido) {
           pedido.msgId = interaction.message.id;
           setByMsgId(interaction.message.id, pedido);
        }
      }

if (!pedido) {
  await interaction.followUp({ content: "⚠️ Pedido não encontrado no histórico.", ephemeral: true }).catch(() => {});
  return true;
}


      const membro = await interaction.guild.members.fetch(userIdTarget).catch(() => null);
      if (!membro) {
        await interaction.followUp({ content: "❌ Membro não encontrado no servidor.", ephemeral: true }).catch(() => {});
        return true;
      }

      const { cidade, nivel, nome, pasta, passaporte, dataHora } = pedido;

      const ehADM = [
  "adm",
  "responsaveis",
  "respstaff",
  "diretoria",
  "diretorcomunidade",
  "respadministrativo",
  "respwallstreet",
].includes(String(nivel).toLowerCase());

      const abrevCidade = ABREVIACOES_CIDADES[cidade] || String(cidade || "").toUpperCase();
      const finalNickname = ehADM ? `${abrevCidade} | ${nome}` : `${abrevCidade} | ${nome} | ${passaporte}`;

      const agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

      let dmFalhou = false;
      let extrasAplicados = [];

      if (acao === "aprovar") {
        const rolesParaAdd = [];

        if (CARGOS_CIDADES[cidade]) rolesParaAdd.push(CARGOS_CIDADES[cidade]);
        if (CARGOS_STAFF[nivel]) rolesParaAdd.push(CARGOS_STAFF[nivel]);

        // extras
        const extrasKeys = EXTRA_BY_LEVEL[nivel] || [];
        for (const k of extrasKeys) {
          const rid = CARGOS_STAFF[k];
          if (rid && !rolesParaAdd.includes(rid)) rolesParaAdd.push(rid);
        }

        // staff geral
        if (CFG.CARGO_STAFF_GERAL && !rolesParaAdd.includes(CFG.CARGO_STAFF_GERAL)) rolesParaAdd.push(CFG.CARGO_STAFF_GERAL);

        // aplica
        if (rolesParaAdd.length) await membro.roles.add(rolesParaAdd).catch(() => {});
        await membro.setNickname(finalNickname).catch(() => {});

        // quais extras entraram
        extrasAplicados = [];
        for (const k of extrasKeys) {
          const rid = CARGOS_STAFF[k];
          if (rid && rolesParaAdd.includes(rid)) extrasAplicados.push(k);
        }

        await membro
          .send(
            `✅ Seu set foi aprovado!\n\n` +
              `**Cidade:** ${String(cidade).toUpperCase()}\n` +
              `**Nível:** ${fmtNivelLabel(nivel)}\n` +
              `**Novo nome:** ${finalNickname}\n\n` +
              `Seja bem-vindo à equipe Staff da Santa Group! 💜`
          )
          .catch(() => {
            dmFalhou = true;
          });

        updateUltimoStatus(userIdTarget, "aprovado");
updateByMsgIdStatus(interaction.message?.id, "aprovado");

      } else {
        await membro
          .send(
            `❌ Seu pedido de set staff foi **reprovado**.\n` +
              `Motivo: Análise da equipe.\n\n` +
              `Caso tenha dúvidas, entre em contato com a liderança.`
          )
          .catch(() => {
            dmFalhou = true;
          });

        updateUltimoStatus(userIdTarget, "reprovado");
updateByMsgIdStatus(interaction.message?.id, "reprovado");

      }

      const extrasLabel = fmtExtrasLista(extrasAplicados);

      const embedFinal = new EmbedBuilder()
        .setTitle(`📋 Pedido de Set Staff ${acao === "aprovar" ? "Aprovado" : "Reprovado"}`)
        .setColor(acao === "aprovar" ? 0x00ff88 : 0xff5555)
        .setThumbnail(membro.displayAvatarURL())
        .addFields(
          { name: "👤 Nome:", value: nome || "—", inline: true },
          { name: "📁 Pasta:", value: pasta || "—", inline: true },
          { name: "🪪 Passaporte:", value: passaporte || "—", inline: true },
          { name: "🌆 Cidade:", value: fmtCidadeLabel(cidade), inline: true },
          { name: "📊 Nível Staff:", value: fmtNivelComMenção(nivel), inline: true },
          ...(acao === "aprovar" ? [{ name: "➕ Cargos extras adicionados:", value: extrasLabel, inline: false }] : []),
          { name: "🕒 Pedido feito em:", value: dataHora || "—", inline: false },
          {
            name: acao === "aprovar" ? "✅ Aprovado por:" : "❌ Reprovado por:",
            value: `<@${interaction.user.id}> em ${agora}`,
            inline: false,
          }
        )
        .setFooter({ text: `ID do usuário: ${userIdTarget}` });

      // edita a msg do registro (a própria interaction.message)
      await interaction.message
        .edit({ embeds: [embedFinal], components: [buildRowFinal(acao)] })
        .catch(() => {});

      // logzinho compact de extras (no próprio canal do registro)
      if (acao === "aprovar") {
        const canalRegistro = await resolveLogChannel(client, CFG.CANAL_REGISTRO);
        if (canalRegistro) {
          await canalRegistro
            .send({ content: `🧩 **Extras adicionados** para <@${userIdTarget}>: ${extrasLabel}`, allowedMentions: { parse: ["users"] } })
            .catch(() => {});
        }
      }

      // feedback
      ST.pedidosMap.delete(userIdTarget);

await interaction
  .followUp({
    content: `✔️ Pedido ${acao === "aprovar" ? "aprovado" : "reprovado"} com sucesso.${dmFalhou ? " (⚠️ DM não foi.)" : ""}`,
    ephemeral: true,
  })
  .catch(() => {});

return true;
    }

    return false;
  } catch (e) {
    console.error("[SETSTAFF_V2] HandleInteraction erro:", e);
    // tenta responder se ainda der
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.reply({ content: "⚠️ Deu erro ao processar o Set Staff.", ephemeral: true });
      }
    } catch {}
    return true;
  }
}
