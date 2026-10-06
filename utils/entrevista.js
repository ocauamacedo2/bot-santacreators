import fs from 'fs';
import path from 'path';
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder
} from 'discord.js';

import { dashEmit } from './dashHub.js';

import {
  iaInterviewMarkInterviewFinished,
  iaInterviewPauseForManualInterview
} from '../events/iaChatAuto.js';

import {
  startInterviewIntelligence,
  recordInterviewQuestion,
  recordInterviewAnswer,
  finishInterviewIntelligence,
  abortInterviewIntelligence,
  canOverrideInterviewAttemptLimit,
  getInterviewAttemptStatus,
  invalidateInterviewAttemptStatus
} from '../events/interviewIntelligence.js';
// ===== CONFIG =====

// ===== CONFIG =====
const ENTREVISTA_DURACAO_MIN = 180;
const ENTREVISTA_DURACAO_MS = ENTREVISTA_DURACAO_MIN * 60 * 1000;

const CANAL_LOG_COMPLETO = '1486084393716941031';
const LOG_CHANNEL_ID_NOVO = "1486084249755979950";
const CANAL_AVALIACAO_ENTREVISTA = "1486084237772718120";
const ENTREVISTA_POINT_LOG_MARKER = "SC_ENTREVISTA_POINT_V1";

const ALERT_ROLE_IDS = [
  "1282119104576098314", // mkt creators
  "1352407252216184833", // resp lider
  "1262262852949905409", // resp influ
  "1388976314253312100", // coord creators
  "1388975939161161728", // gestor creators
];

// ===== STORAGE PERSISTENTE DA ENTREVISTA =====
function pickEntrevistaPersistRoot() {
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

  return path.resolve(process.cwd(), "storage");
}

const ENTREVISTAS_DIR = pickEntrevistaPersistRoot();
const ENTREVISTAS_PATH = path.join(
  ENTREVISTAS_DIR,
  "entrevistas_backup.json"
);

const ENTREVISTAS_LEGACY_PATH = path.resolve(
  process.cwd(),
  "storage",
  "entrevistas_backup.json"
);

const PERGUNTAS_ALLOWED_CATEGORY_IDS = new Set([
  "1359244725781266492",
]);

const PERGUNTAS_BYPASS_USER_IDS = new Set([
  "660311795327828008", // você
  "1262262852949905408", // owner
]);


// estado em memória
const entrevistas = new Map();       // userId -> dados
const entrevistasAtivas = new Set(); // channelId
const entrevistasStartLocks = new Set(); // channelId -> trava curta anti clique/duplicidade

// ===== PERGUNTAS =====
const perguntas = [
  `📋 **Entrevista Pré-Admissão – SantaCreators**
---
🔹 **Regras Internas e Postura na Empresa**

Qual o seu nome completo e, se tiver, como você costuma ser chamado dentro do RP?`,

  'Sua idade?',

  'Como você conheceu a SantaCreators? O que te chamou atenção na empresa e te motivou a querer fazer parte dela?',

  'Durante o RP, qual deve ser sua postura ao interagir com uma pessoa que utiliza preset e nome feminino, mesmo que você perceba diferenças entre o visual do personagem e a voz do jogador?',

  'Você sabe qual é a importância do uso da jaqueta ou peças da SantaCreators ao entrar no prédio e ao circular nas redondezas? Por que isso é obrigatório?',

  'Ao utilizar a garagem da empresa, qual deve ser sua conduta em relação ao uniforme? E por que isso é exigido?',

  'O que você faria se visse um membro utilizando um veículo que você sabe que é da empresa para participar de uma troca de tiro ou assalto de pista?',

  'Em que situação o uso dos veículos da empresa é permitido para ações ilegais no RP? Quais cuidados devem ser tomados nesses casos?',

  'Quantos baús existem dentro do prédio da SantaCreators e qual deles é proibido de ser mexido de forma alguma? E por quê?',

  `🎭 **Imersão e Comportamento no RP**

Se você presenciar um membro da empresa utilizando expressões ou referências do mundo de fora (vida real) sem qualquer contexto válido, quebrando a imersão, como você abordaria a situação?`,

  'Caso veja algum membro da empresa nas proximidades usando comandos de F8 para sentar no ar, flutuar ou realizar ações que claramente quebram a física do RP, ou até mesmo abusando de poderes, como você reagiria e o que você faria diante dessas situações?',

  'Se durante o RP um jogador disser algo como "minha internet caiu" ou "precisei sair do Discord", como você orientaria essa pessoa a se manter na imersão? Dê um exemplo de como reformular a frase.',

  `🧠 **Postura e Responsabilidade**

Como você lidaria com um membro novo que claramente não conhece as regras da empresa e está agindo de forma que compromete a imagem da SantaCreators?`,

  'Imagine que você esteja em um evento da SantaCreators representando a empresa, e um imprevisto ocorre (por exemplo, uma confusão no local ou alguém quebrando a imersão). Qual seria sua postura?',

  'Na sua visão, quais atitudes e comportamentos são essenciais para que um membro da SantaCreators evolua na hierarquia e conquiste promoções dentro da empresa?',

  'Quais atitudes caracterizam abuso de poder dentro do RP e como você deve agir em casos de anti-rp contra você?',

  `🏢 **Funcionamento da Empresa e Hierarquia**

Por que é importante respeitar a hierarquia dentro da empresa, mesmo que em alguns momentos você tenha mais experiência do que alguém de cargo superior?`,

  'Em quais situações o uso de poderes é permitido e qual é o objetivo principal desse uso dentro da SantaCreators?',

  'A call é obrigatória para todos na SantaCreators? Em quais casos ela passa a ser necessária e por quê?',

  `🚀 **Pergunta Bônus**

Como o comprometimento diário (registro, bate ponto e organização) influencia sua evolução dentro da SantaCreators?`,

  'Qual é a função do Baú Creators?',

  'O que é MetaGame no RP?',

  'O que é considerada Má Conduta?',

  'O que é Quebra de Imersão?',

  'Em que situações o uso de NOCLIP/NC é considerado abuso e qual é a alternativa correta?',

  'Se você for preso pela polícia e tiver seus itens apreendidos, mas depois conseguir fugir e tiver acesso aos comandos kitinf e kitinflu, o que você faria nessa situação?',

  'Se acontecesse algum problema grave, como quebra de imersão, falta de respeito ou atitude totalmente contra a cultura da empresa, você chamaria um staff? Por quê? E o que esperaria que acontecesse depois?',

  'Qual deve ser sua conduta ao trocar de roupa dentro da empresa ou nos arredores do prédio?',

  'Se você é um membro novo e tem uma dúvida, mas vê por perto alguém da coordenação e também um responsável, pra quem você recorre primeiro? E por quê?',

  'Se um dia você decidir sair do projeto (painel da SantaCreators), como você comunicaria sua saída da forma certa e respeitosa?'
];
// ===== BACKUP =====
let entrevistaSaveQueue = Promise.resolve();

