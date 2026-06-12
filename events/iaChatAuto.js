// d:\santacreators-main\events\iaChatAuto.js

import fs from "node:fs";
import path from "node:path";

import {
  PermissionsBitField,
  AttachmentBuilder,
  EmbedBuilder,
  ChannelType,
} from "discord.js";

import { GoogleGenAI } from "@google/genai";

// =====================================================
// IA CHAT AUTO PROFISSIONAL — SANTACREATORS
// =====================================================
// • Lê menções
// • Lê cargos
// • Lê canais
// • Lê IDs
// • Lê imagens
// • Lê links
// • Lê reply
// • Lê contexto
// • Memória recente
// • Anti spam
// • Cooldown
// • Logs detalhados
// • Reconhece quando estão falando com ela
// • Respostas mais humanas
// • Melhor leitura do Discord
// =====================================================

const AI_CHANNEL_ID = "1506520202576400404";

const AI_REPLY_ONLY_CHANNEL_ID = "1381597720007151698";

const AI_MEMORY_LOG_CHANNEL_ID = "1506786373687054396";

// =====================================================
// IA ENTREVISTAS — SANTACREATORS
// =====================================================

const IA_ENTREVISTA_CATEGORY_ID = "1359244725781266492";

const IA_ENTREVISTA_LOG_PERGUNTAS_ID = "1486084237772718120";
const IA_ENTREVISTA_LOG_PERGUNTAS_GABARITO_ID = "1463722335176753153";
const IA_ENTREVISTA_LOG_PERGUNTAS_USADO_ID = "1486084393716941031";
const IA_ENTREVISTA_LOG_CORRECAO_ID = "1486006908056899748";

const IA_ENTREVISTA_STATE_FILE = path.resolve(
  process.cwd(),
  "data",
  "ia_entrevistas_state.json"
);

const IA_ENTREVISTA_STAFF_ROLE_IDS = new Set([
  "1414651836861907006",
  "1352407252216184833",
  "1262262852949905409",
  "1352408327983861844",
  "1262262852949905408",
  "1388976314253312100",
  "1282119104576098314",
  "1372716303122567239",
]);

const IA_ENTREVISTA_HELP_ROLE_IDS = [
  "1414651836861907006",
  "1352407252216184833",
  "1262262852949905409",
  "1388976314253312100",
  "1282119104576098314",
];

const IA_ENTREVISTA_ACTIVE = new Map();

// =====================================================
// CONSULTAS INTERNAS — SANTACREATORS
// =====================================================

const AI_ALINHAMENTOS_CHANNEL_ID = "1425256185707233301";
const AI_FIVEM_GI_PANEL_CHANNEL_ID = "1501321157259956244";
const AI_GI_DATA_FILE = path.resolve(process.cwd(), "data", "sc_gi_registros.json");

const AI_INTERNAL_SCAN_LIMIT = 80;

// =====================================================
// [IA SMART PARSER] UTILITÁRIOS DE DATA E EMBEDS
// =====================================================

function parseDiscordTimestamp(text) {
  const match = String(text || "").match(/<t:(\d+):[tTDFdRf]>/);
  return match ? parseInt(match[1], 10) * 1000 : null;
}

function getRelativeTimeScope(text) {
  const norm = normalizeSearchText(text);
  const now = new Date();

  if (norm.includes("hoje") || norm.includes("agora")) return "today";
  if (norm.includes("ontem")) return "yesterday";
  if (norm.includes("semana")) return "week";
  if (norm.includes("mes") || norm.includes("mês")) return "month";

  return "recent";
}

function isDateInScope(timestamp, scope) {
  const date = new Date(timestamp);
  const now = new Date();

  if (Number.isNaN(date.getTime())) return false;

  if (scope === "today") {
    return date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) ===
      now.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  }

  if (scope === "yesterday") {
    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);

    return date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) ===
      yesterday.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  }

  if (scope === "week") {
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    return date >= startOfWeek;
  }

  if (scope === "month") {
    return date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();
  }

  return true;
}

function parseEmbedToFact(msg, emb) {
  const fields = (emb.fields || emb.data?.fields || [])
    .map((field) => `${field.name}: ${field.value}`)
    .join(" | ");

  const footer = emb.footer?.text || emb.data?.footer?.text || "";
  const title = emb.title || emb.data?.title || "";
  const description = emb.description || emb.data?.description || "";
  const discordTs = parseDiscordTimestamp(`${title} ${description} ${fields} ${footer}`);

  const timestamp =
    discordTs ||
    emb.timestamp ||
    emb.data?.timestamp ||
    msg.createdTimestamp ||
    Date.now();

  return {
    fact: `[REGISTRO] ${title} | ${description} | ${fields} | Footer: ${footer}`,
    timestamp: new Date(timestamp).getTime(),
    author: msg.author?.username || "desconhecido",
    link: `https://discord.com/channels/${msg.guildId}/${msg.channelId}/${msg.id}`,
  };
}

const AI_ALLOWED_CHANNEL_IDS = new Set([
  AI_CHANNEL_ID,
  AI_REPLY_ONLY_CHANNEL_ID,
]);

const AI_REPLY_TTL_MS = 2 * 60 * 1000;

const GEMINI_MODEL =
  String(process.env.GEMINI_MODEL || "").trim() ||
  "gemini-2.5-flash-lite";

const GEMINI_MODEL_FALLBACKS = [
  GEMINI_MODEL,
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
].filter((model, index, arr) => {
  return model && arr.indexOf(model) === index;
});

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY || "";

const COOLDOWN_MS = 12000;

const MAX_RESPONSE_CHARS = 1900;

const MAX_HISTORY_MESSAGES = 8;

const MAX_MESSAGE_CHARS = 1200;

const cooldowns = new Map();

const channelHistory = new Map();

const lastAiResponses = new Map();


// =====================================================
// ÍNDICE DE SISTEMAS E CLASSIFICAÇÃO DE INTENÇÃO
// =====================================================

const SC_INTERNAL_SYSTEMS_INDEX = {
  ausencias: {
    name: "Sistema de Ausências",
    files: ["events/ausencias.js", "ausencias_stats.json"],
    keywords: ["ausencia", "ausências", "ausente", "faltou", "justificativa"]
  },
  batePonto: {
    name: "Bate Ponto (Ponto Eletrônico)",
    files: ["events/batePonto.js"],
    keywords: ["bate ponto", "bp", "ponto", "horas", "bater ponto"]
  },
  alinhamentos: {
    name: "Registro de Alinhamentos",
    files: ["events/alinhamentos.js", "sc_alinv1_dashboard_state.json"],
    keywords: ["alinhamento", "alinhou", "alinhado"]
  },
  gi: {
    name: "Gestão Influencer (Controle GI)",
    files: ["events/gestaoinfluencer.js", "sc_gi_registros.json"],
    keywords: ["gi", "gestao influencer", "controle gi", "influencer"]
  },
  ranking: {
    name: "Ranking Semanal e Dashboard Geral",
    files: ["events/scGeralWeeklyRanking.js", "events/scGeralDash.js"],
    keywords: ["ranking", "pontos", "dashboard", "meta semanal", "top 3"]
  },
  pagamentos: {
    name: "Pagamento Social e Financeiro",
    files: ["events/pagamentosocial.js", "sc_pay_evt_dashboard_state.json"],
    keywords: ["pagamento", "pago", "social", "vip", "battlepass", "comprovante"]
  }
};

function classifyCurrentUserIntent(message) {
  const text = normalizeSearchText(message.content);
  
  // Regex para saudações puras ou curtas
  const isGreetingOnly = /^(oi|oie|ola|olá|opa|salve|bom dia|boa tarde|boa noite|oii vida|eae|eaí|e ai|tudo bem|tudo bom)$/i.test(String(message.content || "").trim().replace(/[?.!]/g, ""));

  const intent = {
    isGreetingOnly,
    wantsAusencias: SC_INTERNAL_SYSTEMS_INDEX.ausencias.keywords.some(k => text.includes(k)),
    wantsCronograma: messageWantsCronograma(message),
    wantsAlinhamentos: messageWantsAlinhamentos(message),
    wantsGI: messageWantsGIStatus(message),
    wantsRoles: messageWantsRoles(message) || messageWantsDiscordRoles(message),
    wantsChannels: messageWantsChannels(message),
    hasSpecificReference: 
      message.mentions.channels.size > 0 || 
      message.mentions.roles.size > 0 || 
      message.mentions.users.size > 0 || 
      extractDiscordIdsFromText(message.content).length > 0 ||
      String(message.content || "").includes("discord.com/channels/")
  };

  console.log(`[IA CHAT AUTO] Intenção atual:`, intent);
  return intent;
}

function buildSystemsIndexContext(message) {
  const text = normalizeSearchText(message.content);
  const relevant = [];

  for (const key in SC_INTERNAL_SYSTEMS_INDEX) {
    const sys = SC_INTERNAL_SYSTEMS_INDEX[key];
    if (sys.keywords.some(k => text.includes(k))) {
      relevant.push(`- SISTEMA: ${sys.name} (Arquivos: ${sys.files.join(", ")})`);
    }
  }

  if (!relevant.length) return "";
  return `\nÍNDICE INTERNO RELEVANTE PARA A PERGUNTA:\n${relevant.join("\n")}\n`;
}


const guildKnowledgeCache =
  new Map();

let gemini = null;

// =====================================================
// CONTEXTO FIXO
// =====================================================

const SANTACREATORS_CONTEXT = `
Você é a IA oficial da SantaCreators.

Você possui acesso contextual ao servidor Discord da SantaCreators.

Você consegue:
- ler canais
- ler mensagens
- ler embeds
- ler cronogramas
- ler canais marcados
- ler cargos
- ler hierarquias
- ler usuários
- ler IDs
- ler links
- ler anexos
- entender replies
- usar histórico recente

IMPORTANTE:
Sempre que existir contexto real vindo do Discord, trate isso como informação verdadeira do servidor.

Você NÃO deve agir como se fosse uma IA limitada.
Você NÃO deve pedir para o usuário verificar algo que já foi lido no prompt.
Você NÃO deve fingir que vai procurar depois.
Você deve responder usando os dados já recebidos.

Se o usuário mandar:
- um canal
- um ID
- um link
- um cargo
- um usuário
- uma reply

Você deve assumir que o sistema já buscou essas informações pra você.

Quando citar canal:
use <#ID>

Quando citar cargo:
use <@&ID>

Quando citar usuário:
use <@ID>

Você faz parte da SantaCreators.
Você conhece:
- SantaCreators
- CDD RP
- cronogramas
- organização
- eventos
- equipes
- cargos
- sistemas internos
- canais internos
- RP/FiveM

Seu nome é SantaCreators IA.

Você conversa dentro de um servidor RP/FiveM.

REGRAS:
- Responda SEMPRE em português brasileiro.
- Seja natural.
- Seja inteligente.
- Seja divertida quando fizer sentido.
- Seja profissional quando necessário.
- Nunca fale como robô.
- Nunca diga que é uma IA limitada.
- Nunca invente regras da staff.
- Nunca peça token, senha, API KEY ou dados sensíveis.
- Você pode ajudar:
  • eventos
  • anúncios
  • criatividade
  • dúvidas
  • socialização
  • RP
  • organização
  • Discord
  • SantaCreators

COMPORTAMENTO:
- Se a pessoa marcar alguém, entenda isso.
- Se a pessoa responder alguém, entenda isso.
- Se mandarem link, analise o contexto.
- Se mandarem imagem, reconheça que existe imagem.
- Se mandarem ID, reconheça que é um ID.
- Se mandarem canal, reconheça canal.
- Se mandarem cargo, reconheça cargo.
- Se mandarem usuário, reconheça usuário.

IMPORTANTE:
- Responda de forma humana.
- Evite respostas secas.
- Não faça textão enorme.
- Respostas naturais.
- Use contexto da conversa.
- Não repita mensagens.
- Não responda igual toda hora.
- Você faz parte da SantaCreators.
`;

// =====================================================
// CLIENT GEMINI
// =====================================================

function getGeminiClient() {
  if (gemini) return gemini;

  if (!GEMINI_API_KEY) {
    console.error(
      "[IA CHAT AUTO] GEMINI_API_KEY não encontrada."
    );

    return null;
  }

  gemini = new GoogleGenAI({
    apiKey: GEMINI_API_KEY,
  });

  return gemini;
}

// =====================================================
// HELPERS
// =====================================================

function cleanText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_MESSAGE_CHARS);
}

function limitDiscordText(text) {
  const finalText = String(text || "").trim();

  if (!finalText) return null;

  if (finalText.length <= MAX_RESPONSE_CHARS) {
    return finalText;
  }

  return `${finalText.slice(0, MAX_RESPONSE_CHARS - 3)}...`;
}

function fixBrokenDiscordMentions(text) {
  return String(text || "")
    // ✅ Mantém menções válidas intactas
    .replace(/<@!?(\d{17,22})>/g, "<@$1>")
    .replace(/<@&(\d{17,22})>/g, "<@&$1>")
    .replace(/<#(\d{17,22})>/g, "<#$1>")

    // ✅ Corrige menções sem fechar, mas NÃO quebra ID completo
    .replace(/<@!?(\d{17,22})(?!\d)(?!>)/g, "<@$1>")
    .replace(/<@&(\d{17,22})(?!\d)(?!>)/g, "<@&$1>")
    .replace(/<#(\d{17,22})(?!\d)(?!>)/g, "<#$1>");
}

function uniqueDiscordUserIds(...ids) {
  return [...new Set(
    ids
      .map((id) => String(id || "").trim())
      .filter((id) => /^\d{17,22}$/.test(id))
  )];
}

function buildSafeUserMention(id) {
  const safeId = String(id || "").trim().match(/\d{17,22}/)?.[0];

  if (!safeId) {
    return "mano";
  }

  return `<@${safeId}>`;
}

async function channelHasInterviewStartButton(channel, client) {
  const messages = await channel.messages.fetch({ limit: 25 }).catch(() => null);
  if (!messages?.size) return false;

  return messages.some((msg) =>
    msg.author?.id === client.user.id &&
    msg.components?.some((row) =>
      row.components?.some((component) =>
        String(component.customId || "").startsWith(`iniciar|${channel.id}`)
      )
    )
  );
}

function isShortGreeting(text) {
  const norm = normalizeSearchText(text);

  return [
    "oi",
    "oie",
    "oiee",
    "ola",
    "olá",
    "eai",
    "eaí",
    "e ai",
    "opa",
    "salve",
    "bom dia",
    "boa tarde",
    "boa noite",
  ].includes(norm);
}

async function buildIaInterviewRecentHumanContext(message, openerId) {
  const messages = await message.channel.messages.fetch({ limit: 20 }).catch(() => null);
  if (!messages?.size) {
    return {
      historyText: "Sem histórico recente.",
      hasHumanSupportRecently: false,
    };
  }

  const ordered = [...messages.values()].reverse();

  const humanMessages = ordered.filter((msg) => !msg.author.bot);
  const hasHumanSupportRecently = humanMessages.some((msg) =>
    msg.author.id !== openerId &&
    Date.now() - msg.createdTimestamp <= 5 * 60 * 1000
  );

  const historyText = humanMessages
    .slice(-10)
    .map((msg) => {
      const who = msg.author.id === openerId ? "CANDIDATO" : "OUTRO_HUMANO";
      return `${who} ${msg.author.tag}: ${cleanText(msg.content || "")}`;
    })
    .join("\n");

  return {
    historyText: historyText || "Sem histórico recente.",
    hasHumanSupportRecently,
  };
}

async function buildAllowedMentionUsers(message, client) {
  const users = new Set();

  if (message.author?.id) {
    users.add(message.author.id);
  }

  for (const [, user] of message.mentions.users || []) {
    if (user?.id && user.id !== client.user.id) {
      users.add(user.id);
    }
  }

  if (message.reference?.messageId) {
    const replied = await message.channel.messages
      .fetch(message.reference.messageId)
      .catch(() => null);

    if (replied?.author?.id && !replied.author.bot) {
      users.add(replied.author.id);
    }
  }

  return [...users];
}

function normalizeAiCompareText(text) {
  return normalizeSearchText(text)
    .replace(/<@!?\d{17,22}>/g, "")
    .replace(/<@&\d{17,22}>/g, "")
    .replace(/<#\d{17,22}>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function rememberAiResponse(channelId, text) {
  const arr = lastAiResponses.get(channelId) || [];

  arr.push({
    text: normalizeAiCompareText(text),
    timestamp: Date.now(),
  });

  while (arr.length > 6) {
    arr.shift();
  }

  lastAiResponses.set(channelId, arr);
}

function iaResponseLooksRepeated(channelId, text) {
  const arr = lastAiResponses.get(channelId) || [];

  const normalized = normalizeAiCompareText(text);

  if (!normalized) return false;

  return arr.some((item) => {
    if (!item?.text) return false;

    return (
      item.text === normalized ||
      item.text.includes(normalized) ||
      normalized.includes(item.text)
    );
  });
}

function buildNonRepeatedFallback(message) {
  const content = normalizeSearchText(message.content);

  if (
    content.includes("teste") ||
    content.includes("testando") ||
    content.includes("funcionando")
  ) {
    return "Tá funcionando sim 😎 Recebi tua mensagem e respondi normal. Se quiser, manda uma pergunta real agora pra testar contexto, reply, menção ou canal.";
  }

  if (
    content === "oi" ||
    content === "oie" ||
    content === "opa" ||
    content === "salve"
  ) {
    return "Opa! Tô por aqui sim 😄 manda aí no que posso ajudar.";
  }

  return "Entendi 😎 me manda o que você quer saber exatamente que eu respondo direto, sem repetir a mesma coisa.";
}

// =====================================================
// BLOQUEIO DE RESPOSTAS "VOU VER / AGUENTA AÍ"
// =====================================================

function iaResponseLooksLikePending(text) {
  const normalized = normalizeSearchText(text);

  const forbiddenPhrases = [
    "vou olhar",
    "vou ver",
    "vou verificar",
    "deixa eu ver",
    "deixa eu olhar",
    "aguenta ai",
    "aguarde",
    "ja volto",
    "so um minuto",
    "um minuto",
    "pera ai",
    "vou dar uma olhada",
  ];

  return forbiddenPhrases.some((phrase) =>
    normalized.includes(phrase)
  );
}

function buildFallbackInstantResponse(message) {
  const content = normalizeSearchText(message.content);

  if (
    content.includes("resp influ") ||
    content.includes("responsavel influ") ||
    content.includes("responsavel influencer")
  ) {
    return "Eu não consegui identificar com certeza quem é seu Resp Influ pelas informações disponíveis aqui. Me manda a menção do cargo, o canal da hierarquia ou o print certinho que eu respondo direto, sem enrolar.";
  }

  return "Não consegui encontrar essa informação com segurança agora. Me manda o canal, cargo, ID ou print certo que eu respondo direto com base nisso.";
}

// =====================================================
// RESPOSTAS DIRETAS DO DISCORD SEM GEMINI
// =====================================================

function messageAsksWhoRoleIs(message) {
  const text = normalizeSearchText(message.content);

  return (
    text.includes("quem e") ||
    text.includes("quem eh") ||
    text.includes("quem sao") ||
    text.includes("ver quem") ||
    text.includes("veja quem") ||
    text.includes("ver ai quem") ||
    text.includes("meu resp") ||
    text.includes("resp influ")
  );
}

function buildRoleMembersAnswer(message) {
  if (!message.guild) return null;

  if (!message.mentions.roles.size) return null;

  if (!messageAsksWhoRoleIs(message)) return null;

  const role = message.mentions.roles.first();

  if (!role) return null;

  const members = role.members
    .filter((member) => !member.user.bot)
    .map((member) => {
      return `- <@${member.id}> | ${member.user.tag}`;
    })
    .slice(0, 25);

  if (!members.length) {
    return `O cargo <@&${role.id}> existe, mas não encontrei nenhum membro humano com esse cargo agora.`;
  }

  return [
    `Achei sim, Macedo 😎`,
    ``,
    `O cargo <@&${role.id}> tem ${role.members.size} membro(s):`,
    ``,
    members.join("\n"),
  ].join("\n");
}

function buildDirectDiscordAnswer(message) {
  const roleMembersAnswer = buildRoleMembersAnswer(message);

  if (roleMembersAnswer) {
    return roleMembersAnswer;
  }

  return null;
}

function rememberMessage(channelId, author, content) {
  const history = channelHistory.get(channelId) || [];

  history.push({
    author,
    content,
    timestamp: Date.now(),
  });

  while (history.length > MAX_HISTORY_MESSAGES) {
    history.shift();
  }

  channelHistory.set(channelId, history);
}

async function warmupGuildKnowledge(guild) {
  try {
    if (!guild || guildKnowledgeCache.has(guild.id)) return;
    console.log(`[IA CHAT AUTO] Iniciando warmup inteligente do servidor ${guild.name}`);
    const knowledge = [];
    const channels = guild.channels.cache.filter((c) => c?.isTextBased?.()).first(25);
    for (const channel of channels) {
      try {
        const messages = await channel.messages.fetch({ limit: 3 }).catch(() => null);
        if (!messages) continue;
        knowledge.push(`CANAL: #${channel.name}`);
        for (const msg of messages.values()) {
          if (msg.content) knowledge.push(cleanText(msg.content));
          for (const embed of msg.embeds) {
            const embedText = formatEmbedForAI(embed.data || embed);
            if (embedText) knowledge.push(embedText);
          }
        }
      } catch {}
    }
    guildKnowledgeCache.set(guild.id, knowledge.join("\n").slice(0, 15000));
    console.log(`[IA CHAT AUTO] Warmup concluído.`);
  } catch (err) {
    console.error("[IA CHAT AUTO] Erro warmup:", err);
  }
}

function getHistory(channelId) {
  const history = channelHistory.get(channelId) || [];
  if (!history.length) return "Sem histórico.";
  return history.map((msg) => `${msg.author}: ${msg.content}`).join("\n");
}

function getCooldownRemaining(userId) {
  const expiresAt = cooldowns.get(userId) || 0;

  const now = Date.now();

  if (now >= expiresAt) return 0;

  return expiresAt - now;
}

function setCooldown(userId) {
  cooldowns.set(userId, Date.now() + COOLDOWN_MS);
}

async function sendTemporaryReply(message, payload) {
  const sent = await message.reply(payload).catch(() => null);

  // ✅ Em ticket de entrevista, NUNCA apaga histórico.
  // A conversa da IA precisa ficar salva para transcript, correção e análise.
  if (isIaInterviewChannel(message.channel)) {
    return sent;
  }

  if (sent) {
    setTimeout(async () => {
      try {
        await sent.delete().catch(() => {});

        if (message.deletable) {
          await message.delete().catch(() => {});
        }

      } catch (err) {
        console.error(
          "[IA CHAT AUTO] Erro ao apagar mensagens:",
          err
        );
      }
    }, AI_REPLY_TTL_MS);
  }

  return sent;
}

async function sendConversationMemoryLog(client, message, aiResponse) {
  try {
    const logChannel =
      client.channels.cache.get(AI_MEMORY_LOG_CHANNEL_ID) ||
      await client.channels.fetch(AI_MEMORY_LOG_CHANNEL_ID).catch(() => null);

    if (!logChannel?.isTextBased?.()) return;

    const embed = new EmbedBuilder()
      .setColor(0x9b59ff)
      .setTitle("🧠 Registro de conversa da IA")
      .addFields(
        {
          name: "👤 Usuário",
          value: `<@${message.author.id}> | ${message.author.tag}\nID: ${message.author.id}`,
          inline: false,
        },
        {
          name: "💬 Mensagem do usuário",
          value: cleanText(message.content || "Sem texto").slice(0, 1000),
          inline: false,
        },
        {
          name: "🤖 Resposta da IA",
          value: cleanText(aiResponse || "Sem resposta").slice(0, 1000),
          inline: false,
        },
        {
          name: "📍 Canal",
          value: `<#${message.channelId}> | ID: ${message.channelId}`,
          inline: false,
        }
      )
      .setTimestamp();

    if (message.reference?.messageId) {
      embed.addFields({
        name: "↩️ Reply",
        value: `Mensagem respondida: ${message.reference.messageId}`,
        inline: false,
      });
    }

    if (message.attachments?.size > 0) {
      embed.addFields({
        name: "📎 Anexos",
        value: [...message.attachments.values()]
          .map((a) => `${a.name || "arquivo"} | ${a.url}`)
          .join("\n")
          .slice(0, 1000),
        inline: false,
      });
    }

    await logChannel.send({ embeds: [embed] }).catch(() => {});
  } catch (err) {
    console.error("[IA CHAT AUTO] Erro ao salvar memória/log:", err);
  }
}

async function fetchRecentMemoryLogs(client) {
  try {
    const logChannel =
      client.channels.cache.get(AI_MEMORY_LOG_CHANNEL_ID) ||
      await client.channels.fetch(AI_MEMORY_LOG_CHANNEL_ID).catch(() => null);

    if (!logChannel?.isTextBased?.()) {
      return "Canal de memória não encontrado.";
    }

const messages = await logChannel.messages.fetch({ limit: 5 }).catch(() => null);

    if (!messages?.size) {
      return "Sem registros anteriores no canal de memória.";
    }

    const linhas = [];

    for (const msg of [...messages.values()].reverse()) {
      for (const embed of msg.embeds || []) {
        const text = formatEmbedForAI(embed.data || embed);
        if (text) linhas.push(text);
      }
    }

    return linhas.join("\n\n---\n\n").slice(0, 6000);
  } catch (err) {
    console.error("[IA CHAT AUTO] Erro ao buscar memória:", err);
    return "Não consegui buscar a memória anterior.";
  }
}

// =====================================================
// INTELIGÊNCIA DO SERVIDOR / CANAIS / CARGOS
// =====================================================

function normalizeSearchText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s#@<>&:./-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractDiscordIdsFromText(text) {
  const raw = String(text || "");
  const ids = new Set();

  const patterns = [
    /<#(\d{17,22})>/g, // Menção de Canal
    /<@&(\d{17,22})>/g, // Menção de Cargo
    /<@!?(\d{17,22})>/g, // Menção de Usuário
    /channels\/\d{17,22}\/(\d{17,22})/g, // Links de Canais/Mensagens
    /\b(\d{17,22})\b/g, // ID Puro
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(raw)) !== null) {
      if (match[1]) ids.add(match[1]);
    }
  }
  
  // Log de IDs encontrados para depuração
  if (ids.size > 0) console.log(`[IA CHAT AUTO] IDs Identificados no texto: ${[...ids].join(", ")}`);
  
  return [...ids];
}


