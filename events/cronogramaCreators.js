// d:\bots\events\cronogramaCreators.js
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { resolveLogChannel } from "./channelResolver.js";

// ================= CONFIGURAÇÕES =================
const LOG_CHANNEL_ID = "1474603651757510706"; // Canal de Logs
const PANEL_CHANNEL_ID = "1474605177771397223"; // ⚠️ CONFIRA SE ESSE ID ESTÁ CORRETO E O BOT VÊ O CANAL
const APPROVAL_CHANNEL_ID = "1387864036259004436"; // ✅ Canal de Aprovação
const BANNER_URL = "https://media.discordapp.net/attachments/1362477839944777889/1384245215249825832/standard_2rss.gif";

// Permissões
const ALLOWED_ROLES = [
  "1352408327983861844", // Resp Creators
  "1262262852949905409", // Resp Influ
  "1352407252216184833", // Resp Lider
  "1388976314253312100", // Coord Creators
  "1282119104576098314", // Mkt Creators
  "1262262852949905408", // Owner
  "1387253972661964840", // Equipe Social Medias
  "1388976094920704141", // Social Medias
  "1388975939161161728", // Gestor Creators
  "1352385500614234134", // Coordenação
  "1352429001188180039", // Equipe Creators
];
const ALLOWED_USERS = [
  "660311795327828008", // Você
  "1262262852949905408", // Owner
];

// Quem pode APROVAR (botão verde)
const APPROVER_ROLES = [
  "1262262852949905408", // Owner
  "1352408327983861844", // Resp Creators
  "1262262852949905409", // Resp Influ
  "1352407252216184833", // Resp Lider
];

// Quem tem BYPASS TOTAL (pode aprovar a si mesmo e ignora hierarquia)
const BYPASS_ROLES = [
  "1262262852949905408", // Owner
  "1352408327983861844", // Resp Creators
];
const BYPASS_USERS = [
  "660311795327828008", // Você
  "1262262852949905408", // Owner
];

// ================= PERSISTÊNCIA =================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, "../data");
const STATE_FILE = path.join(DATA_DIR, "cronograma_state.json");
const HISTORY_FILE = path.join(DATA_DIR, "cronograma_history.json");

// Estado Padrão (Inicial)
const DEFAULT_STATE = {
  panelChannelId: null,

  // ✅ Mensagem “controle” (a que tem botões)
  panelMessageId: null,

  // ✅ Mensagem “tela toda” (só texto grandão)
  textMessageId: null,
  textMessageIds: [], // ✅ Array para múltiplas mensagens (se passar de 2000 chars)

  footerImageUrl: "", // ✅ Imagem opcional no final

  schedule: {
    seg: { city: "Maresia", time: "19:00", active: true, eventName: "SANTA DO CRIME", prizes: "TOP 1:\n1 VIP GENTE BOA (30 DIAS) + 1 ROLEPASS + 2 VIP EVENTO (7 DIAS)" },
    ter: { city: "Grande", time: "19:00", active: true, eventName: "SANTA APOCALIPSE", prizes: "TOP 1: VIP GENTE BOA\nTOP 2: VIP EVENTO (7 DIAS) + ROLEPASS\nTOP 3: VIP EVENTO (7 DIAS)" },
    qua: { city: "Santa", time: "19:00", active: true, eventName: "FUGA ESPACIAL", prizes: "TOP 1: VIP GENTE BOA\nTOP 2: VIP EVENTO + ROLEPASS\nTOP 3: VIP EVENTO" },
    qui: { city: "Nobre", time: "19:00", active: true, eventName: "MISSÃO ROSA", prizes: "TOP 1: 2 VIP GENTE BOA + 2 ROLEPASS + 100 MILHÕES\nTOP 2: 2 VIP EVENTO + 1 ROLEPASS + 50 MILHÕES" },
    sex: { city: "Nobre", time: "19:00", active: true, eventName: "KARAMBIT WARS", prizes: "TOP 1: 1 VIP GENTE BOA + 100 MILHÕES\nTOP 2: ROLEPASS + VIP EVENTO (7 DIAS)\nTOP 3: VIP EVENTO + 25 MILHÕES" },
    sab: { city: "Nobre", time: "19:00", active: true, eventName: "RESGATE O MACEDO", prizes: "TOP 1: 1 VIP GENTE BOA + ROLEPASS + 50 MILHÕES" },
    dom: { city: "Folga", time: "—", active: false, eventName: "—", prizes: "—" },
  },
  madrugada: {
    seg: { city: "—", time: "—", active: false, eventName: "F3 MADRUGADA", prizes: "—" },
    ter: { city: "Nobre", time: "01:00 às 03:00", active: true, eventName: "F3 MADRUGADA", prizes: "—" },
    qua: { city: "Nobre", time: "01:00 às 03:00", active: true, eventName: "F3 MADRUGADA", prizes: "—" },
    qui: { city: "Nobre", time: "01:00 às 03:00", active: true, eventName: "F3 MADRUGADA", prizes: "—" },
    sex: { city: "Nobre", time: "01:00 às 03:00", active: true, eventName: "F3 MADRUGADA", prizes: "—" },
    sab: { city: "Nobre", time: "01:00 às 03:00", active: true, eventName: "F3 MADRUGADA", prizes: "—" },
    dom: { city: "—", time: "—", active: false, eventName: "F3 MADRUGADA", prizes: "—" },
  },
};

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadState() {
  ensureDir();
  try {
    if (!fs.existsSync(STATE_FILE)) return JSON.parse(JSON.stringify(DEFAULT_STATE));
    const loaded = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    
    // Merge inteligente para garantir novos campos (eventName, prizes)
    const merged = { ...DEFAULT_STATE, ...loaded };
    ['schedule', 'madrugada'].forEach(type => {
      if (!merged[type]) merged[type] = { ...DEFAULT_STATE[type] };
      Object.keys(DEFAULT_STATE[type]).forEach(day => {
        if (loaded[type]?.[day]) {
          merged[type][day] = { ...DEFAULT_STATE[type][day], ...loaded[type][day] };
        }
      });
    });
    return merged;
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
  }
}

