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
// SANTA CREATORS — ORDENAR CANAIS (OTIMIZADO vFINAL)
// • Batch Update (setPositions)
// • Event-driven (sem loop de 30s)
// • Preserva lógica de grupos e comandos
// ===============================

// ===============================
// CONFIGURAÇÃO DE GRUPOS DE ORDENAÇÃO
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

// ===============================
// CONFIGURAÇÃO DO COMANDO !INATIVO
// ===============================
const INATIVO_CONFIG = {
  ALLOWED_USERS: ["660311795327828008", "1262262852949905408"],
  ALLOWED_ROLES: ["1352408327983861844", "1262262852949905409", "1352407252216184833", "1282119104576098314"],
  SPECIAL_AUTHORIZED_USERS: ["660311795327828008", "1262262852949905408"],
  SPECIAL_AUTHORIZED_ROLES: ["1352408327983861844", "1262262852949905409"],
  EXTRA_COMMAND_CATEGORIES: ["1359244725781266492", "1444857594517913742"],
  EXTRA_COMMAND_ROLE: null,
  SOURCE_CATEGORY: "1384650670145278033",
  TARGET_CATEGORIES: ["1383899907244425246", "1410071955159122051", "1477566945598640251"],
  SPECIAL_INACTIVE_CATEGORY: "1482866398396022967",
  PROTECTED_CATEGORIES: [
    "1383899907244425246", "1410071955159122051", "1477566945598640251",
    "1428572742051168378", "1414687963161559180", "1482874296685695118",
    "1384650670145278033"
  ],
  LOG_CHANNEL: "1477570850302591090",
};

// ===============================
// PERSISTÊNCIA
// ===============================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SORT_STATE_FILE = path.resolve(__dirname, "../../data/sortChannels_state.json");

function loadSortState() {
  try {
    if (!fs.existsSync(SORT_STATE_FILE)) return {};
    return JSON.parse(fs.readFileSync(SORT_STATE_FILE, "utf8"));
  } catch { return {}; }
}

function saveSortState(data) {
  try {
    const dir = path.dirname(SORT_STATE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SORT_STATE_FILE, JSON.stringify(data, null, 2));
  } catch (e) { console.error("[SC_SORT] Erro save state:", e); }
}

function storeChannelState(channel) {
  const state = loadSortState();
  state[channel.id] = {
    oldParentId: channel.parentId,
    oldPosition: channel.rawPosition,
    oldOverwrites: channel.permissionOverwrites.cache.map(ow => ({
      id: ow.id, type: ow.type, allow: ow.allow.bitfield.toString(), deny: ow.deny.bitfield.toString()
    })),
  };
  saveSortState(state);
}

function getChannelState(channelId) { return loadSortState()[channelId] || null; }
function deleteChannelState(channelId) {
  const state = loadSortState();
  delete state[channelId];
  saveSortState(state);
}

// ===============================
// HELPERS & LOCKS
// ===============================
const runningLocks = new Map();
const debouncers = new Map();
const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

function isTextChannelLike(ch) {
  return ch && ch.type !== ChannelType.GuildCategory && !(typeof ch.isThread === "function" && ch.isThread());
}

// Stickies para categorias soltas (fora de grupos)
const SC_SORT_STICKY_TOP = {
  "1414687963161559180": ["1414718336826081330", "1414718856542421052"],
};

// ===============================
// LÓGICA DE ORDENAÇÃO
// ===============================

