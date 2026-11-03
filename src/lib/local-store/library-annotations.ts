import fs from "node:fs";
import path from "node:path";

import { z } from "zod";

import { projectDir } from "@/lib/local-store/paths";

const libraryAnnotationSourceSchema = z.object({
  label: z.string().trim().min(1).max(240),
  url: z.string().url(),
  kind: z.enum(["template_page", "cultural_reference", "original_source"]),
});

export const libraryAssetAnnotationSchema = z.object({
  display_name: z.string().trim().min(1).max(240),
  meaning: z.string().trim().min(1).max(800),
  use_cases: z.array(z.string().trim().min(1).max(240)).min(1).max(8),
  tone: z.array(z.string().trim().min(1).max(80)).min(1).max(8),
  template_structure: z.string().trim().min(1).max(800),
  cultural_context: z.string().trim().min(1).max(1200),
  avoid_when: z.array(z.string().trim().min(1).max(300)).max(8),
  tags: z.array(z.string().trim().min(1).max(80)).min(1).max(24),
  confidence: z.enum(["high", "medium", "low"]),
  sources: z.array(libraryAnnotationSourceSchema).min(1).max(8),
});

export const libraryAnnotationsSchema = z.object({
  schema_version: z.literal(1),
  project_id: z.string().trim().min(1).max(128),
  researched_at: z.string().datetime(),
  method: z.string().trim().min(1).max(1200),
  assets: z.record(z.string().trim().min(1), libraryAssetAnnotationSchema),
});

export type LibraryAssetAnnotation = z.infer<typeof libraryAssetAnnotationSchema>;
export type LibraryAnnotations = z.infer<typeof libraryAnnotationsSchema>;

export function projectLibraryAnnotationsPath(projectId: string): string {
  return path.join(projectDir(projectId), "library-annotations.json");
}

export function readLibraryAnnotations(projectId: string): LibraryAnnotations | null {
  const annotationPath = projectLibraryAnnotationsPath(projectId);
  if (!fs.existsSync(annotationPath)) return null;
  const parsed = libraryAnnotationsSchema.safeParse(JSON.parse(fs.readFileSync(annotationPath, "utf8")));
  if (!parsed.success) {
    throw new Error(`Invalid library annotations at ${annotationPath}: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
  }
  if (parsed.data.project_id !== projectId) {
    throw new Error(`Library annotations belong to ${parsed.data.project_id}, not ${projectId}`);
  }
  return parsed.data;
}
