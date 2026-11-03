# Launch a copy away

Compiled route `copy_launch@1` for "I kick (push, punch) a copy of myself and it flies off into
the distance, and the clip loops". First built as Kick Away (approved by the creator on
2026-11-02, proposal `20261103T021727-49eac408` in `kick-away-build-01a1957c`, on a take rebuilt
from the course's desktop tutorial). The block is general: any locked take where a person acts
toward an empty spot and then walks onto it, so their later self can stand there and be launched.

Not freeze and fly out: there the take stops and the subject leaves its own spot. Here the take
keeps running, the copy is the person's later self, and it leaves along a path into the distance.

## What it compiles

One `proposal_create` option with one block.

1. Lane order (front cut-out above the flying copy above the waiting copy above the take), and any
   `remove_element_ids`.
2. **The action**: the take from the empty spot (`action_start_seconds`) to the person settled on
   it (`loop_seconds`).
3. **Copy waiting on the spot**: the same take from `loop_seconds`, shown in a feathered box
   (`mask_inset`, so the shadow comes too), from the start to the launch.
4. **Copy launched away**: a person cut-out continuing the waiting copy's clock, slowed, from the
   launch: most of the climb in the first frame, settled by a third of the flight, drifting
   sideways, shrinking toward the distance and fading once it is a tenth of its size, with a
   two-frame vertical streak. It holds its last pose if the flight outlasts its footage.
5. **Action in front** (optional): a cut-out of the acting person on the take's own clock, on top,
   so the kick crosses in front of the copy.
6. **Sounds** (up to two): timed from the contact.

Because the take ends on the frame where the waiting copy starts, the last frame matches the first:
the clip loops with no extra step.

## Inputs and the tool that measures each

| Input | How to get it |
| --- | --- |
| `take`, `action_start_seconds`, `contact_seconds`, `loop_seconds` | Contact sheets of the take. Start with the spot empty a second before the action; contact where the foot reaches the spot (Kick Away: frame 39); loop where the person stands settled on the spot (frame 120). From a reference, set the start so the contact lands on the same frame (demo: frame 31–32). |
| `spot` | A box around the person standing on the spot and their shadow, clear of the action until the contact (Kick Away: `[0.2, 0, 0.1, 0.3]`, feather 0.03). Anything that crosses it before the launch needs the front cut-out. |
| `copy` | `cutout_prepare` on the take around the reaction: from a little before `loop + launch time` (the waiting copy's clock at the launch) through the pose that flies (Kick Away: take 4.8–5.8 s, launch frame at 5.1 s). Pick a reaction with the arms close to the body: spread arms trace worse. |
| `front` | `cutout_prepare` on the action around the contact (Kick Away: take 1.0–1.9 s, prompt on the leg). |
| `flight` | From a reference, frame by frame: time until gone (33 frames), how high (37.5 % of the height), drift (10 % of the width, right), pose speed (0.25), streak (70 px). |
| `launch_delay_frames` | Frames from contact to launch in the reference (demo: 1). A lesson's "about 10 frames" was not what its final demo showed. |
| `sounds` | A supplied hit or `sfx_search`; offsets from the contact. |

## Dials

Main: **Launch after contact** (the box end and the flight move together), **Flight length** (the
whole path stretches), **Rise**, **Drift sideways**, **Shrink into the distance** (each with an
off position at 0), **Pose speed**, **Streak blur**, **Box edge softness**, a **Level** per sound.
Advanced: **Loop frame** (moves the take's end and the waiting copy's start together, so the loop
still joins), a **Timing** per sound.

## Checks

- Frame-state on the contact, the launch and the first five frames after it, against the reference.
- The last frame against the first: same pose, no shadow pop. A faint box edge in the ground means
  raising Box edge softness or widening the box.
- The front cut-out covers the action wherever it crosses the box before the launch.
- Frames cannot prove sound; say it has not been heard.

## Lessons from the first build

- The waiting copy as a boxed region of the later take keeps the shadow and makes the loop; a
  cut-out alone would drop the shadow at the seam.
- The demo's copy is 80 % up after one frame; a plain ease-out was a frame slow.
- Size cannot go below 0.1 (the scale keyframe floor), so the last stretch fades instead.
- A slowed flying clip whose footage ends before the flight broke the Speed dial's sweep; the block
  holds the last pose instead.
- Sampling frame-state at exactly the clip's end reads one frame past it and shows black.

## Limits

One demonstration (Kick Away, a low-resolution take rebuilt from a tutorial; edges and the exact
contact frame unproven). Locked camera and steady light; anything else moving inside the box before
the launch shows the later take there. No sound heard yet; fresh footage pending.
