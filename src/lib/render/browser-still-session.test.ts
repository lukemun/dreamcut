import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright-core";
import { createBrowserStillSession, renderBrowserStill, type BrowserStillOptions } from "./browser-renderer";

const options: BrowserStillOptions = { baseUrl: "http://localhost:3123", output: "frame.png", width: 160, height: 160,
  durationInFrames: 60, frame: 0, inputProps: { elements: [] } };

function harness(t: import("node:test").TestContext) {
  const cookies: unknown[] = [];
  const captures: Array<{ config: unknown; frame: unknown; screenshot: unknown }> = [];
  const pages: any[] = [];
  let closes = 0;
  let fail = false;
  const browser = {
    version() { return "test-browser-1"; },
    async close() { closes++; },
    async newPage() {
      let config: unknown, frame: unknown;
      const page = {
        context() { return { async addCookies(value: unknown) { cookies.push(value); } }; },
        closed: false, error: (_error: Error) => {}, response: (_response: any) => {},
        on(event: string, callback: any) { if (event === "pageerror") this.error = callback; if (event === "response") this.response = callback; },
        async close() { this.closed = true; },
        async routeWebSocket() {}, async goto() {}, async waitForFunction() {}, async addStyleTag() {},
        async evaluate(_callback: unknown, value: unknown) {
          if (fail) throw new Error("media failed to settle");
          if (typeof value === "number") frame = value;
          else config = structuredClone(value);
        },
        locator() { return { async screenshot(screenshot: unknown) { captures.push({ config, frame, screenshot }); } }; },
      };
      pages.push(page);
      return page;
    },
  };
  const launch = t.mock.method(chromium, "launch", async () => browser as any);
  return { cookies, captures, pages, launch, get closes() { return closes; }, fail() { fail = true; } };
}

test("batch seeks reuse one browser and isolate caption-removal variants", async t => {
  const h = harness(t), session = await createBrowserStillSession();
  const original = { ...options, inputProps: { elements: [{ id: "caption" }] } };
  for (const frame of [0, 30, 12, 30]) {
    await session.render({ ...original, frame });
    await session.render({ ...options, frame });
  }
  assert.equal(h.launch.mock.callCount(), 1);
  assert.equal(h.pages.length, 2);
  assert.deepEqual(h.captures.map(c => c.frame), [0, 0, 30, 30, 12, 12, 30, 30]);
  assert.deepEqual(h.captures[6].config, h.captures[0].config);
  assert.notDeepEqual(h.captures[6].config, h.captures[7].config);
  assert.deepEqual(session.stats, { browserLaunches: 1, pageLoads: 2, captures: 8, pageReuses: 6 });
  await session.close(); await session.close();
  assert.equal(h.closes, 1);
  await assert.rejects(session.render(options), /closed/);
});

test("renderer fingerprints include actual font/code bytes and fail closed on missing response bodies", async t => {
  const h = harness(t), session = await createBrowserStillSession();
  await session.render(options);
  assert.equal(await session.fingerprint(options), null);
  const response = (bytes: string, broken = false) => ({ request: () => ({ resourceType: () => "font" }),
    url: () => "https://fonts.example/test.woff2", ok: () => true,
    body: async () => { if (broken) throw new Error("body unavailable"); return Buffer.from(bytes); } });
  h.pages[0].response(response("old font bytes"));
  const old = await session.fingerprint(options);
  assert.ok(old);
  h.pages[0].response(response("new font bytes"));
  assert.notEqual(await session.fingerprint(options), old);
  h.pages[0].response(response("", true));
  assert.equal(await session.fingerprint(options), null);
  await session.close();
});

test("changed props, canvas, transparency and server cannot reuse stale pages; pages stay bounded", async t => {
  const h = harness(t), session = await createBrowserStillSession();
  const mutable = { ...options, inputProps: { text: "before" } };
  await session.render(mutable);
  mutable.inputProps.text = "after";
  await session.render(mutable);
  await session.render({ ...mutable, width: 320, transparent: true });
  await session.render({ ...mutable, baseUrl: "http://localhost:4000" });
  assert.equal(h.pages.length, 4);
  assert.equal(h.pages.filter(p => !p.closed).length, 2);
  assert.notDeepEqual(h.captures[0].config, h.captures[1].config);
  await session.close();
});

test("readiness failure closes and poisons a session instead of saving a stale frame", async t => {
  const h = harness(t), session = await createBrowserStillSession();
  await session.render(options);
  h.fail();
  await assert.rejects(session.render({ ...options, frame: 30 }), /media failed/);
  assert.equal(h.captures.length, 1);
  assert.equal(h.closes, 1);
  await assert.rejects(session.render(options), /closed/);
  await session.close();
  assert.equal(h.closes, 1);
});

test("page errors fail closed and concurrent captures cannot race the frame clock", async t => {
  const h = harness(t), session = await createBrowserStillSession();
  const first = session.render(options);
  await assert.rejects(session.render({ ...options, frame: 30 }), /serial/);
  await first;
  h.pages[0].error(new Error("draw failed"));
  await assert.rejects(session.render(options), /draw failed/);
  assert.equal(h.captures.length, 1);
  assert.equal(h.closes, 1);
});

test("fresh still callers keep independent sessions and capture encoding options", async t => {
  const h = harness(t);
  await renderBrowserStill({ ...options, imageFormat: "jpeg", jpegQuality: 82 });
  await renderBrowserStill({ ...options, transparent: true });
  assert.equal(h.launch.mock.callCount(), 2);
  assert.equal(h.closes, 2);
  assert.deepEqual(h.captures[0].screenshot, { path: "frame.png", type: "jpeg", omitBackground: undefined, quality: 82 });
  assert.deepEqual(h.captures[1].screenshot, { path: "frame.png", type: "png", omitBackground: true });
});

 test("desktop still authentication stays scoped to the local browser context", async t => {
  const h = harness(t);
  await renderBrowserStill({...options,sessionCookie:{name:"dreamcut_desktop_session",value:"test-only"}});
  assert.deepEqual(h.cookies,[[{name:"dreamcut_desktop_session",value:"test-only",url:options.baseUrl,httpOnly:true,sameSite:"Strict"}]]);
  assert.equal(JSON.stringify(h.captures[0].config).includes("test-only"),false);
 });
