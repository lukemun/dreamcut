import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import * as Sentry from "@sentry/nextjs";

import { defaultServerScope, followServerCloudSentry } from "./cloud-sentry-server";

test("the server's account client reaches later requests through sign-out and sign-in from route handlers", async () => {
  const received: string[] = [];
  const collector = http.createServer((req, res) => {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => { const match = body.match(/"value":"([^"]+)"/); if (match) received.push(match[1]!); res.end("{}"); });
  });
  await new Promise<void>(resolve => collector.listen(0, "127.0.0.1", resolve));
  try {
    const port = (collector.address() as { port: number }).port;
    const sentry = { dsn: `http://public@127.0.0.1:${port}/1`, environment: "test", error_sample_rate: 1, traces_sample_rate: 0, install_id: "00000000-0000-4000-8000-000000000000" };
    // Each route handler runs in its own forked scope, as Next's server does.
    const request = <T>(fn: () => T) => Sentry.withIsolationScope(() => Sentry.withScope(fn));
    const report = async (label: string) => { request(() => Sentry.captureException(new Error(label))); await Sentry.flush(2000); };

    await request(() => followServerCloudSentry({ sentry }));
    assert.ok(defaultServerScope()?.getClient(), "the SDK's default scope moved; update defaultServerScope");
    await report("signed in");
    await request(() => followServerCloudSentry({ sentry: null }));
    await report("signed out");
    await request(() => followServerCloudSentry({ sentry: { ...sentry, environment: "test-again" } }));
    await report("signed in again");
    assert.deepEqual(received, ["signed in", "signed in again"]);
    await followServerCloudSentry({ sentry: null });
  } finally {
    collector.close();
  }
});
