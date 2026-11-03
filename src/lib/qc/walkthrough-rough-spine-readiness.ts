import type { TimelineAspectRatioValue } from "@/lib/aspect-ratios";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export type WalkthroughRoughSpineFinding = {
  code: string;
  message: string;
};

export type WalkthroughRoughSpineReport = {
  ok: boolean;
  findings: WalkthroughRoughSpineFinding[];
  timelineSha256: string | null;
  receiptSha256: string | null;
};

type SourceManifest = {
  project_id?: unknown;
  product_revision?: unknown;
  sources?: Array<{
    id?: unknown;
    duration_seconds?: unknown;
  }>;
};

type TimelineElement = {
  id?: unknown;
  type?: unknown;
  source_url?: unknown;
  timeline_start?: unknown;
  duration?: unknown;
  trim_start?: unknown;
  trim_end?: unknown;
  playback_rate?: unknown;
  removed_at?: unknown;
  props?: Record<string, unknown> | null;
};

type TimelineFile = {
  elements?: TimelineElement[];
};

type ProjectMetadata = {
  output_aspect_ratio?: unknown;
};

type RoughSpineReceipt = {
  schema_version?: unknown;
  project_id?: unknown;
  verdict?: unknown;
  product_revision?: unknown;
  source_manifest_sha256?: unknown;
  source_qualification_sha256?: unknown;
  timeline_sha256?: unknown;
  clip_count?: unknown;
  duration_seconds?: unknown;
  narration_status?: unknown;
  captions_status?: unknown;
  camera_status?: unknown;
  normal_speed_watch?: {
    completed?: unknown;
    verdict?: unknown;
    timeline_sha256?: unknown;
  };
  motion_review?: {
    scrolling?: unknown;
    loading?: unknown;
  };
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function approximatelyEqual(left: number, right: number, tolerance = 1 / 25 + 0.001): boolean {
  return Math.abs(left - right) <= tolerance;
}

function sha256(body: Buffer | string): string {
  return crypto.createHash("sha256").update(body).digest("hex");
}

export function assessWalkthroughRoughSpineReadiness(input: {
  projectId: string;
  productRevision: string;
  lockedSourceManifestSha256: string;
  lockedSourceQualificationSha256: string;
  currentSourceManifestSha256: string | null;
  currentSourceQualificationSha256: string | null;
  sourceManifest: SourceManifest | null;
  metadata: ProjectMetadata | null;
  expectedOutputAspectRatio: TimelineAspectRatioValue;
  timeline: TimelineFile | null;
  timelineSha256: string | null;
  receipt: RoughSpineReceipt | null;
  receiptSha256: string | null;
}): WalkthroughRoughSpineReport {
  const findings: WalkthroughRoughSpineFinding[] = [];

  if (!input.timeline || !input.timelineSha256) {
    findings.push({ code: "rough_spine_timeline_missing", message: "Missing or unreadable timeline.json." });
  }
  if (!input.receipt || !input.receiptSha256) {
    findings.push({ code: "rough_spine_receipt_missing", message: "Missing or unreadable review/rough-spine-receipt.json." });
  }
  if (!input.sourceManifest) {
    findings.push({ code: "rough_spine_manifest_missing", message: "Missing or unreadable source-manifest.json." });
  }
  if (input.metadata?.output_aspect_ratio !== input.expectedOutputAspectRatio) {
    findings.push({
      code: "rough_spine_output_aspect_ratio",
      message: `Project output must be ${input.expectedOutputAspectRatio}; found ${String(input.metadata?.output_aspect_ratio ?? "missing")}.`,
    });
  }
  if (!input.timeline || !input.receipt || !input.sourceManifest || !input.timelineSha256) {
    return { ok: false, findings, timelineSha256: input.timelineSha256, receiptSha256: input.receiptSha256 };
  }

  if (input.currentSourceManifestSha256 !== input.lockedSourceManifestSha256) {
    findings.push({ code: "rough_spine_manifest_changed", message: "The source manifest changed after source qualification." });
  }
  if (input.currentSourceQualificationSha256 !== input.lockedSourceQualificationSha256) {
    findings.push({ code: "rough_spine_qualification_changed", message: "The source qualification changed after source promotion." });
  }

  const receipt = input.receipt;
  if (receipt.schema_version !== 1) {
    findings.push({ code: "rough_spine_receipt_schema", message: "Rough-spine receipt schema_version must be 1." });
  }
  if (receipt.project_id !== input.projectId) {
    findings.push({ code: "rough_spine_receipt_project", message: "Rough-spine receipt project_id does not match the project." });
  }
  if (receipt.verdict !== "PASS") {
    findings.push({ code: "rough_spine_receipt_verdict", message: "Rough-spine receipt verdict is not PASS." });
  }
  if (receipt.product_revision !== input.productRevision) {
    findings.push({ code: "rough_spine_receipt_revision", message: "Rough-spine receipt does not match the frozen product revision." });
  }
  if (receipt.source_manifest_sha256 !== input.lockedSourceManifestSha256) {
    findings.push({ code: "rough_spine_receipt_manifest", message: "Rough-spine receipt does not match the qualified source manifest." });
  }
  if (receipt.source_qualification_sha256 !== input.lockedSourceQualificationSha256) {
    findings.push({ code: "rough_spine_receipt_qualification", message: "Rough-spine receipt does not match the qualified source receipt." });
  }
  if (receipt.timeline_sha256 !== input.timelineSha256) {
    findings.push({ code: "rough_spine_receipt_timeline", message: "Rough-spine receipt does not match the current timeline." });
  }
  if (
    receipt.normal_speed_watch?.completed !== true
    || receipt.normal_speed_watch.verdict !== "PASS"
    || receipt.normal_speed_watch.timeline_sha256 !== input.timelineSha256
  ) {
    findings.push({ code: "rough_spine_watch_missing", message: "The exact rough spine has not passed a normal-speed watch." });
  }
  for (const surface of ["scrolling", "loading"] as const) {
    const verdict = receipt.motion_review?.[surface];
    if (verdict !== "PASS" && verdict !== "N/A") {
      findings.push({
        code: `rough_spine_${surface}_review_missing`,
        message: `Rough-spine ${surface} motion must be marked PASS or N/A after the normal-speed watch.`,
      });
    }
  }
  if (receipt.narration_status !== "not authored" || receipt.captions_status !== "not authored") {
    findings.push({ code: "rough_spine_polish_too_early", message: "The submitted rough spine must precede narration and captions." });
  }
  if (receipt.camera_status !== "not fine-authored") {
    findings.push({ code: "rough_spine_camera_too_early", message: "The submitted rough spine must precede fine camera authorship." });
  }

  const manifestSources = new Map<string, number>();
  for (const source of input.sourceManifest.sources ?? []) {
    if (isNonEmptyString(source.id) && isFiniteNumber(source.duration_seconds) && source.duration_seconds > 0) {
      manifestSources.set(source.id, source.duration_seconds);
    }
  }
  if (input.sourceManifest.project_id !== input.projectId || manifestSources.size === 0) {
    findings.push({ code: "rough_spine_manifest_invalid", message: "Source manifest is empty or belongs to another project." });
  }
  if (input.sourceManifest.product_revision !== input.productRevision) {
    findings.push({ code: "rough_spine_manifest_revision", message: "Source manifest does not match the frozen product revision." });
  }

  const activeElements = (input.timeline.elements ?? []).filter((element) => element.removed_at == null);
  const visualClips = activeElements.filter((element) => element.type === "video_clip");
  if (activeElements.length === 0 || visualClips.length === 0) {
    findings.push({ code: "rough_spine_empty", message: "Rough spine must contain at least one active source-backed video clip." });
  }
  const nonSourceElements = activeElements.filter((element) => element.type !== "video_clip");
  if (nonSourceElements.length > 0) {
    findings.push({ code: "rough_spine_not_source_only", message: "Rough spine must be source-only; narration, captions, music, stills, and effects come later." });
  }

  const sorted = [...visualClips].sort((left, right) => Number(left.timeline_start) - Number(right.timeline_start));
  let expectedStart = 0;
  for (const [index, clip] of sorted.entries()) {
    const label = isNonEmptyString(clip.id) ? clip.id : `clip ${index + 1}`;
    const props = clip.props ?? {};
    const timelineStart = clip.timeline_start;
    const duration = clip.duration;
    const trimStart = clip.trim_start;
    const trimEnd = clip.trim_end;
    const playbackRate = clip.playback_rate;
    const sourceManifestId = props.source_manifest_id;
    const sourceInterval = props.source_interval as { start_seconds?: unknown; duration_seconds?: unknown } | undefined;
    const sourceDuration = isNonEmptyString(sourceManifestId) ? manifestSources.get(sourceManifestId) : undefined;

    if (!isNonEmptyString(clip.source_url)) {
      findings.push({ code: "rough_spine_source_url_missing", message: `${label}: source_url is missing.` });
    }
    if (!isFiniteNumber(timelineStart) || !isFiniteNumber(duration) || duration <= 0 || !isFiniteNumber(playbackRate) || playbackRate <= 0) {
      findings.push({ code: "rough_spine_timing_invalid", message: `${label}: timeline timing or playback rate is invalid.` });
      continue;
    }
    if (!approximatelyEqual(timelineStart, expectedStart)) {
      findings.push({ code: "rough_spine_not_contiguous", message: `${label}: primary visual spine has a gap or overlap before ${timelineStart}s.` });
    }
    expectedStart = timelineStart + duration;

    if (props.editorial_role !== "product-walkthrough-rough-spine" || !isNonEmptyString(props.beat_label)) {
      findings.push({ code: "rough_spine_beat_unbound", message: `${label}: rough-spine role or beat label is missing.` });
    }
    const beatKind = props.rough_beat_kind;
    if (beatKind !== "settled" && beatKind !== "motion" && beatKind !== "loading") {
      findings.push({ code: "rough_spine_beat_kind_missing", message: `${label}: rough_beat_kind must be settled, motion, or loading.` });
    }
    if (beatKind === "motion" && (playbackRate < 0.6 || playbackRate > 2.1)) {
      findings.push({ code: "rough_spine_motion_rate", message: `${label}: motion playback must remain within 0.6x–2.1x.` });
    }
    if (beatKind === "loading" && playbackRate < 1) {
      findings.push({ code: "rough_spine_loading_stretched", message: `${label}: loading/progress may be condensed but never stretched.` });
    }
    if (props.camera_plan != null || props.keyframes != null) {
      findings.push({ code: "rough_spine_fine_motion_present", message: `${label}: fine camera/keyframe authorship belongs after language approval.` });
    }
    if (!isNonEmptyString(sourceManifestId) || sourceDuration == null) {
      findings.push({ code: "rough_spine_source_unbound", message: `${label}: source_manifest_id does not name a declared source authority.` });
      continue;
    }
    if (
      !sourceInterval
      || !isFiniteNumber(sourceInterval.start_seconds)
      || !isFiniteNumber(sourceInterval.duration_seconds)
      || sourceInterval.start_seconds < 0
      || sourceInterval.duration_seconds <= 0
      || sourceInterval.start_seconds + sourceInterval.duration_seconds > sourceDuration + 0.001
    ) {
      findings.push({ code: "rough_spine_source_interval", message: `${label}: source interval is missing or outside its declared source.` });
      continue;
    }
    if (!approximatelyEqual(sourceInterval.duration_seconds, duration * playbackRate)) {
      findings.push({ code: "rough_spine_source_duration_mismatch", message: `${label}: source interval does not match the visible clip duration and playback rate.` });
    }
    const expectedTailTrim = sourceDuration - sourceInterval.start_seconds - sourceInterval.duration_seconds;
    if (
      !isFiniteNumber(trimStart)
      || !approximatelyEqual(trimStart, sourceInterval.start_seconds)
      || !isFiniteNumber(trimEnd)
      || !approximatelyEqual(trimEnd, expectedTailTrim)
      || props.source_duration_seconds !== sourceDuration
    ) {
      findings.push({ code: "rough_spine_trim_contract", message: `${label}: trim_start, tail trim_end, or source_duration_seconds does not encode the declared source window.` });
    }
  }

  if (receipt.clip_count !== visualClips.length) {
    findings.push({ code: "rough_spine_receipt_clip_count", message: "Rough-spine receipt clip_count does not match the active source clips." });
  }
  if (!isFiniteNumber(receipt.duration_seconds) || !approximatelyEqual(receipt.duration_seconds, expectedStart)) {
    findings.push({ code: "rough_spine_receipt_duration", message: "Rough-spine receipt duration does not match the assembled visual spine." });
  }

  return {
    ok: findings.length === 0,
    findings,
    timelineSha256: input.timelineSha256,
    receiptSha256: input.receiptSha256,
  };
}

export function inspectWalkthroughRoughSpineReadiness(projectRoot: string, locks: {
  productRevision: string;
  sourceManifestSha256: string;
  sourceQualificationSha256: string;
  outputAspectRatio: TimelineAspectRatioValue;
}): WalkthroughRoughSpineReport {
  const projectId = path.basename(projectRoot);
  const sourceManifestPath = fs.existsSync(path.join(projectRoot, "source-manifest.json"))
    ? path.join(projectRoot, "source-manifest.json")
    : path.join(projectRoot, "preprocess", "source-manifest.json");
  const qualificationPath = path.join(projectRoot, "review", "source-qualification.json");
  const timelinePath = path.join(projectRoot, "timeline.json");
  const receiptPath = path.join(projectRoot, "review", "rough-spine-receipt.json");
  const metadataPath = path.join(projectRoot, "metadata.json");

  const readBody = (filePath: string) => fs.existsSync(filePath) ? fs.readFileSync(filePath) : null;
  const sourceManifestBody = readBody(sourceManifestPath);
  const qualificationBody = readBody(qualificationPath);
  const timelineBody = readBody(timelinePath);
  const receiptBody = readBody(receiptPath);
  const metadataBody = readBody(metadataPath);
  const parse = <T>(body: Buffer | null): T | null => {
    if (!body) return null;
    try {
      return JSON.parse(body.toString("utf8")) as T;
    } catch {
      return null;
    }
  };

  return assessWalkthroughRoughSpineReadiness({
    projectId,
    productRevision: locks.productRevision,
    lockedSourceManifestSha256: locks.sourceManifestSha256,
    lockedSourceQualificationSha256: locks.sourceQualificationSha256,
    currentSourceManifestSha256: sourceManifestBody ? sha256(sourceManifestBody) : null,
    currentSourceQualificationSha256: qualificationBody ? sha256(qualificationBody) : null,
    sourceManifest: parse<SourceManifest>(sourceManifestBody),
    metadata: parse<ProjectMetadata>(metadataBody),
    expectedOutputAspectRatio: locks.outputAspectRatio,
    timeline: parse<TimelineFile>(timelineBody),
    timelineSha256: timelineBody ? sha256(timelineBody) : null,
    receipt: parse<RoughSpineReceipt>(receiptBody),
    receiptSha256: receiptBody ? sha256(receiptBody) : null,
  });
}
