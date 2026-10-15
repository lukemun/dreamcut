import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { adminFromEnv, parseArgs, pull, push, suggestionsFileSchema } from "./cloud-learning";

const userId = "55555555-5555-4555-8555-555555555555";
const install = "66666666-6666-4666-8666-666666666666";
function supabase() {
  const calls: { method: string; url: string; body?: unknown }[] = [];
  const fetcher = async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer service");
    const route = url.replace("https://db.test", "");
    if (route.startsWith("/auth/v1/admin/users")) return Response.json({ users: [{ id: "other", email: "someone@example.com" }, { id: userId, email: "Creator@Example.com" }] });
    if (route.startsWith("/rest/v1/install_claims")) return Response.json([{ install_id: install }]);
    if (route === "/storage/v1/object/list/export-packets") {
      const prefix = (JSON.parse(String(init!.body)) as { prefix: string }).prefix;
      if (prefix === `v1/${install}/`) return Response.json([{ name: "project-a", id: null }]);
      return Response.json([
        { name: "old-job.json", id: "1", created_at: "2026-10-01T00:00:00.000Z", metadata: { size: 10 } },
        { name: "new-job.json", id: "2", created_at: "2026-10-10T00:00:00.000Z", metadata: { size: 12 } },
      ]);
    }
    if (route.startsWith("/storage/v1/object/export-packets/")) return new Response(JSON.stringify({ schema: "dreamcut.export-packet.v1", job_id: route.split("/").at(-1) }));
    if (route === "/rest/v1/evidence_access_log") return new Response(null, { status: 201 });
    if (route === "/rest/v1/style_suggestions") return Response.json((JSON.parse(String(init!.body)) as { title: string }[]).map((row, index) => ({ id: `id-${index}`, title: row.title })), { status: 201 });
    return new Response("not found", { status: 404 });
  };
  return { calls, admin: adminFromEnv({ SUPABASE_URL: "https://db.test", SUPABASE_SERVICE_ROLE_KEY: "service" }, fetcher) };
}

test("arguments require an email and a known command", () => {
  assert.deepEqual(parseArgs(["pull", "--email", "a@b.c", "--since", "all"]), { command: "pull", flags: { email: "a@b.c", since: "all" } });
  assert.throws(() => parseArgs(["pull"]), /--email/);
  assert.throws(() => parseArgs(["push", "--email", "a@b.c"]), /--file/);
  assert.throws(() => parseArgs(["delete", "--email", "a@b.c"]), /Usage/);
  assert.throws(() => adminFromEnv({}), /SUPABASE_URL/);
});

test("pull downloads the account's packets since a date outside the repository and logs the access", async () => {
  const { calls, admin } = supabase();
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "cloud-learning-"));
  const result = await pull(admin, { email: "creator@example.com", since: "2026-10-05T00:00:00Z", out, operator: "ops" });
  assert.equal(result.downloaded, 1);
  const index = JSON.parse(fs.readFileSync(path.join(out, "index.json"), "utf8"));
  assert.equal(index.user_id, userId);
  assert.deepEqual(index.packets.map((entry: { job_id: string }) => entry.job_id), ["new-job"]);
  assert.ok(fs.existsSync(path.join(out, "packets", install, "project-a", "new-job.json")));
  const log = calls.find(call => call.url.endsWith("/evidence_access_log"))!;
  assert.deepEqual(log.body, { user_id: userId, operator: "ops", action: "pull", object_count: 1 });
  await assert.rejects(pull(admin, { email: "creator@example.com", out: path.join(process.cwd(), "private-pull"), operator: "ops" }), /outside the repository/);
});

test("push validates suggestions and inserts them pending with the operator", async () => {
  const valid = { title: "Longer reaction shots", rationale: "Extended twice after agent cuts.", markdown_addition: "Hold reaction shots a beat longer.", evidence: [{ ref: "packet:a#chapter-3", note: "Extended by 0.4s" }, { ref: "packet:b#chapter-9", note: "Extended by 0.6s" }] };
  assert.equal(suggestionsFileSchema.safeParse({ suggestions: [{ ...valid, evidence: [valid.evidence[0], valid.evidence[0]] }] }).success, false, "two distinct citations are required");
  assert.equal(suggestionsFileSchema.safeParse([]).success, false);
  const { calls, admin } = supabase();
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cloud-learning-")), "suggestions.json");
  fs.writeFileSync(file, JSON.stringify({ suggestions: [valid] }));
  assert.deepEqual(await push(admin, { email: "creator@example.com", file, operator: "ops" }), [{ id: "id-0", title: valid.title }]);
  const insert = calls.find(call => call.url.endsWith("/style_suggestions"))!;
  assert.deepEqual(insert.body, [{ ...valid, user_id: userId, created_by: "ops", status: "pending" }]);
});