function saveState(data) {
  ensureDir();
  fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2));
}

function saveHistory(changeId, previousState) {
  ensureDir();
  let history = {};
  try {
    if (fs.existsSync(HISTORY_FILE)) history = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
  } catch {}
  
  const keys = Object.keys(history);
  if (keys.length > 20) delete history[keys[0]];

  history[changeId] = previousState;
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

function getHistory(changeId) {
  try {
    if (!fs.existsSync(HISTORY_FILE)) return null;
    const history = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
    return history[changeId] || null;
  } catch {
    return null;
  }
}

// ================= UTILS DE DATA =================
const TZ = "America/Sao_Paulo";

function getWeekDates() {
  // Cria data segura baseada no fuso horário
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: TZ }));
  const day = now.getDay(); // 0 (Dom) a 6 (Sab)
  
  // Calcula o Domingo da semana atual
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - day);
  
  const dates = {};
  const daysMap = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];

  for (let i = 0; i < 7; i++) {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    dates[daysMap[i]] = `${dd}/${mm}`;
  }
  return dates;
}

function splitText(text, maxLength = 2000) {
  if (text.length <= maxLength) return [text];
  const chunks = [];
  let currentChunk = "";
  const lines = text.split("\n");
  for (const line of lines) {
    if (currentChunk.length + line.length + 1 <= maxLength) {
      currentChunk += (currentChunk ? "\n" : "") + line;
    } else {
      if (currentChunk) chunks.push(currentChunk);
      currentChunk = line;
      while (currentChunk.length > maxLength) {
          chunks.push(currentChunk.slice(0, maxLength));
          currentChunk = currentChunk.slice(maxLength);
      }
    }
  }
  if (currentChunk) chunks.push(currentChunk);
  return chunks;
}

