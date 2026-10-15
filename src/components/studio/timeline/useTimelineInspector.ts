"use client";
import { currentFrameRate } from "@/lib/timeline/frame-rate-scope";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import { useDebouncedCallback } from "@/lib/use-debounced-callback";
import {
  isVisualElementType,
  minTimelineDurationSeconds,
} from "@/lib/timeline/frame-quantization";
import {
  getSourceDurationSeconds,
  supportsOverflowHold,
} from "@/lib/timeline/media";
import { writeVideoClipTimingMetadata } from "@/lib/timeline/video-clip-metadata";
import {
  insertEnvelopePoint,
  interpolateEnvelopeVolume,
  MAX_VOLUME,
  moveEnvelopePoint,
  readVolumeEnvelopePoints,
  retargetVolumeEnvelope,
  writeVolumeEnvelopePatch,
} from "@/lib/timeline/volume-envelope";
import {
  clearPreviewAudioGain,
  setPreviewAudioGain,
} from "@/lib/remotion/preview-audio-gain-store";
import {
  captionPresetBaseXY,
  captionPresetTextAlign,
  clampCaptionAbsPosition,
  resolveCaptionProps,
  type CaptionFontPreset,
  type CaptionPositionPreset,
  type CaptionStyleVariant,
} from "@/lib/timeline/captions";
import { captionTextEditPatch } from "@/lib/timeline/active-word-captions";
import {
  resolveAnimationProps,
  isAudioElementType,
  type AnimationPreset,
} from "@/lib/timeline/animation-presets";
import {
  clearMediaKeyframes,
  clampMediaOpacity,
  clampMediaOffset,
  clampMaskFeather,
  clampMaskInset,
  clampMediaScale,
  commitMaskInsetAtTime,
  commitMediaEffectFieldAtTime,
  commitMediaTransformFieldAtTime,
  maskInsetFromMirrorBand,
  mirrorBandFromMaskInset,
  MEDIA_MASK_KEYFRAME_FIELDS,
  MEDIA_OPACITY_KEYFRAME_FIELDS,
  MEDIA_TRANSFORM_KEYFRAME_FIELDS,
  readMediaEffectProps,
  readMaskInsetProps,
  readMediaTransformProps,
  resolveMediaEffectAtTime,
  resolveMaskInsetAtTime,
  resolveMediaTransformAtTime,
  upsertMaskInsetKeyframe,
  upsertMediaTransformKeyframes,
  type MediaTransformKeyframeField,
} from "@/lib/timeline/media-transform";
import {
  hasKeyframeAtTime,
  removeKeyframesAtTime,
  upsertKeyframe,
} from "@/lib/timeline/keyframes";
import {
  applyMediaMotionPreset,
  identifyMediaMotionPreset,
  type MediaMotionPreset,
} from "@/lib/timeline/motion-presets";
import {
  clearColorGradeKeyframes as clearColorGradeKeyframesFromProps,
  colorGradeDisplayToField,
  COLOR_GRADE_FIELD_CONFIG,
  colorGradeFieldToDisplay,
  COLOR_GRADE_FIELDS,
  COLOR_GRADE_ADVANCED_FIELDS,
  commitAdvancedColorGradeFieldAtTime,
  commitColorGradeFieldAtTime,
  IDENTITY_COLOR_GRADE,
  removeColorGradeKeyframeAtTime,
  resetColorGrade,
  resolveColorGradeAtTime,
  upsertColorGradeKeyframe,
  upsertAdvancedColorGradeKeyframe,
  type AdvancedColorGradeField,
  type ColorGrade,
  type ColorGradeField,
} from "@/lib/timeline/color-grade";
import {
  commitColorGradeLutIntensityAtTime,
  readColorGradeLutProps,
  resetColorGradeLutProps,
  resolveColorGradeLutAtTime,
  writeColorGradeLutProps,
} from "@/lib/timeline/cube-lut";
import {
  CHROMA_KEY_AMOUNT_CONFIG,
  CHROMA_KEY_AMOUNT_FIELDS,
  CHROMA_KEY_COLOR_FIELD,
  commitChromaKeyAmountAtTime,
  commitChromaKeyColor,
  hasChromaKeyKeyframeAtTime,
  removeChromaKeyKeyframeAtTime,
  resetChromaKey,
  resolveChromaKeyAtTime,
  upsertChromaKeyKeyframe,
  type ChromaKey,
  type ChromaKeyAmountField,
  type ChromaKeyField,
} from "@/lib/timeline/chroma-key";
import { compoundClipMemberAtTime, compoundClipMembers } from "@/lib/timeline/compound-clips";

import type { TimelineElement } from "./types";

type Args = {
  selectedElement: TimelineElement | null;
  selectedElements: TimelineElement[];
  setSelectedId: (elementId: string | null) => void;
  patchElement: (elementId: string, patch: Record<string, unknown>) => void | Promise<unknown>;
  patchElements: (patches: Array<{ elementId: string; patch: Record<string, unknown> }>) => void | Promise<unknown>;
  moveElement: (elementId: string, next: { timelineStart?: number; laneKey?: string }) => void;
  resizeElement: (elementId: string, next: { timelineStart?: number; duration?: number }) => void;
  splitCaptionElement: (elementId: string, splitAt: number) => Promise<string | null>;
  playheadSec: number;
  getPlayheadSec?: () => number;
  elements: TimelineElement[];
  onWarning?: (message: string) => void;
};

type ColorGradeDraftField =
  | "editGradeExposure"
  | "editGradeContrast"
  | "editGradeHighlights"
  | "editGradeShadows"
  | "editGradeWhites"
  | "editGradeBlacks"
  | "editGradeSaturation"
  | "editGradeTemperature"
  | "editGradeTint"
  | "editGradeHue";

const COLOR_GRADE_DRAFT_FIELD: Record<ColorGradeField, ColorGradeDraftField> = {
  grade_exposure_ev: "editGradeExposure",
  grade_contrast: "editGradeContrast",
  grade_highlights: "editGradeHighlights",
  grade_shadows: "editGradeShadows",
  grade_whites: "editGradeWhites",
  grade_blacks: "editGradeBlacks",
  grade_saturation: "editGradeSaturation",
  grade_temperature: "editGradeTemperature",
  grade_tint: "editGradeTint",
  grade_hue_degrees: "editGradeHue",
};

function colorGradeDraft(grade: ColorGrade) {
  return {
    editGradeExposure: colorGradeFieldToDisplay("grade_exposure_ev", grade).toFixed(2),
    editGradeContrast: colorGradeFieldToDisplay("grade_contrast", grade).toFixed(1),
    editGradeHighlights: colorGradeFieldToDisplay("grade_highlights", grade).toFixed(1),
    editGradeShadows: colorGradeFieldToDisplay("grade_shadows", grade).toFixed(1),
    editGradeWhites: colorGradeFieldToDisplay("grade_whites", grade).toFixed(1),
    editGradeBlacks: colorGradeFieldToDisplay("grade_blacks", grade).toFixed(1),
    editGradeSaturation: colorGradeFieldToDisplay("grade_saturation", grade).toFixed(1),
    editGradeTemperature: colorGradeFieldToDisplay("grade_temperature", grade).toFixed(1),
    editGradeTint: colorGradeFieldToDisplay("grade_tint", grade).toFixed(1),
    editGradeHue: colorGradeFieldToDisplay("grade_hue_degrees", grade).toFixed(1),
  };
}

type ChromaKeyDraftField =
  | "editChromaKeyTolerance"
  | "editChromaKeySoftness"
  | "editChromaKeySpill";

const CHROMA_KEY_DRAFT_FIELD: Record<ChromaKeyAmountField, ChromaKeyDraftField> = {
  chroma_key_tolerance: "editChromaKeyTolerance",
  chroma_key_softness: "editChromaKeySoftness",
  chroma_key_spill: "editChromaKeySpill",
};

/** Amounts are stored 0–1 and edited as percentages, matching opacity and feather. */
function chromaKeyDraft(chroma: ChromaKey | null) {
  return {
    editChromaKeyColor: chroma?.color ?? "",
    editChromaKeyTolerance: String(Math.round((chroma?.tolerance ?? CHROMA_KEY_AMOUNT_CONFIG.chroma_key_tolerance.identity) * 100)),
    editChromaKeySoftness: String(Math.round((chroma?.softness ?? CHROMA_KEY_AMOUNT_CONFIG.chroma_key_softness.identity) * 100)),
    editChromaKeySpill: String(Math.round((chroma?.spill ?? CHROMA_KEY_AMOUNT_CONFIG.chroma_key_spill.identity) * 100)),
  };
}

function buildSourceBackedTrimDurationPatch(
  element: TimelineElement,
  nextTrimStart: number,
  nextTrimEnd: number | null,
) {
  const sourceDurationSeconds = getSourceDurationSeconds(element);
  if (sourceDurationSeconds == null) return null;

  const playbackRate = Math.max(0.001, element.playback_rate || 1);
  const playableSourceDuration = Math.max(0, sourceDurationSeconds - nextTrimStart - (nextTrimEnd ?? 0));
  const duration = Math.max(
    minTimelineDurationSeconds(),
    Number((playableSourceDuration / playbackRate).toFixed(3)),
  );

  return {
    sourceDurationSeconds,
    duration,
  };
}

const CAPTION_GROUP_STYLE_FIELDS = new Set(["fontPreset", "textColor", "activeWordColor", "styleVariant", "textAlign", "maxWidth"]);

/** Merge against each cue, never copy the primary cue's words or source bindings. */
export function buildCaptionPresentationPatches(selection: TimelineElement[], primary: TimelineElement, patch: Record<string, unknown>) {
  const isGroupStyle = Object.keys(patch).length > 0 && Object.keys(patch).every(key => CAPTION_GROUP_STYLE_FIELDS.has(key));
  const targets = isGroupStyle
    ? [...new Map([primary, ...selection.filter(element => element.type === "caption_text")].map(element => [element.id, element])).values()]
    : [primary];
  return targets.map(element => ({ elementId: element.id, patch: { props: { ...(element.props ?? {}), ...resolveCaptionProps(element.props), ...patch } } }));
}

