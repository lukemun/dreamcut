import assert from "node:assert/strict";
import test from "node:test";
import { localRequestRefusal } from "../local-request";
import { assertGenerationOrigin } from "./asset-generation";

const request = (path: string, init: { method?: string; headers?: Record<string, string> } = {}) =>
  new Request(`http://127.0.0.1:3123${path}`, { method: init.method ?? "GET", headers: init.headers });
const editor = { origin: "http://127.0.0.1:3123", "sec-fetch-site": "same-origin" };

test("the editor's own pages, agents and the CLI reach the API", () => {
  assert.equal(localRequestRefusal(request("/api/generate", { method: "POST", headers: { host: "127.0.0.1:3123", ...editor } })), null);
  assert.equal(localRequestRefusal(request("/api/generate", { method: "POST", headers: { host: "127.0.0.1:3123", "content-type": "application/json" } })), null, "MCP sends no browser headers");
  assert.equal(localRequestRefusal(request("/api/projects", { headers: { host: "localhost:3123" } })), null);
  assert.equal(localRequestRefusal(request("/p/demo", { headers: { host: "[::1]:3123", "sec-fetch-site": "cross-site" } })), null, "opening a page from a link is fine");
});

test("a rebinding domain is refused even when its Origin matches its own Host", () => {
  const rebound = { host: "evil.example:3123", origin: "http://evil.example:3123", "sec-fetch-site": "same-origin" };
  assert.match(localRequestRefusal(request("/api/generate", { method: "POST", headers: rebound }))!, /this computer/);
  assert.match(localRequestRefusal(request("/api/projects", { headers: rebound }))!, /this computer/, "reads too: project data stays private");
  assert.throws(() => assertGenerationOrigin(request("/api/generate", { method: "POST", headers: rebound })), /this editor/);
});

test("another site cannot make the editor spend credits or write", () => {
  for (const headers of [
    { host: "127.0.0.1:3123", origin: "https://evil.example", "sec-fetch-site": "cross-site" },
    { host: "127.0.0.1:3123", "sec-fetch-site": "cross-site" },
    { host: "127.0.0.1:3123", origin: "http://localhost:3123" },
    { host: "127.0.0.1:3123", origin: "null" },
  ]) {
    assert.ok(localRequestRefusal(request("/api/projects/demo/asset-generation", { method: "POST", headers })), JSON.stringify(headers));
    assert.throws(() => assertGenerationOrigin(request("/api/projects/demo/asset-generation", { method: "POST", headers })));
  }
});
