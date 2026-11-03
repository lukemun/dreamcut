import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { buildLaneDefs } from "./adapters";
import { pendingProposalClips, pendingProposalClipsWanted, pendingProposalView } from "./pending-proposal-clips";
import type { TimelineElement } from "./types";

const clip = (id: string, removed = false) => ({ id, lane_key: "visual_1", removed_at: removed ? "2026-10-22T00:00:00Z" : null }) as unknown as TimelineElement;

test("checked proposals show the clips they add and the live clips they replace", () => {
  const live = [clip("baked"), clip("music"), clip("old", true)];
  const draft = [clip("baked", true), clip("music"), clip("word"), clip("subline"), clip("old", true)];
  const { added, addedIds, outgoingIds } = pendingProposalClips(live, draft);
  assert.deepEqual(added.map((element) => element.id), ["word", "subline"]);
  assert.deepEqual([...addedIds], ["word", "subline"]);
  assert.deepEqual([...outgoingIds], ["baked"], "an unchanged clip and one already removed are not outgoing");
  assert.deepEqual([...pendingProposalClips(live, [clip("music")]).outgoingIds], ["baked"], "a clip missing from the draft is outgoing");
});

test("a card that adds a lane keeps that lane and clip on the timeline with Proposals closed", () => {
  // The owner's repro (2026-10-28): a pending card adds "Proposal card (drop 2)" on a new lane, visual_2.
  // Closing the drawer (and reloading, which starts with it closed) must leave both in view.
  const live = [{ id: "phrase", lane_key: "visual_1", start_seconds: 0, duration_seconds: 20, removed_at: null }] as unknown as TimelineElement[];
  const card = { id: "card", lane_key: "visual_2", start_seconds: 14.67, duration_seconds: 3, removed_at: null } as unknown as TimelineElement;
  const lanes = buildLaneDefs(live, new Map(), 1, {}, ["visual_1"]);
  assert.equal(pendingProposalClipsWanted({ proposals: true, checkedCount: 1 }), true);
  assert.equal(pendingProposalClipsWanted({ proposals: true, checkedCount: 0 }), false);
  const view = pendingProposalView({ live, lanes, draft: { elements: [...live, card], laneOrderKeys: ["visual_2", "visual_1"] }, laneScale: 1 });
  assert.ok(view);
  assert.deepEqual(view.lanes.map((lane) => lane.key).filter((key) => key.startsWith("visual_")), ["visual_2", "visual_1"], "the new lane sits in the draft's order");
  assert.deepEqual(view.elements.map((element) => element.id), ["phrase", "card"]);
  assert.deepEqual([...view.pendingIds], ["card"]);
});

test("pending clips do not depend on the Proposals drawer being open", () => {
  // Regression: the gate once read `reviewDrawerOpen`, so closing the drawer dropped the card's lane.
  const timelineStep = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "TimelineStep.tsx"), "utf8");
  const gate = timelineStep.match(/const pendingDraftWanted = ([^;]+);/)?.[1] ?? "";
  assert.match(gate, /pendingProposalClipsWanted\(/);
  assert.doesNotMatch(gate, /reviewDrawerOpen|proposalPreviewSelection/);
  assert.match(timelineStep, /pendingProposalView\(\{ live: elements, lanes, draft: pendingDraft, laneScale \}\)/);
  // The panel that owns the checked set stays mounted while closed, in the dock and the slide-out drawer.
  assert.match(timelineStep, /createPortal\(reviewDrawerNode, dock\.reviewTarget\)/);
  assert.match(timelineStep, /<SlideOutDrawer open=\{reviewDrawerOpen\}[^>]*>\{reviewDrawerNode\}<\/SlideOutDrawer>/);
});

test("a checked card that only changes existing clips keeps them marked with Proposals closed", () => {
  // The owner's repro (2026-10-29): a card that swaps a clip's render or sets a sound's level adds no clip,
  // so closing the drawer showed nothing of it. Clips it changes in place are tinted for review instead.
  const live = [
    { id: "panel", lane_key: "visual_2", source_url: "/render-a.webm", timeline_start: 18.3, duration: 3.6, props: { title: "Panel" }, updated_at: "a", removed_at: null },
    { id: "music", lane_key: "music_1", source_url: "/song.mp3", timeline_start: 0, duration: 34.6, props: { title: "Music" }, updated_at: "a", removed_at: null },
    { id: "words", lane_key: "visual_1", source_url: "/words.webm", timeline_start: 0, duration: 7.4, props: { title: "Words", a: 1, b: 2 }, updated_at: "a", removed_at: null },
  ] as unknown as TimelineElement[];
  const draft = [
    { ...live[0], source_url: "/render-b.webm" },
    { ...live[1], props: { title: "Music", volume_envelope: [{ time_seconds: 0, volume: 1 }, { time_seconds: 13.8, volume: 0 }] } },
    // Same clip with its props in another order and fresh bookkeeping: not a change.
    { ...live[2], props: { b: 2, a: 1, title: "Words" }, updated_at: "b" },
  ] as unknown as TimelineElement[];
  assert.deepEqual([...pendingProposalClips(live, draft).changedIds], ["panel", "music"]);
  const lanes = buildLaneDefs(live, new Map(), 1, {}, []);
  const view = pendingProposalView({ live, lanes, draft: { elements: draft, laneOrderKeys: [] }, laneScale: 1 });
  assert.ok(view, "a card with only in-place changes still shows on the timeline");
  assert.deepEqual([...view.changedIds], ["panel", "music"]);
  assert.deepEqual(view.elements.map((element) => element.source_url), live.map((element) => element.source_url), "the timeline keeps the live clips, so editing one never writes the card's values");
});

test("the timeline tints changed clips and the Proposals button shows proposal mode while closed", () => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const timelineStep = fs.readFileSync(path.join(dir, "..", "TimelineStep.tsx"), "utf8");
  assert.match(timelineStep, /previewHighlightIds=\{proposalPreviewTouchedIds \?\? \(proposalPreviewTimelineElements \? null : pendingView\?\.changedIds \?\? null\)\}/);
  assert.match(timelineStep, /proposalModeActive=\{!reviewDrawerOpen && \(proposalPreviewSelection != null \|\| pendingView != null\)\}/);
  const toolbar = fs.readFileSync(path.join(dir, "TimelineToolbar.tsx"), "utf8");
  assert.match(toolbar, /data-proposal-mode=\{proposalModeActive \? "" : undefined\}/);
  // In the header group, where the panel buttons sit; a looser selector there loses to the group's reset.
  const css = fs.readFileSync(path.join(dir, "..", "..", "..", "app", "editor-glass.css"), "utf8");
  assert.match(css, /\.editor-chrome \.workspace-panel-group button\.workspace-panel-button\[data-proposal-mode\][^{]*\{[^}]*box-shadow: inset 0 0 0 1\.5px var\(--attention\)/);
});

test("closing Proposals leaves a running preview live", () => {
  // The owner's repro (2026-10-29): closing the drawer with its top button ended the preview.
  const timelineStep = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "TimelineStep.tsx"), "utf8");
  const effect = timelineStep.match(/const previewWasActiveRef[\s\S]*?\}, \[[^\]]*\]\);/)?.[0] ?? "";
  assert.ok(effect, "the drawer follows the preview from one effect");
  assert.doesNotMatch(effect, /exitProposalPreview/, "closing the drawer never ends the preview");
  assert.match(effect, /started && !reviewDrawerOpen\) setReviewDrawerOpen\(true\)/, "starting a preview still opens Proposals");
  assert.doesNotMatch(timelineStep, /reviewWasOpenRef/);
});
