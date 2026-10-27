/**
 * When the chat panel spends the browser's connections while the editor loads. Starting an agent
 * session (editing tools, the agent's own server, its thread) takes seconds and holds one of the six
 * connections per host, so the automatic connect waits until the project's timeline (or storyboard) has arrived, the
 * preview has its first picture, and the page is next idle. Typing (composer focus) or sending
 * connects at once.
 */

export type SettleEnvironment = {
  /** Calls `seen` once a finished resource matches `matches`, including ones already loaded. Returns a stop. */
  watchResources(matches: (name: string) => boolean, seen: () => void): () => void;
  /** Runs `run` when the page is next idle, or after `timeoutMs` at the latest. Returns a cancel. */
  idle(run: () => void, timeoutMs: number): () => void;
  /** Runs `run` after `ms`. Returns a cancel. */
  after(run: () => void, ms: number): () => void;
  /** Whether the preview is still loading its first picture (false on a page without a player). */
  previewWarming(): boolean;
};

const PREVIEW_CHECK_MS = 500;

/** The view's first large load: the editor's timeline payload, or the Storyboard's. */
export const timelineResourceMatcher = (projectId: string) => {
  const base = `/api/projects/${encodeURIComponent(projectId)}`;
  const paths = new Set([`${base}/timeline`, `${base}/storyboard`]);
  return (name: string) => {
    try { return paths.has(new URL(name, "http://local").pathname); } catch { return false; }
  };
};

/**
 * Runs `run` once, after the timeline payload has arrived, the preview has stopped warming and the
 * page is next idle (at most `idleTimeoutMs` later), or after `maxWaitMs` at the latest. Returns a cancel.
 */
export function whenEditorSettled(projectId: string, run: () => void, { env = browserSettleEnvironment(), idleTimeoutMs = 3_000, maxWaitMs = 20_000 }: { env?: SettleEnvironment; idleTimeoutMs?: number; maxWaitMs?: number } = {}) {
  let done = false;
  const stops: (() => void)[] = [];
  const stop = () => { for (const item of stops.splice(0)) item(); };
  const fire = () => { if (done) return; done = true; stop(); run(); };
  stops.push(env.after(fire, maxWaitMs));
  let waiting = false;
  // Checked again once idle: the player can mount (warming) while the payload is being rendered.
  const afterPreview = () => {
    if (done) return;
    if (env.previewWarming()) { stops.push(env.after(afterPreview, PREVIEW_CHECK_MS)); return; }
    stops.push(env.idle(() => { if (env.previewWarming()) afterPreview(); else fire(); }, idleTimeoutMs));
  };
  stops.push(env.watchResources(timelineResourceMatcher(projectId), () => {
    if (done || waiting) return;
    waiting = true;
    afterPreview();
  }));
  return () => { done = true; stop(); };
}

export function browserSettleEnvironment(): SettleEnvironment {
  return {
    watchResources(matches, seen) {
      if (typeof PerformanceObserver === "undefined") return () => {};
      // `buffered` includes a payload that arrived before the panel mounted.
      const observer = new PerformanceObserver(list => { if (list.getEntries().some(entry => matches(entry.name))) seen(); });
      try { observer.observe({ type: "resource", buffered: true }); } catch { return () => {}; }
      return () => observer.disconnect();
    },
    idle(run, timeoutMs) {
      if (typeof requestIdleCallback === "function") { const id = requestIdleCallback(run, { timeout: timeoutMs }); return () => cancelIdleCallback(id); }
      const id = setTimeout(run, 0); return () => clearTimeout(id);
    },
    after(run, ms) { const id = setTimeout(run, ms); return () => clearTimeout(id); },
    // The player's readiness gate (TimelinePlaybackShell) is "warming" until its first picture can show.
    previewWarming: () => document.querySelector("[data-preview-state]")?.getAttribute("data-preview-state") === "warming",
  };
}

type Choice = { provider: string; available: boolean; authentication: string };

/** Whether the panel should connect its chosen agent on its own now. */
export function shouldAutoConnect({ available, connected, choice, settled, wanted }: { available: boolean; connected: boolean; choice?: Choice; settled: boolean; wanted: boolean }) {
  if (!available || connected || !choice?.available || choice.authentication === "signed-out") return false;
  return settled || wanted;
}

/**
 * Which agents' model lists to request. On load only the chosen agent's, which names the model on
 * the chip; the others when the picker is about to open. Each agent is asked once per panel.
 */
export function modelsToFetch(providers: readonly Choice[], { chosen, picker, requested }: { chosen?: string; picker: boolean; requested: ReadonlySet<string> }) {
  return providers.filter(item => item.available && !requested.has(item.provider) && (picker || item.provider === chosen)).map(item => item.provider);
}
