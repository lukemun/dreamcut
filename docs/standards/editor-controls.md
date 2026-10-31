# Editor controls: use these components

A numeric effect row has one familiar interaction everywhere:

```text
Glow strength   ━━━━━●━━━━   [ 180  + ]  %   ↺   ◇
                            [      − ]
label           slider       exact value    reset keyframe
```

The slider and number agree. Click the number to type; drag it horizontally to scrub;
use +/− for one step or arrow keys for keyboard changes. Unit and range are explicit.
Do not replace this row with a plain browser number input. Small panels may wrap the
row but must retain the slider, exact number, clickers and applicable actions.

## Component map

Video viewers use `Player` in `src/lib/frame-runtime/player.tsx` and its shared
`PreviewControls`. Controls overlay the picture with a transparent background in
both the timeline and source/reference viewers. Reuse the shared seeking, volume,
focus and expansion behavior; do not rebuild transport in individual workspaces
or override range inputs through broad form selectors.

Visual asset collections use `MediaGallery` from `src/components/ui/media-gallery.tsx`.
Mark the primary image or video with `data-media-preview`. The shared owner reads
intrinsic browser dimensions and packs consecutive cards with
`media-gallery-layout.ts`; previews retain their natural aspect ratio. Do not add
fixed-aspect/cropped thumbnail frames in Library, pickers, Storyboard or generation
results. Callers retain search, sort, stable asset keys and actions. Presentation
reflow never changes source order or the edit. Target height, gap, minimum card
width and optional maximum items per row are shared layout inputs, not source edits. `evenRows` shows every
preview in a row at that row's shared height (natural shape, contained, never cropped) for
galleries whose cards are widened for labels. The template gallery (`TemplateCatalog`) is the
exception: owner direction (2026-10-26) sizes its cards like Captions → Looks, so it uses
`CatalogTile` (below) with the example contained in the tile's picture, and has no column control.
Keep titles/actions outside the preview. Audio uses its waveform/list presentation. The detailed waveform surface is `RhythmWaveform.tsx`, shared by Rhythm Viewer and Storyboard source review. Full-recording review uses one mix lane; instrument separation belongs to Rhythm Viewer. Source marks keep source time and do not place media in the edit.

Choosable panel items that are not media (caption looks, text presets, fonts) use
`CatalogTile` and `CatalogTileGrid` from `src/components/studio/timeline/CatalogTile.tsx`.
Across editor panels, clicking an item selects it for chat and never edits: `useChatSelection`
turns it into a removable pill in the composer. The tile's `+` button and dragging onto the
timeline (`shelf-drag.ts`) are the manual paths. Music and Sounds rows follow the same
select / `+` / drag split. Template tiles (`TemplateCatalog`) also select on click, with
the tile's blue circled-information Details action at the right of the name opening the template
(`actionText="Details"`, with an accessible label and tooltip; outside a project,
`toggle={false}` makes the click open it). Text previews use `CaptionStylePreview`, which applies the
renderer's own caption CSS and fonts.

| Task | Canonical component | Example consumer |
| --- | --- | --- |
| Numeric effect, including animated values | `InspectorEffectNumber` in `src/components/studio/timeline/InspectorEffectNumber.tsx` | `SubjectGlowControls.tsx`, `TransitionEffectControls.tsx` |
| General slider + scrub number + clickers + unit | `SliderScrubControl` in `src/components/studio/timeline/InspectorNumericControls.tsx` | `ElementMenu.tsx` grading and transforms |
| Number-only control, where a slider would not be meaningful | `ScrubNumberInput` in the same module | Timeline start/duration; document the reason for omitting a slider |
| Label, Reset and keyframe diamond | `InspectorPropertyControl` in `src/components/studio/timeline/InspectorPropertyControl.tsx`; `density="compact"` uses the shared `.inspector-property-row[data-density="compact"]` grid in `globals.css` (label column, value, Reset; stacks below 360px per row). Never add per-panel row layouts | The effect controls above |
| Static choice | `OptionSelect` or shared `Select` in `src/components/ui/select.tsx`; never a browser `<select>` | Form-controls standard |
| Optional treatment | `ClipEffects` in `src/components/studio/timeline/ClipEffects.tsx` | Effects |
| Button with a keyboard shortcut | `Button` from `src/components/ui/button.tsx` holding an icon (and a word where room allows) followed by `Keycap` from `src/components/ui/keycap.tsx`; the button names the key in `aria-label` or `aria-keyshortcuts` and its tooltip, e.g. "Done (Enter)". Never print shortcuts as loose text beside a button | Proposals card actions, the mark-a-place bar (`FramePointOverlay.tsx`) |

