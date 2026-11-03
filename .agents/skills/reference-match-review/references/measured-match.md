# Measured reference matching

Use when the creator requests a close recreation, especially after feedback about
size, turning, trajectory or edge artifacts. This is a review procedure, not an
automated perceptual score or permission to change a timeline.

## Establish the comparison

Use the actual reference demonstration and requested original source assets. A
finished reference is evidence, not a replacement input. Preserve hashes, intervals,
source PTS, candidate revision and output resolution. For a tutorial viewport, record
the display crop and aspect mapping; exclude player chrome from measurements.
Align one declared start/cue and frame-rate mapping. Do not independently retime each
sample, rescale the candidate or move its crop to hide discrepancies. Any intentional
adaptation belongs in the brief before grading.

Values read from another editor are source-editor measurements. Establish that
editor's canvas, origin, axis direction, anchor and scale convention before converting
them into native positions. Follow the [coordinate-frame policy](../../../../docs/standards/spatial-authoring.md#coordinate-fallback)
and the native transform owner; correct native arithmetic does not establish the
source editor's convention. Cross-check the conversion against rendered reference
landmarks in the declared fixed viewport. Keep the displayed label and measured
rendered placement as separate evidence. If their mapping is unresolved, retain an
unverified conversion instead of treating equal numeric values as a geometry match.

Measure the visible subject silhouette and stable landmarks, not the source file's
transparent/padded rectangle. Record center, width/height, orientation and occlusion
at onset, intermediate motion, each local position/scale/rotation extremum, payoff,
settle and exit. Include the top of an arc and frames immediately around direction
changes. A turning flat object may change perspective, visible face, width and
foreshortening: angle alone cannot establish that it turns correctly. Track corners
or equivalent landmarks as well. Do not call a 2D spin equivalent to a 3D turn.

Measure the reference's construction rather than eyeballing it: `reference_match` (mode `takes`)
reports, per region of the frame, which supplied take and source window each reference frame shows,
with fitted speeds, cuts and still plates. Split the frame where takes may be layered (for example top
and bottom). Grade the candidate with mode `candidate` against a frame-state report of the card. It
returns per-region error and a timing offset for each still, plus a side-by-side image.

## Declare tolerances

The creator's specified limits and requested precision win. First declare whether
acceptance requires exact timing/geometry or faithful reproduction of the effect's
complete actions. For an effect-faithful brief, use the numbers below to locate
potential mismatches, then judge materiality in playback; a harmless small deviation
is not automatically a failed effect. Missing rotation, growth, actors or payoff
remains a material failure regardless of numerical similarity elsewhere.

Use these disclosed starting budgets for a close quantitative match on comparable
framing; they are engineering defaults, not validated perceptual thresholds. Tighten them for fine boundaries, text or a more exact brief.
An adaptation requiring different limits must state why before the revised trial;
never loosen limits merely because a candidate failed. Explicit later creator
acceptance is a versioned requirement change, not such a loophole; regrade its scoped
criteria and retain the original measurements.

| Trait | Default maximum deviation at every required comparison |
| --- | --- |
| Cue/onset/extremum/settle/exit time | 2 output frames, using actual PTS mapping |
| Subject center and stable corner/landmark positions | 2% of canvas width on x and 2% of canvas height on y |
| Visible subject width and height | 5% of the corresponding reference subject dimension, not 5% of canvas |
| In-plane orientation | 3 degrees, with continuous unwrapped angle and the same direction/number of turns |
| Growth/shrink and motion phases | Same order, direction and extrema; compare intermediate geometry against the limits above |
| Layer order, face visibility, intended occlusion | Must match, except declared adaptations |
| Unintended clipping, matte spill, halos, holes, detached pixels or edge pops | No visible new defects at delivery size in playback or inspected frames |

If a reference dimension is near zero or hidden, mark it unmeasurable and compare
visible landmarks/occlusion instead. Record measurement uncertainty. Claim a quantitative-budget pass only when the supported error bound fits inside
the tolerance; ambiguous measurements remain unverified, not rounded into a pass.
For an effect-faithful acceptance, record acceptable observed differences separately;
do not withhold that verdict solely for missing subframe precision the brief does
not require. Keep maximum errors and their timestamps;
mean error or a weighted total cannot conceal a failed important trait.

## Inspect the complete motion

Review synchronized normal-speed playback and matched frames of the combined output.
For a short effect, inspect every frame through motion, including handles; enlarge
ambiguous areas. For long effects, follow template-authoring's interval coverage rules
and explicitly retain uninspected ranges. Geometry samples alone do not prove
continuous edge quality. A small contact-sheet thumbnail cannot clear a subtle halo.
Check at delivery size and inspect suspect boundaries enlarged. When export is
requested, compare decoded output to preview; an encode success is not a visual pass.

At scale/rotation extrema, inspect the subject and matte together. Look for garbage
mask bounds that fail to follow transforms, clipping from a growing subject, changing
key/spill behavior, exposed background patches, and discontinuities between keyframes.
These are diagnostic candidates, not assumed causes. Verify the actual cause before
repairing. If the motion needs unsupported perspective or geometry, record the
capability gap instead of silently substituting a simpler motion.

## Record and act on the result

Save a compact evidence table with trait, reference frame/PTS and value, candidate
frame/time and value, unit, tolerance, uncertainty, maximum error, evidence path and
pass/fail/unverified. Include artifact locations and affected frame ranges, full
inspection coverage, source/candidate hashes, and explicit adaptations. Report
reference fidelity separately from renderer health, UI/control acceptance and reuse.

A material fail or required unverified trait prevents reference-matched/complete
status. Keep such renders labeled candidates in review galleries. Correct through
the existing proposal workflow, then recheck changed motion and dependent masks,
including the full entry/exit. Reuse evidence only for unchanged inputs/revisions and
review questions. The independent grader applies the same frozen criteria; a fresh
same-input build proves repeatability, not transfer to different assets. Human
approval remains separate from all measured checks.
