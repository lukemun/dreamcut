# mask-glitch — evolution log

## Purpose

Let a creator request an incoming-subject transition or consecutive sequence by
the name Mask Glitch. Success means continuous registered subject coverage,
correctly ordered scene handoffs, editable per-subject layers and one coherent
timeline review. Mask preparation and general composition remain delegated to
their existing procedures; this skill does not supply a segmentation engine or
a dedicated compound editor preset.

## 2026-09-27 — Renamed and expanded from Pop-in white flash

- **Observation:** The creator renamed the effect Mask Glitch, corrected disappearing
  mask frames, and requested a compound construction for consecutive handoffs.
  The two-handoff example demonstrated two adjacent handoffs with two white frames,
  three colour frames and a scene switch at each cut.
- **Decision:** Made mask-glitch the canonical skill, with a continuous default and
  a derived sequence schedule. Preserved the earlier batched pop/post-switch flash
  recipe as an explicit variant and retained the old skill name as a routing alias.
  Shared middle shots make the requested sequence one coordinated proposal; masks
  remain separate native elements. Moved catalog ownership and evidence backlinks.
- **Verification:** Existing two-handoff frame inspection and creator-approved
  timeline are practical evidence for the continuous construction. Longer chains
  and moving tracked mattes are not newly tested. Routing, link, discovery and
  effect-catalog checks are recorded after authoring; no media generation or export
  was performed to validate these instructions.

- **Check results:** Both skill-purpose and skill-catalog tests passed. All new
  skill/variant relative links resolve; 20 effect entries pass hash and owner-link
  validation; the static gallery matches the canonical catalog. Written routing
  review: consecutive three-shot requests use the continuous chain; explicit old
  pop-in-white-flash requests use the preserved legacy variant; missing incoming
  subjects or usable mattes stop asset preparation for the relevant clarification.
  These routing walkthroughs are not additional media execution trials.

## 2026-09-28 — Updated: reusable masked flash and click pairing

- **Observation:** The creator asked to bundle a repeated mask glitch in one edit and sound as a reusable recipe and use it to explain compound recipes and personal style. A read-only audit found 14 paired white-flash and crisp-click actors, all with a one-frame sound lead at 30 fps and gain 0.254172; five flashes last two frames and nine last four.
- **Decision:** Add a named skill-owned `masked-flash-click` recipe and explicit routing under this skill. Preserve the continuous handoff as the generic default and keep its no-added-sound rule. The new bundle owns one shared schedule with separate visual/audio actors; its personal-style representation is a variant parameter, not an invented catalog ID. No personal style or working edit is applied.
- **Evidence:** The local extraction receipt records source timeline/SFX hashes and all pair bindings. Frame-state inspected eight boundary samples for two different masked regions. The sound catalog reports a 0.040 s peak, explaining the near-onset alignment with a one-frame early file start.
- **Verification:** Skill-purpose/catalog and effect-catalog checks accompany this change. Timing values were checked against all observed pairs and the audio file hash. Frame inspection is sampled picture evidence; no fresh-input trial, complete listening acceptance, or automatic compound UI is claimed.

## 2026-09-29 — Optional subject glow
- **Observation:** The creator explicitly requested the saved AE flash reference's halo as an option for Mask Glitch, demonstrated with the same performance in a new project.
- **Decision:** Added a subject-flash/glow variant using native animated flash, halo strength, and radius controls. Original-color masks and the continuous default remain separate choices.
- **Verification:** Effect registry/schema tests and renderer contract pass, including reset, preview parity, encoded output and arbitrary animated seeks. A local moving-alpha demonstration has frame evidence. Independent visual UI acceptance was attempted but blocked by browser-tool availability; no claim of a successful fresh-eyes pass or Adobe kernel equivalence.

## 2026-09-30 — Reusable sequence controls and bounded review

- **Observation:** Repeated timing requests mixed control wiring with feature engineering; the creator requested shared spacing first, independent gaps on request and a 15-slider cap.
- **Decision:** Route prepared reveals through the deterministic compiler, enforce the visible-slider admission cap, and record private proposal-work phase markers. Preserve atomic dependencies and existing media.
- **Verification:** Synthetic compiler, override, cap and lifecycle tests cover the implementation; no new creator acceptance, model trial or end-to-end speedup is claimed.

## 2026-09-30 — reusable cutout preparation

- **Observation:** Repeated mask preparation and local repair scripts delayed proposals;
  a convincing flash did not establish the quality of the settled composite.
- **Decision:** Route requested masks through cached preparation/status and immutable
  correction tools. Keep import authority unchanged and check one settled treatment
  before expanding a new sequence.
- **Verification:** Synthetic correction/cache/source-image tests exercise tool mechanics.
  Skill routing was checked for requested cutouts, import-only requests and missing
  prompt evidence. This does not establish a real-footage quality or speed improvement.

## 2026-10-14 — Templates from @nvision.media recreations

- **Observation:** Effects recreated from a @willrvail breakdown of an @nvision.media video were worth reusing as Templates; smaller transitions (wipe, layer crossfade, slow-motion breather, handheld, closer) were not distinct enough.
- **Decision:** Package each kept effect as a template page under `templates/`, linked from Packaged templates, with a Properties → Templates card and Pexels teaching media built from demo proposal previews.
- **Verification:** Each template ran on two input sets in its own demo project (proposals only, none approved); entrance, peak and settled frames were checked with `pnpm frame-state --proposal-file` and GPU preview renders. Limits are listed on each page.

## 2026-10-14 — Mask Glitch · Glow template page

- **Observation:** A teal-set demo (Pexels 9732065) lost the subject's thin chain necklaces in every SAM 2 prompt; the halo then glowed inside the gaps and the set showed through after it faded.
- **Decision:** Add `templates/mask-glitch-glow.md` and build the teaching media on a subject without thin detail (Pexels 10210101); record the thin-detail limit on the card.
- **Verification:** Demo `tpl-glitch-glow-hoodie-demo`, proposal only, not approved; white, colour, next-pose and final frames checked in a GPU preview render. Reuse on a second input set is not yet run.

## 2026-10-29 — Flash effect template and the flash_sequence block

- **Observation:** The creator built the Flash effect (futurist__ reel) in `clone-glitch-tutorial` from hand-written cards: one cut-out per pose with a one-frame `subject_flash`/`subject_glow`, a shutter click per flash, poses on separate lanes. They corrected it toward the reference: poses replace each other rather than stay on screen, eight flashes 4 frames apart, and no pose on the frame edge moving sideways. Then they asked for it as a Templates effect with the words left out and the shutter kept.
- **Decision:** Add the `flash_sequence` proposal block (poses on one lane, flash and glow keyframes, clicks that follow their poses, the live line after the last pose) and the [Flash effect](templates/flash-effect.md) template page; the creator's card lives in Yours.
- **Verification:** Block tests and the parameter contract pass. On disposable copy `flash-effect-check-20261029`, frames show each white flash, the colour pose on the next frame and a seamless live join; render-preview audio peaks within 10 ms of each flash. Not heard by ear; no shared effect eval yet.
- **Shipped (2026-10-29):** on the owner's word the card ships as `FX-FLASH-EFFECT` and the Yours copies (it and the older reference-only "Mask Glitch · subject glow") are removed. The eval caught clicks overlapping when a pose starts at 0 s or poses are closer than the click's lead; each click now starts no earlier than halfway from the previous flash and skips into the file so its peak still lands on the flash.

