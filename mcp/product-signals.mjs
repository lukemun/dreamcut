// Builders for product signals: the fixed-schema, upload-eligible records described in
// docs/architecture/desktop-data-layout.md. Each builder copies named fields only, so no
// argument value, rationale or media reaches the record by accident. The editor validates
// and stores them (src/lib/observability/product-signals.ts); recording never blocks a tool.
import { createHash, randomUUID } from 'node:crypto';
import { missingFields, unknownFields, trimValidatorPatterns } from './argument-errors.mjs';

const STRUCTURAL = ['create_transition', 'create_audio', 'create_visual', 'create_text', 'create_shape', 'remove_visual', 'remove_text', 'remove_audio', 'set_lane_order', 'set_output_format',
  'opening_sequence_edit', 'source_range_cut', 'source_range_restore', 'speed_change', 'set_preview_audio_source', 'use_video_stabilization', 'use_recast', 'use_voice_enhancement',
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
export function argumentsRejectedSignal(context, { tool, layer, schema, args, message, errorCode }) {
  return { ...envelope(context), event: 'arguments_rejected', tool, layer,
    ...(typeof errorCode === 'string' && errorCode ? { error_code: errorCode.slice(0, 100) } : {}),
    unknown_fields: (schema ? unknownFields(schema, args) : []).slice(0, 16)
      .map(item => ({ path: item.path.slice(0, 300), field: item.field.slice(0, 128), suggested: item.suggested.slice(0, 8).map(name => String(name).slice(0, 128)) })),
    missing_fields: missingFields(message).slice(0, 16).map(field => field.slice(0, 300)),
    message: trimValidatorPatterns(message).slice(0, 600) };
}

const REFUSAL_FAILURES = new Set(['TOOL_FAILED', 'SCRIPT_FAILED', 'INVALID_ARGUMENTS', 'INVALID_INPUT']);
/** A typed, non-retryable refusal other than an argument rejection (an authority gate, a stale id, a missing prerequisite). */
export function toolRefusedSignal(context, tool, toolError) {
  if (!toolError || typeof toolError.code !== 'string' || toolError.retryable === true || REFUSAL_FAILURES.has(toolError.code)) return undefined;
  return { ...envelope(context), event: 'tool_refused', tool, error_code: toolError.code.slice(0, 100),
    ...(typeof toolError.recovery?.action === 'string' ? { recovery_action: toolError.recovery.action.slice(0, 40) } : {}) };
}

const SELECTION_TOOLS = { editor_context_get: result => result?.selection?.items, timeline_get: result => result?.library_selection?.items };
/** A project file's id names the file; keep a stable digest so a retro can tell items apart without the name. */
const selectionId = item => item.group === 'media' && !String(item.id).startsWith('media:catalog:')
  ? `media:#${createHash('sha256').update(String(item.id)).digest('hex').slice(0, 12)}` : String(item.id).slice(0, 200);
/** What the creator had selected when the agent read the project: ids and kinds, never labels or text. */
export function selectionReadSignal(context, tool, result) {
  const items = SELECTION_TOOLS[tool]?.(result);
  if (!Array.isArray(items)) return undefined;
  return { ...envelope(context), event: 'selection_read', tool, item_count: items.length,
    items: items.slice(0, 50).map(item => ({ id: selectionId(item), kind: String(item.kind ?? 'unknown').slice(0, 40) })) };
}

const GENERATION_KINDS = new Set(['image', 'video', 'music', 'speech']);
/** A generation the agent drafted or submitted: what kind and which model, never the prompt or references. */
export function generationDraftedSignal(context, args, result) {
  const kind = GENERATION_KINDS.has(args?.kind) ? args.kind : GENERATION_KINDS.has(result?.kind) ? result.kind : undefined;
  if (!kind) return undefined;
  const model = [result?.model?.id, result?.model, args?.model].find(value => typeof value === 'string' && value);
  return { ...envelope(context), event: 'generation_drafted', kind, stage: typeof args?.draft_id === 'string' ? 'approved' : 'draft',
    ...(model ? { model: model.slice(0, 80) } : {}) };
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

const WORKAROUNDS = new Set(['own_script', 'shell_command', 'manual_file_edit', 'external_app', 'gave_up']);
const OUTCOMES = new Set(['worked', 'partial', 'failed']);
/** The agent's own report of work done without DreamCut's tools. Throws on input the record cannot hold. */
export function capabilityGapSignal(context, args) {
  if (typeof args?.needed !== 'string' || !args.needed.trim()) throw new Error('needed is required: what the request needed that no DreamCut tool did.');
  if (!WORKAROUNDS.has(args.workaround)) throw new Error(`workaround must be one of ${[...WORKAROUNDS].join(', ')}.`);
  if (!OUTCOMES.has(args.outcome)) throw new Error(`outcome must be one of ${[...OUTCOMES].join(', ')}.`);
  const programs = (Array.isArray(args.programs) ? args.programs : []).map(name => String(name).toLowerCase().replace(/[^a-z0-9+._-]/g, '').slice(0, 40)).filter(name => /^[a-z0-9]/.test(name));
  const tools = (Array.isArray(args.nearest_tools) ? args.nearest_tools : []).map(String).filter(name => /^[a-z][a-z0-9_]{0,100}$/.test(name));
  return { ...envelope(context), event: 'capability_gap', needed: args.needed.trim().slice(0, 500), workaround: args.workaround,
    programs: [...new Set(programs)].slice(0, 8), nearest_tools: [...new Set(tools)].slice(0, 5), outcome: args.outcome };
}

/** Send a signal without letting a recording failure affect the tool call. */
export async function sendSignal(post, signal) {
  if (!signal) return;
  try { await post(signal); } catch { /* A lost signal never changes an edit. */ }
}
