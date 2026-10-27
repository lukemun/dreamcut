"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { BeatMarker, TimelineElement, TimelineTransition } from "./types";

export type PatchHistoryEntry = {
  type: "patch";
  elementId: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
};

export type BatchPatchHistoryEntry = {
  type: "batch_patch";
  patches: Array<{
    elementId: string;
    before: Record<string, unknown>;
    after: Record<string, unknown>;
  }>;
};

export type DeleteHistoryEntry = {
  type: "delete";
  element: TimelineElement;
};

export type CreateHistoryEntry = {
  type: "create";
  element: TimelineElement;
};

export type SplitHistoryEntry = {
  type: "split";
  originalId: string;
  beforePatch: Record<string, unknown>;
  afterPatch: Record<string, unknown>;
  insertedElement: TimelineElement;
};

export type LaneStructureSnapshot = {
  laneOrderKeys: string[];
  laneManualDeltaByKey: Record<string, number>;
};

export type LaneStructureHistoryEntry = {
  type: "lane_structure";
  before: LaneStructureSnapshot;
  after: LaneStructureSnapshot;
  deletedElements?: TimelineElement[];
};

export type TransitionMutationHistoryEntry = {
  type: "transition_mutation";
  before: TimelineTransition | null;
  after: TimelineTransition | null;
};

export type BeatDurationsHistoryEntry = {
  type: "beat_durations";
  updates: Array<{
    beatId: BeatMarker["id"];
    before: number;
    after: number;
  }>;
};

export type CaptionLaneStyleHistoryEntry = {
  type: "caption_lane_style";
  laneKey: string;
  updates: Array<{
    elementId: TimelineElement["id"];
    beforeProps: Record<string, unknown>;
    afterProps: Record<string, unknown>;
  }>;
};

export type SnapshotHistoryEntry = {
  type: "snapshot";
  beforeSnapshotId: string;
  afterSnapshotId: string;
  label: string;
};

export type HistoryEntry =
  | PatchHistoryEntry
  | BatchPatchHistoryEntry
  | DeleteHistoryEntry
  | CreateHistoryEntry
  | SplitHistoryEntry
  | LaneStructureHistoryEntry
  | TransitionMutationHistoryEntry
  | BeatDurationsHistoryEntry
  | CaptionLaneStyleHistoryEntry
  | SnapshotHistoryEntry;

function historyEntryKey(entry: HistoryEntry) {
  return entry.type === "snapshot"
    ? `snapshot:${entry.beforeSnapshotId}:${entry.afterSnapshotId}`
    : null;
}

export function mergeInitialHistoryEntries(stack: HistoryEntry[], entries: HistoryEntry[], maxEntries = 50) {
  const existingKeys = new Set(stack.map(historyEntryKey).filter((value): value is string => value != null));
  let next = [...stack];
  for (const entry of entries) {
    const key = historyEntryKey(entry);
    if (key && existingKeys.has(key)) continue;
    next = pushHistoryEntry(next, entry, maxEntries);
    if (key) existingKeys.add(key);
  }
  return next;
}

export function pushHistoryEntry(
  stack: HistoryEntry[],
  entry: HistoryEntry,
  maxEntries = 50,
) {
  return [...stack.slice(-(maxEntries - 1)), entry];
}

export function moveHistoryStacks(
  source: "undo" | "redo",
  undoStack: HistoryEntry[],
  redoStack: HistoryEntry[],
  entry: HistoryEntry,
) {
  if (source === "undo") {
    return {
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, entry],
    };
  }

  return {
    undoStack: [...undoStack, entry],
    redoStack: redoStack.slice(0, -1),
  };
}

function readStoredHistory(storageKey: string | undefined): { undo: HistoryEntry[]; redo: HistoryEntry[] } {
  if (!storageKey || typeof window === "undefined") return { undo: [], redo: [] };
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(storageKey) ?? "null") as { undo?: unknown; redo?: unknown } | null;
    return {
      undo: Array.isArray(parsed?.undo) ? parsed.undo as HistoryEntry[] : [],
      redo: Array.isArray(parsed?.redo) ? parsed.redo as HistoryEntry[] : [],
    };
  } catch {
    return { undo: [], redo: [] };
  }
}

const HISTORY_STORAGE_BUDGET_BYTES = 768 * 1024;

