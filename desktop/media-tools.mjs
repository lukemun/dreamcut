import { bundleWindowsMediaTools } from './windows-media-tools.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const run = (command, args) => execFileSync(command, args, { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
const systemLibrary = file => file.startsWith('/usr/lib/') || file.startsWith('/System/Library/');
const dependencies = file => run('/usr/bin/otool', ['-L', file]).split('\n').slice(1)
  .map(line => line.trim().split(' (compatibility')[0]).filter(Boolean);
const rpaths = file => [...run('/usr/bin/otool', ['-l', file]).matchAll(/cmd LC_RPATH\n\s*cmdsize \d+\n\s*path (.*?) \(offset/g)].map(match => match[1]);
const sha256 = async file => createHash('sha256').update(await fs.readFile(file)).digest('hex');

export async function bundleMediaTools(destination, { ffmpeg, ffprobe } = {}) {
  if (process.platform === 'win32') return bundleWindowsMediaTools(destination);
  if (process.platform !== 'darwin') throw Error('Media tool bundling currently supports macOS only.');
  const entries = {
    ffmpeg: await fs.realpath(ffmpeg || run('/usr/bin/which', ['ffmpeg']).trim()),
    ffprobe: await fs.realpath(ffprobe || run('/usr/bin/which', ['ffprobe']).trim()),
  };
  const files = new Map();
  const names = new Map();
  const expand = (value, file, executable) => value.replace('@loader_path', path.dirname(file)).replace('@executable_path', path.dirname(executable));
  async function visit(file, executable, entryName) {
    file = await fs.realpath(file);
    if (files.has(file)) return files.get(file);
    const name = entryName ? `bin/${entryName}` : `lib/${path.basename(file)}`;
    if (names.has(name) && names.get(name) !== file) throw Error(`Media dependency filename collision: ${name}`);
    names.set(name, file);
    const item = { name, file, links: [], sourceSha256: await sha256(file) };
    files.set(file, item);
    for (const dependency of dependencies(file)) {
      if (systemLibrary(dependency)) continue;
      const candidates = dependency.startsWith('@rpath/')
        ? [...rpaths(file), ...rpaths(executable)].map(prefix => path.join(expand(prefix, file, executable), dependency.slice(7)))
        : [expand(dependency, file, executable)];
      let resolved;
      for (const candidate of candidates) {
        try { resolved = await fs.realpath(candidate); break; } catch {}
      }
      if (!resolved) throw Error(`Unresolved media dependency: ${dependency}`);
      if (resolved === file) continue; // dylib's own install name
      const target = await visit(resolved, executable);
      item.links.push({ original: dependency, name: target.name });
    }
    return item;
  }
  for (const [name, file] of Object.entries(entries)) await visit(file, file, name);
  // This destination is generated staging, never an installed tool directory.
  await fs.mkdir(path.join(destination, 'bin'), { recursive: true });
  await fs.mkdir(path.join(destination, 'lib'), { recursive: true });
  const packages = new Map();
  for (const item of files.values()) {
    const dest = path.join(destination, item.name);
    await fs.copyFile(item.file, dest);
    await fs.chmod(dest, 0o755);
    const args = [];
    if (item.name.startsWith('lib/')) args.push('-id', `@loader_path/${path.basename(item.name)}`);
    for (const link of item.links) args.push('-change', link.original, `@loader_path/${path.relative(path.dirname(item.name), link.name)}`);
    if (args.length) run('/usr/bin/install_name_tool', [...args, dest]);
    const match = item.file.match(/^(.*\/Cellar\/([^/]+)\/([^/]+))\//);
    if (match) packages.set(`${match[2]}@${match[3]}`, match[1]);
  }
  // Sign only copied files after load-command edits; installed originals are untouched.
  for (const item of files.values()) run('/usr/bin/codesign', ['--force', '--sign', '-', path.join(destination, item.name)]);
  for (const item of files.values()) {
    const dest = path.join(destination, item.name);
    if (dependencies(dest).some(value => !systemLibrary(value) && !value.startsWith('@loader_path/'))) throw Error('Bundled media tool still references an external library.');
  }
  const notices = [];
  for (const [name, directory] of packages) {
    const target = path.join(destination, 'notices', name);
    await fs.mkdir(target, { recursive: true });
    const selected = (await fs.readdir(directory)).filter(name => /^(COPYING|LICENSE|LICENCE|NOTICE)(\b|[._-])/i.test(name));
    for (const file of selected) {
      const stat = await fs.stat(path.join(directory, file));
      if (stat.isFile()) await fs.copyFile(path.join(directory, file), path.join(target, file));
    }
    notices.push({ package: name, files: selected });
  }
  const manifest = {
    purpose: 'Local desktop qualification; distribution source/notices audit is incomplete.',
    distributionReady: false, platform: process.platform, arch: process.arch,
    version: run(entries.ffmpeg, ['-version']).split('\n')[0],
    configuration: run(entries.ffmpeg, ['-buildconf']),
    files: await Promise.all([...files.values()].map(async item => ({ path: item.name, sourceSha256: item.sourceSha256,
      bundledSha256: await sha256(path.join(destination, item.name)) }))), notices,
  };
  await fs.writeFile(path.join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await fs.writeFile(path.join(destination, 'README.txt'), 'Local QA media tools. Installed originals are unchanged.\nThis build includes GPL-enabled FFmpeg and third-party libraries.\nDo not publish until corresponding source, build recipes, notices and distribution obligations have been reviewed.\nSee https://ffmpeg.org/legal.html and notices/.\n');
  for (const name of Object.keys(entries)) execFileSync(path.join(destination, 'bin', name), ['-version'], { env: { PATH: '/usr/bin:/bin' }, stdio: 'ignore' });
  return { files: files.size, packages: packages.size };
}
