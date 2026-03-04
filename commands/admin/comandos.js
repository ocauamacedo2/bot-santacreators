// comandos.js (ESM)
import { EmbedBuilder, AttachmentBuilder } from "discord.js";
import dotenv from "dotenv";
dotenv.config();

/**
 * ==========================
 *  CONFIG DE PERMISSÃO
 * ==========================
 */

// Usuários que SEMPRE têm permissão
const ALLOWED_USER_IDS = [
  "660311795327828008", // você
];

// Cargos que têm permissão
const ALLOWED_ROLE_IDS = [
  "1431448984840442047", // mkt ticket cidade santa
  "1452780631661477939", // sênior dc administração
  "1452416085751234733", // dc administração

  // === NOVOS CARGOS ADICIONADOS ===
  "1452423380413452289", // diretoria
  "1453216998023495771", // diretor comunidade
  "1453223332995530852", // administração 1
  "1454946141111320781", // administração 2
];

// Servidores permitidos
const ALLOWED_GUILDS = [
  "1262262852782129183", // Santa Creators Original (antigo)
  "1362899923091194097", // Santa Creators Original
  "1362899773992079533", // Cidade Santa
];

// === Utils de permissão ===
function hasPermission(message) {
  try {
    if (!message?.guild || !message?.member) return false;

    // Restringe aos servidores permitidos
    if (!ALLOWED_GUILDS.includes(message.guild.id)) return false;

    const authorId = message.author?.id;

    // 1) Usuário fixo
    if (authorId && ALLOWED_USER_IDS.includes(authorId)) return true;

    // 2) Dono do servidor
    if (authorId === message.guild.ownerId) return true;

    // 3) OWNER vindo do .env
    const envOwnerId = (process.env.OWNER || "").trim();
    if (envOwnerId && authorId === envOwnerId) return true;

    const envRoleIds = (process.env.ROLES_PERMISSION || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    // 4) Checagem de cargos
    const memberRoleIds = message.member.roles.cache.map((r) => r.id);
    const allowedRolesMerged = [
      ...new Set([...ALLOWED_ROLE_IDS, ...envRoleIds]),
    ];

    return allowedRolesMerged.some((id) => memberRoleIds.includes(id));
  } catch {
    return false;
  }
}

// === Utils de chunk ===
const MAX_EMBED_DESC = 3800;
const MAX_EMBEDS = 3;
const MAX_TEXT_MSG = 1900;

function toRichLine(cmd) {
  const clean = (cmd.description || "").replace(/\s+```/g, " ```").trim();
  return `**${cmd.name}**: ${clean}`;
}

function toLiteLine(cmd) {
  const clean = (cmd.description || "").replace(/```/g, "").trim();
  return `- ${cmd.name}: ${clean}`;
}

function chunkByLength(lines, maxLen) {
  const pages = [];
  let current = [];
  let len = 0;

  for (const l of lines) {
    const add = (l + "\n").length;
    if (len + add > maxLen) {
      pages.push(current.join("\n"));
      current = [l];
      len = add;
    } else {
      current.push(l);
      len += add;
    }
  }
  if (current.length) pages.push(current.join("\n"));
  return pages;
}

function dedupeByName(arr) {
  const seen = new Set();
  const out = [];
  for (const c of arr) {
    if (!c?.name) continue;
    const k = c.name.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}

export default {
  name: "comandos",
  description: "Lista todos os comandos disponíveis do bot.",
  hasPermission,

  async execute(message, args, client) {
    if (!hasPermission(message)) {
      setTimeout(() => message.delete().catch(() => {}), 1000);
      return message
        .reply("❌ Você não tem permissão para usar este comando.")
        .then((msg) => setTimeout(() => msg.delete().catch(() => {}), 5000))
        .catch(() => {});
    }

    const COLOR = process.env.BASE_COLORS || "#9b59b6";
    const DELETE_AFTER_MS = 120000;

    try {
      const commands = dedupeByName([
        // === Admin / Moderação ===
        { name: "!addcargo", description: "```Adicionar cargos a usuários.```" },
        { name: "!remcargo", description: "```Remover cargos de usuários.```" },
        { name: "!removercargo", description: "```Remove cargo X de quem tem cargo Y.```" },
        { name: "!copycargo", description: "```Duplicar um cargo.```" },
        { name: "!criarcargo", description: "```Cria um novo cargo.```" },
        { name: "!remover", description: "```Remove cargo de todos (Massivo).```" },
        { name: "!ban", description: "```Banir um usuário do servidor.```" },
        { name: "!kick", description: "```Expulsar um usuário do servidor.```" },
        { name: "!castigo", description: "```Aplica castigo (timeout) em usuário.```" },
        { name: "!clear", description: "```Limpa mensagens do canal (0 a 100).```" },
        { name: "!clearbotao", description: "```Limpa apenas mensagens com botões.```" },
        { name: "!apagarchat", description: "```Apaga mensagens de um usuário (24h).```" },
        { name: "!apagarpv", description: "```Apaga mensagens do bot na DM do usuário.```" },
        { name: "!duplicados", description: "```Busca cargos com nomes duplicados.```" },
        { name: "!cargosvazios", description: "```Lista e deleta cargos sem membros.```" },

        // === Permissões / Canais ===
        { name: "!removerperm", description: "```Remove permissão de cargo em categoria.```" },
        { name: "!remperm", description: "```Remove permissão de cargo em canal.```" },
        { name: "!duplicarperm", description: "```Duplica permissões de um cargo para outro.```" },
        { name: "!inativo", description: "```Move canal para categoria de inativos.```" },

        // === Utilidades / Info ===
        { name: "!verid", description: "```Detecta se é ID de canal, cargo ou usuário.```" },
        { name: "!ping", description: "```Mostra latência do bot.```" },
        { name: "!grupo", description: "```Lista membros de um cargo.```" },
        { name: "!perfildc", description: "```Mostra avatar ou ícone do servidor.```" },
        { name: "!meuscargos", description: "```Lista seus cargos.```" },
        { name: "!say", description: "```Envia mensagem pelo bot.```" },
        { name: "!addemoji", description: "```Adiciona emoji ao servidor.```" },
        { name: "!joincall", description: "```Entra no canal de voz.```" },

        // === Sistemas / Menus ===
        { name: "!entrevistar", description: "```Envia o menu de tickets/entrevistas.```" },
        { name: "!staff", description: "```Enviar Botões Para Set Staff.```" },
        { name: "!postsetstaff", description: "```Posta menu Set Staff V2.```" },
        { name: "!pedirset", description: "```Envia botão de Pedir Set.```" },
        { name: "!perguntas", description: "```Inicia entrevista.```" },
        { name: "!correcao", description: "```Envia correção de questão.```" },
        { name: "!formscreator", description: "```Recria botão Forms Creator.```" },
        { name: "!registroevento", description: "```Envia botão de Registro de Evento.```" },
        { name: "!evt3", description: "```Recria botão de Eventos EVT3.```" },
        { name: "!menueventos", description: "```Cria/atualiza menu FACs Semanais.```" },
        { name: "!salvarform", description: "```Salva formulário (alias).```" },
        { name: "!doacao", description: "```Ativa botão de doação no canal.```" },

        // === Gestão / Dashboards / Aulas ===
        { name: "!rmrepost", description: "```Repostar Totais Registro Manager.```" },
        { name: "!zerarorgs", description: "```Zera orgs da semana (Registro Manager).```" },
        { name: "!painelvendas", description: "```Envia/Atualiza Painel de Vendas.```" },
        { name: "!zerarecrutamento", description: "```Zera estatísticas de recrutamento.```" },
        { name: "!atualizarpainel", description: "```Força atualização do Monitor de Cargos.```" },
        { name: "!cronograma", description: "```Envia painel de Cronograma Creators.```" },
        { name: "!hierarquia", description: "```Força atualização do painel de Hierarquia.```" },
        { name: "!iniciaraulao", description: "```Inicia Aulão SantaCreators (Geral).```" },
        { name: "!aulaoresp", description: "```Inicia Aulão Hierarquia (Resp).```" },

        // === Rankings ===
        { name: "!geraldashrefresh", description: "```Atualiza GeralDash (Full Scan).```" },
        { name: "!geraldashdebug", description: "```Debug do GeralDash.```" },
        { name: "!removept", description: "```Remove pontos no GeralDash.```" },
        { name: "!geralrankrefresh", description: "```Atualiza Ranking Semanal (Full Scan).```" },
        { name: "!geralrankdebug", description: "```Debug do Ranking Semanal.```" },
        { name: "!geralrankweek", description: "```Gera ranking de semana específica.```" },
      ]);

      const richLines = commands.map(toRichLine);
      let embedPages = chunkByLength(richLines, MAX_EMBED_DESC);

      let usingLite = false;
      if (embedPages.length > MAX_EMBEDS) {
        usingLite = true;
        embedPages = chunkByLength(commands.map(toLiteLine), MAX_EMBED_DESC);
      }

      const pagesToSend = embedPages.slice(0, MAX_EMBEDS);
      const leftovers = embedPages.slice(MAX_EMBEDS).join("\n");
      const sent = [];

      for (let i = 0; i < pagesToSend.length; i++) {
        const embed = new EmbedBuilder()
          .setColor(COLOR)
          .setTitle(`📜 Lista de Comandos (${i + 1}/${pagesToSend.length})`)
          .setDescription(pagesToSend[i])
          .setThumbnail(client.user.displayAvatarURL())
          .setFooter({
            text: `Solicitado por ${message.author.tag}${usingLite ? " · modo compacto" : ""}`,
            iconURL: message.author.displayAvatarURL(),
          });

        sent.push(await message.channel.send({ embeds: [embed] }));
      }

      if (leftovers) {
        const buf = Buffer.from(leftovers, "utf8");
        const file = new AttachmentBuilder(buf, {
          name: "comandos_completos.txt",
        });
        sent.push(
          await message.channel.send({
            content: "📎 Lista completa:",
            files: [file],
          })
        );
      }

      setTimeout(
        () => sent.forEach((m) => m.delete().catch(() => {})),
        DELETE_AFTER_MS
      );
    } catch (err) {
      console.error(err);
      message.reply("⚠️ Erro ao executar o comando.");
    }
  },
};
