"use client";

import { Slider as SliderPrimitive } from "@base-ui/react/slider";

type SliderProps = {
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  label: string;
  largeTarget?: boolean;
  density?: "normal" | "compact";
  onValueChange: (value: number) => void;
  onValueCommit: (value: number) => void;
  onInteractionCancel?: () => void;
};

export function Slider({
  value,
  min,
  max,
  step = 1,
  disabled = false,
  label,
  largeTarget = false,
  density = "normal",
  onValueChange,
  onValueCommit,
  onInteractionCancel,
}: SliderProps) {
  return (
    <SliderPrimitive.Root
      value={value}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onValueChange={onValueChange}
      onValueCommitted={onValueCommit}
      onPointerCancel={onInteractionCancel}
      className={`relative flex ${density === "compact" ? "min-w-0" : "min-w-24"} flex-1 touch-none items-center py-2 data-[disabled]:opacity-45`}
    >
      <SliderPrimitive.Control style={largeTarget ? { minHeight: 32 } : undefined} className="relative flex h-5 w-full cursor-pointer touch-none items-center data-[disabled]:cursor-default">
        <SliderPrimitive.Track className="relative h-1.5 w-full overflow-hidden rounded-full bg-[var(--chrome-deep)] ring-1 ring-[var(--chrome-line-strong)]">
          <SliderPrimitive.Indicator className="h-full bg-[var(--ink-muted)]" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          style={largeTarget ? { width: 22, height: 22 } : undefined}
          aria-label={label}
          className="size-4 rounded-full border-2 border-[var(--chrome-panel)] bg-[var(--ink)] shadow-md ring-1 ring-[var(--chrome-line-strong)] outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-[var(--chrome-focus-ring)] data-[dragging]:scale-110"
        />
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}

type RangeSliderProps = {
  value: readonly [number, number];
  min: number;
  max: number;
  step?: number;
  largeStep?: number;
  disabled?: boolean;
  /** Accessible names for the two handles, e.g. ["In point", "Out point"]. */
  labels: readonly [string, string];
  valueText?: (value: number, index: number) => string;
  /** Optional position marker (such as a playhead) drawn on the track. */
  marker?: number | null;
  onValueChange: (value: [number, number], activeThumb: number) => void;
  onValueCommit: (value: [number, number]) => void;
  onInteractionCancel?: () => void;
};

/** Two-handle range over one bounded value, e.g. a clip's in and out points. Handles
 * cannot cross; arrow keys nudge one step and Shift+arrow or Page keys move `largeStep`. */
export function RangeSlider({
  value, min, max, step = 1, largeStep, disabled = false, labels, valueText, marker = null,
  onValueChange, onValueCommit, onInteractionCancel,
}: RangeSliderProps) {
  const span = max - min || 1;
  return (
    <SliderPrimitive.Root
      value={value}
      min={min}
      max={max}
      step={step}
      largeStep={largeStep}
      minStepsBetweenValues={1}
      thumbCollisionBehavior="none"
      disabled={disabled}
      onValueChange={(next, details) => { if (Array.isArray(next)) onValueChange([next[0], next[1]], details.activeThumbIndex); }}
      onValueCommitted={next => { if (Array.isArray(next)) onValueCommit([next[0], next[1]]); }}
      onPointerCancel={onInteractionCancel}
      className="relative flex min-w-0 flex-1 touch-none items-center py-2 data-[disabled]:opacity-45"
    >
      <SliderPrimitive.Control style={{ minHeight: 32 }} className="relative flex h-5 w-full cursor-pointer touch-none items-center data-[disabled]:cursor-default">
        <SliderPrimitive.Track className="relative h-2 w-full overflow-hidden rounded-full bg-[var(--chrome-deep)] ring-1 ring-[var(--chrome-line-strong)]">
          <SliderPrimitive.Indicator className="h-full bg-[var(--ink-muted)]" />
        </SliderPrimitive.Track>
        {marker !== null && marker >= min && marker <= max && <span aria-hidden="true" className="pointer-events-none absolute top-0 bottom-0 w-0.5 -translate-x-1/2 rounded-full bg-[var(--chrome-focus-ring)]" style={{ left: `${((marker - min) / span) * 100}%` }} />}
        {[0, 1].map(index => (
          <SliderPrimitive.Thumb
            key={index}
            index={index}
            aria-label={labels[index]}
            getAriaValueText={valueText ? (_formatted, current) => valueText(current, index) : undefined}
            style={{ width: 14, height: 22 }}
            className="rounded-md border-2 border-[var(--chrome-panel)] bg-[var(--ink)] shadow-md ring-1 ring-[var(--chrome-line-strong)] outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-[var(--chrome-focus-ring)] data-[dragging]:scale-110"
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}
