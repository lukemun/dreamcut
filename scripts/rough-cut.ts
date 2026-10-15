import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { activeElements, newId, newRowTimestamps, readTimeline, writeTimeline } from "@/lib/local-store/store";
import { validateAlignment } from "@/lib/instruments/captions";
import { buildEditMap, proposeRoughCuts, retainedRegions, sourceRegions, type RoughCutRemoval } from "@/lib/instruments/rough-cut";
import { quantizeVisualFrameSpan, quantizeVisualTrimValue } from "@/lib/timeline/frame-quantization";
import { syncTransitionsForElements } from "@/lib/local-store/transition-sync";
import type { TimelineElement } from "@/components/studio/timeline/types";

type Proposal = { version: 2; projectId: string; sourceElementId: string; alignmentPath: string; vadPath: string | null; removals: RoughCutRemoval[] };

const args = process.argv.slice(2);
const projectId = args[0];
const alignmentPath = args[1];
const value = (flag: string) => args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;
if (!projectId || !alignmentPath) throw new Error("usage: pnpm rough-cut <projectId> <alignment.json> [--vad vad.json] [--out proposal.json] [--apply proposal.json]");
const timeline = readTimeline(projectId);
const source = activeElements(timeline).find((element) => element.type === "video_clip");
if (!source) throw new Error("Rough cut requires one active source video clip.");
const sourceGroupId = typeof source.props?.rough_cut_source_id === "string" ? source.props.rough_cut_source_id : source.id;
const words = validateAlignment(JSON.parse(readFileSync(alignmentPath, "utf8")));
const vadPath = value("--vad");
const vadRegions = vadPath ? JSON.parse(readFileSync(vadPath, "utf8")) as Array<{ start: number; end: number }> : [];
const proposalPath = value("--apply") ?? value("--out") ?? path.join(process.env.TIMELINE_PROJECTS_DIR ?? "projects", projectId, "instruments", "rough-cut-proposal.json");

if (!args.includes("--apply")) {
  const removals = proposeRoughCuts(words, sourceRegions(timeline.elements, sourceGroupId), vadRegions);
  const proposal: Proposal = { version: 2, projectId, sourceElementId: sourceGroupId, alignmentPath, vadPath: vadPath ?? null, removals };
  mkdirSync(path.dirname(proposalPath), { recursive: true });
  writeFileSync(proposalPath, `${JSON.stringify(proposal, null, 2)}\n`);
  console.log(`${proposalPath}\n${removals.length} candidates; no timeline writes. Set approved=true, then rerun with --apply.`);
} else {
  if (!existsSync(proposalPath)) throw new Error(`Proposal not found: ${proposalPath}`);
  const proposal = JSON.parse(readFileSync(proposalPath, "utf8")) as Proposal;
  if (proposal.projectId !== projectId || proposal.sourceElementId !== sourceGroupId) throw new Error("Proposal does not match the active project/source clip.");
  const approved = proposal.removals.filter((removal) => removal.approved).sort((a, b) => a.sourceStart - b.sourceStart);
  for (let index = 1; index < approved.length; index += 1) if (approved[index].sourceStart < approved[index - 1].sourceEnd) throw new Error("Approved removals overlap.");
  if (!approved.length) throw new Error("Proposal has no approved removals.");
  const existingRegions = sourceRegions(timeline.elements, sourceGroupId);
  if (existingRegions.length !== 1) throw new Error("Apply currently requires one continuous active source region; regenerate a proposal after each approved pass.");
  const retained = retainedRegions(existingRegions[0]!, approved);
  const cuts = approved;
  const now = new Date().toISOString();
  source.removed_at = now;
  source.removed_reason = "user";
  source.updated_at = now;
  const originalEnd = source.timeline_start + source.duration;
  let timelineCursor = source.timeline_start;
  for (const region of retained) {
    const span = quantizeVisualFrameSpan(timelineCursor, (region.sourceEnd - region.sourceStart) / source.playback_rate);
    const clone: TimelineElement = {
      ...source,
      id: newId(),
      timeline_start: span.timeline_start,
      duration: span.duration,
      trim_start: quantizeVisualTrimValue(region.sourceStart),
      trim_end: quantizeVisualTrimValue(Math.max(0, Number(source.props?.source_duration_seconds ?? existingRegions[0]!.sourceEnd) - region.sourceEnd)),
      props: { ...(source.props ?? {}), rough_cut_source_id: sourceGroupId, av_sync_offset_ms: 0 },
      removed_at: null,
      removed_reason: null,
      ...newRowTimestamps(),
    };
    timeline.elements.push(clone);
    timelineCursor = span.timeline_start + span.duration;
  }
  const removedDuration = originalEnd - timelineCursor;
  for (const element of timeline.elements) {
    if (element.type !== "caption_text" || element.removed_at != null) continue;
    element.removed_at = now;
    element.removed_reason = "user";
    element.updated_at = now;
  }
  for (const element of timeline.elements) {
    if (element.removed_at != null || element.id === source.id || element.type === "caption_text") continue;
    if (element.timeline_start >= originalEnd) {
      element.timeline_start = quantizeVisualTrimValue(element.timeline_start - removedDuration);
      element.updated_at = now;
    }
  }
  syncTransitionsForElements(timeline);
  const editMapPath = path.join(path.dirname(proposalPath), "rough-cut-edit-map.json");
  writeFileSync(editMapPath, `${JSON.stringify(buildEditMap(retained), null, 2)}\n`);
  writeTimeline(projectId, timeline, "rough_cut_apply");
  console.log(`Applied ${cuts.length} removals as ${retained.length} retained clips in one history snapshot. Edit map: ${editMapPath}. Regenerate captions.`);
}
