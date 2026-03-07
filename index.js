// index.js — SantaCreators Bot (discord.js v14 • ESM)
// ✅ organizado + corrigido (sem duplicações / sem handler chamado 2x)
// ✅ comentários só onde importa
// ✅ pronto pra colar no lugar do teu index atual

// =====================================================
// 0) ENV
// =====================================================
import dotenv from "dotenv";
dotenv.config({ override: true });

// =====================================================
// 1) IMPORTS (Node / Libs / Discord)
// =====================================================

// Node
import fs from "node:fs";
import path from "node:path";
import cron from "node-cron"; // (mantido se você usa em algum módulo)
import mongoose from "mongoose";
import express from "express";
import { EventEmitter } from "node:events";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// Discord
import {
  Client,
  GatewayIntentBits,
  Partials,
  ActivityType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder,
  Events,
} from "discord.js";

// =====================================================
// 2) ESM compat: require() (pra módulos antigos)
// =====================================================
const require = createRequire(import.meta.url);
globalThis.require ??= require;

// =====================================================
// 3) Proteções globais (não deixa o processo morrer)
// =====================================================
process.on("unhandledRejection", (e) => console.error("[unhandledRejection]", e));
process.on("uncaughtException", (e) => console.error("[uncaughtException]", e));

// =====================================================
// 4) Helpers básicos
// =====================================================
function mask(t) {
  const s = (t ?? "").toString().trim();
  return {
    parts: s ? s.split(".").length : 0,
    len: s.length,
    sample: s ? `${s.slice(0, 6)}...${s.slice(-6)}` : "(vazio)",
  };
}

// ✅ LIMPEZA DE ARQUIVOS TEMPORÁRIOS (.tmp) NO BOOT
// Isso ajuda a recuperar espaço se o bot crashou enquanto salvava
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
// 5) Token seguro + Client Singleton
// =====================================================

// Lê de DISCORD_TOKEN ou TOKEN e sanitiza espaços/quebras
const BOT_TOKEN = (process.env.DISCORD_TOKEN?.trim() || process.env.TOKEN?.trim() || "").replace(/\s+/g, "");

if (!BOT_TOKEN || BOT_TOKEN.split(".").length !== 3) {
  console.error("❌ DISCORD_TOKEN/TOKEN ausente ou inválido (precisa ter 3 partes).");
  process.exit(1);
}

// console.log("[TOKEN OK]", mask(BOT_TOKEN));
globalThis.token = BOT_TOKEN; // compat pra módulos antigos

if (!globalThis.__SC_CLIENT__) {
  globalThis.__SC_CLIENT__ = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildModeration,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildPresences,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildBans,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMessageTyping,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.DirectMessageReactions,
      GatewayIntentBits.DirectMessageTyping,
    ],
    partials: [Partials.GuildMember, Partials.User, Partials.Message, Partials.Channel, Partials.Reaction],
    allowedMentions: { parse: [], repliedUser: false },
  });
}

export const client = globalThis.__SC_CLIENT__;
globalThis.client = client; // ✅ Compatibilidade para módulos que usam globalThis.client

// =====================================================
// 6) Imports do teu projeto (módulos / comandos / eventos)
// =====================================================

// --- Logs (executores)
import messageDeleteLog from "./events/logs/messageDelete.js";
import messageDeleteBulkLog from "./events/logs/messageDeleteBulk.js";
import messageUpdateLog from "./events/logs/messageUpdate.js";
import channelCreateLog from "./events/logs/channelCreate.js";
import channelDeleteLog from "./events/logs/channelDelete.js";
import channelDeleteProtectLog from "./events/logs/channelDeleteProtect.js";

// --- Handlers “gerais”
import messageCreateHandler from "./events/messageCreate.js";
import interactionCreateHandler from "./events/interactionCreate.js";

// --- Comandos / fluxos
import entrevista from "./utils/entrevista.js";
import bemvindoHandler from "./commands/admin/start/bemvindo.js";
import saidaHandler from "./commands/admin/start/saida.js";
import { handleCorrecao } from "./commands/admin/correcao.js";

// Tickets/Entrevistas (factory)
import createEntrevistasTickets from "./commands/entrevistasTickets.js";

// --- Utilitários (rate-limit + cache)
import { wrapRL } from "./utils/rl.js";
import { getChannel } from "./utils/cacheDiscord.js";

// --- Sistemas / módulos (ready / message / interaction)
import { iniciarRegistroPoderes } from "./events/registropoderes.js";
import { iniciarRegistroEvento } from "./events/registroevento.js";
import { iniciarAutoJoin } from "./events/autojoinVoice.js";

// Logs “setup”
import { setupUserUpdateLog } from "./events/logs/userUpdate.js";
import { setupBanLog } from "./events/logs/ban.js";
import { setupKickLog } from "./events/logs/kick.js";
import { setupRoleUpdateLog } from "./events/logs/roleUpdate.js";
import { setupVoiceLog } from "./events/logs/voice.js";
import { setupChannelCategoryMoveLog } from "./events/logs/channelCategoryMove.js";
import { setupBotRemoveLog } from "./events/logs/botRemove.js";
import { setupBotAddLog } from "./events/logs/botAdd.js";
import { setupNicknameChangeLog } from "./events/logs/nicknameChange.js";
import { setupChannelLog } from "./events/logs/channel.js";
import { setupChannelNameCategoryUpdateLog } from "./events/logs/channelNameCategoryUpdate.js";
import { cacheMessage } from "./events/logs/_deleteCache.js";
import {
  reminderOnReady,
  reminderHandleMessageCreate,
  reminderHandleChannelDelete,
  reminderHandleChannelUpdate
} from "./events/reminderManager.js";




// Pagamento social
import { pagamentoSocialOnReady, handlePagamentoSocial } from "./events/pagamentosocial.js";

// FormsCreator
import { formsCreatorOnReady, formsCreatorHandleMessage, formsCreatorHandleInteraction } from "./events/formscreator.js";

// Dashboards / Managers



import setupBatePonto from "./events/batePonto.js";
import setupAlinhamentoDash from "./Dashboard/alinhamentoDash.js";



// Alinhamentos
import { alinhamentosOnReady, alinhamentosHandleMessage, alinhamentosHandleInteraction } from "./events/alinhamentos.js";

