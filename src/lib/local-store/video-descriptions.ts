import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { writeJsonFileAtomic } from "./atomic-json";
import { mediaAnalysisContentDir, projectMediaDir } from "./paths";
import { publishMediaContextDataset, readMediaContextIndex } from "./media-context";
import { validateVideoDescription, type VideoDescription, type VideoCatalogDescription } from "../media-analysis/video-descriptions";

const DATASET = "video_descriptions";
const checksum = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");

/** Shared by source hash, independently of which project imported the clip. */
export function publishVideoDescription(value: unknown): void {
  const description = validateVideoDescription(value);
  const hash = description.source_sha256;
  const bytes = `${JSON.stringify(description, null, 2)}\n`;
  const artifactHash = checksum(bytes);
  const relativePath = `video-descriptions/${artifactHash}.json`;
  const file = path.join(mediaAnalysisContentDir(hash), relativePath);
  if (!fs.existsSync(file)) writeJsonFileAtomic(file, description);
  const index = readMediaContextIndex(hash);
  const existing = index.datasets[DATASET];
  if (existing?.revisions.some(revision => revision.revision_id === artifactHash)) return;
  const times = description.frames.map(f => f.time_seconds);
  publishMediaContextDataset(hash, {
    dataset_id: DATASET, revision_id: artifactHash, kind: "video_frame_descriptions", evidence_level: "L2",
    producer: { name: "media-process", version: "2", recipe_version: description.recipe },
    input_revision_ids: description.summary_input_ids,
    coverage: { timebase: "source_seconds", status: "partial", observation_kind: "discrete_frames",
      observed_times_seconds: times, ranges: times.map(t => [t, t]),
      gaps: times.slice(1).map((t, i) => [times[i]!, t]), },
    coordinate_space: { system: "none", width: null, height: null, display_rotation_degrees: null },
    summary: { text: description.summary, tags: description.tags, examined_frames: times.length,
      duration_seconds: description.duration_seconds, sampling_plan_complete: true, continuous_coverage: false },
    artifact: { relative_path: relativePath, sha256: artifactHash, media_type: "application/json" },
    supersedes_revision_id: existing?.active_revision_id ?? null,
    created_at: new Date().toISOString(),
  });
}

export function readVideoDescription(hash: string): VideoDescription | null {
  const history = readMediaContextIndex(hash).datasets[DATASET];
  const revision = history?.revisions.find(r => r.revision_id === history.active_revision_id);
  if (!revision?.artifact) return null;
  const root = path.resolve(mediaAnalysisContentDir(hash));
  const file = path.resolve(root, revision.artifact.relative_path);
  if (!file.startsWith(root + path.sep)) throw new Error("Description artifact escapes source context");
  const bytes = fs.readFileSync(file);
  if (checksum(bytes) !== revision.artifact.sha256) throw new Error("Video description checksum mismatch");
  const description = validateVideoDescription(JSON.parse(bytes.toString("utf8")));
  if (description.source_sha256 !== hash) throw new Error("Video description belongs to another source");
  return description;
}

// Avoid hashing a large video on every search keystroke. A changed stat invalidates
// the cached verification; a hash, not a basename, selects its descriptions.
const verifiedSources = new Map<string, { identity: string; hash: string }>();
export function verifyCatalogSource(projectId: string, relativePath: string, expectedHash: string): boolean {
  const root = fs.realpathSync(projectMediaDir(projectId));
  const source = fs.realpathSync(path.resolve(root, relativePath));
  if (!source.startsWith(root + path.sep)) throw new Error("Catalog source escapes project media");
  const stat = fs.statSync(source);
  const identity = `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
  let verified = verifiedSources.get(source);
  if (verified?.identity !== identity) {
    const hash = createHash("sha256");
    const fd = fs.openSync(source, "r");
    try {
      const chunk = Buffer.allocUnsafe(1024 * 1024);
      for (;;) { const count = fs.readSync(fd, chunk, 0, chunk.length, null); if (!count) break; hash.update(chunk.subarray(0, count)); }
    } finally { fs.closeSync(fd); }
    const after = fs.statSync(source);
    if (`${after.dev}:${after.ino}:${after.size}:${after.mtimeMs}:${after.ctimeMs}` !== identity) return false;
    verified = { identity, hash: hash.digest("hex") };
    if (verifiedSources.size >= 4096) verifiedSources.clear();
    verifiedSources.set(source, verified);
  }
  return verified.hash === expectedHash;
}

export function videoCatalogDescription(projectId: string, mediaPath: string, hash?: string): VideoCatalogDescription {
  const pending: VideoCatalogDescription = { status: "pending", summary: null, duration_seconds: null, tags: [], frames: [],
    coverage: "Whole-video description pending", reason: null };
  if (!hash) return pending;
  try {
    const description = readVideoDescription(hash);
    if (!description) return pending;
    if (!verifyCatalogSource(projectId, mediaPath, hash)) return { ...pending, status: "stale", reason: "Source changed; analyze the current video" };
    return { status: "ready", summary: description.summary, duration_seconds: description.duration_seconds, tags: description.tags, frames: description.frames,
      coverage: `${description.frames.length} sampled frames across ${description.duration_seconds.toFixed(1)}s; one per second plus the ending. Between-frame content is unobserved.`,
      reason: description.uncertainties.map(text => text.trim()).join(" ") || null };
  } catch (error) { return { ...pending, status: "failed", reason: error instanceof Error ? error.message : "Description unavailable" }; }
}
