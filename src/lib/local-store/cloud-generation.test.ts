import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import test, { afterEach, beforeEach } from "node:test";
import { assetDraftSchema, canResumeAssetJob } from "../generation/assets";
import { cloudDraft, cloudMediaUrl } from "../generation/cloud-generation";
import { runAssetJob } from "../generation/asset-worker";
import { createAssetJob, keepAssetOutput, readAssetJob, updateAssetJob } from "./asset-generation";
import { writePrivateCredential } from "./provider-keys";
import { signOutOfCloud } from "./cloud-account";
import { createProject } from "./store";
import { readProjectSourceManifest } from "./media-ingest";

// Mocked DreamCut Cloud (`/api/v1`), shaped like site/src/app/api/v1 and site/src/lib/jobs.ts publicJob.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1sAAAAASUVORK5CYII=", "base64");
const ENV = ["TIMELINE_PROJECTS_DIR", "DREAMCUT_PROFILE_DIR", "DREAMCUT_ASSET_AUTOSTART", "MEDIA_PREPARATION_AUTOSTART", "DREAMCUT_IMPORT_AUTOSTART", "DREAMCUT_ASSET_POLL_MS", "DREAMCUT_CLOUD_URL", "DREAMCUT_DEV_DIRECT_FAL", "DREAMCUT_FAL_KEY"];
let saved: Record<string, string | undefined>, root: string, originalFetch: typeof fetch;

type Call = { method: string; path: string; body?: Record<string, unknown>; auth?: string | null };
type Generation = { id: string; clientRequestId: string; credits: number; status: string; error: string | null; outputs: { url: string; contentType: string; bytes: number | null }[] };
/** A small in-memory Cloud. `script` overrides a route for one scenario. */
function mockCloud(options: { credits?: number; balance?: number; script?: Partial<Record<string, (call: Call) => Response | Promise<Response>>> } = {}) {
  const calls: Call[] = [];
  const jobs = new Map<string, Generation>();
  const price = options.credits ?? 125;
  const state = { balance: options.balance ?? 1000, polls: 0 };
  const statusSequence = ["queued", "running", "completed"];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const call: Call = { method: init?.method ?? "GET", path: url.pathname, auth: new Headers(init?.headers).get("authorization") };
    if (typeof init?.body === "string") call.body = JSON.parse(init.body);
    calls.push(call);
    const scripted = options.script?.[`${call.method} ${call.path.replace(/[0-9a-f-]{36}/g, ":id")}`];
    if (scripted) return scripted(call);
    if (url.hostname === "storage.supabase.co" && call.method === "PUT") return new Response(null, { status: 200 });
    if (url.hostname === "storage.supabase.co") return new Response(new Uint8Array(PNG), { headers: { "content-type": "image/png", "content-length": String(PNG.length) } });
    if (call.path === "/api/v1/quotes") return Response.json({ credits: price, catalogVersion: "2026-10-11.1" });
    if (call.path === "/api/v1/me") return Response.json({ id: "u1", email: "c@example.com", credits: state.balance });
    if (call.path === "/api/v1/uploads") return Response.json({ path: `u1/${call.body!.clientRequestId}/${call.body!.sha256}.png`, uploadUrl: "https://storage.supabase.co/storage/v1/object/upload/sign/x?token=t", contentType: "image/png" });
    if (call.path === "/api/v1/generations" && call.method === "POST") {
      const id = String(call.body!.clientRequestId);
      const existing = [...jobs.values()].find(j => j.clientRequestId === id);
      if (existing) return Response.json(existing, { status: 201 });
      if (call.body!.acceptedCredits !== price) return Response.json({ error: "price_changed", message: `This now costs ${price} credits. Review the price and try again.` }, { status: 409 });
      if (state.balance < price) return Response.json({ error: "insufficient_credits", message: "Not enough credits. Buy more at dreamcut.io/account." }, { status: 402 });
      state.balance -= price;
      const job: Generation = { id: randomUUID(), clientRequestId: id, credits: price, status: "queued", error: null, outputs: [] };
      jobs.set(job.id, job);
      return Response.json(job, { status: 201 });
    }
    if (call.path === "/api/v1/generations") return Response.json({ generations: [...jobs.values()] });
    const match = call.path.match(/^\/api\/v1\/generations\/([^/]+)(?:\/(cancel|ack))?$/);
    if (match) {
      const job = jobs.get(match[1]);
      if (!job) return Response.json({ error: "not_found", message: "not_found" }, { status: 404 });
      if (match[2] === "cancel") {
        if (job.status !== "queued") return Response.json({ error: "already_started", message: "This generation has already started and can't be canceled." }, { status: 409 });
        job.status = "canceled"; state.balance += job.credits;
        return Response.json({ canceled: true, refundedCredits: job.credits });
      }
      if (match[2] === "ack") return Response.json({ acknowledged: true });
      if (job.status !== "canceled" && job.status !== "failed") {
        job.status = statusSequence[Math.min(state.polls++, 2)];
        if (job.status === "completed") job.outputs = [{ url: `https://storage.supabase.co/storage/v1/object/sign/out/${job.id}/0.png?token=t`, contentType: "image/png", bytes: PNG.length }];
      }
      return Response.json({ ...job, model: "nano-banana-2", createdAt: "", completedAt: null, downloadedAt: null, mediaExpiresAt: null });
    }
    throw new Error(`Unexpected request ${call.method} ${url}`);
  }) as typeof fetch;
  return { calls, jobs, state, count: (method: string, pathname: string) => calls.filter(c => c.method === method && c.path === pathname).length };
}

