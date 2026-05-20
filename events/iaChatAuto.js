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
// CONSULTAS INTERNAS — SANTACREATORS
// =====================================================

const AI_ALINHAMENTOS_CHANNEL_ID = "1425256185707233301";
const AI_FIVEM_GI_PANEL_CHANNEL_ID = "1501321157259956244";
const AI_GI_DATA_FILE = path.resolve(process.cwd(), "data", "sc_gi_registros.json");

const AI_INTERNAL_SCAN_LIMIT = 80;

// =====================================================
// CONSULTAS INTERNAS — SANTACREATORS
// =====================================================

const AI_ALINHAMENTOS_CHANNEL_ID = "1425256185707233301";
const AI_FIVEM_GI_PANEL_CHANNEL_ID = "1501321157259956244";
const AI_GI_DATA_FILE = path.resolve(process.cwd(), "data", "sc_gi_registros.json");

const AI_INTERNAL_SCAN_LIMIT = 80;

const AI_ALLOWED_CHANNEL_IDS = new Set([
  AI_CHANNEL_ID,
  AI_REPLY_ONLY_CHANNEL_ID,
]);

const AI_REPLY_TTL_MS = 2 * 60 * 1000;

const GEMINI_MODEL =
  process.env.GEMINI_MODEL ||
  "gemini-2.5-flash-lite";

const GEMINI_MODEL_FALLBACKS = [
  GEMINI_MODEL,
  "gemini-2.5-flash",
  "gemini-2.0-flash",
];

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY || "";

const COOLDOWN_MS = 12000;

const MAX_RESPONSE_CHARS = 1900;

const MAX_HISTORY_MESSAGES = 8;

const MAX_MESSAGE_CHARS = 1200;

const cooldowns = new Map();

const channelHistory = new Map();

