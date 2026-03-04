// /application/events/analisarOrgsPorDia.js
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} from "discord.js";

// ======= CONFIG =======
const REGISTER_CHANNEL_ID = "1392680204517769277"; // onde ficam os registros
const BUTTON_CHANNEL_ID   = "1400280714548744252"; // onde ficará o botão pra rodar a análise

// Quem PODE criar o botão e também usar o botão
const AUTH_ROLES = [
  "1388976155830255697", // Manager Creator
  "1388976314253312100", // Coord Creator
  "1392678638176043029", // Equipe Manager
  "1262262852949905408", // Owner
  "660311795327828008",  // Eu
  "1352408327983861844", // Resp Creator
  "1262262852949905409", // Resp Influ
  "1352407252216184833", // Resp Líder
];
//teste
// BTN custom id
const BTN_ANALISAR_ORGS = "BTN_ANALISAR_ORGS";

// Padrões de detecção dos dias (case-insensitive, com/sem acento)
const DAY_PATTERNS = {
  QUINTA: /\bquinta\b/i,
  SEXTA:  /\bsexta\b/i,
  SABADO: /\bs[áa]bado\b/i,
};

// Padrões para extrair "nome da org" e "família ativa" (texto e embed)
const ORG_PATTERNS = [
  /(organiza[cç][aã]o|org|fac[cç][aã]o|grupo\/?fac[cç][aã]o|grupo)\s*[:\-–]\s*(.+)/i,
  /(org(?:aniza[cç][aã]o)?)[\s\-–]+\s*(.+)/i,
];

const FAMILIA_PATTERNS = [
  /(fam[ií]lia\s*ativa)\s*[:\-–]\s*(.+)/i,
  /(fam[ií]lia)\s*[:\-–]\s*(.+)/i,
];

// ========= HELPERS =========

// Verifica permissão (roles ou user id explícito)
function isAuthorized(member) {
  if (!member) return false;
  if (AUTH_ROLES.some(r => member.roles?.cache?.has?.(r))) return true;
  if (AUTH_ROLES.includes(member.id)) return true; // caso tenha IDs de usuário na mesma lista
  return false;
}

// Pagina mensagens (até MAX_FETCH mensagens)
async function fetchAllMessages(channel, MAX_FETCH = 800) {
  const all = [];
  let lastId = undefined;

  while (all.length < MAX_FETCH) {
    const batch = await channel.messages.fetch({
      limit: 100,
      ...(lastId ? { before: lastId } : {})
    });
    if (batch.size === 0) break;
    all.push(...batch.values());
    lastId = batch.last().id;
  }
  return all;
}

// Normaliza e junta todo texto possível de uma mensagem (conteúdo + embeds)
function collectTextFromMessage(msg) {
  const chunks = [];
  if (msg.content) chunks.push(msg.content);

  for (const e of msg.embeds || []) {
    if (e.title) chunks.push(e.title);
    if (e.description) chunks.push(e.description);
    if (e.fields && e.fields.length) {
      for (const f of e.fields) {
        if (f.name) chunks.push(String(f.name));
        if (f.value) chunks.push(String(f.value));
      }
    }
    if (e.footer?.text) chunks.push(e.footer.text);
  }

  return chunks.join("\n");
}

