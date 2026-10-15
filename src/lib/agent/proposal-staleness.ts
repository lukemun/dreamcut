import { createHash } from "node:crypto";

import type { EditorAgentProposal } from "@/lib/agent/timeline-editor-agent-apply";
import type { ProposalRecord } from "@/lib/local-store/proposals";
import type { TimelineFile } from "@/lib/local-store/store";

/**
 * Element-scoped staleness.
 *
 * A pending proposal used to die on a WHOLE-FILE hash: nudging an unrelated
 * caption invalidated every pending proposal, including ones touching disjoint
 * elements, and the review drawer then dropped them silently. That made "the
 * agent's work vanished" the default outcome of a normal session rather than an
 * edge case.
 *
 * Instead we fingerprint the elements a proposal actually touches when it is
 * saved. A later human edit only invalidates the proposal if it changed one of
 * THOSE elements. Everything else is a rebase candidate: the record moves onto
 * the newer revision after re-validating against it (see refreshPendingProposals
 * in the proposals store).
 *
 * The whole-file `expected_revision` check inside the project lock at apply time
 * is untouched and remains the authority — this only decides what stays
 * actionable in the review UI, never what is safe to write.
 */

/** Ops whose validity depends on timeline-wide state, not just their own targets (legacy scope check). */
const GLOBAL_SCOPE_OPERATION_KEYS = [
  // Ripples every element's timeline_start.
  "opening_sequence_edit",
  // Splits the source clip and ripples every downstream layer.
  "source_range_cut",
  // Re-derives a visual from an audible source clip and its playback clock.
  "sync_speech_visual",
  // Replaces a whole caption rail atomically.
  "replace_captions",
] as const;

function sameLaneOrder(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((lane, index) => lane === right[index]);
}

// These channels merge directly, one scalar/animation track at a time. Compound
// adapters (grade, masks, semantic layout, speech clocks) stay element-scoped.
const INDEPENDENT_CHANNELS = new Set([
  "subject_flash", "subject_glow", "subject_glow_radius",
  "media_scale", "media_offset_x", "media_offset_y", "media_opacity",
  "directional_blur_x", "directional_blur_y", "zoom_blur", "transition_blur",
]);
const LOCAL_APPEARANCE_CHANNELS = new Set(["subject_flash", "subject_glow", "subject_glow_radius"]);
const SCOPED_PREFIX = "effect-v1:";

/** Explicitly independent, direct visual edits may coexist on one actor. */
function effectFingerprint(element: ElementLike, proposal: EditorAgentProposal): string | null {
  if (proposal.rebase_policy !== "independent" || !["still", "video_clip"].includes(String(element.type))) return null;
  const props = (element.props ?? {}) as Record<string, unknown>;
  if (props.semanticLayout || props.crowdLayout || props.speech_sync_binding) return null;
  const owned = new Set<string>();
  let patchesClock = false;
  for (const option of proposal.options) {
    if (option.timing_controls?.length) return null;
    for (const operation of option.operations.filter(op => op.element_id === element.id)) {
      if (Object.keys(operation).some(key => !["element_id", "props", "patch", "rationale"].includes(key))) return null;
      if (Object.keys(operation.patch ?? {}).some(key => !["timeline_start", "duration", "trim_start", "trim_end", "playback_rate"].includes(key))) return null;
      patchesClock ||= Object.keys(operation.patch ?? {}).length > 0;
      for (const [field, value] of Object.entries(operation.props ?? {})) {
        const fields = field === "transition_keyframes" ? Object.keys(value as object) : [field];
        if (fields.some(key => !INDEPENDENT_CHANNELS.has(key))) return null;
        fields.forEach(key => owned.add(key));
      }
    }
    for (const preserve of option.preserve_fields ?? []) {
      if (preserve.element_id !== element.id) continue;
      for (const field of preserve.fields) {
        if (field.startsWith("props.")) owned.add(field.slice(6));
        if (["duration", "trim_end", "playback_rate"].includes(field)) patchesClock = true;
      }
    }
  }
  if (!owned.size) return null;
  const projectedProps = {...props};
  const keyframes = {...(props.keyframes ?? {}) as Record<string, unknown>};
  for (const field of INDEPENDENT_CHANNELS) {
    if (owned.has(field)) continue;
    delete projectedProps[field];
    delete keyframes[field];
  }
  // Treat absent and empty track containers identically; inserting an unrelated
  // channel must not change the dependency signature.
  delete projectedProps.keyframes;
  if (Object.keys(keyframes).length) projectedProps.keyframes = keyframes;
  const projected: ElementLike = {...element, props: projectedProps};
  // A flash/glow is local-clock decoration. It follows the live performance;
  // source identity, source-in, placement and locks remain dependencies. Full
  // validation still rejects a shortened clip that cannot contain its keys.
  if (!patchesClock && [...owned].every(field => LOCAL_APPEARANCE_CHANNELS.has(field))) {
    const limit = props.media_limit_duration_seconds;
    if (typeof limit === "number" && proposal.options.some(option => option.operations.some(operation =>
      operation.element_id === element.id && Object.values(operation.props?.transition_keyframes ?? {})
        .some(points => points?.some(point => point.t > limit))))) return null;
    delete projectedProps.media_limit_duration_seconds;
    projected.duration = null;
    projected.trim_end = null;
    projected.playback_rate = null;
  }
  return SCOPED_PREFIX + elementFingerprint(projected);
}

