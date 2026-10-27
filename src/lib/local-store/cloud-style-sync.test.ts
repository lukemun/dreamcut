import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { beforeEach } from "node:test";
import { writePrivateCredential } from "./provider-keys";
import { cloudSessionFile, signOutOfCloud } from "./cloud-account";
import { readEditingProfile, readPersonalStyleDocument, savePersonalStyleDocument, writeEditingProfile } from "./editing-memory";
import { listStyleConflicts, readLocalStylePayload, readStyleSyncState, restoreStyleConflict, syncStyle, type StylePayload } from "./cloud-style-sync";
import { writeJsonFileAtomic } from "./atomic-json";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "cloud-style-sync-test-"));
const profile = path.join(root, "profile");
process.env.DREAMCUT_PROFILE_DIR = profile;
process.env.DREAMCUT_CLOUD_URL = "https://cloud.test";

type Remote = StylePayload & { revision: number; updated_at: string | null };
let remote: Remote;
let calls: { method: string; url: string; body?: Record<string, unknown> }[];

function signIn(email = "creator@example.com") {
  writePrivateCredential(cloudSessionFile(), { access_token: "a", refresh_token: "r", expires_at: Math.floor(Date.now() / 1000) + 3600, email, signed_in_at: new Date().toISOString() });
}
const fetcher = async (url: string, init?: RequestInit) => {
  const method = init?.method ?? "GET";
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  calls.push({ method, url, body });
  assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer a");
  if (url === "https://cloud.test/api/v1/style" && method === "GET") return Response.json(remote);
  if (url === "https://cloud.test/api/v1/style" && method === "PUT") {
    if (body.base_revision !== remote.revision) return Response.json({ error: "stale", current: remote }, { status: 409 });
    // The Cloud stores JSON with its own key order; sync must not see that as a change.
    const reorder = (value: unknown) => value && typeof value === "object" ? Object.fromEntries(Object.entries(value).reverse()) : value;
    remote = { revision: remote.revision + 1, markdown: body.markdown, preferences: reorder(body.preferences) as Remote["preferences"], templates: body.templates, updated_at: new Date().toISOString() };
    return Response.json({ revision: remote.revision, updated_at: remote.updated_at });
  }
  return new Response("{}", { status: 404 });
};

function resetProfile() {
  signOutOfCloud();
  fs.rmSync(profile, { recursive: true, force: true });
  remote = { revision: 0, markdown: "", preferences: null, templates: [], updated_at: null };
  calls = [];
}
function setLocalStyle(markdown: string) { savePersonalStyleDocument(markdown, readPersonalStyleDocument().revision); }
beforeEach(resetProfile);

test("signed out, sync does nothing and makes no network calls", async () => {
  assert.deepEqual(await syncStyle(fetcher), { outcome: "signed_out" });
  assert.equal(calls.length, 0);
});

test("first sign-in with no account style uploads the local one", async () => {
  setLocalStyle("# My style\n\nCut on the beat.\n");
  signIn();
  const result = await syncStyle(fetcher);
  assert.equal(result.outcome, "uploaded_first");
  assert.equal(remote.revision, 1);
  assert.equal(remote.markdown, "# My style\n\nCut on the beat.\n");
  assert.equal(readStyleSyncState()?.revision, 1);
  assert.equal((await syncStyle(fetcher)).outcome, "unchanged", "the reordered JSON the Cloud returns is not a change");
});

test("local changes push with the last synced revision; remote changes pull when nothing changed locally", async () => {
  signIn();
  await syncStyle(fetcher);
  setLocalStyle("# My style\n\nShort captions.\n");
  assert.equal((await syncStyle(fetcher)).outcome, "pushed");
  const put = calls.filter(call => call.method === "PUT").at(-1)!;
  assert.equal(put.body!.base_revision, 1);
  assert.equal(remote.revision, 2);

  remote = { ...remote, revision: 3, markdown: "# My style\n\nFrom my other computer.\n" };
  assert.equal((await syncStyle(fetcher)).outcome, "pulled");
  assert.equal(readPersonalStyleDocument().markdown, "# My style\n\nFrom my other computer.\n");
  // Agents read the same cache: the derived preferences follow the pulled document.
  assert.ok(readEditingProfile().preferences.some(item => item.text === "From my other computer."));
});

test("a stale write adopts the account copy and keeps the local version as a dated conflict", async () => {
  signIn();
  await syncStyle(fetcher);
  remote = { ...remote, revision: 5, markdown: "# My style\n\nAccount copy.\n" };
  setLocalStyle("# My style\n\nLocal edit made offline.\n");
  const result = await syncStyle(fetcher);
  assert.equal(result.outcome, "conflict");
  assert.equal(readPersonalStyleDocument().markdown, "# My style\n\nAccount copy.\n");
  assert.equal(readStyleSyncState()?.revision, 5);
  const [conflict] = listStyleConflicts();
  assert.equal(conflict?.local.markdown, "# My style\n\nLocal edit made offline.\n");
  assert.ok(fs.existsSync(path.join(profile, "style-conflicts", `${conflict!.id}-STYLE.md`)));
  assert.equal((await syncStyle(fetcher)).outcome, "unchanged");

  // Restoring the kept text is an ordinary local change that the next pass sends.
  restoreStyleConflict(conflict!.id);
  assert.equal(listStyleConflicts().length, 0);
  assert.equal((await syncStyle(fetcher)).outcome, "pushed");
  assert.equal(remote.markdown, "# My style\n\nLocal edit made offline.\n");
});

