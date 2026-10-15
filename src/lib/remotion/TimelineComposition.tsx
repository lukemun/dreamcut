"use client";
import { currentFrameRate } from "@/lib/timeline/frame-rate-scope";
import { previewProxyFrameRate } from "@/lib/timeline/source-sampling";

import {captionTickerProgress,captionTickerCss,captionScanLine} from '../timeline/caption-special-motion';
import {captionPlaneTransform,captionPlaneCss,captionMotionLayerActive} from "../timeline/caption-plane-transform";
import {resolveTransitionViewportRect} from "../timeline/transition-viewport";
import {pageTurnVisualPlan} from '../timeline/page-turn-plan';
import { accentTransitionFrame, isAccentTransition } from "@/lib/timeline/accent-transitions";
import {mediaTextImagePhase,mediaTextImageMotion} from '../timeline/media-text-fill';
import {resolveRecolor} from "../timeline/recolor";


import {transitionProgress} from "@/lib/timeline/transition-frame";
import {animationStyle,elementAnimationFrame} from '../timeline/element-animation';
import {captionAnimationProgress,captionInverseProgress} from '../timeline/caption-animation-progress';
import { GridMatte } from "./GridMatte";
import { SubjectWindow } from "./SubjectWindow";
import { AlphaVideo } from "@/lib/frame-runtime/alpha-video";
import { SpiralGroupFrame } from "./SpiralGroupFrame";
import { TrackedSurfaceText } from "./TrackedSurfaceText";

import { HandwritingText, useHandwritingAssetReadiness } from "./HandwritingText";
import { LetterFallText } from "./LetterFallText";
import { resolveLetterFallFollowers } from "../timeline/letter-fall-followers";
import { readLetterFall } from "../timeline/letter-fall";

import { mediaBlendStyle } from "@/lib/timeline/media-blend";
import { resolveMediaScene } from "@/lib/timeline/resolved-media-scene";
import { StickerOutlineFilter } from "./StickerOutlineFilter";
import { SubjectGlowFilter } from "./SubjectGlowFilter";
import { DirectionalBlurFilter } from "./DirectionalBlurFilter";
import { RecolorFilter } from "@/lib/remotion/RecolorFilter";
import { PaperContourFilter } from "@/lib/remotion/PaperContourFilter";
import { outlineFrameUrl, type OutlineMask } from "@/lib/timeline/outline-layer";

import {
  AbsoluteFill,
  Audio,
  Easing,
  Freeze,
  Img,
  OffthreadVideo,
  Sequence,
  Video as Html5Video,
  useRenderResource,
  interpolate,
  useCurrentFrame,
  useRemotionEnvironment,
  useVideoConfig,
} from "@/lib/frame-runtime";
import { Video as CanvasVideo } from "@/lib/frame-runtime/chroma";
import { colorKey } from "@/lib/frame-runtime/chroma";
import { Fragment, useEffect, useMemo, useState } from "react";
import { BenchmarkScoreCard } from "@/lib/remotion/BenchmarkScoreCard";

import {
  captionCompositingCSS,
  captionDisplayText,
  captionRemotionFontFamily,
  captionStyleCSS,
  scaleCaptionPixelStyle as scaleAbsolutePixelStyle,
  captionTypographyCSS,
  isPerWordBackgroundVariant,
  perWordBackgroundCSS,
  resolveCaptionContentRect,
  resolveCaptionFontSizePx,
  resolveCaptionProps,
  captionDrawnProps,
  resolveCaptionAnchorLayout,
} from "@/lib/timeline/captions";
import {
  activeWordForegroundColor,
  captionRenderParts,
  resolveActiveWordIndex,
  resolveSingleWordScaleX,
  validateWordTimings,
} from "@/lib/timeline/active-word-captions";
import {
  isWordAnimationPreset,
  typedCharacterCount,
  resolveAnimationProps,
  wordEntranceStyle,
  type AnimationPreset,
} from "@/lib/timeline/animation-presets";
import {
  supportsOverflowHold,
} from "@/lib/timeline/media";
import {mediaPicturePlan, mediaPictureTrimWindow} from "@/lib/timeline/media-picture-plan";
import { isPlaybackReversed, speedStepFrame, type SpeedStepSegment } from "@/lib/timeline/speed-steps";
import { resolveVisualRenderPlan } from "@/lib/timeline/visual-render-plan";
import { mediaShadowCss, resolveMediaShadow } from "@/lib/timeline/media-shadow";
import { captionSafeAreaVisuals, resolveCaptionSourceAspectRatio } from "@/lib/timeline/caption-coordinate-space";
import {
  resolveMediaTransformAtTime,
} from "@/lib/timeline/media-transform";
import { readTickerSegments } from "@/lib/timeline/ticker-segments";
import { resolveCompositionTransformLayout } from "@/lib/timeline/source-projection";
import { buildCompositingLaneOrder, compareCaptionPaintOrder } from "@/lib/timeline/compositing-lanes";
import {
  COMPOSITION_FPS,
  isVisualElementType,
  quantizeVisualFrameSpan,
  toVisualFrame,
} from "@/lib/timeline/frame-quantization";
import {
  deriveTransitionWindow,
  remapTransitionProgressAfterHold,
  resolveCubeTransitionVisualStyle,
  resolveSlideTransitionVisualStyle,
  resolveTransitionAudioMultiplier,
  resolveTransitionDirection,
  resolveWhipBlurStrength,
  resolveIncomingTransitionPreroll,
  resolveWhipTransitionVisualStyle,
  resolveSmearTransitionVisualStyle,
} from "@/lib/timeline/transitions";
import { cutoutReviewVideoStyle } from "@/lib/timeline/cutout-review";
import { hasColorGradeData } from "@/lib/timeline/color-grade";
import { buildColorKeyParams, hasChromaKeyData, resolveChromaKeyAtTime } from "@/lib/timeline/chroma-key";
import { chromaKeyReviewVideoStyle } from "@/lib/timeline/chroma-key-review";
import { resolveColorGradeLutAtTime } from "@/lib/timeline/cube-lut";
import type { TimelineTransition } from "@/components/studio/timeline/types";
import {
  interpolateEnvelopeVolume,
  readVolumeEnvelopePoints,
  retargetVolumeEnvelope,
} from "@/lib/timeline/volume-envelope";
import type { CompositionElement } from "@/lib/render/composition-adapters";
import { projectCompoundPreviews } from "@/lib/timeline/compound-preview";
import { ensureRemotionGoogleFonts, ensureRequiredRemotionFonts } from "@/lib/remotion/google-fonts";
import { ColorGradeFilter } from "@/lib/remotion/ColorGradeFilter";
import { GradientMapFilter } from "@/lib/remotion/GradientMapFilter";
import { GlitchFilter } from "@/lib/remotion/GlitchFilter";
import { PerspectiveTitleReveal } from "@/lib/remotion/PerspectiveTitleReveal";
import {
  collectTightlySyncedVideoIds,
  requiresTightVideoSync,
  shouldPauseTimelineForAudioBuffering,
  shouldPauseTimelineForVideoBuffering,
} from "@/lib/remotion/video-playback-policy";
import { resolveStillPlaybackSource, resolveVideoPlaybackSource, stillPreviewPremountSeconds } from "@/lib/remotion/video-preview-source";
import { resolvePreviewAudioSource, reversedPreviewAudioDuration } from "@/lib/remotion/video-preview-audio";
import { catalogAudioPreviewUrl } from "./catalog-audio-preview";
import { resolveAudioAutomationSampleFrame } from "@/lib/remotion/audio-automation";
import {
  previewAudioPlaybackIdentity,
  previewNarrationGain,
  readPreviewAudioBakedGain,
  shouldUseWebAudioForTimelineTrack,
  shouldUseWebAudioForPreviewNarration,
} from "@/lib/remotion/preview-narration-audio";
import {
  shouldUseWebAudioForMedia,
} from "@/lib/remotion/media-web-audio";
import { usePreviewAudioGain } from "@/lib/remotion/preview-audio-gain-store";

const DEFAULT_PREMOUNT_SECONDS = 0.5;
const DEFAULT_VIDEO_PREMOUNT_SECONDS = 1.5;
// In preview, mount the REAL incoming proxy early enough to open its decoder and resolve
// its source seek before an editorial boundary. Hidden browser warmers prime
// the cache, but only premounting the production node proves the cut itself.
// Keep this bounded: all preview video is already proxy-gated, and five seconds
// avoids retaining a timeline's worth of simultaneous decoders. Export keeps
// the smaller historical premount because it renders deterministically from
// full-quality authorities and should not retain five seconds of extra media.
const DEFAULT_VIDEO_PREVIEW_PREMOUNT_SECONDS = 5;
const AUDIO_AUTOMATION_SAMPLE_FPS = 6;
const AUDIO_AUTOMATION_PRECISION = 3;
// Layered clips must stay within two frames in the Player. Ordinary single-layer
// footage deliberately keeps Remotion's normal tolerance: forcing every video
// back to a sub-frame window causes continuous corrective seeks on alpha stacks.
// Final rendering remains frame-exact; this tolerance only governs live playback.
/** A fixed time tolerance (two 30 fps frames), independent of the project rate. */
const COMPOSITED_VIDEO_SYNC_TOLERANCE_SECONDS = 2 / COMPOSITION_FPS;

function secToFrames(sec: number): number {
  return toVisualFrame(sec, currentFrameRate());
}

function getFrameSpan(startSec: number, durationSec: number) {
  const span = quantizeVisualFrameSpan(startSec, durationSec, {
    fps: currentFrameRate(),
    minFrames: 1,
  });
  return {
    from: span.startFrame,
    to: span.endFrame,
    durationInFrames: Math.max(1, span.durationFrames),
  };
}

function getPremountFrames(element: CompositionElement, isRendering = false) {
  const previewPremountSeconds = element.props?.preview_premount_seconds;
  if (!isRendering && typeof previewPremountSeconds === "number" && Number.isFinite(previewPremountSeconds) && previewPremountSeconds >= 0) {
    return secToFrames(previewPremountSeconds);
  }
  // Dense local PNG runs use bounded preview images and a shorter lookahead;
  // mounting several seconds of eight-layer cuts exhausts decoded-image memory.
  const baseSeconds = element.type === "still"
    ? stillPreviewPremountSeconds(element.source_url, element.duration, isRendering)
    : element.type === "sound_effect"
      ? 2
      : element.type === "video_clip" && (element.transition_in || element.transition_out)
        ? isRendering ? 2 : DEFAULT_VIDEO_PREVIEW_PREMOUNT_SECONDS
      : element.type === "video_clip"
        ? isRendering ? DEFAULT_VIDEO_PREMOUNT_SECONDS : DEFAULT_VIDEO_PREVIEW_PREMOUNT_SECONDS
      : DEFAULT_PREMOUNT_SECONDS;
  const requestedSeconds = isVisualElementType(element.type)
    ? Math.max(
        baseSeconds,
        resolveAnimationProps(element.props).animationInDuration,
        resolveAnimationProps(element.props).animationOutDuration,
      )
    : Math.max(baseSeconds, element.fade_in, element.fade_out);
  return Math.max(0, secToFrames(requestedSeconds));
}