// ================= BUILDERS =================
function buildPanelContent(state) {
  const dates = getWeekDates();
  const daysOrder = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"];
  const dayNames = {
    seg: "SEGUNDA",
    ter: "TERÇA",
    qua: "QUARTA",
    qui: "QUINTA",
    sex: "SEXTA",
    sab: "SÁBADO",
    dom: "DOMINGO",
  };

  const range = `${dates.dom} → ${dates.sab}`;

  let text = `# 📅 EVENTOS SEMANAIS
## 🏆 PREMIAÇÕES
**Semana:** \`${range}\`
> Horários de Brasília (${TZ}) • Painel atualizado automaticamente

`;

  // ✅ Eventos 19:00 (tela toda)
  let has19h = false;
  for (const key of daysOrder) {
    const d = state.schedule[key];
    if (!d?.active) continue;

    has19h = true;

    const dateStr = dates[key];
    const eventName = (d.eventName || "—").toUpperCase();
    const city = (d.city || "—").toUpperCase();
    const time = d.time || "—";
    const prizes = d.prizes || "—";

    text += `## EVENTO ${dayNames[key]} ÀS ${time} » ${eventName} (${city})
📆 **Data:** \`${dateStr}\`

### 🏆 PREMIAÇÃO
${prizes}

━━━━━━━━━━━━━━━━━━━━━━

`;
  }

  if (!has19h) {
    text += `## EVENTOS 19:00
_Nenhum agendado._

━━━━━━━━━━━━━━━━━━━━━━

`;
  }

  // ✅ Madrugada
  text += `# 🌌 EVENTOS MADRUGADAS 
(CIDADE NOBRE)


`;

  let hasMadru = false;
  for (const key of daysOrder) {
    const d = state.madrugada[key];
    if (!d?.active) continue;

    hasMadru = true;

    const dateStr = dates[key];
    const eventName = (d.eventName || "F3 MADRUGADA").toUpperCase();
    const city = (d.city || "—").toUpperCase();
    const time = d.time || "—";

    text += `## 🌌 ${dayNames[key]} (${dateStr})
**Evento:** ${eventName}
**Local:** ${city}
**Horário:** ${time}

━━━━━━━━━━━━━━━━━━━━━━

`;
  }

  if (!hasMadru) {
    text += `## ❌ SEM PROGRAMAÇÃO (MADRUGADA)
—

`;
  }

  // ✅ Menções solicitadas no final
  text += `\n\n<@&1262978759922028575> <@&1353858422063239310> <@&1388975939161161728> <@&1392678638176043029> <@&1388976155830255697> @everyone`;

  // ✅ Imagem no final (Link direto para ficar grande e sem embed)
  let footer = "";
  if (state.footerImageUrl) {
    footer = `\n${state.footerImageUrl}`;
  }

  return text + footer;
}

function buildCronogramaEmbeds(state) {
  const dates = getWeekDates();
  const daysOrder = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"];
  const dayNames = {
    seg: "SEGUNDA",
    ter: "TERÇA",
    qua: "QUARTA",
    qui: "QUINTA",
    sex: "SEXTA",
    sab: "SÁBADO",
    dom: "DOMINGO",
  };

  const embeds = [];

  // ✅ 1) Embed “capa” só com banner (bonitão e limpo)
  const header = new EmbedBuilder()
    .setColor("#9b59b6")
    .setImage(BANNER_URL)
    .setFooter({
      text: "SantaCreators • Cronograma Oficial",
      iconURL: "https://cdn.discordapp.com/emojis/1136716086292320347.png",
    })
    .setTimestamp();

  embeds.push(header);

  // ✅ 2) Um EMBED por EVENTO (isso dá aquele visual separado e “esticado”)
  let has19h = false;

  for (const key of daysOrder) {
    const d = state.schedule[key];
    if (!d?.active) continue;

    has19h = true;

    const dateStr = dates[key];
    const eventName = (d.eventName || "—").toUpperCase();
    const city = (d.city || "—").toUpperCase();
    const time = d.time || "—";
    const prizes = d.prizes || "—";

    // TÍTULO DO EMBED é “texto grande”
    const card = new EmbedBuilder()
      .setColor("#9b59b6")
      .setTitle(`EVENTO ${dayNames[key]} ÀS ${time} » ${eventName} (${city})`)
      .setDescription(
        `**📆 Data:** \`${dateStr}\`\n\n` +
        `## 🏆 PREMIAÇÃO\n` + // <-- aqui é embed, então "##" vai aparecer como texto normal
        `${prizes}`
      );

    // ✅ truque: “separador” visual no final do card
    card.addFields({ name: "━━━━━━━━━━━━━━━━━━━━━━", value: "⠀", inline: false });

    embeds.push(card);
  }

  if (!has19h) {
    const none = new EmbedBuilder()
      .setColor("#9b59b6")
      .setTitle("EVENTOS 19:00")
      .setDescription("_Nenhum agendado._");
    embeds.push(none);
  }

  // ✅ 3) Madrugada em um embed separado (organizado)
  const madru = new EmbedBuilder()
    .setColor("#9b59b6")
    .setTitle("🌌 EVENTOS MADRUGADAS (CIDADE NOBRE) ")
    .setDescription("Programação da madrugada separada pra ficar bem limpo.");

  let hasMadru = false;
  for (const key of daysOrder) {
    const d = state.madrugada[key];
    if (!d?.active) continue;

    hasMadru = true;

    const dateStr = dates[key];
    const eventName = (d.eventName || "F3 MADRUGADA").toUpperCase();
    const city = (d.city || "—").toUpperCase();
    const time = d.time || "—";

    // ✅ Field name fica “maior” que o texto normal — bom pra chamar atenção
    madru.addFields({
      name: `🌌 ${dayNames[key]} (${dateStr})`,
      value: `**Evento:** ${eventName}\n**Local:** ${city}\n**Horário:** ${time}`,
      inline: true,
    });
  }

  if (!hasMadru) {
    madru.addFields({ name: "❌ SEM PROGRAMAÇÃO", value: "—", inline: false });
  }

  embeds.push(madru);

  // ⚠️ Limite do Discord: até 10 embeds por mensagem
  // Header + (até 7 dias) + Madrugada = 9 embeds → OK.
  return embeds;
}
function buildControlEmbed() {
  return new EmbedBuilder()
    .setColor("#9b59b6")
    .setDescription("**🎛️ CONTROLE DO CRONOGRAMA**\nUse os botões abaixo para editar ou atualizar.")
    .setFooter({
      text: "SantaCreators • Controle do Cronograma",
      iconURL: "https://cdn.discordapp.com/emojis/1136716086292320347.png",
    })
    .setTimestamp();
}

function buildControlRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("crono_edit_menu")
      .setLabel("✏️ Editar Cronograma")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("⚙️"),
    new ButtonBuilder()
      .setCustomId("crono_refresh")
      .setLabel("🔄 Atualizar Datas")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("📅"),
    new ButtonBuilder()
      .setCustomId("crono_req_approval")
      .setLabel("📤 Enviar p/ Aprovação")
      .setStyle(ButtonStyle.Success)
      .setEmoji("✅")
  );
}

function buildScheduleSummary(state) {
  const days = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"];
  let text = "**📅 Cronograma Atual:**\n";
  days.forEach(d => {
      const s = state.schedule[d];
      if(s.active) text += `**${d.toUpperCase()}:** ${s.eventName} (${s.city}) - ${s.time}\n`;
  });
  text += "\n**🌌 Madrugada:**\n";
  days.forEach(d => {
      const m = state.madrugada[d];
      if(m.active) text += `**${d.toUpperCase()}:** ${m.eventName} (${m.city})\n`;
  });
  return text;
}

// ================= LOGIC =================

async function updatePanel(client, state) {
  try {
    const channel = await client.channels.fetch(PANEL_CHANNEL_ID).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    const fullContent = buildPanelContent(state);
    const chunks = splitText(fullContent, 2000);

    // ✅ Tenta reutilizar as mensagens existentes (Modo Edição)
    let canReuse = false;
    const currentIds = state.textMessageIds || [];

    if (currentIds.length === chunks.length) {
      try {
        const fetchedMsgs = await Promise.all(currentIds.map(id => channel.messages.fetch(id)));
        if (fetchedMsgs.every(m => m)) canReuse = true;
      } catch { canReuse = false; }
    }

    if (canReuse) {
      // Apenas edita
      for (let i = 0; i < chunks.length; i++) {
        const msg = await channel.messages.fetch(currentIds[i]).catch(() => null);
        if (msg && msg.content !== chunks[i]) {
          await msg.edit({ content: chunks[i], embeds: [], components: [] }).catch(() => {});
        }
      }
    } else {
      // Recria tudo (Modo Limpeza)
      if (state.textMessageIds?.length) {
        for (const id of state.textMessageIds) {
          const msg = await channel.messages.fetch(id).catch(() => null);
          if (msg) await msg.delete().catch(() => {});
        }
      }
      state.textMessageIds = [];

      // Limpa órfãos
      try {
        const recent = await channel.messages.fetch({ limit: 50 }).catch(() => null);
        if (recent) {
          const orphans = recent.filter(m => m.author.id === client.user.id && m.id !== state.panelMessageId && (m.content || "").includes("# 📅 EVENTOS SEMANAIS"));
          for (const orphan of orphans.values()) await orphan.delete().catch(() => {});
        }
      } catch {}

      // Envia novas
      for (let i = 0; i < chunks.length; i++) {
        const isLast = i === chunks.length - 1;
        const sent = await channel.send({ content: chunks[i], embeds: [], components: [] });
        state.textMessageIds.push(sent.id);
        if (isLast) {
          try {
            const emojis = ["💜", "📅", "🔥", "🚀", "👏", "🎉", "🤩", "🤯", "🏆", "👑", "💸", "👀", "✨", "💯", "✅", "📸", "💎", "⚡", "💣", "🫡", "🤝", "👻", "💀", "👽", "👾", "🤖", "🎃", "😺"];
            for (const e of emojis) await sent.react(e).catch(() => {});
          } catch {}
        }
      }
    }

    // ✅ 4) Atualiza a mensagem “CONTROLE” (botões)
    if (state.panelMessageId) {
      const ctrlMsg = await channel.messages.fetch(state.panelMessageId).catch(() => null);
      if (ctrlMsg) {
        await ctrlMsg.edit({
          content: "🔧 **Painel de Controle**",
          embeds: [buildControlEmbed()],
          components: [buildControlRow()],
        });
      }
    }

    saveState(state);
  } catch (e) {
    console.error("[Cronograma] Erro ao atualizar painel:", e);
  }
}

