/**
 * Plain-language names for edit-history steps. Shared by the editor's in-session
 * Undo stack and the server's saved history so both describe the same change the
 * same way: the verb comes from the fields the edit actually changed, and the
 * subject is the clip's own name when one is known.
 */

export function historyOperationLabel(op: string) {
  const names: Record<string, string> = {
    frame_tag_add: "Add review mark", frame_tag_remove: "Remove review mark",
    frame_tags_clear: "Clear review marks", frame_tag_update: "Edit review mark",
    history_restore: "Restore earlier version", editor_agent_workshop_applied: "Apply proposal",
    editor_agent_batch_applied: "Apply proposal batch",
    // Plain descriptions for the saved-history list (previously shown as raw names such as "Element patch").
    element_patch: "Adjust clip", element_props_patch: "Adjust clip", element_batch: "Adjust clips",
    element_create: "Add clip", element_delete: "Remove clip", element_duplicate: "Duplicate clip",
    element_split: "Split clip", element_restore: "Restore clip", element_normalize_loudness_baked: "Even out loudness",
    element_enhance_voice: "Enhance voice", element_reduce_background_noise: "Reduce background noise",
    element_restore_original_audio: "Restore original audio", element_detach_audio: "Separate audio",
    element_reattach_audio: "Reattach audio", element_apply_video_stabilization: "Stabilize video",
    element_remove_video_stabilization: "Remove stabilization", transition_create: "Add transition",
    transition_patch: "Change transition", transition_delete: "Remove transition", generate_captions: "Generate captions",
    lane_defaults_apply: "Change track settings", timeline_compaction: "Tidy timeline", hand_edit: "Manual edit",
    storyboard_build: "Build timeline from storyboard",
  };
  return names[op] ?? (op.startsWith("editor_agent_") ? "Apply proposal" : op.replaceAll("_", " ").replace(/^./, s => s.toUpperCase()));
}

export type HistoryAction = "undo" | "redo";

/** Undo/redo steps name the edit they reverse or repeat instead of looking like a new edit. */
export function historyActionLabel(action: HistoryAction, label: string) {
  return `${action === "undo" ? "Undo" : "Redo"}: ${label}`;
}

export function parseHistoryAction(value: unknown): HistoryAction | null {
  return value === "undo" || value === "redo" ? value : null;
}

/** Bound and flatten a label received from a request header or a stored snapshot. */
export function sanitizeHistoryLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  if (!clean) return null;
  return clean.length > 120 ? `${clean.slice(0, 119)}…` : clean;
}

type Props = Record<string, unknown>;
export type HistoryElementLike = {
  id?: string;
  type?: string;
  source_url?: string | null;
  props?: Props | null;
  removed_at?: string | null;
  [field: string]: unknown;
};

