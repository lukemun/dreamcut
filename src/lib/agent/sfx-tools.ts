import { randomUUID } from "node:crypto";

import { toolError } from "@/lib/agent/tool-error";
import { readSfxCatalog, resolveSfxCatalogFile, sfxCatalogFileExists } from "@/lib/local-store/sfx-catalog";
import {
  audioEnvelope,
  cueContext,
  freeSfxLane,
  placeAtCue,
  renderAuditionImage,
} from "@/lib/local-store/sfx-audition";
import { activeElements, readTimeline } from "@/lib/local-store/store";
import { SFX_ROLES, searchSfxCatalog, type SfxRole, type SfxSearchHit, type SfxSearchRequest } from "@/lib/sfx-catalog/search";

const INTENSITIES = new Set(["light", "medium", "heavy"]);

function invalid(message: string): never {
  throw toolError("INVALID_ARGUMENTS", message, { action: "fix_arguments", reason: message });
}

function placeableEntries() {
  return readSfxCatalog().sound_effects.filter((entry) => sfxCatalogFileExists(entry.file));
}

function parseSearch(body: Record<string, unknown>): SfxSearchRequest {
  const request: SfxSearchRequest = {};
  if (body.query !== undefined) {
    if (typeof body.query !== "string" || body.query.length > 200) invalid("query must be text up to 200 characters");
    request.query = body.query;
  }
  if (body.role !== undefined) {
    if (!SFX_ROLES.includes(body.role as SfxRole)) invalid(`role must be one of ${SFX_ROLES.join(", ")}`);
    request.role = body.role as SfxRole;
  }
  if (body.intensity !== undefined) {
    if (!INTENSITIES.has(body.intensity as string)) invalid("intensity must be light, medium or heavy");
    request.intensity = body.intensity as SfxSearchRequest["intensity"];
  }
  if (body.max_duration_seconds !== undefined) {
    if (typeof body.max_duration_seconds !== "number" || !(body.max_duration_seconds > 0)) invalid("max_duration_seconds must be a positive number");
    request.max_duration_seconds = body.max_duration_seconds;
  }
  if (body.limit !== undefined) {
    if (!Number.isInteger(body.limit) || (body.limit as number) < 1 || (body.limit as number) > 20) invalid("limit must be 1–20");
    request.limit = body.limit as number;
  }
  if (!request.query && !request.role) invalid("Give a query, a role, or both");
  return request;
}

/** Ranked catalog search. Read-only; source_url is ready for create_audio. */
export function sfxSearch(body: Record<string, unknown>) {
  const request = parseSearch(body);
  const results = searchSfxCatalog(placeableEntries(), request);
  return {
    results,
    count: results.length,
    note: "Ranked by catalog metadata, not by listening. Audition the best two or three with sfx_audition_prepare at the cue, then propose them as options of one card.",
  };
}

/**
 * Cue context, placed candidates with ready create_audio operations, and an alignment image.
 * Read-only: never edits the timeline. The creator auditions by ear through proposal options.
 */
