import assert from "node:assert/strict";
import test from "node:test";

import { motionControlTiers, motionGroups, motionItemTitle, splitSharedControls } from "./proposal-motion-groups";
import type { ProposalMotionItem } from "./timeline-client";

const controls = [
  { id: "number", kind: "number", label: "Point number", default: 1, min: 1, max: 4 },
  { id: "title", kind: "text", label: "Title", default: "Thesis" },
  { id: "entrance", kind: "choice", label: "Entrance", default: "slide", options: [] },
] as unknown as NonNullable<ProposalMotionItem["controls"]>;
const card = (operation_index: number, number: number, title: string): ProposalMotionItem => ({
  kind: "composition", id: "section-header", operation_index, target: "patch", source_url: `/m/${operation_index}.webm`, controls,
  values: { number, title, entrance: "slide" } });

test("four clips using one graphic become one group, other graphics stay separate", () => {
  const items = [card(0, 1, "Thesis"), card(1, 2, "Fundamental analysis"), { ...card(2, 1, "x"), id: "quote" }, card(3, 3, "Setup")];
  const groups = motionGroups(items);
  assert.deepEqual(groups.map((group) => group.map((item) => item.operation_index)), [[0, 1, 3], [2]]);
});

test("settings every copy shares show once; only the differences show per clip", () => {
  const { shared, own } = splitSharedControls(controls, [{ number: 1, title: "Thesis", entrance: "slide" }, { number: 2, title: "Setup", entrance: "slide" }]);
  assert.deepEqual(shared.map((control) => control.id), ["entrance"]);
  assert.deepEqual(own.map((control) => control.id), ["number", "title"]);
});

test("each clip's dials are named after that clip, even when the adjustment list is empty", () => {
  const option = { adjustment_rows: [], rows: [{ element_label: "Section: Setup", changes: [{ operation_index: 3 }] }] } as never;
  assert.equal(motionItemTitle(option, { operation_index: 3 }), "Section: Setup");
});

test("a swapped graphic leads with the settings it changes; fixed settings never show", () => {
  const withFixed = [{ ...controls[0]!, fixed: true as const }, controls[1]!, controls[2]!];
  // A new graphic: every shown dial is main.
  assert.deepEqual(motionControlTiers(withFixed, [{ values: { title: "Thesis" } }]).main.map((control) => control.id), ["title", "entrance"]);
  // A swap that changes the entrance: that is the main dial, the rest sit in Advanced.
  const swap = motionControlTiers(withFixed, [{ values: { title: "Setup", entrance: "fade" }, replaced_values: { title: "Setup", entrance: "slide" } }]);
  assert.deepEqual(swap.main.map((control) => control.id), ["entrance"]);
  assert.deepEqual(swap.advanced.map((control) => control.id), ["title"]);
  // A re-render with the same values (a fix in the graphic's code): everything sits in Advanced.
  const same = { values: { title: "Exit", entrance: "slide" }, replaced_values: { title: "Exit", entrance: "slide" } };
  assert.deepEqual(motionControlTiers(withFixed, [same, same]).main, []);
  // The agent's pick wins over the comparison.
  assert.deepEqual(motionControlTiers(withFixed, [same], ["title"]).main.map((control) => control.id), ["title"]);
  assert.deepEqual(motionGroups([{ ...card(0, 1, "Thesis"), controls: [withFixed[0]!] }]), []);
});
