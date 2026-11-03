import type { TimelineElement } from "@/components/studio/timeline/types";
import { compoundClipId, compoundClipMembers } from "./compound-clips";

/** Resolve the persisted authority, never a compound presentation row or a proxy. */
export function resolveInspectorTarget(elements: TimelineElement[], selected: TimelineElement | null, time: number, domain: "picture" | "audio"): TimelineElement | null {
  if (!selected) return null;
  const active = (e: TimelineElement) => !e.removed_at && time >= e.timeline_start && time < e.timeline_start + e.duration;
  const sourceId = (e: TimelineElement) => (e.props?.speech_sync_binding as { source_element_id?: string } | undefined)?.source_element_id;
  const persisted = elements.find(e => e.id === selected.id && !e.removed_at);
  if (!persisted) return null;
  const members = compoundClipId(persisted) ? compoundClipMembers(elements, persisted) : [persisted];
  const member = members.length > 1 ? members.find(active) : persisted;
  if (!member) return null;
  if (domain === "audio") {
    const id = sourceId(member);
    return id ? elements.find(e => e.id === id && !e.removed_at) ?? null : member;
  }
  const followers = elements.filter(e => !e.removed_at && e.type === "video_clip" && sourceId(e) === member.id);
  if (!followers.length) return member;
  const visible = followers.filter(active);
  // Missing or ambiguous picture authority is not permission to edit hidden speech.
  return visible.length === 1 ? visible[0]! : null;
}
