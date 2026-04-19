// d:\santacreators-main\events\registroPoderesEventos.js

import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType
} from "discord.js";
import { dashEmit } from "../utils/dashHub.js";

// ======= CONFIG =======
const SC_PWR_MENU_CHANNEL_ID = "1416693217415663657";
const SC_PWR_LEMBRETES_CHANNEL_ID = "1486006779425853582";

// ✅ NOVO: canal que o GeralDash / Ranking escaneiam para EVENTO / EVENTO PODER
const SC_PWR_EVENTOS_LOG_CHANNEL_ID = "1392618646630568076";

const SC_PWR_ALLOWED_USER_IDS = new Set([
  "1262262852949905408", // owner
  "660311795327828008",  // você
]);
const SC_PWR_ALLOWED_ROLE_IDS = new Set([
  "1414651836861907006", // responsaveis
  "1388976314253312100", // coord.
]);

const SC_PWR_GIF_URL = "https://cdn.discordapp.com/attachments/1362477839944777889/1374893068649500783/standard_1.gif";

// IDs únicos para componentes
const SC_PWR_MENU_TAG = "[SC_PWR_MENU_ANCHOR]";
const SC_PWR_BUTTON_ID = "SC_PWR_BTN_REGISTRAR";
const SC_PWR_MODAL_ID = "SC_PWR_MODAL_REGISTRO";
const SC_PWR_INPUT_USER_ID = "SC_PWR_INPUT_USER";
const SC_PWR_INPUT_PODER_ID = "SC_PWR_INPUT_PODER";
const SC_PWR_INPUT_OBS_ID = "SC_PWR_INPUT_OBS";

// 🔒 trava global para não registrar listeners/lógica duplicada
if (!globalThis.__SC_PWR_EVENTOS_MODULE_STATE__) {
  globalThis.__SC_PWR_EVENTOS_MODULE_STATE__ = {
    readyRan: false,
    recentSubmits: new Map(),
  };
}

const SC_PWR_STATE = globalThis.__SC_PWR_EVENTOS_MODULE_STATE__;
const SC_PWR_SUBMIT_LOCK_MS = 5000;

// ======= HELPERS =======
function SC_PWR_hasPermission(member) {
  if (!member) return false;
  if (SC_PWR_ALLOWED_USER_IDS.has(member.id)) return true;
  if (member.roles?.cache) {
    for (const r of member.roles.cache.keys()) {
      if (SC_PWR_ALLOWED_ROLE_IDS.has(r)) return true;
    }
  }
  return false;
}

function SC_PWR_acquireSubmitLock(key, ttl = SC_PWR_SUBMIT_LOCK_MS) {
  const now = Date.now();
  const until = SC_PWR_STATE.recentSubmits.get(key) || 0;

  if (until > now) return false;

  SC_PWR_STATE.recentSubmits.set(key, now + ttl);

  setTimeout(() => {
    const cur = SC_PWR_STATE.recentSubmits.get(key) || 0;
    if (cur <= Date.now()) SC_PWR_STATE.recentSubmits.delete(key);
  }, ttl + 250);

  return true;
}

async function SC_PWR_fetchChannel(client, id) {
  try {
    const ch = await client.channels.fetch(id).catch(() => null);
    return ch || null;
  } catch { return null; }
}

// aceita string ({content}) OU objeto ({embeds,...})
async function SC_PWR_sendDMAndMirror(client, guild, userId, payload) {
  const mirror = await SC_PWR_fetchChannel(client, SC_PWR_LEMBRETES_CHANNEL_ID);
  const asText =
    typeof payload === "string"
      ? payload
      : (payload?.content ||
          (payload?.embeds?.[0]?.data?.title
            ? `EMBED: ${payload.embeds[0].data.title}`
            : "(embed)"));

  try {
    const user = await client.users.fetch(userId);
    const dm = await user.send(typeof payload === "string" ? { content: payload } : payload);
    if (mirror) {
      await mirror.send({ content: `**[DM Enviada]** para <@${userId}>:\n${asText}` });
    }
    return dm;
  } catch (err) {
    if (mirror) {
      await mirror.send({
        content: `**[Falha DM]** Não consegui enviar DM para <@${userId}>.\nErro: \`${String(err?.message || err)}\`\nConteúdo:\n${asText}`,
      });
    }
  }
}

function alvoSafeUser(u) {
  return {
    id: u?.id || "0",
    username: u?.username || u?.tag || "Usuário",
    displayAvatarURL: (opts) => (u?.displayAvatarURL?.(opts) || u?.avatarURL?.(opts) || ""),
    tag: u?.tag || u?.username || "Usuário",
  };
}

