import fs from "node:fs";
import path from "node:path";

import { projectDir } from "@/lib/local-store/paths";
import type { WalkthroughWorkflowState } from "@/lib/qc/product-walkthrough-workflow";
import { inspectWalkthroughAssemblyReadiness } from "@/lib/qc/walkthrough-assembly-readiness";

const projectId = process.argv[2];
if (!projectId || projectId.startsWith("--")) {
  throw new Error("Usage: pnpm walkthrough-assembly-readiness <project-id> [--json]");
}

const root = projectDir(projectId);
const statePath = path.join(root, "review", "product-walkthrough-workflow.json");
if (!fs.existsSync(statePath)) throw new Error("Workflow is not initialized");
const state = JSON.parse(fs.readFileSync(statePath, "utf8")) as WalkthroughWorkflowState;
const report = inspectWalkthroughAssemblyReadiness(root, {
  timelineSha256: state.locks.timeline_sha256,
  sourceQualificationSha256: state.locks.source_qualification_sha256,
  narrationPath: state.locks.narration_path,
  narrationSha256: state.locks.narration_sha256,
  narrationVisualContractPath: state.locks.narration_visual_contract_path,
  narrationVisualContractSha256: state.locks.narration_visual_contract_sha256,
});

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else if (report.ok) {
  console.log("Assembly gate: PASS");
} else {
  console.error("Assembly gate: BLOCKED");
  for (const finding of report.findings) console.error(`- ${finding.code}: ${finding.message}`);
}

process.exitCode = report.ok ? 0 : 1;
