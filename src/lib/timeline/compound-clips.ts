import type { TimelineElement } from "@/components/studio/timeline/types";
import { readKeyframeMap, type KeyframeMap } from "./keyframes";

export const COMPOUND_CLIP_ID_PROP = "compound_clip_id";
export const COMPOUND_CLIP_LABEL_PROP = "compound_clip_label";
export const COMPOUND_CLIP_PRESENTATION_PROP = "compound_clip_presentation";
export const COMPOUND_CLIP_MEMBER_COUNT_PROP = "compound_clip_member_count";

export function compoundClipId(element: TimelineElement | null | undefined): string | null {
  const value = element?.props?.[COMPOUND_CLIP_ID_PROP];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function compoundClipMembers(
  elements: TimelineElement[],
  elementOrCompoundId: TimelineElement | string | null | undefined,
): TimelineElement[] {
  const id = typeof elementOrCompoundId === "string"
    ? elementOrCompoundId
    : compoundClipId(elementOrCompoundId);
  if (!id) return [];
  return elements.filter((element) => !element.removed_at && compoundClipId(element) === id);
}

export function compoundClipMemberAtTime(
  elements: TimelineElement[],
  elementOrCompoundId: TimelineElement | string | null | undefined,
  timelineSeconds: number,
): TimelineElement | null {
  const members = compoundClipMembers(elements, elementOrCompoundId)
    .sort((a, b) => a.timeline_start - b.timeline_start || a.id.localeCompare(b.id));
  if (!members.length) return typeof elementOrCompoundId === "object" ? elementOrCompoundId ?? null : null;
  return members.find((member, index) => timelineSeconds >= member.timeline_start
    && (timelineSeconds < member.timeline_start + member.duration || (index === members.length - 1 && timelineSeconds <= member.timeline_start + member.duration)))
    ?? members.reduce((nearest, member) => {
      const distance = Math.min(Math.abs(timelineSeconds - member.timeline_start), Math.abs(timelineSeconds - member.timeline_start - member.duration));
      const nearestDistance = Math.min(Math.abs(timelineSeconds - nearest.timeline_start), Math.abs(timelineSeconds - nearest.timeline_start - nearest.duration));
      return distance < nearestDistance ? member : nearest;
    });
}

export function compoundSelectionIds(
  elements: TimelineElement[],
  elementId: string,
): string[] {
  const selected = elements.find((element) => element.id === elementId) ?? null;
  const members = compoundClipMembers(elements, selected);
  return members.length > 1 ? members.map((member) => member.id) : [elementId];
}

export function compoundSelectionItemCount(
  elements: TimelineElement[],
  selectedIds: string[],
): number {
  const logicalItems = new Set<string>();
  for (const elementId of selectedIds) {
    const element = elements.find((candidate) => candidate.id === elementId);
    if (!element || element.removed_at) continue;
    const id = compoundClipId(element);
    logicalItems.add(id ? `compound:${id}` : `element:${element.id}`);
  }
  return logicalItems.size;
}

/**
 * Collapse persisted compound members into one timeline-only presentation row.
 *
 * The source elements remain authoritative for playback, export, effects, and
 * Break apart. The canvas must not expose those implementation members as
 * independent clips, though, or a compound behaves like a linked selection.
 */
export function compoundClipPresentationElements(
  elements: TimelineElement[],
): TimelineElement[] {
  const activeElements = elements.filter((element) => !element.removed_at);
  const membersByCompoundId = new Map<string, TimelineElement[]>();
  for (const element of activeElements) {
    const id = compoundClipId(element);
    if (!id) continue;
    const members = membersByCompoundId.get(id) ?? [];
    members.push(element);
    membersByCompoundId.set(id, members);
  }

  const emittedCompoundIds = new Set<string>();
  const presentation: TimelineElement[] = [];
  for (const element of activeElements) {
    const id = compoundClipId(element);
    const members = id ? membersByCompoundId.get(id) ?? [] : [];
    if (!id || members.length < 2) {
      presentation.push(element);
      continue;
    }
    if (emittedCompoundIds.has(id)) continue;
    emittedCompoundIds.add(id);

    const orderedMembers = [...members].sort((a, b) =>
      a.timeline_start - b.timeline_start || a.id.localeCompare(b.id));
    const representative = orderedMembers[0]!;
    const start = Math.min(...orderedMembers.map((member) => member.timeline_start));
    const end = Math.max(...orderedMembers.map((member) => member.timeline_start + member.duration));
    const compoundKeyframes: KeyframeMap = {};
    for (const member of orderedMembers) {
      for (const [field, points] of Object.entries(readKeyframeMap(member.props))) {
        const projected = compoundKeyframes[field] ?? [];
        for (const point of points) projected.push({ ...point, t: Number((member.timeline_start - start + point.t).toFixed(3)) });
        compoundKeyframes[field] = projected
          .sort((a, b) => a.t - b.t)
          .filter((point, index, all) => index === all.length - 1 || Math.abs(point.t - all[index + 1]!.t) > 0.0005);
      }
    }
    presentation.push({
      ...representative,
      timeline_start: start,
      duration: Math.max(0, end - start),
      props: {
        ...(representative.props ?? {}),
        [COMPOUND_CLIP_LABEL_PROP]:
          representative.props?.[COMPOUND_CLIP_LABEL_PROP] ?? "Compound clip",
        [COMPOUND_CLIP_PRESENTATION_PROP]: true,
        [COMPOUND_CLIP_MEMBER_COUNT_PROP]: orderedMembers.length,
        ...(Object.keys(compoundKeyframes).length ? { keyframes: compoundKeyframes } : {}),
      },
    });
  }
  return presentation;
}
