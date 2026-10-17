

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
import {
  createPowerWorkflow,
  powerInteractionOperationId,
  withPowerStateLock,
} from "../utils/sitePowerWorkflow.js";

// ✅ __dirname no ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ STATE compartilhado com o módulo de lembretes
const PODERES_STATE_PATH = path.resolve(__dirname, "../data/poderes_reminder_state.json");

// ✅ STATE exclusivo do cooldown do Registro de Poderes
// Evita conflito com outros sistemas que também escrevem em poderes_reminder_state.json
const REGPOD_COOLDOWN_STATE_PATH = path.resolve(__dirname, "../data/registropoderes_cooldown_state.json");

// ✅ COOLDOWN: 8 horas sem registrar de novo
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
    const dir =
      path.dirname(PODERES_STATE_PATH);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, {
        recursive: true,
      });
    }

    const tmp =
      PODERES_STATE_PATH + ".tmp";

    fs.writeFileSync(
      tmp,
      JSON.stringify(state, null, 2),
      "utf8"
    );

    fs.renameSync(
      tmp,
      PODERES_STATE_PATH
    );
  } catch (error) {
    throw error;
  }
}

function readRegpodCooldownState() {
  try {
    const raw = fs.readFileSync(REGPOD_COOLDOWN_STATE_PATH, "utf8");
    const json = JSON.parse(raw);
    if (!json || typeof json !== "object") return { users: {} };
    if (!json.users || typeof json.users !== "object") json.users = {};
    return json;
  } catch {
    return { users: {} };
  }
}

function writeRegpodCooldownState(state) {
  try {
    const dir = path.dirname(
      REGPOD_COOLDOWN_STATE_PATH
    );

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, {
        recursive: true,
      });
    }

    const tmp =
      REGPOD_COOLDOWN_STATE_PATH +
      ".tmp";

    fs.writeFileSync(
      tmp,
      JSON.stringify(state, null, 2),
      "utf8"
    );

    fs.renameSync(
      tmp,
      REGPOD_COOLDOWN_STATE_PATH
    );
  } catch (error) {
    throw error;
  }
}

function markRegpodCooldown(userId, at = Date.now()) {
  return withPoderesLock(() => {
    const state = readRegpodCooldownState();
    if (!state.users[userId]) state.users[userId] = {};

    state.users[userId].lastRegisterAt = at;

    writeRegpodCooldownState(state);
  });
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

async function syncPowerRegisterFromMessage(message) {
  try {
    if (!message || message.author?.bot !== true) return;

    const validChannels = [
      CANAL_REGISTRO_ID,
      CANAL_LOG_REGISTRO_PODERES_ID,
    ];

    if (!validChannels.includes(String(message.channelId))) return;

    const raw = [
      message.content || "",
      ...(message.embeds || []).map((e) => {
        const fields = e.fields?.map((f) => `${f.name}\n${f.value}`).join("\n") || "";
        return `${e.title || ""}\n${e.description || ""}\n${fields}`;
      }),
    ].join("\n");

    const mentionMatch = raw.match(/<@!?(\d{10,25})>/);
    const idFieldMatch = raw.match(/(?:ID|Discord ID|Registrado por).*?(\d{10,25})/is);

    const userId = mentionMatch?.[1] || idFieldMatch?.[1];
    if (!userId) return;

    await markUserRegistered(userId, message.createdTimestamp || Date.now());
  } catch (e) {
    console.error("[REGPOD] Falha ao sincronizar registro por mensagem:", e);
  }
}

globalThis.SC_PODERES_hasRegisteredLastHours = async function SC_PODERES_hasRegisteredLastHours(client, userId, hours = 24) {
  const since = Date.now() - hours * 60 * 60 * 1000;

  const state = readPoderesState();
  const last = Number(state?.users?.[userId]?.lastRegisterAt || 0);
  if (last >= since) return true;

  const channelsToScan = [
    CANAL_REGISTRO_ID,
    CANAL_LOG_REGISTRO_PODERES_ID,
  ];

  for (const channelId of channelsToScan) {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased?.()) continue;

    const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
    if (!messages) continue;

    for (const msg of messages.values()) {
      if ((msg.createdTimestamp || 0) < since) continue;

      const raw = [
        msg.content || "",
        ...(msg.embeds || []).map((e) => {
          const fields = e.fields?.map((f) => `${f.name}\n${f.value}`).join("\n") || "";
          return `${e.title || ""}\n${e.description || ""}\n${fields}`;
        }),
      ].join("\n");

      if (raw.includes(userId) || raw.includes(`<@${userId}>`) || raw.includes(`<@!${userId}>`)) {
        await markUserRegistered(userId, msg.createdTimestamp || Date.now());
        return true;
      }
    }
  }

  return false;
};

