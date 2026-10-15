import { z } from "zod";

export const MUSIC_PLATFORMS = ["instagram", "tiktok", "youtube", "other"] as const;
export const MUSIC_SOURCE_STATUSES = [
  "owned",
  "licensed",
  "platform_native",
  "reference_only",
  "unknown",
] as const;

const idSchema = z.string().trim().min(1).max(128).regex(/^[a-z0-9][a-z0-9_-]*$/);
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const musicProvenanceSchema = z.object({
  source_provider: z.string().trim().min(1).max(240),
  source_url: z.string().url(),
  source_file: z.string().trim().min(1).max(500).optional(),
  license_name: z.string().trim().min(1).max(240),
  license_url: z.string().url().optional(),
  attribution_required: z.boolean(),
  attribution_text: z.string().trim().min(1).max(1200).optional(),
  acquired_at: z.string().date(),
  sha256: sha256Schema,
  import_receipt: z.string().trim().min(1).max(500).optional(),
}).superRefine((value, context) => {
  if (value.attribution_required && !value.attribution_text) {
    context.addIssue({
      code: "custom",
      path: ["attribution_text"],
      message: "Attribution text is required when attribution_required=true",
    });
  }
});

export const musicAnalysisSchema = z.object({
  annotation_version: z.string().trim().min(1).max(80).optional(),
  detected_tempo_bpm: z.number().finite().gt(0).max(400).optional(),
  tempo_reliable: z.boolean().optional(),
  alternative_tempo_bpm: z.number().finite().gt(0).max(400).optional(),
  energy_curve: z.string().trim().min(1).max(240).optional(),
  notes: z.array(z.string().trim().min(1).max(800)).max(64).default([]),
});

export const musicCueSchema = z.object({
  id: idSchema,
  label: z.string().trim().min(1).max(120),
  start_seconds: z.number().finite().min(0),
  end_seconds: z.number().finite().gt(0),
  role: z.enum(["intro", "bed", "build", "hook", "reveal", "outro", "custom"]),
  use_when: z.array(z.string().trim().min(1).max(240)).default([]),
  avoid_when: z.array(z.string().trim().min(1).max(240)).default([]),
  notes: z.string().trim().max(1000).optional(),
}).superRefine((cue, context) => {
  if (cue.end_seconds <= cue.start_seconds) {
    context.addIssue({
      code: "custom",
      path: ["end_seconds"],
      message: "Cue end_seconds must be greater than start_seconds",
    });
  }
});

export const musicVersionSchema = z.object({
  id: idSchema,
  label: z.string().trim().min(1).max(120),
  file: z.string().trim().min(1).max(500).optional(),
  source_status: z.enum(MUSIC_SOURCE_STATUSES).default("unknown"),
  delivery_mode: z.enum(["embedded", "platform_native"]).default("embedded"),
  platforms: z.array(z.enum(MUSIC_PLATFORMS)).default([]),
  platform_sound_url: z.string().url().optional(),
  platform_sound_id: z.string().trim().min(1).max(240).optional(),
  duration_seconds: z.number().finite().gt(0).optional(),
  notes: z.string().trim().max(1000).optional(),
  provenance: musicProvenanceSchema.optional(),
  cues: z.array(musicCueSchema).default([]),
});

export const musicTrackSchema = z.object({
  id: idSchema,
  /** Set only on entries merged from the creator's profile library; never stored in a tracked catalog. */
  personal: z.boolean().optional(),
  title: z.string().trim().min(1).max(240),
  artist: z.string().trim().max(240).optional(),
  description: z.string().trim().max(1200).optional(),
  moods: z.array(z.string().trim().min(1).max(80)).default([]),
  energy: z.enum(["low", "medium", "high", "dynamic"]).optional(),
  tempo_bpm: z.number().finite().gt(0).max(400).optional(),
  textures: z.array(z.string().trim().min(1).max(80)).default([]),
  vocals: z.enum(["instrumental", "vocal", "mixed", "unknown"]).default("unknown"),
  good_for: z.array(z.string().trim().min(1).max(240)).default([]),
  avoid_for: z.array(z.string().trim().min(1).max(240)).default([]),
  analysis: musicAnalysisSchema.optional(),
  default_version_id: idSchema.optional(),
  versions: z.array(musicVersionSchema).default([]),
}).superRefine((track, context) => {
  const versionIds = new Set<string>();
  for (const [index, version] of track.versions.entries()) {
    if (versionIds.has(version.id)) {
      context.addIssue({ code: "custom", path: ["versions", index, "id"], message: "Version ids must be unique" });
    }
    versionIds.add(version.id);
    const cueIds = new Set<string>();
    for (const [cueIndex, cue] of version.cues.entries()) {
      if (cueIds.has(cue.id)) {
        context.addIssue({ code: "custom", path: ["versions", index, "cues", cueIndex, "id"], message: "Cue ids must be unique within a version" });
      }
      cueIds.add(cue.id);
    }
  }
  if (track.default_version_id && !versionIds.has(track.default_version_id)) {
    context.addIssue({ code: "custom", path: ["default_version_id"], message: "default_version_id must reference a version" });
  }
});

export const musicCatalogSchema = z.object({
  schema_version: z.literal(1),
  tracks: z.array(musicTrackSchema).default([]),
}).superRefine((catalog, context) => {
  const trackIds = new Set<string>();
  for (const [index, track] of catalog.tracks.entries()) {
    if (trackIds.has(track.id)) {
      context.addIssue({ code: "custom", path: ["tracks", index, "id"], message: "Track ids must be unique" });
    }
    trackIds.add(track.id);
  }
});

export type MusicCatalog = z.infer<typeof musicCatalogSchema>;
export type MusicCatalogTrack = z.infer<typeof musicTrackSchema>;
export type MusicCatalogVersion = z.infer<typeof musicVersionSchema>;
export type MusicCatalogCue = z.infer<typeof musicCueSchema>;
export type MusicPlatform = (typeof MUSIC_PLATFORMS)[number];

export function platformForDeliveryTarget(deliveryTarget: string | undefined): MusicPlatform | null {
  if (deliveryTarget === "reels" || deliveryTarget === "feed") return "instagram";
  if (deliveryTarget === "shorts") return "youtube";
  if (deliveryTarget === "tiktok" || deliveryTarget === "youtube" || deliveryTarget === "instagram") return deliveryTarget;
  return null;
}

export function resolveMusicVersion(track: MusicCatalogTrack, platform: MusicPlatform | null) {
  if (platform) {
    const platformMatch = track.versions.find((version) => version.platforms.includes(platform));
    if (platformMatch) return platformMatch;
  }
  return track.versions.find((version) => version.id === track.default_version_id)
    ?? track.versions[0]
    ?? null;
}