function messageWantsCronograma(message) {
  const text = normalizeSearchText(message.content);

  return (
    text.includes("cronograma") ||
    text.includes("conograma") ||
    text.includes("agenda") ||
    text.includes("evento semanal") ||
    text.includes("eventos semanais")
  );
}

function messageWantsRoles(message) {
  const text = normalizeSearchText(message.content);
  // Foca na Hierarquia de ROLEPLAY / CDD
  return (
    text.includes("hierarquia") ||
    text.includes("cdd") ||
    text.includes("regras") ||
    text.includes("organizacao")
  );
}

function messageWantsDiscordRoles(message) {
  const text = normalizeSearchText(message.content);
  // Foca nos CARGOS técnicos do servidor
  return (
    text.includes("cargo") ||
    text.includes("permissao") ||
    text.includes("permissões") ||
    text.includes("meus cargos") ||
    text.includes("roles")
  );
}


function messageWantsChannels(message) {
  const text = normalizeSearchText(message.content);

  return (
    text.includes("canal") ||
    text.includes("canais") ||
    text.includes("onde fica") ||
    text.includes("qual canal") ||
    text.includes("ver canal")
  );
}

function channelLooksLikeCronograma(channel) {
  const name = normalizeSearchText(channel?.name);

  return (
    name.includes("cronograma") ||
    name.includes("conograma") ||
    name.includes("agenda")
  );
}

function channelLooksLikeHierarquia(channel) {
  const name = normalizeSearchText(channel?.name);

  return (
    name.includes("hierarquia") ||
    name.includes("cdd") ||
    name.includes("rp") ||
    name.includes("regras") ||
    name.includes("informacoes")
  );
}

function scoreChannelRelevance(channel, searchTerms = []) {
  if (!channel?.name) return 0;

  const normalized = normalizeSearchText(channel.name);

  let score = 0;

  for (const term of searchTerms) {
    if (!term) continue;

    const normalizedTerm = normalizeSearchText(term);

    if (normalized.includes(normalizedTerm)) {
      score += 10;
    }
  }

  const parentName = normalizeSearchText(channel.parent?.name || "");

  if (parentName.includes("entretenimento")) score += 3;
  if (parentName.includes("avisos")) score += 4;
  if (parentName.includes("controle")) score += 5;

  return score;
}

function findRelevantChannels(guild, searchTerms = [], limit = 5) {
  if (!guild) return [];

  return guild.channels.cache
    .filter((c) => c?.isTextBased?.())
    .map((channel) => ({
      channel,
      score: scoreChannelRelevance(channel, searchTerms),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.channel);
}

async function resolveMentionedChannels(message) {
  const guild = message.guild;
  const found = new Map();

  for (const [, channel] of message.mentions.channels) {
    if (channel?.id) found.set(channel.id, channel);
  }

  const ids = extractDiscordIdsFromText(message.content);

  for (const id of ids) {
    try {
      const channel =
        guild.channels.cache.get(id) ||
        await guild.channels.fetch(id).catch(() => null);

      if (channel?.id && channel.isTextBased?.()) {
        found.set(channel.id, channel);
      }
    } catch {}
  }

  return [...found.values()];
}

async function readTextChannelMessages(channel, limit = 10) {
  // Verifica permissão antes de ler
  const me = channel.guild.members.me;
  if (!channel.permissionsFor(me).has([PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory])) {
    return `[ERRO] Sem permissão para ler o canal <#${channel.id}>. Avise o usuário para verificar minhas permissões de "Ver Canal" e "Ler Histórico".`;
  }

  const messages = await channel.messages
    .fetch({ limit })
    .catch(() => null);

  if (!messages || messages.size <= 0) {
    return `Canal lido: <#${channel.id}> (${channel.id}), mas não encontrei mensagens recentes ou não tenho permissão para ler histórico.`;
  }

  const linhas = [];

  linhas.push(`CANAL LIDO: <#${channel.id}>`);
  linhas.push(`Nome real: #${channel.name}`);
  linhas.push(`ID: ${channel.id}`);
  linhas.push("");

  const orderedMessages = [...messages.values()].reverse();

  for (const msg of orderedMessages) {
    const partes = [];

    if (msg.content) {
      partes.push(`Texto: ${cleanText(msg.content)}`);
    }

    if (msg.embeds?.length > 0) {
      for (const embed of msg.embeds.slice(0, 4)) {
        const embedText = formatEmbedForAI(embed.data || embed);

        if (embedText) {
          partes.push(`Embed:\n${embedText}`);
        }
      }
    }

    if (msg.attachments?.size > 0) {
      partes.push(
        `Anexos: ${[...msg.attachments.values()]
          .map((a) => `${a.name || "arquivo"} | ${a.url}`)
          .join(" | ")}`
      );
    }

    if (partes.length > 0) {
      linhas.push(`Mensagem de ${msg.author?.username || "desconhecido"}:`);
      linhas.push(partes.join("\n"));
      linhas.push("---");
    }
  }

  return linhas.join("\n").slice(0, 7000);
}

async function fetchMentionedChannelsContext(message) {
  const channels = await resolveMentionedChannels(message);

  if (!channels.length) {
    return "Nenhum canal mencionado por ID, link ou menção foi encontrado.";
  }

  const blocks = [];

  for (const channel of channels.slice(0, 3)) {
    blocks.push(await readTextChannelMessages(channel, 12));
  }

  return blocks.join("\n\n====================\n\n");
}

async function fetchHierarquiaContext(message) {
  const guild = message.guild;
  if (!guild) return "Servidor não encontrado.";

  const mentionedChannels = await resolveMentionedChannels(message);

const targetChannels =
  mentionedChannels.length
    ? mentionedChannels
    : findRelevantChannels(
        guild,
        [
          "hierarquia",
          "cdd",
          "rp",
          "regras",
          "organizacao",
          "informacoes",
        ],
        5
      ).filter(c => c && c.isTextBased?.() && channelLooksLikeHierarquia(c)).slice(0, 3);

  if (!targetChannels.length) {
    return "Não encontrei canal de hierarquia por nome, ID, link ou menção.";
  }

  const blocks = [];

  for (const channel of targetChannels) {
    blocks.push(await readTextChannelMessages(channel, 12));
  }

  return blocks.join("\n\n====================\n\n");
}

function formatEmbedForAI(embed) {
  const lines = [];

  if (embed.title) lines.push(`Título: ${embed.title}`);
  if (embed.description) lines.push(`Descrição: ${embed.description}`);

  if (Array.isArray(embed.fields) && embed.fields.length > 0) {
    lines.push("Campos:");

    for (const field of embed.fields.slice(0, 12)) {
      lines.push(`- ${field.name}: ${field.value}`);
    }
  }

  if (embed.footer?.text) lines.push(`Rodapé: ${embed.footer.text}`);

  return lines.join("\n");
}

async function fetchCronogramaContext(message) {
  try {
    const guild = message.guild;
    if (!guild) return "Servidor não encontrado.";

    const mentionedChannels = await resolveMentionedChannels(message);

const channels = mentionedChannels.length
    ? mentionedChannels
    : findRelevantChannels(
        guild,
        [
          "cronograma",
          "agenda",
          "eventos",
          "eventos-semanais",
          "calendario",
        ],
        5
      ).filter(c => c && c.isTextBased?.() && channelLooksLikeCronograma(c)).slice(0, 3);

    if (!channels.length) {
      return "Nenhum canal parecido com cronograma foi encontrado por nome, ID, link ou menção.";
    }

    const blocks = [];

    for (const channel of channels) {
      blocks.push(await readTextChannelMessages(channel, 12));
    }

    return blocks.join("\n\n====================\n\n");
  } catch (err) {
    console.error("[IA CHAT AUTO] Erro ao buscar cronograma:", err);
    return "Tentei buscar o cronograma, mas deu erro ao acessar o canal.";
  }
}

function buildRolesHierarchyContext(message) {
  try {
    const guild = message.guild;
    if (!guild) return "Servidor não encontrado.";

    const roles = guild.roles.cache
      .filter((role) => role.name !== "@everyone")
      .sort((a, b) => b.position - a.position)
      .map((role) => {
        return `- <@&${role.id}> | nome: ${role.name} | ID: ${role.id} | posição: ${role.position} | membros: ${role.members?.size || 0}`;
      })
      .slice(0, 45);

    if (!roles.length) {
      return "Nenhum cargo encontrado no cache.";
    }

    return `HIERARQUIA DE CARGOS DO DISCORD:\n${roles.join("\n")}`;
  } catch (err) {
    console.error("[IA CHAT AUTO] Erro ao montar hierarquia:", err);
    return "Não consegui montar a hierarquia de cargos.";
  }
}

function buildChannelsContext(message) {
  try {
    const guild = message.guild;
    if (!guild) return "Servidor não encontrado.";

    const channels = guild.channels.cache
      .filter((channel) => channel && channel.name)
      .sort((a, b) => {
        const posA = typeof a.rawPosition === "number" ? a.rawPosition : 0;
        const posB = typeof b.rawPosition === "number" ? b.rawPosition : 0;
        return posA - posB;
      })
      .map((channel) => {
        const parentName = channel.parent?.name || "Sem categoria";
        return `- <#${channel.id}> | nome: #${channel.name} | ID: ${channel.id} | categoria: ${parentName}`;
      })
      .slice(0, 80);

    if (!channels.length) {
      return "Nenhum canal encontrado no cache.";
    }

    return `LISTA DE CANAIS VISÍVEIS NO CACHE:\n${channels.join("\n")}`;
  } catch (err) {
    console.error("[IA CHAT AUTO] Erro ao montar canais:", err);
    return "Não consegui montar a lista de canais.";
  }
}


// =====================================================
// CONSULTAS INTERNAS — ALINHAMENTOS / GI
// =====================================================

function messageWantsAlinhamentos(message) {
  const text = normalizeSearchText(message.content);

  return (
    text.includes("alinhou") ||
    text.includes("alinhamento") ||
    text.includes("alinhamentos") ||
    text.includes("quem alinhou") ||
    text.includes("foi alinhado") ||
    text.includes("sobre o que alinharam")
  );
}

function messageWantsGIStatus(message) {
  const text = normalizeSearchText(message.content);

  return (
    text.includes("controle gi") ||
    text.includes("gestao influencer") ||
    text.includes("gestaoinfluencer") ||
    text.includes("gi ativo") ||
    text.includes("gi ativos") ||
    text.includes("gi pausado") ||
    text.includes("gi pausados") ||
    text.includes("controles ativos") ||
    text.includes("controles pausados")
  );
}

function getEmbedFieldValue(embed, names = []) {
  const fields = embed?.fields || embed?.data?.fields || [];

  for (const field of fields) {
    const fieldName = normalizeSearchText(field?.name || "");

    if (names.some((name) => fieldName.includes(normalizeSearchText(name)))) {
      return String(field?.value || "").trim();
    }
  }

  return null;
}

function formatMessageLink(msg) {
  try {
    return `https://discord.com/channels/${msg.guildId}/${msg.channelId}/${msg.id}`;
  } catch {
    return null;
  }
}

async function fetchAlinhamentosContext(message) {
  try {
    const guild = message.guild;
    if (!guild) return "Servidor não encontrado.";

    const channel = await guild.channels.fetch(AI_ALINHAMENTOS_CHANNEL_ID).catch(() => null);

    if (!channel?.isTextBased?.()) {
      return `Canal de alinhamentos <#${AI_ALINHAMENTOS_CHANNEL_ID}> não encontrado ou inválido.`;
    }

    const messages = await channel.messages.fetch({ limit: AI_INTERNAL_SCAN_LIMIT }).catch(() => null);

    if (!messages?.size) {
      return `Canal <#${AI_ALINHAMENTOS_CHANNEL_ID}> lido, mas nenhum alinhamento recente foi encontrado.`;
    }

    const userQuestion = normalizeSearchText(message.content);
    const mentionedIds = extractDiscordIdsFromText(message.content);

    const registros = [];

    for (const msg of [...messages.values()]) {
      const emb = msg.embeds?.[0];
      if (!emb) continue;

      const title = normalizeSearchText(emb.title || emb.data?.title || "");
      const footer = normalizeSearchText(emb.footer?.text || emb.data?.footer?.text || "");

      const isAlinhamento =
        title.includes("registro de alinhamento") ||
        footer.includes("alinv1");

      if (!isAlinhamento) continue;

      const quemFoi = getEmbedFieldValue(emb, ["quem foi alinhado"]);
      const quemAlinhou = getEmbedFieldValue(emb, ["quem alinhou"]);
      const sobre = getEmbedFieldValue(emb, ["sobre"]);
      const registradoPor = getEmbedFieldValue(emb, ["registrado por"]);
      const quando = getEmbedFieldValue(emb, ["quando"]);
      const status = getEmbedFieldValue(emb, ["status"]);

      const haystack = normalizeSearchText([
        quemFoi,
        quemAlinhou,
        sobre,
        registradoPor,
        quando,
        status,
        msg.content,
      ].filter(Boolean).join(" "));

      const matchesMentionedId =
        mentionedIds.length > 0 &&
        mentionedIds.some((id) => haystack.includes(id));

      const matchesQuestion =
        !mentionedIds.length ||
        matchesMentionedId ||
        userQuestion.split(" ").some((part) => part.length >= 4 && haystack.includes(part));

      if (!matchesQuestion && registros.length >= 10) continue;

      registros.push({
        criadoEm: new Date(msg.createdTimestamp).toLocaleString("pt-BR", {
          timeZone: "America/Sao_Paulo",
        }),
        quemFoi: quemFoi || "—",
        quemAlinhou: quemAlinhou || "—",
        sobre: sobre || "—",
        registradoPor: registradoPor || "—",
        quando: quando || "—",
        status: status || "—",
        link: formatMessageLink(msg) || "—",
      });
    }

    if (!registros.length) {
      return [
        `CONSULTA INTERNA — ALINHAMENTOS`,
        `Canal consultado: <#${AI_ALINHAMENTOS_CHANNEL_ID}>`,
        `Resultado: nenhum registro compatível com a pergunta foi encontrado nas últimas ${AI_INTERNAL_SCAN_LIMIT} mensagens.`,
      ].join("\n");
    }

    return [
      `CONSULTA INTERNA — ALINHAMENTOS`,
      `Canal consultado: <#${AI_ALINHAMENTOS_CHANNEL_ID}>`,
      `Registros encontrados: ${registros.length}`,
      "",
      ...registros.slice(0, 15).map((r, i) => {
        return [
          `#${i + 1}`,
          `Criado em: ${r.criadoEm}`,
          `Quem foi alinhado: ${r.quemFoi}`,
          `Quem alinhou: ${r.quemAlinhou}`,
          `Sobre: ${r.sobre}`,
          `Registrado por: ${r.registradoPor}`,
          `Quando: ${r.quando}`,
          `Status: ${r.status}`,
          `Link: ${r.link}`,
        ].join("\n");
      }),
    ].join("\n\n");
  } catch (err) {
    console.error("[IA CHAT AUTO] Erro ao buscar alinhamentos:", err);
    return "Erro ao consultar alinhamentos.";
  }
}

function readGiRecordsFromFile() {
  try {
    if (!fs.existsSync(AI_GI_DATA_FILE)) return [];

    const raw = fs.readFileSync(AI_GI_DATA_FILE, "utf8");
    const data = JSON.parse(raw || "{}");

    if (!Array.isArray(data.registros)) return [];

    return data.registros;
  } catch (err) {
    console.error("[IA CHAT AUTO] Erro ao ler sc_gi_registros.json:", err);
    return [];
  }
}

async function fetchGIStatusContext(message) {
  try {
    const records = readGiRecordsFromFile();

    const ativos = [];
    const pausados = [];

    for (const rec of records) {
      const item = {
        targetId: String(rec.targetId || ""),
        area: rec.area || "—",
        active: rec.active !== false,
        responsibleUserId: rec.responsibleUserId || null,
        responsibleType: rec.responsibleType || "—",
        pausedAtMs: rec.pausedAtMs || null,
        createdAtMs: rec.createdAtMs || null,
        messageId: rec.messageId || null,
        channelId: rec.channelId || null,
        guildId: rec.guildId || message.guild?.id || null,
        note: rec.note || "",
      };

      if (!item.targetId) continue;

      if (item.active) ativos.push(item);
      else pausados.push(item);
    }

    const panelChannel = await message.guild.channels.fetch(AI_FIVEM_GI_PANEL_CHANNEL_ID).catch(() => null);
    let panelContext = "";

    if (panelChannel?.isTextBased?.()) {
      const panelMessages = await panelChannel.messages.fetch({ limit: 8 }).catch(() => null);

      if (panelMessages?.size) {
        const lines = [];

        for (const msg of [...panelMessages.values()].reverse()) {
          for (const embed of msg.embeds || []) {
            const embedText = formatEmbedForAI(embed.data || embed);
            if (embedText) lines.push(embedText);
          }

          if (msg.content) lines.push(cleanText(msg.content));
        }

        panelContext = lines.join("\n\n---\n\n").slice(0, 5000);
      }
    }

    const formatRec = (rec) => {
      const pausedText = rec.pausedAtMs
        ? new Date(rec.pausedAtMs).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
        : "—";

      const createdText = rec.createdAtMs
        ? new Date(rec.createdAtMs).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
        : "—";

      const link =
        rec.guildId && rec.channelId && rec.messageId
          ? `https://discord.com/channels/${rec.guildId}/${rec.channelId}/${rec.messageId}`
          : "—";

      return [
        `Membro: <@${rec.targetId}> (${rec.targetId})`,
        `Status: ${rec.active ? "Ativo" : "Pausado"}`,
        `Área: ${rec.area}`,
        `Responsável: ${rec.responsibleUserId ? `<@${rec.responsibleUserId}>` : "—"} (${rec.responsibleType})`,
        `Criado em: ${createdText}`,
        `Pausado em: ${pausedText}`,
        `Observação: ${rec.note || "—"}`,
        `Registro: ${link}`,
      ].join("\n");
    };

    return [
      `CONSULTA INTERNA — CONTROLE GI`,
      `Arquivo lido: ${AI_GI_DATA_FILE}`,
      `Canal/painel consultado: <#${AI_FIVEM_GI_PANEL_CHANNEL_ID}>`,
      `Total de registros: ${records.length}`,
      `Ativos: ${ativos.length}`,
      `Pausados: ${pausados.length}`,
      "",
      `GI ATIVOS:`,
      ativos.slice(0, 20).map(formatRec).join("\n\n") || "Nenhum ativo encontrado.",
      "",
      `GI PAUSADOS:`,
      pausados.slice(0, 20).map(formatRec).join("\n\n") || "Nenhum pausado encontrado.",
      "",
      `PAINEL/CANAL ${AI_FIVEM_GI_PANEL_CHANNEL_ID}:`,
      panelContext || "Nenhuma mensagem recente útil encontrada no painel.",
    ].join("\n\n");
  } catch (err) {
    console.error("[IA CHAT AUTO] Erro ao buscar status GI:", err);
    return "Erro ao consultar controles GI.";
  }
}


// =====================================================
// [IA INTERNAL QUERY] FETCHERS MODULARES
// =====================================================

async function fetchPoderesContext(message, scope) {
  console.log(`[IA INTERNAL QUERY] Buscando Poderes Utilizados... Scope: ${scope}`);

  const guild = message.guild;
  const channel = await guild.channels.fetch("1374066813171929218").catch(() => null);

  if (!channel?.isTextBased?.()) {
    return "Sistema de Poderes: canal não encontrado ou sem acesso.";
  }

  const messages = await channel.messages.fetch({ limit: AI_INTERNAL_SCAN_LIMIT }).catch(() => null);

  if (!messages?.size) {
    return "Sistema de Poderes: nenhum registro recente encontrado.";
  }

  const facts = [];

  for (const msg of messages.values()) {
    const emb = msg.embeds?.[0];
    if (!emb) continue;

    const text = normalizeSearchText(formatEmbedForAI(emb.data || emb));

    const isPoder =
      text.includes("poderes utilizados") ||
      text.includes("registro de poderes") ||
      text.includes("setou poder") ||
      text.includes("uso de poder");

    if (!isPoder) continue;

    const data = parseEmbedToFact(msg, emb);

    if (isDateInScope(data.timestamp, scope)) {
      facts.push(`- ${data.fact}\nLink: ${data.link}`);
    }
  }

  return facts.length
    ? `CONSULTA INTERNA — PODERES UTILIZADOS\nRegistros encontrados: ${facts.length}\n\n${facts.slice(0, 20).join("\n\n")}`
    : "Nenhum registro de poderes encontrado para este período.";
}

async function fetchPoderesEventosContext(message, scope) {
  console.log(`[IA INTERNAL QUERY] Buscando Poderes em Eventos... Scope: ${scope}`);

  const guild = message.guild;
  const channel = await guild.channels.fetch("1392618646630568076").catch(() => null);

  if (!channel?.isTextBased?.()) {
    return "Sistema de Poderes em Eventos: canal não encontrado ou sem acesso.";
  }

  const messages = await channel.messages.fetch({ limit: AI_INTERNAL_SCAN_LIMIT }).catch(() => null);

  if (!messages?.size) {
    return "Sistema de Poderes em Eventos: nenhum registro recente encontrado.";
  }

  const facts = [];

  for (const msg of messages.values()) {
    const emb = msg.embeds?.[0];
    if (!emb) continue;

    const text = normalizeSearchText(formatEmbedForAI(emb.data || emb));

    const isPoderEvento =
      text.includes("poder") &&
      (
        text.includes("evento") ||
        text.includes("social") ||
        text.includes("registrado por") ||
        text.includes("registro de evento")
      );

    if (!isPoderEvento) continue;

    const data = parseEmbedToFact(msg, emb);

    if (isDateInScope(data.timestamp, scope)) {
      facts.push(`- ${data.fact}\nLink: ${data.link}`);
    }
  }

  return facts.length
    ? `CONSULTA INTERNA — PODERES EM EVENTOS\nRegistros encontrados: ${facts.length}\n\n${facts.slice(0, 20).join("\n\n")}`
    : "Nenhum registro de poderes em eventos encontrado para este período.";
}

async function fetchRankingContext(message) {
  console.log("[IA INTERNAL QUERY] Consultando Ranking Semanal...");

  try {
    const { getWeeklyRankingDebug } = await import("./scGeralWeeklyRanking.js");

    const rankData = await getWeeklyRankingDebug(message.client);

    if (!rankData || !Array.isArray(rankData.top15) || !rankData.top15.length) {
      return "O ranking semanal ainda não possui dados processados ou o export getWeeklyRankingDebug não retornou top15.";
    }

    const lines = rankData.top15.map((user, index) => {
      return `${index + 1}º. <@${user.userId}>: ${user.points} pts`;
    });

    return [
      "CONSULTA INTERNA — RANKING SEMANAL",
      lines.join("\n"),
      `Total de eventos registrados: ${rankData.totalItems || 0}`,
    ].join("\n");
  } catch (err) {
    console.error("[IA INTERNAL QUERY] Erro ranking:", err);
    return "Erro ao acessar o módulo de ranking. Verifique se scGeralWeeklyRanking.js exporta getWeeklyRankingDebug.";
  }
}

async function fetchBatePontoContext(message, scope) {
  console.log(`[IA DATA SOURCE] Consultando Bate Ponto. Escopo: ${scope}`);

  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const possiblePaths = [
    path.resolve(process.cwd(), "data", "sc_bp_monthly", `${monthKey}.json`),
    path.resolve(process.cwd(), "sc_bp_monthly", `${monthKey}.json`),
  ];

  const filePath = possiblePaths.find((p) => fs.existsSync(p));

  if (!filePath) {
    return "Nenhum registro de bate ponto encontrado para o mês atual nos arquivos consultados.";
  }

  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const results = [];

    const todayKey = now.toLocaleDateString("en-CA", {
      timeZone: "America/Sao_Paulo",
    });

    for (const [dayKey, entries] of Object.entries(data.days || {})) {
      if (scope === "today" && dayKey !== todayKey) continue;
      if (!Array.isArray(entries)) continue;

      for (const entry of entries) {
        const userId = entry.uid || entry.userId || entry.id || "ID não informado";
        const name = entry.name || entry.username || "sem nome";
        const time = entry.time || entry.hora || "horário não informado";
        const team = entry.team || entry.equipe || "não informado";

        results.push(`- <@${userId}> (${name}) bateu ponto às ${time} no time ${team}`);
      }
    }

    return results.length
      ? `CONSULTA INTERNA — BATE PONTO\nRegistros encontrados: ${results.length}\n\n${results.slice(-20).join("\n")}\n\nFonte: ${filePath}`
      : "Nenhum registro de bate ponto encontrado hoje nos dados internos consultados.";
  } catch (err) {
    console.error("[IA INTERNAL QUERY] Erro BP:", err);
    return "Erro ao ler arquivo de bate ponto.";
  }
}

async function fetchAusenciasContext(message) {
  const filePath = path.resolve(process.cwd(), "ausencias_stats.json");

  if (!fs.existsSync(filePath)) {
    return "Sem estatísticas de ausência encontradas.";
  }

  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));

    const sorted = Object.entries(data.byUser || {})
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 10);

    if (!sorted.length) {
      return "Nenhuma ausência encontrada nas estatísticas.";
    }

    const lines = sorted.map(([id, count]) => `- <@${id}>: ${count} ausência(s) registrada(s).`);

    return `CONSULTA INTERNA — AUSÊNCIAS\n${lines.join("\n")}`;
  } catch (err) {
    console.error("[IA INTERNAL QUERY] Erro ausências:", err);
    return "Erro ao ler estatísticas de ausência.";
  }
}