function salvarEntrevistasEmDisco() {
  const snapshot = {};
  for (const [id, state] of entrevistas) {
    snapshot[id] = {
      respostas: state.respostas || [], index: state.index || 0,
      timeoutEnd: state.timeoutEnd, mensagens: state.mensagens || [],
      entrevistadorId: state.entrevistadorId || null, channelId: state.channelId || null,
    };
  }
  const payload = JSON.stringify(snapshot, null, 2);
  const write = entrevistaSaveQueue.then(async () => {
    await fs.promises.mkdir(path.dirname(ENTREVISTAS_PATH), { recursive: true });
    const temp = `${ENTREVISTAS_PATH}.tmp`;
    await fs.promises.writeFile(temp, payload, 'utf8');
    await fs.promises.rename(temp, ENTREVISTAS_PATH);
  });
  entrevistaSaveQueue = write.catch((error) => {
    console.error('[Entrevista] Falha ao salvar backup:', error);
  });
  return entrevistaSaveQueue;
}
function carregarEntrevistasDoDisco() {
  try {
    let arquivoLeitura = ENTREVISTAS_PATH;

    // Se ainda não existir no storage persistente,
    // tenta recuperar o arquivo antigo usado pelo sistema.
    if (
      !fs.existsSync(arquivoLeitura) &&
      fs.existsSync(ENTREVISTAS_LEGACY_PATH)
    ) {
      arquivoLeitura = ENTREVISTAS_LEGACY_PATH;

      console.log(
        `[Entrevista] Backup legado encontrado em ${arquivoLeitura}. ` +
        `Ele será migrado para o storage persistente.`
      );
    }

    if (!fs.existsSync(arquivoLeitura)) {
      console.log(
        `[Entrevista] Arquivo de backup não encontrado em ` +
        `${ENTREVISTAS_PATH}. Nenhuma entrevista para carregar.`
      );

      return;
    }

    const bruto = JSON.parse(
      fs.readFileSync(arquivoLeitura, 'utf8')
    );

    let count = 0;

    for (const id in bruto) {
      entrevistas.set(id, {
        respostas: bruto[id].respostas || [],
        index: bruto[id].index || 0,
        timeoutEnd: bruto[id].timeoutEnd,
        mensagens: bruto[id].mensagens || [],
        entrevistadorId: bruto[id].entrevistadorId || null,
        channelId: bruto[id].channelId || null,
        lastSent: 0,
        globalTimer: null
      });

      count++;
    }

    if (count > 0) {
      console.log(
        `[Entrevista] Carregadas ${count} entrevista(s) do backup: ` +
        `${arquivoLeitura}`
      );
    }

    // Migra automaticamente o backup antigo para o storage persistente.
    if (arquivoLeitura !== ENTREVISTAS_PATH) {
      const dir = path.dirname(ENTREVISTAS_PATH);

      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(
        ENTREVISTAS_PATH,
        JSON.stringify(bruto, null, 2),
        'utf8'
      );

      console.log(
        `[Entrevista] Backup migrado para: ${ENTREVISTAS_PATH}`
      );
    }

  } catch (e) {
    console.warn('Falha ao carregar entrevistas:', e);
  }
}

carregarEntrevistasDoDisco();

// Hooks de saída (mantidos como sync para garantir o salvamento no encerramento do processo)
process.on('exit', () => {
  try {
    const dir = path.dirname(ENTREVISTAS_PATH);

    if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}
    const dados = Object.fromEntries([...entrevistas].map(([id, state]) => [id, {
      respostas: state.respostas || [], index: state.index || 0,
      timeoutEnd: state.timeoutEnd, mensagens: state.mensagens || [],
      entrevistadorId: state.entrevistadorId || null, channelId: state.channelId || null,
    }]));
 fs.writeFileSync(
ENTREVISTAS_PATH,
      JSON.stringify(dados, null, 2),
      'utf8'
    );

  } catch (e) {
    console.warn(
      '[Entrevista] Falha ao salvar backup no encerramento:',
      e
    );
  }
});

// Estes hooks ajudam a salvar em caso de desligamento normal, mas não em caso de crash.
// Por isso, chamamos salvarEntrevistasEmDisco() sempre que o estado muda.
process.on('SIGINT', () => { process.exit(); });
process.on('SIGTERM', () => { process.exit(); });

// ===== HELPERS =====
function msgLink(guildId, channelId, messageId) {
  if (!guildId || !channelId || !messageId) return '—';
  return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}

let __logCompletoChannelCache = null;
let __logCompletoChannelCacheAt = 0;
const LOG_COMPLETO_CACHE_TTL_MS = 60_000;

async function getLogCompletoChannel(client) {
  const now = Date.now();

  if (
    __logCompletoChannelCache &&
    (now - __logCompletoChannelCacheAt) < LOG_COMPLETO_CACHE_TTL_MS
  ) {
    return __logCompletoChannelCache;
  }

  const canal = await client.channels.fetch(CANAL_LOG_COMPLETO).catch(() => null);
  if (canal?.isTextBased?.()) {
    __logCompletoChannelCache = canal;
    __logCompletoChannelCacheAt = now;
    return canal;
  }

  return null;
}

async function logCompleto(client, data) {
  const canal = await getLogCompletoChannel(client);
  if (!canal || !canal.isTextBased?.()) return;

  const emb = new EmbedBuilder()
    .setTitle(data.titulo || '📌 Log')
    .setColor(data.cor ?? 0x3498db)
    .setTimestamp();

  if (data.autorTag) {
    emb.setAuthor({ name: data.autorTag, iconURL: data.autorIcon || undefined });
  }
  if (data.thumb) emb.setThumbnail(data.thumb);
  if (data.desc) emb.setDescription(data.desc);
  if (data.fields?.length) emb.addFields(data.fields);

  await canal.send({ embeds: [emb], components: data.components || [] }).catch(() => {});
}
// ===== REANEXAR =====
const interviewLifecycleClients = new WeakSet();
function installInterviewLifecycle(client) {
  if (interviewLifecycleClients.has(client)) return;
  interviewLifecycleClients.add(client);
  const stop = (channel) => {
    if (![...entrevistas.values()].some((state) => String(state.channelId) === String(channel.id))) return;
    void resetInterviewChannelState(channel, 'canal apagado/movido').catch(console.error);
    void abortInterviewIntelligence({ client, channel, candidateId: null,
      reason: 'canal apagado/movido antes do fim' }).catch(console.error);
  };
  client.on('channelDelete', stop);
  client.on('channelUpdate', (oldChannel, newChannel) => {
    if (String(oldChannel.parentId) === '1359244725781266492' &&
        String(newChannel.parentId) !== '1359244725781266492') stop(newChannel);
  });
}
async function reanexar(client) {
  installInterviewLifecycle(client);
 if (entrevistas.size === 0) {
 console.log('[Entrevista] Nenhuma entrevista pendente para reanexar.');
    return;
  }
  console.log(`[Entrevista] Verificando ${entrevistas.size} entrevista(s) para reanexar...`);
  for (const [userId, dados] of entrevistas.entries()) {
    try {
      const restante = dados.timeoutEnd - Date.now();
      if (restante <= 0 || !dados.channelId) {
        entrevistas.delete(userId);
        await salvarEntrevistasEmDisco();
        continue;
      }

      // ✅ Se a entrevista já está no set de ativas, é porque o processo atual já a está controlando.
      // Isso evita que uma reconexão rápida do bot (que dispara 'ready' de novo) duplique a entrevista.
      if (entrevistasAtivas.has(dados.channelId)) {
        console.log(`[Entrevista] Pulando reanexação para o canal ${dados.channelId} pois já está ativo no processo atual.`);
        continue;
 }
 const channel = await client.channels.fetch(dados.channelId).catch(() => null);
      if (!channel || !channel.isTextBased?.() ||
          String(channel.parentId) !== '1359244725781266492' ||
          /\bentrevista_encerrando:1\b/.test(String(channel.topic || ''))) {
 entrevistas.delete(userId);
 await salvarEntrevistasEmDisco();
        continue;
      }

      const membro = await channel.guild.members.fetch(userId).catch(() => null);
      if (!membro) {
        entrevistas.delete(userId);
        await salvarEntrevistasEmDisco();
        continue;
      }

      entrevistasAtivas.add(channel.id);

      const globalTimer =
        await iniciarContadorGlobal(
          channel,
          userId,
          restante
        );

      dados.globalTimer =
        globalTimer;

      entrevistas.set(
        userId,
        dados
      );

      await salvarEntrevistasEmDisco();

      await startInterviewIntelligence({
        client,

        channel,

        candidate:
          membro,

        interviewerId:
          getAplicadorIdFromChannel(channel) ||
          dados.entrevistadorId ||
          null,

        questions:
          perguntas,

        resume:
          true,

        answeredCount:
          dados.index || 0

      }).catch((error) => {
        console.warn(
          '[INTERVIEW_INTELLIGENCE] Falha não crítica ao reanexar telemetria:',
          error?.message || error
);
 });
      // Preserva perguntas e respostas para reconstrução e auditoria.
      // enviarPergunta reutiliza a pergunta pendente quando possível.
 console.log(
 `[Entrevista] Reanexando entrevista para ${membro.user.tag} ` +
        `no canal #${channel.name}. Próxima pergunta: ${dados.index + 1}`
      );

      // Reativa a pergunta imediatamente.
      // NÃO usamos await porque enviarPergunta fica aguardando
      // a resposta do candidato.
      enviarPergunta(channel, membro, dados.index).catch(async (e) => {
        console.warn(
          '[Entrevista] Falha ao retomar pergunta:',
          userId,
          e
        );

        entrevistasAtivas.delete(channel.id);

        await salvarEntrevistasEmDisco().catch(() => {});
      });

      // O log não deve bloquear a retomada da entrevista.
      logCompleto(client, {
        titulo: '🔄 Entrevista reanexada',
        cor: 0xf1c40f,
        autorTag: membro.user.tag,
        autorIcon: membro.user.displayAvatarURL({ dynamic: true }),
        desc: `O bot voltou e reanexou a entrevista em andamento.`,
        fields: [
          {
            name: '👤 Entrevistado',
            value: `<@${userId}>`,
            inline: true
          },
          {
            name: '📍 Canal',
            value: `<#${channel.id}>`,
            inline: true
          },
          {
            name: '⏳ Restante',
            value: `${Math.ceil(restante / 60000)} min`,
            inline: true
          }
        ]
      }).catch((e) => {
        console.warn(
          '[Entrevista] Falha ao registrar log de reanexação:',
          e
        );
      });
    } catch (e) {
      console.warn('Falha ao reanexar:', userId, e);
    }
  }
}