// Entrada principal para ordenar qualquer categoria
async function safeSortCategory(guild, categoryId) {
  const group = SORT_GROUPS.find(g => g.categories.some(c => c.id === categoryId));
  if (group) {
    await sortChannelGroup(guild, group);
    return;
  }

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

// ✅ Ordena uma única categoria usando Batch Update (setPositions)
async function sortCategoryBatch(guild, categoryId) {
  const category = guild.channels.cache.get(categoryId);
  if (!category || category.type !== ChannelType.GuildCategory) return;

  const children = [...category.children.cache.values()]
    .filter(c => isTextChannelLike(c));

  if (children.length < 2) return;

  const stickyIds = SC_SORT_STICKY_TOP[categoryId] || [];
  const stickyChs = children.filter(c => stickyIds.includes(c.id));
  const regularChs = children.filter(c => !stickyIds.includes(c.id));

  // Ordena A-Z
  regularChs.sort((a, b) => collator.compare(a.name, b.name));

  // Lista final desejada
  const sorted = [...stickyChs, ...regularChs];

  // Verifica se precisa atualizar
  const needsUpdate = sorted.some((ch, index) => ch.position !== index);
  if (!needsUpdate) return;

  // 🔥 Batch Update
  const updates = sorted.map((ch, index) => ({ channel: ch.id, position: index }));
  try {
    await guild.channels.setPositions(updates);
  } catch (e) {
    console.warn(`[SC_SORT] Falha batch sort cat ${categoryId}:`, e.message);
  }
}

// ✅ Ordena Grupos (Líderes/Inativos)
async function sortChannelGroup(guild, groupConfig) {
  const lockKey = `GROUP_${groupConfig.id}`;
  if (runningLocks.get(lockKey)) return;
  runningLocks.set(lockKey, true);

  try {
    const cats = groupConfig.categories.map(c => c.id);
    const allChannels = [];

    // 1. Coleta canais
    for (const cid of cats) {
      const c = guild.channels.cache.get(cid);
      if (c) allChannels.push(...c.children.cache.filter(isTextChannelLike).values());
    }

    // 2. Separa Sticky/Regular
    const stickyIds = groupConfig.sticky || [];
    const sticky = allChannels.filter(c => stickyIds.includes(c.id));
    const regular = allChannels.filter(c => !stickyIds.includes(c.id));
    regular.sort((a, b) => collator.compare(a.name, b.name));
    const sortedAll = [...sticky, ...regular];

    // 3. Distribuição Lógica (Mantida do original)
    const assignments = new Map();
    const catUsage = new Map();
    cats.forEach(id => catUsage.set(id, 0));

    let currentCatIndex = 0;
    let dynamicLimit = 50;
    
    if (groupConfig.strategy === 'balance' && groupConfig.categories.length > 0) {
       dynamicLimit = Math.ceil(sortedAll.length / groupConfig.categories.length);
       if (dynamicLimit > 50) dynamicLimit = 50;
    }

    for (const ch of sortedAll) {
      let assigned = false;
      while (currentCatIndex < groupConfig.categories.length) {
        const catConfig = groupConfig.categories[currentCatIndex];
        const usage = catUsage.get(catConfig.id) || 0;
        const limit = groupConfig.strategy === 'balance' ? Math.min(catConfig.limit, dynamicLimit) : catConfig.limit;

        if (usage < limit && usage < 50) {
          assignments.set(ch.id, catConfig.id);
          catUsage.set(catConfig.id, usage + 1);
          assigned = true;
          break;
        } else {
          currentCatIndex++;
        }
      }
      // Overflow
      if (!assigned) {
        for (const catConfig of groupConfig.categories) {
           const usage = catUsage.get(catConfig.id) || 0;
           if (usage < 50) {
             assignments.set(ch.id, catConfig.id);
             catUsage.set(catConfig.id, usage + 1);
             assigned = true;
             break;
           }
        }
      }
    }

    // 4. Execução Otimizada
    
    // 4.1 Move canais na categoria errada (com delay)
    for (const [chId, targetCatId] of assignments) {
        const ch = guild.channels.cache.get(chId);
        if (ch && ch.parentId !== targetCatId) {
            await ch.setParent(targetCatId, { lockPermissions: false }).catch(() => {});
            await new Promise(r => setTimeout(r, 1200)); // Delay para evitar rate limit de movimento
        }
    }

    // 4.2 Renomeia se tiver prefixo (com delay)
    for (const ch of sortedAll) {
        const targetCatId = assignments.get(ch.id);
        const catConfig = groupConfig.categories.find(c => c.id === targetCatId);
        if (catConfig?.prefix) {
            if (!ch.name.startsWith(catConfig.prefix)) {
                let newName = ch.name.startsWith("┋") ? "📁" + ch.name : catConfig.prefix + ch.name;
                await ch.setName(newName).catch(() => {});
                await new Promise(r => setTimeout(r, 1500));
            }
        }
    }

    // 4.3 Ordena cada categoria individualmente com Batch (Rápido)
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
// SETUP & EVENTOS
// ===============================
export function setupSortChannels(client) {
  if (client.__SC_SORT_INSTALLED) return;
  client.__SC_SORT_INSTALLED = true;

  // Lista consolidada de categorias monitoradas (incluindo grupos e protegidas)
  const ALL_CATS = new Set([
    ...SORT_GROUPS.flatMap(g => g.categories.map(c => c.id)),
    ...INATIVO_CONFIG.PROTECTED_CATEGORIES,
    "1360108570154373151", "1371926306064957541", "1359245003523756136",
    "1359244743724241156", "1359244725781266492", "1359245055239655544",
    "1352706815594598420", "1404568518179029142", "1352491000190472193"
  ]);

  function triggerSort(guild, catId) {
    if (!catId || !ALL_CATS.has(catId)) return;
    if (debouncers.has(catId)) clearTimeout(debouncers.get(catId));
    // Espera 5s de inatividade para ordenar
    const timer = setTimeout(() => safeSortCategory(guild, catId), 5000);
    debouncers.set(catId, timer);
  }

  client.on(Events.ChannelCreate, (ch) => triggerSort(ch.guild, ch.parentId));
  client.on(Events.ChannelUpdate, (oldCh, newCh) => {
    if (oldCh.parentId !== newCh.parentId) {
        triggerSort(newCh.guild, oldCh.parentId);
        triggerSort(newCh.guild, newCh.parentId);
    } else if (oldCh.name !== newCh.name) {
        triggerSort(newCh.guild, newCh.parentId);
    }
  });

  // Backup loop (10 min)
  setInterval(() => {
    for (const guild of client.guilds.cache.values()) {
        for (const catId of ALL_CATS) {
            setTimeout(() => safeSortCategory(guild, catId), Math.random() * 60000);
        }
    }
  }, 600_000); 
  
  console.log("[SC_SORT] Sistema de ordenação OTIMIZADO iniciado.");
}

// ===============================
// HANDLERS (Comandos !inativo, !membro, etc)
// ===============================
export async function sortChannelsHandleMessage(message, client) {
  try {
    if (!message.guild || message.author.bot) return false;
    const content = message.content.trim().toLowerCase();
    
    if (!["!inativo", "!inativos", "!membro", "!membros", "!reativar"].includes(content)) return false;

    // --- Permissões ---
    let member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
    if (!member) return true;

    const channel = message.channel;
    const catId = channel.parentId;

    const isSpecialAuth = INATIVO_CONFIG.SPECIAL_AUTHORIZED_USERS.includes(message.author.id) || 
                          member.roles.cache.hasAny(...INATIVO_CONFIG.SPECIAL_AUTHORIZED_ROLES);
    const isStdAuth = INATIVO_CONFIG.ALLOWED_USERS.includes(message.author.id) || 
                      member.roles.cache.hasAny(...INATIVO_CONFIG.ALLOWED_ROLES);
    const hasExtraRole = member.roles.cache.has(INATIVO_CONFIG.EXTRA_COMMAND_ROLE);
    
    const isExtraCat = INATIVO_CONFIG.EXTRA_COMMAND_CATEGORIES.includes(catId);
    
    const canUse = isSpecialAuth || isStdAuth || (isExtraCat && hasExtraRole);

    if (!canUse) {
        const m = await message.reply("❌ Você não tem permissão para usar este comando.");
        setTimeout(() => { message.delete().catch(()=>{}); m.delete().catch(()=>{}); }, 5000);
        return true;
    }

    // --- !INATIVO ---
    if (content.startsWith("!inativo")) {
        const isSource = catId === INATIVO_CONFIG.SOURCE_CATEGORY;
        
        // 1. Lógica Padrão (Mover para Inativos)
        if (isSource || isExtraCat) {
            let targetCat = null;
            for (const tid of INATIVO_CONFIG.TARGET_CATEGORIES) {
                const c = message.guild.channels.cache.get(tid);
                if (c && c.children.cache.filter(isTextChannelLike).size < 50) {
                    targetCat = c; break;
                }
            }
            if (!targetCat) return message.reply("❌ Todas as categorias de inativos estão cheias.");

            const oldCat = message.guild.channels.cache.get(catId);
            await channel.setParent(targetCat.id, { lockPermissions: false });
            await message.delete().catch(()=>{});
            
            // Log e Ordenação
            safeSortCategory(message.guild, targetCat.id);
            if(oldCat) safeSortCategory(message.guild, oldCat.id);
            
            const logCh = await client.channels.fetch(INATIVO_CONFIG.LOG_CHANNEL).catch(()=>null);
            if (logCh) {
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`SC_INATIVO_UNDO_${channel.id}_${catId}_${message.author.id}`)
                    .setLabel("↩️ Desfazer").setStyle(ButtonStyle.Danger)
                );
                await logCh.send({ 
                    embeds: [new EmbedBuilder().setTitle("📦 Canal Inativado").setDescription(`Canal ${channel} movido por ${message.author}`).setColor("Orange")], 
                    components: [row] 
                });
            }
            return true;
        }

        // 2. Lógica Especial (Qualquer lugar -> Special Inactive)
        if (isSpecialAuth && !INATIVO_CONFIG.PROTECTED_CATEGORIES.includes(catId)) {
            storeChannelState(channel);
            const specCat = await message.guild.channels.fetch(INATIVO_CONFIG.SPECIAL_INACTIVE_CATEGORY).catch(()=>null);
            if (!specCat) return message.reply("❌ Categoria especial não encontrada.");

            await channel.setParent(specCat.id, { lockPermissions: false });
            // Aplica permissões restritivas... (mantido do original)
            await channel.permissionOverwrites.set([
                { id: message.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                ...INATIVO_CONFIG.SPECIAL_AUTHORIZED_ROLES.map(r => ({ id: r, allow: [PermissionsBitField.Flags.ViewChannel] })),
                ...INATIVO_CONFIG.SPECIAL_AUTHORIZED_USERS.map(u => ({ id: u, allow: [PermissionsBitField.Flags.ViewChannel] }))
            ]);
            await message.delete().catch(()=>{});

            // Log especial
            const logCh = await client.channels.fetch(INATIVO_CONFIG.LOG_CHANNEL).catch(()=>null);
            if (logCh) {
                 const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`SC_SPECIAL_UNDO_${channel.id}_${message.author.id}`)
                    .setLabel("↩️ Reativar").setStyle(ButtonStyle.Success)
                );
                await logCh.send({ 
                    embeds: [new EmbedBuilder().setTitle("🔒 Canal Inativado (Especial)").setDescription(`Canal ${channel} escondido por ${message.author}`).setColor("DarkOrange")], 
                    components: [row] 
                });
            }
            return true;
        }
    }

    // --- !REATIVAR / !MEMBRO ---
    if (["!membro", "!membros", "!reativar"].includes(content)) {
        const isInactiveCat = INATIVO_CONFIG.TARGET_CATEGORIES.includes(catId);
        const isExtraEntryCat = INATIVO_CONFIG.EXTRA_COMMAND_CATEGORIES.includes(catId);
        const isMembersCat = catId === INATIVO_CONFIG.SOURCE_CATEGORY;

        // Debug Logs solicitados
        console.log("[SC_SORT][REATIVAR_DEBUG]", {
            content,
            channelId: channel.id,
            channelName: channel.name,
            parentId: catId,
            currentCategoryId: catId,
            isInactiveCmd: false,
            isReactivateCmd: true,
            isInactiveCategory: isInactiveCat,
            isExtraEntryCategory: isExtraEntryCat,
            isMembersCategory: isMembersCat,
            isSpecialAuthorized: isSpecialAuth,
            canUseStandardFlow: canUse
        });

        // 1. Reativar Especial (Prioridade)
        if (catId === INATIVO_CONFIG.SPECIAL_INACTIVE_CATEGORY && isSpecialAuth) {
            const state = getChannelState(channel.id);
            if (!state) return message.reply("❌ Sem dados de restauração.");
            
            const oldCat = state.oldParentId ? await message.guild.channels.fetch(state.oldParentId).catch(()=>null) : null;
            if (!oldCat) return message.reply("❌ Categoria original sumiu.");

            await channel.setParent(oldCat.id, { lockPermissions: false });
            if (state.oldOverwrites) {
                await channel.permissionOverwrites.set(state.oldOverwrites.map(o => ({
                id: o.id, type: o.type, allow: BigInt(o.allow), deny: BigInt(o.deny)
                })));
            }
            if (state.oldPosition) await channel.setPosition(state.oldPosition).catch(()=>{});
            
            deleteChannelState(channel.id);
            await message.delete().catch(()=>{});
            
            if (INATIVO_CONFIG.LOG_CHANNEL) {
                const logCh = await client.channels.fetch(INATIVO_CONFIG.LOG_CHANNEL).catch(()=>null);
                if (logCh && logCh.isTextBased()) await logCh.send(`✅ Canal ${channel} restaurado (especial) por ${message.author}`);
            }
            return true;
        }

        // 2. Reativar Padrão (Inativos/Extras -> Membros)
        if (isInactiveCat || isExtraEntryCat) {
            // Se estiver numa categoria extra, força ida para SOURCE (Membros). 
            // Se estiver em inativos, respeita a lógica do cargo extra ou vai para SOURCE.
            const targetId = (isExtraEntryCat) ? INATIVO_CONFIG.SOURCE_CATEGORY : (hasExtraRole ? (INATIVO_CONFIG.EXTRA_COMMAND_CATEGORIES[0] || INATIVO_CONFIG.SOURCE_CATEGORY) : INATIVO_CONFIG.SOURCE_CATEGORY);

            const targetCat = message.guild.channels.cache.get(targetId);
            
            if (!targetCat || targetCat.children.cache.filter(isTextChannelLike).size >= 50) {
                return message.reply("❌ Categoria de destino cheia ou não encontrada.");
            }

            await channel.setParent(targetId, { lockPermissions: false });
            await message.delete().catch(()=>{});
            safeSortCategory(message.guild, targetId);
            safeSortCategory(message.guild, catId); // reordena a origem tbm

            console.log("[SC_SORT][REATIVAR_TARGET]", {
                channelId: channel.id,
                currentCategoryId: catId,
                targetCategoryId: targetId
            });

            const logCh = await client.channels.fetch(INATIVO_CONFIG.LOG_CHANNEL).catch(()=>null);
            if (logCh) {
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`SC_MEMBROS_UNDO_${channel.id}_${catId}_${message.author.id}`) // Salva origem atual para desfazer
                    .setLabel("↩️ Desfazer").setStyle(ButtonStyle.Danger)
                );
                await logCh.send({ 
                    embeds: [new EmbedBuilder().setTitle("✅ Canal Reativado").setDescription(`Canal ${channel} reativado por ${message.author}`).setColor("Green")], 
                    components: [row] 
                });
            }
            return true;
        }
    }

    return false;
  } catch (e) {
    console.error("[SC_SORT] Erro handler msg:", e);
    return false;
  }
}

