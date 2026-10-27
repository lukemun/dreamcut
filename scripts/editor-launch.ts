import type { ChildProcess } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";

import { fingerprintReviewBuild } from "@/lib/instruments/review-build-cache";

import { buildSlot, freePort, serveStaticFromOtherSlot, serverIsRunning, slotFingerprint, slotForCurrentCode, startServer, waitForServer } from "./stable-editor";

/**
 * `pnpm editor`: the editor for everyday project work on http://127.0.0.1:3123.
 *
 * A small proxy owns 3123 and forwards every request, event stream and upgrade to a stable production
 * server on a private port (scripts/stable-editor.ts). When editor code changes and stays unchanged for a
 * while, a new build is made in a spare slot at low priority and started beside the current server; the
 * proxy switches to it once it answers, and the old server stops after its in-flight requests finish.
 * Open event streams then reconnect to the new server. A build that fails (a type error mid-edit, say)
 * changes nothing; the next quiet period tries again.
 */
const root = process.cwd();
const PUBLIC_PORT = 3123;
/** Edits arrive in bursts; build once they have stopped for this long. */
const QUIET_MS = 30_000;
/** An old server whose requests never settle is stopped after this long. */
const DRAIN_LIMIT_MS = 10 * 60_000;
const WATCHED = ["src", "public", "package.json", "pnpm-lock.yaml", "next.config.ts", "tsconfig.json", "postcss.config.mjs"];
const buildLog = path.join(os.tmpdir(), "dreamcut-editor-build.log");

type Backend = { slot: string; port: number; child: ChildProcess; fingerprint: string | null; inflight: number };

let current: Backend;
let stopping = false;
/** Every server this process started and has not yet stopped, including ones finishing a handover. */
const running = new Set<Backend>();

const log = (message: string) => console.log(`[editor] ${message}`);

async function launch(slot: string): Promise<Backend> {
  const port = await freePort();
  const child = startServer(root, slot, port, "stable", `${PUBLIC_PORT}@${port}`);
  const backend: Backend = { slot, port, child, fingerprint: slotFingerprint(root, slot), inflight: 0 };
  running.add(backend);
  child.once("exit", (code) => {
    running.delete(backend);
    if (!stopping && backend === current) {
      console.error(`[editor] The stable editor stopped unexpectedly (exit ${code ?? "signal"}).`);
      process.exit(1);
    }
  });
  try {
    await waitForServer(port);
  } catch (error) {
    child.kill("SIGTERM");
    throw error;
  }
  return backend;
}

/** Let an old server finish what it is answering, then stop it. Event streams are not waited for. */
async function retire(backend: Backend) {
  const deadline = Date.now() + DRAIN_LIMIT_MS;
  let quietSince = backend.inflight === 0 ? Date.now() : 0;
  while (Date.now() < deadline) {
    if (backend.inflight > 0) quietSince = 0;
    else if (!quietSince) quietSince = Date.now();
    else if (Date.now() - quietSince >= 5_000) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  backend.child.kill("SIGTERM");
}

/** Count a request against the backend that answers it, except streams that stay open indefinitely. */
function track(backend: Backend) {
  backend.inflight += 1;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    backend.inflight -= 1;
  };
}

function proxyRequest(request: http.IncomingMessage, response: http.ServerResponse) {
  const backend = current;
  // A tab that loaded before a switch still asks for the earlier build's chunks; a 404 there tears the
  // page down mid-load (it cycled between "Opening project…" and "Loading timeline…"), so serve them from disk.
  if (serveStaticFromOtherSlot(root, backend.slot, request, response)) return;
  const finish = track(backend);
  const upstream = http.request({ host: "127.0.0.1", port: backend.port, method: request.method, path: request.url, headers: request.headers }, (reply) => {
    if (/text\/event-stream/i.test(String(reply.headers["content-type"] ?? ""))) finish();
    response.writeHead(reply.statusCode ?? 502, reply.rawHeaders);
    reply.pipe(response);
    reply.once("end", finish);
  });
  upstream.once("error", () => {
    finish();
    if (!response.headersSent) response.writeHead(502, { "Content-Type": "text/plain" });
    response.end("The editor is restarting. Try again in a moment.");
  });
  response.once("close", () => { finish(); upstream.destroy(); });
  request.pipe(upstream);
}

function proxyUpgrade(request: http.IncomingMessage, socket: net.Socket, head: Buffer) {
  const backend = current;
  const upstream = net.connect(backend.port, "127.0.0.1", () => {
    const headers: string[] = [];
    for (let index = 0; index < request.rawHeaders.length; index += 2) headers.push(`${request.rawHeaders[index]}: ${request.rawHeaders[index + 1]}`);
    upstream.write(`${request.method} ${request.url} HTTP/${request.httpVersion}\r\n${headers.join("\r\n")}\r\n\r\n`);
    if (head.length) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  upstream.once("error", () => socket.destroy());
  socket.once("error", () => upstream.destroy());
}

let building = false;
let again = false;
let quietTimer: ReturnType<typeof setTimeout> | undefined;

async function rebuildIfChanged() {
  if (building) { again = true; return; }
  if (fingerprintReviewBuild(root) === current.fingerprint) return;
  building = true;
  try {
    log(`Editor code changed; building in the background (log: ${buildLog}).`);
    const { slot } = await buildSlot(root, { background: true, log: buildLog });
    const next = await launch(slot);
    const previous = current;
    current = next;
    log(`Now serving the new build (${slot}).`);
    void retire(previous);
  } catch (error) {
    log(`${error instanceof Error ? error.message : error} The current build keeps serving.`);
  } finally {
    building = false;
    if (again) { again = false; scheduleRebuild(); }
  }
}

function scheduleRebuild() {
  if (quietTimer) clearTimeout(quietTimer);
  quietTimer = setTimeout(() => { void rebuildIfChanged(); }, QUIET_MS);
}

function watch() {
  for (const entry of WATCHED) {
    const target = path.join(root, entry);
    if (!fs.existsSync(target)) continue;
    fs.watch(target, { recursive: fs.statSync(target).isDirectory() }, () => scheduleRebuild()).on("error", () => {});
  }
}

async function main() {
  if (await serverIsRunning(PUBLIC_PORT)) {
    log(`Already running: http://127.0.0.1:${PUBLIC_PORT}`);
    return;
  }
  current = await launch(await slotForCurrentCode(root));
  const proxy = http.createServer(proxyRequest);
  proxy.on("upgrade", proxyUpgrade);
  await new Promise<void>((resolve, reject) => {
    proxy.once("error", reject);
    proxy.listen(PUBLIC_PORT, "127.0.0.1", () => resolve());
  });
  // The same proxy on [::1]: the editor opens event streams there, and localhost resolves to it first.
  const proxyV6 = http.createServer(proxyRequest);
  proxyV6.on("upgrade", proxyUpgrade);
  proxyV6.once("error", () => log("IPv6 loopback is unavailable; event streams share 127.0.0.1."));
  proxyV6.listen(PUBLIC_PORT, "::1");
  watch();
  log(`Editor: http://127.0.0.1:${PUBLIC_PORT} (rebuilds itself when editor code changes)`);
  const stop = () => {
    stopping = true;
    for (const backend of running) backend.child.kill("SIGTERM");
    proxy.close();
    proxyV6.close();
    setTimeout(() => process.exit(0), 3_000).unref();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
