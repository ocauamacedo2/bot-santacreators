// d:\santacreators-main\events\reuniaoSemanal.js
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
  PermissionsBitField,
} from "discord.js";
import { createVipRecordProgrammatically } from "./vipRegistro.js";

// ================= CONFIGURAÇÃO =================
const ADMIN_CHANNEL_ID = "1480351746562981999"; // Canal Robusto (Resp)
const PUBLIC_CHANNEL_ID = "1469726935247487078"; // Canal Resumo (Público)

// ✅ Cargo obrigatório para a pessoa ser considerada ativa na gestão/ranking
const ROLE_REQUIRED_FOR_ACTIVE = "1352275728476930099";

// Cargos de Gestão (Permissão para mexer no painel)
// VIPs (Podem sempre): Owner, Eu, Resp Creators
const VIP_USERS = ["660311795327828008", "1262262852949905408"];
const VIP_ROLES = ["1352408327983861844"]; // Resp Creators

// Restritos (Só Sábado): Resp Influ, Resp Lider
const SATURDAY_ROLES = ["1262262852949905409", "1352407252216184833"];

// Cargos de Premiação (IDs para setar automaticamente)
const ROLES_REWARD = {
  CREATOR_DESTAQUE: "1368422518326562967", // Santa Creators
  DESTAQUE_NOBRE: "1368422518326562967",   // Nobre (Placeholder)
  MASTER_MANAGER: "1423106042908250122",
  MASTER_EVENTOS: "1410385283542810766",
};

// Caminhos dos dados
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = process.cwd();

function pickPersistRoot() {
  const candidates = [
    process.env.SQUARECLOUD_STORAGE_PATH?.trim(),
    "/storage",
    "/home/container/storage",
    "/home/squarecloud/storage",
  ].filter(Boolean);

  for (const dir of candidates) {
    try { if (fs.existsSync(dir)) return dir; } catch {}
  }
  return null;
}

const DATA_DIR = path.resolve(pickPersistRoot() || path.join(__dirname, ".."), "data");

// Arquivos fixos
const FILES = {
  STATE: path.join(DATA_DIR, "reuniao_semanal_state.json"),
  GERAL_RANK: path.join(DATA_DIR, "sc_geral_weekly_rank_state_v1.json"),
  // ✅ NOVO: Lê os dados por fonte do ranking semanal
  RANK_SOURCES: path.join(DATA_DIR, "sc_geral_weekly_rank_sources.json"),
};

// Nomes de arquivos dinâmicos (podem estar na raiz ou em data)
const DYNAMIC_FILES = {
  MANAGER: "reg_manager_weekly_stats.json",
  SOCIAL: "pay_evt_dash_stats.json",
  ALINH: "alinhamento_dash_state.json",
};

// ================= HELPERS DE ARQUIVO =================
function readJSON(file) {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

// ✅ Leitura dinâmica: Procura na raiz, se não achar, procura em data
function readDynamicJSON(filename) {
  const inRoot = path.join(ROOT_DIR, filename);
  const inData = path.join(DATA_DIR, filename);
  
  if (fs.existsSync(inRoot)) return JSON.parse(fs.readFileSync(inRoot, "utf8"));
  if (fs.existsSync(inData)) return JSON.parse(fs.readFileSync(inData, "utf8"));
  return null;
}

function saveState(data) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILES.STATE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("[ReuniaoSemanal] Erro ao salvar state:", e);
  }
}

function loadState() {
  const def = {
    pautas: [],
    lastWinners: { geral: null, manager: null, social: null },
    panelMessageId: null,
    weekKey: null,
  };
  const data = readJSON(FILES.STATE);
  return { ...def, ...data };
}

// ================= FILTRO DE MEMBROS ATIVOS =================
async function hasRequiredActiveRole(guild, userId) {
  try {
    if (!guild || !userId) return false;
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return false;
    return member.roles.cache.has(ROLE_REQUIRED_FOR_ACTIVE);
  } catch {
    return false;
  }
}

async function filterRankingByActiveRole(list, guild) {
  if (!Array.isArray(list) || list.length === 0) return [];

  const filtered = [];
  for (const item of list) {
    if (!item?.id) continue;

    const isActive = await hasRequiredActiveRole(guild, item.id);
    if (isActive) {
      filtered.push(item);
    }
  }

  return filtered;
}

