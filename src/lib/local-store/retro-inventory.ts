import { memoryHash } from "./editing-memory";
import { buildRetroEvidence } from "./editing-retro";

export const RETRO_SLICES = {
  captions: { title: "Text & captions", skills: ["caption-craft", "video-typography"] },
  audio: { title: "Music & audio", skills: ["music-direction", "music-audition", "audio-balance", "sound-design"] },
  pacing: { title: "Timing & pacing", skills: ["cut-pacing", "visual-timing", "talking-video-editing"] },
  visuals: { title: "Visual composition & motion", skills: ["spatial-composition", "motion-graphics", "video-compositing"] },
  structure: { title: "Editorial structure", skills: ["editorial-assembly", "editorial-intent-planning", "planned-shot-craft"] },
  workflow: { title: "Workflow & delivery", skills: ["open-edit-proposals", "editor-media-preprocessing", "platform-video-delivery"] },
} as const;
export type RetroSlice = keyof typeof RETRO_SLICES;
export type ReviewItem = {
  id: string; evidence_ids: string[]; element_ids: string[]; slices: RetroSlice[];
  route_basis: string[]; unclassified: boolean; context_only: boolean;
  order: number; interval: [number, number] | null; related_ids: string[];
  rows: { kind: "chapter" | "proposal" | "event"; value: unknown }[];
};
type ObjectValue = Record<string, unknown>;
const obj = (v: unknown): ObjectValue => v && typeof v === "object" && !Array.isArray(v) ? v as ObjectValue : {};
const list = (v: unknown): ObjectValue[] => Array.isArray(v) ? v.map(obj) : [];
const strings = (v: unknown[]): string[] => [...new Set(v.filter((x): x is string => typeof x === "string" && Boolean(x)))];

function route(item: ReviewItem, facts: string[]) {
  const text = facts.join(" ").toLowerCase();
  const rules: [RetroSlice, RegExp][] = [
    ["captions", /caption|font|typograph|highlight|\btext\b|lineheight|wordtiming/],
    ["audio", /music|audio|voice|speech|vo_segment|vo_full|sound_effect|volume|gain|muted_lane|fade_in|fade_out/],
    ["pacing", /timing|timeline_start|duration|trim|playback_rate|split|ripple|\bcut\b|\bhold\b|\bgap\b|\bpacing\b/],
    ["visuals", /visual|video_clip|\bstill\b|layout|scale|offset|opacity|mask|chroma|grade_|motion|transition/],
    ["structure", /story|narrative|\bhook\b|structure|beat_order|assembly|emphasis/],
    ["workflow", /proposal|export|render|delivery|prepare|workflow|error|failed|output_|aspect_ratio|frame_tag/],
  ];
  for (const [slice, pattern] of rules) if (pattern.test(text)) {
    item.slices.push(slice); item.route_basis.push(`Matched ${slice} fields/type/operation or recorded editorial text`);
  }
  if (!item.slices.length) { item.slices = ["workflow"]; item.unclassified = true; item.route_basis.push("Unclassified evidence requires workflow review, not omission"); }
}

