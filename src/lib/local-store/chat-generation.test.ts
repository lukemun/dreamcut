import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { generationDir, listAssetJobs, readAssetJob } from "./asset-generation";
import { DraftSubmitRefusal, markStagedDraftViewed, readAssetWorkspace } from "./asset-generation-workspace";
import { approveChatGeneration, draftChatGeneration, GENERATIONS_PROJECT_ID } from "./chat-generation";
import { cloudSessionFile, signOutOfCloud } from "./cloud-account";
import { writePrivateCredential } from "./provider-keys";
import { createProject } from "./store";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==", "base64");

test("chat generation drafts with quality defaults and a prompt guide, then generates once on chat approval of the price", async () => {
  const keys = ["TIMELINE_PROJECTS_DIR", "DREAMCUT_PROFILE_DIR", "DREAMCUT_ASSET_AUTOSTART"];
  const saved = Object.fromEntries(keys.map(k => [k, process.env[k]])), originalFetch = globalThis.fetch;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "chat-generation-"));
  process.env.TIMELINE_PROJECTS_DIR = path.join(root, "projects"); process.env.DREAMCUT_PROFILE_DIR = path.join(root, "profile"); process.env.DREAMCUT_ASSET_AUTOSTART = "0";
  fs.mkdirSync(process.env.TIMELINE_PROJECTS_DIR, { recursive: true });
  let price = 160, balance = 4000;
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.pathname === "/api/v1/quotes") return Response.json({ credits: price, catalogVersion: "test" });
    if (url.pathname === "/api/v1/me") return Response.json({ id: "u", email: "c@example.com", credits: balance });
    throw new Error(`unexpected ${url}`);
  };
  const signIn = () => writePrivateCredential(cloudSessionFile(), { access_token: "token", refresh_token: "r", expires_at: Math.floor(Date.now() / 1000) + 3600, email: "c@example.com", signed_in_at: new Date().toISOString() });
  const refusal = async (promise: Promise<unknown>, code: string) => {
    await assert.rejects(promise, (error: unknown) => { assert.ok(error instanceof DraftSubmitRefusal); assert.equal(error.code, code, error.message); return true; });
  };
  try {
    // No project named: the request lands in Generations; a text image gets GPT Image 2.5 at high quality.
    const image = await draftChatGeneration({ kind: "image", prompt: "A paper crane on a desk" }, "http://127.0.0.1:3123");
    assert.equal(image.project_id, GENERATIONS_PROJECT_ID);
    assert.deepEqual(image.model, { id: "gpt-image-2.5", name: "GPT Image 2.5", chosen: "quality default" });
    assert.equal(image.request.resolution, "high");
    assert.equal(image.readiness, "sign_in");
    assert.match(String(image.sign_in_url), /\/connect\?/);
    assert.match(image.prompt_guide, /in quotes/);
    assert.equal(listAssetJobs(GENERATIONS_PROJECT_ID).length, 0);
    // The draft fills the Generate form, so the creator sees the prompt and settings the agent chose.
    const form = readAssetWorkspace(GENERATIONS_PROJECT_ID);
    assert.equal(form.stagedId, image.draft_id);
    assert.deepEqual({ model: form.draft.modelId, prompt: form.draft.prompt, resolution: form.draft.resolution }, { model: "gpt-image-2.5", prompt: "A paper crane on a desk", resolution: "high" });
    assert.equal(image.review_url, `/p/${GENERATIONS_PROJECT_ID}/library?generate=create`);

    // A local picture is copied into the project and switches to the reference-editing default.
    const photo = path.join(root, "face.png"); fs.writeFileSync(photo, PNG);
    const edit = await draftChatGeneration({ kind: "image", prompt: "Image 1 as a watercolor", references: [{ path: photo, role: "edit" }] });
    assert.equal(edit.model.id, "nano-banana-2.1");
    assert.equal(edit.request.resolution, "2K");
    assert.ok(fs.existsSync(path.join(root, "projects", GENERATIONS_PROJECT_ID, "media", edit.request.references[0].source)));

    // Video defaults to Seedance 2.5 at 720p with sound; a named model of the wrong kind is refused.
    createProject("fixture", "web");
    signIn();
    const video = await draftChatGeneration({ project_id: "fixture", kind: "video", prompt: "A paper boat drifts" });
    assert.equal(video.model.id, "seedance-2.5");
    assert.deepEqual({ resolution: video.request.resolution, audio: video.request.audio, aspect: video.request.aspect, duration: video.request.duration }, { resolution: "720p", audio: true, aspect: "16:9", duration: 5 });
    assert.equal(video.readiness, "ready");
    assert.match(video.prompt_guide, /Timed beats/);
    await assert.rejects(draftChatGeneration({ kind: "video", prompt: "x", model: "nano-banana-2" }), /makes image/);

    const approve = (words: string) => approveChatGeneration({ project_id: "fixture", draft_id: video.draft_id!, approval: words }, "http://127.0.0.1:3123");
    await refusal(approve("  "), "approval_required");
    price = 200;
    await refusal(approve("yes"), "price_changed");
    // The creator saw the new price and approved it: generation needs a sign-in and enough credits.
    signOutOfCloud();
    await assert.rejects(approve("yes, 200 is fine"), (error: unknown) => { assert.ok(error instanceof DraftSubmitRefusal); assert.equal(error.code, "sign_in"); assert.match(String(error.details.sign_in_url), /\/connect\?/); return true; });
    signIn(); balance = 50;
    await refusal(approve("yes, 200 is fine"), "buy_credits");
    balance = 4000;
    const first = await approve("yes, 200 is fine");
    assert.equal(first.already_submitted, false);
    const job = readAssetJob("fixture", first.job.id);
    assert.equal(job.approval?.source, "chat"); assert.equal(job.approval?.words, "yes, 200 is fine"); assert.equal(job.quote?.credits, 200);
    // Approving again returns the same job, even though the balance was spent.
    balance = 0;
    const again = await approve("yes");
    assert.equal(again.already_submitted, true); assert.equal(again.job.id, first.job.id);
    assert.equal(listAssetJobs("fixture").length, 1);

    // Once the creator has the draft open in Generate, chat approval generates what the form holds and refuses if
    // they edited it after the agent last reported it.
    balance = 4000;
    const shown = await draftChatGeneration({ project_id: "fixture", kind: "video", prompt: "A paper plane loops" });
    markStagedDraftViewed("fixture", shown.draft_id!);
    const workspacePath = path.join(generationDir("fixture"), "workspace.json");
    const edited = JSON.parse(fs.readFileSync(workspacePath, "utf8"));
    fs.writeFileSync(workspacePath, JSON.stringify({ ...edited, draft: { ...edited.draft, prompt: "A paper plane loops twice" } }));
    await refusal(approveChatGeneration({ project_id: "fixture", draft_id: shown.draft_id!, approval: "go" }), "draft_changed");
    const fromForm = await approveChatGeneration({ project_id: "fixture", draft_id: shown.draft_id!, approval: "go" });
    assert.equal(fromForm.already_submitted, false);
    assert.equal(readAssetJob("fixture", fromForm.job.id).request.prompt, "A paper plane loops twice");
    assert.equal((await approveChatGeneration({ project_id: "fixture", draft_id: shown.draft_id!, approval: "go" })).job.id, fromForm.job.id);
    assert.equal(listAssetJobs("fixture").length, 2);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    fs.rmSync(root, { recursive: true, force: true });
  }
});
