import entrevista from '../utils/entrevista.js';
import { registroVendasOnReady } from './registroVendas.js';
import { vipRegistroOnReady } from './vipRegistro.js';
import { ausenciasOnReady } from './ausencias.js';
import { registroPoderesEventosOnReady } from './registroPoderesEventos.js';
import { focoSemanaisOnReady } from './focoSemanais.js';

export default {
  name: 'ready',
  run: async (client) => {
    console.log(`\n✅ [DIAGNOSTICO] O BOT ESTÁ RODANDO A VERSÃO ATUALIZADA! (${new Date().toLocaleString()})\n`);
    await entrevista.reanexar(client);
    await registroVendasOnReady(client);
    await vipRegistroOnReady(client);
    await ausenciasOnReady(client);
    await registroPoderesEventosOnReady(client);
    await focoSemanaisOnReady(client);
  }
};