const signIn = () => writePrivateCredential("dreamcut-cloud.json", { access_token: "token", refresh_token: "refresh", expires_at: Math.floor(Date.now() / 1000) + 3600, email: "c@example.com", signed_in_at: new Date().toISOString() });
const imageDraft = (extra: Record<string, unknown> = {}) => assetDraftSchema.parse({ route: "fal", task: "edit", modelId: "nano-banana-2", resolution: "1K", prompt: "Make the sky orange", aspect: "16:9", references: [{ role: "edit", source: "sources/frame.png", label: "Frame" }], ...extra });

beforeEach(() => {
  saved = Object.fromEntries(ENV.map(k => [k, process.env[k]]));
  originalFetch = globalThis.fetch;
  root = fs.mkdtempSync(path.join(os.tmpdir(), "cloud-generation-test-"));
  process.env.TIMELINE_PROJECTS_DIR = path.join(root, "projects");
  process.env.DREAMCUT_PROFILE_DIR = path.join(root, "profile");
  process.env.DREAMCUT_ASSET_AUTOSTART = "0"; process.env.MEDIA_PREPARATION_AUTOSTART = "0"; process.env.DREAMCUT_IMPORT_AUTOSTART = "0";
  process.env.DREAMCUT_ASSET_POLL_MS = "1";
  delete process.env.DREAMCUT_CLOUD_URL; delete process.env.DREAMCUT_DEV_DIRECT_FAL; delete process.env.DREAMCUT_FAL_KEY;
  createProject("cloud", "web");
  fs.mkdirSync(path.join(root, "projects", "cloud", "media", "sources"), { recursive: true });
  fs.writeFileSync(path.join(root, "projects", "cloud", "media", "sources", "frame.png"), PNG);
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  signOutOfCloud();
  for (const k of ENV) if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
  fs.rmSync(root, { recursive: true, force: true });
});

