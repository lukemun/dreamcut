import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readEpisode, recordEpisodeBatch, recordActivityOutcome, activityJournalDir } from "./activity-journal";

test("episodes store images once by hash, snapshots by hash, and drop only credentials and the home folder", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "activity-journal-")), previous = process.env.DREAMCUT_PROFILE_DIR;
  process.env.DREAMCUT_PROFILE_DIR = dir;
  try {
    const id = randomUUID(), at = new Date().toISOString();
    const pixel = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    recordEpisodeBatch({ episode_id: id, records: [
      { seq: 0, at, type: "snapshot", data: { kind: "editing-contract", instructions: "Use only the registered editing tools." } },
      { seq: 1, at, type: "user", data: { display: "Use the clip in " + path.join(os.homedir(), "Movies", "take 3.mov"), sent: "api_key=abc123 please" } },
      { seq: 2, at, type: "tool_result", data: { result: { content: [{ type: "image", data: pixel, mimeType: "image/png" }, { type: "text", text: `data:image/png;base64,${pixel}` }] } } },
    ] });
    const records = readEpisode(id);
    assert.match(String((records[0]!.data as { snapshot_sha256: string }).snapshot_sha256), /^[0-9a-f]{64}$/);
    assert.equal((records[1]!.data as { display: string }).display, `Use the clip in ${path.join("~", "Movies", "take 3.mov")}`);
    assert.equal((records[1]!.data as { sent: string }).sent, "api_key=[redacted] please");
    const [image, url] = (records[2]!.data as { result: { content: Array<{ media_sha256: string }> } }).result.content;
    assert.equal(image!.media_sha256, (url as unknown as { text: { media_sha256: string } }).text.media_sha256, "the same pixels are stored once");
    assert.equal(fs.readdirSync(path.join(activityJournalDir(), "media")).length, 1);
    recordActivityOutcome({ project_id: "p", proposal_id: "x", event: "approved", option_id: "a", data: { resolution: { numeric_overrides: [] } } });
    assert.equal(fs.readdirSync(path.join(activityJournalDir(), "outcomes")).length, 1);
  } finally {
    if (previous === undefined) delete process.env.DREAMCUT_PROFILE_DIR; else process.env.DREAMCUT_PROFILE_DIR = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("episode summaries reuse unchanged files and invalidate on append, replacement and corruption", async () => {
  const { listEpisodes } = await import("./activity-journal");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "episode-summary-"));
  const id = randomUUID(), file = path.join(dir, "episodes", `${id}.jsonl`);
  fs.mkdirSync(path.dirname(file));
  const at = "2026-01-01T00:00:00Z";
  const initial = JSON.stringify({ seq: 0, at, type: "episode_start", data: { started_at: at, project_id: "one" } }) + "\n";
  const read = fs.readFileSync; let reads = 0;
  try {
    fs.writeFileSync(file, initial);
    fs.readFileSync = ((...args: Parameters<typeof fs.readFileSync>) => {
      if (String(args[0]) === file) reads++;
      return Reflect.apply(read, fs, args);
    }) as typeof fs.readFileSync;
    const first = listEpisodes(dir);
    assert.deepEqual(listEpisodes(dir), first);
    assert.equal(reads, 1, "unchanged listing must not read event bodies");
    first[0]!.proposal_ids.push("caller mutation");
    assert.deepEqual(listEpisodes(dir)[0]!.proposal_ids, []);
    fs.appendFileSync(file, JSON.stringify({ seq: 1, at, type: "tool_call", data: {} }) + "\n");
    assert.equal(listEpisodes(dir)[0]!.tool_calls, 1);
    assert.equal(reads, 2);
    const oldTime = fs.statSync(file);
    fs.writeFileSync(file + ".new", initial.replace('"one"', '"two"'));
    fs.utimesSync(file + ".new", oldTime.atime, oldTime.mtime);
    fs.renameSync(file + ".new", file);
    assert.equal(listEpisodes(dir)[0]!.project_id, "two");
    fs.writeFileSync(file, "broken");
    assert.throws(() => listEpisodes(dir));
    fs.unlinkSync(file);
    assert.deepEqual(listEpisodes(dir), []);
  } finally { fs.readFileSync = read; fs.rmSync(dir, { recursive: true, force: true }); }
});

test("episode summary cache bounds entry count and bytes and bypasses oversized summaries", async () => {
  const { listEpisodes } = await import("./activity-journal");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "episode-summary-budget-"));
  const read = fs.readFileSync; let reads = 0;
  fs.mkdirSync(path.join(dir, "episodes"));
  const write = (request: string) => {
    fs.writeFileSync(path.join(dir, "episodes", `${randomUUID()}.jsonl`), JSON.stringify({ seq: 0, at: "2026-01-01T00:00:00Z", type: "user", data: { display: request } }) + "\n");
  };
  const clear = () => { for (const name of fs.readdirSync(path.join(dir, "episodes"))) fs.unlinkSync(path.join(dir, "episodes", name)); };
  try {
    fs.readFileSync = ((...args: Parameters<typeof fs.readFileSync>) => {
      if (String(args[0]).startsWith(dir)) reads++;
      return Reflect.apply(read, fs, args);
    }) as typeof fs.readFileSync;
    for (let i = 0; i < 129; i++) write("");
    listEpisodes(dir); reads = 0; listEpisodes(dir);
    assert.equal(reads, 1, "129 unchanged entries should reuse 128 summaries despite scan eviction");
    clear(); for (let i = 0; i < 40; i++) write("x".repeat(60 * 1024));
    listEpisodes(dir); reads = 0; listEpisodes(dir);
    assert.ok(reads > 0 && reads < 40, "byte eviction must still preserve reusable summaries during the scan");
    clear(); write("x".repeat(65 * 1024));
    listEpisodes(dir); reads = 0; listEpisodes(dir);
    assert.equal(reads, 1, "oversized individual summary must not be retained");
  } finally { fs.readFileSync = read; fs.rmSync(dir, { recursive: true, force: true }); }
});
