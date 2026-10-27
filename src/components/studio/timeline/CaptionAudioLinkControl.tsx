import { Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InspectorItemHeader } from "./InspectorHierarchy";
import type { TimelineElement } from "./types";
import { captionFollowsAudio } from "@/lib/timeline/caption-audio-link";

/** A caption that moves with its speech reads like the other links in Timing: what it follows, then Unlink. */
export function CaptionAudioLinkControl({ element, onPatch }: {
  element: TimelineElement | null;
  onPatch: (props: Record<string, unknown>) => void;
}) {
  if (!element || !captionFollowsAudio(element)) return null;
  return <div className="grid min-w-0 gap-2" data-caption-audio-link>
    <InspectorItemHeader title="Moves with speech" actions={<Link2 className="size-4 text-[var(--ink-secondary)]" aria-hidden="true" />} />
    <Button type="button" size="sm" variant="outline" className="w-fit" disabled={element.position_locked}
      onClick={() => onPatch({ caption_follow_audio: false })}>Unlink</Button>
  </div>;
}
