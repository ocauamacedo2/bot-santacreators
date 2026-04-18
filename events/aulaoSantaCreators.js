// d:\bots\events\aulaoSantaCreators.js
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";

// =====================================================
// CONFIGURAÇÃO GERAL
// =====================================================
const AULAO_CONFIG = {
  ALLOWED_CHANNELS: ["1470185555823300863", "1472838723208216706"], // Canais permitidos
  ALLOWED_USER_ID: "660311795327828008", // APENAS VOCÊ pode iniciar

  // Configuração do Aulão 1 (Geral)
  BTN_START_ID: "btn_start_aulao_sc",
  BTN_NEXT_PREFIX: "btn_aulao_next_",

  // Configuração do Aulão 2 (Responsáveis/Hierarquia)
  BTN_START_RESP_ID: "btn_start_aulao_resp",
  BTN_NEXT_RESP_PREFIX: "btn_aulao_resp_next_",
};

// Imagens e Cores
const IMGS = {
  BANNER:
    "https://media.discordapp.net/attachments/1362477839944777889/1384245215249825832/standard_2rss.gif",
  ICON:
    "https://media.discordapp.net/attachments/1362477839944777889/1368084293905285170/sc2.png",
  CHART_PLACEHOLDER:
    "https://quickchart.io/chart?c=%7B%22type%22%3A%22bar%22%2C%22data%22%3A%7B%22labels%22%3A%5B%22Semana%201%22%2C%22Semana%202%22%2C%22Semana%203%22%2C%22Atual%22%5D%2C%22datasets%22%3A%5B%7B%22label%22%3A%22ORGs%20Aprovadas%22%2C%22data%22%3A%5B25%2C32%2C38%2C45%5D%2C%22backgroundColor%22%3A%5B%22%23fee75c%22%2C%22%23faa61a%22%2C%22%23faa61a%22%2C%22%2357f287%22%5D%7D%5D%7D%2C%22options%22%3A%7B%22legend%22%3A%7B%22display%22%3Afalse%7D%2C%22title%22%3A%7B%22display%22%3Atrue%2C%22text%22%3A%22Exemplo%20Visual%20-%20Gr%C3%A1fico%20de%20Desempenho%22%2C%22fontColor%22%3A%22%23fff%22%7D%7D%7D&width=500&height=300&backgroundColor=transparent",
};

const COLORS = {
  ROXO_SC: "#9b59b6",
  ROSA_SC: "#ff009a",
  AZUL_CLARO: "#3498db",
  VERDE_OK: "#2ecc71",
  AMARELO_WARN: "#f1c40f",
  VERMELHO_ERR: "#e74c3c",
  DARK: "#2b2d31",
  COORD_BLUE: "#3498db", // Azul Coordenação
  RESP_PINK: "#e91e63",  // Rosa Responsável
  GOLD: "#f1c40f",       // Dourado Influência
};

