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
