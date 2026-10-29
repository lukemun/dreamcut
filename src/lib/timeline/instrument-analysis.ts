import { z } from "zod";
import type { BeatAnnotation, MusicalHitKind } from "./beat-annotations";

export const instrumentIds = ["drums", "bass", "other", "vocals"] as const;
export type InstrumentId = typeof instrumentIds[number];
export const instrumentLabels: Record<InstrumentId | "mix", string> = { mix: "Full mix", drums: "Drums", bass: "Bass", other: "Melody / other", vocals: "Vocals" };
export const instrumentColors: Record<InstrumentId | "mix", string> = { mix: "#94a3b8", drums: "#fbbf24", bass: "#5eead4", other: "#c4b5fd", vocals: "#f9a8d4" };
export const instrumentKinds: Record<InstrumentId, MusicalHitKind> = { drums: "drum", bass: "bass", other: "accompaniment", vocals: "vocal" };
export const instrumentSnapshotSchema = z.object({ start: z.number().finite().nonnegative(), end: z.number().finite().positive(), hits: z.array(z.object({ instrument: z.enum(instrumentIds), time_seconds: z.number().finite().nonnegative(), strength: z.number().finite().min(0).max(1) })).max(20000) }).refine(value => value.end > value.start && value.hits.every(hit => hit.time_seconds >= value.start && hit.time_seconds < value.end), "Snapshot hits must be within its view");
const instrumentFiltersSchema = z.object({ minimum_strength: z.number().min(0).max(1), keep_strongest_percent: z.number().min(0).max(100), minimum_gap_seconds: z.number().min(0).max(5) });
export const instrumentSettingsSchema = z.object({ marked_hits: z.array(z.string().regex(/^(drums|bass|other|vocals):\d+\.\d{6}$/)).max(20000).optional(), replaced_hits: z.array(z.string().regex(/^(drums|bass|other|vocals):\d+\.\d{6}$/)).max(20000).optional(), selected: z.array(z.enum(instrumentIds)).max(4), track_filters: z.object({ drums: instrumentFiltersSchema.optional(), bass: instrumentFiltersSchema.optional(), other: instrumentFiltersSchema.optional(), vocals: instrumentFiltersSchema.optional() }).optional(), snapshot_filter_overrides: z.array(z.enum(instrumentIds)).optional(), minimum_strength: z.number().min(0).max(1), keep_strongest_percent: z.number().finite().min(0).max(100).optional(), minimum_gap_seconds: z.number().finite().min(0).max(5).optional(), excluded_hits: z.array(z.string().max(80)).max(20000).default([]), manual_hits: z.array(z.object({ instrument: z.enum(instrumentIds), time_seconds: z.number().finite().nonnegative() })).max(20000).default([]), snapshot: instrumentSnapshotSchema.optional() });
export type InstrumentSettings = z.infer<typeof instrumentSettingsSchema>;
export const instrumentViewerSchema = z.object({ listening: z.array(z.enum(["mix", ...instrumentIds])).max(5), loop: z.boolean(), playhead: z.number().finite().nonnegative(), selected_hit: z.object({ instrument: z.enum(instrumentIds), time: z.number().finite().nonnegative() }).nullable().optional() });
export const instrumentPresetSchema = z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(80), saved_at: z.string().datetime(), settings: instrumentSettingsSchema, viewer: instrumentViewerSchema.optional() });
export type InstrumentPreset = z.infer<typeof instrumentPresetSchema>;
const laneSchema = z.object({ id: z.enum(["mix", ...instrumentIds]), peaks: z.array(z.number().finite().nonnegative()).max(12000), hits: z.array(z.object({ time_seconds: z.number().nonnegative().finite(), strength: z.number().min(0).max(1) })).max(200000), rms: z.number().nonnegative().finite() });
export const instrumentResultSchema = z.object({ state: z.literal("ready"), source_sha256: z.string().regex(/^[a-f0-9]{64}$/), model: z.literal("htdemucs"), duration: z.number().positive().max(1800), sample_rate: z.number().positive(), sample_count: z.number().positive(), lanes: z.array(laneSchema).length(5) }).refine(value => value.lanes.every(lane => lane.hits.every((hit, i) => hit.time_seconds < value.duration && (i === 0 || hit.time_seconds > lane.hits[i - 1]!.time_seconds))), "Instrument hits must be ordered inside source bounds");
export type InstrumentResult = z.infer<typeof instrumentResultSchema>;
export type InstrumentPayload = { key: string; state: "missing" | "preparing" | "failed" | "ready"; message?: string; result?: InstrumentResult; settings: InstrumentSettings; presets?: InstrumentPreset[] };
export function instrumentHitKey(instrument: string, time: number) { return `${instrument}:${time.toFixed(6)}`; }
export function updateSelectedInstrumentHits(settings: InstrumentSettings, keys: readonly string[], action: "mark" | "unmark" | "remove"): InstrumentSettings {
  const selected = new Set(keys);
  const marked = new Set(settings.marked_hits ?? []);
  const excluded = new Set(settings.excluded_hits);
  for (const key of selected) {
    if (action === "mark") { marked.add(key); excluded.delete(key); }
    else { marked.delete(key); if (action === "remove") excluded.add(key); }
  }
  return { ...settings, marked_hits: [...marked], excluded_hits: [...excluded],
    manual_hits: action === "remove" ? settings.manual_hits.filter(hit => !selected.has(instrumentHitKey(hit.instrument, hit.time_seconds))) : settings.manual_hits };
}
/** Full mix targets every instrument's hits; isolated listening targets those stems. */
export function instrumentControlTracks(listening: readonly (InstrumentId | "mix")[]): InstrumentId[] {
  return listening.includes("mix") ? [...instrumentIds] : instrumentIds.filter(id => listening.includes(id));
}
/** Authored hits bypass detection filters and join an explicit selection when present. */
export function addManualInstrumentHit(settings: InstrumentSettings, instrument: InstrumentId, time: number): InstrumentSettings {
  if (!Number.isFinite(time) || time < 0) throw new Error("Hit time must be a finite nonnegative source time");
  const existing = settings.manual_hits.find(hit => hit.instrument === instrument && Math.abs(hit.time_seconds - time) < 0.001);
  const hit = existing ?? { instrument, time_seconds: Number(time.toFixed(6)) };
  const key = instrumentHitKey(instrument, hit.time_seconds);
  return { ...settings,
    manual_hits: existing ? settings.manual_hits : [...settings.manual_hits, hit],
    excluded_hits: settings.excluded_hits.filter(value => value !== key),
    ...(settings.replaced_hits ? { replaced_hits: settings.replaced_hits.filter(value => value !== key) } : {}),
    ...(settings.marked_hits !== undefined ? { marked_hits: [...new Set([...settings.marked_hits, key])] } : {}),
  };
}
/** Relocate one event without resurrecting its detected/snapshot candidate. */
export function moveInstrumentHit(settings: InstrumentSettings, instrument: InstrumentId, from: number, to: number): InstrumentSettings {
  if (!Number.isFinite(from) || from < 0 || !Number.isFinite(to) || to < 0) throw new Error("Hit time must be finite and nonnegative");
  const oldKey = instrumentHitKey(instrument, from), newKey = instrumentHitKey(instrument, to);
  if (oldKey === newKey) return settings;
  const next = {
    ...settings,
    manual_hits: settings.manual_hits.filter(hit => instrumentHitKey(hit.instrument, hit.time_seconds) !== oldKey),
    replaced_hits: [...new Set([...(settings.replaced_hits ?? []), oldKey])].filter(key => key !== newKey),
    ...(settings.marked_hits !== undefined ? { marked_hits: settings.marked_hits.filter(key => key !== oldKey) } : {}),
  };
  const moved = addManualInstrumentHit(next, instrument, to);
  return settings.marked_hits !== undefined && !settings.marked_hits.includes(oldKey)
    ? { ...moved, marked_hits: moved.marked_hits!.filter(key => key !== newKey) }
    : moved;
}
export function instrumentFilters(settings: InstrumentSettings, id: InstrumentId | "mix") {
  return (id !== "mix" && settings.track_filters?.[id]) || { minimum_strength: settings.minimum_strength, keep_strongest_percent: settings.keep_strongest_percent ?? 100, minimum_gap_seconds: settings.minimum_gap_seconds ?? 0 };
}
/** Change only selected instruments, preserving saved snapshot authority elsewhere. */
export function updateInstrumentFilters(settings: InstrumentSettings, selected: InstrumentId[], patch: Partial<ReturnType<typeof instrumentFilters>>): InstrumentSettings {
  if (!selected.length) return settings;
  return { ...settings, track_filters: { ...settings.track_filters, ...Object.fromEntries(selected.map(id => [id, { ...instrumentFilters(settings, id), ...patch }])) }, snapshot_filter_overrides: [...new Set([...(settings.snapshot_filter_overrides ?? []), ...selected])] };
}
export function visibleInstrumentHits(lane: InstrumentResult["lanes"][number], settings: InstrumentSettings, options: { candidates?: boolean } = {}) {
  const filters = instrumentFilters(settings, lane.id);
  const snapshot = lane.id !== "mix" && settings.snapshot_filter_overrides?.includes(lane.id) ? undefined : settings.snapshot;
  const excluded = new Set(settings.excluded_hits);
  const count = Math.ceil(lane.hits.length * filters.keep_strongest_percent / 100);
  // Rank before exclusions so removing a selected point does not silently promote
  // a different point into the saved set. Ties resolve deterministically by time.
  let hits = lane.hits.slice().sort((a, b) => b.strength - a.strength || a.time_seconds - b.time_seconds).slice(0, count).filter(hit => hit.strength >= filters.minimum_strength && !excluded.has(instrumentHitKey(lane.id, hit.time_seconds)));
  const gap = filters.minimum_gap_seconds;
  if (gap > 0) {
    // Retain the strongest nearby attack, not simply the first one. Buckets keep
    // this bounded even for dense tracks; each bucket can retain at most one hit.
    const buckets = new Map<number, number>();
    hits = hits.slice().sort((a, b) => b.strength - a.strength || a.time_seconds - b.time_seconds).filter(hit => {
      const bucket = Math.floor(hit.time_seconds / gap);
      for (let key = bucket - 1; key <= bucket + 1; key++) {
        const neighbor = buckets.get(key);
        if (neighbor !== undefined && Math.abs(neighbor - hit.time_seconds) < gap - 1e-9) return false;
      }
      buckets.set(bucket, hit.time_seconds);
      return true;
    });
  }
  if (snapshot) {
    hits = hits.filter(hit => hit.time_seconds < snapshot.start || hit.time_seconds >= snapshot.end);
    hits.push(...snapshot.hits.filter(hit => hit.instrument === lane.id && !excluded.has(instrumentHitKey(lane.id, hit.time_seconds))));
  }
  // Explicitly authored points survive automatic density filters, but not exclusion.
  for (const hit of settings.manual_hits.filter(hit => hit.instrument === lane.id && !excluded.has(instrumentHitKey(lane.id, hit.time_seconds)))) if (!hits.some(existing => instrumentHitKey(lane.id, existing.time_seconds) === instrumentHitKey(lane.id, hit.time_seconds))) hits.push({ time_seconds: hit.time_seconds, strength: 1 });
  // Marking is an opt-in whitelist. Legacy saved sets retain their previous meaning.
  // Explicit choices survive density changes; candidates stay available to mark again.
  const marked = new Set(settings.marked_hits ?? []);
  const authority = snapshot
    ? [...lane.hits.filter(hit => hit.time_seconds < snapshot.start || hit.time_seconds >= snapshot.end), ...snapshot.hits.filter(hit => hit.instrument === lane.id)]
    : lane.hits;
  const includedTimes = new Set(hits.map(hit => hit.time_seconds));
  for (const hit of authority) {
    const key = instrumentHitKey(lane.id, hit.time_seconds);
    if (marked.has(key) && !excluded.has(key) && !includedTimes.has(hit.time_seconds)) {
      hits.push(hit);
      includedTimes.add(hit.time_seconds);
    }
  }
  if (!options.candidates && settings.marked_hits !== undefined) hits = hits.filter(hit => marked.has(instrumentHitKey(lane.id, hit.time_seconds)));
  const replaced = new Set(settings.replaced_hits ?? []);
  return hits.filter(hit => !replaced.has(instrumentHitKey(lane.id, hit.time_seconds))).sort((a, b) => a.time_seconds - b.time_seconds);
}

/** Keep simultaneous attacks from different instruments; they are independent targets. */
export function instrumentAnnotation(base: BeatAnnotation, result: InstrumentResult, settings: InstrumentSettings): BeatAnnotation {
  if (base.source_sha256 !== result.source_sha256) throw new Error("Instrument map does not match the source");
  const hits = result.lanes.filter(lane => lane.id !== "mix").flatMap(lane => visibleInstrumentHits(lane, settings).filter(hit => hit.time_seconds < base.source_duration_seconds).map(hit => ({ ...hit, confidence: 1, kind: instrumentKinds[lane.id as InstrumentId] })))
    .sort((a, b) => a.time_seconds - b.time_seconds || a.kind.localeCompare(b.kind));
  // Downbeats and drops come from the rhythm map; instrument separation only replaces its hits.
  return base.schema_version === 3 ? { ...base, hits } : { ...base, schema_version: 2, hits };
}