function serializedBytes(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

/**
 * sessionStorage is only a reload convenience; the file-backed history folder
 * remains the durable authority. Keep the newest actionable entries from each
 * stack and discard oldest cache rows until this project fits a bounded share
 * of the browser quota.
 */
export function compactHistoryForStorage(
  undo: HistoryEntry[],
  redo: HistoryEntry[],
  maxBytes = HISTORY_STORAGE_BUDGET_BYTES,
) {
  let compactUndo = [...undo];
  let compactRedo = [...redo];
  while (serializedBytes({ undo: compactUndo, redo: compactRedo }) > maxBytes) {
    if (compactUndo.length === 0 && compactRedo.length === 0) break;
    if (compactUndo.length >= compactRedo.length && compactUndo.length > 0) compactUndo = compactUndo.slice(1);
    else compactRedo = compactRedo.slice(1);
  }
  return { undo: compactUndo, redo: compactRedo };
}

export function useTimelineHistory(options: { maxEntries?: number; storageKey?: string; initialEntries?: HistoryEntry[] } = {}) {
  const maxEntries = options.maxEntries ?? 50;
  const initial = useRef<{ undo: HistoryEntry[]; redo: HistoryEntry[] } | null>(null);
  if (initial.current == null) {
    const stored = readStoredHistory(options.storageKey);
    initial.current = {
      undo: mergeInitialHistoryEntries(stored.undo, options.initialEntries ?? [], maxEntries),
      redo: (options.initialEntries?.length ?? 0) > 0 ? [] : stored.redo,
    };
  }
  const undoStackRef = useRef<HistoryEntry[]>(initial.current.undo);
  const redoStackRef = useRef<HistoryEntry[]>(initial.current.redo);
  const historyActionInFlightRef = useRef(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [, setHistoryTick] = useState(0);

  const persist = useCallback((undo: HistoryEntry[], redo: HistoryEntry[]) => {
    if (!options.storageKey || typeof window === "undefined") return;
    // A timeline mutation must never fail because the optional browser cache is
    // full. Retry with progressively smaller newest-first slices; if the origin
    // is completely saturated, clear only this stale cache key. The live
    // in-memory stacks and server-side history snapshots remain intact.
    let budget = HISTORY_STORAGE_BUDGET_BYTES;
    for (let attempt = 0; attempt < 7; attempt += 1) {
      const compacted = compactHistoryForStorage(undo, redo, budget);
      try {
        window.sessionStorage.setItem(options.storageKey, JSON.stringify(compacted));
        return;
      } catch {
        budget = Math.max(1024, Math.floor(budget / 2));
      }
    }
    try {
      window.sessionStorage.removeItem(options.storageKey);
    } catch {
      // Storage may be unavailable (privacy mode or a disabled origin). Undo
      // still works for the mounted editor through the in-memory refs above.
    }
  }, [options.storageKey]);

  useEffect(() => {
    persist(undoStackRef.current, redoStackRef.current);
  }, [persist, redoStackRef, undoStackRef]);

  useEffect(() => {
    if (!options.initialEntries || options.initialEntries.length === 0) return;
    const nextUndo = mergeInitialHistoryEntries(
      undoStackRef.current,
      options.initialEntries,
      maxEntries,
    );
    const changed = nextUndo.length !== undoStackRef.current.length
      || nextUndo.some((entry, index) => entry !== undoStackRef.current[index]);
    if (!changed) return;
    undoStackRef.current = nextUndo;
    redoStackRef.current = [];
    persist(nextUndo, []);
    setHistoryTick((value) => value + 1);
  }, [maxEntries, options.initialEntries, persist]);

  const recordHistoryEntry = useCallback((entry: HistoryEntry) => {
    undoStackRef.current = pushHistoryEntry(undoStackRef.current, entry, maxEntries);
    redoStackRef.current = [];
    persist(undoStackRef.current, redoStackRef.current);
    setHistoryTick((value) => value + 1);
  }, [maxEntries, persist]);

  const moveHistoryEntry = useCallback((source: "undo" | "redo", entry: HistoryEntry) => {
    const next = moveHistoryStacks(source, undoStackRef.current, redoStackRef.current, entry);
    undoStackRef.current = next.undoStack;
    redoStackRef.current = next.redoStack;
    persist(next.undoStack, next.redoStack);
    setHistoryTick((value) => value + 1);
  }, [persist]);

  return {
    undoStackRef,
    redoStackRef,
    historyActionInFlightRef,
    historyBusy,
    setHistoryBusy,
    recordHistoryEntry,
    moveHistoryEntry,
    canUndo: undoStackRef.current.length > 0,
    canRedo: redoStackRef.current.length > 0,
  };
}
