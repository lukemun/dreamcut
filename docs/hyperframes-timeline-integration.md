# HyperFrames → Timeline Editor integration

Date: 2026-08-14

## Decision

Use HyperFrames as a linked motion-composition sidecar, not as a replacement for the Timeline Editor.
HyperFrames owns editable HTML/CSS/GSAP motion source and its transparent WebM derivative. The Timeline
Editor continues to own the master edit, audio, timing, compositing, and final export.

This gives us the animation quality and fast code-driven iteration shown in HyperFrames demos without
splitting editorial authority between two timeline products. A composition is deliberately rendered and
approved before it can appear in the Library; the editor never executes arbitrary HyperFrames source at
preview or export time.

## Operator workflow

From the repository root:

```bash
pnpm hyperframes-overlay scaffold <project-id> <composition-id> --resolution portrait
pnpm hyperframes-overlay check <project-id> <composition-id>
pnpm hyperframes-overlay preview <project-id> <composition-id>
pnpm hyperframes-overlay render <project-id> <composition-id> --approved
```

`preview` opens HyperFrames Studio for visual review. `render` intentionally refuses to run without
`--approved`. After a successful transparent render, reload the editor Library and place the new **Cutout**
asset on a visual track.

## Artifact contract

For project `<project-id>` and composition `<composition-id>`:

- Editable source: `projects/<project-id>/hyperframes/<composition-id>/`
- Render authority: `projects/<project-id>/media/hyperframes/<composition-id>/<composition-id>.<sha-prefix>.webm`
- Receipt: `projects/<project-id>/preprocess/hyperframes/<composition-id>.json`

The receipt records the source fingerprint, output checksum, dimensions, duration, cadence, codec, pixel
format, alpha evidence, HyperFrames version, render time, quality, and explicit approval. The Library only
promotes a receipt with a present output, valid safe paths, and `alpha_mode: "1"`. Placement copies linked
composition provenance into element props alongside `has_alpha: true`.

The render is a content-addressed derivative, never a new source of editable animation truth. An approved
rerender publishes a new media path instead of overwriting the file used by placed elements. A later refresh
workflow must compare the current source fingerprint to the receipt, show staleness, and require the user to
adopt the new approved render.

## Evidence level map

| Artifact or field | Level | Meaning |
| --- | --- | --- |
| HTML/CSS/GSAP composition source | Raw authority | Human- and agent-authored motion composition |
| Sorted source-tree SHA-256 | L1 extraction | Deterministic identity of the render inputs |
| ffprobe duration/dimensions/cadence/codec/alpha + output SHA-256 | L1 extraction | Facts measured from the rendered WebM |
| Library `Cutout` classification and `has_alpha` placement flag | L2 per-item analysis | Deterministic mapping from validated receipt evidence |
| Timeline placement, trim, transform, and layer order | Authored state | Editorial choices owned by the Timeline Editor |
| Suggestions about where/how to use an animation | L4 guidance | Goal-dependent advice; never emitted by this preprocessing command |

Changing Library mapping rules must not force a HyperFrames rerender. Changing source or render settings does.

## Milestones

1. **Linked overlay vertical slice — implemented.** Pin the CLI, scaffold/check/preview/render from the project,
   validate alpha output, persist a receipt, surface it as a Cutout, and preserve provenance on placement.
2. **Refresh state and actions — implemented.** The Videos panel can create compositions, shows Current /
   Changes-not-rendered / missing states, and exposes Open Studio, Check, and Approve and render around the same CLI
   contract.
3. **Typed variables.** Define a small composition manifest for safe text/color/image variables that the
   Inspector can update without treating arbitrary source code as timeline state.
4. **Embedding decision.** Evaluate an embedded Studio only after real posting work proves that leaving the
   editor for HyperFrames preview is the bottleneck. Keep the renderer out-of-process unless isolation and
   resource use are proven.

## Acceptance gates

- A scaffolded composition passes `hyperframes check`.
- An approved high-quality WebM render fails closed if alpha is absent.
- The output appears in the Library as a Cutout with receipt-owned duration.
- Placement persists alpha and linked-source provenance.
- Player and final export preserve transparency.
- Source edits cannot silently replace the render authority used by an existing timeline.
- Invalid, stale, or partial receipts are ignored rather than guessed through.
