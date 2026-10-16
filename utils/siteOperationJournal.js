import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const fail = (status, message) =>
  Object.assign(new Error(message), { status });

export async function runSiteOperation({
  action,
  guildId,
  actorId,
  payload = {},
  authorize,
  execute,
}) {
  const operationId = String(payload.operationId || '').toLowerCase();

  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(operationId)) {
    throw fail(400, 'Reabra o formulário para identificar este registro.');
  }

  if (typeof authorize !== 'function' || typeof execute !== 'function') {
    throw fail(500, 'A integração do registro está incompleta.');
  }

  await authorize();

  const values = Object.fromEntries(
    Object.entries(payload)
      .filter(([key]) => key !== 'operationId')
      .sort(([first], [second]) => first.localeCompare(second))
  );

  const fingerprint = createHash('sha256')
    .update(JSON.stringify(values))
    .digest('hex');

  const key = createHash('sha256')
    .update(JSON.stringify([
      String(guildId),
      String(actorId),
      action,
      operationId,
    ]))
    .digest('hex');

  const directory = path.resolve(
    process.env.SANTA_SITE_OPERATION_DIRECTORY || 'data/site-operations'
  );

  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });

  const file = path.join(directory, key + '.json');

  const pending = {
    version: 1,
    phase: 'pending',
    fingerprint,
    createdAt: Date.now(),
  };

  try {
    fs.writeFileSync(file, JSON.stringify(pending), {
      flag: 'wx',
      mode: 0o600,
    });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw fail(503, 'Não foi possível preparar o registro.');
    }

    let stored;

    try {
      stored = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      throw fail(
        503,
        'O histórico desta operação não pôde ser lido. Confira o Discord antes de reenviar.'
      );
    }

    if (stored?.version !== 1 || stored.fingerprint !== fingerprint) {
      throw fail(
        409,
        'Este identificador já pertence a outro conteúdo. Reabra o formulário.'
      );
    }

    if (stored.phase === 'completed' && stored.result?.ok === true) {
      return { ...stored.result, reused: true };
    }

    if (stored.phase === 'rejected' && [400, 403].includes(stored.status)) {
      throw fail(stored.status, stored.message || 'Registro recusado.');
    }

    throw fail(
      409,
      'Resultado incerto: este registro está em processamento ou aguardando conferência no Discord. Não crie outra cópia.'
    );
  }

  const save = value => {
    const temporary = file + '.' + randomUUID() + '.tmp';

    try {
      fs.writeFileSync(temporary, JSON.stringify(value), {
        flag: 'wx',
        mode: 0o600,
      });

      fs.renameSync(temporary, file);
    } finally {
      try {
        fs.unlinkSync(temporary);
      } catch {}
    }
  };

  let result;

  try {
    result = await execute();

    if (!result || result.ok !== true) {
      throw fail(503, 'O módulo não confirmou a conclusão do registro.');
    }
  } catch (error) {
    const status = Number(error.status);

    if ([400, 403].includes(status)) {
      try {
        save({
          ...pending,
          phase: 'rejected',
          status,
          message: String(error.message || 'Registro recusado.'),
        });
      } catch (saveError) {
        console.error(
          '[SITE OPERATION] Falha ao salvar recusa:',
          saveError.message
        );
      }

      throw error;
    }

    console.error(
      '[SITE OPERATION] Resultado pendente de conferência:',
      { action, key, message: error.message }
    );

    throw fail(
      503,
      'Resultado incerto: confira o Discord antes de reenviar. ' +
        String(error.message || 'A operação foi interrompida.')
    );
  }

  try {
    save({
      ...pending,
      phase: 'completed',
      completedAt: Date.now(),
      result,
    });
  } catch (error) {
    console.error(
      '[SITE OPERATION] Registro concluído; recibo não salvo:',
      { action, key, message: error.message }
    );

    return {
      ...result,
      warnings: [
        ...(Array.isArray(result.warnings) ? result.warnings : []),
        'O registro foi concluído, mas seu recibo não foi salvo. Não registre novamente.',
      ],
    };
  }

  return result;
}