function roundAudioAutomationValue(value: number) {
  return Number(value.toFixed(AUDIO_AUTOMATION_PRECISION));
}

function getMediaTrimWindow(element: CompositionElement) {
  return mediaPictureTrimWindow(element, currentFrameRate());
}

/**
 * The HTML5 media path clamps element volume to [0, 1]
 * (`mediaRef.volume = Math.min(volume, 1)` in Remotion), so any clip whose
 * envelope amplifies past unity plays quieter in PREVIEW than in the render —
 * the render serializes the true gain into ffmpeg. A narration boosted to
 * 2.278 therefore previewed 7.15 dB under its rendered loudness, and every
 * by-ear music balance judged against it shipped wrong. Route those clips
 * through the Web Audio gain node, which amplifies correctly. Local media is
 * same-origin, so the WebAudio CORS landmine does not apply here.
 */
function needsWebAudioAmplification(element: { volume?: number | null; props?: Record<string, unknown> | null }) {
  if (Number(element.volume) > 1) return true;
  const envelope = element.props?.volume_envelope;
  return Array.isArray(envelope)
    && envelope.some((point) => Number((point as { volume?: unknown })?.volume) > 1);
}

/**
 * Clips flagged `has_alpha` (e.g. VP9 webm cutout overlays) need Remotion's
 * transparent frame extraction during render; browser preview plays alpha
 * webm natively so the flag only affects the render path.
 */
function hasAlphaChannel(element: { props?: Record<string, unknown> | null }) {
  return element.props?.has_alpha === true;
}

const STICKER_OUTLINE_FILTER_PREFIX = "dreamcut-sticker-outline";

function stickerOutlineFilterId(width: number) {
  return `${STICKER_OUTLINE_FILTER_PREFIX}-${Math.max(1, Math.min(32, Math.round(width)))}`;
}

function StickerOutlineFilterDefs() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="0"
      height="0"
      style={{ position: "absolute", width: 0, height: 0, overflow: "hidden", pointerEvents: "none" }}
    >
      <defs>
        {Array.from({ length: 32 }, (_, index) => index + 1).map((width) => (
          <filter
            key={width}
            id={stickerOutlineFilterId(width)}
            x="-50%"
            y="-50%"
            width="200%"
            height="200%"
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur
              in="SourceAlpha"
              stdDeviation={Math.max(0.75, Math.min(4, width * 0.375))}
              result="soft-source-alpha"
            />
            <feColorMatrix
              in="soft-source-alpha"
              type="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 8 -3.5"
              result="smoothed-source-alpha"
            />
            <feMorphology in="smoothed-source-alpha" operator="dilate" radius={width} result="expanded-alpha" />
            <feGaussianBlur
              in="expanded-alpha"
              stdDeviation={Math.max(0.35, Math.min(1.25, width * 0.08))}
              result="smoothed-alpha"
            />
            <feFlood floodColor="#ffffff" floodOpacity="1" result="outline-white" />
            <feComposite in="outline-white" in2="smoothed-alpha" operator="in" result="outline-shape" />
            <feComposite in="SourceGraphic" in2="smoothed-source-alpha" operator="in" result="smoothed-subject" />
            <feComposite in="smoothed-subject" in2="outline-shape" operator="over" />
          </filter>
        ))}
      </defs>
    </svg>
  );
}

function mediaDropShadowStyle(element: { type?: string; props?: Record<string, unknown> | null }) {
  const shadow = resolveMediaShadow(element.props);
  return shadow ? { filter: `drop-shadow(${mediaShadowCss(shadow)})` } : {};
}

/**
 * Structural masks and pixel-authored overlays must not inherit photographic
 * interpolation. Resampling a hard alpha edge creates visible dirty-color
 * bands on both sides of dividers when the overlay is scaled in Player or a
 * render. Keep this opt-in so ordinary photos and illustrations remain smooth.
 */
function mediaImageRenderingStyle(element: { props?: Record<string, unknown> | null }) {
  return element.props?.image_rendering === "pixelated"
    ? { imageRendering: "pixelated" as const }
    : {};
}

/**
 * The one place a chroma key becomes a rendered effect. Both the Player and the
 * render reach it through `TimelineVideo`, so preview and export cannot drift.
 */
function chromaKeyEffects(props: Record<string, unknown> | null | undefined, timeSeconds: number) {
  const chroma = resolveChromaKeyAtTime(props, timeSeconds);
  return chroma ? [colorKey(buildColorKeyParams(chroma))] : [];
}

type TimelineVideoProps = {
  speedSegments?: SpeedStepSegment[];
  sourceTimeSeconds?: number;
  element: CompositionElement;
  /** Clip-local offset when the clip is split across hold/playable/overflow slices. */
  sliceOffsetFrames?: number;
  src: string;
  style: React.CSSProperties;
  playbackRate: number;
  pauseWhenBuffering: boolean;
  volume: number | ((frame: number) => number);
  useWebAudioApi: boolean;
  crossOrigin?: "anonymous";
  transparent?: boolean;
  acceptableTimeShiftInSeconds?: number;
  trimBefore?: number;
  trimAfter: number;
};

/**
 * Preview presents decoded ordinary video through a canvas so the picture stays
 * visible inside the editor's composited stage. Rendering retains its direct
 * video path. The decoder and source-time mapping remain the same in both paths.
 * The branch is stable for a clip's lifetime and does not remount it mid-play.
 */
function TimelineVideo(props: TimelineVideoProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const mapped = props.speedSegments ? speedStepFrame(props.speedSegments, frame, fps) : {};
  const v = {...props, ...mapped};
  const sourceSeconds = v.sourceTimeSeconds ?? ((v.trimBefore ?? 0) / fps + frame / fps * v.playbackRate);
  return <GridMatte props={props.element.props ?? {}} sourceSeconds={sourceSeconds}><TimelineVideoPicture {...props} /></GridMatte>;
}

function TimelineVideoPicture({ element, sliceOffsetFrames = 0, speedSegments, ...sourceVideoProps }: TimelineVideoProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { isRendering } = useRemotionEnvironment();
  const mapped = speedSegments ? speedStepFrame(speedSegments, frame, fps) : {};
  const videoProps = {...sourceVideoProps, ...mapped, previewProxyFps: previewProxyFrameRate(element.props), title: `timeline-video:${element.id}:${sliceOffsetFrames}`};

  if (element.props?.outline_parent_id && element.props?.outline_mask) {
    const mask = element.props.outline_mask as OutlineMask;
    const sourceSeconds = videoProps.sourceTimeSeconds ?? ((videoProps.trimBefore ?? 0) / fps + frame / fps * videoProps.playbackRate);
    const relativeUrl = outlineFrameUrl(mask, sourceSeconds);
    const src = /^https?:/.test(videoProps.src) ? new URL(relativeUrl, videoProps.src).href : relativeUrl;
    const width = Math.max(0, Math.min(64, Number(element.props.outline_width ?? 8)));
    const color = /^#[0-9a-f]{6}$/i.test(String(element.props.outline_color)) ? String(element.props.outline_color) : "#ffffff";
    const filterId = `outline-layer-${element.id}`;
    return <>
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true"><defs>
        <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%" colorInterpolationFilters="sRGB">
          <feMorphology in="SourceAlpha" operator="dilate" radius={width} result="expanded" />
          <feFlood floodColor={color} result="fill" />
          <feComposite in="fill" in2="expanded" operator="in" />
        </filter>
      </defs></svg>
      <Img src={src} style={{ ...videoProps.style, filter: `url(#${filterId})` }} />
    </>;
  }

  if (hasAlphaChannel(element)) {
    // Draw the decoded alpha into the scene instead of relying on an accelerated
    // video overlay surviving proposal swaps, seeks and nested effect filters.
    return <AlphaVideo {...videoProps} />;
  }

  if (!hasChromaKeyData(element.props)) {
    // Use one pixel surface for preview and export. HTML video overlays and
    // canvases differ in primary conversion and fractional/filter sampling.
    // Source authority and exact export seeking remain owned by videoProps.
    return <AlphaVideo {...videoProps} />;
  }

  const {
    style,
    transparent,
    acceptableTimeShiftInSeconds,
    pauseWhenBuffering,
    crossOrigin,
    useWebAudioApi,
    ...shared
  } = videoProps;
  // `<Video>` owns object fit as a prop; leaving it in `style` makes it warn.
  const { objectFit, ...canvasStyle } = style;

  return (
    <CanvasVideo
      {...shared}
      style={canvasStyle}
      objectFit={(objectFit as "contain" | "cover" | "fill" | "none" | "scale-down") ?? "contain"}
      effects={chromaKeyEffects(element.props, (sliceOffsetFrames + frame) / currentFrameRate())}
      _experimentalInitiallyDrawCachedFrame
      fallbackOffthreadVideoProps={{
        transparent,
        acceptableTimeShiftInSeconds,
        pauseWhenBuffering,
        crossOrigin,
        useWebAudioApi,
      }}
    />
  );
}

function transitionViewportShadow(element: CompositionElement) {
  const shadow = resolveMediaShadow(element.props);
  return shadow ? mediaShadowCss(shadow) : undefined;
}

/** transition_clip_to_media_bounds (timeline/transition-viewport.ts); CanvasKit draws the same clip and box shadow. */
function FixedTransitionViewport({
  element,
  timeSeconds,
  animatedStyle,
  children,
}: {
  element: CompositionElement;
  timeSeconds: number;
  animatedStyle: React.CSSProperties;
  children: React.ReactNode;
}) {
  const { width, height } = useVideoConfig();
  const viewport = resolveTransitionViewportRect(element.props, timeSeconds, width, height);

  if (!viewport) {
    return <AbsoluteFill style={animatedStyle}>{children}</AbsoluteFill>;
  }

  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: viewport.x,
          top: viewport.y,
          width: viewport.width,
          height: viewport.height,
          overflow: "hidden",
          boxShadow: transitionViewportShadow(element),
        }}
      >
        <div
          style={{
            position: "absolute",
            left: -viewport.x,
            top: -viewport.y,
            width,
            height,
            ...animatedStyle,
          }}
        >
          {children}
        </div>
      </div>
    </AbsoluteFill>
  );
}

function isCompositionAudioLane(laneKey: string) {
  return laneKey.startsWith("audio_")
    || laneKey.startsWith("music_")
    || laneKey.startsWith("sound_effect_");
}

type Props = {
  elements: CompositionElement[];
  laneOrderKeys?: string[];
  /** Scales absolute-pixel creative styling for low-resolution working renders. */
  renderScale?: number;
  /**
   * Editor-only. The Player keeps the visual clock while the editor's
   * persistent mixer owns standalone audio. Render callers leave this false.
   */
  externalAudioPreview?: boolean;
  /** Internal prepared-preview projection; preserve full visual geometry context. */
  captionOverlayOnly?: boolean;
};

type BoundaryHoldSide = "head" | "tail";

function readFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function ImageSequenceFillText({
  text,
  urls,
  localSeconds,
  secondsPerImage,
  crossfadeSeconds,
  scale,
  panPercent,
}: {
  text: string;
  urls: string[];
  localSeconds: number;
  secondsPerImage: number;
  crossfadeSeconds: number;
  scale: number;
  panPercent: number;
}) {
  if (urls.length === 0) return text;

  const phase=mediaTextImagePhase(urls.length,localSeconds,secondsPerImage,crossfadeSeconds)!;
  const {currentIndex,nextIndex}=phase;
  const {positionX:currentPosition,nextPositionX:nextPosition,nextOpacity}=mediaTextImageMotion(phase,scale,panPercent,'background');

  const fillStyle = (url: string, opacity: number, positionX: number) => ({
    color: "transparent",
    backgroundImage: `url("${url}")`,
    backgroundRepeat: "no-repeat",
    backgroundSize: `${Math.max(1, scale) * 100}% auto`,
    backgroundPosition: `${positionX}% 50%`,
    backgroundClip: "text",
    WebkitBackgroundClip: "text",
    opacity,
  }) as const;

  return (
    <>
      {urls.map((url) => (
        <Img
          key={`preload-${url}`}
          src={url}
          decoding="sync"
          style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
        />
      ))}
      <span style={{ position: "relative", display: "inline-block" }}>
        <span style={fillStyle(urls[currentIndex]!, 1 - nextOpacity, currentPosition)}>
          {text}
        </span>
        {nextOpacity > 0 ? (
          <span
            aria-hidden
            style={{
              ...fillStyle(urls[nextIndex]!, nextOpacity, nextPosition),
              position: "absolute",
              inset: 0,
            }}
          >
            {text}
          </span>
        ) : null}
      </span>
    </>
  );
}

export function CaptionSequence({
  tickerRaster = false,
  element,
  sourceAspectRatio,
  renderScale,
}: {
  element: CompositionElement;
  sourceAspectRatio: number | null;
  renderScale: number;
  tickerRaster?: boolean;
}) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const props = captionDrawnProps(resolveCaptionProps(element.props));
  const textMaskUrl = typeof element.props?.text_mask_url === "string"
    ? element.props.text_mask_url
    : null;
  const {durationInFrames,inProgress,outProgress}=captionAnimationProgress(props,frame,element.duration);

  const inStyle = animationStyle(props.animationIn, inProgress, "in", width, height, props.dropInDistanceRatio);
  const outStyle = animationStyle(props.animationOut, outProgress, "out", width, height, props.dropInDistanceRatio);
  const isContinuousTicker = element.props?.ticker_motion === "crawl_left";
  const opacity = isContinuousTicker ? 1 : Math.min(inStyle.opacity, outStyle.opacity);
  const contentRect = resolveCaptionContentRect(sourceAspectRatio, width / height);
  const tickerProgress = captionTickerProgress(frame,durationInFrames);
  const {timeline:inverseTimelineProgress,motion:inverseMotionProgress}=captionInverseProgress(frame,durationInFrames);
  const inverseDriftX = props.styleVariant === "inverse" && props.inverseMaskMotion === "drift"
    ? (inverseMotionProgress - 0.5) * (props.inverseMaskDriftXPercent / 100) * width
    : 0;
  const inverseDriftY = props.styleVariant === "inverse" && props.inverseMaskMotion === "drift"
    ? (inverseMotionProgress - 0.5) * (props.inverseMaskDriftYPercent / 100) * height
    : 0;
  const translateX = inStyle.translateX
    + outStyle.translateX
    + inverseDriftX
    + resolveMediaTransformAtTime(element.props, frame / currentFrameRate()).offsetX * width / 2
    + (props.absX == null ? props.offsetX * width * contentRect.width : 0);
  const translateY = inStyle.translateY
    + outStyle.translateY
    + inverseDriftY
    + resolveMediaTransformAtTime(element.props, frame / currentFrameRate()).offsetY * height / 2
    + (props.absY == null ? props.offsetY * height * contentRect.height : 0);
  const scale = inStyle.scale * outStyle.scale;
  const animationRotateZDeg = (inStyle.rotateZDeg ?? 0) + (outStyle.rotateZDeg ?? 0);
  const isSurfaceAttached = props.surfaceMode === "wall";
  const surfaceOpacity = isSurfaceAttached ? props.surfaceOpacity : 1;
  const surfaceBlurPx = isSurfaceAttached ? props.surfaceBlurPx : 0;
  const blurPx = (inStyle.blurPx ?? 0) + (outStyle.blurPx ?? 0) + surfaceBlurPx;
  const isScanRevealLine = element.props?.scan_reveal_line === true;
  const scan = captionScanLine(element.props,inProgress,renderScale);
  const scanY=scan.y;
  if (isScanRevealLine) {
    const lineHeight=scan.height,lineWidth=scan.width;
    return (
      <AbsoluteFill style={{ pointerEvents: "none" }}>
        <div style={{
          position: "absolute",
          left: "50%",
          width: `${lineWidth * 100}%`,
          top: `${scanY * 100}%`,
          height: lineHeight,
          backgroundColor: props.textColor ?? "#F5E8D0",
          boxShadow: `0 0 ${lineHeight * 3}px ${props.textColor ?? "#F5E8D0"}`,
          transform: "translate(-50%, -50%)",
        }} />
      </AbsoluteFill>
    );
  }
  if (props.styleVariant === "camera_reveal") {
    return (
      <AbsoluteFill
        data-caption-camera-reveal="true"
        style={{
          pointerEvents: "none",
          opacity,
          filter: blurPx > 0.01 ? `blur(${blurPx * renderScale}px)` : undefined,
        }}
      >
        <PerspectiveTitleReveal props={props} />
      </AbsoluteFill>
    );
  }
  const scanCaptionTopPx = props.absY == null
    ? 0
    : (contentRect.top + props.absY * contentRect.height) * height;
  const scanCaptionHeightPx = Math.max(1, props.fontSizePx * renderScale);
  const scanLocalProgress = Math.min(1, Math.max(0,
    (scanY * height - scanCaptionTopPx) / scanCaptionHeightPx,
  ));
  const scanClipPath = `inset(0 0 ${(1 - scanLocalProgress) * 100}% 0)`;
  const clipPath = props.animationIn === "scan_reveal_down"
    ? scanClipPath
    : props.animationIn === "write_on"
    ? (props.styleVariant === "image_fill" ? undefined : inStyle.clipPath)
    : props.animationOut === "write_on"
      ? outStyle.clipPath
      : undefined;
  const localSeconds = frame / currentFrameRate();
  const timingValidation = props.timingMode !== "phrase"
    ? validateWordTimings(props.text, element.duration, props.wordTimings, currentFrameRate())
    : null;
  const activeWordIndex = timingValidation && timingValidation.findings.length === 0
    ? resolveActiveWordIndex(timingValidation.timings, localSeconds)
    : -1;
  const inverseSweepPhase =
    (inverseTimelineProgress * props.inverseMaskSweepCycles) % 1;
  const inverseSweepBaseAlpha =
    1 - props.inverseMaskSweepIntensity * 0.5;
  const inverseGlyphStyle = props.styleVariant === "inverse"
    && props.inverseMaskSweepIntensity > 0
    ? {
        color: "transparent",
        backgroundColor: `rgba(255,255,255,${inverseSweepBaseAlpha})`,
        backgroundImage: `linear-gradient(115deg, transparent 42%, rgba(255,255,255,${props.inverseMaskSweepIntensity}) 50%, transparent 58%)`,
        backgroundSize: "240% 100%",
        backgroundPosition: `${-100 + inverseSweepPhase * 200}% 50%`,
        backgroundRepeat: "no-repeat",
        backgroundClip: "text",
        WebkitBackgroundClip: "text",
      }
    : {};

  const anchors = resolveCaptionAnchorLayout(props, contentRect);
  const captionFontSizePx = resolveCaptionFontSizePx(
    props,
    props.maxWidth * contentRect.width * width,
  );
  const displayText = captionDisplayText(props);
  const horizontal = isContinuousTicker ? { left: tickerRaster ? "0%" : "100%", transformBaseX: "0%" } : anchors.horizontal;
  const vertical = anchors.vertical;

  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        ...(textMaskUrl ? {
          maskImage: `url("${textMaskUrl}")`,
          WebkitMaskImage: `url("${textMaskUrl}")`,
          maskPosition: "0 0",
          WebkitMaskPosition: "0 0",
          maskRepeat: "no-repeat",
          WebkitMaskRepeat: "no-repeat",
          maskSize: "100% 100%",
          WebkitMaskSize: "100% 100%",
        } : {}),
      }}
    >
      <div
        style={{
          position: "absolute",
          left: horizontal.left,
          top: vertical.top,
          width: isContinuousTicker ? "max-content" : `${props.maxWidth * contentRect.width * 100}%`,
          transform: isContinuousTicker
            ? `${tickerRaster ? "translateX(0px)" : captionTickerCss(tickerProgress,width)} translateY(${translateY}px) scale(${scale * props.textScaleX}, ${scale * props.textScaleY})`
            : `translate(${horizontal.transformBaseX}, ${vertical.transformBaseY}) translate(${translateX}px, ${translateY}px) ${captionPlaneCss(captionPlaneTransform(props,scale,animationRotateZDeg,renderScale))}`,
          transformOrigin: "center center",
          // Keep one glyph raster through fractional scales and rotations. Without
          // a retained layer Chrome can repaint the stroke at each scale, making
          // its antialiasing change while the caption moves. Lifetime is bounded
          // by this mounted caption, and preview/export use the same policy.
          // Settled (identity pose) frames drop the layer so glyphs paint
          // pixel-snapped, exactly as Browser GPU's one-pass raster does.
          willChange: captionMotionLayerActive(props.animationIn, props.animationOut, scale, animationRotateZDeg) ? "transform" : undefined,
          clipPath,
          filter: blurPx > 0.01 ? `blur(${blurPx * renderScale}px)` : undefined,
          opacity: opacity * surfaceOpacity,
          textAlign: props.textAlign,
          textTransform: "none",
          fontFamily: captionRemotionFontFamily(props.fontPreset),
          fontSize: captionFontSizePx * renderScale,
          whiteSpace: isContinuousTicker || props.singleLine ? "nowrap" : "pre-wrap",
          ...captionTypographyCSS(props.fontPreset),
          ...scaleAbsolutePixelStyle(
            captionStyleCSS(
              props.styleVariant,
              props.textColor,
              props.outlineWidthPx,
            ),
            renderScale,
          ),
          ...inverseGlyphStyle,
          ...(isSurfaceAttached ? {
            mixBlendMode: props.surfaceBlendMode,
            textShadow: "0 1px 0 rgba(255,255,255,0.24), 0 -1px 1px rgba(55,34,20,0.22)",
          } : {}),
        }}
      >
        {(() => {
          const letterFall = readLetterFall(element.props);
          if (letterFall) {
            return <LetterFallText text={displayText} elapsed={localSeconds - letterFall.start}
              seconds={letterFall.seconds} stagger={letterFall.stagger} height={height} order={letterFall.order} />;
          }
          if (props.animationIn === "handwriting" || props.animationOut === "handwriting" || (props.styleVariant === "image_fill" && props.animationIn === "write_on")) {
            return <HandwritingText weight={props.handwritingWeight} revealMode={props.handwritingRevealMode} fontPreset={props.fontPreset} text={displayText} progress={Math.min(props.animationIn === "handwriting" ? inProgress : 1, props.animationOut === "handwriting" ? 1 - outProgress : 1)} fontSize={captionFontSizePx * renderScale} maxWidth={props.maxWidth * contentRect.width * width} singleLine={props.singleLine} align={props.textAlign} color={props.textColor ?? "#ffffff"} imageFill={props.styleVariant === "image_fill" ? { revealProgress: props.animationIn === "write_on" ? inProgress : undefined, scene: props.mediaFillScene ? {
              width: props.mediaFillScene.width * width, height: props.mediaFillScene.height * height,
              x: (anchors.x - props.mediaFillScene.x) * width + translateX,
              y: (anchors.y - props.mediaFillScene.y) * height + translateY,
              anchorX: anchors.anchorX, anchorY: anchors.anchorY,
              boxWidth: props.maxWidth * contentRect.width * width, align: props.textAlign,
              offsetSeconds: Math.max(0, element.timeline_start - props.mediaFillScene.startSeconds),
            } : undefined, videoUrl: props.mediaFillVideoUrl, videoPlaybackRate: props.mediaFillVideoPlaybackRate, previewVideoUrl: props.mediaFillVideoPreviewUrl, urls: props.mediaFillUrls, localSeconds, secondsPerImage: props.mediaFillSecondsPerImage, crossfadeSeconds: props.mediaFillCrossfadeSeconds, scale: props.mediaFillScale, panPercent: props.mediaFillPanPercent } : undefined} />;
          }
          const tickerSegments = isContinuousTicker
            ? readTickerSegments(element.props?.ticker_segments)
            : [];
          if (tickerSegments.length > 0) {
            return tickerSegments.map((segment, index) => (
              <span
                key={`${index}-${segment.text}`}
                data-ticker-segment="true"
                style={{
                  color: segment.color,
                  fontWeight: segment.fontWeight,
                }}
              >
                {segment.text}
              </span>
            ));
          }
          const singleWordMode = props.timingMode === "single_word" && timingValidation?.findings.length === 0;
          if (props.styleVariant === "benchmark_card") {
            return (
              <BenchmarkScoreCard
                text={displayText}
                rawProps={element.props}
                progress={inProgress}
              />
            );
          }
          if (props.styleVariant === "thought_bubble") {
            return (
              <>
                <span>{displayText}</span>
                <span
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    left: "18%",
                    bottom: -22 * renderScale,
                    width: 18 * renderScale,
                    height: 18 * renderScale,
                    borderRadius: "50%",
                    backgroundColor: "#ffffff",
                    border: `${3 * renderScale}px solid #111111`,
                    boxSizing: "border-box",
                  }}
                />
                <span
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    left: "9%",
                    bottom: -39 * renderScale,
                    width: 11 * renderScale,
                    height: 11 * renderScale,
                    borderRadius: "50%",
                    backgroundColor: "#ffffff",
                    border: `${2.5 * renderScale}px solid #111111`,
                    boxSizing: "border-box",
                  }}
                />
              </>
            );
          }
          if (props.styleVariant === "image_fill") {
            const activeTiming = singleWordMode && activeWordIndex >= 0
              ? timingValidation.timings[activeWordIndex]
              : null;
            if (singleWordMode && !activeTiming) return null;
            const imageFillText = activeTiming?.text ?? displayText;
            const wordScaleX = activeTiming
              ? resolveSingleWordScaleX(activeTiming, localSeconds, props.singleWordFlipSeconds)
              : 1;
            return (
              <span
                data-caption-image-fill="true"
                style={{
                  display: "inline-block",
                  transform: `scaleX(${wordScaleX})`,
                  transformOrigin: "center center",
                }}
              >
                <ImageSequenceFillText
                  text={imageFillText}
                  urls={props.mediaFillUrls}
                  localSeconds={localSeconds}
                  secondsPerImage={props.mediaFillSecondsPerImage}
                  crossfadeSeconds={props.mediaFillCrossfadeSeconds}
                  scale={props.mediaFillScale}
                  panPercent={props.mediaFillPanPercent}
                />
              </span>
            );
          }
          if (singleWordMode) {
            const activeTiming = activeWordIndex >= 0 ? timingValidation.timings[activeWordIndex] : null;
            if (!activeTiming) return null;
            const wordScaleX = resolveSingleWordScaleX(activeTiming, localSeconds, props.singleWordFlipSeconds);
            return (
              <span
                data-caption-single-word="true"
                data-caption-word-index={activeWordIndex}
                style={{
                  display: "inline-block",
                  color: activeTiming.color,
                  transform: `scale(${activeTiming.scale ?? 1}) scaleX(${wordScaleX})`,
                  transformOrigin: "center center",
                }}
              >
                {activeTiming.text}
              </span>
            );
          }
          const activeWordMode = props.timingMode === "active_word" && timingValidation?.findings.length === 0;
          const wordEntranceMode = isWordAnimationPreset(props.animationIn);
          const perWordBoxMode = isPerWordBackgroundVariant(props.styleVariant);
          const perWordBox = perWordBoxMode ? perWordBackgroundCSS(props.styleVariant) : null;
          const wordEmphasisMode = timingValidation?.findings.length === 0
            && timingValidation.timings.some((word) => word.color || word.scale || word.rowBreakBefore || word.rowBreakAfter);
          if (props.animationIn === "type_on" || props.animationOut === "type_on") {
            // Typed in place: every letter is laid out from the first frame (so lines never
            // re-wrap), and the ones not typed yet are hidden.
            const shown = typedCharacterCount(displayText, Math.min(
              props.animationIn === "type_on" ? inProgress : 1,
              props.animationOut === "type_on" ? 1 - outProgress : 1,
            ));
            const characters = Array.from(displayText);
            return <>{characters.slice(0, shown).join("")}<span data-caption-untyped style={{ visibility: "hidden" }}>{characters.slice(shown).join("")}</span></>;
          }
          if (!activeWordMode && !wordEntranceMode && !perWordBoxMode && !wordEmphasisMode) return displayText;
          const parts = captionRenderParts(displayText);
          const wordCount = parts.reduce((count, part) => count + (part.wordIndex == null ? 0 : 1), 0);
          return parts.map((part, index) => {
            if (part.wordIndex == null) return <Fragment key={index}>{part.text}</Fragment>;
            const active = activeWordMode && part.wordIndex === activeWordIndex;
            const wordTiming = timingValidation?.timings[part.wordIndex];
            // Entrance stagger: each word rides the block's in-progress with its
            // own window (pure per-frame computation — no CSS transitions).
            const entrance = wordEntranceMode
              ? wordEntranceStyle(props.animationIn, inProgress, part.wordIndex, wordCount)
              : null;
            return (
              <Fragment key={index}>
                {wordTiming?.rowBreakBefore ? <br /> : null}
              <span
                data-caption-word-index={part.wordIndex}
                data-active-word={active ? "true" : "false"}
                style={{
                  // The per-word box sits UNDER any active-word override, so a
                  // karaoke highlight still wins on the word being spoken.
                  ...(perWordBox ?? {}),
                  ...(wordTiming?.color ? { color: wordTiming.color } : {}),
                  ...(wordTiming?.scale ? {
                    display: "inline-block",
                    transform: `scale(${wordTiming.scale})`,
                    transformOrigin: "center center",
                  } : {}),
                  ...(entrance ? {
                    display: "inline-block",
                    opacity: entrance.opacity,
                    transform: `translateY(${entrance.translateYEm}em) scale(${entrance.scale * (wordTiming?.scale ?? 1)})`,
                    transformOrigin: "center 70%",
                  } : {}),
                  ...(active ? {
                    color: props.activeWordTextColor ?? activeWordForegroundColor(props.activeWordColor),
                    // caption-craft §10 normally drops the stroke here and lets the
                    // highlight fill carry contrast. That fails when fill and word
                    // colour are close (white on yellow), and it makes the
                    // highlighted word read as a different treatment from its
                    // neighbours. `activeWordKeepsOutline` keeps the block's stroke.
                    ...(props.activeWordKeepsOutline ? {} : {
                      WebkitTextStroke: "0px transparent",
                      paintOrder: "normal",
                    }),
                    backgroundColor: props.activeWordColor,
                    borderRadius: "0.12em",
                    // The box is sized to the GLYPH box, which does not include the
                    // stroke — so a thick outline pokes out past the fill on both
                    // sides and the highlight reads as clipping the word. Pad
                    // horizontally into the word spaces, and cancel it with an equal
                    // negative margin so word positions and line wrapping are
                    // unchanged. The uniform spread below still supplies the
                    // vertical breathing room.
                    paddingLeft: `${props.activeWordPadXEm}em`,
                    paddingRight: `${props.activeWordPadXEm}em`,
                    marginLeft: `-${props.activeWordPadXEm}em`,
                    marginRight: `-${props.activeWordPadXEm}em`,
                    boxShadow: `0 0 0 0.08em ${props.activeWordColor}`,
                    boxDecorationBreak: "clone",
                    WebkitBoxDecorationBreak: "clone",
                  } : {}),
                }}
              >
                {part.text}
              </span>
                {wordTiming?.rowBreakAfter ? <br /> : null}
              </Fragment>
            );
          });
        })()}
      </div>
    </AbsoluteFill>
  );
}


