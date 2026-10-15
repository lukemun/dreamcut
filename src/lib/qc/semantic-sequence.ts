import type { Finding, QcElement } from "./check-timeline";

type SemanticSequenceContract = {
  version: 1;
  id: string;
  spoken_end_seconds: number;
  tolerance_seconds: number;
  focus_underlay_element_id: string;
  focus_underlay_max_opacity: number;
  sequence_element_ids: string[];
  minimum_item_duration_seconds: number;
};

const SOURCE = "Cut-pacing semantic handoff contract: complete the spoken beat before sequential visual proof";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === "object" && !Array.isArray(value);

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

function parseContract(value: unknown): SemanticSequenceContract | null {
  if (!isRecord(value) || value.version !== 1 || typeof value.id !== "string" || value.id.length === 0) return null;
  if (!finite(value.spoken_end_seconds) || value.spoken_end_seconds < 0) return null;
  if (!finite(value.tolerance_seconds) || value.tolerance_seconds < 0) return null;
  if (typeof value.focus_underlay_element_id !== "string" || value.focus_underlay_element_id.length === 0) return null;
  if (!finite(value.focus_underlay_max_opacity) || value.focus_underlay_max_opacity < 0 || value.focus_underlay_max_opacity > 1) return null;
  if (!Array.isArray(value.sequence_element_ids) || value.sequence_element_ids.length === 0 || value.sequence_element_ids.some((id) => typeof id !== "string" || id.length === 0)) return null;
  if (!finite(value.minimum_item_duration_seconds) || value.minimum_item_duration_seconds <= 0) return null;
  return value as SemanticSequenceContract;
}

function finding(
  code: string,
  element: QcElement,
  message: string,
  measured: string,
  limit: string,
  remedy: string,
): Finding {
  return {
    code,
    severity: "blocker",
    elementId: element.id,
    atSeconds: element.timeline_start,
    message,
    measured,
    limit,
    source: SOURCE,
    remedy,
  };
}

/**
 * Verify an explicitly authored speech-to-proof sequence. The contract lives on the first
 * evidence element because the timeline cannot infer whether an overlay should illustrate a
 * word during speech or become a focal demonstration after the sentence. Once the editor makes
 * that semantic choice, this gate keeps timing, background focus, and rotation cadence coherent.
 */
export function checkSemanticSequenceContracts(elements: QcElement[]): Finding[] {
  const findings: Finding[] = [];
  const byId = new Map(elements.map((element) => [element.id, element]));

  for (const owner of elements) {
    const raw = owner.props?.semantic_sequence_contract;
    if (raw == null) continue;
    const contract = parseContract(raw);
    if (!contract) {
      findings.push(finding(
        "semantic_sequence_contract_invalid",
        owner,
        "The speech-to-proof sequence contract is malformed.",
        "missing or invalid semantic_sequence_contract fields",
        "Version 1 requires a spoken end, tolerance, focus underlay, ordered sequence IDs, and minimum item duration.",
        "Regenerate the contract from the aligned spoken beat and the intended proof sequence.",
      ));
      continue;
    }

    const sequence = contract.sequence_element_ids.map((id) => byId.get(id));
    const missingIds = contract.sequence_element_ids.filter((_, index) => sequence[index] == null);
    if (missingIds.length > 0) {
      findings.push(finding(
        "semantic_sequence_element_missing",
        owner,
        "A declared proof-sequence element is missing or muted.",
        `missing: ${missingIds.join(", ")}`,
        "Every declared sequence element must be active in the rendered lane set.",
        "Restore the missing elements or regenerate the ordered sequence contract.",
      ));
      continue;
    }

    const ordered = sequence as QcElement[];
    const first = ordered[0]!;
    const earliestAllowed = contract.spoken_end_seconds - contract.tolerance_seconds;
    if (first.timeline_start < earliestAllowed) {
      findings.push(finding(
        "semantic_evidence_preempts_spoken_beat",
        first,
        "Sequential visual proof begins before the spoken claim finishes.",
        `proof starts ${first.timeline_start.toFixed(3)}s; speech ends ${contract.spoken_end_seconds.toFixed(3)}s`,
        `proof start >= ${earliestAllowed.toFixed(3)}s`,
        `Move the first proof element to ${contract.spoken_end_seconds.toFixed(3)}s or later, then retime the sequence from that anchor.`,
      ));
    }

    for (let index = 0; index < ordered.length; index++) {
      const item = ordered[index]!;
      if (item.duration + contract.tolerance_seconds < contract.minimum_item_duration_seconds) {
        findings.push(finding(
          "semantic_sequence_item_too_fast",
          item,
          "A proof item rotates away before the declared viewing hold completes.",
          `${item.duration.toFixed(3)}s hold`,
          `>= ${contract.minimum_item_duration_seconds.toFixed(3)}s`,
          `Extend this item to at least ${contract.minimum_item_duration_seconds.toFixed(3)}s and ripple later proof items.`,
        ));
      }
      const next = ordered[index + 1];
      if (!next) continue;
      const end = item.timeline_start + item.duration;
      if (Math.abs(next.timeline_start - end) > contract.tolerance_seconds) {
        findings.push(finding(
          "semantic_sequence_handoff_gap",
          next,
          "The proof rotation has an unintended gap or overlap between items.",
          `previous ends ${end.toFixed(3)}s; next starts ${next.timeline_start.toFixed(3)}s`,
          `handoff delta <= ${contract.tolerance_seconds.toFixed(3)}s`,
          `Snap the next item to ${end.toFixed(3)}s so the ordered proof remains continuous.`,
        ));
      }
    }

    const underlay = byId.get(contract.focus_underlay_element_id);
    const proofEnd = ordered[ordered.length - 1]!.timeline_start + ordered[ordered.length - 1]!.duration;
    if (!underlay) {
      findings.push(finding(
        "semantic_sequence_focus_underlay_missing",
        owner,
        "The proof sequence declares a dimmed background but its underlay is missing or muted.",
        `missing: ${contract.focus_underlay_element_id}`,
        "One active underlay must cover the complete proof interval.",
        "Restore the underlay or update the contract to the active background element.",
      ));
    } else {
      const underlayEnd = underlay.timeline_start + underlay.duration;
      const opacity = underlay.props?.media_opacity;
      if (underlay.timeline_start > first.timeline_start + contract.tolerance_seconds || underlayEnd < proofEnd - contract.tolerance_seconds) {
        findings.push(finding(
          "semantic_sequence_focus_underlay_incomplete",
          underlay,
          "The dimmed background does not cover the complete proof sequence.",
          `underlay ${underlay.timeline_start.toFixed(3)}-${underlayEnd.toFixed(3)}s; proof ${first.timeline_start.toFixed(3)}-${proofEnd.toFixed(3)}s`,
          "The focus underlay must cover the full proof interval.",
          "Extend or align the underlay to the first and last proof frames.",
        ));
      }
      if (!finite(opacity) || opacity > contract.focus_underlay_max_opacity) {
        findings.push(finding(
          "semantic_sequence_background_not_dimmed",
          underlay,
          "The background remains too bright while sequential visual proof owns focus.",
          `media_opacity=${String(opacity ?? "unset")}`,
          `media_opacity <= ${contract.focus_underlay_max_opacity.toFixed(2)}`,
          `Set the underlay media_opacity to ${contract.focus_underlay_max_opacity.toFixed(2)} or lower for the proof interval.`,
        ));
      }
    }
  }

  return findings;
}
