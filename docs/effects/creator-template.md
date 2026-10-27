# Contribute an effect creators can use

An effect contribution is a reusable method with an optional demonstration and a clear input
brief. Implemented workflows can ship without public media, with remaining QA limits
declared; a demonstration does not itself prove verification. A cropped reference alone is a **candidate**, not a finished recipe. Creators
should be able to decide whether they have suitable footage before asking an agent
to build anything.

[Browse all effect pages](recipes.md) · [Packaging and evidence](README.md) · [Submit a PR](../../CONTRIBUTING.md#contributing-an-effect)

Use the [visual recipe standard](../standards/recipe-visual-presentation.md): the result, inputs and ordered transformation frames must explain the recipe before detailed text.

## The page template

Use this order in Properties → Templates, Guide → Effects and public recipe pages.
Keep the existing navigation and full-aspect media previews. Do not introduce a
new effect application button: this is an agent handoff, while applied parameters
remain available in Properties and proposal tweaks.

| Section | What to include | Why |
| --- | --- | --- |
| Name and evidence state | Stable catalog ID, plain-language name, owning skill, candidate/partial/complete status | The person and agent must identify the same recipe and understand its maturity. |
| Demonstration | Playable recreation with enough lead-in and follow-through to understand the handoff; separate credited reference | An isolated flash frame does not explain the effect or prove motion. Preserve the full image; avoid crops that conceal the action. |
| Visual inputs | Labelled source thumbnails, required/optional counts, and clear supplied versus agent-prepared roles | Explain what to film or upload, not just technical intermediates. Say which masks, cutouts or tracking the agent prepares. |
| Supply or generate | Which inputs can plausibly be generated, which must come from the creator, and continuity constraints | Generated motion may not match; suitability is not a verified model capability. A recipe never silently authorizes generation. |
| What happens | Three or four ordered demonstration frames and one plain-language sentence; build details collapsed below | Show the relationship between the inputs and result. |
| Ask your agent | Stable ID and skill, replaceable input/target line, desired sequence, retained choices, proposal boundary and observable checks. Creators select the template in Templates; the agent reads this request as its brief | A request must work with another creator's assets, without private paths or sample-specific subjects. |
| Evidence and limits | Known failures, simplifications, unsupported input types and what was actually tested | Partial examples remain useful without implying universal support. |
| Credits | Source and recreation credits with rights basis | Attribution alone is not redistribution permission. |

### Authoring worksheet

```markdown
# [Effect name] · [FX-ID]
Evidence state: [candidate / partial / complete]
Owning skill: [skill-name]

## Demonstration
[Recreation link, or explicitly “not available yet”]
[Separate reference link and credits]
Show: [starting state → intermediate action → resolved state]

## What you supply
- Required — [count and role]: [what to capture, framing, movement, continuity, handles]
- Required — [text/artwork/timing]: [what must be exact]
- Optional — [asset]: [what happens if omitted]
The agent prepares: [cutouts, masks, tracking, derived images as applicable]

## Supply your own or generate inputs
[Suitable generated inputs, constraints, and where real footage is required]
[Whether this path was tested; never promise unsupported model capabilities]

## How the effect is built
1. [Prepare from the supplied assets]
2. [Build the visible action]
3. [Resolve the effect and check continuity]

## Ask your agent
Use [skill-name] and catalog recipe [FX-ID] for [desired outcome].
My files and target: [replace with assets, order, selected clips and timing].
Preserve [source pixels, speech timing, or other essential constraints].
Ask for missing inputs. Stage any generation separately for my review and authorization.
Keep meaningful layers and controls editable. Return a proposal for my existing
edit; do not apply or approve it. Check [observable success criteria] and report gaps.

## Evidence and limits
[Tested input types and trials; known failures and simplifications]
[Reference/result/input credits and redistribution basis]
```

## Where each part lives

- `docs/effects/catalog.json` owns recipe identity, technical inputs, preparation,
  success criteria, evidence artifacts and maturity. Skill evidence receipts remain
  reciprocal; creator copy does not change an evidence claim.
- `src/lib/effects/creator-guides.ts` owns the creator brief keyed by catalog ID:
  `inputs` with titles and directions, `generation` suitability, and ordered `steps`.
  Write preparation in the steps instead of asking creators for intermediate files.
  Optional inputs must say “Optional” in their title.
- `src/lib/effects/guide.ts` publishes demonstrated catalog entries with their
  packaged media. Reference-only candidates stay in the documentation catalog.
- `src/lib/effects/guide-examples.ts` contains the existing curated demonstrations.
  New standard entries should use catalog publishing rather than add another manual
  publication path.
- `src/lib/effects/agent-request.ts` builds the shared agent handoff. It includes
  recipe identity, creator inputs, sequence, known limitations and review boundaries.
- `src/components/studio/timeline/EffectRecipeInstructions.tsx` renders the same
  input/generation/build brief in Library and Guide. Creators select a template card
  (`templateSelection`) rather than copying a request.
- `docs/effects/recipes.md` and the marked README index are generated. Do not hand
  edit them; run the command below after changing catalog or creator briefs.

```bash
pnpm exec tsx scripts/generate-effect-pages.ts --write
pnpm check:effects
```

`check:effects` checks creator-brief coverage and documentation freshness as well
as evidence packaging. It does not claim the effect looks correct. The standalone
page generator without `--write` is a read-only freshness check.

## PR acceptance checklist

- [ ] Another creator can identify the inputs, capture them and understand the build.
- [ ] Demo shows the full action; reference and recreation are clearly distinguished.
- [ ] Required versus optional inputs and agent-prepared intermediates are clear.
- [ ] Generated-input guidance is bounded; any tested provider/model is recorded
      with its actual evidence, not inferred from a generic generation claim.
- [ ] Copy the request with different files. Confirm it chooses the right recipe,
      asks for missing inputs and returns a reviewable proposal with useful controls.
- [ ] Supply input/output evidence and inspect the whole motion sequence. Verify
      source preservation, reuse and declared success criteria before marking complete.
- [ ] Include public redistribution rights, original credits and portable paths;
      exclude private projects, personal recipes, credentials and local receipts.
- [ ] Update creator brief, generated pages, catalog and reciprocal skill receipt.
- [ ] Run `pnpm check:effects`; for UI changes also run `pnpm check:editor-ui`,
      `pnpm typecheck`, and inspect narrow/wide layouts, playback and copying.
- [ ] Follow the normal code/PR review gates in CONTRIBUTING. List unverified checks
      and remaining limitations in the PR; do not mark them as passes.

## Presentation acceptance

With no explanation from the contributor, ask a reviewer to choose a recipe and
answer: “What must I supply? Can I generate any of it? What will the agent do?
What is unproven?” Then have them select it. Inspect the complete demo,
keyboard access, the selected state, and long instructions in both workspace
layouts. Reading source or passing typechecks cannot substitute for this UI check.

## Is this a recipe or a direct control?

Before contributing a discovery card, apply the
[placement rules](../architecture/properties-and-recipes.md#recipe-discovery-versus-transition-samples).
A simple transition between adjacent clips belongs in the join inspector; a basic
single-clip operator belongs in Properties → Effects. Use the common sample artwork
for their teaching previews. Reserve full demonstration/input/agent-request pages
in recipe discovery for constructions such as speed entrance/exit, layered paper
cutouts and subject-led scene handoffs. Documentation may retain a transition study
before direct support exists, but the UI must not imply it is an available control.
