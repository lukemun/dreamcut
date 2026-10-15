# Vertical video safe zones

Instagram, TikTok, and YouTube Shorts cover parts of the frame with their own player UI (header, caption block, action rail, CTA cluster). Anything composed under that chrome is invisible after upload, no matter how clean the export is. Compose *to* the safe area; export clean. The safe zone is an editor guide and a QC boundary, never a burned-in overlay.

Code authority: `src/lib/qc/standards.ts` (`safeAreaFor`). The numbers below are the reference at 1080x1920; scale proportionally for other canvas sizes.

Spatial assessment also returns `safe_zone_geometry`: explicit canvas-pixel lines
for `delivery_qc` and `editor_reels_guide`, labeled separately. The latter resolves
the same reference JSON drawn by the editor through `reelsGuideLines`; it is a pure
read-only calculation. At 1080x1920 its bottom is 1914/2622 × 1920, approximately
1401.56px, whereas delivery QC ends at 1248px. Do not silently equate these guides.
The `reels_interface_bottom_center` caption preset and
`reels_interface_caption_stack` presenter packing deliberately target the visible
reference guide when requested; they do not waive stricter delivery QC warnings.

The Reels editor guide must display full-height left/right edge-clearance bands
using these shared margins, independently of the reference interface polygons.
Amber bands identify edge clearance; gray areas identify interface clearance.
These are conservative placement guides, not a device-specific crop simulation.
Interface polygons alone do not establish side safety. Guides are editor-only and
must never crop, scale, reposition, or appear in exported media.

## The numbers (1080x1920)

| Target | Top | Bottom | Left | Right | Action rail |
| --- | --- | --- | --- | --- | --- |
| Instagram Reels | 270 | 672 | 64 | 65 | 193px right clearance below 44.8% frame height |
| TikTok | 240 | 660 | 120 | 120 | 300px right clearance below 62.9% frame height |
| YouTube Shorts | 5% | 5% | 5% | 5% | none (graphics-safe fallback, no measured template) |

The Reels numbers come from Meta's Ads Guide prose (14% top, 35% bottom, 6% sides) cross-checked against Meta's own Reels safe-zone template measured pixel by pixel; the rail is measured from Instagram Reels overlay templates. TikTok's template was measured the same way. Shorts has no platform-published numeric zone, so it uses the 5% SMPTE graphics-safe fallback with full-frame visual review required.

## Square and portrait feed posts

The platform templates above describe full-screen vertical players. A 4:5 or 1:1
(1080x1080) post is a feed post: deliver it as `feed` or `web`, which resolve to the
5% SMPTE title-safe area on the actual canvas (54px each edge at 1080x1080). Scaling a
vertical template onto a square canvas is not a measured square safe area.

## Organic vs paid-ad

Both resolve to the same measured template. The templates measure *player chrome*, which sits in the same place on organic uploads and paid placements; the only ad-specific extra is the CTA cluster at the bottom, which makes the template more conservative there, the safe failure direction. There is deliberately no lenient organic fallback.

## Also compose for

- **Home Feed preview:** Reels are shown at 4:5 in the feed, cropping 285px off the top and bottom of a 9:16 video. Put the hook where it survives that crop.
- **Profile grid:** 1:1 thumbnails. Text that matters should sit in the central square too, or accept the crop.

## Change record

- 2026-09-19: removed the organic 5% graphics-safe fallback from `safeAreaFor` (it blessed content that Instagram's own UI then covered on real organic uploads: 9:16 Reels losing top and right-side content after upload) and modeled the Reels action rail. Both modes now resolve to the measured platform template.
