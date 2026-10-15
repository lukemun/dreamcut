import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { parseVisualCheckpointPlan, type VisualCheckpointPlanRow } from "@/lib/qc/visual-checkpoint-plan";

export type WalkthroughSourceFinding = {
  code: string;
  message: string;
};

export type WalkthroughSourceReport = {
  ok: boolean;
  findings: WalkthroughSourceFinding[];
};

const REQUIRED_SOURCE_VETOES = [
  "Product contract",
  "Action causal chain",
  "Phone framing feasibility",
  "Result payoff",
] as const;

type SourceQualification = {
  schema_version?: unknown;
  project_id?: unknown;
  verdict?: unknown;
  product_revision?: {
    id?: unknown;
    routes?: unknown;
    current?: unknown;
  };
  normal_speed_watch?: {
    completed?: unknown;
    verdict?: unknown;
  };
  script_plan_sha256?: unknown;
  visual_checkpoints?: Array<{
    id?: unknown;
    kind?: unknown;
    source_id?: unknown;
    source_start_seconds?: unknown;
    source_end_seconds?: unknown;
    frame?: unknown;
    state_matches_claim?: unknown;
    required_visible?: unknown;
    minimum_timeline_seconds?: unknown;
    framing?: unknown;
    verdict?: unknown;
  }>;
  beats?: Array<{
    id?: unknown;
    pre_contact?: { frame?: unknown; state_matches_claim?: unknown };
    contact?: { frame?: unknown; target_intersection?: unknown };
    response?: { frame?: unknown; latency_seconds?: unknown; visibly_differs?: unknown };
    result?: { frame?: unknown; hold_seconds?: unknown };
    regions?: Array<{
      label?: unknown;
      center_delta_x_phone?: unknown;
      center_delta_y_phone?: unknown;
      exception?: unknown;
    }>;
  }>;
  route_continuity?: Array<{
    from_beat_id?: unknown;
    to_beat_id?: unknown;
    source_id?: unknown;
    source_start_seconds?: unknown;
    source_end_seconds?: unknown;
    entry_state_matches?: unknown;
    exit_state_matches?: unknown;
    verdict?: unknown;
  }>;
  generation?: {
    response_latency_seconds?: unknown;
    progress_duration_seconds?: unknown;
    requested_count?: unknown;
    completed_count?: unknown;
    fresh_result_ids?: unknown;
  };
};

