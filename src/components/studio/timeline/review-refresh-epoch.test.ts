import test from "node:test";
import assert from "node:assert/strict";
import { createReviewRefreshEpoch, restoreReviewRefreshEpoch } from "./review-refresh-epoch";

test("live upgrades recover a legacy numeric ref without replacing a valid epoch", () => {
  const restored = restoreReviewRefreshEpoch(0);
  assert.equal(restored.capture(), 0);
  restored.invalidate();
  assert.equal(restoreReviewRefreshEpoch(restored), restored);
  assert.equal(restored.capture(), 1);
});

test("a refresh begun before choosing cannot bring the finished audition back", async () => {
  const epoch = createReviewRefreshEpoch();
  let cards = ["section-a", "section-b"];
  const request = epoch.capture();
  const delayedResponse = Promise.resolve([...cards]);
  epoch.invalidate();
  cards = cards.filter(id => id !== "section-a");
  const staleCards = await delayedResponse;
  if (epoch.isCurrent(request)) cards = staleCards;
  assert.deepEqual(cards, ["section-b"]);
});

test("Undo invalidates old requests but allows a fresh response to reopen the section", () => {
  const epoch = createReviewRefreshEpoch();
  epoch.invalidate(); // successful choice
  const beforeUndo = epoch.capture();
  epoch.invalidate(); // project restored
  assert.equal(epoch.isCurrent(beforeUndo), false);
  assert.equal(epoch.isCurrent(epoch.capture()), true);
});