/** Anisotropic blur stretches the entire overlapping shot along camera travel. */
function SmearFilter({ id, blur, vertical = false }: { id: string; blur: number; vertical?: boolean }) {
  return <svg width="0" height="0" style={{ position: "absolute", pointerEvents: "none" }} aria-hidden="true"><defs>
    <filter id={id} x="-100%" y="-100%" width="300%" height="300%" colorInterpolationFilters="sRGB">
      <feGaussianBlur stdDeviation={vertical ? `2 ${blur}` : `${blur} 2`} edgeMode="duplicate" />
    </filter>
  </defs></svg>;
}

function AnimationWrapper({
  element,
  totalDurationFrames,
  sliceOffsetFrames,
  suppressIn,
  suppressOut,
  children,
}: {
  element: CompositionElement;
  totalDurationFrames: number;
  sliceOffsetFrames: number;
  suppressIn: boolean;
  suppressOut: boolean;
  children: React.ReactNode;
}) {
  const localFrame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  // The same whole-clip clock drives Standard and GPU, including holds.
  const globalFrame = sliceOffsetFrames + localFrame;
  const {inStyle,outStyle,wipeRight}=elementAnimationFrame(element.props,globalFrame,totalDurationFrames,width,height,{suppressIn,suppressOut});

  // A travelling slide is a two-card rotation: the outgoing card leaves in
  // the opposite direction while the incoming card enters. This mirrors the
  // landing-page preset carousel instead of laying the next card over a
  // stationary previous one. `transition_travel_percent` lets a framed card
  // travel by its own rendered width rather than the full video canvas.
  const transitionOut = element.transition_out;
  const transitionOutFrames = transitionOut ? Math.max(1, secToFrames(transitionOut.duration_seconds)) : 0;
  const transitionOutStart = totalDurationFrames - transitionOutFrames;
  const transitionOutBezier = transitionOut?.params?.bezier;
  const transitionOutEasing = Array.isArray(transitionOutBezier) && transitionOutBezier.length === 4
    ? Easing.bezier(transitionOutBezier[0], transitionOutBezier[1], transitionOutBezier[2], transitionOutBezier[3])
    : undefined;
  const transitionOutRawProgress = transitionOutFrames > 0
    ? interpolate(globalFrame, [transitionOutStart, totalDurationFrames], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    })
    : 0;
  const transitionOutHeldProgress = remapTransitionProgressAfterHold(
    transitionOutRawProgress,
    transitionOut?.params?.motion_start_progress,
  );
  const transitionOutProgress = transitionOutEasing
    ? transitionOutEasing(transitionOutHeldProgress)
    : transitionOutHeldProgress;
  const travelPercentProp = element.props?.transition_travel_percent;
  const travelPercent = typeof travelPercentProp === "number" && Number.isFinite(travelPercentProp)
    ? Math.max(1, Math.min(100, travelPercentProp))
    : 100;
  const transitionDirection = resolveTransitionDirection(transitionOut?.params);
  const hasSmearOut = (transitionOut?.type === "slide" || transitionOut?.type === "whip")
    && transitionOut.params?.motion === "smear";
  const hasTravellingSlideOut = transitionOut?.type === "slide" && transitionOut.params?.motion !== "in-place" && !hasSmearOut;
  const hasWhipOut = transitionOut?.type === "whip" && !hasSmearOut;
  const hasCubeOut = transitionOut?.type === "cube";
  const slideOutStyle=resolveSlideTransitionVisualStyle(transitionOutProgress,'out',transitionDirection,transitionOut?.params,travelPercent);
  const slideOutBlurPx=hasTravellingSlideOut?slideOutStyle.blurPx:0;
  const whipOutStyle = hasWhipOut
    ? resolveWhipTransitionVisualStyle(
      transitionOutProgress,
      "out",
      transitionDirection,
      resolveWhipBlurStrength(transitionOut?.params),
      transitionOut?.params,
    )
    : null;
  const cubeOutStyle = hasCubeOut
    ? resolveCubeTransitionVisualStyle(transitionOutProgress, "out", transitionDirection, width, height)
    : null;
  const transitionTranslateXPercent=hasTravellingSlideOut?slideOutStyle.translateXPercent:0;
  const transitionTranslateYPercent=hasTravellingSlideOut?slideOutStyle.translateYPercent:0;

  const smearPulse = Math.sin(Math.PI * transitionOutProgress);
  const smearId = `smear-out-${element.id}`;
  const smearVertical = transitionDirection === "from-top" || transitionDirection === "from-bottom";
  const smearOut = resolveSmearTransitionVisualStyle(transitionOutProgress, "out", transitionDirection, transitionOut?.params, width);
  const opacity = Math.min(inStyle.opacity, outStyle.opacity);
  const translateX = inStyle.translateX + outStyle.translateX;
  const translateY = inStyle.translateY + outStyle.translateY;
  const scale = inStyle.scale * outStyle.scale;
  const animationRotateZDeg = (inStyle.rotateZDeg ?? 0) + (outStyle.rotateZDeg ?? 0);
  const blurPx = (inStyle.blurPx ?? 0)
    + (outStyle.blurPx ?? 0)
    + (whipOutStyle?.blurPx ?? 0)
    + slideOutBlurPx;

  const needsTransform = translateX !== 0 || translateY !== 0 || scale !== 1 || animationRotateZDeg !== 0
    || transitionTranslateXPercent !== 0 || transitionTranslateYPercent !== 0
    || whipOutStyle != null || cubeOutStyle != null;

  return (
    <FixedTransitionViewport
      element={element}
      timeSeconds={globalFrame / currentFrameRate()}
      animatedStyle={{
      opacity,
      // write_on wipes the whole media wrapper: the composition-sized box,
      // in its own (pre-transform) space, so it travels with the actor pose.
      // CanvasKit clips the same group-local rect before its group transform.
      ...(wipeRight > 0 ? { clipPath: `inset(0 ${wipeRight * 100}% 0 0)` } : {}),
      filter: hasWhipOut && (whipOutStyle?.blurPx ?? 0) > 0.001 ? `url(#${smearId})` : hasSmearOut && smearPulse > 0.001 ? `url(#${smearId})` : blurPx > 0.01 ? `blur(${blurPx}px)` : undefined,
      ...(needsTransform ? {
        transform: cubeOutStyle ? `${cubeOutStyle.transform} translate(${translateX}px, ${translateY}px) rotateZ(${animationRotateZDeg}deg) scale(${scale})` : `perspective(1100px) translate3d(${transitionTranslateXPercent + (whipOutStyle?.translateXPercent ?? 0)}%, ${transitionTranslateYPercent + (whipOutStyle?.translateYPercent ?? 0)}%, 0) translate(${translateX}px, ${translateY}px) rotateX(0deg) rotateY(${whipOutStyle?.rotateYDeg ?? 0}deg) rotateZ(${animationRotateZDeg + (whipOutStyle?.rotateZDeg ?? 0)}deg) scale(${scale * (whipOutStyle?.scale ?? 1)})`,
        transformOrigin: cubeOutStyle?.transformOrigin ?? "center",
        backfaceVisibility: "hidden",
      } : {}),
      ...(hasSmearOut ? { transform: smearOut.transform } : {}),
      }}
    >
      {hasWhipOut && <SmearFilter id={smearId} blur={(whipOutStyle?.blurPx ?? 0) * width / 1080} vertical={smearVertical} />}
      {hasSmearOut && <SmearFilter id={smearId} blur={smearOut.blurPx} vertical={smearVertical} />}
      {children}
    </FixedTransitionViewport>
  );
}


