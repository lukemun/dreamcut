# Research records

This folder preserves evidence. Our interpretation lives in the [wiki](../wiki/README.md), and implementation proposals link back to the findings that support them.

Follow the repository [research-deliverable skill](../../.agents/skills/research-deliverable/SKILL.md) and its [documented adaptations](../../.agents/skills/research-deliverable/PROVENANCE.md).

## Publishing layers

1. **Source records:** `raw/<topic>/` contains source metadata, explicitly labeled short verbatim excerpts or redistributable licensed captures, and redistributable technical evidence. Keep local command output and internal audits in ignored `private/`. Never describe an excerpt or reconstructed note as a full original capture. Keep full third-party articles, social videos, audio, transcripts, authenticated downloader metadata, and any source marked private or non-redistributable outside Git.
2. **Findings:** dated Markdown files report what sources or repository inspection establish, with inline citations, method, and caveats. Internal implementation audits, competitor evaluations and personal editorial research stay in ignored `private/`; publish only directly relevant, sanitized technical findings.
3. **Application:** topic articles in `docs/wiki/` interpret findings; design documents and reviews state recommendations, alternatives, and unresolved decisions.

These are documentation layers, not runtime L1–L4 evidence levels. A research paper's abstract is not a face detector's L1 observation.

## Current investigation

- [Animation libraries, component collections and motion-heavy landing pages](2026-10-11-animated-landing-sites.md) — [sources and screenshots](raw/2026-10-11-animated-landing-sites/sources.md); [site motion direction](../design/2026-10-11-dreamcut-site-motion-direction.md).

- [How motion graphics made with Claude are produced](2026-10-10-claude-motion-graphics-pipelines.md) — code-to-video renderers versus editable project files; [sources](raw/claude-motion-graphics/sources.md).

- [Agent-agnostic chat history and session resume](2026-10-09-agent-agnostic-chat-history.md) — [sources](raw/agent-chat-history/sources.md); [proposed provider-neutral transcript](../architecture/agent-chat-history.md).

- [Installed desktop testing](2026-10-09-installed-desktop-testing.md) — [sources](raw/installed-desktop-testing/sources.md); [local installer workflow and acceptance matrix](../architecture/local-installer-testing.md).

- [Local dictation and Windows packaging](2026-10-09-local-dictation-windows.md) — [source inventory](raw/local-dictation-windows/sources.md); [implementation and qualification gates](../architecture/local-dictation-windows.md).

- [Editing harness foundations: compaction, resume, recovery and visual inputs](2026-09-30-editing-harness-foundations.md) — [source inventory](raw/editing-harness-foundations/sources.md); [proposed DreamCut harness](../architecture/editing-operator-harness.md).

- [Agent, skill, and workflow design findings](2026-09-16-agent-skill-workflow-design.md)
- [Editorial assembly harness application](../wiki/editorial-assembly-harness.md)
- [Agent/skill/workflow source inventory](raw/agent-skill-workflows/README.md)

- [Spatial reasoning and agent design: external findings](2026-09-12-spatial-reasoning-and-agent-design.md)
- [Spatial reasoning: primary-paper update](2026-09-27-spatial-reasoning-frontier-update.md)
- [Source inventory and receipts](raw/spatial-evidence/README.md)
- [Wiki interpretation](../wiki/spatial-evidence.md)
- [Research-to-architecture reference](../wiki/spatial-reasoning-architecture-reference.md)
- [Architecture](../spatial-evidence-architecture.md)

- [Long-context and video-evidence findings](2026-09-27-context-and-media-evidence.md)
- [Context and media-intake architecture reference](../wiki/context-and-media-intake-architecture-reference.md)
- [Agent failure-mode reference map](../wiki/agent-failure-mode-reference-map.md)
- [Visual and spatiotemporal editing failure modes: primary-source findings](2026-09-27-visual-editing-failure-modes.md)
- [Visual editing source record](raw/editing-visual-failure-modes/sources.md)

## Required record fields

For external sources: stable ID, title, author/publisher where verified, original URL, publication date or explicit unknown, retrieval date, examined section, capture scope, and claims supported. Keep search-only leads separate from verified sources. Public availability does not authorize copying entire articles; obey applicable quotation and license limits.

For code audits: repository revision, relevant file fingerprints, source links, exact commands, actual results, and verification limits. Separate source-inspection deductions from reproduced failures. Do not describe selected tests as full-system proof.

When a source changes, add a new dated record or revision note and update downstream articles. A failed fetch is an unresolved retrieval, not proof that a source or claim does not exist. Record attempted retrieval methods honestly.

- [Handwriting animation: stroke fonts and font-preserving masks](2026-09-27-handwriting-animation.md)

- [UI separation and media playback](2026-09-29-preview-playback-architecture.md)

- [Agent evaluation methods and tool-use benchmarks](2026-09-30-editing-agent-evaluations.md) — dated primary-source findings; [DreamCut starter application](../architecture/editing-eval-starter.md).

- [Granular preview caching](2026-10-05-granular-preview-cache.md) — primary-source findings on intermediate caches, regional processing and GPU playback; [proposed application](../architecture/granular-preview-cache-proposal.md).

- [Desktop media application practices](2026-10-08-desktop-media-stack.md) — Electron boundaries, Next.js packaging, browser media workers, distribution and Sentry; [application plan](../architecture/desktop-app-plan.md).

- [Desktop release readiness](2026-10-09-desktop-release-readiness.md) — official guidance on security, signing, updates, diagnostics, accessibility and distribution; [release gates](../architecture/desktop-release-readiness.md).
