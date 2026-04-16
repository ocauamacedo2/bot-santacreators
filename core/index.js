// core/index.js — SantaCreators Bot Core (Refatorado v4.0)
import dotenv from "dotenv";
dotenv.config({ override: true });

import fs from "node:fs";
import path from "node:path";
import cron from "node-cron";
import mongoose from "mongoose";
import express from "express";
import { EventEmitter } from "node:events";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import {
  ActivityType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder,
  Events,
} from "discord.js";

// Importa o Client configurado
import { client } from "./client.js";

// =====================================================
// ESM compat
// =====================================================
const require = createRequire(import.meta.url);
globalThis.require ??= require;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =====================================================
// Inicialização de Guardas e Flags Globais
// =====================================================
client.__handlersWired = client.__handlersWired ?? false;
client.__coreBootState = client.__coreBootState ?? { readyBootExecuted: false };
client.__loggedIn = client.__loggedIn ?? false;
globalThis.__SC_CORE_GUARDS__ = globalThis.__SC_CORE_GUARDS__ ?? {
  setarNomeIntervalStarted: false,
};

// =====================================================
// Proteções globais
// =====================================================
process.on("unhandledRejection", (e) => console.error("[unhandledRejection]", e));
process.on("uncaughtException", (e) => console.error("[uncaughtException]", e));

// =====================================================
// Limpeza de arquivos temporários no Boot
// =====================================================
try {
  const dataPath = path.resolve("data");
  if (fs.existsSync(dataPath)) {
    const files = fs.readdirSync(dataPath);
    for (const f of files) {
      if (f.endsWith(".tmp")) {
        try { fs.unlinkSync(path.join(dataPath, f)); } catch {}
        console.log(`[BOOT] Arquivo temporário removido: ${f}`);
      }
    }
  }
} catch (e) {
  console.error("[BOOT] Erro ao limpar .tmp:", e);
}

// =====================================================
// Token Check
// =====================================================
const BOT_TOKEN = (process.env.DISCORD_TOKEN?.trim() || process.env.TOKEN?.trim() || "").replace(/\s+/g, "");
if (!BOT_TOKEN || BOT_TOKEN.split(".").length !== 3) {
  console.error("❌ DISCORD_TOKEN/TOKEN ausente ou inválido.");
  process.exit(1);
}
globalThis.token = BOT_TOKEN;

// =====================================================
// IMPORTS DE EVENTOS E HANDLERS
// =====================================================

// Logs e Auditoria
import messageDeleteLog from "../events/logs/messageDelete.js";
import messageDeleteBulkLog from "../events/logs/messageDeleteBulk.js";
import messageUpdateLog from "../events/logs/messageUpdate.js";
import channelCreateLog from "../events/logs/channelCreate.js";
import channelDeleteLog from "../events/logs/channelDelete.js";
import channelDeleteProtectLog from "../events/logs/channelDeleteProtect.js";
import * as memberJoinLog from "../events/logs/memberJoinLog.js";
import { cacheMessage } from "../events/logs/_deleteCache.js";

// Handlers Centrais
import messageCreateHandler from "../events/messageCreate.js";
import interactionCreateHandler from "../events/interactionCreate.js";

// Sistemas e Integrações
import entrevista from "../utils/entrevista.js";
import bemvindoHandler from "../commands/admin/start/bemvindo.js";
import saidaHandler from "../commands/admin/start/saida.js";
import { handleCorrecao } from "../commands/admin/correcao.js";
import createEntrevistasTickets from "../commands/entrevistasTickets.js";
import { registerApagarPV } from "../commands/admin/apagarpv.js";
import { iniciarRegistroPoderes } from "../events/registropoderes.js";
import { registroPoderesEventosOnReady } from "../events/registroPoderesEventos.js";
import { iniciarRegistroEvento } from "../events/registroevento.js";
import { iniciarAutoJoin } from "../events/autojoinVoice.js";
import { installBotGuardian } from "../events/botGuardian.js";
import { autoRoleOnJoin } from "../events/autoRoleOnJoin.js";
import { rolePermissionGuardHandleRoleUpdate } from "../events/rolePermissionGuard.js";
import * as geralDash from "../events/scGeralDash.js";