// =====================================================
// [AULÃO 1] CONTEÚDO GERAL (Módulos 1-15)
// =====================================================
const SLIDE_CONTENT_GERAL = [
  [
    "## 🟣 MÓDULO 1 — O QUE É A SANTACREATORS",
    "",
    "**🏢 Uma Empresa de Roleplay**",
    "Não somos apenas um grupo de amigos. Somos uma organização estruturada.",
    "",
    "**🎭 Filosofia**",
    "• A diversão vem primeiro, mas a **organização** é o que mantém o RP vivo.",
    "• Sem regras e métricas, a estrutura desmorona.",
    "",
    "**📊 Baseado em Dados**",
    "• Tudo aqui é medido.",
    "• Promoções, destaques e decisões são baseadas em **métricas reais**, não em achismo.",
  ].join("\n"),

  [
    "## 🎫 MÓDULO 2 — O QUE É MKT TICKET",
    "",
    "**🛠️ Acesso Operacional**",
    "• Ter cargo de MKT ou Ticket **não é poder**. É uma função.",
    "• Você está ali para servir e organizar, não para mandar.",
    "",
    "**📉 Impacto dos Cliques**",
    "• Cada botão que você clica gera um log e um dado estatístico.",
    "• Erros operacionais afetam rankings globais e a avaliação da equipe.",
    "",
    "**⚠️ Responsabilidade**",
    "• Se você tem acesso, você tem responsabilidade sobre o que faz com ele.",
  ].join("\n"),

  [
    "## ⚠️ MÓDULO 3 — REGRA DE OURO DOS BOTÕES",
    "",
    "**🛑 PARE E LEIA**",
    "Os botões neste Discord executam **sistemas reais** e complexos.",
    "",
    "**🚫 Não existe 'Desfazer'**",
    "• Clicou errado? O dado foi gravado, o log foi gerado, a métrica foi alterada.",
    "• Não clique para 'testar'.",
    "",
    "**🧠 A Regra de Ouro**",
    "> **Se você não entende 100% o que o botão faz: NÃO CLIQUE.**",
    "> Perguntar antes é obrigatório. Errar por curiosidade é negligência.",
  ].join("\n"),

  [
    "## 📊 MÓDULO 4 — GRÁFICOS E DASHBOARDS",
    "",
    "Nossos sistemas geram gráficos automáticos para acompanhar o desempenho.",
    "",
    "**📈 Gráfico Manager Creators**",
    "• **Meta:** 40 ORGs aprovadas na semana.",
    "• **Cores:** 🔴 <20 | 🟡 20-29 | 🟠 30-39 | 🟢 40+",
    "• **O que mede:** Constância e qualidade das parcerias.",
    "",
    "**📱 Gráfico Social Médias**",
    "• **Meta:** 60 interações/registros.",
    "• **Limite Técnico:** 80 (acima disso pode indicar flood/abuso).",
    "",
    "**⚖️ Gráfico Geral Comparativo**",
    "• Compara **Semana Atual** vs **Semana Anterior**.",
    "• **Meta:** Superar a semana anterior.",
    "• Se a barra está verde, estamos crescendo. Se vermelha, atenção.",
  ].join("\n"),

  [
    "## 📈 MÓDULO 5 — FACs E COMPARATIVOS",
    "",
    "**🗓️ Ciclo Semanal**",
    "• As FACs (Famílias/Orgs) são contabilizadas de **Domingo a Sábado**.",
    "• O reset é automático no Domingo (00:00).",
    "",
    "**🔗 Integração**",
    "• O sistema de FACs é integrado ao **Registro Manager**.",
    "• Se você registrar errado no Manager, o comparativo das FACs fura.",
    "• **Consequência:** Dados falsos atrapalham a estratégia da empresa.",
  ].join("\n"),

  [
    "## 💎 MÓDULO 6 — GESTÃO INFLUENCER",
    "",
    "O sistema que cuida dos nossos talentos e parceiros.",
    "",
    "**👁️ Monitoramento Contínuo**",
    "• Acompanhamos semanas e meses de permanência.",
    "• **1 Mês de casa** = Direito a solicitar VIP/Destaque (se ativo).",
    "",
    "**🔒 Trava GI (Cargo Obrigatório)**",
    "• Enquanto o registro estiver **ATIVO**, o membro **DEVE** ter o cargo `GestaoInfluencer`.",
    "• Se remover o cargo manualmente, o bot **pune** (remove tudo ou restaura forçado).",
    "",
    "**👨‍✈️ Responsável Direto**",
    "• Cada Creator tem um 'padrinho' (Owner, Resp Creator, Resp Influ, etc).",
    "• O bot cobra o responsável pela evolução do membro.",
  ].join("\n"),

  [
    "## 📦 MÓDULO 7 — SISTEMAS AUXILIARES",
    "",
    "Além dos principais, temos sistemas essenciais para o dia a dia:",
    "",
    "**🎁 Doações (!doacao)**",
    "• Registra itens doados para a empresa.",
    "• **Anti-farm:** Pontua 1x por hora no ranking geral.",
    "",
    "**📨 Convites Líderes**",
    "• Sistema para enviar convites formais para líderes de orgs.",
    "• Dispara em todos os canais de líderes e DMs automaticamente.",
    "",
    "**💎 VIP Evento**",
    "• Registra premiações ganhas em eventos.",
    "• Fluxo: Criar -> Solicitar -> Pagar (tudo via bot).",
    "",
    "**❓ Perguntas (!perguntas)**",
    "• Banco de dados de respostas rápidas para entrevistas e suporte.",
  ].join("\n"),

  [
    "## 🔐 MÓDULO 8 — QUEM PODE USAR SISTEMAS",
    "",
    "Acesso não é bagunça. Apenas cargos específicos podem operar:",
    "",
    "✅ **Autorizados:**",
    "• Owner",
    "• Coordenação",
    "• Resp Creators / Resp Influ / Resp Líder",
    "• MKT (quando autorizado)",
    "",
    "🚫 **Proibidos:**",
    "• Qualquer um fora da lista acima, mesmo que tenha cargo alto em outra área.",
    "• **Curiosidade não é autorização.**",
  ].join("\n"),

  [
    "## 🧑‍💼 MÓDULO 9 — RESPONSABILIDADE E AUTORIDADE",
    "",
    "**🛡️ Resolver > Empurrar**",
    "• Sua função é resolver problemas, não passá-los para frente.",
    "• Se você errou, corrija. Se viu um erro, ajude a arrumar.",
    "",
    "**⚡ Autoridade Real**",
    "• Autoridade vem de **agir**, não de mandar.",
    "• Um bom Coordenador/Responsável resolve conflitos sem precisar chamar o Owner.",
    "",
    "**Exemplo:**",
    "❌ *'Vou ver com o dono.'* (para tudo)",
    "✅ *'Vou resolver isso agora e te aviso.'* (postura correta)",
  ].join("\n"),

  [
    "## 🛠️ MÓDULO 10 — SUPORTE E POSTURA",
    "",
    "**🤝 Pilares do Atendimento**",
    "1. **Empatia:** Entenda a dor do outro.",
    "2. **Escuta Ativa:** Leia tudo antes de responder.",
    "3. **Clareza:** Fale a língua da pessoa, sem tecniquês desnecessário.",
    "4. **Profissionalismo:** Nunca perca a calma.",
    "5. **Gratidão:** Sempre agradeça o contato.",
    "",
    "**💻 Comandos Úteis (Ferramentas)**",
    "`/filternewbie` — Filtrar novatos.",
    "`/propmanager` — Gerenciar propriedades.",
    "`/qru` — Consultas rápidas.",
    "`/sourceid` — Identificar origem.",
    "`/wallconfig2` — Configuração avançada de wall (apenas autorizados).",
  ].join("\n"),

  [
    "## 🚫 MÓDULO 11 — USO DE PODER (CRÍTICO)",
    "",
    "**⚠️ LEIA COM ATENÇÃO MÁXIMA ⚠️**",
    "O abuso de poder é a falha mais grave possível.",
    "",
    "🔥 **ABS (Abuso) = BAN / BLACKLIST**",
    "",
    "• **Wall:** Permitido APENAS no NC (Noclip) para moderar.",
    "• **God:** Permitido seguindo as regras de uso d poderes escritas na sua aba.",
    "• **Fix (Reparar):** PROIBIDO em benefício próprio ou de amigos.(usar somente em eventos nossos)",
    "• **DV (Deletar Veículo):** Apenas em eventos ou limpeza de área (sem prejudicar RP).",
    "",
    "🛑 **Powers ≠ RP**",
    "Nunca use poderes administrativos para ganhar vantagem no Roleplay.",
  ].join("\n"),

  [
    "## 🔫 MÓDULO 12 — REGRAS DE AÇÃO E ASSALTO",
    "",
    "Separe o administrativo do RP de rua.",
    "",
    "**📢 Voz de Assalto**",
    "• Deve ser clara e audível.",
    "• 'Desce e quebra' é regra básica de rendição.",
    "",
    "**🗺️ Zonas**",
    "• **Sul vs Norte:** Respeite as dinâmicas de cada região.",
    "• **Áreas Populosas:** Evite ações agressivas em praças/hospitais (Safe Zones).",
    "",
    "**🚨 Conduta**",
    "• Não entrose em ação alheia.",
    "• Respeite os blips e procurados.",
    "• Não misture sistemas internos (painéis) com ações de tiro.",
  ].join("\n"),

  [
    "## 👑 MÓDULO 13 — PERFIL DE UM BOM RESPONSÁVEL",
    "",
    "O que esperamos de você na liderança:",
    "",
    "👂 **Saber Ouvir:** Antes de julgar, escute os dois lados.",
    "🤝 **Não Impor:** Lidere pelo respeito, não pelo medo.",
    "👔 **Postura:** Você representa a SantaCreators 24h.",
    "💜 **Cultura:** Passe os valores da cidade para os novatos.",
    "🎧 **Presença:** Esteja em call. Quem não é visto, não é lembrado.",
    "🦁 **Exemplo:** Seja o primeiro a seguir as regras que você cobra.",
  ].join("\n"),

  [
    "## 📅 MÓDULO 14 — EVENTOS E PREMIAÇÕES",
    "",
    "Informações cruciais sobre agenda e aprovação de prêmios.",
    "",
    "**🗓️ Planejamento Semanal**",
    "• Todo **Domingo**, os eventos da semana precisam estar prontos o quanto antes.",
    "",
    "**📍 Agenda de Cidades**",
    "• **Terça:** Cidade Grande (Horário fixo: 19:00).",
    "• **Quarta:** Cidade Santa.",
    "• **Quinta:** Cidade Nobre (Evento Fixo: **Missão Rosa** — não muda).",
    "• **Outros dias:** Pode escolher qualquer outro evento.",
    "",
    "**🎁 Aprovação de Premiações**",
    "• **VIPs Solicitáveis:** Podem ser aprovados direto.",
    "• **VIPs Comerciais (Lançamento, Ouro, etc):** Precisa da aprovação do **Macedo**.",
    "• **Dinheiro:** Solicitar através do **Resp Influ** ou **Resp Creators**.",
  ].join("\n"),

  [
    "## 🏁 MÓDULO 15 — ENCERRAMENTO",
    "",
    "**Conclusão do Treinamento**",
    "",
    "• Um RP organizado dura anos. A bagunça dura dias.",
    "• Nossas métricas garantem justiça: quem trabalha, aparece.",
    "• O registro é a nossa verdade.",
    "",
    "✅ **Você concluiu o Aulão SantaCreators.**",
    "Se você leu e entendeu tudo, você está pronto para operar com excelência.",
    "",
    "*SantaCreators — Diversão com Estrutura.*",
  ].join("\n"),
];