// Sort / Renamer
import { setupSortChannels, sortChannelsHandleMessage, sortChannelsHandleInteraction } from "./commands/canais/sortChannels.js";
import { setupTicketRenamer } from "./commands/canais/ticketRenamer.js";

// PedirSet
import { pedirSetOnReady, pedirSetHandleMessage, pedirSetHandleInteraction } from "./events/pedirset.js";

// Lembretes (central)
import { startTodosLembretes } from "./events/lembretes/index.js";

// Monitor online
import { startRolesOnlineMonitor } from "./events/rolesOnlineMonitor.js";

// Connect Status
import { connectStatusOnReady, connectStatusHandleMessage, connectStatusOnChannelDelete } from "./events/connectStatus.js";

// Orgs por dia
import { orgsHandleMessage, orgsHandleInteraction } from "./events/analisarOrgsPorDia.js";

// VIP Evento / Líderes Convites
import { vipEventoOnReady, vipEventoHandleInteraction } from "./events/vipEvento.js";
import { lideresConvitesOnReady, lideresConvitesHandleInteraction } from "./events/lideresConvites.js";

// Doação
import { doacaoOnReady, doacaoHandleMessage, doacaoHandleInteraction } from "./events/doacao.js";

// Dash debug + dash router
import { dashDebugOnReady } from "./events/dashDebug.js";
import { dashRouterOnReady, dashRouterHandleMessage } from "./events/dashRouter.js";
import { payEvtDashOnReady, payEvtDashHandleMessage, payEvtDashHandleInteraction } from "./events/payEvtDash/index.js";
// EVT3 EventsCreator (novo, hook-based)
import { evt3EventsOnReady, evt3EventsHandleMessage, evt3EventsHandleInteraction } from "./events/evt3EventsCreator.js";

// ✅ Blacklist Eventos
import { blacklistEventosOnReady, blacklistEventosHandleInteraction } from "./events/blacklistEventos.js";

// ✅ Hall da Fama & Eventos Diários
import { hallDaFamaOnReady, hallDaFamaHandleInteraction } from "./events/hallDaFama.js";
import { eventosDiariosOnReady, eventosDiariosHandleInteraction } from "./events/eventosDiarios.js";


// Comandos admin (modular)
import { registerApagarPV } from "./commands/admin/apagarpv.js";
import { criarCargoHandleMessage } from "./commands/admin/criarcargo.js";
import { verIdHandleMessage } from "./commands/admin/verid.js";
import { removerMassivoHandleMessage } from "./commands/admin/removerMassivo.js";
import { apagarChatHandleMessage } from "./commands/admin/apagarchat.js";
import { clearHandleMessage } from "./commands/admin/clearHandler.js";
import { removerPermHandleMessage } from "./commands/admin/removerperm.js";
import { duplicarPermHandleMessage, duplicarPermHandleInteraction } from "./commands/admin/duplicarperm.js";

// Role Protect
import { roleProtectOnReady, roleProtectHandleMessage, roleProtectHandleGuildMemberUpdate } from "./events/roleProtect.js";

// Set Staff
import { setStaffOnReady, setStaffHandleInteraction, setStaffHandleGuildMemberAdd } from "./events/administração nobre/setStaff.js";
import { setStaffV2OnReady, setStaffV2HandleMessage, setStaffV2HandleInteraction } from "./events/setStaffV2.js";

///gestaoinfluencer controle
// import {
//   gestaoinfluencerOnReady,
//   gestaoinfluencerHandleInteraction,
//   gestaoinfluencerHandleGuildMemberUpdate
// } from "./events/gestaoinfluencer/index.js";


//registromanager 
import {
  registroManagerOnReady,
  registroManagerHandleInteraction,
  registroManagerHandleMessage, // ✅ ADD
  registroManagerHandleMessageDelete,
  registroManagerHandleMessageBulkDelete,
  registroManagerHandleMessageUpdate,
} from "./events/registroManager.js";


// FACs Semanais (novo)
import {
  facsSemanaisOnReady,
  facsSemanaisHandleMessage,
  facsSemanaisHandleInteraction,
} from "./events/facsSemanais.js";


import {
  facsComparativoOnReady,
  facsComparativoHandleInteraction,
  facsComparativoHandleMessage,
} from "./events/facsComparativo.js";

// ✅ Confirmação de Presença (NOVO)
import {
  confirmacaoPresencaOnReady,
  confirmacaoPresencaHandleInteraction
} from "./events/confirmacaoPresenca.js";


// Geral Dash
import * as geralDash from "./events/scGeralDash.js";
import { 
  geralWeeklyRankOnReady,
  geralWeeklyRankHandleMessage,
  handleWeeklyRankInteractions   // ✅ ADD ISSO
} from "./events/scGeralWeeklyRanking.js";


// =====================================================

//Darshboard Managers

import {
  graficoManagersOnReady,
  graficoManagersHandleInteraction,
} from "./events/GraficoManagers.js";

// ✅ Recrutamento Dash (Novo Dashboard de Recrutamento)
import {
  recrutamentoDashOnReady,
  recrutamentoDashHandleInteraction,
  recrutamentoDashHandleMessage
} from "./events/recrutamentoDash.js";

// ✅ Monitoramento de Cargos (Limites)
import { monitorCargosOnReady, monitorCargosHandleUpdate, monitorCargosHandleMessage } from "./events/monitorCargos.js";

// ✅ Cadastro Manual (Setar Cargo)
import {
  cadastroManualOnReady,
  cadastroManualHandleInteraction
} from "./events/cadastroManual.js";

// ✅ Aulão SantaCreators (Treinamento)
import { aulaoHandleMessage, aulaoHandleInteraction } from "./events/aulaoSantaCreators.js";

// ✅ Cronograma Creators (Novo)
import { cronogramaCreatorsOnReady, cronogramaCreatorsHandleMessage, cronogramaCreatorsHandleInteraction } from "./events/cronogramaCreators.js";

// ✅ Registro Vendas (Novo)
import {
  registroVendasOnReady,
  registroVendasHandleMessage,
  registroVendasHandleInteraction,
} from "./events/registroVendas.js";

// ✅ Hierarquia Divisões (Novo)
import {
  hierarquiaOnReady,
  hierarquiaHandleInteraction,
  hierarquiaHandleMessage,
  hierarquiaHandleGuildMemberUpdate // ✅ Importado corretamente
} from "./events/hierarquiaDivisoes.js";

// ✅ NOVO: Log de Entrada com Convites
import * as memberJoinLog from "./events/logs/memberJoinLog.js";