// Módulos de Comando/Interação
import { handlePagamentoSocial, pagamentoSocialOnReady } from "../events/pagamentosocial.js";
import { formsCreatorHandleMessage, formsCreatorHandleInteraction, formsCreatorOnReady } from "../events/formscreator.js";
import { alinhamentosHandleMessage, alinhamentosHandleInteraction, alinhamentosOnReady } from "../events/alinhamentos.js";
import { sortChannelsHandleMessage, sortChannelsHandleInteraction, setupSortChannels } from "../commands/canais/sortChannels.js";
import { setupTicketRenamer } from "../commands/canais/ticketRenamer.js";
import { pedirSetHandleMessage, pedirSetHandleInteraction, pedirSetOnReady } from "../events/pedirset.js";
import { connectStatusHandleMessage, connectStatusOnChannelDelete, connectStatusOnReady } from "../events/connectStatus.js";
import { orgsHandleMessage, orgsHandleInteraction } from "../events/analisarOrgsPorDia.js";
import { ausenciasHandleMessage, ausenciasHandleInteraction, ausenciasOnReady } from "../events/ausencias.js";
import { focoSemanaisOnReady } from "../events/focoSemanais.js";
import { provasAdvOnReady } from "../events/provasAdv.js";
import { vipEventoHandleInteraction, vipEventoHandleMessage, vipEventoOnReady } from "../events/vipEvento.js";
import { vipRegistroHandleInteraction, vipRegistroHandleMessage, vipRegistroOnReady } from "../events/vipRegistro.js";
import { lideresConvitesHandleInteraction, lideresConvitesOnReady } from "../events/lideresConvites.js";
import { doacaoHandleMessage, doacaoHandleInteraction, doacaoOnReady } from "../events/doacao.js";
import { evt3EventsHandleMessage, evt3EventsHandleInteraction, evt3EventsOnReady } from "../events/evt3EventsCreator.js";
import { blacklistFacsOnReady } from "../events/blacklistFacs.js";
import { blacklistEventosHandleInteraction, blacklistEventosOnReady } from "../events/blacklistEventos.js";
import { hallDaFamaHandleInteraction, hallDaFamaOnReady } from "../events/hallDaFama.js";
import { eventosDiariosHandleInteraction, eventosDiariosOnReady } from "../events/eventosDiarios.js";
import { roleProtectHandleMessage, roleProtectHandleGuildMemberUpdate, roleProtectOnReady } from "../events/roleProtect.js";
import { setStaffV2HandleMessage, setStaffV2HandleInteraction, setStaffV2OnReady } from "../events/setStaffV2.js";
import { registroManagerHandleInteraction, registroManagerHandleMessage, registroManagerOnReady, registroManagerHandleMessageDelete, registroManagerHandleMessageBulkDelete, registroManagerHandleMessageUpdate } from "../events/registroManager.js";
import { facsSemanaisHandleMessage, facsSemanaisHandleInteraction, facsSemanaisOnReady } from "../events/facsSemanais.js";
import { facsComparativoHandleInteraction, facsComparativoHandleMessage, facsComparativoOnReady } from "../events/facsComparativo.js";
import { confirmacaoPresencaHandleInteraction, confirmacaoPresencaOnReady } from "../events/confirmacaoPresenca.js";
import { geralWeeklyRankHandleMessage, handleWeeklyRankInteractions, geralWeeklyRankOnReady } from "../events/scGeralWeeklyRanking.js";
import { graficoManagersHandleInteraction, graficoManagersOnReady } from "../events/GraficoManagers.js";
import { recrutamentoDashHandleInteraction, recrutamentoDashHandleMessage, recrutamentoDashOnReady } from "../events/recrutamentoDash.js";
import { monitorCargosHandleMessage, monitorCargosHandleUpdate, monitorCargosOnReady } from "../events/monitorCargos.js";
import { cadastroManualHandleInteraction, cadastroManualOnReady } from "../events/cadastroManual.js";
import { aulaoHandleMessage, aulaoHandleInteraction } from "../events/aulaoSantaCreators.js";
import { cronogramaCreatorsHandleMessage, cronogramaCreatorsHandleInteraction, cronogramaCreatorsOnReady } from "../events/cronogramaCreators.js";
import { registroVendasHandleMessage, registroVendasHandleInteraction, registroVendasOnReady } from "../events/registroVendas.js";
import { autoReactsFotosHandleMessage, autoReactsFotosOnReady } from "../events/autoReactsFotos.js";
import { hierarquiaHandleInteraction, hierarquiaHandleMessage, hierarquiaHandleGuildMemberUpdate, hierarquiaOnReady } from "../events/hierarquiaDivisoes.js";
import { reuniaoSemanalHandleMessage, reuniaoSemanalHandleInteraction, reuniaoSemanalOnReady } from "../events/reuniaoSemanal.js";
import { checklistHandleInteraction, checklistHandleMessage, checklistOnReady } from "../events/logChecklistSemanal.js";
import { dashRouterHandleMessage, dashRouterOnReady } from "../events/dashRouter.js";
import { payEvtDashHandleInteraction, payEvtDashHandleMessage, payEvtDashOnReady } from "../events/payEvtDash/index.js";
import { reminderHandleMessageCreate, reminderHandleChannelDelete, reminderHandleChannelUpdate, reminderOnReady } from "../events/reminderManager.js";

