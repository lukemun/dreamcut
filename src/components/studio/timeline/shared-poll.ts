/**
 * One polling subscription per resource, shared by every UI surface that
 * reads it. Polling runs only while someone is subscribed and the document is
 * visible; becoming visible again refreshes immediately. Loads are
 * conditional (If-None-Match), so an unchanged resource costs one empty 304
 * and never re-notifies subscribers.
 */

export type ConditionalResult<T> =
  | { notModified: true }
  | { notModified: false; value: T; etag: string | null };

export type PollEnvironment = {
  isHidden(): boolean;
  /** Calls back when the document becomes visible (or the window regains focus). */
  onVisible(callback: () => void): () => void;
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
};

export type PollDelivery = { requestId: number; forced: boolean };
export type PollListener<T> = (value: T, delivery: PollDelivery) => void;

export type SharedPoll<T> = {
  subscribe(listener: PollListener<T>, onError?: (error: unknown) => void): () => void;
  /**
   * Load now. `force` skips the conditional header and always delivers the
   * fresh value; resolves with it (or null when unchanged), rejects on failure.
   * `joinInFlight` reuses an already running forced load (e.g. a first mount)
   * instead of queuing another; never use it after a local decision.
   */
  refresh(options?: { force?: boolean; joinInFlight?: boolean }): Promise<T | null>;
  current(): T | undefined;
  /** Highest request id issued so far; results at or below it predate any later decision. */
  issuedRequestId(): number;
};

export function browserPollEnvironment(): PollEnvironment {
  return {
    isHidden: () => typeof document !== "undefined" && document.visibilityState === "hidden",
    onVisible(callback) {
      const onVisibility = () => { if (document.visibilityState === "visible") callback(); };
      document.addEventListener("visibilitychange", onVisibility);
      window.addEventListener("focus", onVisibility);
      return () => {
        document.removeEventListener("visibilitychange", onVisibility);
        window.removeEventListener("focus", onVisibility);
      };
    },
    setTimeout: (callback, ms) => window.setTimeout(callback, ms),
    clearTimeout: (handle) => window.clearTimeout(handle as number),
  };
}

export function createSharedPoll<T>({
  load,
  intervalMs,
  env = browserPollEnvironment(),
}: {
  load: (etag: string | null) => Promise<ConditionalResult<T>>;
  intervalMs: number;
  env?: PollEnvironment;
}): SharedPoll<T> {
  const subscribers = new Set<{ listener: PollListener<T>; onError?: (error: unknown) => void }>();
  let value: T | undefined;
  let hasValue = false;
  let etag: string | null = null;
  let timer: unknown = null;
  let stopVisibility: (() => void) | null = null;
  let inFlight: Promise<T | null> | null = null;
  let inFlightForced = false;
  let queued: { force: boolean; promise: Promise<T | null> } | null = null;
  let issued = 0;

  const clearTimer = () => { if (timer !== null) { env.clearTimeout(timer); timer = null; } };
  const schedule = () => {
    clearTimer();
    if (subscribers.size === 0 || env.isHidden()) return;
    timer = env.setTimeout(() => {
      timer = null;
      // Hidden: stop here; the visibility listener resumes with an immediate load.
      if (!env.isHidden()) void run(false).catch(() => undefined);
    }, intervalMs);
  };

  const execute = async (force: boolean): Promise<T | null> => {
    const requestId = ++issued;
    try {
      const result = await load(force || !hasValue ? null : etag);
      if (result.notModified) {
        if (force || !hasValue) throw new Error("Unconditional load returned 304");
        return null;
      }
      value = result.value; hasValue = true; etag = result.etag;
      for (const { listener } of [...subscribers]) listener(result.value, { requestId, forced: force });
      return result.value;
    } catch (error) {
      for (const { onError } of [...subscribers]) onError?.(error);
      throw error;
    }
  };

  const run = (force: boolean, joinInFlight = false): Promise<T | null> => {
    if (inFlight && joinInFlight && inFlightForced) return inFlight;
    if (inFlight) {
      // Coalesce: at most one follow-up, upgraded to forced if any caller asked.
      if (queued) { queued.force ||= force; return queued.promise; }
      const follow = { force, promise: null as unknown as Promise<T | null> };
      follow.promise = inFlight.catch(() => null).then(() => { queued = null; return run(follow.force); });
      queued = follow;
      return follow.promise;
    }
    clearTimer();
    inFlightForced = force || !hasValue;
    inFlight = execute(force).finally(() => { inFlight = null; schedule(); });
    return inFlight;
  };

  const onVisible = () => { if (subscribers.size > 0) void run(false).catch(() => undefined); };

  return {
    subscribe(listener, onError) {
      const entry = { listener, onError };
      subscribers.add(entry);
      // A late subscriber starts from the shared copy; later changes arrive by poll.
      if (hasValue) listener(value as T, { requestId: issued, forced: false });
      if (subscribers.size === 1) {
        stopVisibility = env.onVisible(onVisible);
        if (!env.isHidden() || !hasValue) void run(!hasValue).catch(() => undefined);
      }
      return () => {
        subscribers.delete(entry);
        if (subscribers.size === 0) { clearTimer(); stopVisibility?.(); stopVisibility = null; }
      };
    },
    refresh: ({ force = false, joinInFlight = false } = {}) => run(force, joinInFlight),
    current: () => value,
    issuedRequestId: () => issued,
  };
}

