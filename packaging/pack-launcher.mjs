#!/usr/bin/env node
/**
 * Pack the `dreamcut` npm launcher: copies packaging/launcher, writes runtime-manifest.json (version, the
 * public download location: the latest GitHub Release, or --base-url; and a snapshot of the update feed
 * dist/web-runtime/latest.json, used when the published feed is unreachable) and runs `npm pack` into
 * dist/npm/. Installed launchers follow the published feed, so new versions need no new npm release.
 * The package is also the Claude Code and Codex plugin (manifests, MCP entries and skills at its root);
 * marketplaces install it from npm (packaging/build-marketplace.mjs). Publishing is a separate, manual step
 * by the package owner.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const option = name => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
// The feed lives on the public repository's latest GitHub Release; --base-url points at another location.
const baseUrl = option('base-url') ?? `https://github.com/${option('repo') ?? 'lukemun/dreamcut'}/releases/latest/download`;
const { version, license } = JSON.parse(await fs.readFile(path.join(repo, 'package.json'), 'utf8'));
const feed = JSON.parse(await fs.readFile(path.join(repo, 'dist', 'web-runtime', 'latest.json'), 'utf8'));
if (feed.version !== version) throw new Error(`Built runtimes are ${feed.version}; package.json is ${version}. Rebuild the runtime.`);
const out = path.join(repo, 'dist', 'npm', 'dreamcut');
await fs.rm(out, { recursive: true, force: true });
await fs.cp(path.join(repo, 'packaging', 'launcher'), out, { recursive: true });
// Every distributed copy carries the license.
await fs.copyFile(path.join(repo, 'LICENSE'), path.join(out, 'LICENSE'));
// The plugin manifests carry the package version; Codex starts this exact version through npx.
for (const manifest of ['.claude-plugin/plugin.json', '.codex-plugin/plugin.json']) {
  const file = path.join(out, manifest);
  await fs.writeFile(file, `${JSON.stringify({ ...JSON.parse(await fs.readFile(file, 'utf8')), version, ...(license ? { license } : {}) }, null, 2)}\n`);
}
const codexMcp = path.join(out, '.codex-mcp.json');
await fs.writeFile(codexMcp, (await fs.readFile(codexMcp, 'utf8')).replace('dreamcut@0.0.0', `dreamcut@${version}`));
await fs.writeFile(path.join(out, 'runtime-manifest.json'), JSON.stringify({ version, base_url: baseUrl, platforms: feed.platforms }, null, 2));
await fs.writeFile(path.join(out, 'package.json'), JSON.stringify({
  name: 'dreamcut', version, description: 'DreamCut: a local video editor you drive from Claude Code or Codex. Your footage stays on your computer.',
  ...(license ? { license } : {}), type: 'module', bin: { dreamcut: 'bin/dreamcut.mjs' }, files: ['LICENSE', 'bin', 'lib', 'skills', '.claude-plugin', '.codex-plugin', '.mcp.json', '.codex-mcp.json', 'runtime-manifest.json'], engines: { node: '>=22' },
}, null, 2));
const tarball = execFileSync('npm', ['pack', '--pack-destination', path.join(repo, 'dist', 'npm')], { cwd: out, encoding: 'utf8' }).trim().split('\n').pop();
console.log(`Packed dist/npm/${tarball}`);
