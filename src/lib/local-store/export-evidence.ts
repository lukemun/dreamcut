import type { feedbackCoverage } from "../timeline/editing-feedback";
import type { EditAttribution } from "./edit-attribution";

// Privacy-limited projection of an export checkpoint or project history: no media,
// source URLs, local paths or caption transcripts. Export sharing and background
// editing records upload it; the editor itself never reviews it.

const EVIDENCE_TIMELINE_FIELDS = new Set([
  "type", "timeline_start", "duration", "volume", "fade_in", "fade_out", "playback_rate", "trim_start", "trim_end",
]);
const EVIDENCE_STYLE_FIELDS = new Set([
  "fontSizePx", "color", "activeWordColor", "timingMode", "bottomPercent", "maxWidthPercent", "lineHeight", "fontFamily",
]);
const EVIDENCE_LAYOUT_FIELDS = new Set([
  "media_scale", "media_offset_x", "media_offset_y", "media_opacity", "objectFit", "mask_inset", "mask_feather", "mask_corner_radius",
  "absX", "absY", "offsetX", "offsetY", "maxWidth", "positionPreset", "anchorX", "anchorY",
  "sticker_outline", "sticker_outline_width", "has_alpha", "visual_role", "editorial_role",
]);

const safeScalarEntries = (value: Record<string, unknown>, allowed: Set<string>) => Object.fromEntries(
  Object.entries(value).filter(([key, entry]) => allowed.has(key) && ["number", "string", "boolean"].includes(typeof entry)),
);

const safeLayoutObject = (value: unknown, allowed: Set<string>) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const selected = safeScalarEntries(value as Record<string, unknown>, allowed);
  return Object.keys(selected).length ? selected : undefined;
};

function changedProjection(before: ReturnType<typeof projectEvidenceClipState>, after: ReturnType<typeof projectEvidenceClipState>) {
  if (!before || !after) return { before, after };
  const keys = Object.keys(before).filter(key => JSON.stringify(before[key as keyof typeof before]) !== JSON.stringify(after[key as keyof typeof after]));
  return { before: Object.fromEntries(keys.map(key => [key, before[key as keyof typeof before]])), after: Object.fromEntries(keys.map(key => [key, after[key as keyof typeof after]])) };
}

/** Privacy-limited but spatially useful evidence about an export. */
export function projectEvidenceClipState(value: Record<string, unknown> | null) {
  if (!value) return null;
  const props = (value.props ?? {}) as Record<string, unknown>;
  const semanticLayout = safeLayoutObject(props.semantic_layout, new Set(["schema_version", "slot", "size", "frame_model", "motion"]));
  const crowdLayout = safeLayoutObject(props.crowd_layout, new Set(["schema_version", "region", "index", "total"]));
  const groupLayout = safeLayoutObject(props.groupLayout, new Set(["kind", "row", "rows", "column", "columns"]));
  const keyframes = props.keyframes && typeof props.keyframes === "object" && !Array.isArray(props.keyframes)
    ? Object.fromEntries(Object.entries(props.keyframes as Record<string, unknown>)
      .filter(([field, points]) => EVIDENCE_LAYOUT_FIELDS.has(field) && Array.isArray(points))
      .map(([field, points]) => [field, (points as unknown[]).length]))
    : undefined;
  const layout = {
    ...safeScalarEntries(props, EVIDENCE_LAYOUT_FIELDS),
    ...(semanticLayout ? { semantic_layout: semanticLayout } : {}),
    ...(crowdLayout ? { crowd_layout: crowdLayout } : {}),
    ...(groupLayout ? { groupLayout } : {}),
    ...(keyframes && Object.keys(keyframes).length ? { spatial_keyframe_counts: keyframes } : {}),
  };
  return {
    removed: Boolean(value.removed_at),
    ...safeScalarEntries(value, EVIDENCE_TIMELINE_FIELDS),
    style: safeScalarEntries(props, EVIDENCE_STYLE_FIELDS),
    layout,
    caption_word_count: value.type === "caption_text" && typeof props.text === "string" ? props.text.trim().split(/\s+/).length : undefined,
  };
}

const redact = (text: string) => text.replace(/https?:\/\/\S+/g, "[link]").replace(/(?:\/Users\/|\/home\/|[A-Z]:\\)[^\s]+/g, "[local path]");
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const editorialText = (value: unknown) => typeof value === "string" ? redact(value) : undefined;

/** Preserve reasons, not arbitrary metadata, scripts, media manifests or transcripts. */
function contextProjection(field: string, value: unknown): unknown {
  const item = record(value);
  if (field === "frame_tags") return (Array.isArray(item.tags) ? item.tags : []).map(raw => {
    const tag = record(raw);
    return { id: tag.id, label: editorialText(tag.label), note: editorialText(tag.note),
      timeline_seconds: tag.timeline_seconds, timeline_revision: tag.timeline_revision };
  });
  if (field === "metadata") return safeScalarEntries(item, new Set(["output_aspect_ratio", "fps", "width", "height"]));
  // Unknown schemas are signalled as changed, not copied into a model prompt.
  return { omitted_private_context: true, entries: Array.isArray(value) ? value.length : Object.keys(item).length };
}

