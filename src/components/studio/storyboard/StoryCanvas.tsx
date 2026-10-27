"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeftRight, Check, MonitorPlay, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ActionMenu, ActionMenuItem } from "@/components/ui/menu";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { InspectorHeading } from "../timeline/InspectorHierarchy";
import { storyboardUnits, type StoryboardAsset, type StoryboardShot } from "@/lib/storyboard/model";
import type { useStoryboard } from "./useStoryboard";
import { StoryboardCardMedia } from "./StoryboardCardMedia";
import { ShotNote } from "./ShotNote";
import { ShotAssetList, ShotVisualStrip } from "./ShotVisuals";
import { StoryboardPreview } from "./StoryboardPreview";
import type { PlayerRef } from "@/lib/frame-runtime/player";
import styles from "./storyboard.module.css";

type Controller = ReturnType<typeof useStoryboard>;
export type StoryLayout = "strip" | "script";
const layoutKey = (projectId: string) => `dreamcut:storyboard-layout:${projectId}`;
const previewKey = (projectId: string) => `dreamcut:storyboard-preview:${projectId}`;
const time = (seconds: number) => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, "0")}`;
const short = (seconds: number) => `${seconds.toFixed(1)}s`;

/** Layout is a per-viewer reading preference, not board content: it never enters storyboard Undo. */
export function useStoryLayout(projectId: string) {
  const [layout, setLayout] = useState<StoryLayout>("strip");
  useEffect(() => { try { const saved = localStorage.getItem(layoutKey(projectId)); if (saved === "strip" || saved === "script") setLayout(saved); } catch { /* Default layout. */ } }, [projectId]);
  return [layout, (next: StoryLayout) => { setLayout(next); try { localStorage.setItem(layoutKey(projectId), next); } catch { /* Preference stays for this visit. */ } }] as const;
}

/** Whether the story preview is shown: a per-viewer reading preference, open by default. */
function useStoryPreviewOpen(projectId: string) {
  const [open, setOpen] = useState(true);
  useEffect(() => { try { const saved = localStorage.getItem(previewKey(projectId)); if (saved !== null) setOpen(saved === "true"); } catch { /* Default. */ } }, [projectId]);
  return [open, (next: boolean) => { setOpen(next); try { localStorage.setItem(previewKey(projectId), String(next)); } catch { /* This visit only. */ } }] as const;
}

/**
 * The ordered story on one sequence line. Strip reads order and rhythm left to right;
 * Script reads top to bottom with each shot's notes beside its picture. Both are views of
 * the same shots and beats; full editing stays in the Shot details panel.
 */
export function StoryCanvas({ projectId, api, lookup, details, openDetails, openVisual, markMoments, toolbar, lead, history }: {
  projectId: string; api: Controller; lookup: (source: string) => StoryboardAsset | undefined;
  details: string | null; openDetails: (id: string) => void; markMoments: (shot: StoryboardShot) => void; toolbar: React.ReactNode;
  /** Opens Shot details on a visual over the shot, or on the visual picker when no visual is named. */ openVisual: (shotId: string, visualId?: string) => void;
  /** The Freeform / Follow reference switch, when this story is the page's main plan. */ lead?: React.ReactNode; history?: React.ReactNode;
}) {
  const board = api.snapshot?.content, busy = api.busy;
  const [layout, setLayout] = useStoryLayout(projectId);
  const [selected, setSelected] = useState<string[]>([]), [beatName, setBeatName] = useState("");
  const [collapsed, setCollapsed] = useState<string[]>([]), [dropBefore, setDropBefore] = useState<string | "end" | null>(null);
  const [noteFocus, setNoteFocus] = useState<string | null>(null);
  const shots = board?.shots ?? [], units = board ? storyboardUnits(board) : [];
  const total = shots.reduce((sum, s) => sum + Math.max(1, Math.round(s.duration * 30)) / 30, 0);
  const number = (id: string) => shots.findIndex(s => s.id === id) + 1;
  // The story preview plays the whole board at full size. Shots start where the build will place them.
  const [previewOpen, setPreviewOpen] = useStoryPreviewOpen(projectId);
  const player = useRef<PlayerRef>(null), playerBox = useRef<HTMLDivElement>(null);
  const starts = shots.reduce<number[]>((list, s, i) => [...list, i ? list[i - 1] + Math.max(1, Math.round(shots[i - 1].duration * 30)) : 0], []);
  const startsRef = useRef(starts); startsRef.current = starts;
  const [playing, setPlaying] = useState<number>(-1);
  const onTime = useCallback((seconds: number) => { const frame = Math.round(seconds * 30), list = startsRef.current; let index = -1; for (let i = 0; i < list.length && list[i] <= frame; i++) index = i; setPlaying(index); }, []);
  // A play request made while the preview is still loading waits for it.
  const pendingPlay = useRef<number | null>(null), [resumeAt, setResumeAt] = useState(0);
  const onReady = useCallback(() => { const frame = pendingPlay.current; pendingPlay.current = null; if (frame !== null) { playerBox.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); player.current?.seekTo(frame); player.current?.play(); } }, []);
  const playShot = (id: string) => {
    const frame = starts[shots.findIndex(s => s.id === id)] ?? 0;
    playerBox.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    if (previewOpen && player.current) { player.current.seekTo(frame); player.current.play(); return; }
    pendingPlay.current = frame; setResumeAt(frame / 30); setPreviewOpen(true);
  };
  const seekShot = (id: string) => { if (previewOpen && player.current && !player.current.isPlaying()) player.current.seekTo(starts[shots.findIndex(s => s.id === id)] ?? 0); };
  const stepShot = (delta: -1 | 1) => {
    const instance = player.current; if (!instance) return;
    const frame = instance.getCurrentFrame();
    const target = delta === 1 ? starts.find(f => f > frame) : [...starts].reverse().find(f => f < frame);
    if (target !== undefined) instance.seekTo(target);
  };
  const unitIndex = (id: string) => units.findIndex(u => u.some(s => s.id === id));
  const moveBy = (id: string, delta: -1 | 1) => { const index = unitIndex(id); if (index + delta < 0 || index + delta >= units.length) return; void api.move(id, units[index + (delta === 1 ? 2 : -1)]?.[0].id); };
  const toggle = (id: string) => setSelected(ids => ids.includes(id) ? ids.filter(v => v !== id) : [...ids, id]);
  const remove = (id: string) => { void api.removeShot(id); setSelected(ids => ids.filter(v => v !== id)); };
  const reveal = (id: string) => { openDetails(id); document.getElementById(`story-shot-${id}`)?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" }); };
  // Pointer-driven reorder: works for long moves because the strip (or page) scrolls while the
  // pointer rests near an edge, and the marker always shows where the shot will land.
  const strip = useRef<HTMLDivElement>(null), dragState = useRef<{ id: string; x: number; y: number; active: boolean } | null>(null);
  const suppressClick = useRef(false), [dragging, setDragging] = useState<string | null>(null);
  const targetAt = (x: number, y: number): string | "end" | null => {
    const unit = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-unit]");
    const container = strip.current;
    if (!unit) {
      if (!container) return null;
      const box = container.getBoundingClientRect();
      if (x < box.left || x > box.right || y < box.top || y > box.bottom) return null;
      const first = units[0]?.[0].id;
      return (layout === "strip" ? x < box.left + 24 : y < box.top + 24) ? first ?? "end" : "end";
    }
    const box = unit.getBoundingClientRect(), index = units.findIndex(u => u[0].id === unit.dataset.unit);
    const after = layout === "strip" ? x > box.left + box.width / 2 : y > box.top + box.height / 2;
    return after ? units[index + 1]?.[0].id ?? "end" : unit.dataset.unit!;
  };
  const startDrag = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0 || busy || noteFocus === id || (e.target as HTMLElement).closest("button, input, textarea, label, video, a, [data-no-details]")) return;
    dragState.current = { id, x: e.clientX, y: e.clientY, active: false };
    let frame = 0;
    const scrollEdge = () => {
      const state = dragState.current; if (!state?.active) return;
      const box = (layout === "strip" ? strip.current : strip.current?.closest<HTMLElement>('[aria-label="Storyboard workspace"]'))?.getBoundingClientRect();
      const scroller = layout === "strip" ? strip.current : strip.current?.closest<HTMLElement>('[aria-label="Storyboard workspace"]');
      if (box && scroller) {
        const edge = 56, speed = 14;
        if (layout === "strip") scroller.scrollLeft += state.x < box.left + edge ? -speed : state.x > box.right - edge ? speed : 0;
        else scroller.scrollTop += state.y < box.top + edge ? -speed : state.y > box.bottom - edge ? speed : 0;
        const target = targetAt(state.x, state.y); setDropBefore(target);
      }
      frame = requestAnimationFrame(scrollEdge);
    };
    const move = (event: PointerEvent) => {
      const state = dragState.current; if (!state) return;
      if (!state.active && Math.hypot(event.clientX - state.x, event.clientY - state.y) > 6) { state.active = true; setDragging(state.id); frame = requestAnimationFrame(scrollEdge); }
      state.x = event.clientX; state.y = event.clientY;
    };
    const end = (event: PointerEvent) => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); window.removeEventListener("pointercancel", end);
      cancelAnimationFrame(frame);
      const state = dragState.current; dragState.current = null; setDragging(null); setDropBefore(null);
      if (!state?.active || event.type === "pointercancel") return;
      suppressClick.current = true;
      const target = targetAt(event.clientX, event.clientY), from = unitIndex(state.id);
      if (target === null || units[from]?.some(s => s.id === target) || target === (units[from + 1]?.[0].id ?? "end")) return;
      void api.move(state.id, target === "end" ? undefined : target);
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", end); window.addEventListener("pointercancel", end);
  };

  const shotMenu = (s: StoryboardShot) => {
    const index = unitIndex(s.id);
    return <ActionMenu trigger={<Button size="icon-xs" variant="ghost" className={styles.shotMenu} data-shot-menu aria-label={`Shot ${number(s.id)} actions`}><MoreHorizontal aria-hidden="true" /></Button>}>
      <ActionMenuItem onClick={() => openDetails(s.id)}>Shot details</ActionMenuItem>
      <ActionMenuItem onClick={() => markMoments(s)}>Mark moments in this clip</ActionMenuItem>
      <ActionMenuItem disabled={busy} onClick={() => openVisual(s.id)}>Add visual over this shot</ActionMenuItem>
      <ActionMenuItem disabled={busy || index === 0} onClick={() => moveBy(s.id, -1)}>Move earlier</ActionMenuItem>
      <ActionMenuItem disabled={busy || index === units.length - 1} onClick={() => moveBy(s.id, 1)}>Move later</ActionMenuItem>
      <ActionMenuItem onClick={() => toggle(s.id)}>{selected.includes(s.id) ? "Deselect" : selected.length ? "Add to selection" : "Select to group into a beat"}</ActionMenuItem>
      <ActionMenuItem disabled={busy} onClick={() => remove(s.id)}>Remove from story</ActionMenuItem>
    </ActionMenu>;
  };
  // Shared card behaviour: click opens details, Shift/Cmd-click selects, Alt+arrows reorder.
  const shotProps = (s: StoryboardShot) => ({
    id: `story-shot-${s.id}`, tabIndex: 0, "data-active": details === s.id, "data-selected": selected.includes(s.id),
    "aria-label": `Shot ${number(s.id)}: ${s.label}, ${short(s.duration)}`,
    "data-dragging": dragging === s.id, "data-playing": previewOpen && shots[playing]?.id === s.id,
    onPointerDown: (e: React.PointerEvent) => startDrag(e, s.id),
    // Right-click opens the same actions as the ⋯ button.
    onContextMenu: (e: React.MouseEvent<HTMLElement>) => { const trigger = e.currentTarget.querySelector<HTMLElement>("[data-shot-menu]"); if (trigger) { e.preventDefault(); trigger.click(); } },
    onFocusCapture: (e: React.FocusEvent) => { if (e.target instanceof HTMLTextAreaElement) setNoteFocus(s.id); },
    onBlurCapture: (e: React.FocusEvent) => { if (e.target instanceof HTMLTextAreaElement) setNoteFocus(id => id === s.id ? null : id); },
    onClick: (e: React.MouseEvent) => {
      if (suppressClick.current) { suppressClick.current = false; return; }
      if ((e.target as HTMLElement).closest("button, input, textarea, label, video, a, [data-no-details]")) return;
      // Script is a read-through: details open from the shot menu there, not on every click.
      if (e.shiftKey || e.metaKey || e.ctrlKey) toggle(s.id); else { seekShot(s.id); if (layout === "strip") openDetails(s.id); }
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDetails(s.id); }
      else if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowUp")) { e.preventDefault(); moveBy(s.id, -1); }
      else if (e.altKey && (e.key === "ArrowRight" || e.key === "ArrowDown")) { e.preventDefault(); moveBy(s.id, 1); }
    },
  });
  const beatLabel = (unit: StoryboardShot[]) => {
    const group = board?.groups.find(g => g.id === unit[0].groupId);
    if (!group) return null;
    const folded = collapsed.includes(group.id);
    return <div className={styles.beatLabel}>
      <span>{group.name}</span>
      <ActionMenu align="start" trigger={<Button size="icon-xs" variant="ghost" aria-label={`Beat ${group.name} actions`}><MoreHorizontal aria-hidden="true" /></Button>}>
        <ActionMenuItem onClick={() => setCollapsed(c => folded ? c.filter(id => id !== group.id) : [...c, group.id])}>{folded ? `Show all ${unit.length} shots` : "Collapse"}</ActionMenuItem>
        <ActionMenuItem disabled={busy} onClick={() => void api.ungroup(group.id)}>Ungroup</ActionMenuItem>
      </ActionMenu>
    </div>;
  };
  const visible = (unit: StoryboardShot[]) => unit[0].groupId && collapsed.includes(unit[0].groupId) ? unit.slice(0, 1) : unit;
  const transition = (s: StoryboardShot, into = false) => s.transitionNote ? <button type="button" className={styles.transitionChip} title={s.transitionNote} onClick={() => reveal(s.id)} aria-label={`Transition into shot ${number(s.id)}: ${s.transitionNote}`}>
    <ArrowLeftRight aria-hidden="true" /><span>{s.transitionNote}</span>{into && <small>into {number(s.id)}</small>}
  </button> : null;
  const hidden = (unit: StoryboardShot[]) => unit.length - visible(unit).length;

  return <section className={styles.assembly} aria-label="Story sequence">
    <div className={styles.sectionBar}>
      <div className={styles.storyLead}>{lead ?? <InspectorHeading>Our story</InspectorHeading>}<span className={styles.count}>{shots.length} {shots.length === 1 ? "shot" : "shots"} · {time(total)}</span></div>
      <div className={styles.actions}>
        {history}
        <SegmentedControl aria-label="Story preview"><button type="button" aria-pressed={previewOpen} disabled={!shots.length} onClick={() => { const instance = player.current; if (previewOpen && instance) { instance.pause(); setResumeAt(instance.getCurrentFrame() / 30); } setPreviewOpen(!previewOpen); }}><MonitorPlay aria-hidden="true" />Preview</button></SegmentedControl>
        <SegmentedControl aria-label="Story layout">
          {([["strip", "Strip"], ["script", "List"]] as const).map(([key, label]) => <button key={key} aria-pressed={layout === key} onClick={() => setLayout(key)}>{label}</button>)}
        </SegmentedControl>
        {toolbar}
      </div>
    </div>
    {shots.length > 0 && <div className={styles.pace} role="list" aria-label="Pacing">
      {units.map(unit => <div key={unit[0].groupId || unit[0].id} className={styles.paceUnit} style={{ flexGrow: unit.reduce((sum, s) => sum + s.duration, 0) }}>
        {unit.map(s => <button key={s.id} role="listitem" className={styles.paceShot} style={{ flexGrow: s.duration }} data-active={details === s.id} data-playing={previewOpen && shots[playing]?.id === s.id} title={`${number(s.id)}. ${s.label} · ${short(s.duration)}`} aria-label={`Go to shot ${number(s.id)}, ${short(s.duration)}`} onClick={() => { seekShot(s.id); reveal(s.id); }} />)}
      </div>)}
    </div>}
    {previewOpen && shots.length > 0 && <div ref={playerBox} className={styles.storyPlayer}>
      <StoryboardPreview projectId={projectId} revision={api.snapshot?.revision ?? 0} player={player} initialTime={resumeAt} onTime={onTime} onReady={onReady} onPrevious={() => stepShot(-1)} onNext={() => stepShot(1)} />
    </div>}
    {selected.length > 0 && <div className={styles.groupBar}>
      <span>{selected.length} selected</span>
      <Input aria-label="Beat name" placeholder="Beat name, e.g. Food stop" value={beatName} onChange={e => setBeatName(e.target.value)} maxLength={240} />
      <Button size="sm" disabled={busy || selected.length < 2 || !beatName.trim()} onClick={() => { void api.group(selected, beatName.trim()); setSelected([]); setBeatName(""); }}>Group into beat</Button>
      <Button size="sm" variant="ghost" onClick={() => setSelected([])}>Clear selection</Button>
    </div>}

    {!shots.length ? <div className={styles.storyEmpty} data-drop={dropBefore === "end"}>Your first shot goes here</div>
      : layout === "strip" ? <div ref={strip} className={styles.strip}>
        {units.map(unit => <div key={unit[0].groupId || unit[0].id} className={styles.stripUnit} data-group={!!unit[0].groupId} data-drop={dropBefore === unit[0].id} data-unit={unit[0].id}>
          <div className={styles.stripBeat}>{beatLabel(unit)}</div>
          <div className={styles.stripShots}>
            {visible(unit).map(s => <article key={s.id} className={styles.stripShot} {...shotProps(s)}>
              <div className={styles.rail}><span className={styles.railDot}>{number(s.id)}</span>{transition(s)}</div>
              <div className={styles.shotPicture}>
                <StoryboardCardMedia asset={lookup(s.source)} start={s.start} duration={s.duration} label={s.label} onPlay={() => playShot(s.id)} />
                <span className={styles.shotDuration}>{short(s.duration)}</span>
                {selected.includes(s.id) && <span className={styles.shotCheck}><Check aria-hidden="true" /></span>}
                {shotMenu(s)}
              </div>
              {/* Strip reads order and rhythm: names only. Notes are read and edited in Script and Shot details. */}
              <strong className={styles.shotLabel} title={s.label}>{s.label}</strong>
              <ShotVisualStrip shot={s} lookup={lookup} open={id => openVisual(s.id, id)} />
            </article>)}
            {hidden(unit) > 0 && <button type="button" className={styles.moreShots} onClick={() => setCollapsed(c => c.filter(id => id !== unit[0].groupId))}>+{hidden(unit)}</button>}
          </div>
        </div>)}
        <div className={styles.stripEnd} data-drop={dropBefore === "end"} />
      </div>
      : <div ref={strip} className={styles.script}>
        {units.map(unit => <div key={unit[0].groupId || unit[0].id} className={styles.scriptUnit} data-drop={dropBefore === unit[0].id} data-unit={unit[0].id}>
          {unit[0].groupId && <div className={styles.scriptBeat}>{beatLabel(unit)}</div>}
          {visible(unit).map(s => <div key={s.id}>
            {s.transitionNote && <div className={styles.scriptTransition}>{transition(s, true)}</div>}
            <article className={styles.scriptRow} {...shotProps(s)}>
              <span className={styles.railDot}>{number(s.id)}</span>
              <div className={styles.shotPicture}>
                <StoryboardCardMedia asset={lookup(s.source)} start={s.start} duration={s.duration} label={s.label} onPlay={() => playShot(s.id)} />
                {selected.includes(s.id) && <span className={styles.shotCheck}><Check aria-hidden="true" /></span>}
              </div>
              <div className={styles.scriptBody}>
                <div className={styles.scriptHead}><strong className={styles.shotLabel}>{s.label}</strong><span>{short(s.duration)}</span>{shotMenu(s)}</div>
                <ShotNote value={s.note} label="Shot note" placeholder="What happens here?" maxLength={2000} projectId={projectId} save={note => void api.patchShot(s.id, { note })} />
                {s.text && <p className={styles.scriptText}>On screen: {s.text}</p>}
              </div>
              {/* The shot's assets get their own full-width row beneath the picture and line. */}
              <ShotAssetList shot={s} lookup={lookup} open={id => openVisual(s.id, id)} />
            </article>
          </div>)}
          {hidden(unit) > 0 && <button type="button" className={styles.moreShots} onClick={() => setCollapsed(c => c.filter(id => id !== unit[0].groupId))}>Show {hidden(unit)} more</button>}
        </div>)}
        <div className={styles.scriptEnd} data-drop={dropBefore === "end"} />
      </div>}
  </section>;
}
