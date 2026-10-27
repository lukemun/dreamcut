# Engineering standards

Shared policy for all coding agents and maintainers. The [agent knowledge architecture](../agent-knowledge-architecture.md) explains why standards are separate from skills, style recipes, personal preferences, and design documents. [AGENTS.md](../../AGENTS.md) is the repository operating guide; [all repository skills](../../.agents/skills/README.md) provide task-specific procedures.

This directory contains durable requirements shared across workflows. Each standard
must have a clear scope and appear in the index below. Extend the existing owner
before adding a new standard. Internal reviews, session receipts and screenshots belong in ignored `private/`,
not public documentation. Publish only reusable, sanitized benchmark methodology and results
with their owning architecture. Implementation references and pilot descriptions belong
in [architecture](../architecture/); skill procedures and evolution logs stay with
their skills. A report is evidence for a standard, not another standard.

Start with the [software architecture overview](../architecture/README.md) for the rationale connecting these contracts.

| Standard | Execution skills |
| --- | --- |
| [Spatial authoring](spatial-authoring.md): semantic placement, measured coordinate fallback, one placement authority, and visible motion endpoints | [spatial-composition](../../.agents/skills/spatial-composition/SKILL.md), [visual-timing](../../.agents/skills/visual-timing/SKILL.md) |
| [Proposal presentation](proposal-presentation.md): decision-sized cards, contextual preview, human approval, and meaningful tuning | [dreamcut-proposals](../../.agents/skills/dreamcut-proposals/SKILL.md) |
| [Editor feature integration](editor-feature-integration.md): task ownership, cohesive controls, review evidence and enforcement | [editor-ui-design](../../.agents/skills/editor-ui-design/SKILL.md) |
| [Editor controls](editor-controls.md): shared component map, examples, sliders/clickers, gesture semantics and enforcement | Required for editor UI changes, including headings, disclosures and property inputs |
| [Editor visual system](editor-visual-system.md): palette, semantic and component token layers, field appearance, accent and material rules, raw-colour gate | Applies to every editor surface and shared component |
| [Form controls](form-controls.md): shared dropdown caret inset, label clearance, and accessibility | Applies to every editor form and control primitive |
| [Catalog page layout](catalog-page-layout.md): shared headers, one page scroll, inline details, and responsive verification | Applies to Guide and browsing pages |
| [Preview and export contract](renderer-contract.md): mandatory pixel, parity and encoded-output tests for effects | Applies to all renderer and effect changes |
| [Playback reliability](playback-reliability.md): persistent decoders, media clock ownership and measured real-time acceptance | Applies to speed, preview audio, buffering and proxy changes |
| [Reusable effect capabilities](effect-capabilities.md): reusable inputs, creator UX, integration, portability, and verification | [recreate-effect](../../.agents/skills/recreate-effect/SKILL.md) |
| [Editorial feedback](editorial-feedback.md): capture direction, preserve provenance and link work/outcomes | Applies to editing agents, Memory and export evidence |
| [Editing evaluation](editing-evaluation.md): evidence, case promotion, comparison and refresh policy | DreamCut team eval curation |
| [Mandatory video preview proxies](preview-proxy-contract.md): fail closed on missing, unverified, or oversized preview video | [editor-media-preprocessing](../../.agents/skills/editor-media-preprocessing/SKILL.md) |
| [Source-format and platform coverage](source-format-coverage.md): declared, evidenced support per phone/camera format class and platform for every media feature | [device-format-coverage](../../.agents/skills/device-format-coverage/SKILL.md), [windows-compatibility](../../.agents/skills/windows-compatibility/SKILL.md) |
| [PR review](pr-review.md): evidence, severity, readiness, validation and repair | [pr-review](../../.agents/skills/pr-review/SKILL.md) orchestrates the PR workflow; [code-review](../../.agents/skills/code-review/SKILL.md) performs the required native review and verifies findings |
| [Inspector information architecture](inspector-information-architecture.md): tab domains, control placement, keyframes, and row alignment | Applies to every editor Properties surface and control primitive |
| [Reusable artwork](reusable-artwork.md): immutable appearance assets, source identity, and composition transfer verification | Applies when saving or transferring existing graphic elements across compositions or editors |
| [Skill evolution](skill-evolution.md): authoring conventions, the skill-change lifecycle, and per-skill evolution logs | Applies to every repository skill |
| [Vertical video safe zones](vertical-video-safe-zones.md): measured platform safe areas, the action rail, and organic/paid-ad equivalence | [platform-video-delivery](../../.agents/skills/platform-video-delivery/SKILL.md), [caption-craft](../../.agents/skills/caption-craft/SKILL.md) |

Keep policy in standards and reusable procedures in their canonical skills. Add new standards here and new skills to the skill index. Agent-specific integrations should point to these sources rather than maintain copies.

Standards do not require per-file evolution logs. Preserve change history in Git and
link material decisions and supporting evidence from the affected standard. Skill
learning lives in each skill folder's `evolution.md`; see the
[contributor layout](../agent-knowledge-architecture.md#contributor-file-layout).


- [Editable parameter contract](editable-parameter-contract.md): effect parameters, generated proposal controls, compound bindings, legacy gaps and executable enforcement.

- [Tool authoring and evolution](tool-authoring.md): reusable capabilities, recovery errors, caching, accounting and validation.
- [Agent surface parity](agent-surface-parity.md): coding agents and the in-editor agent share one MCP surface; registry editor access, derived lists and skill gaps.
- [Agent/harness authoring](agent-harness-authoring.md): context, modalities, permissions, budgets, recovery and model-plus-harness evaluation.

- [Visual recipe presentation](recipe-visual-presentation.md): result playback, visual inputs, ordered transformation frames and contributor acceptance.

## Storage

[DreamCut Library contract](library-contract.md) defines the shared project folder every front end reads and writes: location, marker, versioning, unknown-field preservation, stale-write guards, migration and current conformance gaps.

[Storage lifecycle and disk-pressure safety](storage-lifecycle.md) defines derivative ownership, bounded scratch, free-space reservations and cleanup acceptance. Runtime coverage and migration are tracked in the [storage management plan](../architecture/storage-management.md).
