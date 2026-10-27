import assert from "node:assert/strict";
import test from "node:test";

import { editorSiblingCorsHeaders, mediaTransportUrl, streamTransportUrl, type PagePlace, editorSiblingPreflightHeaders } from "./loopback-transport";

const place = (href: string): PagePlace => { const url = new URL(href); return { protocol: url.protocol, hostname: url.hostname, port: url.port, origin: url.origin, href: url.href }; };
const ipPage = place("http://127.0.0.1:3123/p/demo"), namePage = place("http://localhost:3129/p/demo");

test("media loads from the sibling loopback name of the same port", () => {
  const media = "/api/projects/demo/media/.prepared/editor-media-v1/a/b/preview.mp4";
  assert.equal(mediaTransportUrl(media, ipPage), `http://localhost:3123${media}`);
  assert.equal(mediaTransportUrl(media, namePage), `http://127.0.0.1:3129${media}`);
  // A URL stored under either name of this editor is the editor's own.
  assert.equal(mediaTransportUrl(`http://localhost:3123${media}`, ipPage), `http://localhost:3123${media}`);
  assert.equal(mediaTransportUrl(`http://127.0.0.1:3123${media}?w=320`, ipPage), `http://localhost:3123${media}?w=320`);
  for (const route of ["/api/music-catalog/media/a.m4a?preview=1", "/api/sfx-catalog/media/x.wav", "/api/visual-catalog/media/v.mp4", "/api/image-catalog/media/i.png",
    "/api/projects/demo/library/instruments/k/drums", "/api/projects/demo/render/latest/file", "/api/exports/job/file", "/api/guide/effects/e/media", "/api/guide/user-effects/e/media",
    "/api/template-drafts/d/media", "/api/user/video-ideas/i/media"]) {
    assert.equal(mediaTransportUrl(route, ipPage), `http://localhost:3123${route}`, route);
  }
});

test("everything else keeps its URL", () => {
  const media = "/api/projects/demo/media/clip.mp4";
  for (const url of ["", "blob:http://127.0.0.1:3123/1", "data:video/mp4;base64,AA", "/api/projects/demo/timeline", "/api/projects/demo/mediaX/clip.mp4", "/catalogs/a.mp4",
    `http://127.0.0.1:3124${media}`, `https://example.com${media}`]) {
    assert.equal(mediaTransportUrl(url, ipPage), url, url);
  }
  assert.equal(mediaTransportUrl(media, place("http://[::1]:3123/")), media);
  assert.equal(mediaTransportUrl(media, place("http://render.local:4000/")), media);
  assert.equal(mediaTransportUrl(media, place("https://localhost:3123/")), media);
  assert.equal(mediaTransportUrl(media, null), media);
});

test("event streams open on the stream-only [::1] name", () => {
  assert.equal(streamTransportUrl("/api/projects/demo/agent-chat/events", ipPage), "http://[::1]:3123/api/projects/demo/agent-chat/events");
  assert.equal(streamTransportUrl("/api/projects/demo/agent-chat/events", namePage), "http://[::1]:3129/api/projects/demo/agent-chat/events");
  assert.equal(streamTransportUrl("/x", place("http://[::1]:3123/")), null);
  assert.equal(streamTransportUrl("/x", place("http://example.com/")), null);
  assert.equal(streamTransportUrl("/x", null), null);
});

const request = (host: string, origin?: string) => new Request(`http://${host}/api/projects/demo/media/clip.mp4`, { headers: { host, ...(origin ? { origin } : {}) } });

test("sibling CORS answers only the editor's own loopback origins on the same port", () => {
  for (const [host, origin] of [["localhost:3123", "http://127.0.0.1:3123"], ["127.0.0.1:3129", "http://localhost:3129"], ["[::1]:3123", "http://127.0.0.1:3123"]]) {
    const headers = editorSiblingCorsHeaders(request(host, origin));
    assert.equal(headers["Access-Control-Allow-Origin"], origin);
    assert.equal(headers.Vary, "Origin");
    assert.match(headers["Access-Control-Expose-Headers"], /Content-Range/);
    assert.match(headers["Access-Control-Expose-Headers"], /Accept-Ranges/);
    assert.match(headers["Access-Control-Expose-Headers"], /Content-Length/);
  }
  for (const [host, origin] of [["localhost:3123", undefined], ["localhost:3123", "http://127.0.0.1:8080"], ["localhost:3123", "https://evil.example"], ["localhost:3123", "null"],
    ["localhost:3123", "https://127.0.0.1:3123"], ["evil.example:3123", "http://127.0.0.1:3123"]] as const) {
    assert.deepEqual(editorSiblingCorsHeaders(request(host, origin)), {}, `${host} ${origin}`);
  }
});

test("a media preflight from the sibling loopback name is answered; anything else is not", () => {
  const preflight = (url: string, origin: string, method = "GET") => editorSiblingPreflightHeaders(new Request(url, {
    method: "OPTIONS", headers: { origin, host: new URL(url).host, "access-control-request-method": method, "access-control-request-headers": "range" },
  }));
  const ok = preflight("http://localhost:3123/api/projects/p/media/sources/a.mp4", "http://127.0.0.1:3123");
  assert.equal(ok?.["Access-Control-Allow-Origin"], "http://127.0.0.1:3123");
  assert.match(ok?.["Access-Control-Allow-Headers"] ?? "", /range/i);
  const traced = editorSiblingPreflightHeaders(new Request("http://localhost:3123/api/projects/p/media/a.mp4", { method: "OPTIONS", headers: { origin: "http://127.0.0.1:3123", host: "localhost:3123", "access-control-request-method": "GET", "access-control-request-headers": "range,sentry-trace,baggage" } }));
  assert.equal(traced?.["Access-Control-Allow-Headers"], "range,sentry-trace,baggage");
  assert.equal(preflight("http://localhost:3123/api/projects/p/media/a.mp4", "http://127.0.0.1:3123", "POST"), null);
  assert.equal(preflight("http://localhost:3123/api/projects/p/timeline", "http://127.0.0.1:3123"), null);
  assert.equal(preflight("http://localhost:3123/api/projects/p/media/a.mp4", "https://example.com"), null);
  assert.equal(preflight("http://localhost:3123/api/projects/p/media/a.mp4", "http://127.0.0.1:9999"), null);
});
