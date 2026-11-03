import test from "node:test";
import assert from "node:assert/strict";
import { resolveTransitionEffects, transitionKeyframesSchema } from "./transition-effects";
import { resolveMediaScene } from "./resolved-media-scene";

test("oval reveal starts empty, opens and resolves full canvas at independent times", () => {
  const props = { keyframes: { iris_radius: [{t: 0, v: 0}, {t: 1, v: 2}] } };
  assert.match(String(resolveTransitionEffects(props, 0, {width: 1080, height: 1920}).style.maskImage), /transparent/);
  assert.match(String(resolveTransitionEffects(props, .5, {width: 1080, height: 1920}).style.maskImage), /ellipse 50% 50%/);
  assert.equal(resolveTransitionEffects(props, 1, {width: 1080, height: 1920}).style.maskImage, undefined);
  assert.equal(resolveMediaScene(props, .5, {width: 1080, height: 1920}).geometry_support, "unknown");
});

test("blur scales with preview canvas and resolves to an unfiltered finish", () => {
  const props = {keyframes: {transition_blur: [{t: 0, v: 30}, {t: 1, v: 0}]}};
  assert.equal(resolveTransitionEffects(props, 0, {width: 360, height: 640}).style.filter, "blur(10px)");
  assert.equal(resolveTransitionEffects(props, 1, {width: 1080, height: 1920}).style.filter, undefined);
  assert.deepEqual(resolveTransitionEffects({}, 0, {width: 1080, height: 1920}).style, {});
});

test("reject invalid, unordered and unsupported transition keyframes", () => {
  for (const value of [{iris_radius: [{t: 0, v: 0}, {t: 0, v: 1}]}, {transition_blur: [{t: 0, v: 0}, {t: 1, v: 41}]}, {random: []}]) {
    assert.equal(transitionKeyframesSchema.safeParse(value).success, false);
  }
});

 test("horizontal camera motion accepts both directions but stays bounded", () => {
  assert.equal(transitionKeyframesSchema.safeParse({media_offset_x: [{t: 0, v: 0}, {t: 1, v: -2}]}).success, true);
  assert.equal(transitionKeyframesSchema.safeParse({media_offset_x: [{t: 0, v: 0}, {t: 1, v: -2.1}]}).success, false);
});

test("directional blur interpolates each axis in canvas pixels and resets exactly", () => {
  const props = { directional_blur_y: 24, keyframes: { directional_blur_x: [{t: 0, v: 0}, {t: 1, v: 180}, {t: 2, v: 0}] } };
  const middle = resolveTransitionEffects(props, .5, {width: 540, height: 960});
  assert.equal(middle.blurX, 45);
  assert.equal(middle.blurY, 12);
  assert.equal(resolveTransitionEffects(props, 2, {width: 1080, height: 1920}).blurX, 0);
  assert.equal(resolveTransitionEffects({directional_blur_x: Infinity}, 0, {width: 1080, height: 1920}).blurX, 0);
  assert.equal(transitionKeyframesSchema.safeParse({directional_blur_x: [{t:0,v:0},{t:1,v:1080}]}).success, true);
  assert.equal(transitionKeyframesSchema.safeParse({directional_blur_x: [{t:0,v:0},{t:1,v:1081}]}).success, false);
});

test("vertical authored tracks resolve shared aperture edges on the composition clock", () => {
  const tracks = transitionKeyframesSchema.parse({ media_offset_y: [
    { t: 0, v: -1.06 }, { t: .4, v: -1.56 }, { t: 1.6, v: -1.56 }, { t: 3, v: -2 },
  ] });
  const props = { keyframes: tracks };
  assert.equal(resolveMediaScene(props, .4, { width: 1080, height: 1920 }).layout.translate_y, -1497.6);
  assert.equal(resolveMediaScene(props, 1, { width: 1080, height: 1920 }).layout.translate_y, -1497.6);
  assert.equal(resolveMediaScene(props, 3, { width: 1080, height: 1920 }).layout.translate_y, -1920);
  assert.equal(resolveMediaScene(props, 0, { width: 540, height: 960 }).layout.translate_y, -508.8);
  assert.equal(transitionKeyframesSchema.safeParse({media_offset_y:[{t:0,v:0},{t:1,v:3}]}).success, false);
});

test("rounded shared window starts closed, opens smoothly and resolves without corner residue", () => {
  const props = { window_open_duration: 3, window_corner_radius: 64 };
  const first = resolveTransitionEffects(props, 0, {width:1080,height:1920}).window;
  assert.equal(first.height, 0);
  assert.match(String(first.style.clipPath), /evenodd/);
  const early = resolveTransitionEffects(props, .3, {width:1080,height:1920}).window;
  assert.ok(early.height < 192);
  const middle = resolveTransitionEffects(props, 1.5, {width:1080,height:1920}).window;
  assert.equal(middle.height, 960);
  assert.equal(middle.radius, 64);
  const end = resolveTransitionEffects(props, 3, {width:1080,height:1920}).window;
  assert.equal(end.height, 1920);
  assert.equal(end.radius, 0);
  assert.equal(resolveTransitionEffects(props, 1.5, {width:540,height:960}).window.radius, 32);
  assert.equal(resolveTransitionEffects({...props,window_open_duration:6}, 1.5, {width:1080,height:1920}).window.progress, .15625);
  assert.equal(resolveTransitionEffects({}, 1.5, {width:1080,height:1920}).window.active, false);
});


test("inset opening holds terminal margins and roundness across canvas sizes", () => {
  const props = {window_open_duration:3, window_corner_radius:64, window_side_margin_percent:6, window_vertical_margin_percent:20};
  const end = resolveTransitionEffects(props, 3, {width:1080,height:1920}).window;
  assert.equal(end.height,1152);
  assert.equal(end.radius,64);
  assert.match(String(end.style.clipPath), /M128.8 384/);
  assert.deepEqual(resolveTransitionEffects(props, 9, {width:1080,height:1920}).window,end);
  const half = resolveTransitionEffects(props, 3, {width:540,height:960}).window;
  assert.equal(half.height,576); assert.equal(half.radius,32);
  assert.equal(resolveTransitionEffects(props,0,{width:1080,height:1920}).window.height,0);
});

test("window center moves the aperture while retaining its size and full matte", () => {
  const props = {window_open_duration:3, window_corner_radius:64, window_side_margin_percent:6, window_vertical_margin_percent:31};
  const base = resolveTransitionEffects(props,3,{width:1080,height:1920}).window;
  const up = resolveTransitionEffects({...props,window_center_y_percent:40},3,{width:1080,height:1920}).window;
  assert.equal(up.height,base.height);
  assert.equal(up.radius,base.radius);
  assert.match(String(up.style.clipPath),/M0 0H1080V1920H0Z/);
  assert.match(String(up.style.clipPath),/M128.8 403.2/);
  assert.deepEqual(resolveTransitionEffects({...props,window_center_y_percent:50},3,{width:1080,height:1920}).window,base);
});
