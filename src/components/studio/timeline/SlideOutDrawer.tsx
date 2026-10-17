"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { getStoredItem } from "@/lib/persisted-key";
import { DrawerSideContext, editorDrawerSide, type DrawerSide } from "./drawer-side";

type SlideOutDrawerProps = {
  open: boolean;
  label: string;
  width: string;
  widthStorageKey?: string;
  children: ReactNode;
  testId?: string;
  zIndex?: number;
  style?: CSSProperties;
  /** When given, Escape closes the drawer (focus then returns to the control that opened it). */
  onClose?: () => void;
  /** The edge it slides from. `auto` (default) follows the editor layout: away from the preview, so
   *  Wide drawers cover the tool column from the left and Tall drawers the side column from the right. */
  side?: DrawerSide | "auto";
};

/** Drawers hold one card column: wider only wastes the editor behind them. Dragging can widen up to the hard cap. */
const DRAWER_DEFAULT_MAX = 440;
const DRAWER_DRAG_MAX = 640;

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([role="separator"])';

/** Text the person is typing keeps its own Escape; an empty field or any other control closes the drawer. */
function keepsEscape(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.closest('[role="dialog"], [role="menu"], [role="listbox"]')) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  return target instanceof HTMLInputElement && !["range", "checkbox", "radio", "button", "submit", "reset"].includes(target.type) && target.value !== "";
}

/**
 * A persistent workspace drawer, right-hand unless `side="left"`. It remains mounted while closed so
 * media browsing, review state, and scroll position survive every open/close.
 *
 * In the editor every drawer takes the same place so nothing behind it is cut mid-control:
 * the tall layout covers the whole Properties/timeline column (the preview stays visible),
 * and the wide layout docks it, so the editor reflows beside it rather than under it. A drawer
 * from the left (Wide) covers the tool column, at most DRAWER_DEFAULT_MAX wide until the person
 * drags its right edge, and runs the full height over the timeline.
 * Opening moves focus into the drawer; closing returns focus to whatever opened it.
 */
