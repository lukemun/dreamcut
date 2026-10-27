"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type PointerEvent, type KeyboardEvent, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { GripVertical, PanelsTopLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionMenu, ActionMenuCheckboxItem } from "@/components/ui/menu";
import { WorkspaceResizeHandle, useWorkspaceSize } from "@/components/ui/workspace-resize";
import { dropPanel, hidePanel, isShown, MAX_ROW_HEIGHT, MIN_ROW_HEIGHT, normalizeLayout, nudgePanel, panelHeight, resizeColumns, resizePanel, showPanel, type DropSide, type PanelLayout } from "@/lib/storyboard/panel-layout";
import { InspectorHeading } from "../timeline/InspectorHierarchy";
import styles from "./storyboard-panels.module.css";

/** `minHeight` grows the panel's row while its content needs room (Media with the Library open). */
export type StoryboardPanel = { id: string; title: string; count?: ReactNode; height: number; minHeight?: number; content: ReactNode };

const PanelActionsContext = createContext<HTMLDivElement | null>(null);
export function StoryboardPanelActions({ children }: { children: ReactNode }) {
  const target = useContext(PanelActionsContext);
  return target ? createPortal(children, target) : null;
}

const EDGE = 12, MIN_WIDTH = 240, NARROW = 720;
const sideOf = (event: { clientX: number; clientY: number }, node: HTMLElement, narrow: boolean): DropSide => {
  const box = node.getBoundingClientRect(), x = (event.clientX - box.left) / box.width, y = (event.clientY - box.top) / box.height;
  return !narrow && x < .25 ? "left" : !narrow && x > .75 ? "right" : y < .5 ? "top" : "bottom";
};

/**
 * Panels sit in rows. Every edge between panels and every row bottom drags to resize; dropping a panel
 * on another's side puts it beside it, on its top or bottom in a new row. All panels stay mounted in one
 * container (hidden or moved), so drafts survive. The layout is a viewing preference, never board content.
 */