// ================= LÓGICA DE DADOS (TIMEZONE SAFE) =================
const TIME_LOCAL = (() => {
  const TZ = "America/Sao_Paulo";
  function nowInSP() {
    const date = new Date();
    const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
    return new Date(utc + (3600000 * -3));
  }
  function startOfDaySP(dateUTC) {
    return new Date(Date.UTC(dateUTC.getUTCFullYear(), dateUTC.getUTCMonth(), dateUTC.getUTCDate()));
  }
  function addDays(dateUTC, n) {
    const x = new Date(dateUTC.getTime());
    x.setUTCDate(x.getUTCDate() + n);
    return x;
  }
  function getCurrentWeekKey() {
    const now = nowInSP();
    const dow = now.getUTCDay(); // 0=Dom
    const sunday = startOfDaySP(addDays(now, -dow));
    return sunday.toISOString().slice(0, 10);
  }
  function getPreviousWeekKey() {
    const currentWeekKey = getCurrentWeekKey();
    const [year, month, day] = currentWeekKey.split("-").map(Number);
    const currentSunday = new Date(Date.UTC(year, month - 1, day));
    const previousSunday = addDays(currentSunday, -7);
    return previousSunday.toISOString().slice(0, 10);
  }

  return { getCurrentWeekKey, getPreviousWeekKey, nowInSP };
})();

async function aggregateData(guild, forcedWeekKey = null) {
  const wk = forcedWeekKey || TIME_LOCAL.getCurrentWeekKey();
  
  console.log(`[ReuniaoSemanal] Buscando dados para semana: ${wk}`);

  // 1. GERAL
  const geralData = readJSON(FILES.GERAL_RANK);
  let topGeral = [];
  if (geralData?.sigByWeek?.[wk]) {
    try {
      const parsed = JSON.parse(geralData.sigByWeek[wk]);
      topGeral = parsed.list
        .map(([id, pts]) => ({ id, pts }))
        .sort((a, b) => b.pts - a.pts);
    } catch {}
  }

  // 2. MANAGER
  const mgrData = readDynamicJSON(DYNAMIC_FILES.MANAGER);
  const mgrWeek = mgrData?.weeks?.[wk]?.approvedForManager || {};
  let topManager = Object.entries(mgrWeek)
    .map(([id, pts]) => ({ id, pts }))
    .sort((a, b) => b.pts - a.pts);

  // 3. SOCIAL
  // ✅ FIX: Lê os dados do arquivo de fontes do ranking, que é atualizado
  const sourcesData = readJSON(FILES.RANK_SOURCES);
  const bySourceByUser = sourcesData?.[wk] || {};
  const socialPoints = {};

  // ✅ Fontes que contam para o ranking "Social"
  const socialSources = new Set([
    "pagamentos",     // do pagamentosocial.js
    "halldafama",     // do hallDaFama.js
    "eventopoder",    // do registroevento.js (poderes em evento)
    "cronograma",     // do cronograma (geral)
    "eventosdiarios"  // do cronograma (eventos diários)
  ]);

  for (const userId in bySourceByUser) {
    const userSources = bySourceByUser[userId] || {};
    let userSocialPoints = 0;

    for (const source in userSources) {
      if (socialSources.has(source)) {
        userSocialPoints += Number(userSources[source] || 0);
      }
    }

    if (userSocialPoints > 0) {
      socialPoints[userId] = userSocialPoints;
    }
  }

  let topSocial = Object.entries(socialPoints)
    .map(([id, pts]) => ({ id, pts }))
    .sort((a, b) => b.pts - a.pts);

  // 4. ALINHAMENTOS
  const alinhData = readDynamicJSON(DYNAMIC_FILES.ALINH);
  const alinhWeek = alinhData?.weeks?.[wk]?.counts || {};
  let topAlinh = Object.entries(alinhWeek)
    .map(([id, pts]) => ({ id, pts }))
    .sort((a, b) => b.pts - a.pts);

  // ✅ FILTRO FINAL:
  // só entra nos rankings quem AINDA possui o cargo obrigatório de ativo
  topGeral = await filterRankingByActiveRole(topGeral, guild);
  topManager = await filterRankingByActiveRole(topManager, guild);
  topSocial = await filterRankingByActiveRole(topSocial, guild);
  topAlinh = await filterRankingByActiveRole(topAlinh, guild);

  // ✅ IMPORTANTE: retornar bySourceByUser pro gráfico conseguir ler as fontes
  return {
    topGeral,
    topManager,
    topSocial,
    topAlinh,
    bySourceByUser,
    wk,
  };
}

function calculateWinners(data) {
  const pickFirstAvailable = (list, blockedIds = new Set()) => {
    if (!Array.isArray(list) || list.length === 0) return null;

    for (const item of list) {
      if (!item?.id) continue;
      if (!blockedIds.has(item.id)) {
        return item;
      }
    }

    // ✅ Se todos os colocados já estiverem bloqueados, mantém o primeiro válido
    // para não deixar a categoria vazia.
    return list.find((item) => item?.id) || null;
  };

  const winnerGeral = pickFirstAvailable(data.topGeral);

  const usedIds = new Set();
  if (winnerGeral?.id) usedIds.add(winnerGeral.id);

  const winnerManager = pickFirstAvailable(data.topManager, usedIds);
  if (winnerManager?.id) usedIds.add(winnerManager.id);

  const winnerSocial = pickFirstAvailable(data.topSocial, usedIds);

  return { winnerGeral, winnerManager, winnerSocial };
}

