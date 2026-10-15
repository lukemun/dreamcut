"use client";

import { Eye, EyeOff } from "lucide-react";
import { useId, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";

export type CompositionRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type AnalysisOverlayRegion = {
  id: string;
  kind: "focal" | "exclusion";
  /** Stable anonymous ordinal supplied by the analysis result, never a person's name. */
  trackOrdinal?: number | null;
  rect: CompositionRect;
  confidence?: number | null;
  evidence: "observed" | "interpolated" | "gap";
};

type Props = {
  compositionWidth: number;
  compositionHeight: number;
  regions: readonly AnalysisOverlayRegion[];
  initiallyVisible?: boolean;
  visible?: boolean;
  onVisibleChange?: (visible: boolean) => void;
};

type DisplayRegion = AnalysisOverlayRegion & {
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
  label: string;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function formatAnalysisConfidence(confidence: number | null | undefined): string {
  if (confidence == null || !Number.isFinite(confidence)) return "confidence unavailable";
  return `${Math.round(clamp(confidence, 0, 1) * 100)}% confidence`;
}

export function getAnonymousRegionLabel(region: AnalysisOverlayRegion): string {
  const regionKind = region.kind === "focal" ? "Focal region" : "Exclusion region";
  const subject =
    region.trackOrdinal != null && Number.isInteger(region.trackOrdinal) && region.trackOrdinal > 0
      ? `Track ${region.trackOrdinal}`
      : region.kind === "focal"
        ? "Anonymous subject"
        : "No track";
  const evidence =
    region.evidence === "gap"
      ? "evidence gap"
      : region.evidence === "interpolated"
        ? "interpolated across gap"
        : "observed";
  return `${regionKind} · ${subject} · ${formatAnalysisConfidence(region.confidence)} · ${evidence}`;
}

export function projectAnalysisRegionsForDisplay(
  regions: readonly AnalysisOverlayRegion[],
  compositionWidth: number,
  compositionHeight: number,
): DisplayRegion[] {
  if (!(compositionWidth > 0) || !(compositionHeight > 0)) return [];

  return regions.flatMap((region) => {
    const { x, y, width, height } = region.rect;
    if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return [];
    const left = clamp(x, 0, compositionWidth);
    const top = clamp(y, 0, compositionHeight);
    const right = clamp(x + width, 0, compositionWidth);
    const bottom = clamp(y + height, 0, compositionHeight);
    if (right <= left || bottom <= top) return [];

    return [{
      ...region,
      leftPct: (left / compositionWidth) * 100,
      topPct: (top / compositionHeight) * 100,
      widthPct: ((right - left) / compositionWidth) * 100,
      heightPct: ((bottom - top) / compositionHeight) * 100,
      label: getAnonymousRegionLabel(region),
    }];
  });
}

/**
 * Read-only analysis evidence over the live composition preview.
 *
 * The layer deliberately accepts projected composition-space rectangles instead
 * of detector coordinates. It does no detection, naming, or confirmation. All
 * evidence marks are pointer-transparent; only the labelled visibility button
 * can receive input, so normal player controls and canvas gestures keep working.
 */
export function AnalysisPreviewOverlay({
  compositionWidth,
  compositionHeight,
  regions,
  initiallyVisible = false,
  visible,
  onVisibleChange,
}: Props) {
  const [internalVisible, setInternalVisible] = useState(initiallyVisible);
  const isVisible = visible ?? internalVisible;
  const labelId = useId();
  const displayRegions = useMemo(
    () => projectAnalysisRegionsForDisplay(regions, compositionWidth, compositionHeight),
    [regions, compositionWidth, compositionHeight],
  );

  if (displayRegions.length === 0) return null;

  const setVisible = (nextVisible: boolean) => {
    if (visible == null) setInternalVisible(nextVisible);
    onVisibleChange?.(nextVisible);
  };

  return (
    <div
      data-analysis-preview-overlay
      aria-label="Media analysis evidence"
      style={{ position: "absolute", inset: 0, zIndex: 4, pointerEvents: "none" }}
    >
      <div style={{ position: "absolute", top: "0.65rem", right: "0.65rem", pointerEvents: "auto" }}>
        <Button
          type="button"
          variant="secondary"
          size="studio"
          aria-pressed={isVisible}
          aria-controls={labelId}
          aria-label={`${isVisible ? "Hide" : "Show"} media analysis overlay`}
          onClick={() => setVisible(!isVisible)}
          className="min-h-9 border-[var(--chrome-line-strong)] bg-[var(--chrome-panel)] px-3 text-[0.88rem] font-semibold text-[var(--ink)] shadow-lg hover:bg-[var(--chrome-raised)]"
        >
          {isVisible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          Analysis overlay
        </Button>
      </div>

      <div id={labelId} hidden={!isVisible} aria-live="polite">
        <span className="sr-only">
          {displayRegions.length} analysis {displayRegions.length === 1 ? "region" : "regions"} shown.
        </span>
        {displayRegions.map((region) => {
          const isFocal = region.kind === "focal";
          const color = isFocal ? "var(--color-audio)" : "var(--timeline-position-color)";
          const placeLabelInside = region.topPct < 8;
          return (
            <div
              key={region.id}
              data-analysis-region={region.kind}
              data-analysis-evidence={region.evidence}
              aria-label={region.label}
              style={{
                position: "absolute",
                left: `${region.leftPct}%`,
                top: `${region.topPct}%`,
                width: `${region.widthPct}%`,
                height: `${region.heightPct}%`,
                border: `2px ${region.evidence === "observed" ? "solid" : "dashed"} ${color}`,
                background: `color-mix(in srgb, ${color} 12%, transparent)`,
                boxShadow: `inset 0 0 0 1px var(--chrome-deep)`,
                pointerEvents: "none",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  left: -2,
                  top: placeLabelInside ? -2 : 0,
                  maxWidth: "min(22rem, 88vw)",
                  transform: placeLabelInside ? "none" : "translateY(-100%)",
                  padding: "0.3rem 0.5rem",
                  borderRadius: placeLabelInside ? "0 0 0.35rem 0" : "0.35rem 0.35rem 0 0",
                  background: color,
                  color: "var(--chrome-deep)",
                  fontSize: "clamp(0.72rem, 1.5vw, 0.84rem)",
                  fontWeight: 700,
                  lineHeight: 1.2,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {region.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