Import shared controls directly from their owning module. `ElementMenu` temporarily
re-exports `ScrubNumberInput` for old callers; do not introduce new imports from that
large consumer. Low-level `Slider` and `Input` are implementation parts of the shared
numeric controls, not a reason to create another editor-specific numeric widget.

## Example: a static percentage property

```tsx
<InspectorPropertyControl
  fields="subject_flash" label="White flash" disabled={false}
  onReset={() => onPatch({ subject_flash: 0 })}
>
  <InspectorEffectNumber
    label="White flash" value={flash * 100} max={100} unit="%"
    onPreview={value => onPreview(value === null ? null : { subject_flash: value / 100 })}
    onCommit={value => onPatch({ subject_flash: value / 100 })}
  />
</InspectorPropertyControl>
```

For animated values, resolve the value at the clip-local playhead and write its
keyframe on preview and commit using the same patch builder. Use the existing
`SubjectGlowControls` as the complete example for shared Reset and diamond behavior.
Key the numeric adapter by property and local time so seeking cancels an unfinished
input rather than writing the draft at another moment.

## Gesture contract

- Slider/scrub movement and typing update a temporary preview. They do not write history.
- Release, a clicker step, blur after typing, or Enter commits one edit. Enter must not also commit a second edit on subsequent blur.
- Escape and pointer cancellation clear the draft. Unmount clears active preview. Selection and seeking must not transfer drafts to another item/moment.
- Reset restores the declared identity and removes that property's animation. Effect Reset is a separate, clearly scoped preset action.
- Keyframe diamonds appear only for supported animated properties. Units and numeric bounds are identical in preview, commit and renderer.
- One committed change requires one Undo. Verify the picture as well as the displayed value.

## Enforcement

`pnpm check:editor-ui` runs `inspector-control-policy.test.ts`, also included by
`pnpm test`. It parses JSX and rejects added numeric/range input implementations
outside the shared owner. Explicit per-file legacy ceilings prevent existing debt
from growing; they are migration debt, not permission to add new exceptions. New
files have zero allowance. The gate also checks that flash/glow and blur/reveal
use the shared adapter with preview/commit wiring.

The structural gate catches the regression that prompted this standard. It does
not prove usability or all event behavior. Run the editor-ui-design skill's visual
and interaction checks as well. A change to the common component must be verified
against its existing consumers, not just the newly added effect.

## Overlay layers

Anything that floats over the app (header, floating panels, dialogs, menus, dropdowns, popovers,
tooltips) stacks on the one scale in `globals.css`: `--layer-header`, `--layer-panel`,
`--layer-dialog-backdrop`, `--layer-dialog`, `--layer-popover`, `--layer-tooltip`. Each layer opens
from the ones below it, so a tooltip or info panel always shows above the dropdown it came from. Use
`z-(--layer-…)` in classes or `"var(--layer-…)"` in inline styles; never a raw number of 100 or
more. Prefer the shared `Tooltip`, `ActionMenu` and `Select`, which already sit on their layers, and
don't pass a z-index to them. `stacking-layer-policy.test.ts` (in `pnpm check:editor-ui` and `pnpm test`) rejects raw overlay
numbers, a positioner, backdrop or dialog viewport without a layer, and a scale where tooltips are
not on top.

## Properties hierarchy and shared sections

Use these components instead of local title/disclosure styling:

