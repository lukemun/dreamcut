"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { PlusIcon, MinusIcon } from "lucide-react";

export function ScrubNumberInput({
  ariaLabel,
  value,
  min,
  max,
  step = 0.01,
  keyboardStep = 1,
  precision,
  placeholder,
  disabled = false,
  width,
  density = "normal",
  onChange,
  onCommit,
  onCancel,
  resetSignal,
}: {
  ariaLabel: string;
  value: string;
  min: number;
  max: number;
  step?: number;
  keyboardStep?: number;
  precision?: number;
  placeholder?: string;
  disabled?: boolean;
  /** @deprecated Numeric fields now share one full-field horizontal scrub interaction. */
  control?: "drag" | "stepper";
  width?: number;
  density?: "normal" | "compact";
  onChange: (value: string) => void;
  onCommit: (value?: string) => void;
  onCancel?: () => void;
  /** Clears an in-progress display draft after an external Reset action. */
  resetSignal?: number;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const latestValueRef = useRef(value);
  const draggingRef = useRef(false);
  const cancelBlurRef = useRef(false);
  const cancelPointerInteractionRef = useRef<(() => void) | null>(null);

  const clamp = useCallback((next: number) => Math.min(max, Math.max(min, next)), [max, min]);
  const roundToStep = useCallback((next: number) => {
    const resolvedPrecision = precision ?? Math.max(0, `${step}`.split(".")[1]?.length ?? 0);
    return Number(clamp(next).toFixed(resolvedPrecision));
  }, [clamp, precision, step]);
  const formatValue = useCallback(
    (next: number) => next.toFixed(precision ?? Math.max(0, `${step}`.split(".")[1]?.length ?? 0)),
    [precision, step],
  );

  const displayValue = preview ?? value;
  const stepLabel = precision == null ? String(step) : step.toFixed(precision);
  const keyboardStepLabel = keyboardStep.toFixed(precision ?? Math.min(4, Math.max(0, `${keyboardStep}`.split(".")[1]?.length ?? 0)));
  // The section-level scrub hint explains horizontal dragging once. Keep the
  // field itself focused on the editable value and its explicit +/- controls.
  // Compact fits slider, value, +/- and unit on one line in a ~300px Properties panel (2026-10-13).
  const shellWidth = density === "compact" ? 104 : Math.max(width ?? 152, 152);
  // Focus is INK, not hue (ui-design-system §10). The accent orange means a CTA or data —
  // never "this one is focused". It used to tint this shell, which is how the accent leaked
  // into chrome across the whole editor.
  const borderColor = focused ? "var(--chrome-focus-ring)" : "var(--chrome-line)";
  const shellBackground = focused ? "var(--chrome-raised)" : "var(--chrome-panel)";

  useEffect(() => {
    latestValueRef.current = value;
  }, [value]);

  useEffect(() => {
    setPreview(null);
    latestValueRef.current = value;
  }, [resetSignal]);

  useEffect(() => () => {
    cancelPointerInteractionRef.current?.();
  }, []);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const node = rootRef.current;
      if (!node) return;
      if (event.target instanceof Node && !node.contains(event.target)) {
        setFocused(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const nudge = useCallback((direction: -1 | 1) => {
    if (disabled) return;
    const parsed = Number.parseFloat(displayValue);
    const fallback = Number.isFinite(parsed) ? parsed : min;
    const nextString = formatValue(roundToStep(fallback + direction * step));
    latestValueRef.current = nextString;
    setPreview(null);
    onChange(nextString);
    onCommit(nextString);
  }, [disabled, displayValue, formatValue, min, onChange, onCommit, roundToStep, step]);

  return (
    <div
      ref={rootRef}
      data-inspector-number
      title={`Drag left or right to adjust. Click to type. Arrow Up or Down changes by ${keyboardStepLabel}${step < keyboardStep ? "; hold Shift for the fine step" : ""}.`}
      onPointerDown={(event) => {
        if (disabled || event.button !== 0) return;
        const startX = event.clientX;
        const startValue = Number.parseFloat(value);
        const fallback = Number.isFinite(startValue) ? startValue : min;
        let dragging = false;
        const previousUserSelect = document.body.style.userSelect;

        const cleanupPointerInteraction = () => {
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
          window.removeEventListener("pointercancel", onCancelPointer);
          window.removeEventListener("blur", onCancelPointer);
          document.body.style.userSelect = previousUserSelect;
          cancelPointerInteractionRef.current = null;
        };

        const onMove = (moveEvent: PointerEvent) => {
          const delta = moveEvent.clientX - startX;
          if (!dragging && Math.abs(delta) < 3) return;
          if (!dragging) {
            dragging = true;
            draggingRef.current = true;
            document.body.style.userSelect = "none";
            if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
          }
          moveEvent.preventDefault();
          const nextString = formatValue(roundToStep(fallback + delta * step));
          latestValueRef.current = nextString;
          setPreview(nextString);
          onChange(nextString);
        };

        const onUp = (upEvent: PointerEvent) => {
          cleanupPointerInteraction();
          if (!dragging) return;
          const delta = upEvent.clientX - startX;
          const nextString = formatValue(roundToStep(fallback + delta * step));
          latestValueRef.current = nextString;
          setPreview(null);
          onChange(nextString);
          onCommit(nextString);
          draggingRef.current = false;
        };

        const onCancelPointer = () => {
          cleanupPointerInteraction();
          if (!dragging) return;
          draggingRef.current = false;
          setPreview(null);
          onCancel?.();
        };

        cancelPointerInteractionRef.current = onCancelPointer;
        window.addEventListener("pointermove", onMove, { passive: false });
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onCancelPointer);
        window.addEventListener("blur", onCancelPointer);
      }}
      style={{
        display: "flex",
        alignItems: "center",
        width: shellWidth,
        maxWidth: "100%",
        minWidth: density === "compact" ? 96 : 112,
        height: density === "compact" ? 34 : 44,
        flexShrink: 1,
        borderRadius: 4,
        overflow: "hidden",
        background: shellBackground,
        border: `1px solid ${borderColor}`,
        opacity: disabled ? 0.6 : 1,
        boxShadow: focused ? "0 0 0 1px var(--chrome-raised)" : "none",
        transition: "border-color 120ms ease, background 120ms ease, box-shadow 120ms ease",
        cursor: disabled ? "default" : "ew-resize",
      }}
    >
      <Input
        aria-label={ariaLabel}
        type="number"
        step={String(step)}
        min={String(min)}
        max={String(max)}
        placeholder={placeholder}
        value={displayValue}
        disabled={disabled}
        onChange={(event) => {
          setPreview(null);
          latestValueRef.current = event.target.value;
          onChange(event.target.value);
        }}
        onFocus={(event) => {
          setFocused(true);
          event.currentTarget.select();
        }}
        onBlur={() => {
          setFocused(false);
          if (draggingRef.current || cancelBlurRef.current) { cancelBlurRef.current = false; return; }
          onCommit(latestValueRef.current);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            cancelBlurRef.current = true;
            setPreview(null);
            onCancel?.();
            event.currentTarget.blur();
            return;
          }
          if (event.key === "Enter") {
            event.currentTarget.blur();
            return;
          }
          if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
          event.preventDefault();
          event.stopPropagation();
          const startValue = Number.parseFloat(displayValue);
          const fallback = Number.isFinite(startValue) ? startValue : min;
          const direction = event.key === "ArrowUp" ? 1 : -1;
          const keyStep = event.shiftKey ? step : keyboardStep;
          const next = roundToStep(fallback + direction * keyStep);
          const nextString = formatValue(next);
          setPreview(nextString);
          latestValueRef.current = nextString;
          onChange(nextString);
          onCommit(nextString);
        }}
        style={{
          width: "auto",
          minWidth: 0,
          flex: 1,
          height: density === "compact" ? 32 : 42,
          fontSize: density === "compact" ? "var(--ui-text-small)" : "var(--ui-text-body)",
          fontFamily: "var(--font-mono, monospace)",
          background: "transparent",
          border: "none",
          color: "var(--ink)",
          borderRadius: 0,
          textAlign: "center",
          padding: "0 2px",
          boxShadow: "none",
          cursor: disabled ? "default" : "ew-resize",
        }}
      />
      <span
        role="group"
        aria-label="One-step controls"
        data-number-steppers
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          width: density === "compact" ? "min(48px, 46%)" : "min(80px, 42%)",
          height: "100%",
          flexShrink: 0,
          borderLeft: "1px solid var(--chrome-line)",
          background: "var(--chrome-deep)",
        }}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`Increase value by ${stepLabel}`}
          title={`Increase by ${stepLabel}`}
          disabled={disabled}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => nudge(1)}
          className="min-h-0 min-w-0 rounded-none border-0 p-0 text-[var(--ink-secondary)] hover:bg-white/10 hover:text-[var(--ink)]"
          style={{ width: "100%", height: density === "compact" ? 32 : 42 }}
        >
          <PlusIcon aria-hidden="true" style={{ width: 13, height: 13 }} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`Decrease value by ${stepLabel}`}
          title={`Decrease by ${stepLabel}`}
          disabled={disabled}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => nudge(-1)}
          className="min-h-0 min-w-0 rounded-none border-0 border-l border-[var(--chrome-line)] p-0 text-[var(--ink-secondary)] hover:bg-white/10 hover:text-[var(--ink)]"
          style={{ width: "100%", height: density === "compact" ? 32 : 42 }}
        >
          <MinusIcon aria-hidden="true" style={{ width: 13, height: 13 }} />
        </Button>
      </span>
    </div>
  );
}