async function logChange(client, guild, user, oldState, newState, changeType) {
  try {
    const logChannel = await resolveLogChannel(client, LOG_CHANNEL_ID);
    if (!logChannel) return;

    const changeId = `undo_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    saveHistory(changeId, oldState);

    const chId = newState.panelChannelId || PANEL_CHANNEL_ID;
    const panelUrl = newState.panelMessageId 
        ? `https://discord.com/channels/${guild.id}/${chId}/${newState.panelMessageId}`
        : `https://discord.com/channels/${guild.id}/${chId}`;

    const embed = new EmbedBuilder()
      .setTitle("📝 Cronograma Atualizado")
      .setColor("#9b59b6")
      .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
      .setThumbnail(guild.iconURL())
      .addFields(
        { name: "👤 Autor", value: `<@${user.id}>`, inline: true },
        { name: "📍 Canal", value: `<#${chId}>`, inline: true },
        { name: "🔗 Painel", value: `Ir para mensagem`, inline: true },
        { name: "🛠️ Ação", value: changeType, inline: false }
      )
      .setFooter({ text: `ID: ${user.id} • Sistema de Logs`, iconURL: user.displayAvatarURL() })
      .setTimestamp();

    // Detalhes do Antes/Depois
    if (changeType.includes("Alterou Imagem Final")) {
        const oldImg = oldState.footerImageUrl || "*(nenhuma)*";
        const newImg = newState.footerImageUrl || "*(nenhuma)*";
        embed.addFields(
            { name: "📉 Antes", value: `\`${oldImg}\``, inline: false },
            { name: "📈 Depois", value: `\`${newImg}\``, inline: false }
        );
        if (newState.footerImageUrl && newState.footerImageUrl.startsWith("http")) {
            embed.setImage(newState.footerImageUrl);
        }
    } else if (changeType.startsWith("Editou")) {
        const match = changeType.match(/Editou (\w+) \((.+)\)/);
        if (match) {
            const dayKey = match[1].toLowerCase();
            const typeKey = match[2]; // schedule ou madrugada
            
            const oldD = oldState[typeKey]?.[dayKey];
            const newD = newState[typeKey]?.[dayKey];

            if (oldD && newD) {
                const fmt = (d) => [
                    `🏙️ **Cidade:** ${d.city}`,
                    `⏰ **Horário:** ${d.time}`,
                    `✅ **Ativo:** ${d.active ? "Sim" : "Não"}`,
                    `🎉 **Evento:** ${d.eventName || "—"}`,
                    `🏆 **Prêmios:** ${d.prizes || "—"}`
                ].join("\n");

                embed.addFields(
                    { name: "📉 Como estava (Antes)", value: fmt(oldD), inline: true },
                    { name: "📈 Como ficou (Depois)", value: fmt(newD), inline: true }
                );
            }
        }
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`crono_undo:${changeId}`)
        .setLabel("↩️ Restaurar Versão Anterior")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("🛡️")
    );

    await logChannel.send({ embeds: [embed], components: [row] });
  } catch (e) {
    console.error("[Cronograma] Erro ao enviar log:", e);
  }
}

// ================= EXPORTS =================

export async function cronogramaCreatorsOnReady(client) {
  console.log("[Cronograma] Iniciando verificação do painel...");
  const state = loadState();
  state.panelChannelId = PANEL_CHANNEL_ID;

  try {
    const channel = await client.channels.fetch(PANEL_CHANNEL_ID).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      console.warn(`[Cronograma] ❌ ERRO CRÍTICO: Canal ${PANEL_CHANNEL_ID} não encontrado ou sem permissão!`);
      return;
    }

    let msg = null;
    // 1. Achar ou criar a mensagem de CONTROLE
    let ctrlMsg = null;
    if (state.panelMessageId) {
      ctrlMsg = await channel.messages.fetch(state.panelMessageId).catch(() => null);
    }

    // Se não achou pelo ID, varre o canal
    if (!ctrlMsg) {
      const recent = await channel.messages.fetch({ limit: 50 }).catch(() => null);
      if (recent) {
        ctrlMsg = recent.find(
          (m) =>
            m.author.id === client.user.id &&
            m.embeds?.[0]?.footer?.text?.includes("Controle do Cronograma")
        );
      }
    }

    // Se ainda não existe, cria
    if (!ctrlMsg) {
      ctrlMsg = await channel.send({
        content: "🔧 **Painel de Controle**",
        embeds: [buildControlEmbed()],
        components: [buildControlRow()],
      });
    }

    // 2. Garante que o ID do controle está no state
    state.panelMessageId = ctrlMsg.id;
    
    // 3. Deixa o updatePanel cuidar do resto (limpar antigos, criar novos, salvar state)
    await updatePanel(client, state);

    console.log(`[Cronograma] ✅ Painel atualizado no canal ${channel.name}`);
  } catch (e) {
    console.error("[Cronograma] ❌ Erro fatal no onReady:", e);
  }
}

