import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { claudeTranscriptDir, collectLearningEvidence, desktopProjectKey, desktopUserDataDir } from "./learning-evidence";
import { recordActivityOutcome, recordEpisodeBatch } from "../observability/activity-journal";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "learning-evidence-"));
  const project = path.join(root, "projects", "demo"), userData = path.join(root, "user data"), home = path.join(root, "home");
  fs.mkdirSync(path.join(project, "memory", "events"), { recursive: true });
  fs.mkdirSync(path.join(project, "proposals"), { recursive: true });
  fs.writeFileSync(path.join(project, "memory", "events", "a.json"), JSON.stringify({ type: "editorial.feedback", recorded_at: "2026-10-09T00:00:00Z" }));
  fs.writeFileSync(path.join(project, "proposals", "p.json"), "{}");
  const key = desktopProjectKey(project);
  const write = (file: string, value: unknown) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value)); };
  // Current Codex conversation with a matching rollout transcript.
  write(path.join(userData, "codex-editing-journals", key, "checkpoint.json"), { budgets: { used: { model_calls: 2 } }, operations: [
    { id: "thread-1:exec-a", tool: "timeline_get", status: "completed" }, { id: "thread-1:exec-b", tool: "proposal_create", status: "unknown" }] });
  write(path.join(userData, "codex-sessions", `${key}.json`), { threadId: "thread-1" });
  write(path.join(home, ".codex", "sessions", "2026", "10", "09", "rollout-x-thread-1.jsonl"), [
    { type: "event_msg", payload: { type: "task_started" } },
    { type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { input_tokens: 10, output_tokens: 2 } } } },
  ].map(line => JSON.stringify(line)).join("\n"));
  // Archived Claude conversation; streaming repeats usage for one message id.
  const archive = path.join(userData, "claude-conversation-archives", key, "arch-1");
  write(path.join(archive, "journal", "checkpoint.json"), { budgets: { used: { model_calls: 1 } }, operations: [{ id: "c1", tool: "editing_feedback_record", status: "completed" }] });
  write(path.join(archive, "ownership.json"), { threadId: "claude-thread" });
  write(path.join(claudeTranscriptDir(path.join(userData, "claude-workspaces", key), home), "claude-thread.jsonl"), [
    { type: "user", message: { content: "make it punchier" } },
    { type: "assistant", message: { id: "m1", usage: { input_tokens: 5, output_tokens: 1 } } },
    { type: "assistant", message: { id: "m1", usage: { input_tokens: 5, output_tokens: 3 } } },
    { type: "user", message: { content: [{ type: "tool_result", content: "ok" }] } },
  ].map(line => JSON.stringify(line)).join("\n"));
  return { project, userData, home };
}

test("indexes project records and every desktop conversation with its transcript", () => {
  const { project, userData, home } = fixture();
  const evidence = collectLearningEvidence(project, { userData, home });
  assert.equal(evidence.projectId, "demo");
  assert.equal(evidence.project.memoryEvents.length, 1);
  assert.equal(evidence.project.memoryEvents[0].type, "editorial.feedback");
  assert.match(evidence.project.memoryEvents[0].sha256, /^[a-f0-9]{64}$/);
  assert.equal(evidence.project.proposals, 1);
  const codex = evidence.desktop.conversations.find(item => item.provider === "codex")!;
  assert.deepEqual([codex.state, codex.threadId, codex.toolCalls, codex.unsettled, codex.modelCalls], ["current", "thread-1", 2, 1, 2]);
  assert.deepEqual(codex.transcript?.tokens, { input_tokens: 10, output_tokens: 2 });
  const claude = evidence.desktop.conversations.find(item => item.provider === "claude")!;
  assert.deepEqual([claude.state, claude.archiveId, claude.threadId], ["archived", "arch-1", "claude-thread"]);
  assert.deepEqual(claude.transcript?.tokens, { input_tokens: 5, output_tokens: 3 });
  assert.equal(claude.transcript?.userTurns, 1);
  // The index carries references and counts, never conversation text.
  assert.doesNotMatch(JSON.stringify(evidence), /punchier/);
});

test("a project never opened in the desktop app reports no conversations", () => {
  const { project, home } = fixture();
  const evidence = collectLearningEvidence(project, { userData: path.join(home, "missing"), home });
  assert.equal(evidence.desktop.found, false);
  assert.deepEqual(evidence.desktop.conversations, []);
});

test("desktop user data follows Electron's per-platform location", () => {
  assert.equal(desktopUserDataDir({}, "darwin", "/Users/a"), "/Users/a/Library/Application Support/DreamCut");
  assert.equal(desktopUserDataDir({ APPDATA: "C:\\Users\\a\\AppData\\Roaming" }, "win32", "C:\\Users\\a"), path.join("C:\\Users\\a\\AppData\\Roaming", "DreamCut"));
  assert.equal(desktopUserDataDir({ DREAMCUT_USER_DATA: "/tmp/x" }, "darwin", "/Users/a"), "/tmp/x");
  assert.equal(claudeTranscriptDir("/Users/a/Library/Application Support/DreamCut/claude-workspaces/k", "/h"), "/h/.claude/projects/-Users-a-Library-Application-Support-DreamCut-claude-workspaces-k");
});

test("the activity journal's episodes and outcomes for the project are indexed in order", () => {
  const { project, userData, home } = fixture();
  const journalDir = path.join(home, "profile", "activity-journal"), previous = process.env.DREAMCUT_PROFILE_DIR;
  process.env.DREAMCUT_PROFILE_DIR = path.join(home, "profile");
  try {
    const at = "2026-10-10T12:00:00.000Z";
    recordEpisodeBatch({ episode_id: "11111111-1111-4111-8111-111111111111", records: [
      { seq: 0, at, type: "episode_start", data: { project_id: "demo", provider: "codex", agent: "gpt", model: null, started_at: at } },
      { seq: 1, at, type: "tool_call", data: { phase: "call", id: "c1", tool: "proposal_create", arguments: {} } },
      { seq: 2, at, type: "tool_result", data: { phase: "result", id: "c1", tool: "proposal_create", result: { isError: true, content: [] } } },
      { seq: 3, at, type: "model", data: { model: "gpt-6.1-sol" } },
      { seq: 4, at, type: "episode_end", data: { status: "completed", proposal_ids: ["p"] } },
    ] });
    recordEpisodeBatch({ episode_id: "22222222-2222-4222-8222-222222222222", records: [{ seq: 0, at, type: "episode_start", data: { project_id: "other", provider: "local", agent: "local", started_at: at } }] });
    recordActivityOutcome({ project_id: "demo", proposal_id: "p", event: "approved", option_id: "a", data: {} });
    const { journal } = collectLearningEvidence(project, { userData, home, journalDir });
    assert.equal(journal.episodes.length, 1, "other projects' episodes are left out");
    assert.deepEqual([journal.episodes[0]!.agent, journal.episodes[0]!.model, journal.episodes[0]!.toolCalls, journal.episodes[0]!.failedCalls, journal.episodes[0]!.proposalIds], ["gpt", "gpt-6.1-sol", 1, 1, ["p"]]);
    assert.deepEqual(journal.outcomes.map(outcome => [outcome.proposalId, outcome.event]), [["p", "approved"]]);
  } finally {
    if (previous === undefined) delete process.env.DREAMCUT_PROFILE_DIR; else process.env.DREAMCUT_PROFILE_DIR = previous;
  }
});
