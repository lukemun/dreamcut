import type { CompositionElement } from "@/lib/render/composition-adapters";

export type CutoutVersion = {
  source_url: string;
  preview_source_url: string;
  duration: number;
  offset: number;
  alpha: boolean;
};
export type CutoutEffects = {
  schema_version: 1;
  background: boolean;
  scratchpad: boolean;
  original?: CutoutVersion;
  clean?: CutoutVersion;
};

export function cutoutEffectState(props: Record<string, unknown> | null | undefined) {
  const receipt = props?.custom_cutout_receipt as { scratchpad_treatment?: unknown } | undefined;
  const state = props?.cutout_effects as CutoutEffects | undefined;
  return {
    background: state?.background !== false,
    scratchpad: Boolean(receipt?.scratchpad_treatment) && state?.scratchpad !== false,
    hasScratchpad: Boolean(receipt?.scratchpad_treatment),
  };
}

/** Shared by preview and export. The persisted derivative clock never changes. */
export function resolveCutoutEffects<T extends CompositionElement>(element: T): T {
  const effects = element.props?.cutout_effects as CutoutEffects | undefined;
  if (!effects) return element;
  const state = cutoutEffectState(element.props);
  const version = !state.background ? effects.original : !state.scratchpad && state.hasScratchpad ? effects.clean : null;
  if (!version) {
    if (!state.background || (!state.scratchpad && state.hasScratchpad)) throw new Error("The selected cutout version is unavailable. Restore the applied effect.");
    return element;
  }
  const trimStart = element.trim_start + version.offset;
  const originalDuration = Number(element.props?.source_duration_seconds);
  const trimEnd = version.duration - (originalDuration - (element.trim_end ?? 0) + version.offset);
  if (!Number.isFinite(trimEnd) || trimEnd < -0.04) throw new Error("Cutout version does not cover this source window.");
  const props = { ...element.props };
  const runtime = props.runtime_cutout_effect_preview as { source_url: string; props: Record<string, unknown> } | undefined;
  delete props.runtime_cutout_effect_preview;
  for (const key of Object.keys(props)) {
    if (/^(runtime_preview_|runtime_compound_|compound_preview|preview_proxy_validation|archival_source_url|render_authority_|source_interval$|source_start_seconds$|source_end_seconds$)/.test(key)) delete props[key];
  }
  return { ...element, source_url: version.source_url, trim_start: trimStart, trim_end: Math.max(0, trimEnd), volume: 0,
    props: { ...props, preview_source_url: version.preview_source_url, source_duration_seconds: version.duration,
      has_alpha: version.alpha, sticker_outline: false, volume_envelope: [],
      ...(runtime?.source_url === version.source_url ? runtime.props : {}),
    },
  };
}
