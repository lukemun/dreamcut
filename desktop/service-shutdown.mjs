// UtilityProcess uses postMessage; never send signals to unrelated processes.
export function stopDesktopService(service, { timeoutMs = 5000, forceTimeoutMs = 2000 } = {}) {
  if (!service?.pid) return Promise.resolve('already-stopped');
  return new Promise((resolve, reject) => {
    let settled = false, forced = false, timer, forceTimer;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer); clearTimeout(forceTimer);
      service.removeListener('exit', onExit);
      if (error) reject(error); else resolve(result);
    };
    const onExit = () => finish(null, forced ? 'forced' : 'graceful');
    const force = () => {
      if (settled || forced) return;
      forced = true; clearTimeout(timer);
      forceTimer = setTimeout(() => finish(Error('The editor service did not exit after termination.')), forceTimeoutMs);
      try {
        if (service.kill() === false) finish(Error('The editor service could not be terminated.'));
      } catch { finish(Error('The editor service could not be terminated.')); }
    };
    timer = setTimeout(force, timeoutMs);
    service.once('exit', onExit);
    try { service.postMessage({ type: 'stop' }); }
    catch { force(); }
  });
}

export function drainHttpServer(server, { timeoutMs = 3000 } = {}) {
  return new Promise(resolve => {
    // Responses active at close() may become idle keep-alive sockets afterward.
    // Reap only idle sockets until the bounded force-close deadline.
    const idle = setInterval(() => server.closeIdleConnections(), 50);
    const timer = setTimeout(() => { clearInterval(idle); server.closeAllConnections(); resolve('forced'); }, timeoutMs);
    server.close(() => { clearTimeout(timer); clearInterval(idle); resolve('drained'); });
    server.closeIdleConnections();
  });
}
