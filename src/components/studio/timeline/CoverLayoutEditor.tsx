"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  CheckIcon,
  Maximize2Icon,
  RotateCcwIcon,
  RotateCwIcon,
  SaveIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  CoverLayoutItem,
  CoverLayoutProposal,
} from "@/lib/layout-proposals/cover-layout";
import {
  cloneCoverLayoutItems,
  coverLayoutItemsFingerprint,
  recordCoverLayoutHistory,
  redoCoverLayoutHistory,
  undoCoverLayoutHistory,
  type CoverLayoutHistoryStacks,
} from "./cover-layout-history";

type MoveInteraction = {
  kind: "move";
  pointerId: number;
  startClientX: number;
  startClientY: number;
  itemStarts: Map<string, { x: number; y: number }>;
  beforeItems: CoverLayoutItem[];
};

type TransformInteraction = {
  kind: "resize" | "rotate";
  pointerId: number;
  itemId: string;
  centerClientX: number;
  centerClientY: number;
  startWidth: number;
  startHeight: number;
  startRotation: number;
  startDistance: number;
  startPointerAngle: number;
  beforeItems: CoverLayoutItem[];
};

type InteractionState = MoveInteraction | TransformInteraction;

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 0.75;
const ZOOM_STEP = 0.1;
const MIN_COVER_WIDTH = 8;
const MIN_COVER_HEIGHT = 12;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

export type CoverLayoutHistoryController = {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
};

