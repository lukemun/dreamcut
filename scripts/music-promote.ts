/**
 * Promote an analyzed audio file into the music catalog.
 *
 * Reads the <name>.analysis.json sidecar written by music-analyze, attaches the
 * operator's editorial judgment, and upserts a schema-valid track into catalog.json.
 *
 *   pnpm music-promote <audio-file> --source-status licensed --vocals instrumental \
 *     [--id my_track] [--title "..."] [--artist "..."] [--energy dynamic] \
 *     [--moods "hopeful,warm"] [--good-for "Cover reveal"] [--confirm-tempo] [--dry-run]
 *
 * The analyzer proposes; a human decides. Three things it cannot know are required
 * here rather than guessed: source status, vocal presence, and whether the detected
 * tempo is at the right metrical level.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { musicCatalogSchema, type MusicCatalogTrack } from "../src/lib/music-catalog/schema";

const SOURCE_STATUSES = ["owned", "licensed", "platform_native", "reference_only", "unknown"] as const;
const VOCALS = ["instrumental", "vocal", "mixed", "unknown"] as const;
const ENERGIES = ["low", "medium", "high", "dynamic"] as const;

const argv = process.argv.slice(2);
const flag = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const has = (name: string) => argv.includes(`--${name}`);
const list = (name: string) =>
  (flag(name) ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const input = argv[0];
if (!input || input.startsWith("--")) {
  console.error("usage: pnpm music-promote <audio-file> --source-status <status> --vocals <vocals> [...]");
  process.exit(1);
}

const catalogDir = process.env.TIMELINE_MUSIC_CATALOG_DIR ?? path.join(__dirname, "..", "catalogs/music");
const catalogPath = path.join(catalogDir, "catalog.json");
const audioPath = path.isAbsolute(input) ? input : path.resolve(input);
const stem = audioPath.replace(/\.[^.]+$/, "");
const extractPath = `${stem}.extract.json`;
const derivePath = `${stem}.derive.json`;

if (!fs.existsSync(extractPath) || !fs.existsSync(derivePath)) {
  console.error(`Missing L1 extraction or L2 derivation for this track.\nRun: pnpm music-analyze "${input}"`);
  process.exit(1);
}

// L1 = measured facts (duration). L2 = rules over them (cues, likely tempo, energy shape).
// This step is L4: it attaches GUIDANCE, which needs a goal and therefore cannot come from either.
const extraction = JSON.parse(fs.readFileSync(extractPath, "utf8"));
const derived = JSON.parse(fs.readFileSync(derivePath, "utf8"));
const analysis = {
  duration_seconds: extraction.duration_seconds,
  status: derived.status,
  note: derived.note,
  tempo: { ...extraction.tempo, ...derived.tempo },
  energy: derived.energy,
  cue_candidates: derived.cue_candidates ?? [],
};

// An unusable analysis has no beat grid and no cues. Promoting it would put a track in
// the catalog that the Timeline Editor Agent cannot place against anything.
if (analysis.status === "unusable") {
  console.error(
    `${path.basename(audioPath)} analyzed as UNUSABLE (no trackable beat) and has no cues.\n` +
      `${analysis.note}\nNothing to promote.`,
  );
  process.exit(1);
}

// --- The three human gates. The analyzer cannot answer these; refuse to guess. ---

// Source status is declared by WHERE THE FILE SITS, not by a flag. A flag can be forgotten or
// copy-pasted from the last command; filing a track under reference/ is a deliberate act. The
// folder is the single place the rights fact is stated, so it cannot drift from the audio.
const STATUS_BY_FOLDER: Record<string, (typeof SOURCE_STATUSES)[number]> = {
  owned: "owned",
  licensed: "licensed",
  reference: "reference_only",
};

const audioRoot = path.join(catalogDir, "audio");
const relFromAudio = path.relative(audioRoot, audioPath);
const folder = relFromAudio.split(path.sep)[0];
const sourceStatus = STATUS_BY_FOLDER[folder];

if (!sourceStatus) {
  console.error(
    `${path.basename(audioPath)} is not filed under a status folder, so its rights status is undeclared.\n\n` +
      `Move it into the folder that says where it may be used:\n` +
      `  audio/owned/      you made it (AI-generated, recorded)   -> ships in a render\n` +
      `  audio/licensed/   bought, CC-BY, or otherwise cleared    -> ships in a render\n` +
      `  audio/reference/  trending audio you cut against         -> never rendered; sound applied in-app\n\n` +
      `Nothing can infer this from the audio, and a wrong value propagates into every edit that uses the track.`,
  );
  process.exit(1);
}

const vocals = flag("vocals");
if (!vocals || !VOCALS.includes(vocals as never)) {
  console.error(
    `--vocals is required and must be one of: ${VOCALS.join(" | ")}\n` +
      `The analyzer deliberately does not estimate this (its spectral heuristic called known` +
      ` instrumentals "vocal"). Listen to the track and say. It drives narration fit.`,
  );
  process.exit(1);
}

const proposedBpm: number = analysis.tempo?.detected_bpm ?? 0;
const candidates: number[] = analysis.tempo?.candidates_ranked_bpm ?? analysis.tempo?.candidates_bpm ?? [];
const likelyBpm: number | undefined = analysis.tempo?.likely_bpm ?? undefined;

// L4 guidance. These are "shoulds", so they are authored HERE, at the step that has a goal — never
// by the extractor or the deriver, whose output must stay descriptive and reusable under any goal.
const ROLE_GUIDANCE: Record<string, string[]> = {
  bed: ["Narration needs room while the track keeps moving"],
  build: ["Tension should rise into a turn"],
  hook: ["A reveal or payoff should land on the downbeat"],
  reveal: ["A reveal or payoff should land on the downbeat"],
};

// --confirm-tempo takes the BPM you actually heard, not a bare "yes". Beat trackers lock onto
// double- or half-time routinely (Runaway's real ~87 BPM detected as 172.3), so a flag that just
// blessed the detected value would rubber-stamp the wrong grid -- the exact error it exists to
// catch. Naming the number is the confirmation.
const confirmedTempoRaw = flag("confirm-tempo");
if (argv.includes("--confirm-tempo") && (!confirmedTempoRaw || Number.isNaN(Number(confirmedTempoRaw)))) {
  console.error(
    `--confirm-tempo needs the BPM you heard, e.g. --confirm-tempo ${likelyBpm ?? candidates[0] ?? 100}\n` +
      `Detected ${proposedBpm} BPM; most plausible is ${likelyBpm ?? "?"}. Candidates: ${candidates.join(" / ")}\n\n` +
      `Do not count it — hear it:  pnpm music-tempo-audition "${input}"\n` +
      `That lays a click at each candidate over the track. The right one stays on the beat; a wrong\n` +
      `octave drifts.`,
  );
  process.exit(1);
}
const confirmedTempo = confirmedTempoRaw ? Number(confirmedTempoRaw) : undefined;
const tempoConfirmed = confirmedTempo !== undefined;
if (tempoConfirmed && !candidates.some((c) => Math.abs(c - confirmedTempo) < 1)) {
  console.warn(
    `Note: ${confirmedTempo} BPM is not one of the detected metrical candidates (${candidates.join(" / ")}).` +
      ` Recording it anyway -- your ear beats the detector.\n`,
  );
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 128);

const title = flag("title") ?? path.basename(audioPath).replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
const id = flag("id") ?? slug(title);
const energy = flag("energy") ?? (analysis.energy?.shape === "dynamic" ? "dynamic" : undefined);
if (energy && !ENERGIES.includes(energy as never)) {
  console.error(`--energy must be one of: ${ENERGIES.join(" | ")}`);
  process.exit(1);
}

// A reference-only track is one we may cut against but may not ship. It carries TWO versions:
// the local file (a timing reference) and the platform sound that gets applied in-app at post
// time, where the platform's licence actually attaches. Recording the platform sound here is
// what makes the swap possible later -- without it the edit lines up against a track nobody
// can legally deliver, and the post has nothing to replace it with.
const platformSoundUrl = flag("platform-sound-url");
const platformSoundId = flag("platform-sound-id");
const platforms = list("platforms") as MusicCatalogTrack["versions"][number]["platforms"];

// Warn, don't block. You only learn the platform sound id when you pick the sound in-app, which
// happens after the edit -- so demanding it at ingest would gate a fact that does not exist yet.
// The hard guarantee lives at render time (reference_only_music_in_render), where the harm is.
const missingPlatformSound = sourceStatus === "reference_only" && !platformSoundUrl && !platformSoundId;

const sourceProvider = flag("source-provider");
const sourceUrl = flag("source-url");
const licenseName = flag("license-name");
const acquiredAt = flag("acquired-at");
const provenanceRequested = Boolean(sourceProvider || sourceUrl || licenseName || acquiredAt);
if (provenanceRequested && (!sourceProvider || !sourceUrl || !licenseName || !acquiredAt)) {
  console.error(
    "Provenance is incomplete. Supply --source-provider, --source-url, --license-name, and --acquired-at together.",
  );
  process.exit(1);
}
const provenance = provenanceRequested
  ? {
      source_provider: sourceProvider!,
      source_url: sourceUrl!,
      source_file: flag("source-file") ?? path.basename(audioPath),
      license_name: licenseName!,
      license_url: flag("license-url"),
      attribution_required: has("attribution-required"),
      attribution_text: flag("attribution-text"),
      acquired_at: acquiredAt!,
      sha256: createHash("sha256").update(fs.readFileSync(audioPath)).digest("hex"),
      import_receipt: flag("import-receipt"),
    }
  : undefined;

const platformVersion =
  platformSoundUrl || platformSoundId
    ? [
        {
          id: "platform",
          label: "Platform sound (applied in-app at post time)",
          source_status: "platform_native" as const,
          delivery_mode: "platform_native" as const,
          platforms: platforms.length ? platforms : (["tiktok", "instagram"] as never),
          platform_sound_url: platformSoundUrl,
          platform_sound_id: platformSoundId,
          notes: "Apply this sound in-app when posting. The local version is a timing reference only.",
          cues: [],
        },
      ]
    : [];

const track: MusicCatalogTrack = {
  id,
  title,
  artist: flag("artist"),
  description: flag("description"),
  moods: list("moods"),
  energy: energy as MusicCatalogTrack["energy"],
  // Only carry tempo into the catalog once a human has confirmed the metrical level.
  // A half- or double-time BPM silently produces a beat grid that is wrong everywhere.
  tempo_bpm: tempoConfirmed ? Math.round(confirmedTempo * 100) / 100 : undefined,
  textures: list("textures"),
  vocals: vocals as MusicCatalogTrack["vocals"],
  good_for: list("good-for"),
  avoid_for: list("avoid-for"),
  analysis: {
    annotation_version: `${extraction.extract_version ?? "extract-unknown"}+${derived.derive_version ?? "derive-unknown"}`,
    detected_tempo_bpm: proposedBpm || undefined,
    tempo_reliable: tempoConfirmed,
    alternative_tempo_bpm:
      likelyBpm && Math.abs(likelyBpm - proposedBpm) >= 1 ? likelyBpm : undefined,
    energy_curve: analysis.energy?.shape,
    notes: [
      tempoConfirmed
        ? `Tempo confirmed by ear at ${confirmedTempo} BPM.`
        : `Tempo remains unconfirmed; candidates: ${candidates.join(" / ")}.`,
      "Cue windows are analyzer proposals and have not received a listening review.",
    ],
  },
  default_version_id: "local",
  versions: [
    {
      id: "local",
      label: "Local edit reference",
      file: path.relative(path.join(catalogDir, "audio"), audioPath),
      source_status: sourceStatus as never,
      delivery_mode: "embedded",
      platforms: [],
      duration_seconds: analysis.duration_seconds,
      provenance,
      notes: tempoConfirmed
        ? undefined
        : `Tempo ${proposedBpm} BPM is UNCONFIRMED (candidates ${candidates.join(" / ")}). Confirm the metrical level before cutting to a beat grid.`,
      cues: (analysis.cue_candidates ?? []).map((cue: Record<string, unknown>) => ({
        ...cue,
        use_when: ROLE_GUIDANCE[String(cue.role)] ?? [],
      })),
    },
  ],
};

// Upsert. The catalog is shared, so replace this track by id and leave every other row alone.
const existing = fs.existsSync(catalogPath)
  ? JSON.parse(fs.readFileSync(catalogPath, "utf8"))
  : { schema_version: 1, tracks: [] };

const tracks: MusicCatalogTrack[] = existing.tracks ?? [];
const at = tracks.findIndex((t) => t.id === id);
const replaced = at >= 0;
if (replaced) tracks[at] = track;
else tracks.push(track);

const next = { schema_version: 1 as const, tracks };

// Validate the WHOLE catalog, not just the new track: a valid track can still collide with
// an existing id, and a catalog the schema rejects breaks every reader of it.
const parsed = musicCatalogSchema.safeParse(next);
if (!parsed.success) {
  console.error("Refusing to write — the resulting catalog fails musicCatalogSchema:\n");
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

const json = `${JSON.stringify(parsed.data, null, 2)}\n`;

if (has("dry-run")) {
  console.log(json);
  console.log(`(dry run — would ${replaced ? "REPLACE" : "add"} track "${id}" in ${catalogPath})`);
  process.exit(0);
}

fs.writeFileSync(catalogPath, json);

console.log(
  `${replaced ? "Replaced" : "Added"} "${id}" (${track.versions[0].cues.length} cues) as ${sourceStatus} in ${path.relative(process.cwd(), catalogPath)}`,
);
if (missingPlatformSound) {
  console.log(
    `\nNo platform sound recorded yet. This track may be cut against but never rendered —\n` +
      `the render gate (reference_only_music_in_render) will block it, by design.\n` +
      `When you pick the sound in-app, re-run with --platform-sound-url / --platform-sound-id.`,
  );
}
if (!tempoConfirmed) {
  console.log(
    `\nTempo left UNSET: ${proposedBpm} BPM is unconfirmed (candidates ${candidates.join(" / ")}).\n` +
      `Listen, decide the metrical level, then re-run with --confirm-tempo to record it.`,
  );
}
console.log(`\nThe Timeline Editor Agent resolves this via resolveMusicVersion(). Listen before trusting any cue.`);
