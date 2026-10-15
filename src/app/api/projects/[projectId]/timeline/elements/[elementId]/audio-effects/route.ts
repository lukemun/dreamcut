import { withEditRequestActor } from "@/lib/local-store/edit-attribution";
import { NextResponse } from "next/server";
import { z } from "zod";

import type { TimelineElement } from "@/components/studio/timeline/types";
import {
  ensureDetachedAudio,
  ensureNoiseReducedMedia,
  ensureVoiceEnhancedMedia,
  mediaFileSha256,
  resolveLocalMediaSource,
} from "@/lib/local-store/audio-effects";
import type { AudioEffectAction } from "@/lib/timeline/audio-effects";
import {
  activeElements,
  activeTransitions,
  findElement,
  newId,
  newRowTimestamps,
  readTimeline,
  withProjectLock,
  writeTimeline,
} from "@/lib/local-store/store";

type Params = { params: Promise<{ projectId: string; elementId: string }> };

const requestSchema = z.object({
  action: z.enum([
    "enhance_voice",
    "toggle_voice_enhancement",
    "reduce_background_noise",
    "restore_original",
    "detach_audio",
    "reattach_audio",
  ]),
  strength: z.number().int().min(0).max(100).optional(),
}).strict();

const AUDIO_TYPES = new Set(["video_clip", "vo_segment", "vo_full", "music", "sound_effect"]);

function sharedVoiceEffectMembers(timeline: ReturnType<typeof readTimeline>, selected: TimelineElement) {
  if (selected.type !== "video_clip") return [selected];
  const compoundId = selected.props?.compound_clip_id;
  const roughCutSourceId = selected.props?.rough_cut_source_id;
  if (typeof compoundId !== "string" && typeof roughCutSourceId !== "string") return [selected];
  return timeline.elements.filter((candidate) => {
    if (candidate.removed_at != null || candidate.type !== "video_clip") return false;
    if (typeof compoundId === "string") return candidate.props?.compound_clip_id === compoundId;
    return candidate.id === roughCutSourceId || candidate.props?.rough_cut_source_id === roughCutSourceId;
  });
}

function cleanedProps(element: TimelineElement) {
  const props = { ...(element.props ?? {}) };
  delete props.source_lufs;
  return props;
}

function removeKeys(source: Record<string, unknown>, keys: string[]) {
  const next = { ...source };
  for (const key of keys) delete next[key];
  return next;
}

const AUDIO_TREATMENT_KEYS = [
  "audio_cleanup",
  "audio_cleanup_original_source_url",
  "audio_cleanup_original_preview_audio_source_url",
  "audio_cleanup_original_render_authority_source_url",
  "loudness_normalization",
  "loudness_normalization_original_source_url",
  "loudness_normalization_original_preview_audio_source_url",
  "loudness_normalization_original_render_authority_source_url",
  "voice_enhancement",
  "voice_enhancement_original_source_url",
  "voice_enhancement_original_preview_audio_source_url",
  "voice_enhancement_original_render_authority_source_url",
  "render_authority_sha256",
  "source_lufs",
];

function firstString(props: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (typeof props[key] === "string") return props[key] as string;
  }
  return null;
}

