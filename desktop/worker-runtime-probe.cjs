const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const [root, scratch] = process.argv.slice(2);
const typed = path.join(scratch, 'typed.ts');
fs.writeFileSync(typed, 'const value: number = 42; console.log(value);\n');
const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1',
  TIMELINE_PROJECTS_DIR: path.join(scratch, 'projects'), DREAMCUT_PROFILE_DIR: path.join(scratch, 'profile') };
const run = args => {
  const result = spawnSync(process.execPath, ['--import', 'tsx', ...args], {
    cwd: root, env, encoding: 'utf8', timeout: 15000, maxBuffer: 16384,
  });
  return { status: result.status, stdout: result.stdout?.trim(), stderr: result.stderr?.slice(-2000), error: result.error?.code };
};
const typedResult = run([typed]);
const project = path.join(env.TIMELINE_PROJECTS_DIR, 'desktop-worker-fixture');
const media = path.join(project, 'media');
const queue = path.join(project, 'preprocess/media-preparation');
fs.mkdirSync(media, { recursive: true }); fs.mkdirSync(queue, { recursive: true });
const source = path.join(media, 'fixture.mp4');
const generated = spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=64x64:rate=30:duration=1',
  '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-shortest', source], { env, encoding: 'utf8', timeout: 10000 });
if (generated.status !== 0) throw Error(`Synthetic media unavailable: ${generated.stderr}`);
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const before = hash(source), stat = fs.statSync(source);
const recordPath = path.join(queue, createHash('sha256').update('fixture.mp4').digest('hex') + '.json');
fs.writeFileSync(recordPath, JSON.stringify({ recipe: 'editor-media-v1', source: 'fixture.mp4', size: stat.size,
  mtime: stat.mtimeMs, state: 'preparing', stage: 'queued', preview_quality: 'prepared', preview_policy_version: 2 }));
const preparation = run([path.join(root, 'scripts/prepare-media.ts'), 'desktop-worker-fixture']);
const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
let audioRms = 0;
if (record.audio) {
  const decoded = spawnSync('ffmpeg', ['-v', 'error', '-i', path.join(media, record.audio), '-f', 'f32le', '-ac', '1', '-ar', '48000', 'pipe:1'], { env, timeout: 10000, maxBuffer: 1048576 });
  if (decoded.status !== 0) throw Error('Prepared audio could not decode');
  let squares = 0;
  for (let i = 0; i + 4 <= decoded.stdout.length; i += 4) squares += decoded.stdout.readFloatLE(i) ** 2;
  audioRms = Math.sqrt(squares / (decoded.stdout.length / 4));
}
process.parentPort.postMessage({ typedResult, preparation,
  media: { state: record.state, error: record.error, frameCount: record.preview_probe?.frame_count,
    duration: record.duration, sourceUnchanged: before === hash(source), audioRms,
    previewExists: Boolean(record.preview && fs.existsSync(path.join(media, record.preview))) },
  lockExists: fs.existsSync(path.join(env.TIMELINE_PROJECTS_DIR, 'desktop-worker-fixture/preprocess/media-preparation/worker.lock')) });
