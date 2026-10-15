// Builders for product signals: the fixed-schema, upload-eligible records described in
// docs/architecture/desktop-data-layout.md. Each builder copies named fields only, so no
// argument value, rationale or media reaches the record by accident. The editor validates
// and stores them (src/lib/observability/product-signals.ts); recording never blocks a tool.
import { randomUUID } from 'node:crypto';
import { missingFields, unknownFields, trimValidatorPatterns } from './argument-errors.mjs';

const STRUCTURAL = ['create_transition', 'create_audio', 'create_visual', 'create_text', 'remove_visual', 'remove_text', 'set_lane_order', 'set_output_format',
  'opening_sequence_edit', 'source_range_cut', 'source_range_restore', 'set_preview_audio_source', 'use_video_stabilization', 'use_recast', 'use_voice_enhancement',
  'reattach_original_audio', 'sync_speech_visual', 'replace_captions'];

const envelope = ({ sessionId, client, projectId }) => ({
  schema_version: 1, signal_id: randomUUID(), at: new Date().toISOString(), session_id: sessionId, client,
  ...(typeof projectId === 'string' && projectId ? { project_id: projectId.slice(0, 128) } : {}),
});

/** A capability_catalog search and what it found; a search with no results is a miss. */
/** The creator's own templates are named after private recipes; signals keep only that one matched. */
const privateTemplate = entry => entry?.kind === 'template' && ['mine', 'saved'].includes(entry.owner);

export function catalogSearchSignal(context, args, result) {
  if (args?.action !== 'search' || typeof args.query !== 'string' || !Array.isArray(result?.entries)) return undefined;
  return { ...envelope(context), event: 'catalog_search', query: args.query.slice(0, 200),
    result_count: Number(result.total ?? result.entries.length) || 0,
    top: result.entries.slice(0, 5).map(entry => ({ id: privateTemplate(entry) ? 'template:private' : String(entry.id).slice(0, 200), kind: String(entry.kind ?? 'unknown').slice(0, 40) })),
    miss: (Number(result.total ?? result.entries.length) || 0) === 0 };
}

/** Rejected tool arguments: the fields an agent invented or left out, never their values. */
export function argumentsRejectedSignal(context, { tool, layer, schema, args, message }) {
  return { ...envelope(context), event: 'arguments_rejected', tool, layer,
    unknown_fields: (schema ? unknownFields(schema, args) : []).slice(0, 16)
      .map(item => ({ path: item.path.slice(0, 300), field: item.field.slice(0, 128), suggested: item.suggested.slice(0, 8).map(name => String(name).slice(0, 128)) })),
    missing_fields: missingFields(message).slice(0, 16).map(field => field.slice(0, 300)),
    message: trimValidatorPatterns(message).slice(0, 600) };
}

/** Field names an operation changes, for example props.mask_inset or create_visual. */
function changedFields(operation) {
  return [
    ...['patch', 'props'].flatMap(target => Object.keys(operation?.[target] ?? {}).map(field => `${target}.${field}`)),
    ...(operation?.clear_props ?? []).map(field => `clear_props.${field}`),
    ...STRUCTURAL.filter(kind => operation?.[kind] != null),
  ];
}

/** A staged proposal: what each option changes, which dials it offers, and what has none. */
export function proposalStagedSignal(context, tool, result) {
  const options = result?.proposal?.options;
  if (!Array.isArray(options)) return undefined;
  return { ...envelope(context), event: 'proposal_staged', tool,
    options: options.slice(0, 20).map(option => ({
      changed_fields: [...new Set((option.operations ?? []).flatMap(changedFields))].slice(0, 200),
      dials: (option.review_controls ?? []).map(ref => `${ref.target}.${ref.field}`).slice(0, 50),
      dials_origin: option.review_controls_origin ?? null,
      control_gaps: (option.control_gaps ?? []).map(gap => ({ field: `${gap.target}.${gap.field}`, value_kind: gap.value_kind })).slice(0, 200),
      dropped_dials: (option.dropped_review_controls ?? []).length,
    })) };
}

/** Send a signal without letting a recording failure affect the tool call. */
export async function sendSignal(post, signal) {
  if (!signal) return;
  try { await post(signal); } catch { /* A lost signal never changes an edit. */ }
}