export async function cronogramaCreatorsHandleMessage(message, client) {
  if (!message.guild || message.author.bot) return false;
  
  if (message.content === "!cronograma_fixo") {
    if (!ALLOWED_USERS.includes(message.author.id) && !message.member.permissions.has("Administrator")) {
      setTimeout(() => message.delete().catch(() => {}), 1000);
      const msg = await message.reply("❌ Você não tem permissão para usar este comando.");
      setTimeout(() => msg.delete().catch(() => {}), 5000);
      return true;
    }
    
    await message.reply("🔄 Forçando atualização do painel fixo...");
    await cronogramaCreatorsOnReady(client);
    return true;
  }

if (message.content === "!cronograma") {
  if (!ALLOWED_USERS.includes(message.author.id) && !message.member.permissions.has("Administrator")) {
    setTimeout(() => message.delete().catch(() => {}), 1000);
    const msg = await message.reply("❌ Você não tem permissão para usar este comando.");
    setTimeout(() => msg.delete().catch(() => {}), 5000);
    return true;
  }

  const state = loadState();

  const chunks = splitText(buildPanelContent(state), 2000);
  for (const chunk of chunks) {
    await message.channel.send({ content: chunk });
  }

  await message.delete().catch(() => {});
  return true;
}
  return false;
}

