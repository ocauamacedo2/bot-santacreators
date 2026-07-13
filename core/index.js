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
import {
  client,
  enviarMensagemPrivadaSegura,
} from "./client.js";

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
import { installRoleGuardian } from "../commands/admin/remcargo.js";
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
import {
  pagamentoSocialOnReady,
  handlePagamentoSocial,
  pagamentoSocialHandleMessage,
  isPagamentoSocialInteraction,
} from "../events/pagamentosocial.js";

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

// FiveM Retention Status
import {
  fivemRetentionStatusOnReady,
  fivemRetentionStatusHandleInteraction,
  fivemRetentionStatusHandleMessage,
  fivemRetentionStatusOnChannelDelete,
} from "../events/fivemRetentionStatus.js";


///lembrete evenntos checklist 

import {
  eventosChecklistNotifierOnReady,
  eventosChecklistNotifierOnInteraction,
} from "../events/eventosChecklistNotifier.js";


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
  blacklistFacsOnReady,
  blacklistFacsHandleMessage,
  blacklistFacsHandleInteraction,
} from "./application/events/blacklistFacs.js";

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
  graficoManagersHandleMessage,
} from "../events/GraficoManagers.js";



/// Dashboard Managers Confirmar
import {
  graficoPresencaEventosOnReady,
  graficoPresencaEventosHandleInteraction,
} from "../events/GraficoPresencaEventos.js";
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
  cadastroManualHandleMessage,
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

// Meta Interna Semanal
import {
  metaInternaSemanalOnReady,
  metaInternaSemanalHandleMessage,
} from "../events/metaInternaSemanal.js";

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
import * as memberJoinLog from "../events/logs/memberJoinLog.js";
import { autoRoleOnJoin } from "../events/autoRoleOnJoin.js";

// Role Permission Guard
import { rolePermissionGuardHandleRoleUpdate } from "../events/rolePermissionGuard.js";

// Log Checklist
import {
  checklistOnReady,
  checklistHandleMessage,
  checklistHandleInteraction,
} from "../events/logChecklistSemanal.js";

// Role Sync Module
import { setupSyncCargos } from "../events/syncCargos.js";

// IA Auto Chat
import { setupIaChatAuto } from "../events/iaChatAuto.js";
import { setupAntiFloodProtector } from "../events/antiFloodProtector.js";
import setupProtecaoBotsDeletarCanais from "../events/protecaoBotsDeletarCanais.js";
import { installMessageGuardian } from "../events/messageGuardian.js";
import { installServerConfigGuardian } from "../events/serverConfigGuardian.js";
import { installOrgTicketAccessSync } from "../events/orgTicketAccessSync.js";
import { recriarTicketsHandleMessage } from "../events/ticketRecreator.js";

// Dashboard de entradas, saídas, retornos e banimentos
import {
  memberFlowDashboardOnReady,
  memberFlowHandleGuildMemberAdd,
  memberFlowHandleGuildMemberRemove,
  memberFlowHandleInteraction,
  memberFlowHandleMessage,
} from "../events/memberFlowDashboard.js";

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




// =====================================================
// Comando de diagnóstico das mensagens privadas
// =====================================================

