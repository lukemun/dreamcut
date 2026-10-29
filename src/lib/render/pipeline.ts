import { DEFAULT_EXPORT_RESOLUTION, exportRenderPlan, type ExportResolution } from "@/lib/render/export-resolution";
import fs from "node:fs";
import { exportWorkerCount } from "./export-parallelism";
import { projectDir } from "@/lib/local-store/paths";
import { renderBrowserVideo, type ExportStage } from "./browser-renderer";
import path from "node:path";

import { COMPOSITION_FPS } from "@/lib/timeline/frame-quantization";
import { withFrameRate } from "@/lib/timeline/frame-rate-scope";
import { buildTimelineTransitionLayout } from "@/lib/timeline/transitions";
import type { TimelineElement, TimelineTransition, TimelineAspectRatio } from "@/components/studio/timeline/types";
import { buildCompositionElements, getCompositionDimensions } from "@/lib/render/composition-adapters";
import { withDensityMotionGraphics } from "@/lib/render/export-density-motion";
import { projectRendersDir } from "@/lib/local-store/paths";
import { COLOR_GRADE_MODEL, hasColorGradeData, validateColorGradeModel } from "@/lib/timeline/color-grade";
import { hasChromaKeyData, validateChromaKeyModel } from "@/lib/timeline/chroma-key";
import { assertFinalRenderAuthority } from "@/lib/qc/final-render-authority";
import { readEnv } from "@/lib/env-name";
import { addWatermark, exportNeedsWatermark } from "./watermark";
export type RenderInput = {
  backend?: "standard" | "rust" | "gpu";
  signal?: AbortSignal;
  onProgress?: (progress: number, stage: ExportStage) => void;
  projectId: string;
  elements: TimelineElement[];
  transitions: TimelineTransition[];
  laneOrderKeys: string[];
  /** Lanes whose sound is silent; pictures still draw. */
  mutedLaneKeys?: string[];
  /** Lanes whose pictures and text are not drawn; video sound still plays unless muted. */
  hiddenLaneKeys?: string[];
  aspectRatio: TimelineAspectRatio;
  /** Project frame rate (projectFrameRate(metadata)). Defaults to 30 for older callers. */
  frameRate?: number;
  /** Origin the headless renderer uses to resolve relative media URLs (e.g. http://127.0.0.1:3123). */
  mediaBaseUrl: string;
  /**
   * Optional working-render scale. Production delivery omits this and renders
   * at the canonical canvas size; iteration renders can use a smaller value
   * (for example 0.25 for 270x480 portrait) to reduce encode time and artifact
   * size without changing timeline geometry.
   */
  renderScale?: number;
  /** Delivery resolution by short side. Below the canonical canvas the encoder downscales full-size frames. */
  resolution?: ExportResolution;
  /** "hdr": 10-bit HLG BT.2020 (VP9 in MP4); needs the GPU backend. Only for mostly-HDR camera footage: SDR
   * pictures sit at HLG reference white and look dim on many HDR screens (see render/dynamic-range.ts). */
  dynamicRange?: "sdr" | "hdr";
  /** Export pages run side by side (GPU segments, audio and Standard frames). Omit to size it to this computer. */
  concurrency?: number;
  /** Intermediate frame format used by Remotion before H.264 encoding. */
  imageFormat?: "jpeg" | "png";
  /** Benchmarks and segment renders: inclusive frame window, and pictures without the audio pass. */
  frameRange?: [number, number];
  pictureOnly?: boolean;
  /** The DreamCut mark in the bottom-right corner. Defaults to on when this computer isn't signed in to
   * DreamCut; benchmark windows and picture-only segments never carry it. */
  watermark?: boolean;
};

export type RenderResult = {
  url: string;
  /** Absolute path of the rendered file inside the project's renders/ dir. */
  filePath: string;
  fileName: string;
  durationSeconds: number;
};

/** Media URLs in elements are project-relative (/api/projects/...); the headless
 *  renderer runs off a file:// bundle, so they must be absolutized first. */
function absolutizeProjectMediaUrl(value: unknown, base: string): unknown {
  if (
    typeof value !== "string"
    || /^https?:\/\//i.test(value)
    || value.startsWith("data:")
    || value.startsWith("file:")
  ) {
    return value;
  }
  return `${base}${value.startsWith("/") ? value : `/${value}`}`;
}

