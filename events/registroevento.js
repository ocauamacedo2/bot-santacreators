import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { 
  Events, 
  EmbedBuilder, 
  ButtonBuilder, 
  ModalBuilder, 
  ActionRowBuilder, 
  TextInputBuilder, 
  TextInputStyle, 
  ButtonStyle, 
  PermissionFlagsBits 
} from 'discord.js';
// ✅ ADD: HUB (pra contar nas métricas humanas do GeralDash)
import { dashEmit } from "../utils/dashHub.js";
// ========================== CONFIG ==========================
const CANAL_REGISTRO_EVENTO = '1392618646630568076';
const CANAL_LOG_AUDIT_EVENTO = '1513320054568259835';

// ✅ __dirname no ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ PERSISTÊNCIA para o log de poderes em evento
const EVENT_POWER_STATE_PATH = path.resolve(__dirname, "../data/event_power_state.json");
const REGEVT_COOLDOWN_MS = 1 * 60 * 60 * 1000; // 1 hora de cooldown sugerido

function readEventPowerState() {
  try {
    const raw = fs.readFileSync(EVENT_POWER_STATE_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return { users: {} };
  }
}

function writeEventPowerState(state) {
  try {
    const dir = path.dirname(EVENT_POWER_STATE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(EVENT_POWER_STATE_PATH, JSON.stringify(state, null, 2), "utf8");
  } catch {}
}

async function sendAuditEventLog(client, guild, member, data, msg, oldLastAt) {
  const ch = await client.channels.fetch(CANAL_LOG_AUDIT_EVENTO).catch(() => null);
  if (!ch || !ch.isTextBased()) return;

  const now = Date.now();
  const nextAt = now + REGEVT_COOLDOWN_MS;

  const timeSinceLast = oldLastAt > 0 ? `<t:${Math.floor(oldLastAt / 1000)}:R>` : "Primeiro registro";
  const nextAllowed = `<t:${Math.floor(nextAt / 1000)}:F> (<t:${Math.floor(nextAt / 1000)}:R>)`;

  const embed = new EmbedBuilder()
    .setTitle("📋 Log: Registro de Poderes em Evento")
    .setColor("Blue")
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: "👤 Autor", value: `${member} (\`${member.id}\`)`, inline: true },
      { name: "🔗 Perfil", value: `Clique aqui`, inline: true },
      { name: "📍 Mensagem", value: `Ir para mensagem`, inline: true },
      { name: "📅 Data Uso", value: `\`${data.data}\``, inline: true },
      { name: "📌 Evento", value: `\`${data.evento}\``, inline: true },
      { name: "⏰ Horário", value: `\`${data.horario}\``, inline: true },
      { name: "👤 Alvo In-Game", value: `\`${data.jogador}\``, inline: true },
      { name: "⏳ Último Registro", value: timeSinceLast, inline: true },
      { name: "🕒 Registrado há", value: `<t:${Math.floor(now / 1000)}:R>`, inline: true },
      { name: "🔓 Próximo Registro", value: nextAllowed, inline: false },
      { name: "🕒 Enviado em", value: `<t:${Math.floor(now / 1000)}:F>`, inline: false }
    )
    .setFooter({ text: "SantaCreators • Auditoria de Eventos" })
    .setTimestamp();

  await ch.send({ content: `${member}`, embeds: [embed] }).catch(() => {});
}

const CARGOS_REGISTRO_EVENTO = [
  '1262262852949905408', // OWNER
  '1352408327983861844', // RESP CREATOR
  '1262262852949905409', // RESP INFLU
  '1352407252216184833', // RESP LIDER
  '1388976314253312100', // COORD
  '1352429001188180039', // EQUIPE CREATOR
  '1282119104576098314', // MKT TICKET
  '1352385500614234134', // COORDENAÇÃO
];

const USUARIOS_LIBERADOS = [
  '660311795327828008', // você
];