// 7) Express + Mongo (Transcripts)
// =====================================================
EventEmitter.defaultMaxListeners = 25;

const app = express();

// Wrap seguro de rate-limit (mantive)
const safeSend = wrapRL((ch, payload) => ch.send(payload));
const safeEdit = wrapRL((msg, payload) => msg.edit(payload));

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

// Instancia o módulo de Tickets/Entrevistas
const entrevistasTickets = createEntrevistasTickets({ client, Transcript });

// Conexão Mongo
mongoose
  .connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ Conectado ao MongoDB Atlas!"))
  .catch((err) => {
    console.error("❌ Erro ao conectar no MongoDB:", err);
    process.exit(1);
  });

// Rotas (transcript)
app.get("/transcript/:canalId", async (req, res) => {
  const { canalId } = req.params;
  const transcript = await Transcript.findOne({ canalId });

  if (!transcript) return res.send("<h2>Transcript não encontrado.</h2>");

  const html = `
    <html>
    <head>
      <title>Transcript - ${canalId}</title>
      <style>
        body { background: #111; color: #fff; font-family: Arial; padding: 20px; }
        h1 { color: #ff009a; }
        .msg { margin-bottom: 15px; border-bottom: 1px dashed #444; padding-bottom: 8px; }
        .autor { font-weight: bold; color: #ffd700; }
        .hora { font-size: 0.9em; color: #aaa; margin-left: 10px; }
        .conteudo { margin-top: 5px; white-space: pre-wrap; }
        .conteudo img { margin-top: 6px; max-width: 100%; border-radius: 10px; }
      </style>
    </head>
    <body>
      <h1>📂 Transcript do Ticket: ${canalId}</h1>
      <div>
        ${transcript.mensagens
          .map(
            (msg) => `
          <div class="msg">
            <div>
              <span class="autor">${msg.autor}</span>
              <span class="hora">${new Date(msg.horario).toLocaleString("pt-BR")}</span>
            </div>
            <div class="conteudo">${msg.conteudo}</div>
          </div>
        `
          )
          .join("")}
      </div>
    </body>
    </html>
  `;
  res.send(html);
});

// Debug: lista IDs
app.get("/debug/listar", async (req, res) => {
  const docs = await Transcript.find({}, { canalId: 1, _id: 0 });
  res.send(`<h2>Canal IDs salvos no Mongo:</h2><pre>${docs.map((d) => d.canalId).join("\n")}</pre>`);
});

// Servidor HTTP
app.listen(3000, () => {}); // console.log("🧾 Servidor de transcripts rodando em http://localhost:3000"));

// =====================================================
// 8) (Opcional/Legado) Helpers de pedidos em JSON
// =====================================================
const CAMINHO_ARQUIVO_PEDIDOS = "./pedidos.json";

function salvarPedido(userId, dados) {
  let pedidos = {};
  if (fs.existsSync(CAMINHO_ARQUIVO_PEDIDOS)) {
    pedidos = JSON.parse(fs.readFileSync(CAMINHO_ARQUIVO_PEDIDOS, "utf-8"));
  }
  if (!pedidos[userId]) pedidos[userId] = [];
  pedidos[userId].push(dados);
  fs.writeFileSync(CAMINHO_ARQUIVO_PEDIDOS, JSON.stringify(pedidos, null, 2));
}

function obterPedido(userId) {
  if (!fs.existsSync(CAMINHO_ARQUIVO_PEDIDOS)) return null;
  const pedidos = JSON.parse(fs.readFileSync(CAMINHO_ARQUIVO_PEDIDOS, "utf-8"));
  return pedidos[userId] || null;
}

// =====================================================
// 9) Registros locais (registros.json)
// =====================================================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let registros = [];

const loadRegistros = () => {
  const filePath = path.join(__dirname, "events", "registros.json");
  try {
    if (!fs.existsSync(filePath)) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, "[]", "utf8");
      // console.log("Arquivo registros.json criado automaticamente.");
    }
    registros = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    console.error("Erro ao carregar registros:", error);
  }
};

// =====================================================
// 10) Placeholders antigos (mantidos)
// =====================================================
async function handleEventsCreator(interaction) {
  return false;
}
async function handleAlinhamentos(interaction) {
  return false;
}

