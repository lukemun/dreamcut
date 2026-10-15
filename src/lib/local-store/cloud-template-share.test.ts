import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createProject } from "./store";
import { writeJsonFileAtomic } from "./atomic-json";
import { writePrivateCredential } from "./provider-keys";
import { signOutOfCloud } from "./cloud-account";
import { listProjectExports, shareTemplate, shareableTemplate, templateShareState } from "./cloud-template-share";
import { resetCommunityRecipeCache } from "@/lib/effects/community-recipes";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "template-share-test-"));
process.env.TIMELINE_PROJECTS_DIR = path.join(root, "projects");
process.env.DREAMCUT_PROFILE_DIR = path.join(root, "profile");
process.env.DREAMCUT_CLOUD_URL = "https://cloud.test";

const templateId = "33333333-3333-4333-8333-333333333333";
function setup() {
  createProject("share", "web");
  fs.mkdirSync(path.join(root, "projects", "share", "renders"), { recursive: true });
  fs.writeFileSync(path.join(root, "projects", "share", "renders", "final.mp4"), Buffer.from("fake mp4 bytes"));
  fs.writeFileSync(path.join(root, "projects", "share", "renders", "notes.txt"), "not a video");
  writeJsonFileAtomic(path.join(root, "profile", "personal-styles", `${templateId}.json`), {
    schema_version: 1, id: templateId, revision: 2, name: "Punchy captions", description: "Big words on beats",
    bundles: [{ skill: "embedded-captions", parameters: { size: 90, style: "bold" } }],
    authorization: { kind: "explicit_request", instruction: "Save this" },
    created_at: "2026-10-11T00:00:00.000Z", updated_at: "2026-10-11T00:00:00.000Z",
    source_edit: { project_id: "share", title: "Share", timeline_revision: "x" },
  });
}

test("a saved template becomes a portable recipe without local identifiers", () => {
  setup();
  const template = shareableTemplate(`saved-${templateId}`);
  assert.equal(template.skill, "embedded-captions");
  assert.deepEqual(template.recipe.bundles, [{ skill: "embedded-captions", parameters: { size: 90, style: "bold" } }]);
  assert.doesNotMatch(JSON.stringify([template.title, template.description, template.recipe]), new RegExp(templateId), "the local template id is not shared");
  assert.throws(() => shareableTemplate("community-x"), /own templates/);
  assert.deepEqual(listProjectExports("share").map(item => item.file), ["final.mp4"]);
});

test("sharing creates a draft, uploads the example and poster, submits, and shows pending then published", async () => {
  setup();
  writePrivateCredential("dreamcut-cloud.json", { access_token: "token", refresh_token: "r", expires_at: Math.floor(Date.now() / 1000) + 3600, email: "c@example.com", signed_in_at: new Date().toISOString() });
  const cloudId = "44444444-4444-4444-8444-444444444444";
  const calls: { method: string; url: string; auth?: string; body?: unknown }[] = [];
  const fetcher = async (url: string, init: RequestInit) => {
    const headers = init.headers as Record<string, string>;
    calls.push({ method: init.method ?? "GET", url, auth: headers?.Authorization, body: typeof init.body === "string" ? JSON.parse(init.body) : init.body });
    if (url === "https://cloud.test/api/v1/recipes" && init.method === "POST") return Response.json({ id: cloudId, status: "draft", uploads: {
      video: { path: "a/example.mp4", uploadUrl: "https://storage.supabase.co/upload/video?token=t", contentType: "video/mp4" },
      poster: { path: "a/poster.jpg", uploadUrl: "https://storage.supabase.co/upload/poster?token=t", contentType: "image/jpeg" },
    } }, { status: 201 });
    if (url.startsWith("https://storage.supabase.co/")) return Response.json({ Key: "ok" });
    if (url.endsWith(`/recipes/${cloudId}/submit`)) return Response.json({ id: cloudId, status: "pending" });
    return new Response("{}", { status: 404 });
  };
  try {
    const record = await shareTemplate({ projectId: "share", templateId: `saved-${templateId}`, exportFile: "final.mp4", creditName: "Lu" }, fetcher, async () => Buffer.from("jpeg"));
    assert.equal(record.status, "pending");
    assert.deepEqual(calls.map(call => `${call.method} ${call.url.split("?")[0]}`), [
      "POST https://cloud.test/api/v1/recipes",
      "PUT https://storage.supabase.co/upload/video",
      "PUT https://storage.supabase.co/upload/poster",
      `POST https://cloud.test/api/v1/recipes/${cloudId}/submit`,
    ]);
    const draft = calls[0]!.body as Record<string, any>;
    assert.equal(draft.creditName, "Lu");
    assert.deepEqual(draft.video, { contentType: "video/mp4", bytes: "fake mp4 bytes".length });
    assert.deepEqual(draft.poster, { contentType: "image/jpeg", bytes: 4 });
    assert.equal(calls[0]!.auth, "Bearer token");
    assert.equal(calls[1]!.auth, undefined, "signed upload URLs carry no account token");
    await assert.rejects(shareTemplate({ projectId: "share", templateId: `saved-${templateId}`, exportFile: "final.mp4", creditName: "Lu" }, fetcher, async () => Buffer.from("jpeg")), /already shared/);

    resetCommunityRecipeCache();
    const listing = async () => Response.json({ recipes: [] });
    assert.equal((await templateShareState(`saved-${templateId}`, { fetchImpl: listing }))?.status, "pending");
    resetCommunityRecipeCache();
    const published = async () => Response.json({ recipes: [{ id: cloudId, title: "Punchy captions", description: "Big", skill: "embedded-captions", author: { name: "Lu" }, video: "https://x.supabase.co/v.mp4", poster: "https://x.supabase.co/p.jpg", recipe: { prompt: "Apply" } }] });
    assert.equal((await templateShareState(`saved-${templateId}`, { fetchImpl: published }))?.status, "published");
  } finally { signOutOfCloud(); resetCommunityRecipeCache(); }
});

test("an export outside the project's renders cannot be chosen, and signed out cannot share", async () => {
  setup();
  fs.rmSync(path.join(root, "profile", "cloud-sync", "shared-templates.json"), { force: true });
  const never = async () => { throw new Error("no network expected"); };
  await assert.rejects(shareTemplate({ projectId: "share", templateId: `saved-${templateId}`, exportFile: "../../secret.mp4", creditName: "Lu" }, never, async () => Buffer.from("x")), /Choose an export/);
  await assert.rejects(shareTemplate({ projectId: "share", templateId: `saved-${templateId}`, exportFile: "final.mp4", creditName: "Lu" }, never, async () => Buffer.from("x")), /Not signed in/);
});
