import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createProject, readMetadata, readTimeline } from "./store";
import { createExportCheckpoint, profileDir, readEditingProfile, writeEditingProfile } from "./editing-memory";
import { EXPORT_PACKET_SCHEMA, evidenceUploadsAllowed, installId, shareExportPacket } from "./export-sharing";
import { writePrivateCredential } from "./provider-keys";
import { cloudSessionFile, signOutOfCloud } from "./cloud-account";
import { writeJsonFileAtomic } from "./atomic-json";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "export-sharing-test-"));
process.env.TIMELINE_PROJECTS_DIR = path.join(root, "projects");
process.env.DREAMCUT_PROFILE_DIR = path.join(root, "profile");
process.env.DREAMCUT_CLOUD_INGEST_URL = "https://ingest.example/functions/v1/ingest-export";

type Call = { url: string; body: Record<string, unknown> };
const recorder = (responses: Array<number | Error>) => {
  const calls: Call[] = [];
  const fetcher = async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    const next = responses.shift() ?? 200;
    if (next instanceof Error) throw next;
    return new Response("{}", { status: next });
  };
  return { calls, fetcher };
};

test("uploads are off under the test runner and with any non-https override", () => {
  assert.equal(evidenceUploadsAllowed({ NODE_TEST_CONTEXT: "child" }), false);
  assert.equal(evidenceUploadsAllowed({ DREAMCUT_CLOUD_INGEST_URL: "off" }), false);
  assert.equal(evidenceUploadsAllowed({ DREAMCUT_CLOUD_INGEST_URL: "https://x.example/f" }), true);
  assert.equal(evidenceUploadsAllowed({}), true);
});

test("signed out, an export shares nothing and records no upload", async () => {
  createProject("anonymous", "web");
  createExportCheckpoint("anonymous", "export-z", { timeline: readTimeline("anonymous"), metadata: readMetadata("anonymous"), trigger: "export" });
  const none = recorder([]);
  assert.deepEqual(await shareExportPacket("anonymous", "export-z", none.fetcher), []);
  assert.equal(none.calls.length, 0);
  assert.equal(fs.existsSync(path.join(root, "projects", "anonymous", "memory", "cloud-uploads")), false);
});

test("a completed export uploads its privacy-limited packet once and retries earlier failures", async () => {
  process.env.DREAMCUT_CLOUD_URL = "https://cloud.test";
  writePrivateCredential(cloudSessionFile(), { access_token: "token", refresh_token: "r", expires_at: Math.floor(Date.now() / 1000) + 3600, email: "early@example.com", signed_in_at: new Date().toISOString() });
  writeJsonFileAtomic(path.join(profileDir(), "cloud-sync", "install-claim.json"), { account: "early@example.com", install_id: installId(), status: "claimed", updated_at: new Date().toISOString() });
  try {
    createProject("shared", "web");
    createExportCheckpoint("shared", "export-a", { timeline: readTimeline("shared"), metadata: readMetadata("shared"), trigger: "export" });
    const failing = recorder([new Error("offline")]);
    const [first] = await shareExportPacket("shared", "export-a", failing.fetcher);
    assert.equal(first?.status, "failed");

    const packet = failing.calls[0]!.body;
    assert.equal(packet.schema, EXPORT_PACKET_SCHEMA);
    assert.equal(packet.install_id, installId());
    assert.equal(packet.project_id, "shared");
    assert.equal(packet.job_id, "export-a");
    assert.ok(packet.evidence && typeof packet.evidence === "object");
    assert.doesNotMatch(JSON.stringify(packet), /\/Users\/|source_url/);

    createExportCheckpoint("shared", "export-b", { timeline: readTimeline("shared"), metadata: readMetadata("shared"), trigger: "export" });
    const ok = recorder([200, 200]);
    const results = await shareExportPacket("shared", "export-b", ok.fetcher);
    assert.deepEqual(ok.calls.map(call => call.body.job_id), ["export-b", "export-a"]);
    assert.deepEqual(results.map(result => result.status), ["uploaded", "uploaded"]);

    const again = recorder([]);
    await shareExportPacket("shared", "export-b", again.fetcher);
    assert.equal(again.calls.length, 0, "uploaded packets are not re-sent");
  } finally {
    signOutOfCloud();
    delete process.env.DREAMCUT_CLOUD_URL;
  }
});

test("turning sharing off stops uploads, as does learning turned off before sharing had its own switch", async () => {
  createProject("private", "web");
  createExportCheckpoint("private", "export-c", { timeline: readTimeline("private"), metadata: readMetadata("private"), trigger: "export" });
  writeEditingProfile({ ...readEditingProfile(), cloud_sharing: false });
  const off = recorder([]);
  assert.deepEqual(await shareExportPacket("private", "export-c", off.fetcher), []);
  const file = path.join(profileDir(), "preferences.json");
  const legacy = JSON.parse(fs.readFileSync(file, "utf8"));
  delete legacy.cloud_sharing;
  fs.writeFileSync(file, JSON.stringify({ ...legacy, learning: false }));
  assert.deepEqual(await shareExportPacket("private", "export-c", off.fetcher), []);
  assert.equal(off.calls.length, 0);
});

test("signed in, the install is claimed and packets go to the account's evidence endpoint", async () => {
  process.env.DREAMCUT_CLOUD_URL = "https://cloud.test";
  writeEditingProfile({ ...readEditingProfile(), cloud_sharing: true });
  writePrivateCredential(cloudSessionFile(), { access_token: "token", refresh_token: "r", expires_at: Math.floor(Date.now() / 1000) + 3600, email: "creator@example.com", signed_in_at: new Date().toISOString() });
  try {
    createProject("linked", "web");
    createExportCheckpoint("linked", "export-d", { timeline: readTimeline("linked"), metadata: readMetadata("linked"), trigger: "export" });
    const calls: { url: string; auth?: string; body: Record<string, unknown> }[] = [];
    const responses = [200, 503, 200, 200];
    const fetcher = async (url: string, init: RequestInit) => {
      calls.push({ url, auth: (init.headers as Record<string, string>).Authorization, body: JSON.parse(String(init.body)) });
      return Response.json({ ok: true }, { status: responses.shift() ?? 200 });
    };
    const [first] = await shareExportPacket("linked", "export-d", fetcher);
    assert.equal(first?.status, "failed", "the existing retry outbox still records a failed account upload");
    assert.deepEqual(calls.map(call => call.url), ["https://cloud.test/api/v1/installs/claim", "https://cloud.test/api/v1/evidence"]);
    assert.deepEqual(calls[0]!.body, { install_id: installId() });
    assert.ok(calls.every(call => call.auth === "Bearer token"));
    assert.equal(calls[1]!.body.install_id, installId());

    createExportCheckpoint("linked", "export-e", { timeline: readTimeline("linked"), metadata: readMetadata("linked"), trigger: "export" });
    calls.length = 0;
    const results = await shareExportPacket("linked", "export-e", fetcher);
    assert.deepEqual(calls.map(call => call.url), ["https://cloud.test/api/v1/evidence", "https://cloud.test/api/v1/evidence"], "the claim is not repeated");
    assert.deepEqual(results.map(result => result.status), ["uploaded", "uploaded"]);
  } finally {
    signOutOfCloud();
    delete process.env.DREAMCUT_CLOUD_URL;
  }
});
