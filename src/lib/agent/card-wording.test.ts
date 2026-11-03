import assert from "node:assert/strict";
import test from "node:test";

import { cardWordingIssues, cardWordingMessage, proposalWordingIssues } from "./card-wording";

test("build vocabulary in card text is caught with a plain alternative", () => {
  const issues = cardWordingIssues("Scrambled word on its own transparent clip, replacing the baked decode clip", "summary");
  assert.deepEqual(issues.map(issue => issue.word), ["baked", "transparent clip"]);
  assert.match(cardWordingMessage(issues), /summary \("baked"/);
  assert.deepEqual(cardWordingIssues("First line as its own native text", "label").map(issue => issue.word), ["native text"]);
  assert.deepEqual(cardWordingIssues("Set has_alpha on 3f2a9c1d-1111", "summary").map(issue => issue.word), ["has_alpha", "3f2a9c1d-1111"]);
});

test("plain descriptions and quoted words pass", () => {
  assert.deepEqual(cardWordingIssues("The name \"DreamCut\" slides in beside the logo", "summary"), []);
  assert.deepEqual(cardWordingIssues("Tagline \"baked fresh daily\" types on under the name", "summary"), []);
  assert.deepEqual(cardWordingIssues("Makes the DREAMCUT word its own clip you can edit", "summary"), []);
  assert.deepEqual(proposalWordingIssues({ summary: "Faster cut into the logo", options: [{ label: "Snappier", summary: "Trims the pause before the logo by half a second" }] }), []);
});

test("every option label and summary is checked", () => {
  const issues = proposalWordingIssues({ summary: "Logo spin", options: [{ label: "Native image", summary: "Uses the element's props" }] });
  assert.deepEqual(issues.map(issue => issue.field), ["options[0].label", "options[0].summary", "options[0].summary"]);
});