export async function cronogramaCreatorsHandleInteraction(interaction, client) {
  if (!interaction.guild) return false;

  const hasPerm = 
    ALLOWED_USERS.includes(interaction.user.id) || 
    interaction.member.roles.cache.some(r => ALLOWED_ROLES.includes(r.id));

  // Botão Desfazer
  if (interaction.isButton() && interaction.customId.startsWith("crono_undo:")) {
    if (!hasPerm) return interaction.reply({ content: "🚫 Sem permissão.", ephemeral: true });
    
    await interaction.deferReply({ ephemeral: true });
    const changeId = interaction.customId.split(":")[1];
    const previousState = getHistory(changeId);

    if (!previousState) return interaction.editReply("❌ Histórico não encontrado.");

    saveState(previousState);
    await updatePanel(client, previousState);
    await interaction.editReply("✅ Alteração desfeita com sucesso!");
    return true;
  }

  // Botões Principais
  if (interaction.isButton()) {
    if (interaction.customId === "crono_refresh") {
      if (!hasPerm) return interaction.reply({ content: "🚫 Sem permissão.", ephemeral: true });
      const state = loadState();
      await updatePanel(client, state);
      return interaction.reply({ content: "✅ Painel atualizado!", ephemeral: true });
    }

    if (interaction.customId === "crono_edit_menu") {
      if (!hasPerm) return interaction.reply({ content: "🚫 Sem permissão.", ephemeral: true });
      
      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("crono_select_edit")
          .setPlaceholder("O que você quer editar?")
          .addOptions([
            { label: "Editar Horários 19:00", value: "edit_19h", emoji: "🌅" },
            { label: "Editar Madrugada", value: "edit_madru", emoji: "🌌" },
            { label: "Editar Imagem Final", value: "edit_footer_img", emoji: "🖼️" }
          ])
      );
      return interaction.reply({ content: "Selecione o que deseja editar:", components: [row], ephemeral: true });
    }

    // ✅ Solicitar Aprovação
    if (interaction.customId === "crono_req_approval") {
      if (!hasPerm) return interaction.reply({ content: "🚫 Sem permissão.", ephemeral: true });

      // Checa se é Sábado ou Domingo
      const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
      const day = now.getDay(); // 0=Dom, 6=Sab
      if (day !== 0 && day !== 6) {
          return interaction.reply({ content: "⚠️ A solicitação de aprovação/pontos só é permitida aos **Sábados e Domingos** (dias de atualização).", ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });

      const state = loadState();
      const summary = buildScheduleSummary(state);
      const approvalChannel = await client.channels.fetch(APPROVAL_CHANNEL_ID).catch(() => null);

      if (!approvalChannel) return interaction.editReply("❌ Canal de aprovação não encontrado.");

      const embed = new EmbedBuilder()
        .setTitle("📤 Solicitação de Aprovação de Cronograma")
        .setDescription(`**Solicitante:** <@${interaction.user.id}>\n\n${summary}`)
        .setColor("#3498db")
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`crono_approve_points:${interaction.user.id}`)
          .setLabel("✅ Aprovar (Dar Ponto)")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`crono_reject_points:${interaction.user.id}`)
          .setLabel("❌ Recusar")
          .setStyle(ButtonStyle.Danger)
      );

      await approvalChannel.send({ content: "<@&1414651836861907006>", embeds: [embed], components: [row] });
      await interaction.editReply("✅ Solicitação enviada para aprovação!");
      return true;
    }

    // ✅ Aprovar Pontos
    if (interaction.customId.startsWith("crono_approve_points:")) {
      // 1. Verifica se tem permissão de APROVADOR
      const isApprover = 
        BYPASS_USERS.includes(interaction.user.id) ||
        interaction.member.roles.cache.some(r => APPROVER_ROLES.includes(r.id));

      if (!isApprover) {
        return interaction.reply({ content: "🚫 Você não tem permissão para aprovar cronogramas.", ephemeral: true });
      }
      
      const targetId = interaction.customId.split(":")[1];
      
      // 2. Verifica se é BYPASS (Isento de regras)
      const isBypass = 
        BYPASS_USERS.includes(interaction.user.id) ||
        interaction.member.roles.cache.some(r => BYPASS_ROLES.includes(r.id));

      if (!isBypass) {
        // Regras restritivas para quem NÃO é bypass (Resp Influ, Resp Lider)

        // A) Não pode aprovar a si mesmo
        if (targetId === interaction.user.id) {
           return interaction.reply({ content: "❌ Você não pode aprovar sua própria solicitação.", ephemeral: true });
        }

        // B) Hierarquia específica
        const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
        if (targetMember) {
            const approverRoles = interaction.member.roles.cache;
            const targetRoles = targetMember.roles.cache;

            // Resp Lider (1352407252216184833) não aprova Resp Influ (1262262852949905409)
            if (approverRoles.has("1352407252216184833") && targetRoles.has("1262262852949905409")) {
                return interaction.reply({ content: "❌ Resp. Líder não pode aprovar Resp. Influência.", ephemeral: true });
            }

            // Resp Influ não aprova Resp Influ
            if (approverRoles.has("1262262852949905409") && targetRoles.has("1262262852949905409")) {
                return interaction.reply({ content: "❌ Resp. Influência não pode aprovar outro Resp. Influência.", ephemeral: true });
            }
        }
      }

      await interaction.deferUpdate();

      const embed = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor("#2ecc71")
        .setFooter({ text: `Aprovado por ${interaction.user.tag}` })
        .addFields({ name: '✅ Aprovado por', value: `${interaction.user} (\`${interaction.user.tag}\`)`, inline: false });

      // 1. Edita a mensagem PRIMEIRO (para os scanners verem que está aprovado)
      await interaction.message.edit({ embeds: [embed], components: [] });

      // Computa ponto
      dashEmit("cronograma:aprovado", {
        userId: targetId,
        approverId: interaction.user.id,
        at: Date.now()
      });

      // 3. Confirmação visual
      await interaction.followUp({ content: "✅ Cronograma aprovado e ponto computado!", ephemeral: true });
      return true;
    }

    // ✅ Recusar Pontos
    if (interaction.customId.startsWith("crono_reject_points:")) {
      const isApprover = 
        BYPASS_USERS.includes(interaction.user.id) ||
        interaction.member.roles.cache.some(r => APPROVER_ROLES.includes(r.id));

      if (!isApprover) return interaction.reply({ content: "🚫 Sem permissão para recusar.", ephemeral: true });

      await interaction.deferUpdate();

      const embed = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor("#e74c3c")
        .setFooter({ text: `Recusado por ${interaction.user.tag}` });

      await interaction.message.edit({ embeds: [embed], components: [] });
      
      await interaction.followUp({ content: "❌ Cronograma recusado.", ephemeral: true });
      return true;
    }
  }

  // Select Menu (Turno -> Dia)
  if (interaction.isStringSelectMenu() && interaction.customId === "crono_select_edit") {
    const choice = interaction.values[0];

    if (choice === "edit_footer_img") {
      const state = loadState();
      const modal = new ModalBuilder()
        .setCustomId("crono_save_footer_img")
        .setTitle("Editar Imagem Final");

      const inputImg = new TextInputBuilder()
        .setCustomId("footerImageUrl")
        .setLabel("URL da Imagem (Link)")
        .setStyle(TextInputStyle.Short)
        .setValue(state.footerImageUrl || "")
        .setPlaceholder("https://... (Deixe vazio para remover)")
        .setRequired(false);

      modal.addComponents(new ActionRowBuilder().addComponents(inputImg));
      return interaction.showModal(modal);
    }

    const type = choice === "edit_19h" ? "schedule" : "madrugada";
    
    const rowDay = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`crono_select_day_${type}`)
        .setPlaceholder("Qual dia da semana?")
        .addOptions([
          { label: "Segunda", value: "seg" }, { label: "Terça", value: "ter" },
          { label: "Quarta", value: "qua" }, { label: "Quinta", value: "qui" },
          { label: "Sexta", value: "sex" }, { label: "Sábado", value: "sab" },
          { label: "Domingo", value: "dom" }
        ])
    );
    return interaction.update({ content: `Selecione o dia (${choice === "edit_19h" ? "19h" : "Madrugada"}):`, components: [rowDay] });
  }

  // Select Menu (Dia -> Modal)
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith("crono_select_day_")) {
    const type = interaction.customId.replace("crono_select_day_", "");
    const day = interaction.values[0];
    const state = loadState();
    const currentData = state[type][day];

    const modal = new ModalBuilder()
      .setCustomId(`crono_save_${type}_${day}`)
      .setTitle(`Editar ${day.toUpperCase()} - ${type === "schedule" ? "19h" : "Madrugada"}`);

    const inputCity = new TextInputBuilder().setCustomId("city").setLabel("Cidade").setStyle(TextInputStyle.Short).setValue(currentData.city).setRequired(true);
    const inputTime = new TextInputBuilder().setCustomId("time").setLabel("Horário").setStyle(TextInputStyle.Short).setValue(currentData.time).setRequired(true);
    const inputActive = new TextInputBuilder().setCustomId("active").setLabel("Ativo? (sim/nao)").setStyle(TextInputStyle.Short).setValue(currentData.active ? "sim" : "nao").setRequired(true);
    const inputEvent = new TextInputBuilder().setCustomId("eventName").setLabel("Nome do Evento").setStyle(TextInputStyle.Short).setValue(currentData.eventName || "").setRequired(false);
    const inputPrizes = new TextInputBuilder().setCustomId("prizes").setLabel("Premiação").setStyle(TextInputStyle.Paragraph).setValue(currentData.prizes || "").setRequired(false);

    modal.addComponents(
      new ActionRowBuilder().addComponents(inputCity),
      new ActionRowBuilder().addComponents(inputTime),
      new ActionRowBuilder().addComponents(inputActive),
      new ActionRowBuilder().addComponents(inputEvent),
      new ActionRowBuilder().addComponents(inputPrizes)
    );
    return interaction.showModal(modal);
  }

  // Modal Submit (Imagem Final)
  if (interaction.isModalSubmit() && interaction.customId === "crono_save_footer_img") {
    const url = interaction.fields.getTextInputValue("footerImageUrl").trim();
    
    const oldState = loadState();
    const newState = JSON.parse(JSON.stringify(oldState));
    newState.footerImageUrl = url;
    
    saveState(newState);
    await updatePanel(client, newState);
    await logChange(client, interaction.guild, interaction.user, oldState, newState, `Alterou Imagem Final`);
    
    return interaction.reply({ content: "✅ Imagem atualizada!", ephemeral: true });
  }

  // Modal Submit
  if (interaction.isModalSubmit() && interaction.customId.startsWith("crono_save_")) {
    const parts = interaction.customId.split("_");
    const type = parts[2];
    const day = parts[3];

    const city = interaction.fields.getTextInputValue("city");
    const time = interaction.fields.getTextInputValue("time");
    const activeRaw = interaction.fields.getTextInputValue("active").toLowerCase();
    const active = ["sim", "s", "yes", "true"].includes(activeRaw);
    const eventName = interaction.fields.getTextInputValue("eventName");
    const prizes = interaction.fields.getTextInputValue("prizes");

    const oldState = loadState();
    const newState = JSON.parse(JSON.stringify(oldState));
    newState[type][day] = { city, time, active, eventName, prizes };

    saveState(newState);
    await updatePanel(client, newState);
    await logChange(client, interaction.guild, interaction.user, oldState, newState, `Editou ${day.toUpperCase()} (${type})`);

    return interaction.reply({ content: "✅ Cronograma atualizado!", ephemeral: true });
  }

  return false;
}
