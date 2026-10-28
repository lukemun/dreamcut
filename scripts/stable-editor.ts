import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import type http from "node:http";
import net from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  fingerprintReviewBuild,
  isReviewBuildFresh,
  readReviewBuildReceipt,
  writeReviewBuildReceipt,
} from "@/lib/instruments/review-build-cache";

/**
 * The stable editor build behind `pnpm editor` (3123) and `pnpm review` (3124): the isolated production
 * build the installed app ships (desktop/build.mjs compiles it from the application sources only),
 * served from this checkout so projects, catalogs and local tools resolve as they do under `pnpm dev`.
 * Unlike `pnpm dev` it never recompiles mid-session or starts a process per request.
 *
 * Builds go into one of a few fixed slots under .desktop-build, never one a running server reads, so a
 * new build can be prepared while the current one keeps serving. stable-servers.json records which
 * server process reads which slot.
 *
 *   tsx scripts/stable-editor.ts build                 # build when editor code changed
 *   tsx scripts/stable-editor.ts serve <port> <mode>   # serve the latest build
 *   tsx scripts/stable-editor.ts status                # does 3123 serve the current code?
 */
const SLOTS = ["stable-a", "stable-b", "stable-c"];
const DIST = ".next-desktop";

type Registry = Record<string, { slot: string; pid: number }>;

const buildRoot = (root: string) => path.join(root, ".desktop-build");
export const slotDir = (root: string, slot: string) => path.join(buildRoot(root), slot);
const slotDist = (root: string, slot: string) => path.join(slotDir(root, slot), DIST);
const registryPath = (root: string) => path.join(buildRoot(root), "stable-servers.json");

function alive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readRegistry(root: string): Registry {
  try {
    const registry = JSON.parse(fs.readFileSync(registryPath(root), "utf8")) as Registry;
    return Object.fromEntries(Object.entries(registry).filter(([, entry]) => alive(entry.pid)));
  } catch {
    return {};
  }
}

function writeRegistry(root: string, registry: Registry) {
  fs.mkdirSync(buildRoot(root), { recursive: true });
  const pending = `${registryPath(root)}.${process.pid}`;
  fs.writeFileSync(pending, `${JSON.stringify(registry, null, 2)}\n`);
  fs.renameSync(pending, registryPath(root));
}

export function claimSlot(root: string, key: string, slot: string, pid: number) {
  writeRegistry(root, { ...readRegistry(root), [key]: { slot, pid } });
}

export function releaseSlot(root: string, key: string) {
  const registry = readRegistry(root);
  delete registry[key];
  writeRegistry(root, registry);
}

/** The most recently built slot whose build matches `fingerprint`, if any. */
export function freshSlot(root: string, fingerprint: string): string | null {
  return SLOTS.filter((slot) => isReviewBuildFresh(slotDist(root, slot), fingerprint))
    .sort((a, b) => (readReviewBuildReceipt(slotDist(root, b))?.built_at ?? "").localeCompare(readReviewBuildReceipt(slotDist(root, a))?.built_at ?? ""))[0] ?? null;
}

/** The most recently built slot, whatever code it was built from. */
export function latestSlot(root: string): string | null {
  return SLOTS.filter((slot) => fs.existsSync(path.join(slotDist(root, slot), "BUILD_ID")))
    .sort((a, b) => (readReviewBuildReceipt(slotDist(root, b))?.built_at ?? "").localeCompare(readReviewBuildReceipt(slotDist(root, a))?.built_at ?? ""))[0] ?? null;
}

/** The fingerprint a slot was built from. */
export function slotFingerprint(root: string, slot: string) {
  return readReviewBuildReceipt(slotDist(root, slot))?.fingerprint ?? null;
}

/**
 * Build the current code into a slot no running server reads (the oldest such slot). `log` receives the
 * build output; a background build runs at low priority so editing stays responsive.
 */