// ================= CHART BUILDER =================
async function generateWeeklyChartUrl(data, guild) {
  const topUsers = (data?.topGeral || []).slice(0, 10).reverse(); // Inverte para o gráfico horizontal
  if (topUsers.length === 0) {
    return "https://quickchart.io/chart?c=%7Btype%3A%27bar%27%2Cdata%3A%7Blabels%3A%5B%27Semana%27%5D%2Cdatasets%3A%5B%7Blabel%3A%27Pontos%27%2Cdata%3A%5B0%5D%7D%5D%7D%2Coptions%3A%7Btitle%3A%7Bdisplay%3Atrue%2Ctext%3A%27Nenhum+dado+dispon%C3%ADvel+para+a+semana%27%7D%7D%7D";
  }

  const userIds = topUsers.map((u) => u.id);
  const nameMap = {};

  // Busca nomes dos usuários na guild correta
  if (guild) {
    await Promise.all(
      userIds.map(async (uid) => {
        try {
          const member = await guild.members.fetch(uid).catch(() => null);

          if (member) {
            nameMap[uid] = member.displayName || member.user?.globalName || member.user?.username || `Usuário ${uid.slice(-4)}`;
          } else {
            nameMap[uid] = `Usuário ${uid.slice(-4)}`;
          }
        } catch {
          nameMap[uid] = `Usuário ${uid.slice(-4)}`;
        }
      })
    );
  }

  const labels = topUsers.map((u) => (nameMap[u.id] || `Usuário ${u.id.slice(-4)}`).slice(0, 22));

  const managerPoints = [];
  const socialPoints = [];
  const otherPoints = [];

  const socialSources = new Set([
    "pagamentos",
    "halldafama",
    "eventopoder",
    "cronograma",
    "eventosdiarios",
  ]);

  const bySourceByUser = data?.bySourceByUser || {};

  for (const user of topUsers) {
    const userId = user.id;
    const sources = bySourceByUser[userId] || {};

    const mgrPts = Number(sources.manager || 0);

    let socPts = 0;
    for (const source in sources) {
      if (socialSources.has(source)) {
        socPts += Number(sources[source] || 0);
      }
    }

    const totalPts = Number(user.pts || 0);
    const otherPts = totalPts - mgrPts - socPts;

    managerPoints.push(mgrPts);
    socialPoints.push(socPts);
    otherPoints.push(Math.max(0, otherPts));
  }

  const config = {
    type: "horizontalBar",
    data: {
      labels,
      datasets: [
        {
          label: "Manager",
          data: managerPoints,
          backgroundColor: "#3498db",
        },
        {
          label: "Social",
          data: socialPoints,
          backgroundColor: "#e91e63",
        },
        {
          label: "Outros",
          data: otherPoints,
          backgroundColor: "#95a5a6",
        },
      ],
    },
    options: {
      title: {
        display: true,
        text: "Top 10 Pontuadores da Semana por Categoria",
      },
      legend: {
        position: "top",
      },
      scales: {
        xAxes: [
          {
            stacked: true,
            ticks: {
              beginAtZero: true,
              precision: 0,
            },
          },
        ],
        yAxes: [
          {
            stacked: true,
            ticks: {
              fontSize: 14,
            },
          },
        ],
      },
      plugins: {
        datalabels: {
          color: "white",
          font: { weight: "bold", size: 14 },
          formatter: (value) => (value > 0 ? value : ""),
        },
      },
    },
  };

  return `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(config))}&width=1000&height=650&backgroundColor=white`;
}

// ================= EMBED SPLIT HELPERS =================
const DISCORD_LIMITS = {
  EMBED_DESCRIPTION: 3900,
  MAX_EMBEDS_PER_MESSAGE: 10,
};

