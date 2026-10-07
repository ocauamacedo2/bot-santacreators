import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export async function createShareAuditQueue(path, deliver) {
  await mkdir(dirname(path), { recursive: true });

  let jobs = [];

  try {
    jobs = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  if (!Array.isArray(jobs)) {
    throw new Error('Fila de auditoria inválida: ' + path);
  }

  let writes = Promise.resolve();
  let running = null;
  let lastError = null;
  let delivered = 0;

  const persist = () => {
    const snapshot = JSON.stringify(jobs);

    const task = writes.catch(() => {}).then(async () => {
      await writeFile(`${path}.tmp`, snapshot);
      await rename(`${path}.tmp`, path);
    });

    writes = task;
    return task;
  };

  const report = error => {
    lastError = {
      time: new Date().toISOString(),
      message: error.message,
      code: error.discordCode || error.code || null,
      channel: error.auditChannel || null
    };

    console.error('[SANTA AUDIT] Envio pendente; será repetido:', lastError);
  };

  function pump() {
    if (running) return running;

    running = (async () => {
      await writes.catch(() => persist());

      for (const job of [...jobs]
        .filter(item => !item.next || item.next <= Date.now())
        .slice(0, 30)) {
        try {
          await deliver(job.channel, job.embed);
          jobs = jobs.filter(item => item.id !== job.id);
          delivered++;
        } catch (error) {
          error.auditChannel = job.channel;
          report(error);

          job.attempts = (job.attempts || 0) + 1;
          job.next = Date.now() +
            Math.min(300000, 5000 * 2 ** Math.min(job.attempts, 6));
        }

        await persist();
      }
    })()
      .catch(report)
      .finally(() => {
        running = null;
      });

    return running;
  }

  const timer = setInterval(() => {
    void pump();
  }, 10000);

  timer.unref();

  return {
    async enqueue(channels, embed) {
      for (const channel of new Set(channels.filter(Boolean))) {
        jobs.push({
          id: randomUUID(),
          channel,
          embed,
          attempts: 0,
          next: 0
        });
      }

      try {
        await persist();
      } catch (error) {
        report(error);
        throw error;
      }

      void pump();
    },

    status: () => ({
      pending: jobs.length,
      deliveredSinceStart: delivered,
      lastError
    }),

    flush: async () => {
      await writes;
      await pump();
    },

    close: () => clearInterval(timer)
  };
}