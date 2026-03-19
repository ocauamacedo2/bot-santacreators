// events/gestaoinfluencer/init.js
// SantaCreators — GestãoInfluencer INIT (v3.4 modular)

import { SC_GI_init } from "./state.js";

let initialized = false;

export async function gestaoinfluencerInit(client) {
  if (initialized) return;
  initialized = true;

  await SC_GI_init();

  console.log("✅ [GI] Estado inicializado (FASE 1)");
}
