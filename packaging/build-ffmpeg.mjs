#!/usr/bin/env node
/**
 * Build the FFmpeg and ffprobe that an installed DreamCut ships (media-tools/ in the web runtime), from pinned
 * source releases, with only the libraries DreamCut uses: x264 and vid.stab (GPL), libvpx (VP9 with
 * alpha), Opus, LAME, and FreeType with HarfBuzz (drawtext, for frame-check labels), plus macOS's VideoToolbox
 * and AudioToolbox. HEVC is decoded natively; nothing a creator runs encodes it (only dev fixtures). Every
 * library is static, so the programs depend on nothing outside the system.
 *
 * The result is GPL-2.0-or-later. Distributing it requires its licences and its complete corresponding source,
 * so this also writes dreamcut-media-source-<platform>-<id>.tar.gz (every source archive here, this script and
 * the exact configure lines); packaging/build-web-runtime.mjs publishes it beside the runtime archives.
 *
 *   node packaging/build-ffmpeg.mjs     into dist/media-tools/<platform>-<arch>/ (sources cached in .desktop-build/ffmpeg)
 *   ... --reuse-libraries               keep the libraries a previous run built and rebuild FFmpeg only (iterating, not releases)
 *
 * Needs Xcode's command-line tools, cmake, git, pkg-config and uv (it runs pinned Meson and Ninja for HarfBuzz).
 * macOS only for now.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

/** Source releases and their published SHA-256 (the same pins as Homebrew's formulas); x264 releases as a git commit. */
export const SOURCES = [
  { name: 'x264', version: 'r3222', git: 'https://code.videolan.org/videolan/x264.git', commit: 'b35605ace3ddf7c1a5d67a2eb553f034aef41d55', license: 'GPL-2.0-or-later', notices: ['COPYING'] },
  { name: 'vid.stab', version: '1.1.2', url: 'https://github.com/georgmartius/vid.stab/archive/refs/tags/v1.1.2.tar.gz', sha256: '96db34d48a9e3aa13736a48744b56dfb76731ac9bb5193c716de8534c9fd709d', license: 'GPL-2.0-or-later', notices: ['LICENSE'] },
  { name: 'libvpx', version: '1.17.0', url: 'https://github.com/webmproject/libvpx/archive/refs/tags/v1.17.0.tar.gz', sha256: '1020f184046187baa2985dbde38e0691f49c44088bca7a1842b0236c6081dc0a', license: 'BSD-3-Clause', notices: ['LICENSE', 'PATENTS'] },
  { name: 'opus', version: '1.6.1', url: 'https://ftp.osuosl.org/pub/xiph/releases/opus/opus-1.6.1.tar.gz', sha256: '6ffcb593207be92584df15b32466ed64bbec99109f007c82205f0194572411a1', license: 'BSD-3-Clause', notices: ['COPYING'] },
  { name: 'lame', version: '4.0', url: 'https://downloads.sourceforge.net/project/lame/lame/4.0/lame-4.0.tar.gz', sha256: '3df5124d5ad3a98312ffd7ba6a9b36230e4f8a3e66d3ce0f425e336c32d216eb', license: 'LGPL-2.0-or-later', notices: ['COPYING'] },
  { name: 'freetype', version: '2.15.0', url: 'https://downloads.sourceforge.net/project/freetype/freetype2/2.15.0/freetype-2.15.0.tar.xz', sha256: '93cd47eb719c325107f2d3cf087d06299e944c3b48a40b55537302304dea1dd5', license: 'FTL or GPL-2.0-or-later', notices: ['LICENSE.TXT', 'docs/FTL.TXT', 'docs/GPLv2.TXT'] },
  { name: 'harfbuzz', version: '15.0.0', url: 'https://github.com/harfbuzz/harfbuzz/releases/download/15.0.0/harfbuzz-15.0.0.tar.xz', sha256: '968536e9abd782f07f7954044c0c4020199fcdd39b41d221ec42d2a3be4a44df', license: 'MIT', notices: ['COPYING'] },
  { name: 'ffmpeg', version: '9.0.2', url: 'https://ffmpeg.org/releases/ffmpeg-9.0.2.tar.xz', sha256: '8c3850283eb25fa026482078a04051e0be17347b09ef81a0849bec15a96e002e', license: 'GPL-2.0-or-later (as configured)', notices: ['COPYING.GPLv2', 'LICENSE.md'] },
];

