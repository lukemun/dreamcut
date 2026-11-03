import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { writeJsonFileAtomic } from "./atomic-json";
import { projectDir, projectExists, projectAssemblyHandoffPath, projectMetadataPath, projectTimelinePath } from "./paths";
import { createProject, assertProject, isAgentWorkspaceProject, readMetadata, readTimeline, withProjectLock } from "./store";
import { safeMemoryEvent } from "./editing-memory";
import { seedWorkspaceFromProject } from "./assembly-source-seed";
import { assemblyBriefSchema, assemblyCreateRequestValidated, type AssemblyBrief, type AssemblyCreateRequest } from "@/lib/timeline/assembly-workspaces";

export function assemblyBriefPath(projectId: string) {
  return path.join(projectDir(projectId), "analysis", "assembly-brief.json");
}

export function readAssemblyBrief(projectId: string): AssemblyBrief | null {
  const file = assemblyBriefPath(projectId);
  if (!fs.existsSync(file)) return null;
  const brief = assemblyBriefSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
  const live = isAgentWorkspaceProject(projectId);
  return { ...brief, status: fs.existsSync(projectAssemblyHandoffPath(projectId)) ? "ready_for_review" : brief.status,
    authority: live ? "agent_workspace" : "proposal_required",
    proposal_policy: live ? "direct_until_first_handoff_or_human_edit" : "proposals_only" };

}

/** `actor` is who asked for the build: an agent's assembly_create, or the creator starting a project from Home. */
export function createAssemblyWorkspace(raw: AssemblyCreateRequest, actor: "agent" | "human" = "agent") {
  const request = assemblyCreateRequestValidated.parse(raw);
  if (projectExists(request.project_id)) throw new Error(`Assembly target already exists: ${request.project_id}`);
  const directory = projectDir(request.project_id);
  let ownsDirectory = false;
  try {
    fs.mkdirSync(path.dirname(directory), { recursive: true });
    fs.mkdirSync(directory, { recursive: false });
    ownsDirectory = true;
    createProject(request.project_id, request.delivery_target, request.title, {
      agentWorkspace: true,
      outputAspectRatio: request.output_aspect_ratio,
      ...(request.frame_rate ? { frameRate: request.frame_rate } : {}),
    });
    const brief = assemblyBriefSchema.parse({ ...request, schema_version: 1, created_at: new Date().toISOString(),
      status: "assembling", authority: "agent_workspace", proposal_policy: "direct_until_first_handoff_or_human_edit" });
    const seed = request.copy_source_timeline && request.source_project_id
      ? seedWorkspaceFromProject(request.source_project_id, request.project_id) : null;
    writeJsonFileAtomic(assemblyBriefPath(request.project_id), brief);
    safeMemoryEvent(request.project_id, { type: "assembly.workspace_created", actor,
      summary: seed ? `Created an assembly workspace from ${seed.source_project_id}'s cut` : actor === "human" ? "Started from Home with a brief for the first build" : "Created a fresh autonomous assembly workspace",
      data: { source_project_id: request.source_project_id, ...(seed ? { seed } : {}) } });
    return seed ? { ...brief, seed } : brief;
  } catch (error) {
    if (ownsDirectory) fs.rmSync(directory, { recursive: true, force: true });
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error(`Assembly target already exists: ${request.project_id}`);
    throw error;
  }
}

/** Seal the first reviewable layout. No timeline mutation, approval, export or reopening. */
export async function handoffAssemblyWorkspace(projectId: string) {
  return withProjectLock(projectId, () => {
    assertProject(projectId);
    const marker = projectAssemblyHandoffPath(projectId);
    if (fs.existsSync(marker)) return JSON.parse(fs.readFileSync(marker, "utf8"));
    if (!isAgentWorkspaceProject(projectId)) throw new Error("No active assembly grant; this project already requires proposals.");
    if (!readTimeline(projectId).elements.some(element => !element.removed_at)) {
      throw new Error("Build the first layout before handing it off; the timeline is empty.");
    }
    const receipt = { schema_version: 1, project_id: projectId, handed_off_at: new Date().toISOString(),
      timeline_revision: createHash("sha256").update(fs.readFileSync(projectTimelinePath(projectId))).digest("hex"),
      authority: "proposal_required", proposal_policy: "proposals_only" };
    // Commit the irreversible guard first. An interrupted metadata cleanup still fails closed.
    writeJsonFileAtomic(marker, receipt);
    const metadata = readMetadata(projectId);
    delete metadata.agent_workspace;
    writeJsonFileAtomic(projectMetadataPath(projectId), metadata);
    safeMemoryEvent(projectId, { type: "assembly.handed_off", actor: "agent",
      summary: "First layout handed off; subsequent edits require proposals", data: receipt });
    return receipt;
  });
}
