import entrevista from '../utils/entrevista.js';
import { registroVendasOnReady } from './registroVendas.js';

export default {
  name: 'ready',
  run: async (client) => {
    console.log(`\n✅ [DIAGNOSTICO] O BOT ESTÁ RODANDO A VERSÃO ATUALIZADA! (${new Date().toLocaleString()})\n`);
    await entrevista.reanexar(client);
    await registroVendasOnReady(client);
  }
};
