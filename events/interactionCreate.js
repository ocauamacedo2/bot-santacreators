import { Events } from 'discord.js';
import entrevista from '../utils/entrevista.js';
import { registroVendasHandleInteraction } from './registroVendas.js';
import { sortChannelsHandleInteraction } from '../commands/canais/sortChannels.js';
import { vipRegistroHandleInteraction } from './vipRegistro.js';
import { ausenciasHandleInteraction } from './ausencias.js';

// Ignora tudo do fluxo do Pedir Set (tratado no index.js)
const isSetFlow = (interaction) => {
  if (interaction.isButton()) {
    const id = interaction.customId || '';
    return (
      id === 'abrir_modal_set' ||
      id.startsWith('aprovar_set_') ||
      id.startsWith('reprovar_set_')
    );
  }
  if (interaction.isModalSubmit()) {
    return interaction.customId === 'formulario_set';
  }
  return false;
};

export default {
  name: Events.InteractionCreate,
  once: false,
  async execute(interaction) {
    // ✅ não mexe no set flow
    if (isSetFlow(interaction)) return;

    // ✅ VIP/Rolepass Registro
    if (await vipRegistroHandleInteraction(interaction, interaction.client)) return;

    // ✅ Ausências (Registro)
    if (await ausenciasHandleInteraction(interaction, interaction.client)) return;

    // ✅ VENDAS (Botões e Modais)
    if (await registroVendasHandleInteraction(interaction, interaction.client)) return;

    // ✅ CANAIS (Undo Inativo/Membros)
    if (await sortChannelsHandleInteraction(interaction, interaction.client)) return;

    // ✅ entrevista: botões primeiro
    if (interaction.isButton()) {
      const foi = await entrevista.handleButtons(interaction);
      if (foi) return;
    }

    // (se quiser, dá pra tratar outros components aqui depois)
  },
};