// Configurações
const CANAL_REGISTRO_ID = '1374066813171929218';
const CANAL_LOG_REGISTRO_PODERES_ID = '1513319923471089714';

const GIF_PODERES_URL = 'https://media.discordapp.net/attachments/1362477839944777889/1384245215249825832/standard_2rss.gif';


async function resetarBotaoRegistroPoderes(canal, client) {
  try {
    if (!canal?.isTextBased?.()) return null;

    const mensagensAntigas = await canal.messages.fetch({ limit: 30 }).catch(() => null);

    if (mensagensAntigas) {
      for (const msg of mensagensAntigas.values()) {
        const btn = msg.components?.[0]?.components?.[0];

        // ✅ apaga APENAS o botão antigo, nunca registros
        if (msg.author?.id === client.user?.id && btn?.customId === "abrir_registro") {
          await msg.delete().catch(() => {});
        }
      }
    }

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

    return await canal.send({ embeds: [embedBtn], components: [rowBtn] }).catch((err) => {
      console.error("❌ Erro ao recriar botão de Registro de Poderes:", err);
      return null;
    });
  } catch (err) {
    console.error("❌ Erro ao resetar botão de Registro de Poderes:", err);
    return null;
  }
}

async function sendAuditLog(client, guild, member, data, registroMsg, oldLastAt) {
  try {
    const canalLog = await client.channels.fetch(CANAL_LOG_REGISTRO_PODERES_ID).catch(() => null);
    if (!canalLog?.isTextBased?.()) return;

    const now = Date.now();

    const ultimoRegistro =
      oldLastAt > 0
        ? `<t:${Math.floor(oldLastAt / 1000)}:R>`
        : "Primeiro registro";

    const embed = new EmbedBuilder()
      .setColor("#8b5cf6")
      .setTitle("📋 Auditoria — Registro de Poderes")
      .setDescription(
        [
          `👤 **Registrado por:** ${member} (\`${member.id}\`)`,
          `🔗 **Registro original:** ${registroMsg?.url ? `[Abrir mensagem](${registroMsg.url})` : "—"}`,
          "",
          `📅 **Data de uso:** \`${data.data || "—"}\``,
          `⏰ **Horário aproximado:** \`${data.horario || "—"}\``,
          "",
          `🔮 **Poderes utilizados:**`,
          `\`\`\`txt\n${data.poderes || "—"}\n\`\`\``,
          "",
          `⏳ **Último registro:** ${ultimoRegistro}`,
          `🕒 **Log gerada:** <t:${Math.floor(now / 1000)}:F>`,
        ].join("\n")
      )
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
      .setFooter({ text: "SantaCreators • Registro de Poderes" })
      .setTimestamp();

    await canalLog.send({ embeds: [embed] }).catch(() => {});
  } catch (err) {
    console.error("❌ Erro ao enviar log de Registro de Poderes:", err);
  }
}
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

const ALLOWED_USER_IDS = [
  '660311795327828008',
  '1262262852949905408',
];

const COOLDOWN_BYPASS_USER_IDS = [
  '660311795327828008',
  '1262262852949905408',
];

