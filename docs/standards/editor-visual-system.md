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

## Themes

Light and dark are one structure with two sets of token values (decided 2026-10-24). A state draws the
same edges, rings, shadows, outlines, transforms and typeface in both themes; only colours differ. A rule
scoped to `html[data-editor-theme=…]`, `.dark` or a Tailwind `dark:` variant sets custom properties and
colours only. When a state needs a different look per theme, give it a token defined in each theme block
and read it from one shared rule. A value that only reads in one theme (white at 4% over a light panel)
is a bug: use a token or an ink mix such as `color-mix(in srgb, var(--ink) 6%, transparent)`.

| State | One treatment, both themes |
| --- | --- |
| Selected segment or tab in a group | `--chrome-raised` fill, ink text, the shared lift shadow; no ring, tint or transform |
| Selected item, row or open drawer | `--chrome-selected-bg` fill, plus `--chrome-selected-ring` where the owner draws a ring |
| Selected chip outside a group (Guide skill filters) | `--chrome-raised` fill with a `--chrome-selected-ring` border |
| Pressed toggle outside a group | Same as a selected item |
| Hover | Ink text and an ink-mix fill (`color-mix(in srgb, var(--ink) 6–8%, transparent)`) or `--chrome-raised` |
| Focus-visible | 2px `--chrome-focus-ring` outline |
| Disabled | Opacity about 0.45–0.65; a busy button keeps full strength |
| Attention | `--attention` fill with `--attention-ink` |

Every look in Settings → Appearance → Look ships a light and a dark palette with the same shape tokens; a
look without both is not offered (Slate and Aurora were dropped on 2026-10-24 for this reason; Ember gained a light palette).

Deliberate exceptions, each also listed in `theme-parity-policy.test.ts`:

| Exception | Reason |
| --- | --- |
| Chrome look, dark: brushed-metal sheen and lifted primary buttons | Palette material; a white sheen on light surfaces cannot be seen, so light Chrome is flat |

`pnpm check:editor-ui` runs `theme-parity-policy.test.ts`, which rejects `box-shadow`, `border*`,
`outline*`, `transform`, `font-family` or `background-image` inside a theme-scoped rule, and structural
`dark:` utilities, unless the rule is a listed exception.

## Shape

Edges have one home: the shape tokens at the top of `src/app/editor-glass.css`. `--edge-control` rounds
buttons, fields, toolbar groups and segmented controls; `--edge-control-inner` a segment or button inside a
group; `--edge-surface` cards, queue rows, popovers and floating panels; `--edge-outline` is the outline on
every group, card and row; `--control-height` sizes toolbar controls. Tailwind's `rounded-*` classes map onto
the same tokens inside the editor. Feature code uses these tokens or the shared owners, never a pixel radius.
A look (Settings → Appearance → Look; `data-editor-palette`, default Studio) sets colours and these tokens
together, so changing a look changes every edge at once (decided 2026-10-22).
Studio's light theme is warm white (`#fdfcfa` / `#f7f6f3` surfaces) with a light clay
accent (`#d97757` buttons, `#e3a48a` outlines), chosen over cool blue-grey and a deeper
tan/clay version (2026-10-24); dark Studio stays blue for now. Audition palette changes as
screenshots before changing tokens.

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
| A setting in a settings panel | `SettingField` (`src/components/ui/setting-field.tsx`) | Name above a full-width control, optional status line; every setting in one panel uses it (Preview settings). |

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

`pnpm check:editor-ui` runs `edge-token-policy.test.ts`, which rejects a pixel corner (4–24px) or a raw
strong-line outline anywhere in editor components and stylesheets; round with the shape tokens and outline with
`--edge-outline`. Pills (999px), circles (50%) and 0–3px details are shapes, not edges. It also runs `visual-token-policy.test.ts`. It rejects new raw colours in
`.tsx` files; existing per-file counts are migration debt that may shrink, never grow,
and the test fails when an allowance is larger than remaining debt. The gate checks
source, not appearance. Review changed surfaces in both appearances, including hover,
selected, focus, disabled and open-menu states, and compare neighbouring fields: equal
height, radius, border and surface.
