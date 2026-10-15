import { z } from "zod";

import type { TimelineElement, TimelineTransition } from "@/components/studio/timeline/types";
import type { AuditionManifest } from "@/lib/timeline/auditions";
import type { TimelineFile } from "@/lib/local-store/store";

const safeProjectId = z.string().min(1).max(128).regex(/^[A-Za-z0-9._-]+$/);
const repoRelativePath = z.string().min(1).refine(
  (value) => !value.startsWith("/") && !value.split("/").includes(".."),
  "Path must stay inside the repository",
);
export const auditionCompileContractSchema = z.object({
  schema_version: z.literal(1),
  strategy: z.literal("agent_timeline_assembly"),
  target_project_id: safeProjectId,
  target_title: z.string().min(1).max(200),
  objective: z.string().min(1).max(8000),
  input_files: z.array(repoRelativePath).max(24).default([]),
  backend: z.enum(["codex", "claude"]).default("codex"),
  model: z.string().min(1).max(100).default("gpt-5.6-sol"),
  effort: z.enum(["low", "medium", "high", "xhigh", "max", "ultra"]).default("high"),
  require_all_sections: z.boolean().default(true),
  gap_seconds: z.number().min(0).max(10).default(0),
  include_editorial_labels: z.boolean().default(false),
  allow_existing_target: z.boolean().default(true),
  caps: z.object({
    max_external_calls: z.literal(0),
    max_renders: z.literal(0),
    max_timeline_mutations: z.number().int().min(1).max(500),
  }).strict(),
}).strict();

export const auditionCompileSelectionSchema = z.object({
  section_id: z.string().min(1),
  section_label: z.string().min(1),
  script_text: z.string().min(1),
  candidate_id: z.string().min(1),
  source_label: z.string().min(1),
  pass_label: z.string().min(1),
  source_url: z.string().min(1),
  timeline_element_id: z.string().uuid(),
}).strict();

export const auditionCompileJobSchema = z.object({
  schema_version: z.literal(1),
  id: z.string().uuid(),
  status: z.enum(["queued", "running", "completed", "failed"]),
  audition_project_id: safeProjectId,
  target_project_id: safeProjectId,
  selection_revision: z.string().datetime(),
  selections: z.array(auditionCompileSelectionSchema).min(1),
  contract: auditionCompileContractSchema,
  confirmed: z.literal(true),
  created_at: z.string().datetime(),
  started_at: z.string().datetime().nullable(),
  completed_at: z.string().datetime().nullable(),
  run_dir: z.string().nullable(),
  result_path: z.string().nullable(),
  outcome: z.enum(["compiled_for_review", "blocked", "no_change"]).nullable(),
  summary: z.string().nullable(),
  review_url: z.string().nullable(),
  error: z.string().nullable(),
}).strict();

export type AuditionCompileContract = z.infer<typeof auditionCompileContractSchema>;
export type AuditionCompileJob = z.infer<typeof auditionCompileJobSchema>;

export type AssembledAuditionSelection = {
  timeline: TimelineFile;
  selected_candidate_ids: string[];
  source_element_ids: string[];
};

export function assembleAuditionSelection(
  manifest: AuditionManifest,
  sourceTimeline: TimelineFile,
  targetProjectId: string,
  contract: AuditionCompileContract,
  idFactory: () => string,
  now = new Date().toISOString(),
): AssembledAuditionSelection {
  const sections = [...manifest.sections].sort((a, b) => a.order - b.order);
  const elements: TimelineElement[] = [];
  const transitions: TimelineTransition[] = [];
  const selectedCandidateIds: string[] = [];
  const sourceElementIds: string[] = [];
  let cursor = 0;

  for (const section of sections) {
    if (!section.winner_candidate_id) {
      if (contract.require_all_sections) throw new Error(`Pick a winner for: ${section.label}`);
      continue;
    }
    const candidate = section.candidates.find((item) => item.id === section.winner_candidate_id);
    if (!candidate) throw new Error(`Selected candidate is missing from ${section.label}`);
    const primary = sourceTimeline.elements.find((element) => element.id === candidate.timeline_element_id && element.removed_at == null);
    if (!primary) throw new Error(`Selected timeline element is missing: ${candidate.timeline_element_id}`);

    const group = sourceTimeline.elements.filter((element) => {
      if (element.removed_at != null) return false;
      if (element.id === candidate.timeline_element_id) return true;
      if (contract.include_editorial_labels && element.id === candidate.label_element_id) return true;
      return element.props?.audition_candidate_id === candidate.id
        && element.props?.audition_section_id === section.id
        && (contract.include_editorial_labels || element.id !== candidate.label_element_id);
    });
    const idMap = new Map<string, string>();
    for (const source of group) idMap.set(source.id, idFactory());

    for (const source of group) {
      const id = idMap.get(source.id)!;
      sourceElementIds.push(source.id);
      elements.push({
        ...source,
        id,
        project_id: targetProjectId,
        timeline_start: cursor + Math.max(0, source.timeline_start - primary.timeline_start),
        removed_at: null,
        removed_reason: null,
        created_at: now,
        updated_at: now,
        props: {
          ...source.props,
          audition_compilation: true,
          compiled_from_project_id: manifest.project_id,
          compiled_from_section_id: section.id,
          compiled_from_candidate_id: candidate.id,
          compiled_from_element_id: source.id,
        },
      });
    }
    for (const transition of sourceTimeline.transitions) {
      if (transition.removed_at != null) continue;
      const from = idMap.get(transition.from_element_id);
      const to = idMap.get(transition.to_element_id);
      if (!from || !to) continue;
      transitions.push({
        ...transition,
        id: idFactory(),
        project_id: targetProjectId,
        from_element_id: from,
        to_element_id: to,
        removed_at: null,
        removed_reason: null,
        created_at: now,
        updated_at: now,
      });
    }

    selectedCandidateIds.push(candidate.id);
    cursor += primary.duration + contract.gap_seconds;
  }

  if (selectedCandidateIds.length === 0) throw new Error("Pick at least one audition winner before compiling");
  return { timeline: { elements, transitions }, selected_candidate_ids: selectedCandidateIds, source_element_ids: sourceElementIds };
}
