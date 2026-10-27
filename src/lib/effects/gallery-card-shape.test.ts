import assert from "node:assert/strict";
import test from "node:test";

import { cardPictureAspect } from "./gallery";
import { lookGuideEffects } from "./looks";
import { recipeVisualFor } from "./recipe-visuals";
import type { GuideEffect } from "./guide";

const effect = (fields: Partial<GuideEffect>): GuideEffect => ({ skill: "s", title: "t", description: "d", prompt: "p", inputs: [], ...fields });

test("a card's picture shape is read from the file it shows, so the grid can size it before it loads", async () => {
  const look = lookGuideEffects().find((candidate) => recipeVisualFor(candidate)?.poster);
  assert.ok(look, "a bundled look with a picture");
  const aspect = await cardPictureAspect(look);
  assert.ok(aspect && aspect > 0.2 && aspect < 5, `a real width ÷ height (${aspect})`);
});

test("pictures the app does not serve from public/ keep their natural size", async () => {
  assert.equal(await cardPictureAspect(effect({ poster: "https://example.com/poster.jpg" })), null);
  assert.equal(await cardPictureAspect(effect({ poster: "/missing/poster.jpg" })), null);
  assert.equal(await cardPictureAspect(effect({ poster: "/../package.json" })), null);
  assert.equal(await cardPictureAspect(effect({})), null);
});
