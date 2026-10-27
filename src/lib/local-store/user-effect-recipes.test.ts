import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import test from "node:test";
import { readUserEffectRecipes, resolveUserEffectMedia, userEffectRecipesSchema, userGuideEffects } from "./user-effect-recipes";

const bytes = Buffer.from("private example fixture");
const hash = createHash("sha256").update(bytes).digest("hex");
const recipe = {
  id: "speed-effect", title: "Speed effect", description: "Subject enters and exits.",
  skill: "recreate-effect", status: "candidate",
  inputs: [{ title: "Film the empty scene", directions: "Keep the camera in place, step out and record a few seconds." }],
  preparation: "Prepare a moving subject mask.", prompt: "Recreate this reference using my takes.",
  limitations: ["Not recreated yet."],
  reference: { url: "https://example.com/reference", credit: "Example creator", file: "examples/speed.mp4", sha256: hash, source_sha256: hash, source_start_seconds: 0, source_end_seconds: 3 },
};
function fixture(t: test.TestContext) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "user-effects-"));
  t.after(() => fs.rmSync(profile, { recursive: true, force: true }));
  const root = path.join(profile, "effect-recipes");
  fs.mkdirSync(path.join(root, "examples"), { recursive: true });
  fs.writeFileSync(path.join(root, "catalog.json"), JSON.stringify({ schema_version: 1, recipes: [recipe] }));
  fs.writeFileSync(path.join(root, recipe.reference.file), bytes);
  return { profile, root };
}
test("empty profiles do not create or publish personal data", t => {
  const { profile, root } = fixture(t);
  fs.unlinkSync(path.join(root, "catalog.json"));
  assert.deepEqual(readUserEffectRecipes(profile).recipes, []);
  assert.deepEqual(userGuideEffects(profile), []);
  assert.equal(fs.existsSync(path.join(root, "catalog.json")), false);
});
test("private reference candidates have distinct identities, filming directions and reference labels", t => {
  const { profile } = fixture(t);
  const [row] = userGuideEffects(profile);
  assert.equal(row.origin, "user");
  assert.equal(row.id, "user-speed-effect");
  assert.equal(row.exampleKind, "reference");
  assert.equal(row.status, "candidate");
  assert.deepEqual(row.inputDirections, recipe.inputs);
  assert.match(row.video!, /^\/api\/guide\/user-effects\/speed-effect\/media\?v=/);
  assert.ok(resolveUserEffectMedia("speed-effect", profile));
  assert.equal(resolveUserEffectMedia("FX-SPEED-EFFECT", profile), null);
});
test("media lookup rejects traversal, changed bytes, missing files and symlink escapes", t => {
  const { profile, root } = fixture(t);
  const file = path.join(root, recipe.reference.file);
  assert.equal(resolveUserEffectMedia("../speed-effect", profile), null);
  fs.writeFileSync(file, "different bytes");
  assert.equal(resolveUserEffectMedia("speed-effect", profile), null);
  fs.unlinkSync(file);
  assert.equal(resolveUserEffectMedia("speed-effect", profile), null);
  const outside = path.join(profile, "outside.mp4");
  fs.writeFileSync(outside, bytes);
  fs.symlinkSync(outside, file);
  assert.equal(resolveUserEffectMedia("speed-effect", profile), null);
});
test("private variant metadata reaches the Guide without changing recipe identity", t => {
  const { profile, root } = fixture(t);
  const catalog = { schema_version: 1, recipes: [{ ...recipe, family: { id: "moving-postcards", title: "Moving postcards", variant: "Cascade" } }] };
  fs.writeFileSync(path.join(root, "catalog.json"), JSON.stringify(catalog));
  const [row] = userGuideEffects(profile);
  assert.deepEqual(row.family, catalog.recipes[0].family);
  assert.equal(row.id, "user-speed-effect");
});
test("unsupported versions, duplicate identities, unsafe paths and unsupported verification claims fail closed", () => {
  for (const value of [
    { schema_version: 2, recipes: [recipe] },
    { schema_version: 1, recipes: [recipe, recipe] },
    { schema_version: 1, recipes: [{ ...recipe, status: "complete" }] },
    { schema_version: 1, recipes: [{ ...recipe, reference: { ...recipe.reference, file: "../outside.mp4" } }] },
    { schema_version: 1, recipes: [{ ...recipe, reference: { ...recipe.reference, url: "javascript:alert(1)" } }] },
    { schema_version: 1, recipes: [{ ...recipe, family: { id: "postcards", title: "Moving postcards", variant: "Cascade" } }, { ...recipe, id: "other", family: { id: "postcards", title: "Moving postcards", variant: "Cascade" } }] },
  ]) assert.equal(userEffectRecipesSchema.safeParse(value).success, false);
});

