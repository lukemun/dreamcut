import { serveWarmStills } from '../src/lib/render/warm-still-worker';

const socket = process.argv[2];
if (!socket) throw Error('Missing private socket path');
serveWarmStills(socket).then(worker => {
  const stop = () => void worker.close().then(() => process.exit(0));
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
}).catch(error => { console.error(error); process.exitCode = 1; });
