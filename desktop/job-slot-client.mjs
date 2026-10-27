import { randomUUID } from 'node:crypto';
export const JOB_SCHEDULER = Symbol.for('dreamcut.desktop.job-scheduler');

// The caller supplies the private utility-process IPC adapter, never renderer IPC.
export function createJobSlotClient({ send, subscribe }) {
  const pending = new Map();
  let stopped = false;
  const release = id => { pending.delete(id); send({ type: 'job-slot-release', id }); };
  const unsubscribe = subscribe(message => {
    if (message?.type !== 'job-slot-granted') return;
    const entry = pending.get(message.id);
    if (!entry || entry.active || stopped) return;
    entry.active = true;
    try {
      const child = entry.start();
      let released = false;
      const done = () => { if (!released) { released = true; release(message.id); } };
      child.once('exit', done); child.once('error', done);
      entry.resolve(child);
    } catch (error) { release(message.id); entry.reject(error); }
  });
  return {
    schedule(start) {
      if (stopped) return Promise.reject(Error('DreamCut is shutting down. Retry after reopening the app.'));
      const id = randomUUID();
      return new Promise((resolve, reject) => {
        pending.set(id, { start, resolve, reject, active: false });
        try { send({ type: 'job-slot-request', id }); }
        catch (error) { pending.delete(id); reject(error); }
      });
    },
    stop() {
      stopped = true; unsubscribe();
      for (const [id, entry] of pending) if (!entry.active) {
        release(id); entry.reject(Error('DreamCut stopped before this queued worker started.'));
      }
      // Active permits release on child exit, after the existing owner stops it.
    },
  };
}