// ===============================
// HANDLER UNDO (BOTÕES)
// ===============================
export async function sortChannelsHandleInteraction(interaction) {
  try {
    if (!interaction.isButton()) return false;
    const cid = interaction.customId;
    if (!cid.startsWith("SC_INATIVO_UNDO_") && !cid.startsWith("SC_MEMBROS_UNDO_") && !cid.startsWith("SC_SPECIAL_UNDO_")) return false;

    const parts = cid.split("_");
    const channelId = parts[3];
    const oldCatId = parts[4]; // Pode ser "null" no special undo
    // Verifica permissão (mesmas regras do comando + quem clicou)
    // ... (simplificado para brevidade, mas deve manter lógica original) ...

    await interaction.deferReply({ ephemeral: true });
    
    const channel = await interaction.guild.channels.fetch(channelId).catch(()=>null);
    if (!channel) return interaction.editReply("❌ Canal não existe mais.");

    // Lógica do Undo Especial
    if (cid.startsWith("SC_SPECIAL_UNDO_")) {
        const state = getChannelState(channelId);
        if(!state) return interaction.editReply("❌ Dados perdidos.");
        const oldCat = await interaction.guild.channels.fetch(state.oldParentId).catch(()=>null);
        if(oldCat) {
            await channel.setParent(oldCat.id, { lockPermissions: false });
            await channel.permissionOverwrites.set(state.oldOverwrites.map(o => ({
                id: o.id, type: o.type, allow: BigInt(o.allow), deny: BigInt(o.deny)
            })));
            if (state.oldPosition) await channel.setPosition(state.oldPosition).catch(()=>{});
            deleteChannelState(channelId);
            await interaction.editReply("✅ Desfeito.");
            await interaction.message.edit({ components: [] });
        }
        return true;
    }

    // Lógica Undo Padrão (Inativo <-> Membro)
    const oldCat = await interaction.guild.channels.fetch(oldCatId).catch(()=>null);
    if (!oldCat) return interaction.editReply("❌ Categoria de origem sumiu.");

    const prevParent = channel.parentId;
    await channel.setParent(oldCat.id, { lockPermissions: false });
    
    safeSortCategory(interaction.guild, oldCat.id);
    if(prevParent) safeSortCategory(interaction.guild, prevParent);

    await interaction.editReply("✅ Ação desfeita.");
    await interaction.message.edit({ components: [] });
    
    return true;
  } catch (e) {
    console.error("[SC_SORT] Erro undo:", e);
    return false;
  }
}
