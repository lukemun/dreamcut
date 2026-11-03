import fs from "node:fs";
import path from "node:path";

/**
 * Append-only day files (`YYYY-MM-DD.jsonl`) for local diagnostic logs: product signals and tool
 * events. Both follow one storage-lifecycle bound (docs/standards/storage-lifecycle.md,
 * "Local diagnostic logs"): the oldest whole days beyond the retention window or the byte budget
 * are dropped; a day file is never edited, and the newest day is never dropped.
 */
export const DAY_FILE = /^\d{4}-\d{2}-\d{2}\.jsonl$/;
export const DIAGNOSTIC_LOG_RETENTION = { days: 90, bytes: 50 * 1024 * 1024 };

export function dayFilesIn(dir: string): string[] {
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter(name => DAY_FILE.test(name)).sort() : [];
}

/** Drop the oldest whole days beyond the retention window or byte budget; never edit a day file. */
export function pruneDayFiles(dir: string, retention = DIAGNOSTIC_LOG_RETENTION, now = Date.now()): string[] {
  const days = dayFilesIn(dir).reverse();
  const cutoff = new Date(now - retention.days * 86_400_000).toISOString().slice(0, 10);
  const removed: string[] = [];
  let bytes = 0;
  for (const [index, name] of days.entries()) {
    bytes += fs.statSync(path.join(dir, name)).size;
    if (index > 0 && (name.slice(0, 10) < cutoff || bytes > retention.bytes)) {
      fs.rmSync(path.join(dir, name));
      removed.push(name);
    }
  }
  return removed;
}

/** Append one record to today's day file, pruning when a new day starts. Returns the file written. */
export function appendDayRecord(dir: string, day: string, record: unknown): string {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, `${day}.jsonl`);
  const fresh = !fs.existsSync(file);
  fs.appendFileSync(file, JSON.stringify(record) + "\n", { mode: 0o600 });
  if (fresh) pruneDayFiles(dir);
  return file;
}
