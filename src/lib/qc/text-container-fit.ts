import type { Finding, QcElement } from "./check-timeline";
import { PROMINENT_TEXT_CONTAINER_FIT } from "./standards";

export type PixelRect = { x: number; y: number; width: number; height: number };

export type TextContainerFitSlot = {
  id: string;
  label: string;
  container: PixelRect;
  /** Exact non-transparent rendered-ink bounds on the authored canvas. */
  ink: PixelRect;
};

export type TextContainerFitContract = {
  version: 1;
  validated_source_url: string;
  canvas: { width: number; height: number };
  slots: TextContainerFitSlot[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === "object" && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

function parseRect(value: unknown): PixelRect | null {
  if (!isRecord(value)) return null;
  const { x, y, width, height } = value;
  if (![x, y, width, height].every(isFiniteNumber) || (width as number) <= 0 || (height as number) <= 0) {
    return null;
  }
  return { x: x as number, y: y as number, width: width as number, height: height as number };
}

export function parseTextContainerFitContract(value: unknown): TextContainerFitContract | null {
  if (!isRecord(value) || value.version !== 1 || typeof value.validated_source_url !== "string") return null;
  if (!isRecord(value.canvas) || !isFiniteNumber(value.canvas.width) || !isFiniteNumber(value.canvas.height)) return null;
  if (value.canvas.width <= 0 || value.canvas.height <= 0 || !Array.isArray(value.slots) || value.slots.length === 0) return null;

  const slots: TextContainerFitSlot[] = [];
  for (const raw of value.slots) {
    if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.label !== "string") return null;
    const container = parseRect(raw.container);
    const ink = parseRect(raw.ink);
    if (!container || !ink) return null;
    slots.push({ id: raw.id, label: raw.label, container, ink });
  }

  return {
    version: 1,
    validated_source_url: value.validated_source_url,
    canvas: { width: value.canvas.width, height: value.canvas.height },
    slots,
  };
}

function finding(element: QcElement, slot: TextContainerFitSlot | null, code: string, message: string, measured: string, remedy: string): Finding {
  const s = PROMINENT_TEXT_CONTAINER_FIT;
  return {
    code,
    severity: "blocker",
    elementId: element.id,
    atSeconds: element.timeline_start,
    message,
    measured,
    limit: slot
      ? `width ${(s.minWidthOccupancy * 100).toFixed(0)}-${(s.maxWidthOccupancy * 100).toFixed(0)}%; height ${(s.minHeightOccupancy * 100).toFixed(0)}-${(s.maxHeightOccupancy * 100).toFixed(0)}%; padding >= ${s.minPaddingPx}px; center delta <= ${s.centerTolerancePx}px`
      : "A current measured text_container_fit_contract is required.",
    source: s.source,
    remedy,
  };
}

export function checkTextContainerFitElement(element: QcElement): Finding[] {
  if (element.props?.requires_text_container_fit !== true) return [];
  const contract = parseTextContainerFitContract(element.props.text_container_fit_contract);
  if (!contract) {
    return [finding(element, null, "text_container_fit_unmeasured", "Prominent container text has no valid measured fit receipt.", "missing or invalid text_container_fit_contract", "Measure the rendered ink bounds for every prominent label, attach the contract, and rerun QC.")];
  }
  if ((element.source_url ?? "") !== contract.validated_source_url) {
    return [finding(element, null, "text_container_fit_stale", "The text-fit receipt was measured against a different asset revision.", `current ${element.source_url ?? "(none)"}; measured ${contract.validated_source_url}`, "Regenerate the receipt from the current source asset.")];
  }

  const findings: Finding[] = [];
  const s = PROMINENT_TEXT_CONTAINER_FIT;
  for (const slot of contract.slots) {
    const { container, ink } = slot;
    const widthOccupancy = ink.width / container.width;
    const heightOccupancy = ink.height / container.height;
    const left = ink.x - container.x;
    const right = container.x + container.width - (ink.x + ink.width);
    const top = ink.y - container.y;
    const bottom = container.y + container.height - (ink.y + ink.height);
    const dx = (ink.x + ink.width / 2) - (container.x + container.width / 2);
    const dy = (ink.y + ink.height / 2) - (container.y + container.height / 2);
    const measured = `${slot.label}: ${(widthOccupancy * 100).toFixed(1)}% W × ${(heightOccupancy * 100).toFixed(1)}% H; padding L${left.toFixed(1)} R${right.toFixed(1)} T${top.toFixed(1)} B${bottom.toFixed(1)}px; center Δ(${dx.toFixed(1)}, ${dy.toFixed(1)})px`;

    if (widthOccupancy < s.minWidthOccupancy || heightOccupancy < s.minHeightOccupancy) {
      findings.push(finding(element, slot, "text_container_underfilled", "Prominent text is too small for its assigned container.", measured, "Increase the loaded-font size or use a suitable condensed face, then remeasure until the label occupies the target band."));
    }
    if (widthOccupancy > s.maxWidthOccupancy || heightOccupancy > s.maxHeightOccupancy || Math.min(left, right, top, bottom) < s.minPaddingPx) {
      findings.push(finding(element, slot, "text_container_overfilled", "Prominent text crowds or escapes its assigned container.", measured, "Reduce or condense the type while retaining the minimum padding, then regenerate the measurement receipt."));
    }
    if (Math.abs(dx) > s.centerTolerancePx || Math.abs(dy) > s.centerTolerancePx) {
      findings.push(finding(element, slot, "text_container_misaligned", "Prominent text is not mathematically centered in its assigned container.", measured, "Position the label from measured ink bounds, not its nominal text anchor, and regenerate the receipt."));
    }
  }
  return findings;
}

export function checkTextContainerFitContracts(elements: QcElement[]): Finding[] {
  return elements.flatMap(checkTextContainerFitElement);
}

export function assertTextContainerFitContract(element: QcElement): TextContainerFitContract {
  const findings = checkTextContainerFitElement(element);
  if (findings.length > 0) {
    throw new Error(findings.map((entry) => `${entry.code}: ${entry.measured}`).join("\n"));
  }
  return parseTextContainerFitContract(element.props?.text_container_fit_contract)!;
}
