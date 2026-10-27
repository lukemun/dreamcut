import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

process.env.DREAMCUT_PROFILE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "membership-test-"));
process.env.DREAMCUT_CLOUD_URL = "https://cloud.test";
const offer = { name: "DreamCut Monthly", cents: 500, regular_cents: 800, benefits: ["2,500 credits every month"] };

test("signed out, the editor gets the offer and no membership answer", async () => {
  const { cloudMembership } = await import("./membership");
  const urls: string[] = [];
  const result = await cloudMembership(async url => { urls.push(String(url)); return Response.json(offer); }, 1);
  assert.deepEqual(urls, ["https://cloud.test/api/v1/membership"]);
  assert.deepEqual(result, { signed_in: false, member: null, offer, subscribe_url: "https://cloud.test/account?buy=monthly" });
});

test("an unreachable cloud shows no offer and is not cached", async () => {
  const { cloudMembership } = await import("./membership");
  process.env.DREAMCUT_CLOUD_URL = "https://other.test";
  let calls = 0;
  const down = async () => { calls += 1; throw new Error("offline"); };
  assert.equal((await cloudMembership(down, 2)).offer, null);
  await cloudMembership(down, 3);
  assert.equal(calls, 2);
});
