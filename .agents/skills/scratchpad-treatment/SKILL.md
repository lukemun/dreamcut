---
name: scratchpad-treatment
description: "Apply and audit the DreamCut Scratchpad appearance on cards, logos, cutouts, and other visual actors. Use when the user asks to Scratchpad an asset, add the white cut-paper edge, or repair an uneven, clipped, or incomplete Scratchpad perimeter."
---

# Scratchpad treatment

Scratchpad is a continuous white cut-paper perimeter around the complete visible actor. It is an appearance treatment; timing, position, scale, rotation, and scene overlap remain separate instance properties.

For multiple concentric paper colors, progressively wider bands, or a stacked collage silhouette, use [layered-paper-cutout](../layered-paper-cutout/SKILL.md). This skill owns the single white-perimeter treatment.

## Full-perimeter contract

- Wrap every exterior edge with one consistent white margin, including straight crop edges and corners.
- Reserve overscan before building the perimeter so rotation, clipping, or the source rectangle cannot cut it off.
- For opaque cards and graphics, use a white outer silhouette plus an inset content silhouette. Keep the inset distance uniform on all four sides. Do not imitate a perimeter with directional white shadows.
- A subtle dark cast shadow may sit outside the white silhouette, but it must not replace or distort the white margin.
- Preserve the subject or card interior sharply. Edge smoothing belongs on the expanded perimeter, not across the interior artwork.
- For transparent people or moving alpha video, follow [talking-head-cutout](../talking-head-cutout/SKILL.md); matte continuity must pass before styling.

## Scene use

Keep Scratchpad actors separate and editable. When several actors accumulate, read [spatial-composition](../spatial-composition/SKILL.md) and author one semantic arrangement rather than giving every actor the same center. Vary position and rotation only when the editorial direction calls for it, and keep protected faces, captions, and safe areas readable.

Existing working-timeline placement changes go through [open-edit-proposals](../open-edit-proposals/SKILL.md). The proposal preview must show the combined scene.

## Review

Inspect the actor on black at delivery resolution. Confirm:

- the white margin is visible and materially even on every edge;
- no corner, rotated tip, or source boundary clips the margin;
- the interior has no white islands introduced by the treatment;
- repeated actors use the same perimeter width at the same visual scale; and
- representative entrance, hold, and exit states preserve the perimeter.

Do not call a directional shadow, partial stroke, or clipped border Scratchpad-complete.

## Effect recipe evidence

[Catalog-linked input/output evidence](references/effect-evidence.json) records reference, recreation, hashes, and limitations. Candidate and partial records do not establish a verified reusable effect.
