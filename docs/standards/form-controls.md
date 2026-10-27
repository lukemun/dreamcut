# Form controls

Applies to generation, inspectors, dialogs, and other editor forms.

## Dropdown spacing

- Keep the trailing caret at least **12 px inside the control edge**, including compact controls.
- Use a **16 px caret** and at least **8 px between the label and caret**. Dropdowns reserve **36 px** of trailing text space (12 + 16 + 8).
- Long values truncate within their text area; they must not overlap, push out, or hide the caret. Allow grid/flex children to shrink with `min-width: 0`.
- Use logical start/end spacing so the placement follows the text direction.
- The whole control opens the menu. Decorative carets are hidden from assistive technology and do not intercept pointer events. Preserve labels, keyboard selection, focus indication, and disabled behavior.

## Shared implementation

Use `OptionSelect` (flat list) or `Select` (grouped or custom) from `src/components/ui/select.tsx` for every dropdown, so compact rows, themes and sizing apply everywhere. Never use a browser `<select>`: `pnpm check:editor-ui` refuses it. Do not override the shared caret inset to save space. Multiple-selection list boxes are a separate control and do not use a dropdown caret.

## Checkboxes and colours

Use `Checkbox` from `src/components/ui/checkbox.tsx` for every yes/no box and the colour owners in `src/components/studio/timeline/InspectorColorControl.tsx` for every colour, so focus, size and both themes match the panel. Never use a browser checkbox or colour input: `pnpm check:editor-ui` refuses them.

## Appearance across project tabs

The [editor visual system](editor-visual-system.md) owns token layers and field appearance. Editor, Library, Guide, and User share the appearance palette in `src/app/editor-glass.css`, including their nested tabs, drawers, generation results, and body-portalled menus. Use semantic surface, ink, selection, and action tokens rather than fixed dark backgrounds or white text. Light mode uses cool mist surfaces, white input fields, dark blue-gray ink, and blue selection/action states. Success, warning, and error colors retain their status meaning and need readable values in both modes. Media pixels and color swatches are not interface surfaces.

Review route navigation and selected, hover, focus, disabled, and expanded-menu states in both appearances. Checking only the Settings page is insufficient for an appearance change.

## Control review

Compact proposal number fields and their attached up/down buttons share one
height and border treatment. Center the numeric value. Time controls use 0.01-second
steps and display at most two decimal places; retain finer internal frame timing
without exposing extra decimal digits. Frame-quantized proposal transitions use
whole-frame steps and a visible frames unit, converting at the display boundary;
their source-dependent bounds use the same conversion. Keep integer controls integral and preserve
the declared adjustment bounds.

Verify the rendered control in its narrowest supported container with a long selected value, alongside neighboring fields. Check the inset, label clearance, keyboard opening/selection, and visible focus. Include expanded optional settings in the review, not only the first visible dropdown.

Adopted after the generation panel's browser-default carets appeared against the right border (2026-09-27). The shared primitives own the spacing so individual forms do not have to reproduce it.

## Editor property inputs

The [editor control standard](editor-controls.md) provides the canonical component
map, row example, gesture/Undo contract and executable gate. Numeric effect fields
must use those shared controls, including sliders and +/− clickers. A property-row
wrapper around a custom input does not satisfy the standard.
