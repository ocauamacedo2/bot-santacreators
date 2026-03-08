

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
  PermissionFlagsBits,
  ChannelType
} from "discord.js";

// ✅ ADD: HUB (conta no GeralDash: geral + métricas humanas)
import { dashEmit } from "../utils/dashHub.js";

// ✅ __dirname no ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ STATE compartilhado com o módulo de lembretes
const PODERES_STATE_PATH = path.resolve(__dirname, "../data/poderes_reminder_state.json");

// ✅ COOLDOWN: 12 horas sem registrar de novo
const REGPOD_COOLDOWN_MS = 8 * 60 * 60 * 1000;

// 🔒 MUTEX GLOBAL PARA O ARQUIVO (Mesmo nome do outro arquivo para compartilhar no mesmo processo)
if (!globalThis.__PODERES_FILE_MUTEX__) globalThis.__PODERES_FILE_MUTEX__ = Promise.resolve();

function withPoderesLock(fn) {
  const chain = globalThis.__PODERES_FILE_MUTEX__.then(fn, fn);
  globalThis.__PODERES_FILE_MUTEX__ = chain.catch(() => {});
  return chain;
}

function msToHuman(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

function readPoderesState() {
  try {
    const raw = fs.readFileSync(PODERES_STATE_PATH, "utf8");
    const json = JSON.parse(raw);
    if (!json || typeof json !== "object") return { users: {} };
    if (!json.users || typeof json.users !== "object") json.users = {};
    return json;
  } catch {
    return { users: {} };
  }
}


function writePoderesState(state) {
  try {
    const dir = path.dirname(PODERES_STATE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const tmp = PODERES_STATE_PATH + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), "utf8");
    fs.renameSync(tmp, PODERES_STATE_PATH);
  } catch {}
}

// ✅ Atualiza estado com LOCK
function markUserRegistered(userId, at = Date.now()) {
  return withPoderesLock(() => {
    const state = readPoderesState();
    if (!state.users[userId]) state.users[userId] = {};

    state.users[userId].lastRegisterAt = at;

    // ✅ se você tem módulo de lembretes lendo isso, zera aqui de verdade
    state.users[userId].lastReminderAt = 0;

    writePoderesState(state);
  });
}



// Configurações
const CANAL_REGISTRO_ID = '1374066813171929218';
const GIF_PODERES_URL = 'https://media.discordapp.net/attachments/1362477839944777889/1384245215249825832/standard_2rss.gif';

// Roles autorizados
const ALLOWED_ROLE_IDS = [
  '1352429001188180039', // equipe creator
  '1352939011253076000', // creator
  '1371733765243670538', // gestaoinfluencer
  '1352408327983861844', // resp creator
  '1262262852949905409', // resp influ
  '1352407252216184833', // resp lider
  '1352385500614234134', // coordenação
  '1414651836861907006', // responsaveis
];

const ALLOWED_USER_IDS = [];

// ===============================
// ✅ TRAVA ANTI DOUBLE-CLICK / HANDLER DUPLICADO
// ===============================
const __REGPOD_LOCKS__ = globalThis.__REGPOD_LOCKS__ || new Map();
globalThis.__REGPOD_LOCKS__ = __REGPOD_LOCKS__;

function regpodAcquireLock(key, ms = 4500) {
  const now = Date.now();
  const until = __REGPOD_LOCKS__.get(key) || 0;
  if (until > now) return false;

  __REGPOD_LOCKS__.set(key, now + ms);

  setTimeout(() => {
    if ((__REGPOD_LOCKS__.get(key) || 0) <= Date.now()) __REGPOD_LOCKS__.delete(key);
  }, ms + 250);

  return true;
}

/**
 * ✅ check rápido (SEM fetch / SEM await)
 * - se tiver roles em cache: decide true/false
 * - se não tiver cache: retorna null (deixa abrir modal e valida no submit)
 */
