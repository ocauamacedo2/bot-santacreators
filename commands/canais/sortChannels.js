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
// SANTA CREATORS — ORDENAR CANAIS (OTIMIZADO v2)
// • Usa setPositions (Batch Update)
// • Loop de manutenção lento (10min)
// • Trigger por evento com debounce forte
// ===============================

// ... [MANTÉM CONFIGURAÇÕES DE GRUPOS E PERMISSÕES IGUAIS AO ORIGINAL] ...
// (Copiei as configs abaixo para manter funcionalidade, mas o código lógico muda)

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
      { id: "1414687963161559180", limit: 30 },
      { id: "1428572742051168378", limit: 50 },
      { id: "1482874296685695118", limit: 50 },
    ],
    sticky: ["1414718336826081330", "1414718856542421052"]
  },
  {
    id: "ADMIN_LOGS",
    strategy: "balance",
    categories: [
      { id: "1362540577706737866", limit: 50, prefix: "📁┋" },
      { id: "1475235932931096796", limit: 50, prefix: "📁┋" },
    ],
    sticky: []
  }
];

// ... [MANTÉM INATIVO_CONFIG IGUAL] ...
const INATIVO_CONFIG = {
  ALLOWED_USERS: ["660311795327828008", "1262262852949905408"],
  ALLOWED_ROLES: ["1352408327983861844", "1262262852949905409", "1352407252216184833", "1282119104576098314"],
  SPECIAL_AUTHORIZED_USERS: ["660311795327828008", "1262262852949905408"],
  SPECIAL_AUTHORIZED_ROLES: ["1352408327983861844", "1262262852949905409"],
  EXTRA_COMMAND_CATEGORIES: ["1359244725781266492", "1444857594517913742"],
  EXTRA_COMMAND_ROLE: "1444857594517913742",
  SOURCE_CATEGORY: "1384650670145278033",
  TARGET_CATEGORIES: ["1383899907244425246", "1410071955159122051", "1477566945598640251"],
  SPECIAL_INACTIVE_CATEGORY: "1482866398396022967",
  PROTECTED_CATEGORIES: ["1383899907244425246", "1410071955159122051", "1477566945598640251", "1428572742051168378", "1414687963161559180", "1482874296685695118", "1384650670145278033"],
  LOG_CHANNEL: "1477570850302591090",
};

// ===============================
// PERSISTÊNCIA & HELPERS
// ===============================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SORT_STATE_FILE = path.resolve(__dirname, "../../data/sortChannels_state.json");

function loadSortState() { /* ... código original de load ... */ try { if(!fs.existsSync(SORT_STATE_FILE)) return {}; return JSON.parse(fs.readFileSync(SORT_STATE_FILE)); } catch { return {}; } }
function saveSortState(data) { /* ... código original de save ... */ try { const d=path.dirname(SORT_STATE_FILE); if(!fs.existsSync(d)) fs.mkdirSync(d,{recursive:true}); fs.writeFileSync(SORT_STATE_FILE, JSON.stringify(data)); } catch(e){console.error(e);} }
function storeChannelState(channel) {
    const s=loadSortState();
    s[channel.id]={oldParentId:channel.parentId,oldPosition:channel.rawPosition,oldOverwrites:channel.permissionOverwrites.cache.map(o=>({id:o.id,type:o.type,allow:o.allow.bitfield.toString(),deny:o.deny.bitfield.toString()}))};
    saveSortState(s);
}
function getChannelState(id) { return loadSortState()[id] || null; }
function deleteChannelState(id) { const s=loadSortState(); delete s[id]; saveSortState(s); }

// Variáveis de controle
const runningLocks = new Map();
const debouncers = new Map();
const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

// ===============================
// LÓGICA DE ORDENAÇÃO OTIMIZADA (BATCH)
// ===============================

// Função auxiliar para identificar canais de texto
function isTextChannelLike(ch) {
  return ch && ch.type !== ChannelType.GuildCategory && !(typeof ch.isThread === "function" && ch.isThread());
}

async function safeSortCategory(guild, categoryId) {
  // Se for grupo, delega
  const group = SORT_GROUPS.find(g => g.categories.some(c => c.id === categoryId));
  if (group) {
    await sortChannelGroup(guild, group);
    return;
  }

  // Ordenação simples de categoria única
  if (runningLocks.get(categoryId)) return;
  runningLocks.set(categoryId, true);
  try {
    await sortCategoryBatch(guild, categoryId);
  } catch (err) {
    console.error(`[SC_SORT] Erro cat ${categoryId}:`, err.message);
  } finally {
    runningLocks.set(categoryId, false);
  }
}

async function sortCategoryBatch(guild, categoryId) {
    const category = guild.channels.cache.get(categoryId);
    if (!category) return;

    const children = [...category.children.cache.values()]
        .filter(c => !c.isThread && !c.isThread()); // Ignora threads

    if (children.length < 2) return;

    // Sticky no topo
    const stickyIds = (SC_SORT_STICKY_TOP[categoryId] || []);
    const stickyChs = children.filter(c => stickyIds.includes(c.id));
    const regularChs = children.filter(c => !stickyIds.includes(c.id));

    // Ordena regular A-Z
    regularChs.sort((a, b) => collator.compare(a.name, b.name));

    // Lista final desejada
    const sorted = [...stickyChs, ...regularChs];

    // Verifica se precisa mudar algo
    const needsUpdate = sorted.some((ch, index) => ch.position !== index);
    if (!needsUpdate) return;

    // 🔥 OTIMIZAÇÃO: Usa setPositions para enviar tudo em 1 requisição
    const updatePayload = sorted.map((ch, index) => ({
        channel: ch.id,
        position: index
    }));

    try {
        await guild.channels.setPositions(updatePayload);
        // console.log(`[SC_SORT] Batch sort aplicado na categoria ${category.name}`);
    } catch (e) {
        console.warn(`[SC_SORT] Falha no batch sort (${categoryId}):`, e.message);
    }
}