test("the Cloud draft matches the Cloud API schema and URLs stay on Cloud storage", () => {
  assert.deepEqual(cloudDraft(imageDraft(), ["u1/x/y.png"]), { modelId: "nano-banana-2", prompt: "Make the sky orange", aspect: "16:9", count: 1, resolution: "1K", references: [{ role: "edit", path: "u1/x/y.png" }] });
  const video = assetDraftSchema.parse({ route: "fal", task: "video", modelId: "kling-3-pro", prompt: "A slow push in", aspect: "9:16", duration: 10, audio: true, settings: { cfgScale: 0.5 } });
  assert.deepEqual(cloudDraft(video), { modelId: "kling-3-pro", prompt: "A slow push in", aspect: "9:16", count: 1, duration: 10, audio: true, settings: { cfgScale: 0.5 }, references: [] });
  assert.throws(() => cloudDraft({ ...video, modelId: "latentsync" }), /isn't available with DreamCut credits/);
  assert.ok(cloudMediaUrl("https://abc.supabase.co/storage/v1/object/sign/x?token=t"));
  assert.throws(() => cloudMediaUrl("http://abc.supabase.co/x"));
  // A result the Cloud couldn't copy comes back as the provider's own URL.
  assert.ok(cloudMediaUrl("https://v3.fal.run/files/result.mp4"));
  assert.throws(() => cloudMediaUrl("https://fal.run.example.com/result.mp4"));
  assert.throws(() => cloudMediaUrl("https://127.0.0.1/private"));
});

test("Generate needs a DreamCut sign-in and the current price; refusals never reach the Cloud's charge", async () => {
  const cloud = mockCloud();
  const id = randomUUID();
  await assert.rejects(createAssetJob("cloud", imageDraft(), id, 125), /Sign in to DreamCut/);
  signIn();
  await assert.rejects(createAssetJob("cloud", imageDraft(), id), /price in credits/);
  await assert.rejects(createAssetJob("cloud", imageDraft(), id, 100), /now costs 125 credits/);
  await assert.rejects(createAssetJob("cloud", imageDraft({ modelId: "latentsync" }), id, 125), /isn't available with DreamCut credits/);
  assert.equal(cloud.count("POST", "/api/v1/generations"), 0);
  assert.equal(cloud.count("POST", "/api/v1/uploads"), 0);
});

test("success: quote → upload → create once → poll → download into the project → acknowledge; keep records DreamCut provenance", async () => {
  signIn();
  const cloud = mockCloud();
  const id = randomUUID();
  const timeline = fs.readFileSync(path.join(root, "projects", "cloud", "timeline.json"), "utf8");
  const created = await createAssetJob("cloud", imageDraft(), id, 125);
  assert.equal(created.transport, "cloud");
  assert.deepEqual(created.quote, { credits: 125, catalogVersion: "2026-10-11.1", kind: "credits" });
  assert.equal(cloud.count("POST", "/api/v1/generations"), 0, "creating the local request does not charge; the worker does");
  await runAssetJob("cloud", id);
  const job = readAssetJob("cloud", id);
  assert.equal(job.status, "ready", job.error);
  assert.equal(job.outputs.length, 1);
  assert.match(job.outputs[0].source, /^\.generation\/.+\/result-1\.png$/);
  assert.ok(job.cloud?.acknowledgedAt);
  const create = cloud.calls.find(c => c.method === "POST" && c.path === "/api/v1/generations")!;
  assert.equal(create.body!.clientRequestId, id, "the local job id is the idempotency key");
  assert.equal(create.body!.acceptedCredits, 125);
  assert.deepEqual((create.body!.draft as { references: unknown[] }).references, [{ role: "edit", path: job.cloud!.uploads![0] }]);
  assert.equal(create.auth, "Bearer token");
  assert.equal(cloud.count("POST", "/api/v1/generations"), 1);
  assert.equal(cloud.count("POST", `/api/v1/generations/${job.cloud!.generationId}/ack`), 1);
  assert.equal(cloud.state.balance, 875);
  await runAssetJob("cloud", id);
  assert.equal(cloud.count("POST", "/api/v1/generations"), 1, "a finished request never creates again");
  const kept = await keepAssetOutput("cloud", id, "result-1.png");
  const asset = readProjectSourceManifest("cloud").assets.find(a => a.asset_id === kept.outputs[0].assetId)!;
  assert.equal(asset.storage_mode, "managed_copy");
  assert.ok(asset.media_path.startsWith("generated/"));
  assert.deepEqual(asset.generation, { service: "DreamCut Cloud", model: "Nano Banana 2", request_id: id, endpoint: "fal-ai/nano-banana-2/edit", cloud_generation_id: job.cloud!.generationId, credits: 125 });
  assert.equal(fs.readFileSync(path.join(root, "projects", "cloud", "timeline.json"), "utf8"), timeline, "generation never touches the timeline");
});

test("insufficient credits fails without a charge and the same request resumes after buying credits", async () => {
  signIn();
  const cloud = mockCloud({ balance: 40 });
  const id = randomUUID();
  await createAssetJob("cloud", imageDraft(), id, 125);
  await runAssetJob("cloud", id);
  let job = readAssetJob("cloud", id);
  assert.equal(job.status, "failed");
  assert.equal(job.cloud?.insufficientCredits, true);
  assert.match(job.error!, /Not enough credits.*Nothing was charged/);
  assert.equal(canResumeAssetJob(job), true);
  assert.equal(cloud.state.balance, 40);
  cloud.state.balance = 5000; // bought a pack
  await updateAssetJob("cloud", id, { status: "queued", error: undefined });
  await runAssetJob("cloud", id);
  job = readAssetJob("cloud", id);
  assert.equal(job.status, "ready", job.error);
  assert.equal(new Set(cloud.calls.filter(c => c.method === "POST" && c.path === "/api/v1/generations").map(c => c.body!.clientRequestId)).size, 1);
  assert.equal(cloud.state.balance, 4875);
});

test("cancel before the model starts is refunded; after it starts the request keeps running and is delivered", async () => {
  signIn();
  let cloud = mockCloud();
  const early = randomUUID();
  await createAssetJob("cloud", imageDraft(), early, 125);
  await updateAssetJob("cloud", early, { cancelRequested: true });
  await runAssetJob("cloud", early);
  assert.equal(readAssetJob("cloud", early).status, "canceled", "a request never sent is canceled locally");
  assert.equal(cloud.count("POST", "/api/v1/generations"), 0);

  cloud = mockCloud();
  const uploading = randomUUID();
  await createAssetJob("cloud", imageDraft(), uploading, 125);
  // Cancelled after the worker began (status "submitting") but before the create was sent.
  await updateAssetJob("cloud", uploading, { status: "submitting", cancelRequested: true });
  await runAssetJob("cloud", uploading);
  assert.equal(readAssetJob("cloud", uploading).status, "canceled", "a cancel during upload stops before any charge");
  assert.equal(cloud.count("POST", "/api/v1/generations"), 0);

  cloud = mockCloud();
  const queued = randomUUID();
  await createAssetJob("cloud", imageDraft(), queued, 125);
  await updateAssetJob("cloud", queued, { status: "running", cloud: { clientRequestId: queued, createSentAt: new Date().toISOString() }, cancelRequested: true });
  await runAssetJob("cloud", queued);
  let job = readAssetJob("cloud", queued);
  assert.equal(job.status, "canceled");
  assert.equal(job.cloud?.refundedCredits, 125);
  assert.equal(canResumeAssetJob(job), false);
  assert.equal(cloud.state.balance, 1000);

  cloud = mockCloud({ script: { "POST /api/v1/generations/:id/cancel": () => Response.json({ error: "already_started", message: "This generation has already started and can't be canceled." }, { status: 409 }) } });
  const started = randomUUID();
  await createAssetJob("cloud", imageDraft(), started, 125);
  await updateAssetJob("cloud", started, { status: "running", cloud: { clientRequestId: started, createSentAt: new Date().toISOString() }, cancelRequested: true });
  await runAssetJob("cloud", started);
  job = readAssetJob("cloud", started);
  assert.equal(job.cloud?.cancelRefused, true);
  assert.equal(job.status, "ready", job.error);
});

test("a failed generation is final and says the credits are refunded", async () => {
  signIn();
  mockCloud({ script: { "GET /api/v1/generations/:id": call => Response.json({ id: call.path.split("/").pop(), credits: 125, status: "failed", error: "Generation failed at the provider.", outputs: [] }) } });
  const id = randomUUID();
  await createAssetJob("cloud", imageDraft(), id, 125);
  await runAssetJob("cloud", id);
  const job = readAssetJob("cloud", id);
  assert.equal(job.status, "failed");
  assert.match(job.error!, /failed at the provider\. DreamCut refunds the credits/);
  assert.equal(job.cloud?.final, true);
  assert.equal(canResumeAssetJob(job), false);
});

test("unanswered creates become uncertain; checking again repeats the same request id and is charged once", async () => {
  signIn();
  const cloud = mockCloud();
  const id = randomUUID();
  await createAssetJob("cloud", imageDraft(), id, 125);
  const healthy = globalThis.fetch;
  let failCreates = 3;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname === "/api/v1/generations" && init?.method === "POST" && failCreates-- > 0) {
      await healthy(input, init); // the Cloud received it, but the answer is lost
      throw new TypeError("fetch failed");
    }
    return healthy(input, init);
  }) as typeof fetch;
  await runAssetJob("cloud", id);
  let job = readAssetJob("cloud", id);
  assert.equal(job.status, "uncertain");
  assert.match(job.error!, /can't be charged twice/);
  assert.equal(canResumeAssetJob(job), true);
  await updateAssetJob("cloud", id, { status: "queued", error: undefined });
  await runAssetJob("cloud", id);
  job = readAssetJob("cloud", id);
  assert.equal(job.status, "ready", job.error);
  const creates = cloud.calls.filter(c => c.method === "POST" && c.path === "/api/v1/generations");
  assert.equal(creates.length, 4);
  assert.ok(creates.every(c => c.body!.clientRequestId === id));
  assert.equal(cloud.jobs.size, 1);
  assert.equal(cloud.state.balance, 875, "one charge despite four create calls");
});

