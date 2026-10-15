# Inspector information architecture

The [editor UI architecture](../architecture/editor-ui.md) explains workspace surfaces and state ownership.

This standard governs the editor's **Properties** inspector. It exists so a user can switch between clips without relearning where a control lives or what a tab name means.

Feature additions follow [editor feature integration](editor-feature-integration.md). Shared media sections declare a stable `sectionId` in `inspector-sections.ts`; display titles must never act as routing keys. Native reveal and blur controls live in **Animation → Reveal & blur** during the legacy-operator migration. Layout owns base placement, sizing, opacity and layer blending. Selecting a keyframe opens its values in the shared collapsible header without changing the selected domain.

The [Properties and recipes target architecture](../architecture/properties-and-recipes.md) records the agreed separation and pending inspector migration. The domains below are the implementation contract; recipe composition must not introduce another authority for fundamental property values.

## What qualifies as a tab

A tab is a stable editing domain that answers one user question. It is not a single feature, an implementation detail, a disclosure level, or a generic bucket.

A proposed tab must meet all of these conditions:

1. It represents a peer task domain, not one control or one effect.
2. It normally contains at least two related sections or a repeated, high-frequency task.
3. Its contents can be described in one sentence without “and everything else.”
4. Its position remains stable when the selection changes.
5. Its label names the job the user is doing.

Use a section or disclosure inside an existing tab when a feature does not meet that threshold. Do not create tabs named **Basic**, **Advanced**, **Other**, or **Clip**: those names describe hierarchy or implementation, not intent.

## Canonical domains and order

Properties use one category-navigation level. Sections stack in a single column in
both workspace layouts. A visual choice may use a responsive tile grid; that is
one control, not parallel columns of property sections.

| Order | Domain | User question | Includes |
| --- | --- | --- | --- |
| 1 | **Layout** | Where and how is it placed? | Position, scale, orientation, mirror, opacity, layer blend; optional crop and perspective |
| 2 | **Color** | How do I correct its image? | Tone, color balance, advanced grading, LUT and recolor |
| 3 | **Mask** | Which parts remain visible? | Shape mask, background removal, then chroma key |
| 4 | **Effects** | How do I tune a treatment on this item? | Directly applicable basic operators and persistent tuning of applied effects |
| 5 | **Animation** | How does its native entrance or reveal behave? | Entrance, exit, optional reveal and stabilization; link to an eligible join |
| 6 | **Audio**, when present | How does it sound? | Gain, fades, sound treatment and prepared rhythm controls |
| 7 | **Timing** | Where does this item sit in time? | Start, duration, source trims, speed and synchronization |

Media uses the above relative order, omitting unsupported domains. Audio is omitted
for stills and videos confirmed to have no audio; mute does not remove the domain.
Sound-only selections use Audio and Timing. New picture selections default to
Layout; new sound selections default to Audio. Blend is a visual choice beside
opacity, never a standalone Compositing section under a generic Style tab.

Captions use **Text · Layout · Animation · Timing**. Text owns words, typography,
text alignment, fill/treatment and caption display. Layout owns position, box width
and supported surface geometry. Timing owns cue placement and synchronized word
timing. Surface-tracked text keeps its attachment controls in Layout; omit native
Animation when that rendering mode does not support it. Multi-selection retains
only controls with defined batch-edit semantics. Do not add decorative controls for
prototype fields that have no supported persisted/preview binding.

Properties effects do not host recipe discovery, More effects, or Apply with agent.
Properties → Templates owns those workflows. Selecting an applied effect changes only
which controls are visible. A basic Add effect action makes one explicit undoable
edit. Existing prepared treatments remain tunable even though their construction
belongs in Library. See the [Properties and recipes architecture](../architecture/properties-and-recipes.md).

Within Animation, Entrance and Exit are consecutive groups rather than nested tabs.
Show the selected operator's duration only when it applies. Existing saved native
animation parameters remain editable; this does not authorize new bundled movement
presets. Optional reveal/stabilization controls use shared disclosures after the
common groups. Each says whether it affects this clip’s start or end. Boundary
transitions have their own selection and focused inspector naming A → B, with
visual type choices, duration and Remove. Animation may link to the next join,
but never embeds the transition editor. Opening a join is navigation; choosing
a type is an undoable edit. If no eligible next clip exists, show the reason.

