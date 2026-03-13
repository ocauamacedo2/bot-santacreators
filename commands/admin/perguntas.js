import { EmbedBuilder } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dashEmit } from '../../utils/dashHub.js';

// --- CONFIG ---
// Canal para logar o uso do comando e a pontuação
const LOG_CHANNEL_ID = "1471695257010831614"; // Usando o mesmo canal de logs de correção para centralizar

// Cargos que podem usar o comando
const CARGOS_PODE_USAR = [
  '1262262852949905408', // owner
  '660311795327828008',  // você
  '1352408327983861844', // resp creator
  '1262262852949905409', // resp influ
  '1352407252216184833', // resp lider
  '1388976314253312100', // coord creators
  '1352385500614234134', // coordenação
  '1352429001188180039', // equipe creator
  '1282119104576098314', // mkt ticket
  '1372716303122567239'  // tickets
];

// ID da categoria de tickets de entrevista
const CATEGORIA_ENTREVISTA_ID = "1359244725781266492";

// Cooldown para evitar spam de pontos
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const COOLDOWN_FILE = path.resolve(__dirname, '../../data/perguntas_cooldown.json');

// --- PERGUNTAS (para envio manual) ---
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
      const remaining = cooldown - (now - last);
      const minutes = Math.ceil(remaining / 60000);
      return { scored: false, remaining: `${minutes} minuto(s)` };
    }

    data[userId] = now;
    fs.writeFileSync(COOLDOWN_FILE, JSON.stringify(data, null, 2));
    return { scored: true, remaining: '0' };
  } catch (e) {
    console.error("Erro no cooldown do !perguntas:", e);
    return { scored: true, remaining: '0' }; // Em caso de erro, permite pontuar para não bloquear o usuário
  }
}

// --- COMMAND EXECUTION ---
export default {
  name: 'perguntas',
  async execute(message, args, client) {
    // 1. Validação de permissão
    const temPermissao = message.member.roles.cache.some(r => CARGOS_PODE_USAR.includes(r.id)) || CARGOS_PODE_USAR.includes(message.author.id);
    if (!temPermissao) {
      return message.reply("🚫 Você não tem permissão para usar este comando.").catch(() => {});
    }

    // 2. Validação de contexto (só em tickets de entrevista)
    if (message.channel.parentId !== CATEGORIA_ENTREVISTA_ID) {
      return message.reply("🚫 Este comando só pode ser usado em um canal de ticket de entrevista.").catch(() => {});
    }

    // 3. Enviar as perguntas em embeds
    const embeds = [];
    let currentDescription = '';
    const embedColor = '#ff009a';

    let questionCounter = 1;
    for (const question of perguntas) {
        let questionText;
        // Trata os cabeçalhos de seção de forma diferente
        if (question.includes('---') || ['🎭', '🧠', '🏢', '🚀'].some(emoji => question.startsWith(emoji))) {
            questionText = `\n${question}\n\n`;
        } else {
            questionText = `**${questionCounter}.** ${question}\n\n`;
            questionCounter++;
        }
        
        if (currentDescription.length + questionText.length > 4000) {
            embeds.push(new EmbedBuilder().setColor(embedColor).setDescription(currentDescription));
            currentDescription = '';
        }
        currentDescription += questionText;
    }

    if (currentDescription) {
        embeds.push(new EmbedBuilder().setColor(embedColor).setDescription(currentDescription));
    }

    try {
        await message.reply({ content: "Enviando a lista de perguntas para a entrevista manual...", ephemeral: true });
        for (const embed of embeds) {
            await message.channel.send({ embeds: [embed] });
        }
    } catch (error) {
        console.error("Erro ao enviar as perguntas da entrevista:", error);
        await message.channel.send("❌ Ocorreu um erro ao enviar as perguntas. Verifique as permissões do bot neste canal.");
    }

    // 4. Lógica de Cooldown e Pontuação
    const scoreInfo = checkCooldown(message.author.id);

    // 5. Enviar log
    const logChannel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    if (logChannel) {
      const logEmbed = new EmbedBuilder()
        .setTitle('🧾 !perguntas usado')
        .setColor(scoreInfo.scored ? '#57F287' : '#FEE75C') // Verde se pontuou, amarelo se em cooldown
        .setDescription(`Comando usado por ${message.author} no ticket ${message.channel}.`)
        .addFields(
          { name: 'Usuário (ganhou ponto)', value: `${message.author} (\`${message.author.id}\`)`, inline: true },
          { name: 'Canal', value: `${message.channel}`, inline: true },
          { name: 'Pontuou?', value: scoreInfo.scored ? '✅ Sim' : `⏳ Não (cooldown: ${scoreInfo.remaining})`, inline: false }
        )
        .setTimestamp();
      await logChannel.send({ embeds: [logEmbed] });
    }

    // 6. Emitir evento para o dashboard e notificar o usuário (apenas se pontuou)
    if (scoreInfo.scored) {
      dashEmit('entrevista:perguntas', {
        userId: message.author.id,
        __at: Date.now(),
        source: 'perguntas'
      });
      await message.author.send({ content: '✅ Ponto de `!perguntas` contabilizado para você!'}).catch(() => {});
    } else {
      await message.author.send({ content: `⏳ Você já usou este comando recentemente. Espere mais ${scoreInfo.remaining} para pontuar novamente.`}).catch(() => {});
    }
  }
};