async function testarMensagemPrivadaHandleMessage(message) {
  if (!message?.guild || !message?.author) return false;
  if (message.author.bot) return false;

  const conteudo = message.content?.trim() || "";

  if (!conteudo.toLowerCase().startsWith("!testarpv")) {
    return false;
  }

  /*
   * Segurança:
   * somente o proprietário configurado poderá testar qualquer usuário.
   *
   * Outras pessoas, caso o comando seja liberado futuramente,
   * somente conseguiriam testar o próprio privado.
   */
  const USUARIOS_AUTORIZADOS = new Set([
    "660311795327828008",
  ]);

  if (!USUARIOS_AUTORIZADOS.has(message.author.id)) {
    await message.reply({
      content: "🚫 Você não possui permissão para utilizar este diagnóstico.",
      allowedMentions: {
        repliedUser: false,
        parse: [],
      },
    });

    return true;
  }

  const argumentos = conteudo.split(/\s+/).slice(1);

  const idInformado =
    message.mentions.users.first()?.id ||
    argumentos
      .join(" ")
      .match(/\d{17,20}/)?.[0] ||
    message.author.id;

  const usuario = await client.users.fetch(idInformado, {
    force: true,
  }).catch(erro => {
    console.error("[TESTAR PV] Não foi possível localizar o usuário.", {
      usuarioId: idInformado,
      codigo: erro?.code ?? "SEM_CODIGO",
      mensagem: erro?.message || String(erro),
    });

    return null;
  });

  if (!usuario) {
    await message.reply({
      content:
        `❌ Não consegui localizar o usuário de ID \`${idInformado}\`.\n\n` +
        "Confira se o ID foi informado corretamente.",
      allowedMentions: {
        repliedUser: false,
        parse: [],
      },
    });

    return true;
  }

  const resultado = await enviarMensagemPrivadaSegura(
    usuario,
    {
      content:
        `✅ **Teste de mensagem privada realizado com sucesso!**\n\n` +
        `🤖 Bot conectado: **${client.user?.tag || client.user?.username || "Desconhecido"}**\n` +
        `🆔 ID do bot: \`${client.user?.id || "Desconhecido"}\`\n` +
        `📅 Testado em: <t:${Math.floor(Date.now() / 1000)}:F>\n\n` +
        "Se você recebeu esta mensagem, o sistema de mensagens privadas está funcionando para sua conta.",
    },
    `COMANDO_TESTAR_PV:${message.author.id}`
  );

  if (resultado.sucesso) {
    await message.reply({
      content:
        `✅ Mensagem privada enviada com sucesso para ` +
        `<@${usuario.id}>.\n\n` +
        `🤖 Bot utilizado: **${client.user?.tag || client.user?.username}**\n` +
        `🆔 ID do bot: \`${client.user?.id}\``,
      allowedMentions: {
        repliedUser: false,
        users: [usuario.id],
      },
    });

    return true;
  }

  if (resultado.codigo === 50007) {
    await message.reply({
      content:
        `⚠️ O Discord recusou a mensagem privada para <@${usuario.id}>.\n\n` +
        `**Código:** \`50007\`\n` +
        `**Resposta:** \`${resultado.mensagem || "Cannot send messages to this user"}\`\n\n` +
        "Isso significa que o código executou corretamente, mas o Discord não autorizou o bot novo a enviar a mensagem para essa pessoa.\n\n" +
        "A pessoa deverá:\n" +
        "1. Abrir as configurações de privacidade do servidor;\n" +
        "2. Ativar mensagens diretas de membros do servidor;\n" +
        "3. Verificar se bloqueou o bot novo;\n" +
        "4. Tentar abrir o perfil do bot e enviar uma mensagem primeiro.",
      allowedMentions: {
        repliedUser: false,
        users: [usuario.id],
      },
    });

    return true;
  }

  await message.reply({
    content:
      `❌ O teste de mensagem privada falhou para <@${usuario.id}>.\n\n` +
      `**Código:** \`${resultado.codigo ?? "SEM_CODIGO"}\`\n` +
      `**Status:** \`${resultado.status}\`\n` +
      `**Erro:** \`${resultado.mensagem || "Erro desconhecido"}\`\n\n` +
      "O erro completo também foi registrado no console da hospedagem.",
    allowedMentions: {
      repliedUser: false,
      users: [usuario.id],
    },
  });

  return true;
}
// =====================================================
// Setup Handlers
// =====================================================
const setupEventHandlers = () => {
  if (client.__handlersWired) return;
  client.__handlersWired = true;

  setupSyncCargos(client);
  installRoleGuardian(client);
  installOrgTicketAccessSync(client);
  setupSortChannels(client);
  setupTicketRenamer(client);
  setupIaChatAuto(client);
  setupProtecaoBotsDeletarCanais(client);
  setupAntiFloodProtector(client);
  installMessageGuardian(client);
  installServerConfigGuardian(client);

  // ✅ PRIORIDADE MÁXIMA: registra o listener do botão/modal de poderes cedo.
  // Sem isso, durante o boot pesado o botão existe, mas o handler ainda não foi instalado,
  // causando "Esta interação falhou".
  try {
    iniciarRegistroPoderes(client);
  } catch (e) {
    console.error("[CORE] Erro ao iniciar Registro de Poderes com prioridade:", e);
  }

  try {
    iniciarRegistroEvento(client);
  } catch (e) {
    console.error("[CORE] Erro ao iniciar Registro Evento com prioridade:", e);
  }

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
      await channelDeleteProtectLog.execute(c, client);
    } catch (e) {}
    try {
      reminderHandleChannelDelete(c);
    } catch (e) {}
    try {
      connectStatusOnChannelDelete(c);
    } catch (e) {}
    try {
      fivemRetentionStatusOnChannelDelete(c);
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

      // --- ROTEADOR RÁPIDO DE COMANDOS (AUDITORIA DE PERFORMANCE) ---
      const content = message.content || "";
const prefix = "!";
const isCommand = content.startsWith(prefix);

if (isCommand) {
  const args = content.slice(prefix.length).trim().split(/\s+/);
  const cmd = args.shift().toLowerCase();

  // ✅ Diagnóstico de mensagens privadas deve executar antes do roteador central.
  if (await testarMensagemPrivadaHandleMessage(message)) return;

  // ✅ FiveM Retention precisa vir antes do roteador central,
  // porque é um comando direto do módulo e não estava sendo chamado.
  if (await fivemRetentionStatusHandleMessage(message, client)) return;

        // ✅ Cadastro Manual: comando !semwl precisa passar antes do roteador central
        if (await cadastroManualHandleMessage(message, client)) return;

        // ✅ Dashboard de membros: comandos precisam passar antes do roteador central
        if (await memberFlowHandleMessage(message, client)) return;

// ✅ Dashboard ORGs — Managers
// Comandos: !graficomanagers, !gm, !recriargm, !recriargraficomanagers
// Precisa vir ANTES do roteador central para não ser engolido por outro handler.
if (await graficoManagersHandleMessage(message, client)) return;

// ✅ Doações SantaCreators
// Comandos: !doacao e !desligardoacao
// Precisa executar ANTES do roteador central, porque o roteador pode encerrar
// o processamento antes que o módulo de doações receba o comando.
if (await doacaoHandleMessage(message, client)) return;

// ✅ Dashboard de pagamentos e registros SantaCreators
// Comandos: !pevdash, !pevdashrefresh, !pevdashforce,
// !criarsocial, !socialrefresh, !criardashsocial,
// !dashboard e !recriardashboard
// Precisa executar ANTES do roteador central para não ser engolido.
if (await payEvtDashHandleMessage(message, client)) return;

// 🚀 ROTEADOR CENTRALIZADO: Tenta executar via messageCreateHandler primeiro.
// Se o handler retornar true, significa que o comando foi processado e paramos aqui.
if (await messageCreateHandler.execute(message, args, client)) return;

// Fallback para handlers que ainda não foram movidos para o mapeamento central
if (cmd === "correcao") { if (await handleCorrecao(message, client)) return; }
        if (cmd === "clear" || cmd === "clearbotao") { if (await clearHandleMessage(message, client)) return; }
        if (cmd === "remover") { if (await removerMassivoHandleMessage(message, client)) return; }
        if (cmd === "criarcargo") { if (await criarCargoHandleMessage(message, client)) return; }
        if (cmd === "verid") { if (await verIdHandleMessage(message, client)) return; }
        if (cmd === "removerperm") { if (await removerPermHandleMessage(message, client)) return; }
        if (cmd === "duplicarperm") { if (await duplicarPermHandleMessage(message, client)) return; }

        // 🚀 Fallbacks para comandos de módulos (estavam fora do roteador e não funcionavam)
if (await aulaoHandleMessage(message, client)) return;
if (await pedirSetHandleMessage(message, client)) return;
if (await cronogramaCreatorsHandleMessage(message, client)) return;
if (await ausenciasHandleMessage(message, client)) return;
if (await hierarquiaHandleMessage(message, client)) return;
if (await reuniaoSemanalHandleMessage(message, client)) return;
if (await pagamentoSocialHandleMessage(message, client)) return;
if (await metaInternaSemanalHandleMessage(message, client)) return;
if (await geralDash.geralDashHandleMessage(message, client)) return;
if (await geralWeeklyRankHandleMessage(message, client)) return;

// ✅ Auto React precisa receber comandos como !reagirsc eventos 1000
if (await autoReactsFotosHandleMessage(message, client)) return;

// ✅ FormsCreator precisa receber comandos como !formscreator, !syncforms, !testpublic, !testdm e !testrunreminder
if (await formsCreatorHandleMessage(message, client)) return;

// ✅ Checklist Semanal de Logs
// Comando: !checklogs
if (await checklistHandleMessage(message, client)) return;
        // ✅ Recriador de tickets antigos do bot anterior
// Comando: !recriar ID_DA_CATEGORIA_OU_CANAL
if (await recriarTicketsHandleMessage(message, client, Transcript)) return;
        // Se chegou aqui sendo um comando, mas não foi tratado, não precisamos continuar nos listeners de texto
        return;
      }
      if (await facsComparativoHandleMessage(message, client)) return;
      if (await dashRouterHandleMessage(message)) return;
      if (await facsSemanaisHandleMessage(message, client)) return;
      if (await evt3EventsHandleMessage(message, client)) return;
      if (await recrutamentoDashHandleMessage(message, client)) return;
      if (await registroManagerHandleMessage(message, client)) return;
      if (await registroVendasHandleMessage(message, client)) return;
      if (await apagarChatHandleMessage(message, client)) return;
      if (await verPermsHandleMessage(message)) return;
      if (await editarPermHandleMessage(message, client)) return;

      if (await alinhamentosHandleMessage(message, client)) return;
      await formsCreatorHandleMessage(message, client);
      if (await setStaffV2HandleMessage(message, client)) return;
      if (await doacaoHandleMessage(message, client)) return;
      if (await vipEventoHandleMessage(message, client)) return;
      if (await vipRegistroHandleMessage(message, client)) return;

      await entrevistasTickets.onMessageCreate(message);

      if (!isCommand) {
        await messageCreateHandler.execute(message, [], client);
      }
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
      await memberFlowHandleGuildMemberAdd(m);
    } catch (e) {
      console.error("[CORE] erro em memberFlowHandleGuildMemberAdd:", e);
    }

    try {
      await autoRoleOnJoin(m);
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
      await memberJoinLog.execute(m, client);
    } catch (e) {}
  });

  client.on("guildMemberRemove", async (m) => {
    try {
      await memberFlowHandleGuildMemberRemove(m);
    } catch (e) {
      console.error("[CORE] erro em memberFlowHandleGuildMemberRemove:", e);
    }

    try {
      await saidaHandler.execute(m);
    } catch (e) {}
  });

  client.on("inviteCreate", (i) => memberJoinLog.handleInviteCreate(i));
  client.on("inviteDelete", (i) => memberJoinLog.handleInviteDelete(i));

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
      await rolePermissionGuardHandleRoleUpdate(oldRole, newRole, client);
    } catch (error) {
      console.error("[CORE] erro em rolePermissionGuardHandleRoleUpdate:", error);
    }
  });