export function SlideOutDrawer({
  open,
  label,
  width,
  children,
  widthStorageKey,
  testId,
  zIndex = 1100,
  style,
  onClose,
  side = "auto",
}: SlideOutDrawerProps) {
  const [autoSide, setAutoSide] = useState<DrawerSide>("right");
  useEffect(() => {
    if (side !== "auto") return;
    const update = () => setAutoSide(editorDrawerSide());
    update();
    // A Tall/Wide switch changes the workspace's class without resizing the window.
    const workspace = document.querySelector(".editor-playback-workspace");
    const observer = new MutationObserver(update);
    if (workspace) observer.observe(workspace, { attributes: true, attributeFilter: ["class"] });
    window.addEventListener("resize", update);
    return () => { observer.disconnect(); window.removeEventListener("resize", update); };
  }, [open, side]);
  const resolvedSide = side === "auto" ? autoSide : side;
  const fromLeft = resolvedSide === "left";
  const panel = useRef<HTMLElement>(null);
  const [savedWidth, setSavedWidth] = useState<number | null>(null);
  const [viewportWidth, setViewportWidth] = useState(1280);
  const drag = useRef<{ x: number; width: number; previous: number | null } | null>(null);
  // Dragging the free edge away from the screen side widens the drawer.
  const grow = fromLeft ? 1 : -1;
  const clamp = (value: number) => Math.max(Math.min(320, window.innerWidth), Math.min(window.innerWidth - 24, DRAWER_DRAG_MAX, value));
  const persist = (value: number) => {
    setSavedWidth(value);
    if (widthStorageKey) try { localStorage.setItem(widthStorageKey, String(value)); } catch { /* Storage may be unavailable. */ }
  };
  useEffect(() => {
    const update = () => setViewportWidth(window.innerWidth);
    update(); window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  // Tall editor: the drawer's left edge meets the preview frame's right edge (else the side column's left edge),
  // at most DRAWER_DEFAULT_MAX wide.
  const [columnLeft, setColumnLeft] = useState<number | null>(null);
  // Wide editor, from the left: the drawer runs down the tool column (Library/Properties), at most
  // DRAWER_DEFAULT_MAX wide, over the timeline beneath it; its right edge drags wider or narrower.
  const [toolColumnRight, setToolColumnRight] = useState<number | null>(null);
  useEffect(() => {
    if (!open) return;
    // The drawer opens right up to the video frame itself (not its letterboxed viewer), covering every
    // control beside the preview while the whole picture stays in view.
    const frame = () => document.querySelector<HTMLElement>(".editor-playback-workspace [data-composition-master-frame]")?.getBoundingClientRect();
    const measure = () => {
      const picture = frame();
      if (fromLeft) {
        const tools = document.querySelector<HTMLElement>(".editor-playback-workspace--horizontal .editor-tools");
        setToolColumnRight(tools ? Math.round(tools.getBoundingClientRect().right) : null);
        return;
      }
      const column = document.querySelector<HTMLElement>(".editor-playback-workspace--vertical .editor-inspector");
      setColumnLeft(column ? Math.round(picture && picture.width > 0 ? picture.right : column.getBoundingClientRect().left) : null);
    };
    measure();
    const workspace = document.querySelector(".editor-playback-workspace");
    const observer = new ResizeObserver(measure);
    if (workspace) observer.observe(workspace);
    const framed = document.querySelector(".editor-playback-workspace [data-composition-master-frame]");
    if (framed) observer.observe(framed);
    // Dragging the timeline's top edge resizes the tool or Properties column, not the workspace: re-measure it.
    const column = document.querySelector(".editor-playback-workspace--horizontal .editor-tools, .editor-playback-workspace--vertical .editor-inspector");
    if (column) observer.observe(column);
    window.addEventListener("resize", measure);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, [fromLeft, open]);
  // Wide editor: publish the open drawer's width so the editor reflows beside it (editor-workspace.css).
  // Tall editor: the same flag hides the Properties column the drawer covers.
  // A left drawer covers the tool column instead, so nothing reflows.
  useEffect(() => {
    const element = panel.current;
    if (!open || !element || fromLeft) return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty("--editor-drawer-width", `${Math.round(element.getBoundingClientRect().width)}px`);
    publish();
    root.dataset.editorDrawer = label;
    const observer = new ResizeObserver(publish);
    observer.observe(element);
    return () => {
      observer.disconnect();
      if (root.dataset.editorDrawer === label) { delete root.dataset.editorDrawer; root.style.removeProperty("--editor-drawer-width"); }
    };
  }, [fromLeft, label, open]);
  // Wide editor, from the left: the drawer can be narrower than the tool column it covers, so the column's
  // controls are hidden while it is open rather than showing cut off beside it (editor-workspace.css).
  useEffect(() => {
    if (!open || !fromLeft) return;
    const root = document.documentElement;
    root.dataset.editorDrawerLeft = label;
    return () => { if (root.dataset.editorDrawerLeft === label) delete root.dataset.editorDrawerLeft; };
  }, [fromLeft, label, open]);
  // Focus moves into the drawer when it opens and back to its opener when it closes.
  useEffect(() => {
    const element = panel.current;
    if (!open || !element) return;
    const opener = document.activeElement instanceof HTMLElement && !element.contains(document.activeElement) ? document.activeElement : null;
    const frame = requestAnimationFrame(() => {
      if (!element.contains(document.activeElement)) element.querySelector<HTMLElement>(FOCUSABLE)?.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(frame);
      const active = document.activeElement;
      if (opener?.isConnected && (!active || active === document.body || element.contains(active))) opener.focus({ preventScroll: true });
    };
  }, [open]);
  useEffect(() => {
    if (!open || !onClose) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || keepsEscape(event.target)) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      // Only the drawer on top answers; a drawer opened over this one (later in the document) closes first.
      const drawers = [...document.querySelectorAll('aside[role="complementary"]:not([aria-hidden="true"])')];
      if (panel.current && drawers.at(-1) !== panel.current) return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);
  useEffect(() => {
    if (!widthStorageKey) return;
    try {
      const value = Number(getStoredItem(localStorage, widthStorageKey));
      // A width saved before the cap existed comes back capped.
      if (Number.isFinite(value) && value >= 320) setSavedWidth(Math.min(value, DRAWER_DRAG_MAX));
    } catch { /* Keep the default width. */ }
  }, [widthStorageKey]);
  return (
    <aside
      ref={panel}
      role="complementary"
      aria-label={label}
      aria-hidden={!open}
      inert={!open}
      data-testid={testId}
      className="editor-chrome"
      style={{
        position: "fixed",
        // Meets the bottom of whichever app header is present (see --app-header-height).
        top: "var(--app-header-height, 3.5rem)",
        ...(fromLeft ? { left: 0 } : { right: 0 }),
        bottom: 0,
        width: fromLeft && savedWidth !== null ? `min(${savedWidth}px, calc(100vw - 24px))`
          : fromLeft && toolColumnRight !== null ? `min(max(${toolColumnRight}px, 320px), ${DRAWER_DEFAULT_MAX}px, calc(100vw - 24px))`
          : columnLeft !== null ? `min(calc(100vw - ${columnLeft}px), ${DRAWER_DEFAULT_MAX}px)` : savedWidth === null ? width : `min(${savedWidth}px, calc(100vw - 24px))`,
        zIndex,
        display: "flex",
        flexDirection: "column",
        background: "var(--chrome-deep)",
        backdropFilter: "none",
        WebkitBackdropFilter: "none",
        [fromLeft ? "borderRight" : "borderLeft"]: "1px solid var(--chrome-line-strong)",
        boxShadow: "none",
        transform: open ? "translateX(0)" : fromLeft ? "translateX(-105%)" : "translateX(105%)",
        transition: "transform 0.28s cubic-bezier(0.4,0,0.2,1)",
        pointerEvents: open ? "auto" : "none",
        ...style,
      }}
    >
      {widthStorageKey && (fromLeft || columnLeft === null) && <div
        role="separator" aria-orientation="vertical" aria-label={`Resize ${label}`}
        aria-valuemin={Math.min(320, viewportWidth - 24)} aria-valuemax={Math.min(DRAWER_DRAG_MAX, viewportWidth - 24)} aria-valuenow={Math.min(savedWidth ?? 480, viewportWidth - 24)} aria-valuetext={`${Math.round(Math.min(savedWidth ?? 480, viewportWidth - 24))} pixels wide`}
        tabIndex={open ? 0 : -1}
        title="Drag to resize"
        className={`group absolute ${fromLeft ? "-right-1" : "-left-1"} top-0 z-10 flex h-full w-2 cursor-col-resize items-center justify-center touch-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chrome-focus-ring)]`}
        onDoubleClick={() => {
          // Back to the layout's own width: the tool column (Wide) or the default.
          setSavedWidth(null);
          if (widthStorageKey) try { localStorage.removeItem(widthStorageKey); } catch { /* Storage may be unavailable. */ }
        }}
        onPointerDown={event => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.focus();
          drag.current = { x: event.clientX, width: panel.current!.getBoundingClientRect().width, previous: savedWidth };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={event => {
          if (drag.current) setSavedWidth(clamp(drag.current.width + grow * (event.clientX - drag.current.x)));
        }}
        onPointerUp={event => {
          if (!drag.current) return;
          persist(clamp(drag.current.width + grow * (event.clientX - drag.current.x)));
          drag.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => { if (drag.current) setSavedWidth(drag.current.previous); drag.current = null; }}
        onLostPointerCapture={() => { if (drag.current) setSavedWidth(drag.current.previous); drag.current = null; }}
        onKeyDown={event => {
          if (event.key === 'Escape' && drag.current) {
            event.preventDefault(); event.stopPropagation();
            setSavedWidth(drag.current.previous); drag.current = null;
          }
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault(); event.stopPropagation();
            const current = panel.current!.getBoundingClientRect().width;
            persist(clamp(current + grow * (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 10 : 32)));
          }
        }}
      ><span className="h-12 w-1 rounded-full bg-[var(--chrome-line-strong)] group-hover:bg-[var(--ink-muted)]" /></div>}
      <DrawerSideContext.Provider value={resolvedSide}>{children}</DrawerSideContext.Provider>
    </aside>
  );
}