const MODULOS_GERAL = [
  new EmbedBuilder().setColor(COLORS.ROXO_SC).setTitle("🟣 MÓDULO 1 — O QUE É A SANTACREATORS").setDescription("\u200b").setImage(IMGS.BANNER).setThumbnail(IMGS.ICON),
  new EmbedBuilder().setColor(COLORS.AZUL_CLARO).setTitle("🎫 MÓDULO 2 — O QUE É MKT TICKET").setDescription("\u200b").setImage(IMGS.BANNER).setThumbnail(IMGS.ICON),
  new EmbedBuilder().setColor(COLORS.AMARELO_WARN).setTitle("⚠️ MÓDULO 3 — REGRA DE OURO DOS BOTÕES").setDescription("\u200b").setImage(IMGS.BANNER).setThumbnail(IMGS.ICON),
  new EmbedBuilder().setColor(COLORS.VERDE_OK).setTitle("📊 MÓDULO 4 — GRÁFICOS E DASHBOARDS").setDescription("\u200b").setImage(IMGS.CHART_PLACEHOLDER).setThumbnail(IMGS.ICON),
  new EmbedBuilder().setColor(COLORS.ROXO_SC).setTitle("📈 MÓDULO 5 — FACs E COMPARATIVOS").setDescription("\u200b").setImage(IMGS.BANNER).setThumbnail(IMGS.ICON),
  new EmbedBuilder().setColor(COLORS.ROSA_SC).setTitle("💎 MÓDULO 6 — GESTÃO INFLUENCER").setDescription("\u200b").setImage(IMGS.BANNER).setThumbnail(IMGS.ICON),
  new EmbedBuilder().setColor(COLORS.AZUL_CLARO).setTitle("📦 MÓDULO 7 — SISTEMAS AUXILIARES").setDescription("\u200b").setImage(IMGS.BANNER).setThumbnail(IMGS.ICON),
  new EmbedBuilder().setColor(COLORS.DARK).setTitle("🔐 MÓDULO 8 — QUEM PODE USAR SISTEMAS").setDescription("\u200b").setImage(IMGS.BANNER).setThumbnail(IMGS.ICON),
  new EmbedBuilder().setColor(COLORS.AZUL_CLARO).setTitle("🧑‍💼 MÓDULO 9 — RESPONSABILIDADE E AUTORIDADE").setDescription("\u200b").setImage(IMGS.BANNER).setThumbnail(IMGS.ICON),
  new EmbedBuilder().setColor(COLORS.VERDE_OK).setTitle("🛠️ MÓDULO 10 — SUPORTE E POSTURA").setDescription("\u200b").setImage(IMGS.BANNER).setThumbnail(IMGS.ICON),
  new EmbedBuilder().setColor(COLORS.VERMELHO_ERR).setTitle("🚫 MÓDULO 11 — USO DE PODER (CRÍTICO)").setDescription("\u200b").setImage(IMGS.BANNER).setThumbnail(IMGS.ICON),
  new EmbedBuilder().setColor(COLORS.AMARELO_WARN).setTitle("🔫 MÓDULO 12 — REGRAS DE AÇÃO E ASSALTO").setDescription("\u200b").setImage(IMGS.BANNER).setThumbnail(IMGS.ICON),
  new EmbedBuilder().setColor(COLORS.AMARELO_WARN).setTitle("👑 MÓDULO 13 — PERFIL DE UM BOM RESPONSÁVEL").setDescription("\u200b").setImage(IMGS.BANNER).setThumbnail(IMGS.ICON),
  new EmbedBuilder().setColor(COLORS.AZUL_CLARO).setTitle("📅 MÓDULO 14 — EVENTOS E PREMIAÇÕES").setDescription("\u200b").setImage(IMGS.BANNER).setThumbnail(IMGS.ICON),
  new EmbedBuilder().setColor(COLORS.ROSA_SC).setTitle("🏁 MÓDULO 15 — ENCERRAMENTO").setDescription("\u200b").setImage(IMGS.BANNER).setThumbnail(IMGS.ICON),
];

