import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { motionSubjectFromSourceUrl } from "@/lib/hyperframes/motion-media";
import { sfxCatalogSchema } from "@/lib/sfx-catalog/schema";

import {
  missingEntryProblem,
  parseCompositionSourceSpec,
  safeCompositionRelativePath,
  writeCompositionSource,
} from "./hyperframes-candidates";
import { readMotionAudit, summarizeMotionAudit } from "./motion-audit";
import { readMotionJob, startMotionJob } from "./motion-jobs";
import { motionPlacementsInOption, parseMotionRating, recordMotionProposalReview, withMotionControls } from "./motion-proposal-review";
import { addSynthSoundToLibrary } from "./sfx-library-intake";
import type { SynthSoundReceipt } from "./synth-sounds";

function withProject(run: (projectId: string, root: string) => Promise<void> | void) {
  return async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "motion-flow-"));
    const previous = { projects: process.env.TIMELINE_PROJECTS_DIR, sfx: process.env.TIMELINE_SFX_CATALOG_DIR, profile: process.env.DREAMCUT_PROFILE_DIR };
    process.env.TIMELINE_PROJECTS_DIR = path.join(root, "projects");
    process.env.TIMELINE_SFX_CATALOG_DIR = path.join(root, "catalogs/sfx");
    process.env.DREAMCUT_PROFILE_DIR = path.join(root, "profile");
    fs.mkdirSync(path.join(root, "projects", "demo", "media", "sources"), { recursive: true });
    try {
      await run("demo", root);
    } finally {
      for (const [key, value] of [["TIMELINE_PROJECTS_DIR", previous.projects], ["TIMELINE_SFX_CATALOG_DIR", previous.sfx], ["DREAMCUT_PROFILE_DIR", previous.profile]] as const) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      fs.rmSync(root, { recursive: true, force: true });
    }
  };
}

test("recognizes model-authored media by path, not by name", () => {
  assert.deepEqual(motionSubjectFromSourceUrl("/api/projects/demo/media/hyperframes/logo-sting/logo-sting.ab.webm"), { kind: "composition", id: "logo-sting" });
  assert.deepEqual(motionSubjectFromSourceUrl("media/sounds/whoosh/whoosh.12.wav"), { kind: "sound", id: "whoosh" });
  assert.equal(motionSubjectFromSourceUrl("/api/projects/demo/media/sources/hyperframes-logo.png"), null);
  assert.equal(motionSubjectFromSourceUrl("/api/projects/demo/media/hyperframes/logo-sting/nested/x.webm"), null);
});

test("composition specs reject unsafe paths and empty specs", () => {
  assert.throws(() => safeCompositionRelativePath("../escape.html", /\.html$/), /Unsupported/);
  assert.throws(() => safeCompositionRelativePath("node_modules/x.js", /\.js$/), /Unsupported/);
  assert.throws(() => safeCompositionRelativePath(".hidden.js", /\.js$/), /Unsupported/);
  assert.throws(() => parseCompositionSourceSpec({ files: [] }), /at least one/);
  assert.throws(() => parseCompositionSourceSpec({ files: [{ path: "index.html", text: "" }], assets: [{ media_path: "sources/a.png", as: "logo.png" }] }), /under assets/);
  assert.throws(() => parseCompositionSourceSpec({ files: [{ path: "index.html", text: "" }, { path: "./index.html", text: "" }] }), /Duplicate/);
});

