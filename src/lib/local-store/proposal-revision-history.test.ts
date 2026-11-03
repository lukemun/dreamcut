import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createProject, captureProjectHistorySnapshot, restoreProjectHistorySnapshot } from "./store";
import { readProposal, rejectProposalRevisionChain, resolveProposal, resolveSupersededProposals } from "./proposals";
import { readProposalTuning } from "./proposal-tuning";
import { projectProposalPath } from "./paths";
import { writeJsonFileAtomic } from "./atomic-json";

test("approval retires all pending ancestors and Undo/Redo restores their review state together", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "proposal-chain-"));
  const previousRoot = process.env.TIMELINE_PROJECTS_DIR;
  process.env.TIMELINE_PROJECTS_DIR = root;
  try {
    const project = "revision-history";
    createProject(project, "web");
    const ids = ["20261001T000001-aaaaaaaa", "20261001T000002-bbbbbbbb", "20261001T000003-cccccccc", "20261001T000004-dddddddd"];
    for (const [index,id] of ids.entries()) {
      writeJsonFileAtomic(projectProposalPath(project,id), {
        schema_version:1, proposal_id:id, created_at:`2026-10-01T00:00:0${index+1}.000Z`, status:"pending",
        proposal:{summary:`Synthetic draft ${index}`,options:[],supersedes_proposal_ids:index>0&&index<3?[ids[index-1]]:[]},
      });
    }
    const before = captureProjectHistorySnapshot(project,"before",{proposalIds:ids});
    resolveProposal(project,ids[2],"approved",{});
    assert.deepEqual(resolveSupersededProposals(project,ids[2],[ids[1]]),[ids[1],ids[0]]);
    assert.equal(readProposal(project,ids[3]).status,"pending", "unrelated sibling survives");
    const after = captureProjectHistorySnapshot(project,"after",{proposalIds:ids});
    restoreProjectHistorySnapshot(project,before.id,"history_restore_undo");
    for(const id of ids) assert.equal(readProposal(project,id).status,"pending");
    restoreProjectHistorySnapshot(project,after.id,"history_restore_redo");
    for(const id of ids.slice(0,2)) {
      assert.equal(readProposal(project,id).status,"rejected");
      assert.equal(readProposal(project,id).resolution?.superseded_by_proposal_id,ids[2]);
    }
    assert.equal(readProposal(project,ids[2]).status,"approved");
    assert.equal(readProposal(project,ids[3]).status,"pending");
  } finally {
    if(previousRoot === undefined) delete process.env.TIMELINE_PROJECTS_DIR;
    else process.env.TIMELINE_PROJECTS_DIR = previousRoot;
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test("rejection is an undo step: Undo returns the card and its rejected drafts pending with their dials, Redo rejects them again", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "proposal-reject-"));
  const previousRoot = process.env.TIMELINE_PROJECTS_DIR;
  process.env.TIMELINE_PROJECTS_DIR = root;
  try {
    const project = "reject-history";
    createProject(project, "web");
    const ids = ["20261001T000001-aaaaaaaa", "20261001T000002-bbbbbbbb", "20261001T000003-cccccccc"];
    for (const [index,id] of ids.entries()) {
      writeJsonFileAtomic(projectProposalPath(project,id), {
        schema_version:1, proposal_id:id, created_at:`2026-10-01T00:00:0${index+1}.000Z`, status:"pending",
        proposal:{summary:`Synthetic draft ${index}`,options:[],supersedes_proposal_ids:index===1?[ids[0]]:[]},
      });
    }
    // Saved dial values live beside the record; rejecting must not discard them.
    const tuning = { a: [{ operation_index: 0, target: "props" as const, field: "scale", value: 1.4 }] };
    writeJsonFileAtomic(path.join(path.dirname(projectProposalPath(project,ids[1])),"tuning",`${ids[1]}.json`), tuning);
    const { rejected_proposal_ids, history } = await rejectProposalRevisionChain(project,ids[1]);
    assert.deepEqual(rejected_proposal_ids,[ids[0],ids[1]]);
    assert.notEqual(history.before.id, history.after.id);
    assert.equal(readProposal(project,ids[2]).status,"pending","independent card untouched");
    restoreProjectHistorySnapshot(project,history.before.id,"history_restore");
    for (const id of ids) assert.equal(readProposal(project,id).status,"pending");
    assert.equal(readProposal(project,ids[1]).resolution,undefined);
    assert.deepEqual(readProposalTuning(project,ids[1]),tuning);
    restoreProjectHistorySnapshot(project,history.after.id,"history_restore");
    assert.equal(readProposal(project,ids[1]).status,"rejected");
    assert.equal(readProposal(project,ids[0]).resolution?.rejected_with_proposal_id,ids[1]);
    assert.equal(readProposal(project,ids[2]).status,"pending");
  } finally {
    if(previousRoot === undefined) delete process.env.TIMELINE_PROJECTS_DIR;
    else process.env.TIMELINE_PROJECTS_DIR = previousRoot;
    fs.rmSync(root,{recursive:true,force:true});
  }
});
