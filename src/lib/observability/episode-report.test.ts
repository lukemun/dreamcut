import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { recordActivityOutcome, recordEpisodeBatch } from "./activity-journal";
import { episodeReport } from "./episode-report";

test("an episode prints as a timeline with its proposals, the creator's decisions and later edits", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "episode-report-"));
  const previous = { profile: process.env.DREAMCUT_PROFILE_DIR, projects: process.env.TIMELINE_PROJECTS_DIR };
  process.env.DREAMCUT_PROFILE_DIR = path.join(root, "profile");
  process.env.TIMELINE_PROJECTS_DIR = path.join(root, "projects");
  try {
    const project = path.join(root, "projects", "demo");
    fs.mkdirSync(path.join(project, "proposals"), { recursive: true }); fs.mkdirSync(path.join(project, "history"));
    const clip = "11111111-1111-4111-8111-111111111111";
    fs.writeFileSync(path.join(project, "proposals", "20261010T120000-abcdef12.json"), JSON.stringify({ status: "approved", proposal: { options: [{ operations: [{ element_id: clip, props: { media_scale: 1.2 } }] }] } }));
    const element = (scale: number) => ({ id: clip, props: { media_scale: scale } });
    const snapshot = (name: string, at: string, actor: string, scale: number, label?: string) =>
      fs.writeFileSync(path.join(project, "history", name), JSON.stringify({ at, op: "element_props_patch", actor, label, timeline: { elements: [element(scale)] } }));
    snapshot("2026-10-10T12-00-00-000Z-a.json", "2026-10-10T12:00:00.000Z", "agent", 1);
    snapshot("2026-10-10T12-05-00-000Z-b.json", "2026-10-10T12:05:00.000Z", "agent", 1.2, "Approved: zoom in");
    snapshot("2026-10-10T12-06-00-000Z-c.json", "2026-10-10T12:06:00.000Z", "human", 1.35, "Scale 1.35×");
    snapshot("2026-10-10T12-07-00-000Z-d.json", "2026-10-10T12:07:00.000Z", "human", 1.35, "Something else");
    const id = "33333333-3333-4333-8333-333333333333";
    const at = (seconds: number) => new Date(Date.parse("2026-10-10T12:01:00.000Z") + seconds * 1000).toISOString();
    recordEpisodeBatch({ episode_id: id, records: [
      { seq: 0, at: at(0), type: "episode_start", data: { project_id: "demo", provider: "codex", agent: "gpt", model: null, started_at: at(0) } },
      { seq: 1, at: at(0), type: "user", data: { display: "Zoom in on this clip", sent: "Zoom in on this clip" } },
      { seq: 2, at: at(3), type: "reasoning", data: { text: "A punch-in is a scale change." } },
      { seq: 3, at: at(4), type: "tool_call", data: { phase: "call", id: "c1", tool: "proposal_create", arguments: { proposal: { summary: "Zoom", secret: "api_key=abc" } } } },
      { seq: 4, at: at(5), type: "tool_result", data: { phase: "result", id: "c1", tool: "proposal_create", result: { content: [{ type: "text", text: JSON.stringify({ proposal_id: "20261010T120000-abcdef12" }) }] } } },
      { seq: 5, at: at(6), type: "assistant_text", data: { text: "Staged a 1.2× zoom." } },
      { seq: 6, at: at(70), type: "episode_end", data: { status: "completed", proposal_ids: ["20261010T120000-abcdef12"], final_text: "Staged a 1.2× zoom." } },
    ] });
    recordActivityOutcome({ project_id: "demo", proposal_id: "20261010T120000-abcdef12", event: "approved", option_id: "a", data: { resolution: { numeric_overrides: [{ field: "media_scale", value: 1.2 }] } } });
    const { text, context } = episodeReport(id);
    assert.match(text, /gpt \(default model\) · project demo/);
    assert.match(text, /Ended: completed after 01:10/);
    assert.match(text, /00:03  thinking   A punch-in is a scale change\./);
    assert.match(text, /00:04  call       proposal_create .*api_key=\[redacted\]/);
    assert.match(text, /00:05  result     proposal_create: ok → proposal 20261010T120000-abcdef12/);
    assert.match(text, /20261010T120000-abcdef12 · approved · clips 11111111-1111-4111-8111-111111111111/);
    assert.match(text, /approved option a/);
    assert.deepEqual(context.later_edits.map(edit => [edit.label, edit.changed_elements]), [["Scale 1.35×", [clip]]], "only the human edit that changed the proposal's clip is listed");
    assert.match(text, /Creator's later edits to those clips:\n  2026-10-10 12:06:00  element_props_patch · Scale 1.35×/);
  } finally {
    if (previous.profile === undefined) delete process.env.DREAMCUT_PROFILE_DIR; else process.env.DREAMCUT_PROFILE_DIR = previous.profile;
    if (previous.projects === undefined) delete process.env.TIMELINE_PROJECTS_DIR; else process.env.TIMELINE_PROJECTS_DIR = previous.projects;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
