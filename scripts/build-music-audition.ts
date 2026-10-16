// Builds a music-bed audition: the SAME picture + narration passage repeated
// once per candidate track, with only the bed changing.
//
// A music bed under narration is a sound decision that depends on picture timing
// (timeline-auditions §2), so this is deliberately NOT an audio-only slate: each
// candidate carries the exact video window, the exact VO segments, the exact
// captions, and the exact overlays, so the judgment is "does this bed serve THIS
// passage" rather than "do I like this track".
//
// Every excerpt is loudness-normalised to one target before mounting, so the
// track — not its mastering level — drives the choice.
//
// Run with the Cover Thumbnail Test defaults:
//   pnpm exec tsx scripts/build-music-audition.ts
//
// Or point the reusable builder at another narration-led project:
//   pnpm exec tsx scripts/build-music-audition.ts \
//     --source <project> --audition <project> --from 45.6 --to 64.9 \
//     --candidate-keys A,B,D --bed-lufs -36.8 \
//     --title "Tutorial — music bed audition" \
//     --script-text "Shared narration passage" \
//     --thumbnail-source /absolute/path/to/render.mp4 --thumbnail-at 54

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import type { TimelineElement } from "../src/components/studio/timeline/types";
import { writeAuditionManifest } from "../src/lib/local-store/auditions";
import { projectDir, projectMediaDir } from "../src/lib/local-store/paths";
import { newId, newRowTimestamps, readTimeline, writeMetadata, writeTimeline } from "../src/lib/local-store/store";

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const SOURCE_PROJECT = argValue("--source") ?? "tutorial-cover-thumbnail-test-short";
const AUDITION = argValue("--audition") ?? "tutorial-cover-thumbnail-music-audition-2026-07-22";
const FPS = 30;
const q = (s: number) => Math.round(s * FPS) / FPS;

// The representative passage (music-direction §7: one 10–15s section containing
// voice, a visual cut, and a story turn). 19.10–33.10 carries the 1.909x ramp
// cut, three narration lines, and two cover-trace payoffs.
const FROM = Number(argValue("--from") ?? 19.1);
const TO = Number(argValue("--to") ?? 33.1);
const LEN = q(TO - FROM);
const GAP = 0.5;                    // black separator between candidates
const BED_LUFS = Number(argValue("--bed-lufs") ?? -33);
const PROJECT_TITLE = argValue("--title") ?? "Cover Thumbnail Test — music bed audition";
const SCRIPT_TEXT = argValue("--script-text")
  ?? "Pick the exact genre your readers shop. / Take a look at the covers readers already trust. / Shuffle to see more covers and where yours lands.";
const THUMBNAIL_SOURCE = argValue("--thumbnail-source");
const THUMBNAIL_AT = Number(argValue("--thumbnail-at") ?? 12.5);

const ALL_CANDIDATES = [
  { key: "A", id: "fma_yorkville_1000_handz", file: "fma-yorkville-1000-handz-cc-by.mp3", at: 24,
    label: "A · Yorkville", note: "Least speech-band energy of the shortlist (-8.7 dB share). Modern creator explainer, low-pressure." },
  { key: "B", id: "fma_pay_it_forward_1000_handz", file: "fma-pay-it-forward-1000-handz-cc-by.mp3", at: 30,
    label: "B · Pay It Forward", note: "Warm, steady lo-fi (-6.1 dB share). Human warmth under a voice-led tutorial." },
  { key: "C", id: "fma_background_chill_music_for_creators", file: "fma-background-chill-music-for-creators-cc-by.mp3", at: 32,
    label: "C · Background Chill", note: "Catalogued explicitly as a long voice-led explainer bed (-5.7 dB share)." },
  { key: "D", id: "fma_open_window_1000_handz", file: "fma-open-window-1000-handz-cc-by.mp3", at: 26,
    label: "D · Open Window", note: "Airy, reflective, optimistic (-5.6 dB share). Calm teaching register." },
] as const;
const requestedCandidateKeys = new Set(
  (argValue("--candidate-keys") ?? "A,B,C,D").split(",").map((value) => value.trim()).filter(Boolean),
);
const CANDIDATES = ALL_CANDIDATES.filter((candidate) => requestedCandidateKeys.has(candidate.key));
if (CANDIDATES.length < 2) {
  throw new Error("Choose at least two candidates with --candidate-keys");
}
if (!Number.isFinite(FROM) || !Number.isFinite(TO) || TO <= FROM) {
  throw new Error("--from and --to must define a positive source interval");
}
if (!Number.isFinite(BED_LUFS)) {
  throw new Error("--bed-lufs must be a number");
}

