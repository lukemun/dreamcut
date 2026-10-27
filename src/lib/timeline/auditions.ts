import { z } from "zod";

export const auditionCandidateSchema = z.object({
  id: z.string().min(1),
  take_id: z.string().min(1),
  timeline_element_id: z.string().uuid(),
  label_element_id: z.string().uuid(),
  associated_element_ids: z.array(z.string().uuid()).optional(),
  source_url: z.string().min(1),
  thumbnail_url: z.string().min(1),
  source_start_seconds: z.number().nonnegative(),
  source_end_seconds: z.number().positive(),
  duration_seconds: z.number().positive(),
  pass_label: z.string().min(1),
  source_label: z.string().min(1),
  /** Stable identity for the uninterrupted source recording, when known. */
  source_recording_id: z.string().min(1).optional(),
}).strict().refine(
  (candidate) => candidate.source_end_seconds > candidate.source_start_seconds,
  "Candidate source end must follow source start",
);

export const auditionExclusionSchema = z.object({
  take_id: z.string().min(1),
  section_id: z.string().min(1),
  source_start_seconds: z.number().nonnegative(),
  source_end_seconds: z.number().positive(),
  transcript: z.string().min(1),
  reason: z.string().min(1),
}).strict().refine(
  (exclusion) => exclusion.source_end_seconds > exclusion.source_start_seconds,
  "Excluded source end must follow source start",
);

export const auditionSectionSchema = z.object({
  id: z.string().min(1),
  order: z.number().int().nonnegative(),
  label: z.string().min(1),
  script_text: z.string().min(1),
  winner_candidate_id: z.string().min(1).nullable(),
  candidates: z.array(auditionCandidateSchema).min(1),
}).strict().refine(
  (section) => section.winner_candidate_id == null
    || section.candidates.some((candidate) => candidate.id === section.winner_candidate_id),
  "Winner must be a candidate in the same section",
);

export const auditionManifestSchema = z.object({
  schema_version: z.literal(1),
  project_id: z.string().min(1),
  source_note: z.string().min(1),
  exclusions: z.array(auditionExclusionSchema).optional(),
  sections: z.array(auditionSectionSchema).min(1),
  updated_at: z.string().datetime(),
}).strict();

export type AuditionCandidate = z.infer<typeof auditionCandidateSchema>;
export type AuditionExclusion = z.infer<typeof auditionExclusionSchema>;
export type AuditionSection = z.infer<typeof auditionSectionSchema>;
export type AuditionManifest = z.infer<typeof auditionManifestSchema>;

function normalizedSourceLabel(candidate: AuditionCandidate): string {
  return candidate.source_label.trim().toLocaleLowerCase();
}

/**
 * Whether two audition excerpts came from the same uninterrupted recording.
 *
 * Builders can provide a stable recording id. Older manifests fall back to
 * their original source label, which intentionally groups separately exported
 * excerpts (for example body.mov and ending.mov) from the same camera file.
 * The derived source URL is only the last fallback because processing often
 * gives excerpts different URLs.
 */
export function auditionCandidatesShareRecording(
  first: AuditionCandidate,
  second: AuditionCandidate,
): boolean {
  if (first.source_recording_id || second.source_recording_id) {
    return Boolean(
      first.source_recording_id
      && second.source_recording_id
      && first.source_recording_id === second.source_recording_id,
    );
  }

  const firstLabel = normalizedSourceLabel(first);
  const secondLabel = normalizedSourceLabel(second);
  if (firstLabel && secondLabel) return firstLabel === secondLabel;
  return first.source_url === second.source_url;
}

export function selectAuditionWinner(
  manifest: AuditionManifest,
  sectionId: string,
  candidateId: string,
  now = new Date().toISOString(),
): AuditionManifest {
  const section = manifest.sections.find((candidate) => candidate.id === sectionId);
  if (!section) throw new Error(`Audition section not found: ${sectionId}`);
  if (!section.candidates.some((candidate) => candidate.id === candidateId)) {
    throw new Error(`Audition candidate ${candidateId} is not in section ${sectionId}`);
  }
  return auditionManifestSchema.parse({
    ...manifest,
    updated_at: now,
    sections: manifest.sections.map((candidate) => candidate.id === sectionId
      ? { ...candidate, winner_candidate_id: candidateId }
      : candidate),
  });
}

export function rejectAuditionCandidate(
  manifest: AuditionManifest,
  sectionId: string,
  candidateId: string,
  now = new Date().toISOString(),
): AuditionManifest {
  const section = manifest.sections.find((candidate) => candidate.id === sectionId);
  if (!section) throw new Error(`Audition section not found: ${sectionId}`);
  if (!section.candidates.some((candidate) => candidate.id === candidateId)) {
    throw new Error(`Audition candidate ${candidateId} is not in section ${sectionId}`);
  }
  if (section.candidates.length === 1) {
    throw new Error(`Cannot remove the last audition candidate in section ${sectionId}`);
  }

  return auditionManifestSchema.parse({
    ...manifest,
    updated_at: now,
    sections: manifest.sections.map((candidate) => candidate.id === sectionId
      ? {
          ...candidate,
          winner_candidate_id: candidate.winner_candidate_id === candidateId
            ? null
            : candidate.winner_candidate_id,
          candidates: candidate.candidates.filter((item) => item.id !== candidateId),
        }
      : candidate),
  });
}

export function auditionPlaybackQueue(section: AuditionSection, startCandidateId?: string): string[] {
  const ids = section.candidates.map((candidate) => candidate.id);
  if (!startCandidateId) return ids;
  const startIndex = ids.indexOf(startCandidateId);
  return startIndex < 0 ? ids : ids.slice(startIndex);
}
