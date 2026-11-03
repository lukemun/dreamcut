import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { inspectWalkthroughSourceReadiness } from "@/lib/qc/walkthrough-source-readiness";
import { inspectWalkthroughAssemblyReadiness } from "@/lib/qc/walkthrough-assembly-readiness";
import type { WalkthroughWorkflowState } from "@/lib/qc/product-walkthrough-workflow";

export type WalkthroughReadinessFinding = {
  code: string;
  message: string;
};

export type WalkthroughReadinessReport = {
  ok: boolean;
  timelineSha256: string;
  gradeId: string | null;
  findings: WalkthroughReadinessFinding[];
};

const REQUIRED_VETOES = [
  "Entry and hook",
  "Semantic focus",
  "Product layout",
  "Interaction",
  "Action → result",
  "Camera and pacing",
  "Narration and frame",
  "Authority and closure",
] as const;

function field(body: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return body.match(new RegExp(`^${escaped}:\\s*(.+?)\\s*$`, "mi"))?.[1] ?? null;
}

function normalized(body: string): string {
  return body.replace(/\r\n/g, "\n").trim();
}

function tableVerdict(body: string, veto: string): string | null {
  const row = body
    .split(/\r?\n/)
    .find((line) => line.startsWith("|") && line.split("|")[1]?.trim() === veto);
  return row?.split("|")[2]?.trim().toUpperCase() ?? null;
}

export function assessWalkthroughReviewReadiness(input: {
  timelineSha256: string;
  latestGrade: string | null;
  immutableGrades: Map<string, string>;
  correctionsJsonl?: string | null;
}): WalkthroughReadinessReport {
  const findings: WalkthroughReadinessFinding[] = [];
  const grade = input.latestGrade;

  if (!grade) {
    findings.push({
      code: "latest_grade_missing",
      message: "Missing review/walkthrough-grade.md from a fresh independent grader.",
    });
    return { ok: false, timelineSha256: input.timelineSha256, gradeId: null, findings };
  }

  const overall = field(grade, "Overall")?.toUpperCase() ?? null;
  const authority = field(grade, "Graded authority")?.toLowerCase() ?? null;
  const gradeId = field(grade, "Grade ID");
  const watch = field(grade, "Normal-speed watch")?.toUpperCase() ?? null;
  const surface = field(grade, "Review surface") ?? "";
  const context = field(grade, "Grader context")?.toLowerCase() ?? "";

  if (overall !== "PASS") {
    findings.push({ code: "grade_not_pass", message: `Latest independent grade is ${overall ?? "missing"}, not PASS.` });
  }
  if (authority !== input.timelineSha256) {
    findings.push({
      code: "grade_stale",
      message: `Graded authority does not match the active timeline SHA-256 ${input.timelineSha256}.`,
    });
  }
  if (watch !== "PASS") {
    findings.push({
      code: "normal_speed_watch_missing",
      message: "The grader did not record a complete normal-speed watch as PASS.",
    });
  }
  if (!/\bstable\b/i.test(surface) || !/(3124|TIMELINE_EDITOR_MODE=review)/i.test(surface)) {
    findings.push({
      code: "stable_review_missing",
      message: "The grade must name stable review mode on port 3124 as its playback surface.",
    });
  }
  if (context !== "fresh-read-only") {
    findings.push({
      code: "grader_context_missing",
      message: "The receipt must declare Grader context: fresh-read-only.",
    });
  }

  for (const veto of REQUIRED_VETOES) {
    if (tableVerdict(grade, veto) !== "PASS") {
      findings.push({
        code: "veto_not_pass",
        message: `Required grader veto "${veto}" is missing or is not PASS.`,
      });
    }
  }

  if (!gradeId) {
    findings.push({ code: "grade_id_missing", message: "The latest grade has no Grade ID." });
  } else {
    const immutable = input.immutableGrades.get(`${gradeId}.md`);
    if (!immutable) {
      findings.push({
        code: "immutable_grade_missing",
        message: `Missing immutable grader receipt review/grade-runs/${gradeId}.md.`,
      });
    } else if (normalized(immutable) !== normalized(grade)) {
      findings.push({
        code: "immutable_grade_mismatch",
        message: "The latest grade does not exactly match its immutable grader receipt.",
      });
    }
  }

  const correctionStatuses = new Map<string, string>();
  if (input.correctionsJsonl?.trim()) {
    for (const [index, line] of input.correctionsJsonl.split(/\r?\n/).entries()) {
      if (!line.trim()) continue;
      try {
        const record = JSON.parse(line) as { finding_id?: unknown; status?: unknown };
        if (typeof record.finding_id !== "string" || typeof record.status !== "string") {
          throw new Error("finding_id and status must be strings");
        }
        correctionStatuses.set(record.finding_id, record.status);
      } catch (error) {
        findings.push({
          code: "corrections_invalid",
          message: `Invalid corrections.jsonl record on line ${index + 1}: ${error instanceof Error ? error.message : String(error)}.`,
        });
      }
    }
  }
  for (const [findingId, status] of correctionStatuses) {
    if (status !== "regrade_pass") {
      findings.push({
        code: "correction_chain_open",
        message: `Correction "${findingId}" ends at status "${status}", not "regrade_pass".`,
      });
    }
  }
  const priorFailureExists = [...input.immutableGrades.values()]
    .some((body) => field(body, "Overall")?.toUpperCase() !== "PASS");
  if (priorFailureExists && correctionStatuses.size === 0) {
    findings.push({
      code: "correction_chain_missing",
      message: "Prior non-PASS grades exist, but review/corrections.jsonl has no closed finding lineage.",
    });
  }

  return {
    ok: findings.length === 0,
    timelineSha256: input.timelineSha256,
    gradeId: gradeId ?? null,
    findings,
  };
}