/** Raw private values are used only to identify changed field names/IDs, never copied to packets. */
export function buildRetroInventory(checkpoint: Record<string, unknown>) {
  const evidence = buildRetroEvidence(checkpoint);
  const rawChapters = list(checkpoint.chapters), rawProposals = list(checkpoint.proposals), rawEvents = list(checkpoint.events);
  const items: ReviewItem[] = [];
  const owners = new Map<string, ReviewItem>();
  const add = (kind: "chapter" | "proposal" | "event", id: string, value: unknown) => {
    if (owners.has(id)) throw new Error(`Duplicate canonical evidence ID: ${id}`);
    const item: ReviewItem = { id: `${kind}:${id}`, evidence_ids: [id], element_ids: [], slices: [], route_basis: [],
      unclassified: false, context_only: false, order: items.length, interval: null, related_ids: [], rows: [{ kind, value }] };
    items.push(item); owners.set(id, item); return item;
  };
  evidence.chapters.forEach((chapter, index) => {
    const raw = rawChapters[index];
    const changes = list(raw.changes);
    const item = add("chapter", chapter.id, chapter);
    item.element_ids = strings(changes.flatMap(c => [c.id, obj(c.before).id, obj(c.after).id]));
    const starts: number[] = [], ends: number[] = [], facts: string[] = [chapter.operation, chapter.category, chapter.summary];
    for (const c of changes) {
      const before = obj(c.before), after = obj(c.after);
      for (const v of [before, after]) {
        if (typeof v.type === "string") facts.push(v.type);
        if (typeof v.timeline_start === "number" && Number.isFinite(v.timeline_start)) {
          starts.push(v.timeline_start); ends.push(v.timeline_start + (typeof v.duration === "number" && Number.isFinite(v.duration) ? v.duration : 0));
        }
      }
      for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
        if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) facts.push(key);
      }
      const a = obj(before.props), b = obj(after.props);
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) facts.push(key);
    }
    for (const c of list(raw.context_changes)) {
      facts.push(String(c.field));
      const a = obj(c.before), b = obj(c.after);
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) facts.push(key);
    }
    if (starts.length) item.interval = [Math.min(...starts), Math.max(...ends)];
    route(item, facts);
  });
  evidence.proposals.forEach((proposal, index) => {
    const raw = obj(rawProposals[index].proposal);
    const operations = [...list(raw.operations), ...list(raw.options).flatMap(o => list(o.operations))];
    const item = add("proposal", proposal.id, proposal);
    item.element_ids = strings(operations.map(o => o.element_id));
    route(item, ["proposal", proposal.summary, proposal.brief ?? "", ...operations.flatMap(o => [
      ...Object.keys(o), ...Object.keys(obj(o.patch)), ...Object.keys(obj(obj(o.patch).props)), typeof o.rationale === "string" ? o.rationale : "",
    ])]);
  });
  evidence.events.forEach((event, index) => {
    const raw = rawEvents[index];
    const owner = typeof raw.evidence === "string" ? owners.get(raw.evidence) : undefined;
    if (owner) {
      if (owners.has(event.id) && owners.get(event.id) !== owner) throw new Error(`Duplicate canonical evidence ID: ${event.id}`);
      owner.evidence_ids = strings([...owner.evidence_ids, event.id]);
      owner.rows.push({ kind: "event", value: event }); owners.set(event.id, owner);
    } else {
      const item = add("event", event.id, event);
      item.context_only = /^(retro\.|preference\.|skill\.)/.test(event.type);
      route(item, [event.type, event.summary]);
    }
  });
  // A single action may be represented by several snapshots. Only deduplicate
  // explicit aliases above; similarity is not proof that two human edits are one.
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i], b = items[j];
    const sharedElement = a.element_ids.some(id => b.element_ids.includes(id));
    const overlap = a.interval && b.interval && a.interval[0] < b.interval[1] && b.interval[0] < a.interval[1];
    if (sharedElement || overlap) { a.related_ids.push(b.id); b.related_ids.push(a.id); }
  }
  return { version: "slices-v1" as const, checkpoint_hash: memoryHash(checkpoint), items, evidence };
}
export type RetroInventory = ReturnType<typeof buildRetroInventory>;

/** Connected cases retain shared actors/intervals, including reversals; never silently trim a chain. */
export function retroCaseGroups(inventory: RetroInventory): ReviewItem[][] {
  const map = new Map(inventory.items.map(item => [item.id, item]));
  const visited = new Set<string>(), groups: ReviewItem[][] = [];
  for (const item of inventory.items) {
    if (visited.has(item.id)) continue;
    const group: ReviewItem[] = [], queue = [item.id];
    while (queue.length) {
      const id = queue.pop()!;
      if (visited.has(id)) continue;
      visited.add(id); const next = map.get(id)!; group.push(next); queue.push(...next.related_ids);
    }
    groups.push(group.sort((a, b) => a.order - b.order));
  }
  return groups;
}
