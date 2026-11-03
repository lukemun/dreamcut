import { HISTORY_ACTION_HEADER, HISTORY_LABEL_HEADER, type HistoryAction } from "@/lib/timeline/history-label";

/**
 * Marks the project writes made while an Undo/Redo step replays so saved history
 * records "Undo: …" / "Redo: …" instead of a new forward edit. Labelling only:
 * the replayed requests, routes and safety checks are unchanged.
 */
let active: { action: HistoryAction; label: string } | null = null;

export async function runHistoryReplay<T>(action: HistoryAction, label: string, run: () => Promise<T>): Promise<T> {
  const previous = active;
  active = { action, label };
  try {
    return await run();
  } finally {
    active = previous;
  }
}

export function historyReplayRequestInit(init?: RequestInit): RequestInit | undefined {
  if (!active || !init?.method || init.method.toUpperCase() === "GET") return init;
  const headers = new Headers(init.headers);
  headers.set(HISTORY_ACTION_HEADER, active.action);
  headers.set(HISTORY_LABEL_HEADER, encodeURIComponent(active.label));
  return { ...init, headers };
}
