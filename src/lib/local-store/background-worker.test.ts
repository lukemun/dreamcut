import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { spawnBackgroundWorker } from "./background-worker";

test("background workers use the desktop owner when installed, otherwise launch normally", async () => {
  const key = Symbol.for("dreamcut.desktop.worker-owner");
  const host = process as NodeJS.Process & { [key: symbol]: unknown };
  const previous = host[key];
  try {
    delete host[key];
    const child = spawnBackgroundWorker(process.execPath, ["-e", ""], { stdio: "ignore" });
    assert.deepEqual(await once(child, "exit"), [0, null]);
    host[key] = { spawn() { throw new Error("owner is stopping"); } };
    assert.throws(() => spawnBackgroundWorker(process.execPath, [], {}), /owner is stopping/);
  } finally { if (previous === undefined) delete host[key]; else host[key] = previous; }
});

test("desktop text commands preserve output/failure and bound resistant workers", async () => {
  const { createRequire } = await import("node:module");
  const { createWorkerOwner } = createRequire(import.meta.url)("../../../desktop/owned-workers.mjs");
  const { runBackgroundCommand } = await import("./background-worker");
  const key = Symbol.for("dreamcut.desktop.worker-owner");
  const host = process as NodeJS.Process & { [key: symbol]: unknown };
  const previous = host[key];
  const owner = createWorkerOwner({ graceMs: 30 });
  host[key] = owner;
  try {
    assert.deepEqual(await runBackgroundCommand(process.execPath, ["-e", 'process.stdout.write("café"); process.stderr.write("warning");']), { stdout: "café", stderr: "warning" });
    await assert.rejects(runBackgroundCommand(process.execPath, ["-e", 'process.stderr.write("bad input");process.exit(3)']), (error: unknown) => {
      const value = error as Error & { code: number; stderr: string };
      return value.code === 3 && value.stderr === "bad input";
    });
    await assert.rejects(runBackgroundCommand(process.execPath, ["-e", 'process.stdout.write("x".repeat(1024));setInterval(()=>{},1000)'], { maxBuffer: 32 }), { code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" });
    await assert.rejects(runBackgroundCommand(process.execPath, ["-e", 'process.on("SIGTERM",()=>{});setInterval(()=>{},1000)'], { timeout: 100 }), { code: "ETIMEDOUT" });
    await assert.rejects(runBackgroundCommand("/missing/dreamcut-command", []), { code: "ENOENT" });
    assert.equal(owner.size, 0);
    const running = runBackgroundCommand(process.execPath, ["-e", 'setInterval(()=>{},1000)']);
    const rejected = assert.rejects(running);
    await owner.stop();
    await rejected;
    await assert.rejects(runBackgroundCommand(process.execPath, [], {}), /shutting down/);
  } finally {
    await owner.stop();
    if (previous === undefined) delete host[key]; else host[key] = previous;
  }
});

test("text commands retain the ordinary execFile path outside desktop", async () => {
  const { runBackgroundCommand } = await import("./background-worker");
  assert.deepEqual(await runBackgroundCommand(process.execPath, ["-e", 'process.stdout.write("browser-cli");']), { stdout: "browser-cli", stderr: "" });
});

test("waveform and catalog preparation route their real media commands through desktop ownership", async () => {
  const { createRequire } = await import("node:module");
  const { createWorkerOwner } = createRequire(import.meta.url)("../../../desktop/owned-workers.mjs");
  const { runBackgroundCommand } = await import("./background-worker");
  const { prepareWaveform } = await import("./prepare-waveform");
  const { prepareCatalogAudioPreview } = await import("./catalog-audio-preview");
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dreamcut-owned-audio-"));
  const key = Symbol.for("dreamcut.desktop.worker-owner");
  const host = process as NodeJS.Process & { [key: symbol]: unknown };
  const previous = host[key];
  const owner = createWorkerOwner();
  let launches = 0;
  host[key] = { spawn(...args: unknown[]) { launches++; return owner.spawn(...args); } };
  try {
    const source = path.join(root, "tone.wav");
    await runBackgroundCommand("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", source]);
    const before = await fs.readFile(source);
    const peaks = await prepareWaveform(source, path.join(root, "peaks"));
    assert.equal(peaks.peaks.length, 2000);
    assert.ok(peaks.peaks.some(value => value > 0));
    const preview = await prepareCatalogAudioPreview(source, path.join(root, "preview"));
    assert.ok((await fs.stat(preview)).size > 0);
    assert.deepEqual(await fs.readFile(source), before);
    assert.equal(launches, 5); // Fixture generation, two conversions and two validation probes.
    assert.equal(owner.size, 0);
  } finally {
    await owner.stop();
    if (previous === undefined) delete host[key]; else host[key] = previous;
    await fs.rm(root, { recursive: true, force: true });
  }
});