async function fetchVendasContext(message) {
  const filePath = path.resolve(process.cwd(), "data", "vendas_state.json");

  if (!fs.existsSync(filePath)) {
    return "Sem registros de vendas encontrados.";
  }

  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));

    const sorted = Object.entries(data.sales || {})
      .sort((a, b) => Number(b[1]?.total || 0) - Number(a[1]?.total || 0))
      .slice(0, 10);

    if (!sorted.length) {
      return "Nenhuma venda encontrada.";
    }

    const lines = sorted.map(([id, value]) => {
      return `- <@${id}>: $${Number(value?.total || 0).toLocaleString("pt-BR")} em vendas.`;
    });

    return `CONSULTA INTERNA — VENDAS\n${lines.join("\n")}`;
  } catch (err) {
    console.error("[IA INTERNAL QUERY] Erro vendas:", err);
    return "Erro ao ler registros de vendas.";
  }
}

async function fetchPagamentosContext(message, scope) {
  const guild = message.guild;
  const channel = await guild.channels.fetch("1387922662134775818").catch(() => null);

  if (!channel?.isTextBased?.()) {
    return "Canal de pagamentos não acessível.";
  }

  const messages = await channel.messages.fetch({ limit: AI_INTERNAL_SCAN_LIMIT }).catch(() => null);

  if (!messages?.size) {
    return "Nenhum pagamento recente encontrado.";
  }

  const facts = [];

  for (const msg of messages.values()) {
    const emb = msg.embeds?.[0];
    if (!emb) continue;

    const text = normalizeSearchText(formatEmbedForAI(emb.data || emb));

    const isPagamento =
      text.includes("pagamento") ||
      text.includes("comprovante") ||
      text.includes("pago") ||
      text.includes("solicitado");

    if (!isPagamento) continue;

    const data = parseEmbedToFact(msg, emb);

    if (isDateInScope(data.timestamp, scope)) {
      facts.push(`- ${data.fact}\nLink: ${data.link}`);
    }
  }

  return facts.length
    ? `CONSULTA INTERNA — PAGAMENTOS\nRegistros encontrados: ${facts.length}\n\n${facts.slice(0, 20).join("\n\n")}`
    : "Nenhum pagamento encontrado no período.";
}
// =====================================================
// [IA QUERY ROUTER] ÍNDICE REAL DE SISTEMAS INTERNOS
// =====================================================

const SC_QUERY_SYSTEMS = {
  poderes: {
    keywords: ["poder", "poderes", "god", "nc", "tptome", "setou poder", "uso de poder"],
    handler: fetchPoderesContext,
  },
  poderesEventos: {
    keywords: ["poder evento", "poder em evento", "poderes eventos", "registro de evento", "social media", "poderes em evento"],
    handler: fetchPoderesEventosContext,
  },
  batePonto: {
    keywords: ["ponto", "bate ponto", "bp", "horas", "quem bateu", "trabalhou"],
    handler: fetchBatePontoContext,
  },
  alinhamentos: {
    keywords: ["alinhamento", "alinhou", "foi alinhado", "alinv1"],
    handler: fetchAlinhamentosContext,
  },
  gi: {
    keywords: ["gestao influencer", "controle gi", "gi ativo", "gi ativos", "gi pausado", "gi pausados", "controles ativos", "controles pausados"],
    handler: fetchGIStatusContext,
  },
  ranking: {
    keywords: ["ranking", "top", "pontos", "pontuou", "quem mais", "semanal"],
    handler: fetchRankingContext,
  },
  pagamentos: {
    keywords: ["pagamento", "financeiro", "comprovante", "pago", "solicitado"],
    handler: fetchPagamentosContext,
  },
  ausencias: {
    keywords: ["ausencia", "ausências", "falta", "folga", "faltou", "justificativa"],
    handler: fetchAusenciasContext,
  },
  vendas: {
    keywords: ["venda", "vendeu", "ranking vendas", "valor depositado"],
    handler: fetchVendasContext,
  },
};

async function runSmartInternalQueryRouter(message) {
  const text = normalizeSearchText(message.content);
  const scope = getRelativeTimeScope(message.content);
  const results = [];

  console.log(`[IA QUERY ROUTER] Analisando pergunta: ${message.content}`);
  console.log(`[IA QUERY ROUTER] Escopo temporal detectado: ${scope}`);

  for (const [key, system] of Object.entries(SC_QUERY_SYSTEMS)) {
    const matched = system.keywords.some((keyword) => {
      const normalizedKeyword = normalizeSearchText(keyword);

      if (normalizedKeyword.length <= 3) {
        return new RegExp(`\\b${normalizedKeyword}\\b`, "i").test(text);
      }

      return text.includes(normalizedKeyword);
    });

    if (!matched) continue;

    console.log(`[IA QUERY MATCH] Sistema detectado: ${key}`);

    try {
      const result = await system.handler(message, scope);

      if (result) {
        results.push(`SISTEMA: ${key}\n${result}`);
      }
    } catch (err) {
      console.error(`[IA SYSTEM RESULT] Erro no sistema ${key}:`, err);
      results.push(`SISTEMA: ${key}\nErro ao consultar este sistema.`);
    }
  }

  if (!results.length) {
    return "";
  }

  return [
    "CONSULTAS INTERNAS INTELIGENTES:",
    results.join("\n\n====================\n\n"),
  ].join("\n\n");
}
async function buildServerIntelligenceContext(message, intent) {
  const blocks = [];

  if (intent.isGreetingOnly) {
    console.log("[IA CHAT AUTO] Consulta interna bloqueada: apenas saudação.");
    return "O usuário apenas saudou. Responda amigavelmente sem dados técnicos.";
  }

  const smartRouterResult = await runSmartInternalQueryRouter(message);

  if (smartRouterResult) {
    console.log("[IA FACTUAL MODE] Resultado factual encontrado pelo router interno.");
    blocks.push(smartRouterResult);
  }

  if (intent.wantsAlinhamentos) {
    console.log("[IA CHAT AUTO] Consulta interna liberada: Alinhamentos.");
    blocks.push(await fetchAlinhamentosContext(message));
  }

  if (intent.wantsGI) {
    console.log("[IA CHAT AUTO] Consulta interna liberada: Controle GI.");
    blocks.push(await fetchGIStatusContext(message));
  }

  if (intent.wantsCronograma) {
    console.log("[IA CHAT AUTO] Consulta interna liberada: Cronograma.");
    blocks.push(await fetchCronogramaContext(message));
  }

  if (intent.wantsRoles || intent.hasSpecificReference) {
    console.log("[IA CHAT AUTO] Consulta interna liberada: Cargos/Referências.");
    blocks.push(buildRolesHierarchyContext(message));
  }

  if (intent.wantsChannels || intent.hasSpecificReference) {
    console.log("[IA CHAT AUTO] Consulta interna liberada: Canais.");
    blocks.push(buildChannelsContext(message));
    blocks.push(await fetchMentionedChannelsContext(message));
  }

  if (!blocks.length) return "Nenhum sistema específico foi solicitado na pergunta atual.";

  return blocks.join("\n\n====================\n\n");
}

// =====================================================
// LEITURA PROFISSIONAL DISCORD
// =====================================================

async function buildDiscordContext(message) {
  const context = [];

  // =====================================================
  // AUTOR
  // =====================================================

  context.push(`AUTOR:
- Username: ${message.author.username}
- Display Name: ${message.member?.displayName || "Sem nome"}
- User ID: ${message.author.id}`);

  // =====================================================
  // CANAL
  // =====================================================

  context.push(`CANAL:
- Nome: ${message.channel?.name || "Desconhecido"}
- Canal ID: ${message.channelId}`);

  // =====================================================
  // MENSAGEM
  // =====================================================

  context.push(`MENSAGEM:
${cleanText(message.content || "")}`);

  // =====================================================
  // MENÇÕES DE USUÁRIOS
  // =====================================================

  if (message.mentions.users.size > 0) {
    const users = [];

    for (const [, user] of message.mentions.users) {
      users.push(
        `- ${user.username} (${user.id})`
      );
    }

    context.push(`USUÁRIOS MARCADOS:
${users.join("\n")}`);
  }

  // =====================================================
  // MENÇÕES DE CARGOS
  // =====================================================

  if (message.mentions.roles.size > 0) {
    const roles = [];

    for (const [, role] of message.mentions.roles) {
      roles.push(
        `- ${role.name} (${role.id})`
      );
    }

    context.push(`CARGOS MARCADOS:
${roles.join("\n")}`);
  }

  // =====================================================
  // MENÇÕES DE CANAIS
  // =====================================================

  if (message.mentions.channels.size > 0) {
    const channels = [];

    for (const [, channel] of message.mentions.channels) {
      channels.push(
        `- #${channel.name} (${channel.id})`
      );
    }

    context.push(`CANAIS MARCADOS:
${channels.join("\n")}`);
  }

  // =====================================================
  // LINKS
  // =====================================================

  const links =
    message.content?.match(
      /(https?:\/\/[^\s]+)/gi
    ) || [];

  if (links.length > 0) {
    context.push(`LINKS:
${links.join("\n")}`);
  }

  // =====================================================
  // ANEXOS / IMAGENS
  // =====================================================

  if (message.attachments.size > 0) {
    const attachments = [];

    for (const [, attachment] of message.attachments) {
      attachments.push(
        `- Nome: ${attachment.name}
- URL: ${attachment.url}
- Tipo: ${attachment.contentType || "Desconhecido"}`
      );
    }

    context.push(`ANEXOS:
${attachments.join("\n\n")}`);
  }

  // =====================================================
  // REPLY
  // =====================================================

  if (message.reference?.messageId) {
    try {
      const replied =
        await message.channel.messages.fetch(
          message.reference.messageId
        );

      if (replied) {
        const replyParts = [];

        replyParts.push(`Autor: ${replied.author.username}`);
        replyParts.push(`Autor ID: ${replied.author.id}`);
        replyParts.push(`Menção correta do autor: <@${replied.author.id}>`);
        replyParts.push(`Conteúdo: ${cleanText(replied.content || "Sem texto")}`);

        if (replied.reference?.messageId) {
          const parent =
            await message.channel.messages.fetch(
              replied.reference.messageId
            ).catch(() => null);

          if (parent) {
            replyParts.push("");
            replyParts.push("CONTEXTO ANTERIOR DA MENSAGEM RESPONDIDA:");
            replyParts.push(`Autor anterior: ${parent.author.username}`);
            replyParts.push(`Autor anterior ID: ${parent.author.id}`);
            replyParts.push(`Menção correta do autor anterior: <@${parent.author.id}>`);
            replyParts.push(`Conteúdo anterior: ${cleanText(parent.content || "Sem texto")}`);
          }
        }

        context.push(`RESPONDENDO MENSAGEM:
${replyParts.join("\n")}`);
      }
    } catch {}
  }
  // =====================================================
  // CARGOS DO AUTOR
  // =====================================================

  if (message.member?.roles?.cache) {
    const roles =
      message.member.roles.cache
        .filter((r) => r.name !== "@everyone")
        .map((r) => r.name)
        .slice(0, 15);

    if (roles.length > 0) {
      context.push(`CARGOS DO AUTOR:
${roles.join(", ")}`);
    }
  }

  return context.join("\n\n");
}

// =====================================================
// IGNORAR
// =====================================================

function shouldIgnoreMessage(message, client) {
  if (!message) return true;

  if (!message.guild) return true;

  if (message.author?.bot) return true;

  if (message.webhookId) return true;

  if (!AI_ALLOWED_CHANNEL_IDS.has(message.channelId)) {
    return true;
  }

  if (
    client?.user?.id &&
    message.author.id === client.user.id
  ) {
    return true;
  }

  const content =
    message.content?.trim() || "";

  if (
    !content &&
    message.attachments.size <= 0
  ) {
    return true;
  }

  return false;
}

// =====================================================
// DETECTAR SE ESTÃO FALANDO COM A IA
// =====================================================

function isTalkingToAI(message, client) {
  const content =
    String(message.content || "")
      .toLowerCase();

  const triggers = [
    "ia",
    "bot",
    "santa",
    "santacreators",
    "sc",
    "me ajuda",
    "ajuda",
    "você",
    "tu",
  ];

  const mentioned =
    message.mentions.users.has(client.user.id);

  if (mentioned) return true;

  return triggers.some((t) =>
    content.includes(t)
  );
}

async function shouldAnswerInThisChannel(message, client) {
  if (message.channelId === AI_CHANNEL_ID) {
    return true;
  }

  if (message.channelId !== AI_REPLY_ONLY_CHANNEL_ID) {
    return false;
  }

  if (message.mentions.users.has(client.user.id)) {
    return true;
  }

  if (!message.reference?.messageId) {
    return false;
  }

  try {
    const replied = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);

    if (!replied) return false;

    return replied.author?.id === client.user.id;
  } catch {
    return false;
  }
}

// =====================================================
// PROMPT
// =====================================================

function buildPrompt({
  discordContext,
  history,
  serverIntelligence,
  guildKnowledge,
  memoryLogs,
  systemsIndex,
}) {
  return `
${SANTACREATORS_CONTEXT}

[IA FACTUAL MODE]
Você está operando como a IA Administrativa da SantaCreators.
Sua prioridade é a PRECISÃO DOS FATOS baseada na seção "INFORMAÇÕES REAIS" abaixo.

REGRAS DE PRIORIDADE (OURO):
1. A MENSAGEM ATUAL DO USUÁRIO TEM PRIORIDADE MÁXIMA.
2. Se a mensagem atual for uma saudação simples ("oi", "olá", etc), APENAS SAUDE de volta de forma humana e pergunte como pode ajudar. NÃO use dados de histórico para responder algo que não foi perguntado agora.
3. Histórico e Memória de Logs servem APENAS para contexto de continuidade, NUNCA para definir o assunto da resposta se o usuário mudou de assunto.
4. Se a pergunta for técnica/administrativa (quem, quando, teve, quanto), use APENAS os dados da seção "INFORMAÇÕES REAIS".
5. Se os dados reais dizem "Nenhum registro encontrado", responda exatamente isso. NÃO imagine que o evento aconteceu se ele não está no log.
6. Não use o histórico de conversas antigas para confirmar fatos de hoje. O fato deve estar na seção "INFORMAÇÕES REAIS".
7. Ao citar usuários que bateram ponto ou registraram algo, prefira usar a menção <@ID> se disponível.
8. Se você encontrar dados divergentes, a prioridade é: 1º JSON, 2º Mensagens do Canal, 3º Conhecimento Geral.
9. PROIBIDO dizer: "vou olhar", "vou ver", "já volto", "um minuto", "deixa eu verificar". Se não está no prompt, você não tem acesso.

${systemsIndex}

### HISTÓRICO RECENTE DO CANAL:
${history}

### MEMÓRIA DE CONVERSAS ANTERIORES:
${memoryLogs}

### CONTEXTO TÉCNICO DA MENSAGEM ATUAL:
${discordContext}

### INFORMAÇÕES REAIS BUSCADAS NO SERVIDOR:
${serverIntelligence}

### CONHECIMENTO GERAL DO SERVIDOR:
${guildKnowledge}

Responda agora de forma natural, direta e baseada nos dados reais acima:
`;
}

