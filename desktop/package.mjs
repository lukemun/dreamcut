import { FROM_MCP, shellFiles } from './shell-files.mjs';
import { createHash } from 'node:crypto';
import { copyRuntime } from './copy-runtime.mjs';
import { prepareAppIcon } from './app-icon.mjs';
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { workerPackageImports } from './worker-dependencies.mjs';
import { releaseConfiguration } from './release-policy.mjs';
import { packageInput, relativePackageLink } from './package-policy.mjs';
import { relocatePackageLinks } from './relocate-package.mjs';
import { bundleMediaTools } from './media-tools.mjs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { packager } from '@electron/packager';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.join(repository, '.desktop-build', 'source');
const require = createRequire(import.meta.url);
const { nodeFileTrace } = require('next/dist/compiled/@vercel/nft');
const buildPackage = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const release = releaseConfiguration({ argv: process.argv, env: process.env, version: buildPackage.version, arch: process.arch });
const output = path.join(repository, '.desktop-build');
const stage = path.join(output, 'stage');
const service = path.join(stage, 'service');
const shell = path.join(stage, 'shell');
const build = '.next-desktop';
const manifest = JSON.parse(await fs.readFile(path.join(root, build, 'required-server-files.json'), 'utf8'));
await fs.access(path.join(root, build, 'BUILD_ID'));
// Fail before replacing staging when the host cannot safely hold a package.
const disk = await fs.statfs(output);
if (disk.bavail * disk.bsize < 2 * 1024 ** 3) throw Error('Desktop packaging needs at least 2 GiB free before staging. Free disk space and retry; existing staging was preserved.');
// Delete only owned generated staging; project and profile roots are never inputs.
await fs.rm(stage, { recursive: true, force: true });
await fs.mkdir(service, { recursive: true });
await fs.mkdir(shell, { recursive: true });
const inputs = new Set();
async function walk(directory) {
  const result = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const name = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await walk(name)); else result.push(name);
  }
  return result;
}
for (const file of await walk(path.join(root, build))) {
  if (!file.endsWith('.nft.json')) continue;
  const trace = JSON.parse(await fs.readFile(file, 'utf8'));
  for (const item of trace.files) inputs.add(path.relative(root, path.resolve(path.dirname(file), item)));
}
// Custom-server dependencies require their own trace; standalone server.js is not used.
const traceEntry = path.join(root, 'trace-server.cjs');
const workerImports = await workerPackageImports(root);
await fs.writeFile(traceEntry, "require('next'); require('@sentry/electron/main'); import('tsx'); require.resolve('hyperframes/bin/hyperframes.mjs');\n" + workerImports.map(name => `import(${JSON.stringify(name)});`).join('\n'));
// Electron supplies its builtin module; the npm downloader's app bundle is not a
// service dependency and contains framework symlinks the tracer cannot resolve.
const buildRequire = createRequire(path.join(root, 'package.json'));
const animationCli = buildRequire.resolve('hyperframes/bin/hyperframes.mjs');
const trace = await nodeFileTrace([traceEntry, animationCli, path.join(root, 'mcp/server.mjs'), path.join(root, 'mcp/harness-mcp.mjs'), path.join(root, 'mcp/harness-session.mjs'), path.join(root, 'mcp/harness-adapters.mjs'), path.join(root, 'mcp/tool-schema-portability.mjs'), path.join(root, 'desktop/claude-session.mjs')], { base: root, processCwd: root,
  ignore: ['**/.cache/**', '**/cache/**', '**/node_modules/electron/**', '**/node_modules/.pnpm/electron@*/**', '**/node_modules/.pnpm/@anthropic-ai+claude-agent-sdk-*/**'] });