export async function buildSlot(root: string, options: { background?: boolean; log?: string } = {}): Promise<{ slot: string; fingerprint: string }> {
  const fingerprint = fingerprintReviewBuild(root);
  const inUse = new Set(Object.values(readRegistry(root)).map((entry) => entry.slot));
  const free = SLOTS.filter((slot) => !inUse.has(slot))
    .sort((a, b) => (readReviewBuildReceipt(slotDist(root, a))?.built_at ?? "").localeCompare(readReviewBuildReceipt(slotDist(root, b))?.built_at ?? ""));
  const slot = free[0];
  if (!slot) throw new Error("Every stable build slot is in use; stop a stable server and try again.");
  // Local builds never upload source maps, and their error reports say `local`, not a release.
  const env: NodeJS.ProcessEnv = { ...process.env, DREAMCUT_SENTRY_ENVIRONMENT: "local", DREAMCUT_BUILD_DIR: path.join(".desktop-build", slot) };
  delete env.SENTRY_AUTH_TOKEN;
  const output = options.log ? fs.openSync(options.log, "w") : "inherit";
  // macOS background priority throttles disk as well as CPU; `nice` alone left the live editor stalling.
  const [command, args] = !options.background ? [process.execPath, ["desktop/build.mjs"]]
    : process.platform === "darwin" ? ["taskpolicy", ["-b", process.execPath, "desktop/build.mjs"]]
    : ["nice", ["-n", "19", process.execPath, "desktop/build.mjs"]];
  const code = await new Promise<number | null>((resolve) => {
    const child = spawn(command, args, { cwd: root, env, stdio: ["ignore", output, output] });
    child.once("error", () => resolve(1));
    child.once("exit", resolve);
  });
  if (typeof output === "number") fs.closeSync(output);
  if (code !== 0) throw new Error(`Stable editor build failed (exit ${code ?? "unknown"})${options.log ? `; see ${options.log}` : ""}`);
  writeReviewBuildReceipt(slotDist(root, slot), fingerprint);
  return { slot, fingerprint };
}

/** Serve `slot` on `port` from this checkout, recorded as `key` while it runs. */
export function startServer(root: string, slot: string, port: number, mode: string, key: string, stdio: "inherit" | "ignore" = "inherit"): ChildProcess {
  // Run tsx directly so the recorded process is the server wrapper, which forwards SIGTERM to Next.
  const server = spawn(path.join(root, "node_modules", ".bin", "tsx"), ["scripts/server-with-otel.ts", "start", slotDir(root, slot), "-H", "127.0.0.1", "-p", String(port)], {
    cwd: root,
    env: { ...process.env, TIMELINE_EDITOR_MODE: mode, TIMELINE_NEXT_DIST_DIR: DIST, ...(mode === "stable" ? { DREAMCUT_LOOPBACK_ALIAS: "0" } : {}) },
    stdio,
  });
  if (server.pid) claimSlot(root, key, slot, server.pid);
  server.once("exit", () => releaseSlot(root, key));
  return server;
}

/** Every process's parent, or null when the process table cannot be read. */
function parentPids(): Map<number, number> | null {
  try {
    const table = process.platform === "win32"
      ? execFileSync("powershell.exe", ["-NoProfile", "-Command", "Get-CimInstance Win32_Process | ForEach-Object { \"$($_.ProcessId) $($_.ParentProcessId)\" }"], { encoding: "utf8" })
      : execFileSync("ps", ["-A", "-o", "pid=,ppid="], { encoding: "utf8" });
    const parents = new Map<number, number>();
    for (const line of table.split("\n")) {
      const [pid, ppid] = line.trim().split(/\s+/).map(Number);
      if (pid && ppid !== undefined && Number.isFinite(ppid)) parents.set(pid, ppid);
    }
    return parents;
  } catch {
    return null;
  }
}

/**
 * Ids of the exports still running inside the server whose wrapper process is `serverPid`. Render jobs run
 * in the Next process under that wrapper (src/lib/local-store/render-jobs.ts records its pid), so a server
 * handing over to a new build must outlive them. When the process table is unreadable every live export
 * counts, which only keeps an old server around longer.
 */
export function rendersRunningUnder(jobsDir: string, serverPid: number): string[] {
  let names: string[];
  try { names = fs.readdirSync(jobsDir).filter((name) => name.endsWith(".json")); } catch { return []; }
  const live = names.flatMap((name) => {
    try {
      const job = JSON.parse(fs.readFileSync(path.join(jobsDir, name), "utf8")) as { id?: unknown; status?: unknown; pid?: unknown };
      return job.status === "processing" && typeof job.id === "string" && typeof job.pid === "number" && alive(job.pid) ? [{ id: job.id, pid: job.pid }] : [];
    } catch {
      return [];
    }
  });
  if (!live.length) return [];
  const parents = parentPids();
  const under = (pid: number) => {
    for (let at: number | undefined = pid, hops = 0; at && hops < 64; at = parents?.get(at), hops += 1) if (at === serverPid) return true;
    return false;
  };
  return live.filter((job) => !parents || under(job.pid)).map((job) => job.id);
}

