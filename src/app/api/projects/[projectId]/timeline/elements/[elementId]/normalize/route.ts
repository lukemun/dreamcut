import { withEditRequestActor } from "@/lib/local-store/edit-attribution";
import { NextResponse } from "next/server";

import { roleForAudioElement } from "@/lib/timeline/audio-gain";
import {
  ensureLoudnessNormalizedMedia,
  mediaFileSha256,
  resolveLocalMediaSource,
} from "@/lib/local-store/audio-effects";
import { ROLE_LOUDNESS_TARGETS } from "@/lib/qc/standards";
import {
  activeTransitions,
  findElement,
  readTimeline,
  withProjectLock,
  writeTimeline,
} from "@/lib/local-store/store";

type Params = { params: Promise<{ projectId: string; elementId: string }> };

/**
 * Re-level an audio clip to its role's loudness reference by baking a measured
 * two-pass EBU R128 treatment into a timing-identical derivative. The timeline
 * remains at unity so speech stays on the native preview clock and true-peak
 * limiting is identical in review and export.
 */
export const POST = withEditRequestActor(async function POST(_request: Request, { params }: Params) {
  try {
    const { projectId, elementId } = await params;

    return await withProjectLock(projectId, async () => {
      const timeline = readTimeline(projectId);
      const existing = findElement(timeline, elementId);
      if (!existing || existing.removed_at != null) {
        return NextResponse.json({ error: "Timeline element not found" }, { status: 404 });
      }

      if (typeof existing.source_url !== "string") {
        return NextResponse.json({ error: "This clip has no measurable audio source" }, { status: 400 });
      }
      const source = resolveLocalMediaSource(projectId, existing.source_url, {
        allowReferencedProject: true,
      });
      if (!source) {
        return NextResponse.json(
          { error: "Only project-local media can be normalized" },
          { status: 400 },
        );
      }

      const role = roleForAudioElement(existing);
      if (!role) {
        return NextResponse.json(
          { error: "Assign an audio role before normalizing this clip" },
          { status: 400 },
        );
      }
      const targetLufs = ROLE_LOUDNESS_TARGETS[role];
      const processed = ensureLoudnessNormalizedMedia(
        projectId,
        source.absolutePath,
        existing.type === "video_clip",
        targetLufs,
      );
      const originalProps = existing.props ?? {};
      existing.props = {
        ...originalProps,
        loudness_normalization_original_source_url:
          typeof originalProps.loudness_normalization_original_source_url === "string"
            ? originalProps.loudness_normalization_original_source_url
            : existing.source_url,
        loudness_normalization_original_preview_audio_source_url:
          Object.prototype.hasOwnProperty.call(originalProps, "loudness_normalization_original_preview_audio_source_url")
            ? originalProps.loudness_normalization_original_preview_audio_source_url
            : originalProps.preview_audio_source_url ?? null,
        loudness_normalization_original_render_authority_source_url:
          Object.prototype.hasOwnProperty.call(originalProps, "loudness_normalization_original_render_authority_source_url")
            ? originalProps.loudness_normalization_original_render_authority_source_url
            : originalProps.render_authority_source_url ?? existing.source_url,
        source_lufs: Number(processed.outputMeasurement.input_i),
        loudness_normalization: {
          schema_version: 1,
          recipe: processed.recipe,
          role,
          target_lufs: targetLufs,
          target_true_peak_dbtp: processed.target.truePeakDbtp,
          input: processed.measured,
          output: processed.outputMeasurement,
          created_at: new Date().toISOString(),
        },
        ...(existing.type === "video_clip"
          ? {
              preview_audio_source_url: processed.previewAudioSourceUrl,
              preview_audio_baked_gain: 1,
              render_authority_source_url: processed.sourceUrl,
              render_authority_sha256: mediaFileSha256(processed.absolutePath),
            }
          : {}),
      };
      existing.source_url = processed.sourceUrl;
      existing.volume = 1;
      existing.updated_at = new Date().toISOString();

      writeTimeline(projectId, timeline, "element_normalize_loudness_baked");

      return NextResponse.json({ element: existing, transitions: activeTransitions(timeline) });
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to normalize timeline element" },
      { status },
    );
  }
});