type ElementLike = {
  id: string;
  [key: string]: unknown;
};

/**
 * Hash of the fields an edit can change. Deliberately excludes `updated_at`, so
 * a no-op write (or an unrelated touch that rewrites timestamps) does not read
 * as a conflicting edit.
 */
export function elementFingerprint(element: ElementLike): string {
  const material = {
    timeline_start: element.timeline_start ?? null,
    duration: element.duration ?? null,
    lane_key: element.lane_key ?? null,
    lane_index: element.lane_index ?? null,
    trim_start: element.trim_start ?? null,
    trim_end: element.trim_end ?? null,
    volume: element.volume ?? null,
    fade_in: element.fade_in ?? null,
    fade_out: element.fade_out ?? null,
    playback_rate: element.playback_rate ?? null,
    position_locked: element.position_locked ?? null,
    removed_at: element.removed_at ?? null,
    source_url: element.source_url ?? null,
    type: element.type ?? null,
    props: element.props ?? null,
  };
  return createHash("sha256").update(JSON.stringify(material)).digest("hex").slice(0, 32);
}

/** Every element id the proposal references, across all its options. */
export function proposalTouchedElementIds(proposal: EditorAgentProposal): string[] {
  const ids = new Set<string>();
  for (const option of proposal.options) {
    for (const operation of option.operations) ids.add(operation.element_id);
  }
  return [...ids];
}

/**
 * True when any option contains an operation whose validity depends on
 * timeline-wide state. Those proposals keep whole-file staleness. Create
 * operations deliberately do not: refresh re-validates their exact placement
 * against the new timeline, so an unrelated approval can carry them forward
 * while a real lane collision still fails closed.
 */
export function proposalNeedsWholeFileScope(
  proposal: EditorAgentProposal,
  liveLaneOrderKeys?: readonly string[],
): boolean {
  return proposal.options.some((option) =>
    option.operations.some((operation) =>
      GLOBAL_SCOPE_OPERATION_KEYS.some((key) => key in (operation as Record<string, unknown>))
      // A lane order that already matches the live metadata is a no-op. Keeping
      // it in an independent asset proposal must not strand every sibling after
      // the first approval merely because that first approval registered the
      // shared foreground lane.
      || (operation.set_lane_order != null && (
        liveLaneOrderKeys == null
        || !sameLaneOrder(operation.set_lane_order.lane_order_keys, liveLaneOrderKeys)
      ))));
}

/** Fingerprints for the elements a proposal touches, as of this timeline. */
export function proposalElementFingerprints(
  timeline: TimelineFile,
  proposal: EditorAgentProposal,
): Record<string, string> {
  const byId = new Map((timeline.elements as ElementLike[]).map((element) => [element.id, element]));
  const fingerprints: Record<string, string> = {};
  for (const elementId of proposalTouchedElementIds(proposal)) {
    const element = byId.get(elementId);
    // A create_* target does not exist yet; absence is itself the fingerprint.
    fingerprints[elementId] = element ? effectFingerprint(element, proposal) ?? elementFingerprint(element) : "absent";
  }
  return fingerprints;
}

export type ProposalStaleness = {
  /** Not actionable: an element this proposal depends on changed underneath it. */
  stale: boolean;
  /** Revision differs but no touched element changed — safe to re-validate and rebase. */
  rebasable: boolean;
  /** Human-readable why, for the review drawer. */
  reason: string | null;
};

/**
 * Decide whether a pending record still applies, without writing anything.
 *
 * Every card is drafted to stand alone (see `assertCardStandsAlone`), so a later edit
 * elsewhere, another card's approval, or the creator changing a setting this card also sets
 * does not retire it: it moves onto the new revision once it still validates
 * (refreshPendingProposals), and a setting it will replace is reported by
 * `proposalOverrides`. It is out of date only when a clip it changes was deleted; anything
 * else that stops it applying is caught by that re-validation.
 */
export function evaluateProposalStaleness(
  record: ProposalRecord,
  timeline: TimelineFile,
  liveRevision: string,
  // Kept for callers; lane order is decided by re-validation now.
  _liveLaneOrderKeys?: readonly string[],
): ProposalStaleness {
  if (record.status !== "pending" || record.proposal.expected_revision === liveRevision) {
    return { stale: false, rebasable: false, reason: null };
  }
  const byId = new Map((timeline.elements as ElementLike[]).map((element) => [element.id, element]));
  const deleted = Object.entries(record.touched_fingerprints ?? {}).filter(([elementId, fingerprint]) => {
    if (fingerprint === "absent") return false;
    const element = byId.get(elementId);
    return !element || element.removed_at != null;
  });
  if (deleted.length) {
    return {
      stale: true,
      rebasable: false,
      reason: deleted.length === 1 ? "A clip this card changes was deleted." : `${deleted.length} clips this card changes were deleted.`,
    };
  }
  return { stale: false, rebasable: true, reason: null };
}