// =====================================================
// [AULÃO 2] CONTEÚDO RESPONSÁVEIS (Hierarquia e Evolução)
// =====================================================
const SLIDE_CONTENT_RESP = [
  [
    "## 🟣 1. INTRODUÇÃO E MOTIVAÇÃO",
    "",
    "**👋 O Começo da Jornada**",
    "• Ao receber um membro novo, a primeira coisa é **motivá-lo**.",
    "• Pergunte se está bem, crie conexão.",
    "",
    "**🚫 Entrevista sem IA**",
    "• Avise para ler com calma e **não usar Inteligência Artificial**.",
    "• Queremos respostas com as palavras dele. Identificamos Ctrl+C/Ctrl+V.",
    "",
    "**🎯 Propósito**",
    "• Fale sobre nossos objetivos, projetos e a importância do **Roleplay**.",
    "• Para ter o primeiro cargo (<@&1371733765243670538> 5), ele precisa saber **contratar em game** (fazer a entrevista).",
  ].join("\n"),

  [
    "## 🎯 2. AUTONOMIA COM GESTAOINFLUENCER 5",
    "",
    "Se você já é **Equipe Creator** (<@&1352429001188180039>) e quer autonomia para usar comandos do **<@&1371733765243670538> 5**, precisa dominar:",
    "",
    "**✅ O que você precisa saber e explicar:**",
    "• **Contratações na cidade:** Como funciona e cuidados.",
    "• **Regras de conduta:** Postura e limites.",
    "• **Baús:** Tipos e regras de uso.",
    "• **Vestes e uniforme:** Quando e como usar.",
    "• **Garagem e veículos:** Regras e responsabilidades.",
    "",
    "**🛠️ Benefícios:**",
    "• Apoiar em eventos.",
    "• Acesso à <@&1275543428201058427>.",
    "• Recursos para conflitos no RP.",
  ].join("\n"),

  [
    "## 📌 3. CARGO FINAL E SETAGEM",
    "",
    "Quando o membro estiver apto a contratar em game (com OK de um **<@&1388976314253312100>** ou **<@&1352407252216184833>**), ele recebe:",
    "",
    "**✅ Cargos Obrigatórios:**",
    "• <@&1352939011253076000> (Equipe Creator na cidade)",
    "• <@&1371733765243670538> 5 (Poderes nível 5)",
    "",
    "**⚠️ Atenção:**",
    "• Se um Coord estiver ensinando, precisa de outro Coord ou Resp para validar.",
    "• **Despausar o controle GI** no canal <#1417366889398796318> para liberar o cargo de poderes.",
  ].join("\n"),

  [
    "## 🧭 4. ÁREAS DE DESENVOLVIMENTO",
    "",
    "Após a base, ajude o membro a escolher sua área:",
    "",
    "**📱 Social Medias** (<@&1388976094920704141>)",
    "• Foco em divulgação, clips, engajamento.",
    "• Detalhes em: <#1415461305858654280>",
    "",
    "**🎯 Manager Creators** (<@&1388976155830255697>)",
    "• Foco em parcerias, organizações e gestão.",
    "• Detalhes em: <#1415464356933664961>",
    "",
    "**💡 Dica:**",
    "• Verifique se a equipe não está cheia (<#1411878799561457765>).",
    "• O membro pode ficar apenas como <@&1352429001188180039> ajudando em ambas até decidir.",
  ].join("\n"),

  [
    "## 📈 5. ORDEM DE CARGOS E EVOLUÇÃO",
    "",
    "**1️⃣ Entrada (Sem Poderes):**",
    "• <@&1352429001188180039> + <@&1352493359897378941> + <@&1352275728476930099>",
    "",
    "**2️⃣ Com Poderes (Sabe Contratar):**",
    "• Adiciona: <@&1352939011253076000> + <@&1371733765243670538> 5",
    "• **Discord:** Define a área (<@&1392678638176043029> OU <@&1387253972661964840>). Nunca os dois!",
    "",
    "**🏙️ Nas Cidades (Grande/Nobre/Santa):**",
    "• Entra como **Estagiário**.",
    "• Aprendeu a contratar? Vira **<@&1379262716564471971>**.",
    "",
    "**📅 Sábados:** Dia de feedback obrigatório para todos (mesmo novatos).",
  ].join("\n"),

  [
    "## 🔵 6. GESTAOINFLUENCER 4 — COORDENAÇÃO CRIATIVA",
    "",
    "**📌 Como alcançar:**",
    "• Entregou resultados constantes como Creator.",
    "• Envolvido em entrevistas, suporte e eventos.",
    "• Indicado para liderança (Social Media, Gestor, Manager).",
    "",
    "**🔧 Permissões:**",
    "• Comandos avançados: `car`, `dv`, `setpreset`, `cleanarea`, `rec`, `tuning`...",
    "",
    "**🔄 Mudança de Cargos:**",
    "• Remove: <@&1352939011253076000> e Equipes Creators.",
    "• Adiciona: **<@&1352385500614234134>** + Cargo da Área de UP (<@&1388976155830255697> OU <@&1388976094920704141>).",
    "• Na cidade: Vira **<@&1371733765243670538> 4**.",
  ].join("\n"),

  [
    "## 🌸 7. GESTAOINFLUENCER 3 — RESPONSÁVEL DE LIDERANÇA",
    "",
    "**📌 Como alcançar:**",
    "• Já é Coord. Creator ou função coordenativa.",
    "• Liderança ativa, atua em todas as áreas.",
    "• Sabe executar, cobrar e ensinar tudo.",
    "",
    "**🔧 Permissões:**",
    "• Alto impacto: `dvarea`, `godarea`, `patrimônio`, `wall`, `mute`, `invicar`...",
    "",
    "**🎯 Responsabilidades:**",
    "• Cobrança e auxílio à coordenação.",
    "• Aprovação de promoções.",
    "• Reforço semanal de regras.",
    "",
    "**🧠 Perfil:** <@&1352407252216184833>",
    "• Referência prática. Sabe ensinar e cobrar com equilíbrio.",
  ].join("\n"),

  [
    "## 🚀 8. CRESCENDO ALÉM DE RESP. LÍDER",
    "",
    "Para subir além de **<@&1352385500614234134>**:",
    "",
    "**✅ O Primeiro Passo:**",
    "• Domine completamente sua área (<@&1388976155830255697> ou <@&1388976094920704141>).",
    "",
    "**🔄 O Próximo Nível:**",
    "• Una forças! Atue em **ambas as frentes**.",
    "• Ajude no desenvolvimento dos times de Manager E Social Media.",
    "",
    "**🏆 O Objetivo:**",
    "• Demonstrar equilíbrio e parceria entre as áreas mostra potencial para **<@&1352407252216184833>** (GI 3).",
  ].join("\n"),

  [
    "## 🌟 9. GESTAOINFLUENCER 2 — RESPONSÁVEL DE INFLUÊNCIA",
    "",
    "**📌 Como alcançar:**",
    "• Domínio total da gestão criativa.",
    "• Postura consolidada como líder (confiável, coerente, presente).",
    "• Reconhecido pela alta gestão (Resp Creator e Owner).",
    "",
    "**🔧 Permissões:**",
    "• Gestão avançada: `vipboost`, `godmode`, `superman`, `item`, `timeset`, `group`...",
    "",
    "**🎯 Papel:**",
    "• Apoio macro em toda a gestão.",
    "• Atuação estratégica ao lado da liderança.",
    "• Cobertura de qualquer área necessária.",
    "",
    "**🧠 Perfil:** <@&1262262852949905409>",
    "• Cabeça de dono. Ativo no macro, expandindo a SantaCreators.",
  ].join("\n"),

  [
    "## 🎯 10. EVOLUÇÃO FINAL — O RESPONSÁVEL DE INFLUÊNCIA",
    "",
    "**✅ O que define um <@&1262262852949905409>:**",
    "• Responsabilidade, Confiança, Credibilidade.",
    "• É o **'OK' da hierarquia**, referência para todos abaixo.",
    "",
    "**🔄 Atitude:**",
    "• **Não espera:** Se falta alguém, ele assume.",
    "• **Não hesita:** Tem noção de tudo que acontece.",
    "",
    "**🚨 Presença Crucial:**",
    "• É obrigação estar ciente de tudo na <@&1275543428201058427>.",
    "• Em eventos da empresa, a presença de um **<@&1262262852949905409>** é **INDISPENSÁVEL**.",
  ].join("\n"),
];

