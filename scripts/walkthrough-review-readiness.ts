import { projectDir } from "@/lib/local-store/paths";
import { inspectWalkthroughReviewReadiness } from "@/lib/qc/walkthrough-review-readiness";

const projectId = process.argv[2];
if (!projectId || projectId.startsWith("--")) {
  throw new Error("Usage: pnpm walkthrough-review-readiness <project-id> [--json]");
}

const report = inspectWalkthroughReviewReadiness(projectDir(projectId));
if (process.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else if (report.ok) {
  console.log(`Human-review gate: PASS (${report.timelineSha256})`);
  console.log(`Independent grade: ${report.gradeId}`);
} else {
  console.error(`Human-review gate: BLOCKED (${report.timelineSha256})`);
  for (const finding of report.findings) {
    console.error(`- ${finding.code}: ${finding.message}`);
  }
}

process.exitCode = report.ok ? 0 : 1;
