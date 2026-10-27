#!/usr/bin/env node
/**
 * Build the Claude desktop extension (dist/claude-extension/dreamcut-<version>.mcpb): one file people open
 * to add DreamCut to the Claude app, no terminal. It wraps the packed npm launcher (run
 * packaging/pack-launcher.mjs first) with packaging/claude-extension/server/index.mjs, which finds or
 * downloads the Node it runs on. Signing and publishing are separate, manual steps by the package owner.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { npmCommand } from './npm-command.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packed = path.join(repo, 'dist', 'npm', 'dreamcut');
const { version } = JSON.parse(await fs.readFile(path.join(packed, 'package.json'), 'utf8').catch(() => {
  throw new Error('No packed launcher in dist/npm/dreamcut. Run node packaging/pack-launcher.mjs first.');
}));
const out = path.join(repo, 'dist', 'claude-extension');
const stage = path.join(out, 'stage');
await fs.rm(stage, { recursive: true, force: true });
await fs.mkdir(path.join(stage, 'launcher'), { recursive: true });
// The launcher's code, license and runtime snapshot; its Claude Code/Codex plugin files are not used here.
for (const item of ['bin', 'lib', 'runtime-manifest.json', 'LICENSE']) await fs.cp(path.join(packed, item), path.join(stage, 'launcher', item), { recursive: true });
await fs.cp(path.join(repo, 'packaging', 'claude-extension', 'server'), path.join(stage, 'server'), { recursive: true });
await fs.copyFile(path.join(repo, 'packaging', 'chatgpt-installer', 'assets', 'icon.png'), path.join(stage, 'icon.png'));
await fs.copyFile(path.join(packed, 'LICENSE'), path.join(stage, 'LICENSE'));
const manifest = JSON.parse(await fs.readFile(path.join(repo, 'packaging', 'claude-extension', 'manifest.json'), 'utf8'));
await fs.writeFile(path.join(stage, 'manifest.json'), `${JSON.stringify({ ...manifest, version }, null, 2)}\n`);
const file = path.join(out, `dreamcut-${version}.mcpb`);
await fs.rm(file, { force: true });
const [command, args] = npmCommand(['exec', '--yes', '--package=@anthropic-ai/mcpb', '--', 'mcpb', 'pack', stage, file]);
execFileSync(command, args, { stdio: 'inherit' });
console.log(`Built ${path.relative(repo, file)}`);
