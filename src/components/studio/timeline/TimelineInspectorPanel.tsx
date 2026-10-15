"use client";

import { useEffect, useMemo, useState } from "react";

import type { CaptionFontPreset, CaptionPositionPreset, CaptionStyleVariant } from "@/lib/timeline/captions";
import { presetsForElementType, type AnimationPreset } from "@/lib/timeline/animation-presets";
import type { AdvancedColorGradeField, ColorGrade, ColorGradeField } from "@/lib/timeline/color-grade";
import type { ChromaKeyAmountField, ChromaKeyField } from "@/lib/timeline/chroma-key";
import type { ChromaKeyReviewMode } from "@/lib/timeline/chroma-key-review";
import type { CutoutReviewMode } from "@/lib/timeline/cutout-review";
import type { ColorGradeLut } from "@/lib/timeline/cube-lut";
import {
  elementAutomationValuesAtTime,
  hasElementAutomationMoments,
  volumeAutomationPointIndexAtTime,
  VOLUME_ENVELOPE_FIELD,
} from "@/lib/timeline/automation-keyframes";
import { resolveMediaEffectAtTime, resolveMediaTransformAtTime, upsertMediaTransformKeyframes, type MediaTransformKeyframeField } from "@/lib/timeline/media-transform";
import { hasKeyframeAtTime, readKeyframeMap, removeKeyframesAtTime, retimeKeyframeMoment, updateKeyframeAtTime, upsertKeyframe, resolveNumberKeyframe, resolveTupleKeyframe, writeKeyframeMap, type KeyframeEase, type KeyframeValue } from "@/lib/timeline/keyframes";
import { quantizeVisualFrameSpan } from "@/lib/timeline/frame-quantization";
import { retimeSpeedStep, setSpeedAtTime, SPEED_KEYFRAME_FIELD } from "@/lib/timeline/speed-steps";
import { insertEnvelopePoint, moveEnvelopePoint, readVolumeEnvelopePoints, writeVolumeEnvelopePatch } from "@/lib/timeline/volume-envelope";
import {
  compoundClipId,
  compoundClipMemberAtTime,
  compoundClipMembers,
  compoundClipPresentationElements,
} from "@/lib/timeline/compound-clips";
import type { IdentifiedMediaMotionPreset, MediaMotionPreset } from "@/lib/timeline/motion-presets";
import type { AudioEffectAction } from "@/lib/timeline/audio-effects";
import type {
  VideoStabilizationAction,
  VideoStabilizationMode,
} from "@/lib/timeline/video-stabilization";

import { SurfaceTrackingControls } from "./SurfaceTrackingControls";
import { CaptionMenu, CAPTION_INSPECTOR_TABS, type CaptionInspectorSubpanel } from "./CaptionMenu";
import { CreateTransitionMenu } from "./CreateTransitionMenu";
import { ElementMenu, type ElementInspectorSubpanel } from "./ElementMenu";
import { InspectorPanelTabs } from "./InspectorPanelTabs";
import { KeyframeStrip, KeyframeValuesPanel } from "./KeyframeInspector";
import { AddKeyframeControl, type AddKeyframeOption } from "./AddKeyframeControl";
import { getTransitionMaxDurationSeconds } from "@/lib/timeline/transitions";
import { transitionJoinAvailability } from "./useTimelineTransitions";
import { TransitionMenu } from "./TransitionMenu";
import type { TimelineElement, TimelineTransition, TimelineTransitionType } from "./types";

type TransitionCreateCandidate = {
  fromLabel: string;
  toLabel: string;
  fromElementId: string;
  toElementId: string;
} | null;

type CaptionWorkspaceSubpanel = CaptionInspectorSubpanel | "keyframe";

