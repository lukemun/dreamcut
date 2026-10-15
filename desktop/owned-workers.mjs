import { spawn } from 'node:child_process';

export const WORKER_OWNER = Symbol.for('dreamcut.desktop.worker-owner');

// Each worker starts a private POSIX process group. Never target a PID obtained
// from a persisted lock file or another application instance.
export function createWorkerOwner({ graceMs = 750, onStarted = () => {}, onExited = () => {} } = {}) {
  const children = new Set();
  let stopping = false;
  let stopped;
  const signal = (child, value) => {
    if (!child.pid) return;
    try { process.kill(-child.pid, value); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
  };
  return {
    spawn(command, args, options) {
      if (stopping) throw new Error('DreamCut is shutting down. Retry after reopening the app.');
      const child = spawn(command, args, { ...options, detached: true });
      children.add(child);
      if (child.pid) {
        try { onStarted(child.pid); }
        catch (error) { signal(child, 'SIGKILL'); children.delete(child); throw error; }
      }
      child.once('error', () => children.delete(child));
      child.once('exit', () => {
        // Descendants in the job's group must not outlive the owning worker.
        signal(child, 'SIGKILL');
        children.delete(child);
        onExited(child.pid);
      });
      return child;
    },
    get size() { return children.size; },
    stop() {
      if (stopped) return stopped;
      stopping = true;
      stopped = (async () => {
        const active = [...children];
        const exits = active.map(child => new Promise(resolve => {
          const done = () => { child.removeListener('exit', done); child.removeListener('error', done); resolve(); };
          child.once('exit', done);
          child.once('error', done);
        }));
        for (const child of active) signal(child, 'SIGTERM');
        let deadline;
        await Promise.race([
          Promise.all(exits),
          new Promise(resolve => { deadline = setTimeout(resolve, graceMs); }),
        ]);
        clearTimeout(deadline);
        for (const child of active) if (children.has(child)) signal(child, 'SIGKILL');
        await Promise.all(exits);
      })();
      return stopped;
    },
  };
}
