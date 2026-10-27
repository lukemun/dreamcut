"use client";

import { TimelineMarks, type TimelineMark } from "../timeline/TimelineMarks";
import styles from "./storyboard.module.css";

/** The clip's marks along its length, under the video: each mark (and range) where it sits, the playhead,
 *  and a range being marked. Clicking the strip seeks; clicking a mark goes to it. Uses the shared mark rail. */
export function MarkStrip({ duration, position, rangeStart, marks, onSeek, onSelect }: {
  duration: number; position: number; rangeStart: number | null; marks: TimelineMark[];
  onSeek: (seconds: number) => void; onSelect: (id: string) => void;
}) {
  const at = (seconds: number) => `${Math.min(100, Math.max(0, seconds / duration * 100))}%`;
  return <div className={styles.markStrip} role="group" aria-label="Marks along the clip"
    onClick={event => { const box = event.currentTarget.getBoundingClientRect(); onSeek(Math.max(0, Math.min(duration, (event.clientX - box.left) / box.width * duration))); }}>
    <div className={styles.markStripTrack} />
    {marks.filter(mark => mark.end !== undefined).map(mark => <div key={`range-${mark.id}`} aria-hidden="true" className={styles.markStripRange} style={{ left: at(mark.time), width: `calc(${at(mark.end!)} - ${at(mark.time)})` }} />)}
    {rangeStart !== null && position > rangeStart && <div aria-hidden="true" className={styles.markStripRange} data-pending style={{ left: at(rangeStart), width: `calc(${at(position)} - ${at(rangeStart)})` }} />}
    <div aria-hidden="true" className={styles.markStripPlayhead} style={{ left: at(position) }} />
    <TimelineMarks marks={marks} duration={duration} onSelect={mark => onSelect(mark.id)} />
  </div>;
}
