import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const H = "a".repeat(64);

test("saving a placed motion graphic keeps its source, values and linked sounds, and lists it", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "motion-library-test-"));
  const previous = { projects: process.env.TIMELINE_PROJECTS_DIR, profile: process.env.DREAMCUT_PROFILE_DIR };
  process.env.TIMELINE_PROJECTS_DIR = path.join(root, "projects"); process.env.DREAMCUT_PROFILE_DIR = path.join(root, "profile");
  try {
    const { createProject, readTimeline, writeTimeline } = await import("./store");
    const { candidateReceiptPath } = await import("./hyperframes-candidates");
    const { projectSoundReceiptPath } = await import("./synth-sounds");
    const { projectDir } = await import("./paths");
    const { saveMotionLibraryEntry, listMotionLibrary, readMotionLibraryEntry } = await import("./motion-library");
    createProject("show", "web");
    const dir = projectDir("show");
    const write = (rel: string, text: string) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
    write("hyperframes/card/index.html", "<!doctype html><div id=root></div>");
    write("hyperframes/card/hyperframes.json", "{}");
    write("hyperframes/card/dreamcut.controls.json", JSON.stringify({ schema_version: 1,
      controls: [{ id: "title_hold", kind: "number", label: "Title hold", default: 2, min: 0.5, max: 6 }],
      timing: { duration: "3 + title_hold", cues: [{ id: "out", label: "Collapse out", at: "2.5 + title_hold" }] } }));
    write("media/hyperframes/card/card.0123456789abcdef.webm", "x");
    const receipt = { schema_version: 1, composition_id: "card", source: { project_relative_directory: "hyperframes/card", fingerprint_sha256: H },
      output: { project_relative_path: "media/hyperframes/card/card.0123456789abcdef.webm", sha256: H, duration_seconds: 6, width: 1920, height: 1080, fps: 30, codec: "vp9", pixel_format: null, alpha_mode: "1" },
      render: { hyperframes_version: "1", rendered_at: "2026-10-12T00:00:00Z", quality: "high", format: "webm", approved: false },
      parameters: { manifest_sha256: H, values_sha256: H, values: { title_hold: 3 }, segment_durations: {} } };
    fs.mkdirSync(path.dirname(candidateReceiptPath("show", "card", H, H)), { recursive: true });
    fs.writeFileSync(candidateReceiptPath("show", "card", H, H), JSON.stringify(receipt));
    write("sounds/whoosh/synth.js", "function render(){ return { channels: [[0]] }; }");
    fs.mkdirSync(path.dirname(projectSoundReceiptPath("show", "whoosh")), { recursive: true });
    fs.writeFileSync(projectSoundReceiptPath("show", "whoosh"), JSON.stringify({ schema_version: 1, sound_id: "whoosh", source: { project_relative_directory: "sounds/whoosh", fingerprint_sha256: H },
      parameters: { manifest_sha256: null, values_sha256: H, values: {}, seed: 7 },
      output: { project_relative_path: "media/sounds/whoosh/whoosh.0123456789abcdef.wav", sha256: H, duration_seconds: 0.6, sample_rate: 48000, channels: 2, peak: 0.5 },
      render: { renderer: "dreamcut-synth@1", rendered_at: "2026-10-12T00:00:00Z" } }));
    const pic = "11111111-1111-4111-8111-111111111111", base = { project_id: "show", beat_id: null, voice_clip_id: null, character_id: null, trim_start: 0, trim_end: 0, volume: 1, playback_rate: 1, fade_in: 0, fade_out: 0, position_locked: false, removed_at: null, created_at: "2026-10-12T00:00:00Z", updated_at: "2026-10-12T00:00:00Z" };
    const timeline = readTimeline("show");
    timeline.elements.push(
      { ...base, id: pic, type: "video_clip", source_url: "/api/projects/show/media/hyperframes/card/card.0123456789abcdef.webm", props: { title: "Card", has_alpha: true }, timeline_start: 1, duration: 6, lane_key: "visual_1", lane_index: 1 } as never,
      { ...base, id: "22222222-2222-4222-8222-222222222222", type: "sound_effect", source_url: "/api/projects/show/media/sounds/whoosh/whoosh.0123456789abcdef.wav", props: { title: "Out whoosh", follows_visual: { element_id: pic, cue: "out", offset_seconds: 0 } }, timeline_start: 6.5, duration: 0.6, lane_key: "sound_effect_0", lane_index: 0, volume: 0.8 } as never);
    writeTimeline("show", timeline, "fixture");

    const entry = saveMotionLibraryEntry("show", { element_id: pic, name: "Show Card", description: "Opener" });
    assert.equal(entry.id, "show-card");
    assert.deepEqual(entry.composition.files.map(f => f.path).sort(), ["dreamcut.controls.json", "index.html"], "scaffold files are not part of the graphic");
    assert.deepEqual(entry.composition.values, { title_hold: 3 }, "the placed render's values are kept");
    assert.deepEqual(entry.sounds.map(s => [s.title, s.cue, s.seed, s.volume, s.lane_key]), [["Out whoosh", "out", 7, 0.8, "sound_effect_0"]]);
    assert.equal(readMotionLibraryEntry("show-card").sounds[0].synth_js.includes("function render"), true);
    assert.deepEqual(listMotionLibrary().map(item => [item.id, item.cues.map(c => c.id), item.sounds.map(s => s.cue)]), [["show-card", ["out"], ["out"]]]);
    assert.throws(() => saveMotionLibraryEntry("show", { element_id: "22222222-2222-4222-8222-222222222222", name: "x" }), /motion graphic clip/);
  } finally {
    if (previous.projects === undefined) delete process.env.TIMELINE_PROJECTS_DIR; else process.env.TIMELINE_PROJECTS_DIR = previous.projects;
    if (previous.profile === undefined) delete process.env.DREAMCUT_PROFILE_DIR; else process.env.DREAMCUT_PROFILE_DIR = previous.profile;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
