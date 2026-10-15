import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import path from 'node:path';

const electron = createRequire(import.meta.url)('electron');
const child = spawn(electron, [fileURLToPath(new URL('./codex-crash-probe.mjs', import.meta.url))], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, SENTRY_ENABLED: '0', ...(process.argv[2] ? { DREAMCUT_QA_CODEX_HOST_ROOT: path.resolve(process.argv[2]) } : {}) } });
let pid;
const alive = group => { try { process.kill(group, 0); return true; } catch (error) { if (error.code === 'ESRCH') return false; if (error.code === 'EPERM') return true; throw error; } };
try {
  pid = await new Promise((resolve, reject) => {
    let output = '', errors = '';
    const timer = setTimeout(() => reject(Error(`Codex crash fixture timed out: ${errors}`)), 20000);
    child.stderr.on('data', data => { errors = (errors + data).slice(-2000); });
    child.stdout.on('data', data => {
      output += data;
      const match = output.match(/DREAMCUT_CODEX_FIXTURE:(\d+)\n/);
      if (match) { clearTimeout(timer); resolve(Number(match[1])); }
    });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(Error(`Crash fixture exited before readiness (${code}): ${errors}`)); });
  });
  assert.ok(Number.isSafeInteger(pid) && pid > 1);
  const exited = new Promise(resolve => child.once('exit', resolve));
  child.kill('SIGKILL');
  await exited;
  const deadline = Date.now() + 5000;
  while (alive(-pid) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
  const result = { electronHostKilled: true, codexTransportGroupExited: !alive(-pid), modelCalls: 0 };
  console.log(JSON.stringify(result));
  assert.equal(result.codexTransportGroupExited, true, 'Codex transport group survived Electron host crash');
} finally {
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  if (Number.isSafeInteger(pid) && pid > 1 && pid !== child.pid && pid !== process.pid) { try { process.kill(-pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; } }
}
