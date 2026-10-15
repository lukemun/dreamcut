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