const STATIC_PREFIX = "/_next/static/";
const STATIC_TYPES: Record<string, string> = {
  ".js": "application/javascript; charset=utf-8", ".mjs": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".map": "application/json; charset=utf-8", ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".otf": "font/otf", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".ico": "image/x-icon",
  ".wasm": "application/wasm",
};

/**
 * The built file behind a `/_next/static/…` request, looked up in `slot` first and then in the other slots.
 * Static file names are content-hashed, so a page that loaded before the editor switched builds can still
 * fetch its own chunks from the slot it came from instead of getting a 404 from the new build.
 */
export function staticAssetFile(root: string, url: string, slot: string): { file: string; slot: string } | null {
  let pathname: string;
  try { pathname = decodeURIComponent((url.split("?")[0] ?? "")); } catch { return null; }
  if (!pathname.startsWith(STATIC_PREFIX)) return null;
  const segments = pathname.slice(STATIC_PREFIX.length).split("/");
  if (!segments.length || segments.some((segment) => !segment || segment === "." || segment === ".." || /[\\\0]/.test(segment))) return null;
  for (const candidate of [slot, ...SLOTS.filter((other) => other !== slot)]) {
    const file = path.join(slotDist(root, candidate), "static", ...segments);
    try { if (fs.statSync(file).isFile()) return { file, slot: candidate }; } catch { /* not in this slot */ }
  }
  return null;
}

/**
 * Answer a static request the serving build no longer has from the earlier build that does. Returns false
 * (leaving the request to the server) for anything else, including files the serving build has.
 */
export function serveStaticFromOtherSlot(root: string, slot: string, request: http.IncomingMessage, response: http.ServerResponse): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  const found = staticAssetFile(root, request.url ?? "", slot);
  if (!found || found.slot === slot) return false;
  response.writeHead(200, {
    "Content-Type": STATIC_TYPES[path.extname(found.file).toLowerCase()] ?? "application/octet-stream",
    "Content-Length": fs.statSync(found.file).size,
    "Cache-Control": "public, max-age=31536000, immutable",
  });
  if (request.method === "HEAD") response.end();
  else fs.createReadStream(found.file).on("error", () => response.destroy()).pipe(response);
  return true;
}

export async function serverIsRunning(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(750), redirect: "manual" });
    return response.status > 0;
  } catch {
    return false;
  }
}

export async function waitForServer(port: number, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await serverIsRunning(port)) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`The stable editor on ${port} did not start in time.`);
}

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as net.AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

/** The slot to serve now: a build of the current code, else a new build, else (all slots busy) the latest. */
export async function slotForCurrentCode(root: string): Promise<string> {
  const fresh = freshSlot(root, fingerprintReviewBuild(root));
  if (fresh) {
    console.log("Editor code is unchanged; reusing the existing build.");
    return fresh;
  }
  try {
    console.log("Editor code changed; building the stable editor (a few minutes)...");
    return (await buildSlot(root)).slot;
  } catch (error) {
    const latest = latestSlot(root);
    if (!latest) throw error;
    console.warn(`${error instanceof Error ? error.message : error} Serving the latest build instead.`);
    return latest;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, port, mode] = process.argv.slice(2);
  const root = process.cwd();
  if (command === "build") {
    slotForCurrentCode(root).catch((error) => { console.error(error); process.exit(1); });
  } else if (command === "status") {
    const served = Object.entries(readRegistry(root)).find(([key]) => key.startsWith("3123@"))?.[1];
    if (!served) {
      console.log("The editor on 3123 is not running; start it with `pnpm editor`.");
      process.exit(2);
    }
    const current = slotFingerprint(root, served.slot) === fingerprintReviewBuild(root);
    console.log(current ? "The editor on 3123 serves the current editor code."
      : "The editor on 3123 serves an older build; it switches by itself once a build of the current code is ready.");
    process.exit(current ? 0 : 1);
  } else if (command === "serve" && Number(port) > 0) {
    slotForCurrentCode(root).then((slot) => {
      const server = startServer(root, slot, Number(port), mode ?? "stable", String(port));
      server.once("exit", (code) => process.exit(code ?? 0));
    }).catch((error) => { console.error(error); process.exit(1); });
  } else {
    console.error("Usage: tsx scripts/stable-editor.ts build | serve <port> [mode] | status");
    process.exit(1);
  }
}
