import { z } from "zod";

const note = z.string().trim().max(10000);
const webUrl = z.string().max(2000).url().refine(value => /^https?:\/\//.test(value), "Use an http or https URL");
export const ideaStatuses = ["Saved", "Planned", "In production", "Made", "Archived"] as const;
export const videoIdeaInputSchema = z.object({
  title: z.string().trim().min(1).max(160),
  concept: note,
  source_url: z.union([webUrl, z.literal("")]),
  credit: z.string().trim().max(500),
  capture_notes: note,
  edit_notes: note,
  tags: z.array(z.string().trim().min(1).max(60)).max(30),
  status: z.enum(ideaStatuses),
  links: z.array(z.object({ title: z.string().trim().min(1).max(160), url: webUrl }).strict()).max(30),
}).strict();
const artifact = <T extends string>(file: T) => z.object({ file: z.literal(file), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export const videoIdeaSchema = videoIdeaInputSchema.extend({
  schema_version: z.literal(1), id: z.string().uuid(), revision: z.number().int().positive(),
  created_at: z.string().datetime(), updated_at: z.string().datetime(),
  reference: artifact("reference.mp4").nullable(), poster: artifact("poster.jpg").nullable(),
});
export type VideoIdeaInput = z.infer<typeof videoIdeaInputSchema>;
export type VideoIdea = z.infer<typeof videoIdeaSchema>;
export const emptyVideoIdea: VideoIdeaInput = { title: "", concept: "", source_url: "", credit: "", capture_notes: "", edit_notes: "", tags: [], status: "Saved", links: [] };
export function ideaInput(idea: VideoIdea): VideoIdeaInput {
  return videoIdeaInputSchema.parse(Object.fromEntries(Object.keys(emptyVideoIdea).map(key => [key, idea[key as keyof VideoIdea]])));
}
