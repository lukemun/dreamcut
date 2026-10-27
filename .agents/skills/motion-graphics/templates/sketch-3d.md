# 3D Sketch Scene

Template `FX-MOTION-SKETCH-3D` (Properties → Templates). A 3D scene drawn in ink on paper
rises into place, then the camera flies, circles or rises through it. The scene is data, so
one engine draws a city, a forest, a product on a plinth or any arrangement of simple shapes.

## Inputs

| Role | Required | Notes |
| --- | --- | --- |
| What the scene shows | Yes | Described in words; the agent writes `scene.js`. |
| Words or moment | Optional | Where the scene lands and when the camera starts moving. |

## Build

`composition_id` of your choice with [`sketch-3d/index.html`](sketch-3d/index.html) (the
engine; do not edit it per scene), a `scene.js` written for the subject (start from
[`sketch-3d/scene.js`](sketch-3d/scene.js), the city) and
[`sketch-3d/dreamcut.controls.json`](sketch-3d/dreamcut.controls.json). Keep the Camera
choice's options in step with the move names in `scene.js`. It is one object (the scene), so
declare it with `"object"` as the controls file does. Place it as a full-screen
`create_visual` on the top lane; with Paper fill off it lays over footage.

## Scene file

`window.SKETCH_SCENE = { appear, objects, camera }`. Units are roughly metres, y is up and
every shape stands on the ground at `at: [x, y, z]` unless lifted.

| Type | Fields |
| --- | --- |
| `box` | `size: [w, h, d]`, `bands` (spacing of horizontal stripes, such as floors) |
| `cylinder`, `cone` | `radius`, `height`, `top_radius` (cylinder), `sides`, `bands` |
| `sphere` | `radius`, `rings` |
| `prism` | `points: [[x, y], …]` (a flat outline: logo, letter, arrow), `depth` |
| `disc` | `radius`, `fill`; always faces the camera (a sun, a marker) |
| `ground` | `size`, `grid` (street lines) |
| `city` | generator: `count`, `span`, `cell`, `avenue`, `bands` |
| `forest` | generator: `count`, `radius` |

Every shape also takes `turn` (degrees about the vertical), `line` and `fill` (`"ink"`,
`"paper"` or a colour), `appear` (`rise`, `grow`, `pop`, `none`) and `delay` (0 to 0.6 of the
build time). `camera: { fov, moves: { name: [{ at, from, to }, …] } }` gives each move as keys
across the flight (`at` 0 to 1); between keys the camera eases.

## Controls

Main: Camera, Camera time, Build time, Density, Height, Wobble, Variation.
Advanced: Detail, Hold, Ink, Paper, Paper fill. Density and Height scale the generators;
Detail thins the stripes; Wobble is the hand-drawn drift of every stroke.

## Timing

Length is Build time + Camera time + Hold. Cues: `camera_moves` (when the build ends) and `flight_ends`.
For sound, get the drawing and flight timing with `visual_activity_prepare` (see
[sound-design](../../sound-design/SKILL.md)). The camera holds still during the build, so the
render's measured `frames` curve before `camera_moves` is the drawing itself; pass `element_ids`
to follow one layer clip.

## Pieces

A scene can be laid out as separate clips with a fixed text `layer` control: `plan` (ground,
water and the paper fill), `streets`, `buildings`, and one named layer per landmark. The plan,
streets and buildings are world layers and may hold many shapes; a landmark layer draws one
object. Each layer draws its own part and the rest of the scene as depth only, so the stacked
clips hide each other exactly as the whole scene does. Only the plan keeps the paper fill.

## Limits

- No text or imported 3D models; use `prism` outlines for logos and letters.
- Lines are one pixel wide at 1920 × 1080.
- Round shapes get an ink silhouette; their stripes are drawn as rings.

## Evidence

The city recreation of the "Claude draws as I explain" reel on the disposable project
`sketch-pieces-check`, and the preview in `public/recipe-previews/motion-sketch-3d/`
(including a second scene from the same engine).