const MODULOS_RESP = [
  new EmbedBuilder().setColor(COLORS.ROXO_SC).setTitle("🟣 1. INTRODUÇÃO E MOTIVAÇÃO").setDescription("\u200b").setImage(IMGS.BANNER).setThumbnail(IMGS.ICON),
  new EmbedBuilder().setColor(COLORS.AZUL_CLARO).setTitle("🎯 2. AUTONOMIA COM GESTAOINFLUENCER 5").setDescription("\u200b").setImage(IMGS.BANNER).setThumbnail(IMGS.ICON),
  new EmbedBuilder().setColor(COLORS.VERDE_OK).setTitle("📌 3. CARGO FINAL E SETAGEM").setDescription("\u200b").setImage(IMGS.BANNER).setThumbnail(IMGS.ICON),
  new EmbedBuilder().setColor(COLORS.ROSA_SC).setTitle("🧭 4. ÁREAS DE DESENVOLVIMENTO").setDescription("\u200b").setImage(IMGS.BANNER).setThumbnail(IMGS.ICON),
  new EmbedBuilder().setColor(COLORS.AMARELO_WARN).setTitle("📈 5. ORDEM DE CARGOS E EVOLUÇÃO").setDescription("\u200b").setImage(IMGS.BANNER).setThumbnail(IMGS.ICON),
  new EmbedBuilder().setColor(COLORS.COORD_BLUE).setTitle("🔵 6. GESTAOINFLUENCER 4 — COORDENAÇÃO").setDescription("\u200b").setImage(IMGS.BANNER).setThumbnail(IMGS.ICON),
  new EmbedBuilder().setColor(COLORS.RESP_PINK).setTitle("🌸 7. GESTAOINFLUENCER 3 — RESP. LÍDER").setDescription("\u200b").setImage(IMGS.BANNER).setThumbnail(IMGS.ICON),
  new EmbedBuilder().setColor(COLORS.ROXO_SC).setTitle("🚀 8. CRESCENDO ALÉM DE RESP. LÍDER").setDescription("\u200b").setImage(IMGS.BANNER).setThumbnail(IMGS.ICON),
  new EmbedBuilder().setColor(COLORS.GOLD).setTitle("🌟 9. GESTAOINFLUENCER 2 — RESP. INFLUÊNCIA").setDescription("\u200b").setImage(IMGS.BANNER).setThumbnail(IMGS.ICON),
  new EmbedBuilder().setColor(COLORS.GOLD).setTitle("🎯 10. EVOLUÇÃO FINAL").setDescription("\u200b").setImage(IMGS.BANNER).setThumbnail(IMGS.ICON),
];