function splitTextIntoChunks(text, maxLength = DISCORD_LIMITS.EMBED_DESCRIPTION) {
  const safeText = String(text || "").trim();
  if (!safeText) return [];

  const chunks = [];
  let current = "";

  const blocks = safeText.split(/\n{2,}/);

  for (const block of blocks) {
    const cleanBlock = block.trim();
    if (!cleanBlock) continue;

    const candidate = current ? `${current}\n\n${cleanBlock}` : cleanBlock;

    if (candidate.length <= maxLength) {
      current = candidate;
      continue;
    }

    if (current.trim()) {
      chunks.push(current.trim());
      current = "";
    }

    if (cleanBlock.length <= maxLength) {
      current = cleanBlock;
      continue;
    }

    for (let i = 0; i < cleanBlock.length; i += maxLength) {
      chunks.push(cleanBlock.slice(i, i + maxLength));
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks;
}

function buildPautasText(state, withNumbers = true) {
  if (!state.pautas || state.pautas.length === 0) {
    return "_Nenhuma pauta registrada ainda._";
  }

  return state.pautas
    .map((p, i) => {
      const title = String(p.title || `Pauta ${i + 1}`).trim();
      const desc = String(p.desc || "—").trim();
      const prefix = withNumbers ? `**${i + 1}. ${title}**` : `📌 **${title}**`;

      return `${prefix}\n${desc}`;
    })
    .join("\n\n");
}

function buildPautasEmbeds(state, color = "#2b2d31") {
  const pautasText = buildPautasText(state, true);
  const chunks = splitTextIntoChunks(pautasText, DISCORD_LIMITS.EMBED_DESCRIPTION);
  const safeChunks = chunks.slice(0, DISCORD_LIMITS.MAX_EMBEDS_PER_MESSAGE - 1);

  return safeChunks.map((chunk, index) => {
    return new EmbedBuilder()
      .setTitle(safeChunks.length > 1 ? `📌 Pautas da Reunião — Parte ${index + 1}` : "📌 Pautas da Reunião")
      .setColor(color)
      .setDescription(chunk)
      .setFooter({ text: "SantaCreators • Pautas completas da reunião" })
      .setTimestamp();
  });
}

// ================= UI BUILDERS =================
function buildAdminEmbeds(state, data, winners) {
  const fmtUser = (w) => w ? `<@${w.id}> (**${w.pts}** pts)` : "—";
  
  const fmtTop = (list, limit = 5) => {
    if (!list || list.length === 0) return "_Sem dados_";
    return list.slice(0, limit).map((x, i) => `\`${i + 1}.\` <@${x.id}> — **${x.pts} pts**`).join("\n");
  };

  const totalPautas = state.pautas?.length || 0;
  const totalGeral = data.topGeral?.length || 0;
  const totalManager = data.topManager?.length || 0;
  const totalSocial = data.topSocial?.length || 0;
  const totalAlinh = data.topAlinh?.length || 0;

  const mainEmbed = new EmbedBuilder()
    .setTitle("📢 Painel de Reunião Semanal (Admin)")
    .setColor("#2b2d31")
    .setDescription(
      `**Semana:** \`${data.wk}\`\n` +
      `**Total de pautas registradas:** \`${totalPautas}\`\n\n` +

      `# 📊 Dashboard Geral da Reunião\n\n` +

      `## 🏆 Vencedores Calculados\n` +
      `🏆 **Creator Destaque (Geral):** ${fmtUser(winners.winnerGeral)}\n` +
      `📞 **Master Manager:** ${fmtUser(winners.winnerManager)}\n` +
      `📢 **Master Eventos:** ${fmtUser(winners.winnerSocial)}\n\n` +

      `## 📌 Totais Encontrados\n` +
      `• **Ranking Geral:** \`${totalGeral}\` membro(s)\n` +
      `• **Ranking Manager:** \`${totalManager}\` membro(s)\n` +
      `• **Ranking Social/Eventos:** \`${totalSocial}\` membro(s)\n` +
      `• **Ranking Alinhamentos:** \`${totalAlinh}\` membro(s)\n\n` +

      `━━━━━━━━━━━━━━━━━━━━━━\n\n` +

      `## 🥇 Top 5 Geral\n${fmtTop(data.topGeral, 5)}\n\n` +
      `## 📞 Top 5 Manager\n${fmtTop(data.topManager, 5)}\n\n` +
      `## 📢 Top 5 Social/Eventos\n${fmtTop(data.topSocial, 5)}\n\n` +
      `## 🧩 Top 5 Alinhadores\n${fmtTop(data.topAlinh, 5)}\n\n` +

      `━━━━━━━━━━━━━━━━━━━━━━\n\n` +

      `## ⚠️ Instruções Pós-Reunião\n` +
      `1. Conferir se os vencedores estão corretos.\n` +
      `2. Verificar quem subiu, desceu ou precisa de alinhamento.\n` +
      `3. Resolver pendências citadas nas pautas.\n` +
      `4. Conferir cargos e permissões antes de publicar.\n` +
      `5. Clicar em **"✅ Publicar & Aplicar Cargos"** apenas quando tudo estiver validado.`
    )
    .setFooter({ text: "Somente Responsáveis podem ver e editar isso." })
    .setTimestamp();

  const pautaEmbeds = buildPautasEmbeds(state, "#2b2d31");

  return [mainEmbed, ...pautaEmbeds];
}

async function buildPublicEmbeds(state, data, winners, guild) {
  const fmtUser = (w) => (w ? `<@${w.id}>` : "—");

  const fmtTop3 = (list) => {
    if (!list || list.length === 0) return "—";
    return list.slice(0, 3).map((x, i) => `\`${i + 1}.\` <@${x.id}> (${x.pts})`).join("\n");
  };

  const top3Alinh = fmtTop3(data.topAlinh);
  const chartUrl = await generateWeeklyChartUrl(data, guild);

  const mainEmbed = new EmbedBuilder()
    .setTitle("📝 Resumo da Reunião Semanal")
    .setColor("#9b59b6")
    .setImage(chartUrl)
    .setThumbnail("https://media.discordapp.net/attachments/1362477839944777889/1384245215249825832/standard_2rss.gif")
    .setDescription(
      `Confira os destaques da semana!\n\n` +
      `# ⭐ Destaques da Semana\n\n` +
      `## 🥇 Top 1 Geral (Creator Destaque)\n` +
      `> ${fmtUser(winners.winnerGeral)}\n` +
      `*Recebe: VIP Evento (7 dias) + Cargo Creator Destaque*\n\n` +
      `## 📞 Master de Manager (Mais ORGs)\n` +
      `> ${fmtUser(winners.winnerManager)}\n` +
      `*Recebe: VIP Evento (7 dias) + Cargo Master de Manager*\n\n` +
      `## 📢 Master de Eventos (Social Media)\n` +
      `> ${fmtUser(winners.winnerSocial)}\n` +
      `*Recebe: VIP Evento (7 dias) + Cargo Master de Eventos*\n\n` +
      `## 🧩 Top Alinhadores\n${top3Alinh}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `## 📌 Pautas Abordadas\n` +
      `As pautas completas estão nos embeds abaixo, separadas em partes para não cortar nenhuma informação.\n\n` +
      `*Parabéns a todos pelo empenho! Vamos com tudo para a próxima semana.* 🚀`
    )
    .setFooter({ text: "SantaCreators • Reunião Semanal" })
    .setTimestamp();

  const pautaEmbeds = buildPautasEmbeds(state, "#9b59b6");

  return [mainEmbed, ...pautaEmbeds];
}


function buildAdminRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("reuniao_add_pauta").setLabel("➕ Adicionar Pauta").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("reuniao_clear_pautas").setLabel("🧹 Limpar Pautas").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("reuniao_refresh").setLabel("🔄 Atualizar Dados").setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("reuniao_publish").setLabel("✅ Publicar & Aplicar Cargos").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("reuniao_publish_previous_week").setLabel("↩️ Publicar Semana Anterior").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("reuniao_publish_no_roles").setLabel("📢 Publicar (Sem Cargos)").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("reuniao_force_roles").setLabel("⚡ Forçar Set de Cargos").setStyle(ButtonStyle.Danger)
    )
  ];
}