function podeIgnorarCooldown(userId) {
  return COOLDOWN_BYPASS_USER_IDS.includes(String(userId));
}

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
  installDailyPowerWorkflow(client);
  // ✅ GUARD GLOBAL (se importar 2x, não duplica listeners)
  if (globalThis.__REGPOD_MODULE_LOADED__) return;
  globalThis.__REGPOD_MODULE_LOADED__ = true;

  if (client.registroPoderesIniciado) return;
  client.registroPoderesIniciado = true;

  console.log('⚙️ Módulo Registro de Poderes carregado.');
  // console.log('⚙️ Módulo Registro de Poderes carregado.');

  // ✅ Função de Setup (Extraída para rodar imediatamente)
  const setupBotaoPoderes = async () => {
    console.log(`⚙️ Registro de Poderes verificando canal...`);
    // console.log(`⚙️ Registro de Poderes verificando canal...`);
    try {
      const canal = await client.channels.fetch(CANAL_REGISTRO_ID).catch(() => null);
      if (!canal) return console.log('❌ Canal de Registro de Poderes não encontrado.');

await resetarBotaoRegistroPoderes(canal, client);
console.log('✅ Botão de Registro de Poderes enviado.');
return;
      // console.log('✅ Botão de Registro de Poderes enviado.');

    } catch (err) {
      console.error('❌ Erro no ready do Registro de Poderes:', err);
    }
  };

  // ✅ SE O BOT JÁ ESTIVER ON, RODA AGORA. SE NÃO, ESPERA O READY.
  if (client.isReady()) {
    setupBotaoPoderes();
  } else {
    client.once(Events.ClientReady, setupBotaoPoderes);
  }

  // ========= EVENTO: INTERACTION CREATE (Botão e Modal) =========
  client.on(Events.MessageCreate, async (message) => {
  await syncPowerRegisterFromMessage(message);
});

