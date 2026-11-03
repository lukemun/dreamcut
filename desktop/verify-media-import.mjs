import { app, utilityProcess } from 'electron';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes, createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { stopDesktopService } from './service-shutdown.mjs';
import { waitForDesktopService } from './service-startup.mjs';
import { desktopRuntimeEnvironment } from './runtime-environment.mjs';
import { SESSION_COOKIE } from './service-policy.mjs';
import { guardServiceWorkers } from './service-worker-guard.mjs';

if (process.env.DREAMCUT_QUALIFICATION_USER_DATA) app.setPath('userData', process.env.DREAMCUT_QUALIFICATION_USER_DATA);

// Tests the same multipart endpoint as Library's file input, with no model calls.
void app.whenReady().then(async () => {
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'dreamcut-native-import-'));
  const root = path.resolve(process.env.DREAMCUT_QUALIFICATION_SERVICE_ROOT || process.argv[2] || '.desktop-build/stage/service');
  const project = path.join(scratch, 'My films — été/projects/fixture');
  const env = desktopRuntimeEnvironment({ HOME: process.env.HOME, PATH: '/usr/bin:/bin',
    TIMELINE_PROJECTS_DIR: path.dirname(project), DREAMCUT_PROFILE_DIR: path.join(scratch, 'profile'),
    SENTRY_ENABLED: '0', DREAMCUT_IMPORT_AUTOSTART: '0',
    DREAMCUT_SERVICE_ROOT: root, DREAMCUT_SERVICE_DEV: '0' });
  if (process.env.DREAMCUT_QUALIFICATION_MEDIA_BIN) env.PATH = process.env.DREAMCUT_QUALIFICATION_MEDIA_BIN + ':/usr/bin:/bin';
  const token = randomBytes(32).toString('hex');
  const digest = bytes => createHash('sha256').update(bytes).digest('hex');
  let service, mcp, exitCode = 1;
  const workerStarts = [];
  try {
    const animationVersion = execFileSync(process.execPath, [path.join(root, 'node_modules/hyperframes/bin/hyperframes.mjs'), '--version'], {
      env: { ...env, ELECTRON_RUN_AS_NODE: '1', HYPERFRAMES_NO_TELEMETRY: '1' }, timeout: 10000, encoding: 'utf8',
    }).trim();
    const animationPackage = JSON.parse(await fs.readFile(path.join(root, 'node_modules/hyperframes/package.json'), 'utf8'));
    assert.equal(animationVersion, animationPackage.version);
    await fs.mkdir(project, { recursive: true });
    const timeline = '{"elements":[],"fps":30}\n';
    await fs.writeFile(path.join(project, 'timeline.json'), timeline);
    const fixtures = [
      { name: 'Blue still.png', type: 'still', mime: 'image/png', args: ['-f', 'lavfi', '-i', 'color=c=blue:size=64x64', '-frames:v', '1', '-update', '1'] },
      { name: 'Són test.wav', type: 'music', mime: 'audio/wav', args: ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=1'] },
      { name: 'Video test.mp4', type: 'video_clip', mime: 'video/mp4', args: ['-f', 'lavfi', '-i', 'testsrc2=size=64x64:rate=30:duration=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p'] },
    ];
    for (const fixture of fixtures) {
      execFileSync('ffmpeg', ['-v', 'error', ...fixture.args, path.join(scratch, fixture.name)], { env, timeout: 10000 });
      fixture.bytes = await fs.readFile(path.join(scratch, fixture.name));
    }
    service = utilityProcess.fork(path.join(path.dirname(fileURLToPath(import.meta.url)), 'service.mjs'), [], {
      cwd: root, stdio: 'pipe', env: { ...env, DREAMCUT_SERVICE_TOKEN: token },
    });
    guardServiceWorkers(service);
    service.on('message', message => { if (message?.type === 'worker-started') workerStarts.push(message.pid); });
    service.stderr?.on('data', chunk => process.stderr.write(chunk));
    const origin = await waitForDesktopService(service, { timeoutMs: 30000 });
    const animation = await fetch(`${origin}/api/projects/fixture/hyperframes`, {
      method: 'POST', headers: { Cookie: `${SESSION_COOKIE}=${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', composition_id: 'blank-qa', resolution: 'landscape' }),
    });
    assert.equal(animation.status, 200, await animation.text());
    assert.ok((await fs.stat(path.join(project, 'hyperframes/blank-qa/index.html'))).isFile());
    assert.equal(await fs.readFile(path.join(project, 'timeline.json'), 'utf8'), timeline);
    for (const fixture of fixtures) {
      const body = new FormData();
      body.set('file', new File([fixture.bytes], fixture.name, { type: fixture.mime }));
      body.set('asset_type', fixture.type);
      const response = await fetch(`${origin}/api/projects/fixture/uploaded-assets`, {
        method: 'POST', headers: { Cookie: `${SESSION_COOKIE}=${token}` }, body,
      });
      const result = await response.json();
      assert.equal(response.status, 200, JSON.stringify(result));
      assert.equal(result.asset.storage_mode, 'managed_copy');
      assert.equal(result.processing.status, 'queued');
      fixture.assetId = result.asset.asset_id;
    }
    const manifest = JSON.parse(await fs.readFile(path.join(project, 'source-manifest.json'), 'utf8'));
    assert.equal(manifest.assets.length, 3);
    for (const fixture of fixtures) {
      const record = manifest.assets.find(asset => asset.asset_id === fixture.assetId);
      assert.equal(record.original_filename, fixture.name);
      assert.equal(record.storage_mode, 'managed_copy');
      assert.equal(record.source_path, null);
      assert.equal(record.source_sha256, digest(fixture.bytes));
      assert.equal(digest(await fs.readFile(path.join(project, 'media', record.media_path))), digest(fixture.bytes));
      assert.equal(digest(await fs.readFile(path.join(scratch, fixture.name))), digest(fixture.bytes));
    }
    const deadline = Date.now() + 30000;
    const queue = path.join(project, 'preprocess/media-preparation');
    let ready = false;
    while (!ready && Date.now() < deadline) {
      const records = await fs.readdir(queue);
      for (const file of records.filter(name => name.endsWith('.json'))) {
        const record = JSON.parse(await fs.readFile(path.join(queue, file), 'utf8'));
        if (record.state === 'failed') throw Error(record.error || 'Video preparation failed');
        if (record.state === 'ready') ready = true;
      }
      if (!ready) await new Promise(resolve => setTimeout(resolve, 50));
    }
    const workerLog = ready ? '' : await fs.readFile(path.join(queue, 'worker.log'), 'utf8').catch(() => 'No worker log was created.');
    assert.ok(ready, `imported video must become ready: ${workerLog.slice(-5000)}`);
    const audioFixture = fixtures.find(fixture => fixture.type === 'music');
    const audioRecord = manifest.assets.find(asset => asset.asset_id === audioFixture.assetId);
    const audioUrl = '/api/projects/fixture/media/' + audioRecord.media_path.split('/').map(encodeURIComponent).join('/');
    const startedBeforePeaks = workerStarts.length;
    const peaksResponse = await fetch(`${origin}/api/projects/fixture/timeline/peaks/prepare`, {
      method: 'POST', headers: { Cookie: `${SESSION_COOKIE}=${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sources: [audioUrl] }),
    });
    const peaks = await peaksResponse.json();
    assert.equal(peaksResponse.status, 200, JSON.stringify(peaks));
    assert.deepEqual(peaks.errors, []);
    assert.equal(peaks.items.length, 1);
    assert.ok(peaks.items[0].peaks.some(value => value > 0));
    assert.equal(workerStarts.length, startedBeforePeaks + 1, 'Waveform decode must register with the desktop worker owner');
    assert.equal(digest(await fs.readFile(path.join(project, 'media', audioRecord.media_path))), digest(audioFixture.bytes));
    // Exercise real filesystem refusal through the compiled upload route.
    assert.notEqual(process.getuid?.(), 0, 'Permission fixture requires an unprivileged user');
    const sourcesDirectory = path.join(project, 'media/sources');
    const beforeManifest = await fs.readFile(path.join(project, 'source-manifest.json'));
    const beforeFiles = (await fs.readdir(sourcesDirectory)).sort();
    const retryUpload = () => {
      const body = new FormData();
      body.set('file', new File([fixtures[0].bytes], 'Retry still.png', { type: 'image/png' }));
      body.set('asset_type', 'still');
      return fetch(`${origin}/api/projects/fixture/uploaded-assets`, {
        method: 'POST', headers: { Cookie: `${SESSION_COOKIE}=${token}` }, body,
      });
    };
    for (const deniedDirectory of [sourcesDirectory, project]) {
      const mode = (await fs.stat(deniedDirectory)).mode & 0o777;
      await fs.chmod(deniedDirectory, 0o500);
      try {
        const denied = await retryUpload(); const failure = await denied.json();
        assert.equal(denied.status, 500, JSON.stringify(failure));
        assert.match(failure.error, /EACCES|EPERM|permission denied/i);
      } finally { await fs.chmod(deniedDirectory, mode); }
      assert.deepEqual(await fs.readFile(path.join(project, 'source-manifest.json')), beforeManifest);
      assert.deepEqual((await fs.readdir(sourcesDirectory)).sort(), beforeFiles);
      assert.equal(await fs.readFile(path.join(project, 'timeline.json'), 'utf8'), timeline);
    }
    const retried = await retryUpload(); const retryResult = await retried.json();
    assert.equal(retried.status, 200, JSON.stringify(retryResult));
    const afterRetry = JSON.parse(await fs.readFile(path.join(project, 'source-manifest.json'), 'utf8'));
    assert.equal(afterRetry.assets.length, manifest.assets.length + 1);
    assert.equal(afterRetry.assets.filter(asset => asset.original_filename === 'Retry still.png').length, 1);
    assert.equal((await fs.readdir(sourcesDirectory)).length, beforeFiles.length + 1);
    assert.equal(digest(await fs.readFile(path.join(scratch, fixtures[0].name))), digest(fixtures[0].bytes));
    console.log('Read-only destination and manifest writes preserve data; retry adds exactly one asset');
    const { connectEditingMcp } = await import(pathToFileURL(path.join(root, 'mcp/harness-mcp.mjs')).href);
    mcp = await connectEditingMcp({ projectId: 'fixture', baseUrl: origin, serviceToken: token,
      projectsDirectory: path.dirname(project), families: ['visual-evidence'], runtimeEnv: env });
    let names = (await mcp.list()).map(tool => tool.name);
    const loaded = await mcp.call('capability_catalog', { action: 'load', id: 'visual-evidence' }, names);
    assert.ok(!loaded.isError);
    names = (await mcp.list()).map(tool => tool.name);
    const health = await mcp.call('run_instrument', { project_id: 'fixture', instrument: 'project-health' }, names);
    assert.ok(!health.isError, JSON.stringify(health));
    const healthPayload = health.structuredContent ?? JSON.parse(health.content.find(item => item.type === 'text').text);
    assert.equal(healthPayload.exit_code, 0, healthPayload.stderr);
    assert.match(healthPayload.stdout, /Project health: fixture/);
    assert.match(healthPayload.stdout, /0 active \/ 0 stored/);
    await mcp.close(); mcp = undefined;
    assert.equal(await fs.readFile(path.join(project, 'timeline.json'), 'utf8'), timeline);
    console.log('Compiled Electron import accepted image, audio and video; copied bytes and provenance match, video is ready, and timeline is unchanged. Optional model analysis stayed queued.');
    exitCode = 0;
  } catch (error) { console.error(error.message); }
  finally {
    await mcp?.close();
    await stopDesktopService(service);
    await fs.rm(scratch, { recursive: true, force: true });
    app.exit(exitCode);
  }
});