| Level | Component | Example | Treatment |
| --- | --- | --- | --- |
| Section | `InspectorSection.tsx` (registered sectionId) + `InspectorHeading` | Effects, Color | 15px semibold, primary ink; shared section spacing/divider |
| Item within section | `InspectorItemHeader` from `InspectorHierarchy.tsx` | Subject Flash, Subject Glow | 13px medium, secondary ink; optional enable checkbox and trailing actions |
| Property | `InspectorPropertyControl` and shared numeric controls | Strength, Radius | Existing compact label/control row |
| Optional tool/details | `InspectorDisclosure` from `InspectorHierarchy.tsx` | Video scopes | Content-width chevron/text trigger; expanded content below |

Section headings must be visually stronger than their children. Do not create
nested full-width action buttons just to reveal optional information. Applying an
effect is an action; opening scopes is a disclosure. Headers own typography and
spacing so consumers do not override font sizes or weights. Keep scope sampling
and editor mutations in their existing owners; the hierarchy components only
control presentation and disclosure. Use native heading semantics (h3 section,
h4 item) and expanded/controls relationships for keyboard-accessible disclosures.

Source review, Rhythm Viewer and the editor ruler use `TimelineMarks.tsx` for persistent time flags and selection. Callers adapt source or timeline seconds explicitly; the component only displays and seeks marks, never saves edits or converts clocks.

## Useful dial ranges

Proposal sliders use a working window centered on the authored value, shared by
main and Advanced controls. Anchor that window for the gesture; do not recenter
on each preview sample. Exact entry and clickers retain the full validated domain.
A genuine boundary (such as zero opacity or exhausted source handles) may prevent
centering; never invent invalid values to make the thumb look centered.

Treat display windows separately from validation limits. Registered numeric domains
must agree across preview, commit and renderer; an additional relative-change cap
must not reject a value exposed by the control. Preserve source bounds, dependent
timing, locks and mutation scope. Check both sides of the authored value through
the actual proposal validation path, including Advanced adjustments.


## Control family catalog — Properties redesign

The library has **13 input/interaction families**. This counts user-facing
patterns, not React exports; variants and composed rows share owners.

| # | Family | Use for | Current owner / gap |
| --- | --- | --- | --- |
| 1 | Slider + exact numeric value | Bounded visual adjustment, e.g. opacity or blur | `SliderScrubControl`; `InspectorEffectNumber` adapts effect semantics |
| 2 | Exact numeric field | Start time, duration, counts; no meaningful slider range | `ScrubNumberInput`; axis pairs and linked dimensions compose it |
| 3 | Text field | Names and caption words; single/multiline variants | `ui/input.tsx`; multiline and draft semantics need consolidation |
| 4 | Boolean control | Independent enable/mute; checkbox or switch by context | `Checkbox` from `ui/checkbox.tsx` (`tone="apply"` where it picks what Apply applies); a browser checkbox is refused by `pnpm check:editor-ui` |
| 5 | Segmented choice | 2–4 short, familiar mutually exclusive options | `SegmentedControl` owns layout; selection semantics need consistent binding |
| 6 | Text select / combobox | Named choices understood without imagery; searchable when large | `OptionSelect` (flat) and `Select` (grouped) own the in-app popup; browser `<select>` is refused by `pnpm check:editor-ui`. Search is an explicit variant |
| 7 | Visual choice | Shape, visual treatment, animation, alignment where a diagram helps | `InspectorVisualChoice` owns shared selection, keyboard behavior and tokens |
| 8 | Color picker | Swatch, exact color and supported alpha | `InspectorColorControl.tsx`: `InspectorColorControl` (labelled Properties row with Reset), `InspectorColorField` (swatch + exact hex, as on proposal cards), `ColorSwatchInput` (swatch alone in a compact row) and `ColorHexInput`; a browser colour input elsewhere is refused by `pnpm check:editor-ui` |
| 9 | Asset picker | Bind/replace a media source with visible identity | `MediaGallery` handles browsing; compact binding row needs extraction |
| 10 | Keyframe / curve editor | Temporal points, values, interpolation | `KeyframeInspector`, `MotionCurveEditor`; shared collapsible header with line markers |
| 11 | Canvas manipulator | Spatial handles with corresponding exact fields | `VisualMaskEditor` and preview owners; preserve existing target adapters |
| 12 | Action button | Prepare, import, reset, remove; verb-based operation | `ui/button.tsx`; variants share semantics and tokens |
| 13 | Ordered list | The order of several named items, e.g. a checklist's points or a slideshow's pictures; drag rows to reorder, keyboard move up/down | Owner missing; never stand in for it with numbered sliders or "position" fields |
| 14 | Graph / wheel | A value shaped as a curve or a colour direction: grading curves, colour wheels, colour slices | `CurveGraph`, `ColorWheel`, and `GradeDial` (which picks one for a grade field); stateless value in / value out, `size="card"` on proposal cards. Drag commits once on release, Escape cancels, exact values sit beside the graph |

