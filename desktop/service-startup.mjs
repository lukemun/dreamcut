// Listen only for the startup handshake; release every listener on every outcome.
export function waitForDesktopService(service, { timeoutMs = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    const finish = (error, origin) => {
      clearTimeout(timer);
      service.removeListener('message', onMessage);
      service.removeListener('exit', onExit);
      if (error) reject(error); else resolve(origin);
    };
    const onExit = () => finish(new Error('The editor service stopped during startup.'));
    const onMessage = message => {
      if (message?.type !== 'ready') return;
      try {
        const url = new URL(message.origin);
        if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || (!url.port || Number(url.port) < 1) ||
            url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw Error();
        finish(null, url.origin);
      } catch {
        finish(new Error('The editor service returned an invalid local address.'));
      }
    };
    const timer = setTimeout(() => finish(new Error('The editor service did not start in time.')), timeoutMs);
    service.on('message', onMessage);
    service.once('exit', onExit);
  });
}
