import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  COVERAGE_PLATFORMS,
  COVERAGE_STAGES,
  COVERAGE_STATUSES,
  SOURCE_FORMAT_CLASSES,
  classifySourceFormat,
  coverageFor,
  sourceFormatTraits,
} from "./source-format-coverage";

const root = process.cwd();
const packageScripts = Object.keys(JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).scripts ?? {});

/** Recipes that analyse media rather than prepare a source for playback, render or export. */
const ANALYSIS_RECIPES: Record<string, string> = {
  "binary-alpha-footprint-v1": "Alpha footprint analysis of an already prepared source.",
  "mono-pcm16-max-2000-v1": "Audio waveform peaks.",
  "video-descriptions-v1": "Searchable content descriptions.",
};

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

test("every exported preparation recipe is covered by a stage", () => {
  const covered = new Set(COVERAGE_STAGES.flatMap((stage) => stage.recipes));
  const missing: string[] = [];
  for (const file of sourceFiles(path.join(root, "src/lib"))) {
    for (const match of fs.readFileSync(file, "utf8").matchAll(/export const [A-Z_]*RECIPE[A-Z_]* = ["'`]([^"'`]+)["'`]/g)) {
      const recipe = match[1]!;
      if (!covered.has(recipe) && !ANALYSIS_RECIPES[recipe]) missing.push(`${recipe} (${path.relative(root, file)})`);
    }
  }
  assert.deepEqual(missing, [], "Add these recipes to a stage in source-format-coverage.ts, or to ANALYSIS_RECIPES with a reason.");
});

test("every stage states coverage for every format class on every platform", () => {
  const ids = new Set<string>();
  for (const stage of COVERAGE_STAGES) {
    assert.ok(!ids.has(stage.id), `duplicate stage ${stage.id}`);
    ids.add(stage.id);
    for (const owner of stage.owners) assert.ok(fs.existsSync(path.join(root, owner)), `${stage.id}: owner ${owner} does not exist`);
    for (const format of SOURCE_FORMAT_CLASSES) {
      for (const platform of COVERAGE_PLATFORMS) {
        const entry = coverageFor(stage, format.id, platform);
        assert.ok(entry, `${stage.id}: no ${platform} status for ${format.id}`);
        assert.ok(COVERAGE_STATUSES.includes(entry.status), `${stage.id}/${format.id}/${platform}: unknown status ${entry.status}`);
      }
    }
  }
});

test("claims of support name evidence that exists", () => {
  for (const stage of COVERAGE_STAGES) {
    for (const format of SOURCE_FORMAT_CLASSES) {
      for (const platform of COVERAGE_PLATFORMS) {
        const entry = coverageFor(stage, format.id, platform)!;
        const where = `${stage.id}/${format.id}/${platform}`;
        if (entry.status === "supported" || entry.status === "fallback") {
          assert.ok(entry.evidence?.length, `${where}: ${entry.status} needs evidence`);
        }
        for (const evidence of entry.evidence ?? []) {
          const script = evidence.match(/^pnpm (\S+)$/)?.[1];
          if (script) assert.ok(packageScripts.includes(script), `${where}: no package script ${script}`);
          else assert.ok(fs.existsSync(path.join(root, evidence)), `${where}: evidence ${evidence} does not exist`);
        }
        if (platform !== "macos" && entry.status === "supported") {
          assert.ok(entry.windows_receipt, `${where}: Windows support needs a windows-compatibility receipt`);
        }
      }
    }
  }
});

test("classifies the footage phones record", () => {
  assert.equal(classifySourceFormat({ codec_name: "hevc", pixel_format: "yuv420p10le", color_transfer: "arib-std-b67", color_primaries: "bt2020" }), "hlg-hevc-10bit");
  assert.equal(classifySourceFormat({ codec_name: "hevc", pixel_format: "yuv420p10le", color_transfer: "smpte2084", color_primaries: "bt2020" }), "pq-hevc-10bit");
  assert.equal(classifySourceFormat({ codec_name: "hevc", color_transfer: "smpte2084", hdr10_plus: true }), "pq-hdr10plus");
  assert.equal(classifySourceFormat({ codec_name: "h264", pixel_format: "yuvj420p", color_transfer: "bt709" }), "sdr-full-range");
  assert.equal(classifySourceFormat({ codec_name: "h264", color_primaries: "smpte170m", height: 480 }), "sdr-601-sd");
  assert.equal(classifySourceFormat({ codec_name: "hevc", pixel_format: "yuv420p", color_transfer: "bt709", height: 1080 }), "sdr-hevc-709");
  assert.equal(classifySourceFormat({ codec_name: "h264", pixel_format: "yuv420p", height: 1920 }), "sdr-h264-709");
  assert.deepEqual(sourceFormatTraits({ codec_name: "h264", height: 1920, variable_frame_rate: true, rotation_degrees: -90 }), ["sdr-h264-709", "variable-frame-rate", "rotation-metadata"]);
});
