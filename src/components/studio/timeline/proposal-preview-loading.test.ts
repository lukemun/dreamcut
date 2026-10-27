import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { PREVIEW_LOADING_DELAY_MS, previewLoadingShown } from "./proposal-preview-loading";

const panel = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "ProposalsPanel.tsx"), "utf8");

test("the first preparation of a preview shows Loading at once", () => {
  assert.equal(previewLoadingShown({ loading: true, previewKey: "p1:a", readyKey: null, loadingElapsedMs: 0 }), true);
  // Switching to another card or option is a new first preparation.
  assert.equal(previewLoadingShown({ loading: true, previewKey: "p2:a", readyKey: "p1:a", loadingElapsedMs: 0 }), true);
});

test("tuning an already-previewed card keeps Replay through every quick re-preparation", () => {
  // A dial drag: the shown preview re-prepares on each value, each settling well under the delay.
  for (const elapsed of [0, 16, 120, 300, PREVIEW_LOADING_DELAY_MS - 1]) {
    assert.equal(previewLoadingShown({ loading: true, previewKey: "p1:a", readyKey: "p1:a", loadingElapsedMs: elapsed }), false);
  }
  assert.equal(previewLoadingShown({ loading: false, previewKey: "p1:a", readyKey: "p1:a", loadingElapsedMs: 0 }), false);
});

test("a re-preparation that runs long still shows Loading", () => {
  assert.equal(previewLoadingShown({ loading: true, previewKey: "p1:a", readyKey: "p1:a", loadingElapsedMs: PREVIEW_LOADING_DELAY_MS }), true);
});

test("the card's play button reads the settled loading state and keeps its word while loading", () => {
  assert.match(panel, /previewLoading: preparingPreview = false/);
  assert.match(panel, /const previewLoading = useShownPreviewLoading\(preparingPreview,/);
  // The play icon and the loading dots stack in one icon cell; the inactive one is invisible, never unmounted.
  assert.match(panel, /grid w-3\.5 items-center justify-items-center \[&>\*\]:col-start-1 \[&>\*\]:row-start-1/);
  assert.match(panel, /row-start-1 \$\{REVIEW_ROW_ICON\}/);
  assert.match(panel, /<PlayIcon aria-hidden="true" className=\{previewLoading && previewing \? "invisible" : ""\} \/>/);
  assert.match(panel, /previewLoading && previewing \? "" : "invisible"/);
  // The word sits outside the icon cell, so loading never hides it (review-action-row-v1).
  assert.match(panel, /<\/span>\n\s*<span className=\{previewing \? REVIEW_ACTION_WORD_CROWDED : REVIEW_ACTION_WORD\}>\{previewing \? "Replay" : "Preview"\}<\/span>/);
  // The batch bar's Preview keeps its word too.
  assert.match(panel, /<PlayIcon aria-hidden="true" className=\{previewLoading \? "invisible" : ""\} \/>/);
  assert.doesNotMatch(panel, /aria-label="Loading preview" className="inline-flex items-center gap-1\.5"><LoadingDots \/>/);
});