test("writes agent sources and copies only project media into assets", withProject((projectId, root) => {
  fs.writeFileSync(path.join(root, "projects", projectId, "media", "sources", "logo.png"), "png");
  fs.writeFileSync(path.join(root, "outside.png"), "secret");
  const spec = parseCompositionSourceSpec({
    files: [{ path: "index.html", text: "<html></html>" }],
    assets: [{ media_path: "sources/logo.png", as: "assets/logo.png" }],
  });
  const directory = writeCompositionSource(projectId, "logo-sting", spec);
  assert.equal(fs.readFileSync(path.join(directory, "assets", "logo.png"), "utf8"), "png");
  assert.ok(fs.existsSync(path.join(directory, "hyperframes.json")));
  assert.throws(() => writeCompositionSource(projectId, "logo-sting", parseCompositionSourceSpec({
    files: [{ path: "index.html", text: "" }],
    assets: [{ media_path: "../../../outside.png", as: "assets/x.png" }],
  })), /inside this project's media|not found/);
}));

test("a new composition needs index.html; a revision sends only the files that changed", withProject((projectId, root) => {
  const onlyScript = parseCompositionSourceSpec({ files: [{ path: "engine.js", text: "window.v = 1;" }] });
  assert.match(missingEntryProblem(projectId, "flyin", onlyScript) ?? "", /index\.html/);
  assert.throws(() => writeCompositionSource(projectId, "flyin", onlyScript), /index\.html/);
  const directory = writeCompositionSource(projectId, "flyin", parseCompositionSourceSpec({
    files: [{ path: "index.html", text: "<html><script src=\"engine.js\"></script></html>" }, { path: "engine.js", text: "window.v = 0;" }],
  }));
  // Resending only the changed script was refused.
  assert.equal(missingEntryProblem(projectId, "flyin", onlyScript), null);
  writeCompositionSource(projectId, "flyin", onlyScript);
  assert.equal(fs.readFileSync(path.join(directory, "engine.js"), "utf8"), "window.v = 1;");
  assert.match(fs.readFileSync(path.join(directory, "index.html"), "utf8"), /engine\.js/);
  fs.writeFileSync(path.join(root, "projects", projectId, "media", "sources", "outlines.svg"), "<svg/>");
  const onlyAsset = parseCompositionSourceSpec({ assets: [{ media_path: "sources/outlines.svg", as: "assets/outlines.svg" }] });
  writeCompositionSource(projectId, "flyin", onlyAsset);
  assert.equal(fs.readFileSync(path.join(directory, "assets", "outlines.svg"), "utf8"), "<svg/>");
}));

test("ratings are optional whole numbers from 1 to 5", () => {
  assert.equal(parseMotionRating(undefined), null);
  assert.equal(parseMotionRating(4), 4);
  assert.throws(() => parseMotionRating(0), /1 to 5/);
  assert.throws(() => parseMotionRating(3.5), /1 to 5/);
});

test("approval records one rated review per item and a placement per element", withProject((projectId, root) => {
  const directory = path.join(root, "projects", projectId, "hyperframes", "logo-sting");
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "index.html"), "<html></html>");
  const operations = [
    { element_id: "mg-1", create_visual: { source_url: `/api/projects/${projectId}/media/hyperframes/logo-sting/logo-sting.aa.webm`, timeline_start: 2, source_start_seconds: 0, source_end_seconds: 4.6 } },
    { element_id: "mg-2", create_visual: { source_url: `/api/projects/${projectId}/media/hyperframes/logo-sting/logo-sting.aa.webm`, timeline_start: 9, source_start_seconds: 0, source_end_seconds: 4.6 } },
    { element_id: "clip", create_visual: { source_url: `/api/projects/${projectId}/media/sources/a.mp4` } },
  ];
  assert.equal(motionPlacementsInOption(projectId, operations).length, 2);
  assert.equal(recordMotionProposalReview(projectId, "proposal-1", operations, "approved", 5), 1);
  const events = readMotionAudit(projectId, "composition", "logo-sting").events;
  assert.deepEqual(events.map((event) => event.type), ["review", "placement", "placement"]);
  const review = events[0]!;
  assert.ok(review.type === "review" && review.rating === 5 && review.proposal_id === "proposal-1");
  const placement = events[1]!;
  assert.ok(placement.type === "placement" && placement.duration === 4.6 && placement.timeline_start === 2);
}));

