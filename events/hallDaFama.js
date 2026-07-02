  // d:\santacreators-main\events\hallDaFama.js
  import fs from "node:fs";
  import path from "node:path";
  import { fileURLToPath } from "node:url";
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
  InteractionType
} from "discord.js";

  import { dashEmit } from "../utils/dashHub.js";

  // ================= CONFIGURAÇÃO =================
  const HALL_CHANNEL_ID = "1386503496353976470"; // Canal Oficial do Hall da Fama
  const APPROVAL_CHANNEL_ID = "1387864036259004436"; // Canal de Aprovação
  const HALL_AUDIT_LOG_CH_ID = "1486006930492362893";
const HALL_ORGS_RANKING_CHANNEL_ID = "1518696187237236816"; // Ranking de ORGs com mais GGs
const HALL_PLAYERS_RANKING_CHANNEL_ID = "1518696133071863838"; // Ranking de Pessoas com mais GGs
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
    [normalizeStaticKey("familia novaera")]: "grande",
    [normalizeStaticKey("novaera")]: "grande",
    [normalizeStaticKey("nova era")]: "grande",

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
  "1629": "Guiguxyz",
  "6641": "Pablo",
  "2593": "Miri",
  "16634": "Kaique",
  "1854": "sheik",
  "540": "Royal",
  "239": "Royal",
  "125": "Royal",
  "34": "Barbie"
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
  "Morro-do-Sacola"
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
        const eventName = normalizeHallEventName(hall.eventName, player.cityKey || "nobre");
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
  const BTN_SCAN_ALL = "hf_scan_all";
  const BTN_REVIEW_AS_ORG_PREFIX = "hf_review_org_";
  const BTN_REVIEW_AS_PLAYER_PREFIX = "hf_review_player_";
  const BTN_REVIEW_AS_BOTH_PREFIX = "hf_review_both_";
