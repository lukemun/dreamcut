# Object Reveal — native text behind a crossing actor

Draft `actor_wake_reveal@1` construction; real-footage and fresh-session acceptance pending.
This is a progressive reveal behind a person, distinct from clean-plate Object Appear.

Bring one continuous untreated walking take and its prepared source-matched person
cutout. Prefer a traced cut-out of the original take (`cutout_prepare`, alpha) over keying
a supplied green-screen view: on Object Reveal (card `20261103T005818-cdc5329f`, approved
2026-11-02) the traced cut-out `afcff172` removed the green rims the key left (0 green
pixels in 20 sampled frames), with the reveal matching the course at 5 checked times. Use media-intake and rotoscope: `media_import`, `media_describe` plan,
`source_evidence`, `cutout_prepare` and `cutout_status`; confirm source fingerprint,
source offset, frame cadence, dimensions and complete selected interval coverage.
The compiler checks the declared identity and handle arithmetic; it does not authenticate
that a caller supplied a truthful cutout receipt, segment a person or find body centers.

Measure source-clock body-center x marks through the crossing. The first supported
variant moves left to right. Keep arms near the body and the boundary inside the
silhouette; gaps/arms can expose the text early. Inspect every transition frame,
not just the measured marks. A rectangle is not a substitute for a verified matte.

Build one proposal with this block and no authored operations:

```json
{
  "block_id": "actor-reveal",
  "kind": "actor_wake_reveal",
  "version": 1,
  "inputs": {
    "source": { "source_url": "/api/projects/PROJECT/media/walk.mp4", "source_duration_seconds": 12 },
    "foreground": {
      "source_url": "/api/projects/PROJECT/media/cutout.webm",
      "source_duration_seconds": 8,
      "source_offset_seconds": 2,
      "original_source_url": "/api/projects/PROJECT/media/walk.mp4"
    },
    "source_start_seconds": 3,
    "duration_seconds": 6,
    "timeline_start": 0,
    "boundary": [
      { "source_seconds": 3, "x": 0 },
      { "source_seconds": 5, "x": 0.4 },
      { "source_seconds": 7, "x": 0.95 }
    ],
    "text": "YOUR TEXT",
    "font": "inter",
    "position": "center",
    "lane_order_keys": ["visual_2", "visual_1", "captions_1", "visual_0"]
  }
}
```

Replace all example paths, source timings and marks. Times are original-source
seconds; x is a fraction of full canvas width. A cutout starting at original2s uses
cutout1s when the original starts at3s. All footage plays continuously at1×.
Outer source trims and timeline placement must align to the project frame grid.
Use a full complete top-first lane order with four distinct lanes: person cutout,
original-footage cover, native text, original-footage base. Caption lane must be
persisted explicitly so it can sit below the cover. Use `open_space_find` before
choosing text placement, retaining the intended behind-person overlap.

This four-layer construction avoids the tutorial's baked text export/reimport:
base fills the scene, native text remains selectable/editable, an opaque synchronized
copy hides the text ahead of the actor, and the cutout keeps the actor in front.
The cover's left crop follows the supplied body marks. Its beginning/end hold at
the first/last supplied x; include enough handles and full-crossing marks.
The mask's native0–95% limit means text must fit entirely within the swept region;
full-width/right-edge titles are not supported. Do not promise a complete reveal
until rendered pixels establish it. No leftward/reversing crossing, perspective
attachment, automatic mask tracking, source slipping or existing-edit ripple is added.

Controls: Reveal edge−5…5% (default0; shifts boundary), Edge softness0…5%
(default0.5), Text size25…200% (100%=100px native font), Advanced Text width15…90%
(default70), Original sound0…200% (default100;0 silent). Font, text, colour and
position are native text properties; source marks are structured inputs, not new
scalar dials. The original alone emits audio; cover/cutout are muted, preventing
tripled sound. Recompilation/reset retains element identities and source clocks.

Stage through proposal preflight/create; human applies. Inspect combined composition,
mask every frame including holes/hands, start/middle/end, text legibility and final
hold; play/listen, test dials/reset/Undo/reopen. Unit/schema tests alone do not certify
pixel occlusion. A genuinely different input take and fresh-session rebuild are still
required. No shared Template promotion or reusable certification is asserted.


## Supplied green foreground fallback

Use only when no traced cut-out is possible; check every edge for coloured rims. A
supplied source-matched solid-colour person view can stay as video: set
foreground.chroma_key_color to its measured background colour and preserve the
original_source_url/source_offset_seconds declaration. The existing native video
chroma key supplies transparency; no externally flattened scene or new matte is
needed. Key tolerance, Key softness and Spill cleanup (0–100%, Advanced) map
to native key amounts; they remain hidden for actual alpha foregrounds. Verify
registration and every edge/frame against the original, especially feet, hair and
partial transparency. A supplied green matte can itself contain timing, edge or
registration defects; source availability is not acceptance. Keep real source
handles, including fractional29.97fps tails: only authored window/placement need
the composition grid. Do not round the declared full source duration to erase
unused media or claim pixel identity from matching filenames/dimensions.
