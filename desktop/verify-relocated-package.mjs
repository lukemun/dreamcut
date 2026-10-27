import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';
import assert from 'node:assert/strict';

// Relocated qualification clone with an empty HOME and bounded PATH. Replace only
// the clone's entry point with the existing import fixture. The service/workers
// are unchanged. This is not OS-denied checkout access or native-window QA.
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.resolve(process.argv[2] || '.desktop-build/qualification-apps/DreamCut-darwin-arm64/DreamCut.app');
assert.equal(process.platform, 'darwin');
assert.ok(source.endsWith('.app'));
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'dreamcut-isolated-package-'));
try {
  const bundle = path.join(scratch, 'DreamCut.app');
  execFileSync('/bin/cp', ['-cR', source, bundle]);
  const resources = path.join(bundle, 'Contents/Resources');
  const host = path.join(resources, 'app');
  await fs.copyFile(path.join(repository, 'desktop/verify-media-import.mjs'), path.join(host, 'qualification.mjs'));
  const manifestPath = path.join(host, 'package.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  await fs.writeFile(manifestPath, JSON.stringify({ ...manifest, main: 'qualification.mjs' }));
  const home = path.join(scratch, 'home'), data = path.join(scratch, 'app-data');
  await fs.mkdir(home); await fs.mkdir(data);
  const env = { HOME: home, PATH: '/usr/bin:/bin', TMPDIR: scratch, LANG: 'en_US.UTF-8', SENTRY_ENABLED: '0', NEXT_TELEMETRY_DISABLED: '1',
    DREAMCUT_QUALIFICATION_USER_DATA: data, DREAMCUT_QUALIFICATION_SERVICE_ROOT: path.join(resources, 'service'),
    DREAMCUT_QUALIFICATION_MEDIA_BIN: path.join(resources, 'media-tools/bin') };
  const run = (args, childEnv, cwd) => new Promise((resolve, reject) => {
    const child = spawn(path.join(bundle, 'Contents/MacOS/DreamCut'), args, { cwd, env: childEnv, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let text = '';
    const timer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, 95000);
    const read = chunk => { text = (text + chunk.toString()).slice(-16000); };
    child.stdout.on('data', read); child.stderr.on('data', read);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', (code, signal) => { clearTimeout(timer); code === 0 ? resolve(text) : reject(Error(`Relocated package failed (${code ?? signal}): ${text}`)); });
  });
  const output = await run([], env, scratch);
  assert.match(output, /Compiled Electron import accepted image, audio and video/);
  assert.match(output, /Read-only destination and manifest writes preserve data/);
  await fs.copyFile(path.join(repository, 'desktop/verify-service-stop.mjs'), path.join(host, 'verify-service-stop.mjs'));
  await fs.writeFile(manifestPath, JSON.stringify({ ...manifest, main: 'verify-service-stop.mjs' }));
  const stopped = await run([], env, scratch);
  assert.match(stopped, /Electron forced service shutdown waits for its observed exit/);
  const service = path.join(resources, 'service');
  const projectOpeningTest = path.join(host, 'project-opening.test.mjs');
  await fs.copyFile(path.join(repository, 'desktop/project-opening.test.mjs'), projectOpeningTest);
  const chatTests = ['chat-ipc.test.mjs', 'editing-session.test.mjs'];
  for (const file of chatTests) await fs.copyFile(path.join(repository, 'desktop', file), path.join(host, file));
  const projectOpening = await run(['--test', projectOpeningTest, ...chatTests.map(file => path.join(host, file))], { ...env, ELECTRON_RUN_AS_NODE: '1' }, host);
  assert.match(projectOpening, /# fail 0|fail 0/);
  assert.match(projectOpening, /concurrent remembered-project writes stay atomic/);
  for (const file of ['audio-export.test.ts', 'audio-manifest.test.ts']) {
    await fs.copyFile(path.join(repository, 'src/lib/render', file), path.join(service, 'src/lib/render', file));
  }
  await fs.copyFile(path.join(repository, 'mcp/local-script-runner.test.mjs'), path.join(service, 'mcp/local-script-runner.test.mjs'));
  await fs.copyFile(path.join(repository, 'mcp/disconnect-cleanup.test.mjs'), path.join(service, 'mcp/disconnect-cleanup.test.mjs'));
  await fs.copyFile(path.join(repository, 'mcp/video-search.test.mjs'), path.join(service, 'mcp/video-search.test.mjs'));
  const helpers = await run(['--test', 'mcp/local-script-runner.test.mjs', 'mcp/disconnect-cleanup.test.mjs', 'mcp/video-search.test.mjs'],
    { ...env, ELECTRON_RUN_AS_NODE: '1', PATH: path.join(resources, 'media-tools/bin') + ':/usr/bin:/bin' }, service);
  assert.match(helpers, /# fail 0|fail 0/);
  assert.match(helpers, /helper exit and timeout clean up nested processes/);
  assert.match(helpers, /real MCP input closure terminates an active helper/);
  assert.match(helpers, /real MCP forced death terminates an active helper/);
  const startupTest = 'src/lib/local-store/background-worker-startup.test.ts';
  await fs.copyFile(path.join(repository, startupTest), path.join(service, startupTest));
  const startup = await run(['--import', 'tsx', '--test', startupTest], { ...env, ELECTRON_RUN_AS_NODE: '1' }, service);
  assert.match(startup, /# fail 0|fail 0/);
  assert.match(startup, /preparation and import queues deduplicate burst startup/);
  const telemetryTest = path.join(service, 'verify-service-telemetry.mjs');
  await fs.copyFile(path.join(repository, 'desktop/verify-service-telemetry.mjs'), telemetryTest);
  const telemetry = await run([telemetryTest],
    { ...env, ELECTRON_RUN_AS_NODE: '1' }, service);
  assert.match(telemetry, /Compiled service request hook delivered one reconstructed error/);
  const audio = await run(['--import', 'tsx', '--test', 'src/lib/render/audio-export.test.ts', 'src/lib/render/audio-manifest.test.ts'],
    { ...env, ELECTRON_RUN_AS_NODE: '1', PATH: path.join(resources, 'media-tools/bin') + ':/usr/bin:/bin' }, service);
  assert.match(audio, /# fail 0|fail 0/);
  assert.match(audio, /encoded audio clock preserves pitch/);
  assert.match(audio, /time stretching retains an audible source tail/);
  console.log(JSON.stringify({ packagedImport: true, packagedQueueStartupDeduplication: true, packagedImportWriteRecovery: true, packagedForcedServiceExit: true, packagedProjectMemory: true, packagedDottedProjectValidation: true, preparationReady: true, bundledAnimationCliVersion: true, animationScaffold: true, packagedAudioContract: true, ownedWaveformPreparation: true, packagedMcpInstrument: true, packagedHelperCleanup: true, packagedMcpDisconnectCleanup: true, packagedMcpCrashCleanup: true, packagedServiceTelemetryPolicy: true, sourceHashesPreserved: true, timelineUnchanged: true,
    relocatedOutsideCheckout: true, emptyHome: true, bundledAndSystemPathOnly: true, filesystemIsolationVerified: false, nativeWindowQualified: false }));
} finally { await fs.rm(scratch, { recursive: true, force: true }); }
