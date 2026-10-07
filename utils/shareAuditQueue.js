import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

// Uma entrega confirmada é retirada do disco; cada canal é uma tarefa independente.
export async function createShareAuditQueue(path, deliver, options = {}) {
  const now = options.now || Date.now;
  const logger = options.logger || console;
  await mkdir(dirname(path), { recursive: true });
  let jobs = [];
  try { jobs = JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!Array.isArray(jobs) || jobs.some(job => !job.id || !job.channel || !job.embed)) {
    throw new Error('Fila de auditoria inválida: ' + path);
  }
  let writes = Promise.resolve(), running = null, lastError = null, delivered = 0;
  const report = (error, channel = null) => {
    lastError = { time: new Date(now()).toISOString(), channel,
      status: error?.status || error?.statusCode || null,
      code: error?.discordCode || error?.code || null,
      message: error?.discordMessage || error?.message || String(error) };
    logger.error('[SANTA AUDIT] Entrega pendente:', lastError);
  };
  const persist = () => {
    const snapshot = JSON.stringify(jobs);
    const task = writes.catch(() => {}).then(async () => {
      const temp = `${path}.${randomUUID()}.tmp`;
      await writeFile(temp, snapshot, { mode: 0o600 });
      await rename(temp, path);
    });
    writes = task;
    return task;
  };
  function pump() {
    if (running) return running;
    running = (async () => {
      // Não enviar nada que ainda não tenha sido confirmado no armazenamento.
      await writes.catch(() => persist());
      const ready = jobs.filter(job => !job.next || job.next <= now()).slice(0, 30);
      for (const job of ready) {
        try {
          await deliver(job.channel, job.embed);
        } catch (error) {
          report(error, job.channel);
          job.attempts = (job.attempts || 0) + 1;
          job.next = now() + Math.max(error?.retryAfterMs || 0,
            Math.min(300000, 5000 * 2 ** Math.min(job.attempts, 6)));
          await persist();
          continue;
        }
        jobs = jobs.filter(item => item.id !== job.id);
        try { await persist(); delivered++; }
        catch (error) {
          // Preserva o registro se a confirmação no disco falhar.
          jobs.push(job);
          report(error, job.channel);
          throw error;
        }
      }
    })().catch(error => report(error)).finally(() => { running = null; });
    return running;
  }
  const timer = setInterval(() => { void pump(); }, options.intervalMs || 10000);
  timer.unref();
  // Retoma também os registros de uma execução anterior.
  if (options.autoStart !== false) void pump();
  return {
    async enqueue(channels, embed) {
      for (const channel of new Set(channels.filter(Boolean))) {
        jobs.push({ id: randomUUID(), channel, embed, attempts: 0, next: 0 });
      }
      try { await persist(); } catch (error) { report(error); throw error; }
      if (options.autoStart !== false) void pump();
    },
    status: () => ({ pending: jobs.length, deliveredSinceStart: delivered, lastError,
      oldestPendingAt: jobs.length ? jobs[0].embed.timestamp || null : null }),
    async flush() { await writes; await pump(); },
    close() { clearInterval(timer); }
  };
}