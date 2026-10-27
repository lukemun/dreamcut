import assert from "node:assert/strict";
import test from "node:test";
import { createAutoProposalWork, savedProposalId } from "./proposal-work-auto.mjs";

function fakeEditor() {
  const posts = [];
  let n = 0;
  const post = async (projectId, body) => {
    posts.push({ projectId, ...body });
    if (body.action === "start") return { attempt_id: `0000000${++n}-0000-4000-8000-000000000000` };
    if (body.action === "begin") return { attempt_id: body.attempt_id, span_id: `1111111${++n}-0000-4000-8000-000000000000`, event_id: "e" };
    return { attempt_id: body.attempt_id, event_id: "e" };
  };
  return { posts, post };
}

test("proposal_create is timed as one server span and its saved card closes the attempt", async () => {
  const { posts, post } = fakeEditor();
  const work = createAutoProposalWork({ post, sessionId: "2fecdf32-9991-40d3-a255-6653202afd51" });
  const result = await work.around("proposal_create", "guy", async () => ({ proposal: { id: "prop-1" } }));
  assert.deepEqual(result, { proposal: { id: "prop-1" } });
  assert.deepEqual(posts.map(p => p.action), ["start", "begin", "end", "saved"]);
  assert.equal(posts[0].session_id, "2fecdf32-9991-40d3-a255-6653202afd51");
  assert.ok(posts.every(p => p.recorded_by === "server" && p.projectId === "guy"));
  assert.deepEqual([posts[1].phase, posts[2].outcome, posts[3].proposal_id], ["validation", "completed", "prop-1"]);
  assert.equal(work.openAttempt("guy"), null, "a saved card ends the attempt so the next card starts a new one");
});

test("a refused card keeps the attempt open, is marked failed and rethrows unchanged", async () => {
  const { posts, post } = fakeEditor();
  const work = createAutoProposalWork({ post });
  const refusal = Object.assign(new Error("overlap"), { toolError: { code: "CONFLICT" } });
  await assert.rejects(work.around("proposal_create", "guy", async () => { throw refusal; }), error => error === refusal);
  assert.deepEqual(posts.map(p => p.action), ["start", "begin", "end"]);
  assert.equal(posts[2].outcome, "failed");
  const attempt = work.openAttempt("guy");
  assert.ok(attempt);
  await work.around("motion_graphic_prepare", "guy", async () => ({ state: "ready" }));
  assert.equal(posts[3].action, "begin");
  assert.deepEqual([posts[3].attempt_id, posts[3].phase], [attempt, "preparation"], "the retry joins the open attempt");
});

test("other tools, missing projects and a failing work route never touch the call", async () => {
  const { posts, post } = fakeEditor();
  const work = createAutoProposalWork({ post });
  assert.equal(await work.around("timeline_get", "guy", async () => 1), 1);
  assert.equal(await work.around("proposal_create", undefined, async () => 2), 2);
  assert.equal(posts.length, 0);
  const broken = createAutoProposalWork({ post: async () => { throw new Error("editor down"); } });
  assert.equal(await broken.around("proposal_create", "guy", async () => 3), 3);
  assert.equal(savedProposalId({ proposal: { id: "../x" } }), null);
  assert.equal(savedProposalId({ proposal_id: "p_2" }), "p_2");
});