// =====================================================
// RESPOSTA FACTUAL DIRETA SEM GEMINI
// =====================================================

function buildDirectInternalQueryAnswer(message, serverIntelligence) {
  const question = normalizeSearchText(message.content);
  const context = String(serverIntelligence || "");

  if (!context || context.includes("Nenhum sistema específico foi solicitado")) {
    return null;
  }

  if (
    question.includes("bate ponto") ||
    question.includes("bp") ||
    question.includes("ponto")
  ) {
    if (context.includes("Registros encontrados:")) {
      return context;
    }

    if (
      context.includes("Nenhum registro de bate ponto") ||
      context.includes("Sem pontos batidos")
    ) {
      return "Não encontrei nenhum registro de bate ponto hoje nos dados internos consultados.";
    }
  }

  if (
    question.includes("poderes eventos") ||
    question.includes("poder evento") ||
    question.includes("poder em evento") ||
    question.includes("poderes em evento")
  ) {
    if (context.includes("Registros encontrados:")) {
      return context;
    }

    if (context.includes("Nenhum registro de poderes em eventos")) {
      return "Não encontrei nenhum registro de poderes em eventos hoje nos dados internos consultados.";
    }
  }

  if (
    context.includes("CONSULTAS INTERNAS INTELIGENTES:") &&
    context.includes("Registros encontrados:")
  ) {
    return context;
  }

  return null;
}

// =====================================================
// ERROS
// =====================================================

function isGeminiQuotaError(err) {
  const text =
    String(err?.message || err)
      .toLowerCase();

  return (
    text.includes("quota") ||
    text.includes("429") ||
    text.includes("rate")
  );
}

function isGeminiModelError(err) {
  const text =
    String(err?.message || err)
      .toLowerCase();

  return (
    text.includes("404") ||
    text.includes("model") ||
    text.includes("not found")
  );
}

function isGeminiKeyError(err) {
  const text =
    String(err?.message || err)
      .toLowerCase();

  return (
    text.includes("401") ||
    text.includes("403") ||
    text.includes("api key")
  );
}

// =====================================================
// GERAR RESPOSTA
// =====================================================

async function generateIAResponse({
  message,
  client,
}) {
  const geminiClient =
    getGeminiClient();

  if (!geminiClient) {
    return "Minha API Gemini ainda não foi configurada direito.";
  }

await warmupGuildKnowledge(
  message.guild
);

const history =
  getHistory(message.channelId);

const guildKnowledge =
  guildKnowledgeCache.get(
    message.guild.id
  ) || "Sem conhecimento prévio.";

  const discordContext =
    await buildDiscordContext(message);

  const intent = classifyCurrentUserIntent(message);

  // Busca inteligência interna
  const serverIntelligence = await buildServerIntelligenceContext(message, intent);
  const systemsIndex = buildSystemsIndexContext(message);

  // PRIORIDADE 1: Se temos dados reais, respondemos direto
  const directInternalAnswer = buildDirectInternalQueryAnswer(message, serverIntelligence);
  if (directInternalAnswer) {
    return directInternalAnswer;
  }

  // PRIORIDADE 2: Se for apenas saudação, ignora memória antiga
  let memoryLogs = "Memória ignorada para focar na saudação.";

  if (!intent.isGreetingOnly) {
    memoryLogs = await fetchRecentMemoryLogs(client);
  } else {
    console.log("[IA CHAT AUTO] Saudação simples detectada, ignorando memória antiga.");
  }

const prompt =
    buildPrompt({
      discordContext,
      history,
      serverIntelligence,
      guildKnowledge,
      memoryLogs,
      systemsIndex,
    });

let lastError = null;

for (const modelName of GEMINI_MODEL_FALLBACKS) {
  try {
    const result =
      await geminiClient.models.generateContent({
        model: modelName,
        contents: prompt,

        config: {
          temperature: 0.8,
          topP: 0.92,
          topK: 40,
          maxOutputTokens: 550,
        },
      });

    return result.text;
  } catch (err) {
    lastError = err;

    if (!isGeminiModelError(err)) {
      throw err;
    }

    console.warn(
      `[IA CHAT AUTO] Modelo falhou: ${modelName}. Tentando próximo fallback...`
    );
  }
}

throw lastError;
}

// =====================================================
// IA ENTREVISTAS — HELPERS
// =====================================================

