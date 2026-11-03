import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { acquireProjectLease } from './project-lease.mjs';
const exists = async name => { try { return await fs.lstat(name); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } };
// Each agent provider owns separate records; Codex keeps its original paths.
export const AGENT_PROVIDERS = ['codex', 'claude', 'local'];
const locations = (userData, project, provider = 'codex') => {
  if (!AGENT_PROVIDERS.includes(provider)) throw Error('Unsupported editing agent provider.');
  const key = createHash('sha256').update(project).digest('hex');
  return { key, provider, marker: path.join(userData, `${provider}-conversation-resets`, `${key}.json`),
    journal: path.join(userData, `${provider}-editing-journals`, key), ownership: path.join(userData, `${provider}-sessions`, `${key}.json`) };
};
/** Whether an agent has saved ownership or journal records for this project. */
export async function conversationExists(userData, project, provider = 'codex') {
  const names = locations(userData, project, provider);
  return Boolean(await exists(names.ownership) || await exists(names.journal));
}
export async function assertConversationReady(userData, project, provider = 'codex') {
  if (await exists(locations(userData, project, provider).marker)) throw Error('Starting a new conversation was interrupted. Choose New conversation to finish.');
}
async function readRecord(filename, maximum = 65536) {
  const stat = await exists(filename);
  if (!stat) return null;
  if (!stat.isFile() || stat.size > maximum) throw Error('Conversation records need manual recovery.');
  return JSON.parse(await fs.readFile(filename, 'utf8'));
}
async function move(source, destination, directory = false) {
  const a = await exists(source), b = await exists(destination);
  if (!a) return;
  if (b || (directory ? !a.isDirectory() : !a.isFile())) throw Error('Conversation archive needs manual recovery.');
  await fs.rename(source, destination);
}
// Explicit host action: keep old audit bytes and ownership; never touch the project.
export async function resetConversation({ userData, projectDirectory, provider = 'codex' }) {
  const project = await fs.realpath(projectDirectory);
  const lease = acquireProjectLease(project);
  try {
    const names = locations(userData, project, provider);
    const pending = await readRecord(names.marker);
    if (pending && (pending.version !== 1 || pending.project !== project || !/^[a-f0-9-]{36}$/.test(pending.archiveId))) throw Error('Conversation reset record is invalid.');
    const archiveId = pending?.archiveId ?? randomUUID();
    const archive = path.join(userData, `${provider}-conversation-archives`, names.key, archiveId);
    const journal = await exists(names.journal) ? names.journal : path.join(archive, 'journal');
    const journalStat = await exists(journal);
    if (journalStat && !journalStat.isDirectory()) throw Error('Conversation journal needs manual recovery.');
    const checkpoint = await readRecord(path.join(journal, 'checkpoint.json'), 64 * 1024 * 1024);
    if (checkpoint && (!Array.isArray(checkpoint.operations) || checkpoint.operations.some(op => !['completed', 'not_executed', 'unconfirmed'].includes(op?.status)))) {
      throw Error('The last request was interrupted. Send a message to continue this conversation before starting a new one.');
    }
    const holder = await readRecord(path.join(journal, 'session.lease'));
    if (holder) {
      if (!Number.isSafeInteger(holder.pid) || holder.pid <= 0) throw Error('Conversation lease needs manual recovery.');
      try { process.kill(holder.pid, 0); throw Error('This conversation is still in use. Disconnect it first.'); }
      catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
    await fs.mkdir(archive, { recursive: true, mode: 0o700 });
    if (!pending) {
      await fs.mkdir(path.dirname(names.marker), { recursive: true, mode: 0o700 });
      const temporary = `${names.marker}.${randomUUID()}.tmp`;
      const file = await fs.open(temporary, 'wx', 0o600);
      try {
        try { await file.writeFile(JSON.stringify({ version: 1, project, archiveId })); await file.sync(); } finally { await file.close(); }
        await fs.rename(temporary, names.marker);
      } finally { await fs.rm(temporary, { force: true }); }
    }
    await move(names.journal, path.join(archive, 'journal'), true);
    await move(names.ownership, path.join(archive, 'ownership.json'));
    await fs.rename(names.marker, path.join(archive, 'reset.json'));
    return { archived: true };
  } finally { lease.release(); }
}
