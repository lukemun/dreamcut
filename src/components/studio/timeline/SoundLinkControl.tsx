"use client";
import { Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InspectorItemHeader } from "./InspectorHierarchy";
import { SOUND_LINK_PROP, soundLink } from "@/lib/timeline/sound-link";
import type { TimelineElement } from "./types";

const name = (element?: TimelineElement) => String(element?.props?.title || "Untitled clip");

/**
 * Timing for linked sounds. On a sound: the picture it moves with, and Unlink. On a picture: the
 * sounds that move with it, and Unlink sounds, after which each sound can be moved or replaced on its own.
 */
export function SoundLinkControl({ element, elements, onPatch }: {
  element: TimelineElement | null;
  elements: TimelineElement[];
  onPatch: (id: string, patch: Record<string, unknown>) => void | Promise<unknown>;
}) {
  if (!element) return null;
  const link = soundLink(element);
  // A sound's props patch replaces the whole set, so send them all with only the link cleared.
  const unlink = (sound: TimelineElement) => onPatch(sound.id, { props: { ...sound.props, [SOUND_LINK_PROP]: null } });
  if (link) {
    const picture = elements.find(candidate => candidate.id === link.element_id && candidate.removed_at == null);
    return <div className="grid min-w-0 gap-2" data-sound-link="sound">
      <InspectorItemHeader title="Moves with picture" actions={<Link2 className="size-4 text-[var(--ink-secondary)]" aria-hidden="true" />} />
      <span className="truncate text-xs text-[var(--ink-secondary)]" title={name(picture)}>{picture ? name(picture) : "Picture removed"} · {link.offset_seconds.toFixed(2)}s in</span>
      <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => void unlink(element)}>Unlink</Button>
    </div>;
  }
  const sounds = elements.filter(candidate => candidate.removed_at == null && soundLink(candidate)?.element_id === element.id);
  if (!sounds.length) return null;
  return <div className="grid min-w-0 gap-2" data-sound-link="picture">
    <InspectorItemHeader title={`Linked sounds · ${sounds.length}`} actions={<Link2 className="size-4 text-[var(--ink-secondary)]" aria-hidden="true" />} />
    <span className="text-xs text-[var(--ink-secondary)]">{sounds.map(sound => name(sound)).join(" · ")}</span>
    <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => { for (const sound of sounds) void unlink(sound); }}>Unlink sounds</Button>
  </div>;
}