function VisualTransitionWrapper({
  element,
  durationInFrames,
  children,
}: {
  element: CompositionElement;
  durationInFrames: number;
  children: React.ReactNode;
}) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const incomingProgress = transitionProgress(frame, element.transition_in, durationInFrames);
  const incomingType = element.transition_in?.type ?? null;
  const direction = resolveTransitionDirection(element.transition_in?.params);
  const travelPercentProp = element.props?.transition_travel_percent;
  const travelPercent = typeof travelPercentProp === "number" && Number.isFinite(travelPercentProp)
    ? Math.max(1, Math.min(100, travelPercentProp))
    : 100;

  const smear = (incomingType === "slide" || incomingType === "whip")
    && element.transition_in?.params?.motion === "smear";
  const smearId = `smear-in-${element.id}`;
  const smearVertical = direction === "from-top" || direction === "from-bottom";
  let opacity = 1;
  let transform = "translate3d(0, 0, 0)";
  let clipPath: string | undefined;
  let filter: string | undefined;

  if (incomingType === "fade" && incomingProgress != null) {
    opacity *= incomingProgress;
  }
  if (incomingType === "slide" && incomingProgress != null) {
    const slide=resolveSlideTransitionVisualStyle(incomingProgress,'in',direction,element.transition_in?.params,travelPercent);
    opacity*=slide.opacity;
    filter=slide.blurPx>.01?`blur(${slide.blurPx}px)`:undefined;
    transform=`translate3d(${slide.translateXPercent}%, ${slide.translateYPercent}%, 0) scale(${slide.scale})`;
  }
  if (smear && incomingProgress != null) {
    const style = resolveSmearTransitionVisualStyle(incomingProgress, "in", direction, element.transition_in?.params, width);
    opacity = style.opacity;
    transform = style.transform;
    filter = incomingProgress > 0 && incomingProgress < 1 ? `url(#${smearId})` : undefined;
  }
  if (incomingType === "wipe" && incomingProgress != null) {
    const reveal = Math.max(0, Math.min(100, incomingProgress * 100));
    if (direction === "from-right") clipPath = `inset(0 0 0 ${100 - reveal}%)`;
    else if (direction === "from-top") clipPath = `inset(${100 - reveal}% 0 0 0)`;
    else if (direction === "from-bottom") clipPath = `inset(0 0 ${100 - reveal}% 0)`;
    else clipPath = `inset(0 ${100 - reveal}% 0 0)`;
  }
  if (incomingType === "whip" && !smear && incomingProgress != null) {
    const whip = resolveWhipTransitionVisualStyle(
      incomingProgress,
      "in",
      direction,
      resolveWhipBlurStrength(element.transition_in?.params),
      element.transition_in?.params,
    );
    transform = `perspective(900px) translate3d(${whip.translateXPercent}%, ${whip.translateYPercent}%, 0) rotateY(${whip.rotateYDeg}deg) rotateZ(${whip.rotateZDeg}deg) scale(${whip.scale})`;
    opacity *= whip.opacity;
    filter = whip.blurPx > 0.01 ? `url(#${smearId})` : undefined;
  }
  if (incomingType === "cube" && incomingProgress != null) {
    const cube = resolveCubeTransitionVisualStyle(incomingProgress, "in", direction, width, height);
    transform = cube.transform;
  }
  const cubeInStyle = incomingType === "cube" && incomingProgress != null
    ? resolveCubeTransitionVisualStyle(incomingProgress, "in", direction, width, height)
    : null;

  if (incomingType && isAccentTransition(incomingType) && incomingProgress != null) {
    const accent = accentTransitionFrame(incomingType, incomingProgress, element.transition_in?.params);
    return <AbsoluteFill>
      <FixedTransitionViewport element={element} timeSeconds={0} animatedStyle={{opacity: accent.incomingOpacity}}>{children}</FixedTransitionViewport>
      <AbsoluteFill style={{background: accent.background, opacity: accent.washOpacity, pointerEvents: 'none'}} />
    </AbsoluteFill>;
  }

  return (
    <FixedTransitionViewport
      element={element}
      timeSeconds={0}
      animatedStyle={{
        opacity,
        transform,
        clipPath,
        filter,
        transformOrigin: cubeInStyle?.transformOrigin ?? "center",
        backfaceVisibility: "hidden",
      }}
    >
      {incomingType === "whip" && !smear && <SmearFilter id={smearId} blur={resolveWhipTransitionVisualStyle(incomingProgress ?? 0, "in", direction, resolveWhipBlurStrength(element.transition_in?.params)).blurPx * width / 1080} vertical={smearVertical} />}
      {smear && <SmearFilter id={smearId} blur={resolveSmearTransitionVisualStyle(incomingProgress ?? 0, "in", direction, element.transition_in?.params, width).blurPx} vertical={smearVertical} />}
      {children}
    </FixedTransitionViewport>
  );
}