function SC_PWR_bigEmbed({ guild, registrar, alvo, poder, obs }) {
  const emb = new EmbedBuilder()
    .setColor(0x9146FF)
    .setTitle("📋 Registro de Uso de Poder em Evento")
    .setDescription(
      [
        `**Poder setado:** ${poder}`,
        obs ? `**Obs.:** ${obs}` : "",
        "",
        `👤 **Alvo:** <@${alvo.id}> (\`${alvo.id}\`)`,
        `🛠️ **Registrado por:** <@${registrar.id}> (\`${registrar.id}\`)`,
        "",
        `✅ **GeralDash/Semanal:** +1 ponto para quem registrou`,
        `⏰ **Lembrete em 2h30** será enviado ao registrante para remover o poder.`,
      ].filter(Boolean).join("\n")
    )
    .addFields(
      { name: "🆔 Registrante ID", value: `\`${registrar.id}\``, inline: true },
      { name: "🆔 Alvo ID", value: `\`${alvo.id}\``, inline: true },
      { name: "🏷️ Origem", value: "`SC_PWR_EVENTO_PODER`", inline: true },
    )
    .setImage(SC_PWR_GIF_URL)
    .setTimestamp(new Date())
    .setFooter({ text: "SC_EVENTO_PODER_V2 • SC_PWR_EVENTO_PODER • REGISTRANTE_PONTUA" });

  if (alvo?.displayAvatarURL) emb.setThumbnail(alvo.displayAvatarURL({ size: 128 }));
  if (registrar?.displayAvatarURL) emb.setAuthor({
    name: `${registrar.username ?? registrar.tag ?? "Registrante"}`,
    iconURL: registrar.displayAvatarURL({ size: 128 }),
  });

  return emb;
}

function SC_PWR_menuEmbed() {
  return new EmbedBuilder()
    .setColor(0x2ECC71)
    .setTitle("🛡️ Registro de Poderes — SantaCreators")
    .setDescription(
      [
        "Use o botão abaixo para **registrar** quem recebeu algum **poder de evento** (ex.: `Wall`).",
        "",
        "**Como usar:**",
        "1) Clique em **Registrar Poder**",
        "2) Informe o **ID Discord** de quem recebeu o poder",
        "3) Informe o **nome do poder setado** (ex.: Wall)",
        "4) (Opcional) Adicione observações",
        "",
        "✅ Ao registrar:",
        "• Publica um registro **grandão** aqui mencionando você e a pessoa",
        "• Envia **DM** para os dois (e espelha no canal de lembretes)",
        "• Agenda **lembrete automático** em **2h30** para você remover o poder",
        "",
        "🔒 **Acesso restrito**: Owner,e Responsáveis.",
        "",
        SC_PWR_MENU_TAG
      ].join("\n")
    )
    .setImage(SC_PWR_GIF_URL);
}

function SC_PWR_menuComponents() {
  const btn = new ButtonBuilder()
    .setCustomId(SC_PWR_BUTTON_ID)
    .setLabel("Registrar Poder")
    .setStyle(ButtonStyle.Primary)
    .setEmoji("📝");

  return [new ActionRowBuilder().addComponents(btn)];
}

async function SC_PWR_ensureSingleMenu(client) {
  const chan = await SC_PWR_fetchChannel(client, SC_PWR_MENU_CHANNEL_ID);
  if (!chan || typeof chan.send !== "function") return;

  // Apaga apenas mensagens do bot que contenham a âncora do menu
  const msgs = await chan.messages.fetch({ limit: 50 }).catch(() => null);
  if (msgs) {
    const toDelete = msgs.filter(m =>
      m.author?.id === client.user?.id &&
      (m.content?.includes(SC_PWR_MENU_TAG) || m.embeds?.some(e => (e.description || "").includes(SC_PWR_MENU_TAG)))
    );
    for (const m of toDelete.values()) {
      await m.delete().catch(() => {});
    }
  }

  // Envia novo menu
  await chan.send({
    embeds: [SC_PWR_menuEmbed()],
    components: SC_PWR_menuComponents(),
  }).catch(() => {});
}

