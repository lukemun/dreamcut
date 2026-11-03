// Read-only: which changed fields creators could not tune from the review card, across saved
// proposals. Each proposal records its own `control_gaps` when it is authored, so this works on
// project folders copied from another machine without rerunning today's dial rules.
//
//   pnpm control-gaps                     # this machine's projects
//   pnpm control-gaps --projects DIR      # an uploaded or copied projects folder
//   pnpm control-gaps --infer-legacy      # also apply today's rules to proposals with no record
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { projectsRoot } from "../src/lib/local-store/paths";
import { controlGaps } from "../src/lib/agent/timeline-editor-agent-apply";

type Gap = { operation_index: number; target: string; field: string; value_kind: string };
type Option = { id: string; control_gaps?: Gap[]; review_controls_origin?: string; operations?: Record<string, unknown>[] };

const { values } = parseArgs({ options: { projects: { type: "string" }, "infer-legacy": { type: "boolean" }, help: { type: "boolean" } } });
if (values.help) { console.log("pnpm control-gaps [--projects DIR] [--infer-legacy]"); process.exit(0); }
const root = path.resolve(values.projects ?? projectsRoot());

type Tally = Map<string, { field: string; value_kind: string; options: number; projects: Set<string>; example: string }>;
const byField: Tally = new Map(), inferred: Tally = new Map();
const tally = (into: Tally, gaps: Gap[], project: string, example: string) => {
  for (const gap of new Map(gaps.map(item => [item.field, item])).values()) {
    const entry = into.get(gap.field) ?? { field: gap.field, value_kind: gap.value_kind, options: 0, projects: new Set<string>(), example };
    entry.options++; entry.projects.add(project);
    into.set(gap.field, entry);
  }
};
const rows = (into: Tally) => [...into.values()].sort((a, b) => b.options - a.options).map(({ projects, ...entry }) => ({ ...entry, projects: projects.size }));
let proposals = 0, recorded = 0, options = 0;
const origins: Record<string, number> = {};
for (const project of fs.readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name)) {
  const dir = path.join(root, project, "proposals");
  if (!fs.existsSync(dir)) continue;
  for (const file of fs.readdirSync(dir).filter(name => name.endsWith(".json"))) {
    let record: { proposal_id?: string; proposal?: { options?: Option[] } };
    try { record = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")); } catch { continue; }
    const list = record.proposal?.options ?? [];
    if (!list.length) continue;
    proposals++;
    // Proposals authored before gap recording carry no record; they are counted, not guessed.
    const hasRecord = list.some(option => "control_gaps" in option || "review_controls_origin" in option);
    if (hasRecord) recorded++;
    const example = `${project}/${record.proposal_id ?? file}`;
    for (const option of list) {
      options++;
      origins[option.review_controls_origin ?? "unrecorded"] = (origins[option.review_controls_origin ?? "unrecorded"] ?? 0) + 1;
      if (hasRecord) tally(byField, option.control_gaps ?? [], project, example);
      else if (values["infer-legacy"]) tally(inferred, controlGaps(option.operations ?? []) as Gap[], project, example);
    }
  }
}
console.log(JSON.stringify({
  projects_root: root, proposals, proposals_with_gap_record: recorded, options, dial_origin: origins,
  gaps: rows(byField),
  // Today's rules applied to unrecorded proposals: an estimate, not what those creators saw.
  ...(values["infer-legacy"] ? { inferred_legacy_gaps: rows(inferred) } : {}),
}, null, 2));
