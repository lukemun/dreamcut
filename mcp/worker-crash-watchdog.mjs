// Only the spawning service's private IPC channel can register process groups.
// Never consult project lock files or accept commands from a network endpoint.
const groups = new Set();
let stopping = false;
function cleanup() {
  if (stopping) return;
  stopping = true;
  for (const pid of groups) {
    try { process.kill(-pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') process.exitCode = 1; }
  }
  groups.clear();
  process.exit(process.exitCode || 0);
}
process.on('message', message => {
  const pid = message?.pid;
  if (!Number.isSafeInteger(pid) || pid <= 1 || pid === process.pid || pid === process.ppid) return;
  if (message.type === 'started') groups.add(pid);
  if (message.type === 'exited') groups.delete(pid);
});
process.on('disconnect', cleanup);
process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);
if (!process.send) process.exit(1);
process.send({ type: 'ready' });