function getAplicadorIdFromChannel(channel, dados = {}) {
  const topic = String(channel?.topic || "");
  const m = topic.match(/entrevista_aplicador:(\d{17,20})/i);

  // ✅ SEMPRE prioridade absoluta pro !perguntas
  if (m) return m[1];

  // ❌ NÃO usa mais fallback do state
  return null;
}

function getStarterIdFromChannel(channel) {
  const topic = String(channel?.topic || "");
  const m = topic.match(/entrevista_starter:(\d{17,20})/i);
  if (m) return m[1];
  return null;
}

async function setInterviewActiveTopic(channel, active) {
  try {
    if (!channel || typeof channel.setTopic !== "function") return;

    const oldTopic = String(channel.topic || "");
    const cleanedTopic = oldTopic
      .replace(/\bentrevista_ativa:[01]\b/gi, "")
      .replace(/\s*\|\s*\|\s*/g, " | ")
      .replace(/\s{2,}/g, " ")
      .trim();

    const nextTopic = active
      ? `${cleanedTopic}${cleanedTopic ? " | " : ""}entrevista_ativa:1`
      : cleanedTopic;

    await channel.setTopic(nextTopic.slice(0, 1024)).catch(() => {});
  } catch {}
}

async function clearGhostInterviewIfNeeded(channel, targetId, reason = "unknown") {
  const channelId = String(channel?.id || "");
  const target = String(targetId || "");

  let cleaned = false;

  for (const [userId, dados] of entrevistas.entries()) {
    const sameChannel = String(dados?.channelId || "") === channelId;
    const sameTarget = !target || String(userId) === target;
    const hasNoQuestions = !Array.isArray(dados?.mensagens) || dados.mensagens.length === 0;
    const isAtStart = Number(dados?.index || 0) === 0;
    const hasNoAnswers = !Array.isArray(dados?.respostas) || dados.respostas.length === 0;

    if (sameChannel && sameTarget && hasNoQuestions && isAtStart && hasNoAnswers) {
      console.warn(`[Entrevista] Limpando entrevista fantasma no canal ${channelId}. Motivo: ${reason}`);
      entrevistas.delete(userId);
      cleaned = true;
    }
  }

  if (cleaned) {
    entrevistasAtivas.delete(channelId);
    entrevistasStartLocks.delete(channelId);
    await setInterviewActiveTopic(channel, false);
    await salvarEntrevistasEmDisco();
  }

  return cleaned;
}

async function channelHasRealInterviewQuestion(channel, targetId) {
  const target = String(targetId || "");

  const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);

  if (!messages?.size) return false;

  return messages.some((msg) => {
    if (!msg.author?.bot) return false;

    const content = String(msg.content || "");

    return (
      content.includes(`**1.** <@${target}>`) ||
      content.includes(`**2.** <@${target}>`) ||
      content.includes(`**3.** <@${target}>`) ||
      content.includes(`**4.** <@${target}>`) ||
      content.includes(`**5.** <@${target}>`) ||
      content.includes(`**6.** <@${target}>`) ||
      content.includes(`**7.** <@${target}>`) ||
      content.includes(`**8.** <@${target}>`) ||
      content.includes(`**9.** <@${target}>`) ||
      content.includes(`**10.** <@${target}>`) ||
      content.includes(`**11.** <@${target}>`) ||
      content.includes(`**12.** <@${target}>`) ||
      content.includes(`**13.** <@${target}>`) ||
      content.includes(`**14.** <@${target}>`) ||
      content.includes(`**15.** <@${target}>`) ||
      content.includes(`**16.** <@${target}>`) ||
      content.includes(`**17.** <@${target}>`) ||
      content.includes(`**18.** <@${target}>`) ||
      content.includes(`**19.** <@${target}>`) ||
      content.includes(`**20.** <@${target}>`) ||
      content.includes(`**21.** <@${target}>`) ||
      content.includes(`**22.** <@${target}>`) ||
      content.includes(`**23.** <@${target}>`) ||
      content.includes(`**24.** <@${target}>`) ||
      content.includes(`**25.** <@${target}>`) ||
      content.includes(`**26.** <@${target}>`) ||
      content.includes(`**27.** <@${target}>`) ||
      content.includes(`**28.** <@${target}>`) ||
      content.includes(`**29.** <@${target}>`) ||
      content.includes(`**30.** <@${target}>`)
    );
  });
}

function canInterviewPointCount(channel, aplicadorId) {
  const categoryId = String(channel?.parentId || "");
  if (PERGUNTAS_ALLOWED_CATEGORY_IDS.has(categoryId)) return true;
  if (PERGUNTAS_BYPASS_USER_IDS.has(String(aplicadorId || ""))) return true;
  return false;
}

function withTimeout(promise, ms, label = "operação") {
 return Promise.race([
 Promise.resolve(promise),
 new Promise((_, reject) =>
 setTimeout(() => reject(new Error(`${label} demorou mais de ${ms}ms`)), ms)
)
  ]);
}