function SC_PWR_buildModal() {
  const modal = new ModalBuilder()
    .setCustomId(SC_PWR_MODAL_ID)
    .setTitle("Registrar Poder (Evento)");

  const inputUser = new TextInputBuilder()
    .setCustomId(SC_PWR_INPUT_USER_ID)
    .setLabel("ID Discord do Alvo (ex.: 123456789012345678)")
    .setPlaceholder("Cole apenas números do ID (sem @)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const inputPoder = new TextInputBuilder()
    .setCustomId(SC_PWR_INPUT_PODER_ID)
    .setLabel("Poder setado (ex.: Wall)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const inputObs = new TextInputBuilder()
    .setCustomId(SC_PWR_INPUT_OBS_ID)
    .setLabel("Observações (opcional)")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(inputUser),
    new ActionRowBuilder().addComponents(inputPoder),
    new ActionRowBuilder().addComponents(inputObs),
  );

  return modal;
}

// ======= EXPORTS =======

export async function registroPoderesEventosOnReady(client) {
    if (SC_PWR_STATE.readyRan) return;
    SC_PWR_STATE.readyRan = true;

    console.log("[SC_PWR] Online. Garantindo menu atualizado…");
    await SC_PWR_ensureSingleMenu(client);
}

export async function registroPoderesEventosHandleMessage(message, client) {
    if (!message.guild || message.author.bot) return false;
    if (message.content.toLowerCase() === "!pwrmenu") {
         if (!SC_PWR_hasPermission(message.member)) {
             const m = await message.reply("🚫 Sem permissão.");
             setTimeout(() => m.delete().catch(() => {}), 5000);
             return true;
         }
         await message.delete().catch(() => {});
         await SC_PWR_ensureSingleMenu(client);
         const m = await message.channel.send("✅ Menu de Poderes recriado.");
         setTimeout(() => m.delete().catch(() => {}), 5000);
         return true;
    }
    return false;
}

export async function registroPoderesEventosHandleInteraction(interaction, client) {
    try {
        if (!interaction.customId?.includes('SC_PWR_')) return false;

        // Botão -> abrir modal
        if (interaction.isButton?.() && interaction.customId === SC_PWR_BUTTON_ID) {
          if (!SC_PWR_hasPermission(interaction.member)) {
            return interaction.reply({ content: "❌ Você não tem permissão para usar este menu.", ephemeral: true }).catch(() => {});
          }
          const modal = SC_PWR_buildModal();
          return interaction.showModal(modal).catch(() => {});
        }

        // Modal -> processar registro
        if (interaction.isModalSubmit?.() && interaction.customId === SC_PWR_MODAL_ID) {
          if (!SC_PWR_hasPermission(interaction.member)) {
            return interaction.reply({ content: "❌ Você não tem permissão para registrar.", ephemeral: true }).catch(() => {});
          }

          const guild = interaction.guild;
          const registrar = interaction.user;

          const idStr = interaction.fields.getTextInputValue(SC_PWR_INPUT_USER_ID)?.trim();
          const poder = interaction.fields.getTextInputValue(SC_PWR_INPUT_PODER_ID)?.trim();
          const obs = (interaction.fields.getTextInputValue(SC_PWR_INPUT_OBS_ID)?.trim()) || "";

          const submitLockKey = [
            registrar?.id || "0",
            idStr || "0",
            String(poder || "").trim().toLowerCase(),
            String(obs || "").trim().toLowerCase()
          ].join("::");

          if (!SC_PWR_acquireSubmitLock(submitLockKey)) {
            return interaction.reply({
              content: "⏳ Esse registro já está sendo processado ou acabou de ser enviado. Aguarde alguns segundos.",
              ephemeral: true
            }).catch(() => {});
          }

          if (!/^\d{16,21}$/.test(idStr)) {
            return interaction.reply({ content: "⚠️ **ID Discord inválido.** Envie apenas números do ID (16-21 dígitos).", ephemeral: true }).catch(() => {});
          }

          const alvoUser = await client.users.fetch(idStr).catch(() => null);
          if (!alvoUser) {
            return interaction.reply({ content: "⚠️ Não consegui encontrar o usuário pelo ID informado.", ephemeral: true }).catch(() => {});
          }

          if (!registrar?.id) {
            return interaction.reply({ content: "❌ Não consegui identificar quem está registrando.", ephemeral: true }).catch(() => {});
          }

          if (String(alvoUser.id) === String(registrar.id)) {
            return interaction.reply({
              content: "⚠️ Você não pode registrar poder de evento para você mesmo nesse menu.",
              ephemeral: true
            }).catch(() => {});
          }

          const menuChan = await SC_PWR_fetchChannel(client, SC_PWR_MENU_CHANNEL_ID);
          if (!menuChan) {
            return interaction.reply({ content: "❌ Erro: canal do menu não encontrado.", ephemeral: true }).catch(() => {});
          }

          // ✅ NOVO: canal real de logs/scan do GeralDash + Ranking
          const eventosLogChan = await SC_PWR_fetchChannel(client, SC_PWR_EVENTOS_LOG_CHANNEL_ID);

          // Registro público no canal de menu
          const emb = SC_PWR_bigEmbed({
            guild,
            registrar: alvoSafeUser(registrar),
            alvo: alvoSafeUser(alvoUser),
            poder,
            obs
          });

          // 1) envia no canal do menu
          const registroMsg = await menuChan.send({ embeds: [emb] }).catch(() => null);

          // 2) ✅ NOVO: envia também no canal de logs de eventos
          let registroLogMsg = null;
          if (eventosLogChan && eventosLogChan.id !== menuChan.id) {
            registroLogMsg = await eventosLogChan.send({ embeds: [emb] }).catch(() => null);
          }

          // ✅ emite pro GeralDash / Ranking atualizarem na hora
try {
  dashEmit("eventopoder:registrado", {
    userId: String(registrar.id),          // quem ganha o ponto
    registrarUserId: String(registrar.id), // redundância intencional para debug/rastreamento
    alvoUserId: String(alvoUser.id),
    poder,
    obs,
    source: "eventopoder",
    sourceLabel: "Setou Poder",
    sourceSystem: "registroPoderesEventos",
    channelId: String(registroLogMsg?.channelId || eventosLogChan?.id || menuChan.id),
    messageId: String(registroLogMsg?.id || registroMsg?.id || ""),
    __at: Date.now(),
  });
} catch (e) {
  console.error("[SC_PWR] Falha ao emitir dash event eventopoder:registrado:", e);
}

          await interaction.reply({
            content: `✅ Registro criado com sucesso para <@${alvoUser.id}> — **${poder}**.\nVocê ganhou **+1 ponto** no Geral/Semanal.\nUm lembrete será enviado em **2h30**.`,
            ephemeral: true
          }).catch(() => {});

          // Recria o menu (apaga somente o botão antigo)
          await SC_PWR_ensureSingleMenu(client);

          // DM para o alvo
          const dmAlvoEmbed = new EmbedBuilder()
            .setColor(0x9146FF)
            .setTitle(`🛡️ Você recebeu um poder de evento em ${guild?.name || "SantaCreators"}`)
            .setDescription(
              [
                `**Poder:** ${poder}`,
                obs ? `**Obs.:** ${obs}` : "",
                `**Registrado por:** ${registrar.tag || registrar.username} (<@${registrar.id}>)`,
                "",
                "⚠️ Ao final do evento, esse poder será removido."
              ].filter(Boolean).join("\n")
            )
            .setImage(SC_PWR_GIF_URL);
          await SC_PWR_sendDMAndMirror(client, guild, alvoUser.id, { embeds: [dmAlvoEmbed] });

          // DM para o registrante (confirmação)
          const dmRegEmbed = new EmbedBuilder()
            .setColor(0x2ECC71)
            .setTitle("✅ Registro confirmado")
            .setDescription(
              [
                `**Alvo:** ${alvoUser.tag || alvoUser.username} (<@${alvoUser.id}>)`,
                `**Poder:** ${poder}`,
                obs ? `**Obs.:** ${obs}` : "",
                "",
                "⏰ Vou te lembrar em **2h30** para remover o poder."
              ].filter(Boolean).join("\n")
            )
            .setImage(SC_PWR_GIF_URL);
          await SC_PWR_sendDMAndMirror(client, guild, registrar.id, { embeds: [dmRegEmbed] });

          // ====== LEMBRETE EM 2h30 ======
          const lembreteMs = (2 * 60 + 30) * 60 * 1000; // 2h30
          setTimeout(async () => {
            // PV do registrante (DM em embed)
            const dmLembrete = new EmbedBuilder()
              .setColor(0xF1C40F)
              .setTitle("🔔 Lembrete de Remoção de Poder (2h30)")
              .setDescription(
                [
                  `**Alvo:** <@${alvoUser.id}> (\`${alvoUser.id}\`)`,
                  `**Poder:** ${poder}`,
                  obs ? `**Obs.:** ${obs}` : "",
                  `🛠️ **Registrado por:** <@${registrar.id}> (\`${registrar.id}\`)`
                ].filter(Boolean).join("\n")
              )
              .setImage(SC_PWR_GIF_URL);

            await SC_PWR_sendDMAndMirror(client, guild, registrar.id, { embeds: [dmLembrete] });

            // Mensagem no canal de lembretes, mencionando o registrante
            const lembreteChan = await SC_PWR_fetchChannel(client, SC_PWR_LEMBRETES_CHANNEL_ID);
            if (lembreteChan) {
              const lembreteEmbed = new EmbedBuilder()
                .setColor(0xF1C40F)
                .setTitle("🔔 Lembrete de Remoção de Poder (2h30)")
                .setDescription(
                  [
                    `**Alvo:** <@${alvoUser.id}> (\`${alvoUser.id}\`)`,
                    `**Poder:** ${poder}`,
                    obs ? `**Obs.:** ${obs}` : "",
                    `🛠️ **Registrado por:** <@${registrar.id}> (\`${registrar.id}\`)`
                  ].filter(Boolean).join("\n")
                )
                .setImage(SC_PWR_GIF_URL);

              await lembreteChan.send({ content: `<@${registrar.id}>`, embeds: [lembreteEmbed] });
            }
          }, lembreteMs);
          
          return true;
        }

      } catch (err) {
        console.error("[SC_PWR] Erro em interactionCreate:", err);
      }
      return false;
}