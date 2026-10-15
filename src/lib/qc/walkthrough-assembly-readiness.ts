import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export type WalkthroughAssemblyFinding = {
  code: string;
  message: string;
};

export type WalkthroughAssemblyReport = {
  ok: boolean;
  findings: WalkthroughAssemblyFinding[];
};

type TimelineElement = {
  id?: unknown;
  type?: unknown;
  lane_key?: unknown;
  source_url?: unknown;
  timeline_start?: unknown;
  duration?: unknown;
  playback_rate?: unknown;
  volume?: unknown;
  removed_at?: unknown;
  props?: Record<string, unknown> | null;
};

type CreatorSpeechInterval = {
  start_seconds?: unknown;
  end_seconds?: unknown;
};

type TimelineFile = { elements?: TimelineElement[] };

type SourceQualification = {
  project_id?: unknown;
  visual_checkpoints?: Array<{
    id?: unknown;
    kind?: unknown;
    source_id?: unknown;
    source_start_seconds?: unknown;
    source_end_seconds?: unknown;
    minimum_timeline_seconds?: unknown;
    framing?: unknown;
    verdict?: unknown;
  }> | null;
  route_continuity?: Array<{
    from_beat_id?: unknown;
    to_beat_id?: unknown;
    source_id?: unknown;
    source_start_seconds?: unknown;
    source_end_seconds?: unknown;
    minimum_timeline_seconds?: unknown;
    framing?: unknown;
    verdict?: unknown;
  }> | null;
};

type NarrationVisualContract = {
  schema_version?: unknown;
  project_id?: unknown;
  narration_sha256?: unknown;
  lines?: Array<{
    line_number?: unknown;
    text?: unknown;
    source_id?: unknown;
    timeline_element_id?: unknown;
    prerequisite_source_seconds?: unknown;
    max_prerequisite_lead_seconds?: unknown;
    action_source_seconds?: unknown;
    spoken_action_anchor?: unknown;
    max_action_delta_seconds?: unknown;
  }>;
};

type InteractionTargetContract = {
  checkpoint_id?: unknown;
  click_local_seconds?: unknown;
  pointer_evidence?: unknown;
};

function sha256(body: Buffer | string): string {
  return crypto.createHash("sha256").update(body).digest("hex");
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function normalizeNarrationText(value: string): string {
  return value.replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, "\"").replace(/\s+/g, " ").trim();
}

export function approvedNarrationLines(markdown: string): string[] {
  return markdown
    .replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, "")
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0 && !block.startsWith("#"))
    .map(normalizeNarrationText);
}

