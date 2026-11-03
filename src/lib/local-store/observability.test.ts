import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { scrubEvent, scrubTelemetry, scrubText } from "@/lib/observability/privacy";
import { REPLAY_PRIVACY, defaultTraceSampleRate, sentryOptions } from "@/lib/observability/sentry-options";
import { traceOperation } from "@/lib/observability/operations";
import { traceSync } from "@/lib/observability/sync-span";

test("telemetry is opt-in with configurable trace sampling and private collection disabled", () => {
  assert.equal(sentryOptions("https://example.com", undefined, undefined).enabled, false);
  assert.equal(sentryOptions(undefined, "1", undefined).enabled, false);
  const options = sentryOptions("https://example.com", "1", "test", "1");
  assert.equal(options.enabled, true);
  assert.equal(options.tracesSampleRate, 1);
  assert.deepEqual(options.dataCollection?.httpBodies, []);
  assert.deepEqual(options.dataCollection?.genAI, { inputs: false, outputs: false });
  assert.equal(options.beforeBreadcrumb?.({ message: "private" }, undefined), null);
  assert.equal(sentryOptions("https://example.com", "1", "test").tracesSampleRate, 0.1);
  assert.equal(sentryOptions("https://example.com", "1", "test", "0").tracesSampleRate, 0);
  assert.equal(sentryOptions("https://example.com", "1", "test", "invalid").tracesSampleRate, 0.1);
});

test("errors strip request data, arbitrary context, source lines, identities and breadcrumbs", () => {
  const result = scrubEvent({ request: { data: "private transcript" }, extra: { timeline: "private" },
    user: { email: "private@example.com" }, breadcrumbs: [{ message: "private" }],
    contexts: { trace: { trace_id: "abc", span_id: "def" }, custom: { transcript: "private" } },
    exception: { values: [{ value: "Cannot read /Users/alice/secret.mov", stacktrace: { frames: [{ function: "readTimeline", lineno: 21, vars: { token: "private" }, context_line: "secret source" }] } }] } });
  const json = JSON.stringify(result);
  assert.ok(!json.includes("private"));
  assert.ok(!json.includes("secret"));
  assert.ok(json.includes("readTimeline"));
  assert.ok(json.includes("abc"));
});

test("spans and logs redact paths, URLs, query strings, secrets and content fields", () => {
  const result = scrubTelemetry({ operation: "captions.transcribe", duration_ms: 23,
    text: "GET /api/projects/my-private-project/media/voice.wav?token=secret",
    token: "secret", prompt: "private", attributes: { source_url: "private", transcript: "private" } });
  assert.equal(result.operation, "captions.transcribe");
  assert.equal(result.duration_ms, 23);
  assert.ok(!JSON.stringify(result).includes("private"));
  assert.equal(scrubText("https://user:secret@example.com/media.wav?token=x"), "[url]");
  assert.equal(scrubText("C:\\Users\\alice\\private.wav"), "[local-path]");
});

test("instrumentation preserves results and thrown errors when no provider is configured", async () => {
  assert.equal(traceSync("test.sync", () => 42), 42);
  assert.equal(await traceOperation("test.async", async () => 42), 42);
  const error = new Error("test failure");
  assert.throws(() => traceSync("test.sync", () => { throw error; }), (actual) => actual === error);
  await assert.rejects(traceOperation("test.async", async () => { throw error; }), (actual) => actual === error);
});

test("distributable telemetry configuration contains no Sentry ingestion destination", () => {
  for (const file of [".env.example", "next.config.ts", "src/instrumentation.ts", "src/instrumentation-client.ts",
    "src/sentry.server.config.ts", "src/sentry.edge.config.ts", "src/lib/observability/sentry-options.ts", "docs/observability.md"]) {
    const content = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(content, /https:\/\/[^\s]+@[^\s]+sentry\.io\/\d+/, file);
  }
  const example = fs.readFileSync(".env.example", "utf8");
  assert.match(example, /^SENTRY_ENABLED=0$/m);
  assert.match(example, /^NEXT_PUBLIC_SENTRY_ENABLED=0$/m);
  assert.match(example, /^SENTRY_DSN=$/m);
  assert.match(example, /^NEXT_PUBLIC_SENTRY_DSN=$/m);
});

test("errors keep app-relative stack locations but no origin, home folder, host name or media name", () => {
  const result = scrubEvent({ server_name: "Alices-MacBook-Pro.local",
    contexts: { gpu: { name: "ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Pro)" }, device: { hostname: "alice" } },
    exception: { values: [{ value: "Failed to decode /Users/alice/Movies/Our Wedding.mov (~/Desktop/clip.mp4)", stacktrace: { frames: [
      { filename: "http://127.0.0.1:3123/_next/static/chunks/player.js", abs_path: "http://127.0.0.1:3123/_next/static/chunks/player.js", lineno: 4 },
      { filename: "http://127.0.0.1:3123/p/alice-wedding", lineno: 9 },
      { filename: "/Users/alice/Clones/dreamcut/.next/server/chunks/ssr/route.js", lineno: 2 },
      { filename: "C:\\Users\\alice\\dreamcut\\node_modules\\next\\dist\\server.js", lineno: 3 },
      { filename: "app:///_next/server/chunks/a.js", lineno: 1 },
    ] } }] },
    debug_meta: { images: [{ code_file: "http://127.0.0.1:3123/_next/static/chunks/player.js" }] } });
  const json = JSON.stringify(result);
  assert.ok(!/alice|Wedding|clip\.mp4|MacBook|hostname/i.test(json), json);
  const frames = result.exception.values[0].stacktrace.frames.map(frame => frame.filename);
  assert.deepEqual(frames, ["app:///_next/static/chunks/player.js", "app:///[page]", "app:///.next/server/chunks/ssr/route.js",
    "app:///node_modules/next/dist/server.js", "app:///_next/server/chunks/a.js"]);
  assert.equal(result.debug_meta.images[0].code_file, "app:///_next/static/chunks/player.js");
  assert.match(json, /Apple M2 Pro/);
  assert.equal(scrubText("cannot open D:/Footage/take 2.MOV"), "cannot open [local-path] [media-file]");
});

test("a fifth of errors is kept; traces sample a tenth outside development; replay only buffers", () => {
  assert.equal(defaultTraceSampleRate("development"), 1);
  assert.equal(defaultTraceSampleRate("production"), 0.1);
  const options = sentryOptions("https://example.com", "1", "test");
  assert.equal(options.sampleRate, 0.2);
  assert.equal(options.replaysSessionSampleRate, 0);
  assert.equal(options.replaysOnErrorSampleRate, 1);
});

test("replay masks typed text and records media as empty boxes", () => {
  assert.equal(REPLAY_PRIVACY.maskAllInputs, true);
  assert.ok(REPLAY_PRIVACY.mask.includes("[contenteditable]"));
  for (const media of ["video", "audio", "canvas", "img", "iframe", "[data-replay-block]"]) assert.ok(REPLAY_PRIVACY.block.includes(media), media);
  assert.deepEqual(REPLAY_PRIVACY.networkDetailAllowUrls, []);
});

test("every bug report carries the replay, with no option to leave it out", () => {
  const form = fs.readFileSync("src/app/BugReportButton.tsx", "utf8");
  // The hint literal always starts with includeReplay: true; the optional session-evidence attachment follows it.
  assert.match(form, /sendFeedback\([\s\S]*?\{ includeReplay: true(?:, \.\.\.\(attachments\.length \? \{ attachments \} : \{\}\))? \},?\s*\)\)/);
  assert.doesNotMatch(form, /setIncludeReplay|Leave out|SegmentedControl/);
});
