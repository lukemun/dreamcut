import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

// Kept under host-selected app userData, never in renderer-selected project files.
// This records ownership, not conversation content or credentials.
export async function codexSessionStore(userData, projectDirectory, directoryName = 'codex-sessions') {
  const project = await fs.realpath(projectDirectory);
  if (!/^[a-z]+-sessions$/.test(directoryName)) throw Error('Invalid session store.');
  const directory = path.join(userData, directoryName);
  const key = createHash('sha256').update(project).digest('hex');
  const filename = path.join(directory, `${key}.json`);
  const validate = value => {
    if (value?.version !== 1 || value.project !== project ||
      typeof value.threadId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value.threadId)) {
      throw Error('Saved agent session ownership is invalid.');
    }
    if (value.toolsHash != null && !/^[a-f0-9]{64}$/.test(value.toolsHash)) throw Error('Saved tool registration is invalid.');
    return value;
  };
  return {
    async read() {
      try {
        const stat = await fs.lstat(filename);
        if (!stat.isFile() || stat.size > 8192) throw Error('Saved agent session ownership is invalid.');
        return validate(JSON.parse(await fs.readFile(filename, 'utf8')));
      } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    },
    async save(threadId, toolsHash = null) {
      const record = validate({ version: 1, project, threadId, toolsHash });
      await fs.mkdir(directory, { recursive: true, mode: 0o700 });
      const temporary = path.join(directory, `${key}.${randomUUID()}.tmp`);
      try {
        await fs.writeFile(temporary, JSON.stringify(record) + '\n', { flag: 'wx', mode: 0o600 });
        await fs.rename(temporary, filename);
      } finally { await fs.rm(temporary, { force: true }); }
    },
  };
}
