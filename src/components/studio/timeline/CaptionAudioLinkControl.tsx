import type { TimelineElement } from "./types";
import { captionFollowsAudio } from "@/lib/timeline/caption-audio-link";

export function CaptionAudioLinkControl({ element, onPatch }: {
  element: TimelineElement | null;
  onPatch: (props: Record<string, unknown>) => void;
}) {
  if (!element || !captionFollowsAudio(element)) return null;
  return <div className="flex items-center gap-2">
    <button type="button" className="text-sm underline text-[var(--ink)]" disabled={element.position_locked}
      onClick={() => onPatch({ caption_follow_audio: false })}>Unlink from audio</button>
  </div>;
}