// =====================================================
// HELPERS
// =====================================================
function buildSlideContent(index, contentArray) {
  const total = contentArray.length;
  const header = `**Slide ${index + 1}/${total}**`;
  const body = contentArray[index] || "";
  return body ? `${header}\n\n${body}` : header;
}

// =====================================================
// FUNÇÕES EXPORTADAS
// =====================================================

/**
 * Comandos:
 * !iniciaraulao -> Aulão Geral
 * !aulaoresp    -> Aulão de Responsáveis/Hierarquia
 */
export async function aulaoHandleMessage(message, client) {
  if (!message.guild || message.author.bot) return false;

  const content = message.content.toLowerCase().trim();

  // --- AULÃO GERAL ---
  if (content.startsWith("!iniciaraulao")) {
    if (message.author.id !== AULAO_CONFIG.ALLOWED_USER_ID) {
      await message.reply("🚫 Apenas o administrador autorizado pode iniciar o sistema de aulão.");
      return true;
    }
    if (!AULAO_CONFIG.ALLOWED_CHANNELS.includes(message.channel.id)) {
      const channels = AULAO_CONFIG.ALLOWED_CHANNELS.map(id => `<#${id}>`).join(" ou ");
      await message.reply(`⚠️ Este comando deve ser usado no canal ${channels}.`);
      return true;
    }

    await message.delete().catch(() => {});

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(AULAO_CONFIG.BTN_START_ID)
        .setLabel("✅ Iniciar Aulão SantaCreators (Geral)")
        .setStyle(ButtonStyle.Success)
        .setEmoji("📚")
    );

    await message.channel.send({
      content: "**Painel de Controle — Aulão SantaCreators (Geral)**\nClique abaixo para iniciar a apresentação slide por slide.",
      components: [row],
    });
    return true;
  }

  // --- AULÃO RESPONSÁVEIS ---
  if (content.startsWith("!aulaoresp")) {
    if (message.author.id !== AULAO_CONFIG.ALLOWED_USER_ID) {
      await message.reply("🚫 Apenas o administrador autorizado pode iniciar o sistema de aulão.");
      return true;
    }
    if (!AULAO_CONFIG.ALLOWED_CHANNELS.includes(message.channel.id)) {
      const channels = AULAO_CONFIG.ALLOWED_CHANNELS.map(id => `<#${id}>`).join(" ou ");
      await message.reply(`⚠️ Este comando deve ser usado no canal ${channels}.`);
      return true;
    }

    await message.delete().catch(() => {});

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(AULAO_CONFIG.BTN_START_RESP_ID)
        .setLabel("✅ Iniciar Aulão Hierarquia (Resp)")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("👑")
    );

    await message.channel.send({
      content: "**Painel de Controle — Aulão Hierarquia & Evolução**\nClique abaixo para iniciar a apresentação sobre cargos e responsabilidades.",
      components: [row],
    });
    return true;
  }

  return false;
}

