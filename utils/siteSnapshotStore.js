import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { writeFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';

export function createSiteSnapshotStore({
  directory,
  freshMs = 10000,
  maxAgeMs = 30 * 86400000,
  maxEntries = 128,
  maxBytes = 2 * 1024 * 1024,
  maxTotalBytes = 32 * 1024 * 1024,
  now = Date.now,
} = {}) {
  const entries = new Map();
  const sizes = new Map();
  const pending = new Map();
  const dirty = new Set();
  const failures = new Map();
  let totalBytes = 0;
  let writes = Promise.resolve();
  let epoch = 0;

  mkdirSync(directory, { recursive: true, mode: 0o700 });

  for (const file of readdirSync(directory)) {
    if (!/^[a-f0-9]{64}\.json$/.test(file)) continue;
    try {
      const bytes = readFileSync(join(directory, file), 'utf8');
      const record = JSON.parse(bytes);
      if (
        Number.isFinite(record.at) && record.value &&
        now() - record.at < maxAgeMs && record.at <= now() &&
        Buffer.byteLength(bytes) <= maxBytes
      ) {
        const key = file.slice(0, -5);
        const size = Buffer.byteLength(bytes);
        entries.set(key, record);
        sizes.set(key, size);
        totalBytes += size;
        dirty.add(key);
      } else {
        unlinkSync(join(directory, file));
      }
    } catch {
      try { unlinkSync(join(directory, file)); } catch {}
    }
  }

  function remove(key) {
    totalBytes -= sizes.get(key) || 0;
    sizes.delete(key);
    entries.delete(key);
    dirty.delete(key);
    writes = writes.then(async () => {
      if (!entries.has(key)) {
        await unlink(join(directory, key + '.json')).catch(() => {});
      }
    });
  }

  function trim() {
    for (const [key, record] of entries) {
      if (now() - record.at >= maxAgeMs) remove(key);
    }
    while (entries.size > maxEntries || totalBytes > maxTotalBytes) {
      remove(entries.keys().next().value);
    }
  }

  trim();
  const cleanup = setInterval(trim, 60000);
  cleanup.unref?.();

  return {
    key(context) {
      return createHash('sha256').update(JSON.stringify(context)).digest('hex');
    },
    get(key) {
      const record = entries.get(key);
      if (!record) return null;
      if (now() - record.at >= maxAgeMs) {
        remove(key);
        return null;
      }
      return {
        ...record,
        fresh: !dirty.has(key) && now() - record.at < freshMs,
      };
    },
    error(key) {
      const failure = failures.get(key);
      if (!failure) return null;
      if (now() - failure.at >= 10000) {
        failures.delete(key);
        return null;
      }
      return failure.error;
    },
    revision() { return epoch; },
    begin(key, module = null) {
      if (pending.has(key)) {
        return { owner: false, promise: pending.get(key).promise };
      }
      failures.delete(key);
      let resolve;
      const promise = new Promise(done => { resolve = done; });
      pending.set(key, { promise, resolve, module, invalidated: false });
      return { owner: true, promise };
    },
    finish(key, value, error = null) {
      const task = pending.get(key);
      try {
        if (!error && value && !value.error) {
          const record = { at: now(), module: task?.module || null, value };
          const bytes = JSON.stringify(record);
          const size = Buffer.byteLength(bytes);
          if (size > maxBytes || size > maxTotalBytes) {
            error = Object.assign(new Error('A consulta excedeu o limite do armazenamento.'), { status: 413 });
          } else {
            totalBytes -= sizes.get(key) || 0;
            entries.delete(key);
            entries.set(key, record);
            sizes.set(key, size);
            totalBytes += size;
            if (task?.invalidated) dirty.add(key);
            else dirty.delete(key);
            trim();
            writes = writes.then(async () => {
              if (entries.get(key) !== record) return;
              const file = join(directory, key + '.json');
              const temporary = file + '.' + randomUUID() + '.tmp';
              try {
                await writeFile(temporary, bytes, { mode: 0o600 });
                await rename(temporary, file);
              } finally {
                await unlink(temporary).catch(() => {});
              }
            }).catch(writeError => {
              console.warn('[SITE CONSULTAS] Falha ao salvar:', writeError.code || writeError.name);
            });
          }
        }
      } catch (finishError) {
        error = finishError;
      } finally {
        if (error) {
          failures.set(key, { at: now(), error });
          while (failures.size > maxEntries) failures.delete(failures.keys().next().value);
        }
        task?.resolve({ value, error });
        pending.delete(key);
      }
      return error;
    },
    invalidate(module = null) {
      epoch++;
      for (const [key, record] of entries) {
        if (!module || !record.module || record.module === module) dirty.add(key);
      }
      for (const task of pending.values()) {
        if (!module || !task.module || task.module === module) task.invalidated = true;
      }
    },
    async flush() { await writes; },
    close() { clearInterval(cleanup); },
    size() { return entries.size; },
  };
}
