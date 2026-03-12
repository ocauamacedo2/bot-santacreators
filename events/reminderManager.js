// /events/reminderManager.js
// Reminder Manager (discord.js v14 • ESM) — MONITOR DE VÁCUO & ENTREVISTAS
import { EmbedBuilder } from 'discord.js';

// =========================
// CONFIGURAÇÃO
// =========================

// 1. Categorias monitoradas
const ALLOWED_CATEGORY_IDS = new Set([
  "1359244725781266492", // Entrevista
  "1359245003523756136", // Suporte (ID corrigido conforme entrevistasTickets.js)
  "1359245055239655544", // Ideias
  // "1352706815594598420", // Roupas (REMOVIDO PARA NÃO NOTIFICAR)
  "1404568518179029142", // Banners
  "1444857594517913742", // Contratar em Game
]);

// ✅ Categoria específica para regra escalonada (5/10/20/40...)
const ENTREVISTA_CATEGORY_ID = "1359244725781266492";
const ESCALATING_THRESHOLDS = [5, 10, 20, 40, 80, 160, 320, 640, 1280]; // Minutos

// 2. Cargos que RECEBEM o alerta no PV
const ALERT_ROLE_IDS = [
  "1282119104576098314", // mkt creators
  "1352407252216184833", // resp lider (SUPERIOR)
  "1262262852949905409", // resp influ (SUPERIOR)
  "1388976314253312100", // coord creators
  "1388975939161161728", // gestor creators
];

// 3. Cargos considerados SUPERIORES (não recebem a msg de "chame um superior")
const SUPERIOR_ROLE_IDS = new Set([
  "1352407252216184833", // resp lider
  "1262262852949905409", // resp influ
]);

// 4. Se quem abriu o ticket tiver esses cargos, NÃO notifica (staff abrindo ticket)
const IGNORE_IF_OPENER_HAS_ROLES = new Set([
  "1282119104576098314", // mkt creators
  "1352407252216184833", // resp lider
  "1262262852949905409", // resp influ
  "1388976314253312100", // coord creators
  "1388975939161161728", // gestor creators
  "660311795327828008",  // você
  "1262262852949905408", // owner
]);

// 5. Canal de LOGS (onde vai ficar bonito)
const LOG_CHANNEL_ID = "1471695257010831614";

// 6. Quem conta como "respondeu por último" (se a última msg do canal for de alguém assim, para tudo)
const RESPONDER_STOP_ROLE_IDS = new Set([
  "1352385500614234134", // coordenação
  "1262262852949905408", // owner
  "660311795327828008",  // você
  "1414651836861907006", // responsáveis
  "1282119104576098314", // mkt creators
  "1352407252216184833", // resp lider
  "1262262852949905409", // resp influ
  "1388976314253312100", // coord creators
  "1388975939161161728", // gestor creators
]);

// 7. Tempos
const CHECK_INTERVAL_MS = 60 * 1000;      // Checa a cada 1 minuto
const REMINDER_DELAY_MS = 15 * 60 * 1000; // 15 minutos de vácuo para alertar

// Cache para evitar spam de DM no mesmo ciclo (channelId -> lastPingTime)
const lastPingMap = new Map();

// ✅ Cache para níveis de notificação escalonada (channelId -> lastThresholdMinutes)
const channelNotificationLevelMap = new Map();

// ✅ Cache para evitar processamento paralelo do mesmo canal (Race Condition)
const processingChannels = new Set();

// Cache para evitar spam de LOG "Monitoramento Ativo" (channelId -> lastLogTime)
const lastDebugLogMap = new Map();

// =========================
// FUNÇÕES AUXILIARES
// =========================

function memberHasAnyRole(member, roleSet) {
  if (!member?.roles?.cache) return false;
  return member.roles.cache.some((r) => roleSet.has(r.id));
}

function isStopResponder(member) {
  if (!member) return false;
  return memberHasAnyRole(member, RESPONDER_STOP_ROLE_IDS);
}

function isAllowedCategory(channel) {
  const parentId = channel?.parentId;
  return !!(parentId && ALLOWED_CATEGORY_IDS.has(parentId));
}