export function assessWalkthroughAssemblyReadiness(input: {
  projectId: string;
  timeline: TimelineFile | null;
  timelineSha256: string | null;
  lockedTimelineSha256: string | null;
  qualification: SourceQualification | null;
  qualificationSha256: string | null;
  lockedQualificationSha256: string | null;
  approvedNarration: string | null;
  narrationSha256: string | null;
  lockedNarrationSha256: string | null;
  narrationVisualContract: NarrationVisualContract | null;
  narrationVisualContractSha256: string | null;
  lockedNarrationVisualContractSha256: string | null;
}): WalkthroughAssemblyReport {
  const findings: WalkthroughAssemblyFinding[] = [];

  if (!input.timeline || !input.timelineSha256) {
    findings.push({ code: "assembly_timeline_missing", message: "Missing or unreadable timeline.json." });
  } else if (input.timelineSha256 !== input.lockedTimelineSha256) {
    findings.push({ code: "assembly_timeline_stale", message: "The assembled timeline does not match the fine-edit lock." });
  }
  if (!input.qualification || !input.qualificationSha256) {
    findings.push({ code: "assembly_qualification_missing", message: "Missing or unreadable source qualification." });
  } else if (input.qualificationSha256 !== input.lockedQualificationSha256) {
    findings.push({ code: "assembly_qualification_stale", message: "The source qualification changed after promotion." });
  }
  if (!input.approvedNarration || !input.narrationSha256) {
    findings.push({ code: "assembly_narration_missing", message: "Missing or unreadable approved narration." });
  } else if (input.narrationSha256 !== input.lockedNarrationSha256) {
    findings.push({ code: "assembly_narration_stale", message: "The narration changed after human approval." });
  }
  if (!input.narrationVisualContract || !input.narrationVisualContractSha256) {
    findings.push({
      code: "assembly_narration_visual_contract_missing",
      message: "Missing or unreadable approved narration-to-screen contract.",
    });
  } else if (input.narrationVisualContractSha256 !== input.lockedNarrationVisualContractSha256) {
    findings.push({
      code: "assembly_narration_visual_contract_stale",
      message: "The narration-to-screen contract changed after human approval.",
    });
  }
  if (!input.timeline || !input.qualification) {
    return { ok: false, findings };
  }
  if (input.qualification.project_id !== input.projectId) {
    findings.push({ code: "assembly_project_mismatch", message: "Source qualification belongs to another project." });
  }

  const active = (input.timeline.elements ?? []).filter((element) => (
    element.removed_at == null && element.props?.disabled !== true
  ));
  const creatorPerformance = active.filter((element) => (
    element.type === "video_clip"
    && element.lane_key === "visual_presenter"
    && isNonEmptyString(element.props?.transcript)
  ));
  const visuals = active.filter((element) => element.type === "video_clip" || element.type === "still");
  const visualEnd = visuals.reduce((maximum, element) => {
    if (!isFiniteNumber(element.timeline_start) || !isFiniteNumber(element.duration)) return maximum;
    return Math.max(maximum, element.timeline_start + element.duration);
  }, 0);

  for (const element of creatorPerformance) {
    const label = isNonEmptyString(element.id) ? element.id : "creator presenter clip";
    if (
      element.props?.synchronized_av_unit !== true
      || !isNonEmptyString(element.props?.edit_unit_contract)
    ) {
      findings.push({
        code: "assembly_creator_av_not_synchronized",
        message: `${label}: creator picture and voice are not declared as one synchronized edit unit.`,
      });
    }

    const intervals = element.props?.creator_speech_intervals;
    if (!Array.isArray(intervals) || intervals.length === 0 || !isFiniteNumber(element.duration)) {
      findings.push({
        code: "assembly_creator_speech_map_missing",
        message: `${label}: creator clip has no retained clip-local speech-occupancy map.`,
      });
      continue;
    }
    const parsed = intervals.map((interval) => interval as CreatorSpeechInterval);
    const valid = parsed.every((interval, index) => (
      isFiniteNumber(interval.start_seconds)
      && isFiniteNumber(interval.end_seconds)
      && interval.start_seconds >= 0
      && interval.end_seconds > interval.start_seconds
      && interval.end_seconds <= (element.duration as number) + 0.001
      && (index === 0 || (
        isFiniteNumber(parsed[index - 1]?.end_seconds)
        && interval.start_seconds >= (parsed[index - 1]!.end_seconds as number) - 0.001
      ))
    ));
    if (!valid) {
      findings.push({
        code: "assembly_creator_speech_map_invalid",
        message: `${label}: creator speech intervals must be ordered clip-local bounds inside the mounted duration.`,
      });
      continue;
    }
    const maximumInternalSilence = isFiniteNumber(element.props?.max_internal_silence_seconds)
      ? element.props.max_internal_silence_seconds
      : 0.75;
    for (let index = 1; index < parsed.length; index += 1) {
      const previousEnd = parsed[index - 1]!.end_seconds as number;
      const nextStart = parsed[index]!.start_seconds as number;
      const gap = nextStart - previousEnd;
      if (gap > maximumInternalSilence + 0.001) {
        findings.push({
          code: "assembly_creator_internal_silence",
          message: `${label}: ${gap.toFixed(2)}s of unplanned no-speech audio remains inside the creator performance; maximum is ${maximumInternalSilence.toFixed(2)}s.`,
        });
      }
    }
  }

  const separateVoice = active.filter((element) => element.type === "vo_segment");
  for (const creator of creatorPerformance) {
    if (!isFiniteNumber(creator.timeline_start) || !isFiniteNumber(creator.duration)) continue;
    const creatorStart = creator.timeline_start;
    const creatorEnd = creatorStart + creator.duration;
    const overlap = separateVoice.find((voiceElement) => (
      isFiniteNumber(voiceElement.timeline_start)
      && isFiniteNumber(voiceElement.duration)
      && voiceElement.timeline_start < creatorEnd - 0.001
      && voiceElement.timeline_start + voiceElement.duration > creatorStart + 0.001
    ));
    if (overlap) {
      findings.push({
        code: "assembly_creator_voice_topology_conflict",
        message: `${String(creator.id ?? "creator clip")}: synchronized creator audio overlaps separate voice element ${String(overlap.id ?? "unknown")}.`,
      });
    }
  }

  for (const [index, checkpoint] of (input.qualification.visual_checkpoints ?? []).entries()) {
    const label = String(checkpoint.id ?? `checkpoint ${index + 1}`);
    if (
      checkpoint.verdict !== "PASS"
      || !isNonEmptyString(checkpoint.source_id)
      || !isFiniteNumber(checkpoint.source_start_seconds)
      || !isFiniteNumber(checkpoint.source_end_seconds)
      || checkpoint.source_end_seconds <= checkpoint.source_start_seconds
      || !isFiniteNumber(checkpoint.minimum_timeline_seconds)
      || checkpoint.minimum_timeline_seconds <= 0
      || (checkpoint.framing !== "full-desktop" && checkpoint.framing !== "target-centered")
    ) {
      findings.push({ code: "assembly_visual_checkpoint_invalid", message: `${label}: visual checkpoint contract is incomplete.` });
      continue;
    }
    const checkpointSourceId = checkpoint.source_id;
    const checkpointSourceStart = checkpoint.source_start_seconds;
    const checkpointSourceEnd = checkpoint.source_end_seconds;
    const minimumTimelineSeconds = checkpoint.minimum_timeline_seconds;
    const candidates = active.filter((element) => {
      if (element.type !== "video_clip") return false;
      const props = element.props ?? {};
      const sourceId = props.source_manifest_id ?? props.source_authority_id;
      const interval = props.source_interval as { start_seconds?: unknown; duration_seconds?: unknown } | undefined;
      if (
        sourceId !== checkpointSourceId
        || !isFiniteNumber(interval?.start_seconds)
        || !isFiniteNumber(interval.duration_seconds)
      ) return false;
      const end = interval.start_seconds + interval.duration_seconds;
      return interval.start_seconds <= checkpointSourceStart + 0.001
        && end >= checkpointSourceEnd - 0.001;
    });
    if (candidates.length === 0) {
      findings.push({
        code: "assembly_visual_checkpoint_missing",
        message: `${label}: no active video clip preserves the approved checkpoint interval.`,
      });
      continue;
    }
    const candidate = candidates[0];
    const playbackRate = isFiniteNumber(candidate.playback_rate) && candidate.playback_rate > 0
      ? candidate.playback_rate
      : 1;
    const candidateInterval = candidate.props?.source_interval as { start_seconds?: unknown } | undefined;
    if (
      !isFiniteNumber(candidate.timeline_start)
      || !isFiniteNumber(candidate.duration)
      || candidate.duration <= 0
      || !isFiniteNumber(candidateInterval?.start_seconds)
    ) {
      findings.push({
        code: "assembly_visual_checkpoint_clip_bounds_invalid",
        message: `${label}: mapped clip has no valid timeline bounds.`,
      });
      continue;
    }
    const mappedCheckpointStart = candidate.timeline_start
      + (checkpointSourceStart - candidateInterval.start_seconds) / playbackRate;
    const mappedCheckpointEnd = candidate.timeline_start
      + (checkpointSourceEnd - candidateInterval.start_seconds) / playbackRate;
    const candidateTimelineEnd = candidate.timeline_start + candidate.duration;
    if (
      mappedCheckpointStart < candidate.timeline_start - 0.02
      || mappedCheckpointEnd > candidateTimelineEnd + 0.02
    ) {
      findings.push({
        code: "assembly_visual_checkpoint_outside_clip",
        message: `${label}: checkpoint maps outside the clip's actual timeline duration.`,
      });
      continue;
    }
    const mappedDuration = (checkpointSourceEnd - checkpointSourceStart) / playbackRate;
    if (mappedDuration + 0.001 < minimumTimelineSeconds) {
      findings.push({
        code: "assembly_visual_checkpoint_compressed",
        message: `${label}: checkpoint receives ${mappedDuration.toFixed(2)}s, below its ${minimumTimelineSeconds.toFixed(2)}s readable minimum.`,
      });
    }
    if (checkpoint.kind === "contact") {
      const pointerContracts = active.flatMap((element) => {
        if (!isFiniteNumber(element.timeline_start)) return [];
        const contracts = element.props?.interaction_target_contracts;
        if (!Array.isArray(contracts)) return [];
        return contracts.map((contract) => ({
          element,
          contract: contract as InteractionTargetContract,
        }));
      });
      const pointer = pointerContracts.find(({ contract }) => contract.checkpoint_id === label);
      if (
        !pointer
        || !isFiniteNumber(pointer.contract.click_local_seconds)
        || (pointer.contract.pointer_evidence !== "native-visible"
          && pointer.contract.pointer_evidence !== "reconstructed")
      ) {
        findings.push({
          code: "assembly_contact_pointer_missing",
          message: `${label}: contact has no checkpoint-bound visible-pointer contract.`,
        });
      } else {
        const pointerTimelineStart = pointer.element.timeline_start as number;
        const clickLocalSeconds = pointer.contract.click_local_seconds as number;
        const clickTimelineSeconds = pointerTimelineStart + clickLocalSeconds;
        if (
          clickTimelineSeconds < mappedCheckpointStart - 0.02
          || clickTimelineSeconds > mappedCheckpointEnd + 0.02
        ) {
          findings.push({
            code: "assembly_contact_pointer_outside_checkpoint",
            message: `${label}: visible pointer contact lands outside the approved contact interval.`,
          });
        }
      }
    }
    if (checkpoint.framing === "full-desktop") {
      const props = candidate.props ?? {};
      const scale = isFiniteNumber(props.media_scale) ? props.media_scale : 1;
      const offsetX = isFiniteNumber(props.media_offset_x) ? props.media_offset_x : 0;
      const offsetY = isFiniteNumber(props.media_offset_y) ? props.media_offset_y : 0;
      if (props.objectFit !== "contain" || scale > 1.001 || Math.abs(offsetX) > 0.001 || Math.abs(offsetY) > 0.001) {
        findings.push({
          code: "assembly_visual_checkpoint_cropped",
          message: `${label}: full-desktop checkpoint is cropped or offset.`,
        });
      }
    }
  }

  for (const [index, seam] of (input.qualification.route_continuity ?? []).entries()) {
    const label = `${String(seam.from_beat_id ?? `beat ${index + 1}`)} -> ${String(seam.to_beat_id ?? `beat ${index + 2}`)}`;
    if (
      seam.verdict !== "PASS"
      || !isNonEmptyString(seam.source_id)
      || !isFiniteNumber(seam.source_start_seconds)
      || !isFiniteNumber(seam.source_end_seconds)
      || seam.source_end_seconds <= seam.source_start_seconds
    ) {
      findings.push({ code: "assembly_route_seam_contract_invalid", message: `${label}: source seam contract is incomplete.` });
      continue;
    }
    if (!isFiniteNumber(seam.minimum_timeline_seconds) || seam.minimum_timeline_seconds <= 0) {
      findings.push({ code: "assembly_route_seam_timing_missing", message: `${label}: minimum readable timeline duration is not declared.` });
      continue;
    }
    if (seam.framing !== "full-desktop" && seam.framing !== "target-centered") {
      findings.push({ code: "assembly_route_seam_framing_missing", message: `${label}: assembly framing contract is not declared.` });
      continue;
    }

    const seamSourceId = seam.source_id;
    const seamSourceStart = seam.source_start_seconds;
    const seamSourceEnd = seam.source_end_seconds;
    const minimumTimelineSeconds = seam.minimum_timeline_seconds;
    const sourceSpan = seamSourceEnd - seamSourceStart;
    const candidates = active.filter((element) => {
      if (element.type !== "video_clip") return false;
      const props = element.props ?? {};
      const sourceId = props.source_manifest_id ?? props.source_authority_id;
      const interval = props.source_interval as { start_seconds?: unknown; duration_seconds?: unknown } | undefined;
      if (
        sourceId !== seamSourceId
        || !isFiniteNumber(interval?.start_seconds)
        || !isFiniteNumber(interval.duration_seconds)
      ) return false;
      const end = interval.start_seconds + interval.duration_seconds;
      return interval.start_seconds <= seamSourceStart + 0.001
        && end >= seamSourceEnd - 0.001;
    });
    if (candidates.length === 0) {
      findings.push({
        code: "assembly_route_seam_missing",
        message: `${label}: no active video clip preserves the complete qualified entry-to-landing source interval.`,
      });
      continue;
    }

    const candidate = candidates[0];
    const playbackRate = isFiniteNumber(candidate.playback_rate) && candidate.playback_rate > 0
      ? candidate.playback_rate
      : 1;
    const candidateInterval = candidate.props?.source_interval as { start_seconds?: unknown } | undefined;
    if (
      !isFiniteNumber(candidate.timeline_start)
      || !isFiniteNumber(candidate.duration)
      || candidate.duration <= 0
      || !isFiniteNumber(candidateInterval?.start_seconds)
    ) {
      findings.push({ code: "assembly_route_seam_clip_bounds_invalid", message: `${label}: mapped clip has no valid timeline bounds.` });
      continue;
    }
    const mappedSeamEnd = candidate.timeline_start
      + (seamSourceEnd - candidateInterval.start_seconds) / playbackRate;
    if (mappedSeamEnd > candidate.timeline_start + candidate.duration + 0.02) {
      findings.push({
        code: "assembly_route_seam_outside_clip",
        message: `${label}: route seam maps outside the clip's actual timeline duration.`,
      });
      continue;
    }
    const mappedDuration = sourceSpan / playbackRate;
    if (mappedDuration + 0.001 < minimumTimelineSeconds) {
      findings.push({
        code: "assembly_route_seam_compressed",
        message: `${label}: the qualified seam receives ${mappedDuration.toFixed(2)}s, below its ${minimumTimelineSeconds.toFixed(2)}s readable minimum.`,
      });
    }
    if (seam.framing === "full-desktop") {
      const props = candidate.props ?? {};
      const scale = isFiniteNumber(props.media_scale) ? props.media_scale : 1;
      const offsetX = isFiniteNumber(props.media_offset_x) ? props.media_offset_x : 0;
      const offsetY = isFiniteNumber(props.media_offset_y) ? props.media_offset_y : 0;
      if (props.objectFit !== "contain" || scale > 1.001 || Math.abs(offsetX) > 0.001 || Math.abs(offsetY) > 0.001) {
        findings.push({
          code: "assembly_route_seam_cropped",
          message: `${label}: the route-changing motion must show the complete desktop without crop or offset.`,
        });
      }
    }
  }

  // Visual assembly is independently reviewable while narration is still being authored. Do not let a
  // missing language lock hide missing motion, contact, framing, or pointer findings during a workshop edit.
  if (!input.approvedNarration || !input.narrationVisualContract) {
    return { ok: false, findings };
  }

  const narrationLines = approvedNarrationLines(input.approvedNarration);
  if (narrationLines.length === 0) {
    findings.push({ code: "assembly_narration_empty", message: "Approved narration contains no spoken paragraphs." });
  }
  const voice = [...separateVoice, ...creatorPerformance];
  const contract = input.narrationVisualContract;
  if (
    contract.schema_version !== 1
    || contract.project_id !== input.projectId
    || contract.narration_sha256 !== input.narrationSha256
  ) {
    findings.push({
      code: "assembly_narration_visual_contract_invalid",
      message: "Narration-to-screen contract must be schema v1 and bind the project plus approved narration hash.",
    });
  }
  const contractLines = Array.isArray(contract.lines) ? contract.lines : [];

  function sourceTimeOnTimeline(sourceId: string, sourceSeconds: number, timelineElementId?: string): number | null {
    const candidates = active.filter((element) => {
      if (element.type !== "video_clip") return false;
      if (timelineElementId && element.id !== timelineElementId) return false;
      const props = element.props ?? {};
      const elementSourceId = props.source_manifest_id ?? props.source_authority_id;
      const interval = props.source_interval as { start_seconds?: unknown; duration_seconds?: unknown } | undefined;
      return elementSourceId === sourceId
        && isFiniteNumber(interval?.start_seconds)
        && isFiniteNumber(interval.duration_seconds)
        && sourceSeconds >= interval.start_seconds - 0.001
        && sourceSeconds <= interval.start_seconds + interval.duration_seconds + 0.001;
    });
    const candidate = candidates[0];
    const interval = candidate?.props?.source_interval as { start_seconds?: unknown } | undefined;
    if (
      !candidate
      || !isFiniteNumber(candidate.timeline_start)
      || !isFiniteNumber(candidate.playback_rate)
      || candidate.playback_rate <= 0
      || !isFiniteNumber(interval?.start_seconds)
    ) return null;
    return candidate.timeline_start + (sourceSeconds - interval.start_seconds) / candidate.playback_rate;
  }

  for (const [index, line] of narrationLines.entries()) {
    const lineNumber = index + 1;
    const matching = voice.filter((element) => {
      const props = element.props ?? {};
      return props.script_line_number === lineNumber && isNonEmptyString(props.transcript);
    }).sort((left, right) => (
      (isFiniteNumber(left.timeline_start) ? left.timeline_start : 0)
      - (isFiniteNumber(right.timeline_start) ? right.timeline_start : 0)
    ));
    if (matching.length === 0) {
      findings.push({
        code: "assembly_narration_line_missing",
        message: `Approved narration line ${lineNumber} is absent or its mounted transcript differs.`,
      });
      continue;
    }
    const mountedLine = normalizeNarrationText(matching.map((element) => String(element.props?.transcript ?? "")).join(" "));
    if (mountedLine !== line) {
      findings.push({
        code: "assembly_narration_line_missing",
        message: `Approved narration line ${lineNumber} differs from its ordered mounted edit pieces.`,
      });
      continue;
    }
    for (const segment of matching) {
      if (
        !isNonEmptyString(segment.source_url)
        || !isFiniteNumber(segment.timeline_start)
        || !isFiniteNumber(segment.duration)
        || segment.duration <= 0
        || (isFiniteNumber(segment.volume) && segment.volume <= 0)
      ) {
        findings.push({ code: "assembly_narration_line_unplayable", message: `Approved narration line ${lineNumber} has an unplayable mounted edit piece.` });
      } else if (segment.timeline_start + segment.duration > visualEnd + 0.001) {
        findings.push({ code: "assembly_narration_line_overrun", message: `Approved narration line ${lineNumber} extends beyond the visual spine.` });
      }
    }
    const segmentStart = matching.reduce((minimum, segment) => (
      isFiniteNumber(segment.timeline_start) ? Math.min(minimum, segment.timeline_start) : minimum
    ), Number.POSITIVE_INFINITY);
    const segmentEnd = matching.reduce((maximum, segment) => (
      isFiniteNumber(segment.timeline_start) && isFiniteNumber(segment.duration)
        ? Math.max(maximum, segment.timeline_start + segment.duration)
        : maximum
    ), Number.NEGATIVE_INFINITY);

    const lineContract = contractLines.find((candidate) => candidate.line_number === lineNumber);
    if (
      !lineContract
      || !isNonEmptyString(lineContract.text)
      || normalizeNarrationText(lineContract.text) !== line
      || !isNonEmptyString(lineContract.source_id)
    ) {
      findings.push({
        code: "assembly_narration_sync_line_missing",
        message: `Approved narration line ${lineNumber} has no matching source-timed visual contract.`,
      });
      continue;
    }
    const timelineElementId = isNonEmptyString(lineContract.timeline_element_id)
      ? lineContract.timeline_element_id
      : undefined;
    if (isFiniteNumber(lineContract.prerequisite_source_seconds)) {
      const prerequisiteAt = sourceTimeOnTimeline(
        lineContract.source_id,
        lineContract.prerequisite_source_seconds,
        timelineElementId,
      );
      const allowedLead = isFiniteNumber(lineContract.max_prerequisite_lead_seconds)
        ? lineContract.max_prerequisite_lead_seconds
        : 0;
      if (prerequisiteAt == null) {
        findings.push({
          code: "assembly_narration_prerequisite_unmapped",
          message: `Narration line ${lineNumber}'s visual prerequisite is not present in the active timeline.`,
        });
      } else if (Number.isFinite(segmentStart) && segmentStart < prerequisiteAt - allowedLead - 0.001) {
        findings.push({
          code: "assembly_narration_prerequisite_early",
          message: `Narration line ${lineNumber} begins ${(prerequisiteAt - segmentStart).toFixed(2)}s before its named state is visually established.`,
        });
      }
    }
    if (isFiniteNumber(lineContract.action_source_seconds)) {
      const actionAt = sourceTimeOnTimeline(lineContract.source_id, lineContract.action_source_seconds, timelineElementId);
      const tolerance = lineContract.max_action_delta_seconds;
      const anchor = lineContract.spoken_action_anchor;
      if (actionAt == null) {
        findings.push({
          code: "assembly_narration_action_unmapped",
          message: `Narration line ${lineNumber}'s spoken action is not present in the active timeline.`,
        });
      } else if (
        !isFiniteNumber(tolerance)
        || tolerance < 0
        || (anchor !== "start" && anchor !== "end")
        || !Number.isFinite(segmentStart)
        || !Number.isFinite(segmentEnd)
      ) {
        findings.push({
          code: "assembly_narration_action_contract_invalid",
          message: `Narration line ${lineNumber}'s action anchor or tolerance is invalid.`,
        });
      } else {
        const spokenAt = anchor === "start" ? segmentStart : segmentEnd;
        const delta = Math.abs(spokenAt - actionAt);
        if (delta > tolerance + 0.001) {
          findings.push({
            code: "assembly_narration_action_drift",
            message: `Narration line ${lineNumber}'s spoken action is ${delta.toFixed(2)}s away from the on-screen action; maximum is ${tolerance.toFixed(2)}s.`,
          });
        }
      }
    }
  }
  const mountedLineNumbers = voice.map((element) => element.props?.script_line_number);
  const validMountedLineNumbers = mountedLineNumbers.filter((value): value is number => (
    typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= narrationLines.length
  ));
  if (
    validMountedLineNumbers.length !== voice.length
    || new Set(validMountedLineNumbers).size !== narrationLines.length
  ) {
    findings.push({
      code: "assembly_narration_inventory_mismatch",
      message: `Mounted voice contains ${voice.length} active edit piece${voice.length === 1 ? "" : "s"} across ${new Set(validMountedLineNumbers).size} approved line${new Set(validMountedLineNumbers).size === 1 ? "" : "s"}; approved narration contains ${narrationLines.length} line${narrationLines.length === 1 ? "" : "s"}.`,
    });
  }

  return { ok: findings.length === 0, findings };
}

