# Prepare transcript/alignment and compile captions for review — evolution

Capability: `speech-preparation`. Registry: [registry.json](../registry.json).

## Purpose and boundary

Prepare transcript/alignment and compile captions for review. Transcription and MFA alignment are distinct; reviewed transcript required for alignment-dependent edits; return proposals, never invoke direct apply.

## 2026-09-30 — initial capability registration

- **Observation:** Repository script/catalog audit found this capability family. This
  is code/discovery evidence, not measured editing frequency or a new runtime trial.
- **Decision:** Prioritize a reusable interface; no tool implementation is claimed by registration.
- **Version:** Initial registry record; existing tool/recipe versions are unchanged.
- **Verification:** Catalog membership and owner/evolution paths checked by `check:tools`.
  Runtime behavior was not re-certified by this inventory.
- **Acceptance for next change:** Unknown words and unavailable MFA surface blockers; captions preserve source mapping; no timeline write; proposal preflight and human review remain required.
- **Evidence:** [Script audit and priorities](../script-audit.md). Private session
  traces remain outside this public log.

## 2026-09-30 — bounded tool implementation

- **Decision:** Added the shortlisted interfaces and a shared dispatch/recovery adapter;
  tool names and owners are recorded in the registry. No approval or export powers added.
- **Version:** Dispatch/error schema 1; agent preparation recipe 2. Existing tools retain
  their independent recipe versions.
- **Verification:** Focused boundary tests cover stale evidence, media state, caption
  operation generation without timeline writes, and deduplicated dispatch accounting.
  Synthetic outline and Scratchpad jobs completed and reused outputs. Full real-speech
  MFA/ASR quality and real-footage composite acceptance remain unverified.
- **Limits:** Legacy errors are not all migrated. New dispatch counts cover only the
  refreshed DreamCut MCP server, not arbitrary shell internals or all provider activity.

- **Additional runtime evidence:** Local Whisper transcription and offline MFA alignment both completed on a synthetic spoken fixture. This verifies execution, not real-footage word-boundary quality.

## 2026-10-25 — caption_proposal_compile covers looks, one-word captions, written forms and long talks

- **Observation:** On a 9½-minute talking video the agent hand-built one-word captions in a script, because `caption_proposal_compile` grouped 3–4 spoken words only, took a font and style separately (so an off-look pairing was easy), showed numbers as spoken ("zero point two two"), and returned one operation that the 250-cue limit refused. It was reported through `capability_gap_report`.
- **Decision:** The tool takes `style.look` (an editor caption look; it sets the style and its font, and a different font is refused), `written_text` (the script as written: `src/lib/agent/caption-written-words.ts` matches written words to the aligned spoken words per paragraph and gives each differing word its spoken run, which become per-cue `caption_display_substitutions`), `word_limit` 1–4, `timing_mode`, `single_word_flip_seconds` and `hide_punctuation`. Over 250 captions it returns several operations with fresh ids, later ones from their first caption's start, plus `review_controls` linking them into one set of caption-card dials.
- **Verification:** `caption-written-words.test.ts`; `check:tools` (case `captions-one-word-written`), typecheck. On `week-recap` the tool reproduced the hand-built card (1,215 one-word captions, 72 shown as written: "0.22", "Nasdaq", ".64%"), and the card staged with all its dials.
- **Limits:** a written token's spoken length is estimated (numbers, symbols, hyphens); an unusual respelling spanning several written words falls back to the run's last word taking the rest. No display hold between words yet. Not yet: `pnpm eval:features` for the new case.

## 2026-10-25 — Caption compiles default to one word at a time at a fixed size, carry My Style, and are stored

