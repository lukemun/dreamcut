# Effect recipes

**[Browse every effect: demos, inputs and agent requests](recipes.md)** ·
**[Contribute using the effect page template](creator-template.md)**

This repository catalog contains shared methods with evidence. The editor also shows
user-only recipes from the local profile; those are not contributed here. Personal
styles remain private parameter settings, a separate concept from a recipe.


## All templates

<!-- BEGIN EFFECT INDEX -->
Browse every shared effect and reference study below. Each link opens its demo, input brief, build sequence and the request your agent works from. Reference-only entries are ideas to assess, not verified implementations.

| Effect | What you supply | Home | Evidence |
| --- | --- | --- | --- |
| [Shopping basket fills as items are picked](recipes.md#fx-12) | Shopping footage; Basket and products | Properties → Templates | Reference example |
| [Floating translucent project screen](recipes.md#fx-14) | Laptop footage; Screen content | Properties → Templates | Reference example |
| [Gesture-matched outfit change](recipes.md#fx-06) | Two outfit takes | Properties → Templates | Reference example |
| [Foot-to-camera location change](recipes.md#fx-07) | Two location takes | Properties → Templates | Reference example |
| [Objects float in → scene switches → white blips](recipes.md#fx-08) | Starting scene; Destination scene | Properties → Templates | Partial recreation · read limitations |
| [Drinks enter before their background](recipes.md#fx-11) | Starting and drinks shots | Properties → Templates | Reference example |
| [Restaurant builds over the shot, then becomes the scene](recipes.md#fx-16) | Walking and restaurant shots | Properties → Templates | Reference example |
| [Laptop-edge scene wipe](recipes.md#fx-15) | Closing laptop shot; Destination shot | Properties → Templates | Reference example |
| [Paper unfolds across cuts, then becomes a handheld title](recipes.md#fx-02) | Title artwork and scenes; Paper and handoff footage | Properties → Templates | Reference example |
| [Persistent time and activity labels](recipes.md#fx-05) | Footage and chapter labels | Properties → Templates | Reference example |
| [Lunch before/after match cut](recipes.md#fx-10) | Before and after lunch | Properties → Templates | Reference example |
| [Dinner before/after match cut](recipes.md#fx-19) | Before and after dinner | Properties → Templates | Reference example |
| [Remove-to-show title reveal — provisional](recipes.md#fx-20) | Background and title | Properties → Templates | Reference example |
| [White paper outline](recipes.md#fx-scratchpad) | Artwork; Border preference | Properties → Templates | Partial recreation · read limitations |
| [Inverse Video captions — Blue steel option](recipes.md#fx-inverse-captions) | Background and words | Properties → Templates | Reference example |
| [Film Burn](recipes.md#fx-film-burn) | Two shots; Optional burn texture | Properties → transition join | Partial recreation · read limitations |
| [Mask Glitch](recipes.md#fx-mask-glitch) | Ordered shots | Properties → Templates | Partial recreation · read limitations |
| [Camera Flash](recipes.md#fx-camera-flash) | Two shots and cut point | Properties → transition join | Partial recreation · read limitations |
| [Blackout](recipes.md#fx-blackout) | Cover and uncover takes | Properties → transition join | Partial recreation · read limitations |
| [Whip Pan](recipes.md#fx-whip-pan) | Matching camera turns | Properties → transition join | Partial recreation · read limitations |
| [Negative Pop](recipes.md#fx-negative-pop) | Subject and background | Properties → Templates | Reference example |
| [Scene Portal](recipes.md#fx-scene-portal) | Host footage; Insert and destination | Properties → Templates | Reference example |
| [Speed Entrance & Exit](recipes.md#fx-speed-entrance-exit) | Performance footage; Matching empty background | Properties → Templates | Implemented template · built with your agent |
| [Speed hops to camera](recipes.md#fx-speed-hops-to-camera) | One locked-off take; Marks where you stop | Properties → Templates | Implemented template · built with your agent |
| [Mask Glitch · Glow](recipes.md#fx-mask-glitch-glow) | Ordered pose or performance takes; Matching empty background | Properties → Templates | Implemented template · built with your agent |
| [Moving Grid Matte](recipes.md#fx-moving-grid-matte) | Moving subject footage; Background | Properties → Templates | Implemented template · built with your agent |
| [Paper cutout](recipes.md#fx-paper-cutout) | A shot with the subject | Properties → Templates | Implemented template · built with your agent |
| [Word Search Trace](recipes.md#fx-word-search-trace) | Two to four short shots; One word per shot | Properties → Templates | Implemented template · built with your agent |
| [3D Sketch Scene](recipes.md#fx-motion-sketch-3d) | What the scene shows | Properties → Templates | Implemented template · built with your agent |
| [Clone Flash](recipes.md#fx-clone-flash) | A still shot of a person | Properties → Templates | Implemented template · built with your agent |
| [Silhouette Window](recipes.md#fx-silhouette-window) | A shot of a person; Several short fill clips | Properties → Templates | Implemented template · built with your agent |
| [Cross into Negative](recipes.md#fx-cross-negative) | Two shots | Properties → Templates | Implemented template · built with your agent |
| [Video Letters](recipes.md#fx-video-letters) | A short word; A video | Properties → Templates | Implemented template · built with your agent |
| [Layered Paper Cutout](recipes.md#layered-paper-cutout) | Portrait; Music and hits | Properties → Templates | Demonstration · not catalog-verified |
| [Background removal](recipes.md#talking-head-cutout) | Photo or video | Properties → Templates | Demo not available yet |

Want to add one? Start with the [effect page template](creator-template.md) and [PR contribution guide](../../CONTRIBUTING.md#add-a-template).
<!-- END EFFECT INDEX -->

## User-only recipes

Guide → Effects has All recipes / User-only / Shared catalog filters and an origin
label on every row. Ownership follows storage, not the recipe name or verification
status. User-only recipes appear across local projects and never replace shared rows.

Private reference recipes live in `effect-recipes/catalog.json` beneath `profileDir()`
(including its `DREAMCUT_PROFILE_DIR` override). Example videos and retained sources
belong in that same private directory, not `public/` or repository skill receipts.
The versioned schema and read path are in
[`user-effect-recipes.ts`](../../src/lib/local-store/user-effect-recipes.ts).
This first private format accepts candidate references only: saving one does not
establish a recreation, native effect support, or a verified reusable implementation.
Related private recipes may declare a shared family ID and title with a distinct
variant label. Guide and Properties → Templates keep those candidates together and let
the creator switch variants without merging their reference clips or input guidance.
Promotion to the shared catalog is a separate, explicit contribution with the normal
evidence requirements below. No automatic publication or import UI is implied.

Each private recipe includes a title, description, owning workflow, copyable prompt,
remaining limitations, a credited source URL, and a hashed local MP4 example with its
exact source window and source hash. The identity-based private media route supports
video range requests, rejects path escapes and changed content, and never falls back
to an unrelated source. A broken private catalog produces a visible loading error;
the shared catalog remains available.

Inputs are filming instructions: each has a short `title` and human-facing `directions`.
Explain camera position and framing, the action to perform, background/lighting
continuity, spare recording time, and which original files to supply. Say when the
editor prepares a mask so creators are not told to deliver technical intermediates
they do not yet have. Optional sound or artwork should be identified as optional.
`preparation` explains what happens in the edit separately from what the creator
must film. For example: “Keep the camera still, step out of the shot, and record a
few seconds of the empty scene without changing lighting or zoom.”

The UI labels these videos **Reference example**, while shared recreations retain
their **Result** heading and evidence status. Directions grow with the page and use
the same page scroll owner as other Guide rows.

The editor's **Guide → Effects** publishes recreated entries from this catalog,
with their current result media, required inputs, reusable prompts and remaining
limitations. Reference-only candidates stay in the documentation catalog until
recreation evidence is available.

Guide videos are served from small, repository-packaged proxies in
`public/guide/effects/catalog/`. Its `proxies.json` binds each sample to the
catalog recreation hash and records measured dimensions, timing, credits and
proxy hashes, plus a hashed poster frame chosen to show the effect in action
(`posterFrames` in the script). Regenerate with `pnpm exec tsx scripts/prepare-guide-proxies.ts`.
The Guide refuses a missing or outdated proxy rather than serving the evidence
master. These assets are included in Git; project folders are not required for playback.

[Documentation catalog](index.html) · [Machine-readable catalog](catalog.json) · [JSON schema](catalog.schema.json) · [Recreation guide](recreate-effect-guide.md) · [Contributing](../../CONTRIBUTING.md)

## Compound recipe example

[Masked flash + crisp click](../../.agents/skills/mask-glitch/references/masked-flash-click.md) is a skill-owned partial recipe: one white-mask accent and one source-anchored click, kept as editable actors. Its [architecture example](../architecture/compound-effect-recipes.md) separates the method, project instance, and optional saved personal style. It is not yet a separately packaged catalog entry or a one-click preset; the licensed sound is referenced rather than redistributed.

## Media redistribution

The maintainer confirmed public redistribution clearance on 2026-09-29 for the existing documentation gallery media, including reference excerpts, recreation videos, stills, thumbnails and GIFs. Catalog artifacts marked `licensed` rely on that confirmation; original creator credits remain attached. This records clearance to distribute the gallery assets with DreamCut, without asserting ownership transfer or a broader license for unrelated uses. New contributions must provide their own rights basis.

On 2026-10-14 the creator confirmed public redistribution of the Layered Paper Cutout Guide example (`public/guide/effects/contour-first-half.mp4`, `contour-first-half.jpg` and `input-contour-current.png`), which shows the creator and is credited "creator-supplied portrait". The same limits apply: clearance to distribute with DreamCut, not an ownership transfer or broader license.

## Format and status

Each `recipe` includes a reference, optional recreation, owning skill, inputs, preparation, success criteria and before/after evidence. Every artifact records a portable path relative to this directory, SHA-256, kind, credit and rights basis. The owning skill links a `references/effect-evidence.json` receipt back to the same catalog entry.

- **Candidate:** reference analysis only; no recreation is claimed.
- **Partial:** recreation and input/output evidence exist, with explicitly recorded gaps.
- **Complete:** recreation, before/after evidence and all success criteria verified; no unresolved limitations. Schema validity alone does not prove visual quality.

Run `pnpm check:effects` to check format, files, hashes, reciprocal skill links and orphan receipts. The executable validator also enforces status rules. Run `pnpm check:effects --write-schema` after changing the format.

## Worked packages

The [original Anderson Tai reel](anderson-taii-transitions.md) contributes **Film Burn,
Mask Glitch, Camera Flash, Blackout and Whip Pan**. Each has its reference excerpt,
recreation frame sheet, required inputs and explicit remaining gaps in the
browser catalog. All five are partial studies.

FX-08 uses the existing 33-bird pop-in/white-flash output as a partial recreation of an object-led scene transition. FX-SCRATCHPAD exercises the same format with a static image treatment; its changed pose remains an explicit failure of source preservation. These are packaging examples, not two completed fidelity acceptances.

## Catalog

<a id="FX-12"></a>

### FX-12 — Shopping basket fills as items are picked

**Status: candidate** · Skill: [video-compositing](../../.agents/skills/video-compositing/SKILL.md) · [Evidence receipt](../../.agents/skills/video-compositing/references/effect-evidence.json)

[Reference](media/FX-12.mp4)

**Inputs:** Background shopping clips; transparent basket PNG/WebP with clean alpha; start/end window; Basket base with alpha; separate product cutouts or clean basket states; ordered pickup times

**Preparation:** Extract a static basket if not supplied; inspect holes/edges; use one overlay across cuts

**Success criteria:** Basket remains stable across cuts and each selected product appears once, stays inside the basket and persists through following shots.

**Limitations:** Reference analyzed; no verified recreation packaged.

**Reference credit:** @celfstudies; https://www.instagram.com/reel/DdN_aljAIY0/ (credited-excerpt).

<a id="FX-14"></a>

### FX-14 — Floating translucent project screen

**Status: candidate** · Skill: [video-compositing](../../.agents/skills/video-compositing/SKILL.md) · [Evidence receipt](../../.agents/skills/video-compositing/references/effect-evidence.json)

[Reference](media/FX-14.mp4)

**Inputs:** Background laptop shot; clean screen recording or screenshot; interval

**Preparation:** Prepare screen source and fit within top region; preserve recording time

**Success criteria:** Screen is readable, translucent and does not cover the subject unintentionally.

**Limitations:** Reference analyzed; no verified recreation packaged.

**Reference credit:** @celfstudies; https://www.instagram.com/reel/DdN_aljAIY0/ (credited-excerpt).

<a id="FX-06"></a>

### FX-06 — Gesture-matched outfit change

**Status: candidate** · Skill: [visual-timing](../../.agents/skills/visual-timing/SKILL.md) · [Evidence receipt](../../.agents/skills/visual-timing/references/effect-evidence.json)

[Reference](media/FX-06.mp4)

**Inputs:** Two wardrobe takes with matching hand gesture, camera framing and light

**Preparation:** Shoot/retrieve both performances; align at gesture peak

**Success criteria:** Hand continuity disguises the outfit change; no accidental motion reversal.

**Limitations:** Reference analyzed; no verified recreation packaged.

**Reference credit:** @celfstudies; https://www.instagram.com/reel/DdN_aljAIY0/ (credited-excerpt).

<a id="FX-07"></a>

### FX-07 — Foot-to-camera location change

**Status: candidate** · Skill: [visual-timing](../../.agents/skills/visual-timing/SKILL.md) · [Evidence receipt](../../.agents/skills/visual-timing/references/effect-evidence.json)

[Reference](media/FX-07.mp4)

**Inputs:** Indoor and outdoor low-angle takes with matching foot approach and retreat

**Preparation:** Shoot paired foot action with matching direction and apparent shoe size

**Success criteria:** Shoe trajectory and camera angle connect without a conspicuous jump.

**Limitations:** Reference analyzed; no verified recreation packaged.

**Reference credit:** @celfstudies; https://www.instagram.com/reel/DdN_aljAIY0/ (credited-excerpt).

<a id="FX-08"></a>

### FX-08 — Objects float in → scene switches → white blips

**Status: partial** · Skill: [mask-glitch](../../.agents/skills/mask-glitch/SKILL.md) · [Evidence receipt](../../.agents/skills/mask-glitch/references/effect-evidence.json)

[Reference](media/FX-08.mp4) · [Recreation](media/FX-08-recreation.mp4)

**Inputs:** Outgoing scene; Incoming scene containing the objects in their final arrangement; One separate cutout/mask per object, extracted from or matched to the incoming scene; Object entrance order and final alignment targets; Background-switch time and per-object white-blip timing

**Preparation:** Extract each object independently; align its settled size/position with the incoming scene; build staggered entrances, one background switch, and alpha-confined white blips as one sequence

**Success criteria:** Objects enter separately over the outgoing shot, land without jumping when the background switches, then blip white within their own silhouettes. Reuse with a different number and type of objects.

**Observations:** Existing 1.5-second recreation uses 33 separately placed birds, one scene switch, and white flashes. Reuses the previously exported DreamCut working edit; no new export performed.

**Limitations:** Batched pop-ins adapt the reference rather than reproducing its individual float trajectories. No new input trial or fresh frame-by-frame fidelity review was performed for this packaging.

**Reference credit:** @celfstudies; https://www.instagram.com/reel/DdN_aljAIY0/ (credited-excerpt).

<a id="FX-11"></a>

### FX-11 — Drinks enter before their background

**Status: candidate** · Skill: [video-compositing](../../.agents/skills/video-compositing/SKILL.md) · [Evidence receipt](../../.agents/skills/video-compositing/references/effect-evidence.json)

[Reference](media/FX-11.mp4)

**Inputs:** Outgoing lunch shot; incoming drinks shot; separate moving hand-and-cup layers or approved still cutouts; landing targets

**Preparation:** Rotoscope moving hands/cups for close fidelity; static cutouts are a declared simplification

**Success criteria:** No clipped fingers, changing edges or jump when destination shot takes over.

**Limitations:** Reference analyzed; no verified recreation packaged.

**Reference credit:** @celfstudies; https://www.instagram.com/reel/DdN_aljAIY0/ (credited-excerpt).

<a id="FX-16"></a>

### FX-16 — Restaurant builds over the shot, then becomes the scene

**Status: candidate** · Skill: [video-compositing](../../.agents/skills/video-compositing/SKILL.md) · [Evidence receipt](../../.agents/skills/video-compositing/references/effect-evidence.json)

[Reference](media/FX-16.mp4)

**Inputs:** Walking shot; restaurant exterior; separate lantern/sign cutouts; ordered reveal times; landing targets; Sign with alpha; background; glitch interval; Background clip or adjacent shots; flash time

**Preparation:** Extract masks, stage pieces, align to exterior; compose FX-03/17/18 as dependencies

**Success criteria:** Staged objects align to the incoming exterior; the glitch and flash resolve cleanly as part of the same scene handoff.

**Limitations:** Reference analyzed; no verified recreation packaged.

**Reference credit:** @celfstudies; https://www.instagram.com/reel/DdN_aljAIY0/ (credited-excerpt).

<a id="FX-15"></a>

### FX-15 — Laptop-edge scene wipe

**Status: candidate** · Skill: [recreate-effect](../../.agents/skills/recreate-effect/SKILL.md) · [Evidence receipt](../../.agents/skills/recreate-effect/references/effect-evidence.json)

[Reference](media/FX-15.mp4)

**Inputs:** Laptop-closing clip; destination clip; visible lid edge through transition; edge annotations or tracking

**Preparation:** Track/annotate moving diagonal edge and foreground occlusion

**Success criteria:** Reveal hugs the moving laptop edge without exposing wrong-side pixels.

**Limitations:** Reference analyzed; no verified recreation packaged.

**Reference credit:** @celfstudies; https://www.instagram.com/reel/DdN_aljAIY0/ (credited-excerpt).

<a id="FX-02"></a>

### FX-02 — Paper unfolds across cuts, then becomes a handheld title

**Status: candidate** · Skill: [recreate-effect](../../.agents/skills/recreate-effect/SKILL.md) · [Evidence receipt](../../.agents/skills/recreate-effect/references/effect-evidence.json)

[Reference](media/FX-02.mp4)

**Inputs:** Two or more video windows in order; chosen cut durations; Paper title artwork; transparent crumpled-to-flat sequence or source to produce one; background; Title artwork with alpha; pulse frames; Matched title artwork; handheld-card footage; exact handoff pose/time; foreground hand mask if needed

**Preparation:** Capture stop-motion or prepare an alpha deformation sequence; preserve flat artwork and fold states

**Success criteria:** Paper opens into readable artwork and transitions into the handheld card without a visible positional jump.

**Limitations:** Reference analyzed; no verified recreation packaged.

**Reference credit:** @celfstudies; https://www.instagram.com/reel/DdN_aljAIY0/ (credited-excerpt).

<a id="FX-05"></a>

### FX-05 — Persistent time and activity labels

**Status: candidate** · Skill: [video-typography](../../.agents/skills/video-typography/SKILL.md) · [Evidence receipt](../../.agents/skills/video-typography/references/effect-evidence.json)

[Reference](media/FX-05.mp4)

**Inputs:** Background clip; chapter rows with start/end seconds, time text and activity text

**Preparation:** Create editable chapter text; validate non-overlapping chapter times and safe margins

**Success criteria:** Labels remain legible and update exactly on chapter boundaries.

**Limitations:** Reference analyzed; no verified recreation packaged.

**Reference credit:** @celfstudies; https://www.instagram.com/reel/DdN_aljAIY0/ (credited-excerpt).

<a id="FX-10"></a>

### FX-10 — Lunch before/after match cut

**Status: candidate** · Skill: [visual-timing](../../.agents/skills/visual-timing/SKILL.md) · [Evidence receipt](../../.agents/skills/visual-timing/references/effect-evidence.json)

[Reference](media/FX-10.mp4)

**Inputs:** Before and after lunch clips with corresponding plate layout and camera angle

**Preparation:** Select matching frames and conform framing; retain at least 0.25s handles where available

**Success criteria:** Plate positions feel continuous while food state changes.

**Limitations:** Reference analyzed; no verified recreation packaged.

**Reference credit:** @celfstudies; https://www.instagram.com/reel/DdN_aljAIY0/ (credited-excerpt).

<a id="FX-19"></a>

### FX-19 — Dinner before/after match cut

**Status: candidate** · Skill: [visual-timing](../../.agents/skills/visual-timing/SKILL.md) · [Evidence receipt](../../.agents/skills/visual-timing/references/effect-evidence.json)

[Reference](media/FX-19.mp4)

**Inputs:** Before and after bowl clips with matching viewpoint and bowl center

**Preparation:** Same match-cut recipe as lunch; preserve source windows

**Success criteria:** Bowl center and scale agree across the cut.

**Limitations:** Reference analyzed; no verified recreation packaged.

**Reference credit:** @celfstudies; https://www.instagram.com/reel/DdN_aljAIY0/ (credited-excerpt).

<a id="FX-20"></a>

### FX-20 — Remove-to-show title reveal — provisional

**Status: candidate** · Skill: [video-typography](../../.agents/skills/video-typography/SKILL.md) · [Evidence receipt](../../.agents/skills/video-typography/references/effect-evidence.json)

[Reference](media/FX-20.mp4)

**Inputs:** Background; exact title and secondary copy; available font

**Preparation:** Use separate native text actors and optional star; inspect font metrics

**Success criteria:** Define what is removed or moved away and what it reveals, then verify the revealed title follows that interaction. Exact mechanism remains pending.

**Limitations:** Reference analyzed; no verified recreation packaged.

**Reference credit:** @celfstudies; https://www.instagram.com/reel/DdN_aljAIY0/ (credited-excerpt).

<a id="FX-SCRATCHPAD"></a>

### FX-SCRATCHPAD — White paper outline

**Status: partial** · Skill: [scratchpad-treatment](../../.agents/skills/scratchpad-treatment/SKILL.md) · [Evidence receipt](../../.agents/skills/scratchpad-treatment/references/effect-evidence.json)

[Reference](../../public/guide/effects/scratchpad-silhouette-before.png) · [Recreation](../../public/guide/effects/scratchpad-silhouette-after.png)

**Inputs:** Transparent silhouette; White paper border width and texture

**Preparation:** Preserve the source; add an even continuous white perimeter with enough transparent overscan.

**Success criteria:** White edge wraps the full silhouette without clipping. Subject pixels and pose remain unchanged when applying the current skill.

**Observations:** Existing styled silhouette demonstrates a rough white paper perimeter.

**Limitations:** Historical generated example changes the source pose; it is a style example, not a passing source-preservation trial. Static effect uses image evidence rather than a video clip.

**Reference credit:** Madeleine Price Ball / Wikimedia Commons, CC0 1.0 (licensed).

## Promoted workflows without public media

`src/lib/effects/promoted-recipes.ts` contains public construction briefs promoted
from working local recipes. Speed Entrance & Exit, Mask Glitch · Glow and Moving
Grid Matte are available in Guide and Library with optional demonstrations. They
are labelled implemented, with their remaining acceptance limits; this is not an
upgrade to the evidence catalog's complete status. Private reference files remain
local, and their redundant discovery cards are replaced by the shared briefs.

Public examples can be added later using generated source footage and an actual
editable construction. No personal working footage is required for promotion.