These families sit inside the existing structural owners: section/heading,
item header, property row, disclosure and domain navigation. Reset and keyframe
are row actions, not alternate numerical inputs. A slider and its number are
one value, not two competing controls. Asset thumbnails use natural aspect
ratios; abstract visual-choice diagrams may use a fixed specimen frame.

### Choosing the family

- Continuous scalar with a useful adjustment window → slider plus exact field.
- Precision entry without a useful window → numeric field; state its unit.
- Independent yes/no → boolean control; never use a two-option dropdown.
- Small familiar categorical choice → segmented control.
- Choice distinguished by appearance or motion → visual picker.
- Named data choice without a useful picture → text select; add search when needed.
- Color → swatch and picker; media identity → bound-asset picker.
- Position in the composition → canvas handles plus canonical numerical rows.
- Evolution over time → property keys and the shared curve/time editor.
- Which one of several things (which section, which layout, which take) → a choice the
  creator reads by name: segmented when the names fit side by side, otherwise a text
  select. Never a slider: a slider means "more or less of something", so a slider over
  1–4 reads as an amount and hides what each position is.
- The order of several things → ordered list (family 13), dragged into place.
- A shape over a range (tone or hue) or a colour direction → graph or wheel (family 14),
  never a row of sliders standing in for points.
- Ask what the creator is deciding, not what type the value has. An integer can be an
  amount (slider), a count (numeric field with its unit) or a pick (choice).

### Dials on proposal cards and motion graphics

Proposal dials and a model-authored graphic's declared controls (`dreamcut.controls.json`)
follow the same families; the card renders each kind with its owner:

| Declared kind | Shown as | Pick it when |
| --- | --- | --- |
| `number` | Slider + exact value (family 1) | An amount with a useful range: duration, opacity, size |
| `number` with `unit` and few positions | Same, read as a count | A count of things ("rows", "items") |
| `choice` | Segmented (family 5) when up to 4 names fit in about 26 characters, else text select (family 6) | One of several named things. Name options after the creator's own words with `label_from` (e.g. a section picked by its title) |
| `switch` | Checkbox (family 4) | An independent yes/no |
| `text` | Text field (family 3) | Words that appear on screen |
| `color` | Swatch + exact value (family 8) | A colour |
| list (grade wheel, curve, slice) | Graph or wheel (family 14), one dial toward the limit | A colour grade the creator steers by shape or direction |

Rendering a graphic refuses a `number` with 8 or fewer whole-number positions and no
unit (`controlKindProblems` in `composition-manifest.ts`): it is almost always a pick
that belongs in a `choice`. Derive values that follow from another choice instead of
offering both: a section card's title is its chosen section's words, not a second field.

An enum in the schema does not imply a dropdown in the interface. Color names,
shape names and animation names alone conceal the information needed to choose.
Selecting an already-applied object is navigation; a text list may be appropriate
when its identity matters more than its appearance. A large applied-effects list
can use preview/name rows while keeping selection separate from add/remove.