function isAuthorizedFast(interaction) {
  try {
    const perms = interaction.memberPermissions;
    if (
      perms?.has(PermissionFlagsBits.Administrator) ||
      perms?.has(PermissionFlagsBits.ManageGuild)
    ) return true;

    if (ALLOWED_USER_IDS.includes(interaction.user.id)) return true;

    const member = interaction.member;
    const rolesCache = member?.roles?.cache;
    if (!rolesCache) return null;

    return rolesCache.some((r) => ALLOWED_ROLE_IDS.includes(r.id));
  } catch {
    return null;
  }
}

/**
 * ✅ Verifica se o usuário tem permissão (COM fetch se precisar)
 */
async function isAuthorized(interaction) {
  try {
    const perms = interaction.memberPermissions;
    if (
      perms?.has(PermissionFlagsBits.Administrator) ||
      perms?.has(PermissionFlagsBits.ManageGuild)
    ) return true;

    if (ALLOWED_USER_IDS.includes(interaction.user.id)) return true;

    const member = interaction.member?.roles?.cache
      ? interaction.member
      : await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

    if (!member) return false;
    return member.roles.cache.some((r) => ALLOWED_ROLE_IDS.includes(r.id));
  } catch {
    return false;
  }
}


function iniciarRegistroPoderes(client) {
  // ✅ GUARD GLOBAL (se importar 2x, não duplica listeners)
  if (globalThis.__REGPOD_MODULE_LOADED__) return;
  globalThis.__REGPOD_MODULE_LOADED__ = true;

  if (client.registroPoderesIniciado) return;
  client.registroPoderesIniciado = true;

  console.log('⚙️ Módulo Registro de Poderes carregado.');
  // console.log('⚙️ Módulo Registro de Poderes carregado.');


  // ========= EVENTO: READY (Envia/Renova o botão ao iniciar) =========
  client.on(Events.ClientReady, async () => {
    console.log(`⚙️ Registro de Poderes verificando canal...`);
    // console.log(`⚙️ Registro de Poderes verificando canal...`);
    try {
      const canal = await client.channels.fetch(CANAL_REGISTRO_ID).catch(() => null);
      if (!canal) return console.log('❌ Canal de Registro de Poderes não encontrado.');

      // Limpa botões antigos do bot (deixa só 1)
      const mensagensAntigas = await canal.messages.fetch({ limit: 20 }).catch(() => null);
      if (mensagensAntigas) {
        for (const msg of mensagensAntigas.values()) {
          const btn = msg.components?.[0]?.components?.[0];
          // Verifica se é mensagem do bot e se tem o botão específico
          if (msg.author.id === client.user.id && btn?.customId === 'abrir_registro') {
            await msg.delete().catch(() => {});
          }
        }
      }

      // Envia o botão atualizado
      const embed = new EmbedBuilder()
        .setColor('Purple')
        .setTitle('📘 Registro de Poderes Utilizados — SantaCreators')
        .setDescription(
          '🔮 **Registre o uso de poderes com players durante interações, vídeos ou conteúdos.**\n\n' +
          '📅 Informe **a data em que os poderes foram usados**.\n' +
          '🧠 Descreva os **poderes utilizados**.\n' +
          '⏰ Especifique o **horário aproximado de uso**.\n\n' +
          '✅ Apenas membros autorizados podem registrar.\n' +
          '🔁 Após cada envio, um **novo botão será gerado automaticamente** para facilitar novos registros.'
        )
        .setImage(GIF_PODERES_URL)
        .setFooter({ text: 'SantaCreators – Sistema Oficial de Registro' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('abrir_registro')
          .setLabel('📘 Registrar Poderes Utilizados')
          .setStyle(ButtonStyle.Primary)
      );

      await canal.send({ embeds: [embed], components: [row] });
      console.log('✅ Botão de Registro de Poderes enviado.');
      // console.log('✅ Botão de Registro de Poderes enviado.');

    } catch (err) {
      console.error('❌ Erro no ready do Registro de Poderes:', err);
    }
  });

  // ========= EVENTO: INTERACTION CREATE (Botão e Modal) =========
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      // 1) BOTÃO -> ABRE MODAL (SEM await pesado antes do showModal)
if (interaction.isButton() && interaction.customId === "abrir_registro") {
  // ✅ trava anti double-click / handler duplicado
  const lockKey = `REGPOD::abrir_registro::${interaction.user.id}`;
  if (!regpodAcquireLock(lockKey, 4500)) return;

   // ✅ checagem rápida (sem fetch)
  const fast = isAuthorizedFast(interaction);

  // Se fast deu false (tem cache e não tem cargo), bloqueia aqui mesmo
  if (fast === false) {
    return interaction
      .reply({ content: "⚠️ Você não tem permissão para usar este menu.", ephemeral: true })
      .catch(() => {});
  }

  // ✅ COOLDOWN 12h: já bloqueia aqui pra nem abrir modal
  try {
    const stCd = readPoderesState();
    const last = Number(stCd?.users?.[interaction.user.id]?.lastRegisterAt || 0);
    if (last > 0) {
      const now = Date.now();
      const nextAt = last + REGPOD_COOLDOWN_MS;
      if (now < nextAt) {
        const left = nextAt - now;
        return interaction
          .reply({
            content: `⏳ Você já registrou recentemente. Espera **${msToHuman(left)}** pra registrar de novo.`,
            ephemeral: true,
          })
          .catch(() => {});
      }
    }
  } catch {}

  const modal = new ModalBuilder()
    .setCustomId("formulario_registro")
    .setTitle("Registro de Poderes Utilizados")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("poderes")
          .setLabel("Quais poderes utilizou?")
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder("ex: god, nc, tptome")
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("data_uso")
          .setLabel("Data de uso (ex: 03/07)")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("03/07")
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("horario")
          .setLabel("Horário aproximado (ex: 22h30 até 22h45)")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("22h30 até 22h45")
          .setRequired(true)
      )
    );


  try {
    await interaction.showModal(modal);
  } catch (err) {
    const code = err?.code ?? err?.rawError?.code;

    // ✅ 10062 = expirou | 40060 = já foi reconhecida por outro handler
    if (code === 10062 || code === 40060) {
      console.log(`[REGPOD] showModal falhou (code ${code}) — clique expirou/duplicado. Ignorando.`);
      return;
    }

    console.error("❌ Erro ao abrir modal de Poderes:", err);
    return;
  }

  return;
}


      // 2. Enviou o Modal -> Processa e Loga
            if (interaction.isModalSubmit() && interaction.customId === "formulario_registro") {
  // ✅ ACK PRIMEIRO (pra nunca expirar)
  await interaction.deferReply({ ephemeral: true }).catch(() => {});

  const autorizado = await isAuthorized(interaction);
  if (!autorizado) {
    return interaction
      .editReply("⚠️ Você não tem permissão para enviar este registro.")
      .catch(() => {});
  }

  // ✅ COOLDOWN 12h: segurança (mesmo se alguém burlar o botão)
  try {
    const stCd = readPoderesState();
    const last = Number(stCd?.users?.[interaction.user.id]?.lastRegisterAt || 0);
    if (last > 0) {
      const now = Date.now();
      const nextAt = last + REGPOD_COOLDOWN_MS;
      if (now < nextAt) {
        const left = nextAt - now;
        return interaction
          .editReply(`⏳ Você já registrou recentemente. Espera **${msToHuman(left)}** pra registrar de novo.`)
          .catch(() => {});
      }
    }
  } catch {}

  const canal = await client.channels.fetch(CANAL_REGISTRO_ID).catch(() => null);
  if (!canal) {
    return interaction
      .editReply("❌ Canal de registro não encontrado.")
      .catch(() => {});
  }

        const user = interaction.user;
        const poderes = interaction.fields.getTextInputValue('poderes')?.trim().slice(0, 1024) ?? '';
        const data = interaction.fields.getTextInputValue('data_uso')?.trim().slice(0, 100) ?? '';
        const horario = interaction.fields.getTextInputValue('horario')?.trim().slice(0, 256) ?? '';
        const ts = Math.floor(Date.now() / 1000);


        const embed = new EmbedBuilder()
          .setTitle('📘 Registro de Poderes Utilizados')
          .setColor('Purple')
          .setThumbnail(user.displayAvatarURL({ dynamic: true }))
          .addFields(
            { name: '👤 Criado por', value: `<@${user.id}>`, inline: true },
            { name: '📅 Data', value: data || '—', inline: true },
            { name: '⏰ Horário aproximado', value: horario || '—' },
            { name: '📨 Enviado em', value: `<t:${ts}:F>` },
            { name: '🔮 Poderes Utilizados', value: poderes || '—' },
            { name: '🆔 ID', value: user.id }
          )
          .setImage(GIF_PODERES_URL)
          .setFooter({ text: 'SantaCreators – Sistema Oficial de Registro' });

        // Remove botões antigos para manter o chat limpo
        const mensagensAntigas = await canal.messages.fetch({ limit: 20 }).catch(() => null);
        if (mensagensAntigas) {
          for (const msg of mensagensAntigas.values()) {
            const btn = msg.components?.[0]?.components?.[0];
            if (msg.author.id === client.user.id && btn?.customId === 'abrir_registro') {
              await msg.delete().catch(() => {});
            }
          }
        }

        // Envia o registro
await canal.send({ content: `<@${user.id}>`, embeds: [embed] }).catch(() => {});

// ✅ NOVO: salva “último registro” (pra lembretes 24h/48h funcionarem)
// Usa o LOCK para garantir que a escrita não seja sobrescrita pelo loop de lembretes
try {
  await markUserRegistered(user.id, Date.now());
} catch (e) {
  console.error("Erro ao salvar registro de poderes:", e);
}

// ✅ ADD: manda pro HUB contar no GeralDash
try {
  dashEmit("poderes:registrado", {
    userId: interaction.user.id,
    __at: Date.now(),
    source: "registro_poderes_utilizados",
    channelId: CANAL_REGISTRO_ID,
  });
} catch {}




// Reenvia o botão logo abaixo
const embedBtn = new EmbedBuilder()
  .setColor("Purple")
  .setTitle("📘 Registro de Poderes Utilizados — SantaCreators")
  .setDescription(
    "🔮 **Registre o uso de poderes com players durante interações, vídeos ou conteúdos.**\n\n" +
      "📅 Informe **a data em que os poderes foram usados**.\n" +
      "🧠 Descreva os **poderes utilizados**.\n" +
      "⏰ Especifique o **horário aproximado de uso**.\n\n" +
      "✅ Apenas membros autorizados podem registrar.\n" +
      "🔁 Após cada envio, um **novo botão será gerado automaticamente** para facilitar novos registros."
  )
  .setImage(GIF_PODERES_URL)
  .setFooter({ text: "SantaCreators – Sistema Oficial de Registro" });

const rowBtn = new ActionRowBuilder().addComponents(
  new ButtonBuilder()
    .setCustomId("abrir_registro")
    .setLabel("📘 Registrar Poderes Utilizados")
    .setStyle(ButtonStyle.Primary)
);

await canal.send({ embeds: [embedBtn], components: [rowBtn] });

await interaction.editReply("✅ Registro enviado com sucesso!");

      }

    } catch (error) {
      console.error('Erro ao processar interactionCreate (Registro de Poderes):', error);
      try {
        if (!interaction.deferred && !interaction.replied) {
          await interaction.reply({ content: '❌ Ocorreu um erro ao processar sua ação.', ephemeral: true });
        }
      } catch {}
    }
  });
}

export { iniciarRegistroPoderes };
