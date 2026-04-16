// core/index.js — SantaCreators Bot Core
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
// Proteções globais
// =====================================================
process.on("unhandledRejection", (e) => console.error("[unhandledRejection]", e));
process.on("uncaughtException", (e) => console.error("[uncaughtException]", e));

// =====================================================
// Helpers básicos & Limpeza
// =====================================================
function mask(t) {
  const s = (t ?? "").toString().trim();
  return {
    parts: s ? s.split(".").length : 0,
    len: s.length,
    sample: s ? `${s.slice(0, 6)}...${s.slice(-6)}` : "(vazio)",
  };
}

try {
  const dataPath = path.resolve("data");
  if (fs.existsSync(dataPath)) {
    const files = fs.readdirSync(dataPath);
    for (const f of files) {
      if (f.endsWith(".tmp")) {
        try {
          fs.unlinkSync(path.join(dataPath, f));
        } catch {}
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
// IMPORTS
// =====================================================

// Logs
import messageDeleteLog from "../events/logs/messageDelete.js";
import messageDeleteBulkLog from "../events/logs/messageDeleteBulk.js";
import messageUpdateLog from "../events/logs/messageUpdate.js";
import channelCreateLog from "../events/logs/channelCreate.js";
import channelDeleteLog from "../events/logs/channelDelete.js";
import channelDeleteProtectLog from "../events/logs/channelDeleteProtect.js";

// Handlers Gerais
import messageCreateHandler from "../events/messageCreate.js";
import interactionCreateHandler from "../events/interactionCreate.js";

// Comandos / Fluxos
import entrevista from "../utils/entrevista.js";
import bemvindoHandler from "../commands/admin/start/bemvindo.js";
import saidaHandler from "../commands/admin/start/saida.js";
import { handleCorrecao } from "../commands/admin/correcao.js";
import createEntrevistasTickets from "../commands/entrevistasTickets.js";

// Utils
import { wrapRL } from "../utils/rl.js";
import { getChannel } from "../utils/cacheDiscord.js";

// Sistemas
import { iniciarRegistroPoderes } from "../events/registropoderes.js";
import { iniciarRegistroEvento } from "../events/registroevento.js";
import { iniciarAutoJoin } from "../events/autojoinVoice.js";

// Logs Setup
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
import { cacheMessage } from "../events/logs/_deleteCache.js";
import {
  reminderOnReady,
  reminderHandleMessageCreate,
  reminderHandleChannelDelete,
  reminderHandleChannelUpdate,
} from "../events/reminderManager.js";

// Pagamento Social
import { pagamentoSocialOnReady, handlePagamentoSocial } from "../events/pagamentosocial.js";

// FormsCreator
import {
  formsCreatorOnReady,
  formsCreatorHandleMessage,
  formsCreatorHandleInteraction,
} from "../events/formscreator.js";

// Dashboards / Managers
import setupBatePonto from "../events/batePonto.js";
import setupAlinhamentoDash from "../Dashboard/alinhamentoDash.js";

// Alinhamentos
import {
  alinhamentosOnReady,
  alinhamentosHandleMessage,
  alinhamentosHandleInteraction,
} from "../events/alinhamentos.js";

// Sort / Renamer
import {
  setupSortChannels,
  sortChannelsHandleMessage,
  sortChannelsHandleInteraction,
} from "../commands/canais/sortChannels.js";
import { setupTicketRenamer } from "../commands/canais/ticketRenamer.js";

// PedirSet
import {
  pedirSetOnReady,
  pedirSetHandleMessage,
  pedirSetHandleInteraction,
} from "../events/pedirset.js";

// Lembretes
import { startTodosLembretes } from "../events/lembretes/index.js";

// Monitor online
import { startRolesOnlineMonitor } from "../events/rolesOnlineMonitor.js";

// Connect Status
import {
  connectStatusOnReady,
  connectStatusHandleMessage,
  connectStatusOnChannelDelete,
} from "../events/connectStatus.js";

// Orgs por dia
import {
  orgsHandleMessage,
  orgsHandleInteraction,
} from "../events/analisarOrgsPorDia.js";

// Ausências
import {
  ausenciasOnReady,
  ausenciasHandleMessage,
  ausenciasHandleInteraction,
} from "../events/ausencias.js";

// VIP Evento / Líderes Convites
import {
  vipEventoOnReady,
  vipEventoHandleInteraction,
  vipEventoHandleMessage,
} from "../events/vipEvento.js";
import {
  vipRegistroOnReady,
  vipRegistroHandleInteraction,
  vipRegistroHandleMessage,
} from "../events/vipRegistro.js";
import {
  lideresConvitesOnReady,
  lideresConvitesHandleInteraction,
} from "../events/lideresConvites.js";

// Doação
import {
  doacaoOnReady,
  doacaoHandleMessage,
  doacaoHandleInteraction,
} from "../events/doacao.js";

// Dash debug + router
import { dashDebugOnReady } from "../events/dashDebug.js";
import {
  dashRouterOnReady,
  dashRouterHandleMessage,
} from "../events/dashRouter.js";
import {
  payEvtDashOnReady,
  payEvtDashHandleMessage,
  payEvtDashHandleInteraction,
} from "../events/payEvtDash/index.js";

// EVT3
import {
  evt3EventsOnReady,
  evt3EventsHandleMessage,
  evt3EventsHandleInteraction,
} from "../events/evt3EventsCreator.js";

// Blacklist Eventos
import {
  blacklistEventosOnReady,
  blacklistEventosHandleInteraction,
} from "../events/blacklistEventos.js";

// Hall da Fama & Eventos Diários
import {
  hallDaFamaOnReady,
  hallDaFamaHandleInteraction,
} from "../events/hallDaFama.js";
import {
  eventosDiariosOnReady,
  eventosDiariosHandleInteraction,
} from "../events/eventosDiarios.js";

// Comandos Admin
import { registerApagarPV } from "../commands/admin/apagarpv.js";
import { criarCargoHandleMessage } from "../commands/admin/criarcargo.js";
import { verIdHandleMessage } from "../commands/admin/verid.js";
import { removerMassivoHandleMessage } from "../commands/admin/removerMassivo.js";
import { apagarChatHandleMessage } from "../commands/admin/apagarchat.js";
import remcargo, { installRoleGuardian } from "../commands/admin/remcargo.js";
import mirror from "../events/criarCategoriaEspelho.js";
import copycargo from "../commands/admin/copycargo.js";
import { clearHandleMessage } from "../commands/admin/clearHandler.js";
import { removerPermHandleMessage } from "../commands/admin/removerperm.js";
import {
  duplicarPermHandleMessage,
  duplicarPermHandleInteraction,
} from "../commands/admin/duplicarperm.js";
import {
  editarPermHandleMessage,
  verPermsHandleMessage,
  editarPermHandleInteraction,
} from "../commands/admin/editarperm.js";

// Role Protect
import {
  roleProtectOnReady,
  roleProtectHandleMessage,
  roleProtectHandleGuildMemberUpdate,
} from "../events/roleProtect.js";

// Set Staff
import {
  setStaffOnReady,
  setStaffHandleInteraction,
  setStaffHandleGuildMemberAdd,
} from "../events/administração nobre/setStaff.js";
import {
  setStaffV2OnReady,
  setStaffV2HandleMessage,
  setStaffV2HandleInteraction,
} from "../events/setStaffV2.js";

// Registro Manager
import {
  registroManagerOnReady,
  registroManagerHandleInteraction,
  registroManagerHandleMessage,
  registroManagerHandleMessageDelete,
  registroManagerHandleMessageBulkDelete,
  registroManagerHandleMessageUpdate,
} from "../events/registroManager.js";

// FACs
import {
  facsSemanaisOnReady,
  facsSemanaisHandleMessage,
  facsSemanaisHandleInteraction,
} from "../events/facsSemanais.js";
import {
  facsComparativoOnReady,
  facsComparativoHandleInteraction,
  facsComparativoHandleMessage,
} from "../events/facsComparativo.js";

// Confirmação Presença
import {
  confirmacaoPresencaOnReady,
  confirmacaoPresencaHandleInteraction,
} from "../events/confirmacaoPresenca.js";

// Geral Dash & Ranking
import * as geralDash from "../events/scGeralDash.js";
import {
  geralWeeklyRankOnReady,
  geralWeeklyRankHandleMessage,
  handleWeeklyRankInteractions,
} from "../events/scGeralWeeklyRanking.js";

// Dashboard Managers
import {
  graficoManagersOnReady,
  graficoManagersHandleInteraction,
} from "../events/GraficoManagers.js";

// Recrutamento Dash
import {
  recrutamentoDashOnReady,
  recrutamentoDashHandleInteraction,
  recrutamentoDashHandleMessage,
} from "../events/recrutamentoDash.js";

// Monitor Cargos
import {
  monitorCargosOnReady,
  monitorCargosHandleUpdate,
  monitorCargosHandleMessage,
} from "../events/monitorCargos.js";

// Cadastro Manual
import {
  cadastroManualOnReady,
  cadastroManualHandleInteraction,
} from "../events/cadastroManual.js";

// Aulão
import {
  aulaoHandleMessage,
  aulaoHandleInteraction,
} from "../events/aulaoSantaCreators.js";

// Cronograma Creators
import {
  cronogramaCreatorsOnReady,
  cronogramaCreatorsHandleMessage,
  cronogramaCreatorsHandleInteraction,
} from "../events/cronogramaCreators.js";

// Registro Vendas
import {
  registroVendasOnReady,
  registroVendasHandleMessage,
  registroVendasHandleInteraction,
} from "../events/registroVendas.js";

// Auto React Fotos
import {
  autoReactsFotosOnReady,
  autoReactsFotosHandleMessage,
} from "../events/autoReactsFotos.js";

// Hierarquia
import {
  hierarquiaOnReady,
  hierarquiaHandleInteraction,
  hierarquiaHandleMessage,
  hierarquiaHandleGuildMemberUpdate,
} from "../events/hierarquiaDivisoes.js";

// Reunião Semanal
import {
  reuniaoSemanalOnReady,
  reuniaoSemanalHandleMessage,
  reuniaoSemanalHandleInteraction,
} from "../events/reuniaoSemanal.js";

// Log Entrada
import * as memberJoinLog2 from "../events/logs/memberJoinLog.js";
import { autoRoleOnJoin as autoRoleOnJoin2 } from "../events/autoRoleOnJoin.js";

// Role Permission Guard
import { rolePermissionGuardHandleRoleUpdate as rolePermissionGuardHandleRoleUpdate2 } from "../events/rolePermissionGuard.js";

// Log Checklist
import {
  checklistOnReady,
  checklistHandleMessage,
  checklistHandleInteraction,
} from "../events/logChecklistSemanal.js";

// Role Sync Module
import { setupSyncCargos } from "../events/syncCargos.js";

// =====================================================
// Express + Mongo
// =====================================================
EventEmitter.defaultMaxListeners = 25;
const app = express();
const safeSend = wrapRL((ch, payload) => ch.send(payload));

// =====================================================
// Guardas globais do Core
// =====================================================
globalThis.__SC_CORE_GUARDS__ ??= {
  setarNomeIntervalStarted: false,
};

client.__coreBootState ??= {
  readyBootExecuted: false,
  lateBootExecuted: false,
};

// Schemas
const ticketLogSchema = new mongoose.Schema({
  canalId: String,
  abertoPor: String,
  fechadoPor: String,
  motivo: String,
  abertoEm: Date,
  fechadoEm: Date,
});
mongoose.model("TicketLog", ticketLogSchema);

const transcriptSchema = new mongoose.Schema({
  canalId: String,
  abertoPor: String,
  assumidoPor: String,
  mensagens: [
    {
      autor: String,
      idAutor: String,
      conteudo: String,
      horario: Date,
      avatar: String,
    },
  ],
});
const Transcript = mongoose.model("Transcript", transcriptSchema, "transcripts");

const entrevistasTickets = createEntrevistasTickets({ client, Transcript });

mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ Conectado ao MongoDB Atlas!"))
  .catch((err) => {
    console.error("❌ Erro ao conectar no MongoDB:", err);
    process.exit(1);
  });

app.get("/transcript/:canalId", async (req, res) => {
  const { canalId } = req.params;
  const transcript = await Transcript.findOne({ canalId });
  if (!transcript) return res.send("<h2>Transcript não encontrado.</h2>");
  res.send(
    `<html><body><h1>Transcript: ${canalId}</h1><pre>${JSON.stringify(
      transcript.mensagens,
      null,
      2
    )}</pre></body></html>`
  );
});
app.listen(3000, () => {});

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

function runChannelDeleteProtect(channel, clientInstance) {
  try {
    if (channelDeleteProtectLog && typeof channelDeleteProtectLog.execute === "function") {
      return channelDeleteProtectLog.execute(channel, clientInstance);
    }

    if (typeof channelDeleteProtectLog === "function") {
      return channelDeleteProtectLog(channel, clientInstance);
    }

    return Promise.resolve(false);
  } catch (error) {
    return Promise.reject(error);
  }
}

// =====================================================
// Setup Handlers
// =====================================================
const setupEventHandlers = () => {
  if (client.__handlersWired) return;
  client.__handlersWired = true;

  setupSyncCargos(client);
  setupSortChannels(client);
  setupTicketRenamer(client);

  client.on("channelCreate", async (c) => {
    try {
      await channelCreateLog.execute(c);
    } catch (e) {}
  });

  client.on("channelDelete", async (c) => {
    try {
      await channelDeleteLog.execute(c);
    } catch (e) {}
    try {
      await Promise.resolve(runChannelDeleteProtect(c, client));
    } catch (e) {}
    try {
      reminderHandleChannelDelete(c);
    } catch (e) {}
    try {
      connectStatusOnChannelDelete(c);
    } catch (e) {}
  });

  client.on(Events.ChannelUpdate, async (o, n) => {
    try {
      await reminderHandleChannelUpdate(o, n, client);
    } catch (e) {}
  });

  client.on("messageCreate", async (message) => {
    try {
      try {
        await reminderHandleMessageCreate(message, client);
      } catch (e) {}
      try {
        cacheMessage(message);
      } catch (e) {}

      try {
        if (await sortChannelsHandleMessage(message, client)) return;
      } catch (e) {
        console.error("[CORE] erro em sortChannelsHandleMessage:", e);
      }

      try {
        if (await autoReactsFotosHandleMessage(message, client)) return;
      } catch (e) {
        console.error("[CORE] erro em autoReactsFotosHandleMessage:", e);
      }

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

      if (await criarCargoHandleMessage(message, client)) return;
      if (await removerPermHandleMessage(message, client)) return;
      if (await duplicarPermHandleMessage(message, client)) return;
      if (await clearHandleMessage(message, client)) return;
      if (await removerMassivoHandleMessage(message, client)) return;
      if (await verIdHandleMessage(message, client)) return;
      if (await apagarChatHandleMessage(message, client)) return;
      if (await verPermsHandleMessage(message)) return;
      
      if (message.content.startsWith('!criar')) {
        await mirror.execute(message, message.content.split(/\s+/).slice(1), client);
        return;
      }
      if (message.content.startsWith('!copycargo')) {
        await copycargo.execute(message);
        return;
      }
      if (message.content.startsWith('!remcargo')) {
        await remcargo.execute(message, message.content.split(/\s+/).slice(1));
        return;
      }
      if (await editarPermHandleMessage(message, client)) return;

      if (await pedirSetHandleMessage(message, client)) return;
      if (await handleCorrecao(message, client)) return;
      if (await alinhamentosHandleMessage(message, client)) return;
      await formsCreatorHandleMessage(message, client);
      if (await setStaffV2HandleMessage(message, client)) return;
      if (await doacaoHandleMessage(message, client)) return;
      if (await vipEventoHandleMessage(message, client)) return;
      if (await vipRegistroHandleMessage(message, client)) return;

      await entrevistasTickets.onMessageCreate(message);
      await messageCreateHandler.execute(message, [], client);
    } catch (error) {
      console.error("Erro messageCreate:", error);
    }
  });

  registerApagarPV(client);

  client.on("messageUpdate", async (o, n) => {
    try {
      await messageUpdateLog.execute(o, n, client);
    } catch (e) {}
    try {
      await registroManagerHandleMessageUpdate(o, n, client);
    } catch (e) {}
  });

  client.on("messageDelete", async (m) => {
    try {
      await messageDeleteLog.execute(m, client);
    } catch (e) {}
    try {
      await registroManagerHandleMessageDelete(m, client);
    } catch (e) {}
  });

  client.on("messageDeleteBulk", async (ms) => {
    try {
      await messageDeleteBulkLog.execute(ms, client);
    } catch (e) {}
    try {
      await registroManagerHandleMessageBulkDelete(ms, ms.first()?.channel, client);
    } catch (e) {}
  });

  client.on("guildMemberAdd", async (m) => {
    try {
      await autoRoleOnJoin2(m);
    } catch (e) {
      console.error("[CORE] erro em autoRoleOnJoin:", e);
    }

    try {
      await bemvindoHandler.execute(m);
    } catch (e) {}
    try {
      await setStaffHandleGuildMemberAdd(m, client);
    } catch (e) {}
    try {
      await memberJoinLog2.execute(m, client);
    } catch (e) {}
  });

  client.on("guildMemberRemove", async (m) => {
    try {
      await saidaHandler.execute(m);
    } catch (e) {}
  });

  client.on("inviteCreate", (i) => memberJoinLog2.handleInviteCreate(i));
  client.on("inviteDelete", (i) => memberJoinLog2.handleInviteDelete(i));

  client.on("guildMemberUpdate", async (o, n) => {
    try {
      await roleProtectHandleGuildMemberUpdate(o, n, client);
    } catch (e) {}
    try {
      await monitorCargosHandleUpdate(o, n, client);
    } catch (e) {}
    try {
      await hierarquiaHandleGuildMemberUpdate(o, n, client);
    } catch (e) {}
  });

  client.on("roleUpdate", async (oldRole, newRole) => {
    try {
      await rolePermissionGuardHandleRoleUpdate2(oldRole, newRole, client);
    } catch (error) {
      console.error("[CORE] erro em rolePermissionGuardHandleRoleUpdate:", error);
    }
  });

  client.on("interactionCreate", async (interaction) => {
    if (interaction.isAutocomplete()) return;

    try {
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
      if (await setStaffHandleInteraction(interaction, client)) return;
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

      if (await duplicarPermHandleInteraction(interaction, client)) return;
      if (await editarPermHandleInteraction(interaction, client)) return;
      if (await cadastroManualHandleInteraction(interaction, client)) return;
      if (await aulaoHandleInteraction(interaction, client)) return;
      if (await cronogramaCreatorsHandleInteraction(interaction, client)) return;
      if (await hierarquiaHandleInteraction(interaction, client)) return;
      if (await checklistHandleInteraction(interaction, client)) return;

      if (await handlePagamentoSocial(interaction, client).catch(() => false)) return;

      if (
        interaction.isButton() &&
        (interaction.customId.startsWith("cd_history:") ||
          interaction.customId.startsWith("cd_restore:"))
      ) {
        return interaction.reply({
          content: "Funcionalidade movida para o core, verifique os logs.",
          ephemeral: true,
        });
      }

      if (await entrevista.handleButtons(interaction).catch(() => false)) return;
      if (await entrevistasTickets.onInteractionCreate(interaction).catch(() => false)) return;

      await interactionCreateHandler.execute(interaction);
    } catch (error) {
      console.error("Erro interactionCreate:", error);
    }
  });

  client.once("ready", async () => {
    if (client.__coreBootState.readyBootExecuted) return;
    client.__coreBootState.readyBootExecuted = true;
    try {

    try {
      console.log("[CORE] Instalando Role Guardian...");
      installRoleGuardian(client);
    } catch (e) {
      console.error("[CORE] Erro ao instalar Role Guardian:", e);
    }

    try {
      console.log("[CORE] Iniciando AutoJoin...");
      iniciarAutoJoin(client);
    } catch (e) {
      console.error("[CORE] Erro AutoJoin:", e);
    }

    try {
      iniciarRegistroPoderes(client);
    } catch (e) {}
    try {
      iniciarRegistroEvento(client);
    } catch (e) {}
    try {
      await reminderOnReady(client);
    } catch (e) {}

    try {
      await facsSemanaisOnReady(client);
    } catch (e) {}
    try {
      await facsComparativoOnReady(client);
    } catch (e) {}
    try {
      await confirmacaoPresencaOnReady(client);
    } catch (e) {}
    try {
      await graficoManagersOnReady(client);
    } catch (e) {}
    try {
      await registroManagerOnReady(client);
    } catch (e) {}
    try {
      await registroVendasOnReady(client);
    } catch (e) {}
    try {
      await evt3EventsOnReady(client);
    } catch (e) {}
    try {
      dashDebugOnReady(client);
    } catch (e) {}
    try {
      await dashRouterOnReady(client);
    } catch (e) {}
    try {
      await payEvtDashOnReady(client);
    } catch (e) {}

    try {
      if (typeof geralDash?.geralDashOnReady === "function") {
        await geralDash.geralDashOnReady(client);
      }
    } catch (e) {}

    try {
      await geralWeeklyRankOnReady(client);
    } catch (e) {}

    console.log(`✅ Bot pronto como ${client.user.tag}`);
    client.user.setActivity("Cauã Macedo – SantaCreators ✨", {
      type: ActivityType.Watching,
    });

    try {
      await roleProtectOnReady(client);
    } catch (e) {}
    try {
      await formsCreatorOnReady(client);
    } catch (e) {}
    try {
      await doacaoOnReady(client);
    } catch (e) {}
    try {
      await pedirSetOnReady(client);
    } catch (e) {}
    try {
      await setStaffOnReady(client);
    } catch (e) {}
    try {
      await connectStatusOnReady(client);
    } catch (e) {}
    try {
      await alinhamentosOnReady(client);
    } catch (e) {}
    try {
      await vipEventoOnReady(client);
    } catch (e) {}
    try {
      await vipRegistroOnReady(client);
    } catch (e) {}
    try {
      await lideresConvitesOnReady(client);
    } catch (e) {}
    try {
      await setStaffV2OnReady(client);
    } catch (e) {}
    try {
      await blacklistEventosOnReady(client);
    } catch (e) {}
    try {
      await hallDaFamaOnReady(client);
    } catch (e) {}
    try {
      await eventosDiariosOnReady(client);
    } catch (e) {}
    try {
      await cadastroManualOnReady(client);
    } catch (e) {}
    try {
      await recrutamentoDashOnReady(client);
    } catch (e) {}
    try {
      await monitorCargosOnReady(client);
    } catch (e) {}
    try {
      await cronogramaCreatorsOnReady(client);
    } catch (e) {}
    try {
      await ausenciasOnReady(client);
    } catch (e) {}
    try {
      await hierarquiaOnReady(client);
    } catch (e) {}
    try {
      await reuniaoSemanalOnReady(client);
    } catch (e) {}
    try {
      await checklistOnReady(client);
    } catch (e) {}

    try {
      console.log("[CORE] Inicializando autoReactsFotos (modo centralizado)...");
      await autoReactsFotosOnReady(client);
      console.log("[CORE] autoReactsFotos inicializado.");
    } catch (e) {
      console.error("[CORE] Erro autoReactsFotos:", e);
    }

    try {
      await pagamentoSocialOnReady(client);
    } catch (e) {}

  } catch (e) {
    console.error("[CORE] Erro crítico no boot ready:", e);
  }
});
};

// Inicialização do Bot
setupEventHandlers();
loadRegistros();

client.login(BOT_TOKEN).catch((err) => {
  console.error("❌ Erro ao fazer login no Discord:", err);
});