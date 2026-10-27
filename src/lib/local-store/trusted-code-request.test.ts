import assert from "node:assert/strict";
import test from "node:test";
import { isTrustedLocalCodeRequest } from "../local-request";
import { POST as prepareSound } from "@/app/api/projects/[projectId]/sounds/prepare/route";
import { POST as prepareMotion } from "@/app/api/projects/[projectId]/hyperframes/prepare/route";

const baseHeaders = { host: "127.0.0.1:3123", "content-type": "application/json" };
const request = (headers: Record<string, string> = baseHeaders) => new Request("http://127.0.0.1:3123/api/code", {
  method: "POST", headers, body: "{}",
});

const rejectedHeaders: Record<string, string>[] = [
  {},
  { "content-type": "application/json" },
  { ...baseHeaders, host: "attacker.example:3123" },
  { ...baseHeaders, host: "attacker.example@127.0.0.1:3123" },
  { ...baseHeaders, host: "127.0.0.1:3123/path" },
  { ...baseHeaders, host: "127.0.0.1:3123", "x-forwarded-host": "localhost:3123", origin: "http://localhost:3123" },
  { ...baseHeaders, origin: "https://attacker.example" },
  { ...baseHeaders, origin: "null" },
  { ...baseHeaders, origin: "http://127.0.0.1:9999" },
  { ...baseHeaders, origin: "http://127.0.0.1:3123", "sec-fetch-site": "cross-site", "x-dreamcut-client": "mcp" },
  { ...baseHeaders, origin: "http://127.0.0.1:3123", "sec-fetch-site": "same-site" },
  { ...baseHeaders, "sec-fetch-site": "same-origin" },
  { ...baseHeaders, "sec-fetch-site": "same-origin", "sec-fetch-mode": "cors" },
  { ...baseHeaders, "sec-fetch-site": "none" },
  { ...baseHeaders, "content-type": "text/plain" },
  { ...baseHeaders, "content-type": "multipart/form-data; boundary=x" },
  { ...baseHeaders, "content-type": "application/x-www-form-urlencoded" },
];

test("trusted code permits local JSON CLI/MCP and matching browser origins", () => {
  for (const host of ["127.0.0.1:3123", "localhost:43191", "[::1]:3123"]) {
    for (const client of [
      {},
      { "x-dreamcut-client": "mcp" },
      // Node's fetch, which the MCP server uses, adds Sec-Fetch-Mode to every request but no Sec-Fetch-Site
      { "x-dreamcut-client": "mcp", "sec-fetch-mode": "cors" },
      { origin: `http://${host}` },
      { origin: `http://${host}`, "sec-fetch-site": "same-origin", "sec-fetch-mode": "cors" },
    ]) {
      assert.equal(isTrustedLocalCodeRequest(request({ ...baseHeaders, host, ...client } as Record<string, string>)), true);
    }
  }
  assert.equal(isTrustedLocalCodeRequest(request({ ...baseHeaders, "content-type": "application/json; charset=utf-8" })), true);
});

test("trusted code rejects cross-origin, rebound hosts and ambiguous browser requests", () => {
  for (const headers of rejectedHeaders) {
    assert.equal(isTrustedLocalCodeRequest(request(headers)), false, JSON.stringify(headers));
  }
});

test("code routes deny requests before project lookup, body parsing or worker launch", async () => {
  for (const handler of [prepareSound, prepareMotion]) {
    for (const headers of rejectedHeaders) {
      const input = request(headers);
      input.json = async () => { throw new Error("Request body must not be read"); };
      // Every route's project lookup and execution follows awaiting params. A
      // throwing thenable proves denied requests cannot reach that work.
      const params = { then() { throw new Error("Project params must not be read"); } } as unknown as Promise<{ projectId: string }>;
      const response = await handler(input, { params });
      assert.equal(response.status, 403, JSON.stringify(headers));
    }
  }
});

test("code routes preserve browser and CLI access to normal project validation", async () => {
  // Invalid project IDs fail before filesystem access; no fixture or user project
  // is created and no code worker is launched.
  for (const handler of [prepareSound, prepareMotion]) {
    for (const headers of [baseHeaders, { ...baseHeaders, origin: "http://127.0.0.1:3123", "sec-fetch-site": "same-origin" }]) {
      const response = await handler(request(headers), { params: Promise.resolve({ projectId: "../invalid" }) });
      assert.equal(response.status, 404);
    }
  }
});
