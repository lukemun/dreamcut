import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { emptyVideoIdea, ideaInput } from "../video-ideas";
import { listVideoIdeas, readVideoIdea, resolveVideoIdeaMedia, saveVideoIdea } from "./video-ideas";
import { POST } from "../../app/api/user/video-ideas/route";

function fixture(t: { after: (fn: () => void) => void }) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "video-ideas-test-"));
  t.after(() => fs.rmSync(profile, { recursive: true, force: true }));
  return profile;
}
test("personal ideas save without a project, preserve media on edits, and reject stale revisions", t => {
  const profile = fixture(t), source = path.join(profile, "input.mp4");
  fs.writeFileSync(source, "synthetic-reference");
  const first = saveVideoIdea({ ...emptyVideoIdea, title: "A concept" }, undefined, profile, { reference: source });
  assert.equal(listVideoIdeas(profile).ideas.length, 1);
  const second = saveVideoIdea({ ...ideaInput(first), status: "Archived" }, { id: first.id, expected_revision: 1 }, profile);
  assert.equal(second.status, "Archived"); assert.deepEqual(second.reference, first.reference);
  assert.throws(() => saveVideoIdea(ideaInput(first), { id: first.id, expected_revision: 1 }, profile), /changed elsewhere/);
  const restored = saveVideoIdea(ideaInput(first), { id: first.id, expected_revision: 2 }, profile);
  assert.equal(restored.status, "Saved"); assert.equal(restored.revision, 3);
  assert.equal(readVideoIdea(first.id, profile).revision, 3);
  assert.equal(fs.existsSync(path.join(profile, "preferences.json")), false);
});
test("invalid URLs and paths fail closed; a corrupt record does not hide healthy ideas", t => {
  const profile = fixture(t);
  assert.throws(() => saveVideoIdea({ ...emptyVideoIdea, title: "Bad", source_url: "javascript:alert(1)" }, undefined, profile));
  const good = saveVideoIdea({ ...emptyVideoIdea, title: "Good" }, undefined, profile);
  const bad = saveVideoIdea({ ...emptyVideoIdea, title: "Broken" }, undefined, profile);
  fs.writeFileSync(path.join(profile, "video-ideas", bad.id, "idea.json"), "invalid");
  assert.deepEqual(listVideoIdeas(profile).ideas.map(i => i.id), [good.id]);
  assert.deepEqual(listVideoIdeas(profile).unavailable, [bad.id]);
  assert.equal(resolveVideoIdeaMedia("../outside", "reference", profile), null);
  assert.equal(resolveVideoIdeaMedia(good.id, "reference", profile), null);
});
test("media serving rejects replaced bytes and symlink escapes", t => {
  const profile = fixture(t), source = path.join(profile, "input.mp4");
  fs.writeFileSync(source, "source-bytes");
  const idea = saveVideoIdea({ ...emptyVideoIdea, title: "Reference" }, undefined, profile, { reference: source });
  assert.ok(resolveVideoIdeaMedia(idea.id, "reference", profile));
  const media = path.join(profile, "video-ideas", idea.id, "reference.mp4");
  fs.writeFileSync(media, "changed"); assert.equal(resolveVideoIdeaMedia(idea.id, "reference", profile), null);
  fs.unlinkSync(media); fs.symlinkSync(source, media);
  assert.equal(resolveVideoIdeaMedia(idea.id, "reference", profile), null);
});

test("API accepts browser Host despite Next hostname normalization and rejects foreign origins", async t => {
  const previous = process.env.DREAMCUT_PROFILE_DIR;
  process.env.DREAMCUT_PROFILE_DIR = fixture(t);
  t.after(() => { if (previous === undefined) delete process.env.DREAMCUT_PROFILE_DIR; else process.env.DREAMCUT_PROFILE_DIR = previous; });
  const request = (origin: string, body: unknown) => new Request("http://localhost:3123/api/user/video-ideas", { method: "POST", headers: { host: "127.0.0.1:3123", origin, "content-type": "application/json" }, body: JSON.stringify(body) });
  const input = { ...emptyVideoIdea, title: "Browser save" };
  assert.equal((await POST(request("https://untrusted.example", { idea: input }))).status, 403);
  const response = await POST(request("http://127.0.0.1:3123", { idea: input }));
  assert.equal(response.status, 200);
  const { idea } = await response.json();
  const edit = { idea: { ...input, status: "Planned" }, existing: { id: idea.id, expected_revision: 1 } };
  assert.equal((await POST(request("http://127.0.0.1:3123", edit))).status, 200);
  assert.equal((await POST(request("http://127.0.0.1:3123", edit))).status, 409);
});
