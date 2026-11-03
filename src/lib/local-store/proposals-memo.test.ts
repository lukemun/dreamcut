import test, { mock } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createProject } from "./store";
import { listProposals, readProposal } from "./proposals";
import { projectProposalPath, projectProposalsDir } from "./paths";
import { writeJsonFileAtomic } from "./atomic-json";

const ids = ["20261001T000001-aaaaaaaa", "20261001T000002-bbbbbbbb", "20261001T000003-cccccccc"];

function record(id: string, status: string, summary = `Synthetic draft ${id}`) {
  return {
    schema_version: 1, proposal_id: id, created_at: "2026-10-01T00:00:00.000Z", status,
    proposal: { summary, options: [{ id: "a", operations: [{ op: "noop", nested: { list: [1, 2, { deep: true }] } }] }] },
  };
}

/** What the store returned before it memoized: a fresh parse of every readable file, newest first. */
function freshList(project: string, status?: string) {
  return fs.readdirSync(projectProposalsDir(project)).filter(name => name.endsWith(".json")).sort().reverse()
    .flatMap(name => { try { return [JSON.parse(fs.readFileSync(path.join(projectProposalsDir(project), name), "utf8"))]; } catch { return []; } })
    .filter(item => !status || item.status === status);
}

function withProject(run: (project: string) => void) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "proposal-memo-"));
  const previousRoot = process.env.TIMELINE_PROJECTS_DIR;
  process.env.TIMELINE_PROJECTS_DIR = root;
  try {
    const project = `memo-${path.basename(root).slice(-6).toLowerCase().replace(/[^a-z0-9]/g, "x")}`;
    createProject(project, "web");
    writeJsonFileAtomic(projectProposalPath(project, ids[0]), record(ids[0], "approved"));
    writeJsonFileAtomic(projectProposalPath(project, ids[1]), record(ids[1], "rejected"));
    writeJsonFileAtomic(projectProposalPath(project, ids[2]), record(ids[2], "pending"));
    run(project);
  } finally {
    mock.restoreAll();
    if (previousRoot === undefined) delete process.env.TIMELINE_PROJECTS_DIR;
    else process.env.TIMELINE_PROJECTS_DIR = previousRoot;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function countProposalReads(project: string) {
  const dir = projectProposalsDir(project);
  const original = fs.readFileSync;
  let reads = 0;
  mock.method(fs, "readFileSync", (...args: Parameters<typeof fs.readFileSync>) => {
    if (typeof args[0] === "string" && args[0].startsWith(dir)) reads++;
    return original(...args);
  });
  return () => reads;
}

test("an unchanged record is parsed once and returned identical to a fresh read", () => withProject(project => {
  assert.deepEqual(listProposals(project), freshList(project));
  const reads = countProposalReads(project);
  assert.deepEqual(listProposals(project), freshList(project).slice(), "second list equals fresh parse");
  assert.deepEqual(listProposals(project, { status: "pending" }), freshList(project, "pending"));
  assert.deepEqual(readProposal(project, ids[0]), JSON.parse(fs.readFileSync(projectProposalPath(project, ids[0]), "utf8")));
  // freshList and the explicit read above go through the mock too: 3 + 3 + 1 reads, none from the store.
  assert.equal(reads(), 7);
}));

test("a record rewritten in place with the same size and a new mtime is read again", () => withProject(project => {
  listProposals(project);
  const file = projectProposalPath(project, ids[1]);
  const before = fs.readFileSync(file, "utf8");
  const after = before.replace("Synthetic draft", "Synthetic DRAFT");
  assert.equal(after.length, before.length);
  const stat = fs.statSync(file);
  fs.writeFileSync(file, after);
  fs.utimesSync(file, stat.atime, new Date(stat.mtimeMs + 5_000));
  assert.equal(fs.statSync(file).size, stat.size);
  assert.equal(readProposal(project, ids[1]).proposal.summary, `Synthetic DRAFT ${ids[1]}`);
  assert.deepEqual(listProposals(project), freshList(project));
}));

test("a rewrite through the atomic writer (resolution) is seen by list and read", () => withProject(project => {
  assert.equal(listProposals(project, { status: "pending" }).length, 1);
  writeJsonFileAtomic(projectProposalPath(project, ids[2]), record(ids[2], "approved"));
  assert.deepEqual(listProposals(project, { status: "pending" }), []);
  assert.equal(readProposal(project, ids[2]).status, "approved");
}));

test("a new record appears and a deleted one disappears", () => withProject(project => {
  listProposals(project);
  const added = "20261001T000004-dddddddd";
  writeJsonFileAtomic(projectProposalPath(project, added), record(added, "pending"));
  assert.deepEqual(listProposals(project).map(item => item.proposal_id), [added, ids[2], ids[1], ids[0]]);
  fs.unlinkSync(projectProposalPath(project, ids[1]));
  assert.deepEqual(listProposals(project), freshList(project));
  assert.throws(() => readProposal(project, ids[1]), (error: Error & { status?: number }) => error.status === 404);
  fs.writeFileSync(projectProposalPath(project, ids[0]), "{ not json");
  assert.deepEqual(listProposals(project).map(item => item.proposal_id), [added, ids[2]], "a corrupt record is skipped, as before");
  assert.throws(() => readProposal(project, ids[0]), (error: Error & { status?: number }) => error.status === 404);
}));

test("mutating a returned record never changes what later callers get", () => withProject(project => {
  const expected = freshList(project);
  const listed = listProposals(project);
  listed[0].status = "rejected";
  (listed[0].proposal.options as unknown as Array<{ operations: Array<{ nested: { list: unknown[] } }> }>)[0].operations[0].nested.list.push("mutated");
  listed[1].proposal.summary = "changed";
  delete (listed[2] as { resolution?: unknown }).resolution;
  const read = readProposal(project, ids[2]);
  read.proposal.options.length = 0;
  assert.deepEqual(listProposals(project), expected);
  assert.deepEqual(readProposal(project, ids[2]), expected.find(item => item.proposal_id === ids[2]));
  assert.notEqual(listProposals(project)[0], listProposals(project)[0], "each call returns its own objects");
}));