client.on("interactionCreate", async (interaction) => {
  if (interaction.isAutocomplete()) return;

  try {
    // =====================================================
    // 🚀 ROTEAMENTO DIRETO — PAGAMENTO SOCIAL
    // =====================================================
    // Quando o customId pertence ao Pagamento Social,
    // chama somente o handler correto e encerra o roteador.
    //
    // Isso impede o clique de passar primeiro por Checklist,
    // Dashboard de membros e dezenas de outros sistemas.
    if (isPagamentoSocialInteraction(interaction)) {
      await handlePagamentoSocial(interaction, client).catch((error) => {
        console.error("[CORE] Erro no Pagamento Social:", error);
        return false;
      });

      return;
    }


    if (await eventosChecklistNotifierOnInteraction(interaction, client)) return;

    // ✅ Dashboard de membros: botões e modal do histórico mensal
    if (await memberFlowHandleInteraction(interaction, client)) return;


    // 🚀 PRIORIDADE MÁXIMA: Botões de Ticket e Entrevista
    if (await entrevista.handleButtons(interaction).catch((err) => {
      console.error("[CORE] Erro crítico em entrevista.handleButtons:", err);
      return false;
    })) return;


    if (
      await entrevistasTickets
        .onInteractionCreate(interaction)
        .catch(() => false)
    ) return;

      // Outros handlers...
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
      const handledRetention = await fivemRetentionStatusHandleInteraction(interaction, client);
      if (handledRetention) return;

      if (await alinhamentosHandleInteraction(interaction, client)) return;
      if (await setStaffV2HandleInteraction(interaction, client)) return;
      if (await graficoManagersHandleInteraction(interaction, client)) return;
      if (await graficoPresencaEventosHandleInteraction(interaction, client)) return;
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

      await interactionCreateHandler.execute(interaction);
    } catch (error) {
      console.error("Erro interactionCreate:", error);
    }
  });

