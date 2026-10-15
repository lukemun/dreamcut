import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

// Mechanical enforcement of the AGENTS.md "No new one-off mutation scripts" rule
// (adopted 2026-07-22; enforcement start 2026-07-28). A dated scripts/*.ts whose
// job is to mutate a timeline adds no safety over the HTTP API / proposals surface
// — every API mutation already snapshots history/ — and 300+ of them accumulated
// twice before. Scripts dated on or before the enforcement start are grandfathered
// until they are swept; anything newer must route edits through the API
// (POST /elements/batch, the proposals surface) or be reusable flag-driven tooling.
const ENFORCEMENT_START = "2026-07-28";

const scriptsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../scripts");

test(`no dated timeline-mutation scripts newer than ${ENFORCEMENT_START}`, () => {
  const offenders: string[] = [];
  for (const entry of fs.readdirSync(scriptsDir)) {
    if (!entry.endsWith(".ts")) continue;
    const dateMatch = entry.match(/20\d{2}-\d{2}-\d{2}/);
    if (!dateMatch) continue;
    if (dateMatch[0] <= ENFORCEMENT_START) continue;
    const source = fs.readFileSync(path.join(scriptsDir, entry), "utf8");
    if (/\bwriteTimeline\b|\bwriteMetadata\b/.test(source)) {
      offenders.push(entry);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `Dated one-off mutation scripts are banned (AGENTS.md "No new one-off mutation scripts").\n`
    + `Route the edit through the HTTP API (POST /elements/batch) or the proposals surface instead.\n`
    + `Offending scripts:\n  ${offenders.join("\n  ")}`,
  );
});
