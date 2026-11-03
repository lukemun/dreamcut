# Reusable artwork and composition transfers

## Ownership contract

An asset version owns a visual object's appearance. A timeline instance owns its position,
size, rotation, opacity, start, duration, and motion. Use a stable asset ID and immutable
version, and retain the source, appearance recipe, output hash, dimensions, padding, and
reference evidence. A person's name label is a separate object from the portrait. A panel's
flag, text, and other independently adjustable contents are separate objects.

When the user selects an existing composition as the appearance reference, freeze that
specific source revision before deriving assets. Search existing packs and project source
manifests first. Do not substitute an approximately equivalent asset or redraw its treatment.

Transparent PNGs are appropriate for intentionally unified static artwork such as a portrait
with its white outline or a logo with its shadow. Preserve an editable appearance recipe.
Keep placement and motion native. A PNG is resolution dependent; record its intended logical
size and capture scale. Larger reuse may need a new resolution derived from the same recipe.

## Available enforcement

`node scripts/freeze-dom-assets.mjs build <spec.json> <new-pack-directory>` captures specified
local HTML leaf objects at a reference time. Surface-only capture explicitly removes children.
The tool refuses duplicate IDs, ambiguous selectors, accidental child composites, unsupported
generated pseudo-element content, and replacement of an existing pack directory. It saves:

- separate transparent artwork PNGs at 2× logical size;
- self-contained per-object HTML recipes and source dependency snapshots;
- original computed appearance, scene bounds, and ancestor geometry;
- the original scene reference frame, renderer version, and fingerprints;
- an indexed gallery and machine-readable manifest.

Build checks every object for a nonempty image, transparent outer margin, and byte-identical
browser screenshot after replacing the isolated HTML artwork with its PNG at the same size.
This comparison verifies the frozen object, not its placement in another renderer.

`node scripts/freeze-dom-assets.mjs verify <pack-directory>` fails on changed or missing
pack files or live source dependencies. Source drift means a refresh is needed; it does not
invalidate historical saved artwork or authorize overwriting it. The command checks recorded
proof and hashes; it does not rerun captures or verify a destination timeline.

Before transferring saved artwork, run this verification and import unchanged bytes using
managed media ingestion. Check imported hashes against the pack. Existing-timeline adoption
uses proposals and the existing revision/approval/history contract.

## Transfer acceptance contract

A source asset match alone does not establish an accurate transfer. Before describing a full
scene as faithfully ported, record these distinct checks:

1. Asset identity: asset ID/version/hash, including outlines, shadows, and crop treatment.
2. Structure: each adjustable object has a separate timeline element; repeated objects share
   one source asset and use different instance IDs.
3. Geometry: logical size, padding, anchor, ancestor transforms, crop, opacity, and stacking.
4. Motion: entrance/exit times, easing, overshoot, stagger, and final pose at representative times.
5. Rendering: compare the reference with production DreamCut frames at matched times.
   Record pixel metrics and inspect differences. Font rasterization, resampling, color, and
   clipping can differ even with the same transforms. Never assert pixel equality from boxes.

Native text alternatives remain text and must use measured matching fonts and layouts. If a
label is intentionally saved as artwork, its text is changed through a new asset version.

## Architecture to implement next (not shipped enforcement)

Persist an `asset_ref` on each timeline instance: pack ID, version, asset ID, SHA-256, and
logical geometry. Add an `adopt_asset_version` proposal operation which resolves the pack,
verifies bytes, preserves instance transforms, and records both old and new versions.
Preview, approval, and export should use the same resolver and reject unresolved references.
Record user layout edits separately from asset-version changes so retros can distinguish them.

Add a transfer receipt linking source composition hash and semantic selectors to destination
instance IDs, time mapping, geometry, and verification frames. A draft whose source revision
changes becomes stale. A transferred scene remains pinned until an explicit version update.

DreamCut owns scene layout and timing after transfer. Keep HyperFrames as the archived
appearance/motion reference. True bidirectional scene editing would require both editors to
consume a shared scene format and resolve conflicting edits; independently editing HTML and
timeline JSON cannot safely provide automatic synchronization.

Current limitations: asset references and parity receipts are not yet enforced by proposal
approval or export. The capture tool supports this local static DOM artwork workflow, not
arbitrary nested scenes, canvas/WebGL, pseudo-element artwork, external resources, or font
packaging. Saved PNGs remain portable; rebuilding text recipes depends on available fonts.