export function inspectWalkthroughReviewReadiness(projectRoot: string): WalkthroughReadinessReport {
  const timelinePath = path.join(projectRoot, "timeline.json");
  const reviewRoot = path.join(projectRoot, "review");
  const latestPath = path.join(reviewRoot, "walkthrough-grade.md");
  const gradeRunsRoot = path.join(reviewRoot, "grade-runs");
  const correctionsPath = path.join(reviewRoot, "corrections.jsonl");
  const timelineSha256 = crypto.createHash("sha256").update(fs.readFileSync(timelinePath)).digest("hex");
  const latestGrade = fs.existsSync(latestPath) ? fs.readFileSync(latestPath, "utf8") : null;
  const immutableGrades = new Map<string, string>();

  if (fs.existsSync(gradeRunsRoot)) {
    for (const name of fs.readdirSync(gradeRunsRoot)) {
      if (name.endsWith(".md")) {
        immutableGrades.set(name, fs.readFileSync(path.join(gradeRunsRoot, name), "utf8"));
      }
    }
  }

  const correctionsJsonl = fs.existsSync(correctionsPath) ? fs.readFileSync(correctionsPath, "utf8") : null;
  const report = assessWalkthroughReviewReadiness({ timelineSha256, latestGrade, immutableGrades, correctionsJsonl });
  const sourceReport = inspectWalkthroughSourceReadiness(projectRoot);
  if (!sourceReport.ok) {
    report.findings.push(...sourceReport.findings.map((finding) => ({
      code: finding.code.startsWith("source_") ? finding.code : `source_${finding.code}`,
      message: finding.message,
    })));
    report.ok = false;
  }
  const workflowPath = path.join(projectRoot, "review", "product-walkthrough-workflow.json");
  if (!fs.existsSync(workflowPath)) {
    report.findings.push({
      code: "workflow_state_missing",
      message: "The durable product-walkthrough workflow state is missing; guarded human review cannot be opened.",
    });
    report.ok = false;
  } else {
    const workflow = JSON.parse(fs.readFileSync(workflowPath, "utf8")) as WalkthroughWorkflowState;
    const assemblyReport = inspectWalkthroughAssemblyReadiness(projectRoot, {
      timelineSha256: workflow.locks.timeline_sha256,
      sourceQualificationSha256: workflow.locks.source_qualification_sha256,
      narrationPath: workflow.locks.narration_path,
      narrationSha256: workflow.locks.narration_sha256,
      narrationVisualContractPath: workflow.locks.narration_visual_contract_path,
      narrationVisualContractSha256: workflow.locks.narration_visual_contract_sha256,
    });
    if (!assemblyReport.ok) {
      report.findings.push(...assemblyReport.findings);
      report.ok = false;
    }
  }
  return report;
}
