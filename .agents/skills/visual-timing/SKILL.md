---
name: visual-timing
description: Time supporting visuals, graphic actors, and on-screen text to spoken beats in a DreamCut edit. Use when deciding when assets enter, persist, replace one another, or leave; when a sequence feels disconnected from narration; or when several visuals accumulate without a deliberate beat structure.
---

# Visual timing

Read `../open-edit-proposals/SKILL.md` before timeline work. Read `../caption-craft/SKILL.md` and `../video-typography/SKILL.md` when speech becomes visible text. Read `../spatial-composition/SKILL.md` when more than one foreground actor can coexist.

## Build a beat map before placing anything

Use reviewed transcript or forced-alignment words as the timing authority when available. For each spoken beat, record:

- the exact phrase that motivates the visual;
- the visual's narrative job;
- the dominant actor and any supporting actors;
- its entrance anchor, hold interval, and exit or replacement anchor;
- whether it persists into the next beat.

Approximate seconds are provisional. Do not place a visual before the phrase that gives it meaning merely to fill the screen. Enter on the key noun, contrast, reveal, or punch word; hold long enough to read; leave at the next semantic turn unless persistence is intentional.

Treat every entrance, exit, replacement, and major motion change as a scene-state boundary. List the complete active actor set immediately after each boundary. This catches a previous beat lingering underneath the next one.

## Control accumulation

Give each beat one dominant visual proposition. Supporting actors may reinforce it, but they must form one planned scene rather than arrive as unrelated stickers. Prefer replacement or a shared grouped arrangement when successive objects express the same list. Never stagger several long-lived assets independently unless their accumulation is the intended idea.

Preserve continuity across adjacent phrases: keep a stable background, anchor, scale language, and entry rhythm. Reset the scene deliberately at a topic, geography, speaker, or argumentative change.

When separately adjustable actors form one scene, keep them as separate timeline elements but propose their timing together in one option. Independent proposals cannot validate the combined scene and may become stale or incoherent when approved separately.

## Classify visible speech correctly

Literal spoken wording, claims, statistics, quotations, and paragraph builds are native text, not rasterized image cards. Use `caption_text` or the complete caption-rail operation so wording, style, timing, and layout remain editable.

For a paragraph build, create successive native text states that accumulate the intended phrase while preserving the same anchor and style. A typical three-state build is:

1. the subject appears on its spoken anchor;
2. the verb and amount join on their anchors;
3. the qualifier completes the thought and holds for comprehension.

Each state replaces the previous state; do not stack duplicate text elements or bake each state into a full-frame image. Copy the user's approved reference style when one is named, including font, size, line spacing, margins, case, animation, and placement.

## Verify the rhythm

For entrances and exits, apply the [visible-motion standard](../../../docs/standards/spatial-authoring.md#visible-motion-and-offscreen-endpoints).
Record the visible movement interval separately from any offscreen hold. Locate
clearance using the actor and effect footprint, then stop the motion there or state
the purpose of continuing it. When asked to slow an effect, verify that the added
time actually increases visible motion. Sample its midpoint and the frames around
clearance/re-entry; if bounds are unavailable, use rendered pixels and leave the
check unresolved until visibility can be assessed.

Preview at normal speed from before the first entrance through after the last exit. Then inspect rendered frames at every scene-state boundary plus the midpoint of each hold. Use `run_instrument` with `frame-state --at <comma-separated seconds>` when there is no caption-driven sample list.

The timing pass is incomplete if:

- a visual arrives before its spoken owner;
- an old beat remains active without a reason;
- two dominant ideas coexist accidentally;
- text cannot be read before it changes;
- the last state disappears before the spoken thought lands; or
- the proposal was reviewed only as isolated elements rather than as the combined scene.

## Learned refinements

- For recurring actors bridging adjacent beats, verify continuous frame coverage at every boundary, remove unintended black gaps, and vary source motion when a long hold would otherwise appear frozen.

## Effect recipe evidence

[Catalog-linked input/output evidence](references/effect-evidence.json) records reference, recreation, hashes, and limitations. Candidate and partial records do not establish a verified reusable effect.
