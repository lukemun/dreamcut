import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

import { compressedJsonText } from "@/lib/local-store/compressed-json";
import { preparationDir, preparationRecordsKey, readPreparation } from "@/lib/local-store/media-preparation";
import { isSafeProjectId, projectDir, projectMediaDir } from "@/lib/local-store/paths";
import { projectInputsKey } from "@/lib/local-store/poll-cache";
import { readPreviewSettings } from "@/lib/local-store/preview-settings";
import { readTimelineSnapshot, type TimelineFile } from "@/lib/local-store/store";
import { timelinePayload } from "@/lib/local-store/timeline-payload";

type Params = { params: Promise<{ projectId: string }> };

// The editor reads the whole timeline on load and on every external reload. An unchanged read answers
// from the last body (304 when the browser holds it) after a cheap fingerprint of every input the
// payload reads: the project's files (preview proxies and preparation records included), the preview
// size, and the same for any other project whose media the timeline uses. Library catalog media lives
// outside any project, so a timeline or selection that uses it is rebuilt and tagged by its body.

const ROUTE_LOADED = Date.now();
/** Project folders the payload never reads; agents write them often. */
const UNREAD = ["proposals", "memory", "history"];
const PROJECT_MEDIA = /\/api\/projects\/([^/?#]+)\/media\//g;
const CATALOG = /\/api\/(?:visual|image)-catalog\/|^catalog:/;

type References = { projects: string[]; catalog: boolean };
const referenceMemo = new Map<string, References>();

/** Other projects and catalogs the timeline's strings point at, once per revision. */
function timelineReferences(projectId: string, revision: string, timeline: TimelineFile): References {
  const id = `${projectId}\0${revision}`;
  const hit = referenceMemo.get(id);
  if (hit) return hit;
  const projects = new Set<string>();
  let catalog = false;
  const visit = (value: unknown): void => {
    if (typeof value === "string") {
      if (value.length < 9) return;
      if (value.startsWith("catalog:") || (value.includes("-catalog/") && CATALOG.test(value))) catalog = true;
      if (!value.includes("/api/projects/")) return;
      for (const match of value.matchAll(PROJECT_MEDIA)) {
        let other = match[1]!;
        try { other = decodeURIComponent(other); } catch { /* left as written */ }
        if (other !== projectId && isSafeProjectId(other)) projects.add(other);
      }
    } else if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index++) if (typeof value[index] !== "number") visit(value[index]);
    } else if (value && typeof value === "object") {
      for (const key in value) visit((value as Record<string, unknown>)[key]);
    }
  };
  visit(timeline.elements);
  visit(timeline.transitions);
  const result = { projects: [...projects].sort(), catalog };
  if (referenceMemo.size >= 16) referenceMemo.delete(referenceMemo.keys().next().value!);
  referenceMemo.set(id, result);
  return result;
}

function selectionUsesCatalog(projectId: string): boolean {
  try { return fs.readFileSync(path.join(projectDir(projectId), "workspace-selection.json"), "utf8").includes("catalog:"); }
  catch { return false; }
}

/** Projects whose files the payload reads: this one and any whose media the timeline uses. */
function owners(projectId: string): string[] {
  const { timeline, revision } = readTimelineSnapshot(projectId);
  return [projectId, ...timelineReferences(projectId, revision, timeline).projects];
}

/**
 * A preparation still running (or queued) for current media. Building the payload is what restarts a
 * worker that died mid-preparation, so such a project is rebuilt on every read, never answered from cache.
 */
function preparing(projectIds: readonly string[]): boolean {
  return projectIds.some((owner) => {
    let names: string[];
    try { names = fs.readdirSync(preparationDir(owner)).filter((name) => name.endsWith(".json")); } catch { return false; }
    return names.some((name) => {
      try {
        const record = JSON.parse(fs.readFileSync(path.join(preparationDir(owner), name), "utf8")) as { state?: string; source?: unknown };
        return record.state === "preparing" && typeof record.source === "string" && readPreparation(owner, record.source)?.state === "preparing";
      } catch { return false; }
    });
  });
}

/** Null when the payload reads inputs this cannot fingerprint (catalog media). */
function inputsKey(projectId: string): string | null {
  const { timeline, revision } = readTimelineSnapshot(projectId);
  const references = timelineReferences(projectId, revision, timeline);
  if (references.catalog || selectionUsesCatalog(projectId)) return null;
  // A project whose media the timeline uses is read the same way (its proxies, still previews and
  // preparation records, at its own preview size).
  return [ROUTE_LOADED, revision, ...[projectId, ...references.projects].map((owner) => [
    owner,
    projectInputsKey(owner, [path.join(projectMediaDir(owner), ".prepared")], UNREAD),
    preparationRecordsKey(owner),
    JSON.stringify(readPreviewSettings(owner)),
  ].join(":"))].join("\n");
}

type Cached = { key: string; etag: string; text: string };
const cache = new Map<string, Cached>();
const MAX_ENTRIES = 8;

const etagOf = (text: string) => `"${createHash("sha1").update(text).digest("base64url")}"`;

function respond(request: Request, etag: string, text: string, conditional = true): Response {
  const headers = { ETag: etag, "Cache-Control": "no-cache" };
  const match = request.headers.get("if-none-match");
  if (conditional && match && match.split(",").some((candidate) => candidate.trim().replace(/^W\//, "") === etag)) {
    return new Response(null, { status: 304, headers: { ...headers, Vary: "Accept-Encoding" } });
  }
  return compressedJsonText(request, text, { headers });
}

function build(projectId: string): string {
  const { timeline, revision } = readTimelineSnapshot(projectId);
  return JSON.stringify({ ...timelinePayload(projectId, timeline), revision });
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    const before = inputsKey(projectId);
    const hit = cache.get(projectId);
    if (before !== null && hit?.key === before) return respond(request, hit.etag, hit.text);
    const text = build(projectId);
    const etag = etagOf(text);
    // While preparation runs, every read rebuilds (which keeps the worker going) and sends the body.
    if (preparing(owners(projectId))) {
      cache.delete(projectId);
      return respond(request, etag, text, false);
    }
    // Building can write project files (a queued preparation, a probe receipt). Keep the body only when
    // nothing changed while it was built, so a write during the build is never hidden behind it.
    if (before !== null && inputsKey(projectId) === before) {
      cache.delete(projectId);
      cache.set(projectId, { key: before, etag, text });
      if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value!);
    }
    return respond(request, etag, text);
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load timeline" },
      { status },
    );
  }
}