type CaptureFrameAtlas = {
  schema_version?: unknown;
  project_id?: unknown;
  source_manifest_sha256?: unknown;
  source_qualification_sha256?: unknown;
  max_sample_gap_seconds?: unknown;
  checkpoints?: Array<{
    id?: unknown;
    source_id?: unknown;
    source_start_seconds?: unknown;
    source_end_seconds?: unknown;
    frames?: Array<{ source_seconds?: unknown; path?: unknown }>;
  }>;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function gradeField(body: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return body.match(new RegExp(`^${escaped}:\\s*(.+?)\\s*$`, "mi"))?.[1] ?? null;
}

function sourceVetoVerdict(body: string, veto: string): string | null {
  const row = body
    .split(/\r?\n/)
    .find((line) => line.startsWith("|") && line.split("|")[1]?.trim() === veto);
  return row?.split("|")[2]?.trim().toUpperCase() ?? null;
}

export function assessWalkthroughSourceReadiness(input: {
  projectId: string;
  sourceManifest: unknown | null;
  sourceManifestSha256?: string | null;
  qualification: SourceQualification | null;
  qualificationSha256?: string | null;
  sourceGrade?: string | null;
  approvedScriptPlanSha256?: string | null;
  currentScriptPlanSha256?: string | null;
  requiredCheckpointIds?: string[];
  requiredCheckpoints?: VisualCheckpointPlanRow[];
  checkpointPlanError?: string | null;
  captureFrameAtlas?: CaptureFrameAtlas | null;
  atlasFrameFiles?: ReadonlySet<string>;
}): WalkthroughSourceReport {
  const findings: WalkthroughSourceFinding[] = [];
  const manifest = input.sourceManifest as {
    project_id?: unknown;
    sources?: Array<{ id?: unknown; duration_seconds?: unknown }>;
  } | null;

  if (!manifest) {
    findings.push({ code: "source_manifest_missing", message: "Missing source-manifest.json." });
  } else {
    if (manifest.project_id !== input.projectId) {
      findings.push({ code: "source_manifest_project_mismatch", message: "Source manifest project_id does not match the project." });
    }
    if (!Array.isArray(manifest.sources) || manifest.sources.length === 0) {
      findings.push({ code: "source_manifest_empty", message: "Source manifest must bind at least one source." });
    }
  }

  const qualification = input.qualification;
  if (!qualification) {
    findings.push({
      code: "source_qualification_missing",
      message: "Missing review/source-qualification.json.",
    });
    return { ok: false, findings };
  }

  if (qualification.schema_version !== 1) {
    findings.push({ code: "source_qualification_schema", message: "Source qualification schema_version must be 1." });
  }
  if (qualification.project_id !== input.projectId) {
    findings.push({ code: "source_qualification_project_mismatch", message: "Source qualification project_id does not match the project." });
  }
  if (qualification.verdict !== "PASS") {
    findings.push({ code: "source_qualification_not_pass", message: "Source qualification verdict is not PASS." });
  }
  if (
    !isNonEmptyString(qualification.product_revision?.id)
    || !Array.isArray(qualification.product_revision?.routes)
    || qualification.product_revision.routes.length === 0
    || qualification.product_revision.current !== true
  ) {
    findings.push({
      code: "product_revision_unfrozen",
      message: "Qualification must bind a current product revision and at least one filmed route.",
    });
  }

  if (
    isNonEmptyString(input.approvedScriptPlanSha256)
    && qualification.script_plan_sha256 !== input.approvedScriptPlanSha256
  ) {
    findings.push({
      code: "visual_checkpoint_plan_stale",
      message: "Source qualification does not match the approved visual checkpoint plan.",
    });
  }
  if (
    isNonEmptyString(input.approvedScriptPlanSha256)
    && isNonEmptyString(input.currentScriptPlanSha256)
    && input.currentScriptPlanSha256 !== input.approvedScriptPlanSha256
  ) {
    findings.push({
      code: "visual_checkpoint_plan_unapproved_change",
      message: "The visual checkpoint plan changed after human approval.",
    });
  }
  if (isNonEmptyString(input.checkpointPlanError)) {
    findings.push({
      code: "visual_checkpoint_plan_invalid",
      message: input.checkpointPlanError,
    });
  }
  const requiredCheckpointIds = input.requiredCheckpointIds ?? [];
  const requiredCheckpoints = input.requiredCheckpoints ?? [];
  const checkpoints = Array.isArray(qualification.visual_checkpoints) ? qualification.visual_checkpoints : [];
  const checkpointById = new Map(checkpoints.filter((checkpoint) => isNonEmptyString(checkpoint.id)).map((checkpoint) => [checkpoint.id as string, checkpoint]));
  if (checkpointById.size !== checkpoints.filter((checkpoint) => isNonEmptyString(checkpoint.id)).length) {
    findings.push({ code: "visual_checkpoint_duplicate", message: "Source qualification contains duplicate visual checkpoint IDs." });
  }
  for (const id of requiredCheckpointIds) {
    if (!checkpointById.has(id)) {
      findings.push({
        code: "visual_checkpoint_missing",
        message: `${id}: approved visual checkpoint is absent from the source qualification.`,
      });
    }
  }
  for (const expected of requiredCheckpoints) {
    const actual = checkpointById.get(expected.id);
    if (!actual) continue;
    const actualVisible = Array.isArray(actual.required_visible)
      ? actual.required_visible.filter(isNonEmptyString)
      : [];
    if (
      actual.kind !== expected.kind
      || actual.framing !== expected.framing
      || actual.minimum_timeline_seconds !== expected.minimumTimelineSeconds
      || JSON.stringify(actualVisible) !== JSON.stringify(expected.requiredVisible)
    ) {
      findings.push({
        code: "visual_checkpoint_plan_mismatch",
        message: `${expected.id}: qualification kind, required-visible list, duration, or framing differs from the approved plan.`,
      });
    }
  }
  for (const [index, checkpoint] of checkpoints.entries()) {
    const label = isNonEmptyString(checkpoint.id) ? checkpoint.id : `checkpoint ${index + 1}`;
    const visible = Array.isArray(checkpoint.required_visible)
      ? checkpoint.required_visible.filter(isNonEmptyString)
      : [];
    if (
      !isNonEmptyString(checkpoint.id)
      || !["stop", "scroll-waypoint", "contact", "response", "result", "loading-change"].includes(String(checkpoint.kind))
      || !isNonEmptyString(checkpoint.source_id)
      || !isFiniteNumber(checkpoint.source_start_seconds)
      || !isFiniteNumber(checkpoint.source_end_seconds)
      || checkpoint.source_start_seconds < 0
      || checkpoint.source_end_seconds <= checkpoint.source_start_seconds
      || !isNonEmptyString(checkpoint.frame)
      || checkpoint.state_matches_claim !== true
      || visible.length === 0
      || !isFiniteNumber(checkpoint.minimum_timeline_seconds)
      || checkpoint.minimum_timeline_seconds <= 0
      || (checkpoint.framing !== "full-desktop" && checkpoint.framing !== "target-centered")
      || checkpoint.verdict !== "PASS"
    ) {
      findings.push({
        code: "visual_checkpoint_unqualified",
        message: `${label}: checkpoint lacks a verified source interval, visible-state proof, framing, or readable duration.`,
      });
    }
    const source = Array.isArray(manifest?.sources)
      ? manifest.sources.find((candidate) => candidate.id === checkpoint.source_id)
      : null;
    if (!source) {
      findings.push({
        code: "visual_checkpoint_source_missing",
        message: `${label}: checkpoint source_id is absent from the source manifest.`,
      });
    } else if (
      !isFiniteNumber(source.duration_seconds)
      || !isFiniteNumber(checkpoint.source_end_seconds)
      || checkpoint.source_end_seconds > source.duration_seconds + 0.001
    ) {
      findings.push({
        code: "visual_checkpoint_source_bounds",
        message: `${label}: checkpoint interval exceeds the manifested source duration.`,
      });
    }
  }
  const atlas = input.captureFrameAtlas;
  if (!atlas) {
    findings.push({
      code: "capture_frame_atlas_missing",
      message: "Missing review/capture-frame-atlas.json; derive dense editorial frames from the continuous source before qualification.",
    });
  } else {
    if (atlas.schema_version !== 1 || atlas.project_id !== input.projectId) {
      findings.push({ code: "capture_frame_atlas_invalid", message: "Capture frame atlas schema or project id is invalid." });
    }
    if (
      atlas.source_manifest_sha256 !== input.sourceManifestSha256
      || atlas.source_qualification_sha256 !== input.qualificationSha256
    ) {
      findings.push({
        code: "capture_frame_atlas_stale",
        message: "Capture frame atlas is not bound to the current source manifest and qualification.",
      });
    }
    const declaredMaxGap = atlas.max_sample_gap_seconds;
    if (!isFiniteNumber(declaredMaxGap) || declaredMaxGap <= 0 || declaredMaxGap > 0.5) {
      findings.push({
        code: "capture_frame_atlas_cadence",
        message: "Capture frame atlas must declare a maximum sample gap of 0.5 seconds or less.",
      });
    }
    const atlasCheckpoints = Array.isArray(atlas.checkpoints) ? atlas.checkpoints : [];
    const atlasById = new Map(atlasCheckpoints.filter((entry) => isNonEmptyString(entry.id)).map((entry) => [entry.id as string, entry]));
    for (const checkpoint of checkpoints) {
      if (!isNonEmptyString(checkpoint.id)) continue;
      const entry = atlasById.get(checkpoint.id);
      if (!entry) {
        findings.push({ code: "capture_frame_atlas_checkpoint_missing", message: `${checkpoint.id}: dense frame coverage is absent.` });
        continue;
      }
      if (
        entry.source_id !== checkpoint.source_id
        || entry.source_start_seconds !== checkpoint.source_start_seconds
        || entry.source_end_seconds !== checkpoint.source_end_seconds
      ) {
        findings.push({ code: "capture_frame_atlas_bounds_mismatch", message: `${checkpoint.id}: atlas source identity or interval differs from qualification.` });
        continue;
      }
      const frames = Array.isArray(entry.frames)
        ? entry.frames.filter((frame) => isFiniteNumber(frame.source_seconds) && isNonEmptyString(frame.path))
        : [];
      if (frames.length < 3) {
        findings.push({ code: "capture_frame_atlas_sparse", message: `${checkpoint.id}: atlas needs at least entry, middle, and exit frames.` });
        continue;
      }
      const times = frames.map((frame) => frame.source_seconds as number).sort((a, b) => a - b);
      const start = checkpoint.source_start_seconds as number;
      const end = checkpoint.source_end_seconds as number;
      const allWithinBounds = times.every((time) => time >= start - 0.001 && time <= end + 0.001);
      const coveragePoints = [start, ...times, end];
      const largestGap = coveragePoints.slice(1).reduce((largest, time, index) => Math.max(largest, time - coveragePoints[index]), 0);
      if (!allWithinBounds || largestGap > 0.501) {
        findings.push({
          code: "capture_frame_atlas_gap",
          message: `${checkpoint.id}: atlas frames leave a source-time gap larger than 0.5 seconds or escape the qualified interval.`,
        });
      }
      if (input.atlasFrameFiles && frames.some((frame) => !input.atlasFrameFiles?.has(frame.path as string))) {
        findings.push({ code: "capture_frame_atlas_file_missing", message: `${checkpoint.id}: one or more atlas frame files are missing.` });
      }
    }
  }
  if (
    qualification.normal_speed_watch?.completed !== true
    || qualification.normal_speed_watch.verdict !== "PASS"
  ) {
    findings.push({
      code: "source_normal_speed_watch_missing",
      message: "The complete source or rough causal spine has not passed a normal-speed watch.",
    });
  }

  if (!Array.isArray(qualification.beats) || qualification.beats.length === 0) {
    findings.push({ code: "source_beats_missing", message: "Qualification must include at least one taught action beat." });
  } else {
    for (const [index, beat] of qualification.beats.entries()) {
      const label = isNonEmptyString(beat.id) ? beat.id : `beat ${index + 1}`;
      if (!isNonEmptyString(beat.pre_contact?.frame) || beat.pre_contact.state_matches_claim !== true) {
        findings.push({ code: "pre_action_state_unqualified", message: `${label}: pre-contact state does not visibly match the teaching claim.` });
      }
      if (!isNonEmptyString(beat.contact?.frame) || beat.contact.target_intersection !== "PASS") {
        findings.push({ code: "contact_unqualified", message: `${label}: contact frame or target intersection is not qualified.` });
      }
      if (
        !isNonEmptyString(beat.response?.frame)
        || beat.response.visibly_differs !== true
        || !isFiniteNumber(beat.response.latency_seconds)
        || beat.response.latency_seconds > 1
      ) {
        findings.push({ code: "response_unqualified", message: `${label}: first visible response is missing, unchanged, or later than 1 second.` });
      }
      if (
        !isNonEmptyString(beat.result?.frame)
        || !isFiniteNumber(beat.result.hold_seconds)
        || beat.result.hold_seconds < 1
      ) {
        findings.push({ code: "result_hold_unqualified", message: `${label}: settled result is missing or held for less than 1 second.` });
      }
      if (!Array.isArray(beat.regions) || beat.regions.length === 0) {
        findings.push({ code: "semantic_regions_missing", message: `${label}: no phone-scale semantic-region measurements are recorded.` });
      } else {
        for (const region of beat.regions) {
          const hasException = isNonEmptyString(region.exception);
          const x = region.center_delta_x_phone;
          const y = region.center_delta_y_phone;
          if (
            !hasException
            && (!isFiniteNumber(x) || !isFiniteNumber(y) || Math.abs(x) > 54 || Math.abs(y) > 96)
          ) {
            findings.push({
              code: "semantic_region_off_center",
              message: `${label}/${isNonEmptyString(region.label) ? region.label : "region"}: center exceeds the 15% phone tolerance without an exception.`,
            });
          }
        }
      }
    }

    const requiredSeams = Math.max(qualification.beats.length - 1, 0);
    const seams = Array.isArray(qualification.route_continuity)
      ? qualification.route_continuity
      : [];
    if (seams.length !== requiredSeams) {
      findings.push({
        code: "route_continuity_missing",
        message: `Qualification must bind all ${requiredSeams} adjacent beat seam${requiredSeams === 1 ? "" : "s"}; found ${seams.length}.`,
      });
    }
    for (let index = 0; index < requiredSeams; index += 1) {
      const seam = seams[index];
      const fromId = qualification.beats[index]?.id;
      const toId = qualification.beats[index + 1]?.id;
      const hasValidBounds = isFiniteNumber(seam?.source_start_seconds)
        && isFiniteNumber(seam?.source_end_seconds)
        && seam.source_start_seconds >= 0
        && seam.source_end_seconds > seam.source_start_seconds;
      if (
        !seam
        || seam.from_beat_id !== fromId
        || seam.to_beat_id !== toId
        || !isNonEmptyString(seam.source_id)
        || !hasValidBounds
        || seam.entry_state_matches !== true
        || seam.exit_state_matches !== true
        || seam.verdict !== "PASS"
      ) {
        findings.push({
          code: "route_continuity_unqualified",
          message: `${isNonEmptyString(fromId) ? fromId : `beat ${index + 1}`} -> ${isNonEmptyString(toId) ? toId : `beat ${index + 2}`}: adjacent states are not joined by a qualified source interval.`,
        });
      }
    }
  }

  if (qualification.generation) {
    const generation = qualification.generation;
    const ids = Array.isArray(generation.fresh_result_ids)
      ? generation.fresh_result_ids.filter(isNonEmptyString)
      : [];
    if (!isFiniteNumber(generation.response_latency_seconds) || generation.response_latency_seconds > 1) {
      findings.push({ code: "generation_response_late", message: "Generation has no visible response within 1 second of contact." });
    }
    if (!isFiniteNumber(generation.progress_duration_seconds) || generation.progress_duration_seconds < 1) {
      findings.push({ code: "generation_progress_too_short", message: "Genuine generation progress is visible for less than 1 second." });
    }
    if (
      !Number.isInteger(generation.requested_count)
      || !Number.isInteger(generation.completed_count)
      || generation.requested_count !== generation.completed_count
      || ids.length !== generation.completed_count
    ) {
      findings.push({ code: "generation_result_count_mismatch", message: "Requested, completed, and identified fresh-result counts do not agree." });
    }
  }

  if (!input.sourceGrade) {
    findings.push({
      code: "source_grade_missing",
      message: "Missing review/source-grade.md from a fresh read-only source reviewer.",
    });
  } else {
    const grade = input.sourceGrade;
    if (gradeField(grade, "Overall")?.toUpperCase() !== "PASS") {
      findings.push({ code: "source_grade_not_pass", message: "Independent source grade is not PASS." });
    }
    if (gradeField(grade, "Grader context")?.toLowerCase() !== "fresh-read-only") {
      findings.push({ code: "source_grade_context", message: "Source grade must declare Grader context: fresh-read-only." });
    }
    if (gradeField(grade, "Project revision") !== qualification.product_revision?.id) {
      findings.push({ code: "source_grade_revision_mismatch", message: "Source grade does not match the qualified product revision." });
    }
    if (gradeField(grade, "Source manifest SHA-256")?.toLowerCase() !== input.sourceManifestSha256) {
      findings.push({ code: "source_grade_manifest_stale", message: "Source grade does not match the current source manifest." });
    }
    if (gradeField(grade, "Qualification SHA-256")?.toLowerCase() !== input.qualificationSha256) {
      findings.push({ code: "source_grade_qualification_stale", message: "Source grade does not match the current qualification receipt." });
    }
    if (gradeField(grade, "Normal-speed watch")?.toUpperCase() !== "PASS") {
      findings.push({ code: "source_grade_watch_missing", message: "Source reviewer did not pass the complete normal-speed watch." });
    }
    for (const veto of REQUIRED_SOURCE_VETOES) {
      if (sourceVetoVerdict(grade, veto) !== "PASS") {
        findings.push({ code: "source_veto_not_pass", message: `Required source veto "${veto}" is missing or is not PASS.` });
      }
    }
  }

  return { ok: findings.length === 0, findings };
}

function sha256(body: Buffer | string): string {
  return crypto.createHash("sha256").update(body).digest("hex");
}

export function inspectWalkthroughSourceReadiness(projectRoot: string): WalkthroughSourceReport {
  const projectId = path.basename(projectRoot);
  const rootManifest = path.join(projectRoot, "source-manifest.json");
  const preprocessManifest = path.join(projectRoot, "preprocess", "source-manifest.json");
  const sourceManifestPath = fs.existsSync(rootManifest) ? rootManifest : preprocessManifest;
  const qualificationPath = path.join(projectRoot, "review", "source-qualification.json");
  const sourceGradePath = path.join(projectRoot, "review", "source-grade.md");
  const captureFrameAtlasPath = path.join(projectRoot, "review", "capture-frame-atlas.json");
  const workflowPath = path.join(projectRoot, "review", "product-walkthrough-workflow.json");
  const sourceManifestBody = fs.existsSync(sourceManifestPath) ? fs.readFileSync(sourceManifestPath) : null;
  const qualificationBody = fs.existsSync(qualificationPath) ? fs.readFileSync(qualificationPath) : null;
  const sourceManifest = sourceManifestBody ? JSON.parse(sourceManifestBody.toString("utf8")) : null;
  const qualification = qualificationBody
    ? JSON.parse(qualificationBody.toString("utf8")) as SourceQualification
    : null;
  const sourceGrade = fs.existsSync(sourceGradePath) ? fs.readFileSync(sourceGradePath, "utf8") : null;
  const captureFrameAtlas = fs.existsSync(captureFrameAtlasPath)
    ? JSON.parse(fs.readFileSync(captureFrameAtlasPath, "utf8")) as CaptureFrameAtlas
    : null;
  const atlasFrameFiles = new Set(
    (captureFrameAtlas?.checkpoints ?? []).flatMap((checkpoint) => checkpoint.frames ?? [])
      .map((frame) => frame.path)
      .filter(isNonEmptyString)
      .filter((framePath) => fs.existsSync(path.join(projectRoot, framePath))),
  );
  const workflow = fs.existsSync(workflowPath)
    ? JSON.parse(fs.readFileSync(workflowPath, "utf8")) as { locks?: { script_plan_path?: unknown; script_plan_sha256?: unknown } }
    : null;
  const scriptPlanPath = typeof workflow?.locks?.script_plan_path === "string"
    ? path.join(projectRoot, workflow.locks.script_plan_path)
    : path.join(projectRoot, "review", "script-plan.md");
  const scriptPlan = fs.existsSync(scriptPlanPath) ? fs.readFileSync(scriptPlanPath, "utf8") : null;
  let requiredCheckpoints: VisualCheckpointPlanRow[] = [];
  let checkpointPlanError: string | null = null;
  if (scriptPlan) {
    try {
      requiredCheckpoints = parseVisualCheckpointPlan(scriptPlan);
    } catch (error) {
      checkpointPlanError = error instanceof Error ? error.message : "Visual checkpoint plan is invalid.";
    }
  } else {
    checkpointPlanError = "Missing approved shooting script for visual checkpoint qualification.";
  }
  return assessWalkthroughSourceReadiness({
    projectId,
    sourceManifest,
    sourceManifestSha256: sourceManifestBody ? sha256(sourceManifestBody) : null,
    qualification,
    qualificationSha256: qualificationBody ? sha256(qualificationBody) : null,
    sourceGrade,
    approvedScriptPlanSha256: typeof workflow?.locks?.script_plan_sha256 === "string"
      ? workflow.locks.script_plan_sha256
      : null,
    currentScriptPlanSha256: scriptPlan ? sha256(scriptPlan) : null,
    requiredCheckpointIds: requiredCheckpoints.map((checkpoint) => checkpoint.id),
    requiredCheckpoints,
    checkpointPlanError,
    captureFrameAtlas,
    atlasFrameFiles,
  });
}
