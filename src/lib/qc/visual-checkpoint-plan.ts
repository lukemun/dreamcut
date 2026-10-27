const CHECKPOINT_SECTION = "## Visual checkpoint contract";
const CHECKPOINT_HEADER = [
  "Checkpoint",
  "Beat / seam",
  "Kind",
  "Arrive on",
  "Motion / action",
  "Stop / hold",
  "Must be visible",
  "Minimum timeline seconds",
  "Framing",
  "Cut rule",
] as const;

export type VisualCheckpointPlanRow = {
  id: string;
  kind: "stop" | "scroll-waypoint" | "contact" | "response" | "result" | "loading-change";
  requiredVisible: string[];
  minimumTimelineSeconds: number;
  framing: "full-desktop" | "target-centered";
};

function cells(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

export function parseVisualCheckpointPlan(plan: string): VisualCheckpointPlanRow[] {
  const start = plan.indexOf(CHECKPOINT_SECTION);
  if (start < 0) throw new Error(`Shooting script is missing ${CHECKPOINT_SECTION}`);
  const remainder = plan.slice(start + CHECKPOINT_SECTION.length);
  const nextSection = remainder.search(/^##\s+/m);
  const section = nextSection >= 0 ? remainder.slice(0, nextSection) : remainder;
  const rows = section.split(/\r?\n/).filter((line) => line.trim().startsWith("|"));
  if (rows.length < 3 || JSON.stringify(cells(rows[0])) !== JSON.stringify(CHECKPOINT_HEADER)) {
    throw new Error("Visual checkpoint contract is missing the required table columns");
  }
  const checkpointRows = rows.slice(2).map(cells);
  if (checkpointRows.length === 0) throw new Error("Visual checkpoint contract must contain at least one checkpoint");
  const ids = new Set<string>();
  const parsed: VisualCheckpointPlanRow[] = [];
  for (const [index, row] of checkpointRows.entries()) {
    if (row.length !== CHECKPOINT_HEADER.length || row.some((cell) => cell.length === 0)) {
      throw new Error(`Visual checkpoint row ${index + 1} must fill every column`);
    }
    if (!/^CP[A-Za-z0-9-]+$/.test(row[0])) {
      throw new Error(`Visual checkpoint row ${index + 1} has an invalid checkpoint id`);
    }
    if (ids.has(row[0])) throw new Error(`Visual checkpoint id is duplicated: ${row[0]}`);
    ids.add(row[0]);
    const kind = row[2];
    if (!["stop", "scroll-waypoint", "contact", "response", "result", "loading-change"].includes(kind)) {
      throw new Error(`Visual checkpoint ${row[0]} has an invalid kind`);
    }
    const minimumTimelineSeconds = Number(row[7]);
    if (!Number.isFinite(minimumTimelineSeconds) || minimumTimelineSeconds <= 0) {
      throw new Error(`Visual checkpoint ${row[0]} has an invalid minimum timeline duration`);
    }
    const framing = row[8];
    if (framing !== "full-desktop" && framing !== "target-centered") {
      throw new Error(`Visual checkpoint ${row[0]} has an invalid framing rule`);
    }
    parsed.push({
      id: row[0],
      kind: kind as VisualCheckpointPlanRow["kind"],
      requiredVisible: row[6].split(";").map((value) => value.trim()).filter(Boolean),
      minimumTimelineSeconds,
      framing,
    });
  }
  return parsed;
}

export function parseVisualCheckpointIds(plan: string): string[] {
  return parseVisualCheckpointPlan(plan).map((checkpoint) => checkpoint.id);
}
