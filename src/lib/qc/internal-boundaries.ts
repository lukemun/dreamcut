export type InternalBoundaryElement = {
  id: string;
  source_url?: string | null;
  props: Record<string, unknown> | null;
};

export type InternalBoundaryFinding = {
  code: string;
  severity: "blocker";
  elementId?: string;
  message: string;
  measured: string;
  limit: string;
  source: string;
  remedy: string;
};

type BoundaryRole = "content" | "divider";
type BoundaryEntry = { key: string; interval_px: [number, number] };
type BoundaryContract = {
  id: string;
  canvas_height_px: number;
  tolerance_px: number;
  role: BoundaryRole;
  family: BoundaryEntry[];
  validation?: {
    status?: unknown;
    validated_source_url?: unknown;
    method?: unknown;
  };
};

const SOURCE = "Video compositing standard: one shared geometry contract for the complete internal-boundary family";

function blocker(
  code: string,
  element: InternalBoundaryElement | undefined,
  message: string,
  measured: string,
  limit: string,
  remedy: string,
): InternalBoundaryFinding {
  return { code, severity: "blocker", elementId: element?.id, message, measured, limit, source: SOURCE, remedy };
}

function parseContract(value: unknown): { contract?: BoundaryContract; error?: string } {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return { error: "internal_boundary_contract is not an object" };
  }
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== "string" || raw.id.length === 0) return { error: "contract id is missing" };
  if (!Number.isInteger(raw.canvas_height_px) || (raw.canvas_height_px as number) <= 0) {
    return { error: "canvas_height_px must be a positive integer" };
  }
  if (typeof raw.tolerance_px !== "number" || !Number.isFinite(raw.tolerance_px) || raw.tolerance_px < 0) {
    return { error: "tolerance_px must be a finite non-negative number" };
  }
  if (raw.role !== "content" && raw.role !== "divider") return { error: "role must be content or divider" };
  if (!Array.isArray(raw.family) || raw.family.length === 0) return { error: "family must contain every boundary" };

  const family: BoundaryEntry[] = [];
  const keys = new Set<string>();
  let previousEnd = -Infinity;
  for (const item of raw.family) {
    if (item == null || typeof item !== "object" || Array.isArray(item)) return { error: "family entry is not an object" };
    const entry = item as Record<string, unknown>;
    if (typeof entry.key !== "string" || entry.key.length === 0 || keys.has(entry.key)) {
      return { error: "family keys must be present and unique" };
    }
    if (!Array.isArray(entry.interval_px) || entry.interval_px.length !== 2) {
      return { error: `boundary ${entry.key} needs a two-value interval_px` };
    }
    const [start, end] = entry.interval_px;
    if (!Number.isInteger(start) || !Number.isInteger(end) || (start as number) < 0 || (end as number) <= (start as number)) {
      return { error: `boundary ${entry.key} has an invalid interval` };
    }
    if ((end as number) > (raw.canvas_height_px as number) || (start as number) < previousEnd) {
      return { error: `boundary ${entry.key} is outside the canvas or overlaps the preceding boundary` };
    }
    keys.add(entry.key);
    previousEnd = end as number;
    family.push({ key: entry.key, interval_px: [start as number, end as number] });
  }

  return {
    contract: {
      id: raw.id,
      canvas_height_px: raw.canvas_height_px as number,
      tolerance_px: raw.tolerance_px,
      role: raw.role,
      family,
      validation: raw.validation as BoundaryContract["validation"],
    },
  };
}

/**
 * Deterministic coordinate-contract gate for composited assets whose color rows and divider rows
 * share geometry. It is intentionally metadata-driven: the producer stamps the exact source URL,
 * and this gate prevents a partial boundary family or stale replacement asset from being written.
 * It does not inspect pixels and must not be presented as proof of source-image continuity; raster
 * producers need a separate luma/edge-structure comparison against their pre-repair source.
 */
