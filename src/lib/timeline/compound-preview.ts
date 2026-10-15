import type { CompositionElement } from "@/lib/render/composition-adapters";

const ignored = /^(runtime_preview_|runtime_compound_|runtime_source_|compound_|source_|archival_source_url$|media_preparation_recipe$|custom_cutout_receipt$|speech_sync_binding$|title$|preview_source_url$|preview_proxy_validation$)/;
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
  return value;
}
export function compoundAppearance(e: CompositionElement) {
  return JSON.stringify(canonical(Object.fromEntries(Object.entries(e.props ?? {}).filter(([k]) => !ignored.test(k)))));
}
export function compoundMemberSignature(e: CompositionElement) {
  return JSON.stringify([e.id, e.source_url, e.props?.preview_source_url, e.timeline_start, e.duration, e.trim_start, e.trim_end ?? 0, e.playback_rate, e.lane_key, e.volume, e.fade_in, e.fade_out, e.transition_in ?? null, e.transition_out ?? null, compoundAppearance(e)]);
}

const compoundOuterTransformFields = new Set([
  "media_scale",
  "media_offset_x",
  "media_offset_y",
  "semantic_layout",
]);

/**
 * A compound proxy bakes source windows and timing, but not the shared outer
 * framing applied by the player. Receipts created before this distinction
 * contain those framing fields in their member signatures, so normalize both
 * the recorded and current signatures at comparison time instead of changing
 * the persisted receipt format.
 */
export function compoundProxyComparableSignature(signature: string) {
  try {
    const parts = JSON.parse(signature) as unknown[];
    if (!Array.isArray(parts) || typeof parts[14] !== "string") return null;
    const appearance = JSON.parse(parts[14]) as Record<string, unknown>;
    if (!appearance || typeof appearance !== "object" || Array.isArray(appearance)) return null;
    for (const field of compoundOuterTransformFields) delete appearance[field];
    parts[14] = JSON.stringify(canonical(appearance));
    return JSON.stringify(parts);
  } catch {
    return null;
  }
}

export function compoundMemberProxySignature(e: CompositionElement) {
  return compoundProxyComparableSignature(compoundMemberSignature(e));
}
export type CompoundPreviewReceipt = {
  id: string; source_url: string; sha256: string; duration: number; frame_count: number;
  width?: number; height?: number; proxy_profile?: "presenter-alpha-640-edge-v1";
  members: { id: string; signature: string }[];
};

/** Preview-only projection. Originals remain authoritative for edits and export.
 * Any changed member invalidates the cache; never play stale baked timing. */
export function projectCompoundPreviews(elements: CompositionElement[], isRendering: boolean): CompositionElement[] {
  if (isRendering) return elements;
  const consumed = new Set<string>();
  const output: CompositionElement[] = [];
  for (const e of elements) {
    if (consumed.has(e.id)) continue;
    const r = (e.props?.runtime_compound_preview ?? e.props?.compound_preview) as CompoundPreviewReceipt | undefined;
    const members = r?.members?.map(m => elements.find(x => x.id === m.id));
    const sharedAppearance = members?.[0]
      ? members.every(member => member && compoundAppearance(member) === compoundAppearance(members[0]!))
      : false;
    const valid = r && members && members.length > 1 && members.every((m, i) => m
      && (m.props?.runtime_compound_clip_id ?? m.props?.compound_clip_id) === r.id
      && compoundMemberProxySignature(m) === compoundProxyComparableSignature(r.members[i]!.signature))
      && sharedAppearance;
    if (!valid) { output.push(e); continue; }
    const first = members[0]!;
    members.forEach(m => consumed.add(m!.id));
    output.push({ ...first, id: `compound-preview:${r.id}`, source_url: r.source_url,
      duration: r.duration, trim_start: 0, trim_end: 0, playback_rate: 1,
      props: { ...first.props, preview_source_url: r.source_url, source_duration_seconds: r.duration,
        runtime_preview_source_url: undefined,
        preview_proxy_validation: first.props?.compound_proxy_validation,
        source_start_seconds: 0, source_end_seconds: r.duration,
        source_interval: { start_seconds: 0, duration_seconds: r.duration } } });
  }
  return output;
}
