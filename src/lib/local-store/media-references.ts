import fs from "node:fs";
import path from "node:path";
import { projectsRoot } from "./paths";

/** The spellings a media-relative path takes in project records: raw, and as a media URL. */
export function mediaPathSpellings(relative: string): string[] {
  const encoded = relative.split("/").map(encodeURIComponent).join("/");
  return encoded === relative ? [relative] : [relative, encoded];
}

/** Every JSON record under the projects root; symlinks are not followed. */
export function* projectRecordFiles(root = projectsRoot()): Generator<string> {
  const pending = [root];
  while (pending.length) {
    const dir = pending.pop()!;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) { if (entry.name !== "node_modules") pending.push(file); }
      else if (entry.isFile() && /\.(json|jsonl|ndjson)$/i.test(entry.name)) yield file;
    }
  }
}

/**
 * Which media-relative paths any record in any project mentions, with the records that do.
 * Matching is by substring, so a cloned project naming the same relative path also keeps it:
 * a false "referenced" only retains bytes, while a missed reference could lose authority.
 */
export function findMediaReferences(relativePaths: string[], root = projectsRoot()): Map<string, string[]> {
  const found = new Map<string, string[]>();
  if (!relativePaths.length) return found;
  const needles = relativePaths.map(relative => ({ relative, spellings: mediaPathSpellings(relative).map(s => Buffer.from(s)) }));
  for (const file of projectRecordFiles(root)) {
    const bytes = fs.readFileSync(file);
    for (const needle of needles) {
      if (!needle.spellings.some(spelling => bytes.indexOf(spelling) >= 0)) continue;
      const records = found.get(needle.relative) ?? [];
      records.push(file);
      found.set(needle.relative, records);
    }
  }
  return found;
}
