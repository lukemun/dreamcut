import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { shareEffectPackage } from "./effect-package-share";
import { effectPackageManifestSchema } from "./effect-package-contract";
import { writePrivateCredential } from "./provider-keys";
import { cloudSessionFile } from "./cloud-account";
const root = fs.mkdtempSync(path.join(os.tmpdir(), "effect-package-test-"));
process.env.TIMELINE_PROJECTS_DIR = path.join(root, "projects");
process.env.DREAMCUT_PROFILE_DIR = path.join(root, "profile");
process.env.DREAMCUT_CLOUD_URL = "https://cloud.test";
const folder = path.join(root, "projects", "demo", "contributions"); fs.mkdirSync(folder, { recursive: true });
const roles = ["recipe", "skill", "input", "result", "instructions", "evidence", "license"];
const files = roles.map(role => { fs.writeFileSync(path.join(folder, role), role); return { root: "project", path: `contributions/${role}`, name: `${role}.txt`, role, license: "Owned test fixture" }; });
const request = { action: "prepare_package", package: { title: "Test effect", credit: "Creator", base_revision: "a".repeat(40), files } };
test("full package is explicit, complete, portable and immutable across upload", async () => {
  const calls: string[] = [];
  const fetcher = async (url: string, init: RequestInit) => {
    calls.push(url);
    if (url.endsWith("/effect-packages")) {
      const body = JSON.parse(String(init.body));
      if (body.action === "create") return Response.json({ id: "11111111-1111-4111-8111-111111111111", uploads: files.map(f => ({ name: f.name, uploadUrl: `https://upload.test/${f.name}` })) });
      return Response.json({ status: "submitted", publication: "private" });
    }
    // Storage can answer a signed upload with an empty body.
    return new Response(null, { status: 200 });
  };
  const prepared = await shareEffectPackage("demo", request, fetcher);
  assert.equal(calls.length, 0);
  assert.equal(prepared.manifest.files.length, 7);
  assert.doesNotMatch(JSON.stringify(prepared), new RegExp(root));
  await assert.rejects(shareEffectPackage("demo", { ...request, action: "submit_package", package_sha256: prepared.package_sha256 }, fetcher), /authorization/);
  fs.writeFileSync(path.join(folder, "skill"), "changed");
  await assert.rejects(shareEffectPackage("demo", { ...request, action: "submit_package", package_sha256: prepared.package_sha256, authorization: "Upload all listed files privately to DreamCut for review" }, fetcher), /changed/);
  assert.equal(calls.length, 0);
  fs.writeFileSync(path.join(folder, "skill"), "skill");
  writePrivateCredential(cloudSessionFile(), { access_token: "test", refresh_token: "test", expires_at: Math.floor(Date.now()/1000)+3600, email: "test@example.com", signed_in_at: new Date().toISOString() });
  const result = await shareEffectPackage("demo", { ...request, action: "submit_package", package_sha256: prepared.package_sha256, authorization: "Upload all listed files privately to DreamCut for review" }, fetcher);
  assert.equal(result.status, "submitted"); assert.equal(calls.length, 9);
  assert.equal(calls.filter(c => c.includes("upload.test")).length, 7);
  assert.throws(() => effectPackageManifestSchema.parse({ ...prepared.manifest, files: prepared.manifest.files.filter((f: { role: string }) => f.role !== "input") }), /input/);
  assert.throws(() => effectPackageManifestSchema.parse({ ...prepared.manifest, files: [...prepared.manifest.files, prepared.manifest.files[0]] }), /unique/);
  await assert.rejects(shareEffectPackage("demo", { ...request, package: { ...request.package, files: [{ ...files[0], path: "../../secret" }, ...files.slice(1)] } }, fetcher), /relative/);
  fs.symlinkSync(path.join(root, "profile"), path.join(folder, "escape"));
  await assert.rejects(shareEffectPackage("demo", { ...request, package: { ...request.package, files: [{ ...files[0], path: "contributions/escape" }, ...files.slice(1)] } }, fetcher), /escapes/);
  fs.writeFileSync(path.join(root, "projects", "demo", ".env.local"), "SECRET=1");
  fs.symlinkSync("../.env.local", path.join(folder, "notes"));
  await assert.rejects(shareEffectPackage("demo", { ...request, package: { ...request.package, files: [{ ...files[0], path: "contributions/notes" }, ...files.slice(1)] } }, fetcher), /credentials/);
});

test("an interrupted upload is not submitted and a retry resumes uploaded files", async () => {
  const prepared = await shareEffectPackage("demo", request);
  let finalized = false;
  const failure = async (url: string, init: RequestInit) => {
    if (url.endsWith("effect-packages")) {
      const body = JSON.parse(String(init.body));
      if (body.action === "submit") finalized = true;
      return Response.json({ id: "22222222-2222-4222-8222-222222222222", uploads: files.map(f => ({ name: f.name, uploadUrl: `https://upload.test/${f.name}` })) });
    }
    return new Response("failure", { status: 503 });
  };
  const input = { ...request, action: "submit_package", package_sha256: prepared.package_sha256, authorization: "Upload all listed files for private review" };
  await assert.rejects(shareEffectPackage("demo", input, failure), /503/);
  assert.equal(finalized, false);
  let puts = 0;
  const resume = async (url: string, init: RequestInit) => {
    if (url.endsWith("effect-packages")) {
      if (JSON.parse(String(init.body)).action === "create") return Response.json({ id: "22222222-2222-4222-8222-222222222222", uploads: files.map(f => ({ name: f.name, uploadUrl: `https://upload.test/${f.name}`, uploaded: true })) });
      finalized = true; return Response.json({ status: "submitted" });
    }
    puts++; return Response.json({});
  };
  await shareEffectPackage("demo", input, resume);
  assert.equal(puts, 0); assert.equal(finalized, true);
});
