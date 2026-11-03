"use client";

/** A draft preview that is still loading after this much visible time gives up with a TimeoutError. */
const VISIBLE_BUDGET_MS = 15_000;
const BUDGET_TICK_MS = 500;
/** Loads at least this slow report where their time went, even when they succeed. */
const SLOW_MS = 3_000;

export type PreviewRequestTiming = {
  label: string;
  totalMs: number;
  /** Time the page spent hidden; a hidden page pauses, so this time never counts against the budget. */
  hiddenMs: number;
  /** Waiting in the browser before the request was sent (connection queue). */
  queuedMs: number | null;
  /** The server's own handling time, from its Server-Timing header. */
  serverMs: number | null;
  /** From sending until the response headers arrived (includes serverMs). */
  waitingMs: number | null;
  /** Reading and parsing the response body. */
  readMs: number | null;
  outcome: "ok" | "timeout" | "error";
};

const round = (ms: number | null) => ms == null ? null : Math.round(ms);

/** One line naming each phase, so a slow preview shows whether the browser, the server or the page held it up. */
export function describePreviewTiming(timing: PreviewRequestTiming) {
  const part = (name: string, ms: number | null) => `${name} ${ms == null ? "?" : `${round(ms)}ms`}`;
  return `${timing.label} ${timing.outcome} after ${round(timing.totalMs)}ms: ${[
    part("queued", timing.queuedMs), part("server", timing.serverMs), part("waiting", timing.waitingMs),
    part("reading", timing.readMs), part("hidden", timing.hiddenMs),
  ].join(", ")}`;
}

function serverDuration(response: Response) {
  const match = /(?:^|,)\s*app;dur=([\d.]+)/.exec(response.headers.get("server-timing") ?? "");
  return match ? Number(match[1]) : null;
}

function queuedDuration(url: string, startedAt: number) {
  const absolute = new URL(url, window.location.href).href;
  const entry = performance.getEntriesByName(absolute, "resource")
    .filter((candidate): candidate is PerformanceResourceTiming => candidate instanceof PerformanceResourceTiming && candidate.startTime >= startedAt - 1)
    .at(-1);
  return entry && entry.requestStart > 0 ? entry.requestStart - entry.startTime : null;
}

/**
 * Fetch and parse a draft preview. The budget counts only time the page is visible, so a load
 * that was paused in a hidden tab or pane does not fail when the creator looks again.
 */
export async function fetchPreviewJson<T>(
  label: string,
  url: string,
  init: RequestInit,
  read: (response: Response) => Promise<T>,
  fetcher: typeof fetch = fetch,
): Promise<T> {
  const controller = new AbortController();
  const startedAt = performance.now();
  let hiddenMs = 0;
  let hiddenSince = document.visibilityState === "hidden" ? startedAt : null;
  const onVisibility = () => {
    const now = performance.now();
    if (document.visibilityState === "hidden") hiddenSince ??= now;
    else if (hiddenSince != null) { hiddenMs += now - hiddenSince; hiddenSince = null; }
  };
  const hiddenSoFar = () => hiddenMs + (hiddenSince == null ? 0 : performance.now() - hiddenSince);
  document.addEventListener("visibilitychange", onVisibility);
  // The budget advances only on ticks that run while the page is visible: a hidden or paused page never spends it.
  let visibleMs = 0;
  const timer = window.setInterval(() => {
    if (document.visibilityState === "hidden") return;
    visibleMs += BUDGET_TICK_MS;
    if (visibleMs > VISIBLE_BUDGET_MS) controller.abort(new DOMException("Preview took too long to load.", "TimeoutError"));
  }, BUDGET_TICK_MS);
  let headersAt: number | null = null;
  let response: Response | null = null;
  const report = (outcome: PreviewRequestTiming["outcome"]) => {
    const now = performance.now();
    const totalMs = now - startedAt;
    if (outcome === "ok" && totalMs < SLOW_MS) return;
    const queuedMs = queuedDuration(url, startedAt);
    const timing: PreviewRequestTiming = {
      label, totalMs, hiddenMs: hiddenSoFar(), queuedMs,
      serverMs: response ? serverDuration(response) : null,
      waitingMs: headersAt == null ? null : headersAt - startedAt - (queuedMs ?? 0),
      readMs: headersAt == null ? null : now - headersAt,
      outcome,
    };
    console.warn(`[proposal preview] ${describePreviewTiming(timing)}`);
  };
  try {
    response = await fetcher(url, { ...init, signal: controller.signal });
    headersAt = performance.now();
    // Parse inside the budget too: a body that never finishes reading is the same stall.
    const value = await read(response);
    controller.signal.throwIfAborted();
    report("ok");
    return value;
  } catch (error) {
    const reason = controller.signal.aborted ? controller.signal.reason : error;
    report(reason instanceof DOMException && reason.name === "TimeoutError" ? "timeout" : "error");
    throw reason;
  } finally {
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisibility);
  }
}
