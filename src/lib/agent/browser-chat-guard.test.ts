import assert from "node:assert/strict";
import test from "node:test";
import { assertLocalEditorRequest } from "./browser-chat-guard";

const request = (headers: Record<string, string>) => new Request("http://127.0.0.1:3123/api/x", { headers });

test("agent chat accepts only same-origin requests to a loopback host", () => {
  assert.equal(assertLocalEditorRequest(request({ host: "127.0.0.1:3123", origin: "http://127.0.0.1:3123" }), { requireOrigin: true }), "http://127.0.0.1:3123");
  assert.equal(assertLocalEditorRequest(request({ host: "localhost:3123", origin: "http://localhost:3123", "sec-fetch-site": "same-origin" }), { requireOrigin: true }), "http://127.0.0.1:3123");
  assert.equal(assertLocalEditorRequest(request({ host: "localhost:3123" }), { requireOrigin: false }), "http://127.0.0.1:3123");
});

test("agent chat rejects other sites, rebound hosts and origin-less writes", () => {
  assert.throws(() => assertLocalEditorRequest(request({ host: "evil.example:3123", origin: "http://evil.example:3123" }), { requireOrigin: true }), /local editor/);
  assert.throws(() => assertLocalEditorRequest(request({ host: "127.0.0.1:3123", origin: "https://evil.example" }), { requireOrigin: true }), /this editor/);
  assert.throws(() => assertLocalEditorRequest(request({ host: "127.0.0.1:3123" }), { requireOrigin: true }), /this editor/);
  assert.throws(() => assertLocalEditorRequest(request({ host: "127.0.0.1:3123", "sec-fetch-site": "cross-site" }), { requireOrigin: false }), /this editor/);
});

test("read-only streams accept the editor page on a sibling loopback name of the same port", () => {
  assert.equal(assertLocalEditorRequest(request({ host: "[::1]:3123", origin: "http://127.0.0.1:3123", "sec-fetch-site": "cross-site" }), { requireOrigin: false, siblingOrigin: true }), "http://127.0.0.1:3123");
  assert.equal(assertLocalEditorRequest(request({ host: "[::1]:3129", origin: "http://localhost:3129", "sec-fetch-site": "same-site" }), { requireOrigin: false, siblingOrigin: true }), "http://127.0.0.1:3129");
  assert.throws(() => assertLocalEditorRequest(request({ host: "[::1]:3123", origin: "http://127.0.0.1:3123", "sec-fetch-site": "cross-site" }), { requireOrigin: false }), /this editor/);
  assert.throws(() => assertLocalEditorRequest(request({ host: "[::1]:3123", origin: "http://127.0.0.1:8080", "sec-fetch-site": "cross-site" }), { requireOrigin: false, siblingOrigin: true }), /this editor/);
  assert.throws(() => assertLocalEditorRequest(request({ host: "[::1]:3123", origin: "https://evil.example", "sec-fetch-site": "cross-site" }), { requireOrigin: false, siblingOrigin: true }), /this editor/);
});
