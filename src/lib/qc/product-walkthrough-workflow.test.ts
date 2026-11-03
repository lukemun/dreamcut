import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  createWalkthroughWorkflowState,
  transitionWalkthroughWorkflow,
} from "@/lib/qc/product-walkthrough-workflow";

const at = "2026-07-26T20:00:00.000Z";

test("author preflight invokes project preview readiness instead of trusting supplied check labels", () => {
  const workflowSource = fs.readFileSync(path.join(process.cwd(), "scripts/product-walkthrough-workflow.ts"), "utf8");
  const preflightBlock = workflowSource.slice(
    workflowSource.indexOf('if (action === "pass_author_preflight")'),
    workflowSource.indexOf('if (action === "accept_cold_grade")'),
  );
  assert.match(preflightBlock, /inspectProjectPreviewReadiness\(projectId\)/);
  assert.match(preflightBlock, /if \(!previewReadiness\.ok\)/);
});

function initial(paidActionRequired = false) {
  return createWalkthroughWorkflowState({
    projectId: "example",
    productRevision: "abc123",
    routes: ["/", "/dashboard"],
    paidActionRequired,
    confirmed: true,
    at,
  });
}

function step(state: ReturnType<typeof initial>, action: Parameters<typeof transitionWalkthroughWorkflow>[1]["action"]) {
  return transitionWalkthroughWorkflow(state, {
    action,
    at,
    confirmed: true,
    lockPatch: action === "approve_script_plan" ? {
      script_plan_path: "review/script-plan.md",
      script_plan_sha256: "plan-hash",
      script_plan_approved_by: "Project owner",
    } : action === "approve_language" ? {
      narration_path: "review/narration.md",
      narration_sha256: "narration-hash",
      narration_approved_by: "Project owner",
      narration_visual_contract_path: "review/narration-visual-contract.json",
      narration_visual_contract_sha256: "sync-hash",
    } : undefined,
  });
}

test("follows the happy-path phase order", () => {
  let state = initial();
  for (const action of [
    "approve_script_plan",
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
  ] as const) {
    state = step(state, action);
  }
  assert.equal(state.state, "delivery_authorized");
  assert.equal(state.attempts.final_grades, 1);
});

test("defaults new walkthroughs to vertical output unless the brief overrides it", () => {
  assert.equal(initial().product.output_aspect_ratio, "9:16");
  const state = createWalkthroughWorkflowState({
    projectId: "wide-example",
    productRevision: "abc123",
    routes: ["/"],
    paidActionRequired: false,
    outputAspectRatio: "16:9",
    confirmed: true,
    at,
  });
  assert.equal(state.product.output_aspect_ratio, "16:9");
});

test("blocks live-flow verification until the shooting script is approved", () => {
  assert.throws(() => step(initial(), "verify_live_flow"), /expected script_plan_approved/);
});

test("blocks script-plan approval without human approval locks", () => {
  assert.throws(() => transitionWalkthroughWorkflow(initial(), {
    action: "approve_script_plan",
    at,
    confirmed: true,
  }), /path, hash, and human approver/);
});

test("a revised approved shooting script returns production to pre-capture verification", () => {
  let state = step(initial(), "approve_script_plan");
  state = step(state, "verify_live_flow");
  state = transitionWalkthroughWorkflow(state, {
    action: "approve_script_plan",
    at,
    confirmed: true,
    lockPatch: {
      script_plan_path: "review/script-plan.md",
      script_plan_sha256: "revised-plan-hash",
      script_plan_approved_by: "Project owner",
    },
  });
  assert.equal(state.state, "script_plan_approved");
  assert.match(state.next_action, /Verify the complete live flow/);
});

test("a post-language script revision invalidates every downstream authority", () => {
  let state = step(initial(), "approve_script_plan");
  state = step(state, "verify_live_flow");
  state = step(state, "mark_source_captured");
  state = step(state, "qualify_source");
  state = step(state, "mark_rough_spine_complete");
  state = transitionWalkthroughWorkflow(state, {
    action: "approve_language",
    at,
    confirmed: true,
    lockPatch: {
      live_flow_receipt: "live-flow-receipt.json",
      source_manifest_sha256: "source-hash",
      source_qualification_sha256: "qualification-hash",
      source_grade_sha256: "grade-hash",
      narration_path: "review/narration.md",
      narration_sha256: "narration-hash",
      narration_approved_by: "Project owner",
      narration_visual_contract_path: "review/narration-visual-contract.json",
      narration_visual_contract_sha256: "sync-hash",
      timeline_sha256: "timeline-hash",
      author_preflight_at: at,
      final_grade_id: "grade-1",
    },
  });

  state = transitionWalkthroughWorkflow(state, {
    action: "approve_script_plan",
    at,
    confirmed: true,
    lockPatch: {
      script_plan_path: "review/script-plan.md",
      script_plan_sha256: "revised-after-language-hash",
      script_plan_approved_by: "Project owner",
    },
  });

  assert.equal(state.state, "script_plan_approved");
  assert.equal(state.locks.live_flow_receipt, null);
  assert.equal(state.locks.source_manifest_sha256, null);
  assert.equal(state.locks.source_qualification_sha256, null);
  assert.equal(state.locks.source_grade_sha256, null);
  assert.equal(state.locks.narration_sha256, null);
  assert.equal(state.locks.narration_visual_contract_sha256, null);
  assert.equal(state.locks.timeline_sha256, null);
  assert.equal(state.locks.author_preflight_at, null);
  assert.equal(state.locks.final_grade_id, null);
});

