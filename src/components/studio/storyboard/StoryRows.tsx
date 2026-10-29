"use client";
import { useEffect, useRef, useState } from "react";
import { AudioLines, GripVertical, MoreHorizontal, Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionMenu, ActionMenuItem } from "@/components/ui/menu";
import { InspectorHeading } from "../timeline/InspectorHierarchy";
import type { StoryboardAsset, StoryboardShot } from "@/lib/storyboard/model";
import { spokenWord } from "@/lib/storyboard/rows";
import type { useStoryboard } from "./useStoryboard";
import { StoryboardCardMedia } from "./StoryboardCardMedia";
import { ShotVisualStrip } from "./ShotVisuals";
import { ShotNote } from "./ShotNote";
import styles from "./storyboard.module.css";

type Controller = ReturnType<typeof useStoryboard>;
/** Drag payloads: a Media card (its source) or a row being reordered (its id). */
export const MEDIA_DRAG = "application/x-dreamcut-storyboard-media";
const ROW_DRAG = "application/x-dreamcut-storyboard-row";
type Drop = { gap: string | "end" } | { onto: string } | null;
const time = (seconds: number) => `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;

/**
 * The storyboard as rows: pictures on the left, script on the right. Media dragged from above becomes
 * a row (dropped between rows) or a visual over a row (dropped onto its picture). A video row splits
 * (row menu) where its playback is paused; a transcribed row highlights each word as it is spoken.
 */
export function StoryRows({ projectId, api, lookup, openDetails, actions }: {
  projectId: string; api: Controller; lookup: (source: string) => StoryboardAsset | undefined;
  openDetails: (shotId: string) => void; actions: React.ReactNode;
}) {
  const shots = api.snapshot?.content.shots ?? [], busy = api.busy;
  const [drop, setDrop] = useState<Drop>(null);
  const kind = (event: React.DragEvent) => event.dataTransfer.types.includes(MEDIA_DRAG) ? "media" : event.dataTransfer.types.includes(ROW_DRAG) ? "row" : null;
  const over = (event: React.DragEvent, target: Exclude<Drop, null>, rowsOnly = false) => {
    const dragging = kind(event);
    if (!dragging || (rowsOnly && dragging !== "media")) return;
    event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = busy ? "none" : dragging === "media" ? "copy" : "move";
    setDrop(target);
  };
  const dropAt = (event: React.DragEvent, before?: string) => {
    event.preventDefault(); event.stopPropagation(); setDrop(null);
    if (busy) return;
    const media = event.dataTransfer.getData(MEDIA_DRAG), row = event.dataTransfer.getData(ROW_DRAG);
    if (media) void api.rows.add(media, before); else if (row) void api.move(row, before);
  };
  const gap = (before?: string) => <div className={styles.rowGap} data-active={drop && "gap" in drop && drop.gap === (before ?? "end") || undefined}
    onDragOver={e => over(e, { gap: before ?? "end" })} onDragLeave={() => setDrop(null)} onDrop={e => dropAt(e, before)} />;
  const total = shots.reduce((sum, s) => sum + s.duration, 0);
  return <section className={styles.rows} aria-label="Storyboard" onDragEnd={() => setDrop(null)}>
    <div className={styles.rowsHeader}>
      <InspectorHeading>Storyboard</InspectorHeading>
      {shots.length > 0 && <span className={styles.count}>{shots.length} {shots.length === 1 ? "row" : "rows"} · {time(total)}</span>}
      <span className={styles.spacer} />{actions}
    </div>
    {shots.length > 0 && <div className={styles.rowColumns} aria-hidden="true"><span>Visuals</span><span>Script</span></div>}
    <ol className={styles.rowList}>
      {shots.map((shot, index) => <li key={shot.id}>
        {gap(shot.id)}
        <Row projectId={projectId} api={api} shot={shot} index={index} last={index === shots.length - 1} asset={lookup(shot.source)} lookup={lookup}
          dropping={!!drop && "onto" in drop && drop.onto === shot.id} openDetails={() => openDetails(shot.id)}
          onDragOver={e => over(e, { onto: shot.id }, true)} onDragLeave={() => setDrop(null)}
          onDrop={e => { e.preventDefault(); e.stopPropagation(); setDrop(null); const media = e.dataTransfer.getData(MEDIA_DRAG); if (media && !busy) void api.addVisual(shot.id, media); }} />
      </li>)}
    </ol>
    <div className={styles.rowEnd} data-active={drop && "gap" in drop && drop.gap === "end" || undefined}
      onDragOver={e => over(e, { gap: "end" })} onDragLeave={() => setDrop(null)} onDrop={e => dropAt(e)}>
      {shots.length ? "Drag media here to add a row" : "Drag photos and videos here from Media"}
    </div>
  </section>;
}

function Row({ projectId, api, shot, index, last, asset, lookup, dropping, openDetails, onDragOver, onDragLeave, onDrop }: {
  projectId: string; api: Controller; shot: StoryboardShot; index: number; last: boolean; asset?: StoryboardAsset;
  lookup: (source: string) => StoryboardAsset | undefined; dropping: boolean; openDetails: () => void;
  onDragOver: (e: React.DragEvent) => void; onDragLeave: () => void; onDrop: (e: React.DragEvent) => void;
}) {
  const player = useRef<HTMLVideoElement>(null), busy = api.busy;
  const video = asset?.kind === "video", transcribing = api.rows.transcribing.includes(shot.id), words = shot.words ?? [];
  const shots = api.snapshot?.content.shots ?? [], name = asset?.name ?? shot.source;
  // The playhead on the source clock, once this row has been played or scrubbed; a trim or split clears it.
  const [playhead, setPlayhead] = useState<number | null>(null);
  useEffect(() => setPlayhead(null), [shot.start, shot.duration]);
  const inside = playhead !== null && playhead > shot.start + 1 / 30 && playhead < shot.start + shot.duration - 1 / 30;
  const split = () => void api.rows.split(shot.id, player.current?.currentTime ?? playhead!);
  return <div className={styles.row}>
    <div className={styles.rowVisual} data-dropping={dropping || undefined} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      <span className={styles.rowHandle} draggable={!busy} aria-hidden="true" title="Drag to reorder"
        onDragStart={e => { e.dataTransfer.setData(ROW_DRAG, shot.id); e.dataTransfer.effectAllowed = "move"; }}><GripVertical /></span>
      <div className={styles.rowPicture}>
        <StoryboardCardMedia key={`${shot.start}-${shot.duration}`} asset={asset} start={shot.start} duration={shot.duration} label={shot.label || name}
          {...(video ? { player, onTime: setPlayhead } : {})} />
        <ShotVisualStrip shot={shot} lookup={lookup} open={openDetails} />
        <div className={styles.rowMeta}>
          <span title={name}>{index + 1}. {name}</span>
          <span className="tabular-nums">{video ? `${time(shot.start)}–${time(shot.start + shot.duration)}` : `${shot.duration.toFixed(1)}s`}</span>
          <ActionMenu trigger={<Button size="icon-sm" variant="ghost" aria-label={`Row ${index + 1} actions`}><MoreHorizontal /></Button>}>
            {video && <ActionMenuItem icon={<AudioLines />} disabled={transcribing} onClick={() => void api.rows.transcribe(shot.id)}>{words.length ? "Transcribe again" : "Transcribe"}</ActionMenuItem>}
            {video && <ActionMenuItem icon={<Scissors />} disabled={busy || !inside} description={inside ? undefined : "Play and pause where you want the cut"} onClick={split}>Split here</ActionMenuItem>}
            <ActionMenuItem disabled={busy} onClick={openDetails}>Trim and details</ActionMenuItem>
            <ActionMenuItem disabled={busy || index === 0} onClick={() => void api.move(shot.id, shots[index - 1].id)}>Move up</ActionMenuItem>
            <ActionMenuItem disabled={busy || last} onClick={() => void api.move(shot.id, shots[index + 2]?.id)}>Move down</ActionMenuItem>
            <ActionMenuItem disabled={busy} onClick={() => void api.removeShot(shot.id)}>Remove row</ActionMenuItem>
          </ActionMenu>
        </div>
        {transcribing && <span className={styles.rowTools} role="status">Transcribing…</span>}
      </div>
    </div>
    <div className={styles.rowWords}>
      <ShotNote value={shot.script ?? ""} label={`Script for row ${index + 1}`} placeholder={transcribing ? "Transcribing…" : "Write the script or what happens…"}
        maxLength={20000} projectId={projectId} save={script => void api.patchShot(shot.id, { script: script || undefined })}
        highlight={!words.length ? undefined : playhead === null ? -1 : spokenWord(words, playhead)} />
    </div>
  </div>;
}