export function StoryboardPanels({ projectId, panels, defaultLayout, actions }: { projectId: string; panels: StoryboardPanel[]; defaultLayout: PanelLayout; actions?: ReactNode }) {
  const storageKey = `dreamcut:storyboard-layout-v3:${projectId}`;
  const ids = panels.map(panel => panel.id);
  const [layout, setLayout] = useState<PanelLayout>(() => normalizeLayout(defaultLayout, ids) ?? { rows: [] });
  const [drag, setDrag] = useState<{ id: string; over: string | null; side: DropSide | null } | null>(null);
  const dragRef = useRef<{ id: string; over: string | null; side: DropSide | null; x: number; y: number } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const area = useRef<HTMLDivElement>(null);
  const { width } = useWorkspaceSize(area);
  const narrow = width > 0 && width < NARROW;
  useEffect(() => {
    try { const saved = normalizeLayout(JSON.parse(localStorage.getItem(storageKey) ?? "null"), ids); if (saved) setLayout(saved); }
    catch { /* Keep the default layout. */ }
    // Saved layouts are read once per project; panel definitions change on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);
  const commit = (next: PanelLayout, persist = true) => {
    setLayout(next);
    if (persist) try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* This visit only. */ }
  };
  const title = (id: string) => panels.find(panel => panel.id === id)?.title ?? id;
  // A panel shown again lands at the bottom: bring it into view and mark it briefly so it is found.
  const [arrived, setArrived] = useState<string | null>(null);
  useEffect(() => {
    if (!arrived) return;
    document.querySelector(`[data-storyboard-panel="${arrived}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const timer = window.setTimeout(() => setArrived(null), 1200);
    return () => window.clearTimeout(timer);
  }, [arrived]);
  const toggle = (panel: StoryboardPanel, on: boolean) => {
    commit(on ? showPanel(layout, panel.id, panel.height) : hidePanel(layout, panel.id));
    if (on) setArrived(panel.id);
  };

  const cancelMove = () => { dragRef.current = null; setDrag(null); };
  const finishMove = () => {
    const current = dragRef.current;
    if (current?.over && current.side) {
      commit(dropPanel(layout, current.id, current.over, current.side));
      setAnnouncement(`${title(current.id)} moved ${current.side === "left" || current.side === "right" ? `${current.side} of` : current.side === "top" ? "above" : "below"} ${title(current.over)}.`);
    }
    cancelMove();
  };
  const moveKey = (id: string, event: KeyboardEvent) => {
    if (event.key === "Escape") { if (dragRef.current) { event.preventDefault(); event.stopPropagation(); cancelMove(); } return; }
    if (!(event.target as HTMLElement).closest(`.${styles.moveHandle}`)) return;
    const direction = ({ ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" } as const)[event.key as "ArrowLeft"];
    if (!direction) return;
    event.preventDefault(); event.stopPropagation();
    const next = nudgePanel(layout, id, direction);
    if (next !== layout) { commit(next); setAnnouncement(`${title(id)} moved ${direction}.`); }
  };

  // One flex container: each row is its panels and the edges between them, then a full-width row edge.
  const placed = new Map<string, CSSProperties>(), edges: ReactNode[] = [];
  layout.rows.forEach((stored, r) => {
    const need = Math.max(0, ...stored.panels.map(p => panels.find(panel => panel.id === p.id)?.minHeight ?? 0));
    const row = need > stored.height ? { ...stored, height: need } : stored;
    const gaps = narrow ? 0 : row.panels.length - 1, inner = Math.max(0, width - gaps * EDGE);
    const own = (p: (typeof row.panels)[number]) => Math.max(need, panelHeight(row, p));
    row.panels.forEach((panel, c) => {
      placed.set(panel.id, { order: r * 1000 + c * 2, height: own(panel), flex: narrow ? "1 1 100%" : `${panel.width} 1 0px` });
      if (narrow || c === row.panels.length - 1) return;
      const before = row.panels.slice(0, c).reduce((sum, p) => sum + p.width, 0) * inner, pair = (panel.width + row.panels[c + 1].width) * inner;
      edges.push(<WorkspaceResizeHandle key={`${r}-${c}`} label={`Resize ${title(panel.id)} and ${title(row.panels[c + 1].id)}`} axis="x"
        value={panel.width * inner} min={MIN_WIDTH} max={Math.max(MIN_WIDTH, pair - MIN_WIDTH)}
        snapPoints={() => [inner / 3, inner / 2, inner * 2 / 3].map(edge => edge - before)}
        onChange={(px, persist) => commit(resizeColumns(layout, r, c, inner ? px / inner : panel.width, MIN_WIDTH / Math.max(inner, 1)), persist)}
        onReset={() => commit(resizeColumns(layout, r, c, (panel.width + row.panels[c + 1].width) / 2, 0))}
        style={{ order: r * 1000 + c * 2 + 1, position: "relative", width: EDGE, flex: `0 0 ${EDGE}px`, height: Math.max(own(panel), own(row.panels[c + 1])) }} />);
    });
    // Rows end in a gap the size of an edge; each panel resizes from its own bottom edge.
    edges.push(<div key={`row-${r}`} aria-hidden="true" style={{ order: r * 1000 + 999, flex: "0 0 100%", height: EDGE }} />);
  });

  return <>
    <div className={styles.toolbar} role="group" aria-label="Storyboard panels">
      <InspectorHeading>Storyboard</InspectorHeading>
      <ActionMenu align="start" trigger={<Button size="sm" variant="outline"><PanelsTopLeft />Panels</Button>}>
        {panels.map(panel => <ActionMenuCheckboxItem key={panel.id} checked={isShown(layout, panel.id)} onCheckedChange={on => toggle(panel, on)}>{panel.title}</ActionMenuCheckboxItem>)}
      </ActionMenu>
      <span className={styles.spacer} />
      {actions}
    </div>
    <div ref={area} className={styles.area} data-narrow={narrow}>
      {!layout.rows.length && <div className={styles.empty}>
        <ActionMenu align="center" trigger={<Button variant="outline"><PanelsTopLeft />Show a panel</Button>}>
          {panels.map(panel => <ActionMenuCheckboxItem key={panel.id} checked={false} onCheckedChange={() => toggle(panel, true)}>{panel.title}</ActionMenuCheckboxItem>)}
        </ActionMenu>
      </div>}
      {panels.map(panel => <Panel key={panel.id} panel={panel} style={placed.get(panel.id)}
        onResize={(px, persist) => commit(resizePanel(layout, panel.id, px), persist)} onResetHeight={() => commit(resizePanel(layout, panel.id, null))} arrived={arrived === panel.id} drop={drag?.over === panel.id ? drag.side : null}
        moving={drag?.id === panel.id} onHide={() => toggle(panel, false)} onMoveCancel={cancelMove} onMoveEnd={finishMove} onMoveKey={event => moveKey(panel.id, event)}
        onMoveStart={event => {
          if (event.button !== 0 || ((event.target as HTMLElement).closest("button") && !(event.target as HTMLElement).closest(`.${styles.moveHandle}`))) return;
          event.preventDefault(); event.currentTarget.querySelector<HTMLButtonElement>(`.${styles.moveHandle}`)?.focus();
          dragRef.current = { id: panel.id, over: null, side: null, x: event.clientX, y: event.clientY }; setDrag({ id: panel.id, over: null, side: null }); event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onMove={event => {
          const current = dragRef.current;
          if (!current || Math.hypot(event.clientX - current.x, event.clientY - current.y) < 6) return;
          const node = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-storyboard-panel]"), target = node?.dataset.storyboardPanel;
          const valid = !!node && !!target && target !== current.id && isShown(layout, target);
          current.over = valid ? target : null; current.side = valid ? sideOf(event, node, narrow) : null;
          setDrag({ id: current.id, over: current.over, side: current.side });
        }} />)}
      {edges}
    </div>
    <span className="sr-only" role="status" aria-live="polite">{announcement}</span>
  </>;
}

function Panel({ panel, style, onResize, onResetHeight, arrived, drop, moving, onHide, onMoveStart, onMove, onMoveEnd, onMoveCancel, onMoveKey }: { panel: StoryboardPanel; style?: CSSProperties; onResize: (height: number, persist?: boolean) => void; onResetHeight: () => void; arrived: boolean; drop: DropSide | null; moving: boolean; onHide: () => void; onMoveStart: (event: PointerEvent<HTMLDivElement>) => void; onMove: (event: PointerEvent<HTMLDivElement>) => void; onMoveEnd: () => void; onMoveCancel: () => void; onMoveKey: (event: KeyboardEvent) => void }) {
  const [actions, setActions] = useState<HTMLDivElement | null>(null);
  return <section data-storyboard-panel={panel.id} data-drop={drop ?? undefined} data-arrived={arrived || undefined} hidden={!style} className={styles.panel} aria-label={`${panel.title} panel`} style={style}>
    <div className={styles.panelHeader} data-moving={moving} onPointerDown={onMoveStart} onPointerMove={onMove} onPointerUp={onMoveEnd} onPointerCancel={onMoveCancel} onLostPointerCapture={onMoveCancel} onKeyDown={onMoveKey}>
      <Button size="icon-sm" variant="ghost" className={styles.moveHandle} aria-label={`Move ${panel.title}`} aria-pressed={moving} title="Drag to move · Arrow keys to move · Escape to cancel"><GripVertical /></Button>
      <InspectorHeading>{panel.title}</InspectorHeading>{panel.count !== undefined && <span className={styles.count}>{panel.count}</span>}<span className={styles.spacer} />
      <div ref={setActions} className={styles.headerActions} onPointerDown={event => event.stopPropagation()} />
      <Button size="icon-sm" variant="ghost" aria-label={`Hide ${panel.title}`} title={`Hide ${panel.title}`} onClick={onHide}><X /></Button>
    </div>
    <PanelActionsContext.Provider value={actions}><div className={styles.body}>{panel.content}</div></PanelActionsContext.Provider>
    {style && <WorkspaceResizeHandle label={`Resize ${panel.title} height`} axis="y" value={Number(style.height) || panel.height} min={MIN_ROW_HEIGHT} max={MAX_ROW_HEIGHT}
      snapPoints={() => Array.from(document.querySelectorAll<HTMLElement>("[data-storyboard-panel]:not([hidden])")).filter(node => node.dataset.storyboardPanel !== panel.id).map(node => node.getBoundingClientRect().height)}
      onChange={onResize} onReset={onResetHeight} style={{ position: "relative", flex: "0 0 10px", width: "100%" }} />}
  </section>;
}