function PageTurnTransitionOverlay({
  outgoingElement,
  incomingElement,
  transition,
  durationInFrames,
}: {
  outgoingElement: CompositionElement;
  incomingElement: CompositionElement;
  transition: TimelineTransition;
  durationInFrames: number;
}) {
  const frame = useCurrentFrame();
  const progress = transitionProgress(frame, transition, durationInFrames) ?? 0;
  const {width,height}=useVideoConfig();
  const {turnsFromBottomRight,pageTurn,usesSegmentedCurl,curlSegmentCount,pageLift,positionedCurlSegments,frontShade,castShadow,backShade,turnTransform,backFaceTransform}=pageTurnVisualPlan(progress,transition.params,outgoingElement.type,width,height);

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <FixedTransitionViewport
        element={incomingElement}
        timeSeconds={0}
        animatedStyle={{ transform: "translate3d(0,0,0)" }}
      >
        <BoundaryHoldVisual element={incomingElement} side="head" />
      </FixedTransitionViewport>

      <AbsoluteFill
        style={{
          background: castShadow,
          opacity: pageTurn.shadowOpacity,
          pointerEvents: "none",
          zIndex: 1,
        }}
      />

      <AbsoluteFill
        style={{
          perspective: usesSegmentedCurl ? "4000px" : "760px",
          perspectiveOrigin: "50% 50%",
          pointerEvents: "none",
          zIndex: 2,
        }}
      >
        {usesSegmentedCurl ? (
          <AbsoluteFill
            style={{
              transform: turnsFromBottomRight
                ? `translate3d(0, ${-pageLift * height * 0.04}px, 0) rotateZ(${pageLift * 10}deg)`
                : "translate3d(0,0,0)",
              transformOrigin: "right bottom",
              transformStyle: "preserve-3d",
            }}
          >
          {positionedCurlSegments.map((segment) => {
          const panelShadeOpacity = Math.min(
            0.22,
            Math.abs(Math.sin(segment.rotationDeg * Math.PI / 180)) * 0.16
              + (segment.index / curlSegmentCount) * pageTurn.pageShadeOpacity * 0.06,
          );
          const panelBackTransform = `rotateY(180deg) translateZ(0.5px)`;
          return (
            <div
              key={`page-curl-segment-${segment.index}`}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: segment.panelWidth + 1.25,
                height,
                transform: `translate3d(${segment.panelX}px, ${segment.panelY}px, ${segment.panelZ + pageLift * 6}px)`,
                transformStyle: "preserve-3d",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  clipPath: segment.clipPath,
                  transform: `rotateX(${segment.tiltXDeg}deg) rotateY(${segment.rotationDeg}deg)`,
                  transformOrigin: segment.transformOrigin,
                  transformStyle: "preserve-3d",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    overflow: "hidden",
                    backfaceVisibility: "hidden",
                    transform: "translateZ(0.5px)",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      left: -segment.contentCropX,
                      top: 0,
                      width,
                      height,
                    }}
                  >
                    <BoundaryHoldVisual element={outgoingElement} side="tail" />
                  </div>
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "#000",
                      opacity: panelShadeOpacity,
                    }}
                  />
                </div>
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    overflow: "hidden",
                    backfaceVisibility: "hidden",
                    background: "#e8e1d7",
                    transform: panelBackTransform,
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      left: -segment.contentCropX,
                      top: 0,
                      width,
                      height,
                      filter: "saturate(0.72) brightness(0.82)",
                      opacity: 0.76,
                    }}
                  >
                    <BoundaryHoldVisual element={outgoingElement} side="tail" />
                  </div>
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "rgba(232,225,215,0.34)",
                    }}
                  />
                </div>
              </div>
            </div>
          );
          })}
          </AbsoluteFill>
        ) : (
          <AbsoluteFill
            style={{
              transform: turnTransform,
              transformOrigin: pageTurn.transformOrigin,
              transformStyle: "preserve-3d",
            }}
          >
            <AbsoluteFill
              style={{
                backfaceVisibility: "hidden",
                transform: "translateZ(0.5px)",
                transformStyle: "preserve-3d",
              }}
            >
              <FixedTransitionViewport
                element={outgoingElement}
                timeSeconds={Math.max(0, outgoingElement.duration)}
                animatedStyle={{ transform: "translate3d(0,0,0)" }}
              >
                <BoundaryHoldVisual element={outgoingElement} side="tail" />
              </FixedTransitionViewport>
              <AbsoluteFill
                style={{
                  background: frontShade,
                  opacity: pageTurn.pageShadeOpacity,
                }}
              />
            </AbsoluteFill>

            <AbsoluteFill
              style={{
                backfaceVisibility: "hidden",
                background: backShade,
                boxShadow: `0 0 64px rgba(0,0,0,${pageTurn.shadowOpacity})`,
                transform: backFaceTransform,
              }}
            />
          </AbsoluteFill>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

function BoundaryHoldVisual({
  element,
  side,
  requiresTightVideoSync = false,
  headMotionFrames = 0,
  sliceOffsetFrames,
}: {
  element: CompositionElement;
  side: BoundaryHoldSide;
  requiresTightVideoSync?: boolean;
  headMotionFrames?: number;
  sliceOffsetFrames?: number;
}) {
  const { isRendering } = useRemotionEnvironment();
  if (!element.source_url) {
    return <AbsoluteFill />;
  }

  if (element.type === "video_clip") {
    const playbackSource = resolveVideoPlaybackSource(element, element.source_url, isRendering);
    if (!playbackSource) return <AbsoluteFill />;
    const mediaTrimWindow = getMediaTrimWindow(element);
    // A reversed clip opens on its last source frame and closes on its first.
    const reversed = isPlaybackReversed(element);
    const preroll = side === "head" && headMotionFrames > 0 && !reversed
      ? resolveIncomingTransitionPreroll(mediaTrimWindow.trimBefore, headMotionFrames, element.playback_rate)
      : null;
    const trimBefore = preroll?.trimBefore ?? ((side === "head") !== reversed
      ? mediaTrimWindow.trimBefore
      : Math.max(0, mediaTrimWindow.sourceEndFrame - 1));
    const trimAfter = preroll?.trimAfter ?? (side === "head"
      ? Math.max(mediaTrimWindow.trimBefore + 1, trimBefore + 1)
      : Math.max(mediaTrimWindow.sourceEndFrame, trimBefore + 1));

    const picture = (
          <TimelineVideo
            element={element}
            src={playbackSource}
            style={{ width: "100%", height: "100%", objectFit: "contain", ...mediaDropShadowStyle(element), ...cutoutReviewVideoStyle(element), ...chromaKeyReviewVideoStyle(element) }}
            playbackRate={element.playback_rate}
            {...(requiresTightVideoSync
              ? { acceptableTimeShiftInSeconds: COMPOSITED_VIDEO_SYNC_TOLERANCE_SECONDS }
              : {})}
            pauseWhenBuffering={false}
            useWebAudioApi={false}
            volume={() => 0}
            {...(hasAlphaChannel(element) ? { transparent: true } : {})}
            {...(trimBefore > 0 ? { trimBefore } : {})}
            trimAfter={trimAfter}
          />
    );
    // A source-tail hold freezes decoded picture, not the clip's effect clock.
    // Boundary transition snapshots retain their existing fixed transform clock.
    const transformed = <MediaTransformFrame element={element} sliceOffsetFrames={sliceOffsetFrames ?? 0}>
      {preroll ? picture : <Freeze frame={0}>{picture}</Freeze>}
    </MediaTransformFrame>;
    return sliceOffsetFrames !== undefined || preroll ? transformed : <Freeze frame={0}>{transformed}</Freeze>;
  }

  return (
    <MediaTransformFrame element={element}>
      <Img
        src={resolveStillPlaybackSource(element.source_url, isRendering, element.duration, element.props)}
        decoding={isRendering ? "sync" : "async"}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          ...mediaDropShadowStyle(element),
          ...mediaImageRenderingStyle(element),
        }}
      />
    </MediaTransformFrame>
  );
}

export function MediaTransformFrame({
  element,
  sliceOffsetFrames = 0,
  children,
}: {
  element: Pick<CompositionElement, "props">;
  sliceOffsetFrames?: number;
  children: React.ReactNode;
}) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const timeSeconds = (sliceOffsetFrames + frame) / currentFrameRate();
  const scene = resolveMediaScene(element.props, timeSeconds, { width, height });
  const colorGrade = scene.grade;
  const colorGradeLut = resolveColorGradeLutAtTime(element.props, timeSeconds);

  return (
    <SpiralGroupFrame props={element.props} offsetSeconds={sliceOffsetFrames / currentFrameRate()}>
    <AbsoluteFill style={scene.styles.outer}>
      <AbsoluteFill style={scene.styles.transition}>
      <DirectionalBlurFilter props={element.props} x={scene.directionalBlur.x} y={scene.directionalBlur.y}>
      {/* Glitch displaces the placed, coloured picture in composition pixels (resolveGlitchAtTime), before blur. */}
      <GlitchFilter props={element.props} seconds={timeSeconds} width={width} height={height}>
      <AbsoluteFill style={scene.styles.translate}>
        <AbsoluteFill style={scene.styles.scale}>
          <AbsoluteFill style={scene.styles.surface}>
            {/* Color map follows grade/LUT (resolveGradientMapAtTime). */}
            <GradientMapFilter props={element.props} seconds={timeSeconds}>
            <ColorGradeFilter sourceRecolor={resolveRecolor(element.props)} sourceOrientationStyle={scene.styles.mirror} grade={colorGrade} lut={colorGradeLut} mountIdentity={hasColorGradeData(element.props)}>
              <SubjectGlowFilter props={element.props} seconds={timeSeconds} width={width}><RecolorFilter props={element.props}><PaperContourFilter props={element.props} seconds={timeSeconds}><StickerOutlineFilter props={element.props} seconds={timeSeconds} width={width}><AbsoluteFill style={scene.styles.mirror}>{children}</AbsoluteFill></StickerOutlineFilter></PaperContourFilter></RecolorFilter></SubjectGlowFilter>
            </ColorGradeFilter>
            </GradientMapFilter>
          </AbsoluteFill>
        </AbsoluteFill>
      </AbsoluteFill>
      </GlitchFilter>
      </DirectionalBlurFilter>
      </AbsoluteFill>
      <AbsoluteFill style={scene.styles.edgeBlur} />
    </AbsoluteFill>
    </SpiralGroupFrame>
  );
}

