import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { listMediaFiles } from "./media";
import { projectMediaDir } from "./paths";
import { readMusicCatalog, resolveMusicCatalogFile, musicCatalogFileExists } from "./music-catalog";
import { readSfxCatalog, resolveSfxCatalogFile, sfxCatalogFileExists } from "./sfx-catalog";
import { beatAnnotationSchema, musicalHitKindSchema, type BeatAnnotation } from "../timeline/beat-annotations";

const reviewedHitSchema = z.object({
  time_seconds: z.number().finite().min(0),
  kind: musicalHitKindSchema,
  confidence: z.number().finite().min(0).max(1),
  strength: z.number().finite().min(0).max(1),
});
const reviewSchema = z.object({
  schema_version: z.literal(1),
  source_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  recipe: z.string(),
  updated_at: z.string(),
  hits: z.array(reviewedHitSchema).max(200000),
});
type ReviewedHit = z.infer<typeof reviewedHitSchema>;

export function resolveLibraryAudioSource(projectId: string, sourceUrl: string): string | null {
  let pathname: string;
  try {
    const url = new URL(sourceUrl, "http://localhost");
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return null;
    pathname = decodeURIComponent(url.pathname);
  } catch { return null; }
  const local = listMediaFiles(projectId).find(file => file.kind === "audio" && pathname === decodeURIComponent(file.url));
  if (local) return path.join(projectMediaDir(projectId), local.relPath);
  const musicPrefix = "/api/music-catalog/media/";
  if (pathname.startsWith(musicPrefix)) {
    const file = pathname.slice(musicPrefix.length);
    if (readMusicCatalog().tracks.some(track => track.versions.some(version => version.file === file)) && musicCatalogFileExists(file)) return resolveMusicCatalogFile(file);
  }
  const sfxPrefix = "/api/sfx-catalog/media/";
  if (pathname.startsWith(sfxPrefix)) {
    const file = pathname.slice(sfxPrefix.length);
    if (readSfxCatalog().sound_effects.some(effect => effect.file === file) && sfxCatalogFileExists(file)) return resolveSfxCatalogFile(file);
  }
  return null;
}

function reviewPath(directory: string, annotation: BeatAnnotation) {
  const key = createHash("sha256").update(annotation.recipe).digest("hex").slice(0, 16);
  return path.join(directory, `review-${annotation.source_sha256}-${key}.json`);
}
export async function readRhythmReview(directory: string, annotation: BeatAnnotation) {
  try {
    const raw = await fs.readFile(reviewPath(directory, annotation), "utf8");
    const review = reviewSchema.parse(JSON.parse(raw));
    if (review.source_sha256 !== annotation.source_sha256 || review.recipe !== annotation.recipe) throw new Error("Rhythm review no longer matches this source analysis.");
    return { review, revision: createHash("sha256").update(raw).digest("hex") };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
export function withRhythmReview(annotation: BeatAnnotation, hits: ReviewedHit[] | null): BeatAnnotation {
  return hits && annotation.schema_version === 2 ? beatAnnotationSchema.parse({ ...annotation, hits }) : annotation;
}
export async function writeRhythmReview(directory: string, annotation: BeatAnnotation, hits: ReviewedHit[], expectedRevision: string | null) {
  if (annotation.schema_version !== 2) throw new Error("Analyze the track before reviewing its hits.");
  const current = await readRhythmReview(directory, annotation);
  if ((current?.revision ?? null) !== expectedRevision) throw new Error("Rhythm review changed elsewhere. Reload before saving.");
  const validated = reviewSchema.parse({ schema_version: 1, source_sha256: annotation.source_sha256, recipe: annotation.recipe, updated_at: new Date().toISOString(), hits });
  beatAnnotationSchema.parse({ ...annotation, hits: validated.hits });
  await fs.mkdir(directory, { recursive: true });
  const target = reviewPath(directory, annotation);
  const raw = JSON.stringify(validated, null, 2) + "\n";
  const staging = `${target}.${process.pid}.tmp`;
  await fs.writeFile(staging, raw);
  await fs.rename(staging, target);
  return { review: validated, revision: createHash("sha256").update(raw).digest("hex") };
}