Join eligibility uses the same frame-based adjacency validator as persistence:
the immediate clips must touch on the same visual lane and both have sufficient
duration. The current renderer uses the incoming opening frame during the outgoing
handoff, so spare source handles are not required. Duration is bounded by both
clips and the two-second maximum. Hover/focus exposes Add transition at an empty
eligible join; an applied transition retains its persistent marker. Keyboard and
pointer actions select the same join without requiring two selected clips.

Prepared rhythm controls remain a peer Audio section. Optional reframing and
advanced geometry use shared disclosures in Layout. Clip settings contains object
actions, not processing controls or duplicate Undo/Redo. Caption creation stays in
Library, separate from fine-tuning a selected picture's properties.

## Timing is not “Clip”

Background removal and **Shape mask** are distinct sections within Mask, never a
separate Cutout tab. Keep ordinary placement first. Subject removal exposes an action
or transparency status. Shape masks expose visual presets and **Edit mask on preview**;
the shape tiles and current selection must always be visible at the top of the
Shape mask section in Mask, before Feather or numeric adjustments. Never gate
the picker on Layout or bury it under Precise values. Show only renderer-supported
shapes (currently None, Rectangle, and Line), not decorative unsupported presets.
Edge handles manipulate the renderer's composition-space mask, with one commit per
completed gesture. Pointer cancellation, blur, seeking, or unmount discard unfinished
gestures. Arrow keys adjust an edge; Shift gives finer steps. **Done** leaves editing.
Show shape-specific controls: Line uses Position, Rotation, Feather, and Invert;
Rectangle exposes Rectangle edges. None exposes no edge-position fields. Never
show independent-edge or band modes for a Line mask.
The Line preset reveals one side of a divider with a single drag handle,
an exact **Rotation** angle with a continuous slider, a draggable rotation handle
on the preview, Reset, and **Flip visible side**. Rotation gestures preview without
writing history until release; cancellation discards the draft. Identify the resolved
picture target by name. Do not require a manual source/cutout switch.
Rotation is currently static (no diamond); the mask moves along its rotated normal.
Feather softens inward from the dividing edge, not the far canvas
edge. Legacy two-sided bands retain their geometry as rectangular masks.
An already-keyframed mask automatically adds/updates a point at the playhead.
Base-only, cutout-only, and matte diagnostic views do not belong in normal Properties.
Properties must show the composite result, including when recovering a stale inspection state. Do not
offer Edit/Reset for generated pixels unless a reversible source-aware operation
actually exists. Layer-edge masking and regenerating a subject matte are distinct.

**Timing** has a dedicated tab for picture, text and sound. It describes when the item begins, how long it lasts, its source window and playback rate. Source trim labels say **Remove from start/end**, because the stored amounts are removed durations, not source endpoint timestamps. “Clip” is not a useful task label. Do not duplicate timing fields in Layout, Text, Animation or Audio.

For captions, Timing contains only applicable fields such as start and duration. Do not render disabled speed, trim, or volume rows just to make the panel look full.

Caption generation belongs in Library's caption workspace, where the creator chooses speech sources. Properties edits an existing selected item; a caption exposes its words and appearance without offering to create another caption rail.

Selection actions—Split, Duplicate, Remove, Close Properties—live in the Properties header. Reset and lock may live at the end of the relevant domain, but destructive actions must not be duplicated in multiple tabs.

## Keyframes

The Keyframes container exposes a compact **+ Keyframe** action even before a clip has keyframes.
There is no property picker. Add captures existing animated properties (excluding source-clock speed steps);
new audio automation defaults to Volume, and new visual automation to position, scale and opacity. This action
only adds at the playhead and is disabled when that property already has a point
there; it must never toggle an existing point off. Row diamonds retain their
existing toggle behavior. Static supported clips show an empty strip with the add action.
The strip displays the actual timeline playhead in clip-local time as an arrow on a
time ruler above the moment lane. Clicking or dragging the ruler seeks without
adding a point; arrow keys seek a frame at a time. Pointer release or cancellation
ends scrubbing. In the lane, a click within reach of a moment selects it; elsewhere
it seeks. Diamonds remain separate selection/retiming targets.