export type TimelineInspectorPanelProps = {
  beatControls?: (element: TimelineElement | null) => React.ReactNode;
  captionGeneration?: React.ReactNode;
  /** When set, restricts which sections render. Omit for default (all sections). */
  mode?: "element-only" | "transition-only";
  /** Layout direction for child menus. "vertical" stacks controls for side panels. */
  layout?: "horizontal" | "vertical";
  showAdvancedInspector?: boolean;
  showKeyframes?: boolean;
  inspectorDomain?: ElementInspectorSubpanel;
  onInspectorDomainChange?: (domain: ElementInspectorSubpanel) => void;
  selectedElement: TimelineElement | null;
  timelineElements: TimelineElement[];
  onSelectElement?: (elementId: string) => void;
  selectedElementCount: number;
  selectedCaptionCount: number;
  selectedTransition: TimelineTransition | null;
  outlineButtonClassName: string;
  editVolume: number;
  setEditVolume: (value: number) => void;
  editTrimStart: string;
  setEditTrimStart: (value: string) => void;
  editTrimEnd: string;
  setEditTrimEnd: (value: string) => void;
  editFadeIn: string;
  setEditFadeIn: (value: string) => void;
  editFadeOut: string;
  setEditFadeOut: (value: string) => void;
  editAnimationIn: AnimationPreset;
  setEditAnimationIn: (value: AnimationPreset) => void;
  editAnimationOut: AnimationPreset;
  setEditAnimationOut: (value: AnimationPreset) => void;
  editAnimInDuration: string;
  setEditAnimInDuration: (value: string) => void;
  editAnimOutDuration: string;
  setEditAnimOutDuration: (value: string) => void;
  commitAnimInDuration: (nextValue?: string) => void;
  commitAnimOutDuration: (nextValue?: string) => void;
  previewSelectedEffectProps: (patch: Record<string, unknown> | null, targetId?: string) => void;
  patchSelectedElementProps: (patch: Record<string, unknown>) => void;
  editMediaScale: string;
  setEditMediaScale: (value: string) => void;
  editMediaOffsetX: string;
  setEditMediaOffsetX: (value: string) => void;
  editMediaOffsetY: string;
  setEditMediaOffsetY: (value: string) => void;
  previewVisualTransform: (overrides?: { scale?: string; offsetX?: string; offsetY?: string }) => void;
  clearVisualTransformPreview: () => void;
  showPositionGrid?: boolean;
  onTogglePositionGrid?: () => void;
  commitVisualTransform: (field: "scale" | "offsetX" | "offsetY", nextValue?: string) => void;
  commitVisualTransformValues: (values: { scale: string; offsetX: string; offsetY: string }) => void | Promise<unknown>;
  resetVisualTransform: () => void;
  motionPreset: IdentifiedMediaMotionPreset;
  applyMotionPreset: (preset: MediaMotionPreset) => void;
  compositionDimensions: { width: number; height: number };
  editMaskTop: string;
  setEditMaskTop: (value: string) => void;
  editMaskRight: string;
  setEditMaskRight: (value: string) => void;
  editMaskBottom: string;
  setEditMaskBottom: (value: string) => void;
  editMaskLeft: string;
  setEditMaskLeft: (value: string) => void;
  previewMaskInset: (overrides?: Partial<Record<"top" | "right" | "bottom" | "left", string>>, rotation?: number) => void;
  commitMaskInset: (field: "top" | "right" | "bottom" | "left", nextValue?: string) => void;
  editMediaOpacity: string;
  setEditMediaOpacity: (value: string) => void;
  editMaskFeather: string;
  setEditMaskFeather: (value: string) => void;
  editMirrorCenter: string;
  setEditMirrorCenter: (value: string) => void;
  editMirrorHeight: string;
  setEditMirrorHeight: (value: string) => void;
  previewMediaEffect: (field: "opacity" | "maskFeather", nextValue?: string) => void;
  commitMediaEffect: (field: "opacity" | "maskFeather", nextValue?: string) => void;
  editColorGrade: Record<ColorGradeField, string>;
  setEditColorGrade: (field: ColorGradeField, value: string) => void;
  previewColorGrade: (field: ColorGradeField, nextValue?: string) => void;
  commitColorGrade: (field: ColorGradeField, nextValue?: string) => void;
  resetColorGradeControls: () => void;
  toggleColorGradeKeyframeAtPlayhead: (field: ColorGradeField) => void;
  colorGradeKeyedAtPlayhead: Record<ColorGradeField, boolean>;
  clearColorGradeKeyframes: () => void;
  editChromaKeyColor: string;
  editChromaKeyTolerance: string;
  editChromaKeySoftness: string;
  editChromaKeySpill: string;
  setEditChromaKey: (field: ChromaKeyAmountField, value: string) => void;
  previewChromaKey: (field: ChromaKeyField, nextValue?: string) => void;
  commitChromaKey: (field: ChromaKeyField, nextValue?: string) => void;
  resetChromaKeyControls: () => void;
  toggleChromaKeyKeyframeAtPlayhead: (field: ChromaKeyAmountField) => void;
  chromaKeyKeyedAtPlayhead: Record<ChromaKeyAmountField, boolean>;
  advancedColorGrade: ColorGrade;
  previewAdvancedColorGrade: (field: AdvancedColorGradeField, value: readonly number[]) => void;
  commitAdvancedColorGrade: (field: AdvancedColorGradeField, value: readonly number[]) => void;
  toggleAdvancedColorGradeKeyframeAtPlayhead: (field: AdvancedColorGradeField) => void;
  advancedColorGradeKeyedAtPlayhead: Record<AdvancedColorGradeField, boolean>;
  colorGradeLut: ColorGradeLut | null;
  applyColorGradeLut: (asset: { assetId: string; sourceUrl: string } | null) => void;
  previewColorGradeLutIntensity: (intensity: number) => void;
  commitColorGradeLutIntensity: (intensity: number) => void;
  toggleColorGradeLutKeyframeAtPlayhead: () => void;
  lutIntensityKeyedAtPlayhead: boolean;
  cutoutReviewMode: CutoutReviewMode;
  chromaKeyReviewMode: ChromaKeyReviewMode;
  setChromaKeyReviewMode: (mode: ChromaKeyReviewMode) => void;
  setCutoutReviewMode: (mode: CutoutReviewMode) => void;
  previewMirrorBand: (field: "center" | "height", nextValue?: string) => void;
  commitMirrorBand: (field: "center" | "height", nextValue?: string) => void;
  resetMediaEffects: () => void;
  resetMaskInset: () => void;
  addTransformKeyframeAtPlayhead: () => void;
  toggleTransformKeyframeAtPlayhead: (field: MediaTransformKeyframeField) => void;
  addMaskKeyframeAtPlayhead: () => void;
  addOpacityKeyframeAtPlayhead: () => void;
  transformKeyedAtPlayhead: boolean;
  transformFieldKeyedAtPlayhead: Record<MediaTransformKeyframeField, boolean>;
  maskKeyedAtPlayhead: boolean;
  opacityKeyedAtPlayhead: boolean;
  clearVisualKeyframes: () => void;
  selectedLocalPlayheadSec: number;
  timelinePlayheadSec: number;
  onSeekTimelineSeconds: (seconds: number) => void;
  editCaptionText: string;
  setEditCaptionText: (value: string) => void;
  editCaptionFontPreset: CaptionFontPreset;
  setEditCaptionFontPreset: (value: CaptionFontPreset) => void;
  editCaptionStyleVariant: CaptionStyleVariant;
  setEditCaptionStyleVariant: (value: CaptionStyleVariant) => void;
  editCaptionFontSize: string;
  setEditCaptionFontSize: (value: string) => void;
  editCaptionAbsX: string;
  setEditCaptionAbsX: (value: string) => void;
  editCaptionAbsY: string;
  setEditCaptionAbsY: (value: string) => void;
  setEditCaptionPosition: (value: CaptionPositionPreset) => void;
  editStart: string;
  setEditStart: (value: string) => void;
  commitStart: () => void;
  editDuration: string;
  setEditDuration: (value: string) => void;
  previewDuration?: (nextValue: string) => void;
  commitDuration: (nextValue?: string) => void;
  commitVolume: (pct: number) => void;
  toggleVolumeKeyframeAtPlayhead: () => void;
  volumeKeyedAtPlayhead: boolean;
  commitTrimStart: (nextValue?: string) => void;
  commitTrimEnd: (nextValue?: string) => void;
  commitFadeIn: (nextValue?: string) => void;
  commitFadeOut: (nextValue?: string) => void;
  patchSelectedCaptionProps: (patch: Record<string, unknown>) => void;
  commitCaptionText: () => void;
  commitCaptionFontSize: (nextValue?: string) => void;
  applyCaptionAbsPosition: (nextAbsX: number, nextAbsY: number) => void;
  commitCaptionAbsPos: (axis: "x" | "y", nextValue?: string) => void;
  commitCaptionPositionPreset: (preset: CaptionPositionPreset) => void;
  updatePlaybackRate: (elementId: string, nextPlaybackRate: number) => { duration: number } | null;
  previewPlaybackRate?: (elementId: string, nextPlaybackRate: number) => void;
  clearPlaybackRatePreview?: () => void;
  patchElement: (elementId: string, patch: Record<string, unknown>) => void | Promise<unknown>;
  resetElement: (elementId: string) => void | Promise<unknown>;
  normalizeElementLoudness: (elementId: string) => void | Promise<unknown>;
  applyAudioEffect: (
    elementId: string,
    action: AudioEffectAction,
    options?: { strength?: number },
  ) => void | Promise<unknown>;
  applyVideoStabilization: (
    elementId: string,
    action: VideoStabilizationAction,
    options?: { mode?: VideoStabilizationMode; strength?: number },
  ) => void | Promise<unknown>;
  deleteElement: (elementId: string) => void | Promise<unknown>;
  previewTransition?: (id: string, params: import("./types").TimelineTransitionParams | null) => void;
  patchTransition: (transitionId: string, patch: Record<string, unknown>) => void | Promise<unknown>;
  deleteTransition: (transitionId: string) => void | Promise<unknown>;
  transitionFromLabel: string;
  transitionToLabel: string;
  transitionCreateCandidate: TransitionCreateCandidate;
  onOpenTransitionJoin?: (from: string, to: string) => void;
  outgoingTransitionId?: string;
  onSelectTransition?: (id: string) => void;
  createTransitionForPair: (fromElementId: string, toElementId: string, type?: TimelineTransitionType) => void | Promise<unknown>;
  hasTransitionIn: boolean;
  hasTransitionOut: boolean;
  applySelectedCaptionStyleToLane: () => Promise<void>;
};

