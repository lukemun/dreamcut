import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

/** Serialize slot selection AND compilation across manual/review/watch launchers.
 * Never reclaim an abandoned lease automatically: its compiler may outlive its parent. */
export async function withStableBuildLock<T>(root: string, work: () => Promise<T>, options: { timeoutMs?: number; pollMs?: number } = {}): Promise<T> {
  const directory = path.join(root, ".desktop-build", "stable-build.lock");
  fs.mkdirSync(path.dirname(directory), { recursive: true });
  const token = randomUUID();
  const owner = path.join(directory, "owner.json");
  const deadline = Date.now() + (options.timeoutMs ?? 15 * 60_000);
  for (;;) {
    try {
      fs.mkdirSync(directory);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (Date.now() >= deadline) {
        throw new Error(`Another stable build owns ${directory}. Wait for it to finish; if abandoned, verify its compiler children have exited before removing the lease.`);
      }
      await new Promise(resolve => setTimeout(resolve, options.pollMs ?? 250));
    }
  }
  try {
    fs.writeFileSync(owner, JSON.stringify({ pid: process.pid, token, started_at: new Date().toISOString() }));
    return await work();
  } finally {
    // A failed owner write still owns the directory; never delete a replacement lease.
    let ours = !fs.existsSync(owner);
    try { ours = JSON.parse(fs.readFileSync(owner, "utf8")).token === token; } catch { /* leave unknown owner intact */ }
    if (ours) {
      if (fs.existsSync(owner)) fs.unlinkSync(owner);
      fs.rmdirSync(directory);
    }
  }
}
