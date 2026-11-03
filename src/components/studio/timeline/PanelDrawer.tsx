"use client";

import { useCallback, useContext, useSyncExternalStore, type ReactNode } from "react";
import { PanelLeftCloseIcon, PanelLeftOpenIcon, PanelRightCloseIcon, PanelRightOpenIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getStoredItem } from "@/lib/persisted-key";
import { DrawerHeader } from "./DrawerHeader";
import { DrawerSideContext, type DrawerSide } from "./drawer-side";
import { SlideOutDrawer } from "./SlideOutDrawer";

/** The panels that can slide out as a drawer instead of sitting in the tool column. Expand and Dock are one
 *  choice for all of them: while panels are drawers, every panel's rail item or tab opens its drawer. */
export type DrawerPane = "properties" | "recipes" | "layouts" | "text" | "captions";
/** The panels the shelf can show docked, so Dock can send it back to one of them. */
export type SavedDrawerPane = Exclude<DrawerPane, "properties">;
export const DRAWER_PANES: readonly DrawerPane[] = ["properties", "recipes", "layouts", "captions", "text"];
export const PANEL_TITLES: Record<DrawerPane, string> = { properties: "Properties", recipes: "Templates", layouts: "Layouts", text: "Text", captions: "Captions" };

/** A docked tool panel's header: Expand in the top-right corner, where every panel and drawer keeps its
 *  Expand or Dock. Usually the selected tab or rail item above already shows the panel's name, so the name is
 *  kept for screen readers only; `showTitle` shows it, in the drawer header's type, for a panel reached from an
 *  icon-only rail with nothing else on its header row. */
export function ToolPanelHeader({ pane, action, children, showTitle }: { pane: DrawerPane; action?: ReactNode; children?: ReactNode; showTitle?: boolean }) {
  return <div className="tool-panel-header">
    <h2 className={showTitle ? "min-w-0 flex-1 truncate pl-1 text-sm font-semibold" : "sr-only"}>{PANEL_TITLES[pane]}</h2>
    {children && <div className="min-w-0 flex-1">{children}</div>}
    {action && <span className="tool-panel-action">{action}</span>}
  </div>;
}

const panelCornerButtonClassName = "shrink-0 text-[var(--ink-secondary)] hover:text-[var(--ink)]";

/** Opens the panel as a drawer; `onPrepare` (hover or focus) mounts it ahead so it opens loaded.
 *  One icon in the panel's top-right corner everywhere. Its arrow points the way the drawer slides out:
 *  from the left in Wide, from the right in Tall. */
export function PanelExpandButton({ pane, onClick, onPrepare, side }: { pane: DrawerPane; onClick: () => void; onPrepare?: () => void; side?: DrawerSide }) {
  const contextSide = useContext(DrawerSideContext);
  const Icon = (side ?? contextSide) === "left" ? PanelLeftOpenIcon : PanelRightOpenIcon;
  const label = `Expand ${PANEL_TITLES[pane].toLowerCase()}`;
  return <Button type="button" variant="ghost" size="icon-sm" aria-label={label} title={label} className={panelCornerButtonClassName}
    onClick={onClick} onPointerEnter={onPrepare} onFocus={onPrepare}>
    <Icon aria-hidden="true" />
  </Button>;
}

/** The drawer's counterpart to Expand, in the same corner: puts the panel back in the tool column. Its arrow
 *  points the way the drawer folds in. */
export function PanelDockButton({ pane, onClick, side }: { pane: DrawerPane; onClick: () => void; side?: DrawerSide }) {
  const contextSide = useContext(DrawerSideContext);
  const Icon = (side ?? contextSide) === "left" ? PanelLeftCloseIcon : PanelRightCloseIcon;
  const label = `Dock ${PANEL_TITLES[pane].toLowerCase()}`;
  return <Button type="button" variant="ghost" size="icon-sm" aria-label={label} title={label} className={panelCornerButtonClassName} onClick={onClick}>
    <Icon aria-hidden="true" />
  </Button>;
}

/** A panel slid out as an editor drawer: the same content as the docked panel, at full height and at least
 *  the docked panel's width (up to the drag cap). Its header names the panel and offers Dock in the top-right
 *  corner; Dock puts every panel back in its column. */
export function PanelDrawer({ pane, open, onClose, onDock, side, children }: {
  pane: DrawerPane; open: boolean; onClose: () => void; onDock: () => void; side: DrawerSide; children: ReactNode;
}) {
  const title = PANEL_TITLES[pane];
  return <SlideOutDrawer open={open} onClose={onClose} label={title} testId={`${pane}-drawer`} side={side} maxWidth={640}
    width="min(640px, calc(100vw - 16px))" widthStorageKey={`dreamcut.${pane}-drawer-width`}>
    <DrawerHeader closeLabel={`Close ${title.toLowerCase()}`} onClose={onClose}>
      <h2 className="text-sm font-semibold">{title}</h2>
      <span className="flex-1" />
      <PanelDockButton pane={pane} side={side} onClick={onDock} />
    </DrawerHeader>
    <div id={`${pane}-drawer-panel`} className="flex min-h-0 flex-1 flex-col pt-3">{children}</div>
  </SlideOutDrawer>;
}

// Whether panels open as drawers or sit docked: one per-viewer view preference for every panel, kept in
// browser storage like the editor's other layout choices, so it holds across reloads and projects.
const DRAWERS_KEY = "dreamcut:panel-drawers";
// Before panels shared the choice, each remembered its own; any panel left as a drawer carries over.
const LEGACY_KEYS = ["dreamcut:templates-drawer", ...["layouts", "captions", "text"].map(pane => `dreamcut:panel-drawer:${pane}`)];
const listeners = new Set<() => void>();
function readDrawers() {
  try {
    const stored = getStoredItem(localStorage, DRAWERS_KEY);
    if (stored) return stored === "drawer";
    return LEGACY_KEYS.some(key => getStoredItem(localStorage, key) === "drawer");
  } catch { return false; /* Storage unavailable: everything docked. */ }
}
function subscribeDrawers(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => { if (event.key === DRAWERS_KEY) listener(); };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(listener); window.removeEventListener("storage", onStorage); };
}

const ALL_DRAWERS: ReadonlySet<DrawerPane> = new Set(DRAWER_PANES);
const NO_DRAWERS: ReadonlySet<DrawerPane> = new Set();
/** The panels that open as drawers (all of them, or none while docked), and the setter Expand and Dock share. */
export function usePanelDrawerPreferences(): [ReadonlySet<DrawerPane>, (drawers: boolean) => void] {
  const drawers = useSyncExternalStore(subscribeDrawers, readDrawers, () => false);
  const setDrawers = useCallback((next: boolean) => {
    try { localStorage.setItem(DRAWERS_KEY, next ? "drawer" : "docked"); } catch { /* Storage unavailable: nothing to remember. */ }
    listeners.forEach(listener => listener());
  }, []);
  return [drawers ? ALL_DRAWERS : NO_DRAWERS, setDrawers];
}
