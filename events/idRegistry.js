// d:\santacreators-main\services\guildClone\idRegistry.js
import fs from "node:fs";
import path from "node:path";

const MAP_FILE_PATH = path.resolve(process.cwd(), "data/guild_mirror_map.json");

/**
 * @typedef {object} GuildMap
 * @property {string} targetGuildId
 * @property {Record<string, string>} roles
 * @property {Record<string, string>} categories
 * @property {Record<string, string>} channels
 */

/**
 * @typedef {Record<string, GuildMap>} MirrorMap
 */

/**
 * Carrega o mapa de IDs do arquivo JSON.
 * @returns {MirrorMap}
 */
export function loadMirrorMap() {
  try {
    if (!fs.existsSync(MAP_FILE_PATH)) {
      return { guilds: {} };
    }
    const raw = fs.readFileSync(MAP_FILE_PATH, "utf8");
    const data = JSON.parse(raw || "{}");
    if (!data.guilds) data.guilds = {};
    return data;
  } catch (e) {
    console.error("[GuildClone] Erro ao carregar guild_mirror_map.json:", e);
    return { guilds: {} };
  }
}

/**
 * Salva o mapa de IDs no arquivo JSON.
 * @param {MirrorMap} map
 */
export function saveMirrorMap(map) {
  try {
    const dir = path.dirname(MAP_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(MAP_FILE_PATH, JSON.stringify(map, null, 2));
  } catch (e) {
    console.error("[GuildClone] Erro ao salvar guild_mirror_map.json:", e);
  }
}

/**
 * Garante que a entrada para uma guilda de origem exista no mapa.
 * @param {string} sourceGuildId
 * @param {string} targetGuildId
 * @returns {GuildMap}
 */
export function ensureGuildEntry(sourceGuildId, targetGuildId) {
  const map = loadMirrorMap();
  if (!map.guilds[sourceGuildId]) {
    map.guilds[sourceGuildId] = {
      targetGuildId: targetGuildId,
      roles: {},
      categories: {},
      channels: {},
    };
    saveMirrorMap(map);
  } else if (map.guilds[sourceGuildId].targetGuildId !== targetGuildId) {
    // Atualiza se o ID de destino mudou na config
    map.guilds[sourceGuildId].targetGuildId = targetGuildId;
    saveMirrorMap(map);
  }
  return map.guilds[sourceGuildId];
}

/**
 * Mapeia um ID de uma entidade (cargo, canal, etc.).
 * @param {'roles' | 'categories' | 'channels'} type
 * @param {string} sourceGuildId
 * @param {string} sourceId
 * @param {string} targetId
 */
export function mapId(type, sourceGuildId, sourceId, targetId) {
  const map = loadMirrorMap();
  if (map.guilds[sourceGuildId]) {
    map.guilds[sourceGuildId][type][sourceId] = targetId;
    saveMirrorMap(map);
  }
}

/**
 * Obtém o ID espelhado de uma entidade.
 * @param {'roles' | 'categories' | 'channels'} type
 * @param {string} sourceGuildId
 * @param {string} sourceId
 * @returns {string | null}
 */
export function getMirroredId(type, sourceGuildId, sourceId) {
  const map = loadMirrorMap();
  return map.guilds[sourceGuildId]?.[type]?.[sourceId] || null;
}

/**
 * Obtém o ID da guilda de destino para uma guilda de origem.
 * @param {string} sourceGuildId
 * @returns {string | null}
 */
export function getTargetGuildId(sourceGuildId) {
    const map = loadMirrorMap();
    return map.guilds[sourceGuildId]?.targetGuildId || null;
}