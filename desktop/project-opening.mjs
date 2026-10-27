import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export async function inspectProjectFolder(input) {
  let folder = path.resolve(input);
  if (path.basename(folder) === 'timeline.json') folder = path.dirname(folder);
  folder = await fs.realpath(folder);
  if (!(await fs.stat(folder)).isDirectory()) throw Error('Choose the project folder containing timeline.json.');
  const projectId = path.basename(folder);
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(projectId) || ['.', '..'].includes(projectId)) {
    throw Error('This editor needs a project folder name using letters, numbers, dots, underscores or hyphens. Parent folders may contain spaces or other characters.');
  }
  let timeline;
  try { timeline = JSON.parse(await fs.readFile(path.join(folder, 'timeline.json'), 'utf8')); }
  catch { throw Error('This folder does not contain a readable timeline.json project.'); }
  if (!timeline || typeof timeline !== 'object' || Array.isArray(timeline)) throw Error('The project timeline must be a JSON object.');
  return { folder, projectsRoot: path.dirname(folder), projectId };
}

export async function rememberProject(userData, target) {
  await fs.mkdir(userData, { recursive: true });
  const destination = path.join(userData, 'last-project.json');
  const temporary = destination + '.' + randomUUID() + '.tmp';
  // Concurrent project openings must never share a staging file. Exclusive
  // creation also prevents following a pre-existing temporary-file symlink.
  const file = await fs.open(temporary, 'wx', 0o600);
  try {
    try { await file.writeFile(JSON.stringify({ folder: target.folder })); }
    finally { await file.close(); }
    await fs.rename(temporary, destination);
  } finally { await fs.rm(temporary, { force: true }); }
}

export async function rememberedProject(userData) {
  try {
    const record = JSON.parse(await fs.readFile(path.join(userData, 'last-project.json'), 'utf8'));
    return typeof record.folder === 'string' ? await inspectProjectFolder(record.folder) : null;
  } catch { return null; }
}