// ===== BOTÕES =====
async function handleButtons(interaction) {
  if (!interaction.isButton()) return false;

  const { customId, channel, guild } = interaction;

  // RESULTADO
  if (customId.startsWith('aprovar|') || customId.startsWith('reprovar|') || customId.startsWith('alinhar|')) {
    await interaction.deferReply({ flags: 64 });

    const [acao, userId, starterId] = customId.split('|');
    const membro = await guild.members.fetch(userId).catch(() => null);
    if (!membro) return interaction.editReply('❌ Membro não encontrado.');
    
    const cargos = {
      aprovar: '1353835229755998290',
      reprovar: '1353835208322842685',
      alinhar: '1382201667335880704'
    };
    const mensagens = {
      aprovar: '🎉 Você foi **aprovado(a)** na entrevista! Parabéns e seja bem-vindo(a) à SantaCreators.',
      reprovar: '😕 Sua entrevista foi analisada e você **não foi aprovado(a)** desta vez.',
      alinhar: '⚠️ Sua entrevista está em processo de **alinhamento**. Em breve você receberá orientações!'
    };

    await membro.roles.add(cargos[acao]).catch(() => {});

    const embed = new EmbedBuilder()
      .setTitle('📋 Resultado da Entrevista')
      .setDescription(mensagens[acao])
      .setThumbnail(guild.iconURL({ dynamic: true }))
      .setFooter({ text: `Entrevista avaliada por ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
      .setTimestamp();

    await membro.send({ content: `📢 Olá, <@${membro.id}>! Aqui está o resultado da sua entrevista:`, embeds: [embed] }).catch(() => {});
    await interaction.editReply(`✅ ${membro.user.username} foi marcado como **${acao.toUpperCase()}** por <@${interaction.user.id}>.`);
    await interaction.message.edit({ content: `✅ Ação realizada: **${acao.toUpperCase()}** para <@${membro.id}> por <@${interaction.user.id}>.`, components: [] }).catch(() => {});
    await channel.send(`📌 <@${membro.id}> foi **${acao === 'aprovar' ? 'aprovado(a)' : acao === 'reprovar' ? 'reprovado(a)' : 'colocado(a) em alinhamento'}** por <@${interaction.user.id}>.`).catch(() => {});

    // ✅ NÃO pontua aqui.
    // ✅ NÃO emite dashEmit aqui.
    // ✅ O ponto continua existindo somente na finalização real da entrevista,
    // dentro de enviarPergunta() quando index >= perguntas.length.

    await logCompleto(interaction.client, {
      titulo: `✅ Resultado aplicado: ${acao.toUpperCase()}`,
      cor: acao === 'aprovar' ? 0x2ecc71 : acao === 'reprovar' ? 0xe74c3c : 0x95a5a6,
      autorTag: interaction.user.tag,
      autorIcon: interaction.user.displayAvatarURL({ dynamic: true }),
      desc: 'Resultado aplicado na entrevista.',
      fields: [
        { name: '👤 Entrevistado', value: `<@${membro.id}>\n\`${membro.id}\``, inline: true },
        { name: '🧑‍⚖️ Avaliador', value: `<@${interaction.user.id}>\n\`${interaction.user.id}\``, inline: true },
        { name: '📍 Canal', value: `<#${channel.id}>`, inline: true },
        { name: '🔗 Mensagem', value: msgLink(interaction.guildId, interaction.channelId, interaction.message.id), inline: false }
      ]
    });

    return true;
  }

 // INICIAR (manda mensagem completa + botão ENVIAR)
if (customId.startsWith('iniciar|')) {
  const [, channelId] = customId.split('|');

  // Confirma o clique imediatamente para o Discord.
  // Nenhuma consulta pesada acontece antes dessa confirmação.
  await interaction.deferUpdate().catch(() => {});

  const topic =
    String(
      interaction.channel
        ?.topic ||
      ""
    );

  const mOpener =
    topic.match(
      /aberto_por:(\d{17,20})/i
    );

  const targetId =
    mOpener
      ? mOpener[1]
      : interaction.user.id;

  const authorizedOverride =
    canOverrideInterviewAttemptLimit(
      interaction.member
    );

  // Pré-aquece a consulta das tentativas em background.
  // Ela NÃO segura mais o envio da mensagem de boas-vindas.
  // A validação obrigatória continua existindo no botão
  // "ENVIAR PERGUNTAS", antes da primeira questão.
  if (
    !authorizedOverride
  ) {
    void getInterviewAttemptStatus(
      interaction.client,
      targetId
    ).catch((error) => {
      console.warn(
        '[Entrevista] Falha não crítica ao pré-carregar tentativas:',
        error?.message || error
      );
    });
  }

  iaInterviewPauseForManualInterview(
    interaction.channel,
    targetId,
    interaction.user.id
  );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`enviar|${targetId}|${channelId}`)
      .setLabel('📩 ENVIAR PERGUNTAS')
      .setStyle(ButtonStyle.Primary)
  );

  // A resposta visual do clique vem primeiro.
  // Não esperamos fetch de membro, histórico de 30 dias,
  // cargo, tópico ou log antes de enviar esta mensagem.
  const enviada = await interaction.channel.send({
    content: `✨ Oii, <@${targetId}> Tudo bem por aí? Seja **MUITO** bem-vind@ à família **SantaCreators**!  \nÉ um prazer ter você por aqui — e pode ficar tranquil@, porque a <@&1352275728476930099> vai te acompanhar nessa primeira etapa com todo o cuidado. 💖\n\n📝 Nosso processo de entrada é dividido em **duas fases bem tranquilas**:\n\n➊ **Aqui pelo Discord/e-mail**, a gente vai trocar uma ideia pra entender melhor o seu perfil e ver como você se sairia em algumas situações dentro da nossa estrutura.\n\n➋ **Depois, dentro da cidade**, vamos te apresentar nosso prédio, explicar direitinho as regras e mostrar na prática como funcionamos por aqui.\n\n📚 **Agora bora dar uma lida nas regras?**\nhttps://discord.com/channels/1262262852782129183/1352285379302002710\nhttps://discord.com/channels/1262262852782129183/1355622493464821892\nhttps://discord.com/channels/1262262852782129183/1370830395637239928\nhttps://discord.com/channels/1262262852782129183/1381704800608981003\n\n⚠️ **IMPORTANTE SOBRE A ENTREVISTA**\nDurante a entrevista **não é permitido utilizar Inteligência Artificial** e **nem copiar e colar**. Responda **com suas próprias palavras**.\n\n✅ Assim que estiver tudo certinho por aí, me avisa aqui mesmo pra gente **começar a sua entrevista**, combinado?\n\n🚀 **Bora começar essa jornada juntos!** 🌟`,
    components: [row]
  });

  // Tudo que não precisa bloquear a experiência do usuário
  // continua em background.
  (async () => {
    await interaction.message
      .edit({
        components: []
      })
      .catch(() => {});

    const cargoEntrevista =
      interaction.guild.roles.cache.get(
        '1353797415488196770'
      );

    const membro =
      interaction.guild.members.cache.get(
        targetId
      ) ||
      await interaction.guild.members
        .fetch(
          targetId
        )
        .catch(
          () => null
        );

    try {
      const oldTopic =
        String(
          interaction.channel.topic ||
          ""
        );

      const cleanedTopic =
        oldTopic
          .replace(
            /\bentrevista_starter:\d{17,20}\b/gi,
            ""
          )
          .replace(
            /\s{2,}/g,
            " "
          )
          .trim();

      const nextTopic =
        `${cleanedTopic}${cleanedTopic ? " | " : ""}entrevista_starter:${interaction.user.id}`
          .slice(
            0,
            1024
          );

      await Promise.allSettled([
        typeof interaction.channel.setTopic === "function"
          ? interaction.channel.setTopic(
              nextTopic
            )
          : Promise.resolve(),

        membro &&
        cargoEntrevista &&
        !membro.roles.cache.has(
          cargoEntrevista.id
        )
          ? membro.roles.add(
              cargoEntrevista.id
            )
          : Promise.resolve()
      ]);
    } catch (e) {
      console.warn(
        "[Entrevista] Falha ao configurar starter/cargo:",
        e?.message || e
      );
    }

    await logCompleto(
      interaction.client,
      {
        titulo:
          '🚪 Botão: Iniciar Entrevista',
        cor:
          0x1abc9c,
        autorTag:
          interaction.user.tag,
        autorIcon:
          interaction.user.displayAvatarURL({
            dynamic: true
          }),
        desc:
          'Clicaram em iniciar entrevista.',
        fields: [
          {
            name:
              '👤 Quem clicou',
            value:
              `<@${interaction.user.id}>`,
            inline:
              true
          },
          {
            name:
              '📍 Canal',
            value:
              `<#${interaction.channelId}>`,
            inline:
              true
          },
          {
            name:
              '🔗 Mensagem',
            value:
              msgLink(
                interaction.guildId,
                interaction.channelId,
                enviada.id
              ),
            inline:
              false
          }
        ],
        thumb:
          interaction.guild?.iconURL({
            dynamic: true
          })
      }
    );
  })().catch((error) => {
    console.error(
      '[Entrevista] Falha não crítica no pós-início:',
      error
    );
  });

  return true;
}