const BTN_REVIEW_CITY_PREFIX = "hf_review_city_";
const BTN_PAYMENT_CITY_PREFIX = "hf_payment_city_";
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

  function buildHallIntroLine(intro, eventName, cityName) {
    return `${cleanOneLine(intro)}\n\n🏆 **${cleanOneLine(eventName).toUpperCase()}** na **${cleanOneLine(cityName).toUpperCase()}**! <:coroa_orange:1353939359144870019>`;
  }

  function fixDuplicatedHallContent(content = "", attachmentUrls = []) {
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

    const safeIntro = isBadHallIntro(parts.introText) ? getRandomIntro() : parts.introText;
    const introLine = buildHallIntroLine(safeIntro, parts.eventName, parts.cityName);

    const fixedMessage =
  `# 🎉 :  **Santa Creators : ${parts.eventName}** 🎉 

  ${introLine}

  👏  Uma salva de palmas para os BRABOS! 👏 

  <:12633559939374122111:1368796471297576970>  **HALL DA FAMA** <:12633559939374122111:1368796471297576970> 

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

    const safeIntro = isBadHallIntro(parts.introText) ? getRandomIntro() : parts.introText;
    const introLine = buildHallIntroLine(safeIntro, parts.eventName, finalCityName);

    const fixedMessage =
  `# 🎉 :  **Santa Creators : ${parts.eventName}** 🎉 

  ${introLine}

  👏  Uma salva de palmas para os BRABOS! 👏 

  <:12633559939374122111:1368796471297576970>  **HALL DA FAMA** <:12633559939374122111:1368796471297576970> 

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
    [normalizeHallKey("tropado7")]: "Tropa do 7",
    [normalizeHallKey("tropa do 7")]: "Tropa do 7",
    [normalizeHallKey("TROPA DO 7")]: "Tropa do 7",
    [normalizeHallKey("tropa7")]: "Tropa do 7",

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
    [normalizeHallKey("nova era")]: "Familia NovaEra"
  };

  function normalizeOrgDisplayName(orgName = "") {
    const clean = normalizeHallDisplay(orgName);
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
      /\bGG\s*[:\-]/i.test(originalLine) ||
      /^Organiza[cç][aã]o\s*[:\-]/i.test(rawMarkerText) ||
      /^Vencedores?\b/i.test(rawMarkerText);

    const beforePrize = normalizeHallDisplay(String(cleanLine || "").split("|")[0] || "")
      .replace(/\b\d+\s*(vip|vips|rolepass|pass|kk|k|milh[oõ]es|milh[aã]o)\b[\s\S]*$/i, "")
      .replace(/\b(vip|vips|rolepass|pass|kk|k|milh[oõ]es|milh[aã]o)\b[\s\S]*$/i, "")
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
    if (normalized.includes("santa do crime")) cityKey = "santa";
    if (normalized.includes("maresia do crime")) cityKey = "maresia";
    if (normalized.includes("nobre do crime")) cityKey = "nobre";

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
      .replace(/[🏆👑🎉👏⚠️✅❌⭐🌆📊📌🧹🔄✨🥇🥈🥉🎮🧠📥🤖✏️📅]/gu, " ")
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

    return {
      cityKey: finalCityKey,
      cityName: CITIES[finalCityKey]?.label || "Cidade Nobre",
      eventName: eventBest?.eventName || directEventName || "Evento",
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

  if (normalized.includes("mini rei do crime")) return "Nobre do Crime";

  if (normalized.includes("santa do crime")) {
    if (cityKey === "nobre") return "Nobre do Crime";
    if (cityKey === "maresia") return "Maresia do Crime";
    if (cityKey === "grande") return "Grande do Crime";
    return "Santa do Crime";
  }

  if (normalized.includes("grande do crime")) return "Grande do Crime";
  if (normalized.includes("maresia do crime")) return "Maresia do Crime";
  if (normalized.includes("nobre do crime")) return "Nobre do Crime";

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
    return uniqueImageUrls([...message.attachments.values()].map(a => a.url));
  }

  async function getSafeHallImageUrls(client, hallMessage, options = {}) {
    const content = options.content ?? getHallMessageText(hallMessage);
    const manualUrls = uniqueImageUrls(options.manualUrls || []);
    const contentUrls = getImageUrlsFromContent(content);
    const attachmentUrls = getImageUrlsFromAttachments(hallMessage);

    const approvalUrls = await findApprovalImagesForHall(client, hallMessage, {
      eventName: options.eventName || extractHallParts(content).eventName,
      winnerNames: options.winnerNames || extractWinnerNamesForApprovalMatch(content)
    }).catch(() => []);

    return uniqueImageUrls([
      ...manualUrls,
      ...contentUrls,
      ...attachmentUrls,
      ...approvalUrls
    ]);
  }

function cleanHallWinnerLine(line = "") {
  return stripDiscordNoise(line)
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
    .trim();
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

function parseHallWinnerLine(line = "", cityKey = "nobre", eventName = "Evento") {
    const originalLine = String(line || "");

    // Se o vencedor for uma menção Discord, ignora.
    // Ex: TOP 🥇 : | <@1420173743434498098>
    if (/<@!?\d+>/i.test(originalLine)) return null;

    const cleanLineRaw = cleanHallWinnerLine(originalLine);
    const braceOrgName = extractOrgBetweenBraces(cleanLineRaw);
    const angleOrgName = extractOrgBetweenAngles(cleanLineRaw);
    const cleanLine = removeOrgBetweenAngles(removeOrgBetweenBraces(cleanLineRaw));

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
        /\bGG\s*[:\-]/i.test(originalLine)
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
          String(btn.customId || "").startsWith(BTN_REVIEW_CITY_PREFIX)
        )
      );

      return hasReviewButtons && (
        embedTitle.includes("Revisão Manual") ||
        embedDescription.includes("Esse vencedor ficou confuso") ||
        embedDescription.includes("A varredura encontrou conflito")
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

function addOrgRankingPoint(rankings, orgWinner, hallMeta) {
  const orgName = normalizeOrgDisplayName(orgWinner.orgName);
  if (!orgName) return;
  if (isInvalidWinnerName(orgName)) return;
  if (looksLikePrizeOnly(orgName)) return;
  if (/^\d+\s*(kk|k|mil|milh[oõ]es|milh[aã]o)\b/i.test(normalizeHallName(orgName))) return;
  if (/\b(vip|vips|rolepass|pass|gente boa|evento ouro|evento prata)\b/i.test(normalizeHallName(orgName))) return;

    const cityKey = getManualOrgCityKey(orgName) || orgWinner.cityKey || hallMeta.cityKey || "nobre";
    const key = getOrgRankingKey(orgName, cityKey);
    const cityName = CITIES[cityKey]?.label || "Cidade Nobre";

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

    rankings.orgs[key].events[hallMeta.eventName] ??= 0;
    rankings.orgs[key].events[hallMeta.eventName] += 1;

    rankings.orgs[key].halls.push({
      messageId: hallMeta.messageId,
      eventName: normalizeHallEventName(hallMeta.eventName, cityKey),
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

  function getPaymentCityKey(message, winner = null) {
    const text = getPaymentEmbedText(message);
    const normalized = normalizeHallName(text);

    if (
      normalized.includes("cidade nobre") ||
      normalized.includes(" nobre") ||
      text.includes(CITIES.nobre.roleId)
    ) return "nobre";

    if (
      normalized.includes("cidade santa") ||
      normalized.includes(" santa") ||
      text.includes(CITIES.santa.roleId)
    ) return "santa";

    if (
      normalized.includes("cidade grande") ||
      normalized.includes(" grande") ||
      text.includes(CITIES.grande.roleId)
    ) return "grande";

    if (
      normalized.includes("cidade maresia") ||
      normalized.includes(" maresia") ||
      text.includes(CITIES.maresia.roleId)
    ) return "maresia";

    const bySmartIdentity = getManualPlayerCityKeySmart(
      winner?.playerId || "",
      winner?.playerName || ""
    );

    if (bySmartIdentity) return bySmartIdentity;

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

        if (playerAlreadyHasHallForEvent(rankings, {
          eventName,
          eventDateKey,
          cityKey,
          playerId: winner.playerId,
          playerName: winner.playerName
        })) {
          skipped++;
          rankings.reviewedPaymentMessages[message.id] = {
            skipped: true,
            reason: "player_ja_contado_por_hall",
            paymentKey,
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

    if (rankings.reviewedMessages[message.id]) {
      return rankings;
    }

    const parsed = parseHallWinners(content, cityKey);
    const deduped = dedupeHallWinners(parsed);

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

  function formatRankingEventBreakdown(events = {}) {
    const sorted = Object.entries(events)
      .map(([eventName, total]) => [normalizeHallEventName(eventName), total])
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
  🎮 Destaques: ${formatRankingEventBreakdown(org.events)}`;
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
  🎮 Destaques: ${formatRankingEventBreakdown(player.events)}`;
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
  🎮 ${formatRankingEventBreakdown(org.events)}`;
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
  🎮 ${formatRankingEventBreakdown(player.events)}`;
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

function rankingButtons(type, page = 0) {
  const isOrg = type === "org";

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(isOrg ? BTN_RANK_ORG_SEARCH : BTN_RANK_PLAYER_SEARCH)
        .setLabel(isOrg ? "Pesquisar ORG" : "Pesquisar Pessoa")
        .setEmoji("🔎")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`${isOrg ? BTN_RANK_ORG_NEXT_PREFIX : BTN_RANK_PLAYER_NEXT_PREFIX}${page + 1}`)
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
🎮 ${formatRankingEventBreakdown(item.events || {})}`;
  }

  const idText = item.playerId ? `\n🆔 ID: **${item.playerId}**` : "";

  return `⭐ **Ranking geral: #${pos} — ${item.name}**${idText}
🌆 ${item.cityName || "Cidade Nobre"}
🏆 Vitórias: **${item.total || 0}**
🎮 ${formatRankingEventBreakdown(item.events || {})}`;
}

function buildPrivateRankingEmbed(rankings, type, page = 0, filters = {}) {
  const pageSize = 10;
  const list = getSortedRankingList(rankings, type);

  let filtered = list;

  if (type === "org" && filters.org) {
    const q = normalizeHallKey(filters.org);
    filtered = filtered.filter(item => normalizeHallKey(item.name || "").includes(q));
  }

  if (type === "player") {
    const nome = normalizeHallKey(filters.nome || "");
    const id = String(filters.id || "").trim();
    const cidade = normalizeHallKey(filters.cidade || "");

    filtered = filtered.filter(item => {
      const okNome = !nome || normalizeHallKey(item.name || "").includes(nome);
      const okId = !id || String(item.playerId || "").trim() === id;
      const okCidade = !cidade || normalizeHallKey(item.cityName || item.cityKey || "").includes(cidade);
      return okNome && okId && okCidade;
    });
  }

  const maxPage = Math.max(0, Math.ceil(filtered.length / pageSize) - 1);
  const safePage = Math.min(Math.max(Number(page || 0), 0), maxPage);
  const start = safePage * pageSize;
  const pageItems = filtered.slice(start, start + pageSize);

  const lines = pageItems.map((item, index) => {
    return formatRankingLine(item, start + index + 1, type);
  });

  const title = type === "org"
    ? "🏆 Consulta Privada — Ranking de ORGs"
    : "👑 Consulta Privada — Ranking de Pessoas";

  return {
    embed: buildRankingEmbed(
      title,
      "Resultado visível somente para você.",
      `📄 Página: **${safePage + 1}/${maxPage + 1}**
🔎 Resultados encontrados: **${filtered.length}**`,
      lines.length ? lines : ["❌ Nenhum resultado encontrado com esses filtros."],
      type === "org" ? "#f1c40f" : "#5865f2"
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

  await sendRankingWebhookMirror(HALL_ORGS_RANKING_WEBHOOK_URL, orgsPayload);
}

  async function publishHallRankingsDuringScan(client, rankings) {
    normalizeExistingPlayerRankingOverrides(rankings);

    rankings.lastUpdatedAt = Date.now();

    saveHallRankings(rankings);
    await publishHallRankings(client, rankings);
  }

  async function ensureHallRankingsDashboards(client) {
    try {
      const rankings = loadHallRankings();
      normalizeExistingPlayerRankingOverrides(rankings);
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

async function findApprovalImagesForHall(client, hallMessage, parts = {}) {
  const approvalChannel = await client.channels.fetch(APPROVAL_CHANNEL_ID).catch(() => null);
  if (!approvalChannel || !approvalChannel.isTextBased()) return [];

  const messages = await approvalChannel.messages.fetch({ limit: 100 }).catch(() => null);
  if (!messages) return [];

  const hallEventName = normalizeHallName(parts.eventName || "");
  const hallWinnerNames = parts.winnerNames?.length
    ? parts.winnerNames
    : extractWinnerNamesForApprovalMatch(getHallMessageText(hallMessage));

  const hallCreatedAt = hallMessage?.createdTimestamp || Date.now();

  function extractImagesFromApprovalMessage(approvalMsg) {
    const foundUrls = [];

    for (const emb of approvalMsg.embeds || []) {
      if (emb.image?.url) foundUrls.push(emb.image.url);
      if (emb.thumbnail?.url) foundUrls.push(emb.thumbnail.url);

      for (const field of emb.fields || []) {
        if (/imagem/i.test(field.name) || /image/i.test(field.name)) {
          const urls = String(field.value || "").match(/https?:\/\/\S+/gi) || [];
          foundUrls.push(...urls);
        }
      }
    }

    foundUrls.push(...[...approvalMsg.attachments.values()].map(a => a.url));

    return uniqueImageUrls(foundUrls);
  }

  const candidates = [...messages.values()]
    .map(m => {
      const diff = Math.abs((m.createdTimestamp || 0) - hallCreatedAt);

      const embedText = (m.embeds || [])
        .map(e => [
          e.title,
          e.description,
          ...(e.fields || []).map(f => `${f.name} ${f.value}`)
        ].filter(Boolean).join(" "))
        .join(" ");

      const fullText = `${m.content || ""}\n${embedText}`;
      const normalizedFullText = normalizeHallName(fullText);
      const images = extractImagesFromApprovalMessage(m);

      const isApproval =
        normalizedFullText.includes("hall da fama aprovado") ||
        normalizedFullText.includes("nova solicitacao de hall da fama") ||
        normalizedFullText.includes("vencedores formatado");

      const eventMatches =
        hallEventName &&
        hallEventName !== "evento" &&
        normalizedFullText.includes(hallEventName);

      const winnerScore = scoreApprovalMessageForHall(fullText, hallWinnerNames);

      return {
        msg: m,
        diff,
        images,
        isApproval,
        eventMatches,
        winnerScore
      };
    })
    .filter(item => {
      if (!item.images.length) return false;
      if (!item.isApproval) return false;
      if (item.diff > 1000 * 60 * 60 * 6) return false;
      return true;
    })
    .sort((a, b) => {
      if (b.winnerScore !== a.winnerScore) return b.winnerScore - a.winnerScore;
      if (a.diff !== b.diff) return a.diff - b.diff;
      if (a.eventMatches !== b.eventMatches) return a.eventMatches ? -1 : 1;
      return 0;
    });

  return candidates[0]?.images || [];
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

      const fetchedMessageIds = new Set(allMessages.map(m => m.id));
      rankings = removeFetchedHallRankingData(rankings, fetchedMessageIds);

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

        const text = getHallMessageText(msg);
        const parts = extractHallParts(text);

        const allImageUrls = await getSafeHallImageUrls(client, msg, {
          content: msg.content || text,
          eventName: parts.eventName,
          winnerNames: extractWinnerNamesForApprovalMatch(text)
        });

        const evidence = await resolveHallEvidence(client, msg, text);

        const currentCityKey = detectHallCityKey(msg.content || text);
        const evidenceCityKey = evidence?.cityKey || currentCityKey;

        const canAutoFixCity =
          evidenceCityKey &&
          evidenceCityKey !== currentCityKey &&
          evidence?.confidence >= 90 &&
          !evidence?.needsManualReview &&
          evidence?.source !== "texto_do_hall" &&
          !String(evidence?.source || "").includes("texto_do_hall + texto_do_hall");

        const needsManualCityReview =
          Boolean(evidence?.needsManualReview) ||
          (
            evidenceCityKey &&
            evidenceCityKey !== currentCityKey &&
            evidence?.confidence < 90
          );

        const fixedBase = fixDuplicatedHallContent(msg.content || text, allImageUrls);

        const fixed = canAutoFixCity
          ? updateHallCityOnly(fixedBase, CITIES[evidenceCityKey].label, allImageUrls)
          : fixedBase;

        if (needsManualCityReview) {
          await sendHallCityToManualReview(client, msg, evidence, currentCityKey);
        }

        if (canAutoFixCity) {
          await autoFixEventosDiariosCityIfNeeded(client, msg, evidence);
        }

        if (
          fixed !== msg.content &&
          fixed.length <= 2000 &&
          fixed.includes("HALL DA FAMA")
        ) {
          await msg.edit({
            content: fixed
          }).catch(() => {});

          msg.content = fixed;
          edited++;

          await sendHallScanLog(client, {
            title: canAutoFixCity ? "✅ Hall corrigido com cidade/cargo certo" : "🧹 Hall limpo sem trocar cidade",
            color: canAutoFixCity ? "#2ecc71" : "#5865f2",
            description:
              `Mensagem corrigida: \`${msg.id}\`\n` +
              `Cidade antiga: **${CITIES[currentCityKey]?.label || currentCityKey}**\n` +
              `Cidade aplicada: **${canAutoFixCity ? CITIES[evidenceCityKey]?.label || evidenceCityKey : CITIES[currentCityKey]?.label || currentCityKey}**\n` +
              `Fonte: **${evidence?.source || "não identificada"}**\n` +
              `Confiança: **${evidence?.confidence || 0}%**`,
            phase: "Correção automática",
            currentHall: fixed,
            currentHallPostedAt: msg.createdTimestamp ? `<t:${Math.floor(msg.createdTimestamp / 1000)}:F>` : "Não identificado",
            currentHallAuthor: msg.author ? `${msg.author.tag || msg.author.username} (\`${msg.author.id}\`)` : "Não identificado",
            currentHallUrl: getMessageJumpUrl(msg),
            currentEvent: parts.eventName || "Evento não identificado",
            currentCity: canAutoFixCity ? CITIES[evidenceCityKey]?.label || evidenceCityKey : CITIES[currentCityKey]?.label || currentCityKey,
            confidence: evidence?.confidence || 0
          });
        }

        if (showProgress && (correctionProcessed === 1 || correctionProcessed % 10 === 0 || correctionProcessed === botHallMessages.length)) {
          await updateHallScanProgress(client, {
            status: "Corrigindo Halls do bot quando necessário...",
            totalMessages: allMessages.length,
            totalHalls: hallMessages.length,
            botHalls: botHallMessages.length,
            edited,
            processed: 0,
            progressCurrent: correctionProcessed,
            progressTotal: botHallMessages.length,
            pending: Object.keys(rankings.pendingReview || {}).length,
            currentDate: msg.createdTimestamp ? `<t:${Math.floor(msg.createdTimestamp / 1000)}:F>` : "Não identificado",
            currentHallPostedAt: msg.createdTimestamp ? `<t:${Math.floor(msg.createdTimestamp / 1000)}:F>` : "Não identificado",
            currentHallAuthor: msg.author ? `${msg.author.tag || msg.author.username} (\`${msg.author.id}\`)` : "Não identificado",
            currentHallUrl: getMessageJumpUrl(msg),
            currentEvent: parts.eventName || "Evento não identificado",
            currentCity: parts.cityName || detectHallCityName(text),
            phase: "Correção automática"
          });
        }
      }

      const sortedHallMessages = hallMessages.sort((a, b) => {
        return (a.createdTimestamp || 0) - (b.createdTimestamp || 0);
      });

      let processed = 0;

      for (const msg of sortedHallMessages) {
        const text = getHallMessageText(msg);
        const evidence = await resolveHallEvidence(client, msg, text);
        const cityKey = evidence.cityKey || "nobre";
        const eventName = evidence.eventName || "Evento";
        const cityName = CITIES[cityKey]?.label || "Cidade Nobre";

        await addHallToRankings(rankings, msg, client);
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

  async function ensureButtonAtBottom(channel, client, force = true) {
    try {
      const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
      if (!messages) return;

    const myMsgs = messages.filter((m) => {
      if (m.author.id !== client.user.id || m.components.length === 0) return false;

      const allButtons = m.components.flatMap(row => row.components || []);
      return allButtons.some(c => [BTN_OPEN_MENU, BTN_EDIT_LAST, BTN_EDIT_PRIZES, BTN_EDIT_CITY, BTN_SCAN_ALL].includes(c.customId));
    });

      // ✅ Checa se já existe um painel de botões ATUALIZADO com o botão de varredura
    const upToDateMsg = myMsgs.find((m) => {
      const allButtons = m.components.flatMap(row => row.components || []);
      return allButtons.some(c => c.customId === BTN_SCAN_ALL);
    });

      // Se não for forçado e já existir um painel atualizado, não faz nada.
      if (!force && upToDateMsg) return;

      // Apaga todas as mensagens de botão antigas/desatualizadas do bot
      for (const m of myMsgs.values()) {
        await m.delete().catch(() => {});
      }

      await channel.send({
        components: [buildControlButtons()]
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
          .setCustomId("hf_image")
          .setLabel("Link da Imagem 1")
          .setPlaceholder("https://cdn.discordapp.com/...")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("hf_image2")
          .setLabel("Link da Imagem 2 (Opcional)")
          .setPlaceholder("https://cdn.discordapp.com/...")
          .setStyle(TextInputStyle.Short)
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
    const channel = await client.channels.fetch(HALL_CHANNEL_ID).catch(() => null);
    if (channel && channel.isTextBased()) {
      await ensureButtonAtBottom(channel, client, true);

      await ensureHallRankingsDashboards(client);

      if (shouldRunHallScanToday()) {
        autoCorrectDuplications(channel, client, { showProgress: true })
          .then(() => {
            markHallScanDoneToday();
          })
          .catch((e) => {
            console.error("[HallDaFama] Erro ao rodar varredura em segundo plano:", e);
          });
      }
    }
  }

export async function hallDaFamaHandleInteraction(interaction, client) {
  if (!interaction.guild) return false;

  // ================= RANKING PRIVADO — ORG / PLAYER =================

  if (interaction.isButton() && interaction.customId === BTN_RANK_ORG_SEARCH) {
    const allowed = await ensureRankingAccessOrWL(interaction, "org_search");
    if (!allowed) return true;

    const modal = new ModalBuilder()
      .setCustomId(MODAL_RANK_ORG_SEARCH)
      .setTitle("Pesquisar ORG no Ranking");

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

    await sendRankingPrivateLog(client, interaction, {
      action: "abriu_modal_pesquisa_org",
      type: "org"
    });

    await interaction.showModal(modal);
    return true;
  }

  if (interaction.isButton() && interaction.customId.startsWith(BTN_RANK_ORG_NEXT_PREFIX)) {
    const allowed = await ensureRankingAccessOrWL(interaction, "org_next");
    if (!allowed) return true;

    await interaction.deferReply({ ephemeral: true });

    const page = Number(interaction.customId.replace(BTN_RANK_ORG_NEXT_PREFIX, "")) || 0;
    const rankings = loadHallRankings();
    const result = buildPrivateRankingEmbed(rankings, "org", page);

    await sendRankingPrivateLog(client, interaction, {
      action: "proxima_pagina",
      type: "org",
      page: result.page + 1
    });

    await interaction.editReply({
      embeds: [result.embed],
      components: rankingButtons("org", result.page)
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

  if (interaction.isModalSubmit() && interaction.customId === MODAL_RANK_ORG_SEARCH) {
    await interaction.deferReply({ ephemeral: true });

    const org = interaction.fields.getTextInputValue("rank_org_nome")?.trim();

    const rankings = loadHallRankings();
    const result = buildPrivateRankingEmbed(rankings, "org", 0, { org });

    await sendRankingPrivateLog(client, interaction, {
      action: "pesquisou_org",
      type: "org",
      org,
      page: 1
    });

    await interaction.editReply({
      embeds: [result.embed],
      components: rankingButtons("org", result.page)
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

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(actionType.includes("org") ? BTN_RANK_ORG_SEARCH : BTN_RANK_PLAYER_SEARCH)
        .setLabel(actionType.includes("org") ? "Pesquisar ORG agora" : "Pesquisar Pessoa agora")
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

        if (!alreadyHasCityField) {
          fields.push({
            name: "🏙️ Cidade / CDD",
            value: `${CITIES[cityKey].emoji} ${CITIES[cityKey].label}\nMarcado por: <@${interaction.user.id}>`,
            inline: false
          });
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

      rankings.lastUpdatedAt = Date.now();
      saveHallRankings(rankings);

      await interaction.message.edit({
        components: [],
        content:
          `✅ **Pagamento revisado como ${CITIES[cityKey].label}**\n\n` +
          `👤 Player: **${pending.playerName}** ${pending.playerId ? `| \`${pending.playerId}\`` : ""}\n` +
          `🏁 Evento: **${pending.eventName}**\n` +
          `🔗 Registro: ${pending.jumpUrl}\n\n` +
          `Revisado por <@${interaction.user.id}>.`
      }).catch(() => {});

      await interaction.editReply("✅ Cidade aplicada no registro original. Rode a varredura novamente para contabilizar.");
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

      const attachmentUrls = await getSafeHallImageUrls(client, hallMessage, {
        content: hallMessage.content
      });

      const fixedContent = updateHallCityOnly(hallMessage.content, CITIES[cityKey].label, attachmentUrls);

      if (fixedContent.length > 2000) {
        return interaction.editReply("❌ O Hall ficou maior que 2000 caracteres.");
      }

      await hallMessage.edit({ content: fixedContent });

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

      const attachmentUrls = await getSafeHallImageUrls(client, messageToEdit, {
        content: messageToEdit.content
      });

      const finalContent = updateHallCityOnly(messageToEdit.content, newCityName, attachmentUrls);

      if (finalContent.length > 2000) {
        return interaction.editReply("❌ O Hall ficou maior que 2000 caracteres e não pode ser salvo.");
      }

      await messageToEdit.edit({
        content: finalContent
      });

      await interaction.editReply(`✅ Cidade alterada com sucesso para: **${newCityName}**`);
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
const imageUrls = parts.imageUrls || (imageUrl ? [imageUrl] : []);

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
  .setPlaceholder("Cole 1 ou 2 links aqui, um por linha, se quiser forçar")
  .setRequired(false)
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
if (isPrizesOnly) {
  const titleLine = lines.find(l => l.startsWith('# 🎉 :'));
  const oldEventName = titleLine?.match(/# 🎉 :  \*\*Santa Creators : (.*?)\*\* 🎉/)?.[1] || 'Evento';
  newEventName = newEventNameInput || oldEventName;

  const cityMatch = oldContent.match(/na \*\*(.*?)\*\*!/);
  newCityName = cityMatch ? cityMatch[1] : "CIDADE";

  const introLineIndex = lines.findIndex(l => l.startsWith('# 🎉 :')) + 2;
  newIntro = lines[introLineIndex]?.split(/\s+\*\*.*?\*\*\s+na\s+/)[0]?.trim() || getRandomIntro();

  const oldParts = extractHallParts(oldContent);

  const imageLines = manualImageUrls.length
  ? uniqueImageUrls(manualImageUrls).slice(0, 2)
  : await getSafeHallImageUrls(client, messageToEdit, {
      content: oldContent,
      eventName: oldEventName,
      winnerNames: extractWinnerNamesForApprovalMatch(oldContent),
      manualUrls: []
    });

finalImageUrls = imageLines;
newImageUrl = finalImageUrls[0] || '';
newImageUrl2 = finalImageUrls[1] || '';
} else {
const forcedImageUrls = manualImageUrls.length
  ? manualImageUrls
  : (newImageUrl ? [newImageUrl] : []);

const imageLines = forcedImageUrls.length
  ? uniqueImageUrls(forcedImageUrls).slice(0, 2)
  : await getSafeHallImageUrls(client, messageToEdit, {
      content: oldContent,
      eventName: newEventName,
      winnerNames: extractWinnerNamesForApprovalMatch(oldContent),
      manualUrls: []
    });

finalImageUrls = imageLines;
newImageUrl = finalImageUrls[0] || newImageUrl || '';
newImageUrl2 = finalImageUrls[1] || '';
}
      const mentionsLine = lines.find(l => l.includes('@everyone')) || '';

    // Remonta a mensagem
  const introLine = buildHallIntroLine(newIntro, newEventName, newCityName);

  const finalMessage = 
  `# 🎉 :  **Santa Creators : ${newEventName}** 🎉 

  ${introLine}

  👏  Uma salva de palmas para os BRABOS! 👏 

  <:12633559939374122111:1368796471297576970>  **HALL DA FAMA** <:12633559939374122111:1368796471297576970> 

  ${newWinnersText.trim()}

  **Foi insano, mas mais uma vez os vencedores mostraram que a vitória só é possível com raça! <:__:1357520048318709840>**

  ${mentionsLine}

  ${finalImageUrls.join("\n")}`;

      if (finalMessage.length > 2000) {
        return interaction.editReply("❌ O conteúdo editado é muito longo (mais de 2000 caracteres) e não pode ser salvo. Por favor, reduza o texto dos vencedores.");
      }

      await messageToEdit.edit({ content: finalMessage });

await interaction.editReply("✅ TOPs do Hall da Fama editados com sucesso!");
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
      const imageUrl = interaction.fields.getTextInputValue("hf_image");
      const imageUrl2 = interaction.fields.getTextInputValue("hf_image2");
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
  userId: interaction.user.id,
  cityKey: finalCityKey,
  cityDisplayName,
  eventName,
  winnersText,
  imageUrl,
  imageUrl2,
  eventKey: eventData?.eventKey || null
};
      saveState(state);

      const approvalChannel = await client.channels.fetch(APPROVAL_CHANNEL_ID).catch(() => null);
      if (!approvalChannel) return interaction.editReply("❌ Canal de aprovação não encontrado.");

      const embed = new EmbedBuilder()
        .setTitle("🛡️ Aprovação: Hall da Fama")
        .setColor("#FFD700")
        .setDescription(`**Solicitante:** <@${interaction.user.id}>\n**Cidade:** ${cityDisplayName}`)
        .addFields(
          { name: "Evento (Automático)", value: eventName },
          { name: "Vencedores (Formatado)", value: winnersText },
          { name: "Imagem 1", value: imageUrl },
          { name: "Imagem 2", value: imageUrl2 || "—" }
        )
        .setImage(imageUrl)
        .setTimestamp();

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

      await approvalChannel.send({
        content: "Nova solicitação de Hall da Fama pendente.",
        embeds: [embed],
        components: [row]
      });

      await interaction.editReply("✅ Solicitação enviada para aprovação!");
      return true;
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

      await interaction.message.edit({ components: [] }).catch(() => {});

      const hallChannel = await client.channels.fetch(HALL_CHANNEL_ID).catch(() => null);
      if (!hallChannel) return interaction.editReply("❌ Canal do Hall da Fama não encontrado.");

      const cityData = CITIES[data.cityKey];
  const cityName = data.cityDisplayName || cityData.label;
  const intro = getRandomIntro(); // Frase aleatória
  const introLine = buildHallIntroLine(intro, data.eventName, cityName);

  // Montagem da mensagem final (Estilo Diva/Grande)
  const finalMessage = 
  `# 🎉 :  **Santa Creators : ${data.eventName}** 🎉 

  ${introLine}

  👏  Uma salva de palmas para os BRABOS! 👏 

  <:12633559939374122111:1368796471297576970>  **HALL DA FAMA** <:12633559939374122111:1368796471297576970> 

  ${data.winnersText}

  **Foi insano, mas mais uma vez os vencedores mostraram que a vitória só é possível com raça! <:__:1357520048318709840>**

  ||@everyone @here <@&${ROLE_CIDADAO}> <@&${ROLE_LIDERES}> <@&${cityData.roleId}>||

  ${data.imageUrl}${data.imageUrl2 ? `\n${data.imageUrl2}` : ''}`;

      const chunks = splitText(finalMessage);
      let sentMsg;
      for (const chunk of chunks) {
          sentMsg = await hallChannel.send({ content: chunk });
      }

      if (!sentMsg) {
        return interaction.editReply("❌ Falha ao enviar a mensagem do Hall da Fama. O conteúdo pode estar vazio.");
      }
      
      try {
        const emojis = ["💜", "🔥", "🚀", "👏", "🎉", "🤩", "🏆", "👑", "💸", "✨", "💯", "✅", "💎", "🫡", "🤝", "🤯", "👀", "📸", "⚡", "💣", "👻", "💀", "👽", "👾", "🤖", "🎃", "😺"];
        for (const e of emojis) await sentMsg.react(e).catch(() => {});
      } catch {}

      await ensureButtonAtBottom(hallChannel, client, true);

      try {
        const rankings = loadHallRankings();
        await addHallToRankings(rankings, sentMsg, client);
        saveHallRankings(rankings);
        await publishHallRankings(client, rankings);
      } catch (e) {
        console.error("[HallDaFama] Erro ao atualizar ranking após aprovação:", e);
      }

      dashEmit("halldafama:aprovado", {
        userId: data.userId,
        approverId: interaction.user.id,
        at: Date.now()
        // console.log(`[HALL_DA_FAMA] dashEmit: userId=${data.userId}, approverId=${interaction.user.id}`); // Debug
      });

      // ✅ Log de Auditoria
      await sendAuditHallLog(client, interaction.member, data, sentMsg);


      const embedApproved = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor("#2ecc71")
        .setTitle("✅ Hall da Fama APROVADO")
        .setFooter({ text: `Aprovado por ${interaction.user.tag}` })
        .addFields({ name: '✅ Aprovado por', value: `${interaction.user} (\`${interaction.user.tag}\`)`, inline: false });

      await interaction.message.edit({ embeds: [embedApproved], components: [] });
      
    markTodayEventPosted(data.eventKey, "hallDaFama");

  delete state.pendingRequests[reqId];
  saveState(state);
  processingApprovals.delete(reqId);
  await interaction.editReply("✅ Hall da Fama postado e pontos computados!");
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

      await interaction.message.edit({ embeds: [embedRejected], components: [] });
      
      delete state.pendingRequests[reqId];
      saveState(state);
      await interaction.reply({ content: "❌ Solicitação recusada.", ephemeral: true });
      return true;
    }

    return false;
  }
