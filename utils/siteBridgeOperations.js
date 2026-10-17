import {
  mkdir,
  readFile,
  writeFile,
  rename,
  unlink,
} from 'node:fs/promises';

import {
  resolve,
  join,
} from 'node:path';

import {
  createHash,
  randomUUID,
} from 'node:crypto';

const fail = (status, message) =>
  Object.assign(
    new Error(message),
    { status }
  );

const canonical = value => {
  if (Array.isArray(value)) {
    return value.map(canonical);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(key => [
          key,
          canonical(value[key]),
        ])
    );
  }

  return value;
};

export function createSiteBridgeOperations({
  directory = resolve('data/site-bridge-operations'),
} = {}) {
  const preparing = new Map();
  const running = new Map();

  // Bloqueia alterações simultâneas no mesmo registro GI.
  const resourceLocks = new Map();

  // Inclui operações que ainda estão preparando a gravação.
  let activeJobs = 0;

  const fileFor = key =>
    join(directory, key + '.json');

  const digest = value =>
    createHash('sha256')
      .update(JSON.stringify(value))
      .digest('hex');

  const read = async key => {
    try {
      return JSON.parse(
        await readFile(fileFor(key), 'utf8')
      );
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null;
      }

      throw error;
    }
  };

  const save = async (key, value) => {
    const temporary =
      fileFor(key) + '.' + randomUUID() + '.tmp';

    try {
      await writeFile(
        temporary,
        JSON.stringify(value),
        {
          flag: 'wx',
          mode: 0o600,
        }
      );

      await rename(
        temporary,
        fileFor(key)
      );
    } finally {
      await unlink(temporary)
        .catch(() => {});
    }
  };

  async function prepare(
    key,
    fingerprint,
    payload,
    execute,
    resourceKey
  ) {
    await mkdir(directory, {
      recursive: true,
      mode: 0o700,
    });

    const existing = await read(key);

    if (existing) {
      return existing;
    }

    if (payload.poll === true) {
      throw fail(
        409,
        'Esta operação não foi localizada. Confira o Discord antes de reenviar.'
      );
    }

    if (activeJobs >= 30) {
      throw fail(
        429,
        'Há muitas operações em andamento. Aguarde.'
      );
    }

    if (
      resourceKey &&
      resourceLocks.has(resourceKey)
    ) {
      throw fail(
        409,
        'Este Controle GI já possui uma operação em andamento. Aguarde a conclusão antes de alterar novamente.'
      );
    }

    /*
     * Reserva antes de aguardar a gravação.
     *
     * Isso impede que duas requisições simultâneas
     * adquiram o mesmo registro enquanto a primeira
     * ainda está preparando o arquivo da operação.
     */
    activeJobs++;

    if (resourceKey) {
      resourceLocks.set(
        resourceKey,
        key
      );
    }

    let released = false;

    const release = () => {
      if (released) {
        return;
      }

      released = true;
      activeJobs--;

      if (
        resourceKey &&
        resourceLocks.get(resourceKey) === key
      ) {
        resourceLocks.delete(resourceKey);
      }
    };

    const item = {
      fingerprint,
      phase: 'pending',
      createdAt: Date.now(),
    };

    try {
      await writeFile(
        fileFor(key),
        JSON.stringify(item),
        {
          flag: 'wx',
          mode: 0o600,
        }
      );
    } catch (error) {
      release();

      if (error.code === 'EEXIST') {
        return read(key);
      }

      throw error;
    }

    const job = Promise.resolve()
      .then(execute)
      .then(
        result => save(key, {
          ...item,
          phase: 'completed',
          result,
          finishedAt: Date.now(),
        }),

        error => save(key, {
          ...item,
          phase: 'failed',

          status:
            Number(error.status) >= 400 &&
            Number(error.status) <= 599
              ? Number(error.status)
              : 500,

          error: String(
            error.message ||
            'Não foi possível concluir a operação.'
          ),

          finishedAt: Date.now(),
        })
      )
      .catch(error => {
        console.error(
          '[SITE OPERATION] Resultado não pôde ser persistido:',
          error.code || error.name
        );
      })
      .finally(() => {
        running.delete(key);
        release();
      });

    running.set(key, job);

    return item;
  }

  async function respond({
    res,
    guildId,
    actorId,
    action,
    payload,
    execute,
  }) {
    const operationId = String(
      payload.operationId || ''
    ).toLowerCase();

    if (
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
        .test(operationId)
    ) {
      throw fail(
        400,
        'Atualize o site para identificar esta operação.'
      );
    }

    const key = digest([
      String(guildId),
      String(actorId),
      action,
      operationId,
    ]);

    const clean = { ...payload };

    for (
      const field of [
        'operationId',
        'poll',
        'refresh',
        'requireFresh',
      ]
    ) {
      delete clean[field];
    }

    const fingerprint = digest(
      canonical(clean)
    );

    /*
     * Edição, pausa, responsável e demais ações:
     * bloqueiam pelo messageId do Controle GI.
     *
     * Criação:
     * bloqueia pelo usuário que receberá o controle.
     */
    const target = action === 'gi.action'
      ? String(
          payload.payload?.messageId ||
          (
            payload.action === 'create'
              ? payload.payload?.userId || ''
              : ''
          )
        )
      : '';

    const resourceKey = target
      ? digest([
          String(guildId),
          'gi-record',
          target,
        ])
      : null;

    let initialization = preparing.get(key);

    if (!initialization) {
      initialization = prepare(
        key,
        fingerprint,
        payload,
        execute,
        resourceKey
      ).finally(() => {
        preparing.delete(key);
      });

      preparing.set(
        key,
        initialization
      );
    }

    let item = await initialization;

    item = await read(key) || item;

    if (
      !item ||
      item.fingerprint !== fingerprint
    ) {
      throw fail(
        409,
        'Este identificador pertence a outra alteração.'
      );
    }

    if (item.phase === 'completed') {
      return res.json(item.result);
    }

    if (item.phase === 'failed') {
      return res.status(item.status).json({
        error: item.error,
        operationId,
      });
    }

    if (!running.has(key)) {
      throw fail(
        409,
        'O processo reiniciou antes de confirmar o resultado. Confira o Discord; esta operação não será repetida automaticamente.'
      );
    }

    return res.status(202).json({
      pending: true,
      operationId,
    });
  }

  return {
    respond,

    flush: () =>
      Promise.allSettled([
        ...preparing.values(),
        ...running.values(),
      ]),
  };
}