const mediaDir = projectMediaDir(AUDITION);
fs.mkdirSync(mediaDir, { recursive: true });
fs.mkdirSync(path.join(projectDir(AUDITION), "analysis"), { recursive: true });

// ── Level-matched excerpts ───────────────────────────────────────────────────
const catalogAudio = path.resolve("catalogs/music/audio/licensed");
for (const c of CANDIDATES) {
  const out = path.join(mediaDir, `bed-${c.key}-${c.id}.mp3`);
  execFileSync("ffmpeg", [
    "-v", "error", "-ss", String(c.at), "-t", String(LEN + 1),
    "-i", path.join(catalogAudio, c.file),
    "-af", `loudnorm=I=${BED_LUFS}:TP=-2:LRA=11,afade=t=in:st=0:d=0.6,afade=t=out:st=${(LEN - 0.6).toFixed(2)}:d=0.6`,
    "-ar", "48000", "-b:a", "192k", out, "-y",
  ]);
}

// ── Phone-legible thumbnails ────────────────────────────────────────────────
// The picture is identical across candidates by design, so the thumbnail has to
// carry the track name or the shelf cards are indistinguishable at card size.
const thumbDir = path.join(mediaDir, "thumbs");
fs.mkdirSync(thumbDir, { recursive: true });
const walkthrough = THUMBNAIL_SOURCE
  ? path.resolve(THUMBNAIL_SOURCE)
  : path.join(projectMediaDir(SOURCE_PROJECT), "cover-thumbnail-walkthrough-v25b-25fps-source.mp4");
for (const c of CANDIDATES) {
  execFileSync("ffmpeg", [
    "-v", "error", "-ss", String(THUMBNAIL_AT), "-i", walkthrough, "-frames:v", "1",
    "-vf", `scale=360:-1,drawbox=y=ih-70:w=iw:h=70:color=black@0.82:t=fill,`
      + `drawtext=text='${c.label.replace(/'/g, "")}':fontcolor=white:fontsize=30:x=14:y=h-52`,
    path.join(thumbDir, `${c.key}.jpg`), "-y",
  ]);
}

// ── Copy the passage's elements, once per candidate ──────────────────────────
const source = readTimeline(SOURCE_PROJECT);
const inPassage = source.elements.filter((row) =>
  row.removed_at == null
  && row.timeline_start + row.duration > FROM + 0.001
  && row.timeline_start < TO - 0.001);

const fresh: TimelineElement[] = [];
const candidateIds: Record<string, { clip: string; label: string }> = {};

