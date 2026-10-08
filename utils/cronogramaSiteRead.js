import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
// Mesmo arquivo utilizado pela retenção e pela galeria de conquistas. Somente leitura.
export async function getCronogramaSiteData() {
  const file=fileURLToPath(new URL('../data/cronograma_state.json',import.meta.url));
  try {
    const data=JSON.parse(await readFile(file,'utf8'));
    if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('Formato inválido.');
    return data;
  } catch(error) {
    if(error.code==='ENOENT')return{schedule:{},madrugada:{}};
    throw Object.assign(new Error('Não foi possível ler a agenda oficial do bot.'),{status:503});
  }
}
