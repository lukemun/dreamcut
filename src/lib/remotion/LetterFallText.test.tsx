import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LetterFallText } from "./LetterFallText";

// Golden digest of Standard's glyph markup captured before letter-fall math moved
// to the shared timeline owner. A change here changes Standard pixels.
test("Standard letter-fall glyph markup stays byte-identical across the shared-owner refactor", () => {
  const out: string[] = [];
  for (const text of ["HHH", "Töltött\nkáposzta", "Hello  world!\nA b", "x"])
    for (const order of ["outside_in", "left_to_right", "right_to_left"] as const)
      for (const elapsed of [-1, 0, .01, .1, .2333, .45, .6, 1, 2, 5])
        for (const [seconds, stagger] of [[.45, .04], [.8, .2], [.2, 0]])
          out.push(renderToStaticMarkup(createElement(LetterFallText, { text, elapsed, seconds, stagger, height: 960, order })));
  assert.equal(out.length, 360);
  assert.equal(createHash("sha256").update(out.join("\n")).digest("hex"), "409d8fa135cadf0f598be7bd4cacc99fbf0257a6c5b6d6c28e286cca35e51ae9");
});
