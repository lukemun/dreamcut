import type { TimelineAspectRatioValue } from "@/lib/aspect-ratios";

export const WALKTHROUGH_STATES = [
  "product_contract",
  "script_plan_approved",
  "live_flow_verified",
  "source_captured",
  "source_qualified",
  "rough_spine_complete",
  "language_approved",
  "fine_edit_complete",
  "author_preflight_pass",
  "cold_grade_pass",
  "human_review",
  "delivery_authorized",
  "repair_allowed",
  "recapture_required",
  "abandoned",
] as const;

export type WalkthroughStateName = typeof WALKTHROUGH_STATES[number];

export type WalkthroughWorkflowState = {
  schema_version: 4;
  project_id: string;
  state: WalkthroughStateName;
  created_at: string;
  updated_at: string;
  product: {
    revision: string;
    routes: string[];
    output_aspect_ratio: TimelineAspectRatioValue;
    paid_action: {
      required: boolean;
      authorized: boolean;
      authorization_note: string | null;
    };
  };
  locks: {
    script_plan_path: string | null;
    script_plan_sha256: string | null;
    script_plan_approved_by: string | null;
    live_flow_receipt: string | null;
    source_manifest_sha256: string | null;
    source_qualification_sha256: string | null;
    source_grade_sha256: string | null;
    rough_spine_timeline_sha256: string | null;
    rough_spine_receipt_sha256: string | null;
    narration_path: string | null;
    narration_sha256: string | null;
    narration_approved_by: string | null;
    narration_visual_contract_path: string | null;
    narration_visual_contract_sha256: string | null;
    timeline_sha256: string | null;
    author_preflight_at: string | null;
    final_grade_id: string | null;
  };
  attempts: {
    source_salvage: number;
    integration_repairs: number;
    final_grades: number;
  };
  failure: {
    class: "source" | "integration" | "product_change" | null;
    reason: string | null;
    resume_state: WalkthroughStateName | null;
  };
  history: Array<{
    at: string;
    action: string;
    from: WalkthroughStateName | null;
    to: WalkthroughStateName;
    evidence: string[];
    note: string | null;
  }>;
  next_action: string;
};

export type WalkthroughTransition = {
  action:
    | "authorize_paid_action"
    | "approve_script_plan"
    | "verify_live_flow"
    | "mark_source_captured"
    | "qualify_source"
    | "mark_rough_spine_complete"
    | "approve_language"
    | "mark_fine_edit_complete"
    | "pass_author_preflight"
    | "accept_cold_grade"
    | "open_human_review"
    | "authorize_delivery"
    | "record_failure"
    | "resume_repair"
    | "restart_after_recapture"
    | "abandon";
  at: string;
  evidence?: string[];
  note?: string;
  confirmed?: boolean;
  failureClass?: "source" | "integration" | "product_change";
  failedVetoCount?: number;
  productRevision?: string;
  routes?: string[];
  paidAuthorizationNote?: string;
  lockPatch?: Partial<WalkthroughWorkflowState["locks"]>;
};

function requireConfirmed(input: WalkthroughTransition) {
  if (input.confirmed !== true) throw new Error(`${input.action} requires confirmed=true`);
}

function requireState(state: WalkthroughWorkflowState, allowed: WalkthroughStateName[], action: string) {
  if (!allowed.includes(state.state)) {
    throw new Error(`${action} is not allowed from ${state.state}; expected ${allowed.join(" or ")}`);
  }
}

export function nextWalkthroughAction(state: WalkthroughStateName): string {
  const actions: Record<WalkthroughStateName, string> = {
    product_contract: "Write the beat-by-beat shooting script and obtain explicit human approval.",
    script_plan_approved: "Verify the complete live flow against the approved shooting script and frozen product contract.",
    live_flow_verified: "Capture the truthful source take and create its source manifest.",
    source_captured: "Create the source qualification pack and obtain a fresh source grade.",
    source_qualified: "Build and qualify the complete silent source-backed visual spine before writing narration.",
    rough_spine_complete: "Write the exact narration against the visual spine, obtain human approval, and record the creator's continuous performance.",
    language_approved: "Align the creator's recording and build the fine edit against the qualified visual spine.",
    fine_edit_complete: "Run the bundled author preflight on one frozen timeline hash.",
    author_preflight_pass: "Run one fresh final cold grade.",
    cold_grade_pass: "Open the guarded editable timeline for human taste review.",
    human_review: "Wait for explicit delivery authorization; keep rendering blocked.",
    delivery_authorized: "Delivery may proceed within the explicit authorization.",
    repair_allowed: "Apply one bounded integration repair, then freeze a new fine-edit hash.",
    recapture_required: "Recapture from the live flow or explicitly abandon the walkthrough.",
    abandoned: "No further work is authorized for this walkthrough.",
  };
  return actions[state];
}

