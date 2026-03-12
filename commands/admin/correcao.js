import { EmbedBuilder } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dashEmit } from '../../utils/dashHub.js';


const CANAL_LOGS_CORRECAO = '1471695257010831614'; // ✅ Canal novo solicitado

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

const GIF_CORRECAO =
  'https://media.discordapp.net/attachments/1362477839944777889/1384245215249825832/standard_2rss.gif';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const COOLDOWN_FILE = path.resolve(__dirname, '../../data/correcao_cooldown.json');

function checkCooldown(userId) {
  try {
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
      return { scored: false, remaining: cooldown - (now - last) };
    }

    data[userId] = now;
    fs.writeFileSync(COOLDOWN_FILE, JSON.stringify(data, null, 2));
    return { scored: true, remaining: 0 };
  } catch (e) {
    console.error("Erro cooldown correcao:", e);
    return { scored: true, remaining: 0 };
  }
}

const QUESTOES = {
  1: { pergunta: "🧾 Qual o seu nome completo e, se tiver, como você costuma ser chamado dentro do RP?", resposta: "SantaCreators" },
  2: { pergunta: "🎂 Sua idade?", resposta: "(resposta pessoal)" },
  3: { pergunta: "🔍 Como você conheceu a SantaCreators? O que te chamou atenção na empresa e te motivou a querer fazer parte dela?", resposta: "(resposta pessoal)" },
  4: {
  pergunta: "🧍‍♀️ Durante o RP, qual deve ser sua postura ao interagir com uma pessoa que utiliza preset e nome feminino, mesmo que você perceba diferenças entre o visual do personagem e a voz do jogador?",
  resposta: "Agir com respeito e profissionalismo, tratando a pessoa pelo personagem no RP, sem questionamentos ou diferenciações por conta da voz ou de outras características."
},

  5: { pergunta: "🧥 Você sabe qual é a importância do uso da jaqueta ou peças da SantaCreators ao entrar no prédio e ao circular nas redondezas? Por que isso é obrigatório?", resposta: "Para manter a ordem e identificação dos membros… evitando que pessoas de fora entrem e causem problemas ou usem algo de forma incorreta." },
  6: { pergunta: "🚗 Ao utilizar a garagem da empresa, qual deve ser sua conduta em relação ao uniforme? E por que isso é exigido?", resposta: "Devo estar utilizando ao menos 1 peça de roupa da empresa, para identificação e segurança." },
  7: { pergunta: "🔫 O que você faria se visse um membro utilizando um veículo que você sabe que é da empresa para participar de uma troca de tiro ou assalto de pista?", resposta: "Gravaria e reportaria para um superior. Se possível, chamaria para conversar em particular e alinhar que é errado." },
  8: { pergunta: "🕵️‍♂️ Em que situação o uso dos veículos da empresa é permitido para ações ilegais no RP? Quais cuidados devem ser tomados nesses casos?", resposta: "Em sequestros organizados, seguindo regras da cidade. Também pode para vendas/entregas, desde que sem troca de tiros." },
  9: { pergunta: "📦 Quantos baús existem dentro do prédio da SantaCreators e qual deles é proibido de ser mexido de forma alguma? E por quê?", resposta: "São 6 baús. O da liderança é restrito, assim como o de creators (apenas doações)." },
  10:{ pergunta: "🎭 Se você presenciar um membro da empresa utilizando expressões ou referências do mundo de fora (vida real) sem qualquer contexto válido, quebrando a imersão, como você abordaria a situação?",
     resposta: "Ignoraria e mudaria o assunto. Caso persistisse, registraria e reportaria a um superior. Se possível, chamaria para alinhar em call fora do RP." },

11:{ pergunta: "📋 Caso veja algum membro da empresa nas proximidades usando comandos de F8 para sentar no ar, flutuar ou realizar ações que claramente quebram a física do RP, ou até mesmo abusando de poderes, como vc reagiria e o que vc faria diante a essas situações?",
     resposta: "Eu não utilizaria esses comandos de forma que não faça sentido dentro do cenário atual do meu RP. Caso eu presenciasse algum abuso de poder, eu gravaria (cliparia) a situação e encaminharia para um superior, coordenador ou responsável da empresa. No momento do ocorrido, também tentaria orientar a pessoa de forma imersiva, para que ela entendesse que a ação foi errada ou sem sentido dentro do RP." },

12:{ pergunta: "📡 Se durante o RP um jogador disser algo como 'minha internet caiu' ou 'precisei sair do Discord', como você orientaria essa pessoa a se manter na imersão? Dê um exemplo de como reformular a frase.",
     resposta: "Exemplo: 'Minha mente esteve pesada e tive uma dor de cabeça fortíssima'." },

13:{ pergunta: "🧠 Como você lidaria com um membro novo que claramente não conhece as regras da empresa e está agindo de forma que compromete a imagem da SantaCreators?",
     resposta: "Conversaria com ele e reportaria o ocorrido para um superior." },

14:{ pergunta: "🛡️ Imagine que você esteja em um evento da SantaCreators representando a empresa, e um imprevisto ocorre. Qual seria sua postura?",
     resposta: "Eu tentaria resolver a situação, porém, caso não estivesse ao meu alcance, me afastaria do problema e acionaria um superior, coordenador ou responsável para ajudar na resolução. Se eu tivesse autonomia para agir, com certeza buscaria resolver a situação da melhor forma possível." },

15:{ pergunta: "📑 Caso você perceba alguma atitude que vá contra as regras da SantaCreators, mas que não envolva diretamente você, qual deve ser sua postura?",
     resposta: "Não confrontaria diretamente. Registraria a situação e reportaria a um superior para que a empresa avalie e tome as medidas necessárias." },

16:{ pergunta: "🎖️ Quais atitudes caracterizam abuso de poder dentro do RP e como você deve agir em casos de anti-rp contra você?",
     resposta: "Abuso de poder é utilizar comandos ou poderes para benefício próprio ou para favorecer outro player dentro do RP. Em casos de anti-RP contra mim, eu cliparia a situação, enviaria para um superior e aguardaria o suporte necessário." },

18:{ pergunta: "🌟 Em quais situações o uso de poderes é permitido e qual é o objetivo principal desse uso dentro da SantaCreators?",
     resposta: "O uso de poderes é permitido para fins relacionados aos projetos da empresa, como organização e realização de eventos ou outras atividades oficiais ligadas à SantaCreators." },

19:{ pergunta: "💬 A call é obrigatória para todos na SantaCreators? Em quais casos ela passa a ser necessária e por quê?",
     resposta: "Não. A call é obrigatória apenas para os responsáveis. Porém, permanecer em call ajuda a tirar dúvidas, melhora a comunicação e aproxima ainda mais a equipe." },

20:{ pergunta: "🚀 Como o comprometimento diário (registro, bate ponto e organização) influencia sua evolução dentro da SantaCreators?",
     resposta: "O comprometimento diário, como registro, bate ponto e organização, é contabilizado em pontos individuais. Isso serve para avaliar o desempenho dos membros, incentivar a evolução dentro da equipe e manter a organização da empresa." },

21:{ pergunta: "📸 É permitido gravar ou tirar prints dentro da empresa? Em quais situações isso é aceitável e quando se torna um problema?",
     resposta: "É permitido apenas para fins administrativos, provas ou registros necessários. Qualquer gravação ou print fora desse contexto pode comprometer a privacidade e a imagem da empresa." },

22:{ pergunta: "🧾 Caso você cometa um erro dentro do RP representando a SantaCreators, qual deve ser sua postura após o ocorrido?",
     resposta: "Assumir o erro, comunicar um superior e aguardar a orientação correta para resolver a situação da melhor forma possível." },

23:{ pergunta: "🗣️ Como você deve se portar ao falar da SantaCreators para pessoas de fora da empresa?",
     resposta: "Sempre com respeito, sem expor assuntos internos, mantendo uma imagem positiva e profissional da empresa." },

24:{ pergunta: "⚠️ Se você perceber que um conflito interno pode virar algo maior e prejudicar a empresa, o que você faria?",
     resposta: "Evitaria discussões, me afastaria do conflito e comunicaria um superior para que a situação fosse resolvida internamente." },

25:{ pergunta: "📡 Em que situações o uso de NOCLIP/NC é considerado abuso e qual é a alternativa correta?",
     resposta: "O uso de NOCLIP/NC é considerado abuso quando utilizado para locomoção como se fosse um veículo ou para benefício próprio. A alternativa correta é utilizar apenas em projetos ou atividades oficiais da empresa, como eventos e ações organizacionais." },


  26:{ pergunta: "🚗 Se você for preso pela polícia e tiver seus itens apreendidos, mas depois conseguir fugir e tiver acesso aos comandos kitinf e kitinflu, o que você faria nessa situação?", resposta: "Não usaria, pois quebraria a imersão." },
  27:{ pergunta: "🧥 Se acontecesse algum problema grave — quebra de imersão, falta de respeito ou atitude contra a cultura da empresa — você chamaria um staff? Por quê? E o que esperaria que acontecesse depois?", resposta: "Não, reportaria a alguém acima, para que a empresa resolva internamente." },
  28:{ pergunta: "🔍 Qual deve ser sua conduta ao trocar de roupa dentro da empresa ou nos arredores do prédio?", resposta: "Certificar-se de que não há ninguém por perto e trocar em local adequado." },
  29:{ pergunta: "🔫 Se você é um membro novo e tem uma dúvida, mas vê por perto alguém da coordenação e também um responsável, pra quem você recorre primeiro? E por quê?", resposta: "Para a coordenação, respeitando a hierarquia." },
  30:{ pergunta: "🧾 Se um dia você decidir sair do projeto, como você comunicaria sua saída da forma certa e respeitosa?", resposta: "Falaria com alguém da empresa e pediria demissão dentro da cidade." }
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

  const scoreInfo = checkCooldown(message.author.id);

  const canalLogs = await client.channels.fetch(CANAL_LOGS_CORRECAO).catch(() => null);
  if (canalLogs) {
    // Tenta pegar quem abriu o ticket pelo tópico
    const topic = message.channel.topic || "";
    const m = topic.match(/aberto_por:(\d{5,})/i);
    const openerId = m ? m[1] : "Desconhecido";

    const logEmbed = new EmbedBuilder()
      .setTitle('📝 Log de Correção de Entrevista')
      .setColor('#00ffff')
      .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: '🧑‍🏫 Staff que corrigiu', value: `${message.author} (\`${message.author.id}\`)`, inline: true },
        { name: '👤 Candidato (Opener)', value: `<@${openerId}>`, inline: true },
        { name: '📍 Canal', value: `${message.channel}`, inline: true },
        { name: '❓ Questões Corrigidas', value: numeros.join(', '), inline: false },
        { name: '🕒 Data/Hora', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
        { name: '🧠 Anti-farm', value: scoreInfo.scored ? "✅ Pontuou (+1)" : `⏳ Cooldown (${Math.ceil(scoreInfo.remaining / 60000)}m)`, inline: false }
      )
      .setFooter({ text: 'Sistema de Correção • SantaCreators' })
      .setTimestamp();

    canalLogs.send({ embeds: [logEmbed] });

    if (scoreInfo.scored) {
      dashEmit('correcao:usado', {
        userId: message.author.id,
        __at: Date.now(),
        source: 'correcao'
      });
    }
  }

  return true;
}