export function checkInternalBoundaryContracts(elements: InternalBoundaryElement[]): InternalBoundaryFinding[] {
  const findings: InternalBoundaryFinding[] = [];
  const parsed: Array<{ element: InternalBoundaryElement; contract: BoundaryContract }> = [];

  for (const element of elements) {
    const geometryId = element.props?.color_edge_geometry_id;
    const rawContract = element.props?.internal_boundary_contract;
    if (rawContract == null) {
      if (typeof geometryId === "string" && geometryId.length > 0) {
        findings.push(blocker(
          "internal_boundary_contract_missing",
          element,
          "Element declares coupled color/divider geometry but has no executable boundary contract.",
          `color_edge_geometry_id=${geometryId}; internal_boundary_contract=missing`,
          "Every coupled asset must declare the complete boundary family.",
          "Add props.internal_boundary_contract with every divider interval before writing the timeline.",
        ));
      }
      continue;
    }

    const result = parseContract(rawContract);
    if (!result.contract) {
      findings.push(blocker(
        "internal_boundary_contract_invalid",
        element,
        "Internal-boundary metadata is malformed, so seam parity cannot be certified.",
        result.error ?? "invalid contract",
        "A valid id, canvas height, tolerance, role, and ordered complete family are required.",
        "Regenerate the contract from the compositing geometry and rerun pixel validation.",
      ));
      continue;
    }

    if (typeof geometryId === "string" && geometryId !== result.contract.id) {
      findings.push(blocker(
        "internal_boundary_contract_id_mismatch",
        element,
        "The legacy geometry id and executable contract id disagree.",
        `color_edge_geometry_id=${geometryId}; contract.id=${result.contract.id}`,
        "Both identifiers must name the same geometry family.",
        "Use one shared geometry id on the rendered content and divider assets.",
      ));
    }

    if (result.contract.role === "content") {
      const validation = result.contract.validation;
      if (validation?.status !== "passed" || validation.validated_source_url !== element.source_url) {
        findings.push(blocker(
          "internal_boundary_validation_stale",
          element,
          "Content asset lacks a current producer receipt for its boundary-coordinate contract.",
          `current=${element.source_url ?? "null"}; validated=${String(validation?.validated_source_url ?? "missing")}; status=${String(validation?.status ?? "missing")}`,
          "Boundary validation must target the exact source_url currently on the element.",
          "Validate every boundary coordinate and source-image structure, then stamp the current source URL and passed status.",
        ));
      }
    }
    parsed.push({ element, contract: result.contract });
  }

  const groups = new Map<string, Array<{ element: InternalBoundaryElement; contract: BoundaryContract }>>();
  for (const member of parsed) groups.set(member.contract.id, [...(groups.get(member.contract.id) ?? []), member]);

  for (const [id, members] of groups) {
    const divider = members.find((member) => member.contract.role === "divider");
    const contents = members.filter((member) => member.contract.role === "content");
    if (!divider || contents.length === 0) {
      findings.push(blocker(
        "internal_boundary_contract_incomplete",
        members[0]?.element,
        "Boundary contract is not represented by both divider and rendered-content assets.",
        `${id}: roles=${members.map((member) => member.contract.role).join(",")}`,
        "At least one divider and one content asset must share the contract.",
        "Stamp the same complete contract on the divider and every coupled content asset.",
      ));
      continue;
    }

    const canonical = divider.contract;
    const canonicalByKey = new Map(canonical.family.map((entry) => [entry.key, entry.interval_px]));
    for (const member of members) {
      const keys = member.contract.family.map((entry) => entry.key);
      const canonicalKeys = canonical.family.map((entry) => entry.key);
      if (member.contract.canvas_height_px !== canonical.canvas_height_px || keys.join("|") !== canonicalKeys.join("|")) {
        findings.push(blocker(
          "internal_boundary_family_mismatch",
          member.element,
          "A coupled asset declares a different or incomplete boundary family.",
          `canvas=${member.contract.canvas_height_px}; keys=${keys.join(",")}`,
          `canvas=${canonical.canvas_height_px}; keys=${canonicalKeys.join(",")}`,
          "Regenerate the asset and contract from the divider's complete geometry family.",
        ));
        continue;
      }

      const tolerance = Math.max(canonical.tolerance_px, member.contract.tolerance_px);
      for (const entry of member.contract.family) {
        const expected = canonicalByKey.get(entry.key)!;
        const delta = Math.max(
          Math.abs(entry.interval_px[0] - expected[0]),
          Math.abs(entry.interval_px[1] - expected[1]),
        );
        if (delta > tolerance) {
          findings.push(blocker(
            "internal_boundary_edge_mismatch",
            member.element,
            `Boundary ${entry.key} does not meet its divider edge.`,
            `content/divider interval=${entry.interval_px.join("-")}; expected=${expected.join("-")}; delta=${delta}px`,
            `delta <= ${tolerance}px for every boundary in the family`,
            "Use the shared boundary array to rebuild both the color strips and divider masks; validate every sibling edge.",
          ));
        }
      }
    }
  }

  return findings;
}
