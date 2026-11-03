import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

import type { TimelineElement, TimelineTransition } from "@/components/studio/timeline/types";
import { writeJsonFileAtomic } from "@/lib/local-store/atomic-json";
import {
  portableRelative,
  projectCompactionReceiptsDir,
  projectDir,
  projectTimelinePath,
  projectTimelineTombstonesPath,
} from "@/lib/local-store/paths";
import {
  assertProject,
  captureProjectHistorySnapshot,
  latestProjectHistorySnapshot,
  readTimeline,
  writeTimeline,
  type TimelineFile,
} from "@/lib/local-store/store";
import { CURRENT_TIMELINE_SCHEMA_VERSION } from "@/lib/local-store/timeline-migrations";

export type TimelineTombstoneArchive = {
  schema_version: 1;
  project_id: string;
  updated_at: string;
  elements: TimelineElement[];
  transitions: TimelineTransition[];
};

export type TimelineCompactionPlan = {
  project_id: string;
  timeline_bytes_before: number;
  timeline_bytes_projected: number;
  elements: { total: number; active: number; removable: number; already_archived: number };
  transitions: { total: number; active: number; removable: number; already_archived: number };
};

export type TimelineCompactionReceipt = TimelineCompactionPlan & {
  schema_version: 1;
  applied_at: string;
  timeline_bytes_after: number;
  archive_path: string;
  archive_sha256: string;
  pre_compaction_snapshot_id: string;
  post_compaction_snapshot_id: string;
};

const EMPTY_ARCHIVE = (projectId: string): TimelineTombstoneArchive => ({
  schema_version: 1,
  project_id: projectId,
  updated_at: new Date(0).toISOString(),
  elements: [],
  transitions: [],
});

function normalizedTimelineBytes(timeline: TimelineFile): number {
  return Buffer.byteLength(
    `${JSON.stringify({ schema_version: CURRENT_TIMELINE_SCHEMA_VERSION, ...timeline }, null, 2)}\n`,
  );
}