export function hydrateInspectorDraft(element: TimelineElement | null) {
  if (!element) {
    return {
      editStart: "",
      editDuration: "",
      editVolume: 100,
      editTrimStart: "",
      editTrimEnd: "",
      editFadeIn: "",
      editFadeOut: "",
      editAnimationIn: "none" as AnimationPreset,
      editAnimationOut: "none" as AnimationPreset,
      editAnimInDuration: "0.25",
      editAnimOutDuration: "0.25",
      editCaptionText: "",
      editCaptionPosition: "bottom_center" as CaptionPositionPreset,
      editCaptionFontPreset: "display_serif" as CaptionFontPreset,
      editCaptionStyleVariant: "cinematic" as CaptionStyleVariant,
      editCaptionFontSize: "42",
      editCaptionAbsX: "0.50",
      editCaptionAbsY: "0.82",
      editMediaScale: "1.00",
      editMediaOffsetX: "0.00",
      editMediaOffsetY: "0.00",
      editMediaOpacity: "100",
      ...colorGradeDraft(IDENTITY_COLOR_GRADE),
      ...chromaKeyDraft(null),
      editMaskTop: "0",
      editMaskRight: "0",
      editMaskBottom: "0",
      editMaskLeft: "0",
      editMaskFeather: "0",
      editMirrorCenter: "50",
      editMirrorHeight: "100",
    };
  }

  // Animation props: for captions, read from resolveCaptionProps; for others, from resolveAnimationProps
  const animProps = element.type === "caption_text"
    ? resolveCaptionProps(element.props)
    : resolveAnimationProps(element.props);

  const captionProps = resolveCaptionProps(element.props);
  const base = captionPresetBaseXY(captionProps.positionPreset, captionProps.maxWidth);
  const mediaTransform = readMediaTransformProps(element.props);
  const maskInset = readMaskInsetProps(element.props);
  const mediaEffect = readMediaEffectProps(element.props);
  const colorGrade = resolveColorGradeAtTime(element.props, 0);
  const chromaKey = resolveChromaKeyAtTime(element.props, 0);
  const mirrorBand = mirrorBandFromMaskInset(maskInset);
  const firstEnvelopeVolume = readVolumeEnvelopePoints(element, element.duration)[0]?.volume;
  const editVolume = Number.isFinite(firstEnvelopeVolume)
    ? Math.round(firstEnvelopeVolume! * 100)
    : 100;

  return {
    editStart: element.timeline_start.toFixed(2),
    editDuration: element.duration.toFixed(2),
    editVolume,
    editTrimStart: element.trim_start.toFixed(2),
    editTrimEnd: element.trim_end != null ? element.trim_end.toFixed(2) : "",
    editFadeIn: element.fade_in.toFixed(2),
    editFadeOut: element.fade_out.toFixed(2),
    editAnimationIn: animProps.animationIn,
    editAnimationOut: animProps.animationOut,
    editAnimInDuration: animProps.animationInDuration.toFixed(2),
    editAnimOutDuration: animProps.animationOutDuration.toFixed(2),
    editCaptionText: captionProps.text,
    editCaptionPosition: captionProps.positionPreset,
    editCaptionFontPreset: captionProps.fontPreset,
    editCaptionStyleVariant: captionProps.styleVariant,
    editCaptionFontSize: String(Math.round(captionProps.fontSizePx)),
    editCaptionAbsX: String(captionProps.absX ?? base.x),
    editCaptionAbsY: String(captionProps.absY ?? base.y),
    editMediaScale: mediaTransform.scale.toFixed(2),
    editMediaOffsetX: mediaTransform.offsetX.toFixed(2),
    editMediaOffsetY: mediaTransform.offsetY.toFixed(2),
    editMediaOpacity: String(Math.round(mediaEffect.opacity * 100)),
    ...colorGradeDraft(colorGrade),
    ...chromaKeyDraft(chromaKey),
    editMaskTop: String(Math.round(maskInset.top * 100)),
    editMaskRight: String(Math.round(maskInset.right * 100)),
    editMaskBottom: String(Math.round(maskInset.bottom * 100)),
    editMaskLeft: String(Math.round(maskInset.left * 100)),
    editMaskFeather: String(Math.round(mediaEffect.maskFeather * 100)),
    editMirrorCenter: String(Math.round(mirrorBand.center * 100)),
    editMirrorHeight: String(Math.round(mirrorBand.height * 100)),
  };
}

function parseNonNegativeNumber(value: string, fallback: number) {
  return Math.max(0, Number.parseFloat(value) || fallback);
}

export function buildStartPatch(selectedElement: TimelineElement | null, value: string) {
  if (!selectedElement) return null;
  const nextValue = parseNonNegativeNumber(value, 0);
  return nextValue !== selectedElement.timeline_start ? { timeline_start: nextValue } : null;
}

export function buildDurationPatch(selectedElement: TimelineElement | null, value: string) {
  if (!selectedElement) return null;
  const nextValue = Math.max(minTimelineDurationSeconds(), Number.parseFloat(value) || minTimelineDurationSeconds());
  return nextValue !== selectedElement.duration ? { duration: nextValue } : null;
}

function volumeKeyframeIndexAtTime(selectedElement: TimelineElement, localTimeSeconds: number) {
  const rawEnvelope = selectedElement.props?.volume_envelope;
  if (!Array.isArray(rawEnvelope) || rawEnvelope.length < 2) return -1;
  const roundedTime = Number(localTimeSeconds.toFixed(3));
  return readVolumeEnvelopePoints(selectedElement, selectedElement.duration)
    .findIndex((point) => point.time_seconds === roundedTime);
}

export function hasVolumeKeyframeAtTime(
  selectedElement: TimelineElement | null,
  localTimeSeconds: number,
) {
  return !!selectedElement && volumeKeyframeIndexAtTime(selectedElement, localTimeSeconds) >= 0;
}

export function buildToggleVolumeKeyframePatch(
  selectedElement: TimelineElement | null,
  localTimeSeconds: number,
) {
  if (!selectedElement) return null;
  const points = readVolumeEnvelopePoints(selectedElement, selectedElement.duration);
  const pointIndex = volumeKeyframeIndexAtTime(selectedElement, localTimeSeconds);

  if (pointIndex > 0 && pointIndex < points.length - 1) {
    return writeVolumeEnvelopePatch(
      selectedElement,
      points.filter((_, index) => index !== pointIndex),
      selectedElement.duration,
    );
  }
  if (pointIndex >= 0) return null;

  return writeVolumeEnvelopePatch(
    selectedElement,
    insertEnvelopePoint(points, localTimeSeconds),
    selectedElement.duration,
  );
}

export function buildToggleVolumeKeyframePatchAtPlayhead(
  selectedElement: TimelineElement | null,
  timelinePlayheadSeconds: number,
) {
  if (!selectedElement) return null;
  const localTimeSeconds = Math.max(
    0,
    Math.min(selectedElement.duration, timelinePlayheadSeconds - selectedElement.timeline_start),
  );
  return buildToggleVolumeKeyframePatch(selectedElement, localTimeSeconds);
}

export function buildVolumePatch(
  selectedElement: TimelineElement | null,
  pct: number,
  localTimeSeconds?: number,
) {
  if (!selectedElement) return null;
  const maxPct = MAX_VOLUME * 100;
  const nextValue = Number((Math.max(0, Math.min(maxPct, pct)) / 100).toFixed(2));
  const pointIndex = localTimeSeconds == null
    ? -1
    : volumeKeyframeIndexAtTime(selectedElement, localTimeSeconds);
  if (pointIndex >= 0) {
    const points = readVolumeEnvelopePoints(selectedElement, selectedElement.duration);
    if (Math.abs(nextValue - points[pointIndex]!.volume) < 0.005) return null;
    return writeVolumeEnvelopePatch(
      selectedElement,
      moveEnvelopePoint(points, pointIndex, localTimeSeconds!, nextValue),
      selectedElement.duration,
    );
  }
  const props = selectedElement.props as Record<string, unknown> | null;
  const envelope = props?.volume_envelope;
  if (Array.isArray(envelope) && envelope.length >= 2) {
    const points = readVolumeEnvelopePoints(selectedElement, selectedElement.duration);
    const currentFirstVolume = points[0]!.volume;
    if (Math.abs(nextValue - currentFirstVolume) < 0.005) return null;
    const adjusted = retargetVolumeEnvelope(points, nextValue);
    return writeVolumeEnvelopePatch(selectedElement, adjusted, selectedElement.duration);
  }
  return nextValue !== selectedElement.volume ? { volume: nextValue } : null;
}

export function buildTrimStartPatch(selectedElement: TimelineElement | null, value: string) {
  if (!selectedElement) return null;
  const requestedTrimStart = parseNonNegativeNumber(value, 0);
  if (requestedTrimStart === selectedElement.trim_start) return null;
  if (selectedElement.type !== "video_clip" && !isAudioElementType(selectedElement.type)) {
    return { trim_start: requestedTrimStart };
  }

  const playbackRate = Math.max(0.001, selectedElement.playback_rate ?? 1);
  const originalRightEdge = selectedElement.timeline_start + selectedElement.duration;
  const requestedTimelineStart = selectedElement.timeline_start
    + (requestedTrimStart - selectedElement.trim_start) / playbackRate;
  const nextTimelineStart = Number(Math.max(
    0,
    Math.min(originalRightEdge - minTimelineDurationSeconds(), requestedTimelineStart),
  ).toFixed(3));
  const appliedTrimStart = Number(Math.max(
    0,
    selectedElement.trim_start
      + (nextTimelineStart - selectedElement.timeline_start) * playbackRate,
  ).toFixed(3));
  const nextDuration = Number(Math.max(
    minTimelineDurationSeconds(),
    originalRightEdge - nextTimelineStart,
  ).toFixed(3));
  const sourceBacked = buildSourceBackedTrimDurationPatch(
    selectedElement,
    appliedTrimStart,
    selectedElement.trim_end,
  );
  if (selectedElement.type !== "video_clip" || !supportsOverflowHold(selectedElement.type)) {
    return {
      timeline_start: nextTimelineStart,
      trim_start: appliedTrimStart,
      duration: sourceBacked ? Math.min(nextDuration, sourceBacked.duration) : nextDuration,
    };
  }

  if (sourceBacked == null) {
    return {
      timeline_start: nextTimelineStart,
      trim_start: appliedTrimStart,
      duration: nextDuration,
    };
  }

  return {
    timeline_start: nextTimelineStart,
    trim_start: appliedTrimStart,
    duration: nextDuration,
    props: writeVideoClipTimingMetadata(selectedElement.props, {
      sourceDurationSeconds: sourceBacked.sourceDurationSeconds,
      playableWindowDurationSeconds: null,
      leadingHoldDurationSeconds: 0,
    }),
  };
}

export function buildTrimEndPatch(selectedElement: TimelineElement | null, value: string) {
  if (!selectedElement) return null;
  if (value === "") {
    if (selectedElement.trim_end == null) return null;
    const sourceBacked = buildSourceBackedTrimDurationPatch(selectedElement, selectedElement.trim_start, null);
    if (selectedElement.type !== "video_clip" || !supportsOverflowHold(selectedElement.type)) {
      return sourceBacked
        ? { trim_end: null, duration: sourceBacked.duration }
        : { trim_end: null };
    }

    if (sourceBacked == null) {
      return { trim_end: null };
    }

    return {
      trim_end: null,
      duration: sourceBacked.duration,
      props: writeVideoClipTimingMetadata(selectedElement.props, {
        sourceDurationSeconds: sourceBacked.sourceDurationSeconds,
        playableWindowDurationSeconds: null,
        leadingHoldDurationSeconds: 0,
      }),
    };
  }
  const nextValue = parseNonNegativeNumber(value, 0);
  if (nextValue === selectedElement.trim_end) return null;
  const sourceBacked = buildSourceBackedTrimDurationPatch(selectedElement, selectedElement.trim_start, nextValue);
  if (selectedElement.type !== "video_clip" || !supportsOverflowHold(selectedElement.type)) {
    return sourceBacked
      ? { trim_end: nextValue, duration: sourceBacked.duration }
      : { trim_end: nextValue };
  }

  if (sourceBacked == null) {
    return { trim_end: nextValue };
  }

  return {
    trim_end: nextValue,
    duration: sourceBacked.duration,
    props: writeVideoClipTimingMetadata(selectedElement.props, {
      sourceDurationSeconds: sourceBacked.sourceDurationSeconds,
      playableWindowDurationSeconds: null,
      leadingHoldDurationSeconds: 0,
    }),
  };
}

export function buildFadeInPatch(selectedElement: TimelineElement | null, value: string) {
  if (!selectedElement) return null;
  const nextValue = parseNonNegativeNumber(value, 0);
  return nextValue !== selectedElement.fade_in ? { fade_in: nextValue } : null;
}

export function buildFadeOutPatch(selectedElement: TimelineElement | null, value: string) {
  if (!selectedElement) return null;
  const nextValue = parseNonNegativeNumber(value, 0);
  return nextValue !== selectedElement.fade_out ? { fade_out: nextValue } : null;
}

/**
 * Graphic one-line text behaves like a scalable title object: changing its
 * type size scales the authored text box by the same ratio. Spoken captions
 * keep their fixed semantic rail and may fit down inside it.
 */
export function buildCaptionFontSizeProps(
  element: TimelineElement,
  nextFontSizePx: number,
) {
  const current = resolveCaptionProps(element.props);
  const raw = element.props ?? {};
  const isSpokenCaption = raw.caption_follow_audio === true
    || (raw.caption_audio_binding != null && typeof raw.caption_audio_binding === "object");
  const shouldScaleTextBox = current.singleLine && !isSpokenCaption;
  const scale = current.fontSizePx > 0 ? nextFontSizePx / current.fontSizePx : 1;
  const maxWidth = shouldScaleTextBox
    ? Math.max(0.25, Math.min(1, current.maxWidth * scale))
    : current.maxWidth;

  return {
    ...raw,
    ...current,
    fontSizePx: nextFontSizePx,
    maxWidth,
  };
}