// Setup Utils
import { setupUserUpdateLog } from "../events/logs/userUpdate.js";
import { setupBanLog } from "../events/logs/ban.js";
import { setupKickLog } from "../events/logs/kick.js";
import { setupRoleUpdateLog } from "../events/logs/roleUpdate.js";
import { setupVoiceLog } from "../events/logs/voice.js";
import { setupChannelCategoryMoveLog } from "../events/logs/channelCategoryMove.js";
import { setupBotRemoveLog } from "../events/logs/botRemove.js";
import { setupBotAddLog } from "../events/logs/botAdd.js";
import { setupNicknameChangeLog } from "../events/logs/nicknameChange.js";
import { setupChannelLog } from "../events/logs/channel.js";
import { setupChannelNameCategoryUpdateLog } from "../events/logs/channelNameCategoryUpdate.js";
import { setupSyncCargos } from "../events/syncCargos.js";
import { startTodosLembretes } from "../events/lembretes/index.js";
import { startRolesOnlineMonitor } from "../events/rolesOnlineMonitor.js";
import setupBatePonto from "../events/batePonto.js";
import setupAlinhamentoDash from "../Dashboard/alinhamentoDash.js";
import { dashDebugOnReady } from "../events/dashDebug.js";
import { getChannel } from "../utils/cacheDiscord.js";
import { wrapRL } from "../utils/rl.js";

// =====================================================
// Express + Mongo + Transcript
// =====================================================
EventEmitter.defaultMaxListeners = 30;
const app = express();
const safeSend = wrapRL((ch, payload) => ch.send(payload));

const transcriptSchema = new mongoose.Schema({
  canalId: String, abertoPor: String, assumidoPor: String,
  mensagens: [{ autor: String, idAutor: String, conteudo: String, horario: Date, avatar: String }]
});
const Transcript = mongoose.model("Transcript", transcriptSchema, "transcripts");
const entrevistasTickets = createEntrevistasTickets({ client, Transcript });

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ Conectado ao MongoDB Atlas!"))
  .catch((err) => { console.error("❌ Erro MongoDB:", err); process.exit(1); });

app.get("/transcript/:canalId", async (req, res) => {
  const transcript = await Transcript.findOne({ canalId: req.params.canalId });
  if (!transcript) return res.send("<h2>Transcript não encontrado.</h2>");
  res.json(transcript.mensagens);
});
app.listen(3000);

