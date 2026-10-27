import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { generationUploadReference, assetDraftSchema, buildFalAssetInput, canResumeAssetJob, chooseFrameIndices, estimateAssetCost, validateAssetRequest, EMPTY_ASSET_DRAFT } from "../generation/assets";
import { ASSET_MODELS, CLOUD_MODELS, ASSET_CATALOG_VERSION, modelEndpoint, modelPayload, modelTask, modelEstimate, modelCreditEstimate, pooledImageRoles } from "../generation/asset-models";
import { runAssetJob } from "../generation/asset-worker";
import { assertGenerationOrigin, createAssetJob, jobPath, readAssetJob, resolveGenerationSource } from "./asset-generation";
import { createProject } from "./store";

const ref = (role: "start" | "end" | "subject" | "motion", source = `${role}.png`) => ({ role, source, label: role });
const draft = (modelId: string, extra: Record<string, unknown> = {}) => assetDraftSchema.parse({ modelId, route: "fal", prompt: "@Element1 crosses arms with a fixed camera", task: "video", aspect: "16:9", ...extra });

/** A valid request for any sold model: its required references (video windows sized for the model), lyrics for songs. */
function exampleDraft(m: (typeof CLOUD_MODELS)[number]) {
  const window = m.adapter === "o1-edit" ? { start: 1, end: 7 } : { start: 1, end: 9 };
  const roles = m.required.length ? m.required : m.adapter === "seedance-ref" ? ["subject" as const] : [];
  const references = roles.map(role => ({ role, source: ["source", "motion"].includes(role) ? `${role}.mp4` : role === "audio" ? "a.wav" : `${role}.png`, label: role, ...(["source", "motion", "audio"].includes(role) ? { window } : {}) }));
  let d = draft(m.id, { references, duration: m.durations[0] ?? 5, resolution: m.resolutions[0], ...(m.lyrics ? { lyrics: "[verse] la la" } : {}), ...(m.speech?.defaultVoice ? { voice: m.speech.defaultVoice } : {}), ...(m.kind !== "video" ? {} : { aspect: m.aspects.includes("16:9") ? "16:9" : m.aspects[0] }) });
  d = { ...d, task: modelTask(d), audio: !!m.audioRequired };
  return d;
}
test("curated catalog has unique models and valid adapters for every entry", () => {
  assert.equal(new Set(ASSET_MODELS.map(m => m.id)).size, ASSET_MODELS.length);
  assert.ok(ASSET_MODELS.length >= 10);
  for (const m of CLOUD_MODELS) {
    const d = exampleDraft(m);
    validateAssetRequest(d);
    assert.ok(estimateAssetCost(d)!.usd > 0, m.id);
    // Voiceovers run on DreamCut Cloud's OpenRouter route only; they have no fal payload.
    if (m.speech) { assert.throws(() => buildFalAssetInput(d, []), /credits only/); continue; }
    const payload = buildFalAssetInput(d, d.references.map(r => `https://example.test/${r.role}`)) as Record<string, unknown>;
    if (m.adapter !== "wan-replace") assert.equal(payload.prompt, d.prompt, m.id);
    assert.ok(modelEndpoint(d));
    assert.ok(estimateAssetCost(d)!.usd > 0, m.id);
  }
});
test("H3 Turbo routes text and keyframes, prices resolutions and expires its promotion", () => {
  const d = draft("h3-max-turbo", { audio: true });
  assert.equal(modelEndpoint(d), "minimax/h3-max-turbo/text-to-video");
  assert.deepEqual(buildFalAssetInput(d, {}), { prompt: d.prompt, duration: 5, resolution: "480P", prompt_expansion_mode: "balanced", aspect_ratio: "16:9" });
  const keyed = { ...d, task: "animate" as const, references: [ref("start"), ref("end")] };
  assert.equal(modelEndpoint(keyed), "minimax/h3-max-turbo/image-to-video");
  assert.deepEqual(buildFalAssetInput(keyed, { start: "s", end: "e" }), { prompt: d.prompt, duration: 5, resolution: "480P", prompt_expansion_mode: "balanced", image_url: "s", end_image_url: "e" });
  const promo = new Date("2026-09-23T00:00:00Z"), regular = new Date("2026-10-01T00:00:00Z");
  assert.equal(modelEstimate(d, undefined, promo)?.usd, 0.0625);
  assert.equal(modelEstimate(d, undefined, regular)?.usd, 0.125);
  assert.equal(modelEstimate({ ...d, resolution: "480P" }, undefined, regular)?.usd, 0.125);
  assert.equal(modelEstimate({ ...d, resolution: "1080P" }, undefined, regular)?.usd, 0.4);
  assert.throws(() => validateAssetRequest({ ...keyed, references: [...keyed.references, ref("subject")] }), /not supported/);
  assert.throws(() => validateAssetRequest({ ...d, audio: false }), /always generates sound/);
  assert.throws(() => validateAssetRequest({ ...d, duration: 4 }), /duration/);
});
test("lip-sync models are not sold with credits and say so plainly", () => {
  assert.deepEqual(ASSET_MODELS.filter(m => m.cloud === false).map(m => m.id).sort(), ["latentsync", "sync-3-avatar"]);
  const sync = draft("sync-3-avatar", { task: "animate", references: [ref("start"), { role: "audio", source: "vocal.mp3", label: "Singing" }], duration: 17, audio: true, aspect: "9:16" });
  assert.throws(() => validateAssetRequest(sync), /Sync 3 Singing Avatar isn't available with DreamCut credits/);
  assert.throws(() => buildFalAssetInput(sync, { start: "image", audio: "song" }), /DreamCut credits/);
  const lip = draft("latentsync", { references: [ref("motion", "motion.mp4"), { role: "audio", source: "song.mp3", label: "Singing" }], duration: 17, audio: true });
  assert.throws(() => validateAssetRequest(lip), /LatentSync Lip Sync isn't available/);
  assert.equal(modelEndpoint(lip), "fal-ai/latentsync");
});
test("Kling preserves first/last and binds face to a supporting body reference", () => {
  const d = draft("kling-3-pro", { task: "animate", references: [ref("start"), ref("end"), ref("subject")] });
  const p = buildFalAssetInput(d, { start: "s", end: "e", subject: "f" });
  assert.deepEqual(p, { prompt: d.prompt, duration: "5", generate_audio: false, start_image_url: "s", end_image_url: "e", elements: [{ frontal_image_url: "f", reference_image_urls: ["s"] }] });
  assert.equal(estimateAssetCost(d)?.usd, 0.56);
  assert.equal(estimateAssetCost({ ...d, audio: true })?.usd, 0.84);
});
test("MakeTrailer model controls survive schema parsing and map only to supported provider fields", () => {
  const kling = draft("kling-3-pro", { settings: { negativePrompt: "camera movement", cfgScale: 0.8 } });
  assert.equal(buildFalAssetInput(kling, {}).cfg_scale, 0.8);
  assert.equal(buildFalAssetInput(kling, {}).negative_prompt, "camera movement");
  const h3 = draft("h3-max-turbo", { audio: true, settings: { seed: 42, promptExpansion: "quality", enableSafetyChecker: true } });
  assert.equal(buildFalAssetInput(h3, {}).seed, 42);
  assert.equal(buildFalAssetInput(h3, {}).prompt_expansion_mode, "quality");
  assert.equal(buildFalAssetInput(h3, {}).enable_safety_checker, true);
  const veo = draft("veo-3.1-fast", { duration: 8, resolution: "4k", settings: { seed: 0, autoFix: true, safetyTolerance: "3" } });
  assert.equal(buildFalAssetInput(veo, {}).auto_fix, true);
  assert.equal(buildFalAssetInput(veo, {}).safety_tolerance, "3");
  assert.equal(estimateAssetCost(veo)?.usd, 2.4);
  assert.equal(estimateAssetCost({ ...veo, audio: true })?.usd, 2.8);
  assert.throws(() => validateAssetRequest({ ...veo, duration: 4 }), /8-second/);
  assert.throws(() => validateAssetRequest({ ...h3, settings: { cfgScale: 0.5 } }), /settings are not supported/);
  assert.throws(() => draft("kling-3-pro", { settings: { cfgScale: 2 } }));
  assert.throws(() => draft("h3-max-turbo", { settings: { seed: -1 } }));
  const seedance = draft("seedance-2", { task: "animate", resolution: "480p", references: [ref("start")], settings: { bitrateMode: "high" } });
  assert.equal(buildFalAssetInput(seedance, { start: "s" }).bitrate_mode, "high");
  assert.equal(estimateAssetCost(seedance)?.usd, 0.672);
});
test("switching to incompatible models never silently drops references", () => {
  const d = draft("veo-3.1-fast", { task: "animate", duration: 6, references: [ref("start"), ref("subject")] });
  assert.throws(() => validateAssetRequest(d), /not supported/);
  assert.equal(d.references.length, 2);
  assert.throws(() => validateAssetRequest(draft("kling-3-pro", { references: [ref("end")] })), /start frame/);
  assert.throws(() => validateAssetRequest(draft("kling-3-pro", { task: "animate", references: [ref("start"), ref("subject")], prompt: "Move" })), /@Element1/);
});
test("Veo routes first/last separately and translates duration strings", () => {
  const d = draft("veo-3.1-fast", { task: "animate", duration: 8, resolution: "1080p", references: [ref("start"), ref("end")] });
  assert.match(modelEndpoint(d), /first-last-frame/);
  const p = buildFalAssetInput(d, { start: "s", end: "e" });
  assert.equal("first_frame_url" in p && p.first_frame_url, "s");
  assert.equal("duration" in p && p.duration, "8s");
  assert.throws(() => validateAssetRequest({ ...d, duration: 5 }), /duration/);
  assert.throws(() => validateAssetRequest({ ...d, duration: 4 }), /1080p/);
});
test("Nano reference edits, FLUX output counts, Seedance resolutions and motion orientation", () => {
  const nano = draft("nano-banana-2", { task: "edit", resolution: "2K", references: [ref("subject")], count: 2 });
  assert.equal(modelEndpoint(nano), "fal-ai/nano-banana-2/edit");
  assert.equal(estimateAssetCost(nano)?.usd, 0.24);
  assert.deepEqual((buildFalAssetInput(nano, { subject: "f" }) as { image_urls: string[] }).image_urls, ["f"]);
  assert.throws(() => validateAssetRequest(draft("flux-2-pro", { task: "image", count: 2 })), /at most 1/);
  assert.equal(estimateAssetCost(draft("seedance-2", { task: "animate", resolution: "1080p", references: [ref("start")] }))?.usd, 3.41);
  assert.throws(() => validateAssetRequest(draft("kling-3-motion", { task: "motion", orientation: "image", references: [ref("start"), { ...ref("motion", "m.mp4"), window: { start: 0, end: 5 } }, ref("subject")] })), /orientation/);
});
test("drafts saved with the retired Codex route open as DreamCut models; extraction has no paid payload and keeps timestamp order", () => {
  assert.equal(assetDraftSchema.parse({ prompt: "A person" }).route, "fal");
  const legacy = assetDraftSchema.parse({ route: "codex", modelId: "nano-banana-2", resolution: "720p", prompt: "A person" });
  assert.deepEqual({ route: legacy.route, modelId: legacy.modelId, resolution: legacy.resolution, prompt: legacy.prompt }, { route: "fal", modelId: "gpt-image-2.5", resolution: undefined, prompt: "A person" });
  const extract = assetDraftSchema.parse({ task: "extract", route: "local", references: [{ role: "source", source: "clip.mp4", label: "Clip" }], end: 1 });
  assert.equal(estimateAssetCost(extract), null);
  assert.throws(() => buildFalAssetInput(extract, {}), /Only DreamCut model/);
  assert.deepEqual(chooseFrameIndices([0, 0.04, 0.12, 0.2], 0, 0.2, 3), [0, 2, 3]);
  assert.deepEqual(chooseFrameIndices([0, 0.04, 0.12], 0, 0.12, 4, [0.12, 0, 0.12]), [0, 2]);
});
test("same-origin checks fail closed", () => {
  assertGenerationOrigin(new Request("http://localhost:3123/api", { headers: { host: "127.0.0.1:3123", origin: "http://127.0.0.1:3123" } }));
  assert.throws(() => assertGenerationOrigin(new Request("http://localhost/api", { headers: { origin: "https://evil.test" } })));
});
test("durable jobs are idempotent, a retired Codex request never runs, and generation goes only through DreamCut Cloud", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "asset-generation-test-"));
  const keys = ["TIMELINE_PROJECTS_DIR", "DREAMCUT_ASSET_AUTOSTART", "MEDIA_PREPARATION_AUTOSTART", "DREAMCUT_IMPORT_AUTOSTART", "DREAMCUT_FAL_KEY", "DREAMCUT_DEV_DIRECT_FAL", "DREAMCUT_PROFILE_DIR"];
  const env = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  const originalFetch = globalThis.fetch;
  try {
    process.env.TIMELINE_PROJECTS_DIR = root; process.env.DREAMCUT_ASSET_AUTOSTART = "0"; process.env.MEDIA_PREPARATION_AUTOSTART = "0"; process.env.DREAMCUT_IMPORT_AUTOSTART = "0";
    process.env.DREAMCUT_PROFILE_DIR = path.join(root, "profile");
    createProject("fixture", "web");
    const timeline = fs.readFileSync(path.join(root, "fixture/timeline.json"), "utf8");
    // A request left waiting for the retired Codex image handoff reads as canceled and never calls a provider.
    const id = randomUUID(), now = new Date().toISOString();
    fs.mkdirSync(path.dirname(jobPath("fixture", id)), { recursive: true });
    fs.writeFileSync(jobPath("fixture", id), JSON.stringify({ id, projectId: "fixture", createdAt: now, updatedAt: now, request: { route: "codex", task: "image", prompt: "A test image", references: [], count: 1, aspect: "1:1" }, references: [], outputs: [], status: "waiting_codex" }));
    assert.equal(readAssetJob("fixture", id).status, "canceled");
    assert.throws(() => resolveGenerationSource("fixture", "../../private.png"));
    let calls = 0;
    globalThis.fetch = async () => { calls++; throw new Error("Simulated unknown network outcome"); };
    await runAssetJob("fixture", id); assert.equal(calls, 0);
    // A fal key, even with the retired direct-fal switch, does nothing: generating needs a DreamCut sign-in.
    process.env.DREAMCUT_FAL_KEY = "test-key-not-real"; process.env.DREAMCUT_DEV_DIRECT_FAL = "1";
    const paid = draft("kling-3-pro"), paidId = randomUUID();
    await assert.rejects(createAssetJob("fixture", paid, paidId, 560), /Sign in to DreamCut/);
    assert.equal(fs.existsSync(jobPath("fixture", paidId)), false);
    // A request recorded for the retired direct fal path fails without calling anyone and can't be resumed.
    for (const transport of ["fal_development", undefined]) {
      const legacyId = randomUUID();
      fs.writeFileSync(jobPath("fixture", legacyId), JSON.stringify({ id: legacyId, projectId: "fixture", createdAt: now, updatedAt: now, request: paid, references: [], quote: { credits: 560, catalogVersion: ASSET_CATALOG_VERSION, kind: "credits" }, outputs: [], status: "queued", model: modelEndpoint(paid), ...(transport ? { transport } : {}) }));
      await runAssetJob("fixture", legacyId);
      const legacy = readAssetJob("fixture", legacyId);
      assert.equal(legacy.status, "failed");
      assert.match(legacy.error!, /no longer does\. Generate it again to use DreamCut credits/);
      assert.equal(canResumeAssetJob(legacy), false);
    }
    assert.equal(calls, 0);
    assert.equal(fs.readFileSync(path.join(root, "fixture/timeline.json"), "utf8"), timeline);
  } finally {
    globalThis.fetch = originalFetch;
    for (const k of keys) if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k];
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("upload reference roles match accepted file extensions regardless of browser MIME", () => {
  for (const filename of ["clip.mov", "clip.M4V", "clip.webm", "clip.mp4"]) {
    assert.deepEqual(generationUploadReference(filename, ["start", "motion"], []), { assetType: "video_clip", role: "motion" });
    assert.throws(() => generationUploadReference(filename, ["edit", "subject"], []), /does not accept video/);
  }
  assert.deepEqual(generationUploadReference("photo.PNG", ["start", "motion"], [ref("start")]), { assetType: "still", role: "start" });
  assert.deepEqual(generationUploadReference("audio.mp3", ["start", "audio"], []), { assetType: "music", role: "audio" });
  assert.throws(() => generationUploadReference("audio.mp3", ["motion"], []), /does not accept audio/);
});
test("image models that read every picture alike fill one numbered Images list; slot models keep their slots", () => {
  const nano = assetDraftSchema.parse({ route: "fal", modelId: "nano-banana-pro", task: "image", prompt: "Outfit", references: [] });
  assert.deepEqual(pooledImageRoles(nano), ["subject", "edit", "style", "composition"]);
  for (const modelId of ["flux-kontext", "seedance-2.5-reference", "kling-3-pro", "h3-max-recast"]) assert.equal(pooledImageRoles({ ...nano, modelId }), null, modelId);
  // Nano Banana sends the pictures as one image_urls list whatever role each holds.
  const pictures = { ...nano, task: "edit" as const, references: [ref("subject"), { role: "edit" as const, source: "edit.png", label: "edit" }] };
  assert.deepEqual(modelPayload(pictures, ["https://a", "https://b"]).image_urls, ["https://a", "https://b"]);
});

test("the model picker estimates fal cost plus 30%, without floating-point overcharging", () => {
  const kling = { ...EMPTY_ASSET_DRAFT, route: "fal" as const, task: "video" as const, modelId: "kling-3-pro", duration: 5, audio: false };
  // 5 s × $0.112 = $0.56 → 560 credits; with sound 5 s × $0.168 = $0.84 → 840.
  assert.equal(modelCreditEstimate(kling), 364);
  assert.equal(modelCreditEstimate({ ...kling, audio: true }), 546);
  // A price that depends on a video not chosen yet has no estimate.
  assert.equal(modelCreditEstimate({ ...EMPTY_ASSET_DRAFT, route: "fal", task: "video", modelId: "kling-o1-edit", references: [] }), null);
});
