import fs from "node:fs";
import path from "node:path";
import { getOrMeasureLufs } from "../local-store/audio-loudness";
import { readJsonFile } from "../local-store/atomic-json";
import { preparationDir, preparationKey, preparationSourcePath, writePreparation, type PreparedMedia } from "../local-store/media-preparation";

/** A queued replacement must survive an older analysis finishing or failing. */
function publishAudioPreparation(projectId: string, expected: PreparedMedia, next: PreparedMedia): PreparedMedia {
  const current = readJsonFile<PreparedMedia | null>(path.join(preparationDir(projectId), `${preparationKey(expected.source)}.json`), null);
  // Compare the raw receipt: readPreparation intentionally hides stale sources.
  if (JSON.stringify(current) !== JSON.stringify(expected)) return current ?? next;
  writePreparation(projectId, next);
  return next;
}

/** Detached preparation only: cache analysis without changing source bytes or timeline gain. */
export async function prepareAudioMedia(projectId: string, record: PreparedMedia): Promise<PreparedMedia> {
  try {
    const source = preparationSourcePath(projectId, record.source);
    const before = fs.statSync(source);
    if (before.size !== record.size || before.mtimeMs !== record.mtime
      || (record.ctime !== undefined && before.ctimeMs !== record.ctime)) throw new Error("Source changed before audio preparation");
    const lufs = await getOrMeasureLufs(projectId, source, record.source);
    const after = fs.statSync(source);
    if (after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size
      || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) throw new Error("Source changed during audio preparation");
    const ready: PreparedMedia = { ...record, ctime: after.ctimeMs, state: "ready", preview: record.source,
      render: record.source, audio: record.source,
      loudness: lufs == null ? { state: "unavailable" } : { state: "ready", integrated_lufs: lufs } };
    delete ready.stage;
    delete ready.error;
    return publishAudioPreparation(projectId, record, ready);
  } catch (error) {
    const failed: PreparedMedia = { ...record, state: "failed", error: error instanceof Error ? error.message : String(error) };
    return publishAudioPreparation(projectId, record, failed);
  }
}

/** Video packages retain separate audio authorities, each measured against its own bytes. */
export async function prepareVideoLoudness(projectId: string, record: PreparedMedia): Promise<void> {
  if (record.state !== "ready" || !record.audio) return;
  for (const source of new Set([record.source, record.render, record.audio].filter((value): value is string => !!value))) {
    await getOrMeasureLufs(projectId, preparationSourcePath(projectId, source), source);
  }
}