test("a placed render keeps its controls after its source changes; a proposal's does not", withProject((projectId, root) => {
  const project = path.join(root, "projects", projectId);
  const directory = path.join(project, "hyperframes", "city");
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "index.html"), "<html>old</html>");
  fs.writeFileSync(path.join(directory, "dreamcut.controls.json"), JSON.stringify({ schema_version: 1, controls: [
    { id: "ink", kind: "color", label: "Ink", default: "#1c1b19" },
    { id: "height", kind: "number", label: "Height", default: 100, min: 30, max: 150 },
    { id: "backdrop", kind: "switch", label: "Paper fill", default: true },
  ] }));
  const output = "media/hyperframes/city/city.aa.webm";
  fs.mkdirSync(path.join(project, "media", "hyperframes", "city"), { recursive: true });
  fs.writeFileSync(path.join(project, output), "webm");
  const receipts = path.join(project, "preprocess", "hyperframes", "renders", "city");
  fs.mkdirSync(receipts, { recursive: true });
  const sha = "a".repeat(64);
  fs.writeFileSync(path.join(receipts, "old.json"), JSON.stringify({
    schema_version: 1, composition_id: "city",
    source: { project_relative_directory: "hyperframes/city", fingerprint_sha256: "b".repeat(64) },
    output: { project_relative_path: output, sha256: sha, duration_seconds: 4, width: 1080, height: 1920, fps: 30, codec: "vp9", pixel_format: "yuv420p", alpha_mode: "1", crop_checked: true },
    render: { hyperframes_version: "0.8.40", rendered_at: "2026-10-25T00:00:00.000Z", quality: "high", format: "webm", approved: true },
    // An older manifest had a control the current one dropped, and a height the current range refuses.
    parameters: { manifest_sha256: sha, values_sha256: sha, values: { ink: "#FF0000", height: 400, wobble: 3 }, segment_durations: {} },
  }));
  const item = { kind: "composition" as const, id: "city", operation_index: 0, source_url: `/api/projects/${projectId}/media/hyperframes/city/city.aa.webm` };
  assert.equal(withMotionControls(projectId, [item])![0]!.controls, undefined);
  const placed = withMotionControls(projectId, [item], { carryToCurrentSource: true })![0]!;
  assert.deepEqual(placed.controls?.map((control) => control.id), ["ink", "height", "backdrop"]);
  assert.deepEqual(placed.values, { ink: "#ff0000", height: 100, backdrop: true });
  assert.notEqual(placed.source_fingerprint_sha256, "b".repeat(64));
}));

test("render jobs settle durably and refuse a concurrent start", withProject(async (projectId) => {
  let finish!: () => void;
  const gate = new Promise<void>((resolve) => { finish = resolve; });
  const { done } = startMotionJob(projectId, "logo-sting", async () => {
    await gate;
    return { result: { media_path: "hyperframes/logo-sting/x.webm" }, warnings: ["remote"] };
  });
  assert.equal(readMotionJob(projectId, "logo-sting")?.state, "rendering");
  assert.throws(() => startMotionJob(projectId, "logo-sting", async () => ({ result: {}, warnings: [] })), /already rendering/);
  finish();
  await done;
  const job = readMotionJob(projectId, "logo-sting");
  assert.equal(job?.state, "ready");
  assert.deepEqual(job?.warnings, ["remote"]);
}));

test("a failed render is kept in the composition's audit trail before a retry overwrites its job file", withProject(async (projectId) => {
  const agent = { type: "agent" as const, name: "claude", model: "claude-opus-5-5", effort: null };
  const first = startMotionJob(projectId, "walker", async () => { throw new Error("At 0.2s this composition shows 2 separable objects"); }, undefined, undefined, agent);
  const failed = await first.done;
  assert.equal(failed.state, "failed");
  assert.equal(readMotionJob(projectId, "walker")?.error, "At 0.2s this composition shows 2 separable objects");
  const retry = startMotionJob(projectId, "walker", async () => ({ result: { media_path: "hyperframes/walker/x.webm" }, warnings: [] }));
  await retry.done;
  assert.equal(readMotionJob(projectId, "walker")?.state, "ready", "the job file holds only the latest state");
  const { events } = readMotionAudit(projectId, "composition", "walker");
  const kept = events.filter((event) => event.type === "job_failed");
  assert.equal(kept.length, 1);
  assert.deepEqual(kept[0]!.type === "job_failed" && [kept[0]!.error, kept[0]!.job_key, kept[0]!.actor], ["At 0.2s this composition shows 2 separable objects", null, agent]);
  assert.equal(summarizeMotionAudit(projectId, "composition", "walker").failed_renders, 1);
}));

