import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
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