function sha256(value: Buffer): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function writeBufferAtomic(filePath: string, value: Buffer) {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
  const temporary = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${crypto.randomUUID()}.tmp`,
  );
  let descriptor: number | undefined;
  try {
    descriptor = fs.openSync(temporary, "wx", 0o600);
    fs.writeFileSync(descriptor, value);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporary, filePath);
    const directoryDescriptor = fs.openSync(directory, "r");
    try {
      fs.fsyncSync(directoryDescriptor);
    } finally {
      fs.closeSync(directoryDescriptor);
    }
  } catch (error) {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    try {
      fs.unlinkSync(temporary);
    } catch {
      // Rename may already have completed.
    }
    throw error;
  }
}

export function readTimelineTombstoneArchive(projectId: string): TimelineTombstoneArchive {
  const file = projectTimelineTombstonesPath(projectId);
  if (!fs.existsSync(file)) return EMPTY_ARCHIVE(projectId);
  const parsed = JSON.parse(gunzipSync(fs.readFileSync(file)).toString("utf8")) as Partial<TimelineTombstoneArchive>;
  if (
    parsed.schema_version !== 1
    || parsed.project_id !== projectId
    || !Array.isArray(parsed.elements)
    || !Array.isArray(parsed.transitions)
  ) {
    throw new Error(`Invalid timeline tombstone archive for ${projectId}`);
  }
  return parsed as TimelineTombstoneArchive;
}

function mergeById<T extends { id: string }>(archived: T[], current: T[]): T[] {
  const merged = new Map(archived.map((entry) => [entry.id, entry]));
  for (const entry of current) merged.set(entry.id, entry);
  return [...merged.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function buildTimelineCompactionPlan(projectId: string): TimelineCompactionPlan {
  assertProject(projectId);
  const timeline = readTimeline(projectId);
  const archive = readTimelineTombstoneArchive(projectId);
  const activeElements = timeline.elements.filter((element) => element.removed_at == null);
  const activeTransitions = timeline.transitions.filter((transition) => transition.removed_at == null);
  return {
    project_id: projectId,
    timeline_bytes_before: fs.statSync(projectTimelinePath(projectId)).size,
    timeline_bytes_projected: normalizedTimelineBytes({
      elements: activeElements,
      transitions: activeTransitions,
    }),
    elements: {
      total: timeline.elements.length,
      active: activeElements.length,
      removable: timeline.elements.length - activeElements.length,
      already_archived: archive.elements.length,
    },
    transitions: {
      total: timeline.transitions.length,
      active: activeTransitions.length,
      removable: timeline.transitions.length - activeTransitions.length,
      already_archived: archive.transitions.length,
    },
  };
}

function acquireMaintenanceLock(projectId: string): () => void {
  const lockPath = path.join(projectDir(projectId), ".timeline-maintenance.lock");
  let descriptor: number;
  try {
    descriptor = fs.openSync(lockPath, "wx", 0o600);
  } catch {
    throw new Error(`Project maintenance is already running for ${projectId}`);
  }
  fs.writeFileSync(descriptor, `${JSON.stringify({ pid: process.pid, started_at: new Date().toISOString() })}\n`);
  fs.fsyncSync(descriptor);
  fs.closeSync(descriptor);
  return () => {
    try {
      fs.unlinkSync(lockPath);
    } catch {
      // A crashed process may already have had its stale lock removed manually.
    }
  };
}

export function applyTimelineCompaction(projectId: string): TimelineCompactionReceipt | null {
  assertProject(projectId);
  const release = acquireMaintenanceLock(projectId);
  try {
    const plan = buildTimelineCompactionPlan(projectId);
    if (plan.elements.removable === 0 && plan.transitions.removable === 0) return null;

    const timeline = readTimeline(projectId);
    const previousArchive = readTimelineTombstoneArchive(projectId);
    const now = new Date().toISOString();
    const nextArchive: TimelineTombstoneArchive = {
      schema_version: 1,
      project_id: projectId,
      updated_at: now,
      elements: mergeById(
        previousArchive.elements,
        timeline.elements.filter((element) => element.removed_at != null),
      ),
      transitions: mergeById(
        previousArchive.transitions,
        timeline.transitions.filter((transition) => transition.removed_at != null),
      ),
    };
    const archiveJson = Buffer.from(`${JSON.stringify(nextArchive)}\n`);
    const archiveGzip = gzipSync(archiveJson, { level: 9 });
    writeBufferAtomic(projectTimelineTombstonesPath(projectId), archiveGzip);
    const verified = readTimelineTombstoneArchive(projectId);
    if (
      verified.elements.length !== nextArchive.elements.length
      || verified.transitions.length !== nextArchive.transitions.length
    ) {
      throw new Error("Timeline tombstone archive verification failed");
    }

    const pre = captureProjectHistorySnapshot(projectId, "pre_timeline_compaction");
    const compacted: TimelineFile = {
      elements: timeline.elements.filter((element) => element.removed_at == null),
      transitions: timeline.transitions.filter((transition) => transition.removed_at == null),
    };
    writeTimeline(projectId, compacted, "timeline_compaction");
    const post = latestProjectHistorySnapshot(projectId);
    if (!post) throw new Error("Timeline compaction did not create a restoration checkpoint");

    const receipt: TimelineCompactionReceipt = {
      schema_version: 1,
      ...plan,
      applied_at: now,
      timeline_bytes_after: fs.statSync(projectTimelinePath(projectId)).size,
      archive_path: portableRelative(projectDir(projectId), projectTimelineTombstonesPath(projectId)),
      archive_sha256: sha256(archiveGzip),
      pre_compaction_snapshot_id: pre.id,
      post_compaction_snapshot_id: post.id,
    };
    const stamp = now.replace(/[:.]/g, "-");
    writeJsonFileAtomic(
      path.join(projectCompactionReceiptsDir(projectId), `${stamp}.json`),
      receipt,
    );
    return receipt;
  } finally {
    release();
  }
}

/**
 * Rehydrates an archived deleted element and its related transitions so the
 * existing restore endpoint and browser undo stack keep working after cleanup.
 */
export function rehydrateArchivedElement(
  projectId: string,
  timeline: TimelineFile,
  elementId: string,
): TimelineElement | null {
  const existing = timeline.elements.find((element) => element.id === elementId);
  if (existing) return existing;
  const archive = readTimelineTombstoneArchive(projectId);
  const archived = archive.elements.find((element) => element.id === elementId);
  if (!archived) return null;
  timeline.elements.push(structuredClone(archived));
  const knownTransitionIds = new Set(timeline.transitions.map((transition) => transition.id));
  for (const transition of archive.transitions) {
    if (
      !knownTransitionIds.has(transition.id)
      && (transition.from_element_id === elementId || transition.to_element_id === elementId)
    ) {
      timeline.transitions.push(structuredClone(transition));
      knownTransitionIds.add(transition.id);
    }
  }
  return timeline.elements.at(-1) ?? null;
}
