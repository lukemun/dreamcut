import test from "node:test";
import assert from "node:assert/strict";
import { letterFallState, letterFallLastRelease } from "./letter-fall";
import { resolveLetterFallFollowers } from "./letter-fall-followers";
import { resolveNumberKeyframe } from "./keyframes";

test("release moves symmetrically from both ends inward, with independent quadratic clocks", () => {
  const releases = Array.from({length:7}, (_,i) => letterFallState(i,7,0,.45,.04).releaseSeconds);
  assert.deepEqual(releases, [0,.04,.08,.12,.08,.04,0]);
  assert.equal(letterFallState(3,7,.1,.45,.04).yCanvasHeights,0);
  assert.equal(letterFallState(0,7,.225,.45,.04).yCanvasHeights,.25);
  assert.ok(Math.abs(letterFallState(3,7,.345,.45,.04).yCanvasHeights-.25)<1e-12);
  assert.equal(letterFallLastRelease("Töltött\nkáposzta",.04),.12);
});

test("directional release follows each line and keeps the dish after the final letter when tuned", () => {
  assert.deepEqual(Array.from({length:7},(_,i)=>letterFallState(i,7,0,.45,.04,"right_to_left").releaseSeconds),[.24,.2,.16,.12,.08,.04,0]);
  assert.equal(letterFallLastRelease("Töltött\nkáposzta",.04,"left_to_right"),.28);
  const label={id:"label",timeline_start:33,duration:7,props:{text:"Goulash",letter_fall_start_seconds:4,letter_fall_order:"right_to_left",letter_fall_stagger_seconds:.04}};
  const food={id:"food",timeline_start:32,duration:8,props:{gravity_drop_start_seconds:5,gravity_drop_seconds:.45,gravity_drop_after_text_id:"label"}};
  const initial=resolveLetterFallFollowers([label,food],true)[1]!;
  assert.equal(initial.props.gravity_drop_start_seconds,5.28);
  assert.equal(resolveNumberKeyframe(initial.props,"media_offset_y",5.27,0),0);
  const slower={...label,props:{...label.props,letter_fall_stagger_seconds:.08}};
  const changed=resolveLetterFallFollowers([slower,initial],true)[1]!;
  assert.equal(changed.props.gravity_drop_start_seconds,5.56);
  assert.equal(resolveNumberKeyframe(changed.props,"media_offset_y",5.55,0),0);
  assert.deepEqual(resolveLetterFallFollowers([slower,changed],true)[1]!.props,changed.props);
});

test("shared owner: defaults, glyph offsets at start/mid/end, finish bound and raster clock", async () => {
  const { readLetterFall, letterFallGlyphOffsetPx, letterFallFinishSeconds, letterFallSettledElapsed, letterFallRasterElapsed } = await import("./letter-fall");
  assert.equal(readLetterFall({letter_fall_seconds:.5}), null, "the release clock turns the fall on");
  assert.deepEqual(readLetterFall({letter_fall_start_seconds:1}), {start:1,seconds:.45,stagger:.04,order:"outside_in"});
  const fall = readLetterFall({letter_fall_start_seconds:1,letter_fall_seconds:.5,letter_fall_stagger_seconds:.1,letter_fall_order:"left_to_right"})!;
  const offset = (index:number, elapsed:number) => letterFallGlyphOffsetPx(letterFallState(index,4,elapsed,fall.seconds,fall.stagger,fall.order),960);
  // Start: nothing has moved. Stagger: glyph 2 waits .2s before its own clock starts.
  assert.deepEqual([0,1,2,3].map(i=>offset(i,0)), [0,0,0,0]);
  assert.equal(offset(2,.2), 0);
  // Mid: half the fall time is a quarter canvas (uniform acceleration).
  assert.equal(offset(0,.25), 240);
  assert.ok(Math.abs(offset(1,.35)-240)<1e-9);
  // End of each glyph's fall time: exactly one canvas height; then clamped at three.
  assert.equal(offset(0,.5), 960);
  assert.equal(offset(0,10), 2880);
  // Finish within: start + last release (3 × .1) + fall time.
  assert.ok(Math.abs(letterFallFinishSeconds("Soup", fall)-1.8)<1e-12);
  // Raster clock collapses frames before release and after every glyph has settled.
  const settled = letterFallSettledElapsed("Soup", fall);
  assert.ok([0,1,2,3].every(i=>offset(i,settled)===2880));
  assert.equal(letterFallRasterElapsed("Soup",fall,0), 0);
  assert.equal(letterFallRasterElapsed("Soup",fall,1), 0);
  assert.equal(letterFallRasterElapsed("Soup",fall,1.4), .3999999999999999);
  assert.equal(letterFallRasterElapsed("Soup",fall,30), settled);
});
