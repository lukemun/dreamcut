import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

// Writes code-identity.json for a built runtime: one hash over the code it runs (src/lib/code-identity.ts
// reads it). Paths are relative, so the identity is the same wherever the runtime is installed.
const INPUTS = ['src', 'scripts', 'mcp', 'workers', 'prebuilt', 'package.json', 'pnpm-lock.yaml', 'next.config.ts', '.next-desktop/BUILD_ID'];

export async function writeCodeIdentity(root, inputs = INPUTS) {
  const hash = createHash('sha256');
  const add = async relative => {
    const file = path.join(root, relative);
    const stat = await fs.stat(file).catch(() => null);
    if (!stat) return;
    if (stat.isDirectory()) {
      for (const name of (await fs.readdir(file)).sort()) if (name !== 'node_modules') await add(path.join(relative, name));
    } else if (stat.isFile()) hash.update(`${relative.split(path.sep).join('/')}\0`).update(createHash('sha256').update(await fs.readFile(file)).digest('hex')).update('\n');
  };
  for (const input of inputs) await add(input);
  const identity = hash.digest('hex');
  await fs.writeFile(path.join(root, 'code-identity.json'), `${JSON.stringify({ schema: 1, identity }, null, 2)}\n`);
  return identity;
}
