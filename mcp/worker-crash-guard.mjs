import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// A separate Node process retains the live worker registrations when Electron
// tears down its utility process after main-process death. IPC EOF is the lease.
export async function createWorkerCrashGuard({ onFailure = () => {} } = {}) {
  const child = fork(fileURLToPath(new URL('./worker-crash-watchdog.mjs', import.meta.url)), [], {
    detached: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  });
  let closing = false;
  child.on('error', () => { if (!closing) onFailure(); });
  child.on('exit', () => { if (!closing) onFailure(); });
  try {
    await new Promise((resolve, reject) => {
      const finish = error => {
        clearTimeout(timer); child.removeListener('message', ready); child.removeListener('exit', exited);
        error ? reject(error) : resolve();
      };
      const ready = message => { if (message?.type === 'ready') finish(); };
      const exited = () => finish(Error('Worker crash cleanup could not start.'));
      const timer = setTimeout(() => finish(Error('Worker crash cleanup startup timed out.')), 10000);
      child.on('message', ready); child.once('exit', exited);
    });
  } catch (error) { closing = true; child.kill('SIGKILL'); throw error; }
  return {
    started(pid) {
      if (!child.connected || closing) throw Error('Worker crash cleanup is unavailable.');
      child.send({ type: 'started', pid }, error => { if (error && !closing) onFailure(); });
    },
    exited(pid) { if (child.connected) child.send({ type: 'exited', pid }, error => { if (error && !closing) onFailure(); }); },
    close() { closing = true; if (child.connected) child.disconnect(); },
  };
}