Keyframes are a property-level mechanism with one item-level overview. A selected item shows the full-duration keyframe strip above the domain tabs when it has a valid keyframe moment or supports the add action. The strip is not another timeline: it is a compact map of the selected item's local clock.

- One line marker represents one clip-local moment, even when several properties change there. Diamonds remain on individual property rows.
- Selecting a line marker seeks the main playhead onto it (a clip-end moment may land on the last frame) and shows all values and easing at that moment inside the header. Previous/next buttons jump between moments. Keep the current domain selected. Never require a dropdown or Back to Properties.
- Dragging a selected line marker horizontally retimes every property at that moment as one atomic edit. The final position snaps to the project frame grid and commits only on release, producing one undo/history entry.
- Properties animated elsewhere on the clip but not keyed at the selected moment are listed under its values with **Add**, which keys their current value there so later edits change only that moment.
- The selected-moment rows exist only while a moment is selected. Collapsing the header hides the strip and values without changing the timeline or active domain.
- Switching items clears the selected keyframe moment. Deleting the final moment removes its inline values; the supported empty strip retains Add keyframe.

- Put the diamond in the same trailing column on every animatable property row.
- Show it only when preview, persistence, interpolation, and export all support that property.
- A missing diamond means the value is static; it must not mean the control was forgotten.
- Start, duration, and source trims define the clip container and are not keyframed. Video speed may use **step keyframes**: every diamond is a hard media-clock cut, not a curve. The durable point stores an absolute source boundary and the rate that begins there; its clip-local display time is derived from the preceding segments. Moving a speed diamond moves that shared source boundary, and changing a segment rate reprojects all later diamonds and the clip duration without splitting the visible timeline object.
- Speed steps must use one shared piecewise source↔timeline resolver in preview, export, caption following, warmup, and framing. Raw timeline-time speed points are not an authority because changing an earlier rate would otherwise move the source content under every later point.
- Preset buttons may author several keyframes, but each resulting property remains independently editable.
- Use the same filled/empty/disabled diamond states everywhere, with an accessible label that names the property and playhead.

## Row anatomy and alignment

Audio volume and its Keyframe detail use the same dB scale and canonical gain
conversion: 0 dB is the source's original level, negative values attenuate, positive
values boost, and the fader floor means mute. Never switch to a percentage for the
same property in another tab. Keep stored linear gain and envelope semantics unchanged.
Volume has a flexible horizontal slider, a generously sized drag target, and an exact
numeric dB field; a narrow numeric scrubber is not its only pointer affordance.

Every adjustable property uses the same four-part row:

`label | flexible control | exact value + unit | keyframe/reset action`

- Align labels to one shared column within a panel; do not mix arbitrary 88px, 110px, and free-form label widths in neighboring sections.
- Align exact numeric values and units vertically so scanning does not zig-zag.
- Reserve the trailing action column even when a row has no keyframe; this keeps sliders and values aligned.
- Use one control density per Properties surface. A section may stack on a narrow viewport, but it must preserve the same reading order.
- Section headings state the result (“Timeline timing”); there is no helper text beneath them. Do not repeat the tab label as the only heading.
- Tabs use the shared `InspectorPanelTabs` primitive, equal-width slots, roving keyboard focus, and the same selected/disabled treatment.

## Compact presentation and source clarity

Text masks show the selected image or video as a thumbnail and a readable asset name under **Media inside text**. Video masks must not display empty image-sequence controls. Raw media URLs and source-clock lists belong in closed advanced source details. A handwriting entrance labels its duration **Drawing time** (lower is faster); the exit uses **Erasing time**. Keep these controls in Animation alongside the chosen effect.

The stable domain tabs are the panel's navigation. Do not repeat the active tab
immediately below them as a large collapsible heading. Within a tab, begin with
the editable controls and use a short result-oriented section heading only when
it helps separate two real groups.

Source relationships are status, not help content. Show a compact one-line
status near the selected item's identity or the controls it constrains, using a
human lane name (for example, **Synced to Original voice**) rather than only an
internal key. Detailed source clocks, processing limits, and recovery guidance
belong in a collapsed **Source details** disclosure after the ordinary controls.
A warning may move above the controls only when the current edit would otherwise
be unsafe or blocked.

