import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  AnalysisPreviewOverlay,
  formatAnalysisConfidence,
  getAnonymousRegionLabel,
  projectAnalysisRegionsForDisplay,
  type AnalysisOverlayRegion,
} from "./AnalysisPreviewOverlay";

const focalRegion: AnalysisOverlayRegion = {
  id: "focal-1",
  kind: "focal",
  trackOrdinal: 2,
  rect: { x: 100, y: 50, width: 400, height: 300 },
  confidence: 0.876,
  evidence: "observed",
};

test("overlay labels stay anonymous while exposing confidence and gap state", () => {
  assert.equal(getAnonymousRegionLabel(focalRegion), "Focal region · Track 2 · 88% confidence · observed");
  assert.equal(
    getAnonymousRegionLabel({ ...focalRegion, trackOrdinal: null, evidence: "gap", confidence: null }),
    "Focal region · Anonymous subject · confidence unavailable · evidence gap",
  );
  assert.equal(formatAnalysisConfidence(1.8), "100% confidence");
});

test("composition-space rectangles are clipped and invalid evidence is omitted", () => {
  const projected = projectAnalysisRegionsForDisplay(
    [
      { ...focalRegion, rect: { x: -100, y: 50, width: 300, height: 400 } },
      { ...focalRegion, id: "outside", rect: { x: 900, y: 0, width: 20, height: 20 } },
      { ...focalRegion, id: "invalid", rect: { x: 0, y: 0, width: -2, height: 10 } },
    ],
    800,
    600,
  );

  assert.equal(projected.length, 1);
  assert.equal(projected[0]?.leftPct, 0);
  assert.equal(projected[0]?.widthPct, 25);
  assert.ok(Math.abs((projected[0]?.topPct ?? 0) - (50 / 6)) < 1e-10);
  assert.ok(Math.abs((projected[0]?.heightPct ?? 0) - (200 / 3)) < 1e-10);
});

test("overlay is hidden by default, has an accessible toggle, and keeps evidence pointer-safe", () => {
  const markup = renderToStaticMarkup(createElement(AnalysisPreviewOverlay, {
    compositionWidth: 800,
    compositionHeight: 600,
    regions: [focalRegion, {
      id: "exclude-1",
      kind: "exclusion",
      rect: { x: 0, y: 0, width: 120, height: 80 },
      confidence: 0.6,
      evidence: "interpolated",
    }],
  }));

  assert.match(markup, /aria-label="Show media analysis overlay"/);
  assert.match(markup, /aria-pressed="false"/);
  assert.match(markup, /hidden=""/);
  assert.match(markup, /data-analysis-region="focal"/);
  assert.match(markup, /data-analysis-region="exclusion"/);
  assert.match(markup, /pointer-events:none/);
  assert.doesNotMatch(markup, /person name|face identity/i);
});

test("overlay stays absent when no valid evidence exists", () => {
  const markup = renderToStaticMarkup(createElement(AnalysisPreviewOverlay, {
    compositionWidth: 800,
    compositionHeight: 600,
    regions: [],
  }));
  assert.equal(markup, "");
});