export function buildCaptionGroupPositionPatches(
  selectedElements: TimelineElement[],
  primaryElementId: string,
  nextPrimaryAbsX: number,
  nextPrimaryAbsY: number,
  primaryPositionPreset: CaptionPositionPreset,
) {
  const captions = selectedElements.filter((element) => element.type === "caption_text");
  const primary = captions.find((element) => element.id === primaryElementId);
  if (!primary) return [];

  const primaryCaption = resolveCaptionProps(primary.props);
  const primaryBase = captionPresetBaseXY(primaryCaption.positionPreset, primaryCaption.maxWidth);
  const primaryAbsX = primaryCaption.absX ?? primaryBase.x;
  const primaryAbsY = primaryCaption.absY ?? primaryBase.y;
  const deltaX = clampCaptionAbsPosition(nextPrimaryAbsX) - primaryAbsX;
  const deltaY = clampCaptionAbsPosition(nextPrimaryAbsY) - primaryAbsY;

  return captions.map((element) => {
    const current = resolveCaptionProps(element.props);
    const base = captionPresetBaseXY(current.positionPreset, current.maxWidth);
    const currentAbsX = current.absX ?? base.x;
    const currentAbsY = current.absY ?? base.y;
    return {
      elementId: element.id,
      patch: {
        props: {
          ...(element.props ?? {}),
          ...current,
          positionPreset: element.id === primaryElementId
            ? primaryPositionPreset
            : current.positionPreset,
          absX: clampCaptionAbsPosition(currentAbsX + deltaX),
          absY: clampCaptionAbsPosition(currentAbsY + deltaY),
          offsetX: 0,
          offsetY: 0,
          // A semantic group layout is the position authority until the user
          // deliberately moves the caption. Clear it with the manual edit so
          // the renderer and the Inspector do not retain competing positions.
          groupLayout: null,
          benchmarkStackLayout: null,
        },
      },
    };
  });
}

type InspectorDraft = ReturnType<typeof hydrateInspectorDraft>;

type DraftField = keyof InspectorDraft;

type DraftAction =
  | { type: "hydrate"; draft: InspectorDraft }
  | { type: "set"; field: DraftField; value: InspectorDraft[DraftField] };

function draftReducer(state: InspectorDraft, action: DraftAction): InspectorDraft {
  if (action.type === "hydrate") return action.draft;
  return { ...state, [action.field]: action.value };
}

export function preservesFramingDraft(previous: TimelineElement | null, next: TimelineElement | null) {
  return previous != null && next != null && previous.id === next.id
    && previous.source_url === next.source_url
    && JSON.stringify(previous.props) === JSON.stringify(next.props);
}

export function buildVisualTransformSelectionPatches(
  elements: TimelineElement[],
  selectedElement: TimelineElement | null,
  playheadSec: number,
  values: Partial<{ scale: number; offsetX: number; offsetY: number }>,
) {
  if (!selectedElement || !isVisualElementType(selectedElement.type)) return [];
  const compoundVisuals = compoundClipMembers(elements, selectedElement)
    .filter((element) => isVisualElementType(element.type));
  const targets = compoundVisuals.length > 1 ? compoundVisuals : [selectedElement];
  return targets.map((element) => {
    const localTimeSeconds = Math.max(0, Math.min(element.duration, playheadSec - element.timeline_start));
    let props = { ...(element.props ?? {}) };
    if (values.scale !== undefined) {
      props = commitMediaTransformFieldAtTime(props, localTimeSeconds, "scale", values.scale);
    }
    if (values.offsetX !== undefined) {
      props = commitMediaTransformFieldAtTime(props, localTimeSeconds, "offsetX", values.offsetX);
    }
    if (values.offsetY !== undefined) {
      props = commitMediaTransformFieldAtTime(props, localTimeSeconds, "offsetY", values.offsetY);
    }
    return { elementId: element.id, patch: { props } };
  });
}

