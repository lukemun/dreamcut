import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DIAGNOSTIC_LOG_RETENTION, pruneDayFiles } from "./day-files";
import { readToolEventsDay, recordToolEvent, toolEventsDir, toolUsage } from "./tool-events";

function withProfile(run: (dir: string) => void) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tool-events-")), previous = process.env.DREAMCUT_PROFILE_DIR;
  process.env.DREAMCUT_PROFILE_DIR = dir;
  try { run(dir); } finally {
    if (previous === undefined) delete process.env.DREAMCUT_PROFILE_DIR; else process.env.DREAMCUT_PROFILE_DIR = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const row = (overrides: Record<string, unknown> = {}) => ({
  schema_version: 1, event: "dreamcut.tool_dispatch", call_id: "7d4e2b1a-1c2d-4e3f-8a9b-0c1d2e3f4a5b", request_id: "1",
  session_id: "2fecdf32-9991-40d3-a255-6653202afd51", tool: "video_search", contract_version: 1, project_id: "guy",
  started_at: "2026-10-27T16:30:00.000Z", finished_at: "2026-10-27T16:30:00.010Z", duration_ms: 10, success: false, error_code: "INVALID_ARGUMENTS", ...overrides,
});

test("tool events follow the diagnostic-log bound: oldest whole days beyond 90 days or 50 MB are dropped, never today", () => withProfile(() => {
  const dir = toolEventsDir();
  fs.mkdirSync(dir, { recursive: true });
  const day = (offset: number) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
  for (const offset of [120, 95, 30, 0]) fs.writeFileSync(path.join(dir, `${day(offset)}.jsonl`), JSON.stringify(row()) + "\n");
  fs.writeFileSync(path.join(dir, "upload-state.json"), "{}");
  assert.deepEqual(pruneDayFiles(dir).sort(), [`${day(120)}.jsonl`, `${day(95)}.jsonl`].sort());
  assert.deepEqual(fs.readdirSync(dir).sort(), [`${day(0)}.jsonl`, `${day(30)}.jsonl`, "upload-state.json"].sort(), "the sync cursor and recent days stay");
  // Byte budget: the newest day is kept even when it alone exceeds the budget.
  fs.writeFileSync(path.join(dir, `${day(30)}.jsonl`), "x".repeat(10));
  fs.writeFileSync(path.join(dir, `${day(0)}.jsonl`), "x".repeat(20));
  assert.deepEqual(pruneDayFiles(dir, { days: DIAGNOSTIC_LOG_RETENTION.days, bytes: 25 }), [`${day(30)}.jsonl`]);
  assert.deepEqual(fs.readdirSync(dir).sort(), [`${day(0)}.jsonl`, "upload-state.json"]);
}));

test("a new day's first row prunes; rows are readable per day with their error codes", () => withProfile(() => {
  const dir = toolEventsDir();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const old = new Date(Date.now() - 100 * 86_400_000).toISOString().slice(0, 10);
  fs.writeFileSync(path.join(dir, `${old}.jsonl`), JSON.stringify(row()) + "\n");
  recordToolEvent(row());
  recordToolEvent(row({ call_id: "8d4e2b1a-1c2d-4e3f-8a9b-0c1d2e3f4a5c", tool: "proposal_create", success: true, error_code: undefined }));
  const today = new Date().toISOString().slice(0, 10);
  assert.deepEqual(fs.readdirSync(dir), [`${today}.jsonl`], "the day beyond retention went when today's file was created");
  const { events, invalid } = readToolEventsDay(today);
  assert.deepEqual([events.length, invalid], [2, 0]);
  assert.deepEqual(events.map(event => [event.tool, event.error_code ?? null]), [["video_search", "INVALID_ARGUMENTS"], ["proposal_create", null]]);
  assert.deepEqual(readToolEventsDay("not-a-day").events, []);
  assert.equal(toolUsage().rows.find(r => r.tool === "video_search")?.failures, 1);
}));