// =====================================================
// Registros Locais
// =====================================================
let registros = [];
const loadRegistros = () => {
  const filePath = path.join(__dirname, "../events", "registros.json");
  try {
    if (!fs.existsSync(filePath)) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, "[]", "utf8");
    }
    registros = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    console.error("Erro ao carregar registros:", error);
  }
};

// =====================================================
// ROTEAMENTO DE EVENTOS (SHORT-CIRCUIT)
// =====================================================

const setupEventHandlers = () => {
  if (client.__handlersWired) return;
  client.__handlersWired = true;

  // Sincronização e Utilitários de Canal
  setupSyncCargos(client);
  setupSortChannels(client);
  setupTicketRenamer(client);
  registerApagarPV(client);

  // --- CANAIS ---
  client.on("channelCreate", c => channelCreateLog.execute(c).catch(() => {}));
  client.on("channelDelete", c => {
    channelDeleteLog.execute(c).catch(() => {});
    channelDeleteProtectLog.execute(c, client).catch(() => {});
    reminderHandleChannelDelete(c);
    connectStatusOnChannelDelete(c);
  });
  client.on(Events.ChannelUpdate, (o, n) => reminderHandleChannelUpdate(o, n, client));

  // --- MENSAGENS ---
  client.on("messageCreate", async (message) => {
  try {
    const isBotAuthor = !!message.author?.bot;
    const isWebhook = !!message.webhookId;

    // bloqueio apenas para mensagens de bot que realmente não interessam
    if (isBotAuthor && !isWebhook) {
      const hasComponents = Array.isArray(message.components) && message.components.length > 0;
      const hasEmbeds = Array.isArray(message.embeds) && message.embeds.length > 0;

      if (!hasComponents && !hasEmbeds) {
        return;
      }
    }

      // 1. Primário
      try {
        autoReactsFotosHandleMessage(message, client).catch(() => {});
      } catch (e) {}

      try {
        cacheMessage(message);
      } catch (e) {}

      try {
        reminderHandleMessageCreate(message, client).catch(() => {});
      } catch (e) {}

      // 2. Roteamento direto restaurado
      if (await sortChannelsHandleMessage(message, client)) return;
      if (await payEvtDashHandleMessage(message, client)) return;
      if (await facsComparativoHandleMessage(message, client)) return;
      if (await dashRouterHandleMessage(message)) return;
      if (await facsSemanaisHandleMessage(message, client)) return;
      if (await evt3EventsHandleMessage(message, client)) return;
      if (await recrutamentoDashHandleMessage(message, client)) return;
      if (await monitorCargosHandleMessage(message, client)) return;
      if (await registroManagerHandleMessage(message, client)) return;
      if (await registroVendasHandleMessage(message, client)) return;
      if (await aulaoHandleMessage(message, client)) return;
      if (await cronogramaCreatorsHandleMessage(message, client)) return;
      if (await ausenciasHandleMessage(message, client)) return;
      if (await hierarquiaHandleMessage(message, client)) return;
      if (await reuniaoSemanalHandleMessage(message, client)) return;
      if (await roleProtectHandleMessage(message, client)) return;
      if (await connectStatusHandleMessage(message, client)) return;
      if (await orgsHandleMessage(message, client)) return;
      if (await checklistHandleMessage(message, client)) return;

      try {
        if (
          typeof geralDash?.geralDashHandleMessage === "function" &&
          (await geralDash.geralDashHandleMessage(message, client))
        ) {
          return;
        }
      } catch (e) {}

      try {
        if (await geralWeeklyRankHandleMessage(message, client)) return;
      } catch (e) {}

      if (await handleCorrecao(message, client)) return;
      if (await pedirSetHandleMessage(message, client)) return;
      if (await alinhamentosHandleMessage(message, client)) return;

      try {
        await formsCreatorHandleMessage(message, client);
      } catch (e) {}

      if (await setStaffV2HandleMessage(message, client)) return;
      if (await doacaoHandleMessage(message, client)) return;
      if (await vipEventoHandleMessage(message, client)) return;
      if (await vipRegistroHandleMessage(message, client)) return;

      // 3. Fallback final
      await entrevistasTickets.onMessageCreate(message);
      await messageCreateHandler.execute(message, [], client);
    } catch (error) {
      console.error("Erro messageCreate:", error);
    }
  });

  client.on("messageUpdate", (o, n) => {
    messageUpdateLog.execute(o, n, client).catch(() => {});
    registroManagerHandleMessageUpdate(o, n, client).catch(() => {});
  });

  client.on("messageDelete", m => {
    messageDeleteLog.execute(m, client).catch(() => {});
    registroManagerHandleMessageDelete(m, client).catch(() => {});
  });

  client.on("messageDeleteBulk", ms => {
    messageDeleteBulkLog.execute(ms, client).catch(() => {});
    registroManagerHandleMessageBulkDelete(ms, ms.first()?.channel, client).catch(() => {});
  });

  // --- MEMBROS ---
  client.on("guildMemberAdd", async (m) => {
    autoRoleOnJoin(m).catch(() => {});
    bemvindoHandler.execute(m).catch(() => {});
    memberJoinLog.execute(m, client).catch(() => {});
    // O setStaffV2 não tem mais handleGuildMemberAdd aparente, 
    // mantendo o setStaff antigo se necessário:
    // await setStaffHandleGuildMemberAdd(m, client); 
  });

  client.on("guildMemberRemove", m => saidaHandler.execute(m).catch(() => {}));

  client.on("guildMemberUpdate", (o, n) => {
    roleProtectHandleGuildMemberUpdate(o, n, client).catch(() => {});
    monitorCargosHandleUpdate(o, n, client).catch(() => {});
    hierarquiaHandleGuildMemberUpdate(o, n, client).catch(() => {});
  });

  client.on("roleUpdate", (oldRole, newRole) => {
    rolePermissionGuardHandleRoleUpdate(oldRole, newRole, client).catch(() => {});
  });

  // --- INTERAÇÕES ---
  client.on("interactionCreate", async (interaction) => {
  if (interaction.isAutocomplete()) return;

  try {
    const customId = interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()
  ? String(interaction.customId || "")
  : "";

if (customId) {
  console.log(`[CORE][INTERACTION] type=${interaction.type} customId=${customId}`);
}

    // =====================================================
    // ROTEAMENTO PRIORITÁRIO PARA BOTÕES/MODAIS MAIS SENSÍVEIS A DELAY
    // =====================================================
    try {
      // Entrevista / tickets de entrevista
      if (
        customId.startsWith("entrevista") ||
        customId.startsWith("perguntas") ||
        customId.startsWith("resposta_") ||
        customId.startsWith("entrevista_")
      ) {
        if (await entrevista.handleButtons(interaction).catch(() => false)) return;
        if (await entrevistasTickets.onInteractionCreate(interaction).catch(() => false)) return;
      }

      // VIP Evento / VIP Registro
      if (
        customId.startsWith("vip_") ||
        customId.startsWith("vipregistro_") ||
        customId.startsWith("vipregistro:") ||
        customId.startsWith("vipevento_") ||
        customId.startsWith("vipevento:")
      ) {
        if (await vipEventoHandleInteraction(interaction, client)) return;
        if (await vipRegistroHandleInteraction(interaction, client)) return;
      }

      // Forms Creator
      if (
        customId.startsWith("forms") ||
        customId.startsWith("form_") ||
        customId.startsWith("fc_")
      ) {
        if (await formsCreatorHandleInteraction(interaction, client)) return;
      }

      // Pedir Set
      if (
        customId.startsWith("pedirset") ||
        customId.startsWith("set_") ||
        customId.startsWith("ps_")
      ) {
        if (await pedirSetHandleInteraction(interaction, client)) return;
      }

      // Registro Manager
      if (
        customId.startsWith("rm_") ||
        customId.startsWith("registromanager") ||
        customId.startsWith("manager_")
      ) {
        if (await registroManagerHandleInteraction(interaction, client)) return;
      }

      // Weekly Rank
      if (
        customId.startsWith("weeklyrank") ||
        customId.startsWith("rank_") ||
        customId.startsWith("sc_rank_")
      ) {
        if (await handleWeeklyRankInteractions(interaction, client)) return;
      }

      // Pagamento Social
      if (
        customId.startsWith("pagamentosocial") ||
        customId.startsWith("psocial_") ||
        customId.startsWith("pagamento_")
      ) {
        if (await handlePagamentoSocial(interaction, client).catch(() => false)) return;
      }
    } catch (e) {
      console.error("[CORE] erro no roteamento prioritário:", e);
    }

    // =====================================================
    // FALLBACK COMPLETO ORIGINAL
    // =====================================================
    if (await registroManagerHandleInteraction(interaction, client)) return;
    if (await handleWeeklyRankInteractions(interaction, client)) return;
    if (await registroVendasHandleInteraction(interaction, client)) return;
    if (await facsComparativoHandleInteraction(interaction, client)) return;
    if (await facsSemanaisHandleInteraction(interaction, client)) return;
    if (await confirmacaoPresencaHandleInteraction(interaction, client)) return;
    if (await evt3EventsHandleInteraction(interaction, client)) return;
    if (await payEvtDashHandleInteraction(interaction, client)) return;

    if (await orgsHandleInteraction(interaction, client)) return;
    if (await doacaoHandleInteraction(interaction, client)) return;
    if (await formsCreatorHandleInteraction(interaction, client)) return;
    if (await ausenciasHandleInteraction(interaction, client)) return;
    if (await vipEventoHandleInteraction(interaction, client)) return;
    if (await vipRegistroHandleInteraction(interaction, client)) return;
    if (await lideresConvitesHandleInteraction(interaction, client)) return;
    if (await pedirSetHandleInteraction(interaction, client)) return;
    if (await alinhamentosHandleInteraction(interaction, client)) return;
    if (await setStaffV2HandleInteraction(interaction, client)) return;
    if (await graficoManagersHandleInteraction(interaction, client)) return;
    if (await recrutamentoDashHandleInteraction(interaction, client)) return;
    if (await blacklistEventosHandleInteraction(interaction, client)) return;
    if (await hallDaFamaHandleInteraction(interaction, client)) return;
    if (await eventosDiariosHandleInteraction(interaction, client)) return;
    if (await sortChannelsHandleInteraction(interaction, client)) return;
    if (await reuniaoSemanalHandleInteraction(interaction, client)) return;

    try {
      if (
        typeof geralDash?.geralDashHandleInteraction === "function" &&
        (await geralDash.geralDashHandleInteraction(interaction, client))
      ) {
        return;
      }
    } catch (e) {}

    if (await cadastroManualHandleInteraction(interaction, client)) return;
    if (await aulaoHandleInteraction(interaction, client)) return;
    if (await cronogramaCreatorsHandleInteraction(interaction, client)) return;
    if (await hierarquiaHandleInteraction(interaction, client)) return;
    if (await checklistHandleInteraction(interaction, client)) return;

    if (await handlePagamentoSocial(interaction, client).catch(() => false)) return;

    try {
      if (await entrevista.handleButtons(interaction).catch(() => false)) return;
    } catch (e) {}

    try {
      if (await entrevistasTickets.onInteractionCreate(interaction).catch(() => false)) return;
    } catch (e) {}

    await interactionCreateHandler.execute(interaction);
  } catch (error) {
    console.error("Erro interactionCreate:", error);
  }
});

  // Invites
  client.on("inviteCreate", i => memberJoinLog.handleInviteCreate(i));
  client.on("inviteDelete", i => memberJoinLog.handleInviteDelete(i));

  // Logs Estáticos Setup
  setupUserUpdateLog(client);
  setupBanLog(client);
  setupKickLog(client);
  setupRoleUpdateLog(client);
  setupVoiceLog(client);
  setupChannelLog(client);
  setupBotAddLog(client);
  setupBotRemoveLog(client);
  setupChannelNameCategoryUpdateLog(client);
  setupChannelCategoryMoveLog(client);
  setupNicknameChangeLog(client);
};

