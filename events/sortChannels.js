

// application/commands/canais/sortChannels.js
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ChannelType,
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
} from "discord.js";

// ===============================
// SANTA CREATORS — ORDENAR CANAIS POR NOME (A→Z) + PINNED NO TOPO
// • Supervisor a cada 30s + reage em ChannelCreate/ChannelUpdate
// • Ignora threads e categorias
// • Ordena só “primeira camada” da categoria
// ===============================

// ===============================
// CONFIGURAÇÃO DE GRUPOS DE ORDENAÇÃO (CROSS-CATEGORY)
// ===============================
const SORT_GROUPS = [
  {
    id: "INATIVOS",
    categories: [
      { id: "1383899907244425246", limit: 50 },
      { id: "1410071955159122051", limit: 50 },
      { id: "1477566945598640251", limit: 50 },
    ],
    sticky: []
  },
{
  id: "LIDERES",
  categories: [
    { id: "1414687963161559180", limit: 30 }, // ✅ 1ª categoria: máximo 30 canais
    { id: "1428572742051168378", limit: 50 }, // ✅ 2ª categoria: recebe continuação
    { id: "1482874296685695118", limit: 50 }, // ✅ 3ª categoria: recebe overflow final
  ],
  sticky: ["1414718336826081330", "1414718856542421052"] // ✅ Fixos no topo
},
  {
    id: "ADMIN_LOGS",
    strategy: "balance", // ✅ Divide igualmente entre as categorias
    categories: [
      { id: "1362540577706737866", limit: 50, prefix: "📁┋" },
      { id: "1475235932931096796", limit: 50, prefix: "📁┋" },
    ],
    sticky: []
  }
];

// ===============================
// ===============================
// ===============================
// CONFIGURAÇÃO DO COMANDO !INATIVO / !REATIVAR
// ===============================
const INATIVO_CONFIG = {
  // Autorizados da lógica padrão
  ALLOWED_USERS: [
    "660311795327828008", // Eu
    "1262262852949905408", // Owner
  ],
  ALLOWED_ROLES: [
    "1352408327983861844", // Resp Creators
    "1262262852949905409", // Resp Influ
    "1352407252216184833", // Resp Lider
    "1282119104576098314", // Mkt Creators
  ],

  // Autorizados da lógica especial (qualquer categoria/canal)
  SPECIAL_AUTHORIZED_USERS: [
    "660311795327828008", // Eu
    "1262262852949905408", // Owner
  ],
  SPECIAL_AUTHORIZED_ROLES: [
    "1352408327983861844", // Resp Creators (Apenas este cargo + usuários especiais têm acesso global)
  ],

  // ✅ Permissão contextual extra
  // • Dentro destas categorias, quem estiver nelas poderá usar o fluxo extra
  // • Se quiser também exigir um cargo extra real, coloque o ID correto do cargo abaixo
  EXTRA_COMMAND_CATEGORIES: [
    "1359244725781266492",
    "1444857594517913742",
  ],
  EXTRA_COMMAND_ROLE: null,

  // Categoria padrão de membros
  SOURCE_CATEGORY: "1384650670145278033",

  // Categorias padrão de inativos
  TARGET_CATEGORIES: [
    "1383899907244425246",
    "1410071955159122051",
    "1477566945598640251",
  ],

  // Categoria especial de inativação fora da lógica padrão
  SPECIAL_INACTIVE_CATEGORY: "1482866398396022967",

  // Categorias onde a lógica atual deve permanecer como está
  PROTECTED_CATEGORIES: [
    "1383899907244425246",
    "1410071955159122051",
    "1477566945598640251",
    "1428572742051168378",
    "1414687963161559180",
    "1482874296685695118", // ✅ Nova 3ª categoria de líderes protegida
    "1384650670145278033",
  ],

  // Canal de logs
  LOG_CHANNEL: "1477570850302591090",
};

// ===============================
// PERSISTÊNCIA (PARA LÓGICA ESPECIAL)
// ===============================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SORT_STATE_FILE = path.resolve(__dirname, "../../data/sortChannels_state.json");