/** One shared poll per key for the page lifetime; idle (unsubscribed) polls cost nothing. */
const registry = new Map<string, SharedPoll<unknown>>();
export function sharedPoll<T>(key: string, create: () => SharedPoll<T>): SharedPoll<T> {
  let poll = registry.get(key) as SharedPoll<T> | undefined;
  if (!poll) { poll = create(); registry.set(key, poll as SharedPoll<unknown>); }
  return poll;
}

/** GET JSON with If-None-Match; a 304 means the caller's copy is still current. */
export async function fetchConditionalJson<T>(url: string, etag: string | null, fetcher: typeof fetch = fetch): Promise<ConditionalResult<T>> {
  const response = await fetcher(url, { cache: "no-store", headers: etag ? { "If-None-Match": etag } : undefined });
  if (response.status === 304) return { notModified: true };
  const body = await response.json().catch(() => ({})) as T & { error?: unknown };
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : `Request failed (${response.status})`);
  return { notModified: false, value: body, etag: response.headers.get("etag") };
}

/** The project's timeline revision marker, polled to detect external edits. */
export type ProjectRevisionState = { rev?: number; external_rev?: number; history?: { id?: string; op?: string; at?: string } | null };
export function projectRevisionPoll(projectId: string) {
  return sharedPoll(`project-revision:${projectId}`, () => createSharedPoll<ProjectRevisionState>({
    intervalMs: 2_000,
    load: (etag) => fetchConditionalJson(`/api/projects/${encodeURIComponent(projectId)}/revision`, etag),
  }));
}

/** Library handoff state, shared by the project shell and the Library catalog. */
export type LibraryPresentationState = { presentation: { id: string } | null } & Record<string, unknown>;
export function libraryPresentationPoll(projectId: string) {
  return sharedPoll(`library-presentation:${projectId}`, () => createSharedPoll<LibraryPresentationState>({
    intervalMs: 2_500,
    load: (etag) => fetchConditionalJson(`/api/projects/${encodeURIComponent(projectId)}/library-presentation`, etag),
  }));
}

/** Generation workspace + jobs, shared by the Generate drawer and the draft review. */
export function assetGenerationPoll<T = { workspace: { draft: unknown } } & Record<string, unknown>>(projectId: string) {
  return sharedPoll(`asset-generation:${projectId}`, () => createSharedPoll<T>({
    intervalMs: 3_000,
    load: (etag) => fetchConditionalJson(`/api/projects/${encodeURIComponent(projectId)}/asset-generation`, etag),
  }));
}
