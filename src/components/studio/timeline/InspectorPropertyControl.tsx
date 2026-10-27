import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { RotateCcwIcon } from "lucide-react";

export function KeyframeToggleButton({
  fields,
  label,
  keyed,
  disabled,
  onToggle,
}: {
  fields: string;
  label: string;
  keyed: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      data-keyframe-fields={fields}
      aria-label={`Toggle ${label} keyframe at playhead`}
      aria-pressed={keyed}
      title="Toggle keyframe at playhead"
      disabled={disabled}
      onClick={onToggle}
      className="text-[var(--ink-muted)] hover:bg-[var(--chrome-raised)] hover:text-[var(--ink)] aria-pressed:bg-[var(--chrome-raised)] aria-pressed:border-[var(--chrome-selected-ring)] aria-pressed:text-[var(--ink)]"
      style={{ borderRadius: "var(--edge-control-inner)" }}
    >
      <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true"><path d="M5 0l5 5-5 5-5-5 5-5z" /></svg>
    </Button>
  );
}

export function InspectorPropertyControl({
  label,
  fields,
  keyed = false,
  disabled,
  onToggle,
  onReset,
  children,
  density = "normal",
}: {
  label: string;
  fields: string;
  keyed?: boolean;
  disabled: boolean;
  onToggle?: () => void;
  onReset: () => void;
  children: ReactNode;
  /** `group`: an outlined box whose header line holds the name and its actions, with a larger
   * control (wheel, curve, several rows) under it, so the name plainly belongs to what it frames. */
  density?: "normal" | "compact" | "group";
}) {
  const actions = (compact: boolean) => (
    <div className="ml-auto flex shrink-0 items-center gap-1.5">
      <Button
        variant="ghost"
        size="icon"
        data-reset-field={fields}
        aria-label={`Reset ${label}`}
        title={`Reset ${label}`}
        disabled={disabled}
        className={`${compact ? "size-6 shrink-0 " : ""}text-[var(--ink-secondary)] hover:bg-[var(--chrome-raised)] hover:text-[var(--ink)]`}
        onClick={onReset}
        style={{ borderRadius: "var(--edge-control-inner)" }}
      >
        <RotateCcwIcon aria-hidden="true" />
      </Button>
      {onToggle && <KeyframeToggleButton fields={fields} label={label} keyed={keyed} disabled={disabled} onToggle={onToggle} />}
    </div>
  );
  if (density === "group") {
    return (
      <section data-effect-control={fields} aria-label={label}
        // Outline only: a fill matching the fields inside made them disappear (low contrast).
        className="grid min-w-0 gap-2 border border-[var(--edge-outline)] p-3"
        style={{ borderRadius: "var(--edge-control)" }}>
        <div className="flex min-w-0 items-center gap-2">
          <h4 className="m-0 truncate text-[length:var(--ui-text-body)] font-semibold text-[var(--ink)]">{label}</h4>
          {actions(true)}
        </div>
        <div className="min-w-0">{children}</div>
      </section>
    );
  }
  if (density === "compact") {
    // One shared grid for every compact row (globals.css, "Compact property rows"): labels,
    // values and Reset line up in any panel, and stack when the row is too narrow for both.
    return (
      <div className="inspector-property-host">
        <div data-effect-control={fields} data-density="compact" className="inspector-property-row">
          <span title={label} className="truncate text-[length:var(--ui-text-body)] font-medium leading-tight text-[var(--ink)]">{label}</span>
          <div className="inspector-property-value">
            <div className="inspector-property-input">{children}</div>
            {actions(true)}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div data-effect-control={fields} className="inspector-property-row flex min-w-0 flex-col gap-1.5">
      <span className="text-[length:var(--ui-text-body)] font-medium text-[var(--ink)]">{label}</span>
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        {children}
        {actions(false)}
      </div>
    </div>
  );
}
