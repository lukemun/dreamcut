import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/** Read authoritative state without turning corruption or I/O failures into defaults. */
export function readJsonFileStrict<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

/** Optional/rebuildable data only; required project state must use the strict reader. */
export function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    return readJsonFileStrict<T>(filePath);
  } catch {
    return fallback;
  }
}

/** Write, flush, rename, then flush the parent directory. */
export function writeJsonFileAtomic(
  filePath: string,
  value: unknown,
  validate?: (value: unknown) => void,
): void {
  validate?.(value);
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
  const temporaryPath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let descriptor: number | undefined;
  try {
    descriptor = fs.openSync(temporaryPath, "wx", 0o600);
    fs.writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporaryPath, filePath);

    // Windows does not support opening directories through this POSIX fsync path.
    // The file itself was flushed before the atomic rename on every platform.
    if (process.platform === "win32") return;
    const directoryDescriptor = fs.openSync(directory, "r");
    try {
      fs.fsyncSync(directoryDescriptor);
    } finally {
      fs.closeSync(directoryDescriptor);
    }
  } catch (error) {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    try {
      fs.unlinkSync(temporaryPath);
    } catch {
      // The rename may already have completed.
    }
    throw error;
  }
}

const sleep = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * Serialize a read-change-write of one shared file across processes (several editor servers share
 * the profile). Waits briefly for another writer; a lock whose process is gone, or that is older
 * than `staleMs`, is taken over.
 */
export function withFileLock<T>(filePath: string, run: () => T, { waitMs = 3000, staleMs = 10_000 } = {}): T {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lock = `${filePath}.lock`;
  const deadline = Date.now() + waitMs;
  let descriptor: number | undefined;
  while (descriptor === undefined) {
    try {
      descriptor = fs.openSync(lock, "wx", 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      let abandoned = false;
      try {
        const pid = Number(fs.readFileSync(lock, "utf8"));
        const age = Date.now() - fs.statSync(lock).mtimeMs;
        if (age > staleMs) abandoned = true;
        else if (pid > 0) { try { process.kill(pid, 0); } catch (probe) { abandoned = (probe as NodeJS.ErrnoException).code === "ESRCH"; } }
      } catch { continue; /* Released while we looked. */ }
      if (abandoned) { try { fs.unlinkSync(lock); } catch { /* Another waiter took it over. */ } continue; }
      if (Date.now() > deadline) throw new Error(`${path.basename(filePath)} is being saved elsewhere. Please retry.`);
      sleep(15);
    }
  }
  try {
    fs.writeFileSync(descriptor, String(process.pid));
    return run();
  } finally {
    fs.closeSync(descriptor);
    try { fs.unlinkSync(lock); } catch { /* Already taken over as stale. */ }
  }
}
