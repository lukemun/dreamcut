import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CAPTION_PROPS, CAMERA_REVEAL_MOTION_KEYFRAMES } from './captions';
import { cameraRevealBlurPixels, resolveCameraRevealState } from './camera-reveal';

const props = { ...DEFAULT_CAPTION_PROPS,
  cameraRevealStartSeconds: .5, cameraRevealHoldSeconds: .5,
  cameraRevealDurationSeconds: 2, cameraRevealStartDistance: 1,
  cameraRevealEndDistance: 5, cameraRevealTargetX: 2, cameraRevealTargetY: -4,
  cameraRevealOrbitX: 3, cameraRevealOrbitY: -2, cameraRevealFov: 90,
  cameraRevealMotionKeyframes: CAMERA_REVEAL_MOTION_KEYFRAMES.linear,
};
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} ≈ ${expected}`);
const pose = (frame: number, width = 640, height = 320) =>
  resolveCameraRevealState({ props, frame, fps: 30, width, height });

test('camera reveal holds, moves on the caption clock, and clamps after the reveal', () => {
  assert.deepEqual(pose(0), pose(30));
  const middle = pose(60);
  close(middle.distance, 3);
  close(middle.targetX, 1);
  close(middle.targetY, -2);
  close(middle.orbitX, 1.5);
  close(middle.orbitY, -1);
  close(middle.viewHeight, 6);
  close(middle.viewWidth, 12);
  assert.equal(pose(90).distance, 5);
  assert.deepEqual(pose(900), pose(90));
  assert.equal(pose(60, 320, 640).viewWidth, middle.viewHeight / 2);
});

test('camera pose is independent of seek order and respects the authored motion curve', () => {
  const expected = pose(60);
  for (const frame of [90, 0, 45, 120, 30]) pose(frame);
  assert.deepEqual(pose(60), expected);
  const eased = resolveCameraRevealState({ props: { ...props,
    cameraRevealMotionKeyframes: CAMERA_REVEAL_MOTION_KEYFRAMES.ease_out,
  }, frame: 60, fps: 30, width: 640, height: 320 });
  assert.ok(eased.distance > expected.distance && eased.distance < 5);
});

test('reveal blur preserves rounded frame boundaries, cap, and explicit disabling', () => {
  const blurProps = { ...props, cameraRevealStartSeconds: .51,
    cameraRevealBlurSamples: 4, cameraRevealShutterAngle: 180 };
  const blur = (frame: number) => cameraRevealBlurPixels({props: blurProps, frame, fps: 30});
  assert.equal(blur(30), 0);
  close(blur(31), 1.32);
  assert.equal(blur(91), blur(31));
  assert.equal(blur(92), 0);
  assert.equal(cameraRevealBlurPixels({props: blurProps, frame: 60, fps: 30, samples: 1}), 0);
  assert.equal(cameraRevealBlurPixels({props: blurProps, frame: 60, fps: 30, shutterAngle: 0}), 0);
  assert.equal(cameraRevealBlurPixels({props: blurProps, frame: 60, fps: 30, samples: 100}), 2.5);
});
