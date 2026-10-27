# caption-craft — evolution log

## Purpose
Create or refine accurate, readable, source-bound timed captions. Scope: caption text, deterministic pause-first grouping, and timing authority — every cue bound to its speech element id, alignment hash, and absolute source-word interval — plus semantic placement via named presets, never raw coordinates. It does not re-time speech or fix a lagging decoder with caption offsets. Good looks like: captions match spoken words exactly, survive trims and rate changes through their bindings, and sit inside safe areas with legible contrast.

## Preserved prior evolution records

# caption-craft evolution
2026-09-15: Approved Memory improvement `3a96e07c6cc25f6f6ef454994a5c3148277c920c0de4febc4a8acac96bfb7ffb` from retro `460704df-3798-4daa-a76f-b04382292574`. Map captions to each audible clip’s source clock and, after trims, splits, or rate changes, realign the entire affected caption region rather than correcting isolated captions.

## 2026-09-19 — Updated: caption safe-area guidance now cites the measured Reels box

**Observation:** the "keep captions inside safe areas" line gave no numbers, so agents had no concrete box to compose against.

**Change:** SKILL.md now gives the 1080x1920 Reels box (x 65..1015, y 270..1248, x <= 887 below 44.8% frame height for the action rail) and points to `docs/standards/vertical-video-safe-zones.md`. The underlying geometry fix (organic resolving to the measured template) is logged under platform-video-delivery.

**Verification:** doc-level change; no tests affected.

## 2026-10-25 — Updated: start from My Style; one word at a time at a fixed size by default

- **Observation:** A learning review of `colorgrade-tutorial` (a split-screen tutorial: screen recording on top, presenter below) found agents chose a caption look without reading the creator's style, compiled phrase captions, and let long lines shrink to fit, so the size jumped from caption to caption. The creator corrected this twice; the approved card showed every word as its own caption at one fixed size on the dividing line.
- **Decision:** Updated. A "Start from My Style" step now reads `editing_context.preferences` and applies caption preferences before any look is chosen, and the card's assumptions name the preference followed. The shipped defaults are now one word at a time (`timing_mode: "single_word"`, `word_limit: 1`) and a fixed size (`font_sizing: "fixed"`): text never shrinks, so a long word or line keeps its size and gets a narrower max width or a split instead. This replaces the rule that fitted single-line captions down. Phrase captions and pause-first grouping stay for when the creator asks. `caption_proposal_compile` makes `style` optional, but the look still comes from My Style first. The caption look itself stays personal. The creator, as product owner, approved both defaults for every user on 2026-10-25; that is the human sign-off `docs/standards/skill-evolution.md` asks for new defaults. Alternatives considered: keeping these as personal My Style entries only (rejected by the creator, who wants them for everyone).
- **Verification:** Skill-discovery tests and agent-parity check run after the edit. `font_sizing` is being added to `replace_captions` and `caption_proposal_compile` in a parallel change; until it lands, the field is described here ahead of the contract. Not yet measured on fresh agent runs.

## 2026-10-27 — Updated: no punctuation in captions by default

- **Observation:** The creator, in their words: "So like, whatever they're called, commas, periods, in captions, ever. Unless explicitly asked, but never by default." Captions shipped with punctuation unless an agent remembered `hide_punctuation`.
- **Decision:** Updated, as a product default rather than a My Style entry, so it holds with no style lookup and for Generate captions in the editor, which reads no style. `caption_proposal_compile`, `replace_captions` (when `hide_punctuation` is left out), Generate captions and voiceover caption lanes now write `hidePunctuation: true` (`SPEECH_CAPTIONS_HIDE_PUNCTUATION` in `src/lib/timeline/captions.ts`). Only the drawing changes: stored text, `caption_source_text` and word timings keep the aligned words. Opt-in stays explicit: `hide_punctuation: false` per request, and the Captions → Punctuation checkbox on the caption, which a regenerate keeps. Stored captions without the field and typed text captions keep their punctuation. The owner approved the default directly on 2026-10-27.
- **Verification:** Unit tests for the compile default and opt-in, the `replace_captions` default and Generate captions; checked on a disposable project on `pnpm dev`.
