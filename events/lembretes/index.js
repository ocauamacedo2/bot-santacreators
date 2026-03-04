import { startLembreteManagerRegistros } from "./lembreteManagerRegistros.js";
import { startSocialMediasAvisos } from "./socialMediasAvisos.js";
import { startLembretePoderes } from "./lembretePoderes.js";

// /application/events/lembretes/index.js
import { startCentralLembretes } from "./centralLembretes.js";


export function startTodosLembretes(client) {
  startLembreteManagerRegistros(client);
  startSocialMediasAvisos(client);
  startLembretePoderes(client);
  startCentralLembretes(client);
}
