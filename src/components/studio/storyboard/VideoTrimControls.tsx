"use client";
import { useEffect, useRef, useState, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { RangeSlider } from "@/components/ui/slider";
import type { PlayerRef } from "@/lib/frame-runtime/player";
import { Seconds } from "./StoryboardSeconds";
import { sourceLastFrame, trimDuration, trimEdge, trimFromRange, TRIM_FPS, type TrimWindow } from "./storyboard-trim";
import styles from "./storyboard.module.css";

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, "0")}`;

/**
 * In/out trim over the FULL source. The player must show the whole source on its own
 * clock (frame 0 = source 0s). Dragging previews by seeking; release commits one save.
 */
export function VideoTrimControls({ start, duration, sourceDuration, busy, player, commit }: {
  start: number; duration: number; sourceDuration: number; busy: boolean;
  player: RefObject<PlayerRef | null>; commit: (value: TrimWindow) => void;
}) {
  const [draft, setDraft] = useState<[number, number] | null>(null);
  const [playhead, setPlayhead] = useState<number | null>(null), [rangePlaying, setRangePlaying] = useState(false);
  const previousFrame = useRef<number | null>(null), rangeEnd = useRef<number | null>(null);
  const lastFrame = sourceLastFrame(sourceDuration), current = { start, duration };
  const [inPoint, outPoint] = draft ?? [start, start + duration];
  // The player may mount after this control (previews load asynchronously), so read it per frame.
  useEffect(() => {
    let raf = 0, last = -1;
    const tick = () => {
      const instance = player.current;
      if (instance) {
        const frame = instance.getCurrentFrame();
        if (frame !== last) { last = frame; setPlayhead(frame / TRIM_FPS); }
        if (rangeEnd.current !== null) {
          if (!instance.isPlaying()) { rangeEnd.current = null; setRangePlaying(false); }
          else if (frame >= rangeEnd.current) { instance.pause(); instance.seekTo(rangeEnd.current - 1); rangeEnd.current = null; setRangePlaying(false); }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [player]);
  const seek = (seconds: number) => { player.current?.pause(); player.current?.seekTo(Math.min(lastFrame - 1, Math.max(0, Math.round(seconds * TRIM_FPS)))); };
  const save = (next: TrimWindow | null) => { setDraft(null); previousFrame.current = null; if (next) commit(next); };
  const cancel = () => { setDraft(null); if (previousFrame.current !== null) player.current?.seekTo(previousFrame.current); previousFrame.current = null; };
  const atPlayhead = (edge: "in" | "out") => {
    const instance = player.current; if (!instance) return;
    instance.pause(); save(trimEdge(current, edge, instance.getCurrentFrame() / TRIM_FPS, sourceDuration));
  };
  const playRange = () => {
    const instance = player.current; if (!instance) return;
    if (rangePlaying) { rangeEnd.current = null; setRangePlaying(false); instance.pause(); return; }
    instance.seekTo(Math.round(start * TRIM_FPS)); rangeEnd.current = Math.round((start + duration) * TRIM_FPS); setRangePlaying(true); instance.play();
  };
  if (lastFrame < 2) return <div className={styles.trimControls} aria-label="Video trim">
    {/* Source length is still unknown; exact entry stays available. */}
    <Seconds label="Source start" value={start} max={86400} disabled={busy} commit={value => commit({ start: value, duration })} />
    <Seconds label="Duration" value={duration} min={1 / TRIM_FPS} max={86400} disabled={busy} commit={value => commit({ start, duration: value })} />
  </div>;
  return <div className={styles.trimControls} aria-label="Video trim">
    <RangeSlider value={[inPoint, outPoint]} min={0} max={lastFrame / TRIM_FPS} step={1 / TRIM_FPS} largeStep={1} disabled={busy}
      labels={["In point", "Out point"]} valueText={value => clock(value)} marker={draft ? null : playhead}
      onValueChange={(next, thumb) => {
        if (previousFrame.current === null) previousFrame.current = player.current?.getCurrentFrame() ?? null;
        setDraft(next); seek(next[thumb] - (thumb === 1 ? 1 / TRIM_FPS : 0));
      }}
      onValueCommit={next => save(trimFromRange(current, next[0], next[1], sourceDuration))}
      onInteractionCancel={cancel} />
    <div className={styles.trimReadout}><span>In {clock(inPoint)}</span><span>{(outPoint - inPoint).toFixed(2)}s</span><span>Out {clock(outPoint)}</span></div>
    <div className={styles.actions}>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => atPlayhead("in")}>Set in</Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => atPlayhead("out")}>Set out</Button>
      <Button size="sm" variant="ghost" aria-pressed={rangePlaying} onClick={playRange}>{rangePlaying ? "Stop" : "Play range"}</Button>
    </div>
    <Seconds label="Source start" value={start} max={(lastFrame - 1) / TRIM_FPS} disabled={busy} commit={value => save(trimEdge(current, "in", value, sourceDuration))} />
    <Seconds label="Duration" value={duration} min={1 / TRIM_FPS} max={(lastFrame - Math.round(start * TRIM_FPS)) / TRIM_FPS} disabled={busy} commit={value => save(trimDuration(current, value, sourceDuration))} />
  </div>;
}