test("value-keyed jobs for one graphic render side by side and settle separately", withProject(async (projectId) => {
  const gates: Array<() => void> = [];
  const start = (key: string) => startMotionJob(projectId, "section-header", () => new Promise((resolve) => {
    gates.push(() => resolve({ result: { media_path: `hyperframes/section-header/${key}.webm` }, warnings: [] }));
  }), undefined, key);
  const first = start("aaaaaaaaaaaaaaaa"), second = start("bbbbbbbbbbbbbbbb");
  assert.throws(() => start("aaaaaaaaaaaaaaaa"), /already rendering/);
  assert.equal(readMotionJob(projectId, "section-header", "bbbbbbbbbbbbbbbb")?.state, "rendering");
  gates[1]!();
  await second.done;
  assert.equal(readMotionJob(projectId, "section-header", "bbbbbbbbbbbbbbbb")?.state, "ready");
  assert.equal(readMotionJob(projectId, "section-header", "aaaaaaaaaaaaaaaa")?.state, "rendering");
  gates[0]!();
  await first.done;
  assert.equal(readMotionJob(projectId, "section-header"), null);
}));

test("library intake copies exact bytes, registers an owned entry and dedupes", withProject(async (projectId, root) => {
  const wav = Buffer.from("RIFF-test-bytes");
  const sha = createHash("sha256").update(wav).digest("hex");
  const project = path.join(root, "projects", projectId);
  fs.mkdirSync(path.join(project, "media", "sounds", "whoosh"), { recursive: true });
  fs.mkdirSync(path.join(project, "preprocess", "sounds"), { recursive: true });
  fs.writeFileSync(path.join(project, "media", "sounds", "whoosh", "whoosh.wav"), wav);
  const receipt: SynthSoundReceipt = {
    schema_version: 1,
    sound_id: "whoosh",
    source: { project_relative_directory: "sounds/whoosh", fingerprint_sha256: "a".repeat(64) },
    parameters: { manifest_sha256: null, values_sha256: "b".repeat(64), values: {}, seed: 7 },
    output: { project_relative_path: "media/sounds/whoosh/whoosh.wav", sha256: sha, duration_seconds: 0.5, sample_rate: 48000, channels: 2, peak: 0.7 },
    render: { renderer: "dreamcut-synth@1", rendered_at: "2026-10-10T00:00:00.000Z" },
  };
  fs.writeFileSync(path.join(project, "preprocess", "sounds", "whoosh.json"), JSON.stringify(receipt));
  fs.mkdirSync(path.join(root, "catalogs/sfx"), { recursive: true });
  fs.writeFileSync(path.join(root, "catalogs/sfx", "catalog.json"), JSON.stringify({ schema_version: 1, sound_effects: [] }));

  const analyzed = { version: "test", codec: "pcm_16", active_start_seconds: 0, active_end_seconds: 0.5, peak_time_seconds: 0.1, peak_position: "front" as const, spectral_centroid_hz: 3000, analyzed_at: "2026-10-10T00:00:00.000Z" };
  const first = await addSynthSoundToLibrary(projectId, "whoosh", async () => analyzed);
  assert.equal(first.added, true);
  assert.equal(first.analysis, "measured");
  assert.match(first.file, /^_personal\/owned\/synthesized\/synth-demo-whoosh-[a-f0-9]{8}\.wav$/);
  const personal = path.join(process.env.DREAMCUT_PROFILE_DIR!, "library", "sfx");
  assert.deepEqual(fs.readFileSync(path.join(personal, "files", first.file.slice("_personal/".length))), wav);
  // Project-derived sounds belong to the creator's profile library, never the shared catalog.
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, "catalogs/sfx", "catalog.json"), "utf8")).sound_effects, []);
  const catalog = sfxCatalogSchema.parse(JSON.parse(fs.readFileSync(path.join(personal, "catalog.json"), "utf8")));
  assert.equal(catalog.sound_effects[0]?.source_status, "owned");
  assert.equal(catalog.sound_effects[0]?.sha256, sha);

  const second = await addSynthSoundToLibrary(projectId, "whoosh", async () => null);
  assert.deepEqual({ added: second.added, id: second.catalog_id }, { added: false, id: first.catalog_id });
  assert.equal(readMotionAudit(projectId, "sound", "whoosh").events.filter((event) => event.type === "library_add").length, 1);
}));
