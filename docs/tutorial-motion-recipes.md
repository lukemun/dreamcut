# Tutorial motion recipes

Use `src/lib/tutorial-motion/tutorial-motion-recipe.ts` for phone-first screen tutorials. A recipe describes editorial intent; the compiler produces the timeline keyframes and overlay elements.

## What a recipe owns

- eased camera moves within one interface region;
- neutral fades around cross-column or semantic reframes;
- one continuous cursor path generated from recorded click coordinates;
- restrained click pulses and concealed long cursor travel;
- phone-safe step labels;
- the tutorial background, overlay lanes, and lane order;
- a 30 fps preflight that rejects visible camera snaps, staircase-like velocity changes, and renderer-bound violations.

## Authoring pattern

```ts
const compiled = compileTutorialMotionRecipe({
  id: "calm-guided-demo-v1",
  projectId,
  duration,
  assets: { backgroundUrl, cursorUrl, eventReceipt },
  camera: {
    initial: { scale: 1.5, offsetX: 0.5, offsetY: 0.5 },
    operations: [
      { kind: "move", start: 0.5, end: 1.3, to: { scale: 1.7, offsetX: 0.7, offsetY: 0.7 } },
      {
        kind: "hiddenReframe",
        fadeStart: 3.8,
        hiddenAt: 4,
        switchAt: 4.02,
        revealStart: 4.15,
        revealEnd: 4.38,
        to: { scale: 1.8, offsetX: -0.8, offsetY: 0.8 },
      },
    ],
  },
  clicks: [{ time: 1.8, x: 0.25, y: -0.2, label: "Open details" }],
  steps: [{ start: 0, end: 4, text: "STEP 1 / 2 · OPEN DETAILS" }],
});

assertTutorialMotionPreflight(compiled.preflight);
applyCompiledTutorialMotion(timeline, compiled, { replaceRecipeIds: ["older-recipe-id"] });
metadata.lane_order_keys = compiled.laneOrderKeys;
```

Coordinates are normalized to the output canvas and must remain in `-1..1`. Camera scale must remain in the renderer's `0.1..3` range. Use a `move` for motion within the same visual region. Use `hiddenReframe` whenever attention crosses columns, jumps to a distant control, or the underlying UI changes state discontinuously.

When application chrome should be excluded, author the pose from the visible source window instead of guessing offsets:

```ts
const contentPose = tutorialCameraPoseForSourceWindow({
  scale: 1.8,
  left: 0.055, // omit the unused 5.5% left toolbar
  top: 0,
});
```

Use the compiler tests under `src/lib/tutorial-motion/` as the reference implementation.

For phone-first tutorials that must preserve desktop layout, capture at the narrowest verified desktop breakpoint rather than starting with a generic 16:9 viewport. The portrait reference uses `900x720`: its `md` two-column rail remains active, while the form and brief wrap naturally. Prove `window.innerWidth` after applying a browser viewport override; accepting the override is not evidence that the page actually reflowed.
