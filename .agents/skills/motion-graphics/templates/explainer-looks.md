# Explainer looks

Shared by the five explainer templates ([Explainer Sequence](explainer-sequence.md),
[Animated Chart](animated-chart.md), [Plan Comparison](plan-comparison.md),
[Walkthrough Steps](walkthrough-steps.md), [Kinetic Type](kinetic-type.md)). Each
template is one composition; [`explainer-looks/looks.js`](explainer-looks/looks.js) is
passed beside its `index.html` as `looks.js`. It reads the shared controls and sets
colours, type, backdrop and the way things arrive. The looks are original to DreamCut.

| Look | Character | Arrival |
| --- | --- | --- |
| Paper | Cream stock with fine grain, serif headlines, terracotta | Settles upward |
| Keynote | Near-black with a soft glow of the accent, heavy sans | Focuses in from a blur |
| Swiss | Off-white, black grotesque set flush left, one red | Hard wipe from the left |
| Terminal | Black with scan lines, phosphor mono | Types on |
| Chalk | Green-black slate, chalk hand, yellow chalk | Writes on |

## Shared controls

Every template declares these in its `dreamcut.controls.json`; keep them identical so a
creator learns them once.

| Control | Kind | Notes |
| --- | --- | --- |
| `look` | choice | Paper, Keynote, Swiss, Terminal, Chalk |
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
  `DreamcutMotion.enter` / `exit`.
- No root `data-duration`. The render length is the GSAP timeline's length, so a timing
  knob changes it. Declare `timing.duration` only when a formula over number controls
  gives the exact length. Otherwise omit it; the render length is then used.
- Fit text with `DreamcutMotion.fit`, measured once at build time. Use
  `DreamcutMotion.count` for numbers that count up.
- Avoid `top`, `name` and other window globals as top-level `const` names. They fail
  silently and the render is blank.
- Fonts are system fonts with fallbacks (Iowan Old Style, Avenir Next, Helvetica Neue,
  Menlo, Chalkboard SE). A machine without them renders the fallback.
