# Inverted cutout lettering

A white image with transparent surroundings, blended with **Difference**, inverts the RGB colors underneath its opaque pixels. This is useful for a title whose lettering is cut out of a paper image rather than native editable text.

## Contract

Visual layers accept `media_blend_mode`: `normal` (default/reset), `difference`, or `exclusion`. The Transform inspector exposes Blend in both layouts. Opacity controls strength. Blend is static, not keyframed. White Difference and white Exclusion are identical; Exclusion is softer for gray source pixels.

The safe proposal creation and property-patch paths support this field. Preview and export use the same outer compositing layer. Blending must be outside a lane's isolated stacking context; putting it on the inner image would fail to see the lower footage. Transitions use the incoming visual's blend mode.

For existing cutout lettering, preserve the original paper and create a separate white letter silhouette from its enclosed transparent holes. `scripts/extract-enclosed-alpha-mask.ts source.png output.png` preserves dimensions and anti-aliased alpha. Inspect the result: unrelated enclosed holes are also extracted, and letters connected to the exterior cannot be recovered by this recipe. Place the mask directly below the paper, above the underlying picture, with matching geometry and timing. Never replace the title's shape with a similar font or invert the entire paper.
