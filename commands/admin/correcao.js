import { EmbedBuilder } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dashEmit } from '../../utils/dashHub.js';


const CANAL_LOGS_CORRECAO = '1486006908056899748';

const CATEGORIA_CORRECAO_PONTUA_ID = '1359244725781266492';

const CARGOS_PODE_USAR = [
  '1262262852949905408',
  '660311795327828008',
  '1352408327983861844',
  '1262262852949905409',
  '1352407252216184833',
  '1388976314253312100',
  '1352385500614234134',
  '1352429001188180039',
  '1282119104576098314',
  '1372716303122567239'
];

// ✅ Ignoram a regra da categoria e também o cooldown
const CORRECAO_ANYWHERE_BYPASS_USERS = new Set([
  '660311795327828008', // você
  '1262262852949905408', // owner
]);

// ✅ Ignoram somente o cooldown
const CORRECAO_COOLDOWN_BYPASS_USERS = new Set([
  '660311795327828008', // você
  '1262262852949905408', // owner
]);

const CORRECAO_COOLDOWN_BYPASS_ROLES = new Set([
  '1352408327983861844', // Resp. Creators
]);

const GIF_CORRECAO =
  'https://media.discordapp.net/attachments/1362477839944777889/1384245215249825832/standard_2rss.gif';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const COOLDOWN_FILE = path.resolve(__dirname, '../../data/correcao_cooldown.json');

function hasCooldownBypass(member) {
  if (!member) return false;

  if (CORRECAO_COOLDOWN_BYPASS_USERS.has(member.id)) return true;
  if (member.roles?.cache?.some(r => CORRECAO_COOLDOWN_BYPASS_ROLES.has(r.id))) return true;

  return false;
}

function hasAnywhereBypass(userId) {
  return CORRECAO_ANYWHERE_BYPASS_USERS.has(String(userId));
}

function isAllowedCorrecaoCategory(channel) {
  if (!channel) return false;

  if (channel.parentId === CATEGORIA_CORRECAO_PONTUA_ID) return true;
  if (channel.parent?.id === CATEGORIA_CORRECAO_PONTUA_ID) return true;

  return false;
}

