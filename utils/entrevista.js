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
  iaInterviewEvaluateFinishedInterview,
  iaInterviewMarkInterviewFinished,
  iaInterviewPauseForManualInterview
} from '../events/iaChatAuto.js';

// ===== CONFIG =====
const ENTREVISTA_DURACAO_MIN = 180;
const ENTREVISTA_DURACAO_MS = ENTREVISTA_DURACAO_MIN * 60 * 1000;

const CANAL_LOG_COMPLETO = '1486084393716941031';
const LOG_CHANNEL_ID_NOVO = "1486084249755979950";
const ENTREVISTA_POINT_LOG_MARKER = "SC_ENTREVISTA_POINT_V1";

const ALERT_ROLE_IDS = [
  "1282119104576098314", // mkt creators
  "1352407252216184833", // resp lider
  "1262262852949905409", // resp influ
  "1388976314253312100", // coord creators
  "1388975939161161728", // gestor creators
];

// salva no storage (você tem essa pasta)
const ENTREVISTAS_PATH = path.resolve(process.cwd(), 'storage', 'entrevistas_backup.json');

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
async function salvarEntrevistasEmDisco() {
  try {
    const dados = {};
    entrevistas.forEach((v, id) => {
      dados[id] = {
        respostas: v.respostas || [],
        index: v.index || 0,
        timeoutEnd: v.timeoutEnd,
        mensagens: v.mensagens || [],
        entrevistadorId: v.entrevistadorId || null,
        channelId: v.channelId || null
      };
    });

    // garante pasta storage
    const dir = path.dirname(ENTREVISTAS_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    await fs.promises.writeFile(ENTREVISTAS_PATH, JSON.stringify(dados, null, 2), 'utf8');
  } catch (e) {
    console.warn('Falha ao salvar entrevistas:', e);
  }
}

function carregarEntrevistasDoDisco() {
  try {
    if (!fs.existsSync(ENTREVISTAS_PATH)) {
      console.log('[Entrevista] Arquivo de backup não encontrado. Nenhuma entrevista para carregar.');
      return;
    }
    const bruto = JSON.parse(fs.readFileSync(ENTREVISTAS_PATH, 'utf8'));
    let count = 0;
    for (const id in bruto) {
      entrevistas.set(id, {
        respostas: bruto[id].respostas || [],
        index: bruto[id].index || 0,
        timeoutEnd: bruto[id].timeoutEnd,
        mensagens: bruto[id].mensagens || [],
        entrevistadorId: bruto[id].entrevistadorId || null,
        channelId: bruto[id].channelId || null,
        lastSent: 0, // ✅ Adiciona o campo para o debounce
        globalTimer: null
      });
      count++;
    }
    if (count > 0) {
      console.log(`[Entrevista] Carregadas ${count} entrevista(s) do backup.`);
    }
  } catch (e) {
    console.warn('Falha ao carregar entrevistas:', e);
  }
}

carregarEntrevistasDoDisco();
// Hooks de saída (mantidos como sync para garantir o salvamento no encerramento do processo)
process.on('exit', () => {
  const dados = Object.fromEntries(entrevistas);
  fs.writeFileSync(ENTREVISTAS_PATH, JSON.stringify(dados, null, 2));
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
async function reanexar(client) {
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
      if (!channel || !channel.isTextBased?.()) {
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
      const globalTimer = await iniciarContadorGlobal(channel, userId, restante);
      dados.globalTimer = globalTimer;
      entrevistas.set(userId, dados);
      await salvarEntrevistasEmDisco();

      // ✅ APAGA A MENSAGEM DA PERGUNTA ANTERIOR PARA EVITAR DUPLICIDADE
      if (dados.mensagens && dados.mensagens.length > 0) {
        const lastMsgId = dados.mensagens.pop(); // Pega e remove o último ID do array
        if (lastMsgId) {
          try {
            const oldMsg = await channel.messages.fetch(lastMsgId);
            await oldMsg.delete();
            console.log(`[Entrevista] Mensagem de pergunta anterior (${lastMsgId}) apagada com sucesso.`);
          } catch (e) {
            // Ignora se a msg não existir mais, o que é normal.
            // console.log(`[Entrevista] Não foi possível apagar a msg ${lastMsgId}, talvez já tenha sido deletada.`);
          }
        }
      }

      await logCompleto(client, {
        titulo: '🔄 Entrevista reanexada',
        cor: 0xf1c40f,
        autorTag: membro.user.tag,
        autorIcon: membro.user.displayAvatarURL({ dynamic: true }),
        desc: `O bot voltou e reanexou a entrevista em andamento.`,
        fields: [
          { name: '👤 Entrevistado', value: `<@${userId}>`, inline: true },
          { name: '📍 Canal', value: `<#${channel.id}>`, inline: true },
          { name: '⏳ Restante', value: `${Math.ceil(restante / 60000)} min`, inline: true }
        ]
      });

      console.log(`[Entrevista] Reanexando entrevista para ${membro.user.tag} no canal #${channel.name}. Próxima pergunta: ${dados.index + 1}`);
      enviarPergunta(channel, membro, dados.index);
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
  await interaction.deferUpdate().catch(() => {});

  const membro = interaction.member || null;
  const cargoEntrevista = interaction.guild.roles.cache.get('1353797415488196770');

  const topic = String(interaction.channel?.topic || "");
  const mOpener = topic.match(/aberto_por:(\d{17,20})/i);
  const targetId = mOpener ? mOpener[1] : interaction.user.id;

  iaInterviewPauseForManualInterview(interaction.channel, targetId, interaction.user.id);

  const row = new ActionRowBuilder().addComponents(
  new ButtonBuilder()
    .setCustomId(`enviar|${targetId}|${channelId}`)
    .setLabel('📩 ENVIAR PERGUNTAS')
    .setStyle(ButtonStyle.Primary)
);

const enviada = await interaction.channel.send({
  content: `✨ Oii, <@${targetId}> Tudo bem por aí? Seja **MUITO** bem-vind@ à família **SantaCreators**!  \nÉ um prazer ter você por aqui — e pode ficar tranquil@, porque a <@&1352275728476930099> vai te acompanhar nessa primeira etapa com todo o cuidado. 💖\n\n📝 Nosso processo de entrada é dividido em **duas fases bem tranquilas**:\n\n➊ **Aqui pelo Discord/e-mail**, a gente vai trocar uma ideia pra entender melhor o seu perfil e ver como você se sairia em algumas situações dentro da nossa estrutura.\n\n➋ **Depois, dentro da cidade**, vamos te apresentar nosso prédio, explicar direitinho as regras e mostrar na prática como funcionamos por aqui.\n\n📚 **Agora bora dar uma lida nas regras?**\nhttps://discord.com/channels/1262262852782129183/1352285379302002710\nhttps://discord.com/channels/1262262852782129183/1355622493464821892\nhttps://discord.com/channels/1262262852782129183/1370830395637239928\nhttps://discord.com/channels/1262262852782129183/1381704800608981003\n\n⚠️ **IMPORTANTE SOBRE A ENTREVISTA**\nDurante a entrevista **não é permitido utilizar Inteligência Artificial** e **nem copiar e colar**. Responda **com suas próprias palavras**.\n\n✅ Assim que estiver tudo certinho por aí, me avisa aqui mesmo pra gente **começar a sua entrevista**, combinado?\n\n🚀 **Bora começar essa jornada juntos!** 🌟`,
  components: [row]
});

(async () => {
  await interaction.message.edit({ components: [] }).catch(() => {});

  try {
      const oldTopic = String(interaction.channel.topic || "");
      const cleanedTopic = oldTopic
        .replace(/\bentrevista_starter:\d{17,20}\b/gi, "")
        .replace(/\s{2,}/g, " ")
        .trim();

      const nextTopic = `${cleanedTopic}${cleanedTopic ? " | " : ""}entrevista_starter:${interaction.user.id}`.slice(0, 1024);

      await Promise.allSettled([
        typeof interaction.channel.setTopic === "function"
          ? interaction.channel.setTopic(nextTopic)
          : Promise.resolve(),
        membro && cargoEntrevista && !membro.roles.cache.has(cargoEntrevista.id)
          ? membro.roles.add(cargoEntrevista.id)
          : Promise.resolve()
      ]);
    } catch (e) {
      console.warn("[Entrevista] Falha ao configurar starter/cargo:", e?.message || e);
    }

    await logCompleto(interaction.client, {
      titulo: '🚪 Botão: Iniciar Entrevista',
      cor: 0x1abc9c,
      autorTag: interaction.user.tag,
      autorIcon: interaction.user.displayAvatarURL({ dynamic: true }),
      desc: 'Clicaram em iniciar entrevista.',
      fields: [
        { name: '👤 Quem clicou', value: `<@${interaction.user.id}>`, inline: true },
        { name: '📍 Canal', value: `<#${interaction.channelId}>`, inline: true },
        { name: '🔗 Mensagem', value: msgLink(interaction.guildId, interaction.channelId, enviada.id), inline: false }
      ],
      thumb: interaction.guild?.iconURL({ dynamic: true })
    });
  })();

  return true;
}


// ENVIAR (inicia as perguntas)
  if (customId.startsWith('enviar|')) {
    const [, targetId] = customId.split('|');

    // 1. Dar deferUpdate imediato
    await interaction.deferUpdate().catch(() => {});

    // 2. Remover o botão imediatamente para evitar múltiplos cliques
    await interaction.message.edit({ components: [] }).catch(() => {});

    const lockKey = String(channel.id);
    // Trava anti-duplicidade para o canal
    if (entrevistasStartLocks.has(lockKey)) return true;
    entrevistasStartLocks.add(lockKey);

    console.log("[ENTREVISTA DEBUG] Clique recebido no botão ENVIAR:", customId, "Canal:", channel.id);

    // 3. Buscar candidato
    const membro = await channel.guild.members.fetch(targetId).catch(() => null);

    if (!membro) {
      console.error("[ENTREVISTA DEBUG] Candidato não encontrado no servidor:", targetId);
      entrevistasStartLocks.delete(lockKey);
      await channel.send({
        content: `❌ Não consegui encontrar o candidato <@${targetId}> para iniciar a entrevista.`
      }).catch(() => {});
      return true;
    }

    // Limpeza de estados fantasmas no mesmo canal
    for (const [userId, dados] of entrevistas.entries()) {
      if (String(dados?.channelId || "") === String(channel.id)) {
        entrevistas.delete(userId);
      }
    }
    entrevistasAtivas.delete(channel.id);

    const topicId = getAplicadorIdFromChannel(channel);
    const entrevistadorId = topicId || interaction.user.id;

    // 4. Criar estado em memória
    const timeoutEnd = Date.now() + ENTREVISTA_DURACAO_MS;
    const dadosBase = {
      respostas: [],
      index: 0,
      timeoutEnd,
      entrevistadorId,
      channelId: channel.id,
      mensagens: [],
      lastSent: 0,
      globalTimer: null
    };

    entrevistas.set(targetId, dadosBase);
    entrevistasAtivas.add(channel.id);
    
    console.log("[ENTREVISTA DEBUG] Estado criado. targetId:", targetId, "membro.id:", membro.id);

    try {
      // 5. Marcar entrevista ativa no tópico
      await setInterviewActiveTopic(channel, true).catch((e) => console.error("[Entrevista] Erro ao setar tópico:", e));
      
      // 6. Salvar em disco (sem travar se falhar)
      await salvarEntrevistasEmDisco().catch(e => console.error("[Entrevista] Erro ao salvar disco:", e));

      // 7. Pausar IA
      iaInterviewPauseForManualInterview(channel, targetId, entrevistadorId);

      // 8. Mandar mensagem “Bora”
      await channel.send({
        content: `<@${targetId}> Bora! Vamos começar sua entrevista agora ✨`
      });

      // 9. Tentar iniciar timer (Seguro: não bloqueia a pergunta)
      const globalTimer = await iniciarContadorGlobal(channel, targetId).catch((err) => {
        console.error("[Entrevista] Falha ao iniciar contador global (não crítico):", err);
        return null;
      });

      const dadosAtualizados = entrevistas.get(targetId);
      if (dadosAtualizados) {
        dadosAtualizados.globalTimer = globalTimer;
        entrevistas.set(targetId, dadosAtualizados);
        await salvarEntrevistasEmDisco().catch(() => {});
      }

      // 10. Chamar enviarPergunta com catch visível (Primeira Pergunta)
      console.log("[ENTREVISTA DEBUG] Disparando primeira pergunta...");
      enviarPergunta(channel, membro, 0).catch(async (err) => {
        console.error("[Entrevista] Falha real ao enviar/coletar perguntas:", err);

        entrevistas.delete(targetId);
        entrevistasAtivas.delete(channel.id);
        await setInterviewActiveTopic(channel, false).catch(() => {});
        await salvarEntrevistasEmDisco().catch(() => {});

        await channel.send(
          `❌ A entrevista travou ao enviar a primeira pergunta.\n\n**Erro:** \`${String(err?.message || err).slice(0, 800)}\``
        ).catch(() => {});
      });

      // 11. Logar início da entrevista (Background)
      (async () => {
        await logCompleto(interaction.client, {
          titulo: '🎬 Entrevista iniciada',
          cor: 0x2ecc71,
          autorTag: interaction.user.tag,
          desc: 'Começaram a entrevista pelo botão ENVIAR.',
          fields: [
            { name: '🧑‍💼 Entrevistador', value: `<@${entrevistadorId}>`, inline: true },
            { name: '👤 Entrevistado', value: `<@${targetId}>`, inline: true },
            { name: '📍 Canal', value: `<#${channel.id}>`, inline: true }
          ]
        });

        const alertStartMsg = `📢 **ENTREVISTA INICIADA!**\n📍 **Canal:** ${channel}\n👤 **Candidato:** <@${targetId}>\n👮 **Aplicador:** <@${entrevistadorId}>`;
        const notifiedStartIds = new Set();

        for (const roleId of ALERT_ROLE_IDS) {
          const role = channel.guild.roles.cache.get(roleId);
          if (!role) continue;

          for (const [id, staff] of role.members) {
            if (staff.user.bot || notifiedStartIds.has(id)) continue;

            staff.send(alertStartMsg).catch(() => {});
            notifiedStartIds.add(id);
          }
        }
      })().catch((err) => {
        console.error("[Entrevista] Falha no pós-processamento da entrevista:", err);
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
      return true;
    } finally {
      // Libera o lock após o processamento inicial
      entrevistasStartLocks.delete(lockKey);
    }
  }




  return false;
}

// ===== ENVIAR PERGUNTA =====
async function enviarPergunta(channel, membro, index) {
  const dados = entrevistas.get(membro.id);

  if (!dados) {
    throw new Error(`Estado da entrevista não encontrado para ${membro?.id} no canal ${channel?.id}.`);
  }

  if (index >= perguntas.length) {

    if (dados.globalTimer?.timeout) clearTimeout(dados.globalTimer.timeout);

    // ✅ Validação estrita: O aplicador deve ser quem está registrado no tópico do canal
    const aplicadorId = getAplicadorIdFromChannel(channel);
    
    // Se o aplicador mudou ou não é o mesmo que iniciou, tratamos com cautela
    const isStarter = aplicadorId === dados.entrevistadorId;

    const categoryId = String(channel.parentId || "");
    const canCountPoint = canInterviewPointCount(channel, aplicadorId);

    entrevistas.delete(membro.id);
    entrevistasAtivas.delete(channel.id);
    await setInterviewActiveTopic(channel, false);
    iaInterviewMarkInterviewFinished(channel, membro.id, aplicadorId);
    await salvarEntrevistasEmDisco();

    const quemAtendeu = aplicadorId ? `<@${aplicadorId}>` : 'nossa equipe';

    const fim = await channel.send(
      `**Seu formulário está em análise!** ${quemAtendeu}\n\n` +
      `*A equipe já está avaliando suas respostas com atenção, e muito em breve você receberá um retorno com a aprovação — ou não — da sua entrada.*\n\n` +
      `**Agradecemos pela paciência e interesse em fazer parte do projeto!**\n\n` +
      `EQUIPE - <@&1352275728476930099>`
    );

    // 📢 NOTIFICA EQUIPE NO PV (ENTREVISTA FINALIZADA)
    const alertMsg = `✅ **ENTREVISTA FINALIZADA!**\n\n` +
      `📍 **Canal:** ${channel}\n` +
      `👤 **Candidato:** <@${membro.id}>\n` +
      `👉 **Ação:** Usem \`!correcao\` para corrigir as respostas!`;

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

   const starterId = getStarterIdFromChannel(channel);
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
      { name: '✅ Pontua?', value: (canCountPoint && entrevistaFoiConduzida) ? 'Sim' : 'Não', inline: true },
      { name: '📍 Canal', value: `${channel}`, inline: true },
      { name: '🕒 Horário', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
    )
    .setTimestamp();

  await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
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

    await enviarLogFinalEntrevista(membro, { ...dados, entrevistadorId: aplicadorId || dados.entrevistadorId });
    return;
  }

  const endUnix = Math.floor(dados.timeoutEnd / 1000);
  const perguntaBase = `**${index + 1}.** <@${membro.id}> ${perguntas[index]}`;

  const perguntaMsg = await channel.send({
    content: `${perguntaBase}\n\n> ⏰ **Atenção!** Você tem até <t:${endUnix}:R> pra concluir a entrevista inteira.`,
    allowedMentions: { users: [membro.id] }
  });

  dados.mensagens.push(perguntaMsg.id);
  entrevistas.set(membro.id, dados);
  // Salva o estado após adicionar a mensagem da pergunta, para garantir consistência.
  await salvarEntrevistasEmDisco();

  try {
    const tempoRestanteMs = dados.timeoutEnd - Date.now();
    if (tempoRestanteMs <= 0) throw new Error('tempo');

    const coletor = await channel.awaitMessages({
      filter: m => m.author.id === membro.id,
      max: 1,
      time: tempoRestanteMs,
      errors: ['time']
    });

    const msgResp = coletor.first();
    await msgResp.react('✅').catch(() => {});

    dados.respostas.push(msgResp.content);
    dados.index = index + 1;

    entrevistas.set(membro.id, dados);
    salvarEntrevistasEmDisco(); // Tira o await

    setTimeout(() => enviarPergunta(channel, membro, dados.index), 300); // Reduz de 700 para 300ms

  } catch (e) {
    entrevistas.delete(membro.id);
    entrevistasAtivas.delete(channel.id);
    await setInterviewActiveTopic(channel, false);
    await salvarEntrevistasEmDisco();

    await channel.send(`⏰ <@${membro.id}>, entrevista cancelada por inatividade (passou de ${ENTREVISTA_DURACAO_MIN} min).`);
  }
}

// ===== TIMER GLOBAL =====
async function iniciarContadorGlobal(channel, membroId, remainingMs = ENTREVISTA_DURACAO_MS) {
  const endAt = Date.now() + remainingMs;
  const endUnix = Math.floor(endAt / 1000);

  const msg = await channel.send(`🕒 **Entrevista encerra** <t:${endUnix}:R> (até <t:${endUnix}:t>).`);

  const timeout = setTimeout(async () => {
    if (!entrevistas.has(membroId)) return;

    entrevistas.delete(membroId);
    entrevistasAtivas.delete(channel.id);
    await setInterviewActiveTopic(channel, false);
    await salvarEntrevistasEmDisco();

    await msg.edit('⛔ **Tempo esgotado!** Entrevista cancelada.').catch(() => {});
    await channel.send(`❌ <@${membroId}>, tempo total acabou (${ENTREVISTA_DURACAO_MIN} min).`).catch(() => {});
  }, remainingMs);

  return { timeout, endUnix, messageId: msg.id };
}

// ===== LOG FINAL (avaliação + botões) =====
async function enviarLogFinalEntrevista(member, dados) {
  const canalAvaliacao = await member.client.channels.fetch('1486084237772718120').catch(() => null);
  if (!canalAvaliacao) return;

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

  const parecerIa = await iaInterviewEvaluateFinishedInterview(member.guild.client, {
    guild: member.guild,
    channel: dados.channelId
      ? await member.guild.client.channels.fetch(dados.channelId).catch(() => null)
      : null,
    candidateId: member.id,
    entrevistadorId,
    perguntas,
    respostas,
  }).catch((err) => {
    console.error('[IA ENTREVISTA] Falha ao gerar parecer automático:', err);
    return null;
  });

  if (parecerIa) {
    await canalAvaliacao.send({
      content: parecerIa,
      allowedMentions: {
        users: [member.id, entrevistadorId].filter(Boolean),
        roles: [],
        parse: [],
      },
    }).catch(() => {});
  }
}

async function resetInterviewChannelState(channel, reason = "manual_reset") {
  const channelId = String(channel?.id || "");

  if (!channelId) return false;

  let cleaned = false;

  for (const [userId, dados] of entrevistas.entries()) {
    if (String(dados?.channelId || "") === channelId) {
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
