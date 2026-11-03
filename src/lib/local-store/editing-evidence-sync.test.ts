import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { createProject, writeTimeline } from "./store";
import { readEditingProfile, writeEditingProfile, recordMemoryEvent } from "./editing-memory";
import { writeJsonFileAtomic } from "./atomic-json";
import { projectEditingRecord, syncEditingEvidence } from "./editing-evidence-sync";
import { installId } from "./export-sharing";
import { writePrivateCredential } from "./provider-keys";
import { cloudSessionFile } from "./cloud-account";
import type { TimelineElement } from "@/components/studio/timeline/types";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "editing-evidence-"));
test.after(() => fs.rmSync(root, { recursive: true, force: true }));
let sequence = 0;
/** Evidence uploads only from a signed-in account: sign in with this install already claimed. */
function signIn(profile: string, email = "creator@example.com") {
  process.env.DREAMCUT_CLOUD_URL = "https://cloud.test";
  writePrivateCredential(cloudSessionFile(), { access_token: "token", refresh_token: "refresh",
    expires_at: Math.floor(Date.now() / 1000) + 3600, email, signed_in_at: new Date().toISOString() });
  writeJsonFileAtomic(path.join(profile, "cloud-sync", "install-claim.json"), { account: email, install_id: installId(), status: "claimed", updated_at: new Date().toISOString() });
}
function setup() {
  const dir = path.join(root, String(++sequence));
  process.env.TIMELINE_PROJECTS_DIR = path.join(dir, "projects");
  process.env.DREAMCUT_PROFILE_DIR = path.join(dir, "profile");
  process.env.DREAMCUT_CLOUD_INGEST_URL = "https://ingest.example/functions/v1/ingest-export";
  writeEditingProfile({ ...readEditingProfile(), cloud_sharing: true });
  signIn(path.join(dir, "profile"));
  createProject("edit", "web");
  return path.join(dir, "projects", "edit");
}
const clip = (duration: number) => ({ id: "clip", type: "still", timeline_start: 0, duration,
  source_url: "/Users/private/footage.mp4", props: { text: "private transcript", media_scale: 1.2 },
  lane_key: "visual_0", lane_index: 0, removed_at: null } as unknown as TimelineElement);
function recorder(status = 200) {
  const calls: Record<string, any>[] = [];
  return { calls, fetcher: async (_url: string, init: RequestInit) => {
    calls.push(JSON.parse(new Headers(init.headers).get("content-encoding") === "gzip" ? gunzipSync(init.body as Uint8Array).toString("utf8") : String(init.body))); return Response.json({ ok: status === 200 }, { status });
  } };
}
const rows = (calls: Record<string, any>[]) => calls.flatMap(p => p.evidence.records);

test("ordinary edits and feedback upload without an export; successful batches do not repeat", async () => {
  const dir = setup();
  writeTimeline("edit", { elements: [clip(3)], transitions: [] }, "human_trim");
  writeTimeline("edit", { elements: [clip(2)], transitions: [] }, "human_trim_again");
  recordMemoryEvent("edit", { type: "editorial.feedback", actor: "human", summary: "Shorter please", data: { direction: "Shorter please" } });
  const send = recorder();
  const result = await syncEditingEvidence(send.fetcher);
  assert.deepEqual(result.errors, []);
  assert.ok(result.sent > 0);
  assert.deepEqual(rows(send.calls).filter(r => r.kind === "history").map(r => r.record.elements[0]?.duration), [3, 2]);
  assert.ok(rows(send.calls).some(r => r.record.direction === "Shorter please"));
  assert.doesNotMatch(JSON.stringify(send.calls), /private transcript|footage.mp4|\/Users\/private/);
  assert.equal(fs.existsSync(path.join(dir, "memory", "retros")), false);
  const repeat = recorder();
  await syncEditingEvidence(repeat.fetcher);
  assert.equal(repeat.calls.length, 0);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "timeline.json"), "utf8")).elements[0].duration, 2);
});

