// Deterministic playability gate. Walks every active video_clip through the
// SAME timing resolver the preview player uses and fails when a clip's mount
// window is degenerate — the frozen-frame class that schema validation passes:
//   - source_duration_seconds written as a section end instead of the file duration
//   - trim_end written as an absolute timestamp instead of a TAIL trim
// Both collapse resolveMediaTiming's playable window to ~0 and mount a 1-frame
// clip with no audio. (Earned 2026-07-21, Cover Thumbnail Test take audition.)
//
// Usage: pnpm verify:playable --project <projectId> [--strict]
//   default: fail on any clip whose visible playable window is ≤ 3 frames, or
//            shorter than its timeline duration by > 1 frame with no explicit
//            hold/limit metadata to explain the freeze.
//   --strict: additionally fail on ANY unexplained trailing hold (audition
//             projects — candidates must play their full window).

import { readTimeline } from "@/lib/local-store/store";
import { resolveMediaTiming } from "@/lib/timeline/media";
import type { TimelineElement } from "@/components/studio/timeline/types";

const FRAME = 1 / 30;
const args = process.argv.slice(2);
const value = (flag: string) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
const projectId = value("--project");
const strict = args.includes("--strict");
if (!projectId) throw new Error("usage: verify-playable-windows.ts --project <projectId> [--strict]");

const timeline = readTimeline(projectId);
const clips = timeline.elements.filter(
  (element: TimelineElement) => element.type === "video_clip" && element.removed_at == null,
);

let failures = 0;

// A visual element with no source wedges the whole preview transport — the app
// shows "playing" while the clock stays pinned at 0:00. Placeholders must point
// at real (transparent) media. (Earned 2026-07-21, assembler trace placeholders.)
for (const element of timeline.elements) {
  if (element.removed_at != null) continue;
  if ((element.type === "still" || element.type === "video_clip") && !element.source_url) {
    failures += 1;
    console.error(
      `FAIL ${element.id.slice(0, 8)} ${element.type} [start ${element.timeline_start.toFixed(2)} lane ${element.lane_key}] — ` +
      "null source_url on a visual element; the preview transport blocks on it. Point placeholders at real transparent media.",
    );
  }
}
for (const clip of clips) {
  const timing = resolveMediaTiming(clip);
  const props = (clip.props ?? {}) as Record<string, unknown>;
  const explainedHold =
    (typeof props.leading_hold_duration_seconds === "number" && props.leading_hold_duration_seconds > 0) ||
    typeof props.media_limit_duration_seconds === "number" ||
    typeof props.segment_role === "string";
  const playable = timing.visiblePlayableTimelineDuration;
  const shortfall = clip.duration - timing.leadingHoldDuration - playable;
  const label = `${clip.id.slice(0, 8)} ${(clip.source_url ?? "").split("/").pop()} ` +
    `[start ${clip.timeline_start.toFixed(2)} dur ${clip.duration.toFixed(2)} ` +
    `trim ${clip.trim_start.toFixed(2)}/${(clip.trim_end ?? 0).toFixed(2)} playable ${playable.toFixed(2)}]`;

  const degenerate = playable <= 3 * FRAME + 1e-9;
  const unexplainedFreeze = shortfall > FRAME + 1e-9 && !explainedHold;
  if (degenerate || (unexplainedFreeze && (strict || playable < clip.duration / 2))) {
    failures += 1;
    console.error(
      `FAIL ${label} — ${degenerate ? "mount window is ≤3 frames (frozen clip)" : `unexplained trailing freeze of ${shortfall.toFixed(2)}s`}. ` +
      "Check: source_duration_seconds must be the FULL file duration; trim_end is a TAIL trim (seconds cut off the end), never an absolute timestamp.",
    );
  } else if (strict && unexplainedFreeze) {
    failures += 1;
    console.error(`FAIL ${label} — strict: trailing freeze of ${shortfall.toFixed(2)}s with no hold metadata.`);
  } else {
    console.log(`ok   ${label}`);
  }
}

console.log(`${clips.length} clips checked, ${failures} failing`);
if (failures > 0) process.exit(1);
