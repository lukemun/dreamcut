import type { TimelineElement } from "@/components/studio/timeline/types";
import { activeElements, captureProjectHistorySnapshot, readProjectFrameRate, writeTimeline, type TimelineFile } from "./store";
import { changedSince, splitSingleWordCaptions } from "@/lib/timeline/caption-word-elements";
import { reconcileCaptionFollowers } from "./caption-followers";
import { reconcileSoundLinks, refreshMotionTiming } from "@/lib/timeline/sound-link";
import { motionTimingForSource } from "./motion-timing";

/** Call under the project lock, after validation. No side effects until derivation succeeds. */
export function writeWithCaptionFollowers(projectId: string, before: TimelineElement[], timeline: TimelineFile, op: string) {
  // Captions follow their speech, and linked sounds follow their picture.
  // A clip whose source changed (a re-rendered motion graphic) takes that render's timing first.
  const priorSource = new Map(before.map((element) => [element.id, element.source_url]));
  const resourced = timeline.elements.filter((element) => priorSource.get(element.id) !== element.source_url).map((element) => element.id);
  const changed = [
    ...refreshMotionTiming(timeline.elements, resourced, (url) => motionTimingForSource(projectId, url)),
    ...reconcileCaptionFollowers(before, timeline.elements, projectId),
    ...reconcileSoundLinks(before, timeline.elements),
    // One caption per shown word: return the new captions so the editor replaces its list.
    ...splitSingleWordCaptions(timeline.elements, { fps: readProjectFrameRate(projectId), only: changedSince(before) }),
  ];
  const beforeSnapshot = changed.length ? captureProjectHistorySnapshot(projectId, `${op}_before`) : null;
  writeTimeline(projectId, timeline, op);
  return changed.length && beforeSnapshot ? {
    history: { before: beforeSnapshot, after: captureProjectHistorySnapshot(projectId, `${op}_after`) },
    caption_follow_elements: activeElements(timeline),
  } : {};
}
