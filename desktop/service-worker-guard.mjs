// Only the private utility-process channel may report worker groups. Never read
// persisted job PIDs here: those could belong to a previous app instance.
export function guardServiceWorkers(service, { kill = process.kill.bind(process), onFailure = () => {} } = {}) {
  const groups = new Set();
  const onMessage = message => {
    const pid = message?.pid;
    if (!Number.isSafeInteger(pid) || pid <= 1 || pid === process.pid || pid === service.pid) return;
    if (message.type === 'worker-started') groups.add(pid);
    if (message.type === 'worker-exited') groups.delete(pid);
  };
  service.on('message', onMessage);
  service.once('exit', () => {
    service.removeListener('message', onMessage);
    for (const pid of groups) {
      try { kill(-pid, 'SIGKILL'); }
      catch (error) { if (error.code !== 'ESRCH') onFailure(); }
    }
    groups.clear();
  });
  return { get size() { return groups.size; } };
}
