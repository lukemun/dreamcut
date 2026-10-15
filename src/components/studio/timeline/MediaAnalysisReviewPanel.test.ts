import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  MediaAnalysisReviewPanel,
  buildAnonymousTrackDecision,
  getTrackReviewAvailability,
  type AnonymousTrackReviewItem,
} from "./MediaAnalysisReviewPanel";

const proposed: AnonymousTrackReviewItem = {
  trackId: "track-a",
  trackOrdinal: 1,
  sourceRevision: "revision-2",
  alias: "",
  role: "unassigned",
  rebaseState: "proposed",
  confirmationStatus: "unconfirmed",
  confidence: 0.82,
};

test("confirmation requires a current revision and an explicit human role choice", () => {
  assert.deepEqual(getTrackReviewAvailability(proposed, "revision-2"), {
    canEdit: true,
    canConfirm: false,
    reason: "Choose a subject role before confirming.",
  });
  assert.equal(buildAnonymousTrackDecision(proposed, "revision-2"), null);
  const stale = { ...proposed, role: "primary_subject" } as const;
  assert.equal(buildAnonymousTrackDecision(stale, "revision-3"), null);
  assert.deepEqual(getTrackReviewAvailability(stale, "revision-3"), {
    canEdit: false,
    canConfirm: false,
    reason: "Rebase this track to the current media revision first.",
  });
  assert.deepEqual(
    buildAnonymousTrackDecision({ ...proposed, alias: "  Lead reader  ", role: "primary_subject" }, "revision-2"),
    { trackId: "track-a", sourceRevision: "revision-2", alias: "Lead reader", role: "primary_subject" },
  );
});

test("needs-review tracks remain human-reviewable while orphaned tracks cannot be confirmed", () => {
  assert.deepEqual(
    getTrackReviewAvailability({ ...proposed, role: "other_subject", rebaseState: "needs_review" }, "revision-2"),
    { canEdit: true, canConfirm: true, reason: null },
  );
  assert.deepEqual(
    getTrackReviewAvailability({ ...proposed, role: "primary_subject", rebaseState: "orphaned" }, "revision-2"),
    { canEdit: false, canConfirm: false, reason: "This track no longer maps to the current media." },
  );
});

test("review panel renders all rebase states and explains that decisions are human-owned", () => {
  const noop = () => undefined;
  const markup = renderToStaticMarkup(createElement(MediaAnalysisReviewPanel, {
    currentRevision: "revision-2",
    tracks: [
      proposed,
      { ...proposed, trackId: "track-b", trackOrdinal: 2, rebaseState: "needs_review", role: "primary_subject" },
      { ...proposed, trackId: "track-c", trackOrdinal: 3, rebaseState: "orphaned", sourceRevision: "revision-1" },
    ],
    onAliasChange: noop,
    onRoleChange: noop,
    onConfirm: noop,
    onRequestRelink: noop,
  }));

  assert.match(markup, /Review anonymous tracks/);
  assert.doesNotMatch(markup, /Analysis never identifies or confirms a person for you/);
  assert.match(markup, /data-track-review-state="proposed"/);
  assert.match(markup, /data-track-review-state="needs_review"/);
  assert.match(markup, /data-track-review-state="orphaned"/);
  assert.match(markup, /Needs review/);
  assert.match(markup, /No current match/);
  assert.match(markup, /Find a current match/);
  assert.match(markup, /Choose a subject role before confirming/);
});

test("review panel has no mount-time confirmation path", () => {
  const source = readFileSync(new URL("./MediaAnalysisReviewPanel.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /useEffect|useLayoutEffect/);
  assert.equal(source.match(/onConfirm\(decision\)/g)?.length, 1);
  assert.match(source, /onClick=\{\(\) => \{[\s\S]*onConfirm\(decision\)/);
});
