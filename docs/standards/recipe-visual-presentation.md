# Visual recipe presentation

A creator must understand the result, required inputs and transformation from the
pictures before reading the build instructions. This governs Properties → Templates,
Guide → Effects and new public recipe contributions. Simple clip treatments and
boundary transitions remain in Properties.

## Required presentation

1. **Result first.** Show a short, full-aspect demonstration with a clear starting
   state, the complete action and a settled result. The poster is a frame from the
   result where the effect is visibly happening or just completed, never a plain
   first frame. Hover or keyboard focus plays silently; leaving or blurring pauses
   and returns to the poster. Play controls remain available for touch and keyboard users.
   Only one preview plays at a time; hidden/offscreen previews stop. Previewing
   never applies an effect or submits a request to an agent.
2. **Visual inputs.** Show the actual source images or representative source-video
   frames used by that demonstration, with short role labels and counts. Distinguish
   “You supply or generate” from “Agent prepares.” A prepared mask is not another
   required user upload. Show transparency for cutouts; preserve natural aspect.
3. **What happens.** Show three or four ordered frames from the demonstration,
   with short phase labels. The still sequence must explain the construction even
   when playback is unavailable. Follow it with one plain-language sentence.
4. **Details second.** Filming advice, generation constraints, build instructions,
   limitations and credited references support the visual explanation. Keep long
   guidance collapsed. Keep the agent handoff available without making the user
   read the instructions. Copying a prompt is not application or generation.

A video crop, a text list of inputs, or one flash frame is insufficient. Missing
visual inputs must be labelled as missing; do not invent source images or pass an
unrelated reference off as an input. A teaching illustration may simplify the
mechanism, but must say so and identify slowed timing. It does not upgrade a
recipe's reference-match or moving-mask evidence status.

## Shared owners and contribution acceptance

`TemplateCatalog` owns the one template browser (poster grid, detail view, Copy request)
for Properties → Templates, the Library and Guide → Effects; its detail composes the
`RecipeResult`, `RecipeIngredients` and `RecipeStages` parts in `RecipeVisualOverview.tsx`.
The gallery uses `MediaGallery evenRows`: posters keep their own shape, every picture in a row
shares one height, and descriptions read in full up to four lines. With both kinds present, All shows
"Your templates" then "Shared templates" as sections, so cards carry no ownership tags; the
All / Yours / Shared filter (with counts) appears only when the creator has templates of their own.
Templates without an example follow the posters as one quiet title-and-description list, never
empty tiles or filler text. Creator-facing labels say Templates (code keeps recipe/effect names),
limitations sit under a plain "Limitations" disclosure without evidence-status jargon, and Copy
request is a small secondary button beneath the demonstration. `MediaGallery`
owns natural-aspect input/stage layout, and `RecordedEffectPreview` owns playback
lifetime. `recipe-visuals.ts` maps shared catalog identities to curated teaching
media; user-only recipes cannot be overridden by a matching shared ID. Original
catalog evidence remains separate and credited.

A new curated example includes a playable result, a poster frame showing the effect,
labelled inputs with their supply/preparation roles, ordered result frames,
one-sentence transformation, credit/rights and a reproducible rendering receipt.
Use owned or explicitly redistributable media. Never package private project media.
Run the visual manifest tests, typecheck and editor UI gate. Inspect Guide and the
narrow Library drawer, focus/blur/reset and explicit play controls. An independent
visual-only reviewer should identify the inputs and explain the action without
opening the detailed instructions. Report missing legacy visual coverage honestly.

Mask Glitch is the first complete teaching example under this standard. Other
catalog entries retain their existing demonstrations and available source images;
missing input images are visible gaps, not completed migrations.

## Optional demonstrations for promoted workflows

A working recipe may be shared without a public demonstration. Publication and
implementation are separate from evidence maturity: retain known limitations rather
than claiming a verified recreation; evidence status stays in the recipe record and docs,
not as a label on the creator-facing card.
Supply the input brief, build sequence and copyable agent request even when media
is absent. Do not copy private reference footage or personal working examples into
public assets. The full visual requirements above apply when a demonstration is added.

For generated demonstrations, inspect the reference to plan the source action,
generate clean source footage, then construct the effect in an editable DreamCut
timeline. A model-generated imitation of the finished effect is not evidence that
the editor can build it. Record generated-source provenance, mask/source clocks,
controls and the actual construction before publishing the resulting demonstration.

## Selected recipe and tutorial playback

Keep the full source tutorial alongside a short browsing excerpt. Selecting a recipe
shows the full source when available, including the explanation after the effect.
Store its identity and content hash separately; never relabel an excerpt as a full
video. Originals stay private unless redistribution is explicitly permitted.

The selected view gives the video a full-width section, preserving its aspect ratio
and using up to 65% of viewport height. Put inputs and instructions below it. Full
source playback is explicit, with seeking and expansion; hover reset is only for
short browsing previews. The back action shares the title row. Use 16px body text
and 14px secondary text instead of tiny catalog labels. A short copyable request
names the recipe and asks for a reviewable proposal; the full construction brief
remains in the recipe rather than being repeated in the request.
