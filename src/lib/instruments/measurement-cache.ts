import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { writeJsonFileAtomic } from '../local-store/atomic-json';

const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

/** Cache only deterministic results. Callers supply their code/tool fingerprint
 * and every non-pixel input; a missing fingerprint always computes fresh. */
export function createMeasurementCache(directory: string, fingerprint: string | null) {
  const stats = { hits: 0, misses: 0, bypasses: 0 };
  function measure<T>(kind: string, files: string[], inputs: unknown, compute: () => T): T {
    if (!fingerprint) { stats.bypasses++; return compute(); }
    const bytes = files.map(file => digest(fs.readFileSync(file)));
    const key = digest(JSON.stringify({ version: 1, fingerprint, kind, bytes, inputs }));
    const file = path.join(directory, `${key}.json`);
    try {
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (saved.key === key && saved.digest === digest(JSON.stringify(saved.value))) { stats.hits++; return saved.value as T; }
    } catch { /* Missing or corrupt disposable evidence is recomputed. */ }
    stats.misses++;
    const value = compute();
    // Never publish a measurement if its picture changed while being read.
    if (files.some((file, index) => digest(fs.readFileSync(file)) !== bytes[index])) throw new Error('Picture changed during measurement');
    try {
      writeJsonFileAtomic(file, { key, digest: digest(JSON.stringify(value)), value });
      const entries = fs.readdirSync(directory).filter(name => /^[a-f0-9]{64}\.json$/.test(name));
      if (entries.length > 2048) {
        const oldest = entries.map(name => ({ name, at: fs.statSync(path.join(directory, name)).mtimeMs })).sort((a, b) => a.at - b.at);
        for (const entry of oldest.slice(0, entries.length - 2048)) fs.rmSync(path.join(directory, entry.name), { force: true });
      }
    } catch { /* Cache availability never changes the computed result. */ }
    return value;
  }
  return { measure, stats };
}
