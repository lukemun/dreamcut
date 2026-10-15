import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createProject } from "./store";
import { createAssetJob, listAssetJobs } from "./asset-generation";
import { signOutOfCloud } from "./cloud-account";
import { DraftSubmitRefusal, markStagedDraftViewed, prepareAssetWorkspace, readAssetWorkspace, saveAssetWorkspace, submitStagedDraft } from "./asset-generation-workspace";
import { writePrivateCredential } from "./provider-keys";

test("staging populates the composer without a job, guides sign-in and credits without charging, and rejects stale autosaves", async () => {
  const old = process.env.TIMELINE_PROJECTS_DIR, oldProfile = process.env.DREAMCUT_PROFILE_DIR, originalFetch = globalThis.fetch;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "generation-draft-"));
  process.env.TIMELINE_PROJECTS_DIR = root; process.env.DREAMCUT_PROFILE_DIR = path.join(root, "profile");
  const calls: string[] = [];
  let balance = 40;
  globalThis.fetch = async (input, init) => {
    const url = String(input); calls.push(`${init?.method ?? "GET"} ${new URL(url).pathname}`);
    if (url.endsWith("/api/v1/quotes")) return Response.json({ credits: 125, catalogVersion: "test" });
    if (url.endsWith("/api/v1/me")) return Response.json({ id: "u", email: "c@example.com", credits: balance });
    throw new Error(`unexpected ${url}`);
  };
  try {
    createProject("fixture", "web");
    const initial = readAssetWorkspace("fixture");
    const defaultImage = await prepareAssetWorkspace("fixture", {task:"image",prompt:"A paper square"});
    assert.equal(defaultImage.workspace.draft.route, "codex");
    assert.equal(defaultImage.estimate, null);
    assert.equal(listAssetJobs("fixture").length, 0);
    const timeline = fs.readFileSync(path.join(root, "fixture/timeline.json"), "utf8");
    const staged = { task: "video", route: "fal", modelId: "h3-max-turbo", prompt: "A centered paper unfolds", aspect: "9:16", duration: 5, audio: true };
    const signedOut = await prepareAssetWorkspace("fixture", staged);
    assert.deepEqual(signedOut.estimate, { credits: 125, catalog_version: "test" });
    assert.equal(signedOut.generation_check?.readiness, "sign_in");
    assert.match(signedOut.generation_check!.guidance, /Sign in or create account/);
    writePrivateCredential("dreamcut-cloud.json", { access_token: "token", refresh_token: "r", expires_at: Math.floor(Date.now() / 1000) + 3600, email: "c@example.com", signed_in_at: new Date().toISOString() });
    const short = await prepareAssetWorkspace("fixture", staged);
    assert.equal(short.generation_check?.readiness, "buy_credits");
    assert.equal(short.generation_check?.balance, 40);
    assert.equal(short.generation_check?.buy_credits_url, "https://dreamcut.io/pricing");
    balance = 4000;
    const result = await prepareAssetWorkspace("fixture", staged);
    assert.equal(result.generation_check?.readiness, "ready");
    // Staging only ever prices and reads the balance: no upload, no generation, no charge.
    assert.deepEqual([...new Set(calls)].sort(), ["GET /api/v1/me", "POST /api/v1/quotes"]);
    await assert.rejects(prepareAssetWorkspace("fixture", { ...staged, modelId: "latentsync" }), /isn't available with DreamCut credits/);
    assert.equal(readAssetWorkspace("fixture").draft.prompt, "A centered paper unfolds");
    assert.equal(result.generated, false);
    assert.equal(result.review_url, "/p/fixture/library?generate=create");
    assert.equal(result.next_action, "human_review");
    assert.match(result.submission_policy, /exact visible draft/);
    assert.equal(listAssetJobs("fixture").length, 0);
    assert.equal(fs.readFileSync(path.join(root, "fixture/timeline.json"), "utf8"), timeline);
    assert.throws(() => saveAssetWorkspace("fixture", initial), /new generation draft/);
    saveAssetWorkspace("fixture", { ...result.workspace, draft: { ...result.workspace.draft, prompt: "My revision" } });
    assert.equal(readAssetWorkspace("fixture").draft.prompt, "My revision");
    await assert.rejects(prepareAssetWorkspace("fixture", { ...result.workspace.draft, references: [{ source: "missing.png", role: "start", label: "missing" }] }));
    assert.equal(readAssetWorkspace("fixture").draft.prompt, "My revision");
  } finally {
    globalThis.fetch = originalFetch;
    if (oldProfile === undefined) delete process.env.DREAMCUT_PROFILE_DIR; else process.env.DREAMCUT_PROFILE_DIR = oldProfile;
    if (old === undefined) delete process.env.TIMELINE_PROJECTS_DIR; else process.env.TIMELINE_PROJECTS_DIR = old;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("an agent's restaged draft keeps the creator's marks unless it restates them", async () => {
  const old = process.env.TIMELINE_PROJECTS_DIR;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "generation-marks-"));
  process.env.TIMELINE_PROJECTS_DIR = root;
  try {
    createProject("fixture", "web");
    const first = await prepareAssetWorkspace("fixture", { task: "image", prompt: "A paper square" });
    const mark = { id: "m1", source: "sources/car.jpg", x: 0.6, y: 0.7, note: "Make this car red" };
    saveAssetWorkspace("fixture", { ...first.workspace, draft: { ...first.workspace.draft, marks: [mark] } });
    await prepareAssetWorkspace("fixture", { task: "image", prompt: "A red car on a paper street" });
    assert.deepEqual(readAssetWorkspace("fixture").draft.marks, [mark]);
    await prepareAssetWorkspace("fixture", { task: "image", prompt: "Again", marks: [{ ...mark, note: "Done" }] });
    assert.equal(readAssetWorkspace("fixture").draft.marks[0]?.note, "Done");
  } finally {
    if (old === undefined) delete process.env.TIMELINE_PROJECTS_DIR; else process.env.TIMELINE_PROJECTS_DIR = old;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("chat approval submits exactly the viewed, reported draft once, and refuses without approval, when stale, signed out or short", async () => {
  const keys = ["TIMELINE_PROJECTS_DIR", "DREAMCUT_PROFILE_DIR", "DREAMCUT_ASSET_AUTOSTART"];
  const saved = Object.fromEntries(keys.map(k => [k, process.env[k]])), originalFetch = globalThis.fetch;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "generation-submit-"));
  process.env.TIMELINE_PROJECTS_DIR = root; process.env.DREAMCUT_PROFILE_DIR = path.join(root, "profile"); process.env.DREAMCUT_ASSET_AUTOSTART = "0";
  const calls: string[] = [];
  let balance = 4000;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input)); calls.push(`${init?.method ?? "GET"} ${url.pathname}`);
    if (url.pathname === "/api/v1/quotes") return Response.json({ credits: 125, catalogVersion: "test" });
    if (url.pathname === "/api/v1/me") return Response.json({ id: "u", email: "c@example.com", credits: balance });
    throw new Error(`unexpected ${url}`);
  };
  const signIn = () => writePrivateCredential("dreamcut-cloud.json", { access_token: "token", refresh_token: "r", expires_at: Math.floor(Date.now() / 1000) + 3600, email: "c@example.com", signed_in_at: new Date().toISOString() });
  const refusal = async (promise: Promise<unknown>, code: string) => {
    await assert.rejects(promise, (error: unknown) => { assert.ok(error instanceof DraftSubmitRefusal); assert.equal(error.code, code, error.message); return true; });
  };
  try {
    createProject("fixture", "web");
    signIn();
    const staged = await prepareAssetWorkspace("fixture", { task: "video", route: "fal", modelId: "kling-3-standard", prompt: "A paper boat drifts", aspect: "16:9", duration: 5 });
    const stagedId = staged.staged_id;
    await refusal(submitStagedDraft("fixture", { staged_id: stagedId, approval: "  " }), "approval_required");
    await refusal(submitStagedDraft("fixture", { staged_id: stagedId, approval: "yes, generate it" }), "not_viewed");
    markStagedDraftViewed("fixture", stagedId);
    await refusal(submitStagedDraft("fixture", { staged_id: "00000000-0000-4000-8000-000000000000", approval: "yes, generate it" }), "stale_draft");
    // The creator edits the prompt in the form: the agent must show it again before submitting.
    saveAssetWorkspace("fixture", { ...staged.workspace, draft: { ...staged.workspace.draft, prompt: "A paper boat drifts at dusk" } });
    await assert.rejects(submitStagedDraft("fixture", { staged_id: stagedId, approval: "yes, generate it" }), (error: unknown) => {
      assert.ok(error instanceof DraftSubmitRefusal); assert.equal(error.code, "draft_changed");
      assert.equal((error.details.draft as { prompt: string }).prompt, "A paper boat drifts at dusk");
      assert.equal(error.details.credits, 125); return true;
    });
    signOutOfCloud();
    await refusal(submitStagedDraft("fixture", { staged_id: stagedId, approval: "yes, generate it" }), "sign_in");
    signIn(); balance = 40;
    await assert.rejects(submitStagedDraft("fixture", { staged_id: stagedId, approval: "yes, generate it" }), (error: unknown) => {
      assert.ok(error instanceof DraftSubmitRefusal); assert.equal(error.code, "buy_credits");
      assert.equal(error.details.balance, 40); assert.equal(error.details.buy_credits_url, "https://dreamcut.io/pricing"); return true;
    });
    assert.equal(listAssetJobs("fixture").length, 0, "no refusal creates a job");
    balance = 4000;
    const first = await submitStagedDraft("fixture", { staged_id: stagedId, approval: "Yes, generate the dusk one" });
    assert.equal(first.already_submitted, false);
    assert.equal(first.job.request.prompt, "A paper boat drifts at dusk");
    assert.deepEqual({ source: first.job.approval?.source, words: first.job.approval?.words, staged: first.job.approval?.staged_id }, { source: "chat", words: "Yes, generate the dusk one", staged: stagedId });
    assert.deepEqual(first.job.quote, { credits: 125, catalogVersion: "test", kind: "credits" });
    const again = await submitStagedDraft("fixture", { staged_id: stagedId, approval: "yes" });
    assert.equal(again.already_submitted, true);
    assert.equal(again.job.id, first.job.id);
    assert.equal(listAssetJobs("fixture").length, 1);
    assert.ok(!calls.some(call => call.includes("/api/v1/generations") || call.includes("/api/v1/uploads")), "submitting records the request; only the worker contacts the Cloud to charge");
  } finally {
    globalThis.fetch = originalFetch; signOutOfCloud();
    for (const k of keys) if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a draft the creator already generated with the button is never submitted again from chat", async () => {
  const keys = ["TIMELINE_PROJECTS_DIR", "DREAMCUT_PROFILE_DIR", "DREAMCUT_ASSET_AUTOSTART"];
  const saved = Object.fromEntries(keys.map(k => [k, process.env[k]])), originalFetch = globalThis.fetch;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "generation-submit-click-"));
  process.env.TIMELINE_PROJECTS_DIR = root; process.env.DREAMCUT_PROFILE_DIR = path.join(root, "profile"); process.env.DREAMCUT_ASSET_AUTOSTART = "0";
  globalThis.fetch = async input => String(input).endsWith("/api/v1/quotes") ? Response.json({ credits: 80, catalogVersion: "test" }) : Response.json({ credits: 1000 });
  try {
    createProject("fixture", "web");
    writePrivateCredential("dreamcut-cloud.json", { access_token: "token", refresh_token: "r", expires_at: Math.floor(Date.now() / 1000) + 3600, email: "c@example.com", signed_in_at: new Date().toISOString() });
    const staged = await prepareAssetWorkspace("fixture", { task: "image", route: "fal", modelId: "nano-banana-2", resolution: "1K", prompt: "A paper crane", aspect: "1:1" });
    markStagedDraftViewed("fixture", staged.staged_id);
    const clicked = await createAssetJob("fixture", staged.workspace.draft, "11111111-1111-4111-8111-111111111111", 80);
    const result = await submitStagedDraft("fixture", { staged_id: staged.staged_id, approval: "yes" });
    assert.equal(result.already_submitted, true);
    assert.equal(result.job.id, clicked.id);
    assert.equal(clicked.approval?.source, "generate_button");
  } finally {
    globalThis.fetch = originalFetch; signOutOfCloud();
    for (const k of keys) if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
    fs.rmSync(root, { recursive: true, force: true });
  }
});