export function useTimelineInspector({
  selectedElement,
  selectedElements,
  setSelectedId,
  patchElement,
  patchElements,
  moveElement,
  resizeElement,
  splitCaptionElement,
  playheadSec,
  getPlayheadSec,
  elements,
  onWarning,
}: Args) {
  const [draft, dispatch] = useReducer(draftReducer, selectedElement, hydrateInspectorDraft);
  const [selectedElementPreviewProps, setSelectedElementPreviewProps] = useState<Record<string, unknown> | null>(null);
  const [selectedVisualGroupPreviewProps, setSelectedVisualGroupPreviewProps] = useState<Record<string, Record<string, unknown>> | null>(null);
  const draftRef = useRef(draft);
  const selectedElementRef = useRef<TimelineElement | null>(selectedElement);
  const pendingVolumeCommitRef = useRef<{ elementId: string; pct: number; localTimeSeconds: number } | null>(null);
  const draftCaptionTextRef = useRef(resolveCaptionProps(selectedElement?.props).text);
  const isCaptionTextDirtyRef = useRef(false);
  const selectedLocalPlayheadSec = selectedElement
    ? Math.max(0, Math.min(selectedElement.duration, playheadSec - selectedElement.timeline_start))
    : 0;
  const opacityElement = selectedElement && (selectedElement.type === "still" || selectedElement.type === "video_clip")
    ? compoundClipMemberAtTime(elements, selectedElement, playheadSec) ?? selectedElement
    : selectedElement;
  const opacityLocalPlayheadSec = opacityElement
    ? Math.max(0, Math.min(opacityElement.duration, playheadSec - opacityElement.timeline_start))
    : 0;
  const volumeKeyedAtPlayhead = hasVolumeKeyframeAtTime(selectedElement, selectedLocalPlayheadSec);
  const hasPersistedVolumeEnvelope = Array.isArray(selectedElement?.props?.volume_envelope)
    && selectedElement.props.volume_envelope.length >= 2;
  const resolvedVolumePct = selectedElement && hasPersistedVolumeEnvelope
    ? Math.round(interpolateEnvelopeVolume(
      readVolumeEnvelopePoints(selectedElement, selectedElement.duration),
      selectedLocalPlayheadSec,
    ) * 100)
    : draft.editVolume;

  const framingPreviewRef = useRef(selectedElementPreviewProps);
  framingPreviewRef.current = selectedElementPreviewProps;
  const hydratedElementRef = useRef(selectedElement);
  const applyInspectorDraft = useCallback((element: TimelineElement | null, preserveFraming = false) => {
    const nextDraft = hydrateInspectorDraft(element);
    if (preserveFraming && framingPreviewRef.current) {
      nextDraft.editMediaScale = draftRef.current.editMediaScale;
      nextDraft.editMediaOffsetX = draftRef.current.editMediaOffsetX;
      nextDraft.editMediaOffsetY = draftRef.current.editMediaOffsetY;
    }
    draftRef.current = nextDraft;
    dispatch({ type: "hydrate", draft: nextDraft });
    if (!preserveFraming) setSelectedElementPreviewProps(null);
  }, []);

  const setDraftField = useCallback(<K extends DraftField,>(field: K, value: InspectorDraft[K]) => {
    draftRef.current = { ...draftRef.current, [field]: value };
    dispatch({ type: "set", field, value });
  }, []);

  const readDraftField = useCallback(<K extends DraftField,>(field: K, nextValue?: InspectorDraft[K]) => {
    return (nextValue ?? draftRef.current[field]) as InspectorDraft[K];
  }, []);

  /** Re-seed a whole group of draft fields from one committed resolve. */
  const setDraftFields = useCallback((fields: Partial<InspectorDraft>) => {
    for (const [field, value] of Object.entries(fields)) {
      setDraftField(field as DraftField, value as InspectorDraft[DraftField]);
    }
  }, [setDraftField]);

  const setEditStart = useCallback((value: string) => {
    setDraftField("editStart", value);
  }, [setDraftField]);

  const setEditDuration = useCallback((value: string) => {
    setDraftField("editDuration", value);
  }, [setDraftField]);

  const setEditVolume = useCallback((value: number) => {
    setDraftField("editVolume", value);
  }, [setDraftField]);

  const setEditTrimStart = useCallback((value: string) => {
    setDraftField("editTrimStart", value);
  }, [setDraftField]);

  const setEditTrimEnd = useCallback((value: string) => {
    setDraftField("editTrimEnd", value);
  }, [setDraftField]);

  const setEditFadeIn = useCallback((value: string) => {
    setDraftField("editFadeIn", value);
  }, [setDraftField]);

  const setEditFadeOut = useCallback((value: string) => {
    setDraftField("editFadeOut", value);
  }, [setDraftField]);

  const setEditAnimationIn = useCallback((value: AnimationPreset) => {
    setDraftField("editAnimationIn", value);
  }, [setDraftField]);

  const setEditAnimationOut = useCallback((value: AnimationPreset) => {
    setDraftField("editAnimationOut", value);
  }, [setDraftField]);

  const setEditAnimInDuration = useCallback((value: string) => {
    setDraftField("editAnimInDuration", value);
  }, [setDraftField]);

  const setEditAnimOutDuration = useCallback((value: string) => {
    setDraftField("editAnimOutDuration", value);
  }, [setDraftField]);

  const setEditCaptionText = useCallback((value: string) => {
    draftCaptionTextRef.current = value;
    isCaptionTextDirtyRef.current = true;
    setDraftField("editCaptionText", value);
  }, [setDraftField]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    selectedElementRef.current = selectedElement;
  }, [selectedElement]);

  useEffect(() => {
    const selectedElementId = selectedElement?.id;
    if (!selectedElementId) return;
    const clearSelectedPreviewGain = () => clearPreviewAudioGain(selectedElementId);
    const clearWhenHidden = () => {
      if (document.visibilityState === "hidden") clearSelectedPreviewGain();
    };

    window.addEventListener("blur", clearSelectedPreviewGain);
    document.addEventListener("visibilitychange", clearWhenHidden);
    return () => {
      window.removeEventListener("blur", clearSelectedPreviewGain);
      document.removeEventListener("visibilitychange", clearWhenHidden);
      clearSelectedPreviewGain();
    };
  }, [selectedElement?.id]);

  useEffect(() => {
    draftCaptionTextRef.current = resolveCaptionProps(selectedElement?.props).text;
    isCaptionTextDirtyRef.current = false;
  }, [selectedElement?.id, selectedElement?.props]);

  const setEditCaptionPosition = useCallback((value: CaptionPositionPreset) => {
    setDraftField("editCaptionPosition", value);
  }, [setDraftField]);

  const setEditCaptionFontPreset = useCallback((value: CaptionFontPreset) => {
    setDraftField("editCaptionFontPreset", value);
  }, [setDraftField]);

  const setEditCaptionStyleVariant = useCallback((value: CaptionStyleVariant) => {
    setDraftField("editCaptionStyleVariant", value);
  }, [setDraftField]);

  const buildCaptionFontSizePatches = useCallback((value: string) => {
    if (!selectedElement || selectedElement.type !== "caption_text") return [];
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed)) return [];
    const fontSizePx = Math.round(Math.max(18, Math.min(300, parsed)));
    const selectedCaptions = selectedElements.filter((element) => element.type === "caption_text");
    const targets = selectedCaptions.length > 0 ? selectedCaptions : [selectedElement];
    return targets.map((element) => ({
      elementId: element.id,
      patch: {
        props: buildCaptionFontSizeProps(element, fontSizePx),
      },
    }));
  }, [selectedElement, selectedElements]);

  const setEditCaptionFontSize = useCallback((value: string) => {
    setDraftField("editCaptionFontSize", value);
    const patches = buildCaptionFontSizePatches(value);
    setSelectedElementPreviewProps(
      patches.find((entry) => entry.elementId === selectedElement?.id)?.patch.props ?? null,
    );
    setSelectedVisualGroupPreviewProps(
      patches.length > 1
        ? Object.fromEntries(patches.map((entry) => [entry.elementId, entry.patch.props]))
        : null,
    );
  }, [buildCaptionFontSizePatches, selectedElement?.id, setDraftField]);

  const setEditCaptionAbsX = useCallback((value: string) => {
    setDraftField("editCaptionAbsX", value);
  }, [setDraftField]);

  const setEditCaptionAbsY = useCallback((value: string) => {
    setDraftField("editCaptionAbsY", value);
  }, [setDraftField]);

  const setEditMediaScale = useCallback((value: string) => {
    setDraftField("editMediaScale", value);
  }, [setDraftField]);

  const setEditMediaOffsetX = useCallback((value: string) => {
    setDraftField("editMediaOffsetX", value);
  }, [setDraftField]);

  const setEditMediaOffsetY = useCallback((value: string) => {
    setDraftField("editMediaOffsetY", value);
  }, [setDraftField]);

  const setEditMediaOpacity = useCallback((value: string) => {
    setDraftField("editMediaOpacity", value);
  }, [setDraftField]);

  const setEditColorGrade = useCallback((field: ColorGradeField, value: string) => {
    setDraftField(COLOR_GRADE_DRAFT_FIELD[field], value);
  }, [setDraftField]);

  const setEditChromaKey = useCallback((field: ChromaKeyAmountField, value: string) => {
    setDraftField(CHROMA_KEY_DRAFT_FIELD[field], value);
  }, [setDraftField]);

  const setEditMaskTop = useCallback((value: string) => {
    setDraftField("editMaskTop", value);
  }, [setDraftField]);

  const setEditMaskRight = useCallback((value: string) => {
    setDraftField("editMaskRight", value);
  }, [setDraftField]);

  const setEditMaskBottom = useCallback((value: string) => {
    setDraftField("editMaskBottom", value);
  }, [setDraftField]);

  const setEditMaskLeft = useCallback((value: string) => {
    setDraftField("editMaskLeft", value);
  }, [setDraftField]);

  const setEditMaskFeather = useCallback((value: string) => {
    setDraftField("editMaskFeather", value);
  }, [setDraftField]);

  const setEditMirrorCenter = useCallback((value: string) => {
    setDraftField("editMirrorCenter", value);
  }, [setDraftField]);

  const setEditMirrorHeight = useCallback((value: string) => {
    setDraftField("editMirrorHeight", value);
  }, [setDraftField]);

  const selectElement = useCallback(
    (elementId: string) => {
      const element = elements.find((entry) => entry.id === elementId);
      if (!element) return;
      setSelectedId(elementId);
      applyInspectorDraft(element);
    },
    [applyInspectorDraft, elements, setSelectedId],
  );

  useEffect(() => {
    const pendingVolumeCommit = pendingVolumeCommitRef.current;
    if (pendingVolumeCommit) {
      if (!selectedElement || selectedElement.id !== pendingVolumeCommit.elementId) {
        pendingVolumeCommitRef.current = null;
      } else {
        const selectedVolumePct = Math.round(interpolateEnvelopeVolume(
          readVolumeEnvelopePoints(selectedElement, selectedElement.duration),
          pendingVolumeCommit.localTimeSeconds,
        ) * 100);
        if (selectedVolumePct !== pendingVolumeCommit.pct) {
          return;
        }
        pendingVolumeCommitRef.current = null;
      }
    }

    // A timing-only move must not discard a crop the user is still adjusting.
    const previous = hydratedElementRef.current;
    const preserveFraming = preservesFramingDraft(previous, selectedElement);
    hydratedElementRef.current = selectedElement;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    applyInspectorDraft(selectedElement, preserveFraming);
  }, [applyInspectorDraft, selectedElement]);

  const commitStart = useCallback(() => {
    const patch = buildStartPatch(selectedElement, readDraftField("editStart"));
    if (selectedElement && patch && typeof patch.timeline_start === "number") {
      moveElement(selectedElement.id, { timelineStart: patch.timeline_start });
    }
  }, [readDraftField, selectedElement, moveElement]);

  const commitDuration = useCallback((nextValue?: string) => {
    const patch = buildDurationPatch(selectedElement, readDraftField("editDuration", nextValue));
    if (selectedElement && patch && typeof patch.duration === "number") {
      resizeElement(selectedElement.id, { duration: patch.duration });
    }
  }, [readDraftField, resizeElement, selectedElement]);

  const commitVolume = useCallback(
    async (pct: number) => {
      const clampedPct = Math.max(0, Math.min(MAX_VOLUME * 100, Math.round(pct)));
      setEditVolume(clampedPct);
      if (selectedElement) {
        pendingVolumeCommitRef.current = {
          elementId: selectedElement.id,
          pct: clampedPct,
          localTimeSeconds: selectedLocalPlayheadSec,
        };
        setPreviewAudioGain(selectedElement.id, clampedPct / 100);
      }
      const patch = buildVolumePatch(selectedElement, clampedPct, selectedLocalPlayheadSec);
      if (!selectedElement) return;
      try {
        if (patch) await patchElement(selectedElement.id, patch);
      } finally {
        clearPreviewAudioGain(selectedElement.id);
      }
    },
    [patchElement, selectedElement, selectedLocalPlayheadSec, setEditVolume],
  );

  const toggleVolumeKeyframeAtPlayhead = useCallback(() => {
    if (!selectedElement) return;
    // Playback events update React state asynchronously. Read the player's
    // current frame at click time so a keyframe cannot land on an older render's
    // playhead, then convert the timeline time to clip-local time exactly once.
    const currentPlayheadSec = getPlayheadSec?.() ?? playheadSec;
    const patch = buildToggleVolumeKeyframePatchAtPlayhead(selectedElement, currentPlayheadSec);
    if (patch) patchElement(selectedElement.id, patch);
  }, [getPlayheadSec, patchElement, playheadSec, selectedElement]);

  const commitTrimStart = useCallback((nextValue?: string) => {
    const patch = buildTrimStartPatch(selectedElement, readDraftField("editTrimStart", nextValue));
    if (!selectedElement || !patch) return;
    const speechBound = selectedElement.type === "video_clip"
      && selectedElement.props?.speech_sync_binding != null;
    if (speechBound && typeof patch.timeline_start === "number") {
      resizeElement(selectedElement.id, { timelineStart: patch.timeline_start });
      return;
    }
    patchElement(selectedElement.id, patch);
  }, [readDraftField, resizeElement, selectedElement, patchElement]);

  const commitTrimEnd = useCallback((nextValue?: string) => {
    const patch = buildTrimEndPatch(selectedElement, readDraftField("editTrimEnd", nextValue));
    if (!selectedElement || !patch) return;
    const speechBound = selectedElement.type === "video_clip"
      && selectedElement.props?.speech_sync_binding != null;
    if (speechBound && typeof patch.duration === "number") {
      resizeElement(selectedElement.id, { duration: patch.duration });
      return;
    }
    patchElement(selectedElement.id, patch);
  }, [readDraftField, resizeElement, selectedElement, patchElement]);

  const commitFadeIn = useCallback((nextValue?: string) => {
    const patch = buildFadeInPatch(selectedElement, readDraftField("editFadeIn", nextValue));
    if (selectedElement && patch) patchElement(selectedElement.id, patch);
  }, [readDraftField, selectedElement, patchElement]);

  const commitFadeOut = useCallback((nextValue?: string) => {
    const patch = buildFadeOutPatch(selectedElement, readDraftField("editFadeOut", nextValue));
    if (selectedElement && patch) patchElement(selectedElement.id, patch);
  }, [readDraftField, selectedElement, patchElement]);

  const nudgeStart = useCallback(
    (delta: number) => {
      if (!selectedElement) return;
      const step = isVisualElementType(selectedElement.type)
        ? Math.max(1 / currentFrameRate(), Math.abs(delta))
        : Math.abs(delta);
      const signedDelta = delta < 0 ? -step : step;
      const val = Math.max(0, selectedElement.timeline_start + signedDelta);
      patchElement(selectedElement.id, { timeline_start: val });
    },
    [selectedElement, patchElement],
  );

  // Patch animation props into element's JSONB props.
  // For captions: merge with full resolveCaptionProps so caption-specific fields are preserved.
  // For visual elements: only write animation fields into props.
  const previewSelectedEffectProps = useCallback((patch: Record<string, unknown> | null, targetId?: string) => {
    const target = targetId ? elements.find(element => element.id === targetId) : selectedElement;
    setSelectedElementPreviewProps(patch && target && target.id === selectedElement?.id ? { ...target.props, ...patch } : null);
    setSelectedVisualGroupPreviewProps(patch && target && target.id !== selectedElement?.id ? { [target.id]: { ...target.props, ...patch } } : null);
  }, [elements, selectedElement]);

  const patchSelectedElementProps = useCallback(
    (patch: Record<string, unknown>) => {
      if (!selectedElement) return;
      if (patch.cutout_effects !== undefined) {
        const members = compoundClipMembers(elements, selectedElement);
        const targets = members.length ? members : [selectedElement];
        void patchElements(targets.map(member => ({ elementId: member.id, patch: {
          props: { ...member.props, cutout_effects: patch.cutout_effects },
        } })));
        return;
      }
      if (selectedElement.type === "caption_text") {
        const current = resolveCaptionProps(selectedElement.props);
        patchElement(selectedElement.id, {
          props: { ...(selectedElement.props ?? {}), ...current, ...patch },
        });
      } else {
        patchElement(selectedElement.id, {
          props: { ...(selectedElement.props ?? {}), ...patch },
        });
      }
    },
    [selectedElement, elements, patchElement, patchElements],
  );

  // Text and source-word bindings are cue-specific; presentation uses the selection.
  const patchSelectedCaptionProps = useCallback(
    (patch: Record<string, unknown>) => {
      if (!selectedElement || selectedElement.type !== "caption_text") return;
      const patches = buildCaptionPresentationPatches(selectedElements, selectedElement, patch);
      // One word at a time stores one caption per word; the batch path returns the new
      // captions and records the split as a single undoable step.
      if (patches.length > 1 || patch.timingMode === "single_word") void patchElements(patches);
      else if (patches[0]) void patchElement(patches[0].elementId, patches[0].patch);
    },
    [selectedElement, selectedElements, patchElement, patchElements],
  );

  useEffect(() => {
    return () => {
      const previousElement = selectedElementRef.current;
      if (!previousElement || previousElement.type !== "caption_text") return;
      if (!isCaptionTextDirtyRef.current) return;
      const currentProps = resolveCaptionProps(previousElement.props);
      const nextText = draftCaptionTextRef.current;
      if (nextText === currentProps.text) return;
      isCaptionTextDirtyRef.current = false;
      const edit = captionTextEditPatch(nextText, previousElement.props);
      patchElement(previousElement.id, {
        props: { ...(previousElement.props ?? {}), ...currentProps, ...edit.patch },
      });
      if (edit.timingInvalidated) onWarning?.("Word timing removed because the caption text changed. Regenerate from aligned audio to restore it.");
    };
  }, [selectedElement?.id, patchElement, onWarning]);

  const commitAnimInDuration = useCallback((nextValue?: string) => {
    if (!selectedElement || isAudioElementType(selectedElement.type)) return;
    const raw = Number.parseFloat(readDraftField("editAnimInDuration", nextValue));
    const limit = selectedElement.props?.animationIn === "handwriting" ? Math.min(60, selectedElement.duration) : 2;
    const clamped = Math.max(0, Math.min(limit, Number.isFinite(raw) ? raw : 0.25));
    setEditAnimInDuration(clamped.toFixed(2));
    patchSelectedElementProps({ animationInDuration: clamped });
  }, [readDraftField, selectedElement, patchSelectedElementProps, setEditAnimInDuration]);

  const commitAnimOutDuration = useCallback((nextValue?: string) => {
    if (!selectedElement || isAudioElementType(selectedElement.type)) return;
    const raw = Number.parseFloat(readDraftField("editAnimOutDuration", nextValue));
    const limit = selectedElement.props?.animationOut === "handwriting" ? Math.min(60, selectedElement.duration) : 2;
    const clamped = Math.max(0, Math.min(limit, Number.isFinite(raw) ? raw : 0.25));
    setEditAnimOutDuration(clamped.toFixed(2));
    patchSelectedElementProps({ animationOutDuration: clamped });
  }, [readDraftField, selectedElement, patchSelectedElementProps, setEditAnimOutDuration]);

  const commitCaptionText = useCallback(() => {
    if (!selectedElement || selectedElement.type !== "caption_text") return;
    isCaptionTextDirtyRef.current = false;
    const edit = captionTextEditPatch(readDraftField("editCaptionText"), selectedElement.props);
    patchSelectedCaptionProps(edit.patch);
    if (edit.timingInvalidated) onWarning?.("Word timing removed because the caption text changed. Regenerate from aligned audio to restore it.");
  }, [readDraftField, selectedElement, patchSelectedCaptionProps, onWarning]);

  const commitCaptionFontSize = useCallback((nextValue?: string) => {
    if (!selectedElement || selectedElement.type !== "caption_text") return;
    const px = Math.max(18, Math.min(300, Number.parseFloat(readDraftField("editCaptionFontSize", nextValue)) || 42));
    const value = String(Math.round(px));
    setDraftField("editCaptionFontSize", value);
    const patches = buildCaptionFontSizePatches(value);
    setSelectedElementPreviewProps(null);
    setSelectedVisualGroupPreviewProps(null);
    if (patches.length > 1) void patchElements(patches);
    else if (patches[0]) void patchElement(patches[0].elementId, patches[0].patch);
  }, [buildCaptionFontSizePatches, patchElement, patchElements, readDraftField, selectedElement, setDraftField]);

  const commitCaptionAbsPositionNow = useCallback(
    (nextAbsX: number, nextAbsY: number, currentPreset: CaptionPositionPreset) => {
      if (!selectedElement || selectedElement.type !== "caption_text") return;
      const clampedX = clampCaptionAbsPosition(nextAbsX);
      const clampedY = clampCaptionAbsPosition(nextAbsY);

      const positionPatches = buildCaptionGroupPositionPatches(
        selectedElements,
        selectedElement.id,
        clampedX,
        clampedY,
        currentPreset,
      );
      if (positionPatches.length > 1) {
        void patchElements(positionPatches);
      } else {
        patchSelectedCaptionProps({
          positionPreset: currentPreset,
          absX: clampedX,
          absY: clampedY,
          offsetX: 0,
          offsetY: 0,
          groupLayout: null,
          benchmarkStackLayout: null,
        });
      }
      setSelectedElementPreviewProps(null);
    },
    [patchElements, patchSelectedCaptionProps, selectedElement, selectedElements],
  );

  const { debounced: debouncedCommitCaptionAbsPosition, flush: flushCaptionAbsPosition } =
    useDebouncedCallback(commitCaptionAbsPositionNow, 90);

  const buildCaptionPositionPreviewProps = useCallback(
    (nextAbsX: number, nextAbsY: number, currentPreset: CaptionPositionPreset) => {
      if (!selectedElement || selectedElement.type !== "caption_text") return null;
      const current = resolveCaptionProps(selectedElement.props);
      return {
        ...(selectedElement.props ?? {}),
        ...current,
        positionPreset: currentPreset,
        absX: clampCaptionAbsPosition(nextAbsX),
        absY: clampCaptionAbsPosition(nextAbsY),
        offsetX: 0,
        offsetY: 0,
        groupLayout: null,
        benchmarkStackLayout: null,
      };
    },
    [selectedElement],
  );

  const applyCaptionAbsPosition = useCallback(
    (nextAbsX: number, nextAbsY: number) => {
      if (!selectedElement || selectedElement.type !== "caption_text") return;
      const clampedX = clampCaptionAbsPosition(nextAbsX);
      const clampedY = clampCaptionAbsPosition(nextAbsY);
      const currentPreset = readDraftField("editCaptionPosition");

      setEditCaptionAbsX(String(clampedX));
      setEditCaptionAbsY(String(clampedY));
      setSelectedElementPreviewProps(buildCaptionPositionPreviewProps(clampedX, clampedY, currentPreset));

      debouncedCommitCaptionAbsPosition(clampedX, clampedY, currentPreset);
    },
    [buildCaptionPositionPreviewProps, readDraftField, selectedElement, debouncedCommitCaptionAbsPosition, setEditCaptionAbsX, setEditCaptionAbsY],
  );

  const commitCaptionAbsPos = useCallback(
    (_axis: "x" | "y", nextValue?: string) => {
      if (!selectedElement || selectedElement.type !== "caption_text") return;
      const nextAbsX = _axis === "x"
        ? Number.parseFloat(readDraftField("editCaptionAbsX", nextValue)) || 0
        : Number.parseFloat(readDraftField("editCaptionAbsX")) || 0;
      const nextAbsY = _axis === "y"
        ? Number.parseFloat(readDraftField("editCaptionAbsY", nextValue)) || 0
        : Number.parseFloat(readDraftField("editCaptionAbsY")) || 0;
      applyCaptionAbsPosition(nextAbsX, nextAbsY);
      flushCaptionAbsPosition();
    },
    [readDraftField, selectedElement, applyCaptionAbsPosition, flushCaptionAbsPosition],
  );

  const commitCaptionPositionPreset = useCallback(
    (preset: CaptionPositionPreset) => {
      if (!selectedElement || selectedElement.type !== "caption_text") return;
      const current = resolveCaptionProps(selectedElement.props);
      const base = captionPresetBaseXY(preset, current.maxWidth);
      setEditCaptionPosition(preset);
      setEditCaptionAbsX(String(base.x));
      setEditCaptionAbsY(String(base.y));

      const positionPatches = buildCaptionGroupPositionPatches(
        selectedElements,
        selectedElement.id,
        base.x,
        base.y,
        preset,
      ).map((entry) => (
        entry.elementId === selectedElement.id
          ? {
              ...entry,
              patch: {
                ...entry.patch,
                props: {
                  ...(entry.patch.props as Record<string, unknown>),
                  textAlign: captionPresetTextAlign(preset),
                },
              },
            }
          : entry
      ));

      if (positionPatches.length > 1) {
        void patchElements(positionPatches);
      } else {
        patchSelectedCaptionProps({
          positionPreset: preset,
          absX: base.x,
          absY: base.y,
          offsetX: 0,
          offsetY: 0,
          groupLayout: null,
          benchmarkStackLayout: null,
          textAlign: captionPresetTextAlign(preset),
        });
      }
      setSelectedElementPreviewProps(null);
    },
    [
      patchElements,
      patchSelectedCaptionProps,
      selectedElement,
      selectedElements,
      setEditCaptionAbsX,
      setEditCaptionAbsY,
      setEditCaptionPosition,
    ],
  );

  const splitSelectedCaption = useCallback(() => {
    if (!selectedElement || selectedElement.type !== "caption_text") return;
    void splitCaptionElement(selectedElement.id, playheadSec);
  }, [selectedElement, splitCaptionElement, playheadSec]);

  const buildVisualTransformPatches = useCallback(
    (overrides?: { scale?: string; offsetX?: string; offsetY?: string }) => {
      const values: Partial<{ scale: number; offsetX: number; offsetY: number }> = {};
      if (overrides?.scale !== undefined) {
        values.scale = clampMediaScale(Number.parseFloat(readDraftField("editMediaScale", overrides.scale)) || 1);
      }
      if (overrides?.offsetX !== undefined) {
        values.offsetX = clampMediaOffset(Number.parseFloat(readDraftField("editMediaOffsetX", overrides.offsetX)) || 0);
      }
      if (overrides?.offsetY !== undefined) {
        values.offsetY = clampMediaOffset(Number.parseFloat(readDraftField("editMediaOffsetY", overrides.offsetY)) || 0);
      }
      return buildVisualTransformSelectionPatches(elements, selectedElement, playheadSec, values);
    },
    [elements, playheadSec, readDraftField, selectedElement],
  );

  const previewVisualTransformPatches = useCallback(
    (patches: Array<{ elementId: string; patch: { props: Record<string, unknown> } }>) => {
      if (patches.length === 0) {
        setSelectedElementPreviewProps(null);
        setSelectedVisualGroupPreviewProps(null);
        return;
      }
      setSelectedElementPreviewProps(patches[0]!.patch.props);
      setSelectedVisualGroupPreviewProps(patches.length > 1
        ? Object.fromEntries(patches.map((patch) => [patch.elementId, patch.patch.props]))
        : null);
    },
    [],
  );

  const previewVisualTransform = useCallback(
    (overrides?: { scale?: string; offsetX?: string; offsetY?: string }) => {
      previewVisualTransformPatches(buildVisualTransformPatches(overrides));
    },
    [buildVisualTransformPatches, previewVisualTransformPatches],
  );

  const clearVisualTransformPreview = useCallback(() => {
    setSelectedElementPreviewProps(null);
    setSelectedVisualGroupPreviewProps(null);
    if (selectedElement) {
      const original = resolveMediaTransformAtTime(selectedElement.props, selectedLocalPlayheadSec);
      setEditMediaScale(original.scale.toFixed(2));
      setEditMediaOffsetX(original.offsetX.toFixed(2));
      setEditMediaOffsetY(original.offsetY.toFixed(2));
    }
  }, [selectedElement, selectedLocalPlayheadSec, setEditMediaScale, setEditMediaOffsetX, setEditMediaOffsetY]);

  const commitVisualTransform = useCallback(
    (field: "scale" | "offsetX" | "offsetY", nextValue?: string) => {
      if (!selectedElement || (selectedElement.type !== "still" && selectedElement.type !== "video_clip")) return;
      const patches = buildVisualTransformPatches(
        field === "scale" ? { scale: nextValue }
          : field === "offsetX" ? { offsetX: nextValue }
            : { offsetY: nextValue },
      );
      const nextProps = patches[0]?.patch.props;
      if (!nextProps) return;
      const nextTransform = resolveMediaTransformAtTime(nextProps, selectedLocalPlayheadSec);
      setEditMediaScale(nextTransform.scale.toFixed(2));
      setEditMediaOffsetX(nextTransform.offsetX.toFixed(2));
      setEditMediaOffsetY(nextTransform.offsetY.toFixed(2));
      setSelectedElementPreviewProps(null);
      setSelectedVisualGroupPreviewProps(null);
      if (patches.length > 1) void patchElements(patches);
      else void patchElement(selectedElement.id, { props: nextProps });
    },
    [
      buildVisualTransformPatches,
      patchElement,
      patchElements,
      selectedElement,
      setEditMediaOffsetX,
      setEditMediaOffsetY,
      setEditMediaScale,
      selectedLocalPlayheadSec,
    ],
  );

  const commitVisualTransformValues = useCallback(
    async (values: { scale: string; offsetX: string; offsetY: string }) => {
      if (!selectedElement || (selectedElement.type !== "still" && selectedElement.type !== "video_clip")) return;
      const patches = buildVisualTransformPatches(values);
      const nextProps = patches[0]?.patch.props;
      if (!nextProps) return;
      const nextTransform = resolveMediaTransformAtTime(nextProps, selectedLocalPlayheadSec);
      setEditMediaScale(nextTransform.scale.toFixed(2));
      setEditMediaOffsetX(nextTransform.offsetX.toFixed(2));
      setEditMediaOffsetY(nextTransform.offsetY.toFixed(2));
      const saved = patches.length > 1
        ? await patchElements(patches)
        : await patchElement(selectedElement.id, { props: nextProps });
      if (saved === false) {
        previewVisualTransformPatches(patches);
        return false;
      }
      setSelectedElementPreviewProps(null);
      setSelectedVisualGroupPreviewProps(null);
      return true;
    },
    [
      buildVisualTransformPatches,
      patchElement,
      patchElements,
      previewVisualTransformPatches,
      selectedElement,
      selectedLocalPlayheadSec,
      setEditMediaOffsetX,
      setEditMediaOffsetY,
      setEditMediaScale,
    ],
  );

  const resetVisualTransform = useCallback(() => {
    if (!selectedElement || (selectedElement.type !== "still" && selectedElement.type !== "video_clip")) return;
    setEditMediaScale("1.00");
    setEditMediaOffsetX("0.00");
    setEditMediaOffsetY("0.00");
    setSelectedElementPreviewProps(null);
    setSelectedVisualGroupPreviewProps(null);
    const patches = buildVisualTransformSelectionPatches(elements, selectedElement, playheadSec, {
      scale: 1,
      offsetX: 0,
      offsetY: 0,
    });
    if (patches.length > 1) void patchElements(patches);
    else if (patches[0]) void patchElement(patches[0].elementId, patches[0].patch);
  }, [elements, patchElement, patchElements, playheadSec, selectedElement, setEditMediaOffsetX, setEditMediaOffsetY, setEditMediaScale]);

  const motionPreset = selectedElement && isVisualElementType(selectedElement.type)
    ? identifyMediaMotionPreset(selectedElement.props, selectedElement.duration)
    : "none";

  const applyMotionPreset = useCallback((preset: MediaMotionPreset) => {
    if (!selectedElement || !isVisualElementType(selectedElement.type)) return;
    setSelectedElementPreviewProps(null);
    patchElement(selectedElement.id, {
      props: applyMediaMotionPreset(selectedElement.props, preset, selectedElement.duration),
    });
  }, [patchElement, selectedElement]);

  const readMaskInput = useCallback((field: "top" | "right" | "bottom" | "left", nextValue?: string) => {
    const draftField =
      field === "top" ? "editMaskTop"
        : field === "right" ? "editMaskRight"
          : field === "bottom" ? "editMaskBottom"
            : "editMaskLeft";
    const raw = Number.parseFloat(readDraftField(draftField, nextValue));
    return clampMaskInset((Number.isFinite(raw) ? raw : 0) / 100);
  }, [readDraftField]);

  const buildMaskInsetProps = useCallback(
    (overrides?: Partial<Record<"top" | "right" | "bottom" | "left", string>>) => {
      if (!selectedElement || (selectedElement.type !== "still" && selectedElement.type !== "video_clip")) {
        return null;
      }
      const current = resolveMaskInsetAtTime(selectedElement.props, selectedLocalPlayheadSec);
      return commitMaskInsetAtTime(selectedElement.props, selectedLocalPlayheadSec, {
        top: overrides?.top === undefined ? current.top : readMaskInput("top", overrides.top),
        right: overrides?.right === undefined ? current.right : readMaskInput("right", overrides.right),
        bottom: overrides?.bottom === undefined ? current.bottom : readMaskInput("bottom", overrides.bottom),
        left: overrides?.left === undefined ? current.left : readMaskInput("left", overrides.left),
      });
    },
    [readMaskInput, selectedElement, selectedLocalPlayheadSec],
  );

  const previewMaskInset = useCallback(
    (overrides?: Partial<Record<"top" | "right" | "bottom" | "left", string>>, rotation?: number) => {
      const props = buildMaskInsetProps(overrides);
      setSelectedElementPreviewProps(props && Number.isFinite(rotation) ? { ...props, mask_line_rotation: rotation } : props);
    },
    [buildMaskInsetProps],
  );

  const commitMaskInset = useCallback(
    (field: "top" | "right" | "bottom" | "left", nextValue?: string) => {
      if (!selectedElement || (selectedElement.type !== "still" && selectedElement.type !== "video_clip")) return;
      const nextProps = buildMaskInsetProps({ [field]: nextValue });
      if (!nextProps) return;
      const mask = resolveMaskInsetAtTime(nextProps, selectedLocalPlayheadSec);
      const mirror = mirrorBandFromMaskInset(mask);
      setEditMaskTop(String(Math.round(mask.top * 100)));
      setEditMaskRight(String(Math.round(mask.right * 100)));
      setEditMaskBottom(String(Math.round(mask.bottom * 100)));
      setEditMaskLeft(String(Math.round(mask.left * 100)));
      setEditMirrorCenter(String(Math.round(mirror.center * 100)));
      setEditMirrorHeight(String(Math.round(mirror.height * 100)));
      setSelectedElementPreviewProps(null);
      patchElement(selectedElement.id, { props: nextProps });
    },
    [
      buildMaskInsetProps,
      patchElement,
      selectedElement,
      setEditMaskBottom,
      setEditMaskLeft,
      setEditMaskRight,
      setEditMaskTop,
      setEditMirrorCenter,
      setEditMirrorHeight,
      selectedLocalPlayheadSec,
    ],
  );

  const buildMediaEffectProps = useCallback((
    field: "opacity" | "maskFeather",
    nextValue?: string,
  ) => {
    const target = field === "opacity" ? opacityElement : selectedElement;
    if (!target || (target.type !== "still" && target.type !== "video_clip")) {
      return null;
    }
    const draftField = field === "opacity" ? "editMediaOpacity" : "editMaskFeather";
    const raw = Number.parseFloat(readDraftField(draftField, nextValue));
    const normalized = (Number.isFinite(raw) ? raw : field === "opacity" ? 100 : 0) / 100;
    const value = field === "opacity" ? clampMediaOpacity(normalized) : clampMaskFeather(normalized);
    const localTime = field === "opacity" ? opacityLocalPlayheadSec : selectedLocalPlayheadSec;
    return commitMediaEffectFieldAtTime(target.props, localTime, field, value);
  }, [opacityElement, opacityLocalPlayheadSec, readDraftField, selectedElement, selectedLocalPlayheadSec]);

  const previewMediaEffect = useCallback((field: "opacity" | "maskFeather", nextValue?: string) => {
    const nextProps = buildMediaEffectProps(field, nextValue);
    if (field === "opacity" && opacityElement && selectedElement && opacityElement.id !== selectedElement.id) {
      setSelectedElementPreviewProps(null);
      setSelectedVisualGroupPreviewProps(nextProps ? { [opacityElement.id]: nextProps } : null);
      return;
    }
    setSelectedVisualGroupPreviewProps(null);
    setSelectedElementPreviewProps(nextProps);
  }, [buildMediaEffectProps, opacityElement, selectedElement]);

  const commitMediaEffect = useCallback((field: "opacity" | "maskFeather", nextValue?: string) => {
    const target = field === "opacity" ? opacityElement : selectedElement;
    if (!target) return;
    const nextProps = buildMediaEffectProps(field, nextValue);
    if (!nextProps) return;
    const localTime = field === "opacity" ? opacityLocalPlayheadSec : selectedLocalPlayheadSec;
    const effect = resolveMediaEffectAtTime(nextProps, localTime);
    setEditMediaOpacity(String(Math.round(effect.opacity * 100)));
    setEditMaskFeather(String(Math.round(effect.maskFeather * 100)));
    setSelectedElementPreviewProps(null);
    setSelectedVisualGroupPreviewProps(null);
    patchElement(target.id, { props: nextProps });
  }, [
    buildMediaEffectProps,
    opacityElement,
    opacityLocalPlayheadSec,
    patchElement,
    selectedElement,
    selectedLocalPlayheadSec,
    setEditMaskFeather,
    setEditMediaOpacity,
  ]);

  const buildColorGradeProps = useCallback((field: ColorGradeField, nextValue?: string) => {
    if (!selectedElement || (selectedElement.type !== "still" && selectedElement.type !== "video_clip")) {
      return null;
    }
    const draftField = COLOR_GRADE_DRAFT_FIELD[field];
    const raw = Number.parseFloat(readDraftField(draftField, nextValue));
    const displayValue = Number.isFinite(raw) ? raw : 0;
    return commitColorGradeFieldAtTime(
      selectedElement.props,
      selectedLocalPlayheadSec,
      field,
      colorGradeDisplayToField(field, displayValue),
    );
  }, [readDraftField, selectedElement, selectedLocalPlayheadSec]);

  const previewColorGrade = useCallback((field: ColorGradeField, nextValue?: string) => {
    setSelectedElementPreviewProps(buildColorGradeProps(field, nextValue));
  }, [buildColorGradeProps]);

  const commitColorGrade = useCallback((field: ColorGradeField, nextValue?: string) => {
    if (!selectedElement) return;
    const nextProps = buildColorGradeProps(field, nextValue);
    if (!nextProps) return;
    const grade = resolveColorGradeAtTime(nextProps, selectedLocalPlayheadSec);
    setEditColorGrade(field, colorGradeDraft(grade)[COLOR_GRADE_DRAFT_FIELD[field]]);
    setSelectedElementPreviewProps(null);
    patchElement(selectedElement.id, { props: nextProps });
  }, [buildColorGradeProps, patchElement, selectedElement, selectedLocalPlayheadSec, setEditColorGrade]);

  const colorGradeKeyedAtPlayhead = Object.fromEntries(COLOR_GRADE_FIELDS.map((field) => [
    field,
    selectedElement
      ? hasKeyframeAtTime(selectedElement.props, [field], selectedLocalPlayheadSec)
      : false,
  ])) as Record<ColorGradeField, boolean>;

  const advancedColorGradeKeyedAtPlayhead = Object.fromEntries(COLOR_GRADE_ADVANCED_FIELDS.map((field) => [
    field,
    selectedElement
      ? hasKeyframeAtTime(selectedElement.props, [field], selectedLocalPlayheadSec)
      : false,
  ])) as Record<AdvancedColorGradeField, boolean>;

  const toggleColorGradeKeyframeAtPlayhead = useCallback((field: ColorGradeField) => {
    if (!selectedElement || (selectedElement.type !== "still" && selectedElement.type !== "video_clip")) return;
    if (hasKeyframeAtTime(selectedElement.props, [field], selectedLocalPlayheadSec)) {
      patchElement(selectedElement.id, {
        props: removeColorGradeKeyframeAtTime(selectedElement.props, selectedLocalPlayheadSec, field),
      });
      return;
    }
    const draftProps = selectedElementPreviewProps ?? selectedElement.props;
    const grade = resolveColorGradeAtTime(draftProps, selectedLocalPlayheadSec);
    const configKey = COLOR_GRADE_FIELD_CONFIG[field].key;
    patchElement(selectedElement.id, {
      props: upsertColorGradeKeyframe(draftProps, selectedLocalPlayheadSec, field, grade[configKey]),
    });
  }, [patchElement, selectedElement, selectedElementPreviewProps, selectedLocalPlayheadSec]);

  const buildChromaKeyProps = useCallback((field: ChromaKeyField, nextValue?: string) => {
    if (!selectedElement || selectedElement.type !== "video_clip") return null;
    if (field === CHROMA_KEY_COLOR_FIELD) {
      const raw = nextValue ?? draftRef.current.editChromaKeyColor;
      return commitChromaKeyColor(selectedElement.props, raw ? raw : null);
    }
    const raw = Number.parseFloat(readDraftField(CHROMA_KEY_DRAFT_FIELD[field], nextValue));
    const percent = Number.isFinite(raw) ? raw : CHROMA_KEY_AMOUNT_CONFIG[field].identity * 100;
    return commitChromaKeyAmountAtTime(
      selectedElement.props,
      selectedLocalPlayheadSec,
      field,
      percent / 100,
    );
  }, [readDraftField, selectedElement, selectedLocalPlayheadSec]);

  const previewChromaKey = useCallback((field: ChromaKeyField, nextValue?: string) => {
    setSelectedElementPreviewProps(buildChromaKeyProps(field, nextValue));
  }, [buildChromaKeyProps]);

  const commitChromaKey = useCallback((field: ChromaKeyField, nextValue?: string) => {
    if (!selectedElement) return;
    const nextProps = buildChromaKeyProps(field, nextValue);
    if (!nextProps) return;
    setDraftFields(chromaKeyDraft(resolveChromaKeyAtTime(nextProps, selectedLocalPlayheadSec)));
    setSelectedElementPreviewProps(null);
    patchElement(selectedElement.id, { props: nextProps });
  }, [buildChromaKeyProps, patchElement, selectedElement, selectedLocalPlayheadSec, setDraftFields]);

  const chromaKeyKeyedAtPlayhead = Object.fromEntries(CHROMA_KEY_AMOUNT_FIELDS.map((field) => [
    field,
    selectedElement
      ? hasChromaKeyKeyframeAtTime(selectedElement.props, field, selectedLocalPlayheadSec)
      : false,
  ])) as Record<ChromaKeyAmountField, boolean>;

  const toggleChromaKeyKeyframeAtPlayhead = useCallback((field: ChromaKeyAmountField) => {
    if (!selectedElement || selectedElement.type !== "video_clip") return;
    if (hasChromaKeyKeyframeAtTime(selectedElement.props, field, selectedLocalPlayheadSec)) {
      patchElement(selectedElement.id, {
        props: removeChromaKeyKeyframeAtTime(selectedElement.props, selectedLocalPlayheadSec, field),
      });
      return;
    }
    const draftProps = selectedElementPreviewProps ?? selectedElement.props;
    const chroma = resolveChromaKeyAtTime(draftProps, selectedLocalPlayheadSec);
    if (!chroma) return;
    patchElement(selectedElement.id, {
      props: upsertChromaKeyKeyframe(
        draftProps,
        selectedLocalPlayheadSec,
        field,
        chroma[CHROMA_KEY_AMOUNT_CONFIG[field].key],
      ),
    });
  }, [patchElement, selectedElement, selectedElementPreviewProps, selectedLocalPlayheadSec]);

  const resetChromaKeyControls = useCallback(() => {
    if (!selectedElement || selectedElement.type !== "video_clip") return;
    setDraftFields(chromaKeyDraft(null));
    setSelectedElementPreviewProps(null);
    patchElement(selectedElement.id, { props: resetChromaKey(selectedElement.props) });
  }, [patchElement, selectedElement, setDraftFields]);

  const buildAdvancedColorGradeProps = useCallback((field: AdvancedColorGradeField, value: readonly number[]) => {
    if (!selectedElement || (selectedElement.type !== "still" && selectedElement.type !== "video_clip")) return null;
    return commitAdvancedColorGradeFieldAtTime(selectedElement.props, selectedLocalPlayheadSec, field, value);
  }, [selectedElement, selectedLocalPlayheadSec]);

  const previewAdvancedColorGrade = useCallback((field: AdvancedColorGradeField, value: readonly number[]) => {
    setSelectedElementPreviewProps(buildAdvancedColorGradeProps(field, value));
  }, [buildAdvancedColorGradeProps]);

  const commitAdvancedColorGrade = useCallback((field: AdvancedColorGradeField, value: readonly number[]) => {
    if (!selectedElement) return;
    const props = buildAdvancedColorGradeProps(field, value);
    if (!props) return;
    setSelectedElementPreviewProps(null);
    patchElement(selectedElement.id, { props });
  }, [buildAdvancedColorGradeProps, patchElement, selectedElement]);

  const toggleAdvancedColorGradeKeyframeAtPlayhead = useCallback((field: AdvancedColorGradeField) => {
    if (!selectedElement || (selectedElement.type !== "still" && selectedElement.type !== "video_clip")) return;
    if (hasKeyframeAtTime(selectedElement.props, [field], selectedLocalPlayheadSec)) {
      patchElement(selectedElement.id, {
        props: removeColorGradeKeyframeAtTime(selectedElement.props, selectedLocalPlayheadSec, field),
      });
      return;
    }
    const draftProps = selectedElementPreviewProps ?? selectedElement.props;
    const grade = resolveColorGradeAtTime(draftProps, selectedLocalPlayheadSec);
    const value = field === "grade_lift_rgb" ? grade.liftRgb
      : field === "grade_gamma_rgb" ? grade.gammaRgb
        : field === "grade_gain_rgb" ? grade.gainRgb
          : grade.masterCurve;
    patchElement(selectedElement.id, {
      props: upsertAdvancedColorGradeKeyframe(draftProps, selectedLocalPlayheadSec, field, value),
    });
  }, [patchElement, selectedElement, selectedElementPreviewProps, selectedLocalPlayheadSec]);

  const resetColorGradeControls = useCallback(() => {
    if (!selectedElement || (selectedElement.type !== "still" && selectedElement.type !== "video_clip")) return;
    const identityDraft = colorGradeDraft(IDENTITY_COLOR_GRADE);
    for (const field of COLOR_GRADE_FIELDS) {
      setEditColorGrade(field, identityDraft[COLOR_GRADE_DRAFT_FIELD[field]]);
    }
    setSelectedElementPreviewProps(null);
    patchElement(selectedElement.id, { props: resetColorGrade(selectedElement.props) });
  }, [patchElement, selectedElement, setEditColorGrade]);

  const clearColorGradeKeyframes = useCallback(() => {
    if (!selectedElement || (selectedElement.type !== "still" && selectedElement.type !== "video_clip")) return;
    patchElement(selectedElement.id, { props: clearColorGradeKeyframesFromProps(selectedElement.props) });
  }, [patchElement, selectedElement]);

  const applyColorGradeLut = useCallback((asset: { assetId: string; sourceUrl: string } | null) => {
    if (!selectedElement || (selectedElement.type !== "still" && selectedElement.type !== "video_clip")) return;
    const props = asset
      ? writeColorGradeLutProps(selectedElement.props, asset)
      : resetColorGradeLutProps(selectedElement.props);
    setSelectedElementPreviewProps(null);
    patchElement(selectedElement.id, { props });
  }, [patchElement, selectedElement]);

  const previewColorGradeLutIntensity = useCallback((intensity: number) => {
    if (!selectedElement) return;
    setSelectedElementPreviewProps(commitColorGradeLutIntensityAtTime(selectedElement.props, selectedLocalPlayheadSec, intensity));
  }, [selectedElement, selectedLocalPlayheadSec]);

  const commitColorGradeLutIntensity = useCallback((intensity: number) => {
    if (!selectedElement) return;
    const props = commitColorGradeLutIntensityAtTime(selectedElement.props, selectedLocalPlayheadSec, intensity);
    setSelectedElementPreviewProps(null);
    patchElement(selectedElement.id, { props });
  }, [patchElement, selectedElement, selectedLocalPlayheadSec]);

  const lutIntensityKeyedAtPlayhead = selectedElement
    ? hasKeyframeAtTime(selectedElement.props, ["lut_intensity"], selectedLocalPlayheadSec)
    : false;

  const toggleColorGradeLutKeyframeAtPlayhead = useCallback(() => {
    if (!selectedElement || !readColorGradeLutProps(selectedElement.props)) return;
    if (hasKeyframeAtTime(selectedElement.props, ["lut_intensity"], selectedLocalPlayheadSec)) {
      patchElement(selectedElement.id, { props: removeKeyframesAtTime(selectedElement.props, ["lut_intensity"], selectedLocalPlayheadSec) });
      return;
    }
    const lut = resolveColorGradeLutAtTime(selectedElementPreviewProps ?? selectedElement.props, selectedLocalPlayheadSec);
    if (!lut) return;
    patchElement(selectedElement.id, { props: upsertKeyframe(selectedElement.props, "lut_intensity", selectedLocalPlayheadSec, lut.intensity) });
  }, [patchElement, selectedElement, selectedElementPreviewProps, selectedLocalPlayheadSec]);

  const buildMirrorMaskProps = useCallback((
    field: "center" | "height",
    nextValue?: string,
  ) => {
    if (!selectedElement || (selectedElement.type !== "still" && selectedElement.type !== "video_clip")) {
      return null;
    }
    const current = resolveMaskInsetAtTime(selectedElement.props, selectedLocalPlayheadSec);
    const currentBand = mirrorBandFromMaskInset(current);
    const centerRaw = field === "center" ? Number.parseFloat(nextValue ?? "") / 100 : currentBand.center;
    const heightRaw = field === "height" ? Number.parseFloat(nextValue ?? "") / 100 : currentBand.height;
    const mask = maskInsetFromMirrorBand(current, {
      center: Number.isFinite(centerRaw) ? centerRaw : currentBand.center,
      height: Number.isFinite(heightRaw) ? heightRaw : currentBand.height,
    });
    return { props: commitMaskInsetAtTime(selectedElement.props, selectedLocalPlayheadSec, mask), mask };
  }, [selectedElement, selectedLocalPlayheadSec]);

  const previewMirrorBand = useCallback((field: "center" | "height", nextValue?: string) => {
    setSelectedElementPreviewProps(buildMirrorMaskProps(field, nextValue)?.props ?? null);
  }, [buildMirrorMaskProps]);

  const commitMirrorBand = useCallback((field: "center" | "height", nextValue?: string) => {
    if (!selectedElement) return;
    const next = buildMirrorMaskProps(field, nextValue);
    if (!next) return;
    const mirror = mirrorBandFromMaskInset(next.mask);
    setEditMaskTop(String(Math.round(next.mask.top * 100)));
    setEditMaskBottom(String(Math.round(next.mask.bottom * 100)));
    setEditMirrorCenter(String(Math.round(mirror.center * 100)));
    setEditMirrorHeight(String(Math.round(mirror.height * 100)));
    setSelectedElementPreviewProps(null);
    patchElement(selectedElement.id, { props: next.props });
  }, [
    buildMirrorMaskProps,
    patchElement,
    selectedElement,
    setEditMaskBottom,
    setEditMaskTop,
    setEditMirrorCenter,
    setEditMirrorHeight,
  ]);

  const transformFieldKeyedAtPlayhead = Object.fromEntries(
    MEDIA_TRANSFORM_KEYFRAME_FIELDS.map((field) => [
      field,
      selectedElement
        ? hasKeyframeAtTime(selectedElement.props, [field], selectedLocalPlayheadSec)
        : false,
    ]),
  ) as Record<MediaTransformKeyframeField, boolean>;
  const maskKeyedAtPlayhead = selectedElement
    ? hasKeyframeAtTime(selectedElement.props, MEDIA_MASK_KEYFRAME_FIELDS, selectedLocalPlayheadSec)
    : false;
  const opacityKeyedAtPlayhead = selectedElement
    ? hasKeyframeAtTime(opacityElement?.props, MEDIA_OPACITY_KEYFRAME_FIELDS, opacityLocalPlayheadSec)
    : false;
  const transformKeyedAtPlayhead = MEDIA_TRANSFORM_KEYFRAME_FIELDS.every(
    (field) => transformFieldKeyedAtPlayhead[field],
  );

  const toggleTransformKeyframeAtPlayhead = useCallback((field: MediaTransformKeyframeField) => {
    if (!selectedElement || (selectedElement.type !== "still" && selectedElement.type !== "video_clip")) return;
    if (transformFieldKeyedAtPlayhead[field]) {
      patchElement(selectedElement.id, {
        props: removeKeyframesAtTime(selectedElement.props, [field], selectedLocalPlayheadSec),
      });
      return;
    }
    const draftProps = selectedElementPreviewProps ?? selectedElement.props;
    const transform = resolveMediaTransformAtTime(draftProps, selectedLocalPlayheadSec);
    const value = field === "media_scale"
      ? transform.scale
      : field === "media_offset_x"
        ? transform.offsetX
        : transform.offsetY;
    patchElement(selectedElement.id, {
      props: upsertKeyframe(draftProps, field, selectedLocalPlayheadSec, value),
    });
  }, [
    patchElement,
    selectedElement,
    selectedElementPreviewProps,
    selectedLocalPlayheadSec,
    transformFieldKeyedAtPlayhead,
  ]);

  const addTransformKeyframeAtPlayhead = useCallback(() => {
    if (!selectedElement || (selectedElement.type !== "still" && selectedElement.type !== "video_clip")) return;
    if (transformKeyedAtPlayhead) {
      patchElement(selectedElement.id, {
        props: removeKeyframesAtTime(
          selectedElement.props,
          MEDIA_TRANSFORM_KEYFRAME_FIELDS,
          selectedLocalPlayheadSec,
        ),
      });
      return;
    }
    const draftProps = selectedElementPreviewProps ?? selectedElement.props;
    const transform = resolveMediaTransformAtTime(draftProps, selectedLocalPlayheadSec);
    patchElement(selectedElement.id, {
      props: upsertMediaTransformKeyframes(draftProps, selectedLocalPlayheadSec, transform),
    });
  }, [patchElement, selectedElement, selectedElementPreviewProps, selectedLocalPlayheadSec, transformKeyedAtPlayhead]);

  const addMaskKeyframeAtPlayhead = useCallback(() => {
    if (!selectedElement || (selectedElement.type !== "still" && selectedElement.type !== "video_clip")) return;
    if (maskKeyedAtPlayhead) {
      patchElement(selectedElement.id, {
        props: removeKeyframesAtTime(selectedElement.props, MEDIA_MASK_KEYFRAME_FIELDS, selectedLocalPlayheadSec),
      });
      return;
    }
    const draftProps = selectedElementPreviewProps ?? selectedElement.props;
    const mask = resolveMaskInsetAtTime(draftProps, selectedLocalPlayheadSec);
    let next = upsertMaskInsetKeyframe(draftProps, selectedLocalPlayheadSec, mask);
    const feather = resolveMediaEffectAtTime(draftProps, selectedLocalPlayheadSec).maskFeather;
    next = upsertKeyframe(next, "mask_feather", selectedLocalPlayheadSec, feather);
    patchElement(selectedElement.id, {
      props: next,
    });
  }, [maskKeyedAtPlayhead, patchElement, selectedElement, selectedElementPreviewProps, selectedLocalPlayheadSec]);

  const addOpacityKeyframeAtPlayhead = useCallback(() => {
    if (!opacityElement || (opacityElement.type !== "still" && opacityElement.type !== "video_clip")) return;
    if (opacityKeyedAtPlayhead) {
      patchElement(opacityElement.id, {
        props: removeKeyframesAtTime(opacityElement.props, MEDIA_OPACITY_KEYFRAME_FIELDS, opacityLocalPlayheadSec),
      });
      return;
    }
    const draftProps = selectedVisualGroupPreviewProps?.[opacityElement.id]
      ?? (opacityElement.id === selectedElement?.id ? selectedElementPreviewProps : null)
      ?? opacityElement.props;
    const opacity = resolveMediaEffectAtTime(draftProps, opacityLocalPlayheadSec).opacity;
    patchElement(opacityElement.id, {
      props: upsertKeyframe(draftProps, "media_opacity", opacityLocalPlayheadSec, opacity),
    });
  }, [opacityElement, opacityKeyedAtPlayhead, opacityLocalPlayheadSec, patchElement, selectedElement?.id, selectedElementPreviewProps, selectedVisualGroupPreviewProps]);

  const resetMediaEffects = useCallback(() => {
    if (!selectedElement || (selectedElement.type !== "still" && selectedElement.type !== "video_clip")) return;
    let props = commitMediaEffectFieldAtTime(selectedElement.props, selectedLocalPlayheadSec, "opacity", 1);
    props = commitMediaEffectFieldAtTime(props, selectedLocalPlayheadSec, "maskFeather", 0);
    setEditMediaOpacity("100");
    setEditMaskFeather("0");
    setSelectedElementPreviewProps(null);
    patchElement(selectedElement.id, { props });
  }, [patchElement, selectedElement, selectedLocalPlayheadSec, setEditMaskFeather, setEditMediaOpacity]);

  const resetMaskInset = useCallback(() => {
    if (!selectedElement || (selectedElement.type !== "still" && selectedElement.type !== "video_clip")) return;
    const emptyMask = { top: 0, right: 0, bottom: 0, left: 0 };
    const props = commitMaskInsetAtTime(selectedElement.props, selectedLocalPlayheadSec, emptyMask);
    setEditMaskTop("0");
    setEditMaskRight("0");
    setEditMaskBottom("0");
    setEditMaskLeft("0");
    setEditMirrorCenter("50");
    setEditMirrorHeight("100");
    setSelectedElementPreviewProps(null);
    patchElement(selectedElement.id, { props });
  }, [
    patchElement,
    selectedElement,
    selectedLocalPlayheadSec,
    setEditMaskBottom,
    setEditMaskLeft,
    setEditMaskRight,
    setEditMaskTop,
    setEditMirrorCenter,
    setEditMirrorHeight,
  ]);

  const clearVisualKeyframes = useCallback(() => {
    if (!selectedElement || (selectedElement.type !== "still" && selectedElement.type !== "video_clip")) return;
    const members = compoundClipMembers(elements, selectedElement)
      .filter((element) => element.type === "still" || element.type === "video_clip");
    if (members.length > 1) {
      void patchElements(members.map((element) => ({ elementId: element.id, patch: { props: clearMediaKeyframes(element.props) } })));
      return;
    }
    patchElement(selectedElement.id, { props: clearMediaKeyframes(selectedElement.props) });
  }, [elements, patchElement, patchElements, selectedElement]);

  const resolvedVisualDraft = selectedElement && (selectedElement.type === "still" || selectedElement.type === "video_clip")
    ? (() => {
      const props = selectedElementPreviewProps ?? selectedElement.props;
      const transform = resolveMediaTransformAtTime(props, selectedLocalPlayheadSec);
      const mask = resolveMaskInsetAtTime(props, selectedLocalPlayheadSec);
      const opacityProps = opacityElement?.id === selectedElement.id
        ? props
        : selectedVisualGroupPreviewProps?.[opacityElement?.id ?? ""] ?? opacityElement?.props;
      const effect = resolveMediaEffectAtTime(props, selectedLocalPlayheadSec);
      const opacityEffect = resolveMediaEffectAtTime(opacityProps ?? props, opacityLocalPlayheadSec);
      const colorGrade = resolveColorGradeAtTime(props, selectedLocalPlayheadSec);
      const mirror = mirrorBandFromMaskInset(mask);
      return {
        editMediaScale: transform.scale.toFixed(2),
        editMediaOffsetX: transform.offsetX.toFixed(2),
        editMediaOffsetY: transform.offsetY.toFixed(2),
        editMediaOpacity: String(Math.round(opacityEffect.opacity * 100)),
        ...colorGradeDraft(colorGrade),
        ...chromaKeyDraft(resolveChromaKeyAtTime(props, selectedLocalPlayheadSec)),
        advancedColorGrade: colorGrade,
        colorGradeLut: resolveColorGradeLutAtTime(props, selectedLocalPlayheadSec),
        editMaskTop: String(Math.round(mask.top * 100)),
        editMaskRight: String(Math.round(mask.right * 100)),
        editMaskBottom: String(Math.round(mask.bottom * 100)),
        editMaskLeft: String(Math.round(mask.left * 100)),
        editMaskFeather: String(Math.round(effect.maskFeather * 100)),
        editMirrorCenter: String(Math.round(mirror.center * 100)),
        editMirrorHeight: String(Math.round(mirror.height * 100)),
      };
    })()
    : null;

  return {
    editStart: draft.editStart,
    setEditStart,
    editDuration: draft.editDuration,
    setEditDuration,
    editVolume: resolvedVolumePct,
    setEditVolume,
    editTrimStart: draft.editTrimStart,
    setEditTrimStart,
    editTrimEnd: draft.editTrimEnd,
    setEditTrimEnd,
    editFadeIn: draft.editFadeIn,
    setEditFadeIn,
    editFadeOut: draft.editFadeOut,
    setEditFadeOut,
    editAnimationIn: draft.editAnimationIn,
    setEditAnimationIn,
    editAnimationOut: draft.editAnimationOut,
    setEditAnimationOut,
    editAnimInDuration: draft.editAnimInDuration,
    setEditAnimInDuration,
    editAnimOutDuration: draft.editAnimOutDuration,
    setEditAnimOutDuration,
    commitAnimInDuration,
    commitAnimOutDuration,
    editCaptionText: draft.editCaptionText,
    setEditCaptionText,
    editCaptionPosition: draft.editCaptionPosition,
    setEditCaptionPosition,
    editCaptionFontPreset: draft.editCaptionFontPreset,
    setEditCaptionFontPreset,
    editCaptionStyleVariant: draft.editCaptionStyleVariant,
    setEditCaptionStyleVariant,
    editCaptionFontSize: draft.editCaptionFontSize,
    setEditCaptionFontSize,
    editCaptionAbsX: draft.editCaptionAbsX,
    setEditCaptionAbsX,
    editCaptionAbsY: draft.editCaptionAbsY,
    setEditCaptionAbsY,
    editMediaScale: resolvedVisualDraft?.editMediaScale ?? draft.editMediaScale,
    setEditMediaScale,
    editMediaOffsetX: resolvedVisualDraft?.editMediaOffsetX ?? draft.editMediaOffsetX,
    setEditMediaOffsetX,
    editMediaOffsetY: resolvedVisualDraft?.editMediaOffsetY ?? draft.editMediaOffsetY,
    setEditMediaOffsetY,
    editMediaOpacity: resolvedVisualDraft?.editMediaOpacity ?? draft.editMediaOpacity,
    setEditMediaOpacity,
    editColorGrade: Object.fromEntries(COLOR_GRADE_FIELDS.map((field) => {
      const draftField = COLOR_GRADE_DRAFT_FIELD[field];
      return [field, resolvedVisualDraft?.[draftField] ?? draft[draftField]];
    })) as Record<ColorGradeField, string>,
    advancedColorGrade: resolvedVisualDraft?.advancedColorGrade ?? IDENTITY_COLOR_GRADE,
    colorGradeLut: resolvedVisualDraft?.colorGradeLut ?? null,
    setEditColorGrade,
    editMaskFeather: resolvedVisualDraft?.editMaskFeather ?? draft.editMaskFeather,
    setEditMaskFeather,
    editMirrorCenter: resolvedVisualDraft?.editMirrorCenter ?? draft.editMirrorCenter,
    setEditMirrorCenter,
    editMirrorHeight: resolvedVisualDraft?.editMirrorHeight ?? draft.editMirrorHeight,
    setEditMirrorHeight,
    editMaskTop: resolvedVisualDraft?.editMaskTop ?? draft.editMaskTop,
    setEditMaskTop,
    editMaskRight: resolvedVisualDraft?.editMaskRight ?? draft.editMaskRight,
    setEditMaskRight,
    editMaskBottom: resolvedVisualDraft?.editMaskBottom ?? draft.editMaskBottom,
    setEditMaskBottom,
    editMaskLeft: resolvedVisualDraft?.editMaskLeft ?? draft.editMaskLeft,
    setEditMaskLeft,
    selectElement,
    commitStart,
    commitDuration,
    commitVolume,
    toggleVolumeKeyframeAtPlayhead,
    volumeKeyedAtPlayhead,
    commitTrimStart,
    commitTrimEnd,
    commitFadeIn,
    commitFadeOut,
    nudgeStart,
    previewSelectedEffectProps,
    patchSelectedElementProps,
    patchSelectedCaptionProps,
    commitCaptionText,
    commitCaptionFontSize,
    applyCaptionAbsPosition,
    commitCaptionAbsPos,
    commitCaptionPositionPreset,
    splitSelectedCaption,
    selectedElementPreviewProps: hydratedElementRef.current?.id === selectedElement?.id ? selectedElementPreviewProps : null,
    selectedVisualGroupPreviewProps: hydratedElementRef.current?.id === selectedElement?.id ? selectedVisualGroupPreviewProps : null,
    previewVisualTransform,
    clearVisualTransformPreview,
    commitVisualTransform,
    commitVisualTransformValues,
    resetVisualTransform,
    motionPreset,
    applyMotionPreset,
    previewMaskInset,
    commitMaskInset,
    previewMediaEffect,
    commitMediaEffect,
    previewColorGrade,
    commitColorGrade,
    resetColorGradeControls,
    toggleColorGradeKeyframeAtPlayhead,
    colorGradeKeyedAtPlayhead,
    editChromaKeyColor: resolvedVisualDraft?.editChromaKeyColor ?? draft.editChromaKeyColor,
    editChromaKeyTolerance: resolvedVisualDraft?.editChromaKeyTolerance ?? draft.editChromaKeyTolerance,
    editChromaKeySoftness: resolvedVisualDraft?.editChromaKeySoftness ?? draft.editChromaKeySoftness,
    editChromaKeySpill: resolvedVisualDraft?.editChromaKeySpill ?? draft.editChromaKeySpill,
    setEditChromaKey,
    previewChromaKey,
    commitChromaKey,
    resetChromaKeyControls,
    toggleChromaKeyKeyframeAtPlayhead,
    chromaKeyKeyedAtPlayhead,
    previewAdvancedColorGrade,
    commitAdvancedColorGrade,
    toggleAdvancedColorGradeKeyframeAtPlayhead,
    advancedColorGradeKeyedAtPlayhead,
    applyColorGradeLut,
    previewColorGradeLutIntensity,
    commitColorGradeLutIntensity,
    toggleColorGradeLutKeyframeAtPlayhead,
    lutIntensityKeyedAtPlayhead,
    clearColorGradeKeyframes,
    previewMirrorBand,
    commitMirrorBand,
    resetMediaEffects,
    resetMaskInset,
    addTransformKeyframeAtPlayhead,
    toggleTransformKeyframeAtPlayhead,
    addMaskKeyframeAtPlayhead,
    addOpacityKeyframeAtPlayhead,
    transformKeyedAtPlayhead,
    transformFieldKeyedAtPlayhead,
    maskKeyedAtPlayhead,
    opacityKeyedAtPlayhead,
    clearVisualKeyframes,
    selectedLocalPlayheadSec,
  };
}
