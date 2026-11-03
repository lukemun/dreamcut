import { previewEditorAgentProposal } from "@/lib/agent/timeline-editor-agent-apply";
import { FILL_LEVELS, pickFittingSize, textFill, UNDERFILLED_BELOW, type FillLevel, type OpenRegion } from "@/lib/media-analysis/open-space";
import { measureCaptions } from "@/lib/qc/measure-captions";
import { resolveCaptionProps } from "@/lib/timeline/captions";

import { readProposal } from "./proposals";
import { readScreenSpace } from "./screen-space";
import { activeElements, readTimeline, type TimelineFile } from "./store";

/**
 * Open space at a moment of the edit: where the speaker is (from a face detected in that frame), what
 * else is on screen, the largest clear regions inside the safe area, and how big a piece of text must
 * be to fill one of them. Read-only: it renders one frame and measures text in a headless browser.
 */
export type OpenSpaceRequest = {
  at_seconds: number;
  /** Read a span instead of one moment: regions free from at_seconds to end_seconds (the thing to place is on screen that long). */
  end_seconds?: number;
  /** Leave these out, e.g. the element being placed again or replaced. */
  exclude_element_ids?: string[];
  proposal_id?: string;
  option_id?: string;
  /** Size this text to fill the best region. */
  text?: string;
  font_preset?: string;
  style_variant?: string;
  text_align?: "left" | "center" | "right";
  /** Or judge an existing caption: its fill now and the size that would fill the space. */
  element_id?: string;
  /** How much of the open region the text takes: medium 70%, large 85% (default), full 95%. */
  fill_level?: FillLevel;
};

const SIZES = [36, 44, 52, 60, 68, 76, 84, 92, 100, 110, 120, 132, 144, 156, 170, 184, 200, 220, 240];

export async function findProjectOpenSpace(projectId: string, request: OpenSpaceRequest) {
  let timeline: TimelineFile = readTimeline(projectId);
  if (request.proposal_id) timeline = previewEditorAgentProposal(readProposal(projectId, request.proposal_id).proposal, request.option_id).timeline;
  const at = request.at_seconds;
  const live = activeElements(timeline).filter(e => at >= e.timeline_start && at < e.timeline_start + e.duration);
  const judged = request.element_id ? live.find(e => e.id === request.element_id && e.type === "caption_text") : undefined;
  if (request.element_id && !judged) throw Object.assign(new Error("element_id must be a caption on screen at at_seconds"), { status: 400 });
  // One shared read of the screen: the same occupancy placement and the spatial checks use.
  const space = await readScreenSpace(projectId, timeline, { start_seconds: at, ...(request.end_seconds != null ? { end_seconds: request.end_seconds } : {}),
    exclude_element_ids: [...(request.exclude_element_ids ?? []), ...(judged ? [judged.id] : [])] });
  const { canvas, safe_area: safe, occupied, limitations } = { ...space, limitations: [...space.limitations] };
  const regions = space.open_regions;
  const best = regions[0];
  const level: FillLevel = request.fill_level ?? "large";
  const text = request.text ?? (judged ? String(judged.props?.text ?? "") : undefined);
  let fit: Record<string, unknown> | null = null;
  if (best && text) {
    const base = { ...(judged?.props ?? {}), text, ...(request.font_preset ? { fontPreset: request.font_preset } : {}), ...(request.style_variant ? { styleVariant: request.style_variant } : {}),
      textAlign: request.text_align ?? judged?.props?.textAlign ?? "left", fontSizing: "fixed", singleLine: false };
    const levels = Object.entries(FILL_LEVELS) as Array<[FillLevel, number]>;
    // One headless-browser pass measures every candidate size at every level with the real font.
    const measured = await measureCaptions(levels.flatMap(([name, share]) => SIZES.map(size => ({ id: `${name}:${size}`, type: "caption_text",
      props: { ...base, fontSizePx: size, maxWidth: best.width * share / canvas.width } }) as never)), canvas);
    const fits: Record<string, unknown> = {};
    for (const [name, share] of levels) {
      const maxWidth = best.width * share / canvas.width;
      const candidates = SIZES.map(size => { const m = measured[`${name}:${size}`]!; return { font_size_px: size, ink_width: m.inkWidth, height: m.height, lines: m.lines }; });
      const chosen = pickFittingSize(best, candidates, share);
      if (!chosen) { fits[name] = null; continue; }
      const boxWidth = maxWidth * canvas.width;
      const x = best.x + (best.width - boxWidth) / 2, y = best.y + (best.height - chosen.height) / 2;
      fits[name] = { font_size_px: chosen.font_size_px, lines: chosen.lines, fill: textFill(best, { width: chosen.ink_width, height: chosen.height }),
        props: { fontSizePx: chosen.font_size_px, maxWidth: round(maxWidth), absX: round(x / canvas.width), absY: round(y / canvas.height), textAlign: base.textAlign, singleLine: false } };
    }
    if (!fits[level]) limitations.push(`At the ${level} level even the smallest size does not fit the open region; shorten the text.`);
    fit = { level, recommended: fits[level], levels: fits, measured_with: "loaded font in a headless browser" };
    if (judged) {
      const now = await measureCaptions([{ id: judged.id, type: "caption_text", props: judged.props ?? {} } as never], canvas);
      const current = textFill(best, { width: now[judged.id]!.inkWidth, height: now[judged.id]!.height });
      fit.current = { font_size_px: resolveCaptionProps(judged.props ?? {}).fontSizePx, fill: current,
        verdict: current.width_fill > 1 || current.height_fill > 1 ? "spills out of the open space"
          : current.width_fill < UNDERFILLED_BELOW && current.height_fill < UNDERFILLED_BELOW ? "too small for the open space" : "fills the open space" };
    }
  }
  return { at_seconds: at, ...(request.end_seconds != null ? { end_seconds: request.end_seconds } : {}), canvas, safe_area: safe, occupied, open_regions: regions, moments: space.moments, ...(best ? { best_region: best } : {}),
    ...(fit ? { fit } : {}), limitations };
}

const round = (value: number) => Math.round(value * 10000) / 10000;
export type { OpenRegion };

