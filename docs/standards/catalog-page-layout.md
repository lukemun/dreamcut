# Catalog page layout

Applies to Guide and future browsing/catalog pages. The editor canvas, timeline,
and task-specific inspectors have different interaction requirements.

- Use the existing project header and semantic theme tokens. Reserve header action
  widths so project navigation does not shift between sections.
- Put section tabs in the page heading. Do not add a second floating toolbar.
- Guide opens on Overview. Lead with Library, Editor, Guide, and User, then
  show a plain-language path from media intake and editorial assembly through
  review and export. Effects in Guide and Skills in User are methods within that workflow;
  effect recreation belongs in a later contribution section, not the opening pitch.
- Use `SegmentedControl` from `src/components/ui/segmented-control.tsx` for header and page-section selectors. Page-section tabs use the standard size (36px outer, 28px items); the project header and panels use `size="sm"` (30px outer, 22px items). Both share one inset surface and theme-token selection/focus states; see the [visual system](editor-visual-system.md#shared-presentation-owners). Do not create a separate underline, pill or outlined treatment for the same navigation pattern. Keep navigation as links with `aria-current`; in-page tabs retain `tablist`/`tab`/`tabpanel`, roving focus and arrow/Home/End keyboard behavior. Category filter pills are filters, not section tabs.
- Give the page body one vertical scroll owner. Lists, examples, prompts, and
  expanded details grow naturally; do not give them fixed-height scroll boxes.
- Browsing skills uses one row per skill: name and purpose on the left, a visible
  visually separate Use this for panel on the right. Show a real example there
  only when available; omit synthetic step diagrams and empty placeholders.
  Put the natural-language title and linked installed skill identifier together.
  Prompts may use a compact disclosure. Guide does not need a search toolbar.
- Group skills by purpose, with Captions & text first. Within each group, use the
  catalog’s explicit order to prioritize common workflows over specialized ones;
  do not label this as measured popularity without usage evidence. Use talking-head
  video, not presenter video, as the creator-facing name. Non-sticky category pills
  filter the groups and show counts. Each skill includes concrete use cases and
  input/output metadata (Needs / Produces). Preserve one page scroll when filtering.
- Effects lead with a large example beside concise input directions. Keep prompts
  and editing notes in disclosures beneath the inputs. Preserve media aspect ratios
  and stack the example above the directions on narrow screens.
- Use shared typography, controls, borders, spacing, and color tokens. Do not
  introduce a new visual treatment for each catalog.
- Show real available examples. Omit empty demo placeholders.

## Verification

Inspect Guide Overview and Effects, plus User My style, Skills, and Settings with all skills and examples visible and a prompt expanded. At desktop widths, confirm there is only one
vertically overflowing scroll container, no horizontal page overflow, and that
wheel scrolling over any content moves the same page body. Verify keyboard tabs,
prompt disclosure, and copy feedback. Screenshots alone do not establish scrolling.

## Pen reference

mockups. It is a visual reference, not an enforced reusable component library.
When adding a reusable pattern in Pen, label its applicable state and responsive
behavior and connect it to the implemented component. The shared CSS/components
and these interaction checks enforce the shipped behavior.

## User and project scope

User contains My style, Video ideas, Skills, and Settings. [Video ideas](../video-ideas.md)
stores personal references and capture/editing notes across projects, separately from
style preferences and reusable effect recipes. Skills has All / Personal / Catalog origin
filters and a visible origin pill on each row. Catalog means the shared skills directory,
including workflows outside the curated editing list. Personal means the local profile’s
skills directory; never infer personal ownership from missing catalog metadata. See
[personal skills](../personal-skills.md) for storage and activation limits.

The project header keeps Editor / Generate / Storyboard together in the existing segmented
control; Guide and User live in the dashboard navigation. Do not add a separate User button or Project history header destination.
Project history is reached from the editor’s existing Edit history control (Full history). It is one dated feed of the
creator's requests with their card outcomes and the timeline changes that followed, a waiting-cards notice, and a collapsed
Export reviews section. Retrospectives do not have a top-level tab.
Old project Memory URLs redirect to User. User sections are URL-addressable and survive reload.
