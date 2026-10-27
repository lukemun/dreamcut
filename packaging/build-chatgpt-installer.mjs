#!/usr/bin/env node
/** Build a public installer using only the already-published npm launcher, never the dirty editor checkout. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist/chatgpt-installer');
const version = '0.1.2';
const launcherVersion = '0.2.2';
const expectedSha1 = 'c3da3ead0234eb04e8330fdf466d8d1309388245';
const sha256 = data => createHash('sha256').update(data).digest('hex');
await fs.mkdir(out, { recursive: true });
const stage = await fs.mkdtemp(path.join(out, '.build-'));
try {
  const response = await fetch(`https://registry.npmjs.org/dreamcut/-/dreamcut-${launcherVersion}.tgz`);
  if (!response.ok) throw new Error(`npm download failed (${response.status}).`);
  const tarball = Buffer.from(await response.arrayBuffer());
  if (createHash('sha1').update(tarball).digest('hex') !== expectedSha1) throw new Error('Published launcher checksum mismatch.');
  await fs.writeFile(path.join(stage, 'launcher.tgz'), tarball);
  execFileSync('tar', ['-xzf', path.join(stage, 'launcher.tgz'), '-C', stage]);
  const plugin = path.join(stage, 'plugin');
  await fs.mkdir(plugin);
  await fs.rename(path.join(stage, 'package'), path.join(plugin, 'launcher'));
  await fs.copyFile(path.join(root, 'packaging/chatgpt-installer/setup.mjs'), path.join(plugin, 'setup.mjs'));
  await fs.cp(path.join(root, 'packaging/chatgpt-installer/assets'), path.join(plugin, 'assets'), { recursive: true });
  const archiveName = `dreamcut-chatgpt-${version}.tar.gz`;
  const archive = path.join(out, archiveName);
  execFileSync('tar', ['-czf', archive, '-C', stage, 'plugin'], { env: { ...process.env, COPYFILE_DISABLE: '1' } });
  const archiveHash = sha256(await fs.readFile(archive));
  const script = (await fs.readFile(path.join(root, 'packaging/chatgpt-installer/install.sh'), 'utf8')).replace('__PAYLOAD_SHA256__', archiveHash);
  await fs.writeFile(path.join(out, 'install.sh'), script, { mode: 0o755 });
  const checksums = `${archiveHash}  ${archiveName}\n${sha256(script)}  install.sh\n`;
  await fs.writeFile(path.join(out, 'SHA256SUMS'), checksums);
  console.log(`Built ${out}\n${checksums}`);
} finally { await fs.rm(stage, { recursive: true, force: true }); }