test("failed batches retain exact bytes across later edits, honor backoff, and recover", async () => {
  const dir = setup();
  writeTimeline("edit", { elements: [clip(3)], transitions: [] }, "trim");
  const offline = recorder(503);
  const first = await syncEditingEvidence(offline.fetcher, 1000);
  assert.match(first.errors[0]!, /503/);
  const stateFile = path.join(dir, "memory", "cloud-editing", "state.json");
  assert.ok(JSON.parse(fs.readFileSync(stateFile, "utf8")).pending);
  const early = recorder(); await syncEditingEvidence(early.fetcher, 1001);
  assert.equal(early.calls.length, 0);
  writeTimeline("edit", { elements: [clip(1)], transitions: [] }, "later_trim");
  const online = recorder(); await syncEditingEvidence(online.fetcher, 1_000_000);
  assert.deepEqual(online.calls[0], offline.calls[0]);
  assert.ok(rows(online.calls).some(r => r.record.elements?.[0]?.duration === 1));
  assert.equal(JSON.parse(fs.readFileSync(stateFile, "utf8")).pending, undefined);
});

test("sharing opt-out prevents retries; re-enabling recovers queued edits", async () => {
  setup(); writeTimeline("edit", { elements: [clip(3)], transitions: [] }, "trim");
  await syncEditingEvidence(recorder(503).fetcher, 1000);
  writeEditingProfile({ ...readEditingProfile(), cloud_sharing: false });
  const disabled = recorder(); await syncEditingEvidence(disabled.fetcher, 1_000_000);
  assert.equal(disabled.calls.length, 0);
  writeEditingProfile({ ...readEditingProfile(), cloud_sharing: true });
  const enabled = recorder(); await syncEditingEvidence(enabled.fetcher, 1_000_000);
  assert.ok(enabled.calls.length > 0);
});

test("proposal decisions are collected and batches bound a large backlog", async () => {
  const dir = setup();
  const proposal = { proposal_id: "p1", status: "pending", proposal: { summary: "Tighter cut", operations: [] } };
  writeJsonFileAtomic(path.join(dir, "proposals", "p1.json"), proposal);
  for (let i = 0; i < 205; i++) recordMemoryEvent("edit", { id: `event-${i}`, type: "editorial.feedback", actor: "human", summary: `Direction ${i}` });
  const initial = recorder(); await syncEditingEvidence(initial.fetcher);
  assert.ok(initial.calls.length >= 3);
  assert.ok(initial.calls.every(p => p.evidence.records.length <= 100));
  assert.equal(rows(initial.calls).filter(r => r.kind === "memory/events").length, 205);
  writeJsonFileAtomic(path.join(dir, "proposals", "p1.json"), { ...proposal, status: "rejected", resolution: { reason: "Too quick" } });
  const changed = recorder(); await syncEditingEvidence(changed.fetcher);
  assert.ok(rows(changed.calls).some(r => r.kind === "proposals" && r.record.status === "rejected"));
  assert.notEqual(changed.calls[0]?.job_id, initial.calls[0]?.job_id);
});

test("symlinked records are excluded and malformed records do not block valid history", async () => {
  const dir = setup();
  writeTimeline("edit", { elements: [clip(3)], transitions: [] }, "trim");
  fs.writeFileSync(path.join(dir, "history", "bad.json"), "broken");
  fs.symlinkSync(path.join(dir, "timeline.json"), path.join(dir, "history", "linked.json"));
  const send = recorder(); const result = await syncEditingEvidence(send.fetcher);
  assert.ok(result.errors.some(e => /unreadable/.test(e)));
  assert.ok(rows(send.calls).some(r => r.kind === "history"));
  assert.ok(rows(send.calls).every(r => !r.record_id.endsWith("linked.json")));
});

test("editorial text redacts credentials, links, paths and embedded media", () => {
  const result = projectEditingRecord("memory/events", { id: "e", type: "editorial.feedback", actor: "human",
    summary: "Use https://example.test/private and /Users/me/source.mp4 Bearer secret123 data:image/png;base64,AAAA" });
  assert.doesNotMatch(JSON.stringify(result), /example.test|source.mp4|secret123|AAAA/);
});