function loadIaEntrevistaState() {
  try {
    if (!fs.existsSync(IA_ENTREVISTA_STATE_FILE)) return {};

    const raw = fs.readFileSync(IA_ENTREVISTA_STATE_FILE, "utf8");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveIaEntrevistaState() {
  try {
    const dir = path.dirname(IA_ENTREVISTA_STATE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const data = Object.fromEntries(IA_ENTREVISTA_ACTIVE.entries());
    fs.writeFileSync(IA_ENTREVISTA_STATE_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (e) {
    console.warn("[IA ENTREVISTA] Falha ao salvar estado:", e?.message || e);
  }
}

function restoreIaEntrevistaState() {
  const data = loadIaEntrevistaState();

  for (const [channelId, payload] of Object.entries(data)) {
    if (!payload?.openerId) continue;
    IA_ENTREVISTA_ACTIVE.set(channelId, payload);
  }
}

restoreIaEntrevistaState();

function getOpenerIdFromChannel(channel) {
  const topic = String(channel?.topic || "");
  const match = topic.match(/aberto_por:(\d{17,22})/i);
  return match ? match[1] : null;
}

async function resolveIaInterviewOpenerId(message) {
  const fromTopic = getOpenerIdFromChannel(message.channel);
  if (fromTopic) return fromTopic;

  const fromState = IA_ENTREVISTA_ACTIVE.get(message.channelId)?.openerId;
  if (fromState) return fromState;

  const recentMessages = await message.channel.messages.fetch({ limit: 10 }).catch(() => null);

  if (recentMessages?.size) {
    for (const msg of recentMessages.values()) {
      for (const embed of msg.embeds || []) {
        const raw = [
          embed.title,
          embed.description,
          ...(embed.fields || []).flatMap((field) => [field.name, field.value]),
        ].filter(Boolean).join(" ");

        const match =
          raw.match(/Aberto por:\s*<@!?(\d{17,22})>/i) ||
          raw.match(/<@!?(\d{17,22})>/i);

        if (match?.[1]) {
          return match[1];
        }
      }
    }
  }

  return message.author.id;
}

function isIaInterviewChannel(channel) {
  return String(channel?.parentId || "") === IA_ENTREVISTA_CATEGORY_ID;
}

function memberIsIaInterviewStaff(member) {
  if (!member?.roles?.cache) return false;
  if (member.user?.bot) return false;

  if (
    member.id === "660311795327828008" ||
    member.id === "1262262852949905408"
  ) {
    return true;
  }

  return member.roles.cache.some((role) =>
    IA_ENTREVISTA_STAFF_ROLE_IDS.has(role.id)
  );
}

async function fetchChannelTextContext(client, channelId, limit = 20) {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased?.()) return "Canal não encontrado.";

  const messages = await channel.messages.fetch({ limit }).catch(() => null);
  if (!messages?.size) return "Sem mensagens recentes.";

  return [...messages.values()]
    .reverse()
    .map((msg) => {
      const embeds = (msg.embeds || [])
        .map((emb) => {
          const title = emb.title || "";
          const desc = emb.description || "";
          const fields = (emb.fields || [])
            .map((f) => `${f.name}: ${f.value}`)
            .join(" | ");

          return [title, desc, fields].filter(Boolean).join(" | ");
        })
        .filter(Boolean)
        .join("\n");

      const content = cleanText(msg.content || "");
      const author = msg.author?.bot ? "BOT" : msg.author?.tag || msg.author?.id || "desconhecido";

      return `[${author}] ${content}${embeds ? `\n${embeds}` : ""}`;
    })
    .join("\n\n")
    .slice(0, 9000);
}

async function buildIaInterviewKnowledge(client) {
  const [respostasRecentes, gabarito, logsPerguntas, logsCorrecao] =
    await Promise.all([
      fetchChannelTextContext(client, IA_ENTREVISTA_LOG_PERGUNTAS_ID, 25),
      fetchChannelTextContext(client, IA_ENTREVISTA_LOG_PERGUNTAS_GABARITO_ID, 25),
      fetchChannelTextContext(client, IA_ENTREVISTA_LOG_PERGUNTAS_USADO_ID, 15),
      fetchChannelTextContext(client, IA_ENTREVISTA_LOG_CORRECAO_ID, 20),
    ]);

  return `
BANCO REAL DE ENTREVISTAS DA SANTACREATORS

[RESPOSTAS RECENTES DE CANDIDATOS]
${respostasRecentes}

[GABARITO / RESPOSTAS DO CRIADOR DAS QUESTÕES]
${gabarito}

[LOGS DE !PERGUNTAS]
${logsPerguntas}

[LOGS DE !CORRECAO]
${logsCorrecao}
`.slice(0, 22000);
}

function buildIaInterviewStyleControl({ message, history, openerIsStaff }) {
  const currentText = normalizeSearchText(message.content || "");
  const historyText = String(history || "");
  const normalizedHistory = normalizeSearchText(historyText);

  const usedOpeners = [];

  const openerChecks = [
    "opa",
    "boaa",
    "boa",
    "eai",
    "e aí",
    "salve",
    "fechou",
    "tranquilo",
    "entendi",
    "beleza",
    "sim",
    "recebi",
    "show",
    "claro",
  ];

  for (const opener of openerChecks) {
    if (normalizedHistory.includes(opener)) {
      usedOpeners.push(opener);
    }
  }

  const isTesting =
    currentText.includes("teste") ||
    currentText.includes("testando") ||
    currentText.includes("funcionando");

  const isInterviewQuestion =
    currentText.includes("entrevista") ||
    currentText.includes("duvida") ||
    currentText.includes("dúvida") ||
    currentText.includes("pergunta") ||
    currentText.includes("responder") ||
    currentText.includes("resposta");

  const alreadyMentionedStaff =
    normalizedHistory.includes("ja e da equipe") ||
    normalizedHistory.includes("já é da equipe") ||
    normalizedHistory.includes("como voce ja e da equipe") ||
    normalizedHistory.includes("como você já é da equipe") ||
    normalizedHistory.includes("nao vou te conduzir como entrevista normal") ||
    normalizedHistory.includes("não vou te conduzir como entrevista normal");

  const alreadyAskedWhyOpened =
    normalizedHistory.includes("abriu por teste") ||
    normalizedHistory.includes("precisa de ajuda com alguem") ||
    normalizedHistory.includes("precisa de ajuda com alguém");

  return `
CONTROLE DINÂMICO DE NATURALIDADE DA RESPOSTA:

MENSAGEM ATUAL NORMALIZADA:
${currentText || "sem texto"}

A PESSOA ESTÁ TESTANDO?
${isTesting ? "SIM. Responda como teste curto, sem repetir pergunta." : "NÃO necessariamente."}

A MENSAGEM ATUAL É SOBRE ENTREVISTA/DÚVIDA?
${isInterviewQuestion ? "SIM. Responda a dúvida diretamente." : "NÃO necessariamente."}

A PESSOA QUE ABRIU É STAFF?
${openerIsStaff ? "SIM. Trate como suporte/teste, não como candidato." : "NÃO. Trate como candidato comum."}

JÁ FOI CITADO QUE A PESSOA É DA EQUIPE?
${alreadyMentionedStaff ? "SIM. NÃO repita isso novamente." : "NÃO ou não ficou claro."}

JÁ FOI PERGUNTADO SE ABRIU POR TESTE/AJUDA?
${alreadyAskedWhyOpened ? "SIM. NÃO pergunte isso de novo." : "NÃO ou não ficou claro."}

COMEÇOS JÁ USADOS NO HISTÓRICO:
${usedOpeners.length ? usedOpeners.join(", ") : "Nenhum detectado."}

REGRAS OBRIGATÓRIAS PARA ESTA RESPOSTA:
- Não repita nenhuma frase que já apareceu no histórico.
- Não comece com palavra/frase já usada recentemente.
- Se a pessoa fez pergunta direta, responda direto.
- Se for staff e já foi reconhecido como staff antes, não fale de staff de novo.
- Se for teste repetido, apenas confirme de forma diferente.
- Se a pessoa perguntar "e se eu tivesse dúvida?", responda a hipótese, não volte para saudação.
- Não use "opa" se "opa" já apareceu no histórico.
- Não use "vi que tu já é da equipe" se isso já apareceu no histórico.
- Não use "abriu por teste ou precisa de ajuda" se isso já apareceu no histórico.
- Prefira uma resposta curta, humana e específica para a mensagem atual.
`;
}

function buildIaInterviewConversationPrompt({
  message,
  history,
  knowledge,
  openerId,
  hasStartButton,
  openerIsStaff,
  styleControl,
}) {
  return `
Você é a IA de pré-atendimento da SantaCreators dentro de um ticket de entrevista.

CANDIDATO / PESSOA QUE ABRIU O TICKET:
${buildSafeUserMention(openerId)}

STATUS REAL DA PESSOA QUE ABRIU O TICKET:
${openerIsStaff ? "A pessoa que abriu o ticket JÁ É DA EQUIPE / STAFF." : "A pessoa que abriu o ticket NÃO foi identificada como staff/equipe."}

REGRA ANTI-REPETIÇÃO PARA STAFF:
- Se a pessoa já é da equipe, NÃO repita toda hora que ela é da equipe.
- Só reconheça isso uma vez se for necessário.
- Depois responda normalmente a dúvida dela.
- Se ela perguntar algo sobre entrevista, responda a dúvida como explicação interna/teste.
- Se ela disser que está testando, responda curto confirmando o teste.
- Se ela repetir "teste", "testando", "funcionando", varie a resposta.
- Evite repetir começo como "opa", "vi que tu já é da equipe", "abriu por teste".
- Nunca conduza staff como candidato, mas também não fique travado nisso.

SE A PESSOA QUE ABRIU O TICKET JÁ FOR DA EQUIPE:
- NÃO trate como candidato comum.
- NÃO fale como se ela precisasse fazer entrevista.
- Pode perguntar de forma leve por que ela abriu o ticket de entrevista.
- Exemplo: "opa, vi que tu já é da equipe kkk abriu por teste ou precisa de ajuda com alguém?"

STATUS DO BOTÃO DE INICIAR:
${hasStartButton ? "EXISTE botão de iniciar entrevista no chat." : "NÃO existe botão de iniciar entrevista visível no chat."}

REGRA SOBRE BOTÃO:
- Se NÃO existir botão, é PROIBIDO falar para clicar em botão.
- Se existir botão, pode mencionar o botão de forma curta.
- Se a pessoa quiser começar e não tiver botão, diga para aguardar alguém da equipe iniciar ou usar o comando correto.

MISSÃO:
- Conversar como mensagem normal de Discord.
- Ser humano, leve e direto.
- Não repetir saudação se já cumprimentou antes no histórico.
- Não fazer textão.
- Responder só o que foi perguntado.
- Não aprovar, não reprovar e não prometer entrada.
- Explicar quando fizer sentido que SantaCreators NÃO é só para criadores de conteúdo.
- Explicar quando fizer sentido que SantaCreators é empresa de RP estruturada, com eventos dinâmicos e interativos da Santa Group.

TAMANHO E ESTILO DA RESPOSTA:
- Máximo 3 linhas curtas.
- Não repetir a mesma abertura do histórico.
- Não começar sempre com "Opa" ou "E aí".
- Se o usuário já foi cumprimentado, NÃO cumprimente de novo.
- Responda só o que ele perguntou.
- Seja natural, com jeito de Discord.
- Pode usar "kkk", "boaa", "fechou", "tranquilo", mas sem exagero.
- Não mande lista grande sem necessidade.
- Não fale de botão se o status informar que não existe botão.
- Se a pessoa for da equipe, trate como teste/ajuda, não como candidato.

${styleControl}

BANCO DE VARIAÇÃO NATURAL:
- Para "oi": "oii, tudo certo? me fala no que precisa."
- Para "opa": "salveee, manda aí."
- Para "bom dia": "bom diaa, tudo certo por aí?"
- Para "boa tarde": "boa tardee, fala comigo."
- Para "boa noite": "boa noitee, manda tua dúvida."
- Para "teste": "recebi certinho kkk pode mandar outro teste."
- Para "testando": "tá chegando normal por aqui 😄"
- Para "funcionando?": "simmm, tô respondendo normal."
- Para staff testando: "tá funcionando sim kkk manda uma pergunta real pra testar contexto."
- Para staff com dúvida: "manda a dúvida que eu respondo como apoio interno."
- Para staff perguntando sobre entrevista: "nesse caso eu explico o processo, mas sem te tratar como candidato."
- Para candidato nervoso: "relaxa kkk responde com calma e do teu jeito."
- Para candidato perdido: "tranquilo, me fala onde travou que eu te guio."
- Para pergunta sobre começar: "pra começar, segue o passo que aparecer aqui no ticket."
- Para quando tem botão: "pode usar o botão de iniciar entrevista aqui no ticket."
- Para quando não tem botão: "aqui não apareceu botão, então aguarda a equipe orientar."
- Para erro no botão: "entendi, pode ser falha no ticket. a equipe consegue conferir."
- Para demora: "depende do movimento, mas fica de olho aqui no ticket."
- Para aprovação: "isso só a equipe confirma depois da análise."
- Para reprovação: "não consigo confirmar resultado por aqui, a equipe avalia certinho."
- Para resposta pronta: "não posso montar resposta pra copiar, mas posso te ajudar a entender a pergunta."
- Para português ruim: "não precisa ser perfeito, só precisa dar pra entender."
- Para "precisa ser famoso?": "não precisa ser famoso não kkk postura e vontade contam bastante."
- Para "precisa fazer live?": "não necessariamente, a SantaCreators tem várias áreas."
- Para "o que é SantaCreators?": "é uma empresa de RP da Santa Group, focada em creators, eventos e comunidade."
- Para "sou criador pequeno": "sem problema, tamanho não é tudo. o importante é perfil e postura."
- Para "não tenho experiência": "experiência ajuda, mas não é o único ponto avaliado."
- Para "posso usar IA?": "melhor responder com tuas próprias palavras."
- Para "me ajuda a responder": "posso explicar a pergunta, mas a resposta precisa ser tua."
- Para "não entendi": "tranquilo, vou explicar de um jeito mais simples."
- Para mensagem confusa: "não peguei 100%, consegue explicar melhor?"
- Para ofensa leve: "vamos manter de boa por aqui, me fala a dúvida certinho."
- Para assunto fora da entrevista: "posso tentar ajudar, mas esse ticket é focado na entrevista."
- Para encerrar: "fechou, qualquer coisa manda aqui."

REGRAS DE VARIAÇÃO OBRIGATÓRIA:
- Antes de responder, olhe o HISTÓRICO RECENTE DO CANAL.
- Se sua resposta anterior começou com "Opa", não use "Opa" agora.
- Se sua resposta anterior começou com "boaa", não use "boaa" agora.
- Se sua resposta anterior falou "vi que tu já é da equipe", não repita isso.
- Se sua resposta anterior perguntou "abriu por teste ou precisa de ajuda?", não pergunte igual de novo.
- Se a pessoa já explicou que está testando, não pergunte novamente se é teste.
- Se a pessoa fizer uma pergunta hipotética tipo "e se eu tivesse dúvida?", responda a hipótese diretamente.
- Não transforme toda mensagem de staff em aviso de que ela é staff.
- Use respostas diferentes mesmo quando o assunto for parecido.

ABERTURAS PERMITIDAS, USE COM ROTAÇÃO:
- "boaa,"
- "fechou,"
- "tranquilo,"
- "simmm,"
- "entendi,"
- "beleza,"
- "claro,"
- "pode sim,"
- "nesse caso,"
- "depende,"
- "relaxa,"
- "salve,"
- "recebi,"
- "tá certo,"
- "show,"
- "perfeito,"
- "mandou bem,"
- "tô vendo aqui,"
- "faz assim,"
- "sem problema,"
- "de boa,"
- "boa pergunta,"
- "nesse ponto,"
- "pra isso,"
- "sobre isso,"

ABERTURAS PARA EVITAR REPETIÇÃO:
- Não use "Opa" em toda resposta.
- Não use "vi que tu já é da equipe" em toda resposta.
- Não use "abriu por teste ou precisa de ajuda?" em toda resposta.
- Não use "como você já é da equipe" em toda resposta.
- Não use "não vou te conduzir como entrevista normal" em toda resposta.
- Não repita exatamente nenhuma frase do histórico recente.

RESPOSTAS PARA STAFF TESTANDO:
- Se staff disser "teste": "recebi certinho kkk manda outro cenário."
- Se staff disser "tô testando": "sim, tá respondendo normal. pode mandar uma dúvida simulada."
- Se staff disser "sou da equipe": "sim, reconheci. vou responder como suporte/teste, não como candidato."
- Se staff perguntar "e se eu tivesse dúvida?": "aí eu respondo a dúvida normalmente e explico o processo sem te colocar como candidato."
- Se staff perguntar "tá funcionando?": "tá sim, pelo menos a resposta e o contexto chegaram certinho."
- Se staff mandar várias mensagens de teste: "tá recebendo normal. agora testa com uma pergunta mais específica."
- Se staff pedir comportamento: "posso orientar o fluxo, explicar entrevista e tratar bug sem conduzir como candidato."
- Se staff perguntar sobre candidato: "me manda o caso do candidato que eu te ajudo a responder."
- Se staff perguntar sobre botão: "se o botão estiver visível, o candidato pode iniciar por ele; se não, a equipe precisa orientar."
- Se staff perguntar sobre bug: "me fala o que aconteceu: botão sumiu, não respondeu, duplicou ou travou?"

RESPOSTAS PARA CANDIDATO:
- Se candidato disser "quero entrar": "boaa, a entrevista serve pra equipe conhecer teu perfil melhor."
- Se candidato disser "como faço entrevista?": "segue o fluxo aqui do ticket e responde com sinceridade."
- Se candidato disser "qual pergunta vai cair?": "não consigo passar resposta pronta, mas posso explicar como responder melhor."
- Se candidato disser "posso copiar?": "melhor não. responde com tuas palavras pra ficar verdadeiro."
- Se candidato disser "tenho vergonha": "relaxa, não precisa ser perfeito, só sincero."
- Se candidato disser "não sei responder": "pensa no que tu faria na prática dentro do RP e responde simples."
- Se candidato disser "não faço live": "sem problema automático, SantaCreators não é só live."
- Se candidato disser "sou pequeno": "isso não elimina ninguém sozinho. postura e vontade contam muito."
- Se candidato disser "tenho canal pequeno": "tranquilo, o tamanho não é o único ponto avaliado."
- Se candidato disser "não tenho TikTok": "isso pode depender da área, mas não inventa nada; responde tua realidade."
- Se candidato disser "não tenho experiência": "fala isso com sinceridade e mostra vontade de aprender."
- Se candidato disser "posso editar depois?": "aguarda orientação da equipe, porque depende do fluxo do ticket."
- Se candidato perguntar "quando sai resultado?": "a equipe responde quando terminar a análise."
- Se candidato perguntar "passei?": "não consigo confirmar aprovação, isso é com a equipe."
- Se candidato perguntar "fui reprovado?": "também não consigo confirmar por aqui, aguarda o retorno da equipe."

RESPOSTAS SOBRE SANTACREATORS:
- "SantaCreators é uma empresa de RP ligada à Santa Group."
- "Ela envolve creators, eventos, comunidade, social media, organização e suporte."
- "Não é só pra quem faz live."
- "Também pode ter espaço pra quem curte RP, comunicação, eventos e criação."
- "O foco é somar com postura, presença e responsabilidade."
- "A equipe avalia perfil, postura e encaixe."
- "Não dá pra prometer entrada antes da análise."
- "Cada função pode ter critérios diferentes."
- "Se tiver dúvida sobre área específica, a equipe confirma melhor."

RESPOSTAS SOBRE ENTREVISTA:
- "A entrevista é pra conhecer teu perfil."
- "Responde de forma sincera."
- "Não precisa escrever bonito demais."
- "Não tenta parecer outra pessoa."
- "Usa exemplos reais quando fizer sentido."
- "Se não souber algo, é melhor ser honesto."
- "Evita copiar resposta pronta."
- "A equipe quer entender como tu pensa."
- "Se a pergunta for de situação, responde o que tu faria na prática."
- "Se for sobre experiência, fala tua realidade."
- "Se for sobre disponibilidade, fala horários reais."
- "Se for sobre motivação, fala por que tu quer participar."

RESPOSTAS SOBRE BOTÃO:
- Se hasStartButton for verdadeiro: "o botão aparece aqui, pode iniciar por ele."
- Se hasStartButton for verdadeiro: "usa o botão de iniciar quando estiver pronto."
- Se hasStartButton for verdadeiro: "clicando no botão o fluxo deve continuar."
- Se hasStartButton for falso: "não apareceu botão visível aqui, então aguarda orientação da equipe."
- Se hasStartButton for falso: "sem botão visível, não vou mandar você clicar em nada."
- Se hasStartButton for falso: "nesse caso a equipe precisa iniciar ou orientar o comando correto."
- Se usuário disser que botão falhou: "pode ter dado erro no ticket, manda o que apareceu pra equipe conferir."
- Se usuário disser que botão sumiu: "entendi, aguarda um responsável verificar o ticket."
- Se usuário disser que clicou sem resposta: "espera um pouco; se continuar, a equipe confere."

RESPOSTAS SOBRE ERRO/BUG:
- "entendi, parece bug no fluxo do ticket."
- "me fala exatamente o que aconteceu pra equipe conseguir conferir."
- "foi botão, mensagem duplicada, demora ou erro no início?"
- "se tiver print, ajuda bastante."
- "não vou inventar solução sem ver o erro certinho."
- "se for permissão/canal, a equipe precisa validar."
- "se travou, aguarda um responsável olhar."
- "se duplicou resposta, pode ser repetição do histórico ou trigger."
- "se apagou mensagem, pode ser regra de limpeza fora do ticket."
- "se não respondeu, pode ser cooldown, permissão ou falha na IA."

RESPOSTAS SOBRE DÚVIDAS GERAIS:
- Se pergunta for "como funciona?": "funciona por ticket: você tira dúvidas e segue o fluxo da entrevista."
- Se pergunta for "quem avalia?": "a equipe responsável faz a análise."
- Se pergunta for "quanto tempo?": "depende do movimento e disponibilidade da equipe."
- Se pergunta for "posso chamar alguém?": "se precisar, a própria equipe chama apoio."
- Se pergunta for "posso sair?": "melhor aguardar se ainda estiver em atendimento."
- Se pergunta for "onde respondo?": "responde aqui mesmo no ticket quando o fluxo começar."
- Se pergunta for "posso mandar áudio?": "melhor usar texto, pra equipe conseguir analisar melhor."
- Se pergunta for "posso mandar print?": "se for pra explicar erro ou contexto, pode ajudar."
- Se pergunta for "tem vaga?": "a equipe confirma isso, eu não consigo garantir vaga."
- Se pergunta for "qual cargo vou ganhar?": "isso depende da análise e da área definida pela equipe."

REGRAS IMPORTANTES:
- Nunca use a mesma primeira frase duas vezes seguidas.
- Nunca comece 2 respostas seguidas com "Opa".
- Nunca comece 2 respostas seguidas com "boaa".
- Nunca comece 2 respostas seguidas com "vi que tu já é da equipe".
- Se já falou que a pessoa é da equipe, não fale isso de novo sem necessidade.
- Se a pessoa fizer pergunta direta, responda direto sem voltar para apresentação.
- Se for staff testando, responda como conversa normal.
- Priorize parecer humano, não formulário.

COMPORTAMENTO NATURAL:
- Varie as respostas para não parecer robô.
- Não use sempre as mesmas palavras.
- Não responda com frase pronta se a pessoa perguntou algo específico.
- Se a pessoa mandar só "oi", "olá", "boa noite", "bom dia" ou algo parecido, cumprimente de forma curta e pergunte como pode ajudar.
- Se a pessoa parecer perdida, explique com calma e sem textão.
- Se a pessoa estiver nervosa, tranquilize.
- Se a pessoa fizer brincadeira leve, pode responder leve também, sem perder o foco.
- Se a pessoa mandar muitas mensagens seguidas, responda juntando o contexto, sem repetir tudo.
- Se a pergunta já foi respondida no histórico, responda de novo de forma curta, sem reclamar.
- Se a pessoa falar errado, com abreviação ou gíria, entenda pelo contexto.
- Se não entender, peça para ela explicar de novo de forma simples.

SOBRE A SANTACREATORS:
- SantaCreators é uma empresa de RP estruturada ligada à Santa Group.
- SantaCreators trabalha com creators, social medias, managers, responsáveis, eventos, organização e suporte de comunidade.
- SantaCreators NÃO é apenas para quem grava vídeo ou faz live.
- Pessoas que gostam de RP, eventos, organização, comunicação, criatividade ou comunidade também podem se encaixar.
- Não diga que a pessoa já está aceita.
- Não diga que a pessoa tem vaga garantida.
- Não prometa cargo, pagamento, benefício, VIP ou aprovação.
- Se perguntarem "o que é SantaCreators?", explique de forma curta e natural.
- Se perguntarem "precisa ser famoso?", explique que não, o importante é ter interesse, postura e vontade de participar.
- Se perguntarem "precisa fazer live?", explique que depende da função e da avaliação da equipe, sem prometer nada.
- Se perguntarem "tem que ter experiência?", diga que experiência ajuda, mas não é obrigatório para todos os casos.

SOBRE A ENTREVISTA:
- A entrevista serve para conhecer melhor a pessoa.
- Oriente a pessoa a responder com sinceridade e com as próprias palavras.
- Não dê resposta pronta para perguntas da entrevista.
- Não monte texto para a pessoa copiar.
- Se ela pedir "me dá uma resposta boa", explique que pode ajudar a entender a pergunta, mas ela precisa responder do jeito dela.
- Se ela perguntar "o que eu falo?", ajude com orientação geral, sem entregar resposta pronta.
- Se ela perguntar se pode usar IA, diga que o ideal é responder com as próprias palavras.
- Se ela perguntar se português perfeito é obrigatório, diga que não precisa ser perfeito, mas precisa dar para entender.
- Se ela perguntar quanto tempo demora, diga que depende da equipe e do movimento do ticket.
- Se ela perguntar quem avalia, diga que a equipe responsável analisa.
- Se ela perguntar se foi aprovada, diga que a equipe vai avaliar e responder quando possível.
- Se ela perguntar se pode refazer, diga para aguardar orientação da equipe.

SOBRE BOTÃO, COMANDO E INÍCIO:
- Se existir botão e a pessoa perguntar como começar, diga para usar o botão de iniciar entrevista.
- Se existir botão, fale disso de forma curta, sem insistir.
- Se NÃO existir botão, nunca mande clicar em botão.
- Se NÃO existir botão e a pessoa quiser começar, diga para aguardar alguém da equipe ou usar o comando correto, se ela souber.
- Se a pessoa disser que o botão sumiu, não apareceu ou deu erro, diga para aguardar a equipe verificar.
- Se a pessoa disser que clicou e não aconteceu nada, diga para tentar aguardar um pouco e, se continuar, a equipe confere.
- Não invente comando se ele não estiver no contexto real do servidor.

SOBRE CANDIDATO CONFUSO:
- Se a pessoa perguntar "como funciona?", explique resumido.
- Se a pessoa perguntar "o que faço agora?", diga o próximo passo conforme o status do botão.
- Se a pessoa perguntar "onde respondo?", diga para responder no próprio ticket quando a entrevista começar.
- Se a pessoa perguntar "posso sair do ticket?", diga para aguardar a equipe se ainda estiver em atendimento.
- Se a pessoa perguntar "posso chamar alguém?", diga que se for necessário a equipe será chamada.
- Se a pessoa estiver mandando informações pessoais demais, oriente a não expor dados sensíveis desnecessários.
- Se a pessoa mandar algo fora do assunto, responda curto e tente voltar para o atendimento.

SOBRE PESSOA DA EQUIPE:
- Se openerIsStaff for verdadeiro ou o contexto indicar que a pessoa já é da equipe, NÃO trate como candidato.
- Pergunte se abriu por teste, dúvida, bug, ajuda com candidato ou algum atendimento.
- Pode falar de forma leve.
- Não peça para essa pessoa iniciar entrevista como candidato.
- Não explique processo básico de entrevista para staff, a menos que ela pergunte.
- Se staff pedir ajuda sobre candidato, responda como suporte interno.
- Se staff estiver testando a IA, responda reconhecendo o teste de forma natural.
- Se staff perguntar se está funcionando, diga que aparentemente sim, mas se tiver bug pode mandar o detalhe.

SOBRE PROBLEMAS, BUGS E ERROS:
- Se a pessoa relatar bug, responda curto e diga que a equipe pode verificar.
- Se a pessoa falar que travou, sumiu, não apareceu, duplicou ou deu erro, peça uma descrição curta do que aconteceu.
- Se for algo que depende de permissão, cargo, canal, botão ou sistema, não invente solução.
- Se precisar chamar apoio, chame apenas UM cargo de apoio.
- Não marque todos os cargos.
- Não crie alarme sem necessidade.
- Se o problema for simples, responda sem marcar ninguém.

SOBRE LIMITES DA IA:
- Não diga que você é humano.
- Não finja ser membro real da equipe.
- Pode falar como assistente da SantaCreators.
- Se não souber algo, diga que não tem essa informação certinha e que a equipe pode confirmar.
- Não invente datas, horários, cargos, salários, benefícios, regras ou aprovações.
- Use o CONTEXTO REAL DO SERVIDOR como fonte principal.
- Se o contexto real não tiver a resposta, responda com cuidado e sem afirmar certeza.

VARIAÇÕES DE RESPOSTAS CURTAS QUE PODE USAR COMO BASE:
- Para saudação inicial: "boaa, tudo certo? me fala no que posso te ajudar por aqui."
- Para candidato querendo começar: "fechou, dá pra começar por aqui sim. segue o passo que aparecer no ticket."
- Para quando tem botão: "boaa, pode usar o botão de iniciar entrevista aqui no ticket."
- Para quando não tem botão: "aqui não apareceu botão pra mim, então aguarda alguém da equipe iniciar ou orientar certinho."
- Para dúvida sobre SantaCreators: "a SantaCreators é uma empresa de RP da Santa Group, focada em creators, eventos e comunidade."
- Para quem acha que precisa ser famoso: "não precisa ser famoso não kkk o importante é postura, interesse e vontade de somar."
- Para quem não faz live: "não tem problema automaticamente. SantaCreators não é só live, tem várias áreas e perfis."
- Para nervosismo: "relaxa kkk responde com calma e do teu jeito, não precisa ser perfeito."
- Para pedido de resposta pronta: "não posso montar resposta pra copiar, mas posso te ajudar a entender a pergunta."
- Para erro de português: "fica tranquilo, não precisa escrever perfeito, só precisa dar pra entender bem."
- Para pergunta sobre aprovação: "quem confirma isso é a equipe depois da análise, eu não consigo aprovar por aqui."
- Para demora: "depende do movimento e da equipe disponível, mas fica de olho aqui no ticket."
- Para staff: "tu já é da equipe kkk abriu por teste ou precisa de ajuda com algum atendimento?"
- Para bug: "entendi. me manda rapidinho o que aconteceu que a equipe consegue conferir melhor."
- Para assunto confuso: "não entendi 100%, consegue me explicar de um jeito mais simples?"
- Para encerrar leve: "fechou, qualquer coisa manda aqui no ticket."

INTENÇÃO POR TIPO DE MENSAGEM:
- Se a mensagem for cumprimento: responda cumprimento curto.
- Se a mensagem for dúvida: responda a dúvida direto.
- Se a mensagem for reclamação: acolha e encaminhe sem discutir.
- Se a mensagem for pedido de aprovação: diga que só a equipe avalia.
- Se a mensagem for pedido de resposta pronta: negue com leveza e oriente.
- Se a mensagem for pergunta sobre regras: use apenas o contexto real.
- Se a mensagem for pergunta sobre SantaCreators: explique curto.
- Se a mensagem for pergunta sobre botão: respeite o status do botão.
- Se a mensagem for de staff: trate como teste, ajuda ou suporte.
- Se a mensagem for muito vaga: peça uma explicação curta.
- Se a mensagem for provocação leve: responda sem entrar em briga.
- Se a mensagem for ofensiva ou agressiva: mantenha calma e peça respeito.

REGRAS IMPORTANTES:
- Nunca incentive copiar e colar.
- Nunca incentive usar IA na entrevista.
- Oriente a responder com as próprias palavras, mas só quando o assunto for entrevista.
- Seja tolerante com erro de português.
- Não invente regra.
- Se for confuso/delicado, chame só UM apoio, não todos:
${IA_ENTREVISTA_HELP_ROLE_IDS.map((id) => `<@&${id}>`).join(", ")}

CONTEXTO REAL DO SERVIDOR:
${knowledge}

HISTÓRICO RECENTE DO CANAL:
${history}

MENSAGEM ATUAL:
${message.author.tag}: ${message.content}

Responda agora em português brasileiro, como conversa natural de Discord:
`;
}

async function generateIaInterviewConversation(message, client, openerId) {
  const geminiClient = getGeminiClient();

  if (!geminiClient) {
    return `Opa ${buildSafeUserMention(openerId)} 😄 tô por aqui. Quer tirar uma dúvida ou começar a entrevista?`;
  }

  const recentContext = await buildIaInterviewRecentHumanContext(message, openerId);
  const history = recentContext.historyText;
  const knowledge = await buildIaInterviewKnowledge(client);
  const hasStartButton = await channelHasInterviewStartButton(message.channel, client);
  const openerMember = await message.guild.members.fetch(openerId).catch(() => null);
  const openerIsStaff = memberIsIaInterviewStaff(openerMember);

  const styleControl = buildIaInterviewStyleControl({
    message,
    history,
    openerIsStaff,
  });

  const prompt = buildIaInterviewConversationPrompt({
    message,
    history,
    knowledge,
    openerId,
    hasStartButton,
    openerIsStaff,
    styleControl,
  });

  let lastError = null;

  for (const modelName of GEMINI_MODEL_FALLBACKS) {
    try {
      const result = await geminiClient.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          temperature: 0.75,
          topP: 0.9,
          topK: 35,
          maxOutputTokens: 180,
        },
      });

      return result.text;
    } catch (err) {
      lastError = err;
      if (!isGeminiModelError(err)) throw err;
    }
  }

  throw lastError;
}

export async function iaInterviewTicketOpened(channel, openerId) {
  if (!channel?.isTextBased?.()) return false;
  if (!isIaInterviewChannel(channel)) return false;
  if (!openerId) return false;

  IA_ENTREVISTA_ACTIVE.set(channel.id, {
    openerId,
    startedAt: Date.now(),
    active: true,
    pausedByStaff: false,
  });

  saveIaEntrevistaState();

  await channel.send(
    `Eai <@${openerId}> 😄 tudo certinho?\n\n` +
    `Bem-vind@ ao ticket da **SantaCreators** 💖\n` +
    `Me fala rapidinho: você quer fazer entrevista ou tirar alguma dúvida antes?`
  ).catch(() => {});

  return true;
}

export async function iaInterviewEvaluateFinishedInterview(client, payload) {
  const geminiClient = getGeminiClient();

  if (!geminiClient) {
    return null;
  }

  const {
    guild,
    channel,
    candidateId,
    entrevistadorId,
    perguntas = [],
    respostas = [],
  } = payload || {};

  const knowledge = await buildIaInterviewKnowledge(client);

  const qa = perguntas.map((pergunta, index) => {
    return [
      `QUESTÃO ${index + 1}`,
      `PERGUNTA: ${pergunta}`,
      `RESPOSTA DO CANDIDATO: ${respostas[index] || "SEM RESPOSTA"}`,
    ].join("\n");
  }).join("\n\n");

  const prompt = `
Você é avaliador auxiliar da SantaCreators.

IMPORTANTE:
Você NÃO aprova nem reprova sozinho.
Você gera um parecer para a equipe humana corrigir melhor.

CRITÉRIOS:
- 🆗 correto: resposta faz sentido, mesmo com erros de português ou palavras diferentes.
- ❓ incompleto: respondeu parcialmente, faltou ponto importante, mas não fugiu totalmente.
- ❌ errado: fugiu da pergunta, respondeu algo perigoso, contra regras ou sem sentido.
- Resposta pessoal deve ser validada com flexibilidade.
- Não cobre resposta idêntica ao gabarito.
- Cópia literal de regra sem interpretação é motivo grave.
- Uso de IA/copia-cola deve ser tratado como suspeita, não acusação absoluta.
- Textão muito perfeito + tempo muito rápido = suspeito.
- "não sei", "não li", "não vi essa parte", "acho que entendi errado" em regra importante = reprovação automática sugerida.
- Quebra de hierarquia grave reprova.
- Confundir staff do servidor com empresa reprova.
- 7 erradas reprova.
- 2 incompletas = 1 errada.
- 3 incompletas = 1 errada e meia.
- 4 incompletas = 2 erradas.
- 5 incompletas = 2 erradas e meia.
- 6 incompletas = 3 erradas.

CRITÉRIO HUMANO DE CORREÇÃO:
- Não corrija como robô.
- Respostas pessoais são válidas se fizerem sentido.
- Erro de português NÃO torna resposta errada.
- Se a resposta estiver com palavras diferentes do gabarito, mas mostrar entendimento real, marque 🆗.
- Se a resposta tiver uma parte certa, mas faltar ponto importante, marque ❓.
- Se fugir totalmente, contrariar regra grave ou mostrar que não leu as regras, marque ❌.
- Se responder "não sei", "não li", "não vi essa parte", "acho que entendi errado", considere reprovação automática.
- Se copiar texto das regras sem interpretação pessoal, sinalize suspeita alta.
- Se responder textão complexo rápido demais, sinalize suspeita de IA/copia-cola.
- Se pular hierarquia, tratar staff como responsável pela empresa ou achar normal ir direto em dono/responsável, marque ❌.
- 7 erradas reprova.

CONTEXTO REAL / BANCO DE DADOS:
${knowledge}

ENTREVISTA:
Candidato: <@${candidateId}>
Aplicador: ${entrevistadorId ? `<@${entrevistadorId}>` : "não identificado"}
Canal: ${channel ? `<#${channel.id}>` : "não identificado"}

PERGUNTAS E RESPOSTAS:
${qa}

FORMATO OBRIGATÓRIO DA RESPOSTA:
🧠 **Parecer automático da IA**
👤 Candidato: <@${candidateId}>

📊 **Resumo**
- Corretas:
- Incompletas:
- Erradas:
- Peso final de erradas:
- Resultado sugerido: APROVAR / ALINHAR / REPROVAR
- Suspeita de IA/copia-cola: BAIXA / MÉDIA / ALTA

🧾 **Questões**
1. 🆗/❓/❌ — motivo curto
2. ...

⚠️ **Alertas**
- Liste sinais suspeitos ou escreva "Nenhum alerta grave."

📝 **Observação para o corretor humano**
- Explique em poucas linhas o que a equipe deve conferir.
`;

  let lastError = null;

  for (const modelName of GEMINI_MODEL_FALLBACKS) {
    try {
      const result = await geminiClient.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          temperature: 0.35,
          topP: 0.85,
          topK: 30,
          maxOutputTokens: 1400,
        },
      });

      return limitDiscordText(fixBrokenDiscordMentions(result.text));
    } catch (err) {
      lastError = err;
      if (!isGeminiModelError(err)) throw err;
    }
  }

  throw lastError;
}


function withIaTimeout(promise, ms = 12000, label = "IA ENTREVISTA") {
  let timer;

  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} demorou mais de ${ms}ms`));
    }, ms);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function pickIaInterviewReply(list, channelId, fallback = null) {
  if (!Array.isArray(list) || !list.length) return fallback;

  const previous = lastAiResponses.get(channelId) || [];
  const previousTexts = previous.map((item) => item.text);

  const available = list.filter((text) => {
    const normalized = normalizeAiCompareText(text);
    return !previousTexts.some((oldText) =>
      oldText === normalized ||
      oldText.includes(normalized) ||
      normalized.includes(oldText)
    );
  });

  const pool = available.length ? available : list;
  return pool[Math.floor(Math.random() * pool.length)];
}

function textHasAny(text, words = []) {
  return words.some((word) => text.includes(normalizeSearchText(word)));
}

