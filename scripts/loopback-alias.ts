import net from "node:net";

/**
 * Next binds one host (127.0.0.1). The browser editor also opens [::1]:<port> for event
 * streams and resolves localhost:<port> (sibling-name media) to ::1 first, so mirror the
 * port on ::1 with a plain TCP relay to the real server. HTTP, streams and upgrades pass
 * through unchanged; the Host header still names the loopback name the browser used.
 * Where IPv6 loopback is unavailable or the port is taken there, nothing changes: the
 * page falls back to same-origin streams and localhost falls back to 127.0.0.1.
 */
export function startIpv6LoopbackAlias(port: number, target = "127.0.0.1"): net.Server {
  const server = net.createServer(socket => {
    const upstream = net.connect(port, target);
    socket.pipe(upstream);
    upstream.pipe(socket);
    // Either side closing ends the pair; a half-closed socket left behind would leak its descriptor.
    const close = () => { socket.destroy(); upstream.destroy(); };
    socket.on("error", close);
    upstream.on("error", close);
    socket.once("close", close);
    upstream.once("close", close);
  });
  server.once("error", () => { /* No IPv6 loopback here; 127.0.0.1 keeps serving. */ });
  server.listen(port, "::1");
  server.unref();
  return server;
}

/** The port when `args` (a Next CLI argv) serves on 127.0.0.1, else null. */
export function loopbackServePort(args: readonly string[]): number | null {
  const value = (flags: string[]) => { const index = args.findIndex(arg => flags.includes(arg)); return index >= 0 ? args[index + 1] : undefined; };
  if (value(["-H", "--hostname"]) !== "127.0.0.1") return null;
  const port = Number(value(["-p", "--port"]));
  return Number.isSafeInteger(port) && port > 0 ? port : null;
}