- **Observation:** In a colour-grading tutorial the agent chose a black-card phrase look although the creator's captions are always bold outline, one word at a time, at one size. The tool required a style, never saw the creator's preferences, could not keep the font from shrinking, and returned about 60 KB per speech clip (every cue twice), which the agent then pasted back into `proposal_create`.
- **Decision:** The creator, as product owner, approved two shipped defaults for every user: one word at a time (`timing_mode` single_word, `word_limit` 1; any word limit above 1 gives phrases) and a fixed size (`font_sizing` fixed, a new `replace_captions` field that sets `fontSizing`). `style` is optional (the product's default caption look when omitted) and the result lists the creator's active caption preferences. The operations are stored under `instruments/agent-compiles/<compile_id>.json` and named on a card with `operations_from`; `include_cues` still returns them.
- **Verification:** `tool-capabilities.test.ts` (defaults, phrase fallback, product-default style, stored compile expanded with its dials, stale revision and unknown compile refused), `check:tools` (case `captions-fixed-size`), typecheck.
- **Limits:** Preferences are free text, so the tool reports them rather than mapping them to a look; the agent chooses. A long fixed-size phrase can wrap, which the single-line QC check still flags. Stored compiles are not yet cleaned up.

## 2026-10-25 — Long recordings align in pause-cut chunks

- **Observation:** On a 9½-minute talking recording, captions drifted by seconds. `scripts/align.ts` ran `mfa align_one_hf` over the whole file as one utterance; against isolated-segment Whisper and the audio's pauses the words were up to 4–5 s early around 170–250 s and about 1 s early around 85–100 s. Two causes: MFA's beam search drifts over one multi-minute utterance, and speech the reviewed text leaves out (a false start such as "they're start, they're gonna start") makes MFA stretch neighbouring words over it.
- **Decision:** Recordings over 45 s are cut at real pauses (audio energy, ≥ 0.25 s, threshold between the noise floor and speech level) into chunks of about 10–40 s (`src/lib/instruments/alignment-chunks.ts`). Whisper transcribes each chunk for text only, and the reviewed words are sequence-aligned to it to decide which words were spoken in which chunk; a cut whose words cannot be pinned is replanned at another pause, or the chunks merge. Where Whisper heard words the reviewed text lacks, a `[unscripted]` spoken-noise marker goes into that chunk's text; MFA aligns it and its interval is dropped. All chunks align in one `mfa align_hf` corpus run; times are shifted back by each chunk's offset and concatenated. A chunk MFA fails on merges with its shorter neighbour (up to three rounds); if that still fails the whole file aligns in one pass as before. Whisper never times a word: MFA times every reviewed word, and the count invariant (aligned words = reviewed words) still holds per chunk and overall. An adjacent duplicate interval MFA sometimes reports for one word after a long pause is reduced to the shorter interval. The output format is unchanged; `alignment-segmentation.json` beside it records strategy, cuts, chunks, markers and fallbacks, and the `speech_prepare` result carries a `segmentation` summary (`method` stays `mfa`). The align job's dependency hash now includes the chunk module and the Whisper model, so older align jobs are not reused.
- **Verification:** `alignment-chunks.test.ts` (silences, cut planning, number verbalization for matching, chunk assignment/merging, marker placement, text slicing, offset stitching, count invariant, duplicate reconciliation, WAV round-trip); typecheck; `check:tools`. On the 566 s recording (1,311 words; run on a copy of its prepared audio, no project write): 23 chunks (longest 37 s), 17 markers, no merges or fallback, 67 s wall time (single pass: 12 s). Per-window median offset against Whisper on isolated 2–8 s segments: 170–250 s −3.62 → +0.10 s, 185–198 s −4.24 → +0.04 s, 84–95 s −0.96 → +0.06 s, 270–280 s −0.02 → +0.04 s; share of island words agreeing with Whisper on pause-bounded islands 80% → 92%. Remaining offsets above 0.15 s in that comparison were checked by transcribing the pause-bounded pieces; at those places the reference was wrong (Whisper timing or hallucination on silence).
- **Limits:** Fillers Whisper drops ("um") get no marker, so MFA can still stretch the neighbouring word's end over them; Whisper hallucinating on near-silence at a chunk edge can add a marker or lengthen a word's end. Word starts were checked; word ends over long pauses were not separately measured. The single-pass path (≤ 45 s) has no markers. Only one real recording was measured.

## 2026-10-27 — speech_prepare accepts sources up to 60 minutes

- **Observation:** Captioning a 21-minute single-take tutorial was refused with `SOURCE_WINDOW_TOO_LARGE` ("up to 10 minutes"). The cap predates pause-cut chunked alignment, and splitting the source to get under it is forbidden, so the agent transcribed outside DreamCut and filed a `capability_gap_report`.
- **Decision:** `SPEECH_MAX_SOURCE_SECONDS` in `src/lib/agent/preparation-jobs.ts` is 60 minutes, and `reviewed_text` takes up to 120,000 characters (about an hour of speech). Chunked alignment keeps MFA drift bounded at any length; each worker step keeps its 30-minute subprocess limit.
- **Verification:** typecheck, `check:tools`; transcription and alignment of the 21:20 tutorial source on the stable editor (see that project's alignment-segmentation report).
- **Limits:** Only that one long recording was run end to end; MFA's wall time on a full hour is extrapolated from the 566 s measurement (67 s), not measured.

## 2026-10-27 — caption_proposal_compile captions a talk cut into many clips

- **Observation:** The 21-minute tutorial's speaker is 43 clips after removing pauses, all from one aligned recording. The compiler took one `source_element_id`, and a card holds at most 8 compiles, so the talk could not be captioned in one card.
- **Decision:** `source_element_ids` (instead of `source_element_id`) names every clip cut from the aligned source. Each clip captions only the words inside its own source window, mapped through its own timeline position; captions never span a cut. Cues are ordered by timeline time and split into operations of at most 250 captions and 32 clips (the `replace_captions` scope limit), each scoped to its own clips, so later operations never remove earlier ones.
- **Verification:** `tool-capabilities.test.ts` (two clips from one alignment, out-of-order ids, timeline mapping, scope, both-ids refused); agent and MCP suites (568 pass); typecheck.
- **Limits:** Words that straddle a cut are dropped, as before for a single trimmed clip.
