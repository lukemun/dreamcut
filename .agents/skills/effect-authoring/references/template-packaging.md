# Package an effect as a shared Template

The shared-card steps of [effect-authoring](../SKILL.md). For an effect recreated from a
reference, the reference and timing map come from [recreate-effect](../../recreate-effect/SKILL.md).

Use this after the effect works, to make it a Properties → Templates card. A creator
who has never seen the reference must be able to tell three things from the card:
what the result looks like, what they must supply, and what DreamCut makes for them.

## Workflow

1. **Reference.** Download the reference into scratch storage and build a timing map
   (see recreate-effect). Record the creator's credit and URL. Never reuse its pixels.
2. **Route.** Choose the smallest construction: native operations, a style recipe,
   new editor capability, or a `motion_graphic_prepare` overlay when the look is
   procedural (for example a letter grid or a drawn path) and the footage stays native.
3. **Demo project.** Create one with `assembly_create`, record the direction, and
   import owned or licensed footage with `media_import`. Place the base cut, call
   `assembly_handoff`, then add the effect as a proposal so its controls appear on
   the card. A layer placed directly in a workspace has no composition controls.
4. **Controls.** Expose what a creator would change first: content (words, labels),
   timing for each event, including uneven cuts, size, colour and a seed. Read every
   declared control literally (`c.word_1`); the check rejects computed keys.
5. **Verify.** Check frames for the entrance, peak and settled states. Check in the
   editor with the card's Replay. Render a second set of inputs to prove reuse.
6. **Repository copy.** Projects are not committed. Copy the composition or recipe
   into the owning skill with a recipe page: inputs, build steps, controls, measured
   timing and limits.
7. **Teaching media.** Write `public/recipe-previews/<id>/`:
   - `result.mp4` (720×1280, or 1280×720 for a landscape demo; normal speed, no audio) and `poster.jpg`, a result frame
     chosen by looking where the effect is most legible (not the first frame);
   - 3–4 stage stills;
   - a playable untreated source take under Input for footage-based effects, paired
     with Result; verify source hashes and excerpt offsets, reusing an existing
     authorized preview of the same take when possible. Supply thumbnails for still
     inputs and typed inputs (`words`) only for actual text inputs. A checklist or
     finished-result crop never replaces the source take;
   - the prepared layer, made legible at thumbnail size;
   - `manifest.json` with rights (`owned` or `pexels-license`), credit, a construction
     receipt, and SHA-256 hashes for every source and output.
   Set the `RecipeVisual`'s `tile` (`x`, `y`, `at`) when the centre of the poster or the
   frame at 1 s does not show the subject at tile size; check the tile in the editor.
   Run `src/lib/effects/recipe-visuals.test.ts`.
8. **Card.** Add the `GuideEffect` to `src/lib/effects/promoted-recipes.ts` and the
   matching `RecipeVisual` to `src/lib/effects/recipe-visuals.ts`. The detail view
   renders them as Result → You supply → How to film. Keep
   `needs` short enough to read as a checklist.
9. **Close out.** Run `pnpm typecheck` and `pnpm check:editor-ui`, open the card in the
   editor, and report the limits on the card. Rendering the teaching media from the
   demo is not an export of the creator's project. Never approve the demo proposal
   for the creator.

## Known gaps (2026-10-11)

- The creator selects a template card and names the clips in chat. The card does not
  collect inputs or bind clips to input slots.
- The preview-media script (`scripts/record-recipe-demonstrations.ts`) is hard-wired
  to Mask Glitch. Each template still assembles its teaching media by hand.
- Composition controls are tunable only on the proposal card, not in the inspector
  after approval.