// ENVIAR (inicia as perguntas)
if (customId.startsWith('enviar|')) {
  installInterviewLifecycle(interaction.client);

  const [, targetId] = customId.split('|');
  const lockKey = String(channel.id);

  await interaction.deferUpdate().catch(() => {});

  // =====================================================
  // VALIDAÇÃO REAL DO LIMITE DE TENTATIVAS
  // =====================================================
  //
  // A consulta foi pré-carregada quando o primeiro botão
  // apareceu. Aqui nós apenas confirmamos o resultado antes
  // de enviar a primeira pergunta.
  //
  // Assim:
  // • "Iniciar Entrevista" responde imediatamente;
  // • o limite de 3 tentativas continua obrigatório;
  // • ninguém começa a Q1 sem passar pela validação.
  // =====================================================

  const authorizedOverride =
    canOverrideInterviewAttemptLimit(
      interaction.member
    );

  const attemptStatus =
    authorizedOverride
      ? null
      : await getInterviewAttemptStatus(
          interaction.client,
          targetId
        )
          .catch(
            (error) => {
              console.warn(
                '[Entrevista] Não foi possível confirmar o histórico de tentativas antes da Q1:',
                error?.message || error
              );

              return null;
            }
          );

  if (
    attemptStatus?.blocked &&
    !authorizedOverride
  ) {
    await interaction
      .followUp({
        content:
          `⛔ <@${targetId}> já realizou **${attemptStatus.count}/${attemptStatus.maxAttempts} entrevistas** nos últimos **${attemptStatus.windowDays} dias**.\n` +
          'Uma nova tentativa precisa de liberação da gestão.',
        ephemeral:
          true,
        allowedMentions: {
          parse: [],
        },
      })
      .catch(
        () => {}
      );

    return true;
  }

  if (entrevistasStartLocks.has(lockKey)) {
    await channel.send(
      "⚠️ Já tem uma tentativa de iniciar entrevista em andamento. Aguarde alguns segundos e tente novamente."
    ).catch(() => {});

    return true;
  }

  entrevistasStartLocks.add(lockKey);

  const existing =
    entrevistas.get(targetId);

  const hasProgress = existing && !existing.cancelled && (
    Boolean(existing.collector) ||
    Boolean(existing.finishing) ||
    Number(existing.index) > 0 ||
    (existing.mensagens?.length || 0) > 0 ||
    (existing.respostas?.length || 0) > 0
  );

  if (
    hasProgress &&
    String(existing.channelId) === String(channel.id)
  ) {
    entrevistasStartLocks.delete(lockKey);

    if (!existing.collector && !existing.finishing) {
      entrevistasAtivas.delete(channel.id);
      void reanexar(channel.client).catch((error) => {
        console.error('[Entrevista] Falha ao retomar entrevista preservada:', error);
      });
    }

    return true;
  }

  if (
    existing &&
    String(existing.channelId) ===
      String(channel.id)
  ) {
    console.warn(
      "[ENTREVISTA DEBUG] Estado anterior encontrado antes de um novo ENVIAR. Limpando estado antigo para iniciar uma nova entrevista.",
      {
        targetId,
        channelId: channel.id,
        index:
          Number(existing.index) ||
          0,
        tinhaCollector:
          Boolean(existing.collector),
        tinhaGlobalTimer:
          Boolean(
            existing.globalTimer?.timeout
          )
      }
    );

    if (
      existing.globalTimer?.timeout
    ) {
      clearTimeout(
        existing.globalTimer.timeout
      );
    }

    existing.cancelled =
      true;

    if (
      existing.collector
    ) {
      try {
        existing.collector.stop(
          'novo_inicio_manual'
        );
      } catch {}
    }

    existing.collector =
      null;

    entrevistas.delete(
      targetId
    );

    entrevistasAtivas.delete(
      channel.id
    );

    await salvarEntrevistasEmDisco()
      .catch((error) => {
        console.error(
          "[Entrevista] Falha ao limpar estado antigo antes do novo início:",
          error
        );
      });
  }

  console.log(
    "[ENTREVISTA DEBUG] Clique recebido no botão ENVIAR:",
    customId,
    "Canal:",
    channel.id
  );

  let buttonRemoved = false;

  const originalButtonComponents =
    interaction.message.components;

  try {
    const membro = await withTimeout(
      channel.guild.members.fetch(
        targetId
      ),
      8000,
      "buscar candidato"
    ).catch(() => null);

    if (!membro) {
      throw new Error(
        `Candidato ${targetId} não encontrado no servidor.`
      );
    }

    await interaction.message
      .edit({
        components: []
      })
      .then(() => {
        buttonRemoved = true;
      })
      .catch(() => {});

    for (
      const [userId, dados]
      of entrevistas.entries()
    ) {
      if (
        String(
          dados?.channelId ||
            ""
        ) ===
        String(
          channel.id
        )
      ) {
        entrevistas.delete(
          userId
        );
      }
    }

    entrevistasAtivas.delete(
      channel.id
    );

    const topicId =
      getAplicadorIdFromChannel(
        channel
      );

    const entrevistadorId =
      topicId ||
      interaction.user.id;

    const timeoutEnd =
      Date.now() +
      ENTREVISTA_DURACAO_MS;

    const dadosBase = {
      respostas: [],
      index: 0,
      timeoutEnd,
      entrevistadorId,
      channelId:
        channel.id,
      mensagens: [],
      lastSent: 0,
      globalTimer: null
    };

    entrevistas.set(
      targetId,
      dadosBase
    );

    entrevistasAtivas.add(
      channel.id
    );

    console.log(
      "[ENTREVISTA DEBUG] Estado criado. targetId:",
      targetId,
      "membro.id:",
      membro.id
    );

    console.log(
      "[ENTREVISTA DEBUG] Iniciando inteligência auxiliar da entrevista..."
    );

    void Promise.resolve().then(() => startInterviewIntelligence({
      client: channel.client,
      channel,
      candidate: membro,
      interviewerId: entrevistadorId,
      questions: perguntas
    })).then(() => {
      console.log(
        "[ENTREVISTA DEBUG] Inteligência auxiliar iniciada."
      );
    }).catch((error) => {
      console.error(
        "[INTERVIEW_INTELLIGENCE] Falha não crítica ao iniciar rastreio:",
        error
      );
    });

    console.log(
      "[ENTREVISTA DEBUG] Pausando IA conversacional durante entrevista manual..."
    );

    try {
      iaInterviewPauseForManualInterview(
        channel,
        targetId,
        entrevistadorId
      );

      console.log(
        "[ENTREVISTA DEBUG] IA conversacional pausada para entrevista manual."
      );
    } catch (error) {
      console.error(
        "[ENTREVISTA DEBUG] Falha não crítica ao pausar IA conversacional:",
        error
      );
    }

    console.log(
      "[ENTREVISTA DEBUG] Enviando mensagem de abertura da entrevista..."
    );

    await withTimeout(
      channel.send({
        content: `<@${targetId}> Bora! Vamos começar sua entrevista agora ✨`
      }),
      10000,
      "enviar mensagem inicial da entrevista"
    );

    console.log(
      "[ENTREVISTA DEBUG] Mensagem de abertura enviada."
    );

    console.log(
      "[ENTREVISTA DEBUG] Disparando primeira pergunta..."
    );

    void enviarPergunta(
      channel,
      membro,
      0
    ).catch(async (err) => {
      console.error(
        "[Entrevista] Falha real ao enviar/coletar perguntas:",
        err
      );

      entrevistas.delete(
        targetId
      );

      entrevistasAtivas.delete(
        channel.id
      );

      await setInterviewActiveTopic(
        channel,
        false
      ).catch(() => {});

      await salvarEntrevistasEmDisco()
        .catch(() => {});

      await channel.send(
        `❌ A entrevista travou ao enviar a primeira pergunta.\n\n**Erro:** \`${String(
          err?.message ||
          err
        ).slice(
          0,
          800
        )}\``
      ).catch(() => {});
    });

    console.log(
      "[ENTREVISTA DEBUG] Primeira pergunta disparada em background."
    );

    Promise.allSettled([
      withTimeout(
        setInterviewActiveTopic(
          channel,
          true
        ),
        5000,
        "setar tópico ativo"
      ),
      salvarEntrevistasEmDisco()
    ]).catch(() => {});

    iniciarContadorGlobal(channel, targetId).then(async (globalTimer) => {
      const dadosAtualizados = entrevistas.get(targetId);
      if (!dadosAtualizados) return;

      dadosAtualizados.globalTimer = globalTimer;
      entrevistas.set(targetId, dadosAtualizados);

      await salvarEntrevistasEmDisco().catch(() => {});
    }).catch((err) => {
      console.error("[Entrevista] Falha ao iniciar contador global (não crítico):", err);
    });

    logCompleto(interaction.client, {
      titulo: '🎬 Entrevista iniciada',
      cor: 0x2ecc71,
      autorTag: interaction.user.tag,
      desc: 'Começaram a entrevista pelo botão ENVIAR.',
      fields: [
        { name: '🧑‍💼 Entrevistador', value: `<@${entrevistadorId}>`, inline: true },
        { name: '👤 Entrevistado', value: `<@${targetId}>`, inline: true },
        { name: '📍 Canal', value: `<#${channel.id}>`, inline: true }
      ]
    }).catch((err) => {
      console.error("[Entrevista] Falha ao logar início:", err);
    });

    return true;
  } catch (e) {
  entrevistasAtivas.delete(channel.id);
  entrevistas.delete(targetId);

  await setInterviewActiveTopic(channel, false).catch(() => {});
  await salvarEntrevistasEmDisco().catch(() => {});

  console.error("[Entrevista] Falha ao iniciar entrevista:", e);

  await channel.send(
    `❌ Não consegui iniciar a entrevista.\n\n**Erro:** \`${String(e?.message || e).slice(0, 800)}\``
  ).catch(() => {});

  if (buttonRemoved) {
    await interaction.message.edit({
      components: originalButtonComponents
    }).catch(() => {});
  }

  return true;
} finally {
  entrevistasStartLocks.delete(lockKey);
}
}




  return false;
}