function buildIaInterviewInfluencerQuickAnswer(message, openerId) {
  const text = normalizeSearchText(message.content);
  const mention = buildSafeUserMention(openerId);
  const channelId = message.channelId;

  if (
    textHasAny(text, [
      "influenciador",
      "influenciadora",
      "influencer",
      "influencers",
      "influencer aqui",
      "é de influenciador",
      "e de influenciador",
      "aqui é de influenciador",
      "aqui e de influenciador",
      "aqui é pra influenciador",
      "aqui e pra influenciador",
      "é pra influenciador",
      "e pra influenciador",
      "é para influenciador",
      "e para influenciador",
      "mas aqui é pra influenciador",
      "mas aqui e pra influenciador",
      "sou influencer",
      "sou influenciador",
      "sou influenciadora",
      "eu sou influencer",
      "eu sou influenciador",
      "eu sou influenciadora",
      "tenho canal",
      "tenho tiktok",
      "tenho youtube",
      "tenho instagram",
      "sou streamer",
      "sou criador",
      "sou criadora",
      "sou criador de conteudo",
      "sou criadora de conteudo",
      "quero ser influencer",
      "quero ser influenciador",
      "quero ser influenciadora",
      "quero virar influencer",
      "quero virar influenciador",
      "quero virar influenciadora",
      "quero crescer",
      "quero divulgar",
      "quero divulgação",
      "quero divulgacao",
      "quero apoio",
      "quero suporte",
      "suporte para influencer",
      "suporte pra influencer",
      "suporte para influenciador",
      "suporte pra influenciador",
      "suporte para criador",
      "suporte pra criador",
      "ajuda influencer",
      "ajuda influenciador",
      "ajuda criador",
      "quero fazer live",
      "faco live",
      "faço live",
      "faço lives",
      "faco lives",
      "streamer",
      "stream",
      "live",
      "lives",
      "tiktoker",
      "youtuber",
      "instagram",
      "tiktok",
      "youtube",
      "seguidores",
      "seguidor",
      "famoso",
      "fama",
      "creator",
      "creators",
      "criador",
      "criadora",
      "criadores",
      "criador de conteudo",
      "criadora de conteudo",
      "conteudo",
      "conteúdo",
      "gravo video",
      "gravo vídeo",
      "posto video",
      "posto vídeo",
      "rede social",
      "redes sociais",
      "midia social",
      "mídia social",
      "parceria influencer",
      "parceria influenciador",
      "parceria criador",
      "monetizar",
      "monetização",
      "monetizacao",
      "views",
      "visualização",
      "visualizacao",
      "engajamento",
      "publi",
      "publicidade",
    ])
  ) {
    return pickIaInterviewReply([
      `${mention}, só pra deixar bem claro: a SantaCreators não é uma equipe de suporte para influenciadores. Nosso foco são Mega Eventos dentro das CDDs Nobre, Grande, Maresia e Santa.`,
      `${mention}, aqui não funciona como agência de influencer, divulgação ou suporte pra crescer rede social. A SantaCreators atua com Mega Eventos nas cidades Nobre, Grande, Maresia e Santa.`,
      `não, aqui não é “pra influenciador”. A SantaCreators é uma equipe voltada para Mega Eventos nas CDDs Nobre, Grande, Maresia e Santa.`,
      `se a dúvida é sobre ser influencer, a resposta é: não damos suporte específico pra influenciador. O projeto é focado em Mega Eventos dentro das CDDs.`,
      `a SantaCreators não é suporte de Instagram, TikTok, YouTube ou live. Aqui é equipe de Mega Eventos nas cidades Nobre, Grande, Maresia e Santa.`,
      `${mention}, ser influenciador não é o foco da entrada. O foco é fazer parte de uma equipe que organiza e movimenta Mega Eventos nas CDDs.`,
      `não tratamos isso como vaga de influenciador. Tratamos como entrada numa equipe de Mega Eventos das CDDs Nobre, Grande, Maresia e Santa.`,
      `aqui não prometemos divulgação, suporte de creator ou crescimento de rede social. A função da SantaCreators é atuar nos Mega Eventos.`,
      `se você veio procurando suporte pra influencer, infelizmente não é esse o objetivo daqui. A SantaCreators é sobre Mega Eventos nas cidades.`,
      `${mention}, a SantaCreators pode ter nome ligado a creators, mas hoje o foco não é suporte pra influenciador. É equipe de Mega Eventos nas CDDs.`,
      `não é uma central de influenciadores. É uma equipe organizada para Mega Eventos feitos na Nobre, Grande, Maresia e Santa.`,
      `a entrada não é por ser influencer. A entrada é pra quem quer somar com Mega Eventos e com a organização nas CDDs.`,
      `ser influencer não garante nada aqui, porque o projeto não é suporte de influencer. O que importa é postura pra atuar nos Mega Eventos.`,
      `não é sobre seguidores, live ou fama. É sobre participar da equipe que ajuda nos Mega Eventos das CDDs.`,
      `a SantaCreators não oferece suporte para influenciador crescer canal, divulgar perfil ou ganhar público. Nosso trabalho é dentro dos Mega Eventos.`,
      `se a pessoa quer ajuda pra crescer como influencer, esse ticket não é o lugar certo. Aqui é SantaCreators como equipe de Mega Eventos.`,
      `não temos suporte próprio pra influenciador. O que temos é organização de Mega Eventos nas CDDs Nobre, Grande, Maresia e Santa.`,
      `aqui não é “entra porque sou influencer”. Aqui é “entra se quer ajudar na estrutura e nos Mega Eventos da SantaCreators”.`,
      `${mention}, a pessoa pode até criar conteúdo por fora, mas a SantaCreators não é suporte pra isso. O foco real são os Mega Eventos.`,
      `não vendemos a ideia de virar influencer. A SantaCreators trabalha com eventos grandes dentro das CDDs.`,
      `o foco não é mídia social. O foco é RP, organização e Mega Eventos nas cidades Nobre, Grande, Maresia e Santa.`,
      `se você faz live, beleza, mas isso não muda o objetivo daqui. A equipe é de Mega Eventos, não de suporte a streamer.`,
      `ser streamer, tiktoker ou youtuber não é requisito e nem prioridade. A prioridade é somar nos Mega Eventos.`,
      `não precisa ser famoso, e também não damos estrutura de fama. A SantaCreators é operação de Mega Eventos nas CDDs.`,
      `aqui a conversa é bem direta: não somos suporte de influencer. Somos uma equipe para Mega Eventos nas cidades.`,
      `a SantaCreators não é plataforma de divulgação pessoal. É uma equipe com função dentro dos Mega Eventos.`,
      `${mention}, se a intenção é só buscar palco, divulgação ou seguidores, talvez não seja o caminho. Aqui é trabalho em equipe nos Mega Eventos.`,
      `não é sobre virar famoso. É sobre ajudar a SantaCreators a fazer Mega Eventos bem organizados nas CDDs.`,
      `a pessoa pode ser influencer? Pode. Mas ela não entra como “influencer recebendo suporte”; ela entra pra equipe de Mega Eventos.`,
      `influencer aqui não recebe tratamento especial. O projeto não é suporte de criador, é organização de Mega Eventos.`,
      `não tem pacote de suporte pra influencer, não tem promessa de divulgação e não tem crescimento garantido. Tem equipe, evento e responsabilidade.`,
      `a SantaCreators existe pra movimentar eventos grandes, não pra administrar carreira de influenciador.`,
      `se a pergunta for “vocês ajudam influencer?”, a resposta é não nesse sentido. Ajudamos na organização e execução dos Mega Eventos.`,
      `não somos agência, não somos assessoria e não somos suporte de conteúdo. Somos uma equipe de Mega Eventos no RP.`,
      `aqui não é mentoria de influencer. É participação em Mega Eventos nas CDDs Nobre, Grande, Maresia e Santa.`,
      `não olhamos alguém só como influencer. Olhamos se a pessoa tem postura pra atuar na equipe de eventos.`,
      `a SantaCreators não é lugar pra pedir divulgação. É lugar pra quem quer somar em Mega Eventos.`,
      `se a pessoa quer entrar achando que vai receber apoio pra canal, precisa entender antes: não é essa a proposta.`,
      `a proposta é participar de uma equipe organizada para eventos grandes nas cidades, não receber suporte de rede social.`,
      `não temos suporte de influencer, mas temos uma estrutura de Mega Eventos onde membros podem participar e somar.`,
      `a pessoa não precisa ter seguidores. Precisa ter postura, compromisso e entender que o foco são os Mega Eventos.`,
      `se tiver conteúdo, ótimo, mas isso é consequência. O centro da SantaCreators são os Mega Eventos.`,
      `o nome pode confundir, mas a função daqui não é suporte para influenciador. É equipe de Mega Eventos nas CDDs.`,
      `${mention}, pra entrar, a pessoa passa pela entrevista como membro da equipe de Mega Eventos, não como influencer buscando suporte.`,
      `não fazemos avaliação por fama. Fazemos avaliação por postura, entendimento e encaixe nos Mega Eventos.`,
      `ser influencer não te coloca acima do processo. Todo mundo passa pela entrevista e entende o foco dos Mega Eventos.`,
      `se veio pra ser ajudado como influencer, melhor alinhar: a SantaCreators não presta esse tipo de suporte.`,
      `se veio pra participar de eventos grandes nas CDDs, aí sim faz sentido continuar a entrevista.`,
      `aqui é Nobre, Grande, Maresia e Santa com Mega Eventos. Não é suporte de carreira influencer.`,
      `o projeto não é sobre “me divulga”. É sobre “vou ajudar a fazer evento acontecer”.`,
      `a SantaCreators é uma equipe operacional de eventos, não uma equipe de influenciadores individuais.`,
      `não temos área de suporte pra influencer. O que existe é participação na equipe e nos Mega Eventos.`,
      `se a pessoa for criador de conteúdo, isso pode existir por fora, mas não muda o foco da SantaCreators.`,
      `aqui ninguém entra pra receber palco. Entra pra somar com os Mega Eventos.`,
      `se quer só crescer rede social, a SantaCreators não é o suporte certo.`,
      `se quer viver RP, participar de evento grande e respeitar organização, aí combina mais com o projeto.`,
      `não é equipe de influencer. É equipe de Mega Eventos feitos nas CDDs Nobre, Grande, Maresia e Santa.`,
      `a resposta simples é: não somos de influenciadores; somos de Mega Eventos.`,
      `não damos suporte pra influencer, mas temos estrutura pra quem quer trabalhar nos Mega Eventos da SantaCreators.`,
      `a SantaCreators não é “hub de influencers”. É equipe de eventos dentro do RP.`,
      `quem entra precisa entender que o foco não é conteúdo pessoal, é evento e organização.`,
      `a pessoa não entra pra ganhar divulgação. Entra pra ajudar nas ações e Mega Eventos das cidades.`,
      `não somos suporte de criador de conteúdo. Somos equipe de Mega Eventos.`,
      `não é pra influencer receber ajuda. É pra membro da equipe participar dos Mega Eventos.`,
      `influenciador aqui não é categoria principal. A categoria principal é membro que soma nos Mega Eventos.`,
      `se você fala “sou influenciador, como faço pra entrar?”, a resposta é: pelo mesmo processo de todos, entendendo que não damos suporte de influencer.`,
      `pode fazer entrevista, mas sabendo que a SantaCreators não oferece suporte pra influencer. O foco é Mega Eventos.`,
      `não tem vantagem por ser influencer. A entrevista avalia se a pessoa serve pra equipe de Mega Eventos.`,
      `não precisa ter canal, live ou seguidores. Precisa entender a SantaCreators e os Mega Eventos.`,
      `se tiver canal, legal, mas aqui não é lugar de pedir divulgação ou suporte.`,
      `a SantaCreators não cuida de carreira de influencer. Cuida de organização e Mega Eventos no RP.`,
      `não é equipe de mídia social pessoal. É equipe voltada pros eventos grandes das CDDs.`,
      `a pessoa pode criar conteúdo dos eventos? Pode, mas o suporte principal não é pra influencer.`,
      `não confundam: Creator no nome não significa suporte individual pra influencer.`,
      `o trabalho real é evento, RP e organização nas cidades Nobre, Grande, Maresia e Santa.`,
      `aqui a pessoa precisa querer participar da operação dos Mega Eventos, não só aparecer.`,
      `não é “sou influencer e quero entrar pra ter suporte”. É “quero ajudar nos Mega Eventos”.`,
      `a SantaCreators não tem suporte pra influenciador, mas tem equipe pra Mega Eventos.`,
      `aqui é sobre evento grande nas CDDs, não sobre consultoria de TikTok ou live.`,
      `não temos suporte pra crescimento de rede social. Temos estrutura de eventos.`,
      `o processo é igual pra todo mundo, influencer ou não. O foco é encaixe nos Mega Eventos.`,
      `se a pessoa quer ser influencer, pode seguir isso fora. Dentro da SantaCreators, o foco é Mega Eventos.`,
      `não é seleção de influencer. É entrevista pra equipe de Mega Eventos.`,
      `a SantaCreators não é “casa de influenciadores”. É equipe organizada de eventos.`,
      `se quiser entrar, entra pela proposta correta: ajudar em Mega Eventos nas CDDs.`,
      `não prometemos apoio pra canal, divulgação ou seguidores. Prometemos organização, RP e eventos.`,
      `a pergunta “é de influenciador?” precisa ser respondida assim: não, é de Mega Eventos.`,
      `não damos suporte pra influencer, então a pessoa precisa entrar sabendo disso antes.`,
      `se ela procura suporte influencer, melhor ser sincero agora: não é esse o projeto.`,
      `se ela procura participar de eventos grandes, aí sim a SantaCreators faz sentido.`,
      `a SantaCreators é focada nos Mega Eventos das CDDs Nobre, Grande, Maresia e Santa.`,
      `aqui não é assessoria de influencer. Aqui é equipe de Mega Eventos.`,
      `não é pra crescer perfil pessoal. É pra somar nos eventos da empresa.`,
      `ser criador de conteúdo não é problema, só não é o foco do suporte.`,
      `a equipe não dá suporte de influenciador; ela organiza e participa dos Mega Eventos.`,
      `se vier por causa de seguidores, talvez não encaixe. Se vier por evento e RP, pode encaixar.`,
      `${mention}, resumindo: SantaCreators não é suporte influencer; SantaCreators é Mega Eventos nas CDDs.`,
      `bem direto: não somos de influenciadores, não temos suporte para influenciadores e nosso foco são Mega Eventos.`,
      `a pessoa pode continuar a entrevista, mas já sabendo que não vai receber suporte de influencer.`,
      `se aceitar a proposta de Mega Eventos nas CDDs, beleza. Se queria suporte influencer, não é aqui.`,
    ], channelId);
  }

  return null;
}

