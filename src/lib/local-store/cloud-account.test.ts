import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { beforeEach } from "node:test";
import { createHash } from "node:crypto";
import { beginCloudSignIn, cloudSessionFile, cloudAccessToken, cloudAccountStatus, cloudFetch, completeCloudSignIn, signOutOfCloud, CloudSignedOutError } from "./cloud-account";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "cloud-account-test-"));
process.env.DREAMCUT_PROFILE_DIR = path.join(root, "profile");
process.env.DREAMCUT_CLOUD_URL = "https://cloud.test";
const sessionFile = () => path.join(root, "profile", "private-credentials", cloudSessionFile());
beforeEach(() => signOutOfCloud());

type Call = { url: string; init?: RequestInit };
function cloud(handler: (url: string, body: Record<string, unknown>, init?: RequestInit) => Response) {
  const calls: Call[] = [];
  const fetcher = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return handler(url, init?.body ? JSON.parse(String(init.body)) : {}, init);
  };
  return { calls, fetcher };
}
const json = (body: unknown, status = 200) => Response.json(body, { status });

async function signIn(expiresAt = Math.floor(Date.now() / 1000) + 3600) {
  const { url } = beginCloudSignIn("http://127.0.0.1:3123/api/user/cloud-account/callback");
  const params = new URL(url).searchParams;
  const mock = cloud((target, body) => {
    assert.equal(target, "https://cloud.test/api/v1/connect/token");
    // The PKCE verifier the editor kept matches the challenge it sent.
    assert.equal(createHash("sha256").update(String(body.code_verifier)).digest("base64url"), params.get("code_challenge"));
    return json({ access_token: "access-1", refresh_token: "refresh-1", expires_at: expiresAt, email: "creator@example.com" });
  });
  await completeCloudSignIn("one-time-code", params.get("state")!, mock.fetcher);
}

test("connect opens dreamcut.io/connect with a loopback redirect, PKCE challenge and state", () => {
  const { url } = beginCloudSignIn("http://127.0.0.1:3123/api/user/cloud-account/callback");
  const parsed = new URL(url);
  assert.equal(parsed.origin + parsed.pathname, "https://cloud.test/connect");
  assert.equal(parsed.searchParams.get("redirect_uri"), "http://127.0.0.1:3123/api/user/cloud-account/callback");
  assert.match(parsed.searchParams.get("code_challenge")!, /^[A-Za-z0-9_-]{43}$/);
  assert.ok(parsed.searchParams.get("state"));
  assert.equal(cloudAccountStatus().pending, true);
  assert.throws(() => beginCloudSignIn("https://example.com/callback"), /this computer/);
});

test("the callback stores the session privately and status exposes only the email", async () => {
  await signIn();
  const status = cloudAccountStatus();
  assert.deepEqual(status, { signed_in: true, email: "creator@example.com", pending: false });
  assert.doesNotMatch(JSON.stringify(status), /access-1|refresh-1/);
  if (process.platform !== "win32") {
    assert.equal(fs.statSync(sessionFile()).mode & 0o777, 0o600);
    assert.equal(fs.statSync(path.dirname(sessionFile())).mode & 0o777, 0o700);
  }
});

test("a wrong or reused state is refused without calling the Cloud", async () => {
  beginCloudSignIn("http://127.0.0.1:3123/api/user/cloud-account/callback");
  const mock = cloud(() => json({}));
  await assert.rejects(completeCloudSignIn("code", "forged-state", mock.fetcher), /expired/);
  assert.equal(mock.calls.length, 0);
  assert.equal(cloudAccountStatus().signed_in, false);
});

test("tokens refresh before expiry; a refused refresh signs out", async () => {
  const now = Date.now();
  await signIn(Math.floor(now / 1000) + 30); // inside the refresh margin
  const refresh = cloud((url, body) => {
    assert.equal(url, "https://cloud.test/api/v1/connect/refresh");
    assert.equal(body.refresh_token, "refresh-1");
    return json({ access_token: "access-2", refresh_token: "refresh-2", expires_at: Math.floor(now / 1000) + 3600, email: "creator@example.com" });
  });
  assert.equal(await cloudAccessToken(refresh.fetcher), "access-2");
  assert.equal(await cloudAccessToken(refresh.fetcher), "access-2");
  assert.equal(refresh.calls.length, 1, "a fresh token is reused");
  assert.equal(JSON.parse(fs.readFileSync(sessionFile(), "utf8")).refresh_token, "refresh-2");

  await signIn(Math.floor(now / 1000) + 30);
  const revoked = cloud(() => json({ error: "signed_out" }, 401));
  await assert.rejects(cloudAccessToken(revoked.fetcher), CloudSignedOutError);
  assert.equal(cloudAccountStatus().signed_in, false);
});

test("API calls carry the bearer token and retry once after a 401", async () => {
  await signIn();
  let first = true;
  const mock = cloud(url => {
    if (url.endsWith("/connect/refresh")) return json({ access_token: "access-3", refresh_token: "refresh-3", expires_at: Math.floor(Date.now() / 1000) + 3600 });
    if (first) { first = false; return json({ error: "unauthorized" }, 401); }
    return json({ ok: true });
  });
  const response = await cloudFetch("/api/v1/style", {}, mock.fetcher);
  assert.equal(response.status, 200);
  const auth = mock.calls.filter(call => call.url.endsWith("/api/v1/style")).map(call => (call.init?.headers as Record<string, string>).Authorization);
  assert.deepEqual(auth, ["Bearer access-1", "Bearer access-3"]);
  assert.equal(cloudAccountStatus().email, "creator@example.com", "a refresh without email keeps the stored one");
});

test("a Cloud that refuses even a refreshed session signs this computer out of that Cloud", async () => {
  await signIn();
  const mock = cloud(url => url.endsWith("/connect/refresh")
    ? json({ access_token: "access-4", refresh_token: "refresh-4", expires_at: Math.floor(Date.now() / 1000) + 3600 })
    : json({ error: "unauthorized" }, 401));
  await assert.rejects(cloudFetch("/api/v1/me", {}, mock.fetcher), CloudSignedOutError);
  assert.equal(cloudAccountStatus().signed_in, false);
});

test("each Cloud has its own sign-in: another Cloud never reads, refreshes or signs out this one", async () => {
  await signIn();
  assert.equal(cloudSessionFile({ DREAMCUT_CLOUD_URL: "https://dreamcut.io" }), "dreamcut-cloud.json");
  assert.equal(cloudSessionFile({ DREAMCUT_CLOUD_URL: "http://127.0.0.1:3401" }), "dreamcut-cloud-127-0-0-1-3401.json");
  process.env.DREAMCUT_CLOUD_URL = "http://127.0.0.1:3401";
  try {
    assert.equal(cloudAccountStatus().signed_in, false);
    const mock = cloud(() => json({ ok: true }));
    await assert.rejects(cloudFetch("/api/v1/me", {}, mock.fetcher), CloudSignedOutError);
    assert.equal(mock.calls.length, 0, "no token is sent to a Cloud that did not issue it");
    signOutOfCloud();
  } finally { process.env.DREAMCUT_CLOUD_URL = "https://cloud.test"; }
  assert.equal(cloudAccountStatus().signed_in, true);
});

test("sign out deletes the session", async () => {
  await signIn();
  signOutOfCloud();
  assert.equal(fs.existsSync(sessionFile()), false);
  await assert.rejects(cloudFetch("/api/v1/style", {}, cloud(() => json({})).fetcher), CloudSignedOutError);
});
