"use client";
import { useRef, type RefObject } from "react";
import type { PlayerRef } from "@/lib/frame-runtime/player";
import { StoryboardPreview } from "../storyboard/StoryboardPreview";
import { VideoTrimControls } from "../storyboard/VideoTrimControls";

type Window = { start: number; end: number };
/** Shortest part of a reference the models accept. */
const MIN_SECONDS = 0.5;

/** The video reference on the editor's player, as Storyboard shows footage. */
export function ReferencePlayer({ projectId, source, start, player }: {
  projectId: string; source: string; start: number; player: RefObject<PlayerRef | null>;
}) {
  return <StoryboardPreview projectId={projectId} source={source} revision={0} player={player} initialTime={start} />;
}

/**
 * The shared in/out trim for a video reference (playhead line, Set in/out, Play range). The part
 * between in and out is what is sent and priced, never longer than the model's `limit`.
 */
export function ReferenceTrim({ start, end, length, limit, busy, player, onChange }: {
  start: number; end: number; length: number; limit: number; busy: boolean; player: RefObject<PlayerRef | null>;
  onChange: (window: Window) => void;
}) {
  // The moved edge wins; the other follows only as far as the 0.5 s minimum and the model's limit require.
  const commit = (window: { start: number; duration: number }) => {
    let a = window.start, b = window.start + window.duration;
    if (Math.abs(a - start) > 1e-6) { a = Math.max(0, Math.min(a, b - MIN_SECONDS)); b = Math.min(b, a + limit); }
    else { b = Math.min(length, Math.max(b, a + MIN_SECONDS)); a = Math.max(a, b - limit); }
    onChange({ start: a, end: b });
  };
  return <VideoTrimControls start={start} duration={end - start} sourceDuration={length} busy={busy} player={player} commit={commit} />;
}

/**
 * A video reference on its own: player and trim side by side once the card is wide enough, so a
 * portrait clip uses the card's width instead of leaving empty margins.
 */
export function ReferenceVideo({ projectId, source, start, end, length, limit, busy, onChange }: {
  projectId: string; source: string; start: number; end: number; length: number; limit: number; busy: boolean;
  onChange: (window: Window) => void;
}) {
  const player = useRef<PlayerRef>(null);
  return <div className="@container min-w-0 px-2.5 pb-2.5" data-reference-video>
    <div className="grid min-w-0 gap-3 @[22rem]:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] @[22rem]:items-start">
      <ReferencePlayer projectId={projectId} source={source} start={start} player={player} />
      <ReferenceTrim start={start} end={end} length={length} limit={limit} busy={busy} player={player} onChange={onChange} />
    </div>
  </div>;
}
