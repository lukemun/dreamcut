import assert from "node:assert/strict";
import test from "node:test";

import { createSharedPoll, type ConditionalResult, type PollEnvironment } from "./shared-poll";
import { proposalInboxFeed } from "./proposal-inbox-feed";
import type { ProposalInboxResponse } from "./timeline-client";

/** Manual clock + visibility, so ticks run only when the test advances them. */
function fakeEnv() {
  let hidden = false;
  const timers = new Map<number, () => void>();
  const visible = new Set<() => void>();
  let next = 1;
  const env: PollEnvironment = {
    isHidden: () => hidden,
    onVisible(callback) { visible.add(callback); return () => visible.delete(callback); },
    setTimeout(callback) { const id = next++; timers.set(id, callback); return id; },
    clearTimeout(handle) { timers.delete(handle as number); },
  };
  return {
    env,
    pendingTimers: () => timers.size,
    async tick() {
      const due = [...timers.entries()];
      timers.clear();
      for (const [, callback] of due) callback();
      await settle();
    },
    async setHidden(value: boolean) {
      hidden = value;
      if (!value) for (const callback of [...visible]) callback();
      await settle();
    },
  };
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A server that answers 304 when the caller's tag matches its current version. */
function fakeServer<T>(initial: T) {
  let version = 1;
  let value = initial;
  const requests: Array<string | null> = [];
  return {
    requests,
    set(next: T) { value = next; version += 1; },
    load: async (etag: string | null): Promise<ConditionalResult<T>> => {
      requests.push(etag);
      const tag = `"v${version}"`;
      return etag === tag ? { notModified: true } : { notModified: false, value, etag: tag };
    },
  };
}

test("an unchanged resource is revalidated with its tag and never re-notifies", async () => {
  const clock = fakeEnv();
  const server = fakeServer({ n: 1 });
  const poll = createSharedPoll({ load: server.load, intervalMs: 2000, env: clock.env });
  const seen: unknown[] = [];
  poll.subscribe((value) => seen.push(value));
  await settle();
  await clock.tick();
  await clock.tick();
  assert.deepEqual(server.requests, [null, '"v1"', '"v1"']);
  assert.equal(seen.length, 1, "304s must not trigger a state update");
});

test("a changed resource triggers exactly one refetch delivery", async () => {
  const clock = fakeEnv();
  const server = fakeServer({ n: 1 });
  const poll = createSharedPoll({ load: server.load, intervalMs: 2000, env: clock.env });
  const seen: Array<{ n: number }> = [];
  poll.subscribe((value) => seen.push(value));
  await settle();
  server.set({ n: 2 });
  await clock.tick();
  await clock.tick();
  assert.deepEqual(seen, [{ n: 1 }, { n: 2 }]);
  assert.deepEqual(server.requests, [null, '"v1"', '"v2"']);
});

test("a hidden document stops polling and catches up immediately when shown", async () => {
  const clock = fakeEnv();
  const server = fakeServer({ n: 1 });
  const poll = createSharedPoll({ load: server.load, intervalMs: 2000, env: clock.env });
  poll.subscribe(() => undefined);
  await settle();
  await clock.setHidden(true);
  const afterHide = server.requests.length;
  await clock.tick(); // the timer armed while visible sees the hidden document
  await clock.tick();
  assert.equal(clock.pendingTimers(), 0, "no timer is armed while hidden");
  assert.equal(server.requests.length, afterHide, "no requests while hidden");
  server.set({ n: 2 });
  await clock.setHidden(false);
  assert.equal(server.requests.length, afterHide + 1, "becoming visible refreshes at once");
  assert.equal(clock.pendingTimers(), 1, "polling resumes");
});

test("duplicate subscribers share one request per interval", async () => {
  const clock = fakeEnv();
  const server = fakeServer({ n: 1 });
  const poll = createSharedPoll({ load: server.load, intervalMs: 2000, env: clock.env });
  const a: unknown[] = [];
  const b: unknown[] = [];
  const stopA = poll.subscribe((value) => a.push(value));
  poll.subscribe((value) => b.push(value));
  await settle();
  server.set({ n: 2 });
  await clock.tick();
  assert.equal(server.requests.length, 2);
  assert.equal(a.length, 2);
  assert.equal(b.length, 2);
  stopA();
  await clock.tick();
  assert.equal(server.requests.length, 3, "remaining subscriber keeps the single poll alive");
});

test("a forced refresh after a decision always delivers, and older results are identifiable", async () => {
  const clock = fakeEnv();
  const server = fakeServer({ n: 1 });
  const poll = createSharedPoll({ load: server.load, intervalMs: 2000, env: clock.env });
  const deliveries: number[] = [];
  poll.subscribe((_value, delivery) => deliveries.push(delivery.requestId));
  await settle();
  const staleThrough = poll.issuedRequestId();
  const value = await poll.refresh({ force: true });
  assert.deepEqual(value, { n: 1 });
  assert.equal(server.requests.at(-1), null, "forced loads skip the conditional header");
  assert.ok(deliveries.at(-1)! > staleThrough);
});

test("proposal inbox feed: one batch request per tick, none while unchanged details are cached", async () => {
  const clock = fakeEnv();
  const inbox: ProposalInboxResponse = {
    revision: "r1",
    proposals: [{ proposal_id: "p1", created_at: "", status: "pending", brief: null, summary: "", mode: "workshop", decision: "propose", option_count: 1, stale: false } as ProposalInboxResponse["proposals"][number]],
    details: { p1: { status: "pending", stale: false, review: [] } },
  };
  const server = fakeServer(inbox);
  const feed = proposalInboxFeed({ projectId: "feed-test", getProposalInbox: server.load }, clock.env);
  const counts: number[] = [];
  const panel: ProposalInboxResponse[] = [];
  feed.subscribe((value) => counts.push(value.proposals.length)); // toolbar badge
  feed.subscribe((value) => panel.push(value)); // review panel
  await settle();
  await clock.tick();
  await clock.tick();
  assert.equal(server.requests.length, 3, "no per-proposal detail requests");
  assert.equal(panel.length, 1);
  assert.deepEqual(panel[0].details.p1, { status: "pending", stale: false, review: [] });
  assert.deepEqual(counts, [1]);
});