// ================= LOGIC =================

async function updateAdminPanel(client) {
  try {
    const channel = await client.channels.fetch(ADMIN_CHANNEL_ID).catch(() => null);
    if (!channel) {
      console.error(`[ReuniaoSemanal] ❌ Canal ADMIN ${ADMIN_CHANNEL_ID} não encontrado.`);
      return false;
    }

    const state = loadState();
    const data = await aggregateData(channel.guild);
    const winners = calculateWinners(data);

    const embeds = buildAdminEmbeds(state, data, winners);
    const rows = buildAdminRows();

    if (state.panelMessageId) {
      const msg = await channel.messages.fetch(state.panelMessageId).catch(() => null);
      if (msg) {
        await msg.edit({ embeds, components: rows });
        return true;
      }
    }

    const newMsg = await channel.send({ embeds, components: rows });
    state.panelMessageId = newMsg.id;
    saveState(state);
    return true;
  } catch (e) {
    console.error("[ReuniaoSemanal] Erro no updateAdminPanel:", e);
    return false;
  }
}

async function removeRewardRoleFromEveryoneExcept(guild, roleId, keepUserId, roleName, log) {
  try {
    const role = await guild.roles.fetch(roleId).catch(() => null);
    if (!role) {
      log.push(`⚠️ Cargo **${roleName}** não encontrado no servidor.`);
      return;
    }

    await guild.members.fetch().catch((e) => {
      console.error(`[ReuniaoSemanal] Falha ao carregar membros antes de limpar ${roleName}:`, e);
    });

    const membersWithRole = guild.members.cache.filter((member) => {
      return member?.roles?.cache?.has(roleId);
    });

    if (membersWithRole.size === 0) {
      log.push(`ℹ️ Nenhum membro antigo encontrado com **${roleName}**.`);
      return;
    }

    for (const member of membersWithRole.values()) {
      if (!member?.id) continue;

      if (keepUserId && String(member.id) === String(keepUserId)) {
        log.push(`🔒 Mantido **${roleName}** em <@${member.id}> porque é o vencedor atual.`);
        continue;
      }

      try {
        await member.roles.remove(roleId, `[ReuniaoSemanal] Limpando cargo antigo de ${roleName}`);

        const updatedMember = await guild.members.fetch(member.id).catch(() => null);
        if (updatedMember?.roles?.cache?.has(roleId)) {
          log.push(`⚠️ Tentativa feita, mas **${roleName}** ainda está em <@${member.id}>. Verifique hierarquia/permissão do bot.`);
        } else {
          log.push(`🔻 Removido **${roleName}** de <@${member.id}>`);
        }
      } catch (e) {
        console.error(`[ReuniaoSemanal] Falha ao remover ${roleName} de ${member.id}:`, e);
        log.push(`❌ Falha ao remover **${roleName}** de <@${member.id}>. Verifique hierarquia/permissão do bot.`);
      }
    }
  } catch (e) {
    console.error(`[ReuniaoSemanal] Erro ao limpar cargo ${roleName}:`, e);
    log.push(`❌ Erro ao limpar cargo **${roleName}**.`);
  }
}

