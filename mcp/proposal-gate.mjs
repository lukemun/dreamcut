/**
 * The agent-facing MCP is proposal-gated for existing timelines.
 *
 * The editor UI still owns the underlying mutation routes, and proposal
 * approval applies through the shared safe-write layer. Agents may also
 * create bounded, brand-new assembly or audition projects because those introduce
 * new work without mutating an existing working cut. They cannot
 * directly mutate an existing timeline or resolve their own proposals through
 * this transport.
 *
 * ONE exception, project-scoped: a project an agent assembly/audition flow created
 * carries `agent_workspace: true` in its metadata (store.ts `createProject`). There is
 * no human cut to protect there yet, so the element/transition/lane/output mutation
 * tools are allowed for as long as the grant lasts. The grant is a one-way latch —
 * the first layout handoff or human edit clears it and the project becomes a normal proposal-gated
 * working timeline. Approving, rejecting, and history restore are never granted:
 * the assembly grant must not open self-approval or history rewriting.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { projectsRootFor } from "./projects-root.mjs";

const EDITOR_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Resolution and refusal never depend on the human, so these stay blocked in every project. */
export const HUMAN_ONLY_AGENT_MCP_TOOLS = new Set([
  "proposal_approve",
  "proposal_reject",
  "history_restore",
]);

/** Direct timeline mutation: allowed only inside a live `agent_workspace` project. */
export const AGENT_WORKSPACE_ONLY_MCP_TOOLS = new Set([
  "elements_batch",
  "element_create",
  "element_create_from_source_window",
  "element_trim",
  "element_props_patch",
  "element_delete",
  "element_restore",
  "element_split",
  "element_duplicate",
  "element_normalize",
  "transition_create",
  "transition_patch",
  "transition_delete",
  "lane_order_set",
  "muted_lanes_set",
  "output_format_set",
]);

/** Every tool that is refused on an ordinary human-edited working timeline. */
export const BLOCKED_AGENT_MCP_TOOLS = new Set([
  ...AGENT_WORKSPACE_ONLY_MCP_TOOLS,
  ...HUMAN_ONLY_AGENT_MCP_TOOLS,
]);

/**
 * Attribution lease the MCP drops in the project dir around a granted mutation so the
 * shared safe-write layer can tell the agent's write from a human edit — both arrive as
 * the same HTTP route on the same dev-server process. Keep the basename in sync with
 * `projectAgentWriteLeasePath` in src/lib/local-store/paths.ts. It only ever SUPPRESSES a
 * revoke; it can never grant the workspace flag, so a stale one is harmless.
 */
export const AGENT_WRITE_LEASE_FILENAME = ".agent-mcp-write.json";
export const AGENT_WRITE_LEASE_TTL_MS = 120_000;

/** Mirrors `projectsRoot()` in src/lib/local-store/paths.ts, including the chosen DreamCut Library. */
function projectsRoot() {
  return projectsRootFor(EDITOR_ROOT);
}

function projectDir(projectId) {
  if (typeof projectId !== "string" || !/^[A-Za-z0-9._-]{1,128}$/.test(projectId)) return null;
  if (projectId === "." || projectId === "..") return null;
  const root = projectsRoot();
  const candidate = path.resolve(root, projectId);
  return path.dirname(candidate) === root ? candidate : null;
}

/** Basename of the store's revocation receipt (`projectAgentWorkspaceRevokedPath` in paths.ts). */
export const AGENT_WORKSPACE_REVOKED_FILENAME = ".agent-workspace-revoked.json";

/**
 * Why the assembly grant is or is not live, read from disk rather than over HTTP: the gate
 * must fail closed even with no dev server. Enforcement and the availability report both
 * use this one reader, so they cannot disagree.
 * @returns {"live"|"handed_off"|"human_edited"|"ordinary"|"missing"|"invalid_id"}
 */
export function agentWorkspaceState(projectId) {
  const dir = projectDir(projectId);
  if (dir === null) return "invalid_id";
  try {
    if (!fs.statSync(dir).isDirectory()) return "missing";
    if (fs.existsSync(path.join(dir, ".assembly-handoff.json"))) return "handed_off";
    const metadata = JSON.parse(fs.readFileSync(path.join(dir, "metadata.json"), "utf8"));
    if (metadata?.agent_workspace === true) return "live";
    return fs.existsSync(path.join(dir, AGENT_WORKSPACE_REVOKED_FILENAME)) ? "human_edited" : "ordinary";
  } catch {
    return "missing";
  }
}

/** True when the project exists on disk AND still carries the assembly grant. */
export function isAgentWorkspaceProject(projectId) {
  return agentWorkspaceState(projectId) === "live";
}

export function agentWriteLeasePath(projectId) {
  const dir = projectDir(projectId);
  return dir === null ? null : path.join(dir, AGENT_WRITE_LEASE_FILENAME);
}