for (const item of trace.fileList) inputs.add(item);
const copied = [];
for (const item of [...inputs].sort()) {
  const relative = path.normalize(item);
  if (!packageInput(relative)) continue;
  const source = path.join(root, relative), dest = path.join(service, relative);
  const stat = await fs.lstat(source);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  if (stat.isSymbolicLink()) {
    const target = await fs.readlink(source);
    const link = relativePackageLink(root, source, target);
    try { await fs.symlink(link, dest, (await fs.stat(source)).isDirectory() ? 'dir' : 'file'); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  } else if (stat.isFile()) await fs.copyFile(source, dest, constants.COPYFILE_FICLONE);
  copied.push(relative);
}
// Explicit runtime resources that static server tracing cannot discover.
// Next's runtime config loader dynamically resolves compiler helpers even in
// production. Preserve the owning package rather than patching files one by one.
for (const name of ['next', 'tsx']) {
  const source = await fs.realpath(path.join(root, 'node_modules', name));
  const destination = await fs.realpath(path.join(service, 'node_modules', name));
  await copyRuntime(source, destination, {contents:true});
}
for (const folder of [build, 'public', 'src', 'docs/effects', 'scripts', 'mcp']) {
  await fs.cp(path.join(root, folder), path.join(service, folder), { recursive: true, mode: constants.COPYFILE_FICLONE,
    filter: source => packageInput(path.relative(root, source)) && !source.endsWith('.test.ts') && !source.endsWith('.test.tsx') });
}
await fs.cp(path.join(root, 'node_modules/canvaskit-wasm/bin'), path.join(service, 'node_modules/canvaskit-wasm/bin'), { recursive: true, dereference: true });
await fs.mkdir(path.join(service, 'docs/tools'), { recursive: true });
await fs.copyFile(path.join(root, 'docs/tools/registry.json'), path.join(service, 'docs/tools/registry.json'));
for (const file of ['tsconfig.json', 'pnpm-lock.yaml']) await fs.copyFile(path.join(root, file), path.join(service, file));
await fs.writeFile(path.join(service, 'package.json'), JSON.stringify({ name: 'dreamcut-service', private: true }));
await fs.writeFile(path.join(service, 'desktop-next-config.json'), JSON.stringify({
  distDir: build, devIndicators: false, serverExternalPackages: manifest.config.serverExternalPackages,
}));
// Next's custom-server prepare phase reloads configuration independently of conf.
// Own that lookup here so it cannot discover a parent checkout's next.config.ts.
await fs.writeFile(path.join(service, 'next.config.js'), "module.exports = require('./desktop-next-config.json');\n");
// The shell's import closure, so a module the app starts importing is never left out.
for (const file of await shellFiles(path.join(repository, 'desktop'))) await fs.copyFile(path.join(repository, FROM_MCP.has(file) ? 'mcp' : 'desktop', file), path.join(shell, file));
await fs.writeFile(path.join(shell, 'release.json'), JSON.stringify(release.manifest, null, 2));
await fs.symlink('../service/node_modules', path.join(shell, 'node_modules'), 'dir');
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
await fs.writeFile(path.join(shell, 'package.json'), JSON.stringify({ name: 'dreamcut', productName: 'DreamCut', version: pkg.version, main: 'main.mjs', license: pkg.license }));
await fs.writeFile(path.join(output, 'dependency-manifest.json'), JSON.stringify({ build, workerImports, files: copied, platform: process.platform, arch: process.arch }, null, 2));
// The local web runtime (packaging/build-web-runtime.mjs) reuses the traced service and shell files only:
// it bundles no media tools or voice, and needs no Electron.
if (process.argv.includes('--service-only')) { console.log('Desktop service staged for the web runtime.'); process.exit(0); }
await bundleMediaTools(path.join(stage, 'media-tools'));
const voiceManifest = JSON.parse(await fs.readFile(path.join(output, 'voice/manifest.json'), 'utf8'));
if (voiceManifest.platform !== process.platform || voiceManifest.arch !== process.arch) throw Error('Run desktop:voice on this host before packaging.');
for (const item of voiceManifest.files) {
  if (path.basename(item.path) !== item.path) throw Error('Invalid voice bundle path.');
  const bytes=await fs.readFile(path.join(output,'voice',item.path));
  if(bytes.length!==item.bytes || createHash('sha256').update(bytes).digest('hex')!==item.sha256) throw Error('Voice bundle checksum mismatch.');
}
if (process.argv.includes('--stage-only')) { console.log('Desktop service staged.'); process.exit(0); }
const icon = await prepareAppIcon(path.join(root, 'src/app/icon.png'), path.join(output, 'icons'));
const paths = await packager({ icon, dir: shell, out: path.join(output, process.argv.includes('--qualification') ? 'qualification-apps' : 'apps'), name: 'DreamCut', appBundleId: 'app.dreamcut.editor', platform: process.platform, arch: process.arch, extendInfo: {NSMicrophoneUsageDescription: 'Dictate an editing message locally on this device.'}, electronVersion: pkg.devDependencies.electron, overwrite: true, asar: false, prune: false, derefSymlinks: false, tmpdir: false });
for (const outputPath of paths) {
  const resources = process.platform === 'darwin' ? path.join(outputPath, 'DreamCut.app', 'Contents', 'Resources') : path.join(outputPath, 'resources');
  // macOS/APFS clone copies avoid doubling the staged media/runtime bytes.
  // These are independent copy-on-write files, not links to a disposable stage.
  for (const source of [service, path.join(stage, 'media-tools'), path.join(output, 'voice')]) await copyRuntime(source, path.join(resources, path.basename(source)));
  await relocatePackageLinks(resources, stage);
  if (process.platform === 'win32') {
    // ZIP extraction must not require symlink privilege on the destination PC.
    const flat = resources + '-portable';
    await fs.cp(resources, flat, {recursive:true, dereference:true});
    await fs.rm(resources, {recursive:true, force:true});
    await fs.rename(flat, resources);
  }
  // Sign only after every resource and relocated symlink is final. Packager's
  // built-in signing hook runs before our APFS resource copies and cannot be used.
  if (release.sign) {
    const packageRequire = createRequire(require.resolve('@electron/packager'));
    const { signAsync } = packageRequire('@electron/osx-sign');
    const appPath = path.join(outputPath, 'DreamCut.app');
    const mediaManifest = JSON.parse(await fs.readFile(path.join(resources, 'media-tools/manifest.json'), 'utf8'));
    await signAsync({ app: appPath, identity: release.identity, platform: 'darwin', type: 'distribution',
      binaries: [...mediaManifest.files.map(file => path.join(resources, 'media-tools', file.path)), path.join(resources,'voice','whisper-cli')],
      optionsForFile: () => ({ hardenedRuntime: true }) });
    execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', appPath]);
    if (release.notarize) {
      const { notarize } = packageRequire('@electron/notarize');
      await notarize({ appPath, keychainProfile: release.keychainProfile });
      execFileSync('/usr/bin/xcrun', ['stapler', 'validate', appPath]);
    }
  }
}
console.log(paths.join('\n'));