async function applyRoles(guild, winners, state) {
  const log = [];

  await guild.members.fetch().catch((e) => {
    console.error("[ReuniaoSemanal] Falha ao carregar membros para limpar cargos antigos:", e);
  });

  await removeRewardRoleFromEveryoneExcept(
    guild,
    ROLES_REWARD.CREATOR_DESTAQUE,
    winners.winnerGeral?.id || null,
    "Creator Destaque",
    log
  );

  await removeRewardRoleFromEveryoneExcept(
    guild,
    ROLES_REWARD.MASTER_MANAGER,
    winners.winnerManager?.id || null,
    "Master Manager",
    log
  );

  await removeRewardRoleFromEveryoneExcept(
    guild,
    ROLES_REWARD.MASTER_EVENTOS,
    winners.winnerSocial?.id || null,
    "Master Eventos",
    log
  );

  const add = async (w, roleId, name) => {
    if (!w?.id) return;

    const m = await guild.members.fetch(w.id).catch(() => null);
    if (!m) return;

    // ✅ Segurança extra: só aplica prêmio se ainda estiver com cargo de ativo
    if (!m.roles.cache.has(ROLE_REQUIRED_FOR_ACTIVE)) {
      log.push(`⏭️ **${name}** não aplicado para <@${w.id}> porque não possui o cargo obrigatório de ativo.`);
      return;
    }

    await m.roles.add(roleId).catch(() => {});
    log.push(`✅ Adicionado **${name}** para <@${w.id}>`);
    m.send(`🎉 **Parabéns!** Você foi destaque da semana como **${name}**!\nO cargo foi adicionado ao seu perfil. Continue brilhando! 🚀`).catch(() => {});
  };

  await add(winners.winnerGeral, ROLES_REWARD.CREATOR_DESTAQUE, "Creator Destaque");
  await add(winners.winnerManager, ROLES_REWARD.MASTER_MANAGER, "Master Manager");
  await add(winners.winnerSocial, ROLES_REWARD.MASTER_EVENTOS, "Master Eventos");

  state.lastWinners = {
    geral: winners.winnerGeral?.id || null,
    manager: winners.winnerManager?.id || null,
    social: winners.winnerSocial?.id || null
  };
  saveState(state);

  return log;
}

// ================= PERMISSIONS CHECK =================
function checkPermissions(interaction) {
  const { user, member } = interaction;
  
  // 1. VIPs (Sempre podem)
  if (VIP_USERS.includes(user.id)) return true;
  if (member.roles.cache.some(r => VIP_ROLES.includes(r.id))) return true;

  // 2. Restritos (Só Sábado)
  const now = TIME_LOCAL.nowInSP();
  const isSaturday = now.getDay() === 6; // 6 = Sábado

  if (isSaturday) {
    if (member.roles.cache.some(r => SATURDAY_ROLES.includes(r.id))) return true;
  }

  return false;
}

// ================= EXPORTS =================

export async function reuniaoSemanalOnReady(client) {
  console.log("[ReuniaoSemanal] Iniciando...");
  await updateAdminPanel(client);
  setInterval(() => updateAdminPanel(client), 10 * 60 * 1000);
}

export async function reuniaoSemanalHandleMessage(message, client) {
  if (!message.guild || message.author.bot) return false;
  
  // ✅ COMANDO MANUAL PARA FORÇAR O PAINEL
  if (message.content === "!painelreuniao") {
    if (!VIP_USERS.includes(message.author.id)) {
      await message.reply("❌ Sem permissão.");
      return true;
    }
    
    await message.reply("🔄 Tentando enviar/atualizar o painel...");
    const success = await updateAdminPanel(client);
    
    if (success) {
      await message.channel.send(`✅ Painel enviado/atualizado no canal <#${ADMIN_CHANNEL_ID}>.`);
    } else {
      await message.channel.send(`❌ Falha ao enviar. Verifique se o bot tem permissão no canal <#${ADMIN_CHANNEL_ID}> e se o ID está correto.`);
    }
    return true;
  }

  if (message.content === "!reuniao_painel") { // Alias antigo
    if (!VIP_USERS.includes(message.author.id)) return false;
    const state = loadState();
    state.panelMessageId = null; 
    saveState(state);
    await updateAdminPanel(client);
    message.reply("✅ Painel recriado.").then(m => setTimeout(() => m.delete(), 5000));
    return true;
  }
  return false;
}

