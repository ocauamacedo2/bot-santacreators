import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function pickPersistRoot() {
  const candidates = [
    process.env.SQUARECLOUD_STORAGE_PATH?.trim(),
    "/storage",
    "/home/container/storage",
    "/home/squarecloud/storage",
  ].filter(Boolean);

  for (const dir of candidates) {
    try {
      if (fs.existsSync(dir)) return dir;
    } catch {}
  }

  return null;
}

const DATA_DIR = path.resolve(
  pickPersistRoot() || path.join(__dirname, ".."),
  "data"
);

const STATE_FILE = path.join(
  DATA_DIR,
  "sc_discord_identity_map.json"
);

let MEMORY_STATE = null;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function normalizeState(raw = {}) {
  return {
    aliases:
      raw?.aliases && typeof raw.aliases === "object"
        ? { ...raw.aliases }
        : {},

    history:
      Array.isArray(raw?.history)
        ? raw.history
        : [],
  };
}

function readState() {
  if (MEMORY_STATE) {
    return MEMORY_STATE;
  }

  ensureDataDir();

  if (!fs.existsSync(STATE_FILE)) {
    MEMORY_STATE = normalizeState();
    return MEMORY_STATE;
  }

  try {
    const raw = fs.readFileSync(STATE_FILE, "utf8");

    MEMORY_STATE = normalizeState(
      raw?.trim()
        ? JSON.parse(raw)
        : {}
    );
  } catch (error) {
    console.error(
      "[SC_IDENTITY] Falha ao carregar mapa de identidade:",
      error?.message || error
    );

    MEMORY_STATE = normalizeState();
  }

  return MEMORY_STATE;
}

function writeState(state) {
  ensureDataDir();

  const normalized =
    normalizeState(state);

  const tmp =
    `${STATE_FILE}.tmp`;

  fs.writeFileSync(
    tmp,
    JSON.stringify(
      normalized,
      null,
      2
    ),
    "utf8"
  );

  fs.renameSync(
    tmp,
    STATE_FILE
  );

  MEMORY_STATE =
    normalized;
}

function normalizeDiscordId(value) {
  const id =
    String(value || "").trim();

  if (!/^\d{17,20}$/.test(id)) {
    return null;
  }

  return id;
}

function resolveFromAliases(
  userId,
  aliases = {}
) {
  let current =
    normalizeDiscordId(userId);

  if (!current) {
    return String(
      userId || ""
    ).trim();
  }

  const visited =
    new Set();

  for (let i = 0; i < 30; i++) {
    if (visited.has(current)) {
      break;
    }

    visited.add(current);

    const next =
      normalizeDiscordId(
        aliases?.[current]
      );

    if (
      !next ||
      next === current
    ) {
      break;
    }

    current = next;
  }

  return current;
}

export function resolveDiscordIdentity(
  userId
) {
  const state =
    readState();

  return resolveFromAliases(
    userId,
    state.aliases
  );
}

export function validateDiscordIdentityMigration(
  oldUserId,
  newUserId
) {
  const oldId =
    normalizeDiscordId(
      oldUserId
    );

  const newId =
    normalizeDiscordId(
      newUserId
    );

  if (!oldId) {
    throw new Error(
      "ID Discord antigo inválido."
    );
  }

  if (!newId) {
    throw new Error(
      "Novo ID Discord inválido."
    );
  }

  if (oldId === newId) {
    return {
      oldUserId: oldId,
      newUserId: newId,
      alreadyCurrent: true,
    };
  }

  const state =
    readState();

  const resolvedOld =
    resolveFromAliases(
      oldId,
      state.aliases
    );

  const resolvedNew =
    resolveFromAliases(
      newId,
      state.aliases
    );

  if (
    state.aliases?.[oldId] &&
    resolvedOld === newId
  ) {
    return {
      oldUserId: oldId,
      newUserId: newId,
      alreadyCurrent: true,
    };
  }

  if (resolvedOld !== oldId) {
    throw new Error(
      `O ID antigo já foi migrado para ${resolvedOld}. Use o ID atual como origem.`
    );
  }

  if (resolvedNew !== newId) {
    throw new Error(
      `O novo ID já é um ID histórico e aponta para ${resolvedNew}.`
    );
  }

  const alreadyPointsToNew =
    Object.keys(
      state.aliases || {}
    ).some(
      historicalId => {
        if (
          historicalId === oldId
        ) {
          return false;
        }

        return (
          resolveFromAliases(
            historicalId,
            state.aliases
          ) === newId
        );
      }
    );

  if (alreadyPointsToNew) {
    throw new Error(
      "O novo ID já está vinculado ao histórico de outra identidade. Migração bloqueada para evitar mistura de pessoas."
    );
  }

  return {
    oldUserId: oldId,
    newUserId: newId,
    alreadyCurrent: false,
  };
}

export function registerDiscordIdentityMigration({
  oldUserId,
  newUserId,
  actorId = null,
  reason = "Troca de conta Discord",
} = {}) {
  const validation =
    validateDiscordIdentityMigration(
      oldUserId,
      newUserId
    );

  if (validation.alreadyCurrent) {
    return {
      ...validation,
      changed: false,
    };
  }

  const state =
    readState();

  state.aliases[
    validation.oldUserId
  ] =
    validation.newUserId;

  state.history.push({
    oldUserId:
      validation.oldUserId,

    newUserId:
      validation.newUserId,

    actorId:
      normalizeDiscordId(actorId) ||
      null,

    reason:
      String(
        reason || ""
      ).trim(),

    migratedAtMs:
      Date.now(),
  });

  writeState(state);

  return {
    ...validation,
    changed: true,
  };
}

export function rollbackDiscordIdentityMigration({
  oldUserId,
  newUserId,
} = {}) {
  const oldId =
    normalizeDiscordId(
      oldUserId
    );

  const newId =
    normalizeDiscordId(
      newUserId
    );

  if (
    !oldId ||
    !newId
  ) {
    return false;
  }

  const state =
    readState();

  if (
    String(
      state.aliases?.[oldId] ||
      ""
    ) !== newId
  ) {
    return false;
  }

  delete state.aliases[
    oldId
  ];

  for (
    let i =
      state.history.length - 1;
    i >= 0;
    i--
  ) {
    const item =
      state.history[i];

    if (
      String(
        item?.oldUserId || ""
      ) === oldId &&
      String(
        item?.newUserId || ""
      ) === newId
    ) {
      state.history.splice(
        i,
        1
      );

      break;
    }
  }

  writeState(state);

  return true;
}

export function normalizeDiscordIdentityAdjustmentMap(
  userMap = {}
) {
  const normalized = {};

  for (
    const [
      rawUserId,
      rawValue
    ]
    of Object.entries(
      userMap || {}
    )
  ) {
    const userId =
      resolveDiscordIdentity(
        rawUserId
      );

    if (!userId) {
      continue;
    }

    const value =
      Number(
        rawValue || 0
      );

    const current =
      Number(
        normalized[userId] ||
        0
      );

    if (
      value <= -99999 ||
      current <= -99999
    ) {
      normalized[userId] =
        -99999;

      continue;
    }

    normalized[userId] =
      current + value;
  }

  return normalized;
}

export function getDiscordIdentityStateSnapshot() {
  const state =
    readState();

  return JSON.parse(
    JSON.stringify(state)
  );
}