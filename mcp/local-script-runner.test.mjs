import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { localScriptCommand, runLocalEditorScript } from './local-script-runner.mjs';

test('local script selection is fixed and arguments cannot become Node options', () => {
  const result = localScriptCommand('/fixture', 'project-health', ['--eval', 'ignored']);
  assert.equal(result.executable, process.execPath);
  assert.deepEqual(result.args, ['--import', 'tsx', '/fixture/scripts/project-health.ts', '--eval', 'ignored']);
  for (const name of ['render', '../outside', 'constructor']) assert.throws(() => localScriptCommand('/fixture', name, []), /Unsupported/);
});

test('local runner uses the current runtime, bounds output and stops timed-out commands', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dreamcut-script-runner-'));
  try {
    await fs.mkdir(path.join(root, 'scripts'));
    await fs.symlink(path.resolve('node_modules'), path.join(root, 'node_modules'));
    const fixture = path.join(root, 'scripts/project-health.ts');
    await fs.writeFile(fixture, 'process.stdout.write("x".repeat(250000)); process.stderr.write("detail"); process.exitCode=3;');
    const result = await runLocalEditorScript(root, 'project-health', [], 5000);
    assert.equal(result.exit_code, 3); assert.equal(result.stdout.length, 200000); assert.equal(result.stderr, 'detail');
    await fs.writeFile(fixture, 'process.on("SIGTERM",()=>{});setInterval(()=>{},1000);');
    await assert.rejects(runLocalEditorScript(root, 'project-health', [], 150), /timed out/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('desktop tool runtime passes only host-selected basic runtime fields', async () => {
  const { editingMcpRuntimeEnv } = await import('./harness-mcp.mjs');
  assert.deepEqual(editingMcpRuntimeEnv({ PATH: '/bundled/bin:/usr/bin:/bin', HOME: '/fixture',
    NODE_OPTIONS: '--require /outside', SENTRY_DSN: 'private', API_KEY: 'private', ELECTRON_RUN_AS_NODE: '0' }),
    { PATH: '/bundled/bin:/usr/bin:/bin', HOME: '/fixture' });
});


test('helper exit and timeout clean up nested processes holding output pipes', { skip: process.platform === 'win32', timeout: 15000 }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dreamcut-nested-helper-'));
  const descendants = [];
  try {
    await fs.mkdir(path.join(root, 'scripts'));
    await fs.symlink(path.resolve('node_modules'), path.join(root, 'node_modules'));
    for (const mode of ['exit', 'timeout', 'cancel']) {
      const pidFile = path.join(root, `${mode}.pid`);
      await fs.writeFile(path.join(root, 'scripts/project-health.ts'), `
        const {spawn}=require('node:child_process');
        const fs=require('node:fs');
        const child=spawn(process.execPath,['-e','process.on("SIGTERM",()=>{});setInterval(()=>{},1000)'],{stdio:['ignore',1,2]});
        fs.writeFileSync(${JSON.stringify(pidFile)},String(child.pid));
        ${mode === 'exit' ? 'process.exit(0);' : 'setInterval(()=>{},1000);'}
      `);
      let started = Date.now();
      const controller = new AbortController();
      const run = runLocalEditorScript(root, 'project-health', [], 2000, controller.signal);
      if (mode === 'cancel') {
        const cancelled = assert.rejects(run, /cancelled: session closed/);
        // Cancel only once the nested child exists. Starting the helper through tsx can take
        // over a second on a CI runner; cancelling earlier leaves no descendant to check.
        for (let attempt = 0; attempt < 500; attempt++) {
          try { await fs.access(pidFile); break; } catch (error) { if (error.code !== 'ENOENT') throw error; }
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        await fs.access(pidFile);
        started = Date.now();
        controller.abort();
        await cancelled;
        await assert.rejects(runLocalEditorScript('/does-not-exist', 'project-health', [], 2000, controller.signal), /cancelled: session closed/);
      }
      if (mode === 'exit') assert.equal((await run).exit_code, 0);
      else if (mode === 'timeout') await assert.rejects(run, /timed out/);
      assert.ok(Date.now() - started < 5000, 'inherited pipes must not keep completion pending');
      const pid = Number(await fs.readFile(pidFile, 'utf8'));
      descendants.push(pid);
      let alive = true;
      for (let attempt = 0; attempt < 100 && alive; attempt++) {
        try { process.kill(pid, 0); }
        catch (error) { if (error.code === 'ESRCH') alive = false; else throw error; }
        if (alive) await new Promise(resolve => setTimeout(resolve, 20));
      }
      assert.equal(alive, false, `${mode} descendant must exit`);
      descendants.pop();
    }
  } finally {
    for (const pid of descendants) { try { process.kill(pid, 'SIGKILL'); } catch {} }
    await fs.rm(root, {recursive:true,force:true});
  }
});

test('invalid deadlines cannot silently overflow into an immediate timeout', () => {
  for (const deadline of [NaN, Infinity, -1, 0, 2147483648]) {
    assert.throws(() => runLocalEditorScript('/fixture', 'project-health', [], deadline), /Invalid local editor timeout/);
  }
});
