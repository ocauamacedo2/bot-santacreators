import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =====================================================
// SANTA CREATORS
// ARMAZENAMENTO COMPARTILHADO
// =====================================================

function pickPersistRoot() {

  const candidates = [

    ...(
      process.platform !== "win32" &&
      fs.existsSync("/application/storage")
        ? ["/application/storage"]
        : []
    ),

    process.env.SQUARECLOUD_STORAGE_PATH?.trim(),

    process.env.STORAGE_PATH?.trim(),

    ...(
      process.platform !== "win32"
        ? [
            "/storage",
            "/home/container/storage",
            "/home/squarecloud/storage"
          ]
        : []
    ),

    path.join(
      __dirname,
      ".."
    )

  ].filter(Boolean);

  for (const dir of candidates) {

    try {

      if (!fs.existsSync(dir)) {
        continue;
      }

      fs.accessSync(
        dir,
        fs.constants.R_OK |
        fs.constants.W_OK
      );

      return dir;

    } catch (error) {

      console.warn(
        "[SC_GERAL_WEEKLY_RANK] Storage indisponível:",
        dir,
        error?.code || error?.message
      );

    }

  }

  throw new Error(
    "[SC_GERAL_WEEKLY_RANK] Nenhum diretório gravável encontrado."
  );

}

const DATA_DIR =
  path.resolve(
    pickPersistRoot(),
    "data"
  );

console.log(
  `[SC_GERAL_WEEKLY_RANK] Persistência ativa em: ${DATA_DIR}`
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

  try {
    const raw = fs.readFileSync(STATE_FILE, "utf8");
    const parsed = JSON.parse(raw);

    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed) ||
      !parsed.aliases ||
      typeof parsed.aliases !== "object" ||
      Array.isArray(parsed.aliases) ||
      !Array.isArray(parsed.history)
    ) {
      throw new Error("Estrutura inválida no mapa de identidade Discord.");
    }

    for (const [oldId, newId] of Object.entries(parsed.aliases)) {
      if (
        !normalizeDiscordId(oldId) ||
        typeof newId !== "string" ||
        !normalizeDiscordId(newId) ||
        newId !== newId.trim()
      ) {
        throw new Error("Vínculo inválido no mapa de identidade Discord.");
      }

      const visited = new Set();
      let current = oldId;

      while (Object.hasOwn(parsed.aliases, current)) {
        if (visited.has(current)) {
          throw new Error("Ciclo encontrado no mapa de identidade Discord.");
        }
        visited.add(current);
        current = parsed.aliases[current];
      }
    }

    MEMORY_STATE = normalizeState(parsed);
    return MEMORY_STATE;
  } catch (error) {
    if (error?.code === "ENOENT") {
      MEMORY_STATE = normalizeState();
      return MEMORY_STATE;
    }

    console.error(
      "[SC_IDENTITY] Falha ao carregar mapa de identidade:",
      error?.message || error
    );
    throw error;
  }
}

function writeState(state) {
  ensureDataDir();

  const normalized = normalizeState(state);
  const serialized = JSON.stringify(normalized, null, 2);
  const committed = JSON.parse(serialized);
  const tmp = `${STATE_FILE}.${randomUUID()}.tmp`;
  let created = false;

  try {
    const descriptor = fs.openSync(tmp, "wx", 0o600);
    created = true;
    try {
      fs.writeFileSync(descriptor, serialized, "utf8");
    } finally {
      fs.closeSync(descriptor);
    }
    fs.renameSync(tmp, STATE_FILE);
    MEMORY_STATE = committed;
  } finally {
    if (created) {
      try {
        fs.unlinkSync(tmp);
      } catch (error) {
        if (error?.code !== "ENOENT") {
          console.error(
            "[SC_IDENTITY] Falha ao limpar arquivo temporário:",
            error?.message || error
          );
        }
      }
    }
  }
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

// =====================================================
// FAMÍLIA COMPLETA DA IDENTIDADE DISCORD
// =====================================================
//
// Exemplo:
//
// 111 -> 222
// 222 -> 333
//
// getDiscordIdentityFamily("333")
//
// retorna:
//
// [
//   "333",
//   "111",
//   "222"
// ]
//
// Assim Forms, Tickets, Ranking, Feedback e qualquer
// outro módulo conseguem consultar também os IDs antigos.
//
// =====================================================

export function getDiscordIdentityFamily(
  userId
) {
  const requestedId =
    normalizeDiscordId(
      userId
    );

  if (!requestedId) {
    return [];
  }

  const state =
    readState();

  const canonicalId =
    resolveFromAliases(
      requestedId,
      state.aliases
    );

  const family =
    new Set([
      requestedId,
      canonicalId
    ]);

  for (
    const historicalId
    of Object.keys(
      state.aliases || {}
    )
  ) {
    const resolved =
      resolveFromAliases(
        historicalId,
        state.aliases
      );

    if (
      resolved ===
      canonicalId
    ) {
      family.add(
        historicalId
      );
    }
  }

  return [
    canonicalId,
    ...[
      ...family
    ].filter(
      id =>
        id !==
        canonicalId
    )
  ];
}

export function isSameDiscordIdentity(
  firstUserId,
  secondUserId
) {
  const first =
    normalizeDiscordId(
      firstUserId
    );

  const second =
    normalizeDiscordId(
      secondUserId
    );

  if (
    !first ||
    !second
  ) {
    return false;
  }

  const state =
    readState();

  return (
    resolveFromAliases(
      first,
      state.aliases
    ) ===
    resolveFromAliases(
      second,
      state.aliases
    )
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
    getDiscordIdentityStateSnapshot();

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
    getDiscordIdentityStateSnapshot();

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
  if (
    !userMap ||
    typeof userMap !== "object" ||
    Array.isArray(userMap)
  ) {
    throw new Error("Mapa de ajustes de pontos inválido.");
  }

  const state = readState();
  const normalized = {};

  for (const [rawUserId, rawValue] of Object.entries(userMap)) {
    if (!normalizeDiscordId(rawUserId)) {
      throw new Error("ID Discord inválido no mapa de ajustes de pontos.");
    }

    const value =
      typeof rawValue === "number" ||
      (typeof rawValue === "string" && rawValue.trim() !== "")
        ? Number(rawValue)
        : NaN;

    if (!Number.isSafeInteger(value)) {
      throw new Error("Quantidade inválida no mapa de ajustes de pontos.");
    }

    const userId = resolveFromAliases(rawUserId, state.aliases);
    const current = normalized[userId] ?? 0;

    if (value <= -99999 || current <= -99999) {
      normalized[userId] = -99999;
      continue;
    }

    const total = current + value;

    if (!Number.isSafeInteger(total)) {
      throw new Error("A soma dos ajustes de pontos excede o limite seguro.");
    }

    normalized[userId] = total;
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