export function TimelineInspectorPanel(props: TimelineInspectorPanelProps) {
  const { selectedElement, selectedTransition, mode } = props;
  const [localInspectorSubpanel, setLocalInspectorSubpanel] = useState<ElementInspectorSubpanel>("position");
  const elementInspectorSubpanel = props.inspectorDomain ?? localInspectorSubpanel;
  const setElementInspectorSubpanel = (next: ElementInspectorSubpanel | ((current: ElementInspectorSubpanel) => ElementInspectorSubpanel)) => {
    const domain = typeof next === "function" ? next(elementInspectorSubpanel) : next;
    setLocalInspectorSubpanel(domain);
    props.onInspectorDomainChange?.(domain);
  };
  const [captionInspectorSubpanel, setCaptionInspectorSubpanel] = useState<CaptionWorkspaceSubpanel>("text");
  const [selectedKeyframeTimeSeconds, setSelectedKeyframeTimeSeconds] = useState<number | null>(null);
  const selectedIsCameraReveal =
    selectedElement?.type === "caption_text"
    && selectedElement.props?.styleVariant === "camera_reveal";
  const selectedCompoundId = compoundClipId(selectedElement);
  const keyframeElement = useMemo(() => {
    if (!selectedElement || !selectedCompoundId) return selectedElement;
    return compoundClipPresentationElements(props.timelineElements)
      .find((element) => compoundClipId(element) === selectedCompoundId)
      ?? selectedElement;
  }, [props.timelineElements, selectedCompoundId, selectedElement]);
  const compoundKeyframeMembers = useMemo(
    () => selectedCompoundId ? compoundClipMembers(props.timelineElements, selectedCompoundId) : [],
    [props.timelineElements, selectedCompoundId],
  );
  const isCompoundKeyframeView = Boolean(selectedElement && keyframeElement && keyframeElement.duration !== selectedElement.duration);

  const keyframeTargetAt = (compoundLocalTimeSeconds: number, field?: string) => {
    if (!selectedElement || !keyframeElement || !isCompoundKeyframeView) {
      return selectedElement
        ? { element: selectedElement, localTimeSeconds: compoundLocalTimeSeconds }
        : null;
    }
    const absoluteTimeSeconds = keyframeElement.timeline_start + compoundLocalTimeSeconds;
    const exactOwner = compoundKeyframeMembers.find((member) => {
      const localTimeSeconds = absoluteTimeSeconds - member.timeline_start;
      const values = elementAutomationValuesAtTime(member, localTimeSeconds);
      return field ? values.some((value) => value.field === field) : values.length > 0;
    });
    const element = exactOwner
      ?? compoundClipMemberAtTime(props.timelineElements, selectedElement, absoluteTimeSeconds)
      ?? selectedElement;
    return {
      element,
      localTimeSeconds: Math.max(0, Math.min(element.duration, absoluteTimeSeconds - element.timeline_start)),
    };
  };

  const showTransitions = mode !== "element-only";
  const showElement = mode !== "transition-only";
  const keyframeUiVisible = Boolean(
    props.showKeyframes !== false
    && keyframeElement
    && hasElementAutomationMoments(keyframeElement),
  );

  useEffect(() => {
    setSelectedKeyframeTimeSeconds(null);
  }, [selectedElement?.id]);

  useEffect(() => {
    if (selectedKeyframeTimeSeconds == null || !keyframeElement || !selectedElement) return;
    const selectedMomentStillExists = keyframeUiVisible
      && elementAutomationValuesAtTime(keyframeElement, selectedKeyframeTimeSeconds).length > 0;
    if (selectedMomentStillExists) return;
    setSelectedKeyframeTimeSeconds(null);
    if (selectedElement.type === "caption_text") {
      setCaptionInspectorSubpanel((current) => current === "keyframe" ? "text" : current);
    } else {
      setElementInspectorSubpanel((current) => current === "keyframe" ? "position" : current);
    }
  }, [keyframeElement, keyframeUiVisible, selectedElement, selectedKeyframeTimeSeconds]);

  useEffect(() => {
    // The player lands on whole frames, so a keyframe between frames stays selected until the playhead
    // leaves its frame. A keyframe on the clip's end may land on the last frame before it.
    if (selectedKeyframeTimeSeconds == null || !keyframeElement) return;
    const localTime = props.timelinePlayheadSec - keyframeElement.timeline_start;
    const onFrame = (time: number) => Math.abs(localTime - time) < 1 / 30 - 1e-4;
    if (!onFrame(selectedKeyframeTimeSeconds) && !onFrame(Math.min(selectedKeyframeTimeSeconds, keyframeElement.duration - 1 / 30))) {
      setSelectedKeyframeTimeSeconds(null);
    }
  }, [props.timelinePlayheadSec, keyframeElement, selectedKeyframeTimeSeconds]);

  const selectKeyframe = (timeSeconds: number) => {
    if (!selectedElement || !keyframeElement) return;
    setSelectedKeyframeTimeSeconds(timeSeconds);
    props.onSeekTimelineSeconds(keyframeElement.timeline_start + timeSeconds);

  };

  const retimeKeyframe = (fromTimeSeconds: number, toTimeSeconds: number) => {
    if (!selectedElement || !keyframeElement) return;
    const fromTarget = keyframeTargetAt(fromTimeSeconds);
    if (!fromTarget) return;
    const target = fromTarget.element;
    const targetOffset = target.timeline_start - keyframeElement.timeline_start;
    const targetToTimeSeconds = Math.max(0, Math.min(target.duration, toTimeSeconds - targetOffset));
    const includesSpeed = target.type === "video_clip"
      && hasKeyframeAtTime(target.props, [SPEED_KEYFRAME_FIELD], fromTarget.localTimeSeconds);
    const speedResult = includesSpeed
      ? retimeSpeedStep(target, fromTarget.localTimeSeconds, targetToTimeSeconds)
      : null;
    const volumePointIndex = volumeAutomationPointIndexAtTime(target, fromTarget.localTimeSeconds);
    const envelopeDuration = speedResult?.duration ?? target.duration;
    const movedVolumePoints = volumePointIndex >= 0
      ? moveEnvelopePoint(
          readVolumeEnvelopePoints(target, target.duration),
          volumePointIndex,
          targetToTimeSeconds,
          readVolumeEnvelopePoints(target, target.duration)[volumePointIndex]!.volume,
        )
      : null;
    const volumePatch = movedVolumePoints
      ? writeVolumeEnvelopePatch(
          { ...target, props: speedResult?.props ?? target.props },
          movedVolumePoints,
          envelopeDuration,
        )
      : null;
    const result = retimeKeyframeMoment(
      volumePatch?.props ?? speedResult?.props ?? target.props,
      fromTarget.localTimeSeconds,
      targetToTimeSeconds,
      envelopeDuration,
      30,
      speedResult ? [SPEED_KEYFRAME_FIELD] : [],
    );
    if (speedResult || volumePatch) {
      const duration = speedResult
        ? quantizeVisualFrameSpan(target.timeline_start, speedResult.duration).duration
        : null;
      void props.patchElement(target.id, {
        props: result.props,
        ...(volumePatch ? { volume: volumePatch.volume } : {}),
        ...(duration != null ? { duration } : {}),
      });
      const volumeTime = movedVolumePoints?.[volumePointIndex]?.time_seconds;
      selectKeyframe(targetOffset + (speedResult?.timeSeconds ?? volumeTime ?? result.timeSeconds));
      return;
    }
    void props.patchElement(target.id, { props: result.props });
    selectKeyframe(targetOffset + result.timeSeconds);
  };

  const deleteSelectedKeyframe = () => {
    if (!selectedElement || selectedKeyframeTimeSeconds == null) return;
    const target = keyframeTargetAt(selectedKeyframeTimeSeconds);
    if (!target) return;
    const values = elementAutomationValuesAtTime(target.element, target.localTimeSeconds);
    const fields = values.filter(({ field }) => field !== VOLUME_ENVELOPE_FIELD).map(({ field }) => field);
    const volumePointIndex = volumeAutomationPointIndexAtTime(target.element, target.localTimeSeconds);
    const points = readVolumeEnvelopePoints(target.element, target.element.duration);
    const canDeleteVolume = volumePointIndex > 0 && volumePointIndex < points.length - 1;
    if (fields.length === 0 && !canDeleteVolume) return;
    const nextProps = fields.length > 0
      ? removeKeyframesAtTime(target.element.props, fields, target.localTimeSeconds)
      : { ...(target.element.props ?? {}) };
    if (canDeleteVolume) {
      const patch = writeVolumeEnvelopePatch(
        { ...target.element, props: nextProps },
        points.filter((_, index) => index !== volumePointIndex),
        target.element.duration,
      );
      void props.patchElement(target.element.id, patch);
    } else {
      void props.patchElement(target.element.id, { props: nextProps });
    }
    setSelectedKeyframeTimeSeconds(null);

  };

  const deleteSelectedKeyframeField = (field: string) => {
    if (!selectedElement || selectedKeyframeTimeSeconds == null) return;
    const target = keyframeTargetAt(selectedKeyframeTimeSeconds, field);
    if (!target) return;
    if (field === VOLUME_ENVELOPE_FIELD) {
      const points = readVolumeEnvelopePoints(target.element, target.element.duration);
      const pointIndex = volumeAutomationPointIndexAtTime(target.element, target.localTimeSeconds);
      if (pointIndex <= 0 || pointIndex >= points.length - 1) return;
      void props.patchElement(target.element.id, writeVolumeEnvelopePatch(
        target.element,
        points.filter((_, index) => index !== pointIndex),
        target.element.duration,
      ));
      return;
    }
    const values = elementAutomationValuesAtTime(target.element, target.localTimeSeconds);
    if (values.length <= 1) {
      deleteSelectedKeyframe();
      return;
    }
    void props.patchElement(target.element.id, {
      props: removeKeyframesAtTime(target.element.props, [field], target.localTimeSeconds),
    });
  };

  const previewSelectedKeyframeValue = (field: string, value: KeyframeValue | null) => {
    if (value == null) { props.previewSelectedEffectProps(null); return; }
    if (selectedKeyframeTimeSeconds == null || field === SPEED_KEYFRAME_FIELD) return;
    const target = keyframeTargetAt(selectedKeyframeTimeSeconds, field);
    if (!target) return;
    if (field === VOLUME_ENVELOPE_FIELD && typeof value === "number") {
      const index = volumeAutomationPointIndexAtTime(target.element, target.localTimeSeconds);
      if (index < 0) return;
      const patch = writeVolumeEnvelopePatch(target.element,
        moveEnvelopePoint(readVolumeEnvelopePoints(target.element, target.element.duration), index, target.localTimeSeconds, value), target.element.duration);
      props.previewSelectedEffectProps(patch.props, target.element.id);
    } else {
      props.previewSelectedEffectProps(updateKeyframeAtTime(target.element.props, field, target.localTimeSeconds, { value }), target.element.id);
    }
  };

  const changeSelectedKeyframeValue = (field: string, value: KeyframeValue) => {
    if (selectedKeyframeTimeSeconds == null) return;
    const target = keyframeTargetAt(selectedKeyframeTimeSeconds, field);
    if (!target) return;
    if (field === VOLUME_ENVELOPE_FIELD && typeof value === "number") {
      const pointIndex = volumeAutomationPointIndexAtTime(target.element, target.localTimeSeconds);
      if (pointIndex < 0) return;
      void props.patchElement(target.element.id, writeVolumeEnvelopePatch(
        target.element,
        moveEnvelopePoint(readVolumeEnvelopePoints(target.element, target.element.duration), pointIndex, target.localTimeSeconds, value),
        target.element.duration,
      ));
      return;
    }
    if (field === SPEED_KEYFRAME_FIELD && typeof value === "number" && target.element.type === "video_clip") {
      const result = setSpeedAtTime(target.element, target.localTimeSeconds, value);
      const duration = quantizeVisualFrameSpan(target.element.timeline_start, result.duration).duration;
      void props.patchElement(target.element.id, {
        playback_rate: result.playbackRate,
        props: result.props,
        duration,
      });
      return;
    }
    void props.patchElement(target.element.id, {
      props: updateKeyframeAtTime(target.element.props, field, target.localTimeSeconds, { value }),
    });
  };

  const addSelectedKeyframeField = (field: string) => {
    if (selectedKeyframeTimeSeconds == null || field === SPEED_KEYFRAME_FIELD) return;
    const target = keyframeTargetAt(selectedKeyframeTimeSeconds, field);
    if (!target) return;
    const points = readKeyframeMap(target.element.props)[field];
    if (!points?.length || hasKeyframeAtTime(target.element.props, [field], target.localTimeSeconds)) return;
    const time = target.localTimeSeconds;
    const fallback = points[0]!.v;
    const value = typeof fallback === "number"
      ? resolveNumberKeyframe(target.element.props, field, time, fallback)
      : resolveTupleKeyframe(target.element.props, field, time, fallback);
    const ease = points.filter((point) => point.t <= time).at(-1)?.ease ?? points[0]!.ease ?? "linear";
    void props.patchElement(target.element.id, { props: upsertKeyframe(target.element.props, field, time, value, ease) });
  };

  const changeSelectedKeyframeEase = (field: string, ease: KeyframeEase) => {
    if (selectedKeyframeTimeSeconds == null) return;
    const target = keyframeTargetAt(selectedKeyframeTimeSeconds, field);
    if (!target) return;
    void props.patchElement(target.element.id, {
      props: updateKeyframeAtTime(target.element.props, field, target.localTimeSeconds, { ease }),
    });
  };

  const transitionFrom = props.timelineElements.find(element => element.id === selectedTransition?.from_element_id);
  const transitionTo = props.timelineElements.find(element => element.id === selectedTransition?.to_element_id);
  const transitionMaxDuration = transitionFrom && transitionTo ? getTransitionMaxDurationSeconds(transitionFrom, transitionTo) : 2;

  if (showTransitions && selectedTransition && !selectedElement) {
    return (
      <TransitionMenu
        layout={props.layout}
        transition={selectedTransition}
        maxDurationSeconds={transitionMaxDuration}
        fromLabel={props.transitionFromLabel}
        toLabel={props.transitionToLabel}
        patchTransition={props.patchTransition}
        previewTransition={props.previewTransition}
        deleteTransition={props.deleteTransition}
      />
    );
  }

  const availablePresets = presetsForElementType(selectedElement?.type ?? "");
  // Resolve the actual member beneath the playhead, not the first member of a compound.
  const addElement = selectedElement
    ? compoundClipMemberAtTime(props.timelineElements, selectedElement, props.timelinePlayheadSec) ?? selectedElement
    : null;
  const addTime = addElement ? Math.max(0, Math.min(addElement.duration, props.timelinePlayheadSec - addElement.timeline_start)) : 0;
  const addKeyframeOptions: AddKeyframeOption[] = [];
  const animatedFields = Object.keys(readKeyframeMap(addElement?.props)).filter((field) => field !== SPEED_KEYFRAME_FIELD);
  if (addElement && (animatedFields.length > 0 || Array.isArray(addElement.props?.volume_envelope))) {
    const selectedElement = addElement;
    const time = addTime;
    const hasVolume = Array.isArray(selectedElement.props?.volume_envelope);
    addKeyframeOptions.push({
      id: "animated", label: "Animated properties",
      exists: animatedFields.every((field) => hasKeyframeAtTime(selectedElement.props, [field], time))
        && (!hasVolume || volumeAutomationPointIndexAtTime(selectedElement, time) >= 0),
      add: () => {
        const map = readKeyframeMap(selectedElement.props);
        for (const field of animatedFields) {
          if (hasKeyframeAtTime(selectedElement.props, [field], time)) continue;
          const fallback = map[field]![0]!.v;
          const value = typeof fallback === "number"
            ? resolveNumberKeyframe(selectedElement.props, field, time, fallback)
            : resolveTupleKeyframe(selectedElement.props, field, time, fallback);
          const ease = map[field]!.filter((point) => point.t <= time).at(-1)?.ease ?? "linear";
          map[field]!.push({ t: time, v: value, ease });
        }
        const nextProps = writeKeyframeMap(selectedElement.props, map);
        const patch = hasVolume
          ? writeVolumeEnvelopePatch({ ...selectedElement, props: nextProps }, insertEnvelopePoint(readVolumeEnvelopePoints(selectedElement, selectedElement.duration), time), selectedElement.duration)
          : { props: nextProps };
        void props.patchElement(selectedElement.id, patch);
      },
    });
  }
  if (addKeyframeOptions.length === 0 && (addElement?.type === "still" || addElement?.type === "video_clip")) {
    addKeyframeOptions.push({ id: "visual", label: "Visual properties", exists: false, add: () => {
      const next = upsertMediaTransformKeyframes(addElement.props, addTime, resolveMediaTransformAtTime(addElement.props, addTime));
      const map = readKeyframeMap(next);
      map.media_opacity = [{ t: addTime, v: resolveMediaEffectAtTime(addElement.props, addTime).opacity, ease: "linear" }];
      void props.patchElement(addElement.id, { props: writeKeyframeMap(next, map) });
    } });
  }
  if (selectedElement && ["music", "sound_effect", "vo_segment", "vo_full", "video_clip"].includes(selectedElement.type)
    && selectedElement.props?.runtime_source_has_audio !== false) {
    addKeyframeOptions.push({ id: "volume", label: "Volume", exists: props.volumeKeyedAtPlayhead, add: props.toggleVolumeKeyframeAtPlayhead });
  }
  const nextJoin = transitionJoinAvailability(selectedElement, props.timelineElements, []);
  const transitionContent = showTransitions && selectedElement && (selectedElement.type === "still" || selectedElement.type === "video_clip") ? (
    <div className="grid gap-2 px-3.5 py-3 text-xs text-[var(--ink-secondary)]">
      {props.outgoingTransitionId ? <button type="button" className="text-left underline" onClick={() => props.onSelectTransition?.(props.outgoingTransitionId!)}>Edit transition to next clip</button>
        : nextJoin.candidate ? <button type="button" className="text-left underline" onClick={() => props.onOpenTransitionJoin?.(nextJoin.candidate!.fromElementId, nextJoin.candidate!.toElementId)}>Transition to next clip: {nextJoin.candidate.toLabel}</button>
        : <p className="m-0">{nextJoin.reason}</p>}
    </div>
  ) : null;

  return (
    <>
      {showElement && selectedElement && keyframeElement && props.showKeyframes !== false && (keyframeUiVisible || addKeyframeOptions.length > 0) ? (
        <KeyframeStrip
          element={keyframeElement}
          playheadSeconds={props.timelinePlayheadSec - keyframeElement.timeline_start}
          onSeek={(time) => {
            setSelectedKeyframeTimeSeconds(null);
            setElementInspectorSubpanel((current) => current === "keyframe" ? "position" : current);
            setCaptionInspectorSubpanel((current) => current === "keyframe" ? "text" : current);
            props.onSeekTimelineSeconds(keyframeElement.timeline_start + time);
          }}
          addControl={<AddKeyframeControl key={selectedElement.id} options={addKeyframeOptions} />}
          selectedTimeSeconds={selectedKeyframeTimeSeconds}
          onSelect={selectKeyframe}
          onRetime={retimeKeyframe}
        >
          {selectedKeyframeTimeSeconds != null && <KeyframeValuesPanel
            element={keyframeElement}
            timeSeconds={selectedKeyframeTimeSeconds}
            onChangeValue={changeSelectedKeyframeValue}
            onPreviewValue={previewSelectedKeyframeValue}
            onChangeEase={changeSelectedKeyframeEase}
            onDeleteField={deleteSelectedKeyframeField}
            onDeleteMoment={deleteSelectedKeyframe}
            onAddField={addSelectedKeyframeField}
          />}
        </KeyframeStrip>
      ) : null}
      {showTransitions && (props.layout !== "vertical" || !selectedElement) && (
        selectedTransition ? (
          <TransitionMenu
            layout={props.layout}
            transition={selectedTransition}
        maxDurationSeconds={transitionMaxDuration}
            fromLabel={props.transitionFromLabel}
            toLabel={props.transitionToLabel}
            patchTransition={props.patchTransition}
        previewTransition={props.previewTransition}
            deleteTransition={props.deleteTransition}
          />
        ) : props.transitionCreateCandidate ? (
          <CreateTransitionMenu
            layout={props.layout}
            fromLabel={props.transitionCreateCandidate.fromLabel}
            toLabel={props.transitionCreateCandidate.toLabel}
            onCreateTransition={(type) =>
              props.createTransitionForPair(
                props.transitionCreateCandidate!.fromElementId,
                props.transitionCreateCandidate!.toElementId,
                type,
              )}
          />
        ) : null
      )}

      {showElement && props.layout === "vertical" && selectedElement?.type === "caption_text" ? (
        <InspectorPanelTabs
          sticky
          ariaLabel="Caption inspector panels"
          tabs={CAPTION_INSPECTOR_TABS.filter(tab => !selectedElement.props?.surface_track || tab.id !== "motion")}
          value={captionInspectorSubpanel === "keyframe" || (selectedElement.props?.surface_track && captionInspectorSubpanel === "motion") ? "text" : captionInspectorSubpanel}
          onValueChange={setCaptionInspectorSubpanel}
        />
      ) : null}

      {showElement && props.layout === "vertical" && selectedElement?.type === "caption_text" ? (
        <CaptionMenu
          surfaceTracking={<SurfaceTrackingControls key={selectedElement.id} element={selectedElement} elements={props.timelineElements} onPatch={props.patchSelectedCaptionProps} />}
          layout={props.layout}
          showInspectorTabs={false}
          inspectorSubpanel={captionInspectorSubpanel === "keyframe" || (selectedElement.props?.surface_track && captionInspectorSubpanel === "motion") ? "text" : captionInspectorSubpanel}
          onInspectorSubpanelChange={setCaptionInspectorSubpanel}
          selectedElement={selectedElement}
          selectedElementCount={props.selectedCaptionCount}
          editCaptionText={props.editCaptionText}
          setEditCaptionText={props.setEditCaptionText}
          editCaptionFontPreset={props.editCaptionFontPreset}
          setEditCaptionFontPreset={props.setEditCaptionFontPreset}
          editCaptionStyleVariant={props.editCaptionStyleVariant}
          setEditCaptionStyleVariant={props.setEditCaptionStyleVariant}
          editCaptionFontSize={props.editCaptionFontSize}
          setEditCaptionFontSize={props.setEditCaptionFontSize}
          editCaptionAbsX={props.editCaptionAbsX}
          setEditCaptionAbsX={props.setEditCaptionAbsX}
          editCaptionAbsY={props.editCaptionAbsY}
          setEditCaptionAbsY={props.setEditCaptionAbsY}
          setEditCaptionPosition={props.setEditCaptionPosition}
          patchSelectedCaptionProps={props.patchSelectedCaptionProps}
          previewSelectedCaptionProps={props.previewSelectedEffectProps}
          commitCaptionText={props.commitCaptionText}
          commitCaptionFontSize={props.commitCaptionFontSize}
          applyCaptionAbsPosition={props.applyCaptionAbsPosition}
          commitCaptionAbsPos={props.commitCaptionAbsPos}
          commitCaptionPositionPreset={props.commitCaptionPositionPreset}
          applySelectedCaptionStyleToLane={props.applySelectedCaptionStyleToLane}
        />
      ) : null}

      {showElement && selectedElement && (
        props.layout !== "vertical"
        || selectedElement.type !== "caption_text"
        || captionInspectorSubpanel === "timing"
        || (!selectedElement.props?.surface_track && captionInspectorSubpanel === "motion")
      ) ? (
        <ElementMenu
          showAdvancedInspector={props.showAdvancedInspector}
          showKeyframes={props.showKeyframes}
          layout={props.layout}
          showInspectorTabs={selectedElement.type !== "caption_text"}
          transitionContent={selectedElement.type === "still" || selectedElement.type === "video_clip" ? transitionContent : undefined}
          beatControls={props.beatControls?.(selectedElement)}
          captionGeneration={selectedElement.type === "video_clip" ? props.captionGeneration : undefined}
          inspectorSubpanel={selectedElement.type === "caption_text" ? !selectedElement.props?.surface_track && captionInspectorSubpanel === "motion" ? "motion" : "timing" : elementInspectorSubpanel}
          onInspectorSubpanelChange={selectedElement.type === "caption_text" ? undefined : setElementInspectorSubpanel}
          selectedKeyframeTimeSeconds={selectedKeyframeTimeSeconds}
          keyframeElement={keyframeElement}
          onChangeSelectedKeyframeValue={isCompoundKeyframeView ? changeSelectedKeyframeValue : undefined}
          onChangeSelectedKeyframeEase={isCompoundKeyframeView ? changeSelectedKeyframeEase : undefined}
          onDeleteSelectedKeyframeField={isCompoundKeyframeView ? deleteSelectedKeyframeField : undefined}
          onDeleteSelectedKeyframe={deleteSelectedKeyframe}
          selectedElement={selectedElement}
          timelineElements={props.timelineElements}
          onSelectElement={props.onSelectElement}
          outlineButtonClassName={props.outlineButtonClassName}
          editVolume={props.editVolume}
          setEditVolume={props.setEditVolume}
          editTrimStart={props.editTrimStart}
          setEditTrimStart={props.setEditTrimStart}
          editTrimEnd={props.editTrimEnd}
          setEditTrimEnd={props.setEditTrimEnd}
          editFadeIn={props.editFadeIn}
          setEditFadeIn={props.setEditFadeIn}
          editFadeOut={props.editFadeOut}
          setEditFadeOut={props.setEditFadeOut}
          editAnimationIn={props.editAnimationIn}
          setEditAnimationIn={props.setEditAnimationIn}
          editAnimationOut={props.editAnimationOut}
          setEditAnimationOut={props.setEditAnimationOut}
          editAnimInDuration={props.editAnimInDuration}
          setEditAnimInDuration={props.setEditAnimInDuration}
          editAnimOutDuration={props.editAnimOutDuration}
          setEditAnimOutDuration={props.setEditAnimOutDuration}
          commitAnimInDuration={props.commitAnimInDuration}
        commitAnimOutDuration={props.commitAnimOutDuration}
        availableAnimationPresets={availablePresets}
          previewSelectedEffectProps={props.previewSelectedEffectProps}
          patchSelectedElementProps={props.patchSelectedElementProps}
        editMediaScale={props.editMediaScale}
        setEditMediaScale={props.setEditMediaScale}
        editMediaOffsetX={props.editMediaOffsetX}
        setEditMediaOffsetX={props.setEditMediaOffsetX}
        editMediaOffsetY={props.editMediaOffsetY}
        setEditMediaOffsetY={props.setEditMediaOffsetY}
        previewVisualTransform={props.previewVisualTransform}
        clearVisualTransformPreview={props.clearVisualTransformPreview}
        showPositionGrid={props.showPositionGrid}
        onTogglePositionGrid={props.onTogglePositionGrid}
        commitVisualTransform={props.commitVisualTransform}
        commitVisualTransformValues={props.commitVisualTransformValues}
        resetVisualTransform={props.resetVisualTransform}
        motionPreset={props.motionPreset}
        applyMotionPreset={props.applyMotionPreset}
        compositionDimensions={props.compositionDimensions}
        selectedLocalPlayheadSec={props.selectedLocalPlayheadSec}
        editMaskTop={props.editMaskTop}
        setEditMaskTop={props.setEditMaskTop}
        editMaskRight={props.editMaskRight}
        setEditMaskRight={props.setEditMaskRight}
        editMaskBottom={props.editMaskBottom}
        setEditMaskBottom={props.setEditMaskBottom}
        editMaskLeft={props.editMaskLeft}
        setEditMaskLeft={props.setEditMaskLeft}
        previewMaskInset={props.previewMaskInset}
        commitMaskInset={props.commitMaskInset}
        editMediaOpacity={props.editMediaOpacity}
        setEditMediaOpacity={props.setEditMediaOpacity}
        editMaskFeather={props.editMaskFeather}
        setEditMaskFeather={props.setEditMaskFeather}
        editMirrorCenter={props.editMirrorCenter}
        setEditMirrorCenter={props.setEditMirrorCenter}
        editMirrorHeight={props.editMirrorHeight}
        setEditMirrorHeight={props.setEditMirrorHeight}
        previewMediaEffect={props.previewMediaEffect}
        commitMediaEffect={props.commitMediaEffect}
        editColorGrade={props.editColorGrade}
        setEditColorGrade={props.setEditColorGrade}
        previewColorGrade={props.previewColorGrade}
        commitColorGrade={props.commitColorGrade}
        resetColorGradeControls={props.resetColorGradeControls}
        toggleColorGradeKeyframeAtPlayhead={props.toggleColorGradeKeyframeAtPlayhead}
        colorGradeKeyedAtPlayhead={props.colorGradeKeyedAtPlayhead}
        clearColorGradeKeyframes={props.clearColorGradeKeyframes}
        editChromaKeyColor={props.editChromaKeyColor}
        editChromaKeyTolerance={props.editChromaKeyTolerance}
        editChromaKeySoftness={props.editChromaKeySoftness}
        editChromaKeySpill={props.editChromaKeySpill}
        setEditChromaKey={props.setEditChromaKey}
        previewChromaKey={props.previewChromaKey}
        commitChromaKey={props.commitChromaKey}
        resetChromaKeyControls={props.resetChromaKeyControls}
        toggleChromaKeyKeyframeAtPlayhead={props.toggleChromaKeyKeyframeAtPlayhead}
        chromaKeyKeyedAtPlayhead={props.chromaKeyKeyedAtPlayhead}
        advancedColorGrade={props.advancedColorGrade}
        previewAdvancedColorGrade={props.previewAdvancedColorGrade}
        commitAdvancedColorGrade={props.commitAdvancedColorGrade}
        toggleAdvancedColorGradeKeyframeAtPlayhead={props.toggleAdvancedColorGradeKeyframeAtPlayhead}
        advancedColorGradeKeyedAtPlayhead={props.advancedColorGradeKeyedAtPlayhead}
        colorGradeLut={props.colorGradeLut}
        applyColorGradeLut={props.applyColorGradeLut}
        previewColorGradeLutIntensity={props.previewColorGradeLutIntensity}
        commitColorGradeLutIntensity={props.commitColorGradeLutIntensity}
        toggleColorGradeLutKeyframeAtPlayhead={props.toggleColorGradeLutKeyframeAtPlayhead}
        lutIntensityKeyedAtPlayhead={props.lutIntensityKeyedAtPlayhead}
        cutoutReviewMode={props.cutoutReviewMode}
        chromaKeyReviewMode={props.chromaKeyReviewMode}
        setChromaKeyReviewMode={props.setChromaKeyReviewMode}
        setCutoutReviewMode={props.setCutoutReviewMode}
        previewMirrorBand={props.previewMirrorBand}
        commitMirrorBand={props.commitMirrorBand}
        resetMediaEffects={props.resetMediaEffects}
        resetMaskInset={props.resetMaskInset}
        addTransformKeyframeAtPlayhead={props.addTransformKeyframeAtPlayhead}
        toggleTransformKeyframeAtPlayhead={props.toggleTransformKeyframeAtPlayhead}
        addMaskKeyframeAtPlayhead={props.addMaskKeyframeAtPlayhead}
        addOpacityKeyframeAtPlayhead={props.addOpacityKeyframeAtPlayhead}
        transformKeyedAtPlayhead={props.transformKeyedAtPlayhead}
        transformFieldKeyedAtPlayhead={props.transformFieldKeyedAtPlayhead}
        maskKeyedAtPlayhead={props.maskKeyedAtPlayhead}
        opacityKeyedAtPlayhead={props.opacityKeyedAtPlayhead}
          clearVisualKeyframes={props.clearVisualKeyframes}
          editStart={props.editStart}
          setEditStart={props.setEditStart}
          commitStart={props.commitStart}
          editDuration={props.editDuration}
          setEditDuration={props.setEditDuration}
          previewDuration={props.previewDuration}
          commitDuration={props.commitDuration}
          commitVolume={props.commitVolume}
          toggleVolumeKeyframeAtPlayhead={props.toggleVolumeKeyframeAtPlayhead}
          volumeKeyedAtPlayhead={props.volumeKeyedAtPlayhead}
          commitTrimStart={props.commitTrimStart}
          commitTrimEnd={props.commitTrimEnd}
          commitFadeIn={props.commitFadeIn}
          commitFadeOut={props.commitFadeOut}
          previewPlaybackRate={props.previewPlaybackRate}
          clearPlaybackRatePreview={props.clearPlaybackRatePreview}
          updatePlaybackRate={props.updatePlaybackRate}
          patchElement={props.patchElement}
          resetElement={props.resetElement}
          normalizeElementLoudness={props.normalizeElementLoudness}
          applyAudioEffect={props.applyAudioEffect}
          applyVideoStabilization={props.applyVideoStabilization}
          deleteElement={props.deleteElement}
          hasTransitionIn={props.hasTransitionIn}
          hasTransitionOut={props.hasTransitionOut}
        />
      ) : null}

      {/* In horizontal layout, show caption controls after element controls */}
      {showElement && props.layout !== "vertical" && selectedElement?.type === "caption_text" ? (
        <CaptionMenu
          surfaceTracking={<SurfaceTrackingControls key={selectedElement.id} element={selectedElement} elements={props.timelineElements} onPatch={props.patchSelectedCaptionProps} />}
          layout={props.layout}
          selectedElement={selectedElement}
          selectedElementCount={props.selectedCaptionCount}
          editCaptionText={props.editCaptionText}
          setEditCaptionText={props.setEditCaptionText}
          editCaptionFontPreset={props.editCaptionFontPreset}
          setEditCaptionFontPreset={props.setEditCaptionFontPreset}
          editCaptionStyleVariant={props.editCaptionStyleVariant}
          setEditCaptionStyleVariant={props.setEditCaptionStyleVariant}
          editCaptionFontSize={props.editCaptionFontSize}
          setEditCaptionFontSize={props.setEditCaptionFontSize}
          editCaptionAbsX={props.editCaptionAbsX}
          setEditCaptionAbsX={props.setEditCaptionAbsX}
          editCaptionAbsY={props.editCaptionAbsY}
          setEditCaptionAbsY={props.setEditCaptionAbsY}
          setEditCaptionPosition={props.setEditCaptionPosition}
          patchSelectedCaptionProps={props.patchSelectedCaptionProps}
          previewSelectedCaptionProps={props.previewSelectedEffectProps}
          commitCaptionText={props.commitCaptionText}
          commitCaptionFontSize={props.commitCaptionFontSize}
          applyCaptionAbsPosition={props.applyCaptionAbsPosition}
          commitCaptionAbsPos={props.commitCaptionAbsPos}
          commitCaptionPositionPreset={props.commitCaptionPositionPreset}
          applySelectedCaptionStyleToLane={props.applySelectedCaptionStyleToLane}
        />
      ) : null}
    </>
  );
}
