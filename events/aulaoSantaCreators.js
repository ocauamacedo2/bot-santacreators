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

  // Configuração do Aulão 3 (MKT Creators)
  BTN_START_MKT_ID: "btn_start_aulao_mkt",
  BTN_NEXT_MKT_PREFIX: "btn_aulao_mkt_next_",
};

// Imagens e Cores
const IMGS = {
  BANNER:
    "https://media.discordapp.net/attachments/1362477839944777889/1384245215249825832/standard_2rss.gif",
  ICON:
    "https://media.discordapp.net/attachments/1362477839944777889/1368084293905285170/sc2.png",
  CHART_PLACEHOLDER:
    "https://quickchart.io/chart?c=%7B%22type%22%3A%22bar%22%2C%22data%22%3A%7B%22labels%22%3A%5B%22Semana%201%22%2C%22Semana%202%22%2C%22Semana%203%22%2C%22Atual%22%5D%2C%22datasets%22%3A%5B%7B%22label%22%3A%22ORGs%20Aprovadas%22%2C%22data%22%3A%5B25%2C32%2C38%2C45%5D%2C%22backgroundColor%22%3A%5B%22%23fee75c%22%2C%22%23faa61a%22%2C%22%23faa61a%22%2C%22%2357f287%22%5D%7D%5D%7D%2C%22options%22%3A%7B%22legend%22%3A%7B%22display%22%3Afalse%7D%2C%22title%22%3A%7B%22display%22%3Atrue%2C%22text%22%3A%22Exemplo%20Visual%20-%20Gr%C3%A1fico%20de%20Desempenho%22%2C%22fontColor%22%3A%22%23fff%22%7D%7D%7D&width=500&height=300&backgroundColor=transparent",
  MKT_CHART_METRICAS:
    "https://quickchart.io/chart?c=%7B%22type%22%3A%22bar%22%2C%22data%22%3A%7B%22labels%22%3A%5B%22Manager%22%2C%22Social%22%2C%22Eventos%22%2C%22Poderes%22%5D%2C%22datasets%22%3A%5B%7B%22label%22%3A%22Meta%20Alcan%C3%A7ada%22%2C%22data%22%3A%5B90%2C85%2C95%2C100%5D%2C%22backgroundColor%22%3A%22%232ecc71%22%7D%5D%7D%7D&width=500&height=300&backgroundColor=transparent",
  MKT_CHART_PROGRESSO:
    "https://quickchart.io/chart?c=%7B%22type%22%3A%22line%22%2C%22data%22%3A%7B%22labels%22%3A%5B%22M%C3%AAs%201%22%2C%22M%C3%AAs%202%22%2C%22M%C3%AAs%203%22%5D%2C%22datasets%22%3A%5B%7B%22label%22%3A%22Evolu%C3%A7%C3%A3o%22%2C%22data%22%3A%5B10%2C40%2C85%5D%2C%22borderColor%22%3A%22%23ff009a%22%2C%22fill%22%3Afalse%7D%5D%7D%7D&width=500&height=300&backgroundColor=transparent",
  MKT_CHART_RETENCAO:
    "https://quickchart.io/chart?c=%7B%22type%22%3A%22doughnut%22%2C%22data%22%3A%7B%22labels%22%3A%5B%22Ativos%22%2C%22Pausados%22%5D%2C%22datasets%22%3A%5B%7B%22data%22%3A%5B80%2C20%5D%2C%22backgroundColor%22%3A%5B%22%233498db%22%2C%22%23e74c3c%22%5D%7D%5D%7D%7D&width=500&height=300&backgroundColor=transparent",
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
// [AULÃO 3] MKT CREATORS (Certificação Completa)
// =====================================================
const SLIDE_CONTENT_MKT = [
  [
    "## 🎓 MÓDULO 1 — O QUE É O CERTIFICADO MKT CREATORS",
    "",
    "**✅ Validação de Competência**",
    "O certificado valida que você domina os sistemas da empresa e está apto a operar com excelência.",
    "",
    "**🧠 Mais que um Cargo**",
    "• Não é apenas um título, é uma **responsabilidade**.",
    "• Você representa a imagem da SantaCreators perante a comunidade e parceiros.",
    "",
    "**🎯 O que você deve dominar:**",
    "• Atendimento ao cliente e suporte.",
    "• Operação técnica de botões e sistemas.",
    "• Condução de entrevistas e gestão de cargos.",
    "• Postura, cultura e regras de RP.",
  ].join("\n"),

  [
    "## 💜 MÓDULO 2 — CULTURA SANTACREATORS",
    "",
    "**🤝 Seja Gente Boa**",
    "A base da nossa empresa é o respeito e a parceria.",
    "",
    "**🚫 O que nos afasta:**",
    "• **Ego:** Ninguém é maior que a estrutura.",
    "• **Fuxico:** Fofocas destroem o ambiente e não agregam valor.",
    "• **Má Conduta:** Atitudes tóxicas geram afastamento imediato.",
    "",
    "**⚡ Maturidade**",
    "Quem tem acesso a ferramentas de gestão precisa agir com equilíbrio e seriedade.",
  ].join("\n"),

  [
    "## 🛑 MÓDULO 3 — REGRA DE OURO DOS BOTÕES",
    "",
    "**⚠️ NÃO CLIQUE POR CURIOSIDADE**",
    "Nossos botões executam ações em tempo real no banco de dados.",
    "",
    "**📑 Rastro Digital**",
    "• Todo botão gera um **log** com seu nome e horário.",
    "• Erros operacionais afetam pagamentos, rankings e métricas estratégicas.",
    "",
    "**🧠 Obligatoriedade**",
    "> **Se não entende 100% da função: PERGUNTE.**",
    "Negligência técnica é passível de punição.",
  ].join("\n"),

  [
    "## ⚙️ MÓDULO 4 — SISTEMAS PRINCIPAIS DO MKT",
    "",
    "Conheça seus locais de trabalho:",
    "",
    "• **Alinhamentos:** [Clique aqui](https://discord.com/channels/1262262852782129183/1425256185707233301)",
    "• **Pagamentos:** [Clique aqui](https://discord.com/channels/1262262852782129183/1387922662134775818)",
    "• **Registro Manager:** [Clique aqui](https://discord.com/channels/1262262852782129183/1392680204517769277)",
    "• **ORGs Não Convidadas:** [Clique aqui](https://discord.com/channels/1262262852782129183/1465142628839456829)",
    "• **ORGs Confirmadas:** [Clique aqui](https://discord.com/channels/1262262852782129183/1400280714548744252)",
    "• **Convite DM Líderes:** [Clique aqui](https://discord.com/channels/1262262852782129183/1414718856542421052)",
    "• **Poderes em Eventos:** [Clique aqui](https://discord.com/channels/1262262852782129183/1392618646630568076)",
    "• **Poderes Diários:** [Clique aqui](https://discord.com/channels/1262262852782129183/1374066813171929218)",
  ].join("\n"),

  [
    "## 🎙️ MÓDULO 5 — ENTREVISTAS",
    "",
    "**❓ Comando `!perguntas`**",
    "• Use **apenas** dentro de tickets de entrevista.",
    "• É proibido o uso em canais públicos ou de suporte.",
    "",
    "**📝 Correção e IA**",
    "• O candidato **não pode** usar IA ou copiar respostas.",
    "• Use `!correcao <números>` para apontar erros (Ex: `!correcao 1 5 10`).",
    "",
    "**🤝 Papel do Entrevistador**",
    "Motive o candidato e explique a importância da nossa cultura.",
  ].join("\n"),

  [
    "## 👔 MÓDULO 6 — GESTÃO DE CARGOS",
    "",
    "Operação de cargos via comandos:",
    "",
    "• `!addcargo <@cargo> <@user>` — Adicionar.",
    "• `!remcargo <@cargo> <@user>` — Remover.",
    "• `!criarcargo <Nome> | <Cor>` — Novo cargo.",
    "• `!copycargo <@cargo>` — Clonar permissões.",
    "",
    "**📍 Local Correto:** Canal **GERAL BOT** Aqui.",
    "",
    "**⚠️ Regras:** Respeite a hierarquia e **nunca** mexa em cargos protegidos.",
  ].join("\n"),

  [
    "## 📊 MÓDULO 7 — ORGANIZAÇÃO E MANAGERS",
    "",
    "**🗓️ Controle de ORGs**",
    "• Diferencie ORGs confirmadas de não convidadas.",
    "• O Registro Manager é o coração das nossas métricas semanais.",
    "",
    "**🎯 Qualidade da Informação**",
    "• Dados errados sabotam a estratégia da empresa.",
    "• Ser Manager não é só 'clicar', é acompanhar o desenvolvimento da parceria.",
  ].join("\n"),

  [
    "## 🏙️ MÓDULO 8 — CONTRATAÇÃO IN-GAME",
    "",
    "Siga o fluxo padrão ao recrutar na cidade:",
    "",
    "1. Encontre o cidadão na SantaCreators.",
    "2. Realize a contratação técnica.",
    "3. **Apresentação:** Mostre o prédio e as instalações.",
    "4. **Explicação:** Baús, garagens, regras de imersão.",
    "5. **Regras:** Repasse o básico da cidade e conduta.",
    "6. **Cultura:** Oriente sobre a postura esperada.",
  ].join("\n"),

  [
    "## 🛠️ MÓDULO 9 — SUPORTE",
    "",
    "**🤝 Atendimento Premium**",
    "• Empatia e escuta ativa são obrigatórias.",
    "• Transparência no tempo de resposta e agradecimento final.",
    "",
    "**💻 Slash Commands Úteis:**",
    "• `/filternewbie` | `/propmanager` | `/qru` | `/sourceid` | `/wallconfig2`",
  ].join("\n"),

  [
    "## 🧑‍💼 MÓDULO 10 — RESPONSABILIDADE",
    "",
    "**🛡️ Ownership (Dono do Problema)**",
    "• Nunca use 'não tenho autoridade' como desculpa.",
    "• Coordenação e Responsáveis devem ter **iniciativa**.",
    "• Chegue com a **solução**, não apenas com o problema.",
    "• Se errou, admita e corrija imediatamente.",
  ].join("\n"),

  [
    "## 📈 MÓDULO 11 — DASHBOARDS E MÉTRICAS",
    "",
    "**📊 Inteligência de Dados**",
    "• Nossos gráficos (Manager, Social Media, Eventos) são alimentados pelos seus registros.",
    "",
    "**🎨 Sinalização:**",
    "• 🟢 Verde: Crescimento / Meta batida.",
    "• 🟡 Amarelo: Alerta / Atenção.",
    "• 🔴 Vermelho: Queda crítica.",
    "",
    "Métricas decidem promoções e correções de rota.",
  ].join("\n"),

  [
    "## 🚫 MÓDULO 12 — USO DE PODERES",
    "",
    "**⚠️ TOLERÂNCIA ZERO PARA ABUSO**",
    "• Abuso de poder gera **BAN e BLACKLIST PERMANENTE**.",
    "• NC (Noclip) apenas em locais escondidos.",
    "• Não entre/saia do NC na frente de players.",
    "• Wall apenas em serviço no NC. Nunca AFK.",
    "• **Fix/DV:** Apenas em eventos oficiais.",
    "",
    "**💡 Regra Mental:** Em RP, esqueça que você possui poderes.",
  ].join("\n"),

  [
    "## ⚡ MÓDULO 13 — CONDUTA COM PODER",
    "",
    "**🛠️ Ferramentas Administrativas:**",
    "• **WALL:** Ver players (apenas no NC).",
    "• **H:** Apenas urgência extrema.",
    "• **GOD:** Bug comprovado ou falta de paramédico.",
    "• **ADV/BAN:** Apenas com provas/clipes.",
    "• **TPTO / TPTOME:** Respeite a imersão do player.",
    "• **TPCDS:** Teleporte para local de crime.",
  ].join("\n"),

  [
    "## 🔫 MÓDULO 14 — REGRAS DE RP E CIDADE",
    "",
    "Domine o básico da rua:",
    "",
    "• Voz de assalto clara e rendição ('desce e quebra').",
    "• **Zonas:** Sul (Pistolas) | Norte (Liberado).",
    "• **Safe Zones:** Áreas populosas proibidas para ações.",
    "• **Conduta:** Não quebrar RP, gravar tudo, blips e tempo de procurado (10min).",
  ].join("\n"),

  [
    "## 👑 MÓDULO 15 — PERFIL DE UM BOM LÍDER",
    "",
    "**🌟 Liderança por Influência**",
    "• Saiba ouvir e conversar antes de impor.",
    "• Entenda as dificuldades dos seus auxiliares.",
    "• Passe a cultura de forma clara.",
    "• **Presença:** Esteja em call e ajude a empresa a crescer.",
  ].join("\n"),

  [
    "## 🎧 MÓDULO 16 — CALLS E RETENÇÃO",
    "",
    "**📍 Retenção é Prioridade**",
    "• Call SC: Resolve problemas das áreas.",
    "• Call Liderança: Problemas macro da cidade.",
    "",
    "**⏰ Horários de Foco:**",
    "• 16:00 às 23:00",
    "• 00:40 às 02:30",
    "Organize sua equipe para cobrir as 24 horas.",
  ].join("\n"),

  [
    "## 🎯 MÓDULO 17 — DELEGAÇÃO (CREATOR MASTER)",
    "",
    "**🏆 O Próximo Passo**",
    "1. Monte sua gestão abaixo de você.",
    "2. Treine sucessores e recicle membros.",
    "3. Tenha coragem para alinhar ou remover quem não soma.",
    "4. Garanta que a SantaCreators rode sozinha nos horários de pico.",
  ].join("\n"),

  [
    "## 🎓 MÓDULO 18 — CERTIFICAÇÃO FINAL",
    "",
    "**Conclusão da Formação MKT Creators**",
    "",
    "A partir de agora, seu acesso representa **confiança**.",
    "Postura, responsabilidade e conhecimento técnico são seus novos pilares.",
    "",
    "✅ **Você concluiu o Aulão MKT Creators.**",
    "",
    "*SantaCreators — Liderança com Estrutura.*",
  ].join("\n"),
];

const MODULOS_MKT = [
  new EmbedBuilder().setColor(COLORS.ROXO_SC).setTitle("🎓 MÓDULO 1 — CERTIFICADO MKT CREATORS").setDescription("\u200b").setImage(IMGS.BANNER).setThumbnail(IMGS.ICON),
  new EmbedBuilder().setColor(COLORS.ROSA_SC).setTitle("💜 MÓDULO 2 — CULTURA SANTACREATORS").setDescription("\u200b").setImage(IMGS.BANNER).setThumbnail(IMGS.ICON),
  new EmbedBuilder().setColor(COLORS.AMARELO_WARN).setTitle("🛑 MÓDULO 3 — REGRA DE OURO DOS BOTÕES").setDescription("\u200b").setImage(IMGS.BANNER).setThumbnail(IMGS.ICON),
  new EmbedBuilder().setColor(COLORS.AZUL_CLARO).setTitle("⚙️ MÓDULO 4 — SISTEMAS PRINCIPAIS").setDescription("\u200b").setImage(IMGS.BANNER).setThumbnail(IMGS.ICON),
  new EmbedBuilder().setColor(COLORS.VERDE_OK).setTitle("🎙️ MÓDULO 5 — ENTREVISTAS").setDescription("\u200b").setImage(IMGS.BANNER).setThumbnail(IMGS.ICON),
  new EmbedBuilder().setColor(COLORS.DARK).setTitle("👔 MÓDULO 6 — GESTÃO DE CARGOS").setDescription("\u200b").setImage(IMGS.BANNER).setThumbnail(IMGS.ICON),
  new EmbedBuilder().setColor(COLORS.COORD_BLUE).setTitle("📊 MÓDULO 7 — ORGANIZAÇÃO E MANAGERS").setDescription("\u200b").setImage(IMGS.MKT_CHART_METRICAS).setThumbnail(IMGS.ICON),
  new EmbedBuilder().setColor(COLORS.RESP_PINK).setTitle("🏙️ MÓDULO 8 — CONTRATAÇÃO IN-GAME").setDescription("\u200b").setImage(IMGS.BANNER).setThumbnail(IMGS.ICON),
  new EmbedBuilder().setColor(COLORS.AZUL_CLARO).setTitle("🛠️ MÓDULO 9 — SUPORTE").setDescription("\u200b").setImage(IMGS.BANNER).setThumbnail(IMGS.ICON),
  new EmbedBuilder().setColor(COLORS.VERDE_OK).setTitle("🧑‍💼 MÓDULO 10 — RESPONSABILIDADE").setDescription("\u200b").setImage(IMGS.BANNER).setThumbnail(IMGS.ICON),
  new EmbedBuilder().setColor(COLORS.GOLD).setTitle("📈 MÓDULO 11 — DASHBOARDS E MÉTRICAS").setDescription("\u200b").setImage(IMGS.MKT_CHART_PROGRESSO).setThumbnail(IMGS.ICON),
  new EmbedBuilder().setColor(COLORS.VERMELHO_ERR).setTitle("🚫 MÓDULO 12 — USO DE PODERES").setDescription("\u200b").setImage(IMGS.BANNER).setThumbnail(IMGS.ICON),
  new EmbedBuilder().setColor(COLORS.VERMELHO_ERR).setTitle("⚡ MÓDULO 13 — CONDUTA COM PODER").setDescription("\u200b").setImage(IMGS.BANNER).setThumbnail(IMGS.ICON),
  new EmbedBuilder().setColor(COLORS.AMARELO_WARN).setTitle("🔫 MÓDULO 14 — REGRAS DE RP E CIDADE").setDescription("\u200b").setImage(IMGS.BANNER).setThumbnail(IMGS.ICON),
  new EmbedBuilder().setColor(COLORS.AMARELO_WARN).setTitle("👑 MÓDULO 15 — PERFIL DE UM BOM LÍDER").setDescription("\u200b").setImage(IMGS.BANNER).setThumbnail(IMGS.ICON),
  new EmbedBuilder().setColor(COLORS.AZUL_CLARO).setTitle("🎧 MÓDULO 16 — CALLS E RETENÇÃO").setDescription("\u200b").setImage(IMGS.MKT_CHART_RETENCAO).setThumbnail(IMGS.ICON),
  new EmbedBuilder().setColor(COLORS.GOLD).setTitle("🎯 MÓDULO 17 — DELEGAÇÃO MASTER").setDescription("\u200b").setImage(IMGS.BANNER).setThumbnail(IMGS.ICON),
  new EmbedBuilder().setColor(COLORS.ROSA_SC).setTitle("🎓 MÓDULO 18 — CERTIFICAÇÃO FINAL").setDescription("\u200b").setImage(IMGS.BANNER).setThumbnail(IMGS.ICON),
];

// =====================================================
// [AULÃO 3] MKT CREATORS (Certificação Completa)
// =====================================================
const SLIDE_CONTENT_MKT = [
  [
    "## 🎓 MÓDULO 1 — O QUE É O CERTIFICADO MKT CREATORS",
    "",
    "**✅ Validação de Competência**",
    "O certificado valida que você domina os sistemas da empresa e está apto a operar com excelência.",
    "",
    "**🧠 Mais que um Cargo**",
    "• Não é apenas um título, é uma **responsabilidade**.",
    "• Você representa a imagem da SantaCreators perante a comunidade e parceiros.",
    "",
    "**🎯 O que você deve dominar:**",
    "Entendimento completo de atendimento, botões, entrevistas, suporte, cultura, regras e postura.",
  ].join("\n"),

  [
    "## 💜 MÓDULO 2 — CULTURA SANTACREATORS",
    "",
    "**🤝 Seja Gente Boa**",
    "A base da nossa empresa é o respeito, humildade e parceria.",
    "",
    "**🚫 O que nos afasta:**",
    "• **Ego:** Deixar subir é o caminho rápido para o BAN.",
    "• **Fuxico:** Fofocas não agregam e geram desligamento.",
    "• **Maturidade:** Quem tem acesso aos sistemas precisa agir com equilíbrio.",
    "",
    "**⚡ Abuso de Poder:** É terminantemente proibido tirar vantagem própria.",
  ].join("\n"),

  [
    "## 🛑 MÓDULO 3 — REGRA DE OURO DOS BOTÕES",
    "",
    "**⚠️ NÃO CLIQUE POR CURIOSIDADE**",
    "Nossos botões executam ações reais em bancos de dados.",
    "",
    "**📑 Rastro Digital**",
    "• Todo botão gera um **log** com seu nome e horário.",
    "• Cliques errados afetam rankings, dashboards, pagamentos e métricas estratégicas.",
    "",
    "**🧠 Obligatoriedade**",
    "> **Se não entende 100% da função: PERGUNTE antes de clicar.**",
  ].join("\n"),

  [
    "## ⚙️ MÓDULO 4 — SISTEMAS PRINCIPAIS DO MKT",
    "",
    "Conheça seus locais de trabalho fundamentais:",
    "",
    "• **Alinhamentos:** [Acessar Canal](https://discord.com/channels/1262262852782129183/1425256185707233301)",
    "• **Pagamentos:** [Acessar Canal](https://discord.com/channels/1262262852782129183/1387922662134775818)",
    "• **Registro Manager:** [Acessar Canal](https://discord.com/channels/1262262852949905414/1392680204517769277)",
    "• **ORGs Não Convidadas:** [Acessar Canal](https://discord.com/channels/1262262852782129183/1465142628839456829)",
    "• **ORGs Confirmadas:** [Acessar Canal](https://discord.com/channels/1262262852782129183/1400280714548744252)",
    "• **Convite DM Líderes:** [Acessar Canal](https://discord.com/channels/1262262852782129183/1414718856542421052)",
    "• **Poderes em Eventos:** [Acessar Canal](https://discord.com/channels/1262262852782129183/1392618646630568076)",
    "• **Poderes Diários:** [Acessar Canal](https://discord.com/channels/1262262852782129183/1374066813171929218)",
  ].join("\n"),

  [
    "## 🎙️ MÓDULO 5 — ENTREVISTAS",
    "",
    "**❓ Comando `!perguntas`**",
    "• Gera o botão de início. Use **APENAS** em tickets de entrevista.",
    "",
    "**📝 Comando `!correcao <números>`**",
    "• Exemplo: `!correcao 1 5 10`.",
    "• Use para orientar o candidato sobre questões erradas ou incompletas.",
    "",
    "**🤝 Postura do Entrevistador**",
    "Motive o candidato. Verifique se ele não está usando IA ou copiando respostas. Queremos autenticidade.",
  ].join("\n"),

  [
    "## 👔 MÓDULO 6 — GESTÃO DE CARGOS",
    "",
    "Comandos permitidos (respeitando hierarquia):",
    "",
    "• `!addcargo <@cargo> <@user>` — Adicionar cargo.",
    "• `!remcargo <@cargo> <@user>` — Remover cargo.",
    "• `!criarcargo <Nome> | <Cor>` — Criar novo.",
    "• `!copycargo <@cargo>` — Copiar permissões.",
    "",
    "**📍 Local Obrigatório:** Canal **GERAL BOT** aqui.",
    "",
    "**⚠️ Importante:** Não teste comandos sem necessidade. Toda alteração gera responsabilidade.",
  ].join("\n"),

  [
    "## 📊 MÓDULO 7 — ORGANIZAÇÃO E MANAGERS",
    "",
    "**🗓️ Controle de Presença**",
    "• Diferencie organizações confirmadas de não convidadas.",
    "• O **Registro Manager** alimenta todas as métricas da alta gestão.",
    "",
    "**🎯 Manager Ativo**",
    "Manager não é só clicar, é organizar, acompanhar e garantir que os dados estejam 100% corretos.",
  ].join("\n"),

  [
    "## 🏙️ MÓDULO 8 — CONTRATAÇÃO IN-GAME",
    "",
    "Procedimento Padrão:",
    "1. Localizar o cidadão no prédio da SantaCreators.",
    "2. Realizar a contratação técnica via painel/comando.",
    "3. Apresentar a empresa (baús, garagens, regras de imersão).",
    "4. Explicar conduta e regras básicas da cidade no ato da contratação.",
  ].join("\n"),

  [
    "## 🛠️ MÓDULO 9 — SUPORTE",
    "",
    "**🤝 Atendimento de Excelência**",
    "Empatia, respeito, escuta ativa, clareza e transparência.",
    "",
    "**💻 Comandos de Atendimento:**",
    "• `/filternewbie` — Identificar iniciantes.",
    "• `/propmanager` — Gestão de veículos/hackers.",
    "• `/qru` — Áreas de disparo no mapa.",
    "• `/sourceid` — Puxar source de hackers.",
    "• `/wallconfig2` — Configurar visão administrativa.",
  ].join("\n"),

  [
    "## 🧑‍💼 MÓDULO 10 — RESPONSABILIDADE",
    "",
    "**🛡️ Iniciativa**",
    "• Resolva o problema em vez de apenas repassar para cima.",
    "• Errou? Corrija e assuma. Não use 'não tenho autoridade' como desculpa.",
    "• Coord e Resp devem chegar com a **solução**, não com o problema.",
  ].join("\n"),

  [
    "## 📈 MÓDULO 11 — DASHBOARDS E MÉTRICAS",
    "",
    "**📊 Inteligência de Negócio**",
    "• Dados reais alimentam decisões e promoções.",
    "• 🟢 Verde: Crescimento | 🟡 Amarelo: Alerta | 🔴 Vermelho: Queda.",
    "",
    "Os sistemas de Manager, Social Media e Eventos são monitorados em tempo real pela alta gestão.",
  ].join("\n"),

  [
    "## 🚫 MÓDULO 12 — USO DE PODERES",
    "",
    "**⚠️ TOLERÂNCIA ZERO PARA ABUSO**",
    "• Abuso de poder = **BAN e BLACKLIST PERMANENTE**.",
    "• NC (Noclip) apenas em locais escondidos. Nunca na frente de players.",
    "• Wall apenas em serviço no NC. Proibido deixar Wall ligado AFK.",
    "• **God:** Apenas em bugs comprovados ou hackers. Jamais em RP.",
  ].join("\n"),

  [
    "## ⚡ MÓDULO 13 — CONDUTA COM PODER",
    "",
    "Utilize as ferramentas administrativas com consciência:",
    "",
    "• **WALL:** Ver players (apenas no NC).",
    "• **TPTO / TPTOME:** Respeite a imersão e privacidade do player.",
    "• **ADV / BAN:** Sempre acompanhados de provas e clipes.",
    "• **TPCDS:** Teleporte para local de crime.",
    "• **TPWAY:** Teleporte para sua marcação no GPS.",
  ].join("\n"),

  [
    "## 🔫 MÓDULO 14 — REGRAS DE RP E CIDADE",
    "",
    "Domine as diretrizes de rua para orientar os membros:",
    "",
    "• Voz de assalto e rendição ('desce e quebra').",
    "• **Zonas:** Sul (Pistolas) | Norte (Armas Liberadas).",
    "• **Safe Zones:** Proibido ações em áreas populosas (praças, hospitais).",
    "• **Sistema de Procurado:** 10 minutos de fuga permitida.",
    "• Todos devem gravar suas ações para defesa futura.",
  ].join("\n"),

  [
    "## 👑 MÓDULO 15 — PERFIL DE UM BOM LÍDER",
    "",
    "**🌟 Liderança por Exemplo**",
    "• Saiba ouvir antes de falar. Não imponha, influencie.",
    "• Entenda as dificuldades da sua equipe.",
    "• Tenha a postura de um representante oficial da SantaCreators.",
    "• **Cultura:** Seja gente boa.",
  ].join("\n"),

  [
    "## 🎧 MÓDULO 16 — CALLS E RETENÇÃO",
    "",
    "**📍 Presença é Importante**",
    "• Call SantaCreators: Resolve problemas das áreas.",
    "• Call Liderança: Resolve problemas macro da cidade.",
    "",
    "**⏰ Horários de Retenção (Foco Máximo):**",
    "• 16:00 às 23:00",
    "• 00:40 às 02:30",
    "Garanta que a empresa rode 24 horas por dia.",
  ].join("\n"),

  [
    "## 🎯 MÓDULO 17 — DELEGAÇÃO (CREATOR MASTER)",
    "",
    "**🏆 A Próxima Etapa**",
    "1. Monte sua gestão abaixo de você.",
    "2. Treine sucessores e recicle membros.",
    "3. Remova quem é ruim e alinhe quem é mediano.",
    "4. Garanta a retenção e presença nos horários principais.",
  ].join("\n"),

  [
    "## 🎓 MÓDULO 18 — CERTIFICAÇÃO FINAL",
    "",
    "**Conclusão da Formação MKT Creators**",
    "",
    "Você agora domina os sistemas, regras e a cultura da SantaCreators.",
    "Lembre-se: seu acesso representa a **confiança** depositada pela alta gestão.",
    "",
    "✅ **Você concluiu o Aulão MKT Creators.**",
    "",
    "*SantaCreators — Liderança com Estrutura.*",
  ].join("\n"),
];

const MODULOS_MKT = [
  new EmbedBuilder().setColor(COLORS.ROXO_SC).setTitle("🎓 MÓDULO 1 — CERTIFICADO MKT CREATORS").setDescription("\u200b").setImage(IMGS.BANNER).setThumbnail(IMGS.ICON),
  new EmbedBuilder().setColor(COLORS.ROSA_SC).setTitle("💜 MÓDULO 2 — CULTURA SANTACREATORS").setDescription("\u200b").setImage(IMGS.BANNER).setThumbnail(IMGS.ICON),
  new EmbedBuilder().setColor(COLORS.AMARELO_WARN).setTitle("🛑 MÓDULO 3 — REGRA DE OURO DOS BOTÕES").setDescription("\u200b").setImage(IMGS.BANNER).setThumbnail(IMGS.ICON),
  new EmbedBuilder().setColor(COLORS.AZUL_CLARO).setTitle("⚙️ MÓDULO 4 — SISTEMAS PRINCIPAIS").setDescription("\u200b").setImage(IMGS.BANNER).setThumbnail(IMGS.ICON),
  new EmbedBuilder().setColor(COLORS.VERDE_OK).setTitle("🎙️ MÓDULO 5 — ENTREVISTAS").setDescription("\u200b").setImage(IMGS.BANNER).setThumbnail(IMGS.ICON),
  new EmbedBuilder().setColor(COLORS.DARK).setTitle("👔 MÓDULO 6 — GESTÃO DE CARGOS").setDescription("\u200b").setImage(IMGS.BANNER).setThumbnail(IMGS.ICON),
  new EmbedBuilder().setColor(COLORS.COORD_BLUE).setTitle("📊 MÓDULO 7 — ORGANIZAÇÃO E MANAGERS").setDescription("\u200b").setImage(IMGS.MKT_CHART_METRICAS).setThumbnail(IMGS.ICON),
  new EmbedBuilder().setColor(COLORS.RESP_PINK).setTitle("🏙️ MÓDULO 8 — CONTRATAÇÃO IN-GAME").setDescription("\u200b").setImage(IMGS.BANNER).setThumbnail(IMGS.ICON),
  new EmbedBuilder().setColor(COLORS.AZUL_CLARO).setTitle("🛠️ MÓDULO 9 — SUPORTE").setDescription("\u200b").setImage(IMGS.BANNER).setThumbnail(IMGS.ICON),
  new EmbedBuilder().setColor(COLORS.VERDE_OK).setTitle("🧑‍💼 MÓDULO 10 — RESPONSABILIDADE").setDescription("\u200b").setImage(IMGS.BANNER).setThumbnail(IMGS.ICON),
  new EmbedBuilder().setColor(COLORS.GOLD).setTitle("📈 MÓDULO 11 — DASHBOARDS E MÉTRICAS").setDescription("\u200b").setImage(IMGS.MKT_CHART_PROGRESSO).setThumbnail(IMGS.ICON),
  new EmbedBuilder().setColor(COLORS.VERMELHO_ERR).setTitle("🚫 MÓDULO 12 — USO DE PODERES").setDescription("\u200b").setImage(IMGS.BANNER).setThumbnail(IMGS.ICON),
  new EmbedBuilder().setColor(COLORS.VERMELHO_ERR).setTitle("⚡ MÓDULO 13 — CONDUTA COM PODER").setDescription("\u200b").setImage(IMGS.BANNER).setThumbnail(IMGS.ICON),
  new EmbedBuilder().setColor(COLORS.AMARELO_WARN).setTitle("🔫 MÓDULO 14 — REGRAS DE RP E CIDADE").setDescription("\u200b").setImage(IMGS.BANNER).setThumbnail(IMGS.ICON),
  new EmbedBuilder().setColor(COLORS.AMARELO_WARN).setTitle("👑 MÓDULO 15 — PERFIL DE UM BOM LÍDER").setDescription("\u200b").setImage(IMGS.BANNER).setThumbnail(IMGS.ICON),
  new EmbedBuilder().setColor(COLORS.AZUL_CLARO).setTitle("🎧 MÓDULO 16 — CALLS E RETENÇÃO").setDescription("\u200b").setImage(IMGS.MKT_CHART_RETENCAO).setThumbnail(IMGS.ICON),
  new EmbedBuilder().setColor(COLORS.GOLD).setTitle("🎯 MÓDULO 17 — DELEGAÇÃO MASTER").setDescription("\u200b").setImage(IMGS.BANNER).setThumbnail(IMGS.ICON),
  new EmbedBuilder().setColor(COLORS.ROSA_SC).setTitle("🎓 MÓDULO 18 — CERTIFICAÇÃO FINAL").setDescription("\u200b").setImage(IMGS.BANNER).setThumbnail(IMGS.ICON),
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

  // --- AULÃO MKT CREATORS ---
  if (content.startsWith("!aulaomkt")) {
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
        .setCustomId(AULAO_CONFIG.BTN_START_MKT_ID)
        .setLabel("✅ Iniciar Aulão MKT Creators")
        .setStyle(ButtonStyle.Success)
        .setEmoji("🎓")
    );

    await message.channel.send({
      content: "**Painel de Controle — Aulão MKT Creators**\nClique abaixo para iniciar a formação oficial para Certificado MKT Creators.",
      components: [row],
    });
    return true;
  }

  // --- AULÃO MKT CREATORS ---
  if (content.startsWith("!aulaomkt")) {
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
        .setCustomId(AULAO_CONFIG.BTN_START_MKT_ID)
        .setLabel("✅ Iniciar Aulão MKT Creators")
        .setStyle(ButtonStyle.Success)
        .setEmoji("🎓")
    );

    await message.channel.send({
      content: "**Painel de Controle — Aulão MKT Creators**\nClique abaixo para iniciar a formação oficial para Certificado MKT Creators.",
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

  // =====================================================
  // FLUXO 3: AULÃO MKT CREATORS
  // =====================================================

  // 3.1 Iniciar MKT
  if (customId === AULAO_CONFIG.BTN_START_MKT_ID) {
    if (interaction.user.id !== AULAO_CONFIG.ALLOWED_USER_ID) {
      await interaction.reply({ content: "🚫 Sem permissão.", ephemeral: true });
      return true;
    }

    await interaction.reply({ content: "🚀 Iniciando Aulão MKT Creators...", ephemeral: true });

    const embed = MODULOS_MKT[0];
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${AULAO_CONFIG.BTN_NEXT_MKT_PREFIX}1`)
        .setLabel("➡️ Próximo Slide")
        .setStyle(ButtonStyle.Primary)
    );

    await interaction.channel.send({
      content: buildSlideContent(0, SLIDE_CONTENT_MKT),
      embeds: [embed],
      components: [row],
    });
    return true;
  }

  // 3.2 Próximo Slide MKT
  if (customId.startsWith(AULAO_CONFIG.BTN_NEXT_MKT_PREFIX)) {
    if (interaction.user.id !== AULAO_CONFIG.ALLOWED_USER_ID) {
      await interaction.reply({ content: "🚫 Sem permissão.", ephemeral: true });
      return true;
    }

    const nextIndex = parseInt(customId.replace(AULAO_CONFIG.BTN_NEXT_MKT_PREFIX, ""), 10);

    try { await interaction.message.edit({ components: [] }); } catch {}

    if (Number.isNaN(nextIndex) || nextIndex >= MODULOS_MKT.length) {
      // ✅ TODO: Futura implementação de Quiz Final, Certificado Automático e Cargo.
      await interaction.reply({ content: "✅ Aulão MKT Creators finalizado!", ephemeral: true });
      return true;
    }

    const embed = MODULOS_MKT[nextIndex];
    const isLast = nextIndex === MODULOS_MKT.length - 1;

    const components = [];
    if (!isLast) {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${AULAO_CONFIG.BTN_NEXT_MKT_PREFIX}${nextIndex + 1}`)
          .setLabel("➡️ Próximo Slide")
          .setStyle(ButtonStyle.Primary)
      );
      components.push(row);
    } else {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("btn_aulao_mkt_finish")
          .setLabel("✅ Certificação concluída")
          .setStyle(ButtonStyle.Success)
          .setDisabled(true)
      );
      components.push(row);
    }

    await interaction.deferUpdate();
    await interaction.channel.send({
      content: buildSlideContent(nextIndex, SLIDE_CONTENT_MKT),
      embeds: [embed],
      components,
    });
    return true;
  }

  // =====================================================
  // FLUXO 3: AULÃO MKT CREATORS
  // =====================================================

  // 3.1 Iniciar MKT
  if (customId === AULAO_CONFIG.BTN_START_MKT_ID) {
    if (interaction.user.id !== AULAO_CONFIG.ALLOWED_USER_ID) {
      await interaction.reply({ content: "🚫 Sem permissão.", ephemeral: true });
      return true;
    }

    await interaction.reply({ content: "🚀 Iniciando Aulão MKT Creators...", ephemeral: true });

    const embed = MODULOS_MKT[0];
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${AULAO_CONFIG.BTN_NEXT_MKT_PREFIX}1`)
        .setLabel("➡️ Próximo Slide")
        .setStyle(ButtonStyle.Primary)
    );

    await interaction.channel.send({
      content: buildSlideContent(0, SLIDE_CONTENT_MKT),
      embeds: [embed],
      components: [row],
    });
    return true;
  }

  // 3.2 Próximo Slide MKT
  if (customId.startsWith(AULAO_CONFIG.BTN_NEXT_MKT_PREFIX)) {
    if (interaction.user.id !== AULAO_CONFIG.ALLOWED_USER_ID) {
      await interaction.reply({ content: "🚫 Sem permissão.", ephemeral: true });
      return true;
    }

    const nextIndex = parseInt(customId.replace(AULAO_CONFIG.BTN_NEXT_MKT_PREFIX, ""), 10);

    try { await interaction.message.edit({ components: [] }); } catch {}

    if (Number.isNaN(nextIndex) || nextIndex >= MODULOS_MKT.length) {
      // ✅ TODO: Futura implementação de Quiz Final, Certificado Automático, Log de conclusão e Cargo.
      await interaction.reply({ content: "✅ Aulão MKT Creators finalizado!", ephemeral: true });
      return true;
    }

    const embed = MODULOS_MKT[nextIndex];
    const isLast = nextIndex === MODULOS_MKT.length - 1;

    const components = [];
    if (!isLast) {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${AULAO_CONFIG.BTN_NEXT_MKT_PREFIX}${nextIndex + 1}`)
          .setLabel("➡️ Próximo Slide")
          .setStyle(ButtonStyle.Primary)
      );
      components.push(row);
    } else {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("btn_aulao_mkt_finish")
          .setLabel("✅ Certificação concluída")
          .setStyle(ButtonStyle.Success)
          .setDisabled(true)
      );
      components.push(row);
    }

    await interaction.deferUpdate();
    await interaction.channel.send({
      content: buildSlideContent(nextIndex, SLIDE_CONTENT_MKT),
      embeds: [embed],
      components,
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
