# Explainer looks

Shared by the explainer templates ([Explainer Sequence](explainer-sequence.md),
[Animated Chart](animated-chart.md), [Plan Comparison](plan-comparison.md),
[Walkthrough Steps](walkthrough-steps.md)). Each
template is one composition whose `index.html` loads `looks.js`. **Do not send `looks.js`
to `motion_graphic_prepare`:** DreamCut supplies it for each graphic when it checks,
previews and renders: the shared runtime, the drawing kit and only the look the `look`
control picks. A look change re-renders with the new look; the source does not change. A
`looks.js` sent for one of these templates is dropped. The looks are original to DreamCut.

Each look lives in its own pair of files under [`../looks/`](../looks/) (`<id>.js` and
`<id>.json` with its title, family and three examples); [`looks.json`](../looks/looks.json)
lists their order and the templates they work with, `runtime.js` holds the shared helpers
and `kit.js` the scene drawing kit. `pnpm check:looks` (also run by `pnpm check:effects`) checks
that every look builds into its own bundle. Parsing does not prove a look runs: before shipping a
new or changed look, run `pnpm check:looks --render --palettes --look <id>`, which draws Explainer
Sequence's title scene in headless Chrome and fails when the page throws, its timeline never builds or its words read
below 3:1 against the look's backdrop (the contrast HyperFrames' check refuses at render time).
Looks also appear in Properties → Templates under Looks.

| Look | Character | Arrival | Scene change |
| --- | --- | --- | --- |
| Paper | Cream stock with fine grain, serif headlines, terracotta | Settles upward | Lifts away |
| Keynote | Near-black with a soft glow of the accent, heavy sans | Focuses in from a blur | Blurs out |
| Swiss | Off-white, black grotesque set flush left, one red | Hard wipe from the left | Slides right |
| Terminal | Black with scan lines, phosphor mono | Types on | Lifts away |
| Chalk | Green-black slate, chalk hand, yellow chalk | Writes on | Lifts away |
| Proof | Pure black, thin bright strokes, italic serif | Outlines draw on, then fill | Fades with a slight shrink |
| Blueprint | Cyanotype sheet, white line-work, grid, title block | Outlines draw on, then fill | Slides off the sheet |
| Outrun | Violet night, banded sun, neon grid floor rolling forward | Strikes on like a neon tube | Collapses to the horizon |
| Glass | Frosted panels over drifting orbs of light | Focuses in from a blur | Frosts over |

## A look on a new scene

