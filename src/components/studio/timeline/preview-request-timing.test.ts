import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";

import { describePreviewTiming, fetchPreviewJson } from "./preview-request-timing";

const page = { visibilityState: "visible" as "visible" | "hidden", listeners: new Set<() => void>() };
const warnings: string[] = [];

beforeEach(() => {
  page.visibilityState = "visible";
  page.listeners.clear();
  warnings.length = 0;
  mock.timers.enable({ apis: ["setInterval", "setTimeout"] });
  Object.assign(globalThis, {
    window: { setInterval, clearInterval, location: { href: "http://127.0.0.1:3123/p/demo" } },
    document: {
      get visibilityState() { return page.visibilityState; },
      addEventListener: (_type: string, listener: () => void) => page.listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => page.listeners.delete(listener),
    },
  });
  mock.method(console, "warn", (line: string) => { warnings.push(line); });
});

afterEach(() => {
  mock.timers.reset();
  mock.restoreAll();
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { document?: unknown }).document;
});

const setVisibility = (state: "visible" | "hidden") => { page.visibilityState = state; for (const listener of page.listeners) listener(); };

/** A fetch that answers only when told to, and honours its abort signal like the browser does. */
function pendingFetch() {
  let answer: (response: Response) => void = () => {};
  const fetcher = ((_url: string, init: RequestInit) => new Promise<Response>((resolve, reject) => {
    answer = resolve;
    init.signal?.addEventListener("abort", () => reject(init.signal!.reason));
  })) as typeof fetch;
  return { fetcher, answer: (body: unknown) => answer(Response.json(body, { headers: { "Server-Timing": "app;dur=12.5" } })) };
}

test("a preview that stays loading while the page is visible fails with a TimeoutError and logs its phases", async () => {
  const { fetcher } = pendingFetch();
  const loading = fetchPreviewJson("p1/teal", "/preview", {}, response => response.json(), fetcher);
  mock.timers.tick(15_500);
  await assert.rejects(loading, (error: Error) => error.name === "TimeoutError");
  assert.equal(warnings.length, 1);
  assert.match(warnings[0]!, /p1\/teal timeout after .*server \?/);
});

test("time spent hidden never counts against the budget, so a paused preview still loads", async () => {
  const { fetcher, answer } = pendingFetch();
  const loading = fetchPreviewJson("p1/teal", "/preview", {}, response => response.json(), fetcher);
  mock.timers.tick(10_000);
  setVisibility("hidden");
  mock.timers.tick(60_000);
  setVisibility("visible");
  mock.timers.tick(4_000);
  answer({ ok: true });
  assert.deepEqual(await loading, { ok: true });
});

test("the phase line names the queue, server, waiting, reading and hidden times", () => {
  assert.equal(describePreviewTiming({
    label: "p1/teal", totalMs: 16_000, hiddenMs: 0, queuedMs: 14_200.4, serverMs: 12.5, waitingMs: 40, readMs: null, outcome: "timeout",
  }), "p1/teal timeout after 16000ms: queued 14200ms, server 13ms, waiting 40ms, reading ?, hidden 0ms");
});
