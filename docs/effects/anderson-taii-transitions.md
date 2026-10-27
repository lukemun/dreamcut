# Original reel — five transitions

Reference: [Anderson Tai / @anderson.taii](https://www.instagram.com/reel/Da0d8suu6kJ/).
Original SHA-256: `7b060ee3b2d5018072c5d34d0b3afd64f309e9496f9918615bc51fa93ea656b0`.
1440 × 1080, 24 fps, 463 frames. Frame numbers are zero-based presentation order.
All frames were inspected; ambiguous transitions were enlarged. Audio remains unanalysed.

## Catalog and inputs

| Entry | Visible reference interval | Required media | Recreation example |
| --- | --- | --- | --- |
| [FX-FILM-BURN](index.html#FX-FILM-BURN) | Frames 120–133 | Two shots; optional cleared film-burn overlay | Meadow → sunset silhouette; native warm flare (Pexels footage) |
| [FX-MASK-GLITCH](index.html#FX-MASK-GLITCH) | Frames 162–166 and 208–212 | Two shots, isolatable incoming subject, matching colour/white alpha mattes | Moving subject masks; continuous white → colour handoffs (Pexels footage) |
| [FX-CAMERA-FLASH](index.html#FX-CAMERA-FLASH) | Frames 267–271 | Two shots and cut point | Selfie → selfie; seven-frame white wash (Pexels footage) |
| [FX-BLACKOUT](index.html#FX-BLACKOUT) | Frames 313–331 | Outgoing lens cover and incoming lens uncover | Walker covers the lens, black hold, pack moves away to open on mountains (Pexels footage) |
| [FX-WHIP-PAN](index.html#FX-WHIP-PAN) | Frames 408–428 | Two shots, incoming camera turn and sufficient source handles | Neon crossing → billboard crossing; native motion smear (Pexels footage) |

The gallery pairs muted reference excerpts with the inspected recreation
frame sheets. These are **partial** studies, not five verified reusable presets.
Public redistribution clearance for these reference excerpts was confirmed by the
maintainer on 2026-09-29. The recreations were rebuilt on 2026-10-14 from
Pexels-licensed stock footage; each artifact lists its Pexels pages. Preserve the original creator credits;
see the [gallery rights record](README.md#media-redistribution).

## Mask Glitch timing

First handoff at source frame 166: frame 162 white incoming-feature silhouette,
163 off, 164 source-colour cutout, 165 off, 166 incoming scene. Second handoff at
212: 208 white, 209 off, 210 white, 211 off, 212 incoming scene.
The default 30 fps lead-in is five frames (roughly 0.167 s); the stock-footage
example lengthens it to nine so the steps read at gallery size. White and colour versions share alpha;
source RGB is preserved. Match cutout fit and position to the incoming full picture.
Moving footage requires time-matched mattes. A still mask held over a moving subject
does not reproduce the reference.

### Continuous variant

The continuous variant retains subject visibility through the reference's empty pulse frames. Cover the five-frame lead-in with two white frames and three
original-colour mask frames, then cut to the incoming scene. White and colour
matte geometry must remain identical. The catalog now shows this corrected variant;
the earlier pulse study is historical evidence, not the current example.

## Whip Pan — blend into the actual turn

Select **Whip**, enable **Blend into motion smear**, then set direction, duration
and motion-blur strength in the native transition inspector. Agents use
`create_transition` with `type: "whip"` and `params.motion: "smear"` in a proposal.
Choose the incoming source head where its camera turn has developed, rather than
using its slow opening. Preserve incoming head handles of at least
`transition duration × incoming playback rate` source seconds.

The moving overlap reads those real handles and continues at the saved source head
at the cut. For the stock-footage example: 0.4-second overlap at 1×, incoming head
handles before source 8.0 seconds, then source 8.0–10.0 seconds. Do not copy these example
times to unrelated footage: inspect its actual camera motion. Insufficient head
handles currently fall back to a held head frame, so revise the source head or
duration before calling that a motion-matched result.

Both shots stay full-frame while directional smear conceals their blend. The contact sheet covers every frame across the join and the first two incoming frames.

The earlier object-batch **Pop-in White Flash** recipe (FX-08) remains a distinct
catalog construction because its entrance and post-switch white blips differ.
The canonical [Mask Glitch skill](../../.agents/skills/mask-glitch/SKILL.md) now
owns both: continuous masks by default, with the earlier batch/pop behavior as an
explicit variant. It also builds consecutive A → B → C handoffs as one coordinated
editable sequence. The old pop-in-white-flash name remains a compatibility route.

## Agent handoff

Read [recreate-effect](../../.agents/skills/recreate-effect/SKILL.md) and the selected
catalog receipt. Use video-compositing for alpha/overlay composition and visual-timing
for captured cover/pan joins. Required input roles and unresolved limits are in each
receipt. Preserve full clips with approximately 0.5–1 second of source handles.
Apply edits to working timelines through proposals; a practice preview is not approval.
Inspect the reference-relative moving interval and repeat with another input pair
before promoting any recipe to complete. Dedicated UI presets remain development work.

For Mask Glitch execution, start with [mask-glitch](../../.agents/skills/mask-glitch/SKILL.md).
Supply ordered shots, incoming subjects, masks or mask-preparation sources and cut
anchors. A consecutive sequence shares one schedule and one proposal while retaining
individual white/colour mask rows. Compound here names the editorial sequence; it
does not imply a dedicated native compound preset.
