import assert from "node:assert/strict";
import test from "node:test";
import { groupGuideEffects } from "./guide-groups";
import type { GuideEffect } from "./guide";

const make = (id: string, family?: GuideEffect["family"]): GuideEffect => ({
  id, skill: "recreate-effect", title: id, description: id, prompt: id, inputs: [], origin: "user", family,
});

test("variants stay together and ordinary recipes keep their positions", () => {
  const family = { id: "postcards", title: "Moving postcards", variant: "Cascade" };
  const groups = groupGuideEffects([make("a", family), make("single"), make("b", { ...family, variant: "Strip close" })]);
  assert.deepEqual(groups.map(group => [group.title, group.effects.map(effect => effect.id)]), [
    ["Moving postcards", ["a", "b"]], [undefined, ["single"]],
  ]);
});
