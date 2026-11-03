"use client";

import { SegmentedControl } from "@/components/ui/segmented-control";
import { SettingField } from "@/components/ui/setting-field";
import { safeAreaFor } from "@/lib/qc/standards";
import reelsReference from "./reels-reference-zones.json";


/** Shape-aware safe-zone guide, on or off. The saved "reels" value means on. */
export type PlatformPreviewMode = "off" | "reels";
export const platformPreviewLabel = (mode: PlatformPreviewMode) => mode === "off" ? "Guides" : "Safe zones";
/** Older saved choices ("tiktok") mean the guide was on. */
export const readPlatformPreviewMode = (saved: string | null): PlatformPreviewMode | null =>
  saved === "off" ? "off" : saved === "reels" || saved === "tiktok" ? "reels" : null;
type Props = {
  mode: Exclude<PlatformPreviewMode, "off">;
  compositionWidth: number;
  compositionHeight: number;
};
export type PlatformPreviewGeometry = {
  topPct: number;
  bottomPct: number;
  leftPct: number;
  rightPct: number;
  railTopPct: number | null;
  railRightPct: number | null;
};

export function PlatformPreviewControl({
  value, onChange,
}: {
  value: PlatformPreviewMode;
  onChange: (value: PlatformPreviewMode) => void;
}) {
  return (
    <SettingField label="Safe zones" labelId="safe-zones-label">
      <SegmentedControl size="sm" fill role="group" aria-labelledby="safe-zones-label">
        {(["off", "reels"] as const).map(mode => <button key={mode} type="button" aria-pressed={value === mode} onClick={() => onChange(mode)}>{mode === "off" ? "Off" : "On"}</button>)}
      </SegmentedControl>
    </SettingField>
  );
}

export function getPlatformPreviewGeometry(
  mode: Exclude<PlatformPreviewMode, "off">,
  compositionWidth: number,
  compositionHeight: number,
): PlatformPreviewGeometry | null {
  if (![compositionWidth, compositionHeight].every(Number.isFinite)
    || compositionWidth <= 0 || compositionHeight <= 0) return null;
  // Landscape uses ordinary title clearance, not short-form interface coverage.
  const safeArea = safeAreaFor(compositionWidth > compositionHeight ? "web" : mode, { width: compositionWidth, height: compositionHeight });
  return {
    topPct: (safeArea.top / compositionHeight) * 100,
    bottomPct: (safeArea.bottom / compositionHeight) * 100,
    leftPct: (safeArea.left / compositionWidth) * 100,
    rightPct: (safeArea.right / compositionWidth) * 100,
    railTopPct: safeArea.rail ? safeArea.rail.belowFraction * 100 : null,
    railRightPct: safeArea.rail ? (safeArea.rail.right / compositionWidth) * 100 : null,
  };
}

/** Editor-only guides. Edge clearance is distinct from platform interface coverage. */
export function PlatformPreviewOverlay({ mode, compositionWidth, compositionHeight }: Props) {
  const geometry = getPlatformPreviewGeometry(mode, compositionWidth, compositionHeight);
  if (!geometry) return null;
  if (compositionWidth > compositionHeight) {
    return (
      <div data-platform-preview-overlay="landscape" role="img"
        aria-label="Safe zones: landscape title-safe margins"
        style={{ position: "absolute", inset: 0, zIndex: 12, pointerEvents: "none" }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"
          style={{ width: "100%", height: "100%", display: "block" }}>
          <rect data-platform-title-safe="landscape"
            x={geometry.leftPct} y={geometry.topPct}
            width={100 - geometry.leftPct - geometry.rightPct}
            height={100 - geometry.topPct - geometry.bottomPct}
            fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="6 4"
            vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
    );
  }
  return (
    <div data-platform-preview-overlay="reels" role="img"
      aria-label="Safe zones: amber left and right edge-clearance bands; gray interface zones"
      style={{ position: "absolute", inset: 0, zIndex: 12, pointerEvents: "none" }}>
      <svg viewBox={`0 0 ${reelsReference.width} ${reelsReference.height}`} preserveAspectRatio="none" aria-hidden="true"
        style={{ width: "100%", height: "100%", display: "block" }}>
        {reelsReference.guidePolygons.map(({ id, points }) => (
          <polygon key={id} data-platform-ui-zone={id} points={points.map((point) => point.join(",")).join(" ")}
            fill="rgba(0,0,0,0.24)" stroke="rgba(255,255,255,0.65)"
            strokeWidth="1" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <svg data-platform-edge-clearance="reels" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }}>
        <rect x="0" y="0" width={geometry.leftPct} height="100" fill="rgba(255,190,70,0.18)" />
        <rect x={100 - geometry.rightPct} y="0" width={geometry.rightPct} height="100" fill="rgba(255,190,70,0.18)" />
        <path data-safe-edge="left" d={`M ${geometry.leftPct} 0 V 100`}
          stroke="#ffbe46" strokeWidth="1.5" strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
        <path data-safe-edge="right" d={`M ${100 - geometry.rightPct} 0 V 100`}
          stroke="#ffbe46" strokeWidth="1.5" strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
