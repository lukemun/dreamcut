import { z } from "zod";
import { TIMELINE_ASPECT_RATIO_VALUES } from "../aspect-ratios";

const safeProjectId = z.string().min(1).max(128).regex(/^[A-Za-z0-9._-]+$/);

export const assemblySourceSchema = z.object({
  label: z.string().min(1).max(200),
  role: z.enum(["talking_head", "voice", "visual", "music", "sound_effect", "reference", "other"]),
  source_path: z.string().min(1).max(2000).nullable(),
  source_url: z.string().min(1).max(2000).nullable(),
  note: z.string().max(1000).nullable(),
}).strict().refine(source => source.source_path !== null || source.source_url !== null, "A source path or URL is required");

export const assemblyCreateRequestSchema = z.object({
  project_id: safeProjectId,
  title: z.string().min(1).max(200),
  objective: z.string().min(1).max(8000),
  script_text: z.string().max(50_000).nullable(),
  visual_directions: z.array(z.string().min(1).max(3000)).max(100),
  sources: z.array(assemblySourceSchema).max(100),
  source_project_id: safeProjectId.nullable(),
  /** Start from source_project_id's live cut and media, for a format variant such as a vertical version. */
  copy_source_timeline: z.boolean().optional(),
  delivery_target: z.enum(["web", "feed", "reels", "tiktok", "shorts"]),
  output_aspect_ratio: z.enum(TIMELINE_ASPECT_RATIO_VALUES),
  frame_rate: z.union([z.literal(24), z.literal(25), z.literal(30), z.literal(50), z.literal(60)]).optional(),
}).strict();

export const assemblyCreateRequestValidated = assemblyCreateRequestSchema.refine(
  request => !request.copy_source_timeline || request.source_project_id !== null,
  "copy_source_timeline needs source_project_id",
);

export const assemblyBriefSchema = assemblyCreateRequestSchema.extend({
  schema_version: z.literal(1),
  created_at: z.string().datetime(),
  status: z.enum(["assembling", "ready_for_review", "blocked"]),
  authority: z.enum(["agent_workspace", "proposal_required"]),
  proposal_policy: z.enum(["direct_until_first_human_edit", "direct_until_first_handoff_or_human_edit", "proposals_only"]),
}).strict();

export type AssemblyCreateRequest = z.infer<typeof assemblyCreateRequestSchema>;
export type AssemblyBrief = z.infer<typeof assemblyBriefSchema>;
