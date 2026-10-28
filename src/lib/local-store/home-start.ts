import { z } from "zod";

import { TIMELINE_ASPECT_RATIO_VALUES } from "@/lib/aspect-ratios";
import { createAssemblyWorkspace, readAssemblyBrief } from "./assembly-workspaces";
import { recordEditingFeedback } from "./editing-feedback";
import { projectExists, projectIdForTitle } from "./paths";
import { isAgentWorkspaceProject, readTimeline } from "./store";

/** The creator's own words are the brief, recorded verbatim, so they share the feedback ledger's limit. */
export const HOME_BRIEF_MAX = 2000;

export const homeStartSchema = z.object({
  title: z.string().trim().min(1).max(200),
  brief: z.string().trim().min(1).max(HOME_BRIEF_MAX),
  aspect_ratio: z.enum(TIMELINE_ASPECT_RATIO_VALUES),
}).strict();

/**
 * Home's Start project: a new project whose first cut an agent builds from the creator's brief.
 * It is an assembly workspace (the agent may lay out the first cut directly, then hands it off for
 * review) and the brief is recorded as the creator's direction, so it shows under Up next and any
 * agent finds it. The media follows as ordinary Library imports, which leave the grant in place.
 */
export function startProjectFromHome(raw: unknown) {
  const { title, brief, aspect_ratio } = homeStartSchema.parse(raw);
  const projectId = projectIdForTitle(title);
  createAssemblyWorkspace({
    project_id: projectId, title, objective: brief, script_text: null, visual_directions: [], sources: [],
    source_project_id: null, delivery_target: "web", output_aspect_ratio: aspect_ratio,
  }, "human");
  const feedback = recordEditingFeedback({ project_id: projectId, session_id: "home-start", turn_id: projectId,
    direction: brief, provenance: "user_words" }, "human");
  return { id: projectId, feedback_id: feedback.event_id };
}

/** A project whose brief is still waiting for its first cut: the grant is live and nothing is laid out. */
export function waitingFirstBuild(projectId: string) {
  if (!projectExists(projectId) || !isAgentWorkspaceProject(projectId)) return null;
  const brief = readAssemblyBrief(projectId);
  if (!brief || readTimeline(projectId).elements.some(element => !element.removed_at)) return null;
  return { project_id: projectId, brief: brief.objective, guidance: "The creator started this project with this brief and is waiting for its first cut. Follow skill:editorial-assembly (assembly_get, then the Library), lay it out with the workspace tools and call assembly_handoff." };
}
