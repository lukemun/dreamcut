import { NextResponse } from "next/server";
import { readStoryboard, storyboardAssets } from "@/lib/local-store/storyboard";
import { readTimeline } from "@/lib/local-store/store";
import { deriveProposalTimeline } from "@/lib/agent/timeline-editor-agent-apply";
import { compileStoryboard } from "@/lib/storyboard/compile";
import { timelinePayload } from "@/lib/local-store/timeline-payload";
import { buildCompositionElements, getCompositionDimensions } from "@/lib/render/composition-adapters";
import { emptyStoryboard } from "@/lib/storyboard/model";
import { randomUUID } from "node:crypto";
import { mediaUrl } from "@/lib/local-store/media";
import { validatePreviewProxy } from "@/lib/local-store/preview-proxy-validation";
import { readPreparation } from "@/lib/local-store/media-preparation";

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params, board = readStoryboard(projectId), assets = storyboardAssets(projectId);
    const query = new URL(_request.url).searchParams;
    const source = query.get("source");
    const start = Number(query.get("start") ?? 0), requestedDuration = query.has("duration") ? Number(query.get("duration")) : undefined;
    if (!Number.isFinite(start) || start < 0 || (requestedDuration !== undefined && (!Number.isFinite(requestedDuration) || requestedDuration < 1 / 30))) throw new Error("Invalid preview range");
    const asset = source ? assets.find(a => a.source === source) : undefined;
    if (source && !asset) throw new Error("Footage unavailable");
    // Source browsing has its own read-only path. It cannot create timeline operations.
    if (asset?.kind === "video" && !asset.ready) {
      const browse = readPreparation(projectId, asset.source)?.browse_preview;
      if (!browse) throw new Error("Preview is still preparing");
      const previewUrl = mediaUrl(projectId, browse.preview);
      const validation = validatePreviewProxy(previewUrl, false);
      if (!validation.ok) throw new Error("Browsing preview needs preparation");
      const sourceStart = Math.round(start * 30) / 30;
      const frames = Math.floor((requestedDuration ?? browse.duration - sourceStart) * 30);
      if (frames < 1 || sourceStart + frames / 30 > browse.duration + .001) throw new Error("Preview range exceeds source");
      return NextResponse.json({ revision: board.revision, dimensions: { width: browse.width, height: browse.height }, durationInFrames: frames,
        elements: [{ id: `source-${asset.assetId}`, type: "video_clip", source_url: asset.url, timeline_start: 0, duration: frames / 30, lane_key: "visual_0", lane_index: 0, volume: 1, playback_rate: 1, trim_start: sourceStart, trim_end: Math.max(0, browse.duration - sourceStart - frames / 30), fade_in: 0, fade_out: 0,
          props: { preview_source_url: previewUrl, preview_proxy_validation: validation, source_duration_seconds: browse.duration,
            ...(browse.audio ? { preview_audio_source_url: mediaUrl(projectId, browse.audio), preview_audio_baked_gain: 1 } : {}) } }] });
    }
    const content = asset ? { ...emptyStoryboard(), sources: [asset.source], shots: [{ id: randomUUID(), source: asset.source, start,
      duration: requestedDuration ?? (asset.kind === "image" ? 3 : Math.floor(((asset.duration ?? 0) - start) * 30) / 30), label: asset.name, note: "", text: "" }] } : board.content;
    const empty = { ...readTimeline(projectId), elements: [], transitions: [] };
    const draft = deriveProposalTimeline(empty, compileStoryboard(content, assets), projectId);
    const payload = timelinePayload(projectId, draft.timeline);
    const probe = asset?.kind === "video" ? readPreparation(projectId, asset.source)?.preview_probe : undefined;
    return NextResponse.json({ revision: board.revision, elements: buildCompositionElements(payload.elements, new Set()),
      dimensions: probe ? { width: probe.width, height: probe.height } : getCompositionDimensions(payload.aspect_ratio),
      durationInFrames: Math.max(1, ...payload.elements.map(e => Math.round((e.timeline_start + e.duration) * 30))) });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Preview unavailable" }, { status: 400 }); }
}