Speech linking is separate from embedded-audio presence and mute. Only an explicit
speech timing relationship earns the timeline's chain icon and **Speech linked**
label; matching media filenames or zero volume cannot establish that relationship.
Manage the picture's connection in **Timing**. **Disconnect speech**
preserves media and current timing while removing this picture's speech dependency;
one Undo restores it. Show the source name and keep normal linked status neutral.
Reserve warnings for a missing linked source or measured timing drift.

Controls explain themselves. There are no help icons and no explanatory text
(both retired 2026-10-09 at the creator's direction: "better UX, not explanation
paragraph text"):

- name the result in the label, show the unit, and use a native `title` tooltip
  only for icon-only buttons;
- no page subtitles, section descriptions, instructional sentences or
  reassurance copy; if a control still needs words, rename or redesign it;
- text that remains is a label, a short empty state (a few words), status,
  progress, counts, data, or an actionable warning or error;
- the Guide's articles are documentation and are the one place for how-to prose.

For media with embedded audio, the timeline is responsible for source clarity:
the audible clip shows its waveform and the visual lane uses a human role name.
Properties may confirm that relationship, but it must not be the only place the
user can discover where sound is coming from.

## Selection persistence

### Enforced picture/audio authority contract

`resolveInspectorTarget` is the shared authority resolver for both Properties layouts.
Layout, Color, Mask, Effects, and Animation bind to the persisted picture member at the playhead;
Audio binds to its linked original speech source. Selecting original speech with a
linked cutout resolves visual controls to that cutout automatically. A compound's
representative or synthetic presentation row is never an editing authority.

Displayed values, preview overlays, and committed edits must use the SAME resolved
element ID and its local clock. Preview props must not be applied to the logical
selection's ID when the actual picture target differs. Missing/ambiguous targets
fail closed, never falling back to hidden speech footage or another compound member.
Keep source implementation layers out of the ordinary editing decision; do not add
a “Select presenter cutout” workaround. Explicit compound-wide operations retain
their documented group scope. This does not authorize agents to bypass proposals.

Regression coverage must include selection from both source and cutout, a later
compound member, exact cut boundaries, missing/ambiguous bindings, audio routing,
and changed renderer mask geometry on the resolved picture with the source and
other members unchanged. A control appearing or a value saving is not pixel proof;
report renderer-unit checks separately from actual preview/export pixel checks.

Common caption presentation changes (font, color, effect, alignment and box width)
apply atomically to the selected captions, preserving each cue's words, alignment,
source bindings and unrelated properties. Size and position keep their existing
group behavior. Words and source-dependent display timing remain cue-specific.
The inspector states this scope and disables word editing for multiple captions.
Specialized effect settings are still single-item controls, not a promise of universal
batch editing. Media position uses sliders with zero at the midpoint,
negative X to the left and negative Y upward. Exact X/Y fields retain per-axis
keyframe controls. Dragging previews the value and commits once on release;
cancellation discards the gesture. Both layouts share these controls. An optional
Preview grid toggle in the Layout panel overlays alignment guides on the preview
only, never the export. The preview itself has no grid button. Caption
position percentages retain their top-left origin; scale units convert at the UI boundary.

The active domain is workspace state, not clip data. Switching selections keeps the current domain when the new item supports it; otherwise the inspector falls back to that item's first useful domain. Returning to a compatible item restores the user's prior domain. Tab order never changes based on which optional features are available.

## Review checklist

Image and video layers expose Recolor in Color, separate from photographic
grading and its green–magenta Tint. Recolor provides a target swatch/hex, Amount,
and Preserve shading. Flat mode replaces RGB; shading mode maps source luminance
to the target color. Amount blends with the original; alpha remains unchanged.
Apply recolor commits one edit, Remove sets Amount to zero, and Reset draft
discards uncommitted changes. Existing `paper_fill_color` values resolve as
100% flat Recolor until explicitly overridden, without rewriting saved history.
Text and native graphic fills retain their native color controls.

### Reversible prepared picture effects

Background removal and baked Scratchpad are separate Applied effects, not status tags
or preview-only diagnostic modes. Switching Scratchpad off selects its verified clean
parent; switching background removal off selects the original picture and pauses the
Scratchpad choice. Re-enabling restores that choice. Both preview and export resolve
the same version with the original absolute source offset; the persisted speech binding,
placement and timeline clock remain unchanged. Restored original picture is silent.
Compound effect changes are atomic across members and use normal Undo history.
Missing originals, mismatched hashes or unavailable lightweight proxies fail closed;
never claim an effect was removed by hiding a baked outline control. Server preparation
must precede UI state changes. A file without provenance is explicitly non-reversible.

Before shipping an inspector change, verify:

- The control has exactly one obvious home.
- Its tab answers one user question and keeps the canonical order.
- Unsupported controls are omitted rather than shown as unexplained disabled rows.
- Every animatable field has the shared keyframe affordance and every static field omits it intentionally.
- Labels, controls, exact values, units, and row actions align with adjacent sections.
- Switching between at least two different item types preserves or predictably falls back from the active domain.
- The tall and wide layouts expose the same domains, labels, order, values, and keyboard behavior.
- The keyframe strip spans the full selected clip duration; selecting seeks exactly, dragging retimes the grouped moment, and the Keyframe detail view enumerates all values at that moment.


## Proposal adjustment feedback

Proposal review exposes the key appearance controls carried by the proposed change,
including color, tint amount, opacity, and blend mode when applicable. Use the same
validated values for temporary preview and human approval; never offer controls that
only update a label. Each control has a reset to the proposed value.

Adjusting a control refreshes the currently shown draft frame without seeking or
starting playback. Keep the player mounted and preserve its clock and pause state.
Replay remains an explicit action for judging motion. Coalesce rapid input and discard
superseded preview responses so an older adjustment cannot overwrite the latest one.

### Animation controls

Keep the selected entrance or exit effect and its duration visible together. Put alternative effects in a compact selector instead of displaying a full button gallery. Use Drawing time / Erasing time for handwriting. Attach contextual help to the relevant control; do not add an About these controls banner, repeat the active tab heading, or show implementation status in the main panel. Render only groups with applicable controls.

## Proposal adjustment plans

Proposal review makes every supported dial in the draft's tuning scope reachable.
The model selects the ordered **main controls** through `review_controls`; all
remaining applicable controls appear under **Advanced adjustments**, replacing the
Technical details disclosure. This selection changes presentation priority, never
editing access. Both tiers share labels, units, bounds, live paused-frame preview,
reset to the authored baseline and identical human approval semantics.

## Proposal control selection

For decision grouping, preview context, review states and approval, follow
[proposal presentation](proposal-presentation.md). Human position controls retain
[semantic-first authoring](spatial-authoring.md).

The preflight inventory identifies each dial's effective baseline, authored versus
implicit value, changed versus retained value, range, units and main/advanced tier.
Choose main controls from explicit requests and likely adjacent adjustments. New
placement normally prioritizes size and both axes; sound its level and fades;
handwriting its drawing time. Do not confuse configured values with an arbitrary
creation-property editor: source identities and unsupported structured values are
not dials.

A new draft that names no main controls gets a deterministic server default
(decided 2026-10-10): every supported field the option changes, each as its own main
dial in operation order, recorded as `review_controls_origin: "server"`. The default
never links dials or trims to the slider limit; the agent sends its own selection for
a different order, a linked group or adjacent adjustments. Stored proposals without a
selection keep the historical fallback.

Structured values get derived dials: `mask_inset_top|right|bottom|left` tune one crop
edge each, and `media_scale_peak` rescales a keyframed zoom about fitted size while
keeping its timing and easing (`src/lib/agent/proposal-controls.ts`). Approval writes the
stored value, never a derived name. Every new option also records `control_gaps`: changed
fields on existing clips that no dial can tune, with their value shape. The record is made
at authoring time so an audit trail copied from another machine shows what that creator
could not tune; `pnpm control-gaps [--projects DIR]` tallies it, and `--infer-legacy`
estimates gaps for older proposals with today's rules, reported separately.

Timing dials (`timeline_start` Start, `trim_start` Trim start, `trim_end` Trim end) apply
to existing clips' patches only and move just the fields the proposal already changes, as
the inspector's trims do: a head trim with a proposed length keeps the source out point (and
the timeline out point when the start is proposed too); Trim end changes the length. A
trimmed clip's start and length belong to its trim dials. Ranges stop at unchanged
neighbours on the lane, the source and one frame, inside the editor's move/trim caps.
Speech-bound clips and the speech they follow get no timing dials. Tuning reads each clip's
playback rate from the timeline, which preview, tuning and approval all pass.