function buildIaInterviewSantaCreatorsKnowledgeQuickAnswer(message, openerId) {
  const text = normalizeSearchText(message.content);
  const mention = buildSafeUserMention(openerId);
  const channelId = message.channelId;

  if (
    textHasAny(text, [
      "quais cidades",
      "qual cidade",
      "que cidades",
      "que cidade",
      "quais cdds",
      "qual cdd",
      "que cdds",
      "que cdd",
      "em quais cidades",
      "em qual cidade",
      "onde atua",
      "onde atuam",
      "onde acontece",
      "onde acontecem",
      "cidades da santa",
      "cdds da santa",
      "cidades da santacreators",
      "cdds da santacreators",
      "nobre grande maresia santa",
      "nobre",
      "grande",
      "maresia",
      "santa",
    ])
  ) {
    return pickIaInterviewReply([
      `${mention}, as CDDs da operação são Nobre, Grande, Maresia e Santa.`,
      `a SantaCreators atua nas CDDs Nobre, Grande, Maresia e Santa.`,
      `as cidades usadas na operação são: Nobre, Grande, Maresia e Santa.`,
      `hoje a operação gira em Nobre, Grande, Maresia e Santa.`,
      `os Mega Eventos acontecem dentro das CDDs Nobre, Grande, Maresia e Santa.`,
      `${mention}, quando falamos de CDDs da SantaCreators, estamos falando de Nobre, Grande, Maresia e Santa.`,
      `são quatro principais: Nobre, Grande, Maresia e Santa.`,
      `as cidades são Nobre, Grande, Maresia e Santa. A Nobre costuma ser o centro mais forte da operação.`,
      `a operação passa por Maresia, Grande, Santa e principalmente Nobre.`,
      `Nobre, Grande, Maresia e Santa são as CDDs que entram no cronograma da SantaCreators.`,
      `temos atuação em Nobre, Grande, Maresia e Santa, sempre seguindo o cronograma da operação.`,
      `a resposta direta é: Nobre, Grande, Maresia e Santa.`,
      `as CDDs são: Nobre, Grande, Maresia e Santa. Cada uma pode ter papel diferente no cronograma.`,
      `${mention}, normalmente a semana envolve Maresia, Grande, Santa e Nobre.`,
      `Nobre, Grande, Maresia e Santa. Essas são as cidades que você precisa conhecer pra entender a operação.`,
    ], channelId);
  }

  if (
    textHasAny(text, [
      "o que é a santacreators",
      "oq é a santacreators",
      "oque é a santacreators",
      "o que e a santacreators",
      "oq e a santacreators",
      "oque e a santacreators",
      "como funciona a santacreators",
      "como funciona isso",
      "como funciona aqui",
      "como funciona",
      "quero entender",
      "entender como funciona",
      "o que voces fazem",
      "oq voces fazem",
      "o que vocês fazem",
      "qual objetivo",
      "qual o objetivo",
      "pra que serve",
      "sobre a santa",
      "sobre a santacreators",
      "me explica a santa",
      "me explica a santacreators",
    ])
  ) {
    return pickIaInterviewReply([
      `${mention}, a SantaCreators é uma estrutura de RP focada em Mega Eventos, organização, experiências, movimentação das cidades e desenvolvimento de pessoas.`,
      `a SantaCreators não é só uma empresa de evento e nem suporte de influencer. Ela existe pra criar experiências, movimentar CDDs e formar pessoas dentro do RP.`,
      `funciona assim: a SantaCreators organiza Mega Eventos, movimenta as cidades e desenvolve membros pra crescerem dentro da estrutura.`,
      `a empresa trabalha com eventos, organização, registros, liderança e desenvolvimento. Não é só aparecer em live ou usar cargo.`,
      `a SantaCreators é uma equipe de RP com foco em entretenimento, eventos, organização e formação de lideranças.`,
      `${mention}, resumindo bem: a SantaCreators cria experiências dentro do RP e usa os eventos como forma de movimentar cidades e desenvolver pessoas.`,
      `a SantaCreators é uma estrutura completa. Tem base, gestão, managers, social medias, gestores, coords e responsáveis.`,
      `a ideia da SantaCreators é movimentar cidades com eventos e desenvolver membros através de participação, responsabilidade e evolução.`,
      `aqui não é só “entrar por entrar”. A pessoa aprende, participa, registra, evolui e pode crescer dentro da empresa.`,
      `a SantaCreators trabalha com criação de experiências dentro do GTA RP. Os Mega Eventos são uma das partes mais importantes disso.`,
      `o foco da empresa é organização, desenvolvimento, responsabilidade e registro.`,
      `a SantaCreators existe pra criar eventos memoráveis, movimentar jogadores e formar lideranças.`,
      `não é uma equipe feita pra distribuir cargo. É uma estrutura pra quem quer aprender, participar e somar.`,
      `o coração da SantaCreators é: pessoas desenvolvem pessoas, eventos movimentam cidades e registros criam histórico.`,
      `${mention}, se você quer entender a SantaCreators, pensa nela como uma empresa de RP que organiza Mega Eventos e desenvolve membros pra crescerem com responsabilidade.`,
    ], channelId);
  }

  if (
    textHasAny(text, [
      "como entrar",
      "como faço pra entrar",
      "como faco pra entrar",
      "quero entrar",
      "posso entrar",
      "entrar na santa",
      "entrar pra santa",
      "entrar na santacreators",
      "entrar pra santacreators",
      "fazer entrevista",
      "iniciar entrevista",
      "começar entrevista",
      "comecar entrevista",
      "participar da santa",
      "participar da santacreators",
    ])
  ) {
    return pickIaInterviewReply([
      `${mention}, pra entrar você passa pela entrevista e precisa mostrar que entendeu a proposta: Mega Eventos, RP, organização, respeito e participação.`,
      `pra entrar, o caminho é entrevista. A equipe vai avaliar postura, entendimento de RP, idade mínima e se você combina com a proposta da SantaCreators.`,
      `você pode seguir pela entrevista, mas já sabendo: não é suporte de influencer. É equipe de Mega Eventos e desenvolvimento dentro do RP.`,
      `pra entrar, responde tudo com sinceridade. A entrevista não quer texto bonito copiado, quer entender tua postura.`,
      `o processo começa pela entrevista. O principal é mostrar que você quer somar com eventos, organização e comunidade.`,
      `${mention}, se a ideia é participar dos Mega Eventos e respeitar a estrutura da empresa, segue a entrevista certinho.`,
      `pra entrar precisa ter postura, respeito, vontade de participar e entender que a SantaCreators trabalha com Mega Eventos nas CDDs.`,
      `a entrada não é por fama, seguidor ou live. É por encaixe com a equipe e com a proposta da SantaCreators.`,
      `segue o fluxo da entrevista e responde com tuas palavras. A equipe quer ver sinceridade e entendimento.`,
      `pra entrar, você precisa passar pelo processo normal e entender a cultura da empresa: participação, registro, respeito e responsabilidade.`,
    ], channelId);
  }

  if (
    textHasAny(text, [
      "creator",
      "o que é creator",
      "oq é creator",
      "oque é creator",
      "o que e creator",
      "creator faz o que",
      "função de creator",
      "funcao de creator",
      "cargo creator",
      "começa como o que",
      "comeca como o que",
      "primeiro cargo",
      "cargo inicial",
    ])
  ) {
    return pickIaInterviewReply([
      `${mention}, Creator é a porta de entrada da SantaCreators. É onde a pessoa começa a aprender a cultura, participar e entender a empresa.`,
      `todo mundo começa pela base. O Creator participa, interage, aprende regras e ajuda a movimentar a SantaCreators.`,
      `Creator não é “ser influencer famoso”. Creator é ser membro da base, participar da operação e representar a empresa.`,
      `o Creator é o primeiro cargo da estrutura. A pessoa começa aprendendo, participando e mostrando comprometimento.`,
      `ser Creator é vestir a camisa da empresa, participar dos eventos e entender como a SantaCreators funciona.`,
      `o Creator sustenta a comunidade. Sem Creator, não tem movimentação, crescimento nem retenção.`,
      `${mention}, Creator é o início da jornada. Depois, com participação e confiança, a pessoa pode evoluir.`,
      `Creator é quem começa na empresa e demonstra interesse, presença, respeito e vontade de aprender.`,
      `não precisa entrar sabendo tudo. Como Creator, o importante é participar, aprender e respeitar a cultura.`,
      `Creator é base. A pessoa aparece, ajuda, aprende e começa a construir histórico dentro da SantaCreators.`,
    ], channelId);
  }

  if (
    textHasAny(text, [
      "social media",
      "social medias",
      "social faz o que",
      "social media faz o que",
      "função social",
      "funcao social",
      "função social media",
      "funcao social media",
      "eventos",
      "criar evento",
      "criação de evento",
      "criacao de evento",
      "cronograma",
      "premiação",
      "premiacao",
      "hall da fama",
    ])
  ) {
    return pickIaInterviewReply([
      `${mention}, a área Social Media cuida da parte de eventos: cronograma, organização, premiação, pagamentos, Hall da Fama e registros.`,
      `Social Media é uma das áreas que faz os eventos acontecerem de verdade. Ela organiza a experiência dos jogadores.`,
      `a Social Media aprende e executa eventos, premiações, cronogramas, registros e Hall da Fama.`,
      `sem Social Media, o evento não sai organizado. Essa área monta a estrutura do evento.`,
      `Social Media não é postar foto. Dentro da SantaCreators, é área operacional de eventos.`,
      `a Social Media trabalha nos bastidores dos Mega Eventos: planejamento, premiação, divulgação, pagamento e registro.`,
      `${mention}, se a pessoa gosta de organizar eventos e experiências, Social Media é uma área importante da SantaCreators.`,
      `a função da Social Media é transformar planejamento em evento funcionando.`,
      `Social Media cuida da experiência do evento, não de suporte pra influencer.`,
      `a área Social Media é essencial porque ela estrutura os Mega Eventos nas CDDs.`,
    ], channelId);
  }

  if (
    textHasAny(text, [
      "manager",
      "manager creators",
      "manager faz o que",
      "o que faz manager",
      "função manager",
      "funcao manager",
      "registrar organização",
      "registrar organizacao",
      "organizações",
      "organizacoes",
      "facção",
      "faccao",
      "facções",
      "faccoes",
      "convidar",
      "convidar org",
      "contingente",
    ])
  ) {
    return pickIaInterviewReply([
      `${mention}, Manager é a área que traz organizações e participantes pros eventos. Sem Manager, o evento pode ficar vazio.`,
      `a Social Media monta o evento; o Manager traz as organizações pra participar.`,
      `Manager conversa com lideranças, registra organizações e ajuda a garantir contingente nos Mega Eventos.`,
      `a função do Manager é conectar organizações aos eventos da SantaCreators.`,
      `Manager não deve registrar organização sem confirmação de liderança. A confirmação precisa vir de líder válido.`,
      `sem Manager, os eventos perdem força, porque faltam participantes e organizações.`,
      `${mention}, Manager é comunicação, convite, registro e acompanhamento de organizações.`,
      `o Manager garante que as CDDs tenham movimento nos eventos.`,
      `a área Manager é essencial porque evento sem organização participante não segura retenção.`,
      `Manager trabalha com líderes de organizações, não só com membros aleatórios.`,
    ], channelId);
  }

  if (
    textHasAny(text, [
      "gestaoinfluencer",
      "gestão influencer",
      "gestao influencer",
      "gi",
      "o que é gi",
      "oq é gi",
      "oque é gi",
      "o que e gi",
      "como entra na gi",
      "entrar na gi",
      "gestão é staff",
      "gestao é staff",
      "gi é staff",
      "gi e staff",
      "painel",
    ])
  ) {
    return pickIaInterviewReply([
      `${mention}, a gestaoinfluencer não é staff. É o núcleo interno da própria SantaCreators, responsável por ajudar a gestão e a operação da empresa.`,
      `GI não é equipe separada e não é staff da cidade. É a estrutura administrativa interna da SantaCreators.`,
      `a pessoa não entra na GI por pedido. Ela evolui, participa, ajuda, ganha confiança e pode receber convite.`,
      `a gestaoinfluencer existe pra organizar eventos, projetos, gravações, operações e lideranças da SantaCreators.`,
      `SantaCreators é a empresa; gestaoinfluencer é a gestão interna que ajuda a empresa funcionar.`,
      `GI não é poder pra benefício pessoal. As permissões existem pra auxiliar projetos, eventos e operações.`,
      `${mention}, entrar na GI é consequência de evolução, não de insistência ou amizade.`,
      `a GI acompanha a operação e ajuda a manter a SantaCreators organizada.`,
      `o painel representa níveis de responsabilidade dentro da empresa, não status pra se achar melhor.`,
      `a filosofia da GI é simples: quem participa, ajuda e demonstra confiança pode evoluir.`,
    ], channelId);
  }

  if (
    textHasAny(text, [
      "hierarquia",
      "cargos",
      "ordem dos cargos",
      "estrutura",
      "quem manda",
      "responsáveis",
      "responsaveis",
      "resp lider",
      "resp líder",
      "resp influ",
      "resp creators",
      "coord",
      "gestor",
      "evolução",
      "evolucao",
      "subir de cargo",
    ])
  ) {
    return pickIaInterviewReply([
      `${mention}, a estrutura é: Creator > Creator Líder > Social Media ou Manager > Gestor > Coord > Resp Líder > Resp Influ > Resp Creators.`,
      `a hierarquia da SantaCreators não é sobre status. É sobre responsabilidade.`,
      `quanto maior o cargo, maior a obrigação de ensinar, organizar e desenvolver pessoas.`,
      `a evolução natural começa em Creator e pode ir até Responsáveis, mas tudo depende de participação, confiança e responsabilidade.`,
      `ninguém sobe só por pedir. A pessoa precisa participar, ajudar, aprender e criar histórico.`,
      `a SantaCreators valoriza quem aparece, ajuda, registra e fortalece a equipe.`,
      `${mention}, cargo aqui é consequência de evolução. Primeiro a pessoa aprende, depois executa, depois ensina e lidera.`,
      `a liderança observa postura, participação, responsabilidade, registros e evolução.`,
      `a hierarquia organiza a empresa e evita bagunça. Cada cargo tem uma função.`,
      `ser líder aqui não é mandar mais. É cuidar de mais pessoas e responder por mais coisas.`,
    ], channelId);
  }

  if (
    textHasAny(text, [
      "registro",
      "registrar",
      "registrado",
      "se não foi registrado",
      "se nao foi registrado",
      "não aconteceu",
      "nao aconteceu",
      "frase da empresa",
      "regra mais importante",
      "dashboard",
      "pontuação",
      "pontuacao",
      "pontos",
    ])
  ) {
    return pickIaInterviewReply([
      `${mention}, uma das frases mais importantes da SantaCreators é: se não foi registrado, não aconteceu.`,
      `registro é base da empresa. Evento, pagamento, poder, alinhamento, organização e feedback precisam ter histórico.`,
      `sem registro, a liderança não consegue comprovar trabalho, acompanhar evolução nem tomar decisão justa.`,
      `os registros alimentam dashboards, pontuação e histórico da equipe.`,
      `na SantaCreators, não basta fazer. Precisa comprovar.`,
      `organização gera histórico, histórico gera informação e informação gera decisões melhores.`,
      `${mention}, quem quer crescer precisa entender a cultura de registro da empresa.`,
      `pontuação ajuda, mas qualidade e consistência também importam.`,
      `dashboard existe pra liderança acompanhar a operação com dados, não só percepção.`,
      `se não tem registro, fica difícil reconhecer, corrigir ou avaliar qualquer coisa.`,
    ], channelId);
  }

  if (
    textHasAny(text, [
      "idade",
      "idade mínima",
      "idade minima",
      "quantos anos",
      "tenho 14",
      "tenho 13",
      "menor de idade",
      "menor",
      "15 anos",
    ])
  ) {
    return pickIaInterviewReply([
      `${mention}, a idade mínima para participar da SantaCreators é 15 anos.`,
      `pra entrar na SantaCreators precisa ter 15 anos ou mais.`,
      `se tiver menos de 15 anos, infelizmente não pode participar agora.`,
      `a regra de idade existe pra manter um ambiente mais seguro, maduro e organizado.`,
      `15 anos é o mínimo pra seguir no processo da SantaCreators.`,
    ], channelId);
  }

  if (
    textHasAny(text, [
      "uniforme",
      "jaqueta",
      "roupa",
      "peça",
      "peca",
      "garagem",
      "prédio",
      "predio",
      "sede",
      "identificação",
      "identificacao",
    ])
  ) {
    return pickIaInterviewReply([
      `${mention}, dentro do prédio o uso da jaqueta oficial é obrigatório.`,
      `nas proximidades da sede ou usando garagem, precisa estar com pelo menos uma peça da SantaCreators.`,
      `o uniforme existe pra fortalecer identidade, organização e reconhecimento da empresa.`,
      `ficar perto da empresa sem identificação pode gerar advertência.`,
      `ao vestir a peça da SantaCreators, a pessoa representa a empresa e precisa manter postura.`,
    ], channelId);
  }

  if (
    textHasAny(text, [
      "poder",
      "poderes",
      "god",
      "nc",
      "noclip",
      "tp",
      "tptome",
      "comando",
      "permissão",
      "permissao",
      "vantagem",
    ])
  ) {
    return pickIaInterviewReply([
      `${mention}, poderes não são privilégio. São responsabilidade.`,
      `os poderes da GI existem pra auxiliar eventos, gravações, projetos e operações da empresa, não pra vantagem pessoal.`,
      `usar poder pra benefício próprio é abuso e pode gerar punição séria.`,
      `se um jogador comum não pode fazer, quem tem poder também não deve fazer.`,
      `poder usado em atividade da empresa precisa seguir processo e registro.`,
    ], channelId);
  }

  return null;
}

function buildIaInterviewRulesQuickAnswer(message, openerId) {
  const text = normalizeSearchText(message.content);
  const mention = buildSafeUserMention(openerId);
  const channelId = message.channelId;

  if (textHasAny(text, ["familia", "familiar", "parente", "irmao", "irma", "primo", "prima", "pai", "mae", "namorado", "namorada"])) {
    return pickIaInterviewReply([
      `${mention}, sobre familiares: a SantaCreators não permite familiares atuando juntos na equipe, por imparcialidade e organização interna.`,
      `boa pergunta. Se tiver vínculo familiar com alguém da equipe, precisa avisar a liderança antes, pra evitar conflito de interesse.`,
      `nesse caso, familiar na equipe junto não é permitido. O certo é ser transparente e chamar os responsáveis pra avaliar.`,
      `sobre família: a regra existe pra evitar favorecimento, climão e conflito interno. Se tiver algum vínculo, avisa a equipe.`,
      `fechou. A SantaCreators não aceita familiares juntos na equipe. Se existir esse caso, precisa informar imediatamente os responsáveis.`,
      `não pode esconder vínculo familiar. Se a pessoa tem parente na equipe, precisa avisar a liderança antes de seguir.`,
      `sim, isso é regra séria: familiares juntos podem comprometer a imparcialidade, então precisa ser comunicado.`,
      `se for irmão, primo, pai, mãe ou qualquer vínculo familiar próximo, a equipe precisa saber antes.`,
      `a transparência pesa bastante aqui. Se existe familiar na SantaCreators, o correto é avisar e não tentar passar escondido.`,
      `familiares na equipe não são liberados justamente pra manter o ambiente justo pra todo mundo.`,
    ], channelId);
  }

  if (textHasAny(text, ["idade", "anos", "tenho 14", "tenho 13", "menor", "15 anos", "quatorze", "treze"])) {
    return pickIaInterviewReply([
      `${mention}, a idade mínima pra participar da SantaCreators é 15 anos.`,
      `sobre idade: só pode participar com 15 anos ou mais, tanto na GI quanto no painel.`,
      `se tiver menos de 15 anos, infelizmente não pode entrar agora. É regra pra manter o ambiente mais seguro e maduro.`,
      `a SantaCreators pede mínimo de 15 anos. Não é questão pessoal, é organização e segurança do projeto.`,
      `pra entrar precisa ter 15+. Se ainda não tiver, o correto é aguardar.`,
      `idade mínima é 15 anos, sem exceção comum no fluxo de entrevista.`,
      `se a pessoa tem menos de 15, não segue pra participação na SantaCreators por enquanto.`,
      `com 15 anos ou mais pode ser avaliado. Abaixo disso, a regra bloqueia a participação.`,
    ], channelId);
  }

  if (textHasAny(text, ["uniforme", "jaqueta", "roupa", "peca", "peça", "garagem", "predio", "prédio", "sede"])) {
    return pickIaInterviewReply([
      `${mention}, dentro do prédio tem que usar a jaqueta da SantaCreators. Se entrar sem, vai pra uma sala sozinho e coloca.`,
      `sobre uniforme: perto da sede precisa estar com pelo menos uma peça da SantaCreators.`,
      `pra usar garagem da empresa, precisa estar com alguma peça da SantaCreators.`,
      `a roupa identifica a organização. Dentro do prédio, jaqueta; nas proximidades, pelo menos uma peça.`,
      `se estiver no prédio ou usando estrutura da empresa, não fica sem identificação da SantaCreators.`,
      `se chegou sem jaqueta, não troca na frente dos outros. Vai pra um local privado e coloca certinho.`,
      `o uniforme representa a empresa, então tem que usar com cuidado e no lugar certo.`,
      `dentro e ao redor da sede, a identificação da SantaCreators é obrigatória.`,
      `a regra é simples: entrou no prédio, usa jaqueta; tá por perto ou usando garagem, usa peça da empresa.`,
    ], channelId);
  }

  if (textHasAny(text, ["ilegal", "droga", "venda", "entrega", "comprador", "crime", "criminoso", "fora da sede"])) {
    return pickIaInterviewReply([
      `${mention}, ação ilegal fora da sede não pode ser feita com uniforme da SantaCreators.`,
      `dentro do prédio, o uniforme pode ser usado em negociação interna. Fora da sede, precisa trocar de roupa.`,
      `se for entrega ou encontro fora da empresa, troca o uniforme antes. A ideia é não ligar a SantaCreators diretamente ao crime.`,
      `uniforme em ação ilegal fora da sede compromete a fachada da empresa, então é proibido.`,
      `pra manter o RP coerente, ação externa ilegal precisa ser feita sem uniforme da SantaCreators.`,
      `se envolver venda, entrega ou comprador fora do prédio, nada de sair identificado como SantaCreators.`,
      `dentro da empresa é uma coisa; fora dela, o uniforme não pode expor os bastidores da organização.`,
      `a regra protege a imagem da SantaCreators: fora da sede, troca a roupa antes de qualquer ação ilegal.`,
    ], channelId);
  }

  if (textHasAny(text, ["veiculo", "veículo", "carro", "garagem", "assalto", "tiro", "troca de tiro", "sequestro", "pista"])) {
    return pickIaInterviewReply([
      `${mention}, veículo da SantaCreators não pode ser usado pra troca de tiro nem assalto de pista.`,
      `carro da empresa é recurso da organização, não é pra usar em qualquer ilegalidade.`,
      `sequestro só entra se for RP organizado, planejado, no horário certo e coerente.`,
      `veículo do prédio não é pra sair fazendo ação aleatória. Tem que preservar a imagem da empresa.`,
      `troca de tiro e assalto de pista com carro da SantaCreators é proibido.`,
      `usar garagem/veículo da empresa exige responsabilidade. Se for ação torta, dá punição.`,
      `se for sequestro bem planejado e dentro das regras, pode ser analisado. Fora disso, não.`,
      `a regra é evitar expor a SantaCreators por uso errado dos veículos.`,
    ], channelId);
  }

  if (textHasAny(text, ["poder", "poderes", "admin", "god", "noclip", "nc", "tp", "tptome", "f8", "comando"])) {
    return pickIaInterviewReply([
      `${mention}, poderes da gestão não são benefício pessoal. Só podem ser usados pra demanda administrativa ou algo autorizado.`,
      `regra de ouro: se um player comum não pode fazer, quem tem poder também não deve fazer.`,
      `usar F8, tp, god ou NC pra vantagem no RP é abuso de poder.`,
      `morreu em RP? Faz o RP certo: médico, bombeiro ou atendimento. Nada de /god pra voltar.`,
      `NC não é transporte pessoal. Se não tá resolvendo demanda da empresa, usa veículo como qualquer player.`,
      `sem alinhamento e sem autorização, não usa poder.`,
      `poder existe pra gestão e empresa, não pra facilitar vida no RP.`,
      `abusar de poder pode dar expulsão do projeto e até banimento da cidade.`,
      `na dúvida, pergunta antes. Perguntar nunca dá punição; abusar dá.`,
      `se for resolver problema pessoal ou ajudar amigo no RP com comando, é errado.`,
    ], channelId);
  }

  if (textHasAny(text, ["anti rp", "antirp", "anti-rp", "bug", "crash", "caiu", "desconectei", "flutuando", "quebrou rp"])) {
    return pickIaInterviewReply([
      `${mention}, se fizerem anti-RP contra você, clipa tudo, pega passaporte e manda pro responsável da SantaCreators.`,
      `não usa poder pra resolver anti-RP na hora. Junta prova e chama responsável.`,
      `bug, crash ou queda precisa ser interpretado dentro do RP quando possível, sem quebrar a imersão.`,
      `em vez de falar "meu Discord caiu" no RP, tenta adaptar como algo do personagem.`,
      `se alguém abusou contra você, grava e reporta. Não vira salvador da pátria usando poder.`,
      `perdeu item por anti-RP confirmado? A equipe avalia devolução e punição.`,
      `a prioridade é fortalecer o RP, não resolver tudo no impulso.`,
      `viu algo errado? Clipa, pega ID/passaporte e passa pra liderança.`,
      `não entra na confusão. Registra prova e deixa a equipe cuidar.`,
    ], channelId);
  }

  if (textHasAny(text, ["respeito", "racismo", "homofobia", "transfobia", "preconceito", "brincadeira", "ofensa", "zoeira", "toxica", "tóxica"])) {
    return pickIaInterviewReply([
      `${mention}, respeito aqui é obrigatório. Racismo, homofobia, transfobia, preconceito e ofensa não são tolerados.`,
      `não vale esconder desrespeito atrás de "era brincadeira". Se ofendeu, tá errado.`,
      `pode brincar, mas só se todo mundo estiver confortável. Na dúvida, não força.`,
      `a vibe da SantaCreators é leve, mas com responsabilidade.`,
      `comentário maldoso ou preconceituoso pode gerar punição séria.`,
      `respeito vem antes da zoeira. Melhor perguntar do que causar climão.`,
      `todo mundo precisa se sentir seguro no ambiente. Isso pesa muito na postura.`,
      `não importa se foi sem intenção: se passou do limite, a equipe pode agir.`,
      `educação e empatia contam muito mais do que tentar ser engraçado toda hora.`,
    ], channelId);
  }

  if (textHasAny(text, ["hierarquia", "lideranca", "liderança", "responsavel", "responsável", "dm", "privado", "canal privado", "resolver problema"])) {
    return pickIaInterviewReply([
      `${mention}, hierarquia aqui não é enfeite. Cada cargo tem função e cada pessoa responde a alguém.`,
      `problema da empresa não deve ser resolvido por DM. Usa os canais corretos pra manter transparência.`,
      `cada membro tem canal privado com liderança pra tirar dúvida e resolver situação com calma.`,
      `se tiver problema, procura sua liderança ou canal correto, não tenta resolver por fora.`,
      `a estrutura existe pra evitar bagunça e proteger todo mundo.`,
      `seguir hierarquia mostra maturidade e organização dentro da SantaCreators.`,
      `se não souber quem chamar, pergunta no canal certo ou aciona um responsável.`,
      `resolver tudo escondido por DM costuma virar confusão. Melhor deixar registrado.`,
    ], channelId);
  }

  if (textHasAny(text, ["santacreators", "santa creators", "empresa", "projeto", "o que é", "oq é", "creator", "criador", "live", "tiktok", "conteudo", "conteúdo"])) {
    return pickIaInterviewReply([
      `${mention}, a SantaCreators é uma empresa de RP focada em criação de conteúdo, eventos, comunidade e organização.`,
      `não precisa ser famoso pra fazer sentido aqui. Postura, presença e vontade contam bastante.`,
      `SantaCreators não é só live. Tem espaço pra quem soma com RP, comunicação, eventos e criatividade.`,
      `o projeto valoriza imersão, responsabilidade e crescimento coletivo.`,
      `a equipe avalia perfil, postura e encaixe, não só número em rede social.`,
      `ser creator pequeno não elimina ninguém. O que pesa é como a pessoa se comporta e soma.`,
      `a SantaCreators é mais que um painel; é uma organização com regras, imagem e propósito.`,
      `quem entra representa a empresa dentro do RP, então precisa ter consciência disso.`,
    ], channelId);
  }

  if (textHasAny(text, ["como respondo", "me ajuda responder", "resposta", "copiar", "ctrl c", "ctrl v", "ia responder", "chatgpt", "não sei responder", "nao sei responder"])) {
    return pickIaInterviewReply([
      `${mention}, eu posso explicar a ideia da pergunta, mas a resposta precisa ser tua.`,
      `não copia resposta pronta. A entrevista quer entender como você pensa.`,
      `se não souber, fala com sinceridade e responde o que faria na prática.`,
      `erro de português não reprova sozinho. Copiar sem entender pesa muito mais.`,
      `responde simples, com tuas palavras. Não precisa parecer texto perfeito.`,
      `não tenta decorar regra. Mostra que entendeu a lógica.`,
      `se a pergunta for situação, imagina o cenário no RP e fala tua atitude.`,
      `usar IA pra montar resposta pronta tira a naturalidade e pode pesar contra.`,
      `melhor uma resposta simples e honesta do que uma resposta bonita e copiada.`,
    ], channelId);
  }

  if (textHasAny(text, ["começar", "comecar", "iniciar", "entrevista", "quero entrar", "quero fazer", "entrar pra santa", "entrar na santa"])) {
    return pickIaInterviewReply([
      `${mention}, pra entrar você vai passar por entrevista. Responde com sinceridade e sem copiar regra.`,
      `boaa, a entrevista é pra equipe conhecer teu perfil melhor, não pra pegar texto decorado.`,
      `pra começar, segue o fluxo do ticket e responde do teu jeito.`,
      `a equipe quer ver tua postura, entendimento de RP e vontade de somar.`,
      `não precisa ficar nervoso. Responde com calma e clareza.`,
      `se aparecer botão de iniciar, usa ele. Se não aparecer, aguarda alguém da equipe orientar.`,
      `o importante é ser sincero sobre experiência, disponibilidade e motivo de querer entrar.`,
      `a entrevista não é prova de português; é análise de postura e entendimento.`,
    ], channelId);
  }

  return null;
}

