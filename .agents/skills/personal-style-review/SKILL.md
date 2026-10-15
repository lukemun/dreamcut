---
name: personal-style-review
description: Review My Style preferences or explicitly selected saved personal styles against creator feedback and choices. Runnable without export; distinguish project-specific choices from personal defaults and keep suggestions private.
---

# Review personal preferences and saved styles

Read the [independent review contract](../../../docs/standards/independent-reviews.md). Work from a bounded task, decision, project revision or evidence packet. No export or finished session is required for an explicitly requested review. Report findings in chat; review alone does not authorize adopting them.

Read the active applicable preferences via `editing_memory_get` for a scoped project,
or the profile resolver in `src/lib/local-store/editing-memory.ts` when no project is
involved. Do not create a project just for this review. Read
[personal styles](../../../docs/personal-styles.md) and the
[knowledge architecture](../../../docs/agent-knowledge-architecture.md).

Distinguish My Style preferences (when/why to choose a treatment) from saved named personal
styles (explicit parameter bundles), optional shared recipes and one-off project direction.
Only load saved bundles when the requested review includes them; use `personal_style_list`
and `personal_style_get` for a scoped project, or the documented local profile store when
no project exists. Do not expose private taste or media in repository docs.

Compare explicit corrections, stated reasons and human-attributed choices with current
preferences. Identify useful confirmations, conflicts, stale preferences or suggested
scope changes. Preserve user quotes separately from inferences and alternatives. An
untouched control, technical default or agent-written rationale is not a taste signal.
A repeated snapshot of one decision is not repeated independent evidence.

Return zero to three private chat suggestions with supporting records, counterevidence,
confidence and proposed scope (project, format or broader). For a named saved style, list
which actual parameter choices belong together and their unsupported parts.

Review alone does not save, activate, retire or edit a preference or style. A saved personal
bundle requires an explicit save request through the existing `personal_style_save`
contract, with the actual user instruction and expected revision when updating. Follow the
existing preference owner for separately authorized changes; never edit generated STYLE.md
as authority. The automatic export worker's adoption rules remain separate and unchanged.
