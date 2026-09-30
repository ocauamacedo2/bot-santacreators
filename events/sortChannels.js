

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
  OverwriteType,
} from "discord.js";

import { dashOn } from "../../utils/dashHub.js";

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
  strategy: "leaders_weighted_reserve",
  categories: [
    { id: "1414687963161559180", limit: 30 }, // ✅ A/início: mantém no mínimo 20 vagas livres
    { id: "1428572742051168378", limit: 35 }, // ✅ Meio: mantém no mínimo 15 vagas livres
    { id: "1482874296685695118", limit: 50 }, // ✅ Z/final: pode ocupar as 50 vagas
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

  // ✅ Categorias da lógica padrão onde os autorizados padrão podem usar
  // !inativo / !inativos / !membro / !membros / !reativar
  STANDARD_FLOW_CATEGORIES: [
    "1444857594517913742",
    "1359244725781266492",
    "1384650670145278033",
    "1383899907244425246",
    "1410071955159122051",
    "1477566945598640251",
  ],

  // ✅ Mantido por compatibilidade, mas agora espelha as categorias extras de entrada
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

// =====================================================
// AUTOMAÇÃO DO TICKET DO MEMBRO / CONTROLE GI
// =====================================================
const CREATOR_TICKET_AUTO = {
  ROLE_SANTA_CREATORS: "1352275728476930099",

  // Categoria original de entrevista.
  INTERVIEW_CATEGORY: "1359244725781266492",

  // Categoria intermediária: só desce automaticamente daqui.
  WAITING_CATEGORY: "1444857594517913742",

  // Categoria oficial de membros ativos.
  ACTIVE_CATEGORY: "1384650670145278033",

  // Mesmas categorias já usadas pelo !inativo.
  INACTIVE_CATEGORIES: [
    "1383899907244425246",
    "1410071955159122051",
    "1477566945598640251",
  ],
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

// ✅ Resolve a categoria "real" do canal para comandos de movimentação.
// Em canal normal: usa parentId.
// Em canal cujo pai não é categoria direta: tenta subir 1 nível.
function resolveEffectiveCategoryId(channel) {
  if (!channel) return null;

  // Caso comum: o pai já é uma categoria
  if (channel.parent?.type === ChannelType.GuildCategory) {
    return channel.parentId ?? null;
  }

  // Caso em que o canal está "dentro" de algo cujo pai é a categoria
  if (channel.parent?.parentId) {
    return channel.parent.parentId;
  }

  return channel.parentId ?? null;
}

// Variáveis globais do módulo de ordenação
const runningLocks = new Map();
const debouncers = new Map();

// Cache do dono do ticket para evitar refetch constante de mensagens.
const CREATOR_TICKET_OWNER_CACHE = new Map();
const CREATOR_TICKET_OWNER_CACHE_TTL_MS = 30 * 60 * 1000;

// Controle do failsafe de reconciliação dos membros ativos.
const CREATOR_ACTIVE_RECONCILE_LAST_RUN = new Map();
const CREATOR_ACTIVE_RECONCILE_INTERVAL_MS = 60 * 1000;

// =====================================================
// AUTOMAÇÃO: TICKET DO MEMBRO / CONTROLE GI
// =====================================================
function isAutomationTextChannelLike(channel) {
  return (
    channel &&
    channel.type !== ChannelType.GuildCategory &&
    !(typeof channel.isThread === "function" && channel.isThread())
  );
}

async function extractCreatorTicketOwnerFromHeader(channel) {
  try {
    const pool = [];

    const pins = await channel.messages.fetchPinned().catch(() => null);
    if (pins?.size) pool.push(...pins.values());

    if (!pool.length) {
      const recent = await channel.messages.fetch({ limit: 30 }).catch(() => null);
      if (recent?.size) pool.push(...recent.values());
    }

    for (const message of pool) {
      for (const embed of message.embeds || []) {
        const fields = embed.data?.fields || embed.fields || [];
        const abertoPor = fields.find(
          (field) => String(field?.name || "").toLowerCase() === "aberto por:"
        );

        const match = String(abertoPor?.value || "").match(/<@(\d+)>/);
        if (match?.[1]) return match[1];
      }
    }
  } catch {}

  return null;
}

function extractCreatorTicketOwnerFromOverwrites(channel) {
  const overwrites = channel.permissionOverwrites?.cache;
  if (!overwrites) return null;

  const memberOverwrites = overwrites.filter(
    (overwrite) =>
      overwrite.type === OverwriteType.Member &&
      overwrite.allow.has(PermissionsBitField.Flags.ViewChannel)
  );

  const withSendMessages = memberOverwrites.find((overwrite) =>
    overwrite.allow.has(PermissionsBitField.Flags.SendMessages)
  );

  if (withSendMessages) return withSendMessages.id;
  return memberOverwrites.first()?.id ?? null;
}

async function resolveCreatorTicketOwnerId(channel) {
  if (!channel?.id) return null;

  const cached = CREATOR_TICKET_OWNER_CACHE.get(channel.id);

  if (
    cached?.userId &&
    Date.now() - Number(cached.resolvedAt || 0) <
      CREATOR_TICKET_OWNER_CACHE_TTL_MS
  ) {
    return cached.userId;
  }

  const fromHeader = await extractCreatorTicketOwnerFromHeader(channel);
  const resolved =
    fromHeader ||
    extractCreatorTicketOwnerFromOverwrites(channel) ||
    null;

  if (resolved) {
    CREATOR_TICKET_OWNER_CACHE.set(channel.id, {
      userId: String(resolved),
      resolvedAt: Date.now(),
    });
  }

  return resolved;
}

async function findCreatorTicketsForUser(guild, userId, allowedCategoryIds) {
  const categoryIds = new Set(allowedCategoryIds);
  const matches = [];

  for (const channel of guild.channels.cache.values()) {
    if (channel.type !== ChannelType.GuildText) continue;
    if (!channel.parentId || !categoryIds.has(channel.parentId)) continue;

    const ownerId = await resolveCreatorTicketOwnerId(channel);
    if (String(ownerId) === String(userId)) {
      matches.push(channel);
    }
  }

  return matches;
}

async function getFirstAvailableInactiveCategory(guild) {
  for (const categoryId of CREATOR_TICKET_AUTO.INACTIVE_CATEGORIES) {
    const category = await guild.channels.fetch(categoryId).catch(() => null);
    if (!category || category.type !== ChannelType.GuildCategory) continue;

    const childrenCount = category.children.cache.filter(
      isAutomationTextChannelLike
    ).size;

    if (childrenCount < 50) return category;
  }

  return null;
}

async function moveCreatorTicketAutomatically(
  channel,
  targetCategoryId,
  reason,
  { saveInactiveOrigin = false } = {}
) {
  if (!channel?.guild || channel.parentId === targetCategoryId) return false;

  const targetCategory = await channel.guild.channels
    .fetch(targetCategoryId)
    .catch(() => null);

  if (!targetCategory || targetCategory.type !== ChannelType.GuildCategory) {
    console.warn(
      `[SC_SORT][AUTO_TICKET] Categoria de destino ${targetCategoryId} não encontrada.`
    );
    return false;
  }

  const targetChildrenCount = targetCategory.children.cache.filter(
    isAutomationTextChannelLike
  ).size;

  if (targetChildrenCount >= 50) {
    console.warn(
      `[SC_SORT][AUTO_TICKET] Categoria ${targetCategoryId} cheia. Canal ${channel.id} não foi movido.`
    );
    return false;
  }

  const oldParentId = channel.parentId;

  if (
    saveInactiveOrigin &&
    oldParentId &&
    !CREATOR_TICKET_AUTO.INACTIVE_CATEGORIES.includes(oldParentId)
  ) {
    storeChannelState(channel);
  }

  await channel.setParent(targetCategoryId, {
    lockPermissions: false,
    reason,
  });

  await safeSortCategory(channel.guild, targetCategoryId);

  if (oldParentId && oldParentId !== targetCategoryId) {
    await safeSortCategory(channel.guild, oldParentId);
  }

  console.log(
    `[SC_SORT][AUTO_TICKET] ${channel.id}: ${oldParentId} -> ${targetCategoryId} | ${reason}`
  );

  return true;
}

async function syncCreatorTicketAfterSetApproval(guild, userId) {
  const tickets = await findCreatorTicketsForUser(
    guild,
    userId,
    [CREATOR_TICKET_AUTO.WAITING_CATEGORY]
  );

  for (const channel of tickets) {
    await moveCreatorTicketAutomatically(
      channel,
      CREATOR_TICKET_AUTO.ACTIVE_CATEGORY,
      "SantaCreators: Set aprovado -> mover ticket para membros ativos"
    );
  }
}

async function syncCreatorTicketAfterGiDisabled(guild, userId) {
  const tickets = await findCreatorTicketsForUser(
    guild,
    userId,
    [
      CREATOR_TICKET_AUTO.INTERVIEW_CATEGORY,
      CREATOR_TICKET_AUTO.WAITING_CATEGORY,
      CREATOR_TICKET_AUTO.ACTIVE_CATEGORY,
    ]
  );

  for (const channel of tickets) {
    const inactiveCategory = await getFirstAvailableInactiveCategory(guild);

    if (!inactiveCategory) {
      console.warn(
        `[SC_SORT][AUTO_TICKET] Todas as categorias de inativos estão cheias para ${userId}.`
      );
      return;
    }

    await moveCreatorTicketAutomatically(
      channel,
      inactiveCategory.id,
      "SantaCreators: Controle GI desligado -> mover ticket para inativos",
      { saveInactiveOrigin: true }
    );
  }
}

async function syncCreatorTicketMovedIntoWaiting(channel) {
  if (channel?.type !== ChannelType.GuildText) return;
  if (channel.parentId !== CREATOR_TICKET_AUTO.WAITING_CATEGORY) return;

  const ownerId = await resolveCreatorTicketOwnerId(channel);
  if (!ownerId) return;

  const member = await channel.guild.members.fetch(ownerId).catch(() => null);
  if (!member) return;

  // Só desce sozinho se a pessoa já estiver com o Set/SantaCreators aprovado.
  if (!member.roles.cache.has(CREATOR_TICKET_AUTO.ROLE_SANTA_CREATORS)) return;

  await moveCreatorTicketAutomatically(
    channel,
    CREATOR_TICKET_AUTO.ACTIVE_CATEGORY,
    "SantaCreators: ticket movido para a fila após Set já aprovado"
  );
}

function getCreatorGiControlState(guildId, userId) {
  const api = globalThis.SC_GI_CONTROL_API;

  if (
    !api ||
    api.ready !== true ||
    typeof api.getControl !== "function"
  ) {
    return {
      available: false,
      authoritative: false,
      exists: null,
      active: null,
      paused: null,
    };
  }

  const control = api.getControl(guildId, userId);

  return {
    available: true,
    authoritative: api.authoritative === true,
    exists: !!control,
    active: control?.active === true,
    paused: control?.paused === true,
    control: control || null,
  };
}

async function fetchCreatorMemberSafely(guild, userId) {
  const cached = guild.members.cache.get(userId);

  if (cached) {
    return {
      member: cached,
      definitiveMissing: false,
      lookupFailed: false,
    };
  }

  try {
    const member = await guild.members.fetch(userId);

    return {
      member,
      definitiveMissing: false,
      lookupFailed: false,
    };
  } catch (error) {
    // Discord API: Unknown Member.
    if (Number(error?.code || 0) === 10007) {
      return {
        member: null,
        definitiveMissing: true,
        lookupFailed: false,
      };
    }

    console.warn(
      `[SC_SORT][RECONCILE] Não foi possível confirmar o membro ${userId}:`,
      error?.message || error
    );

    return {
      member: null,
      definitiveMissing: false,
      lookupFailed: true,
    };
  }
}

async function reconcileCreatorActiveChannel(
  channel,
  trigger = "supervisor"
) {
  if (
    !channel?.guild ||
    channel.type !== ChannelType.GuildText
  ) {
    return {
      checked: false,
      moved: false,
    };
  }

  if (
    channel.parentId !==
    CREATOR_TICKET_AUTO.ACTIVE_CATEGORY
  ) {
    return {
      checked: false,
      moved: false,
    };
  }

  const ownerId =
    await resolveCreatorTicketOwnerId(channel);

  if (!ownerId) {
    console.warn(
      `[SC_SORT][RECONCILE] Canal ${channel.id} ignorado: não foi possível identificar o dono.`
    );

    return {
      checked: true,
      moved: false,
      skipped: "owner_not_found",
    };
  }

  const memberState =
    await fetchCreatorMemberSafely(
      channel.guild,
      String(ownerId)
    );

  // Em falha transitória de API, não move nada.
  if (memberState.lookupFailed) {
    return {
      checked: true,
      moved: false,
      skipped: "member_lookup_failed",
    };
  }

  const issues = [];

  if (memberState.definitiveMissing) {
    issues.push(
      "membro não está mais no servidor"
    );
  } else if (
    memberState.member &&
    !memberState.member.roles.cache.has(
      CREATOR_TICKET_AUTO.ROLE_SANTA_CREATORS
    )
  ) {
    issues.push(
      "membro não possui mais o cargo SantaCreators"
    );
  }

  const giState =
    getCreatorGiControlState(
      channel.guild.id,
      String(ownerId)
    );

  // Só usa ausência de Controle GI como prova quando a base foi
  // carregada com segurança e é considerada autoritativa.
  if (
    giState.available &&
    giState.authoritative &&
    !giState.exists
  ) {
    issues.push(
      "membro não possui Controle GI registrado"
    );
  }

  // Controle pausado continua sendo controle existente.
  if (issues.length === 0) {
    return {
      checked: true,
      moved: false,
      ownerId: String(ownerId),
      giState,
    };
  }

  const inactiveCategory =
    await getFirstAvailableInactiveCategory(
      channel.guild
    );

  if (!inactiveCategory) {
    console.warn(
      `[SC_SORT][RECONCILE] Não há categoria de inativos disponível para ${channel.id}.`
    );

    return {
      checked: true,
      moved: false,
      ownerId: String(ownerId),
      skipped: "inactive_categories_full",
      issues,
    };
  }

  const moved =
    await moveCreatorTicketAutomatically(
      channel,
      inactiveCategory.id,
      `SantaCreators: reconciliação automática (${trigger}) -> ${issues.join("; ")}`,
      {
        saveInactiveOrigin: true,
      }
    );

  return {
    checked: true,
    moved: !!moved,
    ownerId: String(ownerId),
    issues,
    giState,
  };
}

async function reconcileCreatorActiveTicketsForUser(
  guild,
  userId,
  trigger = "member_event"
) {
  if (!guild || !userId) return;

  const tickets =
    await findCreatorTicketsForUser(
      guild,
      String(userId),
      [
        CREATOR_TICKET_AUTO.ACTIVE_CATEGORY,
      ]
    );

  for (const channel of tickets) {
    await reconcileCreatorActiveChannel(
      channel,
      trigger
    );
  }
}

async function reconcileCreatorActiveCategory(
  guild,
  {
    force = false,
    trigger = "supervisor",
  } = {}
) {
  if (!guild) return;

  const lockKey =
    `CREATOR_ACTIVE_RECONCILE:${guild.id}`;

  if (runningLocks.get(lockKey)) {
    return;
  }

  const lastRun =
    CREATOR_ACTIVE_RECONCILE_LAST_RUN.get(
      guild.id
    ) || 0;

  if (
    !force &&
    Date.now() - lastRun <
      CREATOR_ACTIVE_RECONCILE_INTERVAL_MS
  ) {
    return;
  }

  runningLocks.set(
    lockKey,
    true
  );

  try {
    const activeCategory =
      guild.channels.cache.get(
        CREATOR_TICKET_AUTO.ACTIVE_CATEGORY
      ) ||
      await guild.channels
        .fetch(
          CREATOR_TICKET_AUTO.ACTIVE_CATEGORY
        )
        .catch(() => null);

    if (
      !activeCategory ||
      activeCategory.type !==
        ChannelType.GuildCategory
    ) {
      return;
    }

    let checked = 0;
    let moved = 0;
    let skipped = 0;

    for (
      const channel
      of activeCategory.children.cache.values()
    ) {
      if (
        channel.type !==
        ChannelType.GuildText
      ) {
        continue;
      }

      const result =
        await reconcileCreatorActiveChannel(
          channel,
          trigger
        );

      if (result?.checked) checked++;
      if (result?.moved) moved++;
      if (result?.skipped) skipped++;
    }

    CREATOR_ACTIVE_RECONCILE_LAST_RUN.set(
      guild.id,
      Date.now()
    );

    console.log(
      `[SC_SORT][RECONCILE] ${guild.name}: verificados=${checked}, movidos=${moved}, ignorados=${skipped}, gatilho=${trigger}`
    );
  } catch (error) {
    console.error(
      "[SC_SORT][RECONCILE] Erro na reconciliação da categoria ativa:",
      error
    );
  } finally {
    runningLocks.set(
      lockKey,
      false
    );
  }
}

// =====================================================
// FORMATAÇÃO AUTOMÁTICA DOS CANAIS DE LÍDERES
// =====================================================

// ✅ Somente os canais que estiverem nestas categorias receberão
// o nome formatado com caracteres Unicode Mathematical Monospace.
const LEADER_NAME_FORMAT_CATEGORY_IDS = new Set([
  "1414687963161559180",
  "1428572742051168378",
  "1482874296685695118",
]);

// ✅ Converte caracteres Mathematical Monospace já existentes
// de volta para letras e números normais.
//
// Isso permite corrigir nomes que estejam:
// • parcialmente formatados;
// • com letras maiúsculas ou minúsculas erradas;
// • misturando caracteres normais e Mathematical Monospace.
function mathematicalMonospaceToPlainText(value) {
  const text = String(value ?? "");
  let result = "";

  for (const character of text) {
    const codePoint = character.codePointAt(0);

    // Mathematical Monospace Capital A-Z
    if (codePoint >= 0x1D670 && codePoint <= 0x1D689) {
      result += String.fromCodePoint(
        "A".codePointAt(0) + (codePoint - 0x1D670)
      );
      continue;
    }

    // Mathematical Monospace Small a-z
    if (codePoint >= 0x1D68A && codePoint <= 0x1D6A3) {
      result += String.fromCodePoint(
        "a".codePointAt(0) + (codePoint - 0x1D68A)
      );
      continue;
    }

    // Mathematical Monospace Digit 0-9
    if (codePoint >= 0x1D7F6 && codePoint <= 0x1D7FF) {
      result += String.fromCodePoint(
        "0".codePointAt(0) + (codePoint - 0x1D7F6)
      );
      continue;
    }

    result += character;
  }

  return result;
}

// ✅ Converte letras e números normais para
// Unicode Mathematical Monospace.
//
// A normalização NFD separa letras de seus acentos.
// Exemplo:
// ã passa a ser "a" + "~"
//
// Assim, a letra recebe o formato Mathematical Monospace
// enquanto o acento continua sendo preservado.
function plainTextToMathematicalMonospace(value) {
  const text = String(value ?? "").normalize("NFD");
  let result = "";

  for (const character of text) {
    const codePoint = character.codePointAt(0);

    // Letras maiúsculas A-Z
    if (codePoint >= 65 && codePoint <= 90) {
      result += String.fromCodePoint(0x1D670 + (codePoint - 65));
      continue;
    }

    // Letras minúsculas a-z
    if (codePoint >= 97 && codePoint <= 122) {
      result += String.fromCodePoint(0x1D68A + (codePoint - 97));
      continue;
    }

    // Números 0-9
    if (codePoint >= 48 && codePoint <= 57) {
      result += String.fromCodePoint(0x1D7F6 + (codePoint - 48));
      continue;
    }

    // Mantém hífens, acentos, símbolos e demais caracteres.
    result += character;
  }

  return result;
}

// ✅ Deixa a primeira letra de cada parte separada por hífen
// em maiúscula e o restante em minúscula.
//
// Exemplos:
// morro-do-sacola   -> Morro-Do-Sacola
// MORRO-DO-SACOLA   -> Morro-Do-Sacola
// Morro-do-Sacola   -> Morro-Do-Sacola
function formatLeaderPlainChannelName(value) {
  const plainName = mathematicalMonospaceToPlainText(value)
    .normalize("NFC")
    .trim();

  // ✅ Preserva qualquer prefixo existente antes do nome.
  //
  // Exemplos preservados:
  // 🎫┋Galaxy
  // 📁┋Logs
  // 🔒┋Privado
  //
  // O prefixo não recebe alteração e não é removido.
  const prefixMatch = plainName.match(/^([^A-Za-zÀ-ÖØ-öø-ÿ0-9]*)(.*)$/u);

  const preservedPrefix = prefixMatch?.[1] || "";
  const nameWithoutPrefix = prefixMatch?.[2] || plainName;

  const formattedName = nameWithoutPrefix
    .split("-")
    .map((part) => {
      if (!part) return part;

      const trimmedPart = part.trim();
      if (!trimmedPart) return part;

      const characters = Array.from(trimmedPart);

      // ✅ Quando a parte possui apenas uma letra,
      // força essa letra a permanecer maiúscula.
      //
      // Exemplos:
      // p-c-j -> P-C-J
      // P-c-j -> P-C-J
      // p-C-J -> P-C-J
      if (
        characters.length === 1 &&
        /^[A-Za-zÀ-ÖØ-öø-ÿ]$/u.test(trimmedPart)
      ) {
        return trimmedPart.toLocaleUpperCase("pt-BR");
      }

      // ✅ Para nomes normais, mantém somente a primeira letra
      // maiúscula e o restante em minúsculo.
      //
      // Exemplos:
      // morro -> Morro
      // DO -> Do
      // SACOLA -> Sacola
      const lowerPart = trimmedPart.toLocaleLowerCase("pt-BR");
      const lowerCharacters = Array.from(lowerPart);

      if (lowerCharacters.length === 0) return trimmedPart;

      const firstCharacter = lowerCharacters
        .shift()
        .toLocaleUpperCase("pt-BR");

      return firstCharacter + lowerCharacters.join("");
    })
    .join("-");

  return preservedPrefix + formattedName;
}

// ✅ Retorna o nome final que será aplicado ao canal.
function formatLeaderChannelName(value) {
  const formattedPlainName = formatLeaderPlainChannelName(value);
  return plainTextToMathematicalMonospace(formattedPlainName);
}

// ✅ Retorna uma versão normal do nome para comparação alfabética.
//
// Dessa forma, canais com nomes normais e canais que já possuem
// Mathematical Monospace continuam sendo organizados corretamente.
function getLeaderChannelSortName(value) {
  return formatLeaderPlainChannelName(value);
}

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
regularChannels.sort((a, b) => {
  // ✅ No grupo de líderes, compara os nomes sem os caracteres
  // Mathematical Monospace para preservar a ordem alfabética correta.
  if (groupConfig.id === "LIDERES") {
    return collator.compare(
      getLeaderChannelSortName(a.name),
      getLeaderChannelSortName(b.name)
    );
  }

  // ✅ Os demais grupos continuam exatamente com a lógica anterior.
  return collator.compare(a.name, b.name);
});

// 4. Lista Final Combinada (Fixos primeiro)
const sortedAll = [...stickyChannels, ...regularChannels];

    // 5. Distribuição Inteligente (Lógica + Física)
    const assignments = new Map(); // ChannelID -> TargetCatID (lógica)
    const catUsage = new Map(); // CatID -> Count Assigned (lógica)
    cats.forEach((id) => catUsage.set(id, 0)); // Initialize with 0 assigned channels

    let pendingChannels = []; // Channels that couldn't be assigned within logical limits

    if (groupConfig.strategy === "leaders_weighted_reserve" && groupConfig.categories.length >= 3) {
      const [firstCat, secondCat, thirdCat] = groupConfig.categories;

      const firstLimit = Math.min(firstCat.limit, 50);
      const secondLimit = Math.min(secondCat.limit, 50);
      const thirdLimit = Math.min(thirdCat.limit, 50);

      // =====================================================
      // LÍDERES — A→Z COM RESERVA E PESO POR CAPACIDADE
      // =====================================================
      // • 1ª categoria: máximo 30 canais -> pelo menos 20 vagas livres.
      // • 2ª categoria: máximo 35 canais -> pelo menos 15 vagas livres.
      // • 3ª categoria: máximo 50 canais -> pode ficar cheia.
      //
      // Os canais sticky permanecem fixos no topo da 1ª categoria
      // e contam normalmente dentro do limite de 30.
      for (const ch of stickyChannels) {
        if ((catUsage.get(firstCat.id) || 0) >= firstLimit) {
          pendingChannels.push(ch);
          continue;
        }

        assignments.set(ch.id, firstCat.id);
        catUsage.set(firstCat.id, (catUsage.get(firstCat.id) || 0) + 1);
      }

      const availableCapacity = [
        Math.max(0, firstLimit - (catUsage.get(firstCat.id) || 0)),
        secondLimit,
        thirdLimit,
      ];

      const totalAvailableCapacity = availableCapacity.reduce(
        (sum, value) => sum + value,
        0
      );

      const distributableCount = Math.min(
        regularChannels.length,
        totalAvailableCapacity
      );

      const rawTargets = availableCapacity.map((capacity) =>
        totalAvailableCapacity > 0
          ? (distributableCount * capacity) / totalAvailableCapacity
          : 0
      );

      const targetCounts = rawTargets.map((value, index) =>
        Math.min(
          availableCapacity[index],
          Math.floor(value)
        )
      );

      let leftovers =
        distributableCount - targetCounts.reduce((sum, value) => sum + value, 0);

      const remainderOrder = rawTargets
        .map((value, index) => ({
          index,
          remainder: value - Math.floor(value),
        }))
        .sort((a, b) => {
          if (b.remainder !== a.remainder) {
            return b.remainder - a.remainder;
          }

          // Em empate, favorece as categorias mais abaixo:
          // 3ª -> 2ª -> 1ª.
          return b.index - a.index;
        });

      while (leftovers > 0) {
        let distributedInRound = false;

        for (const item of remainderOrder) {
          if (leftovers <= 0) break;

          if (targetCounts[item.index] >= availableCapacity[item.index]) {
            continue;
          }

          targetCounts[item.index]++;
          leftovers--;
          distributedInRound = true;
        }

        if (!distributedInRound) break;
      }

      let cursor = 0;

      const distribution = [
        { cat: firstCat, count: targetCounts[0] },
        { cat: secondCat, count: targetCounts[1] },
        { cat: thirdCat, count: targetCounts[2] },
      ];

      // regularChannels já está A→Z.
      // Portanto o primeiro bloco fica na 1ª categoria,
      // o bloco intermediário na 2ª e o final do alfabeto na 3ª.
      for (const target of distribution) {
        for (
          let index = 0;
          index < target.count && cursor < regularChannels.length;
          index++
        ) {
          const ch = regularChannels[cursor++];

          assignments.set(
            ch.id,
            target.cat.id
          );

          catUsage.set(
            target.cat.id,
            (catUsage.get(target.cat.id) || 0) + 1
          );
        }
      }

      while (cursor < regularChannels.length) {
        pendingChannels.push(
          regularChannels[cursor++]
        );
      }
    } else { // Este é o bloco 'else' correto para outras estratégias (balance/default)
      // Existing balance/default logic (for other groups)
      let currentCatIndex = 0;

      let dynamicLimit = 50;
      if (groupConfig.strategy === "balance" && groupConfig.categories.length > 0) {
        dynamicLimit = Math.ceil(sortedAll.length / groupConfig.categories.length);
        if (dynamicLimit > 50) dynamicLimit = 50;
      }

      for (const ch of sortedAll) {
        let assigned = false;

        while (currentCatIndex < groupConfig.categories.length) {
          const catConfig = groupConfig.categories[currentCatIndex];
          const usage = catUsage.get(catConfig.id) || 0;

          const limit =
            groupConfig.strategy === "balance"
              ? Math.min(catConfig.limit, dynamicLimit)
              : catConfig.limit;

          if (usage < limit && usage < 50) {
            assignments.set(ch.id, catConfig.id);
            catUsage.set(catConfig.id, usage + 1);
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
    }
    // --- FASE 2: Overflow ---
    if (pendingChannels.length > 0) {
      const preserveLeaderReservations =
        groupConfig.strategy === "leaders_weighted_reserve";

      for (const ch of pendingChannels) {
        let assigned = false;

        for (const catConfig of groupConfig.categories) {
          const currentUsage =
            catUsage.get(catConfig.id) || 0;

          const overflowLimit =
            preserveLeaderReservations
              ? Math.min(catConfig.limit, 50)
              : 50;

          if (currentUsage < overflowLimit) {
            assignments.set(
              ch.id,
              catConfig.id
            );

            catUsage.set(
              catConfig.id,
              currentUsage + 1
            );

            assigned = true;
            break;
          }
        }

        if (!assigned) {
          if (preserveLeaderReservations) {
            console.error(
              `[SC_SORT] CRÍTICO: Grupo ${groupConfig.id} ultrapassou a capacidade reservada ` +
              `(30 + 35 + 50 = 115 canais). Canal ${ch.name} ficará sem redistribuição automática.`
            );
          } else {
            console.error(
              `[SC_SORT] CRÍTICO: Grupo ${groupConfig.id} lotado fisicamente! Canal ${ch.name} ficará sem destino.`
            );
          }

          assignments.set(
            ch.id,
            null
          );
        }
      }
    }

    // --- FASE 3: Execução ---
// 3.1 Primeiro, move canais para a categoria correta de forma determinística
let changesCount = 0;

// ✅ Contagem física atual por categoria do grupo
const catCounts = new Map();
for (const catId of cats) {
  const count = guild.channels.cache.filter(
    (c) =>
      c.parentId === catId &&
      c.type !== ChannelType.GuildCategory &&
      !(typeof c.isThread === "function" && c.isThread())
  ).size;

  catCounts.set(catId, count);
}

const moveQueue = sortedAll
  .map((ch, orderIndex) => {
    const targetCatId = assignments.get(ch.id);
    return {
      ch,
      targetCatId,
      orderIndex,
      sourceIndex: getCatIndex(ch.parentId),
      targetIndex: getCatIndex(targetCatId),
    };
  })
  .filter((item) => item.targetCatId && item.ch.parentId !== item.targetCatId)
  .sort((a, b) => {
    // ✅ prioridade:
    // 1. quem sai de categorias mais abaixo primeiro
    // 2. quem vai para categorias mais abaixo primeiro
    // 3. mantém a ordem alfabética global calculada em sortedAll
    if (b.sourceIndex !== a.sourceIndex) return b.sourceIndex - a.sourceIndex;
    if (b.targetIndex !== a.targetIndex) return b.targetIndex - a.targetIndex;
    return a.orderIndex - b.orderIndex;
  });

for (const item of moveQueue) {
  const { ch, targetCatId } = item;

  if (!targetCatId) continue;
  if (ch.parentId === targetCatId) continue;

  try {
    const previousParentId = ch.parentId;

    await ch.setParent(targetCatId, { lockPermissions: false });
    changesCount++;

    if (previousParentId) {
      catCounts.set(
        previousParentId,
        Math.max(0, (catCounts.get(previousParentId) || 0) - 1)
      );
    }

    catCounts.set(
      targetCatId,
      (catCounts.get(targetCatId) || 0) + 1
    );

    await new Promise((r) => setTimeout(r, 1200));
  } catch (err) {
    console.error(
      `[SC_SORT] Erro ao mover ${ch.name} de ${ch.parentId} para ${targetCatId}:`,
      err
    );
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

  // =====================================================
  // ✅ FORMATAÇÃO AUTOMÁTICA DOS NOMES DOS CANAIS DE LÍDERES
  // =====================================================
  //
  // A formatação é aplicada somente quando o destino final do canal
  // for uma das três categorias de líderes configuradas.
  //
  // Exemplos:
  // morro-do-sacola -> 𝙼𝚘𝚛𝚛𝚘-𝙳𝚘-𝚂𝚊𝚌𝚘𝚕𝚊
  // TROPA-DO-GORDÃO -> 𝚃𝚛𝚘𝚙𝚊-𝙳𝚘-𝙶𝚘𝚛𝚍𝚊̃𝚘
  if (LEADER_NAME_FORMAT_CATEGORY_IDS.has(targetCatId)) {
    const currentName = ch.name;
    const formattedName = formatLeaderChannelName(currentName);

    if (formattedName && formattedName !== currentName) {
      try {
        await ch.setName(formattedName);
        changesCount++;

        console.log(
          `[SC_SORT] Canal de líderes renomeado: ${currentName} -> ${formattedName}`
        );

        // ✅ Evita excesso de solicitações à API do Discord.
        await new Promise((r) => setTimeout(r, 1500));
      } catch (e) {
        console.warn(
          `[SC_SORT] Falha ao aplicar a formatação no canal ${currentName} (${ch.id}):`,
          e
        );
      }
    }
  }

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
  "1444857594517913742",
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
            debounceSort(
              guild,
              categoryId,
              0
            );
          }
        }

        // Failsafe profissional:
        // além de ordenar, confere se quem está em "membros ativos"
        // ainda é membro válido e ainda possui Controle GI existente.
        await reconcileCreatorActiveCategory(
          guild,
          {
            trigger: "supervisor_periodico",
          }
        );
      }
    }

    // liga supervisor no ready
    client.once(Events.ClientReady, async () => {
      console.log("[SC_SORT] supervisor ligado.");
      await periodicSupervisor();
      setInterval(periodicSupervisor, SC_SORT_INTERVAL_MS);

      // FAILSAFE: se o bot reiniciar e existir canal parado na categoria
      // 1444857594517913742 de alguém que já possui SantaCreators,
      // ele é enviado para a categoria de membros automaticamente.
      for (const [, guild] of client.guilds.cache) {
        const waitingCategory = guild.channels.cache.get(
          CREATOR_TICKET_AUTO.WAITING_CATEGORY
        );

        if (!waitingCategory || waitingCategory.type !== ChannelType.GuildCategory) {
          continue;
        }

        for (const channel of waitingCategory.children.cache.values()) {
          await syncCreatorTicketMovedIntoWaiting(channel);
        }
      }
    });

    // reage a criação
    client.on(Events.ChannelCreate, (ch) => {
      if (!ch?.guild) return;
      if (ch?.parentId && SC_SORT_CATEGORY_IDS.includes(ch.parentId)) {
        debounceSort(ch.guild, ch.parentId);
      }
    });

    // reage a update (mudança de nome, mudança de categoria, etc.)
    client.on(Events.ChannelUpdate, async (oldCh, newCh) => {
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

      // Se alguém mover manualmente o ticket para 1444857594517913742
      // e a pessoa já tiver o Set/SantaCreators, ele desce sozinho.
      if (
        was !== now &&
        now === CREATOR_TICKET_AUTO.WAITING_CATEGORY
      ) {
        await syncCreatorTicketMovedIntoWaiting(newCh);
      }
    });

    // O gestaoinfluencer.js emite este evento quando um Controle GI é criado,
    // inclusive quando a criação foi manual. A regra de movimentação continua
    // restrita à categoria 1444857594517913742.
    dashOn("gi:controle_criado", async (data) => {
      try {
        const guild = client.guilds.cache.get(String(data?.guildId || ""));
        const userId = String(data?.userId || "");
        if (!guild || !userId) return;

        await syncCreatorTicketAfterSetApproval(guild, userId);
      } catch (error) {
        console.error(
          "[SC_SORT][AUTO_TICKET] Erro ao sincronizar ticket após criação do Controle GI:",
          error
        );
      }
    });

    // O pedirset.js já emite este evento quando o Set é aprovado.
    // IMPORTANTE: aqui só move se o ticket estiver em 1444857594517913742.
    dashOn("pedirset:aprovado", async (data) => {
      try {
        const guild = client.guilds.cache.get(String(data?.guildId || ""));
        const userId = String(data?.userId || "");
        if (!guild || !userId) return;

        await syncCreatorTicketAfterSetApproval(guild, userId);
      } catch (error) {
        console.error(
          "[SC_SORT][AUTO_TICKET] Erro ao sincronizar ticket após Set aprovado:",
          error
        );
      }
    });

    // O gestaoinfluencer.js já emite este evento no desligamento definitivo.
    // Pausar/despausar NÃO passa por aqui.
    dashOn("gi:desligado", async (data) => {
      try {
        const userId = String(data?.userId || "");
        const guildId = String(data?.guildId || "");
        if (!userId) return;

        // Caminho principal: o GI agora informa diretamente a guild correta.
        if (guildId) {
          const guild = client.guilds.cache.get(guildId);

          if (guild) {
            await syncCreatorTicketAfterGiDisabled(guild, userId);
            return;
          }
        }

        // Fallback de compatibilidade para qualquer emissão antiga sem guildId.
        for (const [, guild] of client.guilds.cache) {
          const tickets = await findCreatorTicketsForUser(
            guild,
            userId,
            [
              CREATOR_TICKET_AUTO.INTERVIEW_CATEGORY,
              CREATOR_TICKET_AUTO.WAITING_CATEGORY,
              CREATOR_TICKET_AUTO.ACTIVE_CATEGORY,
            ]
          );

          if (tickets.length === 0) continue;

          await syncCreatorTicketAfterGiDisabled(guild, userId);
        }
      } catch (error) {
        console.error(
          "[SC_SORT][AUTO_TICKET] Erro ao sincronizar ticket após GI desligado:",
          error
        );
      }
    });

    // Se perder o cargo SantaCreators, confere imediatamente o ticket ativo.
    client.on(
      Events.GuildMemberUpdate,
      async (oldMember, newMember) => {
        try {
          const hadSantaCreators =
            oldMember.roles.cache.has(
              CREATOR_TICKET_AUTO
                .ROLE_SANTA_CREATORS
            );

          const hasSantaCreators =
            newMember.roles.cache.has(
              CREATOR_TICKET_AUTO
                .ROLE_SANTA_CREATORS
            );

          if (
            hadSantaCreators &&
            !hasSantaCreators
          ) {
            await reconcileCreatorActiveTicketsForUser(
              newMember.guild,
              newMember.id,
              "cargo_santacreators_removido"
            );
          }
        } catch (error) {
          console.error(
            "[SC_SORT][RECONCILE] Erro no GuildMemberUpdate:",
            error
          );
        }
      }
    );

    // Se sair do servidor, o ticket ativo não fica órfão em membros.
    client.on(
      Events.GuildMemberRemove,
      async (member) => {
        try {
          await reconcileCreatorActiveTicketsForUser(
            member.guild,
            member.id,
            "membro_saiu_do_servidor"
          );
        } catch (error) {
          console.error(
            "[SC_SORT][RECONCILE] Erro no GuildMemberRemove:",
            error
          );
        }
      }
    );
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

const content = message.content.trim().toLowerCase().split(/\s+/)[0];

const INACTIVE_COMMANDS = ["!inativo", "!inativos"];
const REACTIVATE_COMMANDS = ["!membro", "!membros", "!reativar"];

const isInactiveCmd = INACTIVE_COMMANDS.includes(content);
const isReactivateCmd = REACTIVATE_COMMANDS.includes(content);

if (isInactiveCmd || isReactivateCmd) {
  console.log("[SC_SORT] comando detectado:", {
    content,
    channelId: message.channel?.id,
    channelName: message.channel?.name,
    parentId: message.channel?.parentId,
  });
}

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
const currentCategoryId = resolveEffectiveCategoryId(channel);

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

    // removido: a lógica agora usa STANDARD_FLOW_CATEGORIES

    const isInStandardFlowCategory =
      INATIVO_CONFIG.STANDARD_FLOW_CATEGORIES.includes(currentCategoryId);

    // ✅ Permissão contextual da lógica padrão
    const isStandardFlowCategoryAuthorized =
      isInStandardFlowCategory &&
      (isStandardAuthorized || hasExtraCommandRole);

    // ✅ Permissão geral para comandos padrão
    const canUseStandardFlow = isStandardFlowCategoryAuthorized;

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

      const isStandardFlowCategory =
        INATIVO_CONFIG.STANDARD_FLOW_CATEGORIES.includes(currentCategoryId);

      const isProtectedCategory =
        INATIVO_CONFIG.PROTECTED_CATEGORIES.includes(currentCategoryId);

      // =====================================================
      // 1. LÓGICA PADRÃO
      // • qualquer categoria da lógica padrão
      // =====================================================
      if (isStandardFlowCategory) {
        if (!canUseStandardFlow) {
          const msg = await message.reply(
            `❌ Você não tem permissão para usar este comando nesta categoria.`
          );
          setTimeout(() => msg.delete().catch(() => {}), 8000);
          return true;
        }

        let targetCategory = null;
        for (const catId of INATIVO_CONFIG.TARGET_CATEGORIES) {
          const cat = await client.channels.fetch(catId).catch(() => null);
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
          ? await client.channels.fetch(currentCategoryId).catch(() => null) 
          : null;
        const oldCategoryName = oldCategory?.name || "Sem Categoria";
        // ✅ Só salva a origem real quando o canal ainda NÃO estiver em inativos.
        // ✅ Se já estiver em uma categoria de inativos, preserva o estado anterior.
        if (isStandardFlowCategory && !isTargetCategory) {
          storeChannelState(channel);
        }

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

  const specialInactiveCategory = await client.channels
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
  const isInactiveCategory =
    INATIVO_CONFIG.TARGET_CATEGORIES.includes(currentCategoryId);

  const isExtraEntryCategory =
    INATIVO_CONFIG.EXTRA_COMMAND_CATEGORIES.includes(currentCategoryId);

  const isMembersCategory =
    currentCategoryId === INATIVO_CONFIG.SOURCE_CATEGORY;

  const isStandardReactivateContext =
    isInactiveCategory || isExtraEntryCategory || isMembersCategory;

  // =====================================================
  // 1. LÓGICA PADRÃO DE REATIVAÇÃO
  // =====================================================
  if (isStandardReactivateContext) {
        if (!canUseStandardFlow && !isSpecialAuthorized) {
          const allowedCats = INATIVO_CONFIG.STANDARD_FLOW_CATEGORIES
            .map((id) => `<#${id}>`)
            .join(", ");

          const msg = await message.reply(
            `❌ Este comando só pode ser usado por usuários autorizados em canais nas categorias permitidas: ${allowedCats}.`
          );
          setTimeout(() => msg.delete().catch(() => {}), 8000);
          return true;
        }

        let targetCategoryId = INATIVO_CONFIG.SOURCE_CATEGORY;

        // ✅ Se o canal estiver em uma categoria de inativos,
        // tenta restaurar para a categoria original salva.
        if (INATIVO_CONFIG.TARGET_CATEGORIES.includes(currentCategoryId)) {
          const state = getChannelState(channel.id);
          const oldParentId = state?.oldParentId;

          if (
            oldParentId &&
            INATIVO_CONFIG.STANDARD_FLOW_CATEGORIES.includes(oldParentId)
          ) {
            targetCategoryId = oldParentId;
          }
        } else {
          // ✅ Qualquer outra categoria da lógica padrão volta para SOURCE_CATEGORY
          targetCategoryId = INATIVO_CONFIG.SOURCE_CATEGORY;
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

        // ✅ Limpa a origem salva após a restauração
        deleteChannelState(channel.id);

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

        const oldCategory = await client.channels
          .fetch(state.oldParentId)
          .catch(() => null);

        if (!oldCategory) {
          await message.reply(
            "❌ A categoria original deste canal não existe mais."
          );
          return true;
        }

        const restoreSnapshot = {
          oldParentId: currentCategoryId,
          oldPosition: channel.rawPosition,
          oldOverwrites: channel.permissionOverwrites.cache.map((ow) => ({
            id: ow.id,
            type: ow.type,
            allow: ow.allow.bitfield.toString(),
            deny: ow.deny.bitfield.toString(),
          })),
        };

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

        await message.delete().catch(() => {});

        const logChannel = await client.channels
          .fetch(INATIVO_CONFIG.LOG_CHANNEL)
          .catch(() => null);

        if (logChannel && logChannel.isTextBased()) {
          const embed = new EmbedBuilder()
            .setTitle("✅ Canal Reativado para Categoria Original")
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
                value: `<#${currentCategoryId}> (\`${currentCategoryId || "N/A"}\`)`,
                inline: false,
              },
              {
                name: "📂 Destino",
                value: `${oldCategory.name} (\`${oldCategory.id}\`)`,
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

          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`SC_SPECIAL_REDO_${channel.id}_${message.author.id}`)
              .setLabel("↩️ Desfazer (Voltar para Inativos Especiais)")
              .setStyle(ButtonStyle.Danger)
          );

          state[channel.id] = restoreSnapshot;
          saveSortState(state);

          await logChannel.send({ embeds: [embed], components: [row] });
        } else {
          deleteChannelState(channel.id);
        }

        return true;
      }

      // ✅ feedback quando usar em categoria errada
       const msg = await message.reply(
        "❌ Este comando deve ser usado em um canal que esteja em uma das categorias padrão configuradas ou na categoria de inativos especiais."
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

    if (!interaction.customId?.includes('SC_')) return false;

    const isUndoInativo = interaction.customId.startsWith("SC_INATIVO_UNDO_");
    const isUndoMembros = interaction.customId.startsWith("SC_MEMBROS_UNDO_");
    const isUndoSpecial = interaction.customId.startsWith("SC_SPECIAL_UNDO_");
    const isRedoSpecial = interaction.customId.startsWith("SC_SPECIAL_REDO_");

    if (!isUndoInativo && !isUndoMembros && !isUndoSpecial && !isRedoSpecial) return false;

    // Parse do ID
    const parts = interaction.customId.split("_");
    let channelId = null;
    let oldCatId = null;
    let originalUserId = null;

    if (isUndoInativo || isUndoMembros) {
      channelId = parts[3];
      oldCatId = parts[4];
      originalUserId = parts[5];
    } else if (isUndoSpecial || isRedoSpecial) {
      channelId = parts[3];
      originalUserId = parts[4];
    }

    // Verifica Permissões
    const member = interaction.member;

    const isAllowedUser = INATIVO_CONFIG.ALLOWED_USERS.includes(interaction.user.id);
    const isAllowedRole = member.roles.cache.some((r) =>
      INATIVO_CONFIG.ALLOWED_ROLES.includes(r.id)
    );

    const isSpecialAllowedUser =
      INATIVO_CONFIG.SPECIAL_AUTHORIZED_USERS.includes(interaction.user.id);

    const isSpecialAllowedRole = member.roles.cache.some((r) =>
      INATIVO_CONFIG.SPECIAL_AUTHORIZED_ROLES.includes(r.id)
    );

    const canUndo = (isUndoSpecial || isRedoSpecial)
      ? (isSpecialAllowedUser || isSpecialAllowedRole || interaction.user.id === originalUserId)
      : (isAllowedUser || isAllowedRole || interaction.user.id === originalUserId);

    if (!canUndo) {
      await interaction.reply({
        content: "❌ Você não tem permissão para desfazer esta ação.",
        ephemeral: true,
      });
      return true;
    }

    await interaction.deferReply({ ephemeral: true });

    if (isUndoSpecial || isRedoSpecial) {
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

      const targetCategory = await interaction.guild.channels.fetch(state.oldParentId).catch(() => null);
      if (!targetCategory) {
        await interaction.editReply("❌ A categoria de destino não existe mais.");
        return true;
      }

      await channel.setParent(targetCategory.id, { lockPermissions: false });

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

      const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0]);

      if (isUndoSpecial) {
        originalEmbed.setColor("Green");
        originalEmbed.addFields({
          name: "✅ Ação Desfeita",
          value: `Canal reativado por ${interaction.user}.`,
        });

        await interaction.editReply(`✅ Ação desfeita. O canal ${channel} foi restaurado para **${targetCategory.name}**.`);
      } else {
        originalEmbed.setColor("DarkOrange");
        originalEmbed.addFields({
          name: "✅ Ação Desfeita",
          value: `Canal retornado para os inativos especiais por ${interaction.user}.`,
        });

        await interaction.editReply(`✅ Ação desfeita. O canal ${channel} voltou para **${targetCategory.name}**.`);
      }

      await interaction.message.edit({ embeds: [originalEmbed], components: [] });
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

    const previousCategoryId = channel.parentId;

    await channel.setParent(oldCategory.id, { lockPermissions: false });

    await safeSortCategory(interaction.guild, oldCategory.id);
    if (previousCategoryId && previousCategoryId !== oldCategory.id) {
      await safeSortCategory(interaction.guild, previousCategoryId);
    }

    const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0]);

    if (isUndoInativo) {
      originalEmbed.setColor("Green");
      originalEmbed.addFields({
        name: "✅ Ação Desfeita",
        value: `Canal retornado para a origem por ${interaction.user}.`,
      });
      await interaction.editReply(`✅ Canal ${channel} movido de volta para **${oldCategory.name}**.`);
    } else {
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
