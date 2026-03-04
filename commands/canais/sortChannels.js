// application/commands/canais/sortChannels.js
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
      { id: "1414687963161559180", limit: 30 }, // ✅ Deixa 20 vagas livres (50-20=30)
      { id: "1428572742051168378", limit: 50 },
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
// CONFIGURAÇÃO DO COMANDO !INATIVO
// ===============================
const INATIVO_CONFIG = {
  // Quem pode usar
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

  // Categoria de origem permitida (exceto para Owners/Eu)
  SOURCE_CATEGORY: "1384650670145278033",

  // Categorias de destino (Inativos) - Ordem de prioridade para preencher
  TARGET_CATEGORIES: [
    "1383899907244425246", // 1ª
    "1410071955159122051", // 2ª
    "1477566945598640251", // 3ª
  ],

  // Canal de Logs
  LOG_CHANNEL: "1477570850302591090",
};

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
    // Reinicia contadores locais para tracking de posição relativa
    const catPositionCounters = new Map(); 
    cats.forEach(id => catPositionCounters.set(id, 0));

    let changesCount = 0; // ✅ Contador de alterações para evitar log flood

    for (const ch of sortedAll) {
      const targetCatId = assignments.get(ch.id);
      if (!targetCatId) continue; // Skip overflow/unassigned

      const catConfig = groupConfig.categories.find(c => c.id === targetCatId);
      const targetPos = catPositionCounters.get(targetCatId);
      catPositionCounters.set(targetCatId, targetPos + 1);

      // Se está na categoria errada, move
      if (ch.parentId !== targetCatId) {
        
        // 🚨 VERIFICAÇÃO DE SEGURANÇA: A categoria destino está cheia?
        const currentTargetSize = catCounts.get(targetCatId) || 0;
        
        if (currentTargetSize >= 50) {
          // Tenta achar alguém lá dentro que NÃO deveria estar lá (intruso) para expulsar
          const targetCatChannel = guild.channels.cache.get(targetCatId);
          if (targetCatChannel) {
            const intruder = targetCatChannel.children.cache.find(c => {
               const dest = assignments.get(c.id);
               return dest && dest !== targetCatId; // É intruso se tem destino E destino não é aqui
            });

            if (intruder) {
              const intruderDest = assignments.get(intruder.id);
              // Só move se o destino do intruso for válido
              if (intruderDest) {
                 try {
                    await intruder.setParent(intruderDest, { lockPermissions: false });
                    changesCount++;
                    // Atualiza contadores locais
                    catCounts.set(targetCatId, currentTargetSize - 1);
                    catCounts.set(intruderDest, (catCounts.get(intruderDest) || 0) + 1);
                    await new Promise((r) => setTimeout(r, 1000));
                 } catch (err) {
                    console.error(`[SC_SORT] Falha ao mover intruso ${intruder.name}:`, err);
                 }
              }
            }
          }
        }
        
        // Verifica de novo se liberou vaga (ou se forçamos mesmo assim, vai dar erro se tiver 50)
        if ((catCounts.get(targetCatId) || 0) < 50) {
            try {
              await ch.setParent(targetCatId, { lockPermissions: false });
              changesCount++;
              // Atualiza contadores após mover
              catCounts.set(ch.parentId, (catCounts.get(ch.parentId) || 0) - 1);
              catCounts.set(targetCatId, (catCounts.get(targetCatId) || 0) + 1);
              await new Promise((r) => setTimeout(r, 1200));
            } catch (err) {
              if (err.code === 50035) { // Invalid Form Body (Category Full)
                 // console.warn(`[SC_SORT] ⚠️ Categoria ${targetCatId} cheia (API recusou). Pulei ${ch.name}.`);
                 catCounts.set(targetCatId, 50); // Marca como cheia pra não tentar de novo
              } else console.error(`[SC_SORT] Erro ao mover ${ch.name}:`, err.message);
            }
        } else {
            // console.warn(`[SC_SORT] Pulei mover ${ch.name} para ${targetCatId} pois continua cheia (50).`);
        }
      }

      // ✅ Renomeia se tiver prefixo configurado (ex: 📁┋)
      if (catConfig.prefix) {
        const currentName = ch.name;
        const targetPrefix = catConfig.prefix;

        if (!currentName.startsWith(targetPrefix)) {
          let newName = currentName;
          // Se já tem o separador "┋", só adiciona a pasta antes
          if (currentName.startsWith("┋")) {
            newName = "📁" + currentName;
          } else {
            newName = targetPrefix + currentName;
          }
          
          if (newName !== currentName) {
            await ch.setName(newName).catch(e => console.warn(`[SC_SORT] Falha ao renomear ${ch.name}:`, e));
            changesCount++;
            await new Promise((r) => setTimeout(r, 1500)); // Delay extra para rename
          }
        }
      }

      // Ajusta a posição se necessário
      // (Nota: setPosition é relativo à categoria)
      if (ch.position !== targetPos) {
        await ch.setPosition(targetPos);
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
    const isComandoInativo = content === "!inativo";
    const isComandoMembros = content === "!membros";

    if (!isComandoInativo && !isComandoMembros) return false;

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

    const isAllowedUser = INATIVO_CONFIG.ALLOWED_USERS.includes( // Permissões são as mesmas para ambos
      message.author.id
    );
    const isAllowedRole = member.roles.cache.some((r) =>
      INATIVO_CONFIG.ALLOWED_ROLES.includes(r.id)
    );

    if (!isAllowedUser && !isAllowedRole) {
      setTimeout(() => message.delete().catch(() => {}), 1000);
      const msg = await message.reply(
        "❌ Você não tem permissão para usar este comando."
      );
      setTimeout(() => msg.delete().catch(() => {}), 5000);
      return true;
    }

    const channel = message.channel;
    const oldCategoryId = channel.parentId;
    const oldCategory = oldCategoryId ? message.guild.channels.cache.get(oldCategoryId) : null;
    const oldCategoryName = oldCategory?.name || "Sem Categoria";

    // =====================================================
    // LÓGICA PARA !INATIVO
    // =====================================================
    if (isComandoInativo) {
      // 2. Verifica Categoria de Origem (se não for Owner/Eu)
      if (
        !isAllowedUser &&
        channel.parentId !== INATIVO_CONFIG.SOURCE_CATEGORY
      ) {
        const msg = await message.reply(
          `❌ Este comando só pode ser usado na categoria <#${INATIVO_CONFIG.SOURCE_CATEGORY}>.`
        );
        setTimeout(() => msg.delete().catch(() => {}), 8000);
        return true;
      }

      // 3. Encontra Categoria de Destino com Vaga
      let targetCategory = null;
      for (const catId of INATIVO_CONFIG.TARGET_CATEGORIES) {
        const cat = message.guild.channels.cache.get(catId);
        if (cat && cat.children.cache.size < 50) {
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

      // 4. Executa a Movimentação
      await channel.setParent(targetCategory.id, { lockPermissions: false });
      await message.delete().catch(() => {}); // Apaga o comando

      // 5. Ordena a categoria de destino imediatamente
      await safeSortCategory(message.guild, targetCategory.id);

      // 6. Log com Botão de Desfazer
      const logChannel = await client.channels.fetch(INATIVO_CONFIG.LOG_CHANNEL).catch(() => null);
      if (logChannel && logChannel.isTextBased()) {
        const embed = new EmbedBuilder()
          .setTitle("📦 Canal Movido para Inativos")
          .setColor("Orange")
          .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
          .addFields(
            { name: "👤 Executor", value: `${message.author} (\`${message.author.id}\`)`, inline: true },
            { name: "📺 Canal", value: `${channel} (\`${channel.name}\`)`, inline: true },
            { name: "📂 Origem", value: `${oldCategoryName} (\`${oldCategoryId || "N/A"}\`)`, inline: false },
            { name: "📂 Destino", value: `${targetCategory.name} (\`${targetCategory.id}\`)`, inline: false },
            { name: "🕒 Data/Hora", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
          )
          .setFooter({ text: "Sistema de Organização Automática • SantaCreators" });

        const customId = `SC_INATIVO_UNDO_${channel.id}_${oldCategoryId || "null"}_${message.author.id}`;
        
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
    // LÓGICA PARA !MEMBROS
    // =====================================================
    if (isComandoMembros) {
      // 2. Verifica Categoria de Origem (tem que ser uma das de inativos)
      if (
        !isAllowedUser &&
        !INATIVO_CONFIG.TARGET_CATEGORIES.includes(channel.parentId)
      ) {
        const allowedCats = INATIVO_CONFIG.TARGET_CATEGORIES.map(id => `<#${id}>`).join(', ');
        const msg = await message.reply(
          `❌ Este comando só pode ser usado em canais nas categorias de inativos: ${allowedCats}.`
        );
        setTimeout(() => msg.delete().catch(() => {}), 8000);
        return true;
      }

      // 3. Categoria de Destino é a de membros ativos
      const targetCategoryId = INATIVO_CONFIG.SOURCE_CATEGORY;
      const targetCategory = message.guild.channels.cache.get(targetCategoryId);

      if (!targetCategory) {
          await message.reply(
              `❌ A categoria de destino <#${targetCategoryId}> não foi encontrada.`
          );
          return true;
      }
      if (targetCategory.children.cache.size >= 50) {
          await message.reply(
              `❌ A categoria de destino <#${targetCategoryId}> está cheia.`
          );
          return true;
      }

      // 4. Executa a Movimentação
      await channel.setParent(targetCategory.id, { lockPermissions: false });
      await message.delete().catch(() => {}); // Apaga o comando

      // 5. Ordena a categoria de destino imediatamente
      await safeSortCategory(message.guild, targetCategory.id);

      // 6. Log com Botão de Desfazer
      const logChannel = await client.channels.fetch(INATIVO_CONFIG.LOG_CHANNEL).catch(() => null);
      if (logChannel && logChannel.isTextBased()) {
        const embed = new EmbedBuilder()
          .setTitle("✅ Canal Reativado para Membros")
          .setColor("Green")
          .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
          .addFields(
            { name: "👤 Executor", value: `${message.author} (\`${message.author.id}\`)`, inline: true },
            { name: "📺 Canal", value: `${channel} (\`${channel.name}\`)`, inline: true },
            { name: "📂 Origem", value: `${oldCategoryName} (\`${oldCategoryId || "N/A"}\`)`, inline: false },
            { name: "📂 Destino", value: `${targetCategory.name} (\`${targetCategory.id}\`)`, inline: false },
            { name: "🕒 Data/Hora", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
          )
          .setFooter({ text: "Sistema de Organização Automática • SantaCreators" });

        const customId = `SC_MEMBROS_UNDO_${channel.id}_${oldCategoryId || "null"}_${message.author.id}`;
        
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
  } catch (e) {
    console.error("[SC_SORT] Erro ao mover canal:", e);
    return false;
  }
}

// =====================================================
// HANDLER DA INTERAÇÃO (BOTÃO DESFAZER)
// =====================================================
export async function sortChannelsHandleInteraction(interaction, client) {
  try {
    if (!interaction.isButton()) return false;

    const isUndoInativo = interaction.customId.startsWith("SC_INATIVO_UNDO_");
    const isUndoMembros = interaction.customId.startsWith("SC_MEMBROS_UNDO_");

    if (!isUndoInativo && !isUndoMembros) return false;

    // Parse do ID
    const parts = interaction.customId.split("_");
    // SC, (INATIVO|MEMBROS), UNDO, channelId, oldCatId, userId
    const channelId = parts[3];
    const oldCatId = parts[4];
    const originalUserId = parts[5];

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
    await channel.setParent(oldCategory.id, { lockPermissions: false });
    
    // Ordena a categoria de origem (para onde voltou)
    await safeSortCategory(interaction.guild, oldCategory.id);

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
