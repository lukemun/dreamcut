import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { randomUUID } from "node:crypto";
import { readEditingProfile, writeEditingProfile } from "./editing-memory";
import { syncUsageEvidence, toolUsageDay } from "./usage-evidence-sync";
import { installId } from "./export-sharing";
import { writePrivateCredential } from "./provider-keys";
import { cloudSessionFile } from "./cloud-account";
import { writeJsonFileAtomic } from "./atomic-json";
import { recordProductSignal } from "../observability/product-signals";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "usage-evidence-"));
test.after(() => fs.rmSync(root, { recursive: true, force: true }));
let sequence = 0;
/** Evidence uploads only from a signed-in account: sign in with this install already claimed. */
function signIn(profile: string, email = "creator@example.com") {
  process.env.DREAMCUT_CLOUD_URL = "https://cloud.test";
  writePrivateCredential(cloudSessionFile(), { access_token: "token", refresh_token: "refresh",
    expires_at: Math.floor(Date.now() / 1000) + 3600, email, signed_in_at: new Date().toISOString() });
  writeJsonFileAtomic(path.join(profile, "cloud-sync", "install-claim.json"), { account: email, install_id: installId(), status: "claimed", updated_at: new Date().toISOString() });
}
function setup(sharing = true) {
  const profile = path.join(root, String(++sequence), "profile");
  process.env.DREAMCUT_PROFILE_DIR = profile;
  process.env.DREAMCUT_CLOUD_INGEST_URL = "https://ingest.example/functions/v1/ingest-export";
  writeEditingProfile({ ...readEditingProfile(), cloud_sharing: sharing });
  signIn(profile);
  return profile;
}
function recorder(status = 200) {
  const calls: Record<string, any>[] = [];
  return { calls, fetcher: async (_url: string, init: RequestInit) => {
    calls.push(JSON.parse(new Headers(init.headers).get("content-encoding") === "gzip" ? gunzipSync(init.body as Uint8Array).toString("utf8") : String(init.body))); return Response.json({ ok: status === 200 }, { status });
  } };
}
const dispatch = (tool: string, success: boolean, extra: Record<string, unknown> = {}) => ({ schema_version: 1, event: "dreamcut.tool_dispatch", call_id: randomUUID(),
  request_id: "1", session_id: randomUUID(), tool, contract_version: 1, project_id: "private-wedding",
  started_at: "2026-10-20T10:00:00.000Z", finished_at: "2026-10-20T10:00:01.000Z", duration_ms: 1000, success, ...extra });
function writeToolDay(profile: string, day: string, events: unknown[]) {
  fs.mkdirSync(path.join(profile, "tool-events"), { recursive: true });
  fs.writeFileSync(path.join(profile, "tool-events", `${day}.jsonl`), events.map(e => JSON.stringify(e)).join("\n") + "\n");
}
const NOW = Date.parse("2026-10-21T12:00:00.000Z");

test("tool totals drop projects and arguments and count each call once", () => {
  const profile = setup();
  const repeated = dispatch("proposal_create", false, { error_code: "INVALID_ARGUMENTS" });
  writeToolDay(profile, "2026-10-20", [dispatch("timeline_get", true), repeated, repeated, dispatch("proposal_create", true)]);
  const rows = toolUsageDay(path.join(profile, "tool-events", "2026-10-20.jsonl"));
  assert.deepEqual(rows.map(r => [r.tool, r.calls, r.failures]), [["proposal_create", 2, 1], ["timeline_get", 1, 0]]);
  assert.deepEqual(rows[0]!.error_codes, { INVALID_ARGUMENTS: 1 });
  assert.equal(JSON.stringify(rows).includes("private-wedding"), false);
});

test("completed days upload once; today stays local", async () => {
  const profile = setup();
  writeToolDay(profile, "2026-10-20", [dispatch("timeline_get", true)]);
  writeToolDay(profile, "2026-10-21", [dispatch("timeline_get", true)]);
  const send = recorder();
  const first = await syncUsageEvidence(send.fetcher, NOW);
  assert.deepEqual(first.errors, []);
  assert.equal(send.calls.length, 1);
  const packet = send.calls[0]!;
  assert.equal(packet.packet_type, "product_usage");
  assert.equal(packet.project_id, "_profile");
  assert.equal(packet.evidence.kind, "tool_usage");
  assert.equal(packet.evidence.day, "2026-10-20");
  await syncUsageEvidence(send.fetcher, NOW);
  assert.equal(send.calls.length, 1);
});

test("product signals upload as recorded, including capability gaps", async () => {
  setup();
  recordProductSignal({ schema_version: 1, signal_id: randomUUID(), at: "2026-10-20T09:00:00.000Z", session_id: randomUUID(), client: "mcp-direct",
    event: "capability_gap", needed: "Reverse a clip; wrote ffmpeg in /Users/me/tmp/rev.sh", workaround: "own_script", programs: ["ffmpeg"], nearest_tools: ["proposal_create"], outcome: "worked" });
  const send = recorder();
  await syncUsageEvidence(send.fetcher, NOW);
  const items = send.calls.filter(p => p.evidence.kind === "product_signals").flatMap(p => p.evidence.items);
  assert.equal(items.length, 1);
  assert.equal(items[0].event, "capability_gap");
  assert.equal(items[0].needed.includes("/Users/"), false);
});

test("nothing is sent with sharing off, and a failure backs off without losing the day", async () => {
  const off = setup(false);
  writeToolDay(off, "2026-10-20", [dispatch("timeline_get", true)]);
  const none = recorder();
  await syncUsageEvidence(none.fetcher, NOW);
  assert.equal(none.calls.length, 0);

  const profile = setup();
  writeToolDay(profile, "2026-10-20", [dispatch("timeline_get", true)]);
  const failing = recorder(500);
  const failed = await syncUsageEvidence(failing.fetcher, NOW);
  assert.equal(failed.sent, 0);
  assert.equal(failed.errors.length, 1);
  const retry = recorder();
  await syncUsageEvidence(retry.fetcher, NOW + 60_000);
  assert.equal(retry.calls.length, 0, "waits for its retry time");
  await syncUsageEvidence(retry.fetcher, NOW + 16 * 60_000);
  assert.equal(retry.calls.length, 1);
});