function audioVolume(
  el: CompositionElement,
  durationInFrames: number,
  openingGainOverride: number | null = null,
): (frame: number) => number {
  const fadeInFrames = secToFrames(el.fade_in);
  const fadeOutFrames = secToFrames(el.fade_out);
  const storedEnvelope = readVolumeEnvelopePoints(el, el.duration);
  const envelope = openingGainOverride == null
    ? storedEnvelope
    : retargetVolumeEnvelope(storedEnvelope, openingGainOverride);
  const hasFlatEnvelope = envelope.every((point) => point.volume === envelope[0]?.volume);
  const hasAutomation =
    fadeInFrames > 0
    || fadeOutFrames > 0
    || !!el.transition_in
    || !!el.transition_out
    || !hasFlatEnvelope;

  if (!hasAutomation) {
    const staticVolume = roundAudioAutomationValue(envelope[0]?.volume ?? 1);
    return () => staticVolume;
  }

  const framesPerSample = Math.max(1, Math.round(currentFrameRate() / AUDIO_AUTOMATION_SAMPLE_FPS));
  const transitionOutFrames = el.transition_out
    ? Math.max(1, secToFrames(el.transition_out.duration_seconds))
    : 0;

  return (frame: number) => {
    // Remotion serializes volume callbacks into ffmpeg expressions. Sampling at a
    // lower fixed rate keeps the exported filter graph small enough for ffmpeg to parse.
    const sampledFrame = resolveAudioAutomationSampleFrame({
      frame,
      durationInFrames,
      framesPerSample,
      transitionOutFrames,
    });
    const currentTimeSec = Math.min(el.duration, Math.max(0, sampledFrame / currentFrameRate()));
    const envelopeVolume = interpolateEnvelopeVolume(envelope, currentTimeSec);
    // Suppress clip fades when a transition exists on that side — the transition crossfade replaces them
    const inVol =
      fadeInFrames > 0 && !el.transition_in
        ? interpolate(sampledFrame, [0, fadeInFrames], [0, 1], { extrapolateRight: "clamp" })
        : 1;
    const outVol =
      fadeOutFrames > 0 && !el.transition_out
        ? interpolate(
            sampledFrame,
            [durationInFrames - fadeOutFrames, durationInFrames],
            [1, 0],
            { extrapolateLeft: "clamp" },
        )
      : 1;
    const transitionOutMultiplier = resolveTransitionAudioMultiplier(
      sampledFrame,
      durationInFrames,
      el.transition_out,
    );
    return roundAudioAutomationValue(envelopeVolume * inVol * outVol * transitionOutMultiplier);
  };
}

function TimelineAudioTrack({
  element,
  isRendering,
}: {
  element: CompositionElement;
  isRendering: boolean;
}) {
  const previewGain = usePreviewAudioGain(element.id);
  const playbackSource = catalogAudioPreviewUrl(element.source_url!, isRendering);
  const span = getFrameSpan(element.timeline_start, element.duration);
  const durationInFrames = span.durationInFrames;
  const mediaTrimWindow = getMediaTrimWindow(element);
  // Lock topology to persisted state during a fader gesture. Repeatedly crossing
  // native/Web Audio while the pointer moves remounts the clock and produces the
  // exact stutter this live-preview path exists to prevent. A committed crossing
  // switches once after release; native preview is therefore capped at unity
  // during the gesture.
  const authoredTopologyUsesWebAudio = shouldUseWebAudioForMedia({
    src: element.source_url,
    needsAmplification: needsWebAudioAmplification(element),
  });
  const usesWebAudio = shouldUseWebAudioForTimelineTrack(
    isRendering,
    authoredTopologyUsesWebAudio,
  );
  const liveGain = isRendering
    ? null
    : previewGain == null
      ? null
      : usesWebAudio
        ? previewGain
        : Math.min(1, previewGain);

  return (
    <Sequence
      from={span.from}
      durationInFrames={durationInFrames}
      premountFor={getPremountFrames(element, isRendering)}
    >
      <Audio
        key={previewAudioPlaybackIdentity(element, playbackSource, usesWebAudio)}
        src={playbackSource}
        pauseWhenBuffering={shouldPauseTimelineForAudioBuffering(element.type)}
        volume={audioVolume(element, durationInFrames, liveGain)}
        playbackRate={element.playback_rate}
        crossOrigin={usesWebAudio ? "anonymous" : undefined}
        useWebAudioApi={usesWebAudio}
        title={`timeline-audio:${element.id}:${usesWebAudio ? "web-audio" : "native-media"}`}
        {...(mediaTrimWindow.trimBefore > 0 ? { trimBefore: mediaTrimWindow.trimBefore } : {})}
        trimAfter={mediaTrimWindow.trimAfter}
      />
    </Sequence>
  );
}