export function inspectWalkthroughAssemblyReadiness(projectRoot: string, locks: {
  timelineSha256: string | null;
  sourceQualificationSha256: string | null;
  narrationPath: string | null;
  narrationSha256: string | null;
  narrationVisualContractPath: string | null;
  narrationVisualContractSha256: string | null;
}): WalkthroughAssemblyReport {
  const timelinePath = path.join(projectRoot, "timeline.json");
  const qualificationPath = path.join(projectRoot, "review", "source-qualification.json");
  const narrationPath = locks.narrationPath ? path.resolve(projectRoot, locks.narrationPath) : null;
  const contractPath = locks.narrationVisualContractPath
    ? path.resolve(projectRoot, locks.narrationVisualContractPath)
    : null;
  const projectPrefix = `${path.resolve(projectRoot)}${path.sep}`;
  const safeNarrationPath = narrationPath?.startsWith(projectPrefix) ? narrationPath : null;
  const safeContractPath = contractPath?.startsWith(projectPrefix) ? contractPath : null;
  const timelineBody = fs.existsSync(timelinePath) ? fs.readFileSync(timelinePath) : null;
  const qualificationBody = fs.existsSync(qualificationPath) ? fs.readFileSync(qualificationPath) : null;
  const narrationBody = safeNarrationPath && fs.existsSync(safeNarrationPath) ? fs.readFileSync(safeNarrationPath) : null;
  const contractBody = safeContractPath && fs.existsSync(safeContractPath) ? fs.readFileSync(safeContractPath) : null;

  return assessWalkthroughAssemblyReadiness({
    projectId: path.basename(projectRoot),
    timeline: timelineBody ? JSON.parse(timelineBody.toString("utf8")) : null,
    timelineSha256: timelineBody ? sha256(timelineBody) : null,
    lockedTimelineSha256: locks.timelineSha256,
    qualification: qualificationBody ? JSON.parse(qualificationBody.toString("utf8")) : null,
    qualificationSha256: qualificationBody ? sha256(qualificationBody) : null,
    lockedQualificationSha256: locks.sourceQualificationSha256,
    approvedNarration: narrationBody?.toString("utf8") ?? null,
    narrationSha256: narrationBody ? sha256(narrationBody) : null,
    lockedNarrationSha256: locks.narrationSha256,
    narrationVisualContract: contractBody ? JSON.parse(contractBody.toString("utf8")) : null,
    narrationVisualContractSha256: contractBody ? sha256(contractBody) : null,
    lockedNarrationVisualContractSha256: locks.narrationVisualContractSha256,
  });
}