test("first sign-in on a computer with its own style adopts the account and keeps the local copy", async () => {
  setLocalStyle("# My style\n\nThis laptop's notes.\n");
  remote = { revision: 4, markdown: "# My style\n\nAccount style.\n", preferences: null, templates: [], updated_at: null };
  signIn();
  assert.equal((await syncStyle(fetcher)).outcome, "conflict");
  assert.equal(readPersonalStyleDocument().markdown, "# My style\n\nAccount style.\n");
  assert.equal(listStyleConflicts()[0]?.local.markdown, "# My style\n\nThis laptop's notes.\n");
  assert.equal(calls.filter(call => call.method === "PUT").length, 0);
});

test("settings and saved templates travel with the style", async () => {
  writeEditingProfile({ ...readEditingProfile(), cloud_sharing: false });
  const template = {
    schema_version: 1, id: "11111111-1111-4111-8111-111111111111", revision: 1, name: "Punchy", description: "",
    bundles: [{ skill: "motion-graphics", parameters: { speed: 2 } }],
    authorization: { kind: "explicit_request", instruction: "Save this" },
    created_at: "2026-10-11T00:00:00.000Z", updated_at: "2026-10-11T00:00:00.000Z",
    source_edit: { project_id: "p", title: "P", timeline_revision: "x" },
  };
  writeJsonFileAtomic(path.join(profile, "personal-styles", `${template.id}.json`), template);
  signIn();
  await syncStyle(fetcher);
  assert.equal((remote.preferences as { cloud_sharing?: boolean }).cloud_sharing, false);
  assert.equal(remote.templates.length, 1);

  // Another computer removed the template and changed a setting.
  remote = { ...remote, revision: remote.revision + 1, templates: [], preferences: { ...remote.preferences, cloud_sharing: true } };
  assert.equal((await syncStyle(fetcher)).outcome, "pulled");
  assert.equal(readLocalStylePayload().templates.length, 0);
  assert.equal(readEditingProfile().cloud_sharing, true);
  assert.ok(fs.existsSync(path.join(profile, "personal-styles", "revisions", template.id, "1.json")), "earlier template revisions stay in the profile");
});

test("failures are recorded and retried, not thrown", async () => {
  signIn();
  const offline = async () => { throw new Error("offline"); };
  const result = await syncStyle(offline);
  assert.equal(result.outcome, "failed");
  assert.match(readStyleSyncState()?.error ?? "", /offline/);
  assert.equal((await syncStyle(fetcher)).outcome, "uploaded_first");
});

test("accepting a suggestion decides against the synced revision and pulls the new style", async () => {
  signIn();
  await syncStyle(fetcher);
  setLocalStyle("# My style\n\nUnsynced local line.\n");
  const id = "22222222-2222-4222-8222-222222222222";
  const suggestionFetcher = async (url: string, init?: RequestInit) => {
    if (url.endsWith(`/style/suggestions/${id}`)) {
      const body = JSON.parse(String(init!.body));
      calls.push({ method: "POST", url, body });
      if (body.base_revision !== remote.revision) return Response.json({ error: "stale" }, { status: 409 });
      remote = { ...remote, revision: remote.revision + 1, markdown: `${remote.markdown.trimEnd()}\n\nHold reaction shots a beat longer.\n` };
      return Response.json({ revision: remote.revision });
    }
    if (url.endsWith("/style/suggestions")) return Response.json({ suggestions: [{ id, title: "Longer reactions", rationale: "Twice extended", markdown_addition: "Hold reaction shots a beat longer.", evidence: [{ ref: "a", note: "n" }], created_at: "2026-10-11T00:00:00Z" }] });
    return fetcher(url, init);
  };
  const { listStyleSuggestions, decideStyleSuggestion } = await import("./cloud-style-sync");
  assert.equal((await listStyleSuggestions(suggestionFetcher))[0]?.title, "Longer reactions");
  await decideStyleSuggestion(id, "accept", suggestionFetcher);
  const decided = calls.find(call => call.url.endsWith(id))!;
  assert.equal(decided.body!.base_revision, 2, "local changes were pushed first, so the decision used revision 2");
  assert.equal(readPersonalStyleDocument().markdown, "# My style\n\nUnsynced local line.\n\nHold reaction shots a beat longer.\n");
  assert.equal(listStyleConflicts().length, 0);
});

test("an account without settings clears the cached ones instead of pushing them back", async () => {
  writeEditingProfile({ ...readEditingProfile(), cloud_sharing: false });
  signIn();
  await syncStyle(fetcher);
  assert.ok(remote.preferences);

  // Another computer cleared the settings.
  remote = { ...remote, revision: remote.revision + 1, preferences: null };
  assert.equal((await syncStyle(fetcher)).outcome, "pulled");
  assert.equal(fs.existsSync(path.join(profile, "preferences.json")), false);
  assert.equal(readEditingProfile().cloud_sharing, undefined);
  const before = calls.length;
  assert.equal((await syncStyle(fetcher)).outcome, "unchanged");
  assert.ok(!calls.slice(before).some(call => call.method === "PUT"), "the cleared settings are not pushed back");
  assert.equal(remote.preferences, null);
});

test("account settings this version cannot read stop the sync without changing either copy", async () => {
  writeEditingProfile({ ...readEditingProfile(), cloud_sharing: false });
  signIn();
  await syncStyle(fetcher);
  const local = fs.readFileSync(path.join(profile, "preferences.json"), "utf8");
  remote = { ...remote, revision: remote.revision + 1, preferences: { version: 2, future: true } };
  const result = await syncStyle(fetcher);
  assert.equal(result.outcome, "failed");
  assert.equal(fs.readFileSync(path.join(profile, "preferences.json"), "utf8"), local);
  assert.deepEqual(remote.preferences, { version: 2, future: true });
  assert.ok(readStyleSyncState()?.error);
  assert.deepEqual(listStyleConflicts(), []);
});
