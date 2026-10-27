import { projectDir } from "@/lib/local-store/paths";
import { inspectWalkthroughSourceReadiness } from "@/lib/qc/walkthrough-source-readiness";

const projectId = process.argv[2];
if (!projectId || projectId.startsWith("--")) {
  throw new Error("Usage: pnpm walkthrough-source-readiness <project-id> [--json]");
}

const report = inspectWalkthroughSourceReadiness(projectDir(projectId));
if (process.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else if (report.ok) {
  console.log("Source-qualification gate: PASS");
} else {
  console.error("Source-qualification gate: BLOCKED");
  for (const finding of report.findings) {
    console.error(`- ${finding.code}: ${finding.message}`);
  }
}

process.exitCode = report.ok ? 0 : 1;
