# Choose media analysis by purpose

This is routing guidance, not a detector or model prompt. Read the owning craft skill
before acting. Start with the user's question, the available source, and the evidence
needed to answer it. Record the selected route and sampled coverage in the intake receipt.
Use the same routing for already-imported footage; do not import it again.

| Purpose | First pass | Escalation / owner |
| --- | --- | --- |
| Import or repair playback only | Verify source identity and technical metadata; prepare required preview package | `editor-media-preprocessing`. Optional visual analysis, transcription and segmentation are separate requested work. |
| Talking-head footage | A few representative frames to establish subject, framing and visible changes; speech inspection separately | `voice-file`, `talking-video-editing`, `caption-craft`. Use audio/transcript/alignment for speech; dense VLM images cannot establish spoken boundaries. |
| B-roll, travel clips or a shoot inventory | Small distributed sample, then inspect intervals where action or scene changes matter | `media-annotation`; `visual_analyze` source-description preset. Save sampled observations, not a claim about every intervening frame. |
| Whole video / multi-effect reference | Account for the entire sequence, then inspect effect intervals and cross-section cues | `video-reference-analysis`; reusable units delegate to `recreate-effect`. |
| Effect reference, fast gesture or transition | Overview, then dense samples in a short identified effect window | `recreate-effect` and its craft skill; effect-breakdown preset. Resolve exact-frame questions using verified frame/PTS evidence, not approximate seek timestamps. |
| Mask or cutout quality | Subject extremes, difficult edges and relevant motion phases | `rotoscope` / `talking-head-cutout`; mask-review preset on rendered evidence or supplied images. A VLM description is not a segmentation mask. Inspect motion separately. |
| Caption or composition review | Current composite frames around caption/layout changes | `caption-craft`, `spatial-composition`; caption-review preset. Use measured geometry and verified frame-state evidence, not guessed coordinates. |
| Static photograph, screenshot or graphic | Inspect one image in display orientation | `media-annotation` / `media-pull`; source-description preset with kind=image. OCR uncertainty remains explicit. |
| Unimported pre-edit collection | Source-linked inventory and catalog in the authorized collection | `media-annotation`. The current visual-analysis tool is project-scoped; do not manufacture a project or import solely to gain access without authorization. Direct agent image inspection remains available where the host supports it. |

## Sampling and budgets

For an overview, start with up to six representative source times spanning the relevant
window, including early and late content. This is a planning heuristic, not a finding
that six images are sufficient. Use scene/action changes or uncertainty to select the
next bounded batch. Talking heads usually need speech evidence and selected visual
checks; effect reconstruction often needs denser images near a specific event.

When the request requires frame-by-frame analysis, name the short interval and required
source clock/frame mapping. `source_evidence` and `visual_analyze` source mode accept
1–12 explicit requested seek times per job; they do **not** certify exact PTS or consecutive
frames. Increasing sample density does not change that limitation. Verified frame-state
reports carry timeline frame identities; create the appropriate report through the
supported instrument workflow. If exact source-frame evidence is unavailable, report
that gap rather than label approximate samples frame-exact. Do not silently downsample
an explicitly requested exhaustive pass.

Choose and record a bounded batch count/time budget before a long collection pass.
Expand only where the question warrants it. Local models avoid a per-request API bill,
but still use memory, compute, battery and time. More observations also mean more claims
to check. Do not run every available analysis on every imported file.

## Execute and retain results

Use [visual analysis](../../../../docs/architecture/visual-analysis.md) for the exact
`visual_analyze` contract, host backend configuration and cache behavior. Prepare a job
with a preset, optional bounded question, explicit evidence selector and output budget.
Poll its returned job ID using action=status and the suggested delay. A successful poll
is not a completed analysis. Stop on failure or the bounded workflow deadline; preserve
the job ID and use explicit retry only after inspecting the failure.

Descriptions are saved in `instruments/visual-analysis/<job-id>/observations.json`.
They carry per-cell timestamps/frame identities when available, source/evidence hashes,
model/prompt versions, settings, sampled coverage and uncertainties. Keep source
observations separate from timeline/proposal reviews. Reuse only valid matching evidence;
changed source, question, preset, model revision or relevant rendered state requires a
new analysis. Preserve earlier records for comparison.

Link these receipts from the intake ledger or collection catalog. Promote useful observed
names/descriptions through the existing metadata workflow with attribution to the model;
do not label them human-verified, overwrite creator labels, or equate a generated
observation with deterministic detector geometry. The analysis tool does not automatically
publish Library labels, assemble footage or approve an edit.
