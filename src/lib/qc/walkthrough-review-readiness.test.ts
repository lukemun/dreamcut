import assert from "node:assert/strict";
import test from "node:test";

import { assessWalkthroughReviewReadiness } from "@/lib/qc/walkthrough-review-readiness";

const hash = "a".repeat(64);
const gradeId = `20260726T120000Z-${hash.slice(0, 12)}`;
const vetoes = [
  "Entry and hook",
  "Semantic focus",
  "Product layout",
  "Interaction",
  "Action → result",
  "Camera and pacing",
  "Narration and frame",
  "Authority and closure",
];

function passingGrade(authority = hash): string {
  return [
    "# Walkthrough grade — example",
    "",
    "Overall: PASS",
    "Grader: fresh-agent",
    "Grader context: fresh-read-only",
    `Graded authority: ${authority}`,
    `Grade ID: ${gradeId}`,
    "Normal-speed watch: PASS",
    "Review surface: stable Timeline Editor review mode at http://127.0.0.1:3124/p/example",
    "",
    "| Veto | Verdict | Evidence | Directive repair |",
    "| --- | --- | --- | --- |",
    ...vetoes.map((veto) => `| ${veto} | PASS | current evidence | n/a |`),
  ].join("\n");
}

test("passes only with a current, immutable, cold grade and stable normal-speed watch", () => {
  const grade = passingGrade();
  const report = assessWalkthroughReviewReadiness({
    timelineSha256: hash,
    latestGrade: grade,
    immutableGrades: new Map([[`${gradeId}.md`, grade]]),
  });
  assert.equal(report.ok, true);
});

test("blocks the exact failure mode where deterministic checks exist but no grader ran", () => {
  const report = assessWalkthroughReviewReadiness({
    timelineSha256: hash,
    latestGrade: null,
    immutableGrades: new Map(),
  });
  assert.equal(report.ok, false);
  assert.deepEqual(report.findings.map((finding) => finding.code), ["latest_grade_missing"]);
});

test("blocks a stale grade after any timeline mutation", () => {
  const grade = passingGrade("b".repeat(64));
  const report = assessWalkthroughReviewReadiness({
    timelineSha256: hash,
    latestGrade: grade,
    immutableGrades: new Map([[`${gradeId}.md`, grade]]),
  });
  assert.equal(report.ok, false);
  assert.ok(report.findings.some((finding) => finding.code === "grade_stale"));
});

test("blocks a self-described pass without stable full-speed evidence or immutable lineage", () => {
  const grade = passingGrade()
    .replace("Grader context: fresh-read-only", "Grader context: author")
    .replace("Normal-speed watch: PASS", "Normal-speed watch: REVIEW")
    .replace("Review surface: stable Timeline Editor review mode at http://127.0.0.1:3124/p/example", "Review surface: dev editor at http://127.0.0.1:3123/p/example");
  const report = assessWalkthroughReviewReadiness({
    timelineSha256: hash,
    latestGrade: grade,
    immutableGrades: new Map(),
  });
  assert.equal(report.ok, false);
  assert.ok(report.findings.some((finding) => finding.code === "grader_context_missing"));
  assert.ok(report.findings.some((finding) => finding.code === "normal_speed_watch_missing"));
  assert.ok(report.findings.some((finding) => finding.code === "stable_review_missing"));
  assert.ok(report.findings.some((finding) => finding.code === "immutable_grade_missing"));
});

test("blocks an unresolved correction chain", () => {
  const grade = passingGrade();
  const report = assessWalkthroughReviewReadiness({
    timelineSha256: hash,
    latestGrade: grade,
    immutableGrades: new Map([[`${gradeId}.md`, grade]]),
    correctionsJsonl: JSON.stringify({ finding_id: "camera:pacing", status: "repaired_pending_regrade" }),
  });
  assert.equal(report.ok, false);
  assert.ok(report.findings.some((finding) => finding.code === "correction_chain_open"));
});

test("accepts a correction only after a later regrade closes the same finding", () => {
  const grade = passingGrade();
  const correctionsJsonl = [
    { finding_id: "camera:pacing", status: "open" },
    { finding_id: "camera:pacing", status: "repaired_pending_regrade" },
    { finding_id: "camera:pacing", status: "regrade_pass" },
  ].map((record) => JSON.stringify(record)).join("\n");
  const report = assessWalkthroughReviewReadiness({
    timelineSha256: hash,
    latestGrade: grade,
    immutableGrades: new Map([[`${gradeId}.md`, grade]]),
    correctionsJsonl,
  });
  assert.equal(report.ok, true);
});