test("queued account evidence never falls back to a different account or signed-out upload", async () => {
  const dir = setup();
  const { writePrivateCredential } = await import("./provider-keys");
  const { cloudSessionFile, signOutOfCloud } = await import("./cloud-account");
  process.env.DREAMCUT_CLOUD_URL = "https://cloud.test";
  writePrivateCredential(cloudSessionFile(), { access_token: "token", refresh_token: "refresh",
    expires_at: Math.floor(Date.now() / 1000) + 3600, email: "one@example.com", signed_in_at: new Date().toISOString() });
  try {
    writeTimeline("edit", { elements: [clip(3)], transitions: [] }, "trim");
    const urls: string[] = [];
    await syncEditingEvidence(async (url) => {
      urls.push(url); return Response.json({}, { status: url.endsWith("claim") ? 200 : 503 });
    }, 1000);
    assert.deepEqual(urls, ["https://cloud.test/api/v1/installs/claim", "https://cloud.test/api/v1/evidence"]);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "memory", "cloud-editing", "state.json"), "utf8")).pending.account, "one@example.com");
    signOutOfCloud();
    const signedOut = recorder(); await syncEditingEvidence(signedOut.fetcher, 1_000_000);
    assert.equal(signedOut.calls.length, 0);
  } finally { signOutOfCloud(); delete process.env.DREAMCUT_CLOUD_URL; }
});

test("sharing is rechecked after asynchronous install authentication", async () => {
  setup();
  const { sendEditingEvidence } = await import("./export-sharing");
  const { writePrivateCredential } = await import("./provider-keys");
  const { cloudSessionFile, signOutOfCloud } = await import("./cloud-account");
  process.env.DREAMCUT_CLOUD_URL = "https://cloud.test";
  writePrivateCredential(cloudSessionFile(), { access_token: "token", refresh_token: "refresh",
    expires_at: Math.floor(Date.now() / 1000) + 3600, email: "two@example.com", signed_in_at: new Date().toISOString() });
  const calls: string[] = [];
  try {
    const response = await sendEditingEvidence("{}", async url => {
      calls.push(url);
      writeEditingProfile({ ...readEditingProfile(), cloud_sharing: false });
      return Response.json({});
    });
    assert.equal(response, null);
    assert.deepEqual(calls, ["https://cloud.test/api/v1/installs/claim"]);
  } finally { signOutOfCloud(); delete process.env.DREAMCUT_CLOUD_URL; }
});

test("low disk headroom prevents sending and preserves authoritative history", async () => {
  const dir = setup();
  writeTimeline("edit", { elements: [clip(3)], transitions: [] }, "trim");
  const before = fs.readFileSync(path.join(dir, "timeline.json"), "utf8");
  const original = fs.statfsSync;
  fs.statfsSync = (() => ({ bavail: 0, bsize: 4096 })) as typeof fs.statfsSync;
  try {
    const send = recorder(); const result = await syncEditingEvidence(send.fetcher);
    assert.equal(send.calls.length, 0);
    assert.ok(result.errors.some(e => /space/.test(e)));
    assert.equal(fs.readFileSync(path.join(dir, "timeline.json"), "utf8"), before);
  } finally { fs.statfsSync = original; }
});

test("transition edits and saved tuning retain their useful values without arbitrary payloads", () => {
  const projected = projectEditingRecord("history", { op: "transition", timeline: { elements: [], transitions: [
    { id: "t", from_element_id: "a", to_element_id: "b", type: "whip", duration_seconds: 0.4,
      params: { direction: "left", whip_blur_strength: 0.8, arbitrary_code: "secret script" } },
  ] } }) as any;
  assert.equal(projected.transitions[0].duration_seconds, 0.4);
  assert.equal(projected.transitions[0].params.whip_blur_strength, 0.8);
  assert.doesNotMatch(JSON.stringify(projected), /secret script|arbitrary_code/);
  const overrides = [{ operation_index: 0, target: "patch", field: "volume", value: 0.5 }];
  const tuning = projectEditingRecord("memory/events", { id: "e", type: "proposal.tuned", summary: "Adjusted controls", actor: "human",
    data: { proposal_ids: ["p"], option_id: "gain", overrides } }) as any;
  assert.deepEqual(tuning.overrides, overrides);
});

