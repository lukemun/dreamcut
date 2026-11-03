import fs from "node:fs";
import path from "node:path";

import {
  projectDir,
  projectHistoryDir,
  projectInstrumentsDir,
  projectMediaDir,
  projectRendersDir,
  projectReviewDir,
  projectTimelinePath,
} from "@/lib/local-store/paths";
import { summarizeProjectMotionAudit, type MotionAuditSummary } from "@/lib/local-store/motion-audit";
import { activeElements, activeTransitions, assertProject, readTimeline } from "@/lib/local-store/store";

export type StorageHealth = {
  exists: boolean;
  files: number;
  bytes: number;
};

export type ProjectHealthReport = {
  schema_version: 1;
  generated_at: string;
  project_id: string;
  timeline: {
    bytes: number;
    total_elements: number;
    active_elements: number;
    removed_elements: number;
    active_transitions: number;
    active_lanes: number;
    active_sources: number;
    duration_seconds: number;
  };
  storage: {
    project: StorageHealth;
    media: StorageHealth;
    renders: StorageHealth;
    history: StorageHealth;
    preprocess: StorageHealth;
    instruments: StorageHealth;
    review: StorageHealth;
  };
  /** Audit summaries for model-authored compositions and synthesized sounds. */
  motion: MotionAuditSummary[];
};

function storageHealth(target: string): StorageHealth {
  let root: fs.Stats;
  try {
    root = fs.statSync(target);
  } catch {
    return { exists: false, files: 0, bytes: 0 };
  }
  if (root.isFile()) {
    return { exists: true, files: 1, bytes: root.size };
  }
  if (!root.isDirectory()) {
    return { exists: true, files: 0, bytes: 0 };
  }

  let files = 0;
  let bytes = 0;
  const pending = [target];
  while (pending.length > 0) {
    const directory = pending.pop()!;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const item = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        pending.push(item);
      } else if (entry.isFile()) {
        const stat = fs.statSync(item);
        files += 1;
        bytes += stat.size;
      }
    }
  }
  return { exists: true, files, bytes };
}

export function buildProjectHealthReport(
  projectId: string,
  generatedAt = new Date().toISOString(),
): ProjectHealthReport {
  assertProject(projectId);
  const timelinePath = projectTimelinePath(projectId);
  const timeline = readTimeline(projectId);
  const active = activeElements(timeline);
  const durationSeconds = active.reduce(
    (latest, element) => Math.max(latest, element.timeline_start + element.duration),
    0,
  );

  return {
    schema_version: 1,
    generated_at: generatedAt,
    project_id: projectId,
    timeline: {
      bytes: fs.statSync(timelinePath).size,
      total_elements: timeline.elements.length,
      active_elements: active.length,
      removed_elements: timeline.elements.length - active.length,
      active_transitions: activeTransitions(timeline).length,
      active_lanes: new Set(active.map((element) => element.lane_key)).size,
      active_sources: new Set(active.map((element) => element.source_url).filter(Boolean)).size,
      duration_seconds: Number(durationSeconds.toFixed(3)),
    },
    storage: {
      project: storageHealth(projectDir(projectId)),
      media: storageHealth(projectMediaDir(projectId)),
      renders: storageHealth(projectRendersDir(projectId)),
      history: storageHealth(projectHistoryDir(projectId)),
      preprocess: storageHealth(path.join(projectDir(projectId), "preprocess")),
      instruments: storageHealth(projectInstrumentsDir(projectId)),
      review: storageHealth(projectReviewDir(projectId)),
    },
    motion: summarizeProjectMotionAudit(projectId),
  };
}
