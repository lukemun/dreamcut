"use client";

import { useEffect, useState } from "react";
import { Clapperboard, MoreHorizontal, Plus, Sparkles, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ActionMenu, ActionMenuItem } from "@/components/ui/menu";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { StoryboardCardMedia } from "./StoryboardCardMedia";
import { ShotNote } from "./ShotNote";
import { EffectPicker } from "./EffectPicker";
import { StoryboardPanelActions } from "./StoryboardPanels";
import { markNote, markNumbers, momentLinks, reconcileCanvas } from "@/lib/storyboard/canvas";
import { templateId } from "@/lib/effects/agent-request";
import type { StoryboardAsset, StoryboardMark } from "@/lib/storyboard/model";
import type { useStoryboard } from "./useStoryboard";
import styles from "./storyboard.module.css";

type Controller = ReturnType<typeof useStoryboard>;
/** Frame heights; a frame is as wide as its clip's shape. */
const SIZES = { small: 110, medium: 180, large: 300 } as const;
type Size = keyof typeof SIZES;
const time = (seconds: number) => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, "0")}`;

/**
 * The storyboard as a timeline: frames down the left, one per mark in order, joined by a line so they read
 * as one path; beside each frame, the effects joined to it. Effects are cards joined to the mark, the same
 * plan the Canvas shows and the agent reads (storyboard_get canvas).
 */
export function MomentsTimeline({ projectId, api, lookup, openClip, addMoment }: {
  projectId: string; api: Controller; lookup: (source: string) => StoryboardAsset | undefined;
  openClip: (source: string, at: number) => void; addMoment: () => void;
}) {
  const board = api.snapshot?.content, busy = api.busy;
  const storageKey = `dreamcut:storyboard-timeline-size:${projectId}`;
  const [size, setSize] = useState<Size>("medium");
  useEffect(() => { try { const saved = localStorage.getItem(storageKey); if (saved && saved in SIZES) setSize(saved as Size); } catch { /* Default size. */ } }, [storageKey]);
  const choose = (next: Size) => { setSize(next); try { localStorage.setItem(storageKey, next); } catch { /* This visit only. */ } };
  // Which rows an effect goes on: one mark, or every mark.
  const [picking, setPicking] = useState<string[] | null>(null);
  if (!board) return null;
  const view = reconcileCanvas(board), numbers = markNumbers(view);
  const move = (index: number, delta: -1 | 1) => api.edit(b => {
    const marks = [...b.marks], target = index + delta;
    if (target < 0 || target >= marks.length) return b;
    [marks[index], marks[target]] = [marks[target], marks[index]];
    return { ...b, marks };
  });

  return <section className={styles.moments} aria-label="Storyboard timeline">
    <StoryboardPanelActions>
      <Button size="sm" variant="ghost" onClick={addMoment}><Clapperboard aria-hidden="true" />Moment</Button>
      <Button size="sm" variant="ghost" disabled={busy || !view.marks.length} title="Add one effect to every moment" onClick={() => setPicking(view.marks.map(m => m.id))}><Sparkles aria-hidden="true" />Effect on all</Button>
      <SegmentedControl size="sm" aria-label="Frame size">
        {(Object.keys(SIZES) as Size[]).map(key => <button key={key} type="button" aria-pressed={size === key} onClick={() => choose(key)}>{key === "small" ? "S" : key === "medium" ? "M" : "L"}</button>)}
      </SegmentedControl>
    </StoryboardPanelActions>
    {!view.marks.length ? <p className={styles.momentsEmpty}>Open a clip and press M to mark a moment. Each mark becomes a frame here, with room beside it for text and effects.</p> :
    <ol className={styles.timelineList} style={{ ["--moment-frame" as string]: `${SIZES[size]}px` }}>
      {view.marks.map((mark, index) => <MomentRow key={mark.id} mark={mark} number={numbers.get(mark.id)!} asset={lookup(mark.source)} links={momentLinks(view, mark.id)} projectId={projectId} api={api}
        onOpen={() => openClip(mark.source, mark.start)} onPickEffect={() => setPicking([mark.id])}
        onMove={{ earlier: index > 0 ? () => void move(index, -1) : undefined, later: index < view.marks.length - 1 ? () => void move(index, 1) : undefined }} />)}
    </ol>}
    <EffectPicker projectId={projectId} open={!!picking} onOpenChange={open => { if (!open) setPicking(null); }}
      title={picking && picking.length > 1 ? "Add an effect to every moment" : "Add an effect"}
      onPick={effect => { if (picking) void api.canvas.linkEffect(picking, { id: templateId(effect), title: effect.title }); setPicking(null); }} />
  </section>;
}

/** One moment on the timeline: on the left its name, time and frame (joined to the next frame by a line);
 *  on the right its effects, and a + to add one. Text joined to a mark stays on the Canvas. */
export function MomentRow({ mark, number, asset, links, projectId, api, onOpen, onPickEffect, onMove }: {
  mark: StoryboardMark; number: number; asset?: StoryboardAsset; links: ReturnType<typeof momentLinks>;
  projectId: string; api: Controller; onOpen: () => void; onPickEffect: () => void;
  onMove?: { earlier?: () => void; later?: () => void };
}) {
  const busy = api.busy;
  return <li className={styles.timelineRow}>
    <div className={styles.timelineLeft}>
      <div className={styles.markRowHead}>
        <strong>Mark {number}</strong>
        <span className="tabular-nums">{time(mark.start)}{mark.end !== null ? `–${time(mark.end)}` : ""}</span>
        <ActionMenu trigger={<Button size="icon-xs" variant="ghost" aria-label={`Mark ${number} actions`}><MoreHorizontal aria-hidden="true" /></Button>}>
          <ActionMenuItem onClick={onOpen}>Open the clip here</ActionMenuItem>
          {onMove && <ActionMenuItem disabled={busy || !onMove.earlier} onClick={onMove.earlier}>Move earlier</ActionMenuItem>}
          {onMove && <ActionMenuItem disabled={busy || !onMove.later} onClick={onMove.later}>Move later</ActionMenuItem>}
          {/* Story is the shot list Assemble builds into the editor timeline. */}
          <ActionMenuItem disabled={busy || !asset?.ready} description="A shot in Story, which Assemble builds into the editor" onClick={() => void api.useAsset(mark.source, mark)}>Add to Story</ActionMenuItem>
          <ActionMenuItem disabled={busy} onClick={() => void api.removeMark(mark.id)}>Remove mark</ActionMenuItem>
        </ActionMenu>
      </div>
      <button type="button" className={styles.momentFrame} title={`Open the clip at Mark ${number}`} aria-label={`Open the clip at Mark ${number}`} onClick={onOpen}>
        <StoryboardCardMedia asset={asset} start={mark.start} duration={1 / 30} label={asset?.name} playable={false} />
      </button>
    </div>
    <div className={styles.timelineRight} aria-label={`Effects for Mark ${number}`}>
      {links.filter(({ node }) => node.kind === "effect").map(({ node }) => <span key={node.id} className={styles.effectChip}><Sparkles aria-hidden="true" size={12} />{node.template?.title}
        <button type="button" aria-label={`Remove ${node.template?.title} from Mark ${number}`} disabled={busy} onClick={() => void api.canvas.removeLink(mark.id, node.id)}><X aria-hidden="true" size={12} /></button></span>)}
      <Button size="icon-sm" variant="ghost" aria-label={`Add an effect to Mark ${number}`} title="Add an effect" disabled={busy} onClick={onPickEffect}><Plus aria-hidden="true" /></Button>
    </div>
  </li>;
}

/** A mark at its plainest: the frame (click to go to it), its name and time, one field, and Remove. The clip dialog lists marks this way. */
export function MarkRow({ mark, number, asset, projectId, api, onOpen }: {
  mark: StoryboardMark; number: number; asset?: StoryboardAsset; projectId: string; api: Controller; onOpen: () => void;
}) {
  return <li className={styles.markRowItem}>
    <button type="button" className={styles.momentFrame} title={`Go to Mark ${number}`} aria-label={`Go to Mark ${number}`} onClick={onOpen}>
      <StoryboardCardMedia asset={asset} start={mark.start} duration={1 / 30} label={asset?.name} playable={false} />
    </button>
    <div className={styles.markRowBody}>
      <div className={styles.markRowHead}>
        <strong>Mark {number}</strong>
        <span className="tabular-nums">{time(mark.start)}{mark.end !== null ? `–${time(mark.end)}` : ""}</span>
        <Button size="icon-xs" variant="ghost" aria-label={`Remove Mark ${number}`} title="Remove" disabled={api.busy} onClick={() => void api.removeMark(mark.id)}><Trash2 aria-hidden="true" /></Button>
      </div>
      <ShotNote value={markNote(mark)} label={`Mark ${number}`} placeholder="" maxLength={2000} projectId={projectId} voice={false}
        save={note => void api.saveMark({ ...mark, note })} />
    </div>
  </li>;
}
