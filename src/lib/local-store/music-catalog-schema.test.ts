import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  musicCatalogSchema,
  platformForDeliveryTarget,
  resolveMusicVersion,
} from "@/lib/music-catalog/schema";

test("an empty music catalog is valid", () => {
  assert.deepEqual(
    musicCatalogSchema.parse({ schema_version: 1, tracks: [] }),
    { schema_version: 1, tracks: [] },
  );
});

test("the documented catalog example stays schema-valid", () => {
  const example = JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), "music-catalog/catalog.example.json"), "utf8"),
  );
  assert.equal(musicCatalogSchema.safeParse(example).success, true);
});

test("catalog versions and cues are validated and resolved for delivery targets", () => {
  const catalog = musicCatalogSchema.parse({
    schema_version: 1,
    tracks: [{
      id: "track_one",
      title: "Track One",
      default_version_id: "reference",
      versions: [
        { id: "reference", label: "Reference", cues: [] },
        {
          id: "reels",
          label: "Instagram Reels",
          platforms: ["instagram"],
          source_status: "platform_native",
          delivery_mode: "platform_native",
          cues: [{
            id: "hook",
            label: "Hook",
            start_seconds: 10,
            end_seconds: 18,
            role: "hook",
            use_when: ["The opening needs immediate recognition"],
          }],
        },
      ],
    }],
  });

  assert.equal(platformForDeliveryTarget("reels"), "instagram");
  assert.equal(platformForDeliveryTarget("shorts"), "youtube");
  assert.equal(resolveMusicVersion(catalog.tracks[0], "instagram")?.id, "reels");
  assert.equal(resolveMusicVersion(catalog.tracks[0], null)?.id, "reference");
});

test("cue windows must have positive length", () => {
  const parsed = musicCatalogSchema.safeParse({
    schema_version: 1,
    tracks: [{
      id: "bad_track",
      title: "Bad Track",
      versions: [{
        id: "main",
        label: "Main",
        cues: [{
          id: "bad_cue",
          label: "Bad cue",
          start_seconds: 12,
          end_seconds: 8,
          role: "custom",
        }],
      }],
    }],
  });
  assert.equal(parsed.success, false);
});

test("catalog preserves source-addressed rights and analysis annotations", () => {
  const parsed = musicCatalogSchema.parse({
    schema_version: 1,
    tracks: [{
      id: "annotated_track",
      title: "Annotated Track",
      analysis: {
        annotation_version: "assembled-music-bundle-v1",
        detected_tempo_bpm: 172,
        tempo_reliable: false,
        alternative_tempo_bpm: 86,
        energy_curve: "calm→build→drop",
      },
      versions: [{
        id: "local",
        label: "Full recording",
        provenance: {
          source_provider: "Composer site",
          source_url: "https://example.com/track.mp3",
          license_name: "CC BY 4.0",
          license_url: "https://creativecommons.org/licenses/by/4.0/",
          attribution_required: true,
          attribution_text: "Music by Example Artist",
          acquired_at: "2026-09-17",
          sha256: "a".repeat(64),
        },
      }],
    }],
  });
  assert.equal(parsed.tracks[0].analysis?.tempo_reliable, false);
  assert.equal(parsed.tracks[0].versions[0].provenance?.attribution_required, true);
});

test("required attribution cannot omit its delivery text", () => {
  const parsed = musicCatalogSchema.safeParse({
    schema_version: 1,
    tracks: [{
      id: "missing_credit",
      title: "Missing Credit",
      versions: [{
        id: "local",
        label: "Full recording",
        provenance: {
          source_provider: "Composer site",
          source_url: "https://example.com/track.mp3",
          license_name: "CC BY 4.0",
          attribution_required: true,
          acquired_at: "2026-09-17",
          sha256: "b".repeat(64),
        },
      }],
    }],
  });
  assert.equal(parsed.success, false);
});
