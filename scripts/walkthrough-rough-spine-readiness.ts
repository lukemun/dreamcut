import fs from "node:fs";
import path from "node:path";

import { projectDir } from "@/lib/local-store/paths";
import { inspectWalkthroughRoughSpineReadiness } from "@/lib/qc/walkthrough-rough-spine-readiness";
import type { WalkthroughWorkflowState } from "@/lib/qc/product-walkthrough-workflow";

const projectId = process.argv[2];
if (!projectId || projectId.startsWith("--")) {
  throw new Error("Usage: pnpm walkthrough-rough-spine-readiness <project-id> [--json]");
}

const root = projectDir(projectId);
const statePath = path.join(root, "review", "product-walkthrough-workflow.json");
if (!fs.existsSync(statePath)) throw new Error("Workflow is not initialized");
const state = JSON.parse(fs.readFileSync(statePath, "utf8")) as WalkthroughWorkflowState;
if (!state.locks.source_manifest_sha256 || !state.locks.source_qualification_sha256) {
  throw new Error("Source authority locks are missing; qualify the source before building the rough spine");
}

const report = inspectWalkthroughRoughSpineReadiness(root, {
  productRevision: state.product.revision,
  sourceManifestSha256: state.locks.source_manifest_sha256,
  sourceQualificationSha256: state.locks.source_qualification_sha256,
  outputAspectRatio: state.product.output_aspect_ratio ?? "9:16",
});

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else if (report.ok) {
  console.log("Rough-spine gate: PASS");
} else {
  console.error("Rough-spine gate: BLOCKED");
  for (const finding of report.findings) console.error(`- ${finding.code}: ${finding.message}`);
}

process.exitCode = report.ok ? 0 : 1;
