import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { writeJsonFileAtomic } from './atomic-json';

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Only validated successes survive retries. Identity includes the exact prompt,
 * output schema, checkpoint and worker; adoption still happens in the caller. */
export async function resumeRetroPass<T>(directory: string, identity: unknown, validate: (raw: unknown) => T, run: () => Promise<unknown>): Promise<T> {
  const key = digest({ version: 1, identity });
  const file = path.join(directory, `${key}.json`);
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (saved.key === key && saved.digest === digest(saved.output)) return validate(saved.output);
  } catch { /* Missing, corrupt, or newly invalid output is recomputed. */ }
  const result = validate(await run());
  writeJsonFileAtomic(file, { key, digest: digest(result), output: result });
  return result;
}