function PreviewNarrationSegment({
  element,
  sourceUrl,
  isRendering,
  durationInFrames,
  frameOffset,
  segmentIndex,
  playbackRate,
  speedSegments,
  trimBefore,
  trimAfter,
}: {
  element: CompositionElement;
  sourceUrl: string;
  isRendering: boolean;
  durationInFrames: number;
  frameOffset: number;
  segmentIndex: number;
  playbackRate: number;
  speedSegments?: SpeedStepSegment[];
  trimBefore: number;
  trimAfter: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const forward = speedSegments ? speedStepFrame(speedSegments, frame, fps) : null;
  // A reversed clip's sidecar is the source sound played backward, so its clock runs forward from `duration - end`.
  const reversedDuration = forward && "reverse" in forward ? reversedPreviewAudioDuration(element) : null;
  const mapped = forward && reversedDuration != null
    ? { playbackRate: forward.playbackRate, sourceTimeSeconds: Math.max(0, reversedDuration - forward.sourceTimeSeconds) }
    : forward ?? {};
  if (reversedDuration != null) {
    trimBefore = Math.max(0, Math.round((reversedDuration - trimAfter / fps) * fps));
    trimAfter = Math.max(trimBefore + 1, Math.round((reversedDuration - (speedSegments?.[0]?.sourceStart ?? 0)) * fps));
  }
  const previewGain = usePreviewAudioGain(element.id);
  const bakedGain = readPreviewAudioBakedGain(element);
  const authoredTopologyUsesWebAudio = shouldUseWebAudioForMedia({
    src: sourceUrl,
    needsAmplification: shouldUseWebAudioForPreviewNarration(element),
  });
  // Remotion pools HTMLAudioElements. If a volume edit moves one pooled tag
  // from native media to Web Audio and later back again, that tag can keep
  // playing into a disconnected node: its clock advances, but it is silent.
  // Use the same persistent Web Audio topology as standalone timeline audio
  // during preview, and preserve the authored topology for deterministic render.
  const usesWebAudio = shouldUseWebAudioForTimelineTrack(
    isRendering,
    authoredTopologyUsesWebAudio,
  );
  const liveGain = isRendering ? null : previewGain;
  const volumeAtFrame = audioVolume(element, durationInFrames, liveGain);

  return (
    <Audio
      key={`${previewAudioPlaybackIdentity(element, sourceUrl, usesWebAudio)}:${segmentIndex}`}
      src={sourceUrl}
      pauseWhenBuffering
      volume={(frame) => previewNarrationGain(
        volumeAtFrame(frame + frameOffset),
        usesWebAudio,
        bakedGain,
      )}
      playbackRate={playbackRate}
      {...mapped}
      crossOrigin={usesWebAudio ? "anonymous" : undefined}
      useWebAudioApi={usesWebAudio}
      title={`preview-narration:${element.id}:${usesWebAudio ? "web-audio" : "native-media"}`}
      {...(trimBefore > 0 ? { trimBefore } : {})}
      trimAfter={trimAfter}
    />
  );
}

export function TimelineComposition({
  elements: inputElements,
  laneOrderKeys = [],
  renderScale = 1,
  externalAudioPreview = false,
  captionOverlayOnly = false,
}: Props) {
  const elements = useMemo(() => resolveLetterFallFollowers(inputElements), [inputElements]);
  const { isRendering } = useRemotionEnvironment();
  const requiredFontFamilies = [...new Set(elements.filter(el => el.type === "caption_text")
    .map(el => captionRemotionFontFamily(resolveCaptionProps(el.props).fontPreset)
      .split(",")[0]!.trim().replace(/^['"]|['"]$/g, "")))].sort();
  const fontKey = JSON.stringify(requiredFontFamilies);
  const fontsHandle = useRenderResource(`caption fonts: ${fontKey}`);
  useEffect(() => {
    const ready = isRendering
      ? ensureRequiredRemotionFonts(JSON.parse(fontKey) as string[])
      : ensureRemotionGoogleFonts();
    let cancelled = false;
    void ready.then(() => { if (!cancelled) fontsHandle.done(); }, error => { if (!cancelled) fontsHandle.fail(error); });
    return () => { cancelled = true; };
  }, [fontsHandle, fontKey, isRendering]);
  // Stroke packs load on demand; seek/capture/export wait for the ones this timeline uses.
  useHandwritingAssetReadiness(elements);

  const visualLanes = new Map<string, CompositionElement[]>();
  const captionLanes = new Map<string, CompositionElement[]>();
  const audioElements: CompositionElement[] = [];

  const projectedElements = projectCompoundPreviews(elements, isRendering || captionOverlayOnly);
  for (const el of projectedElements) {
    if (el.lane_key.startsWith("visual_")) {
      if (!resolveVisualRenderPlan(el).sourceUrl) continue;
      const existing = visualLanes.get(el.lane_key) ?? [];
      existing.push(el);
      visualLanes.set(el.lane_key, existing);
    } else if (isCompositionAudioLane(el.lane_key)) {
      if (!el.source_url) continue;
      audioElements.push(el);
    } else if (el.lane_key.startsWith("captions_") && el.type === "caption_text") {
      const existing = captionLanes.get(el.lane_key) ?? [];
      existing.push(el);
      captionLanes.set(el.lane_key, existing);
    }
  }

  const visualElementsForCaptionSafeArea = captionSafeAreaVisuals(projectedElements);

  const videoEntries = Array.from(visualLanes.entries()).flatMap(([laneKey, laneElements]) =>
    laneElements.flatMap((element) => {
      const plan = resolveVisualRenderPlan(element);
      return plan.renderKind === "video"
        ? [{
            id: plan.mediaElement.id,
            laneKey,
            timelineStart: plan.mediaElement.timeline_start,
            duration: plan.mediaElement.duration,
          }]
        : [];
    }),
  );
  const tightlySyncedVideoIds = collectTightlySyncedVideoIds(videoEntries);

  const compositingLaneKeys = buildCompositingLaneOrder({
    visualLaneKeys: visualLanes.keys(),
    captionLaneKeys: captionLanes.keys(),
    persistedLaneOrderKeys: laneOrderKeys,
  });

  return (
    <AbsoluteFill style={{ background: captionOverlayOnly ? "transparent" : "#000000" }}>
      <StickerOutlineFilterDefs />
      {/* Visual and caption lanes share one authoritative back-to-front stack. */}
      {compositingLaneKeys.map((laneKey, laneStackIndex) => {
        if (laneKey.startsWith("captions_")) {
          const laneCaptions = (captionLanes.get(laneKey) ?? [])
            .slice()
            .sort(compareCaptionPaintOrder);
          return (
            <Fragment key={laneKey}>
              {laneCaptions.map((el) => {
                const span = getFrameSpan(el.timeline_start, el.duration);
                const captionProps = resolveCaptionProps(el.props);
                const sourceAspectRatio = resolveCaptionSourceAspectRatio(el, visualElementsForCaptionSafeArea);
                return (
                  <AbsoluteFill
                    key={el.id}
                    style={{
                      zIndex: laneStackIndex,
                      ...captionCompositingCSS(captionProps.styleVariant),
                    }}
                  >
                    <Sequence from={span.from} durationInFrames={span.durationInFrames}>
                      {el.props?.surface_track ? <TrackedSurfaceText element={el} presentationParents={visualElementsForCaptionSafeArea.slice().sort((a,b)=>compositingLaneKeys.indexOf(a.lane_key)-compositingLaneKeys.indexOf(b.lane_key))} parent={elements.find(candidate => candidate.id === (el.props?.surface_track as {parentId?:string})?.parentId)} /> : <SpiralGroupFrame props={el.props}><CaptionSequence element={el} sourceAspectRatio={sourceAspectRatio} renderScale={renderScale} /></SpiralGroupFrame>}
                    </Sequence>
                  </AbsoluteFill>
                );
              })}
            </Fragment>
          );
        }

        if (captionOverlayOnly) return null;
        const laneEls = (visualLanes.get(laneKey) ?? []).slice().sort((a, b) => a.timeline_start - b.timeline_start);
        const laneRenderPlans = laneEls.map((element) => ({
          element,
          plan: resolveVisualRenderPlan(element),
        }));
        return (
          <Fragment key={laneKey}>
            {laneRenderPlans.map(({ element, plan }) => {
              const mediaElement = plan.mediaElement;
              if (!plan.sourceUrl) return null;
              const resolvedSource = resolveVideoPlaybackSource(mediaElement, plan.sourceUrl, isRendering);
              const playbackSource = resolvedSource && plan.renderKind === "still"
                ? resolveStillPlaybackSource(resolvedSource, isRendering, mediaElement.duration, mediaElement.props)
                : resolvedSource;
              if (!playbackSource) return (
                <Sequence key={element.id} from={secToFrames(mediaElement.timeline_start)} durationInFrames={Math.max(1, secToFrames(mediaElement.duration))}>
                  <div data-preview-proxy-blocked="true" data-preview-preparing={(mediaElement.props?.runtime_preview_preparation as { state?: string } | undefined)?.state === "preparing" ? "true" : undefined} style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "#171717", color: "white", padding: 24, textAlign: "center" }}>
                    {(mediaElement.props?.runtime_preview_preparation as { state?: string; error?: string } | undefined)?.state === "preparing"
                      ? "Preparing preview… This video will be ready automatically."
                      : (mediaElement.props?.runtime_preview_preparation as { error?: string } | undefined)?.error ?? "Prepare preview: this video needs a verified low-resolution proxy."}
                  </div>
                </Sequence>
              );
              const previewAudioSource = resolvePreviewAudioSource(mediaElement, isRendering);
              const span = getFrameSpan(mediaElement.timeline_start, mediaElement.duration);
              const dur = span.durationInFrames;
              const mediaAudioVolume = audioVolume(mediaElement, dur);
              const {leadingHoldFrames, playableDurationFrames, playbackSegments, overflowDurationFrames}
                = mediaPicturePlan(mediaElement, plan.renderKind === "video", currentFrameRate());
              const premountFor = getPremountFrames(mediaElement, isRendering);
              const needsTightVideoSync = playbackSegments.length > 1 || requiresTightVideoSync({
                id: mediaElement.id,
                hasSeparatePreviewAudio: Boolean(previewAudioSource),
                hasAudibleEmbeddedAudio: !previewAudioSource && mediaElement.volume > 0,
                isSilentCompositingLayer: hasAlphaChannel(mediaElement),
                isSpeechLinked: Boolean(mediaElement.props?.speech_sync_binding),
                tightlySyncedVideoIds,
              });
              const pauseTimelineForVideoBuffering = shouldPauseTimelineForVideoBuffering({
                isSpeechLinked: Boolean(mediaElement.props?.speech_sync_binding),
                hasSeparatePreviewAudio: Boolean(previewAudioSource),
                hasAudibleEmbeddedAudio: !previewAudioSource && mediaElement.volume > 0,
              });
              const embeddedVideoUsesWebAudio = shouldUseWebAudioForMedia({
                src: playbackSource,
                needsAmplification: !previewAudioSource && needsWebAudioAmplification(mediaElement),
              });
              return (
                <AbsoluteFill key={element.id}>
                  {plan.renderKind === "video" && leadingHoldFrames > 0 ? (
                    <Sequence
                      from={span.from}
                      durationInFrames={leadingHoldFrames}
                      premountFor={premountFor}
                    >
                      <AnimationWrapper
                        element={mediaElement}
                        totalDurationFrames={dur}
                        sliceOffsetFrames={0}
                        suppressIn={!!mediaElement.transition_in}
                        suppressOut={false}
                      >
                        <BoundaryHoldVisual
                          element={mediaElement}
                          side="head"
                          requiresTightVideoSync={needsTightVideoSync}
                        />
                      </AnimationWrapper>
                    </Sequence>
                  ) : null}
                  <Sequence
                    from={span.from + (plan.renderKind === "video" ? leadingHoldFrames : 0)}
                    durationInFrames={supportsOverflowHold(mediaElement.type) ? playableDurationFrames : dur}
                    premountFor={premountFor}
                  >
                    <AnimationWrapper
                      element={mediaElement}
                      totalDurationFrames={dur}
                      sliceOffsetFrames={plan.renderKind === "video" ? leadingHoldFrames : 0}
                      suppressIn={!!mediaElement.transition_in}
                      suppressOut={!!mediaElement.transition_out}
                    >
                      {plan.renderKind === "video" ? (
                        <>
                          <MediaTransformFrame
                            element={mediaElement}
                            sliceOffsetFrames={leadingHoldFrames}
                          >
                                  <TimelineVideo
                                    element={mediaElement}
                                    sliceOffsetFrames={leadingHoldFrames}
                                    src={playbackSource}
                                    style={{ width: "100%", height: "100%", objectFit: "contain", ...mediaDropShadowStyle(mediaElement), ...cutoutReviewVideoStyle(mediaElement), ...chromaKeyReviewVideoStyle(mediaElement) }}
                                    playbackRate={mediaElement.playback_rate}
                                    speedSegments={playbackSegments}
                                    {...(needsTightVideoSync
                                      ? { acceptableTimeShiftInSeconds: COMPOSITED_VIDEO_SYNC_TOLERANCE_SECONDS }
                                      : {})}
                                    pauseWhenBuffering={pauseTimelineForVideoBuffering || playbackSegments.length > 1}
                                    volume={previewAudioSource ? () => 0 : (frame) => mediaAudioVolume(frame + leadingHoldFrames)}
                                    crossOrigin={embeddedVideoUsesWebAudio ? "anonymous" : undefined}
                                    useWebAudioApi={embeddedVideoUsesWebAudio}
                                    {...(hasAlphaChannel(mediaElement) ? { transparent: true } : {})}
                                    trimBefore={secToFrames(playbackSegments[0]!.sourceStart)}
                                    trimAfter={secToFrames(playbackSegments.at(-1)!.sourceEnd)}
                                  />
                          </MediaTransformFrame>
                          {previewAudioSource ? (
                            <PreviewNarrationSegment
                              element={mediaElement} sourceUrl={previewAudioSource}
                              isRendering={isRendering} durationInFrames={dur}
                              frameOffset={leadingHoldFrames} segmentIndex={0}
                              playbackRate={mediaElement.playback_rate} speedSegments={playbackSegments}
                              trimBefore={secToFrames(playbackSegments[0]!.sourceStart)}
                              trimAfter={secToFrames(playbackSegments.at(-1)!.sourceEnd)}
                            />
                          ) : null}
                        </>
                      ) : plan.sourceUrl ? (
                        <MediaTransformFrame
                          element={mediaElement}
                          sliceOffsetFrames={0}
                        >
                          <Img
                            src={playbackSource}
                            decoding={isRendering ? "sync" : "async"}
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "contain",
                              ...mediaDropShadowStyle(mediaElement),
                              ...mediaImageRenderingStyle(mediaElement),
                            }}
                          />
                        </MediaTransformFrame>
                      ) : (
                        <AbsoluteFill />
                      )}
                    </AnimationWrapper>
                  </Sequence>
                  {plan.renderKind === "video" && overflowDurationFrames > 0 ? (
                    <Sequence
                      from={span.from + leadingHoldFrames + playableDurationFrames}
                      durationInFrames={overflowDurationFrames}
                      premountFor={premountFor}
                    >
                      <AnimationWrapper
                        element={mediaElement}
                        totalDurationFrames={dur}
                        sliceOffsetFrames={leadingHoldFrames + playableDurationFrames}
                        suppressIn={false}
                        suppressOut={!!mediaElement.transition_out}
                      >
                        <BoundaryHoldVisual
                          element={mediaElement}
                          side="tail"
                          sliceOffsetFrames={leadingHoldFrames + playableDurationFrames}
                          requiresTightVideoSync={needsTightVideoSync}
                        />
                      </AnimationWrapper>
                    </Sequence>
                  ) : null}
                </AbsoluteFill>
              );
            }).map((node, index) => <AbsoluteFill key={laneRenderPlans[index].element.id} data-timeline-element-id={laneRenderPlans[index].element.id} style={{ zIndex: laneStackIndex, ...mediaBlendStyle(laneRenderPlans[index].plan.mediaElement.props?.media_blend_mode), ...(laneRenderPlans[index].element.picture_hidden ? { visibility: "hidden" as const } : {}) }}><SubjectWindow props={laneRenderPlans[index].plan.mediaElement.props}>{node}</SubjectWindow></AbsoluteFill>)}
            {laneRenderPlans.map(({ element: fromElement }, index) => {
              const transition = fromElement.transition_out;
              if (!transition) return null;

              const toEntry = laneRenderPlans[index + 1];
              if (!toEntry || toEntry.element.id !== transition.to_element_id || !toEntry.plan.sourceUrl) return null;
              // Hidden lanes keep their video sound but draw no picture, including transition overlays.
              if (fromElement.picture_hidden || toEntry.element.picture_hidden) return null;

              const transitionWindow = deriveTransitionWindow(fromElement, transition);

              return (
                <Sequence
                  key={`${transition.id}-overlay`}
                  style={{ zIndex: laneStackIndex, ...mediaBlendStyle(toEntry.plan.mediaElement.props?.media_blend_mode) }}
                  from={transitionWindow.startFrame}
                  durationInFrames={transitionWindow.durationFrames}
                  premountFor={getPremountFrames(toEntry.plan.mediaElement, isRendering)}
                >
                  {transition.type === "page_turn" ? (
                    <PageTurnTransitionOverlay
                      outgoingElement={laneRenderPlans[index].plan.mediaElement}
                      incomingElement={toEntry.plan.mediaElement}
                      transition={transition}
                      durationInFrames={transitionWindow.durationFrames}
                    />
                  ) : (
                    <SubjectWindow props={toEntry.plan.mediaElement.props} frameOffset={transitionWindow.startFrame}><VisualTransitionWrapper element={toEntry.plan.mediaElement} durationInFrames={transitionWindow.durationFrames}>
                      <BoundaryHoldVisual
                        element={toEntry.plan.mediaElement}
                        side="head"
                        headMotionFrames={transition.type === "whip" && transition.params?.motion === "smear"
                          ? transitionWindow.durationFrames : 0}
                      />
                    </VisualTransitionWrapper></SubjectWindow>
                  )}
                </Sequence>
              );
            })}
          </Fragment>
        );
      })}

      {/* Audio tracks */}
      {!captionOverlayOnly && (!externalAudioPreview || isRendering) && audioElements.map((el) => (
        <TimelineAudioTrack
          key={el.id}
          element={el}
          isRendering={isRendering}
        />
      ))}

    </AbsoluteFill>
  );
}