// =====================================================
// 11) Setup de Event Handlers (idempotente / anti-duplicação)
// =====================================================
const setupEventHandlers = () => {
  if (client.__handlersWired) {
    // console.log("⚠️ setupEventHandlers: já estava ligado, ignorando...");
    return;
  }
  client.__handlersWired = true;

  // Limpa listeners antigos/duplicados ANTES de registrar os novos
  for (const evt of [
    "interactionCreate",
    "messageCreate",
    "messageUpdate",
    "messageDelete",
    "messageDeleteBulk",
    "guildMemberAdd",
    "channelCreate",
    "channelDelete",
    "channelUpdate", 
    "guildMemberRemove",
    "guildMemberUpdate",
    "ready",
    "inviteCreate",
    "inviteDelete",
    "voiceStateUpdate",
  ]) {
    client.removeAllListeners(evt);
  }

  // Sistemas “sempre-on”
  setupSortChannels(client);
  setupTicketRenamer(client);

  // =================================================
  // channelCreate
  // =================================================
  client.on("channelCreate", async (channel) => {
    try {
      await channelCreateLog.execute(channel);
    } catch (e) {
      console.error("Erro em channelCreate log:", e);
    }
  });

  // =================================================
  // channelDelete (log + proteção + connectStatus cleanup)
  // =================================================
    client.on("channelDelete", async (channel) => {
    try {
      await channelDeleteLog.execute(channel);
    } catch (e) {
      console.error("Erro em channelDelete log:", e);
    }

    try {
      await channelDeleteProtectLog.execute(channel, client);
    } catch (e) {
      console.error("Erro em channelDeleteProtect log:", e);
    }

    // ✅ REMINDER MANAGER — limpa pendência se canal deletar
    try {
      reminderHandleChannelDelete(channel);
    } catch (e) {
      console.warn("⚠️ [REMINDER] erro em reminderHandleChannelDelete:", e);
    }

    // Connect status: limpa interval se canal deletar
    try {
      connectStatusOnChannelDelete(channel);
    } catch {}
  });

  // =================================================
  // channelUpdate (Reminder Manager precisa pra limpar se sair da categoria)
  // =================================================
client.on(Events.ChannelUpdate, async (oldCh, newCh) => {
  try {
    if (typeof reminderHandleChannelUpdate !== "function") return;
    await reminderHandleChannelUpdate(oldCh, newCh, client);
  } catch {}
});



  // =================================================
  // messageCreate (roteador principal de comandos texto)
  // =================================================
    client.on("messageCreate", async (message) => {



      
    try {
      // ✅ REMINDER MANAGER — monitora vácuo
      try {
        await reminderHandleMessageCreate(message, client);
      } catch (e) {
        console.warn("⚠️ [REMINDER] erro em reminderHandleMessageCreate:", e);
      }

      cacheMessage(message);

      // ✅ PAY+EVT DASH (hooks) — comandos manuais e gatilho do registro manual
    try {
      if (await payEvtDashHandleMessage(message, client)) return;
    } catch (e) {
      console.warn("⚠️ [PAY_EVT_DASH] erro no handleMessage:", e);
    }


      // ✅ ORG MANAGER DASH (movimento + comandos)
      if (await facsComparativoHandleMessage(message, client)) return;


      // ✅ DASH: comandos de teste (!dashtest) — TEM QUE SER NO TOPO
      if (await dashRouterHandleMessage(message)) return;

      // ✅ FACs Semanais — comando !menueventos
try {
  if (await facsSemanaisHandleMessage(message, client)) return;
} catch (e) {
  console.warn("⚠️ [FACS] erro em facsSemanaisHandleMessage:", e);


}


// ✅ EVT3 — comando manual (!evt3)
try {
  if (await evt3EventsHandleMessage(message, client)) return;
} catch (e) {
  console.warn("⚠️ [EVT3] erro em evt3EventsHandleMessage:", e);
}


  
      // ✅ RECRUTAMENTO DASH — comando !zerarecrutamento
      if (await recrutamentoDashHandleMessage(message, client)) return;

      // ✅ MONITOR CARGOS — comando !atualizarpainel
      try {
        if (await monitorCargosHandleMessage(message, client)) return;
      } catch (e) {
        console.warn("⚠️ [MonitorCargos] erro no handleMessage:", e);
      }

      // ✅ REGISTRO MANAGER — comando !rmrepost (manual)
    try {
      if (await registroManagerHandleMessage(message, client)) return;
    } catch (e) {
      console.warn("⚠️ [RM] erro em registroManagerHandleMessage:", e);
    }


    // ✅ REGISTRO VENDAS — comando !painelvendas
try {
  if (await registroVendasHandleMessage(message, client)) return;
} catch (e) {
  console.warn("⚠️ [VENDAS] erro em registroVendasHandleMessage:", e);
}

      // ✅ Aulão SantaCreators (Comando !iniciaraulao)
      if (await aulaoHandleMessage(message, client)) return;

      // ✅ Cronograma Creators (!cronograma)
      if (await cronogramaCreatorsHandleMessage(message, client)) return;

      // ✅ Hierarquia Divisões (!hierarquia)
      if (await hierarquiaHandleMessage(message, client)) return;

      // ✅ Sort Channels (!inativo)
      if (await sortChannelsHandleMessage(message, client)) return;

      // Proteções / sistemas que podem “interceptar”
      if (await roleProtectHandleMessage(message, client)) return;
      if (await connectStatusHandleMessage(message, client)) return;
      if (await orgsHandleMessage(message, client)) return;

           // ✅ GERAL DASH (UMA VEZ SÓ, com proteção)
      try {
        if (typeof geralDash?.geralDashHandleMessage === "function") {
          if (await geralDash.geralDashHandleMessage(message, client)) return;
        }
      } catch (e) {
        console.error("[index] geralDashHandleMessage erro:", e);
      }

      // ✅ WEEKLY RANKING (novo) — comandos do ranking, sem mexer no GeralDash
      try {
        if (await geralWeeklyRankHandleMessage(message, client)) return;
      } catch (e) {
        console.warn("⚠️ [WEEKLY_RANK] handleMessage:", e);
      }

      // Admin comandos modular
      if (await criarCargoHandleMessage(message, client)) return;

      if (await removerPermHandleMessage(message, client)) return;
      if (await duplicarPermHandleMessage(message, client)) return;
      if (await clearHandleMessage(message, client)) return;
      if (await removerMassivoHandleMessage(message, client)) return;
      if (await verIdHandleMessage(message, client)) return;
      if (await apagarChatHandleMessage(message, client)) return;

      // Fluxos
      if (await pedirSetHandleMessage(message, client)) return;
      if (await handleCorrecao(message, client)) return;
      if (await alinhamentosHandleMessage(message, client)) return;

      // FormsCreator
      await formsCreatorHandleMessage(message, client);

      // Set Staff V2
      if (await setStaffV2HandleMessage(message, client)) return;

      // Doação
      if (await doacaoHandleMessage(message, client)) return;

      // Tickets/Entrevistas
      await entrevistasTickets.onMessageCreate(message);

      // Handler geral (teu arquivo antigo)
      await messageCreateHandler.execute(message, [], client);
    } catch (error) {
      console.error("Erro ao processar messageCreate:", error);
    }
  });


  // Registra comando !apagarpv (fica junto dos handlers)
  registerApagarPV(client);

  // =================================================
  // messageUpdate (log de edição)
  // =================================================
client.on("messageUpdate", async (oldMessage, newMessage) => {
  try {
    await messageUpdateLog.execute(oldMessage, newMessage, client);
  } catch (e) {
    console.error("Erro em messageUpdate log:", e);
  }

  // ✅ [RM] hooks — se alguém editou mensagem do RM/menu, ele se protege/recria
  try {
    await registroManagerHandleMessageUpdate(oldMessage, newMessage, client);
  } catch (e) {
    console.warn("⚠️ [RM] erro em registroManagerHandleMessageUpdate:", e);
  }
 
});



  // =================================================
  // messageDelete / messageDeleteBulk
  // =================================================
client.on("messageDelete", async (message) => {
  try {
    await messageDeleteLog.execute(message, client);
  } catch (e) {
    console.error("Erro em messageDelete log:", e);
  }

  // ✅ [RM] hooks — se deletarem a msg do menu/registro, ele se recupera
  try {
    await registroManagerHandleMessageDelete(message, client);
  } catch (e) {
    console.warn("⚠️ [RM] erro em registroManagerHandleMessageDelete:", e);
  }

  // ✅ ORG MANAGER DASH (hooks)


});


  client.on("messageDeleteBulk", async (messages) => {
  try {
    await messageDeleteBulkLog.execute(messages, client);
  } catch (e) {}

  // ✅ [RM] hooks — bulk delete pode apagar menu/msgs do RM
  try {
    const anyMsg = messages?.first?.() ?? null;
    const channel = anyMsg?.channel ?? null; // canal onde rolou o bulk delete
    await registroManagerHandleMessageBulkDelete(messages, channel, client);
  } catch (e) {
    console.warn("⚠️ [RM] erro em registroManagerHandleMessageBulkDelete:", e);
  }
});





  // =================================================
  // guildMemberAdd / guildMemberRemove
  // =================================================
  client.on("guildMemberAdd", async (member) => {
    try {
      await bemvindoHandler.execute(member);
    } catch (e) {
      console.error("Erro em guildMemberAdd:", e);
    }

    try {
      await setStaffHandleGuildMemberAdd(member, client);
    } catch (e) {
      console.error("Erro em setStaffHandleGuildMemberAdd:", e);
    }

    // ✅ NOVO: Log de Entrada (Convites + Info)
    try {
      await memberJoinLog.execute(member, client);
    } catch (e) {
      console.error("Erro em memberJoinLog:", e);
    }
  });

  client.on("guildMemberRemove", async (member) => {
    try {
      await saidaHandler.execute(member);
    } catch (e) {
      console.error("Erro em guildMemberRemove:", e);
    }
  });

  // =================================================
  // Invite Tracking (Cache Updates)
  // =================================================
  client.on("inviteCreate", (invite) => memberJoinLog.handleInviteCreate(invite));
  client.on("inviteDelete", (invite) => memberJoinLog.handleInviteDelete(invite));

  // =================================================
  // guildMemberUpdate (RoleProtect)
  // =================================================
  client.on("guildMemberUpdate", async (oldMember, newMember) => {


    try {
      await roleProtectHandleGuildMemberUpdate(oldMember, newMember, client);
    } catch (e) {
      console.error("Erro em roleProtect guildMemberUpdate:", e);
    }

 

    // ✅ Monitoramento de Cargos (Atualiza painel se cargos mudarem)
    try {
      await monitorCargosHandleUpdate(oldMember, newMember, client);
    } catch (e) {
      console.error("Erro em monitorCargosHandleUpdate:", e);
    }

    // ✅ Hierarquia Divisões (Atualiza painel se cargos mudarem)
    try {
      await hierarquiaHandleGuildMemberUpdate(oldMember, newMember, client);
    } catch (e) {
      console.error("Erro em hierarquiaHandleGuildMemberUpdate:", e);
    }
  });

  // =================================================
  // interactionCreate (ÚNICO ponto de entrada)
  // =================================================
client.on("interactionCreate", async (interaction) => {
  if (interaction.isAutocomplete()) return;

  // ✅ [RM] Registro Manager — PRIMEIRO de todos (botões/modais dele)
  try {
    const rmHandled = await registroManagerHandleInteraction(interaction, client);
    if (rmHandled) return; // se RM tratou, para aqui
  } catch (e) {
    console.warn("⚠️ [RM] erro em registroManagerHandleInteraction:", e);
  }
// ✅ WEEKLY RANKING — botão ➖ Remover Pontos + modal
try {
  const weeklyHandled = await handleWeeklyRankInteractions(interaction, client);
  if (weeklyHandled) return;
} catch (e) {
  console.warn("⚠️ [WEEKLY_RANK] erro em handleWeeklyRankInteractions:", e);
}


// ✅ VENDAS — botões/modais
try {
  const vendasHandled = await registroVendasHandleInteraction(interaction, client);
  if (vendasHandled) return;
} catch (e) {
  console.warn("⚠️ [VENDAS] erro em registroVendasHandleInteraction:", e);
}

  // ✅ FACs Semanais — botões/modais do menu (vem LOGO DEPOIS do RM)
  try {
    if (await facsComparativoHandleInteraction(interaction, client)) return;
    if (await facsSemanaisHandleInteraction(interaction, client)) return;
  } catch (e) {
    console.warn("⚠️ [FACS] erro em facsSemanaisHandleInteraction:", e);
  }

  // ✅ Confirmação de Presença (Botões/Modais)
  try {
    if (await confirmacaoPresencaHandleInteraction(interaction, client)) return;
  } catch (e) {
    console.warn("⚠️ [PRESENCA] erro em confirmacaoPresencaHandleInteraction:", e);
  }


  // ✅ EVT3 — Eventos (botões/modais)
try {
  if (await evt3EventsHandleInteraction(interaction, client)) return;
} catch (e) {
  console.warn("⚠️ [EVT3] erro em evt3EventsHandleInteraction:", e);
}

  // ✅ PAY+EVT DASH — botões/modais (remover pontos) - Moved higher for priority
  try {
    if (await payEvtDashHandleInteraction(interaction, client)) return;
  } catch (e) {
    console.warn("⚠️ [PAY_EVT_DASH] erro em payEvtDashHandleInteraction:", e);
  }



  try {
    // Interações de módulos (ordem importa: quem tratar primeiro, para)
    if (await orgsHandleInteraction(interaction, client)) return;
    if (await doacaoHandleInteraction(interaction, client)) return;
    if (await formsCreatorHandleInteraction(interaction, client)) return;
      if (await vipEventoHandleInteraction(interaction, client)) return;
      if (await lideresConvitesHandleInteraction(interaction, client)) return;
      if (await pedirSetHandleInteraction(interaction, client)) return;
      if (await setStaffHandleInteraction(interaction, client)) return;
      if (await alinhamentosHandleInteraction(interaction, client)) return;
      if (await setStaffV2HandleInteraction(interaction, client)) return;
      if (await graficoManagersHandleInteraction(interaction, client)) return;
      if (await recrutamentoDashHandleInteraction(interaction, client)) return;
      
      // ✅ Blacklist Eventos
      if (await blacklistEventosHandleInteraction(interaction, client)) return;

      // ✅ Hall da Fama
      if (await hallDaFamaHandleInteraction(interaction, client)) return;

      // ✅ Eventos Diários
      if (await eventosDiariosHandleInteraction(interaction, client)) return;

      // ✅ Sort Channels (Botão Desfazer !inativo)
      if (await sortChannelsHandleInteraction(interaction, client)) return;

      // ✅ GERAL DASH — botão ➖ Remover Pontos + modal
      try {
        if (typeof geralDash?.geralDashHandleInteraction === "function") {
          if (await geralDash.geralDashHandleInteraction(interaction, client)) return;
        }
      } catch (e) {
        console.error("[index] geralDashHandleInteraction erro:", e);
      }
      
      // ✅ duplicarperm: chama UMA VEZ só (tava duplicado)
      if (await duplicarPermHandleInteraction(interaction, client)) return;

      // ✅ Cadastro Manual (Setar Cargo)
      if (await cadastroManualHandleInteraction(interaction, client)) return;

      // ✅ Aulão SantaCreators (Botão de Início)
      if (await aulaoHandleInteraction(interaction, client)) return;

      // ✅ Cronograma Creators (Botões/Modais)
      if (await cronogramaCreatorsHandleInteraction(interaction, client)) return;

      // ✅ Hierarquia Divisões (Botões/Selects)
      if (await hierarquiaHandleInteraction(interaction, client)) return;

      // Compat: “roteador antigo” (só chama se existir)
      if (typeof handlePagamentos === "function" && (await handlePagamentos(interaction))) return;
      if (typeof handleSetStaff === "function" && (await handleSetStaff(interaction))) return;
      if (typeof handleCadastro === "function" && (await handleCadastro(interaction))) return;
      if (typeof handleEventsCreator === "function" && (await handleEventsCreator(interaction))) return;
      if (typeof handleAlinhamentos === "function" && (await handleAlinhamentos(interaction))) return;

      // Pagamento social
      const handledPagamentoSocial = await handlePagamentoSocial(interaction, client).catch(() => false);
      if (handledPagamentoSocial) return;

            // =================================================
      // Botões – ChannelDelete (histórico + restaurar)
      // =================================================
      if (interaction.isButton()) {
        const id = interaction.customId;

        if (id.startsWith("cd_history:") || id.startsWith("cd_restore:")) {
          const [action, guildId, userId] = id.split(":");

          // ✅ LÊ O STORE POR CAMINHO ABSOLUTO (não depende do "cwd" do host)
          // Tenta onde o channelDelete.js normalmente salva (events/data/...)
          // e mantém fallback pros outros lugares, caso teu deploy esteja diferente.
          const candidatePaths = [
            path.join(__dirname, "events", "data", "moderacao", "channelDeleteInfractions.json"),
            path.join(__dirname, "data", "moderacao", "channelDeleteInfractions.json"),
            path.join(process.cwd(), "events", "data", "moderacao", "channelDeleteInfractions.json"),
            path.join(process.cwd(), "data", "moderacao", "channelDeleteInfractions.json"),
          ];

          let filePath = candidatePaths[0];
          for (const p of candidatePaths) {
            if (fs.existsSync(p)) {
              filePath = p;
              break;
            }
          }

          let data = {};
          if (fs.existsSync(filePath)) {
            try {
              data = JSON.parse(fs.readFileSync(filePath, "utf8"));
            } catch {
              data = {};
            }
          }

          const hist = data?.[guildId]?.[userId];

          if (action === "cd_history") {
            if (!hist) {
              return interaction.reply({
                content:
                  "❌ Não achei histórico desse usuário.\n" +
                  `📄 Caminho lido: \`${filePath}\``,
                ephemeral: true,
              });
            }

            const ultimos = (hist.channels ?? [])
              .slice(0, 10)
              .map(
                (c, i) =>
                  `**${i + 1}.** \`${c.name}\` (${c.type}) — ${
                    c.at ? `<t:${Math.floor(new Date(c.at).getTime() / 1000)}:R>` : ""
                  }`
              )
              .join("\n");

            return interaction.reply({
              content:
                `📂 **Histórico de deleções**\n` +
                `Usuário: <@${userId}>\n` +
                `Total: **${hist.total ?? 0}**\n\n` +
                (ultimos || "*Sem itens*") +
                `\n\n📄 Store: \`${filePath}\``,
              ephemeral: true,
            });
          }

          if (action === "cd_restore") {
            if (!hist) {
              return interaction.reply({
                content:
                  "❌ Não achei histórico desse usuário (store não tem esse ID).\n" +
                  `📄 Caminho lido: \`${filePath}\``,
                ephemeral: true,
              });
            }

            if (!hist?.lastPunishment) {
              return interaction.reply({
                content:
                  "❌ Esse usuário até tem histórico, mas não tem snapshot de punição (lastPunishment).\n" +
                  `📄 Caminho lido: \`${filePath}\``,
                ephemeral: true,
              });
            }

            if (!hist?.lastPunishment?.rolesBeforeIds?.length) {
              return interaction.reply({
                content:
                  "❌ Sem dados de cargos anteriores pra restaurar.\n" +
                  "Isso acontece se o usuário NÃO tinha cargos antes (só @everyone) OU se teu store está diferente.\n" +
                  `📄 Caminho lido: \`${filePath}\``,
                ephemeral: true,
              });
            }

            if (!interaction.memberPermissions?.has("ManageRoles")) {
              return interaction.reply({ content: "🚫 Você não tem permissão pra restaurar cargos.", ephemeral: true });
            }

            const member = await interaction.guild.members.fetch(userId).catch(() => null);
            if (!member) {
              return interaction.reply({ content: "❌ Usuário não encontrado no servidor.", ephemeral: true });
            }

            const botMember = await interaction.guild.members.fetchMe();
            const canManage = botMember.permissions.has("ManageRoles");
            const above = botMember.roles.highest.comparePositionTo(member.roles.highest) > 0;

            if (!canManage || !above) {
              return interaction.reply({
                content: "🚫 O bot não consegue restaurar cargos desse usuário (sem permissão ou cargo abaixo).",
                ephemeral: true,
              });
            }

            const rolesToAdd = hist.lastPunishment.rolesBeforeIds
              .map((rid) => interaction.guild.roles.cache.get(rid))
              .filter((r) => r && r.editable);

            try {
              if (rolesToAdd.length > 0) await member.roles.add(rolesToAdd);

              return interaction.reply({
                content:
                  `✅ Restaurei **${rolesToAdd.length}** cargos do usuário **${member.user.tag}**.\n` +
                  `📄 Store: \`${filePath}\``,
                ephemeral: true,
              });
            } catch (e) {
              return interaction.reply({
                content: `❌ Erro ao restaurar cargos: \`${e?.message ?? e}\``,
                ephemeral: true,
              });
            }
          }
        }
      }


      // Entrevista (botões)
      const handledEntrevista = await entrevista.handleButtons(interaction).catch(() => false);
      if (handledEntrevista) return;

      // Tickets
      const handledTickets = await entrevistasTickets.onInteractionCreate(interaction).catch(() => false);
      if (handledTickets) return;

      // Handler final
      await interactionCreateHandler.execute(interaction);
    } catch (error) {
      console.error("Erro ao processar interactionCreate:", error);
    }
  });

  // =================================================
  // ready (bootstrap geral)
  // =================================================
  client.once("ready", async () => {

    // ✅ PRIORIDADE MÁXIMA: AutoJoin Voice (Fixo na call)
    try { iniciarAutoJoin(client); } catch {}

// 🔥 INICIA O REMINDER AQUI
  try {
    await reminderOnReady(client);
  } catch (e) {
    console.warn("⚠️ Falha ao iniciar Reminder:", e);
  }


// ✅ 1) FACs primeiro (cria __FACS_ONEBTN_BRIDGE__)
try {
  await facsSemanaisOnReady(client);
  await facsComparativoOnReady(client);

  // console.log("✅ [FACS] Semanais pronto");
} catch (e) {
  console.warn("⚠️ [FACS] Falha no facsSemanaisOnReady:", e);
}

// ✅ 1.1) Confirmação de Presença (Lê do FACs)
try {
  await confirmacaoPresencaOnReady(client);
} catch (e) {
  console.warn("⚠️ [PRESENCA] Falha no confirmacaoPresencaOnReady:", e);
}

//dashboard managers

await graficoManagersOnReady(client);
// ✅ 2) Registro Manager depois (vai usar o bridge)
try {
  await registroManagerOnReady(client);
  // console.log("✅ [RM] Registro Manager pronto");
} catch (e) {
  console.warn("⚠️ [RM] Falha no registroManagerOnReady:", e);
}

// ✅ VENDAS — garante painel fixo no boot
try {
  await registroVendasOnReady(client);
} catch (e) {
  console.warn("⚠️ [VENDAS] onReady:", e);
}

// ✅ EVT3 — garante botão "Criar Evento" no canal
try { await evt3EventsOnReady(client); } catch (e) { console.warn("⚠️ [EVT3] OnReady:", e); }


  // ✅ PRIMEIRO: ligar debug/hub pra não perder eventos
  try { dashDebugOnReady(client); } catch {}
  try { await dashRouterOnReady(client); } catch {}



  // ✅ PAY+EVT DASH — AQUI (pra você ter certeza que rodou no ready certo)
  try {
    console.log("🚀 [PAY_EVT_DASH] chamando payEvtDashOnReady...");
    await payEvtDashOnReady(client);
    console.log("✅ [PAY_EVT_DASH] payEvtDashOnReady OK");
  } catch (e) {
    console.warn("⚠️ [PAY_EVT_DASH] payEvtDashOnReady falhou:", e);
  }


  // ✅ 3) Dashboard ORGs (depois que RM e FACs já tão ok)

  // ✅ GeralDash posta / atualiza (gráfico + escala + hub)
  try {
    if (typeof geralDash?.geralDashOnReady === "function") {
      await geralDash.geralDashOnReady(client);
    } else {
      console.warn("⚠️ scGeralDash.js não exporta geralDashOnReady");
    }
  } catch (e) {
    console.warn("⚠️ geralDashOnReady:", e);
  }

  // ✅ Weekly Ranking (novo) — NÃO interfere no GeralDash
  try {
    await geralWeeklyRankOnReady(client);
    // console.log("✅ [WEEKLY_RANK] pronto");
  } catch (e) {
    console.warn("⚠️ [WEEKLY_RANK] onReady:", e);
  }

  console.log(`✅ Bot pronto como ${client.user.tag}`);
  console.log(`🌍 Estou conectado em ${client.guilds.cache.size} servidores:`);
  client.guilds.cache.forEach((g) => console.log(` - ${g.name} (ID: ${g.id})`));

  client.user.setActivity("Cauã Macedo – SantaCreators ✨", { type: ActivityType.Watching });






    

    // Proteção leve (perms)
    try { await roleProtectOnReady(client); } catch {}

    // Sistemas por ready
    try { await formsCreatorOnReady(client); } catch {}
    try { await doacaoOnReady(client); } catch {}
    try { await pedirSetOnReady(client); } catch {}
    try { await setStaffOnReady(client); } catch {}
    try { await connectStatusOnReady(client); } catch {}
    try { await alinhamentosOnReady(client); } catch {}
    try { await vipEventoOnReady(client); } catch {}
    try { await lideresConvitesOnReady(client); } catch {}
    try { await setStaffV2OnReady(client); } catch {}
    // ✅ Blacklist Eventos
    try { await blacklistEventosOnReady(client); } catch {}

    // ✅ Hall da Fama & Eventos Diários
    try { await hallDaFamaOnReady(client); } catch (e) { console.warn("⚠️ HallDaFama:", e); }
    try { await eventosDiariosOnReady(client); } catch (e) { console.warn("⚠️ EventosDiarios:", e); }

    // ✅ Cadastro Manual (Setar Cargo)
    try { await cadastroManualOnReady(client); } catch {}

    // ✅ Recrutamento Dash (Inicia o painel e listeners)
    try { await recrutamentoDashOnReady(client); } catch (e) { console.warn("⚠️ RecrutamentoDash:", e); }

    // ✅ Monitoramento de Cargos (Inicia painel e scheduler)
    try { await monitorCargosOnReady(client); } catch (e) { console.warn("⚠️ MonitorCargos:", e); }

    // ✅ Cronograma Creators (Atualiza datas no boot)
    try { await cronogramaCreatorsOnReady(client); } catch (e) { console.warn("⚠️ CronogramaCreators:", e); }

    // ✅ Hierarquia Divisões (Painel)
    try { await hierarquiaOnReady(client); } catch (e) { console.warn("⚠️ HierarquiaDivisoes:", e); }

  
    // ✅ NOVO: Inicializa cache de convites
    memberJoinLog.initInviteCache(client);


    // console.log("✅ [GRAFICO_MANAGERS] instalado ✅");

    // Registros/auto
    try { iniciarRegistroPoderes(client); } catch {}
    try { iniciarRegistroEvento(client); } catch {}

    // Lembretes + Monitor
    try { startTodosLembretes(client); } catch {}
    try { startRolesOnlineMonitor(client); } catch {}

    // Pagamento social
    try {
      await pagamentoSocialOnReady(client);
      // console.log("✅ pagamento social pronto / menu verificado");
    } catch (e) {
      console.warn("⚠️ falha no pagamentoSocialOnReady:", e);
    }

    // Entrevistas: reanexa
    try {
      await entrevista.reanexar(client);
      // console.log("✅ entrevistas reanexadas");
    } catch (e) {
      console.warn("⚠️ falha ao reanexar entrevistas:", e);
    }

    // Tickets: reanexa / garante menu
    try {
      await entrevistasTickets.onReady();
      // console.log("✅ tickets reanexados / menu verificado");
    } catch (e) {
      console.warn("⚠️ falha no onReady de tickets:", e);
    }

    // console.log("👂 listeners:", {
    //   interactionCreate: client.listenerCount("interactionCreate"),
    //   messageCreate: client.listenerCount("messageCreate"),
    //   guildMemberAdd: client.listenerCount("guildMemberAdd"),
    //   guildMemberRemove: client.listenerCount("guildMemberRemove"),
    //   ready: client.listenerCount("ready"),
    // });
  });

  // =================================================
  // setups de logs (são setups, não listeners duplicados)
  // =================================================
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

  // =================================================
  // Late-wire (se por algum motivo já estiver pronto)
  // =================================================
  if (client.isReady()) {
    entrevista
      .reanexar(client)
      .then(() => {}) // console.log("✅ entrevistas reanexadas (late-wire)"))
      .catch((e) => console.warn("⚠️ falha ao reanexar (late-wire):", e));

    // console.log(`✅ Bot já estava pronto como ${client.user.tag} (late-wire)`);
    client.user.setActivity("Cauã Macedo – SantaCreators ✨", { type: ActivityType.Watching });

    try { iniciarRegistroPoderes(client); } catch {}
    try { iniciarRegistroEvento(client); } catch {}
    try { iniciarAutoJoin(client); } catch {}
    try { startTodosLembretes(client); } catch {}

    // console.log("👂 listeners:", {
    //   interactionCreate: client.listenerCount("interactionCreate"),
    //   messageCreate: client.listenerCount("messageCreate"),
    //   guildMemberAdd: client.listenerCount("guildMemberAdd"),
    //   guildMemberRemove: client.listenerCount("guildMemberRemove"),
    //   ready: client.listenerCount("ready"),
    // });
  }
};