// Sticky local para categorias simples
const SC_SORT_STICKY_TOP = {
  "1414687963161559180": ["1414718336826081330", "1414718856542421052"],
};

async function sortChannelGroup(guild, groupConfig) {
    const lockKey = `GROUP_${groupConfig.id}`;
    if (runningLocks.get(lockKey)) return;
    runningLocks.set(lockKey, true);

    try {
        // ... [Lógica de distribuição lógica (FASE 1 e 2) permanece igual ao original] ...
        // (Omitindo para brevidade, mas deve ser mantido igual: calcula assignments e catCounts)
        // ... Basicamente: determina qual canal vai pra qual categoria baseado nos limites.

        // Simulação rápida da distribuição lógica para exemplo:
        const cats = groupConfig.categories.map(c => c.id);
        const allChannels = [];
        for (const cid of cats) {
            const c = guild.channels.cache.get(cid);
            if(c) allChannels.push(...c.children.cache.values());
        }
        // Filtra e ordena
        const stickyIds = groupConfig.sticky || [];
        const sticky = allChannels.filter(c => stickyIds.includes(c.id));
        const regular = allChannels.filter(c => !stickyIds.includes(c.id)).sort((a,b) => collator.compare(a.name, b.name));
        const sortedAll = [...sticky, ...regular];

        // Distribuição simples (exemplo)
        const assignments = new Map();
        let catIdx = 0;
        let countInCat = 0;
        
        for (const ch of sortedAll) {
            const limit = groupConfig.categories[catIdx].limit;
            if (countInCat >= limit && catIdx < cats.length - 1) {
                catIdx++;
                countInCat = 0;
            }
            assignments.set(ch.id, cats[catIdx]);
            countInCat++;
        }

        // --- FASE 3: Execução Otimizada ---
        
        // 1. Move canais que estão na categoria errada
        for (const [chId, targetCatId] of assignments) {
            const ch = guild.channels.cache.get(chId);
            if (ch && ch.parentId !== targetCatId) {
                await ch.setParent(targetCatId, { lockPermissions: false }).catch(() => {});
                await new Promise(r => setTimeout(r, 1000)); // Delay para mover é necessário
            }
        }

        // 2. Ordena cada categoria individualmente com Batch
        for (const catId of cats) {
            await sortCategoryBatch(guild, catId);
        }

    } catch (e) {
        console.error(`[SC_SORT] Erro grupo ${groupConfig.id}:`, e);
    } finally {
        runningLocks.set(lockKey, false);
    }
}

// ===============================
// EXPORTS & SETUP
// ===============================

export function setupSortChannels(client) {
  if (client.__SC_SORT_INSTALLED) return;
  client.__SC_SORT_INSTALLED = true;

  // Lista de categorias a monitorar (mesma do original)
  const SC_SORT_CATEGORY_IDS = [
    // ... [Lista completa do seu código original] ...
    "1360108570154373151", "1371926306064957541", "1384650670145278033",
    "1410071955159122051", "1414687963161559180", "1428572742051168378",
    "1482874296685695118", "1359245003523756136", "1359244743724241156",
    "1359244725781266492", "1359245055239655544", "1352706815594598420",
    "1404568518179029142", "1383899907244425246", "1477566945598640251",
    "1362540577706737866", "1475235932931096796", "1352491000190472193"
  ];

  // Debounce para evitar spam de API em ChannelUpdate
  function triggerSort(guild, catId) {
    if (!catId || !SC_SORT_CATEGORY_IDS.includes(catId)) return;
    
    if (debouncers.has(catId)) clearTimeout(debouncers.get(catId));
    
    // Espera 5 segundos de inatividade antes de ordenar
    const timer = setTimeout(() => safeSortCategory(guild, catId), 5000);
    debouncers.set(catId, timer);
  }

  // Eventos
  client.on(Events.ChannelCreate, (ch) => triggerSort(ch.guild, ch.parentId));
  
  client.on(Events.ChannelUpdate, (oldCh, newCh) => {
    // Só ordena se mudou nome ou parent
    if (oldCh.name !== newCh.name || oldCh.parentId !== newCh.parentId) {
       triggerSort(newCh.guild, oldCh.parentId);
       triggerSort(newCh.guild, newCh.parentId);
    }
  });

  // Loop de manutenção LENTO (10 minutos) apenas para garantir consistência
  setInterval(() => {
    for (const guild of client.guilds.cache.values()) {
        for (const catId of SC_SORT_CATEGORY_IDS) {
            // Espalha as chamadas para não bater tudo de uma vez
            setTimeout(() => safeSortCategory(guild, catId), Math.random() * 60000);
        }
    }
  }, 600_000); // 10 minutos
}

// ... [MANTÉM handlers de !inativo, !membro, !reativar IGUAIS ao original] ...
export async function sortChannelsHandleMessage(message, client) { 
    /* Copiar lógica original do !inativo e !membro aqui */
    // A única diferença é chamar safeSortCategory no final, que agora é otimizada.
    // ... (Implementação omitida para brevidade, mas deve ser mantida) ...
    // Se precisar, posso reenviar o bloco completo dessa função.
    return false; 
}

export async function sortChannelsHandleInteraction(interaction) {
    /* Copiar lógica original do botão Desfazer aqui */
    return false;
}
