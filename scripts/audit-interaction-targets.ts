import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

import { auditInteractionTargets } from "@/lib/tutorial-motion/interaction-target-gate";

const projectId = process.argv[2];
if (!projectId) throw new Error("Usage: pnpm interaction-targets <project-id>");

const projectDir = path.resolve("projects", projectId);
const timelinePath = path.join(projectDir, "timeline.json");
const reportPath = path.join(projectDir, "instruments", "interaction-targets.json");
const timeline = JSON.parse(fs.readFileSync(timelinePath, "utf8")) as { elements?: unknown[] };
const timelineSha256 = createHash("sha256").update(fs.readFileSync(timelinePath)).digest("hex");
const findings = auditInteractionTargets(
  (timeline.elements ?? []) as Parameters<typeof auditInteractionTargets>[0],
  { width: 720, height: 1280 },
);
const failed = findings.filter((finding) => finding.status === "fail");

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify({
  schema_version: 1,
  project_id: projectId,
  timeline_sha256: timelineSha256,
  composition: { width: 720, height: 1280 },
  checked_at: new Date().toISOString(),
  ok: failed.length === 0,
  findings,
}, null, 2)}\n`);

for (const finding of findings) {
  console.log(
    `${finding.status.toUpperCase()} ${finding.label ?? finding.cursor_element_id}: ${finding.message}`,
  );
}
console.log(reportPath);
if (failed.length > 0) process.exitCode = 1;