Configured supported fields are available automatically. Native transitions also
include applicable implicit numeric defaults declared by their owning registry;
their default settings must not require a replacement proposal just to tune them.
Other absent fields need their current/default value configured in the draft and
revalidation. Never manufacture a dial for baked processing. Linked control children
stay under one atomic group binding. Fields owned by timing adapters cannot also
appear as independent sliders; protected fields remain outside tuning scope.

### First-proposal control coverage

New options expose at most **15 first-class numeric sliders**, counting a linked
slider once. Admission checks that main inventory, including the historical fallback.
All remaining supported controls stay available in Advanced; this is intentional
progressive disclosure, not an additional control budget. Required main decisions
must still fit a coherent reviewable beat. Split unrelated decisions while keeping
dependencies atomic; do not use mutually exclusive alternatives to evade this limit.

The first draft should let creators reach their intended result without an agent
revision merely to expose a dial. `review_controls` chooses the main tier, not an
allowlist. An empty explicit plan keeps every supported control in Advanced.
Historical fallback controls stay first-class, with the rest now reachable.

Before staging, map explicit requests and likely follow-ups to an actor/group,
working control, useful range and preserved constraints. A missing parameter is an
unsupported capability or an absent configured field, not an instruction to build
a decorative slider. Both tiers must update the paused preview, preserve its clock,
and carry the same validated values into approval. Main and Advanced use the shared
compact property, numeric and disclosure owners. Audit/source metadata stays in
the proposal record rather than a second Technical details panel.

