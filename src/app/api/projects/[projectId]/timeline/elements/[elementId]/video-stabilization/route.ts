import { withEditRequestActor } from "@/lib/local-store/edit-attribution";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  mediaFileSha256,
  resolveLocalMediaSource,
} from "@/lib/local-store/audio-effects";
import { ensureStabilizedMedia } from "@/lib/local-store/video-stabilization";
import {
  activeElements,
  activeTransitions,
  findElement,
  readTimeline,
  withProjectLock,
  writeTimeline,
} from "@/lib/local-store/store";

type Params = { params: Promise<{ projectId: string; elementId: string }> };

const requestSchema = z.object({
  action: z.enum(["apply", "toggle_comparison", "remove"]),
  mode: z.enum(["smooth_motion", "lock_camera"]).optional(),
  strength: z.number().int().min(0).max(100).optional(),
}).strict();

const ORIGINAL_KEYS = [
  "video_stabilization_original_source_url",
  "video_stabilization_original_preview_source_url",
  "video_stabilization_original_preview_audio_source_url",
  "video_stabilization_original_render_authority_source_url",
] as const;

function removeKeys(source: Record<string, unknown>, keys: readonly string[]) {
  const next = { ...source };
  for (const key of keys) delete next[key];
  return next;
}

export const POST = withEditRequestActor(async function POST(request: Request, { params }: Params) {
  try {
    const { projectId, elementId } = await params;
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid stabilization request" }, { status: 400 });
    }

    return await withProjectLock(projectId, async () => {
      const timeline = readTimeline(projectId);
      const selected = findElement(timeline, elementId);
      if (!selected || selected.removed_at != null) {
        return NextResponse.json({ error: "Timeline element not found" }, { status: 404 });
      }
      if (selected.type !== "video_clip") {
        return NextResponse.json({ error: "Only video clips can be stabilized" }, { status: 400 });
      }
      const props = selected.props ?? {};
      const receipt = props.video_stabilization;
      const currentReceipt = receipt && typeof receipt === "object"
        ? receipt as Record<string, unknown>
        : null;

      if (parsed.data.action === "apply") {
        const originalSourceUrl =
          typeof props.video_stabilization_original_source_url === "string"
            ? props.video_stabilization_original_source_url
            : selected.source_url;
        if (typeof originalSourceUrl !== "string") {
          return NextResponse.json({ error: "This clip has no video source" }, { status: 400 });
        }
        const source = resolveLocalMediaSource(projectId, originalSourceUrl, {
          allowReferencedProject: true,
        });
        if (!source) {
          return NextResponse.json({ error: "Only project-local video can be stabilized" }, { status: 400 });
        }
        const mode = parsed.data.mode ?? "smooth_motion";
        const processed = ensureStabilizedMedia(projectId, source.absolutePath, {
          mode,
          strength: parsed.data.strength,
        });
        const originalPreview =
          typeof props.video_stabilization_original_preview_source_url === "string"
            ? props.video_stabilization_original_preview_source_url
            : props.preview_source_url ?? originalSourceUrl;
        const originalPreviewAudio =
          typeof props.video_stabilization_original_preview_audio_source_url === "string"
            ? props.video_stabilization_original_preview_audio_source_url
            : props.preview_audio_source_url ?? originalSourceUrl;
        const originalRender =
          typeof props.video_stabilization_original_render_authority_source_url === "string"
            ? props.video_stabilization_original_render_authority_source_url
            : props.render_authority_source_url ?? originalSourceUrl;
        selected.source_url = processed.renderSourceUrl;
        selected.props = {
          ...props,
          video_stabilization_original_source_url: originalSourceUrl,
          video_stabilization_original_preview_source_url: originalPreview,
          video_stabilization_original_preview_audio_source_url: originalPreviewAudio,
          video_stabilization_original_render_authority_source_url: originalRender,
          video_stabilization: {
            schema_version: processed.schemaVersion,
            enabled: true,
            mode: processed.mode,
            strength_percent: processed.strengthPercent,
            shakiness: processed.shakiness,
            smoothing_frames: processed.smoothingFrames,
            auto_zoom: processed.autoZoom,
            recipe: processed.recipe,
            processed_source_url: processed.renderSourceUrl,
            processed_preview_source_url: processed.previewSourceUrl,
            created_at: new Date().toISOString(),
          },
          preview_source_url: processed.previewSourceUrl,
          preview_audio_source_url: processed.previewSourceUrl,
          preview_audio_baked_gain: 1,
          render_authority_source_url: processed.renderSourceUrl,
          render_authority_sha256: mediaFileSha256(processed.renderPath),
        };
        selected.updated_at = new Date().toISOString();
        writeTimeline(projectId, timeline, "element_apply_video_stabilization");
      } else if (parsed.data.action === "toggle_comparison") {
        if (!currentReceipt) {
          return NextResponse.json({ error: "Stabilize the clip before comparing it" }, { status: 409 });
        }
        const enabled = currentReceipt.enabled !== false;
        const nextEnabled = !enabled;
        const targetSource = nextEnabled
          ? currentReceipt.processed_source_url
          : props.video_stabilization_original_source_url;
        const targetPreview = nextEnabled
          ? currentReceipt.processed_preview_source_url
          : props.video_stabilization_original_preview_source_url;
        const targetRender = nextEnabled
          ? currentReceipt.processed_source_url
          : props.video_stabilization_original_render_authority_source_url;
        if (typeof targetSource !== "string" || typeof targetRender !== "string") {
          return NextResponse.json({ error: "Comparison media is unavailable" }, { status: 409 });
        }
        const target = resolveLocalMediaSource(projectId, targetRender, {
          allowReferencedProject: true,
        });
        if (!target) {
          return NextResponse.json({ error: "Comparison media is unavailable" }, { status: 409 });
        }
        selected.source_url = targetSource;
        selected.props = {
          ...props,
          video_stabilization: { ...currentReceipt, enabled: nextEnabled },
          preview_source_url: typeof targetPreview === "string" ? targetPreview : targetSource,
          preview_audio_source_url: nextEnabled
            ? targetPreview
            : props.video_stabilization_original_preview_audio_source_url,
          preview_audio_baked_gain: 1,
          render_authority_source_url: targetRender,
          render_authority_sha256: mediaFileSha256(target.absolutePath),
        };
        selected.updated_at = new Date().toISOString();
        writeTimeline(projectId, timeline, nextEnabled
          ? "element_use_video_stabilization"
          : "element_compare_original_video");
      } else {
        if (!currentReceipt) {
          return NextResponse.json({ error: "This clip has no stabilization to remove" }, { status: 409 });
        }
        const originalSource = props.video_stabilization_original_source_url;
        if (typeof originalSource !== "string") {
          return NextResponse.json({ error: "Original video is unavailable" }, { status: 409 });
        }
        selected.source_url = originalSource;
        const restored = removeKeys(props, [...ORIGINAL_KEYS, "video_stabilization"]);
        const originalPreview = props.video_stabilization_original_preview_source_url;
        const originalPreviewAudio = props.video_stabilization_original_preview_audio_source_url;
        const originalRender = props.video_stabilization_original_render_authority_source_url;
        if (typeof originalPreview === "string") restored.preview_source_url = originalPreview;
        else delete restored.preview_source_url;
        if (typeof originalPreviewAudio === "string") restored.preview_audio_source_url = originalPreviewAudio;
        else delete restored.preview_audio_source_url;
        if (typeof originalRender === "string") {
          restored.render_authority_source_url = originalRender;
          const target = resolveLocalMediaSource(projectId, originalRender, {
            allowReferencedProject: true,
          });
          if (target) restored.render_authority_sha256 = mediaFileSha256(target.absolutePath);
        } else {
          delete restored.render_authority_source_url;
          delete restored.render_authority_sha256;
        }
        selected.props = restored;
        selected.updated_at = new Date().toISOString();
        writeTimeline(projectId, timeline, "element_remove_video_stabilization");
      }

      return NextResponse.json({
        elements: activeElements(timeline),
        transitions: activeTransitions(timeline),
      });
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Video stabilization failed" },
      { status: 500 },
    );
  }
});
