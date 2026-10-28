import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { beforeEach } from "node:test";
import { writePrivateCredential } from "@/lib/local-store/provider-keys";
import { cloudSessionFile, signOutOfCloud } from "@/lib/local-store/cloud-account";
import { cloudTelemetryPath, localSentryConfigured, readCloudTelemetry, syncCloudTelemetry } from "./cloud-telemetry";
import { cloudSentryOptions } from "./cloud-sentry";
import { readEditingProfile, writeEditingProfile } from "@/lib/local-store/editing-memory";

process.env.DREAMCUT_PROFILE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "cloud-telemetry-test-"));
process.env.DREAMCUT_CLOUD_URL = "https://cloud.test";

const sentry = { dsn: "https://abc123@o1.ingest.us.sentry.io/42", environment: "production", error_sample_rate: 1 };
let calls: string[];
const cloud = (body: unknown, status = 200) => async (url: string, init?: RequestInit) => {
  calls.push(url);
  assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer a");
  return Response.json(body, { status });
};
function signIn(email = "creator@example.com") {
  writePrivateCredential(cloudSessionFile(), { access_token: "a", refresh_token: "r", expires_at: Math.floor(Date.now() / 1000) + 3600, email, signed_in_at: new Date().toISOString() });
}
beforeEach(() => { calls = []; signOutOfCloud(); fs.rmSync(cloudTelemetryPath(), { force: true }); });

test("signed out, nothing is fetched and no settings are kept", async () => {
  fs.writeFileSync(cloudTelemetryPath(), JSON.stringify({ account: "creator@example.com", fetched_at: 1, sentry }));
  assert.deepEqual(await syncCloudTelemetry(cloud({ sentry }), 2), { sentry: null });
  assert.deepEqual(calls, []);
  assert.equal(fs.existsSync(cloudTelemetryPath()), false);
});

test("signed in, the account's settings turn Sentry on and are cached for an hour", async () => {
  signIn();
  const first = await syncCloudTelemetry(cloud({ sentry }), 1_000);
  assert.deepEqual(calls, ["https://cloud.test/api/v1/telemetry"]);
  assert.equal(first.sentry?.dsn, sentry.dsn);
  assert.match(first.sentry?.install_id ?? "", /^[0-9a-f-]{36}$/);
  await syncCloudTelemetry(cloud({ sentry }), 1_000 + 30 * 60 * 1000);
  assert.equal(calls.length, 1);
});

test("signing out, or another account signing in, drops the cached settings", async () => {
  signIn();
  await syncCloudTelemetry(cloud({ sentry }), 1);
  signIn("someone-else@example.com");
  assert.deepEqual(readCloudTelemetry(), { sentry: null });
  signOutOfCloud();
  assert.deepEqual(await syncCloudTelemetry(cloud({ sentry }), 2), { sentry: null });
  assert.equal(fs.existsSync(cloudTelemetryPath()), false);
});

test("a cloud with no DSN, or an unreachable one, leaves Sentry off", async () => {
  signIn();
  assert.deepEqual(await syncCloudTelemetry(cloud({ sentry: null }), 1), { sentry: null });
  fs.rmSync(cloudTelemetryPath(), { force: true });
  assert.deepEqual(await syncCloudTelemetry(cloud({ error: "down" }, 503), 2), { sentry: null });
});

test("an unreachable cloud keeps the last settings and is not asked again within the hour", async () => {
  signIn();
  await syncCloudTelemetry(cloud({ sentry }), 1);
  calls = [];
  const down = cloud({ error: "down" }, 503);
  assert.equal((await syncCloudTelemetry(down, 1 + 61 * 60 * 1000)).sentry?.dsn, sentry.dsn);
  await syncCloudTelemetry(down, 1 + 90 * 60 * 1000);
  assert.equal(calls.length, 1);
});

test("turning off sharing stops error reports while signed in", async () => {
  signIn();
  await syncCloudTelemetry(cloud({ sentry }), 1);
  writeEditingProfile({ ...readEditingProfile(), cloud_sharing: false });
  assert.deepEqual(readCloudTelemetry(), { sentry: null });
  writeEditingProfile({ ...readEditingProfile(), cloud_sharing: true });
  assert.equal(readCloudTelemetry().sentry?.dsn, sentry.dsn);
});

test("without settings, a failed fetch is retried after five minutes, not an hour", async () => {
  signIn();
  const down = cloud({ error: "down" }, 503);
  assert.deepEqual(await syncCloudTelemetry(down, 1_000), { sentry: null });
  await syncCloudTelemetry(down, 1_000 + 4 * 60 * 1000);
  assert.equal(calls.length, 1);
  assert.equal((await syncCloudTelemetry(cloud({ sentry }), 1_000 + 6 * 60 * 1000)).sentry?.dsn, sentry.dsn);
  assert.equal(calls.length, 2);
});

test("cloud settings apply the account's sample rate and tag the install", () => {
  const options = cloudSentryOptions({ ...sentry, install_id: "00000000-0000-4000-8000-000000000000" });
  assert.equal(options.enabled, true);
  assert.equal(options.sampleRate, 1);
  assert.equal(options.environment, "production");
  assert.deepEqual(options.initialScope, { tags: { install_id: "00000000-0000-4000-8000-000000000000" } });
});

test("a checkout's own .env.local Sentry takes precedence", () => {
  assert.equal(localSentryConfigured({ SENTRY_ENABLED: "1", SENTRY_DSN: sentry.dsn }), true);
  assert.equal(localSentryConfigured({ SENTRY_ENABLED: "0", SENTRY_DSN: sentry.dsn }), false);
  assert.equal(localSentryConfigured({}), false);
});