### Audit tuning and improve selection

The audit target is a local, durable record of which controls were offered (including
order/tier), committed user adjustments with before/after values, resets, final
approval or rejection, and abandoned review sessions. Bind events to the proposal
revision, option, actor/control identity and owning skill. Coalesce slider drags into
completed adjustments rather than logging every pointer movement; record main versus
advanced exposure so hidden controls are not treated as rejected choices. Keep events
separate from timeline authority, and never turn a tweak into approval or a personal
preference automatically.

Current coverage is narrower: approval stores `resolution.numeric_overrides`, and
retros include those final overrides. Intermediate tweaks, resets and abandoned
adjustments are not durably captured by the current proposal panel. Complete interaction
auditing remains implementation work; main/advanced tier exposure is implemented.

Retros should review missing-dial requests, dial-only proposal revisions, range limits,
resets and final adjustments against the original intent and offered controls. Track
first-proposal control coverage and time to a usable result, with denominators and
missing-event coverage. Neither approval nor an untouched dial establishes satisfaction.
Classify failures as intent/selection, missing capability, inadequate range, unclear
label or incorrect control behavior; update the owning skill or implementation with
that evidence. Do not report improved selection from schema tests alone.

### Optional clip effects

Target migration: follow the [discovery, proposal tweaks and persistent tuning contract](../architecture/properties-and-recipes.md#discovery-proposal-tweaks-and-persistent-tuning). Properties retains applied-effect controls after approval. Properties shows only applied treatments and directly applicable basic operators. Agent-assisted treatments belong in Properties → Templates; do not expose a clickable More effects catalog here. The production path below describes the existing independent-operator flow.

Use **Effects → Add effect** for independently applicable clip treatments.
**Subject Flash** mixes a cutout toward white; **Subject Glow** adds an alpha halo.
Each has its own enable, reset, remove and shared numeric/keyframe controls.
Adding applies a visible static default; animate explicitly rather than injecting
recipe-specific timing. Disable preserves values and keys; Remove clears only the
selected treatment. Reset restores its static preset. Each edit is one Undo entry.
Legacy combined settings remain readable without rewriting project timelines.

**Mask Glitch** belongs in **Properties → Templates**: it coordinates source preparation,
subject isolation, timing, layers and scene handoffs. Its glow variant is an optional
ingredient. A clip treatment must not imply that it builds that full recipe.
Background removal retains its source preparation/recovery home; motion and motion
streaks remain in Animation; actual two-shot boundary effects belong in Transitions.
