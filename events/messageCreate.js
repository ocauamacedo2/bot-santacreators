// events/messageCreate.js

import addCargo   from '../commands/admin/addcargo.js';
import remCargo   from '../commands/admin/remcargo.js';
import removercargo from '../commands/admin/removercargo.js';
import castigo    from '../commands/admin/castigo.js';
import ban        from '../commands/admin/ban.js';
import kick       from '../commands/admin/kick.js';
import copycargo  from '../commands/admin/copycargo.js';
import perguntas from '../commands/admin/perguntas.js';
import perfildc from '../commands/admin/perfildc.js';

import ping       from '../commands/admin/ping.js';
import duplicados from '../commands/admin/duplicados.js';
import cargosvazios from '../commands/admin/cargosvazios.js';
import clear      from '../commands/admin/clear.js';
import comandos   from '../commands/admin/comandos.js';
import addemoji   from '../commands/admin/addemoji.js';
import joincall   from '../commands/admin/joincall.js';
import grupo      from '../commands/admin/grupo.js';
import say        from '../commands/admin/say.js';
import salvar     from '../commands/salvar.js';
import meuscargos from '../commands/meuscargos.js';
import { registroVendasHandleMessage } from './registroVendas.js';
import { sortChannelsHandleMessage } from '../commands/canais/sortChannels.js';
import { vipRegistroHandleMessage } from './vipRegistro.js';
import { ausenciasHandleMessage } from './ausencias.js';

// Novos comandos de permissão
// import editarperm from '../commands/canais/editarperm.js';
import remperm    from '../commands/canais/remperm.js';

// 🔻 removido: setstaff (não usado)
// import setstaff from '../commands/admin/setstaff.js';

// 🔻 removido: msgauto (arquivo deletado)
// import msgauto    from '../commands/admin/msgauto.js';

const commands = {
  // mapeados
  addcargo: addCargo,
  remcargo: remCargo,
  removercargo,
  duplicados,
  cargosvazios,
 
  perguntas,

  // comandos ativos
  clear,
  joincall,
  grupo,
  comandos,
  addemoji,
  say,
  copycargo,
  castigo,
  ban,
  kick,
  salvarform: salvar,
  salvaralerta: salvar,
  salvardoc: salvar,
  salvarideia: salvar,
  meuscargos,
  perfildc,

  // permissões de canal
  // editarperm,
  remperm,

  // opcional: se ainda usa
  ping,
};

export default {
  name: 'messageCreate',
  async execute(message, _args, client) {
    if (message.author.bot) return;

    // ✅ VIP/Rolepass (Comando !vipmenu)
    if (await vipRegistroHandleMessage(message, client)) return;

    // ✅ Ausências (Comando !ausenciasmenu)
    if (await ausenciasHandleMessage(message, client)) return;

    // ✅ VENDAS (Comando !painelvendas)
    if (await registroVendasHandleMessage(message, client)) return;

    // ✅ CANAIS (Sort / Inativo / Membros)
    if (await sortChannelsHandleMessage(message, client)) return;

    if (!message.content.startsWith('!')) return;

    // parse robusto: "!cmd arg1 arg2..."
    const parts = message.content.slice(1).trim().split(/\s+/);
    const commandName = (parts.shift() || '').toLowerCase();
    const args = parts;

    const command = commands[commandName];
    if (!command) return; // comando não existe

    try {
      // se seu comando tiver um hasPermission opcional, respeita
      const ok = command.hasPermission ? await command.hasPermission(message) : true;
      if (!ok) return;

      await command.execute(message, args, client);
    } catch (err) {
      console.error(`Erro no comando !${commandName}:`, err);
      try { await message.reply('❌ Deu erro ao executar esse comando.'); } catch {}
    }

    // apaga a mensagem do comando após 5s (se possível)
    if (message.deletable) {
      setTimeout(async () => {
        try {
          await message.delete();
        } catch (err) {
          if (err?.code === 10008) {
            // console.warn(`Mensagem já deletada/inalcançável: ${err.message}`);
          } else {
            console.error(`Erro ao deletar mensagem do !${commandName}:`, err);
          }
        }
      }, 5000);
    }
  },
};

console.log('Comandos disponíveis:', Object.keys(commands));
