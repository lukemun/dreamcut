# Editor visual system

Applies to every editor, Library, Guide and dashboard surface, including body-portalled
menus. It defines how colour, surface material and field appearance are owned so the
product looks like one application. [Form controls](form-controls.md) owns dropdown
geometry; [editor controls](editor-controls.md) owns which component implements a task.

## Three token layers

| Layer | Lives in | Who reads it |
| --- | --- | --- |
| Palette: literal colours and material recipes (gradients, blur) | `src/app/editor-glass.css` appearance blocks only | Semantic tokens |
| Semantic: a role such as panel surface, field, accent or focus | `src/app/editor-glass.css` | Shared components and feature CSS |
| Component: a shared owner such as `NativeSelect` or `Input` | `src/components/ui/`, inspector owners | Feature code |

Feature code uses components first and semantic tokens second. It never writes a hex
value, a Tailwind palette class (`violet-300`, `bg-blue-500`) or a material recipe. A new
look is a palette change, made once, not a sweep through components.

## Semantic roles

Use the role that matches the element's job, not the one whose colour looks right.
Current token names are retained for compatibility:

| Role | Token | Use |
| --- | --- | --- |
| Canvas | `--chrome-deep` | Workspace background behind panels |
| Panel | `--chrome-panel` / `--glass-panel` | Library, Generate, Properties, Proposals bodies |
| Raised control | `--glass-control` | Cards, drop targets and secondary buttons inside a panel |
| Field | `--glass-field` | Text, select, prompt and search inputs; sits below its panel |
| Lines | `--chrome-line`, `--chrome-line-strong` | Dividers; field and card borders use the strong line |
| Ink | `--ink`, `--ink-secondary`, `--ink-muted` | Primary, supporting and placeholder text |
| Selection | `--chrome-selected-bg`, `--chrome-selected-ring` | Selected tabs, rows and assets |
| Focus | `--chrome-focus-ring` | Keyboard focus and the active field's ring |
| Primary action | `--proposal-action` (to be renamed with the palette) | One committing action per region: Generate, Approve |
| Status | `--proposal-positive`, `--proposal-warning`, `--destructive` | Meaning only: success, warning, error |

Tokens keep their domain. A proposal surface, review accent or clip colour is not a
substitute for a field or card. The 2026-10-09 Generate drift came from borrowing
`--proposal-surface` and a green focus border for form fields.

## Fields

One owner per field kind: `NativeSelect` or `SelectTrigger` for choices, `Input` for
single-line text, and the shared numeric controls for numbers. Callers pass layout
classes only (width, grid placement); they do not override surface, border, radius or
focus. Fields use the field surface, strong line, 8 px radius, 40 px default height and
a 3 px focus ring in the focus colour. A multi-line field without a shared owner (the
generation prompt's highlighted mirror) matches those values and is migrated when a
shared text-area owner exists.

## Shared presentation owners

| Pattern | Owner | Rule |
| --- | --- | --- |
| Tabs and selector groups | `SegmentedControl` (`src/components/ui/segmented-control.tsx`) | Standard size (36 px) for page sections; `size="sm"` (30 px) inside panels, drawers and toolbars; `fill` for equal-width segments. Selection is the raised surface, never an accent tint. Counts use `SegmentCount`. |
| Page heading | `PageHeader` (`src/components/ui/page-header.tsx`) | Catalog and record pages (Library, Guide, User, History). Project-scoped pages show the project as eyebrow; account-wide pages (Guide, User) do not. Workspaces (Editor, Generate, Storyboard) have no page title. |
| Command menus | `ActionMenu` / `ActionMenuItem` (`src/components/ui/menu.tsx`) | Several related commands behind one button (e.g. Add media: Library, Files, Folder). Use `Select` for choosing a value. |
| Inline choice chip | `SelectTrigger variant="chip"` | Quiet composer and toolbar choices such as the chat agent and model. |
| Status | `.memory-status` with `data-status` | Outcomes such as approved, pending or rejected read as status badges, not prose. |

One primary (filled) button per region; secondary actions are outline, utilities ghost or
icon-only with a tooltip. Do not restyle a shared owner from a feature stylesheet; extend the
owner instead. The 2026-10-09 audit found five tab treatments and four stacked overrides for
one tab group; all now resolve to the owner above.

## Open space over lines

Content is what stands out: clips, media and the user's text. Separate regions with space and a
quiet surface change first, and a hairline only where rows would otherwise blur together. Do not box
every row, outline every region, or stack gloss gradients; an idle control is a plain glyph until it is
hovered or active. In the dark appearance a divider is a dark seam (black at about 40–45%: `--chrome-line`,
`--timeline-lane-divider`), never a light line, so separation reads as absence. The timeline follows
this: rows separate by `--timeline-lane-divider`, lanes have no outlines, and Solo, Mute and the lane menu draw a fill only when on (2026-10-09,
modelled on Cardboard's timeline).

## Scrolling

Scrollbars are hidden app-wide (`globals.css`); regions still scroll by trackpad, wheel,
touch and keyboard. Do not add visible scrollbar styling to a feature. Where position
matters (long lists, the timeline), show it through content such as counts, rulers or
the playhead, not a scrollbar.

## Accent and material

Accent colour marks selection, focus and the primary action; it is not decoration. Keep
one filled primary action per region. Status colours carry their meaning in both
appearances and are never reused as brand accents.

Material (translucency, blur, gradients, specular edges) is part of the palette layer
and applies through surface tokens. It needs an opaque fallback under
`prefers-reduced-transparency`, must keep text at 4.5:1 against the composited surface,
and never samples media or follows the playback clock. Media pixels and colour swatches
are content, not interface surfaces.

## Enforcement and review

`pnpm check:editor-ui` runs `visual-token-policy.test.ts`. It rejects new raw colours in
`.tsx` files; existing per-file counts are migration debt that may shrink, never grow,
and the test fails when an allowance is larger than remaining debt. The gate checks
source, not appearance. Review changed surfaces in both appearances, including hover,
selected, focus, disabled and open-menu states, and compare neighbouring fields: equal
height, radius, border and surface.