/**
 * Interação dos Botões
 */
export async function aulaoHandleInteraction(interaction, client) {
  if (!interaction.isButton()) return false;

  const customId = interaction.customId;

  // =====================================================
  // FLUXO 1: AULÃO GERAL
  // =====================================================

  // 1.1 Iniciar Geral
  if (customId === AULAO_CONFIG.BTN_START_ID) {
    if (interaction.user.id !== AULAO_CONFIG.ALLOWED_USER_ID) {
      await interaction.reply({ content: "🚫 Sem permissão.", ephemeral: true });
      return true;
    }

    await interaction.reply({ content: "🚀 Iniciando Aulão Geral...", ephemeral: true });

    const embed = MODULOS_GERAL[0];
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${AULAO_CONFIG.BTN_NEXT_PREFIX}1`)
        .setLabel("➡️ Próximo Slide")
        .setStyle(ButtonStyle.Primary)
    );

    await interaction.channel.send({
      content: buildSlideContent(0, SLIDE_CONTENT_GERAL),
      embeds: [embed],
      components: [row],
    });
    return true;
  }

  // 1.2 Próximo Slide Geral
  if (customId.startsWith(AULAO_CONFIG.BTN_NEXT_PREFIX)) {
    if (interaction.user.id !== AULAO_CONFIG.ALLOWED_USER_ID) {
      await interaction.reply({ content: "🚫 Sem permissão.", ephemeral: true });
      return true;
    }

    const nextIndex = parseInt(customId.replace(AULAO_CONFIG.BTN_NEXT_PREFIX, ""), 10);

    try { await interaction.message.edit({ components: [] }); } catch {}

    if (Number.isNaN(nextIndex) || nextIndex >= MODULOS_GERAL.length) {
      await interaction.reply({ content: "✅ Aulão Geral finalizado!", ephemeral: true });
      return true;
    }

    const embed = MODULOS_GERAL[nextIndex];
    const isLast = nextIndex === MODULOS_GERAL.length - 1;

    const components = [];
    if (!isLast) {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${AULAO_CONFIG.BTN_NEXT_PREFIX}${nextIndex + 1}`)
          .setLabel("➡️ Próximo Slide")
          .setStyle(ButtonStyle.Primary)
      );
      components.push(row);
    } else {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("btn_aulao_finish")
          .setLabel("✅ Finalizar Apresentação")
          .setStyle(ButtonStyle.Success)
          .setDisabled(true)
      );
      components.push(row);
    }

    await interaction.deferUpdate();
    await interaction.channel.send({
      content: buildSlideContent(nextIndex, SLIDE_CONTENT_GERAL),
      embeds: [embed],
      components,
    });
    return true;
  }

  // =====================================================
  // FLUXO 2: AULÃO RESPONSÁVEIS (HIERARQUIA)
  // =====================================================

  // 2.1 Iniciar Resp
  if (customId === AULAO_CONFIG.BTN_START_RESP_ID) {
    if (interaction.user.id !== AULAO_CONFIG.ALLOWED_USER_ID) {
      await interaction.reply({ content: "🚫 Sem permissão.", ephemeral: true });
      return true;
    }

    await interaction.reply({ content: "🚀 Iniciando Aulão Hierarquia...", ephemeral: true });

    const embed = MODULOS_RESP[0];
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${AULAO_CONFIG.BTN_NEXT_RESP_PREFIX}1`)
        .setLabel("➡️ Próximo Slide (Resp)")
        .setStyle(ButtonStyle.Primary)
    );

    await interaction.channel.send({
      content: buildSlideContent(0, SLIDE_CONTENT_RESP),
      embeds: [embed],
      components: [row],
    });
    return true;
  }

  // 2.2 Próximo Slide Resp
  if (customId.startsWith(AULAO_CONFIG.BTN_NEXT_RESP_PREFIX)) {
    if (interaction.user.id !== AULAO_CONFIG.ALLOWED_USER_ID) {
      await interaction.reply({ content: "🚫 Sem permissão.", ephemeral: true });
      return true;
    }

    const nextIndex = parseInt(customId.replace(AULAO_CONFIG.BTN_NEXT_RESP_PREFIX, ""), 10);

    try { await interaction.message.edit({ components: [] }); } catch {}

    if (Number.isNaN(nextIndex) || nextIndex >= MODULOS_RESP.length) {
      await interaction.reply({ content: "✅ Aulão Hierarquia finalizado!", ephemeral: true });
      return true;
    }

    const embed = MODULOS_RESP[nextIndex];
    const isLast = nextIndex === MODULOS_RESP.length - 1;

    const components = [];
    if (!isLast) {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${AULAO_CONFIG.BTN_NEXT_RESP_PREFIX}${nextIndex + 1}`)
          .setLabel("➡️ Próximo Slide (Resp)")
          .setStyle(ButtonStyle.Primary)
      );
      components.push(row);
    } else {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("btn_aulao_resp_finish")
          .setLabel("✅ Finalizar Hierarquia")
          .setStyle(ButtonStyle.Success)
          .setDisabled(true)
      );
      components.push(row);
    }

    await interaction.deferUpdate();
    await interaction.channel.send({
      content: buildSlideContent(nextIndex, SLIDE_CONTENT_RESP),
      embeds: [embed],
      components,
    });
    return true;
  }

  return false;
}