export function absolutizeMediaUrls<T extends { source_url?: string | null; props?: Record<string, unknown> | null }>(
  elements: T[],
  baseUrl: string,
): T[] {
  const base = baseUrl.replace(/\/$/, "");
  return elements.map((element) => {
    const url = element.source_url;
    const sourceUrl = absolutizeProjectMediaUrl(url, base) as typeof url;
    const fillUrls = element.props?.mediaFillUrls;
    const props = element.props == null
      ? element.props
      : {
          ...element.props,
          lut_source_url: absolutizeProjectMediaUrl(element.props.lut_source_url, base),
          text_mask_url: absolutizeProjectMediaUrl(element.props.text_mask_url, base),
          mediaFillVideoUrl: absolutizeProjectMediaUrl(element.props.mediaFillVideoUrl, base),
          mediaFillVideoPreviewUrl: absolutizeProjectMediaUrl(element.props.mediaFillVideoPreviewUrl, base),
          mediaFillUrls: Array.isArray(fillUrls)
            ? fillUrls.map((fillUrl) => absolutizeProjectMediaUrl(fillUrl, base))
            : fillUrls,
        };
    return { ...element, source_url: sourceUrl, props };
  });
}

export async function renderProjectVideo(input: RenderInput): Promise<RenderResult> {
  const {
    projectId,
    elements,
    transitions,
    laneOrderKeys,
    mutedLaneKeys = [],
    hiddenLaneKeys = [],
    aspectRatio,
    frameRate = COMPOSITION_FPS,
    mediaBaseUrl,
    renderScale = 1,
    resolution = DEFAULT_EXPORT_RESOLUTION,
    dynamicRange = "sdr",
    concurrency: requestedConcurrency,
    imageFormat = "png",
    backend = "standard",
    frameRange,
    pictureOnly,
    watermark = !frameRange && !pictureOnly && exportNeedsWatermark(),
  } = input;


  if (backend === "rust" && readEnv("NATIVE_PREVIEW") !== "1") throw new Error("Rust rendering is not enabled on this server");
  if (dynamicRange === "hdr" && backend !== "gpu") throw new Error("HDR export needs the default renderer (Graphics card).");

  if (!Number.isFinite(renderScale) || renderScale <= 0 || renderScale > 1) {
    throw new Error(`renderScale must be greater than 0 and at most 1; received ${renderScale}`);
  }
  if (requestedConcurrency !== undefined && (!Number.isInteger(requestedConcurrency) || requestedConcurrency < 1)) {
    throw new Error(`concurrency must be a positive integer; received ${requestedConcurrency}`);
  }

  // Workshop renders deliberately use low-resolution proxies. Delivery does
  // not: fail before bundling whenever ingest/preprocessing has declared a
  // higher-quality authority that is not currently mounted as source_url.
  if (renderScale === 1) assertFinalRenderAuthority(elements);

  for (const element of elements) {
    const gradeIssue = validateColorGradeModel(element.props);
    if (gradeIssue) throw new Error(`Cannot render ${element.id}: ${gradeIssue}`);
    const chromaIssue = validateChromaKeyModel(element.props);
    if (chromaIssue) throw new Error(`Cannot render ${element.id}: ${chromaIssue}`);
  }
  const gradedElementCount = elements.filter((element) => hasColorGradeData(element.props)).length;
  const chromaKeyedElementCount = elements.filter((element) => hasChromaKeyData(element.props)).length;

  // 2K and 4K render each motion graphic again at that density (export-density-motion.ts); its
  // 1080-canvas render would otherwise be stretched.
  const exportPlan = renderScale === 1 ? exportRenderPlan(getCompositionDimensions(aspectRatio), resolution) : null;
  const density = await withDensityMotionGraphics(projectId, elements, exportPlan?.pixelScale ?? 1, {
    signal: input.signal,
    onStep: (done, total) => input.onProgress?.(done / total, "motion-graphics"),
  });
  for (const reason of density.kept) console.warn(`[render] motion graphic kept at its editor resolution: ${reason}`);

  // 1. Derive transition layout (same as the editor does client-side)
  const layout = withFrameRate(frameRate, () => buildTimelineTransitionLayout(density.elements, transitions));

  // 2. Build composition elements with the editor's lane mute (sound) and hide (picture) state at export time.
  const compositionElements = absolutizeMediaUrls(
    withFrameRate(frameRate, () => buildCompositionElements(layout.renderedElements, new Set(mutedLaneKeys), new Set(hiddenLaneKeys))),
    mediaBaseUrl,
  );

  // 3. Compute dimensions and duration
  const canonicalDimensions = getCompositionDimensions(aspectRatio);
  // H.264 requires even dimensions. Round each scaled axis to the nearest
  // even pixel so low-resolution working renders remain encoder-safe.
  const dimensions = {
    width: Math.max(2, Math.round((canonicalDimensions.width * renderScale) / 2) * 2),
    height: Math.max(2, Math.round((canonicalDimensions.height * renderScale) / 2) * 2),
  };
  if (resolution !== DEFAULT_EXPORT_RESOLUTION && renderScale !== 1) throw new Error("A delivery resolution cannot be combined with a working-render scale");
  const { pixelScale, outputSize, downscale } = exportRenderPlan(dimensions, resolution);
  if (pixelScale > 1 && backend === "rust") throw new Error("2K and 4K exports need the Browser or Graphics card renderer");
  const scaledOutput = downscale || pixelScale > 1;
  // Unless a caller fixes it, use as many export pages as this computer can run side by side.
  const concurrency = requestedConcurrency ?? exportWorkerCount({ width: dimensions.width * pixelScale, height: dimensions.height * pixelScale });
  const durationSeconds = Math.max(1, layout.effectiveDurationSeconds);
  const durationInFrames = Math.max(1, Math.round(durationSeconds * frameRate));

  const inputProps = {
    elements: compositionElements,
    laneOrderKeys,
    renderScale,
  };

  console.log("[render] starting render", {
    projectId,
    elementCount: compositionElements.length,
    durationSeconds: durationSeconds.toFixed(2),
    durationInFrames,
    dimensions,
    outputSize,
    colorGradeModel: gradedElementCount > 0 ? COLOR_GRADE_MODEL : null,
    gradedElementCount,
    chromaKeyModel: chromaKeyedElementCount > 0 ? "color-key-v1" : null,
    chromaKeyedElementCount,
  });

  // 6. Render straight into the project's renders/ dir (local fork: no upload step)
  const rendersDir = projectRendersDir(projectId);
  fs.mkdirSync(rendersDir, { recursive: true });
  const sizeLabel = (renderScale < 1 ? `-working-${dimensions.width}x${dimensions.height}` : scaledOutput ? `-${resolution}p` : "") + (dynamicRange === "hdr" ? "-hdr" : "");
  const fileName = `${new Date().toISOString().replace(/[:.]/g, "-")}${sizeLabel}.mp4`;
  const outputLocation = path.join(rendersDir, fileName);

  const renderStartedAt = performance.now();
  await renderBrowserVideo({
    baseUrl: mediaBaseUrl, outputLocation, ...dimensions, ...(downscale ? { outputSize } : {}), ...(pixelScale > 1 ? { pixelScale } : {}),
    nativeProjectId: backend === "rust" ? projectId : undefined, gpu: backend === "gpu",
    fps: frameRate, durationInFrames, inputProps, concurrency, imageFormat, signal: input.signal, onProgress: input.onProgress,
    ...(frameRange ? { frameRange } : {}), ...(pictureOnly ? { pictureOnly } : {}), ...(dynamicRange === "hdr" ? { dynamicRange } : {}),
    // GPU exports reuse unchanged chunks of this project's previous export (export-chunks.ts).
    ...(backend === "gpu" && renderScale === 1 ? { chunkCacheDir: path.join(projectDir(projectId), "preprocess", "export-chunks") } : {}),
  });

  if (watermark) {
    input.onProgress?.(1, "watermark");
    await addWatermark(outputLocation, outputSize, dynamicRange, input.signal);
  }

  console.log("[render] render complete", {
    outputLocation,
    elapsedSeconds: Number(((performance.now() - renderStartedAt) / 1000).toFixed(2)),
    concurrency,
    imageFormat,
    engine: backend === "gpu" ? "dreamcut-canvaskit-chromium-ffmpeg" : backend === "rust" ? "dreamcut-rust-react-chromium-ffmpeg" : "dreamcut-react-chromium-ffmpeg",
    watermark,
  });

  return {
    url: `/api/projects/${projectId}/render/latest/file`,
    filePath: outputLocation,
    fileName,
    durationSeconds,
  };
}