### Visual choice contract

Each tile has a persistent label, a representative diagram/thumbnail and a
selected indicator independent of color. Static choices use static diagrams.
Temporal choices use faithful, bounded preview playback on hover, keyboard focus
or an explicit Preview action; reduced-motion mode retains a useful static image.
Do not animate an entire gallery continuously. Preview never commits, writes
history or seeks the project. Selection commits once and reveals that choice's
applicable parameters immediately below; the selected choice remains visible.

For small sets, keep the tiles in place. Larger sets expose a small useful subset
plus the current selection and a clearly labeled visual browser/Show all action.
Never replace it with a text-only dropdown to make the panel fit. At narrow widths,
reduce columns and use the inspector's existing scroll region. Avoid nested scroll
traps. Give tiles accessible names and radio-group selection semantics; arrow keys
move focus, Space/Enter select, and Tab leaves the group. Focus alone previews only.

Entrance/Exit remain legacy migration surfaces as recorded in the
Properties/recipes architecture. Using a visual picker does not authorize keeping
recipe orchestration in Properties.

### Shared behavior and state

Every family documents default, hover, focus-visible, disabled with reason, mixed,
invalid and loading states where applicable. Visual choices also show selected;
property rows show keyed/not-keyed only where animation is supported. Mixed values
must not display an arbitrary first item as the common value. Error text remains
beside the affected input and describes recovery.

Continuous gestures use draft preview, one commit and one Undo; Escape/cancel
reverts the draft. Discrete selection commits once. Reset, disable and remove retain
their different meanings. All appearances, popovers and portals use shared tokens.
Widths reflow without dropping labels, units, exact entry or row actions. Production
acceptance covers both themes, keyboard operation and both workspace layouts.

### Migration priority

1. Reuse the production visual-choice owner for shape, animation and other visual
   values; bind each choice to supported fields and shared property-row actions.
2. Consolidate color, boolean and bound-asset inputs; keep existing numeric and
   hierarchy owners. Do not build a second full component system.
3. Maintain a component showcase covering light/dark, narrow/wide and the
   required states.


Properties category sections use one vertical column in both workspace layouts. Width changes row spacing and tile wrapping, not section order or side-by-side property groups. Effects use an always-visible visual choice list with one detail editor beneath. Each tile distinguishes Applied (select to tune) from Add effect (a directly supported basic operator). Omit unapplied treatments that require preparation; their discovery and agent workflow belong in Properties → Templates, not a clickable More effects catalog in Properties. Persistent controls and proposal tweaks share parameter identities and bindings as defined in the [Properties and recipes architecture](../architecture/properties-and-recipes.md#discovery-proposal-tweaks-and-persistent-tuning). Do not hide basic available effects behind an Add effect accordion or text dropdown.


### Shared visual selectors and keyframe header

`InspectorVisualChoice` owns visual parameter tiles, selected state, keyboard
focus and theme tokens. Arrow keys move focus without editing; Enter/Space choose.
Use it for blend modes, native animation choices and mask shapes. Choice artwork
is illustrative; the actual player remains the authority for the rendered result.
Do not add unsupported choices to make a selector look complete.

`KeyframeStrip` owns grouped line markers, previous/next, Add, seeking and collapse.
`TimelineInspectorPanel` owns the selected moment and writes through the actual
member/local-clock adapters. `KeyframeValuesPanel` appears only inside that header.
`InspectorDisclosure` accepts optional trailing actions so disclosure and action
buttons remain separate accessible controls. Keyframe scalar rows, line mask
position/rotation, and applied aura/contour values reuse the shared numeric owners.
Their removal from the custom-input allowance is intentional; do not add them back.

### Workspace dividers

`src/components/ui/workspace-resize.tsx` owns bounded panel resizing, keyboard
adjustment, drag cancellation, reset and local size persistence. ProjectReviewDock
and TimelinePlaybackShell supply responsive bounds; these are workspace preferences,
not timeline edits. Reuse this owner for new workspace boundaries.
