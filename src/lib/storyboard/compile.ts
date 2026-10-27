import { createHash } from "node:crypto";
import type { EditorAgentOperation } from "../agent/timeline-editor-agent-apply";
import { motionSubjectFromSourceUrl } from "../hyperframes/motion-media";
import { FLOAT_LAYOUT } from "./float-layout";
import { storyboardOutputShots, validateStoryboardAssets, visualPlacement, type StoryboardAsset, type StoryboardContent, type StoryboardVisual } from "./model";

/** Lane above the talking lane that carries a shot's visuals in the built edit. */
export const STORYBOARD_VISUAL_LANE = "visual_1";

export { FLOAT_LAYOUT };

/** Placement fields for a visual: floating cards rise in and fade out; ordinary clip fields the creator can tune. A motion graphic lays itself out, so it always covers the frame with its own alpha. */
export function visualPlacementFields(visual: StoryboardVisual, asset: StoryboardAsset, frames: number) {
  if (motionSubjectFromSourceUrl(asset.url)?.kind === "composition") return { has_alpha: true };
  const fade = (seconds: number) => Math.min(seconds, Math.floor(frames / 3) / 30);
  if (visualPlacement(visual) === "full") return { animationIn: "fade" as const, animationInDuration: fade(.2), animationOut: "fade" as const, animationOutDuration: fade(.2) };
  return { ...FLOAT_LAYOUT, animationIn: "slide_up" as const, animationInDuration: fade(.45), animationOut: "fade" as const, animationOutDuration: fade(.3) };
}

/** One source-window calculation for the storyboard preview and eventual proposal. */
export function compileStoryboard(board: StoryboardContent, assets: StoryboardAsset[], offset = 0): EditorAgentOperation[] {
  validateStoryboardAssets(board, assets);
  let cursor = Math.ceil(offset * 30);
  return storyboardOutputShots(board).flatMap(shot => {
    const asset = assets.find(a => a.source === shot.source)!;
    const frames = Math.max(1, Math.round(shot.duration * 30));
    const sourceStart = Math.round(shot.start * 30) / 30;
    if (asset.kind === "video" && sourceStart + frames / 30 > (asset.duration ?? 0) + .0001) throw new Error(`Trim ${asset.name} one frame earlier before building`);
    const operation: EditorAgentOperation = { element_id: shot.id, create_visual: {
      type: asset.kind === "image" ? "still" : "video_clip", source_url: asset.url, title: shot.label || asset.name,
      timeline_start: cursor / 30, lane_key: "visual_0", lane_index: 0,
      ...(asset.kind === "video" ? { volume: 1 } : {}),
      ...(shot.groupId ? { beat_label: board.groups.find(g => g.id === shot.groupId)?.name } : {}),
      ...(asset.kind === "image" ? { duration_seconds: frames / 30 } : { source_duration_seconds: asset.duration, source_start_seconds: sourceStart, source_end_seconds: sourceStart + frames / 30 }),
    } };
    const result: EditorAgentOperation[] = [operation];
    // Visuals cover the picture on the lane above while the shot (and its sound) keeps running.
    for (const visual of shot.visuals ?? []) {
      const overlay = assets.find(a => a.source === visual.source)!;
      const at = Math.min(frames - 1, Math.round(visual.at * 30));
      const length = Math.max(1, Math.min(frames - at, Math.round(visual.duration * 30)));
      const inPoint = overlay.kind === "image" ? 0 : Math.round(visual.start * 30) / 30;
      if (overlay.kind === "video" && inPoint + length / 30 > (overlay.duration ?? 0) + .0001) throw new Error(`Trim ${overlay.name} one frame earlier before building`);
      result.push({ element_id: visual.id, create_visual: {
        type: overlay.kind === "image" ? "still" : "video_clip", source_url: overlay.url, title: visual.label || overlay.name,
        timeline_start: (cursor + at) / 30, lane_key: STORYBOARD_VISUAL_LANE, lane_index: 1,
        ...(overlay.kind === "video" ? { volume: 0 } : {}),
        ...visualPlacementFields(visual, overlay, length),
        ...(overlay.kind === "image" ? { duration_seconds: length / 30 } : { source_duration_seconds: overlay.duration, source_start_seconds: inPoint, source_end_seconds: inPoint + length / 30 }),
      } });
    }
    if (board.mode === "reference" && board.reference?.captions && shot.text.trim()) result.push({ element_id: captionId(shot.id), create_text: {
      text: shot.text.trim(), timeline_start: cursor / 30, duration_seconds: frames / 30,
      lane_key: "captions_0", lane_index: 0, positionPreset: "top_center", fontPreset: "inter",
      fontSizePx: 48, styleVariant: "bold_outline", maxWidth: .85, textAlign: "center",
    } });
    cursor += frames;
    return result;
  });
}

function captionId(id: string) {
  const hash = createHash("sha256").update(`storyboard-caption:${id}`).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
