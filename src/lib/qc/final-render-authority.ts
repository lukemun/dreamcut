import { createHash } from "node:crypto";

import type { TimelineElement } from "@/components/studio/timeline/types";
import {
  COLOR_GRADE_KEYFRAME_FIELDS,
  hasColorGradeData,
} from "@/lib/timeline/color-grade";

export type FinalRenderAuthorityFinding = {
  elementId: string;
  code:
    | "declared_render_authority_not_active"
    | "render_authority_missing"
    | "framed_render_authority_missing"
    | "still_render_authority_missing"
    | "still_workshop_source_active"
    | "still_authority_dimensions_missing"
    | "still_authority_undersized"
    | "active_source_is_named_proxy"
    | "grade_transfer_missing"
    | "grade_transfer_stale";
  message: string;
  activeSourceUrl: string | null;
  requiredSourceUrl: string | null;
};

const AUTHORITY_PROP_KEYS = [
  "render_authority_source_url",
  "final_render_source_url",
  "render_authority",
  "render_authority_source",
  "render_authority_path",
] as const;

function stringProp(props: Record<string, unknown> | null, key: string): string | null {
  const value = props?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function dimensionProp(props: Record<string, unknown> | null, key: string): [number, number] | null {
  const value = props?.[key];
  if (!Array.isArray(value) || value.length !== 2) return null;
  const [width, height] = value;
  return typeof width === "number" && Number.isFinite(width) && width > 0
    && typeof height === "number" && Number.isFinite(height) && height > 0
    ? [width, height]
    : null;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stableValue(entry)]),
  );
}

export function colorGradeFingerprint(props: Record<string, unknown> | null): string {
  const gradeFieldNames = new Set<string>([
    "color_grade_model",
    ...COLOR_GRADE_KEYFRAME_FIELDS,
    "lut_asset_id",
    "lut_source_url",
    "lut_intensity",
  ]);
  const gradeProps = Object.fromEntries(
    Object.entries(props ?? {})
      .filter(([key]) => gradeFieldNames.has(key)),
  );
  const keyframes = props?.keyframes;
  if (keyframes && typeof keyframes === "object" && !Array.isArray(keyframes)) {
    gradeProps.keyframes = Object.fromEntries(
      Object.entries(keyframes as Record<string, unknown>)
        .filter(([key]) => gradeFieldNames.has(key)),
    );
  }
  return createHash("sha256")
    .update(JSON.stringify(stableValue(gradeProps)))
    .digest("hex");
}

function gradeTransferFinding(
  element: TimelineElement,
  authority: string | null,
): FinalRenderAuthorityFinding | null {
  if (!hasColorGradeData(element.props) || element.props?.grade_transfer_required !== true) {
    return null;
  }

  const receipt = element.props?.grade_transfer_receipt;
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) {
    return {
      elementId: element.id,
      code: "grade_transfer_missing",
      message:
        `Video ${element.id} was graded during a proxy audition, but no applied grade-transfer receipt exists. `
        + "Transfer the selected grade to the mapped render authority before final delivery.",
      activeSourceUrl: element.source_url,
      requiredSourceUrl: authority,
    };
  }

  const record = receipt as Record<string, unknown>;
  const receiptAuthority =
    typeof record.render_authority_source_url === "string"
      ? record.render_authority_source_url
      : null;
  const receiptFingerprint =
    typeof record.grade_fingerprint === "string"
      ? record.grade_fingerprint
      : null;
  const expectedFingerprint = colorGradeFingerprint(element.props);

  if (
    record.status !== "applied"
    || !mediaSourcesMatch(receiptAuthority, authority)
    || receiptFingerprint !== expectedFingerprint
  ) {
    return {
      elementId: element.id,
      code: "grade_transfer_stale",
      message:
        `Video ${element.id} has a stale or mismatched grade-transfer receipt. `
        + "Reapply the current grade to the mapped render authority and record its current fingerprint.",
      activeSourceUrl: element.source_url,
      requiredSourceUrl: authority,
    };
  }
  return null;
}