test("history uploads send only changed clips after a full first snapshot", async () => {
  setup();
  const a = { ...clip(3), id: "a" } as TimelineElement, b = { ...clip(4), id: "b" } as TimelineElement;
  writeTimeline("edit", { elements: [a, b], transitions: [] }, "build");
  writeTimeline("edit", { elements: [{ ...a, duration: 2 } as TimelineElement, b], transitions: [] }, "trim_a");
  writeTimeline("edit", { elements: [{ ...a, duration: 2 } as TimelineElement], transitions: [] }, "remove_b");
  const send = recorder();
  await syncEditingEvidence(send.fetcher);
  const history = rows(send.calls).filter(r => r.kind === "history").map(r => r.record);
  assert.deepEqual(history.map(r => r.snapshot), ["full", "delta", "delta"]);
  assert.deepEqual(history[0].elements.map((e: { id: string }) => e.id), ["a", "b"]);
  assert.deepEqual(history[1].elements.map((e: { id: string; duration: number }) => [e.id, e.duration]), [["a", 2]]);
  assert.equal(history[1].base_record_id, rows(send.calls).filter(r => r.kind === "history")[0].record_id);
  assert.deepEqual(history[2].elements, []);
  assert.deepEqual(history[2].removed_element_ids, ["b"]);
  assert.equal(send.calls[0].evidence.schema, "dreamcut.editing-records.v2");
});

test("a snapshot after an already-uploaded one is still a delta against it", async () => {
  setup();
  writeTimeline("edit", { elements: [{ ...clip(3), id: "a" } as TimelineElement], transitions: [] }, "first");
  await syncEditingEvidence(recorder().fetcher);
  writeTimeline("edit", { elements: [{ ...clip(1), id: "a" } as TimelineElement], transitions: [] }, "second");
  const later = recorder();
  await syncEditingEvidence(later.fetcher);
  const [record] = rows(later.calls).filter(r => r.kind === "history").map(r => r.record);
  assert.equal(record.snapshot, "delta");
  assert.deepEqual(record.elements.map((e: { duration: number }) => e.duration), [1]);
});

test("a snapshot after one that was never sent goes as a full snapshot, so the cloud can rebuild it", async () => {
  setup();
  writeTimeline("edit", { elements: [{ ...clip(3), id: "a" } as TimelineElement], transitions: [] }, "first");
  // Readable, but too large for one packet: it stays local, so the next snapshot cannot be a delta on it.
  const many = Array.from({ length: 40_000 }, (_, i) => ({ ...clip(2), id: `clip-${i}`, timeline_start: i } as TimelineElement));
  writeTimeline("edit", { elements: many, transitions: [] }, "second");
  writeTimeline("edit", { elements: [{ ...clip(1), id: "a" } as TimelineElement], transitions: [] }, "third");
  const send = recorder();
  const result = await syncEditingEvidence(send.fetcher);
  assert.ok(result.errors.some(e => /packet limit/.test(e)), result.errors.join("; "));
  const history = rows(send.calls).filter(r => r.kind === "history").map(r => r.record);
  assert.deepEqual(history.map(r => r.snapshot), ["full", "full"]);
  assert.deepEqual(history[1].elements.map((e: { duration: number }) => e.duration), [1]);
});

test("packets are gzip-compressed, and a cloud without compression gets the same packet as JSON", async () => {
  setup();
  writeTimeline("edit", { elements: [clip(3)], transitions: [] }, "human_trim");
  const seen: { encoding: string | null; body: Record<string, any> }[] = [];
  const fetcher = async (_url: string, init: RequestInit) => {
    const encoding = new Headers(init.headers).get("content-encoding");
    const body = JSON.parse(encoding === "gzip" ? gunzipSync(init.body as Uint8Array).toString("utf8") : String(init.body));
    seen.push({ encoding, body });
    return encoding === "gzip" ? new Response("unsupported", { status: 415 }) : Response.json({ ok: true });
  };
  const result = await syncEditingEvidence(fetcher);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(seen.map(s => s.encoding), ["gzip", null]);
  assert.deepEqual(seen[0]!.body, seen[1]!.body);
});