export function SliderScrubControl({
  value,
  min,
  max,
  step,
  fallback,
  label,
  unit = "",
  compact = false,
  disabled,
  onChange,
  onCommit,
  onCancel,
  // Compact by default: slider, value, +/- and unit fit one line in the Properties panel (2026-10-13).
  density = "compact",
  precision: displayPrecision,
  resetSignal,
  sliderRange,
  largeTarget = label === "volume",
}: {
  largeTarget?: boolean;
  sliderRange?: {min: number; max: number};
  value: string;
  min: number;
  max: number;
  step: number;
  fallback: number;
  label: string;
  unit?: string;
  compact?: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
  onCommit: (value?: string) => void;
  onCancel?: () => void;
  density?: "normal" | "compact";
  precision?: number;
  resetSignal?: number;
}) {
  const [liveValue, setLiveValue] = useState<number | null>(null);
  const liveValueRef = useRef<number | null>(null);
  const onCancelRef = useRef(onCancel);
  const parsed = Number.parseFloat(value);
  const resolvedValue = Number.isFinite(parsed) ? parsed : fallback;
  const sliderMin = sliderRange ? Math.max(min, Math.min(sliderRange.min, resolvedValue)) : min;
  const sliderMax = sliderRange ? Math.min(max, Math.max(sliderRange.max, resolvedValue)) : max;
  const sliderValue = Math.min(sliderMax, Math.max(sliderMin, liveValue ?? resolvedValue));
  const precision = displayPrecision ?? Math.max(0, `${step}`.split(".")[1]?.length ?? 0);
  const format = (next: number) => next.toFixed(precision);
  const commitNumber = (raw: string | undefined) => {
    const parsedNext = raw == null ? NaN : Number.parseFloat(raw);
    if (!Number.isFinite(parsedNext)) { setLiveValue(null); onCommit(raw); return; }
    const bounded = Math.min(max, Math.max(min, parsedNext));
    setLiveValue(bounded);
    onCommit(format(bounded));
  };

  useEffect(() => {
    liveValueRef.current = liveValue;
  }, [liveValue]);

  useEffect(() => {
    liveValueRef.current = null;
    setLiveValue(null);
  }, [resetSignal]);

  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  useEffect(() => () => {
    if (liveValueRef.current != null) onCancelRef.current?.();
  }, []);

  const cancelLiveValue = () => {
    liveValueRef.current = null;
    setLiveValue(null);
    onCancel?.();
  };

  useEffect(() => {
    if (liveValue == null) return;
    if (Math.abs(resolvedValue - liveValue) <= step / 2) setLiveValue(null);
  }, [liveValue, resolvedValue, step]);

  return (
    <span data-inspector-slider style={{ display: "flex", flexWrap: density === "compact" ? "nowrap" : "wrap", minWidth: 0, flex: "1 1 0%", alignItems: "center", gap: density === "compact" ? 4 : compact ? 6 : 8, width: "100%" }}>
      <span style={{ flex: "1 1 48px", minWidth: 24 }}>
      <Slider
        value={sliderValue}
        min={sliderMin}
        max={sliderMax}
        step={step}
        disabled={disabled}
        label={`${label} value`}
        largeTarget={largeTarget}
        density={density}
        onValueChange={(next) => {
          setLiveValue(next);
          onChange(format(next));
        }}
        onValueCommit={(next) => {
          setLiveValue(next);
          onCommit(format(next));
        }}
        onInteractionCancel={cancelLiveValue}
      />
      </span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: density === "compact" ? 4 : 6, flexShrink: 1, minWidth: 0, maxWidth: "100%" }}>
      <ScrubNumberInput
        ariaLabel={`${label} numeric value`}
        value={liveValue == null ? value : format(liveValue)}
        min={min}
        max={max}
        step={step}
        width={label === "volume" ? 72 : 112}
        density={density}
        precision={displayPrecision}
        keyboardStep={step}
        disabled={disabled}
        onChange={(next) => {
          const parsedNext = Number.parseFloat(next);
          if (Number.isFinite(parsedNext)) setLiveValue(parsedNext);
          onChange(next);
        }}
        onCommit={commitNumber}
        onCancel={cancelLiveValue}
        resetSignal={resetSignal}
      />
      <span style={{ fontSize: density === "compact" ? "var(--ui-text-small)" : "var(--ui-text-body)", color: "var(--ink-secondary, var(--ink-muted))", textAlign: "left", minWidth: "2ch", flexShrink: 0 }}>{unit}</span>
      </span>
    </span>
  );
}