export async function sfxAuditionPrepare(projectId: string, body: Record<string, unknown>) {
  const cue = body.cue_seconds;
  if (typeof cue !== "number" || !Number.isFinite(cue) || cue < 0) invalid("cue_seconds must be a timeline time in seconds");
  if (!SFX_ROLES.includes(body.role as SfxRole)) invalid(`role must be one of ${SFX_ROLES.join(", ")}`);
  const role = body.role as SfxRole;
  const contextSeconds = body.context_seconds === undefined ? 1.5 : body.context_seconds;
  if (typeof contextSeconds !== "number" || contextSeconds < 0.5 || contextSeconds > 5) invalid("context_seconds must be 0.5–5");
  const maxCandidates = body.max_candidates === undefined ? 3 : body.max_candidates;
  if (!Number.isInteger(maxCandidates) || (maxCandidates as number) < 1 || (maxCandidates as number) > 4) invalid("max_candidates must be 1–4");

  const timeline = readTimeline(projectId);
  const elements = activeElements(timeline);
  const context = cueContext(elements, cue, contextSeconds);
  const entries = placeableEntries();

  let hits: SfxSearchHit[];
  if (body.candidate_ids !== undefined) {
    if (!Array.isArray(body.candidate_ids) || body.candidate_ids.length === 0 || body.candidate_ids.length > 4
      || !body.candidate_ids.every((id) => typeof id === "string")) invalid("candidate_ids must list 1–4 catalog ids from sfx_search");
    const byId = new Map(entries.map((entry) => [entry.id, entry]));
    const missing = (body.candidate_ids as string[]).filter((id) => !byId.has(id));
    if (missing.length) invalid(`Unknown or unavailable catalog ids: ${missing.join(", ")}`);
    // Without a query or duration limit every entry scores, so each id yields its hit.
    hits = (body.candidate_ids as string[]).map((id) => searchSfxCatalog([byId.get(id)!], { role, limit: 1 })[0]!);
  } else {
    // Prefer sounds whose audible part ends before the next line of speech.
    const gap = context.speech_after_start_seconds != null ? context.speech_after_start_seconds - context.cue_seconds + 0.5 : undefined;
    hits = searchSfxCatalog(entries, {
      ...(typeof body.query === "string" && body.query.trim() ? { query: body.query.slice(0, 200) } : {}),
      role,
      ...(gap !== undefined && gap > 0.2 ? { max_duration_seconds: Math.max(gap, 0.4) } : {}),
      limit: maxCandidates as number,
    });
    if (hits.length === 0) {
      hits = searchSfxCatalog(entries, { ...(typeof body.query === "string" && body.query.trim() ? { query: body.query } : {}), role, limit: maxCandidates as number });
    }
  }
  if (hits.length === 0) {
    throw toolError("NO_CANDIDATES", "No catalog sound matched; try a broader query or another role.", { action: "sfx_search", reason: "Search with different words, or synthesize one with sound_synth_prepare." }, 404);
  }

  const candidates = await Promise.all(hits.map(async (hit) => {
    const placement = placeAtCue(hit, context);
    const end = placement.timeline_start + (placement.source_end_seconds - placement.source_start_seconds);
    const lane = freeSfxLane(elements, placement.timeline_start, end);
    placement.lane_key = lane.lane_key;
    placement.lane_index = lane.lane_index;
    const file = entries.find((entry) => entry.id === hit.id)!.file;
    let envelope: number[] = [];
    try {
      envelope = await audioEnvelope(resolveSfxCatalogFile(file));
    } catch {
      envelope = [];
    }
    return {
      hit,
      placement,
      envelope,
      proposal_operation: {
        element_id: randomUUID(),
        create_audio: {
          type: "sound_effect" as const,
          title: hit.title.slice(0, 500),
          source_url: hit.source_url,
          timeline_start: placement.timeline_start,
          source_duration_seconds: hit.duration_seconds,
          source_start_seconds: placement.source_start_seconds,
          source_end_seconds: placement.source_end_seconds,
          lane_key: lane.lane_key,
          lane_index: lane.lane_index,
          volume: placement.volume,
        },
      },
    };
  }));

  const image = await renderAuditionImage(context, candidates.map((candidate) => ({
    label: candidate.hit.title,
    placement: candidate.placement,
    envelope: candidate.envelope,
  })));
  const frameTimes = [context.cue_seconds - 0.4, context.cue_seconds, context.cue_seconds + 0.4]
    .filter((time) => time >= 0)
    .map((time) => time.toFixed(2));

  return {
    context,
    candidates: candidates.map(({ hit, placement, proposal_operation }) => ({
      id: hit.id,
      title: hit.title,
      source_status: hit.source_status,
      tags: hit.tags,
      editorial: hit.editorial,
      duration_seconds: hit.duration_seconds,
      loudness_lufs: hit.analysis.integrated_lufs,
      placement,
      proposal_operation,
    })),
    image: { type: "image", mimeType: "image/png", data: image.toString("base64") },
    frames: {
      tool: "run_instrument",
      arguments: { instrument: "frame-state", project_id: projectId, extra_args: ["--at", frameTimes.join(",")] },
      then: "timeline_evidence with the report it names, to see the picture at the cue.",
    },
    next: {
      action: "proposal_create",
      reason: "Put the candidates you judge plausible in one proposal as options for the same cue (each option one proposal_operation, one recommended), so the creator listens and picks. Adjust volume when the context calls for it.",
    },
    limits: "Placement aligns each sound's measured peak to the cue and levels it toward -18 LUFS (6 dB lower over speech). The image shows loudness over time, not timbre; nobody has listened yet.",
  };
}