CANDIDATES.forEach((c, index) => {
  const base = q(index * (LEN + GAP));
  let anchorClipId = "";

  for (const row of inPassage) {
    const clone = JSON.parse(JSON.stringify(row)) as TimelineElement;
    clone.id = newId();
    clone.project_id = AUDITION;
    // Clamp to the passage and rebase to this candidate's slot.
    const start = Math.max(row.timeline_start, FROM);
    const end = Math.min(row.timeline_start + row.duration, TO);
    clone.trim_start = row.type === "video_clip" || row.type === "vo_segment" || row.type === "vo_full"
      ? Number((row.trim_start + (start - row.timeline_start)).toFixed(3))
      : row.trim_start;
    clone.timeline_start = q(base + (start - FROM));
    clone.duration = q(end - start);
    if (row.type === "video_clip") {
      const sd = (row.props as Record<string, unknown>).source_duration_seconds as number | undefined;
      if (sd != null) clone.trim_end = Number(Math.max(0, sd - clone.trim_start - clone.duration * (row.playback_rate || 1)).toFixed(3));
    }
    Object.assign(clone, newRowTimestamps());
    if (row.type === "video_clip" && !anchorClipId) anchorClipId = clone.id;
    fresh.push(clone);
  }

  // The bed under this candidate's passage.
  fresh.push({
    id: newId(), project_id: AUDITION, type: "music",
    source_url: `/api/projects/${AUDITION}/media/bed-${c.key}-${c.id}.mp3`,
    props: { music_track_id: c.id, audition_candidate_key: c.key, bed_target_lufs: BED_LUFS, catalog_source_status: "licensed" },
    beat_id: null, voice_clip_id: null, character_id: null,
    timeline_start: base, duration: LEN,
    lane_key: "music_0", lane_index: 0,
    trim_start: 0, trim_end: null, volume: 1, fade_in: 0, fade_out: 0,
    playback_rate: 1, position_locked: false, removed_at: null, removed_reason: null,
    ...newRowTimestamps(),
  } as TimelineElement);

  // Editorial label over the candidate.
  const labelId = newId();
  fresh.push({
    id: labelId, project_id: AUDITION, type: "caption_text", source_url: null,
    props: {
      text: c.label, positionPreset: "top_center", fontPreset: "teko", styleVariant: "black_card",
      fontSizePx: 64, maxWidth: 0.9, absX: 0.05, absY: 0.06, offsetX: 0, offsetY: 0,
      textAlign: "center", textColor: null, animationIn: "none", animationOut: "none",
      animationInDuration: 0, animationOutDuration: 0, audition_label_for: c.key,
    },
    beat_id: null, voice_clip_id: null, character_id: null,
    timeline_start: base, duration: LEN,
    lane_key: "captions_1", lane_index: 1,
    trim_start: 0, trim_end: null, volume: 0, fade_in: 0, fade_out: 0,
    playback_rate: 1, position_locked: false, removed_at: null, removed_reason: null,
    ...newRowTimestamps(),
  } as TimelineElement);

  candidateIds[c.key] = { clip: anchorClipId, label: labelId };
});

writeTimeline(AUDITION, { schema_version: 1, elements: fresh, transitions: [] } as never, "build_music_bed_audition");
writeMetadata(AUDITION, {
  lane_order_keys: [], lane_defaults: {}, muted_lane_keys: [],
  output_aspect_ratio: "9:16", delivery_target: "reels", caption_safe_area_mode: "organic",
  title: PROJECT_TITLE,
} as never, "configure_music_bed_audition");

writeAuditionManifest(AUDITION, {
  schema_version: 1,
  project_id: AUDITION,
  updated_at: new Date().toISOString(),
  source_note:
    `Music-bed candidates for ${SOURCE_PROJECT}. CONTROLS HELD FIXED: every candidate carries the `
    + `identical picture, narration, captions and overlays from ${FROM}s-${TO}s of ${SOURCE_PROJECT} — a passage `
    + `chosen to contain spoken instruction, a visual transition, and a product payoff. Each excerpt is `
    + `loudness-normalised to ${BED_LUFS} LUFS `
    + `with matched 0.6s in/out fades, and NO ducking is applied, so beds are judged raw against the voice and the `
    + `track drives the choice rather than its mastering level. VARIABLE: the track only. All selected tracks are licensed `
    + `CC-BY catalog tracks. The shortlist uses measured speech-band (300-3400 Hz) share rather than catalog `
    + `mood tags: ${CANDIDATES.map((candidate) => `${candidate.key} ${candidate.note}`).join(" | ")}`,
  sections: [{
    id: "music-bed",
    order: 0,
    label: "Music bed — which track serves the teaching passage",
    script_text: SCRIPT_TEXT,
    winner_candidate_id: null,
    candidates: CANDIDATES.map((c) => ({
      id: c.key,
      take_id: c.id,
      timeline_element_id: candidateIds[c.key].clip,
      label_element_id: candidateIds[c.key].label,
      source_url: `/api/projects/${AUDITION}/media/bed-${c.key}-${c.id}.mp3`,
      thumbnail_url: `/api/projects/${AUDITION}/media/thumbs/${c.key}.jpg`,
      source_start_seconds: c.at,
      source_end_seconds: c.at + LEN,
      duration_seconds: LEN,
      pass_label: `bed @ ${BED_LUFS} LUFS, no ducking`,
      source_label: c.note,
    })),
  }],
} as never);

console.log(`${CANDIDATES.length} candidates · ${LEN}s each · ${fresh.length} elements`);
console.log(`open http://127.0.0.1:3123/p/${AUDITION}`);
