---
name: layered-paper-cutout
description: "Build and verify an editable stack of concentric paper silhouettes around an existing transparent actor. Use for multicolor collage outlines, equal-distance expansion, separate paper layers, contour smoothing, overscan, or stacked cut-paper depth; use scratchpad-treatment for one white perimeter only."
---

# Layered paper cutout

Build the effect as a stack of separate transparent assets and DreamCut elements. Preserve the foreground actor unchanged; derive every backing silhouette deterministically from its alpha. This skill owns construction and verification, not a universal palette or collage taste.

Read [scratchpad-treatment](../scratchpad-treatment/SKILL.md) for the full-perimeter contract, [video-compositing](../video-compositing/SKILL.md) for layer mechanics, and [spatial-composition](../spatial-composition/SKILL.md) for combined-scene verification. Existing working-timeline changes follow [open-edit-proposals](../open-edit-proposals/SKILL.md).

When the user or active style context selects a named aesthetic, read the matching entry in the [style recipe catalog](../../style-recipes/README.md). Recipes supply optional palette, width rhythm, texture, rounding, and shadow character; they never override this construction contract. The reviewed multicolor treatment is [progressive-color-paper-stack](../../style-recipes/progressive-color-paper-stack.md).

## Construction contract

- Keep the foreground actor and every paper color as separate editable elements in one contiguous top-first lane block.
- Give every layer the same canvas, center, timeline scale, position, and duration. Encode size differences in the alpha contours, not by scaling duplicate images; whole-image scaling makes the top and bottom gaps grow faster than the side gaps.
- Generate contours with Euclidean-distance or equivalent circular dilation so a named radius means approximately the same width around the complete silhouette.
- Treat visible band width separately from cumulative radius. When the selected direction calls for progressively wider bands, increase the per-layer increments; do not confuse those increments with cumulative radii.
- Smooth the expanded perimeter without blurring the actor interior. When the selected direction calls for rounder outer sheets, increase contour smoothing toward the back so small source ridges do not repeat identically through every color.
- Reserve transparent padding beyond the widest contour and its antialiasing fringe. Fail rather than clip the outer sheet.
- Keep paper grain restrained and deterministic. Do not use image generation to derive backing layers unless the user explicitly requests a generated composite.
- Use short alpha-aware cast shadows to separate sheets. The foreground actor should read highest; backing shadows should recede rather than forming directional outlines.

## Deterministic builder

Use `scripts/build_layered_paper_cutout.py` when the source is a transparent still. It crops to the visible actor, adds sufficient transparent padding, writes an aligned foreground copy plus one PNG per paper layer, and records hashes and contour parameters in `derivation.json`.

Each layer value is `role:#rrggbb:visible-band-width:edge-smoothing`. Widths accumulate outward in argument order.

```bash
python3 .agents/skills/layered-paper-cutout/scripts/build_layered_paper_cutout.py \
  --input /absolute/path/to/transparent-actor.png \
  --output-dir /absolute/path/to/output \
  --layer 'paper-1:#f7f4eb:12:1.0' \
  --layer 'paper-2:#263b59:12:1.0' \
  --preview
```

Those values demonstrate the interface, not a default look. Pull authored values from the selected style recipe or current user direction.

## Review

Before proposal creation, inspect the generated preview on black and confirm:

- every color is visible on the left, right, top, bottom, limb gaps, and around the feet;
- requested band widths increase or remain constant in the intended order;
- outer contours lose repeated micro-ridges without becoming soft or inflated;
- the actor remains sharp and no interior paper islands were introduced;
- the widest sheet and shadows have transparent overscan; and
- the proposal preview preserves the shared transform, layer order, and editability.

Run spatial preflight on the exact proposal. `frame-state` verifies the working timeline only after human approval; do not claim it validated a pending proposal.
