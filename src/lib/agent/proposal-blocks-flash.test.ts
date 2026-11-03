import assert from "node:assert/strict";
import test from "node:test";
import { compileBlock, setBlockSetting } from "./proposal-blocks";

const media = "/api/projects/p/media";
const pose = (label: string, at: number) => ({ label, cutout: { source_url: `${media}/cutouts/${label}.webm`, source_duration_seconds: 0.5, source_offset_seconds: at - 0.1 }, at_seconds: at });
const flash = (inputs: Record<string, unknown> = {}, settings: Record<string, number> = {}) => ({
  block_id: "flash", kind: "flash_sequence", version: 1, seed: "s", frame_rate: 30, settings,
  inputs: {
    source: { source_url: `${media}/sources/take.mov`, source_duration_seconds: 48 },
    empty_set: { source_url: `${media}/sources/take.mov`, source_duration_seconds: 48, source_start_seconds: 0.5 },
    poses: [pose("swings", 19.6), pose("bend", 24.4), pose("camera", 39)],
    line_end_seconds: 43.7,
    sound: { source_url: "/api/sfx-catalog/media/click.wav", source_duration_seconds: 0.177, peak_seconds: 0.075 },
    ...inputs,
  },
});
type Visual = { timeline_start: number; source_start_seconds: number; source_end_seconds: number; subject_flash?: number; transition_keyframes?: Record<string, Array<{ t: number; v: number }>> };
const visuals = (ops: ReturnType<typeof compileBlock>, role: string) => ops.filter(op => op.block_ref.role === role).map(op => op.create_visual as Visual);
const clicks = (ops: ReturnType<typeof compileBlock>) => ops.filter(op => op.block_ref.role === "click").map(op => op.create_audio as { timeline_start: number; volume: number; source_end_seconds: number; follows_visual: { element_id: string; offset_seconds: number } });

test("poses replace each other every few frames, each white for one frame, then the take goes live where the last pose ends", () => {
  const ops = compileBlock(flash());
  const poses = visuals(ops, "pose");
  assert.deepEqual(poses.map(p => Math.round(p.timeline_start * 30)), [0, 4, 8]);
  assert.deepEqual(poses[0]!.transition_keyframes!.subject_flash, [{ t: 0, v: 1, ease: "hold" }, { t: 0.033333, v: 0, ease: "hold" }]);
  const [line] = visuals(ops, "line");
  assert.equal(Math.round(line!.timeline_start * 30), 12);
  assert.equal(line!.source_start_seconds, 39.133333);
  assert.equal(visuals(ops, "empty_set")[0]!.timeline_start, 0);
});

test("a click peaks on every flash, follows its pose and never overlaps the next", () => {
  for (const frames of [2, 4]) {
    const ops = compileBlock(flash({ timeline_start: 1 }, { pose_frames: frames }));
    const poses = ops.filter(op => op.block_ref.role === "pose");
    const placed = clicks(ops) as Array<ReturnType<typeof clicks>[number] & { source_start_seconds: number }>;
    for (const [index, click] of placed.entries()) {
      assert.equal(click.follows_visual.element_id, poses[index]!.element_id);
      // The peak (0.075 s into the file) lands on the flash, however much of the lead fits.
      assert.ok(Math.abs(click.source_start_seconds - click.follows_visual.offset_seconds - 0.075) < 1e-6);
      const next = placed[index + 1];
      if (next) assert.ok(click.timeline_start + click.source_end_seconds - click.source_start_seconds <= next.timeline_start + 1e-6);
    }
  }
  // A pose at the very start: its click starts later in the file, still peaking on the flash.
  const [first] = clicks(compileBlock(flash())) as Array<ReturnType<typeof clicks>[number] & { source_start_seconds: number }>;
  assert.deepEqual([first!.timeline_start, first!.source_start_seconds], [0, 0.075]);
  assert.ok(clicks(compileBlock(flash({}, { sound_volume: 0 }))).every(click => click.volume === 0));
});

test("flash and glow at 0 keep the same clips, and every pose length compiles from the cut-outs", () => {
  const plain = compileBlock(setBlockSetting(setBlockSetting(flash(), "flash_percent", 0), "glow", 0));
  assert.deepEqual(plain.map(op => op.element_id), compileBlock(flash()).map(op => op.element_id));
  assert.ok(visuals(plain, "pose").every(p => p.subject_flash === 0));
  for (const frames of [2, 8]) compileBlock(flash({}, { pose_frames: frames }));
  assert.throws(() => compileBlock(flash({ poses: [pose("swings", 19.6), { ...pose("bend", 24.4), cutout: { source_url: `${media}/cutouts/b.webm`, source_duration_seconds: 0.2, source_offset_seconds: 24.3 } }] }, { pose_frames: 8 })), /bend: needs cut-out frames/);
});