function isRecord(value: unknown): value is Props {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function shorten(text: string, max = 40) {
  const flat = text.trim().replace(/\s+/g, " ");
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export function isTextHistoryElement(element: HistoryElementLike | null | undefined) {
  if (!element) return false;
  const type = String(element.type ?? "");
  return /text|title|caption/.test(type) && typeof element.props?.text === "string";
}

/** The clip's visible name: its timeline label or title, its text, else its file name. */
export function historyElementName(element: HistoryElementLike | null | undefined): string | null {
  if (!element) return null;
  const props = isRecord(element.props) ? element.props : {};
  if (isTextHistoryElement(element) && String(props.text).trim()) return `'${shorten(String(props.text))}'`;
  for (const key of ["timeline_label", "title", "label", "name"]) {
    const value = props[key];
    if (typeof value === "string" && value.trim()) return shorten(value);
  }
  if (typeof element.source_url === "string" && element.source_url) {
    const base = element.source_url.split("?")[0]!.split("/").pop() ?? "";
    let decoded = base;
    try { decoded = decodeURIComponent(base); } catch { /* keep the raw file name */ }
    const stem = decoded.replace(/\.[a-z0-9]{2,5}$/i, "");
    if (stem && !/^(preview|source|audio|video|media)$/i.test(stem)) return shorten(stem);
  }
  return null;
}

function subject(element: HistoryElementLike | null | undefined) {
  const name = historyElementName(element);
  if (name) return name;
  return isTextHistoryElement(element) ? "text" : "clip";
}

// Ordered: the first matching rule names the edit. Speed and reverse also change
// duration, and trimming the head also moves the start, so they rank first.
type Rule = { verb: string; matches: (field: string) => boolean; text?: boolean };
const exact = (...fields: string[]) => (field: string) => fields.includes(field);
const prefix = (...prefixes: string[]) => (field: string) => prefixes.some(p => field.startsWith(p));
const RULES: Rule[] = [
  { verb: "Edit text", text: true, matches: exact("text") },
  { verb: "Flip", matches: exact("media_mirror", "flip_x", "flip_y", "flip_horizontal", "flip_vertical") },
  { verb: "Reverse", matches: exact("playback_reverse") },
  { verb: "Rotate", matches: exact("media_orientation", "rotation", "surfaceRotateZDeg") },
  { verb: "Change speed of", matches: exact("playback_rate", "speed") },
  { verb: "Trim", matches: exact("trim_start", "trim_end") },
  { verb: "Move", matches: exact("timeline_start", "lane_key", "lane_index") },
  { verb: "Trim", matches: exact("duration") },
  { verb: "Resize", matches: exact("media_scale", "scale", "fontSizePx", "textScaleX", "textScaleY", "maxWidth") },
  { verb: "Reposition", matches: exact("media_offset_x", "media_offset_y", "absX", "absY", "offsetX", "offsetY", "positionPreset", "positionNudgeY") },
  { verb: "Change opacity of", matches: exact("media_opacity", "opacity", "surfaceOpacity") },
  { verb: "Change volume of", matches: exact("volume", "volume_envelope", "muted") },
  { verb: "Change fades on", matches: exact("fade_in", "fade_out") },
  { verb: "Change blend of", matches: exact("media_blend_mode") },
  { verb: "Change color of", matches: prefix("grade_", "lut_", "color_grade") },
  { verb: "Change crop of", matches: prefix("crop", "mask_") },
  { verb: "Change animation of", matches: prefix("animation") },
  { verb: "Restyle", text: true, matches: prefix("font", "text", "outline", "styleVariant", "activeWord") },
  { verb: "Lock", matches: exact("position_locked") },
];

/** Fields that bookkeeping rewrites on every save; they never name an edit. */
const IGNORED = new Set(["updated_at", "created_at", "project_id", "_peaks", "_source_duration", "rendered_timeline_start", "rendered_duration", "rendered_end", "transition_in", "transition_out", "transition_in_offset_seconds"]);
const isIgnored = (field: string) => IGNORED.has(field) || field.startsWith("preview_");

function same(a: unknown, b: unknown) {
  return a === b || JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** Field names that differ between two partial element states (props and keyframes expanded). */
export function changedHistoryFields(before: Props, after: Props): string[] {
  const fields = new Set<string>();
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (isIgnored(key) || same(before[key], after[key])) continue;
    if (key === "props" && (isRecord(before.props) || isRecord(after.props))) {
      const a = isRecord(before.props) ? before.props : {};
      const b = isRecord(after.props) ? after.props : {};
      for (const prop of new Set([...Object.keys(a), ...Object.keys(b)])) {
        if (isIgnored(prop) || same(a[prop], b[prop])) continue;
        if (prop === "keyframes" && (isRecord(a.keyframes) || isRecord(b.keyframes))) {
          const ka = isRecord(a.keyframes) ? a.keyframes : {};
          const kb = isRecord(b.keyframes) ? b.keyframes : {};
          for (const field of new Set([...Object.keys(ka), ...Object.keys(kb)])) if (!same(ka[field], kb[field])) fields.add(field);
        } else fields.add(prop);
      }
    } else fields.add(key);
  }
  return [...fields];
}

function propValue(state: Props, field: string) {
  if (field in state) return state[field];
  return isRecord(state.props) ? state.props[field] : undefined;
}

/** The verb for a set of changed fields, or "Adjust" when no rule names them. */
export function historyVerbForFields(fields: string[], after: Props = {}): string {
  for (const rule of RULES) {
    const field = fields.find(rule.matches);
    if (!field) continue;
    if (rule.verb === "Reverse" && !propValue(after, field)) return "Play forward";
    if (rule.verb === "Lock" && !propValue(after, field)) return "Unlock";
    return rule.verb;
  }
  return "Adjust";
}

function patchVerb(before: Props, after: Props) {
  if ("removed_at" in after && !same(before.removed_at, after.removed_at)) return after.removed_at ? "Remove" : "Add";
  const fields = changedHistoryFields(before, after).filter(field => field !== "removed_at" && field !== "removed_reason");
  return historyVerbForFields(fields, after);
}

/** One element's patch, e.g. "Flip Cat", "Edit text 'Home'". */
export function describeElementPatch(element: HistoryElementLike | null | undefined, before: Props, after: Props) {
  const verb = patchVerb(before, after);
  if (verb === "Remove") return describeElementPresence(element, "remove");
  if (verb === "Add") return describeElementPresence(element, "add");
  const props = isRecord(after.props) ? after.props : null;
  const named = element && props ? { ...element, props: { ...(element.props ?? {}), ...props } } : element;
  return `${verb} ${subject(named)}`;
}

export function describeElementPresence(element: HistoryElementLike | null | undefined, change: "add" | "remove" | "restore" | "split" | "duplicate") {
  const text = isTextHistoryElement(element);
  const name = historyElementName(element);
  const noun = text ? "title" : "clip";
  const verb = { add: "Add", remove: "Remove", restore: "Restore", split: "Split", duplicate: "Duplicate" }[change];
  if (!name) return `${verb} ${noun}`;
  return text ? `${verb} ${noun} ${name}` : `${verb} ${name}`;
}

/** Several element patches: one shared verb names them all, else "Adjust N clips". */
export function describeElementPatches(changes: Array<{ element?: HistoryElementLike | null; before: Props; after: Props }>) {
  if (changes.length === 0) return "Adjust clips";
  if (changes.length === 1) return describeElementPatch(changes[0]!.element, changes[0]!.before, changes[0]!.after);
  const verbs = changes.map(change => patchVerb(change.before, change.after));
  const shared = verbs.every(value => value === verbs[0]) ? verbs[0]! : "Adjust";
  const verb = shared === "Edit text" ? "Edit" : shared;
  const text = changes.every(change => isTextHistoryElement(change.element));
  return `${verb} ${changes.length} ${text ? "titles" : "clips"}`;
}

/**
 * Compare two saved timelines and name the change. Returns null when no element
 * changed (track settings, transitions and metadata keep their operation label).
 */
export function describeTimelineElementChange(
  beforeElements: HistoryElementLike[] | null | undefined,
  afterElements: HistoryElementLike[] | null | undefined,
  options: { restoreVerb?: boolean } = {},
): string | null {
  const before = new Map((beforeElements ?? []).filter(e => typeof e?.id === "string").map(e => [e.id!, e]));
  const after = new Map((afterElements ?? []).filter(e => typeof e?.id === "string").map(e => [e.id!, e]));
  const added: HistoryElementLike[] = [];
  const removed: HistoryElementLike[] = [];
  const patched: Array<{ element: HistoryElementLike; before: Props; after: Props }> = [];
  for (const [id, next] of after) {
    const previous = before.get(id);
    const wasLive = previous != null && !previous.removed_at;
    const isLive = !next.removed_at;
    if (!wasLive && isLive) added.push(next);
    else if (wasLive && !isLive) removed.push(previous!);
    else if (wasLive && isLive && changedHistoryFields(previous! as Props, next as Props).length) patched.push({ element: next, before: previous! as Props, after: next as Props });
  }
  for (const [id, previous] of before) if (!after.has(id) && !previous.removed_at) removed.push(previous);

  // A split shortens one clip and adds its tail as a new clip from the same source.
  if (added.length === 1 && removed.length === 0 && patched.length === 1 && added[0]!.source_url && added[0]!.source_url === patched[0]!.element.source_url) {
    return describeElementPresence(patched[0]!.element, "split");
  }
  if (added.length && !removed.length && !patched.length) {
    return added.length === 1 ? describeElementPresence(added[0], options.restoreVerb ? "restore" : "add") : `${options.restoreVerb ? "Restore" : "Add"} ${added.length} clips`;
  }
  if (removed.length && !added.length && !patched.length) {
    return removed.length === 1 ? describeElementPresence(removed[0], "remove") : `Remove ${removed.length} clips`;
  }
  if (patched.length && !added.length && !removed.length) return describeElementPatches(patched);
  if (!added.length && !removed.length && !patched.length) return null;
  return `Change ${added.length + removed.length + patched.length} clips`;
}

/** Request headers that mark an editor write as an Undo/Redo replay (labelling only; never authority). */
export const HISTORY_ACTION_HEADER = "x-dreamcut-history-action";
export const HISTORY_LABEL_HEADER = "x-dreamcut-history-label";