function loadSortState() {
  try {
    if (!fs.existsSync(SORT_STATE_FILE)) return {}; // channelId -> { oldParentId, oldPosition, oldOverwrites }
    return JSON.parse(fs.readFileSync(SORT_STATE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveSortState(data) {
  try {
    const dir = path.dirname(SORT_STATE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SORT_STATE_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("[SC_SORT] Erro ao salvar sort_state.json:", e);
  }
}

function storeChannelState(channel) {
  const state = loadSortState();
  const overwrites = channel.permissionOverwrites.cache.map(ow => ({
    id: ow.id,
    type: ow.type,
    allow: ow.allow.bitfield.toString(),
    deny: ow.deny.bitfield.toString(),
  }));
state[channel.id] = {
  oldParentId: channel.parentId,
  oldPosition: channel.rawPosition,
  oldOverwrites: overwrites,
};

saveSortState(state);
}

function getChannelState(channelId) {
  return loadSortState()[channelId] || null;
}

function deleteChannelState(channelId) {
  const state = loadSortState();
  delete state[channelId];
  saveSortState(state);
}

// Variáveis globais do módulo de ordenação
const runningLocks = new Map();
const debouncers = new Map();

// Função de ordenação (exposta para uso interno do comando)
async function safeSortCategory(guild, categoryId) {
  // ✅ Verifica se a categoria pertence a um GRUPO (Inativos ou Líderes)
  const group = SORT_GROUPS.find(g => g.categories.some(c => c.id === categoryId));
  if (group) {
    await sortChannelGroup(guild, group);
    return;
  }

  if (runningLocks.get(categoryId)) return;
  runningLocks.set(categoryId, true);
  try {
    await sortCategoryByNameWithSticky(guild, categoryId);
  } catch (err) {
    console.error(`[SC_SORT] Falha ao ordenar cat ${categoryId}:`, err);
  } finally {
    runningLocks.set(categoryId, false);
  }
}

// ✅ FUNÇÃO GENÉRICA: Ordena e distribui canais de um grupo (Inativos ou Líderes)
async function sortChannelGroup(guild, groupConfig) {
  const lockKey = `GROUP_SORT_${groupConfig.id}`;
  if (runningLocks.get(lockKey)) return;
  runningLocks.set(lockKey, true);

  try {
    const cats = groupConfig.categories.map(c => c.id);

    function getCatIndex(catId) {
  return cats.indexOf(catId);
}

function isTextChannelLike(ch) {
  return ch && ch.type !== ChannelType.GuildCategory && !(typeof ch.isThread === "function" && ch.isThread());
}
    let allChannels = [];

    // 1. Coleta todos os canais das categorias configuradas
    for (const catId of cats) {
      const cat = guild.channels.cache.get(catId);
      if (cat) {
        // Pega filhos que não sejam threads
        const children = guild.channels.cache.filter(
          (c) => c.parentId === catId && !c.isThread() && c.type !== ChannelType.GuildCategory
        );
        allChannels.push(...children.values());
      }
    }

    // 2. Separa Sticky (Fixos) vs Regular
    const stickyIds = groupConfig.sticky || [];
    const stickyChannels = [];
    const regularChannels = [];

    // Preserva a ordem definida em stickyIds
    for (const sid of stickyIds) {
      const ch = allChannels.find(c => c.id === sid);
      if (ch) stickyChannels.push(ch);
    }

    // O resto vai para regular
    for (const ch of allChannels) {
      if (!stickyIds.includes(ch.id)) regularChannels.push(ch);
    }

    // 3. Ordena Regular de A a Z
    regularChannels.sort((a, b) => collator.compare(a.name, b.name));

    // 4. Lista Final Combinada (Fixos primeiro)
    const sortedAll = [...stickyChannels, ...regularChannels];

    // 5. Distribuição Inteligente (Lógica + Física)
    const assignments = new Map(); // ChannelID -> TargetCatID
    const catCounts = new Map();   // CatID -> Quantidade Atual (para controle local)

    // Inicializa contadores reais
    for (const catId of cats) {
      const cat = guild.channels.cache.get(catId);
      catCounts.set(catId, cat ? cat.children.cache.size : 0);
    }

    // --- FASE 1: Distribuição Lógica (respeitando limits configurados) ---
    const catUsage = new Map(); // CatID -> Count Assigned
    cats.forEach(id => catUsage.set(id, 0));

    let currentCatIndex = 0;
    let pendingChannels = [];

    let dynamicLimit = 50;
    if (groupConfig.strategy === 'balance' && groupConfig.categories.length > 0) {
         dynamicLimit = Math.ceil(sortedAll.length / groupConfig.categories.length);
         if (dynamicLimit > 50) dynamicLimit = 50;
    }

    for (const ch of sortedAll) {
      // Tenta encontrar uma categoria com vaga no limite lógico
      let assigned = false;
      
      while (currentCatIndex < groupConfig.categories.length) {
        const catConfig = groupConfig.categories[currentCatIndex];
        const currentUsage = catUsage.get(catConfig.id) || 0;
        
        const effectiveLimit = groupConfig.strategy === 'balance' 
          ? Math.min(catConfig.limit, dynamicLimit) 
          : catConfig.limit;

        if (currentUsage < effectiveLimit && currentUsage < 50) {
          assignments.set(ch.id, catConfig.id);
          catUsage.set(catConfig.id, currentUsage + 1);
          assigned = true;
          break;
        } else {
          currentCatIndex++;
        }
      }

      if (!assigned) {
        pendingChannels.push(ch);
      }
    }

    // --- FASE 2: Overflow (preenche espaço físico até 50 se sobrou gente) ---
    if (pendingChannels.length > 0) {
      // console.warn(`[SC_SORT] Grupo ${groupConfig.id} com overflow lógico (${pendingChannels.length}). Tentando preencher espaço físico...`);
      
      for (const ch of pendingChannels) {
        let assigned = false;
        // Procura qualquer categoria com espaço físico (< 50)
        for (const catConfig of groupConfig.categories) {
          const currentUsage = catUsage.get(catConfig.id) || 0;
          if (currentUsage < 50) {
            assignments.set(ch.id, catConfig.id);
            catUsage.set(catConfig.id, currentUsage + 1);
            assigned = true;
            break;
          }
        }
        
        if (!assigned) {
          console.error(`[SC_SORT] CRÍTICO: Grupo ${groupConfig.id} lotado fisicamente! Canal ${ch.name} ficará sem destino.`);
          assignments.set(ch.id, null); // Sem destino
        }
      }
    }

    // --- FASE 3: Execução ---
// 3.1 Primeiro, move canais na ordem correta para liberar espaço “em cascata”
let changesCount = 0;

const moveQueue = sortedAll
  .map((ch) => {
    const targetCatId = assignments.get(ch.id);
    return {
      ch,
      targetCatId,
      sourceIndex: getCatIndex(ch.parentId),
      targetIndex: getCatIndex(targetCatId),
    };
  })
  .filter((item) => item.targetCatId && item.ch.parentId !== item.targetCatId)
  .sort((a, b) => {
    // Move primeiro quem está mais abaixo indo mais pra baixo,
    // para liberar espaço nas categorias anteriores
    if (b.sourceIndex !== a.sourceIndex) return b.sourceIndex - a.sourceIndex;
    return b.targetIndex - a.targetIndex;
  });

for (const item of moveQueue) {
  const { ch, targetCatId } = item;

  // Pode ter mudado durante a fila
  if (ch.parentId === targetCatId) continue;

  const currentTargetSize = catCounts.get(targetCatId) || 0;

  if (currentTargetSize >= 50) {
    const targetCatChannel = guild.channels.cache.get(targetCatId);

    if (targetCatChannel) {
      const intruder = targetCatChannel.children.cache.find((c) => {
        if (!isTextChannelLike(c)) return false;
        const dest = assignments.get(c.id);
        return dest && dest !== targetCatId;
      });

      if (intruder) {
        const intruderDest = assignments.get(intruder.id);

        if (intruderDest) {
          try {
            const intruderPreviousParentId = intruder.parentId;

            await intruder.setParent(intruderDest, { lockPermissions: false });
            changesCount++;

            if (intruderPreviousParentId) {
              catCounts.set(
                intruderPreviousParentId,
                (catCounts.get(intruderPreviousParentId) || 0) - 1
              );
            }

            catCounts.set(
              intruderDest,
              (catCounts.get(intruderDest) || 0) + 1
            );

            await new Promise((r) => setTimeout(r, 1000));
          } catch (err) {
            console.error(`[SC_SORT] Falha ao mover intruso ${intruder.name}:`, err);
          }
        }
      }
    }
  }

  if ((catCounts.get(targetCatId) || 0) < 50) {
    try {
      const previousParentId = ch.parentId;

      await ch.setParent(targetCatId, { lockPermissions: false });
      changesCount++;

      if (previousParentId) {
        catCounts.set(
          previousParentId,
          (catCounts.get(previousParentId) || 0) - 1
        );
      }

      catCounts.set(
        targetCatId,
        (catCounts.get(targetCatId) || 0) + 1
      );

      await new Promise((r) => setTimeout(r, 1200));
    } catch (err) {
      if (err.code === 50035) {
        catCounts.set(targetCatId, 50);
      } else {
        console.error(`[SC_SORT] Erro ao mover ${ch.name}:`, err.message);
      }
    }
  }
}

// 3.2 Depois que tudo estiver na categoria certa, ajusta nome e posição
const catPositionCounters = new Map();
cats.forEach((id) => catPositionCounters.set(id, 0));

for (const ch of sortedAll) {
  const targetCatId = assignments.get(ch.id);
  if (!targetCatId) continue;

  const catConfig = groupConfig.categories.find((c) => c.id === targetCatId);
  const targetPos = catPositionCounters.get(targetCatId);
  catPositionCounters.set(targetCatId, targetPos + 1);

  // ✅ Renomeia se tiver prefixo configurado
  if (catConfig.prefix) {
    const currentName = ch.name;
    const targetPrefix = catConfig.prefix;

    if (!currentName.startsWith(targetPrefix)) {
      let newName = currentName;

      if (currentName.startsWith("┋")) {
        newName = "📁" + currentName;
      } else {
        newName = targetPrefix + currentName;
      }

      if (newName !== currentName) {
        await ch.setName(newName).catch((e) =>
          console.warn(`[SC_SORT] Falha ao renomear ${ch.name}:`, e)
        );
        changesCount++;
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  }

  // ✅ Garante posição correta dentro da categoria final
  if (ch.parentId === targetCatId && ch.position !== targetPos) {
    await ch.setPosition(targetPos).catch((e) =>
      console.warn(`[SC_SORT] Falha ao posicionar ${ch.name}:`, e)
    );
    changesCount++;
    await new Promise((r) => setTimeout(r, 800));
  }
}

if (changesCount > 0) {
  console.log(`[SC_SORT] Grupo ${groupConfig.id} reorganizado (${changesCount} alterações).`);
}
  } catch (e) {
    console.error(`[SC_SORT] Erro ao ordenar grupo ${groupConfig.id}:`, e);
  } finally {
    runningLocks.set(lockKey, false);
  }
}

// Lógica de ordenação com Sticky (fixos no topo)
const SC_SORT_STICKY_TOP = {
  "1414687963161559180": ["1414718336826081330", "1414718856542421052"],
};

const collator = new Intl.Collator("pt-BR", {
  sensitivity: "base",
  numeric: true,
});

async function sortCategoryByNameWithSticky(guild, categoryId) {
  const category = guild.channels.cache.get(categoryId);
  if (!category || category.type !== ChannelType.GuildCategory) return;

  const allChildren = guild.channels.cache.filter(
    (c) =>
      c?.parentId === categoryId &&
      c.type !== ChannelType.GuildCategory &&
      !(typeof c.isThread === "function" && c.isThread())
  );

  if (allChildren.size < 2) return;

  // stickies válidos
  const stickyIds = SC_SORT_STICKY_TOP[categoryId] || [];
  const stickyTop = [];
  for (const id of stickyIds) {
    const ch = allChildren.get(id);
    if (ch) stickyTop.push(ch);
  }

  // resto A→Z
  const rest = [...allChildren.values()].filter(
    (c) => !stickyTop.some((s) => s.id === c.id)
  );
  const sortedRest = rest.sort((a, b) => collator.compare(a.name, b.name));

  const desired = [...stickyTop, ...sortedRest];

  // ordem atual por posição
  const current = [...allChildren.values()].sort(
    (a, b) => a.rawPosition - b.rawPosition
  );

  const same =
    desired.length === current.length &&
    desired.every((ch, i) => ch.id === current[i].id);

  if (same) return;

  // reposiciona
  for (let i = 0; i < desired.length; i++) {
    const ch = desired[i];
    if (current[i]?.id === ch.id) continue;

    try {
      await ch.setPosition(i);
      // Pequeno delay para evitar rate limit
      await new Promise((r) => setTimeout(r, 300));
    } catch (e) {
      console.warn(
        `[SC_SORT] setPosition falhou para #${ch.name} (${ch.id}):`,
        e?.message ?? e
      );
    }
  }

  console.log(
    `[SC_SORT] Categoria ${category.name} (${categoryId}) reorganizada (stickies + A→Z).`
  );
}

export function setupSortChannels(client) {
  try {
    if (!client) {
      console.warn("[SC_SORT] client não recebido no setupSortChannels.");
      return;
    }

    // evita duplicar listeners mesmo com hot reload / reinits
    if (client.__SC_SORT_INSTALLED) {
      return;
    }
    client.__SC_SORT_INSTALLED = true;

    // === CATEGORIAS A SUPERVISIONAR ===
    // ✅ Adicionadas as categorias de inativos para ordenação automática
const SC_SORT_CATEGORY_IDS = [
  "1360108570154373151",
  "1371926306064957541",
  "1384650670145278033",
  "1410071955159122051", // Já estava, mantido
  "1414687963161559180",
  "1428572742051168378",
  "1482874296685695118", // ✅ Nova 3ª categoria de líderes
  "1359245003523756136",
  "1359244743724241156",
  "1359244725781266492",
  "1359245055239655544",
  "1352706815594598420",
  "1404568518179029142",
  // Novos Inativos:
  "1383899907244425246",
  "1477566945598640251",
  // ✅ Admin Logs (Grupo):
  "1362540577706737866",
  "1475235932931096796",
  // ✅ Logs Discord (Individual):
  "1352491000190472193",
];

    const SC_SORT_INTERVAL_MS = 30_000;

    function debounceSort(guild, categoryId, delay = 1500) {
      clearTimeout(debouncers.get(categoryId));
      const id = setTimeout(() => safeSortCategory(guild, categoryId), delay);
      debouncers.set(categoryId, id);
    }

    async function periodicSupervisor() {
      for (const [, guild] of client.guilds.cache) {
        for (const categoryId of SC_SORT_CATEGORY_IDS) {
          if (guild.channels.cache.has(categoryId)) {
            debounceSort(guild, categoryId, 0);
          }
        }
      }
    }

    // liga supervisor no ready
    client.once(Events.ClientReady, async () => {
      console.log("[SC_SORT] supervisor ligado.");
      await periodicSupervisor();
      setInterval(periodicSupervisor, SC_SORT_INTERVAL_MS);
    });

    // reage a criação
    client.on(Events.ChannelCreate, (ch) => {
      if (!ch?.guild) return;
      if (ch?.parentId && SC_SORT_CATEGORY_IDS.includes(ch.parentId)) {
        debounceSort(ch.guild, ch.parentId);
      }
    });

    // reage a update (mudança de nome, mudança de categoria, etc.)
    client.on(Events.ChannelUpdate, (oldCh, newCh) => {
      if (!newCh?.guild) return;

      const was = oldCh?.parentId;
      const now = newCh?.parentId;

      if (was && SC_SORT_CATEGORY_IDS.includes(was))
        debounceSort(newCh.guild, was);
      if (now && SC_SORT_CATEGORY_IDS.includes(now))
        debounceSort(newCh.guild, now);

      if (now && was === now && SC_SORT_CATEGORY_IDS.includes(now)) {
        debounceSort(newCh.guild, now);
      }
    });
  } catch (e) {
    console.error("[SC_SORT] Erro inesperado:", e);
  }
}

// =====================================================
// HANDLER DO COMANDO !INATIVO
// =====================================================
export async function sortChannelsHandleMessage(message, client) {
  try {
    if (!message.guild || message.author.bot) return false;

const content = message.content.trim().toLowerCase();

const INACTIVE_COMMANDS = ["!inativo", "!inativos"];
const REACTIVATE_COMMANDS = ["!membro", "!membros", "!reativar"];

const isInactiveCmd = INACTIVE_COMMANDS.includes(content);
const isReactivateCmd = REACTIVATE_COMMANDS.includes(content);

    if (!isInactiveCmd && !isReactivateCmd) return false;

    // 1. Verifica Permissões
    let member = message.member;
    // Garante que o objeto 'member' está disponível, mesmo que não esteja no cache inicial.
    if (!member) {
      try {
        member = await message.guild.members.fetch(message.author.id);
      } catch (e) {
        console.error(`[SC_SORT] Falha ao buscar membro ${message.author.id} na guild ${message.guild.id}.`, e);
        return true; // Para a execução se o membro não for encontrado.
      }
    }
    // Se o membro ainda não estiver disponível, algo está muito errado.
    if (!member) {
      console.error(`[SC_SORT] Objeto de membro para ${message.author.id} é nulo mesmo após fetch.`);
      return true;
    }

        const channel = message.channel;
    const currentCategoryId = channel.parentId;

        const isSpecialAuthorized =
      INATIVO_CONFIG.SPECIAL_AUTHORIZED_USERS.includes(message.author.id) ||
      member.roles.cache.some((r) =>
        INATIVO_CONFIG.SPECIAL_AUTHORIZED_ROLES.includes(r.id)
      );

    const isStandardAuthorized =
      INATIVO_CONFIG.ALLOWED_USERS.includes(message.author.id) ||
      member.roles.cache.some((r) =>
        INATIVO_CONFIG.ALLOWED_ROLES.includes(r.id)
      );

    // ✅ Tem o cargo extra?
    const hasExtraCommandRole =
      !!INATIVO_CONFIG.EXTRA_COMMAND_ROLE &&
      member.roles.cache.some(
        (r) => r.id === INATIVO_CONFIG.EXTRA_COMMAND_ROLE
      );

    const isInExtraCommandCategory =
      INATIVO_CONFIG.EXTRA_COMMAND_CATEGORIES.includes(currentCategoryId);

    // ✅ Permissão extra para !inativo:
    // só vale quando estiver dentro de uma das categorias extras configuradas
    const isExtraCategoryAuthorized =
      isInExtraCommandCategory &&
      (isStandardAuthorized || hasExtraCommandRole);

    // ✅ Permissão extra para !membro / !membros / !reativar
    const canUseExtraReactivateFlow =
      isInExtraCommandCategory || hasExtraCommandRole;

    // ✅ Permissão geral para comandos padrão
    const canUseStandardFlow =
      isStandardAuthorized ||
      isExtraCategoryAuthorized ||
      canUseExtraReactivateFlow;

    if (!isSpecialAuthorized && !canUseStandardFlow) {
      setTimeout(() => message.delete().catch(() => {}), 1000);
      const msg = await message.reply(
        "❌ Você não tem permissão para usar este comando."
      );
      setTimeout(() => msg.delete().catch(() => {}), 5000);
      return true;
    }

    // =====================================================
    // LÓGICA PARA !INATIVO
    // =====================================================
     if (isInactiveCmd) {
      const isSourceCategory =
        currentCategoryId === INATIVO_CONFIG.SOURCE_CATEGORY;

      const isExtraCommandCategory =
        INATIVO_CONFIG.EXTRA_COMMAND_CATEGORIES.includes(currentCategoryId);
        
      const isTargetCategory = 
        INATIVO_CONFIG.TARGET_CATEGORIES.includes(currentCategoryId);

      const isProtectedCategory =
        INATIVO_CONFIG.PROTECTED_CATEGORIES.includes(currentCategoryId);

      // =====================================================
      // 1. LÓGICA PADRÃO
      // • categoria padrão de membros (Source)
      // • OU categoria extra liberada
      // • OU categoria de inativos (Target) - permite reordenar/mover entre inativos
      // =====================================================
      if (isSourceCategory || isExtraCommandCategory || isTargetCategory) {
        if (!canUseStandardFlow) {
          const msg = await message.reply(
            `❌ Você não tem permissão para usar este comando nesta categoria.`
          );
          setTimeout(() => msg.delete().catch(() => {}), 8000);
          return true;
        }

        let targetCategory = null;
        for (const catId of INATIVO_CONFIG.TARGET_CATEGORIES) {
          const cat = message.guild.channels.cache.get(catId);
          if (
            cat &&
            cat.children.cache.filter(
              (c) =>
                c.type !== ChannelType.GuildCategory &&
                !(typeof c.isThread === "function" && c.isThread())
            ).size < 50
          ) {
            targetCategory = cat;
            break;
          }
        }

        if (!targetCategory) {
          await message.reply(
            "❌ Todas as categorias de inativos estão cheias (50 canais cada)."
          );
          return true;
        }

        const oldCategory = currentCategoryId
          ? message.guild.channels.cache.get(currentCategoryId)
          : null;
        const oldCategoryName = oldCategory?.name || "Sem Categoria";

        await channel.setParent(targetCategory.id, { lockPermissions: false });
        await message.delete().catch(() => {});

        await safeSortCategory(message.guild, targetCategory.id);
        if (oldCategory) await safeSortCategory(message.guild, oldCategory.id);

        const logChannel = await client.channels
          .fetch(INATIVO_CONFIG.LOG_CHANNEL)
          .catch(() => null);

        if (logChannel && logChannel.isTextBased()) {
          const embed = new EmbedBuilder()
            .setTitle("📦 Canal Movido para Inativos")
            .setColor("Orange")
            .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
            .addFields(
              {
                name: "👤 Executor",
                value: `${message.author} (\`${message.author.id}\`)`,
                inline: true,
              },
              {
                name: "📺 Canal",
                value: `${channel} (\`${channel.name}\`)`,
                inline: true,
              },
              {
                name: "📂 Origem",
                value: `${oldCategoryName} (\`${currentCategoryId || "N/A"}\`)`,
                inline: false,
              },
              {
                name: "📂 Destino",
                value: `${targetCategory.name} (\`${targetCategory.id}\`)`,
                inline: false,
              },
              {
                name: "🕒 Data/Hora",
                value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
                inline: false,
              }
            )
            .setFooter({
              text: "Sistema de Organização Automática • SantaCreators",
            });

          const customId = `SC_INATIVO_UNDO_${channel.id}_${currentCategoryId || "null"}_${message.author.id}`;

          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(customId)
              .setLabel("↩️ Desfazer (Voltar Canal)")
              .setStyle(ButtonStyle.Danger)
          );

          await logChannel.send({ embeds: [embed], components: [row] });
        }

        return true;
      }

  // =====================================================
  // 2. FORA DA LÓGICA PADRÃO, NÃO PODE FUNCIONAR NAS CATEGORIAS PROTEGIDAS
  // =====================================================
  if (isProtectedCategory) {
  const msg = await message.reply(
    "❌ Nesta categoria o comando segue apenas a lógica atual do sistema."
  );
  setTimeout(() => msg.delete().catch(() => {}), 8000);
  return true;
}

  // =====================================================
  // 3. LÓGICA ESPECIAL
  // =====================================================
  if (!isSpecialAuthorized) {
    const msg = await message.reply(
      "❌ Somente os cargos/usuários autorizados podem usar este comando fora das categorias padrão."
    );
    setTimeout(() => msg.delete().catch(() => {}), 8000);
    return true;
  }

  storeChannelState(channel);

  const specialInactiveCategory = await message.guild.channels
    .fetch(INATIVO_CONFIG.SPECIAL_INACTIVE_CATEGORY)
    .catch(() => null);

  if (!specialInactiveCategory) {
    await message.reply("❌ A categoria de inativos especiais não foi encontrada.");
    return true;
  }

  await channel.setParent(specialInactiveCategory.id, { lockPermissions: false });

  const permissionOverwrites = [
    {
      id: message.guild.id,
      deny: [PermissionsBitField.Flags.ViewChannel],
    },
  ];

  for (const roleId of INATIVO_CONFIG.SPECIAL_AUTHORIZED_ROLES) {
    permissionOverwrites.push({
      id: roleId,
      allow: [PermissionsBitField.Flags.ViewChannel],
    });
  }

  for (const userId of INATIVO_CONFIG.SPECIAL_AUTHORIZED_USERS) {
    permissionOverwrites.push({
      id: userId,
      allow: [PermissionsBitField.Flags.ViewChannel],
    });
  }

  await channel.permissionOverwrites.set(permissionOverwrites);
  await message.delete().catch(() => {});

  const logChannel = await client.channels.fetch(INATIVO_CONFIG.LOG_CHANNEL).catch(() => null);
  if (logChannel && logChannel.isTextBased()) {
    const embed = new EmbedBuilder()
      .setTitle("🔒 Canal Inativado (Especial)")
      .setColor("DarkOrange")
      .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: "👤 Executor", value: `${message.author} (\`${message.author.id}\`)`, inline: true },
        { name: "📺 Canal", value: `${channel} (\`${channel.name}\`)`, inline: true },
        { name: "📂 Origem", value: `<#${currentCategoryId}> (\`${currentCategoryId || "N/A"}\`)`, inline: false },
        { name: "📂 Destino", value: `<#${INATIVO_CONFIG.SPECIAL_INACTIVE_CATEGORY}> (\`${INATIVO_CONFIG.SPECIAL_INACTIVE_CATEGORY}\`)`, inline: false },
        { name: "🕒 Data/Hora", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
      )
      .setFooter({ text: "Sistema de Organização Automática • SantaCreators" });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`SC_SPECIAL_UNDO_${channel.id}_${message.author.id}`)
        .setLabel("↩️ Reativar Canal")
        .setStyle(ButtonStyle.Success)
    );

    await logChannel.send({ embeds: [embed], components: [row] });
  }

  return true;
}

    // =====================================================
    // LÓGICA PARA !MEMBROS
    // =====================================================
        if (isReactivateCmd) {
      // =====================================================
      // 1. LÓGICA PADRÃO DE REATIVAÇÃO
      // =====================================================
      if (
        INATIVO_CONFIG.TARGET_CATEGORIES.includes(currentCategoryId) ||
        INATIVO_CONFIG.EXTRA_COMMAND_CATEGORIES.includes(currentCategoryId) ||
        currentCategoryId === INATIVO_CONFIG.SOURCE_CATEGORY ||
        (isSpecialAuthorized && currentCategoryId !== INATIVO_CONFIG.SPECIAL_INACTIVE_CATEGORY)
      ) {
        if (!canUseStandardFlow && !isSpecialAuthorized) {
          const allowedCats = [...INATIVO_CONFIG.TARGET_CATEGORIES, ...INATIVO_CONFIG.EXTRA_COMMAND_CATEGORIES, INATIVO_CONFIG.SOURCE_CATEGORY]
            .map((id) => `<#${id}>`)
            .join(", ");

          const msg = await message.reply(
            `❌ Este comando só pode ser usado por usuários autorizados em canais nas categorias permitidas: ${allowedCats}.`
          );
          setTimeout(() => msg.delete().catch(() => {}), 8000);
          return true;
        }

                        // ✅ Destino:
        // se o comando estiver sendo usado dentro de uma categoria extra,
        // mantém a própria categoria atual como destino;
        // senão, volta para SOURCE_CATEGORY
        let targetCategoryId = INATIVO_CONFIG.SOURCE_CATEGORY;

        if (INATIVO_CONFIG.EXTRA_COMMAND_CATEGORIES.includes(currentCategoryId)) {
          targetCategoryId = currentCategoryId;
        } else if (hasExtraCommandRole) {
          targetCategoryId =
            INATIVO_CONFIG.EXTRA_COMMAND_CATEGORIES[0] ||
            INATIVO_CONFIG.SOURCE_CATEGORY;
        }

        const targetCategory = message.guild.channels.cache.get(targetCategoryId);

        if (!targetCategory) {
          await message.reply(
            `❌ A categoria de destino <#${targetCategoryId}> não foi encontrada.`
          );
          return true;
        }

        const targetChildrenCount = targetCategory.children.cache.filter(
          (c) =>
            c.type !== ChannelType.GuildCategory &&
            !(typeof c.isThread === "function" && c.isThread())
        ).size;

        if (targetChildrenCount >= 50) {
          await message.reply(
            `❌ A categoria de destino <#${targetCategoryId}> está cheia.`
          );
          return true;
        }

        const oldCategory = currentCategoryId
          ? message.guild.channels.cache.get(currentCategoryId)
          : null;
        const oldCategoryName = oldCategory?.name || "Sem Categoria";

        await channel.setParent(targetCategory.id, { lockPermissions: false });
        await message.delete().catch(() => {});

        await safeSortCategory(message.guild, targetCategory.id);
        if (oldCategory) await safeSortCategory(message.guild, oldCategory.id);

        const logChannel = await client.channels
          .fetch(INATIVO_CONFIG.LOG_CHANNEL)
          .catch(() => null);

        if (logChannel && logChannel.isTextBased()) {
          const embed = new EmbedBuilder()
            .setTitle("✅ Canal Reativado para Membros")
            .setColor("Green")
            .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
            .addFields(
              {
                name: "👤 Executor",
                value: `${message.author} (\`${message.author.id}\`)`,
                inline: true,
              },
              {
                name: "📺 Canal",
                value: `${channel} (\`${channel.name}\`)`,
                inline: true,
              },
              {
                name: "📂 Origem",
                value: `${oldCategoryName} (\`${currentCategoryId || "N/A"}\`)`,
                inline: false,
              },
              {
                name: "📂 Destino",
                value: `${targetCategory.name} (\`${targetCategory.id}\`)`,
                inline: false,
              },
              {
                name: "🕒 Data/Hora",
                value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
                inline: false,
              }
            )
            .setFooter({
              text: "Sistema de Organização Automática • SantaCreators",
            });

          const customId = `SC_MEMBROS_UNDO_${channel.id}_${currentCategoryId || "null"}_${message.author.id}`;

          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(customId)
              .setLabel("↩️ Desfazer (Mover para Inativos)")
              .setStyle(ButtonStyle.Danger)
          );

          await logChannel.send({ embeds: [embed], components: [row] });
        }

        return true;
      }

      // =====================================================
      // 2. REATIVAÇÃO ESPECIAL
      // =====================================================
      else if (
        currentCategoryId === INATIVO_CONFIG.SPECIAL_INACTIVE_CATEGORY &&
        isSpecialAuthorized
      ) {
        const state = getChannelState(channel.id);
        if (!state) {
          await message.reply(
            "❌ Não encontrei os dados de restauração para este canal."
          );
          return true;
        }

        const oldCategory = await message.guild.channels
          .fetch(state.oldParentId)
          .catch(() => null);

        if (!oldCategory) {
          await message.reply(
            "❌ A categoria original deste canal não existe mais."
          );
          return true;
        }

        await channel.setParent(oldCategory.id, { lockPermissions: false });

        await channel.permissionOverwrites.set(
          state.oldOverwrites.map((ow) => ({
            id: ow.id,
            type: ow.type,
            allow: BigInt(ow.allow),
            deny: BigInt(ow.deny),
          }))
        );

        if (typeof state.oldPosition === "number") {
          await channel.setPosition(state.oldPosition).catch(() => {});
        }

        deleteChannelState(channel.id);
        await message.delete().catch(() => {});

        const logChannel = await client.channels
          .fetch(INATIVO_CONFIG.LOG_CHANNEL)
          .catch(() => null);

        if (logChannel && logChannel.isTextBased()) {
          await logChannel.send(
            `✅ O canal ${channel} foi reativado para sua categoria original por ${message.author}.`
          );
        }

        return true;
      }

      // ✅ feedback quando usar em categoria errada
      const msg = await message.reply(
        "❌ Este comando deve ser usado em um canal que esteja em uma categoria de inativos ou em uma das categorias extras permitidas."
      );
      setTimeout(() => msg.delete().catch(() => {}), 8000);
      return true;
    }
  } catch (e) {
    console.error("[SC_SORT] Erro ao mover canal:", e);
    return false;
  }
}

// =====================================================
// HANDLER DA INTERAÇÃO (BOTÃO DESFAZER)
// =====================================================
export async function sortChannelsHandleInteraction(interaction) {
  try {
    if (!interaction.isButton()) return false;

    const isUndoInativo = interaction.customId.startsWith("SC_INATIVO_UNDO_");
    const isUndoMembros = interaction.customId.startsWith("SC_MEMBROS_UNDO_");
    const isUndoSpecial = interaction.customId.startsWith("SC_SPECIAL_UNDO_");

    if (!isUndoInativo && !isUndoMembros && !isUndoSpecial) return false;

    // Parse do ID
    const parts = interaction.customId.split("_");
    // SC, (INATIVO|MEMBROS), UNDO, channelId, oldCatId, userId
    const channelId = isUndoSpecial ? parts[3] : parts[3];
    const oldCatId = isUndoSpecial ? null : parts[4]; // Not needed for special undo
    const originalUserId = isUndoSpecial ? parts[4] : parts[5];

    // Verifica Permissões
    const member = interaction.member;
    const isAllowedUser = INATIVO_CONFIG.ALLOWED_USERS.includes(interaction.user.id);
    const isAllowedRole = member.roles.cache.some((r) =>
      INATIVO_CONFIG.ALLOWED_ROLES.includes(r.id)
    );

    // Apenas quem tem permissão ou quem executou pode desfazer
    if (!isAllowedUser && !isAllowedRole && interaction.user.id !== originalUserId) {
      await interaction.reply({
        content: "❌ Você não tem permissão para desfazer esta ação.",
        ephemeral: true,
      });
      return true;
    }

    await interaction.deferReply({ ephemeral: true });

    // Lógica para desfazer a inativação especial
    if (isUndoSpecial) {
      const state = getChannelState(channelId);
      if (!state) {
        await interaction.editReply("❌ Dados de restauração não encontrados.");
        return true;
      }

      const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
      if (!channel) {
        await interaction.editReply("❌ O canal não existe mais.");
        return true;
      }

      const oldCategory = await interaction.guild.channels.fetch(state.oldParentId).catch(() => null);
      if (!oldCategory) {
        await interaction.editReply("❌ A categoria original não existe mais.");
        return true;
      }

      await channel.setParent(oldCategory.id, { lockPermissions: false });

await channel.permissionOverwrites.set(
  state.oldOverwrites.map((ow) => ({
    id: ow.id,
    type: ow.type,
    allow: BigInt(ow.allow),
    deny: BigInt(ow.deny),
  }))
);

if (typeof state.oldPosition === "number") {
  await channel.setPosition(state.oldPosition).catch(() => {});
}

deleteChannelState(channelId);

      await interaction.editReply(`✅ Ação desfeita. O canal ${channel} foi restaurado.`);
      await interaction.message.edit({ components: [] }); // Desativa o botão
      return true;
    }

    const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
    if (!channel) {
      await interaction.editReply("❌ O canal não existe mais.");
      return true;
    }

    if (oldCatId === "null" || !oldCatId) {
      await interaction.editReply("❌ Não há categoria de origem registrada para voltar.");
      return true;
    }

    const oldCategory = await interaction.guild.channels.fetch(oldCatId).catch(() => null);
    if (!oldCategory) {
      await interaction.editReply("❌ A categoria de origem não existe mais.");
      return true;
    }

    // Move de volta
  const previousCategoryId = channel.parentId;

await channel.setParent(oldCategory.id, { lockPermissions: false });

await safeSortCategory(interaction.guild, oldCategory.id);
if (previousCategoryId && previousCategoryId !== oldCategory.id) {
  await safeSortCategory(interaction.guild, previousCategoryId);
}

    // Atualiza o Log (Desativa botão)
    const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0]);

    if (isUndoInativo) {
      originalEmbed.setColor("Green");
      originalEmbed.addFields({
        name: "✅ Ação Desfeita",
        value: `Canal retornado para a origem por ${interaction.user}.`,
      });
      await interaction.editReply(`✅ Canal ${channel} movido de volta para **${oldCategory.name}**.`);
    } else { // isUndoMembros
      originalEmbed.setColor("Orange");
      originalEmbed.addFields({
        name: "✅ Ação Desfeita",
        value: `Canal retornado para a categoria de inativos por ${interaction.user}.`,
      });
      await interaction.editReply(`✅ Canal ${channel} movido de volta para a categoria de inativos **${oldCategory.name}**.`);
    }

    await interaction.message.edit({ embeds: [originalEmbed], components: [] });

    return true;

  } catch (e) {
    console.error("[SC_UNDO] Erro ao desfazer:", e);
    return false;
  }
}
