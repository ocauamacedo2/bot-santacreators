// events/messageCreate.js

import addCargo   from '../commands/admin/addcargo.js';
import remCargo   from '../commands/admin/remcargo.js';
import removercargo from '../commands/admin/removercargo.js';
import castigo    from '../commands/admin/castigo.js';
import ban        from '../commands/admin/ban.js';
import kick       from '../commands/admin/kick.js';
import copycargo  from '../commands/admin/copycargo.js';
import perguntas from '../commands/admin/perguntas.js';
import infoid from '../commands/admin/infoid.js';

import ping       from '../commands/admin/ping.js';
import duplicados from '../commands/admin/duplicados.js';
import cargosvazios from '../commands/admin/cargosvazios.js';
// import clear      from '../commands/admin/clear.js'; // Movido para handler
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
import { registroPoderesEventosHandleMessage } from './registroPoderesEventos.js';
import { provasAdvHandleMessage } from './provasAdv.js';
import { focoSemanaisHandleMessage } from './focoSemanais.js';
import { blacklistFacsHandleMessage } from './blacklistFacs.js';

// Novos comandos de permissão
import { removerPermHandleMessage } from '../commands/admin/removerperm.js';

// Handlers que faltavam
import { clearHandleMessage } from '../commands/admin/clearHandler.js';
import { verIdHandleMessage } from '../commands/admin/verid.js';
import { apagarChatHandleMessage } from '../commands/admin/apagarchat.js';
import { removerMassivoHandleMessage } from '../commands/admin/removerMassivo.js';
import perfildc from '../commands/admin/perfildc.js';
import logarcategoria from './logs/logarcategoria.js';

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
  // clear, // Movido para handler
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
  infoid,
  logarcategoria,

  // permissões de canal
  // editarperm,
  // remperm, // Movido para handler

  // opcional: se ainda usa
  ping,
};

export default {
  name: 'messageCreate',
  async execute(message, _args, client) {
    if (message.author.bot) return;

    // 🚀 EXECUÇÃO DE COMANDOS PRIORITÁRIA (Resolve o delay em comandos como !perguntas)
    if (message.content.startsWith('!')) {
      const parts = message.content.slice(1).trim().split(/\s+/);
      const commandName = (parts.shift() || '').toLowerCase();
      const args = parts;

      const command = commands[commandName];
      if (command) {
        try {
          const ok = command.hasPermission ? await command.hasPermission(message) : true;
          if (!ok) return;

          await command.execute(message, args, client);
          
          if (message.deletable) {
            setTimeout(async () => {
              try { await message.delete(); } catch (err) {}
            }, 5000);
          }
          return; // Finaliza aqui para não passar pelos outros handlers
        } catch (err) {
          console.error(`Erro no comando !${commandName}:`, err);
          try { await message.reply('❌ Deu erro ao executar esse comando.'); } catch {}
          return;
        }
      }
    }

    // ✅ VIP/Rolepass (Comando !vipmenu)
    if (await vipRegistroHandleMessage(message, client)) return;

    // ✅ Ausências (Comando !ausenciasmenu)
    if (await ausenciasHandleMessage(message, client)) return;

    // ✅ Registro de Poderes (Comando !pwrmenu)
    if (await registroPoderesEventosHandleMessage(message, client)) return;

    // ✅ Foco Semanal (Comando !focomenu)
    if (await focoSemanaisHandleMessage(message, client)) return;

    // ✅ Provas ADV (Comando !provasadv)
    if (await provasAdvHandleMessage(message, client)) return;

    // ✅ Blacklist FACS (Comando !blacklistbtn)
    if (await blacklistFacsHandleMessage(message, client)) return;

    // ✅ VENDAS (Comando !painelvendas)
    if (await registroVendasHandleMessage(message, client)) return;

    // ✅ CANAIS (Sort / Inativo / Membros)
    if (await sortChannelsHandleMessage(message, client)) return;

    // ✅ Handlers de comandos que faltavam
    if (await clearHandleMessage(message, client)) return;
    if (await removerPermHandleMessage(message, client)) return;
    if (await verIdHandleMessage(message, client)) return;
    if (await apagarChatHandleMessage(message, client)) return;
    if (await removerMassivoHandleMessage(message, client)) return;

  },
};

console.log('Comandos disponíveis:', Object.keys(commands));