/** A card's writes: element id → fields. "*" is the whole clip; "@…" ids are timeline-wide state. */
export type ProposalWrites = Map<string, Set<string>>;

const WHOLE_ELEMENT_KEYS = ["create_audio", "create_text", "create_visual", "create_transition", "remove_text", "remove_visual",
  "sync_speech_visual", "reattach_original_audio", "use_video_stabilization", "use_recast", "use_voice_enhancement", "set_preview_audio_source"] as const;
/** Ops that move everything after them; they cannot share the queue with cards placed by time. */
const RIPPLE_KEYS = ["source_range_cut", "source_range_restore", "opening_sequence_edit"] as const;
export const TIMELINE_WIDE = "@timeline";

export function proposalWrites(proposal: EditorAgentProposal): ProposalWrites {
  const writes: ProposalWrites = new Map();
  const add = (id: string, field: string) => {
    const fields = writes.get(id) ?? new Set<string>();
    fields.add(field);
    writes.set(id, fields);
  };
  for (const option of proposal.options) {
    for (const operation of option.operations) {
      const op = operation as Record<string, unknown> & { element_id: string };
      if (RIPPLE_KEYS.some((key) => key in op)) add(TIMELINE_WIDE, "ripple");
      if (WHOLE_ELEMENT_KEYS.some((key) => key in op)) add(op.element_id, "*");
      if (op.replace_captions) add(`@captions:${(op.replace_captions as { lane_key?: string }).lane_key ?? "captions_0"}`, "*");
      if (op.set_output_format) add("@output", "*");
      for (const field of Object.keys((op.patch ?? {}) as object)) add(op.element_id, field);
      for (const field of (op.clear_patch ?? []) as string[]) add(op.element_id, field);
      for (const [field, value] of Object.entries((op.props ?? {}) as Record<string, unknown>)) {
        if (field === "transition_keyframes" && value && typeof value === "object") {
          for (const channel of Object.keys(value)) add(op.element_id, `props.transition_keyframes.${channel}`);
        } else add(op.element_id, `props.${field}`);
      }
      for (const field of (op.clear_props ?? []) as string[]) add(op.element_id, `props.${field}`);
    }
  }
  return writes;
}

/** Where two cards would change the same thing: [element id, field] pairs, or a ripple. */
export function overlappingWrites(left: ProposalWrites, right: ProposalWrites): Array<[string, string]> {
  if ((left.has(TIMELINE_WIDE) && right.size) || (right.has(TIMELINE_WIDE) && left.size)) return [[TIMELINE_WIDE, "ripple"]];
  const overlaps: Array<[string, string]> = [];
  for (const [id, fields] of left) {
    const other = right.get(id);
    if (!other) continue;
    if (fields.has("*") || other.has("*")) { overlaps.push([id, "*"]); continue; }
    for (const field of fields) if (other.has(field)) overlaps.push([id, field]);
  }
  return overlaps;
}

function fieldValue(element: ElementLike, field: string): unknown {
  if (field.startsWith("props.")) return ((element.props ?? {}) as Record<string, unknown>)[field.slice(6)] ?? null;
  return element[field] ?? null;
}

/** The values a card's settings had when it was drafted, so a later change by the creator can be named. */
export function proposalBaseValues(timeline: TimelineFile, proposal: EditorAgentProposal): Record<string, Record<string, unknown>> {
  const byId = new Map((timeline.elements as ElementLike[]).map((element) => [element.id, element]));
  const values: Record<string, Record<string, unknown>> = {};
  for (const [id, fields] of proposalWrites(proposal)) {
    const element = byId.get(id);
    if (!element) continue;
    for (const field of fields) {
      if (field === "*" || field.startsWith("props.transition_keyframes.")) continue;
      (values[id] ??= {})[field] = fieldValue(element, field);
    }
  }
  return values;
}

/** Settings this card will replace that the creator changed since it was drafted. */
export function proposalOverrides(record: Pick<ProposalRecord, "touched_base_values">, timeline: TimelineFile): Array<{ element_id: string; field: string }> {
  const byId = new Map((timeline.elements as ElementLike[]).map((element) => [element.id, element]));
  const overrides: Array<{ element_id: string; field: string }> = [];
  for (const [id, fields] of Object.entries(record.touched_base_values ?? {})) {
    const element = byId.get(id);
    if (!element) continue;
    for (const [field, value] of Object.entries(fields)) {
      if (JSON.stringify(fieldValue(element, field)) !== JSON.stringify(value)) overrides.push({ element_id: id, field });
    }
  }
  return overrides;
}
