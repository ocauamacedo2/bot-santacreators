  // d:\santacreators-main\events\hallDaFama.js
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  WebhookClient,
  InteractionType,
  AttachmentBuilder
} from "discord.js";

  import { dashEmit } from "../utils/dashHub.js";

import {
  recordApprovalCreated,
  recordApprovalDecision,
} from "../utils/approvalOperationalIntelligence.js";

  // ================= CONFIGURAÇÃO =================
  const HALL_CHANNEL_ID = "1386503496353976470"; // Canal Oficial do Hall da Fama
  const APPROVAL_CHANNEL_ID = "1387864036259004436"; // Canal de Aprovação
  const HALL_AUDIT_LOG_CH_ID = "1486006930492362893";
const HALL_ORGS_RANKING_CHANNEL_ID = "1518696187237236816"; // Ranking GERAL de ORGs com mais GGs
const HALL_PLAYERS_RANKING_CHANNEL_ID = "1518696133071863838"; // Ranking de Pessoas com mais GGs

const HALL_ORGS_CITY_RANKING_CHANNELS = {
  nobre: "1539694067104088075",
  santa: "1539694099764875385",
  grande: "1539695240464568461",
  maresia: "1539695203638710322"
};

const HALL_ORGS_RANKING_WEBHOOK_URL = "https://discord.com/api/webhooks/1519547838957359155/TjDA5C-QquaAag2YBKqhfwR1szql7hooy-m53EAto6O37o3ZhP-PBIEduH64QodLBLGD";
const HALL_PLAYERS_RANKING_WEBHOOK_URL = "";

const RANKING_PRIVATE_LOG_CHANNEL_ID = "1521946409207730347";

const RANKING_ROLE_CIDADAO = "1262978759922028575";
const RANKING_ROLE_SEM_WL = "1430984036972494908";

const RANKING_FREE_USERS = [
  "660311795327828008",
  "1262262852949905408"
];

const RANKING_FREE_ROLES = [
  "1262262852949905408",
  "1352408327983861844",
  "1262262852949905409",
  "1352407252216184833"
];

const BTN_RANK_ORG_SEARCH = "hf_rank_org_search";
const BTN_RANK_ORG_NEXT_PREFIX = "hf_rank_org_next:";
const BTN_RANK_PLAYER_SEARCH = "hf_rank_player_search";
const BTN_RANK_PLAYER_NEXT_PREFIX = "hf_rank_player_next:";
const MODAL_RANK_ORG_SEARCH = "hf_rank_org_search_modal";
const MODAL_RANK_PLAYER_SEARCH = "hf_rank_player_search_modal";
const MODAL_RANK_WL_PREFIX = "hf_rank_wl:";

const HALL_REVIEW_CHANNEL_ID = "1518707314901651576";// Canal para revisão manual de Halls confusos
const HALL_HISTORICAL_IMAGES_CHANNEL_ID = "1459982880158646496"; // Armazena cópias permanentes das imagens dos Halls humanos
  const PAYMENT_EVENTS_CHANNEL_ID = "1387922662134775818"; // Canal dos botões/registros de pagamento de evento
  const PAYMENT_CITY_REVIEW_CHANNEL_ID = "1518707314901651576"; // Canal para decidir CDD de pagamento sem cidade
  const HALL_SCAN_PROGRESS_CHANNEL_ID = "1518723758574276750"; // Painel auto-editável do progresso da varredura
  const HALL_SCAN_LOG_CHANNEL_ID = "1518723758574276750"; // Logs robustos da varredura

  const CRONO_LOG_CHANNEL_ID = "1486009619846529075"; // Logs do cronograma
  const CRONO_PANEL_CHANNEL_ID = "1474605177771397223"; // Painel do cronograma
  const EVENTOS_DIARIOS_CHANNEL_ID = "1385003944803041371"; // Eventos diários

  // Cargos Fixos para Menção
  const ROLE_CIDADAO = "1262978759922028575";
  const ROLE_LIDERES = "1353858422063239310";

  // Cidades e seus Cargos
  const CITIES = {
    nobre:   { label: "Cidade Nobre",   roleId: "1379021805544804382", emoji: "💎" },
    santa:   { label: "Cidade Santa",   roleId: "1379021888709464168", emoji: "🎅" },
    grande:  { label: "Cidade Grande",  roleId: "1418691103397253322", emoji: "🏙️" },
    maresia: { label: "Cidade Maresia", roleId: "1379021994678288465", emoji: "🌊" },
  };

const PAYMENT_CITY_BY_DISCORD_CHANNEL = {
  "755203021490749530:1135417544862347357": "nobre",
  "690983940567334964:1135340708799193128": "santa",
  "788905600699858944:1399498294639595690": "grande",
  "798594785896038401:1135417626663854080": "maresia"
};

  const KNOWN_ORG_NAMES = [
    "tropa do 7",
    "tropado7",
    "legiao belica",
    "vidigal",
    "alcateia",
    "russia",
    "telilas",
    "fdg",
    "mete gala",
    "metegala",
    "bombeiros",
    "real odio",
    "visionario",
    "visionarios",
    "trindade",
    "morro do sacola",
    "familia novaera",
    "novaera",
    "nova era",
    "big",
    "espanha",
    "familia espanha",
    "dixavas",
    "akuma",
    "real trem",
    "drift king",
    "medellin",
    "tropa do caos",
    "familia red",
    "red",
    "prn",
    "sintonia",
    "cpx",
    "complexo do odio",
    "complexo-do-odio",
    "complexo do ódio",
    "tokyo",
    "akuma",
    "anjos",
    "anonymous",
    "arcade",
    "azuis",
    "ballas",
    "banzas",
    "barragem",
    "bellagio",
    "berlim",
    "black rose",
    "black-rose",
    "bombeiros",
    "carclube",
    "car clube",
    "caribe",
    "casadasprimas",
    "casadas primas",
    "china",
    "cinzas",
    "civil nobre",
    "colapso",
    "conexao33",
    "conexão 33",
    "corleone",
    "cpx",
    "dixavas",
    "dogringo",
    "dragon",
    "driftking",
    "drift king",
    "egito",
    "exercito",
    "fazenda magnatas",
    "fazendinha",
    "franca",
    "galaxy",
    "groove",
    "helipa",
    "hollywood",
    "hospital",
    "imperio",
    "inglaterra",
    "italia",
    "japao",
    "juridico",
    "kamikaze",
    "kings",
    "kraken",
    "luxor",
    "marrons",
    "master",
    "mecanica",
    "mercenarios",
    "metgala",
    "mexico",
    "overdrive",
    "palazzo",
    "penha",
    "pinkmans",
    "playboy",
    "policia nobre",
    "prn",
    "real trem",
    "real odio",
    "renegados",
    "rj mt",
    "rj-mt",
    "sindicato",
    "submundo",
    "tacaballa",
    "tatica",
    "tequilas",
    "the house",
    "tropa do 7",
    "tropa do caos",
    "tropa do chefinho",
    "tropa do facada",
    "umbrella",
    "turquia",
    "velkov",
    "verdes",
    "vidigal",
    "virtude",
    "visionarios",
    "warlox",
    "israel",
    "antares",
    "familia playboy",
    "playboy",
    "nevoa.gg",
    "nevoa",
    "familia novaera"
  ];
  const ORG_CITY_OVERRIDES = {
    [normalizeStaticKey("trindade")]: "grande",

    [normalizeStaticKey("vidigal")]: "nobre",
    [normalizeStaticKey("morro do sacola")]: "nobre",
    [normalizeStaticKey("big")]: "nobre",
    [normalizeStaticKey("espanha")]: "nobre",
    [normalizeStaticKey("familia espanha")]: "nobre",
    [normalizeStaticKey("dixavas")]: "nobre",
    [normalizeStaticKey("akuma")]: "nobre",
    [normalizeStaticKey("real trem")]: "nobre",
    [normalizeStaticKey("drift king")]: "nobre",
    [normalizeStaticKey("medellin")]: "nobre",
    [normalizeStaticKey("tropa do caos")]: "nobre"
  };

  const PLAYER_CITY_OVERRIDES = {
    "138153": "nobre", // Amado
    "6641": "nobre",   // pablo dybeck
    "2593": "nobre",   // Miri
    "125": "nobre",    // RJ7 White
    "919": "nobre",    // Miau
    "96353": "nobre",  // Moretti
    "194675": "nobre", // Biel / biellxs
    "140764": "nobre", // Russo
    "83984": "nobre",  // Hz
    "212828": "nobre", // Pacheco
    "1903": "nobre",   // Rayyan
    "1976": "nobre",   // Rafael
    "83601": "nobre",  // Caio
    "71537": "nobre",  // Gael

    "2597": "nobre",   // Lukinhas
    "865": "nobre",    // Biel
    "2410": "nobre",   // Hugo
    "2402": "nobre",   // Revolta
    "7414": "nobre",   // Messias

    "1629": "nobre",   // Gui
    "1848": "nobre",   // Tteuw
    "1647": "nobre",   // Carlos
    "38": "nobre",     // Marcola
    "304": "nobre",    // Wellingtom
    "736": "nobre",    // Rick
    "3033": "nobre",   // Windows 10
    "14995": "nobre",  // Cauazn
    "10544": "nobre",  // HEBERTH
    "2795": "nobre",   // WL
    "9979": "nobre",   // Velber
    "16105": "nobre",  // dry style
    "52": "nobre",     // duda / duda22k
    "1557": "nobre",   // bob macedo

    "799": "nobre",    // Joker / Sarah
    "16634": "nobre",  // Kaique
    "1854": "nobre",   // sheik
    "1087": "nobre",   // Nicolas / PRN / Sheik antigo

    "540": "nobre",    // Royal oficial
    "239": "nobre",    // Royal antigo -> junta no 540
    "756": "nobre",    // Russo
    "175943": "nobre", // Gigi
    "34444": "nobre",  // Japa
    "36168": "nobre",  // Crazy Fps
    "32039": "nobre",  // Tio Venuz

    "4460": "nobre",   // Gago
    "320": "nobre",    // VOVO
    "1974": "nobre",   // Dedo
    "4335": "nobre",   // Ryan
    // "119": "nobre", // REMOVIDO: ID compartilhado/conflitante entre nomes diferentes
    "34": "nobre",     // Barbie
    "5957": "nobre",   // Abaao
    "1171": "nobre",   // matchucaquentao
    "2438": "nobre",   // Screw
    "9170": "nobre",   // miguel
    "16814": "nobre",  // nan
    "6260": "nobre",   // anonima
    "138943": "nobre", // evandri
    "298": "nobre",    // flash
    "2720": "nobre",   // Jota
    "4335": "nobre",   // Joker antigo -> junta no 799
    "578": "nobre",    // Flash antigo/suspeito -> revisão de identidade separada
    "3658": "nobre",   // Barbosa
    "4639": "nobre",   // Haridade
    "236396": "nobre", // luis
    "1397": "nobre",   // Popilo
    "23352": "nobre",  // Lua
    "114792": "nobre", // Pietro Melodia
    "1541": "nobre",   // enrico
    "2486": "nobre",   // Maciel
    "96836": "nobre",  // rafinha
    "1756": "nobre",   // Hitmaker
    "2263": "nobre",   // Scott
    "732": "nobre",    // Gnesis
    "2232": "nobre",   // otavio
    "18855": "nobre",  // player antigo
    "1168": "nobre"    // guxta
  };

const PLAYER_NAME_OVERRIDES = {
  "799": "Joker",
  "4335": "Joker",
  "2720": "Jota",
  "1171": "Matchuca",
  "1629": "Guiguxyz",
  "6641": "Pablo",
  "2593": "Miri",
  "16634": "Kaique",
  "1854": "sheik",
  "540": "Royal",
  "239": "Royal",
  "125": "Royal",
  "34": "Barbie",
  "1756": "Hitmaker"
};

const HALL_FORCE_PLAYER_NAMES = [
  "Wellington",
  "Carlinhos Balada",
  "Menor Quente",
  "Tropadu7",
  "Japa",
  "Crazy Fps",
  "Tio Venuz",
  "hugo",
  "revolta",
  "messias",
  "Russo",
  "Gigi",
  "Jvgoat",
  "Mk yagami",
  "Turtuguita",
  "SEEVEN",
  "MANCHA",
  "luix7",
  "flash",
  "Barbi",
  "Barbie",
  "Gago",
  "VOVO",
  "Dedo",
  "Ryan",
  "Russin",
  "Abaao",
  "matchucaquentao",
  "Screw",
  "miguel",
  "nan",
  "anonima",
  "evandri",
  "Barbosa",
  "Haridade",
  "luis",
  "Popilo",
  "Lua",
  "Pietro Melodia",
  "enrico",
  "Maciel",
  "rafinha",
  "Hitmaker",
  "Scott",
  "Gnesis",
  "otavio",
  "guxta"
];

const HALL_FORCE_IGNORE_PAYMENT_ORG_NAMES = [
  "Morro do Sacola",
  "Morro-do-Sacola",
  "Tropa do 7",
  "Tropa Do 7",
  "Tropadu7",
  "DriftKing",
  "Drift King",
  "Familia NovaEra",
  "NovaEra",
  "Nova Era"
];

function isForcedPlayerName(value = "") {
  const key = normalizeHallKey(value);
  if (!key) return false;

  return HALL_FORCE_PLAYER_NAMES.some(name => normalizeHallKey(name) === key);
}

function isForcedIgnoredPaymentOrgName(value = "") {
  const key = normalizeHallKey(value);
  if (!key) return false;

  return HALL_FORCE_IGNORE_PAYMENT_ORG_NAMES.some(name => normalizeHallKey(name) === key);
}

const PLAYER_ID_NAME_SPLIT_IDS = [
  "119"
];

function isConflictingPlayerId(playerId = "") {
  return PLAYER_ID_NAME_SPLIT_IDS.includes(String(playerId || "").trim());
}

function getPlayerIdentityKey(playerId = "", playerName = "") {
  const id = String(playerId || "").trim();
  const nameKey = normalizeHallKey(playerName || "");

  if (id && isConflictingPlayerId(id)) {
    return nameKey ? `idname:${id}:${nameKey}` : `id:${id}`;
  }

  return id ? `id:${id}` : `name:${nameKey}`;
}

function getManualPlayerCityKeySmart(playerId = "", playerName = "") {
  const id = String(playerId || "").trim();

  if (id && isConflictingPlayerId(id)) {
    return getManualPlayerCityKeyByName(playerName || "");
  }

  return (
    getManualPlayerCityKey(id) ||
    getManualPlayerCityKeyByName(playerName || "")
  );
}

  function getManualPlayerName(playerId = "", fallbackName = "") {
    return PLAYER_NAME_OVERRIDES[String(playerId || "").trim()] || fallbackName;
  }

  function resolvePlayerIdentityOverride(playerId = "", playerName = "") {
    const id = String(playerId || "").trim();
    const name = cleanRankingPlayerName(playerName || "");
    const nameKey = normalizeHallKey(name);

    if (
      id === "1087" &&
      (
        nameKey === normalizeHallKey("sheik") ||
        nameKey === normalizeHallKey("marcola") ||
        nameKey === normalizeHallKey("marcola is king")
      )
    ) {
      return {
        playerId: "1854",
        playerName: "sheik"
      };
    }

    if (
      id === "125" ||
      id === "239" ||
      nameKey === normalizeHallKey("Royal")
    ) {
      return {
        playerId: "540",
        playerName: "Royal"
      };
    }

    if (
      id === "4335" ||
      (
        id === "799" &&
        nameKey === normalizeHallKey("Joker")
      )
    ) {
      return {
        playerId: "799",
        playerName: "Joker"
      };
    }

    return {
      playerId: id,
      playerName: getManualPlayerName(id, name)
    };
  }

  function normalizeExistingPlayerRankingOverrides(rankings) {
    if (!rankings?.players) return rankings;

    const fixedPlayers = {};

    for (const player of Object.values(rankings.players || {})) {
      if (!player) continue;

      const currentPlayerId = String(player.playerId || "").trim();
      const fixedIdentity = resolvePlayerIdentityOverride(currentPlayerId, player.name || "Sem nome");
      const fixedName = fixedIdentity.playerName;
      const fixedPlayerId = fixedIdentity.playerId;

      const fixedCityKey =
        getManualPlayerCityKey(fixedPlayerId) ||
        getManualPlayerCityKeyByName(fixedName) ||
        player.cityKey ||
        "nobre";

      const fixedCityName = CITIES[fixedCityKey]?.label || "Cidade Nobre";
      const fixedKey = getPlayerRankingKey({
        playerName: fixedName,
        playerId: fixedPlayerId,
        cityKey: fixedCityKey
      });

      fixedPlayers[fixedKey] ??= {
        ...player,
        key: fixedKey,
        name: fixedName,
        playerId: fixedPlayerId,
        cityKey: fixedCityKey,
        cityName: fixedCityName,
        total: 0,
        events: {},
        halls: []
      };

      fixedPlayers[fixedKey].name = fixedName;
      fixedPlayers[fixedKey].playerId = fixedPlayerId;
      fixedPlayers[fixedKey].cityKey = fixedCityKey;
      fixedPlayers[fixedKey].cityName = fixedCityName;

      fixedPlayers[fixedKey].halls.push(
        ...(player.halls || []).map(hall => ({
          ...hall,
          cityKey: fixedCityKey,
          cityName: fixedCityName
        }))
      );
    }

    for (const player of Object.values(fixedPlayers)) {
      const uniqueHalls = [];
      const seenHallKeys = new Set();

      for (const hall of player.halls || []) {
        const eventName = normalizeHallEventName(hall.eventName, hall.cityKey || player.cityKey || "nobre");
        const cityKey = hall.cityKey || player.cityKey || "nobre";
        const uniqueKey = `${hall.messageId || hall.jumpUrl || hall.at}:${eventName}:${cityKey}`;

        if (seenHallKeys.has(uniqueKey)) continue;

        seenHallKeys.add(uniqueKey);
        uniqueHalls.push({
          ...hall,
          eventName,
          cityKey,
          cityName: CITIES[cityKey]?.label || player.cityName || "Cidade Nobre"
        });
      }

      player.halls = uniqueHalls;
      player.total = player.halls.length;
      player.events = {};
      for (const hall of player.halls) {
        const eventCityKey = hall.cityKey || player.cityKey || "nobre";
        const eventName = normalizeHallEventName(hall.eventName, eventCityKey);

        player.events[eventName] ??= 0;
        player.events[eventName] += 1;
      }
    }

    rankings.players = fixedPlayers;
    return rankings;
  }

  function normalizeStaticKey(value = "") {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "")
      .trim();
  }

  // Permissões
  const ALLOWED_ROLES = [
    "1352408327983861844", // Resp Creators
    "1262262852949905409", // Resp Influ
    "1352407252216184833", // Resp Lider
    "1388976314253312100", // Coord Creators
    "1282119104576098314", // Mkt Creators
    "1262262852949905408", // Owner
    "1387253972661964840", // Equipe Social Medias
    "1388976094920704141", // Social Medias
    "1388975939161161728", // Gestor Creators
    "1352385500614234134", // Coordenação
    "1352429001188180039", // Equipe Creators
    "1414651836861907006", // Responsáveis
  ];

  const APPROVER_ROLES = [
    "1262262852949905408", // Owner
    "1352408327983861844", // Resp Creators
    "1262262852949905409", // Resp Influ
    "1352407252216184833", // Resp Lider
  ];

  const ALLOWED_USERS = [
    "660311795327828008", // Você
    "1262262852949905408", // Owner
  ];

  const BTN_OPEN_MENU = "hf_open_menu";
  const SEL_CITY = "hf_select_city";
  const MODAL_SUBMIT = "hf_modal_submit";
  const BTN_APPROVE_PREFIX = "hf_approve_";
  const BTN_REJECT_PREFIX = "hf_reject_";
  const BTN_EDIT_LAST = "hf_edit_last";
  const MODAL_EDIT_SUBMIT = "hf_modal_edit_submit";
  const BTN_EDIT_PRIZES = "hf_edit_prizes";
  const MODAL_PRIZES_SUBMIT = "hf_modal_prizes_submit";
  const BTN_EDIT_CITY = "hf_edit_city";
  const MODAL_CITY_SUBMIT = "hf_modal_city_submit";

  const BTN_EDIT_BY_LINK = "hf_edit_by_link";
  const MODAL_EDIT_BY_LINK = "hf_edit_by_link_modal";
  const BTN_EDIT_LINK_TOPS_PREFIX = "hf_edit_link_tops:";
  const BTN_EDIT_LINK_CITY_PREFIX = "hf_edit_link_city:";

  const BTN_SCAN_ALL = "hf_scan_all";
const BTN_HISTORICAL_RECREATE_PREFIX = "hf_hist_recreate:";
const BTN_HISTORICAL_IGNORE_PREFIX = "hf_hist_ignore:";
const BTN_HISTORICAL_EDIT_PREFIX = "hf_hist_edit:";
const MODAL_HISTORICAL_PREFIX = "hf_hist_modal:";
const BTN_REVIEW_AS_ORG_PREFIX = "hf_review_org_";
const BTN_REVIEW_AS_PLAYER_PREFIX = "hf_review_player_";
const BTN_REVIEW_AS_BOTH_PREFIX = "hf_review_both_";
const BTN_REVIEW_CITY_PREFIX = "hf_review_city_";
const BTN_PAYMENT_CITY_PREFIX = "hf_payment_city_";
const BTN_PLAYER_IDENTITY_MERGE_PREFIX = "hf_identity_merge:";
const BTN_PLAYER_IDENTITY_SEPARATE_PREFIX = "hf_identity_separate:";
const BTN_REVIEW_EVENT_PREFIX = "hf_review_event_";
const MODAL_REVIEW_EVENT_SUBMIT = "hf_review_event_modal";
  // ================= PERSISTÊNCIA =================
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const DATA_DIR = path.resolve(__dirname, "../data");
  const STATE_FILE = path.join(DATA_DIR, "halldafama_state.json");
  const HALL_RANKING_FILE = path.join(DATA_DIR, "halldafama_rankings.json");
  const CRONO_FILE = path.join(DATA_DIR, "cronograma_state.json"); // Lê o arquivo do cronograma

  const ensureDir = () => { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); };
  const saveState = (data) => { ensureDir(); fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2)); };
  const loadState = () => { try { if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch {} return { pendingRequests: {} }; };

  const saveHallRankings = (data) => {
    ensureDir();
    fs.writeFileSync(HALL_RANKING_FILE, JSON.stringify(data, null, 2));
  };

  const loadHallRankings = () => {
    try {
      if (fs.existsSync(HALL_RANKING_FILE)) {
        const data = JSON.parse(fs.readFileSync(HALL_RANKING_FILE, "utf8"));

        data.orgs ??= {};
        data.players ??= {};
        data.reviewedMessages ??= {};
        data.reviewedPaymentMessages ??= {};
        data.paymentEventKeys ??= {};
data.pendingPaymentCityReview ??= {};
data.pendingPlayerIdentityReview ??= {};
data.manualPlayerIdentityMerges ??= {};
data.manualPlayerCityOverrides ??= {};
data.manualReviews ??= {};
data.pendingReview ??= {};
data.lastUpdatedAt ??= Date.now();

        return data;
      }
    } catch {}

return {
  orgs: {},
  players: {},
  reviewedMessages: {},
  reviewedPaymentMessages: {},
  paymentEventKeys: {},
  pendingPaymentCityReview: {},
  pendingPlayerIdentityReview: {},
  manualPlayerIdentityMerges: {},
  manualPlayerCityOverrides: {},
  pendingReview: {},
  manualReviews: {},
  lastUpdatedAt: Date.now()
};
  };

  async function sendAuditHallLog(client, member, data, msg) {
    const ch = await client.channels.fetch(HALL_AUDIT_LOG_CH_ID).catch(() => null);
    if (!ch || !ch.isTextBased()) return;

    const now = Date.now();
    const embed = new EmbedBuilder()
      .setTitle("⭐ Log: Hall da Fama Publicado")
      .setColor("Gold")
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: "👤 Aprovador", value: `${member} (\`${member.id}\`)`, inline: true },
        { name: "🔗 Perfil", value: `Clique aqui`, inline: true },
        { name: "📍 Mensagem", value: `Ir para mensagem`, inline: true },
        { name: "🏁 Evento", value: `\`${data.eventName}\``, inline: true },
        { name: "🌆 Cidade", value: `\`${data.cityDisplayName}\``, inline: true },
        { name: "🕒 Horário", value: `<t:${Math.floor(now / 1000)}:R>`, inline: true },
        { name: "🏆 Vencedores", value: data.winnersText.slice(0, 1000), inline: false },
        { name: "🕒 Enviado em", value: `<t:${Math.floor(now / 1000)}:F>`, inline: false }
      )
      .setFooter({ text: "SantaCreators • Auditoria Hall da Fama" })
      .setTimestamp();

    await ch.send({ content: `${member}`, embeds: [embed] }).catch(() => {});
  }

let state = loadState();

state.pendingRequests ??= {};
state.historicalHallReviews ??= {};
state.historicalHallMigrations ??= {};
state.historicalRankingRebuildPending ??= false;

saveState(state);

const processingApprovals = new Set();
const processingHallModalSubmits = new Set();
let hallScanRunning = false;

async function safeDeferHallInteraction(interaction) {
  if (interaction.deferred || interaction.replied) return true;

  try {
    await interaction.deferReply({ ephemeral: true });
    return true;
  } catch (err) {
    if (err?.code === 10062) {
      console.warn("[HallDaFama] Interação expirada/duplicada ignorada:", {
        customId: interaction.customId,
        user: interaction.user?.id
      });
      return false;
    }

    throw err;
  }
}

function getHallScanKeySP() {
    return new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  }

  function shouldRunHallScanToday() {
    return state?.lastAutoCorrectScanKey !== getHallScanKeySP();
  }

  function markHallScanDoneToday() {
    state.lastAutoCorrectScanKey = getHallScanKeySP();
    saveState(state);
  }

  // ================= LÓGICA INTELIGENTE (CRONOGRAMA) =================

  // Pega o dia da semana em SP (seg, ter, qua...)
  function getTodayKey(sourceType = "schedule") {
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));

    if (sourceType === "madrugada" && now.getHours() < 3) {
      now.setDate(now.getDate() - 1);
    }

    const days = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
    return days[now.getDay()];
  }

  function hasMadrugadaAgora(eventData) {
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const hour = now.getHours();

    if (hour >= 3) return true;

    const timeText = String(eventData?.time || "").toLowerCase();

    return (
      /\b0?1[:h]?00\b/i.test(timeText) ||
      /\b0?0[:h]?00\b/i.test(timeText)
    );
  }

  // Lê o cronograma e retorna os dados de HOJE
  function getTodayEventOptions() {
    try {
      if (!fs.existsSync(CRONO_FILE)) return [];

      const crono = JSON.parse(fs.readFileSync(CRONO_FILE, "utf8"));
      const scheduleKey = getTodayKey("schedule");
      const madrugadaKey = getTodayKey("madrugada");

      const options = [];

      const madru = crono.madrugada?.[madrugadaKey];
      if (madru && madru.active && hasMadrugadaAgora(madru)) {
        options.push({
          ...madru,
          sourceType: "madrugada",
          eventKey: `${madrugadaKey}:madrugada`,
        });
      }

      const normal = crono.schedule?.[scheduleKey];
      if (normal && normal.active) {
        options.push({
          ...normal,
          sourceType: "schedule",
          eventKey: `${scheduleKey}:schedule`,
        });
      }

      return options;
    } catch (e) {
      console.error("[HallDaFama] Erro ao ler cronograma:", e);
      return [];
    }
  }

  function getTodayEventData(preferredEventKey = null) {
    const options = getTodayEventOptions();

    if (preferredEventKey) {
      return options.find((ev) => ev.eventKey === preferredEventKey) || null;
    }

    return options[0] || null;
  }

  // Extrai a premiação do texto do cronograma para uma posição específica (1, 2, 3)
  function extractPrizeForRank(prizesText, rank) {
    if (!prizesText) return "";
    const lines = prizesText.split('\n');
    // Procura linhas que tenham "TOP X" ou "1º" ou apenas comece com o numero
    const regex = new RegExp(`(TOP\\s*${rank}|${rank}º|${rank}\\.|^${rank}\\s)`, 'i');
    
    const line = lines.find(l => regex.test(l));
    if (line) {
      // Remove o prefixo "TOP 1:" para ficar só o prêmio
      return line.replace(regex, '').replace(/^[:\-\s]+/, '').trim();
    }
    return "";
  }
  function getTodayPostKey() {
    return new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  }

  function getPostedEventKeys(scope = "hallDaFama") {
    const key = getTodayPostKey();
    state.postedEventKeys ??= {};
    state.postedEventKeys[scope] ??= {};
    state.postedEventKeys[scope][key] ??= [];
    return state.postedEventKeys[scope][key];
  }

  function getNextTodayEventData(scope = "hallDaFama") {
    const options = getTodayEventOptions();
    const posted = getPostedEventKeys(scope);

    return options.find((ev) => !posted.includes(ev.eventKey)) || options[options.length - 1] || null;
  }

  function markTodayEventPosted(eventKey, scope = "hallDaFama") {
    if (!eventKey) return;

    const posted = getPostedEventKeys(scope);

    if (!posted.includes(eventKey)) {
      posted.push(eventKey);
      saveState(state);
    }
  }
  // ================= TEMPLATES DE TEXTO (VARIAÇÃO) =================
  const INTRO_TEMPLATES = [
    "A disputa foi pesada e só os brabos ficaram de pé. Confira os vencedores:",
    "Mais um evento finalizado com sucesso! Hoje quem brilhou foram eles:",
    "Teve estratégia, coragem e muita pressão. Esses foram os grandes campeões:",
    "O evento foi insano do começo ao fim, e esses nomes dominaram a disputa:",
    "Eles chegaram focados, jogaram muito e garantiram o topo do Hall da Fama:",
    "A SantaCreators presenciou mais uma disputa absurda. Confira quem levou a melhor:",
    "Hoje foi dia de mostrar habilidade, frieza e raça. Parabéns aos vencedores:",
    "Mais uma batalha concluída, e esses brabos cravaram seus nomes na história:",
    "O evento pegou fogo, mas eles mantiveram o controle e saíram campeões:",
    "No fim, só quem teve sangue frio ficou no topo. Confira os destaques:"
  ];

  function getRandomIntro() {
    return INTRO_TEMPLATES[Math.floor(Math.random() * INTRO_TEMPLATES.length)];
  }

  // Função para dividir texto longo em partes de 2000 caracteres
  function splitText(text, maxLength = 2000) {
    if (text.length <= maxLength) return [text];
    const chunks = [];
    let currentChunk = "";
    const lines = text.split("\n");
    for (const line of lines) {
      if (currentChunk.length + line.length + 1 <= maxLength) {
        currentChunk += (currentChunk ? "\n" : "") + line;
      } else {
        if (currentChunk) chunks.push(currentChunk);
        currentChunk = line;
        while (currentChunk.length > maxLength) {
            chunks.push(currentChunk.slice(0, maxLength));
            currentChunk = currentChunk.slice(maxLength);
        }
      }
    }
    if (currentChunk) chunks.push(currentChunk);
    return chunks;
  }

  function cleanOneLine(value = "") {
    return String(value).replace(/\s+/g, " ").trim();
  }

  function isBadHallIntro(value = "") {
    const text = cleanOneLine(value);

    if (!text) return true;
    if (text.length < 25) return true;
    if (text.length > 160) return true;
    if (text.startsWith("http")) return true;
    if (text.includes("**TOP**")) return true;
    if (text.includes("HALL DA FAMA")) return true;
    if (/^é\s+com$/i.test(text)) return true;
    if (/^é\s+com\s*$/i.test(text)) return true;
    if ((text.match(/Confira os vencedores/gi) || []).length > 1) return true;
    if ((text.match(/Hall da Fama/gi) || []).length > 1) return true;

    return false;
  }

  function extractHallParts(content = "") {
    const rawContent = String(content || "");
    const lines = rawContent.split("\n").map(l => l.trim()).filter(Boolean);

const imageUrls = getImageUrlsFromContent(rawContent);
const imageUrl = imageUrls[0] || "";

    const contentWithoutUrls = rawContent
      .replace(/https?:\/\/\S+/gi, "")
      .replace(/\|\|@everyone[\s\S]*?\|\|/gi, "")
      .replace(/@everyone|@here/gi, "")
      .trim();

    const eventName =
      contentWithoutUrls.match(/Santa Creators\s*:\s*(.*?)\*\*/i)?.[1]?.trim() ||
      contentWithoutUrls.match(/Santa Creators\s*:\s*(.*?)\s*🎉/i)?.[1]?.trim() ||
      "Evento";

    const cityName =
      rawContent.match(/na\s+\*\*(Cidade\s+(?:Nobre|Santa|Grande|Maresia))\*\*!/i)?.[1]?.trim() ||
      rawContent.match(/na\s+\*\*CIDADE\s+(NOBRE|SANTA|GRANDE|MARESIA)\*\*!/i)?.[1]?.replace(/^/, "Cidade ").trim() ||
      rawContent.match(/na\s+(Cidade\s+(?:Nobre|Santa|Grande|Maresia))!/i)?.[1]?.trim() ||
      rawContent.match(/CIDADE\s+(NOBRE|SANTA|GRANDE|MARESIA)/i)?.[1]?.replace(/^/, "Cidade ").trim() ||
      "Cidade";

    let introText =
      rawContent.match(/\n\n([\s\S]*?)\n\n🏆\s+\*\*/i)?.[1]?.trim() ||
      contentWithoutUrls.match(/🎉\s*(.*?)\s+\*\*[^*]+\*\*\s+na\s+\*\*Cidade\s+(?:Nobre|Santa|Grande|Maresia)\*\*!/i)?.[1]?.trim() ||
      contentWithoutUrls.match(/🎉\s*(.*?)\s+[A-ZÀ-Ú0-9\s]+na\s+CIDADE\s+(?:NOBRE|SANTA|GRANDE|MARESIA)!/i)?.[1]?.trim() ||
      "";

    introText = cleanOneLine(
      introText
        .replace(/^:\s*/, "")
        .replace(/\*\*/g, "")
        .replace(/Santa Creators\s*:\s*.*?🎉/i, "")
        .replace(/<:coroa_orange:\d+>/g, "")
        .replace(/:coroa_orange:/g, "")
    );
    if (isBadHallIntro(introText)) {
      introText = getRandomIntro();
    }

    let winnersText = "";

    const hallIndex = lines.findIndex(l => l.includes("HALL DA FAMA"));
    const endIndex = lines.findIndex(l => l.includes("Foi insano, mas mais uma vez"));
    if (hallIndex !== -1 && endIndex !== -1 && endIndex > hallIndex) {
      winnersText = lines
        .slice(hallIndex + 1, endIndex)
        .filter(l => l.includes("**TOP**") || l.toUpperCase().startsWith("TOP"))
        .join("\n")
        .trim();
    }

    if (!winnersText) {
      const topMatches = [...contentWithoutUrls.matchAll(/\*\*TOP\*\*[\s\S]*?(?=\*\*TOP\*\*|\*\*Foi insano|Foi insano|$)/g)];

      winnersText = topMatches
        .map(m => cleanOneLine(m[0]))
        .filter(Boolean)
        .join("\n");
    }

    if (!winnersText || winnersText.includes("Santa Creators :")) {
      winnersText = "";
    }

return {
  eventName: cleanOneLine(eventName) || "Evento",
  cityName: cleanOneLine(cityName) || "Cidade",
  introText: cleanOneLine(introText) || getRandomIntro(),
  winnersText,
  imageUrl,
  imageUrls
};
  }

  function countHallTopLines(content = "") {
    const text =
      String(
        content || ""
      );

    const topNumbers =
      [
        ...text.matchAll(
          /(?:^|\n)\s*(?:\*\*)?TOP(?:\*\*)?\s*[:\-]?\s*(?:<a?:[^:>\s]+:\d+>|:[a-zA-Z0-9_~]+:)?\s*(\d+)/gi
        )
      ]
        .map(match =>
          Number(
            match[1]
          )
        )
        .filter(number =>
          Number.isInteger(number) &&
          number >= 1 &&
          number <= 4
        );

    if (topNumbers.length > 0) {
      return new Set(
        topNumbers
      ).size;
    }

    const genericTopLines =
      text
        .split("\n")
        .filter(line =>
          /^\s*(?:\*\*)?TOP(?:\*\*)?\b/i.test(
            line
          )
        );

    return genericTopLines.length;
  }

  function buildHallIntroLine(
    intro,
    eventName,
    cityName
  ) {
    return (
      `${cleanOneLine(intro)}\n\n` +
      `🏆 **${cleanOneLine(eventName).toUpperCase()}** ` +
      `na **${cleanOneLine(cityName).toUpperCase()}**! ` +
      `<:coroa_orange:1353939359144870019>`
    );
  }

  function getHistoricalHallBlock(
    content = "",
    hallMessageId = ""
  ) {
    const lines =
      String(content || "")
        .split("\n")
        .map(line => line.trim())
        .filter(Boolean);

    const existingDateLine =
      lines.find(line =>
        (
          line.includes("📅") &&
          (
            /data original do evento/i.test(line) ||
            /vitória histórica de/i.test(line) ||
            /vitoria historica de/i.test(line)
          )
        )
      ) || "";

    const existingRecreatedLine =
      lines.find(line =>
        (
          line.includes("🕰️") &&
          /hall.*recriado/i.test(line)
        )
      ) || "";

    if (existingDateLine) {
      return [
        existingDateLine,

        existingRecreatedLine ||
        "🕰️ **Hall antigo recriado no formato atual**"
      ]
        .filter(Boolean)
        .join("\n");
    }

    if (!hallMessageId) {
      return "";
    }

    const migration =
      Object.values(
        state.historicalHallMigrations ||
        {}
      ).find(item => {
        return (
          String(
            item?.newMessageId ||
            ""
          ) ===
          String(
            hallMessageId
          )
        );
      });

    if (!migration) {
      return "";
    }

    const victoryTimestamp =
      Number(
        migration.victoryTimestamp ||
        0
      );

    if (!victoryTimestamp) {
      return (
        "📅 **Data original do evento:** não identificada\n" +
        "🕰️ **Hall antigo recriado no formato atual**"
      );
    }

    return (
      `📅 **Data original do evento:** ` +
      `<t:${Math.floor(
        victoryTimestamp /
        1000
      )}:D>\n` +
      `🕰️ **Hall antigo recriado no formato atual**`
    );
  }

  function fixDuplicatedHallContent(
    content = "",
    attachmentUrls = [],
    hallMessageId = ""
  ) {
    if (!content.includes("Santa Creators :") || !content.includes("HALL DA FAMA")) return content;

    const parts = extractHallParts(content);
    if (!parts.winnersText) return content;

    const lines = content.split("\n");
    const mentionsLine = lines.find(l => l.includes("@everyone")) || "";

    const imageLinesFromContent = getImageUrlsFromContent(content);
    const imageLines = uniqueImageUrls([
      ...imageLinesFromContent,
      ...attachmentUrls
    ]);

    const safeIntro =
      isBadHallIntro(
        parts.introText
      )
        ? getRandomIntro()
        : parts.introText;

    const introLine =
      buildHallIntroLine(
        safeIntro,
        parts.eventName,
        parts.cityName
      );

    const historicalHallBlock =
      getHistoricalHallBlock(
        content,
        hallMessageId
      );

    const fixedMessage =
  `# 🎉 :  **Santa Creators : ${parts.eventName}** 🎉 

  ${introLine}

  👏  Uma salva de palmas para os BRABOS! 👏 

  <:12633559939374122111:1368796471297576970>  **HALL DA FAMA** <:12633559939374122111:1368796471297576970> 

  ${historicalHallBlock
    ? `${historicalHallBlock}\n`
    : ""}

  ${parts.winnersText.trim()}

  **Foi insano, mas mais uma vez os vencedores mostraram que a vitória só é possível com raça! <:__:1357520048318709840>**

  ${mentionsLine}

  ${imageLines.join("\n")}`;

    return fixedMessage.trim();
  }

  function resolveCityKeyFromModalInput(value = "") {
  const normalized = cleanOneLine(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  if (!normalized) return null;

  return Object.keys(CITIES).find((key) => {
    const cityLabel = CITIES[key].label
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    return (
      normalized === key ||
      normalized === cityLabel ||
      normalized.includes(key) ||
      cityLabel.includes(normalized) ||
      normalized.includes(cityLabel)
    );
  }) || null;
}

function resolveCityKeyFromName(value = "") {
    const normalized = cleanOneLine(value)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    return Object.keys(CITIES).find((key) => {
      const cityLabel = CITIES[key].label
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

      return (
        normalized === key ||
        normalized.includes(key) ||
        cityLabel.includes(normalized) ||
        normalized.includes(cityLabel)
      );
    }) || null;
  }

  function updateHallCityOnly(content = "", newCityName = "", attachmentUrls = []) {
    const cleanedContent = fixDuplicatedHallContent(content, attachmentUrls);
    const parts = extractHallParts(cleanedContent);

    if (!parts.winnersText) return cleanedContent;

    const cityKey = resolveCityKeyFromName(newCityName);
    const cityData = cityKey ? CITIES[cityKey] : null;
    const finalCityName = cityData?.label || cleanOneLine(newCityName) || parts.cityName;

    const mentionsLine = cityData
      ? `||@everyone @here <@&${ROLE_CIDADAO}> <@&${ROLE_LIDERES}> <@&${cityData.roleId}>||`
      : cleanedContent.split("\n").find(l => l.includes("@everyone")) || "";

    const imageLinesFromContent = getImageUrlsFromContent(cleanedContent);
    const imageLines = uniqueImageUrls([
      ...imageLinesFromContent,
      ...attachmentUrls
    ]);

    const safeIntro =
      isBadHallIntro(
        parts.introText
      )
        ? getRandomIntro()
        : parts.introText;

    const introLine =
      buildHallIntroLine(
        safeIntro,
        parts.eventName,
        finalCityName
      );

    const historicalHallBlock =
      getHistoricalHallBlock(
        cleanedContent
      );

    const fixedMessage =
  `# 🎉 :  **Santa Creators : ${parts.eventName}** 🎉 

  ${introLine}

  👏  Uma salva de palmas para os BRABOS! 👏 

  <:12633559939374122111:1368796471297576970>  **HALL DA FAMA** <:12633559939374122111:1368796471297576970> 

  ${historicalHallBlock
    ? `${historicalHallBlock}\n`
    : ""}

  ${parts.winnersText.trim()}

  **Foi insano, mas mais uma vez os vencedores mostraram que a vitória só é possível com raça! <:__:1357520048318709840>**

  ${mentionsLine}

  ${imageLines.join("\n")}`;

    return fixedMessage.trim();
  }

  function fixHallCityMentionByDetectedCity(content = "", attachmentUrls = []) {
    const cityKey = detectHallCityKey(content);
    const cityData = CITIES[cityKey] || CITIES.nobre;
    const cityName = cityData.label;

    let fixed = updateHallCityOnly(content, cityName, attachmentUrls);

    const correctMentions = `||@everyone @here <@&${ROLE_CIDADAO}> <@&${ROLE_LIDERES}> <@&${cityData.roleId}>||`;

    const mentionRegex = /\|\|@everyone[\s\S]*?\|\|/i;

    if (mentionRegex.test(fixed)) {
      fixed = fixed.replace(mentionRegex, correctMentions);
    } else if (/@everyone|@here|<@&\d+>/i.test(fixed)) {
      fixed = fixed.replace(/@everyone[\s\S]*?(?=\nhttps?:\/\/|\n*$)/i, correctMentions);
    } else {
      fixed = `${fixed.trim()}\n\n${correctMentions}`;
    }

    return fixed.trim();
  }

  function normalizeHallName(value = "") {
    return cleanOneLine(value)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function normalizeHallKey(value = "") {
    return cleanOneLine(value)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "")
      .trim();
  }

  const ORG_NAME_ALIASES = {
    [normalizeHallKey("tropa do 7")]: "Tropa do 7",
    [normalizeHallKey("TROPA DO 7")]: "Tropa do 7",
    [normalizeHallKey("tropa7")]: "Tropa do 7",
    [normalizeHallKey("tropa do sete")]: "Tropa do 7",

    [normalizeHallKey("tropadu7")]: "Tropadu7",
    [normalizeHallKey("tropa du 7")]: "Tropadu7",

    [normalizeHallKey("cpx")]: "CPX",
    [normalizeHallKey("complexo do odio")]: "CPX",
    [normalizeHallKey("complexo do ódio")]: "CPX",
    [normalizeHallKey("complexo-do-odio")]: "CPX",
    [normalizeHallKey("complexodoódio")]: "CPX",
    [normalizeHallKey("complexodoodio")]: "CPX",

    [normalizeHallKey("familia espanha")]: "Espanha",
    [normalizeHallKey("família espanha")]: "Espanha",
    [normalizeHallKey("espanha")]: "Espanha",

    [normalizeHallKey("familia red")]: "Familia Red",
    [normalizeHallKey("família red")]: "Familia Red",
    [normalizeHallKey("red")]: "Familia Red",

    [normalizeHallKey("morro do sacola")]: "Morro do Sacola",
    [normalizeHallKey("morrodosacola")]: "Morro do Sacola",
    [normalizeHallKey("prn")]: "PRN",
    [normalizeHallKey("sintonia")]: "Sintonia",
    [normalizeHallKey("tokyo")]: "Tokyo",
    [normalizeHallKey("toquio")]: "Tokyo",
    [normalizeHallKey("tóquio")]: "Tokyo",

    [normalizeHallKey("tropado7")]: "Tropa do 7",
    [normalizeHallKey("tropa do sete")]: "Tropa do 7",

    [normalizeHallKey("egito")]: "Egito",
    [normalizeHallKey("banzas")]: "Banzas",
    [normalizeHallKey("israel")]: "Israel",
    [normalizeHallKey("antares")]: "Antares",

    [normalizeHallKey("familia playboy")]: "Playboy",
    [normalizeHallKey("família playboy")]: "Playboy",
    [normalizeHallKey("playboy")]: "Playboy",

    [normalizeHallKey("nevoa.gg")]: "Nevoa.gg",
    [normalizeHallKey("nevoagg")]: "Nevoa.gg",
    [normalizeHallKey("nevoa")]: "Nevoa.gg",

    [normalizeHallKey("familia novaera")]: "Familia NovaEra",
    [normalizeHallKey("família novaera")]: "Familia NovaEra",
    [normalizeHallKey("novaera")]: "Familia NovaEra",
    [normalizeHallKey("nova era")]: "Familia NovaEra",

    [normalizeHallKey("driftking")]: "Drift King",
    [normalizeHallKey("drift king")]: "Drift King",

    [normalizeHallKey("visionario")]: "Visionarios",
    [normalizeHallKey("visionário")]: "Visionarios",
    [normalizeHallKey("visionarios")]: "Visionarios",
    [normalizeHallKey("visionários")]: "Visionarios",

    [normalizeHallKey("mete gala")]: "Metgala",
    [normalizeHallKey("metegala")]: "Metgala",
    [normalizeHallKey("metgala")]: "Metgala",
    [normalizeHallKey("meta gala")]: "Metgala",

    [normalizeHallKey("paquistao")]: "Paquistão",

    [normalizeHallKey("groov")]: "Groove",
    [normalizeHallKey("grove")]: "Groove",
    [normalizeHallKey("groove")]: "Groove",

    [normalizeHallKey("legiao belica")]: "Legião Bélica",
    [normalizeHallKey("legião bélica")]: "Legião Bélica",
    [normalizeHallKey("maldivas")]: "Maldivas"
  };

  function normalizeOrgDisplayName(orgName = "") {
    const clean = removeHallGGWinnerMarker(
      normalizeHallDisplay(orgName)
    );

    const alias = ORG_NAME_ALIASES[normalizeHallKey(clean)];

    return alias || clean;
  }

  function isKnownOrgName(value = "") {
    const key = normalizeHallKey(value);
    if (!key) return false;

    if (ORG_NAME_ALIASES[key]) return true;

    return KNOWN_ORG_NAMES.some(orgName => {
      const orgKey = normalizeHallKey(orgName);
      if (!orgKey) return false;

      return key === orgKey || key.includes(orgKey) || orgKey.includes(key);
    });
  }

  function isExactKnownOrgName(value = "") {
    const key = normalizeHallKey(value);
    if (!key) return false;

    if (ORG_NAME_ALIASES[key]) return true;

    return KNOWN_ORG_NAMES.some(orgName => normalizeHallKey(orgName) === key);
  }

  function extractExplicitOrgNameFromWinnerLine(cleanLine = "", originalLine = "") {
    const rawMarkerText = stripDiscordNoise(originalLine);
    const hasOrgMarker =
      hasHallGGWinnerMarker(originalLine) ||
      /^Organiza[cç][aã]o\s*[:\-]/i.test(rawMarkerText) ||
      /^Vencedores?\b/i.test(rawMarkerText);

    const beforePrize = normalizeHallDisplay(String(cleanLine || "").split("|")[0] || "")
      .replace(/\b\d+\s*(vip|vips|rolepass|pass|ve[ií]culo|ve[ií]culos|blindado|blindados|kk|k|milh[oõ]es|milh[aã]o)\b[\s\S]*$/i, "")
      .replace(/\b(vip|vips|rolepass|pass|ve[ií]culo|ve[ií]culos|blindado|blindados|kk|k|milh[oõ]es|milh[aã]o)\b[\s\S]*$/i, "")
      .trim();

    const orgName = normalizeOrgDisplayName(beforePrize);

    if (!orgName) return "";
    if (looksLikePrizeOnly(orgName)) return "";
    if (isInvalidWinnerName(orgName)) return "";

    if (hasOrgMarker) return orgName;
    if (isExactKnownOrgName(orgName)) return orgName;

    return "";
  }
  function findKnownOrgInsideWinnerName(value = "") {
    const clean = normalizeHallDisplay(value);
    const key = normalizeHallKey(clean);
    if (!key) return "";

    const exactAlias = ORG_NAME_ALIASES[key];
    if (exactAlias) return exactAlias;

    const exactOrg = KNOWN_ORG_NAMES.find(orgName => normalizeHallKey(orgName) === key);
    if (exactOrg) return normalizeOrgDisplayName(exactOrg);

    const parts = clean
      .split(/\s*[-–—_]\s*|\s*\(\s*|\s*\)\s*|\s*\|\s*|\s*«\s*|\s*»\s*/g)
      .map(part => normalizeHallDisplay(part))
      .filter(Boolean);

    const foundPart = parts
      .map(part => {
        const partKey = normalizeHallKey(part);
        const alias = ORG_NAME_ALIASES[partKey];
        if (alias) return alias;

        const exact = KNOWN_ORG_NAMES.find(orgName => normalizeHallKey(orgName) === partKey);
        return exact ? normalizeOrgDisplayName(exact) : "";
      })
      .find(Boolean);

    if (foundPart) return foundPart;

    const foundOrg = KNOWN_ORG_NAMES
      .map(orgName => ({
        raw: orgName,
        key: normalizeHallKey(orgName)
      }))
      .filter(item => item.key && item.key.length >= 5)
      .filter(item => key.includes(item.key))
      .sort((a, b) => b.key.length - a.key.length)
      .at(0);

    return foundOrg ? normalizeOrgDisplayName(foundOrg.raw) : "";
  }

function extractPlayerOrgByKnownOrgName(value = "") {
    const clean = normalizeHallDisplay(value);
    const orgName = findKnownOrgInsideWinnerName(clean);
    if (!orgName) return null;

    const cleanKey = normalizeHallKey(clean);
    const orgKey = normalizeHallKey(orgName);

    if (cleanKey === orgKey) return null;

    const parts = clean
      .split(/\s*[-–—_]\s*|\s*\(\s*|\s*\)\s*|\s*\|\s*|\s*«\s*|\s*»\s*/g)
      .map(part => normalizeHallDisplay(part))
      .filter(Boolean);

    let playerPart = parts.find(part => {
      const partKey = normalizeHallKey(part);
      if (!partKey) return false;
      if (partKey === orgKey) return false;
      if (ORG_NAME_ALIASES[partKey]) return false;
      if (isKnownOrgName(part)) return false;
      if (looksLikePrizeOnly(part)) return false;
      if (isInvalidWinnerName(part)) return false;
      return true;
    });

    if (!playerPart && cleanKey.includes(orgKey)) {
      playerPart = clean
        .replace(new RegExp(`\\b${orgName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"), "")
        .replace(/\s+/g, " ")
        .trim();
    }

    const playerName = normalizeHallDisplay(playerPart || "");

    if (!playerName) return null;
    if (looksLikePrizeOnly(playerName)) return null;
    if (isInvalidWinnerName(playerName)) return null;
    if (isKnownOrgName(playerName)) return null;

    return {
      playerName,
      orgName
    };
  }

  function getManualOrgCityKey(orgName = "") {
    const key = normalizeHallKey(orgName);
    if (!key) return null;

    const direct = ORG_CITY_OVERRIDES[key];
    if (direct) return direct;

    const found = Object.entries(ORG_CITY_OVERRIDES).find(([orgKey]) => {
      return key === orgKey || key.includes(orgKey) || orgKey.includes(key);
    });

    return found?.[1] || null;
  }

  function getHistoricalOrgCityKey(orgName = "") {
    const key = normalizeHallKey(orgName);
    if (!key) return null;

    const rankings = loadHallRankings();
    const counts = {};

    for (const org of Object.values(rankings.orgs || {})) {
      const orgKey = normalizeHallKey(org.name || "");

      if (!orgKey) continue;
      if (!(key === orgKey || key.includes(orgKey) || orgKey.includes(key))) continue;

      const cityKey = org.cityKey || resolveCityKeyFromName(org.cityName || "");
      if (!cityKey) continue;

      counts[cityKey] ??= 0;
      counts[cityKey] += Number(org.total || 0);
    }

    const winner = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .at(0);

    if (!winner || winner[1] < 2) return null;

    return winner[0];
  }

  function getManualPlayerCityKey(playerId = "") {
    return PLAYER_CITY_OVERRIDES[String(playerId || "").trim()] || null;
  }

  function getManualPlayerCityKeyByName(playerName = "") {
    const key = normalizeHallKey(playerName);

    const nameOverrides = {
      [normalizeHallKey("Miau")]: "nobre",
      [normalizeHallKey("Moretti")]: "nobre",
      [normalizeHallKey("Royal")]: "nobre",
      [normalizeHallKey("Amado")]: "nobre",
      [normalizeHallKey("RJ7 White")]: "nobre",
      [normalizeHallKey("pablo dybeck")]: "nobre",
      [normalizeHallKey("Sarah")]: "nobre",
      [normalizeHallKey("Joker")]: "nobre",
      [normalizeHallKey("Kaique")]: "nobre",
      [normalizeHallKey("sheik")]: "nobre",
      [normalizeHallKey("Guiguxyz")]: "nobre",
      [normalizeHallKey("Pablo")]: "nobre",
      [normalizeHallKey("Victor Getas")]: "nobre",
      [normalizeHallKey("Victor")]: "nobre",
      [normalizeHallKey("Russin")]: "grande"
    };

    return nameOverrides[key] || null;
  }

function getStoredManualPlayerCityKey(rankings, playerId = "", playerName = "") {
  const id = String(playerId || "").trim();
  const nameKey = normalizeHallKey(playerName || "");

  rankings.manualPlayerCityOverrides ??= {};

  return (
    (id ? rankings.manualPlayerCityOverrides[`id:${id}`]?.cityKey : null) ||
    (nameKey ? rankings.manualPlayerCityOverrides[`name:${nameKey}`]?.cityKey : null) ||
    null
  );
}

function findRankingPlayerByIdentity(rankings, playerId = "", playerName = "") {
  const id = String(playerId || "").trim();
  const nameKey = normalizeHallKey(playerName || "");

  return Object.values(rankings.players || {}).find(player => {
    const sameId = id && String(player.playerId || "").trim() === id;
    const sameName = !id && nameKey && normalizeHallKey(player.name || "") === nameKey;

    return sameId || sameName;
  }) || null;
}

function applyCityToRankingPlayer(player, cityKey) {
  if (!player || !CITIES[cityKey]) return;

  player.cityKey = cityKey;
  player.cityName = CITIES[cityKey].label;

  player.halls = (player.halls || []).map(hall => ({
    ...hall,
    cityKey,
    cityName: CITIES[cityKey].label,
    eventName: normalizeHallEventName(hall.eventName, cityKey)
  }));

  player.events = {};

  for (const hall of player.halls || []) {
    const eventName = normalizeHallEventName(hall.eventName, cityKey);
    player.events[eventName] ??= 0;
    player.events[eventName] += 1;
  }
}

  function getManualReviewCityKey(messageId = "") {
    return state.confirmedCityReviews?.[messageId]?.cityKey || null;
  }

  function getManualReviewCityEvidence(messageId = "", content = "") {
    const cityKey = getManualReviewCityKey(messageId);
    if (!cityKey) return null;

    return {
      cityKey,
      cityName: CITIES[cityKey]?.label || "Cidade",
      eventName: normalizeHallEventName(extractRawHallEventName(content), cityKey),
      source: `cidade_revisada:${messageId}`,
      confidence: 100
    };
  }

  function getPlayerCityEvidenceFromHallContent(content = "") {
    const baseCityKey = detectHallCityKey(content);
    const winners = parseHallWinners(content, baseCityKey);

    const player = winners.find(w => {
      if (w.type !== "player") return false;

      return (
        getManualPlayerCityKey(w.playerId) ||
        getManualPlayerCityKeyByName(w.playerName)
      );
    });

    const cityKey =
      getManualPlayerCityKey(player?.playerId) ||
      getManualPlayerCityKeyByName(player?.playerName);

    if (!cityKey) return null;

    return {
      cityKey,
      cityName: CITIES[cityKey]?.label || "Cidade",
      eventName: normalizeHallEventName(extractRawHallEventName(content), cityKey),
      source: `player_override:${player.playerId || player.playerName}`,
      confidence: 96
    };
  }

  function getOrgCityEvidenceFromHallContent(content = "") {
    const baseCityKey = detectHallCityKey(content);
    const winners = parseHallWinners(content, baseCityKey);
    const deduped = dedupeHallWinners(winners);

    const orgWinner =
      deduped.orgs?.[0] ||
      deduped.players?.find(player => player.orgName);

    const orgName = orgWinner?.orgName || "";
    if (!orgName) return null;

    const manualCityKey = getManualOrgCityKey(orgName);
    if (manualCityKey) {
      return {
        cityKey: manualCityKey,
        cityName: CITIES[manualCityKey]?.label || "Cidade",
        eventName: normalizeHallEventName(extractRawHallEventName(content), manualCityKey),
        source: `org_override:${orgName}`,
        confidence: 84
      };
    }

    const historicalCityKey = getHistoricalOrgCityKey(orgName);
    if (historicalCityKey) {
      return {
        cityKey: historicalCityKey,
        cityName: CITIES[historicalCityKey]?.label || "Cidade",
        eventName: normalizeHallEventName(extractRawHallEventName(content), historicalCityKey),
        source: `org_historico:${orgName}`,
        confidence: 78
      };
    }

    return null;
  }

  function getEventCityEvidenceFromHallContent(content = "") {
    const rawEventName = extractRawHallEventName(content);
    const normalized = normalizeHallName(rawEventName);

    let cityKey = null;

    if (normalized.includes("grande do crime")) cityKey = "grande";
    if (normalized.includes("maresia do crime")) cityKey = "maresia";
    if (normalized.includes("nobre do crime")) cityKey = "nobre";

    // ⚠️ Santa do Crime e Mini Rei do Crime são ambíguos:
    // - Se a cidade final for Nobre, normalizeHallEventName já transforma em Nobre do Crime.
    // - Se for Santa, transforma em Santa do Crime.
    // Então aqui NÃO pode forçar cidade só pelo nome.
    if (normalized.includes("santa do crime")) return null;
    if (normalized.includes("mini rei do crime")) return null;

    if (!cityKey) return null;

    return {
      cityKey,
      cityName: CITIES[cityKey]?.label || "Cidade",
      eventName: normalizeHallEventName(rawEventName, cityKey),
      source: `evento_nome_forte:${rawEventName}`,
      confidence: 99
    };
  }

  function getDirectHallCityEvidence(content = "") {
    const cityKey = detectHallCityKey(content);
    const rawEventName = extractRawHallEventName(content);
    const eventName = normalizeHallEventName(rawEventName, cityKey);

    const normalized = normalizeHallName(content);
    const hasExplicitCity =
      normalized.includes("cidade nobre") ||
      normalized.includes("cidade santa") ||
      normalized.includes("cidade grande") ||
      normalized.includes("cidade maresia") ||
      normalized.includes(" na nobre") ||
      normalized.includes(" na santa") ||
      normalized.includes(" na grande") ||
      normalized.includes(" na maresia");

    if (!cityKey || !hasExplicitCity || eventName === "Evento") return null;

    return {
      cityKey,
      cityName: CITIES[cityKey]?.label || "Cidade",
      eventName,
      source: "hall_evento_e_cidade",
      confidence: 97
    };
  }

  function normalizeHallDisplay(value = "") {
    return cleanOneLine(value)
      .replace(/\*/g, "")
      .replace(/[«»]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function stripDiscordNoise(value = "") {
    return String(value || "")
      .replace(/<a?:[^:>\s]+:\d+>/g, " ")
      .replace(/:[a-zA-Z0-9_~]+:/g, " ")
      .replace(/<@&\d+>/g, " ")
      .replace(/<@!?\d+>/g, " ")
      .replace(/@everyone|@here/gi, " ")
      .replace(/\|\|/g, " ")
      .replace(/\*\*/g, " ")
      .replace(/https?:\/\/\S+/gi, " ")
      .replace(/[🏆👑🎉👏⚠️✅❌⭐🌆📊📌🧹🔄✨🥇🥈🥉🏅🎮🧠📥🤖✏️📅]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function detectHallCityKey(content = "") {
    const raw = String(content || "");
    const cleaned = stripDiscordNoise(raw);
    const normalized = normalizeHallName(cleaned);

    // ✅ PRIORIDADE 1: cidade escrita no Hall.
    // Se o texto diz "na CIDADE GRANDE", isso vale mais que cargo mencionado errado.
    if (/\bcidade\s+nobre\b/.test(normalized)) return "nobre";
    if (/\bcidade\s+santa\b/.test(normalized)) return "santa";
    if (/\bcidade\s+grande\b/.test(normalized)) return "grande";
    if (/\bcidade\s+maresia\b/.test(normalized)) return "maresia";

    if (/\bna\s+nobre\b|\bdo\s+nobre\b|\bnobre\s+do\s+crime\b/.test(normalized)) return "nobre";
    if (/\bna\s+santa\b|\bda\s+santa\b|\bsanta\s+do\s+crime\b/.test(normalized)) return "santa";
    if (/\bna\s+grande\b|\bda\s+grande\b|\bgrande\s+do\s+crime\b/.test(normalized)) return "grande";
    if (/\bna\s+maresia\b|\bda\s+maresia\b|\bmaresia\s+do\s+crime\b/.test(normalized)) return "maresia";

    // ✅ PRIORIDADE 2: cargo mencionado.
    // Só usa cargo se não achou cidade escrita no Hall.
    const roleCity = Object.entries(CITIES).find(([, data]) => raw.includes(data.roleId));
    if (roleCity) return roleCity[0];

    return "nobre";
  }

  function detectHallCityName(content = "") {
    const cityKey = detectHallCityKey(content);
    return CITIES[cityKey]?.label || "Cidade Nobre";
  }

  function getSPDateFromTimestamp(timestamp = Date.now()) {
    return new Date(new Date(timestamp).toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  }

  function getDayKeyFromSPDate(date) {
    const days = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
    return days[date.getDay()];
  }

  function normalizeCityText(value = "") {
    return normalizeHallName(value);
  }

  function resolveCityKeyFromAnyText(value = "") {
    const normalized = normalizeCityText(value);

    if (/\bnobre\b/.test(normalized)) return "nobre";
    if (/\bsanta\b/.test(normalized)) return "santa";
    if (/\bgrande\b/.test(normalized)) return "grande";
    if (/\bmaresia\b/.test(normalized)) return "maresia";

    return null;
  }

  function parseCronoTimes(timeText = "") {
    const text = String(timeText || "").toLowerCase();
    const matches = [...text.matchAll(/\b([0-2]?\d)[:h]([0-5]\d)?\b/g)];

    return matches
      .map(match => {
        const hour = Number(match[1]);
        const minute = Number(match[2] || 0);

        if (Number.isNaN(hour) || hour > 23) return null;

        return { hour, minute };
      })
      .filter(Boolean);
  }

  function buildSlotDate(baseDate, hour, minute) {
    const d = new Date(baseDate);
    d.setHours(hour, minute, 0, 0);
    return d;
  }

  function getCronoSlotForHallTimestamp(createdTimestamp = Date.now(), requiredEventName = "Evento") {
    try {
      if (!fs.existsSync(CRONO_FILE)) return null;

      const crono = JSON.parse(fs.readFileSync(CRONO_FILE, "utf8"));
      const hallDate = getSPDateFromTimestamp(createdTimestamp);

      const candidates = [];

      for (let dayOffset = -1; dayOffset <= 0; dayOffset++) {
        const baseDate = new Date(hallDate);
        baseDate.setDate(baseDate.getDate() + dayOffset);

        const dayKey = getDayKeyFromSPDate(baseDate);

        for (const sourceType of ["schedule", "madrugada"]) {
          const slot = crono?.[sourceType]?.[dayKey];
          if (!slot?.active) continue;

          const cityKey = resolveCityKeyFromAnyText(slot.city || "");
          if (!cityKey) continue;

          const times = parseCronoTimes(slot.time || "");

          for (const time of times) {
            const slotDate = buildSlotDate(baseDate, time.hour, time.minute);
            const diffMs = hallDate.getTime() - slotDate.getTime();

            // ✅ Não pega evento que ainda nem aconteceu.
            // Ex: Hall 00:40 não pode pegar evento das 21:00 do mesmo dia.
            if (diffMs < -1000 * 60 * 20) continue;

            // ✅ Hall normalmente sai até algumas horas depois do evento.
            if (diffMs > 1000 * 60 * 60 * 8) continue;

            const slotEventName = normalizeHallEventName(slot.eventName || "Evento", cityKey);
            const required = normalizeHallEventName(requiredEventName || "Evento", cityKey);

            if (
              required &&
              required !== "Evento" &&
              (!slotEventName || slotEventName === "Evento" || !isSameNormalizedEventName(slotEventName, required))
            ) {
              continue;
            }

            candidates.push({
              cityKey,
              cityName: CITIES[cityKey]?.label || slot.city,
              eventName: slotEventName,
              source: `cronograma_state:${sourceType}:${dayKey}:${slot.time}`,
              confidence: sourceType === "madrugada" ? 88 : 82,
              diffMs: Math.abs(diffMs)
            });
          }
        }
      }

      const best = candidates.sort((a, b) => a.diffMs - b.diffMs)[0];
      return best || null;
    } catch (e) {
      console.error("[HallDaFama] Erro ao cruzar cronograma_state:", e);
      return null;
    }
  }

  async function findNearbyEvidenceInChannel(client, channelId, hallMessage, options = {}) {
    const ch = await client.channels.fetch(channelId).catch(() => null);
    if (!ch || !ch.isTextBased()) return null;

    const messages = await ch.messages.fetch({ limit: options.limit || 100 }).catch(() => null);
    if (!messages) return null;

    const hallTs = hallMessage.createdTimestamp || Date.now();
    const maxDiffMs = options.maxDiffMs || 1000 * 60 * 60 * 6;
    const requiredEventName = normalizeHallEventName(options.requiredEventName || "");

    const candidates = [...messages.values()]
      .filter(msg => {
        const ts = msg.createdTimestamp || 0;
        if (!ts) return false;
        if (ts > hallTs + 1000 * 60 * 30) return false;
        if (hallTs - ts > maxDiffMs) return false;
        return true;
      })
      .map(msg => {
        const text = getHallMessageText(msg);
        const cityKey = resolveCityKeyFromAnyText(text);
        const rawEventName = extractRawHallEventName(text);
        const eventName = normalizeHallEventName(rawEventName, cityKey || "nobre");

        return {
          msg,
          text,
          cityKey,
          cityName: cityKey ? CITIES[cityKey]?.label : "",
          eventName,
          diff: Math.abs(hallTs - (msg.createdTimestamp || 0))
        };
      })
      .filter(item => {
        if (!item.cityKey && item.eventName === "Evento") return false;

        // ✅ Se estamos procurando evidência para um Hall específico,
        // Eventos Diários/Logs só podem contar se for o MESMO evento.
        if (requiredEventName && requiredEventName !== "Evento") {
          if (!item.eventName || item.eventName === "Evento") return false;
          if (!isSameNormalizedEventName(item.eventName, requiredEventName)) return false;
        }
        return true;
      })
      .sort((a, b) => a.diff - b.diff);

    const best = candidates[0];
    if (!best) return null;

    return {
      cityKey: best.cityKey || null,
      cityName: best.cityName || "",
      eventName: best.eventName || "Evento",
      source: `canal:${channelId}:msg:${best.msg.id}`,
      confidence: best.cityKey ? 90 : 55
    };
  }

  function isSameNormalizedEventName(a = "", b = "") {
    const left = normalizeHallEventName(a);
    const right = normalizeHallEventName(b);

    if (!left || !right) return false;
    if (left === "Evento" || right === "Evento") return false;

    return normalizeHallName(left) === normalizeHallName(right);
  }

  function pickBestHallEvidence(evidenceList = [], directEventName = "Evento") {
    const valid = evidenceList
      .filter(Boolean)
      .filter(item => item.cityKey);

    if (!valid.length) return null;

    const scores = {};

    for (const item of valid) {
      const cityKey = item.cityKey;
      const source = String(item.source || "");
      const eventMatches = isSameNormalizedEventName(item.eventName, directEventName);

      scores[cityKey] ??= {
        cityKey,
        points: 0,
        evidences: [],
        bestConfidence: 0,
        hasCrono: false,
        hasEventosDiarios: false,
        hasOrg: false,
        hasEventName: false,
        hasDirectHall: false,
        eventMatches: false
      };

      let points = 0;

      if (source.startsWith("cronograma_state:")) {
        points += eventMatches ? 55 : 32;
        scores[cityKey].hasCrono = true;
      } else if (source.startsWith(`canal:${EVENTOS_DIARIOS_CHANNEL_ID}:`)) {
        points += eventMatches ? 55 : 32;
        scores[cityKey].hasEventosDiarios = true;
      } else if (source.startsWith("org_override:")) {
        points += 65;
        scores[cityKey].hasOrg = true;
      } else if (source.startsWith("org_historico:")) {
        points += 30;
        scores[cityKey].hasOrg = true;
      } else if (source.startsWith("evento_nome_forte:")) {
        points += 90;
        scores[cityKey].hasEventName = true;
      } else if (source.startsWith("evento_nome:")) {
        points += 38;
        scores[cityKey].hasEventName = true;
      } else if (source === "hall_evento_e_cidade") {
        points += 95;
        scores[cityKey].hasDirectHall = true;
        scores[cityKey].hasEventName = true;
      } else if (source === "texto_do_hall") {
        // ⚠️ O Hall simples pode estar errado.
        // Mas Hall com evento + cidade explícitos entra como hall_evento_e_cidade.
        points += 8;
        scores[cityKey].hasDirectHall = true;
      } else {
        points += 15;
      }

      if (eventMatches) {
        points += 12;
        scores[cityKey].eventMatches = true;
      }

      scores[cityKey].points += points;
      scores[cityKey].bestConfidence = Math.max(scores[cityKey].bestConfidence, Number(item.confidence || 0));
      scores[cityKey].evidences.push(item);
    }

    for (const score of Object.values(scores)) {
      // ✅ Cronograma + Eventos Diários batendo juntos: prioridade máxima.
      if (score.hasCrono && score.hasEventosDiarios && score.eventMatches) {
        score.points += 80;
      }

      // ✅ ORG conhecida + Cronograma/Eventos Diários batendo: ganha do texto errado do Hall.
      if (score.hasOrg && (score.hasCrono || score.hasEventosDiarios)) {
        score.points += 45;
      }

      // ✅ Nome do evento + Cronograma/Eventos Diários batendo.
      if (score.hasEventName && (score.hasCrono || score.hasEventosDiarios)) {
        score.points += 35;
      }
    }

    const ordered = Object.values(scores)
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        return b.bestConfidence - a.bestConfidence;
      });

    const winner = ordered.at(0);
    const second = ordered.at(1);

    if (!winner) return null;

    const winnerHasStrong = winner.hasOrg || winner.hasCrono || winner.hasEventosDiarios || winner.hasEventName;
    const secondHasStrong = second && (second.hasOrg || second.hasCrono || second.hasEventosDiarios || second.hasEventName);

    const strongCityFromEventName =
      winner.hasEventName &&
      winner.hasDirectHall &&
      winner.eventMatches &&
      winner.evidences.some(e => e.source === "hall_evento_e_cidade" || String(e.source || "").startsWith("evento_nome_forte:"));

    const isStrongConflict =
      second &&
      !strongCityFromEventName &&
      winnerHasStrong &&
      secondHasStrong &&
      winner.cityKey !== second.cityKey &&
      (
        Math.abs(winner.points - second.points) <= 65 ||
        (winner.hasOrg && (second.hasCrono || second.hasEventosDiarios)) ||
        (second.hasOrg && (winner.hasCrono || winner.hasEventosDiarios))
      );

    const bestEvidence = winner.evidences
      .sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0))
      .at(0);

    return {
      ...bestEvidence,
      cityKey: winner.cityKey,
      cityName: CITIES[winner.cityKey]?.label || bestEvidence?.cityName || "Cidade Nobre",
      confidence: isStrongConflict ? 70 : Math.min(100, Math.max(winner.bestConfidence, winner.points)),
      needsManualReview: isStrongConflict,
      conflictWithCityKey: isStrongConflict ? second.cityKey : null,
      source: isStrongConflict
        ? `conflito_evidencias:${winner.evidences.map(e => e.source).join(" + ")} VS ${second.evidences.map(e => e.source).join(" + ")}`
        : `voto_evidencias:${winner.evidences.map(e => e.source).join(" + ")}`
    };
  }

  async function resolveHallEvidence(client, hallMessage, fallbackContent = "") {
    const content = fallbackContent || getHallMessageText(hallMessage);

    const directCityKey = detectHallCityKey(content);
    const rawEventName = extractRawHallEventName(content);
    const directEventName = normalizeHallEventName(rawEventName, directCityKey);

    const manualReviewEvidence = getManualReviewCityEvidence(hallMessage.id, content);
    const playerEvidence = getPlayerCityEvidenceFromHallContent(content);
    const orgEvidence = getOrgCityEvidenceFromHallContent(content);
    const eventNameEvidence = getEventCityEvidenceFromHallContent(content);
    const directHallEvidence = getDirectHallCityEvidence(content);

    const eventosEvidence = await findNearbyEvidenceInChannel(client, EVENTOS_DIARIOS_CHANNEL_ID, hallMessage, {
      limit: 100,
      maxDiffMs: 1000 * 60 * 60 * 8,
      requiredEventName: directEventName
    });

    const cronoLogEvidence = await findNearbyEvidenceInChannel(client, CRONO_LOG_CHANNEL_ID, hallMessage, {
      limit: 100,
      maxDiffMs: 1000 * 60 * 60 * 24,
      requiredEventName: directEventName
    });

    const cronoStateEvidence = getCronoSlotForHallTimestamp(hallMessage.createdTimestamp || Date.now(), directEventName);

    const evidenceList = [
      manualReviewEvidence,
      playerEvidence,
      orgEvidence,
      eventNameEvidence,
      directHallEvidence,
      eventosEvidence,
      cronoStateEvidence,
      cronoLogEvidence,
      {
        cityKey: directCityKey,
        cityName: CITIES[directCityKey]?.label || "Cidade Nobre",
        eventName: directEventName,
        source: "texto_do_hall",
        confidence: 12
      }
    ].filter(Boolean);

    const best = pickBestHallEvidence(evidenceList, directEventName);

    if (
      playerEvidence?.cityKey &&
      directHallEvidence?.cityKey &&
      playerEvidence.cityKey !== directHallEvidence.cityKey
    ) {
      return {
        cityKey: playerEvidence.cityKey,
        cityName: CITIES[playerEvidence.cityKey]?.label || "Cidade",
        eventName: playerEvidence.eventName || directEventName || "Evento",
        source: `${playerEvidence.source} VS ${directHallEvidence.source}`,
        confidence: 96,
        needsManualReview: true,
        conflictWithCityKey: directHallEvidence.cityKey
      };
    }

    const eventBest = evidenceList
      .filter(item => item.eventName && item.eventName !== "Evento")
      .sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0))
      .at(0);

const finalCityKey = best?.cityKey || directCityKey || "nobre";
const finalEventName = normalizeHallEventName(eventBest?.eventName || directEventName || "Evento", finalCityKey);

return {
  cityKey: finalCityKey,
  cityName: CITIES[finalCityKey]?.label || "Cidade Nobre",
  eventName: finalEventName,
  source: best?.source || "texto_do_hall",
  confidence: best?.confidence || 35,
  needsManualReview: Boolean(best?.needsManualReview),
  conflictWithCityKey: best?.conflictWithCityKey || null
};
  }

  function cleanExtractedHallEventName(value = "") {
  let text = normalizeHallDisplay(stripDiscordNoise(value));

  text = text.replace(/^evento\s*[:\-]\s*/i, "");

  const cutPatterns = [
    /\s+#?\s*hall\s+da\s+fama\b/i,
    /\s+uma\s+salva\s+de\s+palmas\b/i,
    /\s+\btop\s*\d*\b/i,
    /\s+\bvencedores\b/i,
    /\s+\bmostraram?\s+habilidade\b/i,
    /\s+\bfoi\s+insano\b/i
  ];

  let cutIndex = -1;

  for (const pattern of cutPatterns) {
    const match = text.match(pattern);
    if (match?.index !== undefined) {
      cutIndex = cutIndex === -1 ? match.index : Math.min(cutIndex, match.index);
    }
  }

  if (cutIndex !== -1) {
    text = text.slice(0, cutIndex);
  }

  return normalizeHallDisplay(text);
}

function normalizeHallEventName(eventName = "", cityKey = "nobre") {
  const original = normalizeHallDisplay(stripDiscordNoise(eventName)) || "Evento";

  let normalized = normalizeHallName(original)
    .replace(/\btada\b/g, " ")
    .replace(/\btrophy\b/g, " ")
    .replace(/\bcoroa orange\b/g, " ")
    .replace(/\bcherry blossom\b/g, " ")
    .replace(/\bmilitary medal\b/g, " ")
    .replace(/\bmotorcycle\b/g, " ")
    .replace(/\bsanta creators\b/g, " ")
    .replace(/\bhall da fama\b/g, " ")
    .replace(/\bcidade nobre\b/g, " ")
    .replace(/\bcidade santa\b/g, " ")
    .replace(/\bcidade grande\b/g, " ")
    .replace(/\bcidade maresia\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (
    !normalized ||
    normalized.includes("vip") ||
    normalized.includes("rolepass") ||
    normalized.includes("milhoes") ||
    normalized.includes("milhao") ||
    normalized.includes("foi insano") ||
    normalized.includes("vitoria so e possivel") ||
    normalized.length > 120
  ) {
    return "Evento";
  }

  if (
    normalized.includes("mini rei do crime") ||
    normalized.includes("santa do crime") ||
    normalized.includes("nobre do crime") ||
    normalized.includes("grande do crime") ||
    normalized.includes("maresia do crime")
  ) {
    const finalCityKey = String(cityKey || "nobre").toLowerCase();

    if (finalCityKey === "santa") return "Santa do Crime";
    if (finalCityKey === "maresia") return "Maresia do Crime";
    if (finalCityKey === "grande") return "Grande do Crime";

    return "Nobre do Crime";
  }

  if (
    normalized.includes("pvp de machado no navio") ||
    normalized.includes("machado no navio")
  ) {
    return "PvP de Machado no Navio";
  }

  if (
    normalized.includes("pvp de facao") ||
    normalized.includes("pvp de facão") ||
    normalized.includes("todas as armas")
  ) {
    return "PvP de Facão + Todas as Armas";
  }

  if (normalized.includes("santa royale")) return "Missão Rosa";
  if (normalized.includes("missao rosa")) return "Missão Rosa";

  if (
    normalized.includes("missao pantano") ||
    normalized.includes("santo pantano") ||
    normalized.includes("sonto pantano") ||
    normalized.includes("pantano")
  ) {
    return "Missão Pântano";
  }

  if (normalized.includes("pegando fogo") || normalized.includes("santa pegando fogo")) {
    return "Pegando Fogo";
  }

  if (
    normalized.includes("sob pressao") ||
    normalized.includes("sobre pressao") ||
    normalized.includes("santa sob pressao") ||
    normalized.includes("sobe pressao")
  ) {
    return "Sobre Pressão";
  }

  if (
    normalized.includes("fuga espacial") ||
    normalized.includes("fuga expacial") ||
    normalized.includes("santa fuga espacial")
  ) {
    return "Fuga Espacial";
  }

  if (normalized.includes("socializar")) return "Socializar";

  if (
    normalized.includes("naval creators") ||
    normalized.includes("batalha naval") ||
    normalized === "naval"
  ) {
    return "Naval Creators";
  }

  if (normalized.includes("resgate o macedo") || normalized.includes("resgate macedo")) {
    return "Resgate o Macedo";
  }

  if (normalized.includes("free fire creators") || normalized.includes("free fire")) {
    return "Free Fire Creators";
  }

  if (normalized.includes("rebeliao creators") || normalized.includes("rebeliao")) {
    return "Rebelião Creators";
  }

  if (normalized.includes("esconde esconde")) return "Esconde Esconde";

  if (
    normalized.includes("santacross") ||
    normalized.includes("corrida de moto")
  ) {
    return "Santacross";
  }

  if (normalized.includes("karambit")) return "Karambit";

  if (
    normalized.includes("battle royale") ||
    normalized.includes("batalha royale")
  ) {
    return "Battle Royale";
  }

  if (
    normalized.includes("fuja da onca") ||
    normalized.includes("onca no labirinto") ||
    normalized.includes("labirinto")
  ) {
    return "Fuja da Onça";
  }

  if (
    normalized.includes("apocalypse") ||
    normalized.includes("apocalipse") ||
    normalized.includes("apoclypse")
  ) {
    return "Santa Apocalypse";
  }

  return original;
}

function extractRawHallEventName(content = "") {
  const originalContent = String(content || "");

  const titleMatch =
    originalContent.match(/\*\*\s*Santa\s*Creators\s*:\s*([^*\n]+?)\s*\*\*/i)?.[1]?.trim() ||
    originalContent.match(/Santa\s*Creators\s*:\s*\*\*\s*([^*\n]+?)\s*\*\*/i)?.[1]?.trim() ||
    originalContent.match(/Santa\s*Creators\s*:\s*([^🎉\n]+)/i)?.[1]?.replace(/\*/g, "").trim();

  if (titleMatch) {
    return cleanExtractedHallEventName(titleMatch);
  }

  const trophyMatch =
    originalContent.match(/(?:🏆|:trophy:)\s*\*\*\s*([^*\n]+?)\s*\*\*\s+na\s+\*\*\s*CIDADE/i)?.[1]?.trim() ||
    originalContent.match(/(?:🏆|:trophy:)\s*([^!\n]+?)\s+na\s+\*\*\s*CIDADE/i)?.[1]?.replace(/\*/g, "").trim() ||
    originalContent.match(/(?:🏆|:trophy:)\s*([^!\n]+?)\s+na\s+CIDADE/i)?.[1]?.replace(/\*/g, "").trim();

  if (trophyMatch) {
    return cleanExtractedHallEventName(trophyMatch);
  }

  const raw = stripDiscordNoise(content);
  const lines = raw.split("\n").map(l => cleanOneLine(l)).filter(Boolean);

  const directMatch =
    raw.match(/Santa\s*Creators\s*:\s*([^🎉\n]+)/i)?.[1]?.trim() ||
    raw.match(/SantaCreators\s*:\s*([^:\n]+)/i)?.[1]?.trim() ||
    raw.match(/evento\s+SantaCreators\s*:\s*([^:\n]+)/i)?.[1]?.trim() ||
    raw.match(/evento\s+de\s+([^:\n]+)/i)?.[1]?.trim() ||
    raw.match(/evento\s+[–-]\s*([^:\n]+)/i)?.[1]?.trim() ||
    raw.match(/evento\s+([^:\n]+)/i)?.[1]?.trim();

  if (directMatch) {
    return cleanExtractedHallEventName(directMatch);
  }

  const eventLine = lines.find(line => {
    const normalized = normalizeHallName(line);

    if (!normalized) return false;
    if (normalized.includes("parabens")) return false;
    if (normalized.includes("lendarios")) return false;
    if (normalized.includes("hall da fama")) return false;
    if (normalized.includes("uma salva de palmas")) return false;
    if (normalized.includes("muito orgulho")) return false;
    if (normalized.startsWith("top")) return false;

    return (
      normalized.includes("missao") ||
      normalized.includes("socializar") ||
      normalized.includes("royale") ||
      normalized.includes("naval") ||
      normalized.includes("fuga") ||
      normalized.includes("pegando fogo") ||
      normalized.includes("sob pressao") ||
      normalized.includes("sobre pressao") ||
      normalized.includes("santacross") ||
      normalized.includes("resgate") ||
      normalized.includes("rebeliao") ||
      normalized.includes("esconde")
    );
  });

  return eventLine ? cleanExtractedHallEventName(eventLine) : "Evento";
}

function normalizeImageUrl(url = "") {
  return String(url)
    .trim()
    .replace(/[>)\]\s]+$/g, "");
}

function uniqueImageUrls(urls = []) {
  const seen = new Set();
  const finalUrls = [];

  for (const rawUrl of urls) {
    const url = normalizeImageUrl(rawUrl);
    if (!url) continue;

    const key = url.split("?")[0].toLowerCase();

    if (seen.has(key)) continue;

    seen.add(key);
    finalUrls.push(url);
  }

  return finalUrls;
}

function getImageUrlsFromContent(content = "") {
  return uniqueImageUrls(String(content).match(/https?:\/\/\S+/gi) || []);
}

function getImageUrlsFromAttachments(message) {
  if (!message?.attachments) return [];

  return uniqueImageUrls(
    [...message.attachments.values()].map(attachment => attachment.url)
  );
}

function getHallImageUrlKey(url = "") {
  return normalizeImageUrl(url)
    .split("?")[0]
    .toLowerCase();
}

async function inspectHallAttachmentsForScan(message) {
  const currentAttachments = [
    ...(message?.attachments?.values?.() || [])
  ];

  if (currentAttachments.length === 0) {
    return {
      attachments: [],
      imageUrls: [],
      originalCount: 0,
      finalCount: 0,
      duplicateCount: 0,
      brokenCount: 0,
      changed: false,
      verified: true
    };
  }

  const verifiedAttachments = [];
  const brokenAttachments = [];
  const seenContentHashes = new Set();

  for (const attachment of currentAttachments) {
    const attachmentUrl =
      attachment.url ||
      attachment.proxyURL ||
      "";

    if (!attachmentUrl) {
      brokenAttachments.push(attachment);
      continue;
    }

    try {
      const controller =
        new AbortController();

      const timeout = setTimeout(
        () => controller.abort(),
        15000
      );

      let response;

      try {
        response = await fetch(
          attachmentUrl,
          {
            method: "GET",
            redirect: "follow",
            signal: controller.signal,
            headers: {
              "User-Agent":
                "SantaCreators-HallDaFama/1.0"
            }
          }
        );
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        brokenAttachments.push(attachment);
        continue;
      }

      const contentType = String(
        response.headers.get("content-type") || ""
      )
        .toLowerCase()
        .split(";")[0]
        .trim();

      if (
        contentType &&
        !contentType.startsWith("image/")
      ) {
        brokenAttachments.push(attachment);
        continue;
      }

      const arrayBuffer =
        await response.arrayBuffer();

      const buffer =
        Buffer.from(arrayBuffer);

      if (!buffer.length) {
        brokenAttachments.push(attachment);
        continue;
      }

      const contentHash =
        createHash("sha256")
          .update(buffer)
          .digest("hex");

      if (seenContentHashes.has(contentHash)) {
        continue;
      }

      seenContentHashes.add(contentHash);

      verifiedAttachments.push({
        attachment,
        contentHash
      });
    } catch (error) {
      console.warn(
        `[HallDaFama] Não foi possível verificar o anexo ${attachment.id} da mensagem ${message?.id}:`,
        error?.message || error
      );

      brokenAttachments.push(attachment);
    }
  }

  /*
   * Se nenhum anexo conseguiu ser verificado, não removemos nada.
   * Isso evita apagar todas as fotos de um Hall quando o Discord
   * estiver temporariamente indisponível ou a CDN estiver instável.
   */
  if (verifiedAttachments.length === 0) {
    return {
      attachments: currentAttachments.map(
        attachment => ({
          id: attachment.id
        })
      ),

      imageUrls: uniqueImageUrls(
        currentAttachments
          .map(attachment => attachment.url)
          .filter(Boolean)
      ),

      originalCount:
        currentAttachments.length,

      finalCount:
        currentAttachments.length,

      duplicateCount: 0,

      brokenCount:
        brokenAttachments.length,

      changed: false,

      verified: false
    };
  }

  const finalAttachments =
    verifiedAttachments.map(
      item => item.attachment
    );

  const finalAttachmentIds =
    new Set(
      finalAttachments.map(
        attachment => attachment.id
      )
    );

  const removedCount =
    currentAttachments.filter(
      attachment =>
        !finalAttachmentIds.has(
          attachment.id
        )
    ).length;

  const duplicateCount =
    Math.max(
      0,
      removedCount -
      brokenAttachments.length
    );

  return {
    attachments:
      finalAttachments.map(
        attachment => ({
          id: attachment.id
        })
      ),

    imageUrls: uniqueImageUrls(
      finalAttachments
        .map(attachment => attachment.url)
        .filter(Boolean)
    ),

    originalCount:
      currentAttachments.length,

    finalCount:
      finalAttachments.length,

    duplicateCount,

    brokenCount:
      brokenAttachments.length,

    changed:
      finalAttachments.length !==
      currentAttachments.length,

    verified: true
  };
}

function removeHallImageUrlsFromContent(content = "", imageUrls = []) {
  let finalContent = String(content || "");

  const urlsToRemove = uniqueImageUrls([
    ...imageUrls,
    ...getImageUrlsFromContent(finalContent)
  ]);

  for (const imageUrl of urlsToRemove) {
    finalContent = finalContent.replaceAll(imageUrl, "");
  }

  return finalContent
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getHallImageExtension(contentType = "", imageUrl = "") {
  const normalizedContentType = String(contentType || "")
    .toLowerCase()
    .split(";")[0]
    .trim();

  const extensionByContentType = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif"
  };

  if (extensionByContentType[normalizedContentType]) {
    return extensionByContentType[normalizedContentType];
  }

  try {
    const pathname = new URL(imageUrl).pathname.toLowerCase();
    const extensionMatch = pathname.match(/\.(png|jpe?g|webp|gif)$/i);

    if (extensionMatch) {
      const extension = extensionMatch[1].toLowerCase();
      return extension === "jpeg" ? "jpg" : extension;
    }
  } catch {}

  return "png";
}

async function downloadHallImageAttachments(imageUrls = [], options = {}) {
  const urls = uniqueImageUrls(imageUrls).slice(0, 4);
  const files = [];

  const maximumSingleImageSize =
    Number(options.maximumSingleImageSize) ||
    10 * 1024 * 1024;

  const maximumTotalImageSize =
    Number(options.maximumTotalImageSize) ||
    24 * 1024 * 1024;

  let totalDownloadedSize = 0;

  for (let index = 0; index < urls.length; index++) {
    const imageUrl = urls[index];

    try {
      const parsedUrl = new URL(imageUrl);

      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        console.warn(
          `[HallDaFama] Protocolo de imagem não permitido: ${imageUrl}`
        );
        continue;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      let response;

      try {
        response = await fetch(imageUrl, {
          method: "GET",
          redirect: "follow",
          signal: controller.signal,
          headers: {
            "User-Agent": "SantaCreators-HallDaFama/1.0"
          }
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        console.warn(
          `[HallDaFama] Não foi possível baixar a imagem ${imageUrl}. Status: ${response.status}`
        );
        continue;
      }

      const contentType = String(
        response.headers.get("content-type") || ""
      )
        .toLowerCase()
        .split(";")[0]
        .trim();

      if (contentType && !contentType.startsWith("image/")) {
        console.warn(
          `[HallDaFama] O link não retornou uma imagem: ${imageUrl}. Content-Type: ${contentType}`
        );
        continue;
      }

      const declaredContentLength = Number(
        response.headers.get("content-length") || 0
      );

      if (
        declaredContentLength > 0 &&
        declaredContentLength > maximumSingleImageSize
      ) {
        console.warn(
          `[HallDaFama] Imagem ignorada por exceder o limite individual: ${imageUrl}`
        );
        continue;
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (!buffer.length) {
        console.warn(
          `[HallDaFama] Imagem vazia ignorada: ${imageUrl}`
        );
        continue;
      }

      if (buffer.length > maximumSingleImageSize) {
        console.warn(
          `[HallDaFama] Imagem ignorada por exceder o limite individual após download: ${imageUrl}`
        );
        continue;
      }

      if (
        totalDownloadedSize + buffer.length >
        maximumTotalImageSize
      ) {
        console.warn(
          `[HallDaFama] Limite total de imagens atingido. Imagem ignorada: ${imageUrl}`
        );
        continue;
      }

      const extension = getHallImageExtension(
        contentType,
        imageUrl
      );

      const attachmentName =
        `hall-da-fama-${Date.now()}-${index + 1}.${extension}`;

      files.push(
        new AttachmentBuilder(buffer, {
          name: attachmentName,
          description: `Imagem ${index + 1} do Hall da Fama`
        })
      );

      totalDownloadedSize += buffer.length;
    } catch (error) {
      console.error(
        `[HallDaFama] Erro ao baixar a imagem ${imageUrl}:`,
        error
      );
    }
  }

  return files;
}

async function downloadUniqueApprovedHallImages(
  imageUrls = []
) {
  const urls =
    uniqueImageUrls(
      imageUrls
    ).slice(0, 4);

  const files = [];
  const seenHashes = new Set();

  function getDownloadCandidates(
    originalUrl
  ) {
    const normalizedUrl =
      normalizeImageUrl(
        originalUrl
      );

    if (!normalizedUrl) {
      return [];
    }

    const candidates = [
      normalizedUrl
    ];

    try {
      const parsedUrl =
        new URL(
          normalizedUrl
        );

      const pathname =
        parsedUrl.pathname;

      /*
       * URLs antigas de anexos do Discord podem
       * possuir parâmetros assinados expirados.
       *
       * Tentamos também o endereço equivalente
       * no domínio de mídia e a rota sem os
       * parâmetros antigos.
       */
      if (
        parsedUrl.hostname ===
          "cdn.discordapp.com" ||
        parsedUrl.hostname ===
          "media.discordapp.net"
      ) {
        candidates.push(
          `https://cdn.discordapp.com${pathname}`
        );

        candidates.push(
          `https://media.discordapp.net${pathname}`
        );

        candidates.push(
          `https://media.discordapp.net${pathname}?width=4096&height=4096`
        );
      }
    } catch {
      return [];
    }

    return [
      ...new Set(
        candidates
          .map(candidate =>
            normalizeImageUrl(
              candidate
            )
          )
          .filter(Boolean)
      )
    ];
  }

  async function downloadCandidate(
    candidateUrl
  ) {
    const parsedUrl =
      new URL(
        candidateUrl
      );

    if (
      ![
        "http:",
        "https:"
      ].includes(
        parsedUrl.protocol
      )
    ) {
      return null;
    }

    const controller =
      new AbortController();

    const timeout =
      setTimeout(
        () =>
          controller.abort(),
        15000
      );

    try {
      const response =
        await fetch(
          candidateUrl,
          {
            method: "GET",
            redirect: "follow",
            signal:
              controller.signal,
            headers: {
              "User-Agent":
                "SantaCreators-HallDaFama/1.0",
              "Accept":
                "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
            }
          }
        );

      if (!response.ok) {
        return null;
      }

      const contentType =
        String(
          response.headers.get(
            "content-type"
          ) || ""
        )
          .toLowerCase()
          .split(";")[0]
          .trim();

      if (
        contentType &&
        !contentType.startsWith(
          "image/"
        )
      ) {
        return null;
      }

      const arrayBuffer =
        await response.arrayBuffer();

      const buffer =
        Buffer.from(
          arrayBuffer
        );

      if (!buffer.length) {
        return null;
      }

      return {
        buffer,
        contentType,
        finalUrl:
          candidateUrl
      };
    } catch {
      return null;
    } finally {
      clearTimeout(
        timeout
      );
    }
  }

  for (
    let index = 0;
    index < urls.length;
    index++
  ) {
    const originalUrl =
      urls[index];

    const candidates =
      getDownloadCandidates(
        originalUrl
      );

    let downloadedImage =
      null;

    for (
      const candidateUrl of
      candidates
    ) {
      downloadedImage =
        await downloadCandidate(
          candidateUrl
        );

      if (downloadedImage) {
        break;
      }
    }

    if (!downloadedImage) {
      console.warn(
        `[HallDaFama] Nenhuma versão recuperável foi encontrada para a imagem aprovada ${index + 1}: ${originalUrl}`
      );

      continue;
    }

    const imageHash =
      createHash("sha256")
        .update(
          downloadedImage.buffer
        )
        .digest("hex");

    /*
     * Só elimina quando o conteúdo real é
     * exatamente igual.
     *
     * Duas imagens diferentes, mesmo chamadas
     * image.png, terão hashes diferentes.
     */
    if (
      seenHashes.has(
        imageHash
      )
    ) {
      console.warn(
        `[HallDaFama] A imagem aprovada ${index + 1} é idêntica a outra imagem do mesmo registro e não será duplicada.`
      );

      continue;
    }

    seenHashes.add(
      imageHash
    );

    const extension =
      getHallImageExtension(
        downloadedImage.contentType,
        downloadedImage.finalUrl
      );

    files.push(
      new AttachmentBuilder(
        downloadedImage.buffer,
        {
          name:
            `hall-restaurado-${Date.now()}-${files.length + 1}.${extension}`,

          description:
            `Imagem ${files.length + 1} do Hall da Fama`
        }
      )
    );
  }

  return files;
}

function haveSameHallImageUrls(firstUrls = [], secondUrls = []) {
  const firstKeys = uniqueImageUrls(firstUrls)
    .map(imageUrl => getHallImageUrlKey(imageUrl))
    .filter(Boolean)
    .sort();

  const secondKeys = uniqueImageUrls(secondUrls)
    .map(imageUrl => getHallImageUrlKey(imageUrl))
    .filter(Boolean)
    .sort();

  if (firstKeys.length !== secondKeys.length) {
    return false;
  }

  return firstKeys.every((key, index) => {
    return key === secondKeys[index];
  });
}

async function prepareHallImageEdit(
  message,
  imageUrls = [],
  options = {}
) {
  const replaceExisting =
    options.replaceExisting === true;

  const forceReuploadExisting =
    options.forceReuploadExisting === true;

  const currentAttachments = [
    ...(message?.attachments?.values?.() || [])
  ];

  const currentAttachmentUrls = uniqueImageUrls(
    currentAttachments
      .map(attachment => attachment.url)
      .filter(Boolean)
  );

  const preservedAttachments = replaceExisting
    ? []
    : currentAttachments;

  const existingUrlKeys = new Set(
    preservedAttachments.map(attachment =>
      getHallImageUrlKey(attachment.url)
    )
  );

  const allCandidateUrls = uniqueImageUrls([
    ...(forceReuploadExisting
      ? currentAttachmentUrls
      : []),
    ...imageUrls
  ]);

  const urlsToDownload = forceReuploadExisting
    ? allCandidateUrls.slice(0, 4)
    : allCandidateUrls
        .filter(imageUrl => {
          return !existingUrlKeys.has(
            getHallImageUrlKey(imageUrl)
          );
        })
        .slice(0, 4);

  const availableSlots =
    replaceExisting || forceReuploadExisting
      ? 4
      : Math.max(
          0,
          4 - preservedAttachments.length
        );

  const files = availableSlots > 0
    ? await downloadHallImageAttachments(
        urlsToDownload.slice(0, availableSlots)
      )
    : [];

  const shouldReplaceAttachments =
    (
      replaceExisting ||
      forceReuploadExisting
    ) &&
    files.length > 0;

  const attachments = shouldReplaceAttachments
    ? []
    : preservedAttachments.map(attachment => ({
        id: attachment.id
      }));

  return {
    attachments,
    files,
    shouldReplaceAttachments,
    reuploadedExisting:
      forceReuploadExisting &&
      files.length > 0,
    hasImages:
      attachments.length > 0 ||
      files.length > 0
  };
}

async function getSafeHallImageUrls(client, hallMessage, options = {}) {
  const content =
    options.content ??
    getHallMessageText(hallMessage);

  const manualUrls = uniqueImageUrls(
    options.manualUrls || []
  );

  const contentUrls =
    getImageUrlsFromContent(content);

  const attachmentUrls =
    getImageUrlsFromAttachments(hallMessage);

  const approvalImageData =
    await findApprovalImagesForHall(
      client,
      hallMessage,
      {
        eventName:
          options.eventName ||
          extractHallParts(content).eventName,

        winnerNames:
          options.winnerNames ||
          extractWinnerNamesForApprovalMatch(content)
      }
    ).catch(() => ({
      found: false,
      messageId: null,
      images: [],
      reason:
        "Erro ao procurar aprovação"
    }));

  const approvalUrls =
    approvalImageData.found
      ? approvalImageData.images
      : [];

  return uniqueImageUrls([
    ...manualUrls,
    ...contentUrls,
    ...attachmentUrls,
    ...approvalUrls
  ]);
}

function hasHallGGWinnerMarker(line = "") {
  const cleaned = stripDiscordNoise(line)
    .replace(/^#\s*/i, "")
    .replace(/^TOP\s*#?\s*\d*\s*[:\-]?\s*/i, "")
    .replace(/^Top\s*#?\s*\d+\s*[:\-]?\s*/i, "")
    .replace(/^novo[_\s-]*emoji\s*~?\s*\d+\s*[:\-]?\s*/i, "")
    .replace(/^emoji\s*~?\s*\d+\s*[:\-]?\s*/i, "")
    .replace(/^(🥇|🥈|🥉)\s*/u, "")
    .replace(/^[º°ª\.\:\-\s|]+/, "")
    .replace(/\s+/g, " ")
    .trim();

  return /^GG(?:\s*[:\-]\s*|\s+)(?=\S)/i.test(cleaned);
}

function removeHallGGWinnerMarker(value = "") {
  return String(value || "")
    .replace(/^GG\s*[:\-]\s*/i, "")
    .replace(/^GG\s+(?=\S)/i, "")
    .trim();
}

function cleanHallWinnerLine(line = "") {
  return removeHallGGWinnerMarker(
    stripDiscordNoise(line)
      .replace(/^#\s*/i, "")
      .replace(/^TOP\s*#?\s*\d*\s*[:\-]?\s*/i, "")
      .replace(/^Top\s*#?\s*\d+\s*[:\-]?\s*/i, "")
      .replace(/^novo[_\s-]*emoji\s*~?\s*\d+\s*[:\-]?\s*/i, "")
      .replace(/^emoji\s*~?\s*\d+\s*[:\-]?\s*/i, "")
      .replace(/^GG\s*[:\-]\s*/i, "")
      .replace(/\bGG\s*[:\-]\s*/i, "")
      .replace(/^Organiza[cç][aã]o\s*[:\-]\s*/i, "")
      .replace(/^Vencedores?\s*/i, "")
      .replace(/^(🥇|🥈|🥉)\s*/u, "")
      .replace(/^[º°ª\.\:\-\s|]+/, "")
      .replace(/\s*\|\s*/g, " | ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function parsePipePlayerOrgWinnerLine(cleanLine = "", cityKey = "nobre", originalLine = "") {
  const parts = String(cleanLine || "")
    .split(/\s*\|\s*/g)
    .map(part => normalizeHallDisplay(part))
    .filter(Boolean);

  if (parts.length < 3) return null;

  const idIndex = parts.findIndex(part => /^\d{2,}$/.test(part));
  if (idIndex <= 0) return null;

  const playerName = normalizeHallDisplay(parts[idIndex - 1]);
  const playerId = normalizeHallDisplay(parts[idIndex]);

  const orgName = parts
    .slice(idIndex + 1)
    .find(part => {
      if (!part) return false;
      if (/^\d+$/.test(part)) return false;
      if (looksLikePrizeOnly(part)) return false;
      if (isInvalidWinnerName(part)) return false;
      if (normalizeHallKey(part) === normalizeHallKey(playerName)) return false;

      return isKnownOrgName(part) || getManualOrgCityKey(part);
    });

  if (!playerName) return null;
  if (!playerId) return null;
  if (!orgName) return null;
  if (looksLikePrizeOnly(playerName)) return null;
  if (isInvalidWinnerName(playerName)) return null;
  if (looksLikePrizeOnly(orgName)) return null;
  if (isInvalidWinnerName(orgName)) return null;

  return {
    type: "player",
    playerName,
    playerId,
    orgName: normalizeOrgDisplayName(orgName),
    cityKey,
    rawLine: originalLine
  };
}

function cleanRankingPlayerName(value = "") {
  return normalizeHallDisplay(value)
    .replace(/^#\s*/i, "")
    .replace(/^TOP\s*#?\s*\d+\s*[:\-]?\s*/i, "")
    .replace(/^Top\s*#?\s*\d+\s*[:\-]?\s*/i, "")
    .replace(/^(🥇|🥈|🥉)\s*/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

  function getHallMessageText(message) {
    const embedText = message?.embeds
      ?.map(embed => {
        const fieldsText = (embed.fields || [])
          .map(field => `${field.name || ""}\n${field.value || ""}`)
          .join("\n");

        return [
          embed.title || "",
          embed.description || "",
          fieldsText,
          embed.footer?.text || "",
          embed.author?.name || ""
        ].filter(Boolean).join("\n");
      })
      .join("\n") || "";

    return [
      message?.content || "",
      embedText
    ].filter(Boolean).join("\n").trim();
  }

  function extractHallWinnerLines(content = "") {
    const raw = String(content || "");
    const lines = raw.split("\n").map(l => l.trim()).filter(Boolean);

    const topLines = lines.filter(line => {
      const rawClean = stripDiscordNoise(line);
      const cleanWinner = cleanHallWinnerLine(line);
      const clean = normalizeHallName(cleanWinner);

      const startsAsWinner =
        /^TOP\b/i.test(rawClean) ||
        /^#?\s*TOP\b/i.test(rawClean) ||
        /^(?:🥇|🥈|🥉)?\s*\d+\s*[º°ª]?\s*LUGAR\b/i.test(rawClean) ||
        /^Organiza[cç][aã]o\b/i.test(rawClean) ||
        /^Vencedores?\s*[:\-]/i.test(rawClean) ||
        /^Vencedores?\s+[A-Za-zÀ-ÿ0-9]/i.test(rawClean);

      if (!startsAsWinner) return false;
      if (!clean) return false;
      if (clean === "vencedores") return false;
      if (clean.includes("hall da fama")) return false;
      if (clean.includes("uma salva de palmas")) return false;
      if (clean.includes("mostraram habilidade")) return false;
      if (clean.includes("mostrou habilidade")) return false;
      if (clean.includes("esperteza")) return false;
      if (clean.includes("sangue nos olhos")) return false;
      if (clean.includes("foi insano")) return false;
      if (clean.includes("everyone")) return false;
      if (clean.includes("cidade")) return false;
      if (clean.includes("cidadao")) return false;
      if (clean.includes("santacreators")) return false;
      if (clean.includes("lideres")) return false;
      if (clean.includes("grandes vencedores")) return false;
      if (clean.includes("grande vencedores")) return false;
      if (clean.includes("nosso evento")) return false;
      if (clean.includes("anunciamos")) return false;
      if (clean.includes("muito orgulho")) return false;
      if (clean.includes("campeao absoluto")) return false;
      if (clean.includes("desafiante implacavel")) return false;
      if (clean.includes("sobrevivente de elite")) return false;
      if (clean.includes("status no rp")) return false;
      if (clean.includes("lenda viva")) return false;
      if (clean.includes("rival direto")) return false;
      if (clean.includes("nome forte no submundo")) return false;
      if (clean.includes("o evento pvp na creators colocou")) return false;

      const cleanParts = cleanWinner
        .split(/\s*\|\s*|\s*<\s*|\s*:\s*/g)
        .map(part => normalizeHallDisplay(part))
        .filter(Boolean);

      const hasPossibleWinnerName = cleanParts.some(part => {
        if (!part) return false;
        if (/^\d+$/.test(part)) return false;
        if (looksLikePrizeOnly(part)) return false;
        if (isInvalidWinnerName(part)) return false;
        return true;
      });

      if (!hasPossibleWinnerName) return false;

      return true;
    });

    if (topLines.length > 0) {
      return topLines;
    }

    const hallIndex = lines.findIndex(line => normalizeHallName(line).includes("hall da fama"));
    if (hallIndex === -1) return [];

    const winnerHeaderIndex = lines.findIndex((line, index) => {
      if (index <= hallIndex) return false;

      const clean = normalizeHallName(stripDiscordNoise(line));

      return clean === "vencedores";
    });

    const startIndex = winnerHeaderIndex !== -1
      ? winnerHeaderIndex + 1
      : hallIndex + 1;

    return lines
      .slice(startIndex)
      .filter(line => {
        const clean = normalizeHallName(stripDiscordNoise(line));
        if (!clean) return false;
        if (clean === "vencedores") return false;
        if (clean.includes("hall da fama")) return false;
        if (clean.includes("uma salva de palmas")) return false;
        if (clean.includes("mostraram habilidade")) return false;
        if (clean.includes("mostrou habilidade")) return false;
        if (clean.includes("esperteza")) return false;
        if (clean.includes("sangue nos olhos")) return false;
        if (clean.includes("foi insano")) return false;
        if (clean.includes("everyone")) return false;
        if (clean.includes("cidade")) return false;
        if (clean.includes("cidadao")) return false;
        if (clean.includes("santacreators")) return false;
        if (clean.includes("lideres")) return false;
        if (looksLikePrizeOnly(clean)) return false;
        if (isInvalidWinnerName(clean)) return false;
        return true;
      })
      .slice(0, 8);
  }

  function looksLikePrizeOnly(value = "") {
    const normalized = normalizeHallName(value);

    return (
      /\bvip\b/i.test(normalized) ||
      /\bvips\b/i.test(normalized) ||
      /\bpass\b/i.test(normalized) ||
      /\brolepass\b/i.test(normalized) ||
      /\brole\s*pass\b/i.test(normalized) ||
      /\bmilhao\b/i.test(normalized) ||
      /\bmilhoes\b/i.test(normalized) ||
      /\b\d+\s*kk\b/i.test(normalized) ||
      /\b\d+\s*k\b/i.test(normalized) ||
      /\bkk\b/i.test(normalized) ||
      /\bk\b/i.test(normalized) ||
      /\b50k\b/i.test(normalized) ||
      /\b100k\b/i.test(normalized) ||
      /\bpremio\b/i.test(normalized) ||
      /\bpremiacao\b/i.test(normalized) ||
      /\bouro\b/i.test(normalized) ||
      /\bprata\b/i.test(normalized) ||
      /\bbronze\b/i.test(normalized) ||
      /\blancamento\b/i.test(normalized) ||
      /\bdias\b/i.test(normalized) ||
      /\b7\s*dias\b/i.test(normalized)
    );
  }

  function isInvalidWinnerName(value = "") {
    const normalized = normalizeHallName(value);

    if (!normalized) return true;
    if (/^\d+\s*dias?$/.test(normalized)) return true;
    if (/^\d+\s*dia$/.test(normalized)) return true;
    if (normalized === "dias") return true;
    if (normalized === "dia") return true;
    if (normalized.includes("vip evento")) return true;
    if (normalized.includes("vip gente boa")) return true;
    if (normalized.includes("vip lancamento")) return true;
    if (normalized.includes("rolepass")) return true;
    if (normalized.includes("battle pass")) return true;
    if (normalized.includes("milhoes")) return true;
    if (normalized.includes("milhao")) return true;
    if (normalized.includes("premiacao")) return true;
    if (normalized.includes("mostrou habilidade")) return true;
    if (normalized.includes("esperteza")) return true;
    if (normalized.includes("sangue nos olhos")) return true;
    if (normalized.includes("foi insano")) return true;
if (normalized.includes("como ficou depois")) return true;
if (normalized.includes("cidade 1")) return true;
if (normalized.includes("grandes vencedores")) return true;
if (normalized.includes("grande vencedores")) return true;
if (normalized.includes("nosso evento")) return true;
if (normalized.includes("anunciamos")) return true;
if (normalized.includes("muito orgulho")) return true;
if (normalized === "organizacao") return true;
if (normalized === "organização") return true;
if (/^top\s*\d+$/i.test(normalized)) return true;
if (normalized.includes("campeao absoluto")) return true;
if (normalized.includes("desafiante implacavel")) return true;
if (normalized.includes("sobrevivente de elite")) return true;
if (normalized.includes("status no rp")) return true;
if (normalized.includes("o evento pvp na creators colocou")) return true;
if (normalized.includes("dominou o campo de batalha")) return true;
if (normalized.includes("chegou ate o fim")) return true;
if (normalized.includes("resistiu adaptou se")) return true;

return false;
  }

function extractOrgBetweenBraces(value = "") {
  const match = String(value || "").match(/\{([^}]+)\}/);
  const orgName = normalizeHallDisplay(match?.[1] || "");

  if (!orgName) return "";
  if (looksLikePrizeOnly(orgName)) return "";
  if (isInvalidWinnerName(orgName)) return "";

  return orgName;
}

function removeOrgBetweenBraces(value = "") {
  return String(value || "").replace(/\{[^}]+\}/g, " ").trim();
}

function extractOrgBetweenAngles(value = "") {
  const match = String(value || "").match(/>\s*([^<]+?)\s*</);
  const orgName = normalizeHallDisplay(match?.[1] || "");

  if (!orgName) return "";
  if (looksLikePrizeOnly(orgName)) return "";
  if (isInvalidWinnerName(orgName)) return "";
  if (!isKnownOrgName(orgName) && !getManualOrgCityKey(orgName)) return "";

  return orgName;
}

function removeOrgBetweenAngles(value = "") {
  return String(value || "").replace(/>\s*[^<]+?\s*</g, " ").trim();
}

function looksLikeMoneyPrizeId(cleanLine = "", id = "") {
  if (!id) return false;

  return new RegExp(`(?:^|[\\s|<])${id}\\s*(?:kk|k|milh[oõ]es|milh[aã]o)\\b`, "i").test(cleanLine);
}

function getWinnerIdFromParts(parts = []) {
  for (let index = 0; index < parts.length; index++) {
    const raw = String(parts[index] || "");
    const match = raw.match(/^(\d{2,})(?:\s+(.+))?$/);
    if (!match) continue;

    const id = match[1];
    const rest = normalizeHallName(match[2] || "");
    const prev = normalizeHallName(parts[index - 1] || "");
    const next = normalizeHallName(parts[index + 1] || "");
    if (rest && id.length >= 4 && looksLikePrizeOnly(rest)) {
      return id;
    }

    if (/\b\d+\s*(kk|k|mil|milhao|milhoes)\b/i.test(normalizeHallName(raw))) {
      continue;
    }

    if (!rest && Number(id) < 1000) {
      const afterNext = normalizeHallName(parts[index + 2] || "");

      if (
        next &&
        !looksLikePrizeOnly(next) &&
        !isInvalidWinnerName(next) &&
        looksLikePrizeOnly(afterNext)
      ) {
        return id;
      }

      if (prev && looksLikePrizeOnly(next)) return id;
      continue;
    }

    if (!rest) return id;
  }

  return "";
}

function isOrgEventName(eventName = "", cityKey = "nobre") {
  const normalizedEvent = normalizeHallEventName(eventName, cityKey);

  return [
    "Missão Rosa",
    "Rebelião Creators",
    "Resgate o Macedo",
    "Pegando Fogo",
    "Free Fire Creators",
    "Naval Creators",
    "Socializar",
    "Missão Pântano",
    "Grande do Crime",
    "Santa do Crime",
    "Maresia do Crime",
    "Nobre do Crime"
  ].includes(normalizedEvent);
}

function extractWinnerIdentityFromParts(parts = []) {
  const first = normalizeHallDisplay(parts[0] || "");

  // Ex: 6142 Ciny Cruel | Dixavas : ROLEPASS
  let match = first.match(/^(\d{2,})\s+(.+)$/);
  if (match) {
    return {
      playerId: match[1],
      playerName: normalizeHallDisplay(match[2])
    };
  }

  // Ex: Vitória 313199 | Vip Evento
  match = first.match(/^(.+?)\s+(\d{2,})$/);
  if (match) {
    return {
      playerId: match[2],
      playerName: normalizeHallDisplay(match[1])
    };
  }

  const id = getWinnerIdFromParts(parts);
  if (!id) return null;

  const idIndex = parts.findIndex(p => p === id || p.startsWith(`${id} `));
  const beforeId = parts.slice(0, idIndex).filter(p => !looksLikePrizeOnly(p));
  const afterId = parts.slice(idIndex + 1).filter(p => !looksLikePrizeOnly(p) && !isInvalidWinnerName(p));

  return {
    playerId: id,
    playerName: normalizeHallDisplay(beforeId[0] || afterId[0] || "")
  };
}

function parsePlayerOrgPrizeWinnerLine(line = "", cityKey = "nobre") {
  const cleanedLine = cleanHallWinnerLine(line);

  const parts = cleanedLine
    .split(/\s*\|\s*/g)
    .map(part => normalizeHallDisplay(part));

  if (parts.length < 2) return null;

  const nameAndOrg = parts[0] || "";
  const prizeParts = parts.slice(1);

  if (
    !prizeParts.every(part =>
      part &&
      looksLikePrizeOnly(part)
    )
  ) {
    return null;
  }

  const separated = nameAndOrg
    .split(/\s*[-–—]\s*/g)
    .map(part => normalizeHallDisplay(part))
    .filter(Boolean);

  if (separated.length < 2) return null;

  const possibleOrgName =
    separated.at(-1) ||
    "";

  const playerName =
    separated
      .slice(0, -1)
      .join(" - ");

  if (
    !playerName ||
    !possibleOrgName
  ) {
    return null;
  }

  const isRecognizedOrg =
    isExactKnownOrgName(possibleOrgName) ||
    Boolean(
      ORG_NAME_ALIASES[
        normalizeHallKey(
          possibleOrgName
        )
      ]
    ) ||
    Boolean(
      getManualOrgCityKey(
        possibleOrgName
      )
    );

  if (!isRecognizedOrg) {
    return null;
  }

  return {
    type: "org",
    orgName:
      normalizeOrgDisplayName(
        possibleOrgName
      ),
    cityKey,
    rawLine:
      String(line || "")
  };
}

function parsePlacementOrgWinnerLine(line = "", cityKey = "nobre") {
  const cleaned =
    normalizeHallDisplay(
      stripDiscordNoise(line)
    );

  const match = cleaned.match(
    /^\d+\s*[º°ª]?\s*LUGAR\s*[-–—:]\s*(.+)$/i
  );

  const orgName =
    normalizeOrgDisplayName(
      match?.[1] ||
      ""
    );

  if (!orgName) return null;
  if (/^\d+$/.test(orgName)) return null;
  if (looksLikePrizeOnly(orgName)) return null;
  if (isInvalidWinnerName(orgName)) return null;

  return {
    type: "org",
    orgName,
    cityKey,
    rawLine:
      String(line || "")
  };
}

function parseTopEmojiOrgWinnerLine(line = "", cityKey = "nobre") {
  const originalLine = String(line || "").trim();

  if (!originalLine) return null;

  const hasTopPrefix =
    /^#?\s*TOP\b/i.test(originalLine) ||
    /^#?\s*TOP\s*:/i.test(originalLine);

  if (!hasTopPrefix) return null;

  const hasGGMarker = hasHallGGWinnerMarker(originalLine);

  const cleanedLine = removeHallGGWinnerMarker(
    stripDiscordNoise(originalLine)
      .replace(/^#\s*/i, "")
      .replace(/^TOP\s*#?\s*\d*\s*[:\-]?\s*/i, "")
      .replace(/^novo[_\s-]*emoji\s*~?\s*\d+\s*[:\-]?\s*/i, "")
      .replace(/^emoji\s*~?\s*\d+\s*[:\-]?\s*/i, "")
      .replace(/^[º°ª\.\:\-\s|]+/, "")
      .replace(/\s+/g, " ")
      .trim()
  );

  if (!cleanedLine) return null;

  const beforePrize = normalizeHallDisplay(
    cleanedLine.split(/\s*\|\s*/g)[0] || ""
  );

  if (!beforePrize) return null;
  if (looksLikePrizeOnly(beforePrize)) return null;
  if (isInvalidWinnerName(beforePrize)) return null;

  const orgName = normalizeOrgDisplayName(beforePrize);

  if (!orgName) return null;

  const isRecognizedOrg =
    hasGGMarker ||
    isExactKnownOrgName(orgName) ||
    isKnownOrgName(orgName) ||
    Boolean(getManualOrgCityKey(orgName));

  if (!isRecognizedOrg) return null;

  return {
    type: "org",
    orgName,
    cityKey,
    rawLine: originalLine
  };
}
function parseHallWinnerLine(line = "", cityKey = "nobre", eventName = "Evento") {
    const originalLine = String(line || "");

    // Se o vencedor for uma menção Discord, ignora.
    // Ex: TOP 🥇 : | <@1420173743434498098>
    if (/<@!?\d+>/i.test(originalLine)) return null;

    const playerOrgPrizeWinner =
      parsePlayerOrgPrizeWinnerLine(
        originalLine,
        cityKey
      );

    if (playerOrgPrizeWinner) {
      return playerOrgPrizeWinner;
    }

    const placementOrgWinner =
      parsePlacementOrgWinnerLine(
        originalLine,
        cityKey
      );

    if (placementOrgWinner) {
      return placementOrgWinner;
    }

    const lineForOrgPrize = originalLine
      .replace(
        /\[([^\]\n]*)\]\(https?:\/\/[^)\s]+\)/g,
        "$1"
      )
      .replace(
        /\\([_~*])/g,
        "$1"
      );

    const orgPrizeParts =
      cleanHallWinnerLine(
        lineForOrgPrize
      )
        .split(/\s*\|\s*/g)
        .map(part =>
          normalizeHallDisplay(
            part
          )
        );

    const orgPrizeName =
      orgPrizeParts[0] ||
      "";

    const prizeParts =
      orgPrizeParts.slice(1);

    const inlinePlayerIdentity =
      extractWinnerIdentityFromParts([
        orgPrizeName
      ]);

    if (
      orgPrizeName &&
      !/^\d+$/.test(orgPrizeName) &&
      !looksLikePrizeOnly(orgPrizeName) &&
      !isInvalidWinnerName(orgPrizeName) &&
      !inlinePlayerIdentity?.playerId &&
      !extractOrgBetweenBraces(orgPrizeName) &&
      !extractOrgBetweenAngles(orgPrizeName) &&
      prizeParts.length > 0 &&
      prizeParts.every(part =>
        part &&
        looksLikePrizeOnly(part)
      )
    ) {
      return {
        type: "org",
        orgName:
          normalizeOrgDisplayName(
            orgPrizeName
          ),
        cityKey,
        rawLine:
          originalLine
      };
    }

    const topEmojiOrgWinner =
      parseTopEmojiOrgWinnerLine(
        originalLine,
        cityKey
      );

    if (topEmojiOrgWinner) {
      return topEmojiOrgWinner;
    }

    const cleanLineRaw =
      cleanHallWinnerLine(
        originalLine
      );

    const braceOrgName =
      extractOrgBetweenBraces(
        cleanLineRaw
      );

    const angleOrgName =
      extractOrgBetweenAngles(
        cleanLineRaw
      );

    const cleanLine =
      removeOrgBetweenAngles(
        removeOrgBetweenBraces(
          cleanLineRaw
        )
      );

    if (!cleanLine) return null;

    const pipePlayerOrgWinner = parsePipePlayerOrgWinnerLine(cleanLine, cityKey, originalLine);
    if (pipePlayerOrgWinner) return pipePlayerOrgWinner;

    const explicitOrgName = extractExplicitOrgNameFromWinnerLine(cleanLine, originalLine);

    if (
      explicitOrgName &&
      !looksLikePrizeOnly(explicitOrgName) &&
      !isInvalidWinnerName(explicitOrgName) &&
      (
        isOrgEventName(eventName, cityKey) ||
        isExactKnownOrgName(explicitOrgName) ||
        getManualOrgCityKey(explicitOrgName) ||
        hasHallGGWinnerMarker(originalLine)
      )
    ) {
      return {
        type: "org",
        orgName: explicitOrgName,
        cityKey,
        rawLine: originalLine
      };
    }
    const legacyPlayerOrg = cleanLine.match(/^(.+?)\s*\(([^)]+)\)\s*$/i);
    if (legacyPlayerOrg) {
      return {
        type: "player",
        playerName: normalizeHallDisplay(legacyPlayerOrg[1]),
        playerId: "",
        orgName: normalizeHallDisplay(legacyPlayerOrg[2]),
        cityKey,
        rawLine: originalLine
      };
    }

    const parts = cleanLine
      .split(/\s*\|\s*|\s*<\s*|\s*:\s*/g)
      .map(p => normalizeHallDisplay(p))
      .filter(Boolean);

    const identity = extractWinnerIdentityFromParts(parts);
    const id = identity?.playerId || "";
    const hasId = Boolean(id);

    if (hasId) {
      const idIndex = parts.findIndex(p => p === id || p.startsWith(`${id} `));
      const beforeId = parts.slice(0, idIndex).filter(p => !looksLikePrizeOnly(p));
      const afterId = parts.slice(idIndex + 1).filter(p => !looksLikePrizeOnly(p));

      const idPart = parts[idIndex] || "";
      const idPartRest = normalizeHallDisplay(idPart.replace(id, "")).trim();
      if (idPartRest && !looksLikePrizeOnly(idPartRest)) {
        afterId.unshift(idPartRest);
      }

      const playerName =
        identity?.playerName ||
        beforeId[0] ||
        cleanLine.match(/^(.+?)\s*\|\s*\d{2,}/)?.[1]?.trim() ||
        cleanLine.match(/^(.+?)\s*<\s*\d{2,}/)?.[1]?.trim() ||
        "Sem nome";

      const finalPlayerName = normalizeHallDisplay(playerName);

      const possibleOrg = afterId.find(p => {
        if (!p) return false;
        if (/^\d+$/.test(p)) return false;
        if (normalizeHallKey(p) === normalizeHallKey(finalPlayerName)) return false;
        if (looksLikePrizeOnly(p)) return false;
        if (isInvalidWinnerName(p)) return false;
        return isKnownOrgName(p) || getManualOrgCityKey(p);
      });

      return {
        type: "player",
        playerName: finalPlayerName,
        playerId: id,
        orgName: normalizeOrgDisplayName(braceOrgName || angleOrgName || (possibleOrg ? normalizeHallDisplay(possibleOrg) : "")),
        cityKey,
        rawLine: originalLine
      };
    }

    const nameOnly = parts.find(p => !looksLikePrizeOnly(p) && !isInvalidWinnerName(p)) || "";

    if (!nameOnly) return null;
    if (looksLikePrizeOnly(nameOnly)) return null;
    if (isInvalidWinnerName(nameOnly)) return null;

    const badWinnerName = normalizeHallName(nameOnly);
    if (
      badWinnerName.includes("mostrou habilidade") ||
      badWinnerName.includes("esperteza") ||
      badWinnerName.includes("sangue nos olhos") ||
      badWinnerName.includes("foi insano") ||
      badWinnerName.includes("como ficou depois") ||
      badWinnerName.includes("cidade 1")
    ) {
      return null;
    }

    const mixedPlayerOrg = extractPlayerOrgByKnownOrgName(nameOnly);

    if (mixedPlayerOrg) {
      return {
        type: "player",
        playerName: normalizeHallDisplay(mixedPlayerOrg.playerName),
        playerId: "",
        orgName: normalizeOrgDisplayName(mixedPlayerOrg.orgName),
        cityKey,
        rawLine: originalLine
      };
    }

    const shouldForceAsPlayer = isForcedPlayerName(nameOnly);

    if (shouldForceAsPlayer) {
      const fixedIdentity = resolvePlayerIdentityOverride("", nameOnly);

      return {
        type: "player",
        playerName: fixedIdentity.playerName || normalizeHallDisplay(nameOnly),
        playerId: fixedIdentity.playerId || "",
        orgName: normalizeOrgDisplayName(braceOrgName || angleOrgName || ""),
        cityKey,
        rawLine: originalLine
      };
    }

    const shouldCountAsOrg =
      isKnownOrgName(nameOnly);

    if (shouldCountAsOrg) {
      return {
        type: "org",
        orgName: normalizeOrgDisplayName(nameOnly),
        cityKey,
        rawLine: originalLine
      };
    }

    const possibleOrgNoId = parts.find(p => {
      if (!p) return false;
      if (p === nameOnly) return false;
      if (/^\d+$/.test(p)) return false;
      if (looksLikePrizeOnly(p)) return false;
      if (isInvalidWinnerName(p)) return false;

      return isKnownOrgName(p) || getManualOrgCityKey(p);
    });

    return {
      type: "player",
      playerName: normalizeHallDisplay(nameOnly),
      playerId: "",
      orgName: normalizeOrgDisplayName(braceOrgName || angleOrgName || (possibleOrgNoId ? normalizeHallDisplay(possibleOrgNoId) : "")),
      cityKey,
      rawLine: originalLine
    };
  }
  function extractInlineApplauseWinner(content = "", cityKey = "nobre") {
    const lines = String(content || "").split("\n").map(l => l.trim()).filter(Boolean);

    const line = lines.find(l => {
      const normalized = normalizeHallName(l);
      return normalized.includes("uma salva de palmas") && normalized.includes("brabo");
    });

    if (!line) return null;
    if (/<@!?\d+>/i.test(line)) return null;

    const cleaned = normalizeHallDisplay(stripDiscordNoise(line));
    const match =
      cleaned.match(/brabo\(a\)\s+(.+?)\s*$/i) ||
      cleaned.match(/brabo\s+(.+?)\s*$/i);

    const name = normalizeHallDisplay(match?.[1] || "")
      .replace(/👏/g, "")
      .trim();

    if (!name || name.length > 40) return null;

    return {
      type: "player",
      playerName: name,
      playerId: "",
      orgName: "",
      cityKey,
      rawLine: line
    };
  }

  function isClearTopWinnerLine(rawLine = "") {
    const raw = String(rawLine || "");
    const clean = normalizeHallName(cleanHallWinnerLine(raw));

    if (!clean) return false;
    if (!/^(\*\*)?\s*TOP\b/i.test(raw) && !/^TOP\b/i.test(stripDiscordNoise(raw))) return false;
    if (clean.includes("hall da fama")) return false;
    if (clean.includes("uma salva de palmas")) return false;
    if (clean.includes("foi insano")) return false;
    if (clean.includes("everyone")) return false;
    if (clean.includes("cidade")) return false;
    if (clean.includes("santacreators")) return false;

    return true;
  }

function isAmbiguousHallWinner(winner) {
    if (!winner) return false;

    if (winner.type === "player" && winner.playerId) {
      return false;
    }

    const rawLine = String(winner.rawLine || "");
    const raw = normalizeHallName(rawLine);
    const name = normalizeHallDisplay(winner.orgName || winner.playerName || "");

    if (!name) return false;

    if (winner.type === "org" && isKnownOrgName(name)) {
      return false;
    }

    if (winner.type === "org") {
      return false;
    }

    if (isClearTopWinnerLine(rawLine)) {
      return false;
    }

    if (
      raw.includes("vip") ||
      raw.includes("milhoes") ||
      raw.includes("milhao") ||
      raw.includes("kk") ||
      raw.includes("rolepass")
    ) {
      return true;
    }

    return false;
  }

  async function clearOldHallManualReviewMessages(client) {
    const reviewChannel = await client.channels.fetch(HALL_REVIEW_CHANNEL_ID).catch(() => null);
    if (!reviewChannel || !reviewChannel.isTextBased()) return;

    const messages = await reviewChannel.messages.fetch({ limit: 100 }).catch(() => null);
    if (!messages) return;

    const botReviewMessages = messages.filter((msg) => {
      if (!msg.author.bot || msg.author.id !== client.user.id) return false;

      const embedTitle = msg.embeds?.[0]?.title || "";
      const embedDescription = msg.embeds?.[0]?.description || "";

      const hasReviewButtons = msg.components?.some(row =>
        row.components?.some(btn =>
          String(btn.customId || "").startsWith(BTN_REVIEW_AS_ORG_PREFIX) ||
          String(btn.customId || "").startsWith(BTN_REVIEW_AS_PLAYER_PREFIX) ||
          String(btn.customId || "").startsWith(BTN_REVIEW_AS_BOTH_PREFIX) ||
          String(btn.customId || "").startsWith(BTN_REVIEW_CITY_PREFIX) ||
          String(btn.customId || "").startsWith(BTN_PLAYER_IDENTITY_MERGE_PREFIX) ||
          String(btn.customId || "").startsWith(BTN_PLAYER_IDENTITY_SEPARATE_PREFIX) ||
          String(btn.customId || "").startsWith(BTN_PAYMENT_CITY_PREFIX)
        )
      );

      return hasReviewButtons && (
        embedTitle.includes("Revisão Manual") ||
        embedTitle.includes("Revisão de identidade parecida") ||
        embedTitle.includes("Revisão obrigatória de cidade do player") ||
        embedDescription.includes("Esse vencedor ficou confuso") ||
        embedDescription.includes("A varredura encontrou conflito") ||
        embedDescription.includes("mesmo nome com IDs diferentes") ||
        embedDescription.includes("nomes parecidos / IDs diferentes")
      );
    });

    for (const msg of botReviewMessages.values()) {
      await msg.delete().catch(() => {});
    }
  }

  function getManualReviewTargets(entry = {}) {
    const rawLine = entry.rawLine || "";
    const cleanLine = cleanHallWinnerLine(rawLine);
    const both = extractPlayerOrgByKnownOrgName(cleanLine);

    const orgName = normalizeOrgDisplayName(
      both?.orgName ||
      (entry.type === "org" ? entry.name : "") ||
      findKnownOrgInsideWinnerName(cleanLine)
    );

    const playerName = cleanRankingPlayerName(
      both?.playerName ||
      (entry.type === "player" ? entry.name : "")
    );

    const playerId =
      entry.playerId ||
      cleanLine.match(/\|\s*(\d{1,10})\s*(?:\||$)/)?.[1] ||
      "";

    return {
      orgName,
      playerName,
      playerId
    };
  }

  async function sendHallWinnerToManualReview(client, winner, hallMeta) {
    const reviewChannel = await client.channels.fetch(HALL_REVIEW_CHANNEL_ID).catch(() => null);
    if (!reviewChannel || !reviewChannel.isTextBased()) return;

    const reviewId = `${hallMeta.messageId}_${normalizeHallKey(winner.rawLine || winner.orgName || winner.playerName)}`.slice(0, 80);

    const targets = getManualReviewTargets({
      type: winner.type,
      name: winner.orgName || winner.playerName || "",
      playerId: winner.playerId || "",
      rawLine: winner.rawLine || ""
    });

    const orgLine = targets.orgName || "Não identificado";
    const playerLine = targets.playerName
      ? `${targets.playerName}${targets.playerId ? ` | ID: ${targets.playerId}` : ""}`
      : "Não identificado";

    const embed = new EmbedBuilder()
      .setTitle("⚠️ Revisão Manual — Hall da Fama")
      .setColor("#f1c40f")
      .setDescription(
        `Esse vencedor ficou confuso para o filtro automático.\n\n` +
        `**Linha original:**\n\`${cleanHallWinnerLine(winner.rawLine || "Sem linha") || "Sem linha"}\`\n\n` +
        `**Quem receberia ponto:**\n` +
        `🏢 **ORG:** ${orgLine}\n` +
        `👤 **Pessoa:** ${playerLine}\n` +
        `🏢👤 **ORG + Pessoa:** ${orgLine} + ${playerLine}\n\n` +
        `**Evento:** ${hallMeta.eventName}\n` +
        `**Cidade:** ${hallMeta.cityName}\n` +
        `**Mensagem:** ${hallMeta.messageId}\n` +
        `**Link do Hall:** ${hallMeta.jumpUrl ? `[abrir Hall](${hallMeta.jumpUrl})` : "`sem link`"}`
      )
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${BTN_REVIEW_AS_ORG_PREFIX}${reviewId}`)
        .setLabel("🏢 Contar como ORG")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`${BTN_REVIEW_AS_PLAYER_PREFIX}${reviewId}`)
        .setLabel("👤 Contar como PESSOA")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`${BTN_REVIEW_AS_BOTH_PREFIX}${reviewId}`)
        .setLabel("🏢👤 Contar os 2")
        .setStyle(ButtonStyle.Secondary)
    );

    if (hallMeta.jumpUrl) {
      row.addComponents(
        new ButtonBuilder()
          .setLabel("🔗 Abrir Hall")
          .setStyle(ButtonStyle.Link)
          .setURL(hallMeta.jumpUrl)
      );
    }

    await reviewChannel.send({
      embeds: [embed],
      components: [row]
    }).catch(() => {});
  }

  function getMessageJumpUrl(message) {
    if (!message?.guildId || !message?.channelId || !message?.id) return "";
    return `https://discord.com/channels/${message.guildId}/${message.channelId}/${message.id}`;
  }

  function shortenEvidenceSource(source = "") {
    return String(source || "não identificada")
      .replaceAll(`canal:${EVENTOS_DIARIOS_CHANNEL_ID}:msg:`, "Eventos Diários: ")
      .replaceAll("cronograma_state:", "Cronograma: ")
      .replaceAll("org_override:", "ORG fixa: ")
      .replaceAll("org_historico:", "Histórico da ORG: ")
      .replaceAll("texto_do_hall", "Texto do Hall")
      .replaceAll("conflito_evidencias:", "Conflito: ")
      .replaceAll("voto_evidencias:", "Votação: ")
      .slice(0, 900);
  }

  async function findReviewContextMessages(client, hallMessage, eventName = "Evento") {
    const eventosMsg = await findNearbyEventosDiariosMessage(client, hallMessage, eventName).catch(() => null);

    const cronoChannel = await client.channels.fetch(CRONO_PANEL_CHANNEL_ID).catch(() => null);
    const cronoMsg = cronoChannel?.isTextBased()
      ? (await cronoChannel.messages.fetch({ limit: 20 }).catch(() => null))
          ?.filter(m => m.author?.bot)
          ?.sort((a, b) => b.createdTimestamp - a.createdTimestamp)
          ?.first()
      : null;

    return { eventosMsg, cronoMsg };
  }

  async function sendHallCityToManualReview(client, hallMessage, evidence, currentCityKey) {
    const reviewChannel = await client.channels.fetch(HALL_REVIEW_CHANNEL_ID).catch(() => null);
    if (!reviewChannel || !reviewChannel.isTextBased()) return;

    const confirmed = state.confirmedCityReviews?.[hallMessage.id];
    if (confirmed) return;

    const already = state.pendingCityReviews?.[hallMessage.id];
    if (already) return;

    state.pendingCityReviews ??= {};
    state.pendingCityReviews[hallMessage.id] = {
      messageId: hallMessage.id,
      suggestedCityKey: evidence?.cityKey || "",
      conflictWithCityKey: evidence?.conflictWithCityKey || "",
      currentCityKey: currentCityKey || "",
      eventName: evidence?.eventName || "Evento",
      source: evidence?.source || "não identificada",
      confidence: evidence?.confidence || 0,
      createdAt: Date.now()
    };
    saveState(state);

    const row = new ActionRowBuilder().addComponents(
      Object.entries(CITIES).map(([cityKey, city]) =>
        new ButtonBuilder()
          .setCustomId(`${BTN_REVIEW_CITY_PREFIX}${cityKey}_${hallMessage.id}`)
          .setLabel(city.label.replace("Cidade ", ""))
          .setStyle(cityKey === evidence?.cityKey ? ButtonStyle.Success : ButtonStyle.Secondary)
          .setEmoji(city.emoji)
      )
    );

    const { eventosMsg, cronoMsg } = await findReviewContextMessages(client, hallMessage, evidence?.eventName || "Evento");

    const hallUrl = getMessageJumpUrl(hallMessage);
    const eventosUrl = eventosMsg ? getMessageJumpUrl(eventosMsg) : "";
    const cronoUrl = cronoMsg ? getMessageJumpUrl(cronoMsg) : "";

    const hallText = normalizeHallDisplay(getHallMessageText(hallMessage)).slice(0, 900);
    const eventosText = eventosMsg ? normalizeHallDisplay(getHallMessageText(eventosMsg)).slice(0, 700) : "Não encontrado próximo do Hall.";
    const sourceText = shortenEvidenceSource(evidence?.source || "");

    const embed = new EmbedBuilder()
      .setTitle("⚠️ Revisão Manual — Cidade do Hall")
      .setColor("#f1c40f")
      .setDescription(
        `A varredura encontrou conflito e **não editou automaticamente**.\n\n` +
        `🔗 **Links úteis**\n` +
        `• Hall: ${hallUrl ? `[abrir Hall](${hallUrl})` : "`sem link`"}\n` +
        `• Eventos Diários: ${eventosUrl ? `[abrir evento diário](${eventosUrl})` : "`não encontrado`"}\n` +
        `• Cronograma: ${cronoUrl ? `[abrir cronograma](${cronoUrl})` : `<#${CRONO_PANEL_CHANNEL_ID}>`}\n\n` +
        `📌 **Decisão sugerida**\n` +
        `• Cidade atual no Hall: **${CITIES[currentCityKey]?.label || currentCityKey || "Não identificada"}**\n` +
        `• Sugestão do filtro: **${CITIES[evidence?.cityKey]?.label || "Sem sugestão"}**\n` +
        `• Conflito com: **${CITIES[evidence?.conflictWithCityKey]?.label || "Sem conflito identificado"}**\n` +
        `• Evento: **${evidence?.eventName || "Evento"}**\n` +
        `• Confiança: **${evidence?.confidence || 0}%**\n\n` +
        `🧠 **Fonte resumida**\n` +
        `\`\`\`${sourceText}\`\`\`\n` +
        `📄 **Trecho do Hall**\n` +
        `\`\`\`${hallText}\`\`\`\n` +
        `📅 **Trecho do Eventos Diários**\n` +
        `\`\`\`${eventosText}\`\`\`\n` +
        `Escolha a CDD correta nos botões abaixo.`
      )
      .setFooter({ text: `Mensagem Hall: ${hallMessage.id}` })
      .setTimestamp();

    await reviewChannel.send({
      embeds: [embed],
      components: [row]
    }).catch(() => {});
  }

  function replaceCityMentionsInContent(content = "", cityKey = "nobre") {
    const cityData = CITIES[cityKey] || CITIES.nobre;
    let fixed = String(content || "");

    for (const city of Object.values(CITIES)) {
      fixed = fixed.replace(new RegExp(`<@&${city.roleId}>`, "g"), `<@&${cityData.roleId}>`);
    }

    fixed = fixed
      .replace(/\bCIDADE\s+NOBRE\b/gi, cityData.label.toUpperCase())
      .replace(/\bCIDADE\s+SANTA\b/gi, cityData.label.toUpperCase())
      .replace(/\bCIDADE\s+GRANDE\b/gi, cityData.label.toUpperCase())
      .replace(/\bCIDADE\s+MARESIA\b/gi, cityData.label.toUpperCase())
      .replace(/\bCidade\s+Nobre\b/g, cityData.label)
      .replace(/\bCidade\s+Santa\b/g, cityData.label)
      .replace(/\bCidade\s+Grande\b/g, cityData.label)
      .replace(/\bCidade\s+Maresia\b/g, cityData.label);

    if (!fixed.includes(`<@&${cityData.roleId}>`)) {
      fixed = `${fixed.trim()}\n\n||@everyone @here <@&${ROLE_CIDADAO}> <@&${ROLE_LIDERES}> <@&${cityData.roleId}>||`;
    }

    fixed = fixed.replace(
      /(?<!\|\|)(@everyone\s+@here\s+<@&\d+>\s+<@&\d+>\s+<@&\d+>)(?!\|\|)/gi,
      "||$1||"
    );

    return fixed.trim();
  }

  async function findNearbyEventosDiariosMessage(client, hallMessage, eventName = "Evento") {
    const channel = await client.channels.fetch(EVENTOS_DIARIOS_CHANNEL_ID).catch(() => null);
    if (!channel || !channel.isTextBased()) return null;

    const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
    if (!messages) return null;

    const hallTs = hallMessage.createdTimestamp || Date.now();

    return [...messages.values()]
      .filter(msg => {
        const diffMs = hallTs - (msg.createdTimestamp || 0);

        // ✅ Eventos Diários precisa estar próximo do Hall:
        // pode ser antes do Hall, no mesmo dia, ou virada/madrugada anterior.
        if (diffMs < -1000 * 60 * 30) return false;
        if (diffMs > 1000 * 60 * 60 * 10) return false;

        const text = getHallMessageText(msg);
        const rawEvent = extractRawHallEventName(text);

        return isSameNormalizedEventName(rawEvent, eventName);
      })
      .sort((a, b) => Math.abs(hallTs - a.createdTimestamp) - Math.abs(hallTs - b.createdTimestamp))
      .at(0) || null;
  }

  async function autoFixEventosDiariosCityIfNeeded(client, hallMessage, evidence) {
    if (!evidence?.cityKey || !evidence?.eventName) return false;

    const eventosMsg = await findNearbyEventosDiariosMessage(client, hallMessage, evidence.eventName);
    if (!eventosMsg) return false;

    const currentText = getHallMessageText(eventosMsg);
    const currentCityKey = detectHallCityKey(currentText);

    if (currentCityKey === evidence.cityKey) return false;

    const fixedContent = replaceCityMentionsInContent(eventosMsg.content || currentText, evidence.cityKey);

    if (!fixedContent || fixedContent.length > 2000 || fixedContent === eventosMsg.content) return false;

    const editedMsg = await eventosMsg.edit({ content: fixedContent }).catch(() => null);
    if (!editedMsg) return false;

    await sendHallScanLog(client, {
      title: "📅 Eventos Diários corrigido",
      color: "#2ecc71",
      description:
        `A cidade/cargo do Eventos Diários também foi corrigida porque o Hall da Fama confirmou outra CDD.\n\n` +
        `Mensagem Eventos Diários: \`${eventosMsg.id}\`\n` +
        `Mensagem Hall da Fama: \`${hallMessage.id}\`\n` +
        `Evento: **${evidence.eventName}**\n` +
        `Cidade antiga: **${CITIES[currentCityKey]?.label || currentCityKey}**\n` +
        `Cidade nova: **${CITIES[evidence.cityKey]?.label || evidence.cityKey}**\n` +
        `Fonte: **${evidence.source || "não identificada"}**\n` +
        `Confiança: **${evidence.confidence || 0}%**`,
      phase: "Correção Eventos Diários"
    });

    return true;
  }

  function parseHallWinners(content = "", cityKey = "nobre") {
    const lines = extractHallWinnerLines(content);
    const winners = [];
    const eventName = normalizeHallEventName(extractRawHallEventName(content), cityKey);

    for (const line of lines) {
      const parsed = parseHallWinnerLine(line, cityKey, eventName);
      if (!parsed) continue;

      winners.push(parsed);
    }

    if (winners.length === 0) {
      const inlineWinner = extractInlineApplauseWinner(content, cityKey);
      if (inlineWinner) winners.push(inlineWinner);
    }

    return winners;
  }

  function getPlayerRankingKey(player) {
    const identityKey = getPlayerIdentityKey(player.playerId || "", player.playerName || "");

    if (identityKey.startsWith("idname:")) {
      return `${identityKey}:${player.cityKey || "sem-cidade"}`;
    }

    if (identityKey.startsWith("id:")) {
      return identityKey;
    }

    return `${identityKey}:${player.cityKey || "sem-cidade"}`;
  }
  function getOrgRankingKey(orgName = "", cityKey = "nobre") {
    const finalOrgName = normalizeOrgDisplayName(orgName);
    const finalCityKey = getManualOrgCityKey(finalOrgName) || cityKey || "nobre";

    return `${finalCityKey}:${normalizeHallKey(finalOrgName)}`;
  }

  function dedupeHallWinners(winners = []) {
    const seenPlayers = new Set();
    const seenOrgs = new Set();

    const finalWinners = {
      players: [],
      orgs: []
    };

    for (const winner of winners) {
      if (winner.type === "player") {
        const playerKey = getPlayerRankingKey(winner);

        if (!seenPlayers.has(playerKey)) {
          seenPlayers.add(playerKey);
          finalWinners.players.push(winner);
        }

        if (winner.orgName) {
          const orgKey = getOrgRankingKey(winner.orgName, winner.cityKey);

          if (!seenOrgs.has(orgKey)) {
            seenOrgs.add(orgKey);
            finalWinners.orgs.push({
              type: "org",
              orgName: winner.orgName,
              cityKey: winner.cityKey,
              rawLine: winner.rawLine
            });
          }
        }

        continue;
      }
      if (winner.type === "org") {
        const orgKey = getOrgRankingKey(winner.orgName, winner.cityKey);

        if (!seenOrgs.has(orgKey)) {
          seenOrgs.add(orgKey);
          finalWinners.orgs.push(winner);
        }
      }
    }

    return finalWinners;
  }

function createEmptyHallRankingData(previousData = null) {
    return {
      orgs: previousData?.orgs || {},
      players: previousData?.players || {},
      reviewedMessages: previousData?.reviewedMessages || {},
      reviewedPaymentMessages: previousData?.reviewedPaymentMessages || {},
      paymentEventKeys: previousData?.paymentEventKeys || {},
      pendingPaymentCityReview: previousData?.pendingPaymentCityReview || {},
      pendingPlayerIdentityReview: previousData?.pendingPlayerIdentityReview || {},
      manualPlayerIdentityMerges: previousData?.manualPlayerIdentityMerges || {},
      manualPlayerCityOverrides: previousData?.manualPlayerCityOverrides || {},
      pendingReview: {},
      manualReviews: previousData?.manualReviews || {},
      lastUpdatedAt: Date.now()
    };
  }

  function removeFetchedHallRankingData(rankings, fetchedMessageIds = new Set()) {
    if (!rankings || !fetchedMessageIds?.size) return rankings;

    for (const key of Object.keys(rankings.orgs || {})) {
      const org = rankings.orgs[key];

      org.halls = (org.halls || []).filter(hall => !fetchedMessageIds.has(hall.messageId));

      org.total = org.halls.length;
      org.events = {};

      for (const hall of org.halls) {
        const eventName = normalizeHallEventName(hall.eventName, hall.cityKey || org.cityKey || "nobre");
        org.events[eventName] ??= 0;
        org.events[eventName] += 1;
      }

      if (org.total <= 0) {
        delete rankings.orgs[key];
      }
    }

    for (const key of Object.keys(rankings.players || {})) {
      const player = rankings.players[key];

      player.halls = (player.halls || []).filter(hall => !fetchedMessageIds.has(hall.messageId));

      player.total = player.halls.length;
      player.events = {};

      for (const hall of player.halls) {
        const eventName = normalizeHallEventName(hall.eventName, hall.cityKey || player.cityKey || "nobre");
        player.events[eventName] ??= 0;
        player.events[eventName] += 1;
      }

      if (player.total <= 0) {
        delete rankings.players[key];
      }
    }

    for (const messageId of fetchedMessageIds) {
      delete rankings.reviewedMessages[messageId];
    }

    return rankings;
  }

  function removeSingleHallRankingData(rankings, messageId = "") {
    if (!rankings || !messageId) return rankings;

    for (const key of Object.keys(rankings.orgs || {})) {
      const org = rankings.orgs[key];

      org.halls = (org.halls || []).filter(hall => hall.messageId !== messageId);

      org.total = org.halls.length;
      org.events = {};

      for (const hall of org.halls) {
        const eventName = normalizeHallEventName(hall.eventName, hall.cityKey || org.cityKey || "nobre");
        org.events[eventName] ??= 0;
        org.events[eventName] += 1;
      }

      if (org.total <= 0) {
        delete rankings.orgs[key];
      }
    }

    for (const key of Object.keys(rankings.players || {})) {
      const player = rankings.players[key];

      player.halls = (player.halls || []).filter(hall => hall.messageId !== messageId);

      player.total = player.halls.length;
      player.events = {};

      for (const hall of player.halls) {
        const eventName = normalizeHallEventName(hall.eventName, hall.cityKey || player.cityKey || "nobre");
        player.events[eventName] ??= 0;
        player.events[eventName] += 1;
      }

      if (player.total <= 0) {
        delete rankings.players[key];
      }
    }

    delete rankings.reviewedMessages?.[messageId];

    return rankings;
  }

function resolveRankingCityKey(primaryCityKey = "", cityName = "", fallbackCityKey = "nobre") {
  const directPrimary = String(primaryCityKey || "").trim().toLowerCase();

  if (CITIES[directPrimary]) {
    return directPrimary;
  }

  const byCityName = resolveCityKeyFromName(cityName || "");
  if (byCityName && CITIES[byCityName]) {
    return byCityName;
  }

  const directFallback = String(fallbackCityKey || "").trim().toLowerCase();

  if (CITIES[directFallback]) {
    return directFallback;
  }

  return "nobre";
}

function addOrgRankingPoint(rankings, orgWinner, hallMeta) {
  const orgName = normalizeOrgDisplayName(orgWinner.orgName);
  if (!orgName) return;
  if (isInvalidWinnerName(orgName)) return;
  if (looksLikePrizeOnly(orgName)) return;
  if (/^\d+\s*(kk|k|mil|milh[oõ]es|milh[aã]o)\b/i.test(normalizeHallName(orgName))) return;
  if (/\b(vip|vips|rolepass|pass|gente boa|evento ouro|evento prata)\b/i.test(normalizeHallName(orgName))) return;

const cityKey =
  getManualOrgCityKey(orgName) ||
  resolveRankingCityKey(orgWinner.cityKey, orgWinner.cityName, hallMeta.cityKey);

const key = getOrgRankingKey(orgName, cityKey);
const cityName = CITIES[cityKey]?.label || "Cidade Nobre";
const eventName = normalizeHallEventName(hallMeta.eventName, cityKey);

    rankings.orgs[key] ??= {
      key,
      name: orgName,
      cityKey,
      cityName,
      total: 0,
      events: {},
      halls: []
    };

    rankings.orgs[key].name = rankings.orgs[key].name || orgName;
    rankings.orgs[key].cityKey = cityKey;
    rankings.orgs[key].cityName = cityName;
    rankings.orgs[key].total += 1;

    rankings.orgs[key].events[eventName] ??= 0;
    rankings.orgs[key].events[eventName] += 1;

    rankings.orgs[key].halls.push({
      messageId: hallMeta.messageId,
      eventName,
      cityKey,
      cityName,
      at: hallMeta.createdTimestamp || Date.now()
    });
  }

function addPlayerRankingPoint(rankings, playerWinner, hallMeta) {
  const rawPlayerName = cleanRankingPlayerName(playerWinner.playerName);
  const fixedIdentity = resolvePlayerIdentityOverride(playerWinner.playerId, rawPlayerName);
  const playerName = fixedIdentity.playerName;
  const playerId = fixedIdentity.playerId;

  if (!playerName) return;
  if (isInvalidWinnerName(playerName)) return;
  if (looksLikePrizeOnly(playerName)) return;

    const cityKey =
      getManualPlayerCityKeySmart(playerId, playerName) ||
      playerWinner.cityKey ||
      hallMeta.cityKey ||
      "nobre";

    const key = getPlayerRankingKey({
      ...playerWinner,
      playerName,
      playerId,
      cityKey
    });

    const cityName = CITIES[cityKey]?.label || "Cidade Nobre";

    rankings.players[key] ??= {
      key,
      name: playerName,
      playerId: playerId || "",
      cityKey,
      cityName,
      total: 0,
      events: {},
      halls: []
    };

    rankings.players[key].name = playerName;

    if (!rankings.players[key].playerId && playerId) {
      rankings.players[key].playerId = playerId;
    }

    rankings.players[key].cityKey = cityKey;
    rankings.players[key].cityName = cityName;

    const eventName = normalizeHallEventName(hallMeta.eventName, cityKey);
    const uniqueKey = `${hallMeta.messageId || hallMeta.jumpUrl || hallMeta.createdTimestamp}:${eventName}:${cityKey}`;

    const alreadyCounted = (rankings.players[key].halls || []).some(hall => {
      const hallEventName = normalizeHallEventName(hall.eventName, hall.cityKey || cityKey);
      const hallCityKey = hall.cityKey || cityKey;
      const hallUniqueKey = `${hall.messageId || hall.jumpUrl || hall.at}:${hallEventName}:${hallCityKey}`;

      return hallUniqueKey === uniqueKey;
    });

    if (alreadyCounted) return;

    rankings.players[key].total += 1;

    rankings.players[key].events[eventName] ??= 0;
    rankings.players[key].events[eventName] += 1;

    rankings.players[key].halls.push({
      messageId: hallMeta.messageId,
      eventName,
      cityKey,
      cityName,
      at: hallMeta.createdTimestamp || Date.now()
    });
  }

  function getPaymentEmbedText(message) {
    const embedText = message?.embeds
      ?.map(embed => {
        const fieldsText = (embed.fields || [])
          .map(field => `${field.name || ""}\n${field.value || ""}`)
          .join("\n");

        return [
          embed.title || "",
          embed.description || "",
          fieldsText,
          embed.footer?.text || "",
          embed.author?.name || ""
        ].filter(Boolean).join("\n");
      })
      .join("\n") || "";

    return [
      message?.content || "",
      embedText
    ].filter(Boolean).join("\n").trim();
  }

  function extractPaymentValueFromText(text = "", labels = []) {
    const lines = String(text || "")
      .split("\n")
      .map(line => cleanOneLine(stripDiscordNoise(line)))
      .filter(Boolean);

    for (let i = 0; i < lines.length; i++) {
      const normalizedLine = normalizeHallName(lines[i]);

      const found = labels.some(label => normalizedLine === normalizeHallName(label));

      if (found) {
        return cleanOneLine(lines[i + 1] || "");
      }
    }

    return "";
  }

  function getPaymentFieldValue(message, labels = []) {
    const embed = message?.embeds?.[0];
    const labelList = Array.isArray(labels) ? labels : [labels];

    const field = embed?.fields?.find(f => {
      const fieldName = normalizeHallName(f.name || "");

      return labelList.some(label => {
        const wanted = normalizeHallName(label);
        return fieldName === wanted || fieldName.includes(wanted);
      });
    });

    if (field?.value) return cleanOneLine(field.value);

    return extractPaymentValueFromText(getPaymentEmbedText(message), labelList);
  }

  function parsePaymentWinner(value = "") {
    const clean = normalizeHallDisplay(stripDiscordNoise(value));

    const nameThenId = clean.match(/^(.+?)\s*[|/\\]\s*(\d{1,12})\b/i);
    if (nameThenId) {
      return {
        playerName: cleanRankingPlayerName(nameThenId[1]),
        playerId: String(nameThenId[2] || "").trim()
      };
    }

    const idThenName = clean.match(/^(\d{1,12})\s*[|/\\]\s*(.+?)$/i);
    if (idThenName) {
      return {
        playerName: cleanRankingPlayerName(idThenName[2]),
        playerId: String(idThenName[1] || "").trim()
      };
    }

    return {
      playerName: cleanRankingPlayerName(clean),
      playerId: ""
    };
  }

  function normalizePaymentDateKey(value = "", fallbackTimestamp = Date.now()) {
    const raw = cleanOneLine(value);

    let match = raw.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
    if (match) {
      return `${String(match[1]).padStart(2, "0")}/${String(match[2]).padStart(2, "0")}/${match[3]}`;
    }

    match = raw.match(/\b(\d{1,2})\/(\d{1,2})\b/);
    if (match) {
      const year = new Date(fallbackTimestamp).toLocaleDateString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        year: "numeric"
      });

      return `${String(match[1]).padStart(2, "0")}/${String(match[2]).padStart(2, "0")}/${year}`;
    }

    return new Date(fallbackTimestamp).toLocaleDateString("pt-BR", {
      timeZone: "America/Sao_Paulo"
    });
  }

  function paymentDateKeyToTimestamp(dateKey = "") {
    const match = String(dateKey || "").match(/^(\d{2})\/(\d{2})\/(20\d{2})$/);
    if (!match) return 0;

    return new Date(`${match[3]}-${match[2]}-${match[1]}T12:00:00-03:00`).getTime();
  }

  function isSameOrClosePaymentDate(a = "", b = "") {
    const timeA = paymentDateKeyToTimestamp(a);
    const timeB = paymentDateKeyToTimestamp(b);

    if (!timeA || !timeB) return a === b;

    return Math.abs(timeA - timeB) <= 1000 * 60 * 60 * 36;
  }

function getPaymentCityKeyFromDiscordLinks(text = "") {
  const raw = String(text || "");

  const links = [...raw.matchAll(/discord\.com\/channels\/(\d+)\/(\d+)(?:\/\d+)?/gi)];

  for (const match of links) {
    const guildId = match[1];
    const channelId = match[2];
    const key = `${guildId}:${channelId}`;
    const cityKey = PAYMENT_CITY_BY_DISCORD_CHANNEL[key];

    if (cityKey && CITIES[cityKey]) return cityKey;
  }

  return null;
}

function getPaymentCityKey(message, winner = null) {
    const fullText = getPaymentEmbedText(message);
    const embed = message?.embeds?.[0];

    const cityField = embed?.fields?.find(field => {
      const fieldName = normalizeHallName(field.name || "");
      return fieldName.includes("cidade") || fieldName.includes("cdd");
    });

    const cityText = String(cityField?.value || "").trim();
    const normalized = normalizeHallName(cityText);

    if (cityText && !normalized.includes("nao definida") && !normalized.includes("não definida")) {
      if (cityText.includes(CITIES.nobre.roleId) || /\bnobre\b/.test(normalized)) return "nobre";
      if (cityText.includes(CITIES.santa.roleId) || /\bsanta\b/.test(normalized)) return "santa";
      if (cityText.includes(CITIES.grande.roleId) || /\bgrande\b/.test(normalized)) return "grande";
      if (cityText.includes(CITIES.maresia.roleId) || /\bmaresia\b/.test(normalized)) return "maresia";
    }

    const cityByDiscordLink = getPaymentCityKeyFromDiscordLinks(fullText);
    if (cityByDiscordLink) return cityByDiscordLink;

    const winnerManualCity =
      getManualPlayerCityKey(winner?.playerId || "") ||
      getManualPlayerCityKeyByName(winner?.playerName || "");

    if (winnerManualCity && CITIES[winnerManualCity]) return winnerManualCity;

    const prizeText = getPaymentFieldValue(message, [
      "Premiação",
      "🎁 Premiação",
      ":gift: Premiação",
      "Premiação / Link",
      "🔗 Premiação / Link",
      ":link: Premiação / Link",
      "Link",
      "🔗 Link",
      ":link: Link"
    ]);

    const normalizedPrize = normalizeHallName(prizeText);

    if (prizeText && !normalizedPrize.includes("nao definida") && !normalizedPrize.includes("não definida")) {
      if (prizeText.includes(CITIES.nobre.roleId) || /\bnobre\b/.test(normalizedPrize)) return "nobre";
      if (prizeText.includes(CITIES.santa.roleId) || /\bsanta\b/.test(normalizedPrize)) return "santa";
      if (prizeText.includes(CITIES.grande.roleId) || /\bgrande\b/.test(normalizedPrize)) return "grande";
      if (prizeText.includes(CITIES.maresia.roleId) || /\bmaresia\b/.test(normalizedPrize)) return "maresia";
    }

    return null;
  }

  function isPaymentApproved(message) {
    const rawText = getPaymentEmbedText(message);
    const text = normalizeHallName(rawText);

    if (!text.includes("registro de pagamento de evento")) return false;

    if (text.includes("reprovado")) return false;
    if (text.includes("recusado")) return false;
    if (text.includes("nao pago")) return false;
    if (text.includes("não pago")) return false;
    if (text.includes("errado")) return false;
    if (text.includes("fez errado")) return false;

    const hasApprovedStatus =
      /✅\s*pago/i.test(rawText) ||
      /\bstatus\s+✅?\s*pago\b/i.test(text) ||
      /\bultima decisao\s+pago por\b/i.test(text) ||
      /\bultima decisão\s+pago por\b/i.test(rawText.toLowerCase()) ||
      /\bpago por\b/i.test(text);

    return hasApprovedStatus;
  }

  function getPaymentPlayerKey(playerId = "", playerName = "") {
    const fixedIdentity = resolvePlayerIdentityOverride(playerId, playerName);
    const fixedPlayerId = fixedIdentity.playerId;
    const fixedPlayerName = fixedIdentity.playerName;

    return getPlayerIdentityKey(fixedPlayerId, fixedPlayerName);
  }

  function getPaymentEventKey({ eventName, eventDateKey, cityKey, playerId, playerName }) {
    const playerKey = getPaymentPlayerKey(playerId, playerName);

    return [
      normalizeHallKey(eventName),
      eventDateKey,
      cityKey || "sem-cidade",
      playerKey
    ].join("|");
  }

  function findDuplicateNearbyPaymentEvent(rankings, { eventName, eventDateKey, cityKey, playerId, playerName, createdTimestamp, messageId }) {
    const eventKey = normalizeHallKey(eventName);
    const playerKey = getPaymentPlayerKey(playerId, playerName);
    const currentTs = Number(createdTimestamp || 0);
    const THREE_HOURS_MS = 1000 * 60 * 60 * 3;

    for (const payment of Object.values(rankings.paymentEventKeys || {})) {
      if (!payment) continue;
      if (payment.messageId === messageId) continue;

      const sameEvent = normalizeHallKey(payment.eventName || "") === eventKey;
      const sameCity = payment.cityKey === cityKey;
      const samePlayer = getPaymentPlayerKey(payment.playerId || "", payment.playerName || "") === playerKey;
      const sameOrCloseDate = isSameOrClosePaymentDate(payment.eventDateKey || "", eventDateKey);

      if (!sameEvent || !sameCity || !samePlayer || !sameOrCloseDate) continue;

      const oldTs = Number(payment.createdTimestamp || payment.at || 0);

      if (oldTs && currentTs) {
        if (Math.abs(currentTs - oldTs) <= THREE_HOURS_MS) return payment;
        continue;
      }

      return payment;
    }

    return null;
  }

  function playerAlreadyHasHallForEvent(rankings, { eventName, eventDateKey, cityKey, playerId, playerName }) {
    const playerKey = getPlayerRankingKey({
      playerName,
      playerId,
      cityKey
    });

    const player = rankings.players?.[playerKey];
    if (!player?.halls?.length) return false;

    const eventKey = normalizeHallKey(eventName);

    return player.halls.some(hall => {
      const hallEventKey = normalizeHallKey(hall.eventName || "");
      const hallDateKey = new Date(hall.at || Date.now()).toLocaleDateString("pt-BR", {
        timeZone: "America/Sao_Paulo"
      });

      return (
        hallEventKey === eventKey &&
        hall.cityKey === cityKey &&
        isSameOrClosePaymentDate(hallDateKey, eventDateKey)
      );
    });
  }

  function rebuildPaymentPlayerPointsFromZero(rankings) {
    const paymentMessageIds = new Set();

    for (const payment of Object.values(rankings.paymentEventKeys || {})) {
      if (payment?.messageId) paymentMessageIds.add(payment.messageId);
    }

    for (const [messageId, review] of Object.entries(rankings.reviewedPaymentMessages || {})) {
      if (review && review.skipped === false) paymentMessageIds.add(messageId);
    }

    if (paymentMessageIds.size) {
      for (const player of Object.values(rankings.players || {})) {
        player.halls = (player.halls || []).filter(hall => !paymentMessageIds.has(hall.messageId));

        player.total = player.halls.length;
        player.events = {};

        for (const hall of player.halls) {
          const eventName = normalizeHallEventName(hall.eventName, hall.cityKey || player.cityKey || "nobre");
          player.events[eventName] ??= 0;
          player.events[eventName] += 1;
        }
      }
    }

    rankings.reviewedPaymentMessages = {};
    rankings.paymentEventKeys = {};

    return rankings;
  }

  async function sendPaymentCityReviewOnce(client, rankings, message, winner, eventName, eventDateKey) {
    const playerReviewKey = winner.playerId
      ? `id:${winner.playerId}`
      : `name:${normalizeHallKey(winner.playerName)}`;

    if (!playerReviewKey) return;

    rankings.pendingPaymentCityReview ??= {};

    const storedCityKey = getStoredManualPlayerCityKey(rankings, winner.playerId || "", winner.playerName || "");
    if (storedCityKey) return;

    const detectedCityKey = getPaymentCityKey(message, winner);
    if (detectedCityKey) return;

    if (rankings.pendingPaymentCityReview[playerReviewKey]) return;

    rankings.pendingPaymentCityReview[playerReviewKey] = {
      playerReviewKey,
      playerName: winner.playerName,
      playerId: winner.playerId || "",
      eventName,
      eventDateKey,
      messageId: message.id,
      jumpUrl: getMessageJumpUrl(message),
      createdAt: Date.now()
    };

    const ch = await client.channels.fetch(PAYMENT_CITY_REVIEW_CHANNEL_ID).catch(() => null);
    if (!ch || !ch.isTextBased()) return;

    const row = new ActionRowBuilder().addComponents(
  Object.entries(CITIES).map(([cityKey, city]) =>
    new ButtonBuilder()
      .setCustomId(`${BTN_PAYMENT_CITY_PREFIX}${playerReviewKey}:${cityKey}`)
      .setLabel(city.label.replace("Cidade ", ""))
      .setEmoji(city.emoji)
      .setStyle(ButtonStyle.Secondary)
  )
);

await ch.send({
  content:
    `⚠️ **Pagamento sem CDD identificado**\n\n` +
    `👤 Player: **${winner.playerName}** ${winner.playerId ? `| \`${winner.playerId}\`` : ""}\n` +
    `🏁 Evento: **${eventName}**\n` +
    `📅 Data do Evento: **${eventDateKey}**\n` +
    `🔗 Registro: ${getMessageJumpUrl(message)}\n\n` +
    `Escolha a cidade correta abaixo. O registro original será editado automaticamente.`,
  components: [row]
}).catch(() => {});
  }

async function sendRequiredPlayerCityReviewIfNeeded(client, rankings, playerData, reason = "mais_de_3_vitorias") {
  if (!client || !playerData?.playerId) return;

  const playerId = String(playerData.playerId || "").trim();
  const playerName = cleanRankingPlayerName(playerData.name || playerData.playerName || "");
  if (!playerId) return;

  const total = Number(playerData.total || 0);

  // ✅ Mais de 3 vitórias = 4 ou mais
  if (total <= 3) return;

  rankings.pendingPaymentCityReview ??= {};
  rankings.manualPlayerCityOverrides ??= {};

  const playerReviewKey = `id:${playerId}`;
  if (rankings.pendingPaymentCityReview[playerReviewKey]) return;

  const hasManualCity =
    getManualPlayerCityKey(playerId) ||
    getManualPlayerCityKeyByName(playerName) ||
    getStoredManualPlayerCityKey(rankings, playerId, playerName);

  if (hasManualCity) return;

  const suggestedCityKey = total >= 5 ? "nobre" : "";
  const latestHall = getPlayerLatestHall(playerData);
  const latestLink = getPlayerLatestLink(playerData);

  rankings.pendingPaymentCityReview[playerReviewKey] = {
    playerReviewKey,
    playerName,
    playerId,
    eventName: "Revisão obrigatória por acúmulo de vitórias",
    eventDateKey: new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }),
    messageId: latestHall?.messageId || "",
    channelId: latestHall?.channelId || "",
    guildId: latestHall?.guildId || "",
    jumpUrl: latestLink || "",
    createdAt: Date.now(),
    reason,
    suggestedCityKey,
    total
  };

  const ch = await client.channels.fetch(PAYMENT_CITY_REVIEW_CHANNEL_ID).catch(() => null);
  if (!ch || !ch.isTextBased()) return;

  const row = new ActionRowBuilder().addComponents(
    Object.entries(CITIES).map(([cityKey, city]) =>
      new ButtonBuilder()
        .setCustomId(`${BTN_PAYMENT_CITY_PREFIX}${playerReviewKey}:${cityKey}`)
        .setLabel(city.label.replace("Cidade ", ""))
        .setEmoji(city.emoji)
        .setStyle(cityKey === suggestedCityKey ? ButtonStyle.Success : ButtonStyle.Secondary)
    )
  );

  const reviewEmbed = new EmbedBuilder()
    .setColor(suggestedCityKey ? "#e74c3c" : "#f1c40f")
    .setTitle("⚠️ Revisão obrigatória de cidade do player")
    .setDescription(
      suggestedCityKey
        ? "Esse ID tem 5+ vitórias. **Provavelmente é Cidade Nobre**, mas confirme no botão correto."
        : "Esse ID passou de 3 vitórias. Confirme manualmente a cidade correta."
    )
    .addFields(
      {
        name: "👤 Player",
        value: `**${playerName || "Sem nome"}** | \`${playerId}\``,
        inline: false
      },
      {
        name: "🏆 Vitórias encontradas",
        value: `**${total}**`,
        inline: true
      },
      {
        name: "📌 Motivo",
        value: `\`${reason}\``,
        inline: true
      },
      {
        name: "🌆 Sugestão",
        value: suggestedCityKey ? `${CITIES[suggestedCityKey].emoji} **${CITIES[suggestedCityKey].label}**` : "Sem sugestão automática",
        inline: true
      },
      {
        name: "🔗 Registro exemplo",
        value: latestLink ? `[Abrir registro](${latestLink})` : "Sem link encontrado",
        inline: false
      }
    )
    .setFooter({ text: "Clique na cidade correta abaixo. O ranking será atualizado depois da revisão." })
    .setTimestamp();

  await ch.send({
    embeds: [reviewEmbed],
    components: [row]
  }).catch(() => {});
}

function levenshteinDistance(a = "", b = "") {
  const left = String(a || "");
  const right = String(b || "");

  const matrix = Array.from({ length: left.length + 1 }, () => []);

  for (let i = 0; i <= left.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= right.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= left.length; i++) {
    for (let j = 1; j <= right.length; j++) {
      matrix[i][j] = left[i - 1] === right[j - 1]
        ? matrix[i - 1][j - 1]
        : Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
    }
  }

  return matrix[left.length][right.length];
}

function getPlayerSimilarityRatio(a = "", b = "") {
  const left = normalizeHallKey(a);
  const right = normalizeHallKey(b);

  if (!left || !right) return 0;
  if (left === right) return 1;

  const maxLen = Math.max(left.length, right.length);
  if (!maxLen) return 0;

  return 1 - (levenshteinDistance(left, right) / maxLen);
}

function buildDiscordMessageLink(meta = {}) {
  if (meta.jumpUrl) return meta.jumpUrl;

  const guildId = meta.guildId || meta.guild_id;
  const channelId = meta.channelId || meta.channel_id;
  const messageId = meta.messageId || meta.message_id;

  if (guildId && channelId && messageId) {
    return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
  }

  return "";
}

function getPlayerLatestHall(player = {}) {
  return [...(player.halls || [])]
    .filter(hall =>
      hall?.jumpUrl ||
      hall?.messageId ||
      hall?.channelId ||
      hall?.guildId
    )
    .sort((a, b) => Number(b.createdTimestamp || b.at || 0) - Number(a.createdTimestamp || a.at || 0))
    .at(0) || null;
}

function getPlayerLatestLink(player = {}) {
  const hall = getPlayerLatestHall(player);
  return buildDiscordMessageLink(hall || {});
}

async function findPaymentRegisterLinkByPlayer(client, player = {}) {
  const playerId = String(player.playerId || "").trim();
  const playerName = cleanRankingPlayerName(player.name || "");

  if (!client || (!playerId && !playerName)) return "";

  const ch = await client.channels.fetch(PAYMENT_EVENTS_CHANNEL_ID).catch(() => null);
  if (!ch || !ch.isTextBased()) return "";

  const messages = await ch.messages.fetch({ limit: 100 }).catch(() => null);
  if (!messages?.size) return "";

  const nameKey = normalizeHallKey(playerName);

  const found = messages.find(msg => {
    const text = [
      msg.content || "",
      ...(msg.embeds || []).flatMap(embed => [
        embed.title || "",
        embed.description || "",
        ...(embed.fields || []).flatMap(field => [
          field.name || "",
          field.value || ""
        ])
      ])
    ].join("\n");

    const textKey = normalizeHallKey(text);

    if (playerId && new RegExp(`\\b${playerId}\\b`).test(text)) return true;
    if (nameKey && textKey.includes(nameKey)) return true;

    return false;
  });

  return found?.url || "";
}

function getSafePlayerReviewCityName(player = {}) {
  const manualCityKey = getManualPlayerCityKeySmart(player.playerId, player.name);

  if (manualCityKey && CITIES[manualCityKey]) {
    return CITIES[manualCityKey].label;
  }

  return "Cidade não confirmada";
}

function getPlayerLatestImage(player = {}) {
  const hall = getPlayerLatestHall(player);
  return hall?.imageUrl || hall?.image || "";
}

function buildPlayerIdentityReviewKey(playerA = {}, playerB = {}) {
  const idA = String(playerA.playerId || "").trim() || normalizeHallKey(playerA.name || "");
  const idB = String(playerB.playerId || "").trim() || normalizeHallKey(playerB.name || "");

  return [idA, idB].sort().join("_");
}

function shouldSendPlayerIdentityReview(playerA = {}, playerB = {}) {
  const idA = String(playerA.playerId || "").trim();
  const idB = String(playerB.playerId || "").trim();

  const nameA = cleanRankingPlayerName(playerA.name || "");
  const nameB = cleanRankingPlayerName(playerB.name || "");

  const keyA = normalizeHallKey(nameA);
  const keyB = normalizeHallKey(nameB);

  if (!idA || !idB) return false;
  if (idA === idB) return false;

  if (!keyA || !keyB) return false;
  if (keyA.length < 3 || keyB.length < 3) return false;

  const totalA = Number(playerA.total || 0);
  const totalB = Number(playerB.total || 0);

  if (totalA < 3 || totalB < 3) return false;

  return keyA === keyB;
}

function mergePlayerRankingInto(rankings, keepKey, removeKey, cityKey, reviewedBy) {
  const keep = rankings.players?.[keepKey];
  const remove = rankings.players?.[removeKey];

  if (!keep || !remove) return false;

  const finalCityKey = cityKey || keep.cityKey || remove.cityKey || "nobre";
  const finalCityName = CITIES[finalCityKey]?.label || "Cidade Nobre";

  keep.cityKey = finalCityKey;
  keep.cityName = finalCityName;

  keep.halls = [
    ...(keep.halls || []),
    ...(remove.halls || [])
  ].map(hall => ({
    ...hall,
    cityKey: finalCityKey,
    cityName: finalCityName,
    eventName: normalizeHallEventName(hall.eventName, finalCityKey)
  }));

  const seen = new Set();
  keep.halls = keep.halls.filter(hall => {
    const uniqueKey = `${hall.messageId || hall.jumpUrl || hall.at}:${hall.eventName}:${finalCityKey}`;
    if (seen.has(uniqueKey)) return false;
    seen.add(uniqueKey);
    return true;
  });

  keep.total = keep.halls.length;
  keep.events = {};

  for (const hall of keep.halls) {
    const eventName = normalizeHallEventName(hall.eventName, finalCityKey);
    keep.events[eventName] ??= 0;
    keep.events[eventName] += 1;
  }

  delete rankings.players[removeKey];

  rankings.manualPlayerIdentityMerges ??= {};
  rankings.manualPlayerIdentityMerges[`${keepKey}__${removeKey}`] = {
    keepKey,
    removeKey,
    cityKey: finalCityKey,
    cityName: finalCityName,
    reviewedBy,
    reviewedAt: Date.now()
  };

  return true;
}

async function sendPlayerIdentitySimilarityReviews(client, rankings) {
  if (!client || !rankings?.players) return;

  rankings.pendingPlayerIdentityReview ??= {};
  rankings.manualPlayerIdentityMerges ??= {};

  const ch = await client.channels.fetch(PAYMENT_CITY_REVIEW_CHANNEL_ID).catch(() => null);
  if (!ch || !ch.isTextBased()) return;

  const players = Object.entries(rankings.players || {})
    .map(([key, player]) => ({ key, ...player }))
    .filter(player => player?.name && Number(player.total || 0) > 0);

  let sent = 0;

  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      if (sent >= 15) return;

      const playerA = players[i];
      const playerB = players[j];

      if (!shouldSendPlayerIdentityReview(playerA, playerB)) continue;

      const reviewKey = buildPlayerIdentityReviewKey(playerA, playerB);

      if (rankings.pendingPlayerIdentityReview[reviewKey]) continue;
      if (rankings.manualPlayerIdentityMerges[reviewKey]) continue;

      const similarity = Math.round(getPlayerSimilarityRatio(playerA.name, playerB.name) * 100);

      const playerALink = getPlayerLatestLink(playerA) || await findPaymentRegisterLinkByPlayer(client, playerA);
      const playerBLink = getPlayerLatestLink(playerB) || await findPaymentRegisterLinkByPlayer(client, playerB);

      rankings.pendingPlayerIdentityReview[reviewKey] = {
        reviewKey,
        playerAKey: playerA.key,
        playerBKey: playerB.key,
        playerA: {
          name: playerA.name,
          playerId: playerA.playerId || "",
          cityKey: getManualPlayerCityKeySmart(playerA.playerId, playerA.name) || "",
          cityName: getSafePlayerReviewCityName(playerA),
          total: playerA.total || 0,
          link: playerALink,
          image: getPlayerLatestImage(playerA)
        },
        playerB: {
          name: playerB.name,
          playerId: playerB.playerId || "",
          cityKey: getManualPlayerCityKeySmart(playerB.playerId, playerB.name) || "",
          cityName: getSafePlayerReviewCityName(playerB),
          total: playerB.total || 0,
          link: playerBLink,
          image: getPlayerLatestImage(playerB)
        },
        similarity,
        createdAt: Date.now()
      };

      const cityButtons = Object.entries(CITIES).map(([cityKey, city]) =>
        new ButtonBuilder()
          .setCustomId(`${BTN_PLAYER_IDENTITY_MERGE_PREFIX}${reviewKey}:${cityKey}`)
          .setLabel(`Juntar • ${city.label.replace("Cidade ", "")}`)
          .setEmoji(city.emoji)
          .setStyle(ButtonStyle.Success)
      );

      const row1 = new ActionRowBuilder().addComponents(cityButtons.slice(0, 2));
      const row2 = new ActionRowBuilder().addComponents(cityButtons.slice(2, 4));
      const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${BTN_PLAYER_IDENTITY_SEPARATE_PREFIX}${reviewKey}`)
          .setLabel("Não são a mesma pessoa")
          .setStyle(ButtonStyle.Danger)
      );

      const embed = new EmbedBuilder()
        .setColor("#f39c12")
        .setTitle("🧠 Revisão de identidade parecida")
.setDescription(
  `O bot encontrou **mesmo nome com IDs diferentes** e ambos têm **3+ vitórias**.\n\n` +
  `Confirma se são a mesma pessoa e qual cidade deve ficar.`
)
        .addFields(
          {
            name: "👤 Pessoa A",
            value:
              `**Nome:** ${playerA.name || "Sem nome"}\n` +
              `**ID:** \`${playerA.playerId || "Sem ID"}\`\n` +
 `**Cidade atual:** ${rankings.pendingPlayerIdentityReview[reviewKey].playerA.cityName || "Cidade não confirmada"}\n` +
`**Vitórias:** ${playerA.total || 0}\n` +
              `**Registro:** ${rankings.pendingPlayerIdentityReview[reviewKey].playerA.link ? `[Abrir registro](${rankings.pendingPlayerIdentityReview[reviewKey].playerA.link})` : "Sem link encontrado"}`,
            inline: false
          },
          {
            name: "👤 Pessoa B",
            value:
              `**Nome:** ${playerB.name || "Sem nome"}\n` +
              `**ID:** \`${playerB.playerId || "Sem ID"}\`\n` +
`**Cidade atual:** ${rankings.pendingPlayerIdentityReview[reviewKey].playerB.cityName || "Cidade não confirmada"}\n` +
`**Vitórias:** ${playerB.total || 0}\n` +
              `**Registro:** ${rankings.pendingPlayerIdentityReview[reviewKey].playerB.link ? `[Abrir registro](${rankings.pendingPlayerIdentityReview[reviewKey].playerB.link})` : "Sem link encontrado"}`,
            inline: false
          },
          {
            name: "📊 Parecido",
            value: `**${similarity}%**`,
            inline: true
          },
          {
            name: "❓ Pergunta",
            value: "São a mesma pessoa? Se sim, clique na cidade correta para juntar as vitórias.",
            inline: false
          }
        )
        .setFooter({ text: "SantaCreators • Revisão manual de identidade" })
        .setTimestamp();

      const thumb = getPlayerLatestImage(playerA) || getPlayerLatestImage(playerB);
      if (thumb) embed.setThumbnail(thumb);

      await ch.send({
        embeds: [embed],
        components: [row1, row2, row3]
      }).catch(() => {});

      sent++;
    }
  }
}

  async function addPaymentEventsToPlayerRankings(rankings, client) {
    const channel = await client.channels.fetch(PAYMENT_EVENTS_CHANNEL_ID).catch(() => null);
    if (!channel || !channel.isTextBased()) return rankings;

    rankings.reviewedPaymentMessages ??= {};
    rankings.paymentEventKeys ??= {};
    rankings.pendingPaymentCityReview ??= {};

    rankings = rebuildPaymentPlayerPointsFromZero(rankings);

    let beforeId = null;
    let scanned = 0;
    let counted = 0;
    let skipped = 0;

    while (scanned < 3000) {
      const batch = await channel.messages.fetch({
        limit: 100,
        ...(beforeId ? { before: beforeId } : {})
      }).catch(() => null);

      if (!batch?.size) break;

      const messages = [...batch.values()];
      beforeId = messages[messages.length - 1]?.id;

      for (const message of messages) {
        scanned++;

        if (rankings.reviewedPaymentMessages[message.id]) continue;
        if (!message.embeds?.length && !message.content) continue;

        if (!isPaymentApproved(message)) {
          skipped++;
          continue;
        }

        const eventRaw = getPaymentFieldValue(message, [
          "Evento",
          "🏷️ Evento",
          ":label: Evento"
        ]) || "Evento";

        const winnerRaw = getPaymentFieldValue(message, [
          "Ganhador",
          "👤 Ganhador",
          ":bust_in_silhouette: Ganhador"
        ]);

        const dateRaw = getPaymentFieldValue(message, [
          "Data do Evento",
          "📅 Data do Evento",
          ":date: Data do Evento"
        ]);

        const winner = parsePaymentWinner(winnerRaw);

        if (!winner.playerName || isInvalidWinnerName(winner.playerName)) {
          skipped++;
          rankings.reviewedPaymentMessages[message.id] = {
            skipped: true,
            reason: "ganhador_invalido",
            at: Date.now()
          };
          continue;
        }

        if (
          isForcedIgnoredPaymentOrgName(winner.playerName) ||
          isExactKnownOrgName(winner.playerName)
        ) {
          skipped++;
          rankings.reviewedPaymentMessages[message.id] = {
            skipped: true,
            reason: "pagamento_com_nome_de_org_nao_conta_como_player",
            playerName: winner.playerName,
            playerId: winner.playerId || "",
            at: Date.now()
          };
          continue;
        }

        const cityKey = getPaymentCityKey(message, winner);
        const eventDateKey = normalizePaymentDateKey(dateRaw, message.createdTimestamp || Date.now());
        const eventName = normalizeHallEventName(eventRaw, cityKey || "nobre");

        if (!cityKey) {
          skipped++;
          await sendPaymentCityReviewOnce(client, rankings, message, winner, eventName, eventDateKey);

          rankings.reviewedPaymentMessages[message.id] = {
            skipped: true,
            reason: "sem_cidade",
            playerName: winner.playerName,
            playerId: winner.playerId || "",
            eventName,
            eventDateKey,
            at: Date.now()
          };
          continue;
        }

        const paymentKey = getPaymentEventKey({
          eventName,
          eventDateKey,
          cityKey,
          playerId: winner.playerId,
          playerName: winner.playerName,
          messageId: message.id,
          createdTimestamp: message.createdTimestamp || Date.now()
        });

        if (rankings.paymentEventKeys[paymentKey]) {
          skipped++;
          rankings.reviewedPaymentMessages[message.id] = {
            skipped: true,
            reason: "pagamento_duplicado_mesmo_evento_player_dia",
            paymentKey,
            duplicatedFromMessageId: rankings.paymentEventKeys[paymentKey].messageId || "",
            at: Date.now()
          };
          continue;
        }

        const duplicatePayment = findDuplicateNearbyPaymentEvent(rankings, {
          eventName,
          eventDateKey,
          cityKey,
          playerId: winner.playerId,
          playerName: winner.playerName,
          messageId: message.id,
          createdTimestamp: message.createdTimestamp || Date.now()
        });

        if (duplicatePayment) {
          skipped++;
          rankings.reviewedPaymentMessages[message.id] = {
            skipped: true,
            reason: "pagamento_duplicado_ate_3h",
            paymentKey,
            duplicatedFromMessageId: duplicatePayment.messageId || "",
            at: Date.now()
          };
          continue;
        }

        addPlayerRankingPoint(rankings, {
          type: "player",
          playerName: winner.playerName,
          playerId: winner.playerId || "",
          cityKey,
          rawLine: winnerRaw
        }, {
          messageId: message.id,
          channelId: message.channelId,
          guildId: message.guildId,
          jumpUrl: getMessageJumpUrl(message),
          cityKey,
          cityName: CITIES[cityKey]?.label || "Cidade Nobre",
          eventName,
          evidenceSource: "botao_pagamento_pago",
          evidenceConfidence: 92,
          createdTimestamp: message.createdTimestamp || Date.now()
        });

        const playerKey = getPlayerRankingKey({
          playerName: winner.playerName,
          playerId: winner.playerId || "",
          cityKey
        });

        await sendRequiredPlayerCityReviewIfNeeded(client, rankings, rankings.players[playerKey], "mais_de_3_vitorias_no_mesmo_id_por_pagamento");

        rankings.paymentEventKeys[paymentKey] = {
          messageId: message.id,
          eventName,
          eventDateKey,
          cityKey,
          playerName: winner.playerName,
          playerId: winner.playerId || "",
          createdTimestamp: message.createdTimestamp || Date.now(),
          at: Date.now()
        };

        rankings.reviewedPaymentMessages[message.id] = {
          skipped: false,
          paymentKey,
          eventName,
          eventDateKey,
          cityKey,
          playerName: winner.playerName,
          playerId: winner.playerId || "",
          at: Date.now()
        };

        counted++;
      }

      if (batch.size < 100) break;
    }

    rankings.lastPaymentScan = {
      scanned,
      counted,
      skipped,
      at: Date.now()
    };

    rankings.lastUpdatedAt = Date.now();
    return rankings;
  }

  async function addHallToRankings(rankings, message, client = null) {
    const content = getHallMessageText(message);
    const normalizedContent = normalizeHallName(content);

    if (!content || !normalizedContent.includes("hall da fama")) return rankings;
    if (normalizedContent.includes("ranking de orgs")) return rankings;
    if (normalizedContent.includes("ranking de pessoas")) return rankings;
    if (normalizedContent.includes("top 10 organizacoes")) return rankings;
    if (normalizedContent.includes("top 10 pessoas")) return rankings;
    if (normalizedContent.includes("revisao manual")) return rankings;
    if (normalizedContent.includes("varredura hall da fama")) return rankings;

    const evidence = client
      ? await resolveHallEvidence(client, message, content)
      : {
          cityKey: detectHallCityKey(content),
          cityName: detectHallCityName(content),
          eventName: normalizeHallEventName(extractRawHallEventName(content), detectHallCityKey(content)),
          source: "texto_do_hall",
          confidence: 35
        };

    const cityKey = evidence.cityKey || "nobre";

    const directEventName = normalizeHallEventName(extractRawHallEventName(content), cityKey);
    const eventName =
      evidence.eventName && evidence.eventName !== "Evento"
        ? normalizeHallEventName(evidence.eventName, cityKey)
        : directEventName;

    const hallMeta = {
      messageId: message.id,
      channelId: message.channelId,
      guildId: message.guildId,
      jumpUrl: getMessageJumpUrl(message),
      cityKey,
      cityName: CITIES[cityKey]?.label || "Cidade Nobre",
      eventName,
      evidenceSource: evidence.source,
      evidenceConfidence: evidence.confidence,
      createdTimestamp: message.createdTimestamp || Date.now()
    };

    rankings.orgs ??= {};
    rankings.players ??= {};
    rankings.reviewedMessages ??= {};
    rankings.pendingReview ??= {};
    rankings.manualReviews ??= {};

    const parsed = parseHallWinners(content, cityKey);
    const deduped = dedupeHallWinners(parsed);

    if (!deduped.orgs.length && !deduped.players.length) {
      return rankings;
    }

    removeSingleHallRankingData(rankings, message.id);

    for (const orgWinner of deduped.orgs) {
      if (isAmbiguousHallWinner(orgWinner) && client) {
        const reviewKey = `${message.id}:${normalizeHallKey(orgWinner.rawLine || orgWinner.orgName)}`;
        const manualReview = rankings.manualReviews?.[reviewKey];

        if (manualReview?.resolvedAs === "org") {
          addOrgRankingPoint(rankings, orgWinner, hallMeta);
          continue;
        }

        if (manualReview?.resolvedAs === "player") {
          const targets = getManualReviewTargets({
            type: "org",
            name: orgWinner.orgName,
            playerId: "",
            rawLine: orgWinner.rawLine
          });

          addPlayerRankingPoint(rankings, {
            type: "player",
            playerName: targets.playerName || orgWinner.orgName,
            playerId: targets.playerId || "",
            cityKey,
            rawLine: orgWinner.rawLine
          }, hallMeta);
          continue;
        }

        if (manualReview?.resolvedAs === "both") {
          const targets = getManualReviewTargets({
            type: "org",
            name: orgWinner.orgName,
            playerId: "",
            rawLine: orgWinner.rawLine
          });

          addOrgRankingPoint(rankings, {
            type: "org",
            orgName: targets.orgName || orgWinner.orgName,
            cityKey,
            rawLine: orgWinner.rawLine
          }, hallMeta);

          addPlayerRankingPoint(rankings, {
            type: "player",
            playerName: targets.playerName || orgWinner.orgName,
            playerId: targets.playerId || "",
            cityKey,
            rawLine: orgWinner.rawLine
          }, hallMeta);
          continue;
        }

        if (!rankings.pendingReview[reviewKey]) {
          rankings.pendingReview[reviewKey] = {
            reviewKey,
            messageId: message.id,
            channelId: message.channelId,
            guildId: message.guildId,
            jumpUrl: hallMeta.jumpUrl || getMessageJumpUrl(message),
            type: "org",
            name: orgWinner.orgName,
            rawLine: orgWinner.rawLine,
            cityKey,
            cityName: hallMeta.cityName,
            eventName,
            createdAt: Date.now()
          };

          await sendHallWinnerToManualReview(client, orgWinner, hallMeta);
        }

        continue;
      }

      addOrgRankingPoint(rankings, orgWinner, hallMeta);
    }

    for (const playerWinner of deduped.players) {
      if (isAmbiguousHallWinner(playerWinner) && client) {
        const reviewKey = `${message.id}:${normalizeHallKey(playerWinner.rawLine || playerWinner.playerName)}`;
        const manualReview = rankings.manualReviews?.[reviewKey];

        if (manualReview?.resolvedAs === "player") {
          addPlayerRankingPoint(rankings, playerWinner, hallMeta);
          continue;
        }

        if (manualReview?.resolvedAs === "org") {
          const targets = getManualReviewTargets({
            type: "player",
            name: playerWinner.playerName,
            playerId: playerWinner.playerId || "",
            rawLine: playerWinner.rawLine
          });

          addOrgRankingPoint(rankings, {
            type: "org",
            orgName: targets.orgName || playerWinner.playerName,
            cityKey,
            rawLine: playerWinner.rawLine
          }, hallMeta);
          continue;
        }

        if (manualReview?.resolvedAs === "both") {
          const targets = getManualReviewTargets({
            type: "player",
            name: playerWinner.playerName,
            playerId: playerWinner.playerId || "",
            rawLine: playerWinner.rawLine
          });

          addPlayerRankingPoint(rankings, {
            type: "player",
            playerName: targets.playerName || playerWinner.playerName,
            playerId: targets.playerId || playerWinner.playerId || "",
            cityKey,
            rawLine: playerWinner.rawLine
          }, hallMeta);

          addOrgRankingPoint(rankings, {
            type: "org",
            orgName: targets.orgName || playerWinner.orgName || playerWinner.playerName,
            cityKey,
            rawLine: playerWinner.rawLine
          }, hallMeta);
          continue;
        }

        if (!rankings.pendingReview[reviewKey]) {
          rankings.pendingReview[reviewKey] = {
            reviewKey,
            messageId: message.id,
            channelId: message.channelId,
            guildId: message.guildId,
            jumpUrl: hallMeta.jumpUrl || getMessageJumpUrl(message),
            type: "player",
            name: playerWinner.playerName,
            playerId: playerWinner.playerId || "",
            rawLine: playerWinner.rawLine,
            cityKey,
            cityName: hallMeta.cityName,
            eventName,
            createdAt: Date.now()
          };

          await sendHallWinnerToManualReview(client, playerWinner, hallMeta);
        }

        continue;
      }

      addPlayerRankingPoint(rankings, playerWinner, hallMeta);

      const fixedIdentity = resolvePlayerIdentityOverride(playerWinner.playerId, playerWinner.playerName);
      const playerKey = getPlayerRankingKey({
        playerName: fixedIdentity.playerName,
        playerId: fixedIdentity.playerId,
        cityKey
      });

      await sendRequiredPlayerCityReviewIfNeeded(client, rankings, rankings.players[playerKey], "mais_de_3_vitorias_no_mesmo_id_hall");
    }

    rankings.reviewedMessages[message.id] = {
      messageId: message.id,
      cityKey,
      cityName: hallMeta.cityName,
      eventName,
      orgs: deduped.orgs.length,
      players: deduped.players.length,
      pendingReview: Object.keys(rankings.pendingReview || {}).filter(k => k.startsWith(`${message.id}:`)).length,
      at: Date.now()
    };

    rankings.lastUpdatedAt = Date.now();

    return rankings;
  }

  function isValidRankingEventName(eventName = "") {
    const normalized = normalizeHallName(eventName);

    if (!eventName || eventName === "Evento") return false;
    if (normalized.includes("vip")) return false;
    if (normalized.includes("rolepass")) return false;
    if (normalized.includes("ouro")) return false;
    if (normalized.includes("como ficou depois")) return false;
    if (normalized.includes("cidade 1")) return false;
    if (normalized.includes("foi insano")) return false;
    if (normalized.length > 70) return false;

    return true;
  }

  function formatRankingEventBreakdown(events = {}, cityKey = "nobre") {
    const finalCityKey = CITIES[cityKey] ? cityKey : "nobre";

    const sorted = Object.entries(events)
      .map(([eventName, total]) => [normalizeHallEventName(eventName, finalCityKey), total])
      .filter(([eventName]) => isValidRankingEventName(eventName))
      .reduce((acc, [eventName, total]) => {
        acc[eventName] ??= 0;
        acc[eventName] += total;
        return acc;
      }, {});

    const finalSorted = Object.entries(sorted)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    if (finalSorted.length === 0) return "Evento não identificado";

    return finalSorted
      .map(([eventName, total]) => `${eventName}: ${total}`)
      .join(" • ");
  }

  function getDominantCityFromHalls(halls = [], fallbackCityKey = "nobre") {
    const counts = {};

    for (const hall of halls || []) {
      const key = hall.cityKey || resolveCityKeyFromName(hall.cityName || "");
      if (!key) continue;

      counts[key] ??= 0;
      counts[key] += 1;
    }

    const dominant = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .at(0)?.[0];

    return dominant || fallbackCityKey || "nobre";
  }
  ///teste
function applyDominantCityToRankingItems(items = []) {
  return items.map(item => {
    const forcedCityKey =
      getManualPlayerCityKey(item.playerId || "") ||
      getManualPlayerCityKeyByName(item.name || "") ||
      getManualOrgCityKey(item.name || "");

    const cityKey = forcedCityKey || getDominantCityFromHalls(item.halls || [], item.cityKey || "nobre");
    const cityName = CITIES[cityKey]?.label || item.cityName || "Cidade Nobre";

    return {
      ...item,
      cityKey,
      cityName
    };
  });
}

function getRankingLastWinAt(item = {}) {
  return Math.max(
    0,
    ...(item.halls || []).map(hall => Number(hall.at || hall.createdTimestamp || hall.createdAt || 0))
  );
}

function sortRankingByTotalAndRecent(a, b) {
  const totalDiff = Number(b.total || 0) - Number(a.total || 0);
  if (totalDiff !== 0) return totalDiff;

  const recentDiff = getRankingLastWinAt(b) - getRankingLastWinAt(a);
  if (recentDiff !== 0) return recentDiff;

  return normalizeHallKey(a.name || "").localeCompare(normalizeHallKey(b.name || ""));
}

function buildOrgsRankingMessage(rankings) {
  const topOrgs = applyDominantCityToRankingItems(Object.values(rankings.orgs || {}))
    .sort(sortRankingByTotalAndRecent)
    .slice(0, 10);

    const totalOrgs = Object.keys(rankings.orgs || {}).length;
    const totalHalls = Object.keys(rankings.reviewedMessages || {}).length;
    const pending = Object.keys(rankings.pendingReview || {}).length;

    const lines = topOrgs.map((org, index) => {
      const position = index + 1;
      const medal = position === 1 ? "🥇" : position === 2 ? "🥈" : position === 3 ? "🥉" : "🏆";

      return `${medal} **TOP ${position}** — **${org.name}**
  🌆 Cidade: **${org.cityName}**
  🏆 Vitórias registradas: **${org.total}**
  🎮 Destaques: ${formatRankingEventBreakdown(org.events, org.cityKey)}`;
    });

    return `# 🏆 Ranking de ORGs — Hall da Fama

  📊 **TOP 10 organizações que mais venceram eventos**

  ✨ **Suba no ranking vencendo eventos oficiais da SantaCreators.**
  Cada Hall da Fama aprovado fortalece a história da sua organização.

  📌 **Resumo**
  🏢 ORGs no ranking: **${totalOrgs}**
  📜 Halls analisados: **${totalHalls}**
  ⚠️ Revisões pendentes: **${pending}**

  ${lines.length ? lines.join("\n\n") : "Ainda não há dados suficientes para montar o ranking."}


  🕒 Atualizado em: <t:${Math.floor((rankings.lastUpdatedAt || Date.now()) / 1000)}:F>`;
  }

function buildPlayersRankingMessage(rankings) {
  const topPlayers = applyDominantCityToRankingItems(Object.values(rankings.players || {}))
    .sort(sortRankingByTotalAndRecent)
    .slice(0, 10);

    const totalPlayers = Object.keys(rankings.players || {}).length;
    const totalHalls = Object.keys(rankings.reviewedMessages || {}).length;
    const pending = Object.keys(rankings.pendingReview || {}).length;

    const lines = topPlayers.map((player, index) => {
      const position = index + 1;
      const medal = position === 1 ? "🥇" : position === 2 ? "🥈" : position === 3 ? "🥉" : "⭐";
      const idText = player.playerId ? `\n🆔 ID: **${player.playerId}**` : "";

      return `${medal} **TOP ${position}** — **${player.name}**${idText}
  🌆 Cidade: **${player.cityName}**
  🏆 Vitórias registradas: **${player.total}**
  🎮 Destaques: ${formatRankingEventBreakdown(player.events, player.cityKey)}`;
    });

    return `# 👑 Ranking de Pessoas — Hall da Fama

  📊 **TOP 10 jogadores que mais venceram eventos**

  ✨ **Ganhe eventos, apareça no Hall da Fama e marque seu nome na história da SantaCreators.**
  Cada vitória individual registrada fortalece sua posição no ranking.

  📌 **Resumo**
  👤 Pessoas no ranking: **${totalPlayers}**
  📜 Halls analisados: **${totalHalls}**
  ⚠️ Revisões pendentes: **${pending}**

  ${lines.length ? lines.join("\n\n") : "Ainda não há dados suficientes para montar o ranking."}


  🕒 Atualizado em: <t:${Math.floor((rankings.lastUpdatedAt || Date.now()) / 1000)}:F>`;
  }

async function upsertSingleRankingMessage(channel, payload) {
  if (!channel || !channel.isTextBased()) return;

  const messages = await channel.messages.fetch({ limit: 20 }).catch(() => null);
  const botMessage = messages
    ?.filter(m => m.author.bot && m.author.id === channel.client.user.id)
    ?.sort((a, b) => b.createdTimestamp - a.createdTimestamp)
    ?.first();

  const finalPayload =
    typeof payload === "string"
      ? { content: payload.slice(0, 2000), components: [] }
      : {
          content: payload.content || "",
          embeds: payload.embeds || [],
          components: payload.components || []
        };

  if (botMessage) {
    await botMessage.edit(finalPayload).catch(() => {});
    return;
  }

  await channel.send(finalPayload).catch(() => {});
}

async function sendRankingWebhookMirror(webhookUrl, payload) {
  if (!webhookUrl || webhookUrl.includes("COLE_AQUI")) return;

  const webhook = new WebhookClient({ url: webhookUrl });

  await webhook.send({
    content: payload.content || "",
    embeds: payload.embeds || []
  }).catch(() => {});
}

  function splitEmbedFieldValue(text = "", maxLength = 1000) {
    const chunks = [];
    let current = "";

    for (const block of String(text || "").split("\n\n")) {
      const next = current ? `${current}\n\n${block}` : block;

      if (next.length <= maxLength) {
        current = next;
        continue;
      }

      if (current) chunks.push(current);

      if (block.length <= maxLength) {
        current = block;
        continue;
      }

      for (let i = 0; i < block.length; i += maxLength) {
        chunks.push(block.slice(i, i + maxLength));
      }

      current = "";
    }

    if (current) chunks.push(current);

    return chunks.length ? chunks : ["Ainda não há dados suficientes."];
  }

  function buildRankingEmbed(title, description, summary, lines, color = "#9b59b6") {
    const topText = lines.length ? lines.join("\n\n") : "Ainda não há dados suficientes.";
    const topChunks = splitEmbedFieldValue(topText, 1000);

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setColor(color)
      .setDescription(description)
      .addFields({ name: "📌 Resumo", value: summary.slice(0, 1000) || "Sem resumo.", inline: false })
      .setFooter({ text: "SantaCreators • Hall da Fama" })
      .setTimestamp();

  topChunks.slice(0, 20).forEach((chunk, index) => {
    embed.addFields({
      name: index === 0 ? "🏆 TOP 10" : "\u200B",
      value: chunk.slice(0, 1000) || "—",
      inline: false
    });
  });

    return embed;
  }

function mergeDuplicateOrgRankingItems(items = []) {
  const merged = {};

  for (const item of items) {
    const finalName = normalizeOrgDisplayName(item.name || "");
    const finalCityKey = getManualOrgCityKey(finalName) || item.cityKey || "nobre";
    const key = `${finalCityKey}:${normalizeHallKey(finalName)}`;

    merged[key] ??= {
      ...item,
      key,
      name: finalName,
      cityKey: finalCityKey,
      cityName: CITIES[finalCityKey]?.label || item.cityName || "Cidade Nobre",
      total: 0,
      events: {},
      halls: []
    };

    merged[key].total += Number(item.total || 0);

    for (const [eventName, count] of Object.entries(item.events || {})) {
      const finalEventName = normalizeHallEventName(eventName, finalCityKey);
      merged[key].events[finalEventName] ??= 0;
      merged[key].events[finalEventName] += Number(count || 0);
    }

    merged[key].halls.push(...(item.halls || []));
  }

  return Object.values(merged);
}

function buildOrgsRankingEmbed(rankings) {
  const topOrgs = mergeDuplicateOrgRankingItems(applyDominantCityToRankingItems(Object.values(rankings.orgs || {})))
    .filter(org => !isInvalidWinnerName(org.name))
    .filter(org => !looksLikePrizeOnly(org.name))
    .sort(sortRankingByTotalAndRecent)
    .slice(0, 10);

    const lines = topOrgs.map((org, index) => {
      const pos = index + 1;
      const medal = pos === 1 ? "🥇" : pos === 2 ? "🥈" : pos === 3 ? "🥉" : "🏆";

      return `${medal} **TOP ${pos} — ${org.name}**
  🌆 ${org.cityName}
  🏆 Vitórias: **${org.total}**
  🎮 ${formatRankingEventBreakdown(org.events, org.cityKey)}`;
    });

    return buildRankingEmbed(
      "🏆 Ranking de ORGs — Hall da Fama",
      "TOP 10 organizações que mais venceram eventos oficiais.",
      `🏢 ORGs no ranking: **${Object.keys(rankings.orgs || {}).length}**
  📜 Halls analisados: **${Object.keys(rankings.reviewedMessages || {}).length}**
  ⚠️ Revisões pendentes: **${Object.keys(rankings.pendingReview || {}).length}**`,
      lines,
      "#f1c40f"
    );
  }

function buildOrgsCityRankingEmbed(rankings, cityKey) {
  const cityData = CITIES[cityKey];

  if (!cityData) {
    return buildRankingEmbed(
      "🏆 Ranking de ORGs — Hall da Fama",
      "Cidade inválida.",
      "Nenhuma informação disponível.",
      [],
      "#f1c40f"
    );
  }

  const cityOrgs = mergeDuplicateOrgRankingItems(
    applyDominantCityToRankingItems(
      Object.values(rankings.orgs || {})
    )
  )
    .filter(org => !isInvalidWinnerName(org.name))
    .filter(org => !looksLikePrizeOnly(org.name))
    .filter(org => org.cityKey === cityKey)
    .sort(sortRankingByTotalAndRecent);

  const topOrgs = cityOrgs.slice(0, 10);

  const totalVitorias = cityOrgs.reduce(
    (total, org) => total + Number(org.total || 0),
    0
  );

  const lines = topOrgs.map((org, index) => {
    const pos = index + 1;
    const medal =
      pos === 1
        ? "🥇"
        : pos === 2
          ? "🥈"
          : pos === 3
            ? "🥉"
            : "🏆";

    return `${medal} **TOP ${pos} — ${org.name}**
  🌆 ${org.cityName}
  🏆 Vitórias: **${org.total}**
  🎮 ${formatRankingEventBreakdown(org.events, org.cityKey)}`;
  });

  return buildRankingEmbed(
    `${cityData.emoji} Ranking de ORGs — ${cityData.label}`,
    `TOP 10 organizações da ${cityData.label} que mais venceram eventos oficiais.`,
    `🏢 ORGs da cidade no ranking: **${cityOrgs.length}**
  🏆 Vitórias contabilizadas: **${totalVitorias}**
  📜 Halls analisados: **${Object.keys(rankings.reviewedMessages || {}).length}**
  ⚠️ Revisões pendentes: **${Object.keys(rankings.pendingReview || {}).length}**`,
    lines,
    "#f1c40f"
  );
}

function buildPlayersRankingEmbed(rankings) {
  const topPlayers = applyDominantCityToRankingItems(Object.values(rankings.players || {}))
    .filter(player => !isInvalidWinnerName(player.name))
    .filter(player => !looksLikePrizeOnly(player.name))
    .sort(sortRankingByTotalAndRecent)
    .slice(0, 10);

    const lines = topPlayers.map((player, index) => {
      const pos = index + 1;
      const medal = pos === 1 ? "🥇" : pos === 2 ? "🥈" : pos === 3 ? "🥉" : "⭐";
      const idText = player.playerId ? `\n🆔 ID: **${player.playerId}**` : "";

      return `${medal} **TOP ${pos} — ${player.name}**${idText}
  🌆 ${player.cityName}
  🏆 Vitórias: **${player.total}**
  🎮 ${formatRankingEventBreakdown(player.events, player.cityKey)}`;
    });

    return buildRankingEmbed(
      "👑 Ranking de Pessoas — Hall da Fama",
      "TOP 10 jogadores que mais venceram eventos oficiais.",
      `👤 Pessoas no ranking: **${Object.keys(rankings.players || {}).length}**
  📜 Halls analisados: **${Object.keys(rankings.reviewedMessages || {}).length}**
  ⚠️ Revisões pendentes: **${Object.keys(rankings.pendingReview || {}).length}**`,
      lines,
      "#5865f2"
    );
  }
function sanitizeRankingNick(nome, id) {
  const base = `${String(nome || "").trim()} | ${String(id || "").trim()}`.replace(/\s+/g, " ");
  return base.length <= 32 ? base : base.slice(0, 32);
}

function getIdentityFromMemberNick(member) {
  const nick = member?.nickname || member?.displayName || "";
  const match = String(nick).match(/^(.+?)\s*\|\s*(\d{1,10})$/);

  if (!match) return null;

  return {
    nome: match[1].trim(),
    id: match[2].trim()
  };
}

function canUseRankingPrivate(member, userId) {
  if (!member) return false;
  if (RANKING_FREE_USERS.includes(userId)) return true;
  if (member.roles.cache.some(role => RANKING_FREE_ROLES.includes(role.id))) return true;

  const hasCidadao = member.roles.cache.has(RANKING_ROLE_CIDADAO);
  const hasSemWL = member.roles.cache.has(RANKING_ROLE_SEM_WL);

  return hasCidadao && !hasSemWL;
}

async function setRankingRoleSafe(member, roleId) {
  try {
    const role = member.guild.roles.cache.get(roleId) || await member.guild.roles.fetch(roleId);
    if (!role) return false;
    await member.roles.add(role);
    return true;
  } catch {
    return false;
  }
}

async function removeRankingRoleSafe(member, roleId) {
  try {
    const role = member.guild.roles.cache.get(roleId) || await member.guild.roles.fetch(roleId);
    if (!role) return true;
    await member.roles.remove(role);
    return true;
  } catch {
    return false;
  }
}

async function applyRankingWL(member, nome, id) {
  const nick = sanitizeRankingNick(nome, id);

  let nickOk = false;
  let cidadaoOk = false;
  let semWlOk = false;

  try {
    if (member?.manageable) {
      await member.setNickname(nick);
      nickOk = true;
    }
  } catch {}

  cidadaoOk = await setRankingRoleSafe(member, RANKING_ROLE_CIDADAO);
  semWlOk = await removeRankingRoleSafe(member, RANKING_ROLE_SEM_WL);

  return { nick, nickOk, cidadaoOk, semWlOk };
}

async function sendRankingPrivateLog(client, interaction, data = {}) {
  const ch = await client.channels.fetch(RANKING_PRIVATE_LOG_CHANNEL_ID).catch(() => null);
  if (!ch?.isTextBased()) return;

  const user = interaction.user;
  const member = interaction.member;
  const now = Math.floor(Date.now() / 1000);

  const embed = new EmbedBuilder()
    .setTitle("🔎 Log de Consulta Privada — Ranking Hall")
    .setColor("#ff009a")
    .setThumbnail(user.displayAvatarURL({ extension: "png", size: 256 }))
    .addFields(
      {
        name: "👤 Usuário",
        value:
          `${user} (**${user.tag}**)\n` +
          `🆔 \`${user.id}\`\n` +
          `🔗 https://discord.com/users/${user.id}`,
        inline: false
      },
      {
        name: "📌 Ação",
        value: `\`${data.action || "consulta"}\``,
        inline: true
      },
      {
        name: "📊 Tipo",
        value: `\`${data.type || "ranking"}\``,
        inline: true
      },
      {
        name: "📄 Página",
        value: `\`${data.page ?? "N/A"}\``,
        inline: true
      },
      {
        name: "🔍 Pesquisa",
        value:
          `Nome: \`${data.nome || "—"}\`\n` +
          `ID: \`${data.id || "—"}\`\n` +
          `Cidade: \`${data.cidade || "—"}\`\n` +
          `ORG: \`${data.org || "—"}\``,
        inline: false
      },
      {
        name: "🎭 Cargos",
        value:
          `Cidadão: \`${member?.roles?.cache?.has(RANKING_ROLE_CIDADAO) ? "sim" : "não"}\`\n` +
          `SEM WL: \`${member?.roles?.cache?.has(RANKING_ROLE_SEM_WL) ? "sim" : "não"}\``,
        inline: true
      },
      {
        name: "🕒 Horário",
        value: `<t:${now}:F> • <t:${now}:R>`,
        inline: false
      }
    )
    .setFooter({ text: `SantaCreators • ${interaction.guild?.name || "Guild"}` });

  await ch.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => {});
}

function rankingButtons(type, page = 0, cityKey = null) {
  const isOrg = type === "org";

  const orgScope =
    cityKey && CITIES[cityKey]
      ? cityKey
      : "geral";

  const searchCustomId =
    isOrg
      ? `${BTN_RANK_ORG_SEARCH}:${orgScope}`
      : BTN_RANK_PLAYER_SEARCH;

  const nextCustomId =
    isOrg
      ? `${BTN_RANK_ORG_NEXT_PREFIX}${orgScope}:${page + 1}`
      : `${BTN_RANK_PLAYER_NEXT_PREFIX}${page + 1}`;

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(searchCustomId)
        .setLabel(isOrg ? "Pesquisar ORG" : "Pesquisar Pessoa")
        .setEmoji("🔎")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(nextCustomId)
        .setLabel("Próxima página")
        .setEmoji("➡️")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

function getSortedRankingList(rankings, type) {
  const source = type === "org" ? rankings.orgs : rankings.players;

  return applyDominantCityToRankingItems(Object.values(source || {}))
    .filter(Boolean)
    .sort(sortRankingByTotalAndRecent);
}

function formatRankingLine(item, pos, type) {
  if (type === "org") {
    return `🏆 **Ranking geral: #${pos} — ${item.name}**
🌆 ${item.cityName || "Cidade Nobre"}
🏆 Vitórias: **${item.total || 0}**
🎮 ${formatRankingEventBreakdown(item.events || {}, item.cityKey)}`;
  }

  const idText = item.playerId ? `\n🆔 ID: **${item.playerId}**` : "";

  return `⭐ **Ranking geral: #${pos} — ${item.name}**${idText}
🌆 ${item.cityName || "Cidade Nobre"}
🏆 Vitórias: **${item.total || 0}**
🎮 ${formatRankingEventBreakdown(item.events || {}, item.cityKey)}`;
}

function buildPrivateRankingEmbed(rankings, type, page = 0, filters = {}) {
  const pageSize = 10;
  const list = getSortedRankingList(rankings, type);

  let filtered = list;

  const cityKey =
    filters.cityKey && CITIES[filters.cityKey]
      ? filters.cityKey
      : null;

  if (type === "org" && cityKey) {
    filtered = filtered.filter(item => item.cityKey === cityKey);
  }

  if (type === "org" && filters.org) {
    const q = normalizeHallKey(filters.org);
    filtered = filtered.filter(item =>
      normalizeHallKey(item.name || "").includes(q)
    );
  }

  if (type === "player") {
    const nome = normalizeHallKey(filters.nome || "");
    const id = String(filters.id || "").trim();
    const cidade = normalizeHallKey(filters.cidade || "");

    filtered = filtered.filter(item => {
      const okNome =
        !nome ||
        normalizeHallKey(item.name || "").includes(nome);

      const okId =
        !id ||
        String(item.playerId || "").trim() === id;

      const okCidade =
        !cidade ||
        normalizeHallKey(
          item.cityName ||
          item.cityKey ||
          ""
        ).includes(cidade);

      return okNome && okId && okCidade;
    });
  }

  const maxPage = Math.max(
    0,
    Math.ceil(filtered.length / pageSize) - 1
  );

  const safePage = Math.min(
    Math.max(Number(page || 0), 0),
    maxPage
  );

  const start = safePage * pageSize;

  const pageItems = filtered.slice(
    start,
    start + pageSize
  );

  const lines = pageItems.map((item, index) => {
    return formatRankingLine(
      item,
      start + index + 1,
      type
    );
  });

  const cityData =
    cityKey
      ? CITIES[cityKey]
      : null;

  const title =
    type === "org"
      ? cityData
        ? `${cityData.emoji} Consulta Privada — Ranking de ORGs — ${cityData.label}`
        : "🏆 Consulta Privada — Ranking Geral de ORGs"
      : "👑 Consulta Privada — Ranking de Pessoas";

  const scopeText =
    type === "org" && cityData
      ? `🌆 Ranking filtrado por: **${cityData.label}**`
      : type === "org"
        ? "🌎 Ranking: **Geral**"
        : "";

  return {
    embed: buildRankingEmbed(
      title,
      "Resultado visível somente para você.",
      `${scopeText ? `${scopeText}\n` : ""}📄 Página: **${safePage + 1}/${maxPage + 1}**
🔎 Resultados encontrados: **${filtered.length}**`,
      lines.length
        ? lines
        : ["❌ Nenhum resultado encontrado com esses filtros."],
      type === "org"
        ? "#f1c40f"
        : "#5865f2"
    ),
    page: safePage,
    maxPage,
    total: filtered.length
  };
}

async function ensureRankingAccessOrWL(interaction, actionType) {
  let member = interaction.member;

  try {
    member = await interaction.guild.members.fetch(interaction.user.id);
  } catch {}

  if (canUseRankingPrivate(member, interaction.user.id)) {
    return true;
  }

  const nickIdentity = getIdentityFromMemberNick(member);

  if (nickIdentity) {
    await applyRankingWL(member, nickIdentity.nome, nickIdentity.id);

    try {
      member = await interaction.guild.members.fetch(interaction.user.id);
    } catch {}

    if (canUseRankingPrivate(member, interaction.user.id)) {
      return true;
    }
  }

  const modal = new ModalBuilder()
    .setCustomId(`${MODAL_RANK_WL_PREFIX}${actionType}`)
    .setTitle("Fazer WL para acessar");

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("rank_wl_nome")
        .setLabel("Seu nome")
        .setPlaceholder("Ex: Macedo")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(25)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("rank_wl_id")
        .setLabel("Seu ID")
        .setPlaceholder("Ex: 1000")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(10)
    )
  );

  await interaction.showModal(modal);
  return false;
}
async function publishHallRankings(client, rankings) {
  const orgsChannel = await client.channels.fetch(HALL_ORGS_RANKING_CHANNEL_ID).catch(() => null);
  const playersChannel = await client.channels.fetch(HALL_PLAYERS_RANKING_CHANNEL_ID).catch(() => null);

  const orgsPayload = {
    embeds: [buildOrgsRankingEmbed(rankings)],
    components: rankingButtons("org", 0)
  };

  const playersPayload = {
    embeds: [buildPlayersRankingEmbed(rankings)],
    components: rankingButtons("player", 0)
  };

  await upsertSingleRankingMessage(orgsChannel, orgsPayload);
  await upsertSingleRankingMessage(playersChannel, playersPayload);

for (const [cityKey, channelId] of Object.entries(HALL_ORGS_CITY_RANKING_CHANNELS)) {
  const cityChannel = await client.channels.fetch(channelId).catch(() => null);

  if (!cityChannel || !cityChannel.isTextBased()) {
    console.warn(
      `[HallDaFama] Canal do ranking da cidade ${cityKey} não encontrado ou não é textual: ${channelId}`
    );
    continue;
  }

  const cityPayload = {
    embeds: [buildOrgsCityRankingEmbed(rankings, cityKey)],
    components: rankingButtons("org", 0, cityKey)
  };

  await upsertSingleRankingMessage(cityChannel, cityPayload);

  if (cityKey === "nobre") {
    await sendRankingWebhookMirror(HALL_ORGS_RANKING_WEBHOOK_URL, cityPayload);
  }
}
}

async function publishHallRankingsDuringScan(client, rankings) {
  rankings.lastUpdatedAt = Date.now();

  await publishHallRankings(client, rankings);
}

  async function ensureHallRankingsDashboards(client) {
    try {
      const rankings = loadHallRankings();
      normalizeExistingPlayerRankingOverrides(rankings);
      await sendPlayerIdentitySimilarityReviews(client, rankings);
      saveHallRankings(rankings);
      await publishHallRankings(client, rankings);
    } catch (e) {
      console.error("[HallDaFama] Erro ao garantir dashboards dos rankings:", e);
    }
  }

  async function updateHallScanProgress(client, data = {}) {
    const ch = await client.channels.fetch(HALL_SCAN_PROGRESS_CHANNEL_ID).catch(() => null);
    if (!ch || !ch.isTextBased()) return null;

    const marker = "HF_SCAN_PROGRESS_PANEL";
    const messages = await ch.messages.fetch({ limit: 20 }).catch(() => null);

    let oldMsg = messages
      ?.filter(m => m.author.bot && m.author.id === client.user.id && m.content.includes(marker))
      ?.sort((a, b) => b.createdTimestamp - a.createdTimestamp)
      ?.first();

    if (data.forceNewApprovalPanel && oldMsg) {
      await oldMsg.delete().catch(() => {});
      oldMsg = null;
    }

    const totalHalls = Number(data.totalHalls ?? 0);
const processed = Number(data.processed ?? 0);

const progressTotal = Number(data.progressTotal ?? totalHalls);
const progressCurrent = Number(data.progressCurrent ?? processed);

const percent = progressTotal > 0 ? Math.min(100, Math.floor((progressCurrent / progressTotal) * 100)) : 0;
const filled = Math.floor(percent / 5);
const progressBar = `${"🟩".repeat(filled)}${"⬛".repeat(20 - filled)} ${progressCurrent}/${progressTotal}`;

    const hallUrl = data.currentHallUrl || "";
    const hallLine = hallUrl ? `[Abrir Hall atual](${hallUrl})` : "`aguardando link`";
    const authorLine = data.currentHallAuthor || "Não identificado";
    const postedLine = data.currentHallPostedAt || data.currentDate || "Buscando...";

    const embed = new EmbedBuilder()
      .setTitle("🧹 Varredura Hall da Fama")
      .setColor("#9b59b6")
      .setDescription(
        `📌 **Status:** ${data.status || "Iniciando..."}\n\n` +
        `📍 **Progresso:** ${progressBar}\n` +
        `🔗 **Hall atual:** ${hallLine}\n` +
        `👤 **Postado por:** ${authorLine}\n` +
        `📅 **Postado em:** ${postedLine}`
      )
      .addFields(
        { name: "📥 Mensagens buscadas", value: `**${data.totalMessages ?? 0}**`, inline: true },
        { name: "🏆 Halls encontrados", value: `**${data.totalHalls ?? 0}**`, inline: true },
        { name: "📊 Halls analisados", value: `**${data.processed ?? 0}/${data.totalHalls ?? 0}**`, inline: true },
        { name: "🤖 Halls do bot", value: `**${data.botHalls ?? 0}**`, inline: true },
        { name: "✏️ Halls editados", value: `**${data.edited ?? 0}**`, inline: true },
        { name: "⚠️ Revisões pendentes", value: `**${data.pending ?? 0}**`, inline: true },
        { name: "🎮 Evento atual", value: data.currentEvent || "Buscando...", inline: true },
        { name: "🌆 Cidade atual", value: data.currentCity || "Buscando...", inline: true },
        { name: "🧩 Fase", value: data.phase || "Varredura", inline: true }
      )
      .setFooter({ text: "SantaCreators • Painel auto-editável da varredura" })
      .setTimestamp();

    const row = hallUrl
      ? new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel("🔗 Abrir Hall atual")
            .setStyle(ButtonStyle.Link)
            .setURL(hallUrl)
        )
      : null;

    const payload = {
      content: `<!-- ${marker} -->`,
      embeds: [embed],
      components: row ? [row] : []
    };

    let result = null;

    if (oldMsg) {
      result = await oldMsg.edit(payload).catch(() => null);
    } else {
      result = await ch.send(payload).catch(() => null);
    }

    await updateHallApprovalScanProgress(client, data).catch(() => {});

    return result;
  }

  async function updateHallApprovalScanProgress(client, data = {}) {
    const ch = await client.channels.fetch(APPROVAL_CHANNEL_ID).catch(() => null);
    if (!ch || !ch.isTextBased()) return null;

    const marker = "HF_SCAN_APPROVAL_PROGRESS_PANEL";
    const messages = await ch.messages.fetch({ limit: 20 }).catch(() => null);

    let oldMsg = messages
      ?.filter(m => m.author.bot && m.author.id === client.user.id && m.content.includes(marker))
      ?.sort((a, b) => b.createdTimestamp - a.createdTimestamp)
      ?.first();

    if (data.forceNewApprovalPanel && oldMsg) {
      await oldMsg.delete().catch(() => {});
      oldMsg = null;
    }

    const totalHalls = Number(data.totalHalls ?? 0);
    const processed = Number(data.processed ?? 0);

    const progressTotal = Number(data.progressTotal ?? totalHalls);
    const progressCurrent = Number(data.progressCurrent ?? processed);

    const percent = progressTotal > 0 ? Math.min(100, Math.floor((progressCurrent / progressTotal) * 100)) : 0;
    const filled = Math.floor(percent / 5);
    const progressBar = `${"🟥".repeat(filled)}${"⬛".repeat(20 - filled)} ${progressCurrent}/${progressTotal}`;

    const hallUrl = data.currentHallUrl || "";
    const hallLine = hallUrl ? `[abrir Hall atual](${hallUrl})` : "`aguardando Hall atual`";
    const isFinished = data.phase === "Finalizado" || String(data.status || "").toLowerCase().includes("finalizado");

    const embed = new EmbedBuilder()
      .setTitle(isFinished ? "✅ Varredura Hall da Fama finalizada" : "🧹 Varredura Hall da Fama em andamento")
      .setColor(isFinished ? "#2ecc71" : "#e74c3c")
      .setDescription(
        `📍 **Progresso:** ${progressBar}\n\n` +
        `📌 **Status:** ${data.status || "Processando..."}\n` +
        `🔗 **Hall atual:** ${hallLine}\n` +
        `👤 **Postado por:** ${data.currentHallAuthor || "Não identificado"}\n` +
        `📅 **Postado em:** ${data.currentHallPostedAt || data.currentDate || "Buscando..."}`
      )
      .addFields(
        { name: "📥 Mensagens buscadas", value: `**${data.totalMessages ?? 0}**`, inline: true },
        { name: "🏆 Halls encontrados", value: `**${data.totalHalls ?? 0}**`, inline: true },
        { name: "📊 Processados", value: `**${progressCurrent}/${progressTotal}**`, inline: true },
        { name: "✏️ Editados", value: `**${data.edited ?? 0}**`, inline: true },
        { name: "⚠️ Revisões pendentes", value: `**${data.pending ?? 0}**`, inline: true },
        { name: "🧩 Fase", value: data.phase || "Varredura", inline: true },
        { name: "🎮 Evento atual", value: data.currentEvent || "Buscando...", inline: true },
        { name: "🌆 Cidade atual", value: data.currentCity || "Buscando...", inline: true }
      )
      .setFooter({
        text: isFinished
          ? "SantaCreators • Esse painel será apagado em 10 minutos"
          : "SantaCreators • Painel temporário da varredura"
      })
      .setTimestamp();

    const row = hallUrl
      ? new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel("🔗 Abrir Hall atual")
            .setStyle(ButtonStyle.Link)
            .setURL(hallUrl)
        )
      : null;

    const payload = {
      content: `<!-- ${marker} -->`,
      embeds: [embed],
      components: row ? [row] : []
    };

    const progressMsg = oldMsg
      ? await oldMsg.edit(payload).catch(() => null)
      : await ch.send(payload).catch(() => null);

    if (isFinished && progressMsg) {
      setTimeout(() => {
        progressMsg.delete().catch(() => {});
      }, 10 * 60 * 1000);
    }

    return progressMsg;
  }

  async function sendHallScanLog(client, data = {}) {
    const ch = await client.channels.fetch(HALL_SCAN_LOG_CHANNEL_ID).catch(() => null);
    if (!ch || !ch.isTextBased()) return;

    const hallUrl = data.currentHallUrl || "";
    const hallLine = hallUrl ? `[Abrir Hall](${hallUrl})` : "`sem link`";
    const authorLine = data.currentHallAuthor || "Não identificado";
    const postedLine = data.currentHallPostedAt || "Não identificado";

    const embed = new EmbedBuilder()
      .setTitle(data.title || "📋 Log da Varredura Hall da Fama")
      .setColor(data.color || "#5865f2")
      .setDescription(
        `${data.description || "Atualização da varredura."}\n\n` +
        `🔗 **Link:** ${hallLine}\n` +
        `👤 **Postado por:** ${authorLine}\n` +
        `📅 **Postado em:** ${postedLine}`
      )
      .addFields(
        { name: "📥 Mensagens buscadas", value: `**${data.totalMessages ?? 0}**`, inline: true },
        { name: "🏆 Halls encontrados", value: `**${data.totalHalls ?? 0}**`, inline: true },
        { name: "📊 Processados", value: `**${data.processed ?? 0}**`, inline: true },
        { name: "✏️ Editados", value: `**${data.edited ?? 0}**`, inline: true },
        { name: "⚠️ Revisões pendentes", value: `**${data.pending ?? 0}**`, inline: true },
        { name: "🧩 Fase", value: data.phase || "Não informado", inline: true },
        { name: "🎮 Evento", value: data.currentEvent || "Não identificado", inline: true },
        { name: "🌆 Cidade", value: data.currentCity || "Não identificada", inline: true },
        { name: "🧠 Confiança", value: data.confidence ? `**${data.confidence}%**` : "`não informada`", inline: true }
      )
      .setFooter({ text: "SantaCreators • Logs internos do Hall da Fama" })
      .setTimestamp();

    if (data.currentHall) {
      embed.addFields({
        name: "🔎 Prévia do Hall",
        value: String(data.currentHall).slice(0, 1000),
        inline: false
      });
    }

    const row = hallUrl
      ? new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel("🔗 Abrir Hall")
            .setStyle(ButtonStyle.Link)
            .setURL(hallUrl)
        )
      : null;

    await ch.send({
      embeds: [embed],
      components: row ? [row] : []
    }).catch(() => {});
  }

function formatHistoricalDateInput(timestamp = Date.now()) {
  const date = new Date(Number(timestamp) || Date.now());

  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).formatToParts(date);

  const get = type =>
    parts.find(part => part.type === type)?.value || "";

  return `${get("day")}/${get("month")}/${get("year")}`;
}

function parseHistoricalDateInput(value = "") {
  const match = String(value)
    .trim()
    .match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);

  const timestamp = Date.parse(
    `${String(year).padStart(4, "0")}-` +
    `${String(month).padStart(2, "0")}-` +
    `${String(day).padStart(2, "0")}T12:00:00-03:00`
  );

  const parsed = new Date(timestamp);

  if (
    !Number.isFinite(timestamp) ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return timestamp;
}

function buildHistoricalWinnersText(rawWinners = "") {
  const lines = String(rawWinners)
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);

  return lines
    .map((line, index) => {
      const emoji =
        index === 0
          ? "<:novo_emoji:1381082106469290076>"
          : index === 1
            ? "<:novo_emoji:1381082144981651500>"
            : index === 2
              ? "<:novo_emoji:1381082168142336095>"
              : "🏅";

      return `**TOP** ${emoji} ${line}`;
    })
    .join("\n");
}

function buildHistoricalHallModal(oldMessageId, data = {}) {
  const modal = new ModalBuilder()
    .setCustomId(
      `${MODAL_HISTORICAL_PREFIX}${oldMessageId}`
    )
    .setTitle("Recriar Hall da Fama antigo");

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("hf_hist_event")
        .setLabel("Nome completo do evento")
        .setPlaceholder("Ex: Missão Rosa")
        .setStyle(TextInputStyle.Short)
        .setValue(
          String(data.eventName || "").slice(0, 4000)
        )
        .setRequired(true)
    ),

    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("hf_hist_city")
        .setLabel("Cidade")
        .setPlaceholder(
          "Nobre, Santa, Grande ou Maresia"
        )
        .setStyle(TextInputStyle.Short)
        .setValue(
          String(data.cityName || "").slice(0, 4000)
        )
        .setRequired(true)
    ),

    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("hf_hist_date")
        .setLabel(
          "Data original da vitória — DD/MM/AAAA"
        )
        .setPlaceholder("Ex: 30/08/2026")
        .setStyle(TextInputStyle.Short)
        .setValue(
          String(data.victoryDate || "").slice(0, 4000)
        )
        .setRequired(true)
    ),

    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("hf_hist_winners")
        .setLabel(
          "Vencedores — nome, ID/ORG e prêmio"
        )
        .setPlaceholder(
          "Um por linha:\n" +
          "Espanha | ORG | 1 VIP\n" +
          "Rodney | 123 | R$ 100 milhões"
        )
        .setStyle(TextInputStyle.Paragraph)
        .setValue(
          String(data.rawWinners || "").slice(0, 4000)
        )
        .setRequired(true)
    ),

    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId(
          "hf_hist_new_images"
        )
        .setLabel(
          "Imagens novas — links, um por linha"
        )
        .setPlaceholder(
          "Opcional se as imagens antigas foram recuperadas. Cole até 4 links."
        )
        .setStyle(
          TextInputStyle.Paragraph
        )
        .setValue(
          String(
            data.manualImageUrls || []
          )
            .split(",")
            .join("\n")
            .slice(0, 4000)
        )
        .setRequired(false)
    )
  );

  return modal;
}

async function archiveHistoricalHallImages(
  client,
  hallMessage
) {
  const storageChannel =
    await client.channels
      .fetch(HALL_HISTORICAL_IMAGES_CHANNEL_ID)
      .catch(() => null);

  if (
    !storageChannel ||
    !storageChannel.isTextBased()
  ) {
    return {
      ok: false,
      reason:
        "Canal de armazenamento das imagens não encontrado.",
      messageId: null,
      imageUrls: []
    };
  }

  const sourceUrls = uniqueImageUrls([
    ...getImageUrlsFromAttachments(hallMessage),
    ...getImageUrlsFromContent(
      getHallMessageText(hallMessage)
    )
  ]).slice(0, 4);

  if (sourceUrls.length === 0) {
    return {
      ok: true,
      reason:
        "O Hall original não possui imagens.",
      messageId: null,
      imageUrls: []
    };
  }

  const files =
    await downloadUniqueApprovedHallImages(
      sourceUrls
    );

  if (files.length !== sourceUrls.length) {
    return {
      ok: false,
      reason:
        `Foram recuperadas somente ` +
        `${files.length} de ${sourceUrls.length} imagens. ` +
        `O Hall não poderá ser apagado.`,
      messageId: null,
      imageUrls: []
    };
  }

  const storageMessage =
    await storageChannel.send({
      content:
        `🖼️ **Cópia protegida de Hall humano**\n` +
        `Hall original: ${getMessageJumpUrl(hallMessage)}\n` +
        `Mensagem: \`${hallMessage.id}\`\n` +
        `Autor: <@${hallMessage.author.id}> ` +
        `\`${hallMessage.author.id}\`\n` +
        `Data original: ` +
        `<t:${Math.floor(
          (
            hallMessage.createdTimestamp ||
            Date.now()
          ) / 1000
        )}:F>`,

      files
    });

  return {
    ok: true,
    reason:
      "Imagens protegidas com sucesso.",
    messageId:
      storageMessage.id,
    channelId:
      storageMessage.channelId,
    imageUrls:
      uniqueImageUrls(
        [
          ...storageMessage.attachments.values()
        ].map(attachment => attachment.url)
      )
  };
}

async function storeHistoricalReplacementImages(
  client,
  review,
  imageUrls = []
) {
  const finalInputUrls =
    uniqueImageUrls(
      imageUrls
    ).slice(0, 4);

  if (
    finalInputUrls.length === 0
  ) {
    return {
      ok:
        false,

      reason:
        "Nenhum link de imagem nova foi informado.",

      messageId:
        null,

      channelId:
        HALL_HISTORICAL_IMAGES_CHANNEL_ID,

      imageUrls:
        []
    };
  }

  const storageChannel =
    await client.channels
      .fetch(
        HALL_HISTORICAL_IMAGES_CHANNEL_ID
      )
      .catch(() => null);

  if (
    !storageChannel ||
    !storageChannel.isTextBased()
  ) {
    return {
      ok:
        false,

      reason:
        "Canal de armazenamento das imagens não encontrado.",

      messageId:
        null,

      channelId:
        HALL_HISTORICAL_IMAGES_CHANNEL_ID,

      imageUrls:
        []
    };
  }

  const files =
    await downloadUniqueApprovedHallImages(
      finalInputUrls
    );

  if (
    files.length !==
    finalInputUrls.length
  ) {
    return {
      ok:
        false,

      reason:
        `Foram baixadas somente ` +
        `${files.length} de ` +
        `${finalInputUrls.length} imagens novas.`,

      messageId:
        null,

      channelId:
        HALL_HISTORICAL_IMAGES_CHANNEL_ID,

      imageUrls:
        []
    };
  }

  const storageMessage =
    await storageChannel.send({
      content:
        `🖼️ **Imagens novas para recriação de Hall humano**\n` +
        `Hall original: ${review.oldJumpUrl}\n` +
        `Mensagem original: \`${review.oldMessageId}\`\n` +
        `Imagens enviadas manualmente para substituir ou complementar as antigas.`,

      files
    });

  const storedImageUrls =
    uniqueImageUrls(
      [
        ...storageMessage
          .attachments
          .values()
      ].map(
        attachment =>
          attachment.url
      )
    );

  if (
    storedImageUrls.length !==
    finalInputUrls.length
  ) {
    return {
      ok:
        false,

      reason:
        "Nem todas as imagens novas foram armazenadas corretamente.",

      messageId:
        storageMessage.id,

      channelId:
        storageMessage.channelId,

      imageUrls:
        storedImageUrls
    };
  }

  return {
    ok:
      true,

    reason:
      "Imagens novas protegidas com sucesso.",

    messageId:
      storageMessage.id,

    channelId:
      storageMessage.channelId,

    imageUrls:
      storedImageUrls
  };
}
async function updateHistoricalReviewPanelAfterPublication(
  client,
  oldMessageId
) {
  const review =
    state.historicalHallReviews?.[
      oldMessageId
    ];

  const migration =
    state.historicalHallMigrations?.[
      oldMessageId
    ];

  if (
    !review ||
    !migration
  ) {
    return false;
  }

  if (
    migration.status !==
      "completed" &&
    migration.status !==
      "published_pending_old_deletion"
  ) {
    return false;
  }

  const reviewChannel =
    await client.channels
      .fetch(
        review.reviewChannelId ||
        HALL_REVIEW_CHANNEL_ID
      )
      .catch(() => null);

  if (
    !reviewChannel ||
    !reviewChannel.isTextBased() ||
    !review.reviewMessageId
  ) {
    return false;
  }

  const reviewMessage =
    await reviewChannel.messages
      .fetch(
        review.reviewMessageId
      )
      .catch(() => null);

  if (!reviewMessage) {
    return false;
  }

  const previousEmbed =
    reviewMessage.embeds?.[0]
      ? EmbedBuilder.from(
          reviewMessage.embeds[0]
        )
      : new EmbedBuilder();

  const previousFields =
    (
      reviewMessage.embeds?.[0]?.fields ||
      []
    ).filter(field => {
      return ![
        "✅ Status da substituição",
        "🔗 Hall novo",
        "🗑️ Hall antigo"
      ].includes(field.name);
    });

  const oldHallStatus =
    migration.status === "completed"
      ? "O Hall humano antigo foi apagado."
      : (
          "O Hall novo foi publicado, mas a exclusão " +
          "do Hall humano antigo ainda está pendente."
        );

  const finalEmbed =
    previousEmbed
      .setTitle(
        migration.status === "completed"
          ? "✅ Hall humano recriado e substituído"
          : "⏳ Hall recriado — exclusão antiga pendente"
      )
      .setColor(
        migration.status === "completed"
          ? "#2ecc71"
          : "#f1c40f"
      )
      .setDescription(
        migration.status === "completed"
          ? (
              "Este Hall humano já foi recriado, aprovado " +
              "e publicado no formato atual.\n\n" +
              "**Não é necessário recriá-lo novamente.**"
            )
          : (
              "Este Hall já foi recriado e publicado no " +
              "formato atual.\n\n" +
              "**Não é necessário recriá-lo novamente.** " +
              "O sistema tentará apagar a mensagem antiga " +
              "na próxima varredura."
            )
      )
      .setFields(
        ...previousFields,
        {
          name:
            "✅ Status da substituição",

          value:
            migration.status === "completed"
              ? "Recriação aprovada e concluída."
              : "Recriação aprovada; exclusão antiga pendente.",

          inline:
            false
        },
        {
          name:
            "🔗 Hall novo",

          value:
            migration.newJumpUrl
              ? `[Abrir Hall recriado](${migration.newJumpUrl})`
              : "Link do Hall novo não encontrado.",

          inline:
            false
        },
        {
          name:
            "🗑️ Hall antigo",

          value:
            oldHallStatus,

          inline:
            false
        }
      )
      .setFooter({
        text:
          `Substituição protegida • Hall ${oldMessageId}`
      })
      .setTimestamp();

  await reviewMessage.edit({
    embeds:
      [finalEmbed],

    components:
      []
  });

  return true;
}

async function syncHistoricalReviewPanels(
  client
) {
  const reviews =
    Object.entries(
      state.historicalHallReviews ||
      {}
    );

  for (
    const [
      oldMessageId,
      review
    ]
    of reviews
  ) {
    const migration =
      state.historicalHallMigrations?.[
        oldMessageId
      ];

    if (
      migration?.status ===
        "completed" ||
      migration?.status ===
        "published_pending_old_deletion"
    ) {
      await updateHistoricalReviewPanelAfterPublication(
        client,
        oldMessageId
      ).catch(error => {
        console.error(
          `[HallDaFama] Não foi possível limpar o painel histórico ${oldMessageId}:`,
          error
        );
      });

      continue;
    }

    if (
      !review?.reviewMessageId ||
      !review?.oldGuildId ||
      !review?.oldChannelId
    ) {
      continue;
    }

    const reviewChannel =
      await client.channels
        .fetch(
          review.reviewChannelId ||
          HALL_REVIEW_CHANNEL_ID
        )
        .catch(() => null);

    if (
      !reviewChannel ||
      !reviewChannel.isTextBased()
    ) {
      continue;
    }

    const reviewMessage =
      await reviewChannel.messages
        .fetch(
          review.reviewMessageId
        )
        .catch(() => null);

    if (!reviewMessage) {
      continue;
    }

    const oldChannel =
      await client.channels
        .fetch(
          review.oldChannelId
        )
        .catch(() => null);

    const oldMessage =
      oldChannel?.isTextBased()
        ? await oldChannel.messages
            .fetch(
              oldMessageId
            )
            .catch(() => null)
        : null;

    const refreshedOldJumpUrl =
      oldMessage?.url ||
      (
        `https://discord.com/channels/` +
        `${review.oldGuildId}/` +
        `${review.oldChannelId}/` +
        `${oldMessageId}`
      );

    review.oldJumpUrl =
      refreshedOldJumpUrl;

    const refreshedEmbed =
      reviewMessage.embeds?.[0]
        ? EmbedBuilder.from(
            reviewMessage.embeds[0]
          )
        : new EmbedBuilder();

    const refreshedFields =
      (
        reviewMessage.embeds?.[0]?.fields ||
        []
      ).map(field => {
        if (
          field.name !==
          "Hall original"
        ) {
          return field;
        }

        return {
          name:
            "Hall original",

          value:
            oldMessage
              ? `[Abrir Hall humano](${refreshedOldJumpUrl})`
              : (
                  "A mensagem antiga não foi encontrada. " +
                  `Canal: <#${review.oldChannelId}> • ` +
                  `Mensagem: \`${oldMessageId}\``
                ),

          inline:
            false
        };
      });

    refreshedEmbed.setFields(
      ...refreshedFields
    );

    const firstRow =
      new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(
              `${BTN_HISTORICAL_RECREATE_PREFIX}` +
              `${oldMessageId}`
            )
            .setLabel(
              "♻️ Recriar no formato novo"
            )
            .setStyle(
              ButtonStyle.Success
            )
        );

    if (oldMessage) {
      firstRow.addComponents(
        new ButtonBuilder()
          .setLabel(
            "🔗 Abrir Hall antigo"
          )
          .setStyle(
            ButtonStyle.Link
          )
          .setURL(
            refreshedOldJumpUrl
          )
      );
    }

    const components =
      [firstRow];

    if (
      review.archiveMessageId &&
      review.archiveChannelId
    ) {
      components.push(
        new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setLabel(
                "🖼️ Abrir imagens protegidas"
              )
              .setStyle(
                ButtonStyle.Link
              )
              .setURL(
                `https://discord.com/channels/` +
                `${review.oldGuildId}/` +
                `${review.archiveChannelId}/` +
                `${review.archiveMessageId}`
              )
          )
      );
    }

    await reviewMessage.edit({
      embeds:
        [refreshedEmbed],

      components
    }).catch(error => {
      console.error(
        `[HallDaFama] Não foi possível reconstruir os botões do painel ${oldMessageId}:`,
        error
      );
    });
  }

  saveState(state);
}

async function queueHistoricalHallReview(
  client,
  hallMessage
) {

  if (
    !hallMessage ||
    hallMessage.author?.id === client.user.id
  ) {
    return;
  }

  const existingMigration =
    state.historicalHallMigrations?.[
      hallMessage.id
    ];

  if (
    existingMigration?.status ===
    "completed"
  ) {
    return;
  }

  if (
    existingMigration?.status ===
    "published_pending_old_deletion"
  ) {
    try {
      await hallMessage.delete();

      existingMigration.status =
        "completed";

      existingMigration.deletionError =
        null;

      existingMigration.deletedAt =
        Date.now();

      if (
        state.historicalHallReviews?.[
          hallMessage.id
        ]
      ) {
        state.historicalHallReviews[
          hallMessage.id
        ].status =
          "completed";
      }

      saveState(state);

      await updateHistoricalReviewPanelAfterPublication(
        client,
        hallMessage.id
      ).catch(error => {
        console.error(
          `[HallDaFama] Não foi possível finalizar visualmente o painel ${hallMessage.id}:`,
          error
        );
      });

      await sendHallScanLog(
        client,
        {
          title:
            "✅ Exclusão pendente concluída",

          color:
            "#2ecc71",

          description:
            `A varredura conseguiu apagar o Hall humano antigo.\n\n` +
            `Mensagem antiga: \`${hallMessage.id}\`\n` +
            `Hall novo: ${
              existingMigration.newJumpUrl ||
              "Link não registrado"
            }\n\n` +
            `A varredura atual continuará e reconstruirá ` +
            `o ranking sem a mensagem antiga.`,

          phase:
            "Migração de Hall humano",

          currentHallUrl:
            existingMigration.newJumpUrl ||
            ""
        }
      ).catch(() => {});
    } catch (error) {
      existingMigration.deletionError =
        error?.message ||
        String(error);

      existingMigration.lastDeleteAttemptAt =
        Date.now();

      saveState(state);

      await sendHallScanLog(
        client,
        {
          title:
            "⚠️ Exclusão do Hall antigo continua pendente",

          color:
            "#e67e22",

          description:
            `O Hall novo já foi publicado, mas a mensagem humana antiga ainda não pôde ser apagada.\n\n` +
            `Mensagem antiga: \`${hallMessage.id}\`\n` +
            `Hall antigo: ${getMessageJumpUrl(hallMessage)}\n` +
            `Hall novo: ${
              existingMigration.newJumpUrl ||
              "Link não registrado"
            }\n` +
            `Erro: \`${error?.message || error}\``,

          phase:
            "Migração de Hall humano",

          currentHallUrl:
            getMessageJumpUrl(
              hallMessage
            )
        }
      ).catch(() => {});
    }

    return;
  }

  const existing =
    state.historicalHallReviews?.[
      hallMessage.id
    ];

  if (
    existing?.status ===
    "ignored"
  ) {
    existing.status =
      "awaiting_recreation";

    delete existing.ignoredBy;
    delete existing.ignoredAt;

    saveState(state);
  } else if (
    existing?.status &&
    existing.status !==
    "archive_failed"
  ) {
    return;
  }

  const archive =
    await archiveHistoricalHallImages(
      client,
      hallMessage
    );

  const text =
    getHallMessageText(hallMessage);

  const parts =
    extractHallParts(text);

  const detectedCityKey =
    detectHallCityKey(text);

  const reviewChannel =
    await client.channels
      .fetch(HALL_REVIEW_CHANNEL_ID)
      .catch(() => null);

  if (
    !reviewChannel ||
    !reviewChannel.isTextBased()
  ) {
    return;
  }

  const reviewData = {
    oldMessageId:
      hallMessage.id,

    oldChannelId:
      hallMessage.channelId,

    oldGuildId:
      hallMessage.guildId,

    oldJumpUrl:
      getMessageJumpUrl(hallMessage),

    oldAuthorId:
      hallMessage.author.id,

    originalCreatedTimestamp:
      hallMessage.createdTimestamp ||
      Date.now(),

    originalContent:
      text,

    eventName:
      parts.eventName || "",

    cityKey:
      detectedCityKey,

    cityName:
      CITIES[detectedCityKey]?.label || "",

    victoryDate:
      formatHistoricalDateInput(
        hallMessage.createdTimestamp ||
        Date.now()
      ),

    rawWinners:
      String(parts.winnersText || "")
        .replace(
          /^\*\*TOP\*\*\s+\S+\s*/gim,
          ""
        )
        .trim(),

    archiveMessageId:
      archive.messageId,

    archiveChannelId:
      archive.channelId ||
      HALL_HISTORICAL_IMAGES_CHANNEL_ID,

    archivedImageUrls:
      archive.imageUrls,

    archiveOk:
      archive.ok,

    status:
      archive.ok
        ? "awaiting_recreation"
        : "archive_failed",

    createdAt:
      Date.now()
  };

  const embed =
    new EmbedBuilder()
      .setTitle(
        archive.ok
          ? "📜 Hall humano encontrado — recriação necessária"
          : "⚠️ Hall humano — imagens não protegidas"
      )
      .setColor(
        archive.ok
          ? "#f1c40f"
          : "#e74c3c"
      )
      .setDescription(
        `Este Hall foi publicado por uma pessoa ` +
        `e precisa ser recriado no formato novo.\n\n` +
        `**Ele não será apagado antes da ` +
        `publicação correta do substituto.**`
      )
      .addFields(
        {
          name: "Hall original",
          value:
            `[Abrir Hall humano](` +
            `${reviewData.oldJumpUrl})`,
          inline: false
        },
        {
          name: "Autor original",
          value:
            `<@${reviewData.oldAuthorId}> ` +
            `\`${reviewData.oldAuthorId}\``,
          inline: true
        },
        {
          name: "Data encontrada",
          value:
            `<t:${Math.floor(
              reviewData.originalCreatedTimestamp /
              1000
            )}:F>`,
          inline: true
        },
        {
          name: "Evento detectado",
          value:
            reviewData.eventName ||
            "Não identificado",
          inline: true
        },
        {
          name: "Cidade detectada",
          value:
            reviewData.cityName ||
            "Não identificada",
          inline: true
        },
        {
          name: "Imagens",
          value:
            archive.reason,
          inline: false
        },
        {
          name: "Conteúdo original",
          value:
            String(
              text || "Sem conteúdo"
            ).slice(0, 1000),
          inline: false
        }
      )
      .setFooter({
        text:
          `Hall original: ${hallMessage.id}`
      })
      .setTimestamp();

  const firstRow =
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            `${BTN_HISTORICAL_RECREATE_PREFIX}` +
            `${hallMessage.id}`
          )
          .setLabel(
            "♻️ Recriar no formato novo"
          )
          .setStyle(
            ButtonStyle.Success
          ),

        new ButtonBuilder()
          .setLabel(
            "🔗 Abrir Hall antigo"
          )
          .setStyle(
            ButtonStyle.Link
          )
          .setURL(
            reviewData.oldJumpUrl
          )
      );

  const components = [firstRow];

  if (archive.messageId) {
    components.push(
      new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setLabel(
              "🖼️ Abrir imagens protegidas"
            )
            .setStyle(
              ButtonStyle.Link
            )
            .setURL(
              `https://discord.com/channels/` +
              `${reviewData.oldGuildId}/` +
              `${reviewData.archiveChannelId}/` +
              `${archive.messageId}`
            )
        )
    );
  }

  let sentReview =
    existing?.reviewMessageId
      ? await reviewChannel.messages
          .fetch(
            existing.reviewMessageId
          )
          .catch(() => null)
      : null;

  if (sentReview) {
    await sentReview.edit({
      embeds: [embed],
      components
    });
  } else {
    sentReview =
      await reviewChannel.send({
        embeds: [embed],
        components
      });
  }

  reviewData.reviewMessageId =
    sentReview.id;

  reviewData.reviewChannelId =
    sentReview.channelId;

  state.historicalHallReviews[
    hallMessage.id
  ] = reviewData;

  saveState(state);
}

function extractWinnerNamesForApprovalMatch(text = "") {
  const winners = parseHallWinners(text, detectHallCityKey(text));

  return winners
    .map(w => normalizeHallName(w.playerName || w.orgName || ""))
    .filter(Boolean)
    .filter(name => name.length >= 3);
}

function scoreApprovalMessageForHall(approvalText = "", hallWinnerNames = []) {
  const normalized = normalizeHallName(approvalText);
  let score = 0;

  for (const winnerName of hallWinnerNames) {
    if (normalized.includes(winnerName)) {
      score += 80;
    }
  }

  return score;
}

async function findApprovalImagesForHall(
  client,
  hallMessage,
  parts = {}
) {
  const approvalChannel =
    await client.channels
      .fetch(
        APPROVAL_CHANNEL_ID
      )
      .catch(() => null);

  if (
    !approvalChannel ||
    !approvalChannel.isTextBased()
  ) {
    return {
      found: false,
      messageId: null,
      images: [],
      expectedImageCount: 0,
      reason:
        "Canal de aprovação indisponível"
    };
  }

  const hallText =
    getHallMessageText(
      hallMessage
    );

  const hallParts =
    extractHallParts(
      hallText
    );

  const hallEventName =
    normalizeHallName(
      parts.eventName ||
      hallParts.eventName ||
      ""
    );

  const hallCityKey =
    detectHallCityKey(
      hallText
    );

  const normalizedHallWinners =
    [
      ...new Set(
        (
          parts.winnerNames?.length
            ? parts.winnerNames
            : extractWinnerNamesForApprovalMatch(
                hallText
              )
        )
          .map(winnerName =>
            normalizeHallName(
              winnerName
            )
          )
          .filter(winnerName =>
            winnerName.length >= 3
          )
      )
    ];

  const hallCreatedAt =
    hallMessage?.createdTimestamp ||
    Date.now();

  /*
   * Alguns registros de aprovação foram criados
   * ou reconstruídos vários dias depois do Hall.
   *
   * A correspondência continua exigindo:
   * - mesmo evento;
   * - mesma cidade;
   * - mesmos vencedores.
   *
   * Portanto, podemos ampliar o período sem
   * selecionar livremente qualquer aprovação.
   */
  const maximumDifference =
    1000 * 60 * 60 * 30 * 24;

  const minimumTimestamp =
    hallCreatedAt -
    maximumDifference;

  const maximumTimestamp =
    hallCreatedAt +
    maximumDifference;

  const allApprovalMessages = [];
  let beforeId = null;
  let reachedHallPeriod = false;

  while (true) {
    const fetchOptions =
      beforeId
        ? {
            limit: 100,
            before: beforeId
          }
        : {
            limit: 100
          };

    const fetchedMessages =
      await approvalChannel.messages
        .fetch(
          fetchOptions
        )
        .catch(() => null);

    if (
      !fetchedMessages ||
      fetchedMessages.size === 0
    ) {
      break;
    }

    allApprovalMessages.push(
      ...fetchedMessages.values()
    );

    const oldestMessage =
      fetchedMessages.last();

    beforeId =
      oldestMessage?.id ||
      null;

    if (
      oldestMessage?.createdTimestamp &&
      oldestMessage.createdTimestamp <=
        maximumTimestamp
    ) {
      reachedHallPeriod = true;
    }

    if (
      reachedHallPeriod &&
      oldestMessage?.createdTimestamp &&
      oldestMessage.createdTimestamp <
        minimumTimestamp
    ) {
      break;
    }

    if (
      fetchedMessages.size < 100
    ) {
      break;
    }
  }

  function getApprovalImages(
    approvalMessage
  ) {
    const attachmentUrls =
      uniqueImageUrls(
        [
          ...approvalMessage
            .attachments
            .values()
        ]
          .map(attachment =>
            attachment.url
          )
          .filter(Boolean)
      ).slice(0, 4);

    const embedImageUrls = [];
    const imageFieldUrls = [];
    let expectedImageCount = 0;

    for (
      const embed of
        approvalMessage.embeds || []
    ) {
      if (
        embed.image?.url
      ) {
        embedImageUrls.push(
          embed.image.url
        );
      }

      for (
        const field of
          embed.fields || []
      ) {
        if (
          /imagem/i.test(
            field.name || ""
          ) ||
          /image/i.test(
            field.name || ""
          )
        ) {
          const fieldValue =
            String(
              field.value || ""
            );

          const urls =
            fieldValue.match(
              /https?:\/\/\S+/gi
            ) || [];

          imageFieldUrls.push(
            ...urls
          );

          const numberedImages =
            fieldValue.match(
              /Imagem\s+\d+\s*:/gi
            ) || [];

          expectedImageCount =
            Math.max(
              expectedImageCount,
              numberedImages.length
            );
        }
      }
    }

    const officialFieldImageUrls =
      uniqueImageUrls(
        imageFieldUrls
      ).slice(0, 4);

    /*
     * Os registros antigos podem possuir parte
     * das imagens no campo "Imagens" e outra
     * parte como anexos reais da mensagem.
     *
     * Por isso, não podemos retornar apenas uma
     * das fontes. Precisamos juntar as duas.
     */
    const primaryImageUrls =
      uniqueImageUrls([
        ...officialFieldImageUrls,
        ...attachmentUrls
      ]).slice(0, 4);

    if (
      primaryImageUrls.length > 0
    ) {
      return {
        images:
          primaryImageUrls,

        expectedImageCount:
          expectedImageCount > 0
            ? expectedImageCount
            : primaryImageUrls.length
      };
    }

    const fallbackImageUrls =
      uniqueImageUrls(
        embedImageUrls
      ).slice(0, 4);

    return {
      images:
        fallbackImageUrls,

      expectedImageCount:
        expectedImageCount > 0
          ? expectedImageCount
          : fallbackImageUrls.length
    };
  }

  const candidates =
    allApprovalMessages
      .map(message => {
        const embedText =
          (
            message.embeds || []
          )
            .map(embed =>
              [
                embed.title,
                embed.description,
                ...(
                  embed.fields || []
                ).map(field =>
                  `${field.name}\n${field.value}`
                )
              ]
                .filter(Boolean)
                .join("\n")
            )
            .join("\n");

        const fullText =
          `${message.content || ""}\n${embedText}`;

        const normalizedFullText =
          normalizeHallName(
            fullText
          );

        const messageCityKey =
          resolveCityKeyFromAnyText(
            fullText
          );

        const messageEventField =
          (
            message.embeds || []
          )
            .flatMap(embed =>
              embed.fields || []
            )
            .find(field =>
              /evento/i.test(
                field.name || ""
              )
            );

        const messageEventName =
          normalizeHallName(
            messageEventField?.value ||
            ""
          );

        const winnerField =
          (
            message.embeds || []
          )
            .flatMap(embed =>
              embed.fields || []
            )
            .find(field =>
              /vencedores/i.test(
                field.name || ""
              )
            );

        const normalizedWinnerText =
          normalizeHallName(
            winnerField?.value ||
            fullText
          );

        const matchedWinners =
          normalizedHallWinners
            .filter(winnerName =>
              normalizedWinnerText
                .includes(
                  winnerName
                )
            );

        const allWinnersMatch =
          normalizedHallWinners.length === 0 ||
          matchedWinners.length ===
            normalizedHallWinners.length;

        const eventMatches =
          hallEventName &&
          hallEventName !== "evento" &&
          (
            messageEventName ===
              hallEventName ||
            normalizedFullText
              .includes(
                hallEventName
              )
          );

        const cityMatches =
          messageCityKey ===
            hallCityKey;

        const isApproved =
          normalizedFullText
            .includes(
              "hall da fama aprovado"
            );

        const approvalImages =
          getApprovalImages(
            message
          );

        const images =
          approvalImages.images;

        const expectedImageCount =
          approvalImages
            .expectedImageCount;

        const diff =
          Math.abs(
            (
              message.createdTimestamp ||
              0
            ) -
            hallCreatedAt
          );

        return {
          message,
          diff,
          images,
          expectedImageCount,
          isApproved,
          eventMatches,
          cityMatches,
          allWinnersMatch,
          matchedWinnerCount:
            matchedWinners.length
        };
      })
      .filter(candidate => {
        if (
          !candidate.isApproved
        ) {
          return false;
        }

        if (
          candidate.diff >
          maximumDifference
        ) {
          return false;
        }

        if (
          !candidate.eventMatches
        ) {
          return false;
        }

        if (
          !candidate.cityMatches
        ) {
          return false;
        }

        if (
          !candidate.allWinnersMatch
        ) {
          return false;
        }

        if (
          candidate.images.length === 0
        ) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (
          b.matchedWinnerCount !==
          a.matchedWinnerCount
        ) {
          return (
            b.matchedWinnerCount -
            a.matchedWinnerCount
          );
        }

        return (
          a.diff -
          b.diff
        );
      });

  const selectedCandidate =
    candidates[0] ||
    null;

  if (!selectedCandidate) {
    return {
      found: false,
      messageId: null,
      images: [],
      expectedImageCount: 0,
      reason:
        "Nenhuma aprovação exata encontrada"
    };
  }
  return {
    found: true,

    messageId:
      selectedCandidate
        .message
        .id,

    images:
      selectedCandidate
        .images,

    expectedImageCount:
      selectedCandidate
        .expectedImageCount,

    reason:
      "Aprovação exata encontrada"
  };
}

  async function autoCorrectDuplications(channel, client, options = {}) {
    const showProgress = options.showProgress ?? true;
    const scanStartedAt = Date.now();

    try {
      let allMessages = [];
      let beforeId = null;

      await clearOldHallManualReviewMessages(client);

      if (showProgress) {
        await updateHallScanProgress(client, {
          status: "Iniciando busca completa no canal de Hall da Fama...",
          forceNewApprovalPanel: true,
          currentDate: "Preparando...",
          currentEvent: "Preparando...",
          currentCity: "Preparando..."
        });

        await sendHallScanLog(client, {
          title: "🚀 Varredura iniciada",
          color: "#2ecc71",
          description: "O bot começou a buscar mensagens antigas no canal oficial do Hall da Fama.",
          phase: "Busca de mensagens"
        });
      }

      while (true) {
        const fetchOptions = beforeId
          ? { limit: 100, before: beforeId }
          : { limit: 100 };

        const messages = await channel.messages.fetch(fetchOptions).catch(() => null);

        if (!messages || messages.size === 0) break;

        allMessages.push(...messages.values());
        beforeId = messages.last()?.id;

        if (showProgress && (allMessages.length === 100 || allMessages.length % 500 === 0)) {
          const lastMsg = messages.last();

          await updateHallScanProgress(client, {
            status: "Buscando mensagens antigas do canal...",
            totalMessages: allMessages.length,
            currentDate: lastMsg?.createdTimestamp ? `<t:${Math.floor(lastMsg.createdTimestamp / 1000)}:F>` : "Não identificado",
            currentHallPostedAt: lastMsg?.createdTimestamp ? `<t:${Math.floor(lastMsg.createdTimestamp / 1000)}:F>` : "Não identificado",
            currentHallAuthor: lastMsg?.author ? `${lastMsg.author.tag || lastMsg.author.username} (\`${lastMsg.author.id}\`)` : "Não identificado",
            currentHallUrl: getMessageJumpUrl(lastMsg),
            currentEvent: "Ainda buscando mensagens...",
            currentCity: "Ainda buscando mensagens..."
          });

          await sendHallScanLog(client, {
            title: "📥 Busca em andamento",
            description: `O bot já buscou **${allMessages.length}** mensagens.`,
            totalMessages: allMessages.length,
            phase: "Busca de mensagens",
            currentHall: lastMsg?.content || "Mensagem sem conteúdo textual.",
            currentHallPostedAt: lastMsg?.createdTimestamp ? `<t:${Math.floor(lastMsg.createdTimestamp / 1000)}:F>` : "Não identificado",
            currentHallAuthor: lastMsg?.author ? `${lastMsg.author.tag || lastMsg.author.username} (\`${lastMsg.author.id}\`)` : "Não identificado",
            currentHallUrl: getMessageJumpUrl(lastMsg)
          });
        }

        if (messages.size < 100) break;
      }

      if (allMessages.length === 0) {
        if (showProgress) {
          await updateHallScanProgress(client, {
            status: "Nenhuma mensagem encontrada no canal.",
            totalMessages: 0,
            currentDate: "Finalizado",
            currentEvent: "Nenhum",
            currentCity: "Nenhuma"
          });

          await sendHallScanLog(client, {
            title: "⚠️ Nenhuma mensagem encontrada",
            color: "#f1c40f",
            description: "A varredura terminou sem encontrar mensagens no canal.",
            phase: "Finalizado"
          });
        }
        return;
      }

      const previousRankings = loadHallRankings();
      let rankings = createEmptyHallRankingData(previousRankings);

      const hallMessages = allMessages.filter(m => {
        const text = getHallMessageText(m);
        const normalized = normalizeHallName(text);

        if (!normalized.includes("hall da fama")) return false;
        if (normalized.includes("ranking de orgs")) return false;
        if (normalized.includes("ranking de pessoas")) return false;
        if (normalized.includes("top 10 organizacoes")) return false;
        if (normalized.includes("top 10 pessoas")) return false;
        if (normalized.includes("revisao manual")) return false;
        if (normalized.includes("varredura hall da fama")) return false;

        return true;
      });

      const botHallMessages = hallMessages.filter(m => {
  const text = getHallMessageText(m);

  return (
    m.author.id === client.user.id &&
    text.includes("Santa Creators :") &&
    normalizeHallName(text).includes("hall da fama")
  );
});

const humanHallMessages =
  allMessages.filter(message => {
    if (
      !message ||
      message.author?.bot
    ) {
      return false;
    }

    const messageText =
      getHallMessageText(message);

    const hasText =
      String(messageText || "")
        .trim()
        .length > 0;

    const hasAttachments =
      message.attachments?.size > 0;

    const hasEmbeds =
      message.embeds?.length > 0;

    return (
      hasText ||
      hasAttachments ||
      hasEmbeds
    );
  });

for (
  const humanHallMessage
  of humanHallMessages.values()
) {
  await queueHistoricalHallReview(
    client,
    humanHallMessage
  ).catch(async error => {
    await sendHallScanLog(
      client,
      {
        title:
          "⚠️ Falha ao preparar recriação de Hall humano",

        color:
          "#e74c3c",

        description:
          `Mensagem: \`${humanHallMessage.id}\`\n` +
          `Erro: \`${error?.message || error}\`\n\n` +
          `O Hall original foi mantido e não será apagado.`,

        phase:
          "Migração de Hall humano",

        currentHall:
          getHallMessageText(
            humanHallMessage
          ),

        currentHallPostedAt:
          humanHallMessage.createdTimestamp
            ? `<t:${Math.floor(
                humanHallMessage.createdTimestamp /
                1000
              )}:F>`
            : "Não identificado",

        currentHallAuthor:
          humanHallMessage.author
            ? (
                `${humanHallMessage.author.tag || humanHallMessage.author.username} ` +
                `(\`${humanHallMessage.author.id}\`)`
              )
            : "Não identificado",

        currentHallUrl:
          getMessageJumpUrl(
            humanHallMessage
          )
      }
    ).catch(() => {});
  });
}

let edited = 0;
let correctionProcessed = 0;

      if (showProgress) {
        await updateHallScanProgress(client, {
          status: "Mensagens buscadas. Iniciando correção dos Halls do bot...",
          totalMessages: allMessages.length,
          totalHalls: hallMessages.length,
          botHalls: botHallMessages.length,
          edited,
          processed: 0,
          pending: Object.keys(rankings.pendingReview || {}).length,
          currentDate: "Separando Halls...",
          currentEvent: "Separando Halls...",
          currentCity: "Separando Halls..."
        });

        await sendHallScanLog(client, {
          title: "🏆 Halls encontrados",
          color: "#3498db",
          description:
            `Busca concluída.\n\n` +
            `📥 Mensagens buscadas: **${allMessages.length}**\n` +
            `🏆 Halls encontrados: **${hallMessages.length}**\n` +
            `🤖 Halls do bot corrigíveis: **${botHallMessages.length}**`,
          totalMessages: allMessages.length,
          totalHalls: hallMessages.length,
          phase: "Filtro de Halls"
        });
      }

      for (const msg of botHallMessages.values()) {
        correctionProcessed++;

        const text =
          getHallMessageText(msg);

        const parts =
          extractHallParts(text);

        const approvalImageData =
          await findApprovalImagesForHall(
            client,
            msg,
            {
              eventName:
                parts.eventName,

              winnerNames:
                extractWinnerNamesForApprovalMatch(
                  text
                )
            }
          );

        const originalImageUrls =
          approvalImageData.found
            ? uniqueImageUrls(
                approvalImageData.images
              ).slice(0, 4)
            : [];

        const expectedApprovedImageCount =
          approvalImageData.found
            ? (
                approvalImageData
                  .expectedImageCount ||
                originalImageUrls.length
              )
            : 0;

        const hallTopCount =
          countHallTopLines(
            parts.winnersText ||
            text
          );

        const shouldKeepImagesAsLinks =
          approvalImageData.found &&
          originalImageUrls.length > 0 &&
          (
            expectedApprovedImageCount > 1 ||
            hallTopCount > 1
          );

        const approvedImageFiles =
          approvalImageData.found &&
          !shouldKeepImagesAsLinks
            ? await downloadUniqueApprovedHallImages(
                originalImageUrls
              )
            : [];

        const downloadedApprovedImageCount =
          approvedImageFiles.length;

        const canRestoreApprovedImages =
          approvalImageData.found &&
          !shouldKeepImagesAsLinks &&
          expectedApprovedImageCount === 1 &&
          downloadedApprovedImageCount === 1;

        const evidence =
          await resolveHallEvidence(
            client,
            msg,
            text
          );

        const currentCityKey =
          detectHallCityKey(
            msg.content ||
            text
          );

        const evidenceCityKey =
          evidence?.cityKey ||
          currentCityKey;

        const canAutoFixCity =
          evidenceCityKey &&
          evidenceCityKey !== currentCityKey &&
          evidence?.confidence >= 90 &&
          !evidence?.needsManualReview &&
          evidence?.source !== "texto_do_hall" &&
          !String(
            evidence?.source || ""
          ).includes(
            "texto_do_hall + texto_do_hall"
          );

        const needsManualCityReview =
          Boolean(
            evidence?.needsManualReview
          ) ||
          (
            evidenceCityKey &&
            evidenceCityKey !== currentCityKey &&
            evidence?.confidence < 90
          );

        const fixedBase =
          fixDuplicatedHallContent(
            msg.content || text,
            originalImageUrls,
            msg.id
          );

        const fixedWithUrls =
          canAutoFixCity
            ? updateHallCityOnly(
                fixedBase,
                CITIES[
                  evidenceCityKey
                ].label,
                originalImageUrls
              )
            : fixedBase;

        const currentAttachments = [
          ...msg.attachments.values()
        ];

        const imageEditData =
          canRestoreApprovedImages
            ? {
                attachments: [],

                files:
                  approvedImageFiles,

                shouldReplaceAttachments:
                  true,

                reuploadedExisting:
                  true,

                hasImages:
                  approvedImageFiles.length >
                  0
              }
            : {
                attachments:
                  currentAttachments.map(
                    attachment => ({
                      id:
                        attachment.id
                    })
                  ),

                files: [],

                shouldReplaceAttachments:
                  false,

                reuploadedExisting:
                  false,

                hasImages:
                  currentAttachments.length >
                    0 ||
                  (
                    shouldKeepImagesAsLinks &&
                    originalImageUrls.length >
                      0
                  )
              };

        const fixed =
          shouldKeepImagesAsLinks
            ? fixedWithUrls
            : (
                imageEditData.hasImages
                  ? removeHallImageUrlsFromContent(
                      fixedWithUrls,
                      originalImageUrls
                    )
                  : fixedWithUrls
              );

        if (needsManualCityReview) {
          await sendHallCityToManualReview(
            client,
            msg,
            evidence,
            currentCityKey
          );
        }

        if (canAutoFixCity) {
          await autoFixEventosDiariosCityIfNeeded(
            client,
            msg,
            evidence
          );
        }
        const needsContentUpdate =
          fixed !== msg.content;

        const needsImageConversion =
          canRestoreApprovedImages;

        const needsAttachmentCleanup =
          canRestoreApprovedImages;

        const needsImageLinkRecovery =
          shouldKeepImagesAsLinks &&
          originalImageUrls.some(
            imageUrl =>
              !String(
                msg.content || ""
              ).includes(
                imageUrl
              )
          );

        if (
          (
            needsContentUpdate ||
            needsImageConversion ||
            needsAttachmentCleanup ||
            needsImageLinkRecovery
          ) &&
          fixed.length <= 2000 &&
          fixed.includes(
            "HALL DA FAMA"
          )
        ) {
          const editPayload = {
            content: fixed
          };

          if (
            imageEditData.shouldReplaceAttachments ||
            imageEditData.attachments.length >
              0
          ) {
            editPayload.attachments =
              imageEditData.attachments;
          }

          if (
            imageEditData.files.length >
            0
          ) {
            editPayload.files =
              imageEditData.files;
          }

          await msg.edit(
            editPayload
          ).catch(error => {
            console.error(
              `[HallDaFama] Não foi possível corrigir a mensagem ${msg.id}:`,
              error
            );
          });

          msg.content =
            fixed;

          edited++;

          await sendHallScanLog(
            client,
            {
              title:
                canRestoreApprovedImages
                  ? "🖼️ Hall restaurado pela aprovação original"
                  : (
                      canAutoFixCity
                        ? "✅ Hall corrigido com cidade/cargo certo"
                        : "🧹 Hall limpo sem trocar cidade"
                    ),

              color:
                canRestoreApprovedImages
                  ? "#2ecc71"
                  : (
                      canAutoFixCity
                        ? "#2ecc71"
                        : "#5865f2"
                    ),

              description:
                `Mensagem corrigida: \`${msg.id}\`\n` +
                `Cidade antiga: **${CITIES[currentCityKey]?.label || currentCityKey}**\n` +
                `Cidade aplicada: **${canAutoFixCity ? CITIES[evidenceCityKey]?.label || evidenceCityKey : CITIES[currentCityKey]?.label || currentCityKey}**\n` +
                `Fonte da cidade: **${evidence?.source || "não identificada"}**\n` +
                `Confiança: **${evidence?.confidence || 0}%**\n` +
                `Registro aprovado: **${approvalImageData.found ? approvalImageData.messageId : "não encontrado"}**\n` +
                `Imagens esperadas: **${expectedApprovedImageCount}**\n` +
                `Imagens baixadas: **${downloadedApprovedImageCount}**\n` +
                `Imagens restauradas: **${canRestoreApprovedImages ? downloadedApprovedImageCount : 0}**`,

              phase:
                "Correção automática",

              currentHall:
                fixed,

              currentHallPostedAt:
                msg.createdTimestamp
                  ? `<t:${Math.floor(msg.createdTimestamp / 1000)}:F>`
                  : "Não identificado",

              currentHallAuthor:
                msg.author
                  ? `${msg.author.tag || msg.author.username} (\`${msg.author.id}\`)`
                  : "Não identificado",

              currentHallUrl:
                getMessageJumpUrl(
                  msg
                ),

              currentEvent:
                parts.eventName ||
                "Evento não identificado",

              currentCity:
                canAutoFixCity
                  ? CITIES[evidenceCityKey]?.label ||
                    evidenceCityKey
                  : CITIES[currentCityKey]?.label ||
                    currentCityKey,

              confidence:
                evidence?.confidence ||
                0
            }
          );
        }

        if (
          showProgress &&
          (
            correctionProcessed === 1 ||
            correctionProcessed % 10 === 0 ||
            correctionProcessed ===
              botHallMessages.length
          )
        ) {
          await updateHallScanProgress(
            client,
            {
              status:
                "Corrigindo Halls do bot quando necessário...",

              totalMessages:
                allMessages.length,

              totalHalls:
                hallMessages.length,

              botHalls:
                botHallMessages.length,

              edited,

              processed: 0,

              progressCurrent:
                correctionProcessed,

              progressTotal:
                botHallMessages.length,

              pending:
                Object.keys(
                  rankings.pendingReview ||
                  {}
                ).length,

              currentDate:
                msg.createdTimestamp
                  ? `<t:${Math.floor(msg.createdTimestamp / 1000)}:F>`
                  : "Não identificado",

              currentHallPostedAt:
                msg.createdTimestamp
                  ? `<t:${Math.floor(msg.createdTimestamp / 1000)}:F>`
                  : "Não identificado",

              currentHallAuthor:
                msg.author
                  ? `${msg.author.tag || msg.author.username} (\`${msg.author.id}\`)`
                  : "Não identificado",

              currentHallUrl:
                getMessageJumpUrl(
                  msg
                ),

              currentEvent:
                parts.eventName ||
                "Evento não identificado",

              currentCity:
                parts.cityName ||
                detectHallCityName(
                  text
                ),

              phase:
                "Correção automática"
            }
          );
        }
      }

      const sortedHallMessages =
        hallMessages
          .filter(message => {
            const migration =
              state.historicalHallMigrations?.[
                message.id
              ];

            if (
              migration?.status ===
              "completed"
            ) {
              return false;
            }

            return true;
          })
          .sort((a, b) => {
            return (
              (a.createdTimestamp || 0) -
              (b.createdTimestamp || 0)
            );
          });

      let processed = 0;

for (const msg of sortedHallMessages) {
  let text = "";
  let evidence = {
    cityKey: "nobre",
    eventName: "Evento",
    source: "erro_antes_de_ler",
    confidence: 0
  };
  let cityKey = "nobre";
  let eventName = "Evento";
  let cityName = "Cidade Nobre";

  try {
    text = getHallMessageText(msg);
    evidence = await resolveHallEvidence(client, msg, text);
    cityKey = evidence.cityKey || "nobre";
    eventName = evidence.eventName || "Evento";
    cityName = CITIES[cityKey]?.label || "Cidade Nobre";

    await addHallToRankings(rankings, msg, client);
  } catch (err) {
    await sendHallScanLog(client, {
      title: "⚠️ Hall ignorado por erro individual",
      color: "#f1c40f",
      description:
        `Um Hall deu erro durante a leitura, mas a varredura continuou normalmente.\n\n` +
        `Mensagem: \`${msg.id}\`\n` +
        `Erro: \`${err?.message || err}\``,
      phase: "Erro individual",
      currentHall: text || getHallMessageText(msg),
      currentHallUrl: getMessageJumpUrl(msg)
    }).catch(() => {});
  }

  processed++;

  if (showProgress && (processed === 1 || processed % 10 === 0 || processed === sortedHallMessages.length)) {
          await publishHallRankingsDuringScan(client, rankings);

          await updateHallScanProgress(client, {
            status: "Analisando Halls e montando rankings.",
            totalMessages: allMessages.length,
            totalHalls: hallMessages.length,
            botHalls: botHallMessages.length,
            edited,
            processed,
            pending: Object.keys(rankings.pendingReview || {}).length,
            currentDate: msg.createdTimestamp ? `<t:${Math.floor(msg.createdTimestamp / 1000)}:F>` : "Não identificado",
            currentHallPostedAt: msg.createdTimestamp ? `<t:${Math.floor(msg.createdTimestamp / 1000)}:F>` : "Não identificado",
            currentHallAuthor: msg.author ? `${msg.author.tag || msg.author.username} (\`${msg.author.id}\`)` : "Não identificado",
            currentHallUrl: getMessageJumpUrl(msg),
            currentEvent: eventName,
            currentCity: cityName,
            phase: "Processamento de ranking"
          });

          await sendHallScanLog(client, {
            title: "📊 Hall processado",
            description:
              `Progresso: **${processed}/${sortedHallMessages.length}**\n` +
              `Evento: **${eventName}**\n` +
              `Cidade: **${cityName}**\n` +
              `Fonte usada: **${evidence.source || "não identificada"}**\n` +
              `Confiança: **${evidence.confidence || 0}%**`,
            totalMessages: allMessages.length,
            totalHalls: hallMessages.length,
            processed,
            edited,
            pending: Object.keys(rankings.pendingReview || {}).length,
            phase: "Processamento de ranking",
            currentHall: text,
            currentHallPostedAt: msg.createdTimestamp ? `<t:${Math.floor(msg.createdTimestamp / 1000)}:F>` : "Não identificado",
            currentHallAuthor: msg.author ? `${msg.author.tag || msg.author.username} (\`${msg.author.id}\`)` : "Não identificado",
            currentHallUrl: getMessageJumpUrl(msg),
            currentEvent: eventName,
            currentCity: cityName,
            confidence: evidence.confidence || 0
          });
        }
      }

await addPaymentEventsToPlayerRankings(rankings, client);

normalizeExistingPlayerRankingOverrides(rankings);
await sendPlayerIdentitySimilarityReviews(client, rankings);

saveHallRankings(rankings);
await publishHallRankings(client, rankings);

      const durationSeconds = Math.floor((Date.now() - scanStartedAt) / 1000);

      if (showProgress) {
        await updateHallScanProgress(client, {
          status: `Finalizado em ${durationSeconds}s. Dashboards atualizados.`,
          totalMessages: allMessages.length,
          totalHalls: hallMessages.length,
          botHalls: botHallMessages.length,
          edited,
          processed,
          pending: Object.keys(rankings.pendingReview || {}).length,
          currentDate: "Finalizado",
          currentEvent: "Todos os eventos processados",
          currentCity: "Todas as cidades analisadas"
        });

        await sendHallScanLog(client, {
          title: "✅ Varredura finalizada",
          color: "#2ecc71",
          description:
            `A varredura foi finalizada com sucesso em **${durationSeconds}s**.\n\n` +
            `🏆 Halls encontrados: **${hallMessages.length}**\n` +
            `📊 Halls processados: **${processed}**\n` +
            `✏️ Halls editados: **${edited}**\n` +
            `⚠️ Revisões pendentes: **${Object.keys(rankings.pendingReview || {}).length}**`,
          totalMessages: allMessages.length,
          totalHalls: hallMessages.length,
          processed,
          edited,
          pending: Object.keys(rankings.pendingReview || {}).length,
          phase: "Finalizado"
        });
      }
    } catch (e) {
      console.error("[HallDaFama] Erro na varredura automática:", e);

      if (showProgress) {
        await updateHallScanProgress(client, {
          status: "Erro durante a varredura. Veja o canal de logs.",
        });

        await sendHallScanLog(client, {
          title: "❌ Erro na varredura",
          color: "#e74c3c",
          description: `Erro capturado:\n\`\`\`${String(e?.stack || e).slice(0, 1500)}\`\`\``,
          phase: "Erro"
        });
      }
    }
  }

  // ================= HELPERS =================
  function hasPermission(member, userId) {
    if (ALLOWED_USERS.includes(userId)) return true;
    return member?.roles?.cache?.some((r) => ALLOWED_ROLES.includes(r.id)) || false;
  }

  function canApprove(member, userId) {
    if (ALLOWED_USERS.includes(userId)) return true;
    return member?.roles?.cache?.some((r) => APPROVER_ROLES.includes(r.id)) || false;
  }

  function buildControlButtons() {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(BTN_OPEN_MENU)
        .setLabel("🏆 Registrar Hall da Fama")
        .setStyle(ButtonStyle.Success)
        .setEmoji("👑"),
new ButtonBuilder()
.setCustomId(BTN_EDIT_LAST)
.setLabel("✏️ Editar Evento/TOPs")
.setStyle(ButtonStyle.Secondary)
.setEmoji("✍️"),
      new ButtonBuilder()
        .setCustomId(BTN_EDIT_PRIZES)
        .setLabel("🎁 Editar Premiações")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("💰"),
          new ButtonBuilder()
    .setCustomId(BTN_EDIT_CITY)
    .setLabel("🌆 Editar Última CDD")
    .setStyle(ButtonStyle.Secondary)
    .setEmoji("🌆"),
      new ButtonBuilder()
        .setCustomId(BTN_SCAN_ALL)
        .setLabel("🧹 Varredura Geral")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("🧹")
    );
  }

  function buildOldHallEditButtons() {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(BTN_EDIT_BY_LINK)
        .setLabel("🔗 Editar Hall Antigo")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🔗")
    );
  }

  async function ensureButtonAtBottom(channel, client, force = true) {
    try {
      const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
      if (!messages) return;

    const myMsgs = messages.filter((m) => {
      if (m.author.id !== client.user.id || m.components.length === 0) return false;

      const allButtons = m.components.flatMap(row => row.components || []);
      return allButtons.some(c => [
        BTN_OPEN_MENU,
        BTN_EDIT_LAST,
        BTN_EDIT_PRIZES,
        BTN_EDIT_CITY,
        BTN_EDIT_BY_LINK,
        BTN_SCAN_ALL
      ].includes(c.customId));
    });

      // ✅ Checa se já existe um painel de botões ATUALIZADO com o botão de edição por link
    const upToDateMsg = myMsgs.find((m) => {
      const allButtons = m.components.flatMap(row => row.components || []);
      return allButtons.some(c => c.customId === BTN_EDIT_BY_LINK);
    });

      // Se não for forçado e já existir um painel atualizado, não faz nada.
      if (!force && upToDateMsg) return;

      // Apaga todas as mensagens de botão antigas/desatualizadas do bot
      for (const m of myMsgs.values()) {
        await m.delete().catch(() => {});
      }

      await channel.send({
        components: [
          buildControlButtons(),
          buildOldHallEditButtons()
        ]
      });
    } catch (e) {
      console.error("[HallDaFama] Erro ao mover botão:", e);
    }
  }

  function buildHallDaFamaModal(cityKey, defaultEventName, eventKey = "auto") {
    const defaultCityName = CITIES[cityKey]?.label || "Cidade";
    const modal = new ModalBuilder()
      .setCustomId(`${MODAL_SUBMIT}:${cityKey}:${eventKey}`)
      .setTitle(`Hall da Fama - ${defaultCityName}`);

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("hf_event_name")
          .setLabel("Nome do Evento")
          .setPlaceholder("Ex: SANTA DO CRIME")
          .setStyle(TextInputStyle.Short)
          .setValue(defaultEventName || "")
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("hf_custom_city")
              .setLabel("Cidade (Opcional - deixe vazio p/ auto)")
              .setPlaceholder(`Vazio = ${defaultCityName}`)
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
          ),
          new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("hf_tops")
          .setLabel("Vencedores (Um por linha, TOP 1 no topo)")
          .setPlaceholder("Ex:\nMacedo | 123\nJoao | 456\nMaria | 789")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
      ),
new ActionRowBuilder().addComponents(
  new TextInputBuilder()
    .setCustomId("hf_images")
    .setLabel("Links das Imagens (Opcional)")
    .setPlaceholder("Opcional: cole até 4 links aqui, um por linha ou separados por espaço.")
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(4000)
    .setRequired(false)
)
    );
    return modal;
  }

  // ================= EXPORTS =================

  export async function hallDaFamaOnReady(client) {
    if (client.__HALL_DA_FAMA_READY_RAN__) return;
    client.__HALL_DA_FAMA_READY_RAN__ = true;

state = loadState();

state.pendingRequests ??= {};
state.historicalHallReviews ??= {};
state.historicalHallMigrations ??= {};
state.historicalRankingRebuildPending ??= false;

saveState(state);

const channel =
  await client.channels
    .fetch(HALL_CHANNEL_ID)
    .catch(() => null);
    if (
      channel &&
      channel.isTextBased()
    ) {
      await ensureButtonAtBottom(
        channel,
        client,
        true
      );

      await ensureHallRankingsDashboards(
        client
      );

      await syncHistoricalReviewPanels(
        client
      );

      if (
        (
          shouldRunHallScanToday() ||
          state.historicalRankingRebuildPending
        ) &&
        !hallScanRunning
      ) {
        hallScanRunning =
          true;

        autoCorrectDuplications(
          channel,
          client,
          {
            showProgress:
              true
          }
        )
          .then(() => {
            state.historicalRankingRebuildPending =
              false;

            saveState(state);

            markHallScanDoneToday();
          })
          .catch(error => {
            state.historicalRankingRebuildPending =
              true;

            saveState(state);

            console.error(
              "[HallDaFama] Erro ao rodar varredura em segundo plano:",
              error
            );
          })
          .finally(() => {
            hallScanRunning =
              false;
          });
      }
    }
  }

export async function hallDaFamaHandleInteraction(interaction, client) {
  if (!interaction.guild) return false;

  // ================= RANKING PRIVADO — ORG / PLAYER =================

if (
  interaction.isButton() &&
  interaction.customId.startsWith(BTN_RANK_ORG_SEARCH)
) {
  const rawScope =
    interaction.customId.startsWith(`${BTN_RANK_ORG_SEARCH}:`)
      ? interaction.customId.slice(
          `${BTN_RANK_ORG_SEARCH}:`.length
        )
      : "geral";

  const cityKey =
    rawScope !== "geral" &&
    CITIES[rawScope]
      ? rawScope
      : null;

  const actionType =
    cityKey
      ? `org_search:${cityKey}`
      : "org_search:geral";

  const allowed =
    await ensureRankingAccessOrWL(
      interaction,
      actionType
    );

  if (!allowed) return true;

  const cityData =
    cityKey
      ? CITIES[cityKey]
      : null;

  const modal = new ModalBuilder()
    .setCustomId(
      `${MODAL_RANK_ORG_SEARCH}:${cityKey || "geral"}`
    )
    .setTitle(
      cityData
        ? `Pesquisar ORG - ${cityData.label}`
        : "Pesquisar ORG - Ranking Geral"
    );

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("rank_org_nome")
        .setLabel("Nome da ORG")
        .setPlaceholder("Ex: Morro do Sacola")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(50)
    )
  );

  await sendRankingPrivateLog(
    client,
    interaction,
    {
      action: "abriu_modal_pesquisa_org",
      type: "org",
      cityKey: cityKey || "geral"
    }
  );

  await interaction.showModal(modal);
  return true;
}

if (
  interaction.isButton() &&
  interaction.customId.startsWith(BTN_RANK_ORG_NEXT_PREFIX)
) {
  const rawData =
    interaction.customId.slice(
      BTN_RANK_ORG_NEXT_PREFIX.length
    );

  const parts = rawData.split(":");

  let rawScope = "geral";
  let page = 0;

  if (
    parts.length >= 2
  ) {
    rawScope =
      parts[0] || "geral";

    page =
      Number(parts[1]) || 0;
  } else {
    page =
      Number(parts[0]) || 0;
  }

  const cityKey =
    rawScope !== "geral" &&
    CITIES[rawScope]
      ? rawScope
      : null;

  const actionType =
    cityKey
      ? `org_next:${cityKey}`
      : "org_next:geral";

  const allowed =
    await ensureRankingAccessOrWL(
      interaction,
      actionType
    );

  if (!allowed) return true;

  await interaction.deferReply({
    ephemeral: true
  });

  const rankings =
    loadHallRankings();

  const result =
    buildPrivateRankingEmbed(
      rankings,
      "org",
      page,
      {
        cityKey
      }
    );

  await sendRankingPrivateLog(
    client,
    interaction,
    {
      action: "proxima_pagina",
      type: "org",
      cityKey: cityKey || "geral",
      page: result.page + 1
    }
  );

  await interaction.editReply({
    embeds: [result.embed],
    components: rankingButtons(
      "org",
      result.page,
      cityKey
    )
  });

  return true;
}

  if (interaction.isButton() && interaction.customId === BTN_RANK_PLAYER_SEARCH) {
    const allowed = await ensureRankingAccessOrWL(interaction, "player_search");
    if (!allowed) return true;

    const modal = new ModalBuilder()
      .setCustomId(MODAL_RANK_PLAYER_SEARCH)
      .setTitle("Pesquisar Pessoa no Ranking");

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("rank_player_nome")
          .setLabel("Nome")
          .setPlaceholder("Ex: Macedo")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(30)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("rank_player_id")
          .setLabel("ID")
          .setPlaceholder("Ex: 1000")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(10)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("rank_player_cidade")
          .setLabel("Cidade")
          .setPlaceholder("Ex: Nobre, Santa, Grande ou Maresia")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(20)
      )
    );

    await sendRankingPrivateLog(client, interaction, {
      action: "abriu_modal_pesquisa_player",
      type: "player"
    });

    await interaction.showModal(modal);
    return true;
  }

  if (interaction.isButton() && interaction.customId.startsWith(BTN_RANK_PLAYER_NEXT_PREFIX)) {
    const allowed = await ensureRankingAccessOrWL(interaction, "player_next");
    if (!allowed) return true;

    await interaction.deferReply({ ephemeral: true });

    const page = Number(interaction.customId.replace(BTN_RANK_PLAYER_NEXT_PREFIX, "")) || 0;
    const rankings = loadHallRankings();
    const result = buildPrivateRankingEmbed(rankings, "player", page);

    await sendRankingPrivateLog(client, interaction, {
      action: "proxima_pagina",
      type: "player",
      page: result.page + 1
    });

    await interaction.editReply({
      embeds: [result.embed],
      components: rankingButtons("player", result.page)
    });

    return true;
  }

if (
  interaction.isModalSubmit() &&
  interaction.customId.startsWith(MODAL_RANK_ORG_SEARCH)
) {
  await interaction.deferReply({
    ephemeral: true
  });

  const rawScope =
    interaction.customId.startsWith(`${MODAL_RANK_ORG_SEARCH}:`)
      ? interaction.customId.slice(
          `${MODAL_RANK_ORG_SEARCH}:`.length
        )
      : "geral";

  const cityKey =
    rawScope !== "geral" &&
    CITIES[rawScope]
      ? rawScope
      : null;

  const org =
    interaction.fields
      .getTextInputValue("rank_org_nome")
      ?.trim();

  const rankings =
    loadHallRankings();

  const result =
    buildPrivateRankingEmbed(
      rankings,
      "org",
      0,
      {
        org,
        cityKey
      }
    );

  await sendRankingPrivateLog(
    client,
    interaction,
    {
      action: "pesquisou_org",
      type: "org",
      org,
      cityKey: cityKey || "geral",
      page: 1
    }
  );

  await interaction.editReply({
    embeds: [result.embed],
    components: rankingButtons(
      "org",
      result.page,
      cityKey
    )
  });

  return true;
}

  if (interaction.isModalSubmit() && interaction.customId === MODAL_RANK_PLAYER_SEARCH) {
    const nome = interaction.fields.getTextInputValue("rank_player_nome")?.trim();
    const id = interaction.fields.getTextInputValue("rank_player_id")?.trim();
    const cidade = interaction.fields.getTextInputValue("rank_player_cidade")?.trim();

    if (!nome && !id) {
      return interaction.reply({
        content: "⚠️ Coloque pelo menos **nome** ou **ID** para buscar.",
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: true });

    const rankings = loadHallRankings();
    const result = buildPrivateRankingEmbed(rankings, "player", 0, { nome, id, cidade });

    await sendRankingPrivateLog(client, interaction, {
      action: "pesquisou_player",
      type: "player",
      nome,
      id,
      cidade,
      page: 1
    });

    await interaction.editReply({
      embeds: [result.embed],
      components: rankingButtons("player", result.page)
    });

    return true;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith(MODAL_RANK_WL_PREFIX)) {
    await interaction.deferReply({ ephemeral: true });

    const actionType = interaction.customId.replace(MODAL_RANK_WL_PREFIX, "");
    const nome = interaction.fields.getTextInputValue("rank_wl_nome")?.trim();
    const id = interaction.fields.getTextInputValue("rank_wl_id")?.trim();

    let member = interaction.member;
    try {
      member = await interaction.guild.members.fetch(interaction.user.id);
    } catch {}

    const result = await applyRankingWL(member, nome, id);

    await sendRankingPrivateLog(client, interaction, {
      action: "fez_wl_pelo_ranking",
      type: actionType,
      nome,
      id
    });

const orgAction =
  actionType.includes("org");

const actionParts =
  actionType.split(":");

const actionCityKey =
  orgAction &&
  actionParts.length >= 2 &&
  CITIES[actionParts[1]]
    ? actionParts[1]
    : null;

const row = new ActionRowBuilder().addComponents(
  new ButtonBuilder()
    .setCustomId(
      orgAction
        ? `${BTN_RANK_ORG_SEARCH}:${actionCityKey || "geral"}`
        : BTN_RANK_PLAYER_SEARCH
    )
    .setLabel(
      orgAction
        ? "Pesquisar ORG agora"
        : "Pesquisar Pessoa agora"
    )
    .setEmoji("🔎")
    .setStyle(ButtonStyle.Success)
);

    await interaction.editReply({
      content:
        `✅ WL processada!\n` +
        `Nick: \`${result.nick}\`\n` +
        `Cargo Cidadão: ${result.cidadaoOk ? "✅" : "⚠️"}\n` +
        `Cargo SEM WL removido: ${result.semWlOk ? "✅" : "⚠️"}\n\n` +
        `Agora aperta o botão abaixo pra abrir a pesquisa.`,
      components: [row]
    });

    return true;
  }

  // ✅ Botões de revisão manual dos Halls confusos
  if (
    interaction.isButton() &&
      (
        interaction.customId.startsWith(BTN_REVIEW_AS_ORG_PREFIX) ||
        interaction.customId.startsWith(BTN_REVIEW_AS_PLAYER_PREFIX) ||
        interaction.customId.startsWith(BTN_REVIEW_AS_BOTH_PREFIX)
      )
    ) {
      if (!canApprove(interaction.member, interaction.user.id)) {
        return interaction.reply({
          content: "🚫 Você não tem permissão para revisar esse Hall da Fama.",
          ephemeral: true
        });
      }

      await interaction.deferReply({ ephemeral: true });

      const asOrg = interaction.customId.startsWith(BTN_REVIEW_AS_ORG_PREFIX);
      const asPlayer = interaction.customId.startsWith(BTN_REVIEW_AS_PLAYER_PREFIX);
      const asBoth = interaction.customId.startsWith(BTN_REVIEW_AS_BOTH_PREFIX);

      const reviewId = interaction.customId
        .replace(BTN_REVIEW_AS_ORG_PREFIX, "")
        .replace(BTN_REVIEW_AS_PLAYER_PREFIX, "")
        .replace(BTN_REVIEW_AS_BOTH_PREFIX, "");

      const rankings = loadHallRankings();

      const pendingEntry = Object.values(rankings.pendingReview || {}).find(entry => {
        const entryReviewId = `${entry.messageId}_${normalizeHallKey(entry.rawLine || entry.name || "")}`.slice(0, 80);
        return entryReviewId === reviewId;
      });

      if (!pendingEntry) {
        return interaction.editReply("⚠️ Essa revisão não foi encontrada ou já foi resolvida.");
      }

      const hallMeta = {
        messageId: pendingEntry.messageId,
        channelId: pendingEntry.channelId || "",
        guildId: pendingEntry.guildId || interaction.guildId,
        jumpUrl: pendingEntry.jumpUrl || "",
        cityKey: pendingEntry.cityKey || "nobre",
        cityName: pendingEntry.cityName || CITIES[pendingEntry.cityKey]?.label || "Cidade Nobre",
        eventName: pendingEntry.eventName || "Evento",
        createdTimestamp: pendingEntry.createdAt || Date.now()
      };

      const targets = getManualReviewTargets(pendingEntry);

      if (asOrg || asBoth) {
        addOrgRankingPoint(rankings, {
          type: "org",
          orgName: targets.orgName || pendingEntry.name,
          cityKey: hallMeta.cityKey,
          rawLine: pendingEntry.rawLine
        }, hallMeta);
      }

      if (asPlayer || asBoth) {
        addPlayerRankingPoint(rankings, {
          type: "player",
          playerName: targets.playerName || pendingEntry.name,
          playerId: targets.playerId || pendingEntry.playerId || "",
          cityKey: hallMeta.cityKey,
          rawLine: pendingEntry.rawLine
        }, hallMeta);
      }

      delete rankings.pendingReview[pendingEntry.reviewKey];

      rankings.manualReviews ??= {};
      rankings.manualReviews[pendingEntry.reviewKey] = {
        ...pendingEntry,
        resolvedAs: asBoth ? "both" : asOrg ? "org" : "player",
        resolvedBy: interaction.user.id,
        resolvedAt: Date.now()
      };

      rankings.lastUpdatedAt = Date.now();

      saveHallRankings(rankings);
      await publishHallRankings(client, rankings);

      await interaction.message.edit({
        components: [],
        embeds: interaction.message.embeds.map(embed => {
          const fixed = EmbedBuilder.from(embed)
            .setColor(asBoth ? "#9b59b6" : asOrg ? "#3498db" : "#2ecc71")
            .setFooter({
              text: `Resolvido como ${asBoth ? "ORG + PESSOA" : asOrg ? "ORG" : "PESSOA"} por ${interaction.user.tag}`
            });

          return fixed;
        })
      }).catch(() => {});

      await interaction.editReply(`✅ Revisão resolvida como **${asBoth ? "ORG + PESSOA" : asOrg ? "ORG" : "PESSOA"}** e ranking atualizado.`);
      return true;
    }

    if (interaction.isButton() && interaction.customId.startsWith(BTN_PLAYER_IDENTITY_MERGE_PREFIX)) {
      if (!hasPermission(interaction.member, interaction.user.id)) {
        return interaction.reply({ content: "🚫 Sem permissão.", ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });

      const raw = interaction.customId.slice(BTN_PLAYER_IDENTITY_MERGE_PREFIX.length);
      const parts = raw.split(":");
      const cityKey = parts.pop();
      const reviewKey = parts.join(":");

      if (!CITIES[cityKey]) {
        return interaction.editReply("❌ Cidade inválida.");
      }

      const rankings = loadHallRankings();
      const pending = rankings.pendingPlayerIdentityReview?.[reviewKey];

      if (!pending) {
        return interaction.editReply("⚠️ Essa revisão já foi resolvida ou não existe mais.");
      }

      const merged = mergePlayerRankingInto(
        rankings,
        pending.playerAKey,
        pending.playerBKey,
        cityKey,
        interaction.user.id
      );

      if (!merged) {
        return interaction.editReply("❌ Não consegui juntar essas pessoas. Rode a varredura novamente e tente de novo.");
      }

      delete rankings.pendingPlayerIdentityReview[reviewKey];

      rankings.lastUpdatedAt = Date.now();
      saveHallRankings(rankings);
      await publishHallRankings(client, rankings);

      const doneEmbed = new EmbedBuilder()
        .setColor("#2ecc71")
        .setTitle(`✅ Identidade revisada e juntada em ${CITIES[cityKey].label}`)
        .addFields(
          {
            name: "👤 Pessoa A",
            value:
              `**${pending.playerA?.name || "Sem nome"}** | \`${pending.playerA?.playerId || "Sem ID"}\`\n` +
              `Cidade anterior: ${pending.playerA?.cityName || "Não definida"}\n` +
              `Registro: ${pending.playerA?.link ? `[Abrir registro](${pending.playerA.link})` : "Sem link encontrado"}`,
            inline: false
          },
          {
            name: "👤 Pessoa B",
            value:
              `**${pending.playerB?.name || "Sem nome"}** | \`${pending.playerB?.playerId || "Sem ID"}\`\n` +
              `Cidade anterior: ${pending.playerB?.cityName || "Não definida"}\n` +
              `Registro: ${pending.playerB?.link ? `[Abrir registro](${pending.playerB.link})` : "Sem link encontrado"}`,
            inline: false
          },
          {
            name: "🏙️ Cidade final",
            value: `${CITIES[cityKey].emoji} **${CITIES[cityKey].label}**`,
            inline: true
          },
          {
            name: "👮 Revisado por",
            value: `<@${interaction.user.id}>`,
            inline: true
          }
        )
        .setTimestamp();

      await interaction.message.edit({
        content: "",
        embeds: [doneEmbed],
        components: []
      }).catch(() => {});

      await interaction.editReply("✅ Pessoas juntadas e ranking atualizado.");
      return true;
    }

    if (interaction.isButton() && interaction.customId.startsWith(BTN_PLAYER_IDENTITY_SEPARATE_PREFIX)) {
      if (!hasPermission(interaction.member, interaction.user.id)) {
        return interaction.reply({ content: "🚫 Sem permissão.", ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });

      const reviewKey = interaction.customId.slice(BTN_PLAYER_IDENTITY_SEPARATE_PREFIX.length);
      const rankings = loadHallRankings();
      const pending = rankings.pendingPlayerIdentityReview?.[reviewKey];

      if (!pending) {
        return interaction.editReply("⚠️ Essa revisão já foi resolvida ou não existe mais.");
      }

      rankings.manualPlayerIdentityMerges ??= {};
      rankings.manualPlayerIdentityMerges[reviewKey] = {
        ...pending,
        separated: true,
        reviewedBy: interaction.user.id,
        reviewedAt: Date.now()
      };

      delete rankings.pendingPlayerIdentityReview[reviewKey];

      rankings.lastUpdatedAt = Date.now();
      saveHallRankings(rankings);

      const doneEmbed = EmbedBuilder.from(interaction.message.embeds?.[0] || new EmbedBuilder())
        .setColor("#e74c3c")
        .setTitle("❌ Identidade revisada: não são a mesma pessoa")
        .setFooter({ text: `Revisado por ${interaction.user.tag}` })
        .setTimestamp();

      await interaction.message.edit({
        embeds: [doneEmbed],
        components: []
      }).catch(() => {});

      await interaction.editReply("✅ Marcado como pessoas diferentes.");
      return true;
    }

    if (interaction.isButton() && interaction.customId.startsWith(BTN_PAYMENT_CITY_PREFIX)) {
      if (!hasPermission(interaction.member, interaction.user.id)) {
        return interaction.reply({ content: "🚫 Sem permissão.", ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });

      const raw = interaction.customId.slice(BTN_PAYMENT_CITY_PREFIX.length);
      const parts = raw.split(":");
      const cityKey = parts.pop();
      const playerReviewKey = parts.join(":");

      if (!CITIES[cityKey]) {
        return interaction.editReply("❌ Cidade inválida.");
      }

      const rankings = loadHallRankings();
      const pending = rankings.pendingPaymentCityReview?.[playerReviewKey];

      if (!pending) {
        return interaction.editReply("⚠️ Essa revisão já foi resolvida ou não existe mais.");
      }

      const paymentChannel = await client.channels.fetch(PAYMENT_EVENTS_CHANNEL_ID).catch(() => null);
      const paymentMessage = paymentChannel?.isTextBased()
        ? await paymentChannel.messages.fetch(pending.messageId).catch(() => null)
        : null;

      if (paymentMessage?.embeds?.[0]) {
        const embed = EmbedBuilder.from(paymentMessage.embeds[0]);
        const fields = Array.isArray(embed.data.fields) ? [...embed.data.fields] : [];

        const alreadyHasCityField = fields.some(field => {
          const fieldName = normalizeHallName(field.name || "");
          return fieldName.includes("cidade") || fieldName.includes("cdd");
        });

        const cityField = {
          name: "🏙️ Cidade / CDD",
          value: `${CITIES[cityKey].emoji} ${CITIES[cityKey].label}\nMarcado por: <@${interaction.user.id}>`,
          inline: false
        };

        const cityFieldIndex = fields.findIndex(field => {
          const fieldName = normalizeHallName(field.name || "");
          return fieldName.includes("cidade") || fieldName.includes("cdd");
        });

        if (cityFieldIndex >= 0) {
          fields[cityFieldIndex] = cityField;
        } else {
          fields.push(cityField);
        }

        embed.setFields(fields);

        await paymentMessage.edit({
          embeds: [embed],
          components: paymentMessage.components
        }).catch(() => {});
      }

      delete rankings.pendingPaymentCityReview[playerReviewKey];
      delete rankings.reviewedPaymentMessages[pending.messageId];

      rankings.manualPaymentCityReviews ??= {};
      rankings.manualPaymentCityReviews[playerReviewKey] = {
        ...pending,
        cityKey,
        cityName: CITIES[cityKey].label,
        reviewedBy: interaction.user.id,
        reviewedAt: Date.now()
      };

      rankings.manualPlayerCityOverrides ??= {};

      if (pending.playerId) {
        rankings.manualPlayerCityOverrides[`id:${pending.playerId}`] = {
          cityKey,
          cityName: CITIES[cityKey].label,
          playerName: pending.playerName || "",
          playerId: pending.playerId,
          source: "botao_pagamento_revisao_cidade",
          reviewedBy: interaction.user.id,
          reviewedAt: Date.now()
        };
      }

      if (pending.playerName) {
        rankings.manualPlayerCityOverrides[`name:${normalizeHallKey(pending.playerName)}`] = {
          cityKey,
          cityName: CITIES[cityKey].label,
          playerName: pending.playerName,
          playerId: pending.playerId || "",
          source: "botao_pagamento_revisao_cidade",
          reviewedBy: interaction.user.id,
          reviewedAt: Date.now()
        };
      }

      for (const player of Object.values(rankings.players || {})) {
        const sameId = pending.playerId && String(player.playerId || "") === String(pending.playerId);
        const sameName = !pending.playerId && normalizeHallKey(player.name || "") === normalizeHallKey(pending.playerName || "");

        if (!sameId && !sameName) continue;

        player.cityKey = cityKey;
        player.cityName = CITIES[cityKey].label;

        player.halls = (player.halls || []).map(hall => ({
          ...hall,
          cityKey,
          cityName: CITIES[cityKey].label,
          eventName: normalizeHallEventName(hall.eventName, cityKey)
        }));

        player.events = {};

        for (const hall of player.halls) {
          const eventName = normalizeHallEventName(hall.eventName, cityKey);
          player.events[eventName] ??= 0;
          player.events[eventName] += 1;
        }
      }

      rankings.lastUpdatedAt = Date.now();
      saveHallRankings(rankings);
      await publishHallRankings(client, rankings);

      const reviewEmbed = new EmbedBuilder()
        .setColor("#2ecc71")
        .setTitle(`✅ Pagamento revisado como ${CITIES[cityKey].label}`)
        .addFields(
          {
            name: "👤 Player",
            value: `**${pending.playerName || "Sem nome"}** ${pending.playerId ? `| \`${pending.playerId}\`` : ""}`,
            inline: false
          },
          {
            name: "🏁 Evento",
            value: `**${pending.eventName || "Revisão obrigatória por acúmulo de vitórias"}**`,
            inline: false
          },
          {
            name: "🔗 Registro",
            value: pending.jumpUrl ? `[Abrir registro](${pending.jumpUrl})` : "Sem link encontrado",
            inline: false
          },
          {
            name: "👮 Revisado por",
            value: `<@${interaction.user.id}>`,
            inline: false
          }
        )
        .setTimestamp();

      await interaction.message.edit({
        content: "",
        embeds: [reviewEmbed],
        components: []
      }).catch(() => {});

      await interaction.editReply("✅ Cidade aplicada no registro original. Rode a varredura novamente para contabilizar.");
      return true;
    }

    if (
      interaction.isButton() &&
      (
        interaction.customId.startsWith(
          BTN_HISTORICAL_RECREATE_PREFIX
        ) ||
        interaction.customId.startsWith(
          BTN_HISTORICAL_EDIT_PREFIX
        )
      )
    ) {
      if (
        !hasPermission(
          interaction.member,
          interaction.user.id
        )
      ) {
        return interaction.reply({
          content:
            "🚫 Sem permissão para recriar Halls antigos.",
          ephemeral: true
        });
      }

      const isEdit =
        interaction.customId.startsWith(
          BTN_HISTORICAL_EDIT_PREFIX
        );

      const oldMessageId =
        interaction.customId.replace(
          isEdit
            ? BTN_HISTORICAL_EDIT_PREFIX
            : BTN_HISTORICAL_RECREATE_PREFIX,
          ""
        );

      const review =
        state.historicalHallReviews?.[
          oldMessageId
        ];

      if (!review) {
        return interaction.reply({
          content:
            "⚠️ Esta solicitação não existe mais. Rode a varredura novamente.",
          ephemeral: true
        });
      }

      const existingMigration =
        state.historicalHallMigrations?.[
          oldMessageId
        ];

      if (
        existingMigration?.status ===
          "completed" ||
        existingMigration?.status ===
          "published_pending_old_deletion"
      ) {
        await updateHistoricalReviewPanelAfterPublication(
          client,
          oldMessageId
        ).catch(() => {});

        return interaction.reply({
          content:
            existingMigration.status ===
              "completed"
              ? (
                  "✅ Este Hall já foi recriado, aprovado " +
                  "e o Hall humano antigo já foi removido."
                )
              : (
                  "⏳ Este Hall já foi recriado e aprovado. " +
                  "Somente a exclusão da mensagem antiga " +
                  "continua pendente."
                ),

          ephemeral:
            true
        });
      }

      await interaction.showModal(
        buildHistoricalHallModal(
          oldMessageId,
          review
        )
      );

      return true;
    }

    if (
      interaction.isButton() &&
      interaction.customId.startsWith(
        BTN_HISTORICAL_IGNORE_PREFIX
      )
    ) {
      if (
        !hasPermission(
          interaction.member,
          interaction.user.id
        )
      ) {
        return interaction.reply({
          content:
            "🚫 Sem permissão para gerenciar Halls antigos.",

          ephemeral:
            true
        });
      }

      const oldMessageId =
        interaction.customId.replace(
          BTN_HISTORICAL_IGNORE_PREFIX,
          ""
        );

      const review =
        state.historicalHallReviews?.[
          oldMessageId
        ];

      if (review) {
        review.status =
          "awaiting_recreation";

        delete review.ignoredBy;
        delete review.ignoredAt;

        saveState(state);
      }

      await interaction.reply({
        content:
          "⚠️ Todos os Halls humanos precisam ser recriados. Este Hall continua aguardando recriação.",

        ephemeral:
          true
      });

      return true;
    }

    if (
      interaction.isModalSubmit() &&
      interaction.customId.startsWith(
        MODAL_HISTORICAL_PREFIX
      )
    ) {
      await interaction.deferReply({
        ephemeral:
          true
      });

      const oldMessageId =
        interaction.customId.replace(
          MODAL_HISTORICAL_PREFIX,
          ""
        );

      const review =
        state.historicalHallReviews?.[
          oldMessageId
        ];

      if (!review) {
        return interaction.editReply(
          "❌ Não foi possível localizar os dados desse Hall. Rode a varredura novamente."
        );
      }

      const eventName =
        interaction.fields
          .getTextInputValue(
            "hf_hist_event"
          )
          .trim();

      const cityInput =
        interaction.fields
          .getTextInputValue(
            "hf_hist_city"
          )
          .trim();

      const victoryDate =
        interaction.fields
          .getTextInputValue(
            "hf_hist_date"
          )
          .trim();

      const rawWinners =
        interaction.fields
          .getTextInputValue(
            "hf_hist_winners"
          )
          .trim();

      const newImagesInput =
        interaction.fields
          .getTextInputValue(
            "hf_hist_new_images"
          )
          ?.trim() || "";

      const manualImageUrls =
        uniqueImageUrls(
          getImageUrlsFromContent(
            newImagesInput
          )
        ).slice(0, 4);

      const cityKey =
        resolveCityKeyFromModalInput(
          cityInput
        );

      const victoryTimestamp =
        parseHistoricalDateInput(
          victoryDate
        );

      if (
        !cityKey ||
        !CITIES[cityKey]
      ) {
        return interaction.editReply(
          "❌ Cidade inválida. Use Nobre, Santa, Grande ou Maresia."
        );
      }

      if (!victoryTimestamp) {
        return interaction.editReply(
          "❌ Data inválida. Informe exatamente no formato DD/MM/AAAA."
        );
      }

      if (
        !eventName ||
        !rawWinners
      ) {
        return interaction.editReply(
          "❌ Evento e vencedores são obrigatórios."
        );
      }

      let finalHistoricalImageUrls =
        uniqueImageUrls(
          review.archivedImageUrls ||
          []
        ).slice(0, 4);

      if (
        manualImageUrls.length > 0
      ) {
        const manualStorage =
          await storeHistoricalReplacementImages(
            client,
            review,
            manualImageUrls
          );

        if (!manualStorage.ok) {
          return interaction.editReply(
            `❌ As imagens novas não foram protegidas corretamente.\n` +
            `${manualStorage.reason}\n\n` +
            `O Hall antigo foi mantido e não será apagado.`
          );
        }

        review.archiveOk =
          true;

        review.archiveMessageId =
          manualStorage.messageId;

        review.archiveChannelId =
          manualStorage.channelId;

        review.archivedImageUrls =
          manualStorage.imageUrls;

        review.manualImageUrls =
          manualImageUrls;

        finalHistoricalImageUrls =
          manualStorage.imageUrls;
      }

      if (
        finalHistoricalImageUrls.length ===
        0
      ) {
        return interaction.editReply(
          "❌ Nenhuma imagem protegida foi encontrada. Informe pelo menos um link de imagem nova. O Hall antigo continuará intacto."
        );
      }

      const reqId =
        review.pendingRequestId ||
        `${interaction.user.id}-${Date.now()}`;

      const winnersText =
        buildHistoricalWinnersText(
          rawWinners
        );

      Object.assign(
        review,
        {
          eventName,

          cityKey,

          cityName:
            CITIES[cityKey].label,

          victoryDate,

          victoryTimestamp,

          rawWinners,

          manualImageUrls,

          archivedImageUrls:
            finalHistoricalImageUrls,

          pendingRequestId:
            reqId,

          status:
            "awaiting_approval",

          editedBy:
            interaction.user.id,

          editedAt:
            Date.now()
        }
      );

      state.pendingRequests[
        reqId
      ] = {
        userId:
          interaction.user.id,

        cityKey,

        cityDisplayName:
          CITIES[cityKey].label,

        eventName,

        winnersText,

        imageUrls:
          finalHistoricalImageUrls,

        imageUrl:
          finalHistoricalImageUrls[0] ||
          "",

        imageUrl2:
          finalHistoricalImageUrls[1] ||
          "",

        imageUrl3:
          finalHistoricalImageUrls[2] ||
          "",

        imageUrl4:
          finalHistoricalImageUrls[3] ||
          "",

        createdAt:
          Date.now(),

        operationId:
          reqId,

        historicalMigration:
          true,

        historicalOldMessageId:
          oldMessageId,

        historicalOldChannelId:
          review.oldChannelId,

        historicalOldGuildId:
          review.oldGuildId,

        historicalOldJumpUrl:
          review.oldJumpUrl,

        historicalVictoryTimestamp:
          victoryTimestamp,

        historicalVictoryDate:
          victoryDate,

        historicalArchiveMessageId:
          review.archiveMessageId,

        historicalArchiveChannelId:
          review.archiveChannelId,

        historicalManualImageUrls:
          manualImageUrls
      };

      saveState(state);

      const approvalChannel =
        await client.channels
          .fetch(
            APPROVAL_CHANNEL_ID
          )
          .catch(() => null);

      if (
        !approvalChannel ||
        !approvalChannel.isTextBased()
      ) {
        return interaction.editReply(
          "❌ Canal de aprovação não encontrado."
        );
      }

      const embed =
        new EmbedBuilder()
          .setTitle(
            "♻️ Aprovação: recriação de Hall humano"
          )
          .setColor("#f1c40f")
          .setDescription(
            `**Solicitante:** <@${interaction.user.id}>\n` +
            `**Hall antigo:** [Abrir mensagem original](${review.oldJumpUrl})\n` +
            `**Imagens protegidas:** [Abrir armazenamento](https://discord.com/channels/${review.oldGuildId}/${review.archiveChannelId}/${review.archiveMessageId})\n\n` +
            `⚠️ O Hall antigo só será apagado depois da publicação completa do novo.`
          )
          .addFields(
            {
              name:
                "Evento",

              value:
                eventName,

              inline:
                true
            },
            {
              name:
                "Cidade",

              value:
                CITIES[cityKey].label,

              inline:
                true
            },
            {
              name:
                "Data original da vitória",

              value:
                `<t:${Math.floor(
                  victoryTimestamp /
                  1000
                )}:F>`,

              inline:
                false
            },
            {
              name:
                "Vencedores, IDs/ORG e premiações",

              value:
                winnersText.slice(
                  0,
                  1000
                ),

              inline:
                false
            },
            {
              name:
                "Imagens protegidas",

              value:
                `${review.archivedImageUrls.length} imagem(ns) pronta(s)`,

              inline:
                true
            },
            {
              name:
                "Origem das imagens",

              value:
                manualImageUrls.length > 0
                  ? (
                      "Imagens novas informadas manualmente e " +
                      "protegidas no canal de armazenamento."
                    )
                  : (
                      "Imagens recuperadas do Hall humano original " +
                      "e protegidas no canal de armazenamento."
                    ),

              inline:
                false
            }
          )
          .setFooter({
            text:
              `Substituição protegida • Hall ${oldMessageId}`
          })
          .setTimestamp();

      const components = [
        new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(
                `${BTN_APPROVE_PREFIX}${reqId}`
              )
              .setLabel(
                "✅ Aprovar, publicar e substituir"
              )
              .setStyle(
                ButtonStyle.Success
              ),

            new ButtonBuilder()
              .setCustomId(
                `${BTN_HISTORICAL_EDIT_PREFIX}${oldMessageId}`
              )
              .setLabel(
                "✏️ Editar dados"
              )
              .setStyle(
                ButtonStyle.Primary
              ),

            new ButtonBuilder()
              .setCustomId(
                `${BTN_REJECT_PREFIX}${reqId}`
              )
              .setLabel(
                "❌ Reprovar"
              )
              .setStyle(
                ButtonStyle.Danger
              )
          )
      ];

      let approvalMessage =
        review.approvalMessageId
          ? await approvalChannel.messages
              .fetch(
                review.approvalMessageId
              )
              .catch(() => null)
          : null;

      if (approvalMessage) {
        await approvalMessage.edit({
          embeds:
            [embed],

          components
        });
      } else {
        approvalMessage =
          await approvalChannel.send({
            content:
              "Recriação de Hall humano pendente.",

            embeds:
              [embed],

            components
          });

        review.approvalMessageId =
          approvalMessage.id;

        saveState(state);
      }

      await interaction.editReply(
        "✅ Recriação enviada para aprovação. O Hall antigo continua intacto."
      );

      return true;
    }

    // ✅ Botão manual para varredura geral dos Halls antigos
    if (interaction.isButton() && interaction.customId === BTN_SCAN_ALL) {
      if (!hasPermission(interaction.member, interaction.user.id)) {
        return interaction.reply({ content: "🚫 Sem permissão para fazer varredura geral.", ephemeral: true });
      }

      if (hallScanRunning) {
        return interaction.reply({
          content: "⚠️ Já existe uma varredura geral em andamento. Aguarde ela finalizar antes de iniciar outra.",
          ephemeral: true
        });
      }

      hallScanRunning = true;

      await interaction.deferReply({ ephemeral: true });

      const hallChannel = await client.channels.fetch(HALL_CHANNEL_ID).catch(() => null);
      if (!hallChannel) {
        hallScanRunning = false;
        return interaction.editReply("❌ Canal do Hall da Fama não encontrado.");
      }

      await updateHallScanProgress(client, {
        status: `Varredura manual iniciada por ${interaction.user.tag}...`,
        forceNewApprovalPanel: true
      });

      await sendHallScanLog(client, {
        title: "🧹 Varredura Geral acionada",
        color: "#9b59b6",
        description:
          `A varredura geral foi iniciada manualmente.\n\n` +
          `👤 Acionada por: ${interaction.user} \`${interaction.user.id}\`\n` +
          `📥 Canal analisado: <#${HALL_CHANNEL_ID}>\n` +
          `🏢 Ranking ORGs: <#${HALL_ORGS_RANKING_CHANNEL_ID}>\n` +
          `👤 Ranking Pessoas: <#${HALL_PLAYERS_RANKING_CHANNEL_ID}>`,
        phase: "Botão manual"
      });

      try {
        await interaction.editReply(`🧹 Varredura iniciada! Acompanhe os logs em <#${HALL_SCAN_LOG_CHANNEL_ID}>.`);

        await autoCorrectDuplications(hallChannel, client, { showProgress: true });

        state.lastAutoCorrectScanKey = "";
        saveState(state);

        await interaction.editReply({
          content: "✅ Varredura geral finalizada. Ranking atualizado e logs enviados.",
          components: []
        }).catch(async () => {
          await sendHallScanLog(client, {
            title: "✅ Varredura geral finalizada",
            color: "#2ecc71",
            description: `A varredura terminou, mas a resposta privada expirou antes do Discord aceitar a atualização.`,
            phase: "Finalização"
          });
        });
      } finally {
        hallScanRunning = false;
      }

      return true;
    }

    if (interaction.isButton() && interaction.customId.startsWith(BTN_REVIEW_CITY_PREFIX)) {
      if (!hasPermission(interaction.member, interaction.user.id)) {
        return interaction.reply({ content: "🚫 Sem permissão para revisar cidade.", ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });

      const raw = interaction.customId.replace(BTN_REVIEW_CITY_PREFIX, "");
      const [cityKey, messageId] = raw.split("_");

      if (!CITIES[cityKey] || !messageId) {
        return interaction.editReply("❌ Revisão inválida.");
      }

      const hallChannel = await client.channels.fetch(HALL_CHANNEL_ID).catch(() => null);
      if (!hallChannel || !hallChannel.isTextBased()) {
        return interaction.editReply("❌ Canal do Hall da Fama não encontrado.");
      }

      const hallMessage = await hallChannel.messages.fetch(messageId).catch(() => null);
      if (!hallMessage) {
        return interaction.editReply("❌ Hall original não encontrado.");
      }

      const attachmentUrls = await getSafeHallImageUrls(
        client,
        hallMessage,
        {
          content: hallMessage.content
        }
      );

      const fixedContentWithUrls = updateHallCityOnly(
        hallMessage.content,
        CITIES[cityKey].label,
        attachmentUrls
      );

      const imageEditData = await prepareHallImageEdit(
        hallMessage,
        attachmentUrls,
        {
          replaceExisting: false
        }
      );

      const fixedContent = imageEditData.hasImages
        ? removeHallImageUrlsFromContent(
            fixedContentWithUrls,
            attachmentUrls
          )
        : fixedContentWithUrls;

      if (fixedContent.length > 2000) {
        return interaction.editReply(
          "❌ O Hall ficou maior que 2000 caracteres."
        );
      }

      const editPayload = {
        content: fixedContent
      };

      if (imageEditData.attachments.length > 0) {
        editPayload.attachments =
          imageEditData.attachments;
      }

      if (imageEditData.files.length > 0) {
        editPayload.files =
          imageEditData.files;
      }

      await hallMessage.edit(editPayload);

      const evidence = {
        cityKey,
        cityName: CITIES[cityKey].label,
        eventName: normalizeHallEventName(extractRawHallEventName(fixedContent), cityKey),
        source: `revisao_manual:${interaction.user.id}`,
        confidence: 100
      };

      await autoFixEventosDiariosCityIfNeeded(client, hallMessage, evidence);

      state.pendingCityReviews ??= {};
      delete state.pendingCityReviews[messageId];

      state.confirmedCityReviews ??= {};
      state.confirmedCityReviews[messageId] = {
        messageId,
        cityKey,
        cityName: CITIES[cityKey].label,
        reviewedBy: interaction.user.id,
        reviewedAt: Date.now()
      };

      saveState(state);

      await interaction.message.edit({
        components: [],
        embeds: interaction.message.embeds.map(embed => {
          return EmbedBuilder.from(embed)
            .setColor("#2ecc71")
            .setFooter({
              text: `Cidade revisada como ${CITIES[cityKey].label} por ${interaction.user.tag}`
            });
        })
      }).catch(() => {});

      await interaction.editReply(`✅ Hall revisado como **${CITIES[cityKey].label}**. Eventos Diários também foi conferido.`);
      return true;
    }

    // ✅ Abre o modal para localizar qualquer Hall antigo pelo link
    if (interaction.isButton() && interaction.customId === BTN_EDIT_BY_LINK) {
      if (!hasPermission(interaction.member, interaction.user.id)) {
        return interaction.reply({
          content: "🚫 Sem permissão para editar Hall antigo.",
          ephemeral: true
        });
      }

      const modal = new ModalBuilder()
        .setCustomId(MODAL_EDIT_BY_LINK)
        .setTitle("🔗 Editar Hall Antigo");

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("hf_old_hall_link")
            .setLabel("Link da mensagem do Hall")
            .setPlaceholder("https://discord.com/channels/servidor/canal/mensagem")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      );

      await interaction.showModal(modal);
      return true;
    }

    // ✅ Recebe o link e localiza exatamente o Hall antigo
    if (interaction.isModalSubmit() && interaction.customId === MODAL_EDIT_BY_LINK) {
      if (!hasPermission(interaction.member, interaction.user.id)) {
        return interaction.reply({
          content: "🚫 Sem permissão para editar Hall antigo.",
          ephemeral: true
        });
      }

      await interaction.deferReply({ ephemeral: true });

      const hallLink = interaction.fields
        .getTextInputValue("hf_old_hall_link")
        ?.trim();

      const linkMatch = String(hallLink || "").match(
        /(?:https?:\/\/)?(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/channels\/(\d+)\/(\d+)\/(\d+)/i
      );

      if (!linkMatch) {
        return interaction.editReply(
          "❌ Link inválido.\n\nCopie o link da própria mensagem do Hall usando **Copiar link da mensagem** no Discord."
        );
      }

      const [, guildIdFromLink, channelIdFromLink, messageIdFromLink] = linkMatch;

      if (guildIdFromLink !== interaction.guildId) {
        return interaction.editReply(
          "❌ Esse link pertence a outro servidor."
        );
      }

      if (channelIdFromLink !== HALL_CHANNEL_ID) {
        return interaction.editReply(
          `❌ Esse link não pertence ao canal oficial do Hall da Fama <#${HALL_CHANNEL_ID}>.`
        );
      }

      const hallChannel = await client.channels.fetch(HALL_CHANNEL_ID).catch(() => null);

      if (!hallChannel || !hallChannel.isTextBased()) {
        return interaction.editReply(
          "❌ Canal do Hall da Fama não encontrado."
        );
      }

      const hallMessage = await hallChannel.messages
        .fetch(messageIdFromLink)
        .catch(() => null);

      if (!hallMessage) {
        return interaction.editReply(
          "❌ Não consegui encontrar essa mensagem. Confira se ela ainda existe e se o link está correto."
        );
      }

      if (hallMessage.author.id !== client.user.id) {
        return interaction.editReply(
          "❌ Esse Hall não foi publicado por este bot. O Discord não permite que o bot edite mensagens de outro usuário ou de outro bot."
        );
      }

      const hallContent = getHallMessageText(hallMessage);

      if (!normalizeHallName(hallContent).includes("hall da fama")) {
        return interaction.editReply(
          "❌ A mensagem encontrada não parece ser um Hall da Fama."
        );
      }

      const parts = extractHallParts(hallMessage.content);

      const eventName = parts.eventName || "Evento";
      const cityName = parts.cityName || "Cidade";

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${BTN_EDIT_LINK_TOPS_PREFIX}${hallMessage.id}`)
          .setLabel("✏️ Editar Evento/TOPs")
          .setStyle(ButtonStyle.Primary)
          .setEmoji("✏️"),

        new ButtonBuilder()
          .setCustomId(`${BTN_EDIT_LINK_CITY_PREFIX}${hallMessage.id}`)
          .setLabel("🌆 Editar Cidade")
          .setStyle(ButtonStyle.Secondary)
          .setEmoji("🌆"),

        new ButtonBuilder()
          .setLabel("🔗 Abrir Hall")
          .setStyle(ButtonStyle.Link)
          .setURL(getMessageJumpUrl(hallMessage))
      );

      await interaction.editReply({
        content:
          `✅ **Hall antigo encontrado!**\n\n` +
          `🎮 **Evento:** ${eventName}\n` +
          `🌆 **Cidade:** ${cityName}\n` +
          `📅 **Publicado:** <t:${Math.floor(hallMessage.createdTimestamp / 1000)}:F>\n` +
          `🆔 **Mensagem:** \`${hallMessage.id}\`\n\n` +
          `Escolha abaixo o que deseja editar.`,
        components: [row]
      });

      return true;
    }

    // ✅ Botão para editar somente a cidade do último Hall da Fama
    if (interaction.isButton() && interaction.customId === BTN_EDIT_CITY) {
      if (!hasPermission(interaction.member, interaction.user.id)) {
        return interaction.reply({ content: "🚫 Sem permissão para editar a cidade.", ephemeral: true });
      }

      const hallChannel = await client.channels.fetch(HALL_CHANNEL_ID).catch(() => null);
      if (!hallChannel) {
        return interaction.reply({ content: "❌ Canal do Hall da Fama não encontrado.", ephemeral: true });
      }

      const messages = await hallChannel.messages.fetch({ limit: 50 }).catch(() => null);
      if (!messages) {
        return interaction.reply({ content: "❌ Não foi possível buscar as mensagens do canal.", ephemeral: true });
      }

      const lastHallMessage = messages
        .filter(m => m.author.id === client.user.id && m.content.includes("Santa Creators :") && m.content.includes("HALL DA FAMA"))
        .sort((a, b) => b.createdTimestamp - a.createdTimestamp)
        .first();

      if (!lastHallMessage) {
        return interaction.reply({ content: "❌ Nenhum Hall da Fama recente encontrado para editar a cidade.", ephemeral: true });
      }

      const parts = extractHallParts(lastHallMessage.content);

      const modal = new ModalBuilder()
        .setCustomId(`${MODAL_CITY_SUBMIT}:${lastHallMessage.id}`)
        .setTitle("🌆 Editar Cidade do Hall");

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("hf_city_only")
            .setLabel("Cidade correta do evento")
            .setValue(parts.cityName || "Cidade")
            .setPlaceholder("Ex: Cidade Maresia")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      );

      await interaction.showModal(modal);
      return true;
    }

    // ✅ Modal para editar somente a cidade do último Hall da Fama
    if (interaction.isModalSubmit() && interaction.customId.startsWith(MODAL_CITY_SUBMIT)) {
      if (!hasPermission(interaction.member, interaction.user.id)) {
        return interaction.reply({ content: "🚫 Sem permissão para editar a cidade.", ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });

      const messageId = interaction.customId.split(":")[1];
      const newCityName = interaction.fields.getTextInputValue("hf_city_only");

      const hallChannel = await client.channels.fetch(HALL_CHANNEL_ID).catch(() => null);
      if (!hallChannel) {
        return interaction.editReply("❌ Canal do Hall da Fama não encontrado.");
      }

      const messageToEdit = await hallChannel.messages.fetch(messageId).catch(() => null);
      if (!messageToEdit) {
        return interaction.editReply("❌ A mensagem do Hall da Fama original não foi encontrada. Talvez tenha sido apagada.");
      }

      const attachmentUrls = await getSafeHallImageUrls(
        client,
        messageToEdit,
        {
          content: messageToEdit.content
        }
      );

      const finalContentWithUrls = updateHallCityOnly(
        messageToEdit.content,
        newCityName,
        attachmentUrls
      );

      const imageEditData = await prepareHallImageEdit(
        messageToEdit,
        attachmentUrls,
        {
          replaceExisting: false
        }
      );

      const finalContent = imageEditData.hasImages
        ? removeHallImageUrlsFromContent(
            finalContentWithUrls,
            attachmentUrls
          )
        : finalContentWithUrls;

      if (finalContent.length > 2000) {
        return interaction.editReply(
          "❌ O Hall ficou maior que 2000 caracteres e não pode ser salvo."
        );
      }

      const editPayload = {
        content: finalContent
      };

      if (imageEditData.attachments.length > 0) {
        editPayload.attachments =
          imageEditData.attachments;
      }

      if (imageEditData.files.length > 0) {
        editPayload.files =
          imageEditData.files;
      }

      await messageToEdit.edit(editPayload);

      await interaction.editReply(
        `✅ Cidade alterada com sucesso para: **${newCityName}**`
      );

      return true;
    }

    // ✅ Botão para editar o último post
    if (interaction.isButton() && (interaction.customId === BTN_EDIT_LAST || interaction.customId === BTN_EDIT_PRIZES)) {
      if (!hasPermission(interaction.member, interaction.user.id)) {
        return interaction.reply({ content: "🚫 Sem permissão para editar.", ephemeral: true });
      }

      // await interaction.deferReply({ ephemeral: true }); // Removido para corrigir erro 'InteractionAlreadyReplied'

      const hallChannel = await client.channels.fetch(HALL_CHANNEL_ID).catch(() => null);
      if (!hallChannel) {
        return interaction.reply({ content: "❌ Canal do Hall da Fama não encontrado.", ephemeral: true });
      }

      const messages = await hallChannel.messages.fetch({ limit: 50 }).catch(() => null);
      if (!messages) {
        return interaction.reply({ content: "❌ Não foi possível buscar as mensagens do canal.", ephemeral: true });
      }

      // Encontra a última mensagem de Hall da Fama postada pelo bot
      const lastHallMessage = messages
        .filter(m => m.author.id === client.user.id && m.content.includes("# 🎉 :  **Santa Creators :"))
        .sort((a, b) => b.createdTimestamp - a.createdTimestamp)
        .first();

      if (!lastHallMessage) {
        return interaction.reply({ content: "❌ Nenhum post recente do Hall da Fama encontrado para editar.", ephemeral: true });
      }

// Parse inteligente do conteúdo da mensagem
const parts = extractHallParts(lastHallMessage.content);

const eventName = parts.eventName;
const cityName = parts.cityName;
const introText = parts.introText;
const winnersText = parts.winnersText;
const imageUrl = parts.imageUrl;

const imageUrls = uniqueImageUrls([
  ...(parts.imageUrls || (imageUrl ? [imageUrl] : [])),
  ...getImageUrlsFromAttachments(lastHallMessage)
]).slice(0, 4);

  if (!winnersText) {
    return interaction.reply({
      content: "❌ Não consegui separar os vencedores dessa mensagem antiga porque ela está muito embolada. Use o botão 🎁 Editar Premiações para ajustar os TOPs ou poste um novo Hall já com a versão corrigida.",
      ephemeral: true
    });
  }

      let modal;

      modal = new ModalBuilder()
        .setCustomId(`${MODAL_PRIZES_SUBMIT}:${lastHallMessage.id}`)
        .setTitle(`✏️ Editar TOPs do Hall`);

modal.addComponents(
  new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId("hf_edit_event_name")
      .setLabel("🎮 Nome do Evento")
      .setValue(eventName || "Evento")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("Ex: Missão Pântano")
      .setRequired(true)
  ),
  new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId("hf_edit_winners")
      .setLabel("🏆 TOPs / Vencedores")
      .setValue(winnersText)
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("Edite os TOPs aqui.")
      .setRequired(true)
  ),
  new ActionRowBuilder().addComponents(
new TextInputBuilder()
  .setCustomId("hf_edit_image_link")
  .setLabel("🖼️ Link(s) da imagem correta")
  .setValue(imageUrls.join("\n") || "")
  .setStyle(TextInputStyle.Paragraph)
.setPlaceholder("Cole até 4 links aqui, um por linha ou separados por espaço.")
.setMaxLength(4000)
.setRequired(false)
  )
);
      
      await interaction.showModal(modal);
      return true;
    }

    // ✅ Abre a edição de Evento/TOPs para um Hall específico localizado pelo link
    if (
      interaction.isButton() &&
      interaction.customId.startsWith(BTN_EDIT_LINK_TOPS_PREFIX)
    ) {
      if (!hasPermission(interaction.member, interaction.user.id)) {
        return interaction.reply({
          content: "🚫 Sem permissão para editar.",
          ephemeral: true
        });
      }

      const messageId = interaction.customId.replace(
        BTN_EDIT_LINK_TOPS_PREFIX,
        ""
      );

      const hallChannel = await client.channels
        .fetch(HALL_CHANNEL_ID)
        .catch(() => null);

      if (!hallChannel || !hallChannel.isTextBased()) {
        return interaction.reply({
          content: "❌ Canal do Hall da Fama não encontrado.",
          ephemeral: true
        });
      }

      const hallMessage = await hallChannel.messages
        .fetch(messageId)
        .catch(() => null);

      if (!hallMessage) {
        return interaction.reply({
          content: "❌ Hall antigo não encontrado.",
          ephemeral: true
        });
      }

      if (hallMessage.author.id !== client.user.id) {
        return interaction.reply({
          content: "❌ Esse Hall não foi publicado por este bot e não pode ser editado.",
          ephemeral: true
        });
      }

      const parts = extractHallParts(hallMessage.content);

      const eventName = parts.eventName || "Evento";
      const winnersText = parts.winnersText || "";

      const imageUrls = uniqueImageUrls([
        ...(parts.imageUrls || (parts.imageUrl ? [parts.imageUrl] : [])),
        ...getImageUrlsFromAttachments(hallMessage)
      ]).slice(0, 4);

      const modal = new ModalBuilder()
        .setCustomId(`${MODAL_PRIZES_SUBMIT}:${hallMessage.id}`)
        .setTitle("✏️ Editar TOPs do Hall");

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("hf_edit_event_name")
            .setLabel("🎮 Nome do Evento")
            .setValue(eventName)
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("Ex: Missão Pântano")
            .setRequired(true)
        ),

        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("hf_edit_winners")
            .setLabel("🏆 TOPs / Vencedores")
            .setValue(winnersText)
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder("Adicione/corrija as ORGs vencedoras e os TOPs aqui.")
            .setRequired(true)
        ),

        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("hf_edit_image_link")
            .setLabel("🖼️ Link(s) da imagem correta")
            .setValue(imageUrls.join("\n") || "")
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder("Cole até 4 links aqui, um por linha ou separados por espaço.")
            .setMaxLength(4000)
            .setRequired(false)
        )
      );

      await interaction.showModal(modal);
      return true;
    }

    // ✅ Abre a edição da cidade para um Hall específico localizado pelo link
    if (
      interaction.isButton() &&
      interaction.customId.startsWith(BTN_EDIT_LINK_CITY_PREFIX)
    ) {
      if (!hasPermission(interaction.member, interaction.user.id)) {
        return interaction.reply({
          content: "🚫 Sem permissão para editar a cidade.",
          ephemeral: true
        });
      }

      const messageId = interaction.customId.replace(
        BTN_EDIT_LINK_CITY_PREFIX,
        ""
      );

      const hallChannel = await client.channels
        .fetch(HALL_CHANNEL_ID)
        .catch(() => null);

      if (!hallChannel || !hallChannel.isTextBased()) {
        return interaction.reply({
          content: "❌ Canal do Hall da Fama não encontrado.",
          ephemeral: true
        });
      }

      const hallMessage = await hallChannel.messages
        .fetch(messageId)
        .catch(() => null);

      if (!hallMessage) {
        return interaction.reply({
          content: "❌ Hall antigo não encontrado.",
          ephemeral: true
        });
      }

      const parts = extractHallParts(hallMessage.content);

      const modal = new ModalBuilder()
        .setCustomId(`${MODAL_CITY_SUBMIT}:${hallMessage.id}`)
        .setTitle("🌆 Editar Cidade do Hall");

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("hf_city_only")
            .setLabel("Cidade correta do evento")
            .setValue(parts.cityName || "Cidade")
            .setPlaceholder("Ex: Cidade Nobre")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      );

      await interaction.showModal(modal);
      return true;
    }

// ✅ Modal de edição de Hall da Fama
if (interaction.isModalSubmit() && (interaction.customId.startsWith(MODAL_EDIT_SUBMIT) || interaction.customId.startsWith(MODAL_PRIZES_SUBMIT))) {
  if (processingHallModalSubmits.has(interaction.id)) {
    return true;
  }

  processingHallModalSubmits.add(interaction.id);

  try {
    if (!hasPermission(interaction.member, interaction.user.id)) {
      return interaction.reply({ content: "🚫 Sem permissão para editar.", ephemeral: true });
    }

    const canContinue = await safeDeferHallInteraction(interaction);
    if (!canContinue) return true;

const isPrizesOnly = interaction.customId.startsWith(MODAL_PRIZES_SUBMIT);
const messageId = interaction.customId.split(":")[1];
const newEventNameInput = interaction.fields.getTextInputValue("hf_edit_event_name")?.trim();
const newWinnersText = interaction.fields.getTextInputValue("hf_edit_winners");
const manualImageUrlInput = interaction.fields.getTextInputValue("hf_edit_image_link")?.trim() || "";
const manualImageUrls = getImageUrlsFromContent(manualImageUrlInput);

let newEventName, newImageUrl, newImageUrl2, newCityName, newIntro, finalImageUrls = [];

if (!isPrizesOnly) {
  newEventName = newEventNameInput;
  newCityName = interaction.fields.getTextInputValue("hf_edit_city");
  newIntro = interaction.fields.getTextInputValue("hf_edit_intro");
  newImageUrl = interaction.fields.getTextInputValue("hf_edit_image");
}

      const hallChannel = await client.channels.fetch(HALL_CHANNEL_ID).catch(() => null);
      if (!hallChannel) {
        return interaction.editReply("❌ Canal do Hall da Fama não encontrado.");
      }

      const messageToEdit = await hallChannel.messages.fetch(messageId).catch(() => null);
      if (!messageToEdit) {
        return interaction.editReply("❌ A mensagem do Hall da Fama original não foi encontrada. Talvez tenha sido apagada.");
      }

      // Preserva partes que não são editáveis no modal
      const oldContent = messageToEdit.content;
      const lines = oldContent.split('\n');
      
      // Se for apenas prêmios, extraímos o resto da mensagem original
const currentAttachmentUrls =
  getImageUrlsFromAttachments(
    messageToEdit
  ).slice(0, 4);

const currentContentImageUrls =
  getImageUrlsFromContent(
    oldContent
  ).slice(0, 4);

const currentHallImageUrls =
  uniqueImageUrls([
    ...currentContentImageUrls,
    ...currentAttachmentUrls
  ]).slice(0, 4);

if (isPrizesOnly) {
  const titleLine = lines.find(
    line =>
      line.startsWith("# 🎉 :")
  );

  const oldEventName =
    titleLine?.match(
      /# 🎉 :  \*\*Santa Creators : (.*?)\*\* 🎉/
    )?.[1] ||
    "Evento";

  newEventName =
    newEventNameInput ||
    oldEventName;

  const cityMatch =
    oldContent.match(
      /na \*\*(.*?)\*\*!/
    );

  newCityName = cityMatch
    ? cityMatch[1]
    : "CIDADE";

  const introLineIndex =
    lines.findIndex(
      line =>
        line.startsWith("# 🎉 :")
    ) + 2;

  newIntro =
    lines[introLineIndex]
      ?.split(
        /\s+\*\*.*?\*\*\s+na\s+/
      )[0]
      ?.trim() ||
    getRandomIntro();

  finalImageUrls =
    manualImageUrls.length > 0
      ? uniqueImageUrls(
          manualImageUrls
        ).slice(0, 4)
      : currentHallImageUrls;

  newImageUrl =
    finalImageUrls[0] ||
    "";

  newImageUrl2 =
    finalImageUrls[1] ||
    "";
} else {
  const forcedImageUrls =
    manualImageUrls.length > 0
      ? manualImageUrls
      : (
          newImageUrl
            ? [newImageUrl]
            : []
        );

  finalImageUrls =
    forcedImageUrls.length > 0
      ? uniqueImageUrls(
          forcedImageUrls
        ).slice(0, 4)
      : currentHallImageUrls;

  newImageUrl =
    finalImageUrls[0] ||
    newImageUrl ||
    "";

  newImageUrl2 =
    finalImageUrls[1] ||
    "";
}
      const mentionsLine = lines.find(l => l.includes('@everyone')) || '';

    // Remonta a mensagem
  const introLine = buildHallIntroLine(newIntro, newEventName, newCityName);

  const finalMessageWithUrls =
  `# 🎉 :  **Santa Creators : ${newEventName}** 🎉 

  ${introLine}

  👏  Uma salva de palmas para os BRABOS! 👏 

  <:12633559939374122111:1368796471297576970>  **HALL DA FAMA** <:12633559939374122111:1368796471297576970> 

  ${newWinnersText.trim()}

  **Foi insano, mas mais uma vez os vencedores mostraram que a vitória só é possível com raça! <:__:1357520048318709840>**

  ${mentionsLine}`;

const manualImageFieldWasFilled =
  manualImageUrlInput.length > 0;

const manualImagesWereChanged =
  manualImageFieldWasFilled &&
  !haveSameHallImageUrls(
    manualImageUrls,
    currentHallImageUrls
  );

const manualImagesWereRemoved =
  !manualImageFieldWasFilled &&
  currentHallImageUrls.length > 0;

const replacingExistingImages =
  manualImagesWereChanged ||
  manualImagesWereRemoved;

const imageEditData =
  manualImagesWereChanged
    ? await prepareHallImageEdit(
        messageToEdit,
        finalImageUrls,
        {
          replaceExisting: true
        }
      )
    : {
        attachments: manualImagesWereRemoved
          ? []
          : [
              ...messageToEdit.attachments.values()
            ].map(attachment => ({
              id: attachment.id
            })),
        files: [],
        shouldReplaceAttachments:
          manualImagesWereRemoved,
        reuploadedExisting: false,
        hasImages:
          !manualImagesWereRemoved &&
          messageToEdit.attachments.size > 0
      };

  const editedTopCount =
    countHallTopLines(
      newWinnersText
    );

  const shouldKeepEditedImagesAsLinks =
    finalImageUrls.length > 1 ||
    editedTopCount > 1;

  const finalMessageBase =
    shouldKeepEditedImagesAsLinks &&
    finalImageUrls.length > 0
      ? `${finalMessageWithUrls.trim()}\n\n${finalImageUrls.join("\n")}`
      : finalMessageWithUrls;

  const finalMessage =
    shouldKeepEditedImagesAsLinks
      ? finalMessageBase
      : (
          imageEditData.hasImages
            ? removeHallImageUrlsFromContent(
                finalMessageBase,
                finalImageUrls
              )
            : finalMessageBase
        );

  if (finalMessage.length > 2000) {
    return interaction.editReply(
      "❌ O conteúdo editado é muito longo (mais de 2000 caracteres) e não pode ser salvo. Por favor, reduza o texto dos vencedores."
    );
  }

  const editPayload = {
    content: finalMessage
  };

  if (shouldKeepEditedImagesAsLinks) {
    editPayload.attachments = [];
  } else if (
    replacingExistingImages ||
    imageEditData.attachments.length > 0
  ) {
    editPayload.attachments =
      imageEditData.attachments;
  }

  if (
    !shouldKeepEditedImagesAsLinks &&
    imageEditData.files.length > 0
  ) {
    editPayload.files =
      imageEditData.files;
  }

  const editedHallMessage = await messageToEdit.edit(editPayload);

  const rankings = loadHallRankings();

  rankings.pendingReview ??= {};

  for (const reviewKey of Object.keys(rankings.pendingReview)) {
    const pendingReview = rankings.pendingReview[reviewKey];

    if (
      pendingReview?.messageId === editedHallMessage.id ||
      reviewKey.startsWith(`${editedHallMessage.id}:`)
    ) {
      delete rankings.pendingReview[reviewKey];
    }
  }

  await addHallToRankings(
    rankings,
    editedHallMessage,
    client
  );

  rankings.lastUpdatedAt = Date.now();

  saveHallRankings(rankings);

  await publishHallRankings(
    client,
    rankings
  );

  await interaction.editReply(
    "✅ TOPs do Hall da Fama editados com sucesso!\n📊 O Hall corrigido também foi recalculado no ranking de GGs."
  );

  return true;
  } finally {
    processingHallModalSubmits.delete(interaction.id);
  }
}

    // 1. Botão Inicial
    if (interaction.isButton() && interaction.customId === BTN_OPEN_MENU) {
      if (!hasPermission(interaction.member, interaction.user.id)) {
        return interaction.reply({ content: "🚫 Sem permissão.", ephemeral: true });
      }

      // ✅ Tenta detectar cidade automaticamente pelo cronograma
  const eventData = getNextTodayEventData("hallDaFama");
  let autoCityKey = null;

      if (eventData && eventData.city) {
        const normalized = eventData.city.toLowerCase().trim();
        if (CITIES[normalized]) {
          autoCityKey = normalized;
        } else {
          const foundKey = Object.keys(CITIES).find(k => normalized.includes(k));
          if (foundKey) autoCityKey = foundKey;
        }
      }

  if (autoCityKey) {
    const defaultEventName = eventData ? eventData.eventName : "";
    const modal = buildHallDaFamaModal(autoCityKey, defaultEventName, eventData?.eventKey || "auto");
    await interaction.showModal(modal);
    return true;
  }

      const select = new StringSelectMenuBuilder()
        .setCustomId(SEL_CITY)
        .setPlaceholder("Selecione a Cidade do Evento")
        .addOptions(
          Object.entries(CITIES).map(([key, data]) =>
            new StringSelectMenuOptionBuilder()
              .setLabel(data.label)
              .setValue(key)
              .setEmoji(data.emoji)
          )
        );

      const row = new ActionRowBuilder().addComponents(select);
      
      await interaction.reply({
        content: "🌆 **Para qual cidade é este Hall da Fama?**",
        components: [row],
        ephemeral: true
      });
      return true;
    }

    // 2. Seleção de Cidade -> Abre Modal
    if (interaction.isStringSelectMenu() && interaction.customId === SEL_CITY) {
      const cityKey = interaction.values[0];
      
      // Tenta pegar dados automáticos
      const eventOptions = getTodayEventOptions();
      const posted = getPostedEventKeys("hallDaFama");

      const eventData =
        eventOptions.find((ev) => {
          const cName = ev.city?.toLowerCase().trim();
          return cName && !posted.includes(ev.eventKey) && (
            cName === cityKey ||
            CITIES[cityKey].label.toLowerCase().includes(cName) ||
            cName.includes(cityKey)
          );
        }) ||
        eventOptions.find((ev) => {
          const cName = ev.city?.toLowerCase().trim();
          return cName && (
            cName === cityKey ||
            CITIES[cityKey].label.toLowerCase().includes(cName) ||
            cName.includes(cityKey)
          );
        }) ||
        getNextTodayEventData("hallDaFama");

      const defaultEventName = eventData ? eventData.eventName : "";
      
      const modal = buildHallDaFamaModal(cityKey, defaultEventName, eventData?.eventKey || "auto");

      await interaction.showModal(modal);
      return true;
    }

    // 3. Submit do Modal -> Monta Texto e Envia para Aprovação
    if (interaction.isModalSubmit() && interaction.customId.startsWith(MODAL_SUBMIT)) {
      await interaction.deferReply({ ephemeral: true });

  const [, cityKey, eventKeyFromModal] = interaction.customId.split(":");
  if (!cityKey || !CITIES[cityKey]) return interaction.editReply("❌ Erro: Cidade não identificada.");

      // Pega inputs
      const eventNameInput = interaction.fields.getTextInputValue("hf_event_name");
      const topsInput = interaction.fields.getTextInputValue("hf_tops");
const imagesInput = interaction.fields.getTextInputValue("hf_images")?.trim() || "";
const imageUrls = uniqueImageUrls(getImageUrlsFromContent(imagesInput)).slice(0, 4);
const imageUrl = imageUrls[0] || "";
const imageUrl2 = imageUrls[1] || "";
const imageUrl3 = imageUrls[2] || "";
const imageUrl4 = imageUrls[3] || "";
  const customCityInput = interaction.fields.getTextInputValue("hf_custom_city")?.trim() || "";

  // Pega dados do cronograma (automático)
  const eventData =
    getTodayEventData(eventKeyFromModal !== "auto" ? eventKeyFromModal : null) ||
    getNextTodayEventData("hallDaFama");

const eventName = eventNameInput;
const prizesText = eventData ? eventData.prizes : "";

const finalCityKey = resolveCityKeyFromModalInput(customCityInput) || cityKey;

if (!finalCityKey || !CITIES[finalCityKey]) {
  return interaction.editReply("❌ Cidade inválida. Use: nobre, cidade nobre, santa, cidade santa, grande, cidade grande, maresia ou cidade maresia.");
}

const cityDisplayName = CITIES[finalCityKey].label;

      // Monta a string dos vencedores com premiação automática
      let winnersText = "";

    // ✅ NOVA LÓGICA DE PREMIAÇÃO (Cenários 1, 2 e 3)
      const allTopLines = topsInput.split('\n').map(l => l.trim()).filter(Boolean);
      const top1 = allTopLines[0] || "N/A";
      const extraLines = allTopLines.slice(1);
      const totalWinners = allTopLines.length;

      let prize1 = "";

      // 🏆 Cenário 1: Apenas TOP 1 -> Recebe TUDO
      if (totalWinners === 1) {
        // Acumula todos os prêmios encontrados no texto do cronograma
        prize1 = ["1", "2", "3"].map(r => extractPrizeForRank(prizesText, r)).filter(Boolean).join(" + ");
      } else {
        // 🏅 Cenário 3: TOP 1, 2 e 3 -> Distribuição normal
        prize1 = extractPrizeForRank(prizesText, 1);
      }

      // TOP 1
      winnersText += `**TOP** <:novo_emoji:1381082106469290076> ${top1} ${prize1 ? `| **${prize1}**` : ""}\n`;

      // TOPS EXTRA
      if (extraLines.length > 0) {
        extraLines.forEach((line, index) => {
          const rank = index + 2;
          const prize = extractPrizeForRank(prizesText, rank);
          
          let emoji = "🏅";
          if (rank === 2) emoji = "<:novo_emoji:1381082144981651500>";
          else if (rank === 3) emoji = "<:novo_emoji:1381082168142336095>";

          winnersText += `**TOP** ${emoji} ${line} ${prize ? `| **${prize}**` : ""}\n`;
        });
      }

      const reqId = `${interaction.user.id}-${Date.now()}`;
      
state.pendingRequests[reqId] = {
  userId:
    interaction.user.id,

  cityKey:
    finalCityKey,

  cityDisplayName,

  eventName,

  winnersText,

  imageUrl,
  imageUrl2,
  imageUrl3,
  imageUrl4,
  imageUrls,

  eventKey:
    eventData?.eventKey ||
    null,

  createdAt:
    Date.now(),

  operationId:
    reqId,
};

saveState(state);

recordApprovalCreated({
  system:
    "hall_da_fama",

  operationId:
    reqId,

  eventKey:
    eventData?.eventKey ||
    null,

  creatorId:
    interaction.user.id,

  createdAt:
    state.pendingRequests[
      reqId
    ].createdAt,
});

      const approvalChannel = await client.channels.fetch(APPROVAL_CHANNEL_ID).catch(() => null);
      if (!approvalChannel) return interaction.editReply("❌ Canal de aprovação não encontrado.");

const approvalImageFiles =
  await downloadHallImageAttachments(
    imageUrls
  );

const approvalImageReferences =
  approvalImageFiles.map(
    (file, index) => ({
      index,
      name:
        file.name ||
        `hall-aprovacao-${index + 1}.png`
    })
  );

const embed = new EmbedBuilder()
  .setTitle("🛡️ Aprovação: Hall da Fama")
  .setColor("#FFD700")
  .setDescription(
    `**Solicitante:** <@${interaction.user.id}>\n` +
    `**Cidade:** ${cityDisplayName}`
  )
  .addFields(
    {
      name: "Evento (Automático)",
      value: eventName
    },
    {
      name: "Vencedores (Formatado)",
      value: winnersText
    },
    {
      name: "Imagens",
      value:
        approvalImageReferences.length > 0
          ? approvalImageReferences
              .map(
                image =>
                  `Imagem ${image.index + 1}: ` +
                  `[${image.name}](attachment://${image.name})`
              )
              .join("\n")
              .slice(0, 1000)
          : "—"
    }
  )
  .setTimestamp();

if (approvalImageReferences.length > 0) {
  embed.setImage(
    `attachment://${approvalImageReferences[0].name}`
  );
}

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${BTN_APPROVE_PREFIX}${reqId}`)
          .setLabel("✅ Aprovar e Postar")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`${BTN_REJECT_PREFIX}${reqId}`)
          .setLabel("❌ Recusar")
          .setStyle(ButtonStyle.Danger)
      );

      const approvalPayload = {
        content:
          "Nova solicitação de Hall da Fama pendente.",

        embeds: [embed],

        components: [row]
      };

      if (approvalImageFiles.length > 0) {
        approvalPayload.files =
          approvalImageFiles;
      }

      const approvalMessage =
        await approvalChannel.send(
          approvalPayload
        );

      try {
        dashEmit(
          "halldafama:criado",
          {
            __at:
              state.pendingRequests[
                reqId
              ].createdAt,

            createdAt:
              state.pendingRequests[
                reqId
              ].createdAt,

            operationId:
              reqId,

            recordId:
              reqId,

            messageId:
              approvalMessage.id,

            channelId:
              approvalMessage.channelId,

            guildId:
              approvalMessage.guildId,

            userId:
              interaction.user.id,

            creatorId:
              interaction.user.id,

            source:
              "hall_da_fama",

            dedupeKey:
              `halldafama:criado:${reqId}`,
          }
        );
      } catch {}

      await interaction.editReply(
        "✅ Solicitação enviada para aprovação!"
      );     return true;
    }

    // 4. Aprovação
    if (interaction.isButton() && interaction.customId.startsWith(BTN_APPROVE_PREFIX)) {
      if (!canApprove(interaction.member, interaction.user.id)) {
        return interaction.reply({ content: "🚫 Você não tem permissão para aprovar.", ephemeral: true });
      }

      const reqId = interaction.customId.replace(BTN_APPROVE_PREFIX, "");

      if (processingApprovals.has(reqId)) {
        return interaction.reply({
          content: "⏳ Esse Hall da Fama já está sendo aprovado. Aguarde finalizar.",
          ephemeral: true
        });
      }

      processingApprovals.add(reqId);

      await interaction.deferReply({ ephemeral: true });

      const data = state.pendingRequests[reqId];

      if (!data) {
        processingApprovals.delete(reqId);
        return interaction.editReply("⚠️ Dados da solicitação expiraram.");
      }

      const originalApprovalComponents =
        interaction.message.components;

      const restoreApprovalComponents =
        async () => {
          if (
            !originalApprovalComponents ||
            originalApprovalComponents.length ===
            0
          ) {
            return;
          }

          await interaction.message
            .edit({
              components:
                originalApprovalComponents
            })
            .catch(error => {
              console.error(
                "[HallDaFama] Não foi possível restaurar os botões da aprovação:",
                error
              );
            });
        };

      await interaction.message
        .edit({
          components:
            []
        })
        .catch(() => {});

      const hallChannel =
        await client.channels
          .fetch(HALL_CHANNEL_ID)
          .catch(() => null);

      if (!hallChannel) {
        processingApprovals.delete(
          reqId
        );

        await restoreApprovalComponents();

        return interaction.editReply(
          "❌ Canal do Hall da Fama não encontrado. Nenhuma mensagem antiga foi apagada. Os botões foram restaurados para uma nova tentativa."
        );
      }

      const cityData =
        CITIES[data.cityKey];

      const cityName =
        data.cityDisplayName ||
        cityData.label;

      const intro =
        getRandomIntro();

      const introLine =
        buildHallIntroLine(
          intro,
          data.eventName,
          cityName
        );

      const historicalVictoryTimestamp =
        Number(
          data.historicalVictoryTimestamp ||
          0
        ) ||
        parseHistoricalDateInput(
          data.historicalVictoryDate ||
          ""
        );

      const historicalVictoryBlock =
        data.historicalMigration
          ? (
              historicalVictoryTimestamp
                ? (
                    `📅 **Data original do evento:** ` +
                    `<t:${Math.floor(
                      historicalVictoryTimestamp /
                      1000
                    )}:D>\n` +
                    `🕰️ **Hall antigo recriado no formato atual**`
                  )
                : (
                    `📅 **Data original do evento:** ` +
                    `não identificada\n` +
                    `🕰️ **Hall antigo recriado no formato atual**`
                  )
            )
          : "";

      let protectedHistoricalImageUrls =
        [];

      if (
        data.historicalMigration
      ) {
        const historicalImagesChannel =
          await client.channels
            .fetch(
              data.historicalArchiveChannelId ||
              HALL_HISTORICAL_IMAGES_CHANNEL_ID
            )
            .catch(() => null);

        const historicalImagesMessage =
          historicalImagesChannel?.isTextBased()
            ? await historicalImagesChannel.messages
                .fetch(
                  data.historicalArchiveMessageId
                )
                .catch(() => null)
            : null;

        protectedHistoricalImageUrls =
          historicalImagesMessage
            ? uniqueImageUrls(
                [
                  ...historicalImagesMessage
                    .attachments
                    .values()
                ].map(
                  attachment =>
                    attachment.url
                )
              )
            : [];

        if (
          protectedHistoricalImageUrls.length ===
          0
        ) {
          processingApprovals.delete(
            reqId
          );

          await restoreApprovalComponents();

          return interaction.editReply(
            "❌ As imagens protegidas não estão mais disponíveis. O Hall antigo foi mantido, nada foi apagado e os botões foram restaurados para edição ou nova tentativa."
          );
        }
      }

      const finalImageUrls =
        uniqueImageUrls(
          protectedHistoricalImageUrls.length >
          0
            ? protectedHistoricalImageUrls
            : (
                data.imageUrls || [
                  data.imageUrl,
                  data.imageUrl2,
                  data.imageUrl3,
                  data.imageUrl4
                ].filter(Boolean)
              )
        ).slice(0, 4);

  const hallTopCount =
    countHallTopLines(
      data.winnersText
    );

  const shouldKeepImagesAsLinks =
    finalImageUrls.length > 1 ||
    hallTopCount > 1;

  const hallImageFiles =
    shouldKeepImagesAsLinks
      ? []
      : await downloadHallImageAttachments(
          finalImageUrls
        );

  const hallImageLinks =
    shouldKeepImagesAsLinks
      ? finalImageUrls.join("\n")
      : "";

  // Montagem da mensagem final (Estilo Diva/Grande)
  const finalMessage =
  `# 🎉 :  **Santa Creators : ${data.eventName}** 🎉 

  ${introLine}

  👏  Uma salva de palmas para os BRABOS! 👏 

  <:12633559939374122111:1368796471297576970>  **HALL DA FAMA** <:12633559939374122111:1368796471297576970> 

  ${historicalVictoryBlock}

  ${data.winnersText}

  **Foi insano, mas mais uma vez os vencedores mostraram que a vitória só é possível com raça! <:__:1357520048318709840>**

  ||@everyone @here <@&${ROLE_CIDADAO}> <@&${ROLE_LIDERES}> <@&${cityData.roleId}>||

  ${hallImageLinks}`;

  const chunks =
    splitText(finalMessage);

  let sentMsg;

  const sentHallMessages =
    [];

  try {
    for (
      let index = 0;
      index < chunks.length;
      index++
    ) {
      const isLastChunk =
        index ===
        chunks.length - 1;

      const sendPayload = {
        content:
          chunks[index]
      };

      if (
        isLastChunk &&
        hallImageFiles.length > 0
      ) {
        sendPayload.files =
          hallImageFiles;
      }

      sentMsg =
        await hallChannel.send(
          sendPayload
        );

      sentHallMessages.push(
        sentMsg
      );
    }
  } catch (error) {
    if (
      data.historicalMigration
    ) {
      for (
        const partiallySentMessage
        of sentHallMessages.reverse()
      ) {
        await partiallySentMessage
          .delete()
          .catch(() => {});
      }
    }

    processingApprovals.delete(
      reqId
    );

    await restoreApprovalComponents();

    return interaction.editReply(
      `❌ A publicação não foi concluída. ` +
      `O Hall antigo foi mantido e nada foi apagado.\n` +
      `Os botões da aprovação foram restaurados.\n` +
      `Erro: \`${error?.message || error}\``
    );
  }

  if (!sentMsg) {
    processingApprovals.delete(
      reqId
    );

    await restoreApprovalComponents();

    return interaction.editReply(
      "❌ Falha ao enviar a mensagem do Hall da Fama. O Hall antigo foi mantido e os botões da aprovação foram restaurados."
    );
  }

let historicalOldHallDeleted =
  false;

let historicalDeletionError =
  null;

if (
  data.historicalMigration
) {
  const oldChannel =
    await client.channels
      .fetch(
        data.historicalOldChannelId
      )
      .catch(() => null);

  const oldMessage =
    oldChannel?.isTextBased()
      ? await oldChannel.messages
          .fetch(
            data.historicalOldMessageId
          )
          .catch(() => null)
      : null;

  if (!oldMessage) {
    historicalDeletionError =
      "A mensagem antiga não foi encontrada para exclusão.";
  } else {
    await oldMessage
      .delete()
      .then(() => {
        historicalOldHallDeleted =
          true;
      })
      .catch(error => {
        historicalDeletionError =
          error?.message ||
          String(error);
      });
  }

  state.historicalHallMigrations ??=
    {};

  state.historicalHallMigrations[
    data.historicalOldMessageId
  ] = {
    status:
      historicalOldHallDeleted
        ? "completed"
        : "published_pending_old_deletion",

    oldMessageId:
      data.historicalOldMessageId,

    oldChannelId:
      data.historicalOldChannelId,

    oldJumpUrl:
      data.historicalOldJumpUrl,

    newMessageId:
      sentMsg.id,

    newChannelId:
      sentMsg.channelId,

    newJumpUrl:
      getMessageJumpUrl(
        sentMsg
      ),

    archiveMessageId:
      data.historicalArchiveMessageId,

    archiveChannelId:
      data.historicalArchiveChannelId,

    victoryTimestamp:
      data.historicalVictoryTimestamp,

    approvedBy:
      interaction.user.id,

    completedAt:
      Date.now(),

    deletionError:
      historicalDeletionError
  };

  if (
    state.historicalHallReviews?.[
      data.historicalOldMessageId
    ]
  ) {
    state.historicalHallReviews[
      data.historicalOldMessageId
    ].status =
      historicalOldHallDeleted
        ? "completed"
        : "published_pending_old_deletion";

    state.historicalHallReviews[
      data.historicalOldMessageId
    ].newMessageId =
      sentMsg.id;

    state.historicalHallReviews[
      data.historicalOldMessageId
    ].newJumpUrl =
      getMessageJumpUrl(
        sentMsg
      );
  }

  saveState(state);

  await updateHistoricalReviewPanelAfterPublication(
    client,
    data.historicalOldMessageId
  ).catch(error => {
    console.error(
      `[HallDaFama] Não foi possível atualizar o painel da recriação ${data.historicalOldMessageId}:`,
      error
    );
  });

  await sendHallScanLog(
    client,
    {
      title:
        historicalOldHallDeleted
          ? "✅ Hall humano substituído com segurança"
          : "⚠️ Hall novo publicado, mas o antigo não foi apagado",

      color:
        historicalOldHallDeleted
          ? "#2ecc71"
          : "#e67e22",

      description:
        `Hall antigo: ${data.historicalOldJumpUrl}\n` +
        `Hall novo: ${getMessageJumpUrl(sentMsg)}\n` +
        `Imagens protegidas: ` +
        `https://discord.com/channels/` +
        `${data.historicalOldGuildId}/` +
        `${data.historicalArchiveChannelId}/` +
        `${data.historicalArchiveMessageId}\n` +
        `Data histórica: ` +
        `<t:${Math.floor(
          data.historicalVictoryTimestamp /
          1000
        )}:F>\n` +
        `Exclusão do antigo: **${
          historicalOldHallDeleted
            ? "concluída"
            : "pendente"
        }**` +
        (
          historicalDeletionError
            ? `\nErro: \`${historicalDeletionError}\``
            : ""
        ),

      phase:
        "Migração de Hall humano",

      currentHallUrl:
        getMessageJumpUrl(
          sentMsg
        )
    }
  ).catch(() => {});
}

const hallPostedAt =
  Date.now();

recordApprovalDecision({
  system:
    "hall_da_fama",

  operationId:
    reqId,

  decision:
    "approved",

  approverId:
    interaction.user.id,

  decidedAt:
    hallPostedAt,

  postedAt:
    hallPostedAt,
});

try {
        const emojis = ["💜", "🔥", "🚀", "👏", "🎉", "🤩", "🏆", "👑", "💸", "✨", "💯", "✅", "💎", "🫡", "🤝", "🤯", "👀", "📸", "⚡", "💣", "👻", "💀", "👽", "👾", "🤖", "🎃", "😺"];
        for (const e of emojis) await sentMsg.react(e).catch(() => {});
      } catch {}

      await ensureButtonAtBottom(hallChannel, client, true);

      try {
        if (
          data.historicalMigration &&
          historicalOldHallDeleted
        ) {
          state.historicalRankingRebuildPending =
            true;

          saveState(state);

          if (!hallScanRunning) {
            hallScanRunning =
              true;

            autoCorrectDuplications(
              hallChannel,
              client,
              {
                showProgress:
                  false
              }
            )
              .then(() => {
                state.historicalRankingRebuildPending =
                  false;

                saveState(state);
              })
              .catch(async error => {
                state.historicalRankingRebuildPending =
                  true;

                saveState(state);

                await sendHallScanLog(
                  client,
                  {
                    title:
                      "⚠️ Reconstrução do ranking pendente",

                    color:
                      "#e67e22",

                    description:
                      `O Hall antigo foi substituído, mas ocorreu ` +
                      `um erro ao reconstruir o ranking.\n\n` +
                      `Hall antigo: ${data.historicalOldJumpUrl}\n` +
                      `Hall novo: ${getMessageJumpUrl(sentMsg)}\n` +
                      `Erro: \`${error?.message || error}\`\n\n` +
                      `A reconstrução será tentada novamente ` +
                      `na próxima inicialização ou varredura.`,

                    phase:
                      "Atualização do ranking",

                    currentHallUrl:
                      getMessageJumpUrl(
                        sentMsg
                      )
                  }
                ).catch(() => {});
              })
              .finally(() => {
                hallScanRunning =
                  false;
              });
          }
        } else if (
          data.historicalMigration &&
          !historicalOldHallDeleted
        ) {
          await sendHallScanLog(
            client,
            {
              title:
                "⏳ Ranking mantido até excluir o Hall antigo",

              color:
                "#f1c40f",

              description:
                `O Hall novo foi publicado, mas o Hall humano antigo ` +
                `ainda não foi apagado.\n\n` +
                `Para evitar uma vitória duplicada, o ranking não será ` +
                `reconstruído até a exclusão do Hall antigo ser concluída.\n\n` +
                `Hall antigo: ${data.historicalOldJumpUrl}\n` +
                `Hall novo: ${getMessageJumpUrl(sentMsg)}`,

              phase:
                "Proteção contra ranking duplicado",

              currentHallUrl:
                getMessageJumpUrl(
                  sentMsg
                )
            }
          ).catch(() => {});
        } else {
          const rankings =
            loadHallRankings();

          await addHallToRankings(
            rankings,
            sentMsg,
            client
          );

          saveHallRankings(
            rankings
          );

          await publishHallRankings(
            client,
            rankings
          );
        }
      } catch (e) {
        console.error(
          "[HallDaFama] Erro ao atualizar ranking após aprovação:",
          e
        );
      }

dashEmit(
  "halldafama:aprovado",
  {
    __at:
      hallPostedAt,

    decidedAt:
      hallPostedAt,

    postedAt:
      hallPostedAt,

    createdAt:
      Number(
        data.createdAt ||
        0
      ),

    operationId:
      reqId,

    recordId:
      reqId,

    userId:
      data.userId,

    creatorId:
      data.userId,

    approverId:
      interaction.user.id,

    executorId:
      interaction.user.id,

    source:
      "hall_da_fama",

    decision:
      "approved",

    dedupeKey:
      `halldafama:aprovado:${reqId}`,
  }
);

      // ✅ Log de Auditoria
      await sendAuditHallLog(client, interaction.member, data, sentMsg);


      const embedApproved =
        EmbedBuilder.from(
          interaction.message.embeds[0]
        )
          .setColor("#2ecc71")
          .setTitle(
            "✅ Hall da Fama APROVADO"
          )
          .setFooter({
            text:
              `Aprovado por ${interaction.user.tag}`
          })
          .addFields({
            name:
              "✅ Aprovado por",

            value:
              `${interaction.user} ` +
              `(\`${interaction.user.tag}\`)`,

            inline: false
          });

      const approvalAttachments = [
        ...interaction.message
          .attachments
          .values()
      ].map(
        attachment => ({
          id: attachment.id
        })
      );

      await interaction.message.edit({
        embeds: [
          embedApproved
        ],

        components: [],

        attachments:
          approvalAttachments
      });
      
    markTodayEventPosted(data.eventKey, "hallDaFama");

  delete state.pendingRequests[reqId];
  saveState(state);
  processingApprovals.delete(reqId);
  await interaction.editReply(
    data.historicalMigration
      ? (
          historicalOldHallDeleted
            ? (
                "✅ Hall histórico recriado com sucesso!\n\n" +
                "🖼️ Imagens preservadas.\n" +
                "📅 Data original do evento adicionada.\n" +
                "🗑️ Hall humano antigo apagado.\n" +
                "📊 Reconstrução segura do ranking iniciada em segundo plano."
              )
            : (
                "⚠️ O Hall novo foi publicado e as imagens foram preservadas, " +
                "mas o Hall antigo não pôde ser apagado.\n\n" +
                "O ranking foi mantido sem nova contabilização para evitar duplicidade. " +
                "A exclusão será tentada novamente na próxima varredura."
              )
        )
      : "✅ Hall da Fama postado e pontos computados!"
  );
  return true;
    }

    // 5. Reprovação
    if (interaction.isButton() && interaction.customId.startsWith(BTN_REJECT_PREFIX)) {
      if (!canApprove(interaction.member, interaction.user.id)) {
        return interaction.reply({ content: "🚫 Você não tem permissão para recusar.", ephemeral: true });
      }

      const reqId = interaction.customId.replace(BTN_REJECT_PREFIX, "");
      
      const embedRejected = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor("#e74c3c")
        .setTitle("❌ Hall da Fama RECUSADO")
        .setFooter({ text: `Recusado por ${interaction.user.tag}` });

      await interaction.message.edit({
        embeds:
          [embedRejected],

        components:
          []
      });

const rejectedData =
  state.pendingRequests[
    reqId
  ];

if (
  rejectedData
) {
  const rejectedAt =
    Date.now();

  try {
    dashEmit(
      "halldafama:reprovado",
      {
        __at:
          rejectedAt,

        decidedAt:
          rejectedAt,

        createdAt:
          Number(
            rejectedData.createdAt ||
            0
          ),

        operationId:
          reqId,

        recordId:
          reqId,

        userId:
          rejectedData.userId,

        creatorId:
          rejectedData.userId,

        approverId:
          interaction.user.id,

        executorId:
          interaction.user.id,

        source:
          "hall_da_fama",

        decision:
          "rejected",

        dedupeKey:
          `halldafama:reprovado:${reqId}`,
      }
    );
  } catch {}

  recordApprovalDecision({
    system:
      "hall_da_fama",

    operationId:
      reqId,

    decision:
      "rejected",

    approverId:
      interaction.user.id,

    decidedAt:
      rejectedAt,
  });

  if (
    rejectedData.historicalMigration &&
    rejectedData.historicalOldMessageId &&
    state.historicalHallReviews?.[
      rejectedData.historicalOldMessageId
    ]
  ) {
    const historicalReview =
      state.historicalHallReviews[
        rejectedData.historicalOldMessageId
      ];

    historicalReview.status =
      "rejected";

    historicalReview.pendingRequestId =
      null;

    historicalReview.approvalMessageId =
      null;

    historicalReview.rejectedBy =
      interaction.user.id;

    historicalReview.rejectedAt =
      rejectedAt;
  }
}

delete state.pendingRequests[
  reqId
];

saveState(state);

await interaction.reply({
  content:
    "❌ Solicitação recusada.",

  ephemeral:
    true
});

return true;
    }

    return false;
  }
