import fs from "node:fs";
import path from "node:path";

type Descriptor = { id: string; op: string; at: string };
type Entry = { directoryStamp: string; fileStamp: string; descriptor: Descriptor };
const HEADER_BYTES = 64 * 1024;
const MAX_DIRECTORIES = 64;
const cache = new Map<string, Entry>();

function stamp(stat: fs.BigIntStats) {
  return `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
}

/** Find the actual top-level timeline key, ignoring quoted text and nested keys. */
function timelineKeyOffset(text: string): number {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      const start = i++;
      for (; i < text.length; i++) {
        if (text[i] === "\\") i++;
        else if (text[i] === '"') break;
      }
      let next = i + 1;
      while (/\s/.test(text[next] ?? "") && next < text.length) next++;
      if (depth === 1 && text[next] === ":") {
        if (JSON.parse(text.slice(start, i + 1)) === "timeline") return start;
      }
    } else if (char === "{" || char === "[") depth++;
    else if (char === "}" || char === "]") depth--;
  }
  return -1;
}

function readDescriptor(file: string, id: string): Descriptor {
  const fd = fs.openSync(file, "r");
  let header: Record<string, unknown> = {};
  try {
    const size = fs.fstatSync(fd).size;
    const buffer = Buffer.alloc(Math.min(size, HEADER_BYTES));
    let read = 0;
    while (read < buffer.length) {
      const count = fs.readSync(fd, buffer, read, buffer.length - read, read);
      if (!count) break;
      read += count;
    }
    const text = buffer.subarray(0, read).toString("utf8");
    try {
      // Small legacy snapshots may put descriptor fields after the timeline.
      // Large snapshots use the store's header-before-timeline layout. Fields
      // beyond the bounded header fall back rather than loading the whole edit.
      const end = size > HEADER_BYTES ? timelineKeyOffset(text) : -1;
      const parsed: unknown = JSON.parse(end >= 0 ? text.slice(0, end).replace(/,\s*$/, "") + "}" : text);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) header = parsed as Record<string, unknown>;
    } catch { /* A malformed or oversized legacy header has the stable fallback label. */ }
  } finally {
    fs.closeSync(fd);
  }
  return { id, op: typeof header.op === "string" ? header.op : "timeline_write", at: typeof header.at === "string" ? header.at : id };
}

/** Polling metadata only; never used to restore or validate authoritative history. */
export function latestHistoryDescriptor(directory: string): Descriptor | null {
  const key = path.resolve(directory);
  try {
    const directoryStamp = stamp(fs.statSync(key, { bigint: true }));
    const previous = cache.get(key);
    let id = previous?.directoryStamp === directoryStamp ? previous.descriptor.id : undefined;
    if (!id) {
      // Match the store's safe snapshot names; lexicographic maximum needs no sort.
      for (const candidate of fs.readdirSync(key)) {
        if (!candidate.endsWith(".json") || candidate.includes("..") || candidate.includes("/") || candidate.includes("\\")) continue;
        if (!id || candidate > id) id = candidate;
      }
    }
    if (!id) { cache.delete(key); return null; }
    const file = path.join(key, id);
    const fileStamp = stamp(fs.statSync(file, { bigint: true }));
    const descriptor = previous?.descriptor.id === id && previous.fileStamp === fileStamp
      ? previous.descriptor : readDescriptor(file, id);
    cache.delete(key);
    cache.set(key, { directoryStamp, fileStamp, descriptor });
    if (cache.size > MAX_DIRECTORIES) cache.delete(cache.keys().next().value!);
    return { ...descriptor };
  } catch {
    // Missing/replaced directories and transient write races are retried next poll.
    cache.delete(key);
    return null;
  }
}