export function buildExportEvidence(checkpoint: Record<string, unknown>) {
  // Only compact semantic facts are sent. Do not send source URLs, paths, raw media, or caption transcripts.
  const chapters = (checkpoint.chapters as (Partial<EditAttribution> & { id: string; category: string; operation: string; summary: string; context_changes?: { field: string; before: unknown; after: unknown }[]; changes: { before: Record<string, unknown> | null; after: Record<string, unknown> | null }[] })[]).map(c => ({
    id: c.id, category: c.category, operation: c.operation, summary: redact(c.summary),
    actor: c.actor ?? "unknown", initiated_by: c.initiated_by ?? "unknown", attribution_source: c.attribution_source ?? "unknown",
    responds_to_feedback_ids: c.responds_to_feedback_ids, transaction_id: c.transaction_id, proposal_ids: c.proposal_ids, restores_snapshot_id: c.restores_snapshot_id,
    context_changes: (c.context_changes ?? []).map(change => ({ field: change.field,
      before: contextProjection(change.field, change.before), after: contextProjection(change.field, change.after) })),
    changes: c.changes.map(change => {
      const fields = new Set([...Object.keys(change.before ?? {}), ...Object.keys(change.after ?? {})]);
      const changed_fields = [...fields].filter(key => JSON.stringify(change.before?.[key]) !== JSON.stringify(change.after?.[key]));
      return { ...changedProjection(projectEvidenceClipState(change.before), projectEvidenceClipState(change.after)), changed_fields };
    }),
  }));
  const proposals = (checkpoint.proposals as { proposal_id: string; status: string; brief?: string; proposal: { summary: string; responds_to_feedback_ids?: string[]; operations?: { rationale?: string }[]; options?: { id: string; label: string; summary: string; recommended?: boolean; operations?: { rationale?: string }[] }[] }; resolution?: { numeric_overrides?: unknown[]; reason?: string; option_id?: string } }[]).map(p => ({
    id: p.proposal_id, responds_to_feedback_ids: p.proposal.responds_to_feedback_ids ?? [], status: p.status, summary: redact(p.proposal.summary), overrides: p.resolution?.numeric_overrides ?? [], reason: redact(p.resolution?.reason ?? ""),
    brief: editorialText(p.brief), brief_provenance: "saved_proposal_context_not_verified_user_quote",
    operation_rationales: (p.proposal.operations ?? []).flatMap((op, index) => op.rationale ? [{ index, rationale: redact(op.rationale), provenance: "agent_proposal" }] : []),
    selected_option_id: p.resolution?.option_id,
    options: (p.proposal.options ?? []).map(option => ({ id: option.id, label: redact(option.label), summary: redact(option.summary), recommended: option.recommended,
      operation_rationales: (option.operations ?? []).flatMap((op, index) => op.rationale ? [{ index, rationale: redact(op.rationale), provenance: "agent_proposal" }] : []) })),
  }));
  const skills = (checkpoint.core_skills as { name: string; description: string; purpose?: string | null; evolution?: string }[]).map(skill => ({ name: skill.name, description: skill.description, purpose: skill.purpose ?? null, evolution: skill.evolution ?? "", purpose_status: skill.purpose ? "available" : "missing_in_checkpoint" }));
  const events = (checkpoint.events as { id: string; type: string; actor: string; summary: string; data?: Record<string, unknown> }[]).map(e => ({
    id: e.id, type: e.type, actor: e.actor, summary: redact(e.summary),
    summary_provenance: e.type.startsWith("proposal.") ? "agent_proposal_summary_not_user_quote" : "recorded_summary_not_verified_user_quote",
    resolution_reason: editorialText(record(e.data?.resolution).reason),
    initiated_by: e.data?.initiated_by, attribution_source: e.data?.attribution_source,
    responds_to_feedback_ids: e.data?.responds_to_feedback_ids, transaction_id: e.data?.transaction_id,
    proposal_ids: e.data?.proposal_ids, restores_snapshot_id: e.data?.restores_snapshot_id,
    ...(e.type === "editorial.feedback" ? { direction: editorialText(e.data?.direction ?? e.summary), reason: editorialText(e.data?.reason),
      feedback_provenance: e.data?.provenance, supersedes_event_id: e.data?.supersedes_event_id } : {}),
    ...(e.type === "editorial.feedback_disposition" ? { feedback_id: e.data?.feedback_id, disposition: e.data?.disposition } : {}),
  }));
  const timeline = checkpoint.timeline as { elements?: Record<string, unknown>[] } | undefined;
  const finalTimeline = (timeline?.elements ?? []).filter(e => !e.removed_at).map(e => ({ id: e.id, ...projectEvidenceClipState(e) }));
  const metadata = checkpoint.metadata as Record<string, unknown> | undefined;
  const feedback = checkpoint.feedback as ReturnType<typeof feedbackCoverage> | undefined;
  return { feedback: feedback ? {
    ...feedback, directions: feedback.directions.map(direction => ({ ...direction,
      direction: redact(direction.direction), reason: direction.reason ? redact(direction.reason) : null,
      disposition_reason: direction.disposition_reason ? redact(direction.disposition_reason) : null,
      proposals: direction.proposals.map(proposal => ({ ...proposal, summary: redact(proposal.summary) })),
    })),
  } : undefined, chapters, proposals, events, final_timeline: finalTimeline, export_settings: {
    muted_lane_keys: checkpoint.muted_lane_keys ?? metadata?.muted_lane_keys,
    hidden_lane_keys: checkpoint.hidden_lane_keys ?? metadata?.hidden_lane_keys,
    lane_order_keys: metadata?.lane_order_keys, aspect_ratio: metadata?.output_aspect_ratio, resolution: checkpoint.resolution,
  }, preferences: checkpoint.preferences, skills };
}

/** Never silently drop early edits. Oversized histories get bounded read-only passes. */
