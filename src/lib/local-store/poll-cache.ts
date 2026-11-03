import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { projectDir } from "./paths";

// Server-only. A polled read rebuilt from project files answers an unchanged poll from its last
// body: the key is every input file's size and modification time, which costs a directory walk,
// not a rebuild. Hashing the finished body (conditionalJsonResponse) still needs the rebuild.

/** Project folders a polled read never depends on: evidence, exports and preparation scratch. */
const SKIPPED = new Set(["instruments", "renders", "audit", "node_modules"]);
const SKIPPED_NESTED = new Set([path.join("preprocess", "proposal-ready-previews"), path.join("preprocess", "media-preparation"), path.join("preprocess", "motion-jobs"), path.join("preprocess", "export-chunks"), path.join("media", ".prepared")]);

function walk(root: string, relative: string, hash: ReturnType<typeof createHash>, skip: ReadonlySet<string> = new Set()) {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(path.join(root, relative), { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    const child = relative ? path.join(relative, entry.name) : entry.name;
    if (entry.isDirectory()) {
      if ((!relative && (SKIPPED.has(entry.name) || skip.has(entry.name))) || SKIPPED_NESTED.has(child)) continue;
      walk(root, child, hash, skip);
    } else if (entry.isFile()) {
      try {
        const stat = fs.statSync(path.join(root, child));
        hash.update(`${child}\0${stat.size}\0${stat.mtimeMs}\n`);
      } catch { /* removed during the walk: the next poll sees it */ }
    }
  }
}

/**
 * A fingerprint of a project's inputs (plus any extra folders, such as the look manifests).
 * `skipTopLevel` leaves out project folders a caller tracks another way (proposal cards).
 */
export function projectInputsKey(projectId: string, extraDirs: readonly string[] = [], skipTopLevel: readonly string[] = []): string {
  const hash = createHash("sha1");
  walk(projectDir(projectId), "", hash, new Set(skipTopLevel));
  for (const dir of extraDirs) {
    hash.update(`\0${dir}\0`);
    walk(dir, "", hash);
  }
  return hash.digest("base64url");
}

type Cached = { key: string; etag: string; text: string };
const cache = new Map<string, Cached>();
const MAX_ENTRIES = 32;

function respond(request: Request, entry: Cached): Response {
  const headers = { ETag: entry.etag, "Cache-Control": "no-cache" };
  const match = request.headers.get("if-none-match");
  if (match && match.split(",").some((candidate) => candidate.trim().replace(/^W\//, "") === entry.etag)) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(entry.text, { status: 200, headers: { ...headers, "Content-Type": "application/json" } });
}

/**
 * JSON for a polled read whose body depends only on files under the project (and `extraDirs`).
 * An unchanged input key reuses the last body and its ETag without calling `build`. Building may
 * itself write project files (refreshing stale cards), so the body is stored under the key taken
 * after building.
 */
export function cachedPolledJson(request: Request, scope: string, projectId: string, build: () => unknown, extraDirs: readonly string[] = [], extraKey: () => string = () => ""): Response {
  const id = `${projectId}\0${scope}`;
  const key = `${projectInputsKey(projectId, extraDirs)}:${extraKey()}`;
  const hit = cache.get(id);
  if (hit && hit.key === key) return respond(request, hit);
  const text = JSON.stringify(build());
  const entry = { key: `${projectInputsKey(projectId, extraDirs)}:${extraKey()}`, etag: `"${createHash("sha1").update(text).digest("base64url")}"`, text };
  cache.delete(id);
  cache.set(id, entry);
  if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value!);
  return respond(request, entry);
}