client.once("ready", async () => {
  if (client.__coreBootState.readyBootExecuted) return;
  client.__coreBootState.readyBootExecuted = true;

  // 🚀 PRIORIDADE MÁXIMA: Entrar na call antes de carregar módulos pesados
  try {
    console.log("[CORE] PRIORIDADE MÁXIMA: Iniciando AutoJoin.");
    iniciarAutoJoin(client);
  } catch (e) {
    console.error("[CORE] Erro AutoJoin:", e);
  }

  try {
    console.log("[CORE] PRIORIDADE: iniciando FiveM Retention Status.");
    await fivemRetentionStatusOnReady(client);
    console.log("[CORE] FiveM Retention Status iniciado com prioridade.");
  } catch (e) {
    console.error("[FIVEM_RETENTION] Falha ao iniciar com prioridade no Ready:", e);
  }

  try {
    console.log("[CORE] PRIORIDADE: iniciando Dashboard de Membros.");
    await memberFlowDashboardOnReady(client);
    console.log("[CORE] Dashboard de Membros iniciado.");
  } catch (e) {
    console.error("[MEMBER_FLOW] Falha ao iniciar no Ready:", e);
  }

  try {
    console.log("[CORE] PRIORIDADE: iniciando GeralDash + Ranking.");
    if (typeof geralDash?.geralDashOnReady === "function" && !client.__SC_GERAL_DASH_READY_RAN_V3__) {
      await geralDash.geralDashOnReady(client);
    }
    await geralWeeklyRankOnReady(client);
    console.log("[CORE] GeralDash + Ranking iniciados com prioridade.");
  } catch (e) {
    console.error("[BOOT] Erro ao iniciar GeralDash/Ranking com prioridade:", e);
  }

  try {
    console.log("[CORE] PRIORIDADE: iniciando Hall da Fama + rankings.");
    await hallDaFamaOnReady(client);
    console.log("[CORE] Hall da Fama + rankings iniciados com prioridade.");
  } catch (e) {
    console.error("[BOOT] Erro ao iniciar Hall da Fama com prioridade:", e);
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
  console.log("[CORE] Iniciando FACs Semanais...");
  await facsSemanaisOnReady(client);

  if (typeof globalThis.__FACS_ONEBTN_BRIDGE__?.appendOrgToWeek !== "function") {
    console.error("[CORE] ❌ FACs Semanais iniciou, mas o BRIDGE NÃO foi instalado.");
  } else {
    console.log("[CORE] ✅ FACs Semanais bridge instalado.");
  }

  if (typeof globalThis.__FACS_SEMANAIS_SYNC_FROM_RM__ !== "function") {
    console.error("[CORE] ❌ FACs Semanais iniciou, mas o SYNC RM -> FACs NÃO foi instalado.");
  } else {
    console.log("[CORE] ✅ FACs Semanais sync RM -> FACs instalado.");
  }
} catch (e) {
  console.error("[CORE] ❌ Erro ao iniciar FACs Semanais:", e);
}

try {
  await facsComparativoOnReady(client);
} catch (e) {
  console.error("[CORE] ❌ Erro ao iniciar FACs Comparativo:", e);
}
    try {
      await confirmacaoPresencaOnReady(client);
    } catch (e) {}
    try {
      await graficoManagersOnReady(client);
      await graficoPresencaEventosOnReady(client);
    } catch (e) {}
    try {
      await registroManagerOnReady(client);
    } catch (e) {}
    try {
  await registroVendasOnReady(client);
} catch (e) {}

try {
  await metaInternaSemanalOnReady(client);
} catch (e) {
  console.error("[CORE] Erro ao iniciar Meta Interna Semanal:", e);
}

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
  eventosChecklistNotifierOnReady(client);
} catch (e) {
  console.error("[CORE] Erro ao iniciar eventosChecklistNotifier:", e);
}

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
      console.error("[CORE] Erro ao iniciar autoReactsFotos:", e);
    }

    try {
      memberJoinLog.initInviteCache(client);
    } catch (e) {}

    try {
      startTodosLembretes(client);
    } catch (e) {}
    try {
      startRolesOnlineMonitor(client);
    } catch (e) {}
    try {
      await pagamentoSocialOnReady(client);
    } catch (e) {}
    try {
      await entrevista.reanexar(client);
    } catch (e) {}
    try {
      await entrevistasTickets.onReady();
    } catch (e) {}
  });

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

  if (client.isReady() && !client.__coreBootState.lateBootExecuted) {
    client.__coreBootState.lateBootExecuted = true;

    entrevista.reanexar(client).catch(() => {});
    client.user.setActivity("Cauã Macedo – SantaCreators ✨", {
      type: ActivityType.Watching,
    });

    try {
      iniciarRegistroPoderes(client);
    } catch (e) {}
    try {
      iniciarRegistroEvento(client);
    } catch (e) {}
    try {
      iniciarAutoJoin(client);
    } catch (e) {
      console.error("[CORE] Erro AutoJoin (Late):", e);
    }
    try {
      eventosChecklistNotifierOnReady(client);
    } catch (e) {
      console.error("[CORE] Erro ao iniciar eventosChecklistNotifier no LateBoot:", e);
    }
    try {
      startTodosLembretes(client);
    } catch (e) {}
  }
};