// ===== ENVIAR PERGUNTA =====
async function enviarPergunta(channel, membro, index) {
   const dados = entrevistas.get(membro.id);
  if (!dados || dados.cancelled || String(dados.channelId) !== String(channel.id) ||
      dados.index !== index || dados.collector) return;
  if (index >= perguntas.length) {
  if (dados.finishing || dados.respostas.length !== perguntas.length) return;

  dados.finishing = true;

  if (dados.globalTimer?.timeout) clearTimeout(dados.globalTimer.timeout);

  // ✅ Aplicador registrado quando !perguntas foi executado
  const aplicadorId = getAplicadorIdFromChannel(channel);

  // ✅ Pessoa que realmente clicou em "Iniciar Entrevista"
  const starterId = getStarterIdFromChannel(channel);

  // ✅ Só considera o mesmo condutor quando os dois IDs existem e são iguais
  const isStarter =
    Boolean(aplicadorId) &&
    Boolean(starterId) &&
    aplicadorId === starterId;

  const categoryId = String(channel.parentId || "");
  const canCountPoint = canInterviewPointCount(channel, aplicadorId);
const quemAtendeu = aplicadorId ? `<@${aplicadorId}>` : 'nossa equipe';

const fim = await channel.send(
  `**Seu formulário está em análise!** ${quemAtendeu}\n\n` +
  `*A equipe já está avaliando suas respostas com atenção, e muito em breve você receberá um retorno com a aprovação — ou não — da sua entrada.*\n\n` +
  `**Agradecemos pela paciência e interesse em fazer parte do projeto!**\n\n` +
  `EQUIPE - <@&1352275728476930099>`
);

await setInterviewActiveTopic(channel, false);

await finishInterviewIntelligence({
  client: channel.client,
  channel,
  candidateId: membro.id,
  interviewerId: aplicadorId,
  completionMessageId: fim.id,
}).catch((error) => {
  console.error(
    "[INTERVIEW_INTELLIGENCE] Falha ao agendar análise automática; use o botão do ticket:",
    error
  );
});

entrevistas.delete(membro.id);
entrevistasAtivas.delete(channel.id);
await salvarEntrevistasEmDisco();

try {
  iaInterviewMarkInterviewFinished(channel, membro.id, aplicadorId);
} catch (e) {
  console.error("[Entrevista] Falha ao marcar entrevista finalizada na IA:", e);
}

    // 📢 NOTIFICA EQUIPE NO PV (ENTREVISTA FINALIZADA)
    const alertMsg = `✅ **ENTREVISTA FINALIZADA!**\n\n` +
      `📍 **Canal:** ${channel}\n` +
      `👤 **Candidato:** <@${membro.id}>\n` +
     `👉 A análise automática será enviada ao privado de quem usou **!perguntas**. A equipe também pode usar **🔎 Analisar Entrevista** no topo do ticket. O \`!correcao\` continua disponível.`;

    await channel.guild.members.fetch().catch(() => {});
    const notifiedIds = new Set();

    for (const roleId of ALERT_ROLE_IDS) {
      const role = channel.guild.roles.cache.get(roleId);
      if (!role) continue;

      for (const [id, staff] of role.members) {
        if (staff.user.bot) continue;
        if (notifiedIds.has(id)) continue;

        staff.send(alertMsg).catch(() => {});
        notifiedIds.add(id);
      }
    }

   const entrevistaFoiConduzida = !!starterId;

// 📝 LOG DE FINALIZAÇÃO + PONTO
const logChannel = await channel.client.channels.fetch(LOG_CHANNEL_ID_NOVO).catch(() => null);
if (logChannel) {
  const logEmbed = new EmbedBuilder()
  .setTitle('🏁 Entrevista Finalizada')
  .setColor('#0000ff')
  .setDescription(`O candidato terminou de responder todas as 30 perguntas.`)
  .addFields(
    { name: '👤 Candidato', value: `<@${membro.id}>`, inline: true },
    { name: '🏆 Aplicador (!perguntas)', value: aplicadorId ? `<@${aplicadorId}>` : 'Não identificado', inline: true },
    { name: '🎤 Quem conduziu (starter)', value: starterId ? `<@${starterId}>` : 'Ninguém iniciou', inline: true },
    { name: '📂 Categoria', value: categoryId ? `\`${categoryId}\`` : 'Sem categoria', inline: true },
    { name: '✅ Pontua?', value: (canCountPoint && entrevistaFoiConduzida && isStarter) ? 'Sim' : 'Não', inline: true },
    { name: '📍 Canal', value: `${channel}`, inline: true },
    { name: '🕒 Horário', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
  )
  .setTimestamp();

  await logChannel.send({ embeds: [logEmbed] }).catch(() => {});

  // O histórico mudou agora. Remove qualquer resultado em cache
  // para que uma próxima tentativa leia a contagem atualizada.
  invalidateInterviewAttemptStatus(
    membro.id
  );
}

// ✅ PONTO DE ENTREVISTA: somente aqui, na conclusão real das 30 perguntas
    if (aplicadorId && canCountPoint && entrevistaFoiConduzida && isStarter) {
  try {
    dashEmit("entrevista:ponto_concluido", {
      userId: aplicadorId, // ✅ SEMPRE quem usou !perguntas
      candidateId: membro.id,
      starterId,
      channelId: channel.id,
      categoryId,
      __at: Date.now(),
    });
  } catch (e) {
    console.error("[Entrevista] Falha ao emitir entrevista:ponto_concluido:", e);
  }

  if (logChannel) {
    const pointEmbed = new EmbedBuilder()
      .setTitle('🏆 Ponto de Entrevista Concluída')
      .setColor('#2ecc71')
      .setDescription(`O aplicador ganhou **1 ponto** porque o candidato concluiu as 30 perguntas.`)
      .addFields(
        { name: '🏆 Aplicador (ganhou ponto)', value: `<@${aplicadorId}>`, inline: true },
        { name: '🎤 Quem conduziu', value: `<@${starterId}>`, inline: true },
        { name: '👤 Candidato', value: `<@${membro.id}>`, inline: true },
        { name: '📂 Categoria', value: categoryId ? `\`${categoryId}\`` : 'Sem categoria', inline: true },
        { name: '📍 Canal da Entrevista', value: `${channel}`, inline: true }
      )
      .setFooter({ text: ENTREVISTA_POINT_LOG_MARKER })
      .setTimestamp();

    await logChannel.send({ embeds: [pointEmbed] }).catch(() => {});
  }
}
    await logCompleto(channel.client, {
      titulo: '🏁 Entrevista finalizada',
      cor: 0x3498db,
      autorTag: membro.user.tag,
      autorIcon: membro.user.displayAvatarURL({ dynamic: true }),
      desc: 'O entrevistado terminou todas as perguntas.',
      fields: [
        { name: '👤 Entrevistado', value: `<@${membro.id}>\n\`${membro.id}\``, inline: true },
        { name: '🧑‍💼 Entrevistador', value: aplicadorId ? `<@${aplicadorId}>\n\`${aplicadorId}\`` : '—', inline: true },
        { name: '📍 Canal', value: `<#${channel.id}>`, inline: true },
        { name: '📂 Categoria', value: categoryId ? `\`${categoryId}\`` : 'Sem categoria', inline: true },
        { name: '✅ Gera ponto', value: canCountPoint ? 'Sim' : 'Não', inline: true },
        { name: '🔗 Mensagem final', value: msgLink(channel.guildId, channel.id, fim.id), inline: false }
      ]
    });

await enviarLogFinalEntrevista(membro, {
  ...dados,
  channelId: channel.id,
  entrevistadorId: aplicadorId || dados.entrevistadorId
}).catch(async (err) => {
  console.error("[Entrevista] Falha ao enviar log final da entrevista:", err);

  await channel.send(
    `⚠️ A entrevista terminou, mas deu erro ao enviar o log final para <#${CANAL_AVALIACAO_ENTREVISTA}>.\n\n**Erro:** \`${String(err?.message || err).slice(0, 800)}\``
  ).catch(() => {});
});

return;
  }
  if (Date.now() >= dados.timeoutEnd) {
    await resetInterviewChannelState(channel, 'tempo esgotado');
    return;
  }
  const endUnix = Math.floor(dados.timeoutEnd / 1000);
  const perguntaBase = `**${index + 1}.** <@${membro.id}> ${perguntas[index]}`;
  let perguntaMsg = null;
  let perguntaJaExistia = false;

  const lastId = dados.mensagens.at(-1);

  if (lastId) {
    const old =
      await channel.messages
        .fetch(lastId)
        .catch(() => null);

    if (
      old?.author?.id ===
        channel.client.user.id &&
      old.content.startsWith(
        `**${index + 1}.**`
      )
    ) {
      perguntaMsg =
        old;

      perguntaJaExistia =
        true;
    }
  }

  const collected = new Map();
  // O coletor é instalado ANTES de enviar a pergunta/esperar logs e backup.
  const collector = channel.createMessageCollector({
    filter: (message) => message.author.id === membro.id && !message.author.bot &&
      Boolean(message.content.trim()) && !/^!/.test(message.content),
    time: Math.max(1, dados.timeoutEnd - Date.now()),
  });
  dados.collector = collector;
  const ended = new Promise((resolve) => {
    collector.on('collect', (message) => {
      collected.set(message.id, message);
      if (perguntaMsg && BigInt(message.id) > BigInt(perguntaMsg.id)) collector.stop('respondida');
    });
    collector.once('end', (_, reason) => resolve(reason));
  });
  try {
    if (!perguntaMsg) {
      perguntaMsg = await channel.send({
        content: `${perguntaBase}\n\n> ⏰ **Atenção!** Você tem até <t:${endUnix}:R> pra concluir a entrevista inteira.`,
        allowedMentions: { users: [membro.id], parse: [] },
      });
      dados.mensagens.push(perguntaMsg.id);
    }
    if (entrevistas.get(membro.id) !== dados || dados.cancelled) {
      collector.stop('ticket_encerrado');
      return;
    }
    void recordInterviewQuestion({ client: channel.client, channel, candidateId: membro.id,
      index, question: perguntas[index], questionMessage: perguntaMsg }).catch(console.error);
    // Só procura respostas antigas quando esta pergunta já
    // existia antes desta execução, por exemplo após reinício
    // do bot. Em uma entrevista ao vivo, fazer esse fetch a
    // cada questão cria uma requisição HTTP desnecessária e
    // aumenta a sensação de atraso entre resposta e próxima Q.
    if (
      perguntaJaExistia
    ) {
      let after =
        perguntaMsg.id;

      for (
        let page = 0;
        page < 5;
        page += 1
      ) {
        const batch =
          await channel.messages.fetch({
            limit: 100,
            after,
            cache: false
          });

        const ordered =
          [...batch.values()].sort(
            (a, b) =>
              BigInt(a.id) <
              BigInt(b.id)
                ? -1
                : 1
          );

        for (
          const message of
          ordered
        ) {
          if (
            message.author.id ===
              membro.id &&
            !message.author.bot &&
            message.content.trim() &&
            !/^!/.test(
              message.content
            )
          ) {
            collected.set(
              message.id,
              message
            );
          }
        }

        const next =
          ordered.at(-1)?.id;

        if (
          !next ||
          next === after ||
          batch.size < 100
        ) {
          break;
        }

        after =
          next;
      }
    }
    const firstAnswer = () => [...collected.values()].filter((message) =>
      BigInt(message.id) > BigInt(perguntaMsg.id) && message.createdTimestamp <= dados.timeoutEnd
    ).sort((a, b) => BigInt(a.id) < BigInt(b.id) ? -1 : 1)[0];
    if (firstAnswer()) collector.stop('respondida');
    await salvarEntrevistasEmDisco();
    const reason = await ended;
    if (entrevistas.get(membro.id) !== dados || dados.cancelled) return;
    if (reason === 'time') {
      await resetInterviewChannelState(channel, 'tempo esgotado');
      await channel.send(`⏰ <@${membro.id}>, tempo da entrevista esgotado.`).catch(() => {});
      return;
    }
    const msgResp = firstAnswer();
    if (!msgResp) return;
    dados.collector = null;
    dados.respostas[index] = msgResp.content;
    dados.index = index + 1;
    await salvarEntrevistasEmDisco();
    void msgResp.react('✅').catch(() => {});
    void recordInterviewAnswer({ client: channel.client, channel, candidateId: membro.id,
      index, question: perguntas[index], questionMessage: perguntaMsg, answerMessage: msgResp }).catch(console.error);
    const nextIndex = dados.index;
    setTimeout(() => {
      if (entrevistas.get(membro.id) !== dados || dados.cancelled || dados.index !== nextIndex) return;
      void enviarPergunta(channel, membro, nextIndex).catch((error) => {
        console.error(`[Entrevista] Falha real ao avançar Q${nextIndex + 1}:`, error);
      });
    }, 300);
  } catch (error) {
    collector.stop('erro_operacional');
    console.error(`[Entrevista] Falha operacional em Q${index + 1}:`, error);
    // Preserva respostas/backup; uma falha HTTP não é inatividade do candidato.
    dados.retryCounts ||= {};
    const attempts = (dados.retryCounts[index] || 0) + 1;
    dados.retryCounts[index] = attempts;
    if (attempts <= 3 && entrevistas.get(membro.id) === dados && !dados.cancelled) {
      setTimeout(() => {
        if (entrevistas.get(membro.id) !== dados || dados.cancelled || dados.index !== index) return;
        void enviarPergunta(channel, membro, index).catch(console.error);
      }, attempts * 2000);
    } else {
      entrevistasAtivas.delete(channel.id);
      void channel.client.channels.fetch('1556491332254695586').then((log) => log?.send({
        content: `⚠️ Entrevista pausada por falha operacional persistente. Ticket: <#${channel.id}> • candidato: <@${membro.id}> • Q${index + 1}. Respostas preservadas para retomada.`,
        allowedMentions: { parse: [] },
      })).catch(console.error);
    }
  } finally {
    if (dados.collector === collector) dados.collector = null;
  }
}
// ===== TIMER GLOBAL =====
async function iniciarContadorGlobal(channel, membroId, remainingMs = ENTREVISTA_DURACAO_MS) {
  const state = entrevistas.get(membroId);
  if (!state) return null;
  const endUnix = Math.floor(state.timeoutEnd / 1000);
  const msg = await channel.send(`🕒 **Entrevista encerra** <t:${endUnix}:R> (até <t:${endUnix}:t>).`);
  const timeout = setTimeout(() => {
    if (entrevistas.get(membroId) !== state || state.finishing || state.cancelled) return;
    void (async () => {
      await resetInterviewChannelState(channel, 'tempo total esgotado');
      await abortInterviewIntelligence({ client: channel.client, channel, candidateId: membroId,
        reason: 'tempo total esgotado' });
      await msg.edit('⛔ **Tempo esgotado!** Entrevista cancelada.').catch(() => {});
      await channel.send(`❌ <@${membroId}>, tempo total acabou (${ENTREVISTA_DURACAO_MIN} min).`).catch(() => {});
    })().catch(console.error);
  }, Math.max(1, state.timeoutEnd - Date.now()));
  return { timeout, endUnix, messageId: msg.id };
}
// ===== LOG FINAL (avaliação + botões) =====
async function enviarLogFinalEntrevista(member, dados) {
  const canalAvaliacao = await member.client.channels.fetch(CANAL_AVALIACAO_ENTREVISTA).catch((err) => {
    console.error("[Entrevista] Não consegui buscar o canal de avaliação:", err);
    return null;
  });

  if (!canalAvaliacao || !canalAvaliacao.isTextBased?.()) {
    console.error(`[Entrevista] Canal de avaliação inválido ou inacessível: ${CANAL_AVALIACAO_ENTREVISTA}`);

    const canalOrigem = dados.channelId
      ? await member.client.channels.fetch(dados.channelId).catch(() => null)
      : null;

    if (canalOrigem?.isTextBased?.()) {
      await canalOrigem.send(
        `⚠️ A entrevista terminou, mas eu não consegui enviar o log para <#${CANAL_AVALIACAO_ENTREVISTA}>.\nVerifique se o bot tem permissão de **Ver Canal**, **Enviar Mensagens** e **Anexar Arquivos** lá.`
      ).catch(() => {});
    }

    return;
  }

  const respostas = dados.respostas;
  const entrevistadorId = dados.entrevistadorId || 'none';

  const info = new EmbedBuilder()
    .setTitle('📋 Registro de Entrevista Finalizada')
    .setDescription(`Entrevista concluída por: <@${member.id}>`)
    .setThumbnail(member.displayAvatarURL({ dynamic: true }))
    .setColor(0x2ecc71)
    .setTimestamp();

  await canalAvaliacao.send({ embeds: [info] });

  const blocos = respostas.map((r, i) => {
  const p = perguntas[i];
  return `**${i + 1}. ${p}**\n${r}`;
});


  const full = blocos.join('\n\n');

  if (full.length <= 4000) {
    const emb = new EmbedBuilder()
      .setTitle('💬 Perguntas e Respostas')
      .setDescription(full)
      .setColor(0x3498db);

    await canalAvaliacao.send({ embeds: [emb] });
  } else {
    const buf = Buffer.from(full, 'utf8');
    const arquivo = new AttachmentBuilder(buf, { name: `entrevista_${member.id}.txt` });

    await canalAvaliacao.send({
      content: `📎 Respostas muito grandes, mandei em arquivo:`,
      files: [arquivo]
    });
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`aprovar|${member.id}|${entrevistadorId}`).setLabel('✅ APROVAR').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`reprovar|${member.id}|${entrevistadorId}`).setLabel('❌ REPROVAR').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`alinhar|${member.id}|${entrevistadorId}`).setLabel('⚠️ ALINHAR').setStyle(ButtonStyle.Secondary)
  );

  await canalAvaliacao.send({
    content: `🎯 Ações disponíveis para a entrevista de <@${member.id}>:`,
    components: [row]
  });

 // A análise automática é agendada em enviarPergunta, após a conclusão real.
  // Este log e seus botões mantêm o funcionamento existente.
  // O botão do ticket também entrega o parecer atual ao privado de quem clicar.
}