const FFMPEG_CONFIGURE = [
  '--enable-gpl', '--disable-shared', '--enable-static', '--pkg-config-flags=--static',
  // Only what is named here: autodetection would link whatever else happens to be installed (Homebrew's xz, SDL…).
  '--disable-autodetect', '--enable-zlib', '--enable-bzlib', '--enable-iconv', '--enable-videotoolbox', '--enable-audiotoolbox',
  '--enable-libx264', '--enable-libvidstab', '--enable-libvpx', '--enable-libopus', '--enable-libmp3lame', '--enable-libfreetype', '--enable-libharfbuzz',
  // Networking stays: FFmpeg reads the editor's own media from its local server (http://127.0.0.1).
  '--disable-ffplay', '--disable-doc', '--disable-debug',
];
/** What DreamCut asks of FFmpeg (encoders and filters it names); the build is refused without any of them. */
export const REQUIRED = {
  encoders: ['libx264', 'libvpx-vp9', 'aac', 'libopus', 'libmp3lame', 'prores_ks', 'png', 'mjpeg', 'pcm_s16le'],
  decoders: ['hevc', 'h264', 'prores', 'vp9'],
  protocols: ['http', 'file'],
  filters: ['vidstabdetect', 'vidstabtransform', 'drawtext', 'colorspace', 'lut3d', 'loudnorm', 'ebur128', 'overlay', 'xfade', 'atempo', 'alphamerge', 'showwavespic', 'acompressor', 'alimiter'],
};

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const key = `${process.platform}-${process.arch}`;

const sha256 = file => new Promise((resolve, reject) => {
  const hash = createHash('sha256');
  fs.createReadStream(file).on('data', chunk => hash.update(chunk)).on('end', () => resolve(hash.digest('hex'))).on('error', reject);
});
const run = (command, args, options = {}) => execFileSync(command, args, { stdio: 'inherit', ...options });

