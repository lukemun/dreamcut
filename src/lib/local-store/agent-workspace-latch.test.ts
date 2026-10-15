import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { TimelineElement } from "@/components/studio/timeline/types";
import {
  createProject,
  isAgentWorkspaceProject,
  latestProjectHistorySnapshot,
  readMetadata,
  restoreProjectHistorySnapshot,
  writeMetadata,
  writeTimeline,
  type TimelineFile,
} from "@/lib/local-store/store";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-workspace-latch-"));
process.env.TIMELINE_PROJECTS_DIR = root;

// Mirrors AGENT_WRITE_LEASE_FILENAME in mcp/proposal-gate.mjs; the MCP server writes this
// file around a granted mutation so the safe-write layer can attribute the write.
const LEASE_FILENAME = ".agent-mcp-write.json";

function element(duration: number): TimelineElement {
  const now = "2026-08-13T00:00:00.000Z";
  return {
    id: "22222222-2222-4222-8222-222222222222",
    project_id: "latch-fixture",
    type: "still",
    source_url: null,
    props: null,
    beat_id: null,
    voice_clip_id: null,
    character_id: null,
    timeline_start: 0,
    duration,
    lane_key: "visual_0",
    lane_index: 0,
    trim_start: 0,
    trim_end: null,
    volume: 1,
    fade_in: 0,
    fade_out: 0,
    playback_rate: 1,
    position_locked: false,
    removed_at: null,
    removed_reason: null,
    created_at: now,
    updated_at: now,
  };
}

function timeline(duration: number): TimelineFile {
  return { elements: [element(duration)], transitions: [] };
}

/** Stand in for the MCP server's lease around one granted mutation. */
function underAgentWriteLease(projectId: string, run: () => void) {
  const leasePath = path.join(root, projectId, LEASE_FILENAME);
  fs.writeFileSync(leasePath, JSON.stringify({ tool: "elements_batch", expires_at_ms: Date.now() + 60_000 }), "utf8");
  try {
    run();
  } finally {
    fs.rmSync(leasePath, { force: true });
  }
}

test("only an agent assembly flow can open a project with the grant", () => {
  createProject("granted", "web", "Granted", { agentWorkspace: true });
  createProject("ungranted", "web", "Ungranted");
  assert.equal(isAgentWorkspaceProject("granted"), true);
  assert.equal(readMetadata("granted").agent_workspace, true);
  assert.equal(isAgentWorkspaceProject("ungranted"), false);
  assert.equal(readMetadata("ungranted").agent_workspace, undefined);

  // Re-creating over an existing project leaves its metadata (and its latch) alone.
  createProject("ungranted", "web", "Ungranted", { agentWorkspace: true });
  assert.equal(isAgentWorkspaceProject("ungranted"), false);
});

test("agent writes keep the grant and a human edit clears it for good", () => {
  createProject("latch-fixture", "web", "Latch", { agentWorkspace: true });

  underAgentWriteLease("latch-fixture", () => {
    writeTimeline("latch-fixture", timeline(1), "element_create");
  });
  assert.equal(isAgentWorkspaceProject("latch-fixture"), true, "a leased agent write must not revoke");

  // Approved-proposal application is agent work the human merely accepted.
  writeTimeline("latch-fixture", timeline(2), "editor_agent_workshop");
  assert.equal(isAgentWorkspaceProject("latch-fixture"), true);

  // The first unattributed mutation is the human taking the project over.
  writeTimeline("latch-fixture", timeline(3), "element_patch");
  assert.equal(isAgentWorkspaceProject("latch-fixture"), false);
  assert.equal(readMetadata("latch-fixture").agent_workspace, undefined);

  // ...and it stays cleared: a later leased agent write cannot re-grant it.
  underAgentWriteLease("latch-fixture", () => {
    writeTimeline("latch-fixture", timeline(4), "element_create");
  });
  assert.equal(isAgentWorkspaceProject("latch-fixture"), false);
});

test("take-audition bootstrap writes preserve a newly created workspace grant", () => {
  createProject("audition-bootstrap", "web", "Audition", { agentWorkspace: true });

  writeTimeline("audition-bootstrap", timeline(1), "create_take_audition");
  assert.equal(isAgentWorkspaceProject("audition-bootstrap"), true);

  writeMetadata(
    "audition-bootstrap",
    { ...readMetadata("audition-bootstrap"), lane_order_keys: ["captions_0", "visual_0"] },
    "configure_take_audition",
  );
  assert.equal(isAgentWorkspaceProject("audition-bootstrap"), true);
});

test("a metadata round-trip cannot hand the grant back", () => {
  createProject("metadata-fixture", "web", "Metadata", { agentWorkspace: true });
  const metadata = readMetadata("metadata-fixture");

  // A metadata mutation is itself a human edit (lane order, muted lanes, output format).
  writeMetadata("metadata-fixture", metadata, "lane_order");
  assert.equal(isAgentWorkspaceProject("metadata-fixture"), false);

  // Writing the pre-revoke metadata object back must not resurrect the flag.
  writeMetadata("metadata-fixture", { ...metadata, agent_workspace: true }, "editor_agent_workshop");
  assert.equal(isAgentWorkspaceProject("metadata-fixture"), false);
});