// =====================================================
// READY (INICIALIZAÇÃO ÚNICA E SEGURA)
// =====================================================

client.once("ready", async () => {
  if (client.__coreBootState.readyBootExecuted) return;
  client.__coreBootState.readyBootExecuted = true;

  console.log(`\n🚀 [SANTACREATORS] Iniciando Boot Sequencial como ${client.user.tag}`);

  // 1. Sistemas de Infraestrutura Crítica
  try { await entrevista.reanexar(client); } catch (e) { console.error("Erro Reanexar Entrevistas:", e); }
  try { iniciarAutoJoin(client); } catch (e) { console.error("Erro AutoJoin:", e); }
  try { installBotGuardian(client); } catch (e) { console.error("Erro BotGuardian:", e); }
  try { setupBatePonto(client); } catch (e) { console.error("Erro BatePonto:", e); }
  try { setupAlinhamentoDash(client); } catch (e) { console.error("Erro AlinhamentoDash:", e); }
  try { await import("../events/gestaoinfluencer.js"); } catch (e) { console.error("Erro GI:", e); }

  // 2. Inicialização de Módulos (Sync/Check)
 const criticalModules = [
  { name: "Reminder", fn: () => reminderOnReady(client) },
  { name: "Entrevistas Tickets", fn: () => entrevistasTickets.onReady() },
  { name: "Poderes", fn: () => iniciarRegistroPoderes(client) },
  { name: "Poderes (Eventos)", fn: () => registroPoderesEventosOnReady(client) },
  { name: "Eventos", fn: () => iniciarRegistroEvento(client) },
  { name: "Pagamento Social", fn: () => pagamentoSocialOnReady(client) },
  { name: "Reg. Manager", fn: () => registroManagerOnReady(client) },
  { name: "FormsCreator", fn: () => formsCreatorOnReady(client) },
  { name: "PedirSet", fn: () => pedirSetOnReady(client) },
  { name: "Alinhamentos", fn: () => alinhamentosOnReady(client) },
  { name: "VIP Evento", fn: () => vipEventoOnReady(client) },
  { name: "VIP Registro", fn: () => vipRegistroOnReady(client) },
  { name: "GeralDash", fn: () => geralDash.geralDashOnReady(client) },
  { name: "WeeklyRank", fn: () => geralWeeklyRankOnReady(client) }
];

const secondaryModules = [
  { name: "Foco Semanal", fn: () => focoSemanaisOnReady(client) },
  { name: "Provas ADV", fn: () => provasAdvOnReady(client) },
  { name: "FACs Semanais", fn: () => facsSemanaisOnReady(client) },
  { name: "FACs Comparativo", fn: () => facsComparativoOnReady(client) },
  { name: "Presença", fn: () => confirmacaoPresencaOnReady(client) },
  { name: "Dash Managers", fn: () => graficoManagersOnReady(client) },
  { name: "Vendas", fn: () => registroVendasOnReady(client) },
  { name: "EVT3", fn: () => evt3EventsOnReady(client) },
  { name: "PayEvtDash", fn: () => payEvtDashOnReady(client) },
  { name: "RoleProtect", fn: () => roleProtectOnReady(client) },
  { name: "Doação", fn: () => doacaoOnReady(client) },
  { name: "Connect Status", fn: () => connectStatusOnReady(client) },
  { name: "Convites Lider", fn: () => lideresConvitesOnReady(client) },
  { name: "SetStaff V2", fn: () => setStaffV2OnReady(client) },
  { name: "Blacklist FACS", fn: () => blacklistFacsOnReady(client) },
  { name: "Blacklist", fn: () => blacklistEventosOnReady(client) },
  { name: "Hall da Fama", fn: () => hallDaFamaOnReady(client) },
  { name: "Eventos Diarios", fn: () => eventosDiariosOnReady(client) },
  { name: "Cadastro Manual", fn: () => cadastroManualOnReady(client) },
  { name: "Recrutamento Dash", fn: () => recrutamentoDashOnReady(client) },
  { name: "Monitor Cargos", fn: () => monitorCargosOnReady(client) },
  { name: "Cronograma", fn: () => cronogramaCreatorsOnReady(client) },
  { name: "Ausências", fn: () => ausenciasOnReady(client) },
  { name: "Hierarquia", fn: () => hierarquiaOnReady(client) },
  { name: "Reunião Semanal", fn: () => reuniaoSemanalOnReady(client) },
  { name: "Log Checklist", fn: () => checklistOnReady(client) }
];

for (const mod of criticalModules) {
  try {
    await mod.fn();
    console.log(`[BOOT] ✅ ${mod.name} carregado.`);
  } catch (e) {
    console.error(`[BOOT] ❌ Erro ao carregar ${mod.name}:`, e.message);
  }
}

setImmediate(async () => {
  for (const mod of secondaryModules) {
    try {
      await mod.fn();
      console.log(`[BOOT][BG] ✅ ${mod.name} carregado.`);
    } catch (e) {
      console.error(`[BOOT][BG] ❌ Erro ao carregar ${mod.name}:`, e.message);
    }
  }

  try { dashDebugOnReady(client); } catch (e) {}
  try { autoReactsFotosOnReady(client).catch(() => {}); } catch (e) {}
  try { memberJoinLog.initInviteCache(client); } catch (e) {}
  try { startTodosLembretes(client); } catch (e) {}
  try { startRolesOnlineMonitor(client); } catch (e) {}
});

client.user.setActivity("Cauã Macedo – SantaCreators ✨", { type: ActivityType.Watching });
console.log(`\n✅ SISTEMA ONLINE E ESTÁVEL!\n`);
});