async function main() {
  if (process.platform !== 'darwin') throw new Error('build-ffmpeg builds on macOS only; Windows uses desktop/windows-media-tools.mjs.');
  const work = path.join(repo, '.desktop-build', 'ffmpeg');
  const downloads = path.join(work, 'downloads'), build = path.join(work, `build-${key}`), prefix = path.join(work, `prefix-${key}`);
  const out = path.join(repo, 'dist', 'media-tools', key);
  fs.mkdirSync(downloads, { recursive: true });
  const reuse = process.argv.includes('--reuse-libraries');
  if (!reuse) {
    fs.rmSync(build, { recursive: true, force: true });
    fs.rmSync(prefix, { recursive: true, force: true });
  }
  fs.mkdirSync(build, { recursive: true });

  // Fetch and verify every source; the same files become the corresponding-source archive.
  const archives = [];
  for (const source of SOURCES) {
    if (source.git) {
      const file = path.join(downloads, `${source.name}-${source.commit}.tar.gz`);
      if (!fs.existsSync(file)) {
        const checkout = path.join(work, `${source.name}-git`);
        fs.rmSync(checkout, { recursive: true, force: true });
        run('git', ['init', '--quiet', checkout]);
        run('git', ['-C', checkout, 'fetch', '--quiet', '--depth=1', source.git, source.commit]);
        const fetched = execFileSync('git', ['-C', checkout, 'rev-parse', 'FETCH_HEAD'], { encoding: 'utf8' }).trim();
        if (fetched !== source.commit) throw new Error(`${source.name} fetched ${fetched}, not ${source.commit}.`);
        run('git', ['-C', checkout, 'archive', '--format=tar.gz', `--prefix=${source.name}/`, '-o', file, source.commit]);
        fs.rmSync(checkout, { recursive: true, force: true });
      }
      archives.push({ ...source, file });
      continue;
    }
    const file = path.join(downloads, path.basename(new URL(source.url).pathname).replace(/^v/, `${source.name}-`));
    if (!fs.existsSync(file) || await sha256(file) !== source.sha256) {
      console.log(`Downloading ${source.name} ${source.version}…`);
      const response = await fetch(source.url);
      if (!response.ok || !response.body) throw new Error(`${source.name} download failed (${response.status}).`);
      await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(`${file}.partial`));
      fs.renameSync(`${file}.partial`, file);
    }
    if (await sha256(file) !== source.sha256) throw new Error(`${source.name} does not match its published checksum.`);
    archives.push({ ...source, file });
  }
  const unpack = source => {
    const dir = path.join(build, source.name);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    run('tar', ['-xf', source.file, '-C', dir, '--strip-components=1']);
    return dir;
  };
  const jobs = String(Math.max(2, os.cpus().length));
  const env = {
    ...process.env,
    // Only this prefix: nothing from Homebrew may be found or linked.
    PKG_CONFIG_LIBDIR: path.join(prefix, 'lib', 'pkgconfig'), PKG_CONFIG_PATH: '',
    PATH: `${path.join(prefix, 'bin')}:/usr/bin:/bin:/usr/sbin:/sbin:${path.dirname(execFileSync('/usr/bin/which', ['cmake'], { encoding: 'utf8' }).trim())}`,
    CFLAGS: '-O2 -mmacosx-version-min=13.0', CXXFLAGS: '-O2 -mmacosx-version-min=13.0', LDFLAGS: '-mmacosx-version-min=13.0',
    MACOSX_DEPLOYMENT_TARGET: '13.0',
  };
  const byName = Object.fromEntries(archives.map(source => [source.name, source]));
  const sh = (cwd, command, args) => run(command, args, { cwd, env });
  const configureLines = {};
  const autotools = (name, args) => {
    const dir = unpack(byName[name]);
    configureLines[name] = ['--prefix=<prefix>', '--disable-shared', '--enable-static', ...args];
    sh(dir, './configure', [`--prefix=${prefix}`, '--disable-shared', '--enable-static', ...args]);
    sh(dir, 'make', [`-j${jobs}`]);
    sh(dir, 'make', ['install']);
  };
  const cmake = (name, sourceSubdir, args) => {
    const dir = unpack(byName[name]);
    configureLines[name] = ['-DCMAKE_BUILD_TYPE=Release', '-DBUILD_SHARED_LIBS=OFF', ...args];
    sh(dir, 'cmake', ['-S', path.join(dir, sourceSubdir), '-B', path.join(dir, 'out'), `-DCMAKE_INSTALL_PREFIX=${prefix}`, '-DCMAKE_BUILD_TYPE=Release', '-DBUILD_SHARED_LIBS=OFF', '-DCMAKE_OSX_DEPLOYMENT_TARGET=13.0', ...args]);
    sh(dir, 'cmake', ['--build', path.join(dir, 'out'), '--parallel', jobs]);
    sh(dir, 'cmake', ['--install', path.join(dir, 'out')]);
  };

  /** Build one library unless --reuse-libraries finds it built by an earlier run (its configure line kept beside it). */
  const library = (name, args, build) => {
    const marker = path.join(prefix, `built-${name}.json`);
    if (reuse && fs.existsSync(marker)) {
      configureLines[name] = JSON.parse(fs.readFileSync(marker, 'utf8'));
      unpack(byName[name]); // for its licence files
      return;
    }
    build();
    configureLines[name] ??= args;
    fs.writeFileSync(marker, JSON.stringify(configureLines[name]));
  };
  const autotoolsLibrary = (name, args) => library(name, null, () => autotools(name, args));
  const cmakeLibrary = (name, sourceSubdir, args) => library(name, null, () => cmake(name, sourceSubdir, args));
  autotoolsLibrary('x264', ['--enable-pic', '--disable-cli', '--bit-depth=all']);
  cmakeLibrary('vid.stab', '.', ['-DUSE_OMP=OFF']);
  library('libvpx', null, () => {
    const dir = unpack(byName.libvpx);
    configureLines.libvpx = ['--prefix=<prefix>', '--disable-shared', '--enable-static', '--enable-pic', '--enable-vp9-highbitdepth', '--disable-examples', '--disable-tools', '--disable-docs', '--disable-unit-tests'];
    sh(dir, './configure', [`--prefix=${prefix}`, ...configureLines.libvpx.slice(1)]);
    sh(dir, 'make', [`-j${jobs}`]);
    sh(dir, 'make', ['install']);
  });
  autotoolsLibrary('opus', ['--disable-doc', '--disable-extra-programs']);
  autotoolsLibrary('lame', ['--disable-frontend', '--disable-decoder']);
  autotoolsLibrary('freetype', ['--without-zlib', '--without-bzip2', '--without-png', '--without-harfbuzz', '--without-brotli']);
  library('harfbuzz', null, () => {
    const dir = unpack(byName.harfbuzz);
    // Only the shaping library, against the FreeType above; pinned Meson and Ninja run through uv.
    configureLines.harfbuzz = ['--default-library=static', '--buildtype=release', '-Dfreetype=enabled', '-Dglib=disabled', '-Dgobject=disabled', '-Dcairo=disabled', '-Dchafa=disabled', '-Dpng=disabled', '-Dzlib=disabled', '-Dicu=disabled', '-Dgraphite=disabled', '-Dfontations=disabled', '-Dharfrust=disabled', '-Dkbts=disabled', '-Dwasm=disabled', '-Dcoretext=disabled', '-Draster=disabled', '-Dvector=disabled', '-Dgpu=disabled', '-Dsubset=disabled', '-Dtests=disabled', '-Dintrospection=disabled', '-Ddocs=disabled', '-Dutilities=disabled', '-Dbenchmark=disabled'];
    const meson = ['--from', 'meson==1.9.1', '--with', 'ninja==1.13.0'];
    sh(dir, 'uvx', [...meson, 'meson', 'setup', 'out', `--prefix=${prefix}`, '--libdir=lib', ...configureLines.harfbuzz]);
    sh(dir, 'uvx', [...meson, 'meson', 'install', '-C', 'out']);
  });
  {
    const dir = unpack(byName.ffmpeg);
    configureLines.ffmpeg = ['--prefix=<prefix>', ...FFMPEG_CONFIGURE];
    sh(dir, './configure', [`--prefix=${prefix}`, ...FFMPEG_CONFIGURE, `--extra-cflags=-I${path.join(prefix, 'include')}`, `--extra-ldflags=-L${path.join(prefix, 'lib')}`, '--extra-libs=-lc++ -liconv']);
    sh(dir, 'make', [`-j${jobs}`]);
    sh(dir, 'make', ['install']);
  }

  // The programs, their licences, and checks that they need nothing outside macOS and do what DreamCut asks.
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(path.join(out, 'bin'), { recursive: true });
  for (const program of ['ffmpeg', 'ffprobe']) {
    fs.copyFileSync(path.join(prefix, 'bin', program), path.join(out, 'bin', program));
    fs.chmodSync(path.join(out, 'bin', program), 0o755);
    const linked = execFileSync('/usr/bin/otool', ['-L', path.join(out, 'bin', program)], { encoding: 'utf8' }).split('\n').slice(1).map(line => line.trim().split(' (')[0]).filter(Boolean);
    const outside = linked.filter(file => !file.startsWith('/usr/lib/') && !file.startsWith('/System/Library/'));
    if (outside.length) throw new Error(`${program} links outside macOS: ${outside.join(', ')}`);
  }
  const ffmpeg = path.join(out, 'bin', 'ffmpeg');
  const list = kind => execFileSync(ffmpeg, ['-hide_banner', `-${kind}`], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin' } });
  const encoders = list('encoders'), filters = list('filters');
  const decoders = list('decoders'), protocols = list('protocols');
  const has = (text, name) => new RegExp(`(^|\\s)${name}(\\s|$)`, 'm').test(text);
  const missing = [...REQUIRED.encoders.filter(name => !has(encoders, name)), ...REQUIRED.decoders.filter(name => !has(decoders, name)),
    ...REQUIRED.filters.filter(name => !has(filters, name)), ...REQUIRED.protocols.filter(name => !has(protocols, name)).map(name => `${name} protocol`)];
  if (missing.length) throw new Error(`The FFmpeg build lacks ${missing.join(', ')}.`);
  for (const source of archives) {
    const dir = path.join(out, 'notices', source.name);
    fs.mkdirSync(dir, { recursive: true });
    for (const notice of source.notices) {
      const from = path.join(build, source.name, notice);
      if (!fs.existsSync(from)) throw new Error(`${source.name} has no ${notice}.`);
      fs.copyFileSync(from, path.join(dir, path.basename(notice)));
    }
  }

  // Corresponding source: the verified archives, this script and the configure lines, in one file.
  const sourceDir = path.join(work, `source-${key}`);
  fs.rmSync(sourceDir, { recursive: true, force: true });
  fs.mkdirSync(sourceDir, { recursive: true });
  for (const source of archives) fs.copyFileSync(source.file, path.join(sourceDir, path.basename(source.file)));
  fs.copyFileSync(fileURLToPath(import.meta.url), path.join(sourceDir, 'build-ffmpeg.mjs'));
  const manifest = {
    schemaVersion: 1, platform: key, license: 'GPL-2.0-or-later',
    version: list('version').split('\n')[0],
    sources: archives.map(({ name, version, url, git, commit, sha256: checksum, license }) => ({ name, version, license, ...(git ? { git, commit } : { url, sha256: checksum }), archive: path.basename(byName[name].file) })),
    configure: configureLines,
  };
  fs.writeFileSync(path.join(sourceDir, 'BUILD.json'), JSON.stringify(manifest, null, 2));
  const id = createHash('sha256').update(JSON.stringify(manifest)).digest('hex').slice(0, 16);
  const sourceArchive = path.join(repo, 'dist', 'media-tools', `dreamcut-media-source-${key}-${id}.tar.gz`);
  for (const entry of fs.readdirSync(path.dirname(sourceArchive))) if (entry.startsWith(`dreamcut-media-source-${key}-`)) fs.rmSync(path.join(path.dirname(sourceArchive), entry));
  run('tar', ['-czf', sourceArchive, '-C', path.dirname(sourceDir), path.basename(sourceDir)]);
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({ ...manifest, sourceArchive: path.basename(sourceArchive), files: await Promise.all(['ffmpeg', 'ffprobe'].map(async program => ({ path: `bin/${program}`, sha256: await sha256(path.join(out, 'bin', program)) }))) }, null, 2));
  fs.writeFileSync(path.join(out, 'README.txt'), [
    'FFmpeg and ffprobe for DreamCut, built from unmodified source releases.',
    'These programs are free software under the GNU General Public License, version 2 or later (notices/ffmpeg/COPYING.GPLv2);',
    'the libraries they include keep their own licences (notices/). DreamCut runs them as separate programs.',
    `The complete corresponding source and build script are published beside this DreamCut release as ${path.basename(sourceArchive)}.`,
    '',
  ].join('\n'));
  console.log(`Built ${out} and ${path.relative(repo, sourceArchive)}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`build-ffmpeg: ${error.message}`); process.exit(1); });
}