function normalizeNoPowerText(text = "") {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isNoPowerEventRegister(...texts) {
  const raw = normalizeNoPowerText(texts.join(" "));

  const patterns = [
    /\bnao usei\b/,
    /\bn usei\b/,
    /\bnn usei\b/,
    /\bnao utilizei\b/,
    /\bn utilizei\b/,
    /\bnn utilizei\b/,
    /\bnao fui\b/,
    /\bn fui\b/,
    /\bnn fui\b/,
    /\bnao participei\b/,
    /\bn participei\b/,
    /\bnn participei\b/,
    /\bnao estava\b/,
    /\bn estava\b/,
    /\bnn estava\b/,
    /\bnao loguei\b/,
    /\bn loguei\b/,
    /\bnn loguei\b/,
    /\bnao entrei\b/,
    /\bn entrei\b/,
    /\bnn entrei\b/,
    /\boff\b/,
    /\bsem uso\b/,
    /\bzero uso\b/,
    /\b0 uso\b/,
    /\bnao teve uso\b/,
    /\bnada usado\b/,
    /\bdesconsidera\b/,
    /\bdesconsiderar\b/,
  ];

  return patterns.some((r) => r.test(raw));
}
// ✅ MEMÓRIA GLOBAL PARA O SISTEMA DE LEMBRETES SABER QUEM JÁ REGISTROU PODERES
const SC_EVENT_POWER_MEMORY = globalThis.SC_EVENT_POWER_MEMORY || new Map();
globalThis.SC_EVENT_POWER_MEMORY = SC_EVENT_POWER_MEMORY;

function normalizePowerEventKey(userId, evento, data) {
  return `${String(userId)}:${String(evento || "").trim().toLowerCase()}:${String(data || "").trim()}`;
}

globalThis.SC_EVENT_POWER_hasRegistered = (userId, evento, data) => {
  return SC_EVENT_POWER_MEMORY.has(normalizePowerEventKey(userId, evento, data));
};

// =================== UI BUILDERS ===================
const buildBotao = (label = '📋 Registrar Poderes em Evento') =>
  new ButtonBuilder()
    .setCustomId('abrir_registro_evento')
    .setLabel(label)
    .setStyle(ButtonStyle.Primary);

const buildEmbedBotao = () =>
  new EmbedBuilder()
    .setColor('Blue')
    .setTitle('📋 Registro de Poderes em Evento – Social Medias')
    .setDescription(
      [
        '🎯 **Registro obrigatório para uso de poderes em eventos.**',
        '',
        '📅 Informe a **data do uso**',
        '🎥 Diga o **evento ou contexto**',
        '⏰ Informe o **horário**',
        '👤 Informe quem **utilizou os poderes**',
        '',
        '💜 Se não usou poderes, registra mesmo assim como: `não usei`.',
        '🧠 Isso ajuda o bot a parar de cobrar errado.',
        '',
        '✅ Apenas membros autorizados',
        '🔁 Um novo botão é gerado após cada envio',
      ].join('\n')
    )
    .setImage(
      'https://media.discordapp.net/attachments/1362477839944777889/1384245215249825832/standard_2rss.gif'
    )
    .setFooter({ text: 'SantaCreators – Sistema Oficial de Registro' });

const buildModal = () => {
  const input = (id, label, placeholder) =>
    new TextInputBuilder()
      .setCustomId(id)
      .setLabel(label)
      .setPlaceholder(placeholder)
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

  return new ModalBuilder()
    .setCustomId('modal_registro_evento')
    .setTitle('📋 Registro de Evento')
    .addComponents(
      new ActionRowBuilder().addComponents(
        input('jogador', '👤 Quem usou os poderes?', 'Nome em game')
      ),
      new ActionRowBuilder().addComponents(
        input('evento', '📌 Evento/Contexto', 'Nome do evento')
      ),
      new ActionRowBuilder().addComponents(
        input('horario', '⏰ Horário', 'Ex.: 20:30 às 21:30')
      ),
      new ActionRowBuilder().addComponents(
        input('data', '📅 Data do uso', 'DD/MM/YYYY')
      )
    );
};

// =================== PERMISSÃO ===================
async function isAutorizado(ctx) {
  try {
    const perms = ctx.memberPermissions;
    if (
      perms?.has(PermissionFlagsBits.Administrator) ||
      perms?.has(PermissionFlagsBits.ManageGuild)
    ) return true;

    if (USUARIOS_LIBERADOS.includes(ctx.user?.id)) return true;

    const member =
      ctx.member?.roles?.cache
        ? ctx.member
        : await ctx.guild?.members.fetch(ctx.user.id).catch(() => null);

    if (!member) return false;

    return CARGOS_REGISTRO_EVENTO.some(id =>
      member.roles.cache.has(id)
    );
  } catch {
    return false;
  }
}

// ✅ Verificação RÁPIDA (sem fetch) para o botão não travar
function isAutorizadoFast(interaction) {
  try {
    const perms = interaction.memberPermissions;
    if (perms?.has(PermissionFlagsBits.Administrator) || perms?.has(PermissionFlagsBits.ManageGuild)) return true;
    if (USUARIOS_LIBERADOS.includes(interaction.user.id)) return true;

    const member = interaction.member;
    // Se não tiver cache de cargos, retorna null (deixa abrir e checa no submit)
    if (!member || !member.roles || !member.roles.cache) return null;

    return CARGOS_REGISTRO_EVENTO.some(id => member.roles.cache.has(id));
  } catch {
    return null;
  }
}

// =================== LÓGICA AUXILIAR ===================
/**
 * Remove botões antigos e envia um novo para o final do chat
 */
async function resetarBotao(channel, client) {
  try {
    if (!channel?.isTextBased?.()) return null;

    const msgs = await channel.messages.fetch({ limit: 30 }).catch(() => null);

    if (msgs) {
      for (const msg of msgs.values()) {
        const btn = msg.components?.[0]?.components?.[0];

        // ✅ apaga APENAS o botão antigo, nunca registros
        if (msg.author?.id === client.user?.id && btn?.customId === "abrir_registro_evento") {
          await msg.delete().catch(() => {});
        }
      }
    }

    return await channel.send({
      embeds: [buildEmbedBotao()],
      components: [new ActionRowBuilder().addComponents(buildBotao())],
    }).catch((err) => {
      console.error("Erro ao enviar novo botão de evento:", err);
      return null;
    });
  } catch (err) {
    console.error("Erro ao resetar botão de evento:", err);
    return null;
  }
}

// =================== FUNÇÃO PRINCIPAL ===================
function iniciarRegistroEvento(client) {
  if (client.registroEventoSocialMediaIniciado) return;
  client.registroEventoSocialMediaIniciado = true;

  console.log('⚙️ Módulo Registro de Eventos carregado.');
  // console.log('⚙️ Módulo Registro de Eventos carregado.');

  // ✅ Função de Setup
  const setupBotaoEvento = async () => {
    const canal = await client.channels.fetch(CANAL_REGISTRO_EVENTO).catch(() => null);
    if (!canal) return console.log('❌ Canal de Registro de Evento não encontrado.');
    await resetarBotao(canal, client);
  };

  // ✅ SE O BOT JÁ ESTIVER ON, RODA AGORA.
  if (client.isReady()) {
    setupBotaoEvento();
  } else {
    client.once(Events.ClientReady, setupBotaoEvento);
  }

  // 2. COMANDO: !registroevento (Força o reenvio do botão)
  client.on(Events.MessageCreate, async message => {
    if (!message.guild || message.author.bot) return;
    if (!/^!registroevento\b/i.test(message.content)) return;

    const autorizado = await isAutorizado({
      user: message.author,
      member: message.member,
      memberPermissions: message.member?.permissions,
      guild: message.guild,
    });

    if (!autorizado) return;

    await message.delete().catch(() => {});

    const canal = await client.channels.fetch(CANAL_REGISTRO_EVENTO).catch(() => null);
    if (canal) await resetarBotao(canal, client);
  });

  // 3. INTERAÇÕES: Botão e Modal
  client.on(Events.InteractionCreate, async interaction => {
    try {
      // Botão -> Abre Modal
      if (interaction.isButton() && interaction.customId === 'abrir_registro_evento') {
        // ✅ Usa verificação rápida
        const auth = isAutorizadoFast(interaction);
        
        // Se tiver certeza que NÃO pode, bloqueia. Se for null (sem cache) ou true, deixa passar.
        if (auth === false) {
          return interaction.reply({ content: '⚠️ Você não tem permissão.', ephemeral: true }).catch(() => {});
        }
        try {
          await interaction.showModal(buildModal());
        } catch (e) {
          console.error('[RegistroEvento] Erro ao abrir modal:', e);
        }
        return;
      }

      // Modal Submit -> Processa Registro
      if (interaction.isModalSubmit() && interaction.customId === "modal_registro_evento") {
        // ✅ Ganha tempo imediatamente
        await interaction.deferReply({ ephemeral: true }).catch(() => {});

        const guild = interaction.guild;
        if (!(await isAutorizado(interaction))) {
          return interaction
            .editReply({ content: "⚠️ Sem permissão." })
            .catch(() => {});
        }

const get = (id) =>
  interaction.fields.getTextInputValue(id)?.trim().slice(0, 256) || "—";

const jogadorValue = get("jogador");
const eventoValue = get("evento");
const horarioValue = get("horario");
const dataValue = get("data");

const isNoUseRegister = isNoPowerEventRegister(
  jogadorValue,
  eventoValue,
  horarioValue,
  dataValue
);

// ✅ Pega o timestamp anterior para o log
const stEv = readEventPowerState();
const oldLastAt = Number(stEv?.users?.[interaction.user.id]?.lastRegisterAt || 0);
stEv.users[interaction.user.id] = { lastRegisterAt: Date.now() };
writeEventPowerState(stEv);

try {
  if (typeof globalThis.SC_PODERES_hasRegisteredLastHours === "function") {
    // força o sistema geral a reconhecer que houve registro recente
  }

  const poderesStatePath = path.resolve(__dirname, "../data/poderes_reminder_state.json");
  let poderesState = { users: {} };

  try {
    poderesState = JSON.parse(fs.readFileSync(poderesStatePath, "utf8"));
  } catch {}

  poderesState.users ||= {};
  poderesState.users[interaction.user.id] ||= {};
  poderesState.users[interaction.user.id].lastRegisterAt = Date.now();
  poderesState.users[interaction.user.id].lastReminderAt = 0;

  fs.writeFileSync(poderesStatePath, JSON.stringify(poderesState, null, 2), "utf8");
} catch (e) {
  console.error("[RegistroEvento] Falha ao sincronizar registro com lembretes gerais:", e);
}

// ✅ MARCA QUE ESSA PESSOA JÁ REGISTROU PODERES NESSE EVENTO
try {
  SC_EVENT_POWER_MEMORY.set(
    normalizePowerEventKey(interaction.user.id, eventoValue, dataValue),
    {
      userId: interaction.user.id,
      evento: eventoValue,
      horario: horarioValue,
      data: dataValue,
      registeredAt: Date.now(),
    }
  );
} catch {}

const embed = new EmbedBuilder()
  .setTitle("📋 Registro de Poderes em Evento") // ✅ Ajustado para o Scanner do Dash reconhecer como Poderes
.addFields(
  { name: "👤 Membro", value: jogadorValue, inline: true },
  { name: "📌 Evento", value: eventoValue, inline: true },
  { name: "⏰ Horário", value: horarioValue, inline: true },
  { name: "📅 Data", value: dataValue, inline: true },
  { name: "📊 Pontuação", value: isNoUseRegister ? "🚫 Não pontuar — sem uso/ausente" : "✅ Pontuar normalmente", inline: false },
  { name: "✍️ Registrado por", value: `<@${interaction.user.id}>` }
)
          .setThumbnail(interaction.user.displayAvatarURL())
          .setColor("Blue")
          .setFooter({ text: `Registro por ${interaction.user.tag}` })
          .setTimestamp();

        const canal = await client.channels.fetch(CANAL_REGISTRO_EVENTO).catch(() => null);
        if (!canal) {
          return interaction.editReply({ content: "❌ Erro: Canal de logs não encontrado." }).catch(() => {});
        }

        // Envia o log no canal
        const registroMsg = await canal.send({
          content: `<@${interaction.user.id}>`,
          embeds: [embed],
        });

        // ✅ Envia o log de auditoria completo
        if (registroMsg) await sendAuditEventLog(client, guild, interaction.member, { jogador: jogadorValue, evento: eventoValue, horario: horarioValue, data: dataValue }, registroMsg, oldLastAt);

        // ✅ Dash: Emitir o nome correto para contar no GeralDash (Social Medias)
if (!isNoUseRegister) {
  try {
    dashEmit("eventopoder:registrado", {
      userId: interaction.user.id,
      __at: Date.now(),
      source: "registro_evento",
      channelId: CANAL_REGISTRO_EVENTO,
    });
  } catch {}
}

        // Responde para o usuário que clicou (ephemeral)
        await interaction.editReply({ content: "✅ Registro enviado com sucesso!" }).catch(() => {});

        // Limpa botões antigos e envia um novo para ficar no final
        await resetarBotao(canal, client);
        return;
      }
    } catch (err) {
      console.error('Erro na interação de Registro de Evento:', err);
      // ✅ Failsafe: Tenta avisar o usuário se algo deu errado para não ficar carregando infinito
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ content: "❌ Ocorreu um erro interno ao processar seu registro." }).catch(() => {});
        }
      } catch {}
    }
  });
}

export { iniciarRegistroEvento };