async function logToChannel(client, guild, data) {
  try {
    const channel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    const embed = new EmbedBuilder()
      .setTitle(data.title)
      .setColor(data.color || "#ff009a")
      .setDescription(data.description)
      .addFields(
        { name: "📍 Canal", value: `<#${data.channelId}>`, inline: true },
        { name: "👤 Usuário (Opener)", value: `<@${data.openerId}>`, inline: true },
        { name: "🕒 Horário", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
      )
      .setFooter({ text: "Sistema de Monitoramento de Tickets • SantaCreators" })
      .setTimestamp();

    if (data.thumbnail) embed.setThumbnail(data.thumbnail);

    await channel.send({ embeds: [embed] });
  } catch (e) {
    console.error("[Reminder] Erro ao logar:", e);
  }
}

// ✅ Função robusta para descobrir quem abriu o ticket
async function resolveOpenerId(channel) {
  // 1. Tenta cache imediato do tópico
  let topic = channel.topic;
  let m = topic?.match(/aberto_por:(\d{5,})/i);
  if (m) return m[1];

  // 2. Tenta fetch do canal (garante tópico atualizado da API)
  try {
    const fetched = await channel.fetch(true).catch(() => null);
    if (fetched?.topic) {
      m = fetched.topic.match(/aberto_por:(\d{5,})/i);
      if (m) return m[1];
    }
  } catch {}

  // 3. Fallback: varre mensagens iniciais procurando embed de ticket (método antigo/garantia)
  try {
    const msgs = await channel.messages.fetch({ limit: 5, after: "0" }).catch(() => null);
    if (msgs && msgs.size > 0) {
      // Pega a primeira mensagem do canal
      const firstMsg = msgs.sort((a, b) => a.createdTimestamp - b.createdTimestamp).first();
      if (firstMsg?.embeds?.length) {
        // Procura campo "Aberto por" no embed
        const f = firstMsg.embeds[0].fields?.find(x => x.name.toLowerCase().includes("aberto por"));
        const match = f?.value?.match(/<@!?(\d{17,20})>/);
        if (match) return match[1];
      }
    }
  } catch {}

  return null;
}

async function sendStaffAlerts(guild, channel, openerId, lastMsgUrl, timeWaitText) {
  await guild.members.fetch().catch(() => null); // Garante cache

  const opener = await guild.members.fetch(openerId).catch(() => null);
  const openerName = opener?.user?.tag || "Desconhecido";

  const isInterview = channel.parentId === ENTREVISTA_CATEGORY_ID;
  const alertTitle = isInterview
    ? `🚨 **ATENÇÃO: ENTREVISTA SEM RESPOSTA!** 🚨\n\n`
    : `🚨 **ATENÇÃO: TICKET DE SUPORTE SEM RESPOSTA!** 🚨\n\n`;

  // Mensagem base
  const baseMsg = alertTitle +
    `📍 **Canal:** <#${channel.id}>\n` +
    `👤 **Usuário aguardando:** <@${openerId}> (${openerName})\n` +
    `⏳ **Tempo de espera:** ${timeWaitText}\n` +
    `🔗 **Última mensagem:** ${lastMsgUrl}\n\n`;

  let sentCount = 0;
  const notifiedUserIds = new Set();

  for (const roleId of ALERT_ROLE_IDS) {
    const role = guild.roles.cache.get(roleId);
    if (!role) continue;

    for (const [memberId, member] of role.members) {
      if (member.user.bot) continue;
      if (notifiedUserIds.has(memberId)) continue;

      // Define a instrução final baseada se é superior ou não
      const isSuperior = member.roles.cache.some(r => SUPERIOR_ROLE_IDS.has(r.id));
      
      let instruction = "";
      if (isInterview) {
        // É um ticket de entrevista
        if (isSuperior) {
          instruction = `👉 **Ação:** Verifique a entrevista e use \`!correcao\` se necessário.`;
        } else {
          instruction = `👉 **Ação:** Verifique a entrevista e use \`!correcao\`.\n⚠️ **Se não souber usar o comando ou tiver dúvida, CHAME UM SUPERIOR IMEDIATAMENTE.** Não deixe o membro esperando!`;
        }
      } else {
        // É um ticket de suporte, ideias, etc.
        instruction = `👉 **Ação:** Verifique o ticket e responda o usuário. Não o deixe esperando.`;
      }

      try {
        await member.send(baseMsg + instruction);
        sentCount++;
        notifiedUserIds.add(memberId);
      } catch (e) {
        // DM fechada, ignora
      }
    }
  }
  return sentCount;
}

// =========================
// SCHEDULER PRINCIPAL
// =========================

function startScheduler(client) {
  if (globalThis.__SC_REMINDER_RUNNING__) return;
  globalThis.__SC_REMINDER_RUNNING__ = true;

  setInterval(async () => {
    const now = Date.now();

    for (const guild of client.guilds.cache.values()) {
      for (const channel of guild.channels.cache.values()) {
        // 1. Filtra categoria
        if (!channel.parentId || !ALLOWED_CATEGORY_IDS.has(channel.parentId)) continue;
        if (!channel.isTextBased()) continue;

        // ✅ Evita processar o mesmo canal se o anterior ainda estiver rodando (ex: enviando DMs lentas)
        if (processingChannels.has(channel.id)) continue;
        processingChannels.add(channel.id);

        try {
          // 2. Pega Opener
          const openerId = await resolveOpenerId(channel);
          if (!openerId) continue;

          // 3. Verifica se o Opener é Staff (se for, ignora o ticket)
          const openerMember = await guild.members.fetch(openerId).catch(() => null);
          if (openerMember && memberHasAnyRole(openerMember, IGNORE_IF_OPENER_HAS_ROLES)) {
            continue; 
          }

          // 4. Pega última mensagem
          const messages = await channel.messages.fetch({ limit: 1 }).catch(() => null);
          const lastMsg = messages?.first();
          if (!lastMsg) continue;

          // 5. LÓGICA DO VÁCUO:
          // Alerta se a última mensagem for do:
          // - Próprio Opener (ele falou e ninguém respondeu)
          // - Bot (ex: perguntas da entrevista enviadas e ninguém corrigiu)
          const isOpenerMsg = lastMsg.author.id === openerId;
          const isBotMsg = lastMsg.author.bot;

          if (!isOpenerMsg && !isBotMsg) {
            // Se a última msg foi de um staff (humano diferente do opener), tá tudo bem.
            // Reseta o ping map pra esse canal
            lastPingMap.delete(channel.id);
            lastDebugLogMap.delete(channel.id); // Reseta log de monitoramento também
            channelNotificationLevelMap.delete(channel.id); // ✅ Reseta nível escalonado
            continue;
          }

          // 6. Verifica tempo
          const timeDiff = now - lastMsg.createdTimestamp;
          const timeDiffMinutes = Math.floor(timeDiff / 60000);
          let shouldAlert = false;

          // ✅ Lógica específica para Entrevista (Escalonada)
          if (channel.parentId === ENTREVISTA_CATEGORY_ID) {
             // Para de notificar após 24h (1440 min)
             if (timeDiffMinutes > 1440) continue;

             // Encontra o maior threshold que já foi ultrapassado
             const currentThreshold = ESCALATING_THRESHOLDS.slice().reverse().find(t => timeDiffMinutes >= t);

             if (currentThreshold) {
               const lastLevel = channelNotificationLevelMap.get(channel.id) || 0;
               // Se alcançou um novo patamar maior que o anterior, notifica
               if (currentThreshold > lastLevel) {
                 shouldAlert = true;
                 channelNotificationLevelMap.set(channel.id, currentThreshold);
               }
             }
          } else {
             // ✅ Lógica padrão (15 min e repete a cada 15 min)
             if (timeDiff >= REMINDER_DELAY_MS) {
               const lastPing = lastPingMap.get(channel.id) || 0;
               if (now - lastPing >= REMINDER_DELAY_MS) {
                 shouldAlert = true;
                 lastPingMap.set(channel.id, now);
               }
             }
          }

          if (!shouldAlert) continue;

          // ===========================
          // 🚀 DISPARAR ALERTA
          // ===========================
          
          const timeWaitText = `+${timeDiffMinutes} minutos`;

          // Envia DMs
          const count = await sendStaffAlerts(guild, channel, openerId, lastMsg.url, timeWaitText);

          // Loga no canal de logs
          await logToChannel(client, guild, {
            title: "🚨 ALERTA DE VÁCUO ENVIADO",
            color: "#ff0000",
            description: `O ticket está sem resposta há **${timeDiffMinutes} minutos**.\n\n📨 **Notificações enviadas:** ${count} staffs notificados no PV.\n💬 **Última msg:** ${isBotMsg ? "Bot (Sistema)" : "Usuário (Opener)"}`,
            channelId: channel.id,
            openerId: openerId,
            thumbnail: openerMember?.user?.displayAvatarURL()
          });

        } catch (err) {
          console.error(`[Reminder] Erro ao processar canal ${channel.id}:`, err);
        } finally {
          // Libera o canal para ser verificado no próximo tick (se necessário)
          processingChannels.delete(channel.id);
        }
      }
    }
  }, CHECK_INTERVAL_MS);
}

// =========================
// EXPORTS
// =========================

export async function reminderOnReady(client) {
  startScheduler(client);
  console.log("✅ [REMINDER] Monitor de vácuo (15min) iniciado.");
}

// Hook para detectar mensagens novas e logar "Monitoramento Ativo"
export async function reminderHandleMessageCreate(message, client) {
  try {
    if (!message.guild) return false;
    
    const channel = message.channel;
    // Verifica se está na categoria correta
    if (!isAllowedCategory(channel)) return false;

    // Tenta resolver o ID de quem abriu
    const openerId = await resolveOpenerId(channel);
    
    if (!openerId) {
      // console.log(`[Reminder] Ignorando msg em ${channel.name}: não achei openerId.`);
      return false;
    }

    // Se quem falou foi STAFF (que não é o opener), cancela monitoramento visualmente
    const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
    if (!message.author.bot && isStopResponder(member) && message.author.id !== openerId) {
      lastDebugLogMap.delete(channel.id);
      channelNotificationLevelMap.delete(channel.id); // ✅ Reseta nível escalonado
      return false;
    }

    // Se quem falou foi o OPENER ou BOT, inicia/mantém monitoramento
    if (message.author.id === openerId || message.author.bot) {
      const now = Date.now();
      const lastLog = lastDebugLogMap.get(channel.id) || 0;
      
      // Só loga se passou 10 min desde o último aviso "Monitoramento Ativo" pra não floodar
      if (now - lastLog > 10 * 60 * 1000) {
        const openerMember = await message.guild.members.fetch(openerId).catch(() => null);
        const alertTime = Math.floor((now + REMINDER_DELAY_MS) / 1000);

        // Usa message.client para garantir que temos o cliente
        await logToChannel(message.client, message.guild, {
          title: "⏳ Monitoramento de Vácuo Ativo",
          color: "#FEE75C", // Amarelo
          description: `Ticket aguardando resposta.\n\n⏰ **Alerta programado para:** <t:${alertTime}:R>\n💬 **Última msg:** ${message.author.bot ? "Bot (Sistema)" : "Usuário (Opener)"}\n\n*Se ninguém responder em 15min, a equipe será notificada.*`,
          channelId: channel.id,
          openerId: openerId,
          thumbnail: openerMember?.user?.displayAvatarURL()
        });

        lastDebugLogMap.set(channel.id, now);
      } else {
        // console.log(`[Reminder] Log visual debounced para ${channel.name} (esperando 10m)`);
      }
    }

    return false;
  } catch (e) {
    console.error("[Reminder] Erro no handleMessage:", e);
    return false;
  }
}

export function reminderHandleChannelDelete(channel) {
  lastPingMap.delete(channel.id);
  lastDebugLogMap.delete(channel.id);
  channelNotificationLevelMap.delete(channel.id); // ✅ Limpa cache
  return false;
}

export function reminderHandleChannelUpdate(oldChannel, newChannel) {
  return false;
}
