// d:\bots\events\hierarquiaDivisoes.js
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  PermissionsBitField,
} from "discord.js";

// ================= CONFIGURAÇÃO =================
const CONFIG = {
  // Canais
  PANEL_CHANNEL_ID: "1370830395637239928", // Canal onde aparece a hierarquia
  LOG_CHANNEL_ID: "1486009555606437978",   // Canal de logs

  // Cargos (IDs)
  ROLES: {
    OWNER: "1262262852949905408",
    RESP_CREATOR: "1352408327983861844",
    RESP_INFLU: "1262262852949905409",
    RESP_LIDER: "1352407252216184833",
    COORD_CREATOR: "1388976314253312100",
    MANAGER: "1352385500614234134",
    CREATOR: "1352429001188180039",

    // ✅ ORDEM POR CARGOS (GESTÃO)
    GESTOR: "1388975939161161728",
    MANAGER_CREATOR: "1388976155830255697",
    SOCIAL_MEDIAS: "1388976094920704141",

    // ✅ ORDEM POR CARGOS (EQUIPES)
    EQ_MANAGER: "1392678638176043029",
    EQ_SOCIAL_MEDIAS: "1387253972661964840",
    EQ_CREATORS: "1352429001188180039", // mesmo que CREATOR (ok)
  },

  // ✅ Grupos e ordem visual (do mais alto pro mais baixo)
  GROUPS: {
    GESTAO: [
      { id: "GESTOR", title: "👑 Gestor" },
      { id: "MANAGER_CREATOR", title: "🎯 Manager Creators" },
      { id: "SOCIAL_MEDIAS", title: "📱 Social Medias" },
    ],
    EQUIPE: [
      { id: "EQ_MANAGER", title: "🎯 Equipe Manager" },
      { id: "EQ_SOCIAL_MEDIAS", title: "📱 Equipe Social Medias" },
      { id: "EQ_CREATORS", title: "🎬 Equipe Creators" },
    ],
  },

  // Usuários com permissão TOTAL (Bypass)
  ADMIN_USERS: [
    "660311795327828008",  // Você
    "1262262852949905408", // Owner
  ],

  // Cargos com permissão TOTAL
  ADMIN_ROLES: [
    "1352408327983861844", // Resp Creator
    "1262262852949905409", // Resp Influ
  ],

  // Cargos com permissão PARCIAL (apenas abaixo deles)
  MOD_ROLES: [
    "1352407252216184833", // Resp Líder
  ],

  // Slots de Horário
SLOTS: {
  NONE: "none",
  EVENING: "evening", // 19:00 - 22:00
  DAWN: "dawn",       // 23:00 - 02:00
},

LABELS: {
  evening: "🌆 19:00 às 22:00",
  dawn: "🌌 23:00 às 02:00",
  none: "⚪ Sem Horário Fixo",
},

DIVISIONS: {
  none: {
    label: "⚪ Sem Cidade Definida",
    emoji: "⚪",
    roleId: null,
  },
  maresia: {
    label: "🌊 Maresia",
    emoji: "🌊",
    roleId: "1379021994678288465",
  },
  grande: {
    label: "🏙️ Grande",
    emoji: "🏙️",
    roleId: "1418691103397253322",
  },
  santa: {
    label: "🎅 Santa",
    emoji: "🎅",
    roleId: "1379021888709464168",
  },
  nobre: {
    label: "💎 Nobre",
    emoji: "💎",
    roleId: "1379021805544804382",
  },
},

  // Visual
  GIF_FOOTER:
    "https://media.discordapp.net/attachments/1362477839944777889/1374893068649500783/standard_1.gif?ex=69a18133&is=69a02fb3&hm=ea8c7358946665a87e0ec2b3caa3d7bb671c12fb854f9b88e251a67a0e80bc56&=&width=1867&height=108",

  EMOJIS: {
    CROWN_BLACK: "<a:blackcrown:1306729071551582208>",
    CROWN_GOLD: "<a:coroa:842223866742046730>",
    CROWN_MASTER: "<a:coroa:1306686455715725313>",
    CROWN_INFLU: "<a:coroa:1324521312328351906>",
    CROWN_CYAN: "<a:coroa_ciano:1321956650067824650>",
    CROWN_GREEN: "<a:verde_coroa:1306686191458058313>",
    DOT: "<:ponto1:1183282270761664622>",
  },

  // Fallbacks caso o bot não tenha UseExternalEmojis no canal
  EMOJI_FALLBACKS: {
    CROWN_BLACK: "👑",
    CROWN_GOLD: "👑",
    CROWN_MASTER: "👑",
    CROWN_INFLU: "👑",
    CROWN_CYAN: "👑",
    CROWN_GREEN: "🟢",
    DOT: "•",
  },
};

// ================= PERSISTÊNCIA =================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, "../data");
const STATE_FILE = path.join(DATA_DIR, "hierarquia_slots.json");
const DIVISIONS_FILE = path.join(DATA_DIR, "hierarquia_divisoes.json");
const PANEL_STATE_FILE = path.join(DATA_DIR, "hierarquia_panel_state.json");

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadSlots() {
  ensureDir();
  try {
    if (!fs.existsSync(STATE_FILE)) return {};
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveSlots(data) {
  ensureDir();
  fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2));
}

