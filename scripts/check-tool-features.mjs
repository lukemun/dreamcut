// Agent-usability contract for published tools; see mcp/feature-contract.mjs.
// `--freeze` writes the initial allowance and props baseline once; afterwards they only shrink.
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { queryCatalog } from "../mcp/capability-catalog.mjs";
import { featureCaseViolations, fieldContractViolations, toolFields } from "../mcp/feature-contract.mjs";

const run = spawnSync(process.execPath, ["mcp/server.mjs", "--catalog", "--all-tools", "--profile=full"], { encoding: "utf8", env: { ...process.env, DREAMCUT_TOOL_FAMILIES: "" } });
if (run.status !== 0) throw Error(`Could not read the tool catalog:\n${run.stderr}`);
const { tools } = JSON.parse(run.stdout);
const read = file => JSON.parse(fs.readFileSync(file, "utf8"));
const ALLOWANCE = "docs/tools/undescribed-fields.json", BASELINE = "docs/tools/proposal-props-baseline.json";
const { cases } = read("docs/tools/feature-cases.json");

if (process.argv.includes("--freeze")) {
  if (fs.existsSync(ALLOWANCE) || fs.existsSync(BASELINE)) throw Error("The baseline is already frozen; it may only shrink.");
  const covered = new Set(cases.map(feature => feature.field));
  const fields = toolFields(tools);
  fs.writeFileSync(ALLOWANCE, JSON.stringify({ about: "Frozen 2026-10-10. Undescribed agent-facing fields that predate the description rule. Describe a field to remove it; never add to this list.", fields: fields.filter(field => !field.described).map(field => field.id).sort() }, null, 2) + "\n");
  const prefix = "proposal.options[].operations[].props.";
  fs.writeFileSync(BASELINE, JSON.stringify({ about: "Frozen 2026-10-10. Proposal props that predate feature cases. A prop not listed here needs a case in feature-cases.json.", props: fields.filter(field => field.tool === "proposal_create" && field.path.startsWith(prefix) && !field.path.slice(prefix.length).match(/[.[]/) && !covered.has(field.path)).map(field => field.path.slice(prefix.length)).sort() }, null, 2) + "\n");
}

if (process.argv.includes("--prune")) {
  // Removes only entries that are now described or gone; the list never grows.
  const current = new Map(toolFields(tools).map(field => [field.id, field]));
  const allowance = read(ALLOWANCE);
  const kept = allowance.fields.filter(id => current.has(id) && !current.get(id).described);
  fs.writeFileSync(ALLOWANCE, JSON.stringify({ ...allowance, fields: kept }, null, 2) + "\n");
  console.log(`Pruned ${allowance.fields.length - kept.length} described or removed field(s) from the allowance.`);
}

const selection = { permitted: new Set(), enabled: new Set(), load: () => [] };
const search = query => queryCatalog({ action: "search", query, limit: 20 }, selection, []).entries;
const violations = [
  ...featureCaseViolations({ tools, cases, search }),
  ...fieldContractViolations({ tools, allowance: read(ALLOWANCE).fields, propsBaseline: read(BASELINE).props, cases }),
];
if (violations.length) {
  console.error(violations.join("\n"));
  throw Error(`${violations.length} agent-usability contract violation(s). See docs/standards/tool-authoring.md#agent-usable-features.`);
}
const fields = toolFields(tools);
console.log(`Agent-usable features: ${cases.length} feature case(s) pass; ${fields.filter(field => field.described).length} of ${fields.length} tool fields described (${read(ALLOWANCE).fields.length} legacy gaps remain).`);