const lastAiResponses = new Map();

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

  if (sent) {
    setTimeout(async () => {
      try {
        // =========================================
        // APAGA RESPOSTA DA IA
        // =========================================

        await sent.delete().catch(() => {});

        // =========================================
        // APAGA MENSAGEM DO USUÁRIO
        // =========================================

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


async function buildServerIntelligenceContext(message) {
  const blocks = [];
  const text = normalizeSearchText(message.content);

  // 0. Consultas internas fixas da SantaCreators
  if (messageWantsAlinhamentos(message)) {
    console.log("[IA CHAT AUTO] Intenção detectada: Consulta de Alinhamentos.");
    blocks.push(await fetchAlinhamentosContext(message));
  }

  if (messageWantsGIStatus(message)) {
    console.log("[IA CHAT AUTO] Intenção detectada: Consulta de Controle GI.");
    blocks.push(await fetchGIStatusContext(message));
  }

  // 1. Prioridade: Canais mencionados/Links
  const hasChannelReference =
    message.mentions.channels.size > 0 ||
    extractDiscordIdsFromText(message.content).length > 0 ||
    text.includes("channels/");

  if (hasChannelReference) {
    console.log("[IA CHAT AUTO] Detectada menção/link de canal. Buscando conteúdo...");
    blocks.push(await fetchMentionedChannelsContext(message));
  }

  // 2. Cronograma
  if (messageWantsCronograma(message)) {
    console.log("[IA CHAT AUTO] Intenção detectada: Cronograma.");
    blocks.push(await fetchCronogramaContext(message));
  }

  // 3. Hierarquia RP
  if (messageWantsRoles(message)) {
    console.log("[IA CHAT AUTO] Intenção detectada: Hierarquia RP.");
    blocks.push(await fetchHierarquiaContext(message));
  }

  // 4. Cargos do Discord (Técnico)
  if (messageWantsDiscordRoles(message)) {
    console.log("[IA CHAT AUTO] Intenção detectada: Cargos do Discord.");
    blocks.push(buildRolesHierarchyContext(message));
  }

  if (messageWantsChannels(message)) {
    console.log("[IA CHAT AUTO] Intenção detectada: Listagem de Canais.");
    blocks.push(buildChannelsContext(message));
  }

  if (!blocks.length) return "Nenhuma busca externa adicional foi necessária.";

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
        context.push(`RESPONDENDO MENSAGEM:
Autor: ${replied.author.username}
Conteúdo: ${cleanText(replied.content)}`);
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
}) {
  return `
${SANTACREATORS_CONTEXT}

HISTÓRICO:
${history}

CONTEXTO DISCORD:
${discordContext}

CONHECIMENTO GERAL DO SERVIDOR:
${guildKnowledge}

MEMÓRIA REGISTRADA EM CANAL DE LOG:
${memoryLogs}

INFORMAÇÕES REAIS BUSCADAS NO SERVIDOR:
${serverIntelligence}

REGRAS OBRIGATÓRIAS:
1. Se você recebeu dados reais no prompt (como cronograma ou histórico), use-os IMEDIATAMENTE.
2. NUNCA diga "vou olhar", "vou ver", "deixa eu ver", "deixa eu dar uma olhada", "vou verificar", "já volto", "aguenta aí", "pera aí" ou "só um minuto". Você precisa responder com o que já tem no prompt. Se não tiver dados suficientes, diga claramente que não encontrou.
3. Se o usuário marcou um canal, foque no conteúdo lido desse canal, não no canal atual.
4. Use sempre menções no formato <#ID> para canais e <@&ID> para cargos.
5. Não invente regras, cargos ou eventos. Se não encontrou no servidor, diga que não encontrou.
6. Se perguntarem algo administrativo sensível (permissões, cargos altos, bans), oriente a chamar um Responsável.
7. Se receber "CONSULTA INTERNA — ALINHAMENTOS", responda com base nos registros encontrados: quem foi alinhado, quem alinhou, sobre o quê, status, data e link.
8. Se receber "CONSULTA INTERNA — CONTROLE GI", responda com base nos registros ativos/pausados, responsável, área, datas e observações.
9. Nunca diga que "aprendeu" sem dados reais. Diga que encontrou ou não encontrou nas consultas internas.

COMPORTAMENTO:
Responda de forma natural, informal e útil (vibe de Discord/RP). Seja conciso.

REGRAS IMPORTANTES PARA RESPOSTA:
- Se o usuário pedir cronograma e ele estiver nas informações reais, entregue o cronograma diretamente.
- Se o usuário mandar um canal, ID de canal ou link de canal, use o conteúdo real lido desse canal.
- Nunca confunda o canal atual com o canal mencionado.
- Nunca diga "vou olhar", "já volto", "só um minuto" ou "vou verificar" se você já recebeu as informações no prompt.
- Se não encontrar algo, diga claramente que não encontrou.
- Quando citar canal, use o formato <#ID>.
- Quando citar cargo, use o formato <@&ID>.
- Não invente cargo, canal, evento ou hierarquia.
- Se a hierarquia pedida for de RP/CDD e existir um canal lido sobre isso, use o conteúdo do canal, não a hierarquia de cargos do Discord.
- Entenda menções.
- Entenda IDs.
- Entenda replies.
- Entenda cargos.
- Entenda links.
- Entenda canais.
- Entenda contexto social.
- Responda como alguém da SantaCreators.
- Entenda gírias comuns do Discord e RP/FiveM.
- Se o usuário disser "oi", responda de forma natural, curta e simpática.
- Se o usuário disser "como assim", explique melhor sem agir como se tivesse perdido o contexto.
- Se o usuário marcar alguém, entenda que ele está falando sobre aquela pessoa.
- Se a pergunta for simples, responda simples.
- Se a pergunta for complexa, organize a resposta.
- Não repita a mesma resposta anterior.
- Se o usuário só estiver testando, diga apenas que está funcionando e peça um teste real.
- Não responda toda mensagem como se fosse apresentação inicial.
- Não fique perguntando "em que posso ajudar" toda hora se o usuário já explicou o contexto.
Agora responda naturalmente:
`;
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

  const serverIntelligence =
    await buildServerIntelligenceContext(message);

const memoryLogs =
  await fetchRecentMemoryLogs(client);

const prompt =
    buildPrompt({
      discordContext,
      history,
      serverIntelligence,
      guildKnowledge,
      memoryLogs,
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
    safeIaResponse
  );

if (!finalText) return;

rememberAiResponse(message.channelId, finalText);

        // =====================================================
        // RESPOSTA
        // =====================================================

                await sendTemporaryReply(message, {
  content: finalText,
  allowedMentions: {
    repliedUser: true,
    parse: [],
    users: [],
    roles: [],
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