When the creator selects a look and asks for something no template draws ("a man walks, sees a
rose, looks up at a cloud"), draw it in that look rather than generating media or copying the
look's colours by hand:

1. Split the scene into separable objects. Make each one native where possible (a rose or a
   cloud is a `create_shape` path), and make a composition only for what native shapes cannot
   move (a walking figure).
2. In that composition's `dreamcut.controls.json`, set `"looks": true` and declare a `look`
   choice listing the looks in `looks.json`, defaulting to the selected one. DreamCut writes
   `looks.js` beside `index.html` when it checks, previews and renders. Load it with
   `<script src="looks.js"></script>`; do not send it.
3. Draw with `window.DreamcutMotion`: `setup(controls, root)` returns the look's tokens
   (`S.look.bg`, `ink`, `muted`, `accent`) and canvas units (`S.u`). `enter`/`exit` give the look's
   own arrival and leave. `M.kit` has `stroke`, `fill`, `text`, `people` and `object` for drawing
   in the look's hand. A look change then re-renders the figure. Give native pieces the
   look's colours and stroke from its `<id>.js` tokens.
4. Draw-ons must read as one object at every sampled frame (every 0.2 s): start a figure's
   strokes touching, or let them join into one silhouette later. Run
   `npx tsx scripts/composition-object-probe.ts <composition dir>` before the first
   `motion_graphic_prepare`. `"frame": null` means it passes.

## Shared controls

Every template declares these in its `dreamcut.controls.json`; keep them identical so a
creator learns them once.

| Control | Kind | Notes |
| --- | --- | --- |
| `look` | choice | Every look in `looks.json`, in order |
| `palette`, `texture` | choice, number, `resets_with: "look"` | The look's own variants. Switching the look puts them back to their defaults; words, timing and layout stay |
| `shape` | choice, `fixed` | 16:9, 9:16 or 1:1. Set it to the project's output shape when preparing; it is not offered as a dial |
| `own_accent`, `accent` | switch, colour | Off uses the look's own accent |
| `backdrop` | switch | Off draws only the type and shapes, to lay the graphic over footage |

The controls file also declares:

- `"canvas": {"control": "shape", "sizes": {...}}` so the render is 1920×1080, 1080×1920
  or 1080×1080. The renderer reads the root's size before scripts run, so DreamCut writes
  the chosen size into the render copy.
- `"opaque_control": "backdrop"`. With the backdrop on, the render has no transparent
  pixel, and the alpha check accepts that instead of rejecting it as a broken encode.

## Rules for new templates in this family

- Read `c.look`, `c.shape` and the rest through `DreamcutMotion.setup(c, root)`. Do not
  branch on the look in the template except for layout. The look's motion comes from
  `DreamcutMotion.enter` / `exit`. Call `DreamcutMotion.finish(tl, S)` once, just before
  registering the timeline, so a look's texture pass runs across its whole length.
- Read type and panel styling through the variables `setup` sets: `--display-style` and
  `--display-case` on display text, `--panel-filter` and `--panel-edge` on panels.
- Type set straight on the backdrop (Explainer Sequence's title and kicker) reads `--display-ink` and `--display-accent`.
  A look whose `ink` and `accent` are meant for its panels names the colours that read on its backdrop,
  per palette: `displayInk: { original, light, dark, mono }` and `displayAccent: {...}`. A palette it
  leaves out uses its `ink` and `accent`; a creator's Own accent is always used as chosen.
  `pnpm check:looks --render --palettes` measures every word against what is drawn behind it.
- A new look draws its texture from time alone (`paint(ctx, W, H, t, accent)`), seeds any
  randomness with `rng(seed)` and never reads a clock. A `filter` change needs a matching
  start value, or it tweens from `none` and flashes.
- No root `data-duration`. The render length is the GSAP timeline's length, so a timing
  knob changes it. Declare `timing.duration` only when a formula over number controls
  gives the exact length. Otherwise omit it; the render length is then used.
- Fit text with `DreamcutMotion.fit`, measured once at build time. Use
  `DreamcutMotion.count` for numbers that count up.
- Avoid `top`, `name` and other window globals as top-level `const` names. They fail
  silently and the render is blank.
- Fonts are system fonts with fallbacks (Iowan Old Style, Avenir Next, Helvetica Neue,
  Menlo, Chalkboard SE). A machine without them renders the fallback.

## Splitting the Illustrated Explainer into timeline pieces

The Illustrated Explainer draws its whole graphic in one composition, which is recorded as
a "Not split" gap. To lay it out as separate timeline elements that play back as the whole,
prepare one composition per layer with the fixed `layer` control (default `all`, the whole
graphic):

- `stage`: the look's world, edge to edge (its backdrop and anything the look draws behind
  every scene). Prepare it with `backdrop` on.
- `front`: what the look draws over every scene (foreground light, grain).
- `<scene>-<piece>`: one piece of one scene, for example `chart-bars`, `people-person-2`,
  `closing-chip-play`. Piece names are the types in `looks/pieces.json`: a type ending in `#`
  is numbered (`person#` gives `person-1`, `person-2`) and one ending in `*` is named
  (`chip-*`). A look marks where each piece begins with `S.piece(key)` using those names, and
  a connector joins the piece it grows from.

A piece layer covers its scene's time plus the change into the next scene, draws over a
transparent background and keeps only what that piece adds over the world, so stacked in
drawing order over `stage` with `front` on top it composites back to the whole graphic.
Headlines are not drawn in any split layer: place them as native text. The `<scene>` layer
lists the pieces it draws in `window.__dreamcutPieces`, which is how a planner finds the
layers to prepare. Each piece's controls file names its own `object` and declares no
actors; the object check then holds every layer but `stage` and `front` to one object.

A piece is rendered over the world and every piece that appeared before it, so a frosted pane
frosts the pieces behind it too; the stacked layers match the whole graphic exactly. A frame where the
piece draws nothing skips the other passes, and only the piece's bounding box is read back and
separated.

A transparent render is cropped to a window that follows its content. The receipt records
the window's path as `canvas_track`, placing the clip copies it to `source_canvas_track`, and
preview and export draw each frame back at its place on the canvas, so a small piece no longer
decodes a full-frame video.

### Per-piece looks

Each piece is its own composition, so each can be drawn in its own look: a Linocut title over
a Glass world is a Glass `stage` with Linocut's title pieces (`title-bird-1`, `title-film`,
`title-shears`, `title-offcut`) above it. A look declares the piece types it draws in its
manifest's `pieces`; every look draws a `stage`. A split piece's Look choice lists only the
looks that draw its type (with one, it is not offered), and preparing a piece in a look that
does not draw it is refused, naming the looks that do. Switching a piece's look keeps its
words, timing and layout and resets its palette and texture. Backdrops and lighting belong to
the `stage` and `front` sections, never to a piece, and colours are not matched across looks.
To add a look's pieces, mark them with `S.piece`, add any new types to `pieces.json` and list
them in the look's `pieces`.
