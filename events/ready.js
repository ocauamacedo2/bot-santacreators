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
import { iniciarAutoJoin } from './autojoinVoice.js';
import { iniciarRegistroPoderes } from './registropoderes.js';
import { iniciarRegistroEvento } from './registroevento.js';
import { pagamentoSocialOnReady } from './pagamentosocial.js';
import * as memberJoinLog from './logs/memberJoinLog.js';

export default {
  name: 'ready',
  run: async (client) => {
    console.log("🔥🔥🔥 READY.JS CERTO ESTÁ RODANDO 🔥🔥🔥");
    console.log(`\n✅ [DIAGNOSTICO] O BOT ESTÁ RODANDO A VERSÃO ATUALIZADA! (${new Date().toLocaleString()})\n`);

    globalThis.client = client;


    const startupTasks = [
      { name: 'Entrevistas', fn: () => entrevista.reanexar(client) },
      { name: 'AutoJoin', fn: () => iniciarAutoJoin(client) },
      { name: 'Registro Poderes', fn: () => iniciarRegistroPoderes(client) },
      { name: 'Registro Evento', fn: () => iniciarRegistroEvento(client) },
      { name: 'Pagamento Social', fn: () => pagamentoSocialOnReady(client) },
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
      { name: 'Auto React Fotos', fn: () => autoReactsFotosOnReady(client) },
      { name: 'Invite Cache', fn: () => memberJoinLog.initInviteCache(client) },
    ];

    console.log(`[STARTUP] Disparando ${startupTasks.length} módulos em série...`);

    for (const task of startupTasks) {
      try {
        await task.fn();
        console.log(`[STARTUP] ✅ Módulo [${task.name}] inicializado.`);
        await new Promise(r => setTimeout(r, 100)); // Delay reduzido para 100ms
      } catch (e) {
        console.error(`[STARTUP] ❌ Módulo [${task.name}] falhou:`, e);
      }
    }

    installBotGuardian(client);

    console.log(`\n✅ Bot pronto como ${client.user.tag}`);
  }
};
