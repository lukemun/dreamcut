import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { feedbackCoverage, pendingFeedbackRequests } from "../timeline/editing-feedback";
import { readAssemblyBrief } from "./assembly-workspaces";
import { memoryEvents } from "./editing-memory";
import { startProjectFromHome, waitingFirstBuild } from "./home-start";
import { isSafeProjectId } from "./paths";
import { isAgentWorkspaceProject, readMetadata } from "./store";

test("Start project from Home leaves the creator's brief waiting for its first cut", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "home-start-"));
  process.env.TIMELINE_PROJECTS_DIR = path.join(root, "projects");
  process.env.DREAMCUT_PROFILE_DIR = path.join(root, "profile");
  try {
    const brief = "Make a 30-second short from my clips. Keep the laugh at the end.";
    const { id, feedback_id } = startProjectFromHome({ title: "Make a 30-second short", brief, aspect_ratio: "9:16" });
    assert.ok(isSafeProjectId(id));
    assert.equal(readMetadata(id).title, "Make a 30-second short");
    assert.equal(readAssemblyBrief(id)?.objective, brief);
    assert.ok(isAgentWorkspaceProject(id), "the agent may lay out the first cut directly");
    // The brief is the creator's own words, shown under Up next until something answers it.
    const recorded = memoryEvents(id).find(event => event.id === feedback_id);
    assert.equal(recorded?.actor, "human");
    assert.equal(recorded?.data?.provenance, "user_words");
    assert.deepEqual(pendingFeedbackRequests(feedbackCoverage(memoryEvents(id), [])).map(request => request.id), [feedback_id]);
    assert.deepEqual({ ...waitingFirstBuild(id), guidance: undefined }, { project_id: id, brief, feedback_id, media: [], guidance: undefined });
    assert.equal(waitingFirstBuild("absent"), null);
    assert.throws(() => startProjectFromHome({ title: "Too long", brief: "x".repeat(2001), aspect_ratio: "9:16" }));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