// =====================================================
// INIT
// =====================================================
export const initBot = async () => {
  try {
    loadRegistros();
    setupEventHandlers();

    if (!client.__loggedIn) {
      client.__loggedIn = true;
      await client.login(BOT_TOKEN).catch((e) => {
        console.error("Erro Login:", e);
        process.exit(1);
      });
    }

    // Registro de Slash Commands Globais
    try {
      const slashData = [
        new SlashCommandBuilder()
          .setName("disconnect")
          .setDescription("Expulsa um usuário da call de voz")
          .addUserOption(opt => opt.setName("user").setDescription("Usuário alvo").setRequired(true))
          .toJSON(),
      ];
      await client.application.commands.set(slashData);
    } catch (e) {}

    // Intervalo de Manutenção de Identificação (Setar Nome)
    if (!globalThis.__SC_CORE_GUARDS__.setarNomeIntervalStarted) {
      globalThis.__SC_CORE_GUARDS__.setarNomeIntervalStarted = true;
      const CANAL_BOTAO = "1383152873587740843";
      const GIF_BANNER = "https://media.discordapp.net/attachments/1362477839944777889/1384245215249825832/standard_2rss.gif";

      setInterval(async () => {
        if (!client.isReady()) return;
        const canal = await getChannel(client, CANAL_BOTAO).catch(() => null);
        if (!canal || !canal.isTextBased()) return;

        const msgs = await canal.messages.fetch({ limit: 10 }).catch(() => null);
        if (!msgs) return;

        const btnMsgs = msgs.filter(m => m.author.id === client.user.id && m.components?.[0]?.components?.some(c => c.customId === "setar_nome"));

        if (btnMsgs.size > 1) {
          [...btnMsgs.values()].slice(1).forEach(m => m.delete().catch(() => {}));
        }

        if (btnMsgs.size === 0) {
          const embed = new EmbedBuilder().setTitle("📌 | Identifique-se - SantaCreators").setDescription("Clique no botão abaixo para enviar seu **nome**.").setColor("#ff009a").setImage(GIF_BANNER);
          const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("setar_nome").setLabel("✍️ Enviar meu nome").setStyle(ButtonStyle.Primary));
          await safeSend(canal, { embeds: [embed], components: [row] });
        }
      }, 15 * 60 * 1000);
    }
  } catch (error) {
    console.error("Erro fatal initBot:", error);
  }
};
