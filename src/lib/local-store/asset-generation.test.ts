import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { generationUploadReference, assetDraftSchema, buildFalAssetInput, chooseFrameIndices, estimateAssetCost, validateAssetRequest } from "../generation/assets";
import { ASSET_MODELS, CLOUD_MODELS, ASSET_CATALOG_VERSION, modelEndpoint, modelPayload, modelTask, modelEstimate, pooledImageRoles } from "../generation/asset-models";
import { falOutputUrl, falProviderUrl, runAssetJob } from "../generation/asset-worker";
import { assertGenerationOrigin, codexHandoff, createAssetJob, keepAssetOutput, readAssetJob, registerCodexOutput, resolveGenerationSource, updateAssetJob } from "./asset-generation";
import { createProject } from "./store";

const ref = (role: "start" | "end" | "subject" | "motion", source = `${role}.png`) => ({ role, source, label: role });
const draft = (modelId: string, extra: Record<string, unknown> = {}) => assetDraftSchema.parse({ modelId, route: "fal", prompt: "@Element1 crosses arms with a fixed camera", task: "video", aspect: "16:9", ...extra });

/** A valid request for any sold model: its required references (video windows sized for the model), lyrics for songs. */
function exampleDraft(m: (typeof CLOUD_MODELS)[number]) {
  const window = m.adapter === "o1-edit" ? { start: 1, end: 7 } : { start: 1, end: 9 };
  const roles = m.required.length ? m.required : m.adapter === "seedance-ref" ? ["subject" as const] : [];
  const references = roles.map(role => ({ role, source: ["source", "motion"].includes(role) ? `${role}.mp4` : role === "audio" ? "a.wav" : `${role}.png`, label: role, ...(["source", "motion", "audio"].includes(role) ? { window } : {}) }));
  let d = draft(m.id, { references, duration: m.durations[0] ?? 5, resolution: m.resolutions[0], ...(m.lyrics ? { lyrics: "[verse] la la" } : {}), ...(m.kind !== "video" ? {} : { aspect: m.aspects.includes("16:9") ? "16:9" : m.aspects[0] }) });
  d = { ...d, task: modelTask(d), audio: !!m.audioRequired };
  return d;
}
test("curated catalog has unique models and valid adapters for every entry", () => {
  assert.equal(new Set(ASSET_MODELS.map(m => m.id)).size, ASSET_MODELS.length);
  assert.ok(ASSET_MODELS.length >= 10);
  for (const m of CLOUD_MODELS) {
    const d = exampleDraft(m);
    validateAssetRequest(d);
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
test("Codex has no paid payload and extraction keeps timestamp order", () => {
  const d = assetDraftSchema.parse({ prompt: "A person" });
  assert.equal(estimateAssetCost(d), null);
  assert.throws(() => buildFalAssetInput(d, {}), /Only DreamCut model/);
  assert.deepEqual(chooseFrameIndices([0, 0.04, 0.12, 0.2], 0, 0.2, 3), [0, 2, 3]);
  assert.deepEqual(chooseFrameIndices([0, 0.04, 0.12], 0, 0.12, 4, [0.12, 0, 0.12]), [0, 2]);
});
test("provider URL allowlists and same-origin checks fail closed", () => {
  assert.throws(() => falProviderUrl("https://queue.fal.run.evil.test/x"));
  assert.throws(() => falOutputUrl("http://127.0.0.1/private"));
  assert.throws(() => falOutputUrl("https://storage.googleapis.com/other/private"));
  assert.equal(falOutputUrl("https://v3.fal.media/result.mp4"), "https://v3.fal.media/result.mp4");
  assertGenerationOrigin(new Request("http://localhost:3123/api", { headers: { host: "127.0.0.1:3123", origin: "http://127.0.0.1:3123" } }));
  assert.throws(() => assertGenerationOrigin(new Request("http://localhost/api", { headers: { origin: "https://evil.test" } })));
});
test("durable jobs are idempotent, Codex never calls fal, a stray key needs the explicit development override, and uncertain direct submits never repeat", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "asset-generation-test-"));
  const keys = ["TIMELINE_PROJECTS_DIR", "DREAMCUT_ASSET_AUTOSTART", "MEDIA_PREPARATION_AUTOSTART", "DREAMCUT_IMPORT_AUTOSTART", "DREAMCUT_FAL_KEY", "DREAMCUT_DEV_DIRECT_FAL", "DREAMCUT_PROFILE_DIR"];
  const env = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  const originalFetch = globalThis.fetch;
  try {
    process.env.TIMELINE_PROJECTS_DIR = root; process.env.DREAMCUT_ASSET_AUTOSTART = "0"; process.env.MEDIA_PREPARATION_AUTOSTART = "0"; process.env.DREAMCUT_IMPORT_AUTOSTART = "0";
    process.env.DREAMCUT_PROFILE_DIR = path.join(root, "profile"); delete process.env.DREAMCUT_DEV_DIRECT_FAL;
    createProject("fixture", "web");
    const timeline = fs.readFileSync(path.join(root, "fixture/timeline.json"), "utf8");
    const d = assetDraftSchema.parse({ prompt: "A test image" }), id = randomUUID();
    const job = await createAssetJob("fixture", d, id);
    assert.equal(job.status, "waiting_codex");
    assert.match(codexHandoff(job), /Do not use a paid API/);
    assert.equal((await createAssetJob("fixture", d, id)).id, id);
    await assert.rejects(createAssetJob("fixture", { ...d, prompt: "different" }, id), /different request/);
    assert.throws(() => resolveGenerationSource("fixture", "../../private.png"));
    let calls = 0;
    globalThis.fetch = async () => { calls++; throw new Error("Simulated unknown network outcome"); };
    await runAssetJob("fixture", id); assert.equal(calls, 0);
    process.env.DREAMCUT_FAL_KEY = "test-key-not-real";
    const paid = draft("kling-3-pro"), paidId = randomUUID();
    // A leftover key from the bring-your-own-key era does nothing: generating needs a DreamCut sign-in.
    await assert.rejects(createAssetJob("fixture", paid, paidId, 560), /Sign in to DreamCut/);
    process.env.DREAMCUT_DEV_DIRECT_FAL = "1";
    const unknownOutcome = async () => { calls++; throw new Error("Simulated unknown network outcome"); };
    const quoting = (inner: typeof fetch): typeof fetch => async (input, init) => String(input).endsWith("/api/v1/quotes") ? Response.json({ credits: 560, catalogVersion: "test" }) : inner(input, init);
    globalThis.fetch = quoting(unknownOutcome);
    await assert.rejects(createAssetJob("fixture", paid, paidId, 1), /now costs 560 credits/);
    await createAssetJob("fixture", paid, paidId, 560);
    assert.equal(readAssetJob("fixture", paidId).transport, "fal_development");
    assert.equal(readAssetJob("fixture", paidId).catalogVersion, ASSET_CATALOG_VERSION);
    await runAssetJob("fixture", paidId);
    assert.equal(readAssetJob("fixture", paidId).status, "uncertain");
    await runAssetJob("fixture", paidId); assert.equal(calls, 1);
    const resumeId = randomUUID();
    await createAssetJob("fixture", paid, resumeId, 560);
    await updateAssetJob("fixture", resumeId, { status: "running", cancelRequested: true, provider: { requestId: "test", statusUrl: "https://queue.fal.run/status", responseUrl: "https://queue.fal.run/result", cancelUrl: "https://queue.fal.run/cancel" } });
    globalThis.fetch = quoting(async (_input, init) => { assert.equal(init?.method, "PUT"); return Response.json({ success: true }); });
    await runAssetJob("fixture", resumeId);
    assert.equal(readAssetJob("fixture", resumeId).status, "canceled");
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1sAAAAASUVORK5CYII=", "base64");
    const imageDraft = draft("nano-banana-2", { task: "image", resolution: "1K" }), imageId = randomUUID();
    globalThis.fetch = quoting(unknownOutcome);
    await createAssetJob("fixture", imageDraft, imageId, 560);
    const requests: string[] = [];
    globalThis.fetch = async (input, init) => {
      const url = String(input); requests.push(`${init?.method ?? "GET"} ${url}`);
      if (init?.method === "POST") {
        assert.equal(JSON.parse(String(init.body)).resolution, "1K");
        return Response.json({ request_id: "mock", status_url: "https://queue.fal.run/status", response_url: "https://queue.fal.run/result", cancel_url: "https://queue.fal.run/cancel" });
      }
      if (url.endsWith("/status")) return Response.json({ status: "COMPLETED" });
      if (url.endsWith("/result")) return Response.json({ images: [{ url: "https://fal.media/test.png" }] });
      return new Response(png);
    };
    await runAssetJob("fixture", imageId);
    assert.equal(readAssetJob("fixture", imageId).status, "ready");
    assert.equal(readAssetJob("fixture", imageId).progress?.providerStatus, "COMPLETED");
    assert.ok(readAssetJob("fixture", imageId).progress?.checkedAt);
    assert.equal(requests.filter(r => r.startsWith("POST")).length, 1);
    await runAssetJob("fixture", imageId); assert.equal(requests.length, 4);
    const kept = await keepAssetOutput("fixture", imageId, "result-1.png");
    assert.equal(kept.outputs[0].annotation, undefined);
    assert.ok(kept.outputs[0].annotationStatus);
    const keptAgain = await keepAssetOutput("fixture", imageId, "result-1.png", "Synthetic test pixel");
    assert.equal(kept.outputs[0].assetId, keptAgain.outputs[0].assetId);
    assert.ok(kept.outputs[0].keptSource?.startsWith("generated/"));
    const uploaded = await registerCodexOutput("fixture", id, new File([png], "test.png"));
    assert.equal(uploaded.outputs.length, 1);
    assert.equal((await registerCodexOutput("fixture", id, new File([png], "test.png"))).outputs.length, 1);
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
test("Codex image editing cannot be mislabeled as new image generation", () => {
  const d = assetDraftSchema.parse({ route: "codex", task: "image", prompt: "Change the wall color", references: [{ role: "edit", source: "room.png", label: "Room" }] });
  assert.throws(() => validateAssetRequest(d), /Use an edit task/);
  assert.equal(modelTask(d), "edit");
  assert.doesNotThrow(() => validateAssetRequest({ ...d, task: modelTask(d) }));
  // Any attached image makes it an edit: GPT Image reads every image alike (numbered in the handoff).
  assert.equal(modelTask({ ...d, references: [ref("subject")] }), "edit");
  assert.equal(modelTask({ ...d, task: "edit", references: [] }), "image");
  assert.throws(() => validateAssetRequest({ ...d, task: "edit", references: [] }), /Add an image/);
});

test("image models that read every picture alike fill one numbered Images list; slot models keep their slots", () => {
  const nano = assetDraftSchema.parse({ route: "fal", modelId: "nano-banana-pro", task: "image", prompt: "Outfit", references: [] });
  assert.deepEqual(pooledImageRoles(nano), ["subject", "edit", "style", "composition"]);
  assert.deepEqual(pooledImageRoles({ ...nano, route: "codex" }), ["subject", "edit", "style", "composition"]);
  for (const modelId of ["flux-kontext", "seedance-2.5-reference", "kling-3-pro", "h3-max-recast"]) assert.equal(pooledImageRoles({ ...nano, modelId }), null, modelId);
  // Nano Banana sends the pictures as one image_urls list whatever role each holds.
  const pictures = { ...nano, task: "edit" as const, references: [ref("subject"), { role: "edit" as const, source: "edit.png", label: "edit" }] };
  assert.deepEqual(modelPayload(pictures, ["https://a", "https://b"]).image_urls, ["https://a", "https://b"]);
});