/**
 * Prefer an explicitly color-managed/derived render authority. The original is
 * only the fallback: HDR sources and processed-alpha sources can declare a
 * safer full-resolution authority without being forced back to camera media.
 */
export function declaredFinalRenderAuthority(element: TimelineElement): string | null {
  for (const key of AUTHORITY_PROP_KEYS) {
    const value = stringProp(element.props, key);
    if (value) return value;
  }
  return stringProp(element.props, "original_source_url");
}

function declaredDerivedRenderAuthority(element: TimelineElement): string | null {
  for (const key of AUTHORITY_PROP_KEYS) {
    const value = stringProp(element.props, key);
    if (value) return value;
  }
  return null;
}

function normalizedMediaIdentity(value: string): string {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // Keep the original value if it contains malformed percent encoding.
  }

  const withoutQuery = decoded.split(/[?#]/, 1)[0]!.replace(/\\/g, "/");
  const mediaIndex = withoutQuery.lastIndexOf("/media/");
  if (mediaIndex >= 0) return withoutQuery.slice(mediaIndex + 1).replace(/^\/+/, "");
  const relativeMediaIndex = withoutQuery.indexOf("media/");
  if (relativeMediaIndex >= 0) return withoutQuery.slice(relativeMediaIndex).replace(/^\/+/, "");
  return withoutQuery.replace(/^\/+/, "");
}

export function mediaSourcesMatch(left: string | null, right: string | null): boolean {
  if (!left || !right) return false;
  return normalizedMediaIdentity(left) === normalizedMediaIdentity(right);
}

/**
 * Every other check in this gate needs someone to have DECLARED an authority —
 * so an undeclared proxy sails straight through to delivery. This is the
 * declaration-free sensor: a file whose own name says it is a workshop
 * derivative is never a delivery source, whatever the props claim.
 *
 * *(Earned 2026-07-22: the Cover Thumbnail Test short's on-camera hook was
 * mounted as `talking-head-take-02-proxy.mp4` — 720×1280 into a 1080×1920
 * canvas — with no authority declared, so the gate had nothing to compare and
 * passed. The 1920×1080 camera original was sitting in Downloads the whole
 * time. It was caught by eye, which is not a control.)*
 */
const PROXY_NAME_PATTERN = /(^|[-_.])(proxy|preview)([-_.]|$)/i;

export function looksLikeWorkshopDerivative(sourceUrl: string | null): boolean {
  if (!sourceUrl) return false;
  const identity = normalizedMediaIdentity(sourceUrl);
  const fileName = identity.slice(identity.lastIndexOf("/") + 1);
  const stem = fileName.replace(/\.[^.]+$/, "");
  return PROXY_NAME_PATTERN.test(stem);
}

/**
 * Delivery gate for scale-1 renders. It is intentionally structural and fast:
 * preprocessing/ingest declares the highest-quality safe authority, then the
 * renderer refuses to encode while a workshop proxy is still active.
 */
export function checkFinalRenderAuthority(elements: TimelineElement[]): FinalRenderAuthorityFinding[] {
  const findings: FinalRenderAuthorityFinding[] = [];

  for (const element of elements) {
    if (element.removed_at) continue;

    if (element.type === "still" && element.props?.render_authority_required === true) {
      const preview = stringProp(element.props, "preview_source_url");
      if (!element.source_url || !preview) {
        findings.push({
          elementId: element.id,
          code: "still_render_authority_missing",
          message: `Still ${element.id} requires distinct delivery and workshop sources, but one is missing.`,
          activeSourceUrl: element.source_url,
          requiredSourceUrl: null,
        });
      } else if (mediaSourcesMatch(element.source_url, preview)) {
        findings.push({
          elementId: element.id,
          code: "still_workshop_source_active",
          message: `Still ${element.id} is using its workshop derivative for final delivery: ${preview}.`,
          activeSourceUrl: element.source_url,
          requiredSourceUrl: null,
        });
      } else {
        const renderDimensions = dimensionProp(element.props, "render_authority_dimensions");
        const previewDimensions = dimensionProp(element.props, "workshop_preview_dimensions");
        if (!renderDimensions || !previewDimensions) {
          findings.push({
            elementId: element.id,
            code: "still_authority_dimensions_missing",
            message: `Still ${element.id} must declare measured render_authority_dimensions and workshop_preview_dimensions.`,
            activeSourceUrl: element.source_url,
            requiredSourceUrl: element.source_url,
          });
        } else if (
          renderDimensions[0] < previewDimensions[0] * 2
          || renderDimensions[1] < previewDimensions[1] * 2
        ) {
          findings.push({
            elementId: element.id,
            code: "still_authority_undersized",
            message: `Still ${element.id} render authority is ${renderDimensions[0]}×${renderDimensions[1]}; delivery requires at least 2× its ${previewDimensions[0]}×${previewDimensions[1]} workshop derivative.`,
            activeSourceUrl: element.source_url,
            requiredSourceUrl: element.source_url,
          });
        }
      }
      continue;
    }

    if (!element.type.startsWith("video")) continue;

    if (
      stringProp(element.props, "framing_receipt_path")
      && stringProp(element.props, "preview_source_url")
      && !declaredDerivedRenderAuthority(element)
    ) {
      findings.push({
        elementId: element.id,
        code: "framed_render_authority_missing",
        message: `Video ${element.id} previews a receipt-bound framing derivative but does not declare its matching full-resolution render authority. `
          + "Do not fall back to the archival camera original; bind the framed render/preview pair atomically.",
        activeSourceUrl: element.source_url,
        requiredSourceUrl: null,
      });
      continue;
    }

    const authority = declaredFinalRenderAuthority(element);
    const required = element.props?.render_authority_required === true;
    const transferFinding = gradeTransferFinding(element, authority);
    if (transferFinding) {
      findings.push(transferFinding);
      continue;
    }

    // Declaration-free: a proxy-named file is never a delivery source. Checked
    // before the authority branch so an UNDECLARED proxy is caught too — that
    // is the whole gap this exists to close.
    if (looksLikeWorkshopDerivative(element.source_url) && !mediaSourcesMatch(element.source_url, authority)) {
      findings.push({
        elementId: element.id,
        code: "active_source_is_named_proxy",
        message: `Video ${element.id} is rendering from ${element.source_url}, whose name marks it a workshop derivative. `
          + `Mount the full-resolution authority and keep the proxy on preview_source_url `
          + `(or declare it as the authority if this file really is the best source).`,
        activeSourceUrl: element.source_url,
        requiredSourceUrl: authority,
      });
      continue;
    }

    if (!authority) {
      if (required) {
        findings.push({
          elementId: element.id,
          code: "render_authority_missing",
          message: `Video ${element.id} requires a final-render authority but none is declared.`,
          activeSourceUrl: element.source_url,
          requiredSourceUrl: null,
        });
      }
      continue;
    }

    if (!mediaSourcesMatch(element.source_url, authority)) {
      findings.push({
        elementId: element.id,
        code: "declared_render_authority_not_active",
        message: `Video ${element.id} is still using ${element.source_url ?? "no source"}; final delivery requires ${authority}.`,
        activeSourceUrl: element.source_url,
        requiredSourceUrl: authority,
      });
    }
  }

  return findings;
}

export function assertFinalRenderAuthority(elements: TimelineElement[]): void {
  const findings = checkFinalRenderAuthority(elements);
  if (findings.length === 0) return;

  const details = findings
    .slice(0, 8)
    .map((finding) => `- ${finding.message}`)
    .join("\n");
  const remaining = findings.length > 8 ? `\n- …and ${findings.length - 8} more.` : "";
  throw new Error(
    `Final render authority gate failed for ${findings.length} media element(s). ` +
      `Working renders may use proxies, but scale-1 delivery must use each mapped highest-resolution authority.\n${details}${remaining}`,
  );
}
