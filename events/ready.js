import entrevista from '../utils/entrevista.js';
import { registroVendasOnReady } from './registroVendas.js';
import { installBotGuardian } from './botGuardian.js';
import { vipRegistroOnReady } from './vipRegistro.js';
import { ausenciasOnReady } from './ausencias.js';
import { registroPoderesEventosOnReady } from './registroPoderesEventos.js';
import { focoSemanaisOnReady } from './focoSemanais.js';
import { provasAdvOnReady } from './provasAdv.js';
import { blacklistFacsOnReady } from './blacklistFacs.js';

import { geralDashOnReady } from './scGeralDash.js';
import { geralWeeklyRankOnReady } from './scGeralWeeklyRanking.js';
import { formsCreatorOnReady } from './formscreator.js';
import { doacaoOnReady } from './doacao.js';
import { eventosDiariosOnReady } from './eventosDiarios.js';
import { monitorCargosOnReady } from './monitorCargos.js';
import { cronogramaOnReady } from './cronograma.js';
import { hierarquiaOnReady } from './hierarquiaDivisoes.js';
import { lembretesPoderesOnReady } from './lembretesPoderes.js';
import { startRolesOnlineMonitor } from './rolesOnlineMonitor.js';
import { registroManagerOnReady } from './registroManager.js';
import { autoReactsFotosOnReady } from './autoReactsFotos.js';

export default {
  name: 'ready',
  run: async (client) => {
    console.log("🔥🔥🔥 READY.JS CERTO ESTÁ RODANDO 🔥🔥🔥");
    console.log(`\n✅ [DIAGNOSTICO] O BOT ESTÁ RODANDO A VERSÃO ATUALIZADA! (${new Date().toLocaleString()})\n`);

    globalThis.client = client;

    // ✅ TESTE FORÇADO DO AUTO REACT
    try {
      console.log("🟡 Tentando importar autoReactsFotos.js...");
      const mod = await import("./autoReactsFotos.js");

      if (mod.autoReactsFotosOnReady) {
        console.log("🟢 autoReactsFotosOnReady encontrada. Chamando agora...");
        await mod.autoReactsFotosOnReady(client);
        console.log("✅ autoReactsFotosOnReady executada com sucesso.");
      } else {
        console.log("❌ autoReactsFotosOnReady NÃO encontrada no módulo.");
      }
    } catch (err) {
      console.error("❌ Erro ao importar/executar autoReactsFotos.js:", err);
    }

    const startupTasks = [
      { name: 'Entrevistas', fn: () => entrevista.reanexar(client) },
      { name: 'Vendas', fn: () => registroVendasOnReady(client) },
      { name: 'VIP Registro', fn: () => vipRegistroOnReady(client) },
      { name: 'Ausências', fn: () => ausenciasOnReady(client) },
      { name: 'Poderes (Eventos)', fn: () => registroPoderesEventosOnReady(client) },
      { name: 'Foco Semanal', fn: () => focoSemanaisOnReady(client) },
      { name: 'Provas ADV', fn: () => provasAdvOnReady(client) },
      { name: 'Blacklist FACS', fn: () => blacklistFacsOnReady(client) },
      { name: 'GeralDash', fn: () => geralDashOnReady(client) },
      { name: 'WeeklyRank', fn: () => geralWeeklyRankOnReady(client) },
      { name: 'FormsCreator', fn: () => formsCreatorOnReady(client) },
      { name: 'Doação', fn: () => doacaoOnReady(client) },
      { name: 'Eventos Diários', fn: () => eventosDiariosOnReady(client) },
      { name: 'Monitor de Cargos', fn: () => monitorCargosOnReady(client) },
      { name: 'Cronograma', fn: () => cronogramaOnReady(client) },
      { name: 'Hierarquia', fn: () => hierarquiaOnReady(client) },
      { name: 'Lembretes Poderes', fn: () => lembretesPoderesOnReady(client) },
      { name: 'Monitor Online', fn: () => startRolesOnlineMonitor(client) },
      { name: 'Registro Manager', fn: () => registroManagerOnReady(client) },
    ];

    console.log(`[STARTUP] Disparando ${startupTasks.length} módulos em série...`);

    for (const task of startupTasks) {
      try {
        await task.fn();
        console.log(`[STARTUP] ✅ Módulo [${task.name}] inicializado.`);
        await new Promise(r => setTimeout(r, 1000));
      } catch (e) {
        console.error(`[STARTUP] ❌ Módulo [${task.name}] falhou:`, e);
      }
    }

    installBotGuardian(client);

    console.log(`\n✅ Bot pronto como ${client.user.tag}`);
  }
};