function checkCooldown(userId, member) {
  try {
    // ✅ bypass: pontua sempre
    if (hasCooldownBypass(member)) {
      return { scored: true, remaining: 0, bypass: true };
    }

    const dir = path.dirname(COOLDOWN_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    let data = {};
    if (fs.existsSync(COOLDOWN_FILE)) {
      data = JSON.parse(fs.readFileSync(COOLDOWN_FILE, 'utf8'));
    }

    const now = Date.now();
    const last = data[userId] || 0;
    const cooldown = 60 * 60 * 1000; // 1 hora

    if (now - last < cooldown) {
      return {
        scored: false,
        remaining: cooldown - (now - last),
        bypass: false,
      };
    }

    data[userId] = now;
    fs.writeFileSync(COOLDOWN_FILE, JSON.stringify(data, null, 2));

    return { scored: true, remaining: 0, bypass: false };
  } catch (e) {
    console.error("Erro cooldown correcao:", e);
    return { scored: true, remaining: 0, bypass: false };
  }
}

const QUESTOES = {
  1: {
    pergunta: "📋 Entrevista Pré-Admissão – SantaCreators\n\n🔹 Regras Internas e Postura na Empresa\n\nQual o seu nome completo e, se tiver, como você costuma ser chamado dentro do RP?",
    resposta: "Resposta pessoal."
  },

  2: {
    pergunta: "🎂 Sua idade?",
    resposta: "Resposta pessoal."
  },

  3: {
    pergunta: "🔍 Como você conheceu a SantaCreators? O que te chamou atenção na empresa e te motivou a querer fazer parte dela?",
    resposta: "Resposta pessoal."
  },

  4: {
    pergunta: "👥 Você veio até a SantaCreators por conta própria ou foi indicado por alguém? Se foi uma indicação, lembra quem te falou sobre a empresa ou te convidou?",
    resposta: "Resposta pessoal. Exemplo: vim por indicação de um membro, conheci pela cidade ou por curiosidade."
  },

  5: {
    pergunta: "🧥 Você sabe qual é a importância do uso da jaqueta ou peças da SantaCreators ao entrar no prédio e ao circular nas redondezas? Por que isso é obrigatório?",
    resposta: "Para manter a ordem e identificação dos membros, evitando que pessoas que não são da empresa atrapalhem, usem algo de forma incorreta ou gerem situações inconvenientes pela empresa ou redondezas."
  },

  6: {
    pergunta: "🚗 Ao utilizar a garagem da empresa, qual deve ser sua conduta em relação ao uniforme? E por que isso é exigido?",
    resposta: "Devo estar utilizando ao menos 1 peça de roupa da empresa, para identificação e para mostrar que faço parte da empresa."
  },

  7: {
    pergunta: "🔫 O que você faria se visse um membro utilizando um veículo que você sabe que é da empresa para participar de uma troca de tiro ou assalto de pista?",
    resposta: "Eu gravaria a situação e reportaria para algum superior. Caso tivesse oportunidade de falar com a pessoa a sós, tentaria chamar para um alinhamento e explicar que aquilo é errado."
  },

  8: {
    pergunta: "🕵️‍♂️ Em que situação o uso dos veículos da empresa é permitido para ações ilegais no RP? Quais cuidados devem ser tomados nesses casos?",
    resposta: "O uso pode acontecer em sequestros organizados, seguindo as regras da cidade, o horário correto de assalto e a conduta exigida para esse tipo de ação. Também pode ser usado para vendas ou entregas, desde que não seja para troca de tiros ou PVP."
  },

  9: {
    pergunta: "📦 Quantos baús existem dentro do prédio da SantaCreators e qual deles é proibido de ser mexido de forma alguma? E por quê?",
    resposta: "Existem 6 baús. O baú da liderança não deve ser mexido por quem não tem acesso. O baú de Creators também não é para retirada, pois é voltado para doações."
  },

  10: {
    pergunta: "🎭 Imersão e Comportamento no RP\n\nSe você presenciar um membro da empresa utilizando expressões ou referências do mundo de fora (vida real) sem qualquer contexto válido, quebrando a imersão, como você abordaria a situação?",
    resposta: "Eu tentaria agir de forma imersiva, me fazendo de desentendido e mudando o assunto. Caso persistisse, eu me afastaria e passaria para um superior com registros, pois quebra de imersão pode resultar em advertência. Se tivesse oportunidade, tentaria alinhar a pessoa em uma sala adequada ou em call fora da imersão."
  },

  11: {
    pergunta: "📋 Caso veja algum membro da empresa nas proximidades usando comandos de F8 para sentar no ar, flutuar ou realizar ações que claramente quebram a física do RP, ou até mesmo abusando de poderes, como vc reagiria e o que vc faria diante a essas situações?",
    resposta: "Eu não utilizaria esses comandos de forma que não faça sentido para o cenário atual do meu RP. Se eu visse abuso de poder, eu cliparia e mandaria para um superior, coordenador ou responsável da empresa. No momento do ocorrido, tentaria orientar de forma imersiva para a pessoa entender que aquilo foi errado ou sem sentido."
  },

  12: {
    pergunta: "📡 Se durante o RP um jogador disser algo como 'minha internet caiu' ou 'precisei sair do Discord', como você orientaria essa pessoa a se manter na imersão? Dê um exemplo de como reformular a frase.",
    resposta: "Um exemplo seria reformular para algo imersivo, como: 'minha mente esteve pesada e tive uma dor de cabeça fortíssima'."
  },

  13: {
    pergunta: "🧠 Postura e Responsabilidade\n\nComo você lidaria com um membro novo que claramente não conhece as regras da empresa e está agindo de forma que compromete a imagem da SantaCreators?",
    resposta: "Eu tentaria conversar com ele e repassaria o ocorrido para um superior. Caso tivesse clipes ou provas, também enviaria junto."
  },

  14: {
    pergunta: "🛡️ Imagine que você esteja em um evento da SantaCreators representando a empresa, e um imprevisto ocorre (por exemplo, uma confusão no local ou alguém quebrando a imersão). Qual seria sua postura?",
    resposta: "Eu tentaria resolver, mas caso não estivesse ao meu alcance, me afastaria e passaria para um superior, coordenador ou responsável, pedindo ajuda para resolver o problema. Se eu tivesse autonomia, tentaria resolver a situação da melhor forma possível."
  },

  15: {
    pergunta: "📈 Na sua visão, quais atitudes e comportamentos são essenciais para que um membro da SantaCreators evolua na hierarquia e conquiste promoções dentro da empresa?",
    resposta: "Demonstrar comprometimento, estar presente nos projetos da empresa, participar dos eventos, mostrar vontade de ajudar e manter uma boa postura dentro da equipe."
  },

  16: {
    pergunta: "🎖️ Quais atitudes caracterizam abuso de poder dentro do RP e como você deve agir em casos de anti-rp contra você?",
    resposta: "Abuso de poder é usar poderes para uso próprio dentro do RP, seja para se beneficiar ou beneficiar outro player. Em casos de anti-RP contra mim, devo clipar, enviar para um superior e esperar o suporte necessário."
  },

  17: {
    pergunta: "🏢 Funcionamento da Empresa e Hierarquia\n\nPor que é importante respeitar a hierarquia dentro da empresa, mesmo que em alguns momentos você tenha mais experiência do que alguém de cargo superior?",
    resposta: "Para manter a ordem, o respeito pelos superiores e uma boa relação com os demais membros da empresa."
  },

  18: {
    pergunta: "🌟 Em quais situações o uso de poderes é permitido e qual é o objetivo principal desse uso dentro da SantaCreators?",
    resposta: "O uso de poderes é permitido para fins relacionados aos projetos da empresa, como eventos, organização e atividades oficiais da SantaCreators."
  },

  19: {
    pergunta: "💬 A call é obrigatória para todos na SantaCreators? Em quais casos ela passa a ser necessária e por quê?",
    resposta: "Não. Somente responsáveis têm obrigação de ficar em call. Entretanto, ficar em call ajuda a tirar dúvidas e aproxima mais a pessoa da equipe."
  },

  20: {
    pergunta: "🚀 Pergunta Bônus\n\nComo o comprometimento diário (registro, bate ponto e organização) influencia sua evolução dentro da SantaCreators?",
    resposta: "O comprometimento diário parece ser contabilizado em pontos individuais, servindo para pontuar membros dentro da equipe, avaliar desempenho e manter a organização."
  },

  21: {
    pergunta: "📦 Qual é a função do Baú Creators?",
    resposta: "O Baú Creators é utilizado para doações da empresa."
  },

  22: {
    pergunta: "🧠 O que é MetaGame no RP?",
    resposta: "MetaGame é utilizar meios externos para se beneficiar dentro do game."
  },

  23: {
    pergunta: "⚠️ O que é considerada Má Conduta?",
    resposta: "Má Conduta é infringir uma regra ou ignorar um pedido de um superior ao seu cargo."
  },

  24: {
    pergunta: "🎭 O que é Quebra de Imersão?",
    resposta: "Quebra de Imersão é falar coisas de fora dentro do jogo ou usar termos e expressões externas sem contexto válido, como falar do computador, teclado, Discord, internet ou qualquer informação de fora dentro do game."
  },

  25: {
    pergunta: "📡 Em que situações o uso de NOCLIP/NC é considerado abuso e qual é a alternativa correta?",
    resposta: "O uso de NOCLIP/NC é considerado abuso quando utilizado para se locomover como se fosse um veículo ou para benefício próprio. A forma correta é utilizar apenas em projetos, eventos ou atividades oficiais relacionadas à empresa."
  },

  26: {
    pergunta: "🚗 Se você for preso pela polícia e tiver seus itens apreendidos, mas depois conseguir fugir e tiver acesso aos comandos kitinf e kitinflu, o que você faria nessa situação?",
    resposta: "Eu não utilizaria os comandos, pois eles dariam arma e drogas do nada, o que quebraria o RP. O correto seria seguir o fluxo real da situação dentro do RP, evitando quebra de imersão."
  },

  27: {
    pergunta: "🧥 Se acontecesse algum problema grave, como quebra de imersão, falta de respeito ou atitude totalmente contra a cultura da empresa — você chamaria um staff? Por quê? E o que esperaria que acontecesse depois?",
    resposta: "Eu não chamaria staff diretamente, pois são assuntos internos da empresa. O correto seria passar para alguém com cargo acima do meu dentro da empresa e esperar que a situação fosse resolvida internamente."
  },

  28: {
    pergunta: "🔍 Qual deve ser sua conduta ao trocar de roupa dentro da empresa ou nos arredores do prédio?",
    resposta: "Eu devo me certificar de que não há ninguém por perto e trocar em um local indicado ou adequado para a situação. Não posso simplesmente trocar em qualquer lugar, pois isso pode gerar quebra de imersão."
  },

  29: {
    pergunta: "🔫 Se você é um membro novo e tem uma dúvida, mas vê por perto alguém da coordenação e também um responsável, pra quem você recorre primeiro? E por quê?",
    resposta: "Eu recorreria primeiro à coordenação, pois o responsável é um cargo mais alto e eu devo respeitar a hierarquia. Respeitar a hierarquia é fundamental para quem deseja crescer dentro da empresa."
  },

  30: {
    pergunta: "🧾 Se um dia você decidir sair do projeto (painel da SantaCreators), como você comunicaria sua saída da forma certa e respeitosa?",
    resposta: "Eu falaria com alguém da empresa sobre a minha saída e solicitaria a remoção de forma respeitosa e condizente com a empresa. Na SantaCreators, o correto é pedir demissão pela cidade, mantendo a imersão do RP. Caso futuramente queira voltar ao projeto, essa é a forma mais ideal de sair."
  }
};



export async function handleCorrecao(message, client) {
  if (message.author.bot) return false;

const linhas = message.content.split('\n');

// pega SOMENTE a primeira linha (!correcao ...)
const primeiraLinha = linhas[0];

const match = primeiraLinha.match(/^!correcao\s*(.+)$/i);
if (!match) return false;


  if (!message.guild || !message.member) return false;

if (!message.member.roles.cache.some(r => CARGOS_PODE_USAR.includes(r.id))) {
  setTimeout(() => message.delete().catch(() => {}), 1000);
  const msg = await message.reply("❌ Você não tem permissão para usar este comando.");
  setTimeout(() => msg.delete().catch(() => {}), 5000);
  return true;
}

  const TOTAL_QUESTOES = Math.max(
  ...Object.keys(QUESTOES).map(n => parseInt(n))
);

const numeros = match[1]
  .match(/\d+/g) // pega TODOS os números da linha
  ?.map(n => parseInt(n))
  .filter(n => Number.isInteger(n))
  .filter(n => n >= 1 && n <= TOTAL_QUESTOES)
  .filter(n => QUESTOES[n]) || [];




  if (!numeros.length) {
    await message.reply("❌ Nenhuma questão válida encontrada.");
    return true;
  }

  await message.react('👍');

  let descricao = '';
  for (const num of numeros) {
    descricao += `**Questão ${num} – ERRADA ou INCOMPLETA**\n`;
    descricao += `**Pergunta:** ${QUESTOES[num].pergunta}\n\n`;
    descricao += `**Resposta:** ${QUESTOES[num].resposta}\n\n\n`;
  }

  const embed = new EmbedBuilder()
    .setTitle('📌 Correção de Questões')
    .setDescription(descricao)
    .setColor('#ff0000')
    .setImage(GIF_CORRECAO)
    .setFooter({
      text: `Enviado por ${message.author.tag} • ${new Date().toLocaleString('pt-BR')}`,
      iconURL: message.author.displayAvatarURL({ dynamic: true })
    });

  await message.channel.send({
    content: `${message.author}`,
    embeds: [embed]
  });

  // ✅ Owner e você podem pontuar em qualquer lugar.
  // ✅ Demais seguem a regra da categoria.
  const canScoreHere =
    hasAnywhereBypass(message.author.id) ||
    isAllowedCorrecaoCategory(message.channel);

  const scoreInfo = canScoreHere
    ? checkCooldown(message.author.id, message.member)
    : { scored: false, remaining: 0, bypass: false, blockedByCategory: true };

  const canalLogs = await client.channels.fetch(CANAL_LOGS_CORRECAO).catch((err) => {
    console.error('[CORRECAO] Erro ao buscar canal de logs:', CANAL_LOGS_CORRECAO, err);
    return null;
  });

  // Tenta pegar quem abriu o ticket pelo tópico
  const topic = message.channel.topic || "";
  const m = topic.match(/aberto_por:(\d{5,})/i);
  const openerId = m ? m[1] : "Desconhecido";

  let antiFarmText = "❌ Não pontuou";
  if (scoreInfo.blockedByCategory) {
    antiFarmText = `🚫 Fora da categoria permitida`;
  } else if (scoreInfo.bypass && hasAnywhereBypass(message.author.id)) {
    antiFarmText = "✅ Pontuou (+1) • Isento de cooldown e categoria";
  } else if (scoreInfo.bypass) {
    antiFarmText = "✅ Pontuou (+1) • Isento de cooldown";
  } else if (scoreInfo.scored) {
    antiFarmText = "✅ Pontuou (+1)";
  } else {
    antiFarmText = `⏳ Cooldown (${Math.ceil(scoreInfo.remaining / 60000)}m)`;
  }

  if (!canalLogs) {
    console.error(`[CORRECAO] Canal de logs não encontrado ou inacessível: ${CANAL_LOGS_CORRECAO}`);
  } else {
    const logEmbed = new EmbedBuilder()
      .setTitle('📝 Log de Correção de Entrevista')
      .setColor('#00ffff')
      .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: '🧑‍🏫 Creator que corrigiu', value: `${message.author} (\`${message.author.id}\`)`, inline: true },
        { name: '👤 Candidato (Opener)', value: openerId !== "Desconhecido" ? `<@${openerId}>` : "Desconhecido", inline: true },
        { name: '📍 Canal', value: `${message.channel}`, inline: true },
        {
          name: '🗂️ Regra de pontuação',
          value: hasAnywhereBypass(message.author.id)
            ? "✅ Livre em qualquer canal"
            : (isAllowedCorrecaoCategory(message.channel) ? "✅ Categoria válida" : "❌ Fora da categoria válida"),
          inline: true
        },
        { name: '❓ Questões Corrigidas', value: numeros.join(', '), inline: false },
        { name: '🕒 Data/Hora', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
        { name: '🧠 Anti-farm', value: antiFarmText, inline: false }
      )
      .setFooter({ text: 'Sistema de Correção • SantaCreators' })
      .setTimestamp();

    await canalLogs.send({ embeds: [logEmbed] }).catch((err) => {
      console.error('[CORRECAO] Erro ao enviar log de correção:', err);
    });
  }

  // ✅ O ponto NÃO depende mais do canal de log existir
  if (scoreInfo.scored) {
    dashEmit('correcao:usado', {
      userId: message.author.id,
      __at: Date.now(),
      source: 'correcao'
    });
  }

  return true;
}
