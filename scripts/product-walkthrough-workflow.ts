import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { isTimelineAspectRatioValue } from "@/lib/aspect-ratios";
import { projectDir } from "@/lib/local-store/paths";
import {
  createWalkthroughWorkflowState,
  nextWalkthroughAction,
  transitionWalkthroughWorkflow,
  type WalkthroughTransition,
  type WalkthroughWorkflowState,
} from "@/lib/qc/product-walkthrough-workflow";
import { inspectWalkthroughRoughSpineReadiness } from "@/lib/qc/walkthrough-rough-spine-readiness";
import { inspectWalkthroughReviewReadiness } from "@/lib/qc/walkthrough-review-readiness";
import { inspectWalkthroughSourceReadiness } from "@/lib/qc/walkthrough-source-readiness";
import {
  approvedNarrationLines,
  inspectWalkthroughAssemblyReadiness,
  normalizeNarrationText,
} from "@/lib/qc/walkthrough-assembly-readiness";
import {
  boundaryIntegrityReceiptFindings,
  type WalkthroughBoundaryIntegrityReceipt,
} from "@/lib/qc/walkthrough-boundary-integrity";
import { parseVisualCheckpointIds } from "@/lib/qc/visual-checkpoint-plan";
import { inspectProjectPreviewReadiness } from "./preview-readiness";

const PROJECT_RE = /^[A-Za-z0-9._-]+$/;
const commandName = process.argv[2];
const projectIndex = process.argv.indexOf("--project");
const projectId = projectIndex >= 0 ? process.argv[projectIndex + 1] : "";
if (!["status", "init", "transition"].includes(commandName) || !PROJECT_RE.test(projectId)) {
  throw new Error("Usage: pnpm walkthrough-workflow <status|init|transition> --project <id> [--action <action>] [--payload-base64 <json>]");
}

const root = projectDir(projectId);
if (!fs.existsSync(root)) throw new Error(`Project does not exist: ${projectId}`);
const reviewRoot = path.join(root, "review");
const statePath = path.join(reviewRoot, "product-walkthrough-workflow.json");
const compactOutput = process.argv.includes("--compact");

function printableState(state: WalkthroughWorkflowState) {
  if (!compactOutput) return state;
  return {
    ...state,
    history: state.history.slice(-3),
  };
}

function sha256(body: Buffer | string): string {
  return crypto.createHash("sha256").update(body).digest("hex");
}

function readPayload(): Record<string, unknown> {
  const index = process.argv.indexOf("--payload-base64");
  if (index < 0 || !process.argv[index + 1]) return {};
  return JSON.parse(Buffer.from(process.argv[index + 1], "base64url").toString("utf8"));
}

function readState(): WalkthroughWorkflowState {
  if (!fs.existsSync(statePath)) throw new Error("Workflow is not initialized");
  const raw = JSON.parse(fs.readFileSync(statePath, "utf8")) as WalkthroughWorkflowState;
  const schemaVersion = (raw as unknown as { schema_version?: number }).schema_version;
  if (schemaVersion === 1 || schemaVersion === 2 || schemaVersion === 3) {
    const hasApprovedScriptPlan = Boolean(
      raw.locks.script_plan_path
      && raw.locks.script_plan_sha256
      && raw.locks.script_plan_approved_by,
    );
    return {
      ...raw,
      schema_version: 4,
      product: {
        ...raw.product,
        output_aspect_ratio: raw.product.output_aspect_ratio ?? "9:16",
      },
      locks: {
        ...raw.locks,
        script_plan_path: raw.locks.script_plan_path ?? null,
        script_plan_sha256: raw.locks.script_plan_sha256 ?? null,
        script_plan_approved_by: raw.locks.script_plan_approved_by ?? null,
        rough_spine_timeline_sha256: raw.locks.rough_spine_timeline_sha256 ?? null,
        rough_spine_receipt_sha256: raw.locks.rough_spine_receipt_sha256 ?? null,
        narration_visual_contract_path: raw.locks.narration_visual_contract_path ?? null,
        narration_visual_contract_sha256: raw.locks.narration_visual_contract_sha256 ?? null,
      },
      next_action: hasApprovedScriptPlan
        ? raw.next_action
        : "Write the beat-by-beat shooting script and obtain explicit human approval before production resumes.",
    };
  }
  if (schemaVersion !== 4) throw new Error(`Unsupported walkthrough workflow schema_version: ${schemaVersion}`);
  return { ...raw, next_action: nextWalkthroughAction(raw.state) };
}