function loadDivisions() {
  ensureDir();
  try {
    if (!fs.existsSync(DIVISIONS_FILE)) return {};
    return JSON.parse(fs.readFileSync(DIVISIONS_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveDivisions(data) {
  ensureDir();
  fs.writeFileSync(DIVISIONS_FILE, JSON.stringify(data, null, 2));
}

function loadPanelState() {
  ensureDir();
  try {
    if (!fs.existsSync(PANEL_STATE_FILE)) return { messageId: null, lastHash: null };
    return JSON.parse(fs.readFileSync(PANEL_STATE_FILE, "utf8"));
  } catch {
    return { messageId: null, lastHash: null };
  }
}

function savePanelState(data) {
  ensureDir();
  fs.writeFileSync(PANEL_STATE_FILE, JSON.stringify(data, null, 2));
}

// ================= HELPERS =================
function checkPermission(member) {
  if (!member) return "NONE";
  if (CONFIG.ADMIN_USERS.includes(member.id)) return "ADMIN";
  if (member.roles?.cache?.some((r) => CONFIG.ADMIN_ROLES.includes(r.id))) return "ADMIN";
  if (member.roles?.cache?.some((r) => CONFIG.MOD_ROLES.includes(r.id))) return "MOD";
  return "NONE";
}

function hasRole(member, roleId) {
  return Boolean(member?.roles?.cache?.has(roleId));
}

function isFullAdmin(member) {
  if (!member) return false;
  if (CONFIG.ADMIN_USERS.includes(member.id)) return true;
  if (hasRole(member, CONFIG.ROLES.OWNER)) return true;
  return false;
}

function canManageDivisionTarget(actorMember, targetMember) {
  if (!actorMember || !targetMember) return false;

  if (isFullAdmin(actorMember)) return true;

  const actorIsRespCreator = hasRole(actorMember, CONFIG.ROLES.RESP_CREATOR);
  const actorIsRespInflu = hasRole(actorMember, CONFIG.ROLES.RESP_INFLU);

  const targetIsRespInflu = hasRole(targetMember, CONFIG.ROLES.RESP_INFLU);
  const targetIsRespLider = hasRole(targetMember, CONFIG.ROLES.RESP_LIDER);

  if (actorIsRespCreator && (targetIsRespInflu || targetIsRespLider)) return true;
  if (actorIsRespInflu && targetIsRespLider) return true;

  return false;
}

function isDivisionTargetRole(member) {
  if (!member) return false;

  return (
    hasRole(member, CONFIG.ROLES.RESP_INFLU) ||
    hasRole(member, CONFIG.ROLES.RESP_LIDER)
  );
}

function getDivisionLabel(key) {
  return CONFIG.DIVISIONS[key]?.label || CONFIG.DIVISIONS.none.label;
}

function getMemberDivisions(divisions, memberId) {
  const raw = divisions?.[memberId];

  if (Array.isArray(raw)) {
    const valid = raw.filter((key) => CONFIG.DIVISIONS[key]);
    return valid.length > 0 ? valid : ["none"];
  }

  if (typeof raw === "string" && CONFIG.DIVISIONS[raw]) {
    return [raw];
  }

  return ["none"];
}

function normalizeMemberDivisions(values, targetMember) {
  const selected = Array.isArray(values) ? values : [values];

  if (selected.includes("none")) return ["none"];

  const valid = [...new Set(selected.filter((key) => key !== "none" && CONFIG.DIVISIONS[key]))];

  if (valid.length === 0) return ["none"];

  const isRespInflu = hasRole(targetMember, CONFIG.ROLES.RESP_INFLU);

  return isRespInflu ? valid.slice(0, 2) : valid.slice(0, 1);
}

function memberHasDivision(divisions, memberId, divisionKey) {
  return getMemberDivisions(divisions, memberId).includes(divisionKey);
}

function getDivisionLabels(keys) {
  return getMemberDivisions({ temp: keys }, "temp")
    .map((key) => getDivisionLabel(key))
    .join(" + ");
}

// ================= CONSULTA EXTERNA — INTELIGÊNCIA DE PESSOAS =================
export function getHierarchyPersonData(userId) {
  const normalizedUserId = String(userId || "").trim();

  if (!normalizedUserId) {
    return null;
  }

  const slots = loadSlots();
  const divisions = loadDivisions();

  const hasStoredSlot = Object.prototype.hasOwnProperty.call(
    slots,
    normalizedUserId
  );

  const hasStoredDivisions = Object.prototype.hasOwnProperty.call(
    divisions,
    normalizedUserId
  );

  const slotKey =
    slots[normalizedUserId] ||
    CONFIG.SLOTS.NONE;

  const divisionKeys =
    getMemberDivisions(
      divisions,
      normalizedUserId
    );

  return {
    userId: normalizedUserId,

    slot: slotKey,

    slotLabel:
      CONFIG.LABELS[slotKey] ||
      CONFIG.LABELS[CONFIG.SLOTS.NONE],

    divisions: divisionKeys,

    divisionLabels:
      divisionKeys.map(
        (key) =>
          getDivisionLabel(key)
      ),

    divisionsText:
      getDivisionLabels(
        divisionKeys
      ),

    hasStoredSlot,

    hasStoredDivisions,

    hasStoredData:
      hasStoredSlot ||
      hasStoredDivisions,
  };
}

// =====================================================
// CONSULTA EXTERNA — HIERARQUIA OFICIAL SANTACREATORS
// =====================================================
//
// Estas funções são utilizadas por outros sistemas,
// principalmente pela SantaCreators IA.
//
// IMPORTANTE:
//
// A hierarquia institucional NÃO é calculada utilizando
// a posição técnica dos cargos dentro do Discord.
//
// A fonte de verdade são exatamente os cargos definidos
// neste CONFIG e as divisões persistidas por este sistema.
// =====================================================

export function isOfficialSantaCreatorsTeamMember(member) {
  if (
    !member ||
    member.user?.bot ||
    !member.roles?.cache
  ) {
    return false;
  }

  const officialRoleIds = new Set([
    CONFIG.ROLES.OWNER,
    CONFIG.ROLES.RESP_CREATOR,
    CONFIG.ROLES.RESP_INFLU,
    CONFIG.ROLES.RESP_LIDER,
    CONFIG.ROLES.COORD_CREATOR,
    CONFIG.ROLES.GESTOR,
    CONFIG.ROLES.MANAGER_CREATOR,
    CONFIG.ROLES.SOCIAL_MEDIAS,
    CONFIG.ROLES.EQ_MANAGER,
    CONFIG.ROLES.EQ_SOCIAL_MEDIAS,
    CONFIG.ROLES.EQ_CREATORS,
  ]);

  return member.roles.cache.some(
    (role) =>
      officialRoleIds.has(role.id)
  );
}

export function isOfficialSantaCreatorsResponsible(member) {
  if (
    !member ||
    member.user?.bot ||
    !member.roles?.cache
  ) {
    return false;
  }

  const responsibleRoleIds = new Set([
    CONFIG.ROLES.OWNER,
    CONFIG.ROLES.RESP_CREATOR,
    CONFIG.ROLES.RESP_INFLU,
    CONFIG.ROLES.RESP_LIDER,
    CONFIG.ROLES.COORD_CREATOR,
    CONFIG.ROLES.GESTOR,
    CONFIG.ROLES.MANAGER_CREATOR,
  ]);

  return member.roles.cache.some(
    (role) =>
      responsibleRoleIds.has(role.id)
  );
}

export function getOfficialSantaCreatorsHierarchySnapshot(guild) {
  if (!guild) {
    return null;
  }

  const slots =
    loadSlots();

  const divisions =
    loadDivisions();

  const hierarchyDefinitions = [
    {
      key: "OWNER",
      label: "Owner",
      roleId: CONFIG.ROLES.OWNER,
      responsible: true,
    },
    {
      key: "RESP_CREATOR",
      label: "Resp. Creators",
      roleId: CONFIG.ROLES.RESP_CREATOR,
      responsible: true,
    },
    {
      key: "RESP_INFLU",
      label: "Resp. Influ",
      roleId: CONFIG.ROLES.RESP_INFLU,
      responsible: true,
    },
    {
      key: "RESP_LIDER",
      label: "Resp. Líder",
      roleId: CONFIG.ROLES.RESP_LIDER,
      responsible: true,
    },
    {
      key: "COORD_CREATOR",
      label: "Coord. Creators",
      roleId: CONFIG.ROLES.COORD_CREATOR,
      responsible: true,
    },
    {
      key: "GESTOR",
      label: "Gestor",
      roleId: CONFIG.ROLES.GESTOR,
      responsible: true,
    },
    {
      key: "MANAGER_CREATOR",
      label: "Manager Creators",
      roleId: CONFIG.ROLES.MANAGER_CREATOR,
      responsible: true,
    },
    {
      key: "SOCIAL_MEDIAS",
      label: "Social Medias",
      roleId: CONFIG.ROLES.SOCIAL_MEDIAS,
      responsible: false,
    },
    {
      key: "EQ_MANAGER",
      label: "Equipe Manager",
      roleId: CONFIG.ROLES.EQ_MANAGER,
      responsible: false,
    },
    {
      key: "EQ_SOCIAL_MEDIAS",
      label: "Equipe Social Medias",
      roleId: CONFIG.ROLES.EQ_SOCIAL_MEDIAS,
      responsible: false,
    },
    {
      key: "EQ_CREATORS",
      label: "Equipe Creators",
      roleId: CONFIG.ROLES.EQ_CREATORS,
      responsible: false,
    },
  ];

  const seenMembers =
    new Set();

  const teamMemberIds =
    new Set();

  const responsibleMemberIds =
    new Set();

  const hierarchy =
    [];

  for (
    const definition
    of hierarchyDefinitions
  ) {
    const role =
      guild.roles.cache.get(
        definition.roleId
      );

    const members =
      role
        ? [...role.members.values()]
            .filter(
              (member) =>
                !member.user?.bot
            )
            .sort(
              (a, b) =>
                a.displayName.localeCompare(
                  b.displayName
                )
            )
        : [];

    const memberData =
      [];

    for (
      const member
      of members
    ) {
      teamMemberIds.add(
        member.id
      );

      if (
        definition.responsible
      ) {
        responsibleMemberIds.add(
          member.id
        );
      }

      const memberDivisions =
        getMemberDivisions(
          divisions,
          member.id
        );

      const slotKey =
        slots[member.id] ||
        CONFIG.SLOTS.NONE;

      memberData.push({
        userId:
          member.id,

        displayName:
          member.displayName,

        mention:
          `<@${member.id}>`,

        slot:
          slotKey,

        slotLabel:
          CONFIG.LABELS[slotKey] ||
          CONFIG.LABELS[
            CONFIG.SLOTS.NONE
          ],

        divisions:
          memberDivisions,

        divisionLabels:
          memberDivisions.map(
            (divisionKey) =>
              getDivisionLabel(
                divisionKey
              )
          ),
      });

      seenMembers.add(
        member.id
      );
    }

    hierarchy.push({
      ...definition,
      members:
        memberData,
    });
  }

  const divisionsSnapshot =
    Object.keys(
      CONFIG.DIVISIONS
    ).map(
      (divisionKey) => {
        const respInfluRole =
          guild.roles.cache.get(
            CONFIG.ROLES.RESP_INFLU
          );

        const respLiderRole =
          guild.roles.cache.get(
            CONFIG.ROLES.RESP_LIDER
          );

        const respInflu =
          respInfluRole
            ? [...respInfluRole.members.values()]
                .filter(
                  (member) =>
                    !member.user?.bot &&
                    memberHasDivision(
                      divisions,
                      member.id,
                      divisionKey
                    )
                )
                .map(
                  (member) => ({
                    userId:
                      member.id,

                    displayName:
                      member.displayName,

                    mention:
                      `<@${member.id}>`,
                  })
                )
            : [];

        const respLider =
          respLiderRole
            ? [...respLiderRole.members.values()]
                .filter(
                  (member) =>
                    !member.user?.bot &&
                    memberHasDivision(
                      divisions,
                      member.id,
                      divisionKey
                    )
                )
                .map(
                  (member) => ({
                    userId:
                      member.id,

                    displayName:
                      member.displayName,

                    mention:
                      `<@${member.id}>`,
                  })
                )
            : [];

        return {
          key:
            divisionKey,

          label:
            CONFIG.DIVISIONS[
              divisionKey
            ]?.label ||
            divisionKey,

          respInflu,

          respLider,
        };
      }
    );

  return {
    generatedAt:
      Date.now(),

    hierarchy,

    divisions:
      divisionsSnapshot,

    teamMemberIds:
      [...teamMemberIds],

    responsibleMemberIds:
      [...responsibleMemberIds],

    totalOfficialMembers:
      seenMembers.size,
  };
}

// Filtra membros que podem ser editados pelo executor
async function getEditableMembers(guild, permissionLevel) {
  await guild.members.fetch();

  // Cargos que podem ter horário definido (Coord e Resp Lider)
  const targetRoles = [CONFIG.ROLES.COORD_CREATOR, CONFIG.ROLES.RESP_LIDER];

  let members = guild.members.cache.filter(
    (m) => !m.user.bot && m.roles.cache.some((r) => targetRoles.includes(r.id))
  );

  // Se for MOD (Resp Líder), só pode editar Coord Creators (abaixo dele)
  if (permissionLevel === "MOD") {
    members = members.filter((m) => !m.roles.cache.has(CONFIG.ROLES.RESP_LIDER));
  }

  return members.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function parseEmojiCode(code) {
  const m = String(code || "").match(/^<a?:(\w+):(\d+)>$/);
  if (!m) return null;
  return { name: m[1], id: m[2] };
}

function canUseExternalEmojis(channel) {
  const me = channel?.guild?.members?.me;
  if (!me) return true;
  const perms = channel.permissionsFor(me);
  if (!perms) return true;
  return perms.has(PermissionsBitField.Flags.UseExternalEmojis);
}

function resolveEmoji(channel, code, fallback) {
  const parsed = parseEmojiCode(code);
  if (!parsed) return fallback;

  if (!canUseExternalEmojis(channel)) return fallback;

  const inClient = channel.client.emojis.cache.get(parsed.id);
  if (inClient) return code;

  const inGuild = channel.guild.emojis.cache.get(parsed.id);
  if (inGuild) return code;

  return fallback;
}

// Lista formatada por grupos (ex: Gestor/Manager/Social)
// ✅ "seen" dá prioridade: se já apareceu em cima, não aparece em baixo
const getMembersByRoleGroups = (guild, groupDefs, slots, filterSlot, E, seen, groupType) => {
    const lines = [];
          let groupTotal = 0;

  for (const g of groupDefs) {
    const roleId = CONFIG.ROLES[g.id];
    const role = guild.roles.cache.get(roleId);

    const title = `### ${g.title}`;
    lines.push(title);

    if (!role) {
      lines.push("_Cargo não encontrado_");
      lines.push("");
      continue;
    }

    let members = role.members
      .filter((m) => !m.user.bot)
      .map((m) => m);

    // aplica filtro slot se vier (se você quiser usar no futuro)
    if (filterSlot !== "ANY") {
      members = members.filter((m) => {
        const userSlot = slots[m.id] || CONFIG.SLOTS.NONE;
        return userSlot === filterSlot;
      });
    }

    // ✅ prioridade (não duplica)
    if (seen) {
      members = members.filter((m) => !seen.has(m.id));
    }

    const count = members.length;
    groupTotal += count;

    if (count === 0) {
      lines.push("_Ninguém_");
    } else {
      members.sort((a, b) => a.displayName.localeCompare(b.displayName));

      // ✅ marca como "já listado" pra não aparecer em categorias abaixo
      if (seen) {
        for (const m of members) seen.add(m.id);
      }

      lines.push(
        members
          .map((m) => {
            const userSlot = slots[m.id] || CONFIG.SLOTS.NONE;
            let icon = "";
            if (filterSlot === "ANY") {
              if (userSlot === CONFIG.SLOTS.EVENING) icon = "🌅 ";
              if (userSlot === CONFIG.SLOTS.DAWN) icon = "🌌 ";
            }
            return `${E.DOT} ${icon}${m.toString()}`;
          })
          .join("\n")
      );
    }

    if (g.id === "EQ_CREATORS") {
      lines.push(`\n**equipe sem area: ${count} membros**`);
    } else if (groupType === "EQUIPE") {
      lines.push(`\n**Equipe <@&${roleId}> Membros: ${count} Membros**`);
    } else {
      lines.push(`\n**TOTAIS: ${count} <@&${roleId}>**`);
    }
    lines.push("");
  }

  if (groupType === "GESTAO") lines.push(`**TOTAIS DA Coordenação: ${groupTotal}**`);
  if (groupType === "EQUIPE") lines.push(`**totais da Equipe Creators gerais: ${groupTotal} membros**`);

  return lines.join("\n");
}

let PANEL_UPDATING = false;
let PANEL_NEEDS_UPDATE = false;
let UPDATE_DEBOUNCE = null;

// ✅ Fila de atualização (resolve: "diz que atualizou mas não atualiza")
let PANEL_UPDATE_PROMISE = null;

// ================= CORE: ATUALIZAR PAINEL =================
async function updateHierarchyPanel(client) {
  // ✅ FILA REAL: se já estiver atualizando, não "finge" que atualizou
  if (PANEL_UPDATE_PROMISE) {
    PANEL_NEEDS_UPDATE = true;
    return PANEL_UPDATE_PROMISE;
  }

  PANEL_NEEDS_UPDATE = false;

  PANEL_UPDATE_PROMISE = (async () => {
    do {
      PANEL_UPDATING = true;

      try {
        const channel = await client.channels.fetch(CONFIG.PANEL_CHANNEL_ID).catch((err) => {
          console.error("[Hierarquia] ❌ Erro ao buscar canal:", err);
          return null;
        });

        if (!channel || !channel.isTextBased()) {
          console.error(`[Hierarquia] ❌ Canal ${CONFIG.PANEL_CHANNEL_ID} não encontrado ou sem permissão.`);
          return;
        }

        const guild = channel.guild;

        // ✅ força atualizar cache (melhora "demora pra refletir")
        await guild.roles.fetch();
        try {
          await guild.members.fetch({ time: 60000 });
        } catch (e) {
          console.warn("[Hierarquia] Fetch members timeout (usando cache parcial):", e.message);
        }

        const slots = loadSlots();
        const divisions = loadDivisions();

        // Resolve emojis (com fallback)
        const E = {};
        for (const k of Object.keys(CONFIG.EMOJIS)) {
          E[k] = resolveEmoji(channel, CONFIG.EMOJIS[k], CONFIG.EMOJI_FALLBACKS[k] || "");
        }

        // ✅ prioridade global: quem apareceu em cima não aparece em baixo
        const seen = new Set();

        // Helper para pegar lista formatada
        const getMembersByRole = (roleId, filterSlot = null) => {
          const role = guild.roles.cache.get(roleId);
          if (!role) return "";

          const members = role.members
            .filter((m) => !m.user.bot)
            .map((m) => m);

          const filtered = members.filter((m) => {
            const userSlot = slots[m.id] || CONFIG.SLOTS.NONE;
            if (filterSlot === "ANY") return true;
            return userSlot === filterSlot;
          });

          // ✅ não repete se já apareceu (prioridade)
          const finalList = filtered.filter((m) => !seen.has(m.id));

          if (finalList.length === 0) return "";

          // ✅ marca como já listado
          for (const m of finalList) seen.add(m.id);

          const countLine = `\ntotais: ${finalList.length} <@&${roleId}>`;

          return finalList
            .map((m) => {
              const userSlot = slots[m.id] || CONFIG.SLOTS.NONE;
              let icon = "";
              if (filterSlot === "ANY") {
                if (userSlot === CONFIG.SLOTS.EVENING) icon = "🌅 ";
                if (userSlot === CONFIG.SLOTS.DAWN) icon = "🌌 ";
              }
              return `${E.DOT} ${icon}${m.toString()}`;
        })
        .join("\n") + countLine;
        };

        const getDivisionLines = (divisionKey) => {
          const respInfluRole = guild.roles.cache.get(CONFIG.ROLES.RESP_INFLU);
          const respLiderRole = guild.roles.cache.get(CONFIG.ROLES.RESP_LIDER);

          const respInfluMembers = respInfluRole
  ? respInfluRole.members
      .filter((m) => !m.user.bot && memberHasDivision(divisions, m.id, divisionKey))
      .map((m) => m)
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
  : [];

const respLiderMembers = respLiderRole
  ? respLiderRole.members
      .filter((m) => !m.user.bot && memberHasDivision(divisions, m.id, divisionKey))
      .map((m) => m)
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
  : [];

          const influLine =
            respInfluMembers.length > 0
              ? respInfluMembers.map((m) => `${E.DOT} ${m.toString()}`).join("\n")
              : "_Nenhum Resp. Influ definido_";

          const liderLine =
            respLiderMembers.length > 0
              ? respLiderMembers.map((m) => `${E.DOT} ${m.toString()}`).join("\n")
              : "_Nenhum Resp. Líder definido_";

          return [
            `### ${CONFIG.DIVISIONS[divisionKey].label}`,
            `**Resp. Influ:**`,
            influLine,
            `**Resp. Líder:**`,
            liderLine,
            "",
          ].join("\n");
        };

        const sections = [
          `# ${E.CROWN_BLACK}   👑 HIERARQUIA OFICIAL — SANTACREATORS  ${E.CROWN_BLACK}`,
          "",
          "┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅",
          `#  ${E.CROWN_GOLD} OWNER ${E.CROWN_GOLD}`,
          getMembersByRole(CONFIG.ROLES.OWNER, "ANY") || `${E.DOT} (Vago)`,
          "",
          "┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅",
          `#  ${E.CROWN_GOLD} RESP. CREATORS ${E.CROWN_GOLD}`,
          getMembersByRole(CONFIG.ROLES.RESP_CREATOR, "ANY") || `${E.DOT} (Vago)`,
          "",
          "┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅",
          `#  ${E.CROWN_INFLU}   RESP. INFLU  ${E.CROWN_INFLU}`,
          getMembersByRole(CONFIG.ROLES.RESP_INFLU, "ANY") || `${E.DOT} (Vago)`,
          "",
          "┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅",
          `#  ${E.CROWN_CYAN}   RESP. LIDER ${E.CROWN_CYAN}`,
          "",
`### ${CONFIG.LABELS.evening}`,
getMembersByRole(CONFIG.ROLES.RESP_LIDER, CONFIG.SLOTS.EVENING) || "_Ninguém definido_",
"",
`### ${CONFIG.LABELS.dawn}`,
getMembersByRole(CONFIG.ROLES.RESP_LIDER, CONFIG.SLOTS.DAWN) || "_Ninguém definido_",
          "",
`### ⚪ Sem Horário Fixo / Flexível`,
getMembersByRole(CONFIG.ROLES.RESP_LIDER, CONFIG.SLOTS.NONE) || "_Ninguém_",
"",
"┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅",
"## 🏙️ RESPS DE CADA CIDADE",
"",
getDivisionLines("maresia"),
getDivisionLines("grande"),
getDivisionLines("santa"),
getDivisionLines("nobre"),
getDivisionLines("none"),
"> Cada cidade deve ter 2 RESPONSÁVEIS tendo **1 Resp. Líder + 1 Resp. Influ**.",
"> A divisão pode ser alterada pelo o seu responsável acima.",
"",

"┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅",
`#  ${E.CROWN_GREEN}  COORD. CREATORS  ${E.CROWN_GREEN}`,
          "",
          `### ${CONFIG.LABELS.evening}`,
          getMembersByRole(CONFIG.ROLES.COORD_CREATOR, CONFIG.SLOTS.EVENING) || "_Ninguém definido_",
          "",
          `### ${CONFIG.LABELS.dawn}`,
          getMembersByRole(CONFIG.ROLES.COORD_CREATOR, CONFIG.SLOTS.DAWN) || "_Ninguém definido_",
          "",
          `### ⚪ Sem Horário Fixo / Flexível`,
          getMembersByRole(CONFIG.ROLES.COORD_CREATOR, CONFIG.SLOTS.NONE) || "_Ninguém_",
          "",
          "┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅",
          `#  ${E.CROWN_INFLU}  COORDENAÇÃO / GESTÃO ${E.CROWN_INFLU}`,
          "",
          getMembersByRoleGroups(guild, CONFIG.GROUPS.GESTAO, slots, "ANY", E, seen, "GESTAO") || "_Ninguém_",
          "",
          "┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅",
          `#  ${E.CROWN_CYAN}    EQUIPE CREATOR  ${E.CROWN_CYAN}`,
          "",
          getMembersByRoleGroups(guild, CONFIG.GROUPS.EQUIPE, slots, "ANY", E, seen, "EQUIPE") || "_Ninguém_",
          "",
          "┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅",
          "",
          `# 👥 MEMBROS TOTAIS NA GESTÃO: ${seen.size}`,
          "",
          "🧩 **Organização e comunicação são pilares da nossa estrutura.**",
          "⚠️ *Qualquer denúncia deve ser tratada com os responsáveis!*",
          "",
          "**⚠️ AVISO IMPORTANTE — SANTACREATORS ⚠️**",
          "Pedimos a atenção e o respeito à **hierarquia oficial da empresa**.",
          "Qualquer assunto relacionado à **SantaCreators** deve ser tratado **diretamente com a gestão**.",
        ];

        const embed = new EmbedBuilder()
          .setColor("#2b2d31")
          .setDescription(sections.join("\n"))
          .setImage(CONFIG.GIF_FOOTER);

const row = new ActionRowBuilder().addComponents(
  new ButtonBuilder()
    .setCustomId("hier_manage_slots")
    .setLabel("Gerenciar horários")
    .setStyle(ButtonStyle.Secondary)
    .setEmoji("🕰️"),
  new ButtonBuilder()
    .setCustomId("hier_manage_divisions")
    .setLabel("Gerenciar divisões")
    .setStyle(ButtonStyle.Secondary)
    .setEmoji("🏙️"),
  new ButtonBuilder()
    .setCustomId("hier_refresh")
    .setLabel("🔄 Atualizar")
    .setStyle(ButtonStyle.Secondary)
);

        // ✅ OTIMIZAÇÃO: Verifica se houve mudança real antes de editar (Anti-Flood)
        const payloadData = {
          embeds: [embed.toJSON()],
          components: [row.toJSON()]
        };
        const newHash = crypto.createHash('md5').update(JSON.stringify(payloadData)).digest('hex');
        const panelState = loadPanelState();

        // Se o hash for igual ao último salvo e a mensagem existe, não faz nada
        if (panelState.messageId && panelState.lastHash === newHash) {
          // console.log("[Hierarquia] 💤 Nenhuma alteração detectada. Pulando edição.");
          PANEL_UPDATING = false;
          return;
        }

        if (panelState.messageId) {
          try {
            const msg = await channel.messages.fetch(panelState.messageId);
            await msg.edit({ embeds: [embed], components: [row] });
            savePanelState({ messageId: msg.id, lastHash: newHash });
            console.log("[Hierarquia] ✅ Painel editado com sucesso.");
            return;
          } catch (err) {
            console.error("[Hierarquia] ⚠️ Não consegui editar a msg antiga do painel. Vou recriar.", err);
          }
        }

        // Apaga mensagens antigas do bot para limpar o canal
        try {
          const recent = await channel.messages.fetch({ limit: 10 });
          const botMsgs = recent.filter((m) => m.author.id === client.user.id);
          for (const m of botMsgs.values()) await m.delete().catch(() => {});
        } catch {}

        const newMsg = await channel.send({ embeds: [embed], components: [row] });
        savePanelState({ messageId: newMsg.id });
        console.log("[Hierarquia] ✅ Novo painel enviado.");
      } catch (err) {
        console.error("[Hierarquia] ❌ ERRO REAL (updateHierarchyPanel):", err);
      } finally {
        PANEL_UPDATING = false;
      }

      // se alguém pediu update enquanto rodava, roda de novo imediatamente
    } while (PANEL_NEEDS_UPDATE === true);

  })().finally(() => {
    PANEL_UPDATE_PROMISE = null;
  });

  return PANEL_UPDATE_PROMISE;
}

// ================= LOGS COM BOTÃO DE REVERTER =================
async function logChange(client, actor, targetUser, oldSlot, newSlot) {
  const channel = await client.channels.fetch(CONFIG.LOG_CHANNEL_ID).catch(() => null);
  if (!channel) return;

  const oldKey = oldSlot || CONFIG.SLOTS.NONE;
  const newKey = newSlot || CONFIG.SLOTS.NONE;

  const embed = new EmbedBuilder()
    .setTitle("🕰️ Alteração de Horário na Hierarquia")
    .setColor(newKey === CONFIG.SLOTS.NONE ? "#e74c3c" : "#2ecc71")
    .addFields(
      { name: "👤 Membro", value: `${targetUser.toString()} (\`${targetUser.id}\`)`, inline: true },
      { name: "👮 Alterado por", value: `${actor.toString()} (\`${actor.id}\`)`, inline: true },
      { name: "📉 Antes", value: CONFIG.LABELS[oldKey] || oldKey, inline: true },
      { name: "📈 Depois", value: CONFIG.LABELS[newKey] || newKey, inline: true }
    )
    .setTimestamp()
    .setFooter({ text: "Sistema de Hierarquia • SantaCreators" });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`hier_revert:${targetUser.id}:${oldKey}`)
      .setLabel("↩️ Reverter Alteração")
      .setStyle(ButtonStyle.Danger)
  );

  await channel.send({ embeds: [embed], components: [row] });
}

async function logDivisionChange(client, actor, targetUser, oldDivision, newDivision) {
  const channel = await client.channels.fetch(CONFIG.LOG_CHANNEL_ID).catch(() => null);
  if (!channel) return;

const oldKeys = Array.isArray(oldDivision) ? oldDivision : [oldDivision || "none"];
const newKeys = Array.isArray(newDivision) ? newDivision : [newDivision || "none"];

const embed = new EmbedBuilder()
  .setTitle("🏙️ Alteração de Divisão na Hierarquia")
  .setColor(newKeys.includes("none") ? "#e74c3c" : "#2ecc71")
  .addFields(
    { name: "👤 Membro", value: `${targetUser.toString()} (\`${targetUser.id}\`)`, inline: true },
    { name: "👮 Alterado por", value: `${actor.toString()} (\`${actor.id}\`)`, inline: true },
    { name: "📉 Antes", value: getDivisionLabels(oldKeys), inline: true },
    { name: "📈 Depois", value: getDivisionLabels(newKeys), inline: true }
  )
    .setTimestamp()
    .setFooter({ text: "Sistema de Divisões • SantaCreators" });

  await channel.send({ embeds: [embed] });
}

// ================= AUTO-UPDATE (MUDANÇA DE CARGO) =================
export async function hierarquiaHandleGuildMemberUpdate(oldMember, newMember, client) {
  const oldRoles = oldMember.roles.cache;
  const newRoles = newMember.roles.cache;

  if (oldRoles.equals(newRoles)) return;

  // Lista de cargos que importam para a hierarquia
  const trackedRoles = new Set(Object.values(CONFIG.ROLES));

  const hasRelevantChange = 
    [...oldRoles.keys()].some(id => trackedRoles.has(id)) ||
    [...newRoles.keys()].some(id => trackedRoles.has(id));

  if (hasRelevantChange) {
    // Debounce para evitar flood se vários cargos mudarem ao mesmo tempo
    if (UPDATE_DEBOUNCE) clearTimeout(UPDATE_DEBOUNCE);
    
    UPDATE_DEBOUNCE = setTimeout(() => {
      updateHierarchyPanel(client).catch(console.error);
    }, 30000); // Aguarda 30 segundos após a última mudança para atualizar
  }
}

// ================= HANDLERS =================
export async function hierarquiaOnReady(client) {
  console.log("[Hierarquia] 🔄 Iniciando verificação do painel...");
  await updateHierarchyPanel(client);

  setInterval(() => {
    updateHierarchyPanel(client).catch(() => {});
  }, 24 * 60 * 60 * 1000); // ✅ Alterado para 24 horas (1 vez ao dia)
}

export async function hierarquiaHandleInteraction(interaction, client) {
  if (!interaction.guild) return false;

  // Debug para ver se o clique chega
  if (interaction.customId?.startsWith("hier_")) {
    console.log(`[Hierarquia] Interação: ${interaction.customId} por ${interaction.user.tag}`);
  }

  // 1) Botão Refresh
  if (interaction.isButton() && interaction.customId === "hier_refresh") {
    const perm = checkPermission(interaction.member);
    if (perm === "NONE") {
      return interaction.reply({
        content: "🚫 Você não tem permissão para atualizar.",
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true }).catch(() => {});

    try {
      await updateHierarchyPanel(client);
      await interaction.editReply("✅ Painel atualizado.").catch(() => {});
    } catch (err) {
      console.error("[Hierarquia] ❌ Erro no refresh:", err);
      await interaction.editReply("❌ Falhou ao atualizar. Olha o console.").catch(() => {});
    }
    return true;
  }

  // 2) Botão Gerenciar (Abre Menu de Seleção de Usuário)
 if (interaction.isButton() && interaction.customId === "hier_manage_slots") {

  const perm = checkPermission(interaction.member);
  if (perm === "NONE") {
    return interaction.reply({
      content: "🚫 Você não tem permissão para gerenciar a hierarquia.",
      ephemeral: true,
    });
  }

// ✅ ACK IMEDIATO REAL: evita "Esta interação falhou"
await interaction.reply({
  content: "⏳ Abrindo gerenciador de horários...",
  ephemeral: true,
}).catch(() => {});

  try {
    // 🔥 NÃO FAZER guild.members.fetch() completo
    // Vamos buscar apenas membros dos cargos necessários

    const guild = interaction.guild;

    const targetRoles = [
      CONFIG.ROLES.COORD_CREATOR,
      CONFIG.ROLES.RESP_LIDER,
    ];

    let members = [];

    for (const roleId of targetRoles) {
      const role = guild.roles.cache.get(roleId);
      if (!role) continue;

      const roleMembers = role.members.filter(m => !m.user.bot);
      members.push(...roleMembers.values());
    }

    // Remove duplicados
    members = [...new Map(members.map(m => [m.id, m])).values()];

    // Se for MOD, remove Resp Líder da lista
    if (perm === "MOD") {
      members = members.filter(
        (m) => !m.roles.cache.has(CONFIG.ROLES.RESP_LIDER)
      );
    }

    if (members.length === 0) {
      return interaction.editReply({
        content: "⚠️ Nenhum membro editável encontrado.",
      }).catch(() => {});
    }

    members.sort((a, b) =>
      a.displayName.localeCompare(b.displayName)
    );

    const first25 = members.slice(0, 25);

    const options = first25.map((m) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(m.displayName.slice(0, 100))
        .setValue(m.id)
        .setDescription(m.roles.highest?.name?.slice(0, 100) || "Membro")
        .setEmoji("👤")
    );

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("hier_select_user")
        .setPlaceholder("Selecione o membro para alterar o horário")
        .addOptions(options)
    );

    const extra =
      members.length > 25
        ? `\n⚠️ Mostrando 25 de ${members.length}.`
        : "";

    await interaction.editReply({
      content: `👤 **Selecione o membro** que deseja alterar o horário:${extra}`,
      components: [row],
    }).catch(() => {});
  } catch (err) {
    console.error("[Hierarquia] ❌ Erro no hier_manage_slots:", err);
    await interaction.editReply({
      content: "❌ Deu erro ao abrir o gerenciador. Veja o console.",
    }).catch(() => {});
  }

  return true;
}

  // 2.1) Botão Gerenciar Divisões
  if (interaction.isButton() && interaction.customId === "hier_manage_divisions") {
    await interaction.reply({
      content: "⏳ Abrindo gerenciador de divisões...",
      ephemeral: true,
    }).catch(() => {});

    try {
      const guild = interaction.guild;

      const targetRoles = [
        CONFIG.ROLES.RESP_INFLU,
        CONFIG.ROLES.RESP_LIDER,
      ];

      let members = [];

      for (const roleId of targetRoles) {
        const role = guild.roles.cache.get(roleId);
        if (!role) continue;

        const roleMembers = role.members.filter((m) => !m.user.bot);
        members.push(...roleMembers.values());
      }

      members = [...new Map(members.map((m) => [m.id, m])).values()];
      members = members.filter((m) => canManageDivisionTarget(interaction.member, m));

      if (members.length === 0) {
        return interaction.editReply({
          content: "🚫 Você não tem nenhum Resp. Influ ou Resp. Líder disponível para alterar pela sua hierarquia.",
        }).catch(() => {});
      }

      members.sort((a, b) => a.displayName.localeCompare(b.displayName));

      const first25 = members.slice(0, 25);

      const options = first25.map((m) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(m.displayName.slice(0, 100))
          .setValue(m.id)
          .setDescription(m.roles.highest?.name?.slice(0, 100) || "Membro")
          .setEmoji("👤")
      );

      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("hier_select_division_user")
          .setPlaceholder("Selecione o responsável para alterar a cidade")
          .addOptions(options)
      );

      const extra =
        members.length > 25
          ? `\n⚠️ Mostrando 25 de ${members.length}.`
          : "";

      await interaction.editReply({
        content: `👤 **Selecione o responsável** que deseja separar por cidade:${extra}`,
        components: [row],
      }).catch(() => {});
    } catch (err) {
      console.error("[Hierarquia] ❌ Erro no hier_manage_divisions:", err);
      await interaction.editReply({
        content: "❌ Deu erro ao abrir o gerenciador de divisões. Veja o console.",
      }).catch(() => {});
    }

    return true;
  }

  // 2.2) Seleção de Usuário para Divisão
  if (interaction.isStringSelectMenu() && interaction.customId === "hier_select_division_user") {
    const targetId = interaction.values[0];

    const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
    if (!targetMember) {
      return interaction.reply({
        content: "⚠️ Não encontrei esse membro no servidor.",
        ephemeral: true,
      });
    }

    if (!isDivisionTargetRole(targetMember)) {
      return interaction.reply({
        content: "⚠️ Esse membro não é Resp. Influ nem Resp. Líder.",
        ephemeral: true,
      });
    }

    if (!canManageDivisionTarget(interaction.member, targetMember)) {
      return interaction.reply({
        content: "🚫 Você não tem permissão de hierarquia para alterar a divisão desse responsável.",
        ephemeral: true,
      });
    }

    const divisions = loadDivisions();
const currentDivisions = getMemberDivisions(divisions, targetId);
const isRespInflu = hasRole(targetMember, CONFIG.ROLES.RESP_INFLU);

const options = Object.entries(CONFIG.DIVISIONS).map(([key, data]) =>
  new StringSelectMenuOptionBuilder()
    .setLabel(data.label.slice(0, 100))
    .setValue(key)
    .setDescription(currentDivisions.includes(key) ? "Divisão atual" : "Alterar para esta divisão")
    .setEmoji(data.emoji)
    .setDefault(currentDivisions.includes(key))
);

const row = new ActionRowBuilder().addComponents(
  new StringSelectMenuBuilder()
    .setCustomId(`hier_set_division:${targetId}`)
    .setPlaceholder(isRespInflu ? "Escolha até 2 cidades do Resp. Influ" : "Escolha a cidade do responsável")
    .setMinValues(1)
    .setMaxValues(isRespInflu ? 2 : 1)
    .addOptions(options)
);

await interaction.update({
  content: `🏙️ Editando divisão de <@${targetId}>\nAtualmente: **${getDivisionLabels(currentDivisions)}**\n${isRespInflu ? "ℹ️ Resp. Influ pode ficar em até **2 cidades**." : "ℹ️ Resp. Líder pode ficar em apenas **1 cidade**."}`,
  components: [row],
}).catch(() => {});

    return true;
  }

  // 2.3) Setar Divisão
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith("hier_set_division:")) {
    await interaction.deferReply({ ephemeral: true }).catch(() => {});

    try {
      const [, targetId] = interaction.customId.split(":");
      const newDivision = interaction.values[0];

      if (!CONFIG.DIVISIONS[newDivision]) {
        return interaction.editReply({
          content: "⚠️ Divisão inválida.",
        }).catch(() => {});
      }

      const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
      if (!targetMember) {
        return interaction.editReply({
          content: "⚠️ Não encontrei esse membro no servidor.",
        }).catch(() => {});
      }

      if (!isDivisionTargetRole(targetMember)) {
        return interaction.editReply({
          content: "⚠️ Esse membro não é Resp. Influ nem Resp. Líder.",
        }).catch(() => {});
      }

      if (!canManageDivisionTarget(interaction.member, targetMember)) {
        return interaction.editReply({
          content: "🚫 Você não tem permissão de hierarquia para alterar a divisão desse responsável.",
        }).catch(() => {});
      }

      const divisions = loadDivisions();
const oldDivisions = getMemberDivisions(divisions, targetId);
const newDivisions = normalizeMemberDivisions(interaction.values, targetMember);

if (JSON.stringify(oldDivisions.sort()) === JSON.stringify([...newDivisions].sort())) {
  return interaction.editReply({
    content: "⚠️ Esse responsável já está nessa divisão.",
  }).catch(() => {});
}

divisions[targetId] = newDivisions;
saveDivisions(divisions);

await interaction.editReply({
  content: `✅ Divisão de <@${targetId}> alterada para **${getDivisionLabels(newDivisions)}**.\n🔄 Estou atualizando o painel em segundo plano.`,
}).catch(() => {});

      updateHierarchyPanel(client)
        .then(async () => {
          const targetUser = await client.users.fetch(targetId).catch(() => null);
          if (targetUser) {
            await logDivisionChange(client, interaction.user, targetUser, oldDivisions, newDivisions);
          }
        })
        .catch((err) => {
          console.error("[Hierarquia] ❌ Erro ao atualizar painel/log após divisão:", err);
        });

      return true;
    } catch (err) {
      console.error("[Hierarquia] ❌ Erro no hier_set_division:", err);
      return interaction.editReply({
        content: "❌ Deu erro ao alterar a divisão. Olha o console pra ver o motivo.",
      }).catch(() => {});
    }
  }

  // 3) Seleção de Usuário (Mostra botões de horário)
  if (interaction.isStringSelectMenu() && interaction.customId === "hier_select_user") {
    const perm = checkPermission(interaction.member);
    if (perm === "NONE") {
      return interaction.reply({ content: "🚫 Sem permissão.", ephemeral: true });
    }

    const targetId = interaction.values[0];

    const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
    if (!targetMember) {
      return interaction.reply({ content: "⚠️ Não encontrei esse membro no servidor.", ephemeral: true });
    }

    // MOD não pode mexer em Resp Líder
    if (perm === "MOD" && targetMember.roles.cache.has(CONFIG.ROLES.RESP_LIDER)) {
      return interaction.reply({ content: "🚫 Resp Líder só pode editar COORD.", ephemeral: true });
    }

    const slots = loadSlots();
    const currentSlot = slots[targetId] || CONFIG.SLOTS.NONE;

    const row = new ActionRowBuilder().addComponents(
  new ButtonBuilder()
  .setCustomId(`hier_set:${targetId}:${CONFIG.SLOTS.EVENING}`)
  .setLabel("19:00 - 22:00")
  .setStyle(ButtonStyle.Primary)
  .setDisabled(currentSlot === CONFIG.SLOTS.EVENING),
new ButtonBuilder()
  .setCustomId(`hier_set:${targetId}:${CONFIG.SLOTS.DAWN}`)
  .setLabel("23:00 - 02:00")
  .setStyle(ButtonStyle.Primary)
  .setDisabled(currentSlot === CONFIG.SLOTS.DAWN),
      new ButtonBuilder()
        .setCustomId(`hier_set:${targetId}:${CONFIG.SLOTS.NONE}`)
        .setLabel("⚪ Remover Horário")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentSlot === CONFIG.SLOTS.NONE)
    );

    await interaction.update({
      content: `🛠️ Editando horário para <@${targetId}>\nAtualmente: **${CONFIG.LABELS[currentSlot]}**`,
      components: [row],
    }).catch(() => {});
    return true;
  }

  // 4) Botão de Setar Horário
  if (interaction.isButton() && interaction.customId.startsWith("hier_set:")) {
    const perm = checkPermission(interaction.member);
    if (perm === "NONE") {
      return interaction.reply({
        content: "🚫 Você não tem permissão para alterar horários.",
        ephemeral: true,
      });
    }

    // ✅ ACK IMEDIATO (antes de qualquer fetch pesado)
    await interaction.deferReply({ ephemeral: true }).catch(() => {});

    try {
      const [, targetId, newSlot] = interaction.customId.split(":");

      if (!Object.values(CONFIG.SLOTS).includes(newSlot)) {
        return interaction.editReply({ content: "⚠️ Slot inválido." }).catch(() => {});
      }

      const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
      if (!targetMember) {
        return interaction.editReply({ content: "⚠️ Não encontrei esse membro no servidor." }).catch(() => {});
      }

      const isTargetEditableRole =
        targetMember.roles.cache.has(CONFIG.ROLES.COORD_CREATOR) ||
        targetMember.roles.cache.has(CONFIG.ROLES.RESP_LIDER);

      if (!isTargetEditableRole) {
        return interaction.editReply({ content: "⚠️ Esse membro não está em COORD/RESP LÍDER." }).catch(() => {});
      }

      if (perm === "MOD" && targetMember.roles.cache.has(CONFIG.ROLES.RESP_LIDER)) {
        return interaction.editReply({ content: "🚫 Resp Líder só pode editar COORD." }).catch(() => {});
      }

      const slots = loadSlots();
      const oldSlot = slots[targetId] || CONFIG.SLOTS.NONE;

      if (oldSlot === newSlot && newSlot !== CONFIG.SLOTS.NONE) {
        return interaction.editReply({ content: "⚠️ Esse usuário já está nesse horário." }).catch(() => {});
      }

      slots[targetId] = newSlot;
      saveSlots(slots);

      await updateHierarchyPanel(client);

      const targetUser = await client.users.fetch(targetId).catch(() => null);
      if (targetUser) {
        await logChange(client, interaction.user, targetUser, oldSlot, newSlot);
      }

      return interaction.editReply({
        content: `✅ Horário de <@${targetId}> alterado para **${CONFIG.LABELS[newSlot]}**.\n🧾 Painel atualizado.`,
      }).catch(() => {});
    } catch (err) {
      console.error("[Hierarquia] ❌ Erro no hier_set:", err);
      return interaction.editReply({
        content: "❌ Deu erro ao alterar/atualizar. Olha o console pra ver o motivo.",
      }).catch(() => {});
    }
  }

  // 5) Botão de REVERTER (Log)
  if (interaction.isButton() && interaction.customId.startsWith("hier_revert:")) {
    const perm = checkPermission(interaction.member);
    if (perm === "NONE") {
      return interaction.reply({ content: "🚫 Sem permissão para reverter.", ephemeral: true });
    }

    // ✅ DEFER REPLY AQUI (evita timeout enquanto atualiza painel)
    await interaction.deferReply({ ephemeral: true }).catch(() => {});

    const [, targetId, slotToRestore] = interaction.customId.split(":");

    if (!Object.values(CONFIG.SLOTS).includes(slotToRestore)) {
      return interaction.editReply({ content: "⚠️ Slot inválido no botão de reversão." });
    }

    const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
    if (!targetMember) {
      return interaction.editReply({ content: "⚠️ Não encontrei esse membro no servidor." });
    }

    if (perm === "MOD" && targetMember.roles.cache.has(CONFIG.ROLES.RESP_LIDER)) {
      return interaction.editReply({ content: "🚫 Resp Líder só pode reverter COORD." });
    }

    const slots = loadSlots();
    const currentSlot = slots[targetId] || CONFIG.SLOTS.NONE;

    slots[targetId] = slotToRestore;
    saveSlots(slots);

    await updateHierarchyPanel(client);

    const targetUser = await client.users.fetch(targetId).catch(() => null);

    // Atualiza a mensagem do log original para mostrar que foi revertido
    if (interaction.message?.embeds?.[0]) {
      const embedOriginal = EmbedBuilder.from(interaction.message.embeds[0]);
      embedOriginal.setColor("#95a5a6").setFooter({ text: `Revertido por ${interaction.user.tag}` });
      await interaction.message.edit({ embeds: [embedOriginal], components: [] }).catch(() => {});
    }

    if (targetUser) {
      await logChange(client, interaction.user, targetUser, currentSlot, slotToRestore);
    }

    await interaction.editReply({
      content: `↩️ Alteração revertida! <@${targetId}> voltou para **${CONFIG.LABELS[slotToRestore]}**.`,
    }).catch(() => {});
    return true;
  }

  return false;
}

// Comando manual de emergência
export async function hierarquiaHandleMessage(message, client) {
  if (message.content === "!hierarquia") {
    if (checkPermission(message.member) !== "ADMIN") {
      setTimeout(() => message.delete().catch(() => {}), 1000);
      const msg = await message.reply("❌ Você não tem permissão para usar este comando.");
      setTimeout(() => msg.delete().catch(() => {}), 5000);
      return true;
    }
    await message.reply("🔄 Forçando atualização do painel... (olhe o console se não aparecer)").catch(() => {});
    await updateHierarchyPanel(client);
    return true;
  }
  return false;
}
