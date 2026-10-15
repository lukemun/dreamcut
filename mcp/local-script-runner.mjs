import path from 'node:path';
import { spawn } from 'node:child_process';
import { createWorkerCrashGuard } from './worker-crash-guard.mjs';

const scripts = Object.freeze({
  'import-media': 'import-media.ts', 'build-take-audition': 'build-take-audition.ts',
  'frame-state': 'frame-state.ts', qc: 'qc.ts', 'preview-readiness': 'preview-readiness.ts',
  'project-health': 'project-health.ts',
});
export function localScriptCommand(root, name, args) {
  if (!Object.hasOwn(scripts, name)) throw Error('Unsupported local editor command');
  if (!Array.isArray(args) || args.some(value => typeof value !== 'string')) throw Error('Invalid local editor arguments');
  return { executable: process.execPath, args: ['--import', 'tsx', path.join(root, 'scripts', scripts[name]), ...args] };
}
export function runLocalEditorScript(root, name, args, timeoutMs = 10 * 60 * 1000, signal) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2147483647) throw Error('Invalid local editor timeout');
  if (signal?.aborted) return Promise.reject(Error(`${name} cancelled: session closed`));
  const command = localScriptCommand(root, name, args);
  return (async () => {
    let stop, guardFailed = false;
    const guard = process.platform === 'win32' ? null : await createWorkerCrashGuard({ onFailure: () => {
      guardFailed = true; stop?.();
    } });
    if (signal?.aborted || guardFailed) {
      guard?.close();
      throw Error(signal?.aborted ? `${name} cancelled: session closed` : 'Helper crash cleanup is unavailable');
    }
    return new Promise((resolve, reject) => {
      const child = spawn(command.executable, command.args, { cwd: root, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '', stderr = '', timedOut = false, cancelled = false;
      // Only target the private group created by this invocation, never a stored PID.
      stop = () => {
        if (!child.pid) return;
        try {
          if (process.platform === 'win32') child.kill('SIGKILL');
          else process.kill(-child.pid, 'SIGKILL');
        } catch (error) { if (error.code !== 'ESRCH') reject(error); }
      };
      if (child.pid) {
        try { guard?.started(child.pid); }
        catch { guardFailed = true; stop(); }
      }
      const cancel = () => { cancelled = true; stop(); };
      signal?.addEventListener('abort', cancel, { once: true });
      const timer = setTimeout(() => { timedOut = true; stop(); }, timeoutMs);
      // A helper can exit while descendants still hold its output pipes open.
      child.once('exit', () => { clearTimeout(timer); stop(); guard?.exited(child.pid); });
      child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
      child.stdout.on('data', chunk => { stdout = (stdout + chunk).slice(-200_000); });
      child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-50_000); });
      child.once('error', error => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); reject(error); });
      child.once('close', code => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', cancel);
        if (guardFailed) reject(Error('Helper crash cleanup became unavailable'));
        else if (cancelled) reject(Error(`${name} cancelled: session closed`));
        else if (timedOut) reject(Error(`${name} timed out after ${timeoutMs / 1000}s`));
        else resolve({ exit_code: code, stdout, stderr });
      });
    }).finally(() => guard?.close());
  })();
}