// Extrai primeira ocorrência que parecer "org"
function extractOrg(text) {
  for (const rx of ORG_PATTERNS) {
    const m = text.match(rx);
    if (m && m[2]) return m[2].trim().replace(/[\*\_`]/g, "");
  }

  const lines = text.split("\n").map(s => s.trim());
  const keyLines = lines.filter(l =>
    /(organiza[cç][aã]o|org|fac[cç][aã]o|grupo\/?fac[cç][aã]o|grupo)\b/i.test(l)
  );

  if (keyLines[0]) {
    const after = keyLines[0].split(/[:\-–]/)[1];
    if (after) return after.trim().replace(/[\*\_`]/g, "");
  }

  const firstNonEmpty = lines.find(l => l.length > 0);
  return firstNonEmpty ? firstNonEmpty.replace(/[\*\_`]/g, "") : null;
}

// Extrai a família ativa
function extractFamilia(text) {
  for (const rx of FAMILIA_PATTERNS) {
    const m = text.match(rx);
    if (m && m[2]) return m[2].trim().replace(/[\*\_`]/g, "");
  }

  const line = text.split("\n").find(l => /fam[ií]lia\b/i.test(l));
  if (line) {
    const after = line.split(/[:\-–]/)[1];
    if (after) return after.trim().replace(/[\*\_`]/g, "");
  }
  return null;
}

// Detecta o(s) dia(s) citados no texto
function detectDays(text) {
  const days = [];
  if (DAY_PATTERNS.QUINTA.test(text)) days.push("QUINTA");
  if (DAY_PATTERNS.SEXTA.test(text))  days.push("SEXTA");
  if (DAY_PATTERNS.SABADO.test(text)) days.push("SABADO");
  return days;
}

// Monta string copy-friendly
function buildCopyBlock(byDay) {
  const mk = (arr) => arr.length
    ? arr.map(x => `• ${x.org}${x.familia ? ` — Família ativa: ${x.familia}` : ""}`).join("\n")
    : "• (sem registros)";

  return [
    "=== QUINTA ===",
    mk(byDay.QUINTA || []),
    "",
    "=== SEXTA ===",
    mk(byDay.SEXTA || []),
    "",
    "=== SÁBADO ===",
    mk(byDay.SABADO || []),
  ].join("\n");
}

/**
 * Trata o comando !botaoorgs
 * Retorna true se tratou, false se ignorou
 */
export async function orgsHandleMessage(message, client) {
  if (!message.guild || message.author?.bot) return false;
  if (!message.content?.toLowerCase().startsWith("!botaoorgs")) return false;

  const member = message.member;
  if (!isAuthorized(member)) return true; // “tratou” (ignorou por permissão)
  if (!isAuthorized(member)) {
    setTimeout(() => message.delete().catch(() => {}), 1000);
    const msg = await message.reply("❌ Você não tem permissão para usar este comando.");
    setTimeout(() => msg.delete().catch(() => {}), 5000);
    return true;
  }

  // apaga o comando pra manter limpo
  message.delete().catch(() => {});

  const buttonChannel = await client.channels.fetch(BUTTON_CHANNEL_ID).catch(() => null);
  if (!buttonChannel || !buttonChannel.isTextBased()) return true;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(BTN_ANALISAR_ORGS)
      .setLabel("📋 Analisar Orgs por Dia")
      .setStyle(ButtonStyle.Primary)
  );

  await buttonChannel.send({
    content: "Clique para gerar a lista de **orgs por dia** (QUINTA/SEXTA/SÁBADO) com **Família Ativa**.",
    components: [row]
  });

  return true;
}

/**
 * Trata o clique do botão
 * Retorna true se tratou, false se ignorou
 */
export async function orgsHandleInteraction(interaction, client) {
  if (!interaction?.isButton?.()) return false;
  if (interaction.customId !== BTN_ANALISAR_ORGS) return false;

  const member = interaction.member;
  if (!isAuthorized(member)) {
    await interaction.reply({ content: "Sem permissão pra usar isso.", ephemeral: true }).catch(() => {});
    return true;
  }

  await interaction.deferReply({ ephemeral: false }).catch(() => {});
  const regChannel = await client.channels.fetch(REGISTER_CHANNEL_ID).catch(() => null);

  if (!regChannel || !regChannel.isTextBased()) {
    await interaction.editReply("Canal de registros inválido ou inacessível.").catch(() => {});
    return true;
  }

  const messages = await fetchAllMessages(regChannel, 800);

  const uniqueSet = new Set(); // chave = dia|org
  const byDay = { QUINTA: [], SEXTA: [], SABADO: [] };

  for (const msg of messages) {
    const text = collectTextFromMessage(msg);
    if (!text) continue;

    const days = detectDays(text);
    if (!days.length) continue;

    const org = extractOrg(text);
    if (!org) continue;

    const familia = extractFamilia(text);

    for (const d of days) {
      const key = `${d}|${org.toLowerCase()}`;
      if (uniqueSet.has(key)) continue;
      uniqueSet.add(key);
      byDay[d].push({ org, familia });
    }
  }

  for (const d of Object.keys(byDay)) {
    byDay[d].sort((a, b) => a.org.localeCompare(b.org, "pt-BR", { sensitivity: "base" }));
  }

  const copyBlock = buildCopyBlock(byDay);

  const embed = new EmbedBuilder()
    .setTitle("✅ Orgs por Dia (com Família Ativa)")
    .setDescription("Resultado lido do canal de registros.")
    .addFields(
      {
        name: "📅 QUINTA",
        value: (byDay.QUINTA.length
          ? byDay.QUINTA.map(x => `• **${x.org}**${x.familia ? ` — *Família ativa:* ${x.familia}` : ""}`).join("\n")
          : "• (sem registros)"
        ).slice(0, 1024)
      },
      {
        name: "📅 SEXTA",
        value: (byDay.SEXTA.length
          ? byDay.SEXTA.map(x => `• **${x.org}**${x.familia ? ` — *Família ativa:* ${x.familia}` : ""}`).join("\n")
          : "• (sem registros)"
        ).slice(0, 1024)
      },
      {
        name: "📅 SÁBADO",
        value: (byDay.SABADO.length
          ? byDay.SABADO.map(x => `• **${x.org}**${x.familia ? ` — *Família ativa:* ${x.familia}` : ""}`).join("\n")
          : "• (sem registros)"
        ).slice(0, 1024)
      }
    )
    .setFooter({ text: `Fonte: #${regChannel.name} • Total mensagens lidas: ${messages.length}` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed], components: [] }).catch(() => {});

  await interaction.followUp({
    content: ["```", copyBlock, "```"].join("\n")
  }).catch(() => {});

  return true;
}