// =====================================================
// 12) Init do bot (ordem correta: handlers -> módulos -> login)
// =====================================================
const initBot = async () => {
  try {
    // console.log("Iniciando o bot...");
    loadRegistros();

    // 1) liga o roteador (ele limpa listeners antigos)
    setupEventHandlers();

    // 2) registra módulos que “bootam” fora do ready (não serão “limpos” depois)
    setupBatePonto(client);
    setupAlinhamentoDash(client);

    // ✅ GESTAOINFLUENCER (Carrega módulo sem modificar código original)
    await import('./events/gestaoinfluencer.js');

  


    // 3) login
    if (!client.__loggedIn) {
      client.__loggedIn = true;
      await client.login(BOT_TOKEN).catch((e) => {
        console.error("Erro ao fazer login no bot:", e);
        process.exit(1);
      });
    }

    // console.log(`Logado como ${client.user.tag}!`);

    // =================================================
    // Slash command: /disconnect
    // =================================================
    try {
      const data = [
        new SlashCommandBuilder()
          .setName("disconnect")
          .setDescription("Expulsa um usuário da call de voz")
          .addUserOption((option) =>
            option.setName("user").setDescription("Usuário a ser desconectado").setRequired(true)
          )
          .toJSON(),
      ];

      await client.application.commands.set(data);
      // console.log("[COMANDO] /disconnect registrado com sucesso.");
    } catch (e) {
      console.warn("⚠️ Falha ao registrar /disconnect:", e);
    }

    // =================================================
    // Botão “Enviar meu nome” — autocorreção a cada 15min
    // =================================================
    const CANAL_BOTAO = "1383152873587740843";
    const GIF_BANNER =
      "https://media.discordapp.net/attachments/1362477839944777889/1384245215249825832/standard_2rss.gif?ex=6851ba51&is=685068d1&hm=f9bc6625fe3830c7277102ebdef16418fef02cb01a6a4addc611fd55ebe54643&=&width=515&height=66";

    async function enviarMensagemComBotaoNome(canal) {
      const embed = new EmbedBuilder()
        .setTitle("📌 | Identifique-se - SantaCreators")
        .setDescription(
          "Clique no botão abaixo para enviar seu **nome**. Seu apelido será atualizado e o cargo de acesso será setado automaticamente."
        )
        .setColor("#ff009a")
        .setImage(GIF_BANNER);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("setar_nome").setLabel("✍️ Enviar meu nome").setStyle(ButtonStyle.Primary)
      );

      await safeSend(canal, { embeds: [embed], components: [row] });
    }

    let canalBotaoNome = null;

    setInterval(async () => {
      try {
        if (!client.isReady()) return;

        if (!canalBotaoNome) canalBotaoNome = await getChannel(client, CANAL_BOTAO).catch(() => null);
        if (!canalBotaoNome || !canalBotaoNome.isTextBased()) return;

        const mensagens = await canalBotaoNome.messages.fetch({ limit: 10 }).catch(() => null);
        if (!mensagens) return;

        const mensagensBotao = mensagens.filter(
          (msg) =>
            msg.author.id === client.user.id &&
            Array.isArray(msg.components) &&
            msg.components.length > 0 &&
            msg.components[0]?.components?.some((comp) => comp.customId === "setar_nome")
        );

        if (mensagensBotao.size > 1) {
          const extras = [...mensagensBotao.values()].slice(1);
          for (const msg of extras) await msg.delete().catch(() => {});
        }

        if (mensagensBotao.size === 0) {
          await enviarMensagemComBotaoNome(canalBotaoNome);
        }
      } catch (err) {
        console.error("Erro ao atualizar botão de nome:", err);
      }
    }, 15 * 60 * 1000);
  } catch (error) {
    console.error("Erro ao iniciar o bot:", error);
  }
};

initBot();
