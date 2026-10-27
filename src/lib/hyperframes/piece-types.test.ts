import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { applyControlResets } from "./control-resets";
import { parseCompositionManifest } from "./composition-manifest";
import { looksWithPiece, pieceControls, pieceLookProblem, pieceTypeOf, pieceTypes } from "./piece-types";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "piece-types-"));
  const dir = path.join(root, ".agents/skills/motion-graphics/looks");
  fs.mkdirSync(dir, { recursive: true });
  const write = (name: string, value: unknown) => fs.writeFileSync(path.join(dir, name), JSON.stringify(value));
  write("pieces.json", {
    schema_version: 1, template: "illustrated-explainer",
    sections: { stage: { label: "World" }, front: { label: "Front light" } },
    scenes: {
      title: { label: "Title", pieces: { card: "Card" } },
      people: { label: "People", pieces: { "person#": "Person" } },
      closing: { label: "Closing", pieces: { "chip-*": "Chip" } },
    },
  });
  write("looks.json", { schema_version: 2, works_with: ["illustrated-explainer"], order: ["paper", "glass", "linocut"] });
  write("paper.json", { id: "paper", title: "Paper" });
  write("glass.json", { id: "glass", title: "Glass", pieces: ["front", "title", "title-card", "people-person#", "closing-chip-*"] });
  write("linocut.json", { id: "linocut", title: "Linocut", pieces: ["title"] });
  return root;
}

const manifest = parseCompositionManifest({
  schema_version: 1, template: "illustrated-explainer",
  controls: [
    { id: "look", kind: "choice", label: "Look", default: "paper", options: [{ value: "paper", label: "Paper" }, { value: "glass", label: "Glass" }, { value: "linocut", label: "Linocut" }] },
    { id: "palette", kind: "choice", label: "Palette", default: "original", resets_with: "look", options: [{ value: "original", label: "Original" }, { value: "dark", label: "Dark" }] },
    { id: "title", kind: "text", label: "Title", default: "Hello" },
    { id: "layer", kind: "text", label: "Layer", default: "all", fixed: true },
  ],
});

test("layer names resolve to their piece type, numbered and named pieces included", () => {
  const root = fixture();
  assert.equal(pieceTypeOf("stage", root)?.kind, "section");
  assert.equal(pieceTypeOf("title", root)?.kind, "scene");
  assert.equal(pieceTypeOf("title-card", root)?.id, "title-card");
  assert.equal(pieceTypeOf("people-person-3", root)?.id, "people-person#");
  assert.equal(pieceTypeOf("closing-chip-play", root)?.id, "closing-chip-*");
  assert.equal(pieceTypeOf("chart-1", root), null);
});

test("every look draws a world; other pieces only where a look declares them", () => {
  const root = fixture();
  assert.deepEqual(looksWithPiece("stage", root).map((look) => look.id), ["paper", "glass", "linocut"]);
  assert.deepEqual(looksWithPiece("title", root).map((look) => look.id), ["glass", "linocut"]);
  assert.deepEqual(looksWithPiece("title-card", root).map((look) => look.id), ["glass"]);
});

test("a piece in a look that does not draw it is refused, naming the looks that do", () => {
  const root = fixture();
  assert.equal(pieceLookProblem(manifest, { look: "linocut", layer: "title" }, root), null);
  assert.equal(pieceLookProblem(manifest, { look: "glass", layer: "all" }, root), null);
  assert.equal(pieceLookProblem(manifest, { look: "linocut", layer: "title-card" }, root), "Linocut has no title card piece. Looks with one: Glass.");
  assert.match(pieceLookProblem(manifest, { look: "glass", layer: "chart-1" }, root) ?? "", /not a piece/);
});

test("a split piece offers only the looks that draw it; a single look is not offered", () => {
  const root = fixture();
  const title = pieceControls(manifest, { look: "glass", layer: "title" }, root).find((control) => control.id === "look");
  assert.deepEqual(title?.kind === "choice" && title.options.map((option) => option.value), ["glass", "linocut"]);
  const card = pieceControls(manifest, { look: "glass", layer: "title-card" }, root).find((control) => control.id === "look");
  assert.equal(card?.fixed, true);
  assert.equal(pieceControls(manifest, { look: "glass", layer: "all" }, root), manifest.controls);
});

test("switching the look keeps content and resets the old look's style", () => {
  const before = { look: "glass", palette: "dark", title: "Mine", layer: "title" };
  assert.deepEqual(applyControlResets(manifest.controls, before, { ...before, look: "linocut" }), { look: "linocut", palette: "original", title: "Mine", layer: "title" });
  // Changing the style itself, or content, resets nothing.
  assert.deepEqual(applyControlResets(manifest.controls, before, { ...before, palette: "original" }), { ...before, palette: "original" });
  assert.deepEqual(applyControlResets(manifest.controls, before, { ...before, title: "New" }), { ...before, title: "New" });
});

test("resets_with must name another control", () => {
  assert.throws(() => parseCompositionManifest({ schema_version: 1, controls: [{ id: "palette", kind: "switch", label: "Palette", default: false, resets_with: "look" }] }), /resets_with must name a control/);
});

test("every piece a look declares is in the registry", () => {
  const dir = path.join(process.cwd(), ".agents/skills/motion-graphics/looks");
  const known = new Set([...pieceTypes().keys()]);
  const order = (JSON.parse(fs.readFileSync(path.join(dir, "looks.json"), "utf8")) as { order: string[] }).order;
  for (const id of order) {
    const look = JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), "utf8")) as { pieces?: string[] };
    for (const piece of look.pieces ?? []) assert.ok(known.has(piece), `${id} declares unknown piece ${piece}`);
  }
});