test("restoring a snapshot taken while the grant was live does not restore the grant", () => {
  createProject("history-latch", "web", "History", { agentWorkspace: true });
  underAgentWriteLease("history-latch", () => {
    writeTimeline("history-latch", timeline(1), "element_create");
  });
  const granted = latestProjectHistorySnapshot("history-latch");
  assert.ok(granted);
  assert.equal(isAgentWorkspaceProject("history-latch"), true);

  writeTimeline("history-latch", timeline(2), "element_patch");
  assert.equal(isAgentWorkspaceProject("history-latch"), false);

  restoreProjectHistorySnapshot("history-latch", granted.id);
  assert.equal(isAgentWorkspaceProject("history-latch"), false);
  assert.equal(readMetadata("history-latch").agent_workspace, undefined);
});

test("an expired lease no longer shields a write", () => {
  createProject("expiry-fixture", "web", "Expiry", { agentWorkspace: true });
  fs.writeFileSync(
    path.join(root, "expiry-fixture", LEASE_FILENAME),
    JSON.stringify({ tool: "elements_batch", expires_at_ms: Date.now() - 1 }),
    "utf8",
  );
  writeTimeline("expiry-fixture", timeline(1), "element_create");
  assert.equal(isAgentWorkspaceProject("expiry-fixture"), false);
});

test("first layout handoff is irreversible without any human edit", async () => {
  const { handoffAssemblyWorkspace } = await import("./assembly-workspaces");
  const { readTimeline } = await import("./store");
  createProject("handoff-fixture", "web", "Handoff", { agentWorkspace: true });
  await assert.rejects(handoffAssemblyWorkspace("handoff-fixture"), /empty/);
  underAgentWriteLease("handoff-fixture", () => writeTimeline("handoff-fixture", timeline(1), "element_create"));
  const history = latestProjectHistorySnapshot("handoff-fixture")!;
  const before = fs.readFileSync(path.join(root, "handoff-fixture", "timeline.json"), "utf8");
  const stale = readMetadata("handoff-fixture");
  const first = await handoffAssemblyWorkspace("handoff-fixture");
  assert.equal(first.authority, "proposal_required");
  assert.equal(isAgentWorkspaceProject("handoff-fixture"), false);
  assert.deepEqual(await handoffAssemblyWorkspace("handoff-fixture"), first);
  assert.equal(fs.readFileSync(path.join(root, "handoff-fixture", "timeline.json"), "utf8"), before);
  // A previously admitted request arriving after handoff must fail before writing.
  underAgentWriteLease("handoff-fixture", () => {
    assert.throws(() => writeTimeline("handoff-fixture", timeline(9), "element_create"), /proposal_create/);
    assert.throws(() => writeMetadata("handoff-fixture", stale, "lane_order"), /proposal_create/);
  });
  assert.equal(readTimeline("handoff-fixture").elements[0].duration, 1);
  writeMetadata("handoff-fixture", stale, "editor_agent_workshop");
  restoreProjectHistorySnapshot("handoff-fixture", history.id);
  assert.equal(isAgentWorkspaceProject("handoff-fixture"), false);
  assert.equal(readMetadata("handoff-fixture").agent_workspace, undefined);
  // Human edits and approved proposals remain possible.
  writeTimeline("handoff-fixture", timeline(2), "element_patch");
  writeTimeline("handoff-fixture", timeline(3), "editor_agent_workshop");
  assert.equal(readTimeline("handoff-fixture").elements[0].duration, 3);
  await assert.rejects(handoffAssemblyWorkspace("human-fixture-does-not-exist"), /not found/);
});

test("a human edit leaves a revocation receipt that agents can report, and agent writes do not", async () => {
  // Mirrors AGENT_WORKSPACE_REVOKED_FILENAME in mcp/proposal-gate.mjs.
  const receipt = (projectId: string) => path.join(root, projectId, ".agent-workspace-revoked.json");
  const { agentWorkspaceState } = await import("../../../mcp/proposal-gate.mjs");

  createProject("receipt-timeline", "web", "Receipt", { agentWorkspace: true });
  underAgentWriteLease("receipt-timeline", () => writeTimeline("receipt-timeline", timeline(1), "element_create"));
  writeTimeline("receipt-timeline", timeline(2), "editor_agent_workshop");
  assert.equal(fs.existsSync(receipt("receipt-timeline")), false, "agent work must not look like a human takeover");
  assert.equal(agentWorkspaceState("receipt-timeline"), "live");

  writeTimeline("receipt-timeline", timeline(3), "element_patch");
  assert.equal(JSON.parse(fs.readFileSync(receipt("receipt-timeline"), "utf8")).op, "element_patch");
  assert.equal(agentWorkspaceState("receipt-timeline"), "human_edited");

  createProject("receipt-metadata", "web", "Receipt", { agentWorkspace: true });
  writeMetadata("receipt-metadata", readMetadata("receipt-metadata"), "lane_order");
  assert.equal(agentWorkspaceState("receipt-metadata"), "human_edited");

  // A project that was never a workspace has no receipt and reports as ordinary.
  createProject("receipt-ordinary", "web", "Ordinary");
  writeTimeline("receipt-ordinary", timeline(1), "element_patch");
  assert.equal(fs.existsSync(receipt("receipt-ordinary")), false);
  assert.equal(agentWorkspaceState("receipt-ordinary"), "ordinary");
});