test("full tutorials are separately addressed and hash verified without replacing short previews", t => {
  const { profile, root } = fixture(t);
  const tutorial = { file: "examples/full.mp4", sha256: hash };
  fs.writeFileSync(path.join(root, tutorial.file), bytes);
  fs.writeFileSync(path.join(root, "catalog.json"), JSON.stringify({ schema_version: 1, recipes: [{ ...recipe, tutorial }] }));
  const [row] = userGuideEffects(profile);
  assert.match(row.tutorialVideo!, /full=1/);
  assert.ok(!row.video!.includes("full=1"));
  assert.equal(resolveUserEffectMedia(recipe.id, profile, true)?.file, fs.realpathSync(path.join(root, tutorial.file)));
  fs.writeFileSync(path.join(root, tutorial.file), "changed");
  assert.equal(resolveUserEffectMedia(recipe.id, profile, true), null);
  assert.ok(resolveUserEffectMedia(recipe.id, profile));
});

test("a chosen card poster is served as a hash-verified still, separate from the clip", t => {
  const { profile, root } = fixture(t);
  const poster = { file: "examples/speed-poster.jpg", sha256: hash };
  fs.writeFileSync(path.join(root, poster.file), bytes);
  fs.writeFileSync(path.join(root, "catalog.json"), JSON.stringify({ schema_version: 1, recipes: [{ ...recipe, reference: { ...recipe.reference, poster } }] }));
  const [row] = userGuideEffects(profile);
  assert.match(row.poster!, /poster=1/);
  assert.deepEqual(resolveUserEffectMedia(recipe.id, profile, "poster"), { file: fs.realpathSync(path.join(root, poster.file)), contentType: "image/jpeg" });
  assert.equal(resolveUserEffectMedia(recipe.id, profile)?.contentType, "video/mp4");
  fs.writeFileSync(path.join(root, poster.file), "changed");
  assert.equal(resolveUserEffectMedia(recipe.id, profile, "poster"), null);
});

test("the creator's own result and supplied footage are separately addressed and hash verified", t => {
  const { profile, root } = fixture(t);
  const result = { file: "examples/yours.mp4", sha256: hash };
  const supplied = [{ label: "Your take", file: "examples/take.mp4", sha256: hash }];
  fs.writeFileSync(path.join(root, result.file), bytes);
  fs.writeFileSync(path.join(root, supplied[0].file), bytes);
  fs.writeFileSync(path.join(root, "catalog.json"), JSON.stringify({ schema_version: 1, recipes: [{ ...recipe, result, supplied }] }));
  const [row] = userGuideEffects(profile);
  assert.match(row.ownResultVideo!, /result=1/);
  assert.deepEqual(row.suppliedVideos!.map(item => item.label), ["Your take"]);
  assert.match(row.suppliedVideos![0].video, /supplied=0/);
  assert.equal(resolveUserEffectMedia(recipe.id, profile, "result")?.file, fs.realpathSync(path.join(root, result.file)));
  assert.equal(resolveUserEffectMedia(recipe.id, profile, { supplied: 0 })?.file, fs.realpathSync(path.join(root, supplied[0].file)));
  assert.equal(resolveUserEffectMedia(recipe.id, profile, { supplied: 1 }), null);
  fs.writeFileSync(path.join(root, supplied[0].file), "changed");
  assert.equal(resolveUserEffectMedia(recipe.id, profile, { supplied: 0 }), null);
});