export async function reuniaoSemanalHandleInteraction(interaction, client) {
  if (!interaction.guild) return false;
  if (!interaction.customId?.startsWith("reuniao_")) return false;

  // ✅ Verifica permissão (VIP ou Sábado)
  if (!checkPermissions(interaction)) {
    return interaction.reply({ content: "🚫 Você não tem permissão para usar isso agora (Restrito aos Sábados ou Cargos VIP).", ephemeral: true });
  }

  if (interaction.customId === "reuniao_add_pauta") {
    const modal = new ModalBuilder().setCustomId("reuniao_modal_pauta").setTitle("Adicionar Pauta");
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("pauta_title").setLabel("Título da Pauta").setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("pauta_desc").setLabel("Descrição / Detalhes").setStyle(TextInputStyle.Paragraph).setRequired(true))
    );
    await interaction.showModal(modal);
    return true;
  }

  if (interaction.isModalSubmit() && interaction.customId === "reuniao_modal_pauta") {
    const title = interaction.fields.getTextInputValue("pauta_title");
    const desc = interaction.fields.getTextInputValue("pauta_desc");
    const state = loadState();
    state.pautas.push({ title, desc });
    saveState(state);
    await updateAdminPanel(client);
    await interaction.reply({ content: "✅ Pauta adicionada!", ephemeral: true });
    return true;
  }

  if (interaction.customId === "reuniao_clear_pautas") {
    const state = loadState();
    state.pautas = [];
    saveState(state);
    await updateAdminPanel(client);
    await interaction.reply({ content: "🧹 Pautas limpas.", ephemeral: true });
    return true;
  }

  if (interaction.customId === "reuniao_refresh") {
    await interaction.deferReply({ ephemeral: true });
    await updateAdminPanel(client);
    await interaction.editReply("✅ Dados atualizados.");
    return true;
  }

    // ✅ PUBLICAR COM CARGOS
  if (interaction.customId === "reuniao_publish") {
    await interaction.deferReply({ ephemeral: true });
    const state = loadState();
    const data = await aggregateData(interaction.guild);
    const winners = calculateWinners(data);
    const logs = await applyRoles(interaction.guild, winners, state);
    
    // =================================================
    // ✅ GAMBIARRA: Registrar prêmios no vipRegistro.js
    // =================================================
    const registrarUser = interaction.user;
    const winnerRecords = [
        { winner: winners.winnerGeral, motivo: 'Creator Destaque' },
        { winner: winners.winnerManager, motivo: 'Master Manager' },
        { winner: winners.winnerSocial, motivo: 'Master Eventos' }
    ];

    let vipLogs = [];
    for (const record of winnerRecords) {
        if (record.winner && record.winner.id) {
            try {
                const member = await interaction.guild.members.fetch(record.winner.id);
                const nomeEquipe = `${member.displayName} | ${member.id}`;

                await createVipRecordProgrammatically(client, {
                    registrarUser: registrarUser,
                    beneficiarioRaw: record.winner.id,
                    tipoRaw: 'vipevento2', // Conforme solicitado
                    cidadeRaw: 'nobre', // ✅ Sempre Nobre conforme seu pedido
                    motivoRegistro: record.motivo,
                    nomeEquipe: nomeEquipe
                });
                vipLogs.push(`- Registro VIP para ${record.motivo}: <@${record.winner.id}>`);
            } catch (e) {
                console.error(`[ReuniaoSemanal] Falha ao registrar VIP para ${record.motivo}:`, e);
                vipLogs.push(`- ❌ Falha ao registrar VIP para ${record.motivo}`);
            }
        }
    }
    // =================================================

    let publicMessageSent = false;
    let publicMessageError = "";
    try {
      const publicChannel = await client.channels.fetch(PUBLIC_CHANNEL_ID).catch(() => null);
      if (publicChannel) {
        const publicEmbeds = await buildPublicEmbeds(state, data, winners, interaction.guild);
        await publicChannel.send({ content: "@everyone Resumo da Reunião Semanal:", embeds: publicEmbeds });
        publicMessageSent = true;
      } else {
        publicMessageError = "Canal público não encontrado.";
      }
    } catch (e) {
      console.error("[ReuniaoSemanal] Erro ao enviar mensagem pública:", e);
      publicMessageError = e.message;
    }

    const finalLogMessage = `✅ **Reunião Publicada!**\n\n` +
      `📜 **Logs de Cargos:**\n${logs.join("\n") || "Nenhuma alteração."}\n\n` +
      `💎 **Registros de Premiação:**\n${vipLogs.join('\n') || 'Nenhum prêmio registrado.'}\n\n` +
      `${publicMessageSent ? '📢 Resumo enviado no canal público.' : `⚠️ **Falha ao enviar resumo no canal público.**\n> Motivo: ${publicMessageError}`}`;
      
    await interaction.editReply({ content: finalLogMessage });
    return true;
  }

    // ✅ NOVO: PUBLICAR SEM CARGOS
  if (interaction.customId === "reuniao_publish_no_roles") {
    await interaction.deferReply({ ephemeral: true });
    const state = loadState();
    const data = await aggregateData(interaction.guild);
    const winners = calculateWinners(data);
    
    // Não chama applyRoles
    
    let publicMessageSent = false;
    let publicMessageError = "";
    try {
      const publicChannel = await client.channels.fetch(PUBLIC_CHANNEL_ID).catch(() => null);
      if (publicChannel) {
        const publicEmbeds = await buildPublicEmbeds(state, data, winners, interaction.guild);
        await publicChannel.send({ content: "@everyone Resumo da Reunião Semanal (Sem alteração de cargos):", embeds: publicEmbeds });
        publicMessageSent = true;
      } else {
        publicMessageError = "Canal público não encontrado.";
      }
    } catch (e) {
      console.error("[ReuniaoSemanal] Erro ao enviar mensagem pública (sem cargos):", e);
      publicMessageError = e.message;
    }

    const finalLogMessage = `📢 **Reunião Publicada (Apenas Texto)!**\nNenhum cargo foi alterado.\n\n` +
      `${publicMessageSent ? '📢 Resumo enviado no canal público.' : `⚠️ **Falha ao enviar resumo no canal público.**\n> Motivo: ${publicMessageError}`}`;

    await interaction.editReply({ content: finalLogMessage });
    return true;
  }
  if (interaction.customId === "reuniao_publish_previous_week") {
    await interaction.deferReply({ ephemeral: true });

    const state = loadState();
    const previousWeekKey = TIME_LOCAL.getPreviousWeekKey();

    state.previousWeekPublished = state.previousWeekPublished || {};

    if (state.previousWeekPublished[previousWeekKey]) {
      await interaction.editReply({
        content: `⚠️ A semana anterior \`${previousWeekKey}\` já foi publicada por esse botão.\nSe precisar refazer mesmo assim, use o botão normal ou limpe essa chave no arquivo de state.`
      });
      return true;
    }

const data = await aggregateData(interaction.guild, previousWeekKey);
const winners = calculateWinners(data);
const logs = [
  "ℹ️ Semana anterior publicada sem aplicar cargos.",
  "✅ Os cargos de destaque permanecem reservados apenas para a semana atual."
];

    const registrarUser = interaction.user;
    const winnerRecords = [
      { winner: winners.winnerGeral, motivo: "Creator Destaque" },
      { winner: winners.winnerManager, motivo: "Master Manager" },
      { winner: winners.winnerSocial, motivo: "Master Eventos" }
    ];

    let vipLogs = [];

    for (const record of winnerRecords) {
      if (record.winner && record.winner.id) {
        try {
          const member = await interaction.guild.members.fetch(record.winner.id);
          const nomeEquipe = `${member.displayName} | ${member.id}`;

          await createVipRecordProgrammatically(client, {
            registrarUser: registrarUser,
            beneficiarioRaw: record.winner.id,
            tipoRaw: "vipevento2",
            cidadeRaw: "nobre",
            motivoRegistro: `${record.motivo} | Semana anterior ${previousWeekKey}`,
            nomeEquipe: nomeEquipe
          });

          vipLogs.push(`- Registro VIP para ${record.motivo}: <@${record.winner.id}>`);
        } catch (e) {
          console.error(`[ReuniaoSemanal] Falha ao registrar VIP para ${record.motivo}:`, e);
          vipLogs.push(`- ❌ Falha ao registrar VIP para ${record.motivo}`);
        }
      }
    }

    let publicMessageSent = false;
    let publicMessageError = "";

    try {
      const publicChannel = await client.channels.fetch(PUBLIC_CHANNEL_ID).catch(() => null);

      if (publicChannel) {
        const publicEmbeds = await buildPublicEmbeds(state, data, winners, interaction.guild);
        await publicChannel.send({
          content: `@everyone Resumo da Reunião Semanal — Semana anterior \`${previousWeekKey}\`:`,
          embeds: publicEmbeds
        });

        publicMessageSent = true;
      } else {
        publicMessageError = "Canal público não encontrado.";
      }
    } catch (e) {
      console.error("[ReuniaoSemanal] Erro ao enviar mensagem pública da semana anterior:", e);
      publicMessageError = e.message;
    }

    state.previousWeekPublished[previousWeekKey] = {
      at: Date.now(),
      by: interaction.user.id
    };
    saveState(state);

    const finalLogMessage = `↩️ **Semana anterior publicada!**\n\n` +
      `📅 **Semana recuperada:** \`${previousWeekKey}\`\n\n` +
      `📜 **Logs de Cargos:**\n${logs.join("\n") || "Nenhuma alteração."}\n\n` +
      `💎 **Registros de Premiação:**\n${vipLogs.join("\n") || "Nenhum prêmio registrado."}\n\n` +
      `${publicMessageSent ? "📢 Resumo enviado no canal público." : `⚠️ **Falha ao enviar resumo no canal público.**\n> Motivo: ${publicMessageError}`}`;

    await interaction.editReply({ content: finalLogMessage });
    return true;
  }

  if (interaction.customId === "reuniao_force_roles") {
    await interaction.deferReply({ ephemeral: true });
    const state = loadState();
    const data = await aggregateData(interaction.guild);
    const winners = calculateWinners(data);
    const logs = await applyRoles(interaction.guild, winners, state);
    await interaction.editReply({ content: `⚡ **Cargos Forçados!**\n\n${logs.join("\n") || "Nenhuma alteração."}` });
    return true;
  }

  return false;
}
