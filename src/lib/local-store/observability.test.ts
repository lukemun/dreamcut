import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { scrubEvent, scrubTelemetry, scrubText } from "@/lib/observability/privacy";
import { sentryOptions } from "@/lib/observability/sentry-options";
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