/**
 * Run one granted mutation with the agent's write attributed, so the safe-write layer
 * does not read it as the human taking the project over. A no-op outside a workspace
 * project — the call is being refused there anyway.
 */
export async function withAgentWriteLease(projectId, toolName, run) {
  // Recheck at dispatch: handoff may have closed the grant since tool admission.
  if (AGENT_WORKSPACE_ONLY_MCP_TOOLS.has(toolName)) assertAgentMcpToolAllowed(toolName, { project_id: projectId });
  const leasePath = isAgentWorkspaceProject(projectId) ? agentWriteLeasePath(projectId) : null;
  if (leasePath === null) return run();
  fs.writeFileSync(
    leasePath,
    `${JSON.stringify({
      tool: toolName,
      pid: process.pid,
      expires_at_ms: Date.now() + AGENT_WRITE_LEASE_TTL_MS,
    }, null, 2)}\n`,
    "utf8",
  );
  try {
    return await run();
  } finally {
    try {
      fs.unlinkSync(leasePath);
    } catch {
      // Already gone; the TTL bounds it either way.
    }
  }
}

/**
 * @param {string} toolName
 * @param {{ project_id?: string }} [args] tool arguments; `project_id` decides a
 *   workspace-only tool. Omitted args mean "no project resolved" → refused.
 */
export function isAgentMcpToolAllowed(toolName, args) {
  return agentToolAvailability(toolName, args?.project_id).enabled;
}

const PROPOSAL_INSTEAD = "proposal_create";
const GATED_REASONS = {
  handed_off: ["WORKSPACE_HANDED_OFF", "This workspace was handed off for review, which closes direct editing for good."],
  human_edited: ["WORKSPACE_HUMAN_EDITED", "A person edited this workspace, which closed direct editing for good."],
  ordinary: ["NOT_AGENT_WORKSPACE", "This is a working timeline, not an agent assembly or audition workspace."],
  missing: ["PROJECT_UNREADABLE", "The project does not exist or its metadata cannot be read."],
  invalid_id: ["PROJECT_REQUIRED", "A valid project_id is required to decide a timeline-writing tool."],
};

/**
 * The enabled state and reason for one tool on one project, from the same rules that
 * enforce it. Reasons are stable codes plus a sentence an agent can repeat to the user.
 */
export function agentToolAvailability(toolName, projectId) {
  if (HUMAN_ONLY_AGENT_MCP_TOOLS.has(toolName)) {
    return { tool: toolName, enabled: false, reason_code: "HUMAN_ONLY",
      reason: "Approving, rejecting and restoring history are the human's actions in the editor.", use_instead: null };
  }
  if (!AGENT_WORKSPACE_ONLY_MCP_TOOLS.has(toolName)) return { tool: toolName, enabled: true, reason_code: null, reason: null, use_instead: null };
  const state = agentWorkspaceState(projectId);
  if (state === "live") return { tool: toolName, enabled: true, reason_code: null, reason: null, use_instead: null };
  const [reason_code, reason] = GATED_REASONS[state];
  return { tool: toolName, enabled: false, reason_code, reason: `${reason} Propose the change for the human to approve.`, use_instead: PROPOSAL_INSTEAD };
}

/** Refusals carry a typed payload: nothing was written, and the recovery names the allowed route. */
export function assertAgentMcpToolAllowed(toolName, args) {
  const availability = agentToolAvailability(toolName, args?.project_id);
  if (availability.enabled) return;
  if (availability.reason_code === "HUMAN_ONLY") {
    const message = `Agent MCP tool ${toolName} is human-only. Approving, rejecting, and restoring history are `
      + "the human's actions in the editor UI, and the agent_workspace assembly grant never opens "
      + "them: an agent must not approve its own proposal or rewrite a project's history.";
    throw Object.assign(new Error(message), { toolError: { schema_version: 1, code: "NOT_AUTHORIZED", reason_code: "HUMAN_ONLY",
      message, retryable: false, state_changed: false, recovery: { action: "stop", reason: "Ask the human to resolve it in the editor." } } });
  }
  const message = `Agent MCP tool ${toolName} is proposal-gated outside an agent_workspace project. `
    + `${availability.reason} Direct mutation is allowed only in a project an agent assembly/audition flow created, and only `
    + "until the first layout handoff or human edit clears that grant. Use proposal_create and let the human "
    + "approve or reject it in the editor UI. If the proposal schema cannot express the edit, "
    + "extend proposal support before changing the timeline.";
  throw Object.assign(new Error(message), { toolError: { schema_version: 1, code: "PROPOSAL_GATED", reason_code: availability.reason_code,
    message, retryable: false, state_changed: false,
    recovery: { action: "use_proposal", tool: PROPOSAL_INSTEAD, reason: "Express the same edit as a proposal; nothing was written." } } });
}
