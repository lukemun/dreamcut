"use client";

import { useEffect, useState, type FocusEventHandler, type KeyboardEventHandler } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * The one colour picker in DreamCut (editor-controls.md family 8). A browser colour input
 * ignores the theme tokens, so every picker is one of these and `pnpm check:editor-ui`
 * refuses a raw one elsewhere:
 *
 * - `ColorSwatchInput`: the swatch alone, for a compact row that already names the colour.
 * - `ColorHexInput`: the exact hex beside a swatch; it reports only a complete #rrggbb.
 * - `InspectorColorField`: swatch plus exact hex in one row, as proposal cards use it.
 * - `InspectorColorControl`: a labelled Properties row with the value and Reset.
 */

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

// Focus is a neutral ring. The accent orange used to live here, which is how "this field is
// focused" ended up speaking the same language as a CTA.
const PICKER_FRAME = "relative cursor-pointer border border-[var(--chrome-line)] bg-[var(--chrome-raised)] transition-colors hover:border-[var(--edge-outline)] focus-within:ring-2 focus-within:ring-[var(--chrome-focus-ring)] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50";

/** The system picker, invisible and covering its frame, so the frame is what the creator sees. */
function PickerInput({ value, ariaLabel, disabled, onChange, onBlur, onKeyDown }: {
  value: string;
  ariaLabel: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onBlur?: FocusEventHandler<HTMLInputElement>;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
}) {
  return (
    <input
      type="color"
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
    />
  );
}

/** A colour swatch that opens the picker. `onChange` fires on every move inside the picker. */
export function ColorSwatchInput({ value, ariaLabel, disabled, onChange, onBlur, onKeyDown, className }: {
  value: string;
  ariaLabel: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  /** The picker closed or lost focus. */
  onBlur?: FocusEventHandler<HTMLInputElement>;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  className?: string;
}) {
  return (
    <span data-slot="color-swatch" className={cn(PICKER_FRAME, "inline-flex size-8 shrink-0 items-center justify-center rounded-md", className)}>
      <span className="size-5 rounded border border-[var(--edge-outline)]" style={{ backgroundColor: value }} aria-hidden="true" />
      <PickerInput value={value} ariaLabel={ariaLabel} disabled={disabled} onChange={onChange} onBlur={onBlur} onKeyDown={onKeyDown} />
    </span>
  );
}

/** The exact hex, typed. Reports only a complete #rrggbb; leaving the field restores the value. */
export function ColorHexInput({ value, label, disabled, onChange, className }: {
  value: string;
  /** What the colour is for; the field reads as "<label> hex". */
  label: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return <Input aria-label={`${label} hex`} value={draft} disabled={disabled} className={cn("h-8 min-w-0 flex-1", className)} onBlur={() => setDraft(value)} onChange={event => {
    const next = event.target.value; setDraft(next);
    if (HEX_COLOR.test(next)) onChange(next);
  }} />;
}

/**
 * Swatch and exact hex in one row. `onChange` follows the picker as it moves; `onHexChange`
 * receives a typed hex (it defaults to `onChange`), so a caller can preview the picker and
 * commit the typed value at once.
 */
export function InspectorColorField({ value, ariaLabel, disabled, onChange, onHexChange, className }: {
  value: string;
  ariaLabel: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onHexChange?: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-1 items-center gap-2", className)}>
      <ColorSwatchInput value={value} ariaLabel={ariaLabel} disabled={disabled} onChange={onChange} />
      <ColorHexInput value={value} label={ariaLabel} disabled={disabled} onChange={onHexChange ?? onChange} />
    </div>
  );
}

/**
 * Shared colour row: a swatch with the exact value, the picker on top, and Reset when
 * the value is the creator's own. Used by text colour, word colours and shape fill/outline.
 */
export function InspectorColorControl({ label, value, isCustom, onChange, onReset, ariaLabel }: {
  label: string;
  value: string;
  isCustom: boolean;
  onChange: (value: string) => void;
  onReset?: () => void;
  ariaLabel?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[13px] font-medium text-[var(--ink)]">{label}</span>
      <div className="flex items-center gap-2">
        <label className={cn(PICKER_FRAME, "flex h-9 items-center gap-2 rounded-md px-2.5 text-[13px] font-medium tabular-nums text-[var(--ink)]")}>
          <span className="size-5 rounded border border-[var(--edge-outline)]" style={{ backgroundColor: value }} aria-hidden="true" />
          <span className="tabular font-mono text-[0.78rem]">{value}</span>
          <PickerInput value={value} ariaLabel={ariaLabel ?? label} onChange={onChange} />
        </label>
        {isCustom && onReset ? (
          <Button type="button" variant="ghost" size="lg" onClick={onReset} className="text-[var(--ink-muted)] hover:text-[var(--ink)]">
            Reset
          </Button>
        ) : null}
      </div>
    </div>
  );
}