export function createWalkthroughWorkflowState(input: {
  projectId: string;
  productRevision: string;
  routes: string[];
  paidActionRequired: boolean;
  outputAspectRatio?: TimelineAspectRatioValue;
  at: string;
  confirmed: boolean;
}): WalkthroughWorkflowState {
  if (!input.confirmed) throw new Error("Workflow initialization requires confirmed=true");
  if (!input.projectId.trim()) throw new Error("projectId is required");
  if (!input.productRevision.trim()) throw new Error("productRevision is required");
  if (input.routes.length === 0 || input.routes.some((route) => !route.trim())) {
    throw new Error("At least one filmed route is required");
  }
  const state: WalkthroughWorkflowState = {
    schema_version: 4,
    project_id: input.projectId,
    state: "product_contract",
    created_at: input.at,
    updated_at: input.at,
    product: {
      revision: input.productRevision,
      routes: input.routes,
      output_aspect_ratio: input.outputAspectRatio ?? "9:16",
      paid_action: {
        required: input.paidActionRequired,
        authorized: false,
        authorization_note: null,
      },
    },
    locks: {
      script_plan_path: null,
      script_plan_sha256: null,
      script_plan_approved_by: null,
      live_flow_receipt: null,
      source_manifest_sha256: null,
      source_qualification_sha256: null,
      source_grade_sha256: null,
      rough_spine_timeline_sha256: null,
      rough_spine_receipt_sha256: null,
      narration_path: null,
      narration_sha256: null,
      narration_approved_by: null,
      narration_visual_contract_path: null,
      narration_visual_contract_sha256: null,
      timeline_sha256: null,
      author_preflight_at: null,
      final_grade_id: null,
    },
    attempts: {
      source_salvage: 0,
      integration_repairs: 0,
      final_grades: 0,
    },
    failure: { class: null, reason: null, resume_state: null },
    history: [{
      at: input.at,
      action: "initialize",
      from: null,
      to: "product_contract",
      evidence: [],
      note: null,
    }],
    next_action: nextWalkthroughAction("product_contract"),
  };
  return state;
}

