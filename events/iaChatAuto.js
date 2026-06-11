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

function buildIaInterviewConversationPrompt({
  message,
  history,
  knowledge,
  openerId,
  hasStartButton,
  openerIsStaff,
}) {
  return `
Você é a IA de pré-atendimento da SantaCreators dentro de um ticket de entrevista.

CANDIDATO / PESSOA QUE ABRIU O TICKET:
${buildSafeUserMention(openerId)}

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

TAMANHO DA RESPOSTA:
- Máximo 3 linhas curtas.
- Se for só "oi/eai", responda curto e puxe uma pergunta simples.
- Não mande lista grande sem necessidade.

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

  const prompt = buildIaInterviewConversationPrompt({
    message,
    history,
    knowledge,
    openerId,
    hasStartButton,
    openerIsStaff,
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

function buildIaInterviewQuickAnswer(message, openerId) {
  const text = normalizeSearchText(message.content);
  const mention = buildSafeUserMention(openerId);

  if (isShortGreeting(message.content)) {
    return `E aí ${mention} 😄 tudo certinho? Quer tirar uma dúvida ou falar sobre a entrevista?`;
  }

  if (
    text.includes("como funciona") ||
    text.includes("queria fazer a entrevista") ||
    text.includes("fazer entrevista") ||
    text.includes("começo") ||
    text.includes("comeco") ||
    text.includes("começar") ||
    text.includes("comecar") ||
    text.includes("alguem ai") ||
    text.includes("alguém ai")
  ) {
    return (
      `Boaa ${mention} 😄 pra começar certinho, alguém da equipe precisa iniciar a entrevista por aqui.\n\n` +
      `Enquanto isso, já vai na calma: responde tudo com tuas palavras, sem copiar regra e sem usar IA, fechado?`
    );
  }

  return null;
}
export async function handleIaInterviewTicketMessage(message, client) {
  if (!message.guild || message.author.bot) return false;
  if (!isIaInterviewChannel(message.channel)) return false;

  const openerId = await resolveIaInterviewOpenerId(message);

  if (!openerId) return false;

  const member = message.member;
  const isOpener = String(message.author.id) === String(openerId);
  const isStaff = memberIsIaInterviewStaff(member);

  const state = IA_ENTREVISTA_ACTIVE.get(message.channelId) || {
    openerId,
    startedAt: Date.now(),
    active: true,
    pausedByStaff: false,
  };

  if (!IA_ENTREVISTA_ACTIVE.has(message.channelId)) {
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