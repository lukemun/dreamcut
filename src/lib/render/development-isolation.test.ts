import assert from "node:assert/strict";
import test from "node:test";
import type { Page } from "playwright-core";
import { isolateDevelopmentUpdates } from "./browser-renderer";

test("render isolation suppresses updates without triggering socket reconnects", async () => {
  let route: (socket: any) => void = () => {};
  const freeze = await isolateDevelopmentUpdates({
    routeWebSocket: async (_pattern: RegExp, handler: typeof route) => { route = handler; },
  } as unknown as Page);
  const connect = () => {
    let receive: (message: string) => void = () => {};
    const sent: string[] = [];
    let closes = 0;
    route({ connectToServer: () => ({ onMessage: (handler: typeof receive) => { receive = handler; }, close: () => { closes++; } }),
      send: (message: string) => sent.push(message), close: () => { closes++; } });
    return { receive: (message: string) => receive(message), sent, closed: () => closes };
  };
  const initial = connect();
  initial.receive("initial compile");
  assert.deepEqual(initial.sent, ["initial compile"]);
  freeze();
  initial.receive("reload");
  assert.deepEqual(initial.sent, ["initial compile"]);
  assert.equal(initial.closed(), 0);
  const later = connect();
  later.receive("reload");
  assert.deepEqual(later.sent, []);
  assert.equal(later.closed(), 0);
});
