import os from 'node:os';
import { spawn as spawnProcess } from 'node:child_process';

// Same subscription-only rule as the session: an inherited key must not steer sign-in.
const CREDENTIAL_ENV = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY'];
const URL_PATTERN = /https?:\/\/\S+/g;
const LOCAL_URL = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?:[:/?#]|$)/i;
const REJECTED_CODE = /status code 4\d\d|exchange failed \(4\d\d\)|invalid authorization code/i;
const OUTPUT_LIMIT = 4000;

/** The manual sign-in page Claude Code prints; only complete lines, never a loopback callback. */
export function signInPage(output) {
  return output.slice(0, output.lastIndexOf('\n') + 1).match(URL_PATTERN)?.map(url => url.replace(/[.,]+$/, ''))
    .find(url => !LOCAL_URL.test(url) && /^https:\/\//.test(url)) ?? null;
}

/**
 * Host-neutral Claude Code sign-in. Runs `claude auth login --claudeai`, which opens the
 * browser itself and finishes on its own when the creator approves there. If it cannot,
 * the creator opens the printed page and pastes the code it shows. Credentials stay in
 * Claude Code's own store; DreamCut only relays the one-time code to the CLI's stdin.
 * One sign-in runs at a time per host. Steps: start, wait, code, cancel.
 */
export function createAgentLogin({ spawn = spawnProcess, env = process.env, timeoutMs = 300000, startMs = 20000, waitMs = 25000 } = {}) {
  let login;
  const settle = (current, result) => {
    if (current.result) return;
    current.result = result; clearTimeout(current.timer);
    for (const wake of current.waiters.splice(0)) wake();
  };
  const view = current => current.result ?? (current.page ? { status: 'waiting', url: current.page } : { status: 'starting' });
  // Resolves when `done` holds, re-checking on each change, or after `limit`.
  const until = (current, done, limit) => new Promise(resolve => {
    const finish = () => { clearTimeout(timer); resolve(); };
    const timer = setTimeout(finish, limit); timer.unref?.();
    const check = () => { if (done()) finish(); else current.waiters.push(check); };
    check();
  });
  // The latest attempt stays readable after it finishes so a waiting page sees the outcome.
  const end = () => {
    const current = login; login = undefined;
    if (!current || current.result) return;
    settle(current, { status: 'failed', message: 'Sign-in was cancelled.' });
    try { current.child.kill('SIGTERM'); } catch { /* Already exited. */ }
  };
  const start = async executable => {
    if (!executable) return { status: 'failed', message: 'Install Claude Code to sign in. DreamCut uses the Claude Code app on this computer.' };
    end();
    const childEnv = { ...env };
    for (const name of CREDENTIAL_ENV) delete childEnv[name];
    const child = spawn(executable, ['auth', 'login', '--claudeai'], { cwd: os.homedir(), env: childEnv, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    const current = { child, page: null, codeSent: false, stdout: '', stderr: '', waiters: [], result: undefined, timer: undefined };
    login = current;
    current.timer = setTimeout(() => { settle(current, { status: 'failed', message: 'Sign-in timed out. Try again.' }); try { child.kill('SIGTERM'); } catch { /* Exited. */ } }, timeoutMs);
    current.timer.unref?.();
    const read = (stream, chunk) => {
      current[stream] = (current[stream] + chunk.toString()).slice(-OUTPUT_LIMIT);
      if (!current.page && (current.page = signInPage(current[stream]))) for (const wake of current.waiters.splice(0)) wake();
    };
    child.stdout?.on('data', chunk => read('stdout', chunk));
    child.stderr?.on('data', chunk => read('stderr', chunk));
    child.on('error', () => { settle(current, { status: 'failed', message: 'Claude Code could not start sign-in.' }); });
    child.on('exit', code => {
      if (code === 0) return settle(current, { status: 'signed-in' });
      const reason = current.stderr.trim().split('\n').slice(-2).join('\n');
      settle(current, { status: 'failed', message: current.codeSent && REJECTED_CODE.test(reason) ? 'That code did not work. Open the sign-in page again and copy the new code.'
        : reason || 'Sign-in did not finish. Try again.' });
    });
    await until(current, () => Boolean(current.page || current.result), startMs);
    return view(current);
  };
  const submit = async code => {
    const current = login;
    if (!current?.page || current.result) return { status: 'failed', message: 'That sign-in has ended. Sign in again.' };
    const value = typeof code === 'string' ? code.replace(/\s+/g, '') : '';
    const [token, state] = value.split('#');
    if (!token || !state || value.length > 2000) return { status: 'failed', message: 'Copy the whole code, including the part after #.', retry: true };
    const expected = new URL(current.page).searchParams.get('state');
    if (expected !== null && state !== expected) return { status: 'failed', message: 'That code is from an earlier sign-in. Copy the code shown for this one.', retry: true };
    current.codeSent = true;
    current.child.stdin?.write(`${value}\n`);
    await until(current, () => Boolean(current.result), 60000);
    return view(current);
  };
  return {
    async call({ step, code } = {}, executable) {
      if (step === 'start') return start(executable);
      if (step === 'code') return submit(code);
      if (step === 'cancel') { end(); return { status: 'cancelled' }; }
      if (step === 'wait') {
        const current = login;
        if (!current) return { status: 'idle' };
        await until(current, () => Boolean(current.result), waitMs);
        return view(current);
      }
      throw Error('Unsupported sign-in step.');
    },
    dispose: end,
  };
}
