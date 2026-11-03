# reference-match-review — evolution log

## Purpose

Catch material differences between a proposed reference-driven edit and the original motion before the creator has to discover them. Success means the candidate is checked at the untreated, moving, settled, payoff and exit states, with timing and geometry measured relative to the adapted subject. This is an acceptance workflow, not approval or a replacement for initial effect analysis.

## 2026-10-02

- **Observation:** A proposed ball pop-out used a static picture window from frame zero and placed its strip below the ball. The source tutorial instead shows two bars sliding inward, settling through the ball's middle. A single attractive settled frame had hidden the timing and geometry mismatch.
- **Decision:** Added a dedicated reference-to-candidate acceptance pass with a temporal event map, subject-relative geometry check, combined-preview review and fail/revise rule. Linked it from recreate-effect.
- **Verification:** Re-measured the local reference's moving edges frame by frame, validated its bounded reference record, and applied this pass to the revised candidate. Skill discovery and purpose checks are recorded with the implementation work.

## 2026-10-02 — Include the shot exit (Updated)

- **Observation:** The first revision was checked at the entrance, peak and held window, but the review failed to account for the full candidate ending. The strip remained on screen while the ball fell away.
- **Decision:** Require an explicit post-payoff and exit comparison, including a separate note when the creator deliberately asks for a different ending than the source.
- **Verification:** The first ten seconds of the original were mapped through both ball-example exits; the revised candidate must show its full-frame return before handoff.

## 2026-10-31 — Measured motion and artifact acceptance (Updated)

- **Observation:** Creator review found an artifact at a floating object's topmost
  position and a mismatch in enlargement and turning despite a successful render.
  Existing comparison instructions did not provide a concrete per-trait budget.
- **Decision:** reference-match-review owns a linked measurement procedure with
  disclosed starting tolerances, uncertainty, visible silhouette/perspective checks,
  motion extrema and an independent artifact gate. recreate-effect invokes it before
  construction and carries the frozen criteria into the brief and grading pass.
- **Verification:** Two existing skill-purpose/catalog tests pass via the installed Node/tsx runtime; member virtual-mount links and changed editor links resolve. Frontmatter manually checked; generic quick validator unavailable because Python YAML is absent. Hosted member lookup returns sign-in required; no upload performed. This
  change does not establish that the reported candidate has been repaired or meets
  the new limits; actual measured reference review remains pending.

## 2026-10-31 — Distinguish complete effects from harmless alignment differences (Updated)

- **Observation:** The creator found grading too severe for a slight timing difference while emphasizing that omitted rotation or growth is a real recreation failure.
- **Decision:** Inventory essential components first; scope precision to the brief. Treat numeric defaults as diagnostics for effect-faithful work, retain strict causal/exact requirements, and version explicit creator acceptance without rewriting measured evidence. Separate visual fidelity from unperformed technical or transfer checks.
- **Verification:** Walkthroughs: a creator-accepted small alignment difference regrades without compulsory rebuild; absent rotation still fails; an exact beat-sync request still uses its explicit tolerance. These are instruction walkthroughs, not a new audiovisual acceptance claim.


## 2026-11-01 — Distinguish reference labels from rendered coordinates (Updated)

- **Observation:** A literal source-editor position label was converted with correct
  native transform arithmetic, but source-only pixel registration contradicted the
  resulting placement. The existing coordinate-frame policy had not been applied
  when interpreting that label.
- **Decision:** Clarified the measured comparison procedure: establish the source
  editor's coordinate convention, cross-check rendered landmarks in one fixed
  viewport, and retain unresolved label-to-native mappings as unverified. This
  invokes the existing coordinate policy; it adds no native parameter or default.
- **Verification:** Reference-only fitting searched original source frames and
  translations without candidate pixels; exact decoded PTS and a fixed viewport
  were retained. Positive, differing-axis and unknown-unit cases were traced through
  the procedure. These are numerical evidence and instruction walkthroughs, not
  audiovisual acceptance. Skill-purpose/catalog checks are recorded with the task.

## 2026-11-02 — measure the reference with reference_match

- **Observation:** Cup Jump's source windows, speed change and layered regions were found only by frame-matching the course demo against the takes with a private script. An effect timed by eye (House Pond) had started 0.62 s off.
- **Change:** `measured-match.md` now points to the `reference_match` tool. Mode `takes` measures the reference's construction, per region. Mode `candidate` grades a card's frame-state stills against the reference at the same times.
- **Verification:** see `docs/tools/evolution/visual-evidence.md` (2026-11-02). The tool reproduced the Cup Jump construction unaided.