export const POST = withEditRequestActor(async function POST(request: Request, { params }: Params) {
  try {
    const { projectId, elementId } = await params;
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid audio effect request" }, { status: 400 });
    }
    const action: AudioEffectAction = parsed.data.action;

    return await withProjectLock(projectId, async () => {
      const timeline = readTimeline(projectId);
      const selected = findElement(timeline, elementId);
      if (!selected || selected.removed_at != null) {
        return NextResponse.json({ error: "Timeline element not found" }, { status: 404 });
      }
      if (!AUDIO_TYPES.has(selected.type)) {
        return NextResponse.json({ error: "This element has no editable audio" }, { status: 400 });
      }

      if (action === "enhance_voice") {
        const currentProps = selected.props ?? {};
        const originalSourceUrl = firstString(currentProps, [
          "voice_enhancement_original_source_url",
          "audio_cleanup_original_source_url",
          "loudness_normalization_original_source_url",
        ]) ?? selected.source_url;
        if (typeof originalSourceUrl !== "string") {
          return NextResponse.json({ error: "This element has no audio source" }, { status: 400 });
        }
        const originalSource = resolveLocalMediaSource(projectId, originalSourceUrl, {
          allowReferencedProject: true,
        });
        if (!originalSource) {
          return NextResponse.json({ error: "Only project-local media can be enhanced" }, { status: 400 });
        }
        const originalPreviewAudio = firstString(currentProps, [
          "voice_enhancement_original_preview_audio_source_url",
          "audio_cleanup_original_preview_audio_source_url",
          "loudness_normalization_original_preview_audio_source_url",
        ]) ?? currentProps.preview_audio_source_url ?? originalSourceUrl;
        const originalRenderAuthority = firstString(currentProps, [
          "voice_enhancement_original_render_authority_source_url",
          "audio_cleanup_original_render_authority_source_url",
          "loudness_normalization_original_render_authority_source_url",
        ]) ?? currentProps.render_authority_source_url ?? originalSourceUrl;
        const processed = ensureVoiceEnhancedMedia(
          projectId,
          originalSource.absolutePath,
          selected.type === "video_clip",
          parsed.data.strength,
        );
        const createdAt = new Date().toISOString();
        for (const member of sharedVoiceEffectMembers(timeline, selected)) {
          const memberProps = member.props ?? {};
          const memberOriginalSourceUrl = firstString(memberProps, [
            "voice_enhancement_original_source_url",
            "audio_cleanup_original_source_url",
            "loudness_normalization_original_source_url",
          ]) ?? originalSourceUrl;
          const memberOriginalPreviewAudio = firstString(memberProps, [
            "voice_enhancement_original_preview_audio_source_url",
            "audio_cleanup_original_preview_audio_source_url",
            "loudness_normalization_original_preview_audio_source_url",
          ]) ?? memberProps.preview_audio_source_url ?? memberOriginalSourceUrl;
          const memberOriginalRenderAuthority = firstString(memberProps, [
            "voice_enhancement_original_render_authority_source_url",
            "audio_cleanup_original_render_authority_source_url",
            "loudness_normalization_original_render_authority_source_url",
          ]) ?? memberProps.render_authority_source_url ?? memberOriginalSourceUrl;
          member.props = {
            ...removeKeys(memberProps, AUDIO_TREATMENT_KEYS),
            voice_enhancement_original_source_url: memberOriginalSourceUrl,
            voice_enhancement_original_preview_audio_source_url: memberOriginalPreviewAudio,
            voice_enhancement_original_render_authority_source_url: memberOriginalRenderAuthority,
            source_lufs: Number(processed.outputMeasurement.input_i),
            voice_enhancement: {
              schema_version: 1,
              enabled: true,
              strength_percent: processed.strength,
              attenuation_limit_db: processed.attenuationLimitDb,
              recipe: processed.recipe,
              model: processed.model,
              input: {
                integrated_lufs: Number(processed.inputMeasurement.input_i),
                true_peak_dbtp: Number(processed.inputMeasurement.input_tp),
                noise_rms_dbfs: processed.inputNoiseRmsDbfs,
              },
              output: {
                integrated_lufs: Number(processed.outputMeasurement.input_i),
                true_peak_dbtp: Number(processed.outputMeasurement.input_tp),
                noise_rms_dbfs: processed.outputNoiseRmsDbfs,
              },
              noise_profile: processed.profile,
              original_source_url: memberOriginalSourceUrl,
              processed_source_url: processed.sourceUrl,
              processed_preview_audio_source_url: processed.previewAudioSourceUrl,
              created_at: createdAt,
            },
            ...(member.type === "video_clip"
              ? {
                  preview_audio_source_url: processed.previewAudioSourceUrl,
                  preview_audio_baked_gain: 1,
                  render_authority_source_url: processed.sourceUrl,
                  render_authority_sha256: mediaFileSha256(processed.absolutePath),
                }
              : {}),
          };
          member.source_url = processed.sourceUrl;
          member.volume = 1;
          member.updated_at = createdAt;
        }
        writeTimeline(projectId, timeline, "element_enhance_voice");
      } else if (action === "toggle_voice_enhancement") {
        const props = selected.props ?? {};
        const enhancement = props.voice_enhancement;
        if (!enhancement || typeof enhancement !== "object") {
          return NextResponse.json({ error: "Enhance voice before comparing it" }, { status: 409 });
        }
        const receipt = enhancement as Record<string, unknown>;
        const currentlyEnabled = receipt.enabled !== false;
        const nextEnabled = !currentlyEnabled;
        const targetSource = nextEnabled
          ? receipt.processed_source_url
          : props.voice_enhancement_original_source_url;
        if (typeof targetSource !== "string") {
          return NextResponse.json({ error: "Voice comparison source is unavailable" }, { status: 409 });
        }
        const target = resolveLocalMediaSource(projectId, targetSource, {
          allowReferencedProject: true,
        });
        if (!target) {
          return NextResponse.json({ error: "Voice comparison media is unavailable" }, { status: 409 });
        }
        const updatedAt = new Date().toISOString();
        for (const member of sharedVoiceEffectMembers(timeline, selected)) {
          const memberProps = member.props ?? {};
          const memberEnhancement = memberProps.voice_enhancement;
          if (!memberEnhancement || typeof memberEnhancement !== "object") continue;
          const memberReceipt = memberEnhancement as Record<string, unknown>;
          const memberTargetSource = nextEnabled
            ? memberReceipt.processed_source_url
            : memberProps.voice_enhancement_original_source_url;
          if (typeof memberTargetSource !== "string") continue;
          const memberTarget = resolveLocalMediaSource(projectId, memberTargetSource, {
            allowReferencedProject: true,
          });
          if (!memberTarget) continue;
          member.source_url = memberTargetSource;
          member.props = {
            ...memberProps,
            voice_enhancement: { ...memberReceipt, enabled: nextEnabled },
            source_lufs: nextEnabled
              ? (memberReceipt.output as Record<string, unknown> | undefined)?.integrated_lufs
              : (memberReceipt.input as Record<string, unknown> | undefined)?.integrated_lufs,
            preview_audio_source_url: nextEnabled
              ? (typeof memberReceipt.processed_preview_audio_source_url === "string"
                  ? memberReceipt.processed_preview_audio_source_url
                  : memberTargetSource)
              : memberProps.voice_enhancement_original_preview_audio_source_url,
            preview_audio_baked_gain: 1,
            render_authority_source_url: nextEnabled
              ? memberTargetSource
              : memberProps.voice_enhancement_original_render_authority_source_url,
            render_authority_sha256: mediaFileSha256(memberTarget.absolutePath),
          };
          member.volume = 1;
          member.updated_at = updatedAt;
        }
        writeTimeline(
          projectId,
          timeline,
          nextEnabled ? "element_use_voice_enhancement" : "element_compare_original_voice",
        );
      } else if (action === "reduce_background_noise") {
        if (typeof selected.source_url !== "string") {
          return NextResponse.json({ error: "This element has no audio source" }, { status: 400 });
        }
        if (selected.props?.audio_cleanup_original_source_url) {
          return NextResponse.json({ error: "Background-noise reduction is already applied" }, { status: 409 });
        }
        const source = resolveLocalMediaSource(projectId, selected.source_url, {
          allowReferencedProject: true,
        });
        if (!source) {
          return NextResponse.json({ error: "Only project-local media can be cleaned" }, { status: 400 });
        }
        const processed = ensureNoiseReducedMedia(
          projectId,
          source.absolutePath,
          selected.type === "video_clip",
        );
        const originalProps = selected.props ?? {};
        selected.props = {
          ...cleanedProps(selected),
          audio_cleanup_original_source_url: selected.source_url,
          audio_cleanup_original_preview_audio_source_url:
            typeof originalProps.preview_audio_source_url === "string"
              ? originalProps.preview_audio_source_url
              : null,
          audio_cleanup_original_render_authority_source_url:
            typeof originalProps.render_authority_source_url === "string"
              ? originalProps.render_authority_source_url
              : selected.source_url,
          audio_cleanup: {
            schema_version: 1,
            kind: "background_noise_reduction",
            recipe: processed.recipe,
            noise_profile: processed.profile,
            created_at: new Date().toISOString(),
            original_source_url: selected.source_url,
            processed_source_url: processed.sourceUrl,
          },
          ...(selected.type === "video_clip"
            ? {
                preview_audio_source_url: processed.previewAudioSourceUrl,
                preview_audio_baked_gain: 1,
                render_authority_source_url: processed.sourceUrl,
                render_authority_sha256: mediaFileSha256(processed.absolutePath),
              }
            : {}),
        };
        selected.source_url = processed.sourceUrl;
        selected.updated_at = new Date().toISOString();
        writeTimeline(projectId, timeline, "element_reduce_background_noise");
      } else if (action === "restore_original") {
        const props = selected.props ?? {};
        const originalSource = firstString(props, [
          "voice_enhancement_original_source_url",
          "audio_cleanup_original_source_url",
          "loudness_normalization_original_source_url",
        ]);
        if (typeof originalSource !== "string") {
          return NextResponse.json({ error: "This element has no audio treatment to restore" }, { status: 409 });
        }
        const members = props.voice_enhancement
          ? sharedVoiceEffectMembers(timeline, selected)
          : [selected];
        const updatedAt = new Date().toISOString();
        for (const member of members) {
          const memberProps = member.props ?? {};
          const memberOriginalSource = firstString(memberProps, [
            "voice_enhancement_original_source_url",
            "audio_cleanup_original_source_url",
            "loudness_normalization_original_source_url",
          ]);
          if (typeof memberOriginalSource !== "string") continue;
          member.source_url = memberOriginalSource;
          const restored = removeKeys(memberProps, AUDIO_TREATMENT_KEYS);
          const originalPreviewAudio = firstString(memberProps, [
            "voice_enhancement_original_preview_audio_source_url",
            "audio_cleanup_original_preview_audio_source_url",
            "loudness_normalization_original_preview_audio_source_url",
          ]);
          const originalRenderAuthority = firstString(memberProps, [
            "voice_enhancement_original_render_authority_source_url",
            "audio_cleanup_original_render_authority_source_url",
            "loudness_normalization_original_render_authority_source_url",
          ]);
          if (typeof originalPreviewAudio === "string") restored.preview_audio_source_url = originalPreviewAudio;
          else delete restored.preview_audio_source_url;
          if (typeof originalRenderAuthority === "string") restored.render_authority_source_url = originalRenderAuthority;
          else delete restored.render_authority_source_url;
          member.props = restored;
          member.updated_at = updatedAt;
        }
        writeTimeline(projectId, timeline, "element_restore_original_audio");
      } else if (action === "detach_audio") {
        if (selected.type !== "video_clip") {
          return NextResponse.json({ error: "Only video clips have embedded audio to detach" }, { status: 400 });
        }
        if (selected.props?.detached_audio_element_id) {
          return NextResponse.json({ error: "This video's audio is already detached" }, { status: 409 });
        }
        if (typeof selected.source_url !== "string") {
          return NextResponse.json({ error: "This video has no audio source" }, { status: 400 });
        }
        const source = resolveLocalMediaSource(projectId, selected.source_url, {
          allowReferencedProject: true,
        });
        if (!source) {
          return NextResponse.json({ error: "Only project-local video audio can be detached" }, { status: 400 });
        }
        const extracted = ensureDetachedAudio(projectId, source.absolutePath);
        const audioId = newId();
        const originalVolume = selected.volume;
        const originalVolumeEnvelope = Array.isArray(selected.props?.volume_envelope)
          ? selected.props.volume_envelope
          : null;
        const audioProps = removeKeys({ ...(selected.props ?? {}) }, [
          "preview_source_url",
          "preview_audio_source_url",
          "preview_audio_baked_gain",
          "render_authority_source_url",
          "render_authority_sha256",
          "preview_proxy_sha256",
          "source_sha256",
          "preview_sha256",
          "detached_audio_element_id",
        ]);
        const audioElement: TimelineElement = {
          ...selected,
          id: audioId,
          type: "vo_segment",
          source_url: extracted.sourceUrl,
          lane_key: "audio_narrator",
          lane_index: 0,
          volume: originalVolume,
          props: {
            ...audioProps,
            detached_from_video_element_id: selected.id,
            detached_audio_recipe: extracted.recipe,
            source_video_url: selected.source_url,
          },
          position_locked: false,
          removed_at: null,
          removed_reason: null,
          ...newRowTimestamps(),
        };
        selected.volume = 0;
        selected.props = {
          ...(selected.props ?? {}),
          detached_audio_element_id: audioId,
          detached_audio_original_volume: originalVolume,
          detached_audio_original_volume_envelope: originalVolumeEnvelope,
          volume_envelope: [
            { time_seconds: 0, volume: 0 },
            { time_seconds: selected.duration, volume: 0 },
          ],
        };
        selected.updated_at = new Date().toISOString();
        timeline.elements.push(audioElement);
        writeTimeline(projectId, timeline, "element_detach_audio");
      } else {
        const video = selected.type === "video_clip"
          ? selected
          : typeof selected.props?.detached_from_video_element_id === "string"
            ? findElement(timeline, selected.props.detached_from_video_element_id)
            : undefined;
        const audioId = video?.props?.detached_audio_element_id;
        const audio = typeof audioId === "string" ? findElement(timeline, audioId) : undefined;
        if (!video || video.removed_at != null || !audio || audio.removed_at != null) {
          return NextResponse.json({ error: "Detached audio pair not found" }, { status: 409 });
        }
        const originalVolume = video.props?.detached_audio_original_volume;
        video.volume = typeof originalVolume === "number" ? originalVolume : audio.volume;
        const originalVolumeEnvelope = video.props?.detached_audio_original_volume_envelope;
        const restoredVideoProps = removeKeys(video.props ?? {}, [
          "detached_audio_element_id",
          "detached_audio_original_volume",
          "detached_audio_original_volume_envelope",
        ]);
        if (Array.isArray(originalVolumeEnvelope)) {
          restoredVideoProps.volume_envelope = originalVolumeEnvelope;
        } else {
          delete restoredVideoProps.volume_envelope;
        }
        video.props = restoredVideoProps;
        video.updated_at = new Date().toISOString();
        audio.removed_at = new Date().toISOString();
        audio.removed_reason = "reattached_to_video";
        audio.updated_at = audio.removed_at;
        writeTimeline(projectId, timeline, "element_reattach_audio");
      }

      return NextResponse.json({
        elements: activeElements(timeline),
        transitions: activeTransitions(timeline),
      });
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Audio effect failed" },
      { status },
    );
  }
});