test("a lost download resumes the same Cloud job without creating another", async () => {
  signIn();
  const cloud = mockCloud();
  const id = randomUUID();
  await createAssetJob("cloud", imageDraft(), id, 125);
  const healthy = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname.includes("/object/sign/out/")) return new Response("expired", { status: 400 });
    return healthy(input, init);
  }) as typeof fetch;
  await runAssetJob("cloud", id);
  let job = readAssetJob("cloud", id);
  assert.equal(job.status, "failed");
  assert.match(job.error!, /keeps the result for 14 days/);
  assert.equal(canResumeAssetJob(job), true);
  globalThis.fetch = healthy;
  await updateAssetJob("cloud", id, { status: "running", error: undefined });
  await runAssetJob("cloud", id);
  job = readAssetJob("cloud", id);
  assert.equal(job.status, "ready", job.error);
  assert.equal(cloud.count("POST", "/api/v1/generations"), 1);
});

test("a recast request trims its source window to a 30 fps MP4, declares that length, and leaves no scratch behind", async () => {
  signIn();
  const media = path.join(root, "projects", "cloud", "media", "sources");
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=640x360:rate=24", "-f", "lavfi", "-i", "sine=frequency=300", "-t", "12", "-c:v", "libx264", "-c:a", "aac", "-shortest", path.join(media, "concert.mp4")]);
  const puts: { type: string | null; bytes: number }[] = [];
  const cloud = mockCloud({ script: {
    "POST /api/v1/uploads": call => Response.json({ path: `u1/${call.body!.clientRequestId}/${call.body!.sha256}.${call.body!.contentType === "video/mp4" ? "mp4" : "png"}`, uploadUrl: "https://storage.supabase.co/storage/v1/object/upload/sign/x?token=t", contentType: call.body!.contentType }),
  } });
  const fetchCloud = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    if (init?.method === "PUT") puts.push({ type: new Headers(init.headers).get("content-type"), bytes: (init.body as Uint8Array).byteLength });
    return fetchCloud(input, init);
  }) as typeof fetch;
  const draft = assetDraftSchema.parse({ route: "fal", task: "recast", modelId: "h3-max-recast", prompt: "", aspect: "16:9", references: [
    { role: "source", source: "sources/concert.mp4", label: "Concert", window: { start: 2, end: 8 } },
    { role: "subject", source: "sources/frame.png", label: "New lead" },
  ] });
  const id = randomUUID();
  await createAssetJob("cloud", draft, id, 125);
  await runAssetJob("cloud", id);
  const job = readAssetJob("cloud", id);
  assert.equal(job.status, "ready", job.error);
  const create = cloud.calls.find(c => c.method === "POST" && c.path === "/api/v1/generations")!;
  const refs = (create.body!.draft as { references: { role: string; path: string; duration?: number }[] }).references;
  assert.deepEqual(refs.map(r => [r.role, r.duration]), [["source", 6], ["subject", undefined]]);
  assert.match(refs[0].path, /\.mp4$/);
  assert.equal(puts[0].type, "video/mp4");
  const uploaded = cloud.calls.find(c => c.path === "/api/v1/uploads")!;
  assert.equal(uploaded.body!.contentType, "video/mp4");
  assert.equal(fs.existsSync(path.join(root, "projects", "cloud", "preprocess", "asset-generation", `${id}.references`)), false, "prepared references are scratch");
  assert.ok(fs.existsSync(path.join(media, "concert.mp4")), "the source is untouched");
});