client.on(Events.InteractionCreate, async (interaction) => {
    try {
      // 1) BOTÃO -> ABRE MODAL (SEM await pesado antes do showModal)
if (interaction.isButton() && interaction.customId === "abrir_registro") {
  // ✅ trava anti double-click / handler duplicado
  const lockKey = `REGPOD::abrir_registro::${interaction.user.id}`;
  if (!regpodAcquireLock(lockKey, 12000)) {
    return interaction
      .reply({
        content: "⏳ Calma, já estou abrindo o formulário. Evite clicar várias vezes.",
        ephemeral: true,
      })
      .catch(() => {});
  }

   // ✅ checagem rápida (sem fetch)
  const fast = isAuthorizedFast(interaction);

  // Se fast deu false (tem cache e não tem cargo), bloqueia aqui mesmo
  if (fast === false) {
    return interaction
      .reply({ content: "⚠️ Você não tem permissão para usar este menu.", ephemeral: true })
      .catch(() => {});
  }

// ✅ COOLDOWN 8h: owner/bypass ignora cooldown
if (!podeIgnorarCooldown(interaction.user.id)) {
  try {
const stCd = readRegpodCooldownState();
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
}

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


      // Discord e site usam o mesmo registro.
      if (
        interaction.isModalSubmit() &&
        interaction.customId === "formulario_registro"
      ) {
        await interaction.deferReply({
          ephemeral: true,
        }).catch(() => {});

        const get = (id, max) =>
          interaction.fields
            .getTextInputValue(id)
            .trim()
            .slice(0, max);

        const result =
          await client
            .__SC_POWER_WORKFLOWS__
            .powersdaily
            .submit({
              client,
              guild: interaction.guild,

              member:
                await interaction.guild.members.fetch(
                  interaction.user.id
                ),

              payload: {
                operationId:
                  powerInteractionOperationId(
                    interaction.id
                  ),

                values: {
                  poderes:
                    get('poderes', 1024),

                  data_uso:
                    get('data_uso', 100),

                  horario:
                    get('horario', 256),
                },
              },
            });

        await interaction.editReply({
          content: [
            '✅ Registro enviado com sucesso!',
            ...(result.warnings || []),
          ].join('\n'),
        });
      }

    } catch (error) {
      console.error('Erro ao processar interactionCreate (Registro de Poderes):', error);
      try {
        const content = error.status
          ? error.message
          : '❌ Não foi possível confirmar o registro. Confira o canal antes de repetir.';

        if (
          interaction.deferred ||
          interaction.replied
        ) {
          await interaction.editReply({
            content,
          });
        } else {
          await interaction.reply({
            content,
            ephemeral: true,
          });
        }
      } catch {}
    }
  });
}

export { iniciarRegistroPoderes };
function installDailyPowerWorkflow(client) {
  client.__SC_POWER_WORKFLOWS__ ??= {};

  client.__SC_POWER_WORKFLOWS__.powersdaily ??=
    createPowerWorkflow({
      key: 'powersdaily',
      label: 'Registrar poderes do dia',
      title: '📘 Registro de Poderes Utilizados',
      channelId: CANAL_REGISTRO_ID,
      authorize: isAuthorized,

      fields: [
        {
          id: 'poderes',
          label: 'Quais poderes utilizou?',
          maxLength: 1024,
          paragraph: true,
        },
        {
          id: 'data_uso',
          label: 'Data do uso',
          maxLength: 100,
        },
        {
          id: 'horario',
          label: 'Horário aproximado',
          maxLength: 256,
        },
      ],

      before(ctx) {
        const last = Number(
          readRegpodCooldownState()
            ?.users?.[ctx.member.id]
            ?.lastRegisterAt || 0
        );

        ctx.oldLastAt = last;

        const left =
          last +
          REGPOD_COOLDOWN_MS -
          Date.now();

        if (
          !podeIgnorarCooldown(ctx.member.id) &&
          last > 0 &&
          left > 0
        ) {
          throw Object.assign(
            new Error(
              'Aguarde ' +
              msToHuman(left) +
              ' para registrar novamente.'
            ),
            { status: 400 }
          );
        }
      },

      build(ctx, values) {
        const user = ctx.member.user;

        const ts =
          Math.floor(Date.now() / 1000);

        const nextAt = Math.floor(
          (
            Date.now() +
            REGPOD_COOLDOWN_MS
          ) / 1000
        );

        return {
          content: `<@${user.id}>`,

          embeds: [
            new EmbedBuilder()
              .setTitle(
                '📘 Registro de Poderes Utilizados'
              )
              .setColor('Purple')
              .setThumbnail(
                user.displayAvatarURL()
              )
              .addFields(
                {
                  name: '👤 Criado por',
                  value: `<@${user.id}>`,
                  inline: true,
                },
                {
                  name: '📅 Data',
                  value: values.data_uso,
                  inline: true,
                },
                {
                  name: '⏰ Horário aproximado',
                  value: values.horario,
                },
                {
                  name: '📨 Enviado em',
                  value: `<t:${ts}:F>`,
                },
                {
                  name: '🔓 Próximo registro liberado',
                  value:
                    `<t:${nextAt}:F> ` +
                    `(<t:${nextAt}:R>)`,
                },
                {
                  name: '🔮 Poderes Utilizados',
                  value: values.poderes,
                },
                {
                  name: '🆔 ID',
                  value: user.id,
                }
              )
              .setImage(GIF_PODERES_URL)
              .setFooter({
                text:
                  'SantaCreators – Sistema Oficial de Registro',
              }),
          ],
        };
      },

      async after(ctx, values, message) {
        const at = Date.now();

        await markUserRegistered(
          ctx.member.id,
          at
        );

        await markRegpodCooldown(
          ctx.member.id,
          at
        );

        dashEmit('poderes:registrado', {
          userId: ctx.member.id,
          __at: at,
          source: 'registro_poderes_utilizados',
          channelId: CANAL_REGISTRO_ID,
        });

        void sendAuditLog(
          client,
          ctx.guild,
          ctx.member,
          {
            data: values.data_uso,
            horario: values.horario,
            poderes: values.poderes,
          },
          message,
          ctx.oldLastAt
        ).catch(error =>
          console.error(
            '[PODERES] Auditoria:',
            error.message
          )
        );
      },

      refreshButton:
        resetarBotaoRegistroPoderes,
    });
}