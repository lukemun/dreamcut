import test from "node:test";
import assert from "node:assert/strict";
import { assetDraftSchema } from "../generation/assets";
import { authoringInstructions, assembleAuthoredPrompt, promptDirectionSchema } from "../generation/prompt-authoring";
import { runWorker } from "../agent/worker-runner";

const draft = assetDraftSchema.parse({ task: "video", route: "fal", modelId: "kling-3-pro", intent: "Left arm first, right over left, hold.", references: [{ role: "start", source: "start.png", label: "start" }, { role: "subject", source: "face.png", label: "face" }] });
const result = { summary: "A continuous arm crossing", assumptions: [], action: "@Element1 crosses the left arm first, then the right over it and holds.", camera: "Locked camera.", environment: null, treatment: null, audio: "Music plays." };
test("authoring uses input inventory and intent, without sending asset paths or claiming pixel inspection", () => {
  const instructions = authoringInstructions(draft);
  assert.match(instructions, /INPUT ROLES: start, subject/);
  assert.match(instructions, /Left arm first/);
  assert.match(instructions, /do not see image/);
  assert.doesNotMatch(instructions, /face.png|start.png/);
});
test("model assembly preserves action order and excludes unrequested audio", () => {
  assert.equal(assembleAuthoredPrompt(draft, result), `${result.action} Locked camera.`);
  assert.throws(() => assembleAuthoredPrompt(draft, { ...result, action: "A person moves." }), /character mention/);
  const seedance = { ...draft, modelId: "seedance-2", references: [] };
  assert.equal(assembleAuthoredPrompt(seedance, { ...result, environment: "Leaves move." }), `${result.action} Leaves move. Locked camera.`);
});
test("structured read-only writer result is validated without media generation", async () => {
  const parsed = await runWorker({ prompt: authoringInstructions(draft), cwd: "/tmp", access: "read-only", timeoutMs: 1000 }, promptDirectionSchema, { id: "test", access: ["read-only"], async run(request) { assert.equal(request.access, "read-only"); return result; } });
  assert.equal(parsed.action, result.action);
  assert.throws(() => promptDirectionSchema.parse({ prompt: "invalid" }));
  assert.equal(draft.prompt, "");
});
