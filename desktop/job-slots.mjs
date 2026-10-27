// One Electron host owns permits across all its application services. This is
// process admission, not another durable job queue or a source of project writes.
export function createJobSlotBroker({ limit = 2 } = {}) {
  if (!Number.isInteger(limit) || limit < 1) throw Error('Invalid background concurrency');
  const clients = new Map();
  const waiting = [];
  let active = 0;
  const pump = () => {
    while (active < limit && waiting.length) {
      const entry = waiting.shift();
      if (!entry.owner.requests.has(entry.id)) continue;
      entry.granted = true; active++;
      try { entry.owner.service.postMessage({ type: 'job-slot-granted', id: entry.id }); }
      catch { entry.owner.requests.delete(entry.id); active--; }
    }
  };
  return {
    attach(service) {
      if (clients.has(service)) throw Error('Service already attached');
      const owner = { service, requests: new Map() };
      clients.set(service, owner);
      const message = value => {
        if (!value || typeof value.id !== 'string' || !/^[a-f0-9-]{36}$/.test(value.id)) return;
        if (value.type === 'job-slot-request' && !owner.requests.has(value.id)) {
          const entry = { owner, id: value.id, granted: false };
          owner.requests.set(value.id, entry); waiting.push(entry); pump();
        } else if (value.type === 'job-slot-release') {
          const entry = owner.requests.get(value.id);
          if (!entry) return;
          owner.requests.delete(value.id);
          if (entry.granted) active--;
          pump();
        }
      };
      const detach = () => {
        service.removeListener('message', message); service.removeListener('exit', detach);
        clients.delete(service);
        for (const entry of owner.requests.values()) if (entry.granted) active--;
        owner.requests.clear(); pump();
      };
      service.on('message', message); service.once('exit', detach);
      return detach;
    },
    get active() { return active; },
    get queued() { return waiting.filter(entry => entry.owner.requests.has(entry.id)).length; },
  };
}
