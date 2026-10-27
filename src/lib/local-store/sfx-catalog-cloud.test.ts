import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ensureSfxCatalogFile, removeMembersOnlySounds, syncMembersSfxCatalog } from "./sfx-catalog-cloud";
import { readSharedSfxCatalog, sfxCatalogCheckoutPath, sfxCloudCachePath, sfxMembersCatalogPath } from "./sfx-catalog";
import { writePrivateCredential } from "./provider-keys";
import { cloudSessionFile, signOutOfCloud } from "./cloud-account";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "sfx-cloud-test-"));
const catalogDir = path.join(root, "catalog");
process.env.TIMELINE_SFX_CATALOG_DIR = catalogDir;
process.env.DREAMCUT_PROFILE_DIR = path.join(root, "profile");
process.env.DREAMCUT_CLOUD_URL = "https://cloud.test";

const free = Buffer.from("free sound bytes");
const members = Buffer.from("members sound bytes");
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const entry = (id: string, file: string, bytes: Buffer, access?: "members") => ({
  id, title: id, category: "ui", file, source_status: "licensed", duration_seconds: 1, sample_rate_hz: 48000, channels: 2,
  sha256: sha(bytes), source_provider: "Test", source_url: "https://example.test/", acquired_at: "2026-10-27", ...(access ? { access } : {}),
});
fs.mkdirSync(catalogDir, { recursive: true });
fs.writeFileSync(path.join(catalogDir, "catalog.json"), JSON.stringify({ schema_version: 1, sound_effects: [
  entry("free-click", "licensed/free-click.wav", free),
  entry("members-boom", "licensed/members-boom.wav", members, "members"),
] }));

const calls: string[] = [];
function stubCloud(body: Buffer, linkStatus = 200) {
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    if (url.startsWith("https://cloud.test/api/v1/sounds/")) {
      return linkStatus === 200 ? Response.json({ url: "https://storage.test/signed" }) : Response.json({ error: "x" }, { status: linkStatus });
    }
    if (url === "https://storage.test/signed") return new Response(body);
    return Response.json(null, { status: 404 });
  }) as typeof fetch;
}

test("a free sound downloads once, is hash-checked and then served from the cache", async () => {
  stubCloud(free);
  const file = "licensed/free-click.wav";
  const local = await ensureSfxCatalogFile(file, sfxCatalogCheckoutPath(file));
  assert.equal(local, sfxCloudCachePath(file));
  assert.deepEqual(fs.readFileSync(local), free);
  calls.length = 0;
  assert.equal(await ensureSfxCatalogFile(file, sfxCatalogCheckoutPath(file)), local);
  assert.equal(calls.length, 0, "a cached sound is not downloaded again");
});

test("a download that does not match the catalog is refused and not kept", async () => {
  fs.rmSync(sfxCloudCachePath("licensed/free-click.wav"), { force: true });
  stubCloud(Buffer.from("tampered"));
  await assert.rejects(ensureSfxCatalogFile("licensed/free-click.wav", sfxCatalogCheckoutPath("licensed/free-click.wav")), /does not match/);
  assert.equal(fs.existsSync(sfxCloudCachePath("licensed/free-click.wav")), false);
});

test("members' sounds need a signed-in member, and cached copies are removed when signed out", async () => {
  const file = "licensed/members-boom.wav";
  const cached = sfxCloudCachePath(file);
  fs.mkdirSync(path.dirname(cached), { recursive: true });
  fs.writeFileSync(cached, members);
  stubCloud(members);
  await assert.rejects(ensureSfxCatalogFile(file, sfxCatalogCheckoutPath(file)), (error: Error & { status?: number; toolError?: { code: string } }) =>
    error.status === 401 && error.toolError?.code === "SIGN_IN_REQUIRED");
  assert.equal(fs.existsSync(cached), false);
});

test("removal deletes only members' sounds", () => {
  const freeFile = sfxCloudCachePath("licensed/free-click.wav"), membersFile = sfxCloudCachePath("licensed/members-boom.wav");
  for (const [target, bytes] of [[freeFile, free], [membersFile, members]] as const) { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes); }
  assert.equal(removeMembersOnlySounds(), 1);
  assert.equal(fs.existsSync(freeFile), true);
  assert.equal(fs.existsSync(membersFile), false);
});

test("a checkout copy is used as is", async () => {
  const file = "licensed/members-boom.wav";
  const checkout = sfxCatalogCheckoutPath(file);
  fs.mkdirSync(path.dirname(checkout), { recursive: true });
  fs.writeFileSync(checkout, members);
  assert.equal(await ensureSfxCatalogFile(file, checkout), checkout);
  fs.rmSync(checkout);
});

test("the members-only list comes from DreamCut Cloud for a member and leaves with sign-out", async () => {
  const listed = entry("members-riser", "licensed/members-riser.wav", members);
  const requests: { url: string; auth: string | null }[] = [];
  const cloud: typeof fetch = async (input, init) => {
    requests.push({ url: String(input), auth: new Headers(init?.headers).get("authorization") });
    return Response.json({ schema_version: 1, sound_effects: [listed] });
  };
  // Signed out or not a member: nothing is fetched and the free list stands alone.
  await syncMembersSfxCatalog({ signed_in: false, member: null }, cloud);
  await syncMembersSfxCatalog({ signed_in: true, member: false }, cloud);
  assert.equal(requests.length, 0);
  assert.equal(readSharedSfxCatalog().sound_effects.some(item => item.id === "members-riser"), false);

  writePrivateCredential(cloudSessionFile(), { access_token: "token", refresh_token: "r", expires_at: Math.floor(Date.now() / 1000) + 3600, email: "member@example.com", signed_in_at: new Date().toISOString() });
  try {
    await syncMembersSfxCatalog({ signed_in: true, member: true }, cloud);
    assert.deepEqual(requests, [{ url: "https://cloud.test/api/v1/sounds/catalog", auth: "Bearer token" }]);
    const shared = readSharedSfxCatalog().sound_effects;
    assert.equal(shared.find(item => item.id === "members-riser")?.access, "members", "listed sounds are members-only whatever the response says");
    assert.ok(shared.some(item => item.id === "free-click"));
    await syncMembersSfxCatalog({ signed_in: true, member: true }, cloud);
    assert.equal(requests.length, 1, "a fresh list is not fetched again");
    // Cloud unreachable: the list stays so a member keeps working offline.
    await syncMembersSfxCatalog({ signed_in: true, member: null }, cloud);
    assert.equal(fs.existsSync(sfxMembersCatalogPath()), true);

    const cached = sfxCloudCachePath("licensed/members-riser.wav");
    fs.mkdirSync(path.dirname(cached), { recursive: true });
    fs.writeFileSync(cached, members);
    signOutOfCloud();
    await syncMembersSfxCatalog({ signed_in: false, member: null }, cloud);
    assert.equal(fs.existsSync(cached), false, "cached members' sounds are removed");
    assert.equal(fs.existsSync(sfxMembersCatalogPath()), false, "and so is the list");
    assert.equal(readSharedSfxCatalog().sound_effects.some(item => item.id === "members-riser"), false);
  } finally { signOutOfCloud(); }
});

test.after(() => fs.rmSync(root, { recursive: true, force: true }));