test("blocks a paid source capture without explicit authorization", () => {
  let scripted = transitionWalkthroughWorkflow(initial(true), {
    action: "approve_script_plan",
    at,
    confirmed: true,
    lockPatch: {
      script_plan_path: "review/script-plan.md",
      script_plan_sha256: "plan-hash",
      script_plan_approved_by: "Project owner",
    },
  });
  const live = step(scripted, "verify_live_flow");
  assert.throws(() => step(live, "mark_source_captured"), /no explicit authorization/);
});

test("requires the silent visual spine before language approval", () => {
  let state = initial();
  state = transitionWalkthroughWorkflow(state, {
    action: "approve_script_plan",
    at,
    confirmed: true,
    lockPatch: {
      script_plan_path: "review/script-plan.md",
      script_plan_sha256: "plan-hash",
      script_plan_approved_by: "Project owner",
    },
  });
  state = step(state, "verify_live_flow");
  state = step(state, "mark_source_captured");
  state = step(state, "qualify_source");
  assert.equal(state.next_action, "Build and qualify the complete silent source-backed visual spine before writing narration.");
  assert.throws(() => step(state, "approve_language"), /expected rough_spine_complete/);
  state = step(state, "mark_rough_spine_complete");
  assert.equal(state.state, "rough_spine_complete");
  assert.match(state.next_action, /record the creator's continuous performance/);
});

test("blocks language approval without a locked narration-to-screen contract", () => {
  let state = initial();
  state = step(state, "approve_script_plan");
  state = step(state, "verify_live_flow");
  state = step(state, "mark_source_captured");
  state = step(state, "qualify_source");
  state = step(state, "mark_rough_spine_complete");
  assert.throws(() => transitionWalkthroughWorkflow(state, {
    action: "approve_language",
    at,
    confirmed: true,
    lockPatch: {
      narration_path: "review/narration.md",
      narration_sha256: "narration-hash",
      narration_approved_by: "Project owner",
    },
  }), /narration-to-screen contract locks/);
});

test("allows one narrow integration repair", () => {
  let state = initial();
  for (const action of [
    "approve_script_plan",
    "verify_live_flow",
    "mark_source_captured",
    "qualify_source",
    "mark_rough_spine_complete",
    "approve_language",
    "mark_fine_edit_complete",
    "pass_author_preflight",
  ] as const) state = step(state, action);
  state = transitionWalkthroughWorkflow(state, {
    action: "record_failure",
    at,
    confirmed: true,
    failureClass: "integration",
    failedVetoCount: 2,
    note: "Two narrow final integration findings.",
  });
  assert.equal(state.state, "repair_allowed");
  assert.equal(state.attempts.integration_repairs, 1);
});

test("routes broad or source failures to recapture", () => {
  let state = initial();
  state = transitionWalkthroughWorkflow(state, {
    action: "approve_script_plan",
    at,
    confirmed: true,
    lockPatch: {
      script_plan_path: "review/script-plan.md",
      script_plan_sha256: "plan-hash",
      script_plan_approved_by: "Project owner",
    },
  });
  state = step(state, "verify_live_flow");
  state = step(state, "mark_source_captured");
  state = transitionWalkthroughWorkflow(state, {
    action: "record_failure",
    at,
    confirmed: true,
    failureClass: "source",
    failedVetoCount: 1,
    note: "The taught action has no visible response.",
  });
  assert.equal(state.state, "recapture_required");
});

test("routes a product change back to a new contract after confirmation", () => {
  let state = transitionWalkthroughWorkflow(initial(), {
    action: "record_failure",
    at,
    confirmed: true,
    failureClass: "product_change",
    note: "The demonstrated route changed.",
  });
  assert.equal(state.state, "recapture_required");
  state = transitionWalkthroughWorkflow(state, {
    action: "restart_after_recapture",
    at,
    confirmed: true,
    productRevision: "def456",
    routes: ["/new"],
  });
  assert.equal(state.state, "product_contract");
  assert.equal(state.product.revision, "def456");
});
