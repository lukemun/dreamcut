import fs from "node:fs";
import path from "node:path";

import { motionSubjectFromSourceUrl } from "@/lib/hyperframes/motion-media";
import { MANIFEST_FILE_NAME, parseCompositionManifest } from "@/lib/hyperframes/composition-manifest";
import { resolveTiming } from "@/lib/hyperframes/composition-timing";

import { listCandidateRenders } from "./hyperframes-candidates";
import { fingerprintHyperframesSource } from "./hyperframes-overlays";
import { projectDir } from "./paths";

export type MotionTiming = { duration: number; cues: Record<string, number> };

/**
 * Length and named cue times of a composition render, by its media URL. Newer renders record their
 * timing in the receipt; older ones are resolved from the current controls file while its source is
 * unchanged. Null for anything that is not a known composition render.
 */
export function motionTimingForSource(projectId: string, sourceUrl: string | null | undefined): MotionTiming | null {
  const subject = sourceUrl ? motionSubjectFromSourceUrl(sourceUrl) : null;
  if (!sourceUrl || subject?.kind !== "composition") return null;
  const relative = `media/${decodeURIComponent(sourceUrl.replace(/^\/api\/projects\/[^/]+\/media\//, "").replace(/^media\//, ""))}`;
  let receipt;
  try { receipt = listCandidateRenders(projectId, subject.id).find(candidate => candidate.output.project_relative_path === relative); } catch { return null; }
  if (!receipt) return null;
  // Only a well-formed recorded timing is trusted; anything else falls back to the controls file or length only.
  const recorded = receipt.parameters?.timing;
  let timing = recorded && (recorded.duration === null || (Number.isFinite(recorded.duration) && recorded.duration > 0))
    && recorded.cues && typeof recorded.cues === "object" && Object.values(recorded.cues).every((value) => Number.isFinite(value) && value >= 0)
    ? recorded : null;
  if (!timing && receipt.parameters) {
    try {
      const directory = path.join(projectDir(projectId), "hyperframes", subject.id);
      if (fingerprintHyperframesSource(directory) === receipt.source.fingerprint_sha256) {
        const manifest = parseCompositionManifest(JSON.parse(fs.readFileSync(path.join(directory, MANIFEST_FILE_NAME), "utf8")));
        if (manifest.timing) timing = resolveTiming(manifest.timing, receipt.parameters.values);
      }
    } catch { /* No declared timing: length only. */ }
  }
  return { duration: timing?.duration ?? receipt.output.duration_seconds, cues: timing?.cues ?? {} };
}