export function CoverLayoutEditor({
  projectId,
  layoutId,
  onHistoryControllerChange,
  onMutationHistory,
}: {
  projectId: string;
  layoutId: string;
  onHistoryControllerChange?: (controller: CoverLayoutHistoryController | null) => void;
  /** Server-returned before/after snapshot descriptors for a persisted save. */
  onMutationHistory?: (history: {
    before: { id: string; op: string; at: string };
    after: { id: string; op: string; at: string };
  }) => void;
}) {
  const [proposal, setProposal] = useState<CoverLayoutProposal | null>(null);
  const [items, setItems] = useState<CoverLayoutItem[]>([]);
  const [savedFingerprint, setSavedFingerprint] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [readableCovers, setReadableCovers] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const fitToWidthRef = useRef(true);
  const interactionRef = useRef<InteractionState | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const pendingPointerRef = useRef<{ clientX: number; clientY: number; shiftKey: boolean } | null>(null);
  const itemsRef = useRef<CoverLayoutItem[]>([]);
  const historyStacksRef = useRef<CoverLayoutHistoryStacks>({ undo: [], redo: [] });
  const inputHistoryStartRef = useRef<CoverLayoutItem[] | null>(null);
  const [, setHistoryVersion] = useState(0);

  const replaceItems = useCallback((next: CoverLayoutItem[]) => {
    const cloned = cloneCoverLayoutItems(next);
    itemsRef.current = cloned;
    setItems(cloned);
  }, []);

  const updateItems = useCallback((
    updater: (current: CoverLayoutItem[]) => CoverLayoutItem[],
  ) => {
    const next = updater(itemsRef.current);
    itemsRef.current = next;
    setItems(next);
    return next;
  }, []);

  const resetLayoutHistory = useCallback(() => {
    historyStacksRef.current = { undo: [], redo: [] };
    setHistoryVersion((current) => current + 1);
  }, []);

  const recordLayoutChange = useCallback((
    before: CoverLayoutItem[],
    after: CoverLayoutItem[],
  ) => {
    const next = recordCoverLayoutHistory(historyStacksRef.current, before, after);
    if (next === historyStacksRef.current) return;
    historyStacksRef.current = next;
    setHistoryVersion((current) => current + 1);
  }, []);

  const applyRecordedItems = useCallback((next: CoverLayoutItem[]) => {
    const before = cloneCoverLayoutItems(itemsRef.current);
    replaceItems(next);
    recordLayoutChange(before, next);
  }, [recordLayoutChange, replaceItems]);

  const undoLayout = useCallback(() => {
    const result = undoCoverLayoutHistory(historyStacksRef.current);
    if (!result.items) return;
    historyStacksRef.current = result.stacks;
    replaceItems(result.items);
    setHistoryVersion((current) => current + 1);
  }, [replaceItems]);

  const redoLayout = useCallback(() => {
    const result = redoCoverLayoutHistory(historyStacksRef.current);
    if (!result.items) return;
    historyStacksRef.current = result.stacks;
    replaceItems(result.items);
    setHistoryVersion((current) => current + 1);
  }, [replaceItems]);

  const load = useCallback(async () => {
    setError(null);
    const response = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/layout-proposals/${encodeURIComponent(layoutId)}`,
    );
    const body = await response.json() as CoverLayoutProposal & { error?: string };
    if (!response.ok) throw new Error(body.error ?? "Failed to load layout proposal");
    setProposal(body);
    replaceItems(body.items);
    setSavedFingerprint(coverLayoutItemsFingerprint(body.items));
    setSelectedIds(new Set());
    resetLayoutHistory();
  }, [layoutId, projectId, replaceItems, resetLayoutHistory]);

  useEffect(() => {
    void load().catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : "Failed to load layout proposal");
    });
  }, [load]);

  const dirty = useMemo(
    () => coverLayoutItemsFingerprint(items) !== savedFingerprint,
    [items, savedFingerprint],
  );
  const uniqueCoverCount = useMemo(
    () => new Set(items.map((item) => item.asset_url)).size,
    [items],
  );
  const selectedItem = useMemo(() => {
    if (selectedIds.size !== 1) return null;
    const [selectedId] = selectedIds;
    return items.find((item) => item.id === selectedId) ?? null;
  }, [items, selectedIds]);
  const canUndoLayout = historyStacksRef.current.undo.length > 0;
  const canRedoLayout = historyStacksRef.current.redo.length > 0;

  useEffect(() => {
    if (!onHistoryControllerChange) return;
    onHistoryControllerChange({
      canUndo: canUndoLayout,
      canRedo: canRedoLayout,
      undo: undoLayout,
      redo: redoLayout,
    });
    return () => onHistoryControllerChange(null);
  }, [
    canRedoLayout,
    canUndoLayout,
    onHistoryControllerChange,
    redoLayout,
    undoLayout,
  ]);

  const save = useCallback(async () => {
    if (!proposal || !dirty) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/layout-proposals/${encodeURIComponent(layoutId)}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            expected_revision: proposal.revision,
            edit_source: "user_ui",
            items,
          }),
        },
      );
      const body = await response.json() as CoverLayoutProposal & {
        error?: string;
        mutation_history?: {
          before: { id: string; op: string; at: string };
          after: { id: string; op: string; at: string };
        };
      };
      if (!response.ok) throw new Error(body.error ?? "Failed to save cover layout");
      setProposal(body);
      replaceItems(body.items);
      setSavedFingerprint(coverLayoutItemsFingerprint(body.items));
      if (body.mutation_history) onMutationHistory?.(body.mutation_history);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save cover layout");
    } finally {
      setSaving(false);
    }
  }, [dirty, items, layoutId, onMutationHistory, projectId, proposal, replaceItems]);

  const beginDrag = useCallback((
    event: ReactPointerEvent<HTMLDivElement>,
    itemId: string,
  ) => {
    if (!proposal) return;
    event.preventDefault();
    event.stopPropagation();
    const nextSelection = event.shiftKey
      ? new Set(selectedIds)
      : selectedIds.has(itemId) ? new Set(selectedIds) : new Set([itemId]);
    if (event.shiftKey) {
      if (nextSelection.has(itemId)) nextSelection.delete(itemId);
      else nextSelection.add(itemId);
    }
    if (nextSelection.size === 0) nextSelection.add(itemId);
    setSelectedIds(nextSelection);
    const itemStarts = new Map<string, { x: number; y: number }>();
    for (const item of items) {
      if (nextSelection.has(item.id)) itemStarts.set(item.id, { x: item.x, y: item.y });
    }
    interactionRef.current = {
      kind: "move",
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      itemStarts,
      beforeItems: cloneCoverLayoutItems(itemsRef.current),
    };
    canvasRef.current?.setPointerCapture(event.pointerId);
  }, [items, proposal, selectedIds]);

  const beginTransform = useCallback((
    event: ReactPointerEvent<HTMLButtonElement>,
    item: CoverLayoutItem,
    kind: TransformInteraction["kind"],
  ) => {
    if (!proposal || !canvasRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedIds(new Set([item.id]));
    const canvasRect = canvasRef.current.getBoundingClientRect();
    const centerClientX = canvasRect.left + item.x * zoom;
    const centerClientY = canvasRect.top + item.y * zoom;
    interactionRef.current = {
      kind,
      pointerId: event.pointerId,
      itemId: item.id,
      centerClientX,
      centerClientY,
      startWidth: item.width,
      startHeight: item.height,
      startRotation: item.rotation,
      startDistance: Math.max(1, Math.hypot(event.clientX - centerClientX, event.clientY - centerClientY)),
      startPointerAngle: Math.atan2(event.clientY - centerClientY, event.clientX - centerClientX) * 180 / Math.PI,
      beforeItems: cloneCoverLayoutItems(itemsRef.current),
    };
    canvasRef.current.setPointerCapture(event.pointerId);
  }, [proposal, zoom]);

  const applyInteraction = useCallback((clientX: number, clientY: number, shiftKey: boolean) => {
    const interaction = interactionRef.current;
    if (!interaction || !proposal) return;
    if (interaction.kind === "move") {
      const dx = (clientX - interaction.startClientX) / zoom;
      const dy = (clientY - interaction.startClientY) / zoom;
      updateItems((current) => current.map((item) => {
        const start = interaction.itemStarts.get(item.id);
        if (!start) return item;
        return {
          ...item,
          x: clamp(start.x + dx, item.width / 2, proposal.canvas.width - item.width / 2),
          y: clamp(start.y + dy, item.height / 2, proposal.canvas.height - item.height / 2),
        };
      }));
      return;
    }
    if (interaction.kind === "resize") {
      const distance = Math.max(
        1,
        Math.hypot(clientX - interaction.centerClientX, clientY - interaction.centerClientY),
      );
      const scale = distance / interaction.startDistance;
      const aspectRatio = interaction.startWidth / interaction.startHeight;
      const width = clamp(
        interaction.startWidth * scale,
        MIN_COVER_WIDTH,
        proposal.canvas.width,
      );
      const height = clamp(
        width / aspectRatio,
        MIN_COVER_HEIGHT,
        proposal.canvas.height,
      );
      updateItems((current) => current.map((item) => item.id === interaction.itemId
        ? {
            ...item,
            width,
            height,
            x: clamp(item.x, width / 2, proposal.canvas.width - width / 2),
            y: clamp(item.y, height / 2, proposal.canvas.height - height / 2),
          }
        : item));
      return;
    }
    const pointerAngle = Math.atan2(
      clientY - interaction.centerClientY,
      clientX - interaction.centerClientX,
    ) * 180 / Math.PI;
    let rotation = interaction.startRotation + pointerAngle - interaction.startPointerAngle;
    if (shiftKey) rotation = Math.round(rotation / 15) * 15;
    while (rotation > 180) rotation -= 360;
    while (rotation < -180) rotation += 360;
    updateItems((current) => current.map((item) => item.id === interaction.itemId
      ? { ...item, rotation }
      : item));
  }, [proposal, updateItems, zoom]);

  const moveInteraction = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const interaction = interactionRef.current;
    if (!interaction || event.pointerId !== interaction.pointerId) return;
    pendingPointerRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      shiftKey: event.shiftKey,
    };
    if (animationFrameRef.current != null) return;
    animationFrameRef.current = window.requestAnimationFrame(() => {
      animationFrameRef.current = null;
      const pending = pendingPointerRef.current;
      if (!pending) return;
      applyInteraction(pending.clientX, pending.clientY, pending.shiftKey);
    });
  }, [applyInteraction]);

  const endInteraction = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const interaction = interactionRef.current;
    if (interaction?.pointerId !== event.pointerId) return;
    if (animationFrameRef.current != null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    applyInteraction(event.clientX, event.clientY, event.shiftKey);
    recordLayoutChange(interaction.beforeItems, itemsRef.current);
    pendingPointerRef.current = null;
    interactionRef.current = null;
    if (canvasRef.current?.hasPointerCapture(event.pointerId)) {
      canvasRef.current.releasePointerCapture(event.pointerId);
    }
  }, [applyInteraction, recordLayoutChange]);

  useEffect(() => () => {
    if (animationFrameRef.current != null) window.cancelAnimationFrame(animationFrameRef.current);
  }, []);

  const nudgeSelection = useCallback((dx: number, dy: number) => {
    if (!proposal || selectedIds.size === 0) return;
    const before = cloneCoverLayoutItems(itemsRef.current);
    const after = updateItems((current) => current.map((item) => {
      if (!selectedIds.has(item.id)) return item;
      return {
        ...item,
        x: clamp(item.x + dx, item.width / 2, proposal.canvas.width - item.width / 2),
        y: clamp(item.y + dy, item.height / 2, proposal.canvas.height - item.height / 2),
      };
    }));
    recordLayoutChange(before, after);
  }, [proposal, recordLayoutChange, selectedIds, updateItems]);

  const updateSelectedItem = useCallback((
    property: "x" | "y" | "width" | "height" | "rotation",
    rawValue: number,
  ) => {
    if (!proposal || !selectedItem || !Number.isFinite(rawValue)) return;
    updateItems((current) => current.map((item) => {
      if (item.id !== selectedItem.id) return item;
      if (property === "rotation") {
        return { ...item, rotation: clamp(rawValue, -360, 360) };
      }
      if (property === "width") {
        const width = clamp(rawValue, MIN_COVER_WIDTH, proposal.canvas.width);
        return {
          ...item,
          width,
          x: clamp(item.x, width / 2, proposal.canvas.width - width / 2),
        };
      }
      if (property === "height") {
        const height = clamp(rawValue, MIN_COVER_HEIGHT, proposal.canvas.height);
        return {
          ...item,
          height,
          y: clamp(item.y, height / 2, proposal.canvas.height - height / 2),
        };
      }
      if (property === "x") {
        return {
          ...item,
          x: clamp(rawValue, item.width / 2, proposal.canvas.width - item.width / 2),
        };
      }
      return {
        ...item,
        y: clamp(rawValue, item.height / 2, proposal.canvas.height - item.height / 2),
      };
    }));
  }, [proposal, selectedItem, updateItems]);

  const fitCanvasWidth = useCallback(() => {
    const availableWidth = (viewportRef.current?.clientWidth ?? 0) - 16;
    if (availableWidth <= 0 || !proposal) return;
    fitToWidthRef.current = true;
    setZoom(clamp(availableWidth / proposal.canvas.width, MIN_ZOOM, MAX_ZOOM));
  }, [proposal]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !proposal) return;
    const observer = new ResizeObserver(() => {
      if (!fitToWidthRef.current) return;
      window.requestAnimationFrame(fitCanvasWidth);
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [fitCanvasWidth, proposal]);

  if (error && !proposal) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center text-base text-[var(--ink)]">
        <p>{error}</p>
        <Button variant="outline" size="studio" onClick={() => void load()}>Try again</Button>
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="grid h-full place-items-center text-base text-[var(--ink-secondary)]">
        Loading cover layout…
      </div>
    );
  }

  return (
    <section
      data-layout-workspace
      className="flex h-full min-h-0 flex-col bg-[var(--chrome-deep)] text-[var(--ink)]"
    >
      <header className="flex flex-col gap-2 border-b border-[var(--chrome-line)] px-3 py-2">
        <div className="flex items-center gap-2">
          <h2 className="min-w-0 flex-1 truncate text-base font-bold">{proposal.title}</h2>
          <span className="shrink-0 text-[0.92rem] text-[var(--ink-secondary)]">
            {uniqueCoverCount < items.length
              ? `${items.length} placements · ${uniqueCoverCount} covers`
              : `${items.length} covers`} · r{proposal.revision}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            variant="outline"
            size="icon-lg"
            disabled={zoom <= MIN_ZOOM}
            onClick={() => {
              fitToWidthRef.current = false;
              setZoom((current) => clamp(current - ZOOM_STEP, MIN_ZOOM, MAX_ZOOM));
            }}
            aria-label="Zoom cover canvas out"
          >
            <ZoomOutIcon />
          </Button>
          <Button
            variant="outline"
            size="default"
            onClick={fitCanvasWidth}
          >
            <Maximize2Icon data-icon="inline-start" />
            Fit
          </Button>
          <span className="min-w-14 text-center text-base font-semibold">{Math.round(zoom * 100)}%</span>
          <Button
            variant="outline"
            size="icon-lg"
            disabled={zoom >= MAX_ZOOM}
            onClick={() => {
              fitToWidthRef.current = false;
              setZoom((current) => clamp(current + ZOOM_STEP, MIN_ZOOM, MAX_ZOOM));
            }}
            aria-label="Zoom cover canvas in"
          >
            <ZoomInIcon />
          </Button>
          <Button
            variant={readableCovers ? "secondary" : "outline"}
            size="default"
            aria-pressed={readableCovers}
            onClick={() => setReadableCovers((current) => !current)}
          >
            {readableCovers ? "Readable preview" : "Exact preview"}
          </Button>
        </div>
      </header>

      <div
        ref={viewportRef}
        data-testid="cover-layout-viewport"
        className="min-h-0 flex-1 overflow-auto overscroll-contain p-2"
        onWheel={(event) => {
          if (!event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
          event.currentTarget.scrollLeft += event.deltaY;
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        <div
          ref={canvasRef}
          data-testid="cover-layout-canvas"
          className="relative shrink-0 overflow-hidden rounded-lg border border-[var(--chrome-line-strong)] bg-[var(--chrome-panel)] shadow-inner outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          style={{
            width: proposal.canvas.width * zoom,
            height: proposal.canvas.height * zoom,
            backgroundImage: "linear-gradient(var(--chrome-line) 1px, transparent 1px), linear-gradient(90deg, var(--chrome-line) 1px, transparent 1px)",
            backgroundSize: `${120 * zoom}px ${120 * zoom}px`,
          }}
          tabIndex={0}
          aria-label="Editable cover composition"
          onPointerMove={moveInteraction}
          onPointerUp={endInteraction}
          onPointerCancel={endInteraction}
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) setSelectedIds(new Set());
          }}
          onKeyDown={(event) => {
            const amount = event.shiftKey ? 10 : 1;
            if (event.key === "ArrowLeft") nudgeSelection(-amount, 0);
            else if (event.key === "ArrowRight") nudgeSelection(amount, 0);
            else if (event.key === "ArrowUp") nudgeSelection(0, -amount);
            else if (event.key === "ArrowDown") nudgeSelection(0, amount);
            else return;
            event.preventDefault();
          }}
        >
          {items.map((item) => {
            const selected = selectedIds.has(item.id);
            const exactWidth = item.width * zoom;
            const exactHeight = item.height * zoom;
            const displayWidth = readableCovers ? Math.max(16, exactWidth) : exactWidth;
            const displayHeight = readableCovers
              ? Math.max(24, displayWidth * 1.5)
              : exactHeight;
            return (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                aria-label={`Select cover ${item.id}`}
                aria-pressed={selected}
                className="absolute cursor-grab touch-none bg-transparent active:cursor-grabbing"
                style={{
                  left: item.x * zoom - displayWidth / 2,
                  top: item.y * zoom - displayHeight / 2,
                  width: displayWidth,
                  height: displayHeight,
                  transform: `rotate(${item.rotation}deg)`,
                  transformOrigin: "center",
                  zIndex: selected ? 20 : 1,
                  outline: selected ? `${Math.max(2, 3 * zoom)}px solid var(--ink)` : "none",
                  outlineOffset: Math.max(1, 2 * zoom),
                }}
                onPointerDown={(event) => beginDrag(event, item.id)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  setSelectedIds(new Set([item.id]));
                }}
              >
                <img
                  src={`/api/projects/${encodeURIComponent(projectId)}/layout-proposals/${encodeURIComponent(layoutId)}/covers/${encodeURIComponent(item.id)}`}
                  alt=""
                  draggable={false}
                  className="size-full object-cover"
                />
                {selected && selectedIds.size === 1 && (
                  <>
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute left-1/2 top-[-1.75rem] h-7 w-px -translate-x-1/2 bg-foreground"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon-sm"
                      aria-label="Rotate selected cover"
                      className="absolute left-1/2 top-[-2.8rem] -translate-x-1/2 cursor-grab rounded-full shadow-lg"
                      onPointerDown={(event) => beginTransform(event, item, "rotate")}
                    >
                      <RotateCwIcon />
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon-sm"
                      aria-label="Resize selected cover"
                      className="absolute bottom-[-0.8rem] right-[-0.8rem] cursor-nwse-resize rounded-full shadow-lg"
                      onPointerDown={(event) => beginTransform(event, item, "resize")}
                    >
                      <Maximize2Icon />
                    </Button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <footer className="flex flex-col gap-2 border-t border-[var(--chrome-line)] bg-[var(--chrome-panel)] px-3 py-2">
        {selectedItem && (
          <div className="rounded-lg border border-[var(--chrome-line)] bg-[var(--chrome-deep)] p-2">
            <div className="mb-2 flex items-center gap-2">
              <h3 className="text-base font-bold">Transform</h3>
              <span className="ml-auto text-[0.92rem] text-[var(--ink-secondary)]">
                {selectedItem.word ? `${selectedItem.word} · ` : ""}
                {selectedItem.group ?? "cover"}
              </span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {([
                ["X", "x"],
                ["Y", "y"],
                ["Width", "width"],
                ["Height", "height"],
                ["Rotation", "rotation"],
              ] as const).map(([label, property]) => (
                <label key={property} className="flex min-w-0 flex-col gap-1 text-[0.92rem] font-semibold">
                  <span>{label}</span>
                  <Input
                    type="number"
                    value={Number(selectedItem[property].toFixed(1))}
                    step={property === "rotation" ? 1 : 0.5}
                    className="bg-[var(--chrome-panel)] text-base text-[var(--ink)] md:text-base"
                    onFocus={() => {
                      inputHistoryStartRef.current = cloneCoverLayoutItems(itemsRef.current);
                    }}
                    onChange={(event) => updateSelectedItem(property, event.currentTarget.valueAsNumber)}
                    onBlur={() => {
                      if (!inputHistoryStartRef.current) return;
                      recordLayoutChange(inputHistoryStartRef.current, itemsRef.current);
                      inputHistoryStartRef.current = null;
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                    }}
                  />
                </label>
              ))}
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-auto flex items-center gap-2 text-base">
            {dirty ? (
              <span className="font-semibold">Unsaved changes</span>
            ) : (
              <>
                <CheckIcon aria-hidden="true" />
                <span>Saved</span>
              </>
            )}
            {selectedIds.size > 0 && (
              <span className="text-[var(--ink-secondary)]">{selectedIds.size} selected</span>
            )}
          </div>
          <Button
            variant="outline"
            size="default"
            aria-label="Reset draft to last saved layout"
            disabled={!dirty}
            onClick={() => applyRecordedItems(proposal.items)}
          >
            <RotateCcwIcon data-icon="inline-start" />
            Reset
          </Button>
          <Button
            variant="outline"
            size="default"
            aria-label="Restore generated layout"
            onClick={() => applyRecordedItems(proposal.generated_items)}
          >
            Generated
          </Button>
          <Button
            size="default"
            aria-label="Save cover layout"
            disabled={!dirty || saving}
            onClick={() => void save()}
          >
            <SaveIcon data-icon="inline-start" />
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
        {error && <p className="text-base text-[var(--destructive)]">{error}</p>}
      </footer>
    </section>
  );
}
