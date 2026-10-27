# Asset generation composer

Status: initial implementation complete in the local working tree; live H3 Max Turbo and Kling 3 Pro generation tested, visual-quality and final browser acceptance still pending. Supersedes the extraction-centered testing direction, not existing saved assets. The visible flow below retains planned extensions; current scope is recorded at the end.

## Decision

Library launches a reusable right drawer. Its job is to generate images or videos. Frame extraction belongs to a separate media action/workflow and must not be a mode, setting, or automatic continuation of generation.

Use a prompt-led drawer, catalog-driven controls, and durable project-local job records.

## Visible flow

1. Image / Video.
2. One model dropdown at the top of the composer, listing DreamCut (credit-paid) models only. The Codex image handoff was retired on 2026-10-23: DreamCut does not route generation through an agent's own image tool.
3. Thumbnail inputs: Start frame, End frame, Character references, or Motion reference, according to the selected endpoint. Pick from Library, prior results, or upload. References have explicit roles, not one generic pile.
4. Editable intent → Build prompt → review suggestion → Use this prompt. The final prompt remains directly editable and the previous prompt can be restored.
5. Compact model-specific duration, resolution, aspect, and audio controls; advanced controls collapsed.
6. Sticky Generate button with estimate and reference-upload disclosure.
7. Play the generated video; reuse settings, retry as a new explicitly billed request, compare, or keep to Library. No timeline changes.

Model switching preserves per-model settings and attached references. Unsupported inputs remain visibly inactive with an explanation and block submission until resolved; never silently discard or transmit them. Start with a small verified catalog, not every model advertised by another studio.

## Implementation

- Replace task-to-model constants with a shared versioned registry: provider/endpoint, media type, input-role cardinalities, allowed combinations, parameter defaults/enums, pricing metadata, and adapter.
- Store immutable requests as model ID + catalog version + prompt + role-bound asset IDs/hashes + resolved settings + accepted estimate. UI and server use the same validation; server remains authoritative.
- Keep job persistence, provider receipts, local result download, hashes, managed imports, and recovery from the current implementation. Status polling must never resubmit a paid job. Unknown submission outcomes require reconciliation.
- Display billing route separately from model identity.
- Split extraction contracts/UI away from the composer. Existing extraction records remain readable in their separate tool/history; no deletion of the test frames.
- Reusable launcher accepts project and preselected reference roles, so later pages need no copied generation UI.

## Acceptance checks

Verify that the selected endpoint honors every declared input role, reference upload errors are actionable, prompt/settings survive reload, one click produces one paid request, interrupted status resumes safely, output plays with a prepared preview, and Keep imports exactly once. Test incompatible model switches and reference combinations. Review identity and motion against the supplied references. Frame extraction remains a separately requested workflow after video approval.

## Implemented scope and verification

A local read-only Codex or Claude worker returns validated action/camera/environment/treatment/audio direction; image-to-video is motion-first, Seedance orders environment before camera, and disabled audio is excluded. It receives the intent and input-role inventory, not media bytes or source paths. This is not pixel-grounded reference analysis. No model/provider fallback is made if the selected local worker fails. Authoring never creates a media job. Suggestions are explicitly applied and rejected as stale after setup changes. Intent persists with the draft. A live browser test covered build, stale protection, apply, and restore; no paid media generation was submitted.

Reference cards open a selection mode in the existing project Library, not another picker modal. The configurable Library shortcut (L by default) toggles the shared drawer outside text fields; Generate is a tab within it. Saved-reference controls and filename dropdowns are no longer shown; existing stored reference sets remain preserved.

Library → Generate assets opens the reusable composer. The curated registry includes Kling 3 Pro/Standard, Kling 3 Motion Control, Veo 3.1 Fast, Seedance 2, Nano Banana 2/Pro, FLUX.2 Pro, FLUX Kontext, and FLUX Schnell. Each uses its own validated payload and supported reference roles; FLUX.2 Pro is text-only in this initial catalog. Model-specific settings persist across switching, closing and reload. References can use project media, staged results, or the drawer's Upload action.

DreamCut model jobs run through DreamCut Cloud with the creator's credits ([cloud generation and credits](architecture/cloud-generation-and-credits.md)); there is no provider key in the product. Prices are the Cloud's quote in credits, re-checked when Generate is clicked. Jobs persist the model, catalog version, resolved input, reference hashes, accepted estimate and provider receipt. Uncertain submissions are not retried automatically. Keep imports once and leaves the timeline unchanged.

The Library's Extract frames action and drawer were removed on 2026-10-26 at the creator's request. Existing extraction records are preserved and excluded from generation history. Image comparison is supported; video results have playback, not synchronized side-by-side comparison.
