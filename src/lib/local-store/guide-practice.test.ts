import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { POST } from "../../app/api/guide/practice/route";
import { POST as approve } from "../../app/api/projects/[projectId]/timeline/proposals/[proposalId]/approve/route";
import { GUIDE_PRACTICE_PROJECT } from "@/lib/guide-tour";
import { listProposals } from "@/lib/local-store/proposals";
import { readTimeline } from "@/lib/local-store/store";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "guide-practice-"));
process.env.TIMELINE_PROJECTS_DIR = path.join(root, "projects");
process.env.DREAMCUT_PROFILE_DIR = path.join(root, "profile");
test.after(() => fs.rmSync(root, { recursive: true, force: true }));

const call = (action: string) => POST(new Request("http://127.0.0.1:3129/api/guide/practice", {
  method: "POST", headers: { "Content-Type": "application/json", origin: "http://127.0.0.1:3129" }, body: JSON.stringify({ action }),
}));

test("the Guide makes one practice project with a card to review, and reuses it", { timeout: 240_000 }, async () => {
  const first = await call("start");
  assert.equal(first.status, 200, JSON.stringify(await first.clone().json()));
  assert.equal((await first.json()).project_id, GUIDE_PRACTICE_PROJECT);
  const pending = listProposals(GUIDE_PRACTICE_PROJECT, { status: "pending" });
  assert.equal(pending.length, 1);
  // The creator's footage is the bobblehead; the card adds the neon road the 3D Sketch Scene built.
  assert.equal(pending[0].proposal.options[0].label, "Neon road");
  const timeline = readTimeline(GUIDE_PRACTICE_PROJECT);
  assert.deepEqual(timeline.elements.map(element => element.props.title), ["Bobblehead standing", "Bobblehead running", "Bobblehead running"]);
  assert.ok(timeline.elements.every(element => element.source_url?.startsWith(`/api/projects/${GUIDE_PRACTICE_PROJECT}/`)), "the kit's media now belongs to the practice project");

  // Starting again neither remakes the project nor stacks a second card, even twice at once.
  const [again, alongside] = await Promise.all([call("start"), call("start")]);
  assert.equal(again.status, 200, JSON.stringify(await again.clone().json()));
  assert.equal(alongside.status, 200, JSON.stringify(await alongside.clone().json()));
  assert.equal(listProposals(GUIDE_PRACTICE_PROJECT, { status: "pending" }).length, 1);

  // After the creator applies the card, the tour still starts: its clips are on the timeline, so no new card.
  const proposalId = pending[0].proposal_id;
  const applied = await approve(new Request(`http://127.0.0.1:3129/api/projects/${GUIDE_PRACTICE_PROJECT}/timeline/proposals/${proposalId}/approve`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ option_id: "neon-road" }),
  }), { params: Promise.resolve({ projectId: GUIDE_PRACTICE_PROJECT, proposalId }) });
  assert.equal(applied.status, 200, JSON.stringify(await applied.clone().json()));
  const restarted = await call("start");
  assert.equal(restarted.status, 200, JSON.stringify(await restarted.clone().json()));
  assert.equal(listProposals(GUIDE_PRACTICE_PROJECT, { status: "pending" }).length, 0);
});

test("a creator's own folder with the practice name is never taken over", async () => {
  fs.rmSync(path.join(root, "projects", GUIDE_PRACTICE_PROJECT, "guide-practice.json"));
  const response = await call("start");
  assert.equal(response.status, 409);
});

test("only the local editor can start the tour", async () => {
  const response = await POST(new Request("http://127.0.0.1:3129/api/guide/practice", { method: "POST", body: "{}" }));
  assert.equal(response.status, 403);
});
