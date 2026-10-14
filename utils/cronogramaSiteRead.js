import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
// Mesmo arquivo utilizado pela retenção e pela galeria de conquistas. Somente leitura.
export async function getCronogramaSiteData() {
  const file = fileURLToPath(
    new URL('../data/cronograma_state.json', import.meta.url)
  );

  try {
    const data = JSON.parse(
      await readFile(file, 'utf8')
    );

    if (
      !data ||
      typeof data !== 'object' ||
      Array.isArray(data)
    ) {
      throw new Error('Formato inválido.');
    }

    const hasSchedule =
      data.schedule !== null &&
      typeof data.schedule === 'object' &&
      !Array.isArray(data.schedule);

    const hasMadrugada =
      data.madrugada !== null &&
      typeof data.madrugada === 'object' &&
      !Array.isArray(data.madrugada);

    if (
      !hasSchedule &&
      !hasMadrugada &&
      !Array.isArray(data.events)
    ) {
      throw new Error('A agenda não contém uma estrutura reconhecida.');
    }

    return data;
  } catch (error) {
    throw Object.assign(
      new Error(
        error.code === 'ENOENT'
          ? 'A agenda oficial ainda não está disponível no arquivo do bot.'
          : 'Não foi possível ler a agenda oficial do bot.'
      ),
      {
        status: 503,
        cause: error,
      }
    );
  }
}