// =====================================================
// INIT
// =====================================================
export const initBot = async () => {
  try {
    loadRegistros();
    setupEventHandlers();
    setupBatePonto(client);
    setupAlinhamentoDash(client);
   await import("../events/gestaoinfluencer.js");

    if (!client.__loggedIn) {
      client.__loggedIn = true;
      await client.login(BOT_TOKEN).catch((e) => {
        console.error("Erro ao fazer login no bot:", e);
        process.exit(1);
      });
    }

    try {
      const data = [
        new SlashCommandBuilder()
          .setName("disconnect")
          .setDescription("Expulsa um usuário da call de voz")
          .addUserOption((option) =>
            option
              .setName("user")
              .setDescription("Usuário a ser desconectado")
              .setRequired(true)
          )
          .toJSON(),
      ];

      await client.application.commands.set(data);
    } catch (e) {}

    const CANAL_BOTAO = "1383152873587740843";
    const GIF_BANNER =
      "https://media.discordapp.net/attachments/1362477839944777889/1384245215249825832/standard_2rss.gif";

    if (!globalThis.__SC_CORE_GUARDS__.setarNomeIntervalStarted) {
      globalThis.__SC_CORE_GUARDS__.setarNomeIntervalStarted = true;

      setInterval(async () => {
        try {
          if (!client.isReady()) return;

          const canal = await getChannel(client, CANAL_BOTAO).catch(() => null);
          if (!canal || !canal.isTextBased()) return;

          const mensagens = await canal.messages.fetch({ limit: 10 }).catch(() => null);
          if (!mensagens) return;

          const mensagensBotao = mensagens.filter(
            (msg) =>
              msg.author.id === client.user.id &&
              msg.components?.[0]?.components?.some((c) => c.customId === "setar_nome")
          );

          if (mensagensBotao.size > 1) {
            const extras = [...mensagensBotao.values()].slice(1);
            for (const msg of extras) {
              await msg.delete().catch(() => {});
            }
          }

          if (mensagensBotao.size === 0) {
            const embed = new EmbedBuilder()
              .setTitle("📌 | Identifique-se - SantaCreators")
              .setDescription("Clique no botão abaixo para enviar seu **nome**.")
              .setColor("#ff009a")
              .setImage(GIF_BANNER);

            const row = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId("setar_nome")
                .setLabel("✍️ Enviar meu nome")
                .setStyle(ButtonStyle.Primary)
            );

            await safeSend(canal, { embeds: [embed], components: [row] });
          }
        } catch (err) {}
      }, 15 * 60 * 1000);
    }
  } catch (error) {
    console.error("Erro ao iniciar o bot:", error);
  }
};