async function resetInterviewChannelState(channel, reason = "manual_reset") {
  const channelId = String(channel?.id || "");

  if (!channelId) return false;

  let cleaned = false;

    for (const [userId, dados] of entrevistas.entries()) {
    if (String(dados?.channelId || "") === channelId) {
      if (dados.globalTimer?.timeout) clearTimeout(dados.globalTimer.timeout);
      dados.cancelled = true;
      dados.collector?.stop('ticket_encerrado');
      entrevistas.delete(userId);
      cleaned = true;
    }
  }

  entrevistasAtivas.delete(channelId);
  entrevistasStartLocks.delete(channelId);

  await setInterviewActiveTopic(channel, false);

  try {
    if (channel && typeof channel.setTopic === "function") {
      const oldTopic = String(channel.topic || "");
      const cleanedTopic = oldTopic
        .replace(/\bentrevista_ativa:[01]\b/gi, "")
        .replace(/\bentrevista_starter:\d{17,20}\b/gi, "")
        .replace(/\s*\|\s*\|\s*/g, " | ")
        .replace(/\s{2,}/g, " ")
        .trim();

      await channel.setTopic(cleanedTopic.slice(0, 1024)).catch(() => {});
    }
  } catch {}

  await salvarEntrevistasEmDisco();

  console.warn(`[Entrevista] Estado do canal ${channelId} resetado. Motivo: ${reason}`);

  return cleaned;
}

export default {
  handleButtons,
  reanexar,
  logCompleto,
  resetInterviewChannelState
};
