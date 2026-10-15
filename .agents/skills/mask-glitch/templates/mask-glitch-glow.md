# Mask Glitch · Glow

Template `FX-MASK-GLITCH-GLOW` (Properties → Templates). Successive poses of the
subject appear over the empty set, each as a white silhouette with a soft halo, then
show their original colour as the halo fades. See the [Subject flash + glow
variant](../SKILL.md#subject-flash--glow-variant) for the controls.

## Inputs

| Role | Required | Notes |
| --- | --- | --- |
| Ordered pose takes | Yes | Distinct poses with the camera locked: separate takes, or moments of one take where the subject moves to new places. |
| Matching empty background | Yes | The same framing without the subject. Frames of the same take before the subject enters or after they leave work. |

The agent prepares one moving cutout per take (or one covering the whole take).

## Build

1. Import the takes and a still of the empty set; place the set as the base layer.
2. `cutout_prepare` each take with points on hair, face, clothing and hands. Check
   frames at each chosen pose for missing hair or thin details: anything the cutout
   misses shows the set through the white silhouette and glows in the halo.
3. Propose one option with one `create_visual` per pose on the same lane, in order,
   each `has_alpha: true` with `subject_flash: 1`, `subject_glow: 2`,
   `subject_glow_radius: 24` and `transition_keyframes`:
   `subject_flash [{t:0,v:1,ease:"hold"},{t:0.12,v:0}]`,
   `subject_glow [{t:0,v:2,ease:"hold"},{t:0.12,v:1.2,ease:"linear"},{t:0.4,v:0}]`.
   Link Glow strength, Glow radius and White flash across poses with
   `linked_operation_indices`; expose each pose's Source in. Add `set_lane_order`.
4. Give the set and every pose the same `media_scale` when the camera frame is not
   16:9.
5. Replay the card. Check each white frame, the frame after the halo fades and the
   last pose.

## Timing (demonstration)

A new pose every 0.8 s; white for 0.12 s (3 frames at 25 fps); halo gone by 0.4 s;
last pose holds 2.4 s.

## Limits

- Thin details the cutout misses (fine chains, loose strands) show the set through
  the silhouette. A first demo on Pexels 9732065 was set aside for this reason.
- The halo follows subject alpha; it is not a pixel-identical third-party glow.

## Evidence

Demo project `tpl-glitch-glow-hoodie-demo` (16:9, 25 fps), proposal
`20261015T054919-0b106df8`: Pexels 10210101, cutout 7554f136 (source 1.6–13.6 s),
empty set from 15.6 s of the same take. Teaching media in
`public/recipe-previews/mask-glitch-glow/`.