function writeState(state: WalkthroughWorkflowState) {
  fs.mkdirSync(reviewRoot, { recursive: true });
  const temporary = `${statePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`);
  fs.renameSync(temporary, statePath);
}

function projectFile(relativePath: unknown): string {
  if (typeof relativePath !== "string" || !relativePath.trim()) throw new Error("A project-relative file path is required");
  const resolved = path.resolve(root, relativePath);
  const prefix = `${path.resolve(root)}${path.sep}`;
  if (!resolved.startsWith(prefix)) throw new Error("Project file path escapes the project root");
  if (!fs.existsSync(resolved)) throw new Error(`Required project file is missing: ${relativePath}`);
  return resolved;
}

function existingManifest(): string {
  const rootManifest = path.join(root, "source-manifest.json");
  const preprocessManifest = path.join(root, "preprocess", "source-manifest.json");
  if (fs.existsSync(rootManifest)) return rootManifest;
  if (fs.existsSync(preprocessManifest)) return preprocessManifest;
  throw new Error("Missing source-manifest.json");
}

function payloadString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required`);
  return value;
}

function validateScriptPlan(plan: string) {
  const requiredSections = [
    "## Tutorial promise",
    "## Beat-by-beat shooting script",
    "## Production boundaries",
  ];
  if (requiredSections.some((section) => !plan.includes(section))) {
    throw new Error("Shooting script is missing a required section");
  }
  const requiredHeader = "| Beat | Viewer learns | Enter on | Action | Stop / hold | What must be visible | Draft spoken point | Capture requirement |";
  if (!plan.includes(requiredHeader)) throw new Error("Shooting script is missing the required beat-table columns");
  const beatRows = plan.split("\n").filter((line) => /^\|\s*\d+\s*\|/.test(line));
  if (beatRows.length === 0) throw new Error("Shooting script must contain at least one numbered beat row");
  parseVisualCheckpointIds(plan);
}

function requireCurrentScriptPlan(state: WalkthroughWorkflowState) {
  if (!state.locks.script_plan_path || !state.locks.script_plan_sha256 || !state.locks.script_plan_approved_by) {
    throw new Error("Production is blocked until a human approves the shooting script");
  }
  const planPath = projectFile(state.locks.script_plan_path);
  const plan = fs.readFileSync(planPath, "utf8");
  validateScriptPlan(plan);
  if (sha256(plan) !== state.locks.script_plan_sha256) {
    throw new Error("The shooting script changed after approval; obtain fresh human approval before production resumes");
  }
}

if (commandName === "status") {
  if (!fs.existsSync(statePath)) {
    console.log(JSON.stringify({ project_id: projectId, state: "uninitialized", next_action: "Initialize and confirm the product contract." }, null, 2));
  } else {
    console.log(JSON.stringify(printableState(readState()), null, 2));
  }
  process.exit(0);
}

const payload = readPayload();
const now = new Date().toISOString();

if (commandName === "init") {
  if (fs.existsSync(statePath)) throw new Error("Workflow is already initialized");
  const routes = payload.routes;
  const state = createWalkthroughWorkflowState({
    projectId,
    productRevision: payloadString(payload, "product_revision"),
    routes: Array.isArray(routes) ? routes.map(String) : [],
    paidActionRequired: payload.paid_action_required === true,
    outputAspectRatio: isTimelineAspectRatioValue(payload.output_aspect_ratio) ? payload.output_aspect_ratio : "9:16",
    at: now,
    confirmed: payload.confirmed === true,
  });
  writeState(state);
  console.log(JSON.stringify(printableState(state), null, 2));
  process.exit(0);
}

const actionIndex = process.argv.indexOf("--action");
const action = actionIndex >= 0 ? process.argv[actionIndex + 1] as WalkthroughTransition["action"] : null;
if (!action) throw new Error("transition requires --action");
const current = readState();
const evidence: string[] = [];
const lockPatch: Partial<WalkthroughWorkflowState["locks"]> = {};

if ([
  "verify_live_flow",
  "mark_source_captured",
  "qualify_source",
  "mark_rough_spine_complete",
  "approve_language",
  "mark_fine_edit_complete",
  "pass_author_preflight",
  "accept_cold_grade",
  "open_human_review",
  "authorize_delivery",
].includes(action)) {
  requireCurrentScriptPlan(current);
}

if (action === "approve_script_plan") {
  if (payload.approval_source !== "human") throw new Error("Shooting-script approval must come from approval_source=human");
  const planRelative = payloadString(payload, "script_plan_path");
  const planPath = projectFile(planRelative);
  const plan = fs.readFileSync(planPath, "utf8");
  validateScriptPlan(plan);
  lockPatch.script_plan_path = planRelative;
  lockPatch.script_plan_sha256 = sha256(plan);
  lockPatch.script_plan_approved_by = payloadString(payload, "approved_by");
  if (current.locks.script_plan_sha256 && current.locks.script_plan_sha256 !== lockPatch.script_plan_sha256) {
    lockPatch.live_flow_receipt = null;
    lockPatch.source_manifest_sha256 = null;
    lockPatch.source_qualification_sha256 = null;
    lockPatch.source_grade_sha256 = null;
    lockPatch.rough_spine_timeline_sha256 = null;
    lockPatch.rough_spine_receipt_sha256 = null;
    lockPatch.narration_path = null;
    lockPatch.narration_sha256 = null;
    lockPatch.narration_approved_by = null;
    lockPatch.timeline_sha256 = null;
    lockPatch.author_preflight_at = null;
    lockPatch.final_grade_id = null;
  }
  evidence.push(planRelative);
}

if (action === "verify_live_flow") {
  const receiptRelative = payloadString(payload, "live_flow_receipt");
  const receiptPath = projectFile(receiptRelative);
  const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8")) as {
    product_revision?: unknown;
    routes?: unknown;
    verdict?: unknown;
  };
  if (receipt.product_revision !== current.product.revision || receipt.verdict !== "PASS") {
    throw new Error("Live-flow receipt does not pass on the frozen product revision");
  }
  const receiptRoutes = Array.isArray(receipt.routes) ? receipt.routes.map(String) : [];
  if (current.product.routes.some((route) => !receiptRoutes.includes(route))) {
    throw new Error("Live-flow receipt does not cover every frozen route");
  }
  lockPatch.live_flow_receipt = receiptRelative;
  evidence.push(receiptRelative);
}

if (action === "mark_source_captured") {
  const manifestPath = existingManifest();
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as { project_id?: unknown; sources?: unknown };
  if (manifest.project_id !== projectId || !Array.isArray(manifest.sources) || manifest.sources.length === 0) {
    throw new Error("Source manifest is empty or belongs to another project");
  }
  lockPatch.source_manifest_sha256 = sha256(fs.readFileSync(manifestPath));
  evidence.push(path.relative(root, manifestPath));
}

if (action === "qualify_source") {
  const report = inspectWalkthroughSourceReadiness(root);
  if (!report.ok) throw new Error(`Source qualification is blocked: ${report.findings.map((finding) => `${finding.code}: ${finding.message}`).join("; ")}`);
  const manifestPath = existingManifest();
  const qualificationPath = projectFile("review/source-qualification.json");
  const gradePath = projectFile("review/source-grade.md");
  lockPatch.source_manifest_sha256 = sha256(fs.readFileSync(manifestPath));
  lockPatch.source_qualification_sha256 = sha256(fs.readFileSync(qualificationPath));
  lockPatch.source_grade_sha256 = sha256(fs.readFileSync(gradePath));
  evidence.push(path.relative(root, manifestPath), "review/source-qualification.json", "review/source-grade.md");
}

if (action === "mark_rough_spine_complete") {
  if (!current.locks.source_manifest_sha256 || !current.locks.source_qualification_sha256) {
    throw new Error("Qualified source locks are missing");
  }
  const report = inspectWalkthroughRoughSpineReadiness(root, {
    productRevision: current.product.revision,
    sourceManifestSha256: current.locks.source_manifest_sha256,
    sourceQualificationSha256: current.locks.source_qualification_sha256,
    outputAspectRatio: current.product.output_aspect_ratio,
  });
  if (!report.ok || !report.timelineSha256 || !report.receiptSha256) {
    throw new Error(`Rough-spine qualification is blocked: ${report.findings.map((finding) => `${finding.code}: ${finding.message}`).join("; ")}`);
  }
  lockPatch.rough_spine_timeline_sha256 = report.timelineSha256;
  lockPatch.rough_spine_receipt_sha256 = report.receiptSha256;
  evidence.push("timeline.json", "review/rough-spine-receipt.json");
}

if (action === "approve_language") {
  const manifestPath = existingManifest();
  const qualificationPath = projectFile("review/source-qualification.json");
  if (
    sha256(fs.readFileSync(manifestPath)) !== current.locks.source_manifest_sha256
    || sha256(fs.readFileSync(qualificationPath)) !== current.locks.source_qualification_sha256
  ) throw new Error("The qualified source changed before language approval; requalify it first");
  if (payload.approval_source !== "human") throw new Error("Narration approval must come from approval_source=human");
  const narrationRelative = payloadString(payload, "narration_path");
  const narrationPath = projectFile(narrationRelative);
  const narrationBody = fs.readFileSync(narrationPath);
  const narrationHash = sha256(narrationBody);
  const contractRelative = payloadString(payload, "narration_visual_contract_path");
  const contractPath = projectFile(contractRelative);
  const contractBody = fs.readFileSync(contractPath);
  const contract = JSON.parse(contractBody.toString("utf8")) as {
    schema_version?: unknown;
    project_id?: unknown;
    narration_sha256?: unknown;
    lines?: Array<{ line_number?: unknown; text?: unknown }>;
  };
  const narrationLines = approvedNarrationLines(narrationBody.toString("utf8"));
  if (
    contract.schema_version !== 1
    || contract.project_id !== projectId
    || contract.narration_sha256 !== narrationHash
    || !Array.isArray(contract.lines)
    || contract.lines.length !== narrationLines.length
    || contract.lines.some((line, index) => (
      line.line_number !== index + 1
      || typeof line.text !== "string"
      || normalizeNarrationText(line.text) !== narrationLines[index]
    ))
  ) {
    throw new Error("Narration-to-screen contract does not exactly bind every approved narration line");
  }
  lockPatch.narration_path = narrationRelative;
  lockPatch.narration_sha256 = narrationHash;
  lockPatch.narration_approved_by = payloadString(payload, "approved_by");
  lockPatch.narration_visual_contract_path = contractRelative;
  lockPatch.narration_visual_contract_sha256 = sha256(contractBody);
  evidence.push(narrationRelative, contractRelative);
}

if (action === "mark_fine_edit_complete" || action === "resume_repair") {
  const timelinePath = projectFile("timeline.json");
  lockPatch.timeline_sha256 = sha256(fs.readFileSync(timelinePath));
  lockPatch.author_preflight_at = null;
  lockPatch.final_grade_id = null;
  evidence.push("timeline.json");
}

if (action === "pass_author_preflight") {
  const checks = payload.checks;
  if (
    !Array.isArray(checks)
    || checks.length === 0
    || checks.some((check) => typeof check !== "object" || check == null || (check as { ok?: unknown }).ok !== true)
  ) {
    throw new Error("Author preflight requires a non-empty all-passing checks array");
  }
  const assembly = inspectWalkthroughAssemblyReadiness(root, {
    timelineSha256: current.locks.timeline_sha256,
    sourceQualificationSha256: current.locks.source_qualification_sha256,
    narrationPath: current.locks.narration_path,
    narrationSha256: current.locks.narration_sha256,
    narrationVisualContractPath: current.locks.narration_visual_contract_path,
    narrationVisualContractSha256: current.locks.narration_visual_contract_sha256,
  });
  if (!assembly.ok) {
    throw new Error(`Author preflight assembly is blocked: ${assembly.findings.map((finding) => `${finding.code}: ${finding.message}`).join("; ")}`);
  }
  const previewReadiness = inspectProjectPreviewReadiness(projectId);
  if (!previewReadiness.ok) {
    throw new Error(`Author preflight preview readiness is blocked: ${previewReadiness.findings.map((finding) => `${finding.code}: ${finding.message}`).join("; ")}`);
  }
  const timelinePath = projectFile("timeline.json");
  const timelineSha256 = sha256(fs.readFileSync(timelinePath));
  if (timelineSha256 !== current.locks.timeline_sha256) throw new Error("Timeline changed after the fine-edit lock");
  const boundaryRelative = "review/walkthrough-boundary-integrity.json";
  const boundaryPath = projectFile(boundaryRelative);
  const boundaryReceipt = JSON.parse(fs.readFileSync(boundaryPath, "utf8")) as WalkthroughBoundaryIntegrityReceipt;
  const boundaryFindings = boundaryIntegrityReceiptFindings(boundaryReceipt, { projectId, timelineSha256 });
  if (Array.isArray(boundaryReceipt.samples)) {
    for (const sample of boundaryReceipt.samples) {
      if (typeof sample.still_path !== "string" || typeof sample.still_sha256 !== "string") continue;
      const stillPath = projectFile(sample.still_path);
      if (sha256(fs.readFileSync(stillPath)) !== sample.still_sha256) {
        boundaryFindings.push(`frame hash does not match: ${sample.still_path}`);
      }
    }
  }
  if (boundaryFindings.length > 0) {
    throw new Error(`Boundary/contact frame inspection is blocked: ${boundaryFindings.join("; ")}`);
  }
  const watchRelative = payloadString(payload, "normal_speed_watch_receipt");
  const watchPath = projectFile(watchRelative);
  const watch = JSON.parse(fs.readFileSync(watchPath, "utf8")) as {
    verdict?: unknown;
    timeline_sha256?: unknown;
    review_surface?: unknown;
  };
  if (
    watch.verdict !== "PASS"
    || watch.timeline_sha256 !== timelineSha256
    || typeof watch.review_surface !== "string"
    || !watch.review_surface.includes("3124")
  ) {
    throw new Error("Normal-speed watch receipt is not a stable PASS on the locked timeline");
  }
  lockPatch.author_preflight_at = now;
  evidence.push(boundaryRelative, watchRelative, ...checks.map((check) => String((check as { name?: unknown }).name ?? "unnamed-check")));
}

if (action === "accept_cold_grade") {
  const report = inspectWalkthroughReviewReadiness(root);
  if (!report.ok) throw new Error(`Final cold grade is blocked: ${report.findings.map((finding) => `${finding.code}: ${finding.message}`).join("; ")}`);
  if (report.timelineSha256 !== current.locks.timeline_sha256) throw new Error("Final grade does not match the locked timeline");
  lockPatch.final_grade_id = report.gradeId;
  evidence.push("review/walkthrough-grade.md", `review/grade-runs/${report.gradeId}.md`);
}

const transition: WalkthroughTransition = {
  action,
  at: now,
  confirmed: payload.confirmed === true,
  evidence,
  note: typeof payload.note === "string" ? payload.note : undefined,
  failureClass: payload.failure_class as WalkthroughTransition["failureClass"],
  failedVetoCount: typeof payload.failed_veto_count === "number" ? payload.failed_veto_count : undefined,
  productRevision: typeof payload.product_revision === "string" ? payload.product_revision : undefined,
  routes: Array.isArray(payload.routes) ? payload.routes.map(String) : undefined,
  paidAuthorizationNote: typeof payload.authorization_note === "string" ? payload.authorization_note : undefined,
  lockPatch,
};

if (action === "authorize_paid_action") {
  transition.paidAuthorizationNote = payloadString(payload, "authorization_note");
}
if (action === "authorize_delivery" && payload.authorization_source !== "human") {
  throw new Error("Delivery authorization must come from authorization_source=human");
}
if (action === "authorize_delivery" && (typeof payload.note !== "string" || !payload.note.trim())) {
  throw new Error("Delivery authorization requires an explicit note describing what is authorized");
}
if (action === "open_human_review" && payload.review_source !== "human") {
  throw new Error("Human review opening requires review_source=human");
}

const next = transitionWalkthroughWorkflow(current, transition);
writeState(next);
console.log(JSON.stringify(printableState(next), null, 2));