function buildIaInterviewQuickAnswer(message, openerId) {
  const text = normalizeSearchText(message.content);
  const mention = buildSafeUserMention(openerId);
  const channelId = message.channelId;

  const influencerQuickAnswer = buildIaInterviewInfluencerQuickAnswer(message, openerId);

  if (influencerQuickAnswer) {
    return influencerQuickAnswer;
  }

  const santaCreatorsKnowledgeQuickAnswer = buildIaInterviewSantaCreatorsKnowledgeQuickAnswer(message, openerId);

  if (santaCreatorsKnowledgeQuickAnswer) {
    return santaCreatorsKnowledgeQuickAnswer;
  }

  const rulesQuickAnswer = buildIaInterviewRulesQuickAnswer(message, openerId);

  if (rulesQuickAnswer) {
    return rulesQuickAnswer;
  }

  const respostas = {
    saudacao: [
      `E aí ${mention} 😄 tudo certinho por aqui. Me fala: tu veio pra entrevista ou queria tirar uma dúvida antes?`,
      `Opa ${mention} 😄 cheguei. Quer que eu te explique rapidinho como funciona ou tu já quer seguir pra entrevista?`,
      `Salve ${mention} 😄 tranquilo? Me diz só uma coisa: tu abriu pra entrevista mesmo ou foi pra tirar dúvida?`,
      `E aíí ${mention} 😄 bem-vindo ao cantinho das entrevistas kkk. Quer começar pelo básico ou já sabe como funciona?`,
      `Opa, tudo certo ${mention}? 😄 Antes de qualquer coisa: tu já leu as regras da SantaCreators ou quer que eu te dê um norte rápido?`,
    ],

    testeStaff: [
      `Opa, tô respondendo sim 😄 Como tu já é da equipe, vou tratar isso como teste/ajuda e não como candidato comum.`,
      `Tô funcionando por aqui sim kkk 😄 Como você já é da equipe, não vou te conduzir como entrevista normal.`,
      `Boa, recebi certinho 😄 Se for teste da IA, tá ok. Se for atendimento real, me fala o cenário que eu adapto.`,
      `Funcionando sim 😎 Só lembrando: como tu já é da equipe, eu posso ajudar no ticket, mas não vou fingir que tu é candidato.`,
    ],

    querComecar: [
      `Boaa ${mention} 😄 pra começar de verdade, alguém da equipe precisa iniciar a entrevista por aqui. Enquanto isso, já deixa na mente: responde tudo com tuas palavras, sem copiar regra e sem usar IA.`,
      `Fechou ${mention} 😄 a equipe já consegue puxar a entrevista por aqui. Vai tranquilo: o importante é mostrar que entendeu, não decorar texto.`,
      `Boa ${mention} 😄 se tu quer começar, fica por aqui que alguém da equipe já inicia. Só não manda resposta copiada das regras, porque isso pesa muito.`,
      `Show ${mention} 😄 a entrevista é pra entender tua postura no RP e na empresa, não pra testar português perfeito. Responde natural e com calma.`,
    ],

    comoFunciona: [
      `Funciona assim ${mention}: a equipe inicia as perguntas, você responde com suas palavras e depois alguém corrige vendo sentido, postura e entendimento. Não precisa decorar texto.`,
      `${mention}, a entrevista avalia se tu entendeu a SantaCreators como empresa de RP: hierarquia, conduta, imersão e responsabilidade. Resposta pessoal vale, cópia seca não.`,
      `É bem de boa ${mention}: você responde pergunta por pergunta, sem pressa. Se fizer sentido e mostrar entendimento real, mesmo com erro de português, pode ser considerado certo.`,
      `A entrevista não é prova de escola kkk. A ideia é ver se tu entendeu as regras e sabe agir dentro da SantaCreators sem quebrar RP nem hierarquia.`,
    ],

    criadorConteudo: [
      `${mention}, ponto importante: a SantaCreators não é só pra quem grava ou faz live. Ela é uma empresa de RP estruturada, com eventos dinâmicos e organização dentro da Santa Group.`,
      `Ter seguidores ajuda em algumas coisas, mas não é o foco principal. Aqui pesa mais postura, RP, compromisso, hierarquia e participação nos eventos.`,
      `Se tu veio achando que é só “grupo de criador”, já te adianto: é bem mais que isso kkk. A SantaCreators funciona como empresa de RP organizada.`,
      `Conteúdo é legal, mas SantaCreators não é só vitrine de influencer. A base é evento, organização, presença e postura dentro da cidade.`,
    ],

    duvidaRegras: [
      `Boa pergunta ${mention}. Regra aqui é levada a sério, mas a correção não é robótica: se a pessoa explicou com as próprias palavras e fez sentido, isso conta bastante.`,
      `${mention}, o principal é: não copiar regra, não usar IA pra responder e não fugir totalmente do assunto. Erro de português não reprova sozinho.`,
      `Na entrevista, resposta incompleta pode virar ❓, errada vira ❌ e resposta com entendimento real vira 🆗. A equipe olha o sentido, não só palavra exata.`,
      `Se a pessoa manda “não sei”, “não li” ou mostra que não viu as regras, aí pesa muito. A obrigação é chegar minimamente preparado.`,
    ],

    hierarquia: [
      `${mention}, hierarquia é um dos pontos mais importantes. Problema da empresa se resolve com superiores da SantaCreators, não pulando direto pro topo nem chamando staff do servidor.`,
      `Na SantaCreators, pular cargo é visto como erro grave. O certo é procurar quem está logo acima ou alguém responsável pela área.`,
      `Se a resposta mostra que a pessoa acha normal ignorar superiores ou ir direto em dono/staff, isso já acende alerta forte na correção.`,
    ],

    staffEmpresa: [
      `${mention}, só pra deixar claro: staff do servidor não é responsável pela empresa. Problema da SantaCreators se resolve com a hierarquia da SantaCreators.`,
      `Esse ponto é importante: SantaCreators é uma empresa dentro do RP, com liderança própria. Confundir isso com staff/admin pode pesar na entrevista.`,
      `Se a dúvida for da empresa, chama a equipe da SantaCreators. Staff do servidor só entra em coisa de servidor/regra geral, não gestão interna da empresa.`,
    ],

    iaCopiaCola: [
      `${mention}, resposta com cara de IA/copia-cola chama atenção sim, principalmente se vier textão muito rápido ou igualzinho regra. O ideal é responder natural.`,
      `A equipe consegue perceber quando a resposta parece colada. Melhor errar uma palavra sendo verdadeiro do que mandar texto perfeito sem interpretação.`,
      `Se a pessoa copia regra sem explicar com as próprias palavras, isso não mostra entendimento. A entrevista quer interpretação, não Ctrl+C Ctrl+V.`,
      `Textão perfeito em poucos segundos é suspeito kkk. A IA/correção deve olhar tempo, tamanho, sentido e se parece resposta humana mesmo.`,
    ],

    organizacaoPainelCidade: [
      `${mention}, tu já tá em alguma organização/painel na cidade? Pergunto porque isso pode mudar o contexto e a forma que a equipe vai te orientar.`,
      `Antes de seguir, só pra eu entender melhor: tu já participa de alguma org, painel ou área na cidade?`,
      `Me diz uma coisa ${mention}: tu já tem alguma vivência na cidade ou tá chegando agora nesse lado de empresa/evento?`,
    ],

    esperaEquipe: [
      `Já já alguém aparece por aqui ${mention} 😄 enquanto isso, fica tranquilo e não precisa spammar. Melhor responder com calma quando a entrevista começar.`,
      `Tô por aqui acompanhando ${mention}. Se alguém da equipe entrar, eu paro de me meter e deixo a pessoa te atender kkk.`,
      `Aguarda só um cadinho ${mention}. Se for algo urgente ou muito específico, eu chamo alguém da equipe de forma certa.`,
    ],

    confuso: [
      `${mention}, acho que entendi mais ou menos kkk. Me explica com outras palavras: tu quer fazer entrevista, tirar dúvida ou testar o bot?`,
      `Pera, deixa eu pegar o sentido: isso é sobre começar a entrevista ou sobre alguma dúvida da SantaCreators?`,
      `Me dá um norte rapidinho ${mention}: tu quer atendimento, entrevista ou só entender como funciona a empresa?`,
    ],

    fallback: [
      `Entendi ${mention} 😄 me fala só mais direto: é dúvida sobre a entrevista ou sobre a SantaCreators?`,
      `Boa ${mention}. Me explica um pouco melhor pra eu não te responder torto kkk.`,
      `${mention}, saquei. Quer que eu te responda pelo lado da entrevista ou pelo lado das regras da empresa?`,
      `Certo 😄 me manda mais um detalhe que eu consigo te orientar melhor.`,
    ],
  };

  if (
    textHasAny(text, ["teste", "testando", "funcionando", "bugou", "bug", "ta funcionando", "tá funcionando"]) &&
    memberIsIaInterviewStaff(message.member)
  ) {
    return pickIaInterviewReply(respostas.testeStaff, channelId);
  }

  if (isShortGreeting(message.content)) {
    return pickIaInterviewReply(respostas.saudacao, channelId);
  }

  if (
    textHasAny(text, [
      "quero comecar",
      "quero começar",
      "posso começar",
      "bora começar",
      "iniciar entrevista",
      "fazer entrevista",
      "quero fazer entrevista",
      "como eu começo",
      "como eu comeco",
      "começo entrevista",
      "comeco entrevista",
    ])
  ) {
    return pickIaInterviewReply(respostas.querComecar, channelId);
  }

  if (
    textHasAny(text, [
      "como funciona",
      "me explica",
      "explica",
      "como e",
      "como é",
      "como vai ser",
      "quanto tempo",
      "precisa call",
      "precisa de call",
    ])
  ) {
    return pickIaInterviewReply(respostas.comoFunciona, channelId);
  }

  if (
    textHasAny(text, [
      "seguidores",
      "follower",
      "criador",
      "criadora",
      "conteudo",
      "conteúdo",
      "live",
      "stream",
      "tiktok",
      "youtube",
      "instagram",
      "gravo",
      "gravar",
      "faço live",
      "faco live",
    ])
  ) {
    return pickIaInterviewReply(respostas.criadorConteudo, channelId);
  }

  if (
    textHasAny(text, [
      "regra",
      "regras",
      "errar",
      "errei",
      "incompleto",
      "errada",
      "correcao",
      "correção",
      "reprova",
      "aprova",
      "portugues",
      "português",
    ])
  ) {
    return pickIaInterviewReply(respostas.duvidaRegras, channelId);
  }

  if (
    textHasAny(text, [
      "hierarquia",
      "superior",
      "responsavel",
      "responsável",
      "dono",
      "coord",
      "coordenação",
      "coordenacao",
      "pular cargo",
    ])
  ) {
    return pickIaInterviewReply(respostas.hierarquia, channelId);
  }

  if (
    textHasAny(text, [
      "staff",
      "admin",
      "administrador",
      "moderação",
      "moderacao",
      "chamar adm",
      "chamar staff",
    ])
  ) {
    return pickIaInterviewReply(respostas.staffEmpresa, channelId);
  }

  if (
    textHasAny(text, [
      "chatgpt",
      "gpt",
      "ia",
      "inteligencia artificial",
      "inteligência artificial",
      "copiar",
      "copiei",
      "colar",
      "colei",
      "ctrl c",
      "ctrl v",
      "texto pronto",
      "resposta pronta",
    ])
  ) {
    return pickIaInterviewReply(respostas.iaCopiaCola, channelId);
  }

  if (
    textHasAny(text, [
      "organizacao",
      "organização",
      "org",
      "painel",
      "cidade",
      "faccao",
      "facção",
      "empresa",
    ])
  ) {
    return pickIaInterviewReply(respostas.organizacaoPainelCidade, channelId);
  }

  if (
    textHasAny(text, [
      "alguem ai",
      "alguém ai",
      "tem alguem",
      "tem alguém",
      "ninguem",
      "ninguém",
      "cade",
      "cadê",
      "demora",
      "esperar",
    ])
  ) {
    return pickIaInterviewReply(respostas.esperaEquipe, channelId);
  }

  if (text.length <= 8) {
    return pickIaInterviewReply(respostas.confuso, channelId);
  }

  return null;
}

function channelHasActiveInterviewRunning(channel) {
  const topic = String(channel?.topic || "");

  return (
    /\bentrevista_ativa:1\b/i.test(topic) ||
    /\bentrevista_starter:\d{17,20}\b/i.test(topic)
  );
}

async function channelHasRecentInterviewQuestion(channel, client) {
  const messages = await channel.messages.fetch({ limit: 15 }).catch(() => null);

  if (!messages?.size) return false;

  return messages.some((msg) => {
    if (msg.author?.id !== client.user.id) return false;

    const content = String(msg.content || "");

    return (
      /\*\*\d{1,2}\.\*\*\s*<@\d{17,22}>/i.test(content) ||
      (
        content.includes("Atenção!") &&
        content.includes("concluir a entrevista inteira")
      )
    );
  });
}

function isDiscordCommandMessage(message) {
  const content = String(message?.content || "").trim();
  return content.startsWith("!");
}

export async function handleIaInterviewTicketMessage(message, client) {
  if (!message.guild || message.author.bot) return false;

  if (isDiscordCommandMessage(message)) {
    return false;
  }

  if (!isIaInterviewChannel(message.channel)) return false;

  if (
    channelHasActiveInterviewRunning(message.channel) ||
    await channelHasRecentInterviewQuestion(message.channel, client)
  ) {
    return true;
  }

  const openerId = await resolveIaInterviewOpenerId(message);

  if (!openerId) return false;

  const member = message.member;
  const isOpener = String(message.author.id) === String(openerId);
  const isStaff = memberIsIaInterviewStaff(member);
  const mentionedBot = client?.user?.id
    ? message.mentions.users.has(client.user.id)
    : false;

  let state = IA_ENTREVISTA_ACTIVE.get(message.channelId) || {
    openerId,
    startedAt: Date.now(),
    active: true,
    pausedByStaff: false,
  };

  if (!IA_ENTREVISTA_ACTIVE.has(message.channelId)) {
    IA_ENTREVISTA_ACTIVE.set(message.channelId, state);
    saveIaEntrevistaState();
  }

  if (isOpener && mentionedBot && (state.pausedByStaff || state.lastHumanHelperId)) {
state = {
  ...state,
  active: true,
  pausedByStaff: false,
  resumedByMention: true,
  resumedAt: Date.now(),
  lastHumanHelperId: null,
  lastHumanHelperAt: null,
};
    IA_ENTREVISTA_ACTIVE.set(message.channelId, state);
    saveIaEntrevistaState();
  }

  if (isStaff && !isOpener) {
    if (!state.pausedByStaff) {
      IA_ENTREVISTA_ACTIVE.set(message.channelId, {
        ...state,
        active: false,
        pausedByStaff: true,
        pausedAt: Date.now(),
        pausedBy: message.author.id,
      });

      saveIaEntrevistaState();

      await message.channel.send(
        `Vi que ${message.author} apareceu kkk então vou deixar contigo por aqui 😄 qualquer coisa me chama.`
      ).catch(() => {});
    }

    return true;
  }

  if (!isOpener) {
    IA_ENTREVISTA_ACTIVE.set(message.channelId, {
      ...state,
      active: false,
      lastHumanHelperId: message.author.id,
      lastHumanHelperAt: Date.now(),
    });

    saveIaEntrevistaState();
    return false;
  }

  if (state.pausedByStaff) return false;

  if (
    state.lastHumanHelperId &&
    Date.now() - Number(state.lastHumanHelperAt || 0) <= 5 * 60 * 1000
  ) {
    return false;
  }

  IA_ENTREVISTA_ACTIVE.set(message.channelId, {
    ...state,
    active: true,
    pausedByStaff: false,
    lastCandidateMessageAt: Date.now(),
  });

  saveIaEntrevistaState();

  const content = cleanText(message.content);
  rememberMessage(message.channelId, message.author.username, content);

await message.channel.sendTyping().catch(() => {});

let response = buildIaInterviewQuickAnswer(message, openerId);

if (!response) {
  try {
    response = await withIaTimeout(
      generateIaInterviewConversation(message, client, openerId),
      9000,
      "IA ENTREVISTA"
    );
  } catch (err) {
    console.error("[IA ENTREVISTA] Falha/timeout ao gerar resposta:", err?.message || err);

response =
  `Boaaa ${buildSafeUserMention(openerId)} 😄 entendi.\n\n` +
  `Antes da entrevista, só reforçando rapidinho: responde tudo com calma, com suas próprias palavras e sem copiar regra/usar IA, fechado?\n\n` +
  `A SantaCreators não é só “grupo de criador de conteúdo”; é uma **empresa de RP estruturada**, com eventos, hierarquia, organização e postura dentro da cidade.\n\n` +
  `Me fala: você quer começar a entrevista ou tirar alguma dúvida antes?`;
  }
}

const finalText =
  limitDiscordText(fixBrokenDiscordMentions(response)) ||
  `Boaaa ${buildSafeUserMention(openerId)} 😄 me explica com suas palavras que eu vou te acompanhando por aqui.`;

await message.reply({
  content: finalText,
  allowedMentions: {
    repliedUser: true,
    users: uniqueDiscordUserIds(openerId, message.author.id),
    roles: [],
    parse: [],
  },
}).catch((err) => {
  console.error("[IA ENTREVISTA] Falha ao responder no ticket:", err?.message || err);
});

  return true;
}

// =====================================================
// SETUP PRINCIPAL
// =====================================================

export function setupIaChatAuto(client) {
  if (
    globalThis.__SC_IA_CHAT_AUTO_BOOTSTRAPPED__
  ) {
    console.log(
      "[IA CHAT AUTO] Bootstrap ignorado."
    );

    return;
  }

  globalThis.__SC_IA_CHAT_AUTO_BOOTSTRAPPED__ =
    true;

  console.log(
    "[IA CHAT AUTO] Sistema iniciado."
  );

  console.log(
    `[IA CHAT AUTO] Modelo: ${GEMINI_MODEL}`
  );

  console.log(
    `[IA CHAT AUTO] Canal: ${AI_CHANNEL_ID}`
  );

  client.on(
    "messageCreate",
    async (message) => {
      try {
const handledIaInterview =
  await handleIaInterviewTicketMessage(message, client);

if (handledIaInterview) {
  return;
}

if (
  shouldIgnoreMessage(
    message,
    client
  )
) {
  return;
}

const canAnswerHere =
  await shouldAnswerInThisChannel(message, client);

if (!canAnswerHere) {
  return;
}

        const content =
          cleanText(message.content);

        rememberMessage(
          message.channelId,
          message.author.username,
          content
        );

        // =====================================================
        // COOLDOWN
        // =====================================================

        const remaining =
          getCooldownRemaining(
            message.author.id
          );

        if (remaining > 0) {
          return;
        }

        setCooldown(message.author.id);

        // =====================================================
        // LOGS
        // =====================================================

        console.log(`
[IA CHAT AUTO]
User: ${message.author.tag}
ID: ${message.author.id}
Canal: ${message.channel?.name}
Mensagem: ${content}
        `);

        // =====================================================
        // DIGITANDO
        // =====================================================

        await message.channel
          .sendTyping()
          .catch(() => {});

       // =====================================================
// RESPOSTA DIRETA DO DISCORD
// =====================================================

const directDiscordAnswer =
  buildDirectDiscordAnswer(message);

let safeIaResponse = directDiscordAnswer;

if (!safeIaResponse) {
  // =====================================================
  // GERAÇÃO IA
  // =====================================================

  const iaResponse =
    await generateIAResponse({
      message,
      client,
    });

  safeIaResponse = iaResponse;
}

if (iaResponseLooksLikePending(safeIaResponse)) {
  console.warn(
    "[IA CHAT AUTO] Resposta pendente bloqueada. Substituindo por fallback direto."
  );

  safeIaResponse = buildFallbackInstantResponse(message);
}

if (iaResponseLooksRepeated(message.channelId, safeIaResponse)) {
  console.warn(
    "[IA CHAT AUTO] Resposta repetida detectada. Substituindo por fallback natural."
  );

  safeIaResponse = buildNonRepeatedFallback(message);
}

const finalText =
  limitDiscordText(
    fixBrokenDiscordMentions(safeIaResponse)
  );

if (!finalText) return;

rememberAiResponse(message.channelId, finalText);

const allowedMentionUsers =
  await buildAllowedMentionUsers(message, client);

        // =====================================================
        // RESPOSTA
        // =====================================================


        // Resposta com menções controladas para segurança
        await sendTemporaryReply(message, {
          content: finalText,
          allowedMentions: {
            repliedUser: true,
            users: allowedMentionUsers,
            roles: [],
            parse: [],
          },
        });

await sendConversationMemoryLog(client, message, finalText);


      } catch (err) {
        console.error(
          "[IA CHAT AUTO] ERRO:",
          err
        );

        // =====================================================
        // MODEL ERROR
        // =====================================================

        if (
          isGeminiModelError(err)
        ) {
          await sendTemporaryReply(message, {
  content:
    "O modelo Gemini configurado não existe ou está inválido.",

  allowedMentions: {
    repliedUser: true,
  },
});

          return;
        }

        // =====================================================
        // QUOTA ERROR
        // =====================================================

        if (
          isGeminiQuotaError(err)
        ) {
          await sendTemporaryReply(message, {
  content:
    "A IA bateu o limite da API agora 😭 tenta novamente daqui a pouco.",

  allowedMentions: {
    repliedUser: true,
  },
});

          return;
        }

        // =====================================================
        // KEY ERROR
        // =====================================================

        if (
          isGeminiKeyError(err)
        ) {
          await sendTemporaryReply(message, {
  content:
    "A chave Gemini parece inválida ou sem permissão.",

  allowedMentions: {
    repliedUser: true,
  },
});

          return;
        }

        // =====================================================
        // ERRO GERAL
        // =====================================================

        await sendTemporaryReply(message, {
  content:
    "Deu um erro interno na IA agora, mas já registrei no console pra verificarem.",

  allowedMentions: {
    repliedUser: true,
  },
});
      }
    }
  );
}