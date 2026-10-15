"use client";

import { InspectorHeading, InspectorDisclosure, inspectorQuietButtonClassName } from "./InspectorHierarchy";
import { HandwritingWeightControl } from "./HandwritingWeightControl";
import { useEffect, useState } from "react";
import { fractionToPercent, percentToFraction } from "./inspector-display-values";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  captionFontFamily,
  captionStyleCSS,
  BLUE_STEEL_CAPTION_LOOK,
  CAPTION_FONT_PRESET_LABELS,
  CAPTION_POSITION_PRESETS,
  CAPTION_STYLE_VARIANTS,
  CAPTION_STYLE_VARIANT_LABELS,
  captionPresetBaseXY,
  CAMERA_REVEAL_EASING_CURVES,
  CAMERA_REVEAL_MOTION_KEYFRAMES,
  CAMERA_REVEAL_MOTION_CURVES,
  CAPTION_ABS_POSITION_MAX,
  CAPTION_ABS_POSITION_MIN,
  clampCaptionAbsPosition,
  resolveCaptionProps,
  type CameraRevealEasing,
  type CaptionFontPreset,
  type CaptionPositionPreset,
  type CaptionStyleVariant,
  type MotionCurveKeyframes,
} from "@/lib/timeline/captions";
import { SHARED_FONTS_BY_CATEGORY } from "@/lib/fonts/registry";
import { linkGoogleFontsStylesheet } from "@/lib/remotion/google-fonts";
import { validateWordTimings } from "@/lib/timeline/active-word-captions";
import { ScrubNumberInput } from "./ElementMenu";
import { InspectorVisualChoice } from "./InspectorVisualChoice";
import { InspectorPanelTabs } from "./InspectorPanelTabs";
import { CaptionStylePreview } from "./CaptionStylePreview";
import { MotionCurveEditor } from "./MotionCurveEditor";
import type { TimelineElement } from "./types";

export type CaptionInspectorSubpanel = "text" | "position" | "motion" | "timing";
export const CAPTION_INSPECTOR_TABS: {id: CaptionInspectorSubpanel; label: string; description: string}[] = [
  {id: "text", label: "Words", description: "Words, font, paragraph alignment, and fill"},
  {id: "position", label: "Layout", description: "Frame position, text box width, and surface geometry"},
  {id: "motion", label: "Animation", description: "Native entrance, exit, and reveal"},
  {id: "timing", label: "Timing", description: "Clip timing and synchronized words"},
];

/* ── Caption Menu ── */

const selectTriggerStyle = {
  background: "var(--chrome-raised)",
  borderColor: "var(--chrome-line)",
  color: "var(--ink)",
  paddingInline: 12,
} as const;
const selectItemClassName =
  "cursor-pointer rounded text-left text-[0.92rem] text-[var(--ink)] data-[highlighted]:bg-white/10 data-[highlighted]:text-white data-[state=checked]:bg-white/15 data-[state=checked]:font-semibold data-[state=checked]:text-white focus:bg-white/10 focus:text-white";
const selectItemStyle = { paddingLeft: 16, paddingRight: 36, paddingTop: 10, paddingBottom: 10 } as const;
const selectLabelClassName =
  "px-3 py-1.5 text-[12px] font-semibold text-[var(--ink-secondary)]";
const selectContentClassName =
  "editor-chrome min-w-[220px] rounded-lg border border-[var(--chrome-line-strong)] bg-[var(--chrome-panel)] p-1.5 text-[var(--ink)] shadow-[0_20px_55px_rgba(0,0,0,0.72)] ring-1 ring-black/60";
const CAMERA_REVEAL_EASING_LABELS: Record<CameraRevealEasing, string> = {
  ease_in_out: "Smooth in and out",
  ease_out: "Fast start, soft landing",
  linear: "Linear",
  slow_middle: "Slow in the middle",
  custom: "Custom",
};

/**
 * One field = one label + one control, on a shared baseline.
 *
 * The inspector previously set every label inline with an ad-hoc width, so nothing lined up
 * and the controls stair-stepped across the panel. A field is a unit; make it one.
 */
function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <span className={FIELD_LABEL}>{label}</span>
      <div className="flex min-w-0 items-center gap-2">{children}</div>
    </div>
  );
}

function SurfaceNumberField({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  onCommit: (value: number) => void;
}) {
  return (
    <Field label={label}>
      <input
        key={value}
        type="number"
        defaultValue={Number(value.toFixed(step < 1 ? 2 : 0))}
        min={min}
        max={max}
        step={step}
        onBlur={(event) => {
          const parsed = Number.parseFloat(event.currentTarget.value);
          if (Number.isFinite(parsed)) onCommit(Math.max(min, Math.min(max, parsed)));
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        className="h-9 min-w-0 w-full rounded-md border border-[var(--chrome-line)] bg-[var(--chrome-raised)] px-2.5 font-mono text-[0.82rem] tabular-nums text-[var(--ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--chrome-focus-ring)]"
      />
      <span className="shrink-0 text-[0.76rem] text-[var(--ink-muted)]">{unit}</span>
    </Field>
  );
}

/** Legible on every step of the chrome ramp (4.5:1 against --chrome-raised). */
// Same label treatment as InspectorPropertyControl: readable sentence case, primary ink.
const FIELD_LABEL = "text-[13px] font-medium text-[var(--ink)]";

const CAPTION_FONT_GROUPS: Array<{
  label: string;
  presets: CaptionFontPreset[];
}> = SHARED_FONTS_BY_CATEGORY.map((group) => ({
  label: group.category,
  presets: group.fonts.map((font) => font.id as CaptionFontPreset),
})).filter((group) => group.presets.length > 0);

function CaptionFontOption({ value }: { value: CaptionFontPreset }) {
  return (
    <span style={{ fontFamily: captionFontFamily(value) }}>
      {CAPTION_FONT_PRESET_LABELS[value]}
    </span>
  );
}

function CaptionAxisControl({
  axis,
  label,
  value,
  onChange,
  onCommit,
}: {
  axis: "x" | "y";
  label: string;
  value: string;
  onChange: (value: string) => void;
  onCommit: (value?: string) => void;
}) {
  const parsed = Number.parseFloat(value);
  const numericValue = Number.isFinite(parsed) ? clampCaptionAbsPosition(parsed) : 0;
  const format = (next: number) => String(next);

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 [&>span:first-child]:col-span-2">
      <span className="text-[0.82rem] font-medium text-[var(--ink)]">{label}</span>
      <Slider
        value={fractionToPercent(numericValue)}
        min={fractionToPercent(CAPTION_ABS_POSITION_MIN)}
        max={fractionToPercent(CAPTION_ABS_POSITION_MAX)}
        step={0.01}
        label={`caption ${axis} position`}
        onValueChange={(next) => onChange(format(percentToFraction(next)))}
        onValueCommit={(next) => {
          const formatted = format(percentToFraction(next));
          onChange(formatted);
          onCommit(formatted);
        }}
      />
      <span className="tabular">
        <ScrubNumberInput
          ariaLabel={`${label} numeric value`}
          value={fractionToPercent(numericValue).toFixed(2)}
          min={fractionToPercent(CAPTION_ABS_POSITION_MIN)}
          max={fractionToPercent(CAPTION_ABS_POSITION_MAX)}
          step={0.01}
          keyboardStep={0.01}
          width={112}
          control="stepper"
          onChange={(next) => onChange(format(percentToFraction(Number(next))))}
          onCommit={(next) => onCommit(next == null ? undefined : format(percentToFraction(Number(next))))}
        />
      </span>
    </div>
  );
}

function CaptionWidthControl({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const percent = Math.round(Math.min(1, Math.max(0.2, value)) * 100);
  const commitPercent = (next: number) => onChange(Math.min(1, Math.max(0.2, next / 100)));

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 [&>span:first-child]:col-span-2">
      <span className="text-[0.82rem] font-medium text-[var(--ink)]">Text box width</span>
      <Slider
        value={percent}
        min={20}
        max={100}
        step={1}
        label="caption text box width"
        onValueChange={commitPercent}
        onValueCommit={commitPercent}
      />
      <span className="flex items-center gap-2 tabular">
        <ScrubNumberInput
          ariaLabel="Caption text box width numeric value"
          value={String(percent)}
          min={20}
          max={100}
          step={1}
          width={112}
          onChange={(next) => {
            const parsed = Number.parseFloat(next);
            if (Number.isFinite(parsed)) commitPercent(parsed);
          }}
          onCommit={(next) => {
            const parsed = Number.parseFloat(next ?? "");
            if (Number.isFinite(parsed)) commitPercent(parsed);
          }}
        />
        <span className="text-[0.78rem] text-[var(--ink-secondary)]">%</span>
      </span>
    </div>
  );
}

function CaptionFontSizeControl({
  value,
  vertical,
  onChange,
  onCommit,
}: {
  value: string;
  vertical: boolean;
  onChange: (value: string) => void;
  onCommit: (value?: string) => void;
}) {
  const parsed = Number.parseFloat(value);
  const size = Math.round(Number.isFinite(parsed) ? Math.min(300, Math.max(18, parsed)) : 42);
  const format = (next: number) => String(Math.round(next));

  return (
    <Field label="Size" className={vertical ? "" : "min-w-[260px]"}>
      <Slider
        value={size}
        min={18}
        max={300}
        step={1}
        label="caption font size"
        onValueChange={(next) => onChange(format(next))}
        onValueCommit={(next) => {
          const formatted = format(next);
          onChange(formatted);
          onCommit(formatted);
        }}
      />
      <ScrubNumberInput
        ariaLabel="Caption font size numeric value"
        value={value}
        min={18}
        max={300}
        step={1}
        width={96}
        control="stepper"
        onChange={onChange}
        onCommit={onCommit}
      />
      <span className="shrink-0 text-[0.78rem] text-[var(--ink-muted)]">px</span>
    </Field>
  );
}

function CaptionAlignmentControl({
  value,
  onChange,
}: {
  value: "left" | "center" | "right";
  onChange: (value: "left" | "center" | "right") => void;
}) {
  const alignments = ["left", "center", "right"] as const;

  return (
    // Label above the control, like Size and every other field in this panel.
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className={FIELD_LABEL}>Alignment</span>
      <div className="grid gap-2">
        <div
          role="group"
          aria-label="Text alignment"
          className="grid grid-cols-3 overflow-hidden rounded-md border border-[var(--chrome-line)] bg-[var(--chrome-deep)]"
        >
          {alignments.map((alignment) => {
            const selected = value === alignment;
            return (
              <Button
                key={alignment}
                type="button"
                variant="ghost"
                size="lg"
                aria-pressed={selected}
                onClick={() => onChange(alignment)}
                className="h-10 rounded-none px-3 text-[0.875rem] font-semibold capitalize text-[var(--ink-secondary)] hover:bg-white/10 hover:text-[var(--ink)]"
                style={{
                  background: selected ? "var(--chrome-raised)" : undefined,
                  color: selected ? "var(--ink)" : undefined,
                  boxShadow: selected ? "inset 0 0 0 1px var(--chrome-selected-ring)" : undefined,
                }}
              >
                {alignment}
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export type CaptionMenuProps = {
  surfaceTracking?: React.ReactNode;
  layout?: "horizontal" | "vertical";
  showInspectorTabs?: boolean;
  inspectorSubpanel?: CaptionInspectorSubpanel;
  onInspectorSubpanelChange?: (subpanel: CaptionInspectorSubpanel) => void;
  selectedElement: TimelineElement;
  selectedElementCount: number;
  editCaptionText: string;
  setEditCaptionText: (value: string) => void;
  editCaptionFontPreset: CaptionFontPreset;
  setEditCaptionFontPreset: (value: CaptionFontPreset) => void;
  editCaptionStyleVariant: CaptionStyleVariant;
  setEditCaptionStyleVariant: (value: CaptionStyleVariant) => void;
  editCaptionFontSize: string;
  setEditCaptionFontSize: (value: string) => void;
  editCaptionAbsX: string;
  setEditCaptionAbsX: (value: string) => void;
  editCaptionAbsY: string;
  setEditCaptionAbsY: (value: string) => void;
  setEditCaptionPosition: (value: CaptionPositionPreset) => void;
  patchSelectedCaptionProps: (patch: Record<string, unknown>) => void;
  previewSelectedCaptionProps: (patch: Record<string, unknown> | null) => void;
  commitCaptionText: () => void;
  commitCaptionFontSize: (nextValue?: string) => void;
  applyCaptionAbsPosition: (nextAbsX: number, nextAbsY: number) => void;
  commitCaptionAbsPos: (axis: "x" | "y", nextValue?: string) => void;
  commitCaptionPositionPreset: (preset: CaptionPositionPreset) => void;
  applySelectedCaptionStyleToLane: () => Promise<void>;
};

export function CaptionMenu({
  surfaceTracking,
  layout = "horizontal",
  showInspectorTabs = true,
  inspectorSubpanel,
  onInspectorSubpanelChange,
  selectedElement,
  selectedElementCount,
  editCaptionText,
  setEditCaptionText,
  editCaptionFontPreset,
  setEditCaptionFontPreset,
  editCaptionStyleVariant,
  setEditCaptionStyleVariant,
  editCaptionFontSize,
  setEditCaptionFontSize,
  editCaptionAbsX,
  setEditCaptionAbsX,
  editCaptionAbsY,
  setEditCaptionAbsY,
  setEditCaptionPosition,
  patchSelectedCaptionProps,
  previewSelectedCaptionProps,
  commitCaptionText,
  commitCaptionFontSize,
  commitCaptionAbsPos,
  commitCaptionPositionPreset,
  applySelectedCaptionStyleToLane,
}: CaptionMenuProps) {
  const isVertical = layout === "vertical";
  const [perspectiveOpen, setPerspectiveOpen] = useState(false);
  useEffect(linkGoogleFontsStylesheet, []);
  const [localVerticalSubpanel, setLocalVerticalSubpanel] = useState<CaptionInspectorSubpanel>("text");
  const verticalSubpanel = inspectorSubpanel ?? localVerticalSubpanel;
  const setVerticalSubpanel = onInspectorSubpanelChange ?? setLocalVerticalSubpanel;
  const captionProps = resolveCaptionProps(selectedElement.props);
  const tracked = !!selectedElement.props?.surface_track;
  const fallbackBenchmarkPileIndex = typeof selectedElement.props?.benchmark_order === "number"
    && Number.isInteger(selectedElement.props.benchmark_order)
      ? Math.max(0, Math.min(31, selectedElement.props.benchmark_order - 1))
      : 0;
  const benchmarkPileLayout = captionProps.benchmarkStackLayout ?? {
    kind: "upper_canvas_pile" as const,
    index: fallbackBenchmarkPileIndex,
    total: 17,
  };
  const renderedColor = captionStyleCSS(captionProps.styleVariant, captionProps.textColor).color;
  const effectiveTextColor = typeof renderedColor === "string" ? renderedColor : "#ffffff";
  const activeTimingValidation = validateWordTimings(
    captionProps.text,
    selectedElement.duration,
    captionProps.wordTimings,
  );
  const hasValidWordTimings = activeTimingValidation.findings.length === 0;

  const timingControls = (
    <div className={isVertical ? "grid gap-3" : "flex flex-wrap items-end gap-5"}>
      <Field label="Display">
        <Select
          value={captionProps.timingMode}
          onValueChange={(value) => {
            if (
              !value
              || ((value === "active_word" || value === "single_word") && !hasValidWordTimings)
            ) return;
            patchSelectedCaptionProps({ timingMode: value });
          }}
        >
          <SelectTrigger className={`${isVertical ? "w-full" : "w-[190px]"} h-9 rounded-md border text-[0.88rem]`} style={selectTriggerStyle}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent side="top" alignItemWithTrigger={false} className={selectContentClassName}>
            <SelectItem value="phrase" style={selectItemStyle} className={selectItemClassName}>Full phrase</SelectItem>
            <SelectItem value="active_word" disabled={!hasValidWordTimings} style={selectItemStyle} className={selectItemClassName}>Highlight spoken word</SelectItem>
            <SelectItem value="single_word" disabled={!hasValidWordTimings} style={selectItemStyle} className={selectItemClassName}>One word at a time</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Punctuation">
        <input type="checkbox" aria-label="Show punctuation" className="size-4 accent-[var(--accent)]" checked={!captionProps.hidePunctuation}
          onChange={(event) => patchSelectedCaptionProps({ hidePunctuation: !event.target.checked })} />
      </Field>
      {captionProps.timingMode === "single_word" ? (
        <SurfaceNumberField label="Word flip" value={captionProps.singleWordFlipSeconds} min={0} max={0.3} step={0.01} unit="s"
          onCommit={(singleWordFlipSeconds) => patchSelectedCaptionProps({ singleWordFlipSeconds })} />
      ) : null}
      {captionProps.timingMode === "active_word" ? (
        <CaptionTextColorControl
          label="Active word colour"
          value={captionProps.activeWordColor}
          isCustom={captionProps.activeWordColor !== "#ff3b30"}
          onChange={(activeWordColor) => patchSelectedCaptionProps({ activeWordColor })}
          onReset={() => patchSelectedCaptionProps({ activeWordColor: "#ff3b30" })}
        />
      ) : null}
      {!hasValidWordTimings ? (
        <p className={`${isVertical ? "" : "self-center"} text-[0.875rem] leading-5 text-[var(--ink-secondary)]`}>
          Needs word timings
        </p>
      ) : null}
    </div>
  );

  const fontControls = (
    // One row of fields on a shared baseline. Every control is h-9; every label sits above
    // it. Nothing stair-steps.
    <div className={isVertical ? "grid grid-cols-1 items-end gap-2.5" : "flex flex-wrap items-end gap-x-5 gap-y-3"}>
      <Field label="Font">
        <Select
          value={editCaptionFontPreset}
          onValueChange={(value) => {
            if (!value) return;
            setEditCaptionFontPreset(value as CaptionFontPreset);
            patchSelectedCaptionProps({ fontPreset: value });
          }}
        >
          <SelectTrigger className={`${isVertical ? "w-full" : "w-[180px]"} h-9 rounded-md border text-[0.88rem]`} style={selectTriggerStyle}>
            <SelectValue>
              <CaptionFontOption value={editCaptionFontPreset} />
            </SelectValue>
          </SelectTrigger>
          <SelectContent side="top" alignItemWithTrigger={false} className={selectContentClassName}>
            {CAPTION_FONT_GROUPS.map((group, index) => (
              <div key={group.label}>
                {index > 0 ? <SelectSeparator className="my-1 bg-white/8" /> : null}
                <SelectGroup>
                  <SelectLabel className={selectLabelClassName}>{group.label}</SelectLabel>
                  {group.presets.map((value) => (
                    <SelectItem key={value} value={value} style={selectItemStyle} className={selectItemClassName}>
                      <CaptionFontOption value={value} />
                    </SelectItem>
                  ))}
                </SelectGroup>
              </div>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <CaptionFontSizeControl
        value={editCaptionFontSize}
        vertical={isVertical}
        onChange={setEditCaptionFontSize}
        onCommit={commitCaptionFontSize}
      />

          <CaptionAlignmentControl
            value={captionProps.textAlign}
            onChange={(textAlign) => patchSelectedCaptionProps({ textAlign })}
          />

      {captionProps.styleVariant === "inverse" ? (
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className={inspectorQuietButtonClassName} onClick={() => patchSelectedCaptionProps({ ...BLUE_STEEL_CAPTION_LOOK })}>
            Blue steel captions
          </Button>
        </div>
      ) : null}

      {captionProps.styleVariant === "benchmark_card" ? (
        <>
          <SurfaceNumberField
            label="Card angle"
            value={captionProps.benchmarkRotationDeg}
            min={-8}
            max={8}
            step={0.5}
            unit="°"
            onCommit={(benchmarkRotationDeg) => patchSelectedCaptionProps({ benchmarkRotationDeg })}
          />
          <SurfaceNumberField
            label="Pile card"
            value={benchmarkPileLayout.index + 1}
            min={1}
            max={benchmarkPileLayout.total}
            unit=" of"
            onCommit={(value) => patchSelectedCaptionProps({
              benchmarkStackLayout: {
                ...benchmarkPileLayout,
                index: Math.max(0, Math.min(benchmarkPileLayout.total - 1, Math.round(value) - 1)),
              },
            })}
          />
          <SurfaceNumberField
            label="Pile count"
            value={benchmarkPileLayout.total}
            min={2}
            max={32}
            unit=""
            onCommit={(value) => {
              const total = Math.max(2, Math.min(32, Math.round(value)));
              patchSelectedCaptionProps({
                benchmarkStackLayout: {
                  ...benchmarkPileLayout,
                  total,
                  index: Math.min(benchmarkPileLayout.index, total - 1),
                },
              });
            }}
          />
        </>
      ) : null}

      {captionProps.styleVariant === "camera_reveal" ? (
        <>
          <SurfaceNumberField
            label="Weight"
            value={captionProps.cameraRevealFontWeight}
            min={100}
            max={900}
            step={100}
            unit=""
            onCommit={(cameraRevealFontWeight) => patchSelectedCaptionProps({ cameraRevealFontWeight })}
          />
          <Field label="3D sizing">
            <Select
              value={captionProps.cameraRevealTypographySizing}
              onValueChange={(value) => {
                if (!value) return;
                patchSelectedCaptionProps({
                  cameraRevealTypographySizing:
                    value as typeof captionProps.cameraRevealTypographySizing,
                });
              }}
            >
              <SelectTrigger
                className={`${isVertical ? "w-full" : "w-[180px]"} h-9 rounded-md border text-[0.88rem]`}
                style={selectTriggerStyle}
              >
                <SelectValue>
                  {captionProps.cameraRevealTypographySizing === "font_size"
                    ? "Match font size"
                    : "Fit frame"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent
                side="top"
                alignItemWithTrigger={false}
                className={selectContentClassName}
              >
                <SelectItem value="fit" style={selectItemStyle} className={selectItemClassName}>
                  Fit frame
                </SelectItem>
                <SelectItem value="font_size" style={selectItemStyle} className={selectItemClassName}>
                  Match font size
                </SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </>
      ) : null}

      {!tracked && <Field label="Text treatment">
        <InspectorVisualChoice label="Text treatment" value={editCaptionStyleVariant}
          options={CAPTION_STYLE_VARIANTS.filter(value =>
            !["benchmark_card", "image_fill", "camera_reveal"].includes(value) || value === editCaptionStyleVariant
          ).map(value => ({ value, label: CAPTION_STYLE_VARIANT_LABELS[value],
            // The renderer's own caption CSS, scaled, in the clip's font, so treatments read as they will play.
            preview: <span className="relative block h-12 overflow-hidden rounded bg-[var(--viewing-surround)] [&_span]:whitespace-nowrap">
              <CaptionStylePreview text="Aa" styleVariant={value} fontPreset={editCaptionFontPreset} fontPx={24} />
            </span>,
          }))}
          onChange={value => {
            setEditCaptionStyleVariant(value);
            patchSelectedCaptionProps({ styleVariant: value });
          }} />
      </Field>}

      {captionProps.styleVariant !== "image_fill" && captionProps.styleVariant !== "camera_reveal" ? (
        <CaptionTextColorControl
          value={effectiveTextColor}
          isCustom={captionProps.textColor != null}
          onChange={(textColor) => patchSelectedCaptionProps({ textColor })}
          onReset={() => patchSelectedCaptionProps({ textColor: null })}
        />
      ) : null}

      {/* An action, not a setting — so it is a labelled button, not a bare pencil glyph.
          The old icon-only control gave no clue what it did or what it would affect. */}
      <Button
        variant="ghost"
        size="lg"
        onClick={() => void applySelectedCaptionStyleToLane()}
        className={`${isVertical ? "col-span-full w-full " : ""}bg-[var(--chrome-raised)] text-[var(--ink-secondary)] hover:bg-[var(--chrome-selected-bg)] hover:text-[var(--ink)]`}
      >
        Apply this style to the whole lane
      </Button>
    </div>
  );

  const imageFillControls = captionProps.styleVariant === "image_fill" || captionProps.styleVariant === "camera_reveal" ? (
    <div className="mt-4 grid gap-3 py-1">
      <div>
        <span className={FIELD_LABEL}>Media inside text</span>
        {!captionProps.mediaFillVideoUrl && !captionProps.mediaFillUrls.length ? (
          <p className="mt-1 text-[0.8rem] leading-5 text-[var(--ink-secondary)]">No media selected</p>
        ) : null}
      </div>
      {captionProps.mediaFillVideoUrl ? (
        <div className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-3 rounded-md bg-[var(--chrome-panel)] p-2">
          <video src={captionProps.mediaFillVideoUrl} muted playsInline preload="metadata" className="h-20 w-24 rounded object-contain" aria-label="Text mask video preview" />
          <div className="min-w-0">
            <span className="text-xs text-[var(--ink-muted)]">Video</span>
            <p className="break-words text-sm text-[var(--ink)]">{decodeURIComponent(captionProps.mediaFillVideoUrl.split("/").pop() ?? "Video")}</p>
            <p className="mt-1 text-xs text-[var(--ink-secondary)]">Sound off</p>
          </div>
        </div>
      ) : null}
      {captionProps.mediaFillVideoUrl ? <SurfaceNumberField
        label="Fill speed"
        value={captionProps.mediaFillVideoPlaybackRate}
        min={0.1}
        max={4}
        step={0.01}
        unit="×"
        onCommit={(mediaFillVideoPlaybackRate) => patchSelectedCaptionProps({ mediaFillVideoPlaybackRate })}
      /> : null}
      {!captionProps.mediaFillVideoUrl && captionProps.mediaFillUrls.length > 0 ? <>
      <div
        className="grid max-h-[260px] gap-1.5 overflow-y-auto"
        aria-label="Fill image playback order"
      >
        {captionProps.mediaFillUrls.map((url, index) => {
          const filename = url.split("/").pop()?.replace(/\.[^.]+$/, "") ?? `Image ${index + 1}`;
          const moveImage = (offset: number) => {
            const nextIndex = index + offset;
            if (nextIndex < 0 || nextIndex >= captionProps.mediaFillUrls.length) return;
            const mediaFillUrls = [...captionProps.mediaFillUrls];
            [mediaFillUrls[index], mediaFillUrls[nextIndex]] = [mediaFillUrls[nextIndex]!, mediaFillUrls[index]!];
            patchSelectedCaptionProps({ mediaFillUrls });
          };
          return (
            <div
              key={`${url}:${index}`}
              className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-transparent bg-[var(--chrome-raised)] p-1.5"
            >
              {/* Project media is already served through the editor's same-origin media route. */}
              <img src={url} alt="" className="h-11 w-11 rounded object-cover" />
              <div className="min-w-0">
                <div className="text-[12px] font-medium text-[var(--ink-secondary)]">
                  Image {String(index + 1).padStart(2, "0")}
                </div>
                <div className="truncate text-[13px] text-[var(--ink)]" title={filename}>
                  {filename}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={index === 0}
                  aria-label={`Move image ${index + 1} earlier`}
                  onClick={() => moveImage(-1)}
                  className={`h-8 w-8 p-0 ${inspectorQuietButtonClassName}`}
                >
                  ↑
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={index === captionProps.mediaFillUrls.length - 1}
                  aria-label={`Move image ${index + 1} later`}
                  onClick={() => moveImage(1)}
                  className={`h-8 w-8 p-0 ${inspectorQuietButtonClassName}`}
                >
                  ↓
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove image ${index + 1}`}
                  onClick={() => patchSelectedCaptionProps({
                    mediaFillUrls: captionProps.mediaFillUrls.filter((_, imageIndex) => imageIndex !== index),
                  })}
                  className={`h-8 w-8 p-0 ${inspectorQuietButtonClassName}`}
                >
                  ×
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      <details className="rounded-md">
        <summary className="cursor-pointer px-3 py-2 text-[0.78rem] font-semibold text-[var(--ink-secondary)]">
          Advanced source details
        </summary>
        <div className="px-1 pb-2">
          <textarea
            key={`${selectedElement.id}:${captionProps.mediaFillUrls.join("|")}`}
            defaultValue={captionProps.mediaFillUrls.join("\n")}
            onBlur={(event) => {
              const mediaFillUrls = event.currentTarget.value
                .split(/[\n,]+/)
                .map((value) => value.trim())
                .filter(Boolean);
              patchSelectedCaptionProps({ mediaFillUrls });
            }}
            placeholder="/api/projects/project-id/media/stills/page-01.png"
            aria-label="Image fill media URLs"
            className="min-h-[84px] w-full resize-y rounded-md border border-[var(--chrome-line)] bg-[var(--chrome-raised)] px-3 py-2 font-mono text-[0.78rem] leading-5 text-[var(--ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--chrome-focus-ring)]"
          />
        </div>
      </details>
      <details className="rounded-md">
        <summary className="cursor-pointer px-3 py-2 text-[0.78rem] font-semibold text-[var(--ink-secondary)]">
          Sync image changes to audio
          {captionProps.mediaFillChangeTimesSeconds.length > 0
            ? ` · ${captionProps.mediaFillChangeTimesSeconds.length} timed changes`
            : ""}
        </summary>
        <div className="space-y-2 px-1 pb-2">
          <textarea
            key={`${selectedElement.id}:${captionProps.mediaFillChangeTimesSeconds.join("|")}`}
            defaultValue={captionProps.mediaFillChangeTimesSeconds
              .map((seconds) => Number(seconds.toFixed(3)))
              .join("\n")}
            onBlur={(event) => {
              const mediaFillChangeTimesSeconds = event.currentTarget.value
                .split(/[\s,]+/)
                .map((value) => Number(value))
                .filter((value) => Number.isFinite(value) && value >= 0);
              patchSelectedCaptionProps({ mediaFillChangeTimesSeconds });
            }}
            placeholder={"0\n0.867\n1.067"}
            aria-label="Image change times (seconds)"
            className="min-h-[96px] w-full resize-y rounded-md border border-[var(--chrome-line)] bg-[var(--chrome-raised)] px-3 py-2 font-mono text-[0.78rem] leading-5 text-[var(--ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--chrome-focus-ring)]"
          />
        </div>
      </details>
      <div className={isVertical ? "grid grid-cols-1 gap-3" : "flex flex-wrap items-end gap-4"}>
        <SurfaceNumberField
          label="Image hold"
          value={captionProps.mediaFillSecondsPerImage}
          min={0.15}
          max={10}
          step={0.05}
          unit="sec"
          onCommit={(mediaFillSecondsPerImage) => patchSelectedCaptionProps({ mediaFillSecondsPerImage })}
        />
        {captionProps.styleVariant === "camera_reveal" ? (
          <Field label="Image framing">
            <Select
              value={captionProps.cameraRevealMediaFit}
              onValueChange={(cameraRevealMediaFit) => patchSelectedCaptionProps({
                cameraRevealMediaFit: cameraRevealMediaFit as typeof captionProps.cameraRevealMediaFit,
              })}
            >
              <SelectTrigger className="h-9 w-full rounded-md border text-[0.88rem]" style={selectTriggerStyle}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent side="top" alignItemWithTrigger={false} className={selectContentClassName}>
                <SelectItem value="camera" className={selectItemClassName} style={selectItemStyle}>Follow camera</SelectItem>
                <SelectItem value="wordmark" className={selectItemClassName} style={selectItemStyle}>Fill wordmark</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        ) : null}
        <Field label="Page change">
          <Select
            value={captionProps.mediaFillTransition}
            onValueChange={(mediaFillTransition) => patchSelectedCaptionProps({
              mediaFillTransition: mediaFillTransition as typeof captionProps.mediaFillTransition,
            })}
          >
            <SelectTrigger className="h-9 w-full rounded-md border text-[0.88rem]" style={selectTriggerStyle}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent side="top" alignItemWithTrigger={false} className={selectContentClassName}>
              <SelectItem value="cut" className={selectItemClassName} style={selectItemStyle}>Hard cut</SelectItem>
              <SelectItem value="dissolve" className={selectItemClassName} style={selectItemStyle}>Dissolve</SelectItem>
              <SelectItem value="slide" className={selectItemClassName} style={selectItemStyle}>Slide</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <SurfaceNumberField
          label="Transition time"
          value={captionProps.mediaFillCrossfadeSeconds}
          min={0}
          max={1}
          step={0.05}
          unit="sec"
          onCommit={(mediaFillCrossfadeSeconds) => patchSelectedCaptionProps({ mediaFillCrossfadeSeconds })}
        />
        {captionProps.mediaFillChangeTimesSeconds.length > 1 ? (
          <Field label="First change">
            <Select
              items={[
                { label: "Match page change", value: "inherit" },
                { label: "Clean cut", value: "cut" },
              ]}
              value={captionProps.mediaFillFirstTransition}
              onValueChange={(mediaFillFirstTransition) => patchSelectedCaptionProps({
                mediaFillFirstTransition: mediaFillFirstTransition as typeof captionProps.mediaFillFirstTransition,
              })}
            >
              <SelectTrigger className="h-9 w-full rounded-md border text-[0.88rem]" style={selectTriggerStyle}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent side="top" alignItemWithTrigger={false} className={selectContentClassName}>
                <SelectGroup>
                  <SelectItem value="inherit" className={selectItemClassName} style={selectItemStyle}>
                    Match page change
                  </SelectItem>
                  <SelectItem value="cut" className={selectItemClassName} style={selectItemStyle}>
                    Clean cut
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        ) : null}
        {captionProps.mediaFillTransition === "slide" ? (
          <>
            <Field label="Slide direction">
              <Select
                value={captionProps.mediaFillSlideDirection}
                onValueChange={(mediaFillSlideDirection) => patchSelectedCaptionProps({
                  mediaFillSlideDirection: mediaFillSlideDirection as typeof captionProps.mediaFillSlideDirection,
                })}
              >
                <SelectTrigger className="h-9 w-full rounded-md border text-[0.88rem]" style={selectTriggerStyle}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent side="top" alignItemWithTrigger={false} className={selectContentClassName}>
                  <SelectItem value="left" className={selectItemClassName} style={selectItemStyle}>Move left</SelectItem>
                  <SelectItem value="right" className={selectItemClassName} style={selectItemStyle}>Move right</SelectItem>
                  <SelectItem value="up" className={selectItemClassName} style={selectItemStyle}>Move up</SelectItem>
                  <SelectItem value="down" className={selectItemClassName} style={selectItemStyle}>Move down</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <SurfaceNumberField
              label="Motion blur"
              value={captionProps.mediaFillTransitionBlur * 100}
              min={0}
              max={100}
              step={5}
              unit="%"
              onCommit={(mediaFillTransitionBlur) => patchSelectedCaptionProps({
                mediaFillTransitionBlur: mediaFillTransitionBlur / 100,
              })}
            />
          </>
        ) : null}
        <SurfaceNumberField
          label="Fill zoom"
          value={captionProps.mediaFillScale}
          min={1}
          max={4}
          step={0.05}
          unit="×"
          onCommit={(mediaFillScale) => patchSelectedCaptionProps({ mediaFillScale })}
        />
        <SurfaceNumberField
          label="Image drift"
          value={captionProps.mediaFillPanPercent}
          min={-50}
          max={50}
          step={1}
          unit="%"
          onCommit={(mediaFillPanPercent) => patchSelectedCaptionProps({ mediaFillPanPercent })}
        />
      </div>
      </> : null}
    </div>
  ) : null;

  const inverseMaskControls = captionProps.styleVariant === "inverse" ? (
    <div className="mt-4 flex flex-col gap-3 py-1">
      <div>
        <span className={FIELD_LABEL}>Inverse mask motion</span>
      </div>
      <Field label="Mask motion">
        <Select
          value={captionProps.inverseMaskMotion}
          onValueChange={(inverseMaskMotion) => {
            if (!inverseMaskMotion) return;
            patchSelectedCaptionProps({
              inverseMaskMotion:
                inverseMaskMotion as typeof captionProps.inverseMaskMotion,
            });
          }}
        >
          <SelectTrigger className="h-9 w-full rounded-md border text-[0.88rem]" style={selectTriggerStyle}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent side="top" alignItemWithTrigger={false} className={selectContentClassName}>
            <SelectGroup>
              <SelectItem value="none" style={selectItemStyle} className={selectItemClassName}>Still</SelectItem>
              <SelectItem value="drift" style={selectItemStyle} className={selectItemClassName}>Slow drift</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      {captionProps.inverseMaskMotion === "drift" ? (
        <div className="grid grid-cols-1 gap-3">
          <SurfaceNumberField
            label="Horizontal"
            value={captionProps.inverseMaskDriftXPercent}
            min={-12}
            max={12}
            step={0.25}
            unit="%"
            onCommit={(inverseMaskDriftXPercent) => patchSelectedCaptionProps({ inverseMaskDriftXPercent })}
          />
          <SurfaceNumberField
            label="Vertical"
            value={captionProps.inverseMaskDriftYPercent}
            min={-12}
            max={12}
            step={0.25}
            unit="%"
            onCommit={(inverseMaskDriftYPercent) => patchSelectedCaptionProps({ inverseMaskDriftYPercent })}
          />
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-3">
        <SurfaceNumberField
          label="Light sweep"
          value={captionProps.inverseMaskSweepIntensity * 100}
          min={0}
          max={100}
          step={1}
          unit="%"
          onCommit={(value) => patchSelectedCaptionProps({ inverseMaskSweepIntensity: value / 100 })}
        />
        <SurfaceNumberField
          label="Sweep passes"
          value={captionProps.inverseMaskSweepCycles}
          min={0.25}
          max={4}
          step={0.25}
          unit="×"
          onCommit={(inverseMaskSweepCycles) => patchSelectedCaptionProps({ inverseMaskSweepCycles })}
        />
      </div>
    </div>
  ) : null;

  const cameraRevealControls = captionProps.styleVariant === "camera_reveal" ? (
    <div className="grid gap-4">
      <div className="py-1">
        <strong className="text-[0.9rem] text-[var(--ink)]">Perspective camera</strong>
      </div>
      <div className="grid grid-cols-1 gap-3">
        <SurfaceNumberField label="Start time" value={captionProps.cameraRevealStartSeconds} min={0} max={30} step={0.05} unit="sec" onCommit={(cameraRevealStartSeconds) => patchSelectedCaptionProps({ cameraRevealStartSeconds })} />
        <SurfaceNumberField label="Opening hold" value={captionProps.cameraRevealHoldSeconds} min={0} max={5} step={0.05} unit="sec" onCommit={(cameraRevealHoldSeconds) => patchSelectedCaptionProps({ cameraRevealHoldSeconds })} />
        <SurfaceNumberField label="Pullback" value={captionProps.cameraRevealDurationSeconds} min={0.1} max={10} step={0.05} unit="sec" onCommit={(cameraRevealDurationSeconds) => patchSelectedCaptionProps({ cameraRevealDurationSeconds })} />
        <SurfaceNumberField label="Start distance" value={captionProps.cameraRevealStartDistance} min={0.01} max={6} step={0.01} unit="z" onCommit={(cameraRevealStartDistance) => patchSelectedCaptionProps({ cameraRevealStartDistance })} />
        <SurfaceNumberField label="End distance" value={captionProps.cameraRevealEndDistance} min={2} max={14} step={0.05} unit="z" onCommit={(cameraRevealEndDistance) => patchSelectedCaptionProps({ cameraRevealEndDistance })} />
        <SurfaceNumberField label="Start target X" value={captionProps.cameraRevealTargetX} min={-2.5} max={2.5} step={0.01} unit="x" onCommit={(cameraRevealTargetX) => patchSelectedCaptionProps({ cameraRevealTargetX })} />
        <SurfaceNumberField label="Start target Y" value={captionProps.cameraRevealTargetY} min={-2.5} max={2.5} step={0.01} unit="y" onCommit={(cameraRevealTargetY) => patchSelectedCaptionProps({ cameraRevealTargetY })} />
        <SurfaceNumberField label="Wall view X" value={captionProps.cameraRevealOrbitX} min={-1.5} max={1.5} step={0.05} unit="x" onCommit={(cameraRevealOrbitX) => patchSelectedCaptionProps({ cameraRevealOrbitX })} />
        <SurfaceNumberField label="Wall view Y" value={captionProps.cameraRevealOrbitY} min={-1.5} max={1.5} step={0.05} unit="y" onCommit={(cameraRevealOrbitY) => patchSelectedCaptionProps({ cameraRevealOrbitY })} />
        <SurfaceNumberField label="Field of view" value={captionProps.cameraRevealFov} min={20} max={90} step={1} unit="°" onCommit={(cameraRevealFov) => patchSelectedCaptionProps({ cameraRevealFov })} />
      </div>
      <div className="grid gap-3 py-1">
        <div>
          <strong className="text-[0.9rem] text-[var(--ink)]">Motion curve</strong>
        </div>
        <Field label="Camera easing">
          <Select
            value={captionProps.cameraRevealEasing}
            onValueChange={(value) => {
              const cameraRevealEasing = value as CameraRevealEasing;
              const cameraRevealMotionCurve = cameraRevealEasing === "custom"
                ? captionProps.cameraRevealMotionCurve
                : CAMERA_REVEAL_MOTION_CURVES[cameraRevealEasing];
              const cameraRevealMotionKeyframes = cameraRevealEasing === "custom"
                ? captionProps.cameraRevealMotionKeyframes
                : CAMERA_REVEAL_MOTION_KEYFRAMES[cameraRevealEasing];
              patchSelectedCaptionProps({
                cameraRevealEasing,
                cameraRevealMotionCurve: cameraRevealMotionCurve.map(([x, y]) => [x, y]),
                cameraRevealMotionKeyframes: cameraRevealMotionKeyframes.map((keyframe) => ({
                  ...keyframe,
                  inHandle: [...keyframe.inHandle],
                  outHandle: [...keyframe.outHandle],
                })),
              });
            }}
          >
            <SelectTrigger className="h-9 w-full rounded-md border text-[0.88rem]" style={selectTriggerStyle}>
              <SelectValue>{CAMERA_REVEAL_EASING_LABELS[captionProps.cameraRevealEasing]}</SelectValue>
            </SelectTrigger>
            <SelectContent side="top" alignItemWithTrigger={false} className={selectContentClassName}>
              <SelectGroup>
                <SelectItem value="slow_middle" style={selectItemStyle} className={selectItemClassName}>Slow in the middle</SelectItem>
                <SelectItem value="ease_in_out" style={selectItemStyle} className={selectItemClassName}>Smooth in and out</SelectItem>
                <SelectItem value="ease_out" style={selectItemStyle} className={selectItemClassName}>Fast start, soft landing</SelectItem>
                <SelectItem value="linear" style={selectItemStyle} className={selectItemClassName}>Linear</SelectItem>
                <SelectItem value="custom" style={selectItemStyle} className={selectItemClassName}>Custom</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <MotionCurveEditor
          value={captionProps.cameraRevealMotionKeyframes}
          onCommit={(cameraRevealMotionKeyframes: MotionCurveKeyframes) => patchSelectedCaptionProps({
            cameraRevealEasing: "custom",
            cameraRevealMotionKeyframes,
          })}
        />
      </div>
      <div className="grid gap-3 py-1">
        <div>
          <strong className="text-[0.88rem] text-[var(--ink)]">Brand card ending</strong>
        </div>
        <Field label="Ending">
          <Select
            value={captionProps.cameraRevealResolveMode}
            onValueChange={(cameraRevealResolveMode) => patchSelectedCaptionProps({
              cameraRevealResolveMode: cameraRevealResolveMode as typeof captionProps.cameraRevealResolveMode,
            })}
          >
            <SelectTrigger className="h-9 w-full rounded-md border text-[0.88rem]" style={selectTriggerStyle}><SelectValue /></SelectTrigger>
            <SelectContent side="top" alignItemWithTrigger={false} className={selectContentClassName}>
              <SelectItem value="none" style={selectItemStyle} className={selectItemClassName}>Keep montage</SelectItem>
              <SelectItem value="brand_card" style={selectItemStyle} className={selectItemClassName}>Resolve to brand card</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        {captionProps.cameraRevealResolveMode === "brand_card" ? (
          <div className="grid grid-cols-1 gap-3">
            <SurfaceNumberField label="Resolve starts" value={captionProps.cameraRevealResolveStartSeconds} min={0} max={30} step={0.05} unit="sec" onCommit={(cameraRevealResolveStartSeconds) => patchSelectedCaptionProps({ cameraRevealResolveStartSeconds })} />
            <SurfaceNumberField label="Resolve length" value={captionProps.cameraRevealResolveDurationSeconds} min={0.05} max={5} step={0.05} unit="sec" onCommit={(cameraRevealResolveDurationSeconds) => patchSelectedCaptionProps({ cameraRevealResolveDurationSeconds })} />
            <Field label="Card colour">
              <input
                type="color"
                value={captionProps.cameraRevealResolveBackgroundColor}
                aria-label="Brand card background colour"
                onChange={(event) => patchSelectedCaptionProps({ cameraRevealResolveBackgroundColor: event.currentTarget.value })}
                className="h-9 w-full cursor-pointer rounded-md border border-[var(--chrome-line)] bg-[var(--chrome-raised)] p-1"
              />
            </Field>
            <Field label="Logo colour">
              <input
                type="color"
                value={captionProps.cameraRevealResolveTextColor}
                aria-label="Brand card wordmark colour"
                onChange={(event) => patchSelectedCaptionProps({ cameraRevealResolveTextColor: event.currentTarget.value })}
                className="h-9 w-full cursor-pointer rounded-md border border-[var(--chrome-line)] bg-[var(--chrome-raised)] p-1"
              />
            </Field>
          </div>
        ) : null}
      </div>
      <div className="grid gap-3 py-1">
        <div>
          <strong className="text-[0.88rem] text-[var(--ink)]">Extrusion walls</strong>
        </div>
        <div className="grid grid-cols-1 gap-3">
          <SurfaceNumberField label="Depth (Z)" value={captionProps.cameraRevealExtrusionDepth} min={0} max={1} step={0.05} unit="" onCommit={(cameraRevealExtrusionDepth) => patchSelectedCaptionProps({ cameraRevealExtrusionDepth })} />
          <SurfaceNumberField label="Bevel" value={captionProps.cameraRevealBevelWidth} min={0} max={1} step={0.05} unit="" onCommit={(cameraRevealBevelWidth) => patchSelectedCaptionProps({ cameraRevealBevelWidth })} />
          <SurfaceNumberField label="Wall light" value={captionProps.cameraRevealEdgeLight} min={0} max={2} step={0.05} unit="×" onCommit={(cameraRevealEdgeLight) => patchSelectedCaptionProps({ cameraRevealEdgeLight })} />
          <SurfaceNumberField label="Mirror" value={captionProps.cameraRevealWallMirror} min={0} max={1} step={0.05} unit="" onCommit={(cameraRevealWallMirror) => patchSelectedCaptionProps({ cameraRevealWallMirror })} />
          <Field label="Wall colour">
            <input
              type="color"
              value={captionProps.cameraRevealEdgeColor}
              aria-label="3D title wall colour"
              onChange={(event) => patchSelectedCaptionProps({ cameraRevealEdgeColor: event.currentTarget.value })}
              className="h-9 w-full cursor-pointer rounded-md border border-[var(--chrome-line)] bg-[var(--chrome-raised)] p-1"
            />
          </Field>
        </div>
      </div>
      <div className="grid gap-3 py-1">
        <div>
          <strong className="text-[0.88rem] text-[var(--ink)]">Camera motion blur</strong>
        </div>
        <div className="grid grid-cols-1 gap-3">
          <SurfaceNumberField label="Shutter angle" value={captionProps.cameraRevealShutterAngle} min={0} max={360} step={10} unit="°" onCommit={(cameraRevealShutterAngle) => patchSelectedCaptionProps({ cameraRevealShutterAngle })} />
          <SurfaceNumberField label="Blur samples" value={captionProps.cameraRevealBlurSamples} min={1} max={10} step={1} unit="" onCommit={(cameraRevealBlurSamples) => patchSelectedCaptionProps({ cameraRevealBlurSamples: Math.round(cameraRevealBlurSamples) })} />
        </div>
      </div>
      <Button
        variant="ghost"
        onClick={() => patchSelectedCaptionProps({
          cameraRevealStartSeconds: 0,
          cameraRevealDurationSeconds: 2.25,
          cameraRevealStartDistance: 0.2,
          cameraRevealEndDistance: 6.5,
          cameraRevealTargetX: -1.55,
          cameraRevealTargetY: 0.52,
          cameraRevealFov: 50,
          cameraRevealEasing: "ease_out",
          cameraRevealBezier: CAMERA_REVEAL_EASING_CURVES.ease_out,
          cameraRevealMotionCurve: CAMERA_REVEAL_MOTION_CURVES.ease_out,
          cameraRevealMotionKeyframes: CAMERA_REVEAL_MOTION_KEYFRAMES.ease_out,
          cameraRevealShutterAngle: 180,
          cameraRevealBlurSamples: 5,
          cameraRevealExtrusionDepth: 0.72,
          cameraRevealBevelWidth: 0.42,
          cameraRevealEdgeLight: 1,
          cameraRevealEdgeColor: "#d9dee7",
          cameraRevealWallMirror: 0.88,
          cameraRevealOrbitX: 0.42,
          cameraRevealOrbitY: -0.18,
          cameraRevealResolveMode: "none",
          cameraRevealResolveStartSeconds: 6.35,
          cameraRevealResolveDurationSeconds: 0.5,
          cameraRevealResolveBackgroundColor: "#ea580c",
          cameraRevealResolveTextColor: "#f6f3ec",
        })}
        className={inspectorQuietButtonClassName}
      >
        Reset 3D reveal
      </Button>
    </div>
  ) : null;

  const positionSection = (
    <section className="flex flex-col gap-2.5" style={{ padding: isVertical ? "12px 16px" : "12px 24px" }}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-[0.9rem] font-semibold text-[var(--ink)]">Position</h3>
        </div>
      </div>
      <div className={`${isVertical ? "grid" : "flex items-center"} gap-3`}>
        {/* Five frame heights by three alignments mirror the supported positions.
            Selection is INK — a filled dot and a lifted surface — never the accent. */}
        <div
          className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-[var(--chrome-line)] bg-[var(--chrome-deep)]"
          style={{ width: 108, height: 140 }}
          role="group"
          aria-label="Caption position"
        >
          {CAPTION_POSITION_PRESETS.filter(preset => !preset.startsWith("reels_")).map((preset) => {
            const captionProps = resolveCaptionProps(selectedElement.props);
            const base = captionPresetBaseXY(preset, captionProps.maxWidth);
            const absX = Number.parseFloat(editCaptionAbsX) || 0;
            const absY = Number.parseFloat(editCaptionAbsY) || 0;
            const active = Math.abs(absX - base.x) <= 0.02 && Math.abs(absY - base.y) <= 0.02;
            return (
              <Button
                key={preset}
                type="button"
                variant="ghost"
                title={preset.replaceAll("_", " ")}
                aria-pressed={active}
                onClick={() => {
                  setEditCaptionPosition(preset);
                  setEditCaptionAbsX(base.x.toFixed(2));
                  setEditCaptionAbsY(base.y.toFixed(2));
                  commitCaptionPositionPreset(preset);
                }}
                className="h-auto min-h-0 w-auto rounded-none p-0 transition-colors focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--chrome-focus-ring)]"
                style={{
                  background: active ? "var(--chrome-raised)" : "var(--chrome-panel)",
                  boxShadow: active ? "inset 0 0 0 1px var(--chrome-selected-ring)" : undefined,
                }}
              >
                <span
                  className="block rounded-full transition-all"
                  style={{
                    width: active ? 6 : 4,
                    height: active ? 6 : 4,
                    background: active ? "var(--ink)" : "var(--ink-muted)",
                    opacity: active ? 1 : 0.5,
                  }}
                />
              </Button>
            );
          })}
        </div>
        {/* X/Y are fractions of the frame, so they read as 0.00–1.00. Tabular figures keep
            the digits from shimmying while you scrub. */}
        <div className="grid min-w-0 flex-1 gap-2.5">
          <CaptionAxisControl axis="x" label="Horizontal (X) %" value={editCaptionAbsX} onChange={setEditCaptionAbsX} onCommit={(value) => commitCaptionAbsPos("x", value)} />
          <CaptionAxisControl axis="y" label="Vertical (Y) %" value={editCaptionAbsY} onChange={setEditCaptionAbsY} onCommit={(value) => commitCaptionAbsPos("y", value)} />
          <CaptionWidthControl
            value={captionProps.maxWidth}
            onChange={(maxWidth) => patchSelectedCaptionProps({ maxWidth })}
          />

        </div>
      </div>
    </section>
  );

  const surfaceSection = (
    <section className="flex flex-col gap-3" style={{ padding: isVertical ? "16px" : "14px 24px" }}>
      <div>
        <h3 className="text-[0.9rem] font-semibold text-[var(--ink)]">Surface</h3>
      </div>
      <Field label="Plane">
        <Select
          value={captionProps.surfaceMode}
          onValueChange={(value) => {
            if (value === "wall") {
              patchSelectedCaptionProps({
                surfaceMode: "wall",
                surfacePerspectivePx: 1200,
                surfaceDepthPx: -90,
                surfaceOpacity: 0.78,
                surfaceBlurPx: 0.3,
                surfaceBlendMode: "multiply",
              });
            } else if (value === "none") {
              patchSelectedCaptionProps({ surfaceMode: "none" });
            }
          }}
        >
          <SelectTrigger className="h-9 w-full rounded-md border text-[0.88rem]" style={selectTriggerStyle}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent side="top" alignItemWithTrigger={false} className={selectContentClassName}>
            <SelectItem value="none" style={selectItemStyle} className={selectItemClassName}>Floating</SelectItem>
            <SelectItem value="wall" style={selectItemStyle} className={selectItemClassName}>On wall</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      {captionProps.surfaceMode === "wall" ? (
        <div className="grid grid-cols-1 gap-3">
          <SurfaceNumberField label="Depth (Z)" value={captionProps.surfaceDepthPx} min={-400} max={200} unit="px" onCommit={(surfaceDepthPx) => patchSelectedCaptionProps({ surfaceDepthPx })} />
          <SurfaceNumberField label="Perspective" value={captionProps.surfacePerspectivePx} min={400} max={3000} unit="px" onCommit={(surfacePerspectivePx) => patchSelectedCaptionProps({ surfacePerspectivePx })} />
          <SurfaceNumberField label="Tilt (X)" value={captionProps.surfaceRotateXDeg} min={-30} max={30} step={0.25} unit="°" onCommit={(surfaceRotateXDeg) => patchSelectedCaptionProps({ surfaceRotateXDeg })} />
          <SurfaceNumberField label="Turn (Y)" value={captionProps.surfaceRotateYDeg} min={-30} max={30} step={0.25} unit="°" onCommit={(surfaceRotateYDeg) => patchSelectedCaptionProps({ surfaceRotateYDeg })} />
          <SurfaceNumberField label="Rotate (Z)" value={captionProps.surfaceRotateZDeg} min={-30} max={30} step={0.25} unit="°" onCommit={(surfaceRotateZDeg) => patchSelectedCaptionProps({ surfaceRotateZDeg })} />
          <SurfaceNumberField label="Softness" value={captionProps.surfaceBlurPx} min={0} max={3} step={0.1} unit="px" onCommit={(surfaceBlurPx) => patchSelectedCaptionProps({ surfaceBlurPx })} />
          <SurfaceNumberField label="Opacity" value={captionProps.surfaceOpacity * 100} min={20} max={100} unit="%" onCommit={(value) => patchSelectedCaptionProps({ surfaceOpacity: value / 100 })} />
          <Field label="Material blend">
            <Select value={captionProps.surfaceBlendMode} onValueChange={(surfaceBlendMode) => patchSelectedCaptionProps({ surfaceBlendMode })}>
              <SelectTrigger className="h-9 w-full rounded-md border text-[0.88rem]" style={selectTriggerStyle}><SelectValue /></SelectTrigger>
              <SelectContent side="top" alignItemWithTrigger={false} className={selectContentClassName}>
                <SelectItem value="multiply" style={selectItemStyle} className={selectItemClassName}>Multiply</SelectItem>
                <SelectItem value="normal" style={selectItemStyle} className={selectItemClassName}>Normal</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
      ) : null}
    </section>
  );

  const textSection = (
    <div className="flex shrink-0 flex-col gap-1.5" style={{ padding: isVertical ? "10px 16px 12px" : "12px 18px", ...(!isVertical ? { flexBasis: 340 } : {}) }}>
      <span className={FIELD_LABEL}>Text</span>
      <textarea
        disabled={selectedElementCount > 1}
        aria-label="Caption words"
        value={editCaptionText}
        onChange={(event) => setEditCaptionText(event.target.value)}
        onBlur={commitCaptionText}
        className="min-h-[44px] w-full flex-1 resize-none rounded-md border border-[var(--chrome-line)] bg-[var(--chrome-raised)] text-[0.95rem] leading-[1.35] text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chrome-focus-ring)]"
        style={{ padding: "8px 12px", fontFamily: captionFontFamily(editCaptionFontPreset) }}
      />
    </div>
  );

  if (isVertical) {
    const subpanels = CAPTION_INSPECTOR_TABS.filter(tab => !tracked || tab.id !== "motion");
    const isCameraReveal = captionProps.styleVariant === "camera_reveal";
    return (
      <div className="flex w-full max-w-full shrink-0 flex-col overflow-hidden bg-[var(--chrome-panel)]">
        {selectedElementCount > 1 ? <p role="status" className="px-4 py-2 text-xs text-[var(--ink-secondary)]">{selectedElementCount} captions selected</p> : null}
        {showInspectorTabs ? (
          <InspectorPanelTabs
            ariaLabel="Caption inspector panels"
            tabs={subpanels}
            value={verticalSubpanel}
            onValueChange={setVerticalSubpanel}
          />
        ) : null}
        {verticalSubpanel === "text" ? (
          <>
            {textSection}
            <section className="border-t border-[var(--panel-group-divider,var(--chrome-line))] px-4 py-3">
              <InspectorHeading>Typography</InspectorHeading>
              {fontControls}
          {(captionProps.animationIn === "handwriting" || captionProps.animationOut === "handwriting") ?
            <HandwritingWeightControl key={selectedElement.id} value={captionProps.handwritingWeight}
              onPreview={previewSelectedCaptionProps} onPatch={patchSelectedCaptionProps} /> : null}
              {imageFillControls}
            </section>
          </>
        ) : null}
        {verticalSubpanel === "position" ? <>
          {selectedElementCount === 1 ? surfaceTracking : null}
          {tracked ? <p className="px-4 text-xs text-[var(--ink-muted)]">Follows tracked surface</p> : positionSection}
          {!tracked && captionProps.styleVariant !== "camera_reveal" && selectedElementCount === 1 ? <div className="border-t border-[var(--panel-group-divider,var(--chrome-line))] px-4 py-3"><InspectorDisclosure title="Perspective" open={perspectiveOpen} onOpenChange={setPerspectiveOpen}>{surfaceSection}</InspectorDisclosure></div> : null}
        </> : null}
        {verticalSubpanel === "timing" && hasValidWordTimings && selectedElementCount === 1 ? <div className="border-t border-[var(--panel-group-divider,var(--chrome-line))] px-4 py-3">{timingControls}</div> : null}
        {verticalSubpanel === "motion" && (cameraRevealControls ?? inverseMaskControls) ? (
          <section className="border-t border-[var(--panel-group-divider,var(--chrome-line))] px-4 py-4">
            {(cameraRevealControls ?? inverseMaskControls) ? (
              <>
                <h3 className="mb-3 text-[0.9rem] font-semibold text-[var(--ink)]">
                  {captionProps.styleVariant === "camera_reveal" ? "3D camera reveal" : "Motion"}
                </h3>
                {cameraRevealControls ?? inverseMaskControls}
              </>
            ) : null}
          </section>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-full shrink-0 flex-col overflow-hidden border-t border-[var(--chrome-line)] bg-[var(--chrome-panel)]">
      <div className="flex items-start gap-4" style={{ padding: "12px 24px" }}>
        <div className="min-w-0 flex-1">
          <span className={FIELD_LABEL}>Text</span>
          <textarea
            value={editCaptionText}
            onChange={(event) => setEditCaptionText(event.target.value)}
            onBlur={commitCaptionText}
            className="min-h-[44px] w-full resize-none rounded-lg border border-[var(--chrome-line)] bg-[var(--chrome-raised)] text-[1rem] leading-[1.4] text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chrome-focus-ring)]"
            style={{ padding: "8px 14px", fontFamily: captionFontFamily(editCaptionFontPreset), maxWidth: 680 }}
          />
        </div>
      </div>
      {/* Typography comes before placement in both layouts. The sections still stack because
          Position needs enough room for its anchor grid, sliders, and exact values. */}
      <div className="flex min-w-0 flex-col">
        <section className="min-w-0 border-t border-[var(--panel-group-divider,var(--chrome-line))]" style={{ padding: "12px 24px" }}>
          <h3 className="mb-3 text-[0.9rem] font-semibold text-[var(--ink)]">Appearance</h3>
          {fontControls}
          {(captionProps.animationIn === "handwriting" || captionProps.animationOut === "handwriting") ?
            <HandwritingWeightControl key={selectedElement.id} value={captionProps.handwritingWeight}
              onPreview={previewSelectedCaptionProps} onPatch={patchSelectedCaptionProps} /> : null}
          {imageFillControls}
          {inverseMaskControls}
        </section>
        <div className="min-w-0 border-t border-[var(--panel-group-divider,var(--chrome-line))]">
          {!tracked ? positionSection : null}
        </div>
        <div className="min-w-0 border-t border-[var(--panel-group-divider,var(--chrome-line))]">{surfaceTracking}{!tracked ? surfaceSection : null}</div>
      </div>
      <div className="border-t border-[var(--panel-group-divider,var(--chrome-line))]" style={{ padding: "14px 24px" }}>
        {timingControls}
      </div>
    </div>
  );
}

function CaptionTextColorControl({
  label = "Colour",
  value,
  isCustom,
  onChange,
  onReset,
}: {
  label?: string;
  value: string;
  isCustom: boolean;
  onChange: (value: string) => void;
  onReset: () => void;
}) {
  return (
    <Field label={label}>
      {/* Focus is a neutral ring. The accent orange used to live here, which is how "this
          field is focused" ended up speaking the same language as a CTA. */}
      <label className="relative flex h-9 cursor-pointer items-center gap-2 rounded-md border border-[var(--chrome-line)] bg-[var(--chrome-raised)] px-2.5 text-[13px] font-medium tabular-nums text-[var(--ink)] transition-colors hover:border-[var(--chrome-line-strong)] focus-within:ring-2 focus-within:ring-[var(--chrome-focus-ring)]">
        <span
          className="size-5 rounded border border-[var(--chrome-line-strong)]"
          style={{ backgroundColor: value }}
          aria-hidden="true"
        />
        <span className="tabular font-mono text-[0.78rem]">{value}</span>
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label="Caption text colour"
        />
      </label>
      {isCustom ? (
        <Button
          type="button"
          variant="ghost"
          size="lg"
          onClick={onReset}
          className="text-[var(--ink-muted)] hover:text-[var(--ink)]"
        >
          Reset
        </Button>
      ) : null}
    </Field>
  );
}