export function transitionWalkthroughWorkflow(
  current: WalkthroughWorkflowState,
  input: WalkthroughTransition,
): WalkthroughWorkflowState {
  requireConfirmed(input);
  let target: WalkthroughStateName = current.state;
  const attempts = { ...current.attempts };
  const product = structuredClone(current.product);
  let failure = { ...current.failure };

  switch (input.action) {
    case "authorize_paid_action":
      requireState(current, ["product_contract", "script_plan_approved", "live_flow_verified"], input.action);
      if (!product.paid_action.required) throw new Error("No paid action is declared for this workflow");
      if (!input.paidAuthorizationNote?.trim()) throw new Error("Paid authorization requires an explicit note");
      product.paid_action.authorized = true;
      product.paid_action.authorization_note = input.paidAuthorizationNote;
      break;
    case "approve_script_plan":
      requireState(current, [
        "product_contract",
        "script_plan_approved",
        "live_flow_verified",
        "source_captured",
        "source_qualified",
        "language_approved",
        "rough_spine_complete",
        "fine_edit_complete",
        "author_preflight_pass",
        "cold_grade_pass",
        "human_review",
        "repair_allowed",
      ], input.action);
      if (!input.lockPatch?.script_plan_path || !input.lockPatch.script_plan_sha256 || !input.lockPatch.script_plan_approved_by) {
        throw new Error("Script-plan approval requires a path, hash, and human approver lock");
      }
      const scriptPlanChanged = current.locks.script_plan_sha256 != null
        && current.locks.script_plan_sha256 !== input.lockPatch.script_plan_sha256;
      target = current.state === "product_contract" || scriptPlanChanged
        ? "script_plan_approved"
        : current.state;
      if (scriptPlanChanged) {
        input.lockPatch = {
          ...input.lockPatch,
          live_flow_receipt: null,
          source_manifest_sha256: null,
          source_qualification_sha256: null,
          source_grade_sha256: null,
          rough_spine_timeline_sha256: null,
          rough_spine_receipt_sha256: null,
          narration_path: null,
          narration_sha256: null,
          narration_approved_by: null,
          narration_visual_contract_path: null,
          narration_visual_contract_sha256: null,
          timeline_sha256: null,
          author_preflight_at: null,
          final_grade_id: null,
        };
      }
      break;
    case "verify_live_flow":
      requireState(current, ["script_plan_approved"], input.action);
      target = "live_flow_verified";
      break;
    case "mark_source_captured":
      requireState(current, ["live_flow_verified"], input.action);
      if (!current.locks.script_plan_sha256 || !current.locks.script_plan_approved_by) {
        throw new Error("Source capture is blocked until a human approves the shooting script");
      }
      if (product.paid_action.required && !product.paid_action.authorized) {
        throw new Error("The source flow contains a paid action but no explicit authorization is recorded");
      }
      target = "source_captured";
      break;
    case "qualify_source":
      requireState(current, ["source_captured"], input.action);
      target = "source_qualified";
      break;
    case "mark_rough_spine_complete":
      requireState(current, ["source_qualified"], input.action);
      if (!current.locks.script_plan_sha256 || !current.locks.script_plan_approved_by) {
        throw new Error("Rough-spine assembly is blocked until a human approves the shooting script");
      }
      target = "rough_spine_complete";
      break;
    case "approve_language":
      requireState(current, ["rough_spine_complete"], input.action);
      if (
        !input.lockPatch?.narration_path
        || !input.lockPatch.narration_sha256
        || !input.lockPatch.narration_approved_by
        || !input.lockPatch.narration_visual_contract_path
        || !input.lockPatch.narration_visual_contract_sha256
      ) {
        throw new Error("Language approval requires narration and narration-to-screen contract locks");
      }
      target = "language_approved";
      break;
    case "mark_fine_edit_complete":
      requireState(current, ["language_approved", "repair_allowed"], input.action);
      target = "fine_edit_complete";
      failure = { class: null, reason: null, resume_state: null };
      break;
    case "pass_author_preflight":
      requireState(current, ["fine_edit_complete"], input.action);
      target = "author_preflight_pass";
      break;
    case "accept_cold_grade":
      requireState(current, ["author_preflight_pass"], input.action);
      target = "cold_grade_pass";
      attempts.final_grades += 1;
      break;
    case "open_human_review":
      requireState(current, ["cold_grade_pass"], input.action);
      target = "human_review";
      break;
    case "authorize_delivery":
      requireState(current, ["human_review"], input.action);
      target = "delivery_authorized";
      break;
    case "record_failure": {
      if (!input.failureClass || !input.note?.trim()) {
        throw new Error("record_failure requires failureClass and note");
      }
      const vetoCount = input.failedVetoCount ?? 1;
      if (input.failureClass === "integration" && current.state === "author_preflight_pass") {
        attempts.final_grades += 1;
      }
      if (
        input.failureClass === "integration"
        && attempts.integration_repairs < 1
        && vetoCount <= 2
      ) {
        attempts.integration_repairs += 1;
        target = "repair_allowed";
        failure = { class: input.failureClass, reason: input.note, resume_state: "fine_edit_complete" };
      } else {
        target = "recapture_required";
        failure = {
          class: input.failureClass,
          reason: input.note,
          resume_state: input.failureClass === "product_change" ? "product_contract" : "live_flow_verified",
        };
      }
      break;
    }
    case "resume_repair":
      requireState(current, ["repair_allowed"], input.action);
      target = "fine_edit_complete";
      failure = { class: null, reason: null, resume_state: null };
      break;
    case "restart_after_recapture":
      requireState(current, ["recapture_required"], input.action);
      if (current.failure.class === "product_change") {
        if (!input.productRevision?.trim() || !input.routes?.length) {
          throw new Error("Product-change restart requires a new revision and routes");
        }
        product.revision = input.productRevision;
        product.routes = input.routes;
        product.paid_action.authorized = false;
        product.paid_action.authorization_note = null;
        input.lockPatch = {
          ...(input.lockPatch ?? {}),
          script_plan_path: null,
          script_plan_sha256: null,
          script_plan_approved_by: null,
        };
        target = "product_contract";
      } else {
        attempts.source_salvage += 1;
        target = "live_flow_verified";
      }
      failure = { class: null, reason: null, resume_state: null };
      break;
    case "abandon":
      target = "abandoned";
      failure = {
        class: current.failure.class,
        reason: input.note?.trim() || "Explicitly abandoned by the human.",
        resume_state: null,
      };
      break;
  }

  const locks = { ...current.locks, ...(input.lockPatch ?? {}) };
  const evidence = input.evidence ?? [];
  return {
    ...current,
    state: target,
    updated_at: input.at,
    product,
    locks,
    attempts,
    failure,
    history: [...current.history, {
      at: input.at,
      action: input.action,
      from: current.state,
      to: target,
      evidence,
      note: input.note?.trim() || null,
    }],
    next_action: nextWalkthroughAction(target),
  };
}
