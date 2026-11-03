import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { pendingProposalInbox, previewHasPendingProposals } from "./proposal-inbox";

test("replaced revisions leave the inbox but unrelated stale decisions remain", () => {
  const independent = {status:"pending", stale:true};
  const replaced = {...independent, replaced_by_approved_proposal_id:"approved"};
  const earlier = {...independent, replaced_by_pending_proposal_id:"new"};
  assert.deepEqual(pendingProposalInbox([replaced, earlier, independent]), {entries:[independent],actionable:0,stale:1});
});

test("a resolved proposal cannot keep its temporary preview on another open editor", () => {
  const entries = [{ proposal_id: "remaining", status: "pending", stale: false }];
  assert.equal(previewHasPendingProposals(entries, { proposalId: "approved" }), false);
  assert.equal(previewHasPendingProposals(entries, { proposalId: "remaining" }), true);
  assert.equal(previewHasPendingProposals(entries, {
    proposalId: "batch",
    batch: [{ proposalId: "remaining" }, { proposalId: "approved" }],
  }), false);
});

test("applying one edit keeps its stale sibling in the review inbox", () => {
  const entrance = {id: "entrance", status: "approved", stale: false};
  const exit = {id: "exit", status: "pending", stale: true};
  assert.deepEqual(pendingProposalInbox([entrance, exit]), {
    entries: [exit], actionable: 0, stale: 1,
  });
  // Undo restores both review decisions, without silently approving the sibling.
  assert.deepEqual(pendingProposalInbox([
    {...entrance, status: "pending"}, {...exit, stale: false},
  ]), {
    entries: [{...entrance, status: "pending"}, {...exit, stale: false}],
    actionable: 2, stale: 0,
  });
});

test("repeated polls preserve actionable counts when stale cards stay visible", () => {
  const entries = [
    {status: "pending", stale: false},
    {status: "pending", stale: true},
    {status: "pending", stale: true},
  ];
  let previousCount = 0;
  let alerts = 0;
  for (let poll = 0; poll < 20; poll++) {
    const inbox = pendingProposalInbox(entries.map(entry => ({...entry})));
    if (inbox.actionable > previousCount) alerts++;
    previousCount = inbox.actionable;
    assert.equal(inbox.stale, 2);
  }
  assert.equal(alerts, 1);
});

test("panel publishes counts from one owner using the same inbox as background polling", () => {
  const panel = readFileSync(new URL("./ProposalsPanel.tsx", import.meta.url), "utf8");
  const timeline = readFileSync(new URL("../TimelineStep.tsx", import.meta.url), "utf8");
  assert.equal(panel.match(/onCountsChange\?\.\(/g)?.length, 1);
  assert.ok(panel.includes("pendingProposalInbox(entries)"));
  assert.ok(panel.includes("onCountsChange?.(inbox.actionable, inbox.stale)"));
  assert.ok(timeline.includes("pendingProposalInbox(list.proposals)"));
  assert.ok(timeline.includes("updateProposalCounts(inbox.actionable, inbox.stale)"));
});

import { proposalQueue } from "./proposal-inbox";

test("a wave opens its first ready step, keeps every opened step open, and shows waiting and approved steps as rows", () => {
  const wave = (step: number, waiting_for: number[] = []) => ({ id: "opener", step, title: `Step ${step}`, total: 4, waiting_for, blocked_by: [] });
  const solo = { proposal_id: "solo", status: "pending", wave: null };
  const one = { proposal_id: "one", status: "approved", wave: wave(1) };
  const two = { proposal_id: "two", status: "pending", wave: wave(2) };
  const three = { proposal_id: "three", status: "pending", wave: wave(3, [2]) };
  const four = { proposal_id: "four", status: "pending", wave: wave(4) };
  const five = { proposal_id: "five", status: "pending", wave: wave(5) };
  const modes = (opened: Record<string, string[]>) => proposalQueue([five, four, solo, three, two], [one], opened).map(item => `${item.entry.proposal_id}:${item.mode}`);
  assert.deepEqual(modes({}), ["one:done", "two:card", "three:waiting", "four:next", "five:next", "solo:card"]);
  assert.deepEqual(modes({ opener: ["four"] }), ["one:done", "two:card", "three:waiting", "four:card", "five:next", "solo:card"], "opening a step keeps the first one open");
  assert.deepEqual(modes({ opener: ["four", "five"] }), ["one:done", "two:card", "three:waiting", "four:card", "five:card", "solo:card"], "several opened steps stay open together");
  const closedModes = (opened: Record<string, string[]>, closed: Record<string, string[]>) => proposalQueue([five, four, three, two], [one], opened, closed).map(item => `${item.entry.proposal_id}:${item.mode}`);
  assert.deepEqual(closedModes({ opener: ["four"] }, { opener: ["two"] }), ["one:done", "two:next", "three:waiting", "four:card", "five:next"], "a closed card goes back to its row, the first step included");
  assert.deepEqual(closedModes({}, { opener: ["two"] }), ["one:done", "two:next", "three:waiting", "four:next", "five:next"], "every step can be closed");
  assert.deepEqual(modes({ opener: ["three"] }), ["one:done", "two:card", "three:waiting", "four:next", "five:next", "solo:card"], "a waiting step cannot be opened");
});
