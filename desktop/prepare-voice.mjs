// Build a pinned, CPU-only speech runtime on the target OS. No user audio involved.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const build = path.join(root, '.desktop-build');
const source = path.join(build, 'whisper-source');
const destination = path.join(build, 'voice');
const revision = 'd1be6fde11ac6e0407606b4e42fe72d34add8037'; // whisper.cpp v1.9.5
const modelRevision = '5359861c739e955e79d9a303bcbc70fb988958b1';
const modelSha256 = 'a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002';
const run = (command, args, cwd = root) => execFileSync(command, args, { cwd, stdio: 'inherit' });
const hash = async file => { const digest = createHash('sha256'); for await (const data of createReadStream(file)) digest.update(data); return digest.digest('hex'); };
await fs.mkdir(destination, { recursive: true });
const model = path.join(destination, 'ggml-base.en.bin');
if (await hash(model).catch(() => '') !== modelSha256) {
  const temporary = model + '.download';
  try {
    const response = await fetch(`https://huggingface.co/ggerganov/whisper.cpp/resolve/${modelRevision}/ggml-base.en.bin`, { signal: AbortSignal.timeout(300000) });
    if (!response.ok || !response.body) throw Error('Could not download the pinned speech model.');
    await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary));
    if (await hash(temporary) !== modelSha256) throw Error('Speech model checksum mismatch.');
    await fs.rename(temporary, model);
  } finally { await fs.rm(temporary, { force: true }); }
}
if (!await fs.access(path.join(source, '.git')).then(() => true, () => false)) {
  await fs.mkdir(source, { recursive: true }); run('git', ['init'], source);
}
run('git', ['fetch', '--depth=1', 'https://github.com/ggml-org/whisper.cpp.git', revision], source);
run('git', ['checkout', '--detach', revision], source);
run('cmake', ['-S', source, '-B', path.join(source, 'build'), '-DCMAKE_BUILD_TYPE=Release', '-DBUILD_SHARED_LIBS=OFF', '-DGGML_NATIVE=OFF', '-DGGML_METAL=OFF', '-DGGML_OPENMP=OFF', '-DWHISPER_BUILD_TESTS=OFF', '-DWHISPER_BUILD_EXAMPLES=ON', ...(process.platform === 'win32' ? ['-DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded', '-DGGML_AVX=OFF', '-DGGML_AVX2=OFF', '-DGGML_FMA=OFF', '-DGGML_F16C=OFF'] : [])]);
run('cmake', ['--build', path.join(source, 'build'), '--config', 'Release', '--target', 'whisper-cli', '--parallel', '2']);
const executable = process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli';
const binary = path.join(source, 'build', 'bin', ...(process.platform === 'win32' ? ['Release'] : []), executable);
await fs.copyFile(binary, path.join(destination, executable));
await fs.chmod(path.join(destination, executable), 0o755);
await fs.copyFile(path.join(source, 'LICENSE'), path.join(destination, 'LICENSE-whisper.cpp.txt'));
const license = await fetch('https://raw.githubusercontent.com/openai/whisper/v20250625/LICENSE', {signal:AbortSignal.timeout(30000)});
if (!license.ok) throw Error('Could not retrieve Whisper model license.');
await fs.writeFile(path.join(destination, 'LICENSE-model.txt'), await license.text());
await fs.writeFile(path.join(destination, 'manifest.json'), JSON.stringify({ schemaVersion:1, platform:process.platform, arch:process.arch, revision, modelRevision, model:'base.en', language:'en', files: await Promise.all([executable, 'ggml-base.en.bin', 'LICENSE-whisper.cpp.txt', 'LICENSE-model.txt'].map(async file => ({path:file, bytes:(await fs.stat(path.join(destination,file))).size, sha256:await hash(path.join(destination,file))}))) }, null, 2));
console.log(`Speech runtime prepared: ${destination}`);
