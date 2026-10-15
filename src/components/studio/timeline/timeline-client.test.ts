import assert from "node:assert/strict";
import test from "node:test";

import { createTimelineClient } from "@/components/studio/timeline/timeline-client";

type FetchCall = {
  input: RequestInfo | URL;
  init?: RequestInit;
};

function withMockFetch(
  handler: (calls: FetchCall[]) => typeof globalThis.fetch,
  run: (calls: FetchCall[]) => Promise<void>,
) {
  const originalFetch = globalThis.fetch;
  const calls: FetchCall[] = [];
  globalThis.fetch = handler(calls);
  return run(calls).finally(() => {
    globalThis.fetch = originalFetch;
  });
}

test("patchElement sends PATCH JSON payload to the element route", async () => {
  await withMockFetch(
    (calls) => (async (input, init) => {
      calls.push({ input, init });
      return new Response(JSON.stringify({ element: { id: "el-1" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof globalThis.fetch,
    async (calls) => {
      const client = createTimelineClient("project-1");
      const result = await client.patchElement("el-1", { volume: 0.75 });

      assert.equal(result.response.ok, true);
      assert.equal(calls.length, 1);
      assert.equal(String(calls[0]?.input), "/api/projects/project-1/timeline/elements/el-1");
      assert.equal(calls[0]?.init?.method, "PATCH");
      assert.equal(calls[0]?.init?.headers && (calls[0]?.init?.headers as Record<string, string>)["Content-Type"], "application/json");
      assert.equal(calls[0]?.init?.body, JSON.stringify({ volume: 0.75 }));
    },
  );
});

test("patchBeatDuration throws the API error message on non-ok responses", async () => {
  await withMockFetch(
    () => (async () => new Response(JSON.stringify({ error: "Beat locked" }), {
      status: 409,
      headers: { "Content-Type": "application/json" },
    })) as typeof globalThis.fetch,
    async () => {
      const client = createTimelineClient("project-1");
      await assert.rejects(
        () => client.patchBeatDuration("beat-1", 4.5, "Fallback"),
        /Beat locked/,
      );
    },
  );
});

test("duplicateElement falls back to an empty body when the response is not JSON", async () => {
  await withMockFetch(
    () => (async () => new Response("not-json", { status: 500 })) as typeof globalThis.fetch,
    async () => {
      const client = createTimelineClient("project-1");
      const result = await client.duplicateElement("el-1");

      assert.equal(result.response.ok, false);
      assert.deepEqual(result.body, {});
    },
  );
});

test("saveLaneOrderKeys sends the ordered lane list to the lane-order route", async () => {
  await withMockFetch(
    (calls) => (async (input, init) => {
      calls.push({ input, init });
      return new Response(JSON.stringify({ lane_order_keys: ["visual_0", "audio_narrator"] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof globalThis.fetch,
    async (calls) => {
      const client = createTimelineClient("project-1");
      await client.saveLaneOrderKeys(["visual_0", "audio_narrator"]);

      assert.equal(String(calls[0]?.input), "/api/projects/project-1/timeline/lane-order");
      assert.equal(calls[0]?.init?.method, "PATCH");
      assert.equal(calls[0]?.init?.body, JSON.stringify({ lane_order_keys: ["visual_0", "audio_narrator"] }));
    },
  );
});

test("saveOutputAspectRatio persists the selected output format", async () => {
  await withMockFetch(
    (calls) => (async (input, init) => {
      calls.push({ input, init });
      return new Response(JSON.stringify({ aspect_ratio: "9:16" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof globalThis.fetch,
    async (calls) => {
      const client = createTimelineClient("project-1");
      const result = await client.saveOutputAspectRatio("9:16");

      assert.equal(result.body.aspect_ratio, "9:16");
      assert.equal(String(calls[0]?.input), "/api/projects/project-1/timeline/output-format");
      assert.equal(calls[0]?.init?.method, "PATCH");
      assert.equal(calls[0]?.init?.body, JSON.stringify({ aspect_ratio: "9:16" }));
    },
  );
});

test("restoreHistorySnapshot posts the persistent snapshot id", async () => {
  await withMockFetch(
    (calls) => (async (input, init) => {
      calls.push({ input, init });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof globalThis.fetch,
    async (calls) => {
      const client = createTimelineClient("project-1");
      const result = await client.restoreHistorySnapshot("before.json");

      assert.equal(result.response.ok, true);
      assert.equal(String(calls[0]?.input), "/api/projects/project-1/timeline/history/restore");
      assert.equal(calls[0]?.init?.method, "POST");
      assert.equal(calls[0]?.init?.body, JSON.stringify({ snapshot_id: "before.json" }));
    },
  );
});
