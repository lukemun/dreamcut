import assert from "node:assert/strict";
import test from "node:test";

import { modelsToFetch, shouldAutoConnect, timelineResourceMatcher, whenEditorSettled, type SettleEnvironment } from "./chat-load-policy";

/** A page whose resource arrivals, idle moments and timers the test drives by hand. */
function fakePage() {
  const watchers: { matches: (name: string) => boolean; seen: () => void }[] = [];
  const idles: { run: () => void; timeoutMs: number }[] = [];
  const timers: { run: () => void; ms: number }[] = [];
  const preview = { warming: false };
  const env: SettleEnvironment = {
    previewWarming: () => preview.warming,
    watchResources(matches, seen) { const item = { matches, seen }; watchers.push(item); return () => { watchers.splice(watchers.indexOf(item), 1); }; },
    idle(run, timeoutMs) { const item = { run, timeoutMs }; idles.push(item); return () => { idles.splice(idles.indexOf(item), 1); }; },
    after(run, ms) { const item = { run, ms }; timers.push(item); return () => { timers.splice(timers.indexOf(item), 1); }; },
  };
  return {
    env, idles, timers, watchers, preview,
    load(name: string) { for (const item of [...watchers]) if (item.matches(name)) item.seen(); },
    goIdle() { for (const item of idles.splice(0)) item.run(); },
    /** Runs the timers due within `ms`. */
    timeout(ms = Infinity) { for (const item of timers.filter(timer => timer.ms <= ms)) { timers.splice(timers.indexOf(item), 1); item.run(); } },
  };
}

test("the automatic connect waits for the timeline payload, then the next idle moment", () => {
  const page = fakePage();
  let runs = 0;
  whenEditorSettled("week-recap", () => runs++, { env: page.env });
  page.goIdle();
  page.load("http://127.0.0.1:3123/api/projects/week-recap/revision");
  page.load("http://127.0.0.1:3123/api/projects/other/timeline");
  assert.equal(runs, 0);
  assert.equal(page.idles.length, 0);
  page.load("http://127.0.0.1:3123/api/projects/week-recap/timeline?selection=1");
  page.load("http://127.0.0.1:3123/api/projects/week-recap/timeline");
  assert.equal(page.idles.length, 1, "one idle wait however many timeline reads arrive");
  assert.equal(page.idles[0].timeoutMs, 3_000);
  page.goIdle();
  assert.equal(runs, 1);
  assert.equal(page.watchers.length + page.timers.length, 0, "nothing left watching once it ran");
  page.timeout();
  assert.equal(runs, 1);
});

test("after the payload it waits for the preview's first picture", () => {
  const page = fakePage();
  let runs = 0;
  page.preview.warming = true;
  whenEditorSettled("week-recap", () => runs++, { env: page.env });
  page.load("/api/projects/week-recap/timeline");
  assert.equal(page.idles.length, 0);
  page.timeout(500); page.timeout(500);
  assert.equal(page.idles.length, 0, "still warming: no idle wait yet");
  page.preview.warming = false;
  page.timeout(500);
  assert.equal(page.idles.length, 1);
  page.goIdle();
  assert.equal(runs, 1);
  assert.equal(page.timers.length, 0);
});

test("a player that mounts while the payload renders is waited for", () => {
  const page = fakePage();
  let runs = 0;
  whenEditorSettled("week-recap", () => runs++, { env: page.env });
  page.load("/api/projects/week-recap/timeline");
  page.preview.warming = true;
  page.goIdle();
  assert.equal(runs, 0);
  page.preview.warming = false;
  page.timeout(500);
  page.goIdle();
  assert.equal(runs, 1);
});

test("it still connects when the payload is never seen, and a cancel stops it", () => {
  const page = fakePage();
  let runs = 0;
  whenEditorSettled("week-recap", () => runs++, { env: page.env, maxWaitMs: 20_000 });
  assert.equal(page.timers[0].ms, 20_000);
  page.timeout();
  assert.equal(runs, 1);
  const other = fakePage();
  const cancel = whenEditorSettled("week-recap", () => runs++, { env: other.env });
  other.load("/api/projects/week-recap/timeline");
  cancel();
  other.goIdle(); other.timeout();
  assert.equal(runs, 1);
});

test("project ids are matched as the timeline route encodes them", () => {
  const matches = timelineResourceMatcher("my project");
  assert.equal(matches("http://127.0.0.1:3123/api/projects/my%20project/timeline"), true);
  assert.equal(matches("http://127.0.0.1:3123/api/projects/my%20project/timeline/history"), false);
  assert.equal(matches("http://127.0.0.1:3123/api/projects/my%20project/storyboard"), true, "the Storyboard's own payload");
});

test("focusing the composer connects before the editor settles; nothing connects without an agent to use", () => {
  const choice = { provider: "codex", available: true, authentication: "signed-in" };
  assert.equal(shouldAutoConnect({ available: true, connected: false, choice, settled: false, wanted: false }), false);
  assert.equal(shouldAutoConnect({ available: true, connected: false, choice, settled: true, wanted: false }), true);
  assert.equal(shouldAutoConnect({ available: true, connected: false, choice, settled: false, wanted: true }), true);
  assert.equal(shouldAutoConnect({ available: true, connected: true, choice, settled: true, wanted: true }), false);
  assert.equal(shouldAutoConnect({ available: true, connected: false, choice: { ...choice, authentication: "signed-out" }, settled: true, wanted: true }), false);
  assert.equal(shouldAutoConnect({ available: true, connected: false, choice: { ...choice, available: false }, settled: true, wanted: true }), false);
});

test("on load only the chosen agent's models are requested; the picker asks for the rest once", () => {
  const providers = [
    { provider: "codex", available: true, authentication: "signed-in" },
    { provider: "claude", available: true, authentication: "signed-in" },
    { provider: "local", available: false, authentication: "unknown" },
  ];
  const requested = new Set<string>();
  const load = modelsToFetch(providers, { chosen: "codex", picker: false, requested });
  assert.deepEqual(load, ["codex"]);
  for (const item of load) requested.add(item);
  assert.deepEqual(modelsToFetch(providers, { chosen: "codex", picker: false, requested }), []);
  const picker = modelsToFetch(providers, { chosen: "codex", picker: true, requested });
  assert.deepEqual(picker, ["claude"], "an agent that is not installed is never asked");
  for (const item of picker) requested.add(item);
  assert.deepEqual(modelsToFetch(providers, { chosen: "codex", picker: true, requested }